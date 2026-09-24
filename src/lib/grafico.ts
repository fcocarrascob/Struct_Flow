// ─────────────────────────────────────────────────────────────────────────────
// La región gráfico: funciones, series x–y y referencias sobre dos ejes.
//
// Un gráfico se DECLARA —qué dibujar, en qué rango, en qué unidad cada eje— y se
// evalúa en su posición del orden de lectura, contra el mismo scope que una
// región math: ve lo definido arriba y no define nada. El resultado no son
// píxeles sino DATOS en unidades de los ejes (`DatosGrafico`); el SVG lo arma
// después una función pura (`grafico-svg.ts`) que usan el canvas, el documento
// de impresión y el render de Node, así que los tres papeles dibujan lo mismo.
//
// Antes una figura así se hacía a mano: regiones `imprimir: false` que llevaban
// cada valor a píxeles (`x_0 + (hh - 150)*s_x`) para alimentar la polilínea de un
// esquema. Veintiséis regiones en la genérica del espectro.
//
// Este módulo no importa mathjs: `worksheet.ts` le pasa lo que necesita
// (`HerramientasGrafico`) desde su única instancia, igual que a `program.ts`. Dos
// instancias perderían las unidades locales (`tonf`) y los `Unit` del scope.
// ─────────────────────────────────────────────────────────────────────────────

import { separarToken } from './token';

/** El ancho de todo gráfico: el de la caja de contenido de una A4 (`A4_ANCHO_PX`). */
export const ANCHO_GRAFICO = 680;

/** Los altos que se ofrecen, en px de papel. Fijos, para que la paginación sea estable. */
export const ALTOS_GRAFICO = [272, 340, 425] as const;
export const ALTO_POR_DEFECTO = 340;

export const MAX_SERIES = 8;
export const MAX_REFERENCIAS = 12;
export const MUESTRAS_POR_DEFECTO = 200;
export const MAX_MUESTRAS = 1000;

export const TRAZOS = ['continuo', 'discontinuo', 'punteado', 'trazo-punto'] as const;
export const MARCADORES = ['ninguno', 'circulo', 'cuadrado', 'triangulo', 'rombo'] as const;
export type Trazo = (typeof TRAZOS)[number];
export type Marcador = (typeof MARCADORES)[number];

// ── Lo que se guarda en la región ──────────────────────────────────────────────

export interface EspecEje {
  /** Texto llano; se imprime «titulo [unidad]». */
  titulo: string;
  /** Unidad de mathjs en la que se EXPRESA el eje. Vacía: el eje es adimensional. */
  unidad?: string;
  /** Extremos como expresiones de la hoja. Vacíos: automáticos. */
  min?: string;
  max?: string;
}

export interface EspecEjeY extends EspecEje {
  /** Con extremos automáticos, que el eje llegue al cero. Por defecto sí. */
  incluirCero?: boolean;
}

interface SerieBase {
  nombre: string;
  trazo?: Trazo;
  marcador?: Marcador;
}

/** Una función de una variable, muestreada en `[desde, hasta]`. */
export interface SerieFuncion extends SerieBase {
  tipo: 'funcion';
  /** La expresión, con la variable libre: `Sa(T)`, `2*x + 1`. */
  expr: string;
  variable: string;
  desde: string;
  hasta: string;
  muestras?: number;
}

/** Puntos x–y: una matriz N×2 (`xy`) o dos vectores del mismo largo (`x`, `y`). */
export interface SerieDatos extends SerieBase {
  tipo: 'datos';
  xy?: string;
  x?: string;
  y?: string;
}

export type EspecSerie = SerieFuncion | SerieDatos;

/**
 * Dónde va la etiqueta de una recta, si el autor la fija. Sin fijar, la elige
 * `svgDeGrafico` esquivando la leyenda y las demás etiquetas. No es una posición
 * en píxeles: se ancla a la recta, así que la acompaña cuando cambian los datos.
 *
 * - Vertical: `lado` izquierda / derecha de la recta; `posicion` arriba / medio / abajo.
 * - Horizontal: `lado` arriba / abajo de la recta; `posicion` inicio / medio / fin.
 */
