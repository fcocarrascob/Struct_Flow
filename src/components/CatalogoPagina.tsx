import { useMemo, useState } from 'react';
import { TITULOS, agruparPorClase, partirTitulo, type EntradaIndice } from '../lib/catalogo';
import Enlace from './Enlace';
import { useIndice } from './useIndice';

/** Lo que el buscador compara: título, slug, claves de norma y resumen. */
function textoBuscable(e: EntradaIndice): string {
  return `${e.titulo} ${e.slug} ${(e.normas ?? []).join(' ')} ${e.resumen ?? ''}`.toLowerCase();
}

function Tarjeta({ e }: { e: EntradaIndice }) {
  const { nombre, detalle } = partirTitulo(e.titulo);
  const generica = e.clase === 'generica';
  // En una genérica el resumen dice qué resuelve; el matiz del título, cómo.
  const bajada = generica ? e.resumen ?? detalle : detalle;
  return (
    // Dos enlaces hermanos y no uno dentro de otro: un <a> anidado es HTML
    // inválido y el navegador lo saca fuera de la tarjeta.
    <div className="flex h-full flex-col rounded border border-border bg-white hover:border-accent">
      <Enlace
        a={{ vista: 'canvas' }}
        busqueda={`?planilla=${e.slug}`}
        title={e.titulo}
        className="group flex flex-1 flex-col p-3 no-underline"
      >
        <span className="text-xs font-medium text-ink group-hover:text-accent">{nombre}</span>
        {bajada && (
          <span className="mt-1 line-clamp-3 text-[11px] leading-snug text-muted">{bajada}</span>
        )}
        {generica && e.normas?.length > 0 && (
          <span className="mt-1.5 font-mono text-[10px] text-ink/70">{e.normas.join(' · ')}</span>
        )}
        <span className="mt-2 font-mono text-[10px] text-muted">
          {e.slug} · {e.regiones} bloques
          {generica && ` · ${e.entradas} entradas`}
        </span>
      </Enlace>
      {e.promovible && (
        <Enlace
          a={{ vista: 'modulo', id: e.slug }}
          title="Abrir como módulo de diseño: formulario, resultados en vivo y memoria exportable"
          className="border-t border-border px-3 py-1.5 text-[11px] font-medium text-accent no-underline hover:bg-accent/5"
        >
          Diseñar →
        </Enlace>
      )}
    </div>
  );
}

/**
 * El catálogo completo como página.
 *
 * El mismo índice que puebla el desplegable de la barra del canvas, pero con
 * sitio para respirar: los títulos del corpus llegan a 200 caracteres y en una
 * línea de menú salían truncados. Aquí se parten por el guion largo — antes, el
 * nombre; después, el matiz.
 *
 * Dos secciones porque son dos cosas: la **biblioteca genérica** es lo que el
 * harness instancia en cada proyecto —con entradas declaradas y casos que la
 * verifican—, y los **ejemplos** son memorias cerradas que acompañan a un post.
 */
export default function CatalogoPagina() {
  const { indice, error } = useIndice();
  const [filtro, setFiltro] = useState('');

  const q = filtro.trim().toLowerCase();
  const secciones = useMemo(
    () => agruparPorClase((indice ?? []).filter((e) => !q || textoBuscable(e).includes(q))),
    [indice, q],
  );
  const total = secciones.reduce(
    (n, s) => n + s.grupos.reduce((m, [, es]) => m + es.length, 0),
    0,
  );

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
          La biblioteca de hojas genéricas y los ejemplos resueltos. Al abrir una se carga en el
          canvas, donde se puede editar, recalcular con otros datos e imprimir.
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

      <div className="space-y-12">
        {secciones.map((s) => (
          <section key={s.clase} aria-labelledby={`clase-${s.clase}`}>
            <header className="mb-4 border-b border-border pb-2">
              <h2 id={`clase-${s.clase}`} className="text-base font-semibold text-ink">
                {s.titulo}
              </h2>
              <p className="mt-0.5 text-xs text-muted">{s.detalle}</p>
            </header>
            <div className="space-y-8">
              {s.grupos.map(([disciplina, entradas]) => (
                <section key={disciplina}>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {TITULOS[disciplina] ?? disciplina} · {entradas.length}
                  </h3>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {entradas.map((e) => (
                      <li key={e.slug}>
                        <Tarjeta e={e} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
