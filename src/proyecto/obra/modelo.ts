// ─────────────────────────────────────────────────────────────────────────────
// El documento de una obra: lo único que se guarda de un proyecto propio.
//
// Capa pura, sin React y sin `localStorage`: decidir cómo se llama la próxima
// carga o si un nombre está libre es aritmética de cadenas, y se tiene que poder
// probar fuera del navegador.
//
// POR QUÉ ACÁ Y NO EN `src/lib/`
// ------------------------------
// La misma razón que documenta `../contrato.ts`: el harness sella el motor de
// este repo como el hash de árbol de `src/lib` y `scripts`. Una obra no evalúa
// ninguna planilla; que su código mueva ese hash haría que el sello dijera
// «cambió el motor» cuando no cambió.
//
// QUÉ ES UNA OBRA Y QUÉ NO
// ------------------------
// Una obra es un documento de Flow: una carpeta en disco (`carpeta.ts`) o, sin
// servidor, una entrada en `localStorage`. NO es un proyecto del harness, y no
// se van a fundir (`docs/rumbo.md`): el asistente trabaja SOBRE la obra, por el
// contrato de Flow, y lo que crea o toca queda con la marca `revisar`. Los dos se
// pintan con el mismo contrato de grafo (`../contrato.ts`) porque los dos son
// proyecciones, pero la fuente es distinta y no se mezclan.
// ─────────────────────────────────────────────────────────────────────────────

import { INTRINSECOS } from '../../lib/canvas-handoff';
import { idNodoDeCalculo, idNodoDeSubcarga } from './ids';
import type { MetaPlanilla } from '../../lib/biblioteca/contrato';
import type { Region } from '../../lib/worksheet';
import { ORIGEN_X, ORIGEN_Y } from './hoja';

/**
 * De dónde salieron las regiones de un cálculo con frontera.
 *
 * - `biblioteca`: una referencia al slug, que se instancia al abrir la obra. El
 *   nodo no guarda la hoja; guarda el sello.
 * - `propia`: regiones escritas aquí, guardadas en el documento. Sin sello,
 *   porque no es una instancia de nada.
 * - `derivada`: una copia de una genérica que ya se editó. El sello deja de
 *   decir «soy esta genérica» y pasa a decir «salí de ella».
 */
export type Procedencia = 'biblioteca' | 'propia' | 'derivada';

/**
 * Un cálculo con frontera: se alimenta por `formulas` y entrega por `publica`.
 *
 * ES LO QUE DECIDE DÓNDE VIVE EL ESPACIO DE NOMBRES DEL NODO, y no es una
 * preferencia. Una hoja libre —un nodo sin frontera— comparte scope con toda la
 * obra, y esa es justamente su utilidad: es la geometría y los datos comunes.
 * Pero `pedestal-generico` define más de 300 nombres —`d`, `As`, `phi`, `b`,
 * `s`…—: si sus regiones entraran al scope compartido, cualquier nodo posterior
 * colisionaría con media docena de ellos y el canvas se llenaría de rojos de
 * «definida en 2 nodos» sin que nadie haya escrito nada mal. Un aviso que salta
 * por lo que no es deja de leerse.
 *
 * Generaliza a la `Importada` que había: `publica`, `formulas` y `salida` valen
 * igual para las tres procedencias, y con ellos todo lo que ya cuelga de ellos
 * —el orden topológico, las flechas derivadas, el aviso de alias repetido y la
 * detección de ciclos—.
 */
