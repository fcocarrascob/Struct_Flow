import { Fragment, useEffect, useRef } from 'react';
import type { EvaluacionCarga } from './calculo';
import { nuevaCarga, problemaDeNombre, type Carga } from './modelo';
import { useEscape } from './useEscape';

/**
 * El CRUD de los patrones de carga, al estilo de «Define → Load Patterns».
 *
 * Las filas se editan EN EL SITIO: escribir el nombre y elegir el tipo es todo
 * lo que hay que hacer, y meter un formulario aparte por fila serían dos clics
 * de ida y vuelta para cambiar una letra.
 *
 * El panel es CONTROLADO DESDE FUERA, como `SeccionesPanel` y `VariablePanel`:
 * no guarda ninguna carga. El documento de la obra vive en el canvas, que es
 * quien lo persiste; tenerlo también acá daría dos copias y la segunda
 * divergiría.
 *
 * Un nombre repetido o vacío NO se rechaza mientras se escribe: se marca. El
 * mismo motivo aparece en el nodo del canvas, que sale rojo, porque las dos
 * pantallas salen de `problemaDeNombre` y no de dos comprobaciones distintas.
 */

const CAMPO =
  'w-full rounded border bg-white px-2 py-1 text-xs text-ink outline-none focus:border-accent';

/** ¿Es el nombre que propuso `nuevaCarga` y que nadie ha reescrito todavía? Se
 *  pregunta a la misma función que lo propone, para que no haya dos formatos. */
function esPropuesto(nombre: string): boolean {
  const propuesto = nuevaCarga([]).nombre.replace(/\d+$/, '');
  return new RegExp(`^${propuesto}\\d+$`).test(nombre.trim());
}

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
  const nombres = useRef(new Map<string, HTMLInputElement>());
  useEscape(onCerrar);

  // Traer a la vista la fila del nodo seleccionado, y dejar el nombre listo para
  // reemplazar **solo si sigue siendo el propuesto** («C1», «C2»…), que es lo
  // primero que se reescribe al crear una carga. Seleccionándolo siempre, volver
  // a una carga ya bautizada dejaba su nombre entero seleccionado y la siguiente
  // tecla se lo llevaba.
  useEffect(() => {
    if (!enfocada) return;
    const campo = nombres.current.get(enfocada);
    if (!campo) return;
    campo.scrollIntoView({ block: 'nearest' });
    campo.focus();
    if (esPropuesto(campo.value)) campo.select();
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
                : `${cargas.length} definida${cargas.length === 1 ? '' : 's'}`}
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

      {/*
        Una fila por carga, y no un grid de celdas sueltas. Con el grid, la
        cabecera de la columna de borrar era un `sr-only` —que es
        `position: absolute` y por eso NO ocupa celda—, así que el nombre de la
        primera carga subía a la fila del encabezado y todo lo demás quedaba
        corrido una posición. Con una fila por carga no hay forma de que se
        desfase: el botón vive dentro de la fila a la que borra.
      */}
      <section className="flex flex-1 flex-col px-4 py-3">
        {cargas.length === 0 ? (
          <p className="text-[11px] leading-snug text-muted">
            Cada carga que definas aparece como su propio nodo en el canvas. El nombre es con el
            que después se va a citar en las combinaciones, así que no puede repetirse.
          </p>
        ) : (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Nombre</p>

            {cargas.map((c) => {
              const problema = problemaDeNombre(c, cargas);
              return (
                <Fragment key={c.id}>
                  <div className="flex items-center gap-2">
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
                      className={`${CAMPO} min-w-0 flex-1 font-mono ${problema ? 'border-error' : 'border-border'}`}
                    />
                    {/* Un clic y se va. Acá había un «¿borrar?» en dos tiempos, que
                        era la única protección de la obra cuando no había deshacer:
                        quitar un nodo de cálculo o una partida no preguntaba nada y
                        se llevaba la hoja entera, así que la carga estaba defendida
                        y lo caro no. Con `Ctrl+Z` y los botones ↶ ↷ en la cabecera
                        hay una sola respuesta a «¿seguro?», y es la misma para todo
                        lo que vive dentro del documento de la obra. La confirmación
                        sigue donde sí hace falta: borrar una obra ENTERA, en
                        `IndiceProyectos`, que está fuera de lo que ve el historial. */}
                    <button
                      type="button"
                      onClick={() => onBorrar(c.id)}
                      aria-label={`Borrar ${c.nombre}`}
                      title={`Borrar ${c.nombre}`}
                      className="shrink-0 rounded border border-border px-1.5 py-1 text-[10px] text-muted hover:border-error hover:text-error"
                    >
                      ×
                    </button>
                  </div>

                  {problema && (
                    <p className="-mt-0.5 mb-1 text-[10px] leading-snug text-error">{problema}</p>
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
      {cargaEnfocada && (
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
 * El desglose de una carga: sus partidas con el valor que produjo la hoja de
 * cada una. No hay total, porque una carga agrupa sus partidas y no las suma.
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
        {/* El recuento y no un total: una carga agrupa sus partidas, no las
            suma. Cada valor está en su fila, que es donde significa algo. */}
        <span className="shrink-0 text-[10px] text-muted">
          {carga.subcargas.length} partida{carga.subcargas.length === 1 ? '' : 's'}
        </span>
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
