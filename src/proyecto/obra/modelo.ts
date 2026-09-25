// ─────────────────────────────────────────────────────────────────────────────
// El documento de una obra: lo único que se guarda de un proyecto propio.
//
// Capa pura, sin React y sin `localStorage`: decidir cómo se llama un nodo nuevo
// o si un nombre está libre es aritmética de cadenas, y se tiene que poder
// probar fuera del navegador.
//
// POR QUÉ AQUÍ Y NO EN `src/lib/`
// ------------------------------
// La misma razón que documenta `../grafo.ts`: el harness sella el motor de
// este repo como el hash de árbol de `src/lib` y `scripts`. Una obra no evalúa
// ninguna planilla; que su código mueva ese hash haría que el sello dijera
// «cambió el motor» cuando no cambió.
//
// QUÉ ES UNA OBRA Y QUÉ NO
// ------------------------
// Una obra es un documento de Flow: una carpeta en disco (`carpeta.ts`) o, sin
// servidor, una entrada en `localStorage`. NO es un proyecto del harness, y no
// se van a fundir (`docs/rumbo.md`): el asistente trabaja SOBRE la obra, por el
// contrato de Flow, y lo que crea o toca queda con la marca `revisar`. Flow no
// lee nada del harness: la dependencia va en un solo sentido.
// ─────────────────────────────────────────────────────────────────────────────

import { INTRINSECOS } from '../../lib/canvas-handoff';
import { idNodoDeCalculo } from './ids';
import type { MetaPlanilla } from '../../lib/biblioteca/contrato';
import type { Region } from '../../lib/worksheet';
import { ORIGEN_X, ORIGEN_Y } from './hoja';
import type { Ensamble } from './ensamble';

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
export type Procedencia = 'biblioteca' | 'propia' | 'derivada' | 'vista';

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
   * Solo `vista`: qué vista geométrica del registro (`src/proyecto/vistas/`) y
   * en qué versión se agregó. La vista es código, así que no hay sello: la
   * versión es lo que permite avisar de que cambió desde que se agregó.
   */
  vista?: string;
  version?: number;
  /**
   * Solo `vista`: qué componentes lleva y de qué clase (`{ silla: 'no' }`). Lo que
   * falta es la variante por defecto, así que una vista sin configuración es la
   * completa (`configCompleta` de `vistas/registro.ts`).
   */
  config?: Record<string, string>;
  /**
   * Solo `vista`, y solo si se armó con su grupo (`ensamble.ts`): el tipo de apoyo
   * y los conjuntos con que se armó, y qué nodo de la obra es cada pieza. Es lo que
   * permite cambiar la configuración después sin rehacer el grupo.
   */
  ensamble?: Ensamble;
  /**
   * Solo `biblioteca` y `vista`: los valores del formulario. Una derivada no los tiene,
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
export type Modulo = 'sap' | 'sap-combinaciones' | 'sap-modal' | 'sap-basal' | 'sap-apoyos';

/**
 * Los sub-nodos del SAP2000: cuelgan de él en el grafo y leen del mismo modelo.
 * Uno por tema —las combinaciones, y después los resultados—, cada uno con su
 * panel y su lectura dentro de `obra.sap`. Sin el SAP2000 no tienen sentido.
 */
export const SUBMODULOS_SAP: readonly Modulo[] = ['sap-combinaciones', 'sap-modal', 'sap-basal', 'sap-apoyos'];

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
  /**
   * ISO: cuándo se guardó el `.sdb`, según la última conexión. Es el sello contra
   * el que una lectura de resultados sabe si quedó atrasada.
   */
  modificado?: string;
  /** La última lectura de los Load Patterns. */
  patrones?: LecturaPatrones;
  /** La última lectura de las cargas asignadas, por patrón. */
  cargas?: LecturaCargas;
  /** La última lectura de los casos de espectro y las funciones que usan. */
  espectro?: LecturaEspectro;
  /** La última lectura de todos los Load Cases: tipo, estado y detalle. */
  casos?: LecturaCasos;
  /** La última lectura de las fuentes de masa. */
  masa?: LecturaMasa;
  /** La última lectura de lo que hay en el modelo, en números. */
  resumen?: LecturaResumen;
  /** La última lectura de las combinaciones (la del sub-nodo Combinaciones). */
  combinaciones?: LecturaCombinaciones;
  /** La última lectura de resultados modales (la del sub-nodo Modal). */
  modal?: LecturaModal;
  /** La última lectura de la reacción basal (la del sub-nodo Reacción basal). */
  basal?: LecturaBasal;
  /** La última lectura de las reacciones en los apoyos (la del sub-nodo Apoyos). */
  apoyos?: LecturaApoyos;
  /** Las gobernantes de cada conjunto de diseño, por id del conjunto. */
  conjuntos?: Record<string, LecturaConjunto>;
}

