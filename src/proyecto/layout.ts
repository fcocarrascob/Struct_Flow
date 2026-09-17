// ─────────────────────────────────────────────────────────────────────────────
// Dónde va cada nodo cuando nadie lo movió todavía.
//
// Puro, sin React: colocar es aritmética, y el invariante de `src/lib/` es que
// se pueda probar fuera del navegador.
//
// LAS COLUMNAS SON EL FLUJO DEL TRABAJO, NO UN ALFABETO
// ----------------------------------------------------
// De izquierda a derecha se lee el orden en que un proyecto se construye: la
// norma manda sobre la acción, la acción produce cargas, las cargas se combinan,
// el modelo las recibe, de él salen lecturas y respaldos, y al final está el
// documento que los publica. Un canvas ordenado por otra cosa —el tipo, el
// nombre— obliga a reconstruir ese orden en la cabeza cada vez que se abre.
//
// El layout NO ES DATO DEL PROYECTO. Vive en `localStorage` de este navegador y
// no vuelve nunca al harness: si el canvas guardara posiciones en el repo,
// habría dos copias del estado del proyecto y la segunda divergiría sin avisar.
// ─────────────────────────────────────────────────────────────────────────────

import type { AristaGrafo, NodoGrafo } from './contrato';

export interface Posicion {
  x: number;
  y: number;
}

export const ANCHO = 260;
export const ALTO = 96;
const PASO_X = ANCHO + 90;
const PASO_Y = ALTO + 22;

/** Columna por tipo. Un tipo que no esté acá cae al final, visible y no perdido. */
const COLUMNAS: string[][] = [
  ['proyecto'],
  ['norma', 'hueco'],
  // `cargas` (el nodo de definiciones de una obra local) comparte columna con la
  // acción: las dos son el origen de las cargas que vienen a su derecha.
  ['accion', 'cargas'],
  ['carga'],
  // `subcarga` es una partida del desglose de una carga: cuelga de su
  // carga, así que va a su derecha. El harness no emite este tipo.
  ['familia-combinacion', 'subcarga'],
  ['modelo'],
  // `calculo` es un cálculo suelto de una obra local: una genérica de la
  // biblioteca instanciada, que es lo mismo que una planilla del proyecto.
  ['hoja-de-valores', 'planilla', 'calculo'],
  ['lectura'],
  ['documento'],
  ['decision', 'hallazgo'],
];

const COLUMNA_DE = new Map<string, number>(
  COLUMNAS.flatMap((tipos, i) => tipos.map((t) => [t, i] as [string, number])),
);

const ULTIMA = COLUMNAS.length;

export function columnaDe(tipo: string): number {
  return COLUMNA_DE.get(tipo) ?? ULTIMA;
}

/**
 * A qué distancia está cada nodo del principio de la cadena, siguiendo las
 * flechas. Un nodo del que nadie depende está en 0; el que usa lo que produce
 * otro está uno más allá.
 *
 * Es Kahn otra vez, y por la misma razón que en `evaluacion.ts`: lo que no sale
 * de la cola está en un ciclo, y se queda en el nivel que tuviera. Un ciclo ya
 * se pinta en rojo con su motivo; que además descoloque el canvas no agregaría
 * información.
 */
function niveles(nodos: NodoGrafo[], aristas: readonly AristaGrafo[]): Map<string, number> {
  const vivos = new Set(nodos.map((n) => n.id));
  const salientes = new Map<string, string[]>();
  const grado = new Map<string, number>(nodos.map((n) => [n.id, 0]));
  for (const a of aristas) {
    if (!vivos.has(a.desde) || !vivos.has(a.hasta) || a.desde === a.hasta) continue;
    salientes.set(a.desde, [...(salientes.get(a.desde) ?? []), a.hasta]);
    grado.set(a.hasta, (grado.get(a.hasta) ?? 0) + 1);
  }

  const nivel = new Map<string, number>(nodos.map((n) => [n.id, 0]));
  const cola = [...grado].filter(([, g]) => g === 0).map(([id]) => id);
  for (let i = 0; i < cola.length; i++) {
    const id = cola[i];
    for (const s of salientes.get(id) ?? []) {
      nivel.set(s, Math.max(nivel.get(s) ?? 0, (nivel.get(id) ?? 0) + 1));
      const g = (grado.get(s) ?? 0) - 1;
      grado.set(s, g);
      if (g === 0) cola.push(s);
    }
  }
  return nivel;
}

