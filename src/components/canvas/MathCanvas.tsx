import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MathRegion, { GRID, snap } from './MathRegion';
import SymbolPalette, { type SymbolEntry } from './SymbolPalette';
import WorksheetPrint from './WorksheetPrint';
import { usePaginacion } from './usePaginacion';
import { evaluateSheet, type Region, type RegionKind } from '../../lib/worksheet';
import { TEMPLATES, type Template } from '../../lib/worksheet-templates';
import {
  IMAGE_WARN_BYTES,
  fileToImagePayload,
  fitToSheet,
  isImageFile,
} from '../../lib/canvas-image';

const STORAGE_KEY = 'structpad.worksheet.v1';

/** Hoja de ejemplo para la primera visita (se reemplaza al editar). */
const DEMO: Region[] = [
  { id: 'demo-t', kind: 'text', x: 32, y: 32, src: 'Ejemplo: momento máximo de una viga biapoyada' },
  { id: 'demo-1', kind: 'math', x: 32, y: 80, src: 'F := 30 kN' },
  { id: 'demo-2', kind: 'math', x: 32, y: 128, src: 'L := 6 m' },
  { id: 'demo-3', kind: 'math', x: 32, y: 176, src: 'M := F*L/4 = kN*m' },
  { id: 'demo-4', kind: 'math', x: 32, y: 224, src: 'M <= 60 kN*m =' },
];

function loadInitial(): Region[] {
  if (typeof window === 'undefined') return DEMO;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data?.regions)) {
        return (data.regions as Region[]).filter((r) => r.src.trim() !== '');
      }
    }
  } catch {
    // JSON corrupto: arrancar con la demo
  }
  return DEMO;
}

const newId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * ¿Hay trabajo guardado que un deep-link estaría a punto de pisar? Se consulta
 * el `localStorage` y no el estado, porque los deep-links corren en el primer
 * render, antes de que el usuario haya tocado nada.
 */
function hasStoredWork(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    return Array.isArray(data?.regions) && data.regions.some((r: Region) => r.src?.trim());
  } catch {
    return false;
  }
}

/**
 * ¿Tiene forma de hoja del canvas? Es todo lo que se exige para cargarla: un
 * `regions` que sea array. Las regiones malformadas de dentro las delata el
 * motor con un error visible en su región, que es mejor que un rechazo opaco
 * del archivo entero.
 */
function esHoja(data: unknown): data is { regions: Region[]; meta?: { titulo?: string } } {
  return Array.isArray((data as { regions?: unknown } | null)?.regions);
}

/**
 * Parsea el texto de una hoja —de un archivo o del portapapeles— y devuelve null
 * si no tiene forma de hoja.
 *
 * Tolera la valla de código porque la vía principal es pegar desde un chat, y ahí
 * los ```json vienen pegados al JSON más veces de las que no. Rechazarlo por eso
 * sería un no gratuito.
 */
function parsearHoja(text: string): { regions: Region[]; meta?: { titulo?: string } } | null {
  let limpio = text.trim();
  const valla = /^```[a-z]*\s*\n([\s\S]*?)\n?\s*```$/i.exec(limpio);
  if (valla) limpio = valla[1].trim();
  try {
    const data: unknown = JSON.parse(limpio);
    return esHoja(data) ? data : null;
  } catch {
    return null;
  }
}

const toolBtn =
  'whitespace-nowrap rounded border border-border bg-white px-2.5 py-1 text-xs font-medium text-ink hover:border-accent hover:text-accent';

