import { useState } from 'react';
import type { ConexionSap } from './modelo';
import { useEscape } from './useEscape';

/**
 * El panel del nodo SAP2000: leer qué modelo está abierto.
 *
 * SOLO LEE (`docs/rumbo.md`, «Flow no escribe en el modelo»). Habla con el
 * puente de Flow (`puente-sap/puente.py`) por `/sap-api`, que es un proceso
 * aparte: sin él, el panel lo dice y muestra la última conexión guardada.
 *
 * En la rama `grupos-sin-cargas` la comparación de Load Patterns y de cargas
 * aplicadas se retiró junto con las cargas, de las que colgaba: queda la
 * conexión.
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

export default function PanelSap({
  sap,
  onConectado,
  onCerrar,
}: {
  sap: ConexionSap | undefined;
  onConectado: (sap: ConexionSap) => void;
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
        onConectado({ modelo: d.modelo, ruta: d.ruta, version: d.version, leido: new Date().toISOString() });
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
              Flow lee qué modelo está abierto en este equipo. No escribe, no guarda ni analiza.
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
    </aside>
  );
}
