// ─────────────────────────────────────────────────────────────────────────────
// Las obras en `localStorage`, y el saneo de toda obra que se lee.
//
// Con el servidor local, una obra vive en disco (`almacen-disco.ts`,
// `carpeta.ts`) y esto queda para las que no: sin servidor, o creadas antes de
// que lo hubiera. `sanearObra` es de las dos: se lee de donde se lea, una obra
// entra por aquí.
//
// UNA DIFERENCIA CON `../layout.ts` QUE IMPORTA
// --------------------------------------------
// Aquel guarda posiciones, que son una comodidad: si el almacenamiento está
// bloqueado se sigue trabajando y no pasa nada, y por eso su `catch` es mudo.
// Aquí el almacenamiento ES el dato. Un `catch` mudo se lleva el trabajo del
// usuario sin decir una palabra, así que `guardarObra` devuelve un resultado y
// quien lo llama tiene que mostrarlo.
//
// Todo el archivo entra y sale por `leerTodo`/`escribirTodo`: una obra no se
// escribe sola sino dentro del conjunto, que es como está guardado.
// ─────────────────────────────────────────────────────────────────────────────

import { newId } from '../../lib/hoja-json';
import type { MetaPlanilla } from '../../lib/biblioteca/contrato';
import { metaDe } from '../../lib/hoja-json';
import { migrarBloques, sanearHoja } from './hoja';
import {
  COLOR_RE,
  IDENTIFICADOR_RE,
  LARGO_NOTA_REVISION,
  problemaDeAlias,
  slugificar,
  VERSION_OBRA,
  type Carga,
  type AplicacionSap,
  type ConexionSap,
  DIRECCIONES_SAP,
  type GrupoSap,
  type Frontera,
  type LecturaPatrones,
  type PatronLeido,
  type PatronSap,
  type Grupo,
  type Modulo,
  type NodoCalculo,
  type Obra,
  type Procedencia,
  type Revision,
  type Subcarga,
} from './modelo';

export const CLAVE_OBRAS = 'structflow.obras.v1';

export type Resultado = { ok: true } | { ok: false; motivo: string };

const MODULOS: ReadonlySet<string> = new Set<Modulo>(['cargas', 'sap']);

const texto = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * El Load Pattern de una carga. Un tipo vacío no define nada y se descarta
 * entero; un peso propio ilegible queda en 0, que es lo que SAP asume.
 */
function sanearPatron(crudo: unknown): PatronSap | undefined {
  if (typeof crudo !== 'object' || crudo === null) return undefined;
  const p = crudo as Partial<PatronSap>;
  if (typeof p.tipo !== 'string' || !p.tipo) return undefined;
  const peso = typeof p.pesoPropio === 'number' && Number.isFinite(p.pesoPropio) ? p.pesoPropio : 0;
  return { tipo: p.tipo, pesoPropio: peso };
}

function sanearLectura(crudo: unknown): LecturaPatrones | undefined {
  if (typeof crudo !== 'object' || crudo === null) return undefined;
  const l = crudo as Partial<LecturaPatrones>;
  if (!Array.isArray(l.lista)) return undefined;
  const lista: PatronLeido[] = [];
  for (const x of l.lista) {
    const nombre = (x as { nombre?: unknown } | null)?.nombre;
    const patron = sanearPatron(x);
    if (typeof nombre === 'string' && nombre && patron) lista.push({ nombre, ...patron });
  }
  return { modelo: texto(l.modelo), ...(texto(l.ruta) ? { ruta: texto(l.ruta) } : {}), leido: texto(l.leido), lista };
}

function sanearGruposSap(crudo: unknown): GrupoSap[] | undefined {
  if (!Array.isArray(crudo)) return undefined;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return crudo
    .filter((g): g is Partial<GrupoSap> => typeof g === 'object' && g !== null)
    .filter((g) => typeof g.nombre === 'string' && g.nombre)
    .map((g) => ({ nombre: g.nombre as string, barras: n(g.barras), areas: n(g.areas) }));
}

/**
 * Dónde va una partida en SAP. Sin grupo o con un tipo desconocido no dice
 * nada que se pueda aplicar y se descarta; una dirección que no se reconoce
 * vuelve a gravedad, que es la de casi todas.
 */
