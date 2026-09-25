import type { Instanciada } from './evaluacion';
import { problemaDeAlias, type Frontera } from './modelo';
import { opcionApagada } from '../vistas/registro';

/** Un número del modelo con coma decimal, como lo escribe el resto de la aplicación. */
const num = (v: number) => String(v).replace('.', ',');

/**
 * El panel de una vista geométrica (`procedencia: 'vista'`).
 *
 * Tres partes, en el orden en que se leen: las verificaciones —lo que la vista
 * tiene que decir—, lo que publica —los valores que salen de la geometría y
 * vuelven a los cálculos— y los datos —cada uno atado a la obra o con su valor
 * propio, que entonces es un supuesto—.
 */
export default function FichaVista({
  frontera,
  instancia,
  otrosAlias,
  onEntrada,
  onFormula,
  onConfig,
  onPublicar,
  onAbrirHoja,
  onAbrir3D,
}: {
  frontera: Frontera;
  instancia: Instanciada | undefined;
  otrosAlias: ReadonlySet<string>;
  /** Abre la hoja sintetizada, con el dibujo al pie, en una pestaña. */
  onAbrirHoja: () => void;
  /** Abre la misma pestaña, directo en el 3D. */
  onAbrir3D: () => void;
  onEntrada: (nombre: string, valor: number) => void;
  onFormula: (campo: string, expr: string | undefined) => void;
  onConfig: (clave: string, variante: string) => void;
  onPublicar: (salida: string, alias: string | undefined) => void;
}) {
  const vista = instancia?.vista;
  if (!vista) {
    return (
      <p className="text-[11px] leading-snug text-error">
        Esta versión de Flow no conoce la vista «{frontera.vista}».
      </p>
    );
  }
  const { def, config, campos, modelo, datos, errores } = vista;
  const publica = frontera.publica ?? {};
  const formulas = frontera.formulas ?? {};
  // Un campo de un componente ausente conserva su atadura, pero no cuenta ni se muestra.
  const atadosActivos = campos.filter((c) => formulas[c.nombre]).length;
  const publicables = [...modelo.derivados.map((d) => d.nombre), 'v_global'];
  const enFalso = modelo.chequeos.filter((c) => !c.cumple && !c.aviso).length;
  const errorDe = new Map(errores.map((e) => [e.campo, e.error]));
  const dibujo = vista.hoja.find((r) => r.kind === 'image');

  return (
    <div>
      <header className="mb-2">
        <p className="font-mono text-[10px] text-muted">
          vista geométrica «{def.id}» · versión {def.version}
        </p>
        <button
          type="button"
          onClick={onAbrirHoja}
          title="La hoja que vota y se imprime, con el dibujo al pie, en una pestaña"
          className="mt-2 rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
        >
          abrir la hoja y el dibujo ↗
        </button>
        <button
          type="button"
          onClick={onAbrir3D}
          title="El modelo en 3D, en una pestaña: se gira, se acerca y se ocultan piezas por tipo"
          className="ml-1.5 mt-2 rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
        >
          ver en 3D ↗
        </button>
        {dibujo && (
          // El mismo dibujo que la hoja imprime, en chico: planta y elevaciones.
          <img src={dibujo.src} alt="Planta y elevaciones de la base" className="mt-2 w-full rounded border border-border" />
        )}
      </header>

      {/* ── Configuración ────────────────────────────────────────────────── */}
      {def.opciones.length > 0 && (
        <section className="mt-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">Configuración</h4>
          {frontera.ensamble && (
            <p className="mt-1 text-[11px] leading-snug text-muted">
              Armada con su grupo para <span className="font-mono text-ink">{frontera.ensamble.grupoSap}</span> (sufijo{' '}
              <span className="font-mono">_{frontera.ensamble.tipo}</span>, conjuntos{' '}
              <span className="font-mono">{frontera.ensamble.diseno}</span> y{' '}
              <span className="font-mono">{frontera.ensamble.sobrerresistencia}</span>). Cambiar un componente agrega o
              quita su cálculo, sus datos y sus ataduras.
            </p>
          )}
          <ul className="mt-1.5 space-y-1">
            {def.opciones.map((o) => (
              <li key={o.clave} className="flex items-center gap-1.5">
                <span className="w-32 shrink-0 text-[11px] text-ink">{o.titulo}</span>
                <select
                  value={config[o.clave]}
                  onChange={(e) => onConfig(o.clave, e.target.value)}
                  aria-label={o.titulo}
                  disabled={opcionApagada(o, config)}
                  title={opcionApagada(o, config) ? `No aplica: ${o.soloSiTexto ?? o.soloSi}` : undefined}
                  className="min-w-0 flex-1 rounded border border-border bg-white px-1 py-0.5 text-[11px] text-ink outline-none focus:border-accent"
                >
                  {o.variantes.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.titulo}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Verificaciones ───────────────────────────────────────────────── */}
      <section className="mt-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          Verificaciones · {enFalso ? `${enFalso} en falso de ${modelo.chequeos.length}` : `las ${modelo.chequeos.length} cumplen`}
        </h4>
        <ul className="mt-1.5 space-y-1">
          {modelo.chequeos.map((c) => (
            <li key={c.id} className="flex items-baseline gap-1.5 text-[11px] leading-snug">
              <span
                className={c.cumple ? 'text-emerald-600' : c.aviso ? 'text-[color:var(--color-aviso)]' : 'text-error'}
                title={c.aviso ? 'Aviso: no vota en el CUMPLE / NO CUMPLE' : undefined}
              >
                {c.cumple ? '✓' : c.aviso ? '⚠' : '✗'}
              </span>
              <span className="min-w-0 flex-1 text-ink">{c.texto}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted">
                {num(c.valor)} {c.sentido === '>=' ? '≥' : '≤'} {num(c.limite)} {c.unidad}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Lo que sale ──────────────────────────────────────────────────── */}
      <section className="mt-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          Publica · {Object.keys(publica).length} de {publicables.length}
        </h4>
        <ul className="mt-1.5 space-y-1">
          {publicables.map((n) => {
            const d = modelo.derivados.find((x) => x.nombre === n);
            const alias = publica[n];
            const marcada = alias !== undefined;
            const problema = marcada
              ? problemaDeAlias(alias) ||
                (otrosAlias.has(alias.trim()) ? `«${alias.trim()}» ya lo publica otro nodo: los dos se quedarían sin dueño.` : '')
              : '';
            return (
              <li key={n}>
                <label className="flex flex-wrap items-center gap-1.5">
                  <input type="checkbox" checked={marcada} onChange={(e) => onPublicar(n, e.target.checked ? n : undefined)} />
                  <span className="w-24 shrink-0 truncate font-mono text-[11px] text-ink">{n}</span>
                  <span className="w-20 shrink-0 truncate font-mono text-[10px] text-muted">
                    {d ? `${num(d.valor)} ${d.unidad}` : enFalso ? 'falso' : 'verdadero'}
                  </span>
                  {marcada && (
                    <input
                      type="text"
                      defaultValue={alias}
                      onBlur={(e) => {
                        const t = e.target.value.trim();
                        if (t && t !== alias) onPublicar(n, t);
                      }}
                      aria-label={`Nombre con el que la obra ve ${n}`}
                      className="min-w-0 flex-1 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-ink outline-none focus:border-accent"
                    />
                  )}
                </label>
                {d && <p className="ml-6 text-[10px] leading-snug text-muted">{d.criterio}</p>}
                {problema && <p className="ml-6 text-[10px] leading-snug text-error">{problema}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Lo que entra ─────────────────────────────────────────────────── */}
      <section className="mt-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          Datos · {atadosActivos} atados de {campos.length}
        </h4>
        <p className="mt-1 text-[11px] leading-snug text-muted">
          Atado a una expresión, el dato es el mismo que usan los cálculos. Sin atar, vale el número de la
          derecha y la hoja lo declara como supuesto.
        </p>
        <ul className="mt-1.5 space-y-1">
          {campos.map((c) => {
            const expr = formulas[c.nombre];
            const error = errorDe.get(c.nombre);
            return (
              <li key={c.nombre}>
                <div className="flex items-center gap-1.5" title={c.descripcion}>
                  <span className="w-20 shrink-0 truncate font-mono text-[11px] text-ink">{c.nombre}</span>
                  <input
                    type="text"
                    defaultValue={expr ?? ''}
                    onBlur={(e) => {
                      const t = e.target.value.trim();
                      if (t !== (expr ?? '')) onFormula(c.nombre, t || undefined);
                    }}
                    aria-label={`Expresión para ${c.nombre}`}
                    placeholder="sin atar"
                    className="min-w-0 flex-1 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-ink outline-none focus:border-accent"
                  />
                  {expr ? (
                    <span className={`w-24 shrink-0 truncate text-right font-mono text-[10px] ${error ? 'text-error' : 'text-muted'}`} title={error ?? ''}>
                      {error ? 'sin resolver' : `${num(datos[c.nombre])} ${c.unidad}`}
                    </span>
                  ) : (
                    <span className="flex w-24 shrink-0 items-center gap-1">
                      <input
                        type="number"
                        defaultValue={datos[c.nombre]}
                        key={`${c.nombre}:${datos[c.nombre]}`}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== datos[c.nombre]) onEntrada(c.nombre, v);
                        }}
                        aria-label={`Valor de ${c.nombre}`}
                        className="w-16 rounded border border-border px-1 py-0.5 text-right font-mono text-[11px] text-ink outline-none focus:border-accent"
                      />
                      <span className="font-mono text-[10px] text-muted">{c.unidad}</span>
                    </span>
                  )}
                </div>
                {!expr && c.supuesto && <p className="ml-[5.4rem] text-[10px] leading-snug text-aviso">Supuesto: {c.supuesto}.</p>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
