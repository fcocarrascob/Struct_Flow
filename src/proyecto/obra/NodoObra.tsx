import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ALTO, ANCHO } from '../layout';
import IconoClase, { ROTULO_CLASE } from './IconoClase';
import type { NodoDeObra } from './proyeccion';

/**
 * Un nodo de una obra: la caja de `ANCHO` × `ALTO` que coloca `../layout.ts`,
 * con puertos fijos a izquierda y derecha.
 *
 * CADA CANAL DICE UNA SOLA COSA, y ninguno pisa a otro:
 * - el BORDE es el desfase: un nodo rojo es un nombre repetido, un ciclo o un
 *   bloque con error, y se corrige en el panel;
 * - el ÍCONO y el rótulo son la clase (cálculo, biblioteca, resumen, modelo);
 * - la FRANJA izquierda y el tinte del encabezado son el grupo del usuario;
 * - la BANDERA ⚑ con borde punteado es la marca «Revisar». No es ámbar a
 *   propósito: el ámbar es el aviso de la severidad, y una marca de revisión no
 *   dice que algo esté mal, dice que alguien tiene que mirarlo.
 * Si el grupo fuera el borde, un grupo rojo escondería un error.
 */

const BORDE: Record<string, string> = {
  ok: 'border-border',
  aviso: 'border-aviso',
  error: 'border-error',
};

const PUNTO: Record<string, string> = {
  ok: 'bg-border',
  aviso: 'bg-aviso',
  error: 'bg-error',
};

export default function NodoObra({ data, selected }: NodeProps) {
  const n = data as unknown as NodoDeObra;
  const sev = n.severidad ?? 'ok';
  const grupo = n.grupo;

  return (
    <div
      style={{ width: ANCHO, minHeight: ALTO }}
      className={`relative flex flex-col rounded-lg border-2 bg-white ${BORDE[sev] ?? BORDE.ok} ${
        selected ? 'ring-2 ring-accent ring-offset-1' : ''
      }`}
      title={n.motivos.join('\n') || undefined}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-muted" />

      {grupo && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1 rounded-l-[6px]"
          style={{ background: grupo.color }}
        />
      )}

      <div
        className="flex items-baseline justify-between gap-2 rounded-t-[6px] px-3 pb-0.5 pt-2"
        style={grupo ? { background: `color-mix(in srgb, ${grupo.color} 12%, white)` } : undefined}
      >
        <span className="truncate text-[13px] font-semibold text-ink">{n.etiqueta}</span>
        <span className="flex shrink-0 items-center gap-1 text-[9px] uppercase tracking-wide text-muted">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${PUNTO[sev] ?? PUNTO.ok}`} />
          <IconoClase clase={n.clase} className="h-2.5 w-2.5" />
          {ROTULO_CLASE[n.clase] ?? n.tipo}
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center px-3 pb-2 pt-0.5">
        {n.subtitulo && (
          <p className="line-clamp-2 text-[11px] leading-snug text-muted">{n.subtitulo}</p>
        )}

        {n.motivos.length > 0 && (
          <p
            className={`mt-1 line-clamp-2 text-[10px] leading-snug ${
              sev === 'error' ? 'text-error' : 'text-aviso'
            }`}
          >
            {n.motivos[0]}
            {n.motivos.length > 1 && ` (+${n.motivos.length - 1})`}
          </p>
        )}

        {grupo && (
          <p className="mt-1 truncate text-[10px] font-medium" style={{ color: grupo.color }}>
            {grupo.nombre}
          </p>
        )}

        {n.revisar && (
          <p
            className="mt-1 flex min-w-0 items-center gap-1 self-start rounded border border-dashed border-ink/40 px-1.5 text-[10px] text-ink"
            title={n.revisar.nota || 'Marcado para revisar'}
          >
            <span aria-hidden>⚑</span>
            <span className="shrink-0 font-medium">
              Revisar{n.revisar.por === 'asistente' ? ' · asistente' : ''}
            </span>
            {n.revisar.nota && <span className="truncate text-muted">— {n.revisar.nota}</span>}
          </p>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-muted" />
    </div>
  );
}
