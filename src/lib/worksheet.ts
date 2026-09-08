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

import { create, all } from 'mathjs';
import { parseProgram, runProgram, type ProgramContext } from './program';

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

/** Tope de iteraciones por programa (anti-bucle-infinito; evita colgar la pestaña). */
const MAX_ITERS = 100_000;

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

/** Convierte `\_x` escapado por mathjs.toTex() en subíndices reales `_{x}`. */
function fixSubscripts(tex: string): string {
  return tex.replace(/\\_([\p{L}\p{N}]+)/gu, '_{$1}');
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

/** LaTeX de un nombre de variable: griegas y subíndices (`alpha_s` → `\alpha_{s}`). */
function symbolTex(name: string): string {
  const [head, ...rest] = name.split('_');
  const h = GREEK.has(head) ? `\\${head}` : head;
  // Llaves para que sea seguro concatenar (evita `\cdotL`).
  return rest.length ? `{${h}_{${rest.join('_')}}}` : `{${h}}`;
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
    handler: (node: { type: string; name?: string }) => {
      if (node.type === 'SymbolNode' && node.name && vars.has(node.name)) {
        return symbolTex(node.name);
      }
      return undefined;
    },
  });
  return fixPlusExponent(fixSubscripts(tex.trim()));
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

  const ctx: ProgramContext = {
    evaluate: (expr, s) => math.evaluate(expr, s),
    maxIters: MAX_ITERS,
  };

  for (const region of ordered) {
    if (region.kind === 'image') {
      results[region.id] = { scope: { ...scope } };
      continue;
    }

    if (region.src.trim() === '') {
      results[region.id] = {};
      continue;
    }

    if (region.kind === 'program') {
      results[region.id] = evalProgramRegion(region.src, scope, ctx);
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

    try {
      let value = math.evaluate(parsed.expr, scope);
      if (parsed.targetUnit) {
        if (!math.isUnit(value)) throw new Error(`El resultado no tiene unidades, no se puede convertir a ${parsed.targetUnit}`);
        value = value.to(parsed.targetUnit);
      }
      if (parsed.varName) scope[parsed.varName] = value;

      const isBool = typeof value === 'boolean';
      if (isBool && parsed.showResult) {
        // `tex` es la comparación renderizada; el veredicto ✓/✗ lo pinta MathRegion.
        results[region.id] = { tex, bool: value };
      } else {
        if (!isBool && parsed.showResult && tex !== undefined) {
          tex += `=${resultToTex(value)}`;
        }
        results[region.id] = { tex };
      }
    } catch (err) {
      results[region.id] = { tex, error: errMsg(err) };
    }
  }

  return results;
}

/**
 * Evalúa una región de programa. Si define una función (`f(x) := ...`) la
 * registra como closure en el scope compartido; si es un programa inline lo
 * ejecuta en una copia del scope (sus variables internas no contaminan la hoja)
 * y exporta su valor de retorno bajo el nombre de la cabecera, si lo hay.
 */
function evalProgramRegion(
  src: string,
  scope: Record<string, unknown>,
  ctx: ProgramContext,
): RegionResult {
  let prog;
  try {
    prog = parseProgram(src);
  } catch (err) {
    return { error: errMsg(err) };
  }

  if (prog.params && prog.name) {
    const { name, params, body } = prog;
    // El closure captura el scope vivo: ve las variables de la hoja al llamarse
    // (y permite recursión, pues `name` ya está en el scope).
    scope[name] = (...args: unknown[]) => {
      const local = { ...scope };
      params.forEach((p, i) => {
        local[p] = args[i];
      });
      return runProgram(body, local, ctx, { n: 0 });
    };
    return { defined: `${name}(${params.join(', ')})` };
  }

  try {
    const value = runProgram(prog.body, { ...scope }, ctx, { n: 0 });
    if (prog.name) scope[prog.name] = value;
    let tex: string | undefined;
    if (value !== undefined) {
      const lhs = prog.name ? `${symbolTex(prog.name)}=` : '';
      tex = lhs + resultToTex(value);
    }
    return { tex };
  } catch (err) {
    return { error: errMsg(err) };
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Evalúa una expresión suelta contra un scope, sin mutarlo (la usa el esquema
 * paramétrico para resolver los tokens `{{expr}}` con el mismo motor y las
 * mismas unidades de la hoja).
 */
export function evalExpr(expr: string, scope: Record<string, unknown>): unknown {
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
