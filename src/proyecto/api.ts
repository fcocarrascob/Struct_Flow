// ─────────────────────────────────────────────────────────────────────────────
// El cliente del servidor local del harness (`python -m harness.servidor`).
//
// Tres GET y nada más. No hay POST ni PUT porque del otro lado tampoco los hay:
// la primera versión del canvas es un visor, y la escritura —cuando entre— va a
// ir por las CLI del harness, que corren el lint y revierten si empeora.
//
// El caso que más importa acá no es el éxito: es que el servidor NO ESTÉ
// corriendo. Un canvas que se queda cargando para siempre no dice nada; uno que
// dice «arranca harness.servidor» se arregla en diez segundos.
// ─────────────────────────────────────────────────────────────────────────────

import { validarGrafo, type Grafo, type ProyectoListado } from './contrato';

/** Vite proxea `/api` al servidor local (ver `vite.config.ts`). */
const BASE = '/api';

export class ErrorApi extends Error {
  constructor(
    message: string,
    readonly detalle = '',
  ) {
    super(message);
    this.name = 'ErrorApi';
  }
}

const SIN_SERVIDOR = new ErrorApi(
  'No hay servidor del harness',
  'Arranca `python -m harness.servidor` en la raíz de Struct_Harness (escucha en ' +
    '127.0.0.1:8787) y vuelve a cargar. Con PYTHONPATH apuntando a `_codigo`.',
);

/**
 * Códigos que en este montaje significan «del otro lado no hay nadie», no «el
 * servidor del harness devolvió un error».
 *
 * Importa distinguirlos: como el front habla por el proxy de Vite y no directo
 * al 8787, cuando el servidor no está corriendo el `fetch` NO falla — responde
 * el proxy, con un 502 y un cuerpo que no es JSON. El caso más común de todos
 * llegaba así al mensaje genérico «respondió 502 y no era JSON», que no dice
 * qué hacer. Un error que no dice qué hacer cuesta lo mismo que no tenerlo.
 */
const PROXY_SIN_DESTINO = new Set([502, 503, 504]);

async function pedir<T>(ruta: string): Promise<T> {
  let r: Response;
  try {
    // Sin proxy (abriendo el HTML compilado a mano) el fetch sí falla acá.
    r = await fetch(`${BASE}${ruta}`, { headers: { Accept: 'application/json' } });
  } catch {
    throw SIN_SERVIDOR;
  }
  if (PROXY_SIN_DESTINO.has(r.status)) throw SIN_SERVIDOR;

  let cuerpo: unknown;
  try {
    cuerpo = await r.json();
  } catch {
    throw new ErrorApi(
      `El servidor respondió ${r.status} y no era JSON`,
      'Si es un 404 con HTML, la ruta /api no está proxeada: revisa `server.proxy` ' +
        'en vite.config.ts y que el dev server se haya reiniciado después.',
    );
  }
  if (!r.ok) {
    const e = (cuerpo as { error?: string })?.error ?? `HTTP ${r.status}`;
    throw new ErrorApi(e);
  }
  return cuerpo as T;
}

export async function listarProyectos(): Promise<ProyectoListado[]> {
  const d = await pedir<{ proyectos: ProyectoListado[] }>('/proyectos');
  return d.proyectos ?? [];
}

/** Trae el grafo y lo VALIDA. Un contrato desconocido llega acá como error. */
export async function traerGrafo(slug: string): Promise<Grafo> {
  const crudo = await pedir<unknown>(`/grafo?proyecto=${encodeURIComponent(slug)}`);
  const v = validarGrafo(crudo);
  if (!v.ok) throw new ErrorApi(v.motivo, v.detalle);
  return v.grafo;
}

export interface ArchivoLeido {
  proyecto: string;
  ruta: string;
  bytes: number;
  truncado: boolean;
  texto: string;
}

export async function traerArchivo(slug: string, ruta: string): Promise<ArchivoLeido> {
  return pedir<ArchivoLeido>(
    `/archivo?proyecto=${encodeURIComponent(slug)}&ruta=${encodeURIComponent(ruta)}`,
  );
}
