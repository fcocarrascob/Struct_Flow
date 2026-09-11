// La verificación de una planilla, como función.
//
// Antes vivía entera dentro de `verify-planilla.mjs`, mezclada con la impresión
// por consola. Sale aquí porque tiene tres consumidores —la CLI, el render a
// HTML/PDF (que se niega a renderizar lo que no verifica) y `verify:modulos`— y
// una copia por consumidor es la forma segura de que dejen de coincidir.
//
// `verificarPlanilla` evalúa con el motor de verdad y devuelve TODO lo que hay
// que saber: errores, veredictos, filas del desarrollo, contrastes. Las salidas
// (consola, Markdown) son funciones aparte sobre ese resultado.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { cargarMotor, ROOT } from './motor.mjs';

let motor;
/** El motor, compilado una vez por proceso. */
export async function motorCompartido() {
  motor ??= await cargarMotor();
  return motor;
}

/** HEAD de este repo, o `desconocido`: el sello del eval lo lleva escrito. */
export function commitDelMotor() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'desconocido';
  }
}

export function sha256(datos) {
  return createHash('sha256').update(datos).digest('hex');
}

/**
 * Dónde buscar un esquema `/esquemas/x.svg`: primero en las carpetas extra que
 * pase quien llama (`--esquemas`, para una planilla de un proyecto con figuras
 * fuera de este repo) y al final en `public/` de aquí. En cada carpeta se
 * prueba la ruta entera y después solo el nombre del archivo.
 */
