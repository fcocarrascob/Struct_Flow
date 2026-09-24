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
import { cargarMotor, cargarMensajes } from './lib/motor.mjs';

const {
  evaluateSheet,
  renderEsquema,
  renderHtml,
  documentoHtml,
  ajustarAnchos,
  svgDeGrafico,
  sanearConInforme,
  unidadesTapadas,
  simbolosDeFormula,
} = await cargarMotor();

/** Una hoja a partir de `[tipo, src, extra?]`, apiladas en orden de lectura. */
function hoja(...filas) {
  return filas.map(([kind, src, extra], i) => ({ id: `r${i}`, kind, x: 40, y: 40 + i * 48, src, ...extra }));
}
const m = (src) => ['math', src];
const p = (src) => ['program', src];
/** Un gráfico: `espec` completa los campos que falten con lo mínimo. */
const g = (espec, titulo = 'Gráfico') => [
  'plot',
  titulo,
  {
    grafico: {
      version: 1,
      ejeX: { titulo: 'x', ...espec.ejeX },
      ejeY: { titulo: 'y', ...espec.ejeY },
      series: espec.series,
      referencias: espec.referencias,
      leyenda: espec.leyenda,
      alto: espec.alto,
    },
  },
];
const fn = (expr, desde, hasta, extra = {}) => ({ tipo: 'funcion', nombre: 'f', expr, variable: 'x', desde, hasta, ...extra });
/** Una tabla: `celdas` es la grilla de `src`, `extra` el resto de la especificación. */
const t = (celdas, extra = {}, titulo = '') => ['table', titulo, { tabla: { version: 1, celdas, ...extra } }];

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
/** Los tramos de un gráfico, con tolerancia de redondeo. */
const esperaTramos = (id, esperado) => (r) => {
  if (r[id]?.error) return `${id} dio error: ${r[id].error}`;
  const t = r[id]?.grafico?.series?.[0]?.tramos;
  if (!t) return `${id} no trae tramos`;
  const cerca = (a, b) => Math.abs(a - b) < 1e-9;
  const igual =
    t.length === esperado.length &&
    t.every((tr, i) => tr.length === esperado[i].length && tr.every(([x, y], k) => cerca(x, esperado[i][k][0]) && cerca(y, esperado[i][k][1])));
  return igual ? null : `${id}: tramos ${JSON.stringify(t)}, se esperaba ${JSON.stringify(esperado)}`;
};
const sinAviso = (id) => (r) => (r[id]?.aviso ? `${id} lleva un aviso que no toca: «${r[id].aviso}»` : null);
/** La celda `[f, c]` (base 0) de la tabla `id`. */
const celda = (r, id, f, c) => r[id]?.tabla?.celdas?.[f]?.[c];
const esperaCelda = (id, f, c, esperado) => (r) => {
  const x = celda(r, id, f, c);
  if (!x) return `${id} no trae la celda [${f},${c}]${r[id]?.error ? ` (error de la tabla: ${r[id].error})` : ''}`;
  if (x.error) return `${id}[${f},${c}] dio error: ${x.error}`;
  const v = valor(x);
  return v === esperado ? null : `${id}[${f},${c}] = «${v}», se esperaba «${esperado}»`;
};
const esperaErrorCelda = (id, f, c, patron) => (r) => {
  const e = celda(r, id, f, c)?.error;
  if (!e) return `${id}[${f},${c}] no dio error (valor «${valor(celda(r, id, f, c))}»)`;
  return patron && !patron.test(e) ? `${id}[${f},${c}]: error inesperado «${e}»` : null;
};
const esperaTipos = (id, tipos) => (r) => {
  const hay = r[id]?.tabla?.celdas?.map((fila) => fila.map((x) => x.tipo));
  return JSON.stringify(hay) === JSON.stringify(tipos) ? null : `${id}: tipos ${JSON.stringify(hay)}, se esperaba ${JSON.stringify(tipos)}`;
};
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

  // --- Nombres sin definir que math.js resuelve solo ------------------------
  //
  // math.js busca un símbolo en el scope, después entre sus constantes y después
  // entre las unidades. Un nombre que la hoja no define —o cuya definición falló y
  // se retiró— no daba «Undefined symbol»: daba la razón áurea, el número de Euler
  // o litros, y la hoja seguía calculando con eso.
  {
    nombre: '«phi» sin definir no es la razón áurea',
    hoja: hoja(m('Mn := 100 kN*m'), m('Md := phi*Mn =')),
    ok: esperaError('r1', /«phi»/),
  },
  {
    nombre: '«E» sin definir no es el número de Euler',
    hoja: hoja(m('sigma := E*0.001 =')),
    ok: esperaError('r0', /«E»/),
  },
  {
    nombre: 'una definición de «E» que falla no deja pasar la constante',
    hoja: hoja(m('E := 200000 MPa + 3 m'), m('sigma := E*0.001 =')),
    ok: todas(esperaError('r0'), esperaError('r1', /«E»/)),
  },
  {
    nombre: '«L» sin definir no son litros',
    hoja: hoja(m('q := 2 kN/m'), m('M := q*L^2/8 =')),
    ok: esperaError('r1', /«L»/),
  },
  {
    nombre: 'una variable que falló no se vuelve la unidad de su nombre',
    hoja: hoja(m('A := sqrt(-4)'), m('B := A*2 =')),
    ok: todas(esperaError('r0'), esperaError('r1', /«A»/)),
  },
  {
    nombre: '«Es» sin definir no es un exasegundo',
    hoja: hoja(m('eps := 0.002'), m('fs := Es*eps =')),
    ok: esperaError('r1', /«Es»/),
  },
  {
    nombre: 'un nombre corto con prefijo sin definir no es una unidad',
    hoja: hoja(m('x := dA*2 =')),
    ok: esperaError('r0', /«dA»/),
  },
  {
    nombre: '«N» suelta y sin definir no es un newton: es la axial que falta',
    hoja: hoja(m('M := 20 kN*m'), m('e := M/N =')),
    ok: esperaError('r1', /«N»/),
  },
  {
    nombre: '«m» suelta y sin definir no es un metro',
    hoja: hoja(m('x := 3'), m('v := x*m =')),
    ok: esperaError('r1', /«m»/),
  },
  {
    nombre: '«N» y «m» escritas como unidad siguen valiendo',
    hoja: hoja(m('F := 10 N ='), m('k := 2'), m('M := k*1 tonf*m ='), m('r := 30 kN/(1 N) ='), m('c := k*1 N =')),
    ok: todas(esperaValor('r0', '10 N'), esperaValor('r2', '2 tonf m'), esperaValor('r3', '30000'), esperaValor('r4', '2 N')),
  },
  {
    nombre: 'dentro de un programa, una constante sin definir también es error',
    hoja: hoja(p('r :=\n    x := 2\n    x*phi')),
    ok: esperaError('r0', /«phi»/),
  },
  {
    nombre: 'en una celda de tabla, una unidad sin definir también es error',
    hoja: hoja(t([['M := 3*L =']])),
    ok: esperaErrorCelda('r0', 0, 0, /«L»/),
  },
  {
    nombre: 'verify:planilla: una unidad con nombre de variable de la hoja se detecta antes y después de definirla',
    // La comprobación es estática, sin evaluar: la hoja del caso va vacía.
    hoja: hoja(),
    ok: () => {
      const tapa = (h) => unidadesTapadas(h).map((x) => `${x.id}:${x.nombre}`).join(' ');
      const despues = tapa(hoja(m('m := 12 cm'), m('L_col := 4 m')));
      const antes = tapa(hoja(m('L_col := 4 m'), m('m := 12 cm')));
      const cadena = tapa(hoja(m('s := 2'), m('v := 3 m/s')));
      const libre = tapa(hoja(m('h := 3 m'), m('A := 2*h'), m('p := (26 cm)/h')));
      if (despues !== 'r1:m') return `definida antes: «${despues}»`;
      if (antes !== 'r0:m') return `definida después: «${antes}»`;
      if (cadena !== 'r1:s') return `en una cadena: «${cadena}»`;
      return libre ? `usada como variable no se detecta: «${libre}»` : null;
    },
  },
  {
    nombre: 'el lector de nombres: lo que una fórmula usa, sin textos, unidades, funciones del motor ni exponentes',
    hoja: hoja(),
    ok: () => {
      const casos = [
        ['x := a*sqrt(b_1) + f(c) = kN', 'a b_1 c f'],
        ['t := "area útil" + b =', 'b'],
        ['L := 4 m', ''],
        ['L := 450 cm = m', ''],
        ['σ_c * año =', 'año σ_c'],
        ['x := 2.04e6*k', 'k'],
        ['y := pi*r^2 = m^2', 'r'],
        ['rfc := sqrt(f_c/MPa) =', 'MPa f_c'],
        ['z := (a + b', 'a b'],
      ];
      for (const [src, esperado] of casos) {
        const hay = simbolosDeFormula(src).sort().join(' ');
        if (hay !== esperado) return `«${src}»: «${hay}», se esperaba «${esperado}»`;
      }
      return null;
    },
  },
  {
    nombre: 'una constante detrás de un número no pasa por unidad',
    hoja: hoja(m('x := 2 phi =')),
    ok: esperaError('r0', /«phi»/),
  },
  {
    nombre: 'una variable que no es unidad, detrás de un número, no se avisa',
    hoja: hoja(m('x := 4'), m('y := 3 x =')),
    ok: todas(esperaValor('r1', '12'), sinAviso('r1')),
  },
  {
    nombre: 'una variable que tapa una unidad al final de una cadena también se avisa',
    hoja: hoja(m('m := 2'), m('k := 3'), m('M := k*1 tonf*m =')),
    ok: esperaAviso('r2', /«m»/),
  },
  {
    nombre: 'pi sigue siendo pi',
    hoja: hoja(m('r := 2 m'), m('A := pi*r^2 = m^2')),
    ok: todas(esperaValor('r1', '12.566 m^2'), sinAviso('r1')),
  },
  {
    nombre: 'las unidades escritas como unidad siguen valiendo',
    hoja: hoja(m('F := 10 kN ='), m('v := 3 m/s ='), m('fc := 25 MPa'), m('k := fc/MPa ='), m('x := 5 cm to mm =')),
    ok: todas(esperaValor('r0', '10 kN'), esperaValor('r1', '3 m / s'), esperaValor('r3', '25'), esperaValor('r4', '50 mm')),
  },
  {
    nombre: 'una variable local de un programa y un parámetro de función no son constantes',
    hoja: hoja(p('f(E) := E*2'), p('r :=\n    phi := 0.9\n    phi*f(3)'), m('y := f(4) =')),
    ok: todas(esperaValor('r1', '5.4'), esperaValor('r2', '8')),
  },
  {
    nombre: 'una variable definida con nombre de constante o de unidad es la variable',
    hoja: hoja(m('phi := 0.9'), m('E := 200 MPa'), m('L := 5 m'), m('x := phi*E*L = MPa*m')),
    ok: esperaValor('r3', '900 MPa m'),
  },

  // --- Scope inicial --------------------------------------------------------
  //
  // Una hoja puede empezar con variables ya definidas. Lo usa el canvas de una
  // obra (`src/proyecto/obra/evaluacion.ts`) para encadenar cálculos: lo que
  // publica una planilla entra como scope inicial de los nodos de aguas abajo,
  // y tiene que llegar como el `Unit` que es, no como un número serializado.
  {
    nombre: 'una variable del scope inicial se usa como cualquier otra, con sus unidades',
    hoja: hoja(m('x := T_grupo*2 = kN')),
    scope: () => scopeDe(m('T_grupo := 120 kN')),
    ok: esperaValor('r0', '240 kN'),
  },
  {
    nombre: 'la hoja manda: una definición propia pisa la del scope inicial',
    hoja: hoja(m('a := 7'), m('b := a =')),
    scope: () => scopeDe(m('a := 5')),
    ok: esperaValor('r1', '7'),
  },
  {
    nombre: 'una variable del scope inicial que tapa una unidad también avisa',
    hoja: hoja(m('v := 3 m/s =')),
    scope: () => scopeDe(m('s := 20 cm')),
    ok: esperaAviso('r0', /«s»/),
  },
  // El objeto que recibe el motor es de quien lo llama, y el canvas de una obra
  // lo va acumulando tramo a tramo: si `evaluateSheet` escribiera dentro, las
  // variables de un nodo se filtrarían a los de aguas arriba y el orden de
  // lectura dejaría de significar nada.
  (() => {
    const inicial = scopeDe(m('a := 5'));
    return {
      nombre: 'el scope inicial no se muta: la hoja no escribe en el del llamador',
      hoja: hoja(m('a := 7'), m('nuevo := 1')),
      scope: () => inicial,
      ok: () =>
        ('nuevo' in inicial ? 'la hoja definió una variable en el scope del llamador' : null) ??
        (String(inicial.a) !== '5' ? `la hoja pisó «a» del llamador: ${inicial.a}` : null),
    };
  })(),

  // --- Números complejos ------------------------------------------------------
  //
  // mathjs responde a la raíz de un negativo con un complejo, y la hoja lo
  // mostraba como «(91,07 − 26,37i) cm²» sin una sola señal: un número plausible
  // y falso, que es la peor clase de fallo. En una memoria de cálculo un
  // complejo es siempre un dato o una unidad equivocados, así que es un error.
  {
    nombre: 'la raíz de un negativo es un error, no un complejo',
    hoja: hoja(m('A := sqrt(-4) =')),
    ok: esperaError('r0', /complejo/),
  },
  {
    nombre: 'con unidades también',
    hoja: hoja(m('a := -2 m^2'), m('b := sqrt(a) = m')),
    ok: esperaError('r1', /complejo/),
  },
  {
    nombre: 'el logaritmo de un negativo es un error',
    hoja: hoja(m('c := log(-1) =')),
    ok: esperaError('r0', /complejo/),
  },
  {
    nombre: 'una potencia fraccionaria de un negativo es un error',
    hoja: hoja(m('x := (-8)^(1/3) =')),
    ok: esperaError('r0', /complejo/),
  },
  {
    nombre: 'una región que solo muestra un complejo también es un error',
    hoja: hoja(m('sqrt(-9) =')),
    ok: esperaError('r0', /complejo/),
  },
  {
    // Con un nombre que no es unidad: retirada `A`, `A*2` serían dos amperios.
    nombre: 'el complejo no se propaga como número: lo de abajo no lo encuentra',
    hoja: hoja(m('raiz_1 := sqrt(-4)'), m('doble := raiz_1*2 =')),
    ok: todas(esperaError('r0', /complejo/), esperaError('r1')),
  },
  {
    nombre: 'un programa que devuelve un complejo es un error',
    hoja: hoja(p('r :=\n    return sqrt(-1)')),
    ok: esperaError('r0', /complejo/),
  },
  {
    nombre: 'una función de usuario que da un complejo lo delata donde se usa',
    hoja: hoja(p('f(x) :=\n    return sqrt(x)'), m('y := f(-1) =')),
    ok: esperaError('r1', /complejo/),
  },
  {
    nombre: 'un vector con un complejo es un error',
    hoja: hoja(m('v := [sqrt(4), sqrt(-4)] =')),
    ok: esperaError('r0', /complejo/),
  },

  // --- Cómo se muestra una unidad sin convertir ------------------------------
  //
  // math.js reescribe su sistema de unidades «auto» con cada unidad que analiza
  // (`= MPa`, `.to(...)`): una presión sin convertir se mostraba «1000 Pa» o
  // «1 kPa» según qué hoja se hubiera evaluado antes en el proceso.
  {
    nombre: 'una hoja se muestra igual aunque antes se haya evaluado otra',
    hoja: hoja(),
    ok: () => {
      const medir = () => valor(evaluateSheet(hoja(m('p := 1*1 kN/m^2 ='))).r0);
      evaluateSheet(hoja(m('f := 3000 kN/m^2 = Pa')));
      const trasPa = medir();
      evaluateSheet(hoja(m('f := 30000 kN/m^2 = MPa')));
      const trasMPa = medir();
      return trasPa === trasMPa ? null : `«${trasPa}» tras una hoja en Pa y «${trasMPa}» tras una en MPa`;
    },
  },

  // math.js simplifica fuerza × longitud a julios: un momento se imprimía como
  // una energía («224,61 kJ» por 22,9 tonf·m).
  {
    nombre: 'un momento se muestra con la fuerza y la longitud del autor, no en julios',
    hoja: hoja(m('k := 3'), m('M := k*1 tonf*m =')),
    ok: todas(esperaValor('r1', '3 tonf m'), (r) => (r.r1?.define?.valor === '3 tonf m' ? null : `panel: «${r.r1?.define?.valor}»`)),
  },
  {
    nombre: 'fuerza por longitud en kN da kN·m',
    hoja: hoja(m('M := 5 kN * 2 m =')),
    ok: esperaValor('r0', '10 kN m'),
  },
  {
    nombre: 'un momento derivado de una carga distribuida también',
    hoja: hoja(m('q := 2 kN/m'), m('L := 3 m'), m('M := q*L^2/8 =')),
    ok: esperaValor('r2', '2.25 kN m'),
  },
  {
    nombre: 'quien pide julios los recibe',
    hoja: hoja(m('W := 10 kN * 2 m = kJ')),
    ok: esperaValor('r0', '20 kJ'),
  },

  // --- Ángulos -----------------------------------------------------------------
  //
  // atan, asin, acos y atan2 devolvían un número en radianes sin unidad: `= deg`
  // fallaba y el paso a grados se escribía a mano (`*180/pi`).
  {
    nombre: 'las trigonométricas inversas devuelven un ángulo, que se convierte a grados',
    hoja: hoja(m('a := atan(1) = deg'), m('b := asin(0.5) = deg'), m('c := acos(0.5) = deg'), m('d := atan2(1, 1) = deg')),
    ok: todas(esperaValor('r0', '45 deg'), esperaValor('r1', '30 deg'), esperaValor('r2', '60 deg'), esperaValor('r3', '45 deg')),
  },
  {
    nombre: 'un ángulo con unidad entra en sin y cos, y se compara en grados',
    hoja: hoja(m('t := atan(1)'), m('s := sin(t) ='), m('t >= 25 deg ='), m('c := cos(t)^2 + sin(t)^2 =')),
    ok: todas(esperaValor('r1', '0.70711'), (r) => (r.r2?.bool === true ? null : `r2: ${JSON.stringify(r.r2)}`), esperaValor('r3', '1')),
  },
  {
    nombre: 'sobre un vector, ángulo a ángulo',
    hoja: hoja(m('v := atan([0, 1])'), m('g := v[2] = deg')),
    ok: esperaValor('r1', '45 deg'),
  },

  // --- Lo demás ------------------------------------------------------------------
  {
    nombre: 'un esquema que llama a una función de usuario la evalúa con el scope de su posición',
    // La función leía el scope vivo de la hoja: con `k` redefinida DEBAJO del
    // esquema, el rótulo salía con el valor final.
    hoja: hoja(p('f(x) := x*k'), m('k := 2'), ['image', '/esquemas/x.svg'], m('k := 10')),
    ok: (r) => {
      const e = renderEsquema('<svg><text>{{f(3)}}</text></svg>', r.r2.scope);
      return e.svg.includes('>6<') ? null : `el rótulo dice ${e.svg.match(/<text>([^<]*)/)?.[1]}, se esperaba 6`;
    },
  },
  {
    nombre: 'y la hoja de abajo sigue viendo la función con el scope vivo',
    hoja: hoja(p('f(x) := x*k'), m('k := 2'), ['image', '/esquemas/x.svg'], m('k := 10'), m('y := f(3) =')),
    ok: esperaValor('r4', '30'),
  },
  {
    nombre: 'una función que llega en el scope inicial conserva lo que usa y no se publicó',
    // Como en la obra: un nodo publica `f` y no la `k` que `f` lee. Recrear `f`
    // sobre la instantánea de otra hoja le quitaba `k`.
    hoja: hoja(['image', '/esquemas/x.svg'], m('y := f(3) =')),
    scope: () => ({ f: scopeDe(p('f(x) := x*k'), m('k := 2')).f }),
    ok: todas(esperaValor('r1', '6'), (r) => {
      const e = renderEsquema('<svg><text>{{f(3)}}</text></svg>', r.r0.scope);
      return e.svg.includes('>6<') ? null : `el rótulo: ${e.svg.match(/<text>([^<]*)/)?.[1]} (faltantes: ${e.faltantes.join(', ')})`;
    }),
  },
  {
    nombre: 'una función escrita en una fórmula dice que va en un programa',
    hoja: hoja(m('f(x) := x^2')),
    ok: esperaError('r0', /programa/),
  },
  {
    nombre: 'una matriz enorme es un error atrapable, no una pestaña sin memoria',
    hoja: hoja(m('M := ones(20000, 20000)'), m('v := 1:5000000'), m('z := size(zeros(3, 4)) =')),
    ok: todas(esperaError('r0', /elementos/), esperaError('r1', /elementos/), esperaValor('r2', '[3, 4]')),
  },

  // --- Valores no finitos -----------------------------------------------------
  //
  // Como el complejo: `0/0` daba NaN, `1/0` Infinity y `log(0)` −Infinity, sin
  // error, y una comparación con NaN salía ✗ —un incumplimiento que no lo es—.
  {
    nombre: 'cero entre cero es un error, no NaN',
    hoja: hoja(m('x := 0/0 =')),
    ok: esperaError('r0', /no finito/),
  },
  {
    nombre: 'una división por cero es un error, no Infinity',
    hoja: hoja(m('x := 1/0 =')),
    ok: esperaError('r0', /no finito/),
  },
  {
    nombre: 'el logaritmo de cero es un error',
    hoja: hoja(m('x := log(0) =')),
    ok: esperaError('r0', /no finito/),
  },
  {
    nombre: 'con unidades también',
    hoja: hoja(m('F := 1 kN/0 =')),
    ok: esperaError('r0', /no finito/),
  },
  {
    nombre: 'un vector con un infinito es un error',
    hoja: hoja(m('v := [1, 1/0] =')),
    ok: esperaError('r0', /no finito/),
  },
  {
    nombre: 'una verificación con una división por cero dentro es un error, no ✗',
    hoja: hoja(m('V_u := 10 kN'), m('V_c := 0 kN'), m('V_u/(0.75*V_c) <= 1 =')),
    ok: esperaError('r2', /no finito/),
  },
  {
    nombre: 'una verificación con un NaN dentro es un error, no ✗',
    hoja: hoja(m('a := 0 kN'), m('a/a < 1 and 2 > 1 =')),
    ok: esperaError('r1', /no finito/),
  },
  {
    nombre: 'una verificación finita sigue siendo un veredicto',
    hoja: hoja(m('V_u := 10 kN'), m('V_c := 20 kN'), m('V_u/(0.75*V_c) <= 1 =')),
    ok: (r) => (r.r2?.bool === true ? null : `r2: ${JSON.stringify(r.r2)}`),
  },
  {
    nombre: 'un programa que devuelve un infinito es un error',
    hoja: hoja(p('r :=\n    x := 0\n    1/x')),
    ok: esperaError('r0', /no finito/),
  },
  {
    nombre: 'un programa puede usar Infinity por dentro, como cota inicial',
    hoja: hoja(p('r :=\n    mejor := Infinity\n    for v in [3, 1, 2]\n        if v < mejor\n            mejor := v\n    mejor')),
    ok: esperaValor('r0', '1'),
  },
  {
    nombre: 'en una celda de tabla, una división por cero es un error de la celda',
    hoja: hoja(t([['x := 1/0 =']])),
    ok: esperaErrorCelda('r0', 0, 0, /no finito/),
  },
  {
    nombre: 'interp con un x no finito es un error que lo dice',
    hoja: hoja(m('x := interp([1, 2], [10, 20], 0/0) =')),
    ok: esperaError('r0', /finito/),
  },
  {
    nombre: 'la raíz de un positivo sigue igual',
    hoja: hoja(m('z := sqrt(4) =')),
    ok: esperaValor('r0', '2'),
  },
  {
    nombre: 'una comparación con un complejo intermedio no se cuela como veredicto',
    hoja: hoja(m('sqrt(-4) < 1')),
    ok: esperaError('r0'),
  },

  // --- Región gráfico -----------------------------------------------------------
  //
  // Un gráfico se evalúa en su posición del orden de lectura y no define nada.
  // Lo que se comprueba son los DATOS en unidades de los ejes: el SVG es una
  // función pura de ellos, y tiene sus propios casos más abajo.
  {
    nombre: 'una función de un programa se muestrea en el rango, punto por punto',
    hoja: hoja(p('f(x) :=\n    return x^2'), g({ series: [fn('f(x)', '0', '2', { muestras: 3 })] })),
    ok: esperaTramos('r1', [[[0, 0], [1, 1], [2, 4]]]),
  },
  {
    nombre: 'una expresión directa también, sin programa',
    hoja: hoja(g({ series: [fn('2*x + 1', '0', '1', { muestras: 2 })] })),
    ok: esperaTramos('r0', [[[0, 1], [1, 3]]]),
  },
  {
    nombre: 'cada eje se expresa en su unidad: la variable llega con la del eje X',
    hoja: hoja(
      m('q := 2 kN/m'),
      g({ ejeX: { unidad: 'm' }, ejeY: { unidad: 'kN' }, series: [fn('q*x', '0 m', '300 cm', { muestras: 2 })] }),
    ),
    ok: esperaTramos('r1', [[[0, 0], [3, 6]]]),
  },
  {
    nombre: 'una dimensión que no casa con el eje es un error de la serie',
    hoja: hoja(m('q := 2 kN/m'), g({ ejeX: { unidad: 'm' }, ejeY: { unidad: 'm' }, series: [fn('q*x', '0 m', '3 m')] })),
    ok: esperaError('r1', /Serie «f».*no casan/),
  },
  {
    nombre: 'un valor con unidades en un eje sin unidad pide declararla',
    hoja: hoja(m('F := 3 kN'), g({ series: [fn('F*x', '0', '1')] })),
    ok: esperaError('r1', /declara la unidad del eje/),
  },
  {
    nombre: 'una serie de datos N×2 dibuja sus puntos en orden',
    hoja: hoja(m('P := [0, 1; 1, 3; 2, 2]'), g({ series: [{ tipo: 'datos', nombre: 'P', xy: 'P' }] })),
    ok: esperaTramos('r1', [[[0, 1], [1, 3], [2, 2]]]),
  },
  {
    nombre: 'dos vectores del mismo largo son una serie de datos',
    hoja: hoja(m('xs := [1, 2, 3]'), m('ys := [4; 5; 6]'), g({ series: [{ tipo: 'datos', nombre: 'v', x: 'xs', y: 'ys' }] })),
    ok: esperaTramos('r2', [[[1, 4], [2, 5], [3, 6]]]),
  },
  {
    nombre: 'dos vectores de distinto largo son un error que dice los dos largos',
    hoja: hoja(m('xs := [1, 2, 3]'), m('ys := [4, 5]'), g({ series: [{ tipo: 'datos', nombre: 'v', x: 'xs', y: 'ys' }] })),
    ok: esperaError('r2', /3 y 2/),
  },
  {
    nombre: 'una función indefinida en parte del rango se corta y avisa, sin error',
    hoja: hoja(g({ series: [fn('sqrt(x)', '-1', '1', { muestras: 5 })] })),
    ok: todas(esperaAviso('r0', /2 de 5 puntos/), esperaTramos('r0', [[[0, 0], [0.5, Math.SQRT1_2], [1, 1]]])),
  },
  {
    nombre: 'una función que no se puede dibujar en ningún punto es un error',
    hoja: hoja(g({ series: [fn('sqrt(x - 5)', '0', '1')] })),
    ok: esperaError('r0', /no está definida en 200 de 200/),
  },
  {
    nombre: 'el gráfico no define nada: su variable no existe debajo',
    hoja: hoja(g({ series: [fn('x^2', '0', '1')] }), m('y := x + 1 =')),
    ok: esperaError('r1', /Undefined symbol x/),
  },
  {
    nombre: 'orden de lectura: una función definida debajo del gráfico no se ve',
    hoja: hoja(g({ series: [fn('h(x)', '0', '1')] }), p('h(x) :=\n    return x')),
    ok: esperaError('r0', /Serie «f»/),
  },
  {
    nombre: 'una etiqueta con token resuelve con coma decimal; un token roto es error',
    hoja: hoja(
      m('T_s := 0.45 s'),
      g({ ejeX: { unidad: 's' }, series: [fn('1', '0 s', '1 s')], referencias: [{ tipo: 'vertical', valor: 'T_s', etiqueta: 'T* = {{T_s:s}} s' }] }),
      g({ series: [fn('1', '0', '1')], referencias: [{ tipo: 'horizontal', valor: '1', etiqueta: '{{no_existe}}' }] }),
    ),
    ok: (r) =>
      (r.r1?.grafico?.referencias?.[0]?.etiqueta === 'T* = 0,45 s'
        ? null
        : `etiqueta: «${r.r1?.grafico?.referencias?.[0]?.etiqueta}» (${r.r1?.error ?? ''})`) ?? esperaError('r2', /no_existe/)(r),
  },
  {
    nombre: 'los ticks caen en números redondos, con coma decimal',
    hoja: hoja(g({ series: [fn('x', '0', '3')] })),
    ok: (r) => {
      const t = r.r0?.grafico?.ejeX?.ticks?.map((k) => k.rotulo).join(' ');
      return t === '0,0 0,5 1,0 1,5 2,0 2,5 3,0' ? null : `ticks de X: «${t}» (${r.r0?.error ?? ''})`;
    },
  },
  {
    nombre: 'el eje Y llega al cero por defecto, y sin él no',
    hoja: hoja(g({ series: [fn('x + 10', '0', '2')] }), g({ ejeY: { incluirCero: false }, series: [fn('x + 10', '0', '2')] })),
    ok: (r) =>
      r.r0?.grafico?.ejeY?.min === 0 && r.r1?.grafico?.ejeY?.min > 0
        ? null
        : `mínimos de Y: ${r.r0?.grafico?.ejeY?.min} y ${r.r1?.grafico?.ejeY?.min}`,
  },
  {
    // Con el respiro del 4 %, el máximo de 250 000 no queda pegado al marco:
    // el extremo sube al tick redondo siguiente.
    nombre: 'valores grandes llevan la escala al título del eje',
    hoja: hoja(g({ ejeY: { titulo: 'M' }, series: [fn('250000*x', '0', '1')] })),
    ok: (r) => {
      const e = r.r0?.grafico?.ejeY;
      return e?.titulo === 'M [×10³]' && e.ticks.at(-1).rotulo === '300'
        ? null
        : `título «${e?.titulo}», último tick «${e?.ticks.at(-1)?.rotulo}»`;
    },
  },
  {
    nombre: 'el tope de iteraciones corta una función que no termina, y es error',
    hoja: hoja(p('lenta(x) :=\n    s := 0\n    while true\n        s := s + 1\n    return s'), g({ series: [fn('lenta(x)', '0', '1', { muestras: 3 })] })),
    ok: esperaError('r1', /Serie «f»/),
    maxMs: 20000,
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
    nombre: 'un token que da un complejo cae en faltantes, no se rotula «(1+2i)»',
    scope: () => scopeDe(p('f(x) :=\n    return sqrt(x)')),
    svg: '<svg><text>{{f(-1)}}</text></svg>',
    ok: conFaltante(/f\(-1\)/),
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

  // --- Nada se sale del papel --------------------------------------------------
  {
    nombre: 'una fórmula va en el envoltorio que ajusta al ancho, igual que en el canvas',
    hoja: () => hoja(['text', 'TÍTULO'], m('k := 7 =')),
    ok: (html) =>
      /<span class="wp-tex" data-ajuste="katex"><span class="katex">/.test(html)
        ? null
        : `falta el envoltorio wp-tex: ${html.slice(0, 400)}`,
  },
  {
    nombre: 'un programa sale una línea por span, con su sangría',
    hoja: () => hoja(['text', 'TÍTULO'], p('r :=\n    a := 2\n\n    return a\n')),
    ok: (html) => {
      const lineas = html.match(/<span class="wp-l" style="--s:\d+">[^<]*<\/span>/g) ?? [];
      if (lineas.length !== 4) return `se esperaban 4 líneas (sin la del salto final), hubo ${lineas.length}: ${lineas.join('')}`;
      if (!lineas[1].includes('--s:4">    a := 2')) return `la sangría no llegó: ${lineas[1]}`;
      if (!lineas[2].includes('--s:0"></span>')) return `la línea en blanco no quedó vacía: ${lineas[2]}`;
      return null;
    },
  },
];

