// ─────────────────────────────────────────────────────────────────────────────
// Módulo de diseño: zapata aislada rectangular bajo columna (ACI 318-25).
//
// TODA la memoria es ACI 318-25, edición SI, y de esa sola edición. Las
// cláusulas son las de fundación y losa —Cap. 13, Cap. 8 y Cap. 7—, no las de
// viga del Cap. 9: 13.3.1.1 para el área en planta, 8.5.1.1 para las
// condiciones de resistencia, 8.5.3.1.1 y 8.5.3.1.2 para las dos formas del
// corte, 7.3.3.1 para la ductilidad.
//
// Es RECTANGULAR y con MOMENTO uniaxial, que es lo que separa a este módulo de
// la planilla de la que sale: con B = L y M = 0 se reduce exactamente a ella, y
// eso es lo que mantiene vivo el contraste.
//
// Las expresiones se copian de dos planillas del corpus:
//   · `public/planillas/zapata-aislada.json` — el grueso: presión de contacto,
//     corte en una dirección, flexión, mínimos y desarrollo de la barra;
//   · `public/planillas/losa-punzonamiento-momento.json` — la cadena de v_c del
//     punzonamiento.
// El segundo contraste existe por una razón concreta, anotada abajo: la primera
// planilla escribe la Tabla 22.6.5.2 con el álgebra de ACI 318-14.
// ─────────────────────────────────────────────────────────────────────────────

import { m, t, p, img, type Item } from '../worksheet-layout';
import type { CampoDef, ModuloDiseno, SalidaDef } from './tipos';

export type EntradasZapata = {
  f_c: number;
  f_y: number;
  q_a: number;
  B: number;
  L: number;
  h: number;
  rec: number;
  c_1: number;
  c_2: number;
  d_b_B: number;
  n_b_B: number;
  d_b_L: number;
  n_b_L: number;
  P_D: number;
  P_L: number;
  M_D: number;
  M_L: number;
  via: number;
};

/**
 * Un número listo para el código fuente de una región: con punto decimal y sin
 * la cola binaria que arrastraría un `24.444444444444443 cm` a la vista.
 */
const n = (v: number): string => (Number.isFinite(v) ? String(Number(v.toPrecision(12))) : '0');

const DIAMETROS = [10, 12, 16, 18, 22, 25, 28, 32];

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
    nombre: 'q_a',
    etiqueta: 'Presión admisible del suelo q_a',
    unidad: 'kgf/cm^2',
    grupo: 'Suelo',
    min: 0.5,
    max: 10,
    paso: 0.1,
    ayuda:
      'Frontera declarada: sale del informe de mecánica de suelos. 13.3.1.1 la contrasta con cargas de SERVICIO, no mayoradas.',
  },

  {
    nombre: 'B',
    etiqueta: 'Lado B (la dirección del momento)',
    unidad: 'cm',
    grupo: 'Zapata',
    min: 60,
    max: 600,
    paso: 10,
    ayuda: 'La excentricidad se mide a lo largo de B. Con B = L la zapata es cuadrada.',
  },
  {
    nombre: 'L',
    etiqueta: 'Lado L',
    unidad: 'cm',
    grupo: 'Zapata',
    min: 60,
    max: 600,
    paso: 10,
  },
  {
    nombre: 'h',
    etiqueta: 'Altura total h',
    unidad: 'cm',
    grupo: 'Zapata',
    min: 25,
    max: 200,
    paso: 5,
  },
  {
    nombre: 'rec',
    etiqueta: 'Recubrimiento libre',
    unidad: 'mm',
    grupo: 'Zapata',
    min: 40,
    max: 100,
    paso: 5,
    ayuda:
      'Tabla 20.5.1.3.1: 75 mm cuando el hormigón se vacía contra el suelo y queda en contacto permanente con él.',
  },

  {
    nombre: 'c_1',
    etiqueta: 'Lado de la columna c_1',
    unidad: 'cm',
    grupo: 'Columna',
    min: 20,
    max: 200,
    paso: 5,
    ayuda: 'El lado paralelo a B, o sea a la dirección del momento.',
  },
  {
    nombre: 'c_2',
    etiqueta: 'Lado de la columna c_2',
    unidad: 'cm',
    grupo: 'Columna',
    min: 20,
    max: 200,
    paso: 5,
    ayuda: 'El lado paralelo a L.',
  },

  {
    nombre: 'd_b_B',
    etiqueta: 'Diámetro de la malla en B',
    unidad: 'mm',
    grupo: 'Armadura dirección B (va abajo)',
    opciones: DIAMETROS,
  },
  {
    nombre: 'n_b_B',
    etiqueta: 'Número de barras en B',
    grupo: 'Armadura dirección B (va abajo)',
    min: 3,
    max: 40,
    paso: 1,
    ayuda: 'Repartidas en el ancho L. Esta malla va en la capa inferior, así que es la de mayor altura útil.',
  },

  {
    nombre: 'd_b_L',
    etiqueta: 'Diámetro de la malla en L',
    unidad: 'mm',
    grupo: 'Armadura dirección L (va encima)',
    opciones: DIAMETROS,
  },
  {
    nombre: 'n_b_L',
    etiqueta: 'Número de barras en L',
    grupo: 'Armadura dirección L (va encima)',
    min: 3,
    max: 40,
    paso: 1,
    ayuda: 'Repartidas en el ancho B.',
  },

  {
    nombre: 'P_D',
    etiqueta: 'Carga permanente P_D',
    unidad: 'tonf',
    grupo: 'Cargas de servicio',
    min: 0,
    max: 2000,
    paso: 5,
  },
  {
    nombre: 'P_L',
    etiqueta: 'Sobrecarga de uso P_L',
    unidad: 'tonf',
    grupo: 'Cargas de servicio',
    min: 0,
    max: 2000,
    paso: 5,
  },
  {
    nombre: 'M_D',
    etiqueta: 'Momento permanente M_D',
    unidad: 'tonf*m',
    grupo: 'Cargas de servicio',
    min: 0,
    max: 500,
    paso: 1,
    ayuda:
      'En la base de la columna, alrededor del eje perpendicular a B. 13.2.6.1: solo los momentos de extremo calculados se transfieren a la zapata; el mínimo por esbeltez de 6.6.4.5 no.',
  },
  {
    nombre: 'M_L',
    etiqueta: 'Momento de sobrecarga M_L',
    unidad: 'tonf*m',
    grupo: 'Cargas de servicio',
    min: 0,
    max: 500,
    paso: 1,
  },

  {
    nombre: 'via',
    etiqueta: 'Resistencia al corte del hormigón',
    grupo: 'Hipótesis',
    opciones: [
      { valor: 2, etiqueta: 'Caso general — Tabla 22.5.5.1(c), con λ_s y ρ_w' },
      { valor: 1, etiqueta: 'Fundación rígida sobre suelo — 13.2.6.2' },
    ],
    ayuda:
      '13.2.6.2 permite V_c = 0,17λ√f’c·b·d y λ_s = 1 en una fundación superficial apoyada continuamente en el suelo y de comportamiento RÍGIDO. R13.2.6.2 advierte que una fundación analizada con la rigidez de la interacción suelo-estructura puede no acogerse.',
  },
];

