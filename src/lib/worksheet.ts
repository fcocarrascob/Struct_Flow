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
import {
  evaluarGrafico,
  type DatosGrafico,
  type EspecGrafico,
  type HerramientasGrafico,
} from './grafico';
import { TOKEN_RE, separarToken } from './token';
import {
  columna,
  encabezadoDe,
  esTextoForzado,
  idDeCelda,
  nombresPublicados,
  textoDeCelda,
  type DatosTabla,
  type EspecTabla,
  type ResultadoCelda,
} from './tabla';

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
    // Interpolación lineal en una tabla de norma: `interp(xs, ys, x)`. Con
    // unidades en cualquiera de los dos ejes. Fuera de la tabla es un ERROR, no el
    // valor del extremo: cuando la norma manda usar el extremo («para h/L ≤ 0,5 …»)
    // se escribe a la vista, `interp(xs, ys, min(max(x, 0.5), 1))`, y el dato que
    // se sale de la tabla sin que la norma lo prevea no pasa callado.
    interp: function (xs: unknown, ys: unknown, x: unknown) {
      const X = listaDeInterp(xs, 'xs');
      const Y = listaDeInterp(ys, 'ys');
      if (X.length !== Y.length) {
        throw new Error(`interp: xs tiene ${X.length} valores e ys ${Y.length}; tienen que ser del mismo largo`);
      }
      if (X.length < 2) throw new Error('interp: la tabla necesita al menos dos puntos');
      for (let i = 1; i < X.length; i++) {
        if (!math.larger(X[i] as never, X[i - 1] as never)) {
          throw new Error(`interp: xs tiene que ser estrictamente creciente, y el valor ${i + 1} no es mayor que el ${i}`);
        }
      }
      // Con NaN, ninguna comparación es verdadera y el bucle de abajo se pasa del final.
      if (esNoFinito(x)) throw new Error(`interp: x = ${formatValor(x)} no es un número finito`);
      const n = X.length - 1;
      if (math.smaller(x as never, X[0] as never) || math.larger(x as never, X[n] as never)) {
        throw new Error(
          `interp: x = ${formatValor(x)} está fuera de la tabla, que va de ${formatValor(X[0])} a ${formatValor(X[n])}; ` +
            `si la norma manda usar el extremo, acótalo a la vista: interp(xs, ys, min(max(x, ${formatValor(X[0]).replace(',', '.')}), ${formatValor(X[n]).replace(',', '.')}))`,
        );
      }
      for (let i = 0; i <= n; i++) if (math.equal(x as never, X[i] as never)) return Y[i];
      let i = 0;
      while (!math.smaller(x as never, X[i + 1] as never)) i++;
      const frac = math.divide(math.subtract(x as never, X[i] as never), math.subtract(X[i + 1] as never, X[i] as never));
      const t = math.isUnit(frac) ? math.number(frac as never, '' as never) : frac;
      return math.add(Y[i] as never, math.multiply(math.subtract(Y[i + 1] as never, Y[i] as never), t as never));
    },
  },
  { override: false },
);

/**
 * El sistema de unidades «auto» de math.js, con el que se elige cómo MOSTRAR
 * una cantidad sin convertir (`1*1 kN/m^2 =` → «1 kPa»).
 *
 * `Unit.parse` lo reescribe con cada unidad que analiza —un `= MPa`, un
 * `.to('kPa')`—, así que es estado global que se hereda de hoja en hoja: la
 * misma presión salía «1000 Pa» o «1 kPa» según qué se hubiera evaluado antes en
 * el proceso, y en el navegador, según qué planilla se abrió antes. Se guarda tal
 * como queda al crear el motor y se restaura al empezar cada hoja: dentro de ella
 * el orden de lectura sigue mandando, pero una hoja se muestra siempre igual.
 * Basta una copia superficial, porque `parse` reemplaza la entrada entera.
 */
/**
 * Un julio, para reconocer la dimensión fuerza × longitud. Se crea ANTES de
 * guardar el sistema «auto» de abajo: analizarlo lo toca.
 */
const JULIO = math.unit('J');

type SistemaDeUnidades = Record<string, unknown>;
const SISTEMA_AUTO = (math.Unit as unknown as { UNIT_SYSTEMS: { auto: SistemaDeUnidades } }).UNIT_SYSTEMS.auto;
const SISTEMA_AUTO_INICIAL: SistemaDeUnidades = { ...SISTEMA_AUTO };

function restaurarSistemaDeUnidades(): void {
  for (const k of Object.keys(SISTEMA_AUTO)) if (!Object.hasOwn(SISTEMA_AUTO_INICIAL, k)) delete SISTEMA_AUTO[k];
  Object.assign(SISTEMA_AUTO, SISTEMA_AUTO_INICIAL);
}

/** Los valores de un vector para `interp`: un array, una matriz de una fila o de una columna. */
function listaDeInterp(v: unknown, que: string): unknown[] {
  const a = math.isMatrix(v) ? (v.valueOf() as unknown[]) : v;
  if (!Array.isArray(a)) throw new Error(`interp: ${que} tiene que ser un vector`);
  if (a.every((e) => !Array.isArray(e))) return a;
  // Una columna de una matriz (`M[:, 2]`) llega como N×1; una fila, como 1×N.
  if (a.every((e) => Array.isArray(e) && e.length === 1)) return a.map((e) => (e as unknown[])[0]);
  if (a.length === 1 && Array.isArray(a[0])) return a[0] as unknown[];
  throw new Error(`interp: ${que} tiene que ser un vector, no una matriz`);
}

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
  return evaluarNodo(node, scope);
}

/**
 * Evalúa un árbol contra el scope, pero antes exige que cada nombre libre esté
 * definido. **Todo camino de evaluación de una expresión de la hoja pasa por
 * aquí**: la fórmula, cada sentencia de un programa, el gráfico y los tokens.
 *
 * math.js busca un símbolo en el scope, después entre sus constantes y después
 * entre las unidades, así que un nombre que la hoja no define no daba «Undefined
 * symbol»: `phi*Mn` multiplicaba por la razón áurea, `E*0.001` por el número de
 * Euler y `q*L^2/8` daba litros. Lo mismo cuando la definición existía pero
 * falló, porque se retira del scope. En una memoria de cálculo es siempre un
 * número falso, así que es un error.
 */
