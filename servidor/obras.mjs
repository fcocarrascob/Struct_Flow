#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// El servidor local de las obras: lee y escribe carpetas en disco.
//
//   npm run obras                  # solo, en 127.0.0.1:8788
//   npm run dev                    # montado dentro de Vite, en /obras-api
//
// La raíz es `STRUCTFLOW_OBRAS`, o `./obras/` de este repo (ignorada por git: una
// obra de cliente no va aquí, y cada carpeta puede ser su propio repo).
//
// ES TONTO A PROPÓSITO. No sanea ni entiende una obra: recibe y entrega mapas
// ruta → texto. Cómo se parte una obra en archivos lo decide
// `src/proyecto/obra/carpeta.ts`, que es puro y lo prueba `verify:obra`; si el
// servidor lo supiera, habría dos sitios que decidirlo.
//
// Lo que SÍ es suyo son las dos garantías que el navegador no puede dar solo:
//
//   - UN SOLO ESCRITOR. Una pestaña pide ser la escritora con un token y lo
//     renueva con un latido; otra que lo pida recibe un 409 y abre en solo
//     lectura. El candado vive en memoria y caduca sin latido, así que una
//     pestaña que se cerró sin avisar no deja la obra bloqueada.
//   - NADA SE PISA SIN SABERLO. Cada lectura trae la `version` de la carpeta (un
//     hash de sus archivos) y cada escritura dice sobre cuál se hizo. Si alguien
//     cambió la carpeta entremedio —otra pestaña que tomó el control, un
//     `git checkout`, una edición a mano— la escritura es un 409 y no un pisado.
//
// Vive en `servidor/` y no en `scripts/` por el sello del harness, que es el hash
// de `src/lib` + `scripts`: ver `verificadores/obra.mjs`.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash, randomBytes } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PREFIJO = '/obras-api';
export const PUERTO = 8788;
/** Sin latido en este tiempo, el candado de un escritor se libera. */
export const CADUCIDAD_MS = 30_000;
/** Una obra de 35 nodos pesa unos 150 KB; esto deja margen sin aceptar cualquier cosa. */
const MAX_CUERPO = 32 * 1024 * 1024;

const ARCHIVO_OBRA = 'obra.json';
const PAPELERA = '.papelera';
/** El alfabeto de `idDeObra` (`src/proyecto/obra/almacen.ts`), que es el de la URL. */
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
/** Las únicas rutas que una obra escribe: lo que emite `partirObra`. */
const RUTA_RE = /^(obra\.json|hojas\/[a-z0-9-]+\.json)$/;

export class ErrorObras extends Error {
  constructor(codigo, motivo, datos = {}) {
    super(motivo);
    this.codigo = codigo;
    this.datos = { motivo, ...datos };
  }
}

export function raizPorDefecto() {
  if (process.env.STRUCTFLOW_OBRAS) return path.resolve(process.env.STRUCTFLOW_OBRAS);
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'obras');
}

/**
 * Las operaciones sobre una raíz. Se exponen sueltas —y no solo detrás de HTTP—
 * para que `verify:obra` las pruebe sobre un directorio temporal.
 *
 * `ahora` se inyecta para poder comprobar la caducidad del candado sin esperar
 * treinta segundos; `renombrar` y `pausaMs`, para probar el paso a la papelera
 * cuando Windows rechaza el renombre (ver `moverAPapelera`).
 */