// --- El SVG de un gráfico ------------------------------------------------------
//
// `svgDeGrafico` tiene que dar la misma cadena cada vez —el canvas, el papel y
// el render de Node la comparan sin saberlo— y nada que un navegador rechace.
{
  // Textos hostiles a propósito: el SVG se inyecta con `dangerouslySetInnerHTML`.
  const regiones = [
    { id: 't', kind: 'text', x: 40, y: 0, src: 'TÍTULO' },
    ...hoja(
      m('P := [0, 1; 1, 3; 2, 2]'),
      g(
        {
          ejeX: { titulo: 'T', unidad: 's' },
          ejeY: { titulo: 'Sa <img src=x onerror=alert(1)>' },
          series: [
            { tipo: 'funcion', nombre: 'Obra', expr: '2 - T/(1 s)', variable: 'T', desde: '0 s', hasta: '2 s' },
            { tipo: 'datos', nombre: 'Modelo & <b>', x: 'P[:, 1] * 1 s', y: 'P[:, 2]' },
          ],
          referencias: [
            { tipo: 'vertical', valor: '0.5 s', etiqueta: 'T*' },
            { tipo: 'punto', x: '1 s', y: '1', etiqueta: 'diseño' },
          ],
        },
        'Espectro <script>',
      ),
    ),
  ];
  const res = evaluateSheet(regiones);
  CASOS_PAPEL.push(
    {
      nombre: 'un gráfico sale como figura, con el título escapado y un SVG determinista',
      hoja: () => regiones,
      ok: (html) => {
        if (res.r1?.error) return `el gráfico dio error: ${res.r1.error}`;
        const a = svgDeGrafico(res.r1.grafico);
        const b = svgDeGrafico(evaluateSheet(regiones).r1.grafico);
        if (a !== b) return 'dos evaluaciones dieron SVG distintos';
        if (/NaN|Infinity|e[+-]\d/.test(a)) return `el SVG lleva un número no dibujable: ${a.match(/NaN|Infinity|e[+-]\d/)[0]}`;
        const decimales = a.match(/\d+\.\d{3,}/);
        if (decimales) return `una coordenada con más de 2 decimales: ${decimales[0]}`;
        if (/<img|<b>|<script/.test(a) || /<script/.test(html)) return 'se coló marcado sin escapar';
        if (!html.includes('<figure class="wp-fig wp-graf" data-wp-id="r1">')) return `falta la figura: ${html.slice(0, 300)}`;
        if (!html.includes('<figcaption class="wp-graf-tit">Espectro &lt;script&gt;</figcaption>')) return 'el título no salió escapado';
        if ((a.match(/<polyline /g) ?? []).length < 2) return 'faltan las polilíneas de las dos series';
        return null;
      },
    },
    {
      nombre: 'un gráfico con «imprimir: false» no sale en el papel',
      hoja: () => regiones.map((r) => (r.id === 'r1' ? { ...r, imprimir: false } : r)),
      ok: (html) => (html.includes('wp-graf') ? 'el gráfico oculto salió impreso' : null),
    },
  );
}

