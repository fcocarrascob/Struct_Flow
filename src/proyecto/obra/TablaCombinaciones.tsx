import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { CasoLeido, Combinacion, LecturaCombinaciones } from './modelo';
import {
  columnasDe,
  factorDe,
  familiaDe,
  terminoDe,
  type ColumnaCombinaciones,
} from './sap-combinaciones';

/**
 * La matriz de combinaciones del modelo: una fila por combinación, una columna
 * por caso o combinación que alguna usa, y en la celda el factor.
 *
 * Es una vista ancha, a pantalla completa como la hoja de un nodo, porque una
 * matriz de 165 × 30 no cabe en el panel lateral. Se lee en las dos direcciones:
 * por fila, qué lleva una combinación; por columna, dónde entra un caso —pulsar
 * la cabecera deja solo esas filas—.
 */

const claveDe = (c: ColumnaCombinaciones) => `${c.clase}:${c.nombre}`;

/** El color de un tipo que no es la suma lineal de siempre. */
const TIPO_CLASE: Record<string, string> = {
  Lineal: 'text-muted',
  Envolvente: 'bg-amber-100 text-amber-800',
  Absoluta: 'bg-sky-100 text-sky-800',
  SRSS: 'bg-sky-100 text-sky-800',
  Rango: 'bg-sky-100 text-sky-800',
};

