// El modelo geométrico de la base de columna: placa, mortero, columna en I, silla
// (ala extendida, nervios y chapa superior), pernos con su placa de apoyo
// embebida, llave en cruz y pedestal con barras y estribos.
//
// Las barras se reparten con la MISMA regla que pedestal-generico —recorrido del
// perímetro del núcleo a paso constante desde la esquina (−ax, −ay)—, y la zona
// confinada es la suya: min(max(lado menor, llave + 45°), altura). Si el modelo
// repartiera distinto, las barras que dibuja y cuenta no serían las del P-M.

import type { Caja, Chequeo, Cilindro, Derivado, Lazo, ModeloGeometrico, Pieza, Prisma } from '../tipos';

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Posiciones de las barras sobre el perímetro del núcleo, como pedestal-generico. */
export function barrasPerimetro(n: number, ax: number, ay: number): [number, number][] {
  const paso = (4 * (ax + ay)) / n;
  const q: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const s = i * paso;
    let x: number;
    let y: number;
    if (s < 2 * ax) [x, y] = [-ax + s, -ay];
    else if (s < 2 * ax + 2 * ay) [x, y] = [ax, -ay + (s - 2 * ax)];
    else if (s < 4 * ax + 2 * ay) [x, y] = [ax - (s - 2 * ax - 2 * ay), ay];
    else [x, y] = [-ax, ay - (s - 4 * ax - 2 * ay)];
    q.push([r1(x), r1(y)]);
  }
  return q;
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
): Chequeo {
  const v = r1(valor);
  const l = r1(limite);
  return { id, texto, valor: v, limite: l, sentido, unidad, cumple: sentido === '>=' ? v >= l : v <= l, piezas };
}

