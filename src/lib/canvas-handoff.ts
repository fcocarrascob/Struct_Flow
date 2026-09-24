// ─────────────────────────────────────────────────────────────────────────────
// Entrega de una hoja generada al canvas matemático.
//
// Vive aquí y no dentro del generador de una herramienta porque nada de esto es
// específico de un dominio: el formato de la hoja y descargarla como .json en
// el mismo formato que lee `npm run verify:planilla`. Mandarla al canvas es
// `abrirEnCanvas` de `components/canvas/abrir-en-canvas.ts`, que la deja en
// espera en vez de pisar la hoja guardada.
//
// El guardián de símbolos viaja junto porque tiene la misma naturaleza: revisa
// que la hoja sea EJECUTABLE antes de entregarla. Nació de un error real en la
// memoria del verificador de secciones —un bloque que definía una variable
// quedaba detrás de un filtro y la hoja llegaba rota al canvas—, y el problema
// se repite en cualquier generador que arme regiones condicionalmente.
// ─────────────────────────────────────────────────────────────────────────────

import type { Item } from './worksheet-layout';
import { formulasDeTabla, nombreDePrograma, parseMathRegion, simbolosDeFormula, type Region } from './worksheet';
import type { MetaPlanilla } from './biblioteca/contrato';
import { expresionesDeGrafico } from './grafico';
import { nombresPublicados } from './tabla';

/**
 * El formato que leen el canvas, el import/export y `verify:planilla`.
 *
 * `meta` es el contrato de `biblioteca/contrato.ts`: `titulo` obligatorio y
 * todo lo demás opcional, de modo que `{ titulo }` a secas sigue valiendo.
 */
export interface HojaCanvas {
  version: 1;
  meta: MetaPlanilla;
  regions: Region[];
}

/**
 * Funciones, constantes y unidades que el motor del canvas ya trae en su scope.
 *
 * `verificarSimbolos` ya no depende de ella para las funciones: el lector del
 * motor (`simbolosDeFormula`) descarta cualquier función de math.js que se
 * llame, así que `string()` o `concat()` pasan sin listarlas. Lo que sigue
 * haciendo falta aquí son las unidades escritas sueltas (`f_c/MPa`), que el
 * lector deja pasar porque podrían ser una variable. La usan también la obra,
 * para no tomar una unidad por una entrada, y `problemaDeAlias`. `e` no está: el
 * motor rechaza `e` sin definir (en una memoria es una excentricidad).
 */
export const INTRINSECOS: ReadonlySet<string> = new Set([
  // Operadores de mathjs que se escriben con letras. Sin ellos, `a and b` se
  // lee como una referencia a un simbolo llamado «and».
  'and', 'or', 'not', 'xor', 'mod', 'to', 'in',
  // Constantes y funciones de mathjs de uso corriente en una memoria.
  'pi', 'true', 'false',
  'sqrt', 'abs', 'min', 'max', 'round', 'floor', 'ceil', 'fix', 'sign',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'log', 'log10', 'exp',
  'pow', 'sum', 'mean', 'concat', 'size', 'range', 'number', 'unit', 'end',
  // Las tres funciones de diseño que el motor importa en toda hoja.
  'beta1', 'sqrtfc', 'phiFlexion',
  // Unidades: `tonf` y `tf` las registra worksheet.ts, el resto son de mathjs.
  'm', 'cm', 'mm', 'km', 'inch', 'ft',
  'kg', 'g', 'ton', 'N', 'kN', 'MN', 'kgf', 'tonf', 'tf', 'lbf', 'kip',
  'Pa', 'kPa', 'MPa', 'GPa', 'psi', 'ksi',
  'rad', 'deg', 's', 'min', 'h',
]);

/**
 * Símbolos que una fórmula DEFINE (`nombre := …`) y los que USA, con el lector
 * de nombres del motor (`simbolosDeFormula`): textos, exponentes, unidades en su
 * sitio y funciones del motor ya quedan fuera, y los nombres no ASCII cuentan.
 * `INTRINSECOS` quita además las unidades escritas sueltas (`f_c/MPa`).
 */
function simbolos(src: string): { define: string | null; usa: string[] } {
  return {
    define: parseMathRegion(src).varName ?? null,
    usa: simbolosDeFormula(src).filter((s) => !INTRINSECOS.has(s)),
  };
}

/**
 * Verifica que ninguna región referencie un símbolo que no se definió antes.
 *
 * Lanza a propósito: es preferible un fallo ruidoso al generar que tres
 * regiones en rojo que quien usa la herramienta descubre después, en el canvas.
 */
export function verificarSimbolos(items: Item[]): void {
  const definidos = new Set<string>();
  const faltantes: string[] = [];
  for (const it of items) {
    // `text` no se evalúa, e `image` tampoco: su `src` es una ruta como
    // `/esquemas/viga.svg`, que este analizador leería como una ristra de
    // símbolos indefinidos.
    if (it.kind === 'text' || it.kind === 'image') continue;
    // Un gráfico no define nada, y su `src` es el título: lo que usa está en las
    // expresiones de su especificación, sin la variable de cada función.
    if (it.kind === 'plot') {
      for (const { expr, locales } of it.grafico ? expresionesDeGrafico(it.grafico) : []) {
        for (const s of simbolos(expr).usa) {
          if (!definidos.has(s) && !locales.includes(s)) faltantes.push(`«${s}» en el gráfico «${it.src}»`);
        }
      }
      continue;
    }
    // Una tabla: sus celdas de fórmula fila a fila, como una ristra de filas
    // math, y después lo que publica. Su `src` es el título.
    if (it.kind === 'table') {
      if (!it.tabla) continue;
      for (const { f, c, src } of formulasDeTabla(it.tabla)) {
        const s = simbolos(src);
        for (const u of s.usa) {
          if (!definidos.has(u)) faltantes.push(`«${u}» en la celda [${f + 1},${c + 1}] \`${src}\``);
        }
        if (s.define) definidos.add(s.define);
      }
      for (const n of nombresPublicados(it.tabla)) definidos.add(n);
      continue;
    }
    // De un bloque de programa solo se registra lo que EXPORTA. Su cuerpo
    // declara variables locales y de bucle que no se distinguen de una
    // referencia externa sin ejecutarlo; darlas por indefinidas sería peor que
    // no mirarlas. Los cuerpos los cubre `verify:modulos`, que corre el motor de
    // verdad.
    if (it.kind === 'program') {
      const define = nombreDePrograma(it.src);
      if (define) definidos.add(define);
      continue;
    }
    const { define, usa } = simbolos(it.src);
    for (const s of usa) {
      if (!definidos.has(s)) faltantes.push(`«${s}» en la fila \`${it.src}\``);
    }
    if (define) definidos.add(define);
  }
  if (faltantes.length > 0) {
    throw new Error(
      `La hoja referencia símbolos que no define: ${faltantes.join('; ')}. ` +
        'Falta emitir el bloque que los define.'
    );
  }
}

/**
 * Descarga la hoja como .json — el mismo formato que `verify:planilla` lee.
 *
 * El enlace se añade al documento antes de pulsarlo y el blob se revoca en el
 * siguiente turno: Firefox ignora el clic de un `<a>` que no está en el DOM, y
 * revocar de forma síncrona corta la descarga antes de que empiece. En
 * Chromium las dos cosas funcionan igual sin la precaución, que es justo por lo
 * que el fallo pasa desapercibido.
 */
export function descargarHoja(hoja: unknown, nombreArchivo: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([JSON.stringify(hoja, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
