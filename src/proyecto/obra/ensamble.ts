// El ensamble de una vista: el grupo de cálculos que la acompaña, armado desde una
// plantilla en código (`docs/rumbo.md`, «La base de columna como modelo
// geométrico, y sus componentes»).
//
// Una plantilla es la lista de nodos del grupo —hojas libres por secciones y
// genéricas con sus ataduras—, escrita con los nombres sin sufijo. Cada sección,
// nodo o capa de ataduras puede depender de una opción de la configuración de la
// vista (`si: 'silla'` está si hay silla; `si: '!silla'`, si no la hay). Al
// instanciarla:
//
//   - todo nombre que el grupo DEFINE lleva el sufijo del tipo de apoyo
//     (`L_pb` → `L_pb_CP`), en fórmulas, tablas, ataduras, publicaciones y prosa,
//     para que dos bases no choquen;
//   - los marcadores `$T` (tipo), `$D` (conjunto de diseño), `$S` (conjunto de
//     sobrerresistencia) y `$G` (grupo de SAP) se reemplazan, así que
//     `N_c_$T_$D` es la gobernante que publica el nodo de apoyos;
//   - lo demás —las externas que el grupo usa y no define— queda como está.
//
// `reconfigurar` es la diferencia entre la plantilla con la configuración vieja
// y con la nueva, aplicada sobre lo que hay: los bloques llevan ids estables
// (`<nodo>:<sección>:<nombre definido o índice>`), así que se quitan y se ponen
// solo los del componente que cambió, y lo que el ingeniero editó en otro sitio
// se queda. Todo es puro.

import type { Region } from '../../lib/worksheet';
import type { Config } from '../vistas/tipos';
import { cumple, leerCondicion, type Condicion } from '../vistas/condicion';
import { VISTAS, configCompleta } from '../vistas/registro';
import { definicionesDe } from './hoja';
import { borrarCalculo, type Frontera, type Obra, type NodoCalculo, type Revision } from './modelo';
import { nombresDefinidos } from './copia';

// ── La plantilla ─────────────────────────────────────────────────────────────

/** Cuándo existe una parte de la plantilla: la gramática está en `vistas/condicion.ts`. */
export type { Condicion };

/**
 * Un bloque de hoja. Con `si`, existe solo bajo esa condición, sin salir de su
 * sección: su id sigue siendo el mismo, y una hoja armada antes lo reconoce.
 */
export type BloquePlantilla =
  | { kind: 'text' | 'math'; src: string; si?: Condicion; id?: string }
  | { kind: 'table'; src: string; tabla: NonNullable<Region['tabla']>; si?: Condicion; id?: string };

/**
 * Un bloque que se agrega a una sección ya publicada lleva `id` (en minúsculas,
 * con guiones: `nota-desarrollo`). Los que no lo llevan se identifican por su
 * índice, y ese índice NO cuenta los que llevan `id`: así un texto nuevo en medio
 * de la sección no corre el de los siguientes, que es lo que dejaba a una base
 * armada antes con el texto equivocado bajo cada id. `corrimientos` lo comprueba
 * contra la última versión congelada.
 */
const ID_BLOQUE = /^[a-z][a-z0-9-]*$/;

export interface SeccionPlantilla {
  clave: string;
  si?: Condicion;
  bloques: BloquePlantilla[];
}

/** Ataduras y valores que se suman, o se quitan con `null`, bajo una condición. */
export interface CapaPlantilla {
  si: Condicion;
  entradas?: Record<string, number | null>;
  formulas?: Record<string, string | null>;
}

export interface FronteraPlantilla {
  procedencia: 'biblioteca' | 'vista';
  /** El slug de la genérica, o el id de la vista. */
  id: string;
  entradas: Record<string, number>;
  formulas: Record<string, string>;
  publica: Record<string, string>;
  capas?: CapaPlantilla[];
}

export interface NodoPlantilla {
  /**
   * Estable: es la clave del nodo en el ensamble y la base de sus ids de bloque.
   * Varios nodos pueden compartirla si sus condiciones se excluyen: son las
   * variantes de una misma pieza (la placa de gran excentricidad o la articulada),
   * y al cambiar de una a otra el nodo conserva su id, su sitio y su marca ⚑.
   */
  clave: string;
  nombre: string;
  si?: Condicion;
  /** Una hoja libre, por secciones. */
  hoja?: SeccionPlantilla[];
  frontera?: FronteraPlantilla;
  revisar?: string;
}

export interface Plantilla {
  nodos: NodoPlantilla[];
  /**
   * Lo que el grupo usa, no define y no son gobernantes del nodo de apoyos: sin
   * ese nodo, la hoja escrita a mano las pone (las que la obra no tenga ya).
   */
  externas?: { nombre: string; unidad: string; texto: string }[];
}

/** Con qué se instancia: el tipo de apoyo y los conjuntos de sus gobernantes. */
export interface Parametros {
  /** El alias del tipo (`CP`): sufijo de los nombres y parte de las gobernantes. */
  tipo: string;
  /** El grupo de SAP (`COL_PPALES`), para los títulos. */
  grupoSap: string;
  diseno: string;
  sobrerresistencia: string;
}

/** Lo que la vista guarda de su ensamble: con qué se armó y qué nodo es cada clave. */
export interface Ensamble extends Parametros {
  nodos: Record<string, string>;
  /**
   * La huella de la plantilla con que se armó o se actualizó por última vez
   * (`huellaDePlantilla`). Sin ella, la base es anterior a las versiones y se toma
   * la primera congelada.
   */
  plantilla?: string;
}

