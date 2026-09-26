import { useMemo, useState } from 'react';
import type { Genericas } from './biblioteca';
import type { EvaluacionObra } from './evaluacion';
import type { Obra } from './modelo';
import { compararObras, type Cambio, type FilaNodo, type Tendencia } from './propuesta';
import { Dialogo } from './SeleccionNodos';

export type AutorPropuesta = 'asistente' | 'usuario' | 'plantilla';

const DE: Record<AutorPropuesta, string> = {
  asistente: 'Propuesta del asistente',
  usuario: 'Propuesta',
  plantilla: 'Actualizar a la plantilla de hoy',
};

const COLOR: Record<Tendencia, string> = { empeora: 'text-error', mejora: 'text-green-700', neutra: 'text-ink' };
const MARCA: Record<Tendencia, string> = { empeora: '▲', mejora: '▼', neutra: '' };
const ESTADO: Record<FilaNodo['estado'], string> = {
  nuevo: 'nuevo',
  quitado: 'se quita',
  modificado: 'cambia',
  afectado: 'le llega otra cosa',
};

/**
 * Una propuesta, antes de aplicarla: qué nodos cambian y cómo, con lo que empeora
 * arriba (`propuesta.ts`). Aceptar lo decide quien la abre: la llamada respalda
 * en disco y aplica la obra propuesta, que queda en el historial (Ctrl+Z).
 */
export default function DialogoPropuesta({
  autor,
  titulo,
  nota,
  antes,
  despues,
  genericas,
  evAntes,
  avisos = [],
  bloqueo,
  onAceptar,
  onRechazar,
  onCerrar,
}: {
  autor: AutorPropuesta;
  titulo: string;
  nota?: string;
  antes: Obra;
  despues: Obra;
  genericas: Genericas;
  /** La evaluación de la obra abierta, que el canvas ya tiene. */
  evAntes?: EvaluacionObra;
  /** Lo que quien arma la propuesta quiere decir: bloques conservados, nodos quitados. */
  avisos?: string[];
  /** Por qué no se puede aceptar, si no se puede. */
  bloqueo?: string;
  onAceptar: () => Promise<void> | void;
  /** Sin él, el diálogo solo se cierra (la propuesta no está guardada en ningún sitio). */
  onRechazar?: () => Promise<void> | void;
  onCerrar: () => void;
}) {
  const comparacion = useMemo(() => compararObras(antes, despues, genericas, { antes: evAntes }), [antes, despues, genericas, evAntes]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  const correr = async (fn: () => Promise<void> | void) => {
    setOcupado(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      setOcupado(false);
    }
  };

  return (
    <Dialogo
      titulo={`${DE[autor]}: ${titulo}`}
      onCerrar={onCerrar}
      ancho="max-w-3xl"
      pie={
        <div className="space-y-2" data-propuesta="pie">
          {bloqueo && <p className="rounded border border-aviso px-2 py-1 text-[11px] leading-snug text-aviso">{bloqueo}</p>}
          {error && <p className="rounded border border-error px-2 py-1 text-[11px] leading-snug text-error">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] leading-snug text-muted">
              Al aceptar se respalda la obra en disco y se aplica el cambio. Ctrl+Z lo deshace.
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={ocupado}
                data-propuesta="rechazar"
                onClick={() => (onRechazar ? correr(onRechazar) : onCerrar())}
                className="rounded border border-border px-3 py-1 text-xs text-ink hover:border-accent disabled:opacity-50"
              >
                {onRechazar ? 'Rechazar' : 'Cancelar'}
              </button>
              <button
                type="button"
                disabled={ocupado || !!bloqueo || comparacion.sinCambios}
                data-propuesta="aceptar"
                onClick={() => correr(onAceptar)}
                className="rounded border border-accent bg-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {ocupado ? 'Aplicando…' : 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div data-propuesta="cuerpo" className="space-y-3 text-xs">
        {nota && <p className="whitespace-pre-line leading-snug text-ink">{nota}</p>}
        {avisos.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-aviso">
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
        <p className="text-muted" data-propuesta="resumen">
          {comparacion.sinCambios
            ? 'Sin cambios: la obra propuesta calcula lo mismo.'
            : `${comparacion.nodos.length} nodo${comparacion.nodos.length === 1 ? '' : 's'} cambian: ${comparacion.empeoran} empeoran, ${comparacion.mejoran} mejoran.`}
        </p>
        {comparacion.nodos.map((f) => (
          <Fila key={f.id} f={f} />
        ))}
      </div>
    </Dialogo>
  );
}

function Fila({ f }: { f: FilaNodo }) {
  const { agregados, quitados, editados, renombrados } = f.bloques;
  const hayBloques = agregados.length + quitados.length + editados.length + renombrados.length > 0;
  const veredicto = f.veredicto.antes !== f.veredicto.despues;
  return (
    <section className="rounded border border-border" data-propuesta-nodo={f.id} data-tendencia={f.tendencia}>
      <header className="flex flex-wrap items-baseline gap-x-2 border-b border-border bg-surface px-2 py-1">
        <span className={`font-semibold ${COLOR[f.tendencia]}`}>
          {MARCA[f.tendencia]} {f.nombre}
        </span>
        <span className="text-[10px] text-muted">{ESTADO[f.estado]}</span>
        {veredicto && (
          <span className="ml-auto text-[11px]">
            {f.veredicto.antes ?? '—'} → <span className={COLOR[f.tendencia]}>{f.veredicto.despues ?? '—'}</span>
          </span>
        )}
      </header>
      {f.usos.length > 0 && <Tabla filas={f.usos} />}
      {(f.datos.length > 0 || hayBloques) && (
        <details className="px-2 py-1">
          <summary className="cursor-pointer text-[11px] text-muted">
            {f.datos.length > 0 && `${f.datos.length} dato${f.datos.length === 1 ? '' : 's'}`}
            {f.datos.length > 0 && hayBloques && ' · '}
            {hayBloques &&
              `bloques: ${[
                agregados.length && `${agregados.length} nuevos`,
                quitados.length && `${quitados.length} fuera`,
                editados.length && `${editados.length} cambian`,
                renombrados.length && `${renombrados.length} solo cambian de id`,
              ]
                .filter(Boolean)
                .join(' · ')}`}
          </summary>
          {f.datos.length > 0 && <Tabla filas={f.datos} />}
          {hayBloques && (
            <ul className="mt-1 space-y-0.5 font-mono text-[10px] leading-snug text-muted">
              {agregados.length > 0 && <li>+ {agregados.join(', ')}</li>}
              {quitados.length > 0 && <li>− {quitados.join(', ')}</li>}
              {editados.length > 0 && <li>~ {editados.join(', ')}</li>}
              {renombrados.length > 0 && <li title="El mismo bloque, alineado con el id de su plantilla">= {renombrados.join(', ')}</li>}
            </ul>
          )}
        </details>
      )}
    </section>
  );
}

function Tabla({ filas }: { filas: Cambio[] }) {
  return (
    <table className="w-full table-fixed border-collapse text-[11px]">
      <tbody>
        {filas.map((c) => (
          <tr key={c.nombre} className="border-t border-border/60 first:border-t-0">
            <td className="w-2/5 truncate px-2 py-0.5 font-mono text-muted" title={c.nombre}>
              {c.nombre}
            </td>
            <td className="truncate px-2 py-0.5 text-ink" title={c.antes}>
              {c.antes ?? '—'}
            </td>
            <td className={`truncate px-2 py-0.5 ${COLOR[c.tendencia]}`} title={c.despues}>
              {MARCA[c.tendencia]} {c.despues ?? '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
