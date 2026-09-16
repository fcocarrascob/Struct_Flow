import { useEffect, useMemo, useState } from 'react';
import { listarPromovibles, type EntradaIndice } from './biblioteca';

/**
 * El catálogo de genéricas importables.
 *
 * Solo las **promovibles**: una genérica con entradas y salidas declaradas, que
 * es la condición para instanciarla sin tocarla a mano. Quién lo es lo dice
 * `public/biblioteca-indice.json`, que `npm run dev` y `npm run build`
 * regeneran; no hay una segunda lista que mantener acá.
 *
 * Cada ficha muestra la norma como CLAVE del catálogo del harness
 * (`US/ACI318-25-SI`) y no como prosa: es lo que permite comprobar después que
 * esa norma está calibrada.
 */
export default function SelectorGenerica({
  onElegir,
  onCancelar,
}: {
  onElegir: (slug: string) => void;
  /** Sin él no se muestra el botón: en un nodo vacío no hay nada que cancelar. */
  onCancelar?: () => void;
}) {
  const [entradas, setEntradas] = useState<EntradaIndice[] | null>(null);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    let vivo = true;
    listarPromovibles()
      .then((e) => vivo && setEntradas(e))
      .catch((e: Error) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return entradas ?? [];
    return (entradas ?? []).filter((e) =>
      `${e.titulo} ${e.slug} ${e.disciplina} ${(e.normas ?? []).join(' ')}`
        .toLowerCase()
        .includes(q),
    );
  }, [entradas, filtro]);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          Planillas genéricas verificadas
        </h3>
        {onCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
          >
            cancelar
          </button>
        )}
      </div>

      <input
        type="search"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Buscar por título, norma o disciplina…"
        aria-label="Buscar en la biblioteca"
        className="w-full rounded border border-border bg-white px-2 py-1 text-xs text-ink outline-none focus:border-accent"
      />

      {error && <p className="mt-2 text-[11px] leading-snug text-error">{error}</p>}
      {!error && entradas === null && (
        <p className="mt-2 text-[11px] text-muted">Consultando la biblioteca…</p>
      )}
      {entradas !== null && visibles.length === 0 && (
        <p className="mt-2 text-[11px] leading-snug text-muted">
          {filtro
            ? 'Ninguna genérica coincide.'
            : 'La biblioteca no tiene genéricas promovibles todavía.'}
        </p>
      )}

      <ul className="mt-1">
        {visibles.map((e) => (
          <li key={e.slug}>
            <button
              type="button"
              onClick={() => onElegir(e.slug)}
              className="block w-full border-b border-border/60 py-1.5 text-left hover:bg-ink/5"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-medium text-ink">{e.titulo}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
                  {e.disciplina}
                </span>
              </span>
              <span className="mt-0.5 block truncate font-mono text-[10px] text-muted">
                {(e.normas ?? []).join(' · ') || e.slug}
              </span>
              <span className="block text-[10px] text-muted">
                {e.entradas} entradas · {e.salidas} salidas
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
