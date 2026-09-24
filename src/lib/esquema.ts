// Esquema paramétrico: sustitución de tokens `{{expr}}` / `{{expr:unidad}}` en
// un SVG contra el scope de la hoja (fase 2 del plan de imágenes del canvas).
//
// El SVG vive en `public/esquemas/` y se dibuja con los rótulos como tokens:
//
//   <text>l = {{l_w:cm}} cm</text>      → "l = 15 cm"      (solo el número)
//   <text>U = {{U_5}}</text>            → "U = 0.7607"     (valor a secas)
//   <text>{{1 - x_bar/l_w}}</text>      → cualquier expresión mathjs vale
//
// En un ATRIBUTO el rótulo no sirve —`formatValor` sale con coma decimal, y
// `width="211,4"` es SVG inválido—, así que va el modificador `:svg`, que emite
// geometría cruda y vuelca una matriz Nx2 como lista de puntos:
//
//   <polyline points="{{pts_px:svg}}" />   → "40,310 52,287 …"
//   <circle cx="{{x_bal:svg}}" ... />      → "128.4"
//
// Un token vale por UN valor, así que no alcanza para dibujar una cantidad de
// piezas que decide la hoja —los `n_col` pernos de una placa base, las barras de
// una zapata—. Para eso está `data-repetir`, que clona un elemento una vez por
// fila de una matriz:
//
//   <circle data-repetir="pernos_xy" cx="{{fila[1]:svg}}" cy="{{fila[2]:svg}}"
//           r="{{r_hueco_px:svg}}" />
//
// Dentro del clon, `fila` es la fila que toca (índice 1-based, como en mathjs).
//
// La región `image` que lo muestra captura el scope en su posición de lectura
// (ver `evaluateSheet`): el esquema ve las variables definidas arriba, igual
// que una región math. Un token que no resuelve (variable no definida todavía,
// unidad incoherente) se pinta como `¿expr?` y queda en `faltantes` — y
// `verify-planilla.mjs` falla si hay alguno, así el esquema queda bajo el
// mismo contrato que los números.
//
// Seguridad: la PLANTILLA solo se inyecta desde `/esquemas/` (mismo origen,
// autoría propia), y una imagen pegada por el usuario nunca pasa por aquí. Pero
// los VALORES que se sustituyen salen de la hoja, que sí puede venir de fuera
// —pegar un JSON de una conversación es una vía de entrada declarada—, y el
// resultado se inyecta con `dangerouslySetInnerHTML`. Por eso el rótulo se
// escapa (ver `escaparXml`): `innerHTML` no ejecuta un `<script>`, pero el
// `onerror` de un `<img>` sí.

import { evalExpr, formatSvg, formatValor } from './worksheet';

/** Prefijo de ruta desde el que se permite render inline con tokens. */
export const ESQUEMAS_PREFIX = '/esquemas/';

/**
 * ¿Es la ruta de un esquema propio, que se puede inyectar como SVG? El prefijo
 * solo no basta: `/esquemas/../loquesea` empieza igual y sale de la carpeta, y
 * lo que devuelva se inyecta con `innerHTML`.
 */
export function esRutaDeEsquema(src: string): boolean {
  return src.startsWith(ESQUEMAS_PREFIX) && !src.includes('..') && !src.includes('\\');
}

const TOKEN_RE = /\{\{([^{}]+)\}\}/g;
// Cola de unidad: identificadores combinados con * / ^ y dígitos (mismo
// criterio que el `= unidad` de una región math).
const UNIT_TAIL_RE = /^[\p{L}\p{N}_*/^\s()-]*$/u;

export interface EsquemaRender {
  /** El SVG con los tokens sustituidos. */
  svg: string;
  /** Cuántos tokens tenía el SVG. */
  tokens: number;
  /** Tokens que no resolvieron (expresión, tal como se escribió). */
  faltantes: string[];
}

