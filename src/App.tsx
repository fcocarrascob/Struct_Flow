import MathCanvas from './components/canvas/MathCanvas';
import ErrorBoundary from './components/ErrorBoundary';
import Landing from './components/Landing';
import CatalogoPagina from './components/CatalogoPagina';
import IndiceDiseno from './components/diseno/IndiceDiseno';
import PaginaDiseno from './components/diseno/PaginaDiseno';
import ModuloBiblioteca from './components/diseno/ModuloBiblioteca';
import { useRuta } from './components/useRuta';
import Calibrar from './components/dev/Calibrar';
import { moduloPorId } from './lib/diseno/registro';

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
 * navegar a los módulos seguía enseñando la pantalla roja —rotulada «El canvas
 * se detuvo»— y la única salida era recargar. Con una `key` distinta por vista,
 * cambiar de vista monta un límite nuevo y limpio.
 */
export default function App() {
  const ruta = useRuta();

  switch (ruta.vista) {
    case 'planillas':
      return (
        <ErrorBoundary key="planillas">
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
          <ErrorBoundary key="canvas">
            <MathCanvas />
          </ErrorBoundary>
        </div>
      );

    case 'diseno':
      return (
        <ErrorBoundary key="diseno">
          <IndiceDiseno />
        </ErrorBoundary>
      );

    // Herramientas de calibración de la A4. Solo en desarrollo: miden con el
    // documento de impresión de verdad, así que tienen que vivir en la
    // aplicación, pero no son una vista del producto. En producción la ruta cae
    // en el menú, como cualquier otra desconocida.
    case 'calibrar':
      if (!import.meta.env.DEV) break;
      return (
        <ErrorBoundary key="calibrar">
          <Calibrar />
        </ErrorBoundary>
      );

    // Primero los módulos TS del registro; si no hay, una genérica promovible
    // de la biblioteca (módulo declarativo, se descarga al abrirlo).
    case 'modulo': {
      const modulo = moduloPorId(ruta.id);
      return (
        <ErrorBoundary key={`modulo:${ruta.id}`}>
          {modulo ? <PaginaDiseno modulo={modulo} /> : <ModuloBiblioteca id={ruta.id} />}
        </ErrorBoundary>
      );
    }

  }

  return (
    <ErrorBoundary key="inicio">
      <Landing />
    </ErrorBoundary>
  );
}
