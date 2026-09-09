// ─────────────────────────────────────────────────────────────────────────────
// Las rutas de la aplicación, sin dependencias.
//
// Hay cinco vistas y el repo tiene cuatro dependencias de runtime; traer un
// router entero para esto sería desproporcionado. Vive en `src/lib/` y no
// importa React a propósito: parsear y construir una URL es lógica pura, y el
// invariante de esta capa es que se pueda usar (y probar) fuera del navegador.
// El puente con React es `src/components/useRuta.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export type Ruta =
  | { vista: 'inicio' }
  | { vista: 'planillas' }
  | { vista: 'canvas' }
  | { vista: 'diseno' }
  | { vista: 'modulo'; id: string }
  /** Herramientas de calibración de la página. Solo se renderiza en desarrollo. */
  | { vista: 'calibrar' };

/** Se emite tras `navegar()`, porque `pushState` no dispara `popstate`. */
export const EVENTO_RUTA = 'structflow:ruta';

/** El id de un módulo viaja en la URL: mismo alfabeto que el slug de una planilla. */
const ID_RE = /^[a-z0-9-]+$/;

export function parsearRuta(pathname: string): Ruta {
  const partes = pathname.split('/').filter(Boolean);
  if (partes.length === 0) return { vista: 'inicio' };
  if (partes[0] === 'planillas' && partes.length === 1) return { vista: 'planillas' };
  if (partes[0] === 'canvas' && partes.length === 1) return { vista: 'canvas' };
  if (partes[0] === 'calibrar' && partes.length === 1) return { vista: 'calibrar' };
  if (partes[0] === 'diseno') {
    if (partes.length === 1) return { vista: 'diseno' };
    if (partes.length === 2 && ID_RE.test(partes[1])) return { vista: 'modulo', id: partes[1] };
  }
  // Una ruta desconocida cae en el inicio en vez de en una página en blanco.
  return { vista: 'inicio' };
}

export function href(ruta: Ruta): string {
  switch (ruta.vista) {
    case 'inicio':
      return '/';
    case 'planillas':
      return '/planillas';
    case 'canvas':
      return '/canvas';
    case 'diseno':
      return '/diseno';
    case 'modulo':
      return `/diseno/${ruta.id}`;
    case 'calibrar':
      return '/calibrar';
  }
}

/** Navega sin recargar. `busqueda` conserva un query string (los deep-links del canvas). */
export function navegar(ruta: Ruta, busqueda = ''): void {
  if (typeof window === 'undefined') return;
  const url = href(ruta) + (busqueda && !busqueda.startsWith('?') ? `?${busqueda}` : busqueda);
  window.history.pushState({}, '', url);
  window.dispatchEvent(new Event(EVENTO_RUTA));
}

/**
 * Los deep-links publicados son `/?planilla=<slug>` y `/?plantilla=<id>`, de
 * cuando el canvas era la raíz. Ahora la raíz es el menú, así que se reescriben
 * a `/canvas` antes del primer render.
 *
 * Con `replaceState` y no `pushState`: el redirigido no debe quedar en el
 * historial, o el botón atrás rebotaría contra él.
 */
export function redirigirDeepLinkAntiguo(): void {
  if (typeof window === 'undefined') return;
  const { pathname, search } = window.location;
  if (pathname !== '/' || !search) return;
  const params = new URLSearchParams(search);
  if (!params.has('planilla') && !params.has('plantilla')) return;
  window.history.replaceState({}, '', `/canvas${search}`);
}
