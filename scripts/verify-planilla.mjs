#!/usr/bin/env node
// Verifica una planilla del canvas FUERA del navegador.
//
// Existe para que un ejemplo de cálculo del taller (material_teorico/taller/)
// pueda garantizar sus números sin que nadie los transcriba a mano: la planilla
// es la fuente de verdad y este script la ejecuta con el mismo motor que corre
// en /herramientas/canvas — mismas unidades, mismo chequeo dimensional.
//
//   npm run verify:planilla -- <planilla.json> [...más] [--md]
//   npm run verify:planillas            # todas las de public/planillas/
//
// Acepta uno o más .json, o un directorio (verifica todos sus .json). Sale con
// código 1 si en cualquiera de ellas:
//   - alguna región tiene error (sintaxis, variable indefinida, unidades que no
//     casan — esto último es el motivo principal de que el script exista);
//   - alguna comparación da `false` sin estar declarada en meta.esperadoFalso;
//   - alguna comparación declarada en meta.esperadoFalso da `true` (la excepción
//     quedó obsoleta y hay que borrarla, o el resultado cambió sin que nadie
//     lo notara).
//
// Con --md imprime el desarrollo y los veredictos como tablas Markdown listas
// para pegar en la ficha del taller.
//
// Formato de la planilla: el mismo {version, regions} de export/import del
// canvas, más un bloque `meta` opcional que este script entiende:
//
//   { "version": 1,
//     "meta": { "titulo": "...", "esperadoFalso": { "<id>": "por qué" } },
//     "regions": [ { "id": "...", "kind": "math", "x": 0, "y": 0, "src": "..." } ] }
//
// Las regiones `image` no se evalúan: se cuentan y se omiten del desarrollo.

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cargarMotor, ROOT } from './lib/motor.mjs';

const args = process.argv.slice(2);
const emitMd = args.includes('--md');
const targets = args.filter((a) => !a.startsWith('--'));

if (targets.length === 0) {
  console.error('Uso: npm run verify:planilla -- <planilla.json | directorio> [...más] [--md]');
  process.exit(2);
}

/** Expande directorios a sus .json (orden alfabético, para un reporte estable). */
async function resolverPlanillas(entradas) {
  const rutas = [];
  for (const t of entradas) {
    const abs = path.resolve(t);
    if ((await stat(abs)).isDirectory()) {
      const hijos = (await readdir(abs)).filter((f) => f.endsWith('.json')).sort();
      rutas.push(...hijos.map((f) => path.join(abs, f)));
    } else {
      rutas.push(abs);
    }
  }
  return rutas;
}

/**
 * El motor devuelve el resultado como LaTeX (es lo que consume el canvas).
 * Acá se revierte a texto plano para las tablas.
 *
 * En una región `math` solo hay valor que extraer si pedía mostrarlo (un `=`
 * final en el `src`): sin eso, el único `=` del LaTeX es el del operador `{:=}`
 * de la definición, y quedarse con lo que va después devuelve basura. Las
 * regiones `program` (src = null) siempre rinden su valor de retorno.
 */
