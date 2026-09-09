import { createPortal } from 'react-dom';
import { A4, A4_ALTO_UTIL_PX, A4_ANCHO_PX, PX_POR_MM } from '../../lib/paginacion';

/**
 * La página-regla: N páginas de alto `H` con la geometría marcada, para
 * calibrar `A4_ALTO_UTIL_PX` mirando un PDF en vez de deducirlo.
 *
 * El valor no se puede calcular: 267 mm son 1009,134 px CSS, pero Chromium arma
 * la caja de página en píxeles enteros y el alto que de verdad se puede llenar
 * es otro. Hasta ahora se infería por el comportamiento de un bloque al filo
 * («uno que cerraba en 1010,000 cabía y uno en 1010,622 no»), que obliga a
 * fabricar el bloque al filo y a fiarse de que no haya nada más en juego.
 *
 * Aquí la geometría es explícita y el veredicto se lee de un vistazo en el PDF:
 *
 *   - si alguna página-regla desborda a una segunda hoja, `H` sobra;
 *   - si la banda de pie no queda al ras del borde inferior, `H` falta;
 *   - si cada página cae en su hoja y la banda toca el borde, `H` es exacto.
 *
 * Se monta como portal en `<body>` con la clase `worksheet-print`, que es la que
 * la regla de `global.css` deja visible al imprimir. No es un atajo: montarla
 * dentro de `#root` la ocultaría el `body > :not(.worksheet-print)`.
 */
export default function ReglaA4({ alto, paginas }: { alto: number; paginas: number }) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="worksheet-print">
      {Array.from({ length: paginas }, (_, i) => (
        <section
          key={i}
          style={{
            position: 'relative',
            boxSizing: 'border-box',
            width: A4_ANCHO_PX,
            height: alto,
            margin: 0,
            padding: 0,
            overflow: 'hidden',
            outline: '1px solid #b91c1c',
            outlineOffset: -1,
            breakInside: 'avoid',
            // La última no fuerza salto: `break-after: page` en la última
            // sección añade una hoja en blanco al final del PDF.
            breakAfter: i === paginas - 1 ? 'auto' : 'page',
            fontSize: '10pt',
          }}
        >
          <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 20, background: '#fee2e2' }}>
            <span style={{ paddingLeft: 6 }}>
              ▲ tope de la página {i + 1} · alto probado {alto} px
            </span>
          </div>

          <div style={{ position: 'absolute', left: 0, top: alto / 2 - 10, right: 0 }}>
            <span style={{ paddingLeft: 6, color: '#6b7280' }}>
              medio: {Math.round(alto / 2)} px · ancho útil {A4_ANCHO_PX.toFixed(1)} px ·
              márgenes @page {A4.margen} mm · 1 mm = {PX_POR_MM.toFixed(4)} px
            </span>
          </div>

          {/* La banda de pie tiene que quedar AL RAS del borde inferior del papel.
              Si queda un hueco blanco, `alto` se ha quedado corto; si se corta,
              se ha pasado. */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: alto - 20,
              right: 0,
              height: 20,
              background: '#dcfce7',
            }}
          >
            <span style={{ paddingLeft: 6 }}>
              ▼ pie de la página {i + 1} — esta banda debe tocar el borde de la hoja
            </span>
          </div>
        </section>
      ))}
    </div>,
    document.body,
  );
}

/** El valor con el que arranca la vista: el que hay calibrado hoy. */
export const ALTO_ACTUAL = A4_ALTO_UTIL_PX;
