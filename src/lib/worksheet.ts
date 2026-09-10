// Motor de la hoja de cálculo estilo SMath.
// Lógica pura (sin React): recibe las regiones de la hoja y devuelve, por cada
// región matemática, el LaTeX a renderizar y el resultado o error.
//
// Sintaxis de una región matemática (campo `src`):
//   - "nombre := expresión"        definición (no muestra resultado)
//   - "nombre := expresión ="      definición + muestra el resultado
//   - "expresión ="                solo evalúa y muestra
//   - "... = unidad"               convierte el resultado a esa unidad (chequeo
//                                  dimensional: mathjs lanza si es incoherente)
//
// Las dependencias entre regiones son implícitas por nombre de variable y se
// resuelven en orden de lectura: arriba→abajo, izquierda→derecha (como SMath).

import { create, all, type MathNode } from 'mathjs';
import { nuevoGuard, parseProgram, runFunction, runProgram, type ProgramContext } from './program';

const math = create(all, {});

// Unidad de la práctica local (Chile/LatAm). `kgf` ya viene en math.js
// (= 9.80665 N); las compuestas `kgf/cm²`, `tonf·m`, `tonf/m` se derivan solas.
// math.js `max`/`min` ya comparan unidades (vía larger/smaller), así que
// `max(2.5 tonf, 30 kN)` funciona sin envoltorios.
math.createUnit('tonf', { definition: '1000 kgf', aliases: ['tf'] });

// Funciones útiles de diseño, disponibles en cualquier hoja (como las unidades).
// Se mantienen puras y unit-aware: reciben cantidades con unidades y devuelven un
// número o una cantidad, para poder encadenarlas en las fórmulas empíricas de la
// norma. Nombres únicos (no chocan con builtins de math.js), por eso override:false.
math.import(
  {
    // β1 del bloque rectangular equivalente (ACI 318-25, Tabla 22.2.2.4.3).
    // Acepta f'c con unidad de tensión, o un número plano interpretado como MPa.
    beta1: function (fc: unknown) {
      const fcm = typeof fc === 'number' ? fc : math.number(fc as never, 'MPa');
      if (fcm <= 28) return 0.85;
      if (fcm >= 56) return 0.65;
      return 0.85 - (0.05 * (fcm - 28)) / 7;
    },
    // √f'c como una tensión en kgf/cm² (unidad de la práctica local): así los
    // coeficientes empíricos chilenos (0.53, 0.8, 2.1, 14, …) quedan coherentes.
    // Acepta f'c con unidad, o un número plano interpretado como kgf/cm².
    sqrtfc: function (fc: unknown) {
      const fck = typeof fc === 'number' ? fc : math.number(fc as never, 'kgf/cm^2');
      return math.unit(Math.sqrt(fck), 'kgf/cm^2');
    },
    // Factor φ de flexión (ACI 318-25, Tabla 21.2.2), interpolado en la transición.
    phiFlexion: function (et: unknown, ety: unknown) {
      const e = math.number(et as never);
      const ey = math.number(ety as never);
      if (e >= ey + 0.003) return 0.9;
      if (e <= ey) return 0.65;
      return 0.65 + (0.25 * (e - ey)) / 0.003;
    },
  },
  { override: false },
);

/**
 * Tope de iteraciones por región (anti-bucle-infinito; evita colgar la pestaña).
 * Cuenta las vueltas de todos los bucles y las llamadas a funciones de usuario
 * que desencadena la región, estén donde estén.
 *
 * Medido el 2026-09-10: la región más cara del corpus (el diagrama de
 * interacción de `muro-flexocompresion`) da 58.590; la siguiente, 2.812. Con
 * 500.000 hay un margen de 8,5× para una planilla más fina, y un bucle o una
 * recursión desbocados se cortan en un par de segundos.
 */
const MAX_ITERS = 500_000;

/**
 * Expresiones ya parseadas, por texto.
 *
 * `math.evaluate(expr, scope)` parsea la expresión CADA vez que se la llama, y
 * `program.ts` la invoca por sentencia y por vuelta de bucle: un bucle de mil
 * iteraciones reparseaba mil veces las mismas expresiones. Medido sobre
 * `muro-flexocompresion`, sus 28 regiones `program` costaban el 99 % del tiempo
 * de evaluar la hoja (4,3 s de 4,3 s; sin ellas, 30 ms).
 *
 * El árbol que devuelve `math.parse` no guarda estado entre evaluaciones —el
 * scope va como argumento—, así que reutilizarlo es seguro.
 */
const nodeCache = new Map<string, MathNode>();

/** Tope de la caché: una hoja tiene pocas expresiones distintas, pero al teclear se generan variantes. */
const NODE_CACHE_MAX = 5_000;

