// Constructores de regiones para armar una hoja del canvas en una sola columna.
//
// Vive aparte de worksheet-templates.ts porque quien genera una hoja no siempre
// necesita el motor: los tipos de `worksheet` son type-only y se borran al
// compilar, así que importar de acá NO arrastra mathjs al bundle. El generador
// de memorias del verificador de secciones depende de eso.

import type { Region, RegionKind } from './worksheet';

export interface Item {
  kind: RegionKind;
  src: string;
}

export const m = (src: string): Item => ({ kind: 'math', src });
export const t = (src: string): Item => ({ kind: 'text', src });
export const p = (src: string): Item => ({ kind: 'program', src });

/**
 * Coloca los ítems en una columna, calculando `y` según el alto de cada región
 * (las de programa/multilínea ocupan más). Devuelve regiones listas para la hoja.
 *
 * Una sola columna es deliberado: el scope compartido de `evaluateSheet` se
 * resuelve en orden de lectura (y, luego x), y una columna lo hace predecible.
 */
export function layout(idPrefix: string, x: number, y0: number, items: Item[]): Region[] {
  let y = y0;
  return items.map((it, i) => {
    const region: Region = { id: `${idPrefix}-${i}`, kind: it.kind, x, y, src: it.src };
    const lines = it.src.split('\n').length;
    y += lines > 1 ? lines * 22 + 28 : 46;
    return region;
  });
}
