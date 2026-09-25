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
 *  viven en su propia lista y no en `obra.modulos`. `otra-obra` no agrega un
 *  nodo sino que abre el diálogo para traerlos de otra obra. */
export type EntradaPaleta = Modulo | 'calculo' | 'base-columna' | 'vista-base-columna' | 'otra-obra';

interface Entrada {
  clave: EntradaPaleta;
  titulo: string;
  detalle: string;
  /** Uno solo por obra, como el modelo de SAP2000. */
  unico: boolean;
  /** Un sub-nodo: cuelga de otro, que tiene que estar antes. */
  requiere?: Modulo;
}

const ENTRADAS: Entrada[] = [
  { clave: 'sap', titulo: 'SAP2000', detalle: 'el modelo abierto en SAP2000', unico: true },
  {
    clave: 'sap-combinaciones',
    titulo: 'SAP2000 · Combinaciones',
    detalle: 'las combinaciones del modelo, en una matriz',
    unico: true,
    requiere: 'sap',
  },
  {
    clave: 'sap-modal',
    titulo: 'SAP2000 · Modal',
    detalle: 'periodos y masas participantes (exige el modelo analizado)',
    unico: true,
    requiere: 'sap',
  },
  {
    clave: 'sap-basal',
    titulo: 'SAP2000 · Reacción basal',
    detalle: 'la reacción en la base de cada caso (exige el modelo analizado)',
    unico: true,
    requiere: 'sap',
  },
  {
    clave: 'sap-apoyos',
    titulo: 'SAP2000 · Reacciones en apoyos',
    detalle: 'lo que llega a cada apoyo, por caso (exige el modelo analizado)',
    unico: true,
    requiere: 'sap',
  },
  {
    clave: 'calculo',
    titulo: 'Cálculo',
    detalle: 'una planilla genérica de la biblioteca, instanciada',
    unico: false,
  },
  {
    clave: 'base-columna',
    titulo: 'Base de columna…',
    detalle: 'el grupo entero de un tipo de apoyo, con las solicitaciones a mano (con SAP2000, desde el panel de apoyos)',
    unico: false,
  },
  {
    clave: 'vista-base-columna',
    titulo: 'Vista geométrica · Base de columna',
    detalle: 'solo la vista: placa, silla, pernos, llave y pedestal, y sus choques',
    unico: false,
  },
  {
    clave: 'otra-obra',
    titulo: 'De otra obra…',
    detalle: 'copiar nodos ya calculados, con sus grupos',
    unico: false,
  },
];

const POR_VENIR = ['esfuerzos de SAP2000', 'Documento'];

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
          const falta = e.requiere && !puestos.includes(e.requiere);
          return (
            <button
              key={e.clave}
              type="button"
              disabled={yaEstá || !!falta}
              onClick={() => onAgregar(e.clave)}
              className={`block w-full py-1.5 pr-3 text-left hover:bg-accent/10 disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent ${
                e.requiere ? 'pl-6' : 'pl-3'
              }`}
            >
              <span className="block text-xs font-medium text-ink">{e.titulo}</span>
              <span className="block text-[10px] text-muted">
                {yaEstá ? 'ya está en el canvas' : falta ? 'primero agrega el SAP2000' : e.detalle}
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
