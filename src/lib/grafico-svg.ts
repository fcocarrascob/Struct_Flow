// ─────────────────────────────────────────────────────────────────────────────
// Un gráfico como SVG, a partir de sus datos ya evaluados.
//
// Puro y determinista: el mismo `DatosGrafico` da siempre la misma cadena, sin
// `Date`, sin azar y sin medir nada —en Node no hay DOM—. Lo usan `BloqueDoc`
// (la hoja y el documento de impresión) y `render-html.ts`, así que los tres
// papeles dibujan byte a byte lo mismo.
//
// Pensado para imprimirse en blanco y negro: las series se distinguen por el
// trazo y el marcador, no solo por el tono de gris. Sin `font-family`: hereda la
// del papel (`.doc-papel`).
// ─────────────────────────────────────────────────────────────────────────────

import type { DatosGrafico, DatosSerie, Marcador, Trazo } from './grafico';
import { escaparXml } from './token';

const TONOS = ['#111827', '#374151', '#4b5563', '#6b7280'];
const DASH: Record<Trazo, string> = {
  continuo: '',
  discontinuo: '6 3',
  punteado: '1.5 2.5',
  'trazo-punto': '8 3 2 3',
};

const TAM_TICK = 10.5;
const TAM_TITULO = 11.5;
/** Ancho medio de un carácter de rótulo, para reservar margen sin poder medir. */
const ANCHO_CARACTER = 6.4;

/** Dos decimales, sin exponente ni ceros de cola: sobra para un píxel. */
function f(n: number): string {
  const s = Number(n.toFixed(2));
  return Object.is(s, -0) ? '0' : String(s);
}

interface Caja {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * El segmento recortado a la caja (Liang–Barsky), o `null` si queda fuera.
 *
 * El recorte va en el código y no en un `clipPath`: un `clipPath` necesita un
 * `id`, y dos gráficos en el mismo documento compartirían el mismo.
 */
function recortar(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  c: Caja,
): [number, number, number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const lados: [number, number][] = [
    [-dx, ax - c.x0],
    [dx, c.x1 - ax],
    [-dy, ay - c.y0],
    [dy, c.y1 - ay],
  ];
  for (const [p, q] of lados) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return [ax + t0 * dx, ay + t0 * dy, ax + t1 * dx, ay + t1 * dy];
}

/** Las polilíneas visibles de un tramo, ya en píxeles y recortadas. */
function polilineas(puntos: [number, number][], c: Caja): [number, number][][] {
  const out: [number, number][][] = [];
  let actual: [number, number][] = [];
  const cerrar = () => {
    if (actual.length > 1) out.push(actual);
    actual = [];
  };
  if (puntos.length === 1) {
    const [x, y] = puntos[0];
    return x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1 ? [[puntos[0]]] : [];
  }
  for (let i = 0; i + 1 < puntos.length; i++) {
    const seg = recortar(puntos[i][0], puntos[i][1], puntos[i + 1][0], puntos[i + 1][1], c);
    if (!seg) {
      cerrar();
      continue;
    }
    const [ax, ay, bx, by] = seg;
    const ultimo = actual[actual.length - 1];
    if (!ultimo || Math.abs(ultimo[0] - ax) > 0.01 || Math.abs(ultimo[1] - ay) > 0.01) {
      cerrar();
      actual.push([ax, ay]);
    }
    actual.push([bx, by]);
  }
  cerrar();
  return out;
}

function marcador(tipo: Marcador, x: number, y: number, color: string): string {
  const r = 3.2;
  const estilo = `fill="#ffffff" stroke="${color}" stroke-width="1.2"`;
  switch (tipo) {
    case 'circulo':
      return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" ${estilo}/>`;
    case 'cuadrado':
      return `<rect x="${f(x - r)}" y="${f(y - r)}" width="${f(2 * r)}" height="${f(2 * r)}" ${estilo}/>`;
    case 'triangulo':
      return `<polygon points="${f(x)},${f(y - r * 1.15)} ${f(x + r)},${f(y + r * 0.75)} ${f(x - r)},${f(y + r * 0.75)}" ${estilo}/>`;
    case 'rombo':
      return `<polygon points="${f(x)},${f(y - r * 1.2)} ${f(x + r)},${f(y)} ${f(x)},${f(y + r * 1.2)} ${f(x - r)},${f(y)}" ${estilo}/>`;
    default:
      return '';
  }
}

function trazo(serie: DatosSerie, color: string): string {
  const dash = DASH[serie.trazo];
  return `fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"${
    dash ? ` stroke-dasharray="${dash}"` : ''
  }`;
}

export function svgDeGrafico(d: DatosGrafico): string {
  const W = d.ancho;
  const H = d.alto;
  const maxRotuloY = Math.max(1, ...d.ejeY.ticks.map((t) => t.rotulo.length));
  const L = 22 + maxRotuloY * ANCHO_CARACTER + 8;
  const R = 14;
  const T = 10;
  const B = 42;
  const pw = W - L - R;
  const ph = H - T - B;
  const caja: Caja = { x0: L, y0: T, x1: L + pw, y1: T + ph };
  const px = (x: number) => L + ((x - d.ejeX.min) / (d.ejeX.max - d.ejeX.min)) * pw;
  const py = (y: number) => T + ph - ((y - d.ejeY.min) / (d.ejeY.max - d.ejeY.min)) * ph;

  const partes: string[] = [];
  partes.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">`,
  );

