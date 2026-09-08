import { useMemo, useState } from 'react';
import type { Region, SheetResults } from '../../lib/worksheet';

interface Props {
  regions: Region[];
  results: SheetResults;
  /** Lleva la hoja hasta la región que define la variable y la resalta. */
  onIr: (regionId: string) => void;
}

interface Fila {
  nombre: string;
  valor: string;
  esFuncion?: boolean;
  regionId: string;
  /** Se define más de una vez: la de más abajo es la que manda. */
  redefinida?: boolean;
}

/**
 * Panel de inspección de las variables de la hoja.
 *
 * Una planilla real ronda las 250 regiones y los 16.000 px de alto: saber qué
 * vale una variable obliga a buscarla a ojo por toda la hoja. El panel la lista
 * con su valor y, sobre todo, salta a donde se define.
 *
 * El orden es el de lectura (y, luego x), el mismo con el que el motor resuelve
 * el scope, para que la lista se lea como se lee la hoja.
 */
export default function VariablePanel({ regions, results, onIr }: Props) {
  const [filtro, setFiltro] = useState('');

  const filas = useMemo<Fila[]>(() => {
    const orden = [...regions].sort((a, b) => a.y - b.y || a.x - b.x);
    const vistos = new Map<string, number>();
    const out: Fila[] = [];
    for (const r of orden) {
      const def = results[r.id]?.define;
      if (!def) continue;
      const previo = vistos.get(def.nombre);
      if (previo !== undefined) {
        // Se queda la última definición (la que gana en orden de lectura), pero
        // se marca para que se vea que hay una anterior siendo pisada.
        out[previo] = { ...out[previo], ...def, regionId: r.id, redefinida: true };
        continue;
      }
      vistos.set(def.nombre, out.length);
      out.push({ ...def, regionId: r.id });
    }
    return out;
  }, [regions, results]);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return q ? filas.filter((f) => f.nombre.toLowerCase().includes(q)) : filas;
  }, [filas, filtro]);

  return (
    <div className="flex h-full w-56 flex-col border-l border-border bg-surface/80 backdrop-blur">
      <div className="border-b border-border p-2">
        <label className="flex items-center justify-between text-xs font-semibold text-ink">
          Variables
          <span className="font-normal text-muted">{filas.length}</span>
        </label>
        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar…"
          aria-label="Buscar una variable"
          className="mt-1.5 w-full rounded border border-border bg-white px-2 py-1 text-xs text-ink outline-none focus:border-accent"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visibles.length === 0 ? (
          <p className="p-2 text-[11px] leading-tight text-muted">
            {filas.length === 0
              ? 'La hoja todavía no define ninguna variable.'
              : `Ninguna variable coincide con «${filtro.trim()}».`}
          </p>
        ) : (
          <ul>
            {visibles.map((f) => (
              <li key={f.nombre}>
                <button
                  type="button"
                  onClick={() => onIr(f.regionId)}
                  title={`${f.nombre} = ${f.valor}\nIr a donde se define`}
                  className="flex w-full flex-col items-start gap-0.5 border-b border-border/60 px-2 py-1 text-left hover:bg-ink/5"
                >
                  <span className="flex w-full items-baseline justify-between gap-1">
                    <span className="truncate font-mono text-[11px] font-medium text-ink">
                      {f.nombre}
                    </span>
                    {f.redefinida && (
                      <span
                        title="Se define más de una vez; vale la de más abajo"
                        className="shrink-0 text-[10px] text-amber-600"
                      >
                        ↻
                      </span>
                    )}
                  </span>
                  <span
                    className={`w-full truncate text-[11px] ${
                      f.esFuncion ? 'font-mono italic text-muted' : 'text-muted'
                    }`}
                  >
                    {f.valor}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