/** Una plantilla congelada: `vistas/<vista>/versiones/`, escrita por `npm run plantillas:congelar`. */
export interface VersionPlantilla {
  version: string;
  fecha: string;
  plantilla: Plantilla;
}

// ── Instanciar ───────────────────────────────────────────────────────────────

/**
 * Lo que está mal en una plantilla respecto de las opciones de su vista: una
 * condición ilegible o que nombra una opción o variante que no existe, y una
 * configuración en la que dos nodos con la misma clave existen a la vez (o
 * ninguno de los que la vista necesita). Se recorren todas las configuraciones
 * —con tres o cuatro opciones son unas decenas—, pasadas por `normalizar` si se
 * da: una combinación que la vista nunca admite (placa rotulada con silla) no
 * tiene por qué armar.
 */
export function problemasDePlantilla(
  p: Plantilla,
  opciones: readonly { clave: string; variantes: readonly { id: string }[] }[],
  normalizar: (c: Config) => Config = (c) => c,
): string[] {
  const problemas: string[] = problemasDeIds(p);
  const condiciones = p.nodos.flatMap((n) => [
    ...(n.si ? [{ donde: n.clave, si: n.si }] : []),
    ...(n.hoja ?? []).flatMap((s) => [
      ...(s.si ? [{ donde: `${n.clave}/${s.clave}`, si: s.si }] : []),
      ...s.bloques.flatMap((b, i) => (b.si ? [{ donde: `${n.clave}/${s.clave}/${i + 1}`, si: b.si }] : [])),
    ]),
    ...(n.frontera?.capas ?? []).map((c) => ({ donde: `${n.clave}/capa`, si: c.si })),
  ]);
  for (const { donde, si } of condiciones) {
    const partes = leerCondicion(si);
    if (!partes) {
      problemas.push(`${donde}: la condición «${si}» no se entiende.`);
      continue;
    }
    for (const c of partes) {
      const op = opciones.find((o) => o.clave === c.clave);
      if (!op) problemas.push(`${donde}: «${si}» nombra la opción «${c.clave}», que la vista no tiene.`);
      else for (const v of c.variantes ?? []) if (!op.variantes.some((x) => x.id === v)) problemas.push(`${donde}: «${si}» nombra la variante «${v}», que «${c.clave}» no tiene.`);
    }
  }
  let todas: Config[] = [{}];
  for (const o of opciones) todas = todas.flatMap((c) => o.variantes.map((v) => ({ ...c, [o.clave]: v.id })));
  const configs = [...new Map(todas.map((c) => normalizar(c)).map((c) => [JSON.stringify(c), c])).values()];
  for (const config of configs) {
    const presentes = p.nodos.filter((n) => cumple(n.si, config));
    const claves = presentes.map((n) => n.clave);
    const dobles = [...new Set(claves.filter((k, i) => claves.indexOf(k) !== i))];
    if (dobles.length) problemas.push(`Con ${JSON.stringify(config)}, «${dobles.join('», «')}» existe dos veces.`);
    if (!presentes.some((n) => n.frontera?.procedencia === 'vista')) problemas.push(`Con ${JSON.stringify(config)}, no hay vista.`);
  }
  return problemas;
}

const TOKEN = /[\p{L}_][\p{L}\p{N}_]*/gu;

const definicionDe = (b: BloquePlantilla) => (b.kind === 'math' ? /^\s*([\p{L}_][\p{L}\p{N}_]*)\s*:=/u.exec(b.src)?.[1] : undefined);

function bloquesDe(n: NodoPlantilla, config: Config | null): { clave: string; bloque: BloquePlantilla }[] {
  const salida: { clave: string; bloque: BloquePlantilla }[] = [];
  for (const s of n.hoja ?? []) {
    if (config && !cumple(s.si, config)) continue;
    let indice = 0;
    for (const b of s.bloques) {
      // El índice cuenta los bloques condicionados aunque no estén —el de los demás
      // no cambia con la configuración—, pero no los que llevan `id`.
      if (!b.id) indice++;
      if (config && !cumple(b.si, config)) continue;
      // Una definición se identifica por su nombre: sobrevive a que la plantilla
      // agregue o mueva bloques de su sección.
      salida.push({ clave: `${s.clave}:${b.id ?? definicionDe(b) ?? indice}`, bloque: b });
    }
  }
  return salida;
}

/**
 * La huella de una plantilla: 16 hex de su JSON. Es la versión que guarda una base
 * armada, y el nombre de su archivo congelado. No es un sello criptográfico —nadie
 * la falsifica—, y ser síncrona deja calcularla al armar.
 */
export function huellaDePlantilla(p: Plantilla): string {
  const texto = JSON.stringify(p);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (x: number) => (x >>> 0).toString(16).padStart(8, '0');
  return hex(h2) + hex(h1);
}

/** Los `id` de bloque mal escritos o repetidos dentro de su sección. */
function problemasDeIds(p: Plantilla): string[] {
  const problemas: string[] = [];
  for (const n of p.nodos) {
    for (const s of n.hoja ?? []) {
      const vistos = new Set<string>();
      for (const b of s.bloques) {
        const def = definicionDe(b);
        if (def && vistos.has(def) && !b.si) problemas.push(`${n.clave}/${s.clave}: «${def}» se define dos veces sin condición.`);
        if (def) vistos.add(def);
        if (!b.id) continue;
        if (!ID_BLOQUE.test(b.id)) problemas.push(`${n.clave}/${s.clave}: el id «${b.id}» tiene que ir en minúsculas y con guiones.`);
        else if (vistos.has(b.id) && !def) problemas.push(`${n.clave}/${s.clave}: el id «${b.id}» está repetido.`);
        vistos.add(b.id);
      }
    }
  }
  return problemas;
}

