// El contrato JSON de una hoja del canvas: qué es una región utilizable, qué
// tiene forma de hoja, y cómo se sanea lo que llega de fuera.
//
// Vivía dentro de `MathCanvas.tsx`, que ya iba por 1.200 líneas. Sale aquí
// porque no es UI —no toca React ni el DOM— y porque el portapapeles de
// fragmentos (`fragmento.ts`) necesita exactamente las mismas comprobaciones:
// tenerlas en dos sitios sería tener dos contratos.

import type { Region } from './worksheet';
import type { MetaPlanilla } from './biblioteca/contrato';
import { motivoDeGrafico, type CodigoGrafico } from './grafico';
import { motivoDeTabla, type CodigoTabla } from './tabla';

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

const KINDS: ReadonlySet<string> = new Set(['math', 'text', 'program', 'image', 'plot', 'table']);

/**
 * ¿Es una región utilizable? Hay que comprobarlo de verdad, región por región:
 * el motor NO delata las malformadas con un error en su región, como se creía.
 * `evaluateSheet` hace `region.src.trim()` sin red, así que una entrada sin
 * `src` lanza dentro del `useMemo` de render y, sin ErrorBoundary, React
 * desmonta la raíz y deja la pantalla en blanco. Y la vía principal de entrada
 * es pegar el JSON que acaba de escribir un chat.
 */
export function esRegion(r: unknown): r is Region {
  return motivoDeRegion(r) === null;
}

/** Por qué una entrada del JSON no sirve como región. Códigos, no prosa: la
 *  redacción vive fuera de `src/lib`, donde cambiarla no mueve el sello del
 *  motor ni obliga a resellar las 33 planillas por afinar una frase. */
export type MotivoDescarte = 'no-es-objeto' | 'sin-src' | 'kind' | 'coordenadas' | 'grafico' | 'tabla';

/**
 * Por qué esa entrada no sirve, o `null` si sirve.
 *
 * Es la primitiva, y `esRegion` su envoltorio, para que el motivo que se le
 * enseña al usuario y la decisión de descartarla salgan de LA MISMA
 * comprobación. Con dos, bastaría añadir un `kind` en una para que el aviso
 * dijera algo que el filtro no hace.
 *
 * El orden de las ramas es el de la comprobación original y se devuelve al
 * primer fallo: un bloque sin `src` y además sin `x` se reporta como `sin-src`,
 * que es el problema que hay que arreglar primero.
 */
export function motivoDeRegion(r: unknown): MotivoDescarte | null {
  if (!r || typeof r !== 'object') return 'no-es-objeto';
  const c = r as Partial<Region>;
  if (typeof c.src !== 'string') return 'sin-src';
  if (typeof c.kind !== 'string' || !KINDS.has(c.kind)) return 'kind';
  if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) return 'coordenadas';
  // Un gráfico sin una especificación con forma de gráfico no se puede ni
  // evaluar ni dibujar; qué le falta lo dice `motivoDeGrafico` en el informe.
  if (c.kind === 'plot' && motivoDeGrafico(c.grafico) !== null) return 'grafico';
  // Lo mismo para una tabla: sin una grilla rectangular de textos no hay qué evaluar.
  if (c.kind === 'table' && motivoDeTabla(c.tabla) !== null) return 'tabla';
  return null;
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
export const sanearRegiones = (regions: unknown[]): Region[] => sanearConInforme(regions).regions;

/** Una entrada que no llegó a ser región. */
export interface RegionDescartada {
  /** Su posición en el array `regions` del JSON, empezando en 1. Es lo único que
   *  la identifica —una región sin `id` válido no tiene otro nombre— y es lo que
   *  hay que citar para pedir la corrección donde se escribió el JSON. */
  posicion: number;
  motivo: MotivoDescarte;
  /** El `kind` tal como venía, si era una cadena. `"formula"` en vez de `"math"`
   *  es el error que más manda un chat, y nombrarlo ahorra el viaje. */
  kind?: string;
  /** Con el motivo `grafico` o `tabla`: qué parte de la especificación falla. */
  detalle?: CodigoGrafico | CodigoTabla;
}

export interface InformeSaneo {
  regions: Region[];
  descartadas: RegionDescartada[];
  /** Cuántos ids hubo que reasignar. No es una pérdida —la región entra igual—,
   *  pero explica por qué los ids del archivo no son los de la hoja. */
  idsReasignados: number;
}

/**
 * Lo mismo que `sanearRegiones`, diciendo qué se quedó por el camino.
 *
 * `sanearRegiones` se implementa ENCIMA de esta y no al lado: así los cuatro
 * consumidores que no quieren el informe conservan por construcción los mismos
 * ids, el mismo orden y el mismo clonado. Dos implementaciones paralelas serían
 * dos contratos, que es justo lo que se evitó al sacar este archivo de
 * `MathCanvas.tsx`.
 *
 * Hace falta porque la pérdida es el caso ESPERADO y no un accidente: `esHoja`
 * acepta el archivo con una sola región válida —rechazarlo entero por una mala
 * sería peor que perder esa una—, y la vía principal de entrada es pegar el JSON
 * que acaba de escribir un chat. Hasta ahora se cargaban 3 de 8 sin una palabra.
 */
export function sanearConInforme(regions: unknown[]): InformeSaneo {
  const vistos = new Set<string>();
  const buenas: Region[] = [];
  const descartadas: RegionDescartada[] = [];
  let idsReasignados = 0;
  regions.forEach((r, i) => {
    const motivo = motivoDeRegion(r);
    if (motivo !== null) {
      // El `kind` solo cuando ES el problema, y solo si era una cadena: con
      // `kind: 3` se interpolaría un «3» como si fuera algo que alguien escribió,
      // y en un bloque sin `src` el `kind` correcto no explica nada.
      const kind = (r as { kind?: unknown } | null)?.kind;
      const detalle =
        motivo === 'grafico'
          ? motivoDeGrafico((r as { grafico?: unknown }).grafico)
          : motivo === 'tabla'
            ? motivoDeTabla((r as { tabla?: unknown }).tabla)
            : null;
      descartadas.push({
        posicion: i + 1,
        motivo,
        ...(motivo === 'kind' && typeof kind === 'string' ? { kind } : {}),
        ...(detalle ? { detalle } : {}),
      });
      return;
    }
    const reg = r as Region;
    // Un id que no es texto (`{}`, un número) se convierte en clave de `results`
    // por su `String()`: dos `{}` compartirían «[object Object]».
    const propio = typeof reg.id === 'string' && reg.id !== '' && !vistos.has(reg.id);
    if (!propio) idsReasignados++;
    const id = propio ? reg.id : newId();
    vistos.add(id);
    buenas.push({ ...reg, id });
  });
  return { regions: buenas, descartadas, idsReasignados };
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
