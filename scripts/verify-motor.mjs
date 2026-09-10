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

const { evaluateSheet } = await cargarMotor();

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

let fallos = 0;
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

console.log(`\n${fallos ? 'FALLA' : 'OK'}: ${CASOS.length - fallos} de ${CASOS.length} casos.\n`);
process.exit(fallos ? 1 : 0);
