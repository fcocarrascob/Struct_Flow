// ─────────────────────────────────────────────────────────────────────────────
// La obra entera como UNA sola cadena de cálculo.
//
// Antes cada carga evaluaba su hoja, y por eso un nodo no podía usar lo que
// definía otro. Después todas las hojas libres de la obra pasaron a
// concatenarse en una hoja única con un scope compartido, que es exactamente lo
// que el motor ya sabía hacer. Ahora entran también las planillas de la
// biblioteca, que hasta aquí sólo podían LEER de ese scope —un campo atado a
// una expresión— y no escribir en él.
//
// EL ORDEN LO DECIDE LA DEPENDENCIA, NO EL CANVAS
// -----------------------------------------------
// El motor ordena por `(y, x)`, así que quien arma la hoja decide el orden de
// lectura. En una hoja ese orden es dónde está escrito cada bloque; en un canvas
// no hay «arriba» que signifique nada —los nodos se arrastran—, así que el orden
// se calcula: si el nodo B nombra algo que define el nodo A, A va antes. Es un
// orden topológico sobre los nombres que cada nodo usa de los demás.
//
// Eso tiene una consecuencia que vale la pena: **las flechas del canvas se
// derivan de ahí**. Una flecha de A a B ya no es decoración ni jerarquía, es
// «B usa esto que define A», que es la única cosa que un grafo de cálculo
// necesita decir.
//
// QUÉ APORTA CADA NODO
// --------------------
//   - Una **hoja libre** —un nodo SIN frontera— define lo que sus fórmulas
//     definen, y usa los nombres que nombra en ellas. Sus regiones entran en la
//     hoja global.
//   - Un **cálculo con frontera** es otra hoja, con su propio scope, y no entra:
//     define los ALIAS que su `publica` declara y usa los nombres que aparecen
//     en las expresiones de sus campos atados. Sus 120 a 324 regiones se quedan
//     donde están; lo único que cruza la frontera son los valores que publica,
//     y cruzan como el objeto `Unit` que son.
//
//     Da igual de dónde salgan esas regiones —de la biblioteca, escritas aquí, o
//     copiadas de una genérica y editadas—: la frontera es la misma, y por eso
//     `defineDe`, `fuentesDeUso`, el orden topológico, las flechas derivadas, el
//     alias repetido y la detección de ciclos valen para las tres sin una sola
//     rama.
//   - Un **nodo de resultados** —un sub-nodo del SAP2000, sin hoja— publica
//     lo que leyó del modelo (`resultados`: `T_x` y `T_y` del Modal) y no usa
//     nada. Es la misma frontera vista desde el otro lado: solo cruzan los
//     valores, como `Unit`, con su región fantasma para el autocompletado. Va
//     delante de los cálculos en el orden de creación, así que toda hoja lo ve
//     sin haberlo nombrado todavía.
//
// POR ESO LA EVALUACIÓN VA POR TRAMOS. No se puede armar una sola hoja y
// evaluarla de una vez, porque en medio del orden hay planillas que producen
// valores que los nodos de aguas abajo necesitan ver ya definidos. Se recorre el
// orden acumulando un scope: los nodos de hoja libre consecutivos se evalúan
// juntos con `evaluateSheet(tramo, scope)`, y cada planilla se evalúa con el
// scope que hay en su posición y deja en él lo que publica.
//
// DOS FALLAS QUE ESTE MODELO TRAE, Y HAY QUE NOMBRARLAS
// -----------------------------------------------------
//   - **Un nombre definido en dos nodos** no se puede resolver: cuál gana
//     dependería del orden, y el orden lo calculamos nosotros. Los dos nodos
//     salen en rojo y el nombre no se usa. Vale igual para dos planillas que
//     publican con el mismo alias.
//   - **Un ciclo** (A usa algo de B y B algo de A) no tiene orden posible. Los
//     nodos del ciclo salen en rojo y se evalúan al final, donde el motor dirá
//     por su cuenta que la variable no está definida.
// ─────────────────────────────────────────────────────────────────────────────

import {
  erroresDeResultado,
  evaluateSheet,
  formatValor,
  nombresSinDefinir,
  simbolosDeFormula,
  type Region,
  type SheetResults,
} from '../../lib/worksheet';
import type { EvaluacionModulo } from '../../lib/diseno/evaluar';
import { evaluarImportada, type Genericas } from './biblioteca';
import type { Frontera, Obra } from './modelo';
// `definicionesDe` es una sola, la de `./hoja`: había una copia aquí que solo
// miraba las regiones `math`, y el panel y el grafo discrepaban sobre qué
// define una hoja en cuanto aparecía un programa.
import { definicionesDe, ordenDeLectura, usosDeRegion } from './hoja';
import { ID_NODO_APOYOS, ID_NODO_MODAL, idNodoDeCalculo } from './ids';
import { publicaApoyos } from './sap-apoyos';
import { publicaModal, type Publicado } from './sap-modal';
import { evaluarVista, type VistaEvaluada } from '../vistas/evaluar';
import { VISTAS, camposActivos, configCompleta } from '../vistas/registro';