export default function TablaCombinaciones({
  lectura,
  casos,
  familia,
  onFamilia,
}: {
  lectura: LecturaCombinaciones;
  casos: readonly CasoLeido[] | undefined;
  familia: string | null;
  onFamilia: (f: string | null) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState<string | null>(null);
  const [columna, setColumna] = useState<string | null>(null);
  const [soloUsadas, setSoloUsadas] = useState(true);
  const [plegadas, setPlegadas] = useState<ReadonlySet<string>>(new Set());
  const [resaltada, setResaltada] = useState<string | null>(null);
  const [colSobre, setColSobre] = useState<string | null>(null);
  const filasRef = useRef(new Map<string, HTMLTableRowElement>());

  const todasLasColumnas = useMemo(() => columnasDe(lectura.lista, casos), [lectura, casos]);
  const colFiltro = todasLasColumnas.find((c) => claveDe(c) === columna);

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return lectura.lista.filter(
      (c) =>
        (!familia || familiaDe(c.nombre) === familia) &&
        (!tipo || c.tipo === tipo) &&
        (!q || c.nombre.toLowerCase().includes(q)) &&
        (!colFiltro || terminoDe(c, colFiltro) !== undefined),
    );
  }, [lectura, familia, tipo, busqueda, colFiltro]);

  const columnas = useMemo(
    () => (soloUsadas ? columnasDe(filas, casos, lectura.lista) : todasLasColumnas),
    [soloUsadas, filas, casos, lectura, todasLasColumnas],
  );

  const grupos = useMemo(() => {
    const m = new Map<string, Combinacion[]>();
    for (const c of filas) {
      const f = familiaDe(c.nombre);
      m.set(f, [...(m.get(f) ?? []), c]);
    }
    return [...m];
  }, [filas]);

  const familias = useMemo(() => [...new Set(lectura.lista.map((c) => familiaDe(c.nombre)))], [lectura]);
  const tipos = useMemo(() => [...new Set(lectura.lista.map((c) => c.tipo))], [lectura]);
  const usoDe = useMemo(() => {
    const m = new Map<string, number>();
    for (const col of columnas) m.set(claveDe(col), filas.filter((c) => terminoDe(c, col) !== undefined).length);
    return m;
  }, [columnas, filas]);

  // Saltar a una combinación anidada: se quitan los filtros que la esconderían,
  // se despliega su familia y, ya pintada, se lleva a la vista.
  const irA = (nombre: string) => {
    const destino = lectura.lista.find((c) => c.nombre === nombre);
    if (!destino) return;
    if (!filas.includes(destino)) {
      setBusqueda('');
      setTipo(null);
      setColumna(null);
      onFamilia(null);
    }
    setPlegadas((p) => {
      const s = new Set(p);
      s.delete(familiaDe(nombre));
      return s;
    });
    setResaltada(nombre);
  };
  useEffect(() => {
    if (resaltada) filasRef.current.get(resaltada)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [resaltada, filas]);

  const alternarFamilia = (f: string) =>
    setPlegadas((p) => {
      const s = new Set(p);
      if (s.has(f)) s.delete(f);
      else s.add(f);
      return s;
    });

  const hayFiltros = !!(busqueda || tipo || familia || columna);
  const nCols = columnas.length + 2;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2 text-xs">
        <h2 className="text-sm font-semibold text-ink">
          Combinaciones{' '}
          <span className="font-normal text-muted">
            {filas.length === lectura.lista.length ? lectura.lista.length : `${filas.length} de ${lectura.lista.length}`}
          </span>
        </h2>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="buscar por nombre"
          aria-label="Buscar una combinación por nombre"
          className="w-44 rounded border border-border px-2 py-0.5 outline-none focus:border-accent"
        />
        <select
          value={familia ?? ''}
          onChange={(e) => onFamilia(e.target.value || null)}
          aria-label="Familia"
          className="rounded border border-border px-1.5 py-0.5"
        >
          <option value="">todas las familias</option>
          {familias.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select
          value={tipo ?? ''}
          onChange={(e) => setTipo(e.target.value || null)}
          aria-label="Tipo"
          className="rounded border border-border px-1.5 py-0.5"
        >
          <option value="">todos los tipos</option>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-muted">
          <input type="checkbox" checked={soloUsadas} onChange={(e) => setSoloUsadas(e.target.checked)} />
          solo columnas con valores
        </label>
        {colFiltro && (
          <span className="flex items-center gap-1 rounded bg-accent/10 px-2 py-0.5 text-accent">
            donde entra <span className="font-mono font-semibold">{colFiltro.nombre}</span>
            <button type="button" onClick={() => setColumna(null)} aria-label="Quitar el filtro de columna">
              ×
            </button>
          </span>
        )}
        {hayFiltros && (
          <button
            type="button"
            onClick={() => {
              setBusqueda('');
              setTipo(null);
              setColumna(null);
              onFamilia(null);
            }}
            className="text-muted underline hover:text-accent"
          >
            quitar filtros
          </button>
        )}
        <span className="ml-auto text-[10px] text-muted">
          Pulsa una cabecera para ver dónde entra ese caso · <span className="text-violet-700">−1</span> negativo ·{' '}
          <span className="text-accent">1 →</span> combinación anidada
        </span>
      </div>

      {/* La matriz */}
      <div className="min-h-0 flex-1 overflow-auto">
        {filas.length === 0 ? (
          <p className="p-6 text-sm text-muted">Ninguna combinación cumple los filtros.</p>
        ) : (
          <table className="border-separate border-spacing-0 text-[11px]">
            <thead className="sticky top-0 z-20 bg-white">
              <tr>
                <th className="sticky left-0 z-30 border-b border-r border-border bg-white px-3 py-1 text-left align-bottom text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Combinación
                </th>
                <th className="border-b border-border bg-white px-2 py-1 text-left align-bottom text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Tipo
                </th>
                {columnas.map((col) => {
                  const k = claveDe(col);
                  const activa = columna === k;
                  return (
                    <th
                      key={k}
                      onMouseEnter={() => setColSobre(k)}
                      onMouseLeave={() => setColSobre(null)}
                      className={`border-b border-border px-0.5 pb-1 align-bottom ${
                        activa ? 'bg-accent/15' : colSobre === k ? 'bg-slate-100' : 'bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setColumna(activa ? null : k)}
                        title={
                          (col.clase === 'combinacion' ? 'Combinación ' : 'Caso ') +
                          `${col.nombre}: ${activa ? 'quitar el filtro' : 'ver solo las combinaciones donde entra'}`
                        }
                        // La cabecera va vertical: con 30 columnas, los nombres
                        // horizontales hacen la tabla el triple de ancha.
                        className={`mx-auto block max-h-32 whitespace-nowrap font-mono text-[10px] [writing-mode:vertical-rl] rotate-180 hover:text-accent ${
                          col.clase === 'combinacion' ? 'italic text-accent' : 'text-ink'
                        } ${activa ? 'font-semibold' : ''}`}
                      >
                        {col.nombre}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {grupos.map(([f, lista]) => {
                const plegada = plegadas.has(f);
                return (
                  <Fragment key={f}>
                    <tr>
                      <td colSpan={nCols} className="border-b border-border bg-slate-50 p-0">
                        <button
                          type="button"
                          onClick={() => alternarFamilia(f)}
                          className="sticky left-0 flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-ink hover:text-accent"
                        >
                          <span className="w-3 text-muted">{plegada ? '▸' : '▾'}</span>
                          <span className="font-mono">{f}</span>
                          <span className="font-normal text-muted">{lista.length}</span>
                        </button>
                      </td>
                    </tr>
                    {!plegada &&
                      lista.map((c, i) => {
                        const esResaltada = resaltada === c.nombre;
                        const fondo = esResaltada ? 'bg-accent/15' : i % 2 ? 'bg-slate-50/60' : 'bg-white';
                        return (
                          <tr
                            key={c.nombre}
                            ref={(el) => {
                              if (el) filasRef.current.set(c.nombre, el);
                              else filasRef.current.delete(c.nombre);
                            }}
                            className="group"
                          >
                            <td
                              className={`sticky left-0 z-10 whitespace-nowrap border-b border-r border-border/60 px-3 py-0.5 font-mono text-ink group-hover:bg-slate-100 ${fondo}`}
                            >
                              {c.nombre}
                            </td>
                            <td className={`whitespace-nowrap border-b border-border/60 px-2 py-0.5 group-hover:bg-slate-100 ${fondo}`}>
                              <span className={`rounded px-1 text-[10px] ${TIPO_CLASE[c.tipo] ?? 'text-muted'}`}>{c.tipo}</span>
                            </td>
                            {columnas.map((col) => {
                              const k = claveDe(col);
                              const sf = terminoDe(c, col);
                              const enColumna = colSobre === k || columna === k;
                              return (
                                <td
                                  key={k}
                                  className={`min-w-[2.75rem] border-b border-border/60 px-1.5 py-0.5 text-right font-mono tabular-nums group-hover:bg-slate-100 ${
                                    enColumna ? 'bg-accent/5' : fondo
                                  } ${sf !== undefined && sf < 0 ? 'text-violet-700' : 'text-ink'}`}
                                >
                                  {sf === undefined ? (
                                    ''
                                  ) : col.clase === 'combinacion' ? (
                                    <button
                                      type="button"
                                      onClick={() => irA(col.nombre)}
                                      title={`Ir a ${col.nombre}`}
                                      className="text-accent hover:underline"
                                    >
                                      {factorDe(sf)} →
                                    </button>
                                  ) : (
                                    factorDe(sf)
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 bg-white">
              <tr>
                <td className="sticky left-0 z-30 border-r border-t border-border bg-white px-3 py-1 text-[10px] text-muted">
                  entra en
                </td>
                <td className="border-t border-border bg-white" />
                {columnas.map((col) => (
                  <td
                    key={claveDe(col)}
                    className="border-t border-border bg-white px-1.5 py-1 text-right font-mono text-[10px] text-muted"
                    title={`${col.nombre} entra en ${usoDe.get(claveDe(col))} de las combinaciones visibles`}
                  >
                    {usoDe.get(claveDe(col))}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
