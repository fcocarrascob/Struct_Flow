import { useState } from 'react';
import type { Obra } from './modelo';
import { Dialogo, ListaSeleccion, useSeleccion } from './SeleccionNodos';

/**
 * «Nueva obra a partir de esta»: una obra nueva con los nodos elegidos de otra.
 *
 * Empieza con TODO marcado, al revés que «Traer de otra obra»: quien parte de
 * una obra suele querer casi toda, y lo que sobra —la grúa de un galpón que no
 * la tiene— se quita por grupo.
 */
export default function NuevaDesde({
  origen,
  onCrear,
  onCerrar,
}: {
  origen: Obra;
  onCrear: (nombre: string, ids: ReadonlySet<string>) => Promise<void>;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(`${origen.nombre} (copia)`);
  const [creando, setCreando] = useState(false);
  const sel = useSeleccion(origen, true);
  const n = sel.final.size;

  return (
    <Dialogo
      titulo={`Nueva obra a partir de «${origen.nombre}»`}
      onCerrar={onCerrar}
      pie={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] leading-snug text-muted">
            Se copian las hojas, las planillas con sus campos atados y publicaciones, los grupos,
            las posiciones y las marcas ⚑. No se copian la lectura de SAP2000 ni las
            justificaciones: el modelo de la estructura nueva es otro.
          </p>
          <button
            type="button"
            disabled={creando || !nombre.trim()}
            onClick={async () => {
              setCreando(true);
              await onCrear(nombre, sel.final);
              setCreando(false);
            }}
            className="shrink-0 rounded border border-accent bg-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creando ? 'Creando…' : `Crear con ${n} nodo${n === 1 ? '' : 's'}`}
          </button>
        </div>
      }
    >
      <label className="mb-3 block text-xs text-muted">
        Nombre
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          autoFocus
          className="mt-1 w-full rounded border border-border bg-white px-2 py-1 text-sm text-ink outline-none focus:border-accent"
        />
      </label>
      <ListaSeleccion origen={origen} sel={sel} />
    </Dialogo>
  );
}
