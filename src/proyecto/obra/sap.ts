// ─────────────────────────────────────────────────────────────────────────────
// Las cargas de la obra contra los Load Patterns del modelo de SAP2000.
//
// FLOW MANDA. La obra dice qué patrones debería tener el modelo —nombre, tipo y
// multiplicador de peso propio— y esto dice en qué se aparta el modelo leído.
// Es puro: la lectura la trae el puente (`puente-sap/`), y compararla no
// necesita SAP ni navegador, así que `verify:obra` la prueba.
//
// Una carga de Flow es un patrón de SAP con el MISMO NOMBRE. No se adivinan
// equivalencias: `CLV` en Flow y `CLV_P1` en SAP salen como dos filas sueltas,
// porque decidir que son lo mismo es trabajo del ingeniero, no de una regla.
// ─────────────────────────────────────────────────────────────────────────────

import {
  agregarModulo,
  nuevaCarga,
  type AplicacionSap,
  type Carga,
  type Obra,
  type PatronLeido,
  type PatronSap,
} from './modelo';
import { resolverExpresion } from './biblioteca';
import type { EvaluacionCarga } from './calculo';

export type EstadoPatron =
  /** Nombre, tipo y peso propio coinciden. */
  | 'igual'
  /** Está en los dos y algo no coincide. */
  | 'difiere'
  /** Está en los dos, pero la carga de Flow todavía no dice cómo es el patrón. */
  | 'sin-definir'
  | 'solo-flow'
  | 'solo-sap';

export interface FilaPatron {
  nombre: string;
  flow?: PatronSap;
  sap?: PatronSap;
  estado: EstadoPatron;
  diferencias: string[];
}

/** Cómo se lee un multiplicador: `1,3`, no `1.3`. */
export const numero = (n: number): string => String(n).replace('.', ',');

const IGUALES = (a: number, b: number) => Math.abs(a - b) < 1e-9;

export function compararPatrones(cargas: readonly Carga[], leidos: readonly PatronLeido[]): FilaPatron[] {
  const enSap = new Map(leidos.map((p) => [p.nombre, p]));
  const vistos = new Set<string>();
  const filas: FilaPatron[] = [];

  for (const c of cargas) {
    const nombre = c.nombre.trim();
    if (!nombre || vistos.has(nombre)) continue;
    vistos.add(nombre);
    const sap = enSap.get(nombre);
    const flow = c.patron;
    if (!sap) {
      filas.push({ nombre, flow, estado: 'solo-flow', diferencias: [] });
      continue;
    }
    const enModelo = { tipo: sap.tipo, pesoPropio: sap.pesoPropio };
    if (!flow) {
      filas.push({
        nombre,
        sap: enModelo,
        estado: 'sin-definir',
        diferencias: [`Flow no dice cómo es; en SAP es ${sap.tipo} con peso propio ${numero(sap.pesoPropio)}.`],
      });
      continue;
    }
    const diferencias: string[] = [];
    if (flow.tipo !== sap.tipo) diferencias.push(`tipo: Flow ${flow.tipo}, SAP ${sap.tipo}`);
    if (!IGUALES(flow.pesoPropio, sap.pesoPropio)) {
      diferencias.push(`peso propio: Flow ${numero(flow.pesoPropio)}, SAP ${numero(sap.pesoPropio)}`);
    }
    filas.push({ nombre, flow, sap: enModelo, estado: diferencias.length ? 'difiere' : 'igual', diferencias });
  }

  for (const p of leidos) {
    if (vistos.has(p.nombre)) continue;
    vistos.add(p.nombre);
    filas.push({ nombre: p.nombre, sap: { tipo: p.tipo, pesoPropio: p.pesoPropio }, estado: 'solo-sap', diferencias: [] });
  }
  return filas;
}

/**
 * Los dos errores de peso propio que se ven sin mirar un solo número: que no lo
 * lleve ningún patrón —el modelo queda sin el peso de sus elementos— o que lo
 * lleven dos —se cuenta dos veces—. Sirve igual para las cargas de Flow y para
 * lo leído del modelo. Con la lista vacía no hay nada definido y no se opina.
 */
