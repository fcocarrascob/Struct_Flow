#!/usr/bin/env node
// Verificador de los módulos de diseño.
//
// El repo no tiene tests unitarios: la red de seguridad es correr el motor de
// verdad sobre material real. `verify:planillas` lo hace con las 33 planillas
// publicadas; esto hace lo propio con los módulos, que producen hojas del mismo
// formato.
//
// Por cada módulo y cada juego de entradas declarado en él:
//   1. `verificarSimbolos` sobre los ítems — ninguna fila usa lo que no se ha
//      definido antes;
//   2. `evaluateSheet` sobre la hoja — ninguna región puede dar error;
//   3. `renderEsquema` contra el scope de la figura — ningún token sin resolver;
//   4. cada entrada y cada salida declaradas existen en el scope.
// Después, dos comprobaciones de conjunto:
//   5. el contraste contra la planilla publicada de la que salió el módulo;
//   6. la vuelta completa: las memorias exportadas se pasan por
//      `verify-planilla.mjs`, el mismo verificador del corpus.
//
// Lo que NO es un fallo: que una verificación dé ✗. Un diseño que no cumple es
// un resultado legítimo del módulo —hay un caso de prueba que busca justamente
// eso—, al revés que en una planilla publicada, donde un ✗ no declarado delata
// una regresión. Por eso la memoria exportada declara sus ✗ en
// `meta.esperadoFalso`; de eso se encarga `hojaDeModulo`.
//
//   npm run verify:modulos [id-de-modulo …]

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cargarModulosDiseno, ROOT } from './lib/motor.mjs';

// Un solo bundle: motor y módulos comparten instancia de mathjs. Ver el
// comentario de `src/lib/diseno/engine.ts`.
const {
  MODULOS,
  evaluarModulo,
  hojaDeModulo,
  verificarSimbolos,
  evaluateSheet,
  renderEsquema,
  ESQUEMAS_PREFIX,
} = await cargarModulosDiseno();

const filtro = process.argv.slice(2);
const modulos = filtro.length ? MODULOS.filter((m) => filtro.includes(m.id)) : MODULOS;

if (modulos.length === 0) {
  console.error(
    filtro.length
      ? `No hay ningún módulo con id ${filtro.join(', ')}.`
      : 'No hay módulos de diseño registrados en src/lib/diseno/registro.ts.',
  );
  process.exit(2);
}

/** Cachea el texto de cada SVG: el mismo esquema se rinde una vez por caso. */
const svgs = new Map();
function leerEsquema(src) {
  if (!svgs.has(src)) svgs.set(src, readFile(path.join(ROOT, 'public', src), 'utf8'));
  return svgs.get(src);
}

const fallidos = [];
const exportadas = await mkdtemp(path.join(tmpdir(), 'structflow-export-'));