export interface Frontera {
  procedencia: Procedencia;
  /**
   * Solo `biblioteca`: el slug que se instancia al abrir la obra, y el `sha256`
   * que tenía la genérica **al importarla**.
   *
   * SE GUARDA UNA REFERENCIA CON SELLO, NO LA HOJA. Se vuelve a descargar de
   * `/biblioteca` al abrir, así que siempre se instancia la versión publicada y
   * verificada, no una copia congelada que envejece a escondidas. El sello es lo
   * que hace honesta esa decisión: si el archivo de hoy tiene otro hash, el nodo
   * lo dice. Sin él, un cambio en la genérica movería un número ya emitido sin
   * que nadie se entere — la primera clase de falla de la taxonomía: resultado
   * plausible y falso.
   */
  slug?: string;
  sha256?: string;
  /**
   * Solo `derivada`: de qué genérica salió la copia, y en qué versión.
   *
   * Mismo vocabulario que `meta.origen` de `src/lib/biblioteca/contrato.ts`, que
   * es lo que hace que la memoria exportada siga sin mentir sobre su origen
   * cuando entre a un proyecto del harness.
   */
  origen?: { slug: string; sha256: string; desvios?: string[] };
  /**
   * Solo `biblioteca`: los valores del formulario. Una derivada no los tiene,
   * porque al desprenderse quedaron horneados en sus regiones `in_*`: una hoja
   * editable no puede seguir teniendo una lista de campos declarados, porque el
   * primer cambio la haría mentir.
   */
  entradas?: Record<string, number>;
  /**
   * Campos atados a una expresión de la obra, por nombre de campo.
   *
   * Es lo que conecta el cálculo de cargas con la planilla que las usa: el
   * momento que entra a la zapata deja de ser un número copiado a mano y pasa a
   * ser el que produjo el nodo de esfuerzos. La expresión se evalúa en el scope
   * compartido y se convierte a la unidad que el campo declara, así que atar
   * `Mu_Y [kN*m]` a algo en `tonf*m` funciona y atarlo a un área no.
   *
   * Un campo atado ignora su valor en `entradas`, que se conserva: desatarlo
   * devuelve el número que había.
   */
  formulas?: Record<string, string>;
  /**
   * Qué salidas de la planilla ve el resto de la obra, y con qué nombre:
   * `salida → alias`.
   *
   * ES LO QUE CIERRA EL ENCADENAMIENTO. `formulas` deja que una planilla LEA de
   * la obra; sin esto no podía escribir nada en ella, así que la `T_grupo` de
   * una placa base no existía para el anclaje que la recibe y la cadena de la
   * familia BASE DE COLUMNA —que `public/biblioteca/README.md` documenta entera—
   * se recorría copiando números a mano.
   *
   * EL ALIAS ES DEL USUARIO, y no el nombre de la salida, porque dos zapatas
   * publican las dos su `u_max`: sin poder renombrar una, el segundo nodo que
   * publicara lo mismo dejaría a los dos sin dueño. Lo que la genérica declara
   * en `meta.entrega` sirve para PROPONER cuáles publicar, no para decidirlo.
   *
   * Se publica de a poco y a mano, no todo: una genérica declara hasta 38
   * salidas, y meterlas todas en el espacio de nombres de la obra convertiría
   * cualquier nombre corto en un choque.
   */
  publica?: Record<string, string>;
  /**
   * Cuál de las salidas declaradas es el valor con el que la partida se resume.
   * No se suma con nada —una carga agrupa sus partidas, ver `calculo.ts`—: es lo
   * que se lee en el nodo sin abrir la planilla. Solo tiene sentido dentro de
   * una partida; un nodo de cálculo suelto muestra todas sus salidas y no elige
   * ninguna.
   */
  salida?: string;
}

/**
 * Una partida del desglose de una carga, respaldada por su cálculo.
 *
 * `nombre` ES UNA ETIQUETA LIBRE: «Equipos sala de bombas», no `CM_1`. Antes era
 * la variable que su hoja tenía que definir, y eso ataba dos cosas que no tienen
 * por qué coincidir —cómo se llama la partida en la memoria y cómo se llama el
 * número dentro del cálculo—, además de obligar a escribir etiquetas con guion
 * bajo. Cuál variable aporta el valor lo dice `variable`.
 *
 * Su respaldo es su `hoja`, y `frontera` decide si esa hoja comparte el scope de
 * la obra o tiene el suyo.
 */
export interface Subcarga {
  id: string;
  nombre: string;
  hoja: Region[];
  /** El `meta` de la hoja, si lo trae. Ver `NodoCalculo`. */
  meta?: MetaPlanilla;
  /** Cuál variable de su hoja libre es el valor de la partida. */
  variable?: string;
  frontera?: Frontera;
  /** Marcada para revisar. Ver `Revision`. */
  revisar?: Revision;
}

/**
 * Un nodo marcado para revisar, con la razón en una nota breve.
 *
 * La pone el asistente en todo nodo que crea o toca, y el usuario para señalar
 * un supuesto, una decisión pendiente o un dato por confirmar. «Revisado» la
 * quita. ES DELIBERADAMENTE SIMPLE —una marca, una nota corta y quién la puso— y,
 * como el grupo, es presentación: no toca el scope, el orden ni ningún CUMPLE.
 */
