import { useState } from 'react';
import type {
  ConexionSap,
  ConjuntoDiseno,
  LecturaApoyos,
  LecturaCombinaciones,
  LecturaConjunto,
  SistemaUnidades,
} from './modelo';
import ConjuntosApoyos, { type NuevoConjunto } from './ConjuntosApoyos';
import {
  ALIAS_RE,
  aliasPorDefecto,
  CRITERIOS,
  descuadresConBasal,
  extremosPorCaso,
  tiposDeApoyo,
  type Extremo,
  type PublicacionApoyos,
} from './sap-apoyos';
import { fuerza } from './sap-basal';
import { atrasoDe } from './sap-modal';
import { alPuente } from './puente';
import { useEscape } from './useEscape';

/**
 * El panel del sub-nodo Reacciones en apoyos: lo que llega a cada apoyo, por
 * caso, con el sello del modelo.
 *
 * Por caso, qué apoyo se lleva la mayor compresión, la mayor tracción, el mayor
 * corte y el mayor momento; la tabla completa se abre como una pestaña de la
 * obra. Después, los tipos de apoyo (grupos de SAP), los conjuntos de diseño y
 * lo que todo eso publica a la obra: las gobernantes de cada tipo en cada
 * conjunto, que las hojas nombran en vez de copiar.
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
  publicacion,
  usan,
  aliasTipos,
  onAliasTipo,
  bases,
  onArmarBase,
  onVerBase,
  onQuitar,
  onCerrar,
}: {
  /** Las bases ya armadas, por alias de tipo: se derivan de las vistas con ensamble. */
  bases: Readonly<Record<string, { idVista: string; nombre: string }>>;
  onArmarBase: (grupo: string, alias: string) => void;
  onVerBase: (idVista: string) => void;
  sap: ConexionSap | undefined;
  unidades: SistemaUnidades;
  onUnidades: (u: SistemaUnidades) => void;
  onLeido: (lectura: LecturaApoyos) => void;
  /** Abre la tabla en ese caso (o `conjunto:<id>`), o en lo que tenía. */
  onAbrirTabla: (vista: string | null) => void;
  conjuntos: readonly ConjuntoDiseno[];
  onCombinaciones: (l: LecturaCombinaciones) => void;
  onGuardarConjunto: (c: ConjuntoDiseno | NuevoConjunto) => void;
  onQuitarConjunto: (id: string) => void;
  onLeidoConjunto: (id: string, l: LecturaConjunto) => void;
  /** Las gobernantes que publica a la obra, por tipo y conjunto. */
  publicacion: PublicacionApoyos;
  /** Las etiquetas de los nodos que usan alguna. */
  usan: readonly string[];
  /** Los alias elegidos a mano, por grupo de SAP. */
  aliasTipos: Readonly<Record<string, string>>;
  onAliasTipo: (grupo: string, alias: string) => void;
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
        ...(d.grupos ? { grupos: d.grupos } : {}),
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
  const tipos = lectura?.grupos ? tiposDeApoyo(lectura) : undefined;
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

            <section>
              <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Tipos de apoyo</h4>
              {!tipos ? (
                <p className="leading-snug text-muted">
                  Esta lectura es anterior a los tipos: vuelve a leer para agrupar los apoyos por grupo de SAP.
                </p>
              ) : (
                <>
                  <p className="mb-1.5 leading-snug text-muted">
                    Un tipo por grupo de SAP: se diseña una placa por tipo. Un apoyo es del grupo al que está asignado;
                    si no está en ninguno, del grupo cuyas barras llegan a él. El alias es el tramo con que el tipo
                    entra en los nombres que se publican.
                  </p>
                  <ul className="space-y-1">
                    {tipos.tipos.map((t) => (
                      <li key={t.grupo ?? '—'} className="flex items-baseline gap-2">
                        <span className={`font-mono font-semibold ${t.grupo ? 'text-ink' : 'text-aviso'}`}>
                          {t.grupo ?? 'Sin grupo'}
                        </span>
                        {t.grupo && (
                          <CampoAlias
                            key={`${t.grupo}:${aliasTipos[t.grupo] ?? ''}`}
                            elegido={aliasTipos[t.grupo] ?? ''}
                            porDefecto={aliasPorDefecto(t.grupo)}
                            onCambiar={(a) => onAliasTipo(t.grupo!, a)}
                          />
                        )}
                        <span className="whitespace-nowrap text-muted">
                          {t.apoyos.length} apoyo{t.apoyos.length === 1 ? '' : 's'}
                          {t.via === 'barra' ? ' · por sus barras' : ''}
                        </span>
                        <span className="ml-auto truncate font-mono text-[10px] text-muted" title={t.apoyos.join(', ')}>
                          {t.apoyos.join(' ')}
                        </span>
                        {t.grupo &&
                          (() => {
                            const alias = aliasTipos[t.grupo] ?? aliasPorDefecto(t.grupo);
                            const base = bases[alias];
                            return base ? (
                              <button
                                type="button"
                                onClick={() => onVerBase(base.idVista)}
                                title={`La base de ${t.grupo}: ${base.nombre}`}
                                className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
                              >
                                ver base
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onArmarBase(t.grupo!, alias)}
                                title="Armar el grupo de la base de columna de este tipo, atado a sus gobernantes"
                                className="shrink-0 rounded border border-accent px-1.5 py-0.5 text-[10px] text-accent hover:bg-accent hover:text-white"
                              >
                                + base
                              </button>
                            );
                          })()}
                      </li>
                    ))}
                  </ul>
                  {tipos.cedidos.map((c) => (
                    <p key={c.grupo} className="mt-1 text-[10px] leading-snug text-muted">
                      <span className="font-mono">{c.grupo}</span> llega por sus barras a{' '}
                      <span className="font-mono">{c.apoyos.join(', ')}</span>, que ya están asignados a otro grupo.
                    </p>
                  ))}
                  {tipos.repetidos.length > 0 && (
                    <p className="mt-1 leading-snug text-aviso">
                      <span className="font-mono">{tipos.repetidos.join(', ')}</span> están en más de un tipo: dos grupos
                      los tienen asignados. Revisa los grupos en SAP.
                    </p>
                  )}
                  {tipos.tipos.some((t) => !t.grupo) && (
                    <p className="mt-1 leading-snug text-aviso">
                      Hay apoyos sin grupo: asígnalos a un grupo en SAP para que tengan su tipo.
                    </p>
                  )}
                </>
              )}
            </section>

            {sap && (
              <ConjuntosApoyos
                sap={sap}
                tipos={tipos?.tipos}
                conjuntos={conjuntos}
                unidades={unidades}
                onCombinaciones={onCombinaciones}
                onGuardar={onGuardarConjunto}
                onQuitar={onQuitarConjunto}
                onLeido={onLeidoConjunto}
                onVer={(id) => onAbrirTabla(`conjunto:${id}`)}
              />
            )}

            <Publicados publicacion={publicacion} usan={usan} />

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