export const LADOS_ETIQUETA = { vertical: ['izquierda', 'derecha'], horizontal: ['arriba', 'abajo'] } as const;
export const POSICIONES_ETIQUETA = { vertical: ['arriba', 'medio', 'abajo'], horizontal: ['inicio', 'medio', 'fin'] } as const;
export type LadoEtiqueta = 'izquierda' | 'derecha' | 'arriba' | 'abajo';
export type PosicionEtiqueta = 'arriba' | 'medio' | 'abajo' | 'inicio' | 'fin';

/** La esquina de la leyenda; `auto` elige la primera libre. */
export const POSICIONES_LEYENDA = ['auto', 'arriba-derecha', 'arriba-izquierda', 'abajo-derecha', 'abajo-izquierda'] as const;
export type PosicionLeyenda = (typeof POSICIONES_LEYENDA)[number];

/** Una recta o un punto rotulado. La etiqueta admite tokens `{{expr:unidad}}`. */
export type EspecReferencia =
  | { tipo: 'horizontal' | 'vertical'; valor: string; etiqueta?: string; lado?: LadoEtiqueta; posicion?: PosicionEtiqueta }
  | { tipo: 'punto'; x: string; y: string; etiqueta?: string };

export interface EspecGrafico {
  version: 1;
  ejeX: EspecEje;
  ejeY: EspecEjeY;
  series: EspecSerie[];
  referencias?: EspecReferencia[];
  /** `auto`: con más de una serie. */
  leyenda?: 'auto' | 'si' | 'no';
  /** Sin fijar, `auto`. */
  posicionLeyenda?: PosicionLeyenda;
  cuadricula?: boolean;
  alto?: number;
}

// ── Lo que produce la evaluación ───────────────────────────────────────────────

export interface Tick {
  valor: number;
  rotulo: string;
}

/** Un eje resuelto: extremos y ticks en el número que se dibuja (ya dividido por la escala). */
export interface DatosEje {
  /** Título completo, con la unidad y la escala: «Sa [×10³ kN]». */
  titulo: string;
  min: number;
  max: number;
  ticks: Tick[];
}

export interface DatosSerie {
  nombre: string;
  trazo: Trazo;
  marcador: Marcador;
  /** La marca de cada punto de datos; en una función, unos pocos repartidos. */
  tipo: 'funcion' | 'datos';
  /** Tramos continuos, cortados donde la serie no está definida. En unidades del eje. */
  tramos: [number, number][][];
}

export interface DatosReferencia {
  tipo: 'horizontal' | 'vertical' | 'punto';
  x?: number;
  y?: number;
  etiqueta: string;
  /** Solo si el autor los fijó (ver `EspecReferencia`). */
  lado?: LadoEtiqueta;
  posicion?: PosicionEtiqueta;
}

export interface DatosGrafico {
  ancho: number;
  alto: number;
  ejeX: DatosEje;
  ejeY: DatosEje;
  series: DatosSerie[];
  referencias: DatosReferencia[];
  leyenda: boolean;
  /** Solo si el autor la fijó; sin ella, `auto`. */
  posicionLeyenda?: PosicionLeyenda;
  cuadricula: boolean;
}

export interface ResultadoGrafico {
  grafico?: DatosGrafico;
  error?: string;
  aviso?: string;
}

// ── Validación de forma ─────────────────────────────────────────────────────────

/**
 * Por qué una especificación no es un gráfico, como código (la redacción vive en
 * `components/canvas/informe-descartes.ts`, fuera del motor). `null` si vale.
 *
 * Es forma, no contenido: que las expresiones evalúen lo dice la evaluación, con
 * su error en la región, igual que una fórmula mal escrita.
 */
export type CodigoGrafico =
  | 'no-es-objeto'
  | 'version'
  | 'eje'
  | 'sin-series'
  | 'demasiadas-series'
  | 'serie'
  | 'referencia'
  | 'opciones';

const esTexto = (v: unknown): v is string => typeof v === 'string';
const esTextoOpcional = (v: unknown) => v === undefined || typeof v === 'string';
const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function ejeValido(v: unknown): boolean {
  return (
    esObjeto(v) &&
    esTexto(v.titulo) &&
    esTextoOpcional(v.unidad) &&
    esTextoOpcional(v.min) &&
    esTextoOpcional(v.max) &&
    (v.incluirCero === undefined || typeof v.incluirCero === 'boolean')
  );
}

