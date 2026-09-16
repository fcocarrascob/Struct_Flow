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

async function pedir<T>(ruta: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${BASE}${ruta}`, { headers: { Accept: 'application/json' } });
  } catch {
    throw new ErrorApi(
      'No hay servidor del harness',
      'Arranca `python -m harness.servidor` en la raíz de Struct_Harness ' +
        '(escucha en 127.0.0.1:8787) y vuelve a cargar.',
    );
  }
  let cuerpo: unknown;
  try {
    cuerpo = await r.json();
  } catch {
    throw new ErrorApi(`El servidor respondió ${r.status} y no era JSON`);
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
