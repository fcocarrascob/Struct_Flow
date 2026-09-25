// Las condiciones sobre la configuración de una vista: cuándo existe una parte de
// su plantilla (`obra/ensamble.ts`) y cuándo una opción tiene sentido
// (`Opcion.soloSi`). Puras, sin nada de la obra.

import type { Config } from './tipos';

/**
 * Cuándo se cumple, según la configuración:
 *   - `clave`: el componente está (su variante no es `'no'`);
 *   - `!clave`: no está;
 *   - `clave=a|b`: su variante es una de esas;
 *   - `clave!=a|b`: su variante no es ninguna de esas;
 *   - `c1&c2`: se cumplen todas.
 */
export type Condicion = string;

const CONDICION_RE = /^(!?)([\p{L}_][\p{L}\p{N}_-]*)(?:(!?=)([\p{L}\p{N}_|-]+))?$/u;

export interface CondicionLeida {
  clave: string;
  variantes?: string[];
  niega: boolean;
}

/** Cada término de la condición desarmado, o `null` si alguno no se entiende. */
export function leerCondicion(si: Condicion): CondicionLeida[] | null {
  const partes = si.split('&').map((p) => p.trim());
  const salida: CondicionLeida[] = [];
  for (const p of partes) {
    const r = CONDICION_RE.exec(p);
    if (!r || (r[1] && r[3])) return null;
    const [, neg, clave, op, lista] = r;
    salida.push(op ? { clave, variantes: lista.split('|'), niega: op === '!=' } : { clave, niega: !!neg });
  }
  return salida;
}

export function cumple(si: Condicion | undefined, config: Config): boolean {
  if (!si) return true;
  const partes = leerCondicion(si);
  // Una condición ilegible no se cumple nunca: mejor una pieza de menos, que se
  // ve, que una de más calculando fuera de su sitio. `problemasDePlantilla` la señala.
  if (!partes) return false;
  return partes.every((c) => {
    const v = config[c.clave];
    const dentro = c.variantes ? c.variantes.includes(v) : v !== 'no';
    return c.niega ? !dentro : dentro;
  });
}