export function crearObras(raiz, { ahora = () => Date.now(), renombrar = rename, pausaMs = 100 } = {}) {
  /** id de obra → { token, hasta } */
  const escritores = new Map();

  const carpeta = (id) => {
    if (typeof id !== 'string' || !ID_RE.test(id)) {
      throw new ErrorObras(400, `«${id}» no es un id de obra.`);
    }
    return path.join(raiz, id);
  };

  async function existe(p) {
    try {
      await stat(p);
      return true;
    } catch {
      return false;
    }
  }

  /** Los archivos de una carpeta de obra, como los ve `unirObra`. */
  async function leerArchivos(dir) {
    const archivos = {};
    archivos[ARCHIVO_OBRA] = await readFile(path.join(dir, ARCHIVO_OBRA), 'utf8');
    let hojas = [];
    try {
      hojas = await readdir(path.join(dir, 'hojas'));
    } catch {
      // Una obra sin nodos no tiene carpeta de hojas, y es una obra válida.
    }
    for (const nombre of hojas.sort()) {
      const ruta = `hojas/${nombre}`;
      if (!RUTA_RE.test(ruta)) continue;
      archivos[ruta] = await readFile(path.join(dir, 'hojas', nombre), 'utf8');
    }
    return archivos;
  }

  /**
   * La versión de una carpeta: un hash de TODOS sus archivos, no solo de
   * `obra.json`. Una edición a mano de una hoja también es un cambio que una
   * pestaña con la copia anterior no puede pisar.
   */
  function versionDe(archivos) {
    const h = createHash('sha256');
    for (const ruta of Object.keys(archivos).sort()) {
      h.update(ruta).update('\0').update(archivos[ruta]).update('\0');
    }
    return h.digest('hex').slice(0, 16);
  }

  function escritorVivo(id) {
    const e = escritores.get(id);
    if (!e) return null;
    if (e.hasta <= ahora()) {
      escritores.delete(id);
      return null;
    }
    return e;
  }

  return {
    raiz,

    async listar() {
      let nombres = [];
      try {
        nombres = await readdir(raiz);
      } catch {
        return [];
      }
      const obras = [];
      for (const id of nombres.sort()) {
        if (!ID_RE.test(id)) continue;
        try {
          const datos = JSON.parse(await readFile(path.join(raiz, id, ARCHIVO_OBRA), 'utf8'));
          const o = datos?.obra ?? datos;
          // Lo justo para la ficha del índice; los conteos no son entender la
          // obra, son contar listas, y evitan bajarse cada obra entera.
          const largo = (v) => (Array.isArray(v) ? v.length : 0);
          // Una carpeta anterior trae cargas con partidas, que al abrirla se
          // migran a cálculos: se cuentan ya como lo que van a ser.
          const partidas = Array.isArray(o?.cargas)
            ? o.cargas.reduce((n, c) => n + largo(c?.subcargas), 0)
            : 0;
          const calculos = largo(o?.calculos) + partidas;
          obras.push({
            id,
            nombre: typeof o?.nombre === 'string' ? o.nombre : id,
            creada: typeof o?.creada === 'string' ? o.creada : '',
            calculos,
            vacia: calculos === 0 && largo(o?.modulos) === 0,
          });
        } catch {
          // Una carpeta sin `obra.json` legible no es una obra, o está a medio
          // copiar: no se lista, y abrirla dirá qué le falta.
        }
      }
      return obras;
    },

    async leer(id) {
      const dir = carpeta(id);
      if (!(await existe(path.join(dir, ARCHIVO_OBRA)))) {
        throw new ErrorObras(404, `No hay una obra «${id}» en ${raiz}.`);
      }
      const archivos = await leerArchivos(dir);
      return { version: versionDe(archivos), archivos };
    },

    /**
     * Toma o renueva el candado de escritor. Con `forzar` se lo quita a otra
     * pestaña, que se entera en su siguiente escritura o latido.
     */
    escritor(id, token, { forzar = false } = {}) {
      carpeta(id);
      if (typeof token !== 'string' || token.length < 8) throw new ErrorObras(400, 'Falta el token.');
      const actual = escritorVivo(id);
      if (actual && actual.token !== token && !forzar) {
        throw new ErrorObras(409, 'Otra pestaña está editando esta obra.', { conflicto: 'escritor' });
      }
      escritores.set(id, { token, hasta: ahora() + CADUCIDAD_MS });
      return { ok: true, caduca: CADUCIDAD_MS };
    },

    /** Suelta el candado si es de este token; una pestaña que se cierra lo llama. */
    soltar(id, token) {
      if (escritorVivo(id)?.token === token) escritores.delete(id);
      return { ok: true };
    },

    /**
     * Escribe la obra entera: los archivos que llegan, y borra las hojas que ya
     * no están (un nodo borrado). Cada archivo se escribe a un temporal y se
     * renombra, así que un corte a mitad deja cada archivo entero —el viejo o el
     * nuevo—, nunca uno a medias.
     *
     * `base: null` es crear: falla si la obra ya existe, igual que
     * `guardarObra(…, { crear: true })`.
     */
    async escribir(id, { token, base, archivos }) {
      const dir = carpeta(id);
      if (typeof archivos !== 'object' || archivos === null || Array.isArray(archivos)) {
        throw new ErrorObras(400, 'Faltan los archivos.');
      }
      if (typeof archivos[ARCHIVO_OBRA] !== 'string') throw new ErrorObras(400, `Falta ${ARCHIVO_OBRA}.`);
      for (const [ruta, contenido] of Object.entries(archivos)) {
        if (!RUTA_RE.test(ruta)) throw new ErrorObras(400, `Ruta no permitida: «${ruta}».`);
        if (typeof contenido !== 'string') throw new ErrorObras(400, `${ruta} no es texto.`);
      }

      const hay = await existe(path.join(dir, ARCHIVO_OBRA));
      /** Lo que hay en disco, para no reescribir lo que no cambió. */
      let actuales = {};
      if (base === null) {
        if (hay) throw new ErrorObras(409, `Ya hay una obra «${id}» en el disco.`, { conflicto: 'existe' });
      } else {
        if (!hay) throw new ErrorObras(409, 'La obra ya no está en el disco.', { conflicto: 'borrada' });
        const e = escritorVivo(id);
        if (e && e.token !== token) {
          throw new ErrorObras(409, 'Otra pestaña tomó el control de esta obra.', { conflicto: 'escritor' });
        }
        actuales = await leerArchivos(dir);
        const enDisco = versionDe(actuales);
        if (enDisco !== base) {
          throw new ErrorObras(409, 'La obra cambió en el disco desde que se abrió.', {
            conflicto: 'version',
            version: enDisco,
          });
        }
      }
      // Escribir RENUEVA el candado de quien ya lo tiene, y nunca lo crea. Dos
      // escrituras lo crearían sin ser de una pestaña viva: la del índice al
      // crear la obra, y la última de una página que se va, que puede llegar
      // DESPUÉS del beacon que soltó el candado. En los dos casos la pestaña
      // que abre la obra a continuación lleva otro token y abriría en solo
      // lectura.
      const vivo = escritorVivo(id);
      if (vivo && vivo.token === token) vivo.hasta = ahora() + CADUCIDAD_MS;

      await mkdir(path.join(dir, 'hojas'), { recursive: true });
      const sufijo = `.tmp-${randomBytes(4).toString('hex')}`;
      for (const [ruta, contenido] of Object.entries(archivos)) {
        // Tocar una fórmula cambia un archivo, y solo ese se escribe: las
        // fechas del resto siguen diciendo cuándo cambiaron de verdad.
        if (actuales[ruta] === contenido) continue;
        const destino = path.join(dir, ...ruta.split('/'));
        await writeFile(destino + sufijo, contenido, 'utf8');
        await rename(destino + sufijo, destino);
      }
      for (const nombre of await readdir(path.join(dir, 'hojas'))) {
        if (!(`hojas/${nombre}` in archivos)) await rm(path.join(dir, 'hojas', nombre), { force: true });
      }
      return { version: versionDe(archivos) };
    },

    /** Borrar es mover a la papelera. Una obra es trabajo de alguien; nunca se
     *  destruye desde la aplicación. */
    async borrar(id, { token } = {}) {
      const dir = carpeta(id);
      if (!(await existe(dir))) throw new ErrorObras(404, `No hay una obra «${id}».`);
      const e = escritorVivo(id);
      if (e && e.token !== token) {
        throw new ErrorObras(409, 'La obra está abierta en otra pestaña.', { conflicto: 'escritor' });
      }
      await mkdir(path.join(raiz, PAPELERA), { recursive: true });
      const sello = new Date(ahora()).toISOString().replace(/[:.]/g, '-');
      const destino = path.join(raiz, PAPELERA, `${id}-${sello}`);
      await moverAPapelera(dir, destino, renombrar, pausaMs);
      escritores.delete(id);
      return { ok: true, papelera: destino };
    },
  };
}

