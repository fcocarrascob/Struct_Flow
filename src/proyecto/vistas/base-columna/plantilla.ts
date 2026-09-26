// El grupo de cálculos de una base de columna, como plantilla: lo que `armarEnsamble`
// instancia por tipo de apoyo (`obra/ensamble.ts`).
//
// Salió del grupo «Base de columna» del Pachón, que cierra como cálculo, con tres
// cambios que no mueven un número: el mortero pasa de la llave a la placa
// (`t_gr_pb`), porque lo usan también la silla y la vista; la sección de la
// columna pasa de la hoja de capacidad a la de datos, porque la usan la silla y la
// vista; y la separación de estribos del fuste (`sep_est_ped`) pasa a ser un dato,
// que antes el pedestal y la vista repetían cada uno por su cuenta. Los valores de
// partida son los del Pachón, y la hoja lo marca: son supuestos por confirmar.
//
// Los nombres van sin sufijo (se agrega el del tipo al instanciar) y las
// gobernantes del nodo de apoyos con marcadores: `N_c_$T_$D` es la compresión que
// gobierna en el conjunto de diseño, y `M_m_$T_$S` el momento que gobierna en el
// de sobrerresistencia. Externas, además de las gobernantes: `H_int_dg`,
// `H_ext_dg` y `T_ext_dg`, las fuerzas de capacidad de las diagonales que llegan a
// la base, que define el grupo del arriostramiento.

import type { BloquePlantilla, Plantilla, SeccionPlantilla } from '../../obra/ensamble';

const t = (src: string, si?: string): BloquePlantilla => ({ kind: 'text', src, ...(si ? { si } : {}) });
const f = (src: string, si?: string): BloquePlantilla => ({ kind: 'math', src, ...(si ? { si } : {}) });
/** Lo que es solo de una variante de la placa. */
const MOM = 'placa=momento';
const ROT = 'placa=rotulada';
const sec = (clave: string, bloques: BloquePlantilla[], si?: string): SeccionPlantilla => ({ clave, bloques, ...(si ? { si } : {}) });

const TONF = { unidad: 'tonf', soloValor: true };
const TONF_M = { unidad: 'tonf*m', soloValor: true };

// ── Datos y solicitaciones ───────────────────────────────────────────────────