function evaluarNodo(node: MathNode, scope: Record<string, unknown>): unknown {
  for (const l of libresDe(node)) {
    if (l.nombre in scope) continue;
    if (l.que === 'constante') throw new Error(mensajeLibre(l));
    // Una unidad suelta: es variable que falta si la hoja la define en otro
    // sitio, o si no es una unidad que se escriba así a propósito.
    if (nombresDeLaHoja.has(l.nombre)) throw new Error(mensajeVariableSinValor(l.nombre));
    if (!UNIDADES_SUELTAS.has(l.nombre)) throw new Error(mensajeLibre(l));
  }
  return node.evaluate(scope);
}

/**
 * Unidades que una memoria escribe sueltas, fuera de una cantidad: `f_c/MPa`
 * para adimensionalizar, `(h/mm)^1.5*N` en una fórmula empírica, `2.54*cm`.
 * Medido sobre el corpus: son todas las que aparecen así.
 *
 * Cualquier otra unidad suelta y sin definir es casi siempre una variable que
 * falta —`L` (litro), `A` (amperio), `Es` (exasegundo), `h` (hora), `t`
 * (tonelada), `dA` (decíamperio)—, y se escribe detrás de un número si de
 * verdad se quiere la unidad (`1 L`).
 */
const UNIDADES_SUELTAS = new Set([
  'mm', 'cm', 'm', 'km',
  'N', 'kN', 'MN', 'kgf', 'tonf', 'tf', 'lbf', 'kip',
  'Pa', 'kPa', 'MPa', 'GPa', 'psi', 'ksi',
  'kg', 'deg', 'rad', 'inch', 'ft',
]);

/** Un símbolo que, sin definir, math.js resolvería por su cuenta. */
interface Libre {
  nombre: string;
  que: 'constante' | 'unidad';
}

/**
 * Constantes de math.js que se pueden usar sin definir: son lo que dicen ser en
 * cualquier memoria. `e` no está: en cálculo estructural es una excentricidad o
 * un espesor mucho antes que el número de Euler (`exp(1)` lo escribe sin
 * ambigüedad).
 */
const CONSTANTES_LIBRES = new Set(['pi', 'true', 'false', 'null', 'Infinity', 'NaN']);

/** Los libres de cada árbol: se calculan una vez, como el árbol mismo. */
const libresCache = new WeakMap<MathNode, Libre[]>();

/**
 * Los símbolos del árbol que no nombran una función llamada ni van en posición
 * de unidad (`10 kN`, `3 m/s`, `x to mm`) y que, si el scope no los tiene,
 * math.js leería como una constante o como una unidad.
 */
function libresDe(node: MathNode): Libre[] {
  let libres = libresCache.get(node);
  if (libres) return libres;
  const deUnidad = new Set(unidadesEnPosicion(node).map((u) => u.simbolo));
  libres = [];
  const vistos = new Set<string>();
  node.traverse((nodo, ruta) => {
    const n = nodo as unknown as NodoOp;
    if (n.type !== 'SymbolNode' || !n.name || ruta === 'fn' || deUnidad.has(nodo) || vistos.has(n.name)) return;
    const que = resolucionPropia(n.name);
    if (que) {
      vistos.add(n.name);
      libres!.push({ nombre: n.name, que });
    }
  });
  libresCache.set(node, libres);
  return libres;
}

/**
 * ¿Termina en una cantidad escrita? `res[1,1]*1 tonf` y `1.02*231.8 kgf` sí: la
 * unidad que las siga (`*m`, `/m`) sigue siendo parte de esa cantidad aunque el
 * árbol la cuelgue de toda la cadena.
 */
function terminaEnCantidad(nodo: MathNode): boolean {
  if (esCantidadLiteral(nodo)) return true;
  const n = nodo as unknown as NodoOp;
  return n.type === 'OperatorNode' && (n.op === '*' || n.op === '/') && n.args?.length === 2 && terminaEnCantidad(n.args[1]);
}

/** Un símbolo escrito en posición de unidad. */
interface EnPosicion {
  simbolo: MathNode;
  nombre: string;
  /**
   * Cómo se escribe la variable del mismo nombre en ese sitio sin ambigüedad;
   * ausente tras `to`, donde math.js solo admite una unidad.
   */
  forma?: string;
}

const enPosicionCache = new WeakMap<MathNode, EnPosicion[]>();

/**
 * Los símbolos que el árbol escribe en posición de unidad: detrás de un número
 * (`10 N`, `-2 m^2`), encadenados a una cantidad (`3 m/s`, `x*1 tonf*m`) o tras
 * `to`. **Es la única definición de «posición de unidad» del motor**: la usan el
 * detector de nombres libres (lo que va aquí es unidad y no variable que falta),
 * el aviso de la variable que tapa una unidad y la comprobación estática del
 * verificador. Con tres detectores, discrepaban.
 *
 * Un paréntesis corta la cadena a propósito: `(26 cm)/h` es la forma de escribir
 * «entre la variable `h`».
 */
function unidadesEnPosicion(node: MathNode): EnPosicion[] {
  let lista = enPosicionCache.get(node);
  if (lista) return lista;
  const out: EnPosicion[] = [];
  const marcar = (nodo: MathNode, forma: ((u: string) => string) | undefined): void => {
    const n = nodo as unknown as NodoOp;
    if (n.type === 'SymbolNode' && n.name) {
      // `2 phi` o `3 x` no son cantidades: solo un nombre de unidad está en posición de unidad.
      if (esUnidad(n.name) && !Object.hasOwn(math, n.name)) out.push({ simbolo: nodo, nombre: n.name, forma: forma?.(n.name) });
    }
    else if (n.type === 'OperatorNode' && n.op === '^' && n.args) marcar(n.args[0], forma);
    else if (n.type === 'ParenthesisNode' && n.content) marcar(n.content, forma);
    else if (n.type === 'OperatorNode' && (n.op === '*' || n.op === '/') && n.args?.length === 2) {
      n.args.forEach((a) => marcar(a, forma));
    }
  };
  node.traverse((nodo) => {
    const n = nodo as unknown as NodoOp;
    if (n.type !== 'OperatorNode' || !n.args || n.args.length !== 2) return;
    const [izq, der] = n.args;
    if (n.fn === 'to') {
      marcar(der, undefined);
    } else if (n.op === '*' || n.op === '/') {
      if (n.implicit && n.op === '*' && esNumeroEscrito(izq)) {
        marcar(der, (u) => `con «*» delante (${izq.toString()}*${u})`);
      } else if (terminaEnCantidad(izq)) {
        marcar(der, (u) => `con la cantidad entre paréntesis ((${izq.toString()})${n.op}${u})`);
      }
    }
  });
  lista = out;
  enPosicionCache.set(node, lista);
  return lista;
}

