import { useState } from 'react';
import type {
  ConexionSap,
  LecturaCargas,
  LecturaCasos,
  LecturaEspectro,
  LecturaMasa,
  LecturaPatrones,
  LecturaResumen,
} from './modelo';
import { resumirPorParte, type ParteSap } from './sap-cargas';
import { useEscape } from './useEscape';
import { alPuente } from './puente';
import type { Justificar } from './CampoJustificacion';
import PestanaResumen from './PestanaResumen';
import PestanaPatrones from './PestanaPatrones';
import PestanaCasos from './PestanaCasos';
import PestanaMasa from './PestanaMasa';

export type { Justificar } from './CampoJustificacion';

/**
 * El panel del nodo SAP2000: qué modelo está abierto y qué tiene, en cuatro
 * pestañas de lectura —Resumen, Load Patterns, Load Cases y Masa sísmica— bajo
 * una conexión que se ve siempre.
 *
 * SOLO LEE (`docs/rumbo.md`, «Flow no escribe en el modelo»). Habla con el
 * puente de Flow (`puente-sap/puente.py`) por `/sap-api`, que es un proceso
 * aparte: sin él, el panel lo dice y muestra la última lectura guardada.
 *
 * Lo que es un número de norma se justifica desde la obra: las cargas
 * asignadas, el espectro, los factores de los casos y los de la masa
 * (`sap-cargas.ts`).
 */

/** Lo último leído del modelo: los patrones y, si se pudo leer, lo demás. */
export interface LecturaSap {
  patrones: LecturaPatrones;
  cargas?: LecturaCargas;
  espectro?: LecturaEspectro;
  casos?: LecturaCasos;
  masa?: LecturaMasa;
  resumen?: LecturaResumen;
}

/** Las lecturas que son de este nodo: «Leer del modelo» las reemplaza todas. */
export const LECTURAS_DEL_NODO_SAP = ['patrones', 'cargas', 'espectro', 'casos', 'masa', 'resumen'] as const satisfies readonly (keyof LecturaSap)[];

export type PestanaSap ='resumen' | 'patrones' | 'casos' | 'masa';

const PESTANAS: { clave: PestanaSap; titulo: string; parte?: ParteSap }[] = [
  { clave: 'resumen', titulo: 'Resumen' },
  { clave: 'patrones', titulo: 'Load Patterns', parte: 'cargas' },
  { clave: 'casos', titulo: 'Load Cases', parte: 'casos' },
  { clave: 'masa', titulo: 'Masa sísmica', parte: 'masa' },
];

/**
 * Lee todo, de a una ruta, porque el puente atiende de a una petición. Sin los
 * patrones no hay lectura; si otra parte falla —un puente anterior no tiene
 * `/casos`—, lo demás se guarda igual y el fallo se dice.
 */
async function leerTodo(): Promise<{ lectura: LecturaSap; fallos: string[] }> {
  const ahora = () => new Date().toISOString();
  const p = await alPuente<{ modelo?: string; patrones?: LecturaPatrones['lista'] }>('/patrones');
  const lectura: LecturaSap = { patrones: { modelo: p.modelo ?? '', leido: ahora(), lista: p.patrones ?? [] } };
  const fallos: string[] = [];
  const parte = async (que: string, leer: () => Promise<void>) => {
    try {
      await leer();
    } catch (e) {
      fallos.push(`${que} no se pudo leer: ${(e as Error).message}`);
    }
  };
  await parte('Las cargas asignadas', async () => {
    const c = await alPuente<{ modelo?: string; cargas?: LecturaCargas['lista'] }>('/cargas');
    lectura.cargas = { modelo: c.modelo ?? '', leido: ahora(), lista: c.cargas ?? [] };
  });
  await parte('El espectro', async () => {
    const s = await alPuente<Partial<LecturaEspectro>>('/espectro');
    lectura.espectro = { modelo: s.modelo ?? '', leido: ahora(), casos: s.casos ?? [], funciones: s.funciones ?? [] };
  });
  await parte('Los Load Cases', async () => {
    const c = await alPuente<{ modelo?: string; casos?: LecturaCasos['lista'] }>('/casos');
    lectura.casos = { modelo: c.modelo ?? '', leido: ahora(), lista: c.casos ?? [] };
  });
  await parte('La masa sísmica', async () => {
    const m = await alPuente<Partial<LecturaMasa>>('/masa');
    lectura.masa = { modelo: m.modelo ?? '', leido: ahora(), fuentes: m.fuentes ?? [] };
  });
  await parte('El resumen del modelo', async () => {
    const r = await alPuente<Omit<LecturaResumen, 'leido'>>('/resumen');
    lectura.resumen = { ...r, modelo: r.modelo ?? '', leido: ahora() };
  });
  return { lectura, fallos };
}

const PUNTO = { error: 'bg-error', aviso: 'bg-aviso' } as const;

