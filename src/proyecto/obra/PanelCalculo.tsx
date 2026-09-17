import { useState } from 'react';
import type { Region, SheetResults } from '../../lib/worksheet';
import type { EstadoGenerica } from './biblioteca';
import FichaGenerica from './FichaGenerica';
import MiniHoja from './MiniHoja';
import SelectorGenerica from './SelectorGenerica';
import type { Bloque, NodoCalculo } from './modelo';

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
  scopeObra,
  onNombre,
  onBloques,
  onImportar,
  onEntrada,
  onFormula,
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
  scopeObra: Record<string, unknown>;
  onNombre: (nombre: string) => void;
  onBloques: (bloques: Bloque[]) => void;
  onImportar: (slug: string) => void;
  onEntrada: (nombre: string, valor: number) => void;
  onFormula: (campo: string, expr: string | undefined) => void;
  onResellar: (sha256: string) => void;
  onQuitarPlanilla: () => void;
  onBorrar: () => void;
  onCerrar: () => void;
}) {
  const [eligiendo, setEligiendo] = useState(false);

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
            <p className="px-1.5 text-[11px] leading-snug text-muted">
              {calculo.importada
                ? 'Respaldado por una planilla de la biblioteca.'
                : define.length > 0
                  ? `Publica ${define.length === 1 ? 'la variable' : 'las variables'} `
                  : 'Lo que definas acá queda disponible para los demás nodos.'}
              {!calculo.importada && define.length > 0 && (
                <span className="font-mono text-ink">{define.join(', ')}</span>
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
        {calculo.importada ? (
          <FichaGenerica
            estado={estado}
            importada={calculo.importada}
            scopeObra={scopeObra}
            onEntrada={onEntrada}
            onFormula={onFormula}
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
              bloques={calculo.bloques}
              regions={regions}
              results={results}
              onCambiar={onBloques}
            />
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
          quitar este nodo
        </button>
      </footer>
    </aside>
  );
}
