// Evaluar un módulo y empaquetar su memoria.
//
// Vive acá y no dentro de la pantalla porque tiene dos consumidores: la
// interfaz y `verify:modulos`. Si el verificador reprodujera estos pasos por su
// cuenta, comprobaría su propia copia y no lo que exporta el botón.

import { evaluateSheet, type Region, type SheetResults } from '../worksheet';
import { layout } from '../worksheet-layout';
import type { HojaCanvas } from '../canvas-handoff';
import { metaDeInstancia } from './declarativo';
import type { Entradas, ModuloDiseno } from './tipos';

export interface EvaluacionModulo {
  regions: Region[];
  results: SheetResults;
  /**
   * El scope final. En un módulo TS es la instantánea que capturó la figura,
   * que va la última; en uno declarativo, la de un centinela.
   */
  scope: Record<string, unknown>;
  /** La figura del esquema, si la hoja la emitió. */
  figura?: Region;
  errores: { id: string; src: string; error: string }[];
}

/** Id del centinela que captura el scope final de una hoja sin figura al pie. */
const CENTINELA = '__scope_final';

export function evaluarModulo(
  modulo: ModuloDiseno<Entradas>,
  entradas: Entradas,
): EvaluacionModulo {
  const hoja = modulo.construirHoja(entradas);
  // Un módulo declarativo devuelve las regiones de la genérica, ya colocadas y
  // con sus saltos de página: re-colocarlas haría que la memoria exportada
  // dejara de ser la instancia que escribe el harness.
  const regions = modulo.declarativo ? (hoja as Region[]) : layout(modulo.id, 40, 40, hoja);
  const figura = [...regions].reverse().find((r) => r.kind === 'image');

  let results: SheetResults;
  let scope: Record<string, unknown>;
  if (modulo.declarativo) {
    // Sin figura obligatoria, el scope final lo captura una región `image`
    // vacía puesta debajo de todo (el motor la registra sin evaluarla). No se
    // devuelve en `regions`: no es parte de la memoria.
    const fondo = regions.reduce((max, r) => Math.max(max, Number.isFinite(r.y) ? r.y : 0), 0);
    const centinela: Region = { id: CENTINELA, kind: 'image', x: 40, y: fondo + 1e6, src: '' };
    results = evaluateSheet([...regions, centinela]);
    scope = results[CENTINELA]?.scope ?? {};
    delete results[CENTINELA];
  } else {
    results = evaluateSheet(regions);
    scope = (figura && results[figura.id]?.scope) ?? {};
  }

  const errores = regions
    .filter((r) => results[r.id]?.error)
    .map((r) => ({ id: r.id, src: r.src, error: results[r.id]!.error! }));
  return { regions, results, figura, scope, errores };
}

/**
 * La memoria lista para exportar.
 *
 * `meta.esperadoFalso` no es un adorno: `verify:planilla` falla ante una
 * comparación en ✗ que nadie declaró. Un diseño que todavía no cumple es un
 * resultado legítimo del módulo —al revés que en una planilla publicada, donde
 * un ✗ delata una regresión—, así que las ✗ del momento se anotan con su
 * motivo. Con eso, el archivo descargado pasa el verificador del repo tal cual.
 *
 * La de un módulo declarativo sale además como **instancia estampada** de su
 * genérica (`metaDeInstancia`): la hoja descargada entra a un proyecto del
 * harness sin retocar el `meta`.
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
  const conFalsos = Object.keys(esperadoFalso).length ? { esperadoFalso } : {};
  return {
    version: 1,
    meta: modulo.biblioteca
      ? { ...metaDeInstancia(modulo.biblioteca), ...conFalsos }
      : { titulo: `${modulo.titulo} — ${modulo.norma}`, ...conFalsos },
    regions,
  };
}
