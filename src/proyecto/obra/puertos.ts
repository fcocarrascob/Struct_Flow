// ─────────────────────────────────────────────────────────────────────────────
// Los puertos de una obra: lo que un nodo publica, con tipo.
//
// Hoy un nombre publicado vive en un espacio global y lo que dice de sí va
// codificado en el sufijo: `N_v_CP_O0` es la compresión que acompaña al corte
// máximo del tipo CP en el conjunto O0, y si ese conjunto es una envolvente o
// un espectro lo dice otro nombre, `nc_v_CP_O0`. El diseño de los puertos con
// tipo está en `docs/rumbo.md` («Puertos con tipo»); esto es el primer paso, y
// no cambia el formato de la obra: el descriptor se DERIVA de lo que ya hay.
//
//   - La dimensión no se guarda: un nombre es compatible con un campo si el
//     motor lo convierte a la unidad del campo (`resolverExpresion`, la misma
//     operación que usa un campo atado).
//   - Una gobernante del nodo de apoyos se lee por su forma
//     (`<magnitud>_<criterio>_<tipo>_<conjunto>`, `sap-apoyos.ts`), y es
//     concurrente salvo que su `nc_*` valga 1.
// ─────────────────────────────────────────────────────────────────────────────

import { formatValor } from '../../lib/worksheet';
import { resolverExpresion } from './biblioteca';

export interface Gobernante {
  magnitud: 'N' | 'V' | 'M';
  criterio: 'c' | 't' | 'v' | 'm' | 'e';
  tipo: string;
  conjunto: string;
}

export interface Puerto {
  nombre: string;
  /** El valor como lo muestra la aplicación. */
  texto: string;
  gobernante?: Gobernante;
  /**
   * Solo una gobernante: `false` si sale de una envolvente o un espectro, y su M,
   * N y V no ocurren a la vez.
   */
  concurrente?: boolean;
}

const GOBERNANTE = /^([NVM])_([ctvme])_([A-Za-z][A-Za-z0-9]*)_([A-Za-z][A-Za-z0-9]*)$/;

/** La gobernante que es un nombre, o `undefined`. */
export function gobernanteDe(nombre: string): Gobernante | undefined {
  const m = GOBERNANTE.exec(nombre);
  return m ? { magnitud: m[1] as Gobernante['magnitud'], criterio: m[2] as Gobernante['criterio'], tipo: m[3], conjunto: m[4] } : undefined;
}

/** Si una gobernante es concurrente en este scope: `undefined` si no es una, o no se sabe. */
export function concurrenteEn(nombre: string, scope: Record<string, unknown>): boolean | undefined {
  const g = gobernanteDe(nombre);
  if (!g) return undefined;
  const nc = scope[`nc_${g.criterio}_${g.tipo}_${g.conjunto}`];
  return nc === 1 ? false : nc === 0 ? true : undefined;
}

const cache = new WeakMap<Record<string, unknown>, Map<string, Puerto[]>>();

/**
 * Los nombres del scope que un campo con esta unidad puede atar sin error: las
 * gobernantes primero, después el resto en orden alfabético. Se memoiza por scope
 * y unidad, porque la ficha lo pide por cada campo en cada render.
 */
export function puertosCompatibles(scope: Record<string, unknown>, unidad: string | undefined): Puerto[] {
  const porUnidad = cache.get(scope) ?? new Map<string, Puerto[]>();
  cache.set(scope, porUnidad);
  const clave = unidad ?? '';
  const hecho = porUnidad.get(clave);
  if (hecho) return hecho;
  const salida: Puerto[] = [];
  for (const [nombre, valor] of Object.entries(scope)) {
    if (typeof valor === 'function' || typeof valor === 'boolean' || valor === undefined || nombre.startsWith('nc_')) continue;
    if (resolverExpresion(nombre, unidad, scope).error) continue;
    let texto: string;
    try {
      texto = formatValor(valor);
    } catch {
      continue;
    }
    const gobernante = gobernanteDe(nombre);
    const concurrente = concurrenteEn(nombre, scope);
    salida.push({ nombre, texto, ...(gobernante ? { gobernante } : {}), ...(concurrente !== undefined ? { concurrente } : {}) });
  }
  salida.sort((a, b) => Number(!a.gobernante) - Number(!b.gobernante) || a.nombre.localeCompare(b.nombre));
  porUnidad.set(clave, salida);
  return salida;
}
