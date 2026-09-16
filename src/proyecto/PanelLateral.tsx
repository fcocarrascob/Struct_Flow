import { useEffect, useState } from 'react';
import { traerArchivo, type ArchivoLeido } from './api';
import type { NodoGrafo } from './contrato';

/**
 * Lo que hay detrás de un nodo.
 *
 * El nodo muestra lo justo para decidir si mirarlo; acá está el respaldo:
 * los campos tal como los declara el proyecto, los motivos completos del
 * desfase y el archivo del que sale todo, con su ruta y su línea.
 *
 * La ruta se muestra siempre, aunque el archivo no se pueda traer. Ir del número
 * a su origen con un clic en vez de con nueve búsquedas de texto es la mitad del
 * valor de todo esto.
 */

function Campo({ nombre, valor }: { nombre: string; valor: unknown }) {
  const texto = Array.isArray(valor)
    ? valor.join(', ') || '—'
    : typeof valor === 'object' && valor !== null
      ? JSON.stringify(valor)
      : valor === true
        ? 'sí'
        : valor === false
          ? 'no'
          : valor == null || valor === ''
            ? '—'
            : String(valor);
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-2 border-b border-border py-1 last:border-0">
      <dt className="truncate font-mono text-[10px] text-muted" title={nombre}>
        {nombre}
      </dt>
      <dd className="break-words text-[11px] leading-snug text-ink">{texto}</dd>
    </div>
  );
}

export default function PanelLateral({
  slug,
  nodo,
  onCerrar,
}: {
  slug: string;
  nodo: NodoGrafo | null;
  onCerrar: () => void;
}) {
  const [archivo, setArchivo] = useState<ArchivoLeido | null>(null);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(false);

  const ruta = nodo?.archivo ?? '';

  useEffect(() => {
    setArchivo(null);
    setError('');
    setAbierto(false);
    if (!ruta) return;
    let vivo = true;
    traerArchivo(slug, ruta)
      .then((a) => vivo && setArchivo(a))
      .catch((e: Error) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [slug, ruta]);

  if (!nodo) return null;

  const campos = Object.entries(nodo.campos);

  return (
    <aside className="flex h-full w-[26rem] shrink-0 flex-col overflow-y-auto border-l border-border bg-white">
      <header className="sticky top-0 z-10 border-b border-border bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink">{nodo.etiqueta}</h2>
            <p className="truncate text-[11px] text-muted">
              {nodo.tipo}
              {nodo.subtitulo ? ` · ${nodo.subtitulo}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="shrink-0 rounded border border-border px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
          >
            cerrar
          </button>
        </div>
      </header>

      {nodo.motivos.length > 0 && (
        <section className="border-b border-border px-4 py-3">
          <h3
            className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${
              nodo.severidad === 'error' ? 'text-error' : 'text-aviso'
            }`}
          >
            {nodo.severidad === 'error' ? 'No calza' : 'Aviso'}
          </h3>
          <ul className="space-y-1">
            {nodo.motivos.map((m) => (
              <li key={m} className="text-[11px] leading-snug text-ink">
                {m}
              </li>
            ))}
          </ul>
        </section>
      )}

      {campos.length > 0 && (
        <section className="border-b border-border px-4 py-3">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Lo que declara
          </h3>
          <dl>
            {campos.map(([k, v]) => (
              <Campo key={k} nombre={k} valor={v} />
            ))}
          </dl>
        </section>
      )}

      {ruta && (
        <section className="flex min-h-0 flex-1 flex-col px-4 py-3">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Origen</h3>
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              disabled={!archivo}
              className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent disabled:opacity-40"
            >
              {abierto ? 'ocultar' : 'ver archivo'}
            </button>
          </div>
          <p className="break-all font-mono text-[10px] text-accent">
            {ruta}
            {nodo.linea ? `:${nodo.linea}` : ''}
          </p>
          {error && <p className="mt-1 text-[10px] text-aviso">{error}</p>}
          {abierto && archivo && (
            <pre className="mt-2 max-h-[28rem] overflow-auto rounded border border-border bg-surface p-2 font-mono text-[10px] leading-snug text-ink">
              {archivo.texto}
              {archivo.truncado && '\n\n… cortado: el archivo es más grande'}
            </pre>
          )}
        </section>
      )}
    </aside>
  );
}
