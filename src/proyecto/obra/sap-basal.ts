// La reacción basal leída del modelo, en lo que se revisa: el corte basal de
// cada caso de espectro y que un caso gravitacional no empuje de lado.
//
// Puro, sin React: lo pintan el panel y la tarjeta del sub-nodo Reacción basal,
// y `verify:obra` lo comprueba. Los valores llegan en kN y kN·m; mostrarlos en
// tonf es solo presentación, como en las cargas (`sap-cargas.ts`).

import type { ConexionSap, FilaBasal, LecturaBasal, SistemaUnidades } from './modelo';

const KN_POR_TONF = 9.80665;

/** Los tipos de patrón que solo cargan hacia abajo. `Other` no está: en el
 *  Pachón mezcla la vertical y la horizontal del puente grúa. */
const GRAVITACIONALES = new Set(['dead', 'superdead', 'live', 'reducelive', 'rooflive', 'snow']);

/** El número de una fuerza (o un momento) en el sistema en que se muestra, sin
 *  unidad: `3586`, `365,7`, `0,52`. Lo que no llega a una centésima es `0`. */
export function cantidad(v: number, sis: SistemaUnidades = 'kN'): string {
  const x = sis === 'tonf' ? v / KN_POR_TONF : v;
  const a = Math.abs(x);
  if (a < 0.005) return '0';
  const decimales = a >= 1000 ? 0 : a >= 100 ? 1 : 2;
  return x.toLocaleString('es', { maximumFractionDigits: decimales, minimumFractionDigits: 0 });
}

/** Una fuerza para leer: `3586 kN`, `365,7 tonf`. Con `momento`, en kN·m. */
export function fuerza(v: number, sis: SistemaUnidades = 'kN', momento = false): string {
  return `${cantidad(v, sis)} ${sis}${momento ? '·m' : ''}`;
}

export interface CorteSismico {
  caso: string;
  dir: 'X' | 'Y';
  /** kN, en valor absoluto. */
  V: number;
  /** De dónde sale: un caso de espectro, o uno estático con aceleración horizontal. */
  origen: 'espectro' | 'aceleracion';
}

/**
 * El corte basal de cada caso sísmico, en su dirección. Son sísmicos:
 *
 * - los de espectro de respuesta (los que `/casos` dice que lo son, o los del
 *   espectro si los casos no se leyeron). La dirección sale del espectro (U1 es
 *   X, U2 es Y) o, si no se leyó, de la componente horizontal mayor;
 * - los estáticos que cargan una aceleración horizontal (`Accel` en UX o UY): el
 *   método estático equivalente escrito como aceleración de la masa.
 */
export function cortesSismicos(lectura: LecturaBasal, sap: ConexionSap | undefined): CorteSismico[] {
  const espectrales = new Set([
    ...(sap?.casos?.lista ?? []).filter((c) => c.tipo === 'ResponseSpectrum').map((c) => c.nombre),
    ...(sap?.espectro?.casos ?? []).map((c) => c.nombre),
  ]);
  const aceleracion = new Map<string, 'X' | 'Y'>();
  for (const c of sap?.casos?.lista ?? []) {
    const a = (c.cargas ?? []).find((k) => k.tipo === 'Accel' && (k.nombre === 'UX' || k.nombre === 'UY'));
    if (a) aceleracion.set(c.nombre, a.nombre === 'UX' ? 'X' : 'Y');
  }
  const cortes: CorteSismico[] = [];
  for (const f of lectura.filas) {
    let dir: 'X' | 'Y';
    let origen: CorteSismico['origen'];
    if (espectrales.has(f.caso)) {
      const u = sap?.espectro?.casos.find((c) => c.nombre === f.caso)?.cargas[0]?.dir;
      dir = u === 'U1' ? 'X' : u === 'U2' ? 'Y' : Math.abs(f.fx) >= Math.abs(f.fy) ? 'X' : 'Y';
      origen = 'espectro';
    } else if (aceleracion.has(f.caso)) {
      dir = aceleracion.get(f.caso)!;
      origen = 'aceleracion';
    } else continue;
    cortes.push({ caso: f.caso, dir, V: Math.abs(dir === 'X' ? f.fx : f.fy), origen });
  }
  return cortes;
}

/**
 * Los casos que solo llevan cargas gravitacionales y aun así tienen reacción
 * horizontal: más del 1 % de la vertical. Suele ser una carga con la dirección
 * equivocada (local en vez de gravedad) o un apoyo que no es el que se cree.
 *
 * Hace falta saber qué patrones carga cada caso (`sap.casos`) y de qué tipo es
 * cada patrón (`sap.patrones`); sin eso no se dice nada.
 */
export function gravitacionalesConHorizontal(
  lectura: LecturaBasal,
  sap: ConexionSap | undefined,
): { caso: string; horizontal: number; vertical: number }[] {
  const tipo = new Map((sap?.patrones?.lista ?? []).map((p) => [p.nombre, p.tipo.toLowerCase()]));
  const salida: { caso: string; horizontal: number; vertical: number }[] = [];
  for (const f of lectura.filas) {
    const caso = sap?.casos?.lista.find((c) => c.nombre === f.caso);
    const patrones = (caso?.cargas ?? []).filter((k) => k.tipo === 'Load').map((k) => k.nombre);
    if (!patrones.length || !patrones.every((p) => GRAVITACIONALES.has(tipo.get(p) ?? ''))) continue;
    const horizontal = Math.hypot(f.fx, f.fy);
    if (horizontal > Math.max(0.01 * Math.abs(f.fz), 0.01)) salida.push({ caso: f.caso, horizontal, vertical: f.fz });
  }
  return salida;
}

/** Las filas en el orden de los Load Cases leídos, si se leyeron. */
export function filasEnOrden(lectura: LecturaBasal, sap: ConexionSap | undefined): FilaBasal[] {
  const orden = new Map((sap?.casos?.lista ?? []).map((c, i) => [c.nombre, i]));
  return [...lectura.filas].sort((a, b) => (orden.get(a.caso) ?? Infinity) - (orden.get(b.caso) ?? Infinity));
}
