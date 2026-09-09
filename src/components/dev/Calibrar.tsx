import { useState } from 'react';
import Enlace from '../Enlace';
import ReglaA4, { ALTO_ACTUAL } from './ReglaA4';
import TablaDePaginas from './TablaDePaginas';

/**
 * Herramientas de calibración de la página A4. **Solo en desarrollo**: la monta
 * `App.tsx` detrás de `import.meta.env.DEV`.
 *
 * Son las dos medidas que no se pueden tomar desde Node y de las que depende
 * todo el trabajo de posicionamiento libre: cuánto alto tiene de verdad una A4
 * en Chromium, y cuántas páginas ocupa hoy cada planilla publicada.
 *
 * Las dos herramientas no pueden estar montadas a la vez: cada una pone su
 * propio documento en `.worksheet-print`, que es único en el `<body>`.
 */
type Vista = 'regla' | 'tabla';

export default function Calibrar() {
  const [vista, setVista] = useState<Vista>('tabla');
  const [alto, setAlto] = useState(ALTO_ACTUAL);
  const [paginas, setPaginas] = useState(4);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <p className="text-xs uppercase tracking-wide text-muted">
        <Enlace a={{ vista: 'inicio' }} className="hover:text-accent">
          Struct Flow
        </Enlace>{' '}
        · herramienta de desarrollo
      </p>
      <h1 className="mt-1 text-xl font-semibold text-ink">Calibración de la página A4</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Las dos medidas que hay que tomar en un navegador. La primera fija el alto real de una
        página en Chromium; la segunda deja escrito cuántas páginas ocupa hoy cada planilla,
        que es la línea base contra la que se comparará el posicionamiento libre.
      </p>

      <div className="mt-6 flex gap-2 border-b border-border">
        <Pestana activa={vista === 'tabla'} onClick={() => setVista('tabla')}>
          Páginas por planilla
        </Pestana>
        <Pestana activa={vista === 'regla'} onClick={() => setVista('regla')}>
          Página-regla
        </Pestana>
      </div>

      <div className="mt-6">
        {vista === 'tabla' ? (
          <TablaDePaginas />
        ) : (
          <section>
            <div className="flex flex-wrap items-end gap-4">
              <label className="text-sm">
                <span className="block text-xs font-medium text-muted">Alto probado (px)</span>
                <input
                  type="number"
                  className="mt-1 w-32 rounded border border-border bg-white px-2 py-1 font-mono text-sm"
                  value={alto}
                  onChange={(e) => setAlto(Number(e.target.value) || 0)}
                />
              </label>
              <label className="text-sm">
                <span className="block text-xs font-medium text-muted">Páginas</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="mt-1 w-20 rounded border border-border bg-white px-2 py-1 font-mono text-sm"
                  value={paginas}
                  onChange={(e) => setPaginas(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                />
              </label>
              <button
                className="rounded border border-border bg-white px-3 py-1.5 text-sm font-medium hover:border-accent hover:text-accent"
                onClick={() => window.print()}
              >
                Imprimir la regla
              </button>
              {alto !== ALTO_ACTUAL && (
                <button
                  className="rounded border border-border bg-white px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
                  onClick={() => setAlto(ALTO_ACTUAL)}
                >
                  Volver a {ALTO_ACTUAL}
                </button>
              )}
            </div>

            <ol className="mt-5 max-w-2xl list-decimal space-y-2 pl-5 text-sm text-ink">
              <li>
                Imprime a PDF con los márgenes por omisión y <strong>sin</strong> los
                encabezados y pies del propio Chrome: los pinta en el margen de{' '}
                <code>@page</code> y falsean el borde que hay que mirar.
              </li>
              <li>
                Si alguna página-regla se derrama a una segunda hoja, el alto{' '}
                <strong>sobra</strong>.
              </li>
              <li>
                Si la banda verde del pie no toca el borde inferior del papel, el alto{' '}
                <strong>falta</strong>.
              </li>
              <li>
                Cuando cada página cae en su hoja y la banda verde queda al ras, ese es el
                valor de <code>A4_ALTO_UTIL_PX</code>. Anótalo en{' '}
                <code>src/lib/paginacion.ts</code> junto a la versión de Chromium y la fecha.
              </li>
            </ol>

            <p className="mt-4 max-w-2xl text-sm text-muted">
              El valor de hoy es <code>{ALTO_ACTUAL}</code> px, y no los 1009,134 de la cuenta
              teórica, porque Chromium arma la caja de página en píxeles enteros. Hasta ahora se
              deducía del comportamiento de un bloque al filo; esta regla lo enseña.
            </p>

            <ReglaA4 alto={alto} paginas={paginas} />
          </section>
        )}
      </div>
    </main>
  );
}

function Pestana({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${
        activa
          ? 'border-accent font-medium text-accent'
          : 'border-transparent text-muted hover:text-ink'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
