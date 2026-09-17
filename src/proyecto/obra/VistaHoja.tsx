import { useMemo } from 'react';
import BloqueDoc from '../../components/canvas/BloqueDoc';
import { seImprime } from '../../lib/bloque';
import type { Region, SheetResults } from '../../lib/worksheet';
import { ordenDeLectura } from './hoja';

/**
 * Una hoja de la biblioteca, para leerla.
 *
 * NO ES UN `MathCanvas` DE SOLO LECTURA, y es a propósito. Un canvas que no deja
 * escribir habría que inventarlo —tiene ocho vías de escritura, seis atajos
 * globales y un historial—, y lo que hace falta acá no es un editor apagado: es
 * la hoja, leída de arriba abajo. Es la misma composición que el documento de
 * impresión, con `BloqueDoc`, así que una fórmula se ve igual que en la pestaña,
 * en el papel y en el PDF.
 *
 * Por qué de solo lectura: la fuente de verdad de una genérica es su JSON en
 * `public/biblioteca/`, y `public/biblioteca/README.md` dice que no se edita
 * encima de la que respalda una memoria. Editarla aquí no es imposible, es una
 * TRANSICIÓN: primero se desprende —y pasa a decir «salí de esta genérica, en
 * esta versión»— y recién entonces se abre para escribir.
 *
 * Se respeta `seImprime`: el mapeo a píxeles de un esquema son cálculos que la
 * figura necesita y que nadie tiene por qué leer, igual que en el papel.
 */
export default function VistaHoja({
  hoja,
  results,
  titulo,
  onDesprender,
}: {
  hoja: readonly Region[];
  results: SheetResults;
  titulo: string;
  /** Desprende la copia y la abre para editarla. */
  onDesprender: () => void;
}) {
  const bloques = useMemo(() => ordenDeLectura(hoja).filter(seImprime), [hoja]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-white px-4 py-2">
        <span className="text-xs font-semibold text-ink">{titulo}</span>
        <span className="text-[10px] text-muted">
          de la biblioteca · se lee, no se escribe
        </span>
        <button
          type="button"
          onClick={onDesprender}
          title="Copia esta hoja al nodo para poder editarla. Deja de ser una instancia de la genérica y pasa a llevar su procedencia."
          className="ml-auto rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
        >
          desprender para editarla…
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-surface px-4 py-6">
        {/* `doc-papel` es el estilo del bloque, el mismo que usan la hoja y el
            papel. El ancho es el de la caja de contenido de una A4, para que los
            cortes de línea sean los que va a tener la memoria impresa. */}
        <div className="doc-papel mx-auto w-[680px] bg-white px-6 py-8 shadow-sm">
          {bloques.map((r) => (
            <BloqueDoc key={r.id} region={r} result={results[r.id]} />
          ))}
        </div>
      </div>
    </div>
  );
}
