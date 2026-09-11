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
  /** Solo `image`: tamaño mostrado en píxeles. */
  w?: number;
  h?: number;
  /**
   * Id a conservar. Sin él, `layout()` asigna `<prefijo>-<i>`, que es lo que
   * quieren los módulos escritos en TS. Un módulo que nace de una planilla de
   * la biblioteca lo trae puesto: sus `in_*`, `v_*` y `c_*` son parte del
   * contrato y tienen que sobrevivir a la instanciación.
   */
  id?: string;
}

export const m = (src: string): Item => ({ kind: 'math', src });
export const t = (src: string): Item => ({ kind: 'text', src });
export const p = (src: string): Item => ({ kind: 'program', src });

/**
 * Una figura: un esquema paramétrico de `/esquemas/` o una imagen incrustada.
 *
 * La región `image` no se evalúa, pero **sí participa del orden de lectura**:
 * captura una instantánea del scope en su posición, y es esa instantánea la que
 * resuelve los tokens `{{expr:unidad}}` del SVG. O sea que dónde se coloca no es
 * cosmético — un esquema emitido antes de los cálculos que rotula saldría con
 * los tokens sin resolver, y `verify:planilla` lo rechazaría.
 */
export const img = (src: string, w: number, h: number): Item => ({ kind: 'image', src, w, h });

/** Separación entre bloques de una línea. Es también el paso de inserción del canvas. */
const PASO = 46;

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
    const region: Region = { id: it.id ?? `${idPrefix}-${i}`, kind: it.kind, x, y, src: it.src };
    if (it.kind === 'image') {
      if (it.w) region.w = it.w;
      if (it.h) region.h = it.h;
      // Reservar el alto de la figura, y no el paso fijo, es lo que evita que
      // la región siguiente quede debajo del dibujo. En el corpus publicado ese
      // hueco está dejado a mano (en `viga-flexion-corte.json`, un salto suelto
      // de ~450 px); quien genere una hoja no debería tener que calcularlo.
      y += (it.h ?? 400) + PASO;
    } else {
      const lines = it.src.split('\n').length;
      y += lines > 1 ? lines * 22 + 28 : PASO;
    }
    return region;
  });
}
