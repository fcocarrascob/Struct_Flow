import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import Enlace from '../../components/Enlace';
import type { NodoGrafo, Severidad } from '../contrato';
import { colocar, guardarLayout, layoutGuardado, olvidarLayout, type Posicion } from '../layout';
import { archivoDeObra, guardarObra, leerObra, nombreDeArchivo } from './almacen';
import { descargarHoja } from '../../lib/canvas-handoff';
import { cargarGenerica, type Genericas } from './biblioteca';
import { evaluarObra, problemaDeGrafo } from './evaluacion';
import { variablesDePartida } from './calculo';
import {
  agregarCalculo,
  agregarCarga,
  agregarModulo,
  borrarCalculo,
  borrarCarga,
  cambiarCalculo,
  cambiarCarga,
  cargaDeSubcarga,
  conFormula,
  conPublicacion,
  conSubcargas,
  nuevaSubcarga,
  nuevoCalculo,
  slugsImportados,
  type Bloque,
  type Carga,
  type Importada,
  type Modulo,
  type NodoCalculo,
  type Obra,
  type Subcarga,
} from './modelo';
import NodoObra from './NodoObra';
import PaletaNodos, { type EntradaPaleta } from './PaletaNodos';
import PanelCalculo from './PanelCalculo';
import PanelCargas from './PanelCargas';
import PanelSubcarga from './PanelSubcarga';
import {
  calculoDeNodo,
  cargaDeNodo,
  ID_NODO_CARGAS,
  idNodoDeCalculo,
  idNodoDeCarga,
  idNodoDeSubcarga,
  proyectar,
  subcargaDeNodo,
} from './proyeccion';

/**
 * El canvas de una obra: un proyecto propio de Struct_Flow, editable y local.
 *
 * Al revés que `../CanvasProyecto.tsx`, que pinta lo que el harness proyecta
 * desde archivos y no escribe nada, acá el documento es del usuario y vive en
 * `localStorage`. Comparten el armazón de React Flow y el contrato de nodo, pero
 * son dos componentes: los filtros por tipo, el «solo lo que no calza» y los
 * avisos de proyección de aquel no significan nada en una obra que empieza
 * vacía. Cuando aparezca un tercer lienzo valdrá la pena extraer el armazón.
 *
 * LOS NODOS NO SON ESTADO: SON LA PROYECCIÓN DEL DOCUMENTO
 * --------------------------------------------------------
 * Lo único que se guarda es la obra. Los nodos salen de `proyectar()` en cada
 * render y lo único propio del lienzo es dónde quedó cada uno, que va al mismo
 * almacén de posiciones que usa el canvas del harness.
 */

const TIPOS_NODO = { obra: NodoObra };

const COLOR: Record<Severidad, string> = {
  ok: '#cbd5e1',
  aviso: '#d97706',
  error: '#dc2626',
};

const ENCUADRE = { padding: 0.25, duration: 250, maxZoom: 1 };

/** «zapata-generica» → «Zapata». Para bautizar un nodo recién importado sin
 *  esperar a que la genérica termine de descargarse. */
