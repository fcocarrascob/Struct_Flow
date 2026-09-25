import { useMemo, useState, type ReactNode } from 'react';
import type {
  ConexionSap,
  ConjuntoDiseno,
  Gobernante,
  GobernantesDeApoyo,
  LecturaApoyos,
  LecturaConjunto,
  SistemaUnidades,
} from './modelo';
import { cantidad } from './sap-basal';
import { estadoConjunto } from './sap-apoyos';

/**
 * La tabla de las reacciones en los apoyos de un caso: una fila por apoyo, con
 * su ubicación y sus seis componentes, más el corte horizontal.
 *
 * Una vista ancha, a pantalla completa como la de combinaciones. El caso se
 * elige arriba (o se recorre con ← →); una columna se ordena pulsando su
 * cabecera, y el extremo de cada columna va resaltado. Al pie, las sumas: la
 * de F3 es la FZ de la reacción basal del caso.
 */

type Columna = 'apoyo' | 'F1' | 'F2' | 'F3' | 'V' | 'M1' | 'M2' | 'M3';

const COLUMNAS: { clave: Columna; titulo: string; ayuda: string; momento?: boolean }[] = [
  { clave: 'F1', titulo: 'F1', ayuda: 'Fuerza en el eje 1 del nudo (X en un apoyo corriente)' },
  { clave: 'F2', titulo: 'F2', ayuda: 'Fuerza en el eje 2 del nudo (Y)' },
  { clave: 'F3', titulo: 'F3', ayuda: 'Fuerza vertical. Positiva: compresión sobre la fundación; negativa: tracción' },
  { clave: 'V', titulo: 'V', ayuda: 'Corte horizontal, √(F1² + F2²)' },
  { clave: 'M1', titulo: 'M1', ayuda: 'Momento alrededor del eje 1', momento: true },
  { clave: 'M2', titulo: 'M2', ayuda: 'Momento alrededor del eje 2', momento: true },
  { clave: 'M3', titulo: 'M3', ayuda: 'Momento alrededor del eje 3 (torsión)', momento: true },
];

/** El prefijo de la vista de un conjunto en el selector: `conjunto:<id>`. */
const PREFIJO_CONJUNTO = 'conjunto:';

/**
 * La tabla de apoyos: un caso, o un conjunto de diseño. El selector de arriba
 * recorre los dos, y ← → pasan de uno al siguiente.
 */
export default function TablaApoyos({
  lectura,
  unidades,
  caso,
  onCaso,
  conjuntos,
  sap,
}: {
  lectura: LecturaApoyos;
  unidades: SistemaUnidades;
  /** El nombre de un caso, o `conjunto:<id>`. */
  caso: string | null;
  onCaso: (c: string) => void;
  conjuntos: readonly ConjuntoDiseno[];
  sap: ConexionSap;
}) {
  const opciones = [
    ...lectura.casos.map((c) => c.caso),
    ...conjuntos.filter((c) => sap.conjuntos?.[c.id]).map((c) => PREFIJO_CONJUNTO + c.id),
  ];
  const k = Math.max(0, caso ? opciones.indexOf(caso) : 0);
  const vista = opciones[k];
  const conjunto = vista?.startsWith(PREFIJO_CONJUNTO)
    ? conjuntos.find((c) => PREFIJO_CONJUNTO + c.id === vista)
    : undefined;

  const selector = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => k > 0 && onCaso(opciones[k - 1])}
        disabled={k === 0}
        aria-label="Anterior"
        className="rounded border border-border px-1.5 py-0.5 text-muted hover:text-accent disabled:opacity-40"
      >
        ←
      </button>
      <select
        value={vista ?? ''}
        onChange={(e) => onCaso(e.target.value)}
        aria-label="Caso o conjunto"
        className="rounded border border-border px-1.5 py-0.5 font-mono"
      >
        <optgroup label="Casos">
          {lectura.casos.map((c) => (
            <option key={c.caso} value={c.caso}>
              {c.caso}
            </option>
          ))}
        </optgroup>
        {opciones.some((o) => o.startsWith(PREFIJO_CONJUNTO)) && (
          <optgroup label="Conjuntos de diseño">
            {conjuntos
              .filter((c) => sap.conjuntos?.[c.id])
              .map((c) => (
                <option key={c.id} value={PREFIJO_CONJUNTO + c.id}>
                  {c.nombre}
                </option>
              ))}
          </optgroup>
        )}
      </select>
      <button
        type="button"
        onClick={() => k < opciones.length - 1 && onCaso(opciones[k + 1])}
        disabled={k >= opciones.length - 1}
        aria-label="Siguiente"
        className="rounded border border-border px-1.5 py-0.5 text-muted hover:text-accent disabled:opacity-40"
      >
        →
      </button>
    </div>
  );

  if (conjunto && sap.conjuntos?.[conjunto.id]) {
    return (
      <VistaConjunto
        conjunto={conjunto}
        lectura={sap.conjuntos[conjunto.id]}
        apoyos={lectura}
        unidades={unidades}
        selector={selector}
        estado={estadoConjunto(conjunto, sap.conjuntos[conjunto.id], sap)}
      />
    );
  }
  return <VistaCaso lectura={lectura} unidades={unidades} caso={vista} selector={selector} />;
}

