// El orden de lectura de una hoja, en un solo sitio.
//
// Hoy el motor evalúa por posición: `y` ascendente y luego `x`, y ese es el orden
// en que el scope compartido resuelve las variables (ver `evaluateSheet` en
// `worksheet.ts`). La hoja va hacia una lista ordenada sin `x`/`y` (ver
// "Hacia dónde va la hoja" en CLAUDE.md), y cuando llegue el orden será el del
// array. Este helper ya contempla las dos cosas: si toda región trae posición se
// ordena por ella; si alguna no la trae, el orden del array es el orden.
//
// Lo usan el verificador, el render y la biblioteca. `evaluateSheet` conserva su
// propio `sort` hasta la migración, a propósito: cambiarlo es parte de ese
// trabajo y no de este.

export interface Posicionable {
  x?: number;
  y?: number;
}

export function tienenPosicion(regions: readonly Posicionable[]): boolean {
  return regions.every((r) => Number.isFinite(r.y) && Number.isFinite(r.x));
}

/** Copia ordenada: por `(y, x)` cuando todas tienen posición, si no por el array. */
export function ordenDeLectura<T extends Posicionable>(regions: readonly T[]): T[] {
  const copia = [...regions];
  if (!tienenPosicion(copia)) return copia;
  return copia.sort((a, b) => (a.y as number) - (b.y as number) || (a.x as number) - (b.x as number));
}
