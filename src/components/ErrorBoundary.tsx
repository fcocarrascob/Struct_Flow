import { Component, type ErrorInfo, type ReactNode } from 'react';

const STORAGE_KEY = 'structpad.worksheet.v1';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Red de seguridad para los fallos de render.
 *
 * Sin esto, cualquier excepción durante el render desmonta la raíz de React y
 * deja la **pantalla en blanco**: la hoja sigue en `localStorage`, pero el
 * usuario no tiene forma de verlo ni de sacarla.
 *
 * Por eso lo importante de esta pantalla no es el mensaje, sino el botón de
 * descarga: lee el JSON crudo del almacenamiento, sin pasar por el motor que
 * acaba de fallar, y es la vía de rescate del trabajo.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Fallo de render en el canvas:', error, info.componentStack);
  }

  /** Descarga la hoja guardada tal cual está, sin interpretarla. */
  private descargarRespaldo = (): void => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'hoja-recuperada.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      // Si ni esto funciona, queda el mensaje con la clave de localStorage.
    }
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="m-4 max-w-2xl rounded-lg border border-red-300 bg-red-50 p-4 text-sm">
        <h2 className="text-base font-semibold text-red-900">El canvas se detuvo</h2>
        <p className="mt-2 text-red-900">
          Algo falló al dibujar la hoja. <strong>Tu trabajo no se ha perdido</strong>: sigue
          guardado en el navegador. Descárgalo antes de recargar.
        </p>
        <pre className="mt-3 overflow-x-auto rounded border border-red-200 bg-white p-2 font-mono text-xs text-red-800">
          {error.message}
        </pre>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={this.descargarRespaldo}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            Descargar la hoja guardada
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-900 hover:bg-red-100"
          >
            Recargar
          </button>
        </div>
        <p className="mt-3 text-xs text-red-800">
          Si al recargar vuelve a fallar, la hoja guardada es la causa: bórrala con{' '}
          <code className="font-mono">localStorage.removeItem('{STORAGE_KEY}')</code> en la
          consola del navegador, después de haberla descargado.
        </p>
      </div>
    );
  }
}