const CENTINELA = '__scope_final';

/**
 * Prefijo de los centinelas que capturan el scope con el que se evalúa la hoja
 * de cada nodo.
 *
 * Es lo que una pestaña necesita para no pintar rojos que no lo son: la hoja de
 * un nodo abierta en el canvas matemático tiene que ver lo mismo que ve dentro
 * de la obra, o cada nombre que venga de otro nodo saldría como «variable
 * indefinida». Van DENTRO del tramo, así que no cuestan una evaluación de más:
 * una región `image` se registra sin evaluarse y captura el scope visible en su
 * posición de lectura, que es exactamente lo que hay por encima de ese nodo.
 */
const POSICION = '__scope_en:';

/** Separación entre nodos al concatenar la hoja global. Cualquier paso creciente
 *  sirve para el orden; este deja sitio de sobra. */
const PASO = 100;

/** Un nodo de la obra que participa del grafo de cálculo. */
export interface NodoObra {
  /** El id del NODO del canvas: `calculo:xxx`. */
  idNodo: string;
  etiqueta: string;
  /** Su hoja. Vacía si la frontera es de procedencia `biblioteca`. */
  hoja: Region[];
  frontera?: Frontera;
  /** Solo un nodo de resultados: lo que publica, leído del modelo. */
  resultados?: Publicado[];
}

/** Lo que un cálculo con frontera produjo, en su sitio del orden de lectura. */
export interface Instanciada {
  /**
   * Lo que la hoja dejó definido, para que `proyeccion.ts` y los paneles lean
   * un valor sin preguntar de qué procedencia es el nodo.
   */
  salidas: Record<string, unknown>;
  /**
   * El scope de la obra **visible en la posición de este nodo**, que es contra
   * el que se resuelven sus campos atados. No es el final de la obra: un cálculo
   * no puede alimentarse de lo que se calcula debajo de él.
   */
  scope: Record<string, unknown>;
  /**
   * El scope con el que se evalúa SU hoja: solo los campos atados. Es lo que
   * hace falta para abrirla en el canvas matemático y que dé el mismo número,
   * sin dejar entrar el resto de la obra por la puerta de atrás.
   */
  inicial: Record<string, unknown>;
  /** Solo la procedencia `biblioteca`: la evaluación del módulo, con su figura,
   *  sus errores y sus salidas declaradas, que es lo que pinta la ficha. */
  ev?: EvaluacionModulo;
  /** Solo la procedencia `vista`: el modelo geométrico, su hoja sintetizada —que
   *  no se guarda en el documento— y los campos atados que no resolvieron. */
  vista?: VistaEvaluada;
}

export interface EvaluacionObra {
  /** Por id de bloque, para pintar cada uno con su resultado o su error. */
  results: SheetResults;
  /** La hoja global sintetizada. El autocompletado la necesita tal cual: su
   *  filtro por posición de lectura es lo que hace que un nodo ofrezca lo que
   *  definen los de aguas arriba y no lo de aguas abajo. */
  regions: Region[];
  scope: Record<string, unknown>;
  /** nombre → id del nodo que lo define, solo para los nombres sin choque. */
  duenio: Map<string, string>;
  /** nombre → ids de los nodos que lo definen, cuando son más de uno. */
  repetidos: Map<string, string[]>;
  /** id de nodo → nombres que toma de otros nodos. */
  usos: Map<string, Set<string>>;
  /** id de nodo → su nombre visible. Un diagnóstico que dice «lo definía
   *  `k_3f8a`» no sirve para ir a arreglarlo. */
  etiquetas: Map<string, string>;
  /** id de nodo → nombres que define (o publica, si es una planilla), en orden. */
  define: Map<string, string[]>;
  /** Nodos que no tienen orden posible porque se citan en círculo. */
  enCiclo: Set<string>;
  /** id de nodo → el campo atado que su propia hoja vuelve a definir. */
  atadosTapados: Map<string, string>;
  /**
   * id de nodo → los nombres que su hoja pidió y no existen.
   *
   * Salen del mensaje del motor y no de `usos`, que filtra por `duenio` a
   * propósito: sin ese filtro, `sqrt` y `kN` entrarían como dependencias rotas.
   * Un nombre que el motor declara indefinido sí lo está, sea del grafo o no.
   */
  nombresRotos: Map<string, string[]>;
  /**
   * id de nodo → el scope con el que se evalúa SU hoja.
   *
   * Para una hoja libre es lo que la obra define por encima de ella; para un
   * cálculo con frontera, solo sus campos atados. Es lo que hace falta para
   * abrir esa hoja en el canvas matemático y que dé los mismos números que da
   * dentro de la obra.
   */
  scopeEnNodo: Map<string, Record<string, unknown>>;
  /** id de nodo → lo que su cálculo con frontera produjo. Una sola evaluación
   *  por nodo, que es lo que impide que el canvas y el panel enseñen números
   *  distintos. */
  importadas: Map<string, Instanciada>;
}

