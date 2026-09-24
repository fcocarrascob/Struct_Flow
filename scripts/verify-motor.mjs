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

const { evaluateSheet, renderEsquema, renderHtml, documentoHtml, ajustarAnchos, svgDeGrafico, sanearConInforme } =
  await cargarMotor();

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
  ['a := b + 1', /Unexpected type of argument/, /tipo inesperado en el argumento 2 de addScalar/],
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

let fallos = 0;
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

const total =
  CASOS.length + CASOS_ESQUEMA.length + CASOS_PAPEL.length + CASOS_AJUSTE.length + CASOS_MENSAJES.length;
console.log(`\n${fallos ? 'FALLA' : 'OK'}: ${total - fallos} de ${total} casos.\n`);
process.exit(fallos ? 1 : 0);