/**
 * Los nombres que USA una fórmula (`nombre := expr = unidad`, o una expresión
 * suelta): **el único lector de nombres** para quien necesita saber de qué
 * depende una fórmula sin evaluarla —las flechas de la obra, las entradas de una
 * hoja propia, `verificarSimbolos` de un módulo—.
 *
 * Lee el árbol de math.js, no el texto: una cadena (`"area útil"`) no nombra
 * nada, la unidad de conversión tras `=` tampoco, ni una unidad en posición de
 * unidad (`4 m`), ni el exponente de `2.04e6`, ni una función del motor. Sí
 * cuentan las funciones de usuario y las unidades sueltas (`f_c/MPa`): quien
 * lee decide, con lo que la hoja o la obra definen, si son suyas. Con la
 * sintaxis rota, cae a una lectura léxica del mismo alfabeto, para que una
 * fórmula a medio escribir no pierda sus flechas.
 */
export function simbolosDeFormula(src: string): string[] {
  const expr = parseMathRegion(src).expr;
  if (!expr) return [];
  let nodo: MathNode;
  try {
    nodo = parsear(expr);
  } catch {
    const sinTextos = expr
      .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
      .replace(/(?<![\p{L}\p{N}_])\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/gu, ' ');
    return [...new Set(sinTextos.match(/[\p{L}_][\p{L}\p{N}_]*/gu) ?? [])];
  }
  const deUnidad = new Set(unidadesEnPosicion(nodo).map((u) => u.simbolo));
  const nombres = new Set<string>();
  nodo.traverse((n, ruta) => {
    const s = n as unknown as NodoOp;
    if (s.type !== 'SymbolNode' || !s.name || deUnidad.has(n) || CONSTANTES_LIBRES.has(s.name)) return;
    if (ruta === 'fn' && Object.hasOwn(math, s.name)) return;
    nombres.add(s.name);
  });
  return [...nombres];
}

/**
 * Las unidades escritas en posición de unidad cuyo nombre la hoja usa también
 * como variable, en cualquier parte: la comprobación estática de
 * `verify:planilla`. Es más estricta que el aviso de la evaluación, que solo ve
 * la variable si ya está definida en ese punto: en una planilla publicada, que
 * `4 m` sea cuatro metros solo porque `m` se define más abajo es un número que
 * cambia al reordenar.
 */
export function unidadesTapadas(regions: Region[]): { id: string; nombre: string; frag: string }[] {
  const nombres = nombresDefinidos(regions);
  const formulas: { id: string; src: string }[] = [];
  for (const r of regions) {
    if (r.kind === 'math') formulas.push({ id: r.id, src: r.src });
    if (r.kind === 'table' && r.tabla) {
      for (const { f, c, src } of formulasDeTabla(r.tabla)) formulas.push({ id: idDeCelda(r.id, f, c), src });
    }
  }
  const out: { id: string; nombre: string; frag: string }[] = [];
  for (const { id, src } of formulas) {
    const expr = parseMathRegion(src).expr;
    if (!expr) continue;
    let nodo: MathNode;
    try {
      nodo = parsear(expr);
    } catch {
      continue; // la sintaxis la informa la evaluación
    }
    const vistos = new Set<string>();
    for (const u of unidadesEnPosicion(nodo)) {
      if (u.forma === undefined || !nombres.has(u.nombre) || vistos.has(u.nombre)) continue;
      vistos.add(u.nombre);
      out.push({ id, nombre: u.nombre, frag: expr.trim() });
    }
  }
  return out;
}

/** ¿Qué haría math.js con `nombre` si el scope no lo tiene? */
function resolucionPropia(nombre: string): Libre['que'] | undefined {
  if (CONSTANTES_LIBRES.has(nombre)) return undefined;
  if (Object.hasOwn(math, nombre)) {
    return typeof (math as unknown as Record<string, unknown>)[nombre] === 'function' ? undefined : 'constante';
  }
  return esUnidad(nombre) ? 'unidad' : undefined;
}

/**
 * Los nombres que un mensaje de error del motor declara sin definir: el
 * «Undefined symbol X» crudo de math.js y los dos mensajes propios de arriba.
 * Vive junto a los mensajes para que su redacción y su lectura no se separen;
 * lo usa la obra para saber qué nombre le falta a un nodo.
 */
export function nombresSinDefinir(mensaje: string): string[] {
  const nombres: string[] = [];
  for (const m of mensaje.matchAll(/Undefined symbol ([\p{L}_][\p{L}\p{N}_]*)/gu)) nombres.push(m[1]);
  for (const m of mensaje.matchAll(/«([^»]+)» (?:no está definida|es una variable de esta hoja)/g)) nombres.push(m[1]);
  return nombres;
}

function mensajeVariableSinValor(nombre: string): string {
  return (
    `«${nombre}» es una variable de esta hoja, pero aquí no tiene valor: se define más abajo o su definición ` +
    `tiene un error. math.js la leería como la unidad «${nombre}».`
  );
}

function mensajeLibre({ nombre, que }: Libre): string {
  if (que === 'constante') {
    const v = (math as unknown as Record<string, unknown>)[nombre];
    const cual = typeof v === 'number' ? ` (${numLabel(v).replace('.', ',')})` : '';
    return `«${nombre}» no está definida (o su definición tiene un error): math.js la leería como su constante ${nombre}${cual}. Defínela más arriba.`;
  }
  return (
    `«${nombre}» no está definida (o su definición tiene un error): math.js la leería como la unidad «${nombre}». ` +
    `Defínela más arriba; si querías la unidad, escríbela detrás de un número (1 ${nombre}).`
  );
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

export type RegionKind = 'math' | 'text' | 'program' | 'image' | 'plot' | 'table';

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
  /**
   * `false` deja la región **fuera del papel**: se evalúa igual, en su sitio del
   * orden de lectura, y lo que define sigue visible para lo de abajo y para los
   * tokens de un esquema — pero no sale en el documento de impresión ni en la
   * memoria exportada.
   *
   * Es para el **mapeo a píxeles de un esquema** (la escala, las funciones de
   * coordenadas, los colores por veredicto): cálculos que la figura necesita y
   * que un anexo de memoria no tiene por qué leer. Lo que vota o entra —una
   * entrada `in_*`, un veredicto `v_*`, una salida declarada— no se esconde;
   * `validarMeta` lo rechaza.
   */
  imprimir?: boolean;
  /**
   * Solo `plot`: qué dibuja y cómo (`grafico.ts`). En un gráfico `src` es el
   * TÍTULO que se imprime sobre la figura, y nunca está vacío: así un gráfico
   * no se confunde con un bloque a medio escribir.
   */
  grafico?: EspecGrafico;
  /**
   * Solo `table`: la grilla de celdas y lo que publica (`tabla.ts`). En una tabla
   * `src` es el TÍTULO que se imprime encima, y puede ir vacío.
   */
  tabla?: EspecTabla;
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
  define?: Define;
  /**
   * Solo `table`: todo lo que define la tabla, que puede ser más de un nombre —las
   * celdas de fórmula y lo que publica—, en orden de evaluación. Una región math o
   * de programa sigue usando `define`; para leer los dos, `definicionesDeResultado`.
   */
  defines?: Define[];
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
  /**
   * Solo `plot`: lo evaluado, en unidades de los ejes. El SVG lo arma
   * `svgDeGrafico` al pintar, igual en la hoja, en el papel y en Node.
   */
  grafico?: DatosGrafico;
  /**
   * Solo `table`: el resultado de cada celda, `tabla.celdas[f][c]`. Las celdas no
   * tienen id propio; su error vive aquí, y `error` de la región es el de lo que la
   * tabla publica.
   */
  tabla?: DatosTabla;
}