function sanearAplicacion(crudo: unknown): { aplicacion?: AplicacionSap } {
  if (typeof crudo !== 'object' || crudo === null) return {};
  const a = crudo as Partial<AplicacionSap>;
  if (a.tipo !== 'area-a-barras' && a.tipo !== 'barra-distribuida') return {};
  if (typeof a.grupo !== 'string' || !a.grupo.trim()) return {};
  const direccion = DIRECCIONES_SAP.some((d) => d.codigo === a.direccion) ? (a.direccion as number) : 10;
  return {
    aplicacion: {
      tipo: a.tipo,
      grupo: a.grupo.trim(),
      direccion,
      ...(a.tipo === 'area-a-barras' ? { distribucion: a.distribucion === 2 ? 2 : 1 } : {}),
    },
  };
}

/** La última conexión a SAP2000. Una sin modelo no dice nada y se descarta. */
function sanearSap(crudo: unknown): { sap?: ConexionSap } {
  if (typeof crudo !== 'object' || crudo === null) return {};
  const s = crudo as Partial<ConexionSap>;
  if (typeof s.modelo !== 'string' || !s.modelo) return {};
  const patrones = sanearLectura(s.patrones);
  const gruposSap = sanearGruposSap(s.grupos);
  return {
    sap: {
      modelo: s.modelo,
      ruta: texto(s.ruta),
      version: texto(s.version),
      leido: texto(s.leido),
      ...(patrones ? { patrones } : {}),
      ...(gruposSap ? { grupos: gruposSap } : {}),
      ...(gruposSap && typeof s.gruposDe === 'string' ? { gruposDe: s.gruposDe } : {}),
    },
  };
}

/**
 * Los ids que ya se repartieron dentro de UNA obra.
 *
 * Es el `vistos` de `sanearRegiones` (`src/lib/hoja-json.ts:91`) y hace falta
 * por lo mismo: los ids de bloque son las claves de `results` en la hoja global
 * que arma `evaluacion.ts`, así que dos bloques con el mismo id comparten
 * resultado, comparten `key` de React y rompen el filtro por posición del
 * autocompletado, que busca la región activa por id y se queda con la primera.
 *
 * Antes los ids de rescate llevaban el índice **dentro de su padre**, así que
 * dos partidas sin id daban las dos `s-recuperada-0` y los bloques colisionaban
 * entre nodos a la primera. El `newId` compartido no puede repetir.
 */
type Vistos = Set<string>;

function idUnico(crudo: unknown, vistos: Vistos): string {
  const id = typeof crudo === 'string' && crudo && !vistos.has(crudo) ? crudo : newId();
  vistos.add(id);
  return id;
}

/**
 * Lo que se lee de `localStorage` es texto que escribió una versión anterior de
 * esta aplicación, no un `Obra`. Se sanea igual que `sanearRegiones` hace con
 * una hoja: lo que no cuadra se descarta en vez de reventar la pantalla.
 */
/**
 * La hoja de un nodo, venga como venga guardada.
 *
 * MIGRACIÓN. Hasta la versión 1 un nodo guardaba `bloques`: una lista sin `x` ni
 * `y`, cuyo ORDEN era el orden de lectura. `migrarBloques` les sintetiza
 * coordenadas **antes** de validar nada, y ese orden importa: `esRegion` exige
 * `x` e `y` finitos, así que validar primero descartaría las regiones de cada
 * nodo y la obra abriría VACÍA, sin avisar de nada.
 */
function sanearHojaDeNodo(crudo: { hoja?: unknown; bloques?: unknown }, vistos: Vistos) {
  const lista = Array.isArray(crudo.hoja) ? crudo.hoja : migrarBloques(crudo.bloques);
  return sanearHoja(lista, vistos, newId);
}

const PROCEDENCIAS: ReadonlySet<string> = new Set<Procedencia>([
  'biblioteca',
  'propia',
  'derivada',
]);

/** 64 hex, o nada. Un sello ilegible se trata como «sin sello»: no se avisa de
 *  un desfase que no se puede comprobar. */
const sello = (v: unknown): string | undefined =>
  typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v : undefined;

