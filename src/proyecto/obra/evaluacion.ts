// ─────────────────────────────────────────────────────────────────────────────
// La obra entera como UNA sola cadena de cálculo.
//
// Antes cada carga evaluaba su hoja, y por eso una partida no podía usar lo que
// definía otra. Después todas las hojas libres de la obra pasaron a
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
//   - Una **hoja libre** define lo que sus fórmulas definen, y usa los nombres
//     que nombra en ellas. Sus bloques entran en la hoja global.
//   - Una **planilla importada** es otra hoja, con su propio scope, y no entra:
//     define los ALIAS que su `publica` declara y usa los nombres que aparecen
//     en las expresiones de sus campos atados. Sus 120 a 324 regiones se quedan
//     donde están; lo único que cruza la frontera son los valores que publica,
//     y cruzan como el objeto `Unit` que son.
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
  evaluateSheet,
  formatValor,
  parseMathRegion,
  type Region,
  type SheetResults,
} from '../../lib/worksheet';
import type { EvaluacionModulo } from '../../lib/diseno/evaluar';
import { evaluarImportada, type Genericas } from './biblioteca';
import { identificadoresDe, type Bloque, type Importada, type Obra } from './modelo';
import { idNodoDeCalculo, idNodoDeSubcarga } from './ids';

const CENTINELA = '__scope_final';

/** Separación entre bloques al sintetizar la hoja. Cualquier paso creciente
 *  sirve para el orden; este deja sitio de sobra entre nodos. */
const PASO = 100;

/** Un nodo de la obra que participa del grafo de cálculo. */
export interface NodoObra {
  /** El id del NODO del canvas: `partida:xxx`, `calculo:xxx`. */
  idNodo: string;
  etiqueta: string;
  /** Su hoja libre. Vacía si el nodo está respaldado por una planilla. */
  bloques: Bloque[];
  importada?: Importada;
}

/** Lo que una planilla importada produjo, en su sitio del orden de lectura. */
export interface Instanciada {
  ev: EvaluacionModulo;
  /**
   * El scope de la obra **visible en la posición de este nodo**, que es contra
   * el que se resuelven sus campos atados. No es el final de la obra: una
   * planilla no puede alimentarse de lo que se calcula debajo de ella.
   */
  scope: Record<string, unknown>;
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
  /** id de nodo → nombres que define (o publica, si es una planilla), en orden. */
  define: Map<string, string[]>;
  /** Nodos que no tienen orden posible porque se citan en círculo. */
  enCiclo: Set<string>;
  /** id de nodo → lo que su planilla produjo. Una sola evaluación por nodo, que
   *  es lo que impide que el canvas y el panel enseñen números distintos. */
  importadas: Map<string, Instanciada>;
}

/** Todos los nodos de cálculo de la obra, con hoja libre o con planilla. */
export function nodosDeLaObra(obra: Obra): NodoObra[] {
  const nodos: NodoObra[] = [];
  for (const k of obra.calculos) {
    nodos.push({
      idNodo: idNodoDeCalculo(k.id),
      etiqueta: k.nombre,
      bloques: k.bloques,
      ...(k.importada ? { importada: k.importada } : {}),
    });
  }
  for (const c of obra.cargas) {
    for (const s of c.subcargas) {
      nodos.push({
        idNodo: idNodoDeSubcarga(s.id),
        etiqueta: s.nombre,
        bloques: s.bloques,
        ...(s.importada ? { importada: s.importada } : {}),
      });
    }
  }
  return nodos;
}

function definicionesDe(bloques: Bloque[]): string[] {
  const nombres: string[] = [];
  for (const b of bloques) {
    if (b.tipo !== 'math') continue;
    // `parseMathRegion` es la MISMA función con la que el motor decide si una
    // región define algo. Detectar el `:=` por nuestra cuenta sería una segunda
    // gramática, y bastaría un caso raro para que discreparan.
    const v = parseMathRegion(b.src).varName;
    if (v && !nombres.includes(v)) nombres.push(v);
  }
  return nombres;
}

