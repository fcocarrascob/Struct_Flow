import type { MetaPlanilla } from '../../lib/biblioteca/contrato';
import { hayTrabajoGuardado, STORAGE_KEY } from '../../lib/hoja-guardada';
import { navegar } from '../../lib/ruta';
import type { Region } from '../../lib/worksheet';

/**
 * Dónde espera una hoja que otra vista mandó al canvas, hasta que el canvas la
 * abre.
 *
 * NO ES LA CLAVE DE LA HOJA. `abrirEnCanvas` de `src/lib/canvas-handoff.ts`
 * escribía directo en `STORAGE_KEY` y recargaba: la hoja del usuario quedaba
 * pisada antes de que el canvas existiera, así que su historial nacía vacío y
 * Ctrl+Z no la recuperaba. Dejándola aquí, el canvas arranca con la hoja de
 * siempre y la reemplaza con `cargarHoja` —el mismo embudo que abrir una planilla
 * del catálogo—, que sí entra en el deshacer.
 */
export const CLAVE_ENTRANTE = `${STORAGE_KEY}.entrante`;

/**
 * Manda una hoja al canvas y navega a él. Pregunta antes si hay trabajo que
 * reemplazar; se puede deshacer igual, pero reemplazar no deja de ser un salto.
 */
export function abrirEnCanvas(hoja: { meta?: MetaPlanilla; regions: Region[] }): void {
  if (hayTrabajoGuardado() && !window.confirm('El canvas tiene una hoja guardada. ¿Reemplazarla por esta?')) {
    return;
  }
  try {
    window.localStorage.setItem(
      CLAVE_ENTRANTE,
      JSON.stringify({ version: 1, ...(hoja.meta ? { meta: hoja.meta } : {}), regions: hoja.regions }),
    );
  } catch {
    window.alert('No se pudo escribir en el almacenamiento local del navegador.');
    return;
  }
  navegar({ vista: 'canvas' });
}

/** La hoja que espera, y la retira: se abre una sola vez. */
export function tomarEntrante(): unknown {
  try {
    const raw = window.localStorage.getItem(CLAVE_ENTRANTE);
    if (!raw) return null;
    window.localStorage.removeItem(CLAVE_ENTRANTE);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
