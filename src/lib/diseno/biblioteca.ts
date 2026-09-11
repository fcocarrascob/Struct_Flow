// Los módulos de diseño que salen de la biblioteca, en el navegador.
//
// Los módulos TS están en `registro.ts`, compilados en el bundle. Los
// declarativos no: son archivos de `public/biblioteca/` que se descargan al
// abrirlos, igual que una planilla del catálogo. Quién es promovible lo dice el
// índice (`promovible`: genérica con entradas y salidas declaradas).

import { cargarIndice, type EntradaIndice } from '../catalogo';
import { moduloDeBiblioteca } from './declarativo';
import type { Entradas, ModuloDiseno } from './tipos';

/** Las genéricas que se pueden abrir en `/diseno/<slug>`. */
export async function listarPromovibles(): Promise<EntradaIndice[]> {
  return (await cargarIndice()).filter((e) => e.promovible);
}

const cache = new Map<string, Promise<ModuloDiseno<Entradas> | null>>();

/**
 * El módulo de la genérica `id`, o `null` si el índice no la tiene como
 * promovible. Lanza si el archivo no carga o no cumple el contrato: eso no es
 * un «no existe», es un defecto que hay que ver.
 */
export function cargarModuloDeBiblioteca(id: string): Promise<ModuloDiseno<Entradas> | null> {
  let p = cache.get(id);
  if (!p) {
    p = cargar(id).catch((err) => {
      // Sin esto, un fallo de red quedaría cacheado y reintentar no serviría.
      cache.delete(id);
      throw err;
    });
    cache.set(id, p);
  }
  return p;
}

async function cargar(id: string): Promise<ModuloDiseno<Entradas> | null> {
  const e = (await cargarIndice()).find((x) => x.slug === id && x.promovible);
  if (!e) return null;
  const r = await fetch(e.ruta);
  if (!r.ok) throw new Error(`no se pudo descargar ${e.ruta} (${r.status})`);
  const bytes = await r.arrayBuffer();
  // El sha256 de los bytes descargados: es el archivo que de verdad se
  // instancia. Fuera de un contexto seguro no hay `crypto.subtle`, y ahí se usa
  // el del índice, que `npm run dev` y `npm run build` regeneran.
  const sha256 = globalThis.crypto?.subtle ? await digerir(bytes) : e.sha256;
  return moduloDeBiblioteca(JSON.parse(new TextDecoder().decode(bytes)), { sha256 });
}

async function digerir(bytes: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