function serieValida(v: unknown): boolean {
  if (!esObjeto(v) || !esTexto(v.nombre)) return false;
  if (v.trazo !== undefined && !(TRAZOS as readonly unknown[]).includes(v.trazo)) return false;
  if (v.marcador !== undefined && !(MARCADORES as readonly unknown[]).includes(v.marcador)) return false;
  if (v.tipo === 'funcion') {
    const muestras = v.muestras;
    return (
      esTexto(v.expr) &&
      esTexto(v.variable) &&
      esTexto(v.desde) &&
      esTexto(v.hasta) &&
      (muestras === undefined ||
        (Number.isInteger(muestras) && (muestras as number) >= 2 && (muestras as number) <= MAX_MUESTRAS))
    );
  }
  if (v.tipo === 'datos') {
    if (!esTextoOpcional(v.xy) || !esTextoOpcional(v.x) || !esTextoOpcional(v.y)) return false;
    return v.xy !== undefined || (v.x !== undefined && v.y !== undefined);
  }
  return false;
}

function referenciaValida(v: unknown): boolean {
  if (!esObjeto(v) || !esTextoOpcional(v.etiqueta)) return false;
  if (v.tipo === 'horizontal' || v.tipo === 'vertical') {
    const lados: readonly unknown[] = LADOS_ETIQUETA[v.tipo];
    const posiciones: readonly unknown[] = POSICIONES_ETIQUETA[v.tipo];
    if (v.lado !== undefined && !lados.includes(v.lado)) return false;
    if (v.posicion !== undefined && !posiciones.includes(v.posicion)) return false;
    return esTexto(v.valor);
  }
  if (v.tipo === 'punto') return esTexto(v.x) && esTexto(v.y);
  return false;
}

export function motivoDeGrafico(v: unknown): CodigoGrafico | null {
  if (!esObjeto(v)) return 'no-es-objeto';
  if (v.version !== 1) return 'version';
  if (!ejeValido(v.ejeX) || !ejeValido(v.ejeY)) return 'eje';
  if (!Array.isArray(v.series) || v.series.length === 0) return 'sin-series';
  if (v.series.length > MAX_SERIES) return 'demasiadas-series';
  if (!v.series.every(serieValida)) return 'serie';
  if (v.referencias !== undefined) {
    if (!Array.isArray(v.referencias) || v.referencias.length > MAX_REFERENCIAS) return 'referencia';
    if (!v.referencias.every(referenciaValida)) return 'referencia';
  }
  if (v.leyenda !== undefined && !['auto', 'si', 'no'].includes(v.leyenda as string)) return 'opciones';
  if (v.posicionLeyenda !== undefined && !(POSICIONES_LEYENDA as readonly unknown[]).includes(v.posicionLeyenda)) {
    return 'opciones';
  }
  if (v.cuadricula !== undefined && typeof v.cuadricula !== 'boolean') return 'opciones';
  if (v.alto !== undefined && !(ALTOS_GRAFICO as readonly unknown[]).includes(v.alto)) return 'opciones';
  return null;
}

/** Un gráfico nuevo: una función de ejemplo, lista para editar. */
export function especPorDefecto(): EspecGrafico {
  return {
    version: 1,
    ejeX: { titulo: 'x' },
    ejeY: { titulo: 'y', incluirCero: true },
    series: [{ tipo: 'funcion', nombre: 'Serie 1', expr: 'x^2', variable: 'x', desde: '0', hasta: '2' }],
    leyenda: 'auto',
    cuadricula: true,
    alto: ALTO_POR_DEFECTO,
  };
}

// ── Evaluación ──────────────────────────────────────────────────────────────────

/** Lo que el motor le presta al gráfico, desde su única instancia de mathjs. */
export interface HerramientasGrafico {
  /** La expresión compilada una vez; lanza si no parsea. */
  compilar(expr: string): (scope: Record<string, unknown>) => unknown;
  /**
   * El valor como número en `unidad` (o adimensional sin ella). Lanza con un
   * mensaje que nombra `que` si la dimensión no casa, si falta o sobra la
   * unidad, o si no es un número.
   */
  aNumero(v: unknown, unidad: string | undefined, que: string): number;
  /** Un número del eje como valor de la hoja: una cantidad en `unidad`, o el número a secas. */
  cantidad(n: number, unidad: string | undefined): unknown;
  /** Las filas de una matriz o un vector, o `null` si no lo es. */
  filas(v: unknown): unknown[] | null;
  /** Sustituye los tokens `{{expr:unidad}}` de un texto; lanza si uno no resuelve. */
  rotular(texto: string, scope: Record<string, unknown>): string;
  /** Lanza si el nombre no puede ser una variable. */
  comprobarNombre(nombre: string): void;
}