/** Errores con los que, en Windows, un renombre puede salir bien un momento después. */
const RENOMBRE_TRANSITORIO = new Set(['EPERM', 'EBUSY', 'EACCES']);
const REINTENTOS = 5;

/**
 * Mueve una obra a la papelera.
 *
 * En Windows no se puede renombrar una carpeta que otro proceso tiene abierta:
 * el vigilante de un editor o de Vite, el Explorador, un antivirus. El rename
 * da EPERM aunque borrar sus archivos sí se pueda. Se reintenta unas veces, y si
 * no se libera, se copia a la papelera, se comprueba la copia archivo por
 * archivo y recién entonces se quita la original. Si la copia no coincide, se
 * descarta y no se borra nada: una obra nunca se pierde por esto.
 */
async function moverAPapelera(origen, destino, renombrar, pausaMs) {
  for (let i = 0; i < REINTENTOS; i++) {
    try {
      await renombrar(origen, destino);
      return;
    } catch (e) {
      if (!RENOMBRE_TRANSITORIO.has(e?.code)) throw e;
      if (i < REINTENTOS - 1) await new Promise((r) => setTimeout(r, pausaMs * (i + 1)));
    }
  }
  await cp(origen, destino, { recursive: true, errorOnExist: true, force: false });
  const [a, b] = await Promise.all([arbolDe(origen), arbolDe(destino)]);
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    await rm(destino, { recursive: true, force: true });
    throw new Error('La copia a la papelera no coincide con la obra; no se borró nada.');
  }
  await rm(origen, { recursive: true, force: true });
}