const contenidoPlantilla = (b: BloquePlantilla) => JSON.stringify({ kind: b.kind, src: b.src, tabla: b.kind === 'table' ? b.tabla : undefined });

/**
 * Los bloques que cambiaron de id entre dos versiones de la plantilla: el mismo
 * contenido bajo otra clave de su sección, con su clave vieja ocupada por otra
 * cosa. Es el síntoma de un bloque agregado sin `id` delante de otros, y se
 * arregla dándole uno. Vacío si no hay ninguno.
 */
export function corrimientos(antes: Plantilla, despues: Plantilla): string[] {
  const salida: string[] = [];
  const porNodo = (p: Plantilla) => {
    const m = new Map<string, Map<string, string>>();
    for (const n of p.nodos) {
      const claves = m.get(n.clave) ?? new Map<string, string>();
      for (const x of bloquesDe(n, null)) if (!claves.has(x.clave)) claves.set(x.clave, contenidoPlantilla(x.bloque));
      m.set(n.clave, claves);
    }
    return m;
  };
  const a = porNodo(antes);
  const d = porNodo(despues);
  for (const [nodo, viejos] of a) {
    const nuevos = d.get(nodo);
    if (!nuevos) continue;
    const porContenido = new Map<string, string[]>();
    for (const [clave, c] of nuevos) porContenido.set(c, [...(porContenido.get(c) ?? []), clave]);
    for (const [clave, c] of viejos) {
      if (nuevos.get(clave) === c || !nuevos.has(clave)) continue;
      const seccion = clave.slice(0, clave.lastIndexOf(':'));
      const otra = (porContenido.get(c) ?? []).find((k) => k !== clave && k.startsWith(`${seccion}:`) && viejos.get(k) !== c);
      if (otra) salida.push(`${nodo}: el bloque ${clave} pasó a ser ${otra}; dale un \`id\` al bloque que se agregó delante.`);
    }
  }
  return salida;
}

const aRegion = (id: string, b: BloquePlantilla, i: number): Region =>
  b.kind === 'table'
    ? { id, kind: 'table', x: 40, y: 40 + i * 48, src: b.src, tabla: structuredClone(b.tabla) }
    : { id, kind: b.kind, x: 40, y: 40 + i * 48, src: b.src };

/**
 * Los nombres que el grupo define, en TODAS sus variantes: el sufijo no puede
 * depender de la configuración, o quitar la silla renombraría la placa.
 */
export function nombresPropios(p: Plantilla): Set<string> {
  const propios = new Set<string>();
  for (const n of p.nodos) {
    const hoja = bloquesDe(n, null).map((x, i) => aRegion(`r${i}`, x.bloque, i));
    for (const v of definicionesDe(hoja)) propios.add(v);
    for (const alias of Object.values(n.frontera?.publica ?? {})) propios.add(alias);
  }
  return propios;
}

/** Un texto de la plantilla, con el sufijo puesto y los marcadores resueltos. */
export function traducir(texto: string, propios: ReadonlySet<string>, p: Parametros): string {
  return texto
    .replace(TOKEN, (t) => (propios.has(t) ? `${t}_${p.tipo}` : t))
    .replace(/\$T/g, p.tipo)
    .replace(/\$D/g, p.diseno)
    .replace(/\$S/g, p.sobrerresistencia)
    .replace(/\$G/g, p.grupoSap);
}

function traducirBloque(b: BloquePlantilla, tr: (s: string) => string): BloquePlantilla {
  if (b.kind !== 'table') return { kind: b.kind, src: tr(b.src) };
  return { kind: 'table', src: tr(b.src), tabla: { ...b.tabla, celdas: b.tabla.celdas.map((f) => f.map(tr)) } };
}

/** La frontera de un nodo con las capas de su configuración aplicadas y traducida. */
function fronteraDe(f: FronteraPlantilla, config: Config, tr: (s: string) => string, sello: string): Frontera {
  const entradas: Record<string, number> = { ...f.entradas };
  const formulas: Record<string, string> = { ...f.formulas };
  for (const c of f.capas ?? []) {
    if (!cumple(c.si, config)) continue;
    for (const [k, v] of Object.entries(c.entradas ?? {})) v === null ? delete entradas[k] : (entradas[k] = v);
    for (const [k, v] of Object.entries(c.formulas ?? {})) v === null ? delete formulas[k] : (formulas[k] = v);
  }
  const publica = Object.fromEntries(Object.entries(f.publica).map(([k, v]) => [k, tr(v)]));
  const traducidas = Object.fromEntries(Object.entries(formulas).map(([k, v]) => [k, tr(v)]));
  return f.procedencia === 'biblioteca'
    ? { procedencia: 'biblioteca', slug: f.id, sha256: sello, entradas, formulas: traducidas, publica }
    : { procedencia: 'vista', vista: f.id, version: 1, config: { ...config }, entradas, formulas: traducidas, publica };
}

/**
 * Los nodos de la plantilla que existen con esta configuración, instanciados.
 * `ids` da el id de cada clave; la de la vista no lleva todavía su ensamble.
 */
