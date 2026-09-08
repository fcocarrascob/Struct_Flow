import { useEffect, useState } from 'react';
import {
  A4_ALTO_UTIL_PX,
  A4_ANCHO_PX,
  cortes as cortesDe,
  paginaPorBloque,
  paginar,
  type Bloque,
  type Pagina,
} from '../../lib/paginacion';
import type { Region, SheetResults } from '../../lib/worksheet';

/**
 * Mide el documento de impresión y devuelve en qué página A4 cae cada región.
 *
 * La parte sucia de `paginacion.ts`: acá se toca el DOM. El documento
 * (`.worksheet-print`) ya está montado como portal en `<body>`, oculto con
 * `display: none`, así que no hay que renderizar nada aparte — basta con
 * destaparlo un instante fuera de la pantalla, forzarle el ancho de la caja de
 * contenido de una A4, leer los altos y volver a taparlo. Todo dentro del mismo
 * frame: el usuario no ve el parpadeo.
 *
 * De cada bloque salen tres números — alto de caja, margen superior y margen
 * inferior — y nada más. Qué se hace con los márgenes (colapsan entre hermanos,
 * se descartan en los bordes de página) es cosa de `paginar()`: acá solo se
 * mide, y así la regla vive en un solo sitio.
 */
export interface Paginacion {
  paginas: Pagina[];
  /** Página en la que cae cada región, por id. */
  porRegion: Map<string, number>;
  /** Primera región de cada página, de la segunda en adelante. */
  cortes: { id: string; pagina: number }[];
  /** Regiones más altas que una página entera: se imprimen desbordadas. */
  largos: string[];
}

const VACIA: Paginacion = { paginas: [], porRegion: new Map(), cortes: [], largos: [] };

/** Altos de cada bloque del documento, con el colapso de márgenes resuelto. */
function medirBloques(root: HTMLElement, saltos: Set<string>): Bloque[] {
  const previo = root.getAttribute('style');

  // Fuera de la pantalla, con el ancho exacto del papel. `fixed` lo saca del
  // flujo: nada de la página se mueve mientras dura la medición.
  Object.assign(root.style, {
    display: 'block',
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${A4_ANCHO_PX}px`,
    visibility: 'hidden',
    pointerEvents: 'none',
  });

  const bloques: Bloque[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('[data-wp-id]')) {
    const cs = getComputedStyle(el);
    const id = el.dataset.wpId!;
    // Alto de caja y márgenes por separado: el colapso entre hermanos y el
    // descarte en los bordes de página son cosa de `paginar()`, que es quien
    // sabe dónde cae cada corte.
    bloques.push({
      id,
      // `getBoundingClientRect` y no `offsetHeight`: el segundo redondea a
      // entero, y con cuarenta bloques por página el medio píxel de cada uno
      // se acumula hasta correr un corte que estaba al filo.
      alto: el.getBoundingClientRect().height,
      margenSup: parseFloat(cs.marginTop) || 0,
      margenInf: parseFloat(cs.marginBottom) || 0,
      saltoAntes: saltos.has(id),
      // Se lee del estilo y no de la clase: la regla vive en el CSS
      // (`.wp-h2 { break-after: avoid }`) y así sigue valiendo si mañana la
      // lleva otro bloque.
      pegaAlSiguiente: cs.breakAfter === 'avoid',
    });
  }

  if (previo === null) root.removeAttribute('style');
  else root.setAttribute('style', previo);

  return bloques;
}

/**
 * Recalcula al cambiar la hoja, con un respiro para no medir en cada tecla.
 * `results` entra en las dependencias porque el alto de una ecuación depende
 * del resultado que muestra, no solo de su fuente.
 */
export function usePaginacion(regions: Region[], results: SheetResults): Paginacion {
  const [pag, setPag] = useState<Paginacion>(VACIA);

  useEffect(() => {
    let cancelado = false;

    const medir = () => {
      const root = document.querySelector<HTMLElement>('.worksheet-print');
      if (!root || cancelado) return;
      const saltos = new Set(regions.filter((r) => r.pageBreak).map((r) => r.id));
      const bloques = medirBloques(root, saltos);
      if (cancelado || bloques.length === 0) return;
      const paginas = paginar(bloques);
      setPag({
        paginas,
        porRegion: paginaPorBloque(paginas),
        cortes: cortesDe(paginas),
        largos: bloques.filter((b) => b.alto > A4_ALTO_UTIL_PX).map((b) => b.id),
      });
    };

    // Las tipografías cambian el alto del texto: medir antes de que carguen da
    // una paginación que se corrige sola un segundo después, y el usuario ve
    // los cortes saltar. Se espera a que estén listas (resuelto al instante
    // desde la segunda vez).
    const t = setTimeout(() => {
      const listas = document.fonts?.ready ?? Promise.resolve();
      void listas.then(() => requestAnimationFrame(medir));
    }, 250);

    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [regions, results]);

  return pag;
}
