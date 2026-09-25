import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useNodesInitialized,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import Enlace from '../../components/Enlace';
import MathCanvas from '../../components/canvas/MathCanvas';
import type { Region } from '../../lib/worksheet';
import type { MetaPlanilla } from '../../lib/biblioteca/contrato';
import type { ResultadoGuardado } from '../../components/canvas/useHojaPersistida';
import { useHistorial } from '../../components/canvas/useHistorial';
import { origenDeNodo } from './origen-nodo';
import VistaHoja from './VistaHoja';
import type { Severidad } from '../grafo';
import { colocarPorGrupo, guardarLayout, layoutGuardado, olvidarLayout, type Posicion } from '../layout';
import { archivoDeObra, nombreDeArchivo } from './almacen';
import { abrirObra, olvidarBorrador, type Apertura } from './almacen-disco';
import { descargarHoja } from '../../lib/canvas-handoff';
import { cargarGenerica, desprender, type Genericas } from './biblioteca';
import { consumidoresDe, evaluarObra, problemaDeGrafo, rupturaPorQuitar } from './evaluacion';
import { publicaApoyos } from './sap-apoyos';
// `idsDeLaObra`: todos los ids ya repartidos. Traer las regiones de una genérica
// a un nodo pasa por ahí: dos nodos que desprendan la misma se quedarían con las
// mismas, y son las claves de `results` en la hoja global.
import { idsDeLaObra, trasladarPosiciones, traerNodos } from './copia';
import TraerDeObra from './TraerDeObra';
import { regionQueDefine } from './hoja';
import {
  agregarCalculo,
  agregarGrupo,
  agregarModulo,
  asignarGrupo,
  borrarCalculo,
  borrarGrupo,
  cambiarCalculo,
  cambiarGrupo,
  conFormula,
  conJustificacion,
  nuevaJustificacion,
  quitarJustificacion,
  marcarRevision,
  porRevisar,
  conPublicacion,
  nuevoCalculo,
  quitarModulo,
  conAliasTipo,
  conConjunto,
  nuevoConjunto,
  quitarConjunto,
  slugsImportados,
  type Frontera,
  type Modulo,
  type NodoCalculo,
  type Obra,
  type Revision,
} from './modelo';
import NodoObra from './NodoObra';
import MarcaRevision from './MarcaRevision';
import PanelSap, { LECTURAS_DEL_NODO_SAP, type PestanaSap } from './PanelSap';
import PanelCombinaciones from './PanelCombinaciones';
import PanelModal from './PanelModal';
import PanelBasal from './PanelBasal';
import PanelApoyos from './PanelApoyos';
import TablaApoyos from './TablaApoyos';
import TablaCombinaciones from './TablaCombinaciones';
import { firmaDe } from './sap-cargas';
import IconoClase from './IconoClase';
import LeyendaGrupos from './LeyendaGrupos';
import SelectorGrupo from './SelectorGrupo';
import { ladoDe, trazoDe, type Lado } from './trazo';
import PaletaNodos, { type EntradaPaleta } from './PaletaNodos';
import PanelCalculo from './PanelCalculo';
import {
  calculoDeNodo,
  ID_DE_MODULO,
  ID_NODO_APOYOS,
  ID_NODO_BASAL,
  ID_NODO_COMBINACIONES,
  ID_NODO_MODAL,
  ID_NODO_SAP,
  idNodoDeCalculo,
  proyectar,
  type NodoDeObra,
} from './proyeccion';

/**
 * El canvas de una obra: un proyecto propio de Struct_Flow, editable y local.
 * El documento es del usuario y vive en una carpeta en disco o en
 * `localStorage`.
 *
 * LOS NODOS NO SON ESTADO: SON LA PROYECCIÓN DEL DOCUMENTO
 * --------------------------------------------------------
 * Lo único que se guarda es la obra. Los nodos salen de `proyectar()` en cada
 * render y lo único propio del lienzo es dónde quedó cada uno, que va al
 * almacén de posiciones de `../layout.ts`.
 */

const TIPOS_NODO = { obra: NodoObra };

const COLOR: Record<Severidad, string> = {
  ok: '#cbd5e1',
  aviso: '#d97706',
  error: '#dc2626',
};

const ENCUADRE = { padding: 0.25, duration: 250, maxZoom: 1 };

/** Cuánto tiempo tras abrir se sigue re-encuadrando mientras los nodos crecen. */
const ASIENTO_MS = 4000;

/** El trazo de un nodo: lo que entra (de qué depende) en el acento, y lo que sale
 *  (a quién afecta) en verde. Con un solo color, una flecha larga no dice de qué
 *  lado del foco está. */
const COLOR_LADO: Record<Lado, string> = {
  arriba: '#2563eb',
  abajo: '#059669',
};

/** Por debajo de este zoom las etiquetas de las flechas no se leen y solo tapan:
 *  se muestran las del trazo resaltado y ninguna más. */
const ZOOM_ETIQUETAS = 0.9;

/** La pestaña del grafo. No se cierra: es de donde se sale y a donde se vuelve. */
function PestanaObra({ activa, onElegir }: { activa: boolean; onElegir: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onElegir}
      className={`flex items-center gap-1.5 rounded-t-md border border-border px-2.5 py-1 text-[11px] ${
        activa
          ? '-mb-px border-b-white border-t-2 border-t-accent bg-white font-medium text-ink'
          : 'bg-surface text-muted hover:bg-white hover:text-ink'
      }`}
    >
      <IconoClase clase="obra" className="h-3 w-3 shrink-0" />
      Obra
    </button>
  );
}

/** «zapata-generica» → «Zapata». Para bautizar un nodo recién importado sin
 *  esperar a que la genérica termine de descargarse. */