/** El árbol de una expresión, de la caché o recién parseado. */
function parsear(expr: string): MathNode {
  let node = nodeCache.get(expr);
  if (!node) {
    node = math.parse(expr) as MathNode;
    if (nodeCache.size >= NODE_CACHE_MAX) nodeCache.clear();
    nodeCache.set(expr, node);
  }
  return node;
}

/** Evalúa una expresión reutilizando su árbol ya parseado. */
function evalCached(expr: string, scope: Record<string, unknown>): unknown {
  const node = parsear(expr);
  copiarAntesDeEscribir(node, scope);
  return node.evaluate(scope);
}

/**
 * Parámetros de una llamada que todavía apuntan al valor del que llama. Una
 * matriz llega por referencia, así que se copian la primera vez que la función
 * escribe en ellos y no antes: copiar cada argumento en cada llamada se pagaría
 * en los bucles que llaman miles de veces a una función que solo lee.
 */
const prestados = new WeakMap<object, Set<string>>();

/**
 * Copia en el scope local la matriz que una asignación indexada va a modificar,
 * si esa matriz no es suya.
 *
 * El scope de un programa hereda del de la hoja por prototipo, y `A[1] = 99`
 * escribe DENTRO del objeto matriz, no en la variable: sin esta copia, un
 * programa o una función cambiaba la `A` de la hoja, y lo de más abajo leía la
 * versión alterada. Solo mira la raíz del árbol, que es donde va la asignación
 * de una sentencia de programa.
 */
function copiarAntesDeEscribir(node: MathNode, scope: Record<string, unknown>): void {
  const n = node as unknown as { type: string; index?: unknown; object?: { type: string; name?: string } };
  if (n.type !== 'AssignmentNode' || !n.index || n.object?.type !== 'SymbolNode') return;
  const nombre = n.object.name!;
  const pres = prestados.get(scope);
  const ajena = !Object.prototype.hasOwnProperty.call(scope, nombre) && nombre in scope;
  if (ajena || pres?.has(nombre)) {
    scope[nombre] = math.clone(scope[nombre] as never);
    pres?.delete(nombre);
  }
}

/**
 * El contexto de los programas. Uno solo para el módulo, porque las funciones de
 * usuario son closures que siguen vivos después de `evaluateSheet` —el esquema
 * los llama al resolver sus tokens— y tienen que encontrar un contador válido:
 * `evaluateSheet` lo renueva al empezar cada región, y `evalExpr` en cada token.
 */
const ctx: ProgramContext = {
  evaluate: (expr, s) => evalCached(expr, s),
  maxIters: MAX_ITERS,
  guard: nuevoGuard(),
};

/**
 * Nombres que no pueden ser variables: el scope es un objeto plano, y definir
 * `__proto__` o `toString` pisaba la maquinaria del propio objeto. Con
 * `__proto__` todas las regiones siguientes fallaban con un error de math.js que
 * no decía nada.
 */
function comprobarNombre(nombre: string): void {
  if (nombre in Object.prototype) {
    throw new Error(`El nombre «${nombre}» está reservado: usa otro para la variable`);
  }
}

export type RegionKind = 'math' | 'text' | 'program' | 'image';

export interface Region {
  id: string;
  kind: RegionKind;
  /** Posición en la hoja (px), ajustada a la cuadrícula. */
  x: number;
  y: number;
  /**
   * Texto crudo: expresión math.js o texto libre según `kind`. En una región
   * `image` es la fuente: una ruta del sitio (`/esquemas/x.svg`) o un data URI.
   */
  src: string;
  /** Solo `image`: tamaño mostrado en la hoja (px). Sin él, el natural. */
  w?: number;
  h?: number;
  /**
   * Salto de página forzado: al imprimir, esta región abre una A4 nueva. Es la
   * forma de que una sección de cálculo no quede partida donde el llenado
   * automático la corte (ver `paginacion.ts`).
   */
  pageBreak?: boolean;
}

export interface ParsedMath {
  /** Nombre de variable si la región define una (lado izquierdo de `:=`). */
  varName?: string;
  /** Expresión math.js a evaluar. */
  expr: string;
  /** true si hay un `=` final: mostrar el resultado en línea. */
  showResult: boolean;
  /** Unidad objetivo tras el `=` final (ej. "kN*m"). */
  targetUnit?: string;
}

