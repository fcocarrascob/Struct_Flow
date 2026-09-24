import { Fragment, useState } from 'react';
import type {
  CargaAsignada,
  ConexionSap,
  Justificacion,
  LecturaCargas,
  LecturaEspectro,
  LecturaPatrones,
  SistemaUnidades,
} from './modelo';
import {
  cargaDe,
  cargasPorPatron,
  cifra,
  comoDe,
  esDeEspectro,
  justificacionDe,
  objetosDe,
  valorDe,
  verificar,
  verificarEspectro,
  type Verificacion,
} from './sap-cargas';
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
  espectro?: LecturaEspectro;
}

/** Lo que hace falta para justificar: la obra, sus justificaciones y el gesto. */
export interface Justificar {
  scope: Record<string, unknown>;
  justificaciones: readonly Justificacion[];
  /** En qué se muestran las cargas del modelo. Solo presentación. */
  unidades: SistemaUnidades;
  onUnidades: (u: SistemaUnidades) => void;
  /** Ata la carga a la expresión, o la desata con `undefined`. `actual` es la
   *  justificación que ya tenía, si la tenía. */
  onJustificar: (carga: CargaAsignada, expr: string | undefined, actual: Justificacion | undefined) => void;
  /** Lo mismo para el espectro: `que` dice qué se ata, con los campos de la
   *  justificación que lo identifican. */
  onJustificarEspectro: (
    que: Pick<Justificacion, 'clase' | 'patron' | 'firma' | 'valor'>,
    expr: string | undefined,
    actual: Justificacion | undefined,
  ) => void;
}

/**
 * Un campo para escribir la expresión que respalda algo del modelo, con su
 * veredicto debajo. Se aplica al salir del campo o con Enter, como un campo
 * atado: una expresión a medio escribir no tiene nada que verificar.
 */