/** Un nombre que define una región, ya formateado para mostrar. */
export interface Define {
  nombre: string;
  valor: string;
  esFuncion?: boolean;
}

export type SheetResults = Record<string, RegionResult>;

/**
 * Todo lo que define una región: su `define`, o los `defines` de una tabla. Es la
 * única forma de leerlo; con cada consumidor mirando un campo, una tabla sería
 * invisible para el que se olvidara del segundo.
 */
export function definicionesDeResultado(res: RegionResult | undefined): Define[] {
  if (!res) return [];
  return res.defines ?? (res.define ? [res.define] : []);
}

/** Todos los errores de una región: el suyo y, en una tabla, los de sus celdas. */
export function erroresDeResultado(res: RegionResult | undefined): string[] {
  if (!res) return [];
  const celdas = (res.tabla?.celdas ?? []).flat().flatMap((x) => (x.error ? [x.error] : []));
  return res.error ? [res.error, ...celdas] : celdas;
}

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
/** Una unidad de la lista de un `Unit` de math.js. */
type UnidadDeLista = { unit: { name: string; base?: { key: string } }; prefix: { name: string }; power: number };

/**
 * Cómo se muestra un valor que no se convirtió con `= unidad`.
 *
 * math.js simplifica al mostrar, y fuerza × longitud tiene la dimensión de una
 * energía: un momento escrito `k*1 tonf*m` se imprimía «29,42 kJ». En una
 * memoria estructural eso es siempre un momento, así que se muestra con la
 * fuerza y la longitud que escribió el autor —la primera de cada una en su
 * lista de unidades, con su prefijo—, o en kN·m si no escribió ninguna. No pasa
 * por `Unit.parse`, que tocaría el sistema «auto»: se arma la lista a mano, y el
 * valor, que math.js guarda en SI, no cambia.
 */
function paraMostrar(v: unknown): unknown {
  if (!math.isUnit(v)) return v;
  const u = v as unknown as { value: number | null; skipAutomaticSimplification: boolean; units: UnidadDeLista[]; equalBase(o: unknown): boolean; clone(): typeof u; fixPrefix: boolean };
  if (u.value === null || u.skipAutomaticSimplification || !u.equalBase(JULIO)) return v;
  const de = (base: string, nombre: string, prefijo: string): UnidadDeLista => {
    const hallada = u.units.find((x) => x.unit.base?.key === base && x.power > 0);
    if (hallada) return { unit: hallada.unit, prefix: hallada.prefix, power: 1 };
    const unidad = (math.Unit as unknown as { UNITS: Record<string, UnidadDeLista['unit'] & { prefixes: Record<string, UnidadDeLista['prefix']> }> }).UNITS[nombre];
    return { unit: unidad, prefix: unidad.prefixes[prefijo], power: 1 };
  };
  const m = u.clone();
  m.units = [de('FORCE', 'N', 'k'), de('LENGTH', 'm', '')];
  m.skipAutomaticSimplification = true;
  m.fixPrefix = true;
  return m;
}

function resultToTex(value: unknown): string {
  if (typeof value === 'string') return textoTex(value);
  const resumen = matrizResumen(value);
  if (resumen) return resumen;
  value = paraMostrar(value);
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
 *
 * `scopeInicial` son variables que la hoja ve ya definidas, como si estuvieran
 * escritas encima de la primera región. Lo usa el canvas de una obra
 * (`src/proyecto/obra/evaluacion.ts`) para encadenar cálculos: lo que publica
 * una planilla entra así en los nodos de aguas abajo, con su objeto `Unit`
 * intacto — serializarlo a texto y volver a parsearlo perdería cifras.
 *
 * Se COPIA, no se usa el objeto de quien llama: el canvas lo va acumulando
 * tramo a tramo, y escribir dentro filtraría las variables de un nodo a los de
 * aguas arriba, con lo que el orden de lectura dejaría de significar nada.
 */
export function evaluateSheet(
  regions: Region[],
  scopeInicial: Record<string, unknown> = {},
): SheetResults {
  const results: SheetResults = {};
  const scope: Record<string, unknown> = { ...scopeInicial };

  // `text` no se evalúa: no aporta ni consume variables. `image` tampoco evalúa,
  // pero participa del orden de lectura: captura el scope visible en su posición
  // para que un esquema paramétrico rotule con las variables definidas arriba.
  const ordered = regions
    .filter((r) => r.kind !== 'text')
    .sort((a, b) => a.y - b.y || a.x - b.x);

  nombresDeLaHoja = nombresDefinidos(ordered);
  restaurarSistemaDeUnidades();
  try {
    evaluarEnOrden(ordered, scope, results);
  } finally {
    nombresDeLaHoja = new Set();
  }
  return results;
}

/**
 * Los nombres que la hoja define en alguna parte: los lee `evaluarNodo` para
 * saber que una unidad sin valor en el scope es, en esta hoja, una variable que
 * falta —definida más abajo, o retirada porque su definición falló—.
 */
let nombresDeLaHoja = new Set<string>();

/** Lo que define cada región, sin evaluarla. */
function nombresDefinidos(regions: Region[]): Set<string> {
  const nombres = new Set<string>();
  for (const r of regions) {
    if (r.kind === 'math') {
      const n = parseMathRegion(r.src).varName;
      if (n) nombres.add(n);
    } else if (r.kind === 'program') {
      const n = RE_CABECERA_PROGRAMA.exec(r.src)?.[1];
      if (n) nombres.add(n);
    } else if (r.kind === 'table' && r.tabla) {
      for (const f of formulasDeTabla(r.tabla)) if (f.varName) nombres.add(f.varName);
      for (const n of nombresPublicados(r.tabla)) nombres.add(n);
    }
  }
  return nombres;
}

/** El nombre de la cabecera de un programa: `nombre :=` o `nombre(a, b) :=`. */
const RE_CABECERA_PROGRAMA = /^\s*([\p{L}_][\p{L}\p{N}_]*)\s*(?:\([^)]*\))?\s*:=/u;