/**
 * La frontera de un nodo.
 *
 * MIGRACIÓN. Lo guardado hasta la versión 1 era una `importada`: sin
 * `procedencia`, pero con slug y sello, que es exactamente una referencia a la
 * biblioteca. Una sin `slug` sí se descarta entera: no hay nada que descargar, y
 * el nodo vuelve a ser una hoja libre con las regiones que sí están guardadas.
 */
function sanearFrontera(crudo: unknown): Frontera | undefined {
  if (typeof crudo !== 'object' || crudo === null) return undefined;
  const i = crudo as Partial<Frontera>;
  const procedencia: Procedencia =
    typeof i.procedencia === 'string' && PROCEDENCIAS.has(i.procedencia)
      ? i.procedencia
      : 'biblioteca';
  const slug = typeof i.slug === 'string' && i.slug ? i.slug : undefined;
  if (procedencia === 'biblioteca' && !slug) return undefined;

  const entradas: Record<string, number> = {};
  if (typeof i.entradas === 'object' && i.entradas !== null) {
    for (const [k, v] of Object.entries(i.entradas)) {
      if (typeof v === 'number' && Number.isFinite(v)) entradas[k] = v;
    }
  }
  const formulas: Record<string, string> = {};
  if (typeof i.formulas === 'object' && i.formulas !== null) {
    for (const [k, v] of Object.entries(i.formulas)) {
      if (typeof v === 'string') formulas[k] = v;
    }
  }
  // Un alias que no es un nombre de variable no se puede escribir en ninguna
  // fórmula, así que publicarlo sería ofrecer algo inalcanzable. `problemaDeAlias`
  // decide, que es la misma autoridad que usa el selector.
  const publica: Record<string, string> = {};
  if (typeof i.publica === 'object' && i.publica !== null) {
    for (const [k, v] of Object.entries(i.publica)) {
      if (typeof v === 'string' && !problemaDeAlias(v)) publica[k] = v.trim();
    }
  }

  const org = i.origen;
  const origen =
    procedencia === 'derivada' &&
    typeof org === 'object' &&
    org !== null &&
    typeof org.slug === 'string' &&
    sello(org.sha256)
      ? {
          slug: org.slug,
          sha256: org.sha256,
          ...(Array.isArray(org.desvios) && org.desvios.some((d) => typeof d === 'string')
            ? { desvios: org.desvios.filter((d): d is string => typeof d === 'string') }
            : {}),
        }
      : undefined;

  return {
    procedencia,
    // El sello es de la instancia, así que solo tiene sentido en `biblioteca`;
    // una derivada ya no es una instancia de nada y lo lleva en `origen`.
    ...(procedencia === 'biblioteca' && slug ? { slug, sha256: sello(i.sha256) ?? '' } : {}),
    ...(origen ? { origen } : {}),
    ...(procedencia === 'biblioteca' ? { entradas } : {}),
    ...(Object.keys(formulas).length ? { formulas } : {}),
    ...(Object.keys(publica).length ? { publica } : {}),
    ...(typeof i.salida === 'string' && i.salida ? { salida: i.salida } : {}),
  };
}

/**
 * El `meta` de la hoja de un nodo, con el mismo criterio que el del canvas.
 *
 * `metaDe` recibe la HOJA y mira su `.meta`; aquí lo que llega ya es el `meta`,
 * así que se envuelve. Pasárselo directo lo buscaba en `meta.meta`, y el `meta`
 * de cada nodo se perdía en silencio en cada relectura.
 */
function sanearMeta(crudo: unknown): MetaPlanilla | undefined {
  return metaDe({ meta: crudo }) ?? undefined;
}

/**
 * La marca de revisión. Una nota que no es texto queda vacía —la marca sigue: un
 * «revisar» sin razón legible también es algo que alguien tiene que mirar—, y
 * una larga se corta, porque es una línea y no un informe. Quien no se reconoce
 * es el usuario: marcar de asistente algo que no lo dice sería inventar un
 * origen.
 */
function sanearRevision(crudo: unknown): { revisar?: Revision } {
  if (typeof crudo !== 'object' || crudo === null) return {};
  const r = crudo as Partial<Revision>;
  const nota = typeof r.nota === 'string' ? r.nota.trim().slice(0, LARGO_NOTA_REVISION) : '';
  return { revisar: { nota, por: r.por === 'asistente' ? 'asistente' : 'usuario' } };
}

