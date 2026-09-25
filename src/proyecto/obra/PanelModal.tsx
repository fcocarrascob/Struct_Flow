import { useState } from 'react';
import type { ConexionSap, LecturaModal } from './modelo';
import { atrasoDe, MASA_MINIMA, porcentaje, resumenModal, segundos, type Direccion } from './sap-modal';
import { alPuente } from './puente';
import { useEscape } from './useEscape';

/**
 * El panel del sub-nodo Modal: el primer nodo de RESULTADOS del SAP2000.
 *
 * Lee periodos y masas participantes de un caso modal ya analizado —Flow no
 * analiza—, con el sello del modelo: la fecha del `.sdb`. Si el modelo se guarda
 * después, la lectura se marca atrasada. Todavía no publica nada al scope de la
 * obra; eso es el paso siguiente.
 */

/** Una masa en la tabla: con un decimal, y vacía si no llega a una décima. */
const celda = (x: number | undefined) => (x === undefined ? '' : x < 0.0005 ? '' : (x * 100).toFixed(1).replace('.', ','));

export default function PanelModal({
  sap,
  onLeido,
  onQuitar,
  onCerrar,
}: {
  sap: ConexionSap | undefined;
  onLeido: (lectura: LecturaModal) => void;
  onQuitar: () => void;
  onCerrar: () => void;
}) {
  useEscape(onCerrar);
  const lectura = sap?.modal;
  const modales = (sap?.casos?.lista ?? []).filter((c) => c.tipo === 'Modal').map((c) => c.nombre);
  const [caso, setCaso] = useState(lectura?.caso ?? modales[0] ?? 'MODAL');
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState('');
  const [todos, setTodos] = useState(false);

  const leer = async () => {
    setLeyendo(true);
    setError('');
    try {
      const d = await alPuente<Omit<LecturaModal, 'leido'>>(`/modal?caso=${encodeURIComponent(caso)}`);
      onLeido({ modelo: d.modelo ?? '', leido: new Date().toISOString(), modificado: d.modificado ?? '', caso: d.caso ?? caso, modos: d.modos ?? [] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLeyendo(false);
    }
  };

  const r = lectura ? resumenModal(lectura) : undefined;
  const atraso = lectura ? atrasoDe(lectura, sap) : undefined;
  // Por omisión, los modos hasta el que junta el 90 % en X e Y: lo que se revisa.
  const hasta = r
    ? Math.max(10, r.porDireccion.X.alNoventa ?? r.modos, r.porDireccion.Y.alNoventa ?? r.modos)
    : 0;
  const modos = lectura ? [...lectura.modos].sort((a, b) => a.n - b.n) : [];
  const visibles = todos ? modos : modos.filter((m) => m.n <= hasta);
  const dominante = (d: Direccion, n: number) => r?.porDireccion[d].dominante?.n === n;

  return (
    <aside className="flex h-full w-[34rem] shrink-0 flex-col overflow-y-auto border-l border-border bg-white">
      <header className="sticky top-0 z-10 border-b border-border bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 px-1.5">
            <h2 className="text-sm font-semibold text-ink">Modal</h2>
            <p className="text-[11px] leading-snug text-muted">
              {lectura ? (
                <>
                  <span className="font-mono text-ink">{lectura.modelo}</span> · caso{' '}
                  <span className="font-mono text-ink">{lectura.caso}</span> · leído el{' '}
                  {new Date(lectura.leido).toLocaleString()}
                  <span className="block">
                    Sello: el .sdb guardado el {new Date(lectura.modificado).toLocaleString()}.
                  </span>
                </>
              ) : (
                'Periodos y masas participantes de un caso modal analizado.'
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {modales.length > 1 && (
              <select
                value={caso}
                onChange={(e) => setCaso(e.target.value)}
                aria-label="Caso modal"
                className="rounded border border-border px-1 py-0.5 text-xs"
              >
                {modales.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => void leer()}
              disabled={leyendo || !sap}
              title={sap ? `Leer los resultados de ${caso}` : 'Conecta primero el nodo SAP2000'}
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
        {!r || !lectura ? (
          <p className="leading-snug text-muted">
            {sap
              ? 'Todavía no se leyó. El modelo tiene que estar analizado: Flow no analiza.'
              : 'El nodo SAP2000 todavía no se conectó a ningún modelo.'}
          </p>
        ) : (
          <>
            <section className="grid grid-cols-3 gap-2">
              <Ficha titulo="Periodo fundamental" valor={r.T1 !== undefined ? segundos(r.T1) : '—'} detalle={`modo 1 de ${r.modos}`} />
              {(['X', 'Y'] as const).map((d) => {
                const dom = r.porDireccion[d].dominante;
                return (
                  <Ficha
                    key={d}
                    titulo={`Dominante en ${d}`}
                    valor={dom ? segundos(dom.T) : '—'}
                    detalle={dom ? `modo ${dom.n} · ${porcentaje(dom.masa)} de la masa` : 'sin masas'}
                  />
                );
              })}
            </section>

            {r.conMasas && (
              <section>
                <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Masa participante</h4>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted">
                      <th className="py-1 font-semibold">Dirección</th>
                      <th className="text-right font-semibold">Acumulada</th>
                      <th className="text-right font-semibold">Llega al 90 % en</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(['X', 'Y', 'Z'] as const).map((d) => {
                      const p = r.porDireccion[d];
                      const falta = d !== 'Z' && p.acumulada < MASA_MINIMA;
                      return (
                        <tr key={d} className="border-t border-border/60">
                          <td className="py-1 text-ink">
                            {d}
                            {d === 'Z' && <span className="ml-1 text-muted">(vertical, informativa)</span>}
                          </td>
                          <td className={`text-right font-mono ${falta ? 'text-aviso' : 'text-ink'}`}>
                            {porcentaje(p.acumulada)}
                          </td>
                          <td className="text-right text-muted">
                            {p.alNoventa !== undefined ? `modo ${p.alNoventa}` : 'no llega'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-1 leading-snug text-muted">
                  Las normas de análisis modal espectral suelen pedir al menos el 90 % de la masa en cada dirección
                  horizontal. Aquí es un aviso, no una verificación.
                </p>
              </section>
            )}

            <section>
              <div className="mb-1 flex items-baseline justify-between">
                <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">Modos</h4>
                {modos.length > hasta && (
                  <button type="button" onClick={() => setTodos((t) => !t)} className="text-accent hover:underline">
                    {todos ? `ver hasta el modo ${hasta}` : `ver los ${modos.length}`}
                  </button>
                )}
              </div>
              <table className="w-full font-mono tabular-nums">
                <thead>
                  <tr className="border-b border-border text-right font-sans text-[10px] uppercase tracking-wide text-muted">
                    <th className="py-1 text-left font-semibold">Modo</th>
                    <th className="font-semibold">T [s]</th>
                    <th className="font-semibold">f [Hz]</th>
                    <th className="font-semibold" title="Masa participante en X, %">Ux</th>
                    <th className="font-semibold" title="Masa participante en Y, %">Uy</th>
                    <th className="font-semibold" title="Masa participante en Z, %">Uz</th>
                    <th className="font-semibold" title="Masa participante en giro alrededor de Z, %">Rz</th>
                    <th className="font-semibold" title="Acumulada en X, %">ΣUx</th>
                    <th className="font-semibold" title="Acumulada en Y, %">ΣUy</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((m) => {
                    const destacada = dominante('X', m.n) || dominante('Y', m.n);
                    return (
                      <tr key={m.n} className={`border-t border-border/60 text-right ${destacada ? 'bg-accent/5' : ''}`}>
                        <td className="py-0.5 text-left text-ink">{m.n}</td>
                        <td className="text-ink">{m.T.toFixed(3).replace('.', ',')}</td>
                        <td className="text-muted">{m.f.toFixed(2).replace('.', ',')}</td>
                        <td className={dominante('X', m.n) ? 'font-semibold text-accent' : 'text-ink'}>{celda(m.ux)}</td>
                        <td className={dominante('Y', m.n) ? 'font-semibold text-accent' : 'text-ink'}>{celda(m.uy)}</td>
                        <td className="text-muted">{celda(m.uz)}</td>
                        <td className="text-muted">{celda(m.rz)}</td>
                        <td className={cruza(m.sux, modos, m.n, 'sux') ? 'font-semibold text-emerald-600' : 'text-muted'}>
                          {celda(m.sux)}
                        </td>
                        <td className={cruza(m.suy, modos, m.n, 'suy') ? 'font-semibold text-emerald-600' : 'text-muted'}>
                          {celda(m.suy)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-1 leading-snug text-muted">
                En porcentaje. Resaltado: el modo que domina X o Y; en verde, el modo con que la acumulada pasa el 90 %.
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

/** Si en este modo la acumulada cruza el 90 %: la del anterior no llegaba. */
function cruza(
  s: number | undefined,
  modos: readonly { n: number; sux?: number; suy?: number }[],
  n: number,
  clave: 'sux' | 'suy',
): boolean {
  if (s === undefined || s < MASA_MINIMA) return false;
  const i = modos.findIndex((m) => m.n === n);
  return i === 0 || (modos[i - 1][clave] ?? 0) < MASA_MINIMA;
}

function Ficha({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="rounded border border-border px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted">{titulo}</p>
      <p className="font-mono text-base font-semibold text-ink">{valor}</p>
      <p className="text-[10px] text-muted">{detalle}</p>
    </div>
  );
}
