// Las reacciones en los apoyos leídas del modelo, en lo que se revisa: en cada
// caso, qué apoyo se lleva la mayor compresión, la mayor tracción, el mayor
// corte y el mayor momento.
//
// Puro, sin React: lo pintan el panel, la tabla y la tarjeta del sub-nodo
// Apoyos, y `verify:obra` lo comprueba. Los valores llegan en kN y kN·m.
//
// EL SIGNO DE F3. En SAP, una reacción positiva apunta hacia arriba: el apoyo
// empuja la estructura hacia arriba, es decir, la estructura COMPRIME la
// fundación. Una F3 negativa es tracción (arrancamiento). Aquí se dice con
// palabras, para que nadie tenga que acordarse.

import type {
  ConexionSap,
  ConjuntoDiseno,
  Gobernante,
  GobernantesDeApoyo,
  LecturaApoyos,
  LecturaBasal,
  LecturaCombinaciones,
  LecturaConjunto,
  ReaccionesDeCaso,
  Vector6,
} from './modelo';
import { familiaDe } from './sap-combinaciones';
import { atrasoDe } from './sap-modal';

/** Un extremo: en qué apoyo se da y cuánto vale (kN o kN·m). */
export interface Extremo {
  apoyo: string;
  valor: number;
}

export interface ExtremosDeCaso {
  caso: string;
  /** Un espectro da máximos sin signo: no hay tracción que distinguir. */
  espectral: boolean;
  /** La mayor F3 positiva: compresión sobre la fundación. */
  compresion?: Extremo;
  /** La F3 más negativa, en valor absoluto: tracción. */
  traccion?: Extremo;
  /** El mayor corte horizontal, √(F1² + F2²). */
  corte?: Extremo;
  /** El mayor momento, √(M1² + M2²). */
  momento?: Extremo;
  /** La suma de F3: tiene que ser la FZ de la reacción basal del caso. */
  sumaF3: number;
}

/** Lo que no llega a una milésima de kN es cero: el ruido numérico de SAP. */
const CERO = 1e-3;

export function extremosDeCaso(lectura: LecturaApoyos, r: ReaccionesDeCaso): ExtremosDeCaso {
  const espectral = r.paso === 'Max';
  let compresion: Extremo | undefined;
  let traccion: Extremo | undefined;
  let corte: Extremo | undefined;
  let momento: Extremo | undefined;
  let sumaF3 = 0;
  r.valores.forEach((v, i) => {
    if (!v) return;
    const apoyo = lectura.apoyos[i]?.nombre ?? `#${i + 1}`;
    const [f1, f2, f3, m1, m2] = v;
    sumaF3 += f3;
    if (f3 > CERO && (!compresion || f3 > compresion.valor)) compresion = { apoyo, valor: f3 };
    if (!espectral && f3 < -CERO && (!traccion || -f3 > traccion.valor)) traccion = { apoyo, valor: -f3 };
    const V = Math.hypot(f1, f2);
    if (V > CERO && (!corte || V > corte.valor)) corte = { apoyo, valor: V };
    const M = Math.hypot(m1, m2);
    if (M > CERO && (!momento || M > momento.valor)) momento = { apoyo, valor: M };
  });
  return { caso: r.caso, espectral, compresion, traccion, corte, momento, sumaF3 };
}

/** Los extremos de todos los casos, en el orden de la lectura. */
export function extremosPorCaso(lectura: LecturaApoyos): ExtremosDeCaso[] {
  return lectura.casos.map((r) => extremosDeCaso(lectura, r));
}

/**
 * Los casos estáticos cuya suma de F3 en los apoyos no es la FZ de la reacción
 * basal (más de 0,5 % y de 1 kN de diferencia): falta algún apoyo en la lectura.
 * Un espectro no se compara, porque la suma de máximos no es el máximo de la
 * suma. Sin basal leída, o de otro modelo, no se dice nada.
 */
export function descuadresConBasal(lectura: LecturaApoyos, basal: LecturaBasal | undefined): string[] {
  if (!basal || basal.modelo !== lectura.modelo) return [];
  const fz = new Map(basal.filas.map((f) => [f.caso, f.fz]));
  const salida: string[] = [];
  for (const e of extremosPorCaso(lectura)) {
    const esperada = fz.get(e.caso);
    if (e.espectral || esperada === undefined) continue;
    const dif = Math.abs(e.sumaF3 - esperada);
    if (dif > 1 && dif > 0.005 * Math.abs(esperada)) salida.push(e.caso);
  }
  return salida;
}

// ── Conjuntos de diseño ──────────────────────────────────────────────────────

/** Las combinaciones de un conjunto: las de sus familias, en el orden de SAP. */
export function combosDeConjunto(familias: readonly string[], combinaciones: LecturaCombinaciones | undefined): string[] {
  const f = new Set(familias);
  return (combinaciones?.lista ?? []).filter((c) => f.has(familiaDe(c.nombre))).map((c) => c.nombre);
}

/** Lo que devuelve `/apoyos/combinaciones` del puente. */
export interface RespuestaCombinacionesApoyos {
  modelo: string;
  modificado: string;
  apoyos: string[];
  filas: { combo: string; paso?: string; valores: (Vector6 | null)[] }[];
}