export interface Revision {
  nota: string;
  por: 'usuario' | 'asistente';
}

/** Una nota de revisión es una línea, no un informe. */
export const LARGO_NOTA_REVISION = 280;

/**
 * Pone o quita (`undefined`) la marca de un cálculo o de una partida, por su id
 * de documento.
 */
export function marcarRevision(obra: Obra, id: string, revision: Revision | undefined): Obra {
  const poner = <T extends { id: string; revisar?: Revision }>(x: T): T => {
    if (x.id !== id) return x;
    const { revisar: _, ...resto } = x;
    return (revision ? { ...resto, revisar: revision } : resto) as T;
  };
  return {
    ...obra,
    calculos: obra.calculos.map(poner),
    cargas: obra.cargas.map((c) => ({ ...c, subcargas: c.subcargas.map(poner) })),
  };
}

/** Los nodos del grafo que esperan revisión: las partidas primero, en su orden. */
export function porRevisar(obra: Obra): string[] {
  return [
    ...obra.cargas.flatMap((c) => c.subcargas.filter((s) => s.revisar).map((s) => idNodoDeSubcarga(s.id))),
    ...obra.calculos.filter((k) => k.revisar).map((k) => idNodoDeCalculo(k.id)),
  ];
}

/**
 * Qué nombre aporta el valor de una partida, venga de donde venga.
 *
 * Los dos respaldos lo guardan en sitios distintos a propósito —`variable` es de
 * la hoja libre, `frontera.salida` es del cálculo con frontera— para que cada
 * uno se borre con su respaldo: cambiar de genérica no puede dejar apuntando a
 * una salida que la nueva no tiene. Pero se LEE por acá y solo por acá, así que
 * el resto del código no tiene que saber cuál de los dos es.
 */
export function variableDePartida(sub: Subcarga): string | undefined {
  return sub.frontera ? sub.frontera.salida : sub.variable;
}

/**
 * Un cálculo suelto de la obra, que no cuelga de ninguna carga.
 *
 * Es el caso de las costaneras, una zapata o un anclaje: cálculos que la obra
 * tiene que respaldar y que no producen una carga. Por eso no lleva variable de
 * salida —muestra las que declara— ni entra en ninguna suma.
 */
export interface NodoCalculo {
  id: string;
  /** Lo que se lee en el canvas. Al importar se propone el título de la genérica. */
  nombre: string;
  /**
   * Su hoja.
   *
   * SIN `frontera` ES UNA HOJA LIBRE y sus regiones entran al scope compartido.
   * Es lo que convierte al canvas en un grafo de datos y no en una colección de
   * planillas sueltas: un nodo «Geometría» que define `A_planta` y `h_losa` y del
   * que cuelgan los demás no es ninguna planilla de la biblioteca, es el dato
   * común de la obra.
   *
   * Con `frontera` de procedencia `biblioteca` va vacía: la hoja se instancia al
   * abrir desde el slug sellado.
   */
  hoja: Region[];
  /**
   * El `meta` de la hoja, si lo trae: el mismo que lleva `metaRef` en el canvas
   * matemático. Una derivada que se exporte desde la pestaña sigue siendo una
   * planilla con su slug, sus normas y su origen.
   */
  meta?: MetaPlanilla;
  frontera?: Frontera;
  /** El id de su `Grupo`, si el usuario lo agrupó. */
  grupo?: string;
  /** Marcado para revisar. Ver `Revision`. */
  revisar?: Revision;
}

/**
 * Un grupo de nodos, con el color que el usuario elija.
 *
 * ES PRESENTACIÓN Y NADA MÁS: no toca el scope, el orden de lectura ni las
 * flechas. Sirve para que en una obra de treinta nodos se vea de un vistazo qué
 * es viento, qué es sismo y qué es la grúa. El color del grupo va en la franja de
 * la tarjeta y no en el borde, que sigue siendo la severidad.
 */
export interface Grupo {
  id: string;
  nombre: string;
  /** `#rrggbb`. */
  color: string;
}

/** Los colores que se proponen al crear un grupo; el usuario puede elegir otro. */
export const COLORES_GRUPO = [
  '#2563eb',
  '#0891b2',
  '#059669',
  '#65a30d',
  '#d97706',
  '#dc2626',
  '#9333ea',
  '#db2777',
] as const;

