// ─────────────────────────────────────────────────────────────────────────────
// El slot de `localStorage` donde el canvas autoguarda la hoja en curso.
//
// La clave estaba escrita en tres sitios (`MathCanvas`, `canvas-handoff` y
// ahora la landing, que ofrece «continuar donde ibas»). Es el tipo de constante
// que, duplicada, se cambia en dos de tres.
// ─────────────────────────────────────────────────────────────────────────────

export const STORAGE_KEY = 'structpad.worksheet.v1';

/**
 * ¿Hay trabajo guardado que valga la pena no pisar?
 *
 * Se consulta el `localStorage` y no el estado de React, porque quien pregunta
 * —un deep-link, la landing— corre antes de que el usuario haya tocado nada.
 *
 * La hoja de ejemplo no cuenta. El autoguardado la persiste a los 300 ms de
 * montar, así que sin esta salvedad el diálogo de reemplazo salía SIEMPRE,
 * incluso sobre una hoja que el usuario nunca editó.
 */
export function hayTrabajoGuardado(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(data?.regions)) return false;
    if (data.demo) return false;
    return data.regions.some((r: { src?: string }) => r?.src?.trim());
  } catch {
    return false;
  }
}
