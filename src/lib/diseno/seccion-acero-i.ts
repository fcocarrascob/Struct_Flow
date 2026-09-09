// ─────────────────────────────────────────────────────────────────────────────
// Módulo de diseño: sección de acero, perfil I doblemente simétrico.
//
// Las expresiones salen de `public/planillas/viga-columna.json` (324 regiones,
// ya verificada), la única del corpus que cubre esta superficie entera: las dos
// tablas de esbeltez, la curva de columna del Cap. E, el Cap. F2 completo, el
// momento amplificado del Apéndice 8 y la interacción H1. `viga-ltb.json` y
// `columna-galpon-compresion.json` aportan las ramas que aquella no ejercita.
//
// La excepción es el corte: **ningún ejemplo publicado del corpus verifica G2**
// —`viga-hss-flexion` hace G4, que es para tubos—, así que ese bloque es el
// único que no tiene contra qué contrastarse. Está escrito directo de la norma
// y anotado como tal en la propia hoja.
//
// Igual que en el módulo de hormigón: acá no se calcula nada, se arma una hoja.
// Quien calcula es `evaluateSheet`.
// ─────────────────────────────────────────────────────────────────────────────

import { m, t, p, img, type Item } from '../worksheet-layout';
import type { CampoDef, ModuloDiseno, SalidaDef } from './tipos';

export type EntradasAceroI = {
  F_y: number;
  d: number;
  b_f: number;
  t_f: number;
  t_w: number;
  L_cx: number;
  L_cy: number;
  L_cz: number;
  L_b: number;
  P_u: number;
  M_ux: number;
  V_u: number;
  C_b: number;
  B_1: number;
};

const n = (v: number): string => (Number.isFinite(v) ? String(Number(v.toPrecision(12))) : '0');

const ENTRADAS: CampoDef[] = [
  {
    nombre: 'F_y',
    etiqueta: 'Acero',
    unidad: 'kgf/cm^2',
    grupo: 'Material',
    opciones: [
      { valor: 2530, etiqueta: 'ASTM A36 — F_y = 2.530 kgf/cm²' },
      { valor: 2950, etiqueta: 'ASTM A500 Gr. B — F_y = 2.950 kgf/cm²' },
      { valor: 3520, etiqueta: 'ASTM A992 / A572 Gr. 50 — F_y = 3.520 kgf/cm²' },
    ],
  },

  { nombre: 'd', etiqueta: 'Altura total d', unidad: 'cm', grupo: 'Sección', min: 15, max: 120, paso: 0.5 },
  { nombre: 'b_f', etiqueta: 'Ancho del ala b_f', unidad: 'cm', grupo: 'Sección', min: 8, max: 50, paso: 0.5 },
  { nombre: 't_f', etiqueta: 'Espesor del ala t_f', unidad: 'cm', grupo: 'Sección', min: 0.4, max: 5, paso: 0.1 },
  { nombre: 't_w', etiqueta: 'Espesor del alma t_w', unidad: 'cm', grupo: 'Sección', min: 0.3, max: 4, paso: 0.1 },

  {
    nombre: 'L_cx',
    etiqueta: 'Longitud efectiva L_cx',
    unidad: 'm',
    grupo: 'Longitudes',
    min: 0.5,
    max: 30,
    paso: 0.25,
    ayuda: 'K·L en el plano de flexión (eje fuerte).',
  },
  { nombre: 'L_cy', etiqueta: 'Longitud efectiva L_cy', unidad: 'm', grupo: 'Longitudes', min: 0.5, max: 30, paso: 0.25 },
  {
    nombre: 'L_cz',
    etiqueta: 'Longitud efectiva a torsión L_cz',
    unidad: 'm',
    grupo: 'Longitudes',
    min: 0.5,
    max: 30,
    paso: 0.25,
  },
  {
    nombre: 'L_b',
    etiqueta: 'Separación entre arriostres L_b',
    unidad: 'm',
    grupo: 'Longitudes',
    min: 0.25,
    max: 30,
    paso: 0.25,
    ayuda: 'La distancia entre puntos con el ala comprimida sujeta lateralmente.',
  },

  { nombre: 'P_u', etiqueta: 'Compresión P_u', unidad: 'tonf', grupo: 'Cargas', min: 0, max: 2000, paso: 1 },
  { nombre: 'M_ux', etiqueta: 'Momento M_ux', unidad: 'tonf*m', grupo: 'Cargas', min: 0, max: 500, paso: 0.5 },
  { nombre: 'V_u', etiqueta: 'Corte V_u', unidad: 'tonf', grupo: 'Cargas', min: 0, max: 500, paso: 1 },

  {
    nombre: 'C_b',
    etiqueta: 'Factor C_b',
    grupo: 'Factores',
    min: 1,
    max: 3,
    paso: 0.05,
    ayuda: 'Ec. F1-1. Tomar 1 siempre está del lado seguro.',
  },
  {
    nombre: 'B_1',
    etiqueta: 'Amplificador B_1',
    grupo: 'Factores',
    min: 1,
    max: 3,
    paso: 0.05,
    ayuda: 'Apéndice 8, efecto P-δ. Tomar 1 solo si el análisis ya es de segundo orden.',
  },

];

