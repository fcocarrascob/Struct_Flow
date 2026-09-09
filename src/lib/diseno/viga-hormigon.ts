// ─────────────────────────────────────────────────────────────────────────────
// Módulo de diseño: viga de hormigón armado a flexión y corte (ACI 318-25).
//
// Las expresiones y los coeficientes no se inventaron acá: salen de
// `public/planillas/viga-flexion-corte.json`, la memoria de 218 regiones que ya
// pasa `verify:planillas`. Esta es su versión breve —lo que gobierna, sin los
// contrastes contra el post ni las equivalencias entre ediciones—, para que
// quepa en el orden de las 50 regiones y se pueda reevaluar en cada tecla.
//
// Si alguna vez discrepan, manda la planilla: es la que está verificada.
// ─────────────────────────────────────────────────────────────────────────────

import { m, t, p, img, type Item } from '../worksheet-layout';
import type { CampoDef, ModuloDiseno, SalidaDef } from './tipos';

export type EntradasViga = {
  f_c: number;
  f_y: number;
  b_w: number;
  h: number;
  L: number;
  rec: number;
  d_b: number;
  n_b: number;
  d_v: number;
  n_r: number;
  s: number;
  D: number;
  L_v: number;
};

/**
 * Un número listo para el código fuente de una región: con punto decimal y sin
 * la cola binaria que arrastraría un `30.000000000000004 cm` a la vista.
 */
const n = (v: number): string => (Number.isFinite(v) ? String(Number(v.toPrecision(12))) : '0');

const ENTRADAS: CampoDef[] = [
  {
    nombre: 'f_c',
    etiqueta: 'Resistencia del hormigón f’c',
    unidad: 'kgf/cm^2',
    grupo: 'Materiales',
    min: 150,
    max: 700,
    paso: 10,
  },
  {
    nombre: 'f_y',
    etiqueta: 'Fluencia del acero f_y',
    unidad: 'kgf/cm^2',
    grupo: 'Materiales',
    opciones: [2800, 4200, 5000],
  },
  {
    nombre: 'b_w',
    etiqueta: 'Ancho del alma b_w',
    unidad: 'cm',
    grupo: 'Geometría',
    min: 15,
    max: 200,
    paso: 5,
  },
  {
    nombre: 'h',
    etiqueta: 'Altura total h',
    unidad: 'cm',
    grupo: 'Geometría',
    min: 20,
    max: 250,
    paso: 5,
  },
  {
    nombre: 'L',
    etiqueta: 'Luz L',
    unidad: 'm',
    grupo: 'Geometría',
    min: 1,
    max: 20,
    paso: 0.5,
  },
  {
    nombre: 'rec',
    etiqueta: 'Recubrimiento libre',
    unidad: 'mm',
    grupo: 'Geometría',
    min: 20,
    max: 75,
    paso: 5,
    ayuda: 'Tabla 20.5.1.3.1, a la cara del estribo: 40 mm para viga no expuesta.',
  },
  {
    nombre: 'd_b',
    etiqueta: 'Diámetro de barra d_b',
    unidad: 'mm',
    grupo: 'Refuerzo longitudinal',
    opciones: [12, 16, 18, 22, 25, 28, 32, 36],
  },
  {
    nombre: 'n_b',
    etiqueta: 'Número de barras n_b',
    grupo: 'Refuerzo longitudinal',
    min: 2,
    max: 10,
    paso: 1,
    ayuda: 'Una sola capa. El tope de 10 es el del esquema, que dibuja diez círculos.',
  },
  {
    nombre: 'd_v',
    etiqueta: 'Diámetro del estribo d_v',
    unidad: 'mm',
    grupo: 'Refuerzo transversal',
    opciones: [8, 10, 12, 16],
  },
  {
    nombre: 'n_r',
    etiqueta: 'Ramas del estribo n_r',
    grupo: 'Refuerzo transversal',
    min: 2,
    max: 6,
    paso: 1,
  },
  {
    nombre: 's',
    etiqueta: 'Separación de estribos s',
    unidad: 'cm',
    grupo: 'Refuerzo transversal',
    min: 5,
    max: 60,
    paso: 1,
  },
  {
    nombre: 'D',
    etiqueta: 'Carga permanente D',
    unidad: 'tonf/m',
    grupo: 'Cargas',
    min: 0,
    max: 50,
    paso: 0.1,
  },
  {
    nombre: 'L_v',
    etiqueta: 'Sobrecarga de uso L',
    unidad: 'tonf/m',
    grupo: 'Cargas',
    min: 0,
    max: 50,
    paso: 0.1,
  },
];

