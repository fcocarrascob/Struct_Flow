// ─────────────────────────────────────────────────────────────────────────────
// Módulo de diseño: losa de fundación (ACI 318-25).
//
// Una losa de fundación se diseña como lo que es: una losa en dos direcciones
// apoyada en el suelo —13.3.4.1 la remite al Cap. 8— y en la práctica se
// verifica como una VIGA DE 1 m DE ANCHO con los requisitos de armadura de
// losa. Encima hay que revisar el punzonamiento de cada columna que cae dentro.
//
// TODA la memoria es ACI 318-25, edición SI, y de esa sola edición. Las
// cláusulas son las de LOSA —Cap. 7 y Cap. 8—, no las de viga del Cap. 9:
// 8.5.1.1 para las condiciones de resistencia, 8.5.3.1.1 y 8.5.3.1.2 para el
// corte en sus dos formas, 7.3.3.1 para la ductilidad.
//
// Las expresiones se copian de dos planillas del corpus, no se inventan acá:
//   · `public/planillas/losa-punzonamiento-momento.json` — el punzonamiento de
//     la Tabla 22.6.5.2 y los dos mínimos de 8.6.1;
//   · `public/planillas/zapata-aislada.json` — el corte en una dirección con el
//     piso y el techo de 22.5.5.1.1, y los coeficientes de la edición SI.
// Los dos contrastes del final exigen que sigan dando lo mismo. Con la reserva
// que está anotada en el segundo: de esa planilla se toma SOLO el Cap. 22 de
// corte en una dirección, nunca su bloque de punzonamiento.
//
// LO QUE ESTE MÓDULO NO HACE, y es deliberado: no resuelve el modelo. Una losa
// de fundación se analiza sobre resortes en elementos finitos, y ningún modelo
// de franja continua reproduce eso. M_u, V_u y q_u son DATO, salidos de ese
// análisis; el módulo verifica la sección con ellos.
// ─────────────────────────────────────────────────────────────────────────────

import { m, t, p, img, type Item } from '../worksheet-layout';
import type { CampoDef, ModuloDiseno, SalidaDef } from './tipos';

export type EntradasLosaFundacion = {
  f_c: number;
  f_y: number;
  h: number;
  rec_inf: number;
  rec_sup: number;
  d_b_inf: number;
  s_inf: number;
  d_b_sup: number;
  s_sup: number;
  M_u_inf: number;
  M_u_sup: number;
  V_u: number;
  q_u: number;
  c_1: number;
  c_2: number;
  P_u: number;
  pos: number;
  via: number;
  mom_desb: number;
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
    nombre: 'h',
    etiqueta: 'Espesor total h',
    unidad: 'cm',
    grupo: 'Losa',
    min: 20,
    max: 200,
    paso: 5,
  },
  {
    nombre: 'rec_inf',
    etiqueta: 'Recubrimiento libre inferior',
    unidad: 'mm',
    grupo: 'Losa',
    min: 20,
    max: 100,
    paso: 5,
    ayuda:
      'Tabla 20.5.1.3.1: 75 mm cuando el hormigón se vacía contra el suelo y queda en contacto permanente con él.',
  },
  {
    nombre: 'rec_sup',
    etiqueta: 'Recubrimiento libre superior',
    unidad: 'mm',
    grupo: 'Losa',
    min: 20,
    max: 100,
    paso: 5,
    ayuda: 'La cara superior no se vacía contra el suelo: la Tabla 20.5.1.3.1 pide bastante menos.',
  },

  {
    nombre: 'd_b_inf',
    etiqueta: 'Diámetro de la malla inferior',
    unidad: 'mm',
    grupo: 'Malla inferior',
    opciones: DIAMETROS,
  },
  {
    nombre: 's_inf',
    etiqueta: 'Separación de la malla inferior',
    unidad: 'cm',
    grupo: 'Malla inferior',
    min: 7.5,
    max: 45,
    paso: 2.5,
  },

  {
    nombre: 'd_b_sup',
    etiqueta: 'Diámetro de la malla superior',
    unidad: 'mm',
    grupo: 'Malla superior',
    opciones: DIAMETROS,
  },
  {
    nombre: 's_sup',
    etiqueta: 'Separación de la malla superior',
    unidad: 'cm',
    grupo: 'Malla superior',
    min: 7.5,
    max: 45,
    paso: 2.5,
  },

  {
    nombre: 'M_u_inf',
    etiqueta: 'Momento que tracciona la cara inferior',
    unidad: 'tonf*m',
    grupo: 'Solicitaciones · por metro de ancho',
    min: 0,
    max: 300,
    paso: 1,
    ayuda:
      'Del modelo de elementos finitos. En una losa de fundación es el momento SOBRE las columnas: el suelo empuja hacia arriba y la columna baja, o sea una losa plana invertida.',
  },
  {
    nombre: 'M_u_sup',
    etiqueta: 'Momento que tracciona la cara superior',
    unidad: 'tonf*m',
    grupo: 'Solicitaciones · por metro de ancho',
    min: 0,
    max: 300,
    paso: 1,
    ayuda:
      'El del vano entre columnas. Se nombran por la cara que traccionan y no por el signo, que depende del criterio de cada programa.',
  },
  {
    nombre: 'V_u',
    etiqueta: 'Corte en la sección crítica',
    unidad: 'tonf',
    grupo: 'Solicitaciones · por metro de ancho',
    min: 0,
    max: 300,
    paso: 1,
    ayuda: '13.2.7.2 y 8.4.3.2: a una distancia d de la cara de la columna o del muro.',
  },
  {
    nombre: 'q_u',
    etiqueta: 'Presión última de contacto q_u',
    unidad: 'tonf/m^2',
    grupo: 'Solicitaciones · por metro de ancho',
    min: 0,
    max: 100,
    paso: 0.5,
    ayuda:
      'Del mismo modelo. Solo se usa para descontar del punzonamiento la reacción del suelo que cae dentro del perímetro crítico.',
  },

  {
    nombre: 'c_1',
    etiqueta: 'Lado de la columna c_1',
    unidad: 'cm',
    grupo: 'Columna que se punzona',
    min: 20,
    max: 250,
    paso: 5,
    ayuda: 'La dimensión PERPENDICULAR al borde libre. En una columna interior da lo mismo cuál sea.',
  },
  {
    nombre: 'c_2',
    etiqueta: 'Lado de la columna c_2',
    unidad: 'cm',
    grupo: 'Columna que se punzona',
    min: 20,
    max: 250,
    paso: 5,
    ayuda: 'La dimensión PARALELA al borde libre.',
  },
  {
    nombre: 'P_u',
    etiqueta: 'Carga última de la columna P_u',
    unidad: 'tonf',
    grupo: 'Columna que se punzona',
    min: 0,
    max: 5000,
    paso: 10,
  },
  {
    nombre: 'pos',
    etiqueta: 'Posición de la columna',
    grupo: 'Columna que se punzona',
    opciones: [
      { valor: 1, etiqueta: 'Interior — losa en las 4 caras (α_s = 40)' },
      { valor: 2, etiqueta: 'De borde — losa en 3 caras (α_s = 30)' },
      { valor: 3, etiqueta: 'De esquina — losa en 2 caras (α_s = 20)' },
    ],
    ayuda:
      '22.6.5.3. Cambia α_s y la forma del perímetro crítico: en una esquina b_0 cae a poco más de un tercio del de una interior.',
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
      '13.2.6.2 permite V_c = 0,17λ√f’c·b·d y λ_s = 1 en una fundación superficial apoyada continuamente en el suelo y de comportamiento RÍGIDO. R13.2.6.2 advierte que una losa analizada con la rigidez de la interacción suelo-estructura puede no acogerse.',
  },
  {
    nombre: 'mom_desb',
    etiqueta: '¿La columna transfiere momento a la losa?',
    grupo: 'Hipótesis',
    opciones: [
      { valor: 0, etiqueta: 'No — solo carga vertical' },
      { valor: 1, etiqueta: 'Sí — hay momento desbalanceado M_sc' },
    ],
    ayuda:
      'Este módulo verifica el punzonamiento CONCÉNTRICO. Declarar que hay momento enciende el aviso: falta γ_v·M_sc·c_AB/J_c (8.4.4.2), que en una columna de marco puede duplicar v_u.',
  },
];

