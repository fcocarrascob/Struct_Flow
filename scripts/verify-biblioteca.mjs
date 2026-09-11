#!/usr/bin/env node
// Verifica la biblioteca de planillas genéricas: lo que `verify:planilla` ya
// exige, más lo que hace a una genérica reutilizable.
//
//   npm run verify:biblioteca [slug …]
//
// Por cada JSON bajo public/biblioteca/:
//   1. el contrato del `meta` para clase `generica` (`validarMeta`: slug,
//      disciplina, normas, entradas con su región in_*, las tres salidas
//      u_max · gobierna · v_global, al menos un caso que cumple);
//   2. la verificación del corpus (`verificarPlanilla`: unidades, ✗ sin
//      declarar, tokens de esquema, unidades eclipsadas);
//   3. cero contrastes `c_*` y cero `esperadoFalso`: una genérica no respalda
//      ninguna memoria, y un ✗ en su ejemplo de referencia es un defecto;
//   4. cada salida declarada existe en el scope final;
//   5. por cada caso: se instancian las entradas del caso sobre la hoja, se
//      evalúa, y `v_global` tiene que dar lo que el caso declara (`cumple`); el
//      conjunto de veredictos en ✗ tiene que ser EXACTAMENTE `esperadoFalso`
//      del caso, para que un caso que «falla a propósito» no tape una
//      regresión en otro veredicto.
//
// Sale con código 1 si algo falla. Con `--casos-escribir`, en vez de fallar por
// un `esperadoFalso` de caso que no coincide, escribe el conjunto medido en el
// JSON (es como se rellenan la primera vez: corriendo, no escribiendo a mano).

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { verificarPlanilla, motorCompartido, ROOT } from './lib/planilla.mjs';

const BIBLIOTECA = path.join(ROOT, 'public', 'biblioteca');
const args = process.argv.slice(2);
const escribirCasos = args.includes('--casos-escribir');
const filtro = args.filter((a) => !a.startsWith('--'));

const { evaluateSheet, instanciarRegiones, valoresDeEntradas, ordenDeLectura } = await motorCompartido();

