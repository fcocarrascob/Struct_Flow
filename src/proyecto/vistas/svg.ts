// El dibujo 2D de un modelo geométrico: planta arriba y las dos elevaciones
// debajo, lado a lado.
//
// PURO Y DETERMINISTA: el mismo modelo da el mismo texto, byte a byte, así que
// la pestaña, el papel y el PDF dibujan lo mismo. Es un SVG autocontenido —sin
// fuentes externas ni referencias—, porque viaja dentro de un `<img>` como URI
// `data:` y ahí no puede cargar nada.
//
// Lo que queda dentro del hormigón (barras, estribos, placas de apoyo, la llave
// y el tramo embebido de los pernos) va en trazo discontinuo. Las piezas de una
// verificación que falla van en rojo, con el número de la verificación.

import type { Chequeo, ModeloGeometrico, Pieza, Rol } from './tipos';

const ROJO = '#dc2626';

const ESTILO: Record<Rol, { relleno: string; trazo: string }> = {
  pedestal: { relleno: '#f3f4f6', trazo: '#9ca3af' },
  mortero: { relleno: '#e5e7eb', trazo: '#9ca3af' },
  placa: { relleno: '#9ca3af', trazo: '#4b5563' },
  chapa: { relleno: '#d1d5db', trazo: '#4b5563' },
  nervio: { relleno: '#d1d5db', trazo: '#4b5563' },
  columna: { relleno: '#6b7280', trazo: '#374151' },
  perno: { relleno: '#1f2937', trazo: '#111827' },
  golilla: { relleno: 'none', trazo: '#374151' },
  llave: { relleno: 'none', trazo: '#4b5563' },
  barra: { relleno: 'none', trazo: '#b45309' },
  estribo: { relleno: 'none', trazo: '#d97706' },
};

/** Los roles que en una vista quedan dentro del hormigón o bajo la placa. */
const OCULTOS_PLANTA: ReadonlySet<Rol> = new Set(['barra', 'estribo', 'golilla', 'llave', 'mortero']);
const OCULTOS_ELEV: ReadonlySet<Rol> = new Set(['barra', 'estribo', 'golilla', 'llave']);

type Vista = 'planta' | 'elevX' | 'elevY';

interface Marco {
  /** Origen del dibujo en px y escala px/mm. */
  ox: number;
  oy: number;
  esc: number;
  /** Rango del modelo que se dibuja, en mm: [u0, u1] × [v0, v1]. */
  u0: number;
  v1: number;
}

const n1 = (v: number) => String(Math.round(v * 10) / 10);

/** Las coordenadas de una pieza en la vista: u horizontal, v vertical (mm). */
function caja2d(p: Pieza, vista: Vista): { u0: number; u1: number; v0: number; v1: number } {
  const bbox = (() => {
    if (p.tipo === 'caja') return { x0: p.x0, x1: p.x1, y0: p.y0, y1: p.y1, z0: p.z0, z1: p.z1 };
    if (p.tipo === 'cilindro') return { x0: p.x - p.r, x1: p.x + p.r, y0: p.y - p.r, y1: p.y + p.r, z0: p.z0, z1: p.z1 };
    const pts = p.tipo === 'prisma' ? p.contorno : p.puntos;
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    const z0 = p.tipo === 'prisma' ? p.z0 : p.z - p.r;
    const z1 = p.tipo === 'prisma' ? p.z1 : p.z + p.r;
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z0, z1 };
  })();
  if (vista === 'planta') return { u0: bbox.x0, u1: bbox.x1, v0: bbox.y0, v1: bbox.y1 };
  if (vista === 'elevX') return { u0: bbox.x0, u1: bbox.x1, v0: bbox.z0, v1: bbox.z1 };
  return { u0: bbox.y0, u1: bbox.y1, v0: bbox.z0, v1: bbox.z1 };
}

const px = (m: Marco, u: number) => m.ox + (u - m.u0) * m.esc;
const py = (m: Marco, v: number) => m.oy + (m.v1 - v) * m.esc;

