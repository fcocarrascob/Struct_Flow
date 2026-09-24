import type { ReactNode } from 'react';
import type { RegionResult } from '../../lib/worksheet';
import type { Sugerencia } from '../../lib/autocompletar';
import { useAutocompletado } from './Autocompletado';
import { mensajeDeMotor } from './mensajes-motor';

/**
 * El panel de propiedades de un bloque estructurado —un gráfico, una tabla—: el
 * armazón junto a la hoja, con su cabecera, el botón «Listo» y la banda con el
 * error o el aviso de la región. Lo que se edita va dentro (`CuerpoGrafico`,
 * `CuerpoTabla`).
 *
 * Se monta mientras el bloque está en edición. Cada cambio va directo a la
 * región, y el debounce de evaluación del canvas redibuja el bloque: la vista
 * previa es el propio bloque, no una copia que pudiera verse distinta del papel.
 *
 * No calcula nada. Lo que muestra de la evaluación sale de `result`, igual que
 * en el bloque.
 *
 * Lleva `data-panel-propiedades`: el foco que pasa de la grilla de una tabla a
 * este panel no la saca de edición (`EditorTabla`).
 */
export default function PanelPropiedades({
  titulo,
  result,
  onListo,
  children,
}: {
  titulo: string;
  result?: RegionResult;
  onListo: () => void;
  children: ReactNode;
}) {
  const error = result?.error ? mensajeDeMotor(result.error) : null;
  return (
    <aside
      className="flex h-full w-80 flex-col border-l border-border bg-surface/95 backdrop-blur"
      aria-label={`Propiedades: ${titulo.toLowerCase()}`}
      data-panel-propiedades=""
    >
      <div className="flex items-center justify-between border-b border-border px-2.5 py-2">
        <h2 className="text-xs font-semibold text-ink">{titulo}</h2>
        <button type="button" className={boton} onClick={onListo} title="Termina de editar (también: Escape)">
          Listo
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {(error || result?.aviso) && (
          <p
            className={`m-2.5 rounded border px-2 py-1.5 text-[11px] leading-snug ${
              error ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-900'
            }`}
            role="status"
          >
            {error ?? result?.aviso}
          </p>
        )}
        {children}
      </div>
    </aside>
  );
}

export const entrada =
  'w-full rounded border border-border bg-white px-1.5 py-0.5 font-mono text-[11px] text-ink outline-none focus:border-accent';
export const etiqueta = 'text-[10px] font-medium uppercase tracking-wide text-muted';
export const boton =
  'rounded border border-border bg-white px-1.5 py-0.5 text-[11px] text-ink hover:border-accent hover:text-accent disabled:opacity-40';

/** Un campo de expresión de la hoja, con el desplegable de nombres. */
export function CampoExpr({
  valor,
  onChange,
  sugerencias,
  placeholder,
  titulo,
  onListo,
}: {
  valor: string;
  onChange: (v: string) => void;
  sugerencias?: readonly Sugerencia[];
  placeholder?: string;
  titulo?: string;
  onListo: () => void;
}) {
  const auto = useAutocompletado({ sugerencias, valor, esPrograma: false, onChange });
  return (
    // `relative`: la lista de sugerencias se posiciona contra esta caja.
    <div className="relative">
      <input
        ref={auto.registrar}
        className={entrada}
        value={valor}
        placeholder={placeholder}
        title={titulo}
        spellCheck={false}
        onChange={(e) => {
          onChange(e.target.value);
          auto.onInput(e);
        }}
        onSelect={auto.onSelect}
        onKeyDown={(e) => {
          if (auto.onKeyDown(e)) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            onListo();
          }
        }}
      />
      {auto.lista}
    </div>
  );
}

/** Un campo de texto llano (títulos, nombres, unidades). */
export function CampoTexto({
  valor,
  onChange,
  placeholder,
  titulo,
  mono = false,
  onListo,
}: {
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  titulo?: string;
  mono?: boolean;
  onListo: () => void;
}) {
  return (
    <input
      className={`${entrada} ${mono ? '' : '!font-sans'}`}
      value={valor}
      placeholder={placeholder}
      title={titulo}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onListo();
        }
      }}
    />
  );
}

export function Seccion({ titulo, children, extra }: { titulo: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="border-b border-border px-2.5 py-2">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-ink">{titulo}</h3>
        {extra}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}
