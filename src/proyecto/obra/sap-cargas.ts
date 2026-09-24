// Cómo se lee una carga asignada en SAP2000, en palabras.
//
// Puro, sin React: el panel del nodo SAP2000 lo pinta y `verify:obra` lo
// comprueba. Los valores llegan del puente en kN, m y °C (`puente-sap/puente.py`,
// `cargas`), así que la unidad sale de la clase y no hay que convertir nada.

import { resolverExpresion } from './biblioteca';
import type { CargaAsignada, Justificacion, LecturaEspectro, Obra } from './modelo';

/** Los códigos de dirección de la API de SAP2000. */
const DIRECCION: Record<number, string> = {
  1: 'local 1',
  2: 'local 2',
  3: 'local 3',
  4: 'X global',
  5: 'Y global',
  6: 'Z global',
  7: 'X proyectada',
  8: 'Y proyectada',
  9: 'Z proyectada',
  10: 'gravedad',
  11: 'gravedad proyectada',
};

/** Cuatro cifras significativas y coma decimal: `0,09807`, no `0.0980665`. */
export function cifra(n: number): string {
  return String(Number(n.toPrecision(4))).replace('.', ',');
}

export function unidadDe(c: CargaAsignada): string {
  switch (c.clase) {
    case 'barra-distribuida':
      return c.momento ? 'kN·m/m' : 'kN/m';
    case 'barra-puntual':
      return c.momento ? 'kN·m' : 'kN';
    case 'area-uniforme':
    case 'area-a-barras':
      return 'kN/m²';
    case 'nudo':
      return c.componente?.startsWith('M') ? 'kN·m' : 'kN';
    case 'barra-temperatura':
      return '°C';
  }
}

/** El valor con su unidad. Una distribuida no uniforme dice de cuánto a cuánto. */
export function valorDe(c: CargaAsignada): string {
  const u = unidadDe(c);
  if (c.clase === 'barra-distribuida' && c.valor2 !== undefined) {
    return `${cifra(c.valor)} → ${cifra(c.valor2)} ${u}`;
  }
  return `${cifra(c.valor)} ${u}`;
}

/** Cómo está aplicada: la clase, dónde y en qué dirección. */
export function comoDe(c: CargaAsignada): string {
  const partes: string[] = [];
  switch (c.clase) {
    case 'barra-distribuida':
      partes.push(
        c.valor2 !== undefined
          ? `distribuida en barra, de ${cifra(c.desde ?? 0)} a ${cifra(c.hasta ?? 1)} de la longitud`
          : 'distribuida en barra',
      );
      break;
    case 'barra-puntual':
      partes.push(`puntual en barra, a ${cifra(c.en ?? 0)} de la longitud`);
      break;
    case 'area-uniforme':
      partes.push('uniforme en área');
      break;
    case 'area-a-barras':
      partes.push(`área a barras, ${c.dist === 2 ? 'dos direcciones' : 'una dirección'}`);
      break;
    case 'nudo':
      partes.push(`en nudo, ${c.componente ?? '?'}`);
      break;
    case 'barra-temperatura':
      partes.push('temperatura en barra');
      break;
  }
  if (c.dir !== undefined) {
    const dir = DIRECCION[c.dir] ?? `dirección ${c.dir}`;
    // Una dirección local solo se entiende con su sistema: «local 3» de un área
    // no es la de una barra. Una global no lo necesita.
    partes.push(c.csys && c.csys.toUpperCase() !== 'GLOBAL' && c.dir <= 3 ? `${dir} (${c.csys})` : dir);
  } else if (c.clase === 'nudo' && c.csys && c.csys.toUpperCase() !== 'GLOBAL') {
    partes.push(c.csys);
  }
  return partes.join(' · ');
}

/** Sobre cuántos objetos, con el sustantivo de su clase. */
export function objetosDe(c: CargaAsignada): string {
  const [uno, varios] =
    c.clase === 'area-uniforme' || c.clase === 'area-a-barras'
      ? ['área', 'áreas']
      : c.clase === 'nudo'
        ? ['nudo', 'nudos']
        : ['barra', 'barras'];
  return `${c.n} ${c.n === 1 ? uno : varios}`;
}

// ── Justificar una carga con una expresión de la obra ────────────────────────

/**
 * Todo lo que describe una carga salvo su valor y cuántos objetos la llevan, en
 * un texto estable: las claves en orden, para que la misma carga leída dos veces
 * dé la misma firma.
 */
export function firmaDe(c: CargaAsignada): string {
  const { patron: _p, valor: _v, n: _n, ...resto } = c;
  const orden = Object.keys(resto).sort() as (keyof typeof resto)[];
  return JSON.stringify(orden.map((k) => [k, resto[k]]));
}

const MISMO = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