/** Todos los archivos de una carpeta, ruta relativa → contenido, en orden. */
async function arbolDe(dir, base = dir) {
  const out = {};
  for (const e of (await readdir(dir, { withFileTypes: true })).sort((x, y) => x.name.localeCompare(y.name))) {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) Object.assign(out, await arbolDe(ruta, base));
    else out[path.relative(base, ruta).split(path.sep).join('/')] = await readFile(ruta, 'utf8');
  }
  return out;
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

function leerCuerpo(req) {
  return new Promise((resolver, rechazar) => {
    const trozos = [];
    let largo = 0;
    req.on('data', (t) => {
      largo += t.length;
      if (largo > MAX_CUERPO) {
        rechazar(new ErrorObras(413, 'La obra es demasiado grande para guardarla de una vez.'));
        req.destroy();
      } else {
        trozos.push(t);
      }
    });
    req.on('end', () => {
      if (!trozos.length) return resolver({});
      try {
        resolver(JSON.parse(Buffer.concat(trozos).toString('utf8')));
      } catch {
        rechazar(new ErrorObras(400, 'El cuerpo no es JSON.'));
      }
    });
    req.on('error', rechazar);
  });
}

function responder(res, codigo, cuerpo) {
  res.statusCode = codigo;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(cuerpo));
}

const LOCALES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** El nombre de máquina de un `Host` u `Origin`, o `''` si no se entiende. */
function maquina(valor, esOrigen) {
  try {
    return new URL(esOrigen ? valor : `http://${valor}`).hostname;
  } catch {
    return '';
  }
}

/**
 * Por qué no se atiende una petición que llega desde esta máquina, o `null`.
 *
 * La IP no basta: cualquier página abierta en el navegador también llega desde
 * 127.0.0.1. Un `Host` ajeno es una página que rebindó su dominio a esta
 * máquina; un `Origin` ajeno, otra página que escribe. Y un POST tiene que ser
 * JSON: una página ajena no puede mandarlo sin la consulta previa que el
 * navegador hace y este servidor no contesta. PUT y DELETE ya la exigen siempre.
 */
