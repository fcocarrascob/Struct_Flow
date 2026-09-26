// Las reacciones en los apoyos leídas del modelo, en lo que se revisa: en cada
// caso, qué apoyo se lleva la mayor compresión, la mayor tracción, el mayor
// corte y el mayor momento.
//
// Puro, sin React: lo pintan el panel, la tabla y la tarjeta del sub-nodo
// Apoyos, y `verify:obra` lo comprueba. Los valores llegan en kN y kN·m. Lo que
// publica a la obra —las gobernantes por tipo y conjunto— sale de
// `publicaApoyos`, y lo escribe `evaluacion.ts`.
//
// EL SIGNO DE F3. En SAP, una reacción positiva apunta hacia arriba: el apoyo
// empuja la estructura hacia arriba, es decir, la estructura COMPRIME la
// fundación. Una F3 negativa es tracción (arrancamiento). Aquí se dice con
// palabras, para que nadie tenga que acordarse.

import {
  CLAVES_GOBERNANTE,
  type ConexionSap,
  type ConjuntoDiseno,
  type Gobernante,
  type GobernantesDeApoyo,
  type LecturaApoyos,
  type LecturaBasal,
  type LecturaCombinaciones,
  type LecturaConjunto,
  type Obra,
  type ReaccionesDeCaso,
  type Vector6,
} from './modelo';
import { familiaDe } from './sap-combinaciones';
import { atrasoDe, type Publicado } from './sap-modal';

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

// ── Tipos de apoyo: los grupos de SAP ────────────────────────────────────────

/** Un tipo de apoyo: los apoyos de un grupo de SAP, o los que no tienen grupo. */
export interface TipoDeApoyo {
  /** El grupo de SAP; `null` para los apoyos sin grupo. */
  grupo: string | null;
  apoyos: string[];
  /** Cómo llegaron: asignados al grupo, o alcanzados por sus barras. */
  via: 'directo' | 'barra' | 'ninguna';
}

export interface TiposDeApoyo {
  tipos: TipoDeApoyo[];
  /** Los apoyos que quedaron en más de un tipo: dos grupos los reclaman por igual. */
  repetidos: string[];
  /** Los grupos que alcanzan apoyos por sus barras, pero esos apoyos ya son de otro. */
  cedidos: { grupo: string; apoyos: string[] }[];
}

/**
 * Los apoyos agrupados por grupo de SAP. Nadie diseña 25 placas: se diseña una
 * por tipo de apoyo, y el tipo lo dice cómo el ingeniero organizó el modelo.
 *
 * La regla:
 * 1. Un apoyo es del grupo al que está ASIGNADO (su nudo está en el grupo).
 * 2. Si no está asignado a ninguno, es del grupo cuyas BARRAS llegan a él.
 * 3. Los que no están en ninguno quedan como «sin grupo», a la vista.
 *
 * Así un grupo de diagonales que llega por sus barras a la base de una columna
 * no se lleva ese apoyo: es de la columna, que lo tiene asignado. Si dos grupos
 * lo reclaman por la misma vía, queda en los dos y se avisa.
 */
export function tiposDeApoyo(lectura: LecturaApoyos): TiposDeApoyo {
  const grupos = lectura.grupos ?? [];
  const conDirecto = new Set(grupos.flatMap((g) => g.directos));
  const tipos: TipoDeApoyo[] = [];
  const cedidos: TiposDeApoyo['cedidos'] = [];
  for (const g of grupos) {
    const porBarra = g.porBarra.filter((a) => !conDirecto.has(a));
    const perdidos = g.porBarra.filter((a) => conDirecto.has(a));
    if (perdidos.length) cedidos.push({ grupo: g.nombre, apoyos: perdidos });
    const apoyos = [...g.directos, ...porBarra];
    if (apoyos.length) tipos.push({ grupo: g.nombre, apoyos, via: g.directos.length ? 'directo' : 'barra' });
  }
  const cuenta = new Map<string, number>();
  for (const t of tipos) for (const a of t.apoyos) cuenta.set(a, (cuenta.get(a) ?? 0) + 1);
  const sinGrupo = lectura.apoyos.map((a) => a.nombre).filter((a) => !cuenta.has(a));
  if (sinGrupo.length) tipos.push({ grupo: null, apoyos: sinGrupo, via: 'ninguna' });
  return { tipos, repetidos: [...cuenta].filter(([, n]) => n > 1).map(([a]) => a), cedidos };
}

