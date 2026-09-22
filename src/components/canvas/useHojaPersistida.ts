// ─────────────────────────────────────────────────────────────────────────────
// De dónde sale la hoja del canvas y a dónde se guarda.
//
// Estaba repartido en unos diez sitios de `MathCanvas.tsx` —la carga inicial, el
// debounce de 300 ms, el guardado al desmontar, `pagehide`, `visibilitychange`,
// el listener de `storage`, la hoja apartada y los tres avisos—, entretejido con
// el estado de la vista. Acá está junto, y detrás de una interfaz: el hook lleva
// CUÁNDO se escribe, y el origen lleva DÓNDE.
//
// Los dos consumidores comparten la forma y no una línea de implementación. En
// `/canvas` el origen es `localStorage` (`origen-local.tsx`); en una pestaña de
// una obra será la hoja de un nodo dentro del documento de la obra, que ya se
// persiste por su cuenta y por eso no necesita ni vigilancia ni vaciado al
// salir.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { Region } from '../../lib/worksheet';
import type { MetaPlanilla } from '../../lib/biblioteca/contrato';

/** Espera del autoguardado tras la última tecla. */
const PAUSA_MS = 300;

/** Lo que un origen entrega al arrancar, y al traer lo que hay fuera. */
export interface Arranque {
  regions: Region[];
  /** El `meta` de la hoja, si lo traía. */
  meta: MetaPlanilla | null;
  /** Lo que el origen quiere avisar ya al abrir (la hoja que se apartó). */
  avisos?: AvisoDelOrigen[];
}

/** Lo que se escribe, y lo que hace falta para decidir CÓMO escribirlo. */
export interface HojaParaGuardar {
  /**
   * El array TAL CUAL está en el estado, sin filtrar.
   *
   * Va aparte de `persistables` porque un origen puede necesitar comparar su
   * IDENTIDAD —`origen-local` lo hace contra su hoja de ejemplo— y `filter`
   * devuelve siempre un array nuevo. Pasarle solo el filtrado rompería esa
   * comparación en silencio.
   */
  regions: Region[];
  /** Las que de verdad se escriben: `regions` sin la región en edición si está vacía. */
  persistables: Region[];
  meta: MetaPlanilla | null;
}

export type ResultadoGuardado = { ok: true } | { ok: false; motivo: string };

/**
 * Lo que un origen puede pedir que se enseñe.
 *
 * No lleva el cómo se cierra: la lista la mantiene el hook, así que es él quien
 * pone el cierre. Un origen que supiera cerrarlo tendría que conocer el estado
 * de React del que no es dueño.
 */
export interface AvisoDelOrigen {
  /** Identidad estable: es la `key` de React y lo que distingue un aviso de otro. */
  clave: string;
  texto: ReactNode;
  /** Etiqueta del enlace que lo oculta. Sin esto no se puede cerrar a mano. */
  cierre?: string;
  /**
   * Botones que RESUELVEN el aviso: al pulsar uno, el hook lo retira de la lista.
   *
   * Esa regla es del hook y no del origen porque es él quien tiene el estado.
   * La usa el aviso de la copia apartada: «Descargar» y «Descartar» las dos
   * dejan de tener sentido en cuanto una se pulsa —la copia ya no está— y un
   * aviso que sobrevive a su propia acción invita a pulsarla otra vez.
   */
  acciones?: AccionAviso[];
}

export interface AccionAviso {
  etiqueta: string;
  titulo?: string;
  hacer: () => void;
}

export interface AvisoHoja {
  clave: string;
  texto: ReactNode;
  /** Botones con borde, a la derecha. */
  acciones?: AccionAviso[];
  /** El enlace subrayado que lo oculta. */
  cierre?: AccionAviso;
}

/**
 * El dato de fuera cambió y hay que elegir cuál se queda.
 *
 * Mientras haya un conflicto sin resolver el hook NO escribe: esa pausa es lo
 * que impide pisar el trabajo del otro escritor sin preguntar.
 */
export interface Conflicto {
  texto: ReactNode;
  etiquetaTraer: string;
  tituloTraer?: string;
  etiquetaQuedarme: string;
  tituloQuedarme?: string;
  /** Lo que hay guardado fuera, ya saneado. */
  traer(): Arranque;
}

