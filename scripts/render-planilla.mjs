#!/usr/bin/env node
// Renderiza una planilla verificada como HTML autocontenido y, si se pide, PDF.
//
//   npm run render:planilla -- <planilla.json> [--html <salida.html>] [--pdf <salida.pdf>]
//                              [--chrome <exe>] [--esquemas <dir>] [--programas visibles|plegados]
//
// Para qué: que un proyecto del harness saque el anexo de una planilla sin
// depender del sitio del blog ni del navegador abierto. El marcado es el mismo
// que el papel del canvas (`render-html.ts` ↔ `BloqueDoc.tsx`) y el CSS es el
// mismo archivo (`src/styles/papel.css`), así que el PDF de aquí y el «Guardar
// como PDF» del navegador se ven igual.
//
// Es un visor, no un motor: los números vienen calculados por el mismo
// `verificarPlanilla` de verify:planilla, y si esa verificación no está en verde
// —una región con error, un ✗ sin declarar— NO se renderiza nada. Una memoria no
// se comparte con un «undefined» adentro; primero se arregla la planilla.
//
// Autocontenido: el CSS de KaTeX va inline con sus fuentes como data URI, y un
// esquema de `/esquemas/` se incrusta como SVG con los tokens ya sustituidos.
// Las tipografías Inter y JetBrains Mono se piden a Google Fonts como en la
// aplicación; sin red, el documento cae a system-ui y monospace.
//
// El PDF lo imprime Chrome sin cabeza con el `@page` de papel.css. Sin `--chrome`
// se usa CHROME del entorno, o la instalación estándar de Windows.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verificarPlanilla, informeConsola, motorCompartido, ROOT } from './lib/planilla.mjs';

const args = process.argv.slice(2);

function opcion(nombre, porDefecto = null) {
  const i = args.indexOf(nombre);
  if (i === -1) return porDefecto;
  const v = args[i + 1];
  if (!v || v.startsWith('--')) {
    console.error(`${nombre} necesita un valor`);
    process.exit(2);
  }
  return v;
}

const CON_VALOR = new Set(['--html', '--pdf', '--chrome', '--esquemas', '--programas']);
const objetivos = args.filter((a, i) => !a.startsWith('--') && !CON_VALOR.has(args[i - 1]));
const salidaHtml = opcion('--html');
const salidaPdf = opcion('--pdf');
const esquemasExtra = opcion('--esquemas');
const programas = opcion('--programas', 'visibles');
const chrome =
  opcion('--chrome') ?? process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

if (objetivos.length !== 1 || (!salidaHtml && !salidaPdf)) {
  console.error(
    'Uso: npm run render:planilla -- <planilla.json> [--html <salida.html>] [--pdf <salida.pdf>] ' +
      '[--chrome <exe>] [--esquemas <dir>] [--programas visibles|plegados]',
  );
  process.exit(2);
}
if (!['visibles', 'plegados'].includes(programas)) {
  console.error('--programas admite «visibles» o «plegados»');
  process.exit(2);
}

const ruta = path.resolve(objetivos[0]);
const v = await verificarPlanilla(ruta, { esquemas: esquemasExtra ? [path.resolve(esquemasExtra)] : [] });
for (const linea of informeConsola(v)) console.log(linea);
if (!v.ok) {
  console.error('La planilla no verifica: no se renderiza. Primero se arregla la planilla.');
  process.exit(1);
}

const { renderHtml, documentoHtml } = await motorCompartido();

const cuerpo = renderHtml(v.regions, v.results, v.meta, { esquemas: v.esquemas, programas });
const css = [
  await cssKatex(),
  await readFile(path.join(ROOT, 'src', 'styles', 'papel.css'), 'utf8'),
  // Fuera del navegador del canvas no hay interfaz que ocultar: el documento se
  // muestra siempre, no solo en @media print.
  'body { margin: 0; background: #fff; } .worksheet-print { display: block; max-width: 180mm; margin: 0 auto; padding: 8mm 0; }',
].join('\n\n');
const extraHead = [
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">',
].join('\n');
const html = documentoHtml({ titulo: v.titulo.split('—')[0].trim(), cuerpo, css, extraHead });

// El HTML siempre se escribe: si no se pidió, va junto al PDF y se conserva —
// es lo que Chrome imprime, y sin él el PDF no se puede reproducir.
const rutaHtml = path.resolve(salidaHtml ?? salidaPdf.replace(/\.pdf$/i, '') + '.html');
await mkdir(path.dirname(rutaHtml), { recursive: true });
await writeFile(rutaHtml, html, 'utf8');
console.log(`  html -> ${path.relative(process.cwd(), rutaHtml)}  (${(html.length / 1024).toFixed(0)} kB)`);

if (salidaPdf) {
  const rutaPdf = path.resolve(salidaPdf);
  if (!existsSync(chrome)) {
    console.error(`No se encuentra Chrome en ${chrome}: pasa --chrome <exe> o define CHROME.`);
    process.exit(1);
  }
  await mkdir(path.dirname(rutaPdf), { recursive: true });
  const r = spawnSync(
    chrome,
    [
      '--headless',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--print-to-pdf=${rutaPdf}`,
      pathToFileURL(rutaHtml).href,
    ],
    { encoding: 'utf8' },
  );
  if (!existsSync(rutaPdf)) {
    console.error(`Chrome no dejó el PDF: ${(r.stderr ?? '').slice(0, 400)}`);
    process.exit(1);
  }
  const kb = (await readFile(rutaPdf)).length / 1024;
  console.log(`  pdf  -> ${path.relative(process.cwd(), rutaPdf)}  (${kb.toFixed(0)} kB)`);
}

/**
 * El CSS de KaTeX con las fuentes incrustadas.
 *
 * Solo woff2, y se descartan los `url(...woff)` y `url(...ttf)` de respaldo:
 * el HTML tiene que valer solo, sin la carpeta `fonts/` al lado. Todo navegador
 * que abra esto lee woff2.
 */
async function cssKatex() {
  const dist = path.join(ROOT, 'node_modules', 'katex', 'dist');
  let css = await readFile(path.join(dist, 'katex.min.css'), 'utf8');
  const fuentes = new Map();
  for (const [, nombre] of css.matchAll(/url\(fonts\/([\w-]+)\.woff2\)/g)) {
    if (fuentes.has(nombre)) continue;
    const buf = await readFile(path.join(dist, 'fonts', `${nombre}.woff2`));
    fuentes.set(nombre, `data:font/woff2;base64,${buf.toString('base64')}`);
  }
  // Se reescribe el `src:` entero de cada @font-face, no solo la primera URL:
  // así los respaldos desaparecen en la misma pasada.
  css = css.replace(/src:url\(fonts\/([\w-]+)\.woff2\) format\("woff2"\)[^;}]*/g, (todo, nombre) => {
    const uri = fuentes.get(nombre);
    return uri ? `src:url(${uri}) format("woff2")` : todo;
  });
  return css;
}
