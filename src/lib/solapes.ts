// Regiones que se pisan en la hoja.
//
// El canvas coloca los bloques con un paso vertical fijo, pero una región no
// mide siempre lo mismo: un bloque de programa multilínea llega a 600 px, y una
// región con error añade el mensaje debajo. Cuando el bloque de arriba es más
// alto de lo que el paso supuso, el de abajo le queda encima: se lee mal y el de
// arriba se come los clics del de abajo.
//
// Parte pura, sin React ni DOM: recibe las alturas ya medidas —quien las mide es
// el canvas, que para eso necesita un navegador— y devuelve qué se pisa y a
// dónde habría que moverlo.

import type { Region } from './worksheet';

/** Aire mínimo entre dos bloques al separarlos, en px. */
const AIRE = 8;

export interface Solape {
  /** La región que queda debajo, tapada. */
  id: string;
  /** La que la tapa. */
  porId: string;
  /** Cuánto se pisan en vertical, en px. */
  px: number;
}

/** Alto —o ancho— de cada región, medido en el DOM, por id. */
export type Medidas = ReadonlyMap<string, number>;

/**
 * Lo que se supone que mide una región de la que aún no hay medida. Se exportan
 * porque la caja que dibuja el rectángulo de selección (`seleccion.ts`) tiene
 * que ser la misma que la que mira este detector: si divergieran, el marco
 * atraparía bloques que aquí no se pisan.
 */
export const ALTO_POR_DEFECTO = 24;
export const ANCHO_POR_DEFECTO = 120;

function alto(r: Region, alturas: Medidas, porDefecto: number): number {
  return alturas.get(r.id) ?? r.h ?? porDefecto;
}

/** Ancho de una región. Solo las imágenes lo declaran; el resto se estima. */
function ancho(r: Region, anchos: Medidas, porDefecto: number): number {
  return anchos.get(r.id) ?? r.w ?? porDefecto;
}

/**
 * Los pares que se pisan, en orden de lectura.
 *
 * Dos regiones chocan solo si se solapan en los dos ejes. Eso permitía dos
 * columnas contiguas... hasta que el renderizado unificado le dio a TODA región
 * el ancho del papel (`MathRegion.tsx`, `A4_ANCHO_PX`): como el ancho se lee del
 * DOM, hoy vale 680 px para todas, así que dos bloques que compartan banda
 * vertical se declaran solapados aunque no se toquen.
 *
 * Queda dicho y no arreglado a propósito: la hoja va camino de ser una lista
 * ordenada, y ahí el solape es imposible por construcción y este módulo entero
 * sobra. Arreglar el ancho ahora sería afinar algo que se va a retirar.
 */
export function detectarSolapes(
  regions: readonly Region[],
  alturas: Medidas,
  anchos: Medidas,
  altoPorDefecto = ALTO_POR_DEFECTO,
  anchoPorDefecto = ANCHO_POR_DEFECTO,
): Solape[] {
  const orden = [...regions].sort((a, b) => a.y - b.y || a.x - b.x);
  const fuera: Solape[] = [];
  for (let i = 0; i < orden.length; i++) {
    const a = orden[i];
    const aFin = a.y + alto(a, alturas, altoPorDefecto);
    const aDer = a.x + ancho(a, anchos, anchoPorDefecto);
    for (let j = i + 1; j < orden.length; j++) {
      const b = orden[j];
      // La lista está ordenada por `y`: en cuanto una empieza por debajo del
      // final de `a`, ninguna de las siguientes puede pisarla.
      if (b.y >= aFin) break;
      const bDer = b.x + ancho(b, anchos, anchoPorDefecto);
      if (a.x < bDer && b.x < aDer) {
        fuera.push({ id: b.id, porId: a.id, px: Math.round(aFin - b.y) });
      }
    }
  }
  return fuera;
}

/**
 * Empuja hacia abajo lo justo para que nada se pise, y devuelve las regiones
 * ya recolocadas (o las mismas, si no había nada que hacer).
 *
 * Solo mueve en vertical y solo hacia abajo. Es deliberado: el orden de lectura
 * —arriba→abajo, izquierda→derecha— es el que resuelve el scope compartido, así
 * que reordenar las regiones cambiaría qué variable ve cada fórmula y podría
 * alterar los números. Empujando hacia abajo en orden, cada región conserva a
 * todas las que ya la precedían.
 */
export function separarSolapes(
  regions: readonly Region[],
  alturas: Medidas,
  anchos: Medidas,
  grid = 16,
  altoPorDefecto = ALTO_POR_DEFECTO,
  anchoPorDefecto = ANCHO_POR_DEFECTO,
): Region[] {
  const orden = [...regions].sort((a, b) => a.y - b.y || a.x - b.x);
  const nuevaY = new Map<string, number>();
  const yDe = (r: Region) => nuevaY.get(r.id) ?? r.y;

  for (let i = 0; i < orden.length; i++) {
    const a = orden[i];
    const aY = yDe(a);
    const aFin = aY + alto(a, alturas, altoPorDefecto);
    const aDer = a.x + ancho(a, anchos, anchoPorDefecto);
    for (let j = i + 1; j < orden.length; j++) {
      const b = orden[j];
      const bY = yDe(b);
      if (bY >= aFin + AIRE) continue;
      const bDer = b.x + ancho(b, anchos, anchoPorDefecto);
      if (a.x < bDer && b.x < aDer) {
        // A la cuadrícula, para que siga alineada con el resto de la hoja.
        const destino = Math.ceil((aFin + AIRE) / grid) * grid;
        if (destino > bY) nuevaY.set(b.id, destino);
      }
    }
  }

  if (nuevaY.size === 0) return regions as Region[];
  return regions.map((r) => (nuevaY.has(r.id) ? { ...r, y: nuevaY.get(r.id)! } : r));
}

/**
 * ¿Las dos disposiciones se leen en el mismo orden?
 *
 * Es la comprobación que hace segura la separación: si el orden cambiara,
 * cambiaría el scope y con él los resultados de la hoja.
 */
export function mismoOrdenDeLectura(antes: readonly Region[], después: readonly Region[]): boolean {
  const clave = (rs: readonly Region[]) =>
    [...rs]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((r) => r.id)
      .join(',');
  return clave(antes) === clave(después);
}

/**
 * Abre un hueco: baja `px` todo lo que empiece en `desdeY` o más abajo.
 *
 * Es lo que necesita «Enter abre una línea de espacio». `separarSolapes` no
 * sirve para esto: solo reacciona a colisiones que ya existen y nunca separa lo
 * que no se pisa, y `aplicarArrastre` mueve únicamente el grupo anclado.
 *
 * El orden de lectura se conserva por construcción —lo de arriba no se mueve y
 * lo de abajo se desplaza TODO lo mismo, así que ningún bloque adelanta a otro—,
 * pero quien la use debe pasar el resultado por `mismoOrdenDeLectura` de todos
 * modos: ese orden resuelve el scope compartido, y ahí no se confía en un
 * razonamiento cuando comprobarlo cuesta una comparación de cadenas.
 *
 * Devuelve el mismo array si no movió nada, igual que `separarSolapes` y
 * `aplicarArrastre`, para no disparar una reevaluación de la hoja de balde.
 */
export function abrirHueco(regions: readonly Region[], desdeY: number, px: number): Region[] {
  if (px <= 0) return regions as Region[];
  let tocado = false;
  const salida = regions.map((r) => {
    if (r.y < desdeY) return r;
    tocado = true;
    return { ...r, y: r.y + px };
  });
  return tocado ? salida : (regions as Region[]);
}