/**
 * Un conjunto de diseño: las familias de combinaciones con que se diseña algo
 * —«Hormigón (LRFD)» = B21…B27, «Estabilidad» = SERV…—. Es una decisión del
 * ingeniero: vive en la obra y entra en el historial, no en la lectura.
 */
export interface ConjuntoDiseno {
  id: string;
  nombre: string;
  /** Familias según la convención de Flow: el texto antes del primer «_». */
  familias: string[];
  /**
   * El tramo con que el conjunto entra en los nombres que publican los apoyos
   * (`N_c_CP_LRFD`). Ausente, se deriva del nombre (`aliasPorDefecto`).
   */
  alias?: string;
}

/** Seis componentes de reacción: F1, F2, F3 (kN), M1, M2, M3 (kN·m). */
export type Vector6 = [number, number, number, number, number, number];

/**
 * La combinación que gobierna un criterio en un apoyo, con su valor y el vector
 * de esa combinación. `concurrente` es falso cuando la combinación lleva un
 * espectro o una envolvente: SAP da máximos y mínimos por componente, y el
 * vector no es de un mismo instante.
 */
export interface Gobernante {
  combo: string;
  valor: number;
  v: Vector6;
  concurrente: boolean;
}

export interface GobernantesDeApoyo {
  /** La mayor F3 positiva: compresión sobre la fundación. */
  compresion?: Gobernante;
  /** La F3 más negativa, en valor absoluto: tracción. */
  traccion?: Gobernante;
  /** El mayor √(F1² + F2²). */
  corte?: Gobernante;
  /** El mayor √(M1² + M2²). */
  momento?: Gobernante;
  /**
   * La mayor excentricidad e = M / N con compresión, en m: es la que tracciona
   * los pernos de una placa aunque ninguna combinación la arranque. No es la del
   * momento máximo: una N chica con un M menor puede dar más. En una combinación
   * no concurrente se toma la compresión MENOR de su Max y su Min con el M de
   * los extremos, que es lo que agranda e.
   */
  excentricidad?: Gobernante;
}

/** Los criterios de un apoyo, en el orden en que se muestran y se publican. */
export const CLAVES_GOBERNANTE = ['compresion', 'traccion', 'corte', 'momento', 'excentricidad'] as const;

/**
 * Las gobernantes de un conjunto de diseño, leídas del modelo. Se guarda el
 * resumen y no las filas crudas: 25 apoyos por 80 filas no aportan nada a la
 * obra que no esté en SAP.
 */
export interface LecturaConjunto {
  modelo: string;
  /** ISO. */
  leido: string;
  /** ISO: la fecha del `.sdb` al leer. */
  modificado: string;
  /** Las familias del conjunto cuando se leyó: si cambiaron, la lectura ya no es de él. */
  familias: string[];
  /** Las combinaciones que se leyeron. */
  combos: string[];
  /** Las que no dan valores concurrentes (espectro o envolvente). */
  noConcurrentes: string[];
  apoyos: string[];
  /** En el orden de `apoyos`. */
  porApoyo: GobernantesDeApoyo[];
}

/** Un apoyo: el nudo y dónde está, en m. */
export interface ApoyoLeido {
  nombre: string;
  xyz?: [number, number, number];
}

/**
 * Las reacciones de un caso en todos los apoyos: una fila de seis valores
 * (F1, F2, F3 en kN; M1, M2, M3 en kN·m, ejes del nudo) por apoyo, en el orden
 * de `LecturaApoyos.apoyos`. `null` si SAP no dio ese apoyo en ese caso.
 */
export interface ReaccionesDeCaso {
  caso: string;
  /** `Max` en un espectro: los valores son máximos sin signo. */
  paso?: string;
  valores: ([number, number, number, number, number, number] | null)[];
}

/** Una lectura de resultados, con el sello del modelo como la modal y la basal. */
export interface LecturaApoyos {
  modelo: string;
  /** ISO. */
  leido: string;
  /** ISO: la fecha del `.sdb` al leer. */
  modificado: string;
  apoyos: ApoyoLeido[];
  casos: ReaccionesDeCaso[];
  /** Qué apoyos toca cada grupo de SAP, por las dos vías. Ausente en una lectura vieja. */
  grupos?: GrupoDeApoyos[];
  sinAnalizar: string[];
}