for (const modulo of modulos) {
  console.log(`\n${modulo.titulo}  ·  /diseno/${modulo.id}`);
  console.log(
    `${modulo.norma} · ${modulo.entradas.length} entradas · ${modulo.salidas.length} salidas`,
  );

  for (const caso of modulo.casos) {
    const problemas = [];
    let resumen = '';

    try {
      verificarSimbolos(modulo.construirHoja(caso.entradas));
      const ev = evaluarModulo(modulo, caso.entradas);

      for (const e of ev.errores) {
        problemas.push(`región ${e.id} «${primeraLinea(e.src)}»: ${e.error}`);
      }

      if (!ev.figura || !String(ev.figura.src).startsWith(ESQUEMAS_PREFIX)) {
        problemas.push(`la hoja no emite ninguna figura bajo ${ESQUEMAS_PREFIX}`);
      } else {
        if (ev.figura.src !== modulo.esquema) {
          problemas.push(`el módulo declara ${modulo.esquema} pero la hoja emite ${ev.figura.src}`);
        }
        try {
          const render = renderEsquema(await leerEsquema(ev.figura.src), ev.scope);
          if (render.faltantes.length) {
            problemas.push(
              `${render.faltantes.length} token(es) sin resolver: ${render.faltantes.slice(0, 5).join(' · ')}`,
            );
          }
          resumen = `${render.tokens} tokens`;
        } catch (err) {
          problemas.push(`esquema ilegible (${ev.figura.src}): ${err.message}`);
        }
      }

      // Una entrada del formulario que no llega a la hoja, o una salida que el
      // panel pediría y no existe, es justo la deriva que este contrato busca
      // impedir. Se detecta acá y no en el navegador.
      for (const campo of modulo.entradas) {
        if (!(campo.nombre in ev.scope)) {
          problemas.push(`la entrada «${campo.nombre}» no llega al scope`);
        }
      }
      for (const salida of modulo.salidas) {
        if (!(salida.nombre in ev.scope)) {
          problemas.push(`la salida «${salida.nombre}» no existe en el scope`);
        }
      }

      // La memoria exactamente como la exporta el botón, para el paso 6.
      const hoja = hojaDeModulo(modulo, ev);
      const archivo = `${modulo.id}--${ranurar(caso.nombre)}.json`;
      await writeFile(path.join(exportadas, archivo), JSON.stringify(hoja, null, 2));

      const veredictos = Object.values(ev.results).filter((r) => typeof r.bool === 'boolean');
      const cumplen = veredictos.filter((r) => r.bool).length;
      resumen = `${ev.regions.length} regiones · ${cumplen}/${veredictos.length} verificaciones ✓ · ${resumen}`;
    } catch (err) {
      problemas.push(err.message);
    }

    if (problemas.length) {
      fallidos.push(`${modulo.id} / ${caso.nombre}`);
      console.log(`  [ERROR] ${caso.nombre}`);
      for (const p of problemas) console.log(`          ${p}`);
    } else {
      console.log(`  [ OK  ] ${caso.nombre} — ${resumen}`);
    }
  }

  // `contraste` admite un objeto suelto o una lista: un módulo que cruza dos
  // cuerpos de norma no tiene por qué encontrar UNA planilla que los cubra los
  // dos, y sin la lista habría que escribir uno de los bloques sin red.
  for (const contraste of [modulo.contraste ?? []].flat()) {
    const { planilla, valores, entradas } = contraste;
    const discrepan = [];
    let exactos = 0;
    let conTolerancia = 0;
    let peorDesvio = 0;
    try {
      // El caso que reproduce una planilla publicada casi nunca son los valores
      // por defecto del módulo: la planilla fija su perfil, sus propiedades y
      // sus factores, que son datos de ese ejemplo.
      const mio = evaluarModulo(modulo, entradas ?? modulo.porDefecto).scope;
      const suyo = await scopeDePlanilla(planilla);
      for (const v of valores) {
        // Una cadena cuando las dos hojas lo llaman igual; la forma larga si no.
        const aca = typeof v === 'string' ? v : v.mio;
        const alla = typeof v === 'string' ? v : (v.suyo ?? v.mio);
        const tol = typeof v === 'string' ? 0 : (v.tolerancia ?? 0);
        const rotulo = aca === alla ? aca : `${aca} (allá ${alla})`;
        if (tol > 0) conTolerancia++;
        else exactos++;
        if (!(alla in suyo)) discrepan.push(`«${alla}» no existe en la planilla ${planilla}`);
        else if (!(aca in mio)) discrepan.push(`«${aca}» no existe en el módulo`);
        else if (!coincide(mio[aca], suyo[alla], tol)) {
          const desvio = desvioRelativo(mio[aca], suyo[alla]);
          const cuanto = desvio === null ? '' : ` (${(desvio * 100).toFixed(2)} %`
            + (tol ? `, se admite ${(tol * 100).toFixed(1)} %)` : ')');
          discrepan.push(`${rotulo}: módulo ${mio[aca]} ≠ planilla ${suyo[alla]}${cuanto}`);
        } else {
          const desvio = desvioRelativo(mio[aca], suyo[alla]);
          if (desvio !== null && desvio > peorDesvio) peorDesvio = desvio;
        }
      }
    } catch (err) {
      discrepan.push(err.message);
    }

    if (discrepan.length) {
      fallidos.push(`${modulo.id} / contraste con ${planilla}`);
      console.log(`  [ERROR] contraste con la planilla ${planilla}`);
      for (const d of discrepan) console.log(`          ${d}`);
    } else {
      // El informe distingue las dos cosas a propósito: decir «idénticos» de
      // un valor que solo entra dentro de una tolerancia sería mentir sobre la
      // fuerza de la red.
      const detalle = conTolerancia
        ? `${exactos} idénticos y ${conTolerancia} dentro de tolerancia (desvío máximo ${(peorDesvio * 100).toFixed(2)} %)`
        : `${exactos} valores idénticos`;
      console.log(`  [ OK  ] contraste con la planilla ${planilla} — ${detalle}`);
    }
  }
}