const SALIDAS: SalidaDef[] = [
  { nombre: 'u_q', etiqueta: 'Presión de contacto — q_máx / q_a', tipo: 'uso', ayuda: '13.3.1.1, cargas de servicio' },
  { nombre: 'u_p', etiqueta: 'Punzonamiento — v_u / φv_c', tipo: 'uso', ayuda: '8.5.3.1.2 · 22.6.4.1 y Tabla 22.6.5.2' },
  { nombre: 'u_V1', etiqueta: 'Corte en una dirección', tipo: 'uso', ayuda: '8.5.3.1.1 · 13.2.6.2 o Tabla 22.5.5.1' },
  { nombre: 'u_M', etiqueta: 'Flexión', tipo: 'uso', ayuda: '13.2.7.1 · 22.3.1 · 8.5.1.1(a)' },
  { nombre: 'u_As', etiqueta: 'Armadura mínima', tipo: 'uso', ayuda: '8.6.1.1 — A_s,mín = 0,0018·A_g' },
  { nombre: 'u_ld', etiqueta: 'Desarrollo de la barra', tipo: 'uso', ayuda: 'Tabla 25.4.2.3 contra el largo disponible' },
  { nombre: 'gobierna', etiqueta: 'Gobierna', tipo: 'texto' },
  { nombre: 'dir_critica', etiqueta: 'Dirección crítica', tipo: 'texto' },

  { nombre: 'A_req', etiqueta: 'Área en planta requerida', unidad: 'm^2', tipo: 'valor', ayuda: '13.3.1.1, sin excentricidad' },
  { nombre: 'A_zap', etiqueta: 'Área en planta provista', unidad: 'm^2', tipo: 'valor' },
  { nombre: 'exc', etiqueta: 'Excentricidad en servicio', unidad: 'cm', tipo: 'valor' },
  { nombre: 'q_max', etiqueta: 'Presión de contacto máxima', unidad: 'kgf/cm^2', tipo: 'valor' },
  { nombre: 'q_min', etiqueta: 'Presión de contacto mínima', unidad: 'kgf/cm^2', tipo: 'valor' },
  { nombre: 'sobre_q', etiqueta: 'Exceso de q_u,máx sobre la media', tipo: 'valor', ayuda: 'Lo que se paga por diseñar con la presión máxima uniforme' },
  { nombre: 'd_B', etiqueta: 'Altura útil, dirección B', unidad: 'cm', tipo: 'valor' },
  { nombre: 'd_L', etiqueta: 'Altura útil, dirección L', unidad: 'cm', tipo: 'valor' },
  { nombre: 'd_prom', etiqueta: 'Altura útil de punzonamiento', unidad: 'cm', tipo: 'valor', ayuda: '22.6.2.1: el promedio de las dos direcciones' },
  { nombre: 'A_s_B', etiqueta: 'Acero provisto en B', unidad: 'cm^2', tipo: 'valor' },
  { nombre: 'A_s_L', etiqueta: 'Acero provisto en L', unidad: 'cm^2', tipo: 'valor' },
  { nombre: 'gam_s', etiqueta: 'Fracción en la banda central γ_s', tipo: 'valor', ayuda: '13.3.3.3, solo en zapatas rectangulares' },
  { nombre: 'A_s_banda', etiqueta: 'Acero de la banda central', unidad: 'cm^2', tipo: 'valor', ayuda: '13.3.3.3: γ_s·A_s en un ancho igual al lado corto' },
  { nombre: 'Rd_M_B', etiqueta: 'Momento resistente en B φM_n', unidad: 'tonf*m', tipo: 'valor' },
  { nombre: 'Rd_M_L', etiqueta: 'Momento resistente en L φM_n', unidad: 'tonf*m', tipo: 'valor' },
  { nombre: 'Rd_V1_B', etiqueta: 'Corte resistente en B φV_c', unidad: 'tonf', tipo: 'valor' },
  { nombre: 'Rd_V1_L', etiqueta: 'Corte resistente en L φV_c', unidad: 'tonf', tipo: 'valor' },
  { nombre: 'b_o', etiqueta: 'Perímetro crítico b_0', unidad: 'cm', tipo: 'valor', ayuda: '22.6.4.1: a d/2 de la cara' },
  { nombre: 'v_uv', etiqueta: 'Tensión de punzonamiento v_u', unidad: 'kgf/cm^2', tipo: 'valor' },
  { nombre: 'Rd_v', etiqueta: 'Tensión resistente φv_c', unidad: 'kgf/cm^2', tipo: 'valor' },
  { nombre: 'l_d', etiqueta: 'Longitud de desarrollo ℓ_d', unidad: 'cm', tipo: 'valor', ayuda: 'Tabla 25.4.2.3' },
  { nombre: 'A_dow', etiqueta: 'Armadura de espera mínima', unidad: 'cm^2', tipo: 'valor', ayuda: '16.3.4.1: 0,005·A_g de la columna' },

  { nombre: 'v_geom', etiqueta: 'La zapata sobresale de la columna', tipo: 'veredicto' },
  { nombre: 'v_d_min', etiqueta: 'Altura útil ≥ 150 mm', tipo: 'veredicto', ayuda: '13.3.1.2' },
  { nombre: 'v_duct', etiqueta: 'Controlada por tracción', tipo: 'veredicto', ayuda: '7.3.3.1 y Tabla 21.2.2' },
  { nombre: 'v_As', etiqueta: 'Cumple la armadura mínima', tipo: 'veredicto', ayuda: '8.6.1.1' },
  { nombre: 'v_sep', etiqueta: 'Separación admisible', tipo: 'veredicto', ayuda: '8.7.2.2: la menor de 2h y 450 mm' },
  { nombre: 'v_ld', etiqueta: 'La barra se desarrolla', tipo: 'veredicto', ayuda: 'ℓ_d ≤ el largo disponible desde la cara de la columna' },
  { nombre: 'v_rfc', etiqueta: '√f’c ≤ 8,3 MPa en punzonamiento', tipo: 'veredicto', ayuda: '22.6.3.1' },

  {
    nombre: 'v_nucleo',
    etiqueta: 'Toda la base comprimida',
    tipo: 'veredicto',
    aviso: true,
    avisoTexto: 'La excentricidad se sale del núcleo: la base se despega',
    ayuda:
      'Con e > B/6 una parte de la zapata levanta y la distribución lineal de presiones deja de valer. Habría que rehacerla con contacto parcial, que este módulo no cubre.',
  },
  {
    nombre: 'v_rigida',
    etiqueta: 'Sin la relajación de 13.2.6.2',
    tipo: 'veredicto',
    aviso: true,
    avisoTexto: 'Se invocó la relajación de 13.2.6.2 para fundación rígida',
    ayuda:
      'R13.2.6.2: una fundación diseñada considerando la rigidez de la interacción suelo-estructura puede no acogerse a esa relajación. Con λ_s y ρ_w la capacidad baja lo que dice «caída».',
  },
];

