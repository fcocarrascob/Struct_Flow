// ─────────────────────────────────────────────────────────────────────────────
// La región tabla: una grilla de celdas, cada una con la gramática de una región
// math.
//
// Una celda es una fórmula (`a := 3 m`, `b = kN`, `p_1 := q*Cp_1 =`), un valor
// escrito (`-0.9`, `3 m`) o texto (encabezados, rótulos). La tabla se evalúa en
// su posición del orden de lectura, fila a fila, contra el scope compartido: lo
// que define una celda lo ven las siguientes y la hoja de abajo. No hay una
// segunda gramática: cada celda de fórmula pasa por la misma función que una
// región math (`evaluarFormula` de `worksheet.ts`).
//
// Además puede PUBLICAR su cuerpo: entero como matriz y cada columna con nombre
// como vector, que es lo que permite escribir una tabla de norma una sola vez y
// leerla con `interp` o dibujarla con la `xy` de un gráfico.
//
// Este módulo no importa mathjs, igual que `grafico.ts`: aquí vive la forma de la
// tabla y sus operaciones de edición; la evaluación la hace `worksheet.ts` con su
// única instancia.
// ─────────────────────────────────────────────────────────────────────────────

/** Topes de forma. Una tabla más grande no cabe en una A4 y rompe la paginación. */
export const MAX_FILAS = 60;
export const MAX_COLUMNAS = 12;

// ── Lo que se guarda en la región ──────────────────────────────────────────────

export interface ColumnaTabla {
  /** Publica las celdas de cuerpo de la columna como un vector con este nombre. */
  nombre?: string;
  /**
   * Unidad de mathjs de la columna, solo en el cuerpo: un valor escrito sin unidad
   * la toma, lo calculado se muestra convertido a ella, y se imprime en el
   * encabezado —las celdas llevan entonces el número solo—.
   */
  unidad?: string;
  /** Imprime solo el valor de cada celda, sin la definición ni la expresión. */
  soloValor?: boolean;
}

export interface EspecTabla {
  version: 1;
  /** Filas × columnas, rectangular. Cada celda es un `src`. */
  celdas: string[][];
  /** Cuántas filas del principio son encabezado: negrita, fuera de la matriz y los vectores. */
  encabezado?: number;
  /** Una entrada por columna, o menos (las que falten no llevan nada). */
  columnas?: ColumnaTabla[];
  /** Publica todo el cuerpo como una matriz con este nombre. */
  matriz?: string;
}

// ── Lo que produce la evaluación ───────────────────────────────────────────────

/**
 * Qué es una celda:
 * - `vacia`: no lleva nada.
 * - `formula`: tiene `:=` o un `=` final; se evalúa como una región math.
 * - `literal`: un valor escrito (`-0.9`, `3 m`); se evalúa, no define nada.
 * - `texto`: todo lo demás, y lo que empieza con `'` (como en una planilla
 *   electrónica: `'Cp =` es un rótulo, no una fórmula).
 */
export type TipoCelda = 'vacia' | 'texto' | 'literal' | 'formula';

export interface ResultadoCelda {
  tipo: TipoCelda;
  /** El LaTeX que se imprime: la fórmula entera, o solo su valor. */
  tex?: string;
  /** Solo `texto`: lo que se imprime, sin la comilla que lo fuerza. */
  texto?: string;
  bool?: boolean;
  error?: string;
  aviso?: string;
}

export interface DatosTabla {
  celdas: ResultadoCelda[][];
  /** Por columna, el LaTeX de la unidad que va en el encabezado; `undefined` si no lleva. */
  unidades: (string | undefined)[];
}

// ── Validación de forma ─────────────────────────────────────────────────────────

/**
 * Por qué una especificación no es una tabla, como código (la redacción vive en
 * `components/canvas/informe-descartes.ts`). `null` si vale.
 *
 * Es forma, no contenido: que las celdas evalúen, o que un nombre publicado sea
 * válido, lo dice la evaluación con su error, igual que una fórmula mal escrita.
 */
export type CodigoTabla = 'no-es-objeto' | 'version' | 'celdas' | 'dimensiones' | 'encabezado' | 'columnas' | 'matriz';

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const esTextoOpcional = (v: unknown) => v === undefined || typeof v === 'string';

function columnaValida(v: unknown): boolean {
  return (
    esObjeto(v) &&
    esTextoOpcional(v.nombre) &&
    esTextoOpcional(v.unidad) &&
    (v.soloValor === undefined || typeof v.soloValor === 'boolean')
  );
}

