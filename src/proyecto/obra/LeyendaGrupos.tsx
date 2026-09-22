import { useState } from 'react';
import { FormularioGrupo } from './SelectorGrupo';
import type { Grupo } from './modelo';

/**
 * Los grupos de la obra, flotando sobre el lienzo.
 *
 * Clic en uno lo ENFOCA: atenúa todo lo que no es de él, con la misma mecánica
 * que el trazo de un nodo. Es lo que responde «¿dónde está todo el viento?» en
 * una obra de treinta nodos repartidos en cinco columnas.
 *
 * Flota en vez de empujar, igual que los avisos del canvas: montarla como
 * hermana del lienzo le robaría alto y haría saltar el grafo.
 */
export default function LeyendaGrupos({
  grupos,
  miembros,
  enfocado,
  onEnfocar,
  onCambiar,
  onBorrar,
}: {
  grupos: readonly Grupo[];
  /** Cuántos nodos del grafo lleva cada grupo, por id. */
  miembros: ReadonlyMap<string, number>;
  enfocado: string | null;
  onEnfocar: (id: string | null) => void;
  onCambiar: (id: string, nombre: string, color: string) => void;
  onBorrar: (id: string) => void;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  if (grupos.length === 0) return null;

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[15rem]">
      <div className="pointer-events-auto rounded-lg border border-border bg-white/95 p-2 shadow-sm">
        <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-wide text-muted">Grupos</p>
        <ul className="flex flex-col gap-0.5">
          {grupos.map((g) =>
            editando === g.id ? (
              <li key={g.id}>
                <FormularioGrupo
                  inicial={g}
                  accion="guardar"
                  onListo={(nombre, color) => {
                    onCambiar(g.id, nombre, color);
                    setEditando(null);
                  }}
                  onCancelar={() => setEditando(null)}
                />
              </li>
            ) : (
              <li key={g.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onEnfocar(enfocado === g.id ? null : g.id)}
                  aria-pressed={enfocado === g.id}
                  title={enfocado === g.id ? 'Mostrar toda la obra' : 'Resaltar solo este grupo'}
                  className={`flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] ${
                    enfocado === g.id ? 'bg-surface font-medium text-ink' : 'text-ink hover:bg-surface'
                  }`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} />
                  <span className="truncate">{g.nombre}</span>
                  <span className="ml-auto text-[10px] text-muted">{miembros.get(g.id) ?? 0}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditando(g.id)}
                  title="Renombrar o cambiar el color"
                  aria-label={`Editar el grupo ${g.nombre}`}
                  className="rounded px-1 text-[11px] text-muted opacity-0 hover:text-accent focus:opacity-100 group-hover:opacity-100"
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => onBorrar(g.id)}
                  title="Quitar el grupo (los nodos se quedan, sin grupo)"
                  aria-label={`Quitar el grupo ${g.nombre}`}
                  className="rounded px-1 text-[11px] text-muted opacity-0 hover:text-error focus:opacity-100 group-hover:opacity-100"
                >
                  ×
                </button>
              </li>
            ),
          )}
        </ul>
      </div>
    </div>
  );
}