const SALIDAS: SalidaDef[] = [
  { nombre: 'u_int', etiqueta: 'Interacción H1', tipo: 'uso', ayuda: 'Sec. H1.1' },
  { nombre: 'u_P', etiqueta: 'Compresión — P_u / φP_n', tipo: 'uso', ayuda: 'Cap. E' },
  { nombre: 'u_M', etiqueta: 'Flexión — M_r / φM_n', tipo: 'uso', ayuda: 'Cap. F2' },
  { nombre: 'u_V', etiqueta: 'Corte — V_u / φV_n', tipo: 'uso', ayuda: 'Sec. G2.1' },
  { nombre: 'gobierna', etiqueta: 'Gobierna', tipo: 'texto' },

  { nombre: 'A_g', etiqueta: 'Área A_g', unidad: 'cm^2', tipo: 'valor' },
  { nombre: 'Z_x', etiqueta: 'Módulo plástico Z_x', unidad: 'cm^3', tipo: 'valor' },
  { nombre: 'Rd_P', etiqueta: 'Compresión resistente φP_n', unidad: 'tonf', tipo: 'valor' },
  { nombre: 'Rd_M', etiqueta: 'Momento resistente φM_n', unidad: 'tonf*m', tipo: 'valor' },
  { nombre: 'Rd_V', etiqueta: 'Corte resistente φV_n', unidad: 'tonf', tipo: 'valor' },
  { nombre: 'L_p', etiqueta: 'Longitud límite L_p', unidad: 'm', tipo: 'valor', ayuda: 'Ec. F2-5' },
  { nombre: 'L_r', etiqueta: 'Longitud límite L_r', unidad: 'm', tipo: 'valor', ayuda: 'Ec. F2-6' },
  { nombre: 'zona', etiqueta: 'Zona de L_b', tipo: 'texto' },

  {
    nombre: 'v_alcance',
    etiqueta: 'Dentro del alcance del módulo',
    tipo: 'veredicto',
    aviso: true,
    avisoTexto: 'La sección sale del alcance del módulo',
    ayuda: 'No compacta o esbelta: harían falta F3 o E7, que este módulo no cubre.',
  },
  { nombre: 'v_geom', etiqueta: 'Geometría consistente (d > 2·t_f)', tipo: 'veredicto' },
  { nombre: 'v_esb', etiqueta: 'Esbeltez L_c/r ≤ 200', tipo: 'veredicto', ayuda: 'User Note de E2' },
  { nombre: 'v_alaC', etiqueta: 'Ala no esbelta en compresión', tipo: 'veredicto', ayuda: 'Tabla B4.1a, caso 1' },
  { nombre: 'v_almaC', etiqueta: 'Alma no esbelta en compresión', tipo: 'veredicto', ayuda: 'Tabla B4.1a, caso 5' },
  { nombre: 'v_alaF', etiqueta: 'Ala compacta en flexión', tipo: 'veredicto', ayuda: 'Tabla B4.1b, caso 10' },
  { nombre: 'v_almaF', etiqueta: 'Alma compacta en flexión', tipo: 'veredicto', ayuda: 'Tabla B4.1b, caso 15' },
  { nombre: 'v_tor', etiqueta: 'El pandeo torsional no gobierna', tipo: 'veredicto', ayuda: 'Ec. E4-2' },
];

