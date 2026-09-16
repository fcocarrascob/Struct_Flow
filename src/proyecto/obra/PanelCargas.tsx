import { Fragment, useEffect, useRef, useState } from 'react';
import type { EvaluacionCarga } from './calculo';
import { admiteSubcargas, problemaDeNombre, TIPOS_CARGA, type Carga } from './modelo';

/**
 * El CRUD de los patrones de carga, al estilo de «Define → Load Patterns».
 *
 * Las filas se editan EN EL SITIO: escribir el nombre y elegir el tipo es todo
 * lo que hay que hacer, y meter un formulario aparte por fila serían dos clics
 * de ida y vuelta para cambiar una letra.
 *
 * El panel es CONTROLADO DESDE FUERA, como `SeccionesPanel` y `VariablePanel`:
 * no guarda ninguna carga, solo el rastro de qué fila está a punto de borrarse.
 * El documento de la obra vive en el canvas, que es quien lo persiste; tenerlo
 * también acá daría dos copias y la segunda divergiría.
 *
 * Un nombre repetido o vacío NO se rechaza mientras se escribe: se marca. El
 * mismo motivo aparece en el nodo del canvas, que sale rojo, porque las dos
 * pantallas salen de `problemaDeNombre` y no de dos comprobaciones distintas.
 */

const CAMPO =
  'w-full rounded border bg-white px-2 py-1 text-xs text-ink outline-none focus:border-accent';

export default function PanelCargas({
  cargas,
  enfocada,
  evaluaciones,
  onCambiar,
  onAgregar,
  onBorrar,
  onAgregarPartida,
  onIrAPartida,
  onCerrar,
}: {
  cargas: readonly Carga[];
  /** La carga cuyo nodo está seleccionado en el canvas, para traerla a la vista. */
  enfocada: string | null;
  /** El desglose ya evaluado, por id de carga. Viene de la proyección, que es la
   *  misma evaluación que pinta los nodos: dos evaluaciones darían dos totales. */
  evaluaciones: Record<string, EvaluacionCarga>;
  onCambiar: (id: string, campos: Partial<Omit<Carga, 'id'>>) => void;
  onAgregar: () => void;
  onBorrar: (id: string) => void;
  onAgregarPartida: (idCarga: string) => void;
  onIrAPartida: (idSub: string) => void;
  onCerrar: () => void;
}) {
  const [porBorrar, setPorBorrar] = useState<string | null>(null);
  const nombres = useRef(new Map<string, HTMLInputElement>());

  // El «¿borrar?» se retira solo. Sin esto quedaría armado indefinidamente, y un
  // botón que dice «¿borrar?» desde hace cinco minutos se pulsa por inercia.
  // Tampoco sirve retirarlo al perder el foco: el `blur` llega ANTES del `click`
  // del propio botón, así que la confirmación se desarmaría justo al confirmar.
  useEffect(() => {
    if (!porBorrar) return;
    const t = window.setTimeout(() => setPorBorrar(null), 4000);
    return () => window.clearTimeout(t);
  }, [porBorrar]);

  // Traer a la vista la fila del nodo seleccionado, y dejar el nombre listo para
  // reemplazar: al agregar una carga el nombre viene propuesto («D», «W2»), y lo
  // primero que se hace casi siempre es escribir otro encima.
  useEffect(() => {
    if (!enfocada) return;
    const campo = nombres.current.get(enfocada);
    if (!campo) return;
    campo.scrollIntoView({ block: 'nearest' });
    campo.focus();
    campo.select();
  }, [enfocada]);

  const cargaEnfocada = cargas.find((c) => c.id === enfocada) ?? null;

  return (
    <aside className="flex h-full w-[26rem] shrink-0 flex-col overflow-y-auto border-l border-border bg-white">
      <header className="sticky top-0 z-10 border-b border-border bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink">Cargas</h2>
            <p className="truncate text-[11px] text-muted">
              {cargas.length === 0
                ? 'ninguna definida todavía'
                : `${cargas.length} definida${cargas.length === 1 ? '' : 's'} · ASCE 7`}
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

      <section className="flex min-h-0 flex-1 flex-col px-4 py-3">
        {cargas.length === 0 ? (
          <p className="text-[11px] leading-snug text-muted">
            Cada carga que definas aparece como su propio nodo en el canvas. El nombre es con el
            que después se va a citar en las combinaciones, así que no puede repetirse.
          </p>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] items-center gap-x-2 gap-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Nombre
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Tipo
            </span>
            <span className="sr-only">Borrar</span>

            {cargas.map((c) => {
              const problema = problemaDeNombre(c, cargas);
              const confirmando = porBorrar === c.id;
              return (
                <Fragment key={c.id}>
                  <input
                    ref={(el) => {
                      if (el) nombres.current.set(c.id, el);
                      else nombres.current.delete(c.id);
                    }}
                    type="text"
                    value={c.nombre}
                    onChange={(e) => onCambiar(c.id, { nombre: e.target.value })}
                    aria-label="Nombre de la carga"
                    aria-invalid={problema ? true : undefined}
                    className={`${CAMPO} font-mono ${problema ? 'border-error' : 'border-border'}`}
                  />
                  <select
                    value={c.tipo}
                    onChange={(e) => onCambiar(c.id, { tipo: e.target.value })}
                    aria-label="Tipo de carga"
                    className={`${CAMPO} border-border`}
                  >
                    {TIPOS_CARGA.map((t) => (
                      <option key={t.clave} value={t.clave}>
                        {t.simbolo ? `${t.simbolo} — ${t.nombre}` : t.nombre}
                      </option>
                    ))}
                    {/* Un tipo guardado que ya no esté en el catálogo no se pierde
                        en silencio: se ve, y se ve que es raro. */}
                    {!TIPOS_CARGA.some((t) => t.clave === c.tipo) && (
                      <option value={c.tipo}>{c.tipo} (fuera del catálogo)</option>
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => (confirmando ? onBorrar(c.id) : setPorBorrar(c.id))}
                    title={confirmando ? 'Confirmar el borrado' : `Borrar ${c.nombre}`}
                    className={`shrink-0 rounded border px-1.5 py-1 text-[10px] ${
                      confirmando
                        ? 'border-error bg-error text-white'
                        : 'border-border text-muted hover:border-error hover:text-error'
                    }`}
                  >
                    {confirmando ? '¿borrar?' : '×'}
                  </button>

                  {problema && (
                    <p className="col-span-3 -mt-0.5 mb-1 text-[10px] leading-snug text-error">
                      {problema}
                    </p>
                  )}
                </Fragment>
              );
            })}
          </div>
        )}

        <div className="mt-3">
          <button
            type="button"
            onClick={onAgregar}
            className="rounded border border-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
          >
            + agregar carga
          </button>
        </div>
      </section>

      {/* El desglose solo aparece con una carga enfocada, no con el nodo Cargas
          seleccionado: aquel es la tabla de definiciones de la obra entera, y
          meterle el desglose de una de ellas mezclaría dos niveles. */}
      {cargaEnfocada && admiteSubcargas(cargaEnfocada.tipo) && (
        <Desglose
          carga={cargaEnfocada}
          evaluacion={evaluaciones[cargaEnfocada.id]}
          onAgregar={() => onAgregarPartida(cargaEnfocada.id)}
          onIr={onIrAPartida}
        />
      )}
    </aside>
  );
}

