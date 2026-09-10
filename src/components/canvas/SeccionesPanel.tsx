import { useMemo, useState } from 'react';
import type { Region } from '../../lib/worksheet';
import { nivelEncabezado, textoEncabezado } from './BloqueDoc';

interface Props {
  regions: Region[];
  /** La región que la hoja está dibujando como título, si la hay. */
  idTitulo?: string;
  /** Lleva la hoja hasta la sección y la resalta. */
  onIr: (regionId: string) => void;
}

interface Fila {
  id: string;
  nivel: 1 | 2 | 3;
  texto: string;
}

/**
 * El índice de la hoja: sus encabezados, en orden de lectura, con la sangría de
 * su nivel.
 *
 * El mismo problema que resuelve el panel de variables, en el otro eje. Una
 * planilla real ronda las 250 regiones y los 16.000 px de alto, y hasta ahora la
 * única forma de saber qué secciones tenía —o de llegar a una— era recorrerla
 * entera con la rueda del ratón.
 *
 * Los niveles salen de `nivelEncabezado`, que es la única autoridad sobre qué es
 * un encabezado: si este panel los dedujera por su cuenta, la lista y la hoja
 * podrían acabar discrepando sobre qué es una sección.
 */
export default function SeccionesPanel({ regions, idTitulo, onIr }: Props) {
  const [filtro, setFiltro] = useState('');

  const filas = useMemo<Fila[]>(() => {
    return [...regions]
      // El mismo comparador con el que el motor resuelve el scope compartido:
      // el índice tiene que leerse en el orden en que se lee la hoja.
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .flatMap((r) => {
        const nivel = nivelEncabezado(r);
        // El título de la hoja encabeza el índice aunque no lleve `#`: es el
        // encabezado de nivel 1 de facto, y la hoja ya lo dibuja como tal.
        if (r.id === idTitulo) {
          return [{ id: r.id, nivel: 1 as const, texto: textoEncabezado(r) || r.src.trim() }];
        }
        if (nivel === 0) return [];
        return [{ id: r.id, nivel, texto: textoEncabezado(r) }];
      });
  }, [regions, idTitulo]);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return q ? filas.filter((f) => f.texto.toLowerCase().includes(q)) : filas;
  }, [filas, filtro]);

  return (
    <div className="flex h-full w-56 flex-col border-l border-border bg-surface/80 backdrop-blur">
      <div className="border-b border-border p-2">
        <label className="flex items-center justify-between text-xs font-semibold text-ink">
          Secciones
          <span className="font-normal text-muted">{filas.length}</span>
        </label>
        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar…"
          aria-label="Buscar una sección"
          className="mt-1.5 w-full rounded border border-border bg-white px-2 py-1 text-xs text-ink outline-none focus:border-accent"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visibles.length === 0 ? (
          <p className="p-2 text-[11px] leading-tight text-muted">
            {filas.length === 0 ? (
              <>
                La hoja no tiene secciones. Escribe <code className="text-ink">#&nbsp;</code>,{' '}
                <code className="text-ink">##&nbsp;</code> o <code className="text-ink">###&nbsp;</code>{' '}
                al principio de un bloque de texto para abrir una.
              </>
            ) : (
              `Ninguna sección coincide con «${filtro.trim()}».`
            )}
          </p>
        ) : (
          <ul>
            {visibles.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onIr(f.id)}
                  title={`${f.texto}\nIr a esta sección`}
                  className="flex w-full items-baseline gap-1.5 border-b border-border/60 py-1 pr-2 text-left hover:bg-ink/5"
                  // La sangría va en línea y no por clases: son tres niveles
                  // calculados, y Tailwind no genera clases que no vea escritas.
                  style={{ paddingLeft: 8 + (f.nivel - 1) * 12 }}
                >
                  <span
                    aria-hidden
                    className={`shrink-0 font-mono text-[10px] ${
                      f.nivel === 1 ? 'text-accent' : 'text-muted/60'
                    }`}
                  >
                    {'#'.repeat(f.nivel)}
                  </span>
                  <span
                    className={`truncate text-[11px] ${
                      f.nivel === 1
                        ? 'font-semibold text-ink'
                        : f.nivel === 2
                          ? 'font-medium text-ink'
                          : 'text-muted'
                    }`}
                  >
                    {f.texto}
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