/** Lo que exporta un programa, sin analizar su cuerpo: el nombre de su cabecera. */
export function nombreDePrograma(src: string): string | undefined {
  return RE_CABECERA_PROGRAMA.exec(src)?.[1];
}

function evaluarEnOrden(ordered: Region[], scope: Record<string, unknown>, results: SheetResults): void {
  for (const region of ordered) {
    // Cada región estrena contador: el tope es por región, y cubre todo lo que
    // ella desencadene —sus bucles y los de las funciones a las que llame—.
    ctx.guard = nuevoGuard();

    if (region.kind === 'image') {
      results[region.id] = { scope: { ...scope } };
      continue;
    }

    // Antes que la rama del `src` vacío: en un gráfico `src` es el título, y lo
    // que se evalúa es su especificación. No escribe en el scope.
    if (region.kind === 'plot') {
      results[region.id] = region.grafico
        ? evaluarGrafico(region.grafico, scope, HERRAMIENTAS_GRAFICO)
        : { error: 'El gráfico no tiene especificación' };
      continue;
    }

    // Igual que un gráfico: `src` es el título y el contenido está en `tabla`.
    // A diferencia de él, SÍ escribe en el scope: sus celdas y lo que publica.
    if (region.kind === 'table') {
      results[region.id] = region.tabla ? evaluarTabla(region.tabla, scope) : { error: 'La tabla no tiene especificación' };
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

    results[region.id] = evaluarFormula(region.src, scope).res;
  }
}

/** Lo que da una fórmula: lo que se muestra y, si llegó a evaluarse, su valor. */
interface Formula {
  res: RegionResult;
  /** El valor calculado (el definido o el mostrado); ausente si hubo error. */
  valor?: unknown;
  evaluada: boolean;
}

/**
 * Evalúa una fórmula —`nombre := expr`, `expr =`, `… = unidad`— contra el scope
 * compartido, y escribe en él lo que define.
 *
 * **Es la única gramática de una fórmula.** La usan la región math y cada celda
 * de fórmula de una tabla: si la celda tuviera la suya, las dos acabarían
 * discrepando en lo que es una definición, en cómo se convierte una unidad o en
 * qué se retira cuando algo falla.
 *
 * `unidadColumna` es la unidad de la columna de una celda: hace de `= unidad`
 * cuando la fórmula no escribe el suyo, salvo para un veredicto o un texto. Una
 * región math nunca la pasa.
 */
function evaluarFormula(src: string, scope: Record<string, unknown>, unidadColumna?: string): Formula {
  const parsed = parseMathRegion(src);

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
    return { res: { tex, error: 'Falta la expresión' }, evaluada: false };
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
    let value = evaluarNodo(node, scope);
    comprobarValor(value);
    if (typeof value === 'boolean') comprobarComparacion(node, scope);
    const destino =
      parsed.targetUnit ??
      (unidadColumna && typeof value !== 'boolean' && typeof value !== 'string' ? unidadColumna : undefined);
    if (destino) {
      if (!math.isUnit(value)) throw new Error(`El resultado no tiene unidades, no se puede convertir a ${destino}`);
      value = value.to(destino);
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
      return { res: { tex, bool: value as boolean, define, aviso }, valor: value, evaluada: true };
    }
    if (!isBool && parsed.showResult && tex !== undefined) {
      tex += `=${resultToTex(value)}`;
    }
    return { res: { tex, define, aviso }, valor: value, evaluada: true };
  } catch (err) {
    // Una definición que falla RETIRA la variable. Conservar la anterior hacía
    // que lo de abajo calculara con un valor que la hoja ya no dice: con
    // `a := 1` y luego `a := 1 kN + 2 m` en rojo, `b := a*10` daba 10 sin
    // quejarse. Así el error se propaga a todo lo que depende de ella.
    if (parsed.varName && Object.hasOwn(scope, parsed.varName)) delete scope[parsed.varName];
    return { res: { tex, error: errMsg(err), aviso }, evaluada: false };
  }
}

/**
 * Evalúa una tabla fila a fila, en su posición del orden de lectura, y publica
 * lo que declara. Cada celda de fórmula pasa por `evaluarFormula`.
 *
 * El tope de iteraciones es el de la región —la tabla entera—, que
 * `evaluateSheet` estrena antes de llamarla. Con uno por celda, una tabla de
 * 60×12 que llama una función cara podía gastar 720 veces el tope de una región.
 */
