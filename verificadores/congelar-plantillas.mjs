#!/usr/bin/env node
// Congela la plantilla de hoy de cada vista que tiene una.
//
//   npm run plantillas:congelar
//
// Una base armada guarda la huella de la plantilla con que se armó, y el botón
// «actualizar a la plantilla de hoy» necesita esa versión para saber qué cambió
// y qué editó el ingeniero. Este script la escribe en
// `src/proyecto/vistas/<carpeta>/versiones/<huella>.json` si falta, y regenera el
// `indice.ts` de esa carpeta con todas, de la más vieja a la más nueva.
//
// Se niega si un bloque de la plantilla de hoy cambió de id respecto de la última
// congelada (`corrimientos`): una base armada antes quedaría con el texto
// equivocado bajo cada id. Se arregla dándole `id` al bloque agregado.
//
// Vive fuera de `scripts/` por la misma razón que `verify:obra`: no resella el motor.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compilarEntrada, ROOT } from '../scripts/lib/motor.mjs';

const { VISTAS, huellaDePlantilla, corrimientos } = await compilarEntrada('src/proyecto/obra/engine.ts');

/** Por vista: su carpeta y el nombre de la constante que exporta su índice. */
const CARPETAS = {
  'base-columna': { carpeta: 'base-columna', exporta: 'VERSIONES_BASE_COLUMNA' },
};

let fallo = false;
for (const [id, def] of Object.entries(VISTAS)) {
  if (!def.plantilla) continue;
  const destino = CARPETAS[id];
  if (!destino) {
    console.error(`✗ ${id}: tiene plantilla y no tiene carpeta de versiones en CARPETAS.`);
    fallo = true;
    continue;
  }
  const dir = path.join(ROOT, 'src/proyecto/vistas', destino.carpeta, 'versiones');
  await mkdir(dir, { recursive: true });
  const versiones = [];
  for (const archivo of (await readdir(dir)).filter((a) => a.endsWith('.json'))) {
    versiones.push(JSON.parse(await readFile(path.join(dir, archivo), 'utf8')));
  }
  versiones.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const huella = huellaDePlantilla(def.plantilla);
  if (!versiones.some((v) => v.version === huella)) {
    const ultima = versiones.at(-1);
    const corridos = ultima ? corrimientos(ultima.plantilla, def.plantilla) : [];
    if (corridos.length) {
      console.error(`✗ ${id}: no se congela, hay bloques que cambiaron de id:\n  ${corridos.join('\n  ')}`);
      fallo = true;
      continue;
    }
    const v = { version: huella, fecha: new Date().toISOString(), plantilla: def.plantilla };
    if (huellaDePlantilla(JSON.parse(JSON.stringify(v.plantilla))) !== huella) {
      console.error(`✗ ${id}: la plantilla no sobrevive a JSON con la misma huella (¿un valor undefined?).`);
      fallo = true;
      continue;
    }
    await writeFile(path.join(dir, `${huella}.json`), JSON.stringify(v, null, 2) + '\n', 'utf8');
    versiones.push(v);
    console.log(`✓ ${id}: congelada ${huella}`);
  } else {
    console.log(`· ${id}: ${huella} ya estaba congelada`);
  }
  const lineas = [
    '// Generado por `npm run plantillas:congelar`: no editar a mano.',
    '//',
    `// Las versiones congeladas de la plantilla de «${def.titulo}», de la más vieja`,
    '// a la más nueva. Una base armada guarda la huella de la suya, y actualizarla es',
    '// la diferencia entre esa y la de hoy (`actualizarBase` de `obra/ensamble.ts`).',
    '',
    "import type { VersionPlantilla } from '../../../obra/ensamble';",
    ...versiones.map((v, i) => `import v${i} from './${v.version}.json';`),
    '',
    `export const ${destino.exporta}: readonly VersionPlantilla[] = [${versiones.map((_, i) => `v${i}`).join(', ')}] as unknown as VersionPlantilla[];`,
    '',
  ];
  await writeFile(path.join(dir, 'indice.ts'), lineas.join('\n'), 'utf8');
}
process.exit(fallo ? 1 : 0);