function trazo(p: Pieza, vista: Vista, rojos: ReadonlySet<string>, marco: Marco): string {
  const e = ESTILO[p.rol];
  const rojo = rojos.has(p.id);
  const oculto = (vista === 'planta' ? OCULTOS_PLANTA : OCULTOS_ELEV).has(p.rol);
  const stroke = rojo ? ROJO : e.trazo;
  const fill = rojo && e.relleno !== 'none' ? '#fecaca' : e.relleno;
  const guion = oculto ? ' stroke-dasharray="3 2"' : '';
  const ancho = rojo ? 1.4 : p.rol === 'pedestal' ? 1 : 0.7;
  const attrs = `fill="${fill}" stroke="${stroke}" stroke-width="${ancho}"${guion}`;

  if (vista === 'planta' && p.tipo === 'cilindro') {
    return `<circle cx="${n1(px(marco, p.x))}" cy="${n1(py(marco, p.y))}" r="${n1(Math.max(p.r * marco.esc, 0.8))}" ${attrs}/>`;
  }
  if (vista === 'planta' && (p.tipo === 'prisma' || p.tipo === 'lazo')) {
    const pts = (p.tipo === 'prisma' ? p.contorno : p.puntos).map(([x, y]) => `${n1(px(marco, x))},${n1(py(marco, y))}`).join(' ');
    return `<polygon points="${pts}" ${p.tipo === 'lazo' ? attrs.replace(/fill="[^"]*"/, 'fill="none"') : attrs}/>`;
  }
  // Los estribos en elevación: cada nivel es una línea fina; sus ramas
  // interiores caen encima y solo enturbian el dibujo.
  if (vista !== 'planta' && p.rol === 'estribo') {
    if (p.tipo !== 'lazo') return '';
    const c = caja2d(p, vista);
    const y = n1(py(marco, p.z));
    return `<line x1="${n1(px(marco, c.u0))}" y1="${y}" x2="${n1(px(marco, c.u1))}" y2="${y}" stroke="${stroke}" stroke-width="0.5" stroke-opacity="0.8" stroke-dasharray="3 2"/>`;
  }
  // Un perno en elevación: el tramo embebido oculto, el que asoma a la vista.
  if (vista !== 'planta' && p.tipo === 'cilindro' && p.rol === 'perno') {
    const u = vista === 'elevX' ? p.x : p.y;
    const x = n1(px(marco, u - p.r));
    const w = n1(Math.max(2 * p.r * marco.esc, 0.8));
    const bajo = `<rect x="${x}" y="${n1(py(marco, 0))}" width="${w}" height="${n1((0 - p.z0) * marco.esc)}" fill="none" stroke="${stroke}" stroke-width="${ancho}" stroke-dasharray="3 2"/>`;
    const sobre = `<rect x="${x}" y="${n1(py(marco, p.z1))}" width="${w}" height="${n1(p.z1 * marco.esc)}" fill="${fill}" stroke="${stroke}" stroke-width="${ancho}"/>`;
    return bajo + sobre;
  }
  const c = caja2d(p, vista);
  const w = Math.max((c.u1 - c.u0) * marco.esc, 0.6);
  const h = Math.max((c.v1 - c.v0) * marco.esc, 0.6);
  return `<rect x="${n1(px(marco, c.u0))}" y="${n1(py(marco, c.v1))}" width="${n1(w)}" height="${n1(h)}" ${attrs}/>`;
}

/** Una cota horizontal debajo de un tramo [u0, u1] del modelo, a `v` px. */
function cotaH(m: Marco, u0: number, u1: number, y: number, texto: string): string {
  const a = n1(px(m, u0));
  const b = n1(px(m, u1));
  return (
    `<line x1="${a}" y1="${n1(y)}" x2="${b}" y2="${n1(y)}" stroke="#6b7280" stroke-width="0.6"/>` +
    `<line x1="${a}" y1="${n1(y - 3)}" x2="${a}" y2="${n1(y + 3)}" stroke="#6b7280" stroke-width="0.6"/>` +
    `<line x1="${b}" y1="${n1(y - 3)}" x2="${b}" y2="${n1(y + 3)}" stroke="#6b7280" stroke-width="0.6"/>` +
    `<text x="${n1((px(m, u0) + px(m, u1)) / 2)}" y="${n1(y + 10)}" font-size="8" text-anchor="middle" fill="#374151">${texto}</text>`
  );
}

export interface SvgVistas {
  svg: string;
  ancho: number;
  alto: number;
}

/** El número con coma decimal y sin ceros de más, para los rótulos. */
const rot = (v: number) => n1(v).replace('.', ',');

