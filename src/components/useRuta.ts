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
    // Una navegación nueva empieza arriba, como un enlace de verdad: sin esto,
    // abrir un módulo desde el final de `/diseno` mostraba la página nueva
    // desplazada, sin su cabecera. Atrás/adelante (`popstate`) no se toca: ahí
    // el navegador restaura la posición que había.
    const navegado = () => {
      actualizar();
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', actualizar);
    window.addEventListener(EVENTO_RUTA, navegado);
    return () => {
      window.removeEventListener('popstate', actualizar);
      window.removeEventListener(EVENTO_RUTA, navegado);
    };
  }, []);

  return ruta;
}