/**
 * Todos los nodos de la obra que entran en la cadena de cálculo: los de
 * resultados primero, después los cálculos con hoja libre o con frontera.
 *
 * Primero porque el orden de creación es el que desempata el topológico, y de
 * él sale el autocompletado (ver `ordenar`): detrás de los cálculos, una hoja
 * sin dependencias quedaría por encima de `T_x` y no lo ofrecería hasta que
 * alguien lo escribiera de memoria.
 */
export function nodosDeLaObra(obra: Obra): NodoObra[] {
  const nodos: NodoObra[] = [];
  if (obra.modulos.includes('sap-modal') && obra.sap?.modal) {
    const resultados = publicaModal(obra.sap.modal);
    if (resultados.length) nodos.push({ idNodo: ID_NODO_MODAL, etiqueta: 'Modal', hoja: [], resultados });
  }
  const apoyos = publicaApoyos(obra).publicados;
  if (apoyos.length) {
    nodos.push({ idNodo: ID_NODO_APOYOS, etiqueta: 'Reacciones en apoyos', hoja: [], resultados: apoyos });
  }
  for (const k of obra.calculos) {
    nodos.push({
      idNodo: idNodoDeCalculo(k.id),
      etiqueta: k.nombre,
      hoja: k.hoja,
      ...(k.frontera ? { frontera: k.frontera } : {}),
    });
  }
  return nodos;
}

/**
 * Los nombres que un nodo pone a disposición de los demás.
 *
 * Los de un cálculo con frontera salen de `publica`, que es del documento y no
 * del módulo descargado: así la lista no cambia cuando termina la descarga, y el
 * grafo no se reordena solo un segundo después de abrir la obra.
 */
export function defineDe(nodo: NodoObra): string[] {
  if (nodo.resultados) return nodo.resultados.map((r) => r.nombre);
  if (!nodo.frontera) return definicionesDe(nodo.hoja);
  const alias = Object.values(nodo.frontera.publica ?? {}).map((a) => a.trim());
  return [...new Set(alias.filter(Boolean))];
}

/** El texto del que salen los nombres que un nodo toma de los demás. */
export function fuentesDeUso(nodo: NodoObra): string[] {
  // Un nodo de resultados no lee nada de la obra: lo suyo viene del modelo.
  if (nodo.resultados) return [];
  // De un cálculo con frontera, las expresiones de sus campos atados: son la
  // única vía por la que la obra entra en él.
  // En una vista, solo las de los componentes presentes: la atadura de un campo de
  // la silla se conserva en una base sin silla, pero no lee nada ni tira flecha.
  const f = nodo.frontera;
  if (f?.procedencia === 'vista') {
    const def = f.vista ? VISTAS[f.vista] : undefined;
    if (!def) return [];
    return camposActivos(def, configCompleta(def, f.config)).flatMap((c) => f.formulas?.[c.nombre] ?? []);
  }
  if (f) return Object.values(f.formulas ?? {});
  // De una hoja libre, las fórmulas y los gráficos (`usosDeRegion`). Un bloque
  // de texto es prosa: escribir «el área de planta se midió en terreno» con
  // `area` definida en otro nodo dibujaba una flecha que no existe y, si la otra
  // dirección ya estaba, fabricaba un ciclo — dos nodos en rojo por una palabra
  // de un párrafo.
  return nodo.hoja.flatMap(usosDeRegion);
}

/**
 * Los nombres que el motor declaró indefinidos en un mensaje de error
 * (`nombresSinDefinir`, junto a los mensajes que los redactan).
 *
 * Es la única señal fiable de «este nombre no está». No se puede listar «lo que
 * el nodo usa y nadie define» porque `usos` filtra por `duenio` a propósito: sin
 * ese filtro, media biblioteca de math.js —`sqrt`, `kN`, `pi`— pasaría por
 * dependencia rota. El motor, en cambio, ya resolvió funciones y unidades cuando
 * se queja.
 */
const simbolosIndefinidos = nombresSinDefinir;

/**
 * Orden topológico de los nodos. Kahn: lo que no queda en la salida es
 * exactamente lo que está en un ciclo.
 */
