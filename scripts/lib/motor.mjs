// El motor del canvas, compilado para Node.
//
// Lo comparten `verify-planilla.mjs` y `render-planilla-artifact.mjs`: los dos
// necesitan evaluar una hoja exactamente como la evalúa el navegador, y una
// segunda copia de este paso es una forma silenciosa de que dejen de coincidir.
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

/** Una sola compilación por proceso, aunque se pida varias veces. */
let cache;

/**
 * Compila el motor (TypeScript) a un módulo importable y lo devuelve.
 * Exporta `evaluateSheet`, `parseMathRegion`, `renderEsquema` y `ESQUEMAS_PREFIX`.
 */
export function cargarMotor() {
  if (!cache) cache = compilar();
  return cache;
}

async function compilar() {
  const out = path.join(tmpdir(), `worksheet-engine-${process.pid}.mjs`);
  await build({
    entryPoints: [path.join(ROOT, 'src/lib/planilla-engine.ts')],
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
