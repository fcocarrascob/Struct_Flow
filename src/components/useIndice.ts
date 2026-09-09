import { useEffect, useState } from 'react';
import { cargarIndice, type EntradaIndice } from '../lib/catalogo';

export interface EstadoIndice {
  indice: EntradaIndice[] | null;
  error: boolean;
}

/**
 * El índice de planillas publicadas. Lo comparten el desplegable de la barra
 * del canvas y la página del catálogo; la descarga en sí está cacheada en
 * `lib/catalogo.ts`, así que montar los dos no la repite.
 */
export function useIndice(): EstadoIndice {
  const [indice, setIndice] = useState<EntradaIndice[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    cargarIndice()
      .then((d) => vivo && setIndice(d))
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, []);

  return { indice, error };
}