function ordenar(
  nodos: NodoObra[],
  usos: Map<string, Set<string>>,
  duenio: Map<string, string>,
): { orden: NodoObra[]; enCiclo: Set<string> } {
  const porId = new Map(nodos.map((h) => [h.idNodo, h]));
  const pendientes = new Map<string, Set<string>>();
  const consumidores = new Map<string, string[]>();

  for (const h of nodos) {
    const antes = new Set<string>();
    for (const n of usos.get(h.idNodo) ?? []) {
      const d = duenio.get(n);
      if (d && d !== h.idNodo && porId.has(d)) antes.add(d);
    }
    pendientes.set(h.idNodo, antes);
    for (const a of antes) {
      const lista = consumidores.get(a);
      if (lista) lista.push(h.idNodo);
      else consumidores.set(a, [h.idNodo]);
    }
  }

  // Entre los que ya se pueden calcular manda el ORDEN DE CREACIÓN, no el orden
  // en que quedaron libres. No es un capricho de estabilidad: ese orden es el de
  // lectura de la hoja global, y de él sale lo que el autocompletado ofrece en
  // cada nodo. Con una cola FIFO, un nodo creado al final pero sin dependencias
  // se colaba delante de una planilla que sí las tenía, y entonces no veía lo
  // que esa planilla publica — justo cuando lo que se está haciendo es
  // escribirlo. Había que saberse el nombre de memoria y teclearlo entero para
  // que el reordenamiento lo pusiera a la vista.
  const creacion = new Map(nodos.map((h, i) => [h.idNodo, i]));
  const libres = nodos.filter((h) => pendientes.get(h.idNodo)!.size === 0).map((h) => h.idNodo);
  const porCreacion = (a: string, b: string) => creacion.get(a)! - creacion.get(b)!;
  libres.sort(porCreacion);

  const orden: NodoObra[] = [];
  while (libres.length) {
    const id = libres.shift()!;
    orden.push(porId.get(id)!);
    const nuevos: string[] = [];
    for (const c of consumidores.get(id) ?? []) {
      const p = pendientes.get(c)!;
      p.delete(id);
      if (p.size === 0) nuevos.push(c);
    }
    if (nuevos.length) {
      libres.push(...nuevos);
      libres.sort(porCreacion);
    }
  }

  const colocados = new Set(orden.map((h) => h.idNodo));
  const enCiclo = new Set(nodos.filter((h) => !colocados.has(h.idNodo)).map((h) => h.idNodo));
  // Los del ciclo van al final: no hay orden que los salve, pero evaluarlos deja
  // que el motor diga qué nombre concreto le faltó a cada uno.
  for (const h of nodos) if (enCiclo.has(h.idNodo)) orden.push(h);

  return { orden, enCiclo };
}

/**
 * Una hoja con frontera, evaluada en SU PROPIO scope.
 *
 * Es `evaluarModulo` sin `construirHoja`: mismo centinela `image` al pie para
 * capturar el scope final, misma cuenta. Lo usan las procedencias `propia` y
 * `derivada`, que llevan sus regiones en el documento y no instancian nada.
 *
 * LO QUE ENTRA DESDE LA OBRA SON LOS CAMPOS ATADOS, Y ENTRAN COMO SCOPE INICIAL,
 * no como regiones reescritas. Reescribirlas obligaría a formatear un `Unit` de
 * vuelta a texto y volver a parsearlo, que es donde se pierden la cifra y la
 * unidad.
 *
 * Y NO CONVIERTE A NINGUNA UNIDAD, al revés que un campo atado de una genérica:
 * aquel va a un formulario de números con una unidad declarada; una hoja propia
 * no declara nada, así que el valor cruza como el `Unit` que es — igual que ya
 * cruza un alias publicado.
 */
export function evaluarHojaConFrontera(
  hoja: readonly Region[],
  frontera: Frontera,
  scopeObra: Record<string, unknown>,
): { results: SheetResults; scope: Record<string, unknown>; inicial: Record<string, unknown> } {
  const orden = ordenDeLectura(hoja);
  const inicial = valoresAtados(frontera, scopeObra);
  const yFinal = (orden[orden.length - 1]?.y ?? 0) + 1e6;
  const centinela: Region = { id: CENTINELA, kind: 'image', x: 0, y: yFinal, src: '' };
  const res = evaluateSheet([...orden, centinela], inicial);
  const scope = res[CENTINELA]?.scope ?? {};
  delete res[CENTINELA];
  return { results: res, scope, inicial };
}

