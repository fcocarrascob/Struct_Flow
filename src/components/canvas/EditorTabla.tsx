import { useMemo, useState } from 'react';
import { formulasDeTabla, type RegionResult } from '../../lib/worksheet';
import {
  cambiarCelda,
  encabezadoDe,
  insertarFila,
  type EspecTabla,
} from '../../lib/tabla';
import type { Sugerencia } from '../../lib/autocompletar';
import { useAutocompletado } from './Autocompletado';

interface Props {
  tabla: EspecTabla;
  result?: RegionResult;
  /** Lo que la hoja define por encima de la tabla. */
  sugerencias?: readonly Sugerencia[];
  onCambiar: (t: EspecTabla) => void;
  /** Sale de la tabla confirmando; `avanzar` baja el punto de inserción. */
  onCommit: (avanzar?: boolean) => void;
  /** Sale descartando lo escrito desde que se entró. */
  onCancelar: () => void;
  registerInput: (el: HTMLInputElement | HTMLTextAreaElement | null) => void;
}

/** Dónde está el foco de la grilla. */
interface Pos {
  f: number;
  c: number;
}

/**
 * La tabla en edición: una grilla de celdas donde se escribe cada `src`, como en
 * una planilla electrónica. La estructura —filas, columnas, encabezado, nombres,
 * unidades— se toca en el panel de propiedades; aquí solo el contenido.
 *
 * Las teclas:
 * - **Tab / Shift+Tab** pasan a la celda siguiente o anterior, dando la vuelta de fila.
 * - **Enter** baja a la celda de abajo; en la última fila abre una nueva, que es
 *   como se carga una tabla de norma fila tras fila.
 * - **↑ / ↓** suben y bajan (con la lista de sugerencias cerrada).
 * - **Ctrl+Enter** sale de la tabla y deja el punto de inserción debajo, como en
 *   un programa: en una grilla Enter ya tiene dueño.
 * - **Escape** sale descartando lo escrito desde que se entró.
 *
 * Solo la celda activa es un campo; las demás muestran su `src` y se activan con
 * un clic. Así hay un único autocompletado vivo, con su estado, y se estrena al
 * cambiar de celda (`key`).
 */