export default function MathCanvas() {
  const [regions, setRegions] = useState<Region[]>(loadInitial);
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
  /** Hay un archivo sobrevolando la hoja (realce de la zona de soltado). */
  const [dropping, setDropping] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  const activeInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);

  // Espejos en ref del punto de inserción y de las regiones: los manejadores de
  // pegado y de teclado se suscriben una sola vez y necesitan el valor vigente
  // sin volver a suscribirse en cada pulsación.
  const insertRef = useRef(insertAt);
  const regionsRef = useRef(regions);
  useEffect(() => {
    insertRef.current = insertAt;
  }, [insertAt]);
  useEffect(() => {
    regionsRef.current = regions;
  }, [regions]);

  const results = useMemo(() => evaluateSheet(regions), [regions]);

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
   * nada: ahí lo que vale es `hasStoredWork()`. Una acción dentro de la app sí
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
      // Se clonan las regiones: una plantilla de la galería es un objeto
      // compartido y editarla en la hoja no debe mutarlo.
      setRegions(data.regions.map((r) => ({ ...r })));
      setSelected(new Set());
      setActiveId(null);
      setInsertAt(null);
      return true;
    },
    [],
  );

  // Deep-link: /herramientas/canvas?plantilla=<id> abre esa plantilla al entrar.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('plantilla');
    if (!id) return;
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    cargarHoja(tpl, { titulo: tpl.titulo, hayTrabajo: hasStoredWork() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link: /herramientas/canvas?planilla=<slug> importa `/planillas/<slug>.json`.
  //
  // Es la vía para las planillas publicadas junto a los posts. A diferencia de
  // `?plantilla=`, que sirve la galería compilada en `worksheet-templates.ts`,
  // estas viven como archivo suelto en `public/planillas/`: se acumulan sin
  // tocar el bundle, se descargan como JSON y se verifican fuera del navegador
  // con `npm run verify:planilla`. El slug se valida contra [a-z0-9-] para que
  // el parámetro no pueda apuntar a otra ruta.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('planilla');
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) return;
    let cancelled = false;
    fetch(`/planillas/${slug}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (cancelled) return;
        if (!Array.isArray(data?.regions)) throw new Error('formato inválido');
        const titulo = typeof data?.meta?.titulo === 'string' ? data.meta.titulo : slug;
        cargarHoja(data, { titulo, hayTrabajo: hasStoredWork() });
      })
      .catch(() => {
        if (!cancelled) alert(`No se pudo cargar la planilla «${slug}».`);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autoguardado con debounce.
  //
  // El fallo NO es silencioso: una hoja con imágenes pegadas puede superar la
  // cuota de `localStorage` (~5 MB), y a partir de ahí todo lo que el usuario
  // escriba se perdería al recargar sin que nada lo indique.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        // Las regiones vacías son transitorias (se borran al salir de edición):
        // no se persisten por si la página se cierra con una a medio crear.
        const persistable = regions.filter((r) => r.src.trim() !== '');
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, regions: persistable }));
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
    }, 300);
    return () => clearTimeout(t);
  }, [regions]);

  const updateRegion = useCallback((id: string, patch: Partial<Region>) => {
    setRegions((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const commitActive = useCallback(() => {
    if (activeId) {
      // Una región que queda vacía al salir de edición se elimina.
      setRegions((prev) => prev.filter((r) => r.id !== activeId || r.src.trim() !== ''));
    }
    setActiveId(null);
  }, [activeId]);

  /** Coordenadas del puntero relativas a la hoja. */
  const sheetPoint = (e: { clientX: number; clientY: number }) => {
    const rect = sheetRef.current?.getBoundingClientRect();
    if (!rect) return { x: 32, y: 32 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  /**
   * Dónde cae el próximo bloque: el punto fijado con el clic o, si aún no se ha
   * fijado ninguno, el final de la hoja (así el primer botón pulsado nunca
   * escribe encima de lo que ya hay).
   */
  const nextSpot = useCallback((): { x: number; y: number } => {
    if (insertRef.current) return insertRef.current;
    const rs = regionsRef.current;
    const maxY = rs.length ? Math.max(...rs.map((r) => r.y + (r.h ?? 0))) : 0;
    return { x: 32, y: snap(maxY + 48) };
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
      setSelected(new Set());
      setActiveId(region.id);
      setInsertAt({ x: snap(x), y: snap(y) + (kind === 'program' ? 5 * GRID : 3 * GRID) });
    },
    [nextSpot],
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
        setSelected(new Set([region.id]));
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
    [nextSpot],
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

      // Una planilla recién salida de un chat. Solo se intercepta si el texto de
      // verdad parsea como hoja: cualquier otro pegado sigue su camino, y así
      // esto no le roba el Ctrl+V a nada.
      const texto = e.clipboardData?.getData('text/plain');
      if (!texto) return;
      const data = parsearHoja(texto);
      if (!data) return;
      e.preventDefault();
      cargarHoja(data);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addImages, cargarHoja]);

  /**
   * Clic izquierdo en la hoja: solo fija el punto de inserción. No crea nada,
   * para poder elegir el sitio primero y el tipo de bloque después (con los
   * botones de la barra, tecleando, o con doble clic para una fórmula).
   */
  const onSheetClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    setSelected(new Set());
    const p = sheetPoint(e);
    setInsertAt({ x: snap(p.x), y: snap(p.y - GRID / 2) });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      // Con un menú o el cuadro de pegado abiertos, el teclado es de ellos.
      if (templatesOpen || imageMenuOpen || pasteOpen) return;

      // Supr/Retroceso elimina la selección (fuera de edición).
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected.size === 0) return;
        e.preventDefault();
        setRegions((prev) => prev.filter((r) => !selected.has(r.id)));
        setSelected(new Set());
        return;
      }

      // Teclear sin nada en edición abre una fórmula en el punto de inserción
      // con ese primer carácter: es el camino rápido al bloque más frecuente,
      // ahora que el clic ya no crea uno por sí solo.
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      e.preventDefault();
      insertRegion('math', e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, insertRegion, templatesOpen, imageMenuOpen, pasteOpen]);

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

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ version: 1, regions }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hoja-calculo.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadTemplate = (tpl: Template) => {
    setTemplatesOpen(false);
    cargarHoja(tpl, { titulo: tpl.titulo });
  };

  const importJson = (file: File) => {
    file.text().then((text) => {
      const data = parsearHoja(text);
      if (!data) {
        alert('El archivo no es una hoja de cálculo válida.');
        return;
      }
      cargarHoja(data);
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
        <div className="relative">
          <button
            className={`${toolBtn} ${templatesOpen ? '!border-accent !text-accent' : ''}`}
            onClick={() => setTemplatesOpen((o) => !o)}
            title="Cargar una planilla de diseño"
          >
            Plantillas ▾
          </button>
          {templatesOpen && (
            <>
              {/* Capa para cerrar el menú al hacer clic fuera. */}
              <div className="fixed inset-0 z-30" onClick={() => setTemplatesOpen(false)} />
              <div className="absolute left-0 top-full z-40 mt-1 w-72 rounded border border-border bg-white py-1 shadow-lg">
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    className="block w-full px-3 py-1.5 text-left hover:bg-accent/10"
                    onClick={() => loadTemplate(tpl)}
                  >
                    <span className="block text-xs font-medium text-ink">{tpl.titulo}</span>
                    <span className="block text-[10px] text-muted">{tpl.norma}</span>
                  </button>
                ))}
              </div>
            </>
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
              setSelected(new Set());
              setActiveId(null);
              setInsertAt(null);
            }
          }}
        >
          Limpiar
        </button>
        <span className="ml-auto hidden text-xs text-muted sm:block">
          Clic: fija el punto · doble clic: fórmula · Ctrl+V: imagen o planilla · Supr: borrar
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

      {paginacion.largos.length > 0 && (
        <div className="border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          ⚠ {paginacion.largos.length === 1 ? 'Un bloque es' : `${paginacion.largos.length} bloques son`}{' '}
          más alto que una A4 completa: al imprimir se desborda de la página. Suele ser una
          figura — achícala arrastrando su esquina.
        </div>
      )}

      {storageWarn && (
        <div className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          <span>⚠ {storageWarn}</span>
          <button className="ml-auto underline" onClick={() => setStorageWarn(null)}>
            Ocultar
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="relative flex-1 overflow-auto bg-white">
          <div
            ref={sheetRef}
            className={`relative cursor-crosshair ${dropping ? 'ring-2 ring-inset ring-accent' : ''}`}
            style={{
              minWidth: '100%',
              minHeight: '100%',
              width: 1600,
              // Crece para acomodar plantillas largas (deja margen tras la última
              // región). Una imagen ocupa hacia abajo su alto, no solo su `y`.
              height: Math.max(
                1400,
                (regions.length ? Math.max(...regions.map((r) => r.y + (r.h ?? 0))) : 0) + 240,
              ),
              backgroundImage:
                'linear-gradient(to right, rgba(100,116,139,0.12) 1px, transparent 1px), ' +
                'linear-gradient(to bottom, rgba(100,116,139,0.12) 1px, transparent 1px)',
              backgroundSize: `${GRID}px ${GRID}px`,
            }}
            onClick={onSheetClick}
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
            {/* Cortes de página A4: dónde parte la hoja al imprimir. Van bajo
                las regiones (z-0) para no estorbar el clic ni tapar nada. El
                salto forzado por el autor se dibuja lleno; el automático,
                punteado — la diferencia importa, porque uno se respeta y el
                otro se mueve solo al editar más arriba. */}
            {marcasDeCorte.map((m) => (
              <div
                key={`corte-${m.pagina}`}
                className="pointer-events-none absolute left-0 right-0 z-0 flex items-center gap-2"
                style={{ top: m.y - 10 }}
              >
                {/* El rótulo va a la izquierda, no centrado: la hoja mide 1600
                    px de ancho y el contenido vive en el primer tercio, así
                    que un rótulo al medio queda fuera de lo que se está
                    mirando. */}
                <span
                  className={`ml-3 h-px w-4 ${
                    m.forzado ? 'bg-accent/60' : 'border-t border-dashed border-accent/50'
                  }`}
                />
                <span className="whitespace-nowrap rounded-sm bg-accent/10 px-1.5 py-px text-[10px] leading-tight text-accent/80">
                  {m.forzado ? '⇱ ' : ''}página {m.pagina}
                </span>
                <span
                  className={`h-px flex-1 ${
                    m.forzado ? 'bg-accent/60' : 'border-t border-dashed border-accent/50'
                  }`}
                />
              </div>
            ))}

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
                onChange={(src) => updateRegion(r.id, { src })}
                onCommit={commitActive}
                onActivate={() => {
                  setSelected(new Set());
                  setActiveId(r.id);
                }}
                onSelect={(additive) =>
                  setSelected((prev) => {
                    const next = new Set(additive ? prev : []);
                    if (additive && prev.has(r.id)) next.delete(r.id);
                    else next.add(r.id);
                    return next;
                  })
                }
                onMove={(x, y) => updateRegion(r.id, { x, y })}
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
