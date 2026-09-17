import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { traerGrafo } from './api';
import type { Grafo, NodoGrafo, Severidad } from './contrato';
import {
  colocar,
  guardarLayout,
  layoutGuardado,
  olvidarLayout,
  type Posicion,
} from './layout';
import Enlace from '../components/Enlace';
import NodoHarness from './NodoHarness';
import PanelLateral from './PanelLateral';

/**
 * El canvas de un proyecto del harness.
 *
 * Lo que se dibuja NO SE INVENTA ACÁ: es lo que `harness.grafo` proyecta desde
 * los archivos del proyecto —el perfil, el catálogo de normas, las cargas, las
 * planillas, los mapas de trazabilidad—. Este componente no calcula nada y no
 * escribe nada; del otro lado el servidor sólo responde GET.
 *
 * Lo único propio del canvas es dónde quedó cada nodo, y eso vive en
 * `localStorage`: si se guardara en el repo del proyecto habría dos copias del
 * estado y la segunda divergiría sin avisar.
 */

const TIPOS_NODO = { harness: NodoHarness };

const COLOR: Record<Severidad, string> = {
  ok: '#cbd5e1',
  aviso: '#d97706',
  error: '#dc2626',
};

/** Orden de los filtros: el mismo que las columnas, para que apagar uno no
 *  reordene mentalmente el canvas. */
const TIPOS = [
  'proyecto',
  'norma',
  'hueco',
  'accion',
  'carga',
  'familia-combinacion',
  'modelo',
  'hoja-de-valores',
  'planilla',
  'lectura',
  'documento',
  'decision',
  'hallazgo',
];