export interface OrigenHoja {
  /** Síncrono: lo consume un `useState(inicializador)` en el primer render. */
  cargar(): Arranque;
  guardar(h: HojaParaGuardar): ResultadoGuardado;
  /**
   * Escribe una copia APARTE mientras el sitio principal está en pausa.
   *
   * Sin esto, un conflicto sin resolver era una trampa: la pausa impedía pisar
   * al otro escritor —correcto— pero también tiraba todo lo que se escribiera
   * después, y la tarjeta no bloquea la edición ni se repite. Media hora de
   * trabajo desaparecía al cerrar la pestaña sin una sola señal.
   *
   * Solo hace falta en un origen que también tenga `vigilar`: sin vigilancia no
   * hay conflicto, y sin conflicto no hay pausa.
   */
  apartar?(h: HojaParaGuardar): ResultadoGuardado;
  /** Descarta esa copia. La llama el hook cuando el conflicto se resuelve a favor de esta hoja. */
  olvidarApartada?(): void;
  /**
   * Avisa de que otro escritor tocó el mismo sitio. Devuelve cómo desuscribirse.
   * Sin `vigilar` no hay conflicto posible.
   */
  vigilar?(alCambiar: (c: Conflicto) => void): () => void;
  /**
   * Vaciar en `pagehide` y `visibilitychange`. Lo necesita un origen que sea el
   * último eslabón —`localStorage`—, porque cerrar la pestaña no desmonta nada;
   * uno que escriba en un documento que a su vez se persiste, no.
   */
  vaciarAlSalir?: boolean;
}

export interface HojaPersistida {
  regions: Region[];
  /**
   * El dispatcher de verdad, no un envoltorio: los ocho sitios de `MathCanvas`
   * que escriben la hoja usan la forma con actualizador, y `useHistorial`
   * necesita este mismo setter para restaurar.
   */
  setRegions: Dispatch<SetStateAction<Region[]>>;
  /**
   * El `meta` de la hoja abierta: título, slug, clase, normas, entradas…
   *
   * Es VALOR, y no solo un ref, porque **el historial lo observa**: una hoja es
   * sus regiones Y su `meta`, y restaurar solo la mitad dejaba la hoja del
   * usuario exportándose como `<slug>.json` de la planilla que había abierto
   * antes —con sus normas, sus entradas y sus casos dentro—. Tres caminos lo
   * hacían: cargar una planilla y deshacer, vaciar la hoja y deshacer, y traer
   * la de la otra pestaña, que además prometía por escrito «Se deshace con
   * Ctrl+Z».
   */
  meta: MetaPlanilla | null;
  /**
   * El mismo `meta`, espejado, y de solo lectura.
   *
   * Lo lee `guardar`, que es un `useCallback` con dependencias vacías a
   * propósito —lo consumen el vaciado al desmontar y el de `pagehide`—: con el
   * valor en sus dependencias volvería a suscribirse en cada tecla, que es justo
   * lo que el debounce evita. Escribirlo por acá se saltaría el historial, así
   * que no se puede: para eso está `fijarMeta`.
   */
  readonly metaRef: { readonly current: MetaPlanilla | null };
  /** Cambia el `meta` y deja que el historial lo vea. */
  fijarMeta: (meta: MetaPlanilla | null) => void;
  /** Lo que hay que enseñar, en orden: el fallo al guardar, el conflicto, y lo del origen. */
  avisos: AvisoHoja[];
  /** Escribe ya, sin esperar el debounce. */
  guardarYa: () => void;
}

/**
 * La hoja del canvas y su persistencia.
 *
 * `activeId` no es un detalle: el guardado descarta la región EN EDICIÓN si está
 * vacía, que es la que puede quedar a medio crear al cerrar la pestaña. Con solo
 * las regiones no se sabe cuál es.
 *
 * `alReemplazar` corre cuando la hoja se sustituye por completo desde fuera —hoy
 * solo al traer la del otro escritor—: hay que salir de edición y limpiar la
 * selección, porque los ids que hubiera seleccionados pueden no existir en la
 * hoja que llega.
 */
