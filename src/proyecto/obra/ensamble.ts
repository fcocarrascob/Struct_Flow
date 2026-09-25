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
  | { kind: 'text' | 'math'; src: string; si?: Condicion }
  | { kind: 'table'; src: string; tabla: NonNullable<Region['tabla']>; si?: Condicion };

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
  const problemas: string[] = [];
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

function bloquesDe(n: NodoPlantilla, config: Config | null): { clave: string; bloque: BloquePlantilla }[] {
  const salida: { clave: string; bloque: BloquePlantilla }[] = [];
  for (const s of n.hoja ?? []) {
    if (config && !cumple(s.si, config)) continue;
    s.bloques.forEach((b, i) => {
      // El índice cuenta los bloques condicionados aunque no estén: el de los
      // demás no cambia con la configuración.
      if (config && !cumple(b.si, config)) return;
      // Una definición se identifica por su nombre: sobrevive a que la plantilla
      // agregue o mueva bloques de su sección.
      const def = b.kind === 'math' ? /^\s*([\p{L}_][\p{L}\p{N}_]*)\s*:=/u.exec(b.src)?.[1] : undefined;
      salida.push({ clave: `${s.clave}:${def ?? i + 1}`, bloque: b });
    });
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
  const conEnsamble = nodos.map((k) => (k.id === idVista ? conNodos(k, params, ids, config, p) : k));
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

/** Guarda en la vista con qué se armó y los ids de los nodos que existen. */
function conNodos(k: NodoCalculo, params: Parametros, ids: Readonly<Record<string, string>>, config: Config, p: Plantilla): NodoCalculo {
  const presentes = Object.fromEntries(p.nodos.filter((n) => cumple(n.si, config)).map((n) => [n.clave, ids[n.clave]]));
  return { ...k, frontera: { ...k.frontera!, ensamble: { ...params, nodos: presentes } } };
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
  const viejos = new Map(instanciar(p, configVieja, ens, ids, sellos).map((k) => [k.id, k]));
  const nuevos = instanciar(p, configNueva, ens, ids, sellos);
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
  const grupo = vista.grupo;
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
      calculos: resultado.calculos.map((k) =>
        k.id === nuevo.id ? { ...k, hoja: aplicarHoja(k.hoja, viejo.hoja, nuevo.hoja), ...fronteraAplicada(k, viejo, nuevo) } : k,
      ),
    };
  }
  resultado = {
    ...resultado,
    calculos: resultado.calculos.map((k) => (k.id === idVista ? conNodos(k, ens, ids, configNueva, p) : k)),
  };
  return { obra: resultado, quitados };
}

/** Qué respalda un nodo: una hoja libre, una genérica por su slug o una vista por su id. */
function identidad(k: NodoCalculo): string {
  const f = k.frontera;
  return !f ? 'hoja' : `${f.procedencia}:${f.slug ?? f.vista ?? ''}`;
}

/**
 * Los bloques que la plantilla vieja tenía y la nueva no, fuera; los que la nueva
 * tiene y la vieja no, dentro, detrás del bloque que los precede en la nueva.
 */
function aplicarHoja(actual: Region[], vieja: Region[], nueva: Region[]): Region[] {
  const enNueva = new Set(nueva.map((r) => r.id));
  const enVieja = new Set(vieja.map((r) => r.id));
  let hoja = actual.filter((r) => !(enVieja.has(r.id) && !enNueva.has(r.id)));
  nueva.forEach((r, i) => {
    if (enVieja.has(r.id) || hoja.some((x) => x.id === r.id)) return;
    let despues = -1;
    for (let j = i - 1; j >= 0 && despues < 0; j--) despues = hoja.findIndex((x) => x.id === nueva[j].id);
    hoja = [...hoja.slice(0, despues + 1), r, ...hoja.slice(despues + 1)];
  });
  // Las posiciones siguen el orden: la hoja todavía lee (y, x).
  return hoja.map((r, i) => ({ ...r, x: 40, y: 40 + i * 48 }));
}

/** Las entradas, fórmulas y configuración que cambian entre la plantilla vieja y la nueva. */
function fronteraAplicada(actual: NodoCalculo, viejo: NodoCalculo, nuevo: NodoCalculo): Partial<NodoCalculo> {
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
  return {
    frontera: {
      ...f,
      entradas: delta(f.entradas, viejo.frontera.entradas, nuevo.frontera.entradas),
      formulas: delta(f.formulas, viejo.frontera.formulas, nuevo.frontera.formulas),
      ...(nuevo.frontera.config ? { config: nuevo.frontera.config } : {}),
    },
  };
}
