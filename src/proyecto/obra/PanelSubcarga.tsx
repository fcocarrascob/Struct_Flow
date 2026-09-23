import { useState, type ReactNode } from 'react';
import type { Region, SheetResults } from '../../lib/worksheet';
import type { EstadoGenerica } from './biblioteca';
import type { Instanciada } from './evaluacion';
import { useEscape } from './useEscape';
import FichaGenerica from './FichaGenerica';
import FichaPropia from './FichaPropia';
import MiniHoja from './MiniHoja';
import SelectorGenerica from './SelectorGenerica';
import { definicionesDe, nombresSueltos } from './hoja';
import type { EvaluacionCarga } from './calculo';
import type { Carga, Subcarga } from './modelo';

/**
 * Una partida del desglose, con su cálculo.
 *
 * Es el «nodo de cálculo»: el sitio donde una carga deja de ser un número que
 * hay que creer y pasa a tener respaldo. El valor de la partida no se escribe
 * acá: lo produce la hoja, y la hoja es la memoria.
 *
 * Más ancho que el panel de cargas (30rem contra 26) porque lo que lleva es una
 * hoja, y una expresión con tres factores y una unidad no cabe en 26.
 */
export default function PanelSubcarga({
  carga,
  subcarga,
  evaluacion,
  variables,
  problemaGrafo,
  regions,
  results,
  instancia,
  atados,
  otrosAlias,
  estado,
  onRenombrar,
  onVariable,
  onHoja,
  onAbrirHoja,
  onCrearPlanilla,
  onDesprender,
  onImportar,
  onEntrada,
  onFormula,
  onPublicar,
  onSalida,
  onResellar,
  onQuitarPlanilla,
  onBorrar,
  onIrACarga,
  onCerrar,
  grupo,
  revision,
}: {
  carga: Carga;
  /** El selector del grupo de la CARGA: una partida no tiene grupo propio. */
  grupo?: ReactNode;
  /** La marca «Revisar» de la PARTIDA, que sí es suya: se revisa su respaldo. */
  revision?: ReactNode;
  subcarga: Subcarga;
  evaluacion: EvaluacionCarga;
  /** Las variables que su hoja define, para elegir cuál es el valor. */
  variables: string[];
  /** Nombre repetido en otro nodo o ciclo: lo que el motor no puede ver solo. */
  problemaGrafo: string;
  /** La hoja global de la obra: el autocompletado la necesita entera para poder
   *  ofrecer lo que definen los nodos de aguas arriba. */
  regions: Region[];
  results: SheetResults;
  /** Lo que su planilla produjo, si la tiene, en su sitio del orden de lectura. */
  instancia: Instanciada | undefined;
  otrosAlias: ReadonlySet<string>;
  estado: EstadoGenerica | undefined;
  onRenombrar: (nombre: string) => void;
  onVariable: (nombre: string) => void;
  onHoja: (hoja: Region[]) => void;
  /** Abre esta hoja como pestaña, con el canvas matemático entero. */
  onAbrirHoja: () => void;
  /** Le da frontera a la hoja: scope propio, y se abre para escribirla. */
  onCrearPlanilla: () => void;
  /** Copia la genérica al nodo para poder editarla, y la abre. */
  onDesprender: () => void;
  /** El scope con el que se evalúa su hoja: los campos atados ya resueltos. */
  atados: Record<string, unknown>;
  onImportar: (slug: string) => void;
  onEntrada: (nombre: string, valor: number) => void;
  onFormula: (campo: string, expr: string | undefined) => void;
  onPublicar: (salida: string, alias: string | undefined) => void;
  onSalida: (nombre: string) => void;
  onResellar: (sha256: string) => void;
  onQuitarPlanilla: () => void;
  onBorrar: () => void;
  onIrACarga: () => void;
  onCerrar: () => void;
}) {
  const [eligiendo, setEligiendo] = useState(false);
  useEscape(onCerrar);
  const valor = evaluacion.valores.find((v) => v.id === subcarga.id);
  const frontera = subcarga.frontera;

  return (
    <aside
      className={`flex h-full shrink-0 flex-col overflow-y-auto border-l border-border bg-white ${
        frontera || eligiendo ? 'w-[34rem]' : 'w-[30rem]'
      }`}
    >
      <header className="sticky top-0 z-10 border-b border-border bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onIrACarga}
              className="text-[11px] text-accent hover:underline"
            >
              ← {carga.nombre || 'la carga'}
            </button>
            <input
              type="text"
              value={subcarga.nombre}
              onChange={(e) => onRenombrar(e.target.value)}
              aria-label="Nombre de la partida"
              placeholder="Equipos sala de bombas"
              className="mt-0.5 w-full rounded border border-transparent bg-white px-1.5 py-0.5 text-sm font-semibold text-ink outline-none hover:border-border focus:border-accent"
            />
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="shrink-0 rounded border border-border px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
          >
            cerrar
          </button>
        </div>

        {grupo && <div className="mt-1.5 px-1.5">{grupo}</div>}
        {revision && <div className="mt-1.5 px-1.5">{revision}</div>}

        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          {/* El nombre es una etiqueta; cuál variable aporta el valor se elige
              aparte. Con las dos cosas atadas había que llamar `CM_1` a una
              partida que en la memoria se lee «Equipos sala de bombas». */}
          {frontera ? (
            <span className="text-[11px] text-muted">El valor sale del cálculo de esta partida.</span>
          ) : (
            <label className="flex min-w-0 items-baseline gap-1.5 text-[11px] text-muted">
              Valor de la partida
              <select
                value={subcarga.variable ?? ''}
                onChange={(e) => onVariable(e.target.value)}
                aria-label="Variable que aporta el valor"
                className={`min-w-0 rounded border bg-white px-1.5 py-0.5 font-mono text-[11px] text-ink outline-none focus:border-accent ${
                  valor?.problema ? 'border-error' : 'border-border'
                }`}
              >
                <option value="">— elige una —</option>
                {variables.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
                {/* La elegida puede haber dejado de definirse al editar la hoja;
                    se sigue mostrando para que se vea qué se perdió. */}
                {subcarga.variable && !variables.includes(subcarga.variable) && (
                  <option value={subcarga.variable}>{subcarga.variable} (ya no se define)</option>
                )}
              </select>
            </label>
          )}
          <span
            className={`shrink-0 font-mono text-sm ${valor?.problema ? 'text-error' : 'text-ink'}`}
          >
            {valor?.texto ?? '—'}
          </span>
        </div>

        {valor?.problema && (
          <p className="mt-1 text-[10px] leading-snug text-error">{valor.problema}</p>
        )}
        {problemaGrafo && (
          <p className="mt-1 text-[10px] leading-snug text-error">{problemaGrafo}</p>
        )}
      </header>

      {/* Sin `min-h-0`, por lo mismo que en `PanelCalculo`: el pie se montaba
          encima del contenido largo. */}
      <section className="flex flex-1 flex-col px-4 py-3">
        {frontera && frontera.procedencia !== 'biblioteca' ? (
          <FichaPropia
            frontera={frontera}
            define={definicionesDe(subcarga.hoja)}
            sueltos={nombresSueltos(subcarga.hoja)}
            atados={atados}
            otrosAlias={otrosAlias}
            conSalida
            onAbrirHoja={onAbrirHoja}
            onFormula={onFormula}
            onPublicar={onPublicar}
            onSalida={onSalida}
            onQuitar={onQuitarPlanilla}
          />
        ) : frontera ? (
          <FichaGenerica
            estado={estado}
            frontera={frontera}
            instancia={instancia}
            otrosAlias={otrosAlias}
            onAbrirHoja={onAbrirHoja}
            onDesprender={onDesprender}
            onEntrada={onEntrada}
            onFormula={onFormula}
            onPublicar={onPublicar}
            onSalida={onSalida}
            onResellar={onResellar}
            onQuitar={onQuitarPlanilla}
          />
        ) : eligiendo ? (
          <SelectorGenerica
            onElegir={(slug) => {
              setEligiendo(false);
              onImportar(slug);
            }}
            onCancelar={() => setEligiendo(false)}
          />
        ) : (
          <>
            {/* `key` por partida: el bloque en edición es estado de la hoja que
                se está mirando, y al saltar a otra no hay que arrastrarlo. */}
            <MiniHoja
              key={subcarga.id}
              hoja={subcarga.hoja}
              regions={regions}
              results={results}
              onCambiar={onHoja}
            />
            {/* La hoja libre sigue siendo el camino corto —un valor, un tanteo—
                y traer una genérica es lo que se hace cuando ese tanteo se
                convierte en un cálculo que hay que respaldar con una norma. */}
            <div className="mt-3 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={onAbrirHoja}
                title="Abrir esta hoja en el canvas matemático, en una pestaña"
                className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
              >
                abrir como hoja ↗
              </button>
              <button
                type="button"
                onClick={onCrearPlanilla}
                title="La hoja pasa a tener su propio espacio de nombres: lo que defina deja de verse desde el resto de la obra salvo lo que publiques."
                className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
              >
                crear planilla de cálculo
              </button>
              <button
                type="button"
                onClick={() => setEligiendo(true)}
                className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
              >
                respaldar con una planilla de la biblioteca…
              </button>
            </div>
          </>
        )}
      </section>

      <footer className="border-t border-border px-4 py-2">
        <button
          type="button"
          onClick={onBorrar}
          className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-error hover:text-error"
        >
          quitar esta partida
        </button>
      </footer>
    </aside>
  );
}
