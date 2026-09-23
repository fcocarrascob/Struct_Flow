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

import type { Carga, PatronLeido, PatronSap } from './modelo';

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

/** Las cargas de Flow que ya dicen cómo es su patrón, en la forma de `avisosPesoPropio`. */
export function patronesDeFlow(cargas: readonly Carga[]): { nombre: string; pesoPropio: number }[] {
  return cargas.filter((c) => c.patron).map((c) => ({ nombre: c.nombre.trim(), pesoPropio: c.patron!.pesoPropio }));
}
