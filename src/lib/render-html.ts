// La hoja como HTML estático, sin React ni navegador.
//
// Emite el MISMO marcado que `BloqueDoc.tsx` dibuja en el canvas y en el
// documento de impresión —las mismas clases `.wp-*` bajo `.doc-papel`—, para
// que `scripts/render-planilla.mjs` produzca desde Node un HTML/PDF que se ve
// como lo que se imprime desde el navegador. Lo que decide qué es cada bloque
// (encabezado, espaciador, título) sale de `lib/bloque.ts`, compartido con el
// componente; aquí solo se serializa.
//
// Es un visor, no un motor: recibe los `results` ya calculados por
// `evaluateSheet`. El KaTeX se pre-renderiza a HTML con `renderToString`.
//
// Los esquemas paramétricos (`/esquemas/*.svg`) no se leen de disco aquí —esto
// tiene que poder correr en cualquier entorno—: quien llama los pasa ya leídos
// en `opciones.esquemas`, indexados por `src`, y aquí se sustituyen los tokens
// contra el scope que la región capturó. Un esquema que falta o deja tokens
// sin resolver hace lanzar: un PDF con «{{Rd_pan:tonf}}» no se publica.

import katex from 'katex';
import type { Region, SheetResults } from './worksheet';
import type { MetaPlanilla } from './biblioteca/contrato';
import { renderEsquema, esRutaDeEsquema } from './esquema';
import { ordenDeLectura } from './orden-lectura';
import { nivelEncabezado, textoEncabezado, esEspaciador, regionTitulo } from './bloque';

export interface OpcionesRender {
  /** Texto de cada SVG de `/esquemas/`, por `src`. Quien llama lo lee del disco. */
  esquemas?: Readonly<Record<string, string>>;
  /** Fecha impresa en la cabecera (texto libre). Sin ella, la de hoy en es-CL. */
  fecha?: string;
  /** Texto del pie. */
  pie?: string;
  /**
   * Cómo sale el fuente de un bloque de programa. `visibles` es lo que hace el
   * papel del canvas: el algoritmo a la vista, porque en una memoria es lo que
   * hay que poder auditar. `plegados` lo mete en un `<details open>`, útil para
   * una página larga que se lee en pantalla; sigue abierto, así que impreso
   * sale igual.
   */
  programas?: 'visibles' | 'plegados';
}

export function escaparHtml(s: unknown): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tex(t: string | undefined, src: string): string {
  if (!t) return `<span class="wp-raw">${escaparHtml(src)}</span>`;
  return katex.renderToString(t, { throwOnError: false, displayMode: false });
}