CASOS_PAPEL.push(
  {
    nombre: 'una tabla sale como tabla: título escapado, encabezado en th, la caja que se ajusta y la unidad arriba',
    hoja: () => [
      { id: 't', kind: 'text', x: 40, y: 0, src: 'TÍTULO' },
      ...hoja(
        t([['Franja', 'p'], ['1', 'p_1 := 0.5 kN/m^2 * 2 =']], { encabezado: 1, columnas: [{}, { unidad: 'kN/m^2', soloValor: true }] }, 'Presiones <b>'),
      ),
    ],
    ok: (html) => {
      if (!html.includes('<figure class="wp-tabla" data-wp-id="r0">')) return `falta la figura: ${html.slice(0, 400)}`;
      if (!html.includes('<figcaption class="wp-tabla-tit">Presiones &lt;b&gt;</figcaption>')) return 'el título no salió escapado';
      if (!html.includes('<div class="wp-tabla-caja" data-ajuste="tabla"><table><thead><tr><th class="wp-c">Franja</th>')) {
        return 'el encabezado no salió en th dentro de la caja de ajuste';
      }
      if (/<td[^>]*>.*data-ajuste="katex"/.test(html)) return 'una celda lleva su propio ajuste: se ajusta la tabla entera';
      if (!/<th class="wp-c">p <span class="wp-c-u">\[<span class="katex">/.test(html)) return 'la unidad no subió al encabezado';
      if (!/<td class="wp-c wp-c-valor"><span class="wp-tex"><span class="katex">/.test(html)) return 'la celda «solo valor» no va alineada como valor';
      return null;
    },
  },
  {
    nombre: 'una celda con error no tapa la tabla, y el error de publicación va debajo',
    hoja: () => [
      { id: 't', kind: 'text', x: 40, y: 0, src: 'TÍTULO' },
      ...hoja(t([['x'], ['x_1 := no_existe =']], { encabezado: 1, columnas: [{ nombre: 'x_t' }] })),
    ],
    ok: (html) =>
      (html.includes('<span class="wp-c-err">x_1 := no_existe =') ? null : 'la celda no muestra su error') ??
      (html.includes('<p class="wp-tabla-err">«x_t»: la celda de la fila 2, columna 1 tiene un error</p>')
        ? null
        : `falta el error de publicación: ${html.slice(html.indexOf('wp-tabla'), html.indexOf('wp-tabla') + 600)}`),
  },
);

// El script de ajuste que lleva el HTML de `render-planilla` es la función
// serializada: si nombrara algo de fuera de su cuerpo, compilaría aquí y
// reventaría en el navegador que abre el documento. Se compila y se corre
// contra una raíz sin fórmulas, que es lo que caza una referencia libre.
const CASOS_AJUSTE = [
  {
    nombre: 'el documento lleva el script de ajuste, y compila',
    ok: () => {
      const doc = documentoHtml({ titulo: 't', cuerpo: '', css: '' });
      const m = /<script>([\s\S]*?)<\/script>/.exec(doc);
      if (!m) return 'el documento no lleva el script de ajuste';
      try {
        new Function(m[1]);
      } catch (e) {
        return `el script no compila: ${e.message}`;
      }
      return documentoHtml({ titulo: 't', cuerpo: '', css: '', ajuste: false }).includes('<script>')
        ? 'con «ajuste: false» sigue llevando script'
        : null;
    },
  },
  {
    nombre: 'un gráfico sin especificación válida se descarta al cargar, con el motivo',
    ok: () => {
      const inf = sanearConInforme([
        { id: 'a', kind: 'plot', x: 40, y: 40, src: 'sin nada' },
        { id: 'b', kind: 'plot', x: 40, y: 90, src: 'sin series', grafico: { version: 1, ejeX: { titulo: 'x' }, ejeY: { titulo: 'y' }, series: [] } },
        { id: 'c', kind: 'plot', x: 40, y: 140, src: 'bueno', grafico: { version: 1, ejeX: { titulo: 'x' }, ejeY: { titulo: 'y' }, series: [{ tipo: 'datos', nombre: 'p', xy: 'P' }] } },
      ]);
      const motivos = inf.descartadas.map((d) => `${d.motivo}/${d.detalle}`).join(' ');
      if (motivos !== 'grafico/no-es-objeto grafico/sin-series') return `descartes: «${motivos}»`;
      return inf.regions.length === 1 && inf.regions[0].id === 'c' ? null : `quedaron ${inf.regions.length} regiones`;
    },
  },
  {
    nombre: 'una tabla sin especificación válida se descarta al cargar, con el motivo',
    ok: () => {
      const inf = sanearConInforme([
        { id: 'a', kind: 'table', x: 40, y: 40, src: '' },
        { id: 'b', kind: 'table', x: 40, y: 90, src: '', tabla: { version: 1, celdas: [['a', 'b'], ['c']] } },
        { id: 'c', kind: 'table', x: 40, y: 140, src: '', tabla: { version: 1, celdas: [['1']], encabezado: 3 } },
        { id: 'd', kind: 'table', x: 40, y: 190, src: '', tabla: { version: 1, celdas: [['1', '2']], columnas: [{}, {}, {}] } },
        { id: 'e', kind: 'table', x: 40, y: 240, src: 'buena', tabla: { version: 1, celdas: [['a := 1']], encabezado: 0 } },
      ]);
      const motivos = inf.descartadas.map((d) => `${d.motivo}/${d.detalle}`).join(' ');
      if (motivos !== 'tabla/no-es-objeto tabla/celdas tabla/encabezado tabla/columnas') return `descartes: «${motivos}»`;
      return inf.regions.length === 1 && inf.regions[0].id === 'e' ? null : `quedaron ${inf.regions.length} regiones`;
    },
  },
  {
    nombre: 'la función de ajuste es autocontenida: corre sola, sin nada de su módulo',
    ok: () => {
      const f = new Function(`return (${ajustarAnchos.toString()})`)();
      const r = f({ querySelectorAll: () => [] }, 680, 0.75);
      return Array.isArray(r) && r.length === 0 ? null : `devolvió ${JSON.stringify(r)}`;
    },
  },
];

// --- Los errores de mathjs, en español ---------------------------------------
//
// El motor deja el mensaje crudo (la obra lo lee para sus flechas) y la capa de
// presentación lo traduce. Estos casos son la red ante una actualización de
// mathjs que cambie un texto: si el crudo cambia, la regex deja de reconocerlo
// y el usuario vuelve a ver inglés sin que nada avise.
const { mensajeDeMotor } = await cargarMensajes();
const INGLES = /\b(the|of|is|not|do|does|expected|unexpected|undefined|function|argument|found|match)\b/i;

const CASOS_MENSAJES = [
  ['a := b_no_existe + 1', /Undefined symbol/, /«b_no_existe» no está definida/],
  ['a := g_no(3)', /Undefined function/, /la función «g_no» no está definida/],
  ['a := 1 kN + 2 m', /Units do not match/, /unidades no casan/],
  ['a := 3 kN = m', /Units do not match/, /«3 kN» no se puede expresar en «m»/],
  ['a := 3 kilopondios', /Undefined symbol/, /«kilopondios»/],
  ['a := sqrt("x")', /Cannot convert/, /«x» no es un número/],
  ['a := sqrt()', /Too few arguments/, /faltan argumentos en sqrt/],
  ['a := round(1, 2, 3, 4)', /Too many arguments/, /sobran argumentos en round: admite 2 y recibió 4/],
  ['a := [1, 2] + [1, 2, 3]', /shape mismatch/, /los tamaños no coinciden/],
  ['a := [1, 2; 3, 4] * [1, 2, 3]', /Dimension mismatch/, /2 columnas y el vector 3/],
  ['a := [1,2][0]', /Index out of range/, /índice fuera de rango: 0/],
  ['a := (1 + 2', /Parenthesis \) expected/, /falta cerrar un paréntesis \(carácter \d+\)/],
  ['a := 1 +', /Unexpected end of expression/, /termina de golpe/],
  ['a := 1 2 3 4', /Unexpected part/, /sobra «2»/],
  ['a := 1 m + 1', /Unexpected type of argument/, /tipo inesperado en el argumento 2 de addScalar/],
  ['sqrt(-4) < 1', /No ordering relation/, /no se pueden comparar números complejos/],
].map(([src, crudo, espanol]) => ({
  nombre: `mensaje en español: ${src}`,
  ok: () => {
    const e = evaluateSheet(hoja(m(src))).r0?.error;
    if (!e) return `«${src}» no dio error`;
    if (!crudo.test(e)) return `el crudo de mathjs cambió: «${e}»`;
    const t = mensajeDeMotor(e);
    // Sin distinguir mayúsculas: la traducción que abre el mensaje lleva la
    // inicial en mayúscula.
    if (!new RegExp(espanol.source, 'i').test(t)) return `traducción inesperada: «${t}» (crudo «${e}»)`;
    const resto = t.replace(/«[^»]*»/g, '');
    return INGLES.test(resto) ? `quedó inglés: «${t}»` : null;
  },
}));

