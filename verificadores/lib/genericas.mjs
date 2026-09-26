// Las genéricas de `public/biblioteca/`, como las arma la aplicación: módulo
// declarativo con el sha256 de los bytes del archivo. Lo comparten los
// verificadores y las herramientas de Node que evalúan obras.

import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ROOT } from '../../scripts/lib/motor.mjs';

/** `M` es el bundle de `src/proyecto/obra/engine.ts`. Devuelve `{ genericas, sellos }`. */
export async function cargarGenericas(M) {
  const genericas = {};
  const sellos = {};
  async function recorrer(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await recorrer(p);
      else if (e.name.endsWith('.json')) {
        const crudo = await readFile(p);
        const hoja = JSON.parse(crudo.toString('utf8'));
        if (hoja?.meta?.clase !== 'generica') continue;
        const sha256 = createHash('sha256').update(crudo).digest('hex');
        const modulo = M.moduloDeBiblioteca(hoja, { sha256 });
        genericas[modulo.id] = { fase: 'lista', modulo };
        sellos[modulo.id] = sha256;
      }
    }
  }
  await recorrer(path.join(ROOT, 'public', 'biblioteca'));
  return { genericas, sellos };
}
