import { useState, type ReactNode } from 'react';
import {
  aplicarSugerencia,
  candidatos,
  localesDePrograma,
  palabraEnCursor,
  type Sugerencia,
} from '../../lib/autocompletar';

type Campo = HTMLInputElement | HTMLTextAreaElement;

interface Opciones {
  /** Nombres que ofrece la hoja; `undefined` apaga el autocompletado. */
  sugerencias?: readonly Sugerencia[];
  /** El texto del editor. */
  valor: string;
  /** Un programa añade lo que define dentro de sí mismo. */
  esPrograma: boolean;
  onChange: (src: string) => void;
}

export interface Autocompletado {
  /**
   * Hay que llamarlo lo PRIMERO en el `onKeyDown` del editor. Devuelve `true`
   * si la tecla era de la lista: entonces el editor no debe hacer nada más con
   * ella — un Enter que acepta una sugerencia no confirma la fórmula, y un
   * Escape que cierra la lista no descarta lo escrito.
   */
  onKeyDown: (e: React.KeyboardEvent<Campo>) => boolean;
  /** Para el `onChange` del editor, después de propagar el valor. */
  onInput: (e: React.ChangeEvent<Campo>) => void;
  /** Para el `onSelect` del editor: sigue al cursor. */
  onSelect: (e: React.SyntheticEvent<Campo>) => void;
  /** La lista, para montarla dentro de la caja posicionada de la región. */
  lista: ReactNode;
  /** Para el `ref` del editor. */
  registrar: (el: Campo | null) => void;
}

const MAX_FILAS = 8;

/**
 * El desplegable de nombres al escribir una fórmula o un programa, como el de
 * SMath: se abre al teclear un nombre, ↑/↓ recorren, Enter o Tab aceptan y
 * Escape lo cierra. Ctrl+Espacio lo abre aunque no haya nada escrito.
 *
 * La lista se DERIVA en cada render del texto y del cursor; lo único que se
 * guarda es si está abierta, en qué fila se está y dónde está el cursor. Así no
 * puede quedarse desfasada del texto, que cambia también por la paleta de
 * símbolos o por un deshacer.
 */