const IDENTIFICADOR_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;

/** Redondeo a 12 cifras: que dos evaluaciones den exactamente los mismos puntos. */
const r12 = (n: number) => Number(n.toPrecision(12));

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Un vector como lista de elementos: acepta fila, columna o arreglo plano. */
function aVector(v: unknown, h: HerramientasGrafico): unknown[] | null {
  let filas = h.filas(v);
  if (!filas) return null;
  // Un vector fila de mathjs escrito `[[1, 2, 3]]` es una matriz de 1×N.
  if (filas.length === 1 && Array.isArray(filas[0])) filas = filas[0] as unknown[];
  const out: unknown[] = [];
  for (const f of filas) {
    if (Array.isArray(f)) {
      if (f.length !== 1) return null;
      out.push(f[0]);
    } else {
      out.push(f);
    }
  }
  return out;
}

interface SerieCalculada {
  tramos: [number, number][][];
  huecos: number;
  muestras: number;
  primerMotivo?: string;
}

function muestrearFuncion(
  s: SerieFuncion,
  ux: string | undefined,
  uy: string | undefined,
  scope: Record<string, unknown>,
  h: HerramientasGrafico,
): SerieCalculada {
  if (!IDENTIFICADOR_RE.test(s.variable.trim())) {
    throw new Error(`la variable «${s.variable}» no es un nombre válido`);
  }
  const variable = s.variable.trim();
  h.comprobarNombre(variable);
  const f = h.compilar(s.expr);
  const a = h.aNumero(h.compilar(s.desde)(scope), ux, '«desde»');
  const b = h.aNumero(h.compilar(s.hasta)(scope), ux, '«hasta»');
  if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > a)) {
    throw new Error('«hasta» tiene que ser mayor que «desde»');
  }
  const n = s.muestras ?? MUESTRAS_POR_DEFECTO;
  // La variable vive en un scope propio que hereda del de la hoja: la ve la
  // expresión y no se filtra a lo de abajo, igual que un parámetro de función.
  const local: Record<string, unknown> = Object.create(scope);
  const tramos: [number, number][][] = [];
  let actual: [number, number][] = [];
  let huecos = 0;
  let primerMotivo: string | undefined;
  for (let i = 0; i < n; i++) {
    const x = r12(a + ((b - a) * i) / (n - 1));
    local[variable] = h.cantidad(x, ux);
    try {
      const y = h.aNumero(f(local), uy, 'el valor');
      if (!Number.isFinite(y)) throw new Error('no es un número finito');
      actual.push([x, r12(y)]);
    } catch (e) {
      huecos++;
      primerMotivo ??= mensaje(e);
      if (actual.length) tramos.push(actual);
      actual = [];
    }
  }
  if (actual.length) tramos.push(actual);
  return { tramos, huecos, muestras: n, primerMotivo };
}

function leerDatos(
  s: SerieDatos,
  ux: string | undefined,
  uy: string | undefined,
  scope: Record<string, unknown>,
  h: HerramientasGrafico,
): SerieCalculada {
  let pares: [unknown, unknown][];
  if (s.xy !== undefined && s.xy.trim() !== '') {
    const filas = h.filas(h.compilar(s.xy)(scope));
    if (!filas || filas.some((f) => !Array.isArray(f) || f.length < 2)) {
      throw new Error('«xy» tiene que ser una matriz de N×2 (una fila por punto)');
    }
    pares = filas.map((f) => [(f as unknown[])[0], (f as unknown[])[1]]);
  } else {
    const xs = aVector(h.compilar(s.x ?? '')(scope), h);
    const ys = aVector(h.compilar(s.y ?? '')(scope), h);
    if (!xs || !ys) throw new Error('«x» e «y» tienen que ser vectores');
    if (xs.length !== ys.length) {
      throw new Error(`«x» e «y» no tienen el mismo largo (${xs.length} y ${ys.length})`);
    }
    pares = xs.map((x, i) => [x, ys[i]]);
  }
  if (pares.length === 0) throw new Error('no tiene puntos');
  // En una serie de datos un punto malo no es un hueco: es un dato equivocado,
  // y se dice con su posición.
  const puntos: [number, number][] = pares.map(([x, y], i) => {
    try {
      return [r12(h.aNumero(x, ux, 'la x')), r12(h.aNumero(y, uy, 'la y'))];
    } catch (e) {
      throw new Error(`el punto ${i + 1}: ${mensaje(e)}`);
    }
  });
  return { tramos: [puntos], huecos: 0, muestras: puntos.length };
}