/**
 * La envolvente de un tipo de apoyo en un conjunto: por criterio, la gobernante
 * del apoyo que más exige. Es lo que se usa para diseñar la placa del tipo.
 */
export function envolventeDeTipo(
  lectura: LecturaConjunto,
  apoyos: readonly string[],
): Partial<Record<keyof GobernantesDeApoyo, Gobernante & { apoyo: string }>> {
  const quiero = new Set(apoyos);
  const salida: Partial<Record<keyof GobernantesDeApoyo, Gobernante & { apoyo: string }>> = {};
  lectura.porApoyo.forEach((g, j) => {
    const apoyo = lectura.apoyos[j];
    if (!quiero.has(apoyo)) return;
    for (const k of CLAVES_GOBERNANTE) {
      const x = g[k];
      if (x && (!salida[k] || x.valor > salida[k]!.valor)) salida[k] = { ...x, apoyo };
    }
  });
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
 * compresión, la mayor tracción, el mayor corte, el mayor momento y la mayor
 * excentricidad M/N, con su vector.
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
        // Sin compresión no hay excentricidad que medir: eso es tracción.
        if (v[2] > CERO) proponer('excentricidad', { combo, valor: Math.hypot(v[3], v[4]) / v[2], v, concurrente: true });
        continue;
      }
      const max = e.max?.[j];
      const min = e.min?.[j];
      if (!max || !min) continue;
      const v = max.map((x, i) => extremo(x, min[i])) as Vector6;
      // El corte, el momento y la excentricidad van con la N MENOR: el M de los
      // extremos con la compresión más chica, o con la tracción, es el que más
      // tracciona los pernos, y el corte sin compresión es el que peor toma la
      // llave. La compresión mayor ya la lleva su propio criterio.
      const nMin = Math.min(max[2], min[2]);
      const conNMin = [v[0], v[1], nMin, v[3], v[4], v[5]] as Vector6;
      proponer('compresion', { combo, valor: max[2], v: max, concurrente: false });
      proponer('traccion', { combo, valor: -min[2], v: min, concurrente: false });
      proponer('corte', { combo, valor: Math.hypot(v[0], v[1]), v: conNMin, concurrente: false });
      proponer('momento', { combo, valor: Math.hypot(v[3], v[4]), v: conNMin, concurrente: false });
      // Si alguno de los dos pasos no comprime, la combinación puede traccionar y
      // eso ya lo cubre la tracción.
      if (nMin > CERO) {
        proponer('excentricidad', { combo, valor: Math.hypot(v[3], v[4]) / nMin, v: conNMin, concurrente: false });
      }
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
/**
 * Si la lectura es anterior al criterio de excentricidad. No es una conjetura:
 * una compresión gobernante CONCURRENTE con momento tiene M/N > 0, así que su
 * apoyo TIENE que tener excentricidad. Si no la tiene, se leyó sin ella, y un
 * «—» en su columna diría «nada comprime con momento», que es falso. (Una no
 * concurrente no prueba nada: su Min puede no comprimir.)
 */
function sinExcentricidad(lectura: LecturaConjunto): boolean {
  return lectura.porApoyo.some((g) => {
    const c = g.compresion;
    return c?.concurrente && Math.hypot(c.v[3], c.v[4]) > CERO && !g.excentricidad;
  });
}

/** Si la lectura se hizo con las familias que el conjunto tiene ahora. */
function deSusFamilias(c: ConjuntoDiseno, lectura: LecturaConjunto): boolean {
  return [...lectura.familias].sort().join() === [...c.familias].sort().join();
}

