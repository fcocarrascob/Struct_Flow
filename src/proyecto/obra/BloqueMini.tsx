import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import BloqueDoc from '../../components/canvas/BloqueDoc';
import { useAutocompletado } from '../../components/canvas/Autocompletado';
import type { Sugerencia } from '../../lib/autocompletar';
import type { Region, RegionResult } from '../../lib/worksheet';

/**
 * Un bloque de la mini hoja: editor cuando está activo, resultado cuando no.
 *
 * NO usa `MathRegion`. Aquel se posiciona en absoluto sobre el lienzo, mide
 * `A4_ANCHO_PX` (680 px) sin prop para cambiarlo y lleva los gestos de arrastre
 * y redimensión; nada de eso cabe ni significa algo en un panel de 30rem. Lo que
 * sí se reutiliza es lo que importa: **`BloqueDoc` pinta el bloque**, así que
 * una fórmula se ve aquí exactamente igual que en la hoja y en el papel, y el
 * autocompletado es el mismo del canvas.
 *
 * De `MathRegion` se replican cuatro conductas que parecen detalles y no lo son:
 * el blur que se ignora cuando la ventana perdió el foco (cambiar de pestaña no
 * es salir del bloque), la guarda de composición para los acentos y los teclados
 * con IME, Escape que devuelve el texto que había al entrar, y el alto
 * automático del área de texto.
 */

interface Props {
  /** La región que pinta. En el panel es una lista, así que su `x`/`y` no se
   *  usan para colocarla: solo para ordenarla, y de eso se encarga `MiniHoja`. */
  bloque: Region;
  result?: RegionResult;
  activo: boolean;
  sugerencias?: readonly Sugerencia[];
  onCambiar: (src: string) => void;
  /** `avanzar`: crear el bloque siguiente y editarlo. `src` es el texto con el
   *  que el bloque sale, que tras un Escape no es el que la hoja todavía tiene. */
  onSalir: (avanzar: boolean, src: string) => void;
  onActivar: () => void;
  onBorrar: () => void;
}

export default function BloqueMini({
  bloque,
  result,
  activo,
  sugerencias,
  onCambiar,
  onSalir,
  onActivar,
  onBorrar,
}: Props) {
  const campo = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const srcAlEntrar = useRef(bloque.src);
  const [componiendo, setComponiendo] = useState(false);

  const auto = useAutocompletado({
    sugerencias,
    valor: bloque.src,
    esPrograma: false,
    onChange: onCambiar,
  });

  useEffect(() => {
    if (!activo) return;
    srcAlEntrar.current = bloque.src;
    const el = campo.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    // Solo al entrar en edición: reejecutarlo con cada tecla movería el cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo]);

  // El área de texto crece con su contenido. Sin esto, un texto de tres líneas
  // se edita por una rendija de una.
  useLayoutEffect(() => {
    const el = campo.current;
    if (!activo || !el || bloque.kind !== 'text') return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [activo, bloque.src, bloque.kind]);

  function alPerderFoco() {
    // Cambiar de pestaña o de ventana no es salir del bloque: si el documento no
    // tiene el foco, el blur no lo provocó el usuario.
    if (!document.hasFocus()) return;
    onSalir(false, bloque.src);
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    // El autocompletado va primero y manda: con la lista abierta, Enter elige y
    // Escape la cierra, y ninguno de los dos debe salir del bloque.
    if (auto.onKeyDown(e)) return;
    if (componiendo) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      // Los dos, y con el mismo texto: el de la hoja todavía es el editado, así
      // que si no se lo pasamos, un bloque que se vació y se canceló se
      // descartaría por vacío justo después de haberlo restaurado.
      onCambiar(srcAlEntrar.current);
      onSalir(false, srcAlEntrar.current);
      return;
    }
    if (e.key === 'Enter') {
      // En un texto, Shift/Alt+Enter parte la línea; en una fórmula no hay
      // líneas que partir, así que Enter siempre avanza.
      if (bloque.kind === 'text' && (e.shiftKey || e.altKey)) return;
      e.preventDefault();
      onSalir(true, bloque.src);
      return;
    }
    if (e.key === 'Backspace' && bloque.src === '') {
      e.preventDefault();
      onBorrar();
    }
  }

  // Un gráfico no se edita en una línea: su panel de propiedades vive en el
  // canvas de la hoja. Aquí se ve, igual que en el papel, y nada más.
  if (bloque.kind === 'plot') {
    return (
      <div className="group relative rounded px-1.5 py-0.5" title="Un gráfico se edita en la pestaña de la hoja">
        <BloqueDoc region={bloque} result={result} />
        {result?.aviso && <p className="text-[10px] leading-snug text-aviso">⚠ {result.aviso}</p>}
      </div>
    );
  }

  if (activo) {
    const comunes = {
      value: bloque.src,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        auto.onInput(e);
        onCambiar(e.target.value);
      },
      onSelect: auto.onSelect,
      onKeyDown: alTeclear,
      onBlur: alPerderFoco,
      onCompositionStart: () => setComponiendo(true),
      onCompositionEnd: () => setComponiendo(false),
      className:
        'w-full rounded border border-accent bg-white px-1.5 py-1 font-mono text-[11px] text-ink outline-none',
    };

    return (
      // `relative` porque la lista de sugerencias se posiciona contra el
      // ancestro posicionado más cercano.
      <div className="relative py-0.5">
        {bloque.kind === 'text' ? (
          <textarea
            {...comunes}
            ref={(el) => {
              campo.current = el;
              auto.registrar(el);
            }}
            rows={1}
            placeholder="Texto de la memoria"
          />
        ) : (
          <input
            {...comunes}
            ref={(el) => {
              campo.current = el;
              auto.registrar(el);
            }}
            type="text"
            spellCheck={false}
            placeholder="CM_equipo := 4 m * 3 m * 250 kgf/m^2 = tonf"
          />
        )}
        {auto.lista}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivar}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onActivar())}
      title="Clic para editar"
      className="group relative cursor-text rounded px-1.5 py-0.5 hover:bg-ink/5"
    >
      {bloque.src.trim() === '' ? (
        <p className="font-mono text-[11px] text-muted/60">(vacío)</p>
      ) : (
        <BloqueDoc region={bloque} result={result} />
      )}
      {result?.aviso && <p className="text-[10px] leading-snug text-aviso">⚠ {result.aviso}</p>}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onBorrar();
        }}
        title="Quitar este bloque"
        // `opacity` y no `hidden`: un botón con `display: none` no puede recibir
        // el foco, así que por teclado el bloque no se podía quitar.
        className="absolute right-0 top-0 rounded border border-border bg-white px-1 text-[10px] leading-4 text-muted opacity-0 hover:border-error hover:text-error focus:opacity-100 group-hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}
