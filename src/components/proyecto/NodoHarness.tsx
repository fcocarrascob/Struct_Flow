import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { NodoGrafo } from '../../lib/proyecto/contrato';
import { ALTO, ANCHO } from '../../lib/proyecto/layout';

/**
 * Un nodo del proyecto.
 *
 * El color es el DESFASE, no el tipo. Un canvas coloreado por tipo es un mapa
 * bonito de lo que hay; uno coloreado por lo que no calza es el único que sirve
 * para conducir, porque un resumen de lo que hay se lee como que todo está bien.
 *
 * Los puertos están siempre a izquierda y derecha aunque el nodo no tenga
 * aristas: un puerto que aparece y desaparece hace que las flechas salten de
 * lugar al filtrar.
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

/** Etiqueta corta del tipo, para la esquina. */
const TIPO: Record<string, string> = {
  proyecto: 'proyecto',
  norma: 'norma',
  hueco: 'hueco',
  accion: 'acción',
  carga: 'carga',
  'familia-combinacion': 'combos',
  modelo: 'modelo',
  'hoja-de-valores': 'hoja',
  planilla: 'planilla',
  lectura: 'lectura',
  documento: 'documento',
  decision: 'decisión',
  hallazgo: 'hallazgo',
};

/** Lo que se muestra bajo el título, por tipo. Nada de volcar `campos` entero:
 *  un nodo que muestra veinte claves no muestra ninguna. */
function detalle(n: NodoGrafo): string {
  const c = n.campos as Record<string, unknown>;
  switch (n.tipo) {
    case 'hoja-de-valores':
      return `${c.valores ?? 0} valores · ${c.leidos ?? 0} leídos · ${c.pruebas ?? 0} contrastes`;
    case 'planilla':
      return `${(c.entra as string[] | undefined)?.length ?? 0} entradas → ${
        (c.sale as string[] | undefined)?.length ?? 0
      } salidas`;
    case 'documento':
      return `${c.cifras ?? 0} cifras · ${c.tablas ?? 0} tablas`;
    case 'carga':
      return c.Fz_kN != null ? `${Number(c.Fz_kN).toFixed(1)} kN aplicados` : 'sin medir';
    case 'familia-combinacion':
      return `${c.n_modelo ?? 0} combos · ${c.n_resistencia ?? 0} de resistencia`;
    case 'modelo':
      return c.snapshot ? `snapshot ${c.snapshot}` : 'sin snapshot';
    case 'norma':
      return `${c.lecturas ?? 0} páginas leídas`;
    default:
      return '';
  }
}

export default function NodoHarness({ data, selected }: NodeProps) {
  const n = data as unknown as NodoGrafo;
  const sev = n.severidad ?? 'ok';
  const extra = detalle(n);

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
      {extra && <p className="mt-0.5 font-mono text-[10px] text-muted">{extra}</p>}
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

      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-muted" />
    </div>
  );
}