const SALIDAS: SalidaDef[] = [
  { nombre: 'u_p', etiqueta: 'Punzonamiento — v_u / φv_c', tipo: 'uso', ayuda: '8.5.3.1.2 · 22.6.4.1 y Tabla 22.6.5.2' },
  { nombre: 'u_V', etiqueta: 'Corte en una dirección — V_u / φV_c', tipo: 'uso', ayuda: '8.5.3.1.1 · 13.2.6.2 o Tabla 22.5.5.1' },
  { nombre: 'u_M_inf', etiqueta: 'Flexión, cara inferior', tipo: 'uso', ayuda: '22.3.1 y 8.5.1.1(a)' },
  { nombre: 'u_M_sup', etiqueta: 'Flexión, cara superior', tipo: 'uso', ayuda: '22.3.1 y 8.5.1.1(a)' },
  { nombre: 'u_As', etiqueta: 'Armadura mínima de losa', tipo: 'uso', ayuda: '8.6.1.1 — A_s,mín = 0,0018·A_g' },
  {
    nombre: 'u_min',
    etiqueta: 'Armadura mínima en b_slab',
    tipo: 'uso',
    ayuda: '8.6.1.2 — el mínimo que impide una falla de punzonamiento frágil',
  },
  { nombre: 'gobierna', etiqueta: 'Gobierna', tipo: 'texto' },
  {
    nombre: 'regimen',
    etiqueta: 'Mínimo que rige en b_slab',
    tipo: 'texto',
    ayuda: 'El gatillo de 8.6.1.2 se activa donde v_uv supera φ·0,17·λ_s·λ·√f’c',
  },

  { nombre: 'd_inf', etiqueta: 'Altura útil, malla inferior', unidad: 'cm', tipo: 'valor' },
  {
    nombre: 'd_p',
    etiqueta: 'Altura útil de punzonamiento',
    unidad: 'cm',
    tipo: 'valor',
    ayuda: '22.6.2.1: el promedio de las dos direcciones',
  },
  { nombre: 'A_s_inf', etiqueta: 'Acero inferior provisto', unidad: 'cm^2', tipo: 'valor' },
  { nombre: 'A_s_sup', etiqueta: 'Acero superior provisto', unidad: 'cm^2', tipo: 'valor' },
  { nombre: 'A_s_min', etiqueta: 'Acero mínimo de losa', unidad: 'cm^2', tipo: 'valor', ayuda: '8.6.1.1' },
  { nombre: 'Rd_M_inf', etiqueta: 'Momento resistente inferior φM_n', unidad: 'tonf*m', tipo: 'valor' },
  { nombre: 'Rd_M_sup', etiqueta: 'Momento resistente superior φM_n', unidad: 'tonf*m', tipo: 'valor' },
  { nombre: 'Rd_V', etiqueta: 'Corte resistente φV_c', unidad: 'tonf', tipo: 'valor' },
  { nombre: 'b_o', etiqueta: 'Perímetro crítico b_0', unidad: 'cm', tipo: 'valor', ayuda: '22.6.4.1: a d/2 de la cara' },
  { nombre: 'v_uv', etiqueta: 'Tensión de punzonamiento v_u', unidad: 'kgf/cm^2', tipo: 'valor' },
  { nombre: 'Rd_v', etiqueta: 'Tensión resistente φv_c', unidad: 'kgf/cm^2', tipo: 'valor' },
  {
    nombre: 'A_min_gob',
    etiqueta: 'Acero mínimo en b_slab',
    unidad: 'cm^2',
    tipo: 'valor',
    ayuda: 'El mayor de 8.6.1.1 y 8.6.1.2, cuando el gatillo de 8.6.1.2 se activa',
  },
  {
    nombre: 's_max',
    etiqueta: 'Separación máxima admisible',
    unidad: 'cm',
    tipo: 'valor',
    ayuda: '8.7.2.2: la menor de 2h y 450 mm',
  },
  {
    nombre: 'caida',
    etiqueta: 'Caída de V_c sin 13.2.6.2',
    tipo: 'valor',
    ayuda: 'Lo que cuesta pasar de la expresión clásica a la Tabla 22.5.5.1(c) con λ_s y ρ_w',
  },

  { nombre: 'v_d_min', etiqueta: 'Altura útil ≥ 150 mm', tipo: 'veredicto', ayuda: '13.3.1.2' },
  { nombre: 'v_duct', etiqueta: 'Controlada por tracción', tipo: 'veredicto', ayuda: '7.3.3.1 y Tabla 21.2.2' },
  { nombre: 'v_As', etiqueta: 'Cumple la armadura mínima', tipo: 'veredicto', ayuda: '8.6.1.1' },
  { nombre: 'v_A_min', etiqueta: 'Cumple el mínimo de b_slab', tipo: 'veredicto', ayuda: '8.6.1.2' },
  { nombre: 'v_s_inf', etiqueta: 'Separación inferior admisible', tipo: 'veredicto', ayuda: '8.7.2.2' },
  { nombre: 'v_s_sup', etiqueta: 'Separación superior admisible', tipo: 'veredicto', ayuda: '8.7.2.2' },
  { nombre: 'v_rfc', etiqueta: '√f’c ≤ 8,3 MPa en punzonamiento', tipo: 'veredicto', ayuda: '22.6.3.1' },

  {
    nombre: 'v_mom',
    etiqueta: 'Punzonamiento concéntrico (sin M_sc)',
    tipo: 'veredicto',
    aviso: true,
    avisoTexto: 'El punzonamiento no incluye el momento desbalanceado',
    ayuda:
      'Se declaró que la columna transfiere momento. Falta γ_v·M_sc·c_AB/J_c (8.4.4.2), que este módulo no calcula: v_u está subestimado.',
  },
  {
    nombre: 'v_rigida',
    etiqueta: 'Sin la relajación de 13.2.6.2',
    tipo: 'veredicto',
    aviso: true,
    avisoTexto: 'Se invocó la relajación de 13.2.6.2 para fundación rígida',
    ayuda:
      'R13.2.6.2: una losa de fundación diseñada considerando la rigidez de la interacción suelo-estructura puede no acogerse a esa relajación. Con λ_s y ρ_w la capacidad baja lo que dice «caída».',
  },
];

