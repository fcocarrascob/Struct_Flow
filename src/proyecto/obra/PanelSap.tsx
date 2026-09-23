import { useState } from 'react';
import { DIRECCIONES_SAP, type Carga, type ConexionSap, type GrupoSap, type LecturaPatrones, type PatronSap } from './modelo';
import {
  avisosPesoPropio,
  compararAplicacion,
  compararPatrones,
  hermanasDe,
  type FilaAplicacion,
  type LeidaAplicacion,
  numero,
  patronesDeFlow,
  type EstadoPatron,
} from './sap';
import { useEscape } from './useEscape';

/**
 * El panel del nodo SAP2000: leer el modelo abierto y verificar que tenga lo que
 * la obra declara.
 *
 * SOLO LEE (`docs/rumbo.md`, «Flow no escribe en el modelo»). Las cargas las
 * aplica el ingeniero en SAP; aquí se ve en qué se aparta el modelo, se corrige
 * allá y se vuelve a comparar. Habla con el puente de Flow
 * (`puente-sap/puente.py`) por `/sap-api`, que es un proceso aparte: sin él, el
 * panel lo dice y muestra la última lectura guardada.
 */

/**
 * Cuánto se espera al puente. Atiende de a una petición y cada una es una
 * llamada COM: si SAP tiene un diálogo modal abierto, la llamada no vuelve nunca,
 * y sin tope el botón se quedaba en «Conectando…» para siempre.
 */
const TOPE_MS = 30_000;

