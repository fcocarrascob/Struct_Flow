import type { SalidaDef } from '../../lib/diseno/tipos';
import { formatValor } from '../../lib/worksheet';

interface Props {
  salidas: SalidaDef[];
  scope: Record<string, unknown>;
  /** Regiones que no evaluaron, con el mensaje del motor. */
  errores: { id: string; src: string; error: string }[];
}

const VERDE = '#15803d';
const ROJO = '#b91c1c';

/** El uso, si el símbolo trae un número; `null` si no se pudo calcular. */
function uso(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function BarraUso({ valor }: { valor: number }) {
  const cumple = valor <= 1;
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="relative h-2 flex-1 overflow-hidden rounded-sm bg-surface ring-1 ring-border">
        <div
          className="h-full rounded-sm"
          // El ancho se satura en 1,5 para que un uso disparado no reviente la
          // barra; el número de al lado sigue diciendo cuánto es de verdad.
          style={{
            width: `${Math.min(Math.max(valor, 0), 1.5) * 66.7}%`,
            backgroundColor: cumple ? VERDE : ROJO,
          }}
        />
        {/* La marca del 1,0: sin ella, una barra a dos tercios no dice nada. */}
        <div className="absolute inset-y-0 left-[66.7%] w-px bg-ink/40" />
      </div>
      <span
        className="w-12 shrink-0 text-right font-mono text-xs font-semibold"
        style={{ color: cumple ? VERDE : ROJO }}
      >
        {/* Coma decimal, como el resto de la aplicación: `formatValor` la usa
            en todos los rótulos, y mezclarla con el punto se nota. */}
        {valor.toFixed(2).replace('.', ',')}
      </span>
    </div>
  );
}

/**
 * Los resultados que el módulo declara como interesantes, leídos del scope de
 * la hoja ya evaluada.
 *
 * No recalcula nada: el scope que recibe es la instantánea que capturó la
 * región del esquema, o sea el estado final de la misma hoja que se exporta.
 */
export default function PanelResultados({ salidas, scope, errores }: Props) {
  const usos = salidas.filter((s) => s.tipo === 'uso');
  const resto = salidas.filter((s) => s.tipo !== 'uso');
  const numeros = usos.map((s) => uso(scope[s.nombre])).filter((v): v is number => v !== null);
  const maximo = numeros.length ? Math.max(...numeros) : null;
  // Un veredicto marcado como aviso no vota en el CUMPLE / NO CUMPLE: dice que
  // el resultado puede no ser válido, no que la sección incumpla.
  const veredictos = salidas.filter((s) => s.tipo === 'veredicto');
  const incumple = veredictos.some((s) => !s.aviso && scope[s.nombre] === false);
  const avisos = veredictos.filter((s) => s.aviso && scope[s.nombre] === false);

  return (
    <div className="space-y-4">
      {errores.length > 0 && (
        // Un error del motor se enseña, no se esconde: significa que una
        // combinación de datos rompió el cálculo, y los números de abajo
        // pueden estar a medio hacer.
        <div className="rounded border border-[#b91c1c]/40 bg-[#b91c1c]/5 p-2">
          <p className="text-xs font-semibold text-[#b91c1c]">
            {errores.length} región(es) no evaluaron
          </p>
          <ul className="mt-1 space-y-0.5">
            {errores.slice(0, 4).map((e) => (
              <li key={e.id} className="font-mono text-[10px] text-[#b91c1c]">
                {e.src.split('\n')[0]} — {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {maximo !== null && (
        <div
          className="rounded border p-2.5"
          style={{
            borderColor: maximo <= 1 && !incumple ? VERDE : ROJO,
            backgroundColor: `${maximo <= 1 && !incumple ? VERDE : ROJO}0d`,
          }}
        >
          <p
            className="text-sm font-semibold"
            style={{ color: maximo <= 1 && !incumple ? VERDE : ROJO }}
          >
            {maximo <= 1 && !incumple ? 'CUMPLE' : 'NO CUMPLE'}
          </p>
          <p className="text-[11px] text-muted">
            Factor de utilización máximo {maximo.toFixed(2).replace('.', ',')}
            {incumple && ' · hay verificaciones de detallado sin cumplir'}
          </p>
        </div>
      )}

      {avisos.length > 0 && (
        <div className="rounded border border-[#b45309]/40 bg-[#b45309]/5 p-2">
          <p className="text-xs font-semibold text-[#b45309]">
            {avisos.length === 1 ? 'Una advertencia' : `${avisos.length} advertencias`} sobre la
            validez del resultado
          </p>
          <ul className="mt-1 space-y-1">
            {avisos.map((s) => (
              <li key={s.nombre} className="text-[11px] leading-snug text-[#b45309]">
                {s.avisoTexto ?? s.etiqueta}
                {s.ayuda && <span className="text-muted"> — {s.ayuda}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {usos.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Factores de utilización
          </p>
          <div className="space-y-2.5">
            {usos.map((s) => {
              const v = uso(scope[s.nombre]);
              return (
                // `data-salida` es el asidero por el que se lee este panel
                // desde fuera: sin él solo queda buscar por el texto de la
                // etiqueta, que lleva referencias de norma llenas de números.
                <div key={s.nombre} data-salida={s.nombre}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-ink">{s.etiqueta}</span>
                    {s.ayuda && <span className="shrink-0 text-[10px] text-muted">{s.ayuda}</span>}
                  </div>
                  {v === null ? (
                    <p className="mt-1 font-mono text-xs text-muted">sin calcular</p>
                  ) : (
                    <BarraUso valor={v} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {resto.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Resultados
          </p>
          <dl className="space-y-1">
            {resto.map((s) => {
              const v = scope[s.nombre];
              const esVeredicto = s.tipo === 'veredicto';
              const cumple = v === true;
              // Una salida de texto —qué estado límite gobierna, en qué zona
              // cae— es una frase, no un número: en dos columnas le queda un
              // canal de tres palabras y la etiqueta se parte en vertical.
              if (s.tipo === 'texto') {
                return (
                  <div key={s.nombre} data-salida={s.nombre}>
                    <dt className="text-xs text-ink" title={s.ayuda}>
                      {s.etiqueta}
                    </dt>
                    <dd className="font-mono text-[11px] leading-snug text-muted">
                      {v === undefined ? '—' : formatValor(v)}
                    </dd>
                  </div>
                );
              }
              return (
                <div
                  key={s.nombre}
                  data-salida={s.nombre}
                  className="flex items-baseline justify-between gap-3"
                >
                  <dt className="text-xs text-ink" title={s.ayuda}>
                    {s.etiqueta}
                  </dt>
                  <dd
                    className="shrink-0 text-right font-mono text-xs font-medium"
                    style={esVeredicto ? { color: cumple ? VERDE : ROJO } : undefined}
                  >
                    {v === undefined ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <>
                        {formatValor(v, s.unidad)}
                        {s.unidad && s.tipo === 'valor' && (
                          <span className="ml-1 text-[10px] text-muted">{s.unidad}</span>
                        )}
                      </>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}
    </div>
  );
}