const SALIDAS: SalidaDef[] = [
  { nombre: 'u_M', etiqueta: 'Flexión — M_u / φM_n', tipo: 'uso', ayuda: '9.5.1.1(a)' },
  { nombre: 'u_V', etiqueta: 'Corte — V_u / φV_n', tipo: 'uso', ayuda: '22.5.8 y 9.4.3.2' },
  { nombre: 'u_biela', etiqueta: 'Biela comprimida del alma', tipo: 'uso', ayuda: '22.5.1.2' },
  { nombre: 'u_h', etiqueta: 'Altura mínima', tipo: 'uso', ayuda: 'Tabla 9.3.1.1' },
  { nombre: 'gobierna', etiqueta: 'Gobierna', tipo: 'texto' },
  { nombre: 'd', etiqueta: 'Altura útil d', unidad: 'cm', tipo: 'valor' },
  { nombre: 'A_s', etiqueta: 'Acero provisto A_s', unidad: 'cm^2', tipo: 'valor' },
  { nombre: 'A_smin', etiqueta: 'Acero mínimo A_s,mín', unidad: 'cm^2', tipo: 'valor', ayuda: '9.6.1.2' },
  { nombre: 'Rd_M', etiqueta: 'Momento resistente φM_n', unidad: 'tonf*m', tipo: 'valor' },
  { nombre: 'Rd_V', etiqueta: 'Corte resistente φV_n', unidad: 'tonf', tipo: 'valor' },
  {
    nombre: 's_gob',
    etiqueta: 'Separación máxima admisible',
    unidad: 'cm',
    tipo: 'valor',
    ayuda: 'La menor de las Tablas 9.7.6.2.2 y 9.6.3.4.',
  },
  { nombre: 'v_duct', etiqueta: 'Controlada por tracción', tipo: 'veredicto', ayuda: '9.3.3.1' },
  { nombre: 'v_Asmin', etiqueta: 'Cumple el acero mínimo', tipo: 'veredicto', ayuda: '9.6.1.2' },
  { nombre: 'v_s', etiqueta: 'Separación de estribos admisible', tipo: 'veredicto', ayuda: 'Tabla 9.7.6.2.2' },
  { nombre: 'v_sep', etiqueta: 'Separación libre entre barras', tipo: 'veredicto', ayuda: '25.2.1' },
  { nombre: 'v_biela', etiqueta: 'No agota la biela del alma', tipo: 'veredicto', ayuda: '22.5.1.2' },
];