export function avisosPesoPropio(lista: readonly { nombre: string; pesoPropio: number }[]): string[] {
  if (lista.length === 0) return [];
  const con = lista.filter((p) => p.pesoPropio > 0);
  if (con.length === 0) return ['Ninguna carga lleva el peso propio: el modelo quedaría sin el peso de sus elementos.'];
  if (con.length > 1) {
    return [
      `Más de una carga lleva peso propio (${con.map((p) => p.nombre).join(', ')}): se contaría dos veces.`,
    ];
  }
  return [];
}

/**
 * Trae a la obra, como cargas nuevas, los patrones del modelo que la obra no
 * tiene. Es para un modelo que nació antes que su obra: la lista de SAP se
 * vuelve la de Flow, y desde ahí Flow manda.
 *
 * Una carga que ya existe no se toca, aunque su patrón difiera: eso lo decide
 * quien mira la comparación. La carga nueva no tiene partidas, y su nodo ya
 * avisa que le falta el respaldo.
 *
 * Sortea ids (`nuevaCarga`): se llama FUERA del actualizador de `setObra`.
 */
export function traerDeSap(obra: Obra, nombres: readonly string[], lista: readonly PatronLeido[]): Obra {
  const tomados = new Set(obra.cargas.map((c) => c.nombre.trim()));
  const nuevas: Carga[] = [];
  for (const nombre of nombres) {
    const p = lista.find((x) => x.nombre === nombre);
    if (!p || tomados.has(nombre)) continue;
    tomados.add(nombre);
    nuevas.push({ ...nuevaCarga([]), nombre, patron: { tipo: p.tipo, pesoPropio: p.pesoPropio } });
  }
  if (nuevas.length === 0) return obra;
  return { ...agregarModulo(obra, 'cargas'), cargas: [...obra.cargas, ...nuevas] };
}

/**
 * Define el patrón de las cargas que todavía no lo dicen, tomándolo del modelo.
 * Solo esas: una carga que ya define su patrón es la que manda, y si difiere del
 * modelo, el que está mal es el modelo.
 */
export function adoptarDeSap(obra: Obra, nombres: readonly string[], lista: readonly PatronLeido[]): Obra {
  const pedidos = new Set(nombres);
  return {
    ...obra,
    cargas: obra.cargas.map((c) => {
      const nombre = c.nombre.trim();
      if (c.patron || !pedidos.has(nombre)) return c;
      const p = lista.find((x) => x.nombre === nombre);
      return p ? { ...c, patron: { tipo: p.tipo, pesoPropio: p.pesoPropio } } : c;
    }),
  };
}

export interface CambioPatron extends PatronSap {
  nombre: string;
  accion: 'crear' | 'ajustar';
}

/**
 * Lo que empujar a SAP escribiría: crear los patrones que faltan en el modelo y
 * ajustar el tipo y el peso propio de los que difieren. Nada más.
 *
 * - Un patrón que solo está en SAP NO se toca, y menos se borra: puede ser un
 *   caso que Flow todavía no conoce, y borrarlo en SAP es decisión del usuario.
 * - Una carga que falta en SAP pero no dice su tipo se OMITE y se dice: crearla
 *   con un tipo inventado sería escribir en el modelo algo que nadie decidió.
 */
export function planEmpuje(
  cargas: readonly Carga[],
  lista: readonly PatronLeido[],
): { cambios: CambioPatron[]; omitidas: { nombre: string; motivo: string }[] } {
  const cambios: CambioPatron[] = [];
  const omitidas: { nombre: string; motivo: string }[] = [];
  for (const f of compararPatrones(cargas, lista)) {
    if (f.estado === 'solo-flow') {
      if (f.flow) cambios.push({ nombre: f.nombre, accion: 'crear', ...f.flow });
      else omitidas.push({ nombre: f.nombre, motivo: 'no dice su tipo SAP' });
    } else if (f.estado === 'difiere' && f.flow) {
      cambios.push({ nombre: f.nombre, accion: 'ajustar', ...f.flow });
    }
  }
  return { cambios, omitidas };
}

// ── La aplicación de una partida sobre los objetos del modelo ────────────────

/** La unidad en que SAP recibe cada tipo de carga (el puente trabaja en kN-m). */
export const UNIDAD_APLICACION: Record<AplicacionSap['tipo'], string> = {
  'area-a-barras': 'kN/m^2',
  'barra-distribuida': 'kN/m',
};