/** Una llamada al puente, con los mismos mensajes para todas. */
async function alPuente<T>(ruta: string, cuerpo?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/sap-api${ruta}`, {
      method: cuerpo === undefined ? 'GET' : 'POST',
      // El puente solo acepta POST con JSON: así no atiende a otras páginas
      // abiertas en el navegador.
      headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TOPE_MS),
    });
  } catch (e) {
    if ((e as Error).name === 'TimeoutError') {
      throw new Error(`SAP2000 no respondió en ${TOPE_MS / 1000} s. ¿Tiene un diálogo abierto? Ciérralo y vuelve a intentar.`);
    }
    throw new Error('El puente de SAP no responde.');
  }
  const datos = await r.json().catch(() => null);
  // Sin puente, el proxy de Vite responde 502 sin cuerpo JSON.
  if (!datos) throw new Error('El puente de SAP no está corriendo. Arráncalo con `npm run puente-sap`.');
  if (!r.ok) throw new Error(datos.motivo ?? `El puente respondió ${r.status}.`);
  return datos as T;
}

interface RespuestaPatrones {
  modelo?: string;
  ruta?: string;
  patrones?: LecturaPatrones['lista'];
}

const aLectura = (d: RespuestaPatrones): LecturaPatrones => ({
  modelo: d.modelo ?? '',
  ...(d.ruta ? { ruta: d.ruta } : {}),
  leido: new Date().toISOString(),
  lista: d.patrones ?? [],
});

/** Una lectura de grupos: de qué modelo salió. */
export interface LecturaGrupos {
  modelo: string;
  ruta: string;
  leido: string;
}

/**
 * Los grupos del modelo. Los leídos quedan en la obra para ofrecerlos al decir
 * dónde va una partida. Los grupos se crean en SAP: Flow solo los lee.
 */
function GruposSap({
  grupos,
  gruposDe,
  modeloConectado,
  onLeidos,
}: {
  grupos: readonly GrupoSap[] | undefined;
  gruposDe: string | undefined;
  modeloConectado: string | undefined;
  onLeidos: (grupos: GrupoSap[], lectura: LecturaGrupos) => void;
}) {
  const [error, setError] = useState('');
  const [leyendo, setLeyendo] = useState(false);

  const leer = () => {
    setLeyendo(true);
    setError('');
    alPuente<{ modelo: string; ruta: string; grupos: GrupoSap[] }>('/grupos')
      .then((d) => onLeidos(d.grupos, { modelo: d.modelo, ruta: d.ruta, leido: new Date().toISOString() }))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLeyendo(false));
  };

  return (
    <section className="border-t border-border px-5 py-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-ink">Grupos</h3>
        <button
          type="button"
          onClick={leer}
          disabled={leyendo}
          className="rounded border border-border px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {leyendo ? 'Leyendo…' : grupos ? 'Volver a leer' : 'Leer del modelo'}
        </button>
      </div>
      {error && <p className="mb-2 text-[11px] text-aviso">{error}</p>}
      {grupos ? (
        <p className="mb-2 font-mono text-[10px] leading-relaxed text-muted">
          {grupos.map((g) => `${g.nombre} (${g.areas} áreas, ${g.barras} barras)`).join(' · ')}
        </p>
      ) : (
        <p className="text-[11px] leading-snug text-muted">
          Cada partida dice sobre qué grupo del modelo va. Crea los grupos en SAP y léelos aquí para
          elegirlos en la partida.
        </p>
      )}
      {grupos && gruposDe && modeloConectado && gruposDe !== modeloConectado && (
        <p className="mb-2 text-[10px] text-aviso">
          Leídos de {gruposDe}, que no es el modelo de la última conexión ({modeloConectado}).
        </p>
      )}
    </section>
  );
}

const DIR = Object.fromEntries(DIRECCIONES_SAP.map((d) => [d.codigo, d.texto]));

/** Cómo va la carga en SAP, dicho como se elige en el diálogo de asignación. */
function comoSeAplica(f: FilaAplicacion): string {
  const tipo =
    f.aplicacion.tipo === 'area-a-barras'
      ? `área a barras, ${f.aplicacion.distribucion === 2 ? 'dos direcciones' : 'una dirección'}`
      : 'distribuida en barra';
  return `${tipo} · ${DIR[f.aplicacion.direccion] ?? f.aplicacion.direccion}`;
}

/**
 * Las partidas aplicadas, contra lo que su patrón tiene hoy sobre el grupo. Es la
 * verificación de lo que el ingeniero cargó en SAP. La lectura no se guarda: se
 * hace cuando se quiere mirar.
 */
function AplicacionesSap({ filas }: { filas: readonly FilaAplicacion[] }) {
  const [leidas, setLeidas] = useState<{ modelo: string; porId: Record<string, LeidaAplicacion> } | null>(null);
  const [error, setError] = useState('');
  const [leyendo, setLeyendo] = useState(false);

  const leer = () => {
    setLeyendo(true);
    setError('');
    alPuente<{ modelo: string; aplicaciones: (LeidaAplicacion & { id: string })[] }>('/aplicaciones/leer', {
      aplicaciones: filas.map((f) => ({
        id: f.id,
        patron: f.patron,
        tipo: f.aplicacion.tipo,
        grupo: f.aplicacion.grupo,
      })),
    })
      .then((d) => setLeidas({ modelo: d.modelo, porId: Object.fromEntries(d.aplicaciones.map((a) => [a.id, a])) }))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLeyendo(false));
  };

  const COLOR = { igual: 'text-muted', difiere: 'text-error', 'sin-objetos': 'text-aviso', error: 'text-error' };

  /** Cada fila contra lo leído, junto con sus hermanas del mismo patrón y grupo. */
  const comparar = (f: FilaAplicacion) => {
    const l = leidas?.porId[f.id];
    return l ? compararAplicacion(f, l, hermanasDe(filas, f)) : null;
  };
  const estados = leidas ? filas.map(comparar) : [];
  const mal = estados.filter((c) => c && c.estado !== 'igual').length;

  return (
    <section className="border-t border-border px-5 py-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-ink">Cargas aplicadas</h3>
        <button
          type="button"
          onClick={leer}
          disabled={leyendo || filas.length === 0}
          className="rounded border border-border px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {leyendo ? 'Leyendo…' : leidas ? 'Volver a comparar' : 'Comparar con el modelo'}
        </button>
      </div>
      {error && <p className="mb-2 text-[11px] text-aviso">{error}</p>}
      {filas.length === 0 ? (
        <p className="text-[11px] leading-snug text-muted">
          Ninguna partida dice todavía dónde va en SAP. Se define en el panel de cada partida:
          «Aplicación en SAP».
        </p>
      ) : (
        <>
          {leidas && (
            <p className="mb-2 text-[10px] leading-snug text-muted">
              Leído de {leidas.modelo}.{' '}
              {mal === 0
                ? 'Todo lo declarado está aplicado así en el modelo.'
                : `${mal} de ${filas.length} no coinciden: corrígelas en SAP y vuelve a comparar.`}
            </p>
          )}
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                <th className="py-1 font-semibold">Patrón · partida</th>
                <th className="font-semibold">Grupo</th>
                <th className="font-semibold">Aplicar</th>
                <th className="font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const c = comparar(f);
                return (
                  <tr key={f.id} className="border-t border-border/60 align-top">
                    <td className="py-1 pr-2 font-mono text-ink">
                      {f.patron} · {f.partida}
                    </td>
                    <td className="pr-2 font-mono text-muted">{f.aplicacion.grupo || '—'}</td>
                    <td className={`pr-2 font-mono ${f.error ? 'text-error' : 'text-muted'}`}>
                      {f.error ? 'sin valor' : `${numero(Number(f.valor!.toPrecision(4)))} ${f.unidad.replace('^2', '²')}`}
                      {!f.error && <span className="block text-[10px] font-sans">{comoSeAplica(f)}</span>}
                    </td>
                    <td className={c ? COLOR[c.estado] : 'text-muted'}>
                      {c ? (c.estado === 'sin-objetos' ? 'grupo vacío' : c.estado) : '—'}
                      {c?.detalle && <span className="block text-[10px] text-muted">{c.detalle}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

const ESTADO: Record<EstadoPatron, { texto: string; clase: string }> = {
  igual: { texto: 'igual', clase: 'text-muted' },
  difiere: { texto: 'difiere', clase: 'text-error font-medium' },
  'sin-definir': { texto: 'sin definir en Flow', clase: 'text-aviso' },
  'solo-flow': { texto: 'falta en SAP', clase: 'text-error' },
  'solo-sap': { texto: 'solo en SAP', clase: 'text-aviso' },
};

const patronTexto = (p: PatronSap | undefined) => (p ? `${p.tipo} · ${numero(p.pesoPropio)}` : '—');

/**
 * Las cargas de la obra contra los Load Patterns del modelo. Flow manda: la
 * tabla dice en qué se aparta el MODELO, y se corrige en SAP. Lo que sí se trae
 * a la obra —los patrones que Flow no tenía— se trae con los botones.
 */
function ComparacionPatrones({
  cargas,
  lectura,
  modeloConectado,
  onLeidos,
  onTraer,
  onAdoptar,
}: {
  cargas: readonly Carga[];
  lectura: LecturaPatrones | undefined;
  modeloConectado: string | undefined;
  onLeidos: (ruta: string, lectura: LecturaPatrones) => void;
  /** Crea en la obra las cargas de estos patrones que solo están en SAP. */
  onTraer: (nombres: string[]) => void;
  /** Define el patrón de estas cargas con lo que tiene el modelo. */
  onAdoptar: (nombres: string[]) => void;
}) {
  const [estado, setEstado] = useState<{ fase: 'quieto' | 'leyendo' } | { fase: 'error'; motivo: string }>({
    fase: 'quieto',
  });
  const leer = () => {
    setEstado({ fase: 'leyendo' });
    alPuente<RespuestaPatrones>('/patrones').then(
      (d) => {
        onLeidos(d.ruta ?? '', aLectura(d));
        setEstado({ fase: 'quieto' });
      },
      (e: Error) => setEstado({ fase: 'error', motivo: e.message }),
    );
  };

  const filas = lectura ? compararPatrones(cargas, lectura.lista) : [];
  const enFlow = avisosPesoPropio(patronesDeFlow(cargas));
  const enSap = lectura ? avisosPesoPropio(lectura.lista) : [];
  const apartados = filas.filter((f) => f.estado !== 'igual').length;
  const soloSap = filas.filter((f) => f.estado === 'solo-sap').map((f) => f.nombre);
  const sinDefinir = filas.filter((f) => f.estado === 'sin-definir').map((f) => f.nombre);
  const aCorregir = filas.filter((f) => f.estado === 'difiere' || f.estado === 'solo-flow').length;
  const BOTON =
    'rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent';

  return (
    <section className="border-t border-border px-5 py-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-ink">Load Patterns</h3>
        <button
          type="button"
          onClick={leer}
          disabled={estado.fase === 'leyendo'}
          className="rounded border border-border px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {estado.fase === 'leyendo' ? 'Leyendo…' : lectura ? 'Volver a leer' : 'Leer del modelo'}
        </button>
      </div>

      {estado.fase === 'error' && (
        <p role="status" className="mb-2 rounded border border-aviso px-3 py-2 text-xs leading-snug text-aviso">
          {estado.motivo}
        </p>
      )}

      {!lectura ? (
        <p className="text-[11px] leading-snug text-muted">
          Compara las cargas de la obra con los Load Patterns del modelo abierto: nombre, tipo y
          multiplicador de peso propio.
        </p>
      ) : (
        <>
          <p className="mb-2 text-[11px] leading-snug text-muted">
            Leído de <span className="font-mono text-ink">{lectura.modelo || '(sin guardar)'}</span> el{' '}
            {new Date(lectura.leido).toLocaleString()}
            {modeloConectado && lectura.modelo !== modeloConectado && (
              <span className="text-aviso"> — no es el modelo de la última conexión ({modeloConectado})</span>
            )}
            . {apartados === 0 ? 'Todo coincide.' : `${apartados} de ${filas.length} no coinciden.`}
            {aCorregir > 0 && ` Los que difieren o faltan se corrigen en SAP; después, vuelve a leer.`}
          </p>

          {[...enFlow.map((a) => `En Flow: ${a}`), ...enSap.map((a) => `En el modelo: ${a}`)].map((a) => (
            <p key={a} className="mb-1 rounded border border-aviso px-2 py-1 text-[10px] leading-snug text-aviso">
              {a}
            </p>
          ))}

          {(soloSap.length > 0 || sinDefinir.length > 0) && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {soloSap.length > 0 && (
                <button
                  type="button"
                  onClick={() => onTraer(soloSap)}
                  title="Crea en la obra una carga por cada patrón que solo está en el modelo, con su tipo y su peso propio"
                  className={BOTON}
                >
                  Traer a Flow {soloSap.length === 1 ? 'la que' : `las ${soloSap.length} que`} solo están en SAP
                </button>
              )}
              {sinDefinir.length > 0 && (
                <button
                  type="button"
                  onClick={() => onAdoptar(sinDefinir)}
                  title="Define el tipo y el peso propio de esas cargas con lo que tiene el modelo"
                  className={BOTON}
                >
                  {sinDefinir.length === 1
                    ? 'Tomar de SAP el tipo de la que no lo define'
                    : `Tomar de SAP el tipo de las ${sinDefinir.length} que no lo definen`}
                </button>
              )}
            </div>
          )}

          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                <th className="py-1 font-semibold">Patrón</th>
                <th className="font-semibold">Flow</th>
                <th className="font-semibold">SAP</th>
                <th className="font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.nombre} className="border-t border-border/60 align-top" title={f.diferencias.join('\n') || undefined}>
                  <td className="py-1 pr-2 font-mono text-ink">{f.nombre}</td>
                  <td className="pr-2 font-mono text-muted">{f.estado === 'solo-sap' ? '—' : patronTexto(f.flow)}</td>
                  <td className="pr-2 font-mono text-muted">{patronTexto(f.sap)}</td>
                  <td className={ESTADO[f.estado].clase}>
                    {ESTADO[f.estado].texto}
                    {f.estado === 'difiere' && (
                      <span className="block text-[10px] font-normal text-muted">{f.diferencias.join('; ')}</span>
                    )}
                    {f.estado === 'solo-sap' && (
                      <button type="button" onClick={() => onTraer([f.nombre])} className={`ml-1.5 ${BOTON}`}>
                        traer
                      </button>
                    )}
                    {f.estado === 'sin-definir' && (
                      <button type="button" onClick={() => onAdoptar([f.nombre])} className={`ml-1.5 ${BOTON}`}>
                        tomar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

export default function PanelSap({
  sap,
  cargas,
  onConectado,
  onPatronesLeidos,
  onTraer,
  onAdoptar,
  aplicaciones,
  onGruposLeidos,
  onCerrar,
}: {
  sap: ConexionSap | undefined;
  cargas: readonly Carga[];
  aplicaciones: readonly FilaAplicacion[];
  onGruposLeidos: (grupos: GrupoSap[], lectura: LecturaGrupos) => void;
  onConectado: (sap: ConexionSap) => void;
  onPatronesLeidos: (ruta: string, lectura: LecturaPatrones) => void;
  onTraer: (nombres: string[]) => void;
  onAdoptar: (nombres: string[]) => void;
  onCerrar: () => void;
}) {
  useEscape(onCerrar);
  const [estado, setEstado] = useState<{ fase: 'quieto' | 'conectando' } | { fase: 'error'; motivo: string }>({
    fase: 'quieto',
  });

  const conectar = () => {
    setEstado({ fase: 'conectando' });
    alPuente<Omit<ConexionSap, 'leido'>>('/conectar', {}).then(
      (d) => {
        if (!d.modelo) {
          setEstado({ fase: 'error', motivo: 'SAP2000 está abierto, pero el modelo no está guardado todavía.' });
          return;
        }
        onConectado({ ...d, leido: new Date().toISOString() });
        setEstado({ fase: 'quieto' });
      },
      (e: Error) => setEstado({ fase: 'error', motivo: e.message }),
    );
  };

  return (
    <aside className="flex h-full w-[34rem] shrink-0 flex-col overflow-y-auto border-l border-border bg-white">
      <header className="sticky top-0 z-10 border-b border-border bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 px-1.5">
            <h2 className="text-sm font-semibold text-ink">SAP2000</h2>
            <p className="text-[11px] leading-snug text-muted">
              Flow lee el modelo abierto en este equipo y verifica que tenga lo que la obra declara.
              No escribe, no guarda ni analiza: las cargas las aplicas tú en SAP.
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="shrink-0 rounded border border-border px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
          >
            cerrar
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-3 px-5 py-4 text-sm">
        {sap ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted">Modelo</dt>
            <dd className="font-mono font-semibold text-ink">{sap.modelo}</dd>
            <dt className="text-muted">Ruta</dt>
            <dd className="break-all font-mono text-[11px] text-muted">{sap.ruta}</dd>
            {sap.version && (
              <>
                <dt className="text-muted">Versión</dt>
                <dd className="text-ink">SAP2000 {sap.version}</dd>
              </>
            )}
            <dt className="text-muted">Conectado</dt>
            <dd className="text-ink">{sap.leido ? new Date(sap.leido).toLocaleString() : '—'}</dd>
          </dl>
        ) : (
          <p className="text-xs text-muted">Todavía no se conectó a ningún modelo.</p>
        )}

        <div>
          <button
            type="button"
            onClick={conectar}
            disabled={estado.fase === 'conectando'}
            className="rounded border border-accent bg-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {estado.fase === 'conectando' ? 'Conectando…' : sap ? 'Volver a conectar' : 'Conectarse a SAP'}
          </button>
        </div>

        {estado.fase === 'error' && (
          <p role="status" className="rounded border border-aviso bg-white px-3 py-2 text-xs leading-snug text-aviso">
            {estado.motivo}
          </p>
        )}
      </div>

      <ComparacionPatrones
        cargas={cargas}
        lectura={sap?.patrones}
        modeloConectado={sap?.modelo}
        onLeidos={onPatronesLeidos}
        onTraer={onTraer}
        onAdoptar={onAdoptar}
      />
      <GruposSap
        grupos={sap?.grupos}
        gruposDe={sap?.gruposDe}
        modeloConectado={sap?.modelo}
        onLeidos={onGruposLeidos}
      />
      <AplicacionesSap filas={aplicaciones} />
    </aside>
  );
}