function tituloCorto(slug: string): string {
  const base = slug.replace(/-generic[ao]$/, '').replace(/-/g, ' ');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** El nodo del documento que hay detrás de un nodo del grafo. */
function nodoDelDocumento(obra: Obra | null, idNodo: string): NodoCalculo | undefined {
  if (!obra) return undefined;
  const idK = calculoDeNodo(idNodo);
  return idK ? obra.calculos.find((k) => k.id === idK) : undefined;
}

/**
 * La hoja de un nodo sin ids que choquen con los de los DEMÁS nodos.
 *
 * El saneo del almacén (`almacen.ts`) impone esa unicidad al leer, y `desprender`
 * al traer una genérica, pero «Importar» y «Pegar JSON» dentro de una pestaña no
 * pasan por ninguno de los dos: el canvas no conoce la obra. Y las planillas
 * publicadas numeran sus regiones `r000, r001, …`, así que dos pestañas con dos
 * planillas cualesquiera chocaban desde el primer bloque. Como el id es la clave
 * de `results` en la hoja global y la `key` de React, el panel de un nodo pasaba
 * a pintar los bloques del otro, con su valor y todo.
 *
 * El id nuevo es **derivado, no aleatorio**: esta función corre en cada
 * autoguardado y el canvas de la pestaña conserva los suyos, así que uno sorteado
 * daría un id distinto cada 300 ms y el documento no pararía de moverse.
 */
function sinChocarConLaObra(hoja: Region[], obra: Obra, idNodo: string): Region[] {
  const ajenos = new Set<string>();
  for (const k of obra.calculos) {
    if (idNodoDeCalculo(k.id) === idNodo) continue;
    for (const r of k.hoja) ajenos.add(r.id);
  }
  if (!hoja.some((r) => ajenos.has(r.id))) return hoja;
  return hoja.map((r) => (ajenos.has(r.id) ? { ...r, id: `${idNodo}·${r.id}` } : r));
}

/** El módulo de la obra que pinta cada id de nodo especial. */
const MODULO_DE_ID = new Map(Object.entries(ID_DE_MODULO).map(([m, id]) => [id as string, m as Modulo]));

/** El título de la pestaña de un nodo que no es una hoja. */
const TITULO_PESTANA: Record<string, string> = {
  [ID_NODO_COMBINACIONES]: 'Combinaciones',
  [ID_NODO_APOYOS]: 'Reacciones en apoyos',
};

/** ¿Ese nodo del grafo sigue existiendo en el documento? */
function existeNodo(obra: Obra | null, idNodo: string): boolean {
  if (!obra) return false;
  const modulo = MODULO_DE_ID.get(idNodo);
  if (modulo) return obra.modulos.includes(modulo);
  return nodoDelDocumento(obra, idNodo) !== undefined;
}

/**
 * Cuántas piezas tiene la obra: los nodos del grafo y los bloques de sus hojas.
 *
 * Es lo que le dice al historial que un cambio fue una PÉRDIDA y tiene que
 * registrarse en el acto, sin esperar los 400 ms de pausa. Sin esto, «quitar
 * este nodo» y pulsar Ctrl+Z enseguida —que es lo que uno hace— encontraba el
 * historial vacío, y el autoguardado de la obra (300 ms) ya había consolidado la
 * pérdida.
 *
 * Cuenta también los bloques porque borrar el único bloque de un cálculo no
 * cambia el número de nodos y se lleva el cálculo igual.
 */
/**
 * ¿Lo único que cambió es lo leído de SAP? Compara por referencia: todo lo demás
 * se construye con spreads que conservan lo que no se tocó, así que una lectura
 * deja idénticos todos los campos salvo `sap`.
 */
function soloCambiaSap(nueva: Obra | null, asentada: Obra | null): boolean {
  if (!nueva || !asentada || nueva.sap === asentada.sap) return false;
  const claves = new Set([...Object.keys(nueva), ...Object.keys(asentada)]);
  claves.delete('sap');
  return [...claves].every((k) => nueva[k as keyof Obra] === asentada[k as keyof Obra]);
}

function piezasDeLaObra(obra: Obra | null): number {
  if (!obra) return 0;
  // Los grupos cuentan: quitar uno se lleva su nombre, su color y la asignación
  // de todos sus miembros, y su aviso ofrece deshacer.
  // Una justificación también: quitarla se lleva una expresión escrita a mano.
  // Y un conjunto de diseño, que es una elección de familias.
  let n =
    obra.modulos.length +
    obra.calculos.length +
    (obra.grupos?.length ?? 0) +
    (obra.justificaciones?.length ?? 0) +
    (obra.conjuntosDiseno?.length ?? 0);
  for (const k of obra.calculos) n += k.hoja.length + piezasDeFrontera(k.frontera);
  return n;
}

/**
 * Lo que una frontera aporta a la cuenta: ella misma, cada entrada del
 * formulario, cada campo atado y cada alias publicado.
 *
 * Sin esto, «quitar la planilla» NO contaba como pérdida, y es la que más se
 * lleva: en una de la biblioteca la hoja está VACÍA —las regiones se instancian
 * al evaluar—, así que borrar la frontera se llevaba el slug, el sello, el
 * formulario de entradas rellenado a mano y los alias que el resto de la obra
 * está nombrando, dejando el número idéntico. El paso entraba en el historial
 * tras la pausa de 400 ms y el autoguardado consolidaba a los 300: pulsar Ctrl+Z
 * enseguida, que es lo que uno hace, no devolvía nada.
 */
/** Cuántos nodos afectados se citan por su nombre antes de resumir. Es el mismo
 *  corte que `NOMBRES_EN_FLECHA` de `proyeccion.ts`, y por lo mismo: con ocho,
 *  la frase deja de decir nada. */
const NODOS_EN_AVISO = 3;

/**
 * Qué se fue y quién se quedó sin qué, en una frase.
 *
 * Es lo que paga la confirmación que se quitó: un borrado que no pregunta tiene
 * que decir qué rompió y ofrecer la vuelta en el mismo gesto. Y es la única
 * ventana en que se puede decir: una flecha no se guarda, ES la entrada de
 * `duenio`, así que en cuanto el nodo se va solo queda un «Undefined symbol» sin
 * remitente en los nodos de aguas abajo.
 */
function fraseDeRuptura(quitado: string, rota: { nodo: string; nombres: string[] }[]): string {
  const cual = `Quitaste «${quitado}».`;
  if (rota.length === 0) return cual;
  const citados = rota.slice(0, NODOS_EN_AVISO).map((r) => `«${r.nodo}»`);
  const resto = rota.length - citados.length;
  const partes = resto > 0 ? [...citados, `${resto} más`] : citados;
  const lista =
    partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
  const verbo = rota.length === 1 ? 'se quedó' : 'se quedaron';
  const nombres = [...new Set(rota.flatMap((r) => r.nombres))].map((n) => `«${n}»`).join(', ');
  return `${cual} ${lista} ${verbo} sin ${nombres}.`;
}

function piezasDeFrontera(f: Frontera | undefined): number {
  if (!f) return 0;
  return (
    1 +
    Object.keys(f.entradas ?? {}).length +
    Object.keys(f.formulas ?? {}).length +
    Object.keys(f.publica ?? {}).length
  );
}

function CanvasObra({
  id,
  apertura,
  onRecargar,
}: {
  id: string;
  apertura: Apertura;
  /** Vuelve a leer la obra de donde vive y remonta el canvas con ella. */
  onRecargar: () => void;
}) {
  const [obra, setObra] = useState<Obra | null>(apertura.obra);
  const { sesion } = apertura;
  const estadoSesion = useSyncExternalStore(sesion.suscribir, sesion.estado);
  /** Lo de una sesión anterior que no llegó al disco, hasta que se decida. */
  const [borrador, setBorrador] = useState(apertura.borrador);
  const [problemasLectura, setProblemasLectura] = useState(apertura.problemas);
  const [nodos, setNodos] = useState<Node[]>([]);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  // Aquí y no en el panel: el panel se desmonta al deseleccionar el nodo, y
  // volver a él tiene que dejarte en la pestaña donde estabas.
  const [pestanaSap, setPestanaSap] = useState<PestanaSap>('resumen');
  // El filtro de familia de la tabla de combinaciones: lo fija también el panel,
  // al pulsar una familia, y la tabla se abre ya filtrada.
  const [familiaCombinaciones, setFamiliaCombinaciones] = useState<string | null>(null);
  // Lo mismo para el caso de la tabla de apoyos: el panel lo fija al pulsar un caso.
  const [casoApoyos, setCasoApoyos] = useState<string | null>(null);
  /** El nodo bajo el puntero: da la misma vista del trazo que seleccionar, sin
   *  abrir el panel. Solo cuenta mientras no hay nada seleccionado. */
  const [bajoPuntero, setBajoPuntero] = useState<string | null>(null);
  /** El grupo que la leyenda está resaltando. */
  const [grupoEnfocado, setGrupoEnfocado] = useState<string | null>(null);
  const [paletaAbierta, setPaletaAbierta] = useState(false);
  /** El diálogo «Traer de otra obra» está abierto. */
  const [trayendo, setTrayendo] = useState(false);
  /** Los nodos abiertos como pestaña, por id de nodo del grafo. */
  const [pestanas, setPestanas] = useState<string[]>([]);
  /** Cuál se está mirando. `null` es el grafo. */
  const [activa, setActiva] = useState<string | null>(null);
  /** El bloque al que ir en la pestaña de `nodo`: lo pide un enlace del panel
   *  SAP2000. `vez` distingue dos pedidos del mismo bloque. */
  const [irA, setIrA] = useState<{ nodo: string; id: string; vez: number } | null>(null);
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
  // de la obra o de un nodo, que no participan de ningún
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
            etiquetas: new Map(),
            define: new Map(),
            enCiclo: new Set<string>(),
            atadosTapados: new Map(),
            nombresRotos: new Map(),
            scopeEnNodo: new Map(),
            importadas: new Map(),
          },
    [obraEval, genericas],
  );

  const proyeccion = useMemo(
    () =>
      obra
        ? proyectar(obra, evaluacion, genericas)
        : { nodos: [], aristas: [] },
    [obra, evaluacion, genericas],
  );

  /** El orden de las franjas de «reordenar»: el de la lista de grupos. Como
   *  texto, para que el memo de abajo no cambie con cada tecla. */
  const ordenGrupos = obra?.grupos?.map((g) => g.id).join('|') ?? '';
  const colocarObra = useCallback(
    (nodos: NodoDeObra[], aristas: typeof proyeccion.aristas) =>
      colocarPorGrupo(
        nodos,
        aristas,
        (n) => (n as NodoDeObra).grupo?.id,
        ordenGrupos ? ordenGrupos.split('|') : [],
      ),
    [ordenGrupos],
  );

  // ── Las genéricas que la obra referencia ───────────────────────────────────
  // Se descargan una vez por slug y se quedan: `cargarModuloDeBiblioteca` ya
  // cachea la descarga, y aquí se guarda el estado para que la proyección —que es
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
      // borrar un nodo mientras otra planilla se descargaba —el efecto se
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
  //
  // Dónde se guarda lo decide la sesión (`almacen-disco.ts`): una carpeta en
  // disco o este navegador. Aquí solo se le pasa cada versión del documento; la
  // cola, el candado y los conflictos son suyos.
  const obraRef = useRef(obra);
  obraRef.current = obra;

  useEffect(() => {
    if (!obra) return;
    const t = window.setTimeout(() => sesion.guardar(obra), 300);
    return () => window.clearTimeout(t);
  }, [obra, sesion]);

  useEffect(() => {
    return () => {
      if (obraRef.current) sesion.cerrar(obraRef.current);
    };
  }, [sesion]);

  // La pestaña del navegador lleva el nombre de la obra: `App` solo sabe su id.
  const nombreObra = obra?.nombre.trim();
  useEffect(() => {
    if (nombreObra) document.title = `${nombreObra} — Struct_Flow`;
  }, [nombreObra]);

  useEffect(() => {
    setAvisoGuardado(estadoSesion.error);
  }, [estadoSesion.error]);

  // Y al cerrar la pestaña, recargar o pasar a otra, que tampoco desmontan: React
  // no se entera de que la página se va. Como el debounce se reinicia en cada
  // tecla, lo que se pierde no son 300 ms sino la ráfaga entera desde la última
  // pausa. Es la misma red que `MathCanvas.tsx`, con el mismo argumento:
  // `visibilitychange` es la señal fiable en móvil, donde `pagehide` a veces no
  // llega, y se escuchan las dos porque guardar dos veces lo mismo no cuesta nada.
  useEffect(() => {
    // Ocultarse no es irse: una pestaña en segundo plano sigue siendo la
    // escritora. Solo `pagehide` suelta el candado.
    const salir = () => {
      if (obraRef.current) sesion.salir(obraRef.current);
    };
    const alOcultar = () => {
      if (document.visibilityState === 'hidden' && obraRef.current) sesion.vaciar(obraRef.current);
    };
    window.addEventListener('pagehide', salir);
    document.addEventListener('visibilitychange', alOcultar);
    return () => {
      window.removeEventListener('pagehide', salir);
      document.removeEventListener('visibilitychange', alOcultar);
    };
  }, [sesion]);

  // ── Nodos y aristas ────────────────────────────────────────────────────────
  // La posición que ya tenía un nodo manda sobre la automática: la automática
  // depende de todos los demás nodos, así que recalcularla en cada tecla haría
  // saltar el canvas entero mientras se escribe un nombre.
  const seleccionRef = useRef(seleccion);
  seleccionRef.current = seleccion;

  // Espejos para las acciones que corren desde un manejador y no desde el
  // render: desprender necesita el módulo descargado y el scope de la posición
  // del nodo, y ninguno de los dos es estado de esta función.
  //
  // `evaluacionRef` lo leen además los tres borradores, para saber quién
  // dependía del nodo que se va. Va 120 ms por detrás de `obra` —el debounce de
  // `obraEval`— y está bien que así sea: reevaluar dentro de un manejador de
  // clic, solo para redactar una frase, costaría el orden topológico entero. Lo
  // peor que pasa desfasado es que la lista salga vacía y el aviso diga solo
  // «Quitaste «X»», que es cierto y conserva el deshacer. NO lo recalcules.
  const genericasRef = useRef(genericas);
  genericasRef.current = genericas;
  const evaluacionRef = useRef(evaluacion);
  evaluacionRef.current = evaluacion;

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
    // otro y la flecha se lee. Sin ellas caían los dos en la misma columna. Y
    // con los grupos: cada uno en su franja, como deja «reordenar».
    const auto = colocarObra(proyeccion.nodos, proyeccion.aristas);
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
  }, [proyeccion, claveLayout, colocarObra]);

  useEffect(() => {
    setNodos((previos) =>
      previos.map((n) =>
        n.selected === (n.id === seleccion) ? n : { ...n, selected: n.id === seleccion },
      ),
    );
  }, [seleccion]);

  // ── El trazo ───────────────────────────────────────────────────────────────
  // Qué se resalta: la cadena del nodo seleccionado (o del que está bajo el
  // puntero), o si no hay ninguno, los miembros del grupo enfocado. Todo lo
  // demás se atenúa. Es presentación: no toca el documento ni la evaluación.
  const foco = seleccion ?? bajoPuntero;
  const trazo = useMemo(
    () => (foco ? trazoDe(foco, proyeccion.aristas) : null),
    [foco, proyeccion.aristas],
  );
  const delGrupo = useMemo(() => {
    if (!grupoEnfocado) return null;
    return new Set(
      proyeccion.nodos.filter((n) => n.grupo?.id === grupoEnfocado).map((n) => n.id),
    );
  }, [grupoEnfocado, proyeccion.nodos]);
  const visibles: ReadonlySet<string> | null = trazo?.nodos ?? delGrupo;

  // Los nodos fuera de lo resaltado se atenúan con una clase en su envoltorio de
  // React Flow. Depende de `visibles`, que se recalcula con la proyección: el
  // efecto de arriba recrea los nodos sin clase y este se la vuelve a poner.
  useEffect(() => {
    setNodos((previos) =>
      previos.map((n) => {
        const clase = visibles && !visibles.has(n.id) ? 'opacity-30 transition-opacity' : undefined;
        return n.className === clase ? n : { ...n, className: clase };
      }),
    );
  }, [visibles]);

  const etiquetasLegibles = useStore((s) => s.transform[2] >= ZOOM_ETIQUETAS);
  const colorGrupo = grupoEnfocado
    ? obra?.grupos?.find((g) => g.id === grupoEnfocado)?.color
    : undefined;

  // Las flechas llevan el nombre que viaja por ellas: sin la etiqueta, el grafo
  // dice que dos nodos se relacionan pero no con qué. Pero ciento veinte
  // etiquetas a la vez se tapan entre ellas: se ven de cerca, o las del trazo.
  const aristas: Edge[] = useMemo(() => {
    // El id no lleva el índice del array: insertar una arista al principio
    // renombraba todas las posteriores y React Flow las recreaba enteras.
    return proyeccion.aristas.map((a): Edge => {
      const base = {
        id: `${a.desde}->${a.hasta}:${a.tipo}`,
        source: a.desde,
        target: a.hasta,
      };
      const colorSev = COLOR[a.severidad] ?? COLOR.ok;
      const lado = trazo
        ? ladoDe(a, trazo)
        : delGrupo && delGrupo.has(a.desde) && delGrupo.has(a.hasta)
          ? 'arriba'
          : null;

      if (!visibles) {
        return {
          ...base,
          label: etiquetasLegibles ? a.etiqueta || undefined : undefined,
          // Una arista «deriva» no lleva datos: dice que un sub-nodo lee del
          // mismo modelo que el SAP2000. Punteada, para no confundirla.
          style: {
            stroke: colorSev,
            strokeWidth: a.severidad === 'ok' ? 1 : 1.6,
            ...(a.tipo === 'deriva' ? { strokeDasharray: '4 3' } : {}),
          },
          labelStyle: { fontSize: 9, fill: '#6b7280' },
        };
      }
      if (!lado) {
        return { ...base, style: { stroke: colorSev, strokeWidth: 1, opacity: 0.12 } };
      }
      const directa = trazo !== null && (a.desde === trazo.foco || a.hasta === trazo.foco);
      // Una flecha rota sigue en su color de severidad: el trazo no puede tapar
      // un error. Dentro de un grupo enfocado, el color es el del grupo.
      const stroke =
        a.severidad !== 'ok' ? colorSev : trazo ? COLOR_LADO[lado] : (colorGrupo ?? COLOR_LADO[lado]);
      return {
        ...base,
        label: a.etiqueta || undefined,
        // Por encima de las tarjetas: una flecha resaltada que pasa por detrás
        // de un nodo se corta justo donde más importa seguirla.
        zIndex: 1001,
        animated: directa,
        style: { stroke, strokeWidth: directa ? 2.2 : 1.4 },
        labelStyle: { fontSize: 10, fill: stroke, fontWeight: 600 },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
      };
    });
  }, [proyeccion.aristas, trazo, delGrupo, visibles, etiquetasLegibles, colorGrupo]);

  /** Cuántos nodos del grafo lleva cada grupo, para la leyenda. */
  const miembrosPorGrupo = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of proyeccion.nodos) if (n.grupo) m.set(n.grupo.id, (m.get(n.grupo.id) ?? 0) + 1);
    return m;
  }, [proyeccion.nodos]);

  // Encuadra una sola vez, al medir los primeros nodos. Los nodos aparecen de a
  // uno: re-encuadrar en cada carga agregada haría que el lienzo se alejara diez
  // veces seguidas.
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
  /** Cuándo se encuadró por primera vez: ver el efecto siguiente. */
  const encuadradoEn = useRef(0);
  /** El usuario movió o hizo zoom en el lienzo: desde ahí el encuadre es suyo. */
  const lienzoTocado = useRef(false);
  useEffect(() => {
    if (!medidos || encuadrado.current || nodos.length === 0) return;
    const t = window.setTimeout(() => {
      encuadrado.current = true;
      encuadradoEn.current = performance.now();
      fitView(ENCUADRE);
    }, 30);
    return () => window.clearTimeout(t);
  }, [medidos, nodos.length, fitView]);

  // Y se vuelve a encuadrar MIENTRAS EL CONTENIDO SE ASIENTA. Las planillas de
  // la biblioteca llegan después del primer encuadre, sus nodos crecen y la
  // columna se alarga por debajo: el Pachón abría con la última fila cortada por
  // el borde. Solo en los primeros segundos y solo si nadie tocó el lienzo, para
  // no quitarle al usuario el encuadre que eligió.
  const firmaDeTamanos = nodos.map((n) => `${n.measured?.height ?? 0}:${Math.round(n.position.y)}`).join(',');
  useEffect(() => {
    if (!encuadrado.current || lienzoTocado.current) return;
    if (performance.now() - encuadradoEn.current > ASIENTO_MS) return;
    const t = window.setTimeout(() => fitView(ENCUADRE), 60);
    return () => window.clearTimeout(t);
  }, [firmaDeTamanos, fitView]);

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
    if (clave === 'otra-obra') {
      setTrayendo(true);
      return;
    }
    setObra(agregarModulo(actual, clave));
    setSeleccion(ID_DE_MODULO[clave]);
  }, []);

  /**
   * Copia nodos de otra obra al final de esta (`traerNodos` de `./copia`).
   *
   * Pasa por `setObra` como cualquier otro cambio, así que Ctrl+Z lo retira
   * entero. Las posiciones del origen viajan con los nodos, por debajo de lo que
   * ya hay en el lienzo; se dejan en `guardadoRef` para que el efecto de
   * colocación las use en vez de la automática, y en el layout guardado.
   */
  const nodosRef = useRef(nodos);
  nodosRef.current = nodos;
  const traerDe = useCallback(
    (origen: Obra, ids: ReadonlySet<string>) => {
      setTrayendo(false);
      const actual = obraRef.current;
      if (!actual) return;
      const { obra: siguiente, mapa } = traerNodos(actual, origen, ids);
      if (mapa.size === 0) return;
      const presentes = nodosRef.current;
      const posiciones = trasladarPosiciones(
        layoutGuardado(`obra:${origen.id}`),
        mapa,
        presentes.map((n) => n.position),
      );
      guardadoRef.current = { ...guardadoRef.current, ...posiciones };
      const todas: Record<string, Posicion> = {};
      for (const n of presentes) todas[n.id] = { x: n.position.x, y: n.position.y };
      guardarLayout(claveLayout, { ...todas, ...posiciones });
      setObra(siguiente);
      setActiva(null);
      setSeleccion(idNodoDeCalculo(mapa.values().next().value as string));
      // Lo traído cae debajo, casi siempre fuera de la vista.
      window.setTimeout(() => fitView(ENCUADRE), 200);
    },
    [claveLayout, fitView],
  );
  const cerrarTraer = useCallback(() => setTrayendo(false), []);

  /**
   * Cierra las pestañas de los nodos que acaban de dejar de existir.
   *
   * Va pegado al borrado, no al render: una pestaña sobre un nodo borrado se
   * queda rotulada «(sin nombre)», abre un canvas vacío y se traga todo lo que se
   * escriba en ella. El borrado de un cálculo lo hacía a medias: filtraba la
   * lista y dejaba `activa` apuntando al hueco.
   */
  const cerrarPestanasDe = useCallback((idsNodo: readonly string[]) => {
    const fuera = new Set(idsNodo);
    setPestanas((p) => p.filter((x) => !fuera.has(x)));
    setActiva((a) => (a !== null && fuera.has(a) ? null : a));
  }, []);

  /**
   * Deshacer y rehacer para la obra, con el mismo hook que la hoja.
   *
   * La obra no tenía ninguna red: «quitar este nodo» se llevaba la hoja entera de
   * un cálculo en un clic, sin diálogo y sin retorno, y 300 ms después el
   * autoguardado lo consolidaba. Y cada operación destructiva se inventaba su
   * propia protección —borrar una carga confirma en dos tiempos, borrar un
   * cálculo no confirmaba nada, quitar una planilla tampoco—: cinco políticas
   * para el mismo problema.
   *
   * Observa `obra` entera, así que cubre los más de veinte sitios que la
   * escriben sin que ninguno tenga que acordarse de registrarse.
   */
  const historial = useHistorial(obra, setObra, {
    esPerdida: (nueva, asentada) => piezasDeLaObra(nueva) < piezasDeLaObra(asentada),
    // Lo leído de SAP es una foto del modelo, no una edición: Ctrl+Z no deshace
    // nada en SAP, y volver a la lectura anterior mostraría un modelo que ya no
    // es el que hay. Ni entra en el historial ni se restaura: cualquier paso
    // vuelve con la lectura de hoy.
    esLectura: soloCambiaSap,
    alRestaurarEstado: (restaurada) => {
      if (!restaurada) return restaurada;
      const hoy = obraRef.current?.sap;
      if (restaurada.sap === hoy) return restaurada;
      const { sap: _vieja, ...resto } = restaurada;
      return hoy ? { ...resto, sap: hoy } : resto;
    },
    // El paso restaurado puede no tener el nodo que estaba seleccionado ni el que
    // alguna pestaña estaba editando. La selección se conserva si sobrevive
    // —perderla en cada Ctrl+Z obliga a volver a buscar el nodo—, y las pestañas
    // huérfanas se cierran por el mismo camino que un borrado.
    alRestaurar: (restaurada) => {
      setSeleccion((s) => (s !== null && existeNodo(restaurada, s) ? s : null));
      setPestanas((p) => p.filter((idNodo) => existeNodo(restaurada, idNodo)));
      setActiva((a) => (a !== null && existeNodo(restaurada, a) ? a : null));
    },
  });

  /**
   * Lo que el último borrado se llevó por delante, con el deshacer al lado.
   *
   * Vive en la CABECERA y no flotando sobre el lienzo, como los del canvas: ahí
   * dentro quedaría en el contenedor que lleva `hidden` mientras hay una pestaña
   * abierta —el mismo bug que tuvo el aviso de guardado—, y en el grafo no hay
   * papel al que hacerle dar un salto, que era la razón de la pila flotante.
   */
  const [avisoBorrado, setAvisoBorrado] = useState<string | null>(null);
  /**
   * La obra que dejó ese borrado.
   *
   * «↶ Deshacer» llama al historial, que deshace el ÚLTIMO paso —no el borrado—.
   * Si el aviso sobreviviera a cualquier otro cambio, su botón desharía ESE otro
   * cambio y el borrado seguiría ahí: un deshacer que deshace otra cosa es peor
   * que no ofrecerlo. Así que el aviso solo existe mientras el borrado siga
   * siendo lo último que pasó. Por eso caduca con la obra y no con un reloj.
   */
  const obraDelAviso = useRef<Obra | null>(null);

  const anunciarBorrado = useCallback((siguiente: Obra, texto: string) => {
    obraDelAviso.current = siguiente;
    setAvisoBorrado(texto);
  }, []);

  useEffect(() => {
    if (obraDelAviso.current === null || obra === obraDelAviso.current) return;
    obraDelAviso.current = null;
    setAvisoBorrado(null);
  }, [obra]);

  /**
   * Ctrl+Z y Ctrl+Y, SOLO en el grafo.
   *
   * Con una pestaña de cálculo abierta el atajo es del `MathCanvas` que está
   * dentro, que tiene su propio historial sobre su propia hoja. Y restaurar la
   * obra por debajo de una pestaña montada la dejaría desincronizada: el hook de
   * persistencia lee su origen UNA vez, al montar.
   *
   * Tampoco con el foco en un campo —el nombre de la obra, el de un nodo, una
   * fórmula de la mini hoja—: ahí Ctrl+Z es el del navegador sobre ese texto, que
   * es lo que espera quien está escribiendo.
   */
  // Espejado en un ref: `alRestaurar` es una función nueva en cada render, así que
  // `historial` también, y con él en las dependencias el listener se volvería a
  // suscribir en cada paneo del lienzo.
  const historialRef = useRef(historial);
  historialRef.current = historial;

  useEffect(() => {
    if (activa !== null) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const foco = document.activeElement;
      const enCampo =
        foco instanceof HTMLElement &&
        (foco.tagName === 'INPUT' || foco.tagName === 'TEXTAREA' || foco.isContentEditable);
      if (enCampo) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        historialRef.current.deshacer();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        historialRef.current.rehacer();
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [activa]);

  // ── Importar una genérica ──────────────────────────────────────────────────
  // El sello se toma del MÓDULO ya cargado y no del índice: `cargarGenerica`
  // calcula el sha256 de los bytes que de verdad se instancian, y sellar con el
  // del índice haría que el nodo se declarara desfasado desde el primer
  // segundo si el índice fuera de otra compilación.
  const importar = useCallback(
    async (slug: string, aplicar: (f: Frontera) => void) => {
      pedidas.current.add(slug);
      setGenericas((prev) => ({ ...prev, [slug]: { fase: 'cargando' } }));
      const estado = await cargarGenerica(slug);
      setGenericas((prev) => ({ ...prev, [slug]: estado }));
      if (estado.fase !== 'lista') return;
      aplicar({
        procedencia: 'biblioteca',
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

  const borrarUnCalculo = useCallback(
    (idCalculo: string) => {
      const actual = obraRef.current;
      if (!actual) return;
      const calculo = actual.calculos.find((k) => k.id === idCalculo);
      const idNodo = idNodoDeCalculo(idCalculo);
      const frase = fraseDeRuptura(
        calculo?.nombre || 'un cálculo',
        rupturaPorQuitar([idNodo], evaluacionRef.current),
      );
      cerrarPestanasDe([idNodo]);
      const siguiente = borrarCalculo(actual, idCalculo);
      setObra(siguiente);
      anunciarBorrado(siguiente, frase);
      setSeleccion(null);
    },
    [cerrarPestanasDe, anunciarBorrado],
  );

  /**
   * Quita un sub-nodo del SAP2000 que publica nombres (Modal, Apoyos). Las hojas
   * que los usan se quedan sin ellos, y hay que decirlo ahora, que todavía se
   * sabe quién: es el mismo aviso que al borrar un cálculo.
   */
  const quitarPublicador = useCallback(
    (modulo: Modulo, idNodo: string, etiqueta: string) => {
      const actual = obraRef.current;
      if (actual) {
        const frase = fraseDeRuptura(etiqueta, rupturaPorQuitar([idNodo], evaluacionRef.current));
        const siguiente = quitarModulo(actual, modulo);
        setObra(siguiente);
        anunciarBorrado(siguiente, frase);
      }
      setSeleccion(null);
    },
    [anunciarBorrado],
  );

  // ── Los grupos ─────────────────────────────────────────────────────────────
  // Todos pasan por `setObra`, así que el historial los cubre como a cualquier
  // otro cambio del documento.
  const asignarUnGrupo = useCallback(
    (idDoc: string, idGrupo: string | undefined) =>
      setObra((o) => (o ? asignarGrupo(o, idDoc, idGrupo) : o)),
    [],
  );

  // Fuera del actualizador: el id del grupo nuevo se sortea, y un actualizador
  // que React llame dos veces sortearía dos.
  const crearGrupoPara = useCallback((idDoc: string, nombre: string, color: string) => {
    const actual = obraRef.current;
    if (!actual) return;
    const { obra: conGrupo, grupo } = agregarGrupo(actual, nombre, color);
    setObra(asignarGrupo(conGrupo, idDoc, grupo.id));
  }, []);

  const cambiarUnGrupo = useCallback(
    (idGrupo: string, nombre: string, color: string) =>
      setObra((o) => (o ? cambiarGrupo(o, idGrupo, { nombre, color }) : o)),
    [],
  );

  const borrarUnGrupo = useCallback(
    (idGrupo: string) => {
      const actual = obraRef.current;
      const grupo = actual?.grupos?.find((g) => g.id === idGrupo);
      if (!actual || !grupo) return;
      const siguiente = borrarGrupo(actual, idGrupo);
      setObra(siguiente);
      anunciarBorrado(siguiente, `Quitaste el grupo «${grupo.nombre}». Sus nodos siguen en la obra, sin grupo.`);
      setGrupoEnfocado((g) => (g === idGrupo ? null : g));
    },
    [anunciarBorrado],
  );

  /** El selector de grupo de un cálculo, por su id de documento. */
  const selectorGrupo = (idDoc: string, actual: string | undefined, rotulo?: string) => (
    <SelectorGrupo
      grupos={obra?.grupos ?? []}
      valor={actual}
      rotulo={rotulo}
      onElegir={(id) => asignarUnGrupo(idDoc, id)}
      onCrear={(nombre, color) => crearGrupoPara(idDoc, nombre, color)}
    />
  );

  // ── La marca «Revisar» ─────────────────────────────────────────────────────
  // Por `setObra`, como el grupo: marcar y quitar se deshacen con Ctrl+Z.
  const marcaRevision = (idDoc: string, actual: Revision | undefined) => (
    <MarcaRevision
      valor={actual}
      onCambiar={(r) => setObra((o) => (o ? marcarRevision(o, idDoc, r) : o))}
    />
  );

  // ── Las pestañas ───────────────────────────────────────────────────────────
  //
  // SOLO SE MONTA LA ACTIVA, y no es una optimización. Dos `MathCanvas` a la vez
  // se pelean por `Ctrl+V` y por los dos `keydown` globales, y dejan dos
  // `.worksheet-print` en el `<body>`, de los que `usePaginacion` mide el que
  // encuentre primero. El propio canvas avisa en desarrollo si se rompe.
  //
  // El precio es que cambiar de pestaña remonta el canvas: se pierden el scroll,
  // la selección y el punto de inserción, no los datos —el hook vacía al
  // desmontar—. Es el precio correcto.
  const abrirPestana = useCallback((idNodo: string) => {
    setPestanas((p) => (p.includes(idNodo) ? p : [...p, idNodo]));
    setActiva(idNodo);
  }, []);

  /**
   * Abre la hoja del nodo que define `nombre` y la lleva al bloque que lo calcula.
   *
   * Lo pide el panel SAP2000 para inspeccionar una carga que no coincide. El
   * dueño lo dice la evaluación (`duenio`), que es la misma que dibuja las
   * flechas. Si el nodo tiene frontera, lo que ve la obra es un ALIAS publicado:
   * se traduce a la salida de la hoja para encontrar su bloque. Una planilla de
   * la biblioteca sin desprender se abre de solo lectura y sin desplazarse.
   */
  const irANombre = useCallback(
    (nombre: string) => {
      const idNodo = evaluacionRef.current.duenio.get(nombre);
      if (!idNodo) return;
      // Un nombre que publica un sub-nodo del SAP2000 (`T_x`) no tiene hoja que
      // abrir: se selecciona el nodo, y su panel dice de dónde sale.
      if (!calculoDeNodo(idNodo)) {
        setSeleccion(idNodo);
        return;
      }
      const nodo = nodoDelDocumento(obraRef.current, idNodo);
      const salida = nodo?.frontera
        ? Object.entries(nodo.frontera.publica ?? {}).find(([, alias]) => alias === nombre)?.[0]
        : nombre;
      const id = nodo && salida ? regionQueDefine(nodo.hoja, salida) : undefined;
      abrirPestana(idNodo);
      setIrA(id ? { nodo: idNodo, id, vez: Date.now() } : null);
    },
    [abrirPestana],
  );
  // Un pedido se cumple una vez: al salir de esa pestaña se olvida, o volver a
  // ella más tarde la desplazaría otra vez al mismo bloque.
  useEffect(() => {
    if (irA && activa !== irA.nodo) setIrA(null);
  }, [activa, irA]);
  const puedeIrA = useCallback((nombre: string) => evaluacion.duenio.has(nombre), [evaluacion.duenio]);

  const cerrarPestana = useCallback((idNodo: string) => {
    setPestanas((p) => p.filter((x) => x !== idNodo));
    // Al cerrar la activa se vuelve al grafo, y no a la pestaña de al lado: el
    // grafo es de donde se salió y es lo que da contexto de qué se acaba de
    // editar.
    setActiva((a) => (a === idNodo ? null : a));
  }, []);

  /** La hoja de un nodo del grafo, se llame como se llame en el documento. */
  const hojaDeNodo = useCallback(
    (idNodo: string): { etiqueta: string; hoja: Region[]; meta?: MetaPlanilla } | null => {
      const o = obraRef.current;
      if (!o) return null;
      const idK = calculoDeNodo(idNodo);
      if (idK) {
        const k = o.calculos.find((x) => x.id === idK);
        return k ? { etiqueta: k.nombre || 'Cálculo', hoja: k.hoja, meta: k.meta } : null;
      }
      return null;
    },
    [],
  );

  /**
   * Escribe la hoja de un nodo, y dice si el nodo la aceptó.
   *
   * Devuelve un resultado y no `void` porque una pestaña podía quedarse abierta
   * sobre un nodo ya borrado: la escritura no encontraba el nodo, devolvía la
   * obra intacta, y el usuario escribía en el vacío sin una sola señal. Ahora
   * el canvas de la pestaña recibe el fallo por el mismo camino que cualquier
   * otro —la banda de aviso del hook— en vez de no recibir nada.
   */
  const escribirHojaDeNodo = useCallback(
    (idNodo: string, hoja: Region[], meta: MetaPlanilla | null): ResultadoGuardado => {
      const actual = obraRef.current;
      const nodo = actual ? nodoDelDocumento(actual, idNodo) : undefined;
      if (!actual || !nodo) {
        return {
          ok: false,
          motivo:
            'El nodo de esta pestaña ya no está en la obra. Lo que escribas aquí no se guarda: ' +
            'ciérrala, o llévate la hoja con «Exportar».',
        };
      }
      const hojaFinal = sinChocarConLaObra(hoja, actual, idNodo);
      // Una escritura que no cambia nada NO toca el documento. Montar una pestaña
      // y salir de ella sin escribir emitía un nodo nuevo con la misma hoja
      // —`{ ...n }` basta para cambiar la identidad—, y el historial lo registraba
      // como un paso: el primer Ctrl+Z del grafo parecía no hacer nada.
      const sinCambios =
        nodo.hoja.length === hojaFinal.length &&
        nodo.hoja.every((r, i) => r === hojaFinal[i]) &&
        (!meta || nodo.meta === meta);
      if (sinCambios) return { ok: true };
      cambiarUnCalculo(nodo.id, (n) => ({ ...n, hoja: hojaFinal, ...(meta ? { meta } : {}) }));
      return { ok: true };
    },
    [cambiarUnCalculo],
  );

  /**
   * Le da frontera a la hoja de un nodo, y la abre para escribirla.
   *
   * Es «crear la planilla de cálculo de este nodo»: la hoja pasa a tener su
   * propio espacio de nombres, y lo que defina deja de verse desde el resto de
   * la obra salvo lo que publique. No se toca ni una región.
   */
  const crearPlanilla = useCallback(
    (idNodo: string) => {
      const idK = calculoDeNodo(idNodo);
      if (idK) {
        cambiarUnCalculo(idK, (n) => ({ ...n, frontera: { procedencia: 'propia' as const, ...n.frontera } }));
      }
      abrirPestana(idNodo);
    },
    [cambiarUnCalculo, abrirPestana],
  );

  /**
   * Desprende la genérica de un nodo y abre la copia para editarla.
   *
   * `desprender` hace la transición —hornea las entradas en las regiones `in_*`,
   * cambia el sello por una procedencia y renombra los ids que choquen con los
   * de la obra—. Aquí solo hace falta darle los ids ya tomados: dos nodos que
   * desprendan la misma genérica no pueden quedarse con las mismas regiones.
   */
  const desprenderNodo = useCallback(
    (idNodo: string) => {
      const o = obraRef.current;
      const n = nodoDelDocumento(o, idNodo);
      const slug = n?.frontera?.slug;
      const estado = slug ? genericasRef.current[slug] : undefined;
      if (!o || !n || estado?.fase !== 'lista') return;
      const vistos = idsDeLaObra(o);
      const scope = evaluacionRef.current.importadas.get(idNodo)?.scope ?? {};
      cambiarUnCalculo(n.id, (x) => desprender(x, estado.modulo, scope, vistos));
      abrirPestana(idNodo);
    },
    [cambiarUnCalculo, abrirPestana],
  );

  // El origen se rehace al cambiar de pestaña y no al cambiar el documento: sus
  // dos métodos leen y escriben por función, así que no cierra sobre ninguna
  // copia de la obra que pueda quedarse vieja.
  // Solo un cálculo tiene hoja: la pestaña de un nodo especial —la tabla de
  // combinaciones— es una vista propia y no monta un canvas.
  const origenPestana = useMemo(
    () =>
      activa && calculoDeNodo(activa)
        ? origenDeNodo({
            leer: () => hojaDeNodo(activa),
            escribir: (hoja, meta) => escribirHojaDeNodo(activa, hoja, meta),
          })
        : null,
    [activa, hojaDeNodo, escribirHojaDeNodo],
  );

  const reordenar = useCallback(() => {
    olvidarLayout(claveLayout);
    guardadoRef.current = {};
    // Por grupos: cada uno en su franja horizontal (`colocarPorGrupo`).
    const auto = colocarObra(proyeccion.nodos, proyeccion.aristas);
    setNodos((previos) => previos.map((n) => ({ ...n, position: auto[n.id] ?? n.position })));
    // El temporizador se guarda: sin esto, salir del canvas en esos 30 ms
    // llamaba a `fitView` contra un proveedor ya desmontado.
    if (temporizadorEncuadre.current) window.clearTimeout(temporizadorEncuadre.current);
    temporizadorEncuadre.current = window.setTimeout(() => fitView(ENCUADRE), 30);
  }, [claveLayout, proyeccion, fitView, colocarObra]);

  const temporizadorEncuadre = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (temporizadorEncuadre.current) window.clearTimeout(temporizadorEncuadre.current);
    },
    [],
  );

  // La obra que no existe la resuelve `CargadorObra`, antes de montar esto.
  if (!obra) return null;

  const soloLectura = estadoSesion.conflicto === 'escritor';
  const revisables = porRevisar(obra);

  const idCalculoSeleccionado = seleccion ? calculoDeNodo(seleccion) : null;
  const calculo = obra.calculos.find((k) => k.id === idCalculoSeleccionado);

  // Los nombres que publican los OTROS nodos: con eso el selector de salidas
  // propone un alias libre en vez de uno que deja los dos nodos en rojo en el
  // mismo clic que los conecta.
  // Si la pestaña abierta es una de la biblioteca, lo que se pinta es su hoja
  // instanciada, que la evaluación ya produjo en el sitio que le toca. No se
  // vuelve a instanciar aquí: sería una segunda autoridad sobre el mismo número.
  const deLaBiblioteca =
    activa && nodoDelDocumento(obra, activa)?.frontera?.procedencia === 'biblioteca'
      ? evaluacion.importadas.get(activa)?.ev
      : undefined;

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
            title={obra.nombre}
            // A lo ancho del nombre: con un ancho fijo, «Pachón — Taller de
            // soldadura (cargas a SAP)» se cortaba con media cabecera vacía.
            style={{ width: `${Math.max(16, obra.nombre.length + 2)}ch` }}
            className="min-w-0 max-w-[min(48rem,60vw)] rounded border border-transparent px-1 py-0.5 text-sm font-semibold text-ink outline-none hover:border-border focus:border-accent"
          />
          <span className="font-mono text-[10px] text-muted">{obra.id}</span>
          {/* Dónde vive, siempre a la vista: no es lo mismo una carpeta que se
              versiona que un navegador que se puede vaciar. */}
          <span
            title={estadoSesion.donde}
            className={`rounded border px-1.5 text-[10px] ${
              estadoSesion.modo === 'disco'
                ? 'border-border text-muted'
                : 'border-aviso text-aviso'
            }`}
          >
            {estadoSesion.modo === 'navegador'
              ? 'en este navegador'
              : `en disco${
                  // Con un conflicto no se está guardando: la cola está parada.
                  estadoSesion.conflicto
                    ? ' · sin guardar'
                    : estadoSesion.pendiente
                      ? ' · guardando…'
                      : ''
                }`}
          </span>
          {/* Lo que falta revisar, y un clic lleva al siguiente: con treinta nodos
              una bandera en una tarjeta no se encuentra mirando. */}
          {revisables.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const i = seleccion ? revisables.indexOf(seleccion) : -1;
                setActiva(null);
                setSeleccion(revisables[(i + 1) % revisables.length]);
              }}
              title="Ir al siguiente nodo marcado para revisar"
              className="ml-auto rounded border border-dashed border-ink/40 px-1.5 text-[10px] text-ink hover:border-accent hover:text-accent"
            >
              ⚑ {revisables.length} por revisar
            </button>
          )}
          <span className={`${revisables.length > 0 ? '' : 'ml-auto '}text-[10px] text-muted`}>
            {proyeccion.nodos.length} nodo{proyeccion.nodos.length === 1 ? '' : 's'} ·{' '}
            {obra.grupos?.length ?? 0} grupo{obra.grupos?.length === 1 ? '' : 's'}
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
          {trayendo && (
            <TraerDeObra
              destino={obra}
              modo={estadoSesion.modo}
              onTraer={traerDe}
              onCerrar={cerrarTraer}
            />
          )}
          {/* Deshacer y rehacer. Con botones y no solo con el atajo: una obra se
              maneja con el ratón, y un Ctrl+Z que nadie sabe que existe no
              protege de nada. Se apagan con una pestaña abierta, donde el atajo
              es del canvas que está dentro. */}
          <button
            type="button"
            onClick={historial.deshacer}
            disabled={activa !== null || !historial.puedeDeshacer}
            title="Deshacer (Ctrl+Z)"
            aria-label="Deshacer"
            className="ml-auto rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent disabled:opacity-40"
          >
            ↶
          </button>
          <button
            type="button"
            onClick={historial.rehacer}
            disabled={activa !== null || !historial.puedeRehacer}
            title="Rehacer (Ctrl+Y)"
            aria-label="Rehacer"
            className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent disabled:opacity-40"
          >
            ↷
          </button>
          <button
            type="button"
            onClick={reordenar}
            disabled={proyeccion.nodos.length === 0}
            className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent disabled:opacity-40"
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

        {/* La barra de pestañas. Solo aparece cuando hay alguna: una barra con
            una sola pestaña siempre visible ocuparía alto para no decir nada.
            El patrón ARIA es el de `FichaGenerica`, que es el que ya está en
            este módulo. */}
        {/* Cada pestaña es UNA caja con su título y su ×. Eran dos botones
            hermanos con bordes partidos sobre el mismo blanco de la cabecera:
            la inactiva no tenía borde y la hilera se leía como texto corrido. La
            barra lleva fondo propio, y la activa se funde con lo de abajo tapando
            el borde inferior de la cabecera (`-mb-px`). */}
        {pestanas.length > 0 && (
          <div
            role="tablist"
            aria-label="Hojas abiertas"
            // Con un aviso debajo, la barra no llega al borde de la cabecera y
            // la pestaña activa no tiene con qué fundirse: se cierra con su borde.
            className={`-mx-4 mt-1.5 flex flex-wrap items-end gap-1 border-y border-border bg-slate-100 px-4 pt-1.5 ${
              avisoGuardado ||
              avisoBorrado ||
              estadoSesion.conflicto ||
              borrador ||
              problemasLectura.length
                ? ''
                : '-mb-2 border-b-0'
            }`}
          >
            <PestanaObra activa={activa === null} onElegir={() => setActiva(null)} />
            {pestanas.map((id) => {
              const n = hojaDeNodo(id);
              const clase = proyeccion.nodos.find((x) => x.id === id)?.clase ?? 'calculo';
              const etiqueta = n?.etiqueta ?? TITULO_PESTANA[id] ?? '(sin nombre)';
              const esActiva = activa === id;
              return (
                <span
                  key={id}
                  // El botón central cierra, como en un navegador.
                  onAuxClick={(e) => {
                    if (e.button === 1) cerrarPestana(id);
                  }}
                  onMouseDown={(e) => {
                    // Sin esto, el botón central activa el desplazamiento automático.
                    if (e.button === 1) e.preventDefault();
                  }}
                  className={`flex max-w-[16rem] items-center rounded-t-md border border-border ${
                    esActiva
                      ? '-mb-px border-b-white border-t-2 border-t-accent bg-white text-ink'
                      : 'bg-surface text-muted hover:bg-white hover:text-ink'
                  }`}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={esActiva}
                    onClick={() => setActiva(id)}
                    title={etiqueta}
                    className={`flex min-w-0 items-center gap-1.5 py-1 pl-2.5 pr-1 text-[11px] ${
                      esActiva ? 'font-medium' : ''
                    }`}
                  >
                    <IconoClase clase={clase} className="h-3 w-3 shrink-0" />
                    <span className="truncate">{etiqueta}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => cerrarPestana(id)}
                    title="Cerrar esta pestaña (clic central)"
                    aria-label={`Cerrar ${etiqueta}`}
                    className="mr-1 rounded px-1 text-[12px] leading-none text-muted hover:bg-slate-200 hover:text-error"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* El aviso de guardado va en la CABECERA, que es lo único que se ve
            desde las tres vistas. Flotando sobre el lienzo del grafo —donde
            estaba— quedaba dentro del contenedor que lleva `hidden` mientras hay
            una pestaña abierta: existía en el DOM, nadie lo veía, y se podía
            escribir una sesión entera en la hoja de un nodo con el
            almacenamiento lleno sin una sola señal.

            Aquí sí empuja, y es lo correcto: no es el acuse efímero del canvas
            —que se retira solo y haría saltar el papel dos veces—, sino un fallo
            que se queda hasta que un guardado vuelva a funcionar. */}
        {avisoGuardado && (
          // `role="status"`: un aviso que sale solo y dice que lo que escribes
          // no se está guardando tiene que llegar también a quien no lo ve.
          <p
            role="status"
            className="mt-1 rounded border border-aviso bg-white px-3 py-1.5 text-[11px] leading-snug text-aviso"
          >
            No se pudo guardar la obra. {avisoGuardado}
          </p>
        )}

        {/* Los conflictos de la sesión. Tampoco se retiran solos: mientras
            dura uno, lo que se escribe no llega al disco, y eso no puede
            quedar dicho una vez y desaparecer. */}
        {soloLectura && (
          <p
            role="status"
            className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-aviso bg-white px-3 py-1.5 text-[11px] leading-snug text-aviso"
          >
            <span>
              <strong>Solo lectura.</strong> Otra pestaña está editando esta obra; lo que cambies
              aquí no se guarda.
            </span>
            <button
              type="button"
              // Tomar el control es empezar de lo que hay en el disco: lo que la
              // otra pestaña escribió hasta ahora es más nuevo que esta copia. La
              // recarga pide el candado forzando (`abrirObra`).
              onClick={onRecargar}
              className="rounded border border-aviso px-1.5 py-0.5 text-[10px] text-aviso hover:bg-aviso hover:text-white"
            >
              Tomar el control
            </button>
          </p>
        )}
        {(estadoSesion.conflicto === 'version' || estadoSesion.conflicto === 'borrada') && (
          <p
            role="status"
            className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-error bg-white px-3 py-1.5 text-[11px] leading-snug text-error"
          >
            <span>
              {estadoSesion.conflicto === 'version'
                ? 'La obra cambió en el disco desde que se abrió (otra pestaña, git o una edición a mano). Lo que escribas ya no se guarda.'
                : 'La carpeta de esta obra ya no está en el disco. Lo que escribas no se guarda.'}
            </span>
            <button
              type="button"
              onClick={() => descargarHoja(archivoDeObra(obra), nombreDeArchivo(obra))}
              className="rounded border border-error px-1.5 py-0.5 text-[10px] hover:bg-error hover:text-white"
            >
              Descargar esta versión
            </button>
            {estadoSesion.conflicto === 'version' && (
              <button
                type="button"
                onClick={onRecargar}
                className="rounded border border-error px-1.5 py-0.5 text-[10px] hover:bg-error hover:text-white"
              >
                Recargar desde el disco
              </button>
            )}
          </p>
        )}
        {borrador && !soloLectura && (
          <p
            role="status"
            className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-aviso bg-white px-3 py-1.5 text-[11px] leading-snug text-ink"
          >
            <span>
              Hay cambios de la última vez que no llegaron al disco
              {borrador.sobreOtraVersion
                ? ', hechos sobre una versión anterior a la que hay ahora: recuperarlos reemplaza la del disco.'
                : '.'}
            </span>
            <button
              type="button"
              onClick={() => {
                setObra(borrador.obra);
                setBorrador(null);
              }}
              className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:border-accent hover:text-accent"
            >
              Recuperarlos
            </button>
            <button
              type="button"
              onClick={() => {
                olvidarBorrador(obra.id);
                setBorrador(null);
              }}
              className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:border-error hover:text-error"
            >
              Descartarlos
            </button>
          </p>
        )}
        {problemasLectura.length > 0 && (
          <p
            role="status"
            className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-aviso bg-white px-3 py-1.5 text-[11px] leading-snug text-aviso"
          >
            <span>
              Parte de la carpeta no se pudo leer y esos nodos abrieron con la hoja vacía:{' '}
              {problemasLectura.join(' ')} Con el primer cambio que se guarde, esas hojas se
              escriben vacías: si hay algo que rescatar, arréglalo en el disco y recarga antes.
            </span>
            <button
              type="button"
              onClick={() => setProblemasLectura([])}
              className="rounded border border-aviso px-1.5 py-0.5 text-[10px] hover:bg-aviso hover:text-white"
            >
              Entendido
            </button>
          </p>
        )}

        {/* Lo que se acaba de romper, con la vuelta atrás al lado. Reemplaza al
            «¿seguro?» que borrar ya no pregunta: dice qué se llevó el clic —que es
            lo que una confirmación nunca llegó a decir— y ofrece deshacerlo. */}
        {avisoBorrado && (
          <p
            role="status"
            className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-border bg-white px-3 py-1.5 text-[11px] leading-snug text-muted"
          >
            <span>{avisoBorrado}</span>
            <button
              type="button"
              onClick={() => {
                historial.deshacer();
                setAvisoBorrado(null);
                obraDelAviso.current = null;
              }}
              className="rounded border border-border px-1.5 py-0.5 text-[10px] text-ink hover:border-accent hover:text-accent"
            >
              ↶ Deshacer
            </button>
            <button
              type="button"
              onClick={() => {
                setAvisoBorrado(null);
                obraDelAviso.current = null;
              }}
              className="text-[10px] underline hover:text-accent"
            >
              Ocultar
            </button>
          </p>
        )}
      </header>

      {activa && deLaBiblioteca && (
        // Una hoja de la biblioteca se LEE. Editarla en su sitio iría contra la
        // regla de `public/biblioteca/README.md` —su fuente de verdad es su JSON,
        // y no se edita encima de la que respalda una memoria—, así que para
        // apartarse de ella primero hay que desprenderla.
        <div className="min-h-0 flex-1">
          <VistaHoja
            key={activa}
            hoja={deLaBiblioteca.regions}
            results={deLaBiblioteca.results}
            titulo={hojaDeNodo(activa)?.etiqueta ?? ''}
            onDesprender={() => desprenderNodo(activa)}
          />
        </div>
      )}

      {activa && !deLaBiblioteca && origenPestana && (
        // `key` por nodo: cambiar de pestaña tiene que REMONTAR el canvas. Sin
        // ella React reconciliaría la misma instancia, y el hook de persistencia
        // —que lee su origen una sola vez, al montar— seguiría escribiendo en el
        // nodo anterior.
        <div className="min-h-0 flex-1">
          <MathCanvas
            key={activa}
            origen={origenPestana}
            deepLinks={false}
            scopeInicial={evaluacion.scopeEnNodo.get(activa)}
            irA={irA?.nodo === activa ? irA : undefined}
          />
        </div>
      )}

      {activa === ID_NODO_COMBINACIONES && obra.sap?.combinaciones && (
        // Una vista ancha que no es una hoja: la matriz de combinaciones no
        // cabe en el panel lateral.
        <div className="min-h-0 flex-1">
          <TablaCombinaciones
            lectura={obra.sap.combinaciones}
            casos={obra.sap.casos?.lista}
            familia={familiaCombinaciones}
            onFamilia={setFamiliaCombinaciones}
          />
        </div>
      )}
      {activa === ID_NODO_APOYOS && obra.sap?.apoyos && (
        <div className="min-h-0 flex-1">
          <TablaApoyos
            lectura={obra.sap.apoyos}
            unidades={obra.unidadesSap ?? 'kN'}
            caso={casoApoyos}
            onCaso={setCasoApoyos}
            conjuntos={obra.conjuntosDiseno ?? []}
            sap={obra.sap}
          />
        </div>
      )}
      {activa === ID_NODO_APOYOS && !obra.sap?.apoyos && (
        <p className="p-6 text-sm text-muted">Las reacciones todavía no se leyeron. Léelas desde el nodo.</p>
      )}
      {activa === ID_NODO_COMBINACIONES && !obra.sap?.combinaciones && (
        <p className="p-6 text-sm text-muted">Las combinaciones todavía no se leyeron. Léelas desde el nodo.</p>
      )}

      <div className={`min-h-0 flex-1 ${activa ? 'hidden' : 'flex'}`}>
        <div className="relative min-w-0 flex-1">
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
            onPaneClick={() => {
              setSeleccion(null);
              setGrupoEnfocado(null);
            }}
            onNodeMouseEnter={(_, n) => setBajoPuntero(n.id)}
            onNodeMouseLeave={() => setBajoPuntero(null)}
            // Un nodo es la PROYECCIÓN del documento, no un objeto del lienzo.
            // Con los valores por omisión de React Flow, Backspace emitía un
            // cambio `remove` que `applyNodeChanges` aplicaba al array: el nodo
            // desaparecía, el cálculo seguía existiendo, y reaparecía al
            // siguiente cambio del documento. Se borra desde el panel, que es
            // donde está la confirmación. (El `deletable: false` de cada nodo
            // cierra las demás vías; esto cierra la tecla.)
            deleteKeyCode={null}
            // Y las flechas se derivan de los nombres que viajan (`proyeccion.ts`):
            // arrastrar una a mano dibujaría una relación que nadie guarda y que
            // el siguiente render se lleva.
            nodesConnectable={false}
            // `event` solo viene cuando el movimiento lo hizo el usuario; el de
            // `fitView` llega sin él.
            onMoveStart={(event) => {
              if (event) lienzoTocado.current = true;
            }}
            minZoom={0.05}
            proOptions={{ hideAttribution: false }}
          >
            <Background gap={24} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              // Un error manda sobre el grupo, igual que en la tarjeta.
              nodeColor={(n) => {
                const d = n.data as unknown as NodoDeObra;
                return d.severidad === 'ok' && d.grupo ? d.grupo.color : (COLOR[d.severidad] ?? COLOR.ok);
              }}
            />
          </ReactFlow>

          <LeyendaGrupos
            grupos={obra.grupos ?? []}
            miembros={miembrosPorGrupo}
            enfocado={grupoEnfocado}
            onEnfocar={(id) => {
              setGrupoEnfocado(id);
              // Enfocar un grupo es otra pregunta que la del nodo seleccionado.
              if (id) setSeleccion(null);
            }}
            onCambiar={cambiarUnGrupo}
            onBorrar={borrarUnGrupo}
          />
        </div>

        {/* Los paneles no se montan con una pestaña abierta. El lienzo sí se
            queda —oculto, para no perder el encuadre al volver—, pero un panel
            montado detrás registra su Escape global, y ese Escape es del bloque
            que se está editando en el canvas. */}
        {!activa && seleccion === ID_NODO_SAP && obra.modulos.includes('sap') && (
          <PanelSap
            sap={obra.sap}
            // La lectura anterior se conserva hasta que llegue la nueva: dice de
            // qué modelo salió, y el panel avisa si no es el conectado.
            onConectado={(sap) =>
              setObra((o) => {
                if (!o) return o;
                const { modelo: _m, ruta: _r, version: _v, leido: _l, modificado: _mo, ...lecturas } = o.sap ?? {};
                return { ...o, sap: { ...sap, ...lecturas } };
              })
            }
            // Una lectura reemplaza TODAS las del nodo: si una parte falló —las
            // cargas, la masa—, no queda la vieja, que sería de otro momento y no
            // lo diría. Las de los sub-nodos son de ellos y no se tocan.
            onLeido={(lectura) =>
              setObra((o) => {
                if (!o?.sap) return o;
                const resto = { ...o.sap };
                for (const k of LECTURAS_DEL_NODO_SAP) delete resto[k];
                return { ...o, sap: { ...resto, ...lectura } };
              })
            }
            pestana={pestanaSap}
            onPestana={setPestanaSap}
            // El scope final de la obra: una carga del modelo se justifica con lo
            // que la obra entera ya calculó, igual que un campo atado.
            justificar={{
              scope: evaluacion.scope,
              justificaciones: obra.justificaciones ?? [],
              unidades: obra.unidadesSap ?? 'kN',
              puedeIrA,
              onIrA: irANombre,
              // Por `setObra`: es la convención de la obra, y se deshace con Ctrl+Z.
              // `kN` no se escribe, porque es lo que se asume sin nada.
              onUnidades: (u) =>
                setObra((o) => {
                  if (!o) return o;
                  const { unidadesSap: _, ...resto } = o;
                  return u === 'tonf' ? { ...resto, unidadesSap: u } : resto;
                }),
              onJustificar: (carga, expr, actual) => {
                const o = obraRef.current;
                if (!o) return;
                if (!expr) {
                  if (actual) setObra(quitarJustificacion(o, actual.id));
                  return;
                }
                // Fuera del actualizador: una justificación nueva sortea su id.
                const j = actual
                  ? { ...actual, expr, valor: carga.valor }
                  : nuevaJustificacion({ patron: carga.patron, firma: firmaDe(carga), valor: carga.valor, expr });
                setObra(conJustificacion(o, j));
              },
              onJustificarModelo: (que, expr, actual) => {
                const o = obraRef.current;
                if (!o) return;
                if (!expr) {
                  if (actual) setObra(quitarJustificacion(o, actual.id));
                  return;
                }
                const j = actual ? { ...actual, ...que, expr } : nuevaJustificacion({ ...que, expr });
                setObra(conJustificacion(o, j));
              },
            }}
            onQuitarJustificacion={(id) => setObra((o) => (o ? quitarJustificacion(o, id) : o))}
            onCerrar={() => setSeleccion(null)}
          />
        )}

        {!activa && seleccion === ID_NODO_APOYOS && obra.modulos.includes('sap-apoyos') && (
          <PanelApoyos
            sap={obra.sap}
            unidades={obra.unidadesSap ?? 'kN'}
            onUnidades={(u) =>
              setObra((o) => {
                if (!o) return o;
                const { unidadesSap: _, ...resto } = o;
                return u === 'tonf' ? { ...resto, unidadesSap: u } : resto;
              })
            }
            onLeido={(apoyos) =>
              setObra((o) =>
                o?.sap
                  ? { ...o, sap: { ...o.sap, apoyos, ...(apoyos.modificado ? { modificado: apoyos.modificado } : {}) } }
                  : o,
              )
            }
            onAbrirTabla={(caso) => {
              if (caso) setCasoApoyos(caso);
              abrirPestana(ID_NODO_APOYOS);
            }}
            conjuntos={obra.conjuntosDiseno ?? []}
            // Las combinaciones son una lectura: la misma que la del sub-nodo Combinaciones.
            onCombinaciones={(combinaciones) =>
              setObra((o) => (o?.sap ? { ...o, sap: { ...o.sap, combinaciones } } : o))
            }
            // El conjunto es una decisión: por `setObra` con historial, y un id
            // nuevo se sortea fuera del actualizador.
            onGuardarConjunto={(c) => {
              const o = obraRef.current;
              if (!o) return;
              setObra(
                conConjunto(
                  o,
                  'id' in c ? c : { ...nuevoConjunto(c.nombre, c.familias), ...(c.alias ? { alias: c.alias } : {}) },
                ),
              );
            }}
            // Lo que publica y quién lo usa lo dice la evaluación, no el panel.
            publicacion={publicaApoyos(obra)}
            usan={consumidoresDe(ID_NODO_APOYOS, evaluacion)}
            aliasTipos={obra.aliasTipos ?? {}}
            onAliasTipo={(grupo, alias) => setObra((o) => (o ? conAliasTipo(o, grupo, alias) : o))}
            onQuitarConjunto={(id) => {
              const o = obraRef.current;
              if (o) setObra(quitarConjunto(o, id));
            }}
            onLeidoConjunto={(id, lectura) =>
              setObra((o) =>
                o?.sap
                  ? {
                      ...o,
                      sap: {
                        ...o.sap,
                        conjuntos: { ...o.sap.conjuntos, [id]: lectura },
                        ...(lectura.modificado ? { modificado: lectura.modificado } : {}),
                      },
                    }
                  : o,
              )
            }
            onQuitar={() => {
              quitarPublicador('sap-apoyos', ID_NODO_APOYOS, 'Reacciones en apoyos');
              cerrarPestana(ID_NODO_APOYOS);
            }}
            onCerrar={() => setSeleccion(null)}
          />
        )}

        {!activa && seleccion === ID_NODO_BASAL && obra.modulos.includes('sap-basal') && (
          <PanelBasal
            sap={obra.sap}
            unidades={obra.unidadesSap ?? 'kN'}
            // Por `setObra`, como en el SAP2000: es la convención de la obra.
            onUnidades={(u) =>
              setObra((o) => {
                if (!o) return o;
                const { unidadesSap: _, ...resto } = o;
                return u === 'tonf' ? { ...resto, unidadesSap: u } : resto;
              })
            }
            onLeido={(basal) =>
              setObra((o) =>
                o?.sap
                  ? { ...o, sap: { ...o.sap, basal, ...(basal.modificado ? { modificado: basal.modificado } : {}) } }
                  : o,
              )
            }
            onQuitar={() => {
              const o = obraRef.current;
              if (o) setObra(quitarModulo(o, 'sap-basal'));
              setSeleccion(null);
            }}
            onCerrar={() => setSeleccion(null)}
          />
        )}

        {!activa && seleccion === ID_NODO_MODAL && obra.modulos.includes('sap-modal') && (
          <PanelModal
            sap={obra.sap}
            publica={evaluacion.define.get(ID_NODO_MODAL) ?? []}
            usan={consumidoresDe(ID_NODO_MODAL, evaluacion)}
            // La fecha del .sdb que trae la lectura es también lo último que se
            // sabe del modelo: pasa a ser la de la conexión.
            onLeido={(modal) =>
              setObra((o) =>
                o?.sap
                  ? { ...o, sap: { ...o.sap, modal, ...(modal.modificado ? { modificado: modal.modificado } : {}) } }
                  : o,
              )
            }
            onQuitar={() => quitarPublicador('sap-modal', ID_NODO_MODAL, 'Modal')}
            onCerrar={() => setSeleccion(null)}
          />
        )}

        {!activa && seleccion === ID_NODO_COMBINACIONES && obra.modulos.includes('sap-combinaciones') && (
          <PanelCombinaciones
            sap={obra.sap}
            onLeido={(combinaciones) =>
              setObra((o) => (o?.sap ? { ...o, sap: { ...o.sap, combinaciones } } : o))
            }
            onAbrirTabla={(familia) => {
              setFamiliaCombinaciones(familia);
              abrirPestana(ID_NODO_COMBINACIONES);
            }}
            onQuitar={() => {
              const o = obraRef.current;
              if (o) setObra(quitarModulo(o, 'sap-combinaciones'));
              cerrarPestana(ID_NODO_COMBINACIONES);
              setSeleccion(null);
            }}
            onCerrar={() => setSeleccion(null)}
          />
        )}

        {!activa && calculo && (
          <PanelCalculo
            key={calculo.id}
            calculo={calculo}
            estado={calculo.frontera?.slug ? genericas[calculo.frontera.slug] : undefined}
            define={evaluacion.define.get(idNodoDeCalculo(calculo.id)) ?? []}
            problemaGrafo={problemaDeGrafo(idNodoDeCalculo(calculo.id), evaluacion)}
            regions={evaluacion.regions}
            results={evaluacion.results}
            instancia={evaluacion.importadas.get(idNodoDeCalculo(calculo.id))}
            otrosAlias={aliasAjenos(idNodoDeCalculo(calculo.id))}
            onNombre={(nombre) => cambiarUnCalculo(calculo.id, (k) => ({ ...k, nombre }))}
            onHoja={(hoja: Region[]) =>
              cambiarUnCalculo(calculo.id, (k) => ({ ...k, hoja }))
            }
            onAbrirHoja={() => abrirPestana(idNodoDeCalculo(calculo.id))}
            onCrearPlanilla={() => crearPlanilla(idNodoDeCalculo(calculo.id))}
            onDesprender={() => desprenderNodo(idNodoDeCalculo(calculo.id))}
            atados={evaluacion.scopeEnNodo.get(idNodoDeCalculo(calculo.id)) ?? {}}
            onImportar={(slug) =>
              importar(slug, (imp) =>
                cambiarUnCalculo(calculo.id, (k) => ({
                  ...k,
                  frontera: imp,
                  // El nodo se bautiza solo con el título de la planilla si
                  // todavía se llama como nació: un canvas con cuatro nodos
                  // «Cálculo» no dice nada.
                  nombre: k.nombre === 'Cálculo' ? tituloCorto(slug) : k.nombre,
                })),
              )
            }
            onEntrada={(nombre, valor) =>
              cambiarUnCalculo(calculo.id, (k) =>
                k.frontera
                  ? {
                      ...k,
                      frontera: {
                        ...k.frontera,
                        entradas: { ...k.frontera.entradas, [nombre]: valor },
                      },
                    }
                  : k,
              )
            }
            onFormula={(campo, expr) =>
              cambiarUnCalculo(calculo.id, (k) =>
                k.frontera ? { ...k, frontera: conFormula(k.frontera, campo, expr) } : k,
              )
            }
            onPublicar={(salida, alias) =>
              cambiarUnCalculo(calculo.id, (k) =>
                k.frontera ? { ...k, frontera: conPublicacion(k.frontera, salida, alias) } : k,
              )
            }
            onResellar={(sha256) =>
              cambiarUnCalculo(calculo.id, (k) =>
                k.frontera ? { ...k, frontera: { ...k.frontera, sha256 } } : k,
              )
            }
            onQuitarPlanilla={() =>
              cambiarUnCalculo(calculo.id, ({ frontera: _fuera, ...k }) => k)
            }
            onBorrar={() => borrarUnCalculo(calculo.id)}
            onCerrar={() => setSeleccion(null)}
            grupo={selectorGrupo(calculo.id, calculo.grupo)}
            revision={marcaRevision(calculo.id, calculo.revisar)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Lee la obra de donde viva —el disco o este navegador— y solo entonces monta
 * el canvas. Leer del disco es asíncrono, y `CanvasObra` arma el historial, el
 * layout y la evaluación a partir de la obra del primer render: montarlo con
 * `null` y rellenarlo después haría que todo eso partiera de la nada.
 *
 * Recargar remonta con una `key` nueva: una obra releída es un documento nuevo,
 * con su propia sesión, y no hereda el historial de la anterior.
 */
function CargadorObra({ id }: { id: string }) {
  const [vuelta, setVuelta] = useState(0);
  const [estado, setEstado] = useState<
    { fase: 'cargando' } | { fase: 'lista'; apertura: Apertura } | { fase: 'no-esta' } | { fase: 'error'; motivo: string }
  >({ fase: 'cargando' });

  useEffect(() => {
    let vivo = true;
    setEstado({ fase: 'cargando' });
    // Toda vuelta después de la primera es una recarga desde esta pestaña.
    abrirObra(id, { forzar: vuelta > 0 }).then(
      (a) => {
        // Abrir ya tomó el candado y arrancó el latido. Si mientras tanto el
        // usuario se fue, nadie montará el canvas que la cierra: sin esto el
        // latido seguía vivo, y al volver la obra abría en «Solo lectura».
        if (!vivo) return a?.sesion.cerrar(a.obra);
        setEstado(a ? { fase: 'lista', apertura: a } : { fase: 'no-esta' });
      },
      (e: Error) => vivo && setEstado({ fase: 'error', motivo: e.message }),
    );
    return () => {
      vivo = false;
    };
  }, [id, vuelta]);

  if (estado.fase === 'lista') {
    return (
      <CanvasObra
        key={vuelta}
        id={id}
        apertura={estado.apertura}
        onRecargar={() => setVuelta((v) => v + 1)}
      />
    );
  }
  if (estado.fase === 'cargando') {
    return <p className="px-4 py-16 text-center text-sm text-muted">Abriendo la obra…</p>;
  }
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <h1 className="text-lg font-semibold text-error">
        {estado.fase === 'error' ? 'No se pudo abrir la obra' : 'No hay ninguna obra con ese id'}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {estado.fase === 'error'
          ? estado.motivo
          : 'No está en la carpeta de obras del servidor local ni en el almacenamiento de este navegador.'}
      </p>
      <p className="mt-6 text-xs text-muted">
        <Enlace a={{ vista: 'proyectos' }} className="text-accent hover:underline">
          ← Volver a los proyectos
        </Enlace>
      </p>
    </main>
  );
}

export function CanvasObraConProveedor({ id }: { id: string }) {
  return (
    <ReactFlowProvider>
      <CargadorObra id={id} />
    </ReactFlowProvider>
  );
}
