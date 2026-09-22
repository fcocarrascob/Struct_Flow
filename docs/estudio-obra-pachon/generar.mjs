// Arma la obra del taller de soldadura de El Pachón, la evalúa con el motor de la
// obra —el mismo que corre en el navegador— y escribe el archivo para importar en
// /proyectos. Es el estudio de docs/estudio-obra-pachon.md.
//
//   node docs/estudio-obra-pachon/generar.mjs
//
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..').replace(/\\/g, '/');
process.chdir(REPO);
const { compilarEntrada } = await import(pathToFileURL(`${REPO}/scripts/lib/motor.mjs`).href);
const motor = await compilarEntrada('src/proyecto/obra/engine.ts');
const { evaluarObra, sanearObra, archivoDeObra, idNodoDeCalculo, moduloDeBiblioteca } = motor;

// Las genéricas se arman desde el archivo, con el sha256 de sus bytes: es lo que
// hace la aplicación después de descargarlas, y lo que hace `verify:obra`.
const { readFileSync } = await import('node:fs');
const { createHash } = await import('node:crypto');
function generica(rel) {
  const crudo = readFileSync(`${REPO}/public/biblioteca/${rel}`);
  const sha256 = createHash('sha256').update(crudo).digest('hex');
  return { sha256, modulo: moduloDeBiblioteca(JSON.parse(crudo.toString('utf8')), { sha256 }) };
}
const VIGA = generica('acero/viga-carrilera-generica.json');
const SHA_VIGA = VIGA.sha256;
const genericas = { [VIGA.modulo.id]: { fase: 'lista', modulo: VIGA.modulo } };

// ── Bloques ──────────────────────────────────────────────────────────────────
// Cada hoja se escribe como lista; el orden es el de lectura y el paso de 48 px
// es el del corpus.
const m = (src) => ({ kind: 'math', src });
const t = (src) => ({ kind: 'text', src });
// Una función de usuario solo se define en una región `program`: en una `math`
// el `:=` tras la cabecera es un error de sintaxis.
const p = (src) => ({ kind: 'program', src });
// El alto que ocupa cada bloque en el papel, a ojo pero por exceso: una fórmula
// el paso del corpus (48 px), un texto o un programa según sus líneas. Con el
// paso fijo, un párrafo de cuatro líneas se montaba sobre el bloque siguiente.
const PASO = 16;
function alto(b) {
  const redondear = (h) => Math.max(48, Math.ceil(h / PASO) * PASO);
  // Un condicional se dibuja como llaves de casos (65 px medidos) y el título
  // lleva debajo la línea «Memoria de cálculo · …» (59 px medidos).
  if (b.kind === 'math') return b.src.includes('?') ? 80 : 48;
  if (b.src.startsWith('# ')) return 80;
  if (b.kind === 'program') return redondear(b.src.split('\n').length * 20 + 44);
  const lineas = b.src.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 95)), 0);
  return redondear(lineas * 21 + 24);
}
function hoja(prefijo, ...bloques) {
  let y = 40;
  return bloques.map((b, i) => {
    const r = { id: `${prefijo}${String(i + 1).padStart(2, '0')}`, x: 40, y, ...b };
    // El primer texto de una hoja es el título del papel, lleve `#` o no.
    y += i === 0 && b.kind === 'text' ? Math.max(80, alto(b)) : alto(b);
    return r;
  });
}

// ── Nodo 0: Geometría y sitio ────────────────────────────────────────────────
const geometria = {
  id: 'k-geometria',
  nombre: 'Geometría y sitio',
  hoja: hoja(
    'geo',
    t('# Taller de soldadura — El Pachón'),
    t('Nave industrial con puente grúa 20/5 t. El Pachón, Calingasta, San Juan (Argentina). Cliente: Bechtel. Ingeniería BÁSICA (D-29). Modelo vigente: v44_PORTONES_2026-09-16.sdb.'),
    t('## Geometría'),
    t('Planta y alturas de PERFIL.json (tipología). Cubierta a una sola agua.'),
    m('L_nave := 88.0 m'),
    m('B_nave := 25.4 m'),
    m('n_vanos := 11'),
    m('s_marcos := L_nave / n_vanos = m'),
    m('H_alto := 17.2 m'),
    m('H_bajo := 13.4 m'),
    t('atan devuelve un número en radianes, sin unidad: se multiplica por 1 rad para que el ángulo lleve su unidad.'),
    m('alpha_cub := atan((H_alto - H_bajo) / B_nave) * 1 rad = deg'),
    t('## Superficies de referencia'),
    t('De cargas.json (_superficies_de_referencia). Las cargas de cubierta entran en SAP con dir = 10 (gravedad), que reparte sobre la superficie REAL: por eso las reacciones de S y LR cierran contra la inclinada y no contra la proyección (H-13, +1,11 % declarado y no corregido).'),
    m('A_cub_proy := L_nave * B_nave = m^2'),
    m('A_cub_incl := A_cub_proy / cos(alpha_cub) = m^2'),
    m('r_H13 := A_cub_incl / A_cub_proy - 1 ='),
    t('Área de muro sobre la que el modelo aplica SDL_MURO y CM_COS_LAT: 27 paños por SetLoadUniformToFrame (2.673,64 m²) más el paño 43 por SetLoadUniform (137,60 m²). MEDIDA en SAP por f20_geometria_cerramiento.py: la geometría de la hoja no la puede derivar, porque descuenta los vanos de portón.'),
    m('A_muro := 2811.24 m^2'),
    t('Tramo máximo de muro: los paños de hastial miden 8,4 y 8,5 m (Y = 0 · 8,5 · 16,9 · 25,4), más largos que los 8,0 m del muro largo. MEDIDO por f20.'),
    m('L_hastial := 8.5 m'),
    t('Vía del puente grúa: una viga carrilera por muro largo, a lo largo de toda la nave. Son las 22 barras (11 vanos × 2 vías) sobre las que el modelo reparte CM_VIA y CL_D.'),
    m('L_via := 2 * L_nave = m'),
    t('## Constantes'),
    m('g_0 := 9.80665 m/s^2'),
  ),
};

// ── Carga DEAD ───────────────────────────────────────────────────────────────
const dead = {
  id: 'c-dead',
  nombre: 'DEAD',
  subcargas: [
    {
      id: 's-dead-pp',
      nombre: 'Peso propio del acero con conexiones',
      variable: 'f_DEAD',
      hoja: hoja(
        'dea',
        t('## DEAD — peso propio del acero con sobrepeso por conexiones'),
        t('Tipo SAP: Dead. Se aplica como multiplicador de peso propio del patrón (SelfWeight). Script: 20_calculo/scripts/v38_conexiones.py.'),
        t('El 30 % por conexiones es INSTRUCCIÓN, no lectura: el DSC §6.1.1 define la carga muerta y tabula los pesos unitarios, pero no trae ninguna cláusula de sobrepeso por conexiones. Va como salvedad numerada.'),
        m('f_DEAD := 1.3'),
        t('Acero modelado, sin multiplicador: MEDIDO en SAP (lectura_reacciones.py), contrastado barra por barra con área × largo × peso específico, desvío 0,0 %.'),
        m('P_acero := 567.95 tonf'),
        m('R_DEAD := f_DEAD * P_acero = kN'),
        t('Reacción vertical medida en v44 (lectura_reacciones.result.json).'),
        m('R_DEAD_SAP := 7240.56 kN = kN'),
        m('e_DEAD := R_DEAD / R_DEAD_SAP - 1 ='),
        t('DESFASE ABIERTO: el modelo usa 7.849,3 kg/m³ y el DSC §6.1.1 tabula 7.870 kg/m³. La diferencia va del lado NO seguro.'),
        m('rho_mod := 76.9729 kN/m^3 / g_0 = kg/m^3'),
        m('rho_DSC := 7870 kg/m^3'),
        m('e_rho := rho_mod / rho_DSC - 1 ='),
      ),
    },
  ],
};

// ── Cargas de superficie que la costanera necesita ───────────────────────────
// Una partida corta por patrón: el valor que se escribe en SAP, su cita y la
// reacción esperada contra la medida en v44.
function cargaSimple(id, nombre, etiqueta, variable, bloques) {
  return { id: `c-${id}`, nombre, subcargas: [{ id: `s-${id}`, nombre: etiqueta, variable, hoja: hoja(`${id}-`, ...bloques) }] };
}

const sdlCub = cargaSimple('sdlc', 'SDL_CUB', 'Revestimiento de cubierta', 'q_SDL_cub', [
  t('## SDL_CUB — revestimiento de cubierta'),
  t('Tipo SAP: Dead. 33 áreas de cubierta, SetLoadUniformToFrame, dir 10. Script: v43_revcos.py.'),
  t('Petición del cliente del 2026-09-16 (D-50). SIN CITA: el documento del cliente que lo fija no está en la biblioteca. Reemplaza 75 kgf/m² heredados, que tampoco tenían respaldo.'),
  m('q_SDL_cub := 10 kgf/m^2 = kN/m^2'),
  m('R_SDL_CUB := q_SDL_cub * A_cub_incl = kN'),
  m('R_SDL_CUB_SAP := 221.64 kN'),
  m('e_SDL_CUB := R_SDL_CUB / R_SDL_CUB_SAP - 1 ='),
]);

const sdlMuro = cargaSimple('sdlm', 'SDL_MURO', 'Revestimiento de muro', 'q_SDL_muro', [
  t('## SDL_MURO — revestimiento de muro'),
  t('Tipo SAP: Dead. 27 áreas verticales más el paño 43 (desde v44). Mismo criterio y misma petición que SDL_CUB (D-50), sin cita.'),
  m('q_SDL_muro := 10 kgf/m^2 = kN/m^2'),
  m('R_SDL_MURO := q_SDL_muro * A_muro = kN'),
  m('R_SDL_MURO_SAP := 275.69 kN'),
  m('e_SDL_MURO := R_SDL_MURO / R_SDL_MURO_SAP - 1 ='),
]);