function CampoJustificacion({
  j,
  v,
  etiqueta,
  placeholder,
  onCambiar,
}: {
  j: Justificacion | undefined;
  v: Verificacion | undefined;
  etiqueta: string;
  placeholder: string;
  onCambiar: (expr: string | undefined) => void;
}) {
  return (
    <>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span
          className={`w-3 shrink-0 text-center ${!v ? 'text-muted' : v.estado === 'coincide' ? 'text-emerald-600' : 'text-error'}`}
          aria-hidden
        >
          {!v ? '·' : v.estado === 'coincide' ? '✓' : '✗'}
        </span>
        <input
          type="text"
          key={`${j?.id ?? 'nueva'}:${j?.expr ?? ''}`}
          defaultValue={j?.expr ?? ''}
          onBlur={(e) => {
            const t = e.target.value.trim();
            if (t !== (j?.expr ?? '')) onCambiar(t || undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          placeholder={placeholder}
          aria-label={etiqueta}
          className="min-w-0 flex-1 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-ink outline-none placeholder:font-sans placeholder:text-muted/70 focus:border-accent"
        />
      </div>
      {v && <p className={`ml-[18px] mt-0.5 ${v.estado === 'coincide' ? 'text-muted' : 'text-error'}`}>{v.detalle}</p>}
    </>
  );
}

/**
 * Los casos de espectro de respuesta del modelo y las funciones que usan.
 *
 * Cada dirección de un caso se justifica por su factor de escala (en m/s²), y
 * cada función por una función de la obra de un periodo —la que publica el nodo
 * del espectro, `Sa_esp`—, que se compara en todos los puntos del modelo.
 */
function EspectroSap({ lectura, justificar }: { lectura: LecturaEspectro; justificar: Justificar }) {
  const buscar = (clase: Justificacion['clase'], patron: string, firma: string) =>
    justificar.justificaciones.find((j) => j.clase === clase && j.patron === patron && j.firma === firma);
  const huerfanas = justificar.justificaciones.filter(
    (j) => esDeEspectro(j) && !verificarEspectro(j, lectura, justificar.scope),
  );
  const rango = (p: [number, number][]) =>
    p.length ? `${p.length} puntos, T de ${cifra(p[0][0])} a ${cifra(p[p.length - 1][0])} s` : 'sin puntos';

  return (
    <section className="border-t border-border px-5 py-4">
      <h3 className="mb-2 text-xs font-semibold text-ink">Espectro de respuesta</h3>
      {lectura.casos.length === 0 ? (
        <p className="text-[11px] leading-snug text-muted">El modelo no tiene casos de espectro de respuesta.</p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {lectura.casos.map((c) => (
              <li key={c.nombre} className="text-[11px]">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono font-semibold text-ink">{c.nombre}</span>
                  <span className="text-muted">
                    {c.combinacion} · {cifra(c.amortiguamiento * 100)} % de amortiguamiento · modal {c.modal || '—'}
                  </span>
                </p>
                <ul className="mt-1 space-y-1.5 border-l border-border pl-2">
                  {c.cargas.map((k) => {
                    const que = { clase: 'factor-espectro' as const, patron: c.nombre, firma: k.dir, valor: k.sf };
                    const j = buscar(que.clase, que.patron, que.firma);
                    return (
                      <li key={k.dir} className="text-[10px] leading-snug">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-mono text-ink">SF {cifra(k.sf)} m/s²</span>
                          <span className="text-muted">
                            {k.dir} · función {k.funcion}
                            {k.csys && k.csys.toUpperCase() !== 'GLOBAL' ? ` · ${k.csys}` : ''}
                            {k.angulo ? ` · ${cifra(k.angulo)}°` : ''}
                          </span>
                        </div>
                        <CampoJustificacion
                          j={j}
                          v={j ? verificarEspectro(j, lectura, justificar.scope) : undefined}
                          etiqueta={`Expresión que justifica el factor de escala de ${c.nombre} en ${k.dir}`}
                          placeholder="justificar el factor, por ejemplo SF_RSX"
                          onCambiar={(expr) => justificar.onJustificarEspectro(que, expr, j)}
                        />
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>

          <h4 className="mb-1 mt-4 text-[10px] font-semibold uppercase tracking-wide text-muted">Funciones que usan</h4>
          <ul className="space-y-1.5">
            {lectura.funciones.map((f) => {
              const que = { clase: 'funcion-espectro' as const, patron: f.nombre, firma: 'funcion', valor: f.puntos.length };
              const j = buscar(que.clase, que.patron, que.firma);
              return (
                <li key={f.nombre} className="text-[10px] leading-snug">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-ink">{f.nombre}</span>
                    <span className="text-muted">{rango(f.puntos)}</span>
                  </div>
                  <CampoJustificacion
                    j={j}
                    v={j ? verificarEspectro(j, lectura, justificar.scope) : undefined}
                    etiqueta={`Función de la obra que justifica ${f.nombre}`}
                    placeholder="justificar con una función de la obra, por ejemplo Sa_esp"
                    onCambiar={(expr) => justificar.onJustificarEspectro(que, expr, j)}
                  />
                </li>
              );
            })}
          </ul>
          {huerfanas.length > 0 && (
            <p className="mt-2 text-[10px] text-aviso">
              {huerfanas.length} justificación(es) del espectro ya no encuentran su caso o su función en el modelo
              leído: {huerfanas.map((j) => j.patron).join(', ')}.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Una carga del modelo y la expresión de la obra que la respalda.
 *
 * Se escribe en el campo y se aplica al salir de él, como un campo atado: una
 * expresión a medio escribir no tiene nada que verificar.
 */
function CargaJustificable({
  carga,
  todas,
  justificar,
}: {
  carga: CargaAsignada;
  todas: readonly CargaAsignada[];
  justificar: Justificar;
}) {
  const j = justificacionDe(carga, todas, justificar.justificaciones);
  const v = j ? verificar(j.expr, carga, justificar.scope, justificar.unidades) : undefined;
  return (
    <li className="text-[10px] leading-snug">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-ink">{valorDe(carga, justificar.unidades)}</span>
        <span className="text-muted">{comoDe(carga)}</span>
        <span className="ml-auto whitespace-nowrap text-muted">{objetosDe(carga)}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span
          className={`w-3 shrink-0 text-center ${
            !v ? 'text-muted' : v.estado === 'coincide' ? 'text-emerald-600' : 'text-error'
          }`}
          aria-hidden
        >
          {!v ? '·' : v.estado === 'coincide' ? '✓' : '✗'}
        </span>
        <input
          type="text"
          // Por `key`: si la justificación cambia por fuera (Ctrl+Z, otra lectura),
          // el campo se rehace con lo que dice el documento.
          key={`${j?.id ?? 'nueva'}:${j?.expr ?? ''}`}
          defaultValue={j?.expr ?? ''}
          onBlur={(e) => {
            const t = e.target.value.trim();
            if (t !== (j?.expr ?? '')) justificar.onJustificar(carga, t || undefined, j);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          placeholder="justificar con una expresión de la obra"
          aria-label={`Expresión que justifica ${valorDe(carga, justificar.unidades)} de ${carga.patron}`}
          className="min-w-0 flex-1 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-ink outline-none placeholder:font-sans placeholder:text-muted/70 focus:border-accent"
        />
      </div>
      {v && (
        <p className={`ml-[18px] mt-0.5 ${v.estado === 'coincide' ? 'text-muted' : 'text-error'}`}>
          {v.detalle}
        </p>
      )}
    </li>
  );
}

/** Las cargas de un patrón, una fila por valor distinto. */
function CargasDelPatron({
  cargas,
  todas,
  justificar,
}: {
  cargas: readonly CargaAsignada[];
  todas: readonly CargaAsignada[];
  justificar: Justificar;
}) {
  return (
    <tr>
      <td colSpan={4} className="pb-2 pl-4 pt-0.5">
        <ul className="space-y-1.5 border-l border-border pl-2">
          {cargas.map((c, i) => (
            <CargaJustificable key={i} carga={c} todas={todas} justificar={justificar} />
          ))}
        </ul>
      </td>
    </tr>
  );
}

/**
 * Las justificaciones cuya carga ya no está en el modelo leído: el valor cambió
 * y hay más de una candidata, o la carga se borró. No se descartan solas —son
 * trabajo del ingeniero—; se ven aquí y se quitan a mano.
 */
function Huerfanas({ huerfanas, onQuitar }: { huerfanas: readonly Justificacion[]; onQuitar: (id: string) => void }) {
  if (!huerfanas.length) return null;
  return (
    <div className="mt-3 rounded border border-aviso px-3 py-2">
      <p className="mb-1 text-[11px] font-semibold text-aviso">Justificaciones sin su carga en el modelo</p>
      <ul className="space-y-1">
        {huerfanas.map((j) => (
          <li key={j.id} className="flex items-baseline gap-2 text-[10px]">
            <span className="font-mono text-ink">{j.patron}</span>
            <span className="text-muted">era {cifra(j.valor)}</span>
            <span className="font-mono text-muted">{j.expr}</span>
            <button
              type="button"
              onClick={() => onQuitar(j.id)}
              className="ml-auto rounded border border-border px-1.5 text-muted hover:border-error hover:text-error"
            >
              quitar
            </button>
          </li>
        ))}
      </ul>
    </div>
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
  justificar,
  onQuitarJustificacion,
}: {
  lectura: LecturaPatrones | undefined;
  cargas: LecturaCargas | undefined;
  modeloConectado: string | undefined;
  leyendo: boolean;
  error: string;
  onLeer: () => void;
  justificar: Justificar;
  onQuitarJustificacion: (id: string) => void;
}) {
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  const todas = cargas?.lista ?? [];
  const porPatron = cargasPorPatron(todas);
  const huerfanas = justificar.justificaciones.filter((j) => !esDeEspectro(j) && !cargaDe(j, todas));
  /** Por patrón: cuántas cargas coinciden y si alguna no. */
  const estadoDe = (suyas: readonly CargaAsignada[]) => {
    let ok = 0;
    let mal = 0;
    for (const c of suyas) {
      const j = justificacionDe(c, todas, justificar.justificaciones);
      if (!j) continue;
      if (verificar(j.expr, c, justificar.scope).estado === 'coincide') ok++;
      else mal++;
    }
    return { ok, mal };
  };
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
        <div className="flex items-baseline gap-2">
          {/* Solo cambia cómo se muestran: se lee, se guarda y se compara en kN. */}
          <div
            role="group"
            aria-label="Unidades en que se muestran las cargas"
            title="Cómo se muestran las cargas del modelo. Se leen y se comparan siempre en kN."
            className="flex overflow-hidden rounded border border-border text-[11px]"
          >
            {(['kN', 'tonf'] as const).map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={justificar.unidades === u}
                onClick={() => justificar.onUnidades(u)}
                className={`px-2 py-0.5 ${
                  justificar.unidades === u ? 'bg-accent text-white' : 'text-muted hover:text-accent'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onLeer}
            disabled={leyendo}
            className="rounded border border-border px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {leyendo ? 'Leyendo…' : lectura ? 'Volver a leer' : 'Leer del modelo'}
          </button>
        </div>
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
              ? `Pulsa un patrón para ver sus cargas asignadas (en ${justificar.unidades}, m y °C).`
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
                  <th className="text-right font-semibold" title="Cargas justificadas por la obra, de las distintas que tiene el patrón">
                    Justif.
                  </th>
                </tr>
              </thead>
              <tbody>
                {lectura.lista.map((p) => {
                  const suyas = porPatron.get(p.nombre) ?? [];
                  const abierto = abiertos.has(p.nombre);
                  const objetos = suyas.reduce((s, c) => s + c.n, 0);
                  const { ok, mal } = estadoDe(suyas);
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
                          className={`whitespace-nowrap text-right font-mono ${
                            mal ? 'text-error' : suyas.length && ok === suyas.length ? 'text-emerald-600' : 'text-muted'
                          }`}
                          title={
                            suyas.length
                              ? `${suyas.length} carga(s) distinta(s) en ${objetos} objeto(s); ${ok} justificada(s)` +
                                (mal ? `, ${mal} que no coincide(n)` : '')
                              : undefined
                          }
                        >
                          {!cargas ? '' : suyas.length ? `${ok}/${suyas.length}${mal ? ' ✗' : ''}` : '—'}
                        </td>
                      </tr>
                      {abierto && suyas.length > 0 && (
                        <CargasDelPatron cargas={suyas} todas={todas} justificar={justificar} />
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
          {cargas && <Huerfanas huerfanas={huerfanas} onQuitar={onQuitarJustificacion} />}
        </>
      )}
    </section>
  );
}

export default function PanelSap({
  sap,
  onConectado,
  onLeido,
  justificar,
  onQuitarJustificacion,
  onCerrar,
}: {
  sap: ConexionSap | undefined;
  onConectado: (sap: ConexionSap) => void;
  onLeido: (lectura: LecturaSap) => void;
  justificar: Justificar;
  onQuitarJustificacion: (id: string) => void;
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
      let espectro: LecturaEspectro | undefined;
      const fallos: string[] = [];
      try {
        const c = await alPuente<{ modelo?: string; cargas?: LecturaCargas['lista'] }>('/cargas');
        cargas = { modelo: c.modelo ?? '', leido: new Date().toISOString(), lista: c.cargas ?? [] };
      } catch (e) {
        fallos.push(`Las cargas asignadas no se pudieron leer: ${(e as Error).message}`);
      }
      try {
        const s = await alPuente<Omit<LecturaEspectro, 'leido'>>('/espectro');
        espectro = { modelo: s.modelo ?? '', leido: new Date().toISOString(), casos: s.casos ?? [], funciones: s.funciones ?? [] };
      } catch (e) {
        fallos.push(`El espectro no se pudo leer: ${(e as Error).message}`);
      }
      if (fallos.length) setErrorPatrones(fallos.join(' '));
      onLeido({ patrones, ...(cargas ? { cargas } : {}), ...(espectro ? { espectro } : {}) });
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
          justificar={justificar}
          onQuitarJustificacion={onQuitarJustificacion}
        />
      )}
      {sap?.espectro && <EspectroSap lectura={sap.espectro} justificar={justificar} />}
    </aside>
  );
}