/**
 * Modificador de formato crudo: `{{expr:svg}}` sale con punto decimal, sin
 * unidad y sin el redondeo a 4 cifras, para poder ir DENTRO de un atributo
 * (`points`, `cx`, `d`). Ocupa el slot de la unidad y se puede encadenar con
 * ella: `{{x:cm:svg}}` convierte a cm y después formatea crudo.
 */
const MOD_SVG = 'svg';

/** Separa `expr:unidad`; el último `:` solo es unidad si la cola lo parece. */
function separarToken(crudo: string): { expr: string; unidad?: string } {
  const i = crudo.lastIndexOf(':');
  if (i === -1) return { expr: crudo };
  const tail = crudo.slice(i + 1).trim();
  if (UNIT_TAIL_RE.test(tail) && /\p{L}/u.test(tail)) {
    return { expr: crudo.slice(0, i).trim(), unidad: tail };
  }
  return { expr: crudo };
}

/**
 * Escapa un rótulo para que entre en el SVG como TEXTO y no como marcado.
 *
 * El valor sale de la hoja y el SVG resultante se inyecta con
 * `dangerouslySetInnerHTML`, así que una hoja pegada de fuera que definiera la
 * variable de un token con `"><img src=x onerror=…>` colaba HTML ejecutable.
 * Se escapan también las comillas porque un token puede ir dentro de un atributo.
 */
function escaparXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Cuenta de tokens vistos, compartida entre la expansión y la sustitución. */
interface Cuenta {
  tokens: number;
}

/** Sustituye los tokens de un fragmento contra un scope. Nunca lanza. */
function sustituirTokens(
  texto: string,
  scope: Record<string, unknown>,
  faltantes: string[],
  cuenta: Cuenta,
): string {
  return texto.replace(TOKEN_RE, (_m, crudoRaw: string) => {
    cuenta.tokens += 1;
    const crudo = crudoRaw.trim();
    let { expr, unidad } = separarToken(crudo);
    const svg = unidad === MOD_SVG;
    if (svg) ({ expr, unidad } = separarToken(expr));
    try {
      const v = evalExpr(expr, scope);
      // `formatSvg` no se escapa, y no es un descuido: solo emite números y
      // listas de números (lanza ante cualquier otra cosa), así que no hay nada
      // que escapar y hacerlo rompería el `points` de una polilínea.
      return svg ? formatSvg(v, unidad) : escaparXml(formatValor(v, unidad));
    } catch {
      faltantes.push(crudo);
      return escaparXml(`¿${expr}?`);
    }
  });
}

/** El atributo que marca un elemento como repetible. */
const ATTR_REPETIR = 'data-repetir';
const ATTR_REPETIR_RE = /\sdata-repetir\s*=\s*("[^"]*"|'[^']*')/;

/**
 * Extensión del elemento que abre en `inicio` (el índice de su `<`).
 *
 * Recorre la etiqueta de apertura respetando comillas —un `>` dentro de un
 * atributo no la cierra— y, si no es autocerrada, busca su cierre contando
 * profundidad del mismo nombre de etiqueta, para que un `<g>` con `<g>` adentro
 * no termine en el cierre equivocado.
 */
function extensionElemento(svg: string, inicio: number): { fin: number; abreHasta: number } | null {
  const mTag = /^<([a-zA-Z][\w:.-]*)/.exec(svg.slice(inicio));
  if (!mTag) return null;
  const tag = mTag[1];
  let comilla: string | null = null;
  let i = inicio;
  for (; i < svg.length; i++) {
    const c = svg[i];
    if (comilla) {
      if (c === comilla) comilla = null;
      continue;
    }
    if (c === '"' || c === "'") comilla = c;
    else if (c === '>') break;
  }
  if (i >= svg.length) return null;
  const abreHasta = i + 1;
  if (svg[i - 1] === '/') return { fin: abreHasta, abreHasta };
  const re = new RegExp(`<${tag}(?![\\w:.-])|</${tag}\\s*>`, 'g');
  re.lastIndex = abreHasta;
  let prof = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    if (m[0].startsWith('</')) {
      if (--prof === 0) return { fin: m.index + m[0].length, abreHasta };
    } else prof++;
  }
  return null;
}

