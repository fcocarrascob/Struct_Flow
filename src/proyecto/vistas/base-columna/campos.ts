// Los datos de la vista de la base de columna. Se atan a la obra por nombre, como
// los campos de una genérica; los valores por defecto son los del Pachón.
//
// Los que ninguna genérica usa —el espesor de la placa de apoyo embebida, la
// tuerca, el árido, cómo se disponen los nervios— son datos propios de la
// geometría y llevan su `supuesto`.

import type { Campo, Opcion } from '../tipos';

/**
 * Los componentes que pueden faltar. La columna en I, la placa, los pernos y el
 * pedestal están siempre; una columna HSS o una llave simple serán variantes
 * nuevas de una opción, no una vista aparte.
 */
export const OPCIONES_BASE_COLUMNA: Opcion[] = [
  {
    clave: 'placa',
    titulo: 'Placa base',
    variantes: [
      { id: 'momento', titulo: 'Con momento (gran excentricidad)' },
      { id: 'rotulada', titulo: 'Rotulada o con momento bajo' },
    ],
    porDefecto: 'momento',
  },
  {
    clave: 'silla',
    titulo: 'Silla de anclaje',
    variantes: [
      { id: 'nervios', titulo: 'Ala extendida, nervios y chapa superior' },
      { id: 'no', titulo: 'Sin silla: el perno aprieta sobre la placa' },
    ],
    porDefecto: 'nervios',
    soloSi: 'placa=momento',
    soloSiTexto: 'la silla cuelga del bloque comprimido de la placa con momento',
  },
  {
    clave: 'llave',
    titulo: 'Llave de corte',
    variantes: [
      { id: 'cruz', titulo: 'En cruz, dos chapas' },
      { id: 'no', titulo: 'Sin llave' },
    ],
    porDefecto: 'cruz',
  },
  {
    // No es una pieza del dibujo: es de dónde salen las fuerzas de diseño. Vive
    // aquí porque la configuración de la base es una sola, y el ensamble la lee.
    clave: 'capacidad',
    titulo: 'Fuerzas de capacidad',
    variantes: [
      { id: 'aisc341', titulo: 'AISC 341 §D2.6: pórtico arriostrado en X, de momento en Y' },
      { id: 'no', titulo: 'Sin capacidad: solo las combinaciones del modelo' },
    ],
    porDefecto: 'aisc341',
    soloSi: 'placa=momento',
    soloSiTexto: 'una base rotulada no transmite el momento de la columna',
  },
];

const silla = (c: Campo): Campo => ({ ...c, componente: 'silla' });
const llave = (c: Campo): Campo => ({ ...c, componente: 'llave' });