/**
 * La carga que respalda una justificación, o `undefined` si ya no está.
 *
 * Primero la del mismo patrón, firma y valor. Si el valor cambió en SAP, la
 * ÚNICA del mismo patrón y firma: sigue siendo esa carga, con otro número, y la
 * verificación dirá en cuánto se aparta. Con dos o más candidatas no se adivina.
 */
export function cargaDe(j: Justificacion, cargas: readonly CargaAsignada[]): CargaAsignada | undefined {
  const candidatas = cargas.filter((c) => c.patron === j.patron && firmaDe(c) === j.firma);
  return candidatas.find((c) => MISMO(c.valor, j.valor)) ?? (candidatas.length === 1 ? candidatas[0] : undefined);
}

/** La justificación de una carga, si la tiene. */
export function justificacionDe(
  c: CargaAsignada,
  cargas: readonly CargaAsignada[],
  justificaciones: readonly Justificacion[],
): Justificacion | undefined {
  return justificaciones.find((j) => cargaDe(j, cargas) === c);
}

/**
 * Cuánto se puede apartar la obra del modelo y seguir coincidiendo: 0,5 %.
 *
 * No es cero porque el modelo guarda lo que el ingeniero tecleó —0,769 kN/m— y la
 * obra lo calcula con todas sus cifras. Medio por ciento está muy por debajo de
 * cualquier incertidumbre de una carga, y muy por encima de un redondeo.
 */
export const TOLERANCIA = 0.005;

/** La unidad del motor en la que se compara cada clase. */
function unidadMotor(c: CargaAsignada): string | undefined {
  switch (c.clase) {
    case 'barra-distribuida':
      return c.momento ? 'kN*m/m' : 'kN/m';
    case 'barra-puntual':
      return c.momento ? 'kN*m' : 'kN';
    case 'area-uniforme':
    case 'area-a-barras':
      return 'kN/m^2';
    case 'nudo':
      return c.componente?.startsWith('M') ? 'kN*m' : 'kN';
    case 'barra-temperatura':
      // Un cambio de temperatura se escribe como número (en °C) o en K: los
      // grados Celsius del motor tienen origen, y una DIFERENCIA no lo tiene.
      return undefined;
  }
}

export type EstadoJustificacion = 'coincide' | 'difiere' | 'error';

export interface Verificacion {
  estado: EstadoJustificacion;
  /** Lo que da la obra, en la unidad de la carga. */
  obra?: number;
  detalle: string;
}

/** Lo que da la expresión contra lo que tiene el modelo. */
export function verificar(expr: string, c: CargaAsignada, scope: Record<string, unknown>): Verificacion {
  const unidad = unidadMotor(c);
  let r = resolverExpresion(expr, unidad, scope);
  if (c.clase === 'barra-temperatura' && r.error) r = resolverExpresion(expr, 'K', scope);
  if (r.error || r.valor === undefined) return { estado: 'error', detalle: r.error ?? 'Sin valor.' };
  const obra = r.valor;
  const escala = Math.max(Math.abs(c.valor), 1e-12);
  const desvio = (obra - c.valor) / escala;
  if (Math.abs(obra - c.valor) <= TOLERANCIA * escala) {
    return { estado: 'coincide', obra, detalle: `la obra da ${cifra(obra)} ${unidadDe(c)}` };
  }
  const pct = c.valor === 0 ? '' : ` (${desvio > 0 ? '+' : ''}${cifra(desvio * 100)} %)`;
  return {
    estado: 'difiere',
    obra,
    detalle: `la obra da ${cifra(obra)} ${unidadDe(c)} y el modelo ${cifra(c.valor)}${pct}`,
  };
}

// ── El espectro ──────────────────────────────────────────────────────────────

/** Una justificación del espectro, no de una carga asignada. */
export const esDeEspectro = (j: Justificacion): boolean => j.clase !== undefined;

/** El factor de escala de un caso contra una expresión de la obra, en m/s². */
export function verificarFactor(expr: string, sf: number, scope: Record<string, unknown>): Verificacion {
  const r = resolverExpresion(expr, 'm/s^2', scope);
  if (r.error || r.valor === undefined) return { estado: 'error', detalle: r.error ?? 'Sin valor.' };
  const escala = Math.max(Math.abs(sf), 1e-12);
  if (Math.abs(r.valor - sf) <= TOLERANCIA * escala) {
    return { estado: 'coincide', obra: r.valor, detalle: `la obra da ${cifra(r.valor)} m/s²` };
  }
  const pct = ((r.valor - sf) / escala) * 100;
  return {
    estado: 'difiere',
    obra: r.valor,
    detalle: `la obra da ${cifra(r.valor)} m/s² y el modelo ${cifra(sf)} (${pct > 0 ? '+' : ''}${cifra(pct)} %)`,
  };
}

const NOMBRE_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;

/**
 * Una función de espectro del modelo contra una función de la obra, en TODOS
 * sus puntos: `nombre(T s)` tiene que dar el Sa del modelo en cada periodo.
 *
 * Todos y no una muestra, porque un espectro mal cargado suele fallar en un
 * tramo —la meseta cortada antes, la rama descendente con otro exponente— y una
 * muestra puede no caer ahí. El detalle nombra el punto que más se aparta.
 */
