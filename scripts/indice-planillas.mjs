#!/usr/bin/env node
// Genera el índice del catálogo de planillas.
//
// Las planillas viven en `public/`, que Vite sirve tal cual sin procesar, así
// que el navegador no tiene forma de saber qué archivos hay. Este índice es esa
// lista: unos pocos kB frente a los MB del corpus, para que el menú se pueble
// sin descargar planillas que quizá no se abran.
//
// Dos carpetas, un índice:
//   public/planillas/          los ejemplos del blog (clase `ejemplo`)
//   public/biblioteca/<disc>/  las genéricas de la biblioteca (clase `generica`)
//
// Y dos archivos de salida, porque tienen dos lectores distintos:
//   public/planillas-indice.json    todo, para el catálogo de la aplicación
//   public/biblioteca-indice.json   solo la biblioteca, para el harness, que
//                                   instancia genéricas y compara su sha256
//
// Se ejecuta desde `npm run dev` y `npm run build`, de modo que no puede quedar
// desfasado respecto a los archivos. Falla si dos planillas comparten slug.
//
//   npm run indice:planillas

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const EJEMPLOS = path.join(ROOT, 'public', 'planillas');
const BIBLIOTECA = path.join(ROOT, 'public', 'biblioteca');
// Fuera de las carpetas de planillas a propósito: `verify-planilla.mjs` las
// recorre enteras dando por hecho que todo lo que hay dentro es una hoja.
const SALIDA = path.join(ROOT, 'public', 'planillas-indice.json');
const SALIDA_BIBLIOTECA = path.join(ROOT, 'public', 'biblioteca-indice.json');

/**
 * La disciplina: `meta.disciplina` si está, y si no la ruta del post que
 * documenta la planilla (`.../content/<disciplina>/ejemplo-<slug>.mdx`).
 */
function disciplinaDe(meta) {
  if (typeof meta?.disciplina === 'string' && meta.disciplina) return meta.disciplina;
  const m = /content\/([a-z]+)\//.exec(meta?.ficha ?? '');
  return m ? m[1] : 'otros';
}

async function archivosJson(dir, recursivo) {
  let entradas;
  try {
    entradas = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entradas.sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && recursivo) out.push(...(await archivosJson(p, true)));
    else if (e.isFile() && e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

const entradas = [];
const porSlug = new Map();
let fallas = 0;

for (const [dir, claseCarpeta, recursivo] of [
  [EJEMPLOS, 'ejemplo', false],
  [BIBLIOTECA, 'generica', true],
]) {
  for (const archivo of await archivosJson(dir, recursivo)) {
    const rel = path.relative(ROOT, archivo).split(path.sep).join('/');
    let crudo;
    let datos;
    try {
      crudo = await readFile(archivo);
      datos = JSON.parse(crudo.toString('utf8'));
    } catch (err) {
      console.error(`  ✗ ${rel}: JSON inválido — ${err.message}`);
      fallas += 1;
      continue;
    }
    if (!Array.isArray(datos.regions)) {
      console.error(`  ✗ ${rel}: no tiene "regions"`);
      fallas += 1;
      continue;
    }
    const meta = datos.meta ?? {};
    const slug = meta.slug ?? path.basename(archivo, '.json');
    if (porSlug.has(slug)) {
      console.error(`  ✗ ${rel}: el slug «${slug}» ya lo usa ${porSlug.get(slug)}`);
      fallas += 1;
      continue;
    }
    porSlug.set(slug, rel);
    const clase = meta.clase ?? claseCarpeta;
    if (clase !== claseCarpeta) {
      console.error(`  ✗ ${rel}: declara clase «${clase}» pero está en la carpeta de «${claseCarpeta}»`);
      fallas += 1;
      continue;
    }
    const nEntradas = Array.isArray(meta.entradas) ? meta.entradas.length : 0;
    const nSalidas = Array.isArray(meta.salidas) ? meta.salidas.length : 0;
    entradas.push({
      slug,
      // Sin título se cae al slug: el menú siempre tiene algo que mostrar.
      titulo: meta.titulo?.trim() || slug,
      clase,
      disciplina: disciplinaDe(meta),
      // Ruta servida, con la barra inicial que espera un `fetch` del sitio.
      ruta: '/' + rel.replace(/^public\//, ''),
      regiones: datos.regions.length,
      normas: Array.isArray(meta.normas) ? meta.normas.map((n) => n.clave).filter(Boolean) : [],
      entradas: nEntradas,
      salidas: nSalidas,
      promovible: clase === 'generica' && nEntradas > 0 && nSalidas > 0,
      sha256: createHash('sha256').update(crudo).digest('hex'),
      ...(meta.resumen ? { resumen: meta.resumen } : {}),
    });
  }
}

if (fallas) process.exitCode = 1;

await writeFile(SALIDA, JSON.stringify({ version: 2, planillas: entradas }, null, 2) + '\n');
const biblioteca = entradas.filter((e) => e.clase === 'generica');
await writeFile(SALIDA_BIBLIOTECA, JSON.stringify({ version: 1, planillas: biblioteca }, null, 2) + '\n');

const porDisciplina = entradas.reduce((acc, e) => {
  acc[e.disciplina] = (acc[e.disciplina] ?? 0) + 1;
  return acc;
}, {});
const resumen = Object.entries(porDisciplina)
  .map(([k, v]) => `${k} ${v}`)
  .join(' · ');
console.log(
  `indice: ${entradas.length} planillas (${resumen}) → ${path.relative(ROOT, SALIDA)}` +
    ` · biblioteca: ${biblioteca.length} → ${path.relative(ROOT, SALIDA_BIBLIOTECA)}`,
);