function construirHoja(e: EntradasZapata): Item[] {
  return [
    t('ZAPATA AISLADA RECTANGULAR BAJO COLUMNA'),
    t('ACI 318-25 (edición SI) · Cap. 13 fundaciones · Cap. 8 losas en dos direcciones · 22.5 y 22.6'),
    t('Memoria generada desde el módulo de diseño. Rd_ = capacidad de diseño (incluye φ).'),

    t('━━ ALCANCE DE ESTA MEMORIA ━━'),
    t('13.3.3.1 remite la zapata de dos direcciones al Cap. 8. 8.5.1.1 enumera las cuatro'),
    t('condiciones de resistencia de una losa; esta memoria cubre tres —(a) φM_n ≥ M_u en las dos'),
    t('direcciones, (c) φV_n ≥ V_u en una dirección y (d) φv_n ≥ v_u en punzonamiento— más el'),
    t('área en planta (13.3.1.1), los mínimos, el reparto de 13.3.3.3 y el desarrollo de la barra.'),
    t('NO cubre la (b): el punzonamiento se verifica CONCÉNTRICO y no se reparte el momento'),
    t('desbalanceado por excentricidad de corte (8.4.2.2 y 8.4.4.2).'),
    t('Tampoco cubre: momento biaxial, el despegue de la base (contacto parcial), el deslizamiento'),
    t('y el volcamiento del conjunto, los asentamientos, el peso propio de la zapata y del relleno'),
    t('—que el suelo equilibra justo debajo y no solicitan la sección—, ni la capa sísmica de 18.13.'),
    t('Una zapata no lleva refuerzo de corte: si el punzonamiento no cumple, se sube el canto.'),

    t('━━ DATOS · MATERIALES ━━'),
    m(`f_c := ${n(e.f_c)} kgf/cm^2`),
    m(`f_y := ${n(e.f_y)} kgf/cm^2`),
    t('20.2.2.2: se permite tomar E_s = 200 000 MPa para barras no pretensadas.'),
    m('E_s := 200000 MPa'),
    m('eps_ty := f_y/E_s ='),
    t('19.2.4.2: hormigón de densidad normal → λ = 1. 22.2.2.1: ε_cu = 0,003.'),
    m('lam := 1'),
    m('eps_cu := 0.003'),
    t('Tabla 22.2.2.4.3: β_1 se DERIVA de f’c, no se declara.'),
    m('beta_1 := beta1(f_c) ='),
    t('Tabla 21.2.1(b): φ = 0,75 para cortante. Tabla 21.2.2: φ = 0,90 si es controlada por tracción.'),
    m('phi_v := 0.75'),
    m('phi_f := 0.90'),

    t('━━ DATOS · LOS COEFICIENTES DE LA EDICIÓN SI ━━'),
    t('ACI 318 escribe sus coeficientes empíricos en MPa. Este puente los lleva a kgf/cm², que es'),
    t('donde vive el resto de la memoria, sin reescribir ni un número de la norma.'),
    m('fconv := sqrt(1 MPa/(1 kgf/cm^2)) ='),
    m('rfck := sqrtfc(f_c) = kgf/cm^2'),
    t('Tabla 22.5.5.1: el 0,17 de la fila (a) —que es también el de 13.2.6.2— y el 0,66 de la (c).'),
    m('k_clas := 0.17*fconv ='),
    m('k_1d := 0.66*fconv ='),
    t('22.5.5.1.1: el piso 0,083 y el tope 0,42 de esa misma tabla.'),
    m('k_piso := 0.083*fconv ='),
    m('k_tope := 0.42*fconv ='),
    t('Tabla 22.6.5.2(a): el 0,33 del punzonamiento. Tabla 25.4.2.3: el 2,1 del desarrollo.'),
    m('k_2a := 0.33*fconv ='),
    m('k_ld := 2.1*fconv ='),

    t('━━ DATOS · GEOMETRÍA Y ARMADURA ━━'),
    m(`B := ${n(e.B)} cm`),
    m(`L := ${n(e.L)} cm`),
    m(`h := ${n(e.h)} cm`),
    m(`rec := ${n(e.rec)} mm`),
    m(`c_1 := ${n(e.c_1)} cm`),
    m(`c_2 := ${n(e.c_2)} cm`),
    m(`d_b_B := ${n(e.d_b_B)} mm`),
    m(`n_b_B := ${n(e.n_b_B)}`),
    m(`d_b_L := ${n(e.d_b_L)} mm`),
    m(`n_b_L := ${n(e.n_b_L)}`),
    m('A_zap := B*L = m^2'),
    t('13.3.3.3: β es el cociente de lados de la ZAPATA, y manda el reparto de la armadura.'),
    m('beta_z := max(B, L)/min(B, L) ='),
    m('A_b_B := pi*d_b_B^2/4 = cm^2'),
    m('A_b_L := pi*d_b_L^2/4 = cm^2'),
    m('A_s_B := n_b_B*A_b_B = cm^2'),
    m('A_s_L := n_b_L*A_b_L = cm^2'),
    m('sep_B := (L - 2*rec - d_b_B)/(n_b_B - 1) = cm'),
    m('sep_L := (B - 2*rec - d_b_L)/(n_b_L - 1) = cm'),
    t('Las tres alturas útiles se DERIVAN de cómo se apilan las dos mallas. La de la dirección B'),
    t('va abajo, así que es la de mayor brazo; la de L se apoya encima. Cada dirección se verifica'),
    t('con la suya, y no con un promedio que le regalaría canto a la de arriba.'),
    m('d_B := h - rec - d_b_B/2 = cm'),
    m('d_L := h - rec - d_b_B - d_b_L/2 = cm'),
    t('22.6.2.1: en punzonamiento d es el PROMEDIO de las dos direcciones.'),
    m('d_prom := (d_B + d_L)/2 = cm'),
    t('13.3.1.2: la altura útil del refuerzo inferior no baja de 150 mm.'),
    m('v_d_min := d_L >= 150 mm ='),

    t('━━ DATOS · SUELO Y CARGAS DE SERVICIO ━━'),
    t('Frontera declarada: la presión admisible del informe de mecánica de suelos.'),
    m(`q_a := ${n(e.q_a)} kgf/cm^2`),
    t('13.2.6.1: el peso propio de la zapata y del relleno no solicitan la sección — los equilibra'),
    t('el suelo justo debajo. Solo lo que baja por la columna genera corte y momento.'),
    m(`P_D := ${n(e.P_D)} tonf`),
    m(`P_L := ${n(e.P_L)} tonf`),
    m(`M_D := ${n(e.M_D)} tonf*m`),
    m(`M_L := ${n(e.M_L)} tonf*m`),
    m(`via := ${n(e.via)}`),

    t('━━ 1 · ÁREA EN PLANTA Y PRESIÓN DE CONTACTO (13.3.1.1, cargas de SERVICIO) ━━'),
    t('13.3.1.1: el área en planta se proporciona con cargas NO mayoradas contra la presión'),
    t('admisible, y contando los momentos aplicados a la fundación.'),
    m('P_serv := P_D + P_L = tonf'),
    m('M_serv := M_D + M_L = tonf*m'),
    m('A_req := P_serv/q_a = m^2'),
    t('Sin carga no hay excentricidad que medir: el cociente se define por tramos para que la'),
    t('hoja siga dando números y no un NaN que se propague hasta el dibujo.'),
    p('exc :=\n    if P_serv > 0 tonf\n        return M_serv/P_serv\n    return 0 cm'),
    m('exc = cm'),
    t('Mientras la resultante caiga dentro del núcleo central (e ≤ B/6) toda la base comprime y'),
    t('la distribución es lineal: q = P/A·(1 ± 6e/B).'),
    m('exc_lim := B/6 = cm'),
    m('v_nucleo := exc <= exc_lim ='),
    m('q_max := P_serv/A_zap*(1 + 6*exc/B) = kgf/cm^2'),
    m('q_min := P_serv/A_zap*(1 - 6*exc/B) = kgf/cm^2'),
    m('u_q := q_max/q_a ='),
    m('v_q := q_max <= q_a ='),

    t('━━ 2 · PRESIÓN MAYORADA DE DISEÑO (Tabla 5.3.1, Ec. 5.3.1b) ━━'),
    m('N_u := 1.2*P_D + 1.6*P_L = tonf'),
    m('M_u_col := 1.2*M_D + 1.6*M_L = tonf*m'),
    m('q_u_med := N_u/A_zap = tonf/m^2'),
    p('exc_u :=\n    if N_u > 0 tonf\n        return M_u_col/N_u\n    return 0 cm'),
    m('exc_u = cm'),
    m('q_u_max := q_u_med*(1 + 6*exc_u/B) = tonf/m^2'),
    m('q_u_min := q_u_med*(1 - 6*exc_u/B) = tonf/m^2'),
    t('DECISIÓN DE ESTA MEMORIA: el diseño estructural usa q_u,máx UNIFORME sobre toda la planta.'),
    t('Es lo que hace un cálculo a mano y está del lado seguro; integrar el trapecio daría menos.'),
    t('Cuánto se paga por esa simplificación lo dice el exceso sobre la media, aquí abajo. Con'),
    t('M = 0 el trapecio es un rectángulo y q_u,máx vuelve a ser N_u/A.'),
    p('sobre_q :=\n    if q_u_med > 0 tonf/m^2\n        return q_u_max/q_u_med - 1\n    return 0'),
    m('sobre_q ='),

    t('━━ 3 · CORTE EN UNA DIRECCIÓN (8.5.3.1.1 · 13.2.6.2 · Tabla 22.5.5.1) ━━'),
    t('13.2.7.1 pone la sección crítica de momento en la cara de la columna, y 13.2.7.2 mide desde'),
    t('ahí: 8.4.3.2 la ubica a una distancia d de esa cara.'),
    t('Una zapata tiene que sobresalir de su columna. Si no lo hace, el modelo entero deja de'),
    t('significar algo: lo denuncia v_geom, y los voladizos se acotan en cero para que lo que'),
    t('sigue sean números y no infinitos que revienten el dibujo.'),
    m('v_geom := B > c_1 and L > c_2 ='),
    m('vol_B := max((B - c_1)/2, 0 cm) = cm'),
    m('vol_L := max((L - c_2)/2, 0 cm) = cm'),
    t('El corte se acota en cero: si el voladizo no llega a d, la sección crítica cae fuera de la'),
    t('zapata y no hay corte que verificar.'),
    m('V_u1_B := max(q_u_max*L*(vol_B - d_B), 0 tonf) = tonf'),
    m('V_u1_L := max(q_u_max*B*(vol_L - d_L), 0 tonf) = tonf'),
    t('13.2.6.2(a): en una fundación superficial rígida se permite la expresión clásica, sin efecto'),
    t('de tamaño ni cuantía. El caso general es la fila (c) de la Tabla 22.5.5.1, que es donde cae'),
    t('una zapata sin estribos: A_v < A_v,mín.'),
    m('v_clas := k_clas*lam*rfck = kgf/cm^2'),
    m('v_piso := k_piso*lam*rfck = kgf/cm^2'),
    m('v_tope := k_tope*lam*rfck = kgf/cm^2'),
    m('rho_B := A_s_B/(L*d_B) ='),
    m('crho_B := rho_B^(1/3) ='),
    t('Ec. (22.5.5.1.3): el factor de efecto de tamaño, con d en mm.'),
    m('lam_s_B := min(1, sqrt(2/(1 + d_B/(250 mm)))) ='),
    m('v_bruto_B := k_1d*lam_s_B*lam*crho_B*rfck = kgf/cm^2'),
    m('v_c1_B := min(max(v_bruto_B, v_piso), v_tope) = kgf/cm^2'),
    m('rho_L := A_s_L/(B*d_L) ='),
    m('crho_L := rho_L^(1/3) ='),
    m('lam_s_L := min(1, sqrt(2/(1 + d_L/(250 mm)))) ='),
    m('v_bruto_L := k_1d*lam_s_L*lam*crho_L*rfck = kgf/cm^2'),
    m('v_c1_L := min(max(v_bruto_L, v_piso), v_tope) = kgf/cm^2'),
    t('Lo que cuesta NO acogerse a 13.2.6.2, que es la decisión más cara de esta hoja:'),
    m('caida := 1 - v_c1_B/v_clas ='),
    p('v_cV_B :=\n    if via == 1\n        return v_clas\n    return v_c1_B'),
    p('v_cV_L :=\n    if via == 1\n        return v_clas\n    return v_c1_L'),
    m('v_cV_B = kgf/cm^2'),
    m('v_cV_L = kgf/cm^2'),
    m('Rd_V1_B := phi_v*v_cV_B*L*d_B = tonf'),
    m('Rd_V1_L := phi_v*v_cV_L*B*d_L = tonf'),
    m('u_V1_B := V_u1_B/Rd_V1_B ='),
    m('u_V1_L := V_u1_L/Rd_V1_L ='),
    m('u_V1 := max(u_V1_B, u_V1_L) ='),
    m('v_V1 := u_V1 <= 1 ='),

    t('━━ 4 · PUNZONAMIENTO (8.5.3.1.2 · 22.6.4.1 · Tabla 22.6.5.2) ━━'),
    t('22.6.3.1: el √f’c que entra en v_c no debe exceder 8,3 MPa.'),
    m('v_rfc := sqrt(f_c/MPa) <= 8.3 ='),
    t('22.6.4.1(a): perímetro crítico a d/2 de la cara. En una zapata aislada el perímetro es'),
    t('cerrado —la losa rodea la columna por las cuatro caras—, así que 22.6.5.3 da α_s = 40.'),
    m('alfa_s := 40'),
    m('b_1 := c_1 + d_prom = cm'),
    m('b_2 := c_2 + d_prom = cm'),
    m('b_o := 2*(b_1 + b_2) = cm'),
    t('β_c es el cociente de lados de la COLUMNA, que es otra cosa que el β de la zapata.'),
    m('beta_c := max(c_1, c_2)/min(c_1, c_2) ='),
    t('13.2.6.2(b): en una fundación superficial rígida, λ_s se toma igual a 1,0.'),
    p(
      'lam_s_p :=\n' +
        '    if via == 1\n' +
        '        return 1\n' +
        '    return min(1, sqrt(2/(1 + d_prom/(250 mm))))',
    ),
    m('lam_s_p ='),
    t('Tabla 22.6.5.2: v_c es el MENOR de (a), (b) y (c).'),
    m('r_ab := alfa_s*d_prom/b_o ='),
    m('v_ca := k_2a*lam_s_p*lam*rfck = kgf/cm^2'),
    m('v_cb := (0.17 + 0.33/beta_c)*fconv*lam_s_p*lam*rfck = kgf/cm^2'),
    m('v_cc := (0.17 + 0.083*r_ab)*fconv*lam_s_p*lam*rfck = kgf/cm^2'),
    m('v_c := min(v_ca, v_cb, v_cc) = kgf/cm^2'),
    m('Rd_v := phi_v*v_c = kgf/cm^2'),
    t('Lo que punzona es la carga de la columna menos la reacción del suelo que cae DENTRO del'),
    t('perímetro. Se acota en cero: con una zapata muy grande bajo una columna chica la resta sale'),
    t('negativa, y un factor de utilización bajo cero no significa nada.'),
    m('V_u2 := max(N_u - q_u_max*b_1*b_2, 0 tonf) = tonf'),
    m('v_uv := V_u2/(b_o*d_prom) = kgf/cm^2'),
    m('u_p := v_uv/Rd_v ='),
    m('v_p := Rd_v >= v_uv ='),

    t('━━ 5 · FLEXIÓN EN LAS DOS DIRECCIONES (13.2.7.1 · 22.2.2.4 · 8.5.1.1a) ━━'),
    t('Tabla 13.2.7.1: con columna de hormigón, M_u se toma en la CARA de la columna. El voladizo'),
    t('lleva la presión de diseño sobre todo el ancho de la zapata.'),
    m('M_u_B := q_u_max*L*vol_B^2/2 = tonf*m'),
    m('M_u_L := q_u_max*B*vol_L^2/2 = tonf*m'),
    t('22.2.2.4.1: bloque rectangular equivalente de 0,85f’c sobre una altura a = β_1·c.'),
    m('a_B := A_s_B*f_y/(0.85*f_c*L) = cm'),
    m('c_B := a_B/beta_1 = cm'),
    m('eps_t_B := eps_cu*(d_B - c_B)/c_B ='),
    m('Rd_M_B := phi_f*A_s_B*f_y*(d_B - a_B/2) = tonf*m'),
    m('u_M_B := M_u_B/Rd_M_B ='),
    m('a_L := A_s_L*f_y/(0.85*f_c*B) = cm'),
    m('c_L := a_L/beta_1 = cm'),
    m('eps_t_L := eps_cu*(d_L - c_L)/c_L ='),
    m('Rd_M_L := phi_f*A_s_L*f_y*(d_L - a_L/2) = tonf*m'),
    m('u_M_L := M_u_L/Rd_M_L ='),
    m('u_M := max(u_M_B, u_M_L) ='),
    m('v_M := u_M <= 1 ='),
    t('7.3.3.1: una losa no pretensada tiene que ser controlada por tracción según la Tabla 21.2.2,'),
    t('que es lo que da φ = 0,90. Se exige en las dos direcciones.'),
    m('eps_lim := eps_ty + 0.003 ='),
    m('v_duct := min(eps_t_B, eps_t_L) >= eps_lim ='),

    t('━━ 6 · MÍNIMOS Y REPARTO DE LA ARMADURA (8.6.1.1 · 8.7.2.2 · 13.3.3.3) ━━'),
    t('13.3.3.1 remite al Cap. 8, y 8.6.1.1 pide A_s,mín = 0,0018·A_g — la misma cuantía de'),
    t('retracción y temperatura de 24.4.3.2, y con el espesor TOTAL, no con la altura útil.'),
    m('A_s_min_B := 0.0018*L*h = cm^2'),
    m('A_s_min_L := 0.0018*B*h = cm^2'),
    m('u_As := max(A_s_min_B/A_s_B, A_s_min_L/A_s_L) ='),
    m('v_As := A_s_B >= A_s_min_B and A_s_L >= A_s_min_L ='),
    t('8.7.2.2: en las secciones críticas, s no pasa de la menor de 2h y 450 mm.'),
    m('s_max := min(2*h, 450 mm) = cm'),
    m('v_sep := max(sep_B, sep_L) <= s_max ='),
    t('13.3.3.2: en una zapata CUADRADA el refuerzo va uniforme en las dos direcciones. 13.3.3.3:'),
    t('en una rectangular, la fracción γ_s de la armadura del lado CORTO se concentra en una banda'),
    t('central de ancho igual al lado corto, y el resto se reparte fuera. Con β = 1, γ_s = 1 y la'),
    t('regla se reduce sola al reparto uniforme.'),
    m('gam_s := 2/(beta_z + 1) ='),
    p(
      'A_s_corto :=\n' +
        '    if L < B\n' +
        '        return A_s_L\n' +
        '    return A_s_B',
    ),
    m('A_s_corto = cm^2'),
    m('A_s_banda := gam_s*A_s_corto = cm^2'),
    m('A_s_fuera := A_s_corto - A_s_banda = cm^2'),
    m('anc_banda := min(B, L) = cm'),

    t('━━ 7 · DESARROLLO DE LA BARRA (Tabla 25.4.2.3 y 25.4.2.1) ━━'),
    t('Barra inferior no superior a la No. 19, sin recubrimiento epóxico y sin acero de alta'),
    t('resistencia: ψ_t = ψ_e = ψ_g = 1. 25.4.2.1: ℓ_d no baja de 300 mm.'),
    m('psi_t := 1'),
    m('psi_e := 1'),
    m('psi_g := 1'),
    m('l_d := f_y*psi_t*psi_e*psi_g/(k_ld*lam*rfck)*d_b_B = cm'),
    m('v_ld300 := l_d >= 300 mm ='),
    t('13.2.8.2: la fuerza calculada en la barra tiene que desarrollarse a cada lado de la sección'),
    t('crítica; lo disponible es el voladizo menos el recubrimiento lateral.'),
    m('l_disp := max(vol_B - rec, 0 cm) = cm'),
    t('El divisor se acota en 1 cm por el mismo motivo que los voladizos: con la geometría'),
    t('imposible que v_geom denuncia, el largo disponible es cero y el cociente no existiría.'),
    m('u_ld := l_d/max(l_disp, 1 cm) ='),
    m('v_ld := l_disp >= l_d ='),

    t('━━ 8 · DETALLADO ━━'),
    t('16.3.4.1: la armadura de espera que conecta la columna con la zapata no baja de 0,005·A_g.'),
    m('A_dow := 0.005*c_1*c_2 = cm^2'),
    m('v_rigida := via == 2 ='),

    t('━━ RESUMEN: QUÉ GOBIERNA ━━'),
    m('u_max := max(u_q, u_V1, u_p, u_M, u_As, u_ld) ='),
    p(
      'gobierna :=\n' +
        '    if u_max == u_q\n' +
        '        return "presión de contacto en servicio (13.3.1.1)"\n' +
        '    else if u_max == u_p\n' +
        '        return "punzonamiento (Tabla 22.6.5.2)"\n' +
        '    else if u_max == u_V1\n' +
        '        return "corte en una dirección (22.5.5.1 y 13.2.6.2)"\n' +
        '    else if u_max == u_M\n' +
        '        return "flexión (22.3.1)"\n' +
        '    else if u_max == u_ld\n' +
        '        return "desarrollo de la barra (Tabla 25.4.2.3)"\n' +
        '    return "armadura mínima (8.6.1.1)"',
    ),
    t('Cuál de los dos voladizos manda. En una zapata rectangular no tienen por qué coincidir el'),
    t('de flexión y el de corte, así que se mira el peor de los dos usos en cada dirección.'),
    p(
      'dir_critica :=\n' +
        '    if max(u_V1_B, u_M_B) >= max(u_V1_L, u_M_L)\n' +
        '        return "dirección B (voladizo de B, armadura inferior)"\n' +
        '    return "dirección L (voladizo de L, armadura superior)"',
    ),
    m('v_cumple := u_max <= 1 and v_geom and v_d_min and v_duct and v_sep and v_rfc ='),

    // ── El mapeo a píxeles del esquema ──────────────────────────────────────
    // Todo adimensional a propósito: `formatSvg` lanza si un atributo recibe una
    // magnitud con unidades, y ese fallo hace caer `verify:planilla`.
    t('━━ ESQUEMA · MAPEO A PÍXELES ━━'),
    t('Planta: la zapata entera, con el perímetro crítico y la banda central de 13.3.3.3.'),
    m('esc_p := min(1.6, 300/(B/(1 cm)), 156/(L/(1 cm)))'),
    m('cx_p := 200'),
    m('cy_p := 156'),
    m('B_px := B/(1 cm)*esc_p'),
    m('L_px := L/(1 cm)*esc_p'),
    m('c1_px := c_1/(1 cm)*esc_p'),
    m('c2_px := c_2/(1 cm)*esc_p'),
    m('dp_px := d_prom/(1 cm)*esc_p'),
    m('ban_px := anc_banda/(1 cm)*esc_p'),
    m('x_z := cx_p - B_px/2'),
    m('y_z := cy_p - L_px/2'),
    m('x_col := cx_p - c1_px/2'),
    m('y_col := cy_p - c2_px/2'),
    m('x_per := x_col - dp_px/2'),
    m('y_per := y_col - dp_px/2'),
    m('anc_per := c1_px + dp_px'),
    m('alt_per := c2_px + dp_px'),
    t('La banda de 13.3.3.3 es de ancho igual al lado corto y va centrada en la columna; se dibuja'),
    t('en la dirección del lado LARGO, que es a lo largo de la que se reparte la armadura corta.'),
    p(
      'pts_banda :=\n' +
        '    if B >= L\n' +
        '        return [[cx_p - ban_px/2, y_z], [cx_p + ban_px/2, y_z], [cx_p + ban_px/2, y_z + L_px], [cx_p - ban_px/2, y_z + L_px], [cx_p - ban_px/2, y_z]]\n' +
        '    return [[x_z, cy_p - ban_px/2], [x_z + B_px, cy_p - ban_px/2], [x_z + B_px, cy_p + ban_px/2], [x_z, cy_p + ban_px/2], [x_z, cy_p - ban_px/2]]',
    ),
    t('Diagrama de presiones de servicio: el trapecio bajo la zapata, a lo largo de B. Se acota en'),
    t('cero para dibujarlo — fuera del núcleo q_mín es negativa y ahí lo que hay es despegue, que'),
    t('es justo lo que el aviso enuncia.'),
    m('x_d0 := 60'),
    m('y_d0 := 376'),
    m('anc_d := 290'),
    m('alt_zap := 28'),
    t('La columna se dibuja centrada, que es donde está; lo que se corre es la RESULTANTE, y esa'),
    t('distancia al centro es la excentricidad.'),
    m('anc_col_d := c_1/B*anc_d'),
    m('x_cen_d := x_d0 + anc_d/2'),
    m('x_res := x_cen_d + exc/B*anc_d'),
    m('q_ref := max(q_max, q_a) ='),
    m('qmax_px := q_max/q_ref*88'),
    m('qmin_px := max(q_min/q_ref, 0)*88'),
    m('y_base := y_d0 + alt_zap'),
    p(
      'pts_pres :=\n' +
        '    return [[x_d0, y_base], [x_d0 + anc_d, y_base], [x_d0 + anc_d, y_base + qmin_px], [x_d0, y_base + qmax_px], [x_d0, y_base]]',
    ),
    t('La línea de la presión admisible, para ver de un vistazo cuánto margen queda:'),
    m('y_adm := y_base + q_a/q_ref*88'),

    // La figura va la última: captura el scope en su posición de orden de
    // lectura, así que solo puede rotular lo que ya se calculó antes.
    img('/esquemas/diseno-zapata-aislada.svg', 660, 430),
  ];
}