  // Cuadrícula y ticks.
  for (const t of d.ejeX.ticks) {
    const x = px(t.valor);
    if (d.cuadricula) partes.push(`<line x1="${f(x)}" y1="${f(T)}" x2="${f(x)}" y2="${f(T + ph)}" stroke="#e5e7eb" stroke-width="0.5"/>`);
    partes.push(`<line x1="${f(x)}" y1="${f(T + ph)}" x2="${f(x)}" y2="${f(T + ph + 4)}" stroke="#374151" stroke-width="0.8"/>`);
    partes.push(
      `<text x="${f(x)}" y="${f(T + ph + 16)}" font-size="${TAM_TICK}" fill="#374151" text-anchor="middle">${escaparXml(t.rotulo)}</text>`,
    );
  }
  for (const t of d.ejeY.ticks) {
    const y = py(t.valor);
    if (d.cuadricula) partes.push(`<line x1="${f(L)}" y1="${f(y)}" x2="${f(L + pw)}" y2="${f(y)}" stroke="#e5e7eb" stroke-width="0.5"/>`);
    partes.push(`<line x1="${f(L - 4)}" y1="${f(y)}" x2="${f(L)}" y2="${f(y)}" stroke="#374151" stroke-width="0.8"/>`);
    partes.push(
      `<text x="${f(L - 7)}" y="${f(y)}" dy="0.35em" font-size="${TAM_TICK}" fill="#374151" text-anchor="end">${escaparXml(t.rotulo)}</text>`,
    );
  }
  // El marco del área de trazado.
  partes.push(`<rect x="${f(L)}" y="${f(T)}" width="${f(pw)}" height="${f(ph)}" fill="none" stroke="#374151" stroke-width="0.8"/>`);

  // Títulos de los ejes.
  if (d.ejeX.titulo) {
    partes.push(
      `<text x="${f(L + pw / 2)}" y="${f(H - 7)}" font-size="${TAM_TITULO}" fill="#111827" text-anchor="middle">${escaparXml(d.ejeX.titulo)}</text>`,
    );
  }
  if (d.ejeY.titulo) {
    partes.push(
      `<text transform="translate(13 ${f(T + ph / 2)}) rotate(-90)" font-size="${TAM_TITULO}" fill="#111827" text-anchor="middle">${escaparXml(d.ejeY.titulo)}</text>`,
    );
  }

