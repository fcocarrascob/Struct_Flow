// La huella del corpus: lo que el motor calcula para cada hoja publicada.
//
//   node scripts/huella-motor.mjs [--salida <archivo.json>] [--comparar <base.json>]
//
// Evalúa `public/planillas` y `public/biblioteca` con el mismo motor que corre en
// el navegador y resume cada región en lo que se ve de ella: su LaTeX, su error,
// su aviso, su veredicto y las celdas de una tabla. Con `--comparar` lista qué
// regiones cambiaron respecto de una huella anterior.
//
// Es la medición de «antes y después» de todo endurecimiento del motor: un cambio
// que convierte un número falso en un error tiene que decir cuántas regiones del
// corpus toca, y cuáles, antes de decidir si se adopta. `verify:planillas` solo
// dice si algo falla; esto dice qué cambió aunque nada falle.
//
// Las hojas se evalúan siempre en el mismo orden (el alfabético de su ruta): el
// motor tiene estado de proceso (la caché de árboles, las unidades de math.js), y
// una huella que dependiera del orden no serviría para comparar.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { cargarMotor } from './lib/motor.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CARPETAS = ['public/planillas', 'public/biblioteca'];

function argumento(nombre) {
  const i = process.argv.indexOf(nombre);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function jsonDe(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await jsonDe(ruta)));
    else if (e.name.endsWith('.json')) out.push(ruta);
  }
  return out;
}

/** Lo que se ve de una región evaluada: sin el scope, que no se imprime. */
function resumen(res = {}) {
  const r = {};
  for (const k of ['tex', 'error', 'aviso', 'bool', 'defined']) if (res[k] !== undefined) r[k] = res[k];
  if (res.tabla) r.tabla = res.tabla;
  if (res.grafico) r.grafico = res.grafico;
  if (res.defines) r.defines = res.defines;
  if (res.define) r.define = res.define;
  return r;
}

const hash = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);

const { evaluateSheet } = await cargarMotor();

const rutas = [];
for (const c of CARPETAS) rutas.push(...(await jsonDe(path.join(ROOT, c))));
rutas.sort();

const huella = {};
for (const ruta of rutas) {
  const hoja = JSON.parse(await readFile(ruta, 'utf8'));
  if (!Array.isArray(hoja.regions)) continue; // índices u otros JSON que no son hojas
  const results = evaluateSheet(hoja.regions);
  const regiones = {};
  for (const r of hoja.regions) regiones[r.id] = resumen(results[r.id]);
  const rel = path.relative(ROOT, ruta).replaceAll('\\', '/');
  huella[rel] = {
    hash: hash(regiones),
    errores: Object.values(regiones).filter((x) => x.error).length,
    avisos: Object.values(regiones).filter((x) => x.aviso).length,
    falsos: Object.values(regiones).filter((x) => x.bool === false).length,
    regiones,
  };
}

const total = hash(Object.fromEntries(Object.entries(huella).map(([k, v]) => [k, v.hash])));
console.log(`${Object.keys(huella).length} hojas · huella ${total}`);

const salida = argumento('--salida');
if (salida) {
  await writeFile(salida, JSON.stringify({ total, hojas: huella }, null, 1));
  console.log(`escrita en ${salida}`);
}

const base = argumento('--comparar');
if (base) {
  const antes = JSON.parse(await readFile(base, 'utf8')).hojas;
  const corto = (x) => {
    const s = JSON.stringify(x);
    return s.length > 240 ? `${s.slice(0, 240)}…` : s;
  };
  let cambios = 0;
  for (const [rel, h] of Object.entries(huella)) {
    const a = antes[rel];
    if (!a) {
      console.log(`\n+ ${rel} (nueva)`);
      continue;
    }
    if (a.hash === h.hash) continue;
    console.log(`\n~ ${rel}`);
    for (const [id, r] of Object.entries(h.regiones)) {
      const ra = a.regiones[id];
      if (JSON.stringify(ra) === JSON.stringify(r)) continue;
      cambios += 1;
      console.log(`  ${id}\n    antes:   ${corto(ra)}\n    despues: ${corto(r)}`);
    }
  }
  for (const rel of Object.keys(antes)) if (!huella[rel]) console.log(`\n- ${rel} (ya no está)`);
  console.log(`\n${cambios} regiones cambiaron`);
  process.exitCode = cambios ? 1 : 0;
}
