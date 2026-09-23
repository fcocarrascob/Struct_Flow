import { Fragment, useState } from 'react';
import type { CargaAsignada, ConexionSap, LecturaCargas, LecturaPatrones } from './modelo';
import { cargasPorPatron, comoDe, objetosDe, valorDe } from './sap-cargas';
import { useEscape } from './useEscape';

/**
 * El panel del nodo SAP2000: qué modelo está abierto y qué Load Patterns tiene.
 *
 * SOLO LEE (`docs/rumbo.md`, «Flow no escribe en el modelo»). Habla con el
 * puente de Flow (`puente-sap/puente.py`) por `/sap-api`, que es un proceso
 * aparte: sin él, el panel lo dice y muestra la última lectura guardada.
 *
 * Los patrones se listan tal como están en el modelo; no se comparan con nada.
 * Son la base del paso siguiente: que una variable de la obra justifique una
 * carga asignada en el modelo, o el espectro.
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

/** Cómo se lee un multiplicador: `1,3`, no `1.3`. */
const numero = (n: number): string => String(n).replace('.', ',');

/** Lo último leído del modelo: los patrones y, si se pudieron leer, sus cargas. */
export interface LecturaSap {
  patrones: LecturaPatrones;
  cargas?: LecturaCargas;
}

/** Las cargas de un patrón, una fila por valor distinto. */
function CargasDelPatron({ cargas }: { cargas: readonly CargaAsignada[] }) {
  return (
    <tr>
      <td colSpan={4} className="pb-2 pl-4 pt-0.5">
        <ul className="space-y-0.5 border-l border-border pl-2">
          {cargas.map((c, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[10px] leading-snug">
              <span className="font-mono text-ink">{valorDe(c)}</span>
              <span className="text-muted">{comoDe(c)}</span>
              <span className="ml-auto whitespace-nowrap text-muted">{objetosDe(c)}</span>
            </li>
          ))}
        </ul>
      </td>
    </tr>
  );
}

/**
 * Los Load Patterns del modelo, tal como están: nombre, tipo, multiplicador de
 * peso propio (SWF) y las cargas que tiene asignadas. Solo se listan; se definen
 * y se corrigen en SAP.
 */
