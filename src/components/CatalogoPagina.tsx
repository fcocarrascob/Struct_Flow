import { useMemo, useState } from 'react';
import { TITULOS, agruparPorDisciplina, partirTitulo } from '../lib/catalogo';
import Enlace from './Enlace';
import { useIndice } from './useIndice';

/**
 * El catálogo completo como página.
 *
 * El mismo índice que puebla el desplegable de la barra del canvas, pero con
 * sitio para respirar: los títulos del corpus llegan a 200 caracteres y en una
 * línea de menú salían truncados. Aquí se parten por el guion largo — antes, el
 * nombre; después, el matiz.
 */
export default function CatalogoPagina() {
  const { indice, error } = useIndice();
  const [filtro, setFiltro] = useState('');

  const q = filtro.trim().toLowerCase();
  const grupos = useMemo(
    () =>
      agruparPorDisciplina(
        (indice ?? []).filter(
          (e) => !q || `${e.titulo} ${e.slug}`.toLowerCase().includes(q),
        ),
      ),
    [indice, q],
  );
  const total = grupos.reduce((n, [, es]) => n + es.length, 0);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <nav className="mb-2 text-xs text-muted">
        <Enlace a={{ vista: 'inicio' }} className="hover:text-accent">
          Inicio
        </Enlace>
        {' / Planillas'}
      </nav>

      <header className="mb-5">
        <h1 className="text-xl font-semibold text-ink">Planillas</h1>
        <p className="mt-1 text-sm text-muted">
          Memorias de cálculo resueltas. Al abrir una se carga en el canvas, donde se puede editar,
          recalcular con otros datos e imprimir.
        </p>
      </header>

      <input
        type="search"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Buscar por título, norma o slug…"
        aria-label="Buscar entre las planillas"
        className="mb-6 w-full rounded border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
      />

      {indice === null && !error && <p className="text-sm text-muted">Cargando el catálogo…</p>}
      {error && (
        <p className="text-sm text-muted">
          No se pudo cargar el catálogo. Genera el índice con{' '}
          <code className="font-mono">npm run indice:planillas</code>.
        </p>
      )}
      {indice !== null && total === 0 && (
        <p className="text-sm text-muted">Nada coincide con «{filtro.trim()}».</p>
      )}

      <div className="space-y-8">
        {grupos.map(([disciplina, entradas]) => (
          <section key={disciplina}>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {TITULOS[disciplina] ?? disciplina} · {entradas.length}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {entradas.map((e) => {
                const { nombre, detalle } = partirTitulo(e.titulo);
                return (
                  <li key={e.slug}>
                    <Enlace
                      a={{ vista: 'canvas' }}
                      busqueda={`?planilla=${e.slug}`}
                      title={e.titulo}
                      className="group flex h-full flex-col rounded border border-border bg-white p-3 no-underline hover:border-accent"
                    >
                      <span className="text-xs font-medium text-ink group-hover:text-accent">
                        {nombre}
                      </span>
                      {detalle && (
                        <span className="mt-1 line-clamp-3 text-[11px] leading-snug text-muted">
                          {detalle}
                        </span>
                      )}
                      <span className="mt-2 font-mono text-[10px] text-muted">
                        {e.slug} · {e.regiones} bloques
                      </span>
                    </Enlace>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
