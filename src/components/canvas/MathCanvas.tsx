import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MathRegion, { AIRE_TRAS_BLOQUE, GRID, UMBRAL_ARRASTRE, snap } from './MathRegion';
import { ALTO_ESPACIADOR } from './BloqueDoc';
import SymbolPalette, { type SymbolEntry } from './SymbolPalette';
import WorksheetPrint from './WorksheetPrint';
import VariablePanel from './VariablePanel';
import SeccionesPanel from './SeccionesPanel';
import SiluetaPapel, {
  ANCHO_HOJA,
  DESPLAZAMIENTO_LIENZO,
  IZQUIERDA_HOJA,
  ORIGEN_PAPEL_X,
  ORIGEN_PAPEL_Y,
  bordesDePagina,
} from './SiluetaPapel';
import CatalogoMenu from './CatalogoMenu';
import { usePaginacion } from './usePaginacion';
import { useHistorial } from './useHistorial';
import { evaluateSheet, type Region, type RegionKind } from '../../lib/worksheet';
import {
  detectarSolapes,
  separarSolapes,
  mismoOrdenDeLectura,
  abrirHueco,
  ALTO_POR_DEFECTO,
} from '../../lib/solapes';
import { esHoja, newId, parsearHoja, sanearRegiones } from '../../lib/hoja-json';
import {
  anclar,
  aplicarArrastre,
  deltaDeArrastre,
  duplicar,
  enRectangulo,
  rectEntre,
  type Anclaje,
  type Rect,
} from '../../lib/seleccion';
import { aFragmento, desdeFragmento, parsearFragmento } from '../../lib/fragmento';
import { TEMPLATES, type Template } from '../../lib/worksheet-templates';
import {
  IMAGE_WARN_BYTES,
  fileToImagePayload,
  fitToSheet,
  isImageFile,
} from '../../lib/canvas-image';
import { STORAGE_KEY, hayTrabajoGuardado } from '../../lib/hoja-guardada';
import { descargarHoja } from '../../lib/canvas-handoff';
import Enlace from '../Enlace';

/** Hoja de ejemplo para la primera visita (se reemplaza al editar). */
const DEMO: Region[] = [
  { id: 'demo-t', kind: 'text', x: ORIGEN_PAPEL_X, y: ORIGEN_PAPEL_Y, src: 'Ejemplo: momento máximo de una viga biapoyada' },
  { id: 'demo-1', kind: 'math', x: ORIGEN_PAPEL_X, y: 144, src: 'F := 30 kN' },
  { id: 'demo-2', kind: 'math', x: ORIGEN_PAPEL_X, y: 192, src: 'L := 6 m' },
  { id: 'demo-3', kind: 'math', x: ORIGEN_PAPEL_X, y: 240, src: 'M := F*L/4 = kN*m' },
  { id: 'demo-4', kind: 'math', x: ORIGEN_PAPEL_X, y: 288, src: 'M <= 60 kN*m =' },
];

/** Dónde se aparta una hoja guardada que no se pudo leer. */
export const CLAVE_APARTADA = `${STORAGE_KEY}.apartada`;

interface Arranque {
  regions: Region[];
  /** Había algo guardado, no se pudo leer como hoja, y se apartó. */
  apartada: boolean;
}

function loadInitial(): Arranque {
  if (typeof window === 'undefined') return { regions: DEMO, apartada: false };
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      // Si lo guardado es la hoja de ejemplo sin tocar, se devuelve DEMO por
      // referencia: así el autoguardado la sigue reconociendo y no empieza a
      // contarla como trabajo del usuario a partir de la segunda visita.
      if (data?.demo) return { regions: DEMO, apartada: false };
      if (Array.isArray(data?.regions)) {
        // Saneadas también aquí: el localStorage puede traer una hoja escrita
        // por una versión anterior, o a medio escribir.
        //
        // Sin filtrar las vacías: una región vacía que llegó a guardarse es
        // DELIBERADA —39 del corpus se usan como espaciador, 16 de ellas en
        // `anclajes-pedestal`—, y las transitorias no llegan aquí porque el
        // autoguardado descarta la que está en edición. Filtrarlas hacía que la
        // hoja se recolocara sola en el primer F5.
        return { regions: sanearRegiones(data.regions), apartada: false };
      }
    }
  } catch {
    // Cae abajo: había algo y no se pudo leer.
  }

  // Había algo guardado que no se lee como hoja —un JSON truncado, que es lo
  // típico cuando una escritura anterior chocó con la cuota— y en 300 ms el
  // autoguardado va a escribir la demo encima. Se aparta ANTES, porque una vez
  // sobrescrito no hay de dónde recuperarlo.
  if (raw) {
    try {
      localStorage.setItem(CLAVE_APARTADA, raw);
      return { regions: DEMO, apartada: true };
    } catch {
      // Si no cabe la copia, no hay nada mejor que hacer que seguir.
    }
  }
  return { regions: DEMO, apartada: false };
}

/**
 * Quita el parámetro de deep-link de la URL, ya consumido.
 *
 * Si se queda, recargar la página media hora después vuelve a dispararlo y
 * ofrece reemplazar la hoja por la planilla original — con el mismo diálogo que
 * el usuario ya aceptó al entrar, y sin deshacer al que recurrir.
 */
function limpiarDeepLink(param: string): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(param)) return;
  url.searchParams.delete(param);
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

const toolBtn =
  'whitespace-nowrap rounded border border-border bg-white px-2.5 py-1 text-xs font-medium text-ink hover:border-accent hover:text-accent';

/**
 * Una tarjeta de la pila de avisos, que flota sobre el visor del lienzo.
 *
 * `pointer-events-auto` la repone: su contenedor los tiene apagados para que el
 * hueco entre tarjetas deje pasar el clic que fija el punto de inserción.
 * `shadow-sm` no es adorno — es lo que la despega del papel y avisa de que está
 * por encima y no dentro de la hoja.
 */
const tarjetaAviso =
  'pointer-events-auto flex flex-col rounded border px-3 py-2 text-xs shadow-sm';