function evaluarTabla(t: EspecTabla, scope: Record<string, unknown>): RegionResult {
  const enc = encabezadoDe(t);
  const defines: Define[] = [];
  const avisos: string[] = [];
  const definidosEnCeldas = new Set<string>();
  /** El valor de cada celda de cuerpo, o por qué no lo tiene. */
  const valores: ({ v: unknown } | { motivo: string })[][] = [];

  const celdas = t.celdas.map((fila, f) =>
    fila.map((src, c): ResultadoCelda => {
      const cuerpo = f >= enc;
      const col = columna(t, c);
      const unidad = (cuerpo && col.unidad?.trim()) || undefined;
      // Con encabezado, la unidad se imprime allí y la celda lleva el número solo.
      const unidadArriba = enc > 0 ? unidad : undefined;
      const { res, valor } = evaluarCelda(src, scope, unidad, unidadArriba, cuerpo && Boolean(col.soloValor));
      for (const d of res.defines ?? []) {
        defines.push(d);
        definidosEnCeldas.add(d.nombre);
      }
      if (res.celda.aviso) avisos.push(`[${f + 1},${c + 1}] ${res.celda.aviso}`);
      if (cuerpo) {
        (valores[f - enc] ??= [])[c] =
          valor !== undefined
            ? { v: valor }
            : {
                motivo:
                  res.celda.tipo === 'vacia'
                    ? 'está vacía'
                    : res.celda.tipo === 'texto'
                      ? 'es texto'
                      : res.celda.error
                        ? 'tiene un error'
                        : 'no tiene valor',
              };
      }
      return res.celda;
    }),
  );

  // ── Lo que publica: la matriz del cuerpo y cada columna con nombre ────────────
  const pedidos: { nombre: string; cols: number[]; vector: boolean }[] = [];
  const todas = Array.from({ length: t.celdas[0]?.length ?? 0 }, (_, c) => c);
  if (t.matriz?.trim()) pedidos.push({ nombre: t.matriz.trim(), cols: todas, vector: false });
  (t.columnas ?? []).forEach((col, c) => {
    if (col.nombre?.trim()) pedidos.push({ nombre: col.nombre.trim(), cols: [c], vector: true });
  });

  const errores: string[] = [];
  const publicados = new Set<string>();
  for (const { nombre, cols, vector } of pedidos) {
    try {
      if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(nombre)) throw new Error(`«${nombre}» no es un nombre válido`);
      comprobarNombre(nombre);
      if (definidosEnCeldas.has(nombre)) throw new Error(`«${nombre}» ya lo define una celda de la tabla`);
      if (publicados.has(nombre)) throw new Error(`«${nombre}» se publica dos veces`);
      if (valores.length === 0) throw new Error(`«${nombre}»: la tabla no tiene filas de cuerpo que publicar`);
      const filas = valores.map((fila, i) =>
        cols.map((c) => {
          const x = fila[c];
          const donde = `la celda de la fila ${i + enc + 1}, columna ${c + 1}`;
          if (!x || 'motivo' in x) throw new Error(`«${nombre}»: ${donde} ${x ? x.motivo : 'está vacía'}`);
          if (!esNumerico(x.v)) throw new Error(`«${nombre}»: ${donde} no es un número`);
          return x.v;
        }),
      );
      // Cada columna en una sola dimensión. Entre columnas no se exige: una serie
      // x–y publicada como matriz N×2 lleva metros en una y kN en la otra.
      cols.forEach((c, k) => {
        const dims = new Set(filas.map((fila) => dimensionDe(fila[k])));
        if (dims.size > 1) {
          avisos.push(
            `«${nombre}»: la columna ${c + 1} mezcla dimensiones (${[...dims].join(', ')}); ` +
              `fallará al operar con ella.`,
          );
        }
      });
      const valor = math.matrix((vector ? filas.map((f) => f[0]) : filas) as never);
      scope[nombre] = valor;
      publicados.add(nombre);
      defines.push({ nombre, valor: resumenDeForma(valor) });
    } catch (err) {
      // Como una definición que falla: el nombre se retira, y lo de abajo que lo
      // usa da error en vez de leer un valor anterior.
      if (Object.hasOwn(scope, nombre) && !definidosEnCeldas.has(nombre)) delete scope[nombre];
      errores.push(errMsg(err));
    }
  }

  const unidades = todas.map((c) => {
    const u = columna(t, c).unidad?.trim();
    return enc > 0 && u ? unidadTex(u) : undefined;
  });
  return {
    tabla: { celdas, unidades },
    defines,
    ...(errores.length ? { error: errores.join(' · ') } : {}),
    ...(avisos.length ? { aviso: avisos.join(' ') } : {}),
  };
}

/** Una celda evaluada: lo que se imprime, lo que define y su valor (si lo tiene). */
function evaluarCelda(
  src: string,
  scope: Record<string, unknown>,
  unidad: string | undefined,
  unidadArriba: string | undefined,
  soloValor: boolean,
): { res: { celda: ResultadoCelda; defines?: Define[] }; valor?: unknown } {
  if (!src.trim()) return { res: { celda: { tipo: 'vacia' } } };
  if (esTextoForzado(src)) return { res: { celda: { tipo: 'texto', texto: textoDeCelda(src) } } };
  const aviso = avisoTextoNumerico(src);
  const texto = { res: { celda: { tipo: 'texto' as const, texto: textoDeCelda(src), ...(aviso ? { aviso } : {}) } } };

  if (esFormulaDeCelda(src)) {
    const fo = evaluarFormula(src, scope, unidad);
    const celda: ResultadoCelda = { tipo: 'formula' };
    // Las mismas claves que la región, y solo si están: así una celda y una región
    // con el mismo `src` son comparables campo a campo (`verify:motor`).
    for (const k of ['tex', 'bool', 'error', 'aviso'] as const) {
      if (fo.res[k] !== undefined) (celda as unknown as Record<string, unknown>)[k] = fo.res[k];
    }
    if (soloValor && fo.evaluada) {
      if (typeof fo.valor === 'boolean') delete celda.tex;
      else celda.tex = valorTex(fo.valor, unidadArriba);
    }
    return { res: { celda, defines: fo.res.define ? [fo.res.define] : undefined }, valor: fo.valor };
  }

  let nodo: MathNode;
  try {
    nodo = parsear(src.trim());
  } catch {
    return texto;
  }
  if (!esLiteral(nodo)) return texto;
  try {
    // Contra un scope vacío: en un valor escrito, `3 m` son tres metros aunque la
    // hoja tenga una variable `m`. No es una expresión, es un dato.
    let v = nodo.evaluate({});
    if (unidad) {
      if (typeof v === 'number') v = math.unit(v, unidad);
      else if (math.isUnit(v)) v = v.to(unidad);
    }
    return { res: { celda: { tipo: 'literal', tex: valorTex(v, unidadArriba) } }, valor: v };
  } catch (err) {
    return { res: { celda: { tipo: 'literal', tex: exprToTex(src.trim(), new Set()), error: errMsg(err) } } };
  }
}

/**
 * Una celda que parece un número y se lee como texto: `0,5` con coma decimal o
 * `50%`. Se imprime igual que un número, así que nadie lo nota hasta que la
 * columna se publica —o nunca, si no se publica—. El texto a propósito se
 * escribe con `'` delante y no se avisa.
 */
function avisoTextoNumerico(src: string): string | undefined {
  const s = src.trim();
  if (/^[-+]?\d*,\d+(\s*\p{L}[\p{L}\p{N}_*/^()\s-]*)?$/u.test(s)) {
    return (
      `«${s}» se lee como texto: la coma decimal se escribe con punto (${s.replace(',', '.')}). ` +
      `Si es texto a propósito, empieza la celda con '.`
    );
  }
  const pct = /^([-+]?\d+(?:[.,]\d+)?)\s*%$/.exec(s);
  if (pct) {
    const fraccion = Number(pct[1].replace(',', '.')) / 100;
    return `«${s}» se lee como texto: escribe la fracción (${fraccion}). Si es texto a propósito, empieza la celda con '.`;
  }
  return undefined;
}