const DATOS = [
  sec('intro', [
    t('# Base de columna $G — datos'),
    t(
      'Datos y solicitaciones de la base del tipo de apoyo $G. Las solicitaciones mayoradas llegan del modelo estructural, ' +
        'por tipo de apoyo, con las combinaciones de diseño ($D) y las de sobrerresistencia ($S).',
    ),
  ]),
  sec('solicitaciones-rot', [
    t('## Solicitaciones'),
    t(
      'Base rotulada: la columna no transmite momento. Entran la compresión máxima y el corte máximo del conjunto de ' +
        'diseño ($D) y la tracción máxima del de sobrerresistencia ($S), con lo que las acompaña en cada combinación. ' +
        'N positiva es compresión.',
    ),
  ], 'placa=rotulada'),
  sec('solicitaciones-sincap', [
    t('## Solicitaciones'),
    t(
      'La tracción de los pernos sale de las combinaciones de sobrerresistencia ($S): el caso de momento máximo y el de ' +
        'mayor excentricidad M/N. La compresión y el corte, del conjunto de diseño ($D). N positiva es compresión.',
    ),
  ], 'placa=momento&!capacidad'),
  sec('solicitaciones', [
    t('## Solicitaciones'),
    t(
      'En Y la base es una conexión de momento: su resistencia a flexión requerida es la menor entre 1,1·Ry·Fy·Z de la columna ' +
        'y el momento con la carga sísmica amplificada por sobrerresistencia, siempre que controle un estado límite dúctil de la ' +
        'base o de la fundación (AISC 341-22 §D2.6c(b)). Controla el perno, diseñado como fusible (ACI 318-25 §17.10.5.3(a), en ' +
        'la hoja del anclaje). La tracción de los pernos sale entonces de las combinaciones con sobrerresistencia. Entran el caso ' +
        'de momento máximo y el de mayor excentricidad M/N; la placa se diseña con el que dé más tracción. N positiva es compresión.',
    ),
  ], 'placa=momento&capacidad'),
  sec('solicitaciones-llave', [
    t(
      'Supuesto: la llave toma en cada dirección el corte máximo con la tracción que lo acompaña y sin el beneficio de la ' +
        'compresión (ACI 318-25 §17.11.2.2.1). Con las fuerzas de capacidad, el aplastamiento en X se verifica además con el ' +
        'arranque de la base extrema y su corte, y en Y con la mayor tracción de los casos del pórtico de momento.',
    ),
  ], 'llave'),
  sec('solicitaciones-tabla', [
    {
      kind: 'table',
      src: 'Solicitaciones mayoradas de $G',
      tabla: {
        version: 1,
        encabezado: 1,
        celdas: [
          ["'Caso", "'M", "'N", "'V"],
          ["'Tracción 1: momento máximo, $S", 'M_t1 := M_m_$T_$S =', 'N_t1 := N_m_$T_$S =', 'V_t1 := V_m_$T_$S ='],
          ["'Tracción 2: excentricidad máxima, $S", 'M_t2 := M_e_$T_$S =', 'N_t2 := N_e_$T_$S =', 'V_t2 := V_e_$T_$S ='],
          ["'Compresión máxima, $D", 'M_cp := M_c_$T_$D =', 'N_cp := N_c_$T_$D =', "'—"],
          ["'Corte máximo, $D", "'—", 'N_cv := N_v_$T_$D =', 'V_cv := V_v_$T_$D ='],
        ],
        columnas: [{}, TONF_M, TONF, TONF],
      },
    },
  ], 'placa=momento'),
  sec('solicitaciones-rot-tabla', [
    {
      kind: 'table',
      src: 'Solicitaciones mayoradas de $G',
      tabla: {
        version: 1,
        encabezado: 1,
        celdas: [
          ["'Caso", "'M", "'N", "'V"],
          ["'Compresión máxima, $D", 'M_c := M_c_$T_$D =', 'P_c := N_c_$T_$D =', "'—"],
          ["'Tracción máxima, $S", 'M_t := M_t_$T_$S =', 'P_t := N_t_$T_$S =', "'—"],
          ["'Corte máximo, $D", "'—", 'P_v := N_v_$T_$D =', 'V_cv := V_v_$T_$D ='],
        ],
        columnas: [{}, TONF_M, TONF, TONF],
      },
    },
  ], 'placa=rotulada'),
  sec('columna', [
    t('## Columna'),
    t('Supuesto: sección de la columna en I, con el canto en la dirección de la flexión.'),
    // Cada dato va dos veces con el mismo nombre, uno por variante de la placa: los
    // valores de partida acompañan a la placa (una de pórtico, una de hastial), y
    // como el id es el nombre, cambiar de variante conserva la columna escrita.
    f('d_col_pb := 1000 mm', MOM),
    f('bf_col := 550 mm', MOM),
    f('tf_col := 50 mm', MOM),
    f('tw_col := 16 mm', MOM),
    f('d_col_pb := 611 mm', ROT),
    f('bf_col := 324 mm', ROT),
    f('tf_col := 19.1 mm', ROT),
    f('tw_col := 12.7 mm', ROT),
  ]),
  sec('placa', [
    t('## Placa'),
    t('Supuesto: dimensiones de la placa y espesor del mortero de nivelación.'),
    f('L_pb := 1800 mm'),
    f('B_pb := 1150 mm'),
    f('t_pb := 65 mm'),
    f('t_gr_pb := 40 mm'),
    t('Supuesto: coeficiente de placa beta, a confirmar con la geometría definitiva.'),
    f('beta_pb := 0.0831'),
  ], 'placa=momento'),
  sec('placa-rot', [
    t('## Placa'),
    t('Supuesto: dimensiones de la placa y espesor del mortero de nivelación.'),
    f('L_pb := 700 mm'),
    f('B_pb := 500 mm'),
    f('t_pb := 25 mm'),
    f('t_gr_pb := 40 mm'),
  ], 'placa=rotulada'),
  sec('pernos-rot', [
    t('## Pernos de anclaje'),
    t('Supuesto: dos filas de dos pernos M24 dentro del perfil, a cada lado del alma.'),
    f('n_pno := 2'),
    f('d_pno := 24 mm'),
    t('Área resistente a tracción de la rosca (ISO 898-1).'),
    f('Ase_pno := 353 mm^2'),
    f('y_t_pno := 100 mm'),
    f('x_ext_pno := 75 mm'),
    t('Supuesto: holgura del hueco sobre el diámetro del perno.'),
    f('holgura_pno := 12 mm'),
    t(
      'Supuesto: paso de la rosca, fluencia del perno y embebido eficaz. En el extremo embebido, cada perno lleva una placa de ' +
        'apoyo cuadrada con agujero; su área neta es la que apoya contra el hormigón en la extracción y el descascaramiento lateral.',
    ),
    f('paso_rosca := 3 mm'),
    f('fya_pno := 248 MPa'),
    f('h_ef_pno := 700 mm'),
    f('b_ap_pno := 70 mm'),
    f('d_ap_pno := 28 mm'),
    f('A_brg_pno := b_ap_pno^2 - pi*d_ap_pno^2/4 = mm^2'),
    t('Supuesto: el perno estira libre en su tramo superior, dentro de una vaina que lo desliga del hormigón y lo protege del pandeo.'),
    f('l_est_pno := 200 mm'),
    t('Separación entre los pernos de una fila.'),
    f('s_pno := 2*x_ext_pno/(n_pno - 1) = mm'),
  ], 'placa=rotulada'),
  sec('pernos', [
    t('## Pernos de anclaje'),
    t('Supuesto: una fila de pernos a cada lado del eje de flexión.'),
    f('n_pno := 5'),
    f('d_pno := 48 mm'),
    t('Área resistente a tracción de la rosca (ISO 898-1).'),
    f('Ase_pno := 1473 mm^2'),
    f('y_t_pno := 767 mm'),
    f('x_ext_pno := 440 mm'),
    t('Supuesto: holgura del hueco sobre el diámetro del perno.'),
    f('holgura_pno := 12 mm'),
    t(
      'Supuesto: paso de la rosca, fluencia del perno y embebido eficaz. En el extremo embebido, cada perno lleva una placa de ' +
        'apoyo cuadrada con agujero; su área neta es la que apoya contra el hormigón en la extracción y el descascaramiento lateral.',
    ),
    f('paso_rosca := 5 mm'),
    f('fya_pno := 248 MPa'),
    f('h_ef_pno := 1950 mm'),
    f('b_ap_pno := 140 mm'),
    f('d_ap_pno := 52 mm'),
    f('A_brg_pno := b_ap_pno^2 - pi*d_ap_pno^2/4 = mm^2'),
    t('Supuesto: el perno estira libre en su tramo superior, dentro de una vaina que lo desliga del hormigón y lo protege del pandeo.'),
    f('l_est_pno := 400 mm'),
    t('Separación entre pernos de la fila.'),
    f('s_pno := 2*x_ext_pno/(n_pno - 1) = mm'),
  ], 'placa=momento'),
  sec(
    'silla',
    [
      t('## Silla de anclaje'),
      t(
        'Supuesto: silla de nervios: ala de la columna extendida con chapas a tope, un nervio entre cada par de pernos y uno ' +
          'fuera de cada perno extremo, y chapa superior.',
      ),
      f('ALA_EXT_sl := 1120 mm'),
      f('NER_H_sl := 400 mm'),
      f('NER_L_sl := 350 mm'),
      f('NER_T_sl := 20 mm'),
      f('CH_B_sl := 1120 mm'),
      f('CH_L_sl := 350 mm'),
      f('CH_T_sl := 50 mm'),
      t(
        'Con un nervio entre cada par de pernos, la luz libre de la chapa superior entre los nervios que flanquean un perno es ' +
          'el paso menos el espesor del nervio, y el nervio de borde queda medio paso más allá del perno extremo. La vista ' +
          'geométrica comprueba que caben.',
      ),
      f('sep_nerv_pb := s_pno - NER_T_sl = mm'),
      f('x_nerv_pb := x_ext_pno + s_pno/2 = mm'),
    ],
    'silla',
  ),
  // Los datos de partida del pedestal de la variante rotulada, en su sección y
  // antes de la común: los del pórtico se quedan en su sitio, marcados por bloque,
  // para no correr los índices de una hoja ya armada.
  sec('pedestal-rot', [
    t('## Pedestal'),
    t('Supuesto: dimensiones del pedestal.'),
    f('PED_L_pb := 900 mm'),
    f('PED_B_pb := 700 mm'),
    f('H_ped_pb := 1500 mm'),
    t(
      'Supuesto: armadura longitudinal repartida en el perímetro, con estribos cerrados. Es la armadura de anclaje de los ' +
        'pernos: el pedestal es chico para que sus barras caigan dentro del cono de los pernos, que están dentro del perfil. ' +
        'El primer estribo va a s1_est_ped de la cara superior.',
    ),
    f('db_long_ped := 25 mm'),
    f('n_barras_ped := 16'),
    f('recub_ped := 60 mm'),
    f('db_est_ped := 16 mm'),
    f('n_ramas_ped := 4'),
    f('sep_est_ped := 150 mm'),
    f('sep_zp_ped := 75 mm'),
    f('s1_est_ped := 50 mm'),
    t('Supuesto: la columna rotulada no forma parte del sistema sismorresistente, así que el pedestal no lleva el detallado del §18.7 de ACI 318-25.'),
  ], ROT),
  sec('pedestal', [
    t('## Pedestal', MOM),
    t('Supuesto: dimensiones del pedestal.', MOM),
    f('PED_L_pb := 1950 mm', MOM),
    f('PED_B_pb := 1500 mm', MOM),
    f('H_ped_pb := 2100 mm', MOM),
    t('Distancias de la fila traccionada a los bordes del pedestal.'),
    f('c_a1_pno := PED_B_pb/2 - x_ext_pno = mm'),
    f('c_a2_pno := PED_L_pb/2 - y_t_pno = mm'),
    t(
      'Distancia de la fila traccionada al borde opuesto del pedestal. Con tres o más bordes a menos de 1,5·h_ef, el cono se ' +
        'calcula con la mayor de las distancias que influyen, las que no pasan de 1,5·h_ef (ACI 318-25 §17.6.2.1.2).',
    ),
    f('c_a_op_pno := PED_L_pb/2 + y_t_pno = mm'),
    f('n_bordes_pno := 2*(c_a1_pno < 1.5*h_ef_pno) + (c_a2_pno < 1.5*h_ef_pno) + (c_a_op_pno < 1.5*h_ef_pno) ='),
    f(
      'c_a_max_pno := max(c_a1_pno < 1.5*h_ef_pno ? c_a1_pno : 0 mm, c_a2_pno < 1.5*h_ef_pno ? c_a2_pno : 0 mm, ' +
        'c_a_op_pno < 1.5*h_ef_pno ? c_a_op_pno : 0 mm) = mm',
    ),
    t(
      'Supuesto: armadura longitudinal repartida en el perímetro, con estribos cerrados. Las barras del pedestal son la ' +
        'armadura de anclaje de los pernos: cuentan las que quedan a menos de 0,5·h_ef de la fila traccionada, medido en ' +
        'planta, y las cuenta la vista geométrica (n_cont_ped). El primer estribo va a s1_est_ped de la cara superior.',
    ),
    f('db_long_ped := 36 mm', MOM),
    f('n_barras_ped := 36', MOM),
    f('recub_ped := 84 mm', MOM),
    f('db_est_ped := 25 mm', MOM),
    f('n_ramas_ped := 6', MOM),
    f('sep_est_ped := 150 mm', MOM),
    f('sep_zp_ped := 75 mm', MOM),
    f('s1_est_ped := 50 mm', MOM),
    t(
      'Los casos de sobrerresistencia reemplazan a los de diseño de tracción porque los dominan: más momento con menos ' +
        'compresión, también con el corte por la altura del pedestal. El de momento máximo cubre además el de corte máximo. ' +
        'Si alguna de estas comprobaciones falla, los casos de diseño vuelven a hacer falta.',
      MOM,
    ),
    f(
      'v_dom_m := abs(M_m_$T_$S) >= max(abs(M_m_$T_$D), abs(M_v_$T_$D)) and N_m_$T_$S <= min(N_m_$T_$D, N_v_$T_$D) and ' +
        'abs(M_m_$T_$S) + V_m_$T_$S*H_ped_pb >= max(abs(M_m_$T_$D) + V_m_$T_$D*H_ped_pb, abs(M_v_$T_$D) + V_v_$T_$D*H_ped_pb) =',
      MOM,
    ),
    f(
      'v_dom_e := abs(M_e_$T_$S) >= abs(M_e_$T_$D) and N_e_$T_$S <= N_e_$T_$D and ' +
        'abs(M_e_$T_$S) + V_e_$T_$S*H_ped_pb >= abs(M_e_$T_$D) + V_e_$T_$D*H_ped_pb =',
      MOM,
    ),
    t('Solicitaciones en la base del pedestal: el momento de la cara superior más el corte por la altura del pedestal, sumados en valor absoluto.', MOM),
    {
      si: MOM,
      kind: 'table',
      src: 'Solicitaciones en la base del pedestal',
      tabla: {
        version: 1,
        encabezado: 1,
        celdas: [
          ["'Caso", "'P", "'M_X"],
          ["'Compresión máxima, $D", 'P_p1 := N_c_$T_$D =', 'M_p1 := M_c_$T_$D + V_c_$T_$D*H_ped_pb ='],
          ["'Momento máximo, $S", 'P_p2 := N_m_$T_$S =', 'M_p2 := abs(M_m_$T_$S) + V_m_$T_$S*H_ped_pb ='],
          ["'Excentricidad máxima, $S", 'P_p3 := N_e_$T_$S =', 'M_p3 := abs(M_e_$T_$S) + V_e_$T_$S*H_ped_pb ='],
          ["'Compresión máxima, $S", 'P_p4 := N_c_$T_$S =', 'M_p4 := abs(M_c_$T_$S) + V_c_$T_$S*H_ped_pb ='],
        ],
        columnas: [{}, TONF, TONF_M],
      },
    },
    t(
      'Solicitaciones en la base del pedestal: con la base rotulada, el momento en la base del pedestal es solo el del corte ' +
        'por su altura.',
      ROT,
    ),
    {
      si: ROT,
      kind: 'table',
      src: 'Solicitaciones en la base del pedestal',
      tabla: {
        version: 1,
        encabezado: 1,
        celdas: [
          ["'Caso", "'P", "'M_X"],
          ["'Compresión máxima, $D", 'P_p1 := N_c_$T_$D =', 'M_p1 := V_c_$T_$D*H_ped_pb ='],
          ["'Tracción máxima, $S", 'P_p2 := N_t_$T_$S =', 'M_p2 := V_t_$T_$S*H_ped_pb ='],
          ["'Corte máximo, $D", 'P_p3 := N_v_$T_$D =', 'M_p3 := V_v_$T_$D*H_ped_pb ='],
          ["'Compresión máxima, $S", 'P_p4 := N_c_$T_$S =', 'M_p4 := V_c_$T_$S*H_ped_pb ='],
        ],
        columnas: [{}, TONF, TONF_M],
      },
    },
  ]),
  sec(
    'llave-rot',
    [
      t('## Llave de corte'),
      t('Supuesto: llave en cruz de dos chapas bajo el mortero de nivelación, soldadas a la placa con filetes.'),
      f('t_sl_ll := 25 mm'),
      f('h_sl_ll := 100 mm'),
      f('b_sl_ll := 400 mm'),
      f('w_sold_ll := 10 mm'),
    ],
    `llave&${ROT}`,
  ),
  sec(
    'llave',
    [
      t('## Llave de corte', MOM),
      t('Supuesto: llave en cruz de dos chapas bajo el mortero de nivelación, soldadas a la placa con filetes.', MOM),
      f('t_sl_ll := 65 mm', MOM),
      f('h_sl_ll := 100 mm', MOM),
      f('b_sl_ll := 1100 mm', MOM),
      f('w_sold_ll := 20 mm', MOM),
      t(
        'Brazo del par que forman el corte y la reacción sobre la llave: el espesor del mortero más la mitad de la altura ' +
          'eficaz de la chapa, que no pasa de dos veces su espesor.',
      ),
      f('z_llave_pb := t_gr_pb + min(h_sl_ll, 2*t_sl_ll)/2 = mm'),
      t(
        'El arrancamiento del hormigón por el corte de la llave lo toman los estribos del pedestal como armadura de anclaje ' +
          '(ACI 318-25 §17.5.2.1). Cuentan los que cortan la superficie de falla: la altura de la llave más la proyección de un ' +
          'plano a 45° desde su pie hasta la cara del pedestal, con la mitad de las ramas de estribo por dirección en cada nivel.',
      ),
      f('zp_ll := h_sl_ll + (min(PED_B_pb, PED_L_pb) - b_sl_ll)/2 = mm'),
      t(
        'Supuesto: los primeros niveles de estribo, los que caen en la altura de la llave, van sin ramas interiores —solo el ' +
          'perimetral— para que la llave no las cruce; cada uno aporta un estribo cerrado en vez de n_ramas/2. La vista ' +
          'geométrica comprueba que las ramas que siguen pasan bajo el fondo de la llave.',
      ),
      f('n_niv_sin_ramas_ll := 2'),
      t(
        'Los niveles sin ramas interiores pueden llevar además un amarre en rombo por las barras centrales de las caras ' +
          '(amarre_cab_ll = 1; 0 sin él). Es un amarre ADICIONAL a los obligatorios (ACI 318-25 Fig. R25.7.2.3a; ICH, ' +
          'Manual de Detallamiento, §5.5): no los reemplaza. El plano de falla corta dos ramas del rombo, y cada una aporta a ' +
          'una dirección la fracción cos² de su ángulo con ella: a 45°, media rama a cada dirección. Los estribos que cortan ' +
          'el sólido de falla de la llave (n_est_ll) los cuenta la vista geométrica sobre los niveles que dibuja.',
      ),
      f('amarre_cab_ll := 1'),
    ],
    'llave',
  ),
  sec('materiales', [
    t('## Materiales'),
    t('Supuesto: acero de las chapas, de los pernos y del electrodo, y hormigón del pedestal.'),
    f('Fy_pb := 345 MPa'),
    f('futa_pno := 400 MPa'),
    f('fc_ped := 30 MPa'),
    f('Fu_pb := 450 MPa'),
    f('FEXX_pb := 480 MPa'),
  ]),
];