export default function EditorTabla({ tabla, result, sugerencias, onCambiar, onCommit, onCancelar, registerInput }: Props) {
  const [pos, setPos] = useState<Pos>({ f: 0, c: 0 });
  const filas = tabla.celdas.length;
  const cols = tabla.celdas[0]?.length ?? 0;
  // La tabla puede encoger desde el panel mientras se edita.
  const f = Math.min(pos.f, filas - 1);
  const c = Math.min(pos.c, cols - 1);
  const enc = encabezadoDe(tabla);

  /**
   * Lo que ve la celda activa: lo que definen las celdas anteriores de esta misma
   * tabla —la más cercana primero, como el resto del autocompletado— y después
   * lo de la hoja de arriba.
   */
  const sugerenciasCelda = useMemo(() => {
    if (!sugerencias) return undefined;
    const valores = new Map((result?.defines ?? []).map((d) => [d.nombre, d.valor]));
    const previas = formulasDeTabla(tabla)
      .filter((x) => x.f < f || (x.f === f && x.c < c))
      .reverse()
      .flatMap((x) => (x.varName ? [{ nombre: x.varName, detalle: valores.get(x.varName) ?? '', esFuncion: false }] : []));
    const vistos = new Set<string>();
    return [...previas, ...sugerencias].filter((s) => (vistos.has(s.nombre) ? false : (vistos.add(s.nombre), true)));
  }, [tabla, result, sugerencias, f, c]);

  const ir = (nf: number, nc: number) => setPos({ f: Math.max(0, Math.min(nf, filas - 1)), c: Math.max(0, Math.min(nc, cols - 1)) });

  const tecla = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onCommit(true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (f < filas - 1) ir(f + 1, c);
      else {
        const nueva = insertarFila(tabla, filas);
        if (nueva !== tabla) {
          onCambiar(nueva);
          setPos({ f: filas, c });
        }
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const i = f * cols + c + (e.shiftKey ? -1 : 1);
      if (i >= 0 && i < filas * cols) ir(Math.floor(i / cols), i % cols);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      ir(f + 1, c);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      ir(f - 1, c);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancelar();
    }
  };

  /**
   * El foco que se va de la grilla confirma, salvo que vaya al panel de
   * propiedades —que edita esta misma tabla— o que lo que se vaya sea la ventana.
   */
  const alSalir = (e: React.FocusEvent) => {
    const destino = e.relatedTarget as HTMLElement | null;
    if (destino && (e.currentTarget.contains(destino) || destino.closest('[data-panel-propiedades]'))) return;
    if (!document.hasFocus()) return;
    onCommit();
  };

  const celda = (i: number, j: number) => {
    const src = tabla.celdas[i][j];
    const Etiqueta = i < enc ? 'th' : 'td';
    if (i === f && j === c) {
      return (
        <Etiqueta key={j} className="relative" style={{ padding: 0 }}>
          <CeldaActiva
            key={`${i},${j}`}
            valor={src}
            sugerencias={sugerenciasCelda}
            onChange={(v) => onCambiar(cambiarCelda(tabla, i, j, v))}
            onKeyDown={tecla}
            registerInput={registerInput}
          />
        </Etiqueta>
      );
    }
    const error = result?.tabla?.celdas[i]?.[j]?.error;
    return (
      <Etiqueta
        key={j}
        // Una línea por celda, recortada: la grilla en edición mide lo mismo que
        // la tabla impresa, fila por fila, y no tapa lo que tiene debajo.
        className={`cursor-text truncate font-mono text-[9.5pt] font-normal ${error ? 'text-red-700' : 'text-ink'}`}
        title={error ? `${src}\n${error}` : src}
        // El clic no puede llevarse el foco de la celda activa: la grilla lo
        // perdería, y perder el foco es salir de la tabla.
        onMouseDown={(e) => {
          e.preventDefault();
          setPos({ f: i, c: j });
        }}
      >
        {src || ' '}
      </Etiqueta>
    );
  };

  return (
    <div
      className="wp-tabla"
      onBlur={alSalir}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <table className="w-full" style={{ tableLayout: 'fixed' }}>
        {enc > 0 && <thead>{tabla.celdas.slice(0, enc).map((fila, i) => <tr key={i}>{fila.map((_, j) => celda(i, j))}</tr>)}</thead>}
        <tbody>
          {tabla.celdas.slice(enc).map((fila, k) => (
            <tr key={enc + k}>{fila.map((_, j) => celda(enc + k, j))}</tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 font-sans text-[10px] text-muted">
        Tab celda siguiente · Enter abajo · Ctrl+Enter salir · Esc descartar · la estructura, en el panel
      </p>
    </div>
  );
}

/** El campo de la celda activa, con su autocompletado propio. */
function CeldaActiva({
  valor,
  sugerencias,
  onChange,
  onKeyDown,
  registerInput,
}: {
  valor: string;
  sugerencias?: readonly Sugerencia[];
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  registerInput: (el: HTMLInputElement | null) => void;
}) {
  const auto = useAutocompletado({ sugerencias, valor, esPrograma: false, onChange });
  return (
    <>
      <input
        ref={(el) => {
          registerInput(el);
          auto.registrar(el);
        }}
        autoFocus
        className="block w-full min-w-[6ch] bg-accent/5 px-2 py-[2px] font-mono text-[9.5pt] font-normal text-ink outline-none ring-1 ring-accent"
        size={Math.max(valor.length + 1, 6)}
        value={valor}
        placeholder="a := 3 m"
        onChange={(e) => {
          onChange(e.target.value);
          auto.onInput(e);
        }}
        onSelect={auto.onSelect}
        onKeyDown={(e) => {
          if (auto.onKeyDown(e)) return;
          onKeyDown(e);
        }}
      />
      {auto.lista}
    </>
  );
}
