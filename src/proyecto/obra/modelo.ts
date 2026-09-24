// ─────────────────────────────────────────────────────────────────────────────
// El documento de una obra: lo único que se guarda de un proyecto propio.
//
// Capa pura, sin React y sin `localStorage`: decidir cómo se llama un nodo nuevo
// o si un nombre está libre es aritmética de cadenas, y se tiene que poder
// probar fuera del navegador.
//
// POR QUÉ AQUÍ Y NO EN `src/lib/`
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
import { idNodoDeCalculo } from './ids';
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
 * Generaliza a la `Importada` que había: `publica` y `formulas` valen
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

/** Pone o quita (`undefined`) la marca de un cálculo, por su id de documento. */
export function marcarRevision(obra: Obra, id: string, revision: Revision | undefined): Obra {
  return {
    ...obra,
    calculos: obra.calculos.map((k) => {
      if (k.id !== id) return k;
      const { revisar: _, ...resto } = k;
      return revision ? { ...resto, revisar: revision } : resto;
    }),
  };
}

/** Los nodos del grafo que esperan revisión, en su orden. */
export function porRevisar(obra: Obra): string[] {
  return obra.calculos.filter((k) => k.revisar).map((k) => idNodoDeCalculo(k.id));
}

/**
 * Un nodo de cálculo de la obra: una carga, una zapata, un anclaje o la
 * geometría común.
 *
 * NO HAY OTRO TIPO DE NODO CON HOJA. Hubo cargas con partidas —una jerarquía
 * aparte, con su nodo «Cargas»—, pero para el motor una partida ya era un
 * cálculo más, y lo único que añadía la carga era una segunda forma de agrupar
 * que competía con el `Grupo`. Una carga es hoy un cálculo, o un grupo de ellos.
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
 * ES LA ÚNICA FORMA DE ORGANIZAR LA OBRA, y es presentación: no toca el scope,
 * el orden de lectura ni las flechas. Sirve para que en una obra de treinta nodos
 * se vea de un vistazo qué es viento, qué es sismo y qué es la grúa: el color va
 * en la franja de la tarjeta —no en el borde, que sigue siendo la severidad— y
 * «reordenar» pone cada grupo en su propia franja horizontal
 * (`colocarPorGrupo` de `../layout.ts`), en el orden de esta lista.
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
 * Los nodos únicos que el usuario agregó desde la paleta. Un cálculo no vive
 * aquí sino en su propia lista: puede haber tantos como la obra necesite.
 */
export type Modulo = 'sap';

/**
 * Lo último que el nodo SAP2000 leyó del modelo abierto, por el puente de Flow
 * (`puente-sap/puente.py`). Se guarda para que la obra diga con qué modelo se
 * conectó, y qué tenía, aunque el puente no esté corriendo.
 *
 * ES SOLO LECTURA. Los Load Patterns no son de la obra: son del modelo, y Flow
 * los lista tal como están. El paso siguiente es que una variable de la obra
 * justifique una carga asignada en el modelo (o el espectro); para eso la obra
 * tiene que saber qué patrones hay, no decidirlos.
 */
export interface ConexionSap {
  /** El nombre del archivo, `v46_FUND_2026-09-23.sdb`. */
  modelo: string;
  ruta: string;
  version: string;
  /** ISO: cuándo se leyó. */
  leido: string;
  /** La última lectura de los Load Patterns. */
  patrones?: LecturaPatrones;
  /** La última lectura de las cargas asignadas, por patrón. */
  cargas?: LecturaCargas;
  /** La última lectura de los casos de espectro y las funciones que usan. */
  espectro?: LecturaEspectro;
}

/** Una dirección de un caso de espectro de respuesta. */
export interface CargaEspectro {
  /** `U1`, `U2`, `U3`. */
  dir: string;
  funcion: string;
  /** Factor de escala, en m/s² (el puente lee en kN-m). */
  sf: number;
  csys: string;
  angulo: number;
}

export interface CasoEspectro {
  nombre: string;
  modal: string;
  /** `CQC`, `SRSS`… */
  combinacion: string;
  amortiguamiento: number;
  cargas: CargaEspectro[];
}

