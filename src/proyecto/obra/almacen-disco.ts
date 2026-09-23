// ─────────────────────────────────────────────────────────────────────────────
// La obra en disco, vista desde el navegador: el cliente de `servidor/obras.mjs`
// y la SESIÓN con la que `CanvasObra` guarda.
//
// DOS SITIOS DONDE PUEDE VIVIR UNA OBRA
// -------------------------------------
// Con el servidor local corriendo (`npm run dev` lo monta), la obra es una
// carpeta en disco. Sin él —un despliegue estático, `vite preview` en otra
// máquina— sigue viviendo en `localStorage` como antes, y la pantalla lo dice.
// `CanvasObra` no distingue: recibe una `SesionObra` y le pasa cada versión del
// documento. Lo que cambia es qué garantías hay detrás.
//
// LO QUE LA SESIÓN DE DISCO GARANTIZA
// -----------------------------------
//   - Un solo escritor. Al abrir pide el candado; si otra pestaña lo tiene, esta
//     queda en SOLO LECTURA: lo que se toque no se guarda, y la banda lo dice.
//     El latido lo renueva cada 10 s; si lo pierde (otra pestaña tomó el
//     control), deja de escribir en el acto.
//   - Nada se pisa sin saberlo. Cada escritura lleva la versión sobre la que se
//     hizo; si la carpeta cambió por fuera, es un conflicto y no un pisado.
//   - Una escritura a la vez. Mientras una va en vuelo, las siguientes se
//     acumulan y sale solo la última: el orden de llegada al disco es el de la
//     edición.
//   - Lo que no llegó al disco no se pierde al cerrar. `pagehide` no espera a un
//     `fetch`, y `keepalive` tiene tope de 64 KB —la obra del Pachón pesa 120—,
//     así que lo pendiente se escribe SINCRÓNICAMENTE como borrador en
//     `localStorage`. Al reabrir, se ofrece recuperarlo. Es el único papel que
//     le queda al almacenamiento del navegador para una obra en disco.
// ─────────────────────────────────────────────────────────────────────────────

import { guardarObra, leerObra, sanearObra } from './almacen';
import { partirObra, unirObra, type Archivos } from './carpeta';
import type { Obra } from './modelo';

const API = '/obras-api';
const LATIDO_MS = 10_000;
const CLAVE_BORRADOR = 'structflow.obras.borrador.v1:';

// ── El servidor ──────────────────────────────────────────────────────────────

let disponible: Promise<boolean> | null = null;

/**
 * ¿Hay servidor de obras? Se pregunta una vez por carga de la página: que el
 * servidor aparezca o desaparezca a mitad de sesión cambiaría dónde se guarda
 * una obra ya abierta, y eso tiene que ser una decisión de quien la abre.
 */
export function servidorDisponible(): Promise<boolean> {
  disponible ??= fetch(`${API}/salud`, { signal: AbortSignal.timeout(2000) })
    .then(async (r) => r.ok && (await r.json())?.ok === true)
    .catch(() => false);
  return disponible;
}

class ErrorServidor extends Error {
  constructor(
    readonly codigo: number,
    motivo: string,
    readonly conflicto?: string,
  ) {
    super(motivo);
  }
}

async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(API + ruta, {
      method: metodo,
      headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorServidor(0, 'El servidor de obras no responde. ¿Sigue corriendo `npm run dev`?');
  }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new ErrorServidor(r.status, datos?.motivo ?? `El servidor respondió ${r.status}.`, datos?.conflicto);
  }
  return datos as T;
}

/** Lo que el índice necesita de una obra en disco, sin bajarse sus hojas. */
export interface ResumenObra {
  id: string;
  nombre: string;
  creada: string;
  cargas: number;
  calculos: number;
  vacia: boolean;
}

export async function listarEnDisco(): Promise<ResumenObra[]> {
  const { obras } = await pedir<{ obras: ResumenObra[] }>('GET', '');
  return obras.sort((a, b) => b.creada.localeCompare(a.creada));
}