function sanearSubcarga(crudo: unknown, vistos: Vistos): Subcarga | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const s = crudo as Partial<Subcarga> & { bloques?: unknown; importada?: unknown };
  if (typeof s.nombre !== 'string') return null;
  const frontera = sanearFrontera(s.frontera ?? s.importada);
  const meta = sanearMeta(s.meta);
  // MIGRACIÓN. Hasta la versión 1 el nombre de la partida ERA su variable. Una
  // obra guardada entonces no trae `variable`, y adoptar el nombre viejo es lo
  // único que conserva su valor: sin esto, todas sus partidas abrirían en rojo
  // pidiendo que se elija una variable que ya estaba elegida.
  const variable =
    typeof s.variable === 'string' && s.variable
      ? s.variable
      : IDENTIFICADOR_RE.test(s.nombre.trim())
        ? s.nombre.trim()
        : undefined;
  return {
    id: idUnico(s.id, vistos),
    nombre: s.nombre,
    hoja: sanearHojaDeNodo(s, vistos),
    ...(meta ? { meta } : {}),
    ...(variable ? { variable } : {}),
    ...(frontera ? { frontera } : {}),
    ...sanearRevision(s.revisar),
    ...sanearAplicacion(s.aplicacion),
  };
}

/**
 * Los grupos de la obra. Uno sin color legible se descarta entero, en vez de
 * inventarle uno: un color distinto del que se eligió es un dato equivocado, y
 * sus miembros quedan sin grupo, que se ve y se corrige.
 */
function sanearGrupos(crudo: unknown): Grupo[] {
  const vistos = new Set<string>();
  const grupos: Grupo[] = [];
  for (const g of Array.isArray(crudo) ? crudo : []) {
    if (typeof g !== 'object' || g === null) continue;
    const { id, nombre, color } = g as Partial<Grupo>;
    if (typeof id !== 'string' || !id || vistos.has(id)) continue;
    if (typeof color !== 'string' || !COLOR_RE.test(color)) continue;
    vistos.add(id);
    grupos.push({ id, nombre: typeof nombre === 'string' ? nombre : 'Grupo', color });
  }
  return grupos;
}

/** El `grupo` de un nodo, solo si apunta a uno que existe. */
function grupoDe(crudo: unknown, grupos: ReadonlySet<string>): { grupo?: string } {
  return typeof crudo === 'string' && grupos.has(crudo) ? { grupo: crudo } : {};
}

function sanearCalculo(crudo: unknown, vistos: Vistos, grupos: ReadonlySet<string>): NodoCalculo | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const k = crudo as Partial<NodoCalculo> & { bloques?: unknown; importada?: unknown };
  const frontera = sanearFrontera(k.frontera ?? k.importada);
  const meta = sanearMeta(k.meta);
  return {
    id: idUnico(k.id, vistos),
    nombre: typeof k.nombre === 'string' ? k.nombre : 'Cálculo',
    hoja: sanearHojaDeNodo(k, vistos),
    ...(meta ? { meta } : {}),
    ...(frontera ? { frontera } : {}),
    ...grupoDe(k.grupo, grupos),
    ...sanearRevision(k.revisar),
  };
}

function sanearCarga(crudo: unknown, vistos: Vistos, grupos: ReadonlySet<string>): Carga | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const c = crudo as Partial<Carga>;
  if (typeof c.nombre !== 'string') return null;
  const patron = sanearPatron(c.patron);
  return {
    id: idUnico(c.id, vistos),
    nombre: c.nombre,
    ...grupoDe(c.grupo, grupos),
    ...(patron ? { patron } : {}),
    // El `tipo` de una obra guardada con el catálogo cerrado se ignora: la carga
    // ya no lo tiene, y el nombre —que es lo que la identifica— no dependía de él.
    // Una obra guardada antes del desglose no trae `subcargas`; no es un dato
    // corrupto, es una obra anterior, y abre sin desglose y sin avisos.
    subcargas: (Array.isArray(c.subcargas) ? c.subcargas : [])
      .map((s) => sanearSubcarga(s, vistos))
      .filter((s): s is Subcarga => s !== null),
  };
}

