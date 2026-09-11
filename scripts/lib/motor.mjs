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
import { readdir, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

/**
 * El mismo `import.meta.env.VITE_COMMIT` que inyecta `vite.config.ts`: sin él,
 * una memoria exportada desde Node llevaría `commit: desconocido` y la del
 * navegador el HEAD, y serían dos hojas distintas para el mismo caso.
 */
function commitActual() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'desconocido';
  }
}

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

/**
 * Los módulos declarativos: uno por genérica promovible de `public/biblioteca/`
 * (clase `generica` con entradas y salidas, el mismo criterio que el índice).
 * Devuelve `{ modulos, fallas }`: una genérica que no arma módulo es un fallo
 * que el verificador tiene que contar, no una excepción que lo tumbe.
 */
export async function cargarModulosBiblioteca() {
  const { moduloDeBiblioteca } = await cargarModulosDiseno();
  const modulos = [];
  const fallas = [];
  for (const archivo of await jsonsBajo(path.join(ROOT, 'public', 'biblioteca'))) {
    const crudo = await readFile(archivo);
    let hoja;
    try {
      hoja = JSON.parse(crudo.toString('utf8'));
    } catch (err) {
      fallas.push({ archivo, error: `JSON inválido: ${err.message}` });
      continue;
    }
    const m = hoja?.meta ?? {};
    if (m.clase !== 'generica' || !m.entradas?.length || !m.salidas?.length) continue;
    try {
      const sha256 = createHash('sha256').update(crudo).digest('hex');
      modulos.push(moduloDeBiblioteca(hoja, { sha256 }));
    } catch (err) {
      fallas.push({ archivo, error: err.message });
    }
  }
  return { modulos, fallas };
}

async function jsonsBajo(dir) {
  let entradas;
  try {
    entradas = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entradas.sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await jsonsBajo(p)));
    else if (e.isFile() && e.name.endsWith('.json')) out.push(p);
  }
  return out;
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
    define: { 'import.meta.env.VITE_COMMIT': JSON.stringify(commitActual()) },
  });
  const mod = await import(pathToFileURL(out).href);
  await rm(out, { force: true });
  return mod;
}

export { ROOT };
