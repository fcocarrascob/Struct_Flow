import { lazy, Suspense, useState } from 'react';
import type { SheetResults } from '../../lib/worksheet';
import type { VistaEvaluada } from '../vistas/evaluar';
import VistaHoja from './VistaHoja';

// three.js viaja en su propio bloque del bundle: solo se descarga al abrir el 3D.
const Vista3D = lazy(() => import('../vistas/Vista3D'));

/**
 * La pestaña de una vista geométrica: su hoja —la que vota y se imprime, con el
 * dibujo 2D al pie— o el modelo en 3D. Las dos salen del mismo modelo.
 */
export default function PestanaVista({
  vista,
  results,
  titulo,
  inicial = 'hoja',
}: {
  vista: VistaEvaluada;
  results: SheetResults;
  titulo: string;
  /** Con qué se abre: la hoja o el 3D. */
  inicial?: 'hoja' | '3d';
}) {
  const [modo, setModo] = useState<'hoja' | '3d'>(inicial);
  const boton = (m: 'hoja' | '3d', texto: string) => (
    <button
      type="button"
      onClick={() => setModo(m)}
      aria-pressed={modo === m}
      className={`rounded border px-2 py-0.5 text-[10px] ${
        modo === m ? 'border-accent text-accent' : 'border-border text-muted hover:border-accent hover:text-accent'
      }`}
    >
      {texto}
    </button>
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-white px-4 py-1.5">
        {boton('hoja', 'hoja y dibujo')}
        {boton('3d', '3D')}
      </div>
      <div className="min-h-0 flex-1">
        {modo === 'hoja' ? (
          <VistaHoja hoja={vista.hoja} results={results} titulo={titulo} procedencia="vista geométrica" />
        ) : (
          <Suspense fallback={<p className="p-4 text-xs text-muted">Cargando el 3D…</p>}>
            <Vista3D modelo={vista.modelo} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