function construirHoja(e: EntradasViga): Item[] {
  return [
    t('VIGA DE HORMIGÓN ARMADO A FLEXIÓN Y CORTE'),
    t('ACI 318-25 (edición SI) · Cap. 9 · 22.2/22.3 flexión · 22.5 corte · Tablas 21.2.1 y 21.2.2'),
    t('Memoria generada desde el módulo de diseño. Rd_ = capacidad de diseño (incluye φ).'),

    t('━━ DATOS · MATERIALES ━━'),
    m(`f_c := ${n(e.f_c)} kgf/cm^2`),
    m(`f_y := ${n(e.f_y)} kgf/cm^2`),
    m('f_yt := f_y'),
    t('20.2.2.2: se permite tomar E_s = 200 000 MPa para barras no pretensadas.'),
    m('E_s := 200000 MPa'),
    m('eps_ty := f_y/E_s ='),
    t('19.2.4.2: hormigón de densidad normal → λ = 1. 22.2.2.1: ε_cu = 0,003.'),
    m('lam := 1'),
    m('eps_cu := 0.003'),
    t('El radicando de las expresiones de corte va en MPa (edición SI):'),
    m('rfc := sqrt(f_c/MPa)*MPa = MPa'),
    t('Tabla 22.2.2.4.3: β_1. Tablas 21.2.1 y 21.2.2: los factores φ.'),
    m('beta_1 := beta1(f_c) ='),
    m('phi_f := 0.90'),
    m('phi_v := 0.75'),

    t('━━ DATOS · GEOMETRÍA Y ARMADURA ━━'),
    m(`b_w := ${n(e.b_w)} cm`),
    m(`h := ${n(e.h)} cm`),
    m(`L := ${n(e.L)} m`),
    m(`rec := ${n(e.rec)} mm`),
    m(`d_v := ${n(e.d_v)} mm`),
    m(`n_r := ${n(e.n_r)}`),
    m(`d_b := ${n(e.d_b)} mm`),
    m(`n_b := ${n(e.n_b)}`),
    m(`s := ${n(e.s)} cm`),
    m('A_b := pi/4*d_b^2 = cm^2'),
    m('A_s := n_b*A_b = cm^2'),
    t('Altura útil: se DERIVA de la disposición de barras, no se declara.'),
    m('d := h - rec - d_v - d_b/2 = cm'),
    t('25.2.1: separación libre ≥ la mayor de 25 mm y d_b (una capa).'),
    m('s_libre := (b_w - 2*rec - 2*d_v - n_b*d_b)/(n_b - 1) = mm'),
    m('v_sep := s_libre >= max(25 mm, d_b) ='),

    t('━━ CARGAS Y SOLICITACIONES ━━'),
    m(`D := ${n(e.D)} tonf/m`),
    m(`L_v := ${n(e.L_v)} tonf/m`),
    t('Tabla 5.3.1, Ec. (5.3.1b): U = 1,2D + 1,6L.'),
    m('w_u := 1.2*D + 1.6*L_v = tonf/m'),
    m('M_u := w_u*L^2/8 = tonf*m'),
    t('9.4.3.2: sección crítica de corte a d de la cara; sin ancho de apoyo, desde el eje.'),
    m('V_ud := w_u*(L/2 - d) = tonf'),

    t('━━ 1 · ALTURA MÍNIMA SIN CALCULAR DEFLEXIONES (Tabla 9.3.1.1) ━━'),
    m('h_min := L/16 = cm'),
    m('u_h := h_min/h ='),
    m('v_h := h >= h_min ='),

    t('━━ 2 · FLEXIÓN (22.2.2.4 · 22.3.1 · 9.5.1.1a) ━━'),
    m('a := A_s*f_y/(0.85*f_c*b_w) = cm'),
    m('c := a/beta_1 = cm'),
    m('eps_t := eps_cu*(d - c)/c ='),
    t('9.3.3.1 + Tabla 21.2.2: la viga tiene que ser controlada por tracción.'),
    m('eps_lim := eps_ty + 0.003 ='),
    m('v_duct := eps_t >= eps_lim ='),
    m('phi_chk := phiFlexion(eps_t, eps_ty) ='),
    m('M_n := A_s*f_y*(d - a/2) = tonf*m'),
    m('Rd_M := phi_f*M_n = tonf*m'),
    m('v_M := Rd_M >= M_u ='),
    m('u_M := M_u/Rd_M ='),

    t('━━ 2.1 · REFUERZO MÍNIMO A FLEXIÓN (9.6.1.2) ━━'),
    m('rho_a := 0.25*rfc/f_y ='),
    m('rho_b := 1.4 MPa/f_y ='),
    m('A_smin := max(rho_a, rho_b)*b_w*d = cm^2'),
    m('v_Asmin := A_s >= A_smin ='),

    t('━━ 3 · CORTE (Tabla 22.5.5.1 · 22.5.8 · 9.7.6.2.2) ━━'),
    m('V_c := 0.17*lam*rfc*b_w*d = tonf'),
    m('Rd_Vc := phi_v*V_c = tonf'),
    t('22.5.8.1: donde V_u > φV_c, los estribos toman V_s ≥ V_u/φ − V_c.'),
    m('V_sreq := V_ud/phi_v - V_c = tonf'),
    t('22.5.1.2: el tope de la biela comprimida del alma.'),
    m('V_stop := 0.66*lam*rfc*b_w*d = tonf'),
    m('V_umax := phi_v*(V_c + V_stop) = tonf'),
    m('v_biela := V_ud <= V_umax ='),
    t('El uso se acota en cero: donde el hormigón basta, V_s,req sale negativo y no hay biela que agotar.'),
    m('u_biela := max(V_sreq, 0 tonf)/V_stop ='),
    t('22.5.8.5.5: A_v es el área de TODAS las ramas.'),
    m('A_v := n_r*pi/4*d_v^2 = cm^2'),
    t('Tabla 9.7.6.2.2: s ≤ min(d/2 ; 600 mm), y la mitad si V_s supera 0,33λ√f’c·b_w·d.'),
    m('V_sumb := 0.33*lam*rfc*b_w*d = tonf'),
    p('s_max :=\n    if V_sreq <= V_sumb\n        return min(d/2, 600 mm)\n    return min(d/4, 300 mm)'),
    t('Tabla 9.6.3.4(a)(b): A_v,mín/s, el mayor de 0,062√f’c·b_w/f_yt y 0,35·b_w/f_yt.'),
    m('avs_a := 0.062*rfc*b_w/f_yt = mm^2/mm'),
    m('avs_b := 0.35 MPa*b_w/f_yt = mm^2/mm'),
    m('s_Avmin := A_v/max(avs_a, avs_b) = cm'),
    m('s_gob := min(s_max, s_Avmin) = cm'),
    m('v_s := s <= s_gob ='),
    m('V_s := A_v*f_yt*d/s = tonf'),
    m('Rd_V := phi_v*(V_c + V_s) = tonf'),
    m('v_V := Rd_V >= V_ud ='),
    m('u_V := V_ud/Rd_V ='),

    t('━━ RESUMEN: QUÉ GOBIERNA ━━'),
    m('u_max := max(u_h, u_M, u_V, u_biela) ='),
    p(
      'gobierna :=\n' +
        '    if u_max == u_M\n' +
        '        return "flexión (22.3.1 y 9.5.1.1a)"\n' +
        '    else if u_max == u_V\n' +
        '        return "corte (22.5 y 9.4.3.2)"\n' +
        '    else if u_max == u_biela\n' +
        '        return "biela comprimida del alma (22.5.1.2)"\n' +
        '    return "altura mínima (Tabla 9.3.1.1)"',
    ),
    m('u_max <= 1 ='),

    // ── El mapeo a píxeles del esquema ──────────────────────────────────────
    // Todo adimensional a propósito: `formatSvg` lanza si un atributo recibe
    // una magnitud con unidades, y ese fallo hace caer `verify:planilla`.
    // Definir la escala en la hoja y que el SVG solo consuma píxeles es el
    // patrón de `columna-interaccion-esbeltez`.
    t('━━ ESQUEMA · MAPEO A PÍXELES ━━'),
    m('x_0 := 90'),
    m('y_0 := 70'),
    t('6 px/cm mientras quepa, y solo entonces se reduce para caber. Con una escala que'),
    t('ajusta siempre a la caja, una viga de 15 cm se dibuja igual de grande que una de 200.'),
    m('esc := min(6, 230/(b_w/(1 cm)), 300/(h/(1 cm)))'),
    m('bw_px := b_w/(1 cm)*esc'),
    m('h_px := h/(1 cm)*esc'),
    m('rec_px := rec/(1 cm)*esc'),
    m('dv_px := d_v/(1 cm)*esc'),
    m('db_px := d_b/(1 cm)*esc'),
    m('y_b := y_0 + h_px - rec_px - dv_px - db_px/2'),
    m('x_ini := x_0 + rec_px + dv_px + db_px/2'),
    m('x_fin := x_0 + bw_px - rec_px - dv_px - db_px/2'),
    p('x_barra(i) := x_ini + (i - 1)*(x_fin - x_ini)/max(n_b - 1, 1)'),
    t('El SVG no tiene bucles: dibuja diez barras y la hoja anula el radio de las que sobran.'),
    p('r_barra(i) := i <= n_b ? db_px/2 : 0'),

    // La figura va la última: captura el scope en su posición de orden de
    // lectura, así que solo puede rotular lo que ya se calculó antes.
    img('/esquemas/diseno-viga-hormigon.svg', 660, 430),
  ];
}

