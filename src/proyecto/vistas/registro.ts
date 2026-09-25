// Las vistas geométricas que una obra puede instanciar, por id. Una vista es
// código, no un archivo de la biblioteca: el número de piezas es variable y el
// 3D no sale de un SVG con tokens (`docs/rumbo.md`, «La base de columna como
// modelo geométrico»).

import type { Campo, DefVista } from './tipos';
import { CAMPOS_BASE_COLUMNA } from './base-columna/campos';
import { construirBaseColumna } from './base-columna/modelo';

export const VISTAS: Record<string, DefVista> = {
  'base-columna': {
    id: 'base-columna',
    titulo: 'Base de columna',
    version: 1,
    campos: CAMPOS_BASE_COLUMNA,
    construir: construirBaseColumna,
  },
};

/** Los datos por defecto de una vista, para arrancarla o probarla. */
export function datosPorDefecto(campos: Campo[]): Record<string, number> {
  return Object.fromEntries(campos.map((c) => [c.nombre, c.porDefecto]));
}
