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

import type { DatosGrafico, DatosReferencia, DatosSerie, Marcador, PosicionLeyenda, Trazo } from './grafico';
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

// ── Dónde van las etiquetas y la leyenda ────────────────────────────────────────
//
// Sin poder medir el texto (en Node no hay DOM), se estima su caja por el número
// de caracteres. Cada etiqueta prueba sitios en orden de preferencia —el primero
// es donde iba siempre— y se queda con el primero que cabe en el área y no pisa
// la leyenda ni otra etiqueta; si ninguno sirve, el primero. Lo que el autor fijó
// (`lado`, `posicion`, `posicionLeyenda`) va donde lo pidió, sin probar nada más.

/** Ancho medio de un carácter de una etiqueta de 10 px. */
const ANCHO_ETIQUETA = 5.6;
/** Salto entre filas cuando dos etiquetas de rectas verticales chocan. */
const PASO_FILA = 13;
/** Filas que se prueban por posición antes de rendirse. */
const FILAS = 6;

type Ancla = 'start' | 'middle' | 'end';
interface Rotulo {
  x: number;
  y: number;
  ancla: Ancla;
}

/** La caja de un texto de 10 px con su línea de base en `y`. */
function cajaDeTexto({ x, y, ancla }: Rotulo, texto: string): Caja {
  const w = texto.length * ANCHO_ETIQUETA;
  const x0 = ancla === 'start' ? x : ancla === 'end' ? x - w : x - w / 2;
  return { x0, y0: y - 9, x1: x0 + w, y1: y + 3 };
}

function solapan(a: Caja, b: Caja): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

function dentro(a: Caja, c: Caja): boolean {
  return a.x0 >= c.x0 - 0.5 && a.x1 <= c.x1 + 0.5 && a.y0 >= c.y0 - 0.5 && a.y1 <= c.y1 + 0.5;
}

/**
 * Los sitios que prueba la etiqueta de una recta, en orden de preferencia. `xr`
 * o `yr` es la recta en píxeles.
 */
function candidatos(r: DatosReferencia, xr: number, yr: number, c: Caja): Rotulo[] {
  const out: Rotulo[] = [];
  if (r.tipo === 'vertical') {
    const preferido = xr < c.x0 + (c.x1 - c.x0) * 0.7 ? 'derecha' : 'izquierda';
    const lados = r.lado ? [r.lado] : [preferido, preferido === 'derecha' ? 'izquierda' : 'derecha'];
    const posiciones = r.posicion ? [r.posicion] : ['arriba', 'abajo', 'medio'];
    for (const p of posiciones) {
      for (let k = 0; k < (r.posicion ? 1 : FILAS); k++) {
        const y = p === 'arriba' ? c.y0 + 12 + k * PASO_FILA : p === 'abajo' ? c.y1 - 4 - k * PASO_FILA : (c.y0 + c.y1) / 2 + k * PASO_FILA;
        for (const lado of lados) {
          out.push(lado === 'derecha' ? { x: xr + 4, y, ancla: 'start' } : { x: xr - 4, y, ancla: 'end' });
        }
      }
    }
  } else {
    const preferido = yr - c.y0 > 16 ? 'arriba' : 'abajo';
    const lados = r.lado ? [r.lado] : [preferido, preferido === 'arriba' ? 'abajo' : 'arriba'];
    const posiciones = r.posicion ? [r.posicion] : ['inicio', 'fin', 'medio'];
    for (const p of posiciones) {
      for (const lado of lados) {
        const y = lado === 'arriba' ? yr - 4 : yr + 12;
        out.push(
          p === 'inicio'
            ? { x: c.x0 + 4, y, ancla: 'start' }
            : p === 'fin'
              ? { x: c.x1 - 4, y, ancla: 'end' }
              : { x: (c.x0 + c.x1) / 2, y, ancla: 'middle' },
        );
      }
    }
  }
  return out;
}

const ESQUINAS: Exclude<PosicionLeyenda, 'auto'>[] = ['arriba-derecha', 'arriba-izquierda', 'abajo-derecha', 'abajo-izquierda'];

function cajaDeLeyenda(esquina: Exclude<PosicionLeyenda, 'auto'>, ancho: number, alto: number, c: Caja): Caja {
  const x0 = esquina.endsWith('derecha') ? c.x1 - ancho - 8 : c.x0 + 8;
  const y0 = esquina.startsWith('arriba') ? c.y0 + 8 : c.y1 - alto - 8;
  return { x0, y0, x1: x0 + ancho, y1: y0 + alto };
}

/**
 * La esquina de la leyenda: la fijada, o la primera —en el orden de `ESQUINAS`,
 * que empieza por la de siempre— que tapa menos curva y menos rectas.
 */
