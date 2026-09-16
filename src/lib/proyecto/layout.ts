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

import type { NodoGrafo } from './contrato';

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
  ['accion'],
  ['carga'],
  ['familia-combinacion'],
  ['modelo'],
  ['hoja-de-valores', 'planilla'],
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
 * Coloca por columnas, centrando cada una respecto de la más alta. Sin centrar,
 * una columna de 27 cargas junto a una de 2 documentos deja el documento pegado
 * al borde superior y aparentemente desconectado de todo.
 */
export function colocar(nodos: NodoGrafo[]): Record<string, Posicion> {
  const porColumna = new Map<number, NodoGrafo[]>();
  for (const n of nodos) {
    const c = columnaDe(n.tipo);
    const lista = porColumna.get(c) ?? [];
    lista.push(n);
    porColumna.set(c, lista);
  }

  const alto = Math.max(1, ...[...porColumna.values()].map((l) => l.length));
  const centro = ((alto - 1) * PASO_Y) / 2;

  const salida: Record<string, Posicion> = {};
  for (const [c, lista] of porColumna) {
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
