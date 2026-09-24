// ─────────────────────────────────────────────────────────────────────────────
// Que una fórmula quepa en el ancho del papel.
//
// KaTeX parte una fórmula en sus `+` y `=` de primer nivel —cada tramo es un
// `.base`, y `.wp-eq` deja que envuelvan—, pero no dentro de una fracción, una
// raíz o un paréntesis. Una fracción de 900 px cruzaba el margen derecho en la
// hoja, en la impresión y en el PDF, y la paginación no se enteraba: solo mide
// alturas.
//
// La regla, decidida así: el tramo que no cabe se ENCOGE, esa fórmula sola,
// hasta caber y sin bajar de `ESCALA_MINIMA`; si ni así cabe, el bloque queda
// marcado (`data-desborda`) para que el canvas lo señale al margen. Partirla en
// variables intermedias es la corrección de verdad, y eso lo decide quien
// escribe.
//
// POR QUÉ UNA FUNCIÓN DOM EN `src/lib/`, QUE ES PURA
// -------------------------------------------------
// Medir exige un DOM, pero la función no importa nada —ni React ni el
// navegador: recibe la raíz por parámetro—, y vive aquí porque `render-html.ts`
// necesita su CÓDIGO FUENTE para incrustarlo en el HTML que produce
// (`ajustarAnchos.toString()`). Por eso es AUTOCONTENIDA: no puede nombrar nada
// de fuera de su cuerpo, ni una constante de este módulo; todo le llega por
// parámetro. Los tres papeles corren esta misma función —el bloque del canvas,
// `medirBloques` antes de leer los altos, y el HTML de `render-planilla`—, y
// siempre contra `A4_ANCHO_PX`, nunca contra el ancho del contenedor: la caja
// de interacción del canvas es `fit-content`.
// ─────────────────────────────────────────────────────────────────────────────

/** El mínimo al que se encoge una fórmula antes de darla por desbordada. */
export const ESCALA_MINIMA = 0.75;

/**
 * Ajusta cada `[data-ajuste]` bajo `raiz` al `ancho` disponible y devuelve los
 * ids de los bloques que no caben ni a la escala `minima`.
 *
 * Idempotente: empieza por restablecer lo que dejó una pasada anterior, así que
 * se puede correr tras cada cambio. Un elemento que no se está dibujando
 * (`display: none`, el documento de impresión tapado) se deja como está: medir
 * ahí daría cero y borraría el ajuste que se hizo con él destapado.
 *
 * El id es el `data-wp-id` del bloque (documento de impresión, HTML de consola)
 * o su `data-region-id` (canvas).
 */
export function ajustarAnchos(raiz: ParentNode, ancho: number, minima: number): string[] {
  const TOLERANCIA = 0.5;
  const desbordados: string[] = [];

  // El ancho que manda es el del tramo más ancho: entre tramos KaTeX sí parte
  // la línea, así que lo que desborda es uno de ellos, no la suma.
  const tramoMasAncho = (el: HTMLElement): number => {
    let w = 0;
    el.querySelectorAll('.katex-html > .base').forEach((b) => {
      w = Math.max(w, b.getBoundingClientRect().width);
    });
    return w;
  };

  // Una tabla se mide ENTERA: sus columnas se suman, y lo que no cabe es la
  // tabla, no una fórmula de una celda. Sus celdas no llevan `data-ajuste`: se
  // encogen todas a la vez, con la tabla, y la tabla sigue siendo legible como
  // tabla.
  const anchoTabla = (el: HTMLElement): number => {
    const t = el.querySelector('table');
    return t ? t.getBoundingClientRect().width : 0;
  };

  raiz.querySelectorAll<HTMLElement>('[data-ajuste]').forEach((el) => {
    if (el.getClientRects().length === 0) return;
    const bloque = el.closest<HTMLElement>('[data-wp-id], [data-region-id]');
    el.style.fontSize = '';
    if (bloque) delete bloque.dataset.desborda;
    const medir = el.dataset.ajuste === 'tabla' ? anchoTabla : tramoMasAncho;

    // Lo que ya ocupa a su izquierda en la misma línea —la flecha del valor de
    // un programa— resta del ancho disponible.
    const izquierda = bloque ? el.getBoundingClientRect().left - bloque.getBoundingClientRect().left : 0;
    const disponible = ancho - Math.max(0, izquierda);
    const natural = medir(el);
    if (natural <= disponible + TOLERANCIA) return;

    // KaTeX mide en `em`: el ancho escala lineal con el tamaño. La primera
    // estimación casi siempre acierta; el bucle corrige el redondeo de glifos.
    let escala = Math.max(minima, Math.floor((disponible / natural) * 100) / 100);
    el.style.fontSize = `${Math.round(escala * 100)}%`;
    while (medir(el) > disponible + TOLERANCIA && escala > minima) {
      escala = Math.max(minima, Math.round((escala - 0.01) * 100) / 100);
      el.style.fontSize = `${Math.round(escala * 100)}%`;
    }
    if (medir(el) > disponible + TOLERANCIA && bloque) {
      bloque.dataset.desborda = '';
      const id = bloque.dataset.wpId ?? bloque.dataset.regionId;
      if (id) desbordados.push(id);
    }
  });

  return desbordados;
}
