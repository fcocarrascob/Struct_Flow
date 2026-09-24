// La obra del taller de soldadura de El Pachón, AUTOCONTENIDA: calcula y deja
// definidos los valores de carga que se ingresan a SAP2000, sin comparar contra
// ningún modelo existente. Lo que no tiene respaldo va como SUPUESTO.
//
//   node docs/pachon/autocontenida/generar.mjs
//
// Cada valor que se ingresa al modelo está definido en el nodo que lo calcula, y
// el nodo SAP2000 lo contrasta con lo que el modelo tiene asignado: se lee el
// modelo, se ata cada carga a su variable y se ve si coincide. Por eso ya no hay
// un nodo por patrón, ni totales R = q·A, ni un resumen: esas cargas se agrupan
// por lo que son (permanentes, sobrecargas, viento, grúa, sismo), y los grupos
// ordenan la obra. La auditoría contra v44 es otra obra: docs/pachon/auditoria/.
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, '../../..').replace(/\\/g, '/');
process.chdir(REPO);
const { compilarEntrada } = await import(pathToFileURL(`${REPO}/scripts/lib/motor.mjs`).href);
const motor = await compilarEntrada('src/proyecto/obra/engine.ts');
const { evaluarObra, sanearObra, archivoDeObra, idNodoDeCalculo, moduloDeBiblioteca, problemaDeGrafo } = motor;

function generica(rel) {
  const crudo = readFileSync(`${REPO}/public/biblioteca/${rel}`);
  const sha256 = createHash('sha256').update(crudo).digest('hex');
  return { sha256, modulo: moduloDeBiblioteca(JSON.parse(crudo.toString('utf8')), { sha256 }) };
}
const VIGA = generica('acero/viga-carrilera-generica.json');
const genericas = { [VIGA.modulo.id]: { fase: 'lista', modulo: VIGA.modulo } };

// ── Bloques ──────────────────────────────────────────────────────────────────
const m = (src) => ({ kind: 'math', src });
const t = (src) => ({ kind: 'text', src });
// Una función de usuario solo se define en una región `program`.
const p = (lineas) => ({ kind: 'program', src: Array.isArray(lineas) ? lineas.join('\n') : lineas });
// El alto de cada bloque, por exceso: el canvas todavía posiciona, y un bloque
// que crece más que su paso tapa al de abajo.
function alto(b) {
  const redondear = (h) => Math.max(48, Math.ceil(h / 16) * 16);
  if (b.kind === 'math') return b.src.includes('?') ? 80 : 48;
  if (b.kind === 'program') return redondear(b.src.split('\n').length * 20 + 44);
  if (b.src.startsWith('# ')) return 80;
  const lineas = b.src.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 95)), 0);
  return redondear(lineas * 21 + 24);
}
function hoja(prefijo, ...bloques) {
  let y = 40;
  return bloques.map((b, i) => {
    const r = { id: `${prefijo}${String(i + 1).padStart(2, '0')}`, x: 40, y, ...b };
    y += i === 0 && b.kind === 'text' ? Math.max(80, alto(b)) : alto(b);
    return r;
  });
}

// ═════════════════════════════════════════════════════════════ GEOMETRÍA
const geometria = {
  id: 'k-geometria',
  nombre: 'Geometría y sitio',
  hoja: hoja(
    'geo',
    t('# Taller de soldadura — El Pachón'),
    t('Nave industrial con puente grúa de 20/5 t. El Pachón, Calingasta, provincia de San Juan, a unos 3.600 m sobre el nivel del mar. Memoria de las cargas del modelo estructural.'),
    t('## Planta y alturas'),
    t('Nave de 88,0 × 25,4 m en planta, con 11 vanos de 8 m. Cubierta de una sola pendiente entre un alero alto (muro y = 0) y uno bajo (muro y = 25,4).'),
    m('L_nave := 88.0 m'),
    m('B_nave := 25.4 m'),
    m('n_vanos := 11'),
    m('s_marcos := L_nave / n_vanos = m'),
    m('H_alto := 17.2 m'),
    m('H_bajo := 13.4 m'),
    t('Pendiente de la cubierta:'),
    m('alpha_cub := atan((H_alto - H_bajo) / B_nave) * 1 rad = deg'),
    t('Ejes del hastial: y = 0 · 8,5 · 16,9 · 25,4 m. El tramo mayor de costanera de muro es el del hastial.'),
    m('L_hastial := 8.5 m'),
    t('## Portones'),
    t('Tres portones de dos vanos cada uno, sin columna intermedia: dos en el muro alto y uno en el bajo. Cada uno cuelga de un enrejado de transferencia con el cordón inferior a 9,15 m. La hoja ocupa todo el vano.'),
    m('n_port := 3'),
    m('L_port := 2 * s_marcos = m'),
    m('H_port := 9.15 m'),
    m('A_hoja := L_port * H_port = m^2'),
    t('## Superficies'),
    t('Cubierta, en proyección y en verdadera magnitud. Las cargas de gravedad de cubierta se aplican sobre la superficie real, lo que queda del lado seguro en un 1,1 % respecto de la proyección horizontal.'),
    m('A_cub_proy := L_nave * B_nave = m^2'),
    m('A_cub_incl := A_cub_proy / cos(alpha_cub) = m^2'),
    t('Muros: superficie bruta menos los portones.'),
    m('A_muro_alto := L_nave * H_alto - 2 * A_hoja = m^2'),
    m('A_muro_bajo := L_nave * H_bajo - A_hoja = m^2'),
    m('A_hastial := B_nave * (H_alto + H_bajo) / 2 = m^2'),
    m('A_muros := A_muro_alto + A_muro_bajo + 2 * A_hastial = m^2'),
    t('Vía del puente grúa: una viga carrilera por muro largo, a lo largo de toda la nave.'),
    m('L_via := 2 * L_nave = m'),
    t('## Constantes'),
    m('g_0 := 9.80665 m/s^2'),
  ),
};