export function useAutocompletado({ sugerencias, valor, esPrograma, onChange }: Opciones): Autocompletado {
  // Una fórmula que nace al teclear sobre la hoja ya trae su primera letra: se
  // abre de entrada, como si esa letra se hubiera escrito aquí.
  const [abierta, setAbierta] = useState(() => sugerencias !== undefined && /^[\p{L}_]$/u.test(valor));
  const [fila, setFila] = useState(0);
  const [cursor, setCursor] = useState<number | null>(() => valor.length);
  const [campo, setCampo] = useState<Campo | null>(null);

  const activo = sugerencias !== undefined;
  const palabra = activo && abierta && cursor !== null ? palabraEnCursor(valor, cursor) : null;
  const fuentes = palabra ? [...(esPrograma ? localesDePrograma(valor) : []), ...sugerencias!] : [];
  const items = palabra ? candidatos(palabra.prefijo, fuentes, MAX_FILAS) : [];
  const visible = items.length > 0;
  const actual = Math.min(fila, items.length - 1);

  const cerrar = () => {
    setAbierta(false);
    setFila(0);
  };

  const aceptar = (s: Sugerencia, el: Campo) => {
    if (!palabra) return;
    const r = aplicarSugerencia(valor, palabra, s);
    onChange(r.texto);
    cerrar();
    // El valor nuevo llega en el render siguiente; el cursor se coloca después.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.cursor, r.cursor);
      setCursor(r.cursor);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<Campo>): boolean => {
    if (!activo || e.nativeEvent.isComposing) return false;
    if (e.key === ' ' && e.ctrlKey) {
      e.preventDefault();
      setCampo(e.currentTarget);
      setCursor(e.currentTarget.selectionStart);
      setAbierta(true);
      setFila(0);
      return true;
    }
    if (!visible) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const paso = e.key === 'ArrowDown' ? 1 : -1;
      setFila((actual + paso + items.length) % items.length);
      return true;
    }
    if ((e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
      e.preventDefault();
      aceptar(items[actual], e.currentTarget);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cerrar();
      return true;
    }
    return false;
  };

  const onInput = (e: React.ChangeEvent<Campo>) => {
    if (!activo) return;
    const el = e.currentTarget;
    const pos = el.selectionStart ?? el.value.length;
    setCampo(el);
    setCursor(pos);
    // Se abre al ESCRIBIR un carácter de nombre, no al borrar ni al moverse: una
    // lista que salta al pasar el cursor por encima de un nombre estorba.
    const escrito = el.value.length > valor.length && /[\p{L}\p{N}_]/u.test(el.value[pos - 1] ?? '');
    if (escrito) {
      setAbierta(true);
      setFila(0);
    }
  };

  const onSelect = (e: React.SyntheticEvent<Campo>) => {
    if (!activo) return;
    const el = e.currentTarget;
    const pos = el.selectionStart;
    setCursor(pos);
    // Salir de la palabra —con las flechas, con un clic— cierra la lista.
    if (abierta && (pos === null || !palabraEnCursor(el.value, pos))) cerrar();
  };

  let lista: ReactNode = null;
  if (visible && campo && palabra) {
    const pos = coordenadasDelCursor(campo, palabra.inicio);
    lista = (
      <ul
        role="listbox"
        aria-label="Sugerencias"
        className="pointer-events-auto absolute z-30 max-w-[22rem] min-w-[12rem] overflow-hidden rounded border border-border bg-white py-0.5 text-left shadow-md"
        style={{ left: pos.left, top: pos.top + pos.alto + 2 }}
        // El clic no puede llevarse el foco: el editor lo perdería, y perder el
        // foco es confirmar la fórmula.
        onMouseDown={(e) => e.preventDefault()}
      >
        {items.map((s, i) => (
          <li
            key={s.nombre}
            role="option"
            aria-selected={i === actual}
            className={`flex cursor-pointer items-baseline justify-between gap-3 px-2 py-0.5 ${
              i === actual ? 'bg-accent/10' : 'hover:bg-ink/5'
            }`}
            onMouseEnter={() => setFila(i)}
            onClick={() => aceptar(s, campo)}
          >
            <span className="font-mono text-[11px] font-medium text-ink">{s.nombre}</span>
            <span className={`truncate text-[11px] text-muted ${s.esFuncion ? 'font-mono italic' : ''}`}>
              {s.detalle}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  // El campo se conoce desde que se monta, no desde la primera tecla: hace falta
  // para situar la lista, y la de la primera letra se pinta antes de teclear
  // nada más.
  const registrar = (el: Campo | null) => {
    if (el && el !== campo) setCampo(el);
  };

  return { onKeyDown, onInput, onSelect, lista, registrar };
}

/**
 * Dónde cae el carácter `indice` de un campo, en píxeles y respecto de su
 * `offsetParent` — la caja de medición de la región, que es la posicionada.
 *
 * Un `<input>` o un `<textarea>` no dicen dónde dibujan cada carácter, así que
 * se reproduce: un `div` invisible con la misma tipografía, el mismo relleno y
 * el mismo ancho, el texto hasta el índice y un marcador detrás. Donde cae el
 * marcador es donde cae el carácter.
 */
function coordenadasDelCursor(el: Campo, indice: number): { left: number; top: number; alto: number } {
  const cs = getComputedStyle(el);
  const espejo = document.createElement('div');
  const copiar = [
    'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
    'textTransform', 'tabSize', 'wordSpacing',
  ] as const;
  for (const p of copiar) espejo.style[p] = cs[p];
  Object.assign(espejo.style, {
    position: 'absolute',
    visibility: 'hidden',
    top: '0',
    left: '-10000px',
    // Un `<input>` es una línea sin fin; un `<textarea>` envuelve como su texto.
    whiteSpace: el instanceof HTMLTextAreaElement ? 'pre-wrap' : 'pre',
    overflowWrap: el instanceof HTMLTextAreaElement ? 'break-word' : 'normal',
  });
  espejo.textContent = el.value.slice(0, indice);
  const marca = document.createElement('span');
  marca.textContent = '\u200b';
  espejo.appendChild(marca);
  document.body.appendChild(espejo);
  const left = marca.offsetLeft;
  const top = marca.offsetTop;
  const alto = marca.offsetHeight || parseFloat(cs.lineHeight) || 16;
  document.body.removeChild(espejo);
  return {
    left: el.offsetLeft + left - el.scrollLeft,
    top: el.offsetTop + top - el.scrollTop,
    alto,
  };
}
