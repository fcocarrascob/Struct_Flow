// El motor del canvas, compilado para Node.
//
// Lo comparten `verify-planilla.mjs` y `verify-modulos.mjs`: los dos necesitan
// evaluar una hoja exactamente como la evalúa el navegador, y una segunda copia
// de este paso es una forma silenciosa de que dejen de coincidir.
//
// El punto de entrada es `src/lib/planilla-engine.ts` y no `worksheet.ts` a
// propósito: hoja y esquema tienen que compartir la MISMA instancia de mathjs.
// Las unidades locales (`tonf`) y los objetos Unit que viven en el scope no
// sobreviven a dos instancias distintas.

import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Una compilación por entrada y por proceso, aunque se pida varias veces. */
const cache = new Map();

/**
 * Compila un módulo TypeScript del proyecto y lo devuelve importado.
 *
 * Cualquier entrada que se compile aparte NO debe importar mathjs, o habría dos
 * instancias en el mismo proceso; ver el comentario de `src/lib/diseno/engine.ts`.
 */
export function compilarEntrada(rel) {
  if (!cache.has(rel)) cache.set(rel, compilar(rel));
  return cache.get(rel);
}

/**
 * El motor. Exporta `evaluateSheet`, `parseMathRegion`, `renderEsquema` y
 * `ESQUEMAS_PREFIX`.
 */
export function cargarMotor() {
  return compilarEntrada('src/lib/planilla-engine.ts');
}

/** El catálogo de módulos de diseño más `layout` y `verificarSimbolos`. */
export function cargarModulosDiseno() {
  return compilarEntrada('src/lib/diseno/engine.ts');
}

let contador = 0;

async function compilar(rel) {
  const out = path.join(tmpdir(), `structflow-${process.pid}-${contador++}.mjs`);
  await build({
    entryPoints: [path.join(ROOT, rel)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: out,
    logLevel: 'error',
  });
  const mod = await import(pathToFileURL(out).href);
  await rm(out, { force: true });
  return mod;
}

export { ROOT };
