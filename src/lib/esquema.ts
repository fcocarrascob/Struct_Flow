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

/** Sustituye los tokens del SVG contra el scope. Nunca lanza. */
export function renderEsquema(
  svgText: string,
  scope: Record<string, unknown>,
): EsquemaRender {
  const faltantes: string[] = [];
  let tokens = 0;
  const svg = svgText.replace(TOKEN_RE, (_m, crudoRaw: string) => {
    tokens += 1;
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
  return { svg, tokens, faltantes };
}
