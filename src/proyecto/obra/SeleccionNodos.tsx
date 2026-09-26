import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { dependenciasDe } from './copia';
import type { NodoCalculo, Obra } from './modelo';
import { useEscape } from './useEscape';

/**
 * Qué nodos de otra obra se llevan: lo comparten «Nueva obra a partir de esta»
 * y «Traer de otra obra».
 *
 * LO QUE LA SELECCIÓN USA ENTRA SOLO. Marcar la zapata marca también la carga
 * que la alimenta y la geometría de la que cuelga la carga (`dependenciasDe`),
 * rotuladas con quién las necesita. Se pueden desmarcar —quizá el destino ya
 * tiene su propia geometría—, pero entonces se dice qué va a quedar sin valor.
 */
export interface Seleccion {
  /** Lo que se lleva: lo elegido más sus dependencias no descartadas. */
  final: Set<string>;
  /** id → ids de quienes lo usan, para lo que entró por dependencia. */
  deps: Map<string, string[]>;
  alternar: (id: string) => void;
  alternarGrupo: (ids: string[]) => void;
}

/** `cubiertos`: los nombres que el destino ya define, que no arrastran nada. */
export function useSeleccion(origen: Obra | null, todos: boolean, cubiertos?: ReadonlySet<string>): Seleccion {
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());

  // Una obra de origen nueva empieza de cero: lo marcado en la anterior no
  // tiene sentido en esta.
  useEffect(() => {
    setElegidos(new Set(todos && origen ? origen.calculos.map((k) => k.id) : []));
    setExcluidas(new Set());
  }, [origen, todos]);

  const deps = useMemo(
    () => (origen ? dependenciasDe(origen, elegidos, cubiertos) : new Map<string, string[]>()),
    [origen, elegidos, cubiertos],
  );
  const final = useMemo(() => {
    const s = new Set(elegidos);
    for (const id of deps.keys()) if (!excluidas.has(id)) s.add(id);
    return s;
  }, [elegidos, deps, excluidas]);

  // Quitar a mano es una exclusión, no solo dejar de elegir: si no, lo que otro
  // nodo elegido usa volvería a entrar como dependencia en el mismo clic.
  const alternar = (id: string) => {
    if (final.has(id)) {
      setElegidos((s) => new Set([...s].filter((x) => x !== id)));
      setExcluidas((s) => new Set([...s, id]));
    } else {
      setElegidos((s) => new Set([...s, id]));
      setExcluidas((s) => new Set([...s].filter((x) => x !== id)));
    }
  };

  const alternarGrupo = (ids: string[]) => {
    const todosDentro = ids.every((id) => final.has(id));
    if (todosDentro) {
      setElegidos((s) => new Set([...s].filter((x) => !ids.includes(x))));
      setExcluidas((s) => new Set([...s, ...ids]));
    } else {
      setElegidos((s) => new Set([...s, ...ids]));
      setExcluidas((s) => new Set([...s].filter((x) => !ids.includes(x))));
    }
  };

  return { final, deps, alternar, alternarGrupo };
}

/** Qué es un nodo, en pocas palabras. */
function detalle(k: NodoCalculo): string {
  const f = k.frontera;
  if (f?.procedencia === 'biblioteca') return `planilla ${f.slug}`;
  if (f?.procedencia === 'derivada') return `copia de ${f.origen?.slug ?? 'una genérica'}`;
  const n = k.hoja.length;
  return `${f ? 'hoja propia · ' : ''}${n} bloque${n === 1 ? '' : 's'}`;
}

/** Una casilla que puede estar a medias, como la de un grupo con parte dentro. */
function Casilla({ marcada, aMedias, onCambiar }: { marcada: boolean; aMedias?: boolean; onCambiar: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!aMedias && !marcada;
  }, [aMedias, marcada]);
  return <input ref={ref} type="checkbox" checked={marcada} onChange={onCambiar} className="mt-0.5 shrink-0" />;
}

export function ListaSeleccion({ origen, sel }: { origen: Obra; sel: Seleccion }) {
  const nombre = (id: string) => origen.calculos.find((k) => k.id === id)?.nombre ?? id;
  /** Hasta dos nombres: la geometría la usan todos, y la lista entera tapaba el árbol. */
  const quienes = (ids: string[]) =>
    ids.length <= 2 ? ids.map(nombre).join(' y ') : `${nombre(ids[0])} y ${ids.length - 1} más`;
  const bloques: { id: string; titulo: string; color?: string; nodos: NodoCalculo[] }[] = [
    ...(origen.grupos ?? []).map((g) => ({
      id: g.id,
      titulo: g.nombre,
      color: g.color,
      nodos: origen.calculos.filter((k) => k.grupo === g.id),
    })),
    { id: '', titulo: 'Sin grupo', nodos: origen.calculos.filter((k) => !k.grupo) },
  ].filter((b) => b.nodos.length > 0);

  if (!origen.calculos.length) {
    return <p className="text-xs text-muted">Esa obra no tiene nodos de cálculo.</p>;
  }

  return (
    <ul className="space-y-2">
      {bloques.map((b) => {
        const ids = b.nodos.map((k) => k.id);
        const dentro = ids.filter((id) => sel.final.has(id)).length;
        return (
          <li key={b.id || '·'}>
            <label className="flex cursor-pointer items-start gap-2 text-xs font-semibold text-ink">
              <Casilla
                marcada={dentro === ids.length}
                aMedias={dentro > 0}
                onCambiar={() => sel.alternarGrupo(ids)}
              />
              {b.color && <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: b.color }} />}
              <span>
                {b.titulo} <span className="font-normal text-muted">· {dentro} de {ids.length}</span>
              </span>
            </label>
            <ul className="ml-5 mt-1 space-y-0.5">
              {b.nodos.map((k) => {
                const por = sel.deps.get(k.id);
                const dentroK = sel.final.has(k.id);
                return (
                  <li key={k.id}>
                    <label className="flex cursor-pointer items-start gap-2 text-xs text-ink">
                      <Casilla marcada={dentroK} onCambiar={() => sel.alternar(k.id)} />
                      <span className="min-w-0">
                        {k.nombre || 'Cálculo'}
                        {k.revisar && <span title={k.revisar.nota || 'Por revisar'}> ⚑</span>}
                        <span className="ml-1 text-[10px] text-muted">{detalle(k)}</span>
                        {por && (
                          <span className={`block text-[10px] ${dentroK ? 'text-accent' : 'text-aviso'}`}>
                            {dentroK
                              ? `entra porque lo usa ${quienes(por)}`
                              : `sin él, ${quienes(por)} quedará${por.length === 1 ? '' : 'n'} con nombres sin definir`}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

/** El marco de los dos diálogos: capa que cierra al hacer clic fuera, y Escape. */
export function Dialogo({
  titulo,
  onCerrar,
  children,
  pie,
  ancho = 'max-w-lg',
}: {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  pie: ReactNode;
  /** La clase de ancho máximo: una tabla antes/después no cabe en `max-w-lg`. */
  ancho?: string;
}) {
  useEscape(onCerrar);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-4 py-10" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-full w-full ${ancho} flex-col rounded-lg border border-border bg-white shadow-xl`}
      >
        <header className="flex items-baseline justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-xs text-muted hover:text-accent"
          >
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        <footer className="border-t border-border px-4 py-3">{pie}</footer>
      </div>
    </div>
  );
}
