// El modelo geométrico de la base de columna: placa, mortero, columna en I, silla
// (ala extendida, nervios y chapa superior), pernos con su placa de apoyo
// embebida, llave en cruz y pedestal con barras y estribos.
//
// Las barras se reparten con la MISMA regla que pedestal-generico —una en cada
// esquina del núcleo y el resto por cara, con los vanos en proporción al largo,
// recorriendo desde la esquina (−ax, −ay) en sentido antihorario—, y la zona
// confinada es la suya: min(max(lado menor, llave + 45°), altura). Si el modelo
// repartiera distinto, las barras que dibuja y cuenta no serían las del P-M.

import type { Caja, Chequeo, Cilindro, Config, Derivado, Lazo, ModeloGeometrico, Pieza, Prisma } from '../tipos';

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Vanos por cara del reparto con esquinas: `nx` en cada cara paralela a X (abajo y
 * arriba), `ny` en la derecha y `nyIzq` en la izquierda, que se lleva el vano de
 * más cuando n es impar. Con n < 4 no hay reparto con esquinas.
 */
export function vanosPorCara(n: number, ax: number, ay: number): { nx: number; ny: number; nyIzq: number } {
  const mitad = Math.floor(n / 2);
  const nx = Math.min(Math.max(Math.round((n / 2) * (ax / (ax + ay))), 1), Math.max(mitad - 1, 1));
  const ny = Math.max(Math.floor((n - 2 * nx) / 2), 1);
  return { nx, ny, nyIzq: n - 2 * nx - ny };
}

/**
 * Posiciones de las barras sobre el perímetro del núcleo, como pedestal-generico:
 * una en cada esquina (ACI 318-25 §25.7.2.3(a); ICH, Manual de Detallamiento,
 * pp. 29-40) y el resto a paso constante en cada cara.
 */
export function barrasPerimetro(n: number, ax: number, ay: number): [number, number][] {
  const { nx, ny, nyIzq } = vanosPorCara(n, ax, ay);
  const q: [number, number][] = [];
  for (let i = 0; i < nx; i++) q.push([-ax + (2 * ax * i) / nx, -ay]);
  for (let i = 0; i < ny; i++) q.push([ax, -ay + (2 * ay * i) / ny]);
  for (let i = 0; i < nx; i++) q.push([ax - (2 * ax * i) / nx, ay]);
  for (let i = 0; i < nyIzq; i++) q.push([-ax, ay - (2 * ay * i) / nyIzq]);
  return q.slice(0, Math.max(n, 0)).map(([x, y]) => [r1(x), r1(y)]);
}

/** Abscisas de los pernos de una fila. */
export function abscisasPernos(n: number, xExt: number): number[] {
  if (n <= 1) return [0];
  const s = (2 * xExt) / (n - 1);
  return Array.from({ length: n }, (_, i) => r1(-xExt + i * s));
}

/** Abscisas de los nervios de un lado, según la disposición declarada. */
export function abscisasNervios(xs: number[], disp: number, luz: number, t: number): number[] {
  if (disp === 2) {
    // Dos por perno, a la luz libre declarada: el perno queda a media luz.
    const a = luz / 2 + t / 2;
    return xs.flatMap((x) => [r1(x - a), r1(x + a)]).sort((p, q) => p - q);
  }
  // Uno entre cada par de pernos contiguos, y uno fuera de cada extremo al mismo paso.
  if (xs.length < 2) return [];
  const s = xs[1] - xs[0];
  const mitades = xs.slice(0, -1).map((x) => r1(x + s / 2));
  return [r1(xs[0] - s / 2), ...mitades, r1(xs[xs.length - 1] + s / 2)];
}

/** Distancia en planta de un punto a un rectángulo (0 si cae dentro). */
function distPuntoRect(px: number, py: number, x0: number, x1: number, y0: number, y1: number) {
  const dx = Math.max(x0 - px, 0, px - x1);
  const dy = Math.max(y0 - py, 0, py - y1);
  return Math.hypot(dx, dy);
}