/**
 * El alias de un tipo: vacío muestra el de por defecto. Se confirma al salir o
 * con Enter, no a cada tecla: cada cambio renombra lo que publica, y a medio
 * escribir dejaría en rojo las hojas que lo usan y una entrada por letra en el
 * historial.
 */
function CampoAlias({
  elegido,
  porDefecto,
  onCambiar,
}: {
  elegido: string;
  porDefecto: string;
  onCambiar: (alias: string) => void;
}) {
  const [texto, setTexto] = useState(elegido);
  const valido = !texto.trim() || ALIAS_RE.test(texto.trim());
  const confirmar = () => {
    if (texto.trim() !== elegido) onCambiar(texto.trim());
  };
  return (
    <input
      type="text"
      value={texto}
      placeholder={porDefecto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') confirmar();
        if (e.key === 'Escape') setTexto(elegido);
      }}
      aria-label="Alias del tipo"
      title={valido ? 'Alias con que el tipo entra en los nombres publicados' : 'Letras y números, empezando por letra, sin «_»'}
      className={`w-16 rounded border px-1 py-0 font-mono text-[10px] outline-none focus:border-accent ${
        valido ? 'border-border' : 'border-error text-error'
      }`}
    />
  );
}

const LETRA = Object.fromEntries(CRITERIOS.map((c) => [c.k, c.letra])) as Record<(typeof CRITERIOS)[number]['k'], string>;
const MAGNITUD = { compresion: 'N', traccion: 'N', corte: 'V', momento: 'M', excentricidad: 'M' } as const;
const TITULO = { compresion: 'Compr.', traccion: 'Tracc.', corte: 'Corte', momento: 'Momento', excentricidad: 'e = M/N' } as const;

