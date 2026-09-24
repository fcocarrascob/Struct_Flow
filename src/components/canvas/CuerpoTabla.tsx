import type { Region } from '../../lib/worksheet';
import {
  MAX_COLUMNAS,
  MAX_FILAS,
  cambiarColumna,
  cambiarEncabezado,
  cambiarMatriz,
  columna,
  columnasDe,
  encabezadoDe,
  filasDe,
  insertarColumna,
  insertarFila,
  moverColumna,
  moverFila,
  quitarColumna,
  quitarFila,
  type EspecTabla,
} from '../../lib/tabla';
import { boton, CampoTexto, entrada, etiqueta, Seccion } from './PanelPropiedades';

/**
 * Las propiedades de una tabla: su estructura —filas, columnas, encabezado— y lo
 * que publica. El contenido de las celdas se escribe en la grilla de la hoja
 * (`EditorTabla`); aquí nunca, para que haya un solo sitio donde se teclea una
 * fórmula.
 */
interface Props {
  region: Region & { tabla: EspecTabla };
  onCambiar: (tabla: EspecTabla, titulo: string) => void;
  onListo: () => void;
}

/** Lo que se ve de una fila o una columna en la lista: su primera celda con algo. */
const muestra = (textos: string[]) => textos.find((s) => s.trim())?.trim() ?? '(vacía)';