/**
 * Los nombres que un nodo pone a disposición de los demás.
 *
 * Los de una planilla salen de `publica`, que es del documento y no del módulo:
 * así la lista no cambia cuando termina la descarga, y el grafo no se reordena
 * solo un segundo después de abrir la obra.
 */
function defineDe(nodo: NodoObra): string[] {
  if (!nodo.importada) return definicionesDe(nodo.bloques);
  const alias = Object.values(nodo.importada.publica ?? {}).map((a) => a.trim());
  return [...new Set(alias.filter(Boolean))];
}

/** El texto del que salen los nombres que un nodo toma de los demás. */
function fuentesDeUso(nodo: NodoObra): string[] {
  // De una planilla, las expresiones de sus campos atados: son la única vía por
  // la que la obra entra en ella.
  if (nodo.importada) return Object.values(nodo.importada.formulas ?? {});
  // De una hoja libre, solo las fórmulas. Un bloque de texto es prosa: escribir
  // «el área de planta se midió en terreno» con `area` definida en otro nodo
  // dibujaba una flecha que no existe y, si la otra dirección ya estaba,
  // fabricaba un ciclo — dos nodos en rojo por una palabra de un párrafo.
  return nodo.bloques.filter((b) => b.tipo === 'math').map((b) => b.src);
}

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
      for (const id of identificadoresDe(src)) {
        const d = duenio.get(id);
        if (d && d !== h.idNodo && !mios.has(id)) usa.add(id);
      }
    }
    usos.set(h.idNodo, usa);
  }

  const { orden, enCiclo } = ordenar(nodos, usos, duenio);

  // ── La cadena, tramo a tramo ───────────────────────────────────────────────
  const regions: Region[] = [];
  const results: SheetResults = {};
  const importadas = new Map<string, Instanciada>();
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
    Object.assign(results, res);
  };

  let tramo: Region[] = [];
  for (const nodo of orden) {
    if (!nodo.importada) {
      for (const b of nodo.bloques) {
        y += PASO;
        tramo.push({ id: b.id, kind: b.tipo, x: 0, y, src: b.src });
      }
      continue;
    }

    // Una planilla corta el tramo: lo que publica tiene que estar en el scope
    // antes de que lo lea el nodo siguiente.
    cerrarTramo(tramo);
    regions.push(...tramo);
    tramo = [];

    const estado = genericas[nodo.importada.slug];
    if (estado?.fase !== 'lista') continue;
    const ev = evaluarImportada(estado.modulo, nodo.importada, scope);
    importadas.set(nodo.idNodo, { ev, scope });

    for (const [salida, alias] of Object.entries(nodo.importada.publica ?? {})) {
      const v = ev.scope[salida];
      if (v === undefined) continue;
      scope = { ...scope, [alias.trim()]: v };
      // Una región fantasma por alias, para que el autocompletado de los nodos
      // de aguas abajo lo ofrezca. Sin esto, la única forma de encontrar lo que
      // publica una planilla sería saberlo de memoria: `variablesVisibles` lee
      // lo que cada región DEFINE, y las de una planilla no están en esta hoja.
      y += PASO;
      const id = `pub:${nodo.idNodo}:${alias}`;
      regions.push({ id, kind: 'text', x: 0, y, src: `${alias} · ${nodo.etiqueta}` });
      results[id] = { define: { nombre: alias.trim(), valor: formatValor(v) } };
    }
  }
  cerrarTramo(tramo);
  regions.push(...tramo);

  return { results, regions, scope, duenio, repetidos, usos, define, enCiclo, importadas };
}

/**
 * Lo que le pasa a un nodo por cómo encaja con los demás, o cadena vacía.
 *
 * Es la parte del diagnóstico que NO sale del motor: el motor solo ve una hoja y
 * dice «variable indefinida». Que la razón sea un nombre repetido en dos nodos o
 * un ciclo entre ellos es del grafo, y solo se puede decir desde acá.
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
  return '';
}
