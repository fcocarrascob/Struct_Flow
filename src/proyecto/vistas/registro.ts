// Las vistas geométricas que una obra puede instanciar, por id. Una vista es
// código, no un archivo de la biblioteca: el número de piezas es variable y el
// 3D no sale de un SVG con tokens (`docs/rumbo.md`, «La base de columna como
// modelo geométrico, y sus componentes»).

import type { Campo, Config, DefVista, Opcion } from './tipos';
import { cumple } from './condicion';
import { CAMPOS_BASE_COLUMNA, OPCIONES_BASE_COLUMNA } from './base-columna/campos';
import { construirBaseColumna } from './base-columna/modelo';
import { PLANTILLA_BASE_COLUMNA } from './base-columna/plantilla';
import { VERSIONES_BASE_COLUMNA } from './base-columna/versiones/indice';

export const VISTAS: Record<string, DefVista> = {
  'base-columna': {
    id: 'base-columna',
    titulo: 'Base de columna',
    version: 1,
    opciones: OPCIONES_BASE_COLUMNA,
    campos: CAMPOS_BASE_COLUMNA,
    construir: construirBaseColumna,
    plantilla: PLANTILLA_BASE_COLUMNA,
    versiones: VERSIONES_BASE_COLUMNA,
  },
};

/**
 * La configuración entera: cada opción con su variante, la guardada si es una de
 * las suyas y si no la de por defecto. Una vista guardada sin configuración es la
 * completa, que es la que había antes de que existieran las opciones.
 */
export function configCompleta(def: DefVista, config?: Readonly<Record<string, string>>): Config {
  const salida: Config = {};
  for (const o of def.opciones) {
    const v = config?.[o.clave];
    // Las opciones se resuelven en orden: `soloSi` mira las de antes, ya resueltas.
    salida[o.clave] =
      o.soloSi && !cumple(o.soloSi, salida)
        ? 'no'
        : v !== undefined && o.variantes.some((x) => x.id === v)
          ? v
          : o.porDefecto;
  }
  return salida;
}

/** Si `soloSi` apaga la opción con esta configuración. */
export function opcionApagada(o: Opcion, config: Config): boolean {
  return !!o.soloSi && !cumple(o.soloSi, config);
}

/** Los campos de una configuración: fuera los de un componente que no está. */
export function camposActivos(def: DefVista, config: Config): Campo[] {
  return def.campos.filter((c) => !c.componente || config[c.componente] !== 'no');
}

/** Los datos por defecto de una vista, para arrancarla o probarla. */
export function datosPorDefecto(campos: Campo[]): Record<string, number> {
  return Object.fromEntries(campos.map((c) => [c.nombre, c.porDefecto]));
}