export interface RegionResult {
  /** LaTeX completo de la región (definición + expresión + resultado). */
  tex?: string;
  /** Veredicto booleano de una comparación (true=✓, false=✗). Lo pinta MathRegion. */
  bool?: boolean;
  /** Firma de una función definida por una región de programa (ej. "f(x)"). */
  defined?: string;
  /** Mensaje de error (sintaxis, variable indefinida, unidad incoherente...). */
  error?: string;
  /**
   * Variable o función que esta región define, ya formateada para mostrar.
   * Lo consume el panel de inspección: recorriendo los resultados obtiene la
   * lista de variables de la hoja y, de paso, en qué región se define cada una.
   *
   * Va aquí y no en un segundo valor de retorno de `evaluateSheet` para no
   * cambiar su firma: `SheetResults` sigue siendo un Record por id de región y
   * `verify-planilla.mjs` y `planilla-engine.ts` no se enteran.
   */
  define?: { nombre: string; valor: string; esFuncion?: boolean };
  /**
   * Algo que no es un error pero conviene que el autor vea: hoy, una variable de
   * la hoja que tapa una unidad del mismo nombre (`s := 20 cm` y luego
   * `3 m/s`). No invalida el resultado ni cuenta en `verify:planillas`; el
   * canvas lo señala al margen y no sale en el papel.
   */
  aviso?: string;
  /**
   * Solo `image`: instantánea del scope en la posición de lectura de la región.
   * Es lo que consume el esquema paramétrico (`esquema.ts`): la imagen ve las
   * variables definidas más arriba/izquierda, igual que una región math.
   */
  scope?: Record<string, unknown>;
}

export type SheetResults = Record<string, RegionResult>;

const DEF_RE = /^\s*([\p{L}_][\p{L}\p{N}_]*)\s*:=\s*([\s\S]*)$/u;
// Último `=` de nivel superior que no forma parte de ==, <=, >=, != ni :=.
const TRAILING_EQ_RE = /^([\s\S]*[^:<>!=])=(?!=)([^=]*)$/;

/** Separa "nombre := expr = unidad" en sus partes. */
export function parseMathRegion(src: string): ParsedMath {
  let rest = src;
  let varName: string | undefined;

  const def = DEF_RE.exec(rest);
  if (def) {
    varName = def[1];
    rest = def[2];
  }

  let showResult = false;
  let targetUnit: string | undefined;
  const eq = TRAILING_EQ_RE.exec(rest);
  if (eq) {
    const tail = eq[2].trim();
    // Solo es un "=" de visualización si lo que sigue está vacío o parece una
    // unidad (identificadores combinados con * / ^ y dígitos), no una expresión.
    if (tail === '' || (/^[\p{L}\p{N}_*/^\s()-]*$/u.test(tail) && /\p{L}/u.test(tail))) {
      showResult = true;
      targetUnit = tail || undefined;
      rest = eq[1];
    }
  }

  return { varName, expr: rest.trim(), showResult, targetUnit };
}

/**
 * Convierte `\_x` escapado por mathjs.toTex() en subíndices reales `_{x}`.
 *
 * Captura la SECUENCIA completa de segmentos y la colapsa en un solo subíndice:
 * `V\_c\_max` → `V_{c,max}`. Reemplazar cada `\_x` por su cuenta daba
 * `V_{c}_{max}`, dos subíndices hermanos sobre el mismo átomo — sintaxis
 * inválida que KaTeX rechaza con «Double subscript» y que tiñe de rojo la
 * región entera. Se llega por aquí cuando el símbolo no está en el scope
 * (definido más abajo, o su región falló), así que un error se propagaba en
 * cascada a todo lo que usara esa variable.
 */
function fixSubscripts(tex: string): string {
  return tex.replace(/((?:\\_[\p{L}\p{N}]+)+)/gu, (seq) => {
    const partes = seq.split('\\_').filter(Boolean);
    return `_{${partes.join(',')}}`;
  });
}

/**
 * `10^{+5}` → `10^{5}`. La notación científica de mathjs.toTex() conserva el
 * signo del exponente positivo, que no se escribe. (En el lado del resultado no
 * pasa: `numToTex()` lo normaliza con parseInt.) Los negativos se preservan.
 */
function fixPlusExponent(tex: string): string {
  return tex.replace(/10\^\{\+(\d+)\}/g, '10^{$1}');
}

const GREEK = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota',
  'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau',
  'upsilon', 'phi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi',
  'Psi', 'Omega',
]);

/**
 * Abreviaturas que la práctica escribe cortas pero se leen como la griega.
 * `eps` va a `\varepsilon` y no a `\epsilon`: la deformación unitaria de ACI y
 * NCh es la epsilon redonda.
 */
const GREEK_ALIAS: Record<string, string> = {
  eps: 'varepsilon',
  lam: 'lambda',
};

/** La cabeza de un nombre, como comando LaTeX si es una griega. */
function cabezaTex(head: string): string {
  if (GREEK.has(head)) return `\\${head}`;
  // `hasOwn`: sin él, `toString` o `constructor` encontraban el método heredado
  // del objeto y lo volcaban al LaTeX como `\function toString() {…}`.
  const alias = Object.hasOwn(GREEK_ALIAS, head) ? GREEK_ALIAS[head] : undefined;
  return alias ? `\\${alias}` : head;
}

