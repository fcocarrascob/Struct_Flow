#!/usr/bin/env node
// Pruebas mínimas de interfaz: lo que se ve en la aplicación contra lo que el
// modelo calcula en Node.
//
//   npm run verify:interfaz            # una vez: npx playwright install chromium
//
// Salió de la revisión de las bases del Pachón (2026-09-25): la interfaz mostró
// defectos que ningún verificador veía —un mensaje de mathjs en inglés en una
// ficha, un punto faltante, un dibujo distinto del que el modelo decía—. Aquí se
// abre la aplicación de verdad (Vite + Chromium sin ventana) sobre COPIAS de las
// obras, en una carpeta temporal: nunca toma el candado de las reales ni las
// escribe.
//
// Qué se comprueba:
//   1. Cada nodo de cálculo del lienzo tiene la severidad y el veredicto que da
//      `proyectar` en Node para la misma obra (`data-severidad`, `data-veredicto`).
//   2. Ni el lienzo ni la ficha de cada nodo muestran un mensaje crudo del motor.
//   3. El dibujo de cada vista (en su pestaña) es byte a byte el del modelo, y marca en rojo
//      tantas verificaciones como fallan.
//   4. «actualizar a la plantilla de hoy» en una base atrasada abre la propuesta,
//      y aceptarla respalda la obra y la deja al día.
//   5. Una propuesta del asistente aparece en la banda, se ve en la tabla y
//      aceptarla la aplica y la archiva.
//
// Vive fuera de `scripts/` por el sello del motor (ver `verificadores/obra.mjs`).

import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compilarEntrada, ROOT } from '../scripts/lib/motor.mjs';
import { cargarGenericas } from './lib/genericas.mjs';

const TMP = await mkdtemp(path.join(os.tmpdir(), 'structflow-interfaz-'));
process.env.STRUCTFLOW_OBRAS = TMP;
const { crearObras } = await import('../servidor/obras.mjs');

const M = await compilarEntrada('src/proyecto/obra/engine.ts');
const { genericas } = await cargarGenericas(M);

// ── Las obras de prueba ──────────────────────────────────────────────────────
const RAIZ_OBRAS = path.join(ROOT, 'obras');
const ids = (await readdir(RAIZ_OBRAS, { withFileTypes: true }))
  .filter((e) => e.isDirectory() && /^[a-z0-9][a-z0-9-]*$/.test(e.name))
  .map((e) => e.name);
for (const id of ids) await cp(path.join(RAIZ_OBRAS, id), path.join(TMP, id), { recursive: true });
const obras = crearObras(TMP);

async function leerObra(id) {
  const { version, archivos } = await obras.leer(id);
  return { version, obra: M.sanearObra(M.unirObra(archivos).crudo) };
}

// La base de COL_VIENTO del Pachón, atrasada a propósito: sin la sección del
// desarrollo de la armadura, como quedó antes del 2026-09-25.
const PACHON = 'pachon-soldadura';
let idVistaAtrasada = null;
if (ids.includes(PACHON)) {
  const { version, obra } = await leerObra(PACHON);
  const tieneDesarrollo = (v) => obra.calculos.find((k) => k.id === v.frontera.ensamble.nodos.datos)?.hoja.some((b) => b.id.includes(':desarrollo:'));
  const vista = obra.calculos.find((k) => k.frontera?.ensamble && tieneDesarrollo(k));
  if (vista) {
    idVistaAtrasada = vista.id;
    const datos = vista.frontera.ensamble.nodos.datos;
    const atrasada = { ...obra, calculos: obra.calculos.map((k) => (k.id === datos ? { ...k, hoja: k.hoja.filter((b) => !b.id.includes(':desarrollo:')) } : k)) };
    obras.escritor(PACHON, 'preparar-interfaz');
    await obras.escribir(PACHON, { token: 'preparar-interfaz', base: version, archivos: M.partirObra(atrasada) });
    obras.soltar(PACHON, 'preparar-interfaz');
  }
}

// ── La aplicación ────────────────────────────────────────────────────────────
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'indice-planillas.mjs')], { cwd: ROOT, stdio: 'ignore' });
const { createServer } = await import('vite');
const vite = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5199, strictPort: false } });
await vite.listen();
const URL_BASE = vite.resolvedUrls.local[0];
const { chromium } = await import('playwright');
const navegador = await chromium.launch();

const resultados = [];
const caso = async (nombre, fn) => {
  try {
    const motivo = await fn();
    resultados.push({ nombre, motivo });
  } catch (e) {
    resultados.push({ nombre, motivo: `lanzó: ${e.message.split('\n')[0]}` });
  }
};