export function instanciar(
  p: Plantilla,
  config: Config,
  params: Parametros,
  ids: Readonly<Record<string, string>>,
  sellos: Readonly<Record<string, string>>,
): NodoCalculo[] {
  const propios = nombresPropios(p);
  const tr = (s: string) => traducir(s, propios, params);
  return p.nodos
    .filter((n) => cumple(n.si, config))
    .map((n) => {
      const id = ids[n.clave];
      const hoja = bloquesDe(n, config).map((x, i) => aRegion(`${id}:${x.clave}`, traducirBloque(x.bloque, tr), i));
      const revisar: Revision | undefined = n.revisar ? { nota: tr(n.revisar), por: 'asistente' } : undefined;
      return {
        id,
        nombre: tr(n.nombre),
        hoja,
        ...(n.frontera ? { frontera: fronteraDe(n.frontera, config, tr, sellos[n.frontera.id] ?? '') } : {}),
        ...(revisar ? { revisar } : {}),
      };
    });
}

// ── Armar y reconfigurar ─────────────────────────────────────────────────────

/**
 * Las gobernantes escritas a mano, para una obra sin nodo de apoyos (sin
 * SAP2000, o con otro programa): los mismos nombres que publicaría ese nodo
 * —magnitud, criterio, tipo y conjunto—, en cero y marcados para revisar. Se
 * definen todos los que una plantilla puede pedir; los que no nombre, sobran.
 */
export function hojaDeGobernantes(
  p: Parametros,
  id: string,
  externas: Plantilla['externas'] = [],
  yaDefinidos: ReadonlySet<string> = new Set(),
): NodoCalculo {
  const bloques: Region[] = [];
  const poner = (kind: 'text' | 'math', src: string) =>
    bloques.push({ id: `${id}:${bloques.length + 1}`, kind, x: 40, y: 40 + bloques.length * 48, src });
  poner('text', `# Solicitaciones de ${p.grupoSap}`);
  poner(
    'text',
    'Las gobernantes del tipo, escritas a mano: N positiva es compresión. Criterios: c compresión, t tracción, v corte, ' +
      'm momento y e excentricidad; V y M son los que acompañan a la combinación que gobierna.',
  );
  for (const [conjunto, titulo] of [
    [p.diseno, 'diseño'],
    [p.sobrerresistencia, 'sobrerresistencia'],
  ]) {
    poner('text', `## Conjunto de ${titulo} (${conjunto})`);
    for (const c of ['c', 't', 'v', 'm', 'e']) {
      poner('math', `N_${c}_${p.tipo}_${conjunto} := 0 kN`);
      poner('math', `V_${c}_${p.tipo}_${conjunto} := 0 kN`);
      poner('math', `M_${c}_${p.tipo}_${conjunto} := 0 kN*m`);
    }
  }
  const faltan = externas.filter((e) => !yaDefinidos.has(e.nombre));
  if (faltan.length) {
    poner('text', '## Otras solicitaciones que la base usa');
    for (const e of faltan) {
      poner('text', `${e.texto}.`);
      poner('math', `${e.nombre} := 0 ${e.unidad}`);
    }
  }
  return {
    id,
    nombre: `Solicitaciones ${p.grupoSap}`,
    hoja: bloques,
    revisar: { nota: `Escribir las solicitaciones gobernantes de ${p.grupoSap}: están en cero.`, por: 'asistente' },
  };
}

export interface ResultadoArmar {
  obra: Obra;
  /** El id del nodo de la vista, que lleva el ensamble. */
  idVista: string;
}

/**
 * Agrega a la obra el grupo entero de una plantilla, en un grupo nuevo. Falla
 * —con el motivo, sin tocar la obra— si alguno de sus nombres ya está definido:
 * suele ser otra base del mismo tipo.
 */
export function armarEnsamble(
  obra: Obra,
  p: Plantilla,
  config: Config,
  params: Parametros,
  sellos: Readonly<Record<string, string>>,
  grupo: { nombre: string; color: string },
  nuevoId: (prefijo: string) => string,
  /** Sin nodo de apoyos: agrega la hoja de las gobernantes, para escribirlas a mano. */
  aMano = false,
): ResultadoArmar | { error: string } {
  config = normalizada(p, config);
  const propios = nombresPropios(p);
  const tr = (s: string) => traducir(s, propios, params);
  const ya = nombresDefinidos(obra);
  const choques = [...propios].map(tr).filter((n) => ya.has(n));
  if (choques.length) {
    return { error: `La obra ya define ${choques.slice(0, 4).join(', ')}${choques.length > 4 ? '…' : ''}: ¿hay otra base del tipo ${params.tipo}?` };
  }
  const manual = aMano ? hojaDeGobernantes(params, nuevoId('k'), p.externas, ya) : undefined;
  if (manual) {
    const repetidas = definicionesDe(manual.hoja).filter((n) => ya.has(n));
    if (repetidas.length) return { error: `La obra ya define ${repetidas[0]}: las solicitaciones de ${params.tipo} ya existen, arma la base sin escribirlas a mano.` };
  }
  const ids = Object.fromEntries([...new Set(p.nodos.map((n) => n.clave))].map((clave) => [clave, nuevoId('k')]));
  const idGrupo = nuevoId('g');
  const nodos = [...(manual ? [manual] : []), ...instanciar(p, config, params, ids, sellos)].map((k) => ({ ...k, grupo: idGrupo }));
  const idVista = vistaDe(p, ids);
  const conEnsamble = nodos.map((k) => (k.id === idVista ? conNodos(k, params, ids, config, p, huellaDePlantilla(p)) : k));
  return {
    obra: {
      ...obra,
      grupos: [...(obra.grupos ?? []), { id: idGrupo, nombre: grupo.nombre, color: grupo.color }],
      calculos: [...obra.calculos, ...conEnsamble],
    },
    idVista,
  };
}

/**
 * La configuración como la entiende la vista de la plantilla (`configCompleta`):
 * lo que falta con su valor por defecto y lo que `soloSi` apaga, en `'no'`. Una
 * vista guardada antes de que existiera una opción no la tiene, y sin esto sus
 * condiciones (`placa=momento`) no se cumplirían.
 */