export interface FilaAplicacion {
  /** El id de la partida. */
  id: string;
  /** El nombre de su carga, que es el del Load Pattern. */
  patron: string;
  partida: string;
  aplicacion: AplicacionSap;
  unidad: string;
  /** El valor de la partida en `unidad`. */
  valor?: number;
  error?: string;
}

/**
 * Las partidas que dicen dónde van en SAP, con su valor en la unidad de SAP.
 *
 * El valor es el de la partida —el mismo que muestra su nodo— convertido por el
 * motor (`resolverExpresion`, la conversión de un campo atado): una partida en
 * kN/m aplicada como carga de área es un error, no un número.
 */
export function aplicacionesDeObra(obra: Obra, evaluaciones: Record<string, EvaluacionCarga>): FilaAplicacion[] {
  const filas: FilaAplicacion[] = [];
  for (const c of obra.cargas) {
    for (const s of c.subcargas) {
      if (!s.aplicacion) continue;
      const unidad = UNIDAD_APLICACION[s.aplicacion.tipo];
      const base = { id: s.id, patron: c.nombre.trim(), partida: s.nombre, aplicacion: s.aplicacion, unidad };
      const v = evaluaciones[c.id]?.valores.find((x) => x.id === s.id);
      if (!v || v.problema || v.valor === undefined) {
        filas.push({ ...base, error: v?.problema || 'La partida no tiene valor.' });
        continue;
      }
      const r = resolverExpresion('v', unidad, { v: v.valor });
      filas.push(r.error ? { ...base, error: `No se puede expresar en ${unidad}: ${r.error}` } : { ...base, valor: r.valor });
    }
  }
  return filas;
}

/** Lo que el puente leyó para una aplicación. */
export interface LeidaAplicacion {
  objetos?: number;
  sinCarga?: number;
  cargas?: { valor: number; dir: number; dist?: number; uniforme?: boolean; fuerza?: boolean; n: number }[];
  error?: string;
}

const MISMO_VALOR = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));

/**
 * Las partidas que caen sobre los mismos objetos con el mismo patrón y el mismo
 * tipo de carga. El puente las escribe juntas —la primera reemplaza, las demás se
 * suman—, así que cada objeto del grupo termina con UNA carga por cada una.
 */
export function hermanasDe(filas: readonly FilaAplicacion[], f: FilaAplicacion): FilaAplicacion[] {
  return filas.filter(
    (x) =>
      !x.error &&
      x.valor !== undefined &&
      x.patron === f.patron &&
      x.aplicacion.tipo === f.aplicacion.tipo &&
      x.aplicacion.grupo === f.aplicacion.grupo,
  );
}

/**
 * La aplicación de Flow contra lo que el patrón tiene hoy sobre el grupo.
 *
 * `hermanas` son las partidas del mismo patrón sobre el mismo grupo, incluida
 * esta (`hermanasDe`). Es `igual` solo si en el grupo no hay objetos sin carga y
 * lo leído es exactamente una carga por hermana en cada objeto, con su valor, su
 * dirección y su distribución: dos partidas de 2 y 1 kN/m² sobre `CUB` esperan
 * leer las dos en todos los objetos, no un 3 ni un 2 solo.
 *
 * El puente lee cuántas veces aparece cada carga, no qué objeto lleva cuál. Con
 * los objetos todos cargados y cada carga en exactamente tantos como hermanas la
 * piden, la única forma de no coincidir es un reparto hecho a mano en SAP que
 * cambie cargas iguales de sitio: ese caso no se distingue.
 */
