import { useState } from 'react';
import type { Region, SheetResults } from '../../lib/worksheet';
import type { EstadoGenerica } from './biblioteca';
import type { Instanciada } from './evaluacion';
import FichaGenerica from './FichaGenerica';
import MiniHoja from './MiniHoja';
import SelectorGenerica from './SelectorGenerica';
import type { EvaluacionCarga } from './calculo';
import type { Bloque, Carga, Subcarga } from './modelo';

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
  otrosAlias,
  estado,
  onRenombrar,
  onVariable,
  onBloques,
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
}: {
  carga: Carga;
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
  onBloques: (bloques: Bloque[]) => void;
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
  const valor = evaluacion.valores.find((v) => v.id === subcarga.id);
  const importada = subcarga.importada;

  return (
    <aside
      className={`flex h-full shrink-0 flex-col overflow-y-auto border-l border-border bg-white ${
        importada || eligiendo ? 'w-[34rem]' : 'w-[30rem]'
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

        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          {/* El nombre es una etiqueta; cuál variable aporta el valor se elige
              aparte. Con las dos cosas atadas había que llamar `CM_1` a una
              partida que en la memoria se lee «Equipos sala de bombas». */}
          {importada ? (
            <span className="text-[11px] text-muted">El valor sale de la planilla importada.</span>
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

      <section className="flex min-h-0 flex-1 flex-col px-4 py-3">
        {importada ? (
          <FichaGenerica
            estado={estado}
            importada={importada}
            instancia={instancia}
            otrosAlias={otrosAlias}
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
              bloques={subcarga.bloques}
              regions={regions}
              results={results}
              onCambiar={onBloques}
            />
            {/* La hoja libre sigue siendo el camino corto —un valor, un tanteo—
                y traer una genérica es lo que se hace cuando ese tanteo se
                convierte en un cálculo que hay que respaldar con una norma. */}
            <button
              type="button"
              onClick={() => setEligiendo(true)}
              className="mt-3 self-start rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
            >
              respaldar con una planilla de la biblioteca…
            </button>
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
