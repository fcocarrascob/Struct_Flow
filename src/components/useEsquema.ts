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
  // El texto va con la ruta de la que salió. Cuando `src` cambia —otra planilla
  // montada en el mismo componente—, el estado conserva el esquema anterior al
  // menos un render, y resolverlo contra el scope nuevo dibujaba una figura
  // ajena llena de «¿token?». Lo que no es de esta ruta no se devuelve.
  const [cargado, setCargado] = useState<{ src: string; raw: string | null }>(() => ({
    src,
    raw: cache.get(src) ?? null,
  }));

  useEffect(() => {
    const guardado = cache.get(src);
    if (guardado !== undefined) {
      setCargado({ src, raw: guardado });
      return;
    }
    let vivo = true;
    fetch(src)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        cache.set(src, text);
        if (vivo) setCargado({ src, raw: text });
      })
      .catch(() => vivo && setCargado({ src, raw: null }));
    return () => {
      vivo = false;
    };
  }, [src]);

  if (cargado.src === src) return cargado.raw;
  return cache.get(src) ?? null;
}
