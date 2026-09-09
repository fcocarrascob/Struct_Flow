// Un trozo de hoja en el portapapeles: lo que copian Ctrl+C y Ctrl+X, y lo que
// reconoce Ctrl+V para pegar regiones en vez de reemplazar la hoja entera.
//
// La marca `fragmento: true` no es decorativa. El Ctrl+V del canvas ya
// intercepta el texto que parsea como hoja para cargarla completa; sin una marca
// explícita, pegar cinco bloques copiados borraría la planilla en la que se
// están pegando. Exigirla es lo que deja convivir los dos pegados.

import type { Region } from './worksheet';
import { esRegion, parsearJson } from './hoja-json';

/** Marca del formato. Se versiona junto al de la hoja. */
export const FRAGMENTO_VERSION = 1;

export interface Fragmento {
  version: number;
  fragmento: true;
  regions: Region[];
}

/**
 * Serializa las regiones indicadas, **en orden de lectura** y con las
 * coordenadas relativas a la esquina superior izquierda de la selección.
 *
 * Relativas porque el fragmento se pega en el punto de inserción, que puede
 * estar en otra hoja y en otro sitio: guardar las absolutas obligaría a restar
 * al pegar, y a acordarse de hacerlo en cada camino de entrada.
 */
export function aFragmento(regions: readonly Region[], ids: ReadonlySet<string>): Fragmento {
  const trozo = regions.filter((r) => ids.has(r.id)).sort((a, b) => a.y - b.y || a.x - b.x);
  const x0 = trozo.length ? Math.min(...trozo.map((r) => r.x)) : 0;
  const y0 = trozo.length ? Math.min(...trozo.map((r) => r.y)) : 0;
  return {
    version: FRAGMENTO_VERSION,
    fragmento: true,
    regions: trozo.map((r) => ({ ...r, x: r.x - x0, y: r.y - y0 })),
  };
}

/** El fragmento de un texto pegado, o `null` si no lo es. */
export function parsearFragmento(text: string): Fragmento | null {
  const data = parsearJson(text) as Partial<Fragmento> | null;
  if (!data || data.fragmento !== true || !Array.isArray(data.regions)) return null;
  const regions = data.regions.filter(esRegion);
  if (regions.length === 0) return null;
  return { version: Number(data.version) || FRAGMENTO_VERSION, fragmento: true, regions };
}

/**
 * Las regiones de un fragmento colocadas en `at`, con ids nuevos.
 *
 * El `id` se reasigna siempre, incluso pegando en otra hoja: dos regiones con el
 * mismo id comparten entrada en `results` y `key` de React, y se editan a la vez.
 */
export function desdeFragmento(
  frag: Fragmento,
  at: { x: number; y: number },
  nuevoId: () => string,
): Region[] {
  return frag.regions.map((r) => ({
    ...r,
    id: nuevoId(),
    x: Math.max(0, at.x + r.x),
    y: Math.max(0, at.y + r.y),
  }));
}