/**
 * El id con el que una obra guardada se identifica y se enlaza.
 *
 * Viaja en la URL (`/obra/<id>`), así que tiene que pasar el alfabeto cerrado de
 * `SLUG_PROYECTO_RE` (`src/lib/ruta.ts`): uno que no lo pase deja una obra que
 * está guardada y es **inalcanzable**, porque `parsearRuta` rechaza la ruta y
 * cae en el menú sin decir nada. Se slugifica en vez de descartar la obra.
 *
 * Es una función aparte porque la usan el saneo y `guardarObra`, que tiene que
 * encontrar la misma entrada en el archivo crudo.
 */
export function idDeObra(crudo: unknown): string | null {
  const id = (crudo as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || !id) return null;
  return /^[a-z0-9][a-z0-9-]*$/.test(id) ? id : slugificar(id) || null;
}

export function sanearObra(crudo: unknown): Obra | null {
  const id = idDeObra(crudo);
  if (id === null) return null;
  const o = crudo as Partial<Obra>;
  // Un solo juego de ids por obra: cargas, partidas, cálculos y bloques
  // comparten espacio porque todos acaban siendo claves de `results`.
  const vistos: Vistos = new Set();
  // Los grupos van primero: los miembros solo conservan un `grupo` que exista.
  const grupos = sanearGrupos(o.grupos);
  const idsGrupo = new Set(grupos.map((g) => g.id));
  return {
    version: VERSION_OBRA,
    id,
    nombre: typeof o.nombre === 'string' ? o.nombre : id,
    creada: typeof o.creada === 'string' ? o.creada : new Date(0).toISOString(),
    modulos: (Array.isArray(o.modulos) ? o.modulos : []).filter((m): m is Modulo =>
      MODULOS.has(m as string),
    ),
    cargas: (Array.isArray(o.cargas) ? o.cargas : [])
      .map((c) => sanearCarga(c, vistos, idsGrupo))
      .filter((c): c is Carga => c !== null),
    calculos: (Array.isArray(o.calculos) ? o.calculos : [])
      .map((k) => sanearCalculo(k, vistos, idsGrupo))
      .filter((k): k is NodoCalculo => k !== null),
    ...(grupos.length ? { grupos } : {}),
    ...sanearSap(o.sap),
  };
}

/**
 * Las obras **tal como están escritas**, sin sanear.
 *
 * Existe para que guardar una obra no toque a las demás. `guardarObra` leía las
 * saneadas y las volvía a volcar todas, y como eso ocurre cada 300 ms mientras
 * se teclea, editar una obra le aplicaba la migración a las otras sin que nadie
 * las abriera: un bloque con `src` que no es texto desaparecía, los ids de
 * rescate se materializaban y los campos desconocidos se perdían. El saneo es
 * defensivo **al leer**; al escribir era destructivo.
 */
function leerCrudo(): unknown[] {
  try {
    const texto = window.localStorage.getItem(CLAVE_OBRAS);
    if (!texto) return [];
    const datos = JSON.parse(texto) as { obras?: unknown };
    return Array.isArray(datos?.obras) ? datos.obras : [];
  } catch {
    // Modo privado, almacenamiento bloqueado o JSON corrupto. Abrir con la lista
    // vacía es mejor que no abrir; el error real aparece al intentar guardar,
    // que es cuando hay algo que perder.
    return [];
  }
}

function leerTodo(): Obra[] {
  return leerCrudo()
    .map(sanearObra)
    .filter((o): o is Obra => o !== null);
}

/** Escribe el archivo entero. Las entradas que no se tocaron viajan **crudas**,
 *  como estaban: ver la nota de `leerCrudo`. */
function escribirTodo(obras: unknown[]): Resultado {
  try {
    window.localStorage.setItem(CLAVE_OBRAS, JSON.stringify({ version: VERSION_OBRA, obras }));
    return { ok: true };
  } catch (e) {
    const nombre = (e as { name?: string })?.name ?? '';
    if (nombre === 'QuotaExceededError' || nombre === 'NS_ERROR_DOM_QUOTA_REACHED') {
      return {
        ok: false,
        motivo:
          'No cabe en el almacenamiento del navegador. Borra alguna obra que ya no uses y ' +
          'vuelve a intentarlo.',
      };
    }
    return {
      ok: false,
      motivo:
        'El navegador no dejó guardar. Suele pasar en ventana privada o con el ' +
        'almacenamiento del sitio bloqueado: lo que escribas no se va a conservar.',
    };
  }
}