/**
 * ¿Es una celda de fórmula? Lleva `:=` o un `=` final y no empieza con `'`.
 *
 * Es la única autoridad: la usan la evaluación y quienes leen qué define o qué
 * usa una tabla sin evaluarla (la obra, `verificarSimbolos`, `verify:planilla`).
 */
export function esFormulaDeCelda(src: string): boolean {
  if (!src.trim() || esTextoForzado(src)) return false;
  const p = parseMathRegion(src);
  return Boolean(p.varName || p.showResult);
}

/** Las celdas de fórmula de una tabla, fila a fila: lo que define y lo que usa. */
export function formulasDeTabla(t: EspecTabla): { f: number; c: number; src: string; varName?: string }[] {
  const out: { f: number; c: number; src: string; varName?: string }[] = [];
  t.celdas.forEach((fila, f) =>
    fila.forEach((src, c) => {
      if (esFormulaDeCelda(src)) out.push({ f, c, src, varName: parseMathRegion(src).varName });
    }),
  );
  return out;
}

/** ¿Es un valor escrito: `-0.9`, `3 m`, `2 kN*m`? Un número, con signo, o una cantidad literal. */
function esLiteral(nodo: MathNode): boolean {
  const n = nodo as unknown as NodoOp & { value?: unknown };
  if (n.type === 'ConstantNode') return typeof n.value === 'number';
  if (n.type === 'OperatorNode' && (n.fn === 'unaryMinus' || n.fn === 'unaryPlus') && n.args?.length === 1) {
    return esLiteral(n.args[0]);
  }
  return esCantidadLiteral(nodo);
}

/** La dimensión de un valor de celda, para compararla: «sin unidad» o las unidades base en SI. */
function dimensionDe(v: unknown): string {
  if (!math.isUnit(v)) return 'sin unidad';
  const u = v as unknown as { toSI(): { formatUnits(): string } };
  return u.toSI().formatUnits() || 'sin unidad';
}

/** ¿Se puede poner en una matriz numérica? */
function esNumerico(v: unknown): boolean {
  return (
    typeof v === 'number' ||
    math.isBigNumber(v) ||
    math.isFraction(v) ||
    (math.isUnit(v) && !esComplejo(v))
  );
}

/** El LaTeX de un valor; con `unidadArriba`, el número solo, en esa unidad. */
function valorTex(v: unknown, unidadArriba: string | undefined): string {
  if (unidadArriba && math.isUnit(v)) {
    return numToTex(math.format(math.number(v as never, unidadArriba as never), { precision: 5 }));
  }
  return resultToTex(v);
}

/** Una unidad escrita en mathjs, como LaTeX para el encabezado: `kN/m^2` → `\mathrm{kN/m^{2}}`. */
function unidadTex(u: string): string {
  if (!/^[\p{L}\p{N}_*/^().\s-]+$/u.test(u)) return textoTex(u);
  const t = u
    .replace(/\s+/g, '')
    .replace(/\*/g, '\\cdot ')
    .replace(/\^\(?(-?\d+)\)?/g, '^{$1}');
  return `\\mathrm{${t}}`;
}

/** «vector de 3», «matriz 2×3»: lo que se ve de lo publicado en el panel de variables. */
function resumenDeForma(v: unknown): string {
  const dims = math.size(v as never).valueOf() as number[];
  return dims.length === 1 ? `vector de ${dims[0]}` : `matriz ${dims.join('×')}`;
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
  if (n.implicit && n.op === '*') return esNumeroEscrito(izq);
  return (n.op === '*' || n.op === '/') && esCantidadLiteral(izq);
}

/**
 * ¿Es un número escrito, con su signo: `2`, `-2`? math.js parsea `-2 m^2` como
 * `(-2)·m^2`, así que el número delante de una unidad puede llegar envuelto en
 * un menos unario.
 */
function esNumeroEscrito(nodo: MathNode): boolean {
  const n = nodo as unknown as NodoOp;
  if (n.type === 'ConstantNode') return true;
  return n.type === 'OperatorNode' && (n.fn === 'unaryMinus' || n.fn === 'unaryPlus') && n.args?.length === 1 && n.args[0].type === 'ConstantNode';
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
  for (const u of unidadesEnPosicion(node)) {
    if (u.forma !== undefined && Object.hasOwn(scope, u.nombre) && !tapadas.has(u.nombre)) tapadas.set(u.nombre, u.forma);
  }
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
    retirar(RE_CABECERA_PROGRAMA.exec(src)?.[1]);
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
    comprobarValor(value);
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
  const valor = evaluarNodo(parsear(expr), { ...scope });
  // Un rótulo «(1+2i)» sería el mismo número falso que la hoja ya no muestra:
  // quien llama lo trata como un token que no resuelve.
  comprobarValor(valor);
  return valor;
}

/**
 * Lo que la hoja dice ante un resultado complejo.
 *
 * mathjs responde a la raíz de un negativo, a su logaritmo o a una potencia
 * fraccionaria de un negativo con un número complejo, y la hoja lo mostraba
 * como «(91,07 − 26,37i) cm²» sin una sola señal. En una memoria de cálculo eso
 * es siempre un dato o una unidad equivocados más arriba —un número plausible y
 * falso—, así que es un error y retira la variable como cualquier otro.
 *
 * Se detecta el resultado en vez de configurar `predictable: true`: ese modo
 * devuelve `NaN`, que se propaga igual de callado (toda comparación con `NaN`
 * da falso), y además cambia la semántica de `pow` en todo el motor.
 */
const ERROR_COMPLEJO =
  'Da un número complejo: sale de una raíz, una potencia fraccionaria o un logaritmo de un negativo. Revisa los datos y las unidades.';

/** ¿Es complejo, o lo contiene? Una cantidad con valor complejo y una matriz con algún complejo cuentan. */
function esComplejo(v: unknown): boolean {
  if (math.isComplex(v)) return true;
  if (math.isUnit(v)) return math.isComplex((v as { value: unknown }).value);
  if (math.isMatrix(v)) return esComplejo((v as { toArray(): unknown }).toArray());
  if (Array.isArray(v)) return v.some(esComplejo);
  return false;
}

/**
 * Lo que la hoja dice ante un valor no finito, por la misma razón que ante un
 * complejo: `0/0` daba NaN, `1/0` Infinity y `log(0)` −Infinity sin una señal, y
 * una verificación con un NaN dentro salía ✗, que se lee como un incumplimiento.
 */