// ═══════════════════════════════════════════════════════ PERMANENTES
// Un nodo para todas: cada sección es un patrón del modelo, con el valor que el
// nodo SAP2000 contrasta contra lo asignado.
const permanentes = {
  id: 'k-cargas-permanentes',
  nombre: 'Cargas permanentes',
  grupo: 'g-cargas',
  hoja: hoja(
    'per',
    t('# Cargas permanentes'),
    t('## DEAD — peso propio del acero, con sobrepeso por conexiones'),
    t('Modelo: patrón de carga permanente con multiplicador de peso propio. El peso sale de las secciones del modelo.'),
    t('Se incrementa el peso propio en un 30 % para considerar conexiones, placas y elementos no modelados.'),
    m('f_DEAD := 1.3'),
    t('Peso específico del acero: 7.870 kg/m³ (DSC-BCHL-0001-P1 §6.1.1).'),
    m('rho_acero := 7870 kg/m^3'),
    m('gamma_acero := rho_acero * g_0 = kN/m^3'),
    t('## SDL_CUB — revestimiento de cubierta'),
    t('Modelo: patrón de carga permanente. Carga de área sobre los paños de cubierta, repartida a las costaneras, en dirección de la gravedad.'),
    t('Supuesto: revestimiento de cubierta de 10 kgf/m².'),
    m('q_SDL_cub := 10 kgf/m^2 = kN/m^2'),
    t('## SDL_MURO — revestimiento de muro'),
    t('Modelo: patrón de carga permanente. Carga de área sobre los paños de muro y de hastial, en dirección de la gravedad.'),
    t('Supuesto: revestimiento de muro de 10 kgf/m².'),
    m('q_SDL_muro := 10 kgf/m^2 = kN/m^2'),
    t('## SDL_HOJA — peso de las tres hojas de portón'),
    t('Modelo: patrón de carga permanente. Carga lineal sobre los cordones inferiores de los tres enrejados de transferencia, en dirección de la gravedad: el vano del portón no tiene superficie sobre la que repartir el peso.'),
    t('Supuesto: peso de la hoja de portón 0,40 kN/m², a confirmar con los datos del proveedor.'),
    m('q_hoja := 0.40 kN/m^2'),
    m('w_SDL_HOJA := q_hoja * H_port = kN/m'),
    t('## POLVO — acumulación de polvo'),
    t('Modelo: patrón de carga permanente. Paños de cubierta, en dirección de la gravedad.'),
    t('Según DSC-BCHL-0001-P1 §6.1.1, la acumulación de polvo se considera carga permanente de 50 kg/m².'),
    m('q_polvo := 50 kgf/m^2 = kN/m^2'),
    t('## CM_VIA — riel y accesorios'),
    t('Modelo: patrón de carga permanente. Carga lineal sobre las vigas carrileras, en dirección de la gravedad.'),
    t('Supuesto: peso del riel y sus accesorios 0,769 kN/m, a confirmar con los datos del puente grúa.'),
    m('w_CM_VIA := 0.769 kN/m'),
    t('## CM_COS_TECHO y CM_COS_LAT — peso de las costaneras'),
    t('Modelo: patrones de carga permanente, como carga de área sobre los paños de cubierta y de muro: las costaneras no se modelan como barras. Los valores salen de sus nodos, q_COS_techo y q_COS_lat.'),
  ),
};

// ═══════════════════════════════════════════════════════ NIEVE Y TECHO
const sobrecargas = {
  id: 'k-sobrecargas',
  nombre: 'Sobrecarga de techo y nieve',
  grupo: 'g-cargas',
  hoja: hoja(
    'sob',
    t('# Sobrecarga de techo y nieve'),
    t('## LR — sobrecarga de techo'),
    t('Modelo: patrón de sobrecarga de techo. Paños de cubierta, en dirección de la gravedad. No concurre con la nieve (CIRSOC 301, combinación B.2.3).'),
    t('Sobrecarga mínima de techos: 100 kg/m² (DSC-BCHL-0001-P1 §6.1.3).'),
    m('q_LR := 100 kgf/m^2 = kN/m^2'),
    t('## S — nieve balanceada, CIRSOC 104-2005'),
    t('Modelo: patrón de nieve. Paños de cubierta, en dirección de la gravedad, sobre la superficie real.'),
    t('Carga básica de nieve según el criterio de diseño del proyecto (DSC-BCHL-0001-P1 §6.1.5): el sitio, a 3.600 m, queda fuera del alcance del CIRSOC 104.'),
    m('p_g := 800 kgf/m^2 = kN/m^2'),
    t('Factor de exposición: se adopta C_e = 1,00.'),
    m('C_e := 1.00'),
    t('C_t = 1,2, estructura no calefaccionada (Tabla 3). I = 1,0, Categoría II (Tabla 4). C_s = 1,0 para cubierta fría con 8,5° de pendiente (Figura 2.c). Mínimo según el art. 3.4.'),
    m('C_t := 1.20'),
    m('I_nieve := 1.00'),
    m('C_s := 1.00'),
    m('pf_min := I_nieve * 1 kN/m^2'),
    m('p_f := 0.7 * C_e * C_t * I_nieve * p_g = kN/m^2'),
    m('v_pf_min := p_f >= pf_min ='),
    m('p_s := C_s * p_f = kN/m^2'),
    m('p_s_kgf := p_s = kgf/m^2'),
    t('La nieve no balanceada no aplica: el Cap. 6 del CIRSOC 104 no alcanza a las cubiertas de una sola pendiente.'),
  ),
};

