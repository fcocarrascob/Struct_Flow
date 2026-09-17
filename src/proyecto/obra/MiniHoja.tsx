import { useMemo, useState } from 'react';
import { FUNCIONES_BASE, variablesVisibles } from '../../lib/autocompletar';
import type { Region, SheetResults } from '../../lib/worksheet';
import BloqueMini from './BloqueMini';
import { insertarEnHoja, ordenDeLectura } from './hoja';
import { nuevaRegion } from './modelo';

/**
 * La hoja de un nodo, vista como una lista: editable, evaluada con el motor de
 * siempre.
 *
 * ES UNA VISTA EN ORDEN DE LECTURA, NO OTRO DATO. Las regiones llevan `x`/`y`
 * —son las mismas que abre el canvas matemático— y acá se pintan ordenadas por
 * `(y, x)`, que es el mismo criterio con el que el motor resuelve el scope. Las
 * dos vistas editan lo mismo, así que el día que la hoja grande migre al flujo
 * lineal las coordenadas desaparecen de las dos a la vez.
 *
 * Por eso insertar y borrar NO renumeran: las reglas están en `./hoja`, y son
 * las que impiden que escribir una línea acá deshaga la disposición hecha en el
 * canvas.
 *
 * Las sugerencias salen de `variablesVisibles`, que filtra por posición de
 * lectura: una partida ve lo que definieron las de más arriba de la misma carga,
 * que es exactamente la semántica que se acordó. Por eso recibe las regiones de
 * la carga ENTERA y no solo las suyas.
 */

export default function MiniHoja({
  hoja,
  regions,
  results,
  onCambiar,
}: {
  hoja: Region[];
  /** Las regiones de toda la obra, para el alcance de nombres. */
  regions: Region[];
  results: SheetResults;
  onCambiar: (hoja: Region[]) => void;
}) {
  const bloques = useMemo(() => ordenDeLectura(hoja), [hoja]);
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
    onCambiar(hoja.map((b) => (b.id === id ? { ...b, src } : b)));
  }

  function borrarUno(id: string) {
    // Se quita y el hueco se queda. Renumerar el resto destruiría la disposición
    // hecha en el canvas, y los huecos son deliberados: 39 espaciadores en el
    // corpus, 16 solo en `anclajes-pedestal`.
    onCambiar(hoja.filter((b) => b.id !== id));
    setActivo(null);
  }

  function agregar(kind: 'math' | 'text', despuesDe?: string) {
    const b = nuevaRegion(kind);
    onCambiar(insertarEnHoja(hoja, b, despuesDe));
    setActivo(b.id);
  }

  // `src` es el texto con el que el bloque SALE, y lo dice quien sale: al
  // cancelar con Escape, el editor restaura el texto que había al entrar y esa
  // restauración todavía no llegó a `bloques`. Leyéndolo de aquí, un bloque que
  // se vació y se canceló se borraba **con su contenido**: el `onCambiar` de la
  // restauración y este partían del mismo array y el segundo pisaba al primero.
  function salir(id: string, avanzar: boolean, src: string) {
    // Un bloque que queda vacío al salir se descarta, igual que en el canvas:
    // no es un hueco, es algo que se empezó a escribir y no se escribió.
    if (src.trim() === '') {
      onCambiar(hoja.filter((x) => x.id !== id));
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
            onSalir={(avanzar, src) => salir(b.id, avanzar, src)}
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
