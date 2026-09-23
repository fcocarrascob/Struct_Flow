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

import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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
  colocar,
  problemaDeGrafo,
  rupturaPorQuitar,
  resolverExpresion,
  moduloDeBiblioteca,
  problemaDeAlias,
  sanearObra,
  archivoDeObra,
  idDeObra,
  idNodoDeCalculo,
  idNodoDeSubcarga,
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
    cargas: [],
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
    nombre: 'ninguna flecha de datos apunta hacia atrás en el canvas',
    // La columna era la del TIPO más el nivel en la cadena. Un cálculo parte de
    // una columna más a la derecha que una partida, así que una partida que usa
    // lo que publica un cálculo quedaba A SU IZQUIERDA y la flecha volvía hacia
    // atrás — el caso de las costaneras, cuyo peso es una carga.
    obra: {
      ...obra(calc('K', m('q_k := 3 kN/m^2'))),
      modulos: ['cargas'],
      cargas: [
        {
          id: 'c1',
          nombre: 'CM',
          subcargas: [{ id: 's1', nombre: 'Peso', variable: 'q_cm', hoja: [reg('math', 'q_cm := q_k', 40)] }],
        },
      ],
    },
    ok: (ev, proy) => {
      const pos = colocar(proy.nodos, proy.aristas);
      const atras = proy.aristas
        .filter((a) => pos[a.desde] && pos[a.hasta] && pos[a.hasta].x <= pos[a.desde].x)
        .map((a) => `${a.desde}→${a.hasta}`);
      return atras.length ? `flechas hacia atrás: ${atras.join(' · ')}` : null;
    },
  },
  {
    nombre: 'una carga con una sola partida se dibuja como un solo nodo',
    // Un patrón de SAP respaldado por una sola hoja dibujaba dos tarjetas con el
    // mismo número: la de la carga y la de su partida. En el taller de soldadura
    // eran 16 de 21 nodos. Con varias partidas la carga sí agrupa, y se queda.
    obra: {
      ...obra(calc('G', m('A_g := 10 m^2'))),
      modulos: ['cargas'],
      cargas: [
        {
          id: 'c1',
          nombre: 'SDL',
          subcargas: [{ id: 's1', nombre: 'Revestimiento', variable: 'q_1', hoja: [reg('math', 'q_1 := 1 kN/m^2', 40), reg('math', 'R_1 := q_1 * A_g', 88)] }],
        },
        {
          id: 'c2',
          nombre: 'D',
          subcargas: [
            { id: 's2', nombre: 'Uno', variable: 'q_2', hoja: [reg('math', 'q_2 := 2 kN/m^2', 40)] },
            { id: 's3', nombre: 'Dos', variable: 'q_3', hoja: [reg('math', 'q_3 := 3 kN/m^2', 40)] },
          ],
        },
      ],
    },
    ok: (ev, proy) => {
      const ids = new Set(proy.nodos.map((x) => x.id));
      if (ids.has('carga:c1')) return 'la carga de una partida sigue teniendo su propio nodo';
      const plegada = proy.nodos.find((x) => x.id === 'partida:s1');
      if (!plegada) return 'desapareció la partida, que es la que abre la hoja';
      if (plegada.etiqueta !== 'SDL') return `la tarjeta dice «${plegada.etiqueta}», se esperaba el nombre de la carga`;
      if (!plegada.subtitulo.includes('Revestimiento')) return `el subtítulo no nombra la partida: «${plegada.subtitulo}»`;
      if (!proy.aristas.some((a) => a.desde === 'cargas' && a.hasta === 'partida:s1')) return 'no cuelga de Cargas';
      if (!proy.aristas.some((a) => a.desde === 'calculo:G' && a.hasta === 'partida:s1' && a.tipo === 'dato')) return 'perdió la flecha de datos';
      if (!ids.has('carga:c2') || !ids.has('partida:s2') || !ids.has('partida:s3')) return 'la carga de dos partidas se plegó';
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
    nombre: 'una partida lleva el grupo de su carga, y el grupo no toca la evaluación',
    obra: {
      ...obra(calc('K', m('q_k := 3 kN/m^2'))),
      modulos: ['cargas'],
      grupos: [{ id: 'g1', nombre: 'Viento', color: '#2563eb' }],
      cargas: [
        {
          id: 'c1',
          nombre: 'W',
          grupo: 'g1',
          subcargas: [{ id: 's1', nombre: 'Presión', variable: 'q_w', hoja: [reg('math', 'q_w := q_k', 40)] }],
        },
      ],
    },
    ok: (ev, proy) => {
      const sub = proy.nodos.find((x) => x.id === idNodoDeSubcarga('s1'));
      if (sub?.grupo?.nombre !== 'Viento') return `la partida trae ${JSON.stringify(sub?.grupo)}`;
      if (proy.nodos.find((x) => x.id === K('K'))?.grupo) return 'K no tiene grupo y apareció con uno';
      return en(ev.scope, 'q_w', 'kN/m^2') === 3 ? null : 'q_w dejó de valer 3 kN/m²';
    },
  },
];

