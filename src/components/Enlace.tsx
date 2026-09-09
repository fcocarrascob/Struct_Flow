import type { ReactNode, MouseEvent } from 'react';
import { href, navegar, type Ruta } from '../lib/ruta';

interface Props {
  a: Ruta;
  busqueda?: string;
  className?: string;
  title?: string;
  children: ReactNode;
}

/**
 * Un enlace interno. Es un `<a>` de verdad, con su `href`, y no un `<button>`
 * con `onClick`: así el navegador ofrece «abrir en pestaña nueva», la barra de
 * estado muestra el destino y el teclado lo alcanza sin trabajo extra.
 *
 * Solo se intercepta el clic simple sin modificadores; Ctrl/Cmd/Shift y el
 * botón central se dejan pasar para que abran una pestaña como en cualquier
 * sitio.
 */
export default function Enlace({ a, busqueda = '', className, title, children }: Props) {
  const destino = href(a) + (busqueda && !busqueda.startsWith('?') ? `?${busqueda}` : busqueda);

  function alHacerClic(e: MouseEvent<HTMLAnchorElement>) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    navegar(a, busqueda);
  }

  return (
    <a href={destino} onClick={alHacerClic} className={className} title={title}>
      {children}
    </a>
  );
}
