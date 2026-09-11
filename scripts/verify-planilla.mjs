#!/usr/bin/env node
// Verifica una planilla del canvas FUERA del navegador.
//
// La planilla es la fuente de verdad y este script la ejecuta con el mismo
// motor que corre en /canvas — mismas unidades, mismo chequeo dimensional.
//
//   npm run verify:planilla -- <planilla.json> [...más] [--md] [--md-out <ruta>] [--esquemas <dir>]
//   npm run verify:planillas            # todas las de public/planillas/
//
// Acepta uno o más .json, o un directorio (verifica todos sus .json). Sale con
// código 1 si en cualquiera de ellas:
//   - alguna región tiene error (sintaxis, variable indefinida, unidades que no
//     casan — esto último es el motivo principal de que el script exista);
//   - alguna comparación da `false` sin estar declarada en meta.esperadoFalso;
//   - alguna comparación declarada en meta.esperadoFalso da `true` (la excepción
//     quedó obsoleta y hay que borrarla, o el resultado cambió sin que nadie
//     lo notara);
//   - el `meta` no cumple el contrato de su clase (ver src/lib/biblioteca/contrato.ts).
//
//   --md            imprime el desarrollo y los veredictos como tablas Markdown.
//   --md-out <ruta> además lo escribe: a ese archivo si termina en .md (una sola
//                   planilla), o como <ruta>/<slug>.eval.md si es una carpeta.
//                   El archivo abre con un sello (sha256 de la planilla y commit
//                   del motor) que el harness compara para saber si sigue vigente.
//   --esquemas <dir> carpeta extra donde buscar los `/esquemas/*.svg` — para una
//                   planilla de un proyecto cuyas figuras viven fuera de este repo.
//
// Formato de la planilla: docs/ESQUEMA-PLANILLA.md.
//
// La verificación en sí vive en scripts/lib/planilla.mjs; esto es la CLI.

import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { verificarPlanilla, informeConsola, markdownEval, commitDelMotor } from './lib/planilla.mjs';

const args = process.argv.slice(2);

function opcion(nombre) {
  const i = args.indexOf(nombre);
  if (i === -1) return null;
  const v = args[i + 1];
  if (!v || v.startsWith('--')) {
    console.error(`${nombre} necesita un valor`);
    process.exit(2);
  }
  return v;
}

const emitMd = args.includes('--md');
const mdOut = opcion('--md-out');
const esquemasExtra = opcion('--esquemas');
const CON_VALOR = new Set(['--md-out', '--esquemas']);
const targets = args.filter((a, i) => !a.startsWith('--') && !CON_VALOR.has(args[i - 1]));

if (targets.length === 0) {
  console.error(
    'Uso: npm run verify:planilla -- <planilla.json | directorio> [...más] [--md] [--md-out <ruta>] [--esquemas <dir>]',
  );
  process.exit(2);
}

/** Expande directorios a sus .json (orden alfabético, para un reporte estable). */
async function resolverPlanillas(entradas) {
  const rutas = [];
  for (const t of entradas) {
    const abs = path.resolve(t);
    if ((await stat(abs)).isDirectory()) {
      const hijos = (await readdir(abs)).filter((f) => f.endsWith('.json')).sort();
      rutas.push(...hijos.map((f) => path.join(abs, f)));
    } else {
      rutas.push(abs);
    }
  }
  return rutas;
}

/** Dónde va el eval de una planilla según `--md-out`. */
async function destinoEval(ruta, slug, total) {
  const abs = path.resolve(mdOut);
  if (abs.toLowerCase().endsWith('.md')) {
    if (total > 1) {
      console.error('--md-out <archivo.md> solo vale con UNA planilla; con varias, pasa una carpeta.');
      process.exit(2);
    }
    await mkdir(path.dirname(abs), { recursive: true });
    return abs;
  }
  await mkdir(abs, { recursive: true });
  return path.join(abs, `${slug}.eval.md`);
}

const rutas = await resolverPlanillas(targets);
const commit = commitDelMotor();
const fallidas = [];
for (const ruta of rutas) {
  const v = await verificarPlanilla(ruta, { esquemas: esquemasExtra ? [path.resolve(esquemasExtra)] : [] });
  for (const linea of informeConsola(v)) console.log(linea);
  if (emitMd || mdOut) {
    const md = markdownEval(v, { commit });
    if (emitMd) console.log(md);
    if (mdOut) {
      const destino = await destinoEval(ruta, path.basename(ruta, '.json'), rutas.length);
      await writeFile(destino, md, 'utf8');
      console.log(`  eval -> ${path.relative(process.cwd(), destino)}`);
    }
  }
  if (!v.ok) fallidas.push(path.relative(process.cwd(), ruta));
}

if (rutas.length > 1) {
  console.log('='.repeat(60));
  if (fallidas.length) {
    console.log(`FALLA: ${fallidas.length} de ${rutas.length} planillas:`);
    for (const f of fallidas) console.log(`  - ${f}`);
  } else {
    console.log(`OK: las ${rutas.length} planillas cuadran.`);
  }
  console.log('');
}
process.exit(fallidas.length ? 1 : 0);
