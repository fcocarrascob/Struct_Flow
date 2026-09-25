import { useState } from 'react';
import type { ConexionSap, ConjuntoDiseno, LecturaCombinaciones, LecturaConjunto, SistemaUnidades } from './modelo';
import {
  combosDeConjunto,
  estadoConjunto,
  extremosDeConjunto,
  gobernantesDeConjunto,
  type RespuestaCombinacionesApoyos,
} from './sap-apoyos';
import { resumenCombinaciones } from './sap-combinaciones';
import { fuerza } from './sap-basal';
import { alPuente } from './puente';

/**
 * Los conjuntos de diseño de los apoyos: familias de combinaciones que el
 * ingeniero elige para diseñar algo —hormigón con LRFD, estabilidad con ASD—.
 *
 * El conjunto es suyo y vive en la obra; lo que se lee de SAP —las gobernantes
 * de cada apoyo— es una lectura y vive en `sap.conjuntos`. Las familias son la
 * convención de Flow: el texto antes del primer «_».
 */
export default function ConjuntosApoyos({
  sap,
  conjuntos,
  unidades,
  onCombinaciones,
  onGuardar,
  onQuitar,
  onLeido,
  onVer,
}: {
  sap: ConexionSap;
  conjuntos: readonly ConjuntoDiseno[];
  unidades: SistemaUnidades;
  onCombinaciones: (l: LecturaCombinaciones) => void;
  onGuardar: (c: ConjuntoDiseno | { nombre: string; familias: string[] }) => void;
  onQuitar: (id: string) => void;
  onLeido: (id: string, l: LecturaConjunto) => void;
  onVer: (id: string) => void;
}) {
  const [editando, setEditando] = useState<ConjuntoDiseno | 'nuevo' | null>(null);
  const [leyendo, setLeyendo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const combinaciones = sap.combinaciones;
  const familias = combinaciones ? resumenCombinaciones(combinaciones).familias : [];

  const leerCombinaciones = async () => {
    setLeyendo('combinaciones');
    setError('');
    try {
      const d = await alPuente<{ modelo?: string; combinaciones?: LecturaCombinaciones['lista'] }>('/combinaciones');
      onCombinaciones({ modelo: d.modelo ?? '', leido: new Date().toISOString(), lista: d.combinaciones ?? [] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLeyendo(null);
    }
  };

  const leer = async (c: ConjuntoDiseno) => {
    const combos = combosDeConjunto(c.familias, combinaciones);
    if (!combos.length) {
      setError(`Ninguna combinación del modelo es de ${c.familias.join(', ')}. Vuelve a leer las combinaciones.`);
      return;
    }
    setLeyendo(c.id);
    setError('');
    try {
      const d = await alPuente<RespuestaCombinacionesApoyos>('/apoyos/combinaciones', { combinaciones: combos });
      onLeido(c.id, gobernantesDeConjunto(d, c.familias, new Date().toISOString()));
    } catch (e) {
      setError(`${c.nombre}: ${(e as Error).message}`);
    } finally {
      setLeyendo(null);
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">Conjuntos de diseño</h4>
        {combinaciones && !editando && (
          <button type="button" onClick={() => setEditando('nuevo')} className="text-accent hover:underline">
            + nuevo conjunto
          </button>
        )}
      </div>
      <p className="leading-snug text-muted">
        Las familias de combinaciones con que se diseña cada cosa —hormigón (LRFD), estabilidad (ASD)…—. Para cada
        apoyo, Flow da la combinación que gobierna la compresión, la tracción, el corte y el momento, con los valores
        de esa misma combinación.
      </p>

      {error && <p className="rounded border border-aviso px-3 py-2 leading-snug text-aviso">{error}</p>}

      {!combinaciones ? (
        <div className="rounded border border-border px-3 py-2 leading-snug text-muted">
          Para armar un conjunto hacen falta las combinaciones del modelo.{' '}
          <button
            type="button"
            onClick={() => void leerCombinaciones()}
            disabled={leyendo !== null}
            className="text-accent hover:underline disabled:opacity-50"
          >
            {leyendo === 'combinaciones' ? 'Leyendo…' : 'Leer las combinaciones'}
          </button>
        </div>
      ) : (
        editando && (
          <EditorConjunto
            inicial={editando === 'nuevo' ? undefined : editando}
            familias={familias}
            onGuardar={(c) => {
              onGuardar(c);
              setEditando(null);
            }}
            onCancelar={() => setEditando(null)}
          />
        )
      )}

      {conjuntos.length === 0 && combinaciones && !editando && (
        <p className="leading-snug text-muted">Todavía no hay conjuntos.</p>
      )}

      <ul className="space-y-2">
        {conjuntos.map((c) => {
          const lectura = sap.conjuntos?.[c.id];
          const e = estadoConjunto(c, lectura, sap);
          const ext = lectura && e.estado === 'al-dia' ? extremosDeConjunto(lectura) : undefined;
          const nCombos = combosDeConjunto(c.familias, combinaciones).length;
          return (
            <li key={c.id} className="rounded border border-border px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold text-ink">{c.nombre}</span>
                <span className="font-mono text-[10px] text-muted">{c.familias.join(' · ')}</span>
                <span className="text-[10px] text-muted">{nCombos} combinaciones</span>
                <span className="ml-auto flex gap-2 text-[10px]">
                  <button
                    type="button"
                    onClick={() => void leer(c)}
                    disabled={leyendo !== null}
                    className="font-medium text-accent hover:underline disabled:opacity-50"
                  >
                    {leyendo === c.id ? 'Leyendo…' : lectura ? 'Volver a leer' : 'Leer'}
                  </button>
                  {lectura && (
                    <button type="button" onClick={() => onVer(c.id)} className="text-accent hover:underline">
                      Ver tabla
                    </button>
                  )}
                  <button type="button" onClick={() => setEditando(c)} className="text-muted hover:text-accent">
                    Editar
                  </button>
                  <button type="button" onClick={() => onQuitar(c.id)} className="text-muted hover:text-error">
                    Quitar
                  </button>
                </span>
              </div>
              {e.estado === 'sin-leer' && <p className="mt-1 text-[10px] text-muted">Sin leer.</p>}
              {e.estado === 'desactualizado' && (
                <p className="mt-1 text-[10px] text-aviso">Desactualizado: {e.motivo}. Vuelve a leer.</p>
              )}
              {ext && lectura && (
                <>
                  <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                    {(
                      [
                        ['compresion', 'Compresión máx.', false],
                        ['traccion', 'Tracción máx.', false],
                        ['corte', 'Corte máx.', false],
                        ['momento', 'Momento máx.', true],
                      ] as const
                    ).map(([k, titulo, momento]) => {
                      const g = ext[k];
                      return (
                        <div key={k}>
                          <dt className="text-muted">{titulo}</dt>
                          <dd className={`font-mono ${k === 'traccion' && g ? 'text-violet-700' : 'text-ink'}`}>
                            {g ? (
                              <>
                                {fuerza(g.valor, unidades, momento)}{' '}
                                <span className="text-muted">
                                  nudo {g.apoyo} · {g.combo}
                                  {!g.concurrente && <span title="No concurrente: la combinación lleva espectro o envolvente"> ≠</span>}
                                </span>
                              </>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                  {lectura.noConcurrentes.length > 0 && (
                    <p className="mt-1 text-[10px] leading-snug text-muted">
                      ≠ {lectura.noConcurrentes.length} de {lectura.combos.length} combinaciones llevan espectro o
                      envolvente: SAP da máximos y mínimos por componente, y sus valores no son concurrentes.
                    </p>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** El formulario de un conjunto: su nombre y qué familias toma. */
function EditorConjunto({
  inicial,
  familias,
  onGuardar,
  onCancelar,
}: {
  inicial: ConjuntoDiseno | undefined;
  familias: { familia: string; n: number }[];
  onGuardar: (c: ConjuntoDiseno | { nombre: string; familias: string[] }) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [elegidas, setElegidas] = useState<ReadonlySet<string>>(new Set(inicial?.familias ?? []));
  const alternar = (f: string) =>
    setElegidas((s) => {
      const t = new Set(s);
      if (t.has(f)) t.delete(f);
      else t.add(f);
      return t;
    });
  const lista = familias.filter((f) => elegidas.has(f.familia)).map((f) => f.familia);
  const total = familias.filter((f) => elegidas.has(f.familia)).reduce((s, f) => s + f.n, 0);
  // Una familia que ya no está en el modelo sigue elegida hasta que se quite: se ve.
  const perdidas = [...elegidas].filter((f) => !familias.some((x) => x.familia === f));

  return (
    <div className="space-y-2 rounded border border-accent/60 bg-accent/5 px-3 py-2">
      <input
        type="text"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre, por ejemplo Hormigón (LRFD)"
        aria-label="Nombre del conjunto"
        autoFocus
        className="w-full rounded border border-border px-2 py-1 text-xs outline-none focus:border-accent"
      />
      <div className="flex flex-wrap gap-1.5">
        {familias.map((f) => {
          const si = elegidas.has(f.familia);
          return (
            <button
              key={f.familia}
              type="button"
              aria-pressed={si}
              onClick={() => alternar(f.familia)}
              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                si ? 'border-accent bg-accent text-white' : 'border-border bg-white text-ink hover:border-accent'
              }`}
            >
              {f.familia} <span className={si ? 'text-white/80' : 'text-muted'}>{f.n}</span>
            </button>
          );
        })}
      </div>
      {perdidas.length > 0 && (
        <p className="text-[10px] text-aviso">
          Ya no están en el modelo: <span className="font-mono">{perdidas.join(', ')}</span>. Pulsa Guardar para quitarlas.
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!lista.length}
          onClick={() =>
            onGuardar({ ...(inicial ?? {}), nombre: nombre.trim() || lista.join(', '), familias: lista })
          }
          className="rounded border border-accent bg-accent px-2 py-0.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Guardar
        </button>
        <button type="button" onClick={onCancelar} className="text-xs text-muted hover:text-accent">
          Cancelar
        </button>
        <span className="ml-auto text-[10px] text-muted">
          {lista.length} familias · {total} combinaciones
        </span>
      </div>
    </div>
  );
}
