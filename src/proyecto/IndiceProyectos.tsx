import { useCallback, useEffect, useState } from 'react';
import { listarProyectos } from './api';
import type { ProyectoListado } from './contrato';
import {
  archivoDeObra,
  borrarObra,
  guardarObra,
  importarObra,
  leerObra,
  listarObras,
  nombreDeArchivo,
} from './obra/almacen';
import {
  borrarDeDisco,
  crearEnDisco,
  leerDeDisco,
  listarEnDisco,
  servidorDisponible,
  type ResumenObra,
} from './obra/almacen-disco';
import { olvidarLayout } from './layout';
import { descargarHoja } from '../lib/canvas-handoff';
import { nuevaObra, NOMBRE_OBRA_POR_OMISION, type Obra } from './obra/modelo';
import Enlace from '../components/Enlace';
import { navegar } from '../lib/ruta';

/**
 * El índice de trabajo: las obras arriba, los proyectos del harness debajo.
 *
 * Las listas son independientes A PROPÓSITO. Las obras salen del disco (con el
 * servidor local) y de `localStorage`, y los proyectos del harness de otro
 * servidor; si uno no está corriendo, el aviso ocupa su sección y lo demás se
 * sigue viendo. Cuando una sola pantalla depende de varias fuentes, la que falla
 * suele llevarse a las otras por delante, y aquí eso significaría abrir el
 * navegador y no encontrar el trabajo propio.
 *
 * Y una lista vacía del harness se lee como «no hay proyectos», que es lo
 * contrario de «no pude preguntar»: por eso el error se dice, no se calla.
 */

const resumenDe = (o: Obra): ResumenObra => ({
  id: o.id,
  nombre: o.nombre,
  creada: o.creada,
  calculos: o.calculos.length,
  vacia: o.calculos.length === 0 && o.modulos.length === 0,
});

/**
 * Los botones secundarios de una ficha aparecen al pasar el ratón. En una
 * pantalla táctil no hay «pasar», así que ahí se ven siempre.
 */
const OCULTO_SIN_HOVER = 'opacity-0 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100';