const polvo = cargaSimple('polv', 'POLVO', 'Acumulación de polvo', 'q_polvo', [
  t('## POLVO — acumulación de polvo'),
  t('Tipo SAP: Dead. Las mismas 33 áreas que la nieve. Script: v26_polvo.py.'),
  t('LEÍDO: DSC-BCHL-0001-P1 §6.1.1 (pdf 10 = impresa 10): «La acumulación de polvo en estructuras será considerada como carga permanente de 50 kg/m2».'),
  m('q_polvo := 50 kgf/m^2 = kN/m^2'),
  m('R_POLVO := q_polvo * A_cub_incl = kN'),
  m('R_POLVO_SAP := 1108.19 kN = kN'),
  m('e_POLVO := R_POLVO / R_POLVO_SAP - 1 ='),
]);

const lr = cargaSimple('lr', 'LR', 'Sobrecarga de techo', 'q_LR', [
  t('## LR — sobrecarga de techo'),
  t('Tipo SAP: Roof Live. Las mismas 33 áreas de cubierta.'),
  t('LEÍDO: DSC-BCHL-0001-P1 §6.1.3 (pdf 11 = impresa 11): «Cargas Vivas Mínimas de Diseño (LL) — Techos 100 kg/m2». Es alternativa EXCLUYENTE de S en la B.2.3 del CIRSOC 301. PENDIENTE: contraste contra el CIRSOC 101.'),
  m('q_LR := 100 kgf/m^2 = kN/m^2'),
  m('R_LR := q_LR * A_cub_incl = kN'),
  m('R_LR_SAP := 2216.38 kN = kN'),
  m('e_LR := R_LR / R_LR_SAP - 1 ='),
]);

// ── S: nieve balanceada, CIRSOC 104 ──────────────────────────────────────────
const nieve = cargaSimple('niev', 'S', 'Nieve balanceada — CIRSOC 104', 'p_s', [
  t('## S — nieve balanceada, CIRSOC 104-2005'),
  t('Tipo SAP: Snow. 33 áreas de cubierta, dir 10. Script de valores: nieve_c104.py (memo 2026-08-30-nieve-c104.md); aplicación: v34_nieve.py.'),
  t('p_g NO sale del reglamento: el CIRSOC 104 no cubre 3.600 m (Calingasta figura a 1.375 m con 0,30 kN/m², Tabla 1.12). Rige el valor CONTRACTUAL del DSC §6.1.5, sin respaldo estadístico (S-01). El propio artículo dice que la carga básica de nieve «deberá revisarse en esta etapa de ingeniería».'),
  m('p_g := 800 kgf/m^2 = kN/m^2'),
  t('C_e = 1,00 es INSTRUCCIÓN DE LA DIRECCIÓN (D-05), no lectura: la fila de la Tabla 2 que corresponde al sitio, «encima de la línea de árboles en áreas montañosas barridas por el viento», parcialmente expuesta, topea en 0,80. Espera confirmación escrita.'),
  m('C_e := 1.00'),
  m('C_e_tab := 0.80'),
  t('LEÍDOS: C_t de la Tabla 3 (estructura no calefaccionada); I de la Tabla 4 (Categoría II); C_s de la Figura 2.c, cubierta fría, 8,51° por debajo del quiebre de 15°; p_f mínimo del art. 3.4.'),
  m('C_t := 1.20'),
  m('I_nieve := 1.00'),
  m('C_s := 1.00'),
  m('pf_min := I_nieve * 1 kN/m^2'),
  m('p_f := 0.7 * C_e * C_t * I_nieve * p_g = kN/m^2'),
  m('v_pf_min := p_f >= pf_min ='),
  m('p_s := C_s * p_f = kN/m^2'),
  m('p_s_kgf := p_s = kgf/m^2'),
  t('Lo que cuesta D-05: la misma cadena con el C_e tabulado.'),
  m('p_s_tab := C_s * 0.7 * C_e_tab * C_t * I_nieve * p_g = kgf/m^2'),
  t('NIEVE NO BALANCEADA: NO APLICA. La cubierta es de vertiente única (medido por f20) y el Cap. 6 del CIRSOC 104 solo alcanza cubiertas a dos y cuatro aguas, curvas, de plegado múltiple, diente de sierra, bóvedas y cúpulas. El taller de neumáticos sí la lleva (D-39) porque su cubierta es a dos aguas.'),
  t('Contraste con el modelo. SAP reparte con dir 10 sobre la superficie inclinada, así que la reacción cierra contra A_cub_incl (H-13).'),
  m('R_S := p_s * A_cub_incl = kN'),
  m('R_S_SAP := 14894.05 kN = kN'),
  m('e_S := R_S / R_S_SAP - 1 ='),
]);

// ── Viento como componentes y revestimientos, CIRSOC 102 ────────────────────
// Con frontera propia: define 30 nombres (q_h, K_d, GC_pi…) y el viento del
// sistema principal va a necesitar varios de los mismos. Solo cruzan las
// presiones, la q_h con nombre propio y el tope de separación.
const viento = {
  id: 'k-viento-cyr',
  nombre: 'Viento C&R — CIRSOC 102',
  frontera: {
    procedencia: 'propia',
    formulas: { h_w: 'H_alto', B_n: 'B_nave', theta: 'alpha_cub', L_c: 's_marcos' },
    publica: { p_suc_cub: 'p_suc_cub', p_muro_CyR: 'p_muro_CyR', q_h: 'q_h_CyR', s_max: 's_max' },
  },
  hoja: hoja(
    'vcr',
    t('# Viento sobre componentes y revestimientos — CIRSOC 102-2005'),
    t('NO es un patrón de carga del modelo: es la presión con la que se dimensionan las costaneras. El viento del modelo (WXP … WPIN, sistema principal) es HEREDADO del modelo recibido, sin memoria de cálculo, y no sale de esta hoja. Fuente: costaneras.py, memo 2026-09-16-costaneras.md.'),
    t('Entran atados desde la obra: la altura (alero alto), el ancho de la nave, la pendiente y la luz de las costaneras.'),
    t('## Presión dinámica'),
    t('LEÍDOS. V: DSC §6.1.4, «viento 150 km/h S-SW» (ráfaga de 3 s a 10 m, exposición C). K_d: Tabla 6. I: Tabla A-1 y Tabla 1, Categoría II por la cláusula residual. Exposición C (§5.6): terreno abierto de montaña; alfa y z_g de la Tabla 4.'),
    m('V_w := 150 km/h = m/s'),
    m('K_d := 0.85'),
    m('I_w := 1.00'),
    m('alfa_exp := 9.5'),
    m('z_g := 274 m'),
    t('SUPUESTO K_zt = 1 (D-21 de neumáticos): ninguna de las cinco condiciones del §5.7 se verificó contra la topografía del sitio, a 3.600 m en terreno montañoso. Un K_zt de 1,15 sube toda la presión un 15 %.'),
    m('K_zt := 1.0'),
    t('DECISIÓN DEL INGENIERO (2026-09-16): con theta ≤ 10° la altura es «la del alero», en singular, y una vertiente única tiene dos. Se adopta el ALTO: h_w está atado a H_alto. Con el bajo, q_h daría 5,4 % menos.'),
    t('Condiciones de edificio de baja altura (Cap. 2), que habilitan el q_h de C&R del §5.6.3.1, y la franja de la Figura 7A (vertiente única, 3° < theta ≤ 10°).'),
    m('v_baja_1 := h_w <= 20 m ='),
    m('v_baja_2 := h_w <= B_n ='),
    m('v_fig7A := theta > 3 deg and theta <= 10 deg ='),
    t('K_h por interpolación lineal de la Tabla 5, exposición C, caso 1 (Nota 4): z = 15 m → 1,09 y z = 17,50 m → 1,13. Contraste con la forma cerrada de la Nota 2.'),
    m('K_h := 1.09 + (1.13 - 1.09) * (h_w - 15 m) / (17.5 m - 15 m) ='),
    m('K_h_fc := 2.01 * (h_w / z_g)^(2 / alfa_exp) ='),
    m('e_K_h := K_h_fc / K_h - 1 ='),
    t('Ec. (13) del §5.10. El 0,613 es la densidad estándar del aire; a 3.600 m es del orden de 35 % menor, así que es conservador. No se cambia sin los datos climáticos que pide el Com. C5.10.'),
    m('q_h := 0.613 kg/m^3 * K_h * K_zt * K_d * V_w^2 * I_w = kN/m^2'),
    t('## Coeficientes'),
    t('SUPUESTO en la clasificación, LEÍDO en el valor: parcialmente cerrado, GC_pi = ±0,55 (Tabla 7), el mismo criterio que D-24 de neumáticos. Si el taller es cerrado, ±0,18 y la succión de muro baja 26 %.'),
    m('GC_pi := 0.55'),
    m('a_zona := max(min(0.10 * B_n, 0.4 * h_w), 0.04 * B_n, 1 m) = m'),
    t('Área efectiva: la luz por un ancho que no puede ser menor que L/3 (Cap. 2). s_max es el tope de separación pedido por el ingeniero; con 8 m de luz manda L/3 para cualquier separación del barrido.'),
    m('s_max := 1.30 m'),
    m('A_ef := L_c * max(s_max, L_c / 3) = m^2'),
    t('OBSERVACIÓN: el script usa esta misma área para el muro, con la luz de 8,0 m de la cubierta y no con los 8,5 m del hastial. Es conservador: con 8,5 m la succión de muro bajaría 1,2 %.'),
    t('Cubierta: Figura 7A, zona 3\', meseta (A ≥ 10 m²). Es la peor zona y se aplica a toda la costanera. La Figura 5B de dos aguas habría dado −1,1, un 45 % menos de succión.'),
    m('GCp_cub := -1.6'),
    t('Muro: Figura 5A, zona 5 (esquina), interpolando en log(A) entre A ≤ 1 m² y A ≥ 50 m², con la reducción del 10 % de la Nota 5 para theta ≤ 10°.'),
    m('GCp_neg_1 := -1.4'),
    m('GCp_neg_50 := -0.8'),
    m('GCp_pos_1 := 1.0'),
    m('GCp_pos_50 := 0.7'),
    m('red_par := 0.90'),
    m('t_A := min(max(log10(A_ef / (1 m^2)) / log10(50), 0), 1) ='),
    m('GCp_neg := (GCp_neg_1 + t_A * (GCp_neg_50 - GCp_neg_1)) * red_par ='),
    m('GCp_pos := (GCp_pos_1 + t_A * (GCp_pos_50 - GCp_pos_1)) * red_par ='),
    t('## Presiones de diseño'),
    t('Ec. (18), p = q_h [(GC_p) − (GC_pi)], con GC_pi en los dos signos y el mínimo neto de 0,5 kN/m² del §1.4.2. Negativo es succión.'),
    m('p_min_CyR := 0.50 kN/m^2'),
    m('p_suc_cub := min(q_h * (GCp_cub - GC_pi), -p_min_CyR) = kN/m^2'),
    m('p_suc_muro := min(q_h * (GCp_neg - GC_pi), -p_min_CyR) = kN/m^2'),
    m('p_emp_muro := max(q_h * (GCp_pos + GC_pi), p_min_CyR) = kN/m^2'),
    m('p_muro_CyR := max(abs(p_emp_muro), abs(p_suc_muro)) = kN/m^2'),
    t('Gobierna la SUCCIÓN en el muro: el ala comprimida del girt es la interior, arriostrada solo por los colgadores.'),
  ),
};