export default function PanelSap({
  sap,
  onConectado,
  onLeido,
  justificar,
  onQuitarJustificacion,
  pestana,
  onPestana,
  onCerrar,
}: {
  sap: ConexionSap | undefined;
  onConectado: (sap: ConexionSap) => void;
  onLeido: (lectura: LecturaSap) => void;
  justificar: Justificar;
  onQuitarJustificacion: (id: string) => void;
  pestana: PestanaSap;
  onPestana: (p: PestanaSap) => void;
  onCerrar: () => void;
}) {
  useEscape(onCerrar);
  const [fase, setFase] = useState<'quieto' | 'conectando' | 'leyendo'>('quieto');
  const [error, setError] = useState('');

  const leer = async () => {
    setFase('leyendo');
    setError('');
    try {
      const { lectura, fallos } = await leerTodo();
      if (fallos.length) setError(fallos.join(' '));
      onLeido(lectura);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFase('quieto');
    }
  };

  const conectar = () => {
    setFase('conectando');
    setError('');
    alPuente<Omit<ConexionSap, 'leido'>>('/conectar', {}).then(
      (d) => {
        if (!d.modelo) {
          setFase('quieto');
          setError('SAP2000 está abierto, pero el modelo no está guardado todavía.');
          return;
        }
        onConectado({
          modelo: d.modelo,
          ruta: d.ruta,
          version: d.version,
          leido: new Date().toISOString(),
          ...(d.modificado ? { modificado: d.modificado } : {}),
        });
        // Conectar es querer ver el modelo: la lectura viene con él. Va
        // después de la conexión porque el puente atiende de a una petición.
        void leer();
      },
      (e: Error) => {
        setFase('quieto');
        setError(e.message);
      },
    );
  };

  const partes = resumirPorParte({ sap, justificaciones: justificar.justificaciones }, justificar.scope);
  const leida = sap?.patrones;
  const otroModelo = leida && sap && leida.modelo !== sap.modelo;
  const ocupado = fase !== 'quieto';

  return (
    <aside className="flex h-full w-[34rem] shrink-0 flex-col overflow-y-auto border-l border-border bg-white">
      <header className="sticky top-0 z-10 border-b border-border bg-white px-4 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 px-1.5">
            <h2 className="text-sm font-semibold text-ink">SAP2000</h2>
            {sap ? (
              <p className="text-[11px] leading-snug text-muted" title={sap.ruta}>
                <span className="font-mono font-semibold text-ink">{sap.modelo}</span>
                {sap.version && ` · SAP2000 ${sap.version}`}
                {leida ? ` · leído el ${new Date(leida.leido).toLocaleString()}` : ' · sin leer'}
                {otroModelo && <span className="text-aviso"> — la lectura es de {leida.modelo || '(sin guardar)'}</span>}
              </p>
            ) : (
              <p className="text-[11px] leading-snug text-muted">
                Flow lee el modelo abierto en este equipo. No escribe, no guarda ni analiza.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {sap && (
              <button
                type="button"
                onClick={() => void leer()}
                disabled={ocupado}
                className="rounded border border-accent bg-accent px-2 py-0.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {fase === 'leyendo' ? 'Leyendo…' : leida ? 'Volver a leer' : 'Leer del modelo'}
              </button>
            )}
            <button
              type="button"
              onClick={conectar}
              disabled={ocupado}
              className={`rounded border px-2 py-0.5 text-xs disabled:opacity-50 ${
                sap
                  ? 'border-border text-muted hover:border-accent hover:text-accent'
                  : 'border-accent bg-accent font-medium text-white hover:opacity-90'
              }`}
            >
              {fase === 'conectando' ? 'Conectando…' : sap ? 'Reconectar' : 'Conectarse a SAP'}
            </button>
            <button
              type="button"
              onClick={onCerrar}
              className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
            >
              cerrar
            </button>
          </div>
        </div>

        {error && (
          <p role="status" className="mx-1.5 mt-2 rounded border border-aviso px-3 py-2 text-xs leading-snug text-aviso">
            {error}
          </p>
        )}

        {sap && (
          <div role="tablist" className="mt-2 flex gap-1">
            {PESTANAS.map((p) => {
              const r = p.parte && partes[p.parte];
              const marca = !r ? '' : r.difieren + r.errores ? PUNTO.error : r.huerfanas.length ? PUNTO.aviso : '';
              const activa = p.clave === pestana;
              return (
                <button
                  key={p.clave}
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  onClick={() => onPestana(p.clave)}
                  className={`-mb-px flex items-center gap-1 border-b-2 px-2.5 py-1 text-xs ${
                    activa ? 'border-accent font-medium text-accent' : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  {p.titulo}
                  {r && r.total > 0 && (
                    <span className="text-[10px] text-muted" title="Justificados, de los que admiten justificación">
                      {r.justificadas}/{r.total}
                    </span>
                  )}
                  {marca && <span className={`inline-block h-1.5 w-1.5 rounded-full ${marca}`} />}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {!sap ? (
        <p className="px-5 py-4 text-xs text-muted">Todavía no se conectó a ningún modelo.</p>
      ) : (
        <section role="tabpanel" className="px-5 py-4">
          {pestana === 'resumen' && <PestanaResumen sap={sap} partes={partes} onPestana={onPestana} />}
          {pestana === 'patrones' && (
            <PestanaPatrones
              lectura={sap.patrones}
              cargas={sap.cargas}
              justificar={justificar}
              onQuitarJustificacion={onQuitarJustificacion}
            />
          )}
          {pestana === 'casos' && (
            <PestanaCasos sap={sap} justificar={justificar} onQuitarJustificacion={onQuitarJustificacion} />
          )}
          {pestana === 'masa' && (
            <PestanaMasa sap={sap} justificar={justificar} onQuitarJustificacion={onQuitarJustificacion} />
          )}
        </section>
      )}
    </aside>
  );
}
