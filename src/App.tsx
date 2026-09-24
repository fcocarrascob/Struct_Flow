import { useLayoutEffect } from 'react';
import MathCanvas from './components/canvas/MathCanvas';
import ErrorBoundary, { type Rescate } from './components/ErrorBoundary';
import Landing from './components/Landing';
import CatalogoPagina from './components/CatalogoPagina';
import IndiceDiseno from './components/diseno/IndiceDiseno';
import PaginaDiseno from './components/diseno/PaginaDiseno';
import ModuloBiblioteca from './components/diseno/ModuloBiblioteca';
import IndiceProyectos from './proyecto/IndiceProyectos';
import { CanvasObraConProveedor } from './proyecto/obra/CanvasObra';
import { useRuta } from './components/useRuta';
import Calibrar from './components/dev/Calibrar';
import { moduloPorId } from './lib/diseno/registro';
import type { Ruta } from './lib/ruta';
import { STORAGE_KEY } from './lib/hoja-guardada';
import { obraCruda } from './proyecto/obra/almacen';
import { borradorCrudo } from './proyecto/obra/almacen-disco';

/**
 * Qué rescata la pantalla de un fallo de render, por vista.
 *
 * Cada una guarda en su sitio, y el límite no lo sabe: sin esto, la pantalla de
 * una obra rota se titulaba «El canvas se detuvo», su botón leía la hoja del
 * canvas —y no hacía nada si no había ninguna— y el texto final pedía borrar esa
 * misma clave, que no arregla la obra y sí se lleva el trabajo de la otra vista.
 */
const RESCATE_CANVAS: Rescate = {
  leer: () => localStorage.getItem(STORAGE_KEY),
  archivo: 'hoja-recuperada.json',
  clave: STORAGE_KEY,
};

/**
 * Una obra es SU entrada, no la clave entera de las obras del navegador: esa
 * ofrecía bajar todas las demás y ninguna de disco. Una obra en disco solo deja
 * aquí su borrador; lo demás sigue en su carpeta, y al desmontarse el canvas
 * vacía lo pendiente al disco.
 */
const rescateDeObra = (id: string): Rescate => ({
  leer: () => obraCruda(id) ?? borradorCrudo(id),
  archivo: `${id}-recuperada.json`,
  siNoHay:
    'Si la obra está en su carpeta del disco, lo guardado sigue ahí; lo que no alcanzó a ' +
    'llegar se ofrece como borrador al volver a abrirla.',
});

/**
 * El conmutador de vistas.
 *
 * Hasta hace poco esto era el chrome del canvas —encabezado y ayuda— porque el
 * canvas era toda la aplicación. Ahora la raíz es el menú y el canvas es una
 * vista más; la ayuda se mudó a la landing.
 *
 * Cada vista se envuelve en su propio `ErrorBoundary`: si el canvas revienta
 * con una hoja corrupta, el menú tiene que seguir alcanzable para poder salir.
 *
 * De ahí la `key`, y no es cosmética. Sin ella, todas las vistas devuelven un
 * `ErrorBoundary` en la misma posición del árbol, React lo reconcilia como el
 * MISMO componente y `state.error` no se limpia nunca: si reventaba el catálogo,
 * navegar a los módulos seguía enseñando la pantalla roja y la única salida era
 * recargar. Con una `key` distinta por vista, cambiar de vista monta un límite
 * nuevo y limpio.
 *
 * Y de ahí también el `rotulo` y el `rescate` de cada una: la pantalla tiene que
 * decir qué se cayó y ofrecer descargar el trabajo DE ESA vista, no el de otra.
 */
const MARCA = 'Struct_Flow';

/**
 * El título de la pestaña, por vista. Con uno solo para todas, tres pestañas
 * abiertas —una obra, la hoja y un módulo— no se distinguían. Una obra lo afina
 * con su nombre desde su propio canvas, que es quien lo conoce.
 */
