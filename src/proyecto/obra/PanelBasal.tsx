import { useState } from 'react';
import type { ConexionSap, LecturaBasal, SistemaUnidades } from './modelo';
import { cantidad, cortesSismicos, filasEnOrden, fuerza, gravitacionalesConHorizontal } from './sap-basal';
import { atrasoDe, resumenModal, segundos } from './sap-modal';
import { alPuente } from './puente';
import { useEscape } from './useEscape';

/**
 * El panel del sub-nodo Reacción basal: la resultante en la base de cada caso
 * analizado, con el sello del modelo como el modal.
 *
 * Lo que se revisa: el corte basal de cada caso de espectro —con el periodo de
 * esa dirección al lado, si el modal está leído— y que un caso gravitacional no
 * tenga reacción horizontal. Las combinaciones y las reacciones por apoyo son
 * el paso siguiente.
 */
export default function PanelBasal({
  sap,
  unidades,
  onUnidades,
  onLeido,
  onQuitar,
  onCerrar,
}: {
  sap: ConexionSap | undefined;
  unidades: SistemaUnidades;
  onUnidades: (u: SistemaUnidades) => void;
  onLeido: (lectura: LecturaBasal) => void;
  onQuitar: () => void;
  onCerrar: () => void;
}) {
  useEscape(onCerrar);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState('');
  const lectura = sap?.basal;

  const leer = async () => {
    setLeyendo(true);
    setError('');
    try {
      const d = await alPuente<Omit<LecturaBasal, 'leido'>>('/basal');
      onLeido({
        modelo: d.modelo ?? '',
        leido: new Date().toISOString(),
        modificado: d.modificado ?? '',
        filas: d.filas ?? [],
        sinAnalizar: d.sinAnalizar ?? [],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLeyendo(false);
    }
  };

  const atraso = lectura ? atrasoDe(lectura, sap) : undefined;
  const cortes = lectura ? cortesSismicos(lectura, sap) : [];
  const espectrales = new Set(cortes.map((c) => c.caso));
  const empujan = lectura ? gravitacionalesConHorizontal(lectura, sap) : [];
  const modal = sap?.modal ? resumenModal(sap.modal) : undefined;
  const F = (v: number) => fuerza(v, unidades);

  return (
    <aside className="flex h-full w-[34rem] shrink-0 flex-col overflow-y-auto border-l border-border bg-white">
      <header className="sticky top-0 z-10 border-b border-border bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 px-1.5">
            <h2 className="text-sm font-semibold text-ink">Reacción basal</h2>
            <p className="text-[11px] leading-snug text-muted">
              {lectura ? (
                <>
                  <span className="font-mono text-ink">{lectura.modelo}</span> · leída el{' '}
                  {new Date(lectura.leido).toLocaleString()}
                  <span className="block">
                    Sello: el .sdb guardado el {new Date(lectura.modificado).toLocaleString()}.
                  </span>
                </>
              ) : (
                'La resultante en la base de cada caso analizado.'
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <div
              role="group"
              aria-label="Unidades en que se muestran las fuerzas"
              title="Cómo se muestran las fuerzas. Se leen siempre en kN."
              className="flex overflow-hidden rounded border border-border text-[11px]"
            >
              {(['kN', 'tonf'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={unidades === u}
                  onClick={() => onUnidades(u)}
                  className={`px-2 py-0.5 ${unidades === u ? 'bg-accent text-white' : 'text-muted hover:text-accent'}`}
                >
                  {u}
                </button>
              ))}
            </div>
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
        {atraso && (
          <p className="mx-1.5 mt-2 rounded border border-aviso px-3 py-2 text-xs leading-snug text-aviso">
            Lectura atrasada: {atraso}. Vuelve a leer para que los resultados sean los del modelo de ahora.
          </p>
        )}
      </header>

      <div className="space-y-4 px-5 py-4 text-[11px]">
        {!lectura ? (
          <p className="leading-snug text-muted">
            {sap
              ? 'Todavía no se leyó. El modelo tiene que estar analizado: Flow no analiza.'
              : 'El nodo SAP2000 todavía no se conectó a ningún modelo.'}
          </p>
        ) : (
          <>
            {cortes.length > 0 && (
              <section className="grid grid-cols-2 gap-2">
                {cortes.map((c) => {
                  const dom = modal?.porDireccion[c.dir].dominante;
                  return (
                    <div key={c.caso} className="rounded border border-border px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted">
                        Corte basal en {c.dir} · {c.caso}
                      </p>
                      <p className="font-mono text-base font-semibold text-ink">{F(c.V)}</p>
                      <p className="text-[10px] text-muted">
                        {c.origen === 'espectro' ? 'espectro de respuesta' : 'estático, aceleración horizontal'}
                        {dom ? ` · T${c.dir.toLowerCase()} = ${segundos(dom.T)} (modo ${dom.n})` : ''}
                      </p>
                    </div>
                  );
                })}
              </section>
            )}

            {empujan.length > 0 && (
              <section className="rounded border border-aviso px-3 py-2 leading-snug text-aviso">
                <p className="font-semibold">Casos gravitacionales con reacción horizontal</p>
                <p className="mt-0.5">
                  Solo llevan patrones de peso propio, sobrecarga o nieve, y aun así la base empuja de lado más del 1 % de
                  la vertical. Suele ser una carga con la dirección equivocada.
                </p>
                <ul className="mt-1 font-mono text-[10px]">
                  {empujan.map((e) => (
                    <li key={e.caso}>
                      {e.caso}: horizontal {F(e.horizontal)}, vertical {F(e.vertical)}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {lectura.sinAnalizar.length > 0 && (
              <p className="leading-snug text-aviso">
                Sin analizar, no se leyeron: <span className="font-mono">{lectura.sinAnalizar.join(', ')}</span>.
              </p>
            )}

            <section>
              <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Por caso</h4>
              <table className="w-full font-mono tabular-nums">
                <thead>
                  <tr className="border-b border-border text-right font-sans text-[10px] uppercase tracking-wide text-muted">
                    <th className="py-1 text-left font-semibold">Caso</th>
                    <th className="font-semibold">FX</th>
                    <th className="font-semibold">FY</th>
                    <th className="font-semibold">FZ</th>
                    <th className="font-semibold">MX</th>
                    <th className="font-semibold">MY</th>
                    <th className="font-semibold">MZ</th>
                  </tr>
                </thead>
                <tbody>
                  {filasEnOrden(lectura, sap).map((f) => (
                    <tr
                      key={f.caso}
                      className={`border-t border-border/60 text-right ${espectrales.has(f.caso) ? 'bg-accent/5' : ''}`}
                    >
                      <td className="py-0.5 text-left text-ink">{f.caso}</td>
                      {[f.fx, f.fy, f.fz].map((v, i) => (
                        <td key={i} className="text-ink">
                          {cantidad(v, unidades)}
                        </td>
                      ))}
                      {[f.mx, f.my, f.mz].map((v, i) => (
                        <td key={i} className="text-muted">
                          {cantidad(v, unidades)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 leading-snug text-muted">
                Fuerzas en {unidades}, momentos en {unidades}·m, ejes globales. Resaltados, los casos sísmicos. La
                reacción de un espectro es una combinación modal (CQC o SRSS) y no tiene signo.
              </p>
            </section>
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