export const COLOR_RE = /^#[0-9a-f]{6}$/i;

/**
 * Una carga de la obra.
 *
 * NO TIENE TIPO, Y ES DELIBERADO. Hubo un catálogo cerrado de ASCE 7 —`D`, `L`,
 * `Lr`, `S`, `W`…— con un `simbolo` por fila, y lo único que llegó a decidir fue
 * cuáles se podían desglosar: solo la permanente. Pero una nieve, un viento y un
 * sismo se calculan exactamente igual —partidas, cada una con su hoja o su
 * planilla de la biblioteca, y una suma—, así que el catálogo no distinguía dos
 * comportamientos: prohibía nueve de los diez.
 *
 * Lo que diferencia una carga de otra es su NOMBRE, que además es el
 * identificador con el que se la cita (`D`, `SC oficinas`, `Wx`). Una carga es
 * un nombre y un desglose; cuando llegue el módulo de combinaciones, citará esos
 * nombres, que es lo que el usuario escribió y no una clave que tuvo que elegir
 * de una lista.
 */
/**
 * Lo que una carga es en SAP2000: un Load Pattern. Un patrón NO tiene valor —el
 * valor va en los objetos, y eso es otro paso—; tiene un tipo y un multiplicador
 * de peso propio. Flow es la fuente: esto es lo que el modelo DEBERÍA tener.
 */
export interface PatronSap {
  /** El nombre de `eLoadPatternType` en la API: `Dead`, `SuperDead`, `Wind`… */
  tipo: string;
  /** Casi siempre 1 en el patrón del peso propio y 0 en los demás. */
  pesoPropio: number;
}

/** Los tipos que se ofrecen primero; un modelo puede traer otros y se respetan. */
export const TIPOS_PATRON = [
  'Dead',
  'SuperDead',
  'Live',
  'ReduceLive',
  'Rooflive',
  'Snow',
  'Wind',
  'Quake',
  'Temperature',
  'Notional',
  'Other',
] as const;

export interface Carga {
  id: string;
  /** Lo que el usuario escribe: `D`, `SC oficinas`, `Wx`. Es el identificador
   *  con el que la carga se va a citar, así que tiene que ser único. */
  nombre: string;
  /** El desglose, siempre disponible: cualquier carga se respalda con partidas. */
  subcargas: Subcarga[];
  /** El id de su `Grupo`. Va en la carga y no en la partida: un patrón no puede
   *  quedar partido entre dos grupos, y una carga plegada se dibuja como su partida. */
  grupo?: string;
  /** Cómo es como Load Pattern de SAP2000. Ausente mientras no se defina. */
  patron?: PatronSap;
}

/**
 * Los nodos que el usuario agregó desde la paleta.
 *
 * `cargas` es único por obra —las definiciones son una sola tabla, como en
 * SAP—; `calculo` no, y por eso no vive acá sino en su propia lista: de un
 * cálculo suelto puede haber tantos como la obra necesite.
 */
export type Modulo = 'cargas' | 'sap';

/**
 * Lo último que el nodo SAP2000 leyó del modelo abierto, por el puente de Flow
 * (`puente-sap/puente.py`). Se guarda para que la obra diga con qué modelo se
 * conectó aunque el puente no esté corriendo.
 */
export interface ConexionSap {
  /** El nombre del archivo, `v46_FUND_2026-09-23.sdb`. */
  modelo: string;
  ruta: string;
  version: string;
  /** ISO: cuándo se leyó. */
  leido: string;
  /** La última lectura de los Load Patterns del modelo, para compararla con las
   *  cargas aunque el puente no esté corriendo. */
  patrones?: LecturaPatrones;
}

/** Un Load Pattern tal como está en el modelo. */
export interface PatronLeido extends PatronSap {
  nombre: string;
}

export interface LecturaPatrones {
  /** De qué modelo se leyeron: puede no ser el de la última conexión. */
  modelo: string;
  leido: string;
  lista: PatronLeido[];
}

export interface Obra {
  version: number;
  id: string;
  nombre: string;
  /** ISO. Ordena el índice sin depender del orden en que se guardaron. */
  creada: string;
  modulos: Modulo[];
  cargas: Carga[];
  calculos: NodoCalculo[];
  /** Ausente en una obra que nunca agrupó nada. */
  grupos?: Grupo[];
  /** Ausente mientras el nodo SAP2000 no se haya conectado nunca. */
  sap?: ConexionSap;
}