export function resolverEsquema(src, carpetasExtra = []) {
  const candidatas = [];
  for (const dir of [...carpetasExtra, path.join(ROOT, 'public')]) {
    candidatas.push(path.join(dir, src));
    candidatas.push(path.join(dir, path.basename(src)));
  }
  return candidatas.find((c) => existsSync(c)) ?? null;
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
export function unidadesEclipsadas(regions) {
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

/**
 * El motor devuelve el resultado como LaTeX (es lo que consume el canvas).
 * Acá se revierte a texto plano para las tablas.
 *
 * En una región `math` solo hay valor que extraer si pedía mostrarlo (un `=`
 * final en el `src`): sin eso, el único `=` del LaTeX es el del operador `{:=}`
 * de la definición, y quedarse con lo que va después devuelve basura. Las
 * regiones `program` (src = null) siempre rinden su valor de retorno.
 */
export function valorDeTex(tex, src, parseMathRegion) {
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

/**
 * Verifica una planilla. Nunca lanza por el contenido de la hoja: lo que está
 * mal queda en `errores`, `inesperados`, `obsoletos` y `hallazgosMeta`, y `ok`
 * lo resume. Lanza solo si el archivo no se puede leer o no es JSON.
 *
 *   esquemas   carpetas extra donde buscar los `/esquemas/` (ver resolverEsquema)
 */
export async function verificarPlanilla(planillaPath, { esquemas = [] } = {}) {
  const { evaluateSheet, parseMathRegion, renderEsquema, ESQUEMAS_PREFIX, validarMeta, ordenDeLectura } =
    await motorCompartido();

  const crudo = await readFile(planillaPath);
  const planilla = JSON.parse(crudo.toString('utf8'));
  const regions = planilla.regions ?? [];
  const meta = planilla.meta ?? {};
  const esperadoFalso = meta.esperadoFalso ?? {};
  const slug = meta.slug ?? path.basename(planillaPath, '.json');

  const results = evaluateSheet(regions);
  const ordenadas = ordenDeLectura(regions);

  const errores = [];
  const verdictos = [];
  const avisos = [];
  const filas = [];
  const esquemasUsados = {};
  let n = 0;
  let figuras = 0;
  let tokensEsquema = 0;

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
        const ruta = resolverEsquema(r.src, esquemas);
        if (!ruta) {
          errores.push({ id: r.id, src: r.src, error: 'esquema no encontrado (¿falta --esquemas <dir>?)' });
          continue;
        }
        try {
          const svgText = await readFile(ruta, 'utf8');
          esquemasUsados[r.src] = svgText;
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
    // Un aviso no es un error (la expresión es válida), pero se enseña: hoy, una
    // variable que tapa una unidad en posición de unidad (ver `avisoUnidadTapada`
    // en el motor). No hace fallar la planilla.
    if (res.aviso) avisos.push({ src: r.src, aviso: res.aviso });
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
      valor: valorDeTex(res.tex, r.kind === 'program' ? null : r.src, parseMathRegion),
    });
  }

  const inesperados = [];
  const obsoletos = [];
  for (const v of verdictos) {
    const permitido = Object.prototype.hasOwnProperty.call(esperadoFalso, v.id);
    if (v.ok && permitido) obsoletos.push(v);
    else if (!v.ok && !permitido) inesperados.push(v);
  }

  // El contrato del `meta` (clase, normas, entradas, salidas, casos). Es forma,
  // no evaluación: lo mismo que el lint del harness comprueba en Python.
  const hallazgosMeta = validarMeta(planilla.meta, regions);
  const erroresMeta = hallazgosMeta.filter((h) => h.severidad === 'error');

  // Los contrastes son las verificaciones con id `c_*`: las que comparan contra un
  // número publicado fuera de la hoja. El resto son chequeos internos (rangos de
  // tabla, equilibrios, la colocación de una curva) y no cuentan como contraste.
  const contrastes = verdictos.filter((v) => v.id.startsWith('c_')).length;

  const ok = errores.length === 0 && inesperados.length === 0 && obsoletos.length === 0 && erroresMeta.length === 0;

  return {
    ruta: planillaPath,
    slug,
    titulo: meta.titulo ?? path.basename(planillaPath),
    sha256: sha256(crudo),
    meta,
    esperadoFalso,
    regions,
    ordenadas,
    results,
    esquemas: esquemasUsados,
    errores,
    avisos,
    verdictos,
    inesperados,
    obsoletos,
    hallazgosMeta,
    filas,
    pasos: n,
    contrastes,
    figuras,
    tokensEsquema,
    ok,
  };
}

/** El informe de consola, como líneas. */
export function informeConsola(v, { cwd = process.cwd() } = {}) {
  const out = [];
  out.push('');
  out.push(`Planilla: ${v.titulo}`);
  out.push(`Archivo:  ${path.relative(cwd, v.ruta)}`);
  out.push(
    `Regiones: ${v.regions.length}  ·  pasos: ${v.pasos}  ·  verificaciones: ${v.verdictos.length}` +
      `  ·  contrastes: ${v.contrastes}` +
      (v.figuras ? `  ·  figuras: ${v.figuras}` : '') +
      (v.tokensEsquema ? `  ·  tokens de esquema: ${v.tokensEsquema}` : '') +
      (v.meta.clase ? `  ·  clase: ${v.meta.clase}` : ''),
  );
  out.push('');
  for (const e of v.errores) {
    out.push(`  [ERROR] ${e.src}`);
    out.push(`          ${e.error}`);
  }
  for (const h of v.hallazgosMeta) {
    out.push(`  [${h.severidad === 'error' ? 'ERROR' : 'AVISO'}] meta · ${h.codigo}: ${h.mensaje}`);
  }
  for (const a of v.avisos) {
    out.push(`  [AVISO] ${a.src}`);
    out.push(`          ${a.aviso}`);
  }
  for (const vd of v.verdictos) {
    const permitido = Object.prototype.hasOwnProperty.call(v.esperadoFalso, vd.id);
    if (vd.ok) out.push(`  [ OK  ] ${vd.src}`);
    else if (permitido) out.push(`  [ NO  ] ${vd.src}   <- esperado: ${v.esperadoFalso[vd.id]}`);
    else out.push(`  [FALLA] ${vd.src}`);
  }
  for (const o of v.obsoletos) {
    out.push(`  [AVISO] "${o.id}" está en meta.esperadoFalso pero ahora pasa: bórralo.`);
  }
  const erroresMeta = v.hallazgosMeta.filter((h) => h.severidad === 'error').length;
  out.push('');
  out.push(
    `${v.ok ? 'OK' : 'FALLA'}: ${v.errores.length} errores · ` +
      `${v.inesperados.length} verificaciones no pasan sin declarar · ` +
      `${v.obsoletos.length} excepciones obsoletas` +
      (erroresMeta ? ` · ${erroresMeta} errores de meta` : ''),
  );
  out.push('');
  return out;
}

/**
 * El sello que abre todo `.eval.md`: qué archivo se verificó (por su sha256) y
 * con qué motor. Es lo que el harness compara para saber si el eval sigue
 * describiendo la planilla que hay en disco — por hash y no por fecha, porque
 * git no conserva fechas de archivo.
 */
export function selloEval(v, { commit = commitDelMotor(), fecha = new Date().toISOString() } = {}) {
  return `<!-- planilla: ${v.slug} · sha256: ${v.sha256} · struct_flow: ${commit} · ${fecha} -->`;
}

/** El desarrollo y los veredictos como tablas Markdown, con el sello delante. */
export function markdownEval(v, opciones = {}) {
  const md = [];
  md.push(selloEval(v, opciones));
  md.push('');
  md.push(`# ${v.titulo}`);
  md.push('');
  md.push(
    `Regiones ${v.regions.length} · pasos ${v.pasos} · verificaciones ${v.verdictos.length} · contrastes ${v.contrastes}` +
      (v.figuras ? ` · figuras ${v.figuras}` : ''),
  );
  md.push('');
  md.push('---');
  md.push('');
  let abierta = false;
  const cerrar = () => {
    if (abierta) md.push('');
    abierta = false;
  };
  for (const f of v.filas) {
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
  if (v.verdictos.length) {
    md.push('| Verificación | Veredicto |');
    md.push('|---|---|');
    for (const vd of v.verdictos) {
      const nota = !vd.ok && v.esperadoFalso[vd.id] ? ` — ${v.esperadoFalso[vd.id]}` : '';
      md.push(`| \`${vd.src.replace(/\s*=\s*$/, '')}\` | ${vd.ok ? '✅' : '❌'}${nota} |`);
    }
    md.push('');
  }
  md.push(
    `${v.ok ? 'OK' : 'FALLA'}: ${v.errores.length} errores · ${v.inesperados.length} verificaciones no pasan sin declarar · ${v.obsoletos.length} excepciones obsoletas`,
  );
  md.push('');
  return md.join('\n');
}

export { ROOT };