// ═══════════════════════════════════════════════════════ VIENTO
// La presión dinámica es una sola para todo el edificio: la usan componentes y
// revestimientos y el sistema principal, y con ella el mismo GC_pi.
const presion = {
  id: 'k-presion-viento',
  nombre: 'Viento — presión dinámica del sitio',
  frontera: {
    procedencia: 'propia',
    formulas: { h_w: 'H_alto', B_n: 'B_nave' },
    publica: { q_h: 'q_h_v', GC_pi: 'GC_pi_v', G_raf: 'G_raf' },
  },
  hoja: hoja(
    'pdv',
    t('# Presión dinámica del viento — CIRSOC 102-2005, §5.10'),
    t('Velocidad básica 150 km/h (DSC-BCHL-0001-P1 §6.1.4), ráfaga de 3 s a 10 m en exposición C. K_d = 0,85 (Tabla 6). I = 1,00, Categoría II (Tabla A-1 y Tabla 1). Exposición C, terreno abierto (art. 5.6): alfa = 9,5 y z_g = 274 m (Tabla 4).'),
    m('V_w := 150 km/h = m/s'),
    m('K_d := 0.85'),
    m('I_w := 1.00'),
    m('alfa_exp := 9.5'),
    m('z_g := 274 m'),
    t('Supuesto: sin efecto topográfico, K_zt = 1,0 (art. 5.7).'),
    m('K_zt := 1.0'),
    t('Con pendiente de cubierta menor o igual que 10° la altura de referencia es la del alero (Cap. 2); se toma el alero alto.'),
    t('K_z según la expresión de la Nota 2 de la Tabla 5, con el mínimo de 5 m. En la altura de referencia se usa la interpolación lineal de la Tabla 5 (Nota 4), que da el valor mayor.'),
    p(['K_z(z) :=',
       '    z_c := max(z, 5 m)',
       '    return 2.01 * (z_c / z_g)^(2 / alfa_exp)']),
    m('K_h := 1.09 + (1.13 - 1.09) * (h_w - 15 m) / (17.5 m - 15 m) ='),
    m('K_h_fc := K_z(h_w) ='),
    t('Presión dinámica, ec. (13) del art. 5.10. Se usa el coeficiente 0,613 de la atmósfera estándar, del lado seguro a la altitud del sitio.'),
    m('q_h := 0.613 kg/m^3 * K_h * K_zt * K_d * V_w^2 * I_w = kN/m^2'),
    p(['q_z(z) :=',
       '    return 0.613 kg/m^3 * K_z(z) * K_zt * K_d * V_w^2 * I_w']),
    m('q_10 := q_z(10 m) = kN/m^2'),
    t('## Ráfaga y presión interna'),
    t('Supuesto: estructura rígida, G = 0,85 (art. 5.8.1); se verifica con la frecuencia fundamental del modelo, que debe ser mayor o igual que 1 Hz.'),
    m('G_raf := 0.85'),
    t('Supuesto: edificio parcialmente cerrado, GC_pi = ±0,55 (Tabla 7). El mismo valor rige para el sistema principal y para los componentes y revestimientos.'),
    m('GC_pi := 0.55'),
  ),
};

const vientoCyR = {
  id: 'k-viento-cyr',
  nombre: 'Viento C&R — CIRSOC 102',
  frontera: {
    procedencia: 'propia',
    formulas: { q_h: 'q_h_v', GC_pi: 'GC_pi_v', h_w: 'H_alto', B_n: 'B_nave', theta: 'alpha_cub', L_c: 's_marcos' },
    publica: { p_suc_cub: 'p_suc_cub', p_muro_CyR: 'p_muro_CyR', s_max: 's_max' },
  },
  hoja: hoja(
    'vcr',
    t('# Viento sobre componentes y revestimientos — CIRSOC 102-2005'),
    t('Presiones de diseño de las costaneras de techo y de muro, art. 5.12.4.1, ec. (18).'),
    t('Condiciones de edificio de baja altura (Cap. 2) y de la Figura 7A, cubiertas de una sola pendiente con 3° < theta ≤ 10°.'),
    m('v_baja_1 := h_w <= 20 m ='),
    m('v_baja_2 := h_w <= B_n ='),
    m('v_fig7A := theta > 3 deg and theta <= 10 deg ='),
    m('a_zona := max(min(0.10 * B_n, 0.4 * h_w), 0.04 * B_n, 1 m) = m'),
    t('Área efectiva: la luz por un ancho no menor que un tercio de la luz (Cap. 2). Separación máxima de costaneras 1,30 m. Para el muro se usa la misma área efectiva, del lado seguro.'),
    m('s_max := 1.30 m'),
    m('A_ef := L_c * max(s_max, L_c / 3) = m^2'),
    t('Cubierta: Figura 7A, zona 3\', la más desfavorable, aplicada a toda la costanera. Muro: Figura 5A, zona 5 de esquina, interpolando en log(A) entre 1 m² y 50 m², con la reducción del 10 % de la Nota 5.'),
    m('GCp_cub := -1.6'),
    m('t_A := min(max(log10(A_ef / (1 m^2)) / log10(50), 0), 1) ='),
    m('GCp_neg := (-1.4 + t_A * (-0.8 + 1.4)) * 0.90 ='),
    m('GCp_pos := (1.0 + t_A * (0.7 - 1.0)) * 0.90 ='),
    t('Ec. (18), p = q_h [(GC_p) − (GC_pi)], con GC_pi en los dos signos y el mínimo neto de 0,5 kN/m² del §1.4.2. Negativo es succión.'),
    m('p_min_CyR := 0.50 kN/m^2'),
    m('p_suc_cub := min(q_h * (GCp_cub - GC_pi), -p_min_CyR) = kN/m^2'),
    m('p_suc_muro := min(q_h * (GCp_neg - GC_pi), -p_min_CyR) = kN/m^2'),
    m('p_emp_muro := max(q_h * (GCp_pos + GC_pi), p_min_CyR) = kN/m^2'),
    m('p_muro_CyR := max(abs(p_emp_muro), abs(p_suc_muro)) = kN/m^2'),
  ),
};