// ── Costaneras: AISC 360-22, con frontera propia ─────────────────────────────
// Las funciones de resistencia son las mismas en techo y muro. Con frontera cada
// hoja tiene su scope, así que pueden llamarse igual sin chocar; la contracara es
// que están escritas dos veces, que es exactamente el H-33 del proyecto.
const resistencia = (canal) => [
  t('## Material y constantes (AISC 360-22)'),
  t('F_y INFERIDO (sin cita normativa, B-01): A572-GR50-CHAPA leído de la biblioteca de materiales de SAP2000 27. E y phi_b LEÍDOS: §F2 y §F1(a).'),
  m('F_y := 344.73789 MPa'),
  m('E_s := 200000 MPa'),
  m('phi_b := 0.90'),
  m('lambda_p_ala := 0.38 * sqrt(E_s / F_y) ='),
  m('lambda_p_alma := 3.76 * sqrt(E_s / F_y) ='),
  m('v_compacta := b_t <= lambda_p_ala and hw_tw <= lambda_p_alma ='),
  t('## Resistencia nominal'),
  m('M_p := F_y * Z_x = kN*m'),
  m('phi_Mn_y := phi_b * min(F_y * Z_y, 1.6 * F_y * S_y) = kN*m'),
  t(canal
    ? 'Pandeo lateral-torsional, §F2.2. En un canal c sale de F2-8b.'
    : 'Pandeo lateral-torsional, §F2.2. En un doble T c = 1 (F2-8a).'),
  m('L_p := 1.76 * r_y * sqrt(E_s / F_y) = m'),
  m('r_ts := sqrt(sqrt(I_y * C_w) / S_x) = cm'),
  m(canal ? 'c_F2 := (h_o / 2) * sqrt(I_y / C_w) =' : 'c_F2 := 1'),
  m('jc := J_t * c_F2 / (S_x * h_o) ='),
  m('f_L := 0.7 * F_y'),
  m('L_r := 1.95 * r_ts * (E_s / f_L) * sqrt(jc + sqrt(jc^2 + 6.76 * (f_L / E_s)^2)) = m'),
  t('Las tres ramas de F2: L_b ≤ L_p sin PLT; L_p < L_b ≤ L_r por F2-2; L_b > L_r por F2-3 y F2-4. Siempre con el tope M_p.'),
  p(['phi_Mn(Cb) :=',
     '    if L_b <= L_p',
     '        M_n := M_p',
     '    else if L_b <= L_r',
     '        M_n := Cb * (M_p - (M_p - f_L * S_x) * (L_b - L_p) / (L_r - L_p))',
     '    else',
     '        esb := L_b / r_ts',
     '        F_cr := Cb * pi^2 * E_s / esb^2 * sqrt(1 + 0.078 * jc * esb^2)',
     '        M_n := F_cr * S_x',
     '    return phi_b * min(M_n, M_p)'].join('\n')),
  m('rama_F2 := L_b <= L_p ? 1 : (L_b <= L_r ? 2 : 3) ='),
  t('Cb por F1-1 en cada segmento entre colgadores de una viga biapoyada con carga uniforme; m_r es M(x)/(w L²/8). Con colgadores a los tercios, el segmento central tiene momento casi uniforme y da 1,014: el Cb = 1,14 de la viga entera sería del lado inseguro.'),
  p('m_r(u) := 4 * u * (1 - u)'),
  p(['Cb_seg(a, b, M_max) :=',
     '    M_A := m_r(a + (b - a) / 4)',
     '    M_B := m_r((a + b) / 2)',
     '    M_C := m_r(a + 3 * (b - a) / 4)',
     '    return 12.5 * M_max / (2.5 * M_max + 3 * M_A + 4 * M_B + 3 * M_C)'].join('\n')),
  m('Cb_1 := Cb_seg(0, 1/3, m_r(1/3)) ='),
  m('Cb_2 := Cb_seg(1/3, 2/3, 1) ='),
];

const costaneraTecho = {
  id: 'k-cos-techo',
  nombre: 'Costanera de techo — W12x22 c/1,20 m',
  frontera: {
    procedencia: 'propia',
    formulas: {
      L_c: 's_marcos',
      theta: 'alpha_cub',
      g_c: 'g_0',
      p_s: 'p_s',
      q_LR: 'q_LR',
      q_polvo: 'q_polvo',
      q_SDL: 'q_SDL_cub',
      p_suc: 'p_suc_cub',
      s_tope: 's_max',
    },
    publica: { q_CM: 'q_COS_techo', DC_max: 'DC_cos_techo' },
  },
  hoja: hoja(
    'ct',
    t('# Costanera de techo — perfil W, AISC 360-22'),
    t('Fuente: costaneras.py, memo 2026-09-16-costaneras.md. Esta hoja VERIFICA lo adoptado (W12x22 cada 1,20 m, decisión del ingeniero del 2026-09-16); el barrido de perfiles y separaciones que lo eligió queda en el script.'),
    t('Entran atados desde la obra: la luz, la pendiente, g, la nieve, LR, el polvo, el revestimiento, la succión de C&R y el tope de separación.'),
    t('## Disposición'),
    t('Criterio del ingeniero: colgadores de barra maciza de 12 mm a los tercios. Arriostran el ala inferior contra el PLT bajo levantamiento y toman la componente en la pendiente.'),
    m('s_c := 1.20 m'),
    m('v_s_tope := s_c <= s_tope ='),
    m('n_colg := 3'),
    m('d_colg := 12 mm'),
    m('L_b := L_c / n_colg = m'),
    t('## Perfil W12x22'),
    t('Catálogo IRAM-IAS U 500-215-6 (Troglia), impresa 17, solo columnas geométricas (B-02).'),
    m('peso_c := 32.7 kg/m'),
    m('h_p := 313 mm'),
    m('t_f := 10.8 mm'),
    m('b_t := 4.74'),
    m('hw_tw := 40.4'),
    m('I_x := 6493 cm^4'),
    m('S_x := 416 cm^3'),
    m('Z_x := 480 cm^3'),
    m('I_y := 194 cm^4'),
    m('S_y := 37.9 cm^3'),
    m('r_y := 2.15 cm'),
    m('Z_y := 60.0 cm^3'),
    m('J_t := 12.1 cm^4'),
    m('C_w := 44040 cm^6'),
    m('h_o := h_p - t_f = cm'),
    ...resistencia(false),
    t('## Cargas por metro'),
    t('POLVO SE SUMA A LA NIEVE (decisión del 2026-09-16, medida: no cambia el perfil). S y LR son EXCLUYENTES por la B.2.3 del CIRSOC 301, que es reglamento.'),
    m('w_pp := peso_c * g_c = kN/m'),
    m('w_D := q_SDL * s_c + w_pp + q_polvo * s_c = kN/m'),
    m('w_u_S := 1.2 * w_D + 1.6 * p_s * s_c = kN/m'),
    m('w_u_LR := 1.2 * w_D + 1.6 * q_LR * s_c = kN/m'),
    m('w_u := max(w_u_S, w_u_LR) = kN/m'),
    t('## Gravedad: flexión biaxial, H1-1b con P_r = 0'),
    t('El ala comprimida es la superior, SUPUESTA arriostrada de forma continua por la chapa: M_n = M_p sin PLT. Si la fijación no lo garantiza, el D/C pasa de 0,827 a 1,235. La componente en la pendiente flexiona el eje débil sobre el tramo entre colgadores.'),
    m('M_u := w_u * L_c^2 / 8 = kN*m'),
    m('M_ux := M_u * cos(theta)^2 = kN*m'),
    m('M_uy := M_u * cos(theta) * sin(theta) * L_b^2 / L_c^2 = kN*m'),
    m('DC_grav := M_ux / (phi_b * M_p) + M_uy / phi_Mn_y ='),
    t('## Levantamiento: 0,9 D + 1,5 W (B.2.6)'),
    t('La D es la permanente MÍNIMA: sin polvo, que puede no estar. El ala comprimida es la inferior, arriostrada solo por los colgadores: PLT por segmento.'),
    m('w_up := 1.5 * abs(p_suc) * s_c - 0.9 * (q_SDL * s_c + w_pp) = kN/m'),
    m('M_up := max(w_up, 0 kN/m) * L_c^2 / 8 = kN*m'),
    m('DC_up := max(M_up * m_r(1/3) / phi_Mn(Cb_1), M_up / phi_Mn(Cb_2)) ='),
    t('## Flechas'),
    t('Biapoyada, conservador: si se fabrica continua, queda margen no cobrado. Total L/200 del DSC §7.4.1. Por sobrecarga L/240 de la Tabla L.3.1 del CIRSOC 301 (fila rígida, adoptada sin costo: con la flexible no cambia el perfil).'),
    m('w_sob := max(p_s, q_LR) * s_c = kN/m'),
    m('f_tot := 5 * (w_D + w_sob) * L_c^4 / (384 * E_s * I_x) = mm'),
    m('f_sob := 5 * w_sob * L_c^4 / (384 * E_s * I_x) = mm'),
    m('v_f_tot := f_tot <= L_c / 200 ='),
    m('v_f_sob := f_sob <= L_c / 240 ='),
    m('u_f_sob := f_sob / (L_c / 240) ='),
    t('## Resultado'),
    m('DC_max := max(DC_grav, DC_up) ='),
    m('v_DC := DC_max <= 1 ='),
    t('Peso que va al patrón CM_COS_TECHO: el perfil por metro de separación más los colgadores (dos tensores por tramo, con el peso específico del material del proyecto).'),
    m('gamma_ac := 77.178 kN/m^3'),
    m('q_colg := (n_colg - 1) * pi * d_colg^2 / 4 * gamma_ac / L_c = kN/m^2'),
    m('q_CM := peso_c * g_c / s_c + q_colg = kN/m^2'),
    m('q_CM_kgf := q_CM = kgf/m^2'),
    t('Contraste con el memo del 2026-09-16: D/C 0,826561 · levantamiento 0,296956 · flecha total 36,695 mm · por sobrecarga 32,478 mm · 27,473 kgf/m².'),
    m('e_DC_grav := DC_grav / 0.826561 - 1 ='),
    m('e_DC_up := DC_up / 0.296956 - 1 ='),
    m('e_f_tot := f_tot / (36.695 mm) - 1 ='),
    m('e_f_sob := f_sob / (32.478 mm) - 1 ='),
    m('e_q_CM := q_CM_kgf / (27.473 kgf/m^2) - 1 ='),
  ),
};