export function construirBaseColumna(d: Record<string, number>): ModeloGeometrico {
  const piezas: Pieza[] = [];
  const chequeos: Chequeo[] = [];
  const derivados: Derivado[] = [];

  // ── Niveles ──────────────────────────────────────────────────────────────
  const zPlaca0 = d.t_gr;
  const zPlaca1 = d.t_gr + d.t_bp;
  const zNerv1 = zPlaca1 + d.NER_H;
  const zChapa1 = zNerv1 + d.CH_T;

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
  const xn = abscisasNervios(xs, d.disp_nerv, d.luz_nerv, d.NER_T);
  const signos = [1, -1] as const;
  for (const sg of signos) {
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
  const llaveY = caja('llave_y', 'llave', -d.t_sl / 2, d.t_sl / 2, -d.b_sl / 2, d.b_sl / 2, -d.h_sl, zPlaca0);
  const llaveX = caja('llave_x', 'llave', -d.b_sl / 2, d.b_sl / 2, -d.t_sl / 2, d.t_sl / 2, -d.h_sl, zPlaca0);
  piezas.push(llaveY, llaveX);

  // ── Barras longitudinales ────────────────────────────────────────────────
  const ax = d.PED_X / 2 - d.recub;
  const ay = d.PED_Y / 2 - d.recub;
  const posBarras = barrasPerimetro(d.n_barras, ax, ay);
  const barras: Cilindro[] = posBarras.map(([x, y], i) => ({
    tipo: 'cilindro', id: `barra_${i + 1}`, rol: 'barra',
    x, y, r: r1(d.db_long / 2), z0: r1(-d.H_PED + d.recub_inf), z1: r1(-d.recub_inf),
  }));
  piezas.push(...barras);

  // ── Estribos: el perímetro y las ramas interiores, por nivel ─────────────
  // El eje del estribo pasa por fuera de las barras: recub − db_long/2 − db_est/2 del borde.
  const cEst = d.recub - d.db_long / 2 - d.db_est / 2;
  const ex = d.PED_X / 2 - cEst;
  const ey = d.PED_Y / 2 - cEst;
  const bMin = Math.min(d.PED_X, d.PED_Y);
  const zpLlave = d.h_sl + (bMin - d.b_sl) / 2;
  const zp = Math.min(Math.max(bMin, zpLlave), d.H_PED);
  const niveles: number[] = [];
  for (let z = 0; ; ) {
    z += z < zp ? d.sep_zp : d.sep_est;
    if (z > d.H_PED - d.recub_inf) break;
    niveles.push(r1(-z));
  }
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
  const ramasX = elegir(enCaraY, ax); // ramas paralelas a Y, en estas abscisas
  const ramasY = elegir(enCaraX, ay); // ramas paralelas a X, en estas ordenadas
  const re = d.db_est / 2;
  niveles.forEach((z, k) => {
    const lazo: Lazo = { tipo: 'lazo', id: `estribo_${k + 1}`, rol: 'estribo', puntos: [[-ex, -ey], [ex, -ey], [ex, ey], [-ex, ey]].map(([a, b]) => [r1(a), r1(b)] as [number, number]), z, r: r1(re) };
    piezas.push(lazo);
    ramasX.forEach((x, j) => piezas.push(caja(`rama_x_${k + 1}_${j + 1}`, 'estribo', x - re, x + re, -ey, ey, z - re, z + re)));
    ramasY.forEach((y, j) => piezas.push(caja(`rama_y_${k + 1}_${j + 1}`, 'estribo', -ex, ex, y - re, y + re, z - re, z + re)));
  });

  // ── Verificaciones ───────────────────────────────────────────────────────
  // Hueco para que pase el hormigón: se lee como el §25.2.1 de ACI 318-25 para
  // barras, 25 mm y 4/3 del árido (⁉️ lectura: la placa embebida no es una barra).
  const hueco = Math.max(25, (4 / 3) * d.d_agg);
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

  // Cada rama interior de estribo abraza una barra: hacen falta barras en la cara.
  chequeos.push(
    chequeo('v_ramas', 'Barras disponibles para las ramas interiores de estribo, en la cara con menos', Math.min(enCaraY.length, enCaraX.length), '>=', nInt, '', ['estribo_1']),
  );

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
  let luzReal = 0;
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

  // Llave: lejos de los pernos, y dentro del estribo.
  let minLP = Infinity;
  let parLP: string[] = [];
  for (const p of pernos)
    for (const l of [llaveY, llaveX]) {
      const dd = distPuntoRect(p.x, p.y, l.x0, l.x1, l.y0, l.y1) - p.r;
      if (dd < minLP) [minLP, parLP] = [dd, [p.id, l.id]];
    }
  chequeos.push(chequeo('v_llave_perno', 'Hueco libre entre la llave y el perno más cercano', minLP, '>=', hueco, 'mm', parLP));
  chequeos.push(
    chequeo('v_llave_ped', 'Llave dentro de la cara interior del estribo', Math.min(ex, ey) - re - d.b_sl / 2, '>=', 0, 'mm', ['llave_x', 'estribo_1']),
  );

  // ── Derivados ────────────────────────────────────────────────────────────
  // Barras a menos de 0,5·h_ef de algún perno de la fila traccionada, en planta.
  const filaT = pernos.filter((p) => p.y > 0);
  const cont = barras.filter((b) => filaT.some((p) => Math.hypot(b.x - p.x, b.y - p.y) <= 0.5 * d.h_ef + 1e-6));
  derivados.push({
    nombre: 'n_cont',
    valor: cont.length,
    unidad: '',
    criterio: 'barras longitudinales a menos de 0,5·h_ef de algún perno de la fila traccionada, medido en planta entre ejes',
  });
  derivados.push({ nombre: 'luz_real', valor: r1(luzReal), unidad: 'mm', criterio: 'luz libre mayor entre los nervios que flanquean un perno' });
  derivados.push({ nombre: 'x_nerv_real', valor: r1(xn.length ? Math.max(...xn.map(Math.abs)) : 0), unidad: 'mm', criterio: 'posición del eje del nervio extremo' });
  derivados.push({ nombre: 'zp_ped', valor: r1(zp), unidad: 'mm', criterio: 'zona confinada: min(max(lado menor, llave + 45°), altura), como el pedestal' });
  derivados.push({ nombre: 'zp_llave', valor: r1(zpLlave), unidad: 'mm', criterio: 'altura de la llave más la proyección a 45° desde su pie hasta la cara' });

  return { piezas, chequeos, derivados };
}