/**
 * Expande los elementos con `data-repetir` antes de sustituir los tokens.
 *
 * Cada clon se sustituye aquí mismo, con el scope aumentado con `fila`, porque
 * la pasada general tiene un solo scope y no podría dar a cada perno su
 * coordenada. Si la fila no es una lista, `fila` queda ligada al escalar, y así
 * `data-repetir` sirve igual sobre un vector.
 *
 * Una expresión que no resuelve, o que no da una lista, **se lleva el elemento
 * puesto y cae en `faltantes`** — o sea que `verify:planilla` falla, igual que
 * con un número. Lo que sí se permite es una lista VACÍA, que dibuja cero
 * clones: es cómo se omite una pieza opcional (los nervios de una placa). Que
 * eso no tape un dibujo vacío por error es cosa de la hoja, que para eso lleva
 * su contraste del largo de la lista.
 */
function expandirRepeticiones(
  svgText: string,
  scope: Record<string, unknown>,
  faltantes: string[],
  cuenta: Cuenta,
): string {
  let out = '';
  let pos = 0;
  for (;;) {
    const at = svgText.indexOf(ATTR_REPETIR, pos);
    if (at === -1) return out + svgText.slice(pos);
    const inicio = svgText.lastIndexOf('<', at);
    // Tiene que estar DENTRO de una etiqueta de apertura: si entre el `<` y el
    // atributo ya se cerró un `>`, esto es texto y no un atributo.
    if (inicio === -1 || svgText.lastIndexOf('>', at) > inicio) {
      out += svgText.slice(pos, at + ATTR_REPETIR.length);
      pos = at + ATTR_REPETIR.length;
      continue;
    }
    const ext = extensionElemento(svgText, inicio);
    if (!ext) {
      faltantes.push(`${ATTR_REPETIR}: elemento sin cierre`);
      out += svgText.slice(pos, at + ATTR_REPETIR.length);
      pos = at + ATTR_REPETIR.length;
      continue;
    }
    out += svgText.slice(pos, inicio);
    pos = ext.fin;

    const elemento = svgText.slice(inicio, ext.fin);
    const mAttr = ATTR_REPETIR_RE.exec(elemento.slice(0, ext.abreHasta - inicio));
    if (!mAttr) continue;
    const expr = mAttr[1].slice(1, -1).trim();
    const plantilla = elemento.slice(0, mAttr.index) + elemento.slice(mAttr.index + mAttr[0].length);

    // Un `data-repetir` dentro de otro multiplicaría el clon por su propia
    // lista con `fila` ya tomada, y no hay forma de nombrar las dos. Se rechaza
    // en vez de dar un dibujo que nadie pidió.
    if (plantilla.includes(ATTR_REPETIR)) {
      faltantes.push(`${ATTR_REPETIR}="${expr}": anidado`);
      continue;
    }

    let filas: unknown[];
    try {
      const v = evalExpr(expr, scope);
      const bruto = (v as { valueOf?: () => unknown })?.valueOf?.() ?? v;
      if (!Array.isArray(bruto)) throw new Error('no es una lista');
      filas = bruto;
    } catch {
      faltantes.push(`${ATTR_REPETIR}="${expr}"`);
      continue;
    }
    for (const fila of filas) {
      out += sustituirTokens(plantilla, { ...scope, fila }, faltantes, cuenta);
    }
  }
}

/** Expande las repeticiones y sustituye los tokens del SVG. Nunca lanza. */
export function renderEsquema(
  svgText: string,
  scope: Record<string, unknown>,
): EsquemaRender {
  const faltantes: string[] = [];
  const cuenta: Cuenta = { tokens: 0 };
  const expandido = expandirRepeticiones(svgText, scope, faltantes, cuenta);
  const svg = sustituirTokens(expandido, scope, faltantes, cuenta);
  return { svg, tokens: cuenta.tokens, faltantes };
}
