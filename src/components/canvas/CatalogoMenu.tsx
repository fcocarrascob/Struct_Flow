import { useEffect, useMemo, useRef, useState } from 'react';
import type { Template } from '../../lib/worksheet-templates';
import { TITULOS, agruparPorClase } from '../../lib/catalogo';
import { useIndice } from '../useIndice';

interface Props {
  plantillas: readonly Template[];
  onPlantilla: (tpl: Template) => void;
  onPlanilla: (slug: string) => void;
  onCerrar: () => void;
}

/**
 * El catálogo: las plantillas editables del bundle y las planillas publicadas.
 *
 * Son cosas distintas y por eso van separadas. Una **plantilla** es un punto de
 * partida pensado para editarse; una **planilla** es una memoria de cálculo
 * completa y ya resuelta, la misma que acompaña al post.
 *
 * Este desplegable se conserva aunque exista la página `/planillas`: estando
 * dentro del canvas, abrir un ejemplo sin salir de la hoja es justo lo cómodo.
 * Lo que dejó de ser es el único acceso al corpus.
 */
export default function CatalogoMenu({ plantillas, onPlantilla, onPlanilla, onCerrar }: Props) {
  const { indice, error } = useIndice();
  const [filtro, setFiltro] = useState('');
  const buscador = useRef<HTMLInputElement>(null);

  useEffect(() => {
    buscador.current?.focus();
  }, []);

  const q = filtro.trim().toLowerCase();
  const coincide = (texto: string) => !q || texto.toLowerCase().includes(q);

  const plantillasVisibles = useMemo(
    () => plantillas.filter((t) => coincide(`${t.titulo} ${t.norma} ${t.id}`)),
    [plantillas, q],
  );

  const secciones = useMemo(
    () => agruparPorClase((indice ?? []).filter((e) => coincide(`${e.titulo} ${e.slug}`))),
    [indice, q],
  );

  const nada = plantillasVisibles.length === 0 && secciones.length === 0;

  return (
    <>
      {/* Capa para cerrar el menú al hacer clic fuera. */}
      <div className="fixed inset-0 z-30" onClick={onCerrar} />
      <div className="absolute left-0 top-full z-40 mt-1 flex max-h-[26rem] w-96 flex-col rounded border border-border bg-white shadow-lg">
        <div className="border-b border-border p-2">
          <input
            ref={buscador}
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onCerrar()}
            placeholder="Buscar entre las plantillas y los ejemplos…"
            aria-label="Buscar en el catálogo"
            className="w-full rounded border border-border px-2 py-1 text-xs text-ink outline-none focus:border-accent"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {plantillasVisibles.length > 0 && (
            <>
              <p className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Plantillas
              </p>
              {plantillasVisibles.map((tpl) => (
                <button
                  key={tpl.id}
                  className="block w-full px-3 py-1.5 text-left hover:bg-accent/10"
                  onClick={() => onPlantilla(tpl)}
                >
                  <span className="block text-xs font-medium text-ink">{tpl.titulo}</span>
                  <span className="block text-[10px] text-muted">{tpl.norma}</span>
                </button>
              ))}
            </>
          )}

          {secciones.map((s) => (
            <div key={s.clase}>
              <p className="border-t border-border px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-ink">
                {s.titulo}
              </p>
              {s.grupos.map(([disciplina, entradas]) => (
                <div key={disciplina}>
                  <p className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {TITULOS[disciplina] ?? disciplina}
                  </p>
                  {entradas.map((e) => (
                    <button
                      key={e.slug}
                      className="block w-full px-3 py-1.5 text-left hover:bg-accent/10"
                      onClick={() => onPlanilla(e.slug)}
                      title={e.titulo}
                    >
                      <span className="block truncate text-xs font-medium text-ink">{e.titulo}</span>
                      <span className="block text-[10px] text-muted">
                        {e.slug} · {e.regiones} bloques
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}

          {indice === null && !error && (
            <p className="px-3 py-2 text-[11px] text-muted">Cargando los ejemplos…</p>
          )}
          {error && (
            <p className="px-3 py-2 text-[11px] text-muted">
              No se pudo cargar el catálogo de ejemplos. Genera el índice con{' '}
              <code className="font-mono">npm run indice:planillas</code>.
            </p>
          )}
          {nada && indice !== null && (
            <p className="px-3 py-2 text-[11px] text-muted">
              Nada coincide con «{filtro.trim()}».
            </p>
          )}
        </div>
      </div>
    </>
  );
}
