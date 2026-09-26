// ─────────────────────────────────────────────────────────────────────────────
// Una propuesta: la obra como está, la obra como quedaría y qué cambia entre
// las dos, en números.
//
// Salió de cómo se trabajó el Pachón (2026-09-25): cada cambio de armado se
// corría en seco, se miraba una tabla de usos antes y después, se respaldaba la
// obra y recién entonces se escribía. Aquí esa tabla es una función pura, y la
// comparten el diálogo de la aplicación (`DialogoPropuesta.tsx`), la CLI del
// asistente (`npm run obra:comparar`) y `verify:obra`. El asistente propone; el
// usuario ve lo que cambia y acepta o rechaza (`docs/rumbo.md`, «El contrato del
// asistente»).
//
// Lo que se compara, por nodo de cálculo:
//   - su estado: nuevo, quitado, modificado (cambió su documento) o afectado (no
//     cambió, pero sí lo que le llega);
//   - la severidad del lienzo y el veredicto (`v_global`);
//   - los usos y verificaciones (`u_*`, `v_*`, `gobierna`) y los chequeos de una
//     vista, formateados como los muestra la aplicación;
//   - los datos: campos fijados, atados, lo que publica y la configuración;
//   - los bloques de su hoja: agregados, quitados y editados.
// ─────────────────────────────────────────────────────────────────────────────

import { formatValor } from '../../lib/worksheet';
import type { Region } from '../../lib/worksheet';
import { ORDEN_SEVERIDAD, type Severidad } from '../grafo';
import type { Genericas } from './biblioteca';
import { evaluarObra, type EvaluacionObra } from './evaluacion';
import { idNodoDeCalculo } from './ids';
import type { NodoCalculo, Obra } from './modelo';
import { proyectar } from './proyeccion';

export interface Cambio {
  nombre: string;
  antes?: string;
  despues?: string;
  /** Lo que un revisor mira primero: un uso que sube, una verificación que cae. */
  tendencia: Tendencia;
}

export type Tendencia = 'empeora' | 'mejora' | 'neutra';

export interface FilaNodo {
  /** El id del cálculo en la obra. */
  id: string;
  nombre: string;
  estado: 'nuevo' | 'quitado' | 'modificado' | 'afectado';
  severidad: { antes?: Severidad; despues?: Severidad };
  veredicto: { antes?: string; despues?: string };
  usos: Cambio[];
  datos: Cambio[];
  /** `renombrados` es el mismo bloque bajo otro id: no cambia lo que dice. */
  bloques: { agregados: string[]; quitados: string[]; editados: string[]; renombrados: string[] };
  tendencia: Tendencia;
}

export interface Comparacion {
  nodos: FilaNodo[];
  sinCambios: boolean;
  empeoran: number;
  mejoran: number;
}

const ES_USO = /^(u_|v_|gobierna$)/;

/** Los usos y verificaciones de un nodo, ya formateados. */
function usosDe(k: NodoCalculo, ev: EvaluacionObra): Map<string, { texto: string; valor: unknown }> {
  const salida = new Map<string, { texto: string; valor: unknown }>();
  const idNodo = idNodoDeCalculo(k.id);
  const inst = ev.importadas.get(idNodo);
  const poner = (nombre: string, valor: unknown) => {
    if (valor === undefined || typeof valor === 'function') return;
    let texto: string;
    try {
      texto = formatValor(valor);
    } catch {
      texto = String(valor);
    }
    salida.set(nombre, { texto, valor });
  };
  if (inst) {
    for (const [n, v] of Object.entries(inst.salidas)) if (ES_USO.test(n)) poner(n, v);
    for (const c of inst.vista?.modelo.chequeos ?? []) {
      const valor = `${formatValor(c.valor)} ${c.sentido} ${formatValor(c.limite)} ${c.unidad}`.trim();
      salida.set(`chequeo ${c.id}`, { texto: `${valor} ${c.cumple ? '✓' : c.aviso ? '⚠' : '✗'}`, valor: c.cumple });
    }
  } else {
    // Una hoja libre: sus verificaciones y usos, con el valor que tienen en la obra.
    for (const n of ev.define.get(idNodo) ?? []) if (ES_USO.test(n)) poner(n, ev.scope[n]);
  }
  return salida;
}

function veredictoDe(k: NodoCalculo, ev: EvaluacionObra): string | undefined {
  const g = ev.importadas.get(idNodoDeCalculo(k.id))?.salidas.v_global;
  return g === true ? 'CUMPLE' : g === false ? 'NO CUMPLE' : undefined;
}

