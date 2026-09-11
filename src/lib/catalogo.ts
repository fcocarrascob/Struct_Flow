// ─────────────────────────────────────────────────────────────────────────────
// El índice del catálogo de planillas publicadas.
//
// Vivía dentro de `CatalogoMenu.tsx`, que es un desplegable de la barra del
// canvas. Ahora hay dos consumidores —ese menú y la página `/planillas`— y nada
// de esto es presentación: la descarga, la caché de sesión y los nombres de las
// disciplinas se comparten.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una planilla publicada, tal como la describe `public/planillas-indice.json`
 * (versión 2: ejemplos del blog y genéricas de la biblioteca en un solo índice).
 */
export interface EntradaIndice {
  slug: string;
  titulo: string;
  /** `generica` (public/biblioteca/) o `ejemplo` (public/planillas/). */
  clase: 'generica' | 'ejemplo';
  disciplina: string;
  /** Ruta servida del JSON, con la barra inicial: `/biblioteca/acero/x.json`. */
  ruta: string;
  regiones: number;
  /** Claves del catálogo del harness (`US/AISC360-22`). */
  normas: string[];
  entradas: number;
  salidas: number;
  /** Genérica con entradas y salidas declaradas: se puede abrir en `/diseno/<slug>`. */
  promovible: boolean;
  sha256: string;
  resumen?: string;
}

/** Nombres de sección; los del índice vienen en minúscula y sin tilde. */
export const TITULOS: Record<string, string> = {
  hormigon: 'Hormigón',
  acero: 'Acero',
  geotecnia: 'Geotecnia',
  acciones: 'Acciones',
  apuntes: 'Apuntes',
  otros: 'Otros',
};

/** Orden de las disciplinas; lo que no esté aquí va al final, alfabético. */
export const ORDEN = ['hormigon', 'acero', 'geotecnia', 'acciones', 'apuntes', 'otros'];

/** Nombre de cada clase en el catálogo, en el orden en que se muestran. */
export const CLASES_CATALOGO: { clase: EntradaIndice['clase']; titulo: string; detalle: string }[] = [
  {
    clase: 'generica',
    titulo: 'Biblioteca genérica',
    detalle:
      'Hojas con entradas declaradas y casos de prueba. Se instancian por proyecto; no se editan en sitio.',
  },
  {
    clase: 'ejemplo',
    titulo: 'Ejemplos resueltos',
    detalle: 'Memorias completas que acompañan a un artículo del blog.',
  },
];

/**
 * El índice, descargado una vez por sesión. La promesa se cachea, no el
 * resultado: si el menú y la página se montan a la vez, hay una sola petición.
 */
let pendiente: Promise<EntradaIndice[]> | null = null;

export function cargarIndice(): Promise<EntradaIndice[]> {
  if (!pendiente) {
    pendiente = fetch('/planillas-indice.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!Array.isArray(d?.planillas)) throw new Error('índice inválido');
        return d.planillas as EntradaIndice[];
      })
      .catch((err) => {
        // Sin esto, un fallo de red dejaría la promesa rechazada cacheada para
        // siempre y reabrir el menú nunca reintentaría.
        pendiente = null;
        throw err;
      });
  }
  return pendiente;
}

/**
 * Dónde se sirve una planilla: la `ruta` del índice y, si el índice no la trae
 * o no carga, `/planillas/<slug>.json`, que es donde vivían todas antes de la
 * biblioteca. El fallback mantiene vivos los deep-links publicados aunque el
 * índice falle.
 */
export async function rutaDePlanilla(slug: string): Promise<string> {
  const porDefecto = `/planillas/${slug}.json`;
  try {
    const e = (await cargarIndice()).find((x) => x.slug === slug);
    // La ruta sale de un archivo servido por el propio sitio, pero igual se
    // acota: tiene que ser un JSON bajo la raíz, sin subir de directorio.
    return e?.ruta && /^\/[a-z0-9/-]+\.json$/.test(e.ruta) && !e.ruta.includes('..') ? e.ruta : porDefecto;
  } catch {
    return porDefecto;
  }
}

/** Agrupa por clase en el orden de `CLASES_CATALOGO`; cada clase, por disciplina. */
export function agruparPorClase(
  entradas: EntradaIndice[],
): { clase: EntradaIndice['clase']; titulo: string; detalle: string; grupos: [string, EntradaIndice[]][] }[] {
  return CLASES_CATALOGO.map((c) => ({
    ...c,
    // Un índice v1 (sin `clase`) cae entero en los ejemplos, que es lo que era.
    grupos: agruparPorDisciplina(entradas.filter((e) => (e.clase ?? 'ejemplo') === c.clase)),
  })).filter((c) => c.grupos.length > 0);
}

/** Agrupa por disciplina en el orden de `ORDEN`. */
export function agruparPorDisciplina(entradas: EntradaIndice[]): [string, EntradaIndice[]][] {
  const porDisciplina = new Map<string, EntradaIndice[]>();
  for (const e of entradas) {
    const lista = porDisciplina.get(e.disciplina) ?? [];
    lista.push(e);
    porDisciplina.set(e.disciplina, lista);
  }
  return [...porDisciplina.entries()].sort(([a], [b]) => {
    const ia = ORDEN.indexOf(a);
    const ib = ORDEN.indexOf(b);
    return (ia < 0 ? ORDEN.length : ia) - (ib < 0 ? ORDEN.length : ib) || a.localeCompare(b);
  });
}

/**
 * Los títulos del corpus son frases largas con la forma «Nombre — el matiz».
 * Para una tarjeta hace falta separarlos; en una línea de menú no.
 *
 * El guion largo es el separador porque lo usan 30 de las 33; si no está, todo
 * el título es el nombre y no se inventa un resumen.
 */
export function partirTitulo(titulo: string): { nombre: string; detalle?: string } {
  const i = titulo.indexOf(' — ');
  if (i < 0) return { nombre: titulo };
  return { nombre: titulo.slice(0, i), detalle: titulo.slice(i + 3) };
}
