#!/usr/bin/env node
// Genera el índice del catálogo de planillas: `public/planillas/indice.json`.
//
// Las planillas viven en `public/`, que Vite sirve tal cual sin procesar, así
// que el navegador no tiene forma de saber qué archivos hay. Este índice es esa
// lista: unos pocos kB frente a los ~1,2 MB del corpus, para que el menú se
// pueble sin descargar 33 planillas que quizá no se abran.
//
// Se ejecuta desde `npm run dev` y `npm run build`, de modo que no puede quedar
// desfasado respecto a los archivos.
//
//   npm run indice:planillas

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'public', 'planillas');
// Fuera de `planillas/` a propósito: ese directorio es "solo planillas", y
// `verify-planilla.mjs` lo recorre entero dando por hecho que todo lo que hay
// dentro es una hoja. Un índice ahí se contaría como una planilla más.
const SALIDA = path.join(ROOT, 'public', 'planillas-indice.json');

/**
 * La disciplina sale de `meta.ficha`, la ruta del post que documenta la
 * planilla (`.../content/<disciplina>/ejemplo-<slug>.mdx`). Es un dato que ya
 * está en los archivos: anotarla a mano en 33 planillas sería una copia más que
 * mantener sincronizada.
 */
function disciplinaDe(meta) {
  const m = /content\/([a-z]+)\//.exec(meta?.ficha ?? '');
  return m ? m[1] : 'otros';
}

const archivos = (await readdir(DIR)).filter((f) => f.endsWith('.json'));

const entradas = [];
for (const archivo of archivos.sort()) {
  const slug = archivo.replace(/\.json$/, '');
  let datos;
  try {
    datos = JSON.parse(await readFile(path.join(DIR, archivo), 'utf8'));
  } catch (err) {
    console.error(`  ✗ ${archivo}: JSON inválido — ${err.message}`);
    process.exitCode = 1;
    continue;
  }
  if (!Array.isArray(datos.regions)) {
    console.error(`  ✗ ${archivo}: no tiene "regions"`);
    process.exitCode = 1;
    continue;
  }
  entradas.push({
    slug,
    // Sin título se cae al slug: el menú siempre tiene algo que mostrar.
    titulo: datos.meta?.titulo?.trim() || slug,
    disciplina: disciplinaDe(datos.meta),
    regiones: datos.regions.length,
  });
}

await writeFile(SALIDA, JSON.stringify({ version: 1, planillas: entradas }, null, 2) + '\n');

const porDisciplina = entradas.reduce((acc, e) => {
  acc[e.disciplina] = (acc[e.disciplina] ?? 0) + 1;
  return acc;
}, {});
const resumen = Object.entries(porDisciplina)
  .map(([k, v]) => `${k} ${v}`)
  .join(' · ');
console.log(`indice: ${entradas.length} planillas (${resumen}) → ${path.relative(ROOT, SALIDA)}`);
