import MathCanvas from './components/canvas/MathCanvas';
import ErrorBoundary from './components/ErrorBoundary';
import Landing from './components/Landing';
import CatalogoPagina from './components/CatalogoPagina';
import IndiceDiseno from './components/diseno/IndiceDiseno';
import PaginaDiseno from './components/diseno/PaginaDiseno';
import Enlace from './components/Enlace';
import { useRuta } from './components/useRuta';
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
 */
export default function App() {
  const ruta = useRuta();

  switch (ruta.vista) {
    case 'planillas':
      return (
        <ErrorBoundary>
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
          <ErrorBoundary>
            <MathCanvas />
          </ErrorBoundary>
        </div>
      );

    case 'diseno':
      return (
        <ErrorBoundary>
          <IndiceDiseno />
        </ErrorBoundary>
      );

    case 'modulo': {
      const modulo = moduloPorId(ruta.id);
      if (!modulo) return <NoEncontrado id={ruta.id} />;
      return (
        <ErrorBoundary>
          <PaginaDiseno modulo={modulo} />
        </ErrorBoundary>
      );
    }

    default:
      return (
        <ErrorBoundary>
          <Landing />
        </ErrorBoundary>
      );
  }
}

function NoEncontrado({ id }: { id: string }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <h1 className="text-xl font-semibold text-ink">No hay ningún módulo «{id}»</h1>
      <p className="mt-2 text-sm text-muted">
        Puede que el enlace sea de una versión anterior.{' '}
        <Enlace a={{ vista: 'diseno' }} className="text-accent hover:underline">
          Ver los módulos disponibles
        </Enlace>
        .
      </p>
    </main>
  );
}
