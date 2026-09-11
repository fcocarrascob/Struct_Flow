import { useCallback, useEffect, useMemo, useState } from 'react';
import WorksheetPrint from '../canvas/WorksheetPrint';
import { medirBloques } from '../canvas/usePaginacion';
import { A4_ALTO_UTIL_PX, paginar } from '../../lib/paginacion';
import { evaluateSheet, type Region, type SheetResults } from '../../lib/worksheet';
import { sanearRegiones } from '../../lib/hoja-json';
import { cargarIndice } from '../../lib/catalogo';

/**
 * Cuántas páginas A4 ocupa hoy cada planilla publicada.
 *
 * Es la línea base contra la que se comparará todo lo que venga después: el
 * renderizado unificado, la impresión absoluta y la migración del corpus mueven
 * los cortes, y sin un antes escrito no hay forma de distinguir un cambio
 * esperado de una regresión.
 *
 * Mide con el pipeline de verdad —`WorksheetPrint` + `medirBloques` +
 * `paginar()`—, no con una reimplementación: medir con una copia sería medir la
 * copia. Y por eso hay que medir en un navegador — KaTeX compone en el DOM, y en
 * Node no hay alturas que leer.
 *
 * Va de una en una y no todas a la vez porque `medirBloques` destapa el
 * documento de impresión, que es único en el `<body>`.
 */
interface Fila {
  slug: string;
  regiones: number;
  paginas: number;
  /** Bloques más altos que una página entera: se imprimen desbordados. */
  largos: number;
  /** El bloque más alto, en px. Delata la figura que fuerza un corte. */
  altoMax: number;
}

type Estado = 'inicio' | 'midiendo' | 'listo' | 'error';

export default function TablaDePaginas() {
  const [slugs, setSlugs] = useState<string[] | null>(null);
  const [estado, setEstado] = useState<Estado>('inicio');
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [filas, setFilas] = useState<Fila[]>([]);
  /** La planilla que está montada ahora mismo en el documento de impresión. */
  const [actual, setActual] = useState<{
    slug: string;
    regions: Region[];
    results: SheetResults;
  } | null>(null);

  useEffect(() => {
    cargarIndice()
      // Solo los ejemplos: la línea base de `docs/linea-base-pagina.md` es la de
      // las 33 de `public/planillas/`, y es de ahí de donde se descargan abajo.
      .then((idx) => setSlugs(idx.filter((e) => (e.clase ?? 'ejemplo') === 'ejemplo').map((e) => e.slug)))
      .catch(() => setError('No se pudo cargar public/planillas-indice.json'));
  }, []);

  const empezar = useCallback(() => {
    setFilas([]);
    setI(0);
    setError(null);
    setEstado('midiendo');
  }, []);

  // Paso 1 — descargar y evaluar la planilla que toca, y montarla.
  useEffect(() => {
    if (estado !== 'midiendo' || !slugs) return;
    if (i >= slugs.length) {
      setActual(null);
      setEstado('listo');
      return;
    }
    let cancelado = false;
    const slug = slugs[i];
    fetch(`/planillas/${slug}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { regions?: unknown[] }) => {
        if (cancelado) return;
        const regions = sanearRegiones(data.regions ?? []);
        setActual({ slug, regions, results: evaluateSheet(regions) });
      })
      .catch(() => {
        if (cancelado) return;
        setError(`No se pudo cargar la planilla ${slug}.`);
        setEstado('error');
      });
    return () => {
      cancelado = true;
    };
  }, [estado, slugs, i]);

  // Paso 2 — medir lo montado y pasar a la siguiente.
  //
  // La misma espera que `usePaginacion`: las tipografías cambian el alto del
  // texto, así que medir antes de que carguen da una paginación que se corrige
  // sola un instante después.
  useEffect(() => {
    if (!actual) return;
    let cancelado = false;
    const t = setTimeout(() => {
      const listas = document.fonts?.ready ?? Promise.resolve();
      void listas.then(() =>
        requestAnimationFrame(() => {
          if (cancelado) return;
          const root = document.querySelector<HTMLElement>('.worksheet-print');
          if (!root) return;
          const saltos = new Set(actual.regions.filter((r) => r.pageBreak).map((r) => r.id));
          const bloques = medirBloques(root, saltos);
          setFilas((prev) => [
            ...prev,
            {
              slug: actual.slug,
              regiones: actual.regions.length,
              paginas: paginar(bloques).length,
              largos: bloques.filter((b) => b.alto > A4_ALTO_UTIL_PX).length,
              altoMax: Math.round(Math.max(0, ...bloques.map((b) => b.alto))),
            },
          ]);
          setI((n) => n + 1);
        }),
      );
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [actual]);

  const total = useMemo(() => filas.reduce((s, f) => s + f.paginas, 0), [filas]);

  /** La tabla en TSV, para pegarla en la nota de la línea base. */
  const tsv = useMemo(
    () =>
      ['slug\tregiones\tpaginas\tlargos\taltoMax']
        .concat(
          filas.map((f) => `${f.slug}\t${f.regiones}\t${f.paginas}\t${f.largos}\t${f.altoMax}`),
        )
        .concat(`TOTAL\t\t${total}\t\t`)
        .join('\n'),
    [filas, total],
  );

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded border border-border bg-white px-3 py-1.5 text-sm font-medium hover:border-accent hover:text-accent disabled:opacity-40"
          disabled={estado === 'midiendo' || !slugs}
          onClick={empezar}
        >
          {estado === 'listo' ? 'Volver a medir' : 'Medir las planillas'}
        </button>
        {slugs && (
          <span className="text-sm text-muted">
            {estado === 'midiendo'
              ? `midiendo ${i + 1} de ${slugs.length}…`
              : `${slugs.length} planillas publicadas`}
          </span>
        )}
        {filas.length > 0 && (
          <button
            className="rounded border border-border bg-white px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
            onClick={() => void navigator.clipboard?.writeText(tsv)}
          >
            Copiar como TSV
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {filas.length > 0 && (
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted">
              <th className="py-1.5 pr-3 font-medium">Planilla</th>
              <th className="py-1.5 pr-3 text-right font-medium">Regiones</th>
              <th className="py-1.5 pr-3 text-right font-medium">Páginas</th>
              <th className="py-1.5 pr-3 text-right font-medium">Bloque más alto</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.slug} className="border-b border-border/60">
                <td className="py-1 pr-3 font-mono text-[13px]">{f.slug}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{f.regiones}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{f.paginas}</td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {f.altoMax} px
                  {f.largos > 0 && (
                    <span className="ml-1 text-amber-700" title="más alto que una A4 entera">
                      ⚠ {f.largos}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            <tr className="font-medium">
              <td className="py-1.5 pr-3">Total</td>
              <td />
              <td className="py-1.5 pr-3 text-right tabular-nums">{total}</td>
              <td />
            </tr>
          </tbody>
        </table>
      )}

      {/* La planilla que se está midiendo. Está oculta (`.worksheet-print` es
          `display: none` en pantalla); `medirBloques` la destapa fuera de la
          pantalla el instante justo para leer los altos. */}
      {actual && <WorksheetPrint regions={actual.regions} results={actual.results} />}
    </section>
  );
}
