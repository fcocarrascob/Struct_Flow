#!/usr/bin/env node
// Escribe campos del `meta` de una o varias planillas sin tocar sus regiones.
//
//   node scripts/estampar-meta.mjs <planilla.json | carpeta> [...más]
//        [--clase generica|instancia|ejemplo] [--slug-del-archivo]
//        [--disciplina-de-ficha] [--patch <archivo.json>] [--set clave=valor ...]
//
//   --clase               fija `meta.clase`.
//   --slug-del-archivo    `meta.slug` = nombre del archivo sin `.json`.
//   --disciplina-de-ficha `meta.disciplina` desde la ruta de `meta.ficha`
//                         (`.../content/<disciplina>/...`), como hacía el índice.
//   --patch <json>        un objeto que se fusiona sobre `meta` (clave a clave;
//                         un valor `null` borra la clave).
//   --set clave=valor     un campo suelto; el valor se parsea como JSON si puede.
//
// Es la única manera prevista de estampar en lote (las 33 del blog como
// `ejemplo`) o de completar a mano el `meta` de una genérica a partir de un
// archivo de parche, sin abrir el JSON de cientos de regiones en un editor.
// La sangría del archivo se conserva para que el diff sea solo el `meta`.

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
function opcion(nombre) {
  const i = args.indexOf(nombre);
  return i === -1 ? null : args[i + 1];
}
const CON_VALOR = new Set(['--clase', '--patch', '--set']);
const objetivos = args.filter((a, i) => !a.startsWith('--') && !CON_VALOR.has(args[i - 1]));
const clase = opcion('--clase');
const slugDelArchivo = args.includes('--slug-del-archivo');
const disciplinaDeFicha = args.includes('--disciplina-de-ficha');
const patchRuta = opcion('--patch');
const sets = args.flatMap((a, i) => (a === '--set' ? [args[i + 1]] : []));

if (objetivos.length === 0) {
  console.error('Uso: node scripts/estampar-meta.mjs <planilla.json | carpeta> [--clase …] [--slug-del-archivo] [--disciplina-de-ficha] [--patch <json>] [--set k=v]');
  process.exit(2);
}

const patch = patchRuta ? JSON.parse(await readFile(path.resolve(patchRuta), 'utf8')) : {};
for (const s of sets) {
  const i = s.indexOf('=');
  if (i === -1) {
    console.error(`--set espera clave=valor, no «${s}»`);
    process.exit(2);
  }
  const k = s.slice(0, i);
  const v = s.slice(i + 1);
  try {
    patch[k] = JSON.parse(v);
  } catch {
    patch[k] = v;
  }
}

async function resolver(entradas) {
  const rutas = [];
  for (const t of entradas) {
    const abs = path.resolve(t);
    if ((await stat(abs)).isDirectory()) {
      const hijos = (await readdir(abs)).filter((f) => f.endsWith('.json')).sort();
      rutas.push(...hijos.map((f) => path.join(abs, f)));
    } else rutas.push(abs);
  }
  return rutas;
}

function sangria(texto) {
  const m = /\n( +)"/.exec(texto);
  return m ? m[1].length : 2;
}

for (const ruta of await resolver(objetivos)) {
  const texto = await readFile(ruta, 'utf8');
  const hoja = JSON.parse(texto);
  const meta = hoja.meta ?? (hoja.meta = {});
  const cambios = [];

  if (clase) {
    meta.clase = clase;
    cambios.push(`clase=${clase}`);
  }
  if (slugDelArchivo) {
    meta.slug = path.basename(ruta, '.json');
    cambios.push(`slug=${meta.slug}`);
  }
  if (disciplinaDeFicha) {
    const m = /content\/([a-z]+)\//.exec(meta.ficha ?? '');
    meta.disciplina = m ? m[1] : 'otros';
    cambios.push(`disciplina=${meta.disciplina}`);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete meta[k];
    else meta[k] = v;
    cambios.push(k);
  }

  // `titulo` primero y el resto en el orden de llegada: el archivo se lee de
  // arriba abajo y lo primero que hay que ver es de qué trata.
  const { titulo, ...resto } = meta;
  hoja.meta = titulo !== undefined ? { titulo, ...resto } : resto;

  await writeFile(ruta, JSON.stringify(hoja, null, sangria(texto)) + '\n', 'utf8');
  console.log(`${path.basename(ruta)}: ${cambios.join(' · ') || 'sin cambios'}`);
}