function construirHoja(e: EntradasLosaFundacion): Item[] {
  return [
    t('LOSA DE FUNDACIÓN — FRANJA DE 1 m Y PUNZONAMIENTO DE UNA COLUMNA'),
    t('ACI 318-25 (edición SI) · Cap. 13 fundaciones · Cap. 8 losas en dos direcciones · 22.5 y 22.6'),
    t('Memoria generada desde el módulo de diseño. Rd_ = capacidad de diseño (incluye φ).'),

    t('━━ ALCANCE DE ESTA MEMORIA ━━'),
    t('13.3.4.1 remite la losa de fundación al Cap. 8 —losas en dos direcciones—, y 13.3.4.2'),
    t('PROHÍBE el método de diseño directo. Los esfuerzos son dato: salen del modelo sobre'),
    t('resortes, no de este módulo.'),
    t('8.5.1.1 enumera las cuatro condiciones de resistencia de una losa. Esta memoria cubre'),
    t('tres: (a) φM_n ≥ M_u en las dos caras, (c) φV_n ≥ V_u en una dirección y (d) φv_n ≥ v_u'),
    t('en la sección crítica de punzonamiento, más los mínimos de armadura y el espaciamiento.'),
    t('NO cubre la (b), φM_n ≥ γ_f·M_sc dentro de b_slab: este módulo verifica el punzonamiento'),
    t('CONCÉNTRICO y no reparte el momento desbalanceado (8.4.2.2 y 8.4.4.2).'),
    t('Tampoco cubre el análisis suelo-estructura, la presión admisible del suelo (13.3.1.1, que'),
    t('es geotécnica y se resuelve antes), la armadura de punzonamiento (22.6.7 y 22.6.8) ni la'),
    t('capa sísmica de 18.13. Una losa de fundación normalmente NO lleva refuerzo de corte: si'),
    t('el punzonamiento no cumple, lo que se sube es el espesor o el tamaño de la columna.'),

    t('━━ DATOS · MATERIALES ━━'),
    m(`f_c := ${n(e.f_c)} kgf/cm^2`),
    m(`f_y := ${n(e.f_y)} kgf/cm^2`),
    t('20.2.2.2: se permite tomar E_s = 200 000 MPa para barras no pretensadas.'),
    m('E_s := 200000 MPa'),
    m('eps_ty := f_y/E_s ='),
    t('19.2.4.2: hormigón de densidad normal → λ = 1. 22.2.2.1: ε_cu = 0,003.'),
    m('lam := 1'),
    m('eps_cu := 0.003'),
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
    t('Tabla 22.6.5.2(a): el 0,33 del punzonamiento.'),
    m('k_2a := 0.33*fconv ='),

    t('━━ DATOS · GEOMETRÍA Y ARMADURA DE LA FRANJA ━━'),
    t('La franja es de un metro de ancho: todo lo que sigue es «por metro».'),
    m('b := 1 m'),
    m(`h := ${n(e.h)} cm`),
    m(`rec_inf := ${n(e.rec_inf)} mm`),
    m(`rec_sup := ${n(e.rec_sup)} mm`),
    m(`d_b_inf := ${n(e.d_b_inf)} mm`),
    m(`s_inf := ${n(e.s_inf)} cm`),
    m(`d_b_sup := ${n(e.d_b_sup)} mm`),
    m(`s_sup := ${n(e.s_sup)} cm`),
    m('A_b_inf := pi/4*d_b_inf^2 = cm^2'),
    m('A_b_sup := pi/4*d_b_sup^2 = cm^2'),
    m('A_s_inf := b*A_b_inf/s_inf = cm^2'),
    m('A_s_sup := b*A_b_sup/s_sup = cm^2'),
    t('Las alturas útiles se DERIVAN de la disposición de las mallas, no se declaran. Cada malla'),
    t('son dos capas ortogonales: se toma la INTERIOR, que es la desfavorable, porque la franja'),
    t('se verifica sin saber cuál de las dos direcciones se está mirando.'),
    m('d_inf := h - rec_inf - d_b_inf - d_b_inf/2 = cm'),
    m('d_sup := h - rec_sup - d_b_sup - d_b_sup/2 = cm'),
    t('22.6.2.1: para el punzonamiento, d es el PROMEDIO de las alturas útiles de las dos'),
    t('direcciones. Sobre la columna la tracción está abajo —la losa de fundación es una losa'),
    t('plana invertida—, así que las dos capas son de la malla inferior y el promedio se reduce'),
    t('a h − recubrimiento − d_b.'),
    m('d_p := h - rec_inf - d_b_inf = cm'),
    t('13.3.1.2: la altura útil del refuerzo inferior no baja de 150 mm.'),
    m('v_d_min := d_inf >= 150 mm ='),

    t('━━ DATOS · SOLICITACIONES DEL MODELO ━━'),
    m(`M_u_inf := ${n(e.M_u_inf)} tonf*m`),
    m(`M_u_sup := ${n(e.M_u_sup)} tonf*m`),
    m(`V_u := ${n(e.V_u)} tonf`),
    m(`q_u := ${n(e.q_u)} tonf/m^2`),
    m(`c_1 := ${n(e.c_1)} cm`),
    m(`c_2 := ${n(e.c_2)} cm`),
    m(`P_u := ${n(e.P_u)} tonf`),
    m(`pos := ${n(e.pos)}`),
    m(`via := ${n(e.via)}`),
    m(`mom_desb := ${n(e.mom_desb)}`),

    t('━━ 1 · CORTE EN UNA DIRECCIÓN (8.5.3.1.1 · 13.2.6.2 · Tabla 22.5.5.1 · 22.5.5.1.1) ━━'),
    t('13.2.6.2(a): en una fundación superficial apoyada continuamente en el suelo y de'),
    t('comportamiento rígido se permite la expresión clásica, sin efecto de tamaño ni cuantía.'),
    m('v_clas := k_clas*lam*rfck = kgf/cm^2'),
    t('El caso general es la fila (c) de la Tabla 22.5.5.1: una losa sin estribos tiene A_v < A_v,mín.'),
    m('rho_w := A_s_inf/(b*d_inf) ='),
    m('crho := rho_w^(1/3) ='),
    t('Ec. (22.5.5.1.3): el factor de efecto de tamaño, con d en mm.'),
    m('lam_s := min(1, sqrt(2/(1 + d_inf/(250 mm)))) ='),
    m('v_bruto := k_1d*lam_s*lam*crho*rfck = kgf/cm^2'),
    t('22.5.5.1.1: no se toma mayor que 0,42λ√f’c ni hace falta tomarlo menor que 0,083λ√f’c.'),
    m('v_piso := k_piso*lam*rfck = kgf/cm^2'),
    m('v_tope := k_tope*lam*rfck = kgf/cm^2'),
    m('v_c1 := min(max(v_bruto, v_piso), v_tope) = kgf/cm^2'),
    t('Lo que cuesta NO acogerse a 13.2.6.2, que es la decisión más cara de esta hoja:'),
    m('caida := 1 - v_c1/v_clas ='),
    p('v_cV :=\n    if via == 1\n        return v_clas\n    return v_c1'),
    m('v_cV = kgf/cm^2'),
    m('V_c := v_cV*b*d_inf = tonf'),
    m('Rd_V := phi_v*V_c = tonf'),
    m('u_V := V_u/Rd_V ='),
    m('v_V := Rd_V >= V_u ='),

    t('━━ 2 · FLEXIÓN DE LA FRANJA (22.2.2.4 · 22.3.1 · 8.5.1.1a) ━━'),
    t('Bloque rectangular equivalente sobre un ancho de un metro, cara por cara.'),
    m('a_inf := A_s_inf*f_y/(0.85*f_c*b) = cm'),
    m('c_inf := a_inf/beta_1 = cm'),
    m('eps_t_inf := eps_cu*(d_inf - c_inf)/c_inf ='),
    m('Rd_M_inf := phi_f*A_s_inf*f_y*(d_inf - a_inf/2) = tonf*m'),
    m('u_M_inf := M_u_inf/Rd_M_inf ='),
    m('v_M_inf := Rd_M_inf >= M_u_inf ='),
    m('a_sup := A_s_sup*f_y/(0.85*f_c*b) = cm'),
    m('c_sup := a_sup/beta_1 = cm'),
    m('eps_t_sup := eps_cu*(d_sup - c_sup)/c_sup ='),
    m('Rd_M_sup := phi_f*A_s_sup*f_y*(d_sup - a_sup/2) = tonf*m'),
    m('u_M_sup := M_u_sup/Rd_M_sup ='),
    m('v_M_sup := Rd_M_sup >= M_u_sup ='),
    t('7.3.3.1: una losa no pretensada tiene que ser controlada por tracción según la Tabla'),
    t('21.2.2, que es lo que da φ = 0,90. Se exige en las dos caras.'),
    m('eps_lim := eps_ty + 0.003 ='),
    m('v_duct := min(eps_t_inf, eps_t_sup) >= eps_lim ='),

    t('━━ 3 · ARMADURA MÍNIMA Y ESPACIAMIENTO DE LOSA (8.6.1.1 · 8.7.2.2) ━━'),
    t('13.3.4.4 manda el mínimo de 8.6.1.1: A_s,mín = 0,0018·A_g, la misma cuantía de retracción y'),
    t('temperatura de 24.4.3.2, y con el espesor TOTAL, no con la altura útil.'),
    m('A_s_min := 0.0018*b*h = cm^2'),
    m('u_As := A_s_min/min(A_s_inf, A_s_sup) ='),
    m('v_As := min(A_s_inf, A_s_sup) >= A_s_min ='),
    t('8.7.2.2: en las secciones críticas, s no pasa de la menor de 2h y 450 mm.'),
    m('s_max := min(2*h, 450 mm) = cm'),
    m('v_s_inf := s_inf <= s_max ='),
    m('v_s_sup := s_sup <= s_max ='),

    t('━━ 4 · PUNZONAMIENTO (8.5.3.1.2 · 22.6.4.1 · Tabla 22.6.5.2) ━━'),
    t('22.6.3.1: el √f’c que entra en v_c no debe exceder 8,3 MPa.'),
    m('v_rfc := sqrt(f_c/MPa) <= 8.3 ='),
    t('22.6.4.1: perímetro crítico a d/2 de la cara, con el b_0 mínimo. 22.6.5.3: α_s = 40 / 30 / 20'),
    t('para columna interior, de borde y de esquina — la losa en 4, 3 o 2 caras.'),
    p('alfa_s :=\n    if pos == 1\n        return 40\n    else if pos == 2\n        return 30\n    return 20'),
    m('alfa_s ='),
    p(
      'b_o :=\n' +
        '    if pos == 1\n' +
        '        return 2*(c_1 + d_p) + 2*(c_2 + d_p)\n' +
        '    else if pos == 2\n' +
        '        return 2*(c_1 + d_p/2) + (c_2 + d_p)\n' +
        '    return (c_1 + d_p/2) + (c_2 + d_p/2)',
    ),
    m('b_o = cm'),
    t('El área que ese perímetro encierra, para descontar la reacción del suelo de adentro:'),
    p(
      'A_crit :=\n' +
        '    if pos == 1\n' +
        '        return (c_1 + d_p)*(c_2 + d_p)\n' +
        '    else if pos == 2\n' +
        '        return (c_1 + d_p/2)*(c_2 + d_p)\n' +
        '    return (c_1 + d_p/2)*(c_2 + d_p/2)',
    ),
    m('A_crit = m^2'),
    t('13.2.6.2(b): en una fundación superficial rígida, λ_s se toma igual a 1,0.'),
    p(
      'lam_s_p :=\n' +
        '    if via == 1\n' +
        '        return 1\n' +
        '    return min(1, sqrt(2/(1 + d_p/(250 mm))))',
    ),
    m('lam_s_p ='),
    t('Tabla 22.6.5.2: v_c es el MENOR de (a), (b) y (c). β_c es el cociente de lados de la columna.'),
    m('beta_c := max(c_1, c_2)/min(c_1, c_2) ='),
    m('r_ab := alfa_s*d_p/b_o ='),
    m('v_ca := k_2a*lam_s_p*lam*rfck = kgf/cm^2'),
    m('v_cb := (0.17 + 0.33/beta_c)*fconv*lam_s_p*lam*rfck = kgf/cm^2'),
    m('v_cc := (0.17 + 0.083*r_ab)*fconv*lam_s_p*lam*rfck = kgf/cm^2'),
    m('v_c := min(v_ca, v_cb, v_cc) = kgf/cm^2'),
    m('Rd_v := phi_v*v_c = kgf/cm^2'),
    t('La carga que punzona es la de la columna menos lo que el suelo devuelve dentro del'),
    t('perímetro. Se acota en cero: con una columna muy poco cargada la resta sale negativa, y un'),
    t('factor de utilización bajo cero no significa nada.'),
    m('V_up := max(P_u - q_u*A_crit, 0 tonf) = tonf'),
    m('v_uv := V_up/(b_o*d_p) = kgf/cm^2'),
    m('u_p := v_uv/Rd_v ='),
    m('v_p := Rd_v >= v_uv ='),

    t('━━ 5 · ARMADURA MÍNIMA EN b_slab (8.6.1.2) ━━'),
    t('8.6.1.2 es el mínimo que impide una falla de punzonamiento FRÁGIL: si la losa fluye a'),
    t('flexión junto a la columna, la fisura inclinada se abre y el punzonamiento se adelanta.'),
    t('8.4.2.2.3: la banda es b_slab = c_1 + 3h, centrada en la columna.'),
    m('b_sl := c_1 + 3*h = cm'),
    t('El gatillo lleva φ dentro: se activa donde v_uv supera φ·0,17·λ_s·λ·√f’c. Que no se'),
    t('active NO es un incumplimiento —es que la cláusula no aplica—, así que se enuncia en'),
    t('palabras y no como un ✓/✗, que impreso se leería como una verificación reprobada.'),
    m('gat := phi_v*0.17*fconv*lam_s_p*lam*rfck = kgf/cm^2'),
    p(
      'regimen :=\n' +
        '    if v_uv > gat\n' +
        '        return "8.6.1.2 se activa: rige el mayor de A_min1 y A_min2"\n' +
        '    return "8.6.1.2 no se activa: rige A_min1, el mínimo general de 8.6.1.1"',
    ),
    m('regimen ='),
    m('A_min1 := 0.0018*b_sl*h = cm^2'),
    m('A_min2 := 5*v_uv*b_sl*b_o/(phi_v*alfa_s*f_y) = cm^2'),
    p(
      'A_min_gob :=\n' +
        '    if v_uv > gat\n' +
        '        return max(A_min1, A_min2)\n' +
        '    return A_min1',
    ),
    m('A_min_gob = cm^2'),
    t('Contra lo que la malla inferior ya pone dentro de esa banda:'),
    m('A_s_sl := A_s_inf/b*b_sl = cm^2'),
    m('u_min := A_min_gob/A_s_sl ='),
    m('v_A_min := A_s_sl >= A_min_gob ='),

    t('━━ 6 · LOS DOS AVISOS ━━'),
    t('Un aviso no dice que la losa falle: dice que el número de al lado puede no significar lo'),
    t('que parece. Por eso no votan en el CUMPLE / NO CUMPLE.'),
    m('v_mom := mom_desb == 0 ='),
    m('v_rigida := via == 2 ='),

    t('━━ RESUMEN: QUÉ GOBIERNA ━━'),
    m('u_max := max(u_p, u_V, u_M_inf, u_M_sup, u_As, u_min) ='),
    p(
      'gobierna :=\n' +
        '    if u_max == u_p\n' +
        '        return "punzonamiento (Tabla 22.6.5.2)"\n' +
        '    else if u_max == u_V\n' +
        '        return "corte en una dirección (22.5.5.1 y 13.2.6.2)"\n' +
        '    else if u_max == u_M_inf\n' +
        '        return "flexión, cara inferior (22.3.1)"\n' +
        '    else if u_max == u_M_sup\n' +
        '        return "flexión, cara superior (22.3.1)"\n' +
        '    else if u_max == u_min\n' +
        '        return "armadura mínima en b_slab, Ec. (8.6.1.2)"\n' +
        '    return "armadura mínima de losa (8.6.1.1)"',
    ),
    m('v_cumple := u_max <= 1 and v_d_min and v_duct and v_s_inf and v_s_sup and v_rfc ='),

    // ── El mapeo a píxeles del esquema ──────────────────────────────────────
    // Todo adimensional a propósito: `formatSvg` lanza si un atributo recibe una
    // magnitud con unidades, y ese fallo hace caer `verify:planilla`.
    t('━━ ESQUEMA · MAPEO A PÍXELES ━━'),
    t('Planta del perímetro crítico. La escala se toma del perímetro y no de la banda b_slab:'),
    t('en una losa gruesa b_slab es mucho más ancha, y meterla en la caja aplasta el dibujo que'),
    t('de verdad importa. b_slab se informa como número, en el panel de la derecha.'),
    m('anc_pl := c_2 + 2*d_p = cm'),
    m('alt_pl := c_1 + 2*d_p = cm'),
    m('esc_p := min(3.2, 330/(anc_pl/(1 cm)), 205/(alt_pl/(1 cm)))'),
    m('cx_p := 205'),
    m('cy_p := 183'),
    m('c1_px := c_1/(1 cm)*esc_p'),
    m('c2_px := c_2/(1 cm)*esc_p'),
    m('dp_px := d_p/(1 cm)*esc_p'),
    t('c_1 es perpendicular al borde libre, así que en el dibujo va en vertical.'),
    m('x_col_i := cx_p - c2_px/2'),
    m('x_col_d := cx_p + c2_px/2'),
    m('y_col_s := cy_p - c1_px/2'),
    m('y_col_b := cy_p + c1_px/2'),
    m('xl := x_col_i - dp_px/2'),
    m('xr := x_col_d + dp_px/2'),
    m('yt := y_col_s - dp_px/2'),
    m('yb := y_col_b + dp_px/2'),
    t('El perímetro es una polilínea de largo variable: cerrada si la columna es interior, una U'),
    t('si es de borde y una L si es de esquina. El SVG la consume por un solo token.'),
    p(
      'pts_per :=\n' +
        '    if pos == 1\n' +
        '        return [[xl, yt], [xr, yt], [xr, yb], [xl, yb], [xl, yt]]\n' +
        '    else if pos == 2\n' +
        '        return [[xl, y_col_b], [xl, yt], [xr, yt], [xr, y_col_b]]\n' +
        '    return [[xl, y_col_b], [xl, yt], [x_col_d, yt]]',
    ),
    t('Y los bordes libres, que en una columna interior no existen: ahí se manda un segmento'),
    t('nulo fuera del lienzo, que no dibuja nada.'),
    p(
      'pts_libre :=\n' +
        '    if pos == 1\n' +
        '        return [[-20, -20], [-20, -20]]\n' +
        '    else if pos == 2\n' +
        '        return [[cx_p - 170, y_col_b], [cx_p + 170, y_col_b]]\n' +
        '    return [[cx_p - 170, y_col_b], [x_col_d, y_col_b], [x_col_d, cy_p - 105]]',
    ),
    t('Sección de la franja de 1 m. Ocho barras dibujadas por cara y la hoja anula el radio de'),
    t('las que sobran, que es el truco de siempre: SVG no tiene bucles.'),
    m('x_s0 := 48'),
    m('y_s0 := 320'),
    m('esc_s := min(2.9, 3, 128/(h/(1 cm)))'),
    m('anc_s := 100*esc_s'),
    m('h_s := h/(1 cm)*esc_s'),
    m('ri_px := rec_inf/(1 cm)*esc_s'),
    m('rs_px := rec_sup/(1 cm)*esc_s'),
    m('dbi_px := d_b_inf/(1 cm)*esc_s'),
    m('dbs_px := d_b_sup/(1 cm)*esc_s'),
    m('y_bi := y_s0 + h_s - ri_px - dbi_px/2'),
    m('y_bs := y_s0 + rs_px + dbs_px/2'),
    m('n_inf := floor(100 cm/s_inf) + 1 ='),
    m('n_sup := floor(100 cm/s_sup) + 1 ='),
    p('x_bi(i) := x_s0 + (i - 1)*(s_inf/(1 cm))*esc_s'),
    p('x_bs(i) := x_s0 + (i - 1)*(s_sup/(1 cm))*esc_s'),
    p('r_bi(i) := i <= n_inf ? dbi_px/2 : 0'),
    p('r_bs(i) := i <= n_sup ? dbs_px/2 : 0'),

    // La figura va la última: captura el scope en su posición de orden de
    // lectura, así que solo puede rotular lo que ya se calculó antes.
    img('/esquemas/diseno-losa-fundacion.svg', 660, 430),
  ];
}