/**
 * LaTeX de un nombre — la única autoridad sobre cómo se dibuja un identificador
 * (variable o función): `alpha_s` → `\alpha_{s}`, `A_s_min` → `A_{s,min}`.
 *
 * Los segundos y siguientes segmentos se unen con COMA dentro de un ÚNICO
 * subíndice, y no con `_`. Un `_` crudo ahí dentro vuelve a ser un subíndice
 * para KaTeX: `A_{s_min}` se dibuja como `s` con subíndice `m` y un `in` suelto,
 * y con un segmento más (`v_pdelta_X_no`) es directamente un doble subíndice,
 * que es sintaxis inválida. El subíndice plano además es la convención de ACI y
 * AISC (`A_{s,min}`, `V_{c,max}`) y no crece en altura, así que no mueve los
 * cortes de página que calcula `paginacion.ts`.
 */
function nombreTex(name: string): string {
  const [head, ...rest] = name.split('_');
  const h = cabezaTex(head);
  return rest.length ? `${h}_{${rest.join(',')}}` : h;
}

/** Como `nombreTex`, con llaves para que sea seguro concatenar (evita `\cdotL`). */
function symbolTex(name: string): string {
  return `{${nombreTex(name)}}`;
}

/**
 * LaTeX de una expresión math.js. Los símbolos presentes en `vars` se
 * renderizan como variables (cursiva + subíndice); el resto usa el toTex por
 * defecto, que muestra en redonda las unidades reconocidas (kN, MPa...).
 * Lanza si la expresión no parsea.
 */
function exprToTex(expr: string, vars: ReadonlySet<string>): string {
  const tex = math.parse(expr).toTex({
    parenthesis: 'auto',
    handler: (node: { type: string; name?: string; value?: unknown }) => {
      if (node.type === 'SymbolNode' && node.name && vars.has(node.name)) {
        return symbolTex(node.name);
      }
      if (node.type === 'ConstantNode' && typeof node.value === 'string') {
        return textoTex(node.value);
      }
      return undefined;
    },
  });
  return fueraDeTexto(tex.trim(), (t) => fixPlusExponent(fixSubscripts(fixNombresDeFuncion(t))));
}

/**
 * Una cadena como texto de LaTeX: `\text{"…"}`, con los caracteres especiales
 * escapados.
 *
 * mathjs volcaba la cadena en modo matemático, y ahí nada es texto: los espacios
 * desaparecían, `_md` se volvía un subíndice, una tilde salía como acento suelto
 * (`aˊrea`) y un `%` abría un comentario que se comía el resto de la línea. Las
 * funciones del estilo de `gobierna`, que devuelven el nombre del estado límite
 * que manda, salían ilegibles; con un `&` o un `#`, directamente en rojo.
 */
