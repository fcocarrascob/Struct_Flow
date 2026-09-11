// Lo que un bloque de la hoja ES, sin dibujarlo.
//
// Estas funciones vivían en `BloqueDoc.tsx` y las usaban el canvas, el panel de
// secciones y el documento de impresión. Salen a `lib/` porque ahora también las
// necesita `render-html.ts`, que produce el mismo marcado desde Node sin React:
// si cada renderizador decidiera por su cuenta qué es un encabezado, los dos
// dirían cosas distintas. `BloqueDoc.tsx` las reexporta, así que sus
// importadores no cambian.

import type { Region } from './worksheet';

/**
 * Nivel de un encabezado de sección: 1, 2 o 3, y 0 si no lo es.
 *
 * **Es la única autoridad sobre qué es un encabezado**, igual que `nombreTex` lo
 * es sobre nombre → LaTeX. La usan el marcado, el ancho de la caja de
 * interacción (`MathRegion`), el panel de secciones y el render a HTML; con la
 * comprobación repetida, un cambio en la sintaxis dejaría a todos diciendo
 * cosas distintas.
 *
 * Dos sintaxis, y por qué conviven:
 *
 * - **`# `, `## `, `### `** — la buena. El nivel es explícito y se escribe igual
 *   siempre. El espacio y el carácter que le sigue son obligatorios, de modo que
 *   un texto como «#3 barras» sigue siendo un párrafo.
 * - **Una raya horizontal, como `━━ TÍTULO ━━`** — la heredada, que vale por
 *   `##`. No se retira porque la usan 439 regiones en 31 de las 33 planillas
 *   publicadas, y romperlas para ganar sintaxis no compensa.
 *
 * La raya se acepta **pesada (U+2501) o ligera (U+2500)**. Antes solo contaba la
 * pesada, y las 19 regiones que se escribieron con la ligera —8 en
 * `anclajes-pedestal`, 11 en `pedestal-anclaje-nch2369`— salían como párrafo
 * gris: perdían el `break-after: avoid` y la paginación las dejaba colgando al
 * pie de página. Un fallo invisible hasta ver el PDF, que es exactamente lo que
 * pasa cuando la estructura del documento depende de qué carácter se pegó del
 * portapapeles.
 */
export function nivelEncabezado(region: Pick<Region, 'kind' | 'src'>): 0 | 1 | 2 | 3 {
  if (region.kind !== 'text') return 0;
  const m = /^(#{1,3})\s+\S/.exec(region.src.trim());
  if (m) return m[1].length as 1 | 2 | 3;
  return region.src.includes('━') || region.src.includes('─') ? 2 : 0;
}

/** El texto de un encabezado, sin el prefijo `#` ni las rayas. */
export function textoEncabezado(region: Pick<Region, 'src'>): string {
  return region.src
    .trim()
    .replace(/^#{1,3}\s+/, '')
    .replace(/[━─]/g, '')
    .trim();
}

/** Derivada de `nivelEncabezado`, para quien solo necesita el sí o el no. */
export function esEncabezado(region: Pick<Region, 'kind' | 'src'>): boolean {
  return nivelEncabezado(region) > 0;
}

/**
 * Alto de un espaciador, en píxeles CSS.
 *
 * **Tiene que coincidir con `.doc-papel .wp-space` de `global.css`**, igual que
 * `A4` de `paginacion.ts` coincide con la regla `@page`: aquí lo necesita el
 * canvas para saber cuánto empujar hacia abajo al abrir el hueco, y allí lo
 * necesita el bloque para ocupar ese alto en la hoja y en el papel. Si
 * divergieran, el empujón dejaría de cuadrar con lo que se ve.
 *
 * Un paso de la cuadrícula (`GRID`), y no una línea de texto entera, porque todo
 * el canvas se ajusta a 16 px: así el hueco que se abre y el alto del bloque son
 * el mismo número exacto, sin redondeos, y Enter se puede repetir para dosificar.
 */
export const ALTO_ESPACIADOR = 16;

/**
 * Un espaciador: una región de texto sin contenido.
 *
 * No es un tipo nuevo. Es lo que el corpus ya usa —39 regiones en 8 planillas,
 * 16 solo en `anclajes-pedestal`— y lo que sus autores quisieron que fuera;
 * hasta ahora no ocupaba nada en ninguna parte, porque un párrafo vacío mide
 * cero y el documento de impresión las descartaba.
 *
 * Solo `text`: una `math` o una `program` vacía no es un espaciador, es un
 * bloque a medio escribir.
 */
export function esEspaciador(region: Pick<Region, 'kind' | 'src'>): boolean {
  return region.kind === 'text' && region.src.trim() === '';
}

/**
 * La región que hace de título: la primera de texto que no es un espaciador,
 * en orden de lectura. `MathCanvas` (`idTitulo`), `WorksheetPrint` y el render
 * a HTML eligen con esta misma regla; si discreparan, el título saldría en un
 * sitio en la hoja y en otro en el papel.
 */
export function regionTitulo<T extends Pick<Region, 'kind' | 'src'>>(ordenadas: readonly T[]): T | undefined {
  return ordenadas.find((r) => r.kind === 'text' && !esEspaciador(r));
}