// ── Fuerzas de capacidad (AISC 341-22 §D2.6) ─────────────────────────────────

const CAPACIDAD = [
  sec('intro', [
    t('# Base de columna $G — fuerzas de capacidad'),
    t(
      'Resistencia requerida de la base según AISC 341-22 §D2.6. La base es parte del sistema sismorresistente en las dos ' +
        'direcciones: pórtico arriostrado concéntrico especial en X y pórtico especial de momento en Y. La placa, la llave de ' +
        'corte, el anclaje y el pedestal la reciben como un caso más, junto a las combinaciones de diseño del modelo.',
    ),
  ]),
  sec('columna', [
    t('## Columna'),
    f('Fy_col := 345 MPa'),
    t('Razón entre la fluencia esperada y la mínima especificada de la chapa (AISC 341-22 Tabla A3.2).'),
    f('Ry_col := 1.1'),
    t('Altura del piso: de la base a la cabeza de la columna.'),
    f('H_col := 9.15 m'),
    t('Módulos plásticos de la sección: en torno al eje fuerte, que flexiona el pórtico en Y, y en torno al eje débil, que flexiona en X.'),
    f('Zx_col := bf_col*tf_col*(d_col_pb - tf_col) + tw_col*(d_col_pb - 2*tf_col)^2/4 = mm^3'),
    f('Zy_col := tf_col*bf_col^2/2 + (d_col_pb - 2*tf_col)*tw_col^2/4 = mm^3'),
  ]),
  sec('flexion', [
    t('## Flexión — AISC 341-22 §D2.6c'),
    t(
      'En Y la base es una conexión de momento. Su resistencia a flexión requerida es la menor entre 1,1·Ry·Fy·Z/αs de la ' +
        'columna (§D2.6c(b)(1)) y el momento con sobrerresistencia, siempre que controle un estado límite dúctil de la base o ' +
        'de la fundación (§D2.6c(b)(2)). El perno es ese estado límite: la hoja del anclaje lo verifica como fusible. En X la ' +
        'base no transmite momento en el modelo y el §D2.6c no aplica.',
    ),
    f('Mp_col_Y := 1.1*Ry_col*Fy_col*Zx_col = kN*m'),
    f('v_d26c := abs(M_t1) <= Mp_col_Y and abs(M_t2) <= Mp_col_Y ='),
  ]),
  sec('corte', [
    t('## Corte — AISC 341-22 §D2.6b'),
    t(
      'El corte requerido es la suma de las componentes horizontales de lo que llega a la base. De las diagonales, la ' +
        'resistencia requerida de su conexión (§D2.6b(a)); de la columna, la menor entre 2·Ry·Fy·Z/(αs·H) y el corte con la ' +
        'carga sísmica amplificada por sobrerresistencia (§D2.6b(b)). La suma no es menor que 0,7·Fy·Z/(αs·H) (§D2.6b(c)). ' +
        'Con LRFD, αs = 1.',
    ),
    t('Supuesto: la columna entrega 2·Ry·Fy·Z/(αs·H), la mayor de las dos cotas del §D2.6b(b), sin separar el sismo de cada combinación.'),
    f('V_col_X := 2*Ry_col*Fy_col*Zy_col/H_col = kN'),
    f('V_col_Y := 2*Ry_col*Fy_col*Zx_col/H_col = kN'),
    f('V_min_X := 0.7*Fy_col*Zy_col/H_col = kN'),
    f('V_min_Y := 0.7*Fy_col*Zx_col/H_col = kN'),
    t('En X manda la base a la que llegan dos diagonales; en Y, solo la columna.'),
    f('Ve_X_cl := max(H_int_dg + V_col_X, V_min_X) = kN'),
    f('Ve_Y_cl := max(V_col_Y, V_min_Y) = kN'),
    t('El corte de diseño del pedestal sale de las fuerzas máximas que se pueden generar en sus extremos, y no es menor que el del análisis (ACI 318-25 §18.7.6.1.1).'),
    t(
      'Supuesto: la fuerza máxima en la cabeza del pedestal es la que la base de acero puede transmitir, Ve_X_cl y Ve_Y_cl, ' +
        'del mismo modo que el §18.7.6.1.1 acota el corte de una columna por lo que entregan las vigas que llegan al nudo.',
    ),
    f('Vped_X_cl := max(Ve_X_cl, V_cv) = kN'),
    f('Vped_Y_cl := max(Ve_Y_cl, V_cv) = kN'),
  ]),
  sec('arranque', [
    t('## Arranque — AISC 341-22 §D2.6a'),
    t('La base extrema de un tramo arriostrado recibe el arranque de las diagonales, con el corte de la diagonal traccionada más el de la columna.'),
    t(
      'Supuesto: sin el peso propio que alivia el arranque. El sismo actúa en X y el momento que tracciona la fila de pernos ' +
        'en la placa es el del pórtico en Y, así que el caso entra sin momento y con el par de la llave sumado del lado seguro.',
    ),
    f('M_t3_cl := 0 kN*m'),
    f('N_t3_cl := -T_ext_dg = kN'),
    f('V_t3_cl := H_ext_dg + V_col_X = kN'),
  ]),
  sec('pedestal', [
    t('## Pedestal'),
    t('En la base del pedestal, el corte en X por la altura del pedestal flexiona en torno a Y: con el arranque en la base extrema, y sin axial en la base a la que llegan dos diagonales.'),
    t('Supuesto: sin la compresión de gravedad que acompaña a la base interior.'),
    f('Muy_ext_cl := V_t3_cl*H_ped_pb = kN*m'),
    f('Muy_int_cl := Ve_X_cl*H_ped_pb = kN*m'),
  ]),
];