/**
 * Los campos atados, resueltos contra el scope de la obra.
 *
 * SOLO ESTO ENTRA. Pasarle el scope de la obra entero a la hoja sería dejar la
 * frontera abierta en la otra dirección: un nombre que la hoja no defina se
 * resolvería en silencio con el de la obra, y el número saldría plausible y
 * equivocado.
 *
 * Se resuelven todos en UNA hoja mínima con el mismo centinela, y no uno a uno:
 * es una pasada de math.js en vez de una por campo, y los valores cruzan como el
 * objeto `Unit` que son.
 */
function valoresAtados(
  frontera: Frontera,
  scopeObra: Record<string, unknown>,
): Record<string, unknown> {
  const campos = Object.entries(frontera.formulas ?? {}).filter(([, e]) => e.trim());
  if (!campos.length) return {};
  const hoja: Region[] = campos.map(([campo, expr], i) => ({
    id: `__at:${campo}`,
    kind: 'math',
    x: 0,
    y: i,
    src: `${campo} := ${expr}`,
  }));
  const centinela: Region = { id: CENTINELA, kind: 'image', x: 0, y: 1e6, src: '' };
  const res = evaluateSheet([...hoja, centinela], scopeObra);
  const suelto = res[CENTINELA]?.scope ?? {};
  // Solo los campos: el resto del scope de la obra se queda fuera.
  const inicial: Record<string, unknown> = {};
  for (const [campo] of campos) {
    if (suelto[campo] !== undefined) inicial[campo] = suelto[campo];
  }
  return inicial;
}

/**
 * Los valores de un nodo de resultados, como el objeto `Unit` que son.
 *
 * Llegan como texto (`0.714927123 s`) y se evalúan en UNA hoja mínima, igual que
 * los campos atados: así los arma la misma instancia de math.js que evalúa la
 * obra, y no un `Unit` de otra que el scope no sabría operar. Sin scope de la
 * obra: un nodo de resultados no lee nada de ella.
 */
function valoresPublicados(resultados: readonly Publicado[]): Record<string, unknown> {
  const hoja: Region[] = resultados.map((r, i) => ({
    id: `__pub:${r.nombre}`,
    kind: 'math',
    x: 0,
    y: i,
    src: `${r.nombre} := ${r.expr}`,
  }));
  const centinela: Region = { id: CENTINELA, kind: 'image', x: 0, y: 1e6, src: '' };
  return evaluateSheet([...hoja, centinela], {})[CENTINELA]?.scope ?? {};
}