function normalizada(p: Plantilla, config: Config): Config {
  const id = p.nodos.find((n) => n.frontera?.procedencia === 'vista')?.frontera?.id;
  const def = id ? VISTAS[id] : undefined;
  return def ? { ...config, ...configCompleta(def, config) } : config;
}

function vistaDe(p: Plantilla, ids: Readonly<Record<string, string>>): string {
  const n = p.nodos.find((x) => x.frontera?.procedencia === 'vista');
  if (!n) throw new Error('La plantilla no tiene vista.');
  return ids[n.clave];
}

/**
 * Guarda en la vista con qué se armó, los ids de los nodos que existen y la
 * versión de la plantilla. Reconfigurar no la cambia: cambiar una opción no trae
 * lo demás que la plantilla de hoy tenga de nuevo.
 */
function conNodos(
  k: NodoCalculo,
  params: Parametros,
  ids: Readonly<Record<string, string>>,
  config: Config,
  p: Plantilla,
  huella: string | undefined,
): NodoCalculo {
  const presentes = Object.fromEntries(p.nodos.filter((n) => cumple(n.si, config)).map((n) => [n.clave, ids[n.clave]]));
  const { tipo, grupoSap, diseno, sobrerresistencia } = params;
  return {
    ...k,
    frontera: {
      ...k.frontera!,
      ensamble: { tipo, grupoSap, diseno, sobrerresistencia, nodos: presentes, ...(huella ? { plantilla: huella } : {}) },
    },
  };
}

export interface ResultadoReconfigurar {
  obra: Obra;
  /** Los nodos que se quitaron, por nombre, para avisar. */
  quitados: string[];
}

/**
 * Cambia la configuración de un ensamble ya armado. Se calcula la plantilla con
 * la configuración vieja y con la nueva, y lo que cambia entre las dos se aplica
 * sobre lo que hay: nodos que aparecen o desaparecen, bloques de las secciones
 * que dependen de la opción, y ataduras y valores de las capas. Lo que el
 * ingeniero editó fuera de eso se conserva.
 */
export function reconfigurar(
  obra: Obra,
  p: Plantilla,
  idVista: string,
  configNueva: Config,
  sellos: Readonly<Record<string, string>>,
  nuevoId: (prefijo: string) => string,
): ResultadoReconfigurar | { error: string } {
  const vista = obra.calculos.find((k) => k.id === idVista);
  const ens = vista?.frontera?.ensamble;
  if (!vista?.frontera || !ens) return { error: 'La vista no tiene un ensamble que reconfigurar.' };
  const configVieja = normalizada(p, vista.frontera.config ?? {});
  configNueva = normalizada(p, configNueva);
  const ids: Record<string, string> = { ...ens.nodos };
  for (const n of p.nodos) ids[n.clave] ??= nuevoId('k');
  const { obra: resultado, quitados } = aplicarCambio(
    obra,
    instanciar(p, configVieja, ens, ids, sellos),
    instanciar(p, configNueva, ens, ids, sellos),
    vista.grupo,
  );
  return {
    obra: { ...resultado, calculos: resultado.calculos.map((k) => (k.id === idVista ? conNodos(k, ens, ids, configNueva, p, ens.plantilla) : k)) },
    quitados,
  };
}

export interface ResultadoActualizar extends ResultadoReconfigurar {
  /** Bloques que la plantilla cambió y el ingeniero también: se quedan como están. */
  conservados: string[];
}

/**
 * Lleva una base ya armada de una versión de la plantilla a otra, con la misma
 * configuración: es `reconfigurar` con las dos plantillas en vez de las dos
 * configuraciones. Un bloque que la plantilla cambió se reemplaza solo si el
 * ingeniero no lo tocó; si lo tocó, se conserva y se dice. Las genéricas quedan
 * selladas con `sellos`: actualizar es haber revisado el resultado.
 */
export function actualizarPlantilla(
  obra: Obra,
  antes: Plantilla,
  despues: Plantilla,
  idVista: string,
  sellos: Readonly<Record<string, string>>,
  nuevoId: (prefijo: string) => string,
): ResultadoActualizar | { error: string } {
  const vista = obra.calculos.find((k) => k.id === idVista);
  const ens = vista?.frontera?.ensamble;
  if (!vista?.frontera || !ens) return { error: 'La vista no tiene un ensamble que actualizar.' };
  const config = vista.frontera.config ?? {};
  const ids: Record<string, string> = { ...ens.nodos };
  for (const n of despues.nodos) ids[n.clave] ??= nuevoId('k');
  const conservados: string[] = [];
  const { obra: resultado, quitados } = aplicarCambio(
    obra,
    instanciar(antes, normalizada(antes, config), ens, ids, sellos),
    instanciar(despues, normalizada(despues, config), ens, ids, sellos),
    vista.grupo,
    { conservados, sellar: true },
  );
  const configNueva = normalizada(despues, config);
  return {
    obra: {
      ...resultado,
      calculos: resultado.calculos.map((k) => (k.id === idVista ? conNodos(k, ens, ids, configNueva, despues, huellaDePlantilla(despues)) : k)),
    },
    quitados,
    conservados,
  };
}

/** La vista de un ensamble y su definición, o por qué no la hay. */
function vistaDeEnsamble(obra: Obra, idVista: string) {
  const vista = obra.calculos.find((k) => k.id === idVista);
  const f = vista?.frontera;
  const def = f?.vista ? VISTAS[f.vista] : undefined;
  return f?.ensamble && def?.plantilla ? { ensamble: f.ensamble, def, plantilla: def.plantilla } : undefined;
}

