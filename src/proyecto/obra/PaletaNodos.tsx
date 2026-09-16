import { useEffect } from 'react';
import type { Modulo } from './modelo';

/**
 * El desplegable de «+ agregar nodo».
 *
 * Mismo armazón que `components/canvas/CatalogoMenu.tsx`: una capa transparente
 * a pantalla completa por debajo del menú, para que un clic en cualquier otro
 * sitio lo cierre sin tener que escuchar en `document`.
 *
 * Lo que todavía no existe se muestra apagado en vez de esconderse. Un canvas
 * vacío con un solo botón no dice hacia dónde va; con la lista completa a la
 * vista, sí.
 */

/** `calculo` no es un `Modulo` de la obra: de esos puede haber muchos, así que
 *  viven en su propia lista y no en `obra.modulos`. */
export type EntradaPaleta = Modulo | 'calculo';

interface Entrada {
  clave: EntradaPaleta;
  titulo: string;
  detalle: string;
  /** Uno solo por obra. Las definiciones de carga son una tabla, como en SAP. */
  unico: boolean;
}

const ENTRADAS: Entrada[] = [
  { clave: 'cargas', titulo: 'Cargas', detalle: 'los patrones de carga de la obra', unico: true },
  {
    clave: 'calculo',
    titulo: 'Cálculo',
    detalle: 'una planilla genérica de la biblioteca, instanciada',
    unico: false,
  },
];

const POR_VENIR = ['Combinaciones', 'Modelo', 'Documento'];

export default function PaletaNodos({
  puestos,
  onAgregar,
  onCerrar,
}: {
  puestos: readonly Modulo[];
  onAgregar: (clave: EntradaPaleta) => void;
  onCerrar: () => void;
}) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  return (
    <>
      {/* Capa para cerrar el menú al hacer clic fuera. */}
      <div className="fixed inset-0 z-30" onClick={onCerrar} />
      <div className="absolute left-0 top-full z-40 mt-1 w-72 rounded border border-border bg-white py-1 shadow-lg">
        {ENTRADAS.map((e) => {
          const yaEstá = e.unico && puestos.includes(e.clave as Modulo);
          return (
            <button
              key={e.clave}
              type="button"
              disabled={yaEstá}
              onClick={() => onAgregar(e.clave)}
              className="block w-full px-3 py-1.5 text-left hover:bg-accent/10 disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
            >
              <span className="block text-xs font-medium text-ink">{e.titulo}</span>
              <span className="block text-[10px] text-muted">
                {yaEstá ? 'ya está en el canvas' : e.detalle}
              </span>
            </button>
          );
        })}

        <p className="mt-1 border-t border-border px-3 pb-1 pt-2 text-[10px] leading-snug text-muted">
          Más adelante: {POR_VENIR.join(', ')}.
        </p>
      </div>
    </>
  );
}