function textoTex(s: string): string {
  const esc = s.replace(/[\\{}%&#_$^~]/g, (c) =>
    c === '\\'
      ? '\\textbackslash{}'
      : c === '^'
        ? '\\textasciicircum{}'
        : c === '~'
          ? '\\textasciitilde{}'
          : `\\${c}`,
  );
  return `\\text{"${esc}"}`;
}

/** Un `\text{…}` completo, con los escapes de `textoTex` dentro. */
const TEXTO_RE = /\\text\{(?:\\[a-zA-Z]+\{\}|\\.|[^{}\\])*\}/g;

/**
 * Aplica `fn` al LaTeX salvo a los `\text{…}`, que se reservan y se devuelven
 * intactos. Los arreglos de nombres reescriben `\_x` como subíndice, y dentro de
 * un texto ese `\_` es un guion bajo literal que tiene que quedarse como está.
 */
function fueraDeTexto(tex: string, fn: (t: string) => string): string {
  const reservados: string[] = [];
  // El marcador es un carácter de uso privado: no aparece en ningún LaTeX, y los
  // arreglos de nombres no lo reconocen como letra ni como dígito.
  const marcado = tex.replace(TEXTO_RE, (m) => `\uE000${reservados.push(m) - 1}\uE001`);
  return fn(marcado).replace(/\uE000(\d+)\uE001/g, (_m, i: string) => reservados[Number(i)]);
}

/**
 * Arregla los nombres de función, que no pasan por el `handler` de arriba.
 *
 * El handler solo intercepta `SymbolNode`; una llamada es un `FunctionNode` y
 * mathjs emite su nombre crudo dentro de `\mathrm{}`. Y `\mathrm` no desactiva
 * el modo matemático, así que el `_` sigue siendo un subíndice: `P_o_f(b)` sale
 * como `\mathrm{P_o_f}` y KaTeX lo rechaza por doble subíndice. Era la causa de
 * casi todas las regiones en rojo del corpus.
 *
 * Se hace por reescritura y no extendiendo el `handler` porque el handler tiene
 * que devolver el LaTeX de la llamada ENTERA, argumentos incluidos, lo que
 * obliga a recorrer el árbol de mathjs a mano.
 *
 * Solo toca los `\mathrm{}` que llevan `_`, y se aplica aquí dentro —antes de
 * que `resultToTex` añada valor y unidad—, así que no alcanza al `\mathrm{}` de
 * las unidades ni al de `matriz`.
 *
 * Sale por `symbolTex` y no por `nombreTex` para conservar las llaves: el
 * `\mathrm{}` que se sustituye puede venir pegado a un operador, y sin ellas
 * `\cdot` + `M_n` se lee como el comando inexistente `\cdotM`.
 */
function fixNombresDeFuncion(tex: string): string {
  return tex.replace(/\\mathrm\{([^{}]*_[^{}]*)\}/g, (m, nombre: string) =>
    nombre.includes('\\') ? m : symbolTex(nombre),
  );
}

/** Notación "2.0947e+5" → "2.0947\cdot 10^{5}". */
function numToTex(s: string): string {
  const m = /^(-?[\d.]+)e([+-]?\d+)$/i.exec(s);
  if (m) return `${m[1]}\\cdot 10^{${parseInt(m[2], 10)}}`;
  return s;
}

/**
 * Entradas de una matriz/array por encima de las cuales el resultado se resume
 * en vez de volcarse. Una región `program` con cabecera imprime su valor de
 * retorno, y un barrido (el diagrama de interacción P–M son 200 puntos) metería
 * 400 números en una sola región: revienta el alto del bloque, y con él la
 * paginación y el PDF. La variable queda íntegra en el scope; lo que se recorta
 * es la impresión.
 */
const MAX_ENTRADAS_TEX = 12;

/** Resumen `matriz 200\times2` para un valor que no cabe impreso. */
function matrizResumen(value: unknown): string | undefined {
  // Una cadena también tiene `size` (su largo), y el nombre del estado límite que
  // devuelve `gobierna` pasa de 12 caracteres sin ser una matriz.
  if (typeof value === 'string') return undefined;
  let dims: number[];
  try {
    dims = math.size(value as never).valueOf() as number[];
  } catch {
    return undefined;
  }
  if (!Array.isArray(dims) || dims.length === 0) return undefined;
  const entradas = dims.reduce((a, b) => a * b, 1);
  if (entradas <= MAX_ENTRADAS_TEX) return undefined;
  return `\\mathrm{matriz}\\;${dims.join('\\times')}`;
}

/** LaTeX del valor calculado: número (con exponente) + unidad en redonda. */
function resultToTex(value: unknown): string {
  if (typeof value === 'string') return textoTex(value);
  const resumen = matrizResumen(value);
  if (resumen) return resumen;
  const formatted = math.format(value, { precision: 5 });
  if (math.isUnit(value)) {
    const sp = formatted.indexOf(' ');
    if (sp !== -1) {
      const num = formatted.slice(0, sp);
      const unit = formatted.slice(sp + 1);
      return `${numToTex(num)}\\;\\mathrm{${unit.replace(/ /g, '\\,')}}`;
    }
  }
  return numToTex(formatted);
}

/**
 * Evalúa todas las regiones matemáticas de la hoja en orden de lectura
 * (y ascendente, luego x) con un scope compartido, y devuelve el LaTeX y
 * el resultado o error de cada una.
 */
export function evaluateSheet(regions: Region[]): SheetResults {
  const results: SheetResults = {};
  const scope: Record<string, unknown> = {};

  // `text` no se evalúa: no aporta ni consume variables. `image` tampoco evalúa,
  // pero participa del orden de lectura: captura el scope visible en su posición
  // para que un esquema paramétrico rotule con las variables definidas arriba.
  const ordered = regions
    .filter((r) => r.kind !== 'text')
    .sort((a, b) => a.y - b.y || a.x - b.x);

  for (const region of ordered) {
    // Cada región estrena contador: el tope es por región, y cubre todo lo que
    // ella desencadene —sus bucles y los de las funciones a las que llame—.
    ctx.guard = nuevoGuard();

    if (region.kind === 'image') {
      results[region.id] = { scope: { ...scope } };
      continue;
    }

    if (region.src.trim() === '') {
      results[region.id] = {};
      continue;
    }

    if (region.kind === 'program') {
      results[region.id] = evalProgramRegion(region.src, scope);
      continue;
    }

    const parsed = parseMathRegion(region.src);

    // LaTeX de la parte izquierda (definición + expresión), independiente de
    // que la evaluación tenga éxito: así una región con error se ve igual.
    const known = new Set(Object.keys(scope));
    let tex: string | undefined;
    try {
      const lhs = parsed.varName ? `${symbolTex(parsed.varName)}\\,{:=}\\,` : '';
      tex = lhs + (parsed.expr ? exprToTex(parsed.expr, known) : '');
    } catch {
      tex = undefined; // sintaxis inválida: la región mostrará el texto crudo
    }

    if (!parsed.expr) {
      results[region.id] = { tex, error: 'Falta la expresión' };
      continue;
    }

    let aviso: string | undefined;
    try {
      if (parsed.varName) comprobarNombre(parsed.varName);
      const node = parsear(parsed.expr);
      if (esAsignacion(node)) {
        throw new Error(
          'Para definir una variable usa «:=» (por ejemplo «x := 5»); un «=» al final solo muestra el resultado',
        );
      }
      aviso = avisoUnidadTapada(node, scope);
      let value = node.evaluate(scope);
      if (parsed.targetUnit) {
        if (!math.isUnit(value)) throw new Error(`El resultado no tiene unidades, no se puede convertir a ${parsed.targetUnit}`);
        value = value.to(parsed.targetUnit);
      }
      if (parsed.varName) scope[parsed.varName] = value;

      // Para el panel de inspección: qué define esta región, ya formateado.
      // `parsed.targetUnit` ya se aplicó arriba, así que el valor se muestra en
      // la unidad que pidió el autor y no en la interna de math.js.
      const define = parsed.varName
        ? { nombre: parsed.varName, valor: formatValor(value) }
        : undefined;

      const isBool = typeof value === 'boolean';
      if (isBool && parsed.showResult) {
        // `tex` es la comparación renderizada; el veredicto ✓/✗ lo pinta MathRegion.
        results[region.id] = { tex, bool: value as boolean, define, aviso };
      } else {
        if (!isBool && parsed.showResult && tex !== undefined) {
          tex += `=${resultToTex(value)}`;
        }
        results[region.id] = { tex, define, aviso };
      }
    } catch (err) {
      // Una definición que falla RETIRA la variable. Conservar la anterior hacía
      // que lo de abajo calculara con un valor que la hoja ya no dice: con
      // `a := 1` y luego `a := 1 kN + 2 m` en rojo, `b := a*10` daba 10 sin
      // quejarse. Así el error se propaga a todo lo que depende de ella.
      if (parsed.varName && Object.hasOwn(scope, parsed.varName)) delete scope[parsed.varName];
      results[region.id] = { tex, error: errMsg(err), aviso };
    }
  }

  return results;
}

/** ¿Es una asignación de math.js (`x = 5`, `f(x) = x^2`, `A[1] = 3`)? */
function esAsignacion(node: MathNode): boolean {
  return node.type === 'AssignmentNode' || node.type === 'FunctionAssignmentNode';
}

/** ¿Es `nombre` una unidad de math.js (con prefijo o sin él)? */
function esUnidad(nombre: string): boolean {
  try {
    return math.Unit.isValuelessUnit(nombre);
  } catch {
    return false;
  }
}

type NodoOp = { type: string; op?: string; fn?: string; implicit?: boolean; args?: MathNode[]; name?: string; content?: MathNode };

/** El símbolo de `u` o de `u^n`, si tiene nombre de unidad. */
function simboloDeUnidad(nodo: MathNode): string | undefined {
  const n = nodo as unknown as NodoOp;
  if (n.type === 'SymbolNode' && n.name && esUnidad(n.name)) return n.name;
  if (n.type === 'OperatorNode' && n.op === '^' && n.args) return simboloDeUnidad(n.args[0]);
  return undefined;
}

/**
 * ¿Es una cantidad escrita como literal: `10 kN`, `3 m/s`, `2 kN*m`?
 *
 * Un paréntesis corta la cadena a propósito: `(26 cm)/h` dice que la cantidad
 * termina en el paréntesis y que lo de detrás es otra cosa, que es la forma de
 * escribir «entre la variable `h`» sin que salte el aviso.
 */
function esCantidadLiteral(nodo: MathNode): boolean {
  const n = nodo as unknown as NodoOp;
  if (n.type !== 'OperatorNode' || !n.args || n.args.length !== 2) return false;
  const [izq, der] = n.args;
  if (!simboloDeUnidad(der)) return false;
  if (n.implicit && n.op === '*') return izq.type === 'ConstantNode';
  return (n.op === '*' || n.op === '/') && esCantidadLiteral(izq);
}

/**
 * Avisa si la expresión escribe una unidad cuyo nombre es a la vez una variable
 * de la hoja.
 *
 * math.js busca cada símbolo en el scope ANTES que entre las unidades, así que
 * con `s := 20 cm` definido, `3 m/s` deja de ser una velocidad y da `15` sin
 * unidades, y con `N := 500 kN`, `10 N` son 5 MN. No es un error —la expresión
 * es válida—, pero casi nunca es lo que se quería, y `s`, `N`, `h`, `t`, `m` o
 * `g` son nombres de variable muy comunes en cálculo estructural.
 *
 * Solo se mira la posición de unidad —detrás de un número (`10 N`) o
 * encadenada a una cantidad así (`3 m/s`)—: `b*h` o `L/h` con `h` definida es
 * lo que el autor quiere, y avisar ahí sería ruido en cada hoja.
 */
function avisoUnidadTapada(node: MathNode, scope: Record<string, unknown>): string | undefined {
  // Por nombre, cómo se escribe la variable sin ambigüedad en ese sitio.
  const tapadas = new Map<string, string>();
  node.traverse((nodo) => {
    const n = nodo as unknown as NodoOp;
    if (n.type !== 'OperatorNode' || !n.args || n.args.length !== 2) return;
    if (n.op !== '*' && n.op !== '/') return;
    const [izq, der] = n.args;
    const unidad = simboloDeUnidad(der);
    if (!unidad || !Object.hasOwn(scope, unidad) || tapadas.has(unidad)) return;
    if (n.implicit && n.op === '*') {
      if (izq.type === 'ConstantNode') tapadas.set(unidad, `con «*» delante (${izq.toString()}*${unidad})`);
    } else if (esCantidadLiteral(izq)) {
      tapadas.set(unidad, `con la cantidad entre paréntesis ((${izq.toString()})${n.op}${unidad})`);
    }
  });
  if (tapadas.size === 0) return undefined;
  return [...tapadas]
    .map(
      ([u, forma]) =>
        `«${u}» es una variable de la hoja (${formatValor(scope[u])}) y tapa la unidad del mismo ` +
        `nombre: aquí vale la variable. Si querías la unidad, cambia el nombre de la variable; ` +
        `si querías la variable, escríbela ${forma}.`,
    )
    .join(' ');
}

/**
 * Evalúa una región de programa. Si define una función (`f(x) := ...`) la
 * registra como closure en el scope compartido; si es un programa inline lo
 * ejecuta en una copia del scope (sus variables internas no contaminan la hoja)
 * y exporta su valor de retorno bajo el nombre de la cabecera, si lo hay.
 */
function evalProgramRegion(src: string, scope: Record<string, unknown>): RegionResult {
  // Como en una región math: si el programa que define un nombre falla, el
  // nombre se retira del scope en vez de dejar vivo su valor anterior.
  const retirar = (nombre: string | undefined) => {
    if (nombre && Object.hasOwn(scope, nombre)) delete scope[nombre];
  };

  let prog;
  try {
    prog = parseProgram(src);
  } catch (err) {
    retirar(/^\s*([\p{L}_][\p{L}\p{N}_]*)\s*(?:\([^)]*\))?\s*:=/u.exec(src)?.[1]);
    return { error: errMsg(err) };
  }

  try {
    if (prog.name) comprobarNombre(prog.name);
    prog.params?.forEach(comprobarNombre);
  } catch (err) {
    return { error: errMsg(err) };
  }

  if (prog.params && prog.name) {
    const { name, params, body } = prog;
    // El closure captura el scope vivo: ve las variables de la hoja al llamarse
    // (y permite recursión, pues `name` ya está en el scope).
    scope[name] = (...args: unknown[]) => {
      // Hereda del scope en vez de copiarlo: O(1) en lugar de O(nº variables),
      // y la semántica es la misma —se lee lo de la hoja, se escribe aquí, y
      // las variables internas no la contaminan.
      //
      // No es un detalle: estas funciones se llaman desde bucles anidados
      // (`c_de_Pn` itera 60 veces y en cada vuelta llama a `P_n`, que recorre
      // las capas), así que copiar el scope entero se pagaba decenas de miles
      // de veces por evaluación de la hoja.
      const local: Record<string, unknown> = Object.create(scope);
      params.forEach((p, i) => {
        local[p] = args[i];
      });
      // Los argumentos llegan por referencia: se copian si la función escribe
      // en ellos (ver `copiarAntesDeEscribir`).
      prestados.set(local, new Set(params));
      return runFunction(body, local, ctx);
    };
    const firma = `${name}(${params.join(', ')})`;
    return { defined: firma, define: { nombre: name, valor: firma, esFuncion: true } };
  }

  try {
    // Igual que en el closure de arriba: hereda del scope en vez de copiarlo.
    const value = runProgram(prog.body, Object.create(scope) as Record<string, unknown>, ctx);
    if (prog.name) scope[prog.name] = value;
    let tex: string | undefined;
    if (value !== undefined) {
      const lhs = prog.name ? `${symbolTex(prog.name)}=` : '';
      tex = lhs + resultToTex(value);
    }
    return {
      tex,
      define: prog.name ? { nombre: prog.name, valor: formatValor(value) } : undefined,
    };
  } catch (err) {
    retirar(prog.name);
    return { error: errMsg(err) };
  }
}