export function useHojaPersistida(
  origen: OrigenHoja,
  { activeId, alReemplazar }: { activeId: string | null; alReemplazar: () => void },
): HojaPersistida {
  const [arranque] = useState(() => origen.cargar());
  const [regions, setRegions] = useState<Region[]>(arranque.regions);
  const [meta, setMeta] = useState<MetaPlanilla | null>(arranque.meta);
  const metaRef = useRef<MetaPlanilla | null>(arranque.meta);
  // El ref se escribe síncrono porque el autoguardado de 300 ms lo lee sin pasar
  // por el render; el estado, para que el historial se entere.
  const fijarMeta = useCallback((m: MetaPlanilla | null) => {
    metaRef.current = m;
    setMeta(m);
  }, []);
  /** El fallo del último intento de guardar, si lo hubo. */
  const [fallo, setFallo] = useState<string | null>(null);
  const [conflicto, setConflicto] = useState<Conflicto | null>(null);
  /**
   * Los avisos que trajo el origen al abrir.
   *
   * Tienen su propio estado y no comparten el de `fallo`: ese lo limpia el
   * guardado en cuanto consigue escribir —o sea 300 ms después—, y uno de estos
   * apunta a datos recuperables, así que tiene que quedarse hasta que alguien lo
   * cierre.
   */
  const [avisosDelOrigen, setAvisosDelOrigen] = useState<AvisoDelOrigen[]>(
    () => arranque.avisos ?? [],
  );

  /**
   * El origen, espejado en un ref que se actualiza en CADA render.
   *
   * No es cosmético. El guardado al desmontar corre en un efecto con `[]`, y un
   * origen que cierre sobre un documento que cambia con cada tecla —el de una
   * obra— quedaría congelado en el de la primera vez: al desmontar reescribiría
   * el documento viejo y resucitaría lo que se hubiera borrado en el resto.
   */
  const origenRef = useRef(origen);
  origenRef.current = origen;

  // Espejos: el guardado al desmontar y el de `pagehide` se suscriben una sola
  // vez y necesitan el valor vigente sin volver a suscribirse en cada tecla.
  const regionsRef = useRef(regions);
  const activeIdRef = useRef<string | null>(activeId);
  /** El guardado está en pausa porque otro escritor tocó el mismo sitio. */
  const enPausaRef = useRef(false);
  useEffect(() => {
    regionsRef.current = regions;
  }, [regions]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  /**
   * Escribe la hoja. Una sola implementación, porque la usan el autoguardado con
   * debounce, el vaciado al desmontar y el que resuelve un conflicto.
   *
   * El fallo NO es silencioso: una hoja con imágenes pegadas puede superar la
   * cuota de `localStorage` (~5 MB), y a partir de ahí todo lo que el usuario
   * escriba se perdería al recargar sin que nada lo indique.
   */
  const guardar = useCallback((rs: Region[], editando: string | null): ResultadoGuardado => {
    // Solo se descarta la región EN EDICIÓN si está vacía: es la que puede
    // quedar a medio crear si se cierra la pestaña.
    //
    // Antes se descartaban todas las vacías, y eso borraba los espaciadores
    // —39 en el corpus, 16 solo en `anclajes-pedestal`— en el primer
    // autoguardado: la hoja se recolocaba sola tras un F5. Una región vacía que
    // no se está editando es una decisión del autor.
    const persistables = rs.filter((r) => r.id !== editando || r.src.trim() !== '');
    const hoja = { regions: rs, persistables, meta: metaRef.current };
    // Otro escritor tocó el mismo sitio y el usuario todavía no ha elegido cuál
    // se queda: escribir ahora pisaría su trabajo sin preguntar. Pero tampoco se
    // tira lo que se está escribiendo —la tarjeta no bloquea la edición—, así
    // que va a una copia aparte hasta que el conflicto se resuelva.
    const r = enPausaRef.current
      ? (origenRef.current.apartar?.(hoja) ?? { ok: true as const })
      : origenRef.current.guardar(hoja);
    setFallo(r.ok ? null : r.motivo);
    return r;
  }, []);

  // Autoguardado con debounce.
  useEffect(() => {
    const t = setTimeout(() => guardar(regions, activeId), PAUSA_MS);
    return () => clearTimeout(t);
  }, [regions, activeId, guardar]);

  // Y un guardado al desmontar, que el debounce por sí solo no da: su `cleanup`
  // cancela el temporizador pendiente, así que teclear y pulsar «← Inicio»
  // dentro de los 300 ms perdía lo último escrito sin que nada lo indicara.
  //
  // Va en su propio efecto con dependencias vacías —y leyendo de los espejos—
  // para que corra SOLO al desmontar: en el efecto de arriba, el `cleanup`
  // también se dispara en cada pulsación y guardaría de forma síncrona en cada
  // tecla, que es justo lo que el debounce evita.
  useEffect(() => {
    return () => {
      guardar(regionsRef.current, activeIdRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Y al cerrar la pestaña, recargar o pasar a otra, que tampoco desmontan: React
  // no se entera de que la página se va. Como el debounce se reinicia en cada
  // tecla, lo que se perdía no eran 300 ms sino la ráfaga entera desde la última
  // pausa — escribir un párrafo sin parar y pulsar F5 se lo llevaba completo.
  // `visibilitychange` es la señal fiable en móvil, donde `pagehide` a veces no
  // llega; se escuchan las dos porque guardar dos veces lo mismo no cuesta nada.
  const vaciarAlSalir = origen.vaciarAlSalir ?? false;
  useEffect(() => {
    if (!vaciarAlSalir) return;
    const vaciar = () => guardar(regionsRef.current, activeIdRef.current);
    const alOcultar = () => {
      if (document.visibilityState === 'hidden') vaciar();
    };
    window.addEventListener('pagehide', vaciar);
    document.addEventListener('visibilitychange', alOcultar);
    return () => {
      window.removeEventListener('pagehide', vaciar);
      document.removeEventListener('visibilitychange', alOcultar);
    };
  }, [vaciarAlSalir, guardar]);

  // El origen avisa de que otro escritor tocó el mismo sitio: se entra en pausa
  // —no se escribe— y se pregunta cuál de las dos hojas se queda.
  useEffect(() => {
    const vigilar = origenRef.current.vigilar;
    if (!vigilar) return;
    return vigilar((c) => {
      enPausaRef.current = true;
      setConflicto(c);
    });
    // Se suscribe una sola vez, como los demás: la vigilancia es del origen y el
    // origen no cambia de identidad a mitad de una hoja.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Trae la hoja del otro escritor y reanuda el guardado. */
  const traerLaDeAfuera = useCallback(() => {
    if (!conflicto) return;
    // Todavía en pausa: esto escribe la copia aparte, no el sitio principal. Va
    // antes de traer la otra hoja porque el debounce deja fuera la ráfaga de los
    // últimos 300 ms, y esa ráfaga es justo lo que está a punto de reemplazarse.
    guardar(regionsRef.current, activeIdRef.current);
    const { regions: rs, meta, avisos } = conflicto.traer();
    enPausaRef.current = false;
    setConflicto(null);
    fijarMeta(meta);
    setAvisosDelOrigen(avisos ?? []);
    alReemplazar();
    setRegions(rs);
  }, [conflicto, alReemplazar, guardar, fijarMeta]);

  /** Se queda con esta: reanuda y la escribe encima, en el acto. */
  const quedarmeConEsta = useCallback(() => {
    enPausaRef.current = false;
    setConflicto(null);
    // La copia apartada solo se descarta si la hoja llegó de verdad a su sitio.
    // Con la cuota llena el guardado falla, y tirar la copia justo entonces
    // dejaría el trabajo sin ningún respaldo.
    if (guardar(regionsRef.current, activeIdRef.current).ok) {
      origenRef.current.olvidarApartada?.();
    }
  }, [guardar]);

  const guardarYa = useCallback(() => {
    guardar(regionsRef.current, activeIdRef.current);
  }, [guardar]);

  const avisos = useMemo<AvisoHoja[]>(() => {
    const lista: AvisoHoja[] = [];
    if (fallo) {
      lista.push({
        clave: 'guardado',
        texto: fallo,
        cierre: { etiqueta: 'Ocultar', hacer: () => setFallo(null) },
      });
    }
    if (conflicto) {
      lista.push({
        clave: 'conflicto',
        texto: conflicto.texto,
        acciones: [
          {
            etiqueta: conflicto.etiquetaTraer,
            titulo: conflicto.tituloTraer,
            hacer: traerLaDeAfuera,
          },
          {
            etiqueta: conflicto.etiquetaQuedarme,
            titulo: conflicto.tituloQuedarme,
            hacer: quedarmeConEsta,
          },
        ],
      });
    }
    for (const a of avisosDelOrigen) {
      const retirar = () => setAvisosDelOrigen((prev) => prev.filter((x) => x.clave !== a.clave));
      lista.push({
        clave: a.clave,
        texto: a.texto,
        // Una acción del origen RESUELVE su aviso: se ejecuta y el aviso se va.
        // Ver la nota de `AvisoDelOrigen.acciones`.
        acciones: a.acciones?.map((accion) => ({
          ...accion,
          hacer: () => {
            accion.hacer();
            retirar();
          },
        })),
        cierre: a.cierre ? { etiqueta: a.cierre, hacer: retirar } : undefined,
      });
    }
    return lista;
  }, [fallo, conflicto, avisosDelOrigen, traerLaDeAfuera, quedarmeConEsta]);

  return { regions, setRegions, meta, metaRef, fijarMeta, avisos, guardarYa };
}