// El sistema principal: Figura 3 y ec. (15), para edificios rígidos de todas las
// alturas. La Fig. 4 de baja altura es para cubiertas a dos aguas.
const vientoSprfv = {
  id: 'k-viento-sprfv',
  nombre: 'Viento SPRFV — CIRSOC 102, Figura 3',
  frontera: {
    procedencia: 'propia',
    formulas: { q_h: 'q_h_v', GC_pi: 'GC_pi_v', G: 'G_raf', h_w: 'H_alto', L_n: 'L_nave', B_n: 'B_nave' },
    publica: {
      p_barl: 'pw_barl', p_lat: 'pw_lat', p_sot_Y: 'pw_sot_Y', p_sot_X: 'pw_sot_X',
      p_Y1: 'pw_cubY_1', p_Y2: 'pw_cubY_2', p_Y3: 'pw_cubY_3',
      p_X1: 'pw_cubX_1', p_X2: 'pw_cubX_2', p_X3: 'pw_cubX_3', p_X4: 'pw_cubX_4',
      b_1: 'bw_1', b_2: 'bw_2', b_Y3: 'bw_Y3', b_X3: 'bw_X3', b_X4: 'bw_X4', p_int: 'pw_int',
    },
  },
  hoja: hoja(
    'vsp',
    t('# Viento sobre el sistema principal — CIRSOC 102-2005, Figura 3'),
    t('Art. 5.12.2.1, edificios rígidos de todas las alturas, ec. (15): p = q·G·C_p − q_i·(GC_pi), con los coeficientes de la Figura 3. Según su Nota 4, en una cubierta de una sola pendiente toda la superficie es de barlovento o de sotavento.'),
    t('Las presiones externas van en los patrones WXP, WXN, WYP y WYN; la interna, en WPI y WPIN, y se suman en las combinaciones (art. 5.12.1.2).'),
    t('La pared de barlovento se carga con q_h en toda su altura, del lado seguro respecto de q_z.'),
    t('## Coeficientes, Figura 3'),
    t('Paredes: barlovento 0,8, laterales −0,7, sotavento según L/B: −0,5 hasta 1, −0,3 en 2 y −0,2 desde 4, con interpolación lineal (Nota 2). B es la dimensión normal al viento y L la paralela (Nota 7).'),
    m('Cp_barl := 0.8'),
    m('Cp_lat := -0.7'),
    p(['Cp_sot(LB) :=',
       '    if LB <= 1',
       '        return -0.5',
       '    else if LB <= 2',
       '        return -0.5 + 0.2 * (LB - 1)',
       '    else if LB <= 4',
       '        return -0.3 + 0.05 * (LB - 2)',
       '    else',
       '        return -0.2']),
    t('Cubierta con theta < 10°, por franjas desde el borde de barlovento. Con h/L ≤ 0,5: −0,9 (0 a h/2), −0,9 (h/2 a h), −0,5 (h a 2h), −0,3 (más de 2h). Con h/L ≥ 1: −1,3 (0 a h/2), −0,7 (más de h/2). Interpolación lineal en h/L. No se aplica la reducción por área del −1,3.'),
    p(['Cp_cub(hL, franja) :=',
       '    c05 := franja == 1 ? -0.9 : (franja == 2 ? -0.9 : (franja == 3 ? -0.5 : -0.3))',
       '    c10 := franja == 1 ? -1.3 : -0.7',
       '    if hL <= 0.5',
       '        return c05',
       '    else if hL >= 1',
       '        return c10',
       '    else',
       '        return c05 + (hL - 0.5) / 0.5 * (c10 - c05)']),
    t('## Viento en Y (WYP, WYN): normal a la cumbrera'),
    t('B = 88 m y L = 25,4 m. La cubierta mide 25,4 m en la dirección del viento, así que entran tres franjas: 0 a h/2, h/2 a h y h a 25,4 m. En WYP el borde de barlovento es el alero alto (muro y = 0); en WYN, el bajo.'),
    m('LB_Y := B_n / L_n ='),
    m('hL_Y := h_w / B_n ='),
    m('b_1 := h_w / 2 = m'),
    m('b_2 := h_w / 2 = m'),
    m('b_Y3 := B_n - h_w = m'),
    m('p_barl := q_h * G * Cp_barl = kN/m^2'),
    m('p_lat := q_h * G * Cp_lat = kN/m^2'),
    m('p_sot_Y := q_h * G * Cp_sot(LB_Y) = kN/m^2'),
    m('p_Y1 := q_h * G * Cp_cub(hL_Y, 1) = kN/m^2'),
    m('p_Y2 := q_h * G * Cp_cub(hL_Y, 2) = kN/m^2'),
    m('p_Y3 := q_h * G * Cp_cub(hL_Y, 3) = kN/m^2'),
    t('## Viento en X (WXP, WXN): paralelo a la cumbrera'),
    t('B = 25,4 m y L = 88 m. Barlovento y sotavento son los hastiales; laterales, los muros largos. La cubierta tiene las cuatro franjas.'),
    m('LB_X := L_n / B_n ='),
    m('hL_X := h_w / L_n ='),
    m('b_X3 := h_w = m'),
    m('b_X4 := L_n - 2 * h_w = m'),
    m('p_sot_X := q_h * G * Cp_sot(LB_X) = kN/m^2'),
    m('p_X1 := q_h * G * Cp_cub(hL_X, 1) = kN/m^2'),
    m('p_X2 := q_h * G * Cp_cub(hL_X, 2) = kN/m^2'),
    m('p_X3 := q_h * G * Cp_cub(hL_X, 3) = kN/m^2'),
    m('p_X4 := q_h * G * Cp_cub(hL_X, 4) = kN/m^2'),
    t('## Presión interna (WPI, WPIN)'),
    t('q_i = q_h, que la ec. (15) permite como valor conservador. Los dos signos (Tabla 7, nota 3). Actúa en la cara interior de TODOS los paños, cubierta y muros.'),
    m('p_int := q_h * GC_pi = kN/m^2'),
    t('Todas las presiones son normales a cada superficie; positivas hacia la superficie (art. 5.12.1.1).'),
    t('## Los patrones de viento en el modelo'),
    t('Presiones de área normales a cada paño, con los valores que publica esta hoja.'),
    t('WYP, viento hacia +Y, normal a la cumbrera. Barlovento: muro alto (y = 0). Sotavento: muro bajo (y = 25,4). Laterales: los dos hastiales. Cubierta: tres franjas desde el alero alto.'),
    t('WYN, viento hacia −Y: los coeficientes de WYP con las caras cambiadas. Barlovento el muro bajo (y = 25,4), sotavento el alto, y las franjas de cubierta medidas desde el alero bajo.'),
    t('WXP, viento hacia +X, paralelo a la cumbrera. Barlovento: hastial x = 0. Sotavento: hastial x = 88. Laterales: los dos muros largos. Cubierta: cuatro franjas desde x = 0.'),
    t('WXN, viento hacia −X: simétrico de WXP, con barlovento en el hastial x = 88 y las franjas desde x = 88.'),
    t('WPI y WPIN, presión interna positiva y negativa: uniforme en la cara interior de todos los paños, hacia afuera en WPI y hacia adentro en WPIN.'),
  ),
};