export function estadoConjunto(
  c: ConjuntoDiseno,
  lectura: LecturaConjunto | undefined,
  sap: ConexionSap | undefined,
): { estado: 'sin-leer' | 'al-dia' | 'desactualizado'; motivo?: string } {
  if (!lectura) return { estado: 'sin-leer' };
  if (sinExcentricidad(lectura)) {
    return { estado: 'desactualizado', motivo: 'se leyó antes de que existiera el criterio de excentricidad' };
  }
  if (!deSusFamilias(c, lectura)) {
    return { estado: 'desactualizado', motivo: 'cambiaron sus familias desde que se leyó' };
  }
  const atraso = atrasoDe(lectura, sap);
  return atraso ? { estado: 'desactualizado', motivo: atraso } : { estado: 'al-dia' };
}

/** Los extremos de un conjunto entre todos los apoyos: la envolvente de todos. */
export function extremosDeConjunto(lectura: LecturaConjunto): Partial<Record<keyof GobernantesDeApoyo, Gobernante & { apoyo: string }>> {
  return envolventeDeTipo(lectura, lectura.apoyos);
}

// ── Lo que publican a la obra ────────────────────────────────────────────────

/**
 * Un alias es un tramo de nombre: letras y números, empezando por letra, y sin
 * «_», que partiría el subíndice (`N_c_CP_LRFD` se lee N_{c,CP,LRFD}).
 */
export const ALIAS_RE = /^[A-Za-z][A-Za-z0-9]*$/;

/**
 * El alias que toma un grupo o un conjunto si nadie elige otro: la palabra, si
 * es una sola (`LRFD`), o las iniciales de cada tramo (`COL_PPALES` → `CP`,
 * `Hormigón (LRFD)` → `HL`). Si empieza por cifra, lleva una `T` delante.
 */
export function aliasPorDefecto(texto: string): string {
  const tramos = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const a = tramos.length === 1 ? tramos[0] : tramos.map((t) => t[0]).join('').toUpperCase();
  if (!a) return 'X';
  return /^[0-9]/.test(a) ? `T${a}` : a;
}

/** El alias con que cada conjunto de diseño entra en los nombres, en el orden de la obra. */
export function aliasDeConjuntos(obra: Obra): string[] {
  return (obra.conjuntosDiseno ?? []).map((c) => c.alias ?? aliasPorDefecto(c.nombre));
}

/** Los cuatro criterios, con la letra con que entran en el nombre. */
export const CRITERIOS = [
  { k: 'compresion', letra: 'c' },
  { k: 'traccion', letra: 't' },
  { k: 'corte', letra: 'v' },
  { k: 'momento', letra: 'm' },
  { k: 'excentricidad', letra: 'e' },
] as const satisfies readonly { k: keyof GobernantesDeApoyo; letra: string }[];

/** Una fila de lo publicado: un tipo en un conjunto, y qué criterios tienen gobernante. */
export interface FilaPublicada {
  conjunto: string;
  grupo: string;
  /** `_CP_LRFD`: lo que va detrás de `N_c`. */
  sufijo: string;
  /** Por criterio presente, si su gobernante es concurrente. */
  criterios: Partial<Record<keyof GobernantesDeApoyo, boolean>>;
}

export interface PublicacionApoyos {
  publicados: Publicado[];
  filas: FilaPublicada[];
  /** Alias inválidos o repetidos: lo que no publica, y por qué. */
  problemas: string[];
}

/**
 * Las gobernantes de cada tipo de apoyo en cada conjunto, como nombres de la
 * obra: `<magnitud>_<criterio>_<tipo>_<conjunto>`.
 *
 * - La magnitud: `N` es F3 (positiva compresión, negativa tracción), `V` el
 *   corte √(F1² + F2²) y `M` el momento √(M1² + M2²), en kN y kN·m.
 * - El criterio dice qué combinación gobierna: `c` compresión, `t` tracción,
 *   `v` corte, `m` momento y `e` excentricidad (el mayor M/N con compresión, el
 *   que tracciona los pernos). De cada una salen las tres magnitudes, las de la
 *   misma combinación (`V_c` es el corte que acompaña a la compresión máxima);
 *   la hoja saca `e := M_e / N_e`.
 * - `nc_<criterio>_…` vale 1 si esa combinación NO es concurrente (espectro o
 *   envolvente): sus acompañantes son extremos por componente, no de un mismo
 *   instante. Los nombres no cambian por eso, porque renombrar en una relectura
 *   rompería las hojas; la hoja que necesite concurrencia lo verifica.
 *
 * Un criterio sin gobernante (nada tracciona) no publica: no se inventa un cero.
 * Tampoco los apoyos sin grupo, ni un conjunto cuya lectura es de otras
 * familias. Una lectura atrasada sí publica, como la del modal: el nodo avisa.
 */
