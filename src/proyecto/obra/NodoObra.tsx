import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { NodoGrafo } from '../contrato';
import { ALTO, ANCHO } from '../layout';

/**
 * Un nodo de una obra.
 *
 * Mismo aspecto que `../NodoHarness.tsx` —misma caja, mismo color por severidad,
 * mismos puertos fijos a izquierda y derecha— y aun así es otro componente a
 * propósito: el `detalle()` de aquel lee `campos.Fz_kN`, que es vocabulario del
 * harness, y acá los campos los escribe el usuario. Los dos van a separarse más
 * en cuanto el nodo de obra reciba gestos de edición; si aparece un tercero, ahí
 * vale la pena extraer la tarjeta.
 *
 * El color sigue siendo el DESFASE y no el tipo: un nodo rojo es una carga sin
 * nombre o con el nombre repetido, y se corrige en el panel.
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

const TIPO: Record<string, string> = {
  cargas: 'definiciones',
  carga: 'carga',
  'carga-plegada': 'carga',
  subcarga: 'partida',
  calculo: 'cálculo',
};

export default function NodoObra({ data, selected }: NodeProps) {
  const n = data as unknown as NodoGrafo;
  const sev = n.severidad ?? 'ok';

  return (
    <div
      style={{ width: ANCHO, minHeight: ALTO }}
      className={`flex flex-col justify-center rounded-lg border-2 bg-white px-3 py-2 ${
        BORDE[sev] ?? BORDE.ok
      } ${selected ? 'ring-2 ring-accent ring-offset-1' : ''}`}
      title={n.motivos.join('\n') || undefined}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-muted" />

      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-semibold text-ink">{n.etiqueta}</span>
        <span className="flex shrink-0 items-center gap-1 text-[9px] uppercase tracking-wide text-muted">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${PUNTO[sev] ?? PUNTO.ok}`} />
          {TIPO[n.tipo] ?? n.tipo}
        </span>
      </div>

      {n.subtitulo && (
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">{n.subtitulo}</p>
      )}

      {n.motivos.length > 0 ? (
        <p
          className={`mt-1 line-clamp-2 text-[10px] leading-snug ${
            sev === 'error' ? 'text-error' : 'text-aviso'
          }`}
        >
          {n.motivos[0]}
          {n.motivos.length > 1 && ` (+${n.motivos.length - 1})`}
        </p>
      ) : (
        <p className="mt-1 text-[10px] text-muted/70">clic para editar</p>
      )}

      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-muted" />
    </div>
  );
}
