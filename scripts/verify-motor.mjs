#!/usr/bin/env node
// Casos de regresión del motor: hojas mínimas con el resultado que tienen que dar.
//
//   npm run verify:motor
//
// `verify:planillas` comprueba que el corpus siga cuadrando, pero el corpus solo
// ejercita lo que sus autores escribieron. Los fallos de la auditoría del
// 2026-09-10 eran justo lo contrario: formas de escribir que ninguna planilla
// usa y que daban un número equivocado SIN error —un programa que se comía su
// propio cuerpo, una función que alteraba una matriz de la hoja, una
// redefinición fallida que dejaba viva la anterior—. Cada uno queda aquí como
// un caso, para que no vuelva.
//
// Cada caso es una hoja (lista de regiones en orden de lectura) y una
// comprobación que recibe los resultados y devuelve `null` si cuadra o el
// motivo del fallo. Además, todo el LaTeX que emita el motor tiene que
// componerse en KaTeX sin error: un resultado que KaTeX rechaza sale en rojo en
// la hoja aunque el cálculo esté bien.

import katex from 'katex';
import { cargarMotor } from './lib/motor.mjs';

const { evaluateSheet, renderEsquema, renderHtml } = await cargarMotor();

/** Una hoja a partir de `[tipo, src]`, apiladas en orden de lectura. */
function hoja(...filas) {
  return filas.map(([kind, src], i) => ({ id: `r${i}`, kind, x: 40, y: 40 + i * 48, src }));
}
const m = (src) => ['math', src];
const p = (src) => ['program', src];