function esquinaDeLeyenda(
  fijada: PosicionLeyenda | undefined,
  ancho: number,
  alto: number,
  c: Caja,
  puntos: [number, number][],
  rectas: { x?: number; y?: number }[],
): Caja {
  if (fijada && fijada !== 'auto') return cajaDeLeyenda(fijada, ancho, alto, c);
  let mejor = cajaDeLeyenda(ESQUINAS[0], ancho, alto, c);
  let menor = Infinity;
  for (const e of ESQUINAS) {
    const k = cajaDeLeyenda(e, ancho, alto, c);
    let tapa = 0;
    for (const [x, y] of puntos) if (x >= k.x0 && x <= k.x1 && y >= k.y0 && y <= k.y1) tapa += 1;
    for (const r of rectas) {
      if (r.x !== undefined && r.x >= k.x0 && r.x <= k.x1) tapa += 20;
      if (r.y !== undefined && r.y >= k.y0 && r.y <= k.y1) tapa += 20;
    }
    if (tapa < menor) {
      menor = tapa;
      mejor = k;
    }
    if (tapa === 0) break;
  }
  return mejor;
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

  // La leyenda se decide antes que las etiquetas, para que ellas la esquiven.
  const conLeyenda = d.leyenda && d.series.length > 0;
  const altoLeyenda = 8 + d.series.length * 16;
  const anchoLeyenda = 12 + 24 + 8 + Math.max(0, ...d.series.map((s) => s.nombre.length)) * 6.2 + 10;
  const rectas = d.referencias.flatMap((r): { x?: number; y?: number }[] =>
    r.tipo === 'vertical' && r.x !== undefined ? [{ x: px(r.x) }] : r.tipo === 'horizontal' && r.y !== undefined ? [{ y: py(r.y) }] : [],
  );
  /** La curva en píxeles: lo que la leyenda y las etiquetas procuran no tapar. */
  const puntos = d.series.flatMap((s) => s.tramos.flatMap((t) => t.map(([x, y]) => [px(x), py(y)] as [number, number])));
  /** Las rectas como cajas finas, para que una etiqueta no quede cruzada por otra recta. */
  const lineas: Caja[] = rectas.map((r) =>
    r.x !== undefined ? { x0: r.x - 1, x1: r.x + 1, y0: T, y1: T + ph } : { x0: L, x1: L + pw, y0: r.y! - 1, y1: r.y! + 1 },
  );
  const leyenda = conLeyenda ? esquinaDeLeyenda(d.posicionLeyenda, anchoLeyenda, altoLeyenda, caja, puntos, rectas) : null;
  const ocupadas: Caja[] = leyenda ? [leyenda] : [];

  // Referencias, bajo las series: son contexto, no el dato.
  for (const r of d.referencias) {
    const estilo = 'stroke="#6b7280" stroke-width="0.8" stroke-dasharray="4 3"';
    let xr = 0;
    let yr = 0;
    if (r.tipo === 'horizontal' && r.y !== undefined) {
      yr = py(r.y);
      if (yr < T - 0.5 || yr > T + ph + 0.5) continue;
      partes.push(`<line x1="${f(L)}" y1="${f(yr)}" x2="${f(L + pw)}" y2="${f(yr)}" ${estilo}/>`);
    } else if (r.tipo === 'vertical' && r.x !== undefined) {
      xr = px(r.x);
      if (xr < L - 0.5 || xr > L + pw + 0.5) continue;
      partes.push(`<line x1="${f(xr)}" y1="${f(T)}" x2="${f(xr)}" y2="${f(T + ph)}" ${estilo}/>`);
    } else {
      continue;
    }
    if (!r.etiqueta) continue;
    const opciones = candidatos(r, xr, yr, caja);
    const libre = (o: Rotulo, estricto: boolean) => {
      const k = cajaDeTexto(o, r.etiqueta);
      if (!dentro(k, caja) || ocupadas.some((x) => solapan(k, x))) return false;
      if (!estricto) return true;
      return !lineas.some((l) => solapan(k, l)) && !puntos.some(([x, y]) => x > k.x0 && x < k.x1 && y > k.y0 && y < k.y1);
    };
    // Primero un sitio que no toque nada; si no lo hay, uno que al menos no pise
    // otra etiqueta ni la leyenda; y si tampoco, el preferido.
    const elegido = opciones.find((o) => libre(o, true)) ?? opciones.find((o) => libre(o, false)) ?? opciones[0];
    ocupadas.push(cajaDeTexto(elegido, r.etiqueta));
    partes.push(
      `<text x="${f(elegido.x)}" y="${f(elegido.y)}" font-size="10" fill="#374151" text-anchor="${elegido.ancla}">${escaparXml(r.etiqueta)}</text>`,
    );
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

  // La leyenda, dentro del área, en la esquina elegida arriba.
  if (leyenda) {
    const x0 = leyenda.x0;
    const y0 = leyenda.y0;
    partes.push(
      `<rect x="${f(x0)}" y="${f(y0)}" width="${f(anchoLeyenda)}" height="${f(altoLeyenda)}" fill="#ffffff" fill-opacity="0.92" stroke="#d1d5db" stroke-width="0.6"/>`,
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
