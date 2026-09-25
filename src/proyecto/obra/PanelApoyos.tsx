import { useState } from 'react';
import type {
  ConexionSap,
  ConjuntoDiseno,
  LecturaApoyos,
  LecturaCombinaciones,
  LecturaConjunto,
  SistemaUnidades,
} from './modelo';
import ConjuntosApoyos from './ConjuntosApoyos';
import { descuadresConBasal, extremosPorCaso, type Extremo } from './sap-apoyos';
import { fuerza } from './sap-basal';
import { atrasoDe } from './sap-modal';
import { alPuente } from './puente';
import { useEscape } from './useEscape';

/**
 * El panel del sub-nodo Reacciones en apoyos: lo que llega a cada apoyo, por
 * caso, con el sello del modelo.
 *
 * Es el primer paso: por caso. Los conjuntos de diseño —familias de
 * combinaciones que el ingeniero elige para hormigón, para estabilidad…— son el
 * siguiente. Aquí se ve, por caso, qué apoyo se lleva la mayor compresión, la
 * mayor tracción, el mayor corte y el mayor momento; la tabla completa se abre
 * como una pestaña de la obra.
 */
export default function PanelApoyos({
  sap,
  unidades,
  onUnidades,
  onLeido,
  onAbrirTabla,
  conjuntos,
  onCombinaciones,
  onGuardarConjunto,
  onQuitarConjunto,
  onLeidoConjunto,
  onQuitar,
  onCerrar,
}: {
  sap: ConexionSap | undefined;
  unidades: SistemaUnidades;
  onUnidades: (u: SistemaUnidades) => void;
  onLeido: (lectura: LecturaApoyos) => void;
  /** Abre la tabla en ese caso (o `conjunto:<id>`), o en lo que tenía. */
  onAbrirTabla: (vista: string | null) => void;
  conjuntos: readonly ConjuntoDiseno[];
  onCombinaciones: (l: LecturaCombinaciones) => void;
  onGuardarConjunto: (c: ConjuntoDiseno | { nombre: string; familias: string[] }) => void;
  onQuitarConjunto: (id: string) => void;
  onLeidoConjunto: (id: string, l: LecturaConjunto) => void;
  onQuitar: () => void;
  onCerrar: () => void;
}) {
  useEscape(onCerrar);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState('');
  const lectura = sap?.apoyos;

  const leer = async () => {
    setLeyendo(true);
    setError('');
    try {
      const d = await alPuente<Omit<LecturaApoyos, 'leido'>>('/apoyos');
      onLeido({
        modelo: d.modelo ?? '',
        leido: new Date().toISOString(),
        modificado: d.modificado ?? '',
        apoyos: d.apoyos ?? [],
        casos: d.casos ?? [],
        sinAnalizar: d.sinAnalizar ?? [],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLeyendo(false);
    }
  };

  const atraso = lectura ? atrasoDe(lectura, sap) : undefined;
  const extremos = lectura ? extremosPorCaso(lectura) : [];
  const descuadres = lectura ? descuadresConBasal(lectura, sap?.basal) : [];
  const celda = (e: Extremo | undefined, momento = false) =>
    e ? (
      <>
        <span className="text-ink">{fuerza(e.valor, unidades, momento)}</span>
        <span className="block text-[9px] text-muted">nudo {e.apoyo}</span>
      </>
    ) : (
      <span className="text-muted">—</span>
    );

  return (
    <aside className="flex h-full w-[34rem] shrink-0 flex-col overflow-y-auto border-l border-border bg-white">
      <header className="sticky top-0 z-10 border-b border-border bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 px-1.5">
            <h2 className="text-sm font-semibold text-ink">Reacciones en apoyos</h2>
            <p className="text-[11px] leading-snug text-muted">
              {lectura ? (
                <>
                  <span className="font-mono text-ink">{lectura.modelo}</span> · leídas el{' '}
                  {new Date(lectura.leido).toLocaleString()}
                  <span className="block">
                    Sello: el .sdb guardado el {new Date(lectura.modificado).toLocaleString()}.
                  </span>
                </>
              ) : (
                'Lo que llega a cada apoyo, por caso: con esto se diseñan placas base y pedestales.'
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
              ? 'Todavía no se leyeron. El modelo tiene que estar analizado: Flow no analiza.'
              : 'El nodo SAP2000 todavía no se conectó a ningún modelo.'}
          </p>
        ) : (
          <>
            <section className="flex items-baseline justify-between gap-3">
              <p className="text-ink">
                <span className="text-base font-semibold">{lectura.apoyos.length}</span> apoyos ·{' '}
                {lectura.casos.length} casos
              </p>
              <button
                type="button"
                onClick={() => onAbrirTabla(null)}
                className="shrink-0 rounded border border-accent px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent hover:text-white"
              >
                Abrir tabla
              </button>
            </section>

            {descuadres.length > 0 && (
              <p className="rounded border border-aviso px-3 py-2 leading-snug text-aviso">
                En {descuadres.join(', ')}, la suma de F3 en los apoyos no es la FZ de la reacción basal: falta algún
                apoyo en la lectura (un link a tierra, un resorte).
              </p>
            )}
            {lectura.sinAnalizar.length > 0 && (
              <p className="leading-snug text-aviso">
                Sin analizar, no se leyeron: <span className="font-mono">{lectura.sinAnalizar.join(', ')}</span>.
              </p>
            )}

            {sap && (
              <ConjuntosApoyos
                sap={sap}
                conjuntos={conjuntos}
                unidades={unidades}
                onCombinaciones={onCombinaciones}
                onGuardar={onGuardarConjunto}
                onQuitar={onQuitarConjunto}
                onLeido={onLeidoConjunto}
                onVer={(id) => onAbrirTabla(`conjunto:${id}`)}
              />
            )}

            <section>
              <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Extremos por caso</h4>
              <table className="w-full font-mono tabular-nums">
                <thead>
                  <tr className="border-b border-border text-right font-sans text-[10px] uppercase tracking-wide text-muted">
                    <th className="py-1 text-left font-semibold">Caso</th>
                    <th className="font-semibold" title="La mayor F3 positiva: la estructura comprime la fundación">
                      Compresión
                    </th>
                    <th className="font-semibold" title="La F3 más negativa: la estructura tira de la fundación">
                      Tracción
                    </th>
                    <th className="font-semibold" title="√(F1² + F2²)">Corte</th>
                    <th className="font-semibold" title="√(M1² + M2²)">Momento</th>
                  </tr>
                </thead>
                <tbody>
                  {extremos.map((e) => (
                    <tr
                      key={e.caso}
                      onClick={() => onAbrirTabla(e.caso)}
                      title={`Abrir la tabla en ${e.caso}`}
                      className="cursor-pointer border-t border-border/60 text-right align-top hover:bg-accent/5"
                    >
                      <td className="py-1 text-left text-ink">
                        {e.caso}
                        {e.espectral && <span className="block font-sans text-[9px] text-muted">máx. sin signo</span>}
                      </td>
                      <td className="py-1">{celda(e.compresion)}</td>
                      <td className="py-1">
                        {e.espectral ? <span className="text-muted">—</span> : e.traccion ? (
                          <>
                            <span className="text-violet-700">{fuerza(e.traccion.valor, unidades)}</span>
                            <span className="block text-[9px] text-muted">nudo {e.traccion.apoyo}</span>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="py-1">{celda(e.corte)}</td>
                      <td className="py-1">{celda(e.momento, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 leading-snug text-muted">
                F3 positiva es compresión sobre la fundación; negativa, tracción. Un espectro da máximos sin signo, así
                que su tracción no se puede distinguir. Pulsa un caso para ver todos los apoyos.
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