/**
 * Con qué versión de la plantilla está armada una base: la congelada con su huella,
 * o —si es anterior a las versiones— la primera. `undefined` si su huella no está
 * entre las congeladas (una plantilla que nunca se congeló).
 */
export function versionDeBase(obra: Obra, idVista: string): VersionPlantilla | undefined {
  const v = vistaDeEnsamble(obra, idVista);
  const versiones = v?.def.versiones ?? [];
  if (!v) return undefined;
  return v.ensamble.plantilla ? versiones.find((x) => x.version === v.ensamble.plantilla) : versiones[0];
}

export interface EstadoPlantilla {
  /** La huella con que se armó, si la guarda. */
  armada?: string;
  /** La de la plantilla de hoy. */
  hoy: string;
  /** Si hay con qué actualizar: la versión de la base está congelada y no es la de hoy. */
  actualizable: boolean;
  /** Lo que le falta respecto de la de hoy (`desfaseDePlantilla`). */
  desfase: string[];
}

/** Dónde está una base respecto de su plantilla, para la ficha de la vista y el invariante. */
export function estadoDePlantilla(obra: Obra, idVista: string): EstadoPlantilla | undefined {
  const v = vistaDeEnsamble(obra, idVista);
  if (!v) return undefined;
  const hoy = huellaDePlantilla(v.plantilla);
  const base = versionDeBase(obra, idVista);
  const desfase = desfaseDePlantilla(obra, v.plantilla, idVista);
  return {
    ...(v.ensamble.plantilla ? { armada: v.ensamble.plantilla } : {}),
    hoy,
    actualizable: !!base && (base.version !== hoy || desfase.length > 0),
    desfase,
  };
}

/**
 * `actualizarPlantilla` desde la versión con que se armó la base hasta la de hoy,
 * sin sacar nada de git: es lo que corre el botón de la ficha de la vista.
 */
export function actualizarBase(
  obra: Obra,
  idVista: string,
  sellos: Readonly<Record<string, string>>,
  nuevoId: (prefijo: string) => string,
): ResultadoActualizar | { error: string } {
  const v = vistaDeEnsamble(obra, idVista);
  if (!v) return { error: 'La vista no tiene un ensamble que actualizar.' };
  const base = versionDeBase(obra, idVista);
  if (!base) return { error: `La base se armó con la plantilla ${v.ensamble.plantilla}, que no está congelada: no hay con qué comparar.` };
  return actualizarPlantilla(obra, base.plantilla, v.plantilla, idVista, sellos, nuevoId);
}

/**
 * Lo que la plantilla de hoy trae y la base armada no tiene, o al revés: nodos,
 * campos de la frontera (fijados o atados, da igual cuál), lo que publica y bloques
 * de hoja. Es la señal de que la base quedó atrás de su plantilla y hay que
 * actualizarla. No compara valores ni fórmulas: esos los edita el ingeniero.
 */
export function desfaseDePlantilla(obra: Obra, p: Plantilla, idVista: string): string[] {
  const vista = obra.calculos.find((k) => k.id === idVista);
  const ens = vista?.frontera?.ensamble;
  if (!vista?.frontera || !ens) return [];
  const esperados = instanciar(p, normalizada(p, vista.frontera.config ?? {}), ens, { ...ens.nodos }, {});
  const salida: string[] = [];
  const lista = (xs: string[]) => xs.slice(0, 4).join(', ') + (xs.length > 4 ? ` y ${xs.length - 4} más` : '');
  for (const e of esperados) {
    const actual = obra.calculos.find((k) => k.id === e.id);
    if (!actual) {
      salida.push(`falta el nodo «${e.nombre}»`);
      continue;
    }
    if (e.frontera && actual.frontera) {
      const campos = (f: typeof e.frontera) => new Set([...Object.keys(f.entradas ?? {}), ...Object.keys(f.formulas ?? {})]);
      const quiere = campos(e.frontera);
      const tiene = campos(actual.frontera);
      const faltan = [...quiere].filter((c) => !tiene.has(c));
      const sobran = [...tiene].filter((c) => !quiere.has(c));
      const sinPublicar = Object.keys(e.frontera.publica ?? {}).filter((s) => !(s in (actual.frontera!.publica ?? {})));
      if (faltan.length) salida.push(`${actual.nombre}: le faltan los campos ${lista(faltan)}`);
      if (sobran.length) salida.push(`${actual.nombre}: sobran los campos ${lista(sobran)}`);
      if (sinPublicar.length) salida.push(`${actual.nombre}: no publica ${lista(sinPublicar)}`);
    }
    // Un texto se identifica por su lugar en la sección: si la plantilla metió un
    // bloque antes, el mismo texto de una base armada antes tiene otro id. Con el
    // contenido igual está, aunque se llame distinto.
    const ids = new Set(actual.hoja.map((r) => r.id));
    const contenidos = new Set(actual.hoja.map(contenido));
    const bloques = e.hoja.filter((r) => !ids.has(r.id) && !contenidos.has(contenido(r))).map((r) => r.id.slice(e.id.length + 1));
    if (bloques.length) salida.push(`${actual.nombre}: le faltan los bloques ${lista(bloques)}`);
  }
  return salida;
}

/**
 * Lo que cambia entre dos instancias de la plantilla, aplicado sobre la obra:
 * nodos que aparecen o desaparecen, bloques y ataduras. Lo que el ingeniero editó
 * fuera de eso se conserva.
 */
