import { useState } from 'react';
import { COLORES_GRUPO, type Grupo } from './modelo';

/**
 * Elegir el grupo de un nodo, o crear uno ahí mismo.
 *
 * Crear va dentro del selector y no en otro sitio porque es el momento en que
 * uno se da cuenta de que le falta: se está mirando el viento y se quiere un
 * grupo «Viento». Mandarlo a la leyenda a crearlo y volver sería perder el nodo.
 */
export default function SelectorGrupo({
  grupos,
  valor,
  onElegir,
  onCrear,
  rotulo = 'Grupo',
}: {
  grupos: readonly Grupo[];
  valor: string | undefined;
  onElegir: (id: string | undefined) => void;
  /** Crea el grupo y se lo asigna al nodo. */
  onCrear: (nombre: string, color: string) => void;
  rotulo?: string;
}) {
  const [creando, setCreando] = useState(false);
  const actual = grupos.find((g) => g.id === valor);

  if (creando) {
    return (
      <FormularioGrupo
        inicial={{ nombre: '', color: COLORES_GRUPO[grupos.length % COLORES_GRUPO.length] }}
        accion="crear"
        onListo={(nombre, color) => {
          onCrear(nombre, color);
          setCreando(false);
        }}
        onCancelar={() => setCreando(false)}
      />
    );
  }

  return (
    <label className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
      {rotulo}
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-border"
        style={actual ? { background: actual.color, borderColor: actual.color } : undefined}
      />
      <select
        value={actual?.id ?? ''}
        onChange={(e) => {
          if (e.target.value === '+') setCreando(true);
          else onElegir(e.target.value || undefined);
        }}
        className="min-w-0 rounded border border-border bg-white px-1.5 py-0.5 text-[11px] text-ink outline-none focus:border-accent"
      >
        <option value="">sin grupo</option>
        {grupos.map((g) => (
          <option key={g.id} value={g.id}>
            {g.nombre}
          </option>
        ))}
        <option value="+">+ nuevo grupo…</option>
      </select>
    </label>
  );
}

/** Nombre y color de un grupo. Lo comparten crear (aquí) y editar (la leyenda). */
export function FormularioGrupo({
  inicial,
  accion,
  onListo,
  onCancelar,
}: {
  inicial: { nombre: string; color: string };
  accion: 'crear' | 'guardar';
  onListo: (nombre: string, color: string) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [color, setColor] = useState(inicial.color);
  const listo = () => {
    if (nombre.trim()) onListo(nombre.trim(), color);
  };

  return (
    <div className="flex flex-col gap-1.5 rounded border border-border bg-surface p-2 text-[11px]">
      <input
        type="text"
        value={nombre}
        autoFocus
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') listo();
          // Escape cierra el formulario; el panel no se entera porque
          // `useEscape` no actúa con el foco en un campo.
          if (e.key === 'Escape') onCancelar();
        }}
        placeholder="Viento, Sismo, Grúa…"
        aria-label="Nombre del grupo"
        className="rounded border border-border bg-white px-1.5 py-0.5 text-ink outline-none focus:border-accent"
      />
      <div className="flex flex-wrap items-center gap-1">
        {COLORES_GRUPO.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`Color ${c}`}
            aria-pressed={color === c}
            className={`h-4 w-4 rounded-full ${color === c ? 'ring-2 ring-ink ring-offset-1' : ''}`}
            style={{ background: c }}
          />
        ))}
        {/* El color libre: la paleta es una sugerencia, no un catálogo. */}
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          aria-label="Otro color"
          title="Otro color"
          className="h-5 w-6 cursor-pointer rounded border border-border bg-white p-0"
        />
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={listo}
          disabled={!nombre.trim()}
          className="rounded border border-accent px-2 py-0.5 text-[10px] text-accent hover:bg-accent hover:text-white disabled:opacity-40"
        >
          {accion}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:text-ink"
        >
          cancelar
        </button>
      </div>
    </div>
  );
}