/**
 * Coloca por columnas, centrando cada una respecto de la más alta. Sin centrar,
 * una columna de 27 cargas junto a una de 2 documentos deja el documento pegado
 * al borde superior y aparentemente desconectado de todo.
 *
 * **Con `aristas`, la columna es el tipo MÁS la posición en la cadena.** Sin
 * eso, los nodos del mismo tipo caen todos en la misma columna, así que una
 * cadena de cuatro cálculos encadenados —que es de lo que trata una obra— se
 * dibujaba como una pila vertical con las flechas dando la vuelta por los lados,
 * porque los puertos son fijos: salen por la derecha y entran por la izquierda.
 * Las columnas se compactan después, para que sumar el nivel no deje huecos.
 */
export function colocar(
  nodos: NodoGrafo[],
  aristas?: readonly AristaGrafo[],
): Record<string, Posicion> {
  const nivel = aristas ? niveles(nodos, aristas) : null;
  const porColumna = new Map<number, NodoGrafo[]>();
  for (const n of nodos) {
    const c = columnaDe(n.tipo) + (nivel?.get(n.id) ?? 0);
    const lista = porColumna.get(c) ?? [];
    lista.push(n);
    porColumna.set(c, lista);
  }

  // Compactar: las columnas que quedaron vacías no dejan un hueco de 350 px.
  const usadas = [...porColumna.keys()].sort((a, b) => a - b);
  const compacta = new Map(usadas.map((c, i) => [c, nivel ? i : c]));

  const alto = Math.max(1, ...[...porColumna.values()].map((l) => l.length));
  const centro = ((alto - 1) * PASO_Y) / 2;

  const salida: Record<string, Posicion> = {};
  for (const [columna, lista] of porColumna) {
    const c = compacta.get(columna)!;
    // Dentro de la columna, primero lo que tiene desfase: lo que hay que mirar
    // no puede quedar al fondo de una lista de 27.
    const orden = [...lista].sort((a, b) => {
      const sa = a.severidad === 'error' ? 0 : a.severidad === 'aviso' ? 1 : 2;
      const sb = b.severidad === 'error' ? 0 : b.severidad === 'aviso' ? 1 : 2;
      return sa - sb || a.etiqueta.localeCompare(b.etiqueta);
    });
    const desplazamiento = centro - ((orden.length - 1) * PASO_Y) / 2;
    orden.forEach((n, i) => {
      salida[n.id] = { x: c * PASO_X, y: desplazamiento + i * PASO_Y };
    });
  }
  return salida;
}

// ── Persistencia local ───────────────────────────────────────────────────────

const CLAVE = 'structflow.layout.proyecto.v1';

type Guardado = Record<string, Record<string, Posicion>>;

function leerTodo(): Guardado {
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    return crudo ? (JSON.parse(crudo) as Guardado) : {};
  } catch {
    // Modo privado, almacenamiento bloqueado o JSON corrupto. El canvas tiene
    // que abrir igual: el layout es una comodidad, no un dato.
    return {};
  }
}

export function layoutGuardado(slug: string): Record<string, Posicion> {
  return leerTodo()[slug] ?? {};
}

export function guardarLayout(slug: string, posiciones: Record<string, Posicion>): void {
  try {
    const todo = leerTodo();
    todo[slug] = posiciones;
    window.localStorage.setItem(CLAVE, JSON.stringify(todo));
  } catch {
    /* sin layout persistido se sigue trabajando */
  }
}

export function olvidarLayout(slug: string): void {
  try {
    const todo = leerTodo();
    delete todo[slug];
    window.localStorage.setItem(CLAVE, JSON.stringify(todo));
  } catch {
    /* nada que olvidar */
  }
}