export function evaluarObra(obra: Obra, genericas: Genericas = {}): EvaluacionObra {
  const nodos = nodosDeLaObra(obra);

  // ── Quién define qué ───────────────────────────────────────────────────────
  const define = new Map<string, string[]>();
  const porNombre = new Map<string, string[]>();
  for (const h of nodos) {
    const nombres = defineDe(h);
    define.set(h.idNodo, nombres);
    for (const n of nombres) {
      const lista = porNombre.get(n);
      if (lista) lista.push(h.idNodo);
      else porNombre.set(n, [h.idNodo]);
    }
  }

  const duenio = new Map<string, string>();
  const repetidos = new Map<string, string[]>();
  for (const [nombre, ids] of porNombre) {
    if (ids.length === 1) duenio.set(nombre, ids[0]);
    else repetidos.set(nombre, ids);
  }

  // ── Quién usa qué ──────────────────────────────────────────────────────────
  // Solo se miran los identificadores que ALGÚN nodo define: así un nombre de
  // función (`sqrt`) o una unidad (`kN`) no se confunde nunca con una
  // dependencia, sin tener que analizar la expresión.
  const usos = new Map<string, Set<string>>();
  for (const h of nodos) {
    const mios = new Set(define.get(h.idNodo) ?? []);
    const usa = new Set<string>();
    for (const src of fuentesDeUso(h)) {
      for (const id of simbolosDeFormula(src)) {
        const d = duenio.get(id);
        if (d && d !== h.idNodo && !mios.has(id)) usa.add(id);
      }
    }
    usos.set(h.idNodo, usa);
  }

  const { orden, enCiclo } = ordenar(nodos, usos, duenio);

  const atadosTapados = new Map<string, string>();
  for (const h of nodos) {
    const c = campoAtadoTapado(h);
    if (c) atadosTapados.set(h.idNodo, c);
  }

  // ── La cadena, tramo a tramo ───────────────────────────────────────────────
  const regions: Region[] = [];
  const results: SheetResults = {};
  const importadas = new Map<string, Instanciada>();
  const scopeEnNodo = new Map<string, Record<string, unknown>>();
  let scope: Record<string, unknown> = {};
  let y = 0;

  /** Evalúa las hojas libres acumuladas y deja su scope disponible. */
  const cerrarTramo = (tramo: Region[]) => {
    if (tramo.length === 0) return;
    // El centinela es una región `image`: el motor la registra sin evaluarla y
    // captura el scope visible en su posición. Va muy abajo para caer la última
    // del tramo, y no se devuelve — no es parte de ninguna hoja.
    const centinela: Region = { id: CENTINELA, kind: 'image', x: 0, y: y + 1e6, src: '' };
    const res = evaluateSheet([...tramo, centinela], scope);
    scope = res[CENTINELA]?.scope ?? scope;
    delete res[CENTINELA];
    // Y los de posición, uno por nodo del tramo: cada uno se lleva el scope que
    // había justo encima de su hoja.
    for (const r of tramo) {
      if (!r.id.startsWith(POSICION)) continue;
      scopeEnNodo.set(r.id.slice(POSICION.length), res[r.id]?.scope ?? {});
      delete res[r.id];
    }
    Object.assign(results, res);
  };

  /** El tramo sin los centinelas: no son de ninguna hoja y nadie los pinta. */
  const sinCentinelas = (tramo: Region[]) => tramo.filter((r) => !r.id.startsWith(POSICION));

  /**
   * Un nombre que cruza una frontera: entra en el scope y deja una región
   * fantasma, para que el autocompletado de los nodos de aguas abajo lo ofrezca.
   * Sin esto, la única forma de encontrar lo que publica un nodo sería saberlo de
   * memoria: `variablesVisibles` lee lo que cada región DEFINE, y las de una
   * planilla no están en esta hoja —las de un nodo de resultados, ni existen—.
   */
  const publicar = (nodo: NodoObra, nombre: string, v: unknown) => {
    scope = { ...scope, [nombre]: v };
    y += PASO;
    const id = `pub:${nodo.idNodo}:${nombre}`;
    regions.push({ id, kind: 'text', x: 0, y, src: `${nombre} · ${nodo.etiqueta}` });
    results[id] = { define: { nombre, valor: formatValor(v) } };
  };

  let tramo: Region[] = [];
  for (const nodo of orden) {
    if (nodo.resultados) {
      // Corta el tramo como una planilla: lo que publica tiene que estar en el
      // scope antes de que lo lea el nodo siguiente.
      cerrarTramo(tramo);
      regions.push(...sinCentinelas(tramo));
      tramo = [];
      const valores = valoresPublicados(nodo.resultados);
      for (const { nombre } of nodo.resultados) {
        if (valores[nombre] !== undefined) publicar(nodo, nombre, valores[nombre]);
      }
      continue;
    }
    if (!nodo.frontera) {
      // RE-ESTAMPADO. Las regiones traen sus propias coordenadas, y todos los
      // nodos empiezan en `y = 40`: concatenarlas tal cual interleaveríaa las
      // hojas y rompería el orden topológico, que ES el orden de lectura. Se
      // reubica cada hoja debajo de la anterior conservando su forma interna, y
      // se conserva la `x`, y con ella una segunda columna que el autor haya
      // abierto en el canvas.
      const propias = ordenDeLectura(nodo.hoja);
      const minY = propias[0]?.y ?? 0;
      const maxY = propias[propias.length - 1]?.y ?? 0;
      // El paso va ANTES de emitir, no después: así la primera región de este
      // nodo queda estrictamente por debajo de lo último que se emitió —una
      // región fantasma de lo que publicó el nodo anterior— y no empatada con
      // ella. Con el empate, el desempate lo decidía la `x`, que es la del papel
      // y no dice nada del orden entre nodos.
      y += PASO;
      const base = y;
      // El centinela de posición va justo por encima de la primera región del
      // nodo, con `x` negativa para ganar también el desempate.
      tramo.push({ id: POSICION + nodo.idNodo, kind: 'image', x: -1, y: base - 1, src: '' });
      for (const r of propias) tramo.push({ ...r, y: base + (r.y - minY) });
      y = base + (maxY - minY);
      continue;
    }

    // Un cálculo con frontera corta el tramo: lo que publica tiene que estar en
    // el scope antes de que lo lea el nodo siguiente.
    cerrarTramo(tramo);
    regions.push(...sinCentinelas(tramo));
    tramo = [];

    const instancia = evaluarConFrontera(nodo, genericas, scope, results);
    if (!instancia) continue;
    importadas.set(nodo.idNodo, instancia);
    scopeEnNodo.set(nodo.idNodo, instancia.inicial);

    for (const [salida, alias] of Object.entries(nodo.frontera.publica ?? {})) {
      const v = instancia.salidas[salida];
      if (v === undefined) continue;
      publicar(nodo, alias.trim(), v);
    }
  }
  cerrarTramo(tramo);
  regions.push(...sinCentinelas(tramo));

  // ── Los nombres que se pidieron y no estaban ───────────────────────────────
  const nombresRotos = new Map<string, string[]>();
  for (const h of nodos) {
    const rotos = new Set<string>();
    for (const r of h.hoja) {
      // Con los de las celdas de una tabla, que no tienen id propio.
      for (const e of erroresDeResultado(results[r.id])) for (const n of simbolosIndefinidos(e)) rotos.add(n);
    }
    // Una de la biblioteca tiene la hoja vacía: sus errores viven en la
    // evaluación del módulo, no en `results` por id de bloque.
    for (const { error } of importadas.get(h.idNodo)?.ev?.errores ?? []) {
      for (const n of simbolosIndefinidos(error)) rotos.add(n);
    }
    for (const { error } of importadas.get(h.idNodo)?.vista?.errores ?? []) {
      for (const n of simbolosIndefinidos(error)) rotos.add(n);
    }
    // Lo que el propio nodo define NO está roto, aunque el motor se queje de
    // ello: una definición que falla se retira del scope, así que las líneas de
    // más abajo que la nombran fallan en cascada. El nombre a señalar es el
    // primero, el que de verdad falta, no los diez que se cayeron detrás.
    for (const n of define.get(h.idNodo) ?? []) rotos.delete(n);
    if (rotos.size > 0) nombresRotos.set(h.idNodo, [...rotos]);
  }

  return {
    results,
    regions,
    scope,
    duenio,
    repetidos,
    usos,
    etiquetas: new Map(nodos.map((h) => [h.idNodo, h.etiqueta])),
    define,
    enCiclo,
    atadosTapados,
    nombresRotos,
    scopeEnNodo,
    importadas,
  };
}