function errMsg(err: unknown): string {
  // La pila de JavaScript agotada, que el tope de profundidad no llegó a ver
  // (una recursión dentro de una función de math.js, por ejemplo).
  if (err instanceof RangeError && /call stack/i.test(err.message)) {
    return 'Recursión demasiado profunda: la pila de llamadas se agotó';
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Evalúa una expresión suelta contra un scope, sin mutarlo (la usa el esquema
 * paramétrico para resolver los tokens `{{expr}}` con el mismo motor y las
 * mismas unidades de la hoja).
 */
export function evalExpr(expr: string, scope: Record<string, unknown>): unknown {
  // Un token puede llamar a una función de usuario, que cuenta contra el tope:
  // que estrene contador, y no herede el de la última región de la hoja.
  ctx.guard = nuevoGuard();
  return math.evaluate(expr, { ...scope });
}

/** Número compacto para rótulos: 4 cifras significativas, sin cola de ceros. */
function numLabel(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const r = Number(n.toPrecision(4));
  if (r !== 0 && (Math.abs(r) >= 1e6 || Math.abs(r) < 1e-4)) return r.toExponential(2);
  return String(r);
}

/**
 * Coma decimal, que es la del castellano y la que publican los posts. Se
 * aplica solo aquí, en los rótulos de esquema: dentro de una expresión de la
 * hoja el punto es sintaxis y no se toca.
 */
function comaDecimal(s: string): string {
  return s.replace(/(\d)\.(\d)/g, '$1,$2');
}

/**
 * Valor como texto plano para un rótulo de esquema. Con `unidad`, convierte y
 * devuelve SOLO el número (el autor del SVG escribe la unidad con su propia
 * tipografía: cm², tonf·m); la conversión lanza si es dimensionalmente
 * incoherente, y ese error debe aflorar como token sin resolver. Sin `unidad`,
 * un número va a secas y una cantidad con unidad va como la formatea mathjs.
 *
 * Sale con coma decimal: en un mismo dibujo conviven valores calculados y
 * rótulos escritos a mano («H 600×300×138,5»), y verlos con separadores
 * distintos delata que unos los pone la hoja y otros el autor.
 */
export function formatValor(v: unknown, unidad?: string): string {
  if (unidad) return comaDecimal(numLabel(math.number(v as never, unidad as never)));
  if (math.isUnit(v)) return comaDecimal(math.format(v, { precision: 4 }));
  if (typeof v === 'number') return comaDecimal(numLabel(v));
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  return String(v);
}

/** Decimales de una coordenada cruda: sobra para un píxel, y no trae exponente. */
const SVG_DECIMALES = 3;

/** Un número apto para un atributo SVG, o lanza si no lo es. */
function numSvg(n: unknown): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new Error(`valor no finito para SVG: ${String(n)}`);
  }
  return String(Number(n.toFixed(SVG_DECIMALES)));
}