// ── 6 · La vuelta completa ───────────────────────────────────────────────────
// Las memorias exportadas se pasan por el verificador del corpus. Es la
// comprobación que cierra el círculo: lo que descarga el botón es una planilla
// de pleno derecho, no un JSON parecido.
console.log('\nMemorias exportadas, por el verificador del corpus:');
const verificador = spawnSync(
  process.execPath,
  [path.join(ROOT, 'scripts', 'verify-planilla.mjs'), exportadas],
  { encoding: 'utf8' },
);
const ultima = (verificador.stdout ?? '').trim().split('\n').pop() ?? '';
if (verificador.status === 0) {
  console.log(`  [ OK  ] ${ultima}`);
} else {
  fallidos.push('las memorias exportadas no pasan verify:planilla');
  console.log(verificador.stdout);
  console.log(verificador.stderr);
}
await rm(exportadas, { recursive: true, force: true });

/**
 * El valor comparable de una magnitud: el número, o el valor en unidades base
 * del SI si es un `Unit` de mathjs. Así `26.875 cm` y `0.26875 m` se comparan
 * iguales, que es lo correcto — lo que se contrasta es la física, no cómo
 * decidió mostrarla cada hoja.
 */
function magnitud(v) {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && typeof v.value === 'number' && v.units) return v.value;
  return null;
}

/** El desvío relativo entre dos magnitudes, o `null` si no son comparables. */
function desvioRelativo(a, b) {
  const na = magnitud(a);
  const nb = magnitud(b);
  if (na === null || nb === null) return null;
  if (na === nb) return 0;
  const escala = Math.max(Math.abs(na), Math.abs(nb));
  return escala === 0 ? Infinity : Math.abs(na - nb) / escala;
}

/** `tolerancia` es el desvío relativo admitido; 0 significa identidad. */
function coincide(a, b, tolerancia = 0) {
  const desvio = desvioRelativo(a, b);
  if (desvio === null) return String(a) === String(b);
  return desvio <= Math.max(tolerancia, 1e-9);
}

/** Evalúa una planilla publicada y devuelve el scope de su figura (el final). */
async function scopeDePlanilla(slug) {
  const datos = JSON.parse(
    await readFile(path.join(ROOT, 'public', 'planillas', `${slug}.json`), 'utf8'),
  );
  const results = evaluateSheet(datos.regions);
  const figura = datos.regions.find(
    (r) => r.kind === 'image' && String(r.src).startsWith(ESQUEMAS_PREFIX),
  );
  if (!figura) throw new Error(`la planilla ${slug} no tiene figura de la que tomar el scope`);
  return results[figura.id]?.scope ?? {};
}

function primeraLinea(src) {
  const l = String(src).split('\n')[0];
  return l.length > 60 ? `${l.slice(0, 57)}…` : l;
}

/** El nombre de un caso, como nombre de archivo. */
function ranurar(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

console.log('');
if (fallidos.length) {
  console.log(`FALLA: ${fallidos.length} — ${fallidos.join(', ')}`);
  process.exit(1);
}
const casos = modulos.reduce((n, m) => n + m.casos.length, 0);
console.log(`OK: ${modulos.length} módulo(s), ${casos} casos, memorias exportadas verificadas.`);