export function motivoDeTabla(v: unknown): CodigoTabla | null {
  if (!esObjeto(v)) return 'no-es-objeto';
  if (v.version !== 1) return 'version';
  const celdas = v.celdas;
  if (!Array.isArray(celdas) || celdas.length === 0 || !Array.isArray(celdas[0])) return 'celdas';
  const ancho = (celdas[0] as unknown[]).length;
  if (ancho === 0) return 'celdas';
  for (const fila of celdas) {
    if (!Array.isArray(fila) || fila.length !== ancho || !fila.every((c) => typeof c === 'string')) return 'celdas';
  }
  if (celdas.length > MAX_FILAS || ancho > MAX_COLUMNAS) return 'dimensiones';
  const enc = v.encabezado;
  if (enc !== undefined && !(Number.isInteger(enc) && (enc as number) >= 0 && (enc as number) <= celdas.length)) {
    return 'encabezado';
  }
  if (v.columnas !== undefined) {
    if (!Array.isArray(v.columnas) || v.columnas.length > ancho || !v.columnas.every(columnaValida)) return 'columnas';
  }
  if (!esTextoOpcional(v.matriz)) return 'matriz';
  return null;
}

/**
 * Alto de una fila en el papel, en px: 11pt de texto con su interlineado, el
 * relleno de la celda y el borde (`.wp-tabla` en `papel.css`). Es una
 * estimación para colocar lo de abajo al insertar o al generar una hoja; lo que
 * pagina es el alto medido.
 */
export const ALTO_FILA_TABLA = 24;
/** Alto del título de una tabla, con su margen. */
export const ALTO_TITULO_TABLA = 22;

export function altoEstimadoTabla(t: EspecTabla, titulo: string): number {
  return t.celdas.length * ALTO_FILA_TABLA + (titulo.trim() ? ALTO_TITULO_TABLA : 0);
}

/** Una tabla nueva: tres columnas, una fila de encabezado y dos de cuerpo. */
export function tablaPorDefecto(): EspecTabla {
  return {
    version: 1,
    celdas: [
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
    ],
    encabezado: 1,
  };
}

// ── Lectura ─────────────────────────────────────────────────────────────────────

export const filasDe = (t: EspecTabla): number => t.celdas.length;
export const columnasDe = (t: EspecTabla): number => t.celdas[0]?.length ?? 0;
export const encabezadoDe = (t: EspecTabla): number => Math.min(t.encabezado ?? 0, t.celdas.length);

/** La especificación de la columna `c`, o una vacía. */
export const columna = (t: EspecTabla, c: number): ColumnaTabla => t.columnas?.[c] ?? {};

/** ¿La celda es texto por decisión del autor? Una `'` inicial, como en una planilla electrónica. */
export const esTextoForzado = (src: string): boolean => src.trimStart().startsWith("'");

/** El texto de una celda de texto, sin la comilla que lo fuerza. */
export const textoDeCelda = (src: string): string => (esTextoForzado(src) ? src.trimStart().slice(1) : src).trim();

/**
 * Cómo se cita una celda fuera de la tabla: `r12[2,3]`, en base 1 como los
 * índices de mathjs y como se lee en el papel. Es el id de su veredicto en
 * `verify:planilla` y en `meta.esperadoFalso`.
 */
export const idDeCelda = (regionId: string, f: number, c: number): string => `${regionId}[${f + 1},${c + 1}]`;

/**
 * La clase de una celda en el papel. Un valor —escrito, o de una columna «solo
 * valor»— se alinea a la derecha, como las cifras de cualquier tabla; una
 * fórmula entera y un texto, a la izquierda. La usan `BloqueDoc.tsx` y
 * `render-html.ts`, que tienen que emitir el mismo marcado.
 */
export function claseDeCelda(t: EspecTabla, f: number, c: number, tipo: TipoCelda | undefined): string {
  const valor = tipo === 'literal' || (tipo === 'formula' && f >= encabezadoDe(t) && columna(t, c).soloValor);
  return valor ? 'wp-c wp-c-valor' : 'wp-c';
}

/** Los `src` de todas las celdas, en orden de evaluación (fila a fila). */
export function celdasEnOrden(t: EspecTabla): { f: number; c: number; src: string }[] {
  const out: { f: number; c: number; src: string }[] = [];
  t.celdas.forEach((fila, f) => fila.forEach((src, c) => out.push({ f, c, src })));
  return out;
}

/** Los nombres que la tabla publica además de lo que definen sus celdas. */
export function nombresPublicados(t: EspecTabla): string[] {
  const out: string[] = [];
  if (t.matriz?.trim()) out.push(t.matriz.trim());
  for (const col of t.columnas ?? []) if (col.nombre?.trim()) out.push(col.nombre.trim());
  return out;
}

// ── Edición (inmutable) ─────────────────────────────────────────────────────────
//
// Las usan la grilla y el panel. Mantienen la tabla rectangular, las columnas
// alineadas con sus celdas y el encabezado dentro de rango.

