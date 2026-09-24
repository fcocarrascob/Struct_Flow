// ─────────────────────────────────────────────────────────────────────────────
// La sintaxis de un token `{{expr}}` / `{{expr:unidad}}`.
//
// La comparten los rótulos de un esquema (`esquema.ts`) y las etiquetas de un
// gráfico (`grafico.ts`): si cada uno partiera el token a su manera, un mismo
// `{{T_est:s}}` significaría cosas distintas según dónde se escriba. No importa
// nada, para que `worksheet.ts` pueda usarlo sin ciclos (el esquema sí importa
// la hoja).
// ─────────────────────────────────────────────────────────────────────────────

export const TOKEN_RE = /\{\{([^{}]+)\}\}/g;

/**
 * Cola de unidad: identificadores combinados con * / ^ y dígitos (mismo
 * criterio que el `= unidad` de una región math).
 */
export const UNIT_TAIL_RE = /^[\p{L}\p{N}_*/^\s()-]*$/u;

/** Separa `expr:unidad`; el último `:` solo es unidad si la cola lo parece. */
export function separarToken(crudo: string): { expr: string; unidad?: string } {
  const i = crudo.lastIndexOf(':');
  if (i === -1) return { expr: crudo };
  const tail = crudo.slice(i + 1).trim();
  if (UNIT_TAIL_RE.test(tail) && /\p{L}/u.test(tail)) {
    return { expr: crudo.slice(0, i).trim(), unidad: tail };
  }
  return { expr: crudo };
}

/**
 * Escapa un texto para que entre en un SVG como TEXTO y no como marcado.
 *
 * Los valores salen de la hoja, que puede venir de fuera —pegar un JSON de una
 * conversación es una vía de entrada declarada—, y el SVG resultante se inyecta
 * con `dangerouslySetInnerHTML`: `innerHTML` no ejecuta un `<script>`, pero el
 * `onerror` de un `<img>` sí. Se escapan también las comillas porque un texto
 * puede ir dentro de un atributo.
 */
export function escaparXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