export function svgVistas(modelo: ModeloGeometrico, ancho = 680): SvgVistas {
  const { piezas } = modelo;
  // Un aviso no vota, y no se pinta en rojo: lo dice la ficha.
  const fallidas = modelo.chequeos.filter((c) => !c.cumple && !c.aviso);
  // En rojo va la pieza culpable de cada verificación —la primera que nombra—,
  // no la de referencia: con el nervio fuera de la placa, lo que está mal es el
  // nervio, y pintar la placa entera taparía todo lo demás.
  const rojos = new Set(fallidas.map((c) => c.piezas[0]).filter(Boolean));
  // En planta basta el primer nivel de estribos: los demás caen encima.
  const enPlanta = piezas.filter((p) => p.rol !== 'estribo' || /^(estribo_1|rama_[xy]_1_\d+)$/.test(p.id));

  const ped = piezas.find((p) => p.rol === 'pedestal');
  if (!ped || ped.tipo !== 'caja') return { svg: '', ancho: 0, alto: 0 };
  const zTop = Math.max(...piezas.map((p) => caja2d(p, 'elevX').v1));
  const margen = 24;

  // ── Planta ──
  const anchoPlanta = ancho - 2 * margen;
  const escP = Math.min(anchoPlanta / (ped.x1 - ped.x0), 300 / (ped.y1 - ped.y0));
  const planta: Marco = { ox: margen + (anchoPlanta - (ped.x1 - ped.x0) * escP) / 2, oy: 28, esc: escP, u0: ped.x0, v1: ped.y1 };
  const altoPlanta = (ped.y1 - ped.y0) * escP;

  // ── Elevaciones, lado a lado ──
  const anchoElev = (ancho - 3 * margen) / 2;
  const altoZ = zTop - ped.z0;
  const escE = Math.min(anchoElev / (ped.x1 - ped.x0), anchoElev / (ped.y1 - ped.y0), 420 / altoZ);
  const yElev = planta.oy + altoPlanta + 48;
  const elevX: Marco = { ox: margen + (anchoElev - (ped.x1 - ped.x0) * escE) / 2, oy: yElev, esc: escE, u0: ped.x0, v1: zTop };
  const elevY: Marco = { ox: 2 * margen + anchoElev + (anchoElev - (ped.y1 - ped.y0) * escE) / 2, oy: yElev, esc: escE, u0: ped.y0, v1: zTop };
  const altoElev = altoZ * escE;

  const partes: string[] = [];
  partes.push(`<text x="${margen}" y="18" font-size="10" font-weight="bold" fill="#111827">Planta</text>`);
  for (const p of enPlanta) partes.push(trazo(p, 'planta', rojos, planta));
  partes.push(cotaH(planta, ped.x0, ped.x1, planta.oy + altoPlanta + 10, `${rot(ped.x1 - ped.x0)} mm`));

  partes.push(`<text x="${margen}" y="${n1(yElev - 10)}" font-size="10" font-weight="bold" fill="#111827">Elevación en X</text>`);
  partes.push(`<text x="${n1(2 * margen + anchoElev)}" y="${n1(yElev - 10)}" font-size="10" font-weight="bold" fill="#111827">Elevación en Y</text>`);
  for (const p of piezas) partes.push(trazo(p, 'elevX', rojos, elevX));
  for (const p of piezas) partes.push(trazo(p, 'elevY', rojos, elevY));
  partes.push(cotaH(elevX, ped.x0, ped.x1, yElev + altoElev + 10, `${rot(ped.x1 - ped.x0)} mm`));
  partes.push(cotaH(elevY, ped.y0, ped.y1, yElev + altoElev + 10, `${rot(ped.y1 - ped.y0)} mm`));

  // ── Marcas de las verificaciones que fallan, sobre la planta ──
  const leyenda: string[] = [];
  fallidas.forEach((c: Chequeo, i) => {
    const p = piezas.find((q) => q.id === c.piezas[0]);
    if (p) {
      const b = caja2d(p, 'planta');
      const x = px(planta, (b.u0 + b.u1) / 2);
      const y = py(planta, b.v1) - 6;
      partes.push(
        `<circle cx="${n1(x)}" cy="${n1(y)}" r="6" fill="${ROJO}"/>` +
          `<text x="${n1(x)}" y="${n1(y + 3)}" font-size="8" font-weight="bold" text-anchor="middle" fill="#ffffff">${i + 1}</text>`,
      );
    }
    leyenda.push(`${i + 1}. ${c.texto}: ${rot(c.valor)} ${c.sentido === '>=' ? '≥' : '≤'} ${rot(c.limite)} ${c.unidad}`.trim());
  });
  let alto = yElev + altoElev + 30;
  leyenda.forEach((t, i) => {
    partes.push(`<text x="${margen}" y="${n1(alto + i * 12)}" font-size="8.5" fill="${ROJO}">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`);
  });
  alto += leyenda.length * 12 + (leyenda.length ? 6 : 0);
  alto = Math.ceil(alto);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" font-family="Helvetica, Arial, sans-serif">` +
    `<rect width="${ancho}" height="${alto}" fill="#ffffff"/>` +
    partes.join('') +
    `</svg>`;
  return { svg, ancho, alto };
}