// ── Ejes: números redondos ──────────────────────────────────────────────────────

/** El número «redondo» (1, 2 o 5 por una potencia de 10) más cercano a `x`. */
function redondo(x: number, redondear: boolean): number {
  const e = Math.floor(Math.log10(x));
  const f = x / 10 ** e;
  const nf = redondear
    ? f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10
    : f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return r12(nf * 10 ** e);
}

const SUPERINDICES: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};
const superindice = (s: string) => [...s].map((c) => SUPERINDICES[c] ?? c).join('');

/** Una unidad de mathjs como se lee: `kN*m^2` → `kN·m²`. */
export function unidadLegible(u: string): string {
  return u
    .trim()
    .replace(/\s*\*\s*/g, '·')
    .replace(/\^\(?(-?\d+)\)?/g, (_m, n: string) => superindice(n));
}

interface Dominio {
  min: number;
  max: number;
}

/**
 * Los extremos y los ticks de un eje. `exactoMin`/`exactoMax` dicen si el
 * extremo se respeta tal cual (declarado, o el rango de una función); los demás
 * se llevan al tick redondo siguiente.
 */
function resolverEje(
  espec: EspecEje,
  dom: Dominio,
  exactoMin: boolean,
  exactoMax: boolean,
  objetivo: number,
  conRespiro: boolean,
): DatosEje {
  let { min, max } = dom;
  if (min === max) {
    const d = min === 0 ? 1 : Math.abs(min) * 0.1;
    min -= d;
    max += d;
    exactoMin = exactoMax = false;
  }
  // Un respiro antes de redondear los extremos automáticos del eje Y: sin él,
  // una curva cuyo máximo cae justo en un tick redondo (la meseta del espectro,
  // 1,0) se dibuja pegada al marco, y una recta de referencia ahí queda sobre el
  // borde. En X no: que los datos lleguen a los bordes es lo esperable, y
  // estirarlo dejaba un tramo vacío a la derecha. El cero no se despega nunca.
  if (conRespiro) {
    const respiro = (max - min) * 0.04;
    if (!exactoMin && min !== 0) min -= respiro;
    if (!exactoMax && max !== 0) max += respiro;
  }
  // El paso redondo más cercano a repartir el rango REAL en `objetivo` tramos.
  // Redondear antes el rango (3 → 5, como en el Heckbert de libro) inflaba el
  // paso: un eje de 0 a 3 quedaba en cuatro números de uno en uno.
  const paso = redondo((max - min) / (objetivo - 1), true);
  if (!exactoMin) min = r12(Math.floor(min / paso + 1e-9) * paso);
  if (!exactoMax) max = r12(Math.ceil(max / paso - 1e-9) * paso);

  // Escala en potencias de 10³ cuando los rótulos serían ilegibles.
  const mayor = Math.max(Math.abs(min), Math.abs(max));
  let exp = 0;
  if (mayor >= 1e5 || (mayor > 0 && mayor < 1e-3)) exp = 3 * Math.floor(Math.log10(mayor) / 3);
  const factor = 10 ** exp;
  const pasoRotulo = paso / factor;
  const decimales = Math.max(0, -Math.floor(Math.log10(pasoRotulo) + 1e-9));

  const ticks: Tick[] = [];
  const primero = Math.ceil(min / paso - 1e-9);
  const ultimo = Math.floor(max / paso + 1e-9);
  for (let k = primero; k <= ultimo && ticks.length < 50; k++) {
    const valor = r12(k * paso);
    let rotulo = (valor / factor).toFixed(decimales).replace('.', ',');
    if (/^-0(,0*)?$/.test(rotulo)) rotulo = rotulo.slice(1);
    ticks.push({ valor, rotulo });
  }

  const partes: string[] = [];
  if (exp !== 0) partes.push(`×10${superindice(String(exp))}`);
  if (espec.unidad?.trim()) partes.push(unidadLegible(espec.unidad));
  const titulo = espec.titulo.trim() + (partes.length ? ` [${partes.join(' ')}]` : '');
  return { titulo: titulo.trim(), min, max, ticks };
}