export default function CuerpoTabla({ region, onCambiar, onListo }: Props) {
  const t = region.tabla;
  const filas = filasDe(t);
  const cols = columnasDe(t);
  const enc = encabezadoDe(t);
  const cambiar = (nueva: EspecTabla) => onCambiar(nueva, region.src);
  const botonMini = `${boton} !px-1 leading-none`;

  return (
    <>
      <Seccion titulo="Título">
        <CampoTexto
          valor={region.src}
          onChange={(v) => onCambiar(t, v)}
          placeholder="(sin título)"
          titulo="Se imprime sobre la tabla; vacío, la tabla va sin título"
          onListo={onListo}
        />
      </Seccion>

      <Seccion
        titulo={`Filas (${filas})`}
        extra={
          <button
            type="button"
            className={boton}
            disabled={filas >= MAX_FILAS}
            onClick={() => cambiar(insertarFila(t, filas))}
            title={`Añade una fila al final (hasta ${MAX_FILAS})`}
          >
            + fila
          </button>
        }
      >
        <label className="flex items-center justify-between gap-2 text-[11px] text-ink">
          Filas de encabezado
          <select
            className={`${entrada} !w-20 !font-sans`}
            value={enc}
            onChange={(e) => cambiar(cambiarEncabezado(t, Number(e.target.value)))}
            title="Van en negrita, llevan la unidad de cada columna y no entran en la matriz ni en los vectores"
          >
            {Array.from({ length: Math.min(filas, 4) + 1 }, (_, k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <ol className="flex flex-col gap-0.5">
          {t.celdas.map((fila, f) => (
            <li key={f} className="flex items-center gap-1 text-[11px]">
              <span className="w-5 shrink-0 text-right text-muted">{f + 1}</span>
              <span className={`min-w-0 flex-1 truncate font-mono ${f < enc ? 'font-semibold' : ''}`} title={fila.join(' │ ')}>
                {muestra(fila)}
              </span>
              <button type="button" className={botonMini} disabled={f === 0} onClick={() => cambiar(moverFila(t, f, -1))} title="Sube la fila">
                ↑
              </button>
              <button type="button" className={botonMini} disabled={f === filas - 1} onClick={() => cambiar(moverFila(t, f, 1))} title="Baja la fila">
                ↓
              </button>
              <button type="button" className={botonMini} disabled={filas >= MAX_FILAS} onClick={() => cambiar(insertarFila(t, f + 1))} title="Inserta una fila debajo">
                +
              </button>
              <button type="button" className={botonMini} disabled={filas <= 1} onClick={() => cambiar(quitarFila(t, f))} title="Quita la fila">
                ✕
              </button>
            </li>
          ))}
        </ol>
      </Seccion>

      <Seccion
        titulo={`Columnas (${cols})`}
        extra={
          <button
            type="button"
            className={boton}
            disabled={cols >= MAX_COLUMNAS}
            onClick={() => cambiar(insertarColumna(t, cols))}
            title={`Añade una columna al final (hasta ${MAX_COLUMNAS})`}
          >
            + columna
          </button>
        }
      >
        {Array.from({ length: cols }, (_, c) => {
          const col = columna(t, c);
          return (
            <div key={c} className="flex flex-col gap-1 rounded border border-border bg-white/60 p-1.5">
              <div className="flex items-center gap-1 text-[11px]">
                <span className="w-5 shrink-0 text-right text-muted">{c + 1}</span>
                <span className="min-w-0 flex-1 truncate font-mono" title={t.celdas.map((fila) => fila[c]).join(' │ ')}>
                  {muestra(t.celdas.map((fila) => fila[c]))}
                </span>
                <button type="button" className={botonMini} disabled={c === 0} onClick={() => cambiar(moverColumna(t, c, -1))} title="Mueve la columna a la izquierda">
                  ←
                </button>
                <button type="button" className={botonMini} disabled={c === cols - 1} onClick={() => cambiar(moverColumna(t, c, 1))} title="Mueve la columna a la derecha">
                  →
                </button>
                <button type="button" className={botonMini} disabled={cols >= MAX_COLUMNAS} onClick={() => cambiar(insertarColumna(t, c + 1))} title="Inserta una columna a la derecha">
                  +
                </button>
                <button type="button" className={botonMini} disabled={cols <= 1} onClick={() => cambiar(quitarColumna(t, c))} title="Quita la columna">
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <label className="flex flex-col gap-0.5">
                  <span className={etiqueta}>Publica como</span>
                  <CampoTexto
                    valor={col.nombre ?? ''}
                    onChange={(v) => cambiar(cambiarColumna(t, c, { nombre: v.trim() || undefined }))}
                    placeholder="vector"
                    titulo="Las celdas de cuerpo de la columna, como un vector con este nombre"
                    mono
                    onListo={onListo}
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className={etiqueta}>Unidad</span>
                  <CampoTexto
                    valor={col.unidad ?? ''}
                    onChange={(v) => cambiar(cambiarColumna(t, c, { unidad: v.trim() || undefined }))}
                    placeholder="kN/m^2"
                    titulo="La toma un valor escrito sin unidad; lo calculado se muestra en ella; va en el encabezado"
                    mono
                    onListo={onListo}
                  />
                </label>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-ink" title="Imprime solo el valor de cada celda, sin la definición ni la expresión">
                <input
                  type="checkbox"
                  checked={Boolean(col.soloValor)}
                  onChange={(e) => cambiar(cambiarColumna(t, c, { soloValor: e.target.checked || undefined }))}
                />
                Solo el valor
              </label>
            </div>
          );
        })}
      </Seccion>

      <Seccion titulo="Publica">
        <label className="flex flex-col gap-0.5">
          <span className={etiqueta}>Todo el cuerpo como matriz</span>
          <CampoTexto
            valor={t.matriz ?? ''}
            onChange={(v) => cambiar(cambiarMatriz(t, v))}
            placeholder="nombre de la matriz"
            titulo="Las filas de cuerpo × todas las columnas; cada celda tiene que ser un número"
            mono
            onListo={onListo}
          />
        </label>
        <p className="text-[10px] leading-snug text-muted">
          Una tabla de norma se lee con <code className="font-mono">interp(xs, ys, x)</code>; fuera de la tabla es un
          error, y el extremo que manda la norma se escribe a la vista con <code className="font-mono">min(max(x, a), b)</code>.
        </p>
      </Seccion>
    </>
  );
}