// --- La región tabla -----------------------------------------------------------
//
// Cada celda tiene la gramática de una región math —no una segunda— y la tabla se
// evalúa fila a fila en su posición del orden de lectura, sobre el scope de la
// hoja. Lo que publica (la matriz, los vectores de columna) entra en el scope
// como cualquier definición.
const CP = [
  ['h/L', 'F1', 'F2'],
  ['0.5', '-0.9', '-0.5'],
  ['1', '-1.3', '-0.7'],
];
CASOS.push(
  {
    nombre: 'tabla: lo que define una celda lo ve la hoja de abajo',
    hoja: hoja(t([['a := 3 m']]), m('b := a*2 =')),
    ok: esperaValor('r1', '6 m'),
  },
  {
    nombre: 'tabla: se evalúa fila a fila, y una celda ve a las anteriores',
    hoja: hoja(t([['a := 2', 'b := a + 1'], ['c := b*a =', '']])),
    ok: esperaCelda('r0', 1, 0, '6'),
  },
  {
    nombre: 'tabla: una celda no ve las que van después',
    hoja: hoja(t([['x := y_t + 1', 'y_t := 2']])),
    ok: esperaErrorCelda('r0', 0, 0, /Undefined symbol y_t/),
  },
  {
    nombre: 'tabla: «= unidad» convierte en una celda, y una dimensión que no casa es error de la celda',
    hoja: hoja(t([['F := 2000 N = kN', 'G := 3 m = kN']])),
    ok: todas(esperaCelda('r0', 0, 0, '2 kN'), esperaErrorCelda('r0', 0, 1, /Units do not match/)),
  },
  {
    nombre: 'tabla: una definición de celda que falla retira la variable',
    hoja: hoja(m('a := 1'), t([['a := 1 kN + 2 m']]), m('b := a*10 =')),
    ok: esperaError('r2', /Undefined symbol a/),
  },
  {
    nombre: 'tabla: una variable que tapa una unidad deja el aviso en la celda y en la tabla',
    hoja: hoja(m('s := 20 cm'), t([['v := 3 m/s =']])),
    ok: (r) =>
      (celda(r, 'r1', 0, 0)?.aviso?.includes('tapa la unidad') ? null : 'la celda no lleva el aviso') ??
      (r.r1?.aviso?.includes('tapa la unidad') ? null : 'la tabla no lleva el aviso'),
  },
  {
    nombre: 'tabla: un complejo en una celda es un error',
    hoja: hoja(t([['z := sqrt(-4) =']])),
    ok: esperaErrorCelda('r0', 0, 0, /complejo/),
  },
  {
    nombre: 'tabla: texto, texto forzado con comilla y valores escritos',
    hoja: hoja(t([['Franja', "'Cp =", 'q*2'], ['-0.9', '3 m', '']])),
    ok: todas(
      esperaTipos('r0', [['texto', 'texto', 'texto'], ['literal', 'literal', 'vacia']]),
      (r) => (celda(r, 'r0', 0, 1)?.texto === 'Cp =' ? null : `el texto forzado quedó «${celda(r, 'r0', 0, 1)?.texto}»`),
      (r) => (r.r0?.defines?.length ? `definió ${JSON.stringify(r.r0.defines)}` : null),
    ),
  },
  {
    nombre: 'tabla: un número con coma decimal es texto, y la celda lo avisa',
    hoja: hoja(t([['0,5', '-1,25 m']])),
    ok: todas(
      esperaTipos('r0', [['texto', 'texto']]),
      (r) => (/coma/.test(celda(r, 'r0', 0, 0)?.aviso ?? '') ? null : `[0,0] sin aviso de coma: «${celda(r, 'r0', 0, 0)?.aviso}»`),
      (r) => (/coma/.test(celda(r, 'r0', 0, 1)?.aviso ?? '') ? null : `[0,1] sin aviso de coma: «${celda(r, 'r0', 0, 1)?.aviso}»`),
      esperaAviso('r0', /\[1,1\]/),
    ),
  },
  {
    nombre: 'tabla: un porcentaje escrito es texto, y la celda lo avisa',
    hoja: hoja(t([['50%']])),
    ok: (r) => (/%/.test(celda(r, 'r0', 0, 0)?.aviso ?? '') ? null : `sin aviso: «${celda(r, 'r0', 0, 0)?.aviso}»`),
  },
  {
    nombre: 'tabla: un texto que no parece número, o forzado con comilla, no se avisa',
    hoja: hoja(t([['Franja A, 1,5 veces', "'0,5", 'Zona 2']])),
    ok: sinAviso('r0'),
  },
  {
    nombre: 'tabla: el tope de iteraciones es de la tabla entera, no de cada celda',
    hoja: hoja(p('f(n) :=\n    s := 0\n    for i in 1:n\n        s := s + 1\n    s'), t([['a := f(260000) =', 'b := f(260000) =']])),
    ok: todas(esperaCelda('r1', 0, 0, '2.6\\cdot 10^5'), esperaErrorCelda('r1', 0, 1, /iteraciones/)),
  },
  {
    nombre: 'tabla: una columna publicada que mezcla dimensiones se avisa',
    hoja: hoja(t([['1 kN'], ['2 m']], { columnas: [{ nombre: 'v_t' }] })),
    ok: esperaAviso('r0', /v_t/),
  },
  {
    nombre: 'tabla: una matriz con cada columna en su unidad no se avisa (una serie x–y)',
    hoja: hoja(t([['1 m', '2 kN'], ['2 m', '3 kN']], { matriz: 'S_t' })),
    ok: sinAviso('r0'),
  },
  {
    nombre: 'tabla: un valor escrito sin unidad toma la de su columna, y la columna se publica',
    hoja: hoja(t([['p'], ['0.5']], { encabezado: 1, columnas: [{ unidad: 'kN/m^2', nombre: 'p_t' }] }), m('p_t[1] = kN/m^2')),
    ok: todas(esperaValor('r1', '0.5 kN / m^2'), esperaCelda('r0', 1, 0, '0.5')),
  },
  {
    nombre: 'tabla: un valor escrito lee sus unidades como unidades, aunque la hoja tenga una variable igual',
    hoja: hoja(m('m := 5'), t([['L'], ['3 m']], { encabezado: 1, columnas: [{ nombre: 'L_t' }] }), m('L_t[1] = cm')),
    ok: esperaValor('r2', '300 cm'),
  },
  {
    nombre: 'tabla: el cuerpo se publica como matriz y cada columna con nombre como vector',
    hoja: hoja(t(CP, { encabezado: 1, matriz: 'Cp_t', columnas: [{ nombre: 'hL_t' }] }), m('Cp_t[2, 3] ='), m('size(Cp_t) ='), m('hL_t[2] =')),
    ok: todas(esperaValor('r1', '-0.7'), esperaValor('r2', '[2, 3]'), esperaValor('r3', '1')),
  },
  {
    nombre: 'tabla: una tabla de norma se lee con interp sobre una columna de la matriz',
    hoja: hoja(t(CP, { encabezado: 1, matriz: 'Cp_t', columnas: [{ nombre: 'hL_t' }] }), m('Cp := interp(hL_t, Cp_t[:, 2], 0.75) =')),
    ok: esperaValor('r1', '-1.1'),
  },
  {
    nombre: 'tabla: dos columnas publicadas alimentan la serie x–y de un gráfico',
    hoja: hoja(
      t([['x', 'y'], ['0', '0'], ['1', '2']], { encabezado: 1, columnas: [{ nombre: 'x_t' }, { nombre: 'y_t' }] }),
      g({ series: [{ tipo: 'datos', nombre: 'd', x: 'x_t', y: 'y_t' }] }),
    ),
    ok: esperaTramos('r1', [[[0, 0], [1, 2]]]),
  },
  {
    nombre: 'tabla: texto en el cuerpo de una columna publicada es un error de la tabla, con su celda',
    hoja: hoja(t([['x'], ['abc']], { encabezado: 1, columnas: [{ nombre: 'x_t' }] })),
    ok: esperaError('r0', /fila 2, columna 1/),
  },
  {
    nombre: 'tabla: una celda vacía en la matriz es un error de la tabla',
    hoja: hoja(t([['1', '']], { matriz: 'M' })),
    ok: esperaError('r0', /fila 1, columna 2/),
  },
  {
    nombre: 'tabla: un nombre publicado que choca con una celda es un error',
    hoja: hoja(t([['a := 1']], { matriz: 'a' })),
    ok: esperaError('r0', /«a»/),
  },
  {
    nombre: 'tabla: una publicación fallida retira el nombre, como una definición',
    hoja: hoja(m('x_t := 1'), t([['x'], ['abc']], { encabezado: 1, columnas: [{ nombre: 'x_t' }] }), m('y := x_t =')),
    ok: esperaError('r2', /Undefined symbol x_t/),
  },
  {
    nombre: 'tabla: defines reúne las celdas y lo publicado, en orden',
    hoja: hoja(t([['a := 1', 'b := 2 ='], ['1', '2']], { matriz: 'M' })),
    ok: (r) => {
      const n = (r.r0?.defines ?? []).map((d) => d.nombre).join(',');
      return n === 'a,b,M' ? null : `defines: «${n}»${r.r0?.error ? ` (error: ${r.r0.error})` : ''}`;
    },
  },
  {
    nombre: 'tabla: «solo valor» imprime el número, y la unidad sube al encabezado',
    hoja: hoja(
      t([['p'], ['p_1 := 2 kN/m^2 * 3 =']], { encabezado: 1, columnas: [{ soloValor: true, unidad: 'kN/m^2' }] }),
      t([['p_2 := 2 kN/m^2 * 3']], { columnas: [{ soloValor: true, unidad: 'kN/m^2' }] }),
    ),
    ok: todas(
      (r) => (llano(celda(r, 'r0', 1, 0)?.tex) === '6' ? null : `con encabezado: «${llano(celda(r, 'r0', 1, 0)?.tex)}»`),
      (r) => (r.r0?.tabla?.unidades?.[0] ? null : 'el encabezado no lleva la unidad'),
      (r) => (/^6 kN/.test(llano(celda(r, 'r1', 0, 0)?.tex)) ? null : `sin encabezado: «${llano(celda(r, 'r1', 0, 0)?.tex)}»`),
    ),
  },
  {
    nombre: 'tabla: una comparación en una celda es un veredicto',
    hoja: hoja(t([['ok := 3 < 5 =', '2 > 3 =']])),
    ok: (r) =>
      celda(r, 'r0', 0, 0)?.bool === true && celda(r, 'r0', 0, 1)?.bool === false
        ? null
        : `veredictos: ${celda(r, 'r0', 0, 0)?.bool} / ${celda(r, 'r0', 0, 1)?.bool}`,
  },
  {
    nombre: 'tabla: en una columna con unidad, un número calculado sin unidades es un error',
    hoja: hoja(t([['k'], ['k_1 := 2 =']], { encabezado: 1, columnas: [{ unidad: 'kN' }] })),
    ok: esperaErrorCelda('r0', 1, 0, /no tiene unidades/),
  },

  // --- interp ------------------------------------------------------------------
  {
    nombre: 'interp: interpola entre dos puntos',
    hoja: hoja(m('y := interp([0, 10], [0, 100], 2.5) =')),
    ok: esperaValor('r0', '25'),
  },
  {
    nombre: 'interp: en un nodo, y en los extremos, devuelve el valor de la tabla',
    hoja: hoja(m('interp([0, 1, 2], [5, 7, 9.3], 1) ='), m('interp([0, 1, 2], [5, 7, 9.3], 2) ='), m('interp([0, 1, 2], [5, 7, 9.3], 0) =')),
    ok: todas(esperaValor('r0', '7'), esperaValor('r1', '9.3'), esperaValor('r2', '5')),
  },
  {
    nombre: 'interp: fuera de la tabla es un error, y dice cómo acotar a la vista',
    hoja: hoja(m('interp([0.5, 1], [-0.9, -1.3], 1.2) =')),
    ok: esperaError('r0', /fuera de la tabla.*min\(max/),
  },
  {
    nombre: 'interp: con unidades en los dos ejes',
    hoja: hoja(m('interp([0 m, 10 m], [0 kN, 100 kN], 250 cm) = kN')),
    ok: esperaValor('r0', '25 kN'),
  },
  {
    nombre: 'interp: un x sin unidades sobre una tabla con unidades es un error',
    hoja: hoja(m('interp([0 m, 10 m], [0, 1], 5) =')),
    ok: esperaError('r0'),
  },
  {
    nombre: 'interp: xs tiene que ser estrictamente creciente',
    hoja: hoja(m('interp([0, 2, 1], [0, 1, 2], 0.5) =')),
    ok: esperaError('r0', /creciente/),
  },
  {
    nombre: 'interp: xs e ys del mismo largo',
    hoja: hoja(m('interp([0, 1, 2], [0, 1], 0.5) =')),
    ok: esperaError('r0', /mismo largo/),
  },
);

// Las celdas de una tabla componen su LaTeX igual que una región: el ejecutor de
// abajo lo comprueba en `tex` y en cada celda.
const texDe = (res) => [res.tex, ...(res.tabla?.celdas ?? []).flat().map((x) => x.tex)].filter(Boolean);

// --- Una sola gramática: la celda contra la región, sobre todo el corpus ---------
//
// Cada región math del corpus que sea una fórmula se convierte en una tabla de
// 1×1 con el mismo `src`, y la hoja entera se vuelve a evaluar. Lo que imprime la
// celda —LaTeX, veredicto, error, aviso— tiene que ser idéntico a lo que imprimía
// la región, y lo de abajo tiene que seguir dando lo mismo. Si la celda tuviera
// su propia gramática, aquí se vería la primera diferencia.
{
  const { readdir, readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const dir = path.resolve(import.meta.dirname, '..', 'public', 'planillas');
  const esFormula = (src) => /:=/.test(src) || /=\s*[\p{L}\p{N}_*/^\s()-]*$/u.test(src);
  CASOS_AJUSTE.push({
    nombre: 'una celda de fórmula da lo mismo que la región math con el mismo src, en todo el corpus',
    ok: () => null,
    corpus: async () => {
      let comparadas = 0;
      for (const nombre of (await readdir(dir)).filter((n) => n.endsWith('.json')).sort()) {
        const { regions } = JSON.parse(await readFile(path.join(dir, nombre), 'utf8'));
        const antes = evaluateSheet(regions);
        const convertidas = new Set();
        const tablas = regions.map((r) => {
          if (r.kind !== 'math' || !esFormula(r.src)) return r;
          convertidas.add(r.id);
          return { ...r, kind: 'table', src: '', tabla: { version: 1, celdas: [[r.src]] } };
        });
        const despues = evaluateSheet(tablas);
        for (const r of regions) {
          const a = antes[r.id] ?? {};
          const b = convertidas.has(r.id) ? { ...(despues[r.id]?.tabla?.celdas?.[0]?.[0] ?? {}) } : despues[r.id] ?? {};
          if (convertidas.has(r.id)) {
            if (b.tipo !== 'formula') return `${nombre} ${r.id}: la celda «${r.src}» se leyó como ${b.tipo}`;
            comparadas++;
          }
          for (const k of ['tex', 'bool', 'error', 'aviso']) {
            if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
              return `${nombre} ${r.id} («${r.src.slice(0, 60)}»): ${k} «${a[k]}» ≠ «${b[k]}»`;
            }
          }
        }
      }
      return comparadas > 1000 ? null : `solo se compararon ${comparadas} celdas`;
    },
  });
}

let fallos = 0;
for (const caso of CASOS_AJUSTE) {
  if (!caso.corpus) continue;
  const motivo = await caso.corpus().catch((e) => `lanzó: ${e.message}`);
  caso.ok = () => motivo;
}
for (const caso of [...CASOS_AJUSTE, ...CASOS_MENSAJES]) {
  let motivo;
  try {
    motivo = caso.ok();
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
    const r = evaluateSheet(caso.hoja, caso.scope?.());
    motivo = caso.ok(r);
    if (!motivo) {
      for (const [id, res] of Object.entries(r)) {
        for (const tex of texDe(res)) {
          try {
            katex.renderToString(tex, { throwOnError: true });
          } catch (e) {
            motivo = `el LaTeX de ${id} no compone: ${e.message}\n            ${tex}`;
            break;
          }
        }
        if (motivo) break;
      }
      for (const [id, res] of Object.entries(r)) {
        for (const u of res.tabla?.unidades ?? []) {
          if (!u || motivo) continue;
          try {
            katex.renderToString(u, { throwOnError: true });
          } catch (e) {
            motivo = `la unidad del encabezado de ${id} no compone: ${e.message}\n            ${u}`;
          }
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

const total =
  CASOS.length + CASOS_ESQUEMA.length + CASOS_PAPEL.length + CASOS_AJUSTE.length + CASOS_MENSAJES.length;
console.log(`\n${fallos ? 'FALLA' : 'OK'}: ${total - fallos} de ${total} casos.\n`);
process.exit(fallos ? 1 : 0);
