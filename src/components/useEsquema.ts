import { useEffect, useState } from 'react';

/**
 * Texto de cada esquema ya descargado, por ruta. Los archivos de
 * `public/esquemas/` no cambian durante la sesión, así que se piden una vez.
 */
const cache = new Map<string, string>();

/**
 * El texto crudo de un esquema SVG, sin los tokens resueltos.
 *
 * Hay tres consumidores —la región del canvas, el documento de impresión y el
 * visor del módulo de diseño— y cada uno lo rinde a su manera; lo que comparten
 * es la descarga. Tenerla en un solo sitio importa: la copia del documento de
 * impresión no cacheaba y repetía el `fetch` cada vez que cambiaba el scope, o
 * sea en cada evaluación de la hoja.
 *
 * Devuelve `null` mientras carga y también si falla, para que quien llama pinte
 * un hueco del tamaño de la figura en vez de saltar de altura.
 */
export function useEsquema(src: string): string | null {
  const [raw, setRaw] = useState<string | null>(() => cache.get(src) ?? null);

  useEffect(() => {
    const guardado = cache.get(src);
    if (guardado !== undefined) {
      setRaw(guardado);
      return;
    }
    let vivo = true;
    fetch(src)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        cache.set(src, text);
        if (vivo) setRaw(text);
      })
      .catch(() => vivo && setRaw(null));
    return () => {
      vivo = false;
    };
  }, [src]);

  return raw;
}
