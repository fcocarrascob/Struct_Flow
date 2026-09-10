// El autocompletado de nombres al escribir una fórmula o un programa, como el
// desplegable de SMath: qué palabra se está escribiendo, qué nombres la
// completan y en qué orden. Lógica pura, sin React ni DOM; la lista la pinta
// `Autocompletado.tsx`.
//
// Qué se ofrece: las variables y funciones que la hoja define ANTES de la
// región en edición —las únicas que el motor le va a dejar ver, porque el scope
// se resuelve en orden de lectura—, lo que el propio programa define dentro, y
// una lista corta de funciones de math.js. Las unidades no: con una o dos
// letras llenarían la lista de ruido (`m`, `mm`, `min`, `mol`…).

import type { Region, SheetResults } from './worksheet';

export interface Sugerencia {
  nombre: string;
  /** Lo que se ve a la derecha: el valor de una variable o la firma de una función. */
  detalle: string;
  esFuncion: boolean;
}

/** Funciones de math.js de uso habitual en una memoria, y las de la casa. */
export const FUNCIONES_BASE: Sugerencia[] = [
  ['sqrt', 'sqrt(x)'],
  ['abs', 'abs(x)'],
  ['min', 'min(a, b, …)'],
  ['max', 'max(a, b, …)'],
  ['round', 'round(x, n)'],
  ['floor', 'floor(x)'],
  ['ceil', 'ceil(x)'],
  ['sin', 'sin(θ)'],
  ['cos', 'cos(θ)'],
  ['tan', 'tan(θ)'],
  ['asin', 'asin(x)'],
  ['acos', 'acos(x)'],
  ['atan', 'atan(x)'],
  ['atan2', 'atan2(y, x)'],
  ['log', 'log(x, base)'],
  ['log10', 'log10(x)'],
  ['exp', 'exp(x)'],
  ['sum', 'sum(v)'],
  ['size', 'size(M)'],
  ['beta1', "beta1(f'c)"],
  ['sqrtfc', "sqrtfc(f'c)"],
  ['phiFlexion', 'phiFlexion(εt, εty)'],
].map(([nombre, detalle]) => ({ nombre, detalle, esFuncion: true }));

const LETRA = /[\p{L}_]/u;
const DE_NOMBRE = /[\p{L}\p{N}_]/u;

export interface Palabra {
  inicio: number;
  fin: number;
  /** Lo escrito entre el principio de la palabra y el cursor. */
  prefijo: string;
}

/**
 * La palabra que se está escribiendo en `cursor`, o `null` si ahí no se está
 * escribiendo un nombre.
 *
 * No lo es dentro de una cadena, ni justo detrás de un número: en `3m` la `m`
 * es una unidad, y sugerir variables ahí sería estorbar la forma más común de
 * escribir una cantidad.
 */
export function palabraEnCursor(texto: string, cursor: number): Palabra | null {
  // Dentro de una cadena: número impar de comillas antes del cursor.
  let comillas = 0;
  for (let i = 0; i < cursor; i++) {
    if (texto[i] === '\\') i++;
    else if (texto[i] === '"') comillas++;
  }
  if (comillas % 2 === 1) return null;

  let inicio = cursor;
  while (inicio > 0 && DE_NOMBRE.test(texto[inicio - 1])) inicio--;
  // Un nombre empieza por letra o `_`; lo que empieza por dígito es un número,
  // y un número con letras detrás es una cantidad con su unidad.
  if (inicio < cursor && !LETRA.test(texto[inicio])) return null;
  let fin = cursor;
  while (fin < texto.length && DE_NOMBRE.test(texto[fin])) fin++;
  return { inicio, fin, prefijo: texto.slice(inicio, cursor) };
}

/**
 * Las variables y funciones que la hoja define antes de la región `activeId`,
 * de la más cercana a la más lejana.
 *
 * Una variable redefinida sale una sola vez, con su última definición por
 * encima de la región, que es la que el motor le hará ver. El orden por
 * cercanía es el de SMath y el que se agradece al escribir: lo que se acaba de
 * definir es lo que se va a usar.
 */