/** `columnas` con exactamente `n` entradas, para poder insertar o quitar en su sitio. */
function columnasCompletas(t: EspecTabla): ColumnaTabla[] {
  const n = columnasDe(t);
  return Array.from({ length: n }, (_, c) => ({ ...columna(t, c) }));
}

/** Quita las entradas de columna vacías del final, para que el JSON no crezca solo. */
function podarColumnas(cols: ColumnaTabla[]): ColumnaTabla[] | undefined {
  const limpias = cols.map((c) => {
    const o: ColumnaTabla = {};
    if (c.nombre) o.nombre = c.nombre;
    if (c.unidad) o.unidad = c.unidad;
    if (c.soloValor) o.soloValor = true;
    return o;
  });
  while (limpias.length && Object.keys(limpias[limpias.length - 1]).length === 0) limpias.pop();
  return limpias.length ? limpias : undefined;
}

function conColumnas(t: EspecTabla, cols: ColumnaTabla[]): EspecTabla {
  const podadas = podarColumnas(cols);
  const { columnas: _fuera, ...resto } = t;
  return podadas ? { ...resto, columnas: podadas } : resto;
}

export function cambiarCelda(t: EspecTabla, f: number, c: number, src: string): EspecTabla {
  return { ...t, celdas: t.celdas.map((fila, i) => (i === f ? fila.map((v, j) => (j === c ? src : v)) : fila)) };
}

/** Inserta una fila vacía en la posición `f` (0 … filas). */
export function insertarFila(t: EspecTabla, f: number): EspecTabla {
  if (filasDe(t) >= MAX_FILAS) return t;
  const celdas = [...t.celdas];
  celdas.splice(f, 0, Array(columnasDe(t)).fill(''));
  // Una fila insertada dentro del encabezado es de encabezado.
  const enc = encabezadoDe(t);
  return { ...t, celdas, ...(enc > 0 && f < enc ? { encabezado: enc + 1 } : {}) };
}

export function quitarFila(t: EspecTabla, f: number): EspecTabla {
  if (filasDe(t) <= 1) return t;
  const enc = encabezadoDe(t);
  return {
    ...t,
    celdas: t.celdas.filter((_, i) => i !== f),
    ...(f < enc ? { encabezado: enc - 1 } : {}),
  };
}

/** Mueve la fila `f` a `f + delta`, si cabe. */
export function moverFila(t: EspecTabla, f: number, delta: -1 | 1): EspecTabla {
  const g = f + delta;
  if (g < 0 || g >= filasDe(t)) return t;
  const celdas = [...t.celdas];
  [celdas[f], celdas[g]] = [celdas[g], celdas[f]];
  return { ...t, celdas };
}

export function insertarColumna(t: EspecTabla, c: number): EspecTabla {
  if (columnasDe(t) >= MAX_COLUMNAS) return t;
  const cols = columnasCompletas(t);
  cols.splice(c, 0, {});
  const celdas = t.celdas.map((fila) => {
    const nueva = [...fila];
    nueva.splice(c, 0, '');
    return nueva;
  });
  return conColumnas({ ...t, celdas }, cols);
}

export function quitarColumna(t: EspecTabla, c: number): EspecTabla {
  if (columnasDe(t) <= 1) return t;
  const cols = columnasCompletas(t).filter((_, j) => j !== c);
  return conColumnas({ ...t, celdas: t.celdas.map((fila) => fila.filter((_, j) => j !== c)) }, cols);
}

export function moverColumna(t: EspecTabla, c: number, delta: -1 | 1): EspecTabla {
  const d = c + delta;
  if (d < 0 || d >= columnasDe(t)) return t;
  const cols = columnasCompletas(t);
  [cols[c], cols[d]] = [cols[d], cols[c]];
  const celdas = t.celdas.map((fila) => {
    const nueva = [...fila];
    [nueva[c], nueva[d]] = [nueva[d], nueva[c]];
    return nueva;
  });
  return conColumnas({ ...t, celdas }, cols);
}

export function cambiarColumna(t: EspecTabla, c: number, parcial: Partial<ColumnaTabla>): EspecTabla {
  const cols = columnasCompletas(t);
  cols[c] = { ...cols[c], ...parcial };
  return conColumnas(t, cols);
}

export function cambiarEncabezado(t: EspecTabla, n: number): EspecTabla {
  const enc = Math.max(0, Math.min(Math.trunc(n), filasDe(t)));
  const { encabezado: _fuera, ...resto } = t;
  return enc > 0 ? { ...resto, encabezado: enc } : resto;
}

export function cambiarMatriz(t: EspecTabla, nombre: string): EspecTabla {
  const { matriz: _fuera, ...resto } = t;
  return nombre.trim() ? { ...resto, matriz: nombre.trim() } : resto;
}