  // Referencias, bajo las series: son contexto, no el dato.
  for (const r of d.referencias) {
    const estilo = 'stroke="#6b7280" stroke-width="0.8" stroke-dasharray="4 3"';
    if (r.tipo === 'horizontal' && r.y !== undefined) {
      const y = py(r.y);
      if (y < T - 0.5 || y > T + ph + 0.5) continue;
      partes.push(`<line x1="${f(L)}" y1="${f(y)}" x2="${f(L + pw)}" y2="${f(y)}" ${estilo}/>`);
      // A la izquierda: la derecha de arriba es de la leyenda.
      if (r.etiqueta) {
        const arriba = y - T > 16;
        partes.push(
          `<text x="${f(L + 4)}" y="${f(arriba ? y - 4 : y + 12)}" font-size="10" fill="#374151" text-anchor="start">${escaparXml(r.etiqueta)}</text>`,
        );
      }
    } else if (r.tipo === 'vertical' && r.x !== undefined) {
      const x = px(r.x);
      if (x < L - 0.5 || x > L + pw + 0.5) continue;
      partes.push(`<line x1="${f(x)}" y1="${f(T)}" x2="${f(x)}" y2="${f(T + ph)}" ${estilo}/>`);
      if (r.etiqueta) {
        const derecha = x < L + pw * 0.7;
        partes.push(
          `<text x="${f(derecha ? x + 4 : x - 4)}" y="${f(T + 12)}" font-size="10" fill="#374151" text-anchor="${derecha ? 'start' : 'end'}">${escaparXml(r.etiqueta)}</text>`,
        );
      }
    }
  }

  // Las series.
  d.series.forEach((s, i) => {
    const color = TONOS[i % TONOS.length];
    for (const tramo of s.tramos) {
      const enPx = tramo.map(([x, y]) => [px(x), py(y)] as [number, number]);
      for (const linea of polilineas(enPx, caja)) {
        if (linea.length < 2) continue;
        partes.push(`<polyline points="${linea.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" ${trazo(s, color)}/>`);
      }
      if (s.marcador !== 'ninguno') {
        // En una función, unos diez marcadores repartidos; en datos, cada punto
        // hasta 60 y después uno de cada k, para no empastar la curva.
        const n = enPx.length;
        const cada = s.tipo === 'funcion' ? Math.max(1, Math.round(n / 10)) : Math.max(1, Math.ceil(n / 60));
        enPx.forEach(([x, y], k) => {
          if (k % cada !== 0) return;
          if (x < L - 0.5 || x > L + pw + 0.5 || y < T - 0.5 || y > T + ph + 0.5) return;
          partes.push(marcador(s.marcador, x, y, color));
        });
      }
    }
  });

  // Los puntos rotulados, encima de todo.
  for (const r of d.referencias) {
    if (r.tipo !== 'punto' || r.x === undefined || r.y === undefined) continue;
    const x = px(r.x);
    const y = py(r.y);
    if (x < L - 0.5 || x > L + pw + 0.5 || y < T - 0.5 || y > T + ph + 0.5) continue;
    partes.push(`<circle cx="${f(x)}" cy="${f(y)}" r="3" fill="#111827"/>`);
    if (r.etiqueta) {
      const derecha = x < L + pw / 2;
      const arriba = y - T > 18;
      partes.push(
        `<text x="${f(derecha ? x + 6 : x - 6)}" y="${f(arriba ? y - 6 : y + 14)}" font-size="10" fill="#111827" text-anchor="${derecha ? 'start' : 'end'}">${escaparXml(r.etiqueta)}</text>`,
      );
    }
  }

  // La leyenda, dentro del área, arriba a la derecha.
  if (d.leyenda && d.series.length) {
    const alto = 8 + d.series.length * 16;
    const largo = Math.max(...d.series.map((s) => s.nombre.length));
    const ancho = 12 + 24 + 8 + largo * 6.2 + 10;
    const x0 = L + pw - ancho - 8;
    const y0 = T + 8;
    partes.push(
      `<rect x="${f(x0)}" y="${f(y0)}" width="${f(ancho)}" height="${f(alto)}" fill="#ffffff" fill-opacity="0.92" stroke="#d1d5db" stroke-width="0.6"/>`,
    );
    d.series.forEach((s, i) => {
      const color = TONOS[i % TONOS.length];
      const y = y0 + 12 + i * 16;
      const xa = x0 + 10;
      partes.push(`<line x1="${f(xa)}" y1="${f(y)}" x2="${f(xa + 24)}" y2="${f(y)}" ${trazo(s, color)}/>`);
      if (s.marcador !== 'ninguno') partes.push(marcador(s.marcador, xa + 12, y, color));
      partes.push(
        `<text x="${f(xa + 32)}" y="${f(y)}" dy="0.35em" font-size="10" fill="#111827">${escaparXml(s.nombre)}</text>`,
      );
    });
  }

  partes.push('</svg>');
  return partes.join('');
}
