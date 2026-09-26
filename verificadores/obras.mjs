#!/usr/bin/env node
// Los invariantes de cadena sobre las obras que hay en disco.
//
//   npm run verify:obras                 # todas las de obras/ (o STRUCTFLOW_OBRAS)
//   npm run verify:obras -- <id> [<id>]  # solo esas
//
// `verify:obra` prueba el modelo con obras mínimas; esto mira las de verdad, con las
// genéricas de hoy. Es lo que habría dicho, antes de abrir el lienzo, que una base
// del Pachón no recibía lo que su plantilla nueva publicaba. Solo lee: no toma el
// candado ni escribe nada.
//
// Falla (código 1) si alguna obra tiene un invariante en error o una región con
// error; los avisos se listan y no hacen fallar.

import { compilarEntrada } from '../scripts/lib/motor.mjs';
import { crearObras, raizPorDefecto } from '../servidor/obras.mjs';
import { cargarGenericas } from './lib/genericas.mjs';

const M = await compilarEntrada('src/proyecto/obra/engine.ts');

// Las genéricas de la biblioteca, con el mismo sha256 de bytes que la aplicación.
const { genericas } = await cargarGenericas(M);

const obras = crearObras(raizPorDefecto());
const pedidas = process.argv.slice(2);
const ids = pedidas.length ? pedidas : (await obras.listar()).map((o) => o.id);

let fallas = 0;
for (const id of ids) {
  const { archivos } = await obras.leer(id);
  const union = M.unirObra(archivos);
  if (!union.crudo) {
    console.log(`[FALLA] ${id}: ${union.problemas.join('; ')}`);
    fallas++;
    continue;
  }
  const obra = M.sanearObra(union.crudo);
  const ev = M.evaluarObra(obra, genericas);
  const inv = M.invariantesDeObra(obra, ev, genericas);
  const errores = Object.entries(ev.results).filter(([, r]) => r.error);
  const graves = inv.filter((x) => x.severidad === 'error');
  const estado = graves.length || errores.length ? 'FALLA' : inv.length ? 'AVISO' : ' OK  ';
  console.log(`[${estado}] ${id} — ${obra.calculos.length} nodos · ${graves.length} invariante(s) en error · ${inv.length - graves.length} aviso(s) · ${errores.length} región(es) con error`);
  for (const x of inv) console.log(`        ${x.severidad === 'error' ? '✗' : '·'} ${x.nodo}: ${x.motivo}`);
  for (const [rid, r] of errores.slice(0, 5)) console.log(`        ✗ región ${rid}: ${r.error}`);
  if (graves.length || errores.length) fallas++;
}
console.log(fallas ? `\nFALLA: ${fallas} de ${ids.length} obras.` : `\nOK: ${ids.length} obras.`);
process.exit(fallas ? 1 : 0);