// ═══════════════════════════════════════════════════════ COSTANERAS
const resistencia = (canal) => [
  t('## Material y constantes (AISC 360-22)'),
  t('Acero ASTM A572 Gr 50. E según §F2 y phi_b según §F1(a).'),
  m('F_y := 344.73789 MPa'),
  m('E_s := 200000 MPa'),
  m('phi_b := 0.90'),
  m('lambda_p_ala := 0.38 * sqrt(E_s / F_y) ='),
  m('lambda_p_alma := 3.76 * sqrt(E_s / F_y) ='),
  m('v_compacta := b_t <= lambda_p_ala and hw_tw <= lambda_p_alma ='),
  t('## Resistencia nominal'),
  m('M_p := F_y * Z_x = kN*m'),
  m('phi_Mn_y := phi_b * min(F_y * Z_y, 1.6 * F_y * S_y) = kN*m'),
  t(canal ? 'Pandeo lateral-torsional, §F2.2. En un canal c sale de F2-8b.' : 'Pandeo lateral-torsional, §F2.2. En un doble T c = 1 (F2-8a).'),
  m('L_p := 1.76 * r_y * sqrt(E_s / F_y) = m'),
  m('r_ts := sqrt(sqrt(I_y * C_w) / S_x) = cm'),
  m(canal ? 'c_F2 := (h_o / 2) * sqrt(I_y / C_w) =' : 'c_F2 := 1'),
  m('jc := J_t * c_F2 / (S_x * h_o) ='),
  m('f_L := 0.7 * F_y'),
  m('L_r := 1.95 * r_ts * (E_s / f_L) * sqrt(jc + sqrt(jc^2 + 6.76 * (f_L / E_s)^2)) = m'),
  t('Las tres ramas de F2, siempre con el tope M_p.'),
  p(['phi_Mn(Cb) :=',
     '    if L_b <= L_p',
     '        M_n := M_p',
     '    else if L_b <= L_r',
     '        M_n := Cb * (M_p - (M_p - f_L * S_x) * (L_b - L_p) / (L_r - L_p))',
     '    else',
     '        esb := L_b / r_ts',
     '        F_cr := Cb * pi^2 * E_s / esb^2 * sqrt(1 + 0.078 * jc * esb^2)',
     '        M_n := F_cr * S_x',
     '    return phi_b * min(M_n, M_p)']),
  t('Cb por F1-1 en cada segmento entre colgadores de una viga biapoyada con carga uniforme; m_r es M(x)/(w L²/8). El segmento central da 1,014: el 1,14 de la viga entera sería del lado inseguro.'),
  p('m_r(u) := 4 * u * (1 - u)'),
  p(['Cb_seg(a, b, M_max) :=',
     '    M_A := m_r(a + (b - a) / 4)',
     '    M_B := m_r((a + b) / 2)',
     '    M_C := m_r(a + 3 * (b - a) / 4)',
     '    return 12.5 * M_max / (2.5 * M_max + 3 * M_A + 4 * M_B + 3 * M_C)']),
  m('Cb_1 := Cb_seg(0, 1/3, m_r(1/3)) ='),
  m('Cb_2 := Cb_seg(1/3, 2/3, 1) ='),
];