// ── La evaluación completa ─────────────────────────────────────────────────────

/**
 * Evalúa un gráfico contra el scope de su posición. No escribe en el scope.
 *
 * Una serie que no se puede dibujar es un **error de la región** —y
 * `verify:planillas` lo cuenta—, no una curva que falta en silencio. Una función
 * con algunos puntos indefinidos (una raíz de un negativo en parte del rango)
 * se corta en tramos y deja un `aviso`; si pierde más de la mitad, es error.
 */
export function evaluarGrafico(
  espec: EspecGrafico,
  scope: Record<string, unknown>,
  h: HerramientasGrafico,
): ResultadoGrafico {
  const ux = espec.ejeX.unidad?.trim() || undefined;
  const uy = espec.ejeY.unidad?.trim() || undefined;
  const avisos: string[] = [];
  const series: DatosSerie[] = [];
  let rangoFuncion: Dominio | undefined;

  for (const [i, s] of espec.series.entries()) {
    const nombre = s.nombre.trim() || `Serie ${i + 1}`;
    let calc: SerieCalculada;
    try {
      calc = s.tipo === 'funcion' ? muestrearFuncion(s, ux, uy, scope, h) : leerDatos(s, ux, uy, scope, h);
    } catch (e) {
      return { error: `Serie «${nombre}»: ${mensaje(e)}` };
    }
    const validos = calc.muestras - calc.huecos;
    if (validos === 0 || calc.huecos > calc.muestras / 2) {
      return {
        error: `Serie «${nombre}»: no está definida en ${calc.huecos} de ${calc.muestras} puntos (${calc.primerMotivo})`,
      };
    }
    if (calc.huecos > 0) {
      avisos.push(
        `La serie «${nombre}» no está definida en ${calc.huecos} de ${calc.muestras} puntos y se dibuja ` +
          `cortada. Primer motivo: ${calc.primerMotivo}`,
      );
    }
    if (s.tipo === 'funcion') {
      const xs = calc.tramos.flat().map((p) => p[0]);
      const d = { min: Math.min(...xs), max: Math.max(...xs) };
      rangoFuncion = rangoFuncion
        ? { min: Math.min(rangoFuncion.min, d.min), max: Math.max(rangoFuncion.max, d.max) }
        : d;
    }
    series.push({
      nombre,
      tipo: s.tipo,
      trazo: s.trazo ?? TRAZOS[i % TRAZOS.length],
      marcador: s.marcador ?? (s.tipo === 'datos' ? MARCADORES[1 + (i % (MARCADORES.length - 1))] : 'ninguno'),
      tramos: calc.tramos,
    });
  }

  const referencias: DatosReferencia[] = [];
  for (const [i, r] of (espec.referencias ?? []).entries()) {
    try {
      const etiqueta = r.etiqueta ? h.rotular(r.etiqueta, scope) : '';
      if (r.tipo === 'punto') {
        const x = h.aNumero(h.compilar(r.x)(scope), ux, 'la x');
        const y = h.aNumero(h.compilar(r.y)(scope), uy, 'la y');
        referencias.push({ tipo: 'punto', x: r12(x), y: r12(y), etiqueta });
      } else {
        const unidad = r.tipo === 'horizontal' ? uy : ux;
        const v = r12(h.aNumero(h.compilar(r.valor)(scope), unidad, 'el valor'));
        const fijada = { ...(r.lado ? { lado: r.lado } : {}), ...(r.posicion ? { posicion: r.posicion } : {}) };
        referencias.push(
          r.tipo === 'horizontal' ? { tipo: r.tipo, y: v, etiqueta, ...fijada } : { tipo: r.tipo, x: v, etiqueta, ...fijada },
        );
      }
    } catch (e) {
      return { error: `Referencia ${i + 1}: ${mensaje(e)}` };
    }
  }

  // Dominios: lo dibujado y lo referido.
  const xs = [
    ...series.flatMap((s) => s.tramos.flat().map((p) => p[0])),
    ...referencias.flatMap((r) => (r.x !== undefined ? [r.x] : [])),
  ];
  const ys = [
    ...series.flatMap((s) => s.tramos.flat().map((p) => p[1])),
    ...referencias.flatMap((r) => (r.y !== undefined ? [r.y] : [])),
  ];
  const extremo = (expr: string | undefined, unidad: string | undefined, que: string): number | undefined => {
    if (!expr || !expr.trim()) return undefined;
    return h.aNumero(h.compilar(expr)(scope), unidad, que);
  };

  let ejeX: DatosEje;
  let ejeY: DatosEje;
  try {
    const xMin = extremo(espec.ejeX.min, ux, 'el mínimo del eje X');
    const xMax = extremo(espec.ejeX.max, ux, 'el máximo del eje X');
    const yMin = extremo(espec.ejeY.min, uy, 'el mínimo del eje Y');
    const yMax = extremo(espec.ejeY.max, uy, 'el máximo del eje Y');

    const soloFunciones = espec.series.every((s) => s.tipo === 'funcion');
    const domX = {
      min: xMin ?? (soloFunciones && rangoFuncion ? rangoFuncion.min : Math.min(...xs)),
      max: xMax ?? (soloFunciones && rangoFuncion ? rangoFuncion.max : Math.max(...xs)),
    };
    // Con solo funciones, el eje X es el rango pedido, sin redondear: es lo que
    // el autor escribió, y estirarlo dejaría un tramo vacío a cada lado.
    ejeX = resolverEje(
      espec.ejeX,
      domX,
      xMin !== undefined || soloFunciones,
      xMax !== undefined || soloFunciones,
      // El eje X tiene los 600 px del papel; el Y, un tercio de eso.
      8,
      false,
    );

    const incluirCero = espec.ejeY.incluirCero !== false;
    let yLo = Math.min(...ys);
    let yHi = Math.max(...ys);
    if (incluirCero) {
      yLo = Math.min(yLo, 0);
      yHi = Math.max(yHi, 0);
    }
    ejeY = resolverEje(
      espec.ejeY,
      { min: yMin ?? yLo, max: yMax ?? yHi },
      yMin !== undefined,
      yMax !== undefined,
      5,
      true,
    );
    if (!(ejeX.max > ejeX.min) || !(ejeY.max > ejeY.min)) {
      return { error: 'Los extremos de un eje están invertidos: el máximo tiene que ser mayor que el mínimo' };
    }
  } catch (e) {
    return { error: mensaje(e) };
  }

  const leyenda = espec.leyenda === 'si' || (espec.leyenda !== 'no' && series.length > 1);
  return {
    grafico: {
      ancho: ANCHO_GRAFICO,
      alto: espec.alto ?? ALTO_POR_DEFECTO,
      ejeX,
      ejeY,
      series,
      referencias,
      leyenda,
      ...(espec.posicionLeyenda && espec.posicionLeyenda !== 'auto' ? { posicionLeyenda: espec.posicionLeyenda } : {}),
      cuadricula: espec.cuadricula !== false,
    },
    aviso: avisos.length ? avisos.join(' ') : undefined,
  };
}