const POR_DEFECTO: EntradasLosaFundacion = {
  f_c: 300,
  f_y: 4200,
  h: 60,
  rec_inf: 75,
  rec_sup: 50,
  d_b_inf: 22,
  s_inf: 15,
  d_b_sup: 18,
  s_sup: 20,
  M_u_inf: 32,
  M_u_sup: 18,
  V_u: 17,
  q_u: 12,
  c_1: 60,
  c_2: 60,
  P_u: 250,
  pos: 1,
  via: 2,
  mom_desb: 0,
};

/**
 * La losa plana de `losa-punzonamiento-momento.json`: h = 22 cm, columna
 * interior de 50×50, recubrimiento 20 mm y φ12.
 *
 * `P_u` es el `V_marco` de esa planilla —que ella misma resuelve con un
 * `lusolve` sobre el marco— escrito acá como literal de precisión completa, con
 * el mismo razonamiento con que `seccion-acero-i` fija su `C_b`: si esa planilla
 * cambia, el contraste falla, que es exactamente lo que se le pide.
 */
const CASO_PUNZONAMIENTO: EntradasLosaFundacion = {
  ...POR_DEFECTO,
  f_c: 250,
  h: 22,
  rec_inf: 20,
  rec_sup: 20,
  d_b_inf: 12,
  s_inf: 15,
  d_b_sup: 12,
  s_sup: 15,
  M_u_inf: 6,
  M_u_sup: 4,
  V_u: 5,
  q_u: 1.24,
  c_1: 50,
  c_2: 50,
  P_u: 51.64146395891225,
  pos: 1,
  via: 2,
};