export function variablesVisibles(
  regions: readonly Region[],
  results: SheetResults,
  activeId: string,
): Sugerencia[] {
  const activa = regions.find((r) => r.id === activeId);
  // El mismo orden de lectura con el que el motor resuelve el scope.
  const antes = regions
    .filter((r) => r.id !== activeId && (!activa || r.y < activa.y || (r.y === activa.y && r.x < activa.x)))
    .sort((a, b) => b.y - a.y || b.x - a.x);
  const vistos = new Set<string>();
  const out: Sugerencia[] = [];
  for (const r of antes) {
    const def = results[r.id]?.define;
    if (!def || vistos.has(def.nombre)) continue;
    vistos.add(def.nombre);
    out.push({ nombre: def.nombre, detalle: def.valor, esFuncion: Boolean(def.esFuncion) });
  }
  return out;
}

/**
 * Lo que un programa define dentro de sí mismo: sus parámetros, sus variables
 * locales y las de sus bucles. Todavía no están en ningún resultado —la región
 * se está escribiendo—, así que se leen del texto.
 */
export function localesDePrograma(src: string): Sugerencia[] {
  const nombres: string[] = [];
  const cabecera = /^\s*[\p{L}_][\p{L}\p{N}_]*\s*\(([^)]*)\)\s*:=/u.exec(src);
  if (cabecera) nombres.push(...cabecera[1].split(',').map((p) => p.trim()));
  for (const linea of src.split('\n').slice(1)) {
    const m =
      /^\s*([\p{L}_][\p{L}\p{N}_]*)\s*:=/u.exec(linea) ??
      /^\s*for\s+([\p{L}_][\p{L}\p{N}_]*)\s+in\b/u.exec(linea);
    if (m) nombres.push(m[1]);
  }
  return [...new Set(nombres.filter(Boolean))].map((nombre) => ({
    nombre,
    detalle: 'local',
    esFuncion: false,
  }));
}

/**
 * Los nombres que completan `prefijo`, mejores primero y como mucho `max`.
 *
 * Primero los que empiezan igual respetando mayúsculas, luego los que empiezan
 * igual sin respetarlas y al final los que lo contienen; dentro de cada grupo,
 * el orden de las fuentes (lo local, luego lo más cercano). Se omite el nombre
 * que ya está escrito entero: ofrecerlo obligaría a pulsar Enter dos veces para
 * salir de una fórmula que ya estaba terminada.
 */
export function candidatos(prefijo: string, fuentes: readonly Sugerencia[], max = 8): Sugerencia[] {
  const vistos = new Set<string>();
  const unicos = fuentes.filter((s) => !vistos.has(s.nombre) && vistos.add(s.nombre));
  if (prefijo === '') return unicos.slice(0, max);
  const p = prefijo.toLowerCase();
  const rango = (n: string): number => {
    if (n.startsWith(prefijo)) return 0;
    const l = n.toLowerCase();
    if (l.startsWith(p)) return 1;
    return l.includes(p) ? 2 : -1;
  };
  return unicos
    .filter((s) => s.nombre !== prefijo)
    .map((s, i) => ({ s, r: rango(s.nombre), i }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, max)
    .map((x) => x.s);
}

/**
 * El texto tras aceptar una sugerencia sobre `palabra`, y dónde queda el cursor.
 * Una función entra con sus paréntesis y el cursor dentro, salvo que ya los
 * llevara detrás.
 */
export function aplicarSugerencia(
  texto: string,
  palabra: Palabra,
  s: Sugerencia,
): { texto: string; cursor: number } {
  const resto = texto.slice(palabra.fin);
  const parentesis = s.esFuncion && !resto.startsWith('(');
  const insertado = parentesis ? `${s.nombre}()` : s.nombre;
  const cursor = palabra.inicio + s.nombre.length + (parentesis ? 1 : 0);
  return { texto: texto.slice(0, palabra.inicio) + insertado + resto, cursor };
}
