import { useState } from 'react';
import type { ConexionSap, LecturaCombinaciones } from './modelo';
import { resumenCombinaciones, type ResumenCombinaciones } from './sap-combinaciones';
import { alPuente } from './puente';
import { useEscape } from './useEscape';

/** `lineal` → `lineales`, `envolvente` → `envolventes`; una sigla no cambia. */
function plural(palabra: string, n: number): string {
  if (n === 1 || palabra === 'srss') return palabra;
  return /[aeiou]$/.test(palabra) ? `${palabra}s` : `${palabra}es`;
}

/**
 * Si los nombres no siguen la convención de familias: más de la mitad de las
 * familias tiene una sola combinación (`COMB1`, `COMB2`… o `1.2D+1.6L`). Con
 * pocas combinaciones no se dice nada, porque ahí una familia de una es normal.
 */
function sinConvencion(r: ResumenCombinaciones): boolean {
  if (r.total < 6) return false;
  const solas = r.familias.filter((f) => f.n === 1).length;
  return solas > r.familias.length / 2;
}

/**
 * El panel del sub-nodo Combinaciones: qué combinaciones tiene el modelo, en
 * resumen, y la puerta a la matriz completa.
 *
 * SOLO LEE, como el SAP2000 del que cuelga. La matriz no cabe en un panel
 * lateral —165 filas por 30 columnas en el Pachón—, así que se abre como una
 * pestaña de la obra (`TablaCombinaciones`). Todavía no se justifica nada: eso es
 * la etapa 6 de `docs/rumbo.md`.
 */