const CRUDOS = /Undefined symbol|Unexpected (type|end|operator)|is not defined|Cannot read propert|Units do not match|Unit .* not found|TypeError|NaN/;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Lo que el lienzo muestra de cada nodo de cálculo. */
const estadoDom = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('.react-flow__node[data-id^="calculo:"]')].map((n) => {
        const d = n.querySelector('[data-severidad]');
        return [n.getAttribute('data-id'), { severidad: d?.dataset.severidad, veredicto: d?.dataset.veredicto ?? '' }];
      }),
    ),
  );

/** Lo que `proyectar` dice en Node de la misma obra. */
function estadoNode(obra) {
  const ev = M.evaluarObra(obra, genericas);
  const nodos = M.proyectar(obra, ev, genericas).nodos.filter((n) => n.id.startsWith('calculo:'));
  return { ev, esperado: Object.fromEntries(nodos.map((n) => [n.id, { severidad: n.severidad, veredicto: n.veredicto ?? '' }])) };
}

/**
 * Selecciona un nodo como lo hace un clic. Se despacha el evento en vez de mover el
 * ratón: con la ficha abierta, el panel tapa los nodos de la derecha del lienzo.
 */
async function seleccionar(page, idCalculo) {
  await page.locator(`.react-flow__node[data-id="calculo:${idCalculo}"]`).dispatchEvent('click');
  await page.waitForTimeout(150);
}

