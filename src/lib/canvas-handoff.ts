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
import type { Region } from './worksheet';
import type { MetaPlanilla } from './biblioteca/contrato';
import { expresionesDeGrafico } from './grafico';

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
 * Esta lista es la parte frágil del guardián: lo que falte se denuncia como
 * símbolo indefinido y el generador no arranca. Por eso incluye las tres
 * funciones de diseño que `worksheet.ts` importa en TODA hoja (`beta1`,
 * `sqrtfc`, `phiFlexion`) y el vocabulario de unidades de la práctica local, no
 * solo el mínimo del SI.
 */
export const INTRINSECOS: ReadonlySet<string> = new Set([
  // Operadores de mathjs que se escriben con letras. Sin ellos, `a and b` se
  // lee como una referencia a un simbolo llamado «and».
  'and', 'or', 'not', 'xor', 'mod', 'to', 'in',
  // Constantes y funciones de mathjs de uso corriente en una memoria.
  'pi', 'e', 'true', 'false',
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
 * Símbolos que una región DEFINE (`nombre := …`) y los que USA.
 *
 * Es un análisis léxico deliberadamente simple: alcanza porque estas hojas las
 * genera código, no una persona, y la gramática de sus filas es la de
 * `parseMathRegion`.
 */
function simbolos(src: string): { define: string | null; usa: string[] } {
  // La cabecera admite `nombre :=` y también `nombre(a, b) :=`; los parámetros
  // de la segunda forma son locales y no cuentan como símbolos usados.
  const def = src.match(/^\s*([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?\s*:=/);
  const locales = new Set(
    (def?.[2] ?? '').split(',').map((p) => p.trim()).filter(Boolean),
  );
  // Quitar antes los textos entre comillas: `v ? "#1c7c3c" : "#c0392b"` no usa
  // ningún símbolo, pero sin esto se leían «c7c3c» y «c0392b» como indefinidos.
  const cuerpo = (def ? src.slice(src.indexOf(':=') + 2) : src).replace(/"(?:[^"\\]|\\.)*"/g, ' ');
  // Quitar antes los numeros, o el exponente de `2.04e6` se lee como un simbolo
  // llamado «e6». El lookbehind es lo que distingue ese `6` suelto del `1` de
  // `B_1`, que es parte del nombre y tiene que sobrevivir.
  const sinNumeros = cuerpo.replace(/(?<![A-Za-z_0-9])\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, ' ');
  const usa = (sinNumeros.match(/[A-Za-z_]\w*/g) ?? []).filter(
    (s) => !INTRINSECOS.has(s) && !locales.has(s),
  );
  return { define: def ? def[1] : null, usa };
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
    const { define, usa } = simbolos(it.src);
    // De un bloque de programa solo se registra lo que EXPORTA. Su cuerpo
    // declara variables locales y de bucle que un análisis léxico no sabe
    // distinguir de una referencia externa; darlas por indefinidas sería peor
    // que no mirarlas. Los cuerpos los cubre `verify:modulos`, que corre el
    // motor de verdad.
    if (it.kind !== 'program') {
      for (const s of usa) {
        if (!definidos.has(s)) faltantes.push(`«${s}» en la fila \`${it.src}\``);
      }
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
