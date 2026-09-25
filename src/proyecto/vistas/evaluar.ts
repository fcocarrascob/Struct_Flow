// Una vista geométrica evaluada en su sitio del orden de lectura de la obra.
//
// Mismo camino que una genérica: los campos atados se resuelven contra el scope
// de la obra y se convierten a la unidad del campo con `resolverExpresion`, que
// divide por `1 <unidad>` en el propio motor; lo no atado toma el valor guardado
// o el de la vista. Con esos números se arma el modelo, se sintetiza su hoja y la
// hoja se evalúa sola, sin el scope de la obra: todo lo que usa está escrito en
// ella.

import { evaluateSheet, type Region, type SheetResults } from '../../lib/worksheet';
import { resolverExpresion } from '../obra/biblioteca';
import type { Frontera } from '../obra/modelo';
import { hojaDeVista } from './hoja';
import { VISTAS } from './registro';
import type { DefVista, ModeloGeometrico } from './tipos';

export interface VistaEvaluada {
  def: DefVista;
  datos: Record<string, number>;
  modelo: ModeloGeometrico;
  hoja: Region[];
  results: SheetResults;
  salidas: Record<string, unknown>;
  /** Los campos atados que no resolvieron: conservan su valor y el error se dice. */
  errores: { campo: string; error: string }[];
}

const CENTINELA = '__scope_vista';

export function evaluarVista(f: Frontera, scope: Record<string, unknown>, idNodo: string): VistaEvaluada | null {
  const def = f.vista ? VISTAS[f.vista] : undefined;
  if (!def) return null;
  const datos: Record<string, number> = {};
  const errores: VistaEvaluada['errores'] = [];
  for (const c of def.campos) datos[c.nombre] = f.entradas?.[c.nombre] ?? c.porDefecto;
  const atados = new Set<string>();
  for (const [campo, expr] of Object.entries(f.formulas ?? {})) {
    const c = def.campos.find((x) => x.nombre === campo);
    if (!c || !expr.trim()) continue;
    const r = resolverExpresion(expr, c.unidad || undefined, scope);
    if (r.valor !== undefined) {
      datos[campo] = r.valor;
      atados.add(campo);
    } else errores.push({ campo, error: r.error ?? 'no resolvió' });
  }
  const modelo = def.construir(datos);
  const hoja = hojaDeVista(def, datos, atados, modelo, `vista:${idNodo}`);
  const centinela: Region = { id: CENTINELA, kind: 'image', x: 0, y: 1e9, src: '' };
  const results = evaluateSheet([...hoja, centinela], {});
  const salidas = results[CENTINELA]?.scope ?? {};
  delete results[CENTINELA];
  return { def, datos, modelo, hoja, results, salidas, errores };
}
