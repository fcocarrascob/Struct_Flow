import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * De dónde se saca el trabajo cuando la vista se cayó, y cómo se llama el
 * archivo que se descarga.
 *
 * Es un parámetro y no una constante porque cada vista guarda en su sitio: la
 * hoja del canvas en `structpad.worksheet.v1`, las obras en
 * `structflow.obras.v1`. Con la clave fija aquí dentro, la pantalla de una obra
 * rota ofrecía descargar la hoja del canvas —y si no había ninguna, el botón no
 * hacía absolutamente nada— y remataba pidiendo borrar esa misma clave, que no
 * arregla la obra y sí se lleva el trabajo de la otra vista.
 */
export interface Rescate {
  /** La clave de `localStorage` donde está lo que hay que salvar. */
  clave: string;
  /** Nombre del archivo descargado. */
  archivo: string;
}

interface Props {
  children: ReactNode;
  /**
   * Qué se detuvo, en sujeto: «El canvas», «La obra». Da el título de la
   * pantalla, que es lo primero que el usuario lee para saber si lo que se cayó
   * es lo que tenía entre manos.
   */
  rotulo?: string;
  /** Sin esto no hay nada que descargar, y la pantalla no ofrece un botón inútil. */
  rescate?: Rescate;
}

interface State {
  error: Error | null;
}

/**
 * Red de seguridad para los fallos de render.
 *
 * Sin esto, cualquier excepción durante el render desmonta la raíz de React y
 * deja la **pantalla en blanco**: el trabajo sigue en `localStorage`, pero el
 * usuario no tiene forma de verlo ni de sacarlo.
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
    console.error(`Fallo de render en ${this.props.rotulo ?? 'la aplicación'}:`, error, info.componentStack);
  }

  /** Descarga lo guardado tal cual está, sin interpretarlo. */
  private descargarRespaldo = (): void => {
    const rescate = this.props.rescate;
    if (!rescate) return;
    try {
      const raw = localStorage.getItem(rescate.clave);
      if (!raw) return;
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = rescate.archivo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      // Si ni esto funciona, queda el mensaje con la clave de localStorage.
    }
  };

  /**
   * ¿Hay algo que descargar?
   *
   * Se comprueba al pintar y no al pulsar: un botón que promete rescatar tu
   * trabajo y no hace nada al pulsarlo es peor que no ofrecerlo.
   */
  private hayQueRescatar(): boolean {
    const rescate = this.props.rescate;
    if (!rescate) return false;
    try {
      return !!localStorage.getItem(rescate.clave);
    } catch {
      return false;
    }
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const rotulo = this.props.rotulo ?? 'La aplicación';
    const rescate = this.props.rescate;
    const rescatable = this.hayQueRescatar();

    return (
      <div className="m-4 max-w-2xl rounded-lg border border-red-300 bg-red-50 p-4 text-sm">
        <h2 className="text-base font-semibold text-red-900">{rotulo} se detuvo</h2>
        <p className="mt-2 text-red-900">
          Algo falló al dibujar esta vista.{' '}
          {rescatable ? (
            <>
              <strong>Tu trabajo no se ha perdido</strong>: sigue guardado en el navegador.
              Descárgalo antes de recargar.
            </>
          ) : (
            <>Lo último que hayas escrito puede no haberse guardado.</>
          )}
        </p>
        <pre className="mt-3 overflow-x-auto rounded border border-red-200 bg-white p-2 font-mono text-xs text-red-800">
          {error.message}
        </pre>
        <div className="mt-3 flex gap-2">
          {rescatable && (
            <button
              type="button"
              onClick={this.descargarRespaldo}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Descargar lo guardado
            </button>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-900 hover:bg-red-100"
          >
            Recargar
          </button>
        </div>
        {rescate && rescatable && (
          <p className="mt-3 text-xs text-red-800">
            Si al recargar vuelve a fallar, lo guardado es la causa: bórralo con{' '}
            <code className="font-mono">localStorage.removeItem('{rescate.clave}')</code> en la
            consola del navegador, después de haberlo descargado.
          </p>
        )}
      </div>
    );
  }
}