const costaneraMuro = {
  id: 'k-cos-muro',
  nombre: 'Costanera de muro — C9x13,4 c/1,30 m',
  frontera: {
    procedencia: 'propia',
    formulas: {
      L_m: 'L_hastial',
      g_c: 'g_0',
      q_SDL: 'q_SDL_muro',
      p_muro: 'p_muro_CyR',
      s_tope: 's_max',
    },
    publica: { q_CM: 'q_COS_lat', DC_max: 'DC_cos_muro' },
  },
  hoja: hoja(
    'cm',
    t('# Costanera de muro — canal, AISC 360-22'),
    t('Fuente: costaneras.py, memo 2026-09-16-costaneras.md. VERIFICA lo adoptado: C9x13,4 cada 1,30 m. NO es el mínimo del barrido (C8x11,5 a 1,20 m cumplía por 0,3 % y 0,2 % a la vez): el ingeniero compró margen por +1,06 kgf/m².'),
    t('Se dimensiona con el tramo MÁXIMO de hastial, 8,50 m, no con los 8,00 m del muro largo: calcular con 8,00 y montar en 8,50 deja el girt 13 % corto en momento y 27 % en flecha.'),
    t('## Disposición'),
    m('s_c := 1.30 m'),
    m('v_s_tope := s_c <= s_tope ='),
    m('n_colg := 3'),
    m('L_b := L_m / n_colg = m'),
    t('## Perfil C9x13,4'),
    t('Catálogo IRAM-IAS U 500-509-4 (Troglia), impresa 21, solo columnas geométricas (B-02). En un canal b/t es el ala entera (F6-4).'),
    m('peso_c := 19.9 kg/m'),
    m('h_p := 229 mm'),
    m('t_f := 10.5 mm'),
    m('b_t := 5.90'),
    m('hw_tw := 18.4'),
    m('I_x := 1994 cm^4'),
    m('S_x := 174 cm^3'),
    m('Z_x := 205 cm^3'),
    m('I_y := 73 cm^4'),
    m('S_y := 16 cm^3'),
    m('r_y := 1.70 cm'),
    m('Z_y := 32 cm^3'),
    m('J_t := 7.08 cm^4'),
    m('C_w := 7573 cm^6'),
    m('h_o := h_p - t_f = cm'),
    ...resistencia(true),
    t('## Flexión biaxial con PLT bajo succión, H1-1b con P_r = 0'),
    t('El viento C&R flexiona el eje fuerte. El peso propio y el revestimiento flexionan el eje débil, porque el girt es horizontal, sobre el tramo entre colgadores.'),
    m('w_x := 1.5 * p_muro * s_c = kN/m'),
    m('M_ux := w_x * L_m^2 / 8 = kN*m'),
    m('w_y := 1.2 * (peso_c * g_c + q_SDL * s_c) = kN/m'),
    m('M_uy := w_y * L_b^2 / 8 = kN*m'),
    m('DC_1 := M_ux * m_r(1/3) / phi_Mn(Cb_1) + M_uy / phi_Mn_y ='),
    m('DC_2 := M_ux / phi_Mn(Cb_2) + M_uy / phi_Mn_y ='),
    m('DC_max := max(DC_1, DC_2) ='),
    m('v_DC := DC_max <= 1 ='),
    t('## Flecha lateral por viento'),
    t('L/200 del DSC §7.4.1 («Revestimiento, costaneras y columnas de viento»), sobre el tramo máximo.'),
    m('f_w := 5 * p_muro * s_c * L_m^4 / (384 * E_s * I_x) = mm'),
    m('v_f := f_w <= L_m / 200 ='),
    t('## Resultado'),
    t('Peso que va al patrón CM_COS_LAT: el perfil por metro de separación. Los girts no llevan colgadores en el peso.'),
    m('q_CM := peso_c * g_c / s_c = kN/m^2'),
    m('q_CM_kgf := q_CM = kgf/m^2'),
    t('Contraste con el memo del 2026-09-16: D/C 0,801561 · flecha 31,293 mm · 15,308 kgf/m².'),
    m('e_DC := DC_max / 0.801561 - 1 ='),
    m('e_f := f_w / (31.293 mm) - 1 ='),
    m('e_q_CM := q_CM_kgf / (15.308 kgf/m^2) - 1 ='),
  ),
};

// ── Los patrones que salen de las costaneras ────────────────────────────────
const cmCosTecho = cargaSimple('cmct', 'CM_COS_TECHO', 'Peso de costaneras de techo', 'q_CM_COS_TECHO', [
  t('## CM_COS_TECHO — peso de las costaneras de techo'),
  t('Tipo SAP: Dead. 33 áreas de cubierta, dir 10. Lo aplica v43_revcos.py, que importa el valor de la hoja. f20 comprobó que ninguna de las 591 barras del modelo es una costanera: no hay doble conteo.'),
  m('q_CM_COS_TECHO := q_COS_techo = kN/m^2'),
  m('R_CM_COS_TECHO := q_CM_COS_TECHO * A_cub_incl = kN'),
  m('R_CM_COS_TECHO_SAP := 608.89 kN'),
  m('e_CM_COS_TECHO := R_CM_COS_TECHO / R_CM_COS_TECHO_SAP - 1 ='),
]);

const cmCosLat = cargaSimple('cmcl', 'CM_COS_LAT', 'Peso de costaneras de muro', 'q_CM_COS_LAT', [
  t('## CM_COS_LAT — peso de las costaneras de muro'),
  t('Tipo SAP: Dead. 27 áreas por SetLoadUniformToFrame más el paño 43 por SetLoadUniform. Un lector que mire una sola de las dos vías deja ese paño afuera sin avisar.'),
  m('q_CM_COS_LAT := q_COS_lat = kN/m^2'),
  m('R_CM_COS_LAT := q_CM_COS_LAT * A_muro = kN'),
  m('R_CM_COS_LAT_SAP := 422.02 kN'),
  m('e_CM_COS_LAT := R_CM_COS_LAT / R_CM_COS_LAT_SAP - 1 ='),
]);