function construirHoja(e: EntradasAceroI): Item[] {
  return [
    t('SECCIÓN DE ACERO — PERFIL I DOBLEMENTE SIMÉTRICO'),
    t('AISC 360-22 (LRFD) · Tablas B4.1a y B4.1b · Cap. E · Cap. F2 · Sec. G2.1 · Sec. H1 · Ap. 8'),
    t('Memoria generada desde el módulo de diseño. Rd_ = capacidad de diseño (incluye φ).'),

    t('━━ ALCANCE DE ESTA MEMORIA ━━'),
    t('Cubre: perfil I doblemente simétrico, compresión (E3 y E4), flexión en el eje fuerte'),
    t('(F2), corte del alma (G2.1) e interacción (H1.1). NO cubre: elementos esbeltos en'),
    t('compresión (E7), alas no compactas o esbeltas en flexión (F3), flexión en el eje débil'),
    t('(F6), tracción (D2) ni la capa sísmica de NCh2369. El veredicto v_alcance se pone en ✗'),
    t('cuando la sección entra en un régimen que este módulo no sabe tratar.'),

    t('━━ DATOS · ACERO Y FACTORES ━━'),
    m(`F_y := ${n(e.F_y)} kgf/cm^2`),
    t('E y G son constantes del acero estructural, no datos del problema.'),
    m('E := 2.04e6 kgf/cm^2'),
    m('G := 787200 kgf/cm^2'),
    t('E1 y F1(a): el mismo φ = 0,90 para compresión y para flexión.'),
    m('phi := 0.90'),
    m(`C_b := ${n(e.C_b)}`),
    m(`B_1 := ${n(e.B_1)}`),

    t('━━ DATOS · GEOMETRÍA · LAS CUATRO PLANCHAS ━━'),
    m(`d := ${n(e.d)} cm`),
    m(`b_f := ${n(e.b_f)} cm`),
    m(`t_f := ${n(e.t_f)} cm`),
    m(`t_w := ${n(e.t_w)} cm`),
    m('v_geom := d > 2*t_f ='),

    t('━━ PROPIEDADES DE LA SECCIÓN ━━'),
    t('Todas se derivan de las cuatro planchas, ninguna se declara: así la cadena entera es'),
    t('auditable desde d, b_f, t_f y t_w, sin un solo número que haya que creer.'),
    t('El modelo ignora las uniones ala-alma. En un perfil laminado eso deja A_g y Z_x un 2 %'),
    t('bajos y J hasta un 8 % bajo —del lado seguro—, y h algo alta, que también lo es.'),
    m('h_w := d - 2*t_f = cm'),
    m('A_g := 2*b_f*t_f + h_w*t_w = cm^2'),
    m('I_x := (b_f*d^3 - (b_f - t_w)*h_w^3)/12 = cm^4'),
    m('S_x := I_x/(d/2) = cm^3'),
    m('Z_x := b_f*t_f*(d - t_f) + t_w*h_w^2/4 = cm^3'),
    m('I_y := (2*t_f*b_f^3 + h_w*t_w^3)/12 = cm^4'),
    m('r_x := sqrt(I_x/A_g) = cm'),
    m('r_y := sqrt(I_y/A_g) = cm'),
    m('h_o := d - t_f = cm'),
    m('J := (2*b_f*t_f^3 + (d - t_f)*t_w^3)/3 = cm^4'),
    t('Ec. F2-8a con C_w = I_y·h_o²/4, que es la User Note de F2 para el doblemente simétrico.'),
    m('r_ts := sqrt(I_y*h_o/(2*S_x)) = cm'),
    m('C_w := I_y*h_o^2/4 = cm^6'),
    t('F2-8b: c = 1 para un perfil I doblemente simétrico.'),
    m('c := 1'),
    t('Los dos ratios que alimentan la Tabla B4.1:'),
    m('bt_ala := b_f/(2*t_f) ='),
    m('ht_alma := h_w/t_w ='),

    t('━━ DATOS · LONGITUDES Y CARGAS ━━'),
    m(`L_cx := ${n(e.L_cx)} m`),
    m(`L_cy := ${n(e.L_cy)} m`),
    m(`L_cz := ${n(e.L_cz)} m`),
    m(`L_b := ${n(e.L_b)} m`),
    m(`P_u := ${n(e.P_u)} tonf`),
    m(`M_ux := ${n(e.M_ux)} tonf*m`),
    m(`V_u := ${n(e.V_u)} tonf`),

    t('━━ 1 · CLASIFICACIÓN DE LA SECCIÓN ━━'),
    t('Tabla B4.1a (compresión): caso 1 para el ala no rigidizada, caso 5 para el alma.'),
    m('lam_rf := 0.56*sqrt(E/F_y) ='),
    m('lam_rw := 1.49*sqrt(E/F_y) ='),
    m('v_alaC := bt_ala < lam_rf ='),
    m('v_almaC := ht_alma < lam_rw ='),
    t('Tabla B4.1b (flexión): caso 10 para el ala laminada, caso 15 para el alma.'),
    m('lam_pf := 0.38*sqrt(E/F_y) ='),
    m('lam_pw := 3.76*sqrt(E/F_y) ='),
    m('v_alaF := bt_ala < lam_pf ='),
    m('v_almaF := ht_alma < lam_pw ='),
    m('v_alcance := v_alaC and v_almaC and v_alaF and v_almaF and v_geom ='),

    t('━━ 2 · COMPRESIÓN (Cap. E) ━━'),
    m('lam_x := L_cx/r_x ='),
    m('lam_y := L_cy/r_y ='),
    m('lam := max(lam_x, lam_y) ='),
    m('v_esb := lam <= 200 ='),
    t('Ec. E3-4: el pandeo flexional elástico con la esbeltez que gobierna.'),
    m('F_ef := pi^2*E/lam^2 = kgf/cm^2'),
    t('Ec. E4-2: el pandeo torsional, que en un doblemente simétrico compite con el flexional.'),
    m('I_s := I_x + I_y = cm^4'),
    m('F_ez := (pi^2*E*C_w/L_cz^2 + G*J)/I_s = kgf/cm^2'),
    m('v_tor := F_ez > F_ef ='),
    m('F_e := min(F_ef, F_ez) = kgf/cm^2'),
    t('E3: la puerta entre la Ec. E3-2 (inelástica) y la E3-3 (elástica).'),
    m('lam_lim := 4.71*sqrt(E/F_y) ='),
    m('q := F_y/F_e ='),
    m('v_reg := q <= 2.25 ='),
    p('F_n :=\n    if q <= 2.25\n        return F_y*0.658^q\n    return 0.877*F_e'),
    m('F_n = kgf/cm^2'),
    t('Ec. E3-1, con A_e = A_g: los elementos esbeltos (E7) quedan fuera de alcance.'),
    m('Rd_P := phi*F_n*A_g = tonf'),
    m('u_P := P_u/Rd_P ='),

    t('━━ 3 · FLEXIÓN EN EL EJE FUERTE (Cap. F2) ━━'),
    m('M_p := F_y*Z_x = tonf*m'),
    m('Rd_Mp := phi*M_p = tonf*m'),
    t('Ec. F2-5 y F2-6: las dos longitudes que parten el capítulo en tres zonas.'),
    m('L_p := 1.76*r_y*sqrt(E/F_y) = m'),
    m('rz := J*c/(S_x*h_o) ='),
    m('L_r := 1.95*r_ts*(E/(0.7*F_y))*sqrt(rz + sqrt(rz^2 + 6.76*(0.7*F_y/E)^2)) = m'),
    m('v_orden := L_p < L_r ='),
    m('M_07 := 0.7*F_y*S_x = tonf*m'),
    m('dM := M_p - M_07 = tonf*m'),
    t('F2-1 si L_b ≤ L_p; F2-2 (recta inelástica) hasta L_r; F2-3 (pandeo elástico) más allá.'),
    p(
      'M_n :=\n' +
        '    if L_b <= L_p\n' +
        '        return M_p\n' +
        '    if L_b <= L_r\n' +
        '        return min(M_p, C_b*(M_p - dM*(L_b - L_p)/(L_r - L_p)))\n' +
        '    esb := L_b/r_ts\n' +
        '    F_cr := C_b*pi^2*E/esb^2*sqrt(1 + 0.078*rz*esb^2)\n' +
        '    return min(M_p, F_cr*S_x)',
    ),
    m('M_n = tonf*m'),
    p(
      'zona :=\n' +
        '    if L_b <= L_p\n' +
        '        return "fluencia (F2-1)"\n' +
        '    if L_b <= L_r\n' +
        '        return "pandeo lateral-torsional inelástico (F2-2)"\n' +
        '    return "pandeo lateral-torsional elástico (F2-3)"',
    ),
    m('Rd_M := phi*M_n = tonf*m'),
    t('Ec. A-8-1: al presupuesto de H1 entra el momento amplificado, no el de primer orden.'),
    m('M_r := B_1*M_ux = tonf*m'),
    m('u_M := M_r/Rd_M ='),

    t('━━ 4 · CORTE DEL ALMA (Sec. G2.1) ━━'),
    t('ATENCIÓN: este es el único bloque sin contraste contra una planilla publicada; el'),
    t('corpus verifica G4 (tubos), no G2. Escrito directo de la norma.'),
    m('A_w := d*t_w = cm^2'),
    t('k_v = 5,34 para almas sin atiesadores transversales.'),
    m('k_v := 5.34'),
    t('G2.1(a): con h/t_w ≤ 2,24√(E/F_y) el alma fluye antes de abollar, y φ_v vale 1,00.'),
    m('lam_v := 2.24*sqrt(E/F_y) ='),
    m('v_flu := ht_alma <= lam_v ='),
    p('phi_v :=\n    if ht_alma <= lam_v\n        return 1.00\n    return 0.90'),
    m('phi_v ='),
    p(
      'C_v1 :=\n' +
        '    if ht_alma <= lam_v\n' +
        '        return 1\n' +
        '    lim := 1.10*sqrt(k_v*E/F_y)\n' +
        '    if ht_alma <= lim\n' +
        '        return 1\n' +
        '    return lim/ht_alma',
    ),
    m('C_v1 ='),
    m('Rd_V := phi_v*0.6*F_y*A_w*C_v1 = tonf'),
    m('u_V := V_u/Rd_V ='),

    t('━━ 5 · INTERACCIÓN (Sec. H1.1) ━━'),
    t('La rama la decide el uso axial: H1-1a desde 0,2, H1-1b por debajo.'),
    m('v_rama := u_P >= 0.2 ='),
    p('u_int :=\n    if u_P >= 0.2\n        return u_P + (8/9)*u_M\n    return u_P/2 + u_M'),
    m('u_int ='),
    m('v_int := u_int <= 1 ='),

    t('━━ RESUMEN: QUÉ GOBIERNA ━━'),
    m('u_max := max(u_int, u_V) ='),
    p(
      'gobierna :=\n' +
        '    if u_V > u_int\n' +
        '        return "corte del alma (G2.1)"\n' +
        '    if u_P < 0.2\n' +
        '        return "interacción H1-1b, con la flexión al mando"\n' +
        '    if u_M > u_P\n' +
        '        return "interacción H1-1a, manda la flexión"\n' +
        '    return "interacción H1-1a, manda la compresión"',
    ),
    t('Cumplir es que ningún uso pase de 1 y que la sección respete los límites de la norma.'),
    t('Que caiga fuera del alcance de este módulo es otra cosa: no dice que la sección falle,'),
    t('dice que el número de al lado puede no significar lo que parece.'),
    m('v_cumple := u_max <= 1 and v_geom and v_esb and v_alaC and v_almaC and v_alaF and v_almaF ='),

    // ── El mapeo a píxeles del esquema ──────────────────────────────────────
    // Todo adimensional: `formatSvg` lanza si un atributo recibe una magnitud
    // con unidades, y ese fallo hace caer `verify:planilla`.
    t('━━ ESQUEMA · MAPEO A PÍXELES ━━'),
    m('x_0 := 110'),
    m('y_0 := 78'),
    t('6 px/cm mientras quepa, y solo entonces se reduce para caber. Con una escala que'),
    t('ajusta siempre a la caja, un perfil de 15 cm se dibuja igual de grande que uno de 50.'),
    m('esc := min(6, 200/(b_f/(1 cm)), 250/(d/(1 cm)))'),
    m('bf_px := b_f/(1 cm)*esc'),
    m('d_px := d/(1 cm)*esc'),
    m('tf_px := t_f/(1 cm)*esc'),
    m('tw_px := t_w/(1 cm)*esc'),
    m('xw := x_0 + (bf_px - tw_px)/2'),
    t('La recta de L_b: el eje se escala al mayor entre L_r y el L_b pedido, con holgura.'),
    m('xb_0 := 90'),
    m('xb_1 := 385'),
    m('L_max := max(L_r, L_b)*1.15 = m'),
    p('xb(Lv) := xb_0 + (Lv/L_max)*(xb_1 - xb_0)'),
    m('xLp := xb(L_p) ='),
    m('xLr := xb(L_r) ='),
    m('xLb := xb(L_b) ='),

    img('/esquemas/diseno-seccion-acero-i.svg', 660, 430),
  ];
}

