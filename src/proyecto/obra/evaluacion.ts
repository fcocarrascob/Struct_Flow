// ─────────────────────────────────────────────────────────────────────────────
// La obra entera como UNA sola hoja.
//
// Antes cada carga evaluaba la suya, y por eso una partida no podía usar lo que
// definía otra de otra carga. Ahora todas las hojas libres de la obra —las de
// las partidas y las de los nodos de cálculo— se concatenan en una hoja única y
// se le pasan al mismo `evaluateSheet` de siempre. Con eso el espacio de nombres
// es compartido sin inventar ningún mecanismo: es el scope de una hoja, que es
// exactamente lo que el motor ya sabe hacer.
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
// DOS FALLAS QUE ESTE MODELO TRAE, Y HAY QUE NOMBRARLAS
// -----------------------------------------------------
//   - **Un nombre definido en dos nodos** no se puede resolver: cuál gana
//     dependería del orden, y el orden lo calculamos nosotros. Los dos nodos
//     salen en rojo y el nombre no se usa.
//   - **Un ciclo** (A usa algo de B y B algo de A) no tiene orden posible. Los
//     nodos del ciclo salen en rojo y se evalúan al final, donde el motor dirá
//     por su cuenta que la variable no está definida.
// ─────────────────────────────────────────────────────────────────────────────

import { evaluateSheet, parseMathRegion, type Region, type SheetResults } from '../../lib/worksheet';
import { identificadoresDe, type Bloque, type HojaDeNodo, type Obra } from './modelo';
import { idNodoDeCalculo, idNodoDeSubcarga } from './ids';

const CENTINELA = '__scope_final';

/** Separación entre bloques al sintetizar la hoja. Cualquier paso creciente
 *  sirve para el orden; este deja sitio de sobra entre nodos. */
const PASO = 100;

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
  /** id de nodo → nombres que define, en orden. */
  define: Map<string, string[]>;
  /** Nodos que no tienen orden posible porque se citan en círculo. */
  enCiclo: Set<string>;
}

/** Las hojas libres de la obra. Un nodo con planilla importada no aporta
 *  ninguna: su cálculo es otra hoja, con su propio scope. */
export function hojasDeLaObra(obra: Obra): HojaDeNodo[] {
  const hojas: HojaDeNodo[] = [];
  for (const k of obra.calculos) {
    if (!k.importada) {
      hojas.push({ idNodo: idNodoDeCalculo(k.id), etiqueta: k.nombre, bloques: k.bloques });
    }
  }
  for (const c of obra.cargas) {
    for (const s of c.subcargas) {
      if (!s.importada) {
        hojas.push({ idNodo: idNodoDeSubcarga(s.id), etiqueta: s.nombre, bloques: s.bloques });
      }
    }
  }
  return hojas;
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
 * Orden topológico de las hojas. Kahn: lo que no queda en la salida es
 * exactamente lo que está en un ciclo.
 */
function ordenar(
  hojas: HojaDeNodo[],
  usos: Map<string, Set<string>>,
  duenio: Map<string, string>,
): { orden: HojaDeNodo[]; enCiclo: Set<string> } {
  const porId = new Map(hojas.map((h) => [h.idNodo, h]));
  const pendientes = new Map<string, Set<string>>();
  const consumidores = new Map<string, string[]>();

  for (const h of hojas) {
    const antes = new Set<string>();
    for (const n of usos.get(h.idNodo) ?? []) {
      const d = duenio.get(n);
      if (d && d !== h.idNodo && porId.has(d)) antes.add(d);
    }
    pendientes.set(h.idNodo, antes);
    for (const a of antes) consumidores.set(a, [...(consumidores.get(a) ?? []), h.idNodo]);
  }

  // Sin dependencias, el orden es el de creación: estable y predecible.
  const cola = hojas.filter((h) => pendientes.get(h.idNodo)!.size === 0).map((h) => h.idNodo);
  const orden: HojaDeNodo[] = [];
  while (cola.length) {
    const id = cola.shift()!;
    orden.push(porId.get(id)!);
    for (const c of consumidores.get(id) ?? []) {
      const p = pendientes.get(c)!;
      p.delete(id);
      if (p.size === 0) cola.push(c);
    }
  }

  const colocados = new Set(orden.map((h) => h.idNodo));
  const enCiclo = new Set(hojas.filter((h) => !colocados.has(h.idNodo)).map((h) => h.idNodo));
  // Los del ciclo van al final: no hay orden que los salve, pero evaluarlos deja
  // que el motor diga qué nombre concreto le faltó a cada uno.
  for (const h of hojas) if (enCiclo.has(h.idNodo)) orden.push(h);

  return { orden, enCiclo };
}

export function evaluarObra(obra: Obra): EvaluacionObra {
  const hojas = hojasDeLaObra(obra);

  // ── Quién define qué ───────────────────────────────────────────────────────
  const define = new Map<string, string[]>();
  const porNombre = new Map<string, string[]>();
  for (const h of hojas) {
    const nombres = definicionesDe(h.bloques);
    define.set(h.idNodo, nombres);
    for (const n of nombres) porNombre.set(n, [...(porNombre.get(n) ?? []), h.idNodo]);
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
  for (const h of hojas) {
    const mios = new Set(define.get(h.idNodo) ?? []);
    const usa = new Set<string>();
    for (const b of h.bloques) {
      // Solo las fórmulas, igual que `definicionesDe`. Un bloque de texto es
      // prosa: escribir «el área de planta se midió en terreno» con `area`
      // definida en otro nodo dibujaba una flecha que no existe y, si la otra
      // dirección ya estaba, fabricaba un ciclo — dos nodos en rojo diciendo
      // que se citan en círculo, por una palabra de un párrafo.
      if (b.tipo !== 'math') continue;
      for (const id of identificadoresDe(b.src)) {
        const d = duenio.get(id);
        if (d && d !== h.idNodo && !mios.has(id)) usa.add(id);
      }
    }
    usos.set(h.idNodo, usa);
  }

  const { orden, enCiclo } = ordenar(hojas, usos, duenio);

  // ── La hoja global ─────────────────────────────────────────────────────────
  const regions: Region[] = [];
  for (const h of orden) {
    for (const b of h.bloques) {
      regions.push({ id: b.id, kind: b.tipo, x: 0, y: regions.length * PASO, src: b.src });
    }
  }
  const fondo = regions.reduce((max, r) => Math.max(max, r.y), 0);
  const centinela: Region = { id: CENTINELA, kind: 'image', x: 0, y: fondo + 1e6, src: '' };

  const results = evaluateSheet([...regions, centinela]);
  const scope = results[CENTINELA]?.scope ?? {};
  delete results[CENTINELA];

  return { results, regions, scope, duenio, repetidos, usos, define, enCiclo };
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