export const CAMPOS_BASE_COLUMNA: Campo[] = [
  // Placa y mortero
  { nombre: 'L_bp', unidad: 'mm', descripcion: 'Largo de la placa, en Y (dirección de la flexión)', porDefecto: 1800 },
  { nombre: 'B_bp', unidad: 'mm', descripcion: 'Ancho de la placa, en X', porDefecto: 1150 },
  { nombre: 't_bp', unidad: 'mm', descripcion: 'Espesor de la placa', porDefecto: 65 },
  { nombre: 't_gr', unidad: 'mm', descripcion: 'Espesor del mortero de nivelación', porDefecto: 40 },

  // Columna
  { nombre: 'd_col', unidad: 'mm', descripcion: 'Canto de la columna, en Y', porDefecto: 1000 },
  { nombre: 'bf_col', unidad: 'mm', descripcion: 'Ancho del ala, en X', porDefecto: 550 },
  { nombre: 'tf_col', unidad: 'mm', descripcion: 'Espesor del ala', porDefecto: 50 },
  { nombre: 'tw_col', unidad: 'mm', descripcion: 'Espesor del alma', porDefecto: 16 },

  // Pernos
  { nombre: 'n_col', unidad: '', descripcion: 'Pernos de cada fila', porDefecto: 5 },
  { nombre: 'd_perno', unidad: 'mm', descripcion: 'Diámetro del perno', porDefecto: 48 },
  { nombre: 'y_t', unidad: 'mm', descripcion: 'Distancia de cada fila al eje de la columna', porDefecto: 767 },
  { nombre: 'x_ext', unidad: 'mm', descripcion: 'Distancia del perno extremo al eje, en X', porDefecto: 480 },
  { nombre: 'h_ef', unidad: 'mm', descripcion: 'Embebido eficaz: de la cara del hormigón a la de apoyo de la placa embebida', porDefecto: 1950 },
  { nombre: 'b_ap', unidad: 'mm', descripcion: 'Lado de la placa de apoyo embebida', porDefecto: 140 },
  {
    nombre: 't_ap',
    unidad: 'mm',
    descripcion: 'Espesor de la placa de apoyo embebida',
    porDefecto: 25,
    supuesto: 'espesor de la placa de apoyo embebida, sin verificar',
  },
  {
    nombre: 'a_tuerca',
    unidad: 'mm',
    descripcion: 'Ancho de la tuerca o arandela sobre la chapa superior, o sobre la placa si no hay silla',
    porDefecto: 100,
    supuesto: 'arandela de 100 mm sobre la chapa superior de la silla',
  },
  {
    nombre: 'h_tuerca',
    unidad: 'mm',
    descripcion: 'Alto de la tuerca',
    porDefecto: 38,
    supuesto: 'tuerca de alto 0,8·d',
  },

  // Silla de anclaje
  silla({ nombre: 'ALA_EXT', unidad: 'mm', descripcion: 'Ancho del ala extendida, en X', porDefecto: 950 }),
  silla({ nombre: 'NER_H', unidad: 'mm', descripcion: 'Altura del nervio', porDefecto: 400 }),
  silla({ nombre: 'NER_L', unidad: 'mm', descripcion: 'Proyección del nervio desde la cara del ala', porDefecto: 350 }),
  silla({ nombre: 'NER_T', unidad: 'mm', descripcion: 'Espesor del nervio', porDefecto: 20 }),
  silla({ nombre: 'CH_B', unidad: 'mm', descripcion: 'Ancho de la chapa superior, en X', porDefecto: 950 }),
  silla({ nombre: 'CH_L', unidad: 'mm', descripcion: 'Largo de la chapa superior, en Y', porDefecto: 350 }),
  silla({ nombre: 'CH_T', unidad: 'mm', descripcion: 'Espesor de la chapa superior', porDefecto: 50 }),
  silla({
    nombre: 'disp_nerv',
    unidad: '',
    descripcion: 'Disposición de los nervios: 1, uno entre cada par de pernos y uno fuera de cada extremo; 2, dos por perno, a la luz declarada',
    porDefecto: 1,
    supuesto: 'un nervio compartido entre pernos contiguos, como lee la silla su frac_nervio',
  }),
  silla({ nombre: 'luz_nerv', unidad: 'mm', descripcion: 'Luz libre entre los nervios que flanquean un perno, la que usan la placa y la silla', porDefecto: 192 }),

  // Llave de corte
  llave({ nombre: 't_sl', unidad: 'mm', descripcion: 'Espesor de cada chapa de la llave', porDefecto: 65 }),
  llave({ nombre: 'h_sl', unidad: 'mm', descripcion: 'Altura de la llave bajo el mortero', porDefecto: 100 }),
  llave({ nombre: 'b_sl', unidad: 'mm', descripcion: 'Largo de cada chapa de la llave en cruz', porDefecto: 1100 }),
  llave({
    nombre: 'n_niv_sin_ramas',
    unidad: '',
    descripcion: 'Niveles de estribo de la cabeza que van sin ramas interiores, para que la llave no las cruce: solo el perimetral',
    porDefecto: 1,
    supuesto: 'el primer nivel de estribos, que cae en la altura de la llave, va sin ramas interiores',
  }),

  // Pedestal
  { nombre: 'PED_X', unidad: 'mm', descripcion: 'Lado del pedestal en X', porDefecto: 1500 },
  { nombre: 'PED_Y', unidad: 'mm', descripcion: 'Lado del pedestal en Y', porDefecto: 1950 },
  { nombre: 'H_PED', unidad: 'mm', descripcion: 'Altura del pedestal', porDefecto: 2100 },
  { nombre: 'n_barras', unidad: '', descripcion: 'Barras longitudinales', porDefecto: 36 },
  { nombre: 'db_long', unidad: 'mm', descripcion: 'Diámetro de las barras longitudinales', porDefecto: 36 },
  { nombre: 'recub', unidad: 'mm', descripcion: 'Del borde del pedestal al eje de las barras', porDefecto: 84 },
  { nombre: 'db_est', unidad: 'mm', descripcion: 'Diámetro de los estribos', porDefecto: 20 },
  { nombre: 'n_ramas', unidad: '', descripcion: 'Ramas de estribo por dirección', porDefecto: 6 },
  { nombre: 'sep_est', unidad: 'mm', descripcion: 'Separación de estribos en el fuste', porDefecto: 150 },
  { nombre: 'sep_zp', unidad: 'mm', descripcion: 'Separación de estribos en la zona confinada', porDefecto: 75 },
  {
    nombre: 'd_agg',
    unidad: 'mm',
    descripcion: 'Tamaño máximo del árido',
    porDefecto: 25,
    supuesto: 'árido de 25 mm',
  },
  {
    nombre: 'recub_inf',
    unidad: 'mm',
    descripcion: 'Recubrimiento bajo la placa de apoyo embebida y en los extremos de las barras',
    porDefecto: 75,
    supuesto: 'recubrimiento de 75 mm contra el terreno o la zapata',
  },
];