function tituloDe(ruta: Ruta): string {
  switch (ruta.vista) {
    case 'planillas':
      return `Planillas — ${MARCA}`;
    case 'canvas':
      return `Canvas — ${MARCA}`;
    case 'diseno':
      return `Diseño de elementos — ${MARCA}`;
    case 'modulo':
      return `${moduloPorId(ruta.id)?.titulo ?? ruta.id} — ${MARCA}`;
    case 'proyectos':
      return `Proyectos — ${MARCA}`;
    case 'obra':
      return `${ruta.id} — ${MARCA}`;
    case 'calibrar':
      return `Calibrar — ${MARCA}`;
    default:
      return `${MARCA} — memorias de cálculo estructural`;
  }
}

export default function App() {
  const ruta = useRuta();
  const titulo = tituloDe(ruta);
  // De diseño y no pasivo: los efectos pasivos corren de hijo a padre, así que
  // uno pasivo aquí pisaría el nombre que la obra acaba de poner en el suyo.
  useLayoutEffect(() => {
    document.title = titulo;
  }, [titulo]);

  switch (ruta.vista) {
    case 'planillas':
      return (
        <ErrorBoundary key="planillas" rotulo="El catálogo" sinTrabajo>
          <CatalogoPagina />
        </ErrorBoundary>
      );

    case 'canvas':
      return (
        // El canvas ocupa la ventana: mide su hoja con scroll propio y
        // `MathCanvas` cuelga de un `h-full` que necesita un padre con altura
        // definida. `#root` sigue siendo hijo directo de `<body>`, que es de lo
        // que depende la regla de impresión que oculta la interfaz.
        <div className="h-screen w-full overflow-hidden">
          <ErrorBoundary key="canvas" rotulo="El canvas" rescate={RESCATE_CANVAS}>
            <MathCanvas />
          </ErrorBoundary>
        </div>
      );

    case 'diseno':
      return (
        <ErrorBoundary key="diseno" rotulo="El índice de módulos" sinTrabajo>
          <IndiceDiseno />
        </ErrorBoundary>
      );

    case 'proyectos':
      return (
        // Un índice no tiene trabajo propio: las obras están en su carpeta o en
        // el navegador, y se abren (y se rescatan) desde su propia vista.
        <ErrorBoundary key="proyectos" rotulo="El índice de proyectos" sinTrabajo>
          <IndiceProyectos />
        </ErrorBoundary>
      );

    // Una obra: el canvas ocupa la ventana, como el canvas matemático. El
    // documento se guarda en disco o en este navegador.
    case 'obra':
      return (
        <ErrorBoundary key={`obra:${ruta.id}`} rotulo="La obra" rescate={rescateDeObra(ruta.id)}>
          <CanvasObraConProveedor id={ruta.id} />
        </ErrorBoundary>
      );

    // Herramientas de calibración de la A4. Solo en desarrollo: miden con el
    // documento de impresión de verdad, así que tienen que vivir en la
    // aplicación, pero no son una vista del producto. En producción la ruta cae
    // en el menú, como cualquier otra desconocida.
    case 'calibrar':
      if (!import.meta.env.DEV) break;
      return (
        <ErrorBoundary key="calibrar" rotulo="La calibración">
          <Calibrar />
        </ErrorBoundary>
      );

    // Primero los módulos TS del registro; si no hay, una genérica promovible
    // de la biblioteca (módulo declarativo, se descarga al abrirlo).
    case 'modulo': {
      const modulo = moduloPorId(ruta.id);
      return (
        <ErrorBoundary key={`modulo:${ruta.id}`} rotulo="El módulo">
          {modulo ? <PaginaDiseno modulo={modulo} /> : <ModuloBiblioteca id={ruta.id} />}
        </ErrorBoundary>
      );
    }

  }

  return (
    <ErrorBoundary key="inicio" rotulo="El menú" sinTrabajo>
      <Landing />
    </ErrorBoundary>
  );
}
