import { formatValor } from '../../lib/worksheet';
import { legible } from './calculo';
import { problemaDeAlias, type Frontera } from './modelo';

/**
 * El panel de un cálculo cuya hoja está en el documento: `propia` o `derivada`.
 *
 * NO ES `FichaGenerica`. Aquella pinta un módulo de la biblioteca: un formulario
 * salido de `meta.entradas`, unas salidas declaradas y un esquema. Acá no hay
 * `meta` que leer —una hoja escrita a mano no declara nada—, así que lo único
 * honesto es leerlo de lo que está escrito:
 *
 *   - **Las entradas son los nombres que la hoja usa y no define.** Si una
 *     fórmula nombra `L_ext` y ninguna línea la define, esa es una entrada del
 *     cálculo, la declare alguien o no.
 *   - **Lo publicable es lo que la hoja define.** No hay una lista de salidas que
 *     consultar; la lista es la hoja.
 *
 * La hoja se escribe en la pestaña, no aquí: este panel es la frontera —qué entra
 * y qué sale—, y el botón de arriba es el que lleva al canvas.
 */
export default function FichaPropia({
  frontera,
  define,
  sueltos,
  atados,
  otrosAlias,
  conSalida,
  onAbrirHoja,
  onFormula,
  onPublicar,
  onSalida,
  onQuitar,
}: {
  frontera: Frontera;
  /** Lo que la hoja define, en orden de lectura: lo que se puede publicar. */
  define: string[];
  /** Lo que usa y no define: sus entradas. */
  sueltos: string[];
  /** El scope con el que se evalúa su hoja, o sea los campos atados ya resueltos. */
  atados: Record<string, unknown>;
  /** Lo que publican los OTROS nodos, para no proponer un alias que ya está. */
  otrosAlias: ReadonlySet<string>;
  /** Solo en una partida: hay que elegir cuál salida la resume. */
  conSalida?: boolean;
  onAbrirHoja: () => void;
  onFormula: (campo: string, expr: string | undefined) => void;
  onPublicar: (salida: string, alias: string | undefined) => void;
  onSalida?: (salida: string) => void;
  onQuitar: () => void;
}) {
  const publica = frontera.publica ?? {};
  const formulas = frontera.formulas ?? {};

  return (
    <div>
      <header className="mb-2">
        <p className="font-mono text-[10px] text-muted">
          {frontera.procedencia === 'derivada' ? (
            <>
              derivada de {frontera.origen?.slug} ·{' '}
              {(frontera.origen?.sha256 ?? '').slice(0, 12)}…
            </>
          ) : (
            'hoja propia de esta obra'
          )}
        </p>
        {frontera.procedencia === 'derivada' && (
          <p className="mt-1 text-[10px] leading-snug text-muted">
            Se desprendió de la biblioteca: sus entradas quedaron escritas en la hoja y ya no se
            vuelve a instanciar. Deja de avisar de que la genérica cambió, porque esta hoja ya no
            es una instancia de ninguna.
          </p>
        )}
        <button
          type="button"
          onClick={onAbrirHoja}
          title="Abrir esta hoja en el canvas matemático, en una pestaña"
          className="mt-2 rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
        >
          abrir como hoja ↗
        </button>
      </header>

      {/* ── Lo que entra ─────────────────────────────────────────────────── */}
      <section className="mt-3">
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          Entradas · {sueltos.length}
        </h4>
        {sueltos.length === 0 ? (
          <p className="mt-1 text-[11px] leading-snug text-muted">
            Esta hoja no usa ningún nombre que no defina ella misma, así que no necesita nada de
            la obra.
          </p>
        ) : (
          <>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              Los nombres que la hoja usa y no define. Átalos a una expresión de la obra, o
              defínelos en la propia hoja.
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {sueltos.map((n) => {
                const expr = formulas[n];
                const v = atados[n];
                return (
                  <li key={n} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-28 shrink-0 truncate font-mono text-[11px] text-ink">{n}</span>
                    <input
                      type="text"
                      defaultValue={expr ?? ''}
                      // Al salir del campo y no en cada tecla: una expresión a
                      // medio escribir reevaluaría la obra entera con basura.
                      onBlur={(e) => {
                        const t = e.target.value.trim();
                        if (t !== (expr ?? '')) onFormula(n, t || undefined);
                      }}
                      aria-label={`Expresión para ${n}`}
                      placeholder="A_planta / 2"
                      className="min-w-0 flex-1 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-ink outline-none focus:border-accent"
                    />
                    <span
                      className={`w-24 shrink-0 truncate text-right font-mono text-[10px] ${
                        v === undefined && expr ? 'text-error' : 'text-muted'
                      }`}
                      title={v === undefined && expr ? 'La expresión no se pudo resolver' : ''}
                    >
                      {v !== undefined ? legible(formatValor(v)) : expr ? 'sin resolver' : '—'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* ── Lo que sale ──────────────────────────────────────────────────── */}
      <section className="mt-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          Publica · {Object.keys(publica).length} de {define.length}
        </h4>
        {define.length === 0 ? (
          <p className="mt-1 text-[11px] leading-snug text-muted">
            La hoja todavía no define ninguna variable. Ábrela y escribe la primera.
          </p>
        ) : (
          <>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              Lo que marques es lo único que ve el resto de la obra. El alias se puede cambiar:
              dos cálculos pueden definir la misma letra sin chocar, pero no publicarla con el
              mismo nombre.
            </p>
            <ul className="mt-1.5 space-y-1">
              {define.map((n) => {
                const alias = publica[n];
                const marcada = alias !== undefined;
                const problema = marcada
                  ? problemaDeAlias(alias) ||
                    (otrosAlias.has(alias.trim())
                      ? `«${alias.trim()}» ya lo publica otro nodo: los dos se quedarían sin dueño.`
                      : '')
                  : '';
                return (
                  <li key={n}>
                    <label className="flex flex-wrap items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={marcada}
                        // Al marcar se propone el propio nombre, que es lo que el
                        // autor ya eligió al escribirlo; solo hay que tocarlo si
                        // choca con otro nodo, y entonces el aviso lo dice.
                        onChange={(e) => onPublicar(n, e.target.checked ? n : undefined)}
                      />
                      <span className="w-28 shrink-0 truncate font-mono text-[11px] text-ink">
                        {n}
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
                    {problema && (
                      <p className="ml-6 text-[10px] leading-snug text-error">{problema}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* Solo una partida elige un valor: una carga agrupa sus partidas y lee uno
          por cada una. Un cálculo suelto enseña todo lo que publica. */}
      {conSalida && onSalida && define.length > 0 && (
        <section className="mt-4">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Valor de la partida
          </h4>
          <select
            value={frontera.salida ?? ''}
            onChange={(e) => onSalida(e.target.value)}
            aria-label="Cuál variable es el valor de la partida"
            className="mt-1 w-full rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-ink outline-none focus:border-accent"
          >
            <option value="">— elige una —</option>
            {define.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </section>
      )}

      {/* Quitar la frontera devuelve el nodo a hoja libre: las mismas regiones,
          pero compartiendo el scope de la obra. No se borra nada. */}
      <button
        type="button"
        onClick={onQuitar}
        title="El nodo vuelve a compartir el scope de la obra. La hoja se queda como está."
        className="mt-4 rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-error hover:text-error"
      >
        volver a hoja libre
      </button>
    </div>
  );
}
