// ─────────────────────────────────────────────────────────────────────────────
// Entrega de una hoja generada al canvas matemático.
//
// Vive acá y no dentro del generador de una herramienta porque nada de esto es
// específico de un dominio: escribir el slot de `localStorage` que `loadInitial()`
// de MathCanvas lee al montar, confirmar antes de pisar trabajo guardado, y
// descargar el .json en el mismo formato que lee `npm run verify:planilla`.
//
// El guardián de símbolos viaja junto porque tiene la misma naturaleza: revisa
// que la hoja sea EJECUTABLE antes de entregarla. Nació de un error real en la
// memoria del verificador de secciones —un bloque que definía una variable
// quedaba detrás de un filtro y la hoja llegaba rota al canvas—, y el problema
// se repite en cualquier generador que arme regiones condicionalmente.
// ─────────────────────────────────────────────────────────────────────────────

import type { Item } from './worksheet-layout';
import type { Region } from './worksheet';

const STORAGE_KEY = 'structpad.worksheet.v1';

/** El formato que leen el canvas, el import/export y `verify:planilla`. */
export interface HojaCanvas {
  version: 1;
  meta: { titulo: string; esperadoFalso?: Record<string, string> };
  regions: Region[];
}

/** Funciones y constantes que el motor del canvas ya trae en su scope. */
const INTRINSECOS = new Set([
  'pi', 'e', 'sqrt', 'abs', 'min', 'max', 'sin', 'cos', 'tan', 'log', 'exp',
  'kgf', 'cm', 'tonf', 'tf', 'm', 'mm', 'kg', 'N', 'kN', 'MPa', 'Pa',
]);

/**
 * Símbolos que una región DEFINE (`nombre := …`) y los que USA.
 *
 * Es un análisis léxico deliberadamente simple: alcanza porque estas hojas las
 * genera código, no una persona, y la gramática de sus filas es la de
 * `parseMathRegion`.
 */
function simbolos(src: string): { define: string | null; usa: string[] } {
  const def = src.match(/^\s*([A-Za-z_]\w*)\s*:=/);
  const cuerpo = def ? src.slice(src.indexOf(':=') + 2) : src;
  const usa = (cuerpo.match(/[A-Za-z_]\w*/g) ?? []).filter((s) => !INTRINSECOS.has(s));
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
    if (it.kind === 'text') continue;
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
 * Escribe la hoja en el slot del canvas y navega. `loadInitial()` de MathCanvas
 * lee esa clave al montar, así que la hoja aparece cargada.
 */
export function abrirEnCanvas(hoja: { regions: Region[] }): void {
  if (typeof window === 'undefined') return;
  try {
    const previo = window.localStorage.getItem(STORAGE_KEY);
    if (previo) {
      const data = JSON.parse(previo) as { regions?: unknown[] };
      const hayTrabajo = Array.isArray(data.regions) && data.regions.length > 0;
      if (hayTrabajo && !window.confirm('El canvas tiene una hoja guardada. ¿Reemplazarla por esta?')) {
        return;
      }
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, regions: hoja.regions })
    );
  } catch {
    window.alert('No se pudo escribir en el almacenamiento local del navegador.');
    return;
  }
  window.location.href = '/';
}

/** Descarga la hoja como .json — el mismo formato que `verify:planilla` lee. */
export function descargarHoja(hoja: unknown, nombreArchivo: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([JSON.stringify(hoja, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}