export const seccionAceroI: ModuloDiseno<EntradasAceroI> = {
  id: 'seccion-acero-i',
  titulo: 'Sección de acero, perfil I',
  resumen: 'Compresión, flexión con pandeo lateral-torsional, corte e interacción.',
  disciplina: 'acero',
  norma: 'AISC 360-22 (LRFD)',
  esquema: '/esquemas/diseno-seccion-acero-i.svg',
  anchoEsquema: 660,
  altoEsquema: 430,
  entradas: ENTRADAS,
  salidas: SALIDAS,
  // Las planchas de un W250x73, el perfil de `columna-galpon-compresion`. Un
  // perfil de viga —esbelto de alma, como el W460x74— arrancaria el modulo
  // declarandose fuera de alcance: con h/t_w = 46,9 contra el limite 35,9 de la
  // Tabla B4.1a, es esbelto EN COMPRESION, que es correcto y es justo por lo
  // que esos perfiles se usan como vigas y no como columnas.
  porDefecto: {
    F_y: 3520,
    d: 25.3,
    b_f: 25.4,
    t_f: 1.42,
    t_w: 0.86,
    L_cx: 7.5,
    L_cy: 3.75,
    L_cz: 3.75,
    L_b: 3.75,
    P_u: 65,
    M_ux: 5,
    V_u: 5,
    C_b: 1,
    B_1: 1,
  },
  construirHoja,
  // El W250x58 de `viga-columna.json`, cadena A: sus dimensiones y los dos
  // factores que aquella planilla CALCULA —C_b por la Ec. F1-1 sobre su
  // diagrama de momentos, B_1 por la Ec. A-8-3— y que aqui son dato. Van como
  // literales a proposito: si esa planilla cambia, el contraste falla, que es
  // exactamente lo que se quiere de el.
  contraste: {
    planilla: 'viga-columna',
    entradas: {
      F_y: 3520,
      d: 25.2,
      b_f: 20.3,
      t_f: 1.35,
      t_w: 0.8,
      L_cx: 7,
      L_cy: 3.5,
      L_cz: 3.5,
      L_b: 3.5,
      P_u: 90,
      M_ux: 7.99925,
      V_u: 0,
      C_b: 1.298701298701299,
      B_1: 1.336472371548623,
    },
    valores: [
      // EXACTO. Esa planilla tambien calcula el modelo de cuatro planchas, bajo
      // los nombres con sufijo `_pl`, y ahi las dos hojas hacen lo mismo con la
      // misma formula. Los limites de esbeltez solo dependen de E y F_y.
      { mio: 'h_w', suyo: 'h_pl' },
      { mio: 'A_g', suyo: 'A_pl' },
      { mio: 'I_x', suyo: 'I_xpl' },
      { mio: 'S_x', suyo: 'S_xpl' },
      { mio: 'Z_x', suyo: 'Z_xpl' },
      { mio: 'I_y', suyo: 'I_ypl' },
      { mio: 'r_x', suyo: 'r_xpl' },
      { mio: 'r_y', suyo: 'r_ypl' },
      { mio: 'h_o', suyo: 'h_opl' },
      { mio: 'J', suyo: 'J_pl' },
      { mio: 'r_ts', suyo: 'rts_pl' },
      'bt_ala', 'ht_alma',
      'lam_rf', 'lam_rw', 'lam_pf', 'lam_pw', 'lam_lim',
      'M_r',

      // CON TOLERANCIA. De aqui en adelante las dos hojas ya no calculan lo
      // mismo: la planilla alimenta las ecuaciones de norma con las propiedades
      // TABULADAS del perfil y este modulo con las derivadas, y entre unas y
      // otras esta el material de las uniones ala-alma. El desvio medido es de
      // 1-2 % en las capacidades y llega al 8 % en J, que arrastra a rz.
      //
      // Sigue siendo una red util: si alguien rompe la rama de E3 o una zona de
      // F2, eso se mueve mucho mas que un 3 %.
      { mio: 'C_w', tolerancia: 0.03 },
      { mio: 'I_s', tolerancia: 0.03 },
      { mio: 'lam_x', tolerancia: 0.03 },
      { mio: 'M_p', tolerancia: 0.03 },
      { mio: 'M_07', tolerancia: 0.03 },
      { mio: 'dM', tolerancia: 0.03 },
      { mio: 'L_p', tolerancia: 0.03 },
      { mio: 'L_r', tolerancia: 0.03 },
      // rz = J·c/(S_x·h_o) es el que mas se desvia (6,35 %) porque arrastra el
      // J de planchas, que es lo mas sensible a las uniones. Su efecto en L_r
      // queda en 0,95 %: entra bajo raiz y sumado a otro termino.
      { mio: 'rz', tolerancia: 0.08 },
      { mio: 'F_ef', suyo: 'F_eA', tolerancia: 0.03 },
      { mio: 'F_n', suyo: 'F_nA', tolerancia: 0.03 },
      { mio: 'Rd_P', suyo: 'Rd_PA', tolerancia: 0.03 },
      { mio: 'u_P', suyo: 'u_PA', tolerancia: 0.03 },
      { mio: 'M_n', suyo: 'M_nA', tolerancia: 0.03 },
      { mio: 'Rd_M', suyo: 'Rd_MA', tolerancia: 0.03 },
      { mio: 'u_M', suyo: 'u_MA', tolerancia: 0.03 },
      { mio: 'u_int', suyo: 'u_A', tolerancia: 0.03 },
    ],
  },
  casos: [
    {
      nombre: 'por defecto (las planchas de un W250x73)',
      entradas: {
        F_y: 3520, d: 25.3, b_f: 25.4, t_f: 1.42, t_w: 0.86,
        L_cx: 7.5, L_cy: 3.75, L_cz: 3.75, L_b: 3.75,
        P_u: 65, M_ux: 5, V_u: 5, C_b: 1, B_1: 1,
      },
    },
    {
      nombre: 'minimos de cada campo',
      entradas: {
        F_y: 2530, d: 15, b_f: 8, t_f: 0.4, t_w: 0.3,
        L_cx: 0.5, L_cy: 0.5, L_cz: 0.5, L_b: 0.25,
        P_u: 0, M_ux: 0, V_u: 0, C_b: 1, B_1: 1,
      },
    },
    {
      nombre: 'maximos de cada campo',
      entradas: {
        F_y: 3520, d: 120, b_f: 50, t_f: 5, t_w: 4,
        L_cx: 30, L_cy: 30, L_cz: 30, L_b: 30,
        P_u: 2000, M_ux: 500, V_u: 500, C_b: 3, B_1: 3,
      },
    },
    {
      nombre: 'L_b mas alla de L_r: pandeo elastico (F2-3)',
      entradas: {
        F_y: 3520, d: 25.3, b_f: 25.4, t_f: 1.42, t_w: 0.86,
        L_cx: 7.5, L_cy: 3.75, L_cz: 3.75, L_b: 20,
        P_u: 20, M_ux: 5, V_u: 5, C_b: 1, B_1: 1,
      },
    },
    {
      nombre: 'axial baja: la interaccion cambia a H1-1b',
      entradas: {
        F_y: 3520, d: 25.3, b_f: 25.4, t_f: 1.42, t_w: 0.86,
        L_cx: 7.5, L_cy: 3.75, L_cz: 3.75, L_b: 3.75,
        P_u: 2, M_ux: 10, V_u: 5, C_b: 1, B_1: 1,
      },
    },
    {
      nombre: 'sobrecargada: los usos pasan de 1',
      entradas: {
        F_y: 2530, d: 30, b_f: 12, t_f: 0.8, t_w: 0.5,
        L_cx: 8, L_cy: 8, L_cz: 8, L_b: 8,
        P_u: 60, M_ux: 30, V_u: 40, C_b: 1, B_1: 1.4,
      },
    },
    {
      nombre: 'alma esbelta: fuera del alcance del modulo',
      entradas: {
        F_y: 3520, d: 100, b_f: 25, t_f: 1.2, t_w: 0.4,
        L_cx: 6, L_cy: 3, L_cz: 3, L_b: 3,
        P_u: 20, M_ux: 40, V_u: 20, C_b: 1, B_1: 1,
      },
    },
  ],
};