/**
 * La franja de un metro de la zapata de `zapata-aislada.json`: h = 55 cm,
 * recubrimiento 75 mm y 9φ18 repartidos en 220 cm, o sea φ18 @ 220/9 cm.
 *
 * Con esa separación la franja tiene la misma armadura por metro que la zapata,
 * que es lo que hace comparables las TENSIONES. Sus fuerzas no: las de allá van
 * sobre B = 220 cm. `M_u_inf` y `V_u` son los de esa planilla divididos por B,
 * para que el caso sea de verdad su franja y no un juego de números sueltos.
 */
const CASO_ZAPATA: EntradasLosaFundacion = {
  ...POR_DEFECTO,
  f_c: 250,
  h: 55,
  rec_inf: 75,
  rec_sup: 75,
  d_b_inf: 18,
  s_inf: 220 / 9,
  d_b_sup: 18,
  s_sup: 25,
  M_u_inf: 22.090909090909097 / 2.2,
  M_u_sup: 0,
  V_u: 24.163636363636368 / 2.2,
  q_u: 24.793388429752063,
  c_1: 40,
  c_2: 40,
  P_u: 120,
  pos: 1,
  via: 2,
};

export const losaFundacion: ModuloDiseno<EntradasLosaFundacion> = {
  id: 'losa-fundacion',
  titulo: 'Losa de fundación',
  resumen: 'Franja de 1 m a flexión y corte, mínimos de losa y punzonamiento de una columna.',
  disciplina: 'hormigon',
  norma: 'ACI 318-25 (edición SI)',
  esquema: '/esquemas/diseno-losa-fundacion.svg',
  anchoEsquema: 660,
  altoEsquema: 430,
  entradas: ENTRADAS,
  salidas: SALIDAS,
  porDefecto: POR_DEFECTO,
  construirHoja,
  // Dos contrastes porque este módulo cruza dos cuerpos de norma y ninguna
  // planilla publicada los cubre los dos. Sin la lista, uno de los dos bloques
  // se escribiría directo de la norma y sin red, como pasó con G2.1 en
  // `seccion-acero-i`.
  contraste: [
    {
      planilla: 'losa-punzonamiento-momento',
      entradas: CASO_PUNZONAMIENTO,
      // Todo idéntico: las dos hojas escriben la Tabla 22.6.5.2 en la forma de
      // la edición 318-19/25 —(0,17 + 0,33/β) y (0,17 + 0,083·α_s·d/b_0)— y
      // calculan d como el promedio de las dos capas inferiores.
      valores: [
        { mio: 'fconv', suyo: 'conv' },
        { mio: 'd_p', suyo: 'd' },
        { mio: 'lam_s_p', suyo: 'lam_s' },
        'phi_v', 'beta_c', 'alfa_s', 'b_o', 'r_ab',
        'v_ca', 'v_cb', 'v_cc', 'v_c', 'Rd_v', 'v_uv',
        'b_sl', 'gat', 'A_min1', 'A_min2', 's_max',
      ],
    },
    {
      planilla: 'zapata-aislada',
      entradas: CASO_ZAPATA,
      // De esta planilla se toma SOLO el corte en una dirección. Su bloque de
      // punzonamiento (r122 y r123) escribe la Tabla 22.6.5.2 con el álgebra de
      // ACI 318-14 —0,17·(1 + 2/β) en vez de 0,17 + 0,33/β, y 0,083·(2 + α_s·d/b_0)
      // en vez de 0,17 + 0,083·α_s·d/b_0—, y este módulo es de una sola edición.
      // El punzonamiento se contrasta contra `losa-punzonamiento-momento`, que sí
      // usa la forma de 318-25. Añadir acá `v_2a`, `v_2b` o `v_2c` metería la
      // edición vieja por la puerta de atrás: no se hace.
      valores: [
        // EXACTO: los coeficientes de la edición SI y los dos límites de
        // 22.5.5.1.1, que solo dependen del material. Todos son de la Tabla
        // 22.5.5.1 de 318-19/25, ninguno arrastra la edición anterior. Y `v_c1`,
        // que acá es el piso: es el contraste que de verdad importa.
        'fconv', 'rfck', 'k_clas', 'k_1d', 'k_piso', 'k_tope', 'k_2a',
        'v_piso', 'v_tope', 'v_c1',

        // CON TOLERANCIA: las dos hojas miden `d` a capas distintas. La zapata
        // toma h − rec − d_b, que es el promedio de las dos capas; este módulo
        // toma la capa INTERIOR, h − rec − d_b − d_b/2, porque una franja de un
        // metro se verifica sin saber qué dirección se está mirando. Son 0,9 cm
        // de diferencia sobre 45, y lo que arrastran es esto:
        { mio: 'lam_s', tolerancia: 0.01 },
        { mio: 'rho_w', tolerancia: 0.025 },
        { mio: 'crho', tolerancia: 0.01 },
        { mio: 'v_bruto', tolerancia: 0.02 },
      ],
    },
  ],
  // Los extremos de cada campo y una rama por cada bifurcación: es donde
  // aparecen las divisiones por cero, los usos negativos y los esquemas que se
  // salen de su caja.
  casos: [
    { nombre: 'por defecto', entradas: POR_DEFECTO },
    { nombre: 'la losa plana del contraste de punzonamiento', entradas: CASO_PUNZONAMIENTO },
    { nombre: 'la franja de la zapata del contraste de corte', entradas: CASO_ZAPATA },
    {
      nombre: 'mínimos de cada campo',
      entradas: {
        f_c: 150, f_y: 2800, h: 20, rec_inf: 20, rec_sup: 20,
        d_b_inf: 10, s_inf: 7.5, d_b_sup: 10, s_sup: 7.5,
        M_u_inf: 0, M_u_sup: 0, V_u: 0, q_u: 0,
        c_1: 20, c_2: 20, P_u: 0, pos: 1, via: 1, mom_desb: 0,
      },
    },
    {
      nombre: 'máximos de cada campo',
      entradas: {
        f_c: 700, f_y: 5000, h: 200, rec_inf: 100, rec_sup: 100,
        d_b_inf: 32, s_inf: 45, d_b_sup: 32, s_sup: 45,
        M_u_inf: 300, M_u_sup: 300, V_u: 300, q_u: 100,
        c_1: 250, c_2: 250, P_u: 5000, pos: 3, via: 2, mom_desb: 1,
      },
    },
    {
      nombre: 'losa delgada y sobrecargada: los usos pasan de 1',
      entradas: {
        f_c: 200, f_y: 4200, h: 35, rec_inf: 75, rec_sup: 50,
        d_b_inf: 12, s_inf: 25, d_b_sup: 12, s_sup: 25,
        M_u_inf: 25, M_u_sup: 20, V_u: 25, q_u: 20,
        c_1: 40, c_2: 40, P_u: 200, pos: 1, via: 2, mom_desb: 0,
      },
    },
    {
      // Con β_c = 5 el punzonamiento pasa a gobernarlo el término (b) de la
      // Tabla 22.6.5.2, que es la rama que ninguno de los otros casos toca: con
      // una columna cuadrada (b) y (c) quedan por encima de (a) y no se ven.
      nombre: 'columna alargada β_c = 5: gobierna el término (b)',
      entradas: { ...POR_DEFECTO, c_1: 40, c_2: 200, h: 40, P_u: 400 },
    },
    { nombre: 'columna de borde: el perímetro pierde un lado', entradas: { ...POR_DEFECTO, pos: 2 } },
    { nombre: 'columna de esquina: el perímetro pierde dos', entradas: { ...POR_DEFECTO, pos: 3 } },
    { nombre: 'con la relajación de 13.2.6.2: sube V_c y salta el aviso', entradas: { ...POR_DEFECTO, via: 1 } },
    { nombre: 'con momento desbalanceado declarado: salta el otro aviso', entradas: { ...POR_DEFECTO, mom_desb: 1 } },
    {
      nombre: 'columna casi descargada: la resta del suelo se lleva todo P_u',
      entradas: { ...POR_DEFECTO, P_u: 5, q_u: 30 },
    },
  ],
};