const costaneraTecho = {
  id: 'k-cos-techo',
  nombre: 'Costanera de techo — W12x22 c/1,20 m',
  frontera: {
    procedencia: 'propia',
    formulas: {
      L_c: 's_marcos', theta: 'alpha_cub', g_c: 'g_0', p_s: 'p_s', q_LR: 'q_LR', q_polvo: 'q_polvo',
      q_SDL: 'q_SDL_cub', p_suc: 'p_suc_cub', s_tope: 's_max', gamma_ac: 'gamma_acero',
    },
    publica: { q_CM: 'q_COS_techo', DC_max: 'DC_cos_techo' },
  },
  hoja: hoja(
    'ct',
    t('# Costanera de techo — perfil W, AISC 360-22'),
    t('Perfil W12x22 cada 1,20 m, biapoyado entre pórticos.'),
    t('## Disposición'),
    t('Colgadores de barra de 12 mm a los tercios de la luz.'),
    m('s_c := 1.20 m'),
    m('v_s_tope := s_c <= s_tope ='),
    m('n_colg := 3'),
    m('d_colg := 12 mm'),
    m('L_b := L_c / n_colg = m'),
    t('## Perfil W12x22'),
    t('Propiedades geométricas según IRAM-IAS U 500-215-6.'),
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
    t('El polvo es concurrente con la nieve. Nieve y sobrecarga de techo no concurren (CIRSOC 301, combinación B.2.3).'),
    m('w_pp := peso_c * g_c = kN/m'),
    m('w_D := q_SDL * s_c + w_pp + q_polvo * s_c = kN/m'),
    m('w_u := max(1.2 * w_D + 1.6 * p_s * s_c, 1.2 * w_D + 1.6 * q_LR * s_c) = kN/m'),
    t('## Gravedad: flexión biaxial, H1-1b con P_r = 0'),
    t('Supuesto: la cubierta arriostra en forma continua el ala superior comprimida.'),
    m('M_u := w_u * L_c^2 / 8 = kN*m'),
    m('M_ux := M_u * cos(theta)^2 = kN*m'),
    m('M_uy := M_u * cos(theta) * sin(theta) * L_b^2 / L_c^2 = kN*m'),
    m('DC_grav := M_ux / (phi_b * M_p) + M_uy / phi_Mn_y ='),
    t('## Levantamiento: 0,9 D + 1,5 W (B.2.6)'),
    t('Carga permanente mínima, sin polvo. El ala inferior comprimida queda arriostrada por los colgadores.'),
    m('w_up := 1.5 * abs(p_suc) * s_c - 0.9 * (q_SDL * s_c + w_pp) = kN/m'),
    m('M_up := max(w_up, 0 kN/m) * L_c^2 / 8 = kN*m'),
    m('DC_up := max(M_up * m_r(1/3) / phi_Mn(Cb_1), M_up / phi_Mn(Cb_2)) ='),
    t('## Flechas'),
    t('Flecha total L/200 (DSC-BCHL-0001-P1 §7.4.1) y por sobrecarga L/240 (CIRSOC 301, Tabla L.3.1).'),
    m('w_sob := max(p_s, q_LR) * s_c = kN/m'),
    m('f_tot := 5 * (w_D + w_sob) * L_c^4 / (384 * E_s * I_x) = mm'),
    m('f_sob := 5 * w_sob * L_c^4 / (384 * E_s * I_x) = mm'),
    m('v_f_tot := f_tot <= L_c / 200 ='),
    m('v_f_sob := f_sob <= L_c / 240 ='),
    t('## Resultado'),
    m('DC_max := max(DC_grav, DC_up) ='),
    m('v_DC := DC_max <= 1 ='),
    t('Peso que va al patrón CM_COS_TECHO: el perfil por metro de separación más los colgadores.'),
    m('q_colg := (n_colg - 1) * pi * d_colg^2 / 4 * gamma_ac / L_c = kN/m^2'),
    m('q_CM := peso_c * g_c / s_c + q_colg = kN/m^2'),
    m('q_CM_kgf := q_CM = kgf/m^2'),
  ),
};

const costaneraMuro = {
  id: 'k-cos-muro',
  nombre: 'Costanera de muro — C9x13,4 c/1,30 m',
  frontera: {
    procedencia: 'propia',
    formulas: { L_m: 'L_hastial', g_c: 'g_0', q_SDL: 'q_SDL_muro', p_muro: 'p_muro_CyR', s_tope: 's_max' },
    publica: { q_CM: 'q_COS_lat', DC_max: 'DC_cos_muro' },
  },
  hoja: hoja(
    'cm',
    t('# Costanera de muro — canal, AISC 360-22'),
    t('Perfil C9x13,4 cada 1,30 m, verificado en el tramo mayor, el del hastial.'),
    t('## Disposición'),
    m('s_c := 1.30 m'),
    m('v_s_tope := s_c <= s_tope ='),
    m('n_colg := 3'),
    m('L_b := L_m / n_colg = m'),
    t('## Perfil C9x13,4'),
    t('Propiedades geométricas según IRAM-IAS U 500-509-4. En un canal, b/t se mide sobre el ala entera (F6-4).'),
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
    t('El viento de C&R flexiona el eje fuerte; el peso propio y el revestimiento, el débil, sobre el tramo entre colgadores.'),
    m('M_ux := 1.5 * p_muro * s_c * L_m^2 / 8 = kN*m'),
    m('M_uy := 1.2 * (peso_c * g_c + q_SDL * s_c) * L_b^2 / 8 = kN*m'),
    m('DC_max := max(M_ux * m_r(1/3) / phi_Mn(Cb_1), M_ux / phi_Mn(Cb_2)) + M_uy / phi_Mn_y ='),
    m('v_DC := DC_max <= 1 ='),
    t('## Flecha lateral por viento, L/200 del DSC §7.4.1'),
    m('f_w := 5 * p_muro * s_c * L_m^4 / (384 * E_s * I_x) = mm'),
    m('v_f := f_w <= L_m / 200 ='),
    t('## Resultado'),
    t('Peso que va al patrón CM_COS_LAT: el perfil por metro de separación.'),
    m('q_CM := peso_c * g_c / s_c = kN/m^2'),
    m('q_CM_kgf := q_CM = kgf/m^2'),
  ),
};