async function archivosJson(dir) {
  let entradas;
  try {
    entradas = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entradas.sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await archivosJson(p)));
    else if (e.isFile() && e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

/** El scope final de una hoja: un centinela `image` al final lo captura. */
function scopeFinal(regions) {
  const ordenadas = ordenDeLectura(regions);
  const ultima = ordenadas[ordenadas.length - 1];
  const centinela = {
    id: '__scope',
    kind: 'image',
    x: ultima?.x ?? 40,
    y: (ultima?.y ?? 0) + 1e6,
    src: '',
  };
  const results = evaluateSheet([...regions, centinela]);
  return { scope: results.__scope?.scope ?? {}, results };
}

function sangria(texto) {
  const m = /\n( +)"/.exec(texto);
  return m ? m[1].length : 2;
}

const archivos = (await archivosJson(BIBLIOTECA)).filter(
  (a) => filtro.length === 0 || filtro.includes(path.basename(a, '.json')),
);
if (archivos.length === 0) {
  console.log(filtro.length ? `No hay ninguna genérica con slug ${filtro.join(', ')}.` : 'OK: 0 genéricas (la biblioteca está vacía).');
  process.exit(0);
}

const fallidas = [];
let totalCasos = 0;

for (const archivo of archivos) {
  const rel = path.relative(ROOT, archivo);
  const problemas = [];
  const v = await verificarPlanilla(archivo);

  // 1 · el contrato, forzando la clase: una hoja en esta carpeta ES genérica.
  if (v.meta.clase !== 'generica') problemas.push(`meta.clase es «${v.meta.clase ?? '—'}», y en public/biblioteca/ tiene que ser «generica»`);
  for (const h of v.hallazgosMeta) {
    if (h.severidad === 'error') problemas.push(`meta · ${h.codigo}: ${h.mensaje}`);
  }
  if (v.meta.slug && v.meta.slug !== path.basename(archivo, '.json')) {
    problemas.push(`meta.slug «${v.meta.slug}» no coincide con el nombre del archivo`);
  }

  // 2 · el corpus
  for (const e of v.errores) problemas.push(`región ${e.id} «${primera(e.src)}»: ${e.error}`);
  for (const i of v.inesperados) problemas.push(`el ejemplo de referencia no cumple «${primera(i.src)}» (${i.id})`);

  // 3 · sin contrastes ni excepciones
  if (v.contrastes > 0) problemas.push(`${v.contrastes} contraste(s) c_*: una genérica no lleva`);
  if (Object.keys(v.esperadoFalso).length) problemas.push('meta.esperadoFalso no vacío: una genérica no lo declara');

  // 4 · las salidas existen
  const { scope } = scopeFinal(v.regions);
  for (const s of v.meta.salidas ?? []) {
    if (!(s.nombre in scope)) problemas.push(`la salida «${s.nombre}» no existe en el scope`);
  }

  // 5 · los casos
  let casosOk = 0;
  const entradas = v.meta.entradas ?? [];
  let porDefecto = {};
  try {
    porDefecto = valoresDeEntradas(v.regions, entradas);
  } catch (err) {
    problemas.push(err.message);
  }
  let casosEscritos = false;
  for (const caso of v.meta.casos ?? []) {
    try {
      const regs = instanciarRegiones(v.regions, { ...porDefecto, ...caso.entradas }, entradas);
      const { scope: sc, results } = scopeFinal(regs);
      const falsos = ordenDeLectura(regs)
        .filter((r) => results[r.id]?.bool === false)
        .map((r) => r.id)
        .sort();
      const errs = regs.filter((r) => results[r.id]?.error);
      if (errs.length) {
        problemas.push(`caso «${caso.nombre}»: ${errs.length} región(es) con error, la primera ${errs[0].id}: ${results[errs[0].id].error}`);
        continue;
      }
      if (sc.v_global !== caso.cumple) {
        problemas.push(`caso «${caso.nombre}»: v_global dio ${sc.v_global} y el caso declara cumple=${caso.cumple}`);
        continue;
      }
      const declarados = [...(caso.esperadoFalso ?? [])].sort();
      if (JSON.stringify(falsos) !== JSON.stringify(declarados)) {
        if (escribirCasos) {
          caso.esperadoFalso = falsos;
          casosEscritos = true;
        } else {
          problemas.push(
            `caso «${caso.nombre}»: los ✗ medidos son [${falsos.join(', ')}] y el caso declara [${declarados.join(', ')}]` +
              ' (corre con --casos-escribir para registrarlos)',
          );
          continue;
        }
      }
      casosOk += 1;
    } catch (err) {
      problemas.push(`caso «${caso.nombre}»: ${err.message}`);
    }
  }
  totalCasos += casosOk;
  if (casosEscritos) {
    const texto = await readFile(archivo, 'utf8');
    const hoja = JSON.parse(texto);
    hoja.meta.casos = v.meta.casos;
    await writeFile(archivo, JSON.stringify(hoja, null, sangria(texto)) + '\n', 'utf8');
    console.log(`  (escritos los esperadoFalso de los casos de ${path.basename(archivo)})`);
  }

  if (problemas.length) {
    fallidas.push(rel);
    console.log(`[ERROR] ${rel}`);
    for (const p of problemas) console.log(`        ${p}`);
  } else {
    console.log(
      `[ OK  ] ${rel} — ${v.regions.length} regiones · ${entradas.length} entradas · ` +
        `${(v.meta.salidas ?? []).length} salidas · ${v.verdictos.length} verificaciones ✓ · ${casosOk} casos`,
    );
  }
}

function primera(src) {
  const l = String(src).split('\n')[0];
  return l.length > 60 ? `${l.slice(0, 57)}…` : l;
}

console.log('');
if (fallidas.length) {
  console.log(`FALLA: ${fallidas.length} de ${archivos.length} genéricas`);
  process.exit(1);
}
console.log(`OK: ${archivos.length} genéricas · ${totalCasos} casos.`);