/**
 * Evalúa un nodo con frontera en su propio scope, según su procedencia.
 *
 * SUS `results` SÍ SE MEZCLAN EN LOS DE LA OBRA; SUS `regions` NO ENTRAN EN LAS
 * DE LA OBRA. Es la asimetría que hace todo el trabajo: los resultados hacen
 * falta para pintar cada bloque en su panel y en su pestaña —las claves son
 * únicas dentro de la obra, que es lo que garantiza el saneo—, y dejar las
 * regiones fuera es lo que impide que `variablesVisibles` ofrezca los más de 300
 * nombres de `pedestal-generico` al autocompletado de los nodos de aguas abajo.
 * Lo que cruza son las regiones fantasma `pub:<idNodo>:<alias>`.
 */
function evaluarConFrontera(
  nodo: NodoObra,
  genericas: Genericas,
  scope: Record<string, unknown>,
  results: SheetResults,
): Instanciada | null {
  const f = nodo.frontera!;
  if (f.procedencia === 'biblioteca') {
    const estado = f.slug ? genericas[f.slug] : undefined;
    // Todavía descargando, o no se pudo: nada de evaluación parcial. El nodo lo
    // dice en su tarjeta y la obra sigue.
    if (estado?.fase !== 'lista') return null;
    const ev = evaluarImportada(estado.modulo, { ...f, slug: f.slug!, sha256: f.sha256 ?? '', entradas: f.entradas ?? {} }, scope);
    // Una de la biblioteca se instancia desde su formulario: sus regiones `in_*`
    // se reescriben con los valores, así que su hoja no necesita scope inicial.
    return { salidas: ev.scope, scope, inicial: {}, ev };
  }
  if (f.procedencia === 'vista') {
    // Una vista que el registro no conoce (de una versión más nueva de Flow, o
    // retirada) no evalúa: la tarjeta lo dice y la obra sigue.
    const vista = evaluarVista(f, scope, nodo.idNodo);
    if (!vista) return null;
    Object.assign(results, vista.results);
    return { salidas: vista.salidas, scope, inicial: {}, vista };
  }
  const { results: propios, scope: suyo, inicial } = evaluarHojaConFrontera(nodo.hoja, f, scope);
  Object.assign(results, propios);
  return { salidas: suyo, scope, inicial };
}

/**
 * Lo que le pasa a un nodo por cómo encaja con los demás, o cadena vacía.
 *
 * Es la parte del diagnóstico que NO sale del motor: el motor solo ve una hoja y
 * dice «variable indefinida». Que la razón sea un nombre repetido en dos nodos o
 * un ciclo entre ellos es del grafo, y solo se puede decir desde aquí.
 */
