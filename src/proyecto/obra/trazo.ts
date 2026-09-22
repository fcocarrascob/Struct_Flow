// ─────────────────────────────────────────────────────────────────────────────
// El trazo de un nodo: de qué depende y a quién afecta.
//
// Es la pregunta que se hace al mirar un número de la obra —«si cambio esto,
// ¿qué se mueve?» y «¿de dónde sale?»—, y con 30 nodos y 120 flechas grises no
// se contesta mirando. Se recorre la cadena ENTERA y no solo los vecinos: que el
// espectro alimente a RSX importa, pero lo que se quiere ver es que RSX termina
// en el resumen que va a SAP.
//
// Es presentación pura sobre las aristas ya proyectadas: no toca el documento,
// la evaluación ni el orden de lectura.
// ─────────────────────────────────────────────────────────────────────────────

export interface AristaMinima {
  desde: string;
  hasta: string;
}

export type Lado = 'arriba' | 'abajo';

export interface Trazo {
  foco: string;
  /** Lo que el foco necesita, transitivamente. No incluye al foco. */
  arriba: ReadonlySet<string>;
  /** Lo que depende del foco, transitivamente. No incluye al foco. */
  abajo: ReadonlySet<string>;
  /** Foco, arriba y abajo: lo que no se atenúa. */
  nodos: ReadonlySet<string>;
}

function alcanzables(desde: string, vecinos: Map<string, string[]>): Set<string> {
  const vistos = new Set<string>();
  const pila = [desde];
  while (pila.length) {
    for (const v of vecinos.get(pila.pop()!) ?? []) {
      // `desde` no entra: en un DAG no se vuelve a él, y si hubiera un ciclo
      // (que la obra marca en rojo) el foco no puede estar arriba de sí mismo.
      if (v === desde || vistos.has(v)) continue;
      vistos.add(v);
      pila.push(v);
    }
  }
  return vistos;
}

export function trazoDe(foco: string, aristas: readonly AristaMinima[]): Trazo {
  const salen = new Map<string, string[]>();
  const entran = new Map<string, string[]>();
  for (const a of aristas) {
    salen.set(a.desde, [...(salen.get(a.desde) ?? []), a.hasta]);
    entran.set(a.hasta, [...(entran.get(a.hasta) ?? []), a.desde]);
  }
  const arriba = alcanzables(foco, entran);
  const abajo = alcanzables(foco, salen);
  return { foco, arriba, abajo, nodos: new Set([foco, ...arriba, ...abajo]) };
}

/**
 * De qué lado del foco cae una arista, o `null` si no es parte del trazo.
 *
 * Una arista es del trazo solo si UNE dos eslabones de la misma cadena: que sus
 * dos extremos estén resaltados no basta. Con Geometría arriba del foco y el
 * resumen abajo, una flecha directa de Geometría al resumen no pasa por el foco,
 * y resaltarla diría una dependencia que no es la que se está mirando.
 */
export function ladoDe(a: AristaMinima, t: Trazo): Lado | null {
  const enArriba = (id: string) => id === t.foco || t.arriba.has(id);
  const enAbajo = (id: string) => id === t.foco || t.abajo.has(id);
  if (t.arriba.has(a.desde) && enArriba(a.hasta)) return 'arriba';
  if (enAbajo(a.desde) && t.abajo.has(a.hasta)) return 'abajo';
  return null;
}
