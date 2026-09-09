// Evaluar un módulo y empaquetar su memoria.
//
// Vive acá y no dentro de la pantalla porque tiene dos consumidores: la
// interfaz y `verify:modulos`. Si el verificador reprodujera estos pasos por su
// cuenta, comprobaría su propia copia y no lo que exporta el botón.

import { evaluateSheet, type Region, type SheetResults } from '../worksheet';
import { layout } from '../worksheet-layout';
import type { HojaCanvas } from '../canvas-handoff';
import type { Entradas, ModuloDiseno } from './tipos';

export interface EvaluacionModulo {
  regions: Region[];
  results: SheetResults;
  /** El scope final: la instantánea que capturó la figura, que va la última. */
  scope: Record<string, unknown>;
  /** La figura del esquema, si la hoja la emitió. */
  figura?: Region;
  errores: { id: string; src: string; error: string }[];
}

export function evaluarModulo(
  modulo: ModuloDiseno<Entradas>,
  entradas: Entradas,
): EvaluacionModulo {
  const regions = layout(modulo.id, 40, 40, modulo.construirHoja(entradas));
  const results = evaluateSheet(regions);
  const figura = [...regions].reverse().find((r) => r.kind === 'image');
  const errores = regions
    .filter((r) => results[r.id]?.error)
    .map((r) => ({ id: r.id, src: r.src, error: results[r.id]!.error! }));
  return {
    regions,
    results,
    figura,
    scope: (figura && results[figura.id]?.scope) ?? {},
    errores,
  };
}

/**
 * La memoria lista para exportar.
 *
 * `meta.esperadoFalso` no es un adorno: `verify:planilla` falla ante una
 * comparación en ✗ que nadie declaró. Un diseño que todavía no cumple es un
 * resultado legítimo del módulo —al revés que en una planilla publicada, donde
 * un ✗ delata una regresión—, así que las ✗ del momento se anotan con su
 * motivo. Con eso, el archivo descargado pasa el verificador del repo tal cual.
 */
export function hojaDeModulo(
  modulo: ModuloDiseno<Entradas>,
  { regions, results }: EvaluacionModulo,
): HojaCanvas {
  const esperadoFalso: Record<string, string> = {};
  for (const r of regions) {
    if (results[r.id]?.bool === false) {
      esperadoFalso[r.id] = `no se cumple con los datos exportados: ${r.src.split('\n')[0]}`;
    }
  }
  return {
    version: 1,
    meta: {
      titulo: `${modulo.titulo} — ${modulo.norma}`,
      ...(Object.keys(esperadoFalso).length ? { esperadoFalso } : {}),
    },
    regions,
  };
}
