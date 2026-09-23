import type { EntradaIndice } from '../lib/catalogo';

/**
 * Lo que el buscador del catálogo compara: título, slug, claves de norma y
 * resumen.
 *
 * Lo comparten la página `/planillas` y el menú «Planillas ▾» del canvas. Cuando
 * cada uno tenía el suyo, buscar «AISC360» encontraba la genérica en la página y
 * en el menú decía «Nada coincide».
 */
export function textoBuscable(e: EntradaIndice): string {
  return `${e.titulo} ${e.slug} ${(e.normas ?? []).join(' ')} ${e.resumen ?? ''}`.toLowerCase();
}