/**
 * Valor como geometría para un ATRIBUTO SVG (`{{expr:svg}}`), que es otra cosa
 * que un rótulo: acá el consumidor es el parser del navegador, no un lector.
 * Sale con PUNTO decimal, sin unidad y sin el redondeo a 4 cifras — la coma de
 * `formatValor` produce `width="211,4"`, que es SVG inválido y dibuja ancho cero.
 *
 * Una matriz Nx2 se vuelca como lista de puntos `x1,y1 x2,y2 …`, lista para el
 * `points` de un `<polyline>`: así una curva calculada (barrer el eje neutro y
 * mapear a píxeles en la hoja) entra al dibujo por un solo token.
 *
 * Es más estricto que `formatValor`, no menos, y a propósito: lanza —o sea, el
 * token cae en `faltantes` y `verify:planilla` falla— si el valor no es finito,
 * si llega con unidad sin convertir, o si no es un escalar ni una Nx2. Un `NaN`
 * en la coordenada 137 no lo ve ningún booleano: el navegador dibuja nada y el
 * PNG sale con la curva muda. El guard es lo único que lo caza.
 */
export function formatSvg(v: unknown, unidad?: string): string {
  if (unidad) return numSvg(math.number(v as never, unidad as never));
  if (math.isUnit(v)) {
    throw new Error('un atributo SVG no lleva unidad: convertila con `:unidad:svg`');
  }
  if (typeof v === 'number') return numSvg(v);

  const filas = math.isMatrix(v) ? (v.valueOf() as unknown[]) : v;
  if (!Array.isArray(filas)) throw new Error(`valor no dibujable: ${typeof v}`);
  if (filas.length === 0) throw new Error('lista de puntos vacía');
  return filas
    .map((fila) => {
      if (!Array.isArray(fila) || fila.length !== 2) {
        throw new Error('se esperaba una matriz Nx2 de puntos (x, y)');
      }
      return `${numSvg(fila[0])},${numSvg(fila[1])}`;
    })
    .join(' ');
}