/** De dos extremos (Max y Min) de una componente, el de mayor valor absoluto. */
const extremo = (a: number, b: number) => (Math.abs(a) >= Math.abs(b) ? a : b);

/**
 * Las gobernantes de cada apoyo en un conjunto: la combinación que da la mayor
 * compresión, la mayor tracción, el mayor corte y el mayor momento, con su
 * vector.
 *
 * Una combinación de un solo paso da un vector CONCURRENTE. Una con `Max` y
 * `Min` —lleva un espectro o una envolvente— da extremos por componente: la
 * compresión sale del `Max` de F3 y la tracción del `Min`; el corte y el
 * momento, de los extremos de cada componente. Su vector se arma con los
 * extremos y se marca no concurrente: no es de un mismo instante, y así se dice.
 */
export function gobernantesDeConjunto(
  respuesta: RespuestaCombinacionesApoyos,
  familias: readonly string[],
  leido: string,
): LecturaConjunto {
  // Por combinación, su vector (concurrente) o su par Max/Min.
  const porCombo = new Map<string, { unico?: (Vector6 | null)[]; max?: (Vector6 | null)[]; min?: (Vector6 | null)[] }>();
  for (const f of respuesta.filas) {
    const e = porCombo.get(f.combo) ?? {};
    if (f.paso === 'Max') e.max = f.valores;
    else if (f.paso === 'Min') e.min = f.valores;
    else e.unico = f.valores;
    porCombo.set(f.combo, e);
  }
  const noConcurrentes = [...porCombo].filter(([, e]) => !e.unico).map(([c]) => c);
  const porApoyo: GobernantesDeApoyo[] = respuesta.apoyos.map((_, j) => {
    const g: GobernantesDeApoyo = {};
    const proponer = (k: keyof GobernantesDeApoyo, candidato: Gobernante) => {
      if (candidato.valor > CERO && (!g[k] || candidato.valor > g[k]!.valor)) g[k] = candidato;
    };
    for (const [combo, e] of porCombo) {
      if (e.unico) {
        const v = e.unico[j];
        if (!v) continue;
        proponer('compresion', { combo, valor: v[2], v, concurrente: true });
        proponer('traccion', { combo, valor: -v[2], v, concurrente: true });
        proponer('corte', { combo, valor: Math.hypot(v[0], v[1]), v, concurrente: true });
        proponer('momento', { combo, valor: Math.hypot(v[3], v[4]), v, concurrente: true });
        continue;
      }
      const max = e.max?.[j];
      const min = e.min?.[j];
      if (!max || !min) continue;
      const v = max.map((x, i) => extremo(x, min[i])) as Vector6;
      proponer('compresion', { combo, valor: max[2], v: max, concurrente: false });
      proponer('traccion', { combo, valor: -min[2], v: min, concurrente: false });
      proponer('corte', { combo, valor: Math.hypot(v[0], v[1]), v, concurrente: false });
      proponer('momento', { combo, valor: Math.hypot(v[3], v[4]), v, concurrente: false });
    }
    return g;
  });
  return {
    modelo: respuesta.modelo,
    leido,
    modificado: respuesta.modificado,
    familias: [...familias],
    combos: [...porCombo.keys()],
    noConcurrentes,
    apoyos: respuesta.apoyos,
    porApoyo,
  };
}

/**
 * Por qué la lectura de un conjunto ya no lo describe, o `undefined` si lo
 * describe: nunca se leyó, cambiaron sus familias, o el modelo cambió.
 */
export function estadoConjunto(
  c: ConjuntoDiseno,
  lectura: LecturaConjunto | undefined,
  sap: ConexionSap | undefined,
): { estado: 'sin-leer' | 'al-dia' | 'desactualizado'; motivo?: string } {
  if (!lectura) return { estado: 'sin-leer' };
  const antes = [...lectura.familias].sort().join();
  if (antes !== [...c.familias].sort().join()) {
    return { estado: 'desactualizado', motivo: 'cambiaron sus familias desde que se leyó' };
  }
  const atraso = atrasoDe(lectura, sap);
  return atraso ? { estado: 'desactualizado', motivo: atraso } : { estado: 'al-dia' };
}

/** Los extremos de un conjunto entre todos los apoyos: para el resumen del panel. */
export function extremosDeConjunto(lectura: LecturaConjunto): Partial<Record<keyof GobernantesDeApoyo, Gobernante & { apoyo: string }>> {
  const salida: Partial<Record<keyof GobernantesDeApoyo, Gobernante & { apoyo: string }>> = {};
  lectura.porApoyo.forEach((g, j) => {
    for (const k of ['compresion', 'traccion', 'corte', 'momento'] as const) {
      const x = g[k];
      if (x && (!salida[k] || x.valor > salida[k]!.valor)) salida[k] = { ...x, apoyo: lectura.apoyos[j] };
    }
  });
  return salida;
}

/** Los casos que tienen tracción en algún apoyo: los que levantan la estructura. */
export function casosConTraccion(lectura: LecturaApoyos): string[] {
  return extremosPorCaso(lectura)
    .filter((e) => e.traccion)
    .map((e) => e.caso);
}
