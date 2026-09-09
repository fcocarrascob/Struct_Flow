import { useEffect, useState } from 'react';
import { EVENTO_RUTA, parsearRuta, type Ruta } from '../lib/ruta';

/**
 * La ruta actual, reactiva. Escucha las dos formas de cambiarla: `popstate`
 * (atrás/adelante del navegador) y el evento propio que emite `navegar()`,
 * porque `pushState` no dispara `popstate`.
 */
export function useRuta(): Ruta {
  const [ruta, setRuta] = useState<Ruta>(() => parsearRuta(window.location.pathname));

  useEffect(() => {
    const actualizar = () => setRuta(parsearRuta(window.location.pathname));
    window.addEventListener('popstate', actualizar);
    window.addEventListener(EVENTO_RUTA, actualizar);
    return () => {
      window.removeEventListener('popstate', actualizar);
      window.removeEventListener(EVENTO_RUTA, actualizar);
    };
  }, []);

  return ruta;
}