// ── La hoja de un nodo, como dato ────────────────────────────────────────────
// Funciones puras que no son ni una obra evaluada ni un saneo: dónde cae un
// bloque nuevo, y qué pasa al desprender una genérica de la biblioteca.

const CASOS_HOJA = [
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
  for (const c of o.cargas) {
    ids.push(c.id);
    for (const s of c.subcargas) ids.push(s.id, ...hojaDeNodo(s).map((b) => b.id));
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
      cargas: [],
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
    crudo: { id: 'Galpón Altiplano', calculos: [], cargas: [] },
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
      cargas: [],
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
      cargas: [],
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
      cargas: [],
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
      cargas: [{ id: 'c1', nombre: 'E', subcargas: [], grupo: 'g1' }],
    },
    ok: (o) => {
      const g = (o.grupos ?? []).map((x) => `${x.id}:${x.nombre}`).join(',');
      if (g !== 'g1:Sismo') return `grupos: ${g}`;
      const de = (id) => o.calculos.find((k) => k.id === id)?.grupo;
      if (de('k1') !== 'g1') return 'k1 perdió su grupo';
      if (de('k2') !== undefined) return 'k2 conservó un grupo descartado';
      if (de('k3') !== undefined) return 'k3 conservó un grupo que no existe';
      if (o.cargas[0].grupo !== 'g1') return 'la carga perdió su grupo';
      // Ida y vuelta por el archivo, que es lo que hace exportar e importar.
      const vuelta = sanearObra(archivoDeObra(o).obra);
      if (JSON.stringify(vuelta.grupos) !== JSON.stringify(o.grupos)) return 'el archivo cambió los grupos';
      if (vuelta.calculos[0].grupo !== 'g1') return 'el archivo perdió la asignación';
      // Borrar el grupo se lleva también las referencias.
      const sin = borrarGrupo(o, 'g1');
      if (sin.grupos.length || sin.calculos[0].grupo || sin.cargas[0].grupo) return 'borrarGrupo dejó referencias';
      return null;
    },
  },
  {
    nombre: 'una obra sin grupos no gana un `grupos: []` al sanearse',
    // Guardar una obra no puede cambiarla si nadie la tocó.
    crudo: { id: 'o', calculos: [], cargas: [] },
    ok: (o) => ('grupos' in o ? 'apareció `grupos`' : null),
  },
];

// ── La obra en disco: una carpeta ────────────────────────────────────────────
//
// `partirObra` reparte una obra en `obra.json` más una hoja por nodo, y
// `unirObra` la vuelve a armar. El caso de regresión es la obra autocontenida
// del Pachón, que es un proyecto real de punta a punta: si sobrevive a la ida y
// vuelta sin cambiar un byte ni un resultado, la carpeta no pierde nada.

const PACHON = sanearObra(
  JSON.parse(await readFile(path.join(ROOT, 'docs/pachon/autocontenida/obra-pachon-soldadura.json'), 'utf8')).obra,
);
const CARRILERA = await generica('acero/viga-carrilera-generica.json');
const genericasPachon = { [CARRILERA.id]: { fase: 'lista', modulo: CARRILERA } };

/** Lo que se lee de la carpeta, saneado como lo hace la aplicación. */
const releer = (archivos) => sanearObra(unirObra(archivos).crudo);

const CASOS_CARPETA = [
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
      const nodos = PACHON.calculos.length + PACHON.cargas.reduce((s, c) => s + c.subcargas.length, 0);
      const hojas = Object.keys(archivos).filter((r) => r.startsWith('hojas/'));
      if (!('obra.json' in archivos)) return 'falta obra.json';
      if (hojas.length !== nodos) return `${hojas.length} hojas para ${nodos} nodos`;
      const grafo = JSON.parse(archivos['obra.json']).obra;
      const conRegiones = [...grafo.calculos, ...grafo.cargas.flatMap((c) => c.subcargas)].filter(
        (k) => typeof k.hoja !== 'string',
      );
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
        cargas: [],
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
        cargas: [],
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
];

// ── Correr ───────────────────────────────────────────────────────────────────

let fallos = 0;
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

const total = CASOS.length + CASOS_SANEO.length + CASOS_HOJA.length + CASOS_CARPETA.length + CASOS_SERVIDOR.length;
console.log(`\n${fallos ? 'FALLA' : 'OK'}: ${total - fallos} de ${total} casos.\n`);
process.exit(fallos ? 1 : 0);