const caja = (id: string, rol: Pieza['rol'], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Caja => ({
  tipo: 'caja', id, rol,
  x0: r1(Math.min(x0, x1)), x1: r1(Math.max(x0, x1)),
  y0: r1(Math.min(y0, y1)), y1: r1(Math.max(y0, y1)),
  z0: r1(Math.min(z0, z1)), z1: r1(Math.max(z0, z1)),
});

function chequeo(
  id: string,
  texto: string,
  valor: number,
  sentido: '>=' | '<=',
  limite: number,
  unidad: string,
  piezas: string[],
  aviso = false,
): Chequeo {
  const v = r1(valor);
  const l = r1(limite);
  return { id, texto, valor: v, limite: l, sentido, unidad, cumple: sentido === '>=' ? v >= l : v <= l, piezas, ...(aviso ? { aviso } : {}) };
}

/** La base completa, la del Pachón: con silla de nervios y llave en cruz. */
const COMPLETA: Config = { silla: 'nervios', llave: 'cruz' };

/**
 * Cada componente que puede faltar aporta sus piezas, sus verificaciones y sus
 * derivados solo si está; una verificación entre dos componentes (la golilla
 * contra el nervio, la llave contra el perno) existe solo si están los dos. Sin
 * silla, la tuerca del perno aprieta sobre la placa y lo que se comprueba es que
 * su arandela quepa en la placa y no toque el ala.
 */
export function construirBaseColumna(d: Record<string, number>, config: Config = COMPLETA): ModeloGeometrico {
  const piezas: Pieza[] = [];
  const chequeos: Chequeo[] = [];
  const derivados: Derivado[] = [];
  const conSilla = config.silla !== 'no';
  const conLlave = config.llave !== 'no';

  // ── Niveles ──────────────────────────────────────────────────────────────
  const zPlaca0 = d.t_gr;
  const zPlaca1 = d.t_gr + d.t_bp;
  const zNerv1 = conSilla ? zPlaca1 + d.NER_H : zPlaca1;
  const zChapa1 = conSilla ? zNerv1 + d.CH_T : zPlaca1;

  // ── Pedestal, mortero y placa ────────────────────────────────────────────
  piezas.push(caja('pedestal', 'pedestal', -d.PED_X / 2, d.PED_X / 2, -d.PED_Y / 2, d.PED_Y / 2, -d.H_PED, 0));
  piezas.push(caja('mortero', 'mortero', -d.B_bp / 2, d.B_bp / 2, -d.L_bp / 2, d.L_bp / 2, 0, zPlaca0));
  piezas.push(caja('placa', 'placa', -d.B_bp / 2, d.B_bp / 2, -d.L_bp / 2, d.L_bp / 2, zPlaca0, zPlaca1));

  // ── Columna en I: alas perpendiculares a Y, alma según Y ────────────────
  const bf = d.bf_col / 2;
  const hc = d.d_col / 2;
  const hi = hc - d.tf_col;
  const tw = d.tw_col / 2;
  const contornoI: [number, number][] = [
    [-bf, -hc], [bf, -hc], [bf, -hi], [tw, -hi], [tw, hi], [bf, hi],
    [bf, hc], [-bf, hc], [-bf, hi], [-tw, hi], [-tw, -hi], [-bf, -hi],
  ].map(([x, y]) => [r1(x), r1(y)] as [number, number]);
  const columna: Prisma = { tipo: 'prisma', id: 'columna', rol: 'columna', contorno: contornoI, z0: r1(zPlaca1), z1: r1(zChapa1 + 500) };
  piezas.push(columna);

  // ── Silla: ala extendida, nervios y chapa superior, a los dos lados ──────
  const xs = abscisasPernos(d.n_col, d.x_ext);
  const xn = conSilla ? abscisasNervios(xs, d.disp_nerv, d.luz_nerv, d.NER_T) : [];
  const signos = [1, -1] as const;
  for (const sg of conSilla ? signos : []) {
    const lado = sg > 0 ? 'n' : 's';
    const yAla0 = sg * hi;
    const yAla1 = sg * hc;
    if (d.ALA_EXT > d.bf_col) {
      piezas.push(caja(`ala_ext_${lado}_o`, 'chapa', -d.ALA_EXT / 2, -bf, yAla0, yAla1, zPlaca1, zNerv1));
      piezas.push(caja(`ala_ext_${lado}_e`, 'chapa', bf, d.ALA_EXT / 2, yAla0, yAla1, zPlaca1, zNerv1));
    }
    xn.forEach((x, i) =>
      piezas.push(caja(`nervio_${lado}${i + 1}`, 'nervio', x - d.NER_T / 2, x + d.NER_T / 2, sg * hc, sg * (hc + d.NER_L), zPlaca1, zNerv1)),
    );
    piezas.push(caja(`chapa_sup_${lado}`, 'chapa', -d.CH_B / 2, d.CH_B / 2, sg * hc, sg * (hc + d.CH_L), zNerv1, zChapa1));
  }

  // ── Pernos y placas de apoyo embebidas ───────────────────────────────────
  const zGol1 = -d.h_ef;
  const zGol0 = -d.h_ef - d.t_ap;
  const pernos: Cilindro[] = [];
  const golillas: Caja[] = [];
  for (const sg of signos) {
    const lado = sg > 0 ? 'n' : 's';
    xs.forEach((x, i) => {
      const y = sg * d.y_t;
      const p: Cilindro = {
        tipo: 'cilindro', id: `perno_${lado}${i + 1}`, rol: 'perno',
        x, y: r1(y), r: r1(d.d_perno / 2), z0: r1(zGol0 - d.h_tuerca), z1: r1(zChapa1 + d.h_tuerca + d.d_perno / 2),
      };
      pernos.push(p);
      const g = caja(`golilla_${lado}${i + 1}`, 'golilla', x - d.b_ap / 2, x + d.b_ap / 2, y - d.b_ap / 2, y + d.b_ap / 2, zGol0, zGol1);
      golillas.push(g);
    });
  }
  piezas.push(...pernos, ...golillas);

  // ── Llave en cruz ────────────────────────────────────────────────────────
  const llaves = conLlave
    ? [
        caja('llave_y', 'llave', -d.t_sl / 2, d.t_sl / 2, -d.b_sl / 2, d.b_sl / 2, -d.h_sl, zPlaca0),
        caja('llave_x', 'llave', -d.b_sl / 2, d.b_sl / 2, -d.t_sl / 2, d.t_sl / 2, -d.h_sl, zPlaca0),
      ]
    : [];
  piezas.push(...llaves);

  // ── Barras longitudinales ────────────────────────────────────────────────
  const ax = d.PED_X / 2 - d.recub;
  const ay = d.PED_Y / 2 - d.recub;
  const posBarras = barrasPerimetro(d.n_barras, ax, ay);
  const barras: Cilindro[] = posBarras.map(([x, y], i) => ({
    tipo: 'cilindro', id: `barra_${i + 1}`, rol: 'barra',
    x, y, r: r1(d.db_long / 2), z0: r1(-d.H_PED + d.recub_inf), z1: r1(-d.recub_sup),
  }));
  piezas.push(...barras);

  // ── Estribos: el perímetro y las ramas interiores, por nivel ─────────────
  // El eje del estribo pasa por fuera de las barras: recub − db_long/2 − db_est/2 del borde.
  const cEst = d.recub - d.db_long / 2 - d.db_est / 2;
  const ex = d.PED_X / 2 - cEst;
  const ey = d.PED_Y / 2 - cEst;
  const bMin = Math.min(d.PED_X, d.PED_Y);
  // Sin llave, la zona confinada es el lado menor, como el pedestal con h_llave = 0.
  const zpLlave = conLlave ? d.h_sl + (bMin - d.b_sl) / 2 : 0;
  const zp = Math.min(Math.max(bMin, zpLlave), d.H_PED);
  // Hueco para que pase el hormigón: se lee como el §25.2.1 de ACI 318-25 para
  // barras, 25 mm y 4/3 del árido (⁉️ lectura: la placa embebida no es una barra).
  const hueco = Math.max(25, (4 / 3) * d.d_agg);
  const re = d.db_est / 2;
  // El primer estribo, a s1_est de la cara superior; los tres primeros, a sep_cab;
  // de ahí, al paso de la zona confinada mientras no se sale de ella y al del fuste
  // después. Un nivel que caería a la altura de las placas de apoyo embebidas —o a
  // menos del hueco— sube hasta quedar sobre ellas, porque sus ramas las cruzarían; si
  // arriba no cabe, a menos de un hueco del nivel anterior, baja hasta quedar debajo.
  const golSup = d.h_ef - hueco - re;
  const golInf = d.h_ef + d.t_ap + hueco + re;
  const niveles: number[] = [];
  for (let z = d.s1_est; z <= d.H_PED - d.recub_inf; ) {
    const anterior = niveles.length ? -niveles[niveles.length - 1] : -Infinity;
    const zz = z > golSup && z < golInf ? (golSup - anterior >= hueco + 2 * re ? golSup : golInf) : z;
    niveles.push(r1(-zz));
    z = zz + (niveles.length < 3 ? d.sep_cab : zz < zp ? d.sep_zp : d.sep_est);
  }
  // Un nivel abraza las barras solo si queda entero bajo su extremo superior: el que
  // asoma por encima no rodea nada, y no cuenta para los pernos ni para la llave.
  const abraza = (z: number) => -z - d.db_est / 2 >= d.recub_sup - 1e-6;
  // Ramas interiores: sobre las barras de las caras, lo más repartidas posible.
  const nInt = Math.max(d.n_ramas - 2, 0);
  const elegir = (cands: number[], lim: number) => {
    const out: number[] = [];
    for (let k = 1; k <= nInt; k++) {
      const objetivo = -lim + (2 * lim * k) / (nInt + 1);
      const libre = cands.filter((c) => !out.includes(c));
      if (!libre.length) break;
      out.push(libre.reduce((a, b) => (Math.abs(b - objetivo) < Math.abs(a - objetivo) ? b : a)));
    }
    return out.sort((a, b) => a - b);
  };
  const tol = 0.5;
  const enCaraY = posBarras.filter(([x, y]) => Math.abs(Math.abs(y) - ay) < tol && Math.abs(Math.abs(x) - ax) > tol && y > 0).map(([x]) => x);
  const enCaraX = posBarras.filter(([x, y]) => Math.abs(Math.abs(x) - ax) < tol && Math.abs(Math.abs(y) - ay) > tol && x > 0).map(([, y]) => y);
  // Una rama cruza el pedestal entero, así que pasa por el lado de todos los pernos:
  // solo sirven las barras que no la hacen atravesar el fuste de ninguno. Se cruzan
  // como la rama con una barra longitudinal, y se pueden tocar: el hueco del §25.2.1
  // es para barras paralelas (decisión con el usuario, 2026-09-25).
  const lejosDePernos = (c: number, eje: 0 | 1) => pernos.every((p) => Math.abs(c - (eje === 0 ? p.x : p.y)) - re - p.r >= -1e-6);
  const admisiblesX = enCaraY.filter((x) => lejosDePernos(x, 0));
  const admisiblesY = enCaraX.filter((y) => lejosDePernos(y, 1));
  const ramasX = elegir(admisiblesX, ax); // ramas paralelas a Y, en estas abscisas
  const ramasY = elegir(admisiblesY, ay); // ramas paralelas a X, en estas ordenadas
  // Con llave, los primeros niveles pueden ir sin ramas interiores —solo el
  // perimetral—, para que la llave no las cruce.
  const sinRamas = conLlave ? Math.max(0, Math.round(d.n_niv_sin_ramas ?? 0)) : 0;
  const ramas: Caja[] = [];
  niveles.forEach((z, k) => {
    const lazo: Lazo = { tipo: 'lazo', id: `estribo_${k + 1}`, rol: 'estribo', puntos: [[-ex, -ey], [ex, -ey], [ex, ey], [-ex, ey]].map(([a, b]) => [r1(a), r1(b)] as [number, number]), z, r: r1(re) };
    piezas.push(lazo);
    if (k < sinRamas) return;
    ramasX.forEach((x, j) => ramas.push(caja(`rama_x_${k + 1}_${j + 1}`, 'estribo', x - re, x + re, -ey, ey, z - re, z + re)));
    ramasY.forEach((y, j) => ramas.push(caja(`rama_y_${k + 1}_${j + 1}`, 'estribo', -ex, ex, y - re, y + re, z - re, z + re)));
  });
  piezas.push(...ramas);

  // En los niveles de cabeza sin ramas interiores puede ir un amarre en ROMBO,
  // superpuesto al perimetral (ACI 318-25 Fig. R25.7.2.3a): apoya la barra central de
  // cada cara y rodea la llave en cruz sin cruzarla. Sus vértices son esas barras, con
  // el eje del amarre por fuera de ellas.
  const conRombo = sinRamas > 0 && (d.amarre_cab ?? 0) >= 1;
  const rb = d.db_long / 2 + re;
  const centroDe = (cara: [number, number][], eje: 0 | 1) => cara.reduce((a, b) => (Math.abs(b[eje]) < Math.abs(a[eje]) ? b : a));
  const cara = (enX: boolean, signo: 1 | -1) =>
    posBarras.filter(([x, y]) =>
      enX ? Math.abs(x - signo * ax) < tol && Math.abs(Math.abs(y) - ay) > tol : Math.abs(y - signo * ay) < tol && Math.abs(Math.abs(x) - ax) > tol,
    );
  const vertices: [number, number][] = [];
  const barrasRombo: [number, number][] = [];
  if (conRombo) {
    const arriba = centroDe(cara(false, 1), 0);
    const derecha = centroDe(cara(true, 1), 1);
    const abajo = centroDe(cara(false, -1), 0);
    const izquierda = centroDe(cara(true, -1), 1);
    barrasRombo.push(arriba, derecha, abajo, izquierda);
    vertices.push(
      [r1(arriba[0]), r1(arriba[1] + rb)],
      [r1(derecha[0] + rb), r1(derecha[1])],
      [r1(abajo[0]), r1(abajo[1] - rb)],
      [r1(izquierda[0] - rb), r1(izquierda[1])],
    );
    niveles.slice(0, sinRamas).forEach((z, k) => piezas.push({ tipo: 'lazo', id: `rombo_${k + 1}`, rol: 'estribo', puntos: vertices, z, r: r1(re) }));
  }

  // ── Verificaciones ───────────────────────────────────────────────────────
  const sPerno = xs.length > 1 ? xs[1] - xs[0] : Infinity;

  chequeos.push(
    chequeo('v_gol_gol', 'Hueco libre entre placas de apoyo embebidas contiguas', Math.min(sPerno, 2 * d.y_t) - d.b_ap, '>=', hueco, 'mm',
      golillas.slice(0, 2).map((g) => g.id)),
  );

  // Placa de apoyo contra barras longitudinales, en planta.
  let minGB = Infinity;
  let parGB: string[] = [];
  for (const g of golillas)
    for (const b of barras) {
      const dd = distPuntoRect(b.x, b.y, g.x0, g.x1, g.y0, g.y1) - b.r;
      if (dd < minGB) [minGB, parGB] = [dd, [g.id, b.id]];
    }
  chequeos.push(chequeo('v_gol_barra', 'Hueco libre entre placa de apoyo embebida y barra longitudinal', minGB, '>=', hueco, 'mm', parGB));

  // Placa de apoyo dentro del estribo, con hueco hasta su cara interior.
  let minGE = Infinity;
  let gE = '';
  for (const g of golillas) {
    const dd = Math.min(ex - re - g.x1, g.x0 + ex - re, ey - re - g.y1, g.y0 + ey - re);
    if (dd < minGE) [minGE, gE] = [dd, g.id];
  }
  chequeos.push(chequeo('v_gol_estribo', 'Hueco libre entre placa de apoyo embebida y cara interior del estribo', minGE, '>=', hueco, 'mm', [gE, 'estribo_1']));

  chequeos.push(
    chequeo('v_s1_barras', 'Primer estribo entero bajo el extremo superior de las barras, que tiene que abrazar', d.s1_est - d.db_est / 2, '>=', d.recub_sup, 'mm',
      ['estribo_1', 'barra_1']),
  );

  // NCh2369:2025 §9.5.3, adoptado como criterio en cualquier obra: el espaciamiento
  // libre de los tres primeros estribos no pasa de 50 mm, y se lee también desde la
  // cara superior hasta el primero.
  const cabeza = niveles.slice(0, 3).map((z) => -z);
  const libreCab = Math.max(d.s1_est - d.db_est / 2, ...cabeza.slice(1).map((z, i) => z - cabeza[i] - d.db_est));
  chequeos.push(
    chequeo('v_libre_cab', 'Espaciamiento libre de la cara al primer estribo y entre los tres primeros (NCh2369:2025 §9.5.3, como criterio)',
      r1(libreCab), '<=', 50, 'mm', ['estribo_1', 'estribo_2']),
  );

  chequeos.push(
    chequeo('v_hef_ped', 'Recubrimiento bajo la placa de apoyo embebida y su tuerca', d.H_PED - d.h_ef - d.t_ap - d.h_tuerca, '>=', d.recub_inf, 'mm',
      [golillas[0]?.id ?? '', 'pedestal']),
  );

  // Separación libre entre barras longitudinales contiguas: ACI 318-25 §25.2.3.
  let minBB = Infinity;
  let parBB: string[] = [];
  for (let i = 0; i < barras.length; i++) {
    const a = barras[i];
    const b = barras[(i + 1) % barras.length];
    const dd = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
    if (dd < minBB) [minBB, parBB] = [dd, [a.id, b.id]];
  }
  chequeos.push(
    chequeo('v_sep_barras', 'Separación libre entre barras longitudinales (ACI 318-25 §25.2.3)', minBB, '>=', Math.max(40, 1.5 * d.db_long, (4 / 3) * d.d_agg), 'mm', parBB),
  );

  // Cada rama interior de estribo abraza una barra: hacen falta barras en la cara, y
  // que la rama no pase junto a un perno.
  chequeos.push(
    chequeo('v_ramas', 'Barras disponibles para las ramas interiores de estribo, lejos de los pernos, en la cara con menos',
      Math.min(admisiblesX.length, admisiblesY.length), '>=', nInt, '', ['estribo_1']),
  );

  let luzReal = 0;
  if (conSilla) {
    // Silla: el perno y su arandela entre nervios, los nervios sobre el ala extendida y bajo la chapa.
    let minPN = Infinity;
    let parPN: string[] = [];
    xs.forEach((x, i) =>
      xn.forEach((n, j) => {
        const dd = Math.abs(x - n) - d.NER_T / 2 - d.a_tuerca / 2;
        if (dd < minPN) [minPN, parPN] = [dd, [`perno_n${i + 1}`, `nervio_n${j + 1}`]];
      }),
    );
    chequeos.push(chequeo('v_perno_nervio', 'Holgura entre la arandela del perno y el nervio más cercano', minPN, '>=', 0, 'mm', parPN));

    // La luz libre real entre los nervios que flanquean cada perno no supera la declarada.
    xs.forEach((x) => {
      const izq = Math.max(...xn.filter((n) => n < x));
      const der = Math.min(...xn.filter((n) => n > x));
      if (Number.isFinite(izq) && Number.isFinite(der)) luzReal = Math.max(luzReal, der - izq - d.NER_T);
    });
    chequeos.push(chequeo('v_luz_nervio', 'Luz libre real entre nervios que flanquean un perno, contra la declarada', luzReal, '<=', d.luz_nerv, 'mm', ['nervio_n1', 'nervio_n2']));

    const xnMax = xn.length ? Math.max(...xn.map(Math.abs)) + d.NER_T / 2 : 0;
    const nervioExt = xn.length ? `nervio_n${xn.length}` : '';
    chequeos.push(chequeo('v_nervio_ala', 'Nervio extremo sobre el ala extendida', xnMax, '<=', Math.max(d.ALA_EXT, d.bf_col) / 2, 'mm', [nervioExt, 'ala_ext_n_e']));
    chequeos.push(chequeo('v_nervio_placa', 'Nervio extremo dentro de la placa', xnMax, '<=', d.B_bp / 2, 'mm', [nervioExt, 'placa']));
    chequeos.push(chequeo('v_chapa_nervio', 'Chapa superior cubre el nervio extremo', d.CH_B / 2, '>=', xnMax, 'mm', ['chapa_sup_n', nervioExt]));
    chequeos.push(
      chequeo('v_chapa_perno', 'Chapa superior cubre la arandela del perno', hc + d.CH_L, '>=', d.y_t + d.a_tuerca / 2, 'mm', ['chapa_sup_n', 'perno_n1']),
    );
  } else if (d.y_t < hi) {
    // Sin silla y con los pernos dentro del perfil, entre las alas: la arandela
    // aprieta sobre la placa a un lado del alma, sin tocar el alma ni el ala.
    const xMin = Math.min(...xs.map(Math.abs));
    chequeos.push(
      chequeo('v_arandela_alma', 'Holgura entre la arandela del perno y el alma', xMin - d.a_tuerca / 2 - d.tw_col / 2, '>=', 0, 'mm', ['perno_n1', 'columna']),
    );
    chequeos.push(
      chequeo('v_arandela_ala_int', 'Holgura entre la arandela del perno y la cara interior del ala', hi - d.y_t - d.a_tuerca / 2, '>=', 0, 'mm', ['perno_n1', 'columna']),
    );
  } else {
    // Sin silla y con los pernos fuera del perfil: la arandela aprieta sobre la
    // placa, entre el ala y el borde.
    const pExt = `perno_n${xs.length}`;
    chequeos.push(
      chequeo('v_arandela_ala', 'Holgura entre la arandela del perno y la cara del ala', d.y_t - d.a_tuerca / 2 - hc, '>=', 0, 'mm', ['perno_n1', 'columna']),
    );
    chequeos.push(
      chequeo('v_arandela_placa', 'Arandela del perno dentro de la placa, en la dirección más ajustada',
        Math.min(d.L_bp / 2 - d.y_t, d.B_bp / 2 - Math.max(...xs.map(Math.abs))) - d.a_tuerca / 2, '>=', 0, 'mm', [pExt, 'placa']),
    );
  }

  if (conLlave) {
    // Llave: lejos de los pernos, y dentro del estribo.
    let minLP = Infinity;
    let parLP: string[] = [];
    for (const p of pernos)
      for (const l of llaves) {
        const dd = distPuntoRect(p.x, p.y, l.x0, l.x1, l.y0, l.y1) - p.r;
        if (dd < minLP) [minLP, parLP] = [dd, [p.id, l.id]];
      }
    chequeos.push(chequeo('v_llave_perno', 'Hueco libre entre la llave y el perno más cercano', minLP, '>=', hueco, 'mm', parLP));
    chequeos.push(
      chequeo('v_llave_ped', 'Llave dentro de la cara interior del estribo', Math.min(ex, ey) - re - d.b_sl / 2, '>=', 0, 'mm', ['llave_x', 'estribo_1']),
    );
    // Las ramas interiores que cruzan la llave en planta: tienen que pasar por debajo
    // de su fondo, con el hueco para el hormigón.
    let minLR = Infinity;
    let parLR: string[] = [];
    for (const r of ramas)
      for (const l of llaves) {
        const cruzaEnPlanta = r.x0 < l.x1 && l.x0 < r.x1 && r.y0 < l.y1 && l.y0 < r.y1;
        if (!cruzaEnPlanta) continue;
        const dd = l.z0 - r.z1;
        if (dd < minLR) [minLR, parLR] = [dd, [r.id, l.id]];
      }
    if (Number.isFinite(minLR)) {
      chequeos.push(chequeo('v_llave_ramas', 'Hueco libre entre el fondo de la llave y la rama interior de estribo que la cruza en planta', minLR, '>=', hueco, 'mm', parLR));
    }
    if (conRombo) {
      // Las ramas del rombo, en planta, lejos de las chapas de la llave.
      let minRL = Infinity;
      for (let i = 0; i < 4; i++) {
        const [a, b] = [vertices[i], vertices[(i + 1) % 4]];
        for (let s = 0; s <= 200; s++) {
          const px = a[0] + ((b[0] - a[0]) * s) / 200;
          const py = a[1] + ((b[1] - a[1]) * s) / 200;
          for (const l of llaves) minRL = Math.min(minRL, distPuntoRect(px, py, l.x0, l.x1, l.y0, l.y1) - re);
        }
      }
      chequeos.push(chequeo('v_rombo_llave', 'Hueco libre en planta entre las ramas del rombo y la llave', minRL, '>=', hueco, 'mm', ['rombo_1', 'llave_x']));
    }
  }
  // Los pernos atraviesan todos los niveles de estribo: en planta, ninguna rama
  // interior ni el rombo pueden pasar a menos del hueco del fuste. Se recorre en el
  // orden de los niveles, así que la pieza que se nombra es la del primero, la que
  // se dibuja en planta.
  const dSeg = (x: number, y: number, a: [number, number], b: [number, number]) => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
  };
  const rombos = piezas.filter((p): p is Lazo => p.tipo === 'lazo' && p.id.startsWith('rombo_'));
  let minEP = Infinity;
  let parEP: string[] = [];
  for (const p of pernos) {
    for (const r of ramas) {
      const dd = distPuntoRect(p.x, p.y, r.x0, r.x1, r.y0, r.y1) - p.r;
      if (dd < minEP) [minEP, parEP] = [dd, [r.id, p.id]];
    }
    for (const l of rombos) {
      const dd = Math.min(...l.puntos.map((a, i) => dSeg(p.x, p.y, a, l.puntos[(i + 1) % l.puntos.length]))) - l.r - p.r;
      if (dd < minEP) [minEP, parEP] = [dd, [l.id, p.id]];
    }
  }
  if (Number.isFinite(minEP)) {
    chequeos.push(chequeo('v_estribo_perno', 'Hueco libre en planta entre una rama interior de estribo, o el rombo, y el perno más cercano: se cruzan y no pueden atravesarse', r1(minEP), '>=', 0, 'mm', parEP));
  }
  // Una rama a la altura de una placa de apoyo embebida no puede cruzarla: el hueco
  // que cuenta es el mayor entre el de planta y el de altura.
  let minRG = Infinity;
  let parRG: string[] = [];
  for (const g of golillas)
    for (const r of ramas) {
      const enPlanta = Math.hypot(Math.max(g.x0 - r.x1, 0, r.x0 - g.x1), Math.max(g.y0 - r.y1, 0, r.y0 - g.y1));
      const enAltura = Math.max(g.z0 - r.z1, 0, r.z0 - g.z1);
      const dd = Math.max(enPlanta, enAltura);
      if (dd < minRG) [minRG, parRG] = [dd, [g.id, r.id]];
    }
  if (Number.isFinite(minRG)) {
    chequeos.push(chequeo('v_rama_golilla', 'Hueco libre entre una rama interior de estribo y la placa de apoyo embebida, en planta o en altura', r1(minRG), '>=', hueco, 'mm', parRG));
  }
  if (conRombo) {
    // ACI 318-25 §25.7.2.3(a): el ángulo interior del amarre en cada barra que apoya.
    const angulos = vertices.map((v, i) => {
      const p = vertices[(i + 3) % 4];
      const n = vertices[(i + 1) % 4];
      const u = [p[0] - v[0], p[1] - v[1]];
      const w = [n[0] - v[0], n[1] - v[1]];
      return (Math.acos((u[0] * w[0] + u[1] * w[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(w[0], w[1]))) * 180) / Math.PI;
    });
    chequeos.push(chequeo('v_rombo_angulo', 'Ángulo interior del rombo en la barra que apoya (ACI 318-25 §25.7.2.3(a))', Math.max(...angulos), '<=', 135, 'deg', ['rombo_1']));
  }

  // ACI 318-25 §25.7.2.3(a), y el ICH (Manual de Detallamiento, §5.5 y Fig. 5): ninguna
  // barra sin apoyo lateral a más de 150 mm libres, a lo largo de la cara, de una que lo
  // tenga. Tienen apoyo las esquinas del perimetral y las barras de cara que abraza una
  // rama interior o, en los niveles de cabeza, el rombo.
  const esquina = ([x, y]: [number, number]) => Math.abs(Math.abs(x) - ax) < tol && Math.abs(Math.abs(y) - ay) < tol;
  const libreMax = (apoyada: (b: [number, number]) => boolean) => {
    let peor = 0;
    let par: string[] = [];
    const caras: [number, number][][] = [cara(false, -1), cara(true, 1), cara(false, 1), cara(true, -1)];
    const esquinas = posBarras.filter(esquina);
    caras.forEach((c, i) => {
      const eje = i % 2 === 0 ? 0 : 1;
      // La cara con sus dos esquinas, ordenada a lo largo de ella.
      const extremos = esquinas.filter(([x, y]) => (eje === 0 ? Math.abs(y - c[0]?.[1]) < tol : Math.abs(x - c[0]?.[0]) < tol));
      const fila = [...extremos, ...c].sort((a, b) => a[eje] - b[eje]);
      const conApoyo = fila.filter((b) => esquina(b) || apoyada(b));
      for (const b of fila) {
        if (esquina(b) || apoyada(b)) continue;
        const cerca = conApoyo.reduce((m, a) => Math.min(m, Math.abs(a[eje] - b[eje])), Infinity) - d.db_long;
        if (cerca > peor) {
          peor = cerca;
          par = [`barra_${posBarras.findIndex(([x, y]) => x === b[0] && y === b[1]) + 1}`];
        }
      }
    });
    return { peor, par };
  };
  const enRama = ([x, y]: [number, number]) =>
    (Math.abs(Math.abs(y) - ay) < tol && ramasX.some((r) => Math.abs(r - x) < tol)) ||
    (Math.abs(Math.abs(x) - ax) < tol && ramasY.some((r) => Math.abs(r - y) < tol));
  const normal = libreMax(enRama);
  chequeos.push(
    chequeo('v_amarre_150', 'Mayor distancia libre de una barra sin apoyo lateral a la apoyada más cercana, en un nivel con ramas interiores (ACI 318-25 §25.7.2.3(a))',
      normal.peor, '<=', 150, 'mm', normal.par.length ? normal.par : ['estribo_1']),
  );
  if (sinRamas > 0) {
    const cab = libreMax((b) => barrasRombo.some(([x, y]) => x === b[0] && y === b[1]));
    chequeos.push(
      chequeo('v_amarre_150_cab',
        `Mayor distancia libre de una barra sin apoyo lateral a la apoyada más cercana, en los niveles de cabeza ${conRombo ? 'con el rombo' : 'con solo el perimetral'}: ` +
          'son amarres adicionales a los obligatorios, así que no vota (ACI 318-25 §25.7.2.3(a))',
        cab.peor, '<=', 150, 'mm', cab.par.length ? cab.par : ['estribo_1'], true),
    );
  }

  // ── Derivados ────────────────────────────────────────────────────────────
  // Barras a menos de 0,5·h_ef de algún perno traccionado, en planta. Con la placa
  // de momento tracciona la fila y > 0; con la rotulada, el arranque es concéntrico
  // (DG1 §4.3.2) y traccionan las dos.
  const rotulada = config.placa === 'rotulada';
  const filaT = rotulada ? pernos : pernos.filter((p) => p.y > 0);
  const cont = barras.filter((b) => filaT.some((p) => Math.hypot(b.x - p.x, b.y - p.y) <= 0.5 * d.h_ef + 1e-6));
  derivados.push({
    nombre: 'n_cont',
    valor: cont.length,
    unidad: '',
    criterio: rotulada
      ? 'barras longitudinales a menos de 0,5·h_ef de algún perno, de cualquiera de las dos filas, que traccionan juntas con la placa rotulada; medido en planta entre ejes'
      : 'barras longitudinales a menos de 0,5·h_ef de algún perno de la fila traccionada, medido en planta entre ejes',
  });
  // El largo de cada barra contable a los dos lados de la superficie de falla del
  // cono, para su desarrollo (ACI 318-25 §17.5.2.1.1(a)). El cono sube a 35° desde la
  // cabeza del perno, así que a r del perno en planta la superficie está a
  // h_ef − r/1,5 de la cara. Arriba, la barra llega a recub_sup de la cara; abajo sigue
  // dentro de la zapata hasta recub_zap de su fondo. Manda la barra con menos largo.
  // Sin barras contables, los dos largos valen cero: no hay armadura que desarrollar.
  const cruce = cont.map((b) => d.h_ef - Math.min(...filaT.map((p) => Math.hypot(b.x - p.x, b.y - p.y))) / 1.5);
  derivados.push({
    nombre: 'l_sup_anc',
    valor: cruce.length ? r1(Math.min(...cruce) - d.recub_sup) : 0,
    unidad: 'mm',
    criterio: 'menor largo de una barra contable sobre la superficie de falla del cono (35°), hasta su extremo superior',
  });
  derivados.push({
    nombre: 'l_inf_anc',
    valor: cruce.length ? r1(d.H_PED + d.h_zap - d.recub_zap - Math.max(...cruce)) : 0,
    unidad: 'mm',
    criterio: 'menor largo de una barra contable bajo la superficie de falla del cono, siguiendo dentro de la zapata hasta su recubrimiento',
  });
  let pasoMin = Infinity;
  for (let i = 0; i < barras.length; i++) {
    const a = barras[i];
    const b = barras[(i + 1) % barras.length];
    pasoMin = Math.min(pasoMin, Math.hypot(a.x - b.x, a.y - b.y));
  }
  derivados.push({
    nombre: 'c_b_long',
    valor: r1(Math.min(d.recub, pasoMin / 2)),
    unidad: 'mm',
    criterio: 'c_b de las barras longitudinales: el menor entre el recubrimiento al eje y la mitad de la separación entre ejes (ACI 318-25 §25.4.2.4)',
  });
  if (conSilla) {
    derivados.push({ nombre: 'luz_real', valor: r1(luzReal), unidad: 'mm', criterio: 'luz libre mayor entre los nervios que flanquean un perno' });
    derivados.push({ nombre: 'x_nerv_real', valor: r1(xn.length ? Math.max(...xn.map(Math.abs)) : 0), unidad: 'mm', criterio: 'posición del eje del nervio extremo' });
  }
  derivados.push({
    nombre: 'zp_ped',
    valor: r1(zp),
    unidad: 'mm',
    criterio: conLlave ? 'zona confinada: min(max(lado menor, llave + 45°), altura), como el pedestal' : 'zona confinada sin llave: min(lado menor, altura), como el pedestal',
  });
  derivados.push({
    nombre: 'sep_libre_cab',
    valor: r1(libreCab),
    unidad: 'mm',
    criterio: 'mayor espaciamiento libre de la cara superior al primer estribo y entre los tres primeros (NCh2369:2025 §9.5.3)',
  });
  // Estribos a no más de 125 mm de la cara superior: son los que confinan los pernos
  // (ACI 318-25 §10.7.6.1.5), y tienen que rodear las barras.
  derivados.push({
    nombre: 'n_est_cab',
    valor: niveles.filter((z) => -z <= 125 + 1e-6 && abraza(z)).length,
    unidad: '',
    criterio: 'niveles de estribo a no más de 125 mm de la cara superior que abrazan las barras, los que confinan los pernos (ACI 318-25 §10.7.6.1.5)',
  });
  if (conLlave) {
    // Ramas por dirección de cada nivel. El plano de falla corta dos de las cuatro
    // ramas del rombo, y cada una aporta a una dirección la fracción cos² de su ángulo
    // con ella: a 45°, media rama a cada dirección, y el rombo entero una rama más por
    // dirección (⁉️ lectura: ACI 318-25 Fig. R17.5.2.1b(i) admite horquillas
    // inclinadas sin dar factor). El perimetral, con sus dos ramas. Las ramas
    // interiores paralelas a X resisten el corte en X.
    const proy = (eje: 0 | 1) =>
      conRombo
        ? 2 + vertices.reduce((s, v, i) => {
            const w = vertices[(i + 1) % 4];
            return s + ((w[eje] - v[eje]) / Math.hypot(w[0] - v[0], w[1] - v[1])) ** 2;
          }, 0) / 2
        : 2;
    const cabX = Math.round(proy(0) * 100) / 100;
    const cabY = Math.round(proy(1) * 100) / 100;
    const deCab = conRombo ? 'las 2 del perimetral más las 2 del rombo que corta el plano de falla, cada una por el cos² de su ángulo' : 'las 2 del perimetral';
    derivados.push({ nombre: 'ramas_cab_x', valor: cabX, unidad: '', criterio: `ramas por dirección X de un nivel de cabeza: ${deCab}` });
    derivados.push({ nombre: 'ramas_cab_y', valor: cabY, unidad: '', criterio: `ramas por dirección Y de un nivel de cabeza: ${deCab}` });
    // Estribos cerrados equivalentes que cortan el sólido de falla de la llave: los
    // niveles hasta zp_llave, cada uno con las ramas de su dirección menor, a dos
    // ramas por estribo. Es lo que cuenta la llave (n_est_sl).
    const nEst = niveles
      .map((z, k) => ({ z, k }))
      .filter(({ z }) => -z <= zpLlave + 1e-6 && abraza(z))
      .reduce((s, { k }) => s + (k < sinRamas ? Math.min(cabX, cabY) : 2 + Math.min(ramasX.length, ramasY.length)) / 2, 0);
    derivados.push({
      nombre: 'n_est_ll',
      valor: Math.round(nEst * 100) / 100,
      unidad: '',
      criterio: 'estribos cerrados equivalentes en la zona de la llave: los niveles hasta zp_llave que abrazan las barras, con las ramas de su dirección menor, a dos por estribo',
    });
  }
  if (conRombo) {
    // h_x del nivel de cabeza: la mayor distancia entre barras apoyadas consecutivas
    // a lo largo del perímetro (las esquinas y las del rombo).
    const apoyadas = posBarras.filter(([x, y]) => (Math.abs(Math.abs(x) - ax) < tol && Math.abs(Math.abs(y) - ay) < tol) || barrasRombo.some(([bx, by]) => bx === x && by === y));
    const orden = apoyadas.map(([x, y]) => ({ x, y, s: posBarras.findIndex(([bx, by]) => bx === x && by === y) })).sort((a, b) => a.s - b.s);
    const hx = orden.reduce((m, p, i) => Math.max(m, Math.hypot(orden[(i + 1) % orden.length].x - p.x, orden[(i + 1) % orden.length].y - p.y)), 0);
    derivados.push({ nombre: 'hx_cab', valor: r1(hx), unidad: 'mm', criterio: 'mayor distancia entre barras apoyadas consecutivas en un nivel de cabeza con rombo (ACI 318-25 §18.7.5.2(e) pide no más de 350 mm)' });
  }
  if (conLlave) {
    derivados.push({ nombre: 'zp_llave', valor: r1(zpLlave), unidad: 'mm', criterio: 'altura de la llave más la proyección a 45° desde su pie hasta la cara' });
  }

  return { piezas, chequeos, derivados };
}