function fechaHoy(): string {
  return new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * El cuerpo del documento: un `<div class="worksheet-print doc-papel">` con un
 * bloque por región en orden de lectura, igual que `WorksheetPrint.tsx`.
 */
export function renderHtml(
  regions: readonly Region[],
  results: SheetResults,
  meta: Partial<MetaPlanilla> | undefined,
  opciones: OpcionesRender = {},
): string {
  const programas = opciones.programas ?? 'visibles';
  const ordenadas = ordenDeLectura(regions).filter((r) => r.src.trim() !== '' || esEspaciador(r));
  const bloques: string[] = [];

  // El título: `meta.titulo` si lo hay, y si no la primera región de texto,
  // como hace el papel del canvas. La diferencia con `WorksheetPrint` es
  // deliberada: en una instancia de proyecto la primera región suele ser una
  // nota («INSTANCIA de … para …») y el título de la memoria está en `meta`.
  // Cuando el título viene de `meta`, esa primera región se dibuja en su sitio
  // como el párrafo que es.
  const tituloMeta = meta?.titulo?.trim();
  const regionDelTitulo = tituloMeta ? undefined : regionTitulo(ordenadas);
  const cabecera = (texto: string, extra = '', rest = '') =>
    `<div class="wp-header${extra}"${rest}><h1>${escaparHtml(texto)}</h1>` +
    `<p class="wp-meta">Memoria de cálculo · Struct_Flow · ${escaparHtml(opciones.fecha ?? fechaHoy())}</p></div>`;
  if (tituloMeta) bloques.push(cabecera(tituloMeta));

  for (const r of ordenadas) {
    const clase = (base: string) => `${base}${r.pageBreak ? ' wp-break' : ''}`;
    const rest = ` data-wp-id="${escaparHtml(r.id)}"`;
    const res = results[r.id] ?? {};

    if (regionDelTitulo && r.id === regionDelTitulo.id) {
      const texto = nivelEncabezado(r) > 0 ? textoEncabezado(r) : r.src;
      bloques.push(cabecera(texto, r.pageBreak ? ' wp-break' : '', rest));
      continue;
    }

    if (r.kind === 'image') {
      const tope = r.w ? ` style="width:${r.w}px;max-width:100%"` : '';
      if (esRutaDeEsquema(r.src)) {
        const svgText = opciones.esquemas?.[r.src];
        if (!svgText) throw new Error(`falta el esquema ${r.src}: pásalo en opciones.esquemas`);
        const { svg, faltantes } = renderEsquema(svgText, res.scope ?? {});
        if (faltantes.length) {
          throw new Error(`el esquema ${r.src} dejó tokens sin resolver: ${faltantes.join(' · ')}`);
        }
        bloques.push(`<figure class="${clase('wp-fig')}"${rest}><div${tope}>${svg}</div></figure>`);
      } else {
        bloques.push(
          `<figure class="${clase('wp-fig')}"${rest}><img src="${escaparHtml(r.src)}" alt=""` +
            `${r.w ? ` width="${r.w}"` : ''}${r.h ? ` height="${r.h}"` : ''}></figure>`,
        );
      }
      continue;
    }

    if (r.kind === 'text') {
      if (esEspaciador(r)) {
        bloques.push(`<p class="${clase('wp-space')}"${rest}></p>`);
        continue;
      }
      const nivel = nivelEncabezado(r);
      if (nivel > 0) {
        bloques.push(`<h${nivel} class="${clase(`wp-h${nivel}`)}"${rest}>${escaparHtml(textoEncabezado(r))}</h${nivel}>`);
      } else {
        bloques.push(`<p class="${clase('wp-label')}"${rest}>${escaparHtml(r.src)}</p>`);
      }
      continue;
    }

    if (res.error) {
      bloques.push(`<p class="${clase('wp-eq wp-err')}"${rest}>${escaparHtml(r.src)} — ${escaparHtml(res.error)}</p>`);
      continue;
    }

    if (r.kind === 'program') {
      const fuente = `<pre>${escaparHtml(r.src)}</pre>`;
      const cuerpo =
        programas === 'plegados'
          ? `<details open class="wp-src"><summary>las ramas del programa</summary>${fuente}</details>`
          : fuente;
      const valor = res.tex
        ? `<span class="wp-prog-val"><span class="wp-flecha">→</span>${tex(res.tex, r.src)}</span>`
        : '';
      const definida = res.defined ? `<em class="wp-prog-def">${escaparHtml(res.defined)} definida</em>` : '';
      bloques.push(`<div class="${clase('wp-prog')}"${rest}>${cuerpo}${valor}${definida}</div>`);
      continue;
    }

    const marca =
      res.bool === undefined
        ? ''
        : `<span class="${res.bool ? 'wp-ok' : 'wp-no'}">${res.bool ? '✓' : '✗'}</span>`;
    bloques.push(`<div class="${clase('wp-eq')}"${rest}>${tex(res.tex, r.src)}${marca}</div>`);
  }

  const pie =
    opciones.pie ??
    'Generado con Struct_Flow y verificado con verify:planilla. Verifique los valores de entrada antes de incorporar esta planilla a la memoria de cálculo.';
  bloques.push(`<div class="wp-footer" data-wp-id="__footer">${escaparHtml(pie)}</div>`);

  return `<div class="worksheet-print doc-papel">\n${bloques.join('\n')}\n</div>`;
}

/** Un documento completo alrededor del cuerpo: quien llama aporta el CSS. */
export function documentoHtml(d: { titulo: string; cuerpo: string; css: string; extraHead?: string }): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparHtml(d.titulo)}</title>
${d.extraHead ?? ''}
<style>
${d.css}
</style>
</head>
<body>
${d.cuerpo}
</body>
</html>
`;
}
