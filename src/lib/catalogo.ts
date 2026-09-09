// ─────────────────────────────────────────────────────────────────────────────
// El índice del catálogo de planillas publicadas.
//
// Vivía dentro de `CatalogoMenu.tsx`, que es un desplegable de la barra del
// canvas. Ahora hay dos consumidores —ese menú y la página `/planillas`— y nada
// de esto es presentación: la descarga, la caché de sesión y los nombres de las
// disciplinas se comparten.
// ─────────────────────────────────────────────────────────────────────────────

/** Una planilla publicada, tal como la describe `public/planillas-indice.json`. */
export interface EntradaIndice {
  slug: string;
  titulo: string;
  disciplina: string;
  regiones: number;
}

/** Nombres de sección; los del índice vienen en minúscula y sin tilde. */
export const TITULOS: Record<string, string> = {
  hormigon: 'Hormigón',
  acero: 'Acero',
  geotecnia: 'Geotecnia',
  apuntes: 'Apuntes',
  otros: 'Otros',
};

/** Orden de las disciplinas; lo que no esté aquí va al final, alfabético. */
export const ORDEN = ['hormigon', 'acero', 'geotecnia', 'apuntes', 'otros'];

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
