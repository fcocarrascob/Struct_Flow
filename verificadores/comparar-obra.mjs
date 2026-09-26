#!/usr/bin/env node
// Corre en seco un cambio sobre una obra en disco y dice qué cambia, en números.
//
//   npm run obra:comparar -- <id> --con <carpeta | obra.json>
//   npm run obra:comparar -- <id> --actualizar-plantilla [<id de la vista>]
//
//   opciones:
//     --proponer            deja la propuesta en el servidor de obras, para que el
//                           usuario la vea en la pestaña abierta y la acepte o no
//     --titulo "…"          el título de la propuesta (obligatorio con --proponer)
//     --nota "…"            por qué se propone; queda en la marca «Revisar»
//     --guardar <carpeta>   escribe la obra propuesta en esa carpeta, para mirarla
//
// Es la herramienta del asistente: lo que antes eran scripts sueltos para cada
// cambio del Pachón (correr en seco, imprimir la tabla antes/después) con la
// misma comparación que el diálogo de la aplicación (`src/proyecto/obra/propuesta.ts`).
// No toma el candado ni escribe la obra: proponer deja un archivo en
// `_propuestas/` que solo se aplica si el usuario lo acepta.
//
// Vive fuera de `scripts/` por el sello del motor (ver `verificadores/obra.mjs`).

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compilarEntrada } from '../scripts/lib/motor.mjs';
import { crearObras, raizPorDefecto } from '../servidor/obras.mjs';
import { cargarGenericas } from './lib/genericas.mjs';

const args = process.argv.slice(2);
const opcion = (nombre) => {
  const i = args.indexOf(nombre);
  if (i < 0) return undefined;
  const v = args[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const id = args[0];
if (!id || id.startsWith('--')) {
  console.error('Uso: npm run obra:comparar -- <id> (--con <carpeta|obra.json> | --actualizar-plantilla [<vista>]) [--proponer --titulo "…" --nota "…"] [--guardar <carpeta>]');
  process.exit(2);
}

const M = await compilarEntrada('src/proyecto/obra/engine.ts');
const { genericas, sellos } = await cargarGenericas(M);
const obras = crearObras(raizPorDefecto());
const { version, archivos } = await obras.leer(id);
const union = M.unirObra(archivos);
const antes = union.crudo && M.sanearObra(union.crudo);
if (!antes) {
  console.error(`No se pudo leer la obra «${id}»: ${union.problemas.join('; ')}`);
  process.exit(1);
}

/** Una obra desde una carpeta (`obra.json` + `hojas/`) o un JSON exportado. */
async function leerObraDe(ruta) {
  if ((await stat(ruta)).isDirectory()) {
    const a = { 'obra.json': await readFile(path.join(ruta, 'obra.json'), 'utf8') };
    try {
      for (const n of await readdir(path.join(ruta, 'hojas'))) a[`hojas/${n}`] = await readFile(path.join(ruta, 'hojas', n), 'utf8');
    } catch {
      // Sin hojas.
    }
    const u = M.unirObra(a);
    if (!u.crudo) throw new Error(u.problemas.join('; '));
    return M.sanearObra(u.crudo);
  }
  const datos = JSON.parse(await readFile(ruta, 'utf8'));
  return M.sanearObra(datos?.obra ?? datos);
}

let despues;
const avisos = [];
const con = opcion('--con');
const plantilla = opcion('--actualizar-plantilla');
if (typeof con === 'string') {
  despues = await leerObraDe(con);
  if (!despues || despues.id !== id) {
    console.error(`«${con}» no es una versión de la obra «${id}».`);
    process.exit(1);
  }
} else if (plantilla) {
  despues = antes;
  const vistas = antes.calculos.filter((k) => k.frontera?.ensamble && (plantilla === true || k.id === plantilla));
  if (!vistas.length) {
    console.error(plantilla === true ? 'La obra no tiene bases armadas.' : `No hay una vista armada «${plantilla}».`);
    process.exit(1);
  }
  for (const v of vistas) {
    const r = M.actualizarBase(despues, v.id, sellos, M.nuevoId);
    if (r.error) {
      avisos.push(`${v.nombre}: ${r.error}`);
      continue;
    }
    despues = r.obra;
    for (const c of r.conservados) avisos.push(`${v.nombre}: se queda como está, porque se editó: ${c}`);
    for (const q of r.quitados) avisos.push(`${v.nombre}: se quita ${q}`);
  }
} else {
  console.error('Falta --con <carpeta|obra.json> o --actualizar-plantilla.');
  process.exit(2);
}

for (const a of avisos) console.log(`! ${a}`);
const c = M.compararObras(antes, despues, genericas);
console.log(M.comparacionEnTexto(c));

const guardar = opcion('--guardar');
if (typeof guardar === 'string') {
  const partes = M.partirObra(despues);
  for (const [ruta, texto] of Object.entries(partes)) {
    await mkdir(path.dirname(path.join(guardar, ruta)), { recursive: true });
    await writeFile(path.join(guardar, ruta), texto, 'utf8');
  }
  console.log(`\nObra propuesta escrita en ${guardar}.`);
}

if (opcion('--proponer')) {
  const titulo = opcion('--titulo');
  if (typeof titulo !== 'string') {
    console.error('\n--proponer necesita --titulo "…".');
    process.exit(2);
  }
  if (c.sinCambios) {
    console.log('\nNo se propone: no cambia nada.');
    process.exit(0);
  }
  const nota = [typeof opcion('--nota') === 'string' ? opcion('--nota') : '', ...avisos].filter(Boolean).join('\n');
  const { n } = await obras.proponer(id, { autor: 'asistente', titulo, nota, base: version, archivos: M.partirObra(despues) });
  console.log(`\nPropuesta ${n} en espera: la pestaña abierta la muestra en su próximo latido.`);
}