const POR_DEFECTO: EntradasZapata = {
  f_c: 250,
  f_y: 4200,
  q_a: 2.0,
  B: 300,
  L: 250,
  h: 65,
  rec: 75,
  c_1: 50,
  c_2: 40,
  d_b_B: 18,
  n_b_B: 14,
  d_b_L: 16,
  n_b_L: 21,
  P_D: 70,
  P_L: 35,
  M_D: 8,
  M_L: 4,
  via: 2,
};

/**
 * La zapata de `zapata-aislada.json`: 220×220, canto 55, columna de 40 y 9φ18
 * en cada dirección, sin momento.
 *
 * Con B = L y M = 0 el módulo se reduce al caso de esa planilla, y ahí es donde
 * el contraste muerde de verdad.
 */
const CASO_PLANILLA: EntradasZapata = {
  ...POR_DEFECTO,
  f_c: 250,
  f_y: 4200,
  q_a: 2.0,
  B: 220,
  L: 220,
  h: 55,
  rec: 75,
  c_1: 40,
  c_2: 40,
  d_b_B: 18,
  n_b_B: 9,
  d_b_L: 18,
  n_b_L: 9,
  P_D: 60,
  P_L: 30,
  M_D: 0,
  M_L: 0,
  via: 2,
};

/**
 * La geometría de `losa-punzonamiento-momento.json`: h = 22 cm, columna
 * interior de 50×50, recubrimiento 20 mm y φ12.
 *
 * De esa planilla solo se contrasta la cadena de v_c del punzonamiento, que no
 * depende de la carga; por eso las cargas de este caso son las que sean.
 */
