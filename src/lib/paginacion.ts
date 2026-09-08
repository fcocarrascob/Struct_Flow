// Paginación A4 del documento de impresión de la hoja (`WorksheetPrint`).
//
// El canvas es un plano 2D de regiones absolutas; lo que se imprime es otro
// documento, lineal, que reordena esas regiones por lectura. Nadie sabía dónde
// caía el corte de página hasta ver el PDF, así que las planillas salían
// partidas a mitad de una sección de cálculo. Este módulo calcula el corte
// ANTES de imprimir, para poder anunciarlo en la hoja.
//
// Es la parte pura: recibe alturas ya medidas y devuelve el reparto en páginas.
// Quien mide el DOM es `usePaginacion` (que para eso necesita un navegador);
// acá no se toca el documento, y así el algoritmo se puede razonar y probar
// solo.
//
// El reparto imita lo que hace el navegador con bloques que no se pueden
// partir: llenado codicioso, en orden, y el primero que no cabe abre página.
// Que coincida no es casualidad — todos los hijos del documento llevan
// `break-inside: avoid`, así que el navegador tampoco tiene dónde partirlos.

/** Geometría de la página, en mm. Debe coincidir con la regla `@page`. */
export const A4 = { ancho: 210, alto: 297, margen: 15 } as const;

/** Un milímetro CSS son 96/25.4 px. */
export const PX_POR_MM = 96 / 25.4;

/** Caja de contenido de una A4 con los márgenes de `@page`, en px CSS. */
export const A4_ANCHO_PX = (A4.ancho - 2 * A4.margen) * PX_POR_MM;
export const A4_ALTO_PX = (A4.alto - 2 * A4.margen) * PX_POR_MM;

/**
 * El alto que se puede llenar de verdad: Chromium arma la caja de página en
 * píxeles CSS enteros, así que 267 mm no son los 1009.134 px de la cuenta sino
 * 1010.
 *
 * No es una fruslería de redondeo. Medido contra el PDF: un bloque que cerraba
 * la página en 1010.000 px cabía, y uno que la cerraba en 1010.622 no. Usar el
 * valor teórico adelanta un corte cada varias páginas — el canvas anunciaba
 * una partición donde el PDF no la tenía.
 */
export const A4_ALTO_UTIL_PX = Math.ceil(A4_ALTO_PX);

/** Un bloque del documento impreso, ya medido. */
export interface Bloque {
  /** `id` de la región, o `__header` / `__footer` para las piezas fijas. */
  id: string;
  /** Alto de caja en px, SIN márgenes. */
  alto: number;
  /** Margen superior e inferior en px, por separado. */
  margenSup: number;
  margenInf: number;
  /** El bloque abre página sí o sí (salto forzado por el autor). */
  saltoAntes?: boolean;
  /**
   * `break-after: avoid`: no puede quedar de último en una página. Es lo que
   * llevan los encabezados de sección, para que no se queden solos al pie.
   */
  pegaAlSiguiente?: boolean;
}

export interface Pagina {
  /** Número de página, desde 1. */
  n: number;
  /** Bloques que caen en ella, en orden de lectura. */
  ids: string[];
  /** Alto ocupado, en px. */
  alto: number;
}

/**
 * Reparte los bloques en páginas de `altoPagina`.
 *
 * Los márgenes son la parte que hay que hacer bien, y no es evidente. Tres
 * reglas, las tres del modelo de caja del navegador:
 *
 *   1. Entre dos hermanos el hueco COLAPSA: es el mayor de los dos márgenes,
 *      no la suma.
 *   2. El margen inferior del último bloque de una página NO cuenta. Un margen
 *      colgando al final no desborda nada, así que tampoco puede empujar al
 *      bloque siguiente a la página que viene.
 *   3. El margen superior del primer bloque de una página se descarta... pero
 *      solo si el corte fue automático. En un salto FORZADO el margen se
 *      respeta (CSS 2.1 §13.3.3: el truncado es cosa de los cortes no
 *      forzados), y se comprueba en el PDF: tras un `break-before: page` el
 *      encabezado baja sus 17,6 px, y tras un corte automático no.
 *
 * La 2 es la que importa: contarla adelantaba un corte cada pocas páginas, y
 * el canvas anunciaba una partición que el PDF no tenía.
 *
 * Un bloque más alto que la página entera no tiene reparto posible: se le da
 * su propia página y se desborda (con `break-inside: avoid` el navegador hace
 * lo mismo). No es un caso a resolver acá sino a avisar arriba — una figura
 * así hay que achicarla.
 */
export function paginar(bloques: Bloque[], altoPagina: number = A4_ALTO_UTIL_PX): Pagina[] {
  const cerradas: { bs: Bloque[]; forzada: boolean }[] = [];
  let actual: Bloque[] = [];
  let forzada = false; // ¿la página actual la abrió un salto forzado?

  for (const b of bloques) {
    if (actual.length === 0) {
      actual.push(b);
      continue;
    }
    if (!b.saltoAntes && altoDe([...actual, b], forzada) <= altoPagina) {
      actual.push(b);
      continue;
    }

    // Se abre página. Los bloques del final que no se separan del que sigue
    // —un encabezado de sección— se van con él en vez de quedar colgando al
    // pie. Un salto forzado no arrastra nada: manda el `break-before` del
    // bloque, y el encabezado se queda donde estaba.
    const arrastre: Bloque[] = [];
    if (!b.saltoAntes) {
      while (actual.length > 1 && actual[actual.length - 1].pegaAlSiguiente) {
        arrastre.unshift(actual.pop()!);
      }
    }
    cerradas.push({ bs: actual, forzada });
    actual = [...arrastre, b];
    forzada = Boolean(b.saltoAntes);
  }
  cerradas.push({ bs: actual, forzada });

  return cerradas.map((p, i) => ({
    n: i + 1,
    ids: p.bs.map((b) => b.id),
    alto: altoDe(p.bs, p.forzada),
  }));
}

/**
 * Alto que ocupa una página con estos bloques. `forzada` dice si la abrió un
 * salto explícito, que es cuando el margen superior del primero cuenta.
 */
function altoDe(bs: Bloque[], forzada: boolean): number {
  let total = 0;
  for (const [i, b] of bs.entries()) {
    if (i === 0) total = b.alto + (forzada ? b.margenSup : 0);
    else total += Math.max(b.margenSup, bs[i - 1].margenInf) + b.alto;
  }
  return total;
}

/** Página en la que cae cada bloque, por id. */
export function paginaPorBloque(paginas: Pagina[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of paginas) for (const id of p.ids) m.set(id, p.n);
  return m;
}

/**
 * Los cortes: el primer bloque de cada página a partir de la segunda. Es lo
 * que se dibuja en el canvas — el corte cae *entre* dos regiones consecutivas
 * en orden de lectura, así que anunciarlo sobre la que abre página es exacto.
 */
export function cortes(paginas: Pagina[]): { id: string; pagina: number }[] {
  return paginas
    .slice(1)
    .map((p) => ({ id: p.ids[0], pagina: p.n }))
    .filter((c) => c.id !== undefined);
}