export const vigaHormigon: ModuloDiseno<EntradasViga> = {
  id: 'viga-hormigon',
  titulo: 'Viga de hormigón armado',
  resumen: 'Flexión y corte de una viga rectangular: sección, refuerzo y estribos.',
  disciplina: 'hormigon',
  norma: 'ACI 318-25 (edición SI)',
  esquema: '/esquemas/diseno-viga-hormigon.svg',
  anchoEsquema: 660,
  altoEsquema: 430,
  entradas: ENTRADAS,
  salidas: SALIDAS,
  porDefecto: {
    f_c: 250,
    f_y: 4200,
    b_w: 30,
    h: 60,
    L: 6,
    rec: 40,
    d_b: 25,
    n_b: 3,
    d_v: 10,
    n_r: 2,
    s: 25,
    D: 3,
    L_v: 1.5,
  },
  construirHoja,
  // Con los valores por defecto, esta memoria breve tiene que dar exactamente
  // lo mismo que la de 218 regiones de la que salió.
  contraste: {
    planilla: 'viga-flexion-corte',
    valores: [
      'd', 'A_b', 'A_s', 'A_smin', 'a', 'c', 'eps_t', 'eps_ty', 'beta_1', 'rfc',
      'w_u', 'M_u', 'M_n', 'Rd_M', 'u_M', 'h_min', 'u_h',
      'V_ud', 'V_c', 'V_sreq', 'V_stop', 'V_s', 'Rd_V', 'u_V', 'u_biela',
      'A_v', 's_gob', 's_libre', 'u_max',
    ],
  },
  // Los extremos de cada campo, no solo el caso cómodo: es donde aparecen las
  // divisiones por cero y los esquemas que se salen de su caja.
  casos: [
    {
      nombre: 'por defecto (el caso de la planilla publicada)',
      entradas: { f_c: 250, f_y: 4200, b_w: 30, h: 60, L: 6, rec: 40, d_b: 25, n_b: 3, d_v: 10, n_r: 2, s: 25, D: 3, L_v: 1.5 },
    },
    {
      nombre: 'mínimos de cada campo',
      entradas: { f_c: 150, f_y: 2800, b_w: 15, h: 20, L: 1, rec: 20, d_b: 12, n_b: 2, d_v: 8, n_r: 2, s: 5, D: 0, L_v: 0 },
    },
    {
      nombre: 'máximos de cada campo',
      entradas: { f_c: 700, f_y: 5000, b_w: 200, h: 250, L: 20, rec: 75, d_b: 36, n_b: 10, d_v: 16, n_r: 6, s: 60, D: 50, L_v: 50 },
    },
    {
      nombre: 'sobrecargada: los usos pasan de 1',
      entradas: { f_c: 200, f_y: 4200, b_w: 20, h: 35, L: 8, rec: 40, d_b: 16, n_b: 2, d_v: 8, n_r: 2, s: 30, D: 4, L_v: 3 },
    },
    {
      nombre: 'sección esbelta con barras gruesas (separación libre negativa)',
      entradas: { f_c: 250, f_y: 4200, b_w: 15, h: 40, L: 4, rec: 40, d_b: 36, n_b: 3, d_v: 16, n_r: 2, s: 10, D: 1, L_v: 1 },
    },
  ],
};
