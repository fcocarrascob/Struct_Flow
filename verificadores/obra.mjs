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

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { compilarEntrada, ROOT } from '../scripts/lib/motor.mjs';

// Un solo bundle: la obra, el motor y el armado de una genérica comparten
// instancia de mathjs. Ver la cabecera de `src/proyecto/obra/engine.ts`.
const motor = await compilarEntrada('src/proyecto/obra/engine.ts');
const {
  evaluarObra,
  proyectar,
  problemaDeGrafo,
  resolverExpresion,
  moduloDeBiblioteca,
  sanearObra,
  idDeObra,
  idNodoDeCalculo,
} = motor;

// ── Armar una obra ───────────────────────────────────────────────────────────

let n = 0;
const m = (src) => ({ id: `b${n++}`, tipo: 'math', src });
const t = (src) => ({ id: `b${n++}`, tipo: 'text', src });

/** Un nodo de cálculo con su hoja libre, o con una planilla importada. */
function calc(id, ...bloques) {
  return { id, nombre: id, bloques };
}
function conPlanilla(id, importada) {
  return { id, nombre: id, bloques: [], importada };
}
function obra(...calculos) {
  return {
    version: 1,
    id: 'caso',
    nombre: 'Caso',
    creada: '2026-01-01T00:00:00.000Z',
    modulos: [],
    cargas: [],
    calculos,
  };
}

// ── Comprobaciones ───────────────────────────────────────────────────────────

const K = (id) => idNodoDeCalculo(id);

/** El valor de una variable del scope de la obra, formateado como lo ve quien lo lee. */
const valor = (ev, nombre) => (ev.scope[nombre] === undefined ? undefined : String(ev.scope[nombre]));

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

const genericas = {
  [PLACA.id]: { fase: 'lista', modulo: PLACA },
  [ZAPATA.id]: { fase: 'lista', modulo: ZAPATA },
};

/** Una referencia a una genérica, con sus entradas por omisión. */
function importada(modulo, extra = {}) {
  return {
    slug: modulo.id,
    sha256: modulo.biblioteca.sha256,
    entradas: { ...modulo.porDefecto },
    ...extra,
  };
}

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
];

// ── El saneo de lo que estaba guardado ───────────────────────────────────────
//
// No necesita evaluar nada, así que van aparte: cada uno recibe una obra cruda
// —lo que puede haber escrito una versión anterior de la aplicación— y comprueba
// lo que sale.

/** Todos los ids que reparte el saneo de una obra, en un solo array. */
function idsDe(o) {
  const ids = [];
  for (const k of o.calculos) {
    ids.push(k.id, ...k.bloques.map((b) => b.id));
  }
  for (const c of o.cargas) {
    ids.push(c.id);
    for (const s of c.subcargas) ids.push(s.id, ...s.bloques.map((b) => b.id));
  }
  return ids;
}

const CASOS_SANEO = [
  {
    nombre: 'dos bloques sin id no acaban con el mismo id de rescate',
    // El fallo que cierra: los ids de rescate llevaban el índice DENTRO de su
    // padre, así que la primera partida de cada carga era `s-recuperada-0` y los
    // primeros bloques de cada nodo colisionaban entre sí. Dos bloques con el
    // mismo id comparten entrada en `results` y `key` de React.
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
      cargas: [],
    },
    ok: (o) => {
      if (o.calculos[0].bloques[0].id !== 'b1') return 'se renombró el primero, que no chocaba';
      if (o.calculos[1].bloques[0].id === 'b1') return 'el segundo conservó el id repetido';
      return null;
    },
  },
  {
    nombre: 'un id de obra que no cabe en una URL se slugifica en vez de dejar la obra inalcanzable',
    // `/obra/<id>` pasa por el alfabeto cerrado de `SLUG_PROYECTO_RE`: un id que
    // no lo cumple deja una obra guardada que `parsearRuta` rechaza, y el enlace
    // cae en el menú sin decir nada.
    crudo: { id: 'Galpón Altiplano', calculos: [], cargas: [] },
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
      cargas: [],
    },
    ok: (o) => (o.calculos[0].bloques.length === 1 ? null : 'no se descartó el bloque sin src'),
  },
  {
    nombre: 'el id crudo y el saneado se resuelven igual, para poder reescribir esa entrada',
    // `guardarObra` busca la entrada en el archivo CRUDO por este id: si no
    // coincidiera con el de la obra saneada, guardar insertaría un duplicado en
    // vez de reemplazar.
    crudo: { id: 'Galpón Altiplano', calculos: [], cargas: [] },
    ok: (o, crudo) => (idDeObra(crudo) === o.id ? null : `${idDeObra(crudo)} ≠ ${o.id}`),
  },
];

// ── Correr ───────────────────────────────────────────────────────────────────

let fallos = 0;
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

const total = CASOS.length + CASOS_SANEO.length;
console.log(`\n${fallos ? 'FALLA' : 'OK'}: ${total - fallos} de ${total} casos.\n`);
process.exit(fallos ? 1 : 0);