/** Una función de espectro: pares (T en s, Sa en fracciones de g). */
export interface FuncionEspectro {
  nombre: string;
  puntos: [number, number][];
}

export interface LecturaEspectro {
  modelo: string;
  /** ISO. */
  leido: string;
  casos: CasoEspectro[];
  /** Solo las que usa algún caso. */
  funciones: FuncionEspectro[];
}

/** Cómo está aplicada una carga en el modelo. */
export type ClaseCarga =
  | 'barra-distribuida'
  | 'barra-puntual'
  | 'area-uniforme'
  | 'area-a-barras'
  | 'nudo'
  | 'barra-temperatura';

/**
 * Una carga asignada en el modelo, y cuántos objetos la llevan igual.
 *
 * Los valores vienen en kN, m y °C: el puente lee con esas unidades, sean cuales
 * sean las que el usuario tenga en pantalla. Solo están los campos que la clase
 * usa.
 */
export interface CargaAsignada {
  patron: string;
  clase: ClaseCarga;
  valor: number;
  /** Cuántos objetos la llevan. */
  n: number;
  /** Código de dirección de la API: 1-3 locales, 4-6 X/Y/Z, 7-9 proyectadas, 10 gravedad. */
  dir?: number;
  csys?: string;
  /** Distribuida o puntual: es un momento y no una fuerza. */
  momento?: boolean;
  /** Distribuida no uniforme: el valor final y el tramo, en distancia relativa. */
  valor2?: number;
  desde?: number;
  hasta?: number;
  /** Puntual en barra: dónde, en distancia relativa. */
  en?: number;
  /** Área a barras: 1 en una dirección, 2 en dos. */
  dist?: number;
  /** Nudo: `F1`…`M3`. */
  componente?: string;
  tipoTemperatura?: number;
}

export interface LecturaCargas {
  modelo: string;
  /** ISO. */
  leido: string;
  lista: CargaAsignada[];
}

/** Un Load Pattern tal como está en el modelo. */
export interface PatronLeido {
  nombre: string;
  /** El nombre de `eLoadPatternType` en la API: `Dead`, `Live`, `Wind`… */
  tipo: string;
  /** El multiplicador de peso propio (SWF). */
  pesoPropio: number;
}

export interface LecturaPatrones {
  /** De qué modelo se leyeron: puede no ser el de la última conexión. */
  modelo: string;
  /** ISO. */
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
  calculos: NodoCalculo[];
  /** Ausente en una obra que nunca agrupó nada. */
  grupos?: Grupo[];
  /** Ausente mientras el nodo SAP2000 no se haya conectado nunca. */
  sap?: ConexionSap;
  /** Las cargas del modelo que la obra respalda. Ausente mientras no haya ninguna. */
  justificaciones?: Justificacion[];
  /**
   * En qué se MUESTRAN las cargas del modelo. Ausente es `kN`.
   *
   * Es presentación y nada más: el puente lee siempre en kN-m, lo leído se guarda
   * así y la comparación se hace así. Va en la obra y no en `sap` porque es la
   * convención del proyecto —todos la ven igual— y porque `sap` es una lectura
   * que no entra en el historial, y esto sí se deshace.
   */
  unidadesSap?: SistemaUnidades;
}

/** Cómo se muestran las fuerzas del modelo. */
export type SistemaUnidades = 'kN' | 'tonf';

/**
 * Una carga asignada en SAP2000, respaldada por una expresión de la obra.
 *
 * ES DE LA OBRA, NO DE LA LECTURA: vive fuera de `sap`, que es una foto del modelo
 * y no entra en el historial. Atar una carga es una decisión del ingeniero y se
 * deshace con Ctrl+Z.
 *
 * La carga se encuentra por `patron` y `firma` —todo lo que la describe salvo el
 * valor y cuántos objetos la llevan—, y `valor` es el que tenía al atarla. Así un
 * valor cambiado en SAP no suelta la justificación: la deja en rojo diciendo en
 * cuánto se aparta, que es justo lo que tiene que decir (`sap-cargas.ts`,
 * `cargaDe`).
 */