function tituloCorto(slug: string): string {
  const base = slug.replace(/-generic[ao]$/, '').replace(/-/g, ' ');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function CanvasObra({ id }: { id: string }) {
  const [obra, setObra] = useState<Obra | null>(() => leerObra(id));
  const [nodos, setNodos] = useState<Node[]>([]);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [paletaAbierta, setPaletaAbierta] = useState(false);
  const [avisoGuardado, setAvisoGuardado] = useState('');
  const { fitView } = useReactFlow();
  const medidos = useNodesInitialized();

  const [genericas, setGenericas] = useState<Genericas>({});

  const claveLayout = `obra:${id}`;

  // La obra entera es UNA cadena: se evalúa una vez y de ahí sale todo —los
  // valores, las dependencias entre nodos y las flechas—. Recibe `genericas`
  // porque las planillas también son nodos de esa cadena: publican al scope
  // común lo que su `publica` declara.
  //
  // Se evalúa una copia APLAZADA del documento, como hace `MathCanvas` con sus
  // regiones: evaluar la obra son el orden topológico, la síntesis de la hoja y
  // una pasada de math.js por tramo, más cada planilla importada. Atado al
  // documento en vivo, eso corría con **cada tecla** — incluidas las del nombre
  // de la obra, de una carga o de una partida, que no participan de ningún
  // cálculo. El grafo se dibuja con el documento en vivo, así que un nodo nuevo
  // aparece en el acto y su valor llega en la siguiente pausa.
  const [obraEval, setObraEval] = useState(obra);
  useEffect(() => {
    const t = window.setTimeout(() => setObraEval(obra), 120);
    return () => window.clearTimeout(t);
  }, [obra]);

  const evaluacion = useMemo(
    () =>
      obraEval
        ? evaluarObra(obraEval, genericas)
        : {
            results: {},
            regions: [],
            scope: {},
            duenio: new Map(),
            repetidos: new Map(),
            usos: new Map(),
            define: new Map(),
            enCiclo: new Set<string>(),
            importadas: new Map(),
          },
    [obraEval, genericas],
  );

  const proyeccion = useMemo(
    () =>
      obra
        ? proyectar(obra, evaluacion, genericas)
        : { nodos: [], aristas: [], evaluaciones: {} },
    [obra, evaluacion, genericas],
  );

  // ── Las genéricas que la obra referencia ───────────────────────────────────
  // Se descargan una vez por slug y se quedan: `cargarModuloDeBiblioteca` ya
  // cachea la descarga, y acá se guarda el estado para que la proyección —que es
  // síncrona y pura— reciba lo que hay en vez de tener que esperar.
  const slugs = obra ? slugsImportados(obra).join('|') : '';
  const pedidas = useRef(new Set<string>());
  useEffect(() => {
    if (!slugs) return;
    for (const slug of slugs.split('|')) {
      // El registro de lo ya pedido va en una ref y no en el estado: si
      // dependiera de `genericas`, cada descarga terminada volvería a disparar
      // este efecto.
      if (pedidas.current.has(slug)) continue;
      pedidas.current.add(slug);
      setGenericas((prev) => ({ ...prev, [slug]: { fase: 'cargando' } }));
      // Sin guarda de cancelación, y es lo correcto: `pedidas` es permanente
      // pero un `vivo` sería por ejecución del efecto, así que bastaba con
      // borrar una partida mientras otra planilla se descargaba —el efecto se
      // reejecuta y el cleanup pone `vivo = false`— para que la respuesta se
      // descartara y el `continue` impidiera volver a pedirla: el nodo se
      // quedaba en «cargando…» hasta recargar la página. Aquí no hay nada que
      // cancelar: `cargarModuloDeBiblioteca` cachea la promesa y esta escritura
      // es idempotente por slug.
      cargarGenerica(slug).then((estado) => {
        setGenericas((prev) => ({ ...prev, [slug]: estado }));
      });
    }
  }, [slugs]);

  // ── Persistencia ───────────────────────────────────────────────────────────
  // Mismo compás que el canvas matemático: 300 ms de espera, más un guardado al
  // desmontar, porque el desmontaje cancela el temporizador y lo último que se
  // escribió es justo lo que más duele perder.
  const obraRef = useRef(obra);
  obraRef.current = obra;

  const guardar = useCallback((o: Obra) => {
    const r = guardarObra(o);
    setAvisoGuardado(r.ok ? '' : r.motivo);
  }, []);

  useEffect(() => {
    if (!obra) return;
    const t = window.setTimeout(() => guardar(obra), 300);
    return () => window.clearTimeout(t);
  }, [obra, guardar]);

  useEffect(() => {
    return () => {
      if (obraRef.current) guardarObra(obraRef.current);
    };
  }, []);

  // Y al cerrar la pestaña, recargar o pasar a otra, que tampoco desmontan: React
  // no se entera de que la página se va. Como el debounce se reinicia en cada
  // tecla, lo que se pierde no son 300 ms sino la ráfaga entera desde la última
  // pausa. Es la misma red que `MathCanvas.tsx`, con el mismo argumento:
  // `visibilitychange` es la señal fiable en móvil, donde `pagehide` a veces no
  // llega, y se escuchan las dos porque guardar dos veces lo mismo no cuesta nada.
  useEffect(() => {
    const vaciar = () => {
      if (obraRef.current) guardarObra(obraRef.current);
    };
    const alOcultar = () => {
      if (document.visibilityState === 'hidden') vaciar();
    };
    window.addEventListener('pagehide', vaciar);
    document.addEventListener('visibilitychange', alOcultar);
    return () => {
      window.removeEventListener('pagehide', vaciar);
      document.removeEventListener('visibilitychange', alOcultar);
    };
  }, []);

  // ── Nodos y aristas ────────────────────────────────────────────────────────
  // La posición que ya tenía un nodo manda sobre la automática: `colocar()`
  // centra cada columna respecto de la más alta, así que recalcularla en cada
  // tecla haría saltar el canvas entero mientras se escribe un nombre.
  const seleccionRef = useRef(seleccion);
  seleccionRef.current = seleccion;

  // Las posiciones guardadas se leen UNA vez, al abrir la obra. `layoutGuardado`
  // parsea el registro completo de todos los proyectos y todas las obras, y
  // llamarlo desde el efecto de abajo —que depende de la proyección— lo hacía en
  // cada tecla.
  const guardadoRef = useRef<Record<string, Posicion>>({});
  useEffect(() => {
    guardadoRef.current = layoutGuardado(claveLayout);
  }, [claveLayout]);

  useEffect(() => {
    // Con las aristas: la columna de un nodo es su tipo más su sitio en la
    // cadena, así que dos cálculos encadenados se dibujan uno a la derecha del
    // otro y la flecha se lee. Sin ellas caían los dos en la misma columna.
    const auto = colocar(proyeccion.nodos, proyeccion.aristas);
    const guardado = guardadoRef.current;
    setNodos((previos) => {
      const antes = new Map(previos.map((n) => [n.id, n.position]));
      return proyeccion.nodos.map((n) => ({
        id: n.id,
        type: 'obra',
        position: antes.get(n.id) ?? guardado[n.id] ?? auto[n.id] ?? { x: 0, y: 0 },
        data: n as unknown as Record<string, unknown>,
        selected: n.id === seleccionRef.current,
        deletable: false,
      }));
    });
  }, [proyeccion, claveLayout]);

  useEffect(() => {
    setNodos((previos) =>
      previos.map((n) =>
        n.selected === (n.id === seleccion) ? n : { ...n, selected: n.id === seleccion },
      ),
    );
  }, [seleccion]);

  // Las flechas llevan el nombre que viaja por ellas: sin la etiqueta, una
  // flecha de datos es indistinguible de la que solo dice «esta partida compone
  // esta carga», y el grafo vuelve a ser un organigrama.
  const aristas: Edge[] = useMemo(() => {
    // El id no lleva el índice del array: insertar una arista al principio
    // renombraba todas las posteriores y React Flow las recreaba enteras.
    return proyeccion.aristas.map((a) => ({
      id: `${a.desde}->${a.hasta}:${a.tipo}`,
      source: a.desde,
      target: a.hasta,
      label: a.etiqueta || undefined,
      style: {
        stroke: COLOR[a.severidad] ?? COLOR.ok,
        strokeWidth: a.severidad === 'ok' ? 1 : 1.6,
      },
      labelStyle: { fontSize: 9, fill: '#6b7280' },
    }));
  }, [proyeccion]);

  // Encuadra una sola vez, al medir los primeros nodos. A diferencia del canvas
  // del harness —que se re-encuadra al filtrar, porque el conjunto visible
  // cambia de golpe—, acá los nodos aparecen de a uno: re-encuadrar en cada
  // carga agregada haría que el lienzo se alejara diez veces seguidas.
  //
  // `maxZoom: 1` porque una obra empieza con un nodo: sin tope, encuadrar uno
  // solo lo amplía hasta llenar la pantalla, y la tarjeta queda del tamaño de un
  // cartel. Alejar está bien; acercar más allá del tamaño natural, no.
  //
  // La marca va DENTRO del temporizador, no antes: React Flow mide los nodos de
  // forma incremental, así que `nodos.length` cambia dentro de esos 30 ms, el
  // cleanup cancela el temporizador y con la marca puesta ya no se reprograma
  // nunca. Una obra con tres nodos abría con el lienzo en otro sitio y los nodos
  // fuera de la pantalla — visibles solo en el minimapa.
  const encuadrado = useRef(false);
  useEffect(() => {
    if (!medidos || encuadrado.current || nodos.length === 0) return;
    const t = window.setTimeout(() => {
      encuadrado.current = true;
      fitView(ENCUADRE);
    }, 30);
    return () => window.clearTimeout(t);
  }, [medidos, nodos.length, fitView]);

  const alCambiarNodos = useCallback(
    (cambios: NodeChange[]) => {
      setNodos((previos) => {
        const siguientes = applyNodeChanges(cambios, previos);
        if (cambios.some((c) => c.type === 'position' && c.dragging === false)) {
          const posiciones: Record<string, Posicion> = {};
          for (const n of siguientes) posiciones[n.id] = { x: n.position.x, y: n.position.y };
          guardarLayout(claveLayout, posiciones);
        }
        return siguientes;
      });
    },
    [claveLayout],
  );

  // ── Gestos ─────────────────────────────────────────────────────────────────
  const agregarNodo = useCallback((clave: EntradaPaleta) => {
    setPaletaAbierta(false);
    const actual = obraRef.current;
    if (!actual) return;
    if (clave === 'calculo') {
      const k = nuevoCalculo();
      setObra(agregarCalculo(actual, k));
      setSeleccion(idNodoDeCalculo(k.id));
      return;
    }
    setObra(agregarModulo(actual, clave as Modulo));
    setSeleccion(ID_NODO_CARGAS);
  }, []);

  // Se calcula fuera del actualizador de `setObra` a propósito: un actualizador
  // tiene que ser puro, y React puede volver a llamarlo. Seleccionar desde
  // dentro dispararía la selección dos veces.
  const nuevaCargaEnObra = useCallback(() => {
    const actual = obraRef.current;
    if (!actual) return;
    const { obra: siguiente, carga } = agregarCarga(actual);
    setObra(siguiente);
    // La fila nueva se enfoca sola en el panel, que es donde se la bautiza.
    setSeleccion(idNodoDeCarga(carga.id));
  }, []);

  const cambiarUnaCarga = useCallback(
    (idCarga: string, campos: Partial<Omit<Carga, 'id'>>) =>
      setObra((o) => (o ? cambiarCarga(o, idCarga, campos) : o)),
    [],
  );

  const borrarUnaCarga = useCallback((idCarga: string) => {
    setObra((o) => (o ? borrarCarga(o, idCarga) : o));
    setSeleccion((s) => (s === idNodoDeCarga(idCarga) ? ID_NODO_CARGAS : s));
  }, []);

  // ── El desglose de una carga ───────────────────────────────────────────────
  // Todas las escrituras del desglose pasan por `conSubcargas`, que reemplaza la
  // lista entera de la carga: un solo camino, y ninguno que pueda dejar una
  // partida a medio mover entre dos cargas.
  const agregarPartida = useCallback((idCarga: string) => {
    const actual = obraRef.current;
    const carga = actual?.cargas.find((c) => c.id === idCarga);
    if (!actual || !carga) return;
    const sub = nuevaSubcarga(carga.subcargas);
    setObra(conSubcargas(actual, idCarga, [...carga.subcargas, sub]));
    setSeleccion(idNodoDeSubcarga(sub.id));
  }, []);

  const cambiarPartida = useCallback(
    (idSub: string, cambio: (s: Subcarga) => Subcarga) => {
      setObra((o) => {
        if (!o) return o;
        const carga = cargaDeSubcarga(o, idSub);
        if (!carga) return o;
        return conSubcargas(
          o,
          carga.id,
          carga.subcargas.map((s) => (s.id === idSub ? cambio(s) : s)),
        );
      });
    },
    [],
  );

  const borrarPartida = useCallback((idSub: string) => {
    const actual = obraRef.current;
    const carga = actual && cargaDeSubcarga(actual, idSub);
    if (!actual || !carga) return;
    setObra(
      conSubcargas(
        actual,
        carga.id,
        carga.subcargas.filter((s) => s.id !== idSub),
      ),
    );
    setSeleccion(idNodoDeCarga(carga.id));
  }, []);

  // ── Importar una genérica ──────────────────────────────────────────────────
  // El sello se toma del MÓDULO ya cargado y no del índice: `cargarGenerica`
  // calcula el sha256 de los bytes que de verdad se instancian, y sellar con el
  // del índice haría que el nodo se declarara desfasado desde el primer
  // segundo si el índice fuera de otra compilación.
  const importar = useCallback(
    async (slug: string, aplicar: (imp: Importada) => void) => {
      pedidas.current.add(slug);
      setGenericas((prev) => ({ ...prev, [slug]: { fase: 'cargando' } }));
      const estado = await cargarGenerica(slug);
      setGenericas((prev) => ({ ...prev, [slug]: estado }));
      if (estado.fase !== 'lista') return;
      aplicar({
        slug,
        sha256: estado.modulo.biblioteca?.sha256 ?? '',
        entradas: { ...estado.modulo.porDefecto },
      });
    },
    [],
  );

  const cambiarUnCalculo = useCallback(
    (idCalculo: string, cambio: (k: NodoCalculo) => NodoCalculo) =>
      setObra((o) => (o ? cambiarCalculo(o, idCalculo, cambio) : o)),
    [],
  );

  const borrarUnCalculo = useCallback((idCalculo: string) => {
    setObra((o) => (o ? borrarCalculo(o, idCalculo) : o));
    setSeleccion(null);
  }, []);

  const reordenar = useCallback(() => {
    olvidarLayout(claveLayout);
    guardadoRef.current = {};
    const auto = colocar(proyeccion.nodos, proyeccion.aristas);
    setNodos((previos) => previos.map((n) => ({ ...n, position: auto[n.id] ?? n.position })));
    // El temporizador se guarda: sin esto, salir del canvas en esos 30 ms
    // llamaba a `fitView` contra un proveedor ya desmontado.
    if (temporizadorEncuadre.current) window.clearTimeout(temporizadorEncuadre.current);
    temporizadorEncuadre.current = window.setTimeout(() => fitView(ENCUADRE), 30);
  }, [claveLayout, proyeccion, fitView]);

  const temporizadorEncuadre = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (temporizadorEncuadre.current) window.clearTimeout(temporizadorEncuadre.current);
    },
    [],
  );

  // ── La obra que no existe ──────────────────────────────────────────────────
  if (!obra) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-16">
        <h1 className="text-lg font-semibold text-error">No hay ninguna obra con ese id</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Las obras viven en el almacenamiento de <strong>este</strong> navegador, así que un
          enlace a una obra no funciona en otro equipo ni después de borrar los datos del sitio.
        </p>
        <p className="mt-6 text-xs text-muted">
          <Enlace a={{ vista: 'proyectos' }} className="text-accent hover:underline">
            ← Volver a los proyectos
          </Enlace>
        </p>
      </main>
    );
  }

  const idCargaSeleccionada = seleccion ? cargaDeNodo(seleccion) : null;
  const idPartidaSeleccionada = seleccion ? subcargaDeNodo(seleccion) : null;
  const panelDeCargas =
    idPartidaSeleccionada === null &&
    (seleccion === ID_NODO_CARGAS || idCargaSeleccionada !== null);

  const cargaDeLaPartida = idPartidaSeleccionada
    ? cargaDeSubcarga(obra, idPartidaSeleccionada)
    : undefined;
  const partida = cargaDeLaPartida?.subcargas.find((s) => s.id === idPartidaSeleccionada);

  const idCalculoSeleccionado = seleccion ? calculoDeNodo(seleccion) : null;
  const calculo = obra.calculos.find((k) => k.id === idCalculoSeleccionado);

  // Los nombres que publican los OTROS nodos: con eso el selector de salidas
  // propone un alias libre en vez de uno que deja los dos nodos en rojo en el
  // mismo clic que los conecta.
  const aliasAjenos = (idNodo: string): ReadonlySet<string> => {
    const fuera = new Set<string>();
    for (const [id, nombres] of evaluacion.define) {
      if (id !== idNodo) for (const n of nombres) fuera.add(n);
    }
    return fuera;
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border bg-white px-4 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Enlace a={{ vista: 'proyectos' }} className="text-xs text-accent hover:underline">
            ← proyectos
          </Enlace>
          <input
            type="text"
            value={obra.nombre}
            // Con actualizador, como el resto de los escritores: partir del
            // `obra` de la closure pierde lo que haya escrito entre el render y
            // el evento —por ejemplo el `aplicar()` de una importación que
            // acaba de resolver—.
            onChange={(e) => setObra((o) => (o ? { ...o, nombre: e.target.value } : o))}
            aria-label="Nombre de la obra"
            className="w-64 rounded border border-transparent px-1 py-0.5 text-sm font-semibold text-ink outline-none hover:border-border focus:border-accent"
          />
          <span className="font-mono text-[10px] text-muted">{obra.id}</span>
          <span className="ml-auto text-[10px] text-muted">
            {proyeccion.nodos.length} nodo{proyeccion.nodos.length === 1 ? '' : 's'} ·{' '}
            {obra.cargas.length} carga{obra.cargas.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="relative mt-1.5 flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setPaletaAbierta((v) => !v)}
            aria-expanded={paletaAbierta}
            className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
          >
            + agregar nodo
          </button>
          {paletaAbierta && (
            <PaletaNodos
              puestos={obra.modulos}
              onAgregar={agregarNodo}
              onCerrar={() => setPaletaAbierta(false)}
            />
          )}
          <button
            type="button"
            onClick={reordenar}
            disabled={proyeccion.nodos.length === 0}
            className="ml-auto rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent disabled:opacity-40"
          >
            reordenar
          </button>
          {/* La obra vive en este navegador y en ningún otro sitio: el archivo
              es la única forma de respaldarla o de llevarla a otro equipo. */}
          <button
            type="button"
            onClick={() => descargarHoja(archivoDeObra(obra), nombreDeArchivo(obra))}
            title="Descargar la obra como archivo"
            className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
          >
            exportar
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {/* Los avisos flotan sobre el lienzo y no empujan la fila: como hermanos
              del visor le robarían alto, y el canvas daría un salto al aparecer. */}
          {avisoGuardado && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center p-2">
              {/* `role="status"`: un aviso que sale solo y dice que lo que
                  escribes no se está guardando tiene que llegar también a quien
                  no lo ve. */}
              <p
                role="status"
                className="pointer-events-auto max-w-md rounded border border-aviso bg-white px-3 py-2 text-[11px] leading-snug text-aviso shadow-sm"
              >
                No se pudo guardar la obra. {avisoGuardado}
              </p>
            </div>
          )}

          {proyeccion.nodos.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <p className="max-w-sm text-center text-sm leading-relaxed text-muted">
                El canvas está vacío. Agrega el primer nodo con{' '}
                <span className="font-medium text-ink">+ agregar nodo</span>.
              </p>
            </div>
          )}

          <ReactFlow
            nodes={nodos}
            edges={aristas}
            nodeTypes={TIPOS_NODO}
            onNodesChange={alCambiarNodos}
            onNodeClick={(_, n) => setSeleccion(n.id)}
            onPaneClick={() => setSeleccion(null)}
            // Un nodo es la PROYECCIÓN del documento, no un objeto del lienzo.
            // Con los valores por omisión de React Flow, Backspace emitía un
            // cambio `remove` que `applyNodeChanges` aplicaba al array: el nodo
            // desaparecía, la carga seguía existiendo, y reaparecía al
            // siguiente cambio del documento. Se borra desde el panel, que es
            // donde está la confirmación. (El `deletable: false` de cada nodo
            // cierra las demás vías; esto cierra la tecla.)
            deleteKeyCode={null}
            // Y las flechas se derivan de los nombres que viajan (`proyeccion.ts`):
            // arrastrar una a mano dibujaría una relación que nadie guarda y que
            // el siguiente render se lleva.
            nodesConnectable={false}
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

        {panelDeCargas && (
          <PanelCargas
            cargas={obra.cargas}
            enfocada={idCargaSeleccionada}
            evaluaciones={proyeccion.evaluaciones}
            onCambiar={cambiarUnaCarga}
            onAgregar={nuevaCargaEnObra}
            onBorrar={borrarUnaCarga}
            onAgregarPartida={agregarPartida}
            onIrAPartida={(idSub) => setSeleccion(idNodoDeSubcarga(idSub))}
            onCerrar={() => setSeleccion(null)}
          />
        )}

        {partida && cargaDeLaPartida && (
          <PanelSubcarga
            // Por `key`, y no es cosmética: el panel tiene estado propio —la
            // pestaña abierta, el selector de biblioteca, los borradores del
            // formulario— y sin ella React reconcilia la misma instancia al
            // saltar de un nodo a otro. Un número a medio teclear en la partida
            // A quedaba en el campo homónimo de B y se escribía allí al perder
            // el foco.
            key={partida.id}
            carga={cargaDeLaPartida}
            subcarga={partida}
            evaluacion={
              proyeccion.evaluaciones[cargaDeLaPartida.id] ?? { valores: [], resumen: '' }
            }
            variables={variablesDePartida(partida, evaluacion)}
            regions={evaluacion.regions}
            results={evaluacion.results}
            instancia={evaluacion.importadas.get(idNodoDeSubcarga(partida.id))}
            otrosAlias={aliasAjenos(idNodoDeSubcarga(partida.id))}
            problemaGrafo={problemaDeGrafo(idNodoDeSubcarga(partida.id), evaluacion)}
            estado={partida.importada ? genericas[partida.importada.slug] : undefined}
            onRenombrar={(nombre) => cambiarPartida(partida.id, (s) => ({ ...s, nombre }))}
            onVariable={(variable) =>
              cambiarPartida(partida.id, (s) => ({ ...s, variable: variable || undefined }))
            }
            onBloques={(bloques: Bloque[]) =>
              cambiarPartida(partida.id, (s) => ({ ...s, bloques }))
            }
            onImportar={(slug) =>
              importar(slug, (imp) => cambiarPartida(partida.id, (s) => ({ ...s, importada: imp })))
            }
            onEntrada={(nombre, valor) =>
              cambiarPartida(partida.id, (s) =>
                s.importada
                  ? {
                      ...s,
                      importada: {
                        ...s.importada,
                        entradas: { ...s.importada.entradas, [nombre]: valor },
                      },
                    }
                  : s,
              )
            }
            onFormula={(campo, expr) =>
              cambiarPartida(partida.id, (s) =>
                s.importada ? { ...s, importada: conFormula(s.importada, campo, expr) } : s,
              )
            }
            onPublicar={(salida, alias) =>
              cambiarPartida(partida.id, (s) =>
                s.importada ? { ...s, importada: conPublicacion(s.importada, salida, alias) } : s,
              )
            }
            onSalida={(salida) =>
              cambiarPartida(partida.id, (s) =>
                s.importada ? { ...s, importada: { ...s.importada, salida } } : s,
              )
            }
            onResellar={(sha256) =>
              cambiarPartida(partida.id, (s) =>
                s.importada ? { ...s, importada: { ...s.importada, sha256 } } : s,
              )
            }
            onQuitarPlanilla={() =>
              cambiarPartida(partida.id, ({ importada: _fuera, ...s }) => s)
            }
            onBorrar={() => borrarPartida(partida.id)}
            onIrACarga={() => setSeleccion(idNodoDeCarga(cargaDeLaPartida.id))}
            onCerrar={() => setSeleccion(null)}
          />
        )}

        {calculo && (
          <PanelCalculo
            key={calculo.id}
            calculo={calculo}
            estado={calculo.importada ? genericas[calculo.importada.slug] : undefined}
            define={evaluacion.define.get(idNodoDeCalculo(calculo.id)) ?? []}
            problemaGrafo={problemaDeGrafo(idNodoDeCalculo(calculo.id), evaluacion)}
            regions={evaluacion.regions}
            results={evaluacion.results}
            instancia={evaluacion.importadas.get(idNodoDeCalculo(calculo.id))}
            otrosAlias={aliasAjenos(idNodoDeCalculo(calculo.id))}
            onNombre={(nombre) => cambiarUnCalculo(calculo.id, (k) => ({ ...k, nombre }))}
            onBloques={(bloques: Bloque[]) =>
              cambiarUnCalculo(calculo.id, (k) => ({ ...k, bloques }))
            }
            onImportar={(slug) =>
              importar(slug, (imp) =>
                cambiarUnCalculo(calculo.id, (k) => ({
                  ...k,
                  importada: imp,
                  // El nodo se bautiza solo con el título de la planilla si
                  // todavía se llama como nació: un canvas con cuatro nodos
                  // «Cálculo» no dice nada.
                  nombre: k.nombre === 'Cálculo' ? tituloCorto(slug) : k.nombre,
                })),
              )
            }
            onEntrada={(nombre, valor) =>
              cambiarUnCalculo(calculo.id, (k) =>
                k.importada
                  ? {
                      ...k,
                      importada: {
                        ...k.importada,
                        entradas: { ...k.importada.entradas, [nombre]: valor },
                      },
                    }
                  : k,
              )
            }
            onFormula={(campo, expr) =>
              cambiarUnCalculo(calculo.id, (k) =>
                k.importada ? { ...k, importada: conFormula(k.importada, campo, expr) } : k,
              )
            }
            onPublicar={(salida, alias) =>
              cambiarUnCalculo(calculo.id, (k) =>
                k.importada ? { ...k, importada: conPublicacion(k.importada, salida, alias) } : k,
              )
            }
            onResellar={(sha256) =>
              cambiarUnCalculo(calculo.id, (k) =>
                k.importada ? { ...k, importada: { ...k.importada, sha256 } } : k,
              )
            }
            onQuitarPlanilla={() =>
              cambiarUnCalculo(calculo.id, ({ importada: _fuera, ...k }) => k)
            }
            onBorrar={() => borrarUnCalculo(calculo.id)}
            onCerrar={() => setSeleccion(null)}
          />
        )}
      </div>
    </div>
  );
}

export function CanvasObraConProveedor({ id }: { id: string }) {
  return (
    <ReactFlowProvider>
      <CanvasObra id={id} />
    </ReactFlowProvider>
  );
}
