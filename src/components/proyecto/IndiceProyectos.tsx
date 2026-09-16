import { useEffect, useState } from 'react';
import { listarProyectos } from '../../lib/proyecto/api';
import type { ProyectoListado } from '../../lib/proyecto/contrato';
import Enlace from '../Enlace';

/**
 * Los proyectos que el harness tiene en `proyectos/`.
 *
 * La lista sale del servidor local, no de este repo: los encargos viven en
 * Struct_Harness y acá no se guarda ninguna copia. Si el servidor no está
 * corriendo, esta pantalla lo dice en vez de quedarse vacía —una lista vacía se
 * lee como «no hay proyectos», que es exactamente lo contrario de lo que pasa—.
 */
export default function IndiceProyectos() {
  const [proyectos, setProyectos] = useState<ProyectoListado[] | null>(null);
  const [error, setError] = useState<{ motivo: string; detalle: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    listarProyectos()
      .then((p) => vivo && setProyectos(p))
      .catch((e: Error & { detalle?: string }) => {
        if (vivo) setError({ motivo: e.message, detalle: e.detalle ?? '' });
      });
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <nav className="mb-2 text-xs text-muted">
        <Enlace a={{ vista: 'inicio' }} className="hover:text-accent">
          Inicio
        </Enlace>
        {' / Proyectos'}
      </nav>

      <header className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Proyectos del harness</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          Cada proyecto se abre como un grafo: la norma que cubre cada rol, las acciones y sus
          cargas, las combinaciones, el modelo vigente, las hojas de valores, las planillas y los
          documentos que las publican. El color de un nodo es su desfase, no su tipo.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-aviso bg-white p-4">
          <p className="text-sm font-semibold text-aviso">{error.motivo}</p>
          {error.detalle && (
            <p className="mt-1 text-xs leading-relaxed text-muted">{error.detalle}</p>
          )}
        </div>
      )}

      {!error && proyectos === null && <p className="text-sm text-muted">Consultando…</p>}

      {proyectos !== null && proyectos.length === 0 && (
        <p className="text-sm text-muted">El servidor respondió, y no hay ningún proyecto.</p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {(proyectos ?? []).map((p) => (
          <li key={p.slug}>
            <Enlace
              a={{ vista: 'proyecto', slug: p.slug }}
              className="group flex h-full flex-col rounded-lg border border-border bg-white p-4 no-underline hover:border-accent"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink group-hover:text-accent">
                  {p.nombre}
                </h2>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
                  {p.pais}
                  {p.fase ? ` · ${p.fase}` : ''}
                </span>
              </div>
              {p.cliente && <p className="mt-1.5 text-xs text-muted">{p.cliente}</p>}
              <p className="mt-2 truncate font-mono text-[10px] text-muted">
                {p.modelo_vigente || 'sin modelo vigente'}
              </p>
            </Enlace>
          </li>
        ))}
      </ul>
    </main>
  );
}
