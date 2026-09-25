// Una vista geométrica evaluada en su sitio del orden de lectura de la obra.
//
// Mismo camino que una genérica: los campos atados se resuelven contra el scope
// de la obra y se convierten a la unidad del campo con `resolverExpresion`, que
// divide por `1 <unidad>` en el propio motor; lo no atado toma el valor guardado
// o el de la vista. Con esos números se arma el modelo, se sintetiza su hoja y la
// hoja se evalúa sola, sin el scope de la obra: todo lo que usa está escrito en
// ella.
//
// Solo cuentan los campos de los componentes presentes: un campo de la silla
// atado en una base sin silla no se resuelve ni se imprime, y la atadura se
// conserva por si la silla vuelve.

import { evaluateSheet, type Region, type SheetResults } from '../../lib/worksheet';
import { resolverExpresion } from '../obra/biblioteca';
import type { Frontera } from '../obra/modelo';
import { hojaDeVista } from './hoja';
import { VISTAS, camposActivos, configCompleta } from './registro';
import type { Campo, Config, DefVista, ModeloGeometrico } from './tipos';

export interface VistaEvaluada {
  def: DefVista;
  config: Config;
  /** Los campos de los componentes presentes. */
  campos: Campo[];
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
  const config = configCompleta(def, f.config);
  const campos = camposActivos(def, config);
  const datos: Record<string, number> = {};
  const errores: VistaEvaluada['errores'] = [];
  for (const c of campos) datos[c.nombre] = f.entradas?.[c.nombre] ?? c.porDefecto;
  const atados = new Set<string>();
  for (const [campo, expr] of Object.entries(f.formulas ?? {})) {
    const c = campos.find((x) => x.nombre === campo);
    if (!c || !expr.trim()) continue;
    const r = resolverExpresion(expr, c.unidad || undefined, scope);
    if (r.valor !== undefined) {
      datos[campo] = r.valor;
      atados.add(campo);
    } else errores.push({ campo, error: r.error ?? 'no resolvió' });
  }
  const modelo = def.construir(datos, config);
  const hoja = hojaDeVista(def, config, campos, datos, atados, modelo, `vista:${idNodo}`);
  const centinela: Region = { id: CENTINELA, kind: 'image', x: 0, y: 1e9, src: '' };
  const results = evaluateSheet([...hoja, centinela], {});
  const salidas = results[CENTINELA]?.scope ?? {};
  delete results[CENTINELA];
  return { def, config, campos, datos, modelo, hoja, results, salidas, errores };
}
