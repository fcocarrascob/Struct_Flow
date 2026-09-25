// El modelo geométrico de una vista: piezas en milímetros, verificaciones de
// choque y coherencia, y valores derivados.
//
// Es PURO —sin mathjs, sin React, sin azar— y determinista: los mismos datos dan
// las mismas piezas en el mismo orden, así que el SVG y la hoja que salen de él
// son siempre los mismos bytes. Vive fuera de `src/lib` por el sello del motor
// (`docs/rumbo.md`, «La base de columna como modelo geométrico»).
//
// Ejes: el origen está en el eje de la columna, z = 0 es la cara superior del
// pedestal y z crece hacia arriba. X e Y son los del modelo estructural.

import type { Plantilla } from '../obra/ensamble';

/** Qué es una pieza: decide su color y en qué vista se dibuja oculta. */
export type Rol =
  | 'pedestal'
  | 'barra'
  | 'estribo'
  | 'placa'
  | 'mortero'
  | 'columna'
  | 'nervio'
  | 'chapa'
  | 'perno'
  | 'golilla'
  | 'llave';

interface PiezaBase {
  id: string;
  rol: Rol;
}

/** Un paralelepípedo alineado con los ejes. */
export interface Caja extends PiezaBase {
  tipo: 'caja';
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/** Un cilindro de eje vertical. */
export interface Cilindro extends PiezaBase {
  tipo: 'cilindro';
  x: number;
  y: number;
  r: number;
  z0: number;
  z1: number;
}

/** Un prisma de eje vertical: la columna en I, la llave en cruz. */
export interface Prisma extends PiezaBase {
  tipo: 'prisma';
  contorno: [number, number][];
  z0: number;
  z1: number;
}

/** Un lazo horizontal cerrado de barra redonda: un estribo. */
export interface Lazo extends PiezaBase {
  tipo: 'lazo';
  puntos: [number, number][];
  z: number;
  r: number;
}

export type Pieza = Caja | Cilindro | Prisma | Lazo;

/**
 * Una verificación geométrica: `valor` comparado con `limite` según `sentido`.
 * `piezas` son las que la verificación involucra, para marcarlas en el dibujo.
 */
export interface Chequeo {
  id: string;
  texto: string;
  valor: number;
  limite: number;
  sentido: '>=' | '<=';
  unidad: string;
  cumple: boolean;
  piezas: string[];
}

/** Un valor que sale de la geometría, con el criterio con que se obtuvo. */
export interface Derivado {
  nombre: string;
  valor: number;
  unidad: string;
  criterio: string;
}

export interface ModeloGeometrico {
  piezas: Pieza[];
  chequeos: Chequeo[];
  derivados: Derivado[];
}

/** Un dato de la vista: se ata a una expresión de la obra, como el campo de una genérica. */
export interface Campo {
  nombre: string;
  unidad: string;
  descripcion: string;
  /** Valor por defecto, en `unidad`. Uno declarado como supuesto lo dice en `supuesto`. */
  porDefecto: number;
  supuesto?: string;
  /**
   * La opción de la configuración de la que depende el campo: si esa opción está en
   * `'no'`, el componente no está y el campo tampoco. Sin ella, está siempre.
   */
  componente?: string;
}

/**
 * Una opción de la configuración de una vista: qué componente es y en qué
 * variantes viene. La variante `'no'` es la ausencia del componente.
 */
export interface Opcion {
  clave: string;
  titulo: string;
  variantes: { id: string; titulo: string }[];
  porDefecto: string;
}

/** La configuración de una vista: por cada opción, su variante. */
export type Config = Record<string, string>;

export interface DefVista {
  id: string;
  titulo: string;
  version: number;
  opciones: Opcion[];
  /** Todos los campos de todas las variantes; los de una configuración, con `camposActivos`. */
  campos: Campo[];
  construir(datos: Record<string, number>, config: Config): ModeloGeometrico;
  /** El grupo de cálculos que la acompaña, si se puede armar con ella (`obra/ensamble.ts`). */
  plantilla?: Plantilla;
}