// ── SDL_HOJA: peso de las hojas de portón ────────────────────────────────────
const sdlHoja = cargaSimple('sdlh', 'SDL_HOJA', 'Hojas de portón', 'w_SDL_HOJA', [
  t('## SDL_HOJA — peso de las tres hojas de portón'),
  t('Tipo SAP: Dead. Carga LINEAL de barra (FrameObj.SetLoadDistributed, dir 10) sobre los cordones inferiores de transferencia 722, 758 y 723. Script: v44_portones.py, 16 de 16 pruebas.'),
  t('Por qué lineal y no de área: el hueco del portón ya está modelado como hueco —los paños sobre esos vanos arrancan en z = 9,15—, así que no hay superficie donde repartir el peso. La única pieza adyacente al vacío es el cordón del enrejado de transferencia.'),
  t('## Geometría de los portones'),
  t('Se identifican por GEOMETRÍA (f22_sonda_portones.py): son los vanos cuya línea de columna no llega a la base. Tres columnas nacen en el aire, sobre un enrejado de transferencia: x = 24 / y = 0, x = 24 / y = 25,4 y x = 64 / y = 0. Cada una deja libre los dos vanos que la flanquean.'),
  m('n_port := 3'),
  m('L_port := 2 * s_marcos = m'),
  t('Altura libre: la cota del cordón inferior, MEDIDA por f22. DECISIÓN DEL INGENIERO (2026-09-16): los 16,0 × 9,15 m son todo hoja. Si el portón real fuera menor, el resto del vano sería cerramiento fijo y habría que decidir dónde apoya.'),
  m('H_port := 9.15 m'),
  m('A_hoja := L_port * H_port = m^2'),
  t('## Peso de la hoja'),
  t('SUPUESTO, SIN CITA: es el S-19 del taller de neumáticos para el mismo cliente, que reemplaza «los datos del proveedor del portón, que todavía no existen». Adoptado aquí por el ingeniero el 2026-09-16 (D-55). El peso de las tres hojas escala lineal con él, y con él la demanda de los tres cordones y de las columnas que nacen sobre ellos.'),
  m('q_hoja := 0.40 kN/m^2'),
  m('q_hoja_kgf := q_hoja = kgf/m^2'),
  t('Lo que se escribe en SAP: el peso de la hoja por metro de cordón.'),
  m('w_SDL_HOJA := q_hoja * H_port = kN/m'),
  m('R_SDL_HOJA := w_SDL_HOJA * L_port * n_port = kN'),
  m('R_SDL_HOJA_SAP := 175.68 kN = kN'),
  m('e_SDL_HOJA := R_SDL_HOJA / R_SDL_HOJA_SAP - 1 ='),
  t('PENDIENTE: el S-19 de neumáticos trae dos cosas, el peso de la hoja y que su dintel «admite L/360». Aquí se adoptó solo el peso: no hay verificación de la flecha de los cordones 722, 758 y 723 bajo la hoja.'),
  t('Hasta v43 esta carga estaba como carga de ÁREA sobre el paño 43 (x 72–80, y = 0), que es un vano de muro corriente y no un portón. En v44 ese paño pasó a SDL_MURO.'),
]);

// ── CM_VIA y CL_D: la vía y el puente grúa ──────────────────────────────────
const cmVia = cargaSimple('cmvia', 'CM_VIA', 'Riel y accesorios de la vía', 'w_CM_VIA', [
  t('## CM_VIA — riel y accesorios de la vía de grúa'),
  t('Tipo SAP: Dead. FrameObj.SetLoadDistributed sobre las 22 barras de viga carrilera, dir gravedad.'),
  t('HEREDADO DEL MODELO RECIBIDO, SIN MEMORIA DE CÁLCULO: nadie sabe qué riel ni qué accesorios hay dentro del número. El memo de la viga carrilera (2026-09-03) lo lee del modelo y supone un riel de 105 mm de altura, «tipo A75». El riel real depende de la grúa real, que es D-07 (abierta: faltan los datos del fabricante).'),
  m('w_CM_VIA := 0.769 kN/m'),
  m('w_CM_VIA_kgf := w_CM_VIA = kgf/m'),
  m('R_CM_VIA := w_CM_VIA * L_via = kN'),
  m('R_CM_VIA_SAP := 135.34 kN = kN'),
  m('e_CM_VIA := R_CM_VIA / R_CM_VIA_SAP - 1 ='),
]);

const clD = cargaSimple('cld', 'CL_D', 'Peso propio del puente grúa', 'w_CL_D', [
  t('## CL_D — peso propio del puente grúa, repartido a lo largo de la vía'),
  t('Tipo SAP: Dead. FrameObj.SetLoadDistributed sobre las mismas 22 barras que CM_VIA. Entró a CM en v33 (v33_cld.py): hasta v32 estaba en la fuente de masa y en EV pero NO en CM, así que pesaba para sismo y no para gravedad (H-09, cerrado).'),
  t('HEREDADO DEL MODELO RECIBIDO, sin memoria de cálculo. No hay datos del fabricante (D-07): el plano disponible es de 18,8 m de luz y la nave necesita 24,6 m.'),
  m('w_CL_D := 1.1833 kN/m'),
  m('R_CL_D := w_CL_D * L_via = kN'),
  m('R_CL_D_SAP := 208.25 kN = kN'),
  m('e_CL_D := R_CL_D / R_CL_D_SAP - 1 ='),
  t('El peso de puente que el número implica. Es el que usa el hallazgo H-15 del memo de la viga carrilera: las cuatro ruedas del modelo suman menos que los elementos móviles más este puente.'),
  m('P_puente := R_CL_D = tonf'),
  t('H-16: el peso del puente va REPARTIDO a lo largo de las dos vías y no viaja con las ruedas. El art. 4.14.1 del CIRSOC 101 lo incluye en la carga máxima de rueda; aquí queda uniforme en los 176 m, así que la viga del tramo cargado no lo recibe concentrado.'),
]);

// ── Contraste de CM y de la masa sísmica ─────────────────────────────────────
// Hoja libre a propósito: lee las nueve reacciones esperadas de las partidas, y
// las flechas que eso dibuja son justamente el registro de qué entra a CM.
const contraste = {
  id: 'k-contraste-cm',
  nombre: 'Contraste de CM y de la masa sísmica',
  hoja: hoja(
    'ccm',
    t('# Contraste de CM y de la masa sísmica'),
    t('La suma de lo que cada hoja de patrón dice que el modelo tiene que llevar, contra lo que el modelo lleva. Es el cargas_contraste.py del proyecto, pero con cada término a la vista y con su respaldo a un clic.'),
    t('Regla de los tres registros (A-36): toda carga permanente tiene que estar en el caso CM, en el caso EV y en la fuente de masa. H-09 se abrió porque CL_D faltaba en el del medio: pesaba para sismo y no para gravedad.'),
    t('## CM: los nueve permanentes a factor 1,0'),
    m('CM_esp := R_DEAD + R_SDL_CUB + R_SDL_MURO + R_SDL_HOJA + R_CM_COS_TECHO + R_CM_COS_LAT + R_CM_VIA + R_CL_D + R_POLVO = kN'),
    t('Medido en v44: suma de las reacciones de los nueve patrones (lectura_reacciones.result.json, _suma_muertos_kN).'),
    m('CM_SAP := 10396.26 kN = kN'),
    m('e_CM := CM_esp / CM_SAP - 1 ='),
    m('v_CM := abs(CM_esp - CM_SAP) <= 1 kN ='),
    t('DATO VIEJO EN EL HARNESS: cargas.json, _casos_agregadores, todavía dice «Total 12.771,00 kN» y «W = 20.218,04 kN». Son de antes de v43, cuando el revestimiento era 75/25 kgf/m² y las costaneras heredadas. La diferencia es exactamente lo que movieron v43 y v44.'),
    m('CM_json := 12771.00 kN = kN'),
    m('d_CM_json := CM_json - CM_SAP = kN'),
    t('Contraste de la diferencia: el memo de costaneras predijo que v43 bajaría CM en 2.550,42 kN (revestimiento y costaneras), y v44 le sumó los 175,68 kN de SDL_HOJA.'),
    m('d_v43_v44 := 2550.42 kN - R_SDL_HOJA = kN'),
    m('e_d := d_CM_json / d_v43_v44 - 1 ='),
    t('## Fuente de masa: los nueve permanentes más la nieve a f2'),
    t('f2 = 0,50 es APARTAMIENTO DECLARADO (D-35): el CIRSOC 103 tabula 0,70 para este caso. Lo que vale la decisión, medido: el peso sísmico con el valor tabulado.'),
    m('f2 := 0.50'),
    m('f2_tab := 0.70'),
    m('W_esp := CM_esp + f2 * R_S = kN'),
    t('Medido en v44 por v44_cierre.py: suma, patrón por patrón, con los factores de la fuente de masa LEÍDOS del modelo.'),
    m('W_SAP := 17843.28 kN = kN'),
    m('e_W := W_esp / W_SAP - 1 ='),
    m('v_W := abs(W_esp - W_SAP) <= 1 kN ='),
    m('W_tab := CM_esp + f2_tab * R_S = kN'),
    m('r_D35 := W_tab / W_esp - 1 ='),
    t('Cuánto pesa la nieve en la masa sísmica: con 672 kgf/m² es el término que más se mueve si el cliente revisa p_g, como anuncia el DSC §6.1.5.'),
    m('r_S_en_W := f2 * R_S / W_esp ='),
    t('EV, el sismo vertical, se calcula en el nodo del espectro: necesita C_a, y leerlo de allá en vez de escribirlo aquí es lo que evita que los dos números diverjan.'),
  ),
};

