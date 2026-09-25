import type { ConexionSap } from './modelo';
import type { ParteSap, ResumenJustificaciones } from './sap-cargas';
import { SinLeer } from './CampoJustificacion';
import type { PestanaSap } from './PanelSap';

/** `Ton_m_C` → `Ton, m, °C`: como lo dice el selector de unidades de SAP. */
function unidadesDe(u: string): string {
  return u
    .split('_')
    .map((p) => (p === 'C' || p === 'F' ? `°${p}` : p))
    .join(', ');
}

const miles = (n: number) => n.toLocaleString('es');

/** Qué parte se revisa en qué pestaña, y cómo se llama. */
const PARTES: { parte: ParteSap; pestana: PestanaSap; titulo: string }[] = [
  { parte: 'cargas', pestana: 'patrones', titulo: 'Load Patterns' },
  { parte: 'casos', pestana: 'casos', titulo: 'Load Cases' },
  { parte: 'masa', pestana: 'masa', titulo: 'Masa sísmica' },
];

/** Una lista de nombres que se pliega: 12 secciones no tienen por qué ocupar la pantalla. */
function Plegable({ titulo, items }: { titulo: string; items: readonly string[] }) {
  return (
    <details className="text-[11px]">
      <summary className="cursor-pointer text-ink">
        {titulo} <span className="text-muted">({items.length})</span>
      </summary>
      <p className="mt-1 pl-3 font-mono text-[10px] leading-relaxed text-muted">{items.join(' · ') || '—'}</p>
    </details>
  );
}

/**
 * Lo que hay en el modelo, en números, y cómo va la obra justificándolo.
 *
 * Es para ver de un vistazo que el modelo leído es el que se cree: que tiene las
 * barras, los grupos y las secciones que tiene que tener, y si está analizado.
 */
export default function PestanaResumen({
  sap,
  partes,
  onPestana,
}: {
  sap: ConexionSap;
  partes: Record<ParteSap, ResumenJustificaciones>;
  onPestana: (p: PestanaSap) => void;
}) {
  const r = sap.resumen;
  return (
    <div className="space-y-4 text-[11px]">
      <section>
        <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Justificaciones</h4>
        <table className="w-full">
          <tbody>
            {PARTES.map(({ parte, pestana, titulo }) => {
              const p = partes[parte];
              const mal = p.difieren + p.errores;
              return (
                <tr key={parte} className="border-t border-border/60">
                  <td className="py-1 pr-2">
                    <button type="button" onClick={() => onPestana(pestana)} className="text-accent hover:underline">
                      {titulo}
                    </button>
                  </td>
                  <td
                    className={`pr-2 text-right font-mono ${
                      mal ? 'text-error' : p.total && p.justificadas === p.total ? 'text-emerald-600' : 'text-ink'
                    }`}
                  >
                    {p.total ? `${p.justificadas} de ${p.total}` : '—'}
                  </td>
                  <td className="text-muted">
                    {[
                      mal && <span className="text-error">{mal} no coincide(n)</span>,
                      p.huerfanas.length > 0 && (
                        <span className="text-aviso">{p.huerfanas.length} sin su dato en el modelo</span>
                      ),
                    ]
                      .filter(Boolean)
                      .map((x, i) => (
                        <span key={i}>
                          {i > 0 && ' · '}
                          {x}
                        </span>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {!r ? (
        <SinLeer>El resumen del modelo todavía no se leyó.</SinLeer>
      ) : (
        <>
          <section>
            <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Modelo</h4>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted">Ruta</dt>
              <dd className="break-all font-mono text-[10px] text-muted">{sap.ruta}</dd>
              {r.unidades && (
                <>
                  <dt className="text-muted">Unidades</dt>
                  <dd className="text-ink">
                    {unidadesDe(r.unidades)}{' '}
                    <span className="text-muted">(las de pantalla; Flow lee siempre en kN, m, °C)</span>
                  </dd>
                </>
              )}
              <dt className="text-muted">Objetos</dt>
              <dd className="text-ink">
                {miles(r.nudos)} nudos · {miles(r.barras)} barras · {miles(r.areas)} áreas
                {r.links ? ` · ${miles(r.links)} links` : ''}
              </dd>
              <dt className="text-muted">Cargas</dt>
              <dd className="text-ink">
                {r.patrones} patrones · {r.casos} casos · {r.combinaciones} combinaciones
              </dd>
              <dt className="text-muted">Análisis</dt>
              <dd className={r.analizados === r.casos && r.casos ? 'text-emerald-600' : r.analizados ? 'text-aviso' : 'text-muted'}>
                {r.analizados === 0
                  ? 'sin analizar'
                  : r.analizados === r.casos
                    ? 'todos los casos analizados'
                    : `${r.analizados} de ${r.casos} casos analizados`}
              </dd>
            </dl>
          </section>

          {r.grupos.length > 0 && (
            <section>
              <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Grupos</h4>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted">
                    <th className="py-1 font-semibold">Nombre</th>
                    <th className="text-right font-semibold">Barras</th>
                    <th className="text-right font-semibold">Áreas</th>
                  </tr>
                </thead>
                <tbody>
                  {r.grupos.map((g) => (
                    <tr key={g.nombre} className="border-t border-border/60">
                      <td className="py-0.5 pr-2 font-mono text-ink">{g.nombre}</td>
                      <td className={`text-right font-mono ${g.barras ? 'text-ink' : 'text-muted'}`}>{g.barras}</td>
                      <td className={`text-right font-mono ${g.areas ? 'text-ink' : 'text-muted'}`}>{g.areas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="space-y-1.5">
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">Materiales y secciones</h4>
            <Plegable
              titulo="Materiales"
              items={r.materiales.map((m) => (m.tipo ? `${m.nombre} (${m.tipo})` : m.nombre))}
            />
            <Plegable titulo="Secciones de barra" items={r.seccionesBarra} />
            <Plegable titulo="Secciones de área" items={r.seccionesArea} />
          </section>
        </>
      )}
    </div>
  );
}
