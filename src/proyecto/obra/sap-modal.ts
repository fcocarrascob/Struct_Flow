// Los resultados modales leídos del modelo, en lo que se revisa: el periodo
// fundamental, el modo que domina cada dirección y cuántos modos hacen falta
// para juntar la masa.
//
// Puro, sin React: lo pintan el panel y la tarjeta del sub-nodo Modal, y
// `verify:obra` lo comprueba. Lo que publica al scope de la obra (`T_x`, `T_y`)
// sale de `publicaModal`, y lo escribe `evaluacion.ts`.

import type { ConexionSap, LecturaModal, ModoLeido } from './modelo';

/**
 * La masa acumulada que se espera en cada dirección horizontal: el 90 %. Es lo
 * que piden las normas de análisis sísmico modal de uso corriente; aquí es un
 * aviso, no una verificación con cláusula.
 */
export const MASA_MINIMA = 0.9;

export type Direccion = 'X' | 'Y' | 'Z';

const CLAVES: Record<Direccion, { m: keyof ModoLeido; s: keyof ModoLeido }> = {
  X: { m: 'ux', s: 'sux' },
  Y: { m: 'uy', s: 'suy' },
  Z: { m: 'uz', s: 'suz' },
};

export interface ResumenDireccion {
  /** El modo con más masa en esta dirección, y su periodo y su masa. */
  dominante?: { n: number; T: number; masa: number };
  /** El primer modo con el que la acumulada llega al 90 %, o `undefined` si no llega. */
  alNoventa?: number;
  /** La acumulada con todos los modos leídos. */
  acumulada: number;
}

export interface ResumenModal {
  modos: number;
  /** El periodo del modo 1. */
  T1?: number;
  /** Si la lectura trae masas participantes: sin ellas, solo hay periodos. */
  conMasas: boolean;
  porDireccion: Record<Direccion, ResumenDireccion>;
}

export function resumenModal(lectura: LecturaModal): ResumenModal {
  const modos = [...lectura.modos].sort((a, b) => a.n - b.n);
  const conMasas = modos.some((m) => m.ux !== undefined);
  const porDireccion = {} as Record<Direccion, ResumenDireccion>;
  for (const d of ['X', 'Y', 'Z'] as const) {
    const { m, s } = CLAVES[d];
    let dominante: ResumenDireccion['dominante'];
    let alNoventa: number | undefined;
    for (const modo of modos) {
      const masa = modo[m] ?? 0;
      if (!dominante || masa > dominante.masa) dominante = { n: modo.n, T: modo.T, masa };
      if (alNoventa === undefined && (modo[s] ?? 0) >= MASA_MINIMA) alNoventa = modo.n;
    }
    porDireccion[d] = {
      ...(conMasas && dominante ? { dominante } : {}),
      ...(alNoventa !== undefined ? { alNoventa } : {}),
      acumulada: modos.length ? (modos[modos.length - 1][s] ?? 0) : 0,
    };
  }
  return { modos: modos.length, ...(modos.length ? { T1: modos[0].T } : {}), conMasas, porDireccion };
}

/** Un nombre que un nodo de resultados publica: `expr` es el valor con su
 *  unidad, en texto que el motor lee (`0.714927123 s`). */
export interface Publicado {
  nombre: string;
  expr: string;
}

/**
 * Lo que el sub-nodo Modal publica: el periodo del modo dominante en cada
 * dirección horizontal, `T_x` y `T_y`, en segundos. Sin masas participantes no
 * hay modo dominante, y no se publica nada.
 *
 * Una lectura atrasada sigue publicando: el nodo ya lo dice en aviso, y retirar
 * el valor pondría en rojo todas las hojas de aguas abajo por un guardado del
 * `.sdb`.
 */
export function publicaModal(lectura: LecturaModal): Publicado[] {
  const { porDireccion } = resumenModal(lectura);
  const salida: Publicado[] = [];
  for (const [nombre, d] of [['T_x', 'X'], ['T_y', 'Y']] as const) {
    const T = porDireccion[d].dominante?.T;
    // `String` y no `toFixed`: el número entra entero, con todas sus cifras.
    if (T !== undefined && Number.isFinite(T)) salida.push({ nombre, expr: `${String(T)} s` });
  }
  return salida;
}

/**
 * Por qué una lectura de resultados ya no describe el modelo conectado, o
 * `undefined` si lo describe. Es otro modelo, o el mismo guardado después de
 * leerla: el `.sdb` es más nuevo que el sello.
 */
export function atrasoDe(lectura: { modelo: string; modificado: string }, conexion: ConexionSap | undefined): string | undefined {
  if (!conexion) return undefined;
  if (lectura.modelo !== conexion.modelo) return `se leyó de ${lectura.modelo}, y el conectado es ${conexion.modelo}`;
  if (!conexion.modificado) return undefined;
  const leida = Date.parse(lectura.modificado);
  const ahora = Date.parse(conexion.modificado);
  // Un segundo de margen: la misma fecha escrita por dos caminos no es un cambio.
  if (Number.isFinite(leida) && Number.isFinite(ahora) && ahora - leida > 1000) {
    return `el modelo se guardó el ${new Date(ahora).toLocaleString()}, después de leerla`;
  }
  return undefined;
}

/** Una fracción como porcentaje legible: `94,0 %`. */
export function porcentaje(x: number): string {
  return `${(x * 100).toFixed(1).replace('.', ',')} %`;
}

/** Un periodo con tres decimales: `0,715 s`. */
export function segundos(T: number): string {
  return `${T.toFixed(3).replace('.', ',')} s`;
}