/** El LaTeX pasado a texto llano, para comparar valores sin pelear con el marcado. */
function llano(tex = '') {
  return tex
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\mathrm\{([^}]*)\}/g, '$1')
    .replace(/\\[,;]/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lo que va tras el último `=` del LaTeX de una región. */
function valor(res) {
  const t = llano(res?.tex);
  return t.slice(t.lastIndexOf('=') + 1).trim();
}

const esperaValor = (id, esperado) => (r) => {
  if (r[id]?.error) return `${id} dio error: ${r[id].error}`;
  const v = valor(r[id]);
  return v === esperado ? null : `${id} = «${v}», se esperaba «${esperado}»`;
};
const esperaError = (id, patron) => (r) => {
  const e = r[id]?.error;
  if (!e) return `${id} no dio error (valor «${valor(r[id])}»)`;
  return patron && !patron.test(e) ? `${id}: error inesperado «${e}»` : null;
};
const esperaAviso = (id, patron) => (r) => {
  const a = r[id]?.aviso;
  if (!a) return `${id} no lleva aviso`;
  return patron.test(a) ? null : `${id}: aviso inesperado «${a}»`;
};
const sinAviso = (id) => (r) => (r[id]?.aviso ? `${id} lleva un aviso que no toca: «${r[id].aviso}»` : null);
const todas = (...fs) => (r) => fs.map((f) => f(r)).find((x) => x) ?? null;

const CASOS = [
  // --- Programas ------------------------------------------------------------
  {
    nombre: 'un programa sin cabecera que empieza asignando ejecuta todo su cuerpo',
    hoja: hoja(p('total := 0\nfor i in 1:10\n    total := total + i\ntotal')),
    ok: esperaValor('r0', '55'),
  },
  {
    nombre: 'una función de una línea con más líneas detrás es un error, no un cuerpo perdido',
    hoja: hoja(p('f(x) := x^2\ny := 3')),
    ok: esperaError('r0'),
  },
  {
    nombre: 'una definición de una línea sigue valiendo',
    hoja: hoja(p('r := 5'), m('q := r*2 =')),
    ok: esperaValor('r1', '10'),
  },
  {
    nombre: 'un if como última sentencia devuelve el valor de su rama',
    hoja: hoja(m('a := 3'), p('r :=\n    if a > 2\n        "A"\n    else\n        "B"'), m('r =')),
    ok: esperaValor('r2', '"A"'),
  },
  {
    nombre: 'una cantidad con unidad nula es falsa en una condición',
    hoja: hoja(p('r :=\n    x := 0 m\n    if x\n        1\n    else\n        2')),
    ok: esperaValor('r0', '2'),
  },
  {
    nombre: 'una condición que da una matriz es un error, no «verdadero»',
    hoja: hoja(m('v := [-1, 2]'), p('r :=\n    if v > 0\n        1\n    else\n        2')),
    ok: esperaError('r1', /matriz/),
  },
  {
    nombre: 'una condición NaN es un error',
    hoja: hoja(p('r :=\n    if 0/0\n        1\n    else\n        2')),
    ok: esperaError('r0', /NaN/),
  },
  {
    nombre: 'un for sobre un vector fila recorre sus elementos',
    hoja: hoja(p('c :=\n    s := 0\n    for i in [1:3]\n        s := s + i\n    s')),
    ok: esperaValor('r0', '6'),
  },
  {
    nombre: 'un for sobre una columna recorre escalares',
    hoja: hoja(m('M := [1, 2; 3, 4]'), p('c :=\n    s := 0\n    for x in M[:, 1]\n        s := s + x\n    s')),
    ok: esperaValor('r1', '4'),
  },
  {
    nombre: 'las líneas de comentario no rompen un if/else ni el valor final',
    hoja: hoja(p('r :=\n    a := 2\n    # comentario\n    if a > 1\n        5\n    # rama contraria\n    else\n        6\n    # fin')),
    ok: esperaValor('r0', '5'),
  },

  // --- Tope de iteraciones y recursión ---------------------------------------
  {
    nombre: 'el tope de iteraciones cuenta las vueltas de las funciones llamadas',
    hoja: hoja(
      p('f(n) :=\n    t := 0\n    for i in 1:n\n        t := t + 1\n    return t'),
      p('s :=\n    u := 0\n    for j in 1:30\n        u := u + f(60000)\n    u'),
    ),
    ok: esperaError('r1', /iteraciones/),
  },
  {
    nombre: 'una recursión exponencial sin bucles también topa',
    hoja: hoja(p('fib(n) :=\n    if n < 2\n        return n\n    return fib(n - 1) + fib(n - 2)'), m('fib(40) =')),
    ok: esperaError('r1', /iteraciones|recursión/i),
    maxMs: 3000,
  },
  {
    nombre: 'una recursión infinita da un error de profundidad',
    hoja: hoja(p('g(n) :=\n    return g(n + 1)'), m('g(1) =')),
    ok: esperaError('r1', /recursión/i),
  },

  // --- Scope ----------------------------------------------------------------
  {
    nombre: 'un programa no altera una matriz de la hoja',
    hoja: hoja(m('A := [1, 2, 3]'), p('B :=\n    A[1] = 99\n    A'), m('A =')),
    ok: todas(esperaValor('r2', '[1, 2, 3]'), esperaValor('r1', '[99, 2, 3]')),
  },
  {
    nombre: 'una función no altera la matriz que recibe',
    hoja: hoja(m('A := [1, 2, 3]'), p('g(M) :=\n    M[2] = 0\n    return M'), m('C := g(A) ='), m('A =')),
    ok: todas(esperaValor('r3', '[1, 2, 3]'), esperaValor('r2', '[1, 0, 3]')),
  },
  {
    nombre: 'una redefinición que falla no deja viva la anterior',
    hoja: hoja(m('a := 1'), m('a := 1 kN + 2 m'), m('b := a*10 =')),
    ok: todas(esperaError('r1'), esperaError('r2')),
  },
  {
    nombre: 'un programa con nombre que falla no deja vivo el valor anterior',
    hoja: hoja(m('a := 1'), p('a :=\n    x := 1 kN + 2 m\n    x'), m('b := a*10 =')),
    ok: todas(esperaError('r1'), esperaError('r2')),
  },
  {
    nombre: '«x = 5» en una fórmula pide «:=» en vez de asignar en silencio',
    hoja: hoja(m('x = 5'), m('y := x*2 =')),
    ok: esperaError('r0', /:=/),
  },
  {
    nombre: 'los nombres de Object.prototype no se pueden definir ni rompen la hoja',
    hoja: hoja(m('toString := 5'), m('__proto__ := [1, 2]'), m('y := 2 =')),
    ok: todas(esperaError('r0', /reservado/), esperaError('r1', /reservado/), esperaValor('r2', '2')),
  },

  // --- LaTeX de los resultados ----------------------------------------------
  {
    nombre: 'un resultado de texto conserva espacios, % y guiones bajos',
    hoja: hoja(p('r :=\n    "pandeo local, lambda_md (50% del área) & #1"')),
    ok: (r) => {
      const t = r.r0?.tex ?? '';
      if (!t.includes('\\text{')) return `no va en \\text{}: ${t}`;
      if (!t.includes('50\\%')) return `el % no está escapado: ${t}`;
      if (!t.includes('lambda\\_md')) return `el _ no está escapado: ${t}`;
      return null;
    },
  },

  // --- Variables que tapan una unidad --------------------------------------
  {
    nombre: 'una variable «s» usada como segundo se avisa',
    hoja: hoja(m('s := 20 cm'), m('v := 3 m/s =')),
    ok: esperaAviso('r1', /«s»/),
  },
  {
    nombre: 'una variable «N» usada como newton se avisa',
    hoja: hoja(m('N := 500 kN'), m('F := 10 N =')),
    ok: esperaAviso('r1', /«N»/),
  },
  {
    nombre: 'usar la variable como variable no se avisa',
    hoja: hoja(m('h := 3 m'), m('b := 2 m'), m('A := b*h ='), m('r := b/h ='), m('q := 2*h =')),
    ok: todas(sinAviso('r2'), sinAviso('r3'), sinAviso('r4')),
  },
  {
    nombre: 'una cantidad entre paréntesis dividida por la variable no se avisa',
    // Tal cual lo escribe `losa-punzonamiento-momento`: `h` es el espesor.
    hoja: hoja(m('h := 22 cm'), m('p := (26 cm)/h - 1 =')),
    ok: todas(sinAviso('r1'), esperaValor('r1', '0.18182')),
  },
  {
    nombre: 'la unidad de conversión tras «=» no pasa por el scope y no se avisa',
    hoja: hoja(m('m := 2'), m('L := 450 cm = m')),
    ok: todas(esperaValor('r1', '4.5 m'), sinAviso('r1')),
  },
];

// --- Esquema paramétrico: `data-repetir` ------------------------------------
//
// Un esquema se dibuja contra el scope que captura su región `image`. Estos
// casos cubren la repetición, que es lo único del esquema que decide CUÁNTAS
// piezas se dibujan: un perno de menos se ve perfecto y es falso.

/** El scope que ve un esquema puesto al final de la hoja. */
function scopeDe(...filas) {
  const regiones = hoja(...filas);
  regiones.push({ id: 'img', kind: 'image', x: 40, y: 40 + regiones.length * 48, src: '/esquemas/x.svg' });
  return evaluateSheet(regiones).img.scope;
}
const cuantas = (svg, patron) => (svg.match(patron) ?? []).length;
const sinFaltantes = (e) => (e.faltantes.length ? `faltantes inesperados: ${e.faltantes.join(' · ')}` : null);
const conFaltante = (patron) => (e) =>
  e.faltantes.some((f) => patron.test(f)) ? null : `se esperaba un faltante ${patron}, hubo: [${e.faltantes.join(' · ')}]`;

const CASOS_ESQUEMA = [
  {
    nombre: 'un elemento autocerrado se clona una vez por fila, cada uno con su fila',
    scope: () => scopeDe(m('P := [10, 20; 30, 40; 50, 60]')),
    svg: '<svg><circle data-repetir="P" cx="{{fila[1]:svg}}" cy="{{fila[2]:svg}}" r="2"/></svg>',
    ok: (e) =>
      sinFaltantes(e) ??
      (cuantas(e.svg, /<circle /g) !== 3 ? `se esperaban 3 círculos: ${e.svg}` : null) ??
      (!e.svg.includes('cx="30" cy="40"') ? `la fila 2 no llegó a su clon: ${e.svg}` : null),
  },
  {
    nombre: 'el atributo data-repetir no queda en el SVG emitido',
    scope: () => scopeDe(m('P := [1, 2]')),
    svg: '<svg><circle data-repetir="P" cx="{{fila:svg}}" r="2"/></svg>',
    ok: (e) => sinFaltantes(e) ?? (e.svg.includes('data-repetir') ? `quedó el atributo: ${e.svg}` : null),
  },
  {
    nombre: 'sobre un vector, fila es el escalar',
    scope: () => scopeDe(m('xs := [5, 15, 25]')),
    svg: '<svg><line data-repetir="xs" x1="{{fila:svg}}" x2="{{fila:svg}}" y1="0" y2="9"/></svg>',
    ok: (e) =>
      sinFaltantes(e) ?? (cuantas(e.svg, /<line /g) !== 3 || !e.svg.includes('x1="15"') ? `mal repetido: ${e.svg}` : null),
  },
  {
    nombre: 'una lista vacía dibuja cero clones y no es un faltante',
    scope: () => scopeDe(m('P := []')),
    svg: '<svg><circle data-repetir="P" cx="{{fila[1]:svg}}" r="2"/><rect width="1"/></svg>',
    ok: (e) => sinFaltantes(e) ?? (cuantas(e.svg, /<circle /g) !== 0 || !e.svg.includes('<rect') ? `mal: ${e.svg}` : null),
  },
  {
    nombre: 'una lista que no resuelve se lleva el elemento y cae en faltantes',
    scope: () => scopeDe(m('a := 1')),
    svg: '<svg><circle data-repetir="no_existe" cx="{{fila:svg}}" r="2"/></svg>',
    ok: (e) => conFaltante(/no_existe/)(e) ?? (cuantas(e.svg, /<circle /g) !== 0 ? `quedó un círculo: ${e.svg}` : null),
  },
  {
    nombre: 'un escalar donde se esperaba una lista cae en faltantes',
    scope: () => scopeDe(m('n := 5')),
    svg: '<svg><circle data-repetir="n" cx="{{fila:svg}}" r="2"/></svg>',
    ok: conFaltante(/data-repetir="n"/),
  },
  {
    nombre: 'un token roto dentro de un clon cae en faltantes, una vez por clon',
    scope: () => scopeDe(m('P := [1; 2]')),
    svg: '<svg><circle data-repetir="P" cx="{{fila[9]:svg}}" r="2"/></svg>',
    ok: (e) => (e.faltantes.length === 2 ? null : `se esperaban 2 faltantes, hubo ${e.faltantes.length}`),
  },
  {
    nombre: 'un <g> se clona entero, y un <g> interno no confunde su cierre',
    scope: () => scopeDe(m('P := [1, 2]')),
    svg: '<svg><g data-repetir="P"><g><circle cx="{{fila:svg}}" r="1"/></g><text>{{fila}}</text></g><rect width="1"/></svg>',
    ok: (e) =>
      sinFaltantes(e) ??
      (cuantas(e.svg, /<circle /g) !== 2 || cuantas(e.svg, /<text>/g) !== 2 || cuantas(e.svg, /<rect /g) !== 1
        ? `el grupo se cortó mal: ${e.svg}`
        : null),
  },
  {
    nombre: 'un «>» dentro de un atributo no corta la etiqueta de apertura',
    scope: () => scopeDe(m('P := [1, 2]')),
    svg: '<svg><circle data-repetir="P" data-nota="a > b" cx="{{fila:svg}}" r="1"/></svg>',
    ok: (e) => sinFaltantes(e) ?? (cuantas(e.svg, /<circle /g) !== 2 ? `mal: ${e.svg}` : null),
  },
  {
    nombre: 'un data-repetir anidado se rechaza en vez de multiplicar a ciegas',
    scope: () => scopeDe(m('P := [1; 2]')),
    svg: '<svg><g data-repetir="P"><circle data-repetir="P" cx="{{fila:svg}}" r="1"/></g></svg>',
    ok: (e) => conFaltante(/anidado/)(e) ?? (cuantas(e.svg, /<circle /g) !== 0 ? `dibujó algo: ${e.svg}` : null),
  },
  {
    nombre: '«data-repetir» en un texto no es un atributo',
    scope: () => scopeDe(m('a := 1')),
    svg: '<svg><text>usa data-repetir para repetir</text></svg>',
    ok: (e) => sinFaltantes(e) ?? (!e.svg.includes('usa data-repetir para repetir') ? `tocó el texto: ${e.svg}` : null),
  },
  {
    nombre: 'un color calculado como texto entra por el token normal',
    scope: () => scopeDe(m('ok := 3 > 5'), m('color := ok ? "#111827" : "#dc2626"')),
    svg: '<svg><line stroke="{{color}}" x1="0" x2="1" y1="0" y2="1"/></svg>',
    ok: (e) => sinFaltantes(e) ?? (!e.svg.includes('stroke="#dc2626"') ? `el color no llegó: ${e.svg}` : null),
  },
];

// --- El papel: regiones con `imprimir: false` -------------------------------
//
// El mapeo a píxeles de un esquema (escala, funciones hx/vp, colores) son
// cálculos que la figura necesita y que un anexo de memoria no quiere leer.
// Con `imprimir: false` la región se evalúa y alimenta el SVG, pero no sale en
// el documento. Lo que vota —una entrada, un veredicto, una salida— no se
// esconde: eso lo exige `validarMeta`, no el motor.

const SVG_K = '<svg><text>{{k}}</text></svg>';

/** El documento de una hoja, con el esquema resuelto. */
function papelDe(regiones) {
  const res = evaluateSheet(regiones);
  return renderHtml(regiones, res, undefined, { esquemas: { '/esquemas/x.svg': SVG_K } });
}

const CASOS_PAPEL = [
  {
    nombre: 'una región «imprimir: false» alimenta el esquema y no sale en el papel',
    hoja: () => {
      const rs = hoja(['text', 'TÍTULO'], m('k := 7'));
      rs[1].imprimir = false;
      rs.push({ id: 'img', kind: 'image', x: 40, y: 200, src: '/esquemas/x.svg' });
      return rs;
    },
    ok: (html) =>
      (html.includes('>7<') ? null : `el token del esquema no se resolvió: ${html}`) ??
      (html.includes('data-wp-id="r1"') ? 'la región oculta salió impresa' : null),
  },
  {
    nombre: 'una región oculta no se lleva el título del documento',
    hoja: () => {
      const rs = hoja(['text', 'NOTA OCULTA'], ['text', 'TÍTULO DE VERDAD']);
      rs[0].imprimir = false;
      return rs;
    },
    ok: (html) =>
      html.includes('<h1>TÍTULO DE VERDAD</h1>') ? null : `el título salió de la región oculta: ${html}`,
  },
];

let fallos = 0;
for (const caso of CASOS_PAPEL) {
  let motivo;
  try {
    motivo = caso.ok(papelDe(caso.hoja()));
  } catch (e) {
    motivo = `lanzó: ${e.message}`;
  }
  if (motivo) {
    fallos++;
    console.log(`  [FALLA] ${caso.nombre}\n          ${motivo}`);
  } else {
    console.log(`  [ OK  ] ${caso.nombre}`);
  }
}

for (const caso of CASOS_ESQUEMA) {
  let motivo;
  try {
    motivo = caso.ok(renderEsquema(caso.svg, caso.scope()));
  } catch (e) {
    motivo = `lanzó: ${e.message}`;
  }
  if (motivo) {
    fallos++;
    console.log(`  [FALLA] ${caso.nombre}\n          ${motivo}`);
  } else {
    console.log(`  [ OK  ] ${caso.nombre}`);
  }
}

for (const caso of CASOS) {
  const t0 = performance.now();
  let motivo;
  try {
    const r = evaluateSheet(caso.hoja);
    motivo = caso.ok(r);
    if (!motivo) {
      for (const [id, res] of Object.entries(r)) {
        if (!res.tex) continue;
        try {
          katex.renderToString(res.tex, { throwOnError: true });
        } catch (e) {
          motivo = `el LaTeX de ${id} no compone: ${e.message}\n            ${res.tex}`;
          break;
        }
      }
    }
  } catch (e) {
    motivo = `el motor lanzó: ${e.message}`;
  }
  const ms = performance.now() - t0;
  if (!motivo && caso.maxMs && ms > caso.maxMs) motivo = `tardó ${Math.round(ms)} ms (tope ${caso.maxMs})`;
  if (motivo) {
    fallos++;
    console.log(`  [FALLA] ${caso.nombre}\n          ${motivo}`);
  } else {
    console.log(`  [ OK  ] ${caso.nombre}`);
  }
}

const total = CASOS.length + CASOS_ESQUEMA.length + CASOS_PAPEL.length;
console.log(`\n${fallos ? 'FALLA' : 'OK'}: ${total - fallos} de ${total} casos.\n`);
process.exit(fallos ? 1 : 0);