export default function PanelCombinaciones({
  sap,
  onLeido,
  onAbrirTabla,
  onQuitar,
  onCerrar,
}: {
  sap: ConexionSap | undefined;
  onLeido: (lectura: LecturaCombinaciones) => void;
  /** Abre la tabla, filtrada por esa familia o sin filtro. */
  onAbrirTabla: (familia: string | null) => void;
  onQuitar: () => void;
  onCerrar: () => void;
}) {
  useEscape(onCerrar);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState('');
  const lectura = sap?.combinaciones;
  const casos = sap?.casos?.lista;
  const r = lectura ? resumenCombinaciones(lectura, casos) : undefined;

  const leer = async () => {
    setLeyendo(true);
    setError('');
    try {
      const d = await alPuente<{ modelo?: string; combinaciones?: LecturaCombinaciones['lista'] }>('/combinaciones');
      onLeido({ modelo: d.modelo ?? '', leido: new Date().toISOString(), lista: d.combinaciones ?? [] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLeyendo(false);
    }
  };

  return (
    <aside className="flex h-full w-[34rem] shrink-0 flex-col overflow-y-auto border-l border-border bg-white">
      <header className="sticky top-0 z-10 border-b border-border bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 px-1.5">
            <h2 className="text-sm font-semibold text-ink">Combinaciones</h2>
            <p className="text-[11px] leading-snug text-muted">
              {lectura ? (
                <>
                  <span className="font-mono text-ink">{lectura.modelo}</span> · leídas el{' '}
                  {new Date(lectura.leido).toLocaleString()}
                  {sap && lectura.modelo !== sap.modelo && (
                    <span className="text-aviso"> — no es el modelo conectado ({sap.modelo})</span>
                  )}
                </>
              ) : (
                'Las combinaciones de carga del modelo abierto en SAP2000.'
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => void leer()}
              disabled={leyendo || !sap}
              title={sap ? undefined : 'Conecta primero el nodo SAP2000'}
              className="rounded border border-accent bg-accent px-2 py-0.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {leyendo ? 'Leyendo…' : lectura ? 'Volver a leer' : 'Leer del modelo'}
            </button>
            <button
              type="button"
              onClick={onCerrar}
              className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
            >
              cerrar
            </button>
          </div>
        </div>
        {error && (
          <p role="status" className="mx-1.5 mt-2 rounded border border-aviso px-3 py-2 text-xs leading-snug text-aviso">
            {error}
          </p>
        )}
      </header>

      <div className="space-y-4 px-5 py-4 text-[11px]">
        {!r || !lectura ? (
          <p className="leading-snug text-muted">
            {sap ? 'Todavía no se leyeron.' : 'El nodo SAP2000 todavía no se conectó a ningún modelo.'}
          </p>
        ) : (
          <>
            <section className="flex items-baseline justify-between gap-3">
              <p className="text-ink">
                <span className="text-base font-semibold">{r.total}</span> combinaciones
                <span className="text-muted">
                  {' '}
                  · {r.porTipo.map((t) => `${t.n} ${plural(t.tipo.toLowerCase(), t.n)}`).join(' · ')}
                </span>
              </p>
              <button
                type="button"
                onClick={() => onAbrirTabla(null)}
                className="shrink-0 rounded border border-accent px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent hover:text-white"
              >
                Abrir tabla
              </button>
            </section>

            <section>
              <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Familias</h4>
              <div className="mb-2 rounded border border-border bg-slate-50 px-3 py-2 leading-snug text-muted">
                <p>
                  <span className="font-semibold text-ink">Convención de Flow:</span> la familia es el texto del nombre
                  antes del primer «_». Para que las combinaciones se agrupen, nómbralas en SAP2000 con un prefijo común
                  y un «_»:
                </p>
                <p className="mt-1 font-mono text-[10px] text-ink">
                  B25_EX_EVP, B25_EY_EVN → B25 · SERV_WX, SERV_WY → SERV
                </p>
                <p className="mt-1">Un nombre sin «_» es su propia familia. Pulsa una familia para abrir la tabla con solo ella.</p>
              </div>
              {sinConvencion(r) && (
                <p className="mb-2 leading-snug text-aviso">
                  La mayoría de las familias tiene una sola combinación: los nombres de este modelo no siguen la
                  convención, y la agrupación no dice mucho. La tabla se ve igual; solo los grupos no aportan.
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {r.familias.map((f) => (
                  <button
                    key={f.familia}
                    type="button"
                    onClick={() => onAbrirTabla(f.familia)}
                    className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-ink hover:border-accent hover:text-accent"
                  >
                    {f.familia} <span className="text-muted">{f.n}</span>
                  </button>
                ))}
              </div>
            </section>

            {r.anidadas.length > 0 && (
              <section>
                <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Anidadas</h4>
                <p className="leading-snug text-muted">
                  {r.anidadas.length === 1 ? 'Una combinación entra' : `${r.anidadas.length} combinaciones entran`} como
                  término en otras
                  {r.profundidad > 1 ? `, hasta ${r.profundidad} niveles` : ''}:{' '}
                  <span className="font-mono text-ink">{r.anidadas.join(', ')}</span>.
                </p>
              </section>
            )}

            <section>
              <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Casos sin combinar</h4>
              {!casos ? (
                <p className="leading-snug text-muted">
                  Para verlo hacen falta los Load Cases: léelos desde el nodo SAP2000.
                </p>
              ) : (
                <div className="space-y-1.5 leading-snug">
                  {r.sinUsar.length === 0 ? (
                    <p className="text-emerald-600">
                      Todos los casos entran en alguna combinación, directo o a través de otro caso.
                    </p>
                  ) : (
                    <p className="text-aviso">
                      {r.sinUsar.length === 1 ? 'Un caso no entra' : `${r.sinUsar.length} casos no entran`} en ninguna
                      combinación, ni directo, ni anidado, ni por otro caso que lleve sus patrones:{' '}
                      <span className="font-mono">{r.sinUsar.join(', ')}</span>. Puede ser a propósito, o una carga que no
                      se está diseñando.
                    </p>
                  )}
                  {r.cubiertos.length > 0 && (
                    <details className="text-muted">
                      <summary className="cursor-pointer">
                        {r.cubiertos.length} caso(s) no se combinan, pero sus patrones entran por otro caso
                      </summary>
                      <ul className="mt-1 space-y-0.5 pl-3 font-mono text-[10px]">
                        {r.cubiertos.map((c) => (
                          <li key={c.caso}>
                            {c.caso} <span className="font-sans">entra por</span> {c.por.join(', ')}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </section>

            {r.inexistentes.length > 0 && (
              <section className="rounded border border-aviso px-3 py-2">
                <p className="mb-1 font-semibold text-aviso">Términos que no están en el modelo leído</p>
                <ul className="space-y-0.5 font-mono text-[10px] text-ink">
                  {r.inexistentes.map((x, i) => (
                    <li key={i}>
                      {x.combinacion} → {x.termino}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <section className="border-t border-border pt-3">
          <button
            type="button"
            onClick={onQuitar}
            className="rounded border border-border px-2 py-0.5 text-[11px] text-muted hover:border-error hover:text-error"
          >
            Quitar este nodo
          </button>
          <span className="ml-2 text-[10px] text-muted">Se deshace con Ctrl+Z.</span>
        </section>
      </div>
    </aside>
  );
}