/** Las obras, la más reciente primero. */
export function listarObras(): Obra[] {
  return leerTodo().sort((a, b) => b.creada.localeCompare(a.creada));
}

export function leerObra(id: string): Obra | null {
  return leerTodo().find((o) => o.id === id) ?? null;
}

/**
 * Inserta o reemplaza **solo esta obra**, conservando su sitio en el archivo y
 * el texto crudo de todas las demás.
 *
 * Con `crear`, una obra que ya existe es un fallo en vez de un reemplazo. Sin
 * eso, dos pestañas abiertas en el índice proponían las dos el mismo id —cada
 * una ve su propia lista— y la segunda en guardar **borraba** la obra de la
 * primera sin decir una palabra.
 */
export function guardarObra(obra: Obra, { crear = false } = {}): Resultado {
  const obras = leerCrudo();
  const i = obras.findIndex((o) => idDeObra(o) === obra.id);
  if (i >= 0) {
    if (crear) {
      return {
        ok: false,
        motivo: `Ya hay una obra con el id «${obra.id}» en este navegador, quizá creada en otra pestaña.`,
      };
    }
    obras[i] = obra;
  } else {
    obras.push(obra);
  }
  return escribirTodo(obras);
}

export function borrarObra(id: string): Resultado {
  return escribirTodo(leerCrudo().filter((o) => idDeObra(o) !== id));
}

// ── Sacar una obra del navegador, y volver a meterla ─────────────────────────
//
// Una obra en el `localStorage` de UN navegador no viaja a otro equipo, no la ve
// nadie más, y desaparece al borrar los datos del sitio; para ella el archivo es
// la única forma de respaldarla. Una obra en disco (`almacen-disco.ts`) ya es
// una carpeta, pero el archivo sigue siendo la forma de pasársela a alguien en
// una sola pieza.
//
// No es el formato de una hoja del canvas y no se pretende que lo sea: una obra
// es un grafo de nodos con referencias a la biblioteca, no una lista de
// regiones. Lleva `tipo` para poder decirlo al leerlo.

export const TIPO_ARCHIVO_OBRA = 'structflow.obra';

export function archivoDeObra(obra: Obra): object {
  return { version: VERSION_OBRA, tipo: TIPO_ARCHIVO_OBRA, obra };
}

export function nombreDeArchivo(obra: Obra): string {
  return `obra-${obra.id}.json`;
}

export type Importacion = { ok: true; obra: Obra } | { ok: false; motivo: string };

/**
 * Una obra leída de un archivo, con un id libre.
 *
 * El id se renombra si ya está tomado en vez de reemplazar lo que hay: importar
 * es traer algo, nunca pisar. El nombre se conserva tal cual, así que las dos
 * se llaman igual en la lista — y eso es correcto, porque son la misma obra en
 * dos momentos distintos y quien la importó sabe cuál acaba de traer.
 */
export function importarObra(texto: string, ocupados?: Iterable<string>): Importacion {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return { ok: false, motivo: 'El archivo no es JSON válido.' };
  }
  // Se acepta el archivo entero o una obra suelta: quien edite esto a mano no
  // tiene por qué saberse el envoltorio.
  const dentro = (crudo as { obra?: unknown } | null)?.obra;
  const obra = sanearObra(dentro ?? crudo);
  if (!obra) {
    return {
      ok: false,
      motivo: 'El archivo no tiene una obra dentro: falta el `id`, o no es un archivo de obra.',
    };
  }
  // Los ids que ya hay donde va a entrar: el disco, si quien llama los da, o
  // este navegador.
  const tomados = new Set<string | null>(ocupados ?? leerCrudo().map((o) => idDeObra(o)));
  if (tomados.has(obra.id)) {
    let id = '';
    for (let i = 2; !id || tomados.has(id); i++) id = `${obra.id}-${i}`;
    return { ok: true, obra: { ...obra, id } };
  }
  return { ok: true, obra };
}