export function compararAplicacion(
  f: FilaAplicacion,
  l: LeidaAplicacion,
  hermanas: readonly FilaAplicacion[] = [f],
): { estado: 'igual' | 'difiere' | 'sin-objetos' | 'error'; detalle: string } {
  if (l.error) return { estado: 'error', detalle: l.error };
  if (f.error) return { estado: 'error', detalle: f.error };
  const objetos = l.objetos ?? 0;
  const clase = f.aplicacion.tipo === 'area-a-barras' ? 'áreas' : 'barras';
  if (objetos === 0) return { estado: 'sin-objetos', detalle: `El grupo ${f.aplicacion.grupo} no tiene ${clase}.` };
  const cargas = l.cargas ?? [];
  const coincide = (c: NonNullable<LeidaAplicacion['cargas']>[number], h: FilaAplicacion) =>
    MISMO_VALOR(c.valor, h.valor ?? NaN) &&
    c.dir === h.aplicacion.direccion &&
    (h.aplicacion.tipo === 'area-a-barras' ? c.dist === h.aplicacion.distribucion : c.uniforme === true && c.fuerza === true);

  // Cada hermana consume `objetos` apariciones de una carga que coincide con
  // ella; al final no tiene que sobrar ninguna.
  const quedan = cargas.map((c) => c.n);
  const cuadra =
    (l.sinCarga ?? 0) === 0 &&
    hermanas.every((h) => {
      const i = cargas.findIndex((c, j) => quedan[j] >= objetos && coincide(c, h));
      if (i < 0) return false;
      quedan[i] -= objetos;
      return true;
    }) &&
    quedan.every((n) => n === 0);
  if (cuadra) return { estado: 'igual', detalle: '' };

  const partes = cargas.map((c) => `${numero(Number(c.valor.toPrecision(4)))} en ${c.n} de ${objetos}`);
  if (l.sinCarga) partes.push(`sin carga en ${l.sinCarga} de ${objetos}`);
  const flow =
    hermanas.length > 1
      ? ` · Flow: ${hermanas.map((h) => numero(Number((h.valor ?? NaN).toPrecision(4)))).join(' + ')} en cada objeto`
      : '';
  return { estado: 'difiere', detalle: `SAP: ${partes.join('; ') || 'sin carga'}${flow}` };
}

/**
 * Qué aplicaciones escribir en SAP.
 *
 * SE ESCRIBE POR PATRÓN ENTERO. El puente reemplaza lo que el patrón tenía en
 * cada objeto con la primera partida que lo toca: si solo se mandara la partida
 * que cambió, el reemplazo borraría a sus hermanas del mismo patrón que estaban
 * iguales. Un patrón en el que todo está `igual` no se toca.
 *
 * `estado` dice cómo quedó cada fila en la última comparación; sin comparación
 * (`undefined`) no se sabe, y se escribe.
 *
 * Una fila sin valor o sin grupo se omite y se dice. Y su patrón entero se
 * BLOQUEA: reescribirlo sin ella reemplazaría —borraría— la carga que esa
 * partida tenga hoy en el modelo, y la confirmación no lo diría.
 */
export function planAplicaciones(
  filas: readonly FilaAplicacion[],
  estado: (f: FilaAplicacion) => string | undefined,
): {
  escribir: FilaAplicacion[];
  omitidas: { id: string; partida: string; motivo: string }[];
  bloqueados: { patron: string; partidas: string[] }[];
} {
  const omitidas: { id: string; partida: string; motivo: string; patron: string }[] = [];
  const validas: FilaAplicacion[] = [];
  for (const f of filas) {
    const o = { id: f.id, partida: f.partida, patron: f.patron };
    if (f.error || f.valor === undefined) omitidas.push({ ...o, motivo: f.error ?? 'sin valor' });
    else if (!f.aplicacion.grupo.trim()) omitidas.push({ ...o, motivo: 'sin grupo' });
    else validas.push(f);
  }
  const rotos = new Map<string, string[]>();
  for (const o of omitidas) rotos.set(o.patron, [...(rotos.get(o.patron) ?? []), o.partida]);
  const cambian = new Set(validas.filter((f) => estado(f) !== 'igual').map((f) => f.patron));
  return {
    escribir: validas.filter((f) => cambian.has(f.patron) && !rotos.has(f.patron)),
    omitidas: omitidas.map(({ patron: _, ...o }) => o),
    bloqueados: [...rotos]
      .filter(([patron]) => cambian.has(patron))
      .map(([patron, partidas]) => ({ patron, partidas })),
  };
}

/** Las cargas de Flow que ya dicen cómo es su patrón, en la forma de `avisosPesoPropio`. */
export function patronesDeFlow(cargas: readonly Carga[]): { nombre: string; pesoPropio: number }[] {
  return cargas.filter((c) => c.patron).map((c) => ({ nombre: c.nombre.trim(), pesoPropio: c.patron!.pesoPropio }));
}
