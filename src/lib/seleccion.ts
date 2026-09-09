// Selección de varias regiones y movimiento en grupo.
//
// Parte pura, sin React ni DOM: recibe las medidas ya tomadas —quien las mide es
// el canvas, que para eso necesita un navegador— y devuelve qué cae dentro de un
// rectángulo y a dónde va cada región al arrastrar el grupo.
//
// Los tamaños por defecto son los mismos de `solapes.ts` a propósito: las dos
// cosas dibujan la misma caja alrededor de una región, y si divergieran, el
// rectángulo de selección atraparía bloques que el detector de solapes no ve.

import type { Region } from './worksheet';
import { ALTO_POR_DEFECTO, ANCHO_POR_DEFECTO, type Medidas } from './solapes';

/** Un rectángulo en coordenadas de la hoja, ya normalizado (`w`/`h` ≥ 0). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** El rectángulo que definen dos esquinas, en cualquier orden. */
export function rectEntre(
  a: { x: number; y: number },
  b: { x: number; y: number },
): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

/** La caja de una región: su posición más el tamaño medido (o el supuesto). */
export function cajaDe(r: Region, alturas: Medidas, anchos: Medidas): Rect {
  return {
    x: r.x,
    y: r.y,
    w: anchos.get(r.id) ?? r.w ?? ANCHO_POR_DEFECTO,
    h: alturas.get(r.id) ?? r.h ?? ALTO_POR_DEFECTO,
  };
}

/**
 * Las regiones que **toca** el rectángulo.
 *
 * Por intersección y no por contención: es lo que hace SMath, y es lo que se
 * espera al barrer una columna de bloques de anchos distintos — exigir que el
 * rectángulo envuelva el bloque entero obliga a barrer hasta el más ancho.
 */
export function enRectangulo(
  regions: readonly Region[],
  alturas: Medidas,
  anchos: Medidas,
  rect: Rect,
): string[] {
  const fuera: string[] = [];
  for (const r of regions) {
    const c = cajaDe(r, alturas, anchos);
    if (rect.x < c.x + c.w && c.x < rect.x + rect.w && rect.y < c.y + c.h && c.y < rect.y + rect.h) {
      fuera.push(r.id);
    }
  }
  return fuera;
}

/**
 * Lo que se congela al empezar a arrastrar un grupo.
 *
 * Se toma una instantánea en vez de ir acumulando incrementos porque un arrastre
 * son decenas de `pointermove`: aplicar un delta relativo en cada uno acumula el
 * error de redondeo de la cuadrícula, y el grupo se descuadra por el camino.
 */
export interface Anclaje {
  /** Posición de cada región del grupo al empezar. */
  origen: ReadonlyMap<string, { x: number; y: number }>;
  /** La región bajo el puntero: sobre ella se ajusta el delta a la cuadrícula. */
  ancla: { x: number; y: number };
  /** Esquina superior izquierda del grupo, para no sacarlo de la hoja. */
  min: { x: number; y: number };
}

/** Congela el grupo que se va a mover. `null` si no hay nada que mover. */
export function anclar(
  regions: readonly Region[],
  ids: ReadonlySet<string>,
  idAncla: string,
): Anclaje | null {
  const origen = new Map<string, { x: number; y: number }>();
  let minX = Infinity;
  let minY = Infinity;
  for (const r of regions) {
    if (!ids.has(r.id)) continue;
    origen.set(r.id, { x: r.x, y: r.y });
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
  }
  const ancla = origen.get(idAncla);
  if (!ancla) return null;
  return { origen, ancla, min: { x: minX, y: minY } };
}

/**
 * El desplazamiento que de verdad se aplica: uno solo para todo el grupo.
 *
 * Se ajusta a la cuadrícula sobre la región **anclada** y luego se acota para
 * que la esquina del grupo no se salga por arriba ni por la izquierda. Los dos
 * detalles son la misma idea: se corrige el DELTA, no cada región. Ajustando
 * región por región, dos bloques que no estén en la misma fase de la cuadrícula
 * se moverían distinto; acotando región por región, la que llega antes al borde
 * se queda ahí mientras las demás siguen, y el grupo se aplasta contra la
 * esquina en vez de moverse rígido.
 */
export function deltaDeArrastre(
  a: Anclaje,
  dx: number,
  dy: number,
  snap: (v: number) => number,
): { dx: number; dy: number } {
  return {
    dx: Math.max(snap(a.ancla.x + dx) - a.ancla.x, -a.min.x),
    dy: Math.max(snap(a.ancla.y + dy) - a.ancla.y, -a.min.y),
  };
}

/**
 * Mueve el grupo a partir de la instantánea. Devuelve el mismo array si ninguna
 * región cambia de sitio, para no disparar una evaluación de la hoja entera por
 * un `pointermove` que no movió nada.
 */
export function aplicarArrastre(
  regions: readonly Region[],
  a: Anclaje,
  dx: number,
  dy: number,
): Region[] {
  let cambio = false;
  const siguiente = regions.map((r) => {
    const o = a.origen.get(r.id);
    if (!o) return r;
    const x = o.x + dx;
    const y = o.y + dy;
    if (r.x === x && r.y === y) return r;
    cambio = true;
    return { ...r, x, y };
  });
  return cambio ? siguiente : (regions as Region[]);
}

/**
 * Copias desplazadas de las regiones indicadas, con ids nuevos.
 *
 * Devuelve solo las copias (no la hoja entera) y **en orden de lectura**, para
 * que al añadirlas al final el array conserve una forma razonable.
 */
export function duplicar(
  regions: readonly Region[],
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
  nuevoId: () => string,
): Region[] {
  return regions
    .filter((r) => ids.has(r.id))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((r) => ({ ...r, id: nuevoId(), x: Math.max(0, r.x + dx), y: Math.max(0, r.y + dy) }));
}