export interface Justificacion {
  id: string;
  /**
   * Qué se justifica. Sin ella, una carga asignada (`patron` y `firma` la
   * encuentran en `sap.cargas`). Las del espectro se encuentran en `sap.espectro`:
   * - `factor-espectro`: el factor de escala de una dirección de un caso;
   *   `patron` es el caso y `firma` la dirección (`U1`).
   * - `funcion-espectro`: una función de espectro, comparada en todos sus puntos;
   *   `patron` es la función. La expresión nombra una función de la obra de un
   *   periodo: `Sa_esp`.
   */
  clase?: 'factor-espectro' | 'funcion-espectro';
  patron: string;
  firma: string;
  valor: number;
  /** Se evalúa en el scope de la obra: `q_cub`, `CM_via * 1.0`… */
  expr: string;
}

export function nuevaJustificacion(campos: Omit<Justificacion, 'id'>): Justificacion {
  return { id: nuevoId('j'), ...campos };
}

/** Pone una justificación, reemplazando la del mismo id si ya estaba. */
export function conJustificacion(obra: Obra, j: Justificacion): Obra {
  const lista = obra.justificaciones ?? [];
  const i = lista.findIndex((x) => x.id === j.id);
  return { ...obra, justificaciones: i < 0 ? [...lista, j] : lista.map((x) => (x.id === j.id ? j : x)) };
}

/** Quita una justificación. Sin ninguna, la lista desaparece: una obra que nunca
 *  justificó nada no gana un `justificaciones: []` al guardarse. */
export function quitarJustificacion(obra: Obra, id: string): Obra {
  const lista = (obra.justificaciones ?? []).filter((x) => x.id !== id);
  const { justificaciones: _, ...resto } = obra;
  return lista.length ? { ...resto, justificaciones: lista } : resto;
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
    calculos: [],
  };
}

export function nuevoCalculo(): NodoCalculo {
  return { id: nuevoId('k'), nombre: 'Cálculo', hoja: [] };
}

/**
 * El mismo alfabeto que el lado izquierdo de un `:=` en el motor
 * (`DEF_RE` de `src/lib/worksheet.ts`). Tiene que coincidir: si aquí se acepta un
 * nombre que allá no es una definición válida, la hoja nunca va a definir la
 * variable y quien la espere se queda sin valor sin decir por qué.
 */
export const IDENTIFICADOR_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;

/** Todos los identificadores que aparecen en un texto, sin repetir. */
export function identificadoresDe(src: string): string[] {
  return [...new Set(src.match(/[\p{L}_][\p{L}\p{N}_]*/gu) ?? [])];
}

/** Una región suelta, en el origen del papel. Dónde va de verdad lo decide
 *  `insertarEnHoja` de `./hoja`, que es quien conoce el resto de la hoja. */
export function nuevaRegion(kind: 'math' | 'text', src = ''): Region {
  return { id: nuevoId('b'), kind, x: ORIGEN_X, y: ORIGEN_Y, src };
}

// ── Operaciones sobre el documento ───────────────────────────────────────────
//
// Devuelven una obra nueva en vez de mutar la que reciben: el canvas las usa
// dentro de `setState`, y mutar ahí deja a React sin saber que algo cambió.

export function agregarModulo(obra: Obra, modulo: Modulo): Obra {
  if (obra.modulos.includes(modulo)) return obra;
  return { ...obra, modulos: [...obra.modulos, modulo] };
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
  return {
    ...obra,
    grupos: (obra.grupos ?? []).filter((g) => g.id !== id),
    calculos: obra.calculos.map((k) => {
      if (k.grupo !== id) return k;
      const { grupo: _, ...resto } = k;
      return resto;
    }),
  };
}

/** Pone o quita (`undefined`) el grupo de un cálculo, por el id del DOCUMENTO
 *  (no el del nodo del grafo). */
export function asignarGrupo(obra: Obra, id: string, grupo: string | undefined): Obra {
  return {
    ...obra,
    calculos: obra.calculos.map((k) => {
      if (k.id !== id) return k;
      const { grupo: _, ...resto } = k;
      return grupo ? { ...resto, grupo } : resto;
    }),
  };
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
  /** El id del NODO del canvas, no el del documento: `calculo:xxx`. */
  idNodo: string;
  etiqueta: string;
  hoja: Region[];
}