// ── Espectro CIRSOC 103-P1-2018 ──────────────────────────────────────────────
// Frontera propia: C_a, T_1, R… no deben quedar en el scope de la obra. Lee W y
// CM del contraste, y por eso EV vive aquí y no allá: al revés sería un ciclo.
const espectro = {
  id: 'k-espectro',
  nombre: 'Espectro CIRSOC 103 — zona 4, sitio S_C',
  frontera: {
    procedencia: 'propia',
    formulas: { W_s: 'W_esp', CM_s: 'CM_esp', g_s: 'g_0' },
    publica: {
      C_a: 'C_a_sit', gamma_r: 'gamma_r_sit', f_EV: 'f_EV', EV_s: 'EV_esp',
      SF_X: 'SF_RSX', SF_Y: 'SF_RSY', Voe_X: 'Voe_X', Voe_Y: 'Voe_Y', r_X: 'r85_X', r_Y: 'r85_Y',
    },
  },
  hoja: hoja(
    'esp',
    t('# Espectro de diseño — CIRSOC 103-P1-2018, reglamentario (D-34)'),
    t('Fuente: v31_espectro.py y memo 2026-09-16-espectro-c103-v44.md. Reemplaza al espectro del estudio de amenaza de Ausenco (Sa_SITIO_2475, meseta 1,473 g) por decisión D-34, que espera confirmación escrita. Entran atados desde la obra: el peso sísmico W y la carga permanente CM, del nodo de contraste, y g.'),
    t('## Sitio'),
    t('LEÍDOS. Zona 4: Calingasta figura en el listado por departamento de la provincia de San Juan (pdf 44 = impresa 26), no del mapa. Sitio S_C por V_sm = 450 m/s, dentro de la banda 360–760 m/s de la Tabla 2.2; V_sm sale del Vs30 del estudio de Ausenco (Anexo A.6). S_C pertenece al Tipo Espectral 1.'),
    m('V_sm := 450 m/s'),
    m('v_S_C := V_sm >= 360 m/s and V_sm <= 760 m/s ='),
    t('Tabla 3.1 (pdf 50 = impresa 32), fila Tipo Espectral 1, columna zona 4: C_a = 0,37·N_a y C_v = 0,51·N_v. Tabla 3.2: T_3 = 13 s en zona 4.'),
    t('SUPUESTOS, NO VERIFICABLES: N_a = 1 y N_v = 1,2. El OPERADOR de [3.11] y [3.12] no existe en el PDF —una fuente Symbol que no se renderiza, comprobado a 190, 520 y 900 dpi—: no se sabe si son igualdades o pisos. Si N_v fuera mayor, sube la rama C_v/T, que es donde está el modo fundamental de esta nave.'),
    m('N_a := 1.0'),
    m('N_v := 1.2'),
    m('C_a := 0.37 * N_a ='),
    m('C_v := 0.51 * N_v ='),
    m('T_3 := 13 s'),
    m('T_2 := C_v / (2.5 * C_a) * 1 s = s'),
    m('T_1 := 0.2 * T_2 = s'),
    t('Grupo B (D-02, espera confirmación escrita): gamma_r = 1,0 por el art. 2.4.3.'),
    m('gamma_r := 1.0'),
    t('## Las cuatro ramas, en fracciones de g'),
    t('[3.1] a [3.4]. La rama [3.1] se escribe lineal entre C_a en T = 0 y 2,5·C_a en T_1: el memo contrasta esos dos extremos contra el modelo, no la forma intermedia. Revisar contra el PDF.'),
    p(['Sa(T) :=',
       '    if T <= T_1',
       '        return C_a * (1 + 1.5 * T / T_1)',
       '    else if T <= T_2',
       '        return 2.5 * C_a',
       '    else if T <= T_3',
       '        return C_v / (T / (1 s))',
       '    else',
       '        return C_v * (T_3 / (1 s)) / (T / (1 s))^2'].join('\n')),
    t('Contraste con los puntos que el memo verificó contra la función Sa_C103_REGL del modelo (265 puntos).'),
    m('Sa_0 := Sa(0 s) ='),
    m('Sa_meseta := Sa(T_2) ='),
    m('Sa_1s := Sa(1 s) ='),
    m('Sa_20s := Sa(20 s) ='),
    m('e_Sa_20 := Sa_20s / 0.01989 - 1 ='),
    t('## Sistema y factores de escala'),
    t('X: arriostrado concéntrico especial (SCBF), R = 5. Y: pórtico especial no arriostrado (SMF), R = 7. El caso espectral de SAP lleva la función en g y el factor de escala g·gamma_r/R.'),
    m('R_X := 5'),
    m('R_Y := 7'),
    m('SF_X := g_s * gamma_r / R_X = m/s^2'),
    m('SF_Y := g_s * gamma_r / R_Y = m/s^2'),
    t('## Corte basal estático y el 85 % del art. 7.2.5'),
    t('Periodos traslacionales MEDIDOS en v44 (v44_cierre.result.json): X en la meseta, Y en la rama descendente. Por eso el corte en Y escala con la masa y el de X no.'),
    m('T_X := 0.264762 s'),
    m('T_Y := 0.819457 s'),
    m('v_TX_meseta := T_X <= T_2 ='),
    m('v_TY_rama := T_Y > T_2 ='),
    m('C_X := 2.5 * C_a * gamma_r / R_X ='),
    m('C_Y := Sa(T_Y) * gamma_r / R_Y ='),
    m('Voe_X := C_X * W_s = kN'),
    m('Voe_Y := C_Y * W_s = kN'),
    t('Corte modal MEDIDO en v44 con Results.BaseReact() sobre RSX y RSY. NO el del snapshot (3.485,84 kN): ese suma la rama Max nudo a nudo, que no es una resultante (H-34).'),
    m('Vod_X := 3428.35 kN = kN'),
    m('Vod_Y := 2204.36 kN = kN'),
    m('r_X := Vod_X / Voe_X ='),
    m('r_Y := Vod_Y / Voe_Y ='),
    m('v_85_X := r_X >= 0.85 ='),
    m('v_85_Y := r_Y >= 0.85 ='),
    t('Los dos pasan el 85 %: el factor de escala queda en g·gamma_r/R limpio y el modelo no se toca.'),
    t('## EV: sismo vertical, [3.10]'),
    t('EV = (C_a/2)·gamma_r·D, sobre los mismos nueve permanentes de CM. En SAP es un caso estático con esos nueve patrones por f_EV.'),
    m('f_EV := C_a / 2 * gamma_r ='),
    m('EV_s := f_EV * CM_s = kN'),
    t('## Lo que costó D-34'),
    t('El espectro del estudio de amenaza (Ausenco, 2.475 años), verificado punto a punto por el proyecto: C_a = 0,589 g y C_v = 0,853 g. El reglamentario baja la meseta un 37 %, pero el modo fundamental en Y está en la rama C_v/T de los dos, donde baja solo un 28 %: transferir el −37 % de neumáticos habría sido citar un número de otro modelo.'),
    m('C_a_estudio := 0.589333'),
    m('C_v_estudio := 0.853'),
    m('r_meseta := C_a / C_a_estudio ='),
    m('r_rama_Cv := C_v / C_v_estudio ='),
  ),
};

// Los casos sísmicos del modelo, citables como cargas por las combinaciones.
const rsx = cargaSimple('rsx', 'RSX', 'Espectral en X', 'SF_RSX_c', [
  t('## RSX — caso de espectro de respuesta en X'),
  t('En SAP no es un patrón sino un CASO: ResponseSpectrum con la función Sa_C103_REGL, CQC, 5 % de amortiguamiento. Lo que se escribe es el factor de escala.'),
  m('SF_RSX_c := SF_RSX = m/s^2'),
  m('SF_RSX_SAP := 1.96133 m/s^2'),
  m('e_RSX := SF_RSX_c / SF_RSX_SAP - 1 ='),
]);
const rsy = cargaSimple('rsy', 'RSY', 'Espectral en Y', 'SF_RSY_c', [
  t('## RSY — caso de espectro de respuesta en Y'),
  t('Mismo caso que RSX en la otra dirección, con R = 7.'),
  m('SF_RSY_c := SF_RSY = m/s^2'),
  m('SF_RSY_SAP := 1.40095 m/s^2'),
  m('e_RSY := SF_RSY_c / SF_RSY_SAP - 1 ='),
]);
const cargaEV = cargaSimple('ev', 'EV', 'Sismo vertical', 'f_EV_c', [
  t('## EV — sismo vertical'),
  t('En SAP es un caso estático lineal con los nueve permanentes de CM, cada uno por f_EV (v31_espectro.py). Regla de los tres registros: todo permanente tiene que estar aquí también.'),
  m('f_EV_c := f_EV ='),
  m('f_EV_SAP := 0.185'),
  m('e_EV := f_EV_c / f_EV_SAP - 1 ='),
  m('R_EV := EV_esp = kN'),
]);

// ── Puente grúa 20/5 t: datos y balance de pesos ─────────────────────────────
const grua = {
  id: 'k-grua',
  nombre: 'Puente grúa 20/5 t',
  hoja: hoja(
    'gru',
    t('# Puente grúa 20/5 t — lo que se sabe de él'),
    t('D-07 ABIERTA: no hay datos del fabricante. El plano disponible es de 18,8 m de luz y la nave necesita 24,6 m. Todo lo de abajo es lo que el modelo tiene cargado (medido en v38 por grua_diagnostico.py y lectura_via.py), no la grúa que se va a instalar.'),
    t('## Tren de ruedas, sin impacto'),
    t('MEDIDO en el modelo: con el carro en un extremo, el riel cargado recibe dos ruedas de 152,33 kN y el otro dos de 51,08. Separación entre ejes 4,00 m.'),
    m('P_r1 := 152.33 kN'),
    m('P_r2 := 51.078 kN'),
    m('a_r := 4000 mm'),
    m('P_ruedas := 2 * P_r1 + 2 * P_r2 = kN'),
    t('Carga izada nominal (20 t) y elementos móviles: 30,01 t es lo que implica el bamboleo del modelo (CLH / 0,20). Carga útil + aparejo + carro, con el peso propio del puente EXCLUIDO, como manda el Com. C4.14.'),
    m('Q_izada := 20 tonf'),
    m('P_moviles := 30.01 tonf'),
    t('## H-15: el peso de la grúa no cierra'),
    t('El art. 4.14.1 del CIRSOC 101 incluye el peso del puente en la carga máxima de rueda. Las cuatro ruedas del modelo tendrían que sumar los móviles más el puente de CL_D, y no llegan.'),
    m('P_esperado := P_moviles + P_puente = kN'),
    m('falta_ruedas := P_esperado - P_ruedas = kN'),
    m('r_H15 := falta_ruedas / P_esperado ='),
    t('Faltan 95,7 kN, el 19 %: peso de puente que el modelo lleva repartido a lo largo del riel (CL_D) en vez de en las ruedas. Se cierra con D-07.'),
    t('## Factores del art. 4.14 del CIRSOC 101'),
    t('LEÍDOS (pdf 47 = impresa Cap. 4-33): impacto vertical 25 % para grúa de cabina o control remoto (4.14.2; D-36 fija el control remoto), bamboleo 20 % de los móviles (4.14.3), frenado 10 % de las cargas máximas de rueda SIN impacto (4.14.4).'),
    m('imp := 0.25'),
    m('pct_bamb := 0.20'),
    m('pct_fren := 0.10'),
    t('## La viga carrilera de la obra y la del proyecto'),
    t('El nodo «Viga carrilera» instancia la genérica PUBLICADA de la biblioteca. El proyecto usa una copia derivada (20_calculo/planillas/viga-carrilera.json) que da u_max = 0,789. Al instanciar la publicada con estos datos aparecieron dos defectos de la genérica, corregidos el 2026-09-22 con sus casos en verify:biblioteca:'),
    t('1. FIBRA LATERAL, del lado NO seguro: S_ytop se tomaba con b_f/2. Con el C15x50 el canal sobresale 28,5 mm del ala (381 contra 324 mm) y la fibra extrema es su punta: ahora entra D_c y se usa max(b_f, D_c)/2. u_lat = 0,2035, el mismo del memo.'),
    t('2. h_p NEGATIVO: con el eje neutro plástico dentro del ala comprimida, h_p = 2(d − t_f − y_pna) salía −6,8 mm y el alma se declaraba no compacta. Ahora se acota a 0, rige el tope λ_rw de la [F4-12] y R_pt pasa de 1,01 a 1,32.'),
    t('Lo que queda de diferencia (0,773 contra 0,789) está en el eje fuerte: la genérica arma Z_x por capas con el canal como un rectángulo equivalente y da 6,36·10⁶ mm³; el memo da 6,11·10⁶. Y la flecha: la genérica suma el peso propio (5,84 mm) y el TR-13 §5.8.7 pide la de UNA grúa sin impacto (5,27 mm). Ninguna de las dos va del lado no seguro en el veredicto, pero quedan anotadas.'),
  ),
};