export default function MathCanvas() {
  const [arranque] = useState(loadInitial);
  const [regions, setRegions] = useState<Region[]>(arranque.regions);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /**
   * Punto de inserción: dónde caerá el próximo bloque. Lo fija el clic izquierdo
   * en la hoja (sin crear nada) y lo consumen los botones de la barra, el pegado
   * de imágenes y el tecleo directo. `null` = todavía no se ha fijado.
   */
  const [insertAt, setInsertAt] = useState<{ x: number; y: number } | null>(null);
  /** Menú desplegable de plantillas abierto. */
  const [templatesOpen, setTemplatesOpen] = useState(false);
  /** Menú desplegable de origen de la imagen (portapapeles / archivo) abierto. */
  const [imageMenuOpen, setImageMenuOpen] = useState(false);
  // Cuadro para pegar una hoja en JSON (la que acaba de generar un chat).
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  /** Aviso del autoguardado (cuota llena, storage deshabilitado). */
  const [storageWarn, setStorageWarn] = useState<string | null>(null);
  /**
   * Acuse de una acción que no deja rastro en la hoja.
   *
   * Copiar al portapapeles funcionaba y fallaba con el mismo aspecto: ninguno.
   * `malo` distingue el acuse del fallo, porque un «no se copió» hay que verlo.
   */
  const [aviso, setAviso] = useState<{ texto: string; malo?: boolean } | null>(null);
  /**
   * Al arrancar había una hoja guardada ilegible y se apartó.
   *
   * Tiene su propio estado y no comparte el de `storageWarn`: ese es del
   * autoguardado, que lo limpia en cuanto consigue escribir —o sea 300 ms
   * después—, y este aviso apunta a datos recuperables, así que tiene que
   * quedarse hasta que alguien lo cierre.
   */
  const [apartada, setApartada] = useState(() => arranque.apartada);
  /** Hay un archivo sobrevolando la hoja (realce de la zona de soltado). */
  const [dropping, setDropping] = useState(false);
  /** Panel de inspección de variables abierto. */
  const [showVars, setShowVars] = useState(false);
  /** Panel con el índice de secciones de la hoja abierto. */
  const [showSecciones, setShowSecciones] = useState(false);
  /** Rectángulo de selección en curso, en coordenadas de la hoja. */
  const [marco, setMarco] = useState<Rect | null>(null);
  /** Capa que numera el orden de lectura sobre cada bloque. */
  const [showOrden, setShowOrden] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  /** El contenedor con scroll; lo necesita el panel de variables para saltar. */
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);

  // Espejos en ref del punto de inserción y de las regiones: los manejadores de
  // pegado y de teclado se suscriben una sola vez y necesitan el valor vigente
  // sin volver a suscribirse en cada pulsación.
  const insertRef = useRef(insertAt);
  const regionsRef = useRef(regions);
  /**
   * Espejo de la selección. El arrastre en grupo la necesita **síncrona**: el
   * grupo se congela dentro del primer `pointermove`, y el `selected` del estado
   * de React todavía sería el del render anterior.
   */
  const selectedRef = useRef(selected);
  /** Espejo de la región en edición: lo necesita el guardado al desmontar. */
  const activeIdRef = useRef(activeId);
  /** Espejo de las medidas: `nextSpot` se suscribe una vez y necesita las vigentes. */
  const medidasRef = useRef<{ alto: Map<string, number>; ancho: Map<string, number> }>({
    alto: new Map(),
    ancho: new Map(),
  });
  useEffect(() => {
    insertRef.current = insertAt;
  }, [insertAt]);
  useEffect(() => {
    regionsRef.current = regions;
  }, [regions]);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  /** Cambia la selección manteniendo el espejo al día. */
  const seleccionar = useCallback((ids: Set<string>) => {
    selectedRef.current = ids;
    setSelected(ids);
  }, []);

  /**
   * Las regiones sobre las que se evalúa, un paso por detrás de las que se
   * editan.
   *
   * `evaluateSheet` vuelve a parsear y evaluar la hoja ENTERA con math.js, y en
   * una planilla real eso son ~4 s. Colgado directamente de `regions` se
   * disparaba en cada pulsación y en cada `pointermove` de un arrastre (60-120
   * veces por segundo), que es lo que volvía inusables las planillas grandes.
   *
   * Con el aplazamiento, una ráfaga de tecleo o un arrastre completo cuestan
   * UNA evaluación en vez de una por evento. El precio es que el resultado va
   * hasta 120 ms por detrás del texto — que es como se comporta cualquier hoja
   * de cálculo, y muy por debajo del umbral en el que se nota.
   */
  const [regionsEval, setRegionsEval] = useState(regions);
  useEffect(() => {
    const t = setTimeout(() => setRegionsEval(regions), 120);
    return () => clearTimeout(t);
  }, [regions]);

  const results = useMemo(() => evaluateSheet(regionsEval), [regionsEval]);

  // Al deshacer se sale de edición y se limpia la selección: los ids que
  // hubiera seleccionados pueden no existir en el estado que se restaura.
  const trasRestaurar = useCallback(() => {
    setActiveId(null);
    seleccionar(new Set());
  }, [seleccionar]);
  const historial = useHistorial(regions, setRegions, trasRestaurar);

  /**
   * Tamaño real de cada región, leído del DOM.
   *
   * Ninguna región lo declara —`w`/`h` solo existen para las imágenes—, pero un
   * bloque de programa multilínea llega a 600 px y una región con error añade
   * su mensaje debajo. Sin medirlos, el canvas apila bloques encima de otros.
   *
   * Se mide después de pintar y con una pausa, porque KaTeX compone en un
   * efecto: leer antes daría la altura del hueco vacío.
   */
  const [medidas, setMedidas] = useState<{ alto: Map<string, number>; ancho: Map<string, number> }>(
    () => ({ alto: new Map(), ancho: new Map() }),
  );
  useEffect(() => {
    const hoja = sheetRef.current;
    if (!hoja) return;

    let pedido = 0;
    const leer = () => {
      pedido = 0;
      const alto = new Map<string, number>();
      const ancho = new Map<string, number>();
      for (const el of hoja.querySelectorAll<HTMLElement>('[data-region-id]')) {
        const caja = el.getBoundingClientRect();
        alto.set(el.dataset.regionId!, caja.height);
        ancho.set(el.dataset.regionId!, caja.width);
      }
      medidasRef.current = { alto, ancho };
      setMedidas({ alto, ancho });
    };
    // Una sola lectura por cuadro aunque el observador avise de cuarenta
    // bloques: sin coalescer, una hoja de 646 regiones dispara 646 medidas
    // completas seguidas.
    const pedir = () => {
      if (pedido) return;
      pedido = requestAnimationFrame(leer);
    };

    // Un observador y no un `setTimeout`: el alto de un bloque cambia cuando
    // KaTeX termina de componer, cuando llega el SVG de un esquema y cuando el
    // resultado de la evaluación cambia de ancho, y ninguna de las tres cosas
    // avisa. Con el temporizador la medida iba 250 ms por detrás, que se notaba
    // poco mientras solo servía para no apilar bloques — y se va a notar mucho
    // cuando de ella dependa dónde se dibuja el corte de página.
    const obs = new ResizeObserver(pedir);
    const mirar = () => {
      obs.disconnect();
      for (const el of hoja.querySelectorAll<HTMLElement>('[data-region-id]')) obs.observe(el);
      pedir();
    };
    mirar();

    // Las tipografías cambian el alto del texto: medir antes de que carguen da
    // una hoja que se recoloca sola un segundo después.
    let vivo = true;
    const listas = document.fonts?.ready ?? Promise.resolve();
    void listas.then(() => vivo && pedir());

    // Los bloques que entran y salen: el observador no los ve aparecer.
    const mut = new MutationObserver(mirar);
    mut.observe(hoja, { childList: true });

    return () => {
      vivo = false;
      if (pedido) cancelAnimationFrame(pedido);
      obs.disconnect();
      mut.disconnect();
    };
  }, [regions, results]);

  const solapes = useMemo(
    () => detectarSolapes(regions, medidas.alto, medidas.ancho),
    [regions, medidas],
  );

  /**
   * El orden en que el motor lee la hoja, para poder verlo por encima.
   *
   * Numera solo lo que `evaluateSheet` ordena de verdad: las regiones de texto
   * quedan fuera del orden de lectura (`worksheet.ts`), y numerarlas prometería
   * una posición en la cadena de cálculo que no tienen.
   */
  const ordenDeLectura = useMemo(() => {
    if (!showOrden) return null;
    const m = new Map<string, number>();
    [...regions]
      .filter((r) => r.kind !== 'text')
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .forEach((r, i) => m.set(r.id, i + 1));
    return m;
  }, [regions, showOrden]);

  /**
   * La primera región de texto en orden de lectura: la hoja la dibuja como
   * título. La misma regla que aplica `WorksheetPrint`, y por eso se calcula
   * igual — si las dos discreparan, el título estaría en un sitio en pantalla y
   * en otro en el papel, que es justo lo que se acaba de arreglar.
   */
  const idTitulo = useMemo(
    () =>
      [...regions]
        .filter((r) => r.src.trim() !== '')
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .find((r) => r.kind === 'text')?.id,
    [regions],
  );

  /** Ids de las regiones que quedan tapadas, para señalarlas en la hoja. */
  const tapadas = useMemo(() => new Set(solapes.map((s) => s.id)), [solapes]);

  /** Hasta dónde llega el bloque más bajo, con su alto real. */
  const fondoDeLaHoja = useMemo(
    () =>
      regions.reduce(
        (max, r) => Math.max(max, r.y + (medidas.alto.get(r.id) ?? r.h ?? ALTO_POR_DEFECTO)),
        0,
      ),
    [regions, medidas.alto],
  );

  /** Empuja hacia abajo lo justo para que nada se pise. Reversible con Ctrl+Z. */
  const separar = useCallback(() => {
    const nuevas = separarSolapes(regions, medidas.alto, medidas.ancho, GRID);
    if (nuevas === regions) return;
    // El orden de lectura resuelve el scope compartido: si cambiara, cambiarían
    // los números de la hoja. `separarSolapes` solo empuja hacia abajo y en
    // orden justamente para conservarlo, pero se comprueba antes de aplicar.
    if (!mismoOrdenDeLectura(regions, nuevas)) {
      alert('No se pudo separar sin alterar el orden de lectura de la hoja.');
      return;
    }
    setRegions(nuevas);
    seleccionar(new Set());
  }, [regions, medidas, seleccionar]);

  // Dónde cae cada corte de A4 al imprimir. Se mide el documento de impresión,
  // que es lineal y distinto de este plano 2D: por eso el corte se anuncia
  // sobre la región que ABRE la página, que en orden de lectura es exacto.
  const paginacion = usePaginacion(regions, results);

  /**
   * Los cortes, ya llevados a la geometría de la hoja. La `y` es la de la
   * región que abre página; la línea se dibuja un pelo más arriba, en el hueco
   * que queda entre ella y la anterior.
   */
  const marcasDeCorte = useMemo(() => {
    const porId = new Map(regions.map((r) => [r.id, r]));
    return paginacion.cortes
      .map((c) => {
        const r = porId.get(c.id);
        return r ? { pagina: c.pagina, y: r.y, forzado: Boolean(r.pageBreak) } : null;
      })
      .filter((m): m is { pagina: number; y: number; forzado: boolean } => m !== null);
  }, [paginacion.cortes, regions]);

  /** El pie de la última hoja dibujada: hasta ahí tiene que llegar el lienzo. */
  const fondoDelPapel = useMemo(() => {
    const bordes = bordesDePagina(marcasDeCorte, fondoDeLaHoja);
    return bordes[bordes.length - 1];
  }, [marcasDeCorte, fondoDeLaHoja]);

  /** Marca (o desmarca) las regiones seleccionadas como inicio de página. */
  const toggleSalto = useCallback(() => {
    setRegions((prev) => {
      const sel = prev.filter((r) => selected.has(r.id));
      if (sel.length === 0) return prev;
      // Si alguna no tiene salto, el botón lo pone en todas; si ya lo tienen
      // todas, lo quita. Así el mismo botón sirve de ida y de vuelta.
      const poner = sel.some((r) => !r.pageBreak);
      return prev.map((r) =>
        selected.has(r.id) ? { ...r, pageBreak: poner ? true : undefined } : r,
      );
    });
  }, [selected]);

  /**
   * Carga una hoja ya parseada (`{version, regions}`) venga de donde venga: del
   * import por archivo, de un deep-link o de un pegado. Devuelve false si el
   * objeto no tiene forma de hoja o si el usuario prefirió no pisar su trabajo.
   *
   * Está centralizado porque las cuatro vías tienen que preguntar igual:
   * reemplazar la hoja es destructivo y el autoguardado lo vuelve permanente en
   * 300 ms.
   *
   * `hayTrabajo` es un parámetro y no una lectura fija del estado porque las vías
   * no coinciden en qué cuenta como «trabajo». Un deep-link corre en el primer
   * render, cuando `regions` ya trae la demo aunque el usuario no haya escrito
   * nada: ahí lo que vale es `hayTrabajoGuardado()`. Una acción dentro de la app sí
   * mira lo que hay en pantalla.
   */
  const cargarHoja = useCallback(
    (data: unknown, opts: { titulo?: string; hayTrabajo?: boolean } = {}): boolean => {
      if (!esHoja(data)) return false;
      const nombre = opts.titulo ?? data.meta?.titulo;
      const hayTrabajo =
        opts.hayTrabajo ?? regionsRef.current.some((r) => r.src.trim() !== '');
      if (
        hayTrabajo &&
        !confirm(
          nombre
            ? `¿Abrir «${nombre}» y reemplazar tu hoja actual?`
            : '¿Reemplazar tu hoja actual por la que estás cargando?',
        )
      ) {
        return false;
      }
      // `sanearRegiones` clona (una plantilla de la galería es un objeto
      // compartido y editarla en la hoja no debe mutarlo), descarta las
      // malformadas y reasigna los ids repetidos.
      setRegions(sanearRegiones(data.regions));
      seleccionar(new Set());
      setActiveId(null);
      setInsertAt(null);
      return true;
    },
    [seleccionar],
  );

  // Deep-link: /herramientas/canvas?plantilla=<id> abre esa plantilla al entrar.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('plantilla');
    if (!id) return;
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    cargarHoja(tpl, { titulo: tpl.titulo, hayTrabajo: hayTrabajoGuardado() });
    limpiarDeepLink('plantilla');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Descarga una planilla publicada y la abre.
   *
   * A diferencia de `?plantilla=`, que sirve la galería compilada en
   * `worksheet-templates.ts`, estas viven como archivo suelto en
   * `public/planillas/`: se acumulan sin tocar el bundle, se descargan como
   * JSON y se verifican fuera del navegador con `npm run verify:planilla`.
   *
   * La usan el deep-link y el menú del catálogo, que necesitan exactamente lo
   * mismo. El slug se valida contra [a-z0-9-] para que no pueda apuntar a otra
   * ruta.
   */
  const cargarPlanilla = useCallback(
    (slug: string, opts: { hayTrabajo?: boolean; señal?: { cancelado: boolean } } = {}) => {
      if (!/^[a-z0-9-]+$/.test(slug)) return;
      fetch(`/planillas/${slug}.json`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((data) => {
          if (opts.señal?.cancelado) return;
          if (!esHoja(data)) throw new Error('formato inválido');
          const titulo = typeof data?.meta?.titulo === 'string' ? data.meta.titulo : slug;
          cargarHoja(data, { titulo, hayTrabajo: opts.hayTrabajo });
        })
        .catch(() => {
          if (!opts.señal?.cancelado) alert(`No se pudo cargar la planilla «${slug}».`);
        });
    },
    [cargarHoja],
  );

  // Deep-link: /?planilla=<slug> abre esa planilla al entrar.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('planilla');
    if (!slug) return;
    const señal = { cancelado: false };
    cargarPlanilla(slug, { hayTrabajo: hayTrabajoGuardado(), señal });
    limpiarDeepLink('planilla');
    return () => {
      señal.cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Escribe la hoja en `localStorage`. Una sola implementación, porque la usan
   * el autoguardado con debounce y el vaciado al desmontar.
   *
   * El fallo NO es silencioso: una hoja con imágenes pegadas puede superar la
   * cuota de `localStorage` (~5 MB), y a partir de ahí todo lo que el usuario
   * escriba se perdería al recargar sin que nada lo indique.
   */
  const guardarHoja = useCallback((rs: Region[], editando: string | null) => {
    try {
      // Solo se descarta la región EN EDICIÓN si está vacía: es la que puede
      // quedar a medio crear si se cierra la pestaña.
      //
      // Antes se descartaban todas las vacías, y eso borraba los espaciadores
      // —39 en el corpus, 16 solo en `anclajes-pedestal`— en el primer
      // autoguardado: la hoja se recolocaba sola tras un F5. Una región vacía
      // que no se está editando es una decisión del autor.
      const persistable = rs.filter((r) => r.id !== editando || r.src.trim() !== '');
      // Se marca la hoja de ejemplo intacta para que `hayTrabajoGuardado` no la
      // confunda con trabajo del usuario (ver el comentario de esa función).
      const demo = rs === DEMO;
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, regions: persistable, ...(demo ? { demo: true } : {}) }),
      );
      setStorageWarn(null);
    } catch (err) {
      const quota =
        err instanceof DOMException &&
        (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
      setStorageWarn(
        quota
          ? 'La hoja superó la cuota del navegador y dejó de autoguardarse. Exporta el JSON y borra alguna imagen.'
          : 'No se pudo autoguardar la hoja en este navegador. Exporta el JSON para no perder el trabajo.',
      );
    }
  }, []);

  // Autoguardado con debounce.
  useEffect(() => {
    const t = setTimeout(() => guardarHoja(regions, activeId), 300);
    return () => clearTimeout(t);
  }, [regions, activeId, guardarHoja]);

  // Y un guardado al desmontar, que el debounce por sí solo no da: su `cleanup`
  // cancela el temporizador pendiente, así que teclear y pulsar «← Inicio»
  // dentro de los 300 ms perdía lo último escrito sin que nada lo indicara.
  //
  // Va en su propio efecto con dependencias vacías —y leyendo de los espejos—
  // para que corra SOLO al desmontar: en el efecto de arriba, el `cleanup`
  // también se dispara en cada pulsación y guardaría de forma síncrona en cada
  // tecla, que es justo lo que el debounce evita.
  useEffect(() => {
    return () => guardarHoja(regionsRef.current, activeIdRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El acuse se retira solo: es información de un momento, y una banda que se
  // queda obliga a cerrarla. El fallo dura más porque hay que llegar a leerlo.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso.malo ? 8000 : 2500);
    return () => clearTimeout(t);
  }, [aviso]);

  /**
   * Desplaza la hoja hasta una región y la deja seleccionada.
   *
   * Se calcula el destino a mano en vez de usar `scrollIntoView` porque la
   * región debe quedar centrada en el visor y no pegada al borde: en una hoja
   * de 16.000 px, un bloque en el filo se lee mal.
   */
  const irARegion = useCallback((id: string) => {
    const cont = scrollRef.current;
    const region = regionsRef.current.find((r) => r.id === id);
    if (!cont || !region) return;
    cont.scrollTo({
      top: Math.max(0, region.y - cont.clientHeight / 2),
      left: Math.max(0, region.x - cont.clientWidth / 2),
      behavior: 'smooth',
    });
    seleccionar(new Set([id]));
    setActiveId(null);
  }, [seleccionar]);

  const updateRegion = useCallback((id: string, patch: Partial<Region>) => {
    setRegions((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  /**
   * Sale de edición. Con `avanzar`, además baja el punto de inserción por debajo
   * del bloque que se acaba de confirmar, para poder seguir escribiendo el
   * siguiente sin tocar el ratón.
   *
   * El alto se mide del DOM en vez de suponerse: el paso de inserción de
   * `insertRegion` es fijo (48 px, u 80 para un programa) y una región no mide
   * siempre lo mismo —en el corpus las hay de 600 px—, así que encadenar con un
   * paso fijo acababa metiendo un bloque encima del anterior. Esto es lo que un
   * comentario de `insertRegion` llevaba tiempo prometiendo bajo el nombre
   * `avanzarPunto`, que nunca llegó a existir.
   *
   * **Dos `requestAnimationFrame`, y hacen falta los dos.** El primero espera al
   * repintado que sustituye el editor por el bloque; el segundo, a que KaTeX
   * haya compuesto la fórmula, que ocurre en un efecto pasivo de `BloqueDoc` y
   * por tanto puede llegar después del primero. Midiendo antes se obtiene el
   * alto del `<input>`, que es una línea, y no el de la ecuación.
   */
  const commitActive = useCallback(
    (avanzar = false) => {
      const id = activeId;
      if (id) {
        // Una región que queda vacía al salir de edición se elimina.
        setRegions((prev) => prev.filter((r) => r.id !== id || r.src.trim() !== ''));
      }
      setActiveId(null);
      if (!avanzar || !id) return;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Si la región se eliminó por quedar vacía, no hay nada bajo lo que
          // ponerse: el punto se queda donde estaba, que es cancelar la
          // creación y no avanzar sobre un bloque que ya no existe.
          const r = regionsRef.current.find((x) => x.id === id);
          if (!r) return;
          const nodo = document.querySelector(`[data-region-id="${id}"]`);
          const alto =
            nodo?.getBoundingClientRect().height ||
            medidasRef.current.alto.get(id) ||
            ALTO_POR_DEFECTO;
          setInsertAt({ x: r.x, y: snap(r.y + alto + AIRE_TRAS_BLOQUE) });
        });
      });
    },
    [activeId],
  );

  /** Coordenadas del puntero relativas a la hoja. */
  const sheetPoint = (e: { clientX: number; clientY: number }) => {
    const rect = sheetRef.current?.getBoundingClientRect();
    if (!rect) return { x: ORIGEN_PAPEL_X, y: ORIGEN_PAPEL_Y };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  /**
   * Dónde cae el próximo bloque: el punto fijado con el clic o, si aún no se ha
   * fijado ninguno, el final de la hoja (así el primer botón pulsado nunca
   * escribe encima de lo que ya hay).
   */
  const nextSpot = useCallback((): { x: number; y: number } => {
    const rs = regionsRef.current;
    const { alto, ancho } = medidasRef.current;
    const altoDe = (r: Region) => alto.get(r.id) ?? r.h ?? 24;

    let punto = insertRef.current;
    if (!punto) {
      const maxY = rs.length ? Math.max(...rs.map((r) => r.y + altoDe(r))) : 0;
      punto = { x: ORIGEN_PAPEL_X, y: snap(maxY + AIRE_TRAS_BLOQUE) };
    }

    // Que el punto no caiga DENTRO de un bloque ya existente. El paso de
    // inserción es fijo (48 px), pero una región no mide siempre lo mismo: un
    // bloque de programa multilínea llega a 600 px. Encadenando bloques con el
    // mismo botón, el nuevo aterrizaba encima del anterior.
    let y = punto.y;
    for (let vuelta = 0; vuelta < 50; vuelta++) {
      const choca = rs.find((r) => {
        const rAncho = ancho.get(r.id) ?? r.w ?? 120;
        return (
          y >= r.y && y < r.y + altoDe(r) && punto!.x < r.x + rAncho && r.x < punto!.x + 120
        );
      });
      if (!choca) break;
      y = snap(choca.y + altoDe(choca) + 8);
    }
    return { x: punto.x, y };
  }, []);

  /**
   * Crea un bloque en el punto de inserción y lo deja en edición. El punto baja
   * por debajo del bloque recién creado, de modo que pulsar dos veces el mismo
   * botón encadena bloques en columna en vez de superponerlos.
   */
  const insertRegion = useCallback(
    (kind: Exclude<RegionKind, 'image'>, src = '') => {
      const { x, y } = nextSpot();
      const region: Region = { id: newId(), kind, x: snap(x), y: snap(y), src };
      setRegions((prev) => [...prev, region]);
      seleccionar(new Set());
      setActiveId(region.id);
      setInsertAt({ x: snap(x), y: snap(y) + (kind === 'program' ? 5 * GRID : 3 * GRID) });
      // Una reserva provisional, no el alto real: el bloque acaba de nacer y
      // todavía no está medido. Y no llega a verse, porque el punto no se dibuja
      // mientras hay algo en edición. Al confirmar con Enter, `commitActive`
      // mide el bloque ya renderizado y corrige esta cifra.
    },
    [nextSpot, seleccionar],
  );

  /**
   * Abre una línea de espacio en el punto de inserción.
   *
   * Inserta un espaciador —una región de texto vacía— y baja lo que haya de ahí
   * para abajo, de modo que el hueco se abre de verdad en vez de meter el bloque
   * encima del siguiente. El punto de inserción baja con él, así que pulsar
   * Enter varias veces apila espacio en lugar de insertar siempre en el mismo
   * sitio.
   *
   * El espaciador ocupa el mismo alto en la hoja y en el papel, así que el hueco
   * que se ve es el que se imprime.
   */
  const insertarEspacio = useCallback(() => {
    const punto = insertRef.current;
    if (!punto) return;
    const y = snap(punto.y);
    const region: Region = { id: newId(), kind: 'text', x: snap(punto.x), y, src: '' };

    setRegions((prev) => {
      const corridas = abrirHueco(prev, y, ALTO_ESPACIADOR);
      // Lo que se comprueba es que el empujón no reordene las regiones QUE YA
      // ESTABAN; la nueva no tenía posición antes, así que meterla en la
      // comparación no diría nada. El orden de lectura resuelve el scope
      // compartido, y aunque un desplazamiento uniforme no pueda alterarlo,
      // comprobarlo cuesta una comparación de cadenas.
      if (!mismoOrdenDeLectura(prev, corridas)) return prev;
      return [...corridas, region];
    });

    seleccionar(new Set());
    setActiveId(null);
    setInsertAt({ x: snap(punto.x), y: y + ALTO_ESPACIADOR });
  }, [seleccionar]);

  // ── Selección: marco sobre el fondo, arrastre en grupo, portapapeles ────────

  /** El gesto que hay sobre el fondo, hasta saber si es un clic o un marco. */
  const gesto = useRef<{
    x0: number;
    y0: number;
    px: number;
    py: number;
    base: Set<string>;
    marcando: boolean;
  } | null>(null);
  /** El grupo congelado del arrastre en curso. */
  const arrastre = useRef<Anclaje | null>(null);

  const onHojaPointerDown = (e: React.PointerEvent) => {
    // Solo el fondo: las regiones detienen la propagación en su `pointerdown`,
    // y los adornos (cortes, cursor de inserción) son `pointer-events-none`.
    if (e.target !== e.currentTarget || e.button !== 0) return;
    const p = sheetPoint(e);
    gesto.current = {
      x0: p.x,
      y0: p.y,
      px: e.clientX,
      py: e.clientY,
      // Con Ctrl o Mayús el marco SUMA a lo que ya había seleccionado.
      base: e.ctrlKey || e.shiftKey ? new Set(selectedRef.current) : new Set(),
      marcando: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHojaPointerMove = (e: React.PointerEvent) => {
    const g = gesto.current;
    if (!g) return;
    if (!g.marcando) {
      if (Math.hypot(e.clientX - g.px, e.clientY - g.py) < UMBRAL_ARRASTRE) return;
      g.marcando = true;
    }
    const rect = rectEntre({ x: g.x0, y: g.y0 }, sheetPoint(e));
    setMarco(rect);
    const { alto, ancho } = medidasRef.current;
    seleccionar(new Set([...g.base, ...enRectangulo(regionsRef.current, alto, ancho, rect)]));
  };

  const onHojaPointerUp = () => {
    const g = gesto.current;
    gesto.current = null;
    setMarco(null);
    // Un clic sin arrastre no selecciona: solo fija el punto de inserción, que es
    // el comportamiento de siempre. Va en el `pointerup` y no en el `click` para
    // no dispararse también al soltar un marco.
    if (!g || g.marcando) return;
    seleccionar(new Set());
    setInsertAt({ x: snap(g.x0), y: snap(g.y0 - GRID / 2) });
  };

  /**
   * Congela el grupo que se va a mover.
   *
   * Si la región agarrada ya estaba seleccionada, se mueve la selección entera;
   * si no, pasa a ser la selección (o se suma a ella con Ctrl/Mayús). Es el
   * comportamiento de SMath, y evita el desconcierto de arrastrar un bloque que
   * parecía suelto y ver moverse otros cinco.
   */
  const empezarArrastre = useCallback(
    (id: string, additive: boolean) => {
      const prev = selectedRef.current;
      const grupo = prev.has(id) ? prev : new Set(additive ? [...prev, id] : [id]);
      if (grupo !== prev) seleccionar(grupo);
      arrastre.current = anclar(regionsRef.current, grupo, id);
    },
    [seleccionar],
  );

  const moverArrastre = useCallback((dx: number, dy: number) => {
    const a = arrastre.current;
    if (!a) return;
    const d = deltaDeArrastre(a, dx, dy, snap);
    setRegions((prev) => aplicarArrastre(prev, a, d.dx, d.dy));
  }, []);

  const terminarArrastre = useCallback(() => {
    arrastre.current = null;
  }, []);

  /**
   * Copia la selección al portapapeles como fragmento de hoja. Devuelve cuántos
   * bloques se escribieron, o `null` si no se pudo escribir.
   *
   * El valor de retorno no es un adorno: es lo que deja que Ctrl+X borre
   * **después** de confirmar la copia. Antes esto era
   * `navigator.clipboard?.writeText(t).catch(...)`, y el `?.` cortocircuita la
   * cadena entera —el `.catch` incluido—, así que en un contexto no seguro
   * (`http://` a una IP de la red local, que es como se abre desde otro equipo)
   * no se copiaba nada, no saltaba ningún aviso, y el corte ya había borrado.
   */
  const copiarSeleccion = useCallback(async (ids: ReadonlySet<string>): Promise<number | null> => {
    if (ids.size === 0) return null;
    const frag = aFragmento(regionsRef.current, ids);
    if (frag.regions.length === 0) return null; // la selección ya no existe
    const texto = JSON.stringify(frag, null, 2);
    try {
      // Sin `?.`: si no hay portapapeles hay que enterarse, no seguir de largo.
      if (!navigator.clipboard) return null;
      await navigator.clipboard.writeText(texto);
      return frag.regions.length;
    } catch {
      return null;
    }
  }, []);

  /** Pega un fragmento en el punto de inserción. Devuelve si el texto lo era. */
  const pegarFragmento = useCallback(
    (texto: string): boolean => {
      const frag = parsearFragmento(texto);
      if (!frag) return false;
      const at = insertRef.current ?? nextSpot();
      const nuevas = desdeFragmento(frag, at, newId);
      setRegions((prev) => [...prev, ...nuevas]);
      seleccionar(new Set(nuevas.map((r) => r.id)));
      setActiveId(null);
      // El punto de inserción baja por debajo de lo pegado: sin esto, pegar dos
      // veces seguidas deja la segunda copia exactamente encima de la primera.
      const fondo = Math.max(...frag.regions.map((r) => r.y + (r.h ?? 0)));
      setInsertAt({ x: at.x, y: snap(at.y + fondo + 3 * GRID) });
      return true;
    },
    [nextSpot, seleccionar],
  );

  /** Duplica la selección un paso de cuadrícula abajo y a la derecha. */
  const duplicarSeleccion = useCallback(
    (ids: ReadonlySet<string>) => {
      if (ids.size === 0) return;
      const nuevas = duplicar(regionsRef.current, ids, GRID, GRID, newId);
      setRegions((prev) => [...prev, ...nuevas]);
      seleccionar(new Set(nuevas.map((r) => r.id)));
    },
    [seleccionar],
  );

  /**
   * Inserta imágenes en la hoja. Se usa desde el pegado, el soltado de archivos
   * y el botón de la barra. Varias imágenes a la vez se apilan hacia abajo.
   */
  const addImages = useCallback(
    async (files: File[], at?: { x: number; y: number }) => {
    const imgs = files.filter(isImageFile);
    if (imgs.length === 0) return;
    const punto = at ?? nextSpot();
    const { x } = punto;
    let y = punto.y;
    let pesada = false;

    for (const file of imgs) {
      try {
        const payload = await fileToImagePayload(file);
        const { w, h } = fitToSheet(payload.naturalW, payload.naturalH);
        if (payload.bytes > IMAGE_WARN_BYTES) pesada = true;
        const region: Region = {
          id: newId(),
          kind: 'image',
          x: snap(x),
          y: snap(y),
          src: payload.src,
          w: snap(w),
          h,
        };
        setRegions((prev) => [...prev, region]);
        setActiveId(null);
        seleccionar(new Set([region.id]));
        y += h + GRID;
      } catch {
        alert(`No se pudo leer «${file.name}» como imagen.`);
      }
    }

    // El punto de inserción baja tras las imágenes colocadas: dos pegados
    // seguidos sin clic de por medio se encadenan en vez de taparse.
    setInsertAt({ x: snap(x), y: snap(y) });

    if (pesada) {
      alert(
        'La imagen quedó pesada aun tras reescalarla. Se guarda dentro de la hoja ' +
          '(localStorage y JSON exportado), así que conviene recortarla antes de pegarla.',
      );
    }
    },
    [nextSpot, seleccionar],
  );

  /**
   * Lee una imagen del portapapeles y la inserta (opción «Desde el portapapeles»).
   *
   * `navigator.clipboard.read()` necesita contexto seguro, gesto del usuario y,
   * en Chrome, un permiso que el navegador puede pedir o denegar. Cuando no está
   * disponible o falla, se remite al Ctrl+V de toda la vida, que sigue montado y
   * no depende de ningún permiso.
   */
  const pasteFromClipboard = useCallback(async () => {
    setImageMenuOpen(false);
    const alPegado = 'Pulsa Ctrl+V con la hoja enfocada y la imagen se insertará igual.';
    if (!navigator.clipboard?.read) {
      alert(`Este navegador no deja leer el portapapeles desde un botón. ${alPegado}`);
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        files.push(new File([blob], `portapapeles.${type.split('/')[1]}`, { type }));
      }
      if (files.length === 0) {
        alert('No hay ninguna imagen en el portapapeles.');
        return;
      }
      await addImages(files);
    } catch {
      alert(`No se pudo leer el portapapeles (puede que el navegador lo bloquee). ${alPegado}`);
    }
  }, [addImages]);

  // Ctrl+V sobre la hoja: una imagen se coloca en el punto de inserción, y una
  // hoja en JSON reemplaza la hoja entera. Se ignora mientras se edita una
  // región o se escribe en el cuadro de pegado: ahí el pegado es de texto.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;

      const files = Array.from(e.clipboardData?.files ?? []).filter(isImageFile);
      if (files.length > 0) {
        e.preventDefault();
        void addImages(files);
        return;
      }

      const texto = e.clipboardData?.getData('text/plain');
      if (!texto) return;

      // Un trozo de hoja copiado con Ctrl+C. Va ANTES que la hoja completa: un
      // fragmento también parsea como hoja, y cargarlo como tal borraría la
      // planilla en la que se está pegando. Lo distingue su marca `fragmento`.
      if (pegarFragmento(texto)) {
        e.preventDefault();
        return;
      }

      // Una planilla recién salida de un chat. Solo se intercepta si el texto de
      // verdad parsea como hoja: cualquier otro pegado sigue su camino, y así
      // esto no le roba el Ctrl+V a nada.
      const data = parsearHoja(texto);
      if (!data) return;
      e.preventDefault();
      cargarHoja(data);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addImages, cargarHoja, pegarFragmento]);

  /**
   * Descarga la hoja como JSON.
   *
   * Definido aquí arriba, y no junto al botón que lo usa, porque el manejador
   * de teclado lo necesita para el Ctrl+S y no puede referirse a una `const`
   * declarada más abajo.
   *
   * Delega en `descargarHoja` en vez de repetir el baile del blob: esa copia
   * llevaba el fallo clásico de Firefox —enlace fuera del DOM y
   * `revokeObjectURL` síncrono— y con dos rutas de descarga en la aplicación,
   * arreglar una sola habría sido peor que no arreglar ninguna.
   */
  const exportJson = useCallback(() => {
    descargarHoja({ version: 1, regions }, 'hoja-calculo.json');
  }, [regions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const enCampo = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

      // Escape va ANTES de cualquier guard, porque es la salida de todos ellos:
      // estaba interceptado por el de los campos y por el de los menús, así que
      // no cerraba el cuadro de «Pegar JSON» —cuyo textarea tiene `autoFocus`—
      // ni el menú de imagen, y había que llegar con el ratón hasta «Cancelar».
      //
      // El Escape de una región en edición NO llega hasta aquí: su `onKeyDown`
      // lo detiene, y ahí descarta lo escrito.
      if (e.key === 'Escape') {
        if (pasteOpen) {
          e.preventDefault();
          setPasteOpen(false);
          return;
        }
        if (imageMenuOpen) {
          e.preventDefault();
          setImageMenuOpen(false);
          return;
        }
        if (templatesOpen) {
          e.preventDefault();
          setTemplatesOpen(false);
          return;
        }
        if (enCampo) return;
        // Y si no hay nada abierto, retira las capas y la selección, de la más
        // superficial a la más de fondo: una pulsación, una cosa.
        e.preventDefault();
        if (showOrden) setShowOrden(false);
        else if (showVars) setShowVars(false);
        else if (showSecciones) setShowSecciones(false);
        else if (selected.size > 0) seleccionar(new Set());
        else setInsertAt(null);
        return;
      }

      if (enCampo) return;
      // Con un menú o el cuadro de pegado abiertos, el teclado es de ellos.
      if (templatesOpen || imageMenuOpen || pasteOpen) return;

      // Ctrl+S: el reflejo de cualquiera en una herramienta de planillas. Sin
      // interceptarlo, el navegador abre su «Guardar página» y deja un .html
      // que no sirve para nada.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        exportJson();
        return;
      }

      // Deshacer / rehacer. Va antes que nada: es la salida de cualquier otra
      // tecla que haya hecho un estropicio.
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) {
          e.preventDefault();
          historial.deshacer();
          return;
        }
        if (k === 'y' || (k === 'z' && e.shiftKey)) {
          e.preventDefault();
          historial.rehacer();
          return;
        }
        if (k === 'a') {
          e.preventDefault();
          seleccionar(new Set(regionsRef.current.map((r) => r.id)));
          return;
        }
        if ((k === 'c' || k === 'x') && selected.size > 0) {
          e.preventDefault();
          // El corte espera a que la copia esté confirmada. `selected` se
          // congela aquí porque el borrado ocurre un turno después.
          const ids = new Set(selected);
          const cortar = k === 'x';
          void copiarSeleccion(ids).then((n) => {
            if (n === null) {
              setAviso({
                texto: cortar
                  ? 'No se pudo escribir en el portapapeles: no se cortó nada. Usa «Exportar» para llevarte la hoja.'
                  : 'No se pudo escribir en el portapapeles. Usa «Exportar» para llevarte la hoja.',
                malo: true,
              });
              return;
            }
            if (cortar) {
              setRegions((prev) => prev.filter((r) => !ids.has(r.id)));
              seleccionar(new Set());
            }
            const verbo = cortar ? 'cortado' : 'copiado';
            setAviso({
              texto:
                n === 1
                  ? `Un bloque ${verbo} al portapapeles.`
                  : `${n} bloques ${verbo}s al portapapeles.`,
            });
          });
          return;
        }
        if (k === 'd' && selected.size > 0) {
          e.preventDefault();
          duplicarSeleccion(selected);
          return;
        }
      }

      // Supr/Retroceso elimina la selección (fuera de edición).
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // El `preventDefault` va aunque no haya nada que borrar: donde
        // Retroceso todavía navegue hacia atrás, pulsarlo sin selección sacaba
        // al usuario del canvas y se llevaba por delante lo no guardado.
        e.preventDefault();
        if (selected.size === 0) return;
        setRegions((prev) => prev.filter((r) => !selected.has(r.id)));
        seleccionar(new Set());
        return;
      }

      // Enter en el punto de inserción abre una línea de espacio.
      //
      // Va antes del guard de abajo porque ese descarta todo lo que no sea una
      // tecla de un carácter, y `'Enter'.length` es 5: hasta ahora Enter sobre
      // el lienzo no hacía absolutamente nada.
      //
      // Solo con el punto fijado: sin él no hay dónde abrir el hueco, y hacerlo
      // «al final de la hoja» no es lo que nadie espera de un Enter.
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        if (!insertRef.current) return;
        e.preventDefault();
        insertarEspacio();
        return;
      }

      // Teclear sin nada en edición abre una fórmula en el punto de inserción
      // con ese primer carácter: es el camino rápido al bloque más frecuente,
      // ahora que el clic ya no crea uno por sí solo.
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      // ...salvo con el foco en un control, donde el teclado es suyo. El caso
      // que importa es el Espacio: mide un carácter, así que pulsarlo sobre un
      // botón de la barra al que se llegó con Tab no lo activaba — insertaba un
      // bloque con un espacio dentro, y la barra quedaba inoperable desde el
      // teclado. El guard va AQUÍ y no arriba para que Ctrl+Z, Supr y compañía
      // sigan funcionando con el foco en un botón, que es lo esperable.
      if (
        el instanceof HTMLButtonElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLAnchorElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      insertRegion('math', e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    selected,
    insertRegion,
    templatesOpen,
    imageMenuOpen,
    pasteOpen,
    historial,
    seleccionar,
    copiarSeleccion,
    duplicarSeleccion,
    exportJson,
    insertarEspacio,
    showOrden,
    showVars,
    showSecciones,
  ]);

  const insertSymbol = useCallback(
    (entry: SymbolEntry) => {
      const el = activeInputRef.current;
      if (!el || !activeId) return;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;

      // Los snippets multilínea (bloques de programa) se re-indentan según la
      // sangría de la línea actual, para que queden bien anidados al insertarlos
      // dentro de otro bloque.
      let text = entry.insert;
      if (text.includes('\n')) {
        const lineStart = el.value.lastIndexOf('\n', start - 1) + 1;
        const indent = el.value.slice(lineStart, start).match(/^\s*/)?.[0] ?? '';
        if (indent) text = text.replace(/\n/g, `\n${indent}`);
      }

      const next = el.value.slice(0, start) + text + el.value.slice(end);
      updateRegion(activeId, { src: next });

      // Selección tras insertar: si el snippet tiene placeholder, seleccionarlo
      // (para teclear encima); si no, posicionar el cursor según `caret`.
      let selStart = start + (entry.caret ?? text.length);
      let selEnd = selStart;
      if (entry.select) {
        const idx = text.indexOf(entry.select);
        if (idx >= 0) {
          selStart = start + idx;
          selEnd = selStart + entry.select.length;
        }
      }
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(selStart, selEnd);
      });
    },
    [activeId, updateRegion],
  );

  const loadTemplate = (tpl: Template) => {
    setTemplatesOpen(false);
    cargarHoja(tpl, { titulo: tpl.titulo });
  };

  const importJson = (file: File) => {
    file
      .text()
      .then((text) => {
        const data = parsearHoja(text);
        if (!data) {
          setAviso({ texto: `«${file.name}» no es una hoja de cálculo válida.`, malo: true });
          return;
        }
        cargarHoja(data);
      })
      // Sin esto, un archivo que el navegador no puede leer —movido o borrado
      // tras elegirlo en el diálogo, una unidad de red caída— dejaba una promesa
      // rechazada y ningún mensaje: el diálogo se cerraba y no pasaba nada, así
      // que parecía que la hoja se había importado vacía.
      .catch(() => {
        setAviso({ texto: `No se pudo leer «${file.name}».`, malo: true });
      });
  };

  /**
   * Carga la hoja que el usuario pegó en el cuadro «Pegar JSON». Es la vía para
   * una planilla recién salida de una conversación, que todavía no es un archivo
   * ni está publicada en `public/planillas/`.
   */
  const cargarPegado = () => {
    const data = parsearHoja(pasteText);
    if (!data) {
      setPasteError(
        'Eso no parece una hoja del canvas. Se espera un JSON con la forma ' +
          '{"version": 1, "regions": [...]}.',
      );
      return;
    }
    if (cargarHoja(data)) {
      setPasteOpen(false);
      setPasteText('');
      setPasteError(null);
    }
  };

  return (
    <>
    <div className="app-screen flex h-full w-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface/80 px-3 py-2">
        <Enlace
          a={{ vista: 'inicio' }}
          className={`${toolBtn} no-underline`}
          title="Volver al menú"
        >
          ← Inicio
        </Enlace>
        <span className="mx-0.5 h-5 w-px bg-border" />
        <button
          className={toolBtn}
          onClick={() => insertRegion('math')}
          title="Inserta una fórmula en el punto de inserción (también: doble clic en la hoja, o teclea directamente)"
        >
          = Fórmula
        </button>
        <button
          className={toolBtn}
          onClick={() => insertRegion('text')}
          title="Inserta un bloque de texto en el punto de inserción"
        >
          T Texto
        </button>
        <button
          className={toolBtn}
          onClick={() => insertRegion('program')}
          title="Inserta un bloque de programa en el punto de inserción"
        >
          ƒ Programa
        </button>
        <div className="relative">
          <button
            className={`${toolBtn} ${imageMenuOpen ? '!border-accent !text-accent' : ''}`}
            onClick={() => setImageMenuOpen((o) => !o)}
            title="Inserta una imagen en el punto de inserción (también: Ctrl+V, o arrastrar el archivo a la hoja)"
          >
            ▣ Imagen ▾
          </button>
          {imageMenuOpen && (
            <>
              {/* Capa para cerrar el menú al hacer clic fuera. */}
              <div className="fixed inset-0 z-30" onClick={() => setImageMenuOpen(false)} />
              <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded border border-border bg-white py-1 shadow-lg">
                <button
                  className="block w-full px-3 py-1.5 text-left hover:bg-accent/10"
                  onClick={pasteFromClipboard}
                >
                  <span className="block text-xs font-medium text-ink">Desde el portapapeles</span>
                  <span className="block text-[10px] text-muted">
                    Lo mismo que pulsar Ctrl+V sobre la hoja
                  </span>
                </button>
                <button
                  className="block w-full px-3 py-1.5 text-left hover:bg-accent/10"
                  onClick={() => {
                    setImageMenuOpen(false);
                    imageFileRef.current?.click();
                  }}
                >
                  <span className="block text-xs font-medium text-ink">Desde un archivo…</span>
                  <span className="block text-[10px] text-muted">
                    Abre el explorador; también sirve arrastrarlo a la hoja
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
        <input
          ref={imageFileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void addImages(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <span className="mx-1 h-4 w-px bg-border" />
        <button
          className={`${toolBtn} disabled:opacity-40 disabled:hover:border-border disabled:hover:text-ink`}
          onClick={historial.deshacer}
          disabled={!historial.puedeDeshacer}
          title="Deshacer (Ctrl+Z)"
          aria-label="Deshacer"
        >
          ↶
        </button>
        <button
          className={`${toolBtn} disabled:opacity-40 disabled:hover:border-border disabled:hover:text-ink`}
          onClick={historial.rehacer}
          disabled={!historial.puedeRehacer}
          title="Rehacer (Ctrl+Y)"
          aria-label="Rehacer"
        >
          ↷
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        <div className="relative">
          <button
            className={`${toolBtn} ${templatesOpen ? '!border-accent !text-accent' : ''}`}
            onClick={() => setTemplatesOpen((o) => !o)}
            title="Plantillas para empezar y memorias de cálculo ya resueltas"
          >
            Ejemplos ▾
          </button>
          {templatesOpen && (
            <CatalogoMenu
              plantillas={TEMPLATES}
              onPlantilla={(tpl) => loadTemplate(tpl)}
              onPlanilla={(slug) => {
                setTemplatesOpen(false);
                cargarPlanilla(slug);
              }}
              onCerrar={() => setTemplatesOpen(false)}
            />
          )}
        </div>
        <button
          className={`${toolBtn} ${selected.size === 0 ? 'opacity-40' : ''}`}
          disabled={selected.size === 0}
          onClick={toggleSalto}
          title={
            selected.size === 0
              ? 'Selecciona una región y este botón hará que empiece en una página nueva al imprimir'
              : 'La región seleccionada abre página nueva al imprimir (vuelve a pulsarlo para quitarlo)'
          }
        >
          ⇱ Salto de página
        </button>
        <button
          className={toolBtn}
          onClick={() => window.print()}
          title="Genera un documento limpio de la planilla para imprimir o guardar como PDF (memoria de cálculo)"
        >
          Imprimir / PDF
          {paginacion.paginas.length > 0 && (
            <span className="ml-1 text-muted">
              ({paginacion.paginas.length} {paginacion.paginas.length === 1 ? 'pág.' : 'págs.'})
            </span>
          )}
        </button>
        <button
          className={`${toolBtn} ${showOrden ? 'bg-ink/10' : ''}`}
          onClick={() => setShowOrden((v) => !v)}
          aria-pressed={showOrden}
          title="Numera los bloques en el orden en que el motor los evalúa (arriba→abajo, luego izquierda→derecha). Las regiones de texto no cuentan."
        >
          ① Orden de lectura
        </button>
        <button
          className={`${toolBtn} ${showSecciones ? 'bg-ink/10' : ''}`}
          onClick={() => setShowSecciones((v) => !v)}
          aria-pressed={showSecciones}
          title="Índice de la hoja: sus encabezados («# », «## », «### » al principio de un bloque de texto); al pulsar uno, salta a esa sección"
        >
          ☰ Secciones
        </button>
        <button
          className={`${toolBtn} ${showVars ? 'bg-ink/10' : ''}`}
          onClick={() => setShowVars((v) => !v)}
          aria-pressed={showVars}
          title="Lista las variables de la hoja con su valor; al pulsar una, salta a donde se define"
        >
          𝑥 Variables
        </button>
        <button className={toolBtn} onClick={exportJson}>
          Exportar
        </button>
        <button className={toolBtn} onClick={() => fileRef.current?.click()}>
          Importar
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importJson(f);
            e.target.value = '';
          }}
        />
        <button
          className={`${toolBtn} ${pasteOpen ? '!border-accent !text-accent' : ''}`}
          onClick={() => {
            setPasteError(null);
            setPasteOpen((o) => !o);
          }}
          title="Pega una planilla en JSON (por ejemplo, la que te acaba de dar un chat) sin pasar por un archivo"
        >
          Pegar JSON
        </button>
        <button
          className={`${toolBtn} hover:!border-red-400 hover:!text-red-600`}
          onClick={() => {
            if (confirm('¿Vaciar toda la hoja?')) {
              setRegions([]);
              seleccionar(new Set());
              setActiveId(null);
              setInsertAt(null);
            }
          }}
        >
          Limpiar
        </button>
        <span className="ml-auto hidden text-xs text-muted sm:block">
          Clic: fija el punto · arrastrar el fondo: seleccionar · doble clic: fórmula ·
          Ctrl+C/V: copiar bloques · Supr: borrar
        </span>
      </div>

      {pasteOpen && (
        <div className="border-b border-border bg-surface/60 px-3 py-2">
          <label className="block text-xs font-medium text-ink" htmlFor="pegar-hoja">
            Pega aquí la planilla en JSON
          </label>
          <p className="mt-0.5 text-[11px] text-muted">
            El formato es <code>{'{"version": 1, "regions": [...]}'}</code> — el mismo que
            produce «Exportar». Reemplaza la hoja actual. Si viene de un chat, todavía es un
            borrador: verifícala con <code>npm run verify:planilla</code>.
          </p>
          <textarea
            id="pegar-hoja"
            className="mt-1.5 h-32 w-full resize-y rounded border border-border bg-white px-2 py-1.5 font-mono text-[11px] text-ink"
            placeholder={'{\n  "version": 1,\n  "regions": [ … ]\n}'}
            value={pasteText}
            onChange={(e) => {
              setPasteText(e.target.value);
              setPasteError(null);
            }}
            autoFocus
          />
          {pasteError && <p className="mt-1 text-[11px] text-red-600">{pasteError}</p>}
          <div className="mt-1.5 flex items-center gap-2">
            <button
              className={`${toolBtn} ${pasteText.trim() === '' ? 'opacity-40' : ''}`}
              disabled={pasteText.trim() === ''}
              onClick={cargarPegado}
            >
              Cargar en la hoja
            </button>
            <button
              className={toolBtn}
              onClick={() => {
                setPasteOpen(false);
                setPasteText('');
                setPasteError(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* El ancla de los avisos. Existe para que la pila se posicione contra el
            VISOR del lienzo: dentro del contenedor con scroll se desplazaría con
            el contenido, y sobre la fila entera se metería debajo de la paleta. */}
        <div className="relative flex min-w-0 flex-1">
          {/* Los avisos flotan, no empujan.
              Eran cinco franjas hermanas de esta fila, que es la única con
              `flex-1`: cada una que se montaba le robaba alto al visor y el papel
              daba un salto. Y la del acuse lo hacía DOS veces, al entrar y al
              salir, porque se retira sola a los 2,5 s.
              Flotan arriba a la derecha porque ahí no tapan nada: el papel ocupa
              los primeros 680 px de un lienzo de 1600. La pila no recibe punteros
              —el hueco entre tarjetas tiene que dejar pasar el clic que fija el
              punto de inserción—; cada tarjeta sí. */}
          <div className="pointer-events-none absolute right-3 top-3 z-40 flex w-[22rem] max-w-[calc(100%-1.5rem)] flex-col gap-1.5">
            {paginacion.largos.length > 0 && (
              <div className={`${tarjetaAviso} border-amber-300 bg-amber-50 text-amber-900`}>
                ⚠ {paginacion.largos.length === 1 ? 'Un bloque es' : `${paginacion.largos.length} bloques son`}{' '}
                más alto que una A4 completa: al imprimir se desborda de la página. Suele ser una
                figura — achícala arrastrando su esquina.
              </div>
            )}

            {solapes.length > 0 && (
              <div className={`${tarjetaAviso} border-amber-300 bg-amber-50 text-amber-900`}>
                <span>
                  {/* La concordancia va entera en el ternario: partida, el plural
                      se colaba en el singular («Un bloque queda tapados»). */}
                  ⚠{' '}
                  {solapes.length === 1
                    ? 'Un bloque queda tapado por el de arriba.'
                    : `${solapes.length} bloques quedan tapados por los de arriba.`}{' '}
                  Suele pasar cuando un bloque de programa crece y el de abajo ya estaba
                  colocado.
                </span>
                <button
                  className="mt-1.5 self-end rounded border border-amber-400 px-2 py-0.5 font-medium hover:bg-amber-100"
                  onClick={separar}
                  title="Empuja hacia abajo lo justo para que no se pisen. Se deshace con Ctrl+Z."
                >
                  Separarlos
                </button>
              </div>
            )}

            {storageWarn && (
              <div className={`${tarjetaAviso} border-amber-300 bg-amber-50 text-amber-900`}>
                <span>⚠ {storageWarn}</span>
                <button className="mt-1.5 self-end underline" onClick={() => setStorageWarn(null)}>
                  Ocultar
                </button>
              </div>
            )}

            {apartada && (
              <div className={`${tarjetaAviso} border-amber-300 bg-amber-50 text-amber-900`}>
                <span>
                  ⚠ La hoja que había guardada <strong>no se pudo leer</strong> y se abrió el
                  ejemplo. La copia sin tocar quedó en <code>{CLAVE_APARTADA}</code> del
                  almacenamiento local del navegador, por si hay algo que rescatar.
                </span>
                <button className="mt-1.5 self-end underline" onClick={() => setApartada(false)}>
                  Entendido
                </button>
              </div>
            )}

            {aviso && (
              <div
                role="status"
                aria-live="polite"
                className={`${tarjetaAviso} ${
                  aviso.malo
                    ? 'border-red-300 bg-red-50 text-red-900'
                    : 'border-border bg-surface text-muted'
                }`}
              >
                {aviso.malo ? '⚠ ' : ''}
                {aviso.texto}
              </div>
            )}
          </div>

          {/* El fondo deja de ser blanco: el blanco pasa a ser el papel, que es
              lo que lo hace legible como papel y no como un plano infinito. */}
          <div ref={scrollRef} className="relative flex-1 overflow-auto bg-slate-100">
            <div
              ref={sheetRef}
              // `select-none`: sin esto, arrastrar un marco sobre el fondo empieza
              // también una selección de texto del navegador y la hoja se pinta de
              // azul por debajo del marco.
              // `doc-papel`: la hoja adopta la tipografía del papel, que es lo
              // que hace que un bloque mida en pantalla lo que va a medir impreso.
              className={`doc-papel relative cursor-crosshair select-none ${dropping ? 'ring-2 ring-inset ring-accent' : ''}`}
              style={{
                minWidth: '100%',
                minHeight: '100%',
                width: 1600,
                // Sitio para el margen izquierdo del papel, que cae en `x`
                // negativa: el área útil está en 40 y el borde de la hoja 56,7
                // px más a la izquierda. `sheetPoint()` mide contra este mismo
                // elemento, así que correrlo no desalinea el mapeo del clic.
                marginLeft: DESPLAZAMIENTO_LIENZO,
                // Crece para acomodar plantillas largas (deja margen tras la
                // última región). Un bloque ocupa hacia abajo su ALTO MEDIDO, no
                // solo su `y`: con `r.h` —que solo declaran las imágenes— un
                // bloque de programa al final de la hoja se quedaba fuera del
                // lienzo y el scroll no llegaba a él. En el corpus los hay de
                // 600 px, y el margen de 240 no los cubre.
                // El lienzo llega hasta el pie de la última hoja dibujada, más
                // un respiro. Si se quedara en el último bloque, el scroll no
                // alcanzaría el resto de la página en la que se está
                // escribiendo.
                height: Math.max(1400, fondoDelPapel + 120),
                // La cuadrícula ya no cubre el lienzo entero: se dibuja dentro
                // del área útil del papel (`SiluetaPapel`), que es donde dice
                // algo. Fuera del papel solo era textura.
              }}
              onPointerDown={onHojaPointerDown}
              onPointerMove={onHojaPointerMove}
              onPointerUp={onHojaPointerUp}
              onPointerCancel={onHojaPointerUp}
              onDoubleClick={(e) => {
                // Camino rápido al bloque más frecuente. El `click` previo ya dejó
                // el punto de inserción justo aquí.
                if (e.target !== e.currentTarget) return;
                insertRegion('math');
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes('Files')) return;
                e.preventDefault();
                setDropping(true);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                setDropping(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDropping(false);
                void addImages(Array.from(e.dataTransfer.files), sheetPoint(e));
              }}
            >
              {/* El papel: dónde está la hoja, dónde su margen y dónde parte la
                  página. Va la primera y en `z-0`, por debajo de todo lo demás. */}
              <SiluetaPapel marcas={marcasDeCorte} fondo={fondoDeLaHoja} />

              {/* Cortes de página A4: dónde parte la hoja al imprimir. Van bajo
                  las regiones (z-0) para no estorbar el clic ni tapar nada. El
                  salto forzado por el autor se dibuja lleno; el automático,
                  punteado — la diferencia importa, porque uno se respeta y el
                  otro se mueve solo al editar más arriba. */}
              {marcasDeCorte.map((m) => (
                <div
                  key={`corte-${m.pagina}`}
                  className="pointer-events-none absolute z-0 flex items-center gap-2"
                  // La línea cruza el papel de lado a lado y el rótulo queda
                  // fuera, a su derecha: dentro taparía la primera línea de la
                  // página que anuncia, que es contenido.
                  style={{ top: m.y - 10, left: IZQUIERDA_HOJA, width: ANCHO_HOJA + 110 }}
                >
                  <span
                    className={`h-px flex-1 ${
                      m.forzado ? 'bg-accent/60' : 'border-t border-dashed border-accent/50'
                    }`}
                  />
                  <span className="whitespace-nowrap rounded-sm bg-accent/10 px-1.5 py-px text-[10px] leading-tight text-accent/80">
                    {m.forzado ? '⇱ ' : ''}página {m.pagina}
                  </span>
                </div>
              ))}

              {/* Orden de lectura: el número que le toca a cada bloque en la
                  cadena de cálculo, para poder comprobar de un vistazo una
                  disposición a dos columnas antes de confiar en ella. */}
              {ordenDeLectura &&
                regions.map((r) =>
                  ordenDeLectura.has(r.id) ? (
                    <span
                      key={`orden-${r.id}`}
                      className="pointer-events-none absolute z-30 -translate-x-full rounded-sm bg-accent/15 px-1 text-[10px] leading-tight text-accent"
                      style={{ left: r.x - 4, top: r.y }}
                    >
                      {ordenDeLectura.get(r.id)}
                    </span>
                  ) : null,
                )}

              {/* Marco de selección: lo que toque queda seleccionado al soltar. */}
              {marco && (
                <div
                  className="pointer-events-none absolute z-30 border border-accent bg-accent/10"
                  style={{ left: marco.x, top: marco.y, width: marco.w, height: marco.h }}
                />
              )}

              {/* Punto de inserción: barra tipo cursor de texto. Se esconde
                  mientras se edita una región, donde solo sería ruido. */}
              {insertAt && !activeId && (
                <div
                  className="pointer-events-none absolute flex items-center gap-1"
                  style={{ left: insertAt.x, top: insertAt.y }}
                >
                  <span className="block h-6 w-0.5 animate-pulse bg-accent" />
                  <span className="text-[10px] leading-none text-accent/60">
                    teclea o elige un bloque
                  </span>
                </div>
              )}

              {regions.map((r) => (
                <MathRegion
                  key={r.id}
                  region={r}
                  result={results[r.id]}
                  active={activeId === r.id}
                  selected={selected.has(r.id)}
                  tapada={tapadas.has(r.id)}
                  titulo={r.id === idTitulo}
                  onChange={(src) => updateRegion(r.id, { src })}
                  onCommit={commitActive}
                  onActivate={() => {
                    seleccionar(new Set());
                    setActiveId(r.id);
                  }}
                  onSelect={(additive) => {
                    const prev = selectedRef.current;
                    const next = new Set(additive ? prev : []);
                    if (additive && prev.has(r.id)) next.delete(r.id);
                    else next.add(r.id);
                    seleccionar(next);
                  }}
                  onDragStart={(additive) => empezarArrastre(r.id, additive)}
                  onDrag={moverArrastre}
                  onDragEnd={terminarArrastre}
                  onResize={(w, h) => updateRegion(r.id, { w, h })}
                  registerInput={(el) => {
                    // Solo registrar montajes; insertSymbol ya valida que haya
                    // región activa, así que una referencia obsoleta es inocua.
                    if (el) activeInputRef.current = el;
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        {showSecciones && (
          <SeccionesPanel regions={regions} idTitulo={idTitulo} onIr={irARegion} />
        )}
        {showVars && (
          <VariablePanel regions={regions} results={results} onIr={irARegion} />
        )}
        <SymbolPalette
          onInsert={insertSymbol}
          activeKind={activeId ? (regions.find((r) => r.id === activeId)?.kind ?? null) : null}
        />
      </div>
    </div>
    <WorksheetPrint regions={regions} results={results} />
    </>
  );
}
