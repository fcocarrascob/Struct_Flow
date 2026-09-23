import { useState } from 'react';
import type { Carga, ConexionSap, LecturaPatrones, PatronSap } from './modelo';
import { avisosPesoPropio, compararPatrones, numero, patronesDeFlow, type EstadoPatron } from './sap';
import { useEscape } from './useEscape';

/**
 * El panel del nodo SAP2000: conectarse al modelo abierto y ver cuál es.
 *
 * Habla con el puente de Flow (`puente-sap/puente.py`) por `/sap-api`, que es un
 * proceso aparte: sin él, el panel lo dice y muestra la última conexión
 * guardada. Es el primer paso; leer resultados llega después.
 */

async function conectarSap(): Promise<Omit<ConexionSap, 'leido'>> {
  let r: Response;
  try {
    r = await fetch('/sap-api/conectar', { method: 'POST' });
  } catch {
    throw new Error('El puente de SAP no responde.');
  }
  const datos = await r.json().catch(() => null);
  // Sin puente, el proxy de Vite responde 502 sin cuerpo JSON.
  if (!datos) throw new Error('El puente de SAP no está corriendo. Arráncalo con `npm run puente-sap`.');
  if (!r.ok) throw new Error(datos.motivo ?? `El puente respondió ${r.status}.`);
  return datos;
}

async function leerPatrones(): Promise<{ ruta: string; lectura: LecturaPatrones }> {
  let r: Response;
  try {
    r = await fetch('/sap-api/patrones');
  } catch {
    throw new Error('El puente de SAP no responde.');
  }
  const datos = await r.json().catch(() => null);
  if (!datos) throw new Error('El puente de SAP no está corriendo. Arráncalo con `npm run puente-sap`.');
  if (!r.ok) throw new Error(datos.motivo ?? `El puente respondió ${r.status}.`);
  return {
    ruta: datos.ruta ?? '',
    lectura: { modelo: datos.modelo ?? '', leido: new Date().toISOString(), lista: datos.patrones ?? [] },
  };
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
 * tabla dice en qué se aparta el MODELO. Solo lee; corregir se hace en el panel
 * de Cargas o en SAP.
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
    leerPatrones().then(
      ({ ruta, lectura: l }) => {
        onLeidos(ruta, l);
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
          multiplicador de peso propio. Solo lee; no cambia nada en SAP.
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
                  Tomar de SAP {sinDefinir.length === 1 ? 'la' : `las ${sinDefinir.length}`} sin definir
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
  onCerrar,
}: {
  sap: ConexionSap | undefined;
  cargas: readonly Carga[];
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
    conectarSap().then(
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
              El modelo abierto en SAP2000 de este equipo. Flow se engancha al que ya está abierto y
              solo lee: no lo lanza, no lo guarda ni lo analiza.
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
    </aside>
  );
}