function aplicarCambio(
  obra: Obra,
  instViejos: NodoCalculo[],
  nuevos: NodoCalculo[],
  grupo: string | undefined,
  opciones: { conservados?: string[]; sellar?: boolean } = {},
): ResultadoReconfigurar {
  const viejos = new Map(instViejos.map((k) => [k.id, k]));
  const idsNuevos = new Set(nuevos.map((k) => k.id));
  let resultado = obra;
  const quitados: string[] = [];
  for (const id of viejos.keys()) {
    if (idsNuevos.has(id)) continue;
    const actual = resultado.calculos.find((k) => k.id === id);
    if (actual) {
      quitados.push(actual.nombre);
      resultado = borrarCalculo(resultado, id);
    }
  }
  for (const nuevo of nuevos) {
    const viejo = viejos.get(nuevo.id);
    const actual = resultado.calculos.find((k) => k.id === nuevo.id);
    if (!viejo || !actual) {
      // Aparece: entra entero, en el grupo de la vista.
      resultado = { ...resultado, calculos: [...resultado.calculos, { ...nuevo, ...(grupo ? { grupo } : {}) }] };
      continue;
    }
    if (identidad(viejo) !== identidad(nuevo)) {
      // Otra variante de la misma pieza, respaldada por otra genérica: no hay
      // ataduras que conservar, porque los campos son otros. Se queda el id, el
      // grupo y la marca ⚑; el resto es el de la variante nueva.
      resultado = {
        ...resultado,
        calculos: resultado.calculos.map((k) =>
          k.id === nuevo.id ? { ...k, nombre: nuevo.nombre, hoja: nuevo.hoja, frontera: nuevo.frontera } : k,
        ),
      };
      quitados.push(`${actual.nombre} (cambia a ${nuevo.nombre})`);
      continue;
    }
    resultado = {
      ...resultado,
      calculos: resultado.calculos.map((k) => {
        if (k.id !== nuevo.id) return k;
        const aplicada = fronteraAplicada(k, viejo, nuevo, !!opciones.sellar);
        // Al cambiar de variante, un bloque con el mismo id conserva lo escrito (la
        // columna es del tipo, no de la variante); al cambiar de plantilla, el texto
        // nuevo de un bloque sin editar sí entra.
        const conservados = opciones.conservados ? (id: string) => opciones.conservados!.push(`${k.nombre}: ${id}`) : undefined;
        return {
          ...k,
          hoja: aplicarHoja(k.hoja, viejo.hoja, nuevo.hoja, conservados, !!opciones.sellar),
          ...aplicada,
          ...(opciones.sellar && aplicada.frontera && nuevo.frontera?.sha256 ? { frontera: { ...aplicada.frontera, sha256: nuevo.frontera.sha256 } } : {}),
        };
      }),
    };
  }
  return { obra: resultado, quitados };
}

/** El contenido de un bloque, sin su id ni su posición. */
const contenido = (r: Region) => JSON.stringify({ kind: r.kind, src: r.src, tabla: r.tabla, imprimir: r.imprimir });

/** Qué respalda un nodo: una hoja libre, una genérica por su slug o una vista por su id. */
function identidad(k: NodoCalculo): string {
  const f = k.frontera;
  return !f ? 'hoja' : `${f.procedencia}:${f.slug ?? f.vista ?? ''}`;
}

/**
 * Los bloques que la plantilla vieja tenía y la nueva no, fuera; los que la nueva
 * tiene y la vieja no, dentro, detrás del bloque que los precede en la nueva. Con
 * `conservado`, un bloque que está en las dos con distinto contenido toma el nuevo
 * si nadie lo editó; si se editó, se queda y se avisa. Sin él, se queda siempre.
 */
function aplicarHoja(
  actual: Region[],
  viejaCruda: Region[],
  nueva: Region[],
  conservado?: (id: string) => void,
  /** Al actualizar: entra también lo de la nueva que la base no tiene ni por id ni por contenido. */
  reponer = false,
): Region[] {
  [actual, viejaCruda] = reidentificar(actual, viejaCruda, nueva);
  const vieja = viejaCruda;
  const enNueva = new Map(nueva.map((r) => [r.id, r]));
  const enVieja = new Map(vieja.map((r) => [r.id, r]));
  let hoja = actual
    .filter((r) => {
      const v = enVieja.get(r.id);
      if (!v || enNueva.has(r.id)) return true;
      // Sale de la plantilla. Al cambiar de plantilla, uno que el ingeniero editó se
      // queda y se avisa: borrarlo perdería su trabajo sin decirlo.
      if (conservado && contenido(r) !== contenido(v)) {
        conservado(r.id);
        return true;
      }
      return false;
    })
    .map((r) => {
      const v = enVieja.get(r.id);
      const n = enNueva.get(r.id);
      if (!conservado || !v || !n || contenido(v) === contenido(n)) return r;
      if (contenido(r) !== contenido(v)) {
        conservado?.(r.id);
        return r;
      }
      const { id, x, y } = r;
      return { ...n, id, x, y };
    });
  const contenidos = new Set(hoja.map(contenido));
  nueva.forEach((r, i) => {
    if (hoja.some((x) => x.id === r.id)) return;
    // Lo que ya estaba en la vieja se respeta si la base no lo tiene (lo quitó el
    // ingeniero)… salvo al actualizar, que es pedir la plantilla de hoy entera: la
    // tabla de la propuesta lo muestra como nuevo, y rechazarla lo deja fuera.
    if (enVieja.has(r.id) && (!reponer || contenidos.has(contenido(r)))) return;
    let despues = -1;
    for (let j = i - 1; j >= 0 && despues < 0; j--) despues = hoja.findIndex((x) => x.id === nueva[j].id);
    hoja = [...hoja.slice(0, despues + 1), r, ...hoja.slice(despues + 1)];
  });
  // Las posiciones siguen el orden: la hoja todavía lee (y, x).
  return hoja.map((r, i) => ({ ...r, x: 40, y: 40 + i * 48 }));
}

