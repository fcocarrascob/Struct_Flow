import type { ClaseNodo } from './proyeccion';

/**
 * El ícono de la clase de un nodo. Lo usan la tarjeta del grafo y la pestaña de
 * su hoja, para que las dos digan lo mismo con la misma forma.
 *
 * `obra` no es una clase de nodo: es la pestaña del grafo.
 */
export const ROTULO_CLASE: Record<ClaseNodo, string> = {
  definiciones: 'definiciones',
  carga: 'carga',
  calculo: 'cálculo',
  biblioteca: 'biblioteca',
  resumen: 'resumen',
  modelo: 'modelo',
};

export default function IconoClase({
  clase,
  className = 'h-3 w-3',
}: {
  clase: ClaseNodo | 'obra';
  className?: string;
}) {
  const comun = {
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };
  switch (clase) {
    // Una flecha que baja sobre una viga: una acción.
    case 'carga':
      return (
        <svg {...comun}>
          <path d="M8 1.5v8M5 6.5l3 3 3-3M2 13h12" />
        </svg>
      );
    // Una lista: la tabla de cargas.
    case 'definiciones':
      return (
        <svg {...comun}>
          <path d="M2 3.5h12M2 8h12M2 12.5h12" />
        </svg>
      );
    // Un libro: una genérica sellada de la biblioteca.
    case 'biblioteca':
      return (
        <svg {...comun}>
          <path d="M3 2.5h7.5a2 2 0 0 1 2 2v9H5a2 2 0 0 1-2-2z" />
          <path d="M3 11.5a2 2 0 0 1 2-2h7.5" />
        </svg>
      );
    // Un sumatorio: la hoja que reúne lo que publican las demás.
    case 'resumen':
      return (
        <svg {...comun}>
          <path d="M12.5 3h-9l5 5-5 5h9" />
        </svg>
      );
    // Un pórtico: el modelo de SAP2000.
    case 'modelo':
      return (
        <svg {...comun}>
          <path d="M2.5 14V4.5h11V14M2.5 9h11M8 4.5V14M1.5 14h13" />
        </svg>
      );
    // Tres nodos enlazados: el grafo.
    case 'obra':
      return (
        <svg {...comun}>
          <circle cx="3.5" cy="8" r="1.8" />
          <circle cx="12.5" cy="3.5" r="1.8" />
          <circle cx="12.5" cy="12.5" r="1.8" />
          <path d="M5.2 7.2 10.8 4.3M5.2 8.8l5.6 2.9" />
        </svg>
      );
    // Una hoja con una fórmula: el cálculo.
    default:
      return (
        <svg {...comun}>
          <path d="M4 1.5h5.5L12.5 4.5v10H4z" />
          <path d="M6.5 8h4M6.5 11h4" />
        </svg>
      );
  }
}