async function abrir(id) {
  const page = await navegador.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${URL_BASE}obra/${id}`);
  await page.waitForSelector('.react-flow__node[data-id^="calculo:"] [data-severidad]', { timeout: 30_000 });
  return page;
}

/** Espera hasta que el lienzo coincida con Node (las genéricas cargan solas), o dice qué no. */
async function coincide(page, esperado) {
  let diferencias = [];
  for (let i = 0; i < 60; i++) {
    const dom = await estadoDom(page);
    diferencias = Object.entries(esperado)
      .filter(([nid, e]) => !dom[nid] || dom[nid].severidad !== e.severidad || dom[nid].veredicto !== e.veredicto)
      .map(([nid, e]) => `${nid}: pantalla ${JSON.stringify(dom[nid])}, modelo ${JSON.stringify(e)}`);
    if (!diferencias.length) return null;
    await esperar(500);
  }
  return diferencias.slice(0, 4).join(' | ');
}

let paginaPachon = null;
try {
  for (const id of ids) {
    const { obra } = await leerObra(id);
    const { ev, esperado } = estadoNode(obra);
    const page = await abrir(id);

    await caso(`${id}: cada nodo del lienzo tiene la severidad y el veredicto del modelo`, () => coincide(page, esperado));

    await caso(`${id}: ni el lienzo ni las fichas muestran un mensaje crudo del motor`, async () => {
      const malos = [];
      const lienzo = await page.evaluate(() => document.body.innerText);
      if (CRUDOS.test(lienzo)) malos.push(`lienzo: «${lienzo.match(CRUDOS)[0]}»`);
      for (const k of obra.calculos) {
        await seleccionar(page, k.id);
        await page.waitForSelector('aside', { timeout: 5000 });
        const texto = await page.evaluate(() => [...document.querySelectorAll('aside')].map((a) => a.innerText).join('\n'));
        if (CRUDOS.test(texto)) malos.push(`${k.nombre}: «${texto.match(CRUDOS)[0]}»`);
      }
      return malos.length ? malos.slice(0, 4).join(' | ') : null;
    });

    for (const k of obra.calculos.filter((x) => x.frontera?.procedencia === 'vista')) {
      await caso(`${id}: el dibujo de «${k.nombre}» es el del modelo y marca lo que falla`, async () => {
        const inst = ev.importadas.get(`calculo:${k.id}`);
        const dibujoModelo = inst?.vista?.hoja.find((r) => r.kind === 'image')?.src;
        const fallan = inst?.vista?.modelo.chequeos.filter((c) => !c.cumple && !c.aviso).length ?? 0;
        await seleccionar(page, k.id);
        await page.getByRole('button', { name: 'Abrir la hoja y el dibujo' }).click();
        const img = page.locator('.doc-papel img[src^="data:image/svg"]').first();
        await img.waitFor({ timeout: 15_000 });
        const src = await img.getAttribute('src');
        await page.locator('[role=tablist] [aria-label^="Cerrar "]').first().click().catch(() => {});
        if (src !== dibujoModelo) return 'el dibujo de la pantalla no es el del modelo';
        const svg = decodeURIComponent(src.slice(src.indexOf(',') + 1));
        const leyenda = (svg.match(/<text[^>]*font-size="8\.5" fill="#dc2626"/g) ?? []).length;
        return leyenda === fallan ? null : `la leyenda roja tiene ${leyenda} líneas y fallan ${fallan} verificaciones`;
      });
    }
    // La del Pachón sigue abierta: cerrarla no suelta el candado a tiempo, y otra
    // página abriría la obra en solo lectura.
    if (id === PACHON) paginaPachon = page;
    else await page.close();
  }

  if (idVistaAtrasada && paginaPachon) {
    const page = paginaPachon;
    await caso('pachón: la base atrasada ofrece actualizarse, la propuesta lo muestra y aceptarla respalda y la deja al día', async () => {
      await page.getByRole('tab', { name: 'Obra' }).click().catch(() => {});
      await seleccionar(page, idVistaAtrasada);
      const boton = page.locator('[data-plantilla="actualizar"]');
      await boton.waitFor({ timeout: 10_000 });
      await boton.click();
      await page.locator('[data-propuesta="cuerpo"]').waitFor({ timeout: 15_000 });
      const cuerpo = await page.locator('[data-propuesta="cuerpo"]').innerText();
      if (!/cambian/.test(cuerpo)) return `la propuesta no dice qué cambia: ${cuerpo.slice(0, 200)}`;
      await page.locator('[data-propuesta="aceptar"]').click();
      await page.getByText(/^Aplicado:/).waitFor({ timeout: 15_000 });
      await page.locator('[data-plantilla="al-dia"]').waitFor({ timeout: 10_000 });
      const respaldos = await readdir(path.join(TMP, '_respaldos')).catch(() => []);
      return respaldos.some((r) => r.startsWith(`${PACHON}-antes-de-actualizar`)) ? null : `respaldos: ${respaldos.join(', ')}`;
    });

    await caso('pachón: una propuesta del asistente llega por la banda, se ve en la tabla y aceptarla la aplica y la archiva', async () => {
      // Lo aceptado recién tiene que llegar al disco antes de proponer sobre esa versión.
      let leida;
      for (let i = 0; i < 40; i++) {
        await esperar(250);
        leida = await leerObra(PACHON);
        if (!M.desfaseDePlantilla(leida.obra, M.VISTAS['base-columna'].plantilla, idVistaAtrasada).length) break;
      }
      const k = leida.obra.calculos.find((x) => !x.frontera);
      const nombre = `${k.nombre} (propuesta)`;
      const propuesta = { ...leida.obra, calculos: leida.obra.calculos.map((x) => (x.id === k.id ? { ...x, nombre } : x)) };
      const { n } = await obras.proponer(PACHON, { autor: 'asistente', titulo: 'Renombrar un nodo', nota: 'prueba de interfaz', base: leida.version, archivos: M.partirObra(propuesta) });
      await page.locator('[data-propuesta="revisar"]').click({ timeout: 20_000 });
      await page.locator(`[data-propuesta-nodo="${k.id}"]`).waitFor({ timeout: 15_000 });
      await page.locator('[data-propuesta="aceptar"]').click();
      await page.getByText('Aplicado: Renombrar un nodo').waitFor({ timeout: 15_000 });
      if ((await obras.contarPropuestas(PACHON)) !== 0) return 'la propuesta sigue pendiente';
      for (let i = 0; i < 40; i++) {
        await esperar(250);
        const k2 = (await leerObra(PACHON)).obra.calculos.find((x) => x.id === k.id);
        if (k2.nombre === nombre) return k2.revisar?.por === 'asistente' ? null : 'el nodo no quedó marcado para revisar';
      }
      return `n ${n}: el nombre propuesto no llegó al disco`;
    });
    await page.close();
  }
} finally {
  await navegador.close();
  await vite.close();
  await rm(TMP, { recursive: true, force: true }).catch(() => {});
}

for (const r of resultados) console.log(`  [${r.motivo ? 'FALLA' : ' OK  '}] ${r.nombre}${r.motivo ? `\n          ${r.motivo}` : ''}`);
const fallas = resultados.filter((r) => r.motivo).length;
console.log(fallas ? `\nFALLA: ${fallas} de ${resultados.length} casos.` : `\nOK: ${resultados.length} casos.`);
process.exit(fallas ? 1 : 0);