export function problemaDeGrafo(idNodo: string, ev: EvaluacionObra): string {
  if (ev.enCiclo.has(idNodo)) {
    return 'Este nodo y otro se citan en círculo: no hay orden en el que calcular los dos.';
  }
  const mios = ev.define.get(idNodo) ?? [];
  const choque = mios.find((n) => ev.repetidos.has(n));
  if (choque) {
    const cuantos = ev.repetidos.get(choque)!.length;
    return (
      `«${choque}» está definida en ${cuantos} nodos: cuál vale depende de un orden que ` +
      'calcula el canvas, no tú. Renómbrala en uno de ellos.'
    );
  }
  // Un nombre que este nodo pide y no existe. Va DESPUÉS del choque propio y
  // antes del atado tapado: si este nodo define dos veces algo, eso es lo que
  // hay que arreglar primero, y lo de abajo se resuelve solo.
  const rotos = ev.nombresRotos.get(idNodo) ?? [];
  if (rotos.length > 0) {
    const [n] = rotos;
    const yMas = rotos.length > 1 ? ` (y ${rotos.length - 1} más)` : '';
    // TRES causas que hasta aquí se veían igual, con un «Undefined symbol» en
    // inglés que no decía de dónde venía el nombre. La respuesta útil es
    // distinta en cada una, y en la primera es ir a OTRO nodo.
    const duenio = ev.duenio.get(n);
    if (duenio) {
      const quien = ev.etiquetas.get(duenio) ?? duenio;
      return (
        `«${n}»${yMas} la define «${quien}», pero ahí no llegó a dar valor. ` +
        'Arregla ese nodo y este se arregla solo.'
      );
    }
    const cuantos = ev.repetidos.get(n)?.length;
    if (cuantos) {
      return (
        `«${n}»${yMas} la definen ${cuantos} nodos, así que ninguno es su dueño y aquí llega ` +
        'sin valor. Renómbrala en todos menos uno.'
      );
    }
    return (
      `Ningún nodo de la obra define «${n}»${yMas}. Si venía de un cálculo que quitaste, ` +
      'deshaz el borrado con Ctrl+Z.'
    );
  }
  const tapado = ev.atadosTapados.get(idNodo);
  if (tapado) {
    return (
      `«${tapado}» entra atado desde la obra y la propia hoja lo vuelve a definir: la línea ` +
      'de la hoja gana y el campo atado no tiene ningún efecto. Borra una de las dos.'
    );
  }
  return '';
}

/** Las etiquetas de los nodos que usan algo de lo que define `idNodo`. */
export function consumidoresDe(idNodo: string, ev: EvaluacionObra): string[] {
  return [...ev.usos]
    .filter(([, nombres]) => [...nombres].some((n) => ev.duenio.get(n) === idNodo))
    .map(([id]) => ev.etiquetas.get(id) ?? id);
}

/**
 * Qué nodos se quedan sin qué nombres si estos desaparecen.
 *
 * Se pregunta ANTES de aplicar el borrado, que es el único momento en que la
 * respuesta existe: una flecha no se guarda, ES la entrada de `duenio`, así que
 * en cuanto el nodo se va nadie puede decir de dónde venía el nombre que falta.
 * Después solo queda un «Undefined symbol» sin remitente.
 *
 * Devuelve ya las ETIQUETAS y no los ids: quien lo llama arma una frase.
 */
export function rupturaPorQuitar(
  idsNodo: readonly string[],
  ev: EvaluacionObra,
): { nodo: string; nombres: string[] }[] {
  const fuera = new Set(idsNodo);
  const rota: { nodo: string; nombres: string[] }[] = [];
  for (const [consumidor, nombres] of ev.usos) {
    // Un nodo que también se va no «se queda» sin nada: borrar varios nodos de
    // una vez puede llevarse a los que se citan entre ellos.
    if (fuera.has(consumidor)) continue;
    const perdidos = [...nombres].filter((n) => {
      const d = ev.duenio.get(n);
      return d !== undefined && fuera.has(d);
    });
    if (perdidos.length > 0) {
      rota.push({ nodo: ev.etiquetas.get(consumidor) ?? consumidor, nombres: perdidos });
    }
  }
  return rota;
}

/**
 * Un campo atado que la propia hoja vuelve a definir, o `undefined`.
 *
 * El valor atado entra como scope inicial y la región lo pisa después, así que
 * el campo no tiene efecto — y nada lo diría: el número sale bien, solo que es
 * el otro. Es la primera clase de falla: resultado plausible y falso.
 *
 * Solo aplica a `propia` y `derivada`. En una de `biblioteca` un campo atado
 * reescribe la región `in_*` que lo declara, así que no hay nada que tapar.
 */
function campoAtadoTapado(nodo: NodoObra): string | undefined {
  const f = nodo.frontera;
  if (!f || f.procedencia === 'biblioteca' || f.procedencia === 'vista') return undefined;
  const atados = Object.keys(f.formulas ?? {});
  if (!atados.length) return undefined;
  const definidos = new Set(definicionesDe(nodo.hoja));
  return atados.find((c) => definidos.has(c));
}