const ERROR_NO_FINITO =
  'Da un valor no finito (∞ o NaN): sale de una división por cero, del logaritmo de cero o de operar con un infinito. Revisa los datos.';

/** ¿Es NaN o ±∞, o lo contiene? Como `esComplejo`: cantidades y matrices cuentan. */
function esNoFinito(v: unknown): boolean {
  if (typeof v === 'number') return !Number.isFinite(v);
  if (math.isBigNumber(v)) return !(v as { isFinite(): boolean }).isFinite();
  if (math.isUnit(v)) {
    const valor = (v as { value: unknown }).value;
    return valor !== null && valor !== undefined && esNoFinito(valor);
  }
  if (math.isMatrix(v)) return esNoFinito((v as { toArray(): unknown }).toArray());
  if (Array.isArray(v)) return v.some(esNoFinito);
  return false;
}

/** Un resultado que la hoja puede mostrar o guardar: ni complejo ni no finito. */
function comprobarValor(v: unknown): void {
  if (esComplejo(v)) throw new Error(ERROR_COMPLEJO);
  if (esNoFinito(v)) throw new Error(ERROR_NO_FINITO);
}

const FN_COMPARACION = new Set(['smaller', 'larger', 'smallerEq', 'largerEq', 'equal', 'unequal']);

/**
 * Una verificación da un booleano, así que un NaN o un ∞ intermedio no llega al
 * resultado: `V_u/(φ·V_c) <= 1` con `V_c = 0` daba ✗ sin decir por qué. Se
 * evalúan aparte los lados de cada comparación de primer nivel —la de arriba, o
 * las unidas por `and`, `or`, `not`— y un lado no finito es un error. Solo corre
 * sobre las fórmulas que dan un booleano, así que lo que cuesta es poco.
 */
function comprobarComparacion(node: MathNode, scope: Record<string, unknown>): void {
  const n = node as unknown as NodoOp & { params?: MathNode[] };
  if (n.type === 'ParenthesisNode' && n.content) return comprobarComparacion(n.content, scope);
  if (n.type === 'RelationalNode' && n.params) {
    for (const p of n.params) if (esNoFinito(evaluarNodo(p, Object.create(scope)))) throw new Error(ERROR_NO_FINITO);
    return;
  }
  if (n.type !== 'OperatorNode' || !n.args) return;
  if (n.fn && FN_COMPARACION.has(n.fn)) {
    for (const a of n.args) if (esNoFinito(evaluarNodo(a, Object.create(scope)))) throw new Error(ERROR_NO_FINITO);
  } else if (n.fn === 'and' || n.fn === 'or' || n.fn === 'xor' || n.fn === 'not') {
    for (const a of n.args) comprobarComparacion(a, scope);
  }
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
  if (math.isUnit(v)) return comaDecimal(math.format(paraMostrar(v), { precision: 4 }));
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
 * que un rótulo: aquí el consumidor es el parser del navegador, no un lector.
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
/**
 * Las filas de una matriz del scope, o `null` si el valor no es una.
 *
 * Una matriz de mathjs no es un array: hay que pasar por `valueOf()`. Vive aquí y
 * no en cada consumidor porque ya son dos —el `points` de un `<polyline>` y la
 * tabla de una salida `serie`— y con la comprobación repetida acabarían
 * discrepando en qué cuenta como matriz.
 */
export function filasDeMatriz(v: unknown): unknown[] | null {
  const filas = math.isMatrix(v) ? (v.valueOf() as unknown[]) : v;
  return Array.isArray(filas) ? filas : null;
}

export function formatSvg(v: unknown, unidad?: string): string {
  if (unidad) return numSvg(math.number(v as never, unidad as never));
  if (math.isUnit(v)) {
    throw new Error('un atributo SVG no lleva unidad: conviértela con `:unidad:svg`');
  }
  if (typeof v === 'number') return numSvg(v);

  const filas = filasDeMatriz(v);
  if (!filas) throw new Error(`valor no dibujable: ${typeof v}`);
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

/**
 * Lo que la región gráfico necesita del motor (`grafico.ts` no importa mathjs:
 * una segunda instancia perdería `tonf` y los `Unit` del scope).
 *
 * La regla de unidades es la de `formatSvg`, estricta: con unidad en el eje,
 * cada valor se convierte a ella DENTRO del motor —dividir por `1 <unidad>`, sin
 * tabla de factores— y una dimensión que no casa es un error; sin unidad, un
 * valor con unidades también lo es, porque dibujarlo exigiría adivinar en qué
 * unidad se quería leer.
 */
const HERRAMIENTAS_GRAFICO: HerramientasGrafico = {
  compilar(expr) {
    if (!expr.trim()) throw new Error('falta la expresión');
    const node = parsear(expr);
    return (s) => evaluarNodo(node, s);
  },
  aNumero(v, unidad, que) {
    if (esComplejo(v)) throw new Error(`${que} da un número complejo (raíz o logaritmo de un negativo)`);
    if (unidad) {
      if (!math.isUnit(v)) {
        throw new Error(
          `${que} es un número sin unidad y el eje está en ${unidad}: quita la unidad del eje o da el valor con unidades`,
        );
      }
      try {
        return math.number(v as never, unidad as never) as number;
      } catch {
        throw new Error(`${que} está en ${(v as { formatUnits(): string }).formatUnits()} y el eje en ${unidad}: las unidades no casan`);
      }
    }
    if (math.isUnit(v)) {
      throw new Error(`${que} tiene unidades (${(v as { formatUnits(): string }).formatUnits()}): declara la unidad del eje`);
    }
    if (typeof v === 'number') return v;
    if (math.isBigNumber(v) || math.isFraction(v)) return math.number(v as never) as number;
    throw new Error(`${que} no es un número`);
  },
  cantidad(n, unidad) {
    return unidad ? math.unit(n, unidad) : n;
  },
  filas: filasDeMatriz,
  rotular(texto, s) {
    return texto.replace(TOKEN_RE, (_m, crudo: string) => {
      const { expr, unidad } = separarToken(crudo.trim());
      try {
        const v = evaluarNodo(parsear(expr), Object.create(s));
        comprobarValor(v);
        return formatValor(v, unidad);
      } catch (e) {
        throw new Error(`la etiqueta no resuelve {{${crudo.trim()}}}: ${errMsg(e)}`);
      }
    });
  },
  comprobarNombre,
};
