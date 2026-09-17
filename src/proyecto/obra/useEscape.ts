import { useEffect } from 'react';

/**
 * Escape cierra lo que esté abierto.
 *
 * **Salvo mientras se escribe.** Dentro de un campo, Escape ya significa otra
 * cosa —en un bloque de la mini hoja devuelve el texto que había al entrar— y
 * el manejador de ese campo no detiene la propagación, así que sin esta guarda
 * una sola pulsación cancelaría la edición Y cerraría el panel. La regla es la
 * misma que usa el canvas matemático: Escape va de dentro hacia fuera, una cosa
 * por pulsación.
 *
 * Va en el documento y no en el elemento porque un panel no tiene el foco: el
 * foco está en el lienzo, en un nodo o en ningún sitio.
 */
export function useEscape(alCerrar: () => void): void {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const activo = document.activeElement;
      const etiqueta = activo?.tagName;
      if (etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || etiqueta === 'SELECT') return;
      alCerrar();
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [alCerrar]);
}
