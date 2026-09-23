// ─────────────────────────────────────────────────────────────────────────────
// Una obra en disco: una carpeta con el grafo y una hoja por nodo.
//
//   <id-obra>/
//     obra.json            el grafo: la obra sin regiones, cada nodo con
//                          "hoja": "hojas/<archivo>.json"
//     hojas/<nodo>.json    {version, meta?, regions}: el mismo archivo que
//                          exporta el canvas, así que se abre suelto en /canvas
//
// Es puro: de una obra a un mapa ruta → texto y de vuelta. Quien toca el disco
// es el servidor (`servidor/obras.mjs`), que no entiende nada de esto y solo
// lee y escribe archivos. Así lo que decide cómo se parte una obra se puede
// comprobar en `verify:obra` sin tocar el disco.
//
// SE SANEA AL LEER, NUNCA AL ESCRIBIR. `unirObra` devuelve el crudo, y quien
// llama lo pasa por `sanearObra` como a cualquier obra guardada.
//
// Por qué una hoja por archivo y no la obra entera en uno: el diff. Tocar una
// fórmula de la costanera tiene que cambiar el archivo de la costanera y nada
// más, y un `git log` de esa hoja tiene que contar la historia de ese cálculo.
// Por lo mismo la salida es determinista —dos espacios, LF, salto final—:
// reescribir una obra que nadie tocó no puede dejar un cambio en git.
// ─────────────────────────────────────────────────────────────────────────────

import { archivoDeObra } from './almacen';
import type { Obra } from './modelo';
import type { Region } from '../../lib/worksheet';
import type { MetaPlanilla } from '../../lib/biblioteca/contrato';

export const ARCHIVO_OBRA = 'obra.json';
export const DIR_HOJAS = 'hojas';

/** Ruta relativa a la carpeta de la obra → contenido. */
export type Archivos = Record<string, string>;

const texto = (dato: unknown): string => JSON.stringify(dato, null, 2) + '\n';

/** Nombres que Windows no deja crear, se les ponga la extensión que se les
 *  ponga. Un nodo llamado `con` no puede dejar la obra sin guardar. */
const RESERVADOS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

/**
 * El archivo de la hoja de un nodo, legible y seguro.
 *
 * Sale del id, que es estable —el nombre del nodo se edita y renombraría el
 * archivo, que en git se lee como borrar uno y crear otro—. Un id no es un
 * nombre de archivo: puede traer `/`, `..` o mayúsculas que en Windows chocan
 * con su minúscula. Lo que no cuadra se reduce a `[a-z0-9-]`, y dos que se
 * reduzcan a lo mismo se separan con un número.
 */
function archivoDeHoja(id: string, tomados: Set<string>): string {
  let base = id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!base) base = 'nodo';
  if (RESERVADOS.test(base)) base += '-hoja';
  let nombre = base;
  for (let i = 2; tomados.has(nombre); i++) nombre = `${base}-${i}`;
  tomados.add(nombre);
  return `${DIR_HOJAS}/${nombre}.json`;
}

/** Lo que va en el archivo de una hoja: el formato de exportar del canvas. */
function hojaDeNodo(nodo: { hoja: Region[]; meta?: MetaPlanilla }) {
  return { version: 1, ...(nodo.meta ? { meta: nodo.meta } : {}), regions: nodo.hoja };
}

/** El nodo tal como queda en `obra.json`: sin regiones ni `meta`, que viajan en
 *  su hoja, y con la ruta de esa hoja en su lugar. */
function sinHoja<T extends { hoja: Region[]; meta?: MetaPlanilla }>(nodo: T, ruta: string) {
  const { hoja, meta, ...resto } = nodo;
  return { ...resto, hoja: ruta };
}

export function partirObra(obra: Obra): Archivos {
  const archivos: Archivos = {};
  const tomados = new Set<string>();
  const guardar = <T extends { id: string; hoja: Region[]; meta?: MetaPlanilla }>(nodo: T) => {
    const ruta = archivoDeHoja(nodo.id, tomados);
    archivos[ruta] = texto(hojaDeNodo(nodo));
    return sinHoja(nodo, ruta);
  };
  const grafo = { ...obra, calculos: obra.calculos.map(guardar) };
  // `obra.json` es un archivo de obra como el de exportar, con su `tipo`: así se
  // reconoce al abrirlo suelto y lo que ya sabe leer uno sabe leer el otro.
  return { [ARCHIVO_OBRA]: texto(archivoDeObra(grafo as unknown as Obra)), ...archivos };
}

export interface Union {
  /** La obra cruda, lista para `sanearObra`; `null` si no hay grafo que leer. */
  crudo: unknown;
  /** Lo que no se pudo leer, en palabras. La obra abre igual sin ello. */
  problemas: string[];
}

function parsear(ruta: string, archivos: Archivos, problemas: string[]): unknown {
  const contenido = archivos[ruta];
  if (contenido === undefined) {
    problemas.push(`Falta ${ruta}.`);
    return undefined;
  }
  try {
    return JSON.parse(contenido);
  } catch {
    problemas.push(`${ruta} no es JSON válido.`);
    return undefined;
  }
}

/**
 * Vuelve a poner cada hoja en su nodo.
 *
 * Una hoja que falta o no se lee deja el nodo con la hoja vacía y un problema
 * que lo nombra: perder el nodo entero —su nombre, su frontera, lo que
 * publica— por un archivo roto sería tirar más de lo que está roto.
 */
export function unirObra(archivos: Archivos): Union {
  const problemas: string[] = [];
  const datos = parsear(ARCHIVO_OBRA, archivos, problemas);
  if (typeof datos !== 'object' || datos === null) {
    if (datos !== undefined) problemas.push(`${ARCHIVO_OBRA} no contiene una obra.`);
    return { crudo: null, problemas };
  }
  const dentro = (datos as { obra?: unknown }).obra;
  const grafo = (typeof dentro === 'object' && dentro !== null ? dentro : datos) as Record<string, unknown>;

  const conHoja = (nodo: unknown): unknown => {
    if (typeof nodo !== 'object' || nodo === null) return nodo;
    const n = nodo as { hoja?: unknown };
    if (typeof n.hoja !== 'string') return nodo;
    const hoja = parsear(n.hoja, archivos, problemas) as { regions?: unknown; meta?: unknown } | undefined;
    const regiones = Array.isArray(hoja?.regions) ? hoja.regions : [];
    if (hoja !== undefined && !Array.isArray(hoja?.regions)) problemas.push(`${n.hoja} no trae \`regions\`.`);
    return { ...n, hoja: regiones, ...(hoja?.meta !== undefined ? { meta: hoja.meta } : {}) };
  };

  // Una carpeta escrita antes de retirar las cargas las trae con sus partidas, y
  // cada partida con su hoja aparte. Se unen igual: `sanearObra` las migra a
  // cálculos, y al guardar la carpeta ya sale sin ellas.
  const cargas = Array.isArray(grafo.cargas)
    ? grafo.cargas.map((c: unknown) => {
        if (typeof c !== 'object' || c === null) return c;
        const sub = (c as { subcargas?: unknown }).subcargas;
        return Array.isArray(sub) ? { ...c, subcargas: sub.map(conHoja) } : c;
      })
    : grafo.cargas;
  const calculos = Array.isArray(grafo.calculos) ? grafo.calculos.map(conHoja) : grafo.calculos;

  return { crudo: { ...grafo, cargas, calculos }, problemas };
}