/** Si un valor que pasa de `a` a `b` es peor, mejor o ni una cosa ni otra. */
function tendenciaDe(nombre: string, a: unknown, b: unknown): Tendencia {
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    if (a === true && b !== true) return 'empeora';
    if (a !== true && b === true) return 'mejora';
    return 'neutra';
  }
  // Un uso que sube pierde margen aunque siga bajo uno: es lo que el revisor mira.
  if (nombre.startsWith('u_') && typeof a === 'number' && typeof b === 'number') {
    return b > a ? 'empeora' : b < a ? 'mejora' : 'neutra';
  }
  return 'neutra';
}

const contenido = (r: Region) => JSON.stringify({ kind: r.kind, src: r.src, tabla: r.tabla, imprimir: r.imprimir, grafico: r.grafico });

function datosQueCambian(a: NodoCalculo | undefined, b: NodoCalculo | undefined): Cambio[] {
  const salida: Cambio[] = [];
  if (a && b && a.nombre !== b.nombre) salida.push({ nombre: 'nombre', antes: a.nombre, despues: b.nombre, tendencia: 'neutra' });
  const fa = a?.frontera;
  const fb = b?.frontera;
  const mapa = (etiqueta: string, x: Record<string, unknown> = {}, y: Record<string, unknown> = {}, mostrar = (v: unknown) => String(v)) => {
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (JSON.stringify(x[k]) === JSON.stringify(y[k])) continue;
      salida.push({
        nombre: `${etiqueta} ${k}`,
        ...(k in x ? { antes: mostrar(x[k]) } : {}),
        ...(k in y ? { despues: mostrar(y[k]) } : {}),
        tendencia: 'neutra',
      });
    }
  };
  mapa('dato', fa?.entradas, fb?.entradas, (v) => formatValor(v));
  mapa('atado', fa?.formulas, fb?.formulas);
  mapa('publica', fa?.publica, fb?.publica);
  mapa('opción', fa?.config, fb?.config);
  return salida;
}

function bloquesQueCambian(a: NodoCalculo | undefined, b: NodoCalculo | undefined): FilaNodo['bloques'] {
  const ha = new Map((a?.hoja ?? []).map((r) => [r.id, r]));
  const hb = new Map((b?.hoja ?? []).map((r) => [r.id, r]));
  const corto = (id: string, k?: NodoCalculo) => (k && id.startsWith(`${k.id}:`) ? id.slice(k.id.length + 1) : id);
  // Un bloque con el mismo contenido bajo otro id no cambió: se renombró (una
  // base alineada con los ids de su plantilla). Se empareja antes de mirar ids.
  const deA = new Set<string>();
  const deB = new Set<string>();
  const renombrados: string[] = [];
  for (const [idB, rb] of hb) {
    if (ha.has(idB) && contenido(ha.get(idB)!) === contenido(rb)) continue;
    const c = contenido(rb);
    const idA = [...ha.keys()].find((x) => x !== idB && !deA.has(x) && contenido(ha.get(x)!) === c && !(hb.has(x) && contenido(hb.get(x)!) === c));
    if (!idA) continue;
    deA.add(idA);
    deB.add(idB);
    renombrados.push(`${corto(idA, a)} → ${corto(idB, b)}`);
  }
  return {
    agregados: [...hb.keys()].filter((id) => !ha.has(id) && !deB.has(id)).map((id) => corto(id, b)),
    quitados: [...ha.keys()].filter((id) => !hb.has(id) && !deA.has(id)).map((id) => corto(id, a)),
    editados: [...hb.entries()]
      .filter(([id, r]) => ha.has(id) && !deB.has(id) && !deA.has(id) && contenido(ha.get(id)!) !== contenido(r))
      .map(([id]) => corto(id, b)),
    renombrados,
  };
}

/**
 * Qué cambia entre dos obras, nodo por nodo, lo que empeora primero. Las
 * evaluaciones se pueden pasar si ya se tienen —la aplicación tiene siempre la de
 * la obra abierta—; si no, se calculan.
 */