export function verificarFuncion(
  expr: string,
  puntos: readonly [number, number][],
  scope: Record<string, unknown>,
): Verificacion {
  const nombre = expr.trim();
  if (!NOMBRE_RE.test(nombre)) {
    return { estado: 'error', detalle: 'Escribe el nombre de una función de la obra de un periodo, por ejemplo Sa_esp.' };
  }
  if (!puntos.length) return { estado: 'error', detalle: 'La función del modelo no tiene puntos.' };
  let peor: { T: number; obra: number; sap: number; rel: number } | null = null;
  let fuera = 0;
  for (const [T, sap] of puntos) {
    const r = resolverExpresion(`${nombre}(${T} s)`, undefined, scope);
    if (r.error || r.valor === undefined) {
      return { estado: 'error', detalle: `${nombre}(${cifra(T)} s): ${r.error ?? 'sin valor'}` };
    }
    const escala = Math.max(Math.abs(sap), 1e-12);
    const rel = (r.valor - sap) / escala;
    if (Math.abs(r.valor - sap) > TOLERANCIA * escala) fuera++;
    if (!peor || Math.abs(rel) > Math.abs(peor.rel)) peor = { T, obra: r.valor, sap, rel };
  }
  const p = peor!;
  // Un redondeo del modelo no es un número que haya que leer en notación
  // científica: por debajo de 0,01 % se dice así.
  const pct =
    Math.abs(p.rel * 100) < 0.01 ? 'menos de 0,01 %' : `${p.rel > 0 ? '+' : ''}${cifra(p.rel * 100)} %`;
  if (fuera === 0) {
    return { estado: 'coincide', detalle: `coincide en los ${puntos.length} puntos (el mayor desvío, ${pct} en T = ${cifra(p.T)} s)` };
  }
  return {
    estado: 'difiere',
    detalle:
      `difiere en ${fuera} de ${puntos.length} puntos; el mayor, ${pct} en T = ${cifra(p.T)} s ` +
      `(obra ${cifra(p.obra)}, modelo ${cifra(p.sap)})`,
  };
}

/** Lo que una justificación del espectro verifica, o `undefined` si ya no está en la lectura. */
export function verificarEspectro(
  j: Justificacion,
  esp: LecturaEspectro | undefined,
  scope: Record<string, unknown>,
): Verificacion | undefined {
  if (!esp) return undefined;
  if (j.clase === 'factor-espectro') {
    const carga = esp.casos.find((c) => c.nombre === j.patron)?.cargas.find((k) => k.dir === j.firma);
    return carga ? verificarFactor(j.expr, carga.sf, scope) : undefined;
  }
  const f = esp.funciones.find((x) => x.nombre === j.patron);
  return f ? verificarFuncion(j.expr, f.puntos, scope) : undefined;
}

export interface ResumenJustificaciones {
  /** Cargas leídas del modelo. */
  cargas: number;
  justificadas: number;
  difieren: number;
  errores: number;
  /** Justificaciones cuya carga ya no está en el modelo. */
  huerfanas: Justificacion[];
}

/**
 * Cómo va la obra respaldando el modelo, para la tarjeta del nodo SAP2000.
 *
 * Cuenta las cargas asignadas y, del espectro, cada factor de escala y cada
 * función que usa algún caso: todo lo que se puede justificar.
 */
export function resumirJustificaciones(obra: Obra, scope: Record<string, unknown>): ResumenJustificaciones {
  const cargas = obra.sap?.cargas?.lista ?? [];
  const esp = obra.sap?.espectro;
  const delEspectro = esp ? esp.casos.reduce((n, c) => n + c.cargas.length, 0) + esp.funciones.length : 0;
  const r: ResumenJustificaciones = {
    cargas: cargas.length + delEspectro,
    justificadas: 0,
    difieren: 0,
    errores: 0,
    huerfanas: [],
  };
  for (const j of obra.justificaciones ?? []) {
    const c = esDeEspectro(j) ? undefined : cargaDe(j, cargas);
    const v = esDeEspectro(j) ? verificarEspectro(j, esp, scope) : c ? verificar(j.expr, c, scope) : undefined;
    if (!v) {
      r.huerfanas.push(j);
      continue;
    }
    if (v.estado === 'coincide') r.justificadas++;
    else if (v.estado === 'difiere') r.difieren++;
    else r.errores++;
  }
  return r;
}

/** Las cargas de cada patrón, en el orden en que llegaron. */
export function cargasPorPatron(lista: readonly CargaAsignada[]): Map<string, CargaAsignada[]> {
  const m = new Map<string, CargaAsignada[]>();
  for (const c of lista) {
    const l = m.get(c.patron);
    if (l) l.push(c);
    else m.set(c.patron, [c]);
  }
  return m;
}