function PatronesSap({
  lectura,
  cargas,
  modeloConectado,
  leyendo,
  error,
  onLeer,
}: {
  lectura: LecturaPatrones | undefined;
  cargas: LecturaCargas | undefined;
  modeloConectado: string | undefined;
  leyendo: boolean;
  error: string;
  onLeer: () => void;
}) {
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  const porPatron = cargasPorPatron(cargas?.lista ?? []);
  const alternar = (nombre: string) =>
    setAbiertos((a) => {
      const s = new Set(a);
      if (s.has(nombre)) s.delete(nombre);
      else s.add(nombre);
      return s;
    });

  return (
    <section className="border-t border-border px-5 py-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-ink">Load Patterns</h3>
        <button
          type="button"
          onClick={onLeer}
          disabled={leyendo}
          className="rounded border border-border px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {leyendo ? 'Leyendo…' : lectura ? 'Volver a leer' : 'Leer del modelo'}
        </button>
      </div>

      {error && (
        <p role="status" className="mb-2 rounded border border-aviso px-3 py-2 text-xs leading-snug text-aviso">
          {error}
        </p>
      )}

      {!lectura ? (
        <p className="text-[11px] leading-snug text-muted">
          Todavía no se leyeron. Se leen solos al conectar.
        </p>
      ) : (
        <>
          <p className="mb-2 text-[11px] leading-snug text-muted">
            {lectura.lista.length === 1 ? '1 patrón leído' : `${lectura.lista.length} patrones leídos`} de{' '}
            <span className="font-mono text-ink">{lectura.modelo || '(sin guardar)'}</span> el{' '}
            {new Date(lectura.leido).toLocaleString()}
            {modeloConectado && lectura.modelo !== modeloConectado && (
              <span className="text-aviso"> — no es el modelo de la última conexión ({modeloConectado})</span>
            )}
            .{' '}
            {cargas
              ? 'Pulsa un patrón para ver sus cargas asignadas (en kN, m y °C).'
              : 'Las cargas asignadas no se pudieron leer.'}
          </p>
          {lectura.lista.length > 0 && (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted">
                  <th className="py-1 font-semibold">Nombre</th>
                  <th className="font-semibold">Tipo</th>
                  <th className="text-right font-semibold" title="Multiplicador de peso propio (self weight multiplier)">
                    SWF
                  </th>
                  <th className="text-right font-semibold" title="Cargas distintas asignadas, y en cuántos objetos">
                    Cargas
                  </th>
                </tr>
              </thead>
              <tbody>
                {lectura.lista.map((p) => {
                  const suyas = porPatron.get(p.nombre) ?? [];
                  const abierto = abiertos.has(p.nombre);
                  const objetos = suyas.reduce((s, c) => s + c.n, 0);
                  return (
                    <Fragment key={p.nombre}>
                      <tr
                        onClick={suyas.length ? () => alternar(p.nombre) : undefined}
                        className={`border-t border-border/60 ${suyas.length ? 'cursor-pointer hover:bg-accent/5' : ''}`}
                      >
                        <td className="py-1 pr-2 font-mono text-ink">
                          <span className="inline-block w-3 text-muted">{suyas.length ? (abierto ? '▾' : '▸') : ''}</span>
                          {p.nombre}
                        </td>
                        <td className="pr-2 text-muted">{p.tipo || '—'}</td>
                        <td className="text-right font-mono text-muted">{numero(p.pesoPropio)}</td>
                        <td
                          className="text-right text-muted"
                          title={suyas.length ? `${suyas.length} carga(s) distinta(s) en ${objetos} objeto(s)` : undefined}
                        >
                          {!cargas ? '' : suyas.length ? suyas.length : '—'}
                        </td>
                      </tr>
                      {abierto && suyas.length > 0 && <CargasDelPatron cargas={suyas} />}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

export default function PanelSap({
  sap,
  onConectado,
  onLeido,
  onCerrar,
}: {
  sap: ConexionSap | undefined;
  onConectado: (sap: ConexionSap) => void;
  onLeido: (lectura: LecturaSap) => void;
  onCerrar: () => void;
}) {
  useEscape(onCerrar);
  const [estado, setEstado] = useState<{ fase: 'quieto' | 'conectando' } | { fase: 'error'; motivo: string }>({
    fase: 'quieto',
  });
  const [leyendo, setLeyendo] = useState(false);
  const [errorPatrones, setErrorPatrones] = useState('');

  /**
   * Los patrones y después sus cargas: de a una, porque el puente atiende de a
   * una petición. Si las cargas fallan —un puente anterior no tiene `/cargas`—,
   * los patrones se guardan igual y el error lo dice.
   */
  const leerPatrones = async () => {
    setLeyendo(true);
    setErrorPatrones('');
    try {
      const p = await alPuente<{ modelo?: string; patrones?: LecturaPatrones['lista'] }>('/patrones');
      const patrones = { modelo: p.modelo ?? '', leido: new Date().toISOString(), lista: p.patrones ?? [] };
      let cargas: LecturaCargas | undefined;
      try {
        const c = await alPuente<{ modelo?: string; cargas?: LecturaCargas['lista'] }>('/cargas');
        cargas = { modelo: c.modelo ?? '', leido: new Date().toISOString(), lista: c.cargas ?? [] };
      } catch (e) {
        setErrorPatrones(`Las cargas asignadas no se pudieron leer: ${(e as Error).message}`);
      }
      onLeido({ patrones, ...(cargas ? { cargas } : {}) });
    } catch (e) {
      setErrorPatrones((e as Error).message);
    } finally {
      setLeyendo(false);
    }
  };

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
        // Conectar es querer ver el modelo: los patrones vienen con él. Va
        // después de la conexión porque el puente atiende de a una petición.
        void leerPatrones();
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

      {sap && (
        <PatronesSap
          lectura={sap.patrones}
          cargas={sap.cargas}
          modeloConectado={sap.modelo}
          leyendo={leyendo}
          error={errorPatrones}
          onLeer={() => void leerPatrones()}
        />
      )}
    </aside>
  );
}