function VistaCaso({
  lectura,
  unidades,
  caso,
  selector,
}: {
  lectura: LecturaApoyos;
  unidades: SistemaUnidades;
  caso: string | undefined;
  selector: ReactNode;
}) {
  const [orden, setOrden] = useState<{ col: Columna; desc: boolean }>({ col: 'apoyo', desc: false });
  const actual = lectura.casos.find((c) => c.caso === caso) ?? lectura.casos[0];
  const espectral = actual?.paso === 'Max';

  const filas = useMemo(() => {
    if (!actual) return [];
    const base = lectura.apoyos.map((a, k) => {
      const v = actual.valores[k];
      return {
        apoyo: a.nombre,
        xyz: a.xyz,
        v: v ? { F1: v[0], F2: v[1], F3: v[2], V: Math.hypot(v[0], v[1]), M1: v[3], M2: v[4], M3: v[5] } : null,
      };
    });
    const clave = orden.col;
    const valor = (f: (typeof base)[number]) =>
      clave === 'apoyo' ? Number(f.apoyo) || f.apoyo : f.v ? f.v[clave] : -Infinity;
    return [...base].sort((a, b) => {
      const x = valor(a);
      const y = valor(b);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return orden.desc ? -c : c;
    });
  }, [lectura, actual, orden]);

  // El extremo de cada columna: el de mayor valor absoluto.
  const extremo = useMemo(() => {
    const m: Partial<Record<Columna, string>> = {};
    for (const { clave } of COLUMNAS) {
      let mejor = 0;
      for (const f of filas) {
        const x = f.v ? Math.abs(f.v[clave as Exclude<Columna, 'apoyo'>]) : 0;
        if (x > mejor + 1e-9) {
          mejor = x;
          m[clave] = f.apoyo;
        }
      }
    }
    return m;
  }, [filas]);

  const suma = (k: 'F1' | 'F2' | 'F3') => filas.reduce((s, f) => s + (f.v ? f.v[k] : 0), 0);
  const alternar = (col: Columna) =>
    setOrden((o) => (o.col === col ? { col, desc: !o.desc } : { col, desc: col !== 'apoyo' }));
  const flecha = (col: Columna) => (orden.col === col ? (orden.desc ? ' ↓' : ' ↑') : '');

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2 text-xs">
        <h2 className="text-sm font-semibold text-ink">
          Reacciones en apoyos <span className="font-normal text-muted">{lectura.apoyos.length} apoyos</span>
        </h2>
        {selector}
        {espectral && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
            espectro: máximos sin signo, no concurrentes
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted">
          Fuerzas en {unidades}, momentos en {unidades}·m, ejes del nudo · F3 positiva es compresión ·{' '}
          <span className="text-violet-700">tracción</span> · pulsa una cabecera para ordenar
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0 font-mono text-[11px] tabular-nums">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="whitespace-nowrap text-right font-sans text-[10px] uppercase tracking-wide text-muted">
              <th className="border-b border-border px-3 py-1.5 text-left font-semibold">
                <button type="button" onClick={() => alternar('apoyo')} className="uppercase hover:text-accent">
                  Nudo{flecha('apoyo')}
                </button>
              </th>
              <th className="border-b border-border px-2 font-semibold">X [m]</th>
              <th className="border-b border-border px-2 font-semibold">Y [m]</th>
              <th className="border-b border-r border-border px-2 font-semibold">Z [m]</th>
              {COLUMNAS.map((c) => (
                <th key={c.clave} className="border-b border-border px-2 font-semibold" title={c.ayuda}>
                  <button type="button" onClick={() => alternar(c.clave)} className="uppercase hover:text-accent">
                    {c.titulo}
                    {flecha(c.clave)}
                  </button>
                </th>
              ))}
              <th className="w-full border-b border-border" />
            </tr>
          </thead>
          <tbody>
            {filas.map((f, k) => (
              <tr key={f.apoyo} className={`text-right ${k % 2 ? 'bg-slate-50/60' : ''} hover:bg-slate-100`}>
                <td className="border-b border-border/60 px-3 py-0.5 text-left text-ink">{f.apoyo}</td>
                {[0, 1, 2].map((d) => (
                  <td key={d} className={`border-b border-border/60 px-2 text-muted ${d === 2 ? 'border-r' : ''}`}>
                    {f.xyz ? f.xyz[d].toFixed(2).replace('.', ',') : '—'}
                  </td>
                ))}
                {COLUMNAS.map((c) => {
                  const x = f.v ? f.v[c.clave as Exclude<Columna, 'apoyo'>] : undefined;
                  const esExtremo = extremo[c.clave] === f.apoyo;
                  const traccion = c.clave === 'F3' && x !== undefined && x < -1e-3 && !espectral;
                  return (
                    <td
                      key={c.clave}
                      className={`min-w-[4.5rem] border-b border-border/60 px-2 ${
                        esExtremo ? 'bg-accent/10 font-semibold' : ''
                      } ${traccion ? 'text-violet-700' : c.momento ? 'text-muted' : 'text-ink'}`}
                      title={traccion ? 'Tracción: la estructura tira de la fundación' : undefined}
                    >
                      {x === undefined ? '—' : cantidad(x, unidades)}
                    </td>
                  );
                })}
                <td className="border-b border-border/60" />
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-white">
            <tr className="text-right text-[10px] text-muted">
              <td className="border-t border-border px-3 py-1 text-left font-sans">suma</td>
              <td className="border-t border-border" colSpan={2} />
              <td className="border-r border-t border-border" />
              {COLUMNAS.map((c) => (
                <td key={c.clave} className="border-t border-border px-2">
                  {c.clave === 'F1' || c.clave === 'F2' || c.clave === 'F3'
                    ? espectral
                      ? '—'
                      : cantidad(suma(c.clave), unidades)
                    : ''}
                </td>
              ))}
              <td className="border-t border-border" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

type Criterio = keyof GobernantesDeApoyo;

/**
 * Qué muestra cada criterio: su valor, y los que lo acompañan de la misma
 * combinación (la N con el corte, el V con la compresión…).
 */
const CRITERIOS: {
  clave: Criterio;
  titulo: string;
  valor: string;
  momento?: boolean;
  acompanan: { titulo: string; de: (v: Gobernante['v']) => number; momento?: boolean }[];
}[] = [
  {
    clave: 'compresion',
    titulo: 'Compresión máx.',
    valor: 'N',
    acompanan: [
      { titulo: 'V', de: (v) => Math.hypot(v[0], v[1]) },
      { titulo: 'M', de: (v) => Math.hypot(v[3], v[4]), momento: true },
    ],
  },
  {
    clave: 'traccion',
    titulo: 'Tracción máx.',
    valor: 'T',
    acompanan: [{ titulo: 'V', de: (v) => Math.hypot(v[0], v[1]) }],
  },
  {
    clave: 'corte',
    titulo: 'Corte máx.',
    valor: 'V',
    acompanan: [{ titulo: 'N', de: (v) => v[2] }],
  },
  {
    clave: 'momento',
    titulo: 'Momento máx.',
    valor: 'M',
    momento: true,
    acompanan: [{ titulo: 'N', de: (v) => v[2] }],
  },
];

/**
 * Un conjunto de diseño: por apoyo, la combinación que gobierna cada criterio,
 * su valor y los que la acompañan. Lo no concurrente —de una combinación con
 * espectro o envolvente— lleva ≠: no es de un mismo instante.
 */
function VistaConjunto({
  conjunto,
  lectura,
  apoyos,
  unidades,
  selector,
  estado,
}: {
  conjunto: ConjuntoDiseno;
  lectura: LecturaConjunto;
  apoyos: LecturaApoyos;
  unidades: SistemaUnidades;
  selector: ReactNode;
  estado: ReturnType<typeof estadoConjunto>;
}) {
  const [orden, setOrden] = useState<{ col: Criterio | 'apoyo'; desc: boolean }>({ col: 'apoyo', desc: false });
  const xyz = new Map(apoyos.apoyos.map((a) => [a.nombre, a.xyz]));

  const filas = useMemo(() => {
    const base = lectura.apoyos.map((apoyo, j) => ({ apoyo, g: lectura.porApoyo[j] }));
    const valor = (f: (typeof base)[number]) =>
      orden.col === 'apoyo' ? Number(f.apoyo) || f.apoyo : (f.g[orden.col]?.valor ?? -Infinity);
    return [...base].sort((a, b) => {
      const x = valor(a);
      const y = valor(b);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return orden.desc ? -c : c;
    });
  }, [lectura, orden]);

  const maximo = useMemo(() => {
    const m: Partial<Record<Criterio, string>> = {};
    for (const { clave } of CRITERIOS) {
      let mejor = 0;
      for (const f of filas) {
        const x = f.g[clave]?.valor ?? 0;
        if (x > mejor + 1e-9) {
          mejor = x;
          m[clave] = f.apoyo;
        }
      }
    }
    return m;
  }, [filas]);

  const alternar = (col: Criterio | 'apoyo') =>
    setOrden((o) => (o.col === col ? { col, desc: !o.desc } : { col, desc: col !== 'apoyo' }));
  const flecha = (col: Criterio | 'apoyo') => (orden.col === col ? (orden.desc ? ' ↓' : ' ↑') : '');
  const ne = (g: Gobernante) =>
    g.concurrente ? null : (
      <span className="text-amber-700" title="No concurrente: la combinación lleva espectro o envolvente">
        {' '}
        ≠
      </span>
    );

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2 text-xs">
        <h2 className="text-sm font-semibold text-ink">
          {conjunto.nombre}{' '}
          <span className="font-normal text-muted">
            {lectura.combos.length} combinaciones · {lectura.apoyos.length} apoyos
          </span>
        </h2>
        {selector}
        <span className="font-mono text-[10px] text-muted">{conjunto.familias.join(' · ')}</span>
        {estado.estado === 'desactualizado' && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Desactualizado: {estado.motivo}</span>
        )}
        <span className="ml-auto text-[10px] text-muted">
          Fuerzas en {unidades}, momentos en {unidades}·m · N y T sobre la fundación · ≠ no concurrente (
          {lectura.noConcurrentes.length} de {lectura.combos.length}) · pulsa una cabecera para ordenar
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0 font-mono text-[11px] tabular-nums">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="whitespace-nowrap font-sans text-[10px] uppercase tracking-wide text-muted">
              <th className="px-3 pt-1.5 text-left font-semibold" rowSpan={2}>
                <button type="button" onClick={() => alternar('apoyo')} className="uppercase hover:text-accent">
                  Nudo{flecha('apoyo')}
                </button>
              </th>
              <th className="px-2 pt-1.5 text-right font-semibold" rowSpan={2}>
                X [m]
              </th>
              <th className="border-r border-border px-2 pt-1.5 text-right font-semibold" rowSpan={2}>
                Y [m]
              </th>
              {CRITERIOS.map((c) => (
                <th
                  key={c.clave}
                  colSpan={2 + c.acompanan.length}
                  className="border-r border-border px-2 pt-1.5 text-center font-semibold"
                >
                  <button type="button" onClick={() => alternar(c.clave)} className="uppercase hover:text-accent">
                    {c.titulo}
                    {flecha(c.clave)}
                  </button>
                </th>
              ))}
              <th className="w-full" rowSpan={2} />
            </tr>
            <tr className="whitespace-nowrap text-right font-sans text-[10px] text-muted">
              {CRITERIOS.map((c) => [
                <th key={`${c.clave}-v`} className="border-b border-border px-2 pb-1 font-semibold text-ink">
                  {c.valor}
                </th>,
                <th key={`${c.clave}-c`} className="border-b border-border px-2 pb-1 text-left font-normal">
                  combinación
                </th>,
                ...c.acompanan.map((a, i) => (
                  <th
                    key={`${c.clave}-${a.titulo}`}
                    className={`border-b border-border px-2 pb-1 font-normal ${
                      i === c.acompanan.length - 1 ? 'border-r' : ''
                    }`}
                  >
                    {a.titulo}
                  </th>
                )),
              ])}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, k) => {
              const p = xyz.get(f.apoyo);
              return (
                <tr key={f.apoyo} className={`text-right ${k % 2 ? 'bg-slate-50/60' : ''} hover:bg-slate-100`}>
                  <td className="border-b border-border/60 px-3 py-0.5 text-left text-ink">{f.apoyo}</td>
                  <td className="border-b border-border/60 px-2 text-muted">{p ? p[0].toFixed(2).replace('.', ',') : '—'}</td>
                  <td className="border-b border-r border-border/60 px-2 text-muted">
                    {p ? p[1].toFixed(2).replace('.', ',') : '—'}
                  </td>
                  {CRITERIOS.map((c) => {
                    const g = f.g[c.clave];
                    const esMax = maximo[c.clave] === f.apoyo;
                    if (!g) {
                      return (
                        <td
                          key={c.clave}
                          colSpan={2 + c.acompanan.length}
                          className="border-b border-r border-border/60 px-2 text-center text-muted"
                        >
                          —
                        </td>
                      );
                    }
                    return [
                      <td
                        key={`${c.clave}-v`}
                        className={`border-b border-border/60 px-2 ${esMax ? 'bg-accent/10 font-semibold' : ''} ${
                          c.clave === 'traccion' ? 'text-violet-700' : 'text-ink'
                        }`}
                      >
                        {cantidad(g.valor, unidades)}
                      </td>,
                      <td
                        key={`${c.clave}-c`}
                        className="whitespace-nowrap border-b border-border/60 px-2 text-left text-[10px] text-muted"
                      >
                        {g.combo}
                        {ne(g)}
                      </td>,
                      ...c.acompanan.map((a, i) => (
                        <td
                          key={`${c.clave}-${a.titulo}`}
                          className={`border-b border-border/60 px-2 ${g.concurrente ? 'text-muted' : 'text-amber-700/80'} ${
                            i === c.acompanan.length - 1 ? 'border-r' : ''
                          }`}
                          title={g.concurrente ? undefined : 'No concurrente: extremo de la componente, no del mismo instante'}
                        >
                          {cantidad(a.de(g.v), unidades)}
                        </td>
                      )),
                    ];
                  })}
                  <td className="border-b border-border/60" />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