export default function CanvasProyecto({ slug }: { slug: string }) {
  const [grafo, setGrafo] = useState<Grafo | null>(null);
  const [error, setError] = useState<{ motivo: string; detalle: string } | null>(null);
  const [nodos, setNodos] = useState<Node[]>([]);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [soloDesfases, setSoloDesfases] = useState(false);
  const { fitView } = useReactFlow();
  const medidos = useNodesInitialized();

  // ── Carga ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    setGrafo(null);
    setError(null);
    traerGrafo(slug)
      .then((g) => vivo && setGrafo(g))
      .catch((e: Error & { detalle?: string }) => {
        if (vivo) setError({ motivo: e.message, detalle: e.detalle ?? '' });
      });
    return () => {
      vivo = false;
    };
  }, [slug]);

  const visibles: NodoGrafo[] = useMemo(() => {
    if (!grafo) return [];
    return grafo.nodos.filter(
      (n) =>
        !ocultos.has(n.tipo) &&
        (!soloDesfases || n.severidad !== 'ok' || n.tipo === 'proyecto'),
    );
  }, [grafo, ocultos, soloDesfases]);

  // Recoloca cuando cambia el conjunto visible, respetando lo que se movió.
  useEffect(() => {
    if (!grafo) return;
    const auto = colocar(visibles);
    const guardado = layoutGuardado(slug);
    setNodos(
      visibles.map((n) => ({
        id: n.id,
        type: 'harness',
        position: guardado[n.id] ?? auto[n.id] ?? { x: 0, y: 0 },
        data: n as unknown as Record<string, unknown>,
        selected: n.id === seleccion,
        deletable: false,
      })),
    );
    // `seleccion` se omite a propósito: marcarla no tiene que recolocar nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grafo, visibles, slug]);

  // Re-encuadra cuando cambia el conjunto visible. Sin esto, apagar un tipo o
  // pedir «solo lo que no calza» deja los nodos que quedan del tamaño que tenían
  // entre 100: el filtro parece no haber hecho nada.
  //
  // Espera a `useNodesInitialized` porque `fitView` encuadra lo MEDIDO: llamarlo
  // antes de que React Flow mida los nodos nuevos encuadra cajas de tamaño cero
  // y deja el lienzo con un zoom absurdo.
  useEffect(() => {
    if (!grafo || !medidos) return;
    const t = window.setTimeout(() => fitView({ padding: 0.12, duration: 250 }), 30);
    return () => window.clearTimeout(t);
  }, [grafo, visibles, medidos, fitView]);

  const aristas: Edge[] = useMemo(() => {
    if (!grafo) return [];
    const vivos = new Set(visibles.map((n) => n.id));
    return grafo.aristas
      .filter((a) => vivos.has(a.desde) && vivos.has(a.hasta))
      .map((a, i) => ({
        id: `${a.desde}->${a.hasta}:${a.tipo}:${i}`,
        source: a.desde,
        target: a.hasta,
        label: a.etiqueta || undefined,
        animated: a.tipo === 'entrega',
        style: { stroke: COLOR[a.severidad] ?? COLOR.ok, strokeWidth: a.severidad === 'ok' ? 1 : 1.6 },
        labelStyle: { fontSize: 9, fill: '#6b7280' },
      }));
  }, [grafo, visibles]);

  const alCambiarNodos = useCallback(
    (cambios: NodeChange[]) => {
      setNodos((previos) => {
        const siguientes = applyNodeChanges(cambios, previos);
        if (cambios.some((c) => c.type === 'position' && c.dragging === false)) {
          const posiciones: Record<string, Posicion> = {};
          for (const n of siguientes) posiciones[n.id] = { x: n.position.x, y: n.position.y };
          guardarLayout(slug, posiciones);
        }
        return siguientes;
      });
    },
    [slug],
  );

  const nodoSeleccionado = useMemo(
    () => grafo?.nodos.find((n) => n.id === seleccion) ?? null,
    [grafo, seleccion],
  );

  // ── Estados que no son el canvas ───────────────────────────────────────────
  if (error) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-16">
        <h1 className="text-lg font-semibold text-error">{error.motivo}</h1>
        {error.detalle && (
          <p className="mt-2 text-sm leading-relaxed text-muted">{error.detalle}</p>
        )}
        <p className="mt-6 text-xs text-muted">
          <Enlace a={{ vista: 'proyectos' }} className="text-accent hover:underline">
            ← Volver a los proyectos
          </Enlace>
        </p>
      </main>
    );
  }

  if (!grafo) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-16 text-sm text-muted">
        Midiendo <span className="font-mono">{slug}</span>…
      </main>
    );
  }

  const conteo = new Map<string, number>();
  for (const n of grafo.nodos) conteo.set(n.tipo, (conteo.get(n.tipo) ?? 0) + 1);
  const rojos = grafo.nodos.filter((n) => n.severidad === 'error').length;
  const amarillos = grafo.nodos.filter((n) => n.severidad === 'aviso').length;

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border bg-white px-4 py-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Enlace a={{ vista: 'proyectos' }} className="text-xs text-accent hover:underline">
            ← proyectos
          </Enlace>
          <h1 className="text-sm font-semibold text-ink">{grafo.proyecto}</h1>
          <span className="font-mono text-[10px] text-muted">
            {grafo.modelo_vigente || 'sin modelo vigente'}
          </span>
          <span className="ml-auto text-[10px] text-muted">
            {grafo.nodos.length} nodos · {grafo.aristas.length} aristas ·{' '}
            <span className="text-error">{rojos} rojo</span> ·{' '}
            <span className="text-aviso">{amarillos} aviso</span> · contrato {grafo.contrato}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setSoloDesfases((v) => !v)}
            className={`rounded border px-2 py-0.5 text-[10px] ${
              soloDesfases
                ? 'border-accent bg-accent text-white'
                : 'border-border text-muted hover:border-accent'
            }`}
          >
            solo lo que no calza
          </button>
          {TIPOS.filter((t) => conteo.has(t)).map((t) => {
            const apagado = ocultos.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() =>
                  setOcultos((prev) => {
                    const s = new Set(prev);
                    if (s.has(t)) s.delete(t);
                    else s.add(t);
                    return s;
                  })
                }
                className={`rounded border px-2 py-0.5 text-[10px] ${
                  apagado
                    ? 'border-border text-border'
                    : 'border-border text-muted hover:border-accent hover:text-accent'
                }`}
              >
                {t} {conteo.get(t)}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              olvidarLayout(slug);
              const auto = colocar(visibles);
              setNodos((prev) =>
                prev.map((n) => ({ ...n, position: auto[n.id] ?? n.position })),
              );
            }}
            className="ml-auto rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
          >
            reordenar
          </button>
        </div>

        {grafo.avisos.length > 0 && (
          <p className="mt-1 text-[10px] leading-snug text-aviso">
            {grafo.avisos.length} aviso(s) de la proyección: {grafo.avisos[0]}
            {grafo.avisos.length > 1 && ` (+${grafo.avisos.length - 1})`}
          </p>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <ReactFlow
            nodes={nodos}
            edges={aristas}
            nodeTypes={TIPOS_NODO}
            onNodesChange={alCambiarNodos}
            onNodeClick={(_, n) => setSeleccion(n.id)}
            onPaneClick={() => setSeleccion(null)}
            // Este canvas es un VISOR: lo que se dibuja sale de los archivos del
            // proyecto y del otro lado sólo hay GET. Con los valores por omisión
            // de React Flow, Backspace «borraba» del lienzo un nodo que es una
            // proyección inmutable, y el Handle dejaba arrastrar una arista que
            // el harness nunca dijo. (El `deletable: false` de cada nodo cierra
            // las demás vías; esto cierra la tecla.)
            deleteKeyCode={null}
            nodesConnectable={false}
            fitView
            minZoom={0.05}
            proOptions={{ hideAttribution: false }}
          >
            <Background gap={24} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => COLOR[(n.data as unknown as NodoGrafo).severidad] ?? COLOR.ok}
            />
          </ReactFlow>
        </div>

        <PanelLateral slug={slug} nodo={nodoSeleccionado} onCerrar={() => setSeleccion(null)} />
      </div>
    </div>
  );
}

export function CanvasProyectoConProveedor({ slug }: { slug: string }) {
  return (
    <ReactFlowProvider>
      <CanvasProyecto slug={slug} />
    </ReactFlowProvider>
  );
}