/** Lo que el nodo publica a la obra: una fila por tipo y conjunto. */
function Publicados({ publicacion, usan }: { publicacion: PublicacionApoyos; usan: readonly string[] }) {
  const { filas, problemas } = publicacion;
  return (
    <section>
      <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Publica a la obra</h4>
      {filas.length === 0 ? (
        <p className="leading-snug text-muted">
          Nada todavía: hace falta un conjunto leído y apoyos con grupo. Entonces cada tipo publica sus gobernantes, y
          una hoja de placa base las nombra en vez de copiar el número.
        </p>
      ) : (
        <>
          <p className="mb-1.5 leading-snug text-muted">
            <span className="font-mono text-ink">N_c_CP_LRFD</span> es la N de la combinación que gobierna la
            compresión del tipo CP en el conjunto LRFD. El criterio: <span className="font-mono">c</span> compresión,{' '}
            <span className="font-mono">t</span> tracción, <span className="font-mono">v</span> corte,{' '}
            <span className="font-mono">m</span> momento, <span className="font-mono">e</span> excentricidad (la
            mayor M/N con compresión, la que tracciona los pernos: la hoja saca{' '}
            <span className="font-mono">e := M_e / N_e</span>). De cada uno salen N, V y M de esa misma combinación
            (N positiva comprime, negativa tracciona), en kN y kN·m, y <span className="font-mono">nc_…</span> vale 1
            si no es concurrente (≠).
          </p>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border text-left text-[9px] uppercase tracking-wide text-muted">
                <th className="py-0.5 font-semibold">Conjunto · tipo</th>
                {CRITERIOS.map(({ k }) => (
                  <th key={k} className="font-semibold">
                    {TITULO[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              {filas.map((f) => (
                <tr key={f.sufijo} className="border-t border-border/60 align-top">
                  <td className="py-1 font-sans text-ink">
                    {f.conjunto} · <span className="font-mono">{f.grupo}</span>
                    <span className="block font-mono text-[9px] text-muted">…{f.sufijo}</span>
                  </td>
                  {CRITERIOS.map(({ k }) => {
                    const concurrente = f.criterios[k];
                    return (
                      <td key={k} className="py-1">
                        {concurrente === undefined ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <>
                            <span className="text-ink">
                              {MAGNITUD[k]}_{LETRA[k]}
                            </span>
                            {!concurrente && (
                              <span className="text-amber-700" title="No concurrente: nc = 1">
                                {' '}
                                ≠
                              </span>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 leading-snug text-muted">
            — es un criterio sin gobernante (nada tracciona, o nada comprime con momento): no se publica, no se
            inventa un cero.{' '}
            {usan.length
              ? `Los usa${usan.length > 1 ? 'n' : ''} ${usan.map((u) => `«${u}»`).join(', ')}.`
              : 'Ninguna hoja los usa todavía.'}
          </p>
        </>
      )}
      {problemas.map((p) => (
        <p key={p} className="mt-1 leading-snug text-aviso">
          {p}
        </p>
      ))}
    </section>
  );
}
