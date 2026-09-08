import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import katex from 'katex';
import type { Region, SheetResults } from '../../lib/worksheet';
import { renderEsquema, ESQUEMAS_PREFIX } from '../../lib/esquema';

/** Render KaTeX imperativo (mismo enfoque que MathRegion). */
function Katex({ tex }: { tex: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) katex.render(tex, ref.current, { throwOnError: false });
  }, [tex]);
  return <span ref={ref} />;
}

/** Ids de los dos bloques fijos, para que la paginación pueda contarlos. */
export const HEADER_ID = '__header';
export const FOOTER_ID = '__footer';

/**
 * Esquema paramétrico en el documento impreso: el mismo SVG inline con los
 * tokens resueltos que se ve en la hoja.
 *
 * No es un adorno de simetría. Un `<img src="/esquemas/x.svg">` trae el archivo
 * del servidor, y el archivo tiene los `{{tokens}}` sin sustituir: la memoria
 * de cálculo salía impresa con «{{Rd_pan:tonf}}» donde debía ir el número.
 */
function EsquemaImpreso({
  src,
  scope,
  w,
  h,
}: {
  src: string;
  scope?: Record<string, unknown>;
  w?: number;
  h?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        if (!cancelled && ref.current) {
          ref.current.innerHTML = renderEsquema(text, scope ?? {}).svg;
        }
      })
      .catch(() => {
        if (!cancelled && ref.current) ref.current.textContent = `[no se pudo cargar ${src}]`;
      });
    return () => {
      cancelled = true;
    };
  }, [src, scope]);
  // El tamaño va reservado desde el principio: sin esto el bloque mide 0 hasta
  // que llega el SVG, y la paginación mediría una figura inexistente.
  return <div ref={ref} style={{ width: w, height: h }} />;
}

/**
 * Documento de impresión de la hoja: reordena las regiones en lectura natural
 * (arriba→abajo, izq→der) y las presenta como una planilla lineal, apta para
 * "Imprimir → Guardar como PDF" e incluir en una memoria de cálculo. Oculto en
 * pantalla vía CSS (.worksheet-print), visible solo en @media print.
 *
 * Convenciones de la hoja: la primera región de texto es el título; las de texto
 * con "━" son encabezados de sección; el resto, etiquetas. Las regiones math/programa
 * muestran su LaTeX ya calculado y el veredicto ✓/✗ de las comparaciones, y las de
 * imagen se intercalan como figuras en el punto que les toca por orden de lectura.
 *
 * Cada bloque lleva `data-wp-id` con el id de su región: es el enganche por el
 * que `usePaginacion` mide este documento y le dice al canvas en qué página cae
 * cada región (ver `paginacion.ts`).
 */
export default function WorksheetPrint({
  regions,
  results,
}: {
  regions: Region[];
  results: SheetResults;
}) {
  const ordered = [...regions]
    .filter((r) => r.src.trim() !== '')
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const titleRegion = ordered.find((r) => r.kind === 'text');
  const title = titleRegion?.src ?? 'Planilla de cálculo';
  const fecha = new Date().toLocaleDateString('es-CL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="worksheet-print">
      <div className="wp-header" data-wp-id={HEADER_ID}>
        <h1>{title}</h1>
        <p className="wp-meta">Memoria de cálculo · struct/pad · {fecha}</p>
      </div>

      {ordered.map((r) => {
        if (r.id === titleRegion?.id) return null; // ya está en el encabezado

        // El salto forzado se aplica al bloque que abre la página nueva.
        const brk = r.pageBreak ? ' wp-break' : '';

        if (r.kind === 'image') {
          return (
            <figure key={r.id} className={`wp-fig${brk}`} data-wp-id={r.id}>
              {r.src.startsWith(ESQUEMAS_PREFIX) ? (
                <EsquemaImpreso src={r.src} scope={results[r.id]?.scope} w={r.w} h={r.h} />
              ) : (
                <img
                  src={r.src}
                  alt=""
                  width={r.w}
                  height={r.h}
                  style={{ width: r.w ? `${r.w}px` : undefined }}
                />
              )}
            </figure>
          );
        }

        if (r.kind === 'text') {
          if (r.src.includes('━')) {
            return (
              <h2 key={r.id} className={`wp-h2${brk}`} data-wp-id={r.id}>
                {r.src.replace(/━/g, '').trim()}
              </h2>
            );
          }
          return (
            <p key={r.id} className={`wp-label${brk}`} data-wp-id={r.id}>
              {r.src}
            </p>
          );
        }

        const res = results[r.id];
        if (res?.error) {
          return (
            <p key={r.id} className={`wp-eq wp-err${brk}`} data-wp-id={r.id}>
              {r.src} — {res.error}
            </p>
          );
        }
        if (r.kind === 'program' && res?.defined) {
          return (
            <p key={r.id} className={`wp-label${brk}`} data-wp-id={r.id}>
              {res.defined} — función definida
            </p>
          );
        }
        return (
          <div key={r.id} className={`wp-eq${brk}`} data-wp-id={r.id}>
            {res?.tex ? <Katex tex={res.tex} /> : <span className="wp-raw">{r.src}</span>}
            {res?.bool !== undefined && (
              <span className={res.bool ? 'wp-ok' : 'wp-no'}>{res.bool ? '✓' : '✗'}</span>
            )}
          </div>
        );
      })}

      <div className="wp-footer" data-wp-id={FOOTER_ID}>
        Generado con la herramienta de canvas matemático de struct/pad. Verifique los
        valores de entrada antes de incorporar esta planilla a la memoria de cálculo.
      </div>
    </div>,
    document.body,
  );
}