/**
 * La versión del documento.
 *
 * SE MIGRA POR FORMA, NO POR ESTE NÚMERO. `sanearObra` nunca lo ha leído —la
 * migración de `variable` desde `nombre` ya va por forma—, así que confiar en él
 * ahora sería confiar en un dato que nadie comprobó nunca. Está para que una
 * versión futura pueda negarse a abrir un documento más nuevo del que entiende;
 * las que ya están desplegadas no lo van a mirar.
 */
export const VERSION_OBRA = 2;

let secuencia = 0;

/** Lleva la marca del reloj, un contador y azar: dos pestañas abriendo obras al
 *  mismo tiempo no pueden coincidir. */
function nuevoId(prefijo: string): string {
  return `${prefijo}${Date.now().toString(36)}${(secuencia++).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/**
 * El id viaja en la URL (`/obra/<id>`), así que tiene que pasar el alfabeto
 * cerrado de `SLUG_PROYECTO_RE` en `src/lib/ruta.ts`. Se quitan las tildes antes
 * de filtrar para que «Galpón» dé `galpon` y no `galp-n`.
 */
export function slugificar(nombre: string): string {
  const plano = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const limpio = plano
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  // Un nombre que no deja ninguna letra —«###»— no puede quedarse sin ruta.
  return /^[a-z0-9]/.test(limpio) ? limpio : `obra-${limpio}`.replace(/-+$/, '');
}

export const NOMBRE_OBRA_POR_OMISION = 'Obra sin nombre';

/**
 * Una obra nueva, con el id ya libre respecto de `ocupados`. El sufijo es un
 * número y no un hash porque el id se ve en la barra de direcciones.
 */
export function nuevaObra(nombre: string, ocupados: readonly string[] = []): Obra {
  const limpio = nombre.trim() || NOMBRE_OBRA_POR_OMISION;
  const base = slugificar(limpio) || 'obra';
  const tomados = new Set(ocupados);
  let id = base;
  for (let i = 2; tomados.has(id); i++) id = `${base}-${i}`;
  return {
    version: VERSION_OBRA,
    id,
    nombre: limpio,
    creada: new Date().toISOString(),
    modulos: [],
    cargas: [],
    calculos: [],
  };
}

export function nuevoCalculo(): NodoCalculo {
  return { id: nuevoId('k'), nombre: 'Cálculo', hoja: [] };
}

/**
 * La próxima carga, con un nombre correlativo y libre que el usuario reescribe.
 *
 * `C1`, `C2`… y no `D` ni `W`: la carga no tiene tipo, así que proponer el
 * símbolo de una norma sería sugerir una clasificación que el modelo ya no
 * guarda. Lo único que el nombre tiene que garantizar al nacer es ser único,
 * porque es el identificador con el que la carga se cita.
 */
export function nuevaCarga(cargas: readonly Carga[]): Carga {
  const tomados = new Set(cargas.map((c) => c.nombre.trim()));
  let nombre = 'C1';
  for (let i = 2; tomados.has(nombre); i++) nombre = `C${i}`;
  return { id: nuevoId('c'), nombre, subcargas: [] };
}

/**
 * El mismo alfabeto que el lado izquierdo de un `:=` en el motor
 * (`DEF_RE` de `src/lib/worksheet.ts`). Tiene que coincidir: si acá se acepta un
 * nombre que allá no es una definición válida, la hoja nunca va a definir la
 * variable y quien la espere se queda sin valor sin decir por qué.
 */
export const IDENTIFICADOR_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;

/** Todos los identificadores que aparecen en un texto, sin repetir. */
export function identificadoresDe(src: string): string[] {
  return [...new Set(src.match(/[\p{L}_][\p{L}\p{N}_]*/gu) ?? [])];
}

export function nuevaSubcarga(subcargas: readonly Subcarga[]): Subcarga {
  const n = subcargas.length + 1;
  // Nace con la línea que la define: una hoja en blanco no dice qué se espera de
  // ella, y esta línea es literalmente el respaldo mínimo de la partida. La
  // variable propuesta y la etiqueta ya no son lo mismo, y eso es el punto.
  const variable = `CM_${n}`;
  return {
    id: nuevoId('s'),
    nombre: `Partida ${n}`,
    variable,
    hoja: [nuevaRegion('math', `${variable} := `)],
  };
}

/** Una región suelta, en el origen del papel. Dónde va de verdad lo decide
 *  `insertarEnHoja` de `./hoja`, que es quien conoce el resto de la hoja. */
export function nuevaRegion(kind: 'math' | 'text', src = ''): Region {
  return { id: nuevoId('b'), kind, x: ORIGEN_X, y: ORIGEN_Y, src };
}

/**
 * Qué le pasa al nombre de una carga, o cadena vacía si no le pasa nada.
 *
 * Devuelve el motivo en vez de un booleano porque es el motivo lo que se pinta:
 * un nodo rojo que no dice por qué obliga a salir del canvas a averiguarlo.
 */
export function problemaDeNombre(carga: Carga, cargas: readonly Carga[]): string {
  const nombre = carga.nombre.trim();
  if (!nombre) return 'Sin nombre: una carga sin nombre no se puede citar en una combinación.';
  const otra = cargas.find((c) => c.id !== carga.id && c.nombre.trim() === nombre);
  if (otra) return `Nombre repetido: ya hay otra carga que se llama «${nombre}».`;
  return '';
}

// ── Operaciones sobre el documento ───────────────────────────────────────────
//
// Devuelven una obra nueva en vez de mutar la que reciben: el canvas las usa
// dentro de `setState`, y mutar ahí deja a React sin saber que algo cambió.

export function agregarModulo(obra: Obra, modulo: Modulo): Obra {
  if (obra.modulos.includes(modulo)) return obra;
  return { ...obra, modulos: [...obra.modulos, modulo] };
}

export function agregarCarga(obra: Obra): { obra: Obra; carga: Carga } {
  const carga = nuevaCarga(obra.cargas);
  return { obra: { ...obra, cargas: [...obra.cargas, carga] }, carga };
}

export function cambiarCarga(obra: Obra, id: string, campos: Partial<Omit<Carga, 'id'>>): Obra {
  return {
    ...obra,
    cargas: obra.cargas.map((c) => (c.id === id ? { ...c, ...campos } : c)),
  };
}

export function borrarCarga(obra: Obra, id: string): Obra {
  return { ...obra, cargas: obra.cargas.filter((c) => c.id !== id) };
}

/** Reemplaza las partidas de una carga. Un solo camino de escritura para el
 *  desglose: agregar, renombrar, borrar y editar una hoja pasan todos por acá. */
export function conSubcargas(obra: Obra, idCarga: string, subcargas: Subcarga[]): Obra {
  return {
    ...obra,
    cargas: obra.cargas.map((c) => (c.id === idCarga ? { ...c, subcargas } : c)),
  };
}

export function cargaDeSubcarga(obra: Obra, idSub: string): Carga | undefined {
  return obra.cargas.find((c) => c.subcargas.some((s) => s.id === idSub));
}

export function agregarCalculo(obra: Obra, calculo: NodoCalculo): Obra {
  return { ...obra, calculos: [...obra.calculos, calculo] };
}

export function cambiarCalculo(obra: Obra, id: string, cambio: (k: NodoCalculo) => NodoCalculo): Obra {
  return { ...obra, calculos: obra.calculos.map((k) => (k.id === id ? cambio(k) : k)) };
}

export function borrarCalculo(obra: Obra, id: string): Obra {
  return { ...obra, calculos: obra.calculos.filter((k) => k.id !== id) };
}

// ── Grupos ───────────────────────────────────────────────────────────────────

export function agregarGrupo(obra: Obra, nombre: string, color: string): { obra: Obra; grupo: Grupo } {
  const grupo: Grupo = { id: nuevoId('g'), nombre: nombre.trim() || 'Grupo', color };
  return { obra: { ...obra, grupos: [...(obra.grupos ?? []), grupo] }, grupo };
}

export function cambiarGrupo(obra: Obra, id: string, campos: Partial<Omit<Grupo, 'id'>>): Obra {
  return { ...obra, grupos: (obra.grupos ?? []).map((g) => (g.id === id ? { ...g, ...campos } : g)) };
}

/** Borra el grupo y la referencia de cada miembro: un `grupo` que no apunta a
 *  nada lo descartaría el saneo al releer, pero hasta entonces sería un dato roto. */
export function borrarGrupo(obra: Obra, id: string): Obra {
  const sin = <T extends { grupo?: string }>(x: T): T => {
    if (x.grupo !== id) return x;
    const { grupo: _, ...resto } = x;
    return resto as T;
  };
  return {
    ...obra,
    grupos: (obra.grupos ?? []).filter((g) => g.id !== id),
    cargas: obra.cargas.map(sin),
    calculos: obra.calculos.map(sin),
  };
}

/** Pone o quita (`undefined`) el grupo de una carga o de un cálculo, por el id
 *  del DOCUMENTO (no el del nodo del grafo). */
export function asignarGrupo(obra: Obra, id: string, grupo: string | undefined): Obra {
  const poner = <T extends { id: string; grupo?: string }>(x: T): T => {
    if (x.id !== id) return x;
    const { grupo: _, ...resto } = x;
    return (grupo ? { ...resto, grupo } : resto) as T;
  };
  return { ...obra, cargas: obra.cargas.map(poner), calculos: obra.calculos.map(poner) };
}

export function grupoPorId(obra: Obra, id: string | undefined): Grupo | undefined {
  return id ? obra.grupos?.find((g) => g.id === id) : undefined;
}

/**
 * Todos los slugs que la obra referencia, para saber qué hay que descargar.
 *
 * Solo los de procedencia `biblioteca`: una `derivada` recuerda de dónde salió,
 * pero sus regiones ya están en el documento y no hay nada que traer.
 */
export function slugsImportados(obra: Obra): string[] {
  const s = new Set<string>();
  const tomar = (f?: Frontera) => {
    if (f?.procedencia === 'biblioteca' && f.slug) s.add(f.slug);
  };
  for (const k of obra.calculos) tomar(k.frontera);
  for (const c of obra.cargas) for (const sub of c.subcargas) tomar(sub.frontera);
  return [...s];
}

/**
 * Ata o desata un campo de una planilla importada.
 *
 * Desatar (`expr` sin valor) BORRA la clave en vez de dejarla vacía: `formulas`
 * responde «¿este campo está atado?», y una cadena vacía diría que sí a una
 * pregunta cuya respuesta es que no.
 */
export function conFormula(f: Frontera, campo: string, expr: string | undefined): Frontera {
  const { [campo]: _fuera, ...resto } = f.formulas ?? {};
  return { ...f, formulas: expr === undefined ? resto : { ...resto, [campo]: expr } };
}

/**
 * Publica o deja de publicar una salida. Misma regla que `conFormula`: dejar de
 * publicar BORRA la clave, porque `publica` responde «¿qué ve la obra de esta
 * planilla?» y un alias vacío no es una respuesta.
 */
export function conPublicacion(
  f: Frontera,
  salida: string,
  alias: string | undefined,
): Frontera {
  const { [salida]: _fuera, ...resto } = f.publica ?? {};
  return { ...f, publica: alias === undefined ? resto : { ...resto, [salida]: alias } };
}

/**
 * Qué le pasa a un alias publicado, o cadena vacía.
 *
 * Tiene que ser un nombre que el motor acepte a la izquierda de un `:=` —si no,
 * nadie podría escribirlo en una fórmula— y no puede ser el de una unidad o una
 * función, o taparía a la del motor en su propia hoja. Es la misma lista con la
 * que `validarMeta` impide que una entrada se llame `m` o `min`.
 *
 * Se devuelve el motivo y no un booleano por lo mismo que en `problemaDeNombre`:
 * es el motivo lo que se pinta.
 */
export function problemaDeAlias(alias: string): string {
  const a = alias.trim();
  if (!a) return 'Sin nombre: escribe con qué nombre lo va a ver el resto de la obra.';
  if (!IDENTIFICADOR_RE.test(a)) {
    return `«${a}» no es un nombre de variable: empieza por letra o «_» y sigue con letras, cifras o «_».`;
  }
  if (INTRINSECOS.has(a)) {
    return `«${a}» ya es una unidad o una función del motor: taparía a la del motor en cualquier fórmula.`;
  }
  return '';
}

/** Una hoja de la obra, con el id de nodo con que se pinta. */
export interface HojaDeNodo {
  /** El id del NODO del canvas, no el del documento: `partida:xxx`, `calculo:xxx`. */
  idNodo: string;
  etiqueta: string;
  hoja: Region[];
}