export function publicaApoyos(obra: Obra): PublicacionApoyos {
  const vacia: PublicacionApoyos = { publicados: [], filas: [], problemas: [] };
  const sap = obra.sap;
  if (!obra.modulos.includes('sap-apoyos') || !sap?.apoyos?.grupos) return vacia;
  const problemas: string[] = [];

  /** Los que tienen alias válido y único; el resto, a `problemas`. */
  const conAlias = <T>(items: readonly T[], alias: (x: T) => string, nombre: (x: T) => string) => {
    const usados = new Map<string, string>();
    const salida: { item: T; alias: string }[] = [];
    for (const item of items) {
      const a = alias(item);
      if (!ALIAS_RE.test(a)) {
        problemas.push(`El alias «${a}» de ${nombre(item)} no sirve de nombre: letras y números, empezando por letra, sin «_».`);
      } else if (usados.has(a)) {
        problemas.push(`${nombre(item)} tiene el mismo alias «${a}» que ${usados.get(a)}: no publica hasta que le des otro.`);
      } else {
        usados.set(a, nombre(item));
        salida.push({ item, alias: a });
      }
    }
    return salida;
  };

  const tipos = conAlias(
    tiposDeApoyo(sap.apoyos).tipos.filter((t): t is TipoDeApoyo & { grupo: string } => t.grupo !== null),
    (t) => obra.aliasTipos?.[t.grupo] ?? aliasPorDefecto(t.grupo),
    (t) => t.grupo,
  );
  const conjuntos = conAlias(
    (obra.conjuntosDiseno ?? []).filter((c) => {
      const l = sap.conjuntos?.[c.id];
      return l !== undefined && deSusFamilias(c, l);
    }),
    (c) => c.alias ?? aliasPorDefecto(c.nombre),
    (c) => `el conjunto «${c.nombre}»`,
  );

  const publicados: Publicado[] = [];
  const filas: FilaPublicada[] = [];
  for (const { item: c, alias: ac } of conjuntos) {
    const lectura = sap.conjuntos![c.id];
    for (const { item: t, alias: at } of tipos) {
      const sufijo = `_${at}_${ac}`;
      const env = envolventeDeTipo(lectura, t.apoyos);
      const criterios: FilaPublicada['criterios'] = {};
      for (const { k, letra } of CRITERIOS) {
        const g = env[k];
        if (!g) continue;
        criterios[k] = g.concurrente;
        const N = g.v[2];
        const V = Math.hypot(g.v[0], g.v[1]);
        const M = Math.hypot(g.v[3], g.v[4]);
        // La magnitud que gobierna va primero: `V_v`, `N_v`, `M_v`. La
        // excentricidad no se publica: es `M_e / N_e`, y lo que se puede derivar
        // no se declara.
        const magnitudes: [string, number, string][] = [
          ['N', N, 'kN'],
          ['V', V, 'kN'],
          ['M', M, 'kN*m'],
        ];
        const primera = { compresion: 0, traccion: 0, corte: 1, momento: 2, excentricidad: 2 }[k];
        magnitudes.unshift(...magnitudes.splice(primera, 1));
        for (const [mag, x, u] of magnitudes) {
          publicados.push({ nombre: `${mag}_${letra}${sufijo}`, expr: `${String(x)} ${u}` });
        }
        publicados.push({ nombre: `nc_${letra}${sufijo}`, expr: g.concurrente ? '0' : '1' });
      }
      filas.push({ conjunto: c.nombre, grupo: t.grupo, sufijo, criterios });
    }
  }
  return { publicados, filas, problemas };
}

/** Los casos que tienen tracción en algún apoyo: los que levantan la estructura. */
export function casosConTraccion(lectura: LecturaApoyos): string[] {
  return extremosPorCaso(lectura)
    .filter((e) => e.traccion)
    .map((e) => e.caso);
}