const CASO_PUNZONAMIENTO: EntradasZapata = {
  ...POR_DEFECTO,
  f_c: 250,
  B: 300,
  L: 300,
  h: 22,
  rec: 20,
  c_1: 50,
  c_2: 50,
  d_b_B: 12,
  n_b_B: 15,
  d_b_L: 12,
  n_b_L: 15,
  M_D: 0,
  M_L: 0,
  via: 2,
};

export const zapataAislada: ModuloDiseno<EntradasZapata> = {
  id: 'zapata-aislada',
  titulo: 'Zapata aislada',
  resumen: 'Zapata rectangular con momento: presión de contacto, corte, punzonamiento y flexión.',
  disciplina: 'hormigon',
  norma: 'ACI 318-25 (edición SI)',
  esquema: '/esquemas/diseno-zapata-aislada.svg',
  anchoEsquema: 660,
  altoEsquema: 430,
  entradas: ENTRADAS,
  salidas: SALIDAS,
  porDefecto: POR_DEFECTO,
  construirHoja,
  contraste: [
    {
      planilla: 'zapata-aislada',
      entradas: CASO_PLANILLA,
      valores: [
        // IDÉNTICOS. Los coeficientes de la edición SI, la estática y todo lo
        // que no depende de la altura útil, más lo que usa `d_prom`, que con
        // dos mallas del mismo diámetro coincide con la `d` de esa planilla.
        'fconv', 'rfck', 'k_clas', 'k_1d', 'k_piso', 'k_tope', 'k_2a', 'k_ld',
        'A_zap', 'A_req', 'N_u', 'beta_c', 'eps_lim', 'A_dow', 'b_o', 'V_u2',
        { mio: 'q_max', suyo: 'q_serv' },
        'u_q',
        { mio: 'q_u_max', suyo: 'q_u' },
        { mio: 'd_prom', suyo: 'd' },
        { mio: 'vol_B', suyo: 'vol' },
        { mio: 'A_b_B', suyo: 'A_b' },
        { mio: 'A_s_B', suyo: 'A_s' },
        { mio: 'sep_B', suyo: 'sep' },
        { mio: 'M_u_B', suyo: 'M_u' },
        { mio: 'a_B', suyo: 'a_bl' },
        { mio: 'c_B', suyo: 'c_na' },
        { mio: 'A_s_min_B', suyo: 'A_smin' },
        { mio: 'alfa_s', suyo: 'alpha_s' },
        'l_d', 'l_disp', 'u_ld',

        // `v_c1` sale EXACTO, y no por casualidad: en las dos hojas gobierna el
        // piso de 22.5.5.1.1, que solo depende del material. Es la tesis de esa
        // planilla, y si alguien la rompiera este contraste lo diría.
        { mio: 'v_c1_B', suyo: 'v_c1' },
        { mio: 'v_piso', suyo: 'v_piso' },
        { mio: 'v_tope', suyo: 'v_tope' },

        // CON TOLERANCIA. Cada dirección se verifica con SU altura útil y esa
        // planilla usa la promediada para todo: 46,6 cm contra 45,7. Las
        // tolerancias de abajo son el desvío MEDIDO redondeado hacia arriba, no
        // un número cómodo — torcer la derivación para que cuadrara sería
        // regalarle canto a la malla de encima.
        { mio: 'd_B', suyo: 'd', tolerancia: 0.02 },          // 1,93 %
        { mio: 'rho_B', suyo: 'rho_w', tolerancia: 0.02 },    // 1,93 %
        { mio: 'crho_B', suyo: 'crho', tolerancia: 0.01 },    // 0,65 %
        { mio: 'lam_s_B', suyo: 'lam_s', tolerancia: 0.01 },  // 0,63 %
        { mio: 'v_bruto_B', suyo: 'v_bruto', tolerancia: 0.015 }, // 1,27 %
        { mio: 'V_u1_B', suyo: 'V_u1', tolerancia: 0.025 },   // 2,03 %
        { mio: 'Rd_V1_B', suyo: 'Rd_V1', tolerancia: 0.02 },  // 1,93 %
        { mio: 'u_V1_B', suyo: 'u_V1', tolerancia: 0.04 },    // 3,92 %, el peor
        { mio: 'Rd_M_B', suyo: 'Rd_M', tolerancia: 0.02 },    // 1,97 %
        { mio: 'u_M_B', suyo: 'u_M', tolerancia: 0.02 },      // 1,97 %
        { mio: 'eps_t_B', suyo: 'eps_t', tolerancia: 0.025 }, // 2,04 %

        // NO SE CONTRASTA de esta planilla la cadena v_2b / v_2c / v_c2 /
        // Rd_V2 / u_V2: escribe la Tabla 22.6.5.2 con el álgebra de ACI 318-14
        // —0,17·(1 + 2/β) en vez de 0,17 + 0,33/β, y 0,083·(2 + α_s·d/b_0) en
        // vez de 0,17 + 0,083·α_s·d/b_0—. Y la trampa es fina: con β_c = 1
        // gobierna el término (a), que es el ÚNICO idéntico en las dos
        // ediciones, así que contrastar `v_c2` pasaría en verde ocultando la
        // diferencia. El punzonamiento se contrasta abajo, contra una planilla
        // que sí usa la forma de 318-25.
      ],
    },
    {
      planilla: 'losa-punzonamiento-momento',
      entradas: CASO_PUNZONAMIENTO,
      valores: [
        { mio: 'fconv', suyo: 'conv' },
        { mio: 'd_prom', suyo: 'd' },
        { mio: 'lam_s_p', suyo: 'lam_s' },
        'phi_v', 'beta_c', 'b_o', 'r_ab', 's_max',
        { mio: 'alfa_s', suyo: 'alfa_s' },
        'v_ca', 'v_cb', 'v_cc', 'v_c', 'Rd_v',
      ],
    },
  ],
  casos: [
    { nombre: 'por defecto', entradas: POR_DEFECTO },
    { nombre: 'la zapata cuadrada de la planilla publicada', entradas: CASO_PLANILLA },
    { nombre: 'la geometría de la losa plana del contraste de punzonamiento', entradas: CASO_PUNZONAMIENTO },
    {
      nombre: 'mínimos de cada campo',
      entradas: {
        f_c: 150, f_y: 2800, q_a: 0.5, B: 60, L: 60, h: 25, rec: 40,
        c_1: 20, c_2: 20, d_b_B: 10, n_b_B: 3, d_b_L: 10, n_b_L: 3,
        P_D: 0, P_L: 0, M_D: 0, M_L: 0, via: 1,
      },
    },
    {
      nombre: 'máximos de cada campo',
      entradas: {
        f_c: 700, f_y: 5000, q_a: 10, B: 600, L: 600, h: 200, rec: 100,
        c_1: 200, c_2: 200, d_b_B: 32, n_b_B: 40, d_b_L: 32, n_b_L: 40,
        P_D: 2000, P_L: 2000, M_D: 500, M_L: 500, via: 2,
      },
    },
    {
      nombre: 'zapata chica y sobrecargada: los usos pasan de 1',
      entradas: {
        f_c: 200, f_y: 4200, q_a: 1.5, B: 160, L: 140, h: 35, rec: 75,
        c_1: 40, c_2: 40, d_b_B: 12, n_b_B: 6, d_b_L: 12, n_b_L: 6,
        P_D: 60, P_L: 40, M_D: 3, M_L: 2, via: 2,
      },
    },
    {
      // β = 2,5 ejercita γ_s de 13.3.3.3, que en una zapata cuadrada vale 1 y
      // no se ve, y separa de verdad las dos direcciones.
      nombre: 'rectangular alargada β = 2,5: la banda central de 13.3.3.3',
      entradas: { ...POR_DEFECTO, B: 400, L: 160, h: 95, n_b_B: 11, n_b_L: 35 },
    },
    {
      // β_c = 4 lleva el punzonamiento al término (b) de la Tabla 22.6.5.2, la
      // rama que una columna cuadrada nunca toca.
      nombre: 'columna alargada β_c = 4: gobierna el término (b)',
      entradas: { ...POR_DEFECTO, c_1: 160, c_2: 40 },
    },
    { nombre: 'momento dentro del núcleo: el trapecio se inclina', entradas: { ...POR_DEFECTO, M_D: 20, M_L: 10 } },
    { nombre: 'momento fuera del núcleo: la base se despega', entradas: { ...POR_DEFECTO, M_D: 60, M_L: 30 } },
    { nombre: 'con la relajación de 13.2.6.2: sube V_c y salta el aviso', entradas: { ...POR_DEFECTO, via: 1 } },
    {
      nombre: 'zapata enorme bajo columna chica: V_u2 no puede salir negativo',
      entradas: { ...POR_DEFECTO, B: 500, L: 500, h: 120, P_D: 10, P_L: 5, M_D: 0, M_L: 0 },
    },
  ],
};
