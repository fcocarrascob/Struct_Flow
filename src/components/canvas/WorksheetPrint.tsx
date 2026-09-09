import { createPortal } from 'react-dom';
import BloqueDoc from './BloqueDoc';
import type { Region, SheetResults } from '../../lib/worksheet';

/** Id del pie, para que la paginación pueda contarlo. */
export const FOOTER_ID = '__footer';

/**
 * Documento de impresión de la hoja: reordena las regiones en lectura natural
 * (arriba→abajo, izq→der) y las presenta como una planilla lineal, apta para
 * "Imprimir → Guardar como PDF" e incluir en una memoria de cálculo. Oculto en
 * pantalla vía CSS (.worksheet-print), visible solo en @media print.
 *
 * **No dibuja los bloques**: eso es `BloqueDoc`, el mismo componente que usa la
 * hoja del canvas. Lo que queda aquí es lo propio del documento lineal — el
 * orden de lectura, los saltos de página forzados y el pie.
 *
 * La primera región de texto se dibuja como título **en su sitio**. Antes este
 * documento se la comía y la reponía en una banda fija de encabezado, así que
 * la misma región estaba en un lugar del canvas y en otro del papel.
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

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="worksheet-print doc-papel">
      {ordered.map((r) => (
        <BloqueDoc
          key={r.id}
          region={r}
          result={results[r.id]}
          titulo={r.id === titleRegion?.id}
          // El salto forzado se aplica al bloque que abre la página nueva.
          className={r.pageBreak ? 'wp-break' : ''}
          wpId={r.id}
        />
      ))}

      <div className="wp-footer" data-wp-id={FOOTER_ID}>
        Generado con la herramienta de canvas matemático de struct/pad. Verifique los
        valores de entrada antes de incorporar esta planilla a la memoria de cálculo.
      </div>
    </div>,
    document.body,
  );
}
