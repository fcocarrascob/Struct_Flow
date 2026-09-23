import { useCallback, useState } from 'react';
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
  planAplicaciones,
  planEmpuje,
  type EstadoPatron,
} from './sap';
import { useEscape } from './useEscape';

/**
 * El panel del nodo SAP2000: conectarse al modelo abierto, compararlo con la obra
 * y, tras confirmar, escribir en él.
 *
 * Habla con el puente de Flow (`puente-sap/puente.py`) por `/sap-api`, que es un
 * proceso aparte: sin él, el panel lo dice y muestra la última conexión
 * guardada.
 */

/**
 * Cuánto se espera al puente. Atiende de a una petición y cada una es una
 * llamada COM: si SAP tiene un diálogo modal abierto, la llamada no vuelve nunca,
 * y sin tope el botón se quedaba en «Conectando…» para siempre.
 */
const TOPE_MS = 30_000;

/**
 * Peticiones al puente sin respuesta todavía. Mientras haya alguna, Escape no
 * cierra el panel: el resultado de una escritura —o el error que dice hasta
 * dónde se llegó— vive en el panel, y cerrarlo lo perdía con SAP ya modificado.
 */
let enVuelo = 0;

/** Una llamada al puente, con los mismos mensajes para todas. */
async function alPuente<T>(ruta: string, cuerpo?: unknown): Promise<T> {
  let r: Response;
  enVuelo++;
  try {
    try {
      r = await fetch(`/sap-api${ruta}`, {
        method: cuerpo === undefined ? 'GET' : 'POST',
        // El puente solo acepta POST con JSON: es lo que impide que otra página
        // abierta en el navegador le escriba al modelo.
        headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(TOPE_MS),
      });
    } catch (e) {
      if ((e as Error).name === 'TimeoutError') {
        throw new Error(
          `SAP2000 no respondió en ${TOPE_MS / 1000} s. ¿Tiene un diálogo abierto? Ciérralo y vuelve a intentar; ` +
            'si estabas escribiendo, vuelve a comparar antes de repetir.',
        );
      }
      throw new Error('El puente de SAP no responde.');
    }
    const datos = await r.json().catch(() => null);
    // Sin puente, el proxy de Vite responde 502 sin cuerpo JSON.
    if (!datos) throw new Error('El puente de SAP no está corriendo. Arráncalo con `npm run puente-sap`.');
    if (!r.ok) throw new Error(datos.motivo ?? `El puente respondió ${r.status}.`);
    return datos as T;
  } finally {
    enVuelo--;
  }
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

const SOLO_LECTURA = 'Otra pestaña está editando esta obra: desde aquí no se escribe en SAP.';

/**
 * Escribir los patrones en SAP. Se muestra la lista EXACTA de lo que se va a
 * escribir y se confirma; no hay otro camino. Lo que se escribe lo dice
 * `planEmpuje`, la misma función que prueba `verify:obra`.
 */
function EmpujeSap({
  cargas,
  lectura,
  onEscrito,
  soloLectura,
}: {
  cargas: readonly Carga[];
  lectura: LecturaPatrones;
  onEscrito: (ruta: string, lectura: LecturaPatrones) => void;
  soloLectura: boolean;
}) {
  const [fase, setFase] = useState<
    | { f: 'quieto' }
    | { f: 'confirmando' }
    | { f: 'escribiendo' }
    | { f: 'hecho'; texto: string }
    | { f: 'error'; motivo: string }
  >({ f: 'quieto' });
  const { cambios, omitidas } = planEmpuje(cargas, lectura.lista);

  const escribir = () => {
    setFase({ f: 'escribiendo' });
    alPuente<RespuestaPatrones & { hechos?: { nombre: string; accion: string }[]; aviso?: string }>('/patrones', {
      modelo: lectura.modelo,
      ruta: lectura.ruta,
      cambios,
    }).then(
      (d) => {
        const hechos = d.hechos ?? [];
        // Con `aviso` se escribió pero no se pudo releer: la lectura vieja se
        // queda, y el texto pide volver a leer.
        if (!d.aviso) onEscrito(d.ruta ?? '', aLectura(d));
        const creados = hechos.filter((h) => h.accion === 'creado').length;
        const ajustados = hechos.length - creados;
        setFase({
          f: 'hecho',
          texto:
            `Escrito en ${d.modelo ?? lectura.modelo}: ${creados} creado${creados === 1 ? '' : 's'} y ` +
            `${ajustados} ajustado${ajustados === 1 ? '' : 's'}. ` +
            (d.aviso ? `${d.aviso} Vuelve a leer. ` : '') +
            'El modelo NO se guardó: guárdalo en SAP si quieres conservarlo.',
        });
      },
      (e: Error) => setFase({ f: 'error', motivo: e.message }),
    );
  };

  if (fase.f === 'hecho' || fase.f === 'error') {
    return (
      <p
        role="status"
        className={`mb-2 rounded border px-3 py-2 text-xs leading-snug ${
          fase.f === 'hecho' ? 'border-border text-ink' : 'border-error text-error'
        }`}
      >
        {fase.f === 'hecho' ? fase.texto : fase.motivo}{' '}
        <button type="button" onClick={() => setFase({ f: 'quieto' })} className="underline">
          cerrar
        </button>
      </p>
    );
  }

  if (cambios.length === 0) {
    return omitidas.length ? (
      <p className="mb-2 text-[10px] leading-snug text-muted">
        Nada que escribir en SAP. Sin tipo SAP, no se crean: {omitidas.map((o) => o.nombre).join(', ')}.
      </p>
    ) : null;
  }

  if (fase.f === 'quieto') {
    return (
      <button
        type="button"
        onClick={() => setFase({ f: 'confirmando' })}
        disabled={soloLectura}
        title={soloLectura ? SOLO_LECTURA : undefined}
        className="mb-2 rounded border border-accent px-2 py-0.5 text-[11px] font-medium text-accent hover:bg-accent hover:text-white disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-accent"
      >
        Escribir en SAP ({cambios.length} cambio{cambios.length === 1 ? '' : 's'})…
      </button>
    );
  }

  return (
    <div className="mb-2 rounded border border-accent px-3 py-2 text-[11px]">
      <p className="mb-1 font-medium text-ink">
        Se va a escribir en <span className="font-mono">{lectura.modelo}</span>:
      </p>
      <ul className="mb-1 list-disc pl-4 font-mono text-[10px] text-ink">
        {cambios.map((c) => (
          <li key={c.nombre}>
            {c.accion === 'crear' ? 'crear' : 'ajustar'} {c.nombre} — {c.tipo}, peso propio {numero(c.pesoPropio)}
          </li>
        ))}
      </ul>
      {omitidas.length > 0 && (
        <p className="mb-1 text-[10px] text-muted">
          No se crean, porque no dicen su tipo SAP: {omitidas.map((o) => o.nombre).join(', ')}.
        </p>
      )}
      <p className="mb-2 text-[10px] leading-snug text-muted">
        Crear agrega también el caso estático lineal del mismo nombre, salvo que ya haya un caso con
        ese nombre (un espectro, por ejemplo), que se respeta. No se borra nada y el modelo no se
        guarda.
      </p>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={escribir}
          disabled={fase.f === 'escribiendo'}
          className="rounded border border-accent bg-accent px-2 py-0.5 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {fase.f === 'escribiendo' ? 'Escribiendo…' : 'Escribir en SAP'}
        </button>
        <button
          type="button"
          onClick={() => setFase({ f: 'quieto' })}
          disabled={fase.f === 'escribiendo'}
          className="rounded border border-border px-2 py-0.5 text-[11px] text-muted hover:text-ink"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Una lectura de grupos: de qué modelo salió. */
export interface LecturaGrupos {
  modelo: string;
  ruta: string;
  leido: string;
}

/**
 * Los grupos del modelo, y crear uno con lo que está seleccionado en SAP. Los
 * leídos quedan en la obra para ofrecerlos al aplicar una partida.
 */
function GruposSap({
  grupos,
  gruposDe,
  conexion,
  onLeidos,
  soloLectura,
}: {
  grupos: readonly GrupoSap[] | undefined;
  gruposDe: string | undefined;
  /** El modelo conectado: crear un grupo solo se hace en él. */
  conexion: { modelo: string; ruta: string } | undefined;
  onLeidos: (grupos: GrupoSap[], lectura: LecturaGrupos) => void;
  soloLectura: boolean;
}) {
  const [nombre, setNombre] = useState('');
  const [aviso, setAviso] = useState<{ error: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const leer = () =>
    alPuente<{ modelo: string; ruta: string; grupos: GrupoSap[] }>('/grupos').then((d) =>
      onLeidos(d.grupos, { modelo: d.modelo, ruta: d.ruta, leido: new Date().toISOString() }),
    );

  const correr = (accion: () => Promise<unknown>) => {
    setOcupado(true);
    setAviso(null);
    accion()
      .catch((e: Error) => setAviso({ error: true, texto: e.message }))
      .finally(() => setOcupado(false));
  };

  const crear = () =>
    correr(async () => {
      if (!conexion) throw new Error('Conéctate primero: el grupo se crea en el modelo conectado.');
      const g = await alPuente<GrupoSap>('/grupos', { nombre: nombre.trim(), ...conexion });
      setAviso({ error: false, texto: `Grupo ${g.nombre} creado con ${g.areas} áreas y ${g.barras} barras.` });
      setNombre('');
      await leer();
    });

  return (
    <section className="border-t border-border px-5 py-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-ink">Grupos</h3>
        <button
          type="button"
          onClick={() => correr(leer)}
          disabled={ocupado}
          className="rounded border border-border px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {grupos ? 'Volver a leer' : 'Leer del modelo'}
        </button>
      </div>
      {grupos && (
        <p className="mb-2 font-mono text-[10px] leading-relaxed text-muted">
          {grupos.map((g) => `${g.nombre} (${g.areas} áreas, ${g.barras} barras)`).join(' · ')}
        </p>
      )}
      {grupos && gruposDe && conexion && gruposDe !== conexion.modelo && (
        <p className="mb-2 text-[10px] text-aviso">
          Leídos de {gruposDe}, que no es el modelo de la última conexión ({conexion.modelo}).
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del grupo nuevo"
          aria-label="Nombre del grupo nuevo"
          className="w-44 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={crear}
          disabled={ocupado || !nombre.trim() || soloLectura}
          title={soloLectura ? SOLO_LECTURA : 'Selecciona en SAP2000 las barras o áreas y crea el grupo con ellas'}
          className="rounded border border-border px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Crear con la selección de SAP
        </button>
      </div>
      {aviso && (
        <p role="status" className={`mt-1.5 text-[11px] ${aviso.error ? 'text-aviso' : 'text-muted'}`}>
          {aviso.texto}
        </p>
      )}
    </section>
  );
}

/**
 * Las partidas aplicadas, contra lo que su patrón tiene hoy sobre el grupo, y
 * escribirlas tras confirmar. La lectura no se guarda: se hace cuando se quiere
 * mirar.
 */
function AplicacionesSap({ filas, soloLectura }: { filas: readonly FilaAplicacion[]; soloLectura: boolean }) {
  const [leidas, setLeidas] = useState<{ modelo: string; ruta: string; porId: Record<string, LeidaAplicacion> } | null>(
    null,
  );
  const [error, setError] = useState('');
  const [leyendo, setLeyendo] = useState(false);

  const leer = () => {
    setLeyendo(true);
    setError('');
    alPuente<{ modelo: string; ruta: string; aplicaciones: (LeidaAplicacion & { id: string })[] }>('/aplicaciones/leer', {
      aplicaciones: filas.map((f) => ({
        id: f.id,
        patron: f.patron,
        tipo: f.aplicacion.tipo,
        grupo: f.aplicacion.grupo,
      })),
    })
      .then((d) =>
        setLeidas({ modelo: d.modelo, ruta: d.ruta, porId: Object.fromEntries(d.aplicaciones.map((a) => [a.id, a])) }),
      )
      .catch((e: Error) => setError(e.message))
      .finally(() => setLeyendo(false));
  };

  const COLOR = { igual: 'text-muted', difiere: 'text-error', 'sin-objetos': 'text-aviso', error: 'text-error' };

  /** Cada fila contra lo leído, junto con sus hermanas del mismo patrón y grupo. */
  const comparar = (f: FilaAplicacion) => {
    const l = leidas?.porId[f.id];
    return l ? compararAplicacion(f, l, hermanasDe(filas, f)) : null;
  };

  // Escribir solo se ofrece después de comparar: el puente exige el modelo
  // comparado, y el plan necesita saber qué está igual.
  const [confirmando, setConfirmando] = useState(false);
  const [escrito, setEscrito] = useState('');
  const plan = leidas ? planAplicaciones(filas, (f) => comparar(f)?.estado) : null;
  const DIR = Object.fromEntries(DIRECCIONES_SAP.map((d) => [d.codigo, d.texto]));

  const escribir = () => {
    if (!leidas || !plan) return;
    setLeyendo(true);
    setError('');
    alPuente<{ hechos: { patron: string; grupo: string; objetos: number }[] }>('/aplicaciones', {
      modelo: leidas.modelo,
      ruta: leidas.ruta,
      aplicaciones: plan.escribir.map((f) => ({
        id: f.id,
        patron: f.patron,
        tipo: f.aplicacion.tipo,
        grupo: f.aplicacion.grupo,
        direccion: f.aplicacion.direccion,
        distribucion: f.aplicacion.distribucion,
        valor: f.valor,
      })),
    })
      .then((d) => {
        const objetos = d.hechos.reduce((s, h) => s + h.objetos, 0);
        setEscrito(
          `Escrito en ${leidas.modelo}: ${d.hechos.length} carga${d.hechos.length === 1 ? '' : 's'} sobre ${objetos} objetos. ` +
            'El modelo NO se guardó: guárdalo en SAP si quieres conservarlo.',
        );
        setConfirmando(false);
        leer();
      })
      .catch((e: Error) => {
        setError(e.message);
        setLeyendo(false);
      });
  };

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
          {leyendo ? 'Leyendo…' : 'Comparar con el modelo'}
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
          {leidas && <p className="mb-1 text-[10px] text-muted">Leído de {leidas.modelo}.</p>}
          {escrito && <p role="status" className="mb-2 rounded border border-border px-2 py-1 text-[11px] text-ink">{escrito}</p>}

          {plan && !confirmando && plan.escribir.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setEscrito('');
                setConfirmando(true);
              }}
              disabled={leyendo || soloLectura}
              title={soloLectura ? SOLO_LECTURA : undefined}
              className="mb-2 rounded border border-accent px-2 py-0.5 text-[11px] font-medium text-accent hover:bg-accent hover:text-white disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-accent"
            >
              Escribir en SAP ({plan.escribir.length} carga{plan.escribir.length === 1 ? '' : 's'})…
            </button>
          )}
          {plan && plan.bloqueados.length > 0 && (
            <p className="mb-2 rounded border border-aviso px-2 py-1 text-[10px] leading-snug text-aviso">
              No se escribe{' '}
              {plan.bloqueados
                .map((b) => `${b.patron} (sin valor o sin grupo: ${b.partidas.join(', ')})`)
                .join('; ')}
              . Cada patrón se reescribe entero, y hacerlo sin esas partidas borraría del modelo la carga
              que hoy tengan. Arréglalas y vuelve a comparar.
            </p>
          )}
          {plan && plan.escribir.length === 0 && plan.bloqueados.length === 0 && !escrito && (
            <p className="mb-2 text-[10px] text-muted">Todo lo que se puede escribir ya está igual en el modelo.</p>
          )}
          {plan && confirmando && (
            <div className="mb-2 rounded border border-accent px-3 py-2 text-[11px]">
              <p className="mb-1 font-medium text-ink">
                Se va a escribir en <span className="font-mono">{leidas!.modelo}</span>:
              </p>
              <ul className="mb-1 list-disc pl-4 font-mono text-[10px] text-ink">
                {plan.escribir.map((f) => (
                  <li key={f.id}>
                    {f.patron} · {f.partida} → {f.aplicacion.grupo}:{' '}
                    {numero(Number(f.valor!.toPrecision(6)))} {f.unidad.replace('^2', '²')},{' '}
                    {f.aplicacion.tipo === 'area-a-barras'
                      ? `área a barras en ${f.aplicacion.distribucion === 2 ? 'dos direcciones' : 'una dirección'}`
                      : 'distribuida en barra'}
                    , {DIR[f.aplicacion.direccion] ?? f.aplicacion.direccion}
                  </li>
                ))}
              </ul>
              {plan.omitidas.length > 0 && (
                <p className="mb-1 text-[10px] text-muted">
                  No se escriben: {plan.omitidas.map((o) => `${o.partida} (${o.motivo})`).join(', ')}.
                </p>
              )}
              <p className="mb-2 text-[10px] leading-snug text-muted">
                Cada patrón se escribe entero: la primera partida reemplaza lo que ese patrón tenía en
                los objetos del grupo, y las siguientes se suman. No se toca nada fuera de esos grupos
                y el modelo no se guarda.
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={escribir}
                  disabled={leyendo}
                  className="rounded border border-accent bg-accent px-2 py-0.5 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {leyendo ? 'Escribiendo…' : 'Escribir en SAP'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  disabled={leyendo}
                  className="rounded border border-border px-2 py-0.5 text-[11px] text-muted hover:text-ink"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                <th className="py-1 font-semibold">Patrón · partida</th>
                <th className="font-semibold">Grupo</th>
                <th className="font-semibold">Flow</th>
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
 * tabla dice en qué se aparta el MODELO, y «Escribir en SAP» lo corrige tras
 * confirmar. Corregir la obra se hace en el panel de Cargas.
 */
function ComparacionPatrones({
  cargas,
  lectura,
  modeloConectado,
  onLeidos,
  onTraer,
  onAdoptar,
  soloLectura,
}: {
  cargas: readonly Carga[];
  lectura: LecturaPatrones | undefined;
  modeloConectado: string | undefined;
  soloLectura: boolean;
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
          multiplicador de peso propio. Leer no cambia nada en SAP; escribir se ofrece después,
          con la lista de cambios a la vista.
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

          <EmpujeSap cargas={cargas} lectura={lectura} onEscrito={onLeidos} soloLectura={soloLectura} />

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
  aplicaciones,
  onGruposLeidos,
  onCerrar,
  soloLectura,
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
  /** Sin el candado de la obra: se lee, pero no se escribe en SAP. */
  soloLectura: boolean;
}) {
  // Con una petición al puente en vuelo, Escape no cierra: ver `enVuelo`.
  const cerrarSiQuieto = useCallback(() => {
    if (enVuelo === 0) onCerrar();
  }, [onCerrar]);
  useEscape(cerrarSiQuieto);
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
              El modelo abierto en SAP2000 de este equipo. Flow se engancha al que ya está abierto:
              no lo lanza, no lo guarda ni lo analiza. Lee patrones, grupos y cargas, y solo escribe
              tras confirmar una lista de cambios; nunca borra nada.
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
        soloLectura={soloLectura}
      />
      <GruposSap
        grupos={sap?.grupos}
        gruposDe={sap?.gruposDe}
        conexion={sap ? { modelo: sap.modelo, ruta: sap.ruta } : undefined}
        onLeidos={onGruposLeidos}
        soloLectura={soloLectura}
      />
      <AplicacionesSap filas={aplicaciones} soloLectura={soloLectura} />
    </aside>
  );
}