export interface Leida {
  obra: Obra;
  version: string;
  /** Lo que `unirObra` no pudo leer. La obra abre igual. */
  problemas: string[];
}

export async function leerDeDisco(id: string): Promise<Leida | null> {
  let r: { version: string; archivos: Archivos };
  try {
    r = await pedir('GET', `/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ErrorServidor && e.codigo === 404) return null;
    throw e;
  }
  const { crudo, problemas } = unirObra(r.archivos);
  const obra = sanearObra(crudo);
  if (!obra) throw new Error(problemas.join(' ') || 'La carpeta no tiene una obra legible.');
  return { obra, version: r.version, problemas };
}

/** Crea la obra en disco; falla si ya hay una con ese id. */
export async function crearEnDisco(obra: Obra): Promise<{ ok: true } | { ok: false; motivo: string }> {
  try {
    await pedir('PUT', `/${encodeURIComponent(obra.id)}`, {
      token: nuevoToken(),
      base: null,
      archivos: partirObra(obra),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: (e as Error).message };
  }
}

export async function borrarDeDisco(id: string): Promise<{ ok: true } | { ok: false; motivo: string }> {
  try {
    await pedir('DELETE', `/${encodeURIComponent(id)}`, {});
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: (e as Error).message };
  }
}

function nuevoToken(): string {
  return crypto.randomUUID();
}

// ── El borrador ──────────────────────────────────────────────────────────────

interface Borrador {
  /** La versión del disco sobre la que se editó. */
  base: string;
  guardado: string;
  obra: unknown;
}

function escribirBorrador(id: string, b: Borrador): void {
  try {
    window.localStorage.setItem(CLAVE_BORRADOR + id, JSON.stringify(b));
  } catch {
    // Sin almacenamiento no hay red; el aviso de «sin guardar» ya está a la vista.
  }
}

function olvidarBorrador(id: string): void {
  try {
    window.localStorage.removeItem(CLAVE_BORRADOR + id);
  } catch {
    // Ídem.
  }
}

/** Lo que quedó sin llegar al disco la última vez, si difiere de lo que hay. */
function leerBorrador(id: string, enDisco: Obra): { obra: Obra; base: string } | null {
  let b: Borrador;
  try {
    const texto = window.localStorage.getItem(CLAVE_BORRADOR + id);
    if (!texto) return null;
    b = JSON.parse(texto) as Borrador;
  } catch {
    return null;
  }
  const obra = sanearObra(b?.obra);
  if (!obra || obra.id !== id) return null;
  if (JSON.stringify(partirObra(obra)) === JSON.stringify(partirObra(enDisco))) {
    olvidarBorrador(id);
    return null;
  }
  return { obra, base: typeof b.base === 'string' ? b.base : '' };
}

// ── La sesión ────────────────────────────────────────────────────────────────

export type Conflicto =
  /** Otra pestaña tiene el candado: esta no escribe. */
  | 'escritor'
  /** La carpeta cambió por fuera desde que se leyó. */
  | 'version'
  /** La carpeta ya no está. */
  | 'borrada';

export interface EstadoSesion {
  modo: 'disco' | 'navegador';
  /** Dónde está, para decírselo a quien la edita. */
  donde: string;
  conflicto: Conflicto | null;
  /** Un fallo al guardar que no es un conflicto: servidor caído, cuota llena. */
  error: string;
  /** Hay cambios que todavía no llegaron a su sitio. */
  pendiente: boolean;
}

export interface SesionObra {
  estado(): EstadoSesion;
  suscribir(fn: (e: EstadoSesion) => void): () => void;
  /** Cada versión del documento. Se aplaza y se serializa por dentro. */
  guardar(obra: Obra): void;
  /** Síncrono: la pestaña se oculta. Lo que no llegó queda como borrador. */
  vaciar(obra: Obra): void;
  /**
   * Síncrono: la página se va (`pagehide`). Vacía como `vaciar` y además suelta
   * el candado. Sin esto, un F5 dejaba la obra en solo lectura durante 30 s: la
   * página recargada pedía el candado con un token nuevo y lo encontraba
   * tomado por la que acababa de irse.
   */
  salir(obra: Obra): void;
  /** Desmontaje: termina lo pendiente y suelta el candado. */
  cerrar(obra: Obra): void;
}

export interface Apertura {
  obra: Obra;
  sesion: SesionObra;
  problemas: string[];
  /** Cambios de una sesión anterior que no llegaron al disco. */
  borrador: { obra: Obra; sobreOtraVersion: boolean } | null;
}

function emisor(inicial: EstadoSesion) {
  let estado = inicial;
  const oyentes = new Set<(e: EstadoSesion) => void>();
  return {
    get: () => estado,
    set(cambio: Partial<EstadoSesion>) {
      const nuevo = { ...estado, ...cambio };
      if (Object.keys(cambio).every((k) => nuevo[k as keyof EstadoSesion] === estado[k as keyof EstadoSesion])) return;
      estado = nuevo;
      for (const fn of oyentes) fn(estado);
    },
    suscribir(fn: (e: EstadoSesion) => void) {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },
  };
}

/** La sesión de siempre: `localStorage`, sin candado ni versiones. */
function sesionNavegador(): SesionObra {
  const e = emisor({
    modo: 'navegador',
    donde: 'este navegador',
    conflicto: null,
    error: '',
    pendiente: false,
  });
  const escribir = (o: Obra) => {
    const r = guardarObra(o);
    e.set({ error: r.ok ? '' : r.motivo });
  };
  return {
    estado: e.get,
    suscribir: e.suscribir,
    guardar: escribir,
    vaciar: escribir,
    salir: escribir,
    cerrar: escribir,
  };
}

function sesionDisco(
  id: string,
  version: string,
  obraInicial: Obra,
  raiz: string,
  forzar: boolean,
): SesionObra {
  const token = nuevoToken();
  const ruta = `/${encodeURIComponent(id)}`;
  const e = emisor({
    modo: 'disco',
    donde: `${raiz.replace(/[\\/]+$/, '')}/${id}`,
    conflicto: null,
    error: '',
    pendiente: false,
  });

  /** El texto de lo último que llegó al disco: no se reescribe lo mismo. */
  let escrito = JSON.stringify(partirObra(obraInicial));
  let base = version;
  let pendiente: Obra | null = null;
  let enVuelo = false;
  let cerrada = false;

  const escritor = (forzar = false) =>
    pedir('POST', `${ruta}/escritor`, { token, forzar }).then(
      () => {
        if (e.get().conflicto === 'escritor') e.set({ conflicto: null });
        // El servidor volvió a contestar: un error que no dejó nada por escribir
        // ya no dice nada. Si quedó algo, lo aclara el reintento de la cola.
        if (e.get().error && !pendiente) e.set({ error: '' });
      },
      (err: ErrorServidor) => {
        if (err.conflicto === 'escritor') e.set({ conflicto: 'escritor' });
        else if (err.codigo !== 0) e.set({ error: err.message });
      },
    );

  const latido = window.setInterval(() => {
    // Sin el candado no se late: pedirlo cada 10 s lo robaría en cuanto la otra
    // pestaña se durmiera un momento. Tomarlo es explícito.
    if (e.get().conflicto !== 'escritor') void escritor();
    // Una escritura que falló por la red quedó en la cola, y nada más la
    // relanzaba: con el servidor ya de vuelta, la banda de error seguía fija
    // hasta la próxima tecla. El latido la reintenta.
    if (pendiente && e.get().error && !e.get().conflicto) void vaciarCola();
  }, LATIDO_MS);

  async function vaciarCola(): Promise<void> {
    if (enVuelo) return;
    enVuelo = true;
    try {
      while (pendiente && !e.get().conflicto) {
        const obra = pendiente;
        pendiente = null;
        const archivos = partirObra(obra);
        const texto = JSON.stringify(archivos);
        if (texto === escrito) continue;
        try {
          const r = await pedir<{ version: string }>('PUT', ruta, { token, base, archivos });
          base = r.version;
          escrito = texto;
          e.set({ error: '' });
        } catch (err) {
          const x = err as ErrorServidor;
          // Lo que no se pudo escribir vuelve a la cola, salvo que otra versión
          // más nueva ya esté esperando: esa lo reemplaza.
          pendiente ??= obra;
          if (x.conflicto === 'escritor' || x.conflicto === 'version' || x.conflicto === 'borrada') {
            e.set({ conflicto: x.conflicto });
          } else {
            e.set({ error: x.message });
          }
          break;
        }
      }
    } finally {
      enVuelo = false;
      e.set({ pendiente: pendiente !== null });
      if (!pendiente) olvidarBorrador(id);
    }
  }

  void escritor(forzar);

  function vaciar(obra: Obra) {
    if (e.get().conflicto === 'escritor') return;
    if (JSON.stringify(partirObra(obra)) === escrito) return;
    escribirBorrador(id, { base, guardado: new Date().toISOString(), obra });
    // Y se intenta de todos modos: si llega, al reabrir no habrá borrador que
    // ofrecer porque coincidirá con el disco.
    pendiente = obra;
    void vaciarCola();
  }

  return {
    estado: e.get,
    suscribir: e.suscribir,
    guardar(obra) {
      if (cerrada) return;
      pendiente = obra;
      e.set({ pendiente: true });
      void vaciarCola();
    },
    vaciar,
    salir(obra) {
      vaciar(obra);
      if (e.get().conflicto === 'escritor') return;
      // `sendBeacon` es lo único que sale con seguridad mientras la página se
      // va. Si la página vuelve del bfcache, el latido pide el candado otra vez.
      navigator.sendBeacon(
        `${API}${ruta}/escritor`,
        new Blob([JSON.stringify({ token, soltar: true })], { type: 'application/json' }),
      );
    },
    cerrar(obra) {
      cerrada = true;
      window.clearInterval(latido);
      pendiente = obra;
      void vaciarCola().finally(() => {
        void pedir('POST', `${ruta}/escritor`, { token, soltar: true }).catch(() => {});
      });
    },
  };
}

/**
 * Abre una obra donde esté: el disco si hay servidor y la tiene, y si no el
 * navegador. `null` si no está en ninguno de los dos.
 *
 * Con `forzar`, la sesión nueva le quita el candado a quien lo tenga. Es lo que
 * hace «Tomar el control», y también cualquier recarga dentro de la MISMA
 * pestaña: la sesión que se va suelta su candado de forma asíncrona, así que sin
 * forzar la nueva podría encontrárselo tomado —por su propia pestaña— y abrir en
 * solo lectura.
 */
export async function abrirObra(id: string, { forzar = false } = {}): Promise<Apertura | null> {
  if (await servidorDisponible()) {
    const leida = await leerDeDisco(id);
    if (leida) {
      const { raiz } = await pedir<{ raiz: string }>('GET', '/salud');
      const borrador = leerBorrador(id, leida.obra);
      return {
        obra: leida.obra,
        sesion: sesionDisco(id, leida.version, leida.obra, raiz, forzar),
        problemas: leida.problemas,
        borrador: borrador && { obra: borrador.obra, sobreOtraVersion: borrador.base !== leida.version },
      };
    }
  }
  const obra = leerObra(id);
  return obra ? { obra, sesion: sesionNavegador(), problemas: [], borrador: null } : null;
}

/** Descarta el borrador de una obra: quien lo decide es el usuario. */
export { olvidarBorrador };