/**
 * Los nombres que un gráfico USA de la hoja, para el orden de una obra y el
 * guardián de símbolos: las expresiones de sus series, rangos, extremos y
 * referencias (con los tokens de sus etiquetas), sin la variable de cada
 * función, que es suya.
 */
export function expresionesDeGrafico(espec: EspecGrafico): { expr: string; locales: string[] }[] {
  const out: { expr: string; locales: string[] }[] = [];
  const agregar = (expr: string | undefined, locales: string[] = []) => {
    if (expr && expr.trim()) out.push({ expr, locales });
  };
  for (const eje of [espec.ejeX, espec.ejeY]) {
    agregar(eje.min);
    agregar(eje.max);
  }
  for (const s of espec.series) {
    if (s.tipo === 'funcion') {
      agregar(s.expr, [s.variable.trim()]);
      agregar(s.desde);
      agregar(s.hasta);
    } else {
      agregar(s.xy);
      agregar(s.x);
      agregar(s.y);
    }
  }
  for (const r of espec.referencias ?? []) {
    if (r.tipo === 'punto') {
      agregar(r.x);
      agregar(r.y);
    } else {
      agregar(r.valor);
    }
    for (const m of (r.etiqueta ?? '').matchAll(/\{\{([^{}]+)\}\}/g)) {
      agregar(separarToken(m[1].trim()).expr);
    }
  }
  return out;
}
