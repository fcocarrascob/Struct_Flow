// El contrato JSON de una hoja del canvas: qué es una región utilizable, qué
// tiene forma de hoja, y cómo se sanea lo que llega de fuera.
//
// Vivía dentro de `MathCanvas.tsx`, que ya iba por 1.200 líneas. Sale aquí
// porque no es UI —no toca React ni el DOM— y porque el portapapeles de
// fragmentos (`fragmento.ts`) necesita exactamente las mismas comprobaciones:
// tenerlas en dos sitios sería tener dos contratos.

import type { Region } from './worksheet';
import type { MetaPlanilla } from './biblioteca/contrato';

/** Ids pedidos en esta sesión: lo que distingue a dos del mismo milisegundo. */
let secuencia = 0;

/**
 * Id nuevo para una región.
 *
 * El contador es lo que lo hace único dentro de la sesión. Antes solo había
 * tiempo y cuatro caracteres al azar, y duplicar 650 bloques de golpe los pide
 * todos en el mismo milisegundo: con 1,7 millones de combinaciones, la paradoja
 * del cumpleaños daba un 12 % de probabilidad de repetir uno, y dos regiones
 * con el mismo id se mueven, se editan y se borran juntas. El azar se queda
 * para que no coincidan los de dos pestañas.
 */
export const newId = (): string =>
  `r${Date.now().toString(36)}${(secuencia++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const KINDS: ReadonlySet<string> = new Set(['math', 'text', 'program', 'image']);

/**
 * ¿Es una región utilizable? Hay que comprobarlo de verdad, región por región:
 * el motor NO delata las malformadas con un error en su región, como se creía.
 * `evaluateSheet` hace `region.src.trim()` sin red, así que una entrada sin
 * `src` lanza dentro del `useMemo` de render y, sin ErrorBoundary, React
 * desmonta la raíz y deja la pantalla en blanco. Y la vía principal de entrada
 * es pegar el JSON que acaba de escribir un chat.
 */
export function esRegion(r: unknown): r is Region {
  if (!r || typeof r !== 'object') return false;
  const c = r as Partial<Region>;
  return (
    typeof c.src === 'string' &&
    typeof c.kind === 'string' &&
    KINDS.has(c.kind) &&
    Number.isFinite(c.x) &&
    Number.isFinite(c.y)
  );
}

/**
 * Lo que se acepta como hoja: `regions` y, opcionalmente, `meta`. Del `meta`
 * solo se promete `titulo`; el resto es el contrato de `biblioteca/contrato.ts`
 * y viaja tal cual, sin validar aquí (lo valida `verify:planilla`).
 */
export interface HojaSuelta {
  regions: unknown[];
  meta?: { titulo?: string; [clave: string]: unknown };
}

/**
 * El `meta` que trae una hoja, si tiene forma de `meta`: un objeto con
 * `titulo`. Es lo que el canvas conserva para exportarlo y autoguardarlo; sin
 * esto, abrir una genérica y exportarla devolvía un JSON sin slug, sin normas y
 * sin entradas declaradas — una hoja que `harness.planilla` ya no reconoce.
 */
export function metaDe(data: unknown): MetaPlanilla | null {
  const meta = (data as { meta?: unknown } | null)?.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  return typeof (meta as { titulo?: unknown }).titulo === 'string' ? (meta as MetaPlanilla) : null;
}

/**
 * ¿Tiene forma de hoja del canvas? Se exige un `regions` que sea array y que
 * al menos una de sus entradas sea una región válida; las inservibles se
 * descartan luego en `sanearRegiones`. Rechazar el archivo entero por una
 * región mala sería peor que perder esa región.
 */
export function esHoja(data: unknown): data is HojaSuelta {
  const regions = (data as { regions?: unknown } | null)?.regions;
  return Array.isArray(regions) && (regions.length === 0 || regions.some(esRegion));
}

/**
 * Deja una lista de regiones utilizable: descarta las malformadas y **reasigna
 * los ids**.
 *
 * Los ids repetidos son frecuentes en el JSON que genera un chat, y comparten
 * entrada en `results` (que es un Record por id): las dos regiones muestran el
 * mismo resultado, comparten `key` de React y `updateRegion` las edita a la vez.
 */
export function sanearRegiones(regions: unknown[]): Region[] {
  const vistos = new Set<string>();
  return regions.filter(esRegion).map((r) => {
    // Un id que no es texto (`{}`, un número) se convierte en clave de `results`
    // por su `String()`: dos `{}` compartirían «[object Object]».
    const id = typeof r.id === 'string' && r.id && !vistos.has(r.id) ? r.id : newId();
    vistos.add(id);
    return { ...r, id };
  });
}

/**
 * Parsea el texto de una hoja —de un archivo o del portapapeles— y devuelve null
 * si no tiene forma de hoja.
 *
 * Tolera la valla de código porque la vía principal es pegar desde un chat, y ahí
 * los ```json vienen pegados al JSON más veces de las que no. Rechazarlo por eso
 * sería un no gratuito.
 */
export function parsearHoja(text: string): HojaSuelta | null {
  const data = parsearJson(text);
  return data !== null && esHoja(data) ? data : null;
}

/** El JSON de un texto pegado, tolerando la valla de código. `null` si no parsea. */
export function parsearJson(text: string): unknown {
  let limpio = text.trim();
  const valla = /^```[a-z]*\s*\n([\s\S]*?)\n?\s*```$/i.exec(limpio);
  if (valla) limpio = valla[1].trim();
  try {
    return JSON.parse(limpio) as unknown;
  } catch {
    return null;
  }
}
