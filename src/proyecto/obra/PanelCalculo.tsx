import { useState } from 'react';
import type { Region, SheetResults } from '../../lib/worksheet';
import type { EstadoGenerica } from './biblioteca';
import type { Instanciada } from './evaluacion';
import { useEscape } from './useEscape';
import FichaGenerica from './FichaGenerica';
import MiniHoja from './MiniHoja';
import SelectorGenerica from './SelectorGenerica';
import type { NodoCalculo } from './modelo';

/**
 * Un cálculo de la obra: su hoja libre, o una planilla de la biblioteca.
 *
 * La hoja libre es lo que hace del canvas un grafo de datos. Un nodo
 * «Geometría» que define `A_planta` y `h_losa` no es ninguna planilla de la
 * biblioteca —no verifica nada, no cita ninguna norma— y es, sin embargo, el
 * dato del que cuelgan las demás. Lo que define queda disponible para cualquier
 * otro nodo con solo escribir su nombre.
 *
 * Es el panel más ancho (34rem) porque una genérica llega a declarar 55
 * entradas: en 26 el formulario se lee a una palabra por línea.
 */
export default function PanelCalculo({
  calculo,
  estado,
  define,
  problemaGrafo,
  regions,
  results,
  instancia,
  otrosAlias,
  onNombre,
  onHoja,
  onAbrirHoja,
  onImportar,
  onEntrada,
  onFormula,
  onPublicar,
  onResellar,
  onQuitarPlanilla,
  onBorrar,
  onCerrar,
}: {
  calculo: NodoCalculo;
  estado: EstadoGenerica | undefined;
  /** Los nombres que su hoja publica al resto de la obra. */
  define: string[];
  problemaGrafo: string;
  /** La hoja global de la obra: el autocompletado la necesita entera para poder
   *  ofrecer lo que definen los nodos de aguas arriba. */
  regions: Region[];
  results: SheetResults;
  /** Lo que su planilla produjo, si la tiene, en su sitio del orden de lectura. */
  instancia: Instanciada | undefined;
  otrosAlias: ReadonlySet<string>;
  onNombre: (nombre: string) => void;
  onHoja: (hoja: Region[]) => void;
  /** Abre esta hoja como pestaña, con el canvas matemático entero. */
  onAbrirHoja: () => void;
  onImportar: (slug: string) => void;
  onEntrada: (nombre: string, valor: number) => void;
  onFormula: (campo: string, expr: string | undefined) => void;
  onPublicar: (salida: string, alias: string | undefined) => void;
  onResellar: (sha256: string) => void;
  onQuitarPlanilla: () => void;
  onBorrar: () => void;
  onCerrar: () => void;
}) {
  const [eligiendo, setEligiendo] = useState(false);
  useEscape(onCerrar);

  return (
    <aside className="flex h-full w-[34rem] shrink-0 flex-col overflow-y-auto border-l border-border bg-white">
      <header className="sticky top-0 z-10 border-b border-border bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={calculo.nombre}
              onChange={(e) => onNombre(e.target.value)}
              aria-label="Nombre del cálculo"
              placeholder="Geometría"
              className="w-full rounded border border-transparent bg-white px-1.5 py-0.5 text-sm font-semibold text-ink outline-none hover:border-border focus:border-accent"
            />
            {/* Lo que el nodo publica se lee igual venga de su hoja o de las
                salidas de su planilla: para el resto de la obra son lo mismo,
                un nombre con un valor. */}
            <p className="px-1.5 text-[11px] leading-snug text-muted">
              {define.length > 0 ? (
                <>
                  Publica {define.length === 1 ? 'la variable ' : 'las variables '}
                  <span className="font-mono text-ink">{define.join(', ')}</span>
                </>
              ) : calculo.frontera ? (
                'Respaldado por una planilla. Marca en «Salidas» lo que tengan que ver los demás nodos.'
              ) : (
                'Lo que definas acá queda disponible para los demás nodos.'
              )}
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

        {problemaGrafo && (
          <p className="mt-1 text-[10px] leading-snug text-error">{problemaGrafo}</p>
        )}
      </header>

      <section className="flex min-h-0 flex-1 flex-col px-4 py-3">
        {calculo.frontera ? (
          <FichaGenerica
            estado={estado}
            frontera={calculo.frontera}
            instancia={instancia}
            otrosAlias={otrosAlias}
            onEntrada={onEntrada}
            onFormula={onFormula}
            onPublicar={onPublicar}
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
            <MiniHoja
              key={calculo.id}
              hoja={calculo.hoja}
              regions={regions}
              results={results}
              onCambiar={onHoja}
            />
            <div className="mt-3 flex flex-wrap gap-1">
              {/* La mini hoja es una lista y la pestaña es el plano, y las dos
                  editan el MISMO dato: ahí se escribe con la paleta de símbolos,
                  el autocompletado completo, deshacer y la vista del papel. */}
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
          quitar este nodo
        </button>
      </footer>
    </aside>
  );
}