// ═══════════════════════════════════════════════════════ PUENTE GRÚA
const grua = {
  id: 'k-grua',
  nombre: 'Puente grúa 20/5 t — cargas de rueda',
  hoja: hoja(
    'gru',
    t('# Puente grúa 20/5 t — cargas de rueda, CIRSOC 101 art. 4.14'),
    t('Los datos del puente grúa son supuestos, a confirmar con la información del fabricante.'),
    t('## Datos de la grúa'),
    t('Capacidad nominal 20 t y luz del puente 24,6 m.'),
    m('Q_izada := 20 tonf'),
    m('L_grua := 24.6 m'),
    t('Supuesto: peso del carro y el aparejo 10,01 t.'),
    m('P_carro := 10.01 tonf'),
    t('Supuesto: peso propio del puente 21,24 t.'),
    m('P_puente := 21.24 tonf'),
    t('Supuesto: aproximación mínima del gancho al riel 1,20 m.'),
    m('e_gancho := 1.20 m'),
    t('Supuesto: dos ruedas por riel, separadas 4,00 m.'),
    m('a_r := 4000 mm'),
    t('## Cargas máximas de rueda, sin impacto (4.14.1)'),
    t('Las cargas máximas de rueda incluyen el peso del puente (art. 4.14.1). Riel cargado: la mitad del puente más la carga izada y el carro, con el gancho en su aproximación mínima.'),
    m('P_mov := Q_izada + P_carro = tonf'),
    m('R_riel_max := P_puente / 2 + P_mov * (L_grua - e_gancho) / L_grua = kN'),
    m('R_riel_min := P_puente / 2 + P_mov * e_gancho / L_grua = kN'),
    m('P_max := R_riel_max / 2 = kN'),
    m('P_min := R_riel_min / 2 = kN'),
    m('v_suma := abs(2 * P_max + 2 * P_min - (P_puente + P_mov)) < 0.01 kN ='),
    t('## Factores del art. 4.14'),
    t('Impacto vertical 25 %, grúa operada por control remoto (art. 4.14.2). Fuerza lateral: 20 % de la carga izada más el carro y el aparejo, sin el peso del puente (art. 4.14.3). Fuerza longitudinal: 10 % de las cargas máximas de rueda sin impacto (art. 4.14.4).'),
    m('imp := 0.25'),
    m('pct_bamb := 0.20'),
    m('pct_fren := 0.10'),
    t('## Posiciones del carro'),
    t('Cada familia de cargas de grúa se aplica en cuatro posiciones del carro sobre la viga carrilera: P1 con las ruedas a 1,00 y 5,00 m del apoyo (momento máximo), P2 y P3 con una rueda sobre cada apoyo, y P4 con una rueda junto al apoyo (corte máximo en la viga y reacción máxima sobre la ménsula).'),
    t('## CLV — cargas verticales de rueda, con el impacto dentro del patrón'),
    t('Modelo: un patrón por posición del carro, con 4 cargas puntuales sobre las vigas carrileras, en dirección de la gravedad. El impacto se incluye en el patrón.'),
    m('P_CLV := P_max * (1 + imp) = kN'),
    m('P_CLV_2 := P_min * (1 + imp) = kN'),
    t('## CLH — fuerza transversal de bamboleo (±Y)'),
    t('Modelo: un patrón por posición del carro, 4 cargas puntuales en el tope del riel, en dirección transversal y en los dos sentidos.'),
    t('Supuesto: la fuerza lateral se reparte en partes iguales entre las cuatro ruedas.'),
    m('R_CLH := pct_bamb * P_mov = kN'),
    m('H_CLH := R_CLH / 4 = kN'),
    t('## CLL — fuerza longitudinal de frenado (±X)'),
    t('Modelo: un patrón por posición del carro, 4 cargas puntuales en el tope del riel, en dirección longitudinal y en los dos sentidos. Cada rueda lleva el 10 % de su carga sin impacto.'),
    m('L_CLL := pct_fren * P_max = kN'),
    m('L_CLL_2 := pct_fren * P_min = kN'),
    t('## CL_D — masa del puente grúa, para la fuente de masa'),
    t('El peso del puente está incluido en las cargas de rueda, por lo que no forma parte de la carga permanente. Su masa se incorpora al análisis sísmico como carga repartida a lo largo de las dos vías, incluida solo en la fuente de masa.'),
    m('w_CL_D := P_puente / L_via = kN/m'),
  ),
};

const vigaCarrilera = {
  id: 'k-viga-carrilera',
  nombre: 'Viga carrilera W24x104 + C15x50',
  hoja: [],
  frontera: {
    procedencia: 'biblioteca',
    slug: 'viga-carrilera-generica',
    sha256: VIGA.sha256,
    entradas: {
      Fy: 248.2, E: 200000, phi_b: 0.9, phi_v: 0.9, phi_j10y: 1, phi_j10c: 0.75, phi_wsb: 0.85, k_v: 5.34,
      es_soldada: 0, d: 611, b_f: 324, t_f: 19.05, t_w: 12.7, b_fb: 324, t_fb: 19.05,
      A_W: 19800, I_xW: 1.29e9, I_yW: 1.08e8, J_W: 1.96e6, k_det: 40,
      hay_canal: 1, A_c: 9480, I_cy: 1.68e8, I_cx: 4.58e6, y_cc: 20.3, J_C: 1.1e6, h_tot: 705.5, D_c: 381,
      L: 8000, L_b: 8000, C_b: 1, n_r: 2, P_v: 24.5, P_serv: 19.6, H_lat: 1.5, a_ruedas: 4000, w_pp: 0.31,
      H_riel: 105, restr_rot: 1, ala_compacta: 1, C_f: 12, F_TH: 110, n_SR: 500000, den_vert: 1000, den_lat: 400,
    },
    formulas: {
      L: 's_marcos',
      L_b: 's_marcos',
      P_v: 'P_CLV',
      P_serv: 'P_max',
      H_lat: 'H_CLH',
      a_ruedas: 'a_r',
      // Perfil y canal (un campo atado no puede leer otra entrada de su planilla)
      // más el riel. Sin CL_D: el puente viaja con las ruedas.
      w_pp: '(19800 mm^2 + 9480 mm^2) * gamma_acero + w_CM_VIA',
    },
    publica: { u_max: 'u_via', u_H1: 'u_H1_via', u_corte: 'u_corte_via' },
  },
};