const clv = cargaSimple('clv', 'CLV', 'Vertical de rueda con impacto, posiciones P1 a P3', 'P_CLV', [
  t('## CLV — cargas verticales de rueda, con el impacto dentro del patrón'),
  t('Tipo SAP: Other. Tres patrones, CLV_P1, CLV_P2 y CLV_P3, uno por posición del carro, con 4 cargas puntuales cada uno (FrameObj.SetLoadPoint). La envolvente ENVCL_V los reúne. Script: v30_cargas.py.'),
  t('Las tres posiciones valen lo mismo y solo cambia dónde están, y la obra no tiene cómo decir dónde: se escriben aquí como texto. P1 pone las ruedas a 1,00 y 5,00 m del apoyo (momento máximo). P2 y P3 ponen una rueda SOBRE el apoyo. H-18: ninguna es la del corte máximo, con la rueda justo adentro del apoyo; el modelo queda 20 % corto en el corte de la vía y en la reacción sobre la ménsula.'),
  t('El impacto va EN EL PATRÓN y no en el factor de combinación (v30), para que ninguna familia lo pierda. Carga máxima por rueda, riel cargado:'),
  m('P_CLV := P_r1 * (1 + imp) = kN'),
  m('P_CLV_2 := P_r2 * (1 + imp) = kN'),
  t('OJO con cargas.json: declara «127,13 kN por rueda», que es el PROMEDIO de las cuatro. Las ruedas no son iguales; la que dimensiona es la de 190,4 kN.'),
  m('P_CLV_prom := (2 * P_CLV + 2 * P_CLV_2) / 4 = kN'),
  m('R_CLV := 2 * P_CLV + 2 * P_CLV_2 = kN'),
  m('R_CLV_SAP := 508.53 kN = kN'),
  m('e_CLV := R_CLV / R_CLV_SAP - 1 ='),
]);

const clh = cargaSimple('clh', 'CLH', 'Bamboleo, posiciones P1 a P3', 'H_CLH', [
  t('## CLH — fuerza transversal de bamboleo (+Y)'),
  t('Tipo SAP: Other. CLH_P1 a CLH_P3, 4 cargas puntuales cada uno, en las mismas posiciones que CLV.'),
  t('El total cierra con el 4.14.3. Lo que NO está verificado es el REPARTO (S-07): va en partes iguales entre las cuatro ruedas, y el Com. C4.14 pide repartir según la rigidez horizontal de cada lado, que no es igual (muros de 17,2 y 13,4 m). H-20: actúa en un solo sentido.'),
  m('R_CLH := pct_bamb * P_moviles = kN'),
  m('H_CLH := R_CLH / 4 = kN'),
  m('R_CLH_SAP := 58.86 kN = kN'),
  m('e_CLH := R_CLH / R_CLH_SAP - 1 ='),
  t('Contraste con el AIST TR-13, Tabla 3.2 (fila «motor room maintenance cranes»): empuje lateral total del 30 % de la carga izada.'),
  m('R_CLH_TR13 := 0.30 * Q_izada = kN'),
  m('e_CLH_TR13 := R_CLH_TR13 / R_CLH - 1 ='),
]);

const cll = cargaSimple('cll', 'CLL', 'Frenado, posiciones P1 a P3', 'L_CLL', [
  t('## CLL — fuerza longitudinal de frenado (+X)'),
  t('Tipo SAP: Other. CLL_P1 a CLL_P3, 4 cargas puntuales cada uno.'),
  t('APARTAMIENTO DECLARADO (D-37, H-11): cada carga vale el 10 % de las dos ruedas del riel cargado, pero se aplica en las CUATRO ruedas. El 4.14.4 pide el 10 % de las cargas máximas de rueda sin impacto. Se conserva por conservador y va como salvedad, con su magnitud.'),
  m('L_CLL := pct_fren * 2 * P_r1 = kN'),
  m('R_CLL := 4 * L_CLL = kN'),
  m('R_CLL_SAP := 121.87 kN = kN'),
  m('e_CLL := R_CLL / R_CLL_SAP - 1 ='),
  t('Lo que pide el reglamento, y cuántas veces lo supera el modelo. Ojo con la base: son las ruedas SIN impacto (4.14.1); contra CLV, que ya trae el 25 %, el porcentaje saldría artificialmente bajo.'),
  m('R_CLL_regl := pct_fren * P_ruedas = kN'),
  m('r_D37 := R_CLL / R_CLL_regl ='),
]);

// ── Viga carrilera: la genérica de la biblioteca, atada a la grúa ────────────
const vigaCarrilera = {
  id: 'k-viga-carrilera',
  nombre: 'Viga carrilera W24x104 + C15x50',
  hoja: [],
  frontera: {
    procedencia: 'biblioteca',
    slug: 'viga-carrilera-generica',
    sha256: SHA_VIGA,
    // Datos de la sección y criterios: memo 2026-09-03-via-carrilera.md.
    entradas: {
      Fy: 248.2, E: 200000, phi_b: 0.9, phi_v: 0.9, phi_j10y: 1, phi_j10c: 0.75, phi_wsb: 0.85, k_v: 5.34,
      es_soldada: 0, d: 611, b_f: 324, t_f: 19.05, t_w: 12.7, b_fb: 324, t_fb: 19.05,
      A_W: 19800, I_xW: 1.29e9, I_yW: 1.08e8, J_W: 1.96e6, k_det: 40,
      hay_canal: 1, A_c: 9480, I_cy: 1.68e8, I_cx: 4.58e6, y_cc: 20.3, J_C: 1.1e6, h_tot: 705.5, D_c: 381,
      L: 8000, L_b: 8000, C_b: 1, n_r: 2, P_v: 19.42, P_serv: 15.53, H_lat: 1.5, a_ruedas: 4000, w_pp: 0.4289,
      H_riel: 105, restr_rot: 1, ala_compacta: 1, C_f: 12, F_TH: 110, n_SR: 500000, den_vert: 1000, den_lat: 400,
    },
    formulas: {
      L: 's_marcos',
      L_b: 's_marcos',
      P_v: 'P_CLV',
      P_serv: 'P_r1',
      H_lat: 'H_CLH',
      a_ruedas: 'a_r',
      // Un campo atado no puede leer otra entrada de su propia planilla: las
      // áreas del perfil y del canal se repiten aquí.
      w_pp: '(19800 mm^2 + 9480 mm^2) * 76.973 kN/m^3 + w_CM_VIA + w_CL_D',
    },
    publica: { u_max: 'u_via', u_H1: 'u_H1_via', u_corte: 'u_corte_via' },
  },
};

