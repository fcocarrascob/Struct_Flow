import { useEffect, useState } from 'react';
import { listarProyectos } from './api';
import type { ProyectoListado } from './contrato';
import { borrarObra, guardarObra, listarObras } from './obra/almacen';
import { nuevaObra, NOMBRE_OBRA_POR_OMISION, type Obra } from './obra/modelo';
import Enlace from '../components/Enlace';
import { navegar } from '../lib/ruta';

/**
 * El índice de trabajo: las obras de este navegador arriba, los proyectos del
 * harness debajo.
 *
 * Las dos listas son independientes A PROPÓSITO. Las obras salen de
 * `localStorage` y los proyectos del servidor local; si el servidor no está
 * corriendo, el aviso ocupa su sección y las obras se siguen viendo. Cuando una
 * sola pantalla depende de dos fuentes, la que falla suele llevarse a la otra
 * por delante, y aquí eso significaría abrir el navegador y no encontrar el
 * trabajo propio.
 *
 * Y una lista vacía del harness se lee como «no hay proyectos», que es lo
 * contrario de «no pude preguntar»: por eso el error se dice, no se calla.
 */

function FichaObra({ obra, onBorrar }: { obra: Obra; onBorrar: (id: string) => void }) {
  const [confirmando, setConfirmando] = useState(false);

  // El «¿borrar?» se retira solo: un botón armado desde hace rato se pulsa por
  // inercia, y del otro lado no hay deshacer.
  useEffect(() => {
    if (!confirmando) return;
    const t = window.setTimeout(() => setConfirmando(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmando]);

  return (
    <div className="group relative flex h-full flex-col rounded-lg border border-border bg-white p-4 hover:border-accent">
      <Enlace a={{ vista: 'obra', id: obra.id }} className="no-underline">
        <h3 className="pr-16 text-sm font-semibold text-ink group-hover:text-accent">
          {obra.nombre || obra.id}
        </h3>
        <p className="mt-1.5 text-xs text-muted">
          {obra.cargas.length === 0
            ? 'sin cargas'
            : `${obra.cargas.length} carga${obra.cargas.length === 1 ? '' : 's'}`}
          {obra.modulos.length === 0 && ' · canvas vacío'}
        </p>
        <p className="mt-2 truncate font-mono text-[10px] text-muted">{obra.id}</p>
      </Enlace>
      <button
        type="button"
        onClick={() => (confirmando ? onBorrar(obra.id) : setConfirmando(true))}
        title={confirmando ? 'Confirmar el borrado' : `Borrar ${obra.nombre}`}
        className={`absolute right-3 top-3 rounded border px-1.5 py-0.5 text-[10px] ${
          confirmando
            ? 'border-error bg-error text-white'
            : 'border-border text-muted opacity-0 hover:border-error hover:text-error focus:opacity-100 group-hover:opacity-100'
        }`}
      >
        {confirmando ? '¿borrar?' : '×'}
      </button>
    </div>
  );
}

export default function IndiceProyectos() {
  const [obras, setObras] = useState<Obra[]>(() => listarObras());
  const [proyectos, setProyectos] = useState<ProyectoListado[] | null>(null);
  const [error, setError] = useState<{ motivo: string; detalle: string } | null>(null);
  const [avisoObras, setAvisoObras] = useState('');

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

  function crearObra() {
    const obra = nuevaObra(
      NOMBRE_OBRA_POR_OMISION,
      obras.map((o) => o.id),
    );
    const r = guardarObra(obra);
    if (!r.ok) {
      setAvisoObras(r.motivo);
      return;
    }
    navegar({ vista: 'obra', id: obra.id });
  }

  function quitarObra(id: string) {
    const r = borrarObra(id);
    if (!r.ok) {
      setAvisoObras(r.motivo);
      return;
    }
    setObras(listarObras());
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <nav className="mb-2 text-xs text-muted">
        <Enlace a={{ vista: 'inicio' }} className="hover:text-accent">
          Inicio
        </Enlace>
        {' / Proyectos'}
      </nav>

      <header className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Proyectos</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          Un proyecto se abre como un grafo: las acciones y sus cargas, las combinaciones, el
          modelo, las planillas y los documentos que las publican. El color de un nodo es su
          desfase, no su tipo.
        </p>
      </header>

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">
            Obras <span className="font-normal text-muted">de este navegador</span>
          </h2>
          <button
            type="button"
            onClick={crearObra}
            className="rounded border border-accent bg-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90"
          >
            + Nueva obra
          </button>
        </div>

        {avisoObras && (
          <p className="mb-3 rounded border border-aviso bg-white px-3 py-2 text-xs leading-snug text-aviso">
            {avisoObras}
          </p>
        )}

        {obras.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-white p-4 text-sm leading-relaxed text-muted">
            Todavía no hay ninguna obra. Una obra empieza con el canvas vacío y se va llenando
            con nodos: el primero es <strong className="font-medium text-ink">Cargas</strong>.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {obras.map((o) => (
              <li key={o.id}>
                <FichaObra obra={o} onBorrar={quitarObra} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Del harness <span className="font-normal text-muted">solo lectura</span>
        </h2>

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
                  <h3 className="text-sm font-semibold text-ink group-hover:text-accent">
                    {p.nombre}
                  </h3>
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
      </section>
    </main>
  );
}
