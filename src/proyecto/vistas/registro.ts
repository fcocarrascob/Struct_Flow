// Las vistas geométricas que una obra puede instanciar, por id. Una vista es
// código, no un archivo de la biblioteca: el número de piezas es variable y el
// 3D no sale de un SVG con tokens (`docs/rumbo.md`, «La base de columna como
// modelo geométrico, y sus componentes»).

import type { Campo, Config, DefVista } from './tipos';
import { CAMPOS_BASE_COLUMNA, OPCIONES_BASE_COLUMNA } from './base-columna/campos';
import { construirBaseColumna } from './base-columna/modelo';

export const VISTAS: Record<string, DefVista> = {
  'base-columna': {
    id: 'base-columna',
    titulo: 'Base de columna',
    version: 1,
    opciones: OPCIONES_BASE_COLUMNA,
    campos: CAMPOS_BASE_COLUMNA,
    construir: construirBaseColumna,
  },
};

/**
 * La configuración entera: cada opción con su variante, la guardada si es una de
 * las suyas y si no la de por defecto. Una vista guardada sin configuración es la
 * completa, que es la que había antes de que existieran las opciones.
 */
export function configCompleta(def: DefVista, config?: Readonly<Record<string, string>>): Config {
  return Object.fromEntries(
    def.opciones.map((o) => {
      const v = config?.[o.clave];
      return [o.clave, v !== undefined && o.variantes.some((x) => x.id === v) ? v : o.porDefecto];
    }),
  );
}

/** Los campos de una configuración: fuera los de un componente que no está. */
export function camposActivos(def: DefVista, config: Config): Campo[] {
  return def.campos.filter((c) => !c.componente || config[c.componente] !== 'no');
}

/** Los datos por defecto de una vista, para arrancarla o probarla. */
export function datosPorDefecto(campos: Campo[]): Record<string, number> {
  return Object.fromEntries(campos.map((c) => [c.nombre, c.porDefecto]));
}
