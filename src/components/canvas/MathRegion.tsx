import { memo, useLayoutEffect, useRef } from 'react';
import BloqueDoc, { esEspaciador, nivelEncabezado } from './BloqueDoc';
import type { Region, RegionResult } from '../../lib/worksheet';
import { A4_ANCHO_PX } from '../../lib/paginacion';

export const GRID = 16;
export const snap = (v: number) => Math.max(0, Math.round(v / GRID) * GRID);

/**
 * El aire que queda bajo un bloque al salir de él con Enter, antes de ajustar el
 * resultado a la cuadrícula.
 *
 * La cifra está elegida para reproducir el corpus, no al gusto: una fórmula
 * mide 21 px y una línea de texto 24, así que 24 de aire y el ajuste a la
 * rejilla dejan la siguiente **48 px más abajo**, que es exactamente el salto
 * con el que están escritas 7.471 de las 8.344 separaciones publicadas. Un
 * bloque de programa de 197 px deja la siguiente en 224, que es lo que el paso
 * fijo de 48 px no sabía hacer y por lo que un bloque acababa encima de otro.
 */
export const AIRE_TRAS_BLOQUE = 24;

/**
 * Cuánto hay que mover el puntero para que deje de ser un clic y pase a ser un
 * arrastre. Lo comparte el marco de selección del canvas: si cada uno usara el
 * suyo, habría un rango de píxeles en el que un gesto es arrastre para la región
 * y clic para la hoja.
 */
export const UMBRAL_ARRASTRE = 4;

/** Ancho mínimo de una imagen al redimensionar (px). */
const MIN_IMAGE_W = GRID * 3;

interface Props {
  region: Region;
  result?: RegionResult;
  /** En edición: muestra el input de texto plano. */
  active: boolean;
  selected: boolean;
  /** Queda debajo de otra región: se señala para poder encontrarla. */
  tapada?: boolean;
  /** Es la primera región de texto de la hoja: se dibuja como título. */
  titulo?: boolean;
  onChange: (src: string) => void;
  /**
   * Sale de edición confirmando (Enter, Ctrl+Enter o blur). Escape descarta.
   *
   * `avanzar` pide además que el punto de inserción baje por debajo de este
   * bloque, con su alto REAL: es lo que hace que Enter encadene bloques sin
   * tocar el ratón. Lo piden solo las teclas que significan «he terminado con
   * este, sigo abajo»; un blur no, porque el clic que se lleva el foco fija su
   * propio punto, y un Escape tampoco, porque cancelar no es avanzar.
   */
  onCommit: (avanzar?: boolean) => void;
  onActivate: () => void;
  onSelect: (additive: boolean) => void;
  /**
   * Empieza un arrastre. El canvas decide aquí qué grupo se moverá y toma la
   * instantánea de sus posiciones.
   */
  onDragStart: (additive: boolean) => void;
  /** Desplazamiento acumulado desde el origen del arrastre, en px y sin ajustar. */
  onDrag: (dx: number, dy: number) => void;
  onDragEnd: () => void;
  /** Solo `image`: nuevo tamaño tras arrastrar el tirador de la esquina. */
  onResize: (w: number, h: number) => void;
  /** Registra el input/textarea activo para que la paleta inserte símbolos. */
  registerInput: (el: HTMLInputElement | HTMLTextAreaElement | null) => void;
}

