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

import type { LecturaApoyos, LecturaBasal, ReaccionesDeCaso } from './modelo';

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

/** Los casos que tienen tracción en algún apoyo: los que levantan la estructura. */
export function casosConTraccion(lectura: LecturaApoyos): string[] {
  return extremosPorCaso(lectura)
    .filter((e) => e.traccion)
    .map((e) => e.caso);
}