/**
 * El desglose de una carga permanente: sus partidas con el valor que produjo la
 * hoja de cada una, y el total.
 *
 * No se edita acá. Una partida se abre en su propio panel, que es donde está su
 * cálculo; esta lista es el índice, y por eso cada fila es un botón que lleva a
 * su nodo. Repetir la edición en los dos sitios daría dos caminos para lo mismo.
 */
function Desglose({
  carga,
  evaluacion,
  onAgregar,
  onIr,
}: {
  carga: Carga;
  evaluacion?: EvaluacionCarga;
  onAgregar: () => void;
  onIr: (idSub: string) => void;
}) {
  return (
    <section className="border-t border-border px-4 py-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          Desglose de {carga.nombre || 'la carga'}
        </h3>
        <span className="font-mono text-xs text-ink">{evaluacion?.totalTexto ?? '—'}</span>
      </div>

      {carga.subcargas.length === 0 ? (
        <p className="text-[11px] leading-snug text-muted">
          Sin partidas. Cada partida es un nodo de cálculo: una mini hoja donde defines su valor
          —<span className="font-mono">CM_equipo := 30 tonf</span>— o lo estimas con el cálculo
          que haga falta.
        </p>
      ) : (
        <ul>
          {carga.subcargas.map((s) => {
            const v = evaluacion?.valores.find((x) => x.id === s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onIr(s.id)}
                  title={v?.problema || `Abrir el cálculo de ${s.nombre}`}
                  className="flex w-full items-baseline justify-between gap-2 border-b border-border/60 py-1 text-left hover:bg-ink/5"
                >
                  <span className="truncate font-mono text-[11px] text-ink">{s.nombre}</span>
                  <span
                    className={`shrink-0 font-mono text-[11px] ${
                      v?.problema ? 'text-error' : 'text-muted'
                    }`}
                  >
                    {v?.texto ?? '—'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {evaluacion?.problemaTotal && (
        <p className="mt-1 text-[10px] leading-snug text-error">{evaluacion.problemaTotal}</p>
      )}

      <button
        type="button"
        onClick={onAgregar}
        className="mt-2 rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
      >
        + agregar partida
      </button>
    </section>
  );
}
