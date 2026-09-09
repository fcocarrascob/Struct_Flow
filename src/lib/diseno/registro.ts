// El catálogo de módulos de diseño. La landing, la página `/diseno` y
// `verify:modulos` se pueblan solo de aquí; no hay una segunda lista que
// mantener sincronizada.

import type { Entradas, ModuloDiseno } from './tipos';
import { vigaHormigon } from './viga-hormigon';

export const MODULOS: ModuloDiseno<Entradas>[] = [vigaHormigon as ModuloDiseno<Entradas>];

export function moduloPorId(id: string): ModuloDiseno<Entradas> | undefined {
  return MODULOS.find((mod) => mod.id === id);
}