// ── Resumen ──────────────────────────────────────────────────────────────────

const RESUMEN = [
  sec('intro', [t('# Base de columna $G'), t('Usos de cada elemento de la base y la geometría del conjunto.')]),
  sec('placa', [f('u_pb =')]),
  sec('anclaje', [f('u_anc =')]),
  sec('llave', [f('u_llave =')], 'llave'),
  sec('silla', [f('u_silla =')], 'silla'),
  sec('pedestal', [f('u_ped =')]),
  sec(
    'espesor',
    [t('El espesor de la placa tiene que cubrir además el que pide la llave de corte.'), f('tbp_llave = mm'), f('v_t_llave := t_pb >= tbp_llave =')],
    'llave',
  ),
  sec('dominio', [t('Los casos de sobrerresistencia dominan a los de diseño de tracción.'), f('v_dom_m ='), f('v_dom_e =')], MOM),
  sec('capacidad', [t('Resistencia a flexión requerida de la base (AISC 341-22 §D2.6c).'), f('v_d26c =')], 'capacidad'),
  sec('geometria', [f('v_geo_base =')]),
];

// ── La plantilla ─────────────────────────────────────────────────────────────

export const PLANTILLA_BASE_COLUMNA: Plantilla = {
  externas: [
    { nombre: 'H_int_dg', unidad: 'kN', texto: 'Componente horizontal de la fuerza de capacidad de las diagonales en la base interior (AISC 341-22 §D2.6b(a))' },
    { nombre: 'H_ext_dg', unidad: 'kN', texto: 'Componente horizontal de la fuerza de capacidad de la diagonal traccionada en la base extrema' },
    { nombre: 'T_ext_dg', unidad: 'kN', texto: 'Arranque vertical de la diagonal traccionada en la base extrema (AISC 341-22 §D2.6a)' },
  ],
  nodos: [
    {
      clave: 'datos',
      nombre: 'Base de columna $G — datos',
      hoja: DATOS,
      revisar: 'Geometría, pernos y materiales son de partida (supuestos): confirmarlos para el tipo $G.',
    },
    { clave: 'capacidad', nombre: 'Base de columna $G — capacidad', si: 'capacidad', hoja: CAPACIDAD },
    {
      clave: 'placa',
      nombre: 'Placa base rotulada $G',
      si: ROT,
      frontera: {
        procedencia: 'biblioteca',
        id: 'placa-base-rotulada-generica',
        entradas: { exposicion: 2, torque: 0, phi_b: 0.9, phi_brg: 0.65, phi_sa: 0.75, usa_friccion: 0, mu_fr: 0.4, phi_fr: 0.65 },
        formulas: {
          P_comp: 'P_c', M_comp: 'M_c', P_trac: 'P_t', M_trac: 'M_t', V_u: 'V_cv', P_V: 'P_v',
          L_bp: 'L_pb', B_bp: 'B_pb', t_bp: 't_pb', d_col: 'd_col_pb', bf_col: 'bf_col', tf_col: 'tf_col', tw_col: 'tw_col',
          PED_L: 'PED_L_pb', PED_B: 'PED_B_pb', n_col: 'n_pno', y_t: 'y_t_pno', x_ext: 'x_ext_pno', d_perno: 'd_pno',
          Ase_perno: 'Ase_pno', holgura: 'holgura_pno', Fy_ac: 'Fy_pb', fpc: 'fc_ped', futa: 'futa_pno',
        },
        publica: { u_max: 'u_pb', T_grupo: 'T_pb', n_trac: 'n_trac_pb' },
      },
    },
    {
      clave: 'placa',
      nombre: 'Placa base $G',
      si: MOM,
      frontera: {
        procedencia: 'biblioteca',
        id: 'placa-base-generica',
        entradas: { exposicion: 2, torque: 0, hay_nervios: 1, hay_llave: 1, z_llave: 0.15, phi_b: 0.9, phi_brg: 0.65, phi_sa: 0.75 },
        formulas: {
          L_bp: 'L_pb', B_bp: 'B_pb', t_bp: 't_pb', d_col: 'd_col_pb', PED_L: 'PED_L_pb', PED_B: 'PED_B_pb',
          n_col: 'n_pno', y_t: 'y_t_pno', x_ext: 'x_ext_pno', d_perno: 'd_pno', Ase_perno: 'Ase_pno', holgura: 'holgura_pno',
          sep_nerv: 'sep_nerv_pb', x_nerv_ext: 'x_nerv_pb', Fy_ac: 'Fy_pb', fpc: 'fc_ped', futa: 'futa_pno', beta: 'beta_pb',
          M_comp: 'M_cp', P_comp: 'N_cp', M_trac: 'M_t1', P_trac: 'N_t1', V_trac: 'V_t1', M_trac_2: 'M_t2', P_trac_2: 'N_t2',
          V_trac_2: 'V_t2', z_llave: 'z_llave_pb', M_trac_3: 'M_t3_cl', P_trac_3: 'N_t3_cl', V_trac_3: 'V_t3_cl',
        },
        publica: { u_max: 'u_pb', T_grupo: 'T_pb', caso_trac: 'caso_pb', Yb_comp: 'Yb_pb' },
        capas: [
          { si: '!silla', entradas: { hay_nervios: 0 }, formulas: { sep_nerv: null, x_nerv_ext: null } },
          { si: '!llave', entradas: { hay_llave: 0 }, formulas: { z_llave: null } },
          // Sin la hoja de capacidad no hay tercer caso de tracción: el arranque de las diagonales.
          {
            si: '!capacidad',
            entradas: { M_trac_3: 0, P_trac_3: 0, V_trac_3: 0 },
            formulas: { M_trac_3: null, P_trac_3: null, V_trac_3: null },
          },
        ],
      },
    },
    {
      clave: 'anclaje',
      nombre: 'Anclaje al hormigón $G',
      frontera: {
        procedencia: 'biblioteca',
        id: 'anclaje-hormigon-generica',
        entradas: {
          e_N: 0, lambda_a: 1, fisurado: 1, usa_arm: 1, fy_arm: 420, omega: 1.2, phi_sa: 0.75, phi_c: 0.75, phi_arm: 0.9,
          psi_a: 0.95, psi_cm: 1, k_c: 10, sismo: 1, ductil: 1, n_filas: 1, s_f: 0,
        },
        formulas: {
          Nua_g: 'T_pb', n_trac: 'n_pno', h_ef: 'h_ef_pno', s_1: 's_pno', c_a1: 'c_a1_pno', c_a2: 'c_a2_pno', d_a: 'd_pno',
          n_hilos: '25.4 mm/paso_rosca', A_brg: 'A_brg_pno', fpc: 'fc_ped', futa: 'futa_pno', fya: 'fya_pno',
          n_bordes: 'n_bordes_pno', c_a_max: 'c_a_max_pno', n_arm: 'n_cont_ped', d_arm: 'db_long_ped', l_est: 'l_est_pno',
        },
        publica: { u_max: 'u_anc', N_sa: 'N_sa_pb', As_req: 'As_req_anc' },
        // Con la placa de momento, T_pb es la tracción de la fila más cargada. Con la
        // rotulada traccionan las dos filas, no una. La armadura de anclaje sigue
        // siendo la del pedestal: por eso su pedestal de partida es chico, para que
        // las barras caigan en el cono de pernos dentro del perfil.
        capas: [{ si: ROT, entradas: { n_filas: 2, s_f: null }, formulas: { n_trac: 'n_trac_pb', s_f: '2*y_t_pno' } }],
      },
    },
    {
      clave: 'llave',
      nombre: 'Llave de corte $G',
      si: 'llave',
      frontera: {
        procedencia: 'biblioteca',
        id: 'llave-corte-generica',
        // En X, el corte de la base interior sin axial y, para el aplastamiento, el
        // arranque de la extrema con su corte; en Y, los casos de tracción del pórtico
        // de momento. La compresión no se cuenta.
        entradas: { P_ux: 0, n_chapas: 1, y_chapa: 0, fy_arm: 420, lambda_a: 1, usa_arm_sl: 1 },
        formulas: {
          V_ux: 'Ve_X_cl', V_ux2: 'V_t3_cl', P_ux2: 'min(N_t3_cl, 0 kN)', V_uy: 'Ve_Y_cl', P_uy: 'min(N_t1, N_t2, 0 kN)', t_sl: 't_sl_ll', h_sl: 'h_sl_ll', bY_sl: 'b_sl_ll', bX_sl: 'b_sl_ll', t_bp: 't_pb',
          B_bp: 'B_pb', t_gr: 't_gr_pb', w_sold: 'w_sold_ll', db_est: 'db_est_ped', PED_X: 'PED_B_pb', PED_Y: 'PED_L_pb',
          H_PED: 'H_ped_pb', h_ef: 'h_ef_pno', csl_X: 'x_ext_pno', csl_Y: 'y_t_pno', Yb: 'Yb_pb', n_trac: '2*n_pno',
          N_sa: 'N_sa_pb', fpc: 'fc_ped', Fy_ac: 'Fy_pb', Fu_ac: 'Fu_pb', FEXX: 'FEXX_pb', n_est_sl: 'n_est_ll',
        },
        publica: { u_max: 'u_llave', tbp_req: 'tbp_llave', As_reqx: 'As_llx', As_reqy: 'As_lly' },
        capas: [
          // Sin capacidad, el corte y el axial son los del modelo, y con momento tracciona una fila.
          {
            si: '!capacidad',
            entradas: { P_ux: null, V_ux2: 0, P_ux2: 0 },
            formulas: {
              V_ux: 'V_cv', V_uy: 'V_cv', P_ux: 'min(N_cv, 0 kN)', P_uy: 'min(N_cv, 0 kN)', n_trac: 'n_pno', V_ux2: null, P_ux2: null,
            },
          },
          // Rotulada: el aplastamiento cubre toda la placa y traccionan las dos filas.
          { si: ROT, formulas: { Yb: 'L_pb', n_trac: 'n_trac_pb', P_ux: 'min(P_v, 0 kN)', P_uy: 'min(P_v, 0 kN)' } },
        ],
      },
    },
    {
      clave: 'silla',
      nombre: 'Silla de anclaje $G',
      si: 'silla',
      frontera: {
        procedencia: 'biblioteca',
        id: 'silla-anclaje-generica',
        entradas: { frac_nervio: 1, n_nerv_fuera: 2, hay_extension: 1, RIG_T: 35, w_sold: 12, E_ac: 200000, phi_b: 0.9, phi_w: 0.75, b_eff: 150 },
        formulas: {
          T_grupo: 'T_pb', n_col: 'n_pno', y_fila: 'y_t_pno', luz_max: 'sep_nerv_pb', t_bp: 't_pb', L_bp: 'L_pb', Yb_comp: 'Yb_pb',
          Ase_perno: 'Ase_pno', t_mort: 't_gr_pb', Fy_ac: 'Fy_pb', Fu_ac: 'Fu_pb', FEXX: 'FEXX_pb', ALA_EXT: 'ALA_EXT_sl',
          NER_H: 'NER_H_sl', NER_L: 'NER_L_sl', NER_T: 'NER_T_sl', CH_B: 'CH_B_sl', CH_L: 'CH_L_sl', CH_T: 'CH_T_sl',
          COL_H: 'd_col_pb', COL_B: 'bf_col', COL_TF: 'tf_col', COL_TW: 'tw_col',
        },
        publica: { u_max: 'u_silla' },
      },
    },
    {
      clave: 'pedestal',
      nombre: 'Pedestal $G',
      frontera: {
        procedencia: 'biblioteca',
        id: 'pedestal-generico',
        entradas: {
          fy: 420, fyt: 420, lam: 1, sep_libre_top: 50, malla_sup: 1, frac_E_V: 1, Muy_1: 0, Muy_2: 0,
          Muy_3: 0, Muy_4: 0, Mux_5: 0, Pu_6: 0, Mux_6: 0, n_pasos_pm: 120, sis_nch2369: 0, sis_aci18: 1, sdc_def: 1,
          cat_III_IV: 0, T_esp: 0, V_esp: 0,
        },
        formulas: {
          PED_X: 'PED_B_pb', PED_Y: 'PED_L_pb', PED_H: 'H_ped_pb', fc: 'fc_ped', db_long: 'db_long_ped', n_barras: 'n_barras_ped',
          recub_ped: 'recub_ped', db_est: 'db_est_ped', sep_est: 'sep_est_ped', N_comp_max: 'N_cp', Vu_X: 'Vped_X_cl',
          Vu_Y: 'Vped_Y_cl', Pu_1: 'P_p1', Mux_1: 'M_p1', Pu_2: 'P_p2', Mux_2: 'M_p2', Pu_3: 'P_p3', Mux_3: 'M_p3', Pu_4: 'P_p4',
          Mux_4: 'M_p4', h_ef: 'h_ef_pno', n_contables: 'n_cont_ped', T_grupo: 'T_pb', As_req_anc: 'As_req_anc',
          As_req_llave_X: 'As_llx', As_req_llave_Y: 'As_lly', h_llave: 'h_sl_ll', b_llave: 'b_sl_ll', N_trac_max: 'T_ext_dg',
          Pu_5: 'N_t3_cl', Muy_5: 'Muy_ext_cl', Muy_6: 'Muy_int_cl', sep_est_zp: 'sep_zp_ped', n_ramas: 'n_ramas_ped',
          n_niv_sin_ramas: 'n_niv_sin_ramas_ll', ramas_cab_x: 'ramas_cab_x_ped', ramas_cab_y: 'ramas_cab_y_ped',
          s1_est: 's1_est_ped', n_est_cab: 'n_est_cab_ped',
        },
        publica: { u_max: 'u_ped' },
        capas: [
          {
            si: '!llave',
            entradas: { h_llave: 0, b_llave: 0, As_req_llave_X: 0, As_req_llave_Y: 0, n_niv_sin_ramas: 0, ramas_cab_x: 2, ramas_cab_y: 2 },
            formulas: {
              As_req_llave_X: null, As_req_llave_Y: null, h_llave: null, b_llave: null, n_niv_sin_ramas: null, ramas_cab_x: null,
              ramas_cab_y: null,
            },
          },
          // Sin capacidad: el corte del modelo, y sin los casos del arranque de las diagonales.
          {
            si: '!capacidad',
            entradas: { Pu_5: 0, Muy_5: 0, Muy_6: 0 },
            formulas: { Vu_X: 'V_cv', Vu_Y: 'V_cv', Pu_5: null, Muy_5: null, Muy_6: null },
          },
          { si: `${MOM}&!capacidad`, formulas: { N_trac_max: 'max(-N_t1, 0 kN)' } },
          // Una columna rotulada no es del sistema sismorresistente: sin el detallado del §18.7 (supuesto en la hoja de datos).
          { si: ROT, entradas: { sis_aci18: 0 }, formulas: { N_trac_max: 'T_pb', N_comp_max: 'P_c' } },
        ],
      },
    },
    { clave: 'resumen', nombre: 'Base de columna $G — resumen', hoja: RESUMEN },
    {
      clave: 'vista',
      nombre: 'Base de columna $G — geometría',
      frontera: {
        procedencia: 'vista',
        id: 'base-columna',
        entradas: { disp_nerv: 1, t_ap: 25, a_tuerca: 100, h_tuerca: 38, d_agg: 25, recub_inf: 75, recub_sup: 40 },
        formulas: {
          L_bp: 'L_pb', B_bp: 'B_pb', t_bp: 't_pb', t_gr: 't_gr_pb', d_col: 'd_col_pb', bf_col: 'bf_col', tf_col: 'tf_col',
          tw_col: 'tw_col', n_col: 'n_pno', d_perno: 'd_pno', y_t: 'y_t_pno', x_ext: 'x_ext_pno', h_ef: 'h_ef_pno',
          b_ap: 'b_ap_pno', luz_nerv: 'sep_nerv_pb', t_sl: 't_sl_ll', h_sl: 'h_sl_ll', b_sl: 'b_sl_ll', PED_X: 'PED_B_pb',
          PED_Y: 'PED_L_pb', H_PED: 'H_ped_pb', n_barras: 'n_barras_ped', db_long: 'db_long_ped', recub: 'recub_ped',
          db_est: 'db_est_ped', n_ramas: 'n_ramas_ped', sep_est: 'sep_est_ped', sep_zp: 'sep_zp_ped', ALA_EXT: 'ALA_EXT_sl',
          NER_H: 'NER_H_sl', NER_L: 'NER_L_sl', NER_T: 'NER_T_sl', CH_B: 'CH_B_sl', CH_L: 'CH_L_sl', CH_T: 'CH_T_sl',
          n_niv_sin_ramas: 'n_niv_sin_ramas_ll', amarre_cab: 'amarre_cab_ll', s1_est: 's1_est_ped',
        },
        publica: {
          n_cont: 'n_cont_ped', n_est_cab: 'n_est_cab_ped', ramas_cab_x: 'ramas_cab_x_ped', ramas_cab_y: 'ramas_cab_y_ped',
          n_est_ll: 'n_est_ll', v_global: 'v_geo_base',
        },
      },
    },
  ],
};