/**
 * Un grupo de SAP y los apoyos que toca: los asignados al grupo (`directos`) y
 * los que alcanzan sus barras (`porBarra`). Quién gana cuando un apoyo está en
 * dos lo decide `tiposDeApoyo`.
 */
export interface GrupoDeApoyos {
  nombre: string;
  directos: string[];
  porBarra: string[];
}

/** La reacción en la base de un caso, en kN y kN·m, ejes globales. */
export interface FilaBasal {
  caso: string;
  /** El tipo de paso que reporta SAP: `Max` en un espectro; ausente en un estático. */
  paso?: string;
  fx: number;
  fy: number;
  fz: number;
  mx: number;
  my: number;
  mz: number;
}

/** Una lectura de resultados, con el sello del modelo como la modal. */
export interface LecturaBasal {
  modelo: string;
  /** ISO. */
  leido: string;
  /** ISO: la fecha del `.sdb` al leer. */
  modificado: string;
  /** Una por caso analizado, sin el modal. */
  filas: FilaBasal[];
  /** Los casos que no se leyeron porque no estaban analizados. */
  sinAnalizar: string[];
}

/**
 * Un modo: periodo, frecuencia y masa participante, como fracción (0,94 es el
 * 94 %). `sux`… son las acumuladas hasta este modo. Sin masas, solo el periodo.
 */
export interface ModoLeido {
  n: number;
  /** s. */
  T: number;
  /** Hz. */
  f: number;
  ux?: number;
  uy?: number;
  uz?: number;
  rz?: number;
  sux?: number;
  suy?: number;
  suz?: number;
}

/**
 * Una lectura de RESULTADOS: lleva el sello del modelo. `modificado` es la fecha
 * del `.sdb` cuando se leyó; si la última conexión ve una posterior, el modelo
 * cambió después y la lectura está atrasada.
 */
export interface LecturaModal {
  modelo: string;
  /** ISO: cuándo se leyó. */
  leido: string;
  /** ISO: la fecha del `.sdb` al leer. */
  modificado: string;
  caso: string;
  modos: ModoLeido[];
}

/** Un término de una combinación: un caso, o una combinación anidada, con su factor. */
export interface TerminoCombinacion {
  clase: 'caso' | 'combinacion';
  nombre: string;
  sf: number;
}

export interface Combinacion {
  nombre: string;
  /** `Lineal`, `Envolvente`, `Absoluta`, `SRSS` o `Rango`. */
  tipo: string;
  terminos: TerminoCombinacion[];
}

export interface LecturaCombinaciones {
  modelo: string;
  /** ISO. */
  leido: string;
  /** En el orden en que SAP las lista. */
  lista: Combinacion[];
}

/** Un patrón (o una aceleración) que carga un caso estático, con su factor. */
export interface CargaDeCaso {
  /** `Load` o `Accel`. */
  tipo: string;
  nombre: string;
  sf: number;
}

/**
 * Un Load Case tal como está en el modelo.
 *
 * El detalle depende del tipo: un estático lineal trae sus patrones con su
 * factor, un modal cuántos modos. Un espectro no trae nada aquí: su detalle está
 * en `LecturaEspectro`, que es donde lo buscan sus justificaciones.
 */
export interface CasoLeido {
  nombre: string;
  /** El nombre de `eLoadCaseType` en la API: `LinearStatic`, `Modal`, `ResponseSpectrum`… */
  tipo: string;
  /** `sin-analizar`, `no-empezo`, `incompleto` o `analizado`. */
  estado: string;
  cargas?: CargaDeCaso[];
  /** Modal: `Eigen` o `Ritz`. */
  modal?: string;
  modos?: { max: number; min: number };
}

export interface LecturaCasos {
  modelo: string;
  /** ISO. */
  leido: string;
  lista: CasoLeido[];
}

/** Una fuente de masa: de dónde toma la masa el modelo y con qué factores. */
export interface FuenteMasa {
  nombre: string;
  porDefecto: boolean;
  /** Del peso propio de los elementos. */
  deElementos: boolean;
  /** De las masas asignadas. */
  deMasas: boolean;
  /** De los patrones de `cargas`. */
  deCargas: boolean;
  cargas: { patron: string; sf: number }[];
}

export interface LecturaMasa {
  modelo: string;
  /** ISO. */
  leido: string;
  fuentes: FuenteMasa[];
}