export function compararObras(
  antes: Obra,
  despues: Obra,
  genericas: Genericas = {},
  evaluaciones: { antes?: EvaluacionObra; despues?: EvaluacionObra } = {},
): Comparacion {
  const evA = evaluaciones.antes ?? evaluarObra(antes, genericas);
  const evB = evaluaciones.despues ?? evaluarObra(despues, genericas);
  const nodosA = new Map(proyectar(antes, evA, genericas).nodos.map((n) => [n.id, n]));
  const nodosB = new Map(proyectar(despues, evB, genericas).nodos.map((n) => [n.id, n]));
  const porIdA = new Map(antes.calculos.map((k) => [k.id, k]));
  const porIdB = new Map(despues.calculos.map((k) => [k.id, k]));
  const orden = [...despues.calculos.map((k) => k.id), ...antes.calculos.map((k) => k.id).filter((id) => !porIdB.has(id))];

  const filas: FilaNodo[] = [];
  for (const id of orden) {
    const a = porIdA.get(id);
    const b = porIdB.get(id);
    const idNodo = idNodoDeCalculo(id);
    const usosA = a ? usosDe(a, evA) : new Map();
    const usosB = b ? usosDe(b, evB) : new Map();
    const usos: Cambio[] = [];
    for (const n of new Set([...usosA.keys(), ...usosB.keys()])) {
      const x = usosA.get(n);
      const y = usosB.get(n);
      if (x?.texto === y?.texto) continue;
      usos.push({
        nombre: n,
        ...(x ? { antes: x.texto } : {}),
        ...(y ? { despues: y.texto } : {}),
        tendencia: a && b ? tendenciaDe(n, x?.valor, y?.valor) : 'neutra',
      });
    }
    const datos = datosQueCambian(a, b);
    const bloques = bloquesQueCambian(a, b);
    const severidad = { antes: nodosA.get(idNodo)?.severidad, despues: nodosB.get(idNodo)?.severidad };
    const veredicto = { antes: a ? veredictoDe(a, evA) : undefined, despues: b ? veredictoDe(b, evB) : undefined };
    const documento = datos.length > 0 || Object.values(bloques).some((x) => x.length > 0);
    const estado: FilaNodo['estado'] = !a ? 'nuevo' : !b ? 'quitado' : documento ? 'modificado' : 'afectado';
    const cambioSeveridad = severidad.antes !== severidad.despues;
    if (estado === 'afectado' && !usos.length && !cambioSeveridad && veredicto.antes === veredicto.despues) continue;

    let tendencia: Tendencia = 'neutra';
    const sube = severidad.antes && severidad.despues ? ORDEN_SEVERIDAD[severidad.despues] - ORDEN_SEVERIDAD[severidad.antes] : 0;
    if (veredicto.antes === 'CUMPLE' && veredicto.despues === 'NO CUMPLE') tendencia = 'empeora';
    else if (veredicto.antes === 'NO CUMPLE' && veredicto.despues === 'CUMPLE') tendencia = 'mejora';
    else if (sube > 0) tendencia = 'empeora';
    else if (sube < 0) tendencia = 'mejora';
    else if (usos.some((u) => u.tendencia === 'empeora')) tendencia = 'empeora';
    else if (usos.some((u) => u.tendencia === 'mejora')) tendencia = 'mejora';

    filas.push({ id, nombre: (b ?? a)!.nombre, estado, severidad, veredicto, usos, datos, bloques, tendencia });
  }
  const peso: Record<Tendencia, number> = { empeora: 0, mejora: 1, neutra: 2 };
  const nodos = filas.map((f, i) => ({ f, i })).sort((x, y) => peso[x.f.tendencia] - peso[y.f.tendencia] || x.i - y.i).map((x) => x.f);
  return {
    nodos,
    sinCambios: nodos.length === 0,
    empeoran: nodos.filter((f) => f.tendencia === 'empeora').length,
    mejoran: nodos.filter((f) => f.tendencia === 'mejora').length,
  };
}

/** La comparación como texto plano, para la terminal del asistente y los respaldos. */
export function comparacionEnTexto(c: Comparacion): string {
  if (c.sinCambios) return 'Sin cambios: la obra propuesta calcula lo mismo.';
  const lineas: string[] = [`${c.nodos.length} nodo(s) cambian: ${c.empeoran} empeoran, ${c.mejoran} mejoran.`];
  const flecha = (x?: string, y?: string) => `${x ?? '—'} → ${y ?? '—'}`;
  const marca: Record<Tendencia, string> = { empeora: '▲', mejora: '▼', neutra: '·' };
  for (const f of c.nodos) {
    const v = f.veredicto.antes !== f.veredicto.despues ? `  ${flecha(f.veredicto.antes, f.veredicto.despues)}` : '';
    lineas.push('', `${marca[f.tendencia]} ${f.nombre} [${f.estado}]${v}`);
    for (const u of f.usos) lineas.push(`    ${marca[u.tendencia]} ${u.nombre}: ${flecha(u.antes, u.despues)}`);
    for (const d of f.datos) lineas.push(`    · ${d.nombre}: ${flecha(d.antes, d.despues)}`);
    const { agregados, quitados, editados, renombrados } = f.bloques;
    if (agregados.length) lineas.push(`    + bloques: ${agregados.join(', ')}`);
    if (quitados.length) lineas.push(`    − bloques: ${quitados.join(', ')}`);
    if (editados.length) lineas.push(`    ~ bloques: ${editados.join(', ')}`);
    if (renombrados.length) lineas.push(`    = mismo bloque, otro id: ${renombrados.join(', ')}`);
  }
  return lineas.join('\n');
}