function valorDeTex(tex, src) {
  if (!tex) return '';
  if (src !== null && !parseMathRegion(src).showResult) return '';
  const i = tex.lastIndexOf('=');
  if (i === -1) return '';
  return tex
    .slice(i + 1)
    .replace(/[\\;~]*\\mathrm\{([^}]*)\}/g, ' $1')
    .replace(/\\cdot\s*10\^\{([+-]?\d+)\}/g, 'e$1')
    .replace(/\\[,;~]/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const { evaluateSheet, parseMathRegion, renderEsquema, ESQUEMAS_PREFIX } = await cargarMotor();

/** Secciones de contenido donde puede vivir el ejemplo de una planilla. */
const SECCIONES = ['acero', 'hormigon', 'geotecnia'];

/**
 * El post de un ejemplo, por la misma convención de nombre que usa el enlace
 * automático del layout (`src/lib/planillas.ts`): `ejemplo-<slug>.mdx`.
 */
function postDePlanilla(planillaPath) {
  const slug = path.basename(planillaPath, '.json');
  for (const sec of SECCIONES) {
    const p = path.join(ROOT, 'src', 'content', sec, `ejemplo-${slug}.mdx`);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Comprueba que el «N pasos, M verificaciones y K contrastes» que el post
 * publica sea el que la planilla tiene. Devuelve [] si cuadra o si el post no
 * declara conteos (no es obligatorio declararlos; sí lo es que no mientan).
 */
function comprobarConteosDelPost(planillaPath, real) {
  const post = postDePlanilla(planillaPath);
  if (!post) return [];
  const texto = readFileSync(post, 'utf8');
  const m = texto.match(
    /(?:los\s+)?(\d+)\s+pasos,\s*(?:las\s+)?(\d+)\s+verificaciones[^.]*?(\d+)\s+contrastes/s,
  );
  if (!m) return [];
  const [, pasos, verif, contr] = m.map(Number);
  if (pasos === real.n && verif === real.verdictos && contr === real.contrastes) return [];
  return [
    {
      post: path.relative(ROOT, post),
      publicado: `${pasos} pasos, ${verif} verificaciones, ${contr} contrastes`,
      real: `${real.n} / ${real.verdictos} / ${real.contrastes}`,
    },
  ];
}

/**
 * Variables cuyo nombre se come una unidad.
 *
 * En mathjs `4 m` son cuatro metros, salvo que la hoja haya definido una
 * variable `m`: ahí son `4·m`. No falla — devuelve OTRO número. El 2026-08-07
 * la planilla de rigidez rotacional definió `m` (el voladizo de la placa, como
 * lo llama la DG1) y su `L_col := 4 m` pasó a valer 33 cm, con el índice
 * β·L/EI 12,1 veces más chico. Solo lo delató el contraste contra el post.
 *
 * El patrón peligroso es un literal numérico seguido de identificador SIN `*`.
 * `2*h` con `h` definida es lo que el autor quiere, y no se toca.
 */
function unidadesEclipsadas(regions) {
  const definidas = new Set();
  for (const r of regions) {
    if (r.kind !== 'math' && r.kind !== 'program') continue;
    const mo = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:=/.exec(r.src ?? '');
    if (mo) definidas.add(mo[1]);
  }
  const choques = [];
  for (const r of regions) {
    if (r.kind !== 'math') continue;
    const src = r.src ?? '';
    // Solo el cuerpo de la expresión: la unidad de despliegue (`= tonf*m`) se
    // resuelve aparte y NO pasa por el scope, así que ahí no hay riesgo.
    const cuerpo = (src.includes(':=') ? src.split(':=')[1] : src).split('=')[0];
    for (const mo of cuerpo.matchAll(/\d\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
      if (definidas.has(mo[1])) {
        choques.push({ id: r.id, frag: mo[0].trim(), nombre: mo[1] });
      }
    }
  }
  return choques;
}

/** Verifica una planilla; devuelve true si está limpia. */
async function verificar(planillaPath) {
const planilla = JSON.parse(await readFile(planillaPath, 'utf8'));
const regions = planilla.regions ?? [];
const meta = planilla.meta ?? {};
const esperadoFalso = meta.esperadoFalso ?? {};

const results = evaluateSheet(regions);

// Orden de lectura, igual que el canvas: y ascendente, luego x.
const ordenadas = [...regions].sort((a, b) => a.y - b.y || a.x - b.x);

const errores = [];

// Antes que nada: una variable que eclipsa una unidad no rompe nada, cambia el
// número en silencio. Ver `unidadesEclipsadas`.
for (const { id, frag, nombre } of unidadesEclipsadas(regions)) {
  errores.push({
    id,
    src: frag,
    error:
      `«${frag}» se lee como ${frag.replace(/\s+/, '·')}, no como unidad: ` +
      `la hoja define «${nombre}» como variable. Renómbrala (y di por qué).`,
  });
}
const verdictos = [];
const filas = [];
let n = 0;
let figuras = 0;
let tokensEsquema = 0;

for (const r of ordenadas) {
  if (r.kind === 'text') {
    filas.push({ tipo: 'seccion', texto: r.src });
    continue;
  }
  // Las imágenes no se evalúan; se cuentan y se omiten del desarrollo (su `src`
  // puede ser un data URI de cientos de kB, que no tiene nada que hacer en una
  // tabla). Excepción: un esquema paramétrico de /esquemas/ sí se somete al
  // contrato — se sustituyen sus tokens contra el scope capturado y un token
  // sin resolver es un error de la planilla.
  if (r.kind === 'image') {
    figuras += 1;
    if (r.src.startsWith(ESQUEMAS_PREFIX)) {
      try {
        const svgText = await readFile(path.join(ROOT, 'public', r.src), 'utf8');
        const esquema = renderEsquema(svgText, results[r.id]?.scope ?? {});
        tokensEsquema += esquema.tokens;
        if (esquema.faltantes.length) {
          errores.push({
            id: r.id,
            src: r.src,
            error: `token(es) sin resolver: ${esquema.faltantes.join(' · ')}`,
          });
        }
      } catch (err) {
        errores.push({ id: r.id, src: r.src, error: `esquema ilegible: ${err.message}` });
      }
    }
    continue;
  }
  const res = results[r.id] ?? {};
  if (res.error) {
    errores.push({ id: r.id, src: r.src, error: res.error });
    filas.push({ tipo: 'error', src: r.src, error: res.error });
    continue;
  }
  if (typeof res.bool === 'boolean') {
    verdictos.push({ id: r.id, src: r.src, ok: res.bool });
    continue;
  }
  n += 1;
  filas.push({
    tipo: 'paso',
    n,
    src: r.src,
    valor: valorDeTex(res.tex, r.kind === 'program' ? null : r.src),
  });
}

// --- Reporte a consola -------------------------------------------------------

// Los contrastes son las verificaciones con id `c_*`: las que comparan contra un
// número que el post publica. El resto son chequeos internos de la hoja (rangos
// de tabla, equilibrios, la colocación de una curva) y no cuentan como contraste.
const contrastes = verdictos.filter((v) => v.id.startsWith('c_')).length;

const titulo = meta.titulo ?? path.basename(planillaPath);
console.log(`\nPlanilla: ${titulo}`);
console.log(`Archivo:  ${path.relative(process.cwd(), planillaPath)}`);
console.log(
  `Regiones: ${regions.length}  ·  pasos: ${n}  ·  verificaciones: ${verdictos.length}` +
    `  ·  contrastes: ${contrastes}` +
    (figuras ? `  ·  figuras: ${figuras}` : '') +
    (tokensEsquema ? `  ·  tokens de esquema: ${tokensEsquema}` : '') +
    '\n',
);

// El post publica esos tres números en su sección «La planilla», y se desalinean
// solos: una planilla gana verificaciones en la auditoría siguiente y la prosa se
// queda con el número viejo. El 2026-08-02 pasaba en 10 de las 21. Acá se
// comprueban, que es más barato que volver a contarlos a mano.
const desalineados = comprobarConteosDelPost(planillaPath, { n, verdictos: verdictos.length, contrastes });
for (const d of desalineados) {
  console.log(`  [ERROR] ${d.post}`);
  console.log(`          publica «${d.publicado}» y la planilla tiene ${d.real}`);
}

for (const e of errores) {
  console.log(`  [ERROR] ${e.src}`);
  console.log(`          ${e.error}`);
}

const inesperados = [];
const obsoletos = [];
for (const v of verdictos) {
  const permitido = Object.prototype.hasOwnProperty.call(esperadoFalso, v.id);
  if (v.ok) {
    console.log(`  [ OK  ] ${v.src}`);
    if (permitido) obsoletos.push(v);
  } else if (permitido) {
    console.log(`  [ NO  ] ${v.src}   <- esperado: ${esperadoFalso[v.id]}`);
  } else {
    console.log(`  [FALLA] ${v.src}`);
    inesperados.push(v);
  }
}

// --- Tablas Markdown ---------------------------------------------------------

if (emitMd) {
  const md = [];
  md.push(`\n---\n`);
  let abierta = false;
  const cerrar = () => {
    if (abierta) md.push('');
    abierta = false;
  };
  for (const f of filas) {
    if (f.tipo === 'seccion') {
      cerrar();
      md.push(`**${f.texto}**\n`);
    } else {
      if (!abierta) {
        md.push('| # | Expresión | Resultado |');
        md.push('|---|---|---|');
        abierta = true;
      }
      // Un programa es multilínea; en una celda de tabla va en una sola línea.
      const src = f.src.replace(/\n\s*/g, ' · ');
      if (f.tipo === 'error') md.push(`| — | \`${src}\` | ⚠ ${f.error} |`);
      else md.push(`| ${f.n} | \`${src}\` | ${f.valor} |`);
    }
  }
  cerrar();
  if (verdictos.length) {
    md.push('| Verificación | Veredicto |');
    md.push('|---|---|');
    for (const v of verdictos) {
      const nota = !v.ok && esperadoFalso[v.id] ? ` — ${esperadoFalso[v.id]}` : '';
      md.push(`| \`${v.src.replace(/\s*=\s*$/, '')}\` | ${v.ok ? '✅' : '❌'}${nota} |`);
    }
    md.push('');
  }
  console.log(md.join('\n'));
}

// --- Veredicto ---------------------------------------------------------------

for (const v of obsoletos) {
  console.log(`  [AVISO] "${v.id}" está en meta.esperadoFalso pero ahora pasa: bórralo.`);
}

const falla =
  errores.length > 0 || inesperados.length > 0 || obsoletos.length > 0 || desalineados.length > 0;
console.log(
  `\n${falla ? 'FALLA' : 'OK'}: ${errores.length} errores · ` +
    `${inesperados.length} verificaciones no pasan sin declarar · ` +
    `${obsoletos.length} excepciones obsoletas` +
    (desalineados.length ? ` · ${desalineados.length} conteos desalineados con el post` : '') +
    '\n',
);
return !falla;
}

const rutas = await resolverPlanillas(targets);
const fallidas = [];
for (const ruta of rutas) {
  if (!(await verificar(ruta))) fallidas.push(path.relative(process.cwd(), ruta));
}

if (rutas.length > 1) {
  console.log('='.repeat(60));
  if (fallidas.length) {
    console.log(`FALLA: ${fallidas.length} de ${rutas.length} planillas:`);
    for (const f of fallidas) console.log(`  - ${f}`);
  } else {
    console.log(`OK: las ${rutas.length} planillas cuadran.`);
  }
  console.log('');
}
process.exit(fallidas.length ? 1 : 0);