function MathRegion({
  region,
  result,
  active,
  selected,
  tapada,
  titulo,
  onChange,
  onCommit,
  onActivate,
  onSelect,
  onDragStart,
  onDrag,
  onDragEnd,
  onResize,
  registerInput,
}: Props) {
  // Solo el origen del puntero: la posición de destino la calcula el canvas, que
  // es el único que sabe qué más se está moviendo. Guardar aquí `region.x/y`
  // ataba el arrastre a una sola región.
  const drag = useRef<{ px: number; py: number; moved: boolean } | null>(null);
  const resize = useRef<{ px: number; w0: number; ratio: number } | null>(null);

  // El texto con el que se entró en edición, para poder revertirlo con Escape.
  // Se toma en el render en que `active` pasa a ser cierto: un efecto llegaría
  // después de que el primer `onChange` ya hubiera pisado el valor.
  const srcAlEntrar = useRef(region.src);
  const estabaActivo = useRef(active);
  if (active && !estabaActivo.current) srcAlEntrar.current = region.src;
  estabaActivo.current = active;

  /**
   * Sale de edición DESCARTANDO lo escrito.
   *
   * Escape hacía exactamente lo mismo que Enter —confirmar—, así que al pisar
   * por error una fórmula buena el reflejo de cancelar dejaba el cambio hecho, y
   * no había ninguna forma de descartar una edición. Si la región se creó vacía,
   * revertir la deja vacía y `onCommit` la elimina, que es cancelar la creación.
   */
  const cancelarEdicion = () => {
    if (region.src !== srcAlEntrar.current) onChange(srcAlEntrar.current);
    onCommit();
  };

  /**
   * El editor de un texto crece con su contenido.
   *
   * `rows` no basta: cuenta los saltos que escribió el autor, no las líneas que
   * salen al envolver contra el ancho del papel, así que un párrafo largo de una
   * sola línea se quedaba con una barra de scroll dentro del bloque. El alto se
   * toma del `scrollHeight`, que es la única medida que conoce el envoltorio
   * real. Y va en un efecto de disposición para que la corrección entre en el
   * mismo pintado: con `useEffect` el bloque parpadearía de alto en cada tecla.
   */
  const textoRef = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const ta = textoRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [region.src, active]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (active) return; // en edición no se arrastra
    if (e.button !== 0) return;
    e.stopPropagation();
    drag.current = { px: e.clientX, py: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < UMBRAL_ARRASTRE) return;
      d.moved = true;
      // El grupo se fija al empezar a MOVER, no al pulsar. Fijarlo en el
      // `pointerdown` destruiría la selección múltiple con solo tocar uno de sus
      // bloques, que es justo el gesto con el que se la va a arrastrar.
      onDragStart(e.ctrlKey || e.shiftKey);
    }
    onDrag(dx, dy);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) onDragEnd();
    else onSelect(e.ctrlKey || e.shiftKey);
  };
  // El puntero se puede perder sin `pointerup`: el navegador que se lleva el
  // gesto como desplazamiento táctil, el foco que se va, un lápiz que se levanta
  // fuera. Sin esto el arrastre quedaba abierto y la región seguía a un puntero
  // que ya no la agarraba. No selecciona: un gesto cancelado no es un clic.
  const onPointerCancel = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) onDragEnd();
  };

  // Redimensión de una imagen desde la esquina, con el aspecto bloqueado: solo
  // se sigue el desplazamiento horizontal y el alto se deriva de la proporción.
  const onResizeDown = (e: React.PointerEvent) => {
    // Solo el botón principal: con el secundario el navegador abre su menú y no
    // manda `pointerup`, así que el gesto quedaba abierto.
    if (e.button !== 0) return;
    e.stopPropagation();
    const w0 = region.w ?? MIN_IMAGE_W;
    resize.current = { px: e.clientX, w0, ratio: (region.h ?? w0) / w0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resize.current;
    if (!r) return;
    e.stopPropagation();
    const w = Math.max(MIN_IMAGE_W, snap(r.w0 + (e.clientX - r.px)));
    onResize(w, Math.max(1, Math.round(w * r.ratio)));
  };
  const onResizeUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    resize.current = null;
  };
  // La misma red que el arrastre de la región, que sí la tenía. Sin ella, un
  // gesto cancelado dejaba `resize.current` vivo y a partir de ahí CUALQUIER
  // paso del ratón sobre el tirador, sin botón pulsado, redimensionaba la
  // imagen — `onResizeMove` solo mira si hay gesto, no si sigue pulsado.
  const onResizeCancel = () => {
    resize.current = null;
  };

  const isProgram = region.kind === 'program';
  const isText = region.kind === 'text';
  const isImage = region.kind === 'image';
  const hasError = Boolean(result?.error) && !active;

  const lines = region.src.split('\n');
  const progRows = Math.max(lines.length, 2);
  const progCols = Math.max(...lines.map((l) => l.length), 24);

  // Un encabezado de nivel 1 o 2 —y el título de la hoja— lleva una regla
  // horizontal que tiene que cruzar la página entera, así que se queda a ancho
  // completo. El resto se ciñe a su contenido (ver el comentario de abajo), y
  // eso incluye a un `###`, que no lleva regla: darle los 680 px del papel le
  // haría comerse el clic en el vacío de su derecha, que es el gesto que fija
  // el punto de inserción.
  //
  // Y un espaciador también va a ancho completo, aunque no dibuje nada:
  // `fit-content` sobre un bloque sin contenido mide CERO de ancho, y entonces
  // no habría forma de seleccionarlo, ni de verlo al pasar el cursor, ni de
  // borrarlo.
  const nivel = nivelEncabezado(region);
  const anchoCompleto = Boolean(titulo) || nivel === 1 || nivel === 2 || esEspaciador(region);

  return (
    <div
      // LA CAJA DE MEDICIÓN. Ocupa el ancho del papel para que el bloque parta
      // las líneas por donde las parte el PDF y mida exactamente lo mismo, y es
      // la que lleva `data-region-id`, o sea la que miden `usePaginacion`, el
      // detector de solapes y el salto del panel de variables.
      //
      // Va sin restar `region.x`: el corpus está en `x = 40` y el documento
      // lineal mide sus 680 px enteros, así que restarlo desalinearía justo lo
      // que se busca igualar.
      //
      // `pointer-events-none` porque NO es la caja con la que se interactúa: si
      // lo fuera, los 680 px se tragarían el clic en el vacío a la derecha de
      // una fórmula de 60 px de ancho —que es el gesto que fija el punto de
      // inserción— y ofrecerían mover un bloque desde media hoja de distancia.
      //
      // El `z-index` va aquí y no en la caja interior: solo surte efecto sobre
      // un elemento posicionado, y la interior es estática a propósito (para que
      // `fit-content` la ciña al contenido sin sacarla del flujo).
      className={`pointer-events-none absolute ${active ? 'z-20' : selected ? 'z-10' : ''}`}
      style={{
        left: region.x,
        top: region.y,
        width: A4_ANCHO_PX,
      }}
      data-region-id={region.id}
    >
      <div
        // LA CAJA DE INTERACCIÓN Y REALCE. `fit-content` acotado al ancho del
        // papel: el ancho disponible sigue siendo el mismo, así que el salto de
        // línea y el alto no cambian ni un píxel, pero la caja termina donde
        // termina el contenido y con ella el cursor de mover y el anillo.
        //
        // Sin relleno: seis píxeles a la izquierda y dos hacia abajo son seis y
        // dos de diferencia con el papel. El realce va en `ring`, que es una
        // sombra y no ocupa sitio.
        className={`group pointer-events-auto select-none rounded ${
          active
            ? 'bg-white shadow-sm ring-1 ring-accent'
            : selected
              ? 'cursor-move bg-accent/5 ring-1 ring-accent/60'
              : `cursor-move hover:ring-1 ${
                  hasError
                    ? 'ring-1 ring-red-300'
                    : tapada
                      ? 'ring-1 ring-amber-400'
                      : 'hover:ring-border'
                }`
        }`}
        style={{
          width: anchoCompleto ? '100%' : 'fit-content',
          maxWidth: '100%',
          // El bloque en edición ya no puede encogerse a lo que ocupa el texto:
          // el input mide `w-full`, y con `fit-content` la caja se estrecharía
          // hasta el ancho mínimo del input al borrar el contenido.
          minWidth: active ? '100%' : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!isImage) onActivate(); // una imagen no tiene modo edición
        }}
      >
        {active && isProgram ? (
          <textarea
            ref={registerInput}
            autoFocus
            className="resize-none bg-transparent font-mono text-[9.5pt] leading-snug text-ink outline-none"
            style={{ width: `${progCols + 2}ch` }}
            rows={progRows}
            value={region.src}
            placeholder={'S :=\n    s := 0\n    for i in 1:10\n        s := s + i\n    return s'}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => onCommit()}
            onKeyDown={(e) => {
              // Enter inserta línea; Ctrl/⌘+Enter confirma y Escape descarta.
              //
              // Un programa es la excepción a la regla del resto de la hoja
              // («Enter sale del bloque»), y no por descuido: su contenido son
              // líneas indentadas, y escribir veinte de ellas con Shift+Enter
              // sería pelear con el editor en cada una.
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                onCommit(true);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelarEdicion();
              } else if (e.key === 'Tab') {
                e.preventDefault();
                const ta = e.currentTarget;
                const s = ta.selectionStart;
                const next = ta.value.slice(0, s) + '    ' + ta.value.slice(ta.selectionEnd);
                onChange(next);
                requestAnimationFrame(() => ta.setSelectionRange(s + 4, s + 4));
              }
              e.stopPropagation();
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : active && isText ? (
          <textarea
            ref={(el) => {
              textoRef.current = el;
              registerInput(el);
            }}
            autoFocus
            // Un `<textarea>` y no un `<input>`, que es lo que había: un párrafo
            // de una memoria de cálculo lleva saltos de línea, y `.wp-label` ya
            // los dibuja (`white-space: pre-wrap`) desde hace tiempo. Lo que
            // faltaba era poder teclearlos.
            //
            // Las métricas son las del papel, no las de la interfaz —9,5 pt y el
            // interlineado heredado de `.doc-papel`—: si el editor midiera
            // distinto que el bloque, el texto saltaría al entrar y salir de
            // edición. Sin `font-mono` y sin ancho en `ch`, al revés que el de
            // un programa: aquí el ancho lo da el papel y la línea envuelve
            // donde envuelve el párrafo.
            className="w-full resize-none overflow-hidden bg-transparent text-[9.5pt] text-ink outline-none"
            rows={Math.max(lines.length, 1)}
            value={region.src}
            placeholder="texto…  ·  ## para una sección  ·  Shift+Enter para otra línea"
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => onCommit()}
            onKeyDown={(e) => {
              // Enter sale y avanza; Shift/Alt+Enter dejan pasar el salto de
              // línea al navegador, que ya sabe insertarlo donde está el cursor.
              if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                onCommit(true);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelarEdicion();
              }
              e.stopPropagation();
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : active ? (
          <input
            ref={registerInput}
            autoFocus
            // Las métricas son las del papel, no las de la interfaz: si el input
            // midiera distinto que el bloque, el texto saltaría al entrar y salir
            // de edición.
            className="w-full bg-transparent font-mono text-[10.5pt] text-ink outline-none"
            value={region.src}
            placeholder="ej. M := F*L/4 = kN*m"
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => onCommit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onCommit(true);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelarEdicion();
              }
              e.stopPropagation();
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <BloqueDoc region={region} result={result} titulo={titulo} />
        )}

        {/* Tirador de esquina: siempre visible si la región está seleccionada, y
            al pasar el cursor por encima para que se descubra sin clic. */}
        {isImage && (
          <span
            className={`absolute -bottom-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-accent bg-white ${
              selected ? '' : 'hidden group-hover:block'
            }`}
            // Se posiciona contra la caja de MEDICIÓN, que es la única posicionada
            // de las dos, y esa ocupa el ancho del papel: el tirador se pega al
            // borde de la imagen, no a la esquina de la caja.
            style={{ left: (region.w ?? MIN_IMAGE_W) - 4 }}
            title="Arrastra para redimensionar (mantiene la proporción)"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onPointerCancel={onResizeCancel}
            onLostPointerCapture={onResizeCancel}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Una hoja real tiene ~650 regiones, y cualquier cambio en una —mover un
 * bloque, teclear en otra— cambiaba la identidad del array y volvía a
 * renderizarlas TODAS, con su KaTeX incluido. Memoizada, solo se rehace la que
 * de verdad cambió.
 *
 * La comparación mira los datos y no los callbacks a propósito: varios llegan
 * como funciones nuevas en cada render (`onResize={(w,h) => updateRegion(r.id,
 * …)}`), lo que dejaría la memoización sin efecto. Ignorarlos es seguro porque
 * todos se apoyan en `updateRegion`, que es estable, y en el `id` de la región,
 * que no cambia mientras la región exista: una versión anterior del callback
 * hace exactamente lo mismo que la nueva.
 */
export default memo(MathRegion, (a, b) => {
  const x = a.region;
  const y = b.region;
  return (
    x === y ||
    (x.id === y.id &&
      x.x === y.x &&
      x.y === y.y &&
      x.src === y.src &&
      x.kind === y.kind &&
      x.w === y.w &&
      x.h === y.h &&
      x.pageBreak === y.pageBreak)
  ) && a.result === b.result && a.active === b.active && a.selected === b.selected &&
    a.tapada === b.tapada && a.titulo === b.titulo;
});