function FichaObra({
  obra,
  onBorrar,
  onExportar,
  onMover,
}: {
  obra: ResumenObra;
  onBorrar: (id: string) => void;
  onExportar: (id: string) => void;
  /** Solo en una obra del navegador, con el servidor disponible. */
  onMover?: (id: string) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);

  // El «¿borrar?» se retira solo: un botón armado desde hace rato se pulsa por
  // inercia, y del otro lado no hay deshacer.
  useEffect(() => {
    if (!confirmando) return;
    const t = window.setTimeout(() => setConfirmando(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmando]);

  return (
    // Los botones van en el flujo, a la derecha del título, y no superpuestos:
    // en `absolute` tapaban el final de un nombre largo («… (cargas a SAP)»).
    <div className="group flex h-full items-start gap-2 rounded-lg border border-border bg-white p-4 hover:border-accent">
      <Enlace a={{ vista: 'obra', id: obra.id }} className="min-w-0 flex-1 no-underline">
        <h3 className="text-sm font-semibold text-ink group-hover:text-accent">{obra.nombre || obra.id}</h3>
        <p className="mt-1.5 text-xs text-muted">
          {obra.vacia
            ? 'canvas vacío'
            : obra.calculos === 0
              ? 'sin cálculos'
              : `${obra.calculos} cálculo${obra.calculos === 1 ? '' : 's'}`}
        </p>
        <p className="mt-2 truncate font-mono text-[10px] text-muted">{obra.id}</p>
      </Enlace>
      <div className="flex shrink-0 items-center gap-1">
        {onMover && (
          <button
            type="button"
            onClick={() => onMover(obra.id)}
            title="Llevar esta obra a la carpeta de obras del disco"
            className="rounded border border-accent px-1.5 py-0.5 text-[10px] text-accent hover:bg-accent hover:text-white"
          >
            mover al disco
          </button>
        )}
        {/* El archivo es la forma de respaldar una obra del navegador, y de
            pasarle a alguien una del disco en una sola pieza. */}
        <button
          type="button"
          onClick={() => onExportar(obra.id)}
          title={`Descargar ${obra.nombre} como archivo`}
          className={`rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent ${OCULTO_SIN_HOVER}`}
        >
          ↓
        </button>
        <button
          type="button"
          onClick={() => (confirmando ? onBorrar(obra.id) : setConfirmando(true))}
          title={confirmando ? 'Confirmar el borrado' : `Borrar ${obra.nombre}`}
          className={`rounded border px-1.5 py-0.5 text-[10px] ${
            confirmando
              ? 'border-error bg-error text-white'
              : `border-border text-muted hover:border-error hover:text-error ${OCULTO_SIN_HOVER}`
          }`}
        >
          {confirmando ? '¿borrar?' : '×'}
        </button>
      </div>
    </div>
  );
}

export default function IndiceProyectos() {
  const [obras, setObras] = useState<Obra[]>(() => listarObras());
  /** `null` mientras no se sabe si hay servidor; `false` si no lo hay. */
  const [enDisco, setEnDisco] = useState<ResumenObra[] | false | null>(null);
  const [proyectos, setProyectos] = useState<ProyectoListado[] | null>(null);
  const [error, setError] = useState<{ motivo: string; detalle: string } | null>(null);
  const [avisoObras, setAvisoObras] = useState('');

  useEffect(() => {
    let vivo = true;
    listarProyectos()
      .then((p) => vivo && setProyectos(p))
      .catch((e: Error & { detalle?: string }) => {
        if (vivo) setError({ motivo: e.message, detalle: e.detalle ?? '' });
      });
    return () => {
      vivo = false;
    };
  }, []);

  /**
   * Si el servidor contestó pero no pudo listar la carpeta. Sin esto `enDisco`
   * se quedaba en `null` para siempre: «+ Nueva obra» desactivado, sin estado
   * vacío y sin decir por qué.
   */
  const [fallaDisco, setFallaDisco] = useState('');

  /** Relee las dos listas. Un fallo del disco se dice y no borra la lista. */
  const refrescar = useCallback(async () => {
    setObras(listarObras());
    if (!(await servidorDisponible())) {
      setEnDisco(false);
      setFallaDisco('');
      return;
    }
    try {
      setEnDisco(await listarEnDisco());
      setFallaDisco('');
    } catch (e) {
      setFallaDisco((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  const hayDisco = Array.isArray(enDisco);

  /**
   * Una obra nueva entra en el disco si hay servidor, y si no en el navegador.
   *
   * Los ids ocupados se leen **en este momento**, no del estado: si otra pestaña
   * creó una obra desde que se montó esta lista, el estado no lo sabe y las dos
   * propondrían el mismo id. Crear con `base: null` (o `crear: true`) es la
   * segunda red, para la carrera que queda entre leer y escribir.
   */
  async function guardarNueva(obra: Obra): Promise<boolean> {
    const r = hayDisco ? await crearEnDisco(obra) : guardarObra(obra, { crear: true });
    if (!r.ok) {
      setAvisoObras(r.motivo);
      void refrescar();
      return false;
    }
    return true;
  }

  async function idsOcupados(): Promise<string[]> {
    const navegador = listarObras().map((o) => o.id);
    // Se evitan los dos: una obra del navegador con el mismo id que una del
    // disco no se podría mover sin renombrarla.
    return hayDisco ? [...navegador, ...(await listarEnDisco()).map((o) => o.id)] : navegador;
  }

  async function crearObra() {
    try {
      const obra = nuevaObra(NOMBRE_OBRA_POR_OMISION, await idsOcupados());
      if (await guardarNueva(obra)) navegar({ vista: 'obra', id: obra.id });
    } catch (e) {
      setAvisoObras(`No se creó la obra: ${(e as Error).message}`);
    }
  }

  async function exportarObra(id: string, deDisco: boolean) {
    try {
      const obra = deDisco ? (await leerDeDisco(id))?.obra : leerObra(id);
      if (!obra) {
        setAvisoObras(`La obra «${id}» ya no está.`);
        return;
      }
      descargarHoja(archivoDeObra(obra), nombreDeArchivo(obra));
    } catch (e) {
      setAvisoObras((e as Error).message);
    }
  }

  /**
   * Del navegador al disco. Se borra del navegador solo DESPUÉS de que el disco
   * la aceptó: si algo falla a medio camino, la obra sigue donde estaba.
   */
  async function moverAlDisco(id: string) {
    const obra = leerObra(id);
    if (!obra) return;
    const r = await crearEnDisco(obra);
    if (!r.ok) {
      setAvisoObras(`No se movió «${obra.nombre}»: ${r.motivo}`);
      return;
    }
    const b = borrarObra(id);
    setAvisoObras(
      b.ok
        ? `«${obra.nombre}» está ahora en el disco.`
        : `«${obra.nombre}» se copió al disco, pero no se pudo quitar del navegador: ${b.motivo}`,
    );
    void refrescar();
  }

  /**
   * Importar TRAE, nunca pisa: si el id ya está tomado, la obra entra con uno
   * libre. Dos obras con el mismo nombre en la lista es lo correcto — son la
   * misma en dos momentos distintos, y quien la trajo sabe cuál acaba de traer.
   */
  async function importar(archivo: File | undefined) {
    if (!archivo) return;
    let texto: string;
    try {
      texto = await archivo.text();
    } catch {
      setAvisoObras('No se pudo leer el archivo.');
      return;
    }
    try {
      const leida = importarObra(texto, await idsOcupados());
      if (!leida.ok) {
        setAvisoObras(leida.motivo);
        return;
      }
      if (await guardarNueva(leida.obra)) navegar({ vista: 'obra', id: leida.obra.id });
    } catch (e) {
      setAvisoObras(`No se importó la obra: ${(e as Error).message}`);
    }
  }

  // Mientras no se sabe si hay disco no se crea ni se importa: la obra iría al
  // navegador por no haber esperado la respuesta, sin que nadie lo decidiera.
  const sinDecidir = enDisco === null;
  const porQueNo = fallaDisco
    ? 'El servidor de obras no pudo listar la carpeta: reintenta antes de crear.'
    : 'Consultando si hay servidor de obras…';

  /** Del disco, borrar es mandar a la papelera de la carpeta de obras. */
  async function quitarObra(id: string, deDisco: boolean) {
    const r = deDisco ? await borrarDeDisco(id) : borrarObra(id);
    if (!r.ok) {
      setAvisoObras(r.motivo);
      return;
    }
    // El layout no es dato de la obra, pero se guarda con su clave: sin esto
    // quedaría para siempre en `structflow.layout.proyecto.v1`, y una obra nueva
    // que reutilizara el id heredaría posiciones de nodos que no son suyos.
    olvidarLayout(`obra:${id}`);
    if (deDisco) setAvisoObras('La obra se movió a la papelera de la carpeta de obras (.papelera).');
    void refrescar();
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <nav className="mb-2 text-xs text-muted">
        <Enlace a={{ vista: 'inicio' }} className="hover:text-accent">
          Inicio
        </Enlace>
        {' / Proyectos'}
      </nav>

      <header className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Proyectos</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          Un proyecto se abre como un grafo: las acciones y sus cargas, las combinaciones, el
          modelo, las planillas y los documentos que las publican. El color de un nodo es su
          desfase, no su tipo.
        </p>
      </header>

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">
            Obras{' '}
            <span className="font-normal text-muted">
              {enDisco === null ? '' : hayDisco ? 'en disco' : 'de este navegador'}
            </span>
          </h2>
          <div className="flex items-center gap-2">
            <label
              title={sinDecidir ? porQueNo : undefined}
              className={`rounded border border-border px-2 py-1 text-xs text-muted ${
                sinDecidir ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-accent hover:text-accent'
              }`}
            >
              Importar…
              <input
                type="file"
                accept=".json,application/json"
                disabled={sinDecidir}
                className="hidden"
                onChange={(e) => {
                  void importar(e.target.files?.[0]);
                  // Se limpia para que volver a elegir el mismo archivo dispare
                  // el cambio: sin esto, un segundo intento no hace nada.
                  e.target.value = '';
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => void crearObra()}
              disabled={sinDecidir}
              title={sinDecidir ? porQueNo : undefined}
              className="rounded border border-accent bg-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Nueva obra
            </button>
          </div>
        </div>

        {fallaDisco && (
          <div role="status" className="mb-3 rounded border border-aviso bg-white px-3 py-2 text-xs leading-snug text-aviso">
            El servidor de obras está corriendo, pero no pudo listar la carpeta: {fallaDisco}{' '}
            <button type="button" onClick={() => void refrescar()} className="underline">
              Reintentar
            </button>
          </div>
        )}

        {avisoObras && (
          <p
            role="status"
            className="mb-3 rounded border border-aviso bg-white px-3 py-2 text-xs leading-snug text-aviso"
          >
            {avisoObras}
          </p>
        )}

        {enDisco === false && (
          <p className="mb-3 text-xs leading-relaxed text-muted">
            Sin el servidor local de obras, las obras viven en el almacenamiento de este navegador:
            no se versionan ni viajan a otro equipo. Con <code>npm run dev</code> se guardan como
            carpetas en disco.
          </p>
        )}

        {hayDisco && enDisco.length === 0 && obras.length > 0 && (
          <p className="mb-4 text-xs text-muted">Todavía no hay ninguna obra en el disco.</p>
        )}

        {hayDisco && enDisco.length > 0 && (
          <ul className="mb-4 grid gap-3 sm:grid-cols-2">
            {enDisco.map((o) => (
              <li key={o.id}>
                <FichaObra
                  obra={o}
                  onBorrar={(id) => void quitarObra(id, true)}
                  onExportar={(id) => void exportarObra(id, true)}
                />
              </li>
            ))}
          </ul>
        )}

        {/* Con servidor, las del navegador son lo que quedó de antes: se muestran
            aparte y con la salida a la vista, para que no convivan dos lugares
            de trabajo sin que se note. */}
        {hayDisco && obras.length > 0 && (
          <h3 className="mb-2 mt-6 text-xs font-semibold text-aviso">
            Todavía en este navegador{' '}
            <span className="font-normal text-muted">
              · no se versionan ni viajan a otro equipo
            </span>
          </h3>
        )}
        {obras.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {obras.map((o) => (
              <li key={o.id}>
                <FichaObra
                  obra={resumenDe(o)}
                  onBorrar={(id) => void quitarObra(id, false)}
                  onExportar={(id) => void exportarObra(id, false)}
                  onMover={hayDisco ? (id) => void moverAlDisco(id) : undefined}
                />
              </li>
            ))}
          </ul>
        )}

        {enDisco !== null && obras.length === 0 && (!hayDisco || enDisco.length === 0) && (
          <p className="rounded-lg border border-dashed border-border bg-white p-4 text-sm leading-relaxed text-muted">
            Todavía no hay ninguna obra. Una obra empieza con el canvas vacío y se va llenando
            con nodos: el primero es <strong className="font-medium text-ink">Cargas</strong>.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Del harness <span className="font-normal text-muted">solo lectura</span>
        </h2>

        {error && (
          <div className="rounded-lg border border-aviso bg-white p-4">
            <p className="text-sm font-semibold text-aviso">{error.motivo}</p>
            {error.detalle && (
              <p className="mt-1 text-xs leading-relaxed text-muted">{error.detalle}</p>
            )}
          </div>
        )}

        {!error && proyectos === null && <p className="text-sm text-muted">Consultando…</p>}

        {proyectos !== null && proyectos.length === 0 && (
          <p className="text-sm text-muted">El servidor respondió, y no hay ningún proyecto.</p>
        )}

        <ul className="grid gap-3 sm:grid-cols-2">
          {(proyectos ?? []).map((p) => (
            <li key={p.slug}>
              <Enlace
                a={{ vista: 'proyecto', slug: p.slug }}
                className="group flex h-full flex-col rounded-lg border border-border bg-white p-4 no-underline hover:border-accent"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink group-hover:text-accent">
                    {p.nombre}
                  </h3>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
                    {p.pais}
                    {p.fase ? ` · ${p.fase}` : ''}
                  </span>
                </div>
                {p.cliente && <p className="mt-1.5 text-xs text-muted">{p.cliente}</p>}
                <p className="mt-2 truncate font-mono text-[10px] text-muted">
                  {p.modelo_vigente || 'sin modelo vigente'}
                </p>
              </Enlace>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
