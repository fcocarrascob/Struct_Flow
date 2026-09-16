import { useMemo, useState } from 'react';
import { FUNCIONES_BASE, variablesVisibles } from '../../lib/autocompletar';
import type { Region, SheetResults } from '../../lib/worksheet';
import BloqueMini from './BloqueMini';
import { nuevoBloque, type Bloque } from './modelo';

/**
 * La mini hoja de una partida: una lista de bloques, editable, evaluada con el
 * motor de siempre.
 *
 * ES UNA LISTA, NO UN LIENZO. No hay `x`/`y` que mover: el orden del array es el
 * orden de lectura, y Enter crea el siguiente bloque debajo. Es hacia donde va
 * la hoja grande según `docs/pendientes.md`, y acá se puede estrenar sin
 * arrastrar las 8.377 regiones del corpus.
 *
 * Las sugerencias salen de `variablesVisibles`, que filtra por posición de
 * lectura: una partida ve lo que definieron las de más arriba de la misma carga,
 * que es exactamente la semántica que se acordó. Por eso recibe las regiones de
 * la carga ENTERA y no solo las suyas.
 */

export default function MiniHoja({
  bloques,
  regions,
  results,
  onCambiar,
}: {
  bloques: Bloque[];
  /** Las regiones sintetizadas de toda la carga, para el alcance de nombres. */
  regions: Region[];
  results: SheetResults;
  onCambiar: (bloques: Bloque[]) => void;
}) {
  // Una partida recién creada trae su línea sembrada («CM_1 := ») y nada más.
  // Sin esto nace en rojo —«falta la expresión»— y hay que hacerle clic para
  // empezar: el error es correcto, pero llega antes de que nadie haya tenido
  // ocasión de escribir. Se abre en edición y el rojo pasa a ser lo que todavía
  // no se terminó de escribir, que es lo que es.
  const [activo, setActivo] = useState<string | null>(() =>
    bloques.length === 1 && /^\s*[^\s:]+\s*:=\s*$/.test(bloques[0].src) ? bloques[0].id : null,
  );

  const sugerencias = useMemo(
    () => (activo ? [...variablesVisibles(regions, results, activo), ...FUNCIONES_BASE] : undefined),
    [activo, regions, results],
  );

  function cambiarUno(id: string, src: string) {
    onCambiar(bloques.map((b) => (b.id === id ? { ...b, src } : b)));
  }

  function borrarUno(id: string) {
    onCambiar(bloques.filter((b) => b.id !== id));
    setActivo(null);
  }

  function agregar(tipo: 'math' | 'text', despuesDe?: string) {
    const b = nuevoBloque(tipo);
    const i = despuesDe ? bloques.findIndex((x) => x.id === despuesDe) : bloques.length - 1;
    const siguientes = [...bloques];
    siguientes.splice(i + 1, 0, b);
    onCambiar(siguientes);
    setActivo(b.id);
  }

  function salir(id: string, avanzar: boolean) {
    const b = bloques.find((x) => x.id === id);
    // Un bloque que queda vacío al salir se descarta, igual que en el canvas:
    // no es un hueco, es algo que se empezó a escribir y no se escribió.
    if (b && b.src.trim() === '') {
      onCambiar(bloques.filter((x) => x.id !== id));
      setActivo(null);
      return;
    }
    setActivo(null);
    if (avanzar) agregar('math', id);
  }

  return (
    <div>
      {/* `doc-papel` es el estilo del bloque, el mismo que usan la hoja y el
          papel; `mini-hoja` solo le baja el cuerpo para que 11 pt quepan en el
          panel. Está en global.css y no en papel.css: papel.css lo incrusta
          literal `scripts/render-planilla.mjs`, y esto no es del papel. */}
      <div className="mini-hoja doc-papel">
        {bloques.map((b) => (
          <BloqueMini
            key={b.id}
            bloque={b}
            result={results[b.id]}
            activo={activo === b.id}
            sugerencias={activo === b.id ? sugerencias : undefined}
            onCambiar={(src) => cambiarUno(b.id, src)}
            onActivar={() => setActivo(b.id)}
            onSalir={(avanzar) => salir(b.id, avanzar)}
            onBorrar={() => borrarUno(b.id)}
          />
        ))}
      </div>

      {bloques.length === 0 && (
        <p className="px-1.5 py-2 text-[11px] leading-snug text-muted">
          La hoja está vacía. Agrega una fórmula que defina la variable de la partida.
        </p>
      )}

      <div className="mt-2 flex gap-1">
        <button
          type="button"
          onClick={() => agregar('math')}
          className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
        >
          + fórmula
        </button>
        <button
          type="button"
          onClick={() => agregar('text')}
          className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
        >
          + texto
        </button>
      </div>
    </div>
  );
}
