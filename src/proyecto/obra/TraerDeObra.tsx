import { useEffect, useMemo, useState } from 'react';
import { leerObra, listarObras } from './almacen';
import { leerDeDisco, listarEnDisco, type ResumenObra } from './almacen-disco';
import { choquesCon, nombresDefinidos } from './copia';
import type { Obra } from './modelo';
import { Dialogo, ListaSeleccion, useSeleccion } from './SeleccionNodos';

/**
 * «Traer de otra obra»: copia nodos de otra obra a la que está abierta.
 *
 * Las obras se listan del MISMO lugar donde vive esta —el disco o el
 * navegador—: mezclar los dos ofrecería traer de una obra que quizá ya se movió
 * al disco y quedó vieja en el navegador.
 *
 * Empieza sin nada marcado: se trae una pieza —la carga de viento, la zapata—,
 * no la obra entera.
 */
export default function TraerDeObra({
  destino,
  modo,
  onTraer,
  onCerrar,
}: {
  destino: Obra;
  modo: 'disco' | 'navegador';
  onTraer: (origen: Obra, ids: ReadonlySet<string>) => void;
  onCerrar: () => void;
}) {
  const [lista, setLista] = useState<ResumenObra[] | null>(null);
  const [error, setError] = useState('');
  const [elegida, setElegida] = useState('');
  const [origen, setOrigen] = useState<Obra | null>(null);
  // Lo que esta obra ya define cubre esas dependencias: traer la grúa a una obra
  // que tiene su geometría no arrastra otra geometría.
  const cubiertos = useMemo(() => nombresDefinidos(destino), [destino]);
  const sel = useSeleccion(origen, false, cubiertos);

  useEffect(() => {
    let vivo = true;
    const cargar = async (): Promise<ResumenObra[]> =>
      modo === 'disco'
        ? listarEnDisco()
        : listarObras().map((o) => ({
            id: o.id,
            nombre: o.nombre,
            creada: o.creada,
            calculos: o.calculos.length,
            vacia: o.calculos.length === 0,
          }));
    cargar()
      .then((l) => vivo && setLista(l.filter((o) => o.id !== destino.id && o.calculos > 0)))
      .catch((e: Error) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [modo, destino.id]);

  useEffect(() => {
    if (!elegida) return;
    let vivo = true;
    setOrigen(null);
    setError('');
    (modo === 'disco' ? leerDeDisco(elegida).then((l) => l?.obra ?? null) : Promise.resolve(leerObra(elegida)))
      .then((o) => {
        if (!vivo) return;
        if (o) setOrigen(o);
        else setError(`La obra «${elegida}» ya no está.`);
      })
      .catch((e: Error) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [elegida, modo]);

  const choques = useMemo(
    () => (origen ? choquesCon(destino, origen, sel.final) : []),
    [destino, origen, sel.final],
  );
  const n = sel.final.size;

  return (
    <Dialogo
      titulo="Traer nodos de otra obra"
      onCerrar={onCerrar}
      pie={
        <div className="space-y-2">
          {choques.length > 0 && (
            <p className="rounded border border-aviso px-2 py-1 text-[11px] leading-snug text-aviso">
              Esta obra ya define {choques.map((c) => `«${c}»`).join(', ')}. Si los traes, quedarán
              definidos en dos nodos y habrá que decidir cuál sobra.
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] leading-snug text-muted">
              Van al final de la obra, debajo de lo que hay, con sus grupos y sus marcas ⚑.
              Ctrl+Z los retira.
            </p>
            <button
              type="button"
              disabled={!origen || n === 0}
              onClick={() => origen && onTraer(origen, sel.final)}
              className="shrink-0 rounded border border-accent bg-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Traer {n} nodo{n === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      }
    >
      <label className="mb-3 block text-xs text-muted">
        Obra de origen
        <select
          value={elegida}
          onChange={(e) => setElegida(e.target.value)}
          disabled={!lista?.length}
          className="mt-1 w-full rounded border border-border bg-white px-2 py-1 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="">
            {lista === null ? 'Buscando obras…' : lista.length ? 'Elige una obra…' : 'No hay otras obras con nodos'}
          </option>
          {lista?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre || o.id} · {o.calculos} cálculo{o.calculos === 1 ? '' : 's'}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="mb-2 text-[11px] leading-snug text-error">{error}</p>}
      {elegida && !origen && !error && <p className="text-xs text-muted">Leyendo la obra…</p>}
      {origen && <ListaSeleccion origen={origen} sel={sel} />}
    </Dialogo>
  );
}