// ── Viento del modelo (SPRFV): heredado, reconstruido y contrastado ──────────
const wy = cargaSimple('wy', 'WY', 'Viento en ±Y (WYP, WYN)', 'p_WY_barl', [
  t('## WY — viento transversal, WYP y WYN'),
  t('Tipo SAP: Wind. SetLoadUniformToFrame sobre 61 áreas, dirección global. HEREDADO DEL MODELO RECIBIDO, SIN MEMORIA DE CÁLCULO: no consta de qué figura del CIRSOC 102 sale ni con qué GC_pi se armó. v30 corrigió que el sentido −Y no existía y repuso el área 43 que le faltaba.'),
  t('Los muros largos. El de y = 0 es el ALTO (17,2 m) y lleva dos portones; su área neta se reconstruye con la geometría y las hojas de SDL_HOJA. El de y = 25,4 es el bajo (13,4 m) con un portón, pero su área cargada NO se reconstruye: 88 × 13,4 − 146,4 da 1.032,8 m² y el modelo carga 813,2. Hay 219,6 m² que esta hoja no sabe explicar.'),
  m('A_muro_alto := L_nave * H_alto - 2 * A_hoja = m^2'),
  m('A_muro_bajo := 813.2 m^2'),
  m('A_muro_bajo_geo := L_nave * H_bajo - A_hoja = m^2'),
  t('WYP, viento hacia +Y: barlovento el muro alto, sotavento el bajo.'),
  m('p_WY_barl := 0.530 kN/m^2'),
  m('p_WY_sot := 0.315 kN/m^2'),
  m('F_WYP := p_WY_barl * A_muro_alto + p_WY_sot * A_muro_bajo = kN'),
  m('F_WYP_SAP := 903.18 kN = kN'),
  m('e_WYP := F_WYP / F_WYP_SAP - 1 ='),
  t('WYN, viento hacia −Y: barlovento el muro BAJO. Con 0,5296 en el muro bajo y 0,3138 en el alto la reacción cierra; con las presiones al revés daría 901,7 kN. cargas.json las ROTULA AL REVÉS («0,313813 barlovento / 0,529559 sotavento»): el número está bien aplicado y la etiqueta está mal.'),
  m('p_WYN_barl := 0.529559 kN/m^2'),
  m('p_WYN_sot := 0.313813 kN/m^2'),
  m('F_WYN := p_WYN_barl * A_muro_bajo + p_WYN_sot * A_muro_alto = kN'),
  m('F_WYN_SAP := 813.74 kN = kN'),
  m('e_WYN := F_WYN / F_WYN_SAP - 1 ='),
  m('F_WYN_rotulo := p_WYN_sot * A_muro_bajo + p_WYN_barl * A_muro_alto = kN'),
  t('La cubierta: cargas.json no declara su presión. Lo que implica la reacción vertical medida, como promedio sobre la proyección:'),
  m('F_WYP_z := 1021.55 kN = kN'),
  m('p_WY_cub := F_WYP_z / A_cub_proy = kN/m^2'),
]);

const wx = cargaSimple('wx', 'WX', 'Viento en ±X (WXP, WXN)', 'F_WX', [
  t('## WX — viento longitudinal, WXP y WXN'),
  t('Tipo SAP: Wind. «Variable por zona» sobre 60 áreas más una uniforme: la distribución no está declarada en ningún lado, solo su resultante. WXN = −WXP componente a componente (v25_basica.py). S-05: la simetría de presiones en X NO está verificada.'),
  t('Lo único que la obra puede contrastar es la resultante medida. El viento en X empuja también en Y (179,34 kN): la distribución no es simétrica respecto del eje de la nave.'),
  m('F_WX := 260.76 kN'),
  m('F_WX_y := 179.34 kN'),
  m('F_WX_z := 603.44 kN'),
  t('Presión media sobre los hastiales que implica la resultante en X, si toda saliera de ellos: área de los dos hastiales trapeciales, sin descontar aberturas.'),
  m('A_hastiales := 2 * B_nave * (H_alto + H_bajo) / 2 = m^2'),
  m('p_WX_med := F_WX / A_hastiales = kN/m^2'),
]);

const wpi = cargaSimple('wpi', 'WPI', 'Presión interna (WPI, WPIN)', 'p_WPI', [
  t('## WPI — presión interna, WPI y WPIN'),
  t('Tipo SAP: Wind. «Variable» sobre 60 áreas más una uniforme, en el eje local 3. WPIN = −WPI (v25_basica.py). Heredada, sin memoria.'),
  t('La presión interna que implica la reacción vertical, si fuera uniforme sobre la cubierta: los muros se equilibran entre sí y solo la cubierta deja resultante vertical. La componente en Y (29,79 kN) dice que en los muros NO es uniforme.'),
  m('F_WPI_z := 909.73 kN'),
  m('p_WPI := F_WPI_z / A_cub_proy = kN/m^2'),
]);

const vientoSprfv = {
  id: 'k-viento-sprfv',
  nombre: 'Viento del modelo contra el sitio',
  hoja: hoja(
    'vsp',
    t('# El viento del modelo, contra la presión dinámica del sitio'),
    t('Los seis patrones de viento (WXP, WXN, WYP, WYN, WPI, WPIN) son HEREDADOS del modelo recibido y no tienen memoria de cálculo. Esta hoja NO los reemplaza: para eso hay que leer la Fig. 4 del CIRSOC 102 (GC_pf de baja altura) y decidir cómo aplica a una cubierta de vertiente única, y la biblioteca no tiene esa genérica (la de viento por caras es NCh432, a dos aguas). Lo que hace es ponerlos en coeficientes, para que se vea qué suponen.'),
    t('q_h sale del nodo de componentes y revestimientos: la misma ec. (13), V = 150 km/h, exposición C, h = 17,2 m. En exposición C los casos 1 y 2 de la Tabla 5 comparten columna, así que vale también para el sistema principal.'),
    m('q_h_s := q_h_CyR = kN/m^2'),
    t('## Coeficientes que implica el modelo'),
    m('GC_WY_barl := p_WY_barl / q_h_s ='),
    m('GC_WY_sot := p_WY_sot / q_h_s ='),
    m('GC_WY_neto := GC_WY_barl + GC_WY_sot ='),
    m('GC_WY_cub := p_WY_cub / q_h_s ='),
    m('GC_WX_med := p_WX_med / q_h_s ='),
    t('## La presión interna no es la de las costaneras'),
    t('Las costaneras se dimensionaron con el edificio PARCIALMENTE CERRADO, GC_pi = ±0,55 (supuesto del 2026-09-16, el D-24 de neumáticos). La presión interna del modelo implica otro valor, que no es ninguno de los dos de la Tabla 7 (±0,18 cerrado, ±0,55 parcialmente cerrado). El mismo edificio está clasificado de dos maneras en dos partes del proyecto.'),
    m('GC_pi_modelo := p_WPI / q_h_s ='),
    m('r_GC_pi := GC_pi_modelo / 0.55 ='),
    t('PENDIENTE para cerrar el viento: leer la Fig. 4 del CIRSOC 102 y su aplicación a vertiente única, fijar GC_pi con la clasificación de aberturas del §5.9, y escribir la memoria que hoy no existe. Con eso esta hoja pasa de «qué supone el modelo» a «qué pide la norma», y los seis patrones dejan de ser heredados.'),
  ),
};

const obra = {
  version: 2,
  id: 'pachon-taller-soldadura',
  nombre: 'Pachón — Taller de soldadura',
  creada: '2026-09-22T15:00:00.000Z',
  modulos: ['cargas'],
  cargas: [dead, sdlCub, sdlMuro, sdlHoja, polvo, lr, nieve, cmCosTecho, cmCosLat, cmVia, clD, clv, clh, cll, wy, wx, wpi, rsx, rsy, cargaEV],
  calculos: [geometria, viento, costaneraTecho, costaneraMuro, contraste, grua, vigaCarrilera, vientoSprfv, espectro],
};

// ── Evaluar y reportar ──────────────────────────────────────────────────────
const saneada = sanearObra(JSON.parse(JSON.stringify(obra)));
const ev = evaluarObra(saneada, genericas);
{
  const inst = ev.importadas.get(idNodoDeCalculo('k-viga-carrilera'));
  console.log('\n== Viga carrilera (genérica)');
  if (!inst) console.log('  NO SE EVALUÓ');
  else {
    for (const e of inst.ev?.errores ?? []) console.log('  ERROR', e.error);
    const s = inst.salidas;
    for (const k of ['I_x', 'S_xc', 'S_xt', 'Z_x', 'M_p', 'M_yc', 'M_yt', 'R_pt', 'Mn_cfy', 'Mn_ltb', 'Mn_tfy', 'M_n', 'L_p', 'L_r', 'Rd_Mx', 'Rd_My', 'S_ytop', 'd_vert', 'dv_ruedas', 'dv_pp', 'lim_vert', 'P_v', 'P_serv', 'H_lat', 'w_pp', 'L', 'a_ruedas', 'R_pc', 'M_rueda', 'M_ux', 'M_uy', 'u_flex', 'u_lat', 'u_H1', 'u_corte', 'u_wly', 'u_wlc', 'u_wsb', 'u_dvert', 'u_dhoriz', 'u_fatiga', 'u_max', 'gobierna', 'v_global'])
      console.log(`  ${k.padEnd(10)} → ${s[k] === undefined ? '—' : motor.formatValor(s[k])}`);
  }
}
let errores = 0;
const todas = [
  ...saneada.calculos.map((k) => [k.nombre, k.hoja]),
  ...saneada.cargas.flatMap((c) => c.subcargas.map((s) => [`${c.nombre} / ${s.nombre}`, s.hoja])),
];
for (const [nombre, h] of todas) {
  console.log(`\n== ${nombre}`);
  for (const r of h) {
    if (r.kind !== 'math') continue;
    const res = ev.results[r.id] ?? {};
    if (res.error) errores++;
    const valor = res.error ? `ERROR ${res.error}` : res.display ?? res.define?.valor ?? JSON.stringify(res).slice(0, 120);
    console.log(`  ${r.src.padEnd(48)} → ${valor}${res.aviso ? `  [aviso: ${res.aviso}]` : ''}`);
  }
}
for (const [id] of ev.repetidos) console.log('REPETIDO', id);
for (const [idNodo, nombre] of ev.etiquetas) {
  const p = motor.problemaDeGrafo(idNodo, ev);
  if (p) console.log(`PROBLEMA en «${nombre}»: ${p}`);
}
console.log('\norden de lectura:', ev.regions.filter((r) => r.id.startsWith('pub:')).map((r) => r.src).join(' | '));
for (const [idNodo, usa] of ev.usos) if (usa.size) console.log(`  ${ev.etiquetas.get(idNodo)} ← ${[...usa].join(', ')}`);
console.log(`\nerrores: ${errores} · repetidos: ${ev.repetidos.size} · ciclos: ${ev.enCiclo.size}`);

const salida = path.join(path.dirname(fileURLToPath(import.meta.url)), 'obra-pachon-taller-soldadura.json');
await writeFile(salida, JSON.stringify(archivoDeObra(obra), null, 2) + '\n', 'utf8');
console.log(`escrito: ${salida}`);