/** Lo que hay en el modelo, en números: para ver de un vistazo qué se leyó. */
export interface LecturaResumen {
  modelo: string;
  /** ISO. */
  leido: string;
  /** Las unidades en que el usuario tiene el modelo: `kN_m_C`, `Ton_m_C`… */
  unidades: string;
  nudos: number;
  barras: number;
  areas: number;
  links: number;
  grupos: { nombre: string; barras: number; areas: number }[];
  materiales: { nombre: string; tipo: string }[];
  seccionesBarra: string[];
  seccionesArea: string[];
  patrones: number;
  casos: number;
  analizados: number;
  combinaciones: number;
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
  /** Los conjuntos de diseño de los apoyos. Ausente mientras no haya ninguno. */
  conjuntosDiseno?: ConjuntoDiseno[];
  /**
   * El alias de cada tipo de apoyo, por grupo de SAP: el tramo con que entra en
   * los nombres publicados (`COL_PPALES` → `CP`). Solo los elegidos a mano; el
   * resto sale de `aliasPorDefecto`. Es decisión del ingeniero: con historial.
   */
  aliasTipos?: Record<string, string>;
}

/** Fija el alias de un tipo de apoyo. Vacío, vuelve al de por defecto. */
export function conAliasTipo(obra: Obra, grupo: string, alias: string): Obra {
  const { [grupo]: _, ...resto } = obra.aliasTipos ?? {};
  const a = alias.trim();
  const lista = a ? { ...resto, [grupo]: a } : resto;
  const { aliasTipos: __, ...sin } = obra;
  return Object.keys(lista).length ? { ...sin, aliasTipos: lista } : sin;
}

export function nuevoConjunto(nombre: string, familias: string[]): ConjuntoDiseno {
  return { id: nuevoId('cd'), nombre, familias };
}

/** Pone un conjunto, reemplazando el del mismo id si ya estaba. */
export function conConjunto(obra: Obra, c: ConjuntoDiseno): Obra {
  const lista = obra.conjuntosDiseno ?? [];
  const i = lista.findIndex((x) => x.id === c.id);
  return { ...obra, conjuntosDiseno: i < 0 ? [...lista, c] : lista.map((x) => (x.id === c.id ? c : x)) };
}

/** Quita un conjunto. Sin ninguno, la lista desaparece. Su lectura queda en
 *  `sap`, como la de un sub-nodo quitado: Ctrl+Z lo devuelve con sus datos. */
export function quitarConjunto(obra: Obra, id: string): Obra {
  const lista = (obra.conjuntosDiseno ?? []).filter((x) => x.id !== id);
  const { conjuntosDiseno: _, ...resto } = obra;
  return lista.length ? { ...resto, conjuntosDiseno: lista } : resto;
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
   * - `amortiguamiento`: el amortiguamiento de un caso de espectro, como
   *   fracción; `patron` es el caso y `firma`, `amortiguamiento`.
   * - `factor-caso`: el factor con que un caso estático toma un patrón;
   *   `patron` es el caso y `firma` el patrón (EV y DEAD).
   * - `factor-masa`: el factor con que una fuente de masa toma un patrón;
   *   `patron` es la fuente y `firma` el patrón (MSSSRC1 y S).
   */
  clase?: ClaseJustificacion;
  patron: string;
  firma: string;
  valor: number;
  /** Se evalúa en el scope de la obra: `q_cub`, `CM_via * 1.0`… */
  expr: string;
}

export type ClaseJustificacion =
  | 'factor-espectro'
  | 'funcion-espectro'
  | 'amortiguamiento'
  | 'factor-caso'
  | 'factor-masa';

export const CLASES_JUSTIFICACION: readonly ClaseJustificacion[] = [
  'factor-espectro',
  'funcion-espectro',
  'amortiguamiento',
  'factor-caso',
  'factor-masa',
];

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

/**
 * Quita un sub-nodo del SAP2000. El SAP2000 mismo no se quita por aquí: se lleva
 * las justificaciones, y eso es otra decisión.
 *
 * Su lectura se QUEDA en `obra.sap`. Una lectura es una foto del modelo, no una
 * edición, y el historial nunca la restaura (`alRestaurarEstado` de
 * `CanvasObra`): si quitar el nodo la borrara, Ctrl+Z lo devolvería vacío. Al
 * volver a agregarlo, la lectura dice de qué modelo y de cuándo es.
 */
export function quitarModulo(obra: Obra, modulo: Modulo): Obra {
  if (!obra.modulos.includes(modulo) || modulo === 'sap') return obra;
  return { ...obra, modulos: obra.modulos.filter((m) => m !== modulo) };
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