/**
 * Los ids se alinean por contenido antes de comparar, en dos pasos:
 *
 *   - un bloque de la base cuyo id no es el de la plantilla vieja, pero cuyo
 *     contenido sí es el de uno de ella (una base armada cuando los textos se
 *     identificaban solo por su lugar), toma el id de ese;
 *   - un bloque que entre la vieja y la nueva cambió de id con el mismo contenido
 *     (uno agregado sin `id` delante lo corrió) se renombra en la base y en la
 *     vieja al id nuevo. Sin esto, el texto editado quedaba bajo el id que en la
 *     nueva es otro bloque, ese bloque no entraba y el texto se duplicaba.
 */
function reidentificar(actual: Region[], vieja: Region[], nueva: Region[]): [Region[], Region[]] {
  const seccion = (id: string) => id.slice(0, id.lastIndexOf(':'));
  const enVieja = new Map(vieja.map((r) => [r.id, r]));
  // El contenido manda sobre el id: en una base armada antes, el id de un texto
  // puede estar ocupado por el bloque que antes iba en ese lugar. Primero se fijan
  // los que coinciden en las dos cosas; después, cada uno sin editar busca el
  // bloque de la vieja con su contenido, en su sección.
  const tomados = new Set<string>();
  const fijos = new Set<string>();
  for (const r of actual) {
    const v = enVieja.get(r.id);
    if (v && contenido(v) === contenido(r)) {
      tomados.add(v.id);
      fijos.add(r.id);
    }
  }
  const alVieja = new Map<string, string>();
  for (const r of actual) {
    if (fijos.has(r.id)) continue;
    const c = contenido(r);
    const v = vieja.find((x) => !tomados.has(x.id) && seccion(x.id) === seccion(r.id) && contenido(x) === c);
    if (!v) continue;
    tomados.add(v.id);
    alVieja.set(r.id, v.id);
  }
  if (alVieja.size) {
    // Un bloque editado que se queda con un id que ahora es de otro sale aparte.
    const destinos = new Set(alVieja.values());
    actual = actual.map((r) => (alVieja.has(r.id) ? { ...r, id: alVieja.get(r.id)! } : destinos.has(r.id) ? { ...r, id: `${r.id}~` } : r));
  }

  const corrido = new Map<string, string>();
  for (const v of vieja) {
    const c = contenido(v);
    const mismo = nueva.find((x) => x.id === v.id);
    if (mismo && contenido(mismo) === c) continue;
    const previo = (id: string) => enVieja.get(id);
    const n = nueva.find(
      (x) => x.id !== v.id && seccion(x.id) === seccion(v.id) && contenido(x) === c && (!previo(x.id) || contenido(previo(x.id)!) !== c),
    );
    if (n && ![...corrido.values()].includes(n.id)) corrido.set(v.id, n.id);
  }
  if (!corrido.size) return [actual, vieja];
  const renombrar = (r: Region) => (corrido.has(r.id) ? { ...r, id: corrido.get(r.id)! } : r);
  // Lo que ocupaba el id de destino y no se corrió a su vez sale con otro, para no chocar.
  const destinos = new Set(corrido.values());
  const aparte = (r: Region) => (destinos.has(r.id) && !corrido.has(r.id) ? { ...r, id: `${r.id}~` } : r);
  return [actual.map((r) => renombrar(aparte(r))), vieja.map((r) => renombrar(aparte(r)))];
}

/** Las entradas, fórmulas, lo publicado y la configuración que cambian entre la plantilla vieja y la nueva. */
function fronteraAplicada(actual: NodoCalculo, viejo: NodoCalculo, nuevo: NodoCalculo, reponer = false): Partial<NodoCalculo> {
  const f = actual.frontera;
  if (!f || !viejo.frontera || !nuevo.frontera) return {};
  const delta = <T,>(act: Record<string, T> = {}, v: Record<string, T> = {}, n: Record<string, T> = {}) => {
    const out = { ...act };
    for (const k of new Set([...Object.keys(v), ...Object.keys(n)])) {
      if (v[k] === n[k]) continue;
      if (k in n) out[k] = n[k];
      else delete out[k];
    }
    return out;
  };
  const entradas = delta(f.entradas, viejo.frontera.entradas, nuevo.frontera.entradas);
  const formulas = delta(f.formulas, viejo.frontera.formulas, nuevo.frontera.formulas);
  const publica = delta(f.publica, viejo.frontera.publica, nuevo.frontera.publica);
  if (reponer) {
    // Al actualizar, un campo que la plantilla de hoy tiene y la base no (ni fijado ni
    // atado) entra como lo trae la plantilla; lo mismo lo que publica.
    const tiene = (c: string) => c in entradas || c in formulas;
    for (const [c, v] of Object.entries(nuevo.frontera.formulas ?? {})) if (!tiene(c)) formulas[c] = v;
    for (const [c, v] of Object.entries(nuevo.frontera.entradas ?? {})) if (!tiene(c)) entradas[c] = v;
    for (const [s, alias] of Object.entries(nuevo.frontera.publica ?? {})) if (!(s in publica)) publica[s] = alias;
  }
  return {
    frontera: {
      ...f,
      entradas,
      formulas,
      publica,
      ...(nuevo.frontera.config ? { config: nuevo.frontera.config } : {}),
    },
  };
}
