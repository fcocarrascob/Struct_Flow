#!/usr/bin/env node
// Prepara una planilla para la biblioteca: le pone ids estables a las entradas
// y nombre a los veredictos, y esboza `meta.entradas`.
//
//   node scripts/promover-entradas.mjs <planilla.json> [--escribir]
//
// Sin `--escribir` solo informa. Con él, reescribe el archivo:
//
//   1. Toda región `math` dentro de un bloque `DATOS` cuyo `src` tenga la forma
//      «nombre := número [unidad]» pasa a tener id `in_<nombre>`. Es la
//      convención del contrato (src/lib/biblioteca/contrato.ts): lo que hace
//      que un formulario o el instanciador del harness sepan qué reemplazar.
//   2. Toda región cuyo id empieza por `v_` y cuyo `src` es una comparación sin
//      nombre («u_max <= 1 =») pasa a definir una variable booleana con ese
//      nombre («v_global := u_max <= 1 =»). Un veredicto tiene que ser una
//      variable del scope para que un módulo lo lea por nombre.
//   3. `meta.entradas` gana una entrada por cada `in_*` que no tuviera: el
//      grupo sale del encabezado del bloque DATOS, la unidad del `src`, y la
//      etiqueta queda igual al nombre — ES UN ESBOZO, para completar a mano:
//      la etiqueta y la ayuda son prosa que el script no puede inventar. Si el
//      párrafo de texto anterior nombra la variable, va como `ayuda` de partida.
//
// Las referencias de `meta.esperadoFalso` a ids renombrados se actualizan.
// No toca ningún otro id ni ningún `src` de cálculo: no cambia lo que la hoja
// calcula, solo cómo se la puede identificar desde fuera.
//
// Un bloque DATOS es lo que hay entre un encabezado que contiene «DATOS» y el
// siguiente encabezado que no lo contiene.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { motorCompartido } from './lib/planilla.mjs';

const args = process.argv.slice(2);
const escribir = args.includes('--escribir');
const objetivos = args.filter((a) => !a.startsWith('--'));
if (objetivos.length === 0) {
  console.error('Uso: node scripts/promover-entradas.mjs <planilla.json> [...más] [--escribir]');
  process.exit(2);
}

const { ordenDeLectura, RE_ENTRADA, PREFIJO_ENTRADA, nivelEncabezado, textoEncabezado } =
  await motorCompartido();

/** La sangría con la que está escrito el archivo, para no reescribirlo entero. */
function sangria(texto) {
  const m = /\n( +)"/.exec(texto);
  return m ? m[1].length : 2;
}

function nombreDeGrupo(encabezado) {
  // «DATOS · SOLICITACIONES MAYORADAS» → «Solicitaciones mayoradas»
  const sin = encabezado.replace(/^DATOS\s*[·:\-—]?\s*/i, '').trim();
  if (!sin) return 'Datos';
  const bajo = sin.toLowerCase();
  return bajo.charAt(0).toUpperCase() + bajo.slice(1);
}

let fallas = 0;
for (const objetivo of objetivos) {
  const ruta = path.resolve(objetivo);
  const texto = await readFile(ruta, 'utf8');
  const hoja = JSON.parse(texto);
  const regions = hoja.regions ?? [];
  const meta = hoja.meta ?? (hoja.meta = {});
  const ordenadas = ordenDeLectura(regions);

  const renombres = new Map(); // id viejo → id nuevo
  const nuevas = [];
  const existentes = new Set((meta.entradas ?? []).map((e) => e.nombre));
  const vistas = new Set();
  let bloque = null;
  let textoPrevio = null;
  let veredictosNombrados = 0;

  for (const r of ordenadas) {
    if (r.kind === 'text') {
      const nivel = nivelEncabezado(r);
      if (nivel > 0) {
        const t = textoEncabezado(r);
        bloque = /DATOS/i.test(t) ? nombreDeGrupo(t) : null;
        textoPrevio = null;
      } else if (r.src.trim()) {
        textoPrevio = r.src.trim();
      }
      continue;
    }
    if (r.kind === 'math' && r.id.startsWith('v_') && !r.src.includes(':=')) {
      r.src = `${r.id} := ${r.src.trim()}`;
      veredictosNombrados += 1;
    }
    if (r.kind !== 'math' || !bloque) continue;
    const m = RE_ENTRADA.exec(r.src);
    if (!m) continue;
    const nombre = m[1];
    if (r.id.startsWith('v_')) continue;
    if (vistas.has(nombre)) {
      console.log(`  [AVISO] «${nombre}» está declarada dos veces en bloques DATOS; se deja la primera`);
      continue;
    }
    vistas.add(nombre);
    const idNuevo = PREFIJO_ENTRADA + nombre;
    if (r.id !== idNuevo) {
      renombres.set(r.id, idNuevo);
      r.id = idNuevo;
    }
    if (!existentes.has(nombre)) {
      const campo = { nombre, etiqueta: nombre, grupo: bloque };
      if (m[3]) campo.unidad = m[3];
      if (textoPrevio && new RegExp(`(^|[^A-Za-z0-9_])${nombre}([^A-Za-z0-9_]|$)`).test(textoPrevio)) {
        campo.ayuda = textoPrevio.replace(/\s*\n\s*/g, ' ');
      }
      nuevas.push(campo);
    }
  }

  // Ids duplicados: un `in_x` nuevo no puede chocar con una región que ya se
  // llamaba así por otra razón.
  const ids = new Map();
  for (const r of regions) ids.set(r.id, (ids.get(r.id) ?? 0) + 1);
  const duplicados = [...ids].filter(([, n]) => n > 1).map(([id]) => id);
  if (duplicados.length) {
    console.error(`  [ERROR] ${path.basename(ruta)}: ids duplicados tras renombrar: ${duplicados.join(', ')}`);
    fallas += 1;
    continue;
  }

  if (meta.esperadoFalso) {
    const nuevo = {};
    for (const [k, v] of Object.entries(meta.esperadoFalso)) nuevo[renombres.get(k) ?? k] = v;
    meta.esperadoFalso = nuevo;
  }
  if (nuevas.length) meta.entradas = [...(meta.entradas ?? []), ...nuevas];

  console.log(
    `${path.basename(ruta)}: ${renombres.size} entradas renombradas a in_* · ` +
      `${nuevas.length} entradas nuevas en meta · ${veredictosNombrados} veredictos con nombre` +
      (escribir ? '  (escrito)' : '  (solo informe; usa --escribir)'),
  );
  for (const c of nuevas) {
    console.log(`    ${c.nombre}${c.unidad ? ' [' + c.unidad + ']' : ''}  · ${c.grupo}${c.ayuda ? '  · ayuda de partida' : ''}`);
  }

  if (escribir) {
    await writeFile(ruta, JSON.stringify(hoja, null, sangria(texto)) + '\n', 'utf8');
  }
}
process.exit(fallas ? 1 : 0);
