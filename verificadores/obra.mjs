#!/usr/bin/env node
// Casos de regresión del canvas de una obra: obras mínimas con lo que tienen
// que dar.
//
//   npm run verify:obra
//
// POR QUÉ NO ESTÁ EN `scripts/`
// -----------------------------
// El harness sella el motor de este repo como el hash de árbol de `src/lib` +
// `scripts` (lint E13), y mover ese hash marca `eval_de_otro_motor` en todas
// las planillas de todos sus proyectos. Un verificador de la capa de obra no
// tiene por qué disparar esa cascada, así que vive fuera. Es la misma razón por
// la que `src/proyecto/` no está dentro de `src/lib/`.
//
// QUÉ SE COMPRUEBA
// ----------------
// La capa pura: quién define qué, quién usa qué, el orden topológico que de ahí
// sale, y los dos fallos que ese modelo trae y no puede resolver —un nombre
// definido en dos nodos y un ciclo—. Más el encadenamiento: lo que una planilla
// publica al scope de la obra y lo que un campo atado lee de él.
//
// Cada caso es una obra y una comprobación que recibe la evaluación y la
// proyección y devuelve `null` si cuadra, o el motivo del fallo.

import { mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { compilarEntrada, ROOT } from '../scripts/lib/motor.mjs';
import { CADUCIDAD_MS, crearObras } from '../servidor/obras.mjs';

// Un solo bundle: la obra, el motor y el armado de una genérica comparten
// instancia de mathjs. Ver la cabecera de `src/proyecto/obra/engine.ts`.
const motor = await compilarEntrada('src/proyecto/obra/engine.ts');
const {
  evaluarObra,
  proyectar,
  invariantesDeObra,
  desfaseDePlantilla,
  colocar,
  colocarPorGrupo,
  problemaDeGrafo,
  rupturaPorQuitar,
  resolverExpresion,
  moduloDeBiblioteca,
  problemaDeAlias,
  sanearObra,
  archivoDeObra,
  idDeObra,
  idNodoDeCalculo,
  parseMathRegion,
  trazoDe,
  ladoDe,
  borrarGrupo,
  // Lo que todavía no existe: estos casos se escriben antes que el modelo y
  // fallan a propósito hasta que lo haya. `evaluarImportada` sí existe ya.
  evaluarImportada,
  evaluarHojaConFrontera,
  desprender,
  insertarEnHoja,
  ordenDeLectura,
  nombresSueltos,
  PASO_LECTURA,
  partirObra,
  unirObra,
  marcarRevision,
  porRevisar,
  valorDe,
  comoDe,
  objetosDe,
  cargasPorPatron,
  firmaDe,
  cargaDe,
  verificar,
  verificarFactor,
  verificarFuncion,
  verificarEscalar,
  verificarDelModelo,
  resumirJustificaciones,
  resumirPorParte,
  familiaDe,
  columnasDe,
  terminoDe,
  resumenCombinaciones,
  quitarModulo,
  resumenModal,
  atrasoDe,
  cortesSismicos,
  gravitacionalesConHorizontal,
  fuerza,
  extremosPorCaso,
  casosConTraccion,
  descuadresConBasal,
  combosDeConjunto,
  gobernantesDeConjunto,
  estadoConjunto,
  extremosDeConjunto,
  tiposDeApoyo,
  envolventeDeTipo,
  nuevoConjunto,
  conConjunto,
  quitarConjunto,
  conAliasTipo,
  aliasPorDefecto,
  publicaApoyos,
  obraDesde,
  traerNodos,
  dependenciasDe,
  choquesCon,
  nombresDefinidos,
  trasladarPosiciones,
  regionQueDefine,
  evaluateSheet,
  VISTAS,
  datosPorDefecto,
  configCompleta,
  armarEnsamble,
  reconfigurar,
  cumple,
  problemasDePlantilla,
  barrasPerimetro,
  svgVistas,
} = motor;

// ── Armar una obra ───────────────────────────────────────────────────────────

// Las regiones llevan coordenadas: el orden de lectura es `(y, x)`, y el paso de
// 48 px es el de la cuadrícula del canvas. `calc` las reparte desde el origen del
// papel, que es lo que hace `migrarBloques` con una obra guardada.
let n = 0;
let yCorrida = 40;
const m = (src) => ({ id: `b${n++}`, kind: 'math', x: 40, y: (yCorrida += 48), src });
const t = (src) => ({ id: `b${n++}`, kind: 'text', x: 40, y: (yCorrida += 48), src });
const pr = (src) => ({ id: `b${n++}`, kind: 'program', x: 40, y: (yCorrida += 48), src });

/** Un nodo de cálculo con su hoja libre. */
function calc(id, ...hoja) {
  yCorrida = 40;
  return { id, nombre: id, hoja: hoja.map((r, i) => ({ ...r, y: 40 + i * 48 })) };
}
function conPlanilla(id, frontera) {
  return { id, nombre: id, hoja: [], frontera };
}
function obra(...calculos) {
  return {
    version: 2,
    id: 'caso',
    nombre: 'Caso',
    creada: '2026-01-01T00:00:00.000Z',
    modulos: [],
    calculos,
  };
}

// ── Comprobaciones ───────────────────────────────────────────────────────────

const K = (id) => idNodoDeCalculo(id);

/** El valor de una variable del scope de la obra, formateado como lo ve quien lo lee. */
const valor = (ev, nombre) => (ev.scope[nombre] === undefined ? undefined : String(ev.scope[nombre]));

/**
 * Una variable del scope, en la unidad pedida, o `null` si no cuadra.
 *
 * Se compara así y no contra la cadena que imprime math.js porque math.js
 * simplifica al formatear: `kN*m` sale como `MJ`, un momento escrito como
 * energía. Es una deuda conocida del motor (`docs/pendientes.md`) y no tiene
 * nada que ver con lo que estos casos comprueban. `resolverExpresion` es además
 * la misma conversión que hace un campo atado.
 */
function en(scope, nombre, unidad) {
  const r = resolverExpresion(nombre, unidad, scope);
  return r.error ? null : r.valor;
}

const esperaValor = (nombre, esperado) => (ev) => {
  const v = valor(ev, nombre);
  return v === esperado ? null : `«${nombre}» = ${v ?? 'sin definir'}, se esperaba ${esperado}`;
};
const esperaSinDefinir = (nombre) => (ev) =>
  ev.scope[nombre] === undefined ? null : `«${nombre}» quedó definida y no debía: ${valor(ev, nombre)}`;
const esperaCiclo = (...ids) => (ev) => {
  const fuera = ids.filter((id) => !ev.enCiclo.has(K(id)));
  return fuera.length ? `no se detectó el ciclo en: ${fuera.join(', ')}` : null;
};
const sinCiclo = (ev) => (ev.enCiclo.size ? `ciclo inventado: ${[...ev.enCiclo].join(', ')}` : null);
const esperaRepetido = (nombre, cuantos) => (ev) => {
  const ids = ev.repetidos.get(nombre);
  if (!ids) return `«${nombre}» no se declaró repetida`;
  return ids.length === cuantos ? null : `«${nombre}» repetida en ${ids.length} nodos, se esperaban ${cuantos}`;
};
const esperaArista = (desde, hasta, etiqueta) => (ev, proy) => {
  const a = proy.aristas.find((x) => x.desde === K(desde) && x.hasta === K(hasta) && x.tipo === 'dato');
  if (!a) {
    const hay = proy.aristas.filter((x) => x.tipo === 'dato').map((x) => `${x.desde}→${x.hasta}`);
    return `falta la flecha ${desde}→${hasta}; hay: [${hay.join(' · ')}]`;
  }
  return etiqueta === undefined || a.etiqueta === etiqueta
    ? null
    : `la flecha ${desde}→${hasta} dice «${a.etiqueta}», se esperaba «${etiqueta}»`;
};
const sinArista = (desde, hasta) => (ev, proy) =>
  proy.aristas.some((x) => x.desde === K(desde) && x.hasta === K(hasta) && x.tipo === 'dato')
    ? `sobra la flecha ${desde}→${hasta}`
    : null;
const esperaProblema = (id, patron) => (ev) => {
  const p = problemaDeGrafo(K(id), ev);
  if (!p) return `${id} no tiene problema de grafo y debería`;
  return patron.test(p) ? null : `${id}: problema inesperado «${p}»`;
};
const todas =
  (...fs) =>
  (ev, proy) =>
    fs.map((f) => f(ev, proy)).find((x) => x) ?? null;

// ── Las genéricas, para los casos de encadenamiento ──────────────────────────

/** Arma el módulo de una genérica desde el archivo, como hace la aplicación
 *  después de descargarlo: mismo `moduloDeBiblioteca`, mismo sha256 de bytes. */
async function generica(rel) {
  const archivo = path.join(ROOT, 'public', 'biblioteca', rel);
  const crudo = await readFile(archivo);
  const hoja = JSON.parse(crudo.toString('utf8'));
  const sha256 = createHash('sha256').update(crudo).digest('hex');
  return moduloDeBiblioteca(hoja, { sha256 });
}

const PLACA = await generica('acero/placa-base-generica.json');
const ZAPATA = await generica('hormigon/zapata-generica.json');
/** La más grande del repo: 324 regiones y más de 300 nombres definidos. Es la
 *  que hace falta para comprobar que una frontera de verdad contiene. */
const PEDESTAL = await generica('hormigon/pedestal-generico.json');

const genericas = {
  [PLACA.id]: { fase: 'lista', modulo: PLACA },
  [ZAPATA.id]: { fase: 'lista', modulo: ZAPATA },
  [PEDESTAL.id]: { fase: 'lista', modulo: PEDESTAL },
};

/** Las cinco genéricas de la base de columna, para los casos del ensamble. */
const ANCLAJE = await generica('hormigon/anclaje-hormigon-generica.json');
const LLAVE = await generica('acero/llave-corte-generica.json');
const SILLA = await generica('acero/silla-anclaje-generica.json');
const genericasBase = Object.fromEntries(
  [PLACA, PEDESTAL, ANCLAJE, LLAVE, SILLA].map((g) => [g.id, { fase: 'lista', modulo: g }]),
);
const sellosBase = Object.fromEntries([PLACA, PEDESTAL, ANCLAJE, LLAVE, SILLA].map((g) => [g.id, g.biblioteca?.sha256 ?? '']));
const ROTULADA = await generica('acero/placa-base-rotulada-generica.json');
const genericasConRotulada = { ...genericasBase, [ROTULADA.id]: { fase: 'lista', modulo: ROTULADA } };
const sellosConRotulada = { ...sellosBase, [ROTULADA.id]: ROTULADA.biblioteca?.sha256 ?? '' };

/** Las regiones de una genérica, como quedan al desprenderla: instanciadas. */
const hojaDe = (modulo) => modulo.construirHoja(modulo.porDefecto);

/** Un nodo con su hoja de regiones y, si se le da, su frontera. */
function conFrontera(id, hoja, frontera) {
  return { id, nombre: id, hoja, frontera };
}

/** Una región con coordenadas, para los casos de la hoja del nodo. */
const reg = (kind, src, y, x = 40) => ({ id: `b${n++}`, kind, x, y, src });

/**
 * Ningún nombre que la hoja define puede aparecer en el scope de la obra, salvo
 * los alias que su `publica` declara.
 *
 * Es el caso que justifica el diseño entero. `pedestal-generico` define más de
 * 300 nombres —`d`, `As`, `phi`, `b`, `s`…—: uno solo que se filtre deja al
 * primer nodo que use esa letra en rojo por «definida en 2 nodos», y un aviso
 * que salta por lo que no es deja de leerse.
 */
const noFiltra =
  (hoja, ...salvo) =>
  (ev) => {
    const permitidos = new Set(salvo);
    const fugados = [
      ...new Set(
        hoja
          .filter((x) => x.kind === 'math')
          .map((x) => parseMathRegion(x.src).varName)
          .filter((nom) => nom && !permitidos.has(nom) && ev.scope[nom] !== undefined),
      ),
    ];
    return fugados.length
      ? `se filtraron ${fugados.length} nombres al scope común: ${fugados.slice(0, 8).join(', ')}…`
      : null;
  };

/** Una referencia a una genérica, con sus entradas por omisión. */
function importada(modulo, extra = {}) {
  return {
    procedencia: 'biblioteca',
    slug: modulo.id,
    sha256: modulo.biblioteca.sha256,
    entradas: { ...modulo.porDefecto },
    ...extra,
  };
}

// ── Dos cargas del modelo de prueba del Pachón, como las entrega el puente ────

const CARGA_CUB = { patron: 'SDL_CUB', clase: 'area-a-barras', csys: 'GLOBAL', dir: 10, dist: 1, valor: 0.0980665, n: 33 };
const CARGA_VIA = { patron: 'CM_VIA', clase: 'barra-distribuida', csys: 'GLOBAL', dir: 10, momento: false, valor: 0.769, n: 22 };

// Cinco modos armados a mano, con la forma que entrega el puente: Y domina en el
// 1, X en el 3, y la acumulada pasa el 90 % en Y en el modo 1 y en X en el 4.
const modo = (n, T, ux, uy, sux, suy) => ({ n, T, f: 1 / T, ux, uy, uz: 0, rz: 0, sux, suy, suz: 0 });
const MODOS = [
  modo(1, 0.715, 0, 0.94, 0, 0.94),
  modo(2, 0.477, 0.01, 0, 0.01, 0.94),
  modo(3, 0.459, 0.7, 0.01, 0.71, 0.95),
  modo(4, 0.404, 0.2, 0, 0.91, 0.95),
  modo(5, 0.378, 0.02, 0.01, 0.93, 0.96),
];
const LECTURA_MODAL = { modelo: 'm.sdb', leido: '2026-09-25T12:30:00Z', modificado: '2026-09-25T12:29:49Z', caso: 'MODAL', modos: MODOS };

// La reacción basal del Pachón, tal como la lee el puente (kN, kN·m), más un
// caso gravitacional que empuja de lado, inventado para que el control salte.
const basal = (caso, fx, fy, fz, paso) => ({ caso, ...(paso ? { paso } : {}), fx, fy, fz, mx: 0, my: 0, mz: 0 });
const LECTURA_BASAL = {
  modelo: 'm.sdb', leido: '2026-09-25T13:00:00Z', modificado: '2026-09-25T12:29:49Z',
  filas: [
    basal('CM', 7e-12, 9e-11, 10483.1932),
    basal('RSX', 3585.98921, 3e-13, -2e-12),
    basal('RSY', 25.7196751, 2198.58839, 261.488616, 'Max'),
    basal('WXP', -260.76402, 179.344, -603.440226),
    basal('SDL_MAL', 40, 0, 1000),
  ],
  sinAnalizar: [],
};
const SAP_BASAL = {
  modelo: 'm.sdb', ruta: '', version: '', leido: '', modificado: '2026-09-25T12:29:49Z',
  patrones: { modelo: 'm.sdb', leido: '', lista: [
    { nombre: 'DEAD', tipo: 'Dead', pesoPropio: 1 },
    { nombre: 'SDL', tipo: 'Dead', pesoPropio: 0 },
    { nombre: 'WXP', tipo: 'Wind', pesoPropio: 0 },
  ] },
  casos: { modelo: 'm.sdb', leido: '', lista: [
    { nombre: 'CM', tipo: 'LinearStatic', estado: 'analizado', cargas: [{ tipo: 'Load', nombre: 'DEAD', sf: 1 }] },
    { nombre: 'RSY', tipo: 'ResponseSpectrum', estado: 'analizado' },
    { nombre: 'RSX', tipo: 'ResponseSpectrum', estado: 'analizado' },
    { nombre: 'WXP', tipo: 'LinearStatic', estado: 'analizado', cargas: [{ tipo: 'Load', nombre: 'WXP', sf: 1 }] },
    { nombre: 'SDL_MAL', tipo: 'LinearStatic', estado: 'analizado', cargas: [{ tipo: 'Load', nombre: 'SDL', sf: 1 }] },
  ] },
  espectro: { modelo: 'm.sdb', leido: '', funciones: [], casos: [
    { nombre: 'RSX', modal: 'MODAL', combinacion: 'CQC', amortiguamiento: 0.05, cargas: [{ dir: 'U1', funcion: 'F', sf: 1.96, csys: 'GLOBAL', angulo: 0 }] },
    { nombre: 'RSY', modal: 'MODAL', combinacion: 'CQC', amortiguamiento: 0.05, cargas: [{ dir: 'U2', funcion: 'F', sf: 1.4, csys: 'GLOBAL', angulo: 0 }] },
  ] },
};

// Tres apoyos y tres casos, con la forma que entrega el puente: CM comprime
// todo (y suma la FZ basal de CM), WXP levanta el nudo 7, RSY es un espectro.
const LECTURA_APOYOS = {
  modelo: 'm.sdb', leido: '2026-09-25T13:00:00Z', modificado: '2026-09-25T12:29:49Z',
  apoyos: [{ nombre: '1', xyz: [0, 0, 0] }, { nombre: '3', xyz: [0, 25.4, 0] }, { nombre: '7', xyz: [8, 0, 0] }],
  casos: [
    { caso: 'CM', valores: [[48.7, 13.2, 330, -97.1, 0, -0.1], [0.3, 5.6, 10000, -78.9, 0, 0], [-49, -18.8, 153.1932, 0, 0, 0]] },
    { caso: 'WXP', valores: [[-80, 60, 120, 10, 0, 0], [-100, 60, 50, 5, 0, 0], [-80.76, 59.3, -40.5, 300, 20, 0]] },
    { caso: 'RSY', paso: 'Max', valores: [[6.7, 129, 64.3, 976.8, 0, 1.6], [0.04, 107.5, 127, 979.7, 0, 0], null] },
  ],
  sinAnalizar: [],
};

// Cuatro combinaciones del Pachón, tal como las lee el puente: una envolvente
// que entra anidada en dos sísmicas, y una de viento.
const caso = (nombre, sf) => ({ clase: 'caso', nombre, sf });
const COMBOS_PACHON = [
  { nombre: 'ENVCL_H', tipo: 'Envolvente', terminos: [caso('CLH_P1', 1), caso('CLH_P2', 1), caso('CLH_P3', 1)] },
  { nombre: 'B25_EX_EVP', tipo: 'Lineal', terminos: [caso('CM', 1.2), { clase: 'combinacion', nombre: 'ENVCL_H', sf: 1 }, caso('EV', 1), caso('RSX', 1), caso('S', 0.5)] },
  { nombre: 'B25_EX_EVN', tipo: 'Lineal', terminos: [caso('CM', 1.2), { clase: 'combinacion', nombre: 'ENVCL_H', sf: 1 }, caso('EV', -1), caso('RSX', 1), caso('S', 0.5)] },
  { nombre: 'B23_WXP', tipo: 'Lineal', terminos: [caso('CM', 1.2), caso('WXP', 0.8), caso('LR', 1.6)] },
];

// ── Los casos ────────────────────────────────────────────────────────────────

const CASOS = [
  // --- El grafo de nombres --------------------------------------------------
  {
    nombre: 'el orden lo decide la dependencia, no el orden de creación',
    // `B` está escrito primero y usa lo que define `A`: sin orden topológico,
    // el motor lo evaluaría con `A_planta` sin definir.
    obra: obra(calc('B', m('carga := A_planta * 500 kgf/m^2 = tonf')), calc('A', m('A_planta := 4 m * 3 m'))),
    ok: todas(esperaValor('carga', '6 tonf'), esperaArista('A', 'B', 'A_planta')),
  },
  {
    nombre: 'una cadena de tres nodos se ordena entera',
    obra: obra(
      calc('C', m('c := b * 2')),
      calc('B', m('b := a + 1')),
      calc('A', m('a := 10')),
    ),
    ok: todas(esperaValor('c', '22'), esperaArista('A', 'B'), esperaArista('B', 'C'), sinCiclo),
  },
  {
    nombre: 'una función definida en un programa tiene dueño, y quien la llama va después',
    // `f(x) := …` solo se puede escribir en una región `program`: en una `math`
    // es un error de sintaxis. Si el grafo solo mirara las `math`, la función no
    // tendría dueño, no habría flecha, y el nodo que la llama podía quedar
    // delante en el orden de lectura y fallar con «Undefined function».
    obra: obra(calc('B', m('y := dobla(3) =')), calc('A', pr('dobla(u) := 2 * u'))),
    ok: todas(esperaValor('y', '6'), esperaArista('A', 'B', 'dobla'), sinCiclo),
  },
  {
    nombre: 'un gráfico que dibuja lo que publica otro nodo va después, con su flecha',
    // Su `src` es el título: lo que usa está en la especificación. Sin leerla, el
    // nodo del gráfico podía quedar delante de quien define la función.
    obra: obra(
      calc('B', {
        id: `b${n++}`,
        kind: 'plot',
        x: 40,
        y: 40,
        src: 'Carga',
        grafico: {
          version: 1,
          ejeX: { titulo: 'x' },
          ejeY: { titulo: 'q' },
          series: [{ tipo: 'funcion', nombre: 'q', expr: 'q_de(x)', variable: 'x', desde: '0', hasta: 'L_luz' }],
        },
      }),
      calc('A', pr('q_de(u) := 2 * u'), m('L_luz := 6')),
    ),
    ok: todas(esperaArista('A', 'B'), sinCiclo),
  },
  {
    nombre: 'la variable de la función de un gráfico no es un uso: no dibuja flecha',
    // La `x` de `x^2` es del gráfico. Leerla como uso dibujaría una flecha hacia
    // el nodo que define otra `x`.
    obra: obra(
      calc('A', m('x := 3')),
      calc('B', {
        id: `b${n++}`,
        kind: 'plot',
        x: 40,
        y: 40,
        src: 'Parábola',
        grafico: {
          version: 1,
          ejeX: { titulo: 'x' },
          ejeY: { titulo: 'y' },
          series: [{ tipo: 'funcion', nombre: 'y', expr: 'x^2', variable: 'x', desde: '0', hasta: '1' }],
        },
      }),
    ),
    ok: todas(sinArista('A', 'B'), sinCiclo),
  },
  {
    nombre: 'lo que define una celda de tabla tiene dueño, y quien lo usa va después',
    // Las celdas no tienen id propio: el grafo las lee de la especificación. Sin
    // eso, el nodo que usa `q_cub` quedaba delante y fallaba sin flecha.
    obra: obra(
      calc('B', m('Q := q_cub * 2 =')),
      calc('A', {
        id: `b${n++}`,
        kind: 'table',
        x: 40,
        y: 40,
        src: 'Cargas',
        tabla: { version: 1, celdas: [['Cubierta', 'q_cub := 0.5 =']] },
      }),
    ),
    ok: todas(esperaValor('Q', '1'), esperaArista('A', 'B', 'q_cub'), sinCiclo),
  },
  {
    nombre: 'una columna publicada por una tabla dibuja su flecha, y una celda que usa otro nodo también',
    obra: obra(
      calc('C', m('h_1 := hL_t[2] =')),
      calc('B', {
        id: `b${n++}`,
        kind: 'table',
        x: 40,
        y: 40,
        src: '',
        tabla: { version: 1, celdas: [['h/L'], ['0.5'], ['h_max']], encabezado: 1, columnas: [{ nombre: 'hL_t' }] },
      }),
      calc('A', m('h_max := 1')),
    ),
    // La tercera fila es texto, así que la columna no se publica: el nodo C sale
    // en rojo, pero la flecha B → C existe igual (C nombra lo que B declara).
    ok: todas(esperaArista('B', 'C', 'hL_t'), sinArista('A', 'B'), sinCiclo),
  },
  {
    nombre: 'ninguna flecha de datos apunta hacia atrás en el canvas',
    // La columna era la del TIPO más el nivel en la cadena, y un nodo que usaba
    // lo que publicaba otro de un tipo más a la derecha quedaba A SU IZQUIERDA:
    // la flecha volvía hacia atrás. Con un modelo de SAP a la izquierda de los
    // cálculos, sigue siendo el caso que lo prueba.
    obra: {
      ...obra(calc('K', m('q_k := 3 kN/m^2')), calc('C', m('q_cm := q_k'))),
      modulos: ['sap'],
    },
    ok: (ev, proy) => {
      for (const pos of [
        colocar(proy.nodos, proy.aristas),
        colocarPorGrupo(proy.nodos, proy.aristas, () => undefined, []),
      ]) {
        const atras = proy.aristas
          .filter((a) => pos[a.desde] && pos[a.hasta] && pos[a.hasta].x <= pos[a.desde].x)
          .map((a) => `${a.desde}→${a.hasta}`);
        if (atras.length) return `flechas hacia atrás: ${atras.join(' · ')}`;
      }
      return null;
    },
  },
  {
    nombre: 'dos nodos que se citan en círculo quedan marcados y no se evalúan',
    obra: obra(calc('A', m('a := b + 1')), calc('B', m('b := a + 1'))),
    ok: todas(esperaCiclo('A', 'B'), esperaSinDefinir('a'), esperaProblema('A', /círculo/)),
  },
  {
    nombre: 'un nombre definido en dos nodos no tiene dueño, y los dos lo dicen',
    obra: obra(calc('A', m('x := 1')), calc('B', m('x := 2')), calc('C', m('y := x'))),
    ok: todas(
      esperaRepetido('x', 2),
      esperaProblema('A', /«x» está definida en 2 nodos/),
      esperaProblema('B', /«x» está definida en 2 nodos/),
      // Sin dueño no hay flecha: cuál de los dos alimenta a C es indecidible.
      sinArista('A', 'C'),
      sinArista('B', 'C'),
    ),
  },
  {
    nombre: 'una palabra de un bloque de texto no crea una dependencia',
    // El fallo que esto cierra: con la prosa contando como uso, esta obra
    // fabricaba un ciclo A↔B y pintaba los dos nodos en rojo.
    obra: obra(
      calc('A', m('area := 12 m^2'), m('r := b_sup')),
      calc('B', t('el area de planta se midió en terreno'), m('b_sup := 3 m')),
    ),
    ok: todas(sinCiclo, sinArista('A', 'B'), esperaArista('B', 'A', 'b_sup'), esperaValor('r', '3 m')),
  },
  {
    nombre: 'un nombre dentro de un texto de una fórmula no crea una dependencia',
    // `"area"` es una cadena: la regex de antes la leía como el nombre `area`.
    obra: obra(calc('A', m('area := 12 m^2')), calc('B', m('etiqueta := "area útil" ='))),
    ok: todas(sinCiclo, sinArista('A', 'B')),
  },
  {
    nombre: 'la unidad de conversión tras «=» no es un uso, aunque otro nodo defina ese nombre',
    obra: obra(calc('A', m('m := 5')), calc('B', m('L := 450 cm = m'))),
    ok: todas(sinCiclo, sinArista('A', 'B'), esperaValor('L', '4.5 m')),
  },
  {
    nombre: 'un nombre no ASCII publicado por un nodo dibuja su flecha',
    obra: obra(calc('A', m('σ_c := 25 MPa')), calc('B', m('f := σ_c * 2 = MPa'))),
    ok: todas(esperaArista('A', 'B', 'σ_c'), esperaValor('f', '50 MPa')),
  },
  {
    nombre: 'una unidad y una función no son dependencias de nadie',
    obra: obra(calc('A', m('v := sqrt(16) * 1 kN'))),
    ok: todas(sinCiclo, esperaValor('v', '4 kN'), (ev) =>
      ev.usos.get(K('A'))?.size ? `A cree que usa: ${[...ev.usos.get(K('A'))].join(', ')}` : null,
    ),
  },
  {
    nombre: 'una definición que falla retira la variable, y lo de abajo no calcula con el valor viejo',
    obra: obra(calc('A', m('a := 1 kN + 2 m')), calc('B', m('b := a * 10'))),
    ok: todas(esperaSinDefinir('a'), esperaSinDefinir('b')),
  },

  // --- Campos atados: la obra entra en una planilla --------------------------
  {
    nombre: 'un campo atado convierte a la unidad que declara el campo',
    obra: obra(calc('A', m('M := 2 tonf*m'))),
    ok: (ev) => {
      // `Mu_Y` de la zapata está en kN*m: 2 tonf*m = 19,6133 kN*m.
      const r = resolverExpresion('M', 'kN*m', ev.scope);
      if (r.error) return `no resolvió: ${r.error}`;
      return Math.abs(r.valor - 19.6133) < 1e-3 ? null : `dio ${r.valor}, se esperaban ~19,613`;
    },
  },
  {
    nombre: 'un campo atado a algo que no tiene esa dimensión falla, no entrega un número',
    obra: obra(calc('A', m('A_planta := 12 m^2'))),
    ok: (ev) => {
      const r = resolverExpresion('A_planta', 'kN*m', ev.scope);
      return r.error ? null : `entregó ${r.valor} para un área en un campo de momento`;
    },
  },
  {
    nombre: 'un campo atado a una expresión sin unidades cuando el campo pide unidad falla',
    obra: obra(calc('A', m('k := 3'))),
    ok: (ev) => {
      const r = resolverExpresion('k', 'mm', ev.scope);
      return r.error ? null : `entregó ${r.valor} sin unidades para un campo en mm`;
    },
  },

  // --- Encadenamiento: la planilla entra en la cadena -----------------------
  //
  // Es el fin del módulo: usar la salida de un cálculo como entrada de otro.
  // Una planilla importada no aporta sus regiones a la hoja de la obra —son
  // otra hoja, con su propio scope—, así que lo único que cruza la frontera son
  // los valores que su `publica` declara, y cruzan como el objeto `Unit` que
  // son.
  {
    nombre: 'una planilla publica una salida y el resto de la obra la nombra con unidades',
    obra: obra(
      conPlanilla('P', importada(PLACA, { publica: { T_grupo: 'T_grupo' } })),
      calc('B', m('T_mayorado := T_grupo * 1.5 = kN')),
    ),
    ok: (ev) => {
      if (ev.scope.T_grupo === undefined) return 'la planilla no publicó T_grupo';
      if (ev.scope.T_mayorado === undefined) return 'la hoja libre no pudo usar T_grupo';
      // Se comparan magnitudes, no las cadenas que math.js imprime: `kN*m` sale
      // como `MJ` al formatear, que es una deuda conocida del motor y no tiene
      // nada que ver con lo que se está comprobando aquí.
      const t = en(ev.scope, 'T_grupo', 'kN');
      const v = en(ev.scope, 'T_mayorado', 'kN');
      if (t === null || v === null) return 'el valor no llegó con unidades de fuerza';
      return Math.abs(v - t * 1.5) < 1e-6 ? null : `dio ${v} kN, se esperaban ${t * 1.5}`;
    },
  },
  {
    nombre: 'la flecha de una planilla a quien la usa existe, y lleva el nombre que viaja',
    obra: obra(
      conPlanilla('P', importada(PLACA, { publica: { T_grupo: 'T_grupo' } })),
      calc('B', m('x := T_grupo * 2')),
    ),
    ok: esperaArista('P', 'B', 'T_grupo'),
  },
  {
    nombre: 'un campo atado dibuja la flecha que entra a la planilla',
    // Antes esto no existía: `usos` solo miraba los bloques de las hojas libres,
    // así que la única dependencia que el grafo sabía representar se la saltaba
    // justo cuando el nodo de destino era una planilla.
    obra: obra(
      calc('G', m('t_placa := 30 mm')),
      conPlanilla('P', importada(PLACA, { formulas: { t_bp: 't_placa' } })),
    ),
    ok: esperaArista('G', 'P', 't_placa'),
  },
  {
    nombre: 'un campo atado a un nombre que nadie define pinta el nodo en rojo, aunque la planilla siga con su valor',
    obra: obra(conPlanilla('P', importada(PLACA, { formulas: { t_bp: 't_que_no_existe' } }))),
    ok: (ev, proy) => {
      const n = proy.nodos.find((x) => x.id === K('P'));
      return n?.severidad === 'error' && n.motivos.some((t) => t.includes('t_bp')) ? null : `P: ${n?.severidad} ${JSON.stringify(n?.motivos)}`;
    },
  },
  {
    nombre: 'invariante: un campo de la genérica que la obra no fija ni ata se avisa, porque toma el valor de ejemplo',
    // Es lo que pasa cuando la genérica estrena un campo después de armada la obra.
    obra: obra(conPlanilla('P', importada(PLACA, { entradas: Object.fromEntries(Object.entries(PLACA.porDefecto).filter(([k]) => k !== 't_bp')) }))),
    ok: (ev, proy) => {
      const n = proy.nodos.find((x) => x.id === K('P'));
      if (n?.severidad !== 'aviso' || !n.motivos.some((t) => t.startsWith('Sin fijar ni atar: t_bp'))) return `P: ${n?.severidad} ${JSON.stringify(n?.motivos)}`;
      // Con todo fijado, nada.
      const limpio = obra(conPlanilla('Q', importada(PLACA)));
      return invariantesDeObra(limpio, evaluarObra(limpio, genericas), genericas).length ? 'avisó con todo fijado' : null;
    },
  },
  {
    nombre: 'la cadena completa: planilla → hoja → planilla',
    // La forma de la familia BASE DE COLUMNA: lo que una entrega, la siguiente
    // lo recibe. Con una hoja libre en medio, que es donde se mayoran las cosas.
    obra: obra(
      conPlanilla('PLACA', importada(PLACA, { publica: { T_grupo: 'T_grupo' } })),
      calc('MAY', m('M_zap := T_grupo * 1 m * 1.4 = kN*m')),
      conPlanilla('ZAP', importada(ZAPATA, { formulas: { Mu_Y: 'M_zap' } })),
    ),
    ok: (ev, proy) =>
      esperaArista('PLACA', 'MAY', 'T_grupo')(ev, proy) ??
      esperaArista('MAY', 'ZAP', 'M_zap')(ev, proy) ??
      (() => {
        // Y el número tiene que haber entrado de verdad en la zapata: su `Mu_Y`
        // efectivo sale de la expresión, no del que traía guardado.
        const inst = ev.importadas.get(K('ZAP'));
        if (!inst) return 'la zapata no se evaluó';
        const mu = en(inst.ev.scope, 'Mu_Y', 'kN*m');
        const t = en(ev.scope, 'T_grupo', 'kN');
        if (mu === null || t === null) return 'Mu_Y o T_grupo no llegaron con sus unidades';
        return Math.abs(mu - t * 1.4) < 1e-6 ? null : `Mu_Y = ${mu} kN*m, se esperaban ${t * 1.4}`;
      })(),
  },
  {
    nombre: 'una planilla se evalúa con el scope de SU posición, no con el final de la obra',
    // `A` va antes que la planilla porque ella lo usa; `Z` va después y no
    // puede alimentarla. Si se evaluara con el scope final, `Z` entraría.
    obra: obra(
      calc('A', m('t_placa := 30 mm')),
      conPlanilla('P', importada(PLACA, { formulas: { t_bp: 't_placa' }, publica: { T_grupo: 'T_g' } })),
      calc('Z', m('posterior := T_g * 2')),
    ),
    ok: (ev) => {
      const inst = ev.importadas.get(K('P'));
      if (!inst) return 'la planilla no se evaluó';
      if (inst.scope.posterior !== undefined) return 'la planilla vio lo que se calcula debajo';
      return inst.scope.t_placa === undefined ? 'la planilla no vio lo de aguas arriba' : null;
    },
  },
  {
    nombre: 'dos planillas que publican con el mismo alias se quedan sin dueño, y las dos lo dicen',
    obra: obra(
      conPlanilla('P1', importada(PLACA, { publica: { T_grupo: 'T_grupo' } })),
      conPlanilla('P2', importada(PLACA, { publica: { T_grupo: 'T_grupo' } })),
      calc('B', m('x := T_grupo * 2')),
    ),
    ok: todas(
      esperaRepetido('T_grupo', 2),
      esperaProblema('P1', /«T_grupo» está definida en 2 nodos/),
      sinArista('P1', 'B'),
    ),
  },
  {
    nombre: 'una planilla y una hoja en círculo se detectan como cualquier otro ciclo',
    obra: obra(
      conPlanilla('P', importada(PLACA, { formulas: { t_bp: 'espesor' }, publica: { T_grupo: 'T_g' } })),
      calc('H', m('espesor := T_g / (1 kN) * 1 mm')),
    ),
    ok: esperaCiclo('P', 'H'),
  },
  {
    nombre: 'un alias que no es un nombre de variable se rechaza al guardarlo',
    obra: obra(),
    ok: () => {
      const malos = ['', ' ', '2x', 'a-b', 'm', 'min', 'sqrt'];
      const pasa = malos.filter((a) => !problemaDeAlias(a));
      if (pasa.length) return `se aceptaron: ${pasa.map((a) => `«${a}»`).join(', ')}`;
      const buenos = ['T_grupo', '_x', 'As_req2', 'φ_v'];
      const falla = buenos.filter((a) => problemaDeAlias(a));
      return falla.length ? `se rechazaron: ${falla.join(', ')}` : null;
    },
  },
  {
    nombre: 'entre nodos que ya se pueden calcular manda el orden de creación',
    // Ese orden es el de lectura de la hoja global, y de él sale lo que el
    // autocompletado ofrece. Con una cola FIFO, `C` —creado al final y sin
    // dependencias— se colaba delante de `B`, que las tenía, y por eso `C` no
    // veía lo que `B` define justo mientras se escribía.
    obra: obra(calc('A', m('a := 1')), calc('B', m('b := a + 1')), calc('C', m('c := 5'))),
    ok: (ev) => {
      const y = (src) => ev.regions.find((r) => r.src.startsWith(src))?.y;
      return y('b :=') < y('c :=') ? null : 'el nodo creado al final se coló delante';
    },
  },
  {
    nombre: 'lo que publica una planilla se ofrece en el autocompletado de aguas abajo',
    // `variablesVisibles` lee lo que cada región DEFINE, y las regiones de una
    // planilla no están en esta hoja: sin una región que lo represente, la única
    // forma de encontrar lo que publica sería saberlo de memoria.
    obra: obra(
      conPlanilla('P', importada(PLACA, { publica: { T_grupo: 'T_grupo' } })),
      calc('B', m('x := 1')),
    ),
    ok: (ev) => {
      const r = ev.regions.find((x) => ev.results[x.id]?.define?.nombre === 'T_grupo');
      if (!r) return 'no hay ninguna región que represente lo publicado';
      const destino = ev.regions.find((x) => x.src.startsWith('x :='));
      return r.y < destino.y ? null : 'la región publicada no queda por encima de quien la usa';
    },
  },

  // --- La hoja del nodo, con frontera ---------------------------------------
  // Un nodo pasa a llevar su hoja como `Region[]`, y `frontera` decide dónde
  // vive su espacio de nombres: sin ella comparte el de la obra, con ella tiene
  // el suyo y solo cruza lo que `publica` declara.
  {
    nombre: 'una hoja con frontera propia no filtra ninguno de sus nombres al scope común',
    obra: obra(
      conFrontera('P', hojaDe(PEDESTAL), {
        procedencia: 'derivada',
        origen: { slug: PEDESTAL.id, sha256: PEDESTAL.biblioteca.sha256 },
        publica: { u_max: 'u_ped' },
      }),
      calc('Q', m('q := u_ped * 2')),
    ),
    ok: todas(
      noFiltra(hojaDe(PEDESTAL), 'u_ped'),
      // Y lo publicado SÍ cruza, con su flecha: una frontera que no dejara pasar
      // nada contendría igual de bien y no serviría para nada.
      esperaArista('P', 'Q', 'u_ped'),
      sinCiclo,
    ),
  },
  {
    nombre: 'una hoja libre sigue compartiendo el scope de la obra',
    // La otra mitad de la decisión: sin `frontera` el nodo es la geometría y los
    // datos comunes, y lo que define tiene que verlo todo el mundo.
    obra: obra(
      conFrontera('G', [reg('math', 'A_planta := 4 m * 3 m', 40)]),
      calc('B', m('carga := A_planta * 5 kN/m^2')),
    ),
    ok: todas(esperaValor('carga', '60 kN'), esperaArista('G', 'B', 'A_planta')),
  },
  {
    nombre: 'dos hojas con frontera pueden usar los mismos nombres sin chocar',
    // Es lo que hoy no se puede: dos zapatas instanciadas definen las mismas
    // letras, y sin frontera las dos quedarían sin dueño.
    obra: obra(
      conFrontera('Z1', hojaDe(ZAPATA), { procedencia: 'propia', publica: { u_max: 'u_z1' } }),
      conFrontera('Z2', hojaDe(ZAPATA), { procedencia: 'propia', publica: { u_max: 'u_z2' } }),
    ),
    ok: (ev) =>
      ev.repetidos.size === 0
        ? null
        : `se declararon repetidos: ${[...ev.repetidos.keys()].slice(0, 6).join(', ')}`,
  },
  {
    nombre: 'la hoja de un nodo abierta aparte ve lo que la obra define por encima, y nada más',
    // Es lo que hace correcta una pestaña. Sin el scope de su posición, la hoja
    // de un nodo abierta en el canvas matemático pintaría en rojo cada nombre
    // que venga de otro nodo —un rojo que no es un error y que ni siquiera se
    // puede arreglar desde donde se ve—. Y no puede ver lo de aguas abajo, o el
    // canvas enseñaría un número que la obra no da.
    obra: obra(
      conFrontera('G', [reg('math', 'A := 4 m * 3 m', 40)]),
      calc('M', m('carga := A * 5 kN/m^2')),
      calc('Z', m('abajo := carga * 2')),
    ),
    ok: (ev) => {
      const suyo = ev.scopeEnNodo.get(K('M'));
      if (!suyo) return 'no se registró el scope de M';
      if (suyo.A === undefined) return 'M no ve la «A» que define el nodo de más arriba';
      if (suyo.carga !== undefined) return 'M se ve a sí mismo: eso lo define su propia hoja';
      if (suyo.abajo !== undefined) return 'M ve lo que se calcula debajo de él';
      // Y una hoja CON frontera solo ve sus campos atados, nunca el resto.
      return null;
    },
  },
  {
    nombre: 'la hoja de un cálculo con frontera solo ve sus campos atados',
    obra: obra(
      calc('G', m('L_ext := 9 m'), m('otra := 3 m')),
      conFrontera('P', [reg('math', 'r := d / 2', 40)], {
        procedencia: 'propia',
        formulas: { d: 'L_ext' },
        publica: { r: 'radio' },
      }),
    ),
    ok: todas(
      (ev) => {
        const suyo = ev.scopeEnNodo.get(K('P'));
        if (!suyo) return 'no se registró el scope de P';
        if (String(suyo.d) !== '9 m') return `el campo atado dio ${suyo.d}`;
        if (suyo.otra !== undefined) return 'la frontera dejó pasar «otra», que no está atada';
        if (suyo.L_ext !== undefined) return 'la frontera dejó pasar «L_ext»';
        return null;
      },
      esperaValor('radio', '4.5 m'),
    ),
  },
  {
    nombre: 'un campo atado que la propia hoja vuelve a definir se declara como problema',
    // El valor atado entra como scope inicial y la región lo pisa después, así
    // que el campo no tiene efecto y nada lo diría.
    obra: obra(
      conFrontera('P', [reg('math', 'd := 2 m', 40), reg('math', 'r := d / 2', 88)], {
        procedencia: 'propia',
        formulas: { d: 'L_ext' },
        publica: { r: 'radio' },
      }),
      calc('G', m('L_ext := 9 m')),
    ),
    ok: esperaProblema('P', /d/),
  },
  {
    nombre: 'antes de quitar un nodo se sabe quién se queda sin qué',
    // Es la única ventana en que la respuesta existe: la flecha ES la entrada de
    // `duenio`, así que en cuanto A se va, nadie puede decir de dónde venía.
    obra: obra(
      calc('A', m('A_planta := 4 m * 3 m')),
      calc('B', m('carga := A_planta * 5 kN/m^2')),
      calc('C', m('suelto := 2 m')),
    ),
    ok: (ev) => {
      const rota = rupturaPorQuitar([K('A')], ev);
      if (rota.length !== 1) return `se rompieron ${rota.length} nodos, se esperaba 1`;
      if (rota[0].nodo !== 'B') return `se señaló a «${rota[0].nodo}» en vez de a «B»`;
      if (rota[0].nombres.join() !== 'A_planta') return `nombres: ${rota[0].nombres.join()}`;
      // Y quitar al que no alimenta a nadie no rompe nada, así que no hay aviso.
      return rupturaPorQuitar([K('C')], ev).length === 0 ? null : 'C rompió algo sin alimentar a nadie';
    },
  },
  {
    nombre: 'un nombre que ningún nodo define se dice en español, no «Undefined symbol»',
    // Es lo que queda tras borrar el nodo que lo publicaba: el consumidor sigue
    // citándolo y el motor solo sabe decir que no existe, en inglés.
    obra: obra(calc('B', m('total := A_planta * 2'))),
    ok: esperaProblema('B', /Ningún nodo de la obra define «A_planta»/),
  },
  {
    nombre: 'un nombre huérfano que además es una unidad también es un nombre roto, no litros',
    // `L` sin dueño era un litro para math.js: el nodo calculaba sin quejarse.
    // Ahora el motor lo rechaza con su propio mensaje, y la obra tiene que leerlo.
    obra: obra(calc('B', m('total := L * 2'))),
    ok: esperaProblema('B', /Ningún nodo de la obra define «L»/),
  },
  {
    nombre: 'un nombre huérfano con letras no ASCII también es un nombre roto',
    obra: obra(calc('B', m('total := σ_c * 2'))),
    ok: esperaProblema('B', /Ningún nodo de la obra define «σ_c»/),
  },
  {
    nombre: 'si el nombre SÍ tiene dueño, el diagnóstico manda a arreglar ESE nodo',
    // La cascada: A no logró calcular lo que publica, así que B se queda sin
    // valor. Decirle a B que «nadie define A_planta» sería falso y lo mandaría a
    // buscar donde no está.
    obra: obra(calc('A', m('A_planta := falta * 2')), calc('B', m('total := A_planta * 2'))),
    ok: todas(
      esperaProblema('B', /«A_planta» la define «A»/),
      esperaProblema('A', /Ningún nodo de la obra define «falta»/),
    ),
  },

  // --- Cómo se dibuja ---------------------------------------------------------
  {
    nombre: 'la clase del nodo se deriva: la hoja que solo cita es un resumen',
    // El «Resumen de cargas del modelo» del Pachón: 55 líneas `x =` sin un solo
    // `:=`. Una hoja que no define nada y no usa nada es una nota, no un resumen.
    obra: obra(
      calc('A', m('a := 1')),
      calc('R', m('a =')),
      calc('N', t('una nota')),
    ),
    ok: (ev, proy) => {
      const clase = (id) => proy.nodos.find((x) => x.id === K(id))?.clase;
      if (clase('A') !== 'calculo') return `A es «${clase('A')}»`;
      if (clase('R') !== 'resumen') return `R es «${clase('R')}», se esperaba «resumen»`;
      if (clase('N') !== 'calculo') return `N es «${clase('N')}»: una nota no resume nada`;
      return null;
    },
  },
  {
    nombre: 'una hoja libre con una verificación en falso sale en rojo, y la que la cita también',
    obra: obra(
      calc('A', m('a := 1'), m('v_a := a > 2 =')),
      calc('B', m('v_b := a < 2 =')),
      calc('R', m('v_a =')),
      calc('S', m('v_b =')),
      // Cita y además define: no es un resumen, y también vota.
      calc('T', m('t := 2'), m('v_a =')),
    ),
    ok: (ev, proy) => {
      const n = (id) => proy.nodos.find((x) => x.id === K(id));
      if (n('A').severidad !== 'error' || !n('A').motivos.some((x) => x.includes('v_a'))) return `A: ${n('A').severidad} ${n('A').motivos}`;
      if (n('B').severidad !== 'ok') return `B: ${n('B').severidad} ${n('B').motivos}`;
      if (n('R').clase !== 'resumen' || n('R').severidad !== 'error') return `R: ${n('R').clase} ${n('R').severidad}`;
      if (n('T').clase !== 'calculo' || n('T').severidad !== 'error') return `T: ${n('T').clase} ${n('T').severidad}`;
      return n('S').severidad === 'ok' ? null : `S: ${n('S').severidad}`;
    },
  },
  {
    nombre: 'el trazo de un nodo es la cadena entera, y solo sus eslabones',
    // A → B → C, y además A → C directo, y D suelto que usa A. Con el foco en B:
    // arriba A, abajo C. La flecha A → C une un nodo de arriba con uno de abajo
    // sin pasar por B, así que no es parte del trazo; A → D tampoco.
    obra: obra(
      calc('A', m('a := 1')),
      calc('B', m('b := a + 1')),
      calc('C', m('c := b + a')),
      calc('D', m('d := a * 3')),
    ),
    ok: (ev, proy) => {
      const t = trazoDe(K('B'), proy.aristas);
      const lista = (s) => [...s].sort().join(',');
      if (lista(t.arriba) !== K('A')) return `arriba: ${lista(t.arriba)}`;
      if (lista(t.abajo) !== K('C')) return `abajo: ${lista(t.abajo)}`;
      const lado = (d, h) => {
        const a = proy.aristas.find((x) => x.desde === K(d) && x.hasta === K(h));
        return a ? ladoDe(a, t) : 'sin flecha';
      };
      if (lado('A', 'B') !== 'arriba') return `A→B es «${lado('A', 'B')}»`;
      if (lado('B', 'C') !== 'abajo') return `B→C es «${lado('B', 'C')}»`;
      if (lado('A', 'C') !== null) return `A→C es «${lado('A', 'C')}» y no pasa por B`;
      if (lado('A', 'D') !== null) return `A→D es «${lado('A', 'D')}» y D no es de la cadena`;
      return null;
    },
  },
  {
    nombre: 'un cálculo lleva su grupo al nodo, y el grupo no toca la evaluación',
    obra: {
      ...obra(calc('K', m('q_k := 3 kN/m^2')), { ...calc('W', m('q_w := q_k')), grupo: 'g1' }),
      grupos: [{ id: 'g1', nombre: 'Viento', color: '#2563eb' }],
    },
    ok: (ev, proy) => {
      const w = proy.nodos.find((x) => x.id === K('W'));
      if (w?.grupo?.nombre !== 'Viento') return `W trae ${JSON.stringify(w?.grupo)}`;
      if (proy.nodos.find((x) => x.id === K('K'))?.grupo) return 'K no tiene grupo y apareció con uno';
      return en(ev.scope, 'q_w', 'kN/m^2') === 3 ? null : 'q_w dejó de valer 3 kN/m²';
    },
  },
  {
    nombre: 'una carga del modelo se justifica con una expresión de la obra, y el nodo SAP2000 lo dice',
    // SDL_CUB es 10 kgf/m² en el modelo del Pachón, leído como 0,0980665 kN/m²:
    // la obra lo escribe en kgf y el motor convierte. CM_VIA no coincide.
    obra: {
      ...obra(calc('G', m('q_cub := 10 kgf/m^2'), m('w_via := 0.75 kN/m'))),
      modulos: ['sap'],
      sap: {
        modelo: 'm.sdb',
        ruta: '',
        version: '',
        leido: '',
        cargas: {
          modelo: 'm.sdb',
          leido: '',
          lista: [CARGA_CUB, CARGA_VIA, { ...CARGA_VIA, valor: 2, n: 3 }],
        },
      },
      justificaciones: [
        { id: 'j1', patron: 'SDL_CUB', firma: firmaDe(CARGA_CUB), valor: CARGA_CUB.valor, expr: 'q_cub' },
        { id: 'j2', patron: 'CM_VIA', firma: firmaDe(CARGA_VIA), valor: CARGA_VIA.valor, expr: 'w_via' },
      ],
    },
    ok: (ev, proy) => {
      const sap = proy.nodos.find((x) => x.id === 'sap');
      if (!sap) return 'no está el nodo SAP2000';
      if (sap.subtitulo !== 'm.sdb · 1 de 3 justificados') return `subtítulo: «${sap.subtitulo}»`;
      if (sap.severidad !== 'error' || !sap.motivos[0]?.includes('no coinciden')) return `severidad ${sap.severidad}: ${sap.motivos}`;
      const a = proy.aristas.find((x) => x.desde === K('G') && x.hasta === 'sap');
      if (!a) return 'falta la flecha de G al nodo SAP2000';
      if (a.etiqueta !== 'q_cub, w_via') return `la flecha dice «${a.etiqueta}»`;
      const v = verificar('w_via', CARGA_VIA, ev.scope);
      return v.estado === 'difiere' && v.detalle.includes('-2,471 %') ? null : `CM_VIA: ${JSON.stringify(v)}`;
    },
  },
  {
    nombre: 'el sub-nodo Combinaciones cuelga del SAP2000 y avisa de un término que no está',
    obra: {
      ...obra(calc('G', m('q := 1'))),
      modulos: ['sap', 'sap-combinaciones'],
      sap: {
        modelo: 'm.sdb', ruta: '', version: '', leido: '',
        combinaciones: { modelo: 'm.sdb', leido: '', lista: [...COMBOS_PACHON, { nombre: 'ROTA', tipo: 'Lineal', terminos: [{ clase: 'combinacion', nombre: 'NO_ESTA', sf: 1 }] }] },
      },
    },
    ok: (_ev, proy) => {
      const n = proy.nodos.find((x) => x.id === 'sap:combinaciones');
      if (!n) return 'no está el nodo Combinaciones';
      if (n.clase !== 'combinaciones') return `clase ${n.clase}`;
      if (n.subtitulo !== '5 combinaciones · 1 envolvente') return `subtítulo «${n.subtitulo}»`;
      if (n.severidad !== 'aviso' || !n.motivos[0]?.includes('1 término')) return `severidad ${n.severidad}: ${n.motivos}`;
      const a = proy.aristas.find((x) => x.desde === 'sap' && x.hasta === 'sap:combinaciones');
      return a?.tipo === 'deriva' ? null : `la arista sap → combinaciones: ${JSON.stringify(a)}`;
    },
  },
  {
    nombre: 'el sub-nodo Modal dice Tx, Ty y la masa juntada, y avisa si la lectura quedó atrasada',
    obra: {
      ...obra(calc('G', m('q := 1'))),
      modulos: ['sap', 'sap-modal'],
      // El .sdb se guardó después de leer el modal: la lectura está atrasada.
      sap: { modelo: 'm.sdb', ruta: '', version: '', leido: '', modificado: '2026-09-25T13:00:00Z', modal: LECTURA_MODAL },
    },
    ok: (_ev, proy) => {
      const n = proy.nodos.find((x) => x.id === 'sap:modal');
      if (!n) return 'no está el nodo Modal';
      if (n.clase !== 'resultado') return `clase ${n.clase}`;
      if (n.subtitulo !== 'Tx = 0,459 s · modo 3 · 70,0 %\nTy = 0,715 s · modo 1 · 94,0 %') return `subtítulo «${n.subtitulo}»`;
      if (n.severidad !== 'aviso' || !n.motivos[0]?.startsWith('Lectura atrasada')) return `severidad ${n.severidad}: ${n.motivos}`;
      if (!proy.aristas.some((x) => x.desde === 'sap' && x.hasta === 'sap:modal' && x.tipo === 'deriva')) return 'falta la arista sap → modal';
      return null;
    },
  },
  {
    nombre: 'el sub-nodo Reacción basal dice el corte de cada dirección y avisa de un caso gravitacional que empuja',
    obra: {
      ...obra(calc('G', m('q := 1'))),
      modulos: ['sap', 'sap-basal'],
      sap: { ...SAP_BASAL, basal: LECTURA_BASAL },
    },
    ok: (_ev, proy) => {
      const n = proy.nodos.find((x) => x.id === 'sap:basal');
      if (!n) return 'no está el nodo Reacción basal';
      if (n.subtitulo !== 'Vx = 3586 kN · RSX\nVy = 2199 kN · RSY') return `subtítulo «${n.subtitulo}»`;
      if (n.severidad !== 'aviso' || n.motivos.length !== 1 || !n.motivos[0].startsWith('SDL_MAL')) return `motivos: ${n.motivos}`;
      return proy.aristas.some((x) => x.desde === 'sap' && x.hasta === 'sap:basal' && x.tipo === 'deriva') ? null : 'falta la arista';
    },
  },
  {
    nombre: 'la tarjeta de la reacción basal se muestra en tonf si la obra lo pide, y sin avisos si todo equilibra',
    obra: {
      ...obra(calc('G', m('q := 1'))),
      modulos: ['sap', 'sap-basal'],
      unidadesSap: 'tonf',
      sap: { ...SAP_BASAL, basal: { ...LECTURA_BASAL, filas: LECTURA_BASAL.filas.filter((f) => f.caso !== 'SDL_MAL') } },
    },
    ok: (_ev, proy) => {
      const n = proy.nodos.find((x) => x.id === 'sap:basal');
      if (n.subtitulo !== 'Vx = 365,7 tonf · RSX\nVy = 224,2 tonf · RSY') return `subtítulo «${n.subtitulo}»`;
      return n.severidad === 'ok' ? null : `severidad ${n.severidad}: ${n.motivos}`;
    },
  },
  {
    nombre: 'el sub-nodo Apoyos dice cuántos apoyos y casos hay, cuántos traccionan, y si no cuadra con la basal',
    obra: {
      ...obra(calc('G', m('q := 1'))),
      modulos: ['sap', 'sap-apoyos', 'sap-basal'],
      // WXP suma 129,5 en los apoyos y la basal dice -603,4: no cuadra. Y el
      // conjunto, sin leer, no avisa: no leído no es desactualizado.
      conjuntosDiseno: [{ id: 'cd1', nombre: 'Hormigón', familias: ['B21'] }],
      sap: { ...SAP_BASAL, basal: LECTURA_BASAL, apoyos: LECTURA_APOYOS },
    },
    ok: (_ev, proy) => {
      const n = proy.nodos.find((x) => x.id === 'sap:apoyos');
      if (!n) return 'no está el nodo Apoyos';
      if (n.subtitulo !== '3 apoyos · 3 casos · 1 conjunto\ntracción en 1 caso') return `subtítulo «${n.subtitulo}»`;
      if (n.severidad !== 'aviso' || n.motivos.length !== 1 || !n.motivos[0].startsWith('WXP:')) return `motivos: ${n.motivos}`;
      return proy.aristas.some((x) => x.desde === 'sap' && x.hasta === 'sap:apoyos' && x.tipo === 'deriva') ? null : 'falta la arista';
    },
  },
  {
    nombre: 'el sub-nodo Modal al día y con la masa juntada no avisa; con menos del 90 % en X, sí',
    obra: {
      ...obra(calc('G', m('q := 1'))),
      modulos: ['sap', 'sap-modal'],
      sap: {
        modelo: 'm.sdb', ruta: '', version: '', leido: '', modificado: LECTURA_MODAL.modificado,
        modal: { ...LECTURA_MODAL, modos: MODOS.slice(0, 3) },
      },
    },
    ok: (_ev, proy) => {
      const n = proy.nodos.find((x) => x.id === 'sap:modal');
      if (n.motivos.length !== 1 || !n.motivos[0].includes('en X es 71,0 %')) return `motivos: ${n.motivos}`;
      return n.severidad === 'aviso' ? null : `severidad ${n.severidad}`;
    },
  },
  {
    nombre: 'reordenar pone cada grupo en su franja, en el orden de la lista, y los sin grupo al final',
    // Los grupos van al revés de la cadena a propósito: «Viento» usa lo que
    // publica «Geometría», pero va primero en la lista. La franja la decide la
    // lista; la columna, la cadena de TODA la obra.
    obra: {
      ...obra(
        { ...calc('G', m('A_g := 10 m^2'), m('h := 6 m')), grupo: 'geo' },
        { ...calc('W1', m('q_1 := 0.5 kN/m^2 * A_g')), grupo: 'viento' },
        { ...calc('W2', m('q_2 := q_1 * 2')), grupo: 'viento' },
        calc('Z', m('z := h + 1 m')),
      ),
      grupos: [
        { id: 'viento', nombre: 'Viento', color: '#2563eb' },
        { id: 'geo', nombre: 'Geometría', color: '#059669' },
      ],
    },
    ok: (ev, proy) => {
      const pos = colocarPorGrupo(proy.nodos, proy.aristas, (x) => x.grupo?.id, ['viento', 'geo']);
      const franja = (ids) => {
        const ys = ids.map((id) => pos[K(id)].y);
        return { min: Math.min(...ys), max: Math.max(...ys) };
      };
      const viento = franja(['W1', 'W2']);
      const geo = franja(['G']);
      const sin = franja(['Z']);
      if (!(viento.max < geo.min && geo.max < sin.min)) {
        return `las franjas se pisan o van en otro orden: viento ${JSON.stringify(viento)}, geo ${JSON.stringify(geo)}, sin grupo ${JSON.stringify(sin)}`;
      }
      const atras = proy.aristas
        .filter((a) => pos[a.hasta].x <= pos[a.desde].x)
        .map((a) => `${a.desde}→${a.hasta}`);
      return atras.length ? `flechas hacia atrás: ${atras.join(' · ')}` : null;
    },
  },
];

// ── La hoja de un nodo, como dato ────────────────────────────────────────────
// Funciones puras que no son ni una obra evaluada ni un saneo: dónde cae un
// bloque nuevo, y qué pasa al desprender una genérica de la biblioteca.

/** El espectro reglamentario del Pachón (CIRSOC 103, zona 4, S_C), como hoja
 *  con frontera que publica su función, y sus puntos tal como los tiene SAP. */
const HOJA_ESPECTRO = [
  reg('math', 'C_a := 0.37', 40),
  reg('math', 'C_v := 0.612', 88),
  reg('math', 'T_3 := 13 s', 136),
  reg('math', 'T_2 := C_v / (2.5 * C_a) * 1 s', 184),
  reg('math', 'T_1 := 0.2 * T_2', 232),
  reg('program', [
    'Sa(T) :=',
    '    if T <= T_1',
    '        return C_a * (1 + 1.5 * T / T_1)',
    '    else if T <= T_2',
    '        return 2.5 * C_a',
    '    else if T <= T_3',
    '        return C_v / (T / (1 s))',
    '    else',
    '        return C_v * (T_3 / (1 s)) / (T / (1 s))^2',
  ].join('\n'), 280),
];
const ESPECTRO_SAP = [[0, 0.37], [0.0529297, 0.59023], [0.1323243, 0.925], [0.5, 0.925], [0.6616216, 0.925], [1.1111982, 0.55076], [2.1103, 0.29001], [14, 0.04059], [20, 0.01989]];

const CASOS_HOJA = [
  {
    nombre: 'regionQueDefine encuentra el bloque que deja el valor final de un nombre',
    // Es a donde lleva el enlace de una justificación del nodo SAP2000: el
    // bloque cuyo valor es el que la obra ve. Con una redefinición, el último.
    ok: () => {
      const hoja = [
        { id: 'r1', kind: 'math', x: 40, y: 40, src: 'q := 1 kN/m^2' },
        { id: 'r2', kind: 'text', x: 40, y: 88, src: 'q := esto es prosa' },
        { id: 'r3', kind: 'program', x: 40, y: 136, src: 'f(x) :=\n  return 2 * x' },
        { id: 'r4', kind: 'math', x: 40, y: 184, src: 'q := 2 * q' },
        { id: 'r0', kind: 'math', x: 40, y: 10, src: 'p := 3' },
      ];
      if (regionQueDefine(hoja, 'q') !== 'r4') return `q → ${regionQueDefine(hoja, 'q')}, se esperaba r4`;
      if (regionQueDefine(hoja, 'f') !== 'r3') return `f → ${regionQueDefine(hoja, 'f')}, se esperaba r3`;
      if (regionQueDefine(hoja, 'p') !== 'r0') return `p → ${regionQueDefine(hoja, 'p')}, se esperaba r0`;
      if (regionQueDefine(hoja, 'z') !== undefined) return 'encontró un nombre que nadie define';
      return null;
    },
  },
  {
    nombre: 'mostrar las cargas en tonf cambia los textos y nunca el veredicto',
    ok: () => {
      const scope = evaluarObra(obra(calc('A', m('q := 10 kgf/m^2'), m('w := 0.75 kN/m'))), {}).scope;
      if (valorDe(CARGA_CUB, 'tonf') !== '0,01 tonf/m²') return `SDL_CUB en tonf: ${valorDe(CARGA_CUB, 'tonf')}`;
      if (valorDe(CARGA_VIA, 'tonf') !== '0,07842 tonf/m') return `CM_VIA en tonf: ${valorDe(CARGA_VIA, 'tonf')}`;
      if (valorDe(CARGA_VIA) !== '0,769 kN/m') return 'sin sistema dejó de ser kN';
      const temp = { patron: 'TEMP', clase: 'barra-temperatura', tipoTemperatura: 1, valor: 10, n: 381 };
      if (valorDe(temp, 'tonf') !== '10 °C') return 'la temperatura se convirtió como una fuerza';
      // El veredicto sale de la comparación en kN: el mismo en los dos sistemas.
      for (const [expr, c] of [['q', CARGA_CUB], ['w', CARGA_VIA]]) {
        const a = verificar(expr, c, scope, 'kN'), b = verificar(expr, c, scope, 'tonf');
        if (a.estado !== b.estado || a.obra !== b.obra) return `${c.patron}: ${a.estado} en kN y ${b.estado} en tonf`;
      }
      const d = verificar('w', CARGA_VIA, scope, 'tonf').detalle;
      if (d !== 'la obra da 0,07648 tonf/m y el modelo 0,07842 (-2,471 %)') return `detalle en tonf: «${d}»`;
      // Se guarda en la obra; `kN`, que es lo que se asume, no se escribe.
      if (sanearObra({ id: 'o', calculos: [], unidadesSap: 'tonf' }).unidadesSap !== 'tonf') return 'se perdió tonf';
      if ('unidadesSap' in sanearObra({ id: 'o', calculos: [], unidadesSap: 'kN' })) return 'se escribió kN';
      return 'unidadesSap' in sanearObra({ id: 'o', calculos: [], unidadesSap: 'lbf' }) ? 'aceptó lbf' : null;
    },
  },
  {
    nombre: 'el espectro del modelo se justifica con la función que publica la obra, en todos sus puntos',
    ok: () => {
      const o = {
        ...obra(conFrontera('E', HOJA_ESPECTRO, { procedencia: 'propia', publica: { Sa: 'Sa_esp' } }), calc('F', m('SF_X := 9.80665 m/s^2 / 5'))),
      };
      const scope = evaluarObra(o, {}).scope;
      if (typeof scope.Sa_esp !== 'function') return `Sa_esp no llegó a la obra como función: ${typeof scope.Sa_esp}`;
      const bien = verificarFuncion('Sa_esp', ESPECTRO_SAP, scope);
      if (bien.estado !== 'coincide') return `el espectro reglamentario no coincidió: ${bien.detalle}`;
      // Un espectro con la meseta cortada antes: difiere, y dice dónde.
      const cortado = ESPECTRO_SAP.map(([T, s]) => [T, T === 0.6616216 ? 0.8 : s]);
      const mal = verificarFuncion('Sa_esp', cortado, scope);
      if (mal.estado !== 'difiere' || !mal.detalle.includes('T = 0,6616 s')) return `la meseta cortada: ${JSON.stringify(mal)}`;
      if (verificarFuncion('2 * Sa_esp', ESPECTRO_SAP, scope).estado !== 'error') return 'aceptó una expresión que no es un nombre';
      if (verificarFuncion('SF_X', ESPECTRO_SAP, scope).estado !== 'error') return 'aceptó un número como función';
      // El factor de escala, en m/s²: g/5 es el 1,96133 de RSX.
      if (verificarFactor('SF_X', 1.96133, scope).estado !== 'coincide') return 'SF_X no coincidió con 1,96133 m/s²';
      if (verificarFactor('SF_X', 1.40095, scope).estado !== 'difiere') return 'SF_X coincidió con el de RSY';
      return verificarFactor('SF_X / (1 m/s^2)', 1.96133, scope).estado === 'error' ? null : 'un factor sin unidades no falló';
    },
  },
  {
    nombre: 'el resumen del nodo SAP2000 cuenta el espectro, y una justificación sin su caso queda huérfana',
    ok: () => {
      const o = {
        ...obra(conFrontera('E', HOJA_ESPECTRO, { procedencia: 'propia', publica: { Sa: 'Sa_esp' } }), calc('F', m('SF_X := 9.80665 m/s^2 / 5'))),
        sap: {
          modelo: 'm.sdb', ruta: '', version: '', leido: '',
          espectro: {
            modelo: 'm.sdb', leido: '',
            casos: [{ nombre: 'RSX', modal: 'MODAL', combinacion: 'CQC', amortiguamiento: 0.05, cargas: [{ dir: 'U1', funcion: 'F103', sf: 1.96133, csys: 'GLOBAL', angulo: 0 }] }],
            funciones: [{ nombre: 'F103', puntos: ESPECTRO_SAP }],
          },
        },
        justificaciones: [
          { id: 'a', clase: 'factor-espectro', patron: 'RSX', firma: 'U1', valor: 1.96133, expr: 'SF_X' },
          { id: 'b', clase: 'funcion-espectro', patron: 'F103', firma: 'funcion', valor: 9, expr: 'Sa_esp' },
          { id: 'c', clase: 'factor-espectro', patron: 'RSZ', firma: 'U3', valor: 1, expr: 'SF_X' },
        ],
      };
      const saneada = sanearObra(o);
      if (JSON.stringify(sanearObra(archivoDeObra(saneada).obra)) !== JSON.stringify(saneada)) return 'la lectura del espectro cambió en la ida y vuelta';
      if (saneada.justificaciones[0].clase !== 'factor-espectro') return 'el saneo perdió la clase';
      const r = resumirJustificaciones(saneada, evaluarObra(saneada, {}).scope);
      // El factor de U1, la función y el amortiguamiento de RSX.
      if (r.total !== 3 || r.justificadas !== 2) return `resumen: ${JSON.stringify(r)}`;
      return r.huerfanas.length === 1 && r.huerfanas[0].patron === 'RSZ' ? null : `huérfanas: ${JSON.stringify(r.huerfanas)}`;
    },
  },
  {
    nombre: 'un factor sin unidades se justifica: coincide, difiere con su porcentaje y una unidad es error',
    ok: () => {
      const scope = evaluarObra(obra(calc('A', m('k_v := 0.185'), m('xi := 0.05'), m('h := 3 m'))), {}).scope;
      const bien = verificarEscalar('k_v', 0.185, scope);
      if (bien.estado !== 'coincide' || bien.detalle !== 'la obra da 0,185') return `k_v: ${JSON.stringify(bien)}`;
      const mal = verificarEscalar('k_v', 0.2, scope);
      if (mal.estado !== 'difiere' || mal.detalle !== 'la obra da 0,185 y el modelo 0,2 (-7,5 %)') return `k_v contra 0,2: ${mal.detalle}`;
      if (verificarEscalar('xi', 0.05, scope).estado !== 'coincide') return 'el amortiguamiento como fracción no coincidió';
      return verificarEscalar('h', 3, scope).estado === 'error' ? null : 'una longitud pasó por un factor';
    },
  },
  {
    nombre: 'los factores de un caso y de la masa se justifican; solo cuentan los distintos de 1',
    ok: () => {
      const o = {
        ...obra(calc('A', m('k_v := 0.185'), m('f_2 := 0.5'), m('xi := 0.05'))),
        sap: {
          modelo: 'm.sdb', ruta: '', version: '', leido: '',
          espectro: {
            modelo: 'm.sdb', leido: '',
            casos: [{ nombre: 'RSX', modal: 'MODAL', combinacion: 'CQC', amortiguamiento: 0.05, cargas: [] }],
            funciones: [],
          },
          casos: {
            modelo: 'm.sdb', leido: '',
            lista: [
              { nombre: 'CM', tipo: 'LinearStatic', estado: 'sin-analizar', cargas: [{ tipo: 'Load', nombre: 'DEAD', sf: 1 }] },
              {
                nombre: 'EV', tipo: 'LinearStatic', estado: 'analizado',
                cargas: [{ tipo: 'Load', nombre: 'DEAD', sf: 0.185 }, { tipo: 'Load', nombre: 'CM_VIA', sf: 0.185 }],
              },
              { nombre: 'MODAL', tipo: 'Modal', estado: 'analizado', modal: 'Eigen', modos: { max: 150, min: 1 } },
              { nombre: 'RSX', tipo: 'ResponseSpectrum', estado: 'analizado' },
            ],
          },
          masa: {
            modelo: 'm.sdb', leido: '',
            fuentes: [{
              nombre: 'MSSSRC1', porDefecto: true, deElementos: true, deMasas: true, deCargas: true,
              cargas: [{ patron: 'DEAD', sf: 1 }, { patron: 'S', sf: 0.5 }],
            }],
          },
          resumen: {
            modelo: 'm.sdb', leido: '', unidades: 'Ton_m_C', nudos: 322, barras: 591, areas: 61, links: 24,
            grupos: [{ nombre: 'COL_PPALES', barras: 68, areas: 0 }], materiales: [{ nombre: 'A36', tipo: 'Steel' }],
            seccionesBarra: ['W16x67'], seccionesArea: ['ASEC1'], patrones: 27, casos: 32, analizados: 0, combinaciones: 165,
          },
        },
        justificaciones: [
          { id: 'a', clase: 'factor-caso', patron: 'EV', firma: 'DEAD', valor: 0.185, expr: 'k_v' },
          { id: 'b', clase: 'factor-caso', patron: 'EV', firma: 'CM_VIA', valor: 0.185, expr: '0.2' },
          { id: 'c', clase: 'factor-masa', patron: 'MSSSRC1', firma: 'S', valor: 0.5, expr: 'f_2' },
          { id: 'd', clase: 'amortiguamiento', patron: 'RSX', firma: 'amortiguamiento', valor: 0.05, expr: 'xi' },
          { id: 'e', clase: 'factor-caso', patron: 'EH', firma: 'DEAD', valor: 0.3, expr: 'k_v' },
          { id: 'f', clase: 'factor-masa', patron: 'MSSSRC1', firma: 'L', valor: 0.25, expr: 'f_2' },
        ],
      };
      const saneada = sanearObra(o);
      if (JSON.stringify(sanearObra(archivoDeObra(saneada).obra)) !== JSON.stringify(saneada)) return 'la lectura cambió en la ida y vuelta';
      for (const k of ['casos', 'masa', 'resumen']) {
        if (JSON.stringify(saneada.sap[k]) !== JSON.stringify(o.sap[k])) return `el saneo cambió sap.${k}`;
      }
      if (saneada.justificaciones.map((j) => j.clase).join() !== o.justificaciones.map((j) => j.clase).join()) return 'el saneo perdió clases';
      const scope = evaluarObra(saneada, {}).scope;
      if (verificarDelModelo(saneada.justificaciones[0], saneada.sap, scope)?.estado !== 'coincide') return 'EV × DEAD no coincidió';
      if (verificarDelModelo(saneada.justificaciones[1], saneada.sap, scope)?.estado !== 'difiere') return 'EV × CM_VIA con 0,2 coincidió';
      const p = resumirPorParte(saneada, scope);
      // Casos: los dos 0,185 de EV y el amortiguamiento de RSX; el 1 de CM no. Masa: solo S.
      if (p.casos.total !== 3 || p.casos.justificadas !== 2 || p.casos.difieren !== 1) return `casos: ${JSON.stringify(p.casos)}`;
      if (p.masa.total !== 1 || p.masa.justificadas !== 1) return `masa: ${JSON.stringify(p.masa)}`;
      if (p.casos.huerfanas.map((j) => j.id).join() !== 'e') return `huérfanas de casos: ${p.casos.huerfanas.map((j) => j.id)}`;
      if (p.masa.huerfanas.map((j) => j.id).join() !== 'f') return `huérfanas de masa: ${p.masa.huerfanas.map((j) => j.id)}`;
      const r = resumirJustificaciones(saneada, scope);
      if (r.total !== 4 || r.justificadas !== 3 || r.huerfanas.length !== 2) return `resumen: ${JSON.stringify(r)}`;
      // Una lectura mal formada no tumba la obra: lo ilegible se cae y lo demás queda.
      const rota = sanearObra({
        ...o,
        sap: {
          ...o.sap,
          casos: { lista: [{ tipo: 'Modal' }, { nombre: 'EV', cargas: [{ nombre: 'DEAD' }, { nombre: 'S', sf: 0.5 }] }] },
          masa: { fuentes: 'no' },
          resumen: { barras: 'muchas', grupos: [{ barras: 3 }] },
        },
      }).sap;
      if (JSON.stringify(rota.casos.lista) !== '[{"nombre":"EV","tipo":"","estado":"","cargas":[{"tipo":"","nombre":"S","sf":0.5}]}]') {
        return `casos rotos: ${JSON.stringify(rota.casos.lista)}`;
      }
      if (rota.masa !== undefined) return 'una masa sin fuentes se guardó';
      return rota.resumen.barras === 0 && rota.resumen.grupos.length === 0 ? null : `resumen roto: ${JSON.stringify(rota.resumen)}`;
    },
  },
  {
    nombre: 'las combinaciones se agrupan por familia, sus columnas siguen el orden de los casos y se ve qué caso no entra',
    ok: () => {
      if (familiaDe('B25_EX_EVP') !== 'B25' || familiaDe('SERVDS') !== 'SERVDS' || familiaDe('_X') !== '_X') return 'familiaDe';
      const casos = ['CM', 'MODAL', 'LR', 'S', 'RSX', 'EV', 'WXP', 'TEMP', 'CLH_P1', 'CLH_P2', 'CLH_P3', 'DEAD'].map((nombre) => ({
        nombre, tipo: nombre === 'MODAL' ? 'Modal' : 'LinearStatic', estado: '',
        // DEAD no se combina, pero su patrón entra por CM: está cubierto.
        ...(nombre === 'CM' || nombre === 'DEAD' ? { cargas: [{ tipo: 'Load', nombre: 'DEAD', sf: 1 }] } : {}),
      }));
      const cols = columnasDe(COMBOS_PACHON, casos).map((c) => (c.clase === 'combinacion' ? `(${c.nombre})` : c.nombre)).join(' ');
      if (cols !== 'CM LR S RSX EV WXP CLH_P1 CLH_P2 CLH_P3 (ENVCL_H)') return `columnas: ${cols}`;
      if (terminoDe(COMBOS_PACHON[2], { clase: 'caso', nombre: 'EV' }) !== -1) return 'el factor negativo de EV';
      if (terminoDe(COMBOS_PACHON[3], { clase: 'caso', nombre: 'EV' }) !== undefined) return 'un término ausente dio un número';
      const lectura = { modelo: 'm.sdb', leido: '', lista: COMBOS_PACHON };
      const r = resumenCombinaciones(lectura, casos);
      if (JSON.stringify(r.porTipo) !== '[{"tipo":"Envolvente","n":1},{"tipo":"Lineal","n":3}]') return `porTipo ${JSON.stringify(r.porTipo)}`;
      if (r.familias.map((f) => `${f.familia}:${f.n}`).join() !== 'ENVCL:1,B25:2,B23:1') return `familias ${JSON.stringify(r.familias)}`;
      // TEMP no entra en ninguna; MODAL tampoco, pero un modal no se combina.
      if (r.sinUsar.join() !== 'TEMP') return `sin usar: ${r.sinUsar}`;
      if (JSON.stringify(r.cubiertos) !== '[{"caso":"DEAD","por":["CM"]}]') return `cubiertos: ${JSON.stringify(r.cubiertos)}`;
      if (r.anidadas.join() !== 'ENVCL_H' || r.profundidad !== 1) return `anidadas ${r.anidadas} a ${r.profundidad}`;
      if (r.inexistentes.length) return `inexistentes ${JSON.stringify(r.inexistentes)}`;
      // Sin los casos leídos no se sabe qué falta ni qué sobra.
      const sinCasos = resumenCombinaciones({ ...lectura, lista: [...COMBOS_PACHON, { nombre: 'X', tipo: 'Lineal', terminos: [caso('NADA', 1)] }] });
      if (sinCasos.sinUsar.length || sinCasos.inexistentes.length) return 'sin casos leídos inventó faltantes';
      // Un ciclo en una lectura editada a mano no cuelga el resumen.
      const ciclo = resumenCombinaciones({ ...lectura, lista: [
        { nombre: 'A', tipo: 'Lineal', terminos: [{ clase: 'combinacion', nombre: 'B', sf: 1 }] },
        { nombre: 'B', tipo: 'Lineal', terminos: [{ clase: 'combinacion', nombre: 'A', sf: 1 }] },
      ] });
      return ciclo.profundidad >= 1 ? null : `ciclo: ${ciclo.profundidad}`;
    },
  },
  {
    nombre: 'un sub-nodo del SAP2000 se guarda con su lectura, al quitarlo la lectura queda y no vive sin el SAP2000',
    ok: () => {
      const o = {
        ...obra(calc('G', m('q := 1'))),
        modulos: ['sap', 'sap-combinaciones', 'sap-combinaciones', 'otro'],
        sap: {
          modelo: 'm.sdb', ruta: '', version: '', leido: '', modificado: '2026-09-23T12:39:57+00:00',
          combinaciones: { modelo: 'm.sdb', leido: '', lista: COMBOS_PACHON },
        },
      };
      const saneada = sanearObra(o);
      if (saneada.modulos.join() !== 'sap,sap-combinaciones') return `módulos ${saneada.modulos}`;
      if (saneada.sap.modificado !== o.sap.modificado) return 'se perdió el modificado';
      if (JSON.stringify(saneada.sap.combinaciones.lista) !== JSON.stringify(COMBOS_PACHON)) return 'el saneo cambió las combinaciones';
      if (JSON.stringify(sanearObra(archivoDeObra(saneada).obra)) !== JSON.stringify(saneada)) return 'cambió en la ida y vuelta';
      if (sanearObra({ ...o, modulos: ['sap-combinaciones'] }).modulos.length) return 'un sub-nodo sobrevivió sin el SAP2000';
      const rota = sanearObra({ ...o, sap: { ...o.sap, combinaciones: { lista: [
        { tipo: 'Lineal' },
        { nombre: 'C', terminos: [{ nombre: 'CM' }, { clase: 'raro', nombre: 'S', sf: 0.5 }, 'basura'] },
      ] } } }).sap.combinaciones.lista;
      if (JSON.stringify(rota) !== '[{"nombre":"C","tipo":"","terminos":[{"clase":"caso","nombre":"S","sf":0.5}]}]') return `rota: ${JSON.stringify(rota)}`;
      const sin = quitarModulo(saneada, 'sap-combinaciones');
      if (sin.modulos.join() !== 'sap') return `al quitar: ${sin.modulos}`;
      // La lectura queda: el historial no restaura lecturas, y Ctrl+Z tiene que
      // devolver el nodo con sus datos.
      if (sin.sap !== saneada.sap) return 'quitar el sub-nodo tocó la lectura del modelo';
      return quitarModulo(saneada, 'sap') === saneada ? null : 'quitarModulo quitó el SAP2000';
    },
  },
  {
    nombre: 'el resumen modal da T₁, el modo dominante y con cuál se junta el 90 %, y el sello dice si está atrasada',
    ok: () => {
      const r = resumenModal(LECTURA_MODAL);
      if (r.T1 !== 0.715 || r.modos !== 5 || !r.conMasas) return `T1 ${r.T1}, ${r.modos} modos`;
      const { X, Y, Z } = r.porDireccion;
      if (X.dominante?.n !== 3 || Y.dominante?.n !== 1) return `dominantes X ${X.dominante?.n}, Y ${Y.dominante?.n}`;
      if (X.alNoventa !== 4 || Y.alNoventa !== 1 || Z.alNoventa !== undefined) return `al 90 %: ${X.alNoventa} ${Y.alNoventa} ${Z.alNoventa}`;
      if (X.acumulada !== 0.93 || Z.acumulada !== 0) return `acumuladas ${X.acumulada} ${Z.acumulada}`;
      // El orden de llegada no importa: se ordena por número de modo.
      if (resumenModal({ ...LECTURA_MODAL, modos: [...MODOS].reverse() }).T1 !== 0.715) return 'T1 dependió del orden';
      // Solo periodos: no hay masas que resumir.
      const sinMasas = resumenModal({ ...LECTURA_MODAL, modos: MODOS.map(({ n, T, f }) => ({ n, T, f })) });
      if (sinMasas.conMasas || sinMasas.porDireccion.X.dominante) return 'inventó masas';
      const con = (modificado, modelo = 'm.sdb') => ({ modelo, ruta: '', version: '', leido: '', modificado });
      if (atrasoDe(LECTURA_MODAL, con(LECTURA_MODAL.modificado)) !== undefined) return 'al día se dio por atrasada';
      if (atrasoDe(LECTURA_MODAL, con('2026-09-25T12:29:49.500Z')) !== undefined) return 'medio segundo se dio por atrasada';
      if (!atrasoDe(LECTURA_MODAL, con('2026-09-25T14:00:00Z'))) return 'un .sdb más nuevo no la atrasó';
      if (!atrasoDe(LECTURA_MODAL, con(LECTURA_MODAL.modificado, 'otro.sdb'))?.includes('otro.sdb')) return 'otro modelo no la atrasó';
      if (atrasoDe(LECTURA_MODAL, undefined) !== undefined) return 'sin conexión se dio por atrasada';
      // El saneo: ida y vuelta intacta; sin sello o sin caso, fuera; un modo sin periodo, fuera.
      const o = { ...obra(calc('G', m('q := 1'))), modulos: ['sap', 'sap-modal'], sap: { ...con(LECTURA_MODAL.modificado), modal: LECTURA_MODAL } };
      const saneada = sanearObra(o);
      if (JSON.stringify(saneada.sap.modal) !== JSON.stringify(LECTURA_MODAL)) return 'el saneo cambió la lectura modal';
      if (JSON.stringify(sanearObra(archivoDeObra(saneada).obra)) !== JSON.stringify(saneada)) return 'cambió en la ida y vuelta';
      if (sanearObra({ ...o, sap: { ...o.sap, modal: { ...LECTURA_MODAL, modificado: '' } } }).sap.modal) return 'aceptó una lectura sin sello';
      const rota = sanearObra({ ...o, sap: { ...o.sap, modal: { ...LECTURA_MODAL, modos: [{ n: 1 }, { n: 2, T: 0.5, ux: 'mucho' }] } } }).sap.modal.modos;
      return JSON.stringify(rota) === '[{"n":2,"T":0.5,"f":0}]' ? null : `modos rotos: ${JSON.stringify(rota)}`;
    },
  },
  {
    nombre: 'el sub-nodo Modal publica T_x y T_y: las hojas los usan, con flecha, y chocan como cualquier nombre',
    ok: () => {
      const conModal = (modal, ...calculos) => ({
        ...obra(...calculos),
        modulos: ['sap', 'sap-modal'],
        sap: { modelo: 'm.sdb', ruta: '', version: '', leido: '', modificado: LECTURA_MODAL.modificado, ...(modal ? { modal } : {}) },
      });
      const o = conModal(LECTURA_MODAL, calc('E', m('k := T_y / (1 s)'), m('r := T_x / T_y')));
      const ev = evaluarObra(o, {});
      const errores = Object.entries(ev.results).filter(([, r]) => r.error).map(([id, r]) => `${id}: ${r.error}`);
      if (errores.length) return `errores: ${errores.join(' · ')}`;
      // El modo dominante: T_y es el modo 1 y T_x el 3.
      if (Math.abs(ev.scope.k - 0.715) > 1e-12) return `k = ${ev.scope.k}`;
      if (en(ev.scope, 'T_x', 's') !== 0.459) return `T_x = ${en(ev.scope, 'T_x', 's')}`;
      if (ev.duenio.get('T_y') !== 'sap:modal') return `dueño de T_y: ${ev.duenio.get('T_y')}`;
      if ([...(ev.usos.get(K('E')) ?? [])].sort().join() !== 'T_x,T_y') return `usos ${[...(ev.usos.get(K('E')) ?? [])]}`;
      // La región fantasma va antes de la hoja que la usa: es lo que ofrece el autocompletado.
      const iPub = ev.regions.findIndex((r) => r.id === 'pub:sap:modal:T_y');
      const iHoja = ev.regions.findIndex((r) => r.src === 'k := T_y / (1 s)');
      if (iPub < 0 || iPub > iHoja) return `fantasma en ${iPub}, hoja en ${iHoja}`;
      const pub = ev.regions[iPub];
      if (pub.y >= ev.regions[iHoja].y) return 'la fantasma no queda por encima de la hoja';
      // La flecha Modal → hoja sale de `duenio` y `usos`, como las demás.
      const flecha = proyectar(o, ev, {}).aristas.find((a) => a.desde === 'sap:modal' && a.hasta === K('E') && a.tipo === 'dato');
      if (flecha?.etiqueta !== 'T_x, T_y') return `flecha: ${flecha?.etiqueta ?? 'no hay'}`;
      // Aunque la hoja se haya creado antes del Modal, lo ve: sin usarlo todavía,
      // una hoja sin dependencias va después de él en el orden de lectura.
      const suelta = evaluarObra(conModal(LECTURA_MODAL, calc('A', m('q := 1'))), {});
      const iA = suelta.regions.findIndex((r) => r.src === 'q := 1');
      const iT = suelta.regions.findIndex((r) => r.id === 'pub:sap:modal:T_x');
      if (iT < 0 || iT > iA) return `sin usarlo, la fantasma quedó en ${iT} y la hoja en ${iA}`;
      // Una hoja que también define T_x: choque, como entre dos nodos cualesquiera.
      const choque = evaluarObra(conModal(LECTURA_MODAL, calc('C', m('T_x := 1 s'))), {});
      const rep = esperaRepetido('T_x', 2)(choque) ?? esperaProblema('C', /T_x.*2 nodos/)(choque);
      if (rep) return rep;
      // Sin el sub-nodo, sin lectura o sin masas: no se publica nada.
      const sinModulo = evaluarObra({ ...o, modulos: ['sap'] }, {});
      if (sinModulo.scope.T_y !== undefined || !sinModulo.results[o.calculos[0].hoja[0].id]?.error) return 'sin el sub-nodo T_y siguió definida';
      if (evaluarObra(conModal(undefined, calc('A', m('q := 1'))), {}).duenio.has('T_x')) return 'sin lectura publicó';
      const sinMasas = { ...LECTURA_MODAL, modos: MODOS.map(({ n, T, f }) => ({ n, T, f })) };
      if (evaluarObra(conModal(sinMasas, calc('A', m('q := 1'))), {}).duenio.has('T_x')) return 'sin masas publicó';
      // Copiar sigue emparejando cada cálculo con su nodo, con el Modal delante.
      const dep = dependenciasDe(conModal(LECTURA_MODAL, calc('A', m('a := 1')), calc('B', m('b := a + 1'))), ['B']);
      return [...dep.keys()].join() === 'A' ? null : `dependencias ${[...dep.keys()]}`;
    },
  },
  {
    nombre: 'el corte basal sale en la dirección de su espectro, y el viento puede tener vertical sin avisar',
    ok: () => {
      const c = cortesSismicos(LECTURA_BASAL, SAP_BASAL).map((x) => `${x.caso}:${x.dir}:${Math.round(x.V)}`).join();
      if (c !== 'RSX:X:3586,RSY:Y:2199') return `cortes ${c}`;
      // RSX como estático con aceleración en UX (así quedó el modelo de prueba):
      // sigue siendo un corte sísmico, en X.
      const estatico = {
        ...SAP_BASAL,
        espectro: { ...SAP_BASAL.espectro, casos: SAP_BASAL.espectro.casos.filter((x) => x.nombre !== 'RSX') },
        casos: { ...SAP_BASAL.casos, lista: SAP_BASAL.casos.lista.map((x) =>
          x.nombre === 'RSX' ? { nombre: 'RSX', tipo: 'LinearStatic', estado: 'analizado', cargas: [{ tipo: 'Accel', nombre: 'UX', sf: 1.9613 }] } : x) },
      };
      const e = cortesSismicos(LECTURA_BASAL, estatico).map((x) => `${x.caso}:${x.dir}:${x.origen}`).join();
      if (e !== 'RSX:X:aceleracion,RSY:Y:espectro') return `con RSX estático: ${e}`;
      // Sin el espectro leído, la dirección sale de la componente mayor.
      const sinEsp = cortesSismicos(LECTURA_BASAL, { ...SAP_BASAL, espectro: undefined }).map((x) => x.dir).join();
      if (sinEsp !== 'X,Y') return `sin espectro: ${sinEsp}`;
      // WXP tiene FZ y no es gravitacional: no avisa. CM equilibra. SDL_MAL no.
      const g = gravitacionalesConHorizontal(LECTURA_BASAL, SAP_BASAL).map((x) => x.caso).join();
      if (g !== 'SDL_MAL') return `gravitacionales que empujan: ${g}`;
      // Sin saber qué carga cada caso, no se dice nada.
      if (gravitacionalesConHorizontal(LECTURA_BASAL, { ...SAP_BASAL, casos: undefined }).length) return 'avisó sin casos leídos';
      if (fuerza(0.3e-12) !== '0 kN' || fuerza(52.345, 'kN', true) !== '52,35 kN·m') return `fuerza: ${fuerza(0.3e-12)} ${fuerza(52.345, 'kN', true)}`;
      // El saneo: ida y vuelta intacta; sin sello, fuera; una fila con un NaN, fuera.
      const o = { ...obra(calc('G', m('q := 1'))), modulos: ['sap', 'sap-basal'], sap: { ...SAP_BASAL, basal: LECTURA_BASAL } };
      const saneada = sanearObra(o);
      if (JSON.stringify(saneada.sap.basal) !== JSON.stringify(LECTURA_BASAL)) return 'el saneo cambió la lectura basal';
      if (JSON.stringify(sanearObra(archivoDeObra(saneada).obra)) !== JSON.stringify(saneada)) return 'cambió en la ida y vuelta';
      if (sanearObra({ ...o, sap: { ...o.sap, basal: { ...LECTURA_BASAL, modificado: '' } } }).sap.basal) return 'aceptó una lectura sin sello';
      const rota = sanearObra({ ...o, sap: { ...o.sap, basal: { ...LECTURA_BASAL, filas: [basal('A', 1, 2, 3), { ...basal('B', 1, 2, 3), fz: 'x' }] } } }).sap.basal.filas;
      return rota.map((f) => f.caso).join() === 'A' ? null : `filas rotas: ${JSON.stringify(rota)}`;
    },
  },
  {
    nombre: 'los extremos de cada caso en los apoyos: compresión, tracción, corte y momento, sin tracción en un espectro',
    ok: () => {
      const [cm, wxp, rsy] = extremosPorCaso(LECTURA_APOYOS);
      if (cm.compresion?.apoyo !== '3' || cm.compresion.valor !== 10000) return `CM compresión ${JSON.stringify(cm.compresion)}`;
      if (cm.traccion) return 'CM no tracciona';
      if (Math.abs(cm.sumaF3 - 10483.1932) > 1e-6) return `CM suma ${cm.sumaF3}`;
      if (wxp.traccion?.apoyo !== '7' || wxp.traccion.valor !== 40.5) return `WXP tracción ${JSON.stringify(wxp.traccion)}`;
      if (wxp.corte?.apoyo !== '3' || Math.abs(wxp.corte.valor - Math.hypot(100, 60)) > 1e-9) return `WXP corte ${JSON.stringify(wxp.corte)}`;
      if (wxp.momento?.apoyo !== '7') return `WXP momento ${JSON.stringify(wxp.momento)}`;
      // Un espectro: máximos sin signo, sin tracción; el apoyo sin datos no cuenta.
      if (!rsy.espectral || rsy.traccion || rsy.compresion?.apoyo !== '3') return `RSY ${JSON.stringify(rsy)}`;
      if (casosConTraccion(LECTURA_APOYOS).join() !== 'WXP') return `con tracción: ${casosConTraccion(LECTURA_APOYOS)}`;
      // Con la basal: CM cuadra, WXP no, RSY (espectro) no se compara. De otro modelo, nada.
      if (descuadresConBasal(LECTURA_APOYOS, LECTURA_BASAL).join() !== 'WXP') return `descuadres ${descuadresConBasal(LECTURA_APOYOS, LECTURA_BASAL)}`;
      if (descuadresConBasal(LECTURA_APOYOS, { ...LECTURA_BASAL, modelo: 'otro.sdb' }).length) return 'comparó con otro modelo';
      // El saneo: ida y vuelta intacta; un apoyo sin nombre se va con su columna; una fila rota queda en null.
      const o = { ...obra(calc('G', m('q := 1'))), modulos: ['sap', 'sap-apoyos'], sap: { ...SAP_BASAL, apoyos: LECTURA_APOYOS } };
      const saneada = sanearObra(o);
      if (JSON.stringify(saneada.sap.apoyos) !== JSON.stringify(LECTURA_APOYOS)) return 'el saneo cambió la lectura de apoyos';
      if (JSON.stringify(sanearObra(archivoDeObra(saneada).obra)) !== JSON.stringify(saneada)) return 'cambió en la ida y vuelta';
      const rota = sanearObra({ ...o, sap: { ...o.sap, apoyos: {
        ...LECTURA_APOYOS,
        apoyos: [{ nombre: '1' }, { xyz: [0, 0, 0] }, { nombre: '7', xyz: [8, 0] }],
        casos: [{ caso: 'CM', valores: [[1, 2, 3, 4, 5, 6], [9, 9, 9, 9, 9, 9], [1, 2, 'x', 4, 5, 6]] }, { valores: [] }],
      } } }).sap.apoyos;
      const esperada = '{"apoyos":[{"nombre":"1"},{"nombre":"7"}],"casos":[{"caso":"CM","valores":[[1,2,3,4,5,6],null]}]}';
      const vista = JSON.stringify({ apoyos: rota.apoyos, casos: rota.casos });
      return vista === esperada ? null : `apoyos rotos: ${vista}`;
    },
  },
  {
    nombre: 'un conjunto de diseño da la combinación que gobierna cada criterio, y marca lo no concurrente',
    ok: () => {
      // Dos apoyos. B21 es lineal (concurrente); B25 lleva envolvente (Max/Min).
      const respuesta = {
        modelo: 'm.sdb', modificado: '2026-09-25T12:29:49Z', apoyos: ['212', '7'],
        filas: [
          { combo: 'B21', valores: [[33.7, 125.7, 975.4, -710.1, 0, -1.3], [10, 0, -50, 0, 0, 0]] },
          { combo: 'B25_EX_EVP', paso: 'Max', valores: [[204.4, 269, 2158.2, -1407.6, 0, -0.4], [5, 5, 20, 1, 0, 0]] },
          { combo: 'B25_EX_EVP', paso: 'Min', valores: [[178.8, 248, 1961.6, -1494, 0, -3.9], [-30, 2, -80, -2, 0, 0]] },
        ],
      };
      const l = gobernantesDeConjunto(respuesta, ['B21', 'B25'], '2026-09-25T13:00:00Z');
      if (l.combos.join() !== 'B21,B25_EX_EVP' || l.noConcurrentes.join() !== 'B25_EX_EVP') return `combos ${l.combos} / ${l.noConcurrentes}`;
      const [a, b] = l.porApoyo;
      // Nudo 212: la compresión la da el Max de B25 (no concurrente).
      if (a.compresion?.combo !== 'B25_EX_EVP' || a.compresion.valor !== 2158.2 || a.compresion.concurrente) return `212 compresión ${JSON.stringify(a.compresion)}`;
      if (a.traccion) return '212 no tracciona';
      // El corte usa los extremos de cada componente: F1 204,4 y F2 269.
      if (Math.abs(a.corte.valor - Math.hypot(204.4, 269)) > 1e-9) return `212 corte ${a.corte.valor}`;
      // El momento: M1 extremo −1494 (del Min).
      if (a.momento?.combo !== 'B25_EX_EVP' || Math.abs(a.momento.valor - 1494) > 1e-9) return `212 momento ${JSON.stringify(a.momento)}`;
      // El corte y el momento no concurrentes van con la N MENOR (1961,6), no con
      // la de mayor valor absoluto: es la que más tracciona los pernos.
      if (a.corte.v[2] !== 1961.6 || a.momento.v[2] !== 1961.6) return `212 N del corte ${a.corte.v[2]} y del momento ${a.momento.v[2]}`;
      // Nudo 7: la tracción la da el Min de B25 (80 > 50 de B21).
      if (b.traccion?.combo !== 'B25_EX_EVP' || b.traccion.valor !== 80) return `7 tracción ${JSON.stringify(b.traccion)}`;
      // Nudo 7: el corte de B21 (10) no le gana al de B25 (√(30²+5²)).
      if (b.corte?.combo !== 'B25_EX_EVP') return `7 corte ${JSON.stringify(b.corte)}`;
      // Nudo 212, excentricidad: B21 da 710,1/975,4 = 0,728 m; B25, con la
      // compresión MENOR de su Max y su Min (1961,6) y el M extremo (1494), da
      // 0,762 m y gobierna. Su vector lleva esa N.
      const e = a.excentricidad;
      if (e?.combo !== 'B25_EX_EVP' || e.concurrente || Math.abs(e.valor - 1494 / 1961.6) > 1e-12 || e.v[2] !== 1961.6) return `212 excentricidad ${JSON.stringify(e)}`;
      // Nudo 7: B21 tracciona y B25 tracciona en su Min: sin compresión no hay excentricidad.
      if (b.excentricidad) return `7 excentricidad ${JSON.stringify(b.excentricidad)}`;
      // La excentricidad no es la del momento máximo: una N chica con un M menor da más.
      const chica = gobernantesDeConjunto({
        modelo: 'm.sdb', modificado: '', apoyos: ['1'],
        filas: [{ combo: 'A', valores: [[0, 0, 1000, 200, 0, 0]] }, { combo: 'B', valores: [[0, 0, 100, 50, 0, 0]] }],
      }, ['A', 'B'], '').porApoyo[0];
      if (chica.momento?.combo !== 'A' || chica.excentricidad?.combo !== 'B' || chica.excentricidad.valor !== 0.5) return `excentricidad ${JSON.stringify(chica)}`;
      // Con solo B21 todo es concurrente, y la tracción del 7 es 50.
      const solo = gobernantesDeConjunto({ ...respuesta, filas: respuesta.filas.slice(0, 1) }, ['B21'], '');
      if (!solo.porApoyo[1].traccion?.concurrente || solo.porApoyo[1].traccion.valor !== 50) return `solo B21: ${JSON.stringify(solo.porApoyo[1])}`;
      const eSolo = solo.porApoyo[0].excentricidad;
      if (!eSolo?.concurrente || Math.abs(eSolo.valor - 710.1 / 975.4) > 1e-12) return `solo B21: excentricidad ${JSON.stringify(eSolo)}`;
      const ext = extremosDeConjunto(l);
      if (ext.compresion?.apoyo !== '212' || ext.traccion?.apoyo !== '7') return `extremos ${JSON.stringify(ext)}`;
      // Las combinaciones de un conjunto salen de sus familias.
      if (combosDeConjunto(['B25', 'ENVCL'], { modelo: 'm.sdb', leido: '', lista: COMBOS_PACHON }).join() !== 'ENVCL_H,B25_EX_EVP,B25_EX_EVN') return 'combosDeConjunto';
      // Estado: sin leer, al día, cambió de familias, modelo guardado después.
      const c = { id: 'cd1', nombre: 'Hormigón', familias: ['B25', 'B21'] };
      const con = (modificado) => ({ modelo: 'm.sdb', ruta: '', version: '', leido: '', modificado });
      if (estadoConjunto(c, undefined, con(l.modificado)).estado !== 'sin-leer') return 'sin leer';
      if (estadoConjunto(c, l, con(l.modificado)).estado !== 'al-dia') return 'al día (el orden de las familias no importa)';
      // Una lectura anterior a la excentricidad se pide releer: su «—» mentiría.
      const vieja = { ...solo, porApoyo: solo.porApoyo.map(({ excentricidad: _, ...g }) => g) };
      if (!estadoConjunto({ ...c, familias: ['B21'] }, vieja, con(l.modificado)).motivo?.includes('excentricidad')) return 'no marcó la lectura sin excentricidad';
      if (estadoConjunto({ ...c, familias: ['B21'] }, l, con(l.modificado)).motivo !== 'cambiaron sus familias desde que se leyó') return 'familias';
      return estadoConjunto(c, l, con('2026-09-26T00:00:00Z')).estado === 'desactualizado' ? null : 'atrasada';
    },
  },
  {
    nombre: 'los apoyos se agrupan por grupo de SAP: lo asignado gana a lo alcanzado por barras, y lo sin grupo queda a la vista',
    ok: () => {
      // La forma del Pachón: COL_PPALES tiene asignadas las bases; COL_VIENTO
      // llega a las suyas por sus barras; DIAG_LAT llega por barras a bases que
      // ya son de COL_PPALES; 592 no está en ningún grupo.
      const apoyos = ['1', '7', '45', '47', '592'].map((nombre) => ({ nombre }));
      const lectura = {
        modelo: 'm.sdb', leido: '', modificado: '2026-09-25T12:29:49Z', apoyos, casos: [], sinAnalizar: [],
        grupos: [
          { nombre: 'COL_PPALES', directos: ['1', '7'], porBarra: [] },
          { nombre: 'COL_VIENTO', directos: [], porBarra: ['45', '47'] },
          { nombre: 'DIAG_LAT', directos: [], porBarra: ['7'] },
        ],
      };
      const t = tiposDeApoyo(lectura);
      const vista = t.tipos.map((x) => `${x.grupo ?? '—'}:${x.via}:${x.apoyos.join('+')}`).join(' ');
      if (vista !== 'COL_PPALES:directo:1+7 COL_VIENTO:barra:45+47 —:ninguna:592') return `tipos ${vista}`;
      if (JSON.stringify(t.cedidos) !== '[{"grupo":"DIAG_LAT","apoyos":["7"]}]') return `cedidos ${JSON.stringify(t.cedidos)}`;
      if (t.repetidos.length) return `repetidos ${t.repetidos}`;
      // Dos grupos que asignan el mismo nudo: queda en los dos y se avisa.
      const doble = tiposDeApoyo({ ...lectura, grupos: [...lectura.grupos, { nombre: 'OTRO', directos: ['1'], porBarra: [] }] });
      if (doble.repetidos.join() !== '1') return `doble ${doble.repetidos}`;
      // La envolvente de un tipo: el apoyo que más exige, solo entre los suyos.
      const conj = gobernantesDeConjunto({
        modelo: 'm.sdb', modificado: '2026-09-25T12:29:49Z', apoyos: ['1', '7', '45'],
        filas: [{ combo: 'B21', valores: [[1, 0, 100, 0, 0, 0], [2, 0, 300, 0, 0, 0], [50, 0, 900, 0, 0, 0]] }],
      }, ['B21'], '');
      const e = envolventeDeTipo(conj, ['1', '7']);
      if (e.compresion?.apoyo !== '7' || e.compresion.valor !== 300) return `envolvente COL_PPALES ${JSON.stringify(e.compresion)}`;
      if (envolventeDeTipo(conj, ['45']).corte?.valor !== 50) return 'envolvente COL_VIENTO';
      // El saneo conserva los grupos, y quita de ellos un apoyo que no quedó.
      const o = { ...obra(calc('G', m('q := 1'))), modulos: ['sap', 'sap-apoyos'], sap: { ...SAP_BASAL, apoyos: lectura } };
      const saneada = sanearObra(o);
      if (JSON.stringify(saneada.sap.apoyos.grupos) !== JSON.stringify(lectura.grupos)) return 'el saneo cambió los grupos';
      const sinUno = sanearObra({ ...o, sap: { ...o.sap, apoyos: { ...lectura, apoyos: apoyos.filter((a) => a.nombre !== '7') } } });
      if (sinUno.sap.apoyos.grupos[0].directos.join() !== '1') return 'un apoyo quitado siguió en su grupo';
      // Una lectura anterior a los grupos no los inventa.
      return 'grupos' in sanearObra({ ...o, sap: { ...o.sap, apoyos: LECTURA_APOYOS } }).sap.apoyos ? 'inventó grupos' : null;
    },
  },
  {
    nombre: 'los conjuntos se guardan en la obra con historial, su lectura en sap, y una copia los lleva sin la lectura',
    ok: () => {
      const conjunto = nuevoConjunto('Hormigón (LRFD)', ['B21', 'B25']);
      if (!conjunto.id.startsWith('cd')) return `id ${conjunto.id}`;
      const lectura = gobernantesDeConjunto({
        modelo: 'm.sdb', modificado: '2026-09-25T12:29:49Z', apoyos: ['1'],
        filas: [{ combo: 'B21', valores: [[1, 2, 30, 4, 5, 6]] }],
      }, conjunto.familias, '2026-09-25T13:00:00Z');
      let o = conConjunto({ ...obra(calc('G', m('q := 1'))), modulos: ['sap', 'sap-apoyos'] }, conjunto);
      o = { ...o, sap: { modelo: 'm.sdb', ruta: '', version: '', leido: '', conjuntos: { [conjunto.id]: lectura } } };
      const saneada = sanearObra(o);
      if (JSON.stringify(saneada.conjuntosDiseno) !== JSON.stringify([conjunto])) return `conjuntos ${JSON.stringify(saneada.conjuntosDiseno)}`;
      if (JSON.stringify(saneada.sap.conjuntos[conjunto.id]) !== JSON.stringify(lectura)) return 'el saneo cambió la lectura del conjunto';
      if (JSON.stringify(sanearObra(archivoDeObra(saneada).obra)) !== JSON.stringify(saneada)) return 'cambió en la ida y vuelta';
      // Editar reemplaza; quitar deja la lista vacía fuera.
      const editada = conConjunto(saneada, { ...conjunto, nombre: 'H' });
      if (editada.conjuntosDiseno.length !== 1 || editada.conjuntosDiseno[0].nombre !== 'H') return 'editar';
      if ('conjuntosDiseno' in quitarConjunto(editada, conjunto.id)) return 'quitar dejó la lista';
      // Saneo: un id repetido fuera, un nombre vacío toma sus familias, familias repetidas una vez.
      const rota = sanearObra({ ...o, conjuntosDiseno: [
        { id: 'a', nombre: ' ', familias: ['B21', 'B21', 3] }, { id: 'a', nombre: 'dup', familias: [] }, { nombre: 'sin id' },
      ] }).conjuntosDiseno;
      if (JSON.stringify(rota) !== '[{"id":"a","nombre":"B21","familias":["B21"]}]') return `rota ${JSON.stringify(rota)}`;
      // Una lectura cuyo porApoyo no calza con sus apoyos se descarta.
      const mal = sanearObra({ ...o, sap: { ...o.sap, conjuntos: { x: { ...lectura, porApoyo: [] } } } }).sap.conjuntos;
      if (mal !== undefined) return 'aceptó una lectura descalzada';
      // La copia lleva los conjuntos, no su lectura.
      const copia = obraDesde(saneada, 'copia');
      if (JSON.stringify(copia.conjuntosDiseno) !== JSON.stringify([conjunto])) return 'la copia no llevó los conjuntos';
      return copia.sap?.conjuntos ? 'la copia llevó la lectura' : null;
    },
  },
  {
    nombre: 'los apoyos publican sus gobernantes por tipo y conjunto, con la marca de no concurrente, y una hoja las usa',
    ok: () => {
      // COL_PPALES tiene el 1 y el 7; COL_VIENTO, el 45; el 592 no tiene grupo.
      // B21 es lineal; B25 lleva envolvente (Max/Min): no concurrente.
      const apoyos = ['1', '7', '45', '592'];
      const lecturaApoyos = {
        modelo: 'm.sdb', leido: '', modificado: '2026-09-25T12:29:49Z',
        apoyos: apoyos.map((nombre) => ({ nombre })), casos: [], sinAnalizar: [],
        grupos: [
          { nombre: 'COL_PPALES', directos: ['1', '7'], porBarra: [] },
          { nombre: 'COL_VIENTO', directos: [], porBarra: ['45'] },
        ],
      };
      const conjunto = { id: 'cd1', nombre: 'LRFD', familias: ['B21', 'B25'] };
      const gobernantes = gobernantesDeConjunto({
        modelo: 'm.sdb', modificado: '2026-09-25T12:29:49Z', apoyos,
        filas: [
          { combo: 'B21', valores: [[10, 0, 500, 0, 20, 0], [30, 40, 300, 60, 80, 0], [5, 0, -40, 0, 0, 0], [0, 0, 100, 0, 0, 0]] },
          { combo: 'B25_EX_EVP', paso: 'Max', valores: [[12, 0, 800, 0, 10, 0], [1, 1, 200, 1, 1, 0], [3, 0, 10, 0, 0, 0], [0, 0, 100, 0, 0, 0]] },
          { combo: 'B25_EX_EVP', paso: 'Min', valores: [[-2, 0, 600, 0, -5, 0], [0, 0, 150, 0, 0, 0], [-8, 0, -90, 0, 0, 0], [0, 0, 90, 0, 0, 0]] },
        ],
      }, conjunto.familias, '2026-09-25T13:00:00Z');
      const armar = (cambios = {}, ...calculos) => ({
        ...obra(...calculos),
        modulos: ['sap', 'sap-apoyos'],
        conjuntosDiseno: [conjunto],
        sap: { modelo: 'm.sdb', ruta: '', version: '', leido: '', modificado: '2026-09-25T12:29:49Z', apoyos: lecturaApoyos, conjuntos: { cd1: gobernantes } },
        ...cambios,
      });
      // Los alias por defecto: las iniciales de cada tramo, o la palabra si es una.
      const defectos = ['COL_PPALES', 'COL_VIENTO', 'LRFD', 'Hormigón (LRFD)', '1PISO'].map(aliasPorDefecto).join();
      if (defectos !== 'CP,CV,LRFD,HL,T1PISO') return `alias por defecto ${defectos}`;

      const o = armar({}, calc('PB', m('T_u := -N_t_CV_LRFD'), m('M_u := M_m_CP_LRFD')));
      const ev = evaluarObra(o, {});
      const errores = Object.entries(ev.results).filter(([, r]) => r.error).map(([id, r]) => `${id}: ${r.error}`);
      if (errores.length) return `errores: ${errores.join(' · ')}`;
      const kN = (n) => en(ev.scope, n, 'kN');
      const kNm = (n) => en(ev.scope, n, 'kN*m');
      // COL_PPALES: la compresión es del Max de B25 en el 1 (no concurrente), con su V y su M.
      if (kN('N_c_CP_LRFD') !== 800 || kN('V_c_CP_LRFD') !== 12 || kNm('M_c_CP_LRFD') !== 10) return `compresión CP ${kN('N_c_CP_LRFD')} ${kN('V_c_CP_LRFD')} ${kNm('M_c_CP_LRFD')}`;
      if (ev.scope.nc_c_CP_LRFD !== 1) return `nc_c_CP_LRFD = ${ev.scope.nc_c_CP_LRFD}`;
      // El corte y el momento, de B21 en el 7: concurrentes, con la N de esa combinación.
      if (kN('V_v_CP_LRFD') !== 50 || kN('N_v_CP_LRFD') !== 300 || kNm('M_v_CP_LRFD') !== 100) return 'corte CP';
      if (kNm('M_m_CP_LRFD') !== 100 || kN('N_m_CP_LRFD') !== 300 || ev.scope.nc_m_CP_LRFD !== 0) return 'momento CP';
      // La excentricidad: 100/300 en el 7 con B21, la mayor; la hoja saca e = M_e / N_e.
      if (kNm('M_e_CP_LRFD') !== 100 || kN('N_e_CP_LRFD') !== 300 || kN('V_e_CP_LRFD') !== 50 || ev.scope.nc_e_CP_LRFD !== 0) return 'excentricidad CP';
      // COL_VIENTO no comprime en ninguna combinación con momento: sin excentricidad.
      if (ev.duenio.has('M_e_CV_LRFD')) return 'publicó una excentricidad sin compresión';
      // Nada tracciona en COL_PPALES: no se publica, no se inventa un cero.
      if (ev.duenio.has('N_t_CP_LRFD')) return 'publicó una tracción que no hay';
      // COL_VIENTO: la tracción es del Min de B25, N negativa.
      if (kN('N_t_CV_LRFD') !== -90 || kN('V_t_CV_LRFD') !== 8 || ev.scope.nc_t_CV_LRFD !== 1) return `tracción CV ${kN('N_t_CV_LRFD')}`;
      if (kN('T_u') !== 90) return `T_u = ${kN('T_u')}`;
      // Sin grupo, no publica.
      if ([...ev.duenio.keys()].some((n) => n.endsWith('_LRFD') && !/_(CP|CV)_LRFD$/.test(n))) return 'publicó un tipo sin grupo';
      if (ev.duenio.get('N_c_CP_LRFD') !== 'sap:apoyos') return `dueño ${ev.duenio.get('N_c_CP_LRFD')}`;
      const flecha = proyectar(o, ev, {}).aristas.find((a) => a.desde === 'sap:apoyos' && a.hasta === K('PB') && a.tipo === 'dato');
      if (flecha?.etiqueta !== 'M_m_CP_LRFD, N_t_CV_LRFD') return `flecha: ${flecha?.etiqueta ?? 'no hay'}`;

      // Los alias los elige el ingeniero: el de tipo en la obra, el de conjunto en el conjunto.
      const conAlias = conAliasTipo(armar({ conjuntosDiseno: [{ ...conjunto, alias: 'H' }] }), 'COL_PPALES', 'PB1');
      const nombres = publicaApoyos(conAlias).publicados.map((p) => p.nombre);
      if (!nombres.includes('N_c_PB1_H') || nombres.some((n) => n.endsWith('_LRFD'))) return `con alias: ${nombres.join()}`;
      if (conAliasTipo(conAlias, 'COL_PPALES', '').aliasTipos !== undefined) return 'un alias vacío no volvió al de por defecto';
      // Dos tipos con el mismo alias: el segundo no publica, y se dice.
      const choque = publicaApoyos(conAliasTipo(armar(), 'COL_VIENTO', 'CP'));
      if (choque.publicados.some((p) => p.nombre === 'N_t_CP_LRFD')) return 'el alias repetido publicó';
      if (!choque.problemas.some((p) => p.includes('CP'))) return `problemas: ${choque.problemas}`;
      // Un alias que no es un nombre del motor, tampoco.
      if (!publicaApoyos(conAliasTipo(armar(), 'COL_VIENTO', 'C V')).problemas.length) return 'aceptó un alias con espacio';
      // Si cambiaron las familias, la lectura ya no es del conjunto: no publica.
      if (publicaApoyos(armar({ conjuntosDiseno: [{ ...conjunto, familias: ['B21'] }] })).publicados.length) return 'publicó una lectura de otras familias';
      // Sin el sub-nodo, nada.
      if (evaluarObra(armar({ modulos: ['sap'] }), {}).duenio.has('N_c_CP_LRFD')) return 'publicó sin el sub-nodo';

      // Saneo e ida y vuelta de los alias; una copia los lleva.
      const saneada = sanearObra(conAlias);
      if (JSON.stringify(saneada.aliasTipos) !== '{"COL_PPALES":"PB1"}' || saneada.conjuntosDiseno[0].alias !== 'H') return `saneo ${JSON.stringify(saneada.aliasTipos)} ${saneada.conjuntosDiseno[0].alias}`;
      if (JSON.stringify(sanearObra(archivoDeObra(saneada).obra)) !== JSON.stringify(saneada)) return 'cambió en la ida y vuelta';
      if (sanearObra({ ...conAlias, aliasTipos: { A: 3, B: ' ', C: 'X1' } }).aliasTipos?.C !== 'X1') return 'saneo de alias rotos';
      const copia = obraDesde(saneada, 'copia');
      return copia.aliasTipos?.COL_PPALES === 'PB1' && copia.conjuntosDiseno[0].alias === 'H' ? null : 'la copia no llevó los alias';
    },
  },
  {
    nombre: 'una justificación sigue a su carga cuando el valor cambia en SAP, y se suelta cuando no se sabe cuál es',
    ok: () => {
      const j = { id: 'j', patron: 'CM_VIA', firma: firmaDe(CARGA_VIA), valor: 0.769, expr: 'w' };
      // El modelo pasó de 0,769 a 0,8: única candidata, la sigue.
      const cambiada = { ...CARGA_VIA, valor: 0.8 };
      if (cargaDe(j, [cambiada, CARGA_CUB]) !== cambiada) return 'perdió la carga cuyo valor cambió';
      // Dos candidatas y ninguna con el valor atado: no se adivina.
      if (cargaDe(j, [cambiada, { ...CARGA_VIA, valor: 2 }]) !== undefined) return 'adivinó entre dos candidatas';
      // Con el valor atado entre varias, esa.
      if (cargaDe(j, [{ ...CARGA_VIA, valor: 2 }, CARGA_VIA]) !== CARGA_VIA) return 'no eligió la del valor atado';
      // Otra dirección es otra carga, aunque tenga el mismo valor.
      if (cargaDe(j, [{ ...CARGA_VIA, dir: 6 }, { ...CARGA_VIA, dir: 5 }]) !== undefined) return 'confundió la dirección';
      return null;
    },
  },
  {
    nombre: 'la verificación convierte con el motor, respeta el signo y falla con otra dimensión',
    ok: () => {
      const scope = evaluarObra(obra(calc('A', m('q := 10 kgf/m^2'), m('w := 0.7691 kN/m'), m('h := 3 m'))), {}).scope;
      if (verificar('q', CARGA_CUB, scope).estado !== 'coincide') return '10 kgf/m² no coincidió con 0,0980665 kN/m²';
      if (verificar('w', CARGA_VIA, scope).estado !== 'coincide') return 'un redondeo de 0,01 % no coincidió';
      if (verificar('-q', CARGA_CUB, scope).estado !== 'difiere') return 'el signo contrario coincidió';
      const dim = verificar('h', CARGA_CUB, scope);
      if (dim.estado !== 'error') return `una longitud contra una presión dio ${dim.estado}`;
      const temp = { patron: 'TEMP', clase: 'barra-temperatura', tipoTemperatura: 1, valor: 10, n: 381 };
      if (verificar('10', temp, scope).estado !== 'coincide') return 'una temperatura sin unidades no coincidió';
      return verificar('10 K', temp, scope).estado === 'coincide' ? null : 'una diferencia en K no coincidió';
    },
  },
  {
    nombre: 'desprender una genérica da los mismos números, y el sello pasa a ser un origen',
    ok: () => {
      const imp = { ...importada(ZAPATA), procedencia: 'biblioteca', publica: { u_max: 'u' } };
      const antes = evaluarImportada(ZAPATA, imp, {});
      const nodo = desprender({ id: 'k', nombre: 'Z', hoja: [], frontera: imp }, ZAPATA);
      const f = nodo.frontera;
      if (f.procedencia !== 'derivada') return `procedencia «${f.procedencia}»`;
      // Deja de decir «soy esta genérica» y pasa a decir «salí de ella»: con el
      // sello puesto, `quedoAtras` avisaría de un desfase respecto de algo de lo
      // que esta hoja ya no es una instancia.
      if (f.sha256 !== undefined || f.slug !== undefined) return 'conservó el sello de instancia';
      if (f.origen?.sha256 !== ZAPATA.biblioteca.sha256) return 'perdió el origen';
      if (!nodo.hoja.length) return 'la copia se quedó sin regiones';
      // Y las entradas quedaron horneadas en las regiones: la copia da el mismo
      // número sin volver a instanciar nada.
      const despues = evaluarHojaConFrontera(nodo.hoja, f, {});
      return String(despues.scope.u_max) === String(antes.scope.u_max)
        ? null
        : `${despues.scope.u_max} ≠ ${antes.scope.u_max}`;
    },
  },
  {
    nombre: 'insertar detrás de un bloque no mueve nada de lo que está por encima',
    // La mini hoja es una lista y la pestaña es el plano, y las dos editan el
    // mismo dato: insertar no puede renumerar la hoja entera, o escribir una
    // línea en el panel desharía la disposición hecha en el canvas.
    ok: () => {
      const a = reg('math', 'a := 1', 40);
      const b = reg('math', 'b := 2', 88);
      const c = reg('math', 'c := 3', 400);
      const nueva = reg('math', 'x := 9', 0);
      const salida = insertarEnHoja([a, b, c], nueva, a.id);
      const por = (id) => salida.find((x) => x.id === id);
      if (por(a.id).y !== 40) return `se movió lo de arriba: a quedó en ${por(a.id).y}`;
      if (por(nueva.id).y !== a.y + PASO_LECTURA) return `la nueva cayó en ${por(nueva.id).y}`;
      if (por(nueva.id).x !== a.x) return 'la nueva no heredó la columna de a';
      const orden = ordenDeLectura(salida).map((x) => x.src.slice(0, 1)).join('');
      return orden === 'axbc' ? null : `el orden de lectura dio «${orden}»`;
    },
  },
  {
    nombre: 'las entradas de una hoja propia son lo que usa y no define, sin unidades ni funciones',
    // Una genérica declara sus campos en `meta.entradas`; una hoja escrita a mano
    // no declara nada, así que lo único honesto es leerlo de lo que hay escrito.
    // Sin descartar los intrínsecos, `kN` y `sqrt` saldrían como entradas que
    // faltan, y el formulario pediría atar una unidad a algo.
    ok: () => {
      const hoja = [
        reg('math', 'd := 2 * r', 40),
        reg('math', 'A := pi * r^2', 88),
        reg('math', 'F := sqrt(q) * 1 kN', 136),
        reg('text', 'q es la presion de contacto', 184),
      ];
      const dio = nombresSueltos(hoja).join(',');
      return dio === 'r,q' ? null : `dio «${dio}», se esperaba «r,q»`;
    },
  },
  {
    nombre: 'una función que la propia hoja define en un programa no es una entrada',
    // El panel ofrecía atar `Cb_seg`, `m_r` y `phiMn` de la costanera como si
    // vinieran de fuera. Atar una habría tapado la función con un número.
    ok: () => {
      const hoja = [
        reg('program', 'f(x) := 2 * x', 40),
        reg('math', 'y := f(a) + g_ext', 88),
      ];
      const dio = nombresSueltos(hoja).join(',');
      return dio === 'a,g_ext' ? null : `dio «${dio}», se esperaba «a,g_ext»`;
    },
  },
  {
    nombre: 'borrar un bloque no mueve ninguno de los demás',
    // El hueco se queda, y es lo correcto: los huecos son deliberados —39
    // espaciadores en el corpus, 16 solo en `anclajes-pedestal`— y renumerar una
    // hoja de 650 regiones por borrar una línea la recolocaría entera.
    ok: () => {
      const a = reg('math', 'a := 1', 40);
      const b = reg('math', 'b := 2', 88);
      const c = reg('math', 'c := 3', 136);
      const salida = [a, b, c].filter((x) => x.id !== b.id);
      const movidos = salida.filter((x) => x.y !== { [a.id]: 40, [c.id]: 136 }[x.id]);
      return movidos.length ? `se movieron: ${movidos.map((x) => x.src).join(', ')}` : null;
    },
  },
];

// ── El saneo de lo que estaba guardado ───────────────────────────────────────
//
// No necesita evaluar nada, así que van aparte: cada uno recibe una obra cruda
// —lo que puede haber escrito una versión anterior de la aplicación— y comprueba
// lo que sale.

/** La hoja de un nodo, se llame como se llame en esta versión del documento. */
const hojaDeNodo = (k) => k.hoja ?? k.bloques ?? [];

/** Todos los ids que reparte el saneo de una obra, en un solo array. */
function idsDe(o) {
  const ids = [];
  for (const k of o.calculos) {
    ids.push(k.id, ...hojaDeNodo(k).map((b) => b.id));
  }
  return ids;
}

const CASOS_SANEO = [
  {
    nombre: 'dos bloques sin id no acaban con el mismo id de rescate',
    // El fallo que cierra: los ids de rescate llevaban el índice DENTRO de su
    // padre, así que la primera partida de cada carga era `s-recuperada-0` y los
    // primeros bloques de cada nodo colisionaban entre sí. Dos bloques con el
    // mismo id comparten entrada en `results` y `key` de React. Las cargas de una
    // obra anterior se migran a cálculos, y tampoco pueden chocar con ellos.
    crudo: {
      id: 'o',
      calculos: [
        { nombre: 'A', bloques: [{ src: 'a := 1' }, { src: 'b := 2' }] },
        { nombre: 'B', bloques: [{ src: 'c := 3' }] },
      ],
      cargas: [
        { nombre: 'C1', subcargas: [{ nombre: 'p', bloques: [{ src: 'x := 1' }] }] },
        { nombre: 'C2', subcargas: [{ nombre: 'q', bloques: [{ src: 'y := 1' }] }] },
      ],
    },
    ok: (o) => {
      const ids = idsDe(o);
      const repes = ids.filter((id, i) => ids.indexOf(id) !== i);
      return repes.length ? `ids repetidos: ${[...new Set(repes)].join(', ')}` : null;
    },
  },
  {
    nombre: 'un id que ya venía se conserva, y solo el que choca se renombra',
    crudo: {
      id: 'o',
      calculos: [
        { id: 'k1', nombre: 'A', bloques: [{ id: 'b1', src: 'a := 1' }] },
        { id: 'k2', nombre: 'B', bloques: [{ id: 'b1', src: 'b := 2' }] },
      ],
    },
    ok: (o) => {
      if (o.calculos[0].hoja[0].id !== 'b1') return 'se renombró el primero, que no chocaba';
      if (o.calculos[1].hoja[0].id === 'b1') return 'el segundo conservó el id repetido';
      return null;
    },
  },
  {
    nombre: 'un id de obra que no cabe en una URL se slugifica en vez de dejar la obra inalcanzable',
    // `/obra/<id>` pasa por el alfabeto cerrado de `SLUG_PROYECTO_RE`: un id que
    // no lo cumple deja una obra guardada que `parsearRuta` rechaza, y el enlace
    // cae en el menú sin decir nada.
    crudo: { id: 'Galpón Altiplano', calculos: [] },
    ok: (o) =>
      o.id === 'galpon-altiplano' ? null : `dio «${o.id}», se esperaba «galpon-altiplano»`,
  },
  {
    nombre: 'una obra sin id no se puede guardar ni enlazar, y se descarta',
    crudo: { nombre: 'sin id' },
    ok: (o) => (o === null ? null : `se aceptó una obra sin id: ${JSON.stringify(o)}`),
  },
  {
    nombre: 'un bloque cuyo src no es texto se descarta y no tumba la evaluación',
    // `evaluateSheet` hace `region.src.trim()` sin red.
    crudo: {
      id: 'o',
      calculos: [{ id: 'k', nombre: 'A', bloques: [{ id: 'b1', src: 3 }, { id: 'b2', src: 'a := 1' }] }],
    },
    ok: (o) => (o.calculos[0].hoja.length === 1 ? null : 'no se descartó el bloque sin src'),
  },
  {
    nombre: 'una obra exportada y vuelta a leer es la misma obra',
    // El archivo es la única forma de sacar una obra de este navegador, así que
    // la ida y vuelta tiene que ser fiel hasta el último bloque y hasta el
    // último alias publicado.
    crudo: {
      id: 'o',
      nombre: 'Galpón',
      creada: '2026-01-01T00:00:00.000Z',
      modulos: ['cargas'],
      calculos: [
        {
          id: 'k1',
          nombre: 'Geometría',
          bloques: [{ id: 'b1', tipo: 'math', src: 'A := 4 m * 3 m' }],
        },
        {
          id: 'k2',
          nombre: 'Placa',
          bloques: [],
          importada: {
            slug: 'placa-base-generica',
            sha256: 'a'.repeat(64),
            entradas: { t_bp: 30 },
            formulas: { L_bp: 'A / (1 m)' },
            publica: { T_grupo: 'T_g' },
          },
        },
      ],
      cargas: [
        {
          id: 'c1',
          nombre: 'D',
          subcargas: [
            { id: 's1', nombre: 'Cubierta', variable: 'CM_1', bloques: [{ id: 'b2', tipo: 'math', src: 'CM_1 := 3 tonf' }] },
          ],
        },
      ],
    },
    ok: (o) => {
      // `importarObra` necesita `localStorage` para saber qué ids están
      // tomados, que en Node no existe; se compara el saneo de la ida y vuelta,
      // que es lo que de verdad reconstruye la obra.
      const texto = JSON.stringify(archivoDeObra(o));
      const vuelta = sanearObra(JSON.parse(texto).obra);
      return JSON.stringify(vuelta) === JSON.stringify(o)
        ? null
        : `la vuelta no coincide:\n          ida:    ${JSON.stringify(o)}\n          vuelta: ${JSON.stringify(vuelta)}`;
    },
  },
  {
    nombre: 'un alias que no se puede escribir en una fórmula no sobrevive al saneo',
    crudo: {
      id: 'o',
      calculos: [
        {
          id: 'k',
          nombre: 'P',
          bloques: [],
          importada: {
            slug: 'x',
            sha256: 'b'.repeat(64),
            entradas: {},
            publica: { u_max: '2malo', T_grupo: 'T_g', otra: 'min' },
          },
        },
      ],
    },
    ok: (o) => {
      const pub = o.calculos[0].frontera.publica;
      const claves = Object.keys(pub).sort().join(',');
      return claves === 'T_grupo' ? null : `quedaron: ${claves}`;
    },
  },
  {
    nombre: 'el id crudo y el saneado se resuelven igual, para poder reescribir esa entrada',
    // `guardarObra` busca la entrada en el archivo CRUDO por este id: si no
    // coincidiera con el de la obra saneada, guardar insertaría un duplicado en
    // vez de reemplazar.
    crudo: { id: 'Galpón Altiplano', calculos: [] },
    ok: (o, crudo) => (idDeObra(crudo) === o.id ? null : `${idDeObra(crudo)} ≠ ${o.id}`),
  },
  {
    nombre: 'una obra con `bloques` se lee como `hoja` de regiones, en el mismo orden',
    // `esRegion` exige `x` e `y` finitos: si el saneo validara ANTES de
    // sintetizar las coordenadas, descartaría las tres y la obra abriría VACÍA,
    // que es un modo de fallo que no avisa de nada.
    crudo: {
      id: 'o',
      calculos: [
        {
          id: 'k',
          nombre: 'A',
          bloques: [
            { id: 'b1', tipo: 'math', src: 'a := 1' },
            { id: 'b2', tipo: 'text', src: 'nota' },
            { id: 'b3', tipo: 'math', src: 'b := a + 1' },
          ],
        },
      ],
    },
    ok: (o) => {
      const h = o.calculos[0].hoja;
      if (!Array.isArray(h) || h.length !== 3) return `dio ${JSON.stringify(h)}`;
      const sinCoords = h.filter((x) => !Number.isFinite(x.x) || !Number.isFinite(x.y));
      if (sinCoords.length) return `sin coordenadas: ${sinCoords.map((x) => x.id).join(', ')}`;
      if (h.find((x) => x.id === 'b2')?.kind !== 'text') return '«tipo» no se convirtió en «kind»';
      // El orden del array ERA el orden de lectura, y el de la obra es lo que
      // resuelve el scope: tiene que seguir siéndolo tras la migración.
      const leido = [...h].sort((p, q) => p.y - q.y || p.x - q.x).map((x) => x.id).join(',');
      return leido === 'b1,b2,b3' ? null : `el orden de lectura cambió: ${leido}`;
    },
  },
  {
    nombre: 'dos nodos que traen la misma región de una genérica no se quedan con el mismo id',
    // Los ids de región son las claves de `results` en la hoja global de la
    // obra: dos iguales comparten resultado y `key` de React. Es el paralelo del
    // caso de los bloques, ahora que un nodo trae regiones copiadas.
    crudo: {
      id: 'o',
      calculos: [
        { id: 'k1', nombre: 'A', hoja: [{ id: 'b1', kind: 'math', x: 40, y: 40, src: 'a := 1' }] },
        { id: 'k2', nombre: 'B', hoja: [{ id: 'b1', kind: 'math', x: 40, y: 40, src: 'b := 2' }] },
      ],
    },
    ok: (o) => {
      if (o.calculos[0].hoja[0].id !== 'b1') return 'se renombró el primero, que no chocaba';
      if (o.calculos[1].hoja[0].id === 'b1') return 'el segundo conservó el id repetido';
      return null;
    },
  },
  {
    nombre: 'una `importada` guardada se lee como una frontera de la biblioteca',
    // Es lo que hay en el `localStorage` de quien ya tiene obras: sin
    // `procedencia`, pero con slug y sello, que es exactamente una referencia a
    // la biblioteca.
    crudo: {
      id: 'o',
      calculos: [
        {
          id: 'k',
          nombre: 'Z',
          bloques: [],
          importada: {
            slug: 'zapata-generica',
            sha256: 'c'.repeat(64),
            entradas: { B: 2 },
            publica: { u_max: 'u_z' },
          },
        },
      ],
    },
    ok: (o) => {
      const f = o.calculos[0].frontera;
      if (!f) return 'no se convirtió en frontera';
      if (f.procedencia !== 'biblioteca') return `procedencia «${f.procedencia}»`;
      if (f.slug !== 'zapata-generica' || f.sha256 !== 'c'.repeat(64)) return 'perdió el sello';
      if (f.publica?.u_max !== 'u_z') return 'perdió lo que publicaba';
      return null;
    },
  },
  {
    nombre: 'los grupos sobreviven a guardar y releer, y una referencia rota se descarta',
    // g2 no tiene un color legible: se descarta entero en vez de inventarle uno,
    // y su miembro queda sin grupo. k3 apunta a un grupo que no existe.
    crudo: {
      id: 'o',
      grupos: [
        { id: 'g1', nombre: 'Sismo', color: '#DC2626' },
        { id: 'g2', nombre: 'Roto', color: 'rojo' },
        { id: 'g1', nombre: 'Repetido', color: '#000000' },
      ],
      calculos: [
        { id: 'k1', nombre: 'A', hoja: [], grupo: 'g1' },
        { id: 'k2', nombre: 'B', hoja: [], grupo: 'g2' },
        { id: 'k3', nombre: 'C', hoja: [], grupo: 'fantasma' },
      ],
    },
    ok: (o) => {
      const g = (o.grupos ?? []).map((x) => `${x.id}:${x.nombre}`).join(',');
      if (g !== 'g1:Sismo') return `grupos: ${g}`;
      const de = (id) => o.calculos.find((k) => k.id === id)?.grupo;
      if (de('k1') !== 'g1') return 'k1 perdió su grupo';
      if (de('k2') !== undefined) return 'k2 conservó un grupo descartado';
      if (de('k3') !== undefined) return 'k3 conservó un grupo que no existe';
      // Ida y vuelta por el archivo, que es lo que hace exportar e importar.
      const vuelta = sanearObra(archivoDeObra(o).obra);
      if (JSON.stringify(vuelta.grupos) !== JSON.stringify(o.grupos)) return 'el archivo cambió los grupos';
      if (vuelta.calculos[0].grupo !== 'g1') return 'el archivo perdió la asignación';
      // Borrar el grupo se lleva también las referencias.
      const sin = borrarGrupo(o, 'g1');
      if (sin.grupos.length || sin.calculos[0].grupo) return 'borrarGrupo dejó referencias';
      return null;
    },
  },
  {
    nombre: 'la marca «Revisar» se sanea: nota corta, origen conocido o usuario',
    crudo: {
      id: 'o',
      calculos: [
        { id: 'k1', nombre: 'A', hoja: [], revisar: { nota: '  Supuesto: suelo tipo D  ', por: 'asistente' } },
        { id: 'k2', nombre: 'B', hoja: [], revisar: { nota: 'x'.repeat(500), por: 'alguien' } },
        { id: 'k3', nombre: 'C', hoja: [], revisar: { nota: 42 } },
        { id: 'k4', nombre: 'D', hoja: [], revisar: 'sí' },
        { id: 'k5', nombre: 'E', hoja: [] },
      ],
    },
    ok: (o) => {
      const r = (id) => o.calculos.find((k) => k.id === id)?.revisar;
      if (r('k1')?.nota !== 'Supuesto: suelo tipo D' || r('k1')?.por !== 'asistente') return `k1: ${JSON.stringify(r('k1'))}`;
      if (r('k2')?.nota.length !== 280) return `k2 no se cortó: ${r('k2')?.nota.length}`;
      if (r('k2')?.por !== 'usuario') return 'un origen desconocido no quedó como usuario';
      if (r('k3')?.nota !== '' ) return 'una nota que no es texto no quedó vacía con la marca';
      if (r('k4') !== undefined) return 'una marca que no es objeto sobrevivió';
      return 'revisar' in o.calculos.find((k) => k.id === 'k5') ? 'apareció `revisar` donde no había' : null;
    },
  },
  {
    nombre: 'el nodo SAP2000 y su última conexión sobreviven al saneo; una sin modelo, no',
    // `cargas` ya no es un módulo: su contenido se migra a cálculos.
    crudo: {
      id: 'o',
      modulos: ['cargas', 'sap', 'inventado'],
      sap: { modelo: 'v46_FUND.sdb', ruta: 'C:\\x\\v46_FUND.sdb', version: 27, leido: '2026-09-23T12:00:00.000Z' },
      calculos: [],
    },
    ok: (o, crudo) => {
      if (o.modulos.join(',') !== 'sap') return `módulos: ${o.modulos.join(',')}`;
      if (o.sap?.modelo !== 'v46_FUND.sdb' || o.sap.version !== '') return `sap: ${JSON.stringify(o.sap)}`;
      const sinModelo = sanearObra({ ...crudo, sap: { ruta: 'x' } });
      return 'sap' in sinModelo ? 'una conexión sin modelo sobrevivió' : null;
    },
  },
  {
    nombre: 'la lectura de Load Patterns sobrevive al saneo; un patrón sin nombre, no',
    // Los grupos de SAP que traiga una obra anterior se descartan: servían para
    // aplicar cargas, que ya no existen.
    crudo: {
      id: 'o',
      modulos: ['sap'],
      calculos: [],
      sap: {
        modelo: 'm.sdb',
        grupos: [{ nombre: 'CUB', barras: 3, areas: 1 }],
        patrones: {
          modelo: 'm.sdb',
          leido: '2026-09-23T12:00:00.000Z',
          lista: [
            { nombre: 'DEAD', tipo: 'Dead', pesoPropio: 1 },
            { nombre: 'LIVE', tipo: 'Live', pesoPropio: 'x' },
            { nombre: '', tipo: 'Dead' },
            { tipo: 'Wind' },
          ],
        },
      },
    },
    ok: (o) => {
      if ('grupos' in o.sap) return 'sobrevivieron los grupos de SAP';
      const l = o.sap.patrones?.lista ?? [];
      const dio = l.map((p) => `${p.nombre}:${p.tipo}:${p.pesoPropio}`).join(',');
      if (dio !== 'DEAD:Dead:1,LIVE:Live:0') return `lista: ${dio}`;
      const vuelta = sanearObra(archivoDeObra(o).obra);
      return JSON.stringify(vuelta) === JSON.stringify(o) ? null : 'la lectura cambió en la ida y vuelta';
    },
  },
  {
    nombre: 'las cargas asignadas leídas del modelo sobreviven al saneo, y cada una se lee en palabras',
    // Los valores son del modelo de prueba del Pachón, en kN, m y °C, como los
    // entrega el puente.
    crudo: {
      id: 'o',
      modulos: ['sap'],
      calculos: [],
      sap: {
        modelo: 'm.sdb',
        cargas: {
          modelo: 'm.sdb',
          leido: '2026-09-23T12:00:00.000Z',
          lista: [
            { patron: 'SDL_CUB', clase: 'area-a-barras', csys: 'GLOBAL', dir: 10, dist: 1, valor: 0.0980665, n: 33 },
            { patron: 'CM_VIA', clase: 'barra-distribuida', csys: 'GLOBAL', dir: 10, momento: false, valor: 0.769, n: 22 },
            { patron: 'CLV_P1', clase: 'barra-puntual', csys: 'GLOBAL', dir: 10, momento: false, en: 0.125, valor: 190.416, n: 1 },
            { patron: 'WPI', clase: 'area-uniforme', csys: 'Local', dir: 3, valor: 0.407, n: 2 },
            { patron: 'X', clase: 'barra-distribuida', dir: 10, valor: 1, valor2: 3, desde: 0, hasta: 0.5, n: 1 },
            { patron: 'N', clase: 'nudo', csys: 'GLOBAL', componente: 'M3', valor: -2.5, n: 4 },
            { patron: 'TEMP', clase: 'barra-temperatura', tipoTemperatura: 1, valor: 10, n: 381 },
            { patron: 'MALA', clase: 'inventada', valor: 1, n: 1 },
            { patron: '', clase: 'nudo', valor: 1, n: 1 },
            { patron: 'SIN', clase: 'nudo', n: 1 },
          ],
        },
      },
    },
    ok: (o) => {
      const l = o.sap.cargas?.lista ?? [];
      if (l.length !== 7) return `quedaron ${l.length} cargas, se esperaban 7`;
      const vuelta = sanearObra(archivoDeObra(o).obra);
      if (JSON.stringify(vuelta) !== JSON.stringify(o)) return 'la lectura cambió en la ida y vuelta';
      const esperado = [
        '0,09807 kN/m² · área a barras, una dirección · gravedad · 33 áreas',
        '0,769 kN/m · distribuida en barra · gravedad · 22 barras',
        '190,4 kN · puntual en barra, a 0,125 de la longitud · gravedad · 1 barra',
        '0,407 kN/m² · uniforme en área · local 3 (Local) · 2 áreas',
        '1 → 3 kN/m · distribuida en barra, de 0 a 0,5 de la longitud · gravedad · 1 barra',
        '-2,5 kN·m · en nudo, M3 · 4 nudos',
        '10 °C · temperatura en barra · 381 barras',
      ];
      for (const [i, c] of l.entries()) {
        const dio = `${valorDe(c)} · ${comoDe(c)} · ${objetosDe(c)}`;
        if (dio !== esperado[i]) return `«${dio}», se esperaba «${esperado[i]}»`;
      }
      const porPatron = cargasPorPatron(l);
      return porPatron.get('SDL_CUB')?.length === 1 && porPatron.size === 7 ? null : 'mal agrupadas por patrón';
    },
  },
  {
    nombre: 'las justificaciones sobreviven al saneo; una sin expresión o con id repetido, no',
    crudo: {
      id: 'o',
      calculos: [],
      justificaciones: [
        { id: 'j1', patron: 'SDL_CUB', firma: '[]', valor: 0.0980665, expr: '  q_cub ' },
        { id: 'j1', patron: 'X', firma: '[]', valor: 1, expr: 'x' },
        { id: 'j2', patron: 'Y', firma: '[]', valor: 1, expr: '   ' },
        { id: 'j3', patron: 'Z', firma: '[]', valor: 'uno', expr: 'z' },
      ],
    },
    ok: (o) => {
      const l = o.justificaciones ?? [];
      if (l.length !== 1 || l[0].expr !== 'q_cub') return `quedaron: ${JSON.stringify(l)}`;
      const vuelta = sanearObra(archivoDeObra(o).obra);
      if (JSON.stringify(vuelta) !== JSON.stringify(o)) return 'cambió en la ida y vuelta';
      return 'justificaciones' in sanearObra({ id: 'o', calculos: [] }) ? 'apareció `justificaciones` sin haber' : null;
    },
  },
  {
    nombre: 'las cargas de una obra anterior se migran a cálculos y grupos sin perder un número',
    // Una carga de UNA partida se dibujaba plegada con el nombre de la carga: el
    // cálculo toma ese nombre. Una de varias agrupaba: si no tenía grupo, se le
    // crea uno con su nombre; si lo tenía, sus cálculos lo heredan. Lo que era
    // solo de la partida —la variable, la aplicación en SAP— y el patrón de la
    // carga se descartan.
    crudo: {
      id: 'o',
      modulos: ['cargas', 'sap'],
      grupos: [{ id: 'gv', nombre: 'Viento', color: '#2563eb' }],
      calculos: [{ id: 'k1', nombre: 'Geometría', hoja: [{ id: 'b1', kind: 'math', x: 40, y: 40, src: 'A_g := 10 m^2' }] }],
      cargas: [
        {
          id: 'c1',
          nombre: 'SDL',
          patron: { tipo: 'SuperDead', pesoPropio: 0 },
          subcargas: [
            {
              id: 's1',
              nombre: 'Revestimiento',
              variable: 'q_1',
              aplicacion: { tipo: 'area-a-barras', grupo: 'CUB', direccion: 10, distribucion: 1 },
              hoja: [{ id: 'b2', kind: 'math', x: 40, y: 40, src: 'q_1 := 1 kN/m^2 * A_g / (1 m^2)' }],
            },
          ],
        },
        {
          id: 'c2',
          nombre: 'D',
          subcargas: [
            { id: 's2', nombre: 'Losa', variable: 'q_2', hoja: [{ id: 'b3', kind: 'math', x: 40, y: 40, src: 'q_2 := 2 kN/m^2' }] },
            { id: 's3', nombre: 'Total', variable: 'q_3', hoja: [{ id: 'b4', kind: 'math', x: 40, y: 40, src: 'q_3 := q_2 + q_1' }] },
          ],
        },
        {
          id: 'c3',
          nombre: 'W',
          grupo: 'gv',
          subcargas: [
            { id: 's4', nombre: 'Barlovento', hoja: [{ id: 'b5', kind: 'math', x: 40, y: 40, src: 'w_1 := 0.5 kN/m^2' }] },
            { id: 's5', nombre: 'Sotavento', hoja: [{ id: 'b6', kind: 'math', x: 40, y: 40, src: 'w_2 := -0.3 kN/m^2' }] },
          ],
        },
        { id: 'c4', nombre: 'Vacía', subcargas: [] },
      ],
    },
    ok: (o, crudo) => {
      if ('cargas' in o) return 'la obra saneada sigue trayendo `cargas`';
      if (o.modulos.join(',') !== 'sap') return `módulos: ${o.modulos.join(',')}`;
      const nombres = o.calculos.map((k) => `${k.id}:${k.nombre}`).join(',');
      // En el orden de antes: primero los cálculos, después las partidas.
      if (nombres !== 'k1:Geometría,s1:SDL,s2:Losa,s3:Total,s4:Barlovento,s5:Sotavento') return `cálculos: ${nombres}`;
      const grupoDe = (id) => o.calculos.find((k) => k.id === id)?.grupo;
      const nuevo = o.grupos.find((g) => g.nombre === 'D');
      if (!nuevo) return `no se creó el grupo de la carga D: ${JSON.stringify(o.grupos)}`;
      if (grupoDe('s2') !== nuevo.id || grupoDe('s3') !== nuevo.id) return 'las partidas de D no quedaron en su grupo';
      if (grupoDe('s1') !== undefined) return 'una carga de una partida ganó un grupo';
      if (grupoDe('s4') !== 'gv' || grupoDe('s5') !== 'gv') return 'W perdió su grupo';
      if (o.grupos.length !== 2) return `grupos: ${o.grupos.map((g) => g.nombre).join(',')}`;
      const s1 = o.calculos.find((k) => k.id === 's1');
      if ('variable' in s1 || 'aplicacion' in s1) return `s1 conservó lo que era de la partida: ${JSON.stringify(s1)}`;
      // Releer lo migrado da lo mismo: el grupo nuevo no se vuelve a crear.
      const otra = sanearObra(archivoDeObra(o).obra);
      if (JSON.stringify(otra) !== JSON.stringify(o)) return 'releer la obra migrada la cambió';
      // Y releer SIN haber guardado da el mismo grupo, no uno nuevo cada vez.
      if (sanearObra(crudo).grupos.find((g) => g.nombre === 'D')?.id !== nuevo.id) {
        return 'el id del grupo nuevo cambia en cada lectura';
      }
      // Los números: el mismo scope que daban las partidas.
      const ev = evaluarObra(o, {});
      if (en(ev.scope, 'q_3', 'kN/m^2') !== 12) return `q_3 = ${valor(ev, 'q_3')}, se esperaban 12 kN/m²`;
      return ev.enCiclo.size ? 'la migración inventó un ciclo' : null;
    },
  },
  {
    nombre: 'una obra sin grupos no gana un `grupos: []` al sanearse',
    // Guardar una obra no puede cambiarla si nadie la tocó.
    crudo: { id: 'o', calculos: [] },
    ok: (o) => ('grupos' in o ? 'apareció `grupos`' : null),
  },
];

// ── La obra en disco: una carpeta ────────────────────────────────────────────
//
// `partirObra` reparte una obra en `obra.json` más una hoja por nodo, y
// `unirObra` la vuelve a armar. El caso de regresión es la obra autocontenida
// del Pachón, que es un proyecto real de punta a punta: si sobrevive a la ida y
// vuelta sin cambiar un byte ni un resultado, la carpeta no pierde nada.

const PACHON_CRUDO = await readFile(path.join(ROOT, 'docs/pachon/autocontenida/obra-pachon-soldadura.json'), 'utf8');
const PACHON = sanearObra(JSON.parse(PACHON_CRUDO).obra);
const AUDITORIA_CRUDO = await readFile(path.join(ROOT, 'docs/pachon/auditoria/obra-pachon-taller-soldadura.json'), 'utf8');
const CARRILERA = await generica('acero/viga-carrilera-generica.json');
const genericasPachon = { [CARRILERA.id]: { fase: 'lista', modulo: CARRILERA } };

/** Lo que se lee de la carpeta, saneado como lo hace la aplicación. */
const releer = (archivos) => sanearObra(unirObra(archivos).crudo);

const CASOS_CARPETA = [
  {
    nombre: 'la auditoría del Pachón, escrita con cargas, abre con un cálculo por cada nodo que tenía',
    // Es la obra real que sigue escrita en el formato anterior: sus 20 partidas
    // pasan a ser cálculos. Que los resultados no cambian se comprobó contra
    // `master` región por región al retirar las cargas; aquí queda lo que se
    // puede comprobar sin el modelo anterior: nadie se pierde, nadie se duplica,
    // y nada nuevo sale en rojo.
    ok: () => {
      const crudo = JSON.parse(AUDITORIA_CRUDO);
      const o = crudo.obra ?? crudo;
      const antes = o.calculos.length + o.cargas.reduce((s, c) => s + c.subcargas.length, 0);
      const auditoria = sanearObra(o);
      if (auditoria.calculos.length !== antes) return `${auditoria.calculos.length} cálculos para ${antes} nodos`;
      const ev = evaluarObra(auditoria, genericasPachon);
      const rojos = Object.values(ev.results).filter((r) => r.error).length;
      if (rojos || ev.enCiclo.size || ev.repetidos.size) return `${rojos} errores, ${ev.enCiclo.size} en ciclo, ${ev.repetidos.size} repetidos`;
      return null;
    },
  },
  {
    nombre: 'la obra del Pachón sale de su carpeta igual que entró',
    ok: () => {
      const vuelta = releer(partirObra(PACHON));
      return JSON.stringify(vuelta) === JSON.stringify(PACHON) ? null : 'la obra releída no coincide con la escrita';
    },
  },
  {
    nombre: 'y calcula lo mismo: ningún resultado cambia por pasar por el disco',
    ok: () => {
      // Sin evaluación de calentamiento: el motor restaura el sistema de unidades
      // de math.js al empezar cada hoja, así que la primera evaluación y la
      // segunda muestran lo mismo (`pf_min` salía «1000 Pa» y después «1 kPa»).
      const antes = evaluarObra(PACHON, genericasPachon);
      const despues = evaluarObra(releer(partirObra(PACHON)), genericasPachon);
      const a = JSON.stringify(antes.results);
      if (!Object.keys(antes.results).length) return 'la obra no evaluó nada: el caso no prueba nada';
      return a === JSON.stringify(despues.results) ? null : 'los resultados cambiaron tras la ida y vuelta';
    },
  },
  {
    nombre: 'una hoja por nodo, además de obra.json, y ninguna hoja dentro de obra.json',
    ok: () => {
      const archivos = partirObra(PACHON);
      const nodos = PACHON.calculos.length;
      const hojas = Object.keys(archivos).filter((r) => r.startsWith('hojas/'));
      if (!('obra.json' in archivos)) return 'falta obra.json';
      if (hojas.length !== nodos) return `${hojas.length} hojas para ${nodos} nodos`;
      const grafo = JSON.parse(archivos['obra.json']).obra;
      if ('cargas' in grafo) return 'obra.json sigue escribiendo `cargas`';
      const conRegiones = grafo.calculos.filter((k) => typeof k.hoja !== 'string');
      return conRegiones.length ? `obra.json lleva regiones en ${conRegiones.map((k) => k.id).join(', ')}` : null;
    },
  },
  {
    nombre: 'la carpeta es determinista, con LF y salto final: git no ve cambios donde no los hay',
    ok: () => {
      const uno = partirObra(PACHON);
      const dos = partirObra(releer(uno));
      for (const [ruta, texto] of Object.entries(uno)) {
        if (dos[ruta] !== texto) return `${ruta} cambió al reescribirla sin tocarla`;
        if (texto.includes('\r')) return `${ruta} lleva CR`;
        if (!texto.endsWith('\n')) return `${ruta} no termina en salto de línea`;
      }
      return Object.keys(dos).length === Object.keys(uno).length ? null : 'cambió el número de archivos';
    },
  },
  {
    nombre: 'una hoja de nodo es una hoja del canvas: {version, meta, regions}',
    ok: () => {
      const o = sanearObra({
        id: 'o',
        calculos: [
          {
            id: 'k1',
            nombre: 'A',
            meta: { titulo: 'Hoja A' },
            hoja: [{ id: 'b1', kind: 'math', x: 40, y: 40, src: 'a := 1' }],
          },
        ],
        });
      const [ruta] = Object.keys(partirObra(o)).filter((r) => r.startsWith('hojas/'));
      const hoja = JSON.parse(partirObra(o)[ruta]);
      if (hoja.version !== 1) return `version ${hoja.version}`;
      if (hoja.meta?.titulo !== 'Hoja A') return 'el meta no viajó con la hoja';
      return hoja.regions?.[0]?.src === 'a := 1' ? null : 'las regiones no están en `regions`';
    },
  },
  {
    nombre: 'un id de nodo que no es nombre de archivo no escapa de hojas/ ni choca con otro',
    ok: () => {
      const o = sanearObra({
        id: 'o',
        calculos: [
          { id: '../fuera', nombre: 'A', hoja: [{ id: 'b1', kind: 'math', x: 40, y: 40, src: 'a := 1' }] },
          { id: '__fuera', nombre: 'B', hoja: [{ id: 'b2', kind: 'math', x: 40, y: 40, src: 'b := 2' }] },
          { id: 'CON', nombre: 'C', hoja: [] },
        ],
        });
      const archivos = partirObra(o);
      const hojas = Object.keys(archivos).filter((r) => r !== 'obra.json');
      const malas = hojas.filter((r) => !/^hojas\/[a-z0-9-]+\.json$/.test(r));
      if (malas.length) return `rutas inseguras: ${malas.join(', ')}`;
      if (new Set(hojas).size !== 3) return `chocaron: ${hojas.join(', ')}`;
      return JSON.stringify(releer(archivos)) === JSON.stringify(o) ? null : 'la vuelta no coincide';
    },
  },
  {
    nombre: 'una hoja que falta en la carpeta se dice, y la obra abre igual',
    ok: () => {
      const archivos = partirObra(PACHON);
      const ruta = JSON.parse(archivos['obra.json']).obra.calculos[0].hoja;
      delete archivos[ruta];
      const { crudo, problemas } = unirObra(archivos);
      const o = sanearObra(crudo);
      if (!o) return 'la obra no abrió';
      if (o.calculos[0].hoja.length) return 'el nodo inventó regiones';
      if (o.calculos.length !== PACHON.calculos.length) return 'se perdió el nodo, no solo su hoja';
      return problemas.some((p) => p.includes(ruta)) ? null : `no se dijo nada: ${JSON.stringify(problemas)}`;
    },
  },
  {
    nombre: 'la marca «Revisar» sobrevive a la carpeta, y va en obra.json, no en la hoja',
    ok: () => {
      const otro = PACHON.calculos[1];
      let o = marcarRevision(PACHON, PACHON.calculos[0].id, { nota: 'Supuesto: Kzt = 1', por: 'usuario' });
      o = marcarRevision(o, otro.id, { nota: 'Creada por el asistente', por: 'asistente' });
      const archivos = partirObra(o);
      if (!archivos['obra.json'].includes('Supuesto: Kzt = 1')) return 'la marca no quedó en obra.json';
      const vuelta = releer(archivos);
      return JSON.stringify(vuelta) === JSON.stringify(o) ? null : 'la marca cambió en la ida y vuelta';
    },
  },
  {
    nombre: 'marcar no cambia ningún resultado, y la tarjeta y el contador la ven',
    ok: () => {
      const calculo = PACHON.calculos[0];
      const otro = PACHON.calculos[1];
      let o = marcarRevision(PACHON, calculo.id, { nota: 'Revisar la altura', por: 'usuario' });
      o = marcarRevision(o, otro.id, { nota: '', por: 'asistente' });
      const antes = evaluarObra(PACHON, genericasPachon);
      const ev = evaluarObra(o, genericasPachon);
      if (JSON.stringify(ev.results) !== JSON.stringify(antes.results)) return 'la marca cambió resultados';
      const proy = proyectar(o, ev, genericasPachon);
      const nk = proy.nodos.find((x) => x.id === K(calculo.id));
      if (nk?.revisar?.nota !== 'Revisar la altura') return `el cálculo no lleva la marca: ${JSON.stringify(nk?.revisar)}`;
      if (nk.severidad !== proyectar(PACHON, antes, genericasPachon).nodos.find((x) => x.id === K(calculo.id)).severidad)
        return 'la marca tocó la severidad';
      const no = proy.nodos.find((x) => x.id === K(otro.id));
      if (no?.revisar?.por !== 'asistente') return 'el segundo cálculo no lleva la marca del asistente';
      const lista = porRevisar(o);
      if (lista.join(',') !== [K(calculo.id), K(otro.id)].join(',')) return `porRevisar: ${lista.join(', ')}`;
      // «Revisado» la quita sin dejar un `revisar: undefined` que ensucie el diff.
      const limpia = marcarRevision(marcarRevision(o, calculo.id, undefined), otro.id, undefined);
      if (porRevisar(limpia).length) return 'quedaron marcas tras quitarlas';
      return partirObra(limpia)['obra.json'] === partirObra(PACHON)['obra.json']
        ? null
        : 'quitar las marcas no dejó obra.json como estaba';
    },
  },
  {
    nombre: 'sin obra.json no hay obra, y se dice por qué',
    ok: () => {
      const { crudo, problemas } = unirObra({ 'hojas/k.json': '{}' });
      if (crudo !== null) return 'devolvió una obra';
      return problemas.length ? null : 'no dio motivo';
    },
  },
];

// ── El servidor de obras, sobre un directorio temporal ───────────────────────
//
// Se prueban las operaciones de `servidor/obras.mjs` sin HTTP: el manejador es
// una capa fina encima, y lo que cuesta caro romper está aquí —el candado de un
// solo escritor y el 409 ante una carpeta que cambió—.

const TMP = await mkdtemp(path.join(os.tmpdir(), 'structflow-obras-'));
let reloj = 1_000_000;
/** Cada caso con su raíz y su reloj, para que no se hereden candados. */
const servidor = (nombre) => crearObras(path.join(TMP, nombre), { ahora: () => reloj });
const TOKEN_A = 'pestana-a-0001';
const TOKEN_B = 'pestana-b-0002';
const ARCHIVOS = partirObra(PACHON);

/** El código y el conflicto de un 409, o el motivo de que no lo fuera. */
async function espera409(promesa, conflicto) {
  try {
    await promesa;
    return 'no falló';
  } catch (e) {
    if (e.codigo !== 409) return `falló con ${e.codigo ?? e.message}`;
    return e.datos?.conflicto === conflicto ? null : `conflicto «${e.datos?.conflicto}», se esperaba «${conflicto}»`;
  }
}

const CASOS_SERVIDOR = [
  {
    nombre: 'propuestas: se guardan sobre la versión de la que parten, se listan, se archivan con el candado y no cuentan como obra',
    ok: async () => {
      const s = servidor('propuestas');
      const { version } = await s.escribir('pachon', { token: TOKEN_A, base: null, archivos: ARCHIVOS });
      const vieja = await espera409(s.proponer('pachon', { titulo: 'x', base: 'otra-version', archivos: ARCHIVOS }), 'version');
      if (vieja) return `propuesta sobre otra versión: ${vieja}`;
      const { n } = await s.proponer('pachon', { autor: 'asistente', titulo: 'Llave 160×80', nota: 'por el aplastamiento', base: version, archivos: ARCHIVOS });
      if ((await s.contarPropuestas('pachon')) !== 1) return 'no se cuenta';
      const [p] = await s.propuestas('pachon');
      if (p?.n !== n || p.titulo !== 'Llave 160×80' || p.base !== version || p.archivos['obra.json'] !== ARCHIVOS['obra.json']) return `leída: ${JSON.stringify(p).slice(0, 200)}`;
      if ((await s.leer('pachon')).version !== version) return 'proponer cambió la versión de la obra';
      if ((await s.listar()).length !== 1) return 'la carpeta de propuestas se lista como obra';
      const sinCandado = await espera409(s.resolverPropuesta('pachon', n, { token: TOKEN_B, resolucion: 'rechazada' }), 'escritor');
      if (sinCandado) return `resolver sin candado: ${sinCandado}`;
      s.escritor('pachon', TOKEN_A);
      await s.resolverPropuesta('pachon', n, { token: TOKEN_A, resolucion: 'aceptada' });
      if ((await s.contarPropuestas('pachon')) !== 0) return 'quedó pendiente';
      const archivada = JSON.parse(await readFile(path.join(TMP, 'propuestas', '_propuestas', 'pachon', 'resueltas', `${n}.json`), 'utf8'));
      return archivada.resolucion === 'aceptada' ? null : `archivada: ${archivada.resolucion}`;
    },
  },
  {
    nombre: 'respaldar copia la carpeta entera a _respaldos, solo con el candado, y no aparece en la lista',
    ok: async () => {
      const s = servidor('respaldo');
      await s.escribir('pachon', { token: TOKEN_A, base: null, archivos: ARCHIVOS });
      const sin = await espera409(s.respaldar('pachon', { token: TOKEN_A, motivo: 'x' }), 'escritor');
      if (sin) return `sin candado: ${sin}`;
      s.escritor('pachon', TOKEN_A);
      const { respaldo } = await s.respaldar('pachon', { token: TOKEN_A, motivo: 'antes de la llave 160×80' });
      if (!/^_respaldos\/pachon-antes-de-la-llave-160-80-/.test(respaldo)) return `nombre: ${respaldo}`;
      const copia = await readFile(path.join(TMP, 'respaldo', ...respaldo.split('/'), 'obra.json'), 'utf8');
      if (copia !== ARCHIVOS['obra.json']) return 'la copia no es la obra';
      return (await s.listar()).length === 1 ? null : 'el respaldo se lista como obra';
    },
  },
  {
    nombre: 'crear, listar y leer devuelve los mismos archivos y la misma versión',
    ok: async () => {
      const s = servidor('crear');
      const { version } = await s.escribir('pachon', { token: TOKEN_A, base: null, archivos: ARCHIVOS });
      const leida = await s.leer('pachon');
      if (leida.version !== version) return 'la versión leída no es la escrita';
      const ordenados = (a) => JSON.stringify(Object.entries(a).sort(([x], [y]) => x.localeCompare(y)));
      if (ordenados(leida.archivos) !== ordenados(ARCHIVOS)) return 'los archivos cambiaron al pasar por el disco';
      const lista = await s.listar();
      return lista.length === 1 && lista[0].nombre === PACHON.nombre ? null : `lista: ${JSON.stringify(lista)}`;
    },
  },
  {
    nombre: 'crear una obra que ya existe es un 409, no un reemplazo',
    ok: async () => {
      const s = servidor('crear-dos');
      await s.escribir('pachon', { token: TOKEN_A, base: null, archivos: ARCHIVOS });
      return espera409(s.escribir('pachon', { token: TOKEN_B, base: null, archivos: ARCHIVOS }), 'existe');
    },
  },
  {
    nombre: 'crear no toma el candado: la pestaña que abre la obra nueva es la escritora',
    // El índice crea con su propio token y navega; la pestaña de la obra pide
    // el candado con otro. Si crear lo tomara, la obra nueva abriría en solo
    // lectura, que es lo que pasó en la primera prueba en el navegador.
    ok: async () => {
      const s = servidor('crear-abrir');
      await s.escribir('pachon', { token: TOKEN_A, base: null, archivos: ARCHIVOS });
      try {
        s.escritor('pachon', TOKEN_B);
        return null;
      } catch (e) {
        return `la pestaña que abre recibió ${e.codigo}: ${e.message}`;
      }
    },
  },
  {
    nombre: 'la última escritura de una página que ya soltó el candado no lo vuelve a tomar',
    // Un F5 con cambios pendientes: el beacon suelta, el PUT llega después.
    ok: async () => {
      const s = servidor('f5');
      const { version } = await s.escribir('pachon', { token: TOKEN_A, base: null, archivos: ARCHIVOS });
      s.escritor('pachon', TOKEN_A);
      s.soltar('pachon', TOKEN_A);
      await s.escribir('pachon', { token: TOKEN_A, base: version, archivos: ARCHIVOS });
      try {
        s.escritor('pachon', TOKEN_B);
        return null;
      } catch (e) {
        return `la página recargada recibió ${e.codigo}: ${e.message}`;
      }
    },
  },
  {
    nombre: 'una segunda pestaña no es escritora mientras la primera late',
    ok: async () => {
      const s = servidor('escritor');
      await s.escribir('pachon', { token: TOKEN_A, base: null, archivos: ARCHIVOS });
      s.escritor('pachon', TOKEN_A);
      const r = await espera409(Promise.resolve().then(() => s.escritor('pachon', TOKEN_B)), 'escritor');
      if (r) return `pedir el candado: ${r}`;
      const { version } = await s.leer('pachon');
      return espera409(s.escribir('pachon', { token: TOKEN_B, base: version, archivos: ARCHIVOS }), 'escritor');
    },
  },
  {
    nombre: 'el candado caduca sin latido, y tomar el control deja fuera a la anterior',
    ok: async () => {
      const s = servidor('caduca');
      await s.escribir('pachon', { token: TOKEN_A, base: null, archivos: ARCHIVOS });
      s.escritor('pachon', TOKEN_A);
      reloj += CADUCIDAD_MS + 1;
      s.escritor('pachon', TOKEN_B); // ya no hay nadie: se concede
      const { version } = await s.leer('pachon');
      const r = await espera409(s.escribir('pachon', { token: TOKEN_A, base: version, archivos: ARCHIVOS }), 'escritor');
      if (r) return `la que caducó siguió escribiendo: ${r}`;
      s.escritor('pachon', TOKEN_A, { forzar: true });
      return espera409(s.escribir('pachon', { token: TOKEN_B, base: version, archivos: ARCHIVOS }), 'escritor');
    },
  },
  {
    nombre: 'una hoja editada a mano en el disco no se pisa: 409 por versión',
    ok: async () => {
      const s = servidor('version');
      const { version } = await s.escribir('pachon', { token: TOKEN_A, base: null, archivos: ARCHIVOS });
      const hoja = Object.keys(ARCHIVOS).find((r) => r.startsWith('hojas/'));
      await writeFile(path.join(s.raiz, 'pachon', ...hoja.split('/')), '{"version":1,"regions":[]}\n');
      return espera409(s.escribir('pachon', { token: TOKEN_A, base: version, archivos: ARCHIVOS }), 'version');
    },
  },
  {
    nombre: 'escribir borra la hoja de un nodo que ya no está, y solo esa',
    ok: async () => {
      const s = servidor('huerfanas');
      const { version } = await s.escribir('pachon', { token: TOKEN_A, base: null, archivos: ARCHIVOS });
      const sinUno = { ...PACHON, calculos: PACHON.calculos.slice(1) };
      await s.escribir('pachon', { token: TOKEN_A, base: version, archivos: partirObra(sinUno) });
      const hojas = (await readdir(path.join(s.raiz, 'pachon', 'hojas'))).length;
      const esperadas = Object.keys(ARCHIVOS).length - 2;
      return hojas === esperadas ? null : `${hojas} hojas en disco, se esperaban ${esperadas}`;
    },
  },
  {
    nombre: 'ni el id ni una ruta pueden salir de la raíz',
    ok: async () => {
      const s = servidor('rutas');
      for (const id of ['../fuera', 'a/b', '..', 'Mayus', '']) {
        try {
          await s.leer(id);
          return `leyó «${id}»`;
        } catch (e) {
          if (e.codigo !== 400) return `«${id}» dio ${e.codigo ?? e.message}, no 400`;
        }
      }
      for (const ruta of ['../x.json', 'hojas/../../x.json', 'otra.json', 'hojas/a/b.json']) {
        try {
          await s.escribir('o', { token: TOKEN_A, base: null, archivos: { ...ARCHIVOS, [ruta]: '{}' } });
          return `escribió «${ruta}»`;
        } catch (e) {
          if (e.codigo !== 400) return `«${ruta}» dio ${e.codigo ?? e.message}, no 400`;
        }
      }
      return null;
    },
  },
  {
    nombre: 'borrar mueve la obra a la papelera, y no con otra pestaña editándola',
    ok: async () => {
      const s = servidor('borrar');
      await s.escribir('pachon', { token: TOKEN_A, base: null, archivos: ARCHIVOS });
      s.escritor('pachon', TOKEN_A);
      const r = await espera409(s.borrar('pachon', { token: TOKEN_B }), 'escritor');
      if (r) return `borró con la obra abierta: ${r}`;
      await s.borrar('pachon', { token: TOKEN_A });
      if ((await s.listar()).length) return 'sigue listada';
      const papelera = await readdir(path.join(s.raiz, '.papelera'));
      return papelera.length === 1 ? null : `papelera: ${papelera.join(', ')}`;
    },
  },
  {
    nombre: 'borrar reintenta si Windows rechaza el renombre un momento (EPERM)',
    // Con `npm run dev`, el vigilante de Vite tenía abierta la carpeta de cada
    // obra y el renombre a la papelera daba EPERM. Ahora Vite no vigila las
    // obras, pero lo mismo hacen el Explorador, un antivirus o un editor.
    ok: async () => {
      let fallos = 2;
      const renombrar = async (a, b) => {
        if (fallos-- > 0) throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' });
        await rename(a, b);
      };
      const s = crearObras(path.join(TMP, 'borrar-eperm-breve'), { ahora: () => reloj, renombrar, pausaMs: 1 });
      await s.escribir('pachon', { token: TOKEN_A, base: null, archivos: ARCHIVOS });
      await s.borrar('pachon', { token: TOKEN_A });
      if (fallos !== -1) return `el renombre se intentó ${2 - fallos} veces, se esperaban 3`;
      if ((await s.listar()).length) return 'sigue listada';
      const papelera = await readdir(path.join(s.raiz, '.papelera'));
      return papelera.length === 1 ? null : `papelera: ${papelera.join(', ')}`;
    },
  },
  {
    nombre: 'si el renombre no se libera, borrar copia a la papelera, comprueba y recién ahí quita la obra',
    ok: async () => {
      let intentos = 0;
      const renombrar = async () => {
        intentos += 1;
        throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' });
      };
      const s = crearObras(path.join(TMP, 'borrar-eperm-siempre'), { ahora: () => reloj, renombrar, pausaMs: 1 });
      await s.escribir('pachon', { token: TOKEN_A, base: null, archivos: ARCHIVOS });
      await s.borrar('pachon', { token: TOKEN_A });
      if (intentos === 0) return 'no usó el renombre inyectado';
      if ((await s.listar()).length) return 'sigue listada';
      const [enPapelera, ...otras] = await readdir(path.join(s.raiz, '.papelera'));
      if (!enPapelera || otras.length) return 'la papelera no tiene exactamente una obra';
      const copia = path.join(s.raiz, '.papelera', enPapelera);
      for (const [ruta, texto] of Object.entries(ARCHIVOS)) {
        const leido = await readFile(path.join(copia, ...ruta.split('/')), 'utf8').catch(() => null);
        if (leido !== texto) return `en la papelera, ${ruta} no es el original`;
      }
      return null;
    },
  },
];

// ── Una obra a partir de otra ────────────────────────────────────────────────
//
// `obraDesde` arma una obra nueva con parte de otra; `traerNodos` copia nodos a
// una obra que ya tiene los suyos. Lo que se comprueba es que lo copiado calcule
// lo mismo que el original, que no se lleve la lectura de SAP y que en el destino
// no choque ningún id: los de región son las claves de `results`.

/** Una obra de origen con geometría común, una carga que la usa, una planilla
 *  que lee la carga por un campo atado, grupos, marca, SAP y justificaciones. */
function origenCopia() {
  return sanearObra({
    version: 2,
    id: 'origen',
    nombre: 'Origen',
    creada: '2026-01-01T00:00:00.000Z',
    modulos: ['sap'],
    unidadesSap: 'tonf',
    grupos: [
      { id: 'g-geo', nombre: 'Geometría', color: '#2563eb' },
      { id: 'g-viento', nombre: 'Viento', color: '#059669' },
    ],
    calculos: [
      { id: 'kgeo', nombre: 'Geometría', grupo: 'g-geo', hoja: [
        { id: 'bgeo1', kind: 'math', x: 40, y: 40, src: 'A_planta := 4 m * 3 m' },
      ] },
      { id: 'kvto', nombre: 'Viento', grupo: 'g-viento', revisar: { nota: 'confirmar Cp', por: 'usuario' }, hoja: [
        { id: 'bvto1', kind: 'math', x: 40, y: 40, src: 'q_v := 50 kgf/m^2' },
        { id: 'bvto2', kind: 'math', x: 40, y: 88, src: 'V_v := q_v * A_planta = tonf' },
      ] },
      { id: 'kzap', nombre: 'Zapata', hoja: [], frontera: importada(ZAPATA, { formulas: { Vu_X: 'V_v' } }) },
      { id: 'kotro', nombre: 'Suelto', hoja: [
        { id: 'botro1', kind: 'math', x: 40, y: 40, src: 'z := 3' },
      ] },
    ],
    sap: { modelo: 'x.sdb', ruta: 'C:/x.sdb', version: '24', leido: '2026-01-01' },
    justificaciones: [{ id: 'j1', patron: 'W', firma: 'f', valor: 1, expr: 'q_v' }],
  });
}

/** El destino de un «traer»: ya tiene un grupo «Viento» y ids que chocan. */
function destinoCopia() {
  return sanearObra({
    version: 2,
    id: 'destino',
    nombre: 'Destino',
    creada: '2026-01-02T00:00:00.000Z',
    modulos: [],
    grupos: [{ id: 'g-otro', nombre: 'Viento', color: '#dc2626' }],
    calculos: [
      { id: 'kgeo', nombre: 'Mía', hoja: [{ id: 'bvto1', kind: 'math', x: 40, y: 40, src: 'A_planta := 5 m * 5 m' }] },
    ],
  });
}

const ids = (o) => o.calculos.flatMap((k) => [k.id, ...k.hoja.map((b) => b.id)]);
const repetidosEn = (lista) => [...new Set(lista.filter((x, i) => lista.indexOf(x) !== i))];

const CASOS_COPIA = [
  {
    nombre: 'obraDesde copia hojas, fronteras, grupos y marcas, y no la lectura de SAP',
    ok: () => {
      const o = origenCopia();
      const c = obraDesde(o, 'Galpón 2', ['galpon-2']);
      if (c.id !== 'galpon-2-2') return `id «${c.id}», se esperaba uno libre: galpon-2-2`;
      if (c.nombre !== 'Galpón 2') return `nombre «${c.nombre}»`;
      if (c.sap) return 'se llevó la lectura de SAP';
      if (c.justificaciones) return 'se llevó las justificaciones';
      if (!c.modulos.includes('sap')) return 'perdió el nodo SAP2000';
      if (c.unidadesSap !== 'tonf') return 'perdió las unidades del modelo';
      if (c.calculos.length !== 4) return `${c.calculos.length} cálculos, se esperaban 4`;
      if (JSON.stringify(c.calculos) !== JSON.stringify(o.calculos)) return 'los cálculos no son idénticos';
      if (JSON.stringify(c.grupos) !== JSON.stringify(o.grupos)) return 'los grupos no son idénticos';
      if (c.creada === o.creada) return 'conservó la fecha de creación del origen';
      return null;
    },
  },
  {
    nombre: 'la copia calcula lo mismo que el origen',
    ok: () => {
      const o = origenCopia();
      const c = obraDesde(o, 'Copia', []);
      const a = evaluarObra(o, genericas);
      const b = evaluarObra(c, genericas);
      for (const nom of ['A_planta', 'V_v', 'z']) {
        if (String(a.scope[nom]) !== String(b.scope[nom])) return `«${nom}»: ${a.scope[nom]} ≠ ${b.scope[nom]}`;
      }
      const za = a.importadas.get(K('kzap'))?.salidas?.u_max;
      const zb = b.importadas.get(K('kzap'))?.salidas?.u_max;
      if (za === undefined || String(za) !== String(zb)) return `u_max de la zapata: ${za} ≠ ${zb}`;
      return null;
    },
  },
  {
    nombre: 'obraDesde con una selección deja fuera el resto y los grupos vacíos',
    ok: () => {
      const c = obraDesde(origenCopia(), 'Solo geometría', [], new Set(['kgeo', 'kotro']));
      const k = c.calculos.map((x) => x.id).join(',');
      if (k !== 'kgeo,kotro') return `cálculos ${k}`;
      const g = (c.grupos ?? []).map((x) => x.id).join(',');
      return g === 'g-geo' ? null : `grupos «${g}», se esperaba solo g-geo`;
    },
  },
  {
    nombre: 'dependenciasDe arrastra lo que la selección usa, por hoja y por campo atado',
    ok: () => {
      const d = dependenciasDe(origenCopia(), ['kzap']);
      const faltan = [...d.keys()].sort().join(',');
      if (faltan !== 'kgeo,kvto') return `dependencias «${faltan}», se esperaban kgeo,kvto`;
      if (!d.get('kvto')?.includes('kzap')) return 'kvto no dice que lo usa kzap';
      if (!d.get('kgeo')?.includes('kvto')) return 'kgeo no dice que lo usa kvto';
      if (dependenciasDe(origenCopia(), ['kotro']).size) return 'un nodo sin usos arrastró algo';
      return null;
    },
  },
  {
    nombre: 'dependenciasDe no arrastra lo que el destino ya define',
    // Traer la zapata a una obra que ya tiene su `A_planta` necesita la carga,
    // pero no otra geometría: sería definir cada nombre dos veces.
    ok: () => {
      const cubiertos = nombresDefinidos(destinoCopia());
      const faltan = [...dependenciasDe(origenCopia(), ['kzap'], cubiertos).keys()].join(',');
      return faltan === 'kvto' ? null : `dependencias «${faltan}», se esperaba solo kvto`;
    },
  },
  {
    nombre: 'choquesCon dice qué nombres quedarían definidos dos veces',
    ok: () => {
      const ch = choquesCon(destinoCopia(), origenCopia(), ['kgeo', 'kotro']).join(',');
      return ch === 'A_planta' ? null : `choques «${ch}», se esperaba A_planta`;
    },
  },
  {
    nombre: 'traerNodos no repite ids, reutiliza el grupo del mismo nombre y conserva la marca',
    ok: () => {
      const dest = destinoCopia();
      const { obra: r, mapa } = traerNodos(dest, origenCopia(), ['kvto', 'kgeo']);
      const rep = repetidosEn(ids(r));
      if (rep.length) return `ids repetidos: ${rep.join(', ')}`;
      if (r.calculos.length !== 3) return `${r.calculos.length} cálculos, se esperaban 3`;
      if (r.calculos[0] !== dest.calculos[0]) return 'tocó un nodo que ya estaba';
      // En el orden del ORIGEN, no en el de la selección: es el de creación.
      const [, geo, vto] = r.calculos;
      if (geo.nombre !== 'Geometría' || vto.nombre !== 'Viento') return 'no respetó el orden del origen';
      if (mapa.get('kgeo') === 'kgeo') return 'kgeo chocaba y conservó el id';
      if (mapa.get('kvto') !== 'kvto') return 'kvto no chocaba y se renombró';
      if (vto.grupo !== 'g-otro') return `Viento quedó en el grupo «${vto.grupo}», no en el «Viento» del destino`;
      const gGeo = r.grupos?.find((g) => g.id === geo.grupo);
      if (!gGeo || gGeo.nombre !== 'Geometría' || gGeo.color !== '#2563eb') return 'no creó el grupo Geometría';
      if (vto.revisar?.nota !== 'confirmar Cp') return 'perdió la marca «Revisar»';
      if (r.sap || r.justificaciones) return 'trajo algo de SAP';
      return null;
    },
  },
  {
    nombre: 'lo traído calcula y el choque de nombres se ve como repetido',
    ok: () => {
      const { obra: r } = traerNodos(destinoCopia(), origenCopia(), ['kvto', 'kgeo', 'kzap']);
      const ev = evaluarObra(r, genericas);
      const rep = ev.repetidos.get('A_planta');
      if (!rep || rep.length !== 2) return '«A_planta» no se declaró repetida en 2 nodos';
      const ids = new Set(r.calculos.flatMap((k) => k.hoja.map((b) => b.id)));
      if (ids.size !== r.calculos.reduce((s, k) => s + k.hoja.length, 0)) return 'bloques con el mismo id';
      return null;
    },
  },
  {
    nombre: 'trasladarPosiciones renombra los nodos y pone lo traído debajo de lo que hay',
    ok: () => {
      const origen = { 'calculo:a': { x: 10, y: 0 }, 'calculo:b': { x: 300, y: 50 }, 'calculo:c': { x: 0, y: 900 } };
      const mapa = new Map([['a', 'a2'], ['b', 'b']]);
      const p = trasladarPosiciones(origen, mapa, [{ x: 0, y: 400 }]);
      const claves = Object.keys(p).sort().join(',');
      if (claves !== 'calculo:a2,calculo:b') return `claves «${claves}»`;
      if (p['calculo:a2'].x !== 10 || p['calculo:b'].x !== 300) return 'movió las x';
      if (p['calculo:b'].y - p['calculo:a2'].y !== 50) return 'no conservó la disposición relativa';
      if (p['calculo:a2'].y <= 400) return `lo traído empieza en y=${p['calculo:a2'].y}, encima de lo que había`;
      const sinNada = trasladarPosiciones(origen, mapa, []);
      return sinNada['calculo:a2'].y === 0 ? null : 'sin nada en el destino, desplazó igual';
    },
  },
];

// ── La vista geométrica de la base de columna ────────────────────────────────
//
// El modelo es puro y determinista. Con los datos del Pachón: la silla supuesta
// no cierra (el nervio extremo cae fuera del ala extendida, de la placa y de la
// chapa superior, y la luz real entre nervios es mayor que la declarada), y las
// barras que cuentan como armadura de anclaje son 20: la 33 queda a 984 mm del
// perno más cercano, más allá de 0,5·h_ef = 975 mm. Cada verificación tiene un
// caso que la hace fallar sola, salvo `v_gol_estribo`: las barras van por dentro
// del estribo, así que una placa de apoyo que lo toca toca antes una barra.

const VISTA_BASE = VISTAS['base-columna'];
const DATOS_BASE = datosPorDefecto(VISTA_BASE.campos);
// Un aviso no vota: no es una verificación que falle.
const fallanEn = (m) => m.chequeos.filter((c) => !c.cumple && !c.aviso).map((c) => c.id).sort().join(',');
const SILLA_DEL_PACHON = 'v_chapa_nervio,v_luz_nervio,v_nervio_ala,v_nervio_placa';
/** Una silla que cierra: dos nervios por perno a la luz declarada, sobre un ala y una chapa que los cubren. */
// Con los pernos en su x_ext por defecto (480): a 400 caen sobre las barras de cara en
// ±166,5 y las ramas interiores no tienen dónde ir sin atravesarlos.
const SILLA_QUE_CIERRA = { disp_nerv: 2, luz_nerv: 150, NER_T: 16, ALA_EXT: 1150, CH_B: 1150, B_bp: 1300, a_tuerca: 90 };

const CASOS_VISTA = [
  {
    nombre: 'vista base-columna: con los datos del Pachón, la silla supuesta no cierra y cuentan 21 barras',
    ok: () => {
      const m = VISTA_BASE.construir(DATOS_BASE);
      if (JSON.stringify(m) !== JSON.stringify(VISTA_BASE.construir(DATOS_BASE))) return 'dos corridas dan modelos distintos';
      const cuenta = (rol) => m.piezas.filter((p) => p.rol === rol).length;
      if (cuenta('perno') !== 10 || cuenta('golilla') !== 10 || cuenta('barra') !== 36) return `pernos ${cuenta('perno')}, golillas ${cuenta('golilla')}, barras ${cuenta('barra')}`;
      if (new Set(m.piezas.map((p) => p.id)).size !== m.piezas.length) return 'piezas con el mismo id';
      const f = fallanEn(m);
      if (f !== SILLA_DEL_PACHON) return `fallan «${f}»`;
      const n = m.derivados.find((d) => d.nombre === 'n_cont')?.valor;
      return n === 21 ? null : `n_cont = ${n}`;
    },
  },
  {
    nombre: 'vista base-columna: con dos nervios por perno sobre un ala y una chapa que los cubren, cierra todo',
    ok: () => {
      const f = fallanEn(VISTA_BASE.construir({ ...DATOS_BASE, ...SILLA_QUE_CIERRA }));
      return f === '' ? null : `fallan «${f}»`;
    },
  },
  {
    nombre: 'vista base-columna: reparte las barras exactamente como pedestal-generico',
    ok: () => {
      // barras_xy del pedestal, del scope que captura su esquema.
      const res = evaluateSheet(hojaDe(PEDESTAL));
      const foto = res.esquema?.scope;
      const bxy = foto?.barras_xy;
      if (!bxy) return 'el pedestal no dejó barras_xy en el scope de su esquema';
      const filas = bxy.toArray ? bxy.toArray() : bxy;
      const num = (v) => (typeof v === 'number' ? v : v.toNumber('mm'));
      const n = filas.length;
      const ax = num(foto.ax_nucleo);
      const ay = num(foto.ay_nucleo);
      const nuestras = barrasPerimetro(n, ax, ay);
      for (let i = 0; i < n; i++) {
        const [x, y] = filas[i].map((v) => Number(v));
        if (Math.abs(x - nuestras[i][0]) > 0.1 || Math.abs(y - nuestras[i][1]) > 0.1)
          return `barra ${i + 1}: pedestal (${x}, ${y}), vista (${nuestras[i][0]}, ${nuestras[i][1]})`;
      }
      return null;
    },
  },
  {
    nombre: 'vista base-columna: el reparto pone una barra en cada esquina y reparte los vanos por cara',
    ok: () => {
      // COL_PPALES: 36 barras en un núcleo de 1332×1782 mm. Con el paso uniforme por el
      // perímetro (173 mm) las esquinas quedaban sin barra; con esquinas son 8 y 10 vanos.
      const b = barrasPerimetro(36, 666, 891);
      if (b.length !== 36) return `${b.length} barras`;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
        if (!b.some(([x, y]) => x === sx * 666 && y === sy * 891)) return `sin barra en la esquina (${sx * 666}, ${sy * 891})`;
      const abajo = b.filter(([, y]) => y === -891).map(([x]) => x).sort((p, q) => p - q);
      const derecha = b.filter(([x]) => x === 666).map(([, y]) => y).sort((p, q) => p - q);
      if (abajo.length !== 9 || derecha.length !== 11) return `barras por cara: ${abajo.length} abajo, ${derecha.length} a la derecha`;
      if (Math.abs(abajo[1] - abajo[0] - 166.5) > 0.1 || Math.abs(derecha[1] - derecha[0] - 178.2) > 0.1)
        return `pasos ${abajo[1] - abajo[0]} y ${derecha[1] - derecha[0]}`;
      // Con n impar la cara izquierda se lleva el vano de más, y las esquinas siguen con barra.
      const imp = barrasPerimetro(37, 711, 897);
      return imp.length === 37 && imp.some(([x, y]) => x === -711 && y === 897) ? null : 'n impar: falta la esquina (−ax, ay)';
    },
  },
  {
    nombre: 'una vista en la obra: los datos atados llegan en mm, publica lo derivado y dibuja sus flechas',
    ok: () => {
      const o = obra(
        calc('D', m('PED_Y_d := 2.5 m'), m('n_d := 36')),
        conPlanilla('V', {
          procedencia: 'vista',
          vista: 'base-columna',
          version: 1,
          entradas: DATOS_BASE,
          formulas: { PED_Y: 'PED_Y_d', n_barras: 'n_d' },
          publica: { n_cont: 'n_cont_geo', v_global: 'v_geo' },
        }),
        calc('C', m('k_c := n_cont_geo + 1')),
      );
      const ev = evaluarObra(o, genericas);
      const proy = proyectar(o, ev, genericas);
      const vista = ev.importadas.get(K('V'))?.vista;
      if (!vista) return 'la vista no se evaluó';
      if (vista.datos.PED_Y !== 2500) return `PED_Y = ${vista.datos.PED_Y}, se esperaba 2500 mm`;
      if (typeof ev.scope.n_cont_geo !== 'number') return `n_cont_geo = ${valor(ev, 'n_cont_geo')}`;
      if (ev.scope.k_c !== ev.scope.n_cont_geo + 1) return 'el consumidor no calculó con lo publicado';
      const errores = Object.entries(ev.results).filter(([id, r]) => id.startsWith('vista:') && r.error);
      if (errores.length) return `la hoja de la vista tiene ${errores.length} error(es): ${errores[0][1].error}`;
      const tarjeta = proy.nodos.find((n) => n.id === K('V'));
      if (tarjeta?.clase !== 'vista') return `clase «${tarjeta?.clase}»`;
      // Con la silla del Pachón la vista no cumple: la tarjeta sale en rojo.
      if (ev.scope.v_geo !== false || tarjeta.severidad !== 'error') return `v_geo = ${ev.scope.v_geo}, severidad ${tarjeta.severidad}`;
      return esperaArista('D', 'V')(ev, proy) ?? esperaArista('V', 'C', 'n_cont_geo')(ev, proy) ?? sinCiclo(ev);
    },
  },
  {
    nombre: 'una vista con un campo atado a algo sin longitud lo dice y conserva el dato',
    ok: () => {
      const o = obra(
        calc('D', m('n_d := 36')),
        conPlanilla('V', { procedencia: 'vista', vista: 'base-columna', version: 1, entradas: DATOS_BASE, formulas: { PED_Y: 'n_d' } }),
      );
      const ev = evaluarObra(o, genericas);
      const vista = ev.importadas.get(K('V'))?.vista;
      if (!vista) return 'la vista no se evaluó';
      if (!vista.errores.some((e) => e.campo === 'PED_Y')) return 'no avisó del campo que no resolvió';
      if (vista.datos.PED_Y !== DATOS_BASE.PED_Y) return `PED_Y = ${vista.datos.PED_Y}`;
      const tarjeta = proyectar(o, ev, genericas).nodos.find((n) => n.id === K('V'));
      return tarjeta?.motivos.some((mo) => /PED_Y/.test(mo)) ? null : `motivos: ${tarjeta?.motivos.join(' | ')}`;
    },
  },
  {
    nombre: 'una vista pasa por la carpeta sin cambiar, y una sin id se descarta al sanear',
    ok: () => {
      const fr = { procedencia: 'vista', vista: 'base-columna', version: 1, entradas: DATOS_BASE, formulas: { PED_Y: 'PED_Y_d' }, publica: { n_cont: 'n_cont_geo' } };
      const o = sanearObra(obra(calc('D', m('PED_Y_d := 2.5 m')), conPlanilla('V', fr)));
      const vuelta = sanearObra(unirObra(partirObra(o)).crudo);
      if (JSON.stringify(vuelta) !== JSON.stringify(o)) return 'la obra releída no coincide';
      const f = o.calculos.find((k) => k.id === 'V')?.frontera;
      if (f?.procedencia !== 'vista' || f.vista !== 'base-columna' || f.version !== 1) return `frontera ${JSON.stringify(f)}`;
      const sinId = sanearObra(obra(conPlanilla('V', { procedencia: 'vista', entradas: {} })));
      return sinId.calculos[0].frontera === undefined ? null : 'una vista sin id conservó su frontera';
    },
  },
  {
    nombre: 'el dibujo de la vista es determinista, marca en rojo solo lo que falla y cierra la hoja',
    ok: () => {
      const pachon = VISTA_BASE.construir(DATOS_BASE);
      const a = svgVistas(pachon);
      if (a.svg !== svgVistas(VISTA_BASE.construir(DATOS_BASE)).svg) return 'dos corridas dan SVG distintos';
      if (!a.svg.startsWith('<svg') || a.ancho !== 680 || !(a.alto > 400)) return `SVG ${a.ancho}×${a.alto}`;
      if (/NaN|undefined|Infinity/.test(a.svg)) return 'el SVG tiene un número que no es número';
      const marcas = (a.svg.match(/<circle [^>]*r="6" fill="#dc2626"/g) ?? []).length;
      if (marcas !== 4) return `${marcas} marcas de verificación, se esperaban 4`;
      const bueno = svgVistas(VISTA_BASE.construir({ ...DATOS_BASE, ...SILLA_QUE_CIERRA })).svg;
      if (bueno.includes('#dc2626')) return 'con todo cumpliendo, el dibujo tiene rojo';
      const o = obra(conPlanilla('V', { procedencia: 'vista', vista: 'base-columna', version: 1, entradas: DATOS_BASE }));
      const hoja = evaluarObra(o, genericas).importadas.get(K('V'))?.vista?.hoja ?? [];
      const ultima = hoja[hoja.length - 1];
      if (ultima?.kind !== 'image' || !ultima.src.startsWith('data:image/svg+xml')) return 'la hoja no termina en el dibujo';
      return decodeURIComponent(ultima.src.slice(ultima.src.indexOf(',') + 1)) === a.svg ? null : 'la hoja lleva otro dibujo';
    },
  },
  // Cada verificación, rota sola a partir de una base que cierra.
  ...[
    ['v_gol_gol', { b_ap: 220, y_t: 700 }],
    ['v_gol_barra', { y_t: 800 }],
    ['v_hef_ped', { h_ef: 2000 }],
    ['v_s1_barras', { recub_sup: 60 }],
    ['v_libre_cab', { sep_cab: 90 }],
    ['v_sep_barras', { n_barras: 80 }],
    ['v_ramas', { n_ramas: 14 }],
    ['v_perno_nervio', { a_tuerca: 160 }],
    ['v_luz_nervio', { disp_nerv: 1, NER_T: 16, x_ext: 480, ALA_EXT: 1500, CH_B: 1500, B_bp: 1500, luz_nerv: 150 }],
    ['v_chapa_perno', { CH_L: 300 }],
    ['v_nervio_ala', { ALA_EXT: 900 }],
    ['v_nervio_placa', { B_bp: 950 }],
    ['v_chapa_nervio', { CH_B: 950 }],
    ['v_llave_perno', { y_t: 600, amarre_cab: 0 }],
    // A 650 mm, el perno en x = 240 queda sobre una rama del rombo de cabeza.
    ['v_estribo_perno', { y_t: 650 }],
    ['v_llave_ped', { b_sl: 1380, amarre_cab: 0 }],
    ['v_llave_ramas', { n_niv_sin_ramas: 0 }],
  ].map(([id, cambio]) => ({
    nombre: `vista base-columna: «${id}» falla sola`,
    ok: () => {
      const f = fallanEn(VISTA_BASE.construir({ ...DATOS_BASE, ...SILLA_QUE_CIERRA, ...cambio }));
      return f === id ? null : `fallan «${f}»`;
    },
  })),
  {
    nombre: 'vista base-columna: el rombo de cabeza rodea la llave, cumple el ángulo de 135° y aporta ramas inclinadas',
    ok: () => {
      const m0 = VISTA_BASE.construir({ ...DATOS_BASE, ...SILLA_QUE_CIERRA, amarre_cab: 1 });
      const f = fallanEn(m0);
      if (f) return `fallan «${f}»`;
      const ids = m0.chequeos.map((c) => c.id);
      if (!ids.includes('v_rombo_angulo') || !ids.includes('v_rombo_llave')) return `verificaciones: ${ids.join(', ')}`;
      if (!m0.piezas.some((p) => p.id === 'rombo_1')) return 'no dibujó el rombo';
      const der = (m, n) => m.derivados.find((x) => x.nombre === n)?.valor;
      const rx = der(m0, 'ramas_cab_x');
      if (!(rx > 2 && rx < 6)) return `ramas_cab_x = ${rx}`;
      // Con barra en las esquinas, h_x de cabeza va de la esquina a la barra central de la cara larga.
      if (der(m0, 'hx_cab') !== 891) return `hx_cab = ${der(m0, 'hx_cab')}`;
      // Primer estribo a 50 mm: dos niveles en los 125 mm de arriba (§10.7.6.1.5), y en la
      // zona de la llave (300 mm) cuatro, los dos primeros con el rombo.
      if (der(m0, 'n_est_cab') !== 2) return `n_est_cab = ${der(m0, 'n_est_cab')}`;
      const esperado = Math.round(((2 * Math.min(rx, der(m0, 'ramas_cab_y')) + 2 * 6) / 2) * 100) / 100;
      if (Math.abs(der(m0, 'n_est_ll') - esperado) > 0.011) return `n_est_ll = ${der(m0, 'n_est_ll')}, se esperaba ${esperado}`;
      const sinRombo = VISTA_BASE.construir({ ...DATOS_BASE, ...SILLA_QUE_CIERRA, amarre_cab: 0 });
      if (der(sinRombo, 'n_est_ll') !== 8 || der(sinRombo, 'ramas_cab_x') !== 2) return `sin rombo: n_est_ll = ${der(sinRombo, 'n_est_ll')}`;
      // El nivel de cabeza no amarra todas las barras de cara: avisa, no vota.
      const cab = m0.chequeos.find((c) => c.id === 'v_amarre_150_cab');
      if (!cab?.aviso || cab.cumple) return `v_amarre_150_cab: ${JSON.stringify(cab)}`;
      const normal = m0.chequeos.find((c) => c.id === 'v_amarre_150');
      if (!normal || normal.aviso || !normal.cumple) return `v_amarre_150: ${JSON.stringify(normal)}`;
      // Sin niveles sin ramas no hay rombo.
      const m1 = VISTA_BASE.construir({ ...DATOS_BASE, ...SILLA_QUE_CIERRA, amarre_cab: 1, n_niv_sin_ramas: 0 });
      return m1.piezas.some((p) => p.id === 'rombo_1') ? 'dibujó un rombo sin nivel de cabeza' : null;
    },
  },

  // ── La configuración: componentes que pueden faltar ──
  {
    nombre: 'vista base-columna: sin configuración es la completa, y una variante desconocida cae en la de por defecto',
    ok: () => {
      const completa = configCompleta(VISTA_BASE);
      if (completa.silla !== 'nervios' || completa.llave !== 'cruz') return `completa: ${JSON.stringify(completa)}`;
      if (JSON.stringify(VISTA_BASE.construir(DATOS_BASE)) !== JSON.stringify(VISTA_BASE.construir(DATOS_BASE, completa)))
        return 'la completa no es la de sin configuración';
      const rara = configCompleta(VISTA_BASE, { silla: 'soldada', llave: 'no' });
      return rara.silla === 'nervios' && rara.llave === 'no' ? null : `con variantes raras: ${JSON.stringify(rara)}`;
    },
  },
  {
    nombre: 'vista base-columna sin silla: sin nervios ni chapas, la arandela sobre la placa, y el Pachón cierra',
    ok: () => {
      const cfg = { silla: 'no', llave: 'cruz' };
      const m = VISTA_BASE.construir(DATOS_BASE, cfg);
      const roles = new Set(m.piezas.map((p) => p.rol));
      if (roles.has('nervio') || roles.has('chapa')) return 'quedaron piezas de la silla';
      const ids = m.chequeos.map((c) => c.id);
      const deSilla = ids.filter((id) => /nervio|chapa/.test(id));
      if (deSilla.length) return `quedaron verificaciones de la silla: ${deSilla.join(', ')}`;
      if (!ids.includes('v_arandela_ala') || !ids.includes('v_arandela_placa')) return `verificaciones: ${ids.join(', ')}`;
      if (m.derivados.some((d) => d.nombre === 'luz_real' || d.nombre === 'x_nerv_real')) return 'quedaron derivados de la silla';
      // El perno termina sobre la placa, no sobre la chapa superior.
      const alto = (mm) => Math.max(...mm.piezas.filter((p) => p.rol === 'perno').map((p) => p.z1));
      if (!(alto(m) < alto(VISTA_BASE.construir(DATOS_BASE)) - 400)) return `el perno sin silla llega a ${alto(m)} mm`;
      const f = fallanEn(m);
      return f === '' ? null : `fallan «${f}»`;
    },
  },
  ...[
    ['v_arandela_ala', { d_col: 1600 }],
    ['v_arandela_placa', { B_bp: 1000 }],
  ].map(([id, cambio]) => ({
    nombre: `vista base-columna sin silla: «${id}» falla sola`,
    ok: () => {
      const f = fallanEn(VISTA_BASE.construir({ ...DATOS_BASE, ...cambio }, { silla: 'no', llave: 'cruz' }));
      return f === id ? null : `fallan «${f}»`;
    },
  })),
  {
    nombre: 'vista base-columna sin llave: sin sus piezas ni sus choques, y la zona confinada es el lado menor',
    ok: () => {
      const cfg = { silla: 'nervios', llave: 'no' };
      // Con los pernos a 600 mm la llave los toca; sin llave, nada choca. Sin rombo:
      // a 600 mm también lo atravesarían.
      const cambio = { ...SILLA_QUE_CIERRA, y_t: 600, amarre_cab: 0 };
      if (fallanEn(VISTA_BASE.construir({ ...DATOS_BASE, ...cambio })) !== 'v_llave_perno') return 'con llave, el caso no es el que se creía';
      const m = VISTA_BASE.construir({ ...DATOS_BASE, ...cambio }, cfg);
      if (m.piezas.some((p) => p.rol === 'llave')) return 'quedaron piezas de la llave';
      if (m.chequeos.some((c) => c.id.startsWith('v_llave'))) return 'quedaron verificaciones de la llave';
      if (m.derivados.some((d) => d.nombre === 'zp_llave')) return 'quedó zp_llave';
      const zp = m.derivados.find((d) => d.nombre === 'zp_ped')?.valor;
      if (zp !== Math.min(DATOS_BASE.PED_X, DATOS_BASE.PED_Y)) return `zp_ped = ${zp}`;
      const f = fallanEn(m);
      return f === '' ? null : `fallan «${f}»`;
    },
  },
  {
    nombre: 'una vista sin silla en la obra: la atadura de un dato de la silla se guarda, pero no lee ni tira flecha',
    ok: () => {
      const fr = {
        procedencia: 'vista',
        vista: 'base-columna',
        version: 1,
        config: { silla: 'no', raro: 3 },
        entradas: DATOS_BASE,
        formulas: { NER_T: 'NER_d', PED_Y: 'PED_Y_d' },
        publica: { v_global: 'v_geo' },
      };
      const o = sanearObra(obra(calc('S', m('NER_d := 20 mm')), calc('D', m('PED_Y_d := 1950 mm')), conPlanilla('V', fr)));
      const f = o.calculos.find((k) => k.id === 'V')?.frontera;
      if (JSON.stringify(f?.config) !== '{"silla":"no"}') return `config saneada: ${JSON.stringify(f?.config)}`;
      if (f?.formulas?.NER_T !== 'NER_d') return 'se perdió la atadura del dato de la silla';
      const vuelta = sanearObra(unirObra(partirObra(o)).crudo);
      if (JSON.stringify(vuelta) !== JSON.stringify(o)) return 'la obra releída no coincide';
      const ev = evaluarObra(o, genericas);
      const proy = proyectar(o, ev, genericas);
      const vista = ev.importadas.get(K('V'))?.vista;
      if (!vista) return 'la vista no se evaluó';
      if (vista.campos.some((c) => c.nombre === 'NER_T')) return 'NER_T sigue entre los campos';
      const srcs = vista.hoja.map((r) => r.src);
      if (!srcs.includes('Configuración: sin silla de anclaje.')) return 'la hoja no dice qué falta';
      if (srcs.some((s) => s.startsWith('NER_T :='))) return 'la hoja imprime un dato de la silla';
      const errores = Object.entries(ev.results).filter(([id, r]) => id.startsWith('vista:') && r.error);
      if (errores.length) return `la hoja de la vista tiene ${errores.length} error(es): ${errores[0][1].error}`;
      return sinArista('S', 'V')(ev, proy) ?? esperaArista('D', 'V')(ev, proy) ?? sinCiclo(ev);
    },
  },
  {
    nombre: 'vista base-columna: con la placa rotulada cuentan las barras de las dos filas, que traccionan juntas',
    ok: () => {
      const n = (m) => m.derivados.find((d) => d.nombre === 'n_cont')?.valor;
      const mom = n(VISTA_BASE.construir(DATOS_BASE, configCompleta(VISTA_BASE)));
      const rot = n(VISTA_BASE.construir(DATOS_BASE, configCompleta(VISTA_BASE, { placa: 'rotulada' })));
      // Las zonas de 0,5·h_ef de las dos filas se solapan: cuenta la unión, más que con
      // una fila y no más que las barras del pedestal (21 y 36 con los datos del Pachón).
      return mom === 21 && rot === 36 ? null : `n_cont: ${mom} con momento, ${rot} rotulada`;
    },
  },
  {
    nombre: '«+ base» sugiere la rotulada con momento nulo o bajo, y la de momento con tracción y momento o con e > e_crit',
    ok: () => {
      const { recomendarPlaca, PLACA_ROTULADA_DE_PARTIDA: P } = motor;
      // La placa de partida es la de la plantilla: si alguien la cambia allí, la sugerencia miente.
      const texto = JSON.stringify(VISTAS['base-columna'].plantilla);
      for (const f of [`L_pb := ${P.L_mm} mm`, `B_pb := ${P.B_mm} mm`, `fc_ped := ${P.fc_MPa} MPa`])
        if (!texto.includes(f)) return `la plantilla ya no tiene «${f}»`;
      const s = (N, M, criterio = 'compresion') => ({ conjunto: 'LRFD', criterio, N, M });
      const casos = [
        [[], null],
        [[s(800, 0), s(-150, 0, 'traccion')], 'rotulada'],
        // 700×500 con f'c 30: q_max = 5801 N/mm; con N = 800 kN, e_crit = 350 − 69 = 281 mm.
        [[s(800, 150)], 'rotulada'],
        [[s(800, 250)], 'momento'],
        [[s(800, 0), s(-150, 20, 'traccion')], 'momento'],
        // COL_PPALES: N_c = 2738 kN con M_c = 3042 kN·m.
        [[s(2737.7, 3042.3)], 'momento'],
      ];
      for (const [sol, esperada] of casos) {
        const r = recomendarPlaca(sol);
        if ((r?.variante ?? null) !== esperada) return `${JSON.stringify(sol)}: ${JSON.stringify(r)}, se esperaba ${esperada}`;
        if (r && !r.motivo) return 'sin motivo';
      }
      return null;
    },
  },
  ...CASOS_ENSAMBLE(),
];

// ── El ensamble de la base: la plantilla contra el Pachón ────────────────────
//
// Las externas son las del Pachón al 2026-09-25 (las gobernantes de COL_PPALES en
// los conjuntos LRFD y O0, y las fuerzas de capacidad de sus diagonales), y los
// u_* son los que su grupo «Base de columna», armado a mano, daba con ellas. La
// plantilla tiene que dar lo mismo con los nombres sufijados.

function CASOS_ENSAMBLE() {
  const EXTERNAS = [
    'N_c_CP_LRFD := 2737.72117 kN', 'N_c_CP_O0 := 2454.32424 kN', 'N_t_CP_O0 := -630.999742 kN',
    'N_v_CP_LRFD := 2528.88488 kN', 'N_v_CP_O0 := 1414.6287400000003 kN', 'N_m_CP_LRFD := 2626.1197700000002 kN',
    'N_m_CP_O0 := 1414.6287400000003 kN', 'N_e_CP_LRFD := 268.273932 kN', 'N_e_CP_O0 := 6.41596828 kN',
    'V_c_CP_LRFD := 557.5577813241114 kN', 'V_c_CP_O0 := 392.09991987439724 kN', 'V_t_CP_O0 := 239.63184458179012 kN',
    'V_v_CP_LRFD := 591.5269167711615 kN', 'V_v_CP_O0 := 635.0572965873657 kN', 'V_m_CP_LRFD := 586.7484708305817 kN',
    'V_m_CP_O0 := 635.0572965873657 kN', 'V_e_CP_LRFD := 104.74148860957922 kN', 'V_e_CP_O0 := 369.31559565216855 kN',
    'M_c_CP_LRFD := 3042.25129 kN*m', 'M_c_CP_O0 := 1301.19476 kN*m', 'M_t_CP_O0 := 190.243376 kN*m',
    'M_v_CP_LRFD := 3336.00099 kN*m', 'M_v_CP_O0 := 4070.99519 kN*m', 'M_m_CP_LRFD := 3387.17645 kN*m',
    'M_m_CP_O0 := 4070.99519 kN*m', 'M_e_CP_LRFD := 765.140329 kN*m', 'M_e_CP_O0 := 2755.63732 kN*m',
    'H_int_dg := 2715.424092503251 kN', 'H_ext_dg := 1940.2244054017028 kN', 'T_ext_dg := 3105.7663058005933 kN',
  ];
  const REFERENCIA = {
    u_pb_CP: 0.8521078818700685,
    // El descascaramiento hacia el borde paralelo a la fila, a 208 mm y no a 310
    // (2026-09-25): gobierna la ductilidad del §17.10.5.3(a). Antes, 0,8592.
    u_anc_CP: 1.1054964019384494,
    // La llave y el pedestal, después de resolver el choque de la llave con las ramas
    // de estribo (2026-09-25): nivel 1 sin ramas interiores y estribos φ25, y el
    // pedestal contando ese nivel con solo el perimetral. Antes, 0,9396 y 0,9396.
    // El pedestal, con los niveles contados desde el primer estribo (s1 = 50 mm): 4 en la
    // zona de la llave y no 5, los dos primeros sin ramas interiores y con el rombo. Antes, 0,6939.
    // Con el aplastamiento del arranque de la base extrema (V_t3, N_t3 = −3106 kN):
    // psi_brg,sl ≈ 0,47 con los 10 pernos traccionados (2026-09-25). Antes, 0,9180.
    u_llave_CP: 1.5056499075720282,
    u_silla_CP: 0.9857142857142857,
    // Con el rombo contado por el cos² del ángulo de las dos ramas que corta el plano
    // de falla, no por la proyección de las cuatro (2026-09-25). Antes, 0,8674.
    u_ped_CP: 1.0368404373059774,
  };
  const PARAMS = { tipo: 'CP', grupoSap: 'COL_PPALES', diseno: 'LRFD', sobrerresistencia: 'O0' };
  const PLANTILLA = VISTAS['base-columna'].plantilla;
  const COMPLETA = configCompleta(VISTAS['base-columna']);
  const idsDe = () => {
    let i = 0;
    return (prefijo) => `${prefijo}ens${++i}`;
  };
  const base = (config = COMPLETA, params = PARAMS, o = obra(calc('EXT', ...EXTERNAS.map(m))), nuevoId = idsDe()) =>
    armarEnsamble(o, PLANTILLA, config, params, sellosConRotulada, { nombre: `Base de columna ${params.grupoSap}`, color: '#db2777' }, nuevoId);
  const errores = (ev) => Object.entries(ev.results).filter(([, r]) => r.error).map(([id, r]) => `${id}: ${r.error}`);
  const u = (ev) =>
    Object.entries(REFERENCIA)
      .filter(([n]) => ev.scope[n] !== undefined || n !== 'u_llave_CP')
      .map(([n, ref]) => (Math.abs(ev.scope[n] - ref) <= 1e-9 * ref ? null : `${n} = ${ev.scope[n]}, se esperaba ${ref}`))
      .find(Boolean) ?? null;
  const nodo = (o, nombre) => o.calculos.find((k) => k.nombre === nombre);

  return [
    {
      nombre: 'ensamble de la base: la plantilla con las externas del Pachón da sus mismos usos, con los nombres sufijados',
      ok: () => {
        const r = base();
        if (r.error) return r.error;
        const o = sanearObra(r.obra);
        if (JSON.stringify(sanearObra(unirObra(partirObra(o)).crudo)) !== JSON.stringify(o)) return 'la obra releída no coincide';
        const vista = o.calculos.find((k) => k.id === r.idVista)?.frontera;
        if (vista?.ensamble?.tipo !== 'CP' || Object.keys(vista.ensamble.nodos).length !== 9) return `ensamble: ${JSON.stringify(vista?.ensamble)}`;
        const ev = evaluarObra(o, genericasBase);
        const e = errores(ev);
        if (e.length) return `${e.length} región(es) con error: ${e[0]}`;
        if (ev.scope.n_cont_ped_CP !== 21) return `n_cont_ped_CP = ${ev.scope.n_cont_ped_CP}`;
        for (const v of ['v_geo_base_CP', 'v_t_llave_CP', 'v_dom_m_CP', 'v_dom_e_CP', 'v_d26c_CP'])
          if (ev.scope[v] !== true) return `${v} = ${ev.scope[v]}`;
        if (ev.scope.L_pb !== undefined) return 'quedó un nombre sin sufijo';
        // El primer estribo φ25 a 55 mm y los tres primeros a 70: abrazan las barras (a
        // 40 mm), dos caen en los 125 mm de arriba y el libre mayor es 45 mm (§9.5.3).
        if (ev.scope.n_est_cab_ped_CP !== 2 || ev.scope.sep_libre_cab_ped_CP?.toNumber('mm') !== 45) return `n_est_cab = ${ev.scope.n_est_cab_ped_CP}, libre = ${ev.scope.sep_libre_cab_ped_CP}`;
        // El aviso de los niveles de cabeza no vota, pero el nodo de la vista sale en
        // ámbar y lo dice.
        const nv = proyectar(o, ev, genericasBase).nodos.find((n) => n.id === idNodoDeCalculo(r.idVista));
        if (nv?.severidad !== 'aviso' || !nv.motivos?.some((t) => t.startsWith('Aviso:'))) return `nodo de la vista: ${nv?.severidad} ${JSON.stringify(nv?.motivos)}`;
        return u(ev) ?? sinCiclo(ev);
      },
    },
    {
      nombre: '«crear apoyo»: cada tipología es una configuración válida y arma su base sin errores',
      ok: () => {
        const ids = new Set();
        for (const t of motor.TIPOLOGIAS_BASE_COLUMNA) {
          if (ids.has(t.id)) return `id repetido: ${t.id}`;
          ids.add(t.id);
          const c = configCompleta(VISTAS['base-columna'], t.config);
          for (const [k, v] of Object.entries(t.config)) if (c[k] !== v) return `${t.id}: ${k} = ${v} no sobrevive a la normalización (${c[k]})`;
          const r = base(c);
          if (r.error) return `${t.id}: ${r.error}`;
          const ev = evaluarObra(sanearObra(r.obra), genericasConRotulada);
          const e = errores(ev);
          if (e.length) return `${t.id}: ${e.length} región(es) con error: ${e[0]}`;
        }
        return null;
      },
    },
    {
      nombre: 'ensamble de la base: dos tipos conviven sin choques, y otro del mismo tipo se rechaza',
      ok: () => {
        const nuevoId = idsDe();
        const a = base(COMPLETA, PARAMS, undefined, nuevoId);
        if (a.error) return a.error;
        const b = base(COMPLETA, { ...PARAMS, tipo: 'CE', grupoSap: 'COL_EXT' }, a.obra, nuevoId);
        if (b.error) return b.error;
        const ev = evaluarObra(b.obra, genericasBase);
        if (ev.repetidos.size) return `repetidos: ${[...ev.repetidos.keys()].join(', ')}`;
        if (!nodo(b.obra, 'Placa base COL_EXT')) return 'no se creó la segunda placa';
        const c = base(COMPLETA, PARAMS, b.obra, nuevoId);
        return c.error && /CP/.test(c.error) ? null : 'aceptó otra base del tipo CP';
      },
    },
    {
      nombre: 'ensamble de la base: quitar la llave y volver a ponerla respeta lo editado y vuelve a los mismos números',
      ok: () => {
        const nuevoId = idsDe();
        const r = base(COMPLETA, PARAMS, undefined, nuevoId);
        if (r.error) return r.error;
        // Lo que el ingeniero escribió en la hoja de datos tiene que sobrevivir.
        const datos = nodo(r.obra, 'Base de columna COL_PPALES — datos');
        const editado = { ...datos, hoja: datos.hoja.map((x) => (x.src.startsWith('Supuesto: dimensiones de la placa') ? { ...x, src: 'Supuesto: placa confirmada.' } : x)) };
        const o0 = { ...r.obra, calculos: r.obra.calculos.map((k) => (k.id === datos.id ? editado : k)) };

        const sin = reconfigurar(o0, PLANTILLA, r.idVista, { ...COMPLETA, llave: 'no' }, sellosBase, nuevoId);
        if (sin.error) return sin.error;
        if (nodo(sin.obra, 'Llave de corte COL_PPALES')) return 'quedó el nodo de la llave';
        if (!sin.quitados.includes('Llave de corte COL_PPALES')) return `quitados: ${sin.quitados.join(', ')}`;
        const hojaSin = nodo(sin.obra, 'Base de columna COL_PPALES — datos').hoja;
        if (hojaSin.some((x) => x.id.includes(':llave:') || x.id.includes(':solicitaciones-llave:'))) return 'quedaron bloques de la llave';
        if (!hojaSin.some((x) => x.src === 'Supuesto: placa confirmada.')) return 'se perdió lo editado (sin llave)';
        const placa = nodo(sin.obra, 'Placa base COL_PPALES').frontera;
        if (placa.entradas.hay_llave !== 0 || 'z_llave' in placa.formulas) return `placa: ${JSON.stringify(placa.entradas.hay_llave)} ${placa.formulas.z_llave}`;
        const ped = nodo(sin.obra, 'Pedestal COL_PPALES').frontera;
        if (ped.entradas.h_llave !== 0 || 'h_llave' in ped.formulas) return 'el pedestal sigue viendo la llave';
        if (nodo(sin.obra, 'Base de columna COL_PPALES — resumen').hoja.some((x) => /u_llave/.test(x.src))) return 'el resumen sigue con la llave';
        const evSin = evaluarObra(sin.obra, genericasBase);
        const e = errores(evSin);
        if (e.length) return `sin llave, ${e.length} región(es) con error: ${e[0]}`;
        if (!Number.isFinite(evSin.scope.u_pb_CP)) return `sin llave, u_pb_CP = ${evSin.scope.u_pb_CP}`;

        const con = reconfigurar(sin.obra, PLANTILLA, r.idVista, COMPLETA, sellosBase, nuevoId);
        if (con.error) return con.error;
        const hoja = nodo(con.obra, 'Base de columna COL_PPALES — datos').hoja;
        const pos = (fin) => hoja.findIndex((x) => x.id.endsWith(fin));
        const llave = pos(':llave:1');
        if (!(llave > pos(':pedestal:v_dom_e') && llave < pos(':materiales:1'))) return 'la sección de la llave volvió fuera de su sitio';
        if (!hoja.some((x) => x.src === 'Supuesto: placa confirmada.')) return 'se perdió lo editado (con llave)';
        const ev = evaluarObra(con.obra, genericasBase);
        const e2 = errores(ev);
        if (e2.length) return `de vuelta, ${e2.length} región(es) con error: ${e2[0]}`;
        return u(ev);
      },
    },
    {
      nombre: 'ensamble: una base armada pasa a la plantilla nueva, conserva lo editado y dice qué no tocó',
      ok: () => {
        const hoja = (bloques) => bloques.map((src) => ({ kind: 'math', src }));
        const antes = {
          nodos: [
            {
              clave: 'datos',
              nombre: 'Datos $G',
              hoja: [{ clave: 'a', bloques: [...hoja(['a_pb := 1 m', 'b_pb := 2 m', 'c_pb := 3 m']), { kind: 'text', src: 'nota A' }, { kind: 'text', src: 'nota B' }] }],
            },
            { clave: 'placa', nombre: 'Placa $G', frontera: { procedencia: 'biblioteca', id: PLACA.id, entradas: { hay_llave: 0 }, formulas: { L_bp: 'a_pb' }, publica: { u_max: 'u_pb' } } },
            { clave: 'vista', nombre: 'Vista $G', frontera: { procedencia: 'vista', id: 'base-columna', entradas: {}, formulas: {}, publica: {} } },
          ],
        };
        // La nueva cambia dos datos, agrega una sección y cambia una atadura.
        const despues = {
          nodos: [
            { ...antes.nodos[0], hoja: [{ clave: 'a', bloques: hoja(['a_pb := 1 m', 'b_pb := 20 m', 'c_pb := 30 m']) }, { clave: 'n', bloques: hoja(['d_pb := 4 m']) }] },
            { ...antes.nodos[1], frontera: { ...antes.nodos[1].frontera, formulas: { L_bp: 'b_pb' }, publica: { u_max: 'u_pb', T_grupo: 'T_pb' } } },
            antes.nodos[2],
          ],
        };
        const nuevoId = idsDe();
        const P = { ...PARAMS, tipo: 'CV', grupoSap: 'COL_VIENTO' };
        const r = armarEnsamble(obra(), antes, {}, P, { [PLACA.id]: 'viejo' }, { nombre: 'b', color: '#db2777' }, nuevoId);
        if (r.error) return r.error;
        // El ingeniero editó c_pb y la nota A; b_pb y la nota B no. La plantilla nueva
        // quita las dos notas: la editada se queda, la otra se va.
        const datos = nodo(r.obra, 'Datos COL_VIENTO');
        const editar = (x) => (x.src.startsWith('c_pb') ? { ...x, src: 'c_pb_CV := 5 m' } : x.src === 'nota A' ? { ...x, src: 'nota A editada' } : x);
        const o = { ...r.obra, calculos: r.obra.calculos.map((k) => (k.id === datos.id ? { ...k, hoja: k.hoja.map(editar) } : k)) };
        const a = motor.actualizarPlantilla(o, antes, despues, r.idVista, { [PLACA.id]: 'nuevo' }, nuevoId);
        if (a.error) return a.error;
        const src = nodo(a.obra, 'Datos COL_VIENTO').hoja.map((x) => x.src).join(' ; ');
        if (src !== 'a_pb_CV := 1 m ; b_pb_CV := 20 m ; c_pb_CV := 5 m ; d_pb_CV := 4 m ; nota A editada') return `datos: ${src}`;
        if (a.conservados.length !== 2 || !a.conservados.every((c) => c.includes(':a:'))) return `conservados: ${a.conservados.join(', ')}`;
        const placa = nodo(a.obra, 'Placa COL_VIENTO').frontera;
        if (placa.formulas.L_bp !== 'b_pb_CV' || placa.sha256 !== 'nuevo') return `placa: ${placa.formulas.L_bp} ${placa.sha256}`;
        // Lo que la plantilla nueva publica, también: si no, quien lo ata queda con el valor de ejemplo.
        if (placa.publica.T_grupo !== 'T_pb_CV') return `publica: ${JSON.stringify(placa.publica)}`;
        return a.obra.calculos.length === r.obra.calculos.length ? null : 'cambió el número de nodos';
      },
    },
    {
      nombre: 'ensamble: un texto agregado en medio de una sección entra, y el editado que venía después no se duplica',
      ok: () => {
        const texto = (src, id) => ({ kind: 'text', src, ...(id ? { id } : {}) });
        const vista = { clave: 'vista', nombre: 'Vista $G', frontera: { procedencia: 'vista', id: 'base-columna', entradas: {}, formulas: {}, publica: {} } };
        const con = (bloques) => ({ nodos: [{ clave: 'datos', nombre: 'Datos $G', hoja: [{ clave: 'a', bloques }] }, vista] });
        const antes = con([texto('titulo'), texto('nota A'), texto('nota B')]);
        // Como se escribía antes: sin id, corre los índices de lo que sigue.
        const sinId = con([texto('titulo'), texto('nueva'), texto('nota A'), texto('nota B')]);
        // Como se escribe ahora: con id, no corre nada.
        const conId = con([texto('titulo'), texto('nueva', 'nueva'), texto('nota A'), texto('nota B')]);
        const corridos = motor.corrimientos(antes, sinId);
        if (corridos.length !== 2) return `corrimientos sin id: ${corridos.join(' | ')}`;
        if (motor.corrimientos(antes, conId).length) return `corrimientos con id: ${motor.corrimientos(antes, conId).join(' | ')}`;
        const P = { ...PARAMS, tipo: 'CV', grupoSap: 'COL_VIENTO' };
        for (const [nombre, despues] of [['sin id', sinId], ['con id', conId]]) {
          const nuevoId = idsDe();
          const r = armarEnsamble(obra(), antes, {}, P, {}, { nombre: 'b', color: '#db2777' }, nuevoId);
          if (r.error) return r.error;
          const datos = nodo(r.obra, 'Datos COL_VIENTO');
          const o = { ...r.obra, calculos: r.obra.calculos.map((k) => (k.id === datos.id ? { ...k, hoja: k.hoja.map((x) => (x.src === 'nota A' ? { ...x, src: 'nota A editada' } : x)) } : k)) };
          const a = motor.actualizarPlantilla(o, antes, despues, r.idVista, {}, nuevoId);
          if (a.error) return `${nombre}: ${a.error}`;
          const hoja = nodo(a.obra, 'Datos COL_VIENTO').hoja;
          const src = hoja.map((x) => x.src).join(' ; ');
          if (src !== 'titulo ; nueva ; nota A editada ; nota B') return `${nombre}: ${src}`;
          if (new Set(hoja.map((x) => x.id)).size !== hoja.length) return `${nombre}: ids repetidos`;
          if (motor.desfaseDePlantilla(a.obra, despues, r.idVista).length) return `${nombre}: queda desfase: ${motor.desfaseDePlantilla(a.obra, despues, r.idVista).join(' | ')}`;
        }
        return null;
      },
    },
    {
      nombre: 'ensamble: una base con los textos corridos por una definición agregada (el Pachón) se alinea por contenido, sin tocar lo que dicen',
      ok: () => {
        const texto = (src) => ({ kind: 'text', src });
        const vista = { clave: 'vista', nombre: 'Vista $G', frontera: { procedencia: 'vista', id: 'base-columna', entradas: {}, formulas: {}, publica: {} } };
        const con = (bloques) => ({ nodos: [{ clave: 'datos', nombre: 'Datos $G', hoja: [{ clave: 'a', bloques }] }, vista] });
        // Armada cuando la sección no tenía s1_pb: sus textos quedaron en :2 y :3.
        const armada = con([texto('titulo'), texto('nota A'), texto('tabla')]);
        // La plantilla de hoy agregó la definición delante: los textos son :3 y :4.
        const hoy = con([texto('titulo'), { kind: 'math', src: 's1_pb := 50 mm' }, texto('nota A'), texto('tabla')]);
        const nuevoId = idsDe();
        const P = { ...PARAMS, tipo: 'CV', grupoSap: 'COL_VIENTO' };
        const r = armarEnsamble(obra(), armada, {}, P, {}, { nombre: 'b', color: '#db2777' }, nuevoId);
        if (r.error) return r.error;
        // A la base se le agregó la definición a mano, como pasó en el Pachón.
        const datos = nodo(r.obra, 'Datos COL_VIENTO');
        const def = { id: `${datos.id}:a:s1_pb`, kind: 'math', x: 40, y: 0, src: 's1_pb_CV := 55 mm' };
        const o = { ...r.obra, calculos: r.obra.calculos.map((k) => (k.id === datos.id ? { ...k, hoja: [k.hoja[0], def, ...k.hoja.slice(1)] } : k)) };
        const a = motor.actualizarPlantilla(o, hoy, hoy, r.idVista, {}, nuevoId);
        if (a.error) return a.error;
        const hoja = nodo(a.obra, 'Datos COL_VIENTO').hoja.map((x) => `${x.id.slice(datos.id.length + 1)}=${x.src}`).join(' ; ');
        if (hoja !== 'a:1=titulo ; a:s1_pb=s1_pb_CV := 55 mm ; a:3=nota A ; a:4=tabla') return `hoja: ${hoja}`;
        const c = motor.compararObras(o, a.obra, genericasBase).nodos.find((f) => f.id === datos.id);
        if (!c || c.bloques.renombrados.length !== 2 || c.bloques.editados.length || c.bloques.agregados.length) return `comparación: ${JSON.stringify(c?.bloques)}`;
        return null;
      },
    },
    {
      nombre: 'plantillas versionadas: la de hoy está congelada, sin corrimientos, y una base armada guarda su huella',
      ok: () => {
        const versiones = VISTAS['base-columna'].versiones ?? [];
        const hoy = motor.huellaDePlantilla(PLANTILLA);
        if (!versiones.some((v) => v.version === hoy)) return `la plantilla de hoy (${hoy}) no está congelada: npm run plantillas:congelar`;
        for (const v of versiones) if (motor.huellaDePlantilla(v.plantilla) !== v.version) return `la versión ${v.version} no da su huella`;
        const i = versiones.findIndex((v) => v.version === hoy);
        if (i > 0) {
          const c = motor.corrimientos(versiones[i - 1].plantilla, PLANTILLA);
          if (c.length) return c.join(' | ');
        }
        const r = base();
        if (r.error) return r.error;
        const o = sanearObra(r.obra);
        if (o.calculos.find((k) => k.id === r.idVista).frontera.ensamble.plantilla !== hoy) return 'la base armada no guarda la huella, o el saneo la pierde';
        const e = motor.estadoDePlantilla(o, r.idVista);
        if (e.actualizable || e.desfase.length || e.armada !== hoy) return `recién armada: ${JSON.stringify(e)}`;
        // Una base anterior a las versiones se toma como armada con la primera.
        const sinHuella = {
          ...o,
          calculos: o.calculos.map((k) => {
            if (k.id !== r.idVista) return k;
            const { plantilla: _, ...ensamble } = k.frontera.ensamble;
            return { ...k, frontera: { ...k.frontera, ensamble } };
          }),
        };
        if (motor.versionDeBase(sinHuella, r.idVista)?.version !== versiones[0].version) return 'sin huella no toma la primera versión';
        const a = motor.actualizarBase(sinHuella, r.idVista, sellosBase, idsDe());
        if (a.error) return a.error;
        return a.obra.calculos.find((k) => k.id === r.idVista).frontera.ensamble.plantilla === hoy ? null : 'actualizar no estampa la huella de hoy';
      },
    },
    {
      nombre: 'propuesta: la tabla antes/después dice qué nodo cambia, con qué dato, y qué usos suben primero',
      ok: () => {
        const r = base();
        if (r.error) return r.error;
        const o = sanearObra(r.obra);
        const sinCambio = motor.compararObras(o, o, genericasBase);
        if (!sinCambio.sinCambios) return `la misma obra da cambios: ${motor.comparacionEnTexto(sinCambio)}`;
        // La placa más delgada: sube su uso, y la vista y lo de abajo quizá también.
        const placa = nodo(o, 'Placa base COL_PPALES');
        // El campo de la genérica atado al espesor de la hoja de datos.
        const t = Object.entries(placa.frontera.formulas).find(([, expr]) => expr === 't_pb_CP')?.[0];
        if (!t) return `la placa no ata t_pb_CP: ${JSON.stringify(placa.frontera.formulas)}`;
        const despues = {
          ...o,
          calculos: o.calculos.map((k) =>
            k.id === placa.id
              ? { ...k, frontera: { ...k.frontera, formulas: Object.fromEntries(Object.entries(k.frontera.formulas).filter(([c]) => c !== t)), entradas: { ...k.frontera.entradas, [t]: 40 } } }
              : k,
          ),
        };
        const c = motor.compararObras(o, despues, genericasBase);
        const fila = c.nodos.find((f) => f.id === placa.id);
        if (!fila || fila.estado !== 'modificado') return `placa: ${JSON.stringify(fila?.estado)} · ${motor.comparacionEnTexto(c)}`;
        if (!fila.datos.some((d) => d.nombre === `dato ${t}` && d.despues?.startsWith('40'))) return `datos: ${JSON.stringify(fila.datos)}`;
        if (!fila.datos.some((d) => d.nombre === `atado ${t}` && d.antes === 't_pb_CP' && d.despues === undefined)) return `atadura: ${JSON.stringify(fila.datos)}`;
        // El espesor no gobierna la placa: u_max no se mueve, u_espesor sí.
        const u = fila.usos.find((x) => x.nombre === 'u_espesor');
        if (!u || u.tendencia !== 'empeora') return `u_espesor: ${JSON.stringify(u)} · ${motor.comparacionEnTexto(c)}`;
        if (fila.usos.some((x) => x.nombre === 'u_max')) return 'u_max no cambia y aparece';
        if (c.nodos[0].tendencia !== 'empeora') return 'lo que empeora no va primero';
        return c.nodos.some((f) => f.estado === 'nuevo' || f.estado === 'quitado') ? 'aparecieron nodos' : null;
      },
    },
    {
      nombre: 'invariante: una base atrás de su plantilla lo dice en la vista, y lo que dejó sin fijar en su nodo',
      ok: () => {
        const r = base();
        if (r.error) return r.error;
        const o = sanearObra(r.obra);
        const recien = desfaseDePlantilla(o, PLANTILLA, r.idVista);
        if (recien.length) return `recién armada ya tiene desfase: ${recien.join(' | ')}`;
        const inv0 = invariantesDeObra(o, evaluarObra(o, genericasBase), genericasBase);
        if (inv0.length) return `recién armada ya tiene invariantes: ${inv0.map((x) => `${x.nodo}: ${x.motivo}`).join(' | ')}`;
        // Como quedó el Pachón antes de 2026-09-25: la vista sin publicar lo nuevo, la
        // hoja de datos sin la sección del desarrollo y el anclaje sin su atadura.
        const ens = o.calculos.find((k) => k.id === r.idVista).frontera.ensamble.nodos;
        const atras = {
          ...o,
          calculos: o.calculos.map((k) => {
            if (k.id === r.idVista) {
              const { sep_libre_cab: _, ...publica } = k.frontera.publica;
              return { ...k, frontera: { ...k.frontera, publica } };
            }
            if (k.id === ens.datos) return { ...k, hoja: k.hoja.filter((b) => !b.id.includes(':desarrollo:')) };
            if (k.id === ens.anclaje) {
              const { l_sup_arm: _, ...formulas } = k.frontera.formulas;
              return { ...k, frontera: { ...k.frontera, formulas } };
            }
            return k;
          }),
        };
        const d = desfaseDePlantilla(atras, PLANTILLA, r.idVista).join(' | ');
        for (const t of ['no publica sep_libre_cab', 'le faltan los bloques desarrollo', 'le faltan los campos l_sup_arm']) if (!d.includes(t)) return `desfase sin «${t}»: ${d}`;
        const inv = invariantesDeObra(atras, evaluarObra(atras, genericasBase), genericasBase);
        const tipos = inv.map((x) => `${x.tipo}@${x.nodo}`).sort().join(', ');
        if (!tipos.includes('plantilla-atras@Base de columna COL_PPALES — geometría') || !tipos.includes('campo-suelto@Anclaje al hormigón COL_PPALES')) return `invariantes: ${tipos}`;
        return null;
      },
    },
    {
      nombre: 'ensamble: las condiciones leen presencia, ausencia y variantes, y una ilegible no se cumple',
      ok: () => {
        const c = { silla: 'nervios', llave: 'no', placa: 'articulada' };
        const casos = [
          ['silla', true], ['!silla', false], ['llave', false], ['!llave', true],
          ['placa=articulada', true], ['placa=gran|articulada', true], ['placa=gran', false],
          ['placa!=gran', true], ['placa!=articulada|gran', false], ['!placa=gran', false], ['placa==x', false],
          ['silla&placa=articulada', true], ['silla&llave', false], ['!llave&placa!=gran', true], ['silla&', false],
        ];
        const mal = casos.filter(([si, esperado]) => cumple(si, c) !== esperado).map(([si]) => si);
        return mal.length ? `se leyeron mal: ${mal.join(', ')}` : null;
      },
    },
    {
      nombre: 'ensamble: la plantilla de la base es coherente con las opciones de su vista',
      ok: () => {
        const p = problemasDePlantilla(PLANTILLA, VISTAS['base-columna'].opciones, (c) => configCompleta(VISTAS['base-columna'], c));
        return p.length ? p.join(' | ') : null;
      },
    },
    {
      nombre: 'ensamble: cambiar de variante reemplaza la genérica del nodo, conserva id, grupo y ⚑, y cambia sus secciones',
      ok: () => {
        // Una plantilla mínima con una pieza de dos variantes. Las genéricas son
        // sustitutas: aquí se prueba el mecanismo, no el diseño.
        const OPCIONES = [{ clave: 'placa', variantes: [{ id: 'momento' }, { id: 'rotulada' }] }];
        const hoja = (bloques) => bloques.map((src) => ({ kind: 'math', src }));
        const P = {
          nodos: [
            {
              clave: 'datos',
              nombre: 'Datos $G',
              hoja: [
                { clave: 'comun', bloques: hoja(['a_pb := 1 m']) },
                { clave: 'gran', si: 'placa=momento', bloques: hoja(['e_pb := 2 m']) },
                { clave: 'art', si: 'placa=rotulada', bloques: hoja(['r_pb := 3 m']) },
              ],
            },
            { clave: 'placa', nombre: 'Placa $G', si: 'placa=momento', frontera: { procedencia: 'biblioteca', id: PLACA.id, entradas: { hay_llave: 0 }, formulas: { L_bp: 'a_pb' }, publica: { u_max: 'u_pb' } } },
            { clave: 'placa', nombre: 'Placa articulada $G', si: 'placa=rotulada', frontera: { procedencia: 'biblioteca', id: PEDESTAL.id, entradas: {}, formulas: { PED_X: 'a_pb' }, publica: { u_max: 'u_pb' } } },
            { clave: 'vista', nombre: 'Vista $G', frontera: { procedencia: 'vista', id: 'base-columna', entradas: {}, formulas: {}, publica: {} } },
          ],
        };
        const p = problemasDePlantilla(P, OPCIONES);
        if (p.length) return `la plantilla sintética: ${p.join(' | ')}`;
        const nuevoId = idsDe();
        const r = armarEnsamble(obra(), P, { placa: 'momento' }, { ...PARAMS, tipo: 'CV', grupoSap: 'COL_VIENTO' }, sellosBase, { nombre: 'b', color: '#db2777' }, nuevoId);
        if (r.error) return r.error;
        const placa0 = nodo(r.obra, 'Placa COL_VIENTO');
        if (placa0?.frontera?.slug !== PLACA.id) return `placa: ${placa0?.frontera?.slug}`;
        const marca = { nota: 'revisar la placa', por: 'usuario' };
        const o1 = { ...r.obra, calculos: r.obra.calculos.map((k) => (k.id === placa0.id ? { ...k, revisar: marca, frontera: { ...k.frontera, entradas: { hay_llave: 1 } } } : k)) };
        const s = reconfigurar(o1, P, r.idVista, { placa: 'rotulada' }, sellosBase, nuevoId);
        if (s.error) return s.error;
        const placa1 = s.obra.calculos.find((k) => k.id === placa0.id);
        if (!placa1) return 'la placa cambió de id';
        if (placa1.frontera.slug !== PEDESTAL.id || placa1.nombre !== 'Placa articulada COL_VIENTO') return `variante nueva: ${placa1.nombre} ${placa1.frontera.slug}`;
        if ('hay_llave' in placa1.frontera.entradas || placa1.frontera.formulas.PED_X !== 'a_pb_CV') return 'arrastró ataduras de la otra variante';
        if (placa1.revisar?.nota !== 'revisar la placa' || placa1.grupo !== placa0.grupo) return 'perdió la marca o el grupo';
        if (!s.quitados.some((q) => /cambia a Placa articulada/.test(q))) return `quitados: ${s.quitados.join(', ')}`;
        const src = nodo(s.obra, 'Datos COL_VIENTO').hoja.map((x) => x.src);
        if (!src.includes('r_pb_CV := 3 m') || src.some((x) => x.startsWith('e_pb_CV'))) return `datos: ${src.join(' ; ')}`;
        if (s.obra.calculos.length !== r.obra.calculos.length) return 'cambió el número de nodos';
        // Una plantilla con dos variantes simultáneas de la misma pieza se denuncia.
        const rota = { nodos: P.nodos.map((n) => (n.si === 'placa=rotulada' ? { ...n, si: 'placa=rotulada|momento' } : n)) };
        const q = problemasDePlantilla(rota, OPCIONES);
        const malNombre = problemasDePlantilla({ nodos: [...P.nodos, { clave: 'x', nombre: 'x', si: 'placa=empotrada', hoja: [] }] }, OPCIONES);
        if (!q.some((x) => /existe dos veces/.test(x))) return `no vio la pieza doble: ${q.join(' | ')}`;
        return malNombre.some((x) => /empotrada/.test(x)) ? null : 'no vio la variante inexistente';
      },
    },
    {
      nombre: 'ensamble: la placa rotulada apaga la silla y la capacidad, y la base de hastial del Pachón cierra sin error',
      ok: () => {
        // Las gobernantes de las cuatro columnas COL-HASTIAL de modelo_prueba.sdb
        // (nudos 45, 47, 592 y 593), leídas del modelo el 2026-09-25: rotuladas, M = 0.
        const HASTIAL = [
          'N_c_CV_LRFD := 819.4 kN', 'V_c_CV_LRFD := 41.9 kN', 'M_c_CV_LRFD := 0 kN*m',
          'N_v_CV_LRFD := 359.1 kN', 'V_v_CV_LRFD := 94.2 kN', 'M_v_CV_LRFD := 0 kN*m',
          'N_c_CV_O0 := 755.3 kN', 'V_c_CV_O0 := 0.1 kN', 'M_c_CV_O0 := 0 kN*m',
          'N_t_CV_O0 := -182.2 kN', 'V_t_CV_O0 := 0.1 kN', 'M_t_CV_O0 := 0 kN*m',
          'N_v_CV_O0 := 360.8 kN', 'V_v_CV_O0 := 14.7 kN', 'M_v_CV_O0 := 0 kN*m',
        ];
        const params = { tipo: 'CV', grupoSap: 'COL_HASTIAL', diseno: 'LRFD', sobrerresistencia: 'O0' };
        // La silla y la capacidad se piden, y la placa rotulada las apaga.
        const r = base({ ...COMPLETA, placa: 'rotulada', llave: 'no' }, params, obra(calc('EXT', ...HASTIAL.map(m))));
        if (r.error) return r.error;
        const nombres = r.obra.calculos.filter((k) => k.id !== 'EXT').map((k) => k.nombre).sort();
        const esperados = [
          'Anclaje al hormigón COL_HASTIAL', 'Base de columna COL_HASTIAL — datos', 'Base de columna COL_HASTIAL — geometría',
          'Base de columna COL_HASTIAL — resumen', 'Pedestal COL_HASTIAL', 'Placa base rotulada COL_HASTIAL',
        ].sort();
        if (JSON.stringify(nombres) !== JSON.stringify(esperados)) return `nodos: ${nombres.join(', ')}`;
        const vista = r.obra.calculos.find((k) => k.id === r.idVista).frontera;
        if (vista.config.silla !== 'no' || vista.config.capacidad !== 'no') return `config: ${JSON.stringify(vista.config)}`;
        const ev = evaluarObra(sanearObra(r.obra), genericasConRotulada);
        const e = errores(ev);
        if (e.length) return `${e.length} región(es) con error: ${e[0]}`;
        if (ev.scope.T_pb_CV?.toNumber('kN') !== 182.2) return `T_pb_CV = ${ev.scope.T_pb_CV}`;
        if (ev.scope.n_trac_pb_CV !== 4) return `n_trac_pb_CV = ${ev.scope.n_trac_pb_CV}`;
        if (!(ev.scope.u_pb_CV > 0 && ev.scope.u_pb_CV <= 1)) return `u_pb_CV = ${ev.scope.u_pb_CV}`;
        for (const n of ['u_anc_CV', 'u_ped_CV']) if (!(ev.scope[n] > 0 && ev.scope[n] <= 1)) return `${n} = ${ev.scope[n]}`;
        if (ev.scope.v_geo_base_CV === true) return null;
        const v = [...ev.importadas.values()].find((i) => i?.vista)?.vista;
        return `la vista de la base rotulada no cierra: ${v?.modelo.chequeos.filter((c) => !c.cumple && !c.aviso).map((c) => `${c.id}=${c.valor}`).join(' ')}`;
      },
    },
    {
      nombre: 'ensamble: el Pachón pasa a placa rotulada y vuelve, con la placa en el mismo nodo y los mismos números',
      ok: () => {
        const nuevoId = idsDe();
        const r = base(COMPLETA, PARAMS, undefined, nuevoId);
        if (r.error) return r.error;
        const placa0 = nodo(r.obra, 'Placa base COL_PPALES');
        const rot = reconfigurar(r.obra, PLANTILLA, r.idVista, { ...COMPLETA, placa: 'rotulada' }, sellosConRotulada, nuevoId);
        if (rot.error) return rot.error;
        const placa1 = rot.obra.calculos.find((k) => k.id === placa0.id);
        if (placa1?.frontera?.slug !== 'placa-base-rotulada-generica') return `la placa rotulada: ${placa1?.frontera?.slug}`;
        for (const n of ['Silla de anclaje COL_PPALES', 'Base de columna COL_PPALES — capacidad'])
          if (nodo(rot.obra, n)) return `quedó «${n}»`;
        const datos = nodo(rot.obra, 'Base de columna COL_PPALES — datos').hoja;
        // La columna es del tipo, no de la variante: se queda la del pórtico.
        if (!datos.some((x) => x.src === 'd_col_pb_CP := 1000 mm')) return 'cambió la columna';
        if (!datos.some((x) => x.src === 'L_pb_CP := 700 mm')) return 'no llegó la placa de la variante rotulada';
        const evRot = evaluarObra(rot.obra, genericasConRotulada);
        const e = errores(evRot);
        if (e.length) return `rotulada, ${e.length} región(es) con error: ${e[0]}`;
        const vuelta = reconfigurar(rot.obra, PLANTILLA, r.idVista, COMPLETA, sellosConRotulada, nuevoId);
        if (vuelta.error) return vuelta.error;
        if (vuelta.obra.calculos.find((k) => k.id === placa0.id)?.frontera?.slug !== PLACA.id) return 'la placa no volvió';
        const ev = evaluarObra(vuelta.obra, genericasConRotulada);
        const e2 = errores(ev);
        if (e2.length) return `de vuelta, ${e2.length} región(es) con error: ${e2[0]}`;
        return u(ev);
      },
    },
    {
      nombre: 'ensamble de la base a mano: sin nodo de apoyos, la hoja de solicitaciones define todo lo que la base nombra',
      ok: () => {
        const r = armarEnsamble(obra(), PLANTILLA, COMPLETA, PARAMS, sellosBase, { nombre: 'Base', color: '#db2777' }, idsDe(), true);
        if (r.error) return r.error;
        const ev = evaluarObra(r.obra, genericasBase);
        const sinDefinir = errores(ev).filter((e) => /Undefined symbol|sin definir|no está definid/i.test(e));
        if (sinDefinir.length) return `${sinDefinir.length} nombre(s) sin definir: ${sinDefinir[0]}`;
        const hoja = nodo(r.obra, 'Solicitaciones COL_PPALES');
        if (!hoja?.revisar) return 'la hoja a mano no está marcada para revisar';
        // Con las externas ya definidas en la obra, no las repite.
        const conDiag = armarEnsamble(obra(calc('D', m('H_int_dg := 1 kN'), m('H_ext_dg := 1 kN'), m('T_ext_dg := 1 kN'))), PLANTILLA, COMPLETA, PARAMS, sellosBase, { nombre: 'Base', color: '#db2777' }, idsDe(), true);
        if (conDiag.error) return conDiag.error;
        const ev2 = evaluarObra(conDiag.obra, genericasBase);
        return ev2.repetidos.size ? `repetidos: ${[...ev2.repetidos.keys()].join(', ')}` : null;
      },
    },
    {
      nombre: 'ensamble de la base: sin silla, se va su nodo y la placa trabaja sin nervios',
      ok: () => {
        const nuevoId = idsDe();
        const r = base(COMPLETA, PARAMS, undefined, nuevoId);
        if (r.error) return r.error;
        const sin = reconfigurar(r.obra, PLANTILLA, r.idVista, { ...COMPLETA, silla: 'no' }, sellosBase, nuevoId);
        if (sin.error) return sin.error;
        if (nodo(sin.obra, 'Silla de anclaje COL_PPALES')) return 'quedó el nodo de la silla';
        const placa = nodo(sin.obra, 'Placa base COL_PPALES').frontera;
        if (placa.entradas.hay_nervios !== 0 || 'sep_nerv' in placa.formulas) return 'la placa sigue con nervios';
        const vista = sin.obra.calculos.find((k) => k.id === r.idVista).frontera;
        if (vista.config.silla !== 'no' || 'silla' in vista.ensamble.nodos) return `vista: ${JSON.stringify(vista.config)}`;
        const ev = evaluarObra(sin.obra, genericasBase);
        const e = errores(ev);
        if (e.length) return `${e.length} región(es) con error: ${e[0]}`;
        return ev.scope.u_silla_CP === undefined ? null : 'sigue publicándose u_silla_CP';
      },
    },
  ];
}

// ── Correr ───────────────────────────────────────────────────────────────────

let fallos = 0;
for (const caso of CASOS_VISTA) {
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
for (const caso of CASOS_COPIA) {
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
for (const caso of CASOS_SERVIDOR) {
  let motivo;
  try {
    motivo = await caso.ok();
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
await rm(TMP, { recursive: true, force: true });
for (const caso of CASOS_CARPETA) {
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
for (const caso of CASOS_SANEO) {
  let motivo;
  try {
    motivo = caso.ok(sanearObra(caso.crudo), caso.crudo);
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

for (const caso of CASOS_HOJA) {
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

for (const caso of CASOS) {
  let motivo;
  try {
    const ev = evaluarObra(caso.obra, genericas);
    const proy = proyectar(caso.obra, ev, genericas);
    motivo = caso.ok(ev, proy);
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

const total = CASOS.length + CASOS_VISTA.length + CASOS_COPIA.length + CASOS_SANEO.length + CASOS_HOJA.length + CASOS_CARPETA.length + CASOS_SERVIDOR.length;
console.log(`\n${fallos ? 'FALLA' : 'OK'}: ${total - fallos} de ${total} casos.\n`);
process.exit(fallos ? 1 : 0);