// ═══════════════════════════════════════════════════════ SISMO
const espectro = {
  id: 'k-espectro',
  nombre: 'Espectro CIRSOC 103 — zona 4, sitio S_C',
  frontera: {
    procedencia: 'propia',
    formulas: { g_s: 'g_0' },
    publica: { C_a: 'C_a_sit', gamma_r: 'gamma_r_sit', f_EV: 'f_EV', SF_X: 'SF_RSX', SF_Y: 'SF_RSY', T_2: 'T_2_esp' },
  },
  hoja: hoja(
    'esp',
    t('# Espectro de diseño — CIRSOC 103-P1-2018'),
    t('Espectro reglamentario. En el modelo: una función de espectro en fracciones de g y dos casos de espectro de respuesta, RSX y RSY, con su factor de escala.'),
    t('## Sitio'),
    t('Zona sísmica 4 (departamento de Calingasta, San Juan). Sitio tipo S_C, con V_sm = 450 m/s según el estudio de amenaza sísmica del sitio, dentro de la banda de la Tabla 2.2; Tipo Espectral 1.'),
    m('V_sm := 450 m/s'),
    m('v_S_C := V_sm >= 360 m/s and V_sm <= 760 m/s ='),
    t('Tabla 3.1, Tipo Espectral 1, zona 4: C_a = 0,37·N_a y C_v = 0,51·N_v. Tabla 3.2: T_3 = 13 s.'),
    t('Supuesto: coeficientes de proximidad a fallas N_a = 1,0 y N_v = 1,2, ec. [3.11] y [3.12].'),
    m('N_a := 1.0'),
    m('N_v := 1.2'),
    m('C_a := 0.37 * N_a ='),
    m('C_v := 0.51 * N_v ='),
    m('T_3 := 13 s'),
    m('T_2 := C_v / (2.5 * C_a) * 1 s = s'),
    m('T_1 := 0.2 * T_2 = s'),
    t('Grupo B: gamma_r = 1,0 (art. 2.4.3).'),
    m('gamma_r := 1.0'),
    t('## La función de espectro, en fracciones de g'),
    t('Ecuaciones [3.1] a [3.4].'),
    p(['Sa(T) :=',
       '    if T <= T_1',
       '        return C_a * (1 + 1.5 * T / T_1)',
       '    else if T <= T_2',
       '        return 2.5 * C_a',
       '    else if T <= T_3',
       '        return C_v / (T / (1 s))',
       '    else',
       '        return C_v * (T_3 / (1 s)) / (T / (1 s))^2']),
    m('Sa_meseta := Sa(T_2) ='),
    m('Sa_1s := Sa(1 s) ='),
    t('## Factores de escala de RSX y RSY'),
    t('X: arriostrado concéntrico especial (SCBF), R = 5. Y: pórtico especial no arriostrado (SMF), R = 7. CQC, 5 % de amortiguamiento.'),
    m('R_X := 5'),
    m('R_Y := 7'),
    m('SF_X := g_s * gamma_r / R_X = m/s^2'),
    m('SF_Y := g_s * gamma_r / R_Y = m/s^2'),
    t('## EV: sismo vertical, [3.10]'),
    m('f_EV := C_a / 2 * gamma_r ='),
    t('## Verificaciones posteriores al análisis'),
    t('Con los resultados del modelo se verifican la masa participante (90 %, art. 7.2.3), el corte basal modal contra el 85 % del estático (art. 7.2.5, con escalado si no se alcanza) y la frecuencia fundamental supuesta para el viento.'),
  ),
};

const obra = {
  version: 2,
  id: 'pachon-soldadura',
  nombre: 'Pachón — Taller de soldadura (cargas a SAP)',
  creada: '2026-09-22T20:00:00.000Z',
  // El nodo SAP2000 sin conectar: la obra es autocontenida y no trae la lectura
  // de ningún modelo. Al conectarse se leen sus cargas y se atan a estas variables.
  modulos: ['sap'],
  // En este orden van las franjas de «reordenar».
  grupos: [
    { id: 'g-sitio', nombre: 'Sitio', color: '#0891b2' },
    { id: 'g-cargas', nombre: 'Cargas permanentes y sobrecargas', color: '#65a30d' },
    { id: 'g-viento', nombre: 'Viento', color: '#2563eb' },
    { id: 'g-secundarios', nombre: 'Elementos secundarios', color: '#9333ea' },
    { id: 'g-grua', nombre: 'Puente grúa', color: '#d97706' },
    { id: 'g-sismo', nombre: 'Sismo', color: '#dc2626' },
  ],
  calculos: [
    { ...geometria, grupo: 'g-sitio' },
    permanentes,
    sobrecargas,
    { ...presion, grupo: 'g-viento' },
    { ...vientoCyR, grupo: 'g-viento' },
    { ...vientoSprfv, grupo: 'g-viento' },
    { ...costaneraTecho, grupo: 'g-secundarios' },
    { ...costaneraMuro, grupo: 'g-secundarios' },
    { ...grua, grupo: 'g-grua' },
    { ...vigaCarrilera, grupo: 'g-grua' },
    { ...espectro, grupo: 'g-sismo' },
  ],
};

// ── Evaluar y reportar ──────────────────────────────────────────────────────
const saneada = sanearObra(JSON.parse(JSON.stringify(obra)));
const ev = evaluarObra(saneada, genericas);
let errores = 0;
const todas = saneada.calculos.map((k) => [k.nombre, k.hoja]);
const soloErrores = process.argv.includes('--errores');
for (const [nombre, h] of todas) {
  if (!soloErrores) console.log(`\n== ${nombre}`);
  for (const r of h) {
    if (r.kind !== 'math') continue;
    const res = ev.results[r.id] ?? {};
    if (res.error) errores++;
    if (soloErrores && !res.error) continue;
    const valor = res.error ? `ERROR ${res.error}` : res.define?.valor ?? res.display ?? JSON.stringify(res).slice(0, 100);
    console.log(`  ${r.src.slice(0, 70).padEnd(70)} → ${valor}`);
  }
}
const inst = ev.importadas.get(idNodoDeCalculo('k-viga-carrilera'));
if (inst) {
  for (const e of inst.ev?.errores ?? []) { console.log('  VIGA ERROR', e.error); errores++; }
  const s = inst.salidas;
  console.log(`\n== Viga carrilera: u_max ${motor.formatValor(s.u_max)} · ${s.gobierna} · u_flex ${motor.formatValor(s.u_flex)} · u_lat ${motor.formatValor(s.u_lat)} · u_corte ${motor.formatValor(s.u_corte)} · v_global ${s.v_global}`);
}
for (const [idNodo, nombre] of ev.etiquetas) {
  const pr = problemaDeGrafo(idNodo, ev);
  if (pr) { console.log(`PROBLEMA en «${nombre}»: ${pr}`); errores++; }
}
console.log(`\nerrores: ${errores} · repetidos: ${ev.repetidos.size} · ciclos: ${ev.enCiclo.size}`);

const salida = path.join(AQUI, 'obra-pachon-soldadura.json');
await writeFile(salida, JSON.stringify(archivoDeObra(obra), null, 2) + '\n', 'utf8');
console.log(`escrito: ${salida}`);