function rechazoDeOrigen(req, metodo) {
  if (!LOCALES.has(maquina(req.headers.host ?? '', false))) {
    return 'El servidor de obras solo atiende peticiones dirigidas a localhost.';
  }
  const origen = req.headers.origin;
  if (origen && !LOCALES.has(maquina(origen, true))) return 'El servidor de obras no atiende a otras páginas.';
  if (metodo === 'POST') {
    const tipo = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (tipo !== 'application/json') return 'El servidor de obras solo acepta JSON.';
  }
  return null;
}

/**
 * Un middleware de `connect` (el que usan Vite y `vite preview`), que también
 * sirve suelto sobre `http.createServer`. Lo que no empieza por `/obras-api` lo
 * deja pasar.
 */
export function manejadorObras(obras) {
  return async (req, res, siguiente) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== PREFIJO && !url.pathname.startsWith(PREFIJO + '/')) {
      if (siguiente) return siguiente();
      return responder(res, 404, { motivo: 'No existe.' });
    }
    // Solo desde esta máquina: la obra es de quien está sentado frente a ella.
    const origen = req.socket.remoteAddress ?? '';
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(origen)) {
      return responder(res, 403, { motivo: 'El servidor de obras solo atiende a esta máquina.' });
    }
    const metodo = req.method ?? 'GET';
    const motivo = rechazoDeOrigen(req, metodo);
    if (motivo) return responder(res, 403, { motivo });
    const partes = url.pathname.slice(PREFIJO.length).split('/').filter(Boolean).map(decodeURIComponent);
    try {
      if (partes.length === 1 && partes[0] === 'salud' && metodo === 'GET') {
        return responder(res, 200, { ok: true, raiz: obras.raiz });
      }
      if (partes.length === 0 && metodo === 'GET') {
        return responder(res, 200, { obras: await obras.listar() });
      }
      const [id, accion] = partes;
      if (partes.length === 1) {
        if (metodo === 'GET') return responder(res, 200, await obras.leer(id));
        if (metodo === 'PUT') return responder(res, 200, await obras.escribir(id, await leerCuerpo(req)));
        if (metodo === 'DELETE') return responder(res, 200, await obras.borrar(id, await leerCuerpo(req)));
      }
      if (partes.length === 2 && accion === 'escritor' && metodo === 'POST') {
        const { token, forzar, soltar } = await leerCuerpo(req);
        return responder(res, 200, soltar ? obras.soltar(id, token) : obras.escritor(id, token, { forzar }));
      }
      return responder(res, 405, { motivo: `${metodo} ${url.pathname} no existe.` });
    } catch (e) {
      if (e instanceof ErrorObras) return responder(res, e.codigo, e.datos);
      console.error('[obras]', e);
      return responder(res, 500, { motivo: `El servidor no pudo completar la operación: ${e.message}` });
    }
  };
}

/** El plugin de Vite: monta el manejador en `vite` y en `vite preview`. */
export function pluginObras(raiz = raizPorDefecto()) {
  const obras = crearObras(raiz);
  // Sin devolver nada: Vite toma una función devuelta por `configureServer`
  // como un gancho que corre después, y `use` devuelve la app de connect.
  const montar = (server) => {
    server.middlewares.use(manejadorObras(obras));
  };
  return {
    name: 'structflow-obras',
    configureServer: montar,
    configurePreviewServer: montar,
  };
}

// ── Suelto ───────────────────────────────────────────────────────────────────

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = raizPorDefecto();
  const puerto = Number(process.env.PUERTO_OBRAS) || PUERTO;
  http
    .createServer(manejadorObras(crearObras(raiz)))
    .listen(puerto, '127.0.0.1', () => {
      console.log(`Obras en ${raiz}\nhttp://127.0.0.1:${puerto}${PREFIJO}`);
    });
}
