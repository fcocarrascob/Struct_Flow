import MathCanvas from './components/canvas/MathCanvas';

/**
 * El chrome de la aplicación: el encabezado y la ayuda que en struct_pad vivían
 * en `src/pages/herramientas/canvas.astro`. Aquí el canvas es la raíz, así que
 * no hay navegación de sitio que envolver.
 */
export default function App() {
  return (
    <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-8">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-ink">Canvas matemático</h1>
        <p className="mt-1 text-sm text-muted">
          Haz clic en la hoja para fijar el punto de inserción y escribe una expresión:{' '}
          <code>nombre := valor</code> define una variable, un <code>=</code> final muestra el
          resultado, y <code>= unidad</code> lo convierte verificando la coherencia
          dimensional. Las variables se comparten entre regiones en orden de lectura
          (arriba→abajo), como en SMath Studio.
        </p>
      </header>

      <div className="h-[70vh] w-full overflow-hidden rounded-lg border border-border bg-white">
        <MathCanvas />
      </div>

      <p className="mt-3 text-xs text-muted">
        Ejemplo: <code>fy := 420 MPa</code>, <code>As := 1000 mm^2</code>,{' '}
        <code>d := 450 mm</code> y luego <code>Mn := As*fy*d = kN*m</code>. Doble clic edita
        una región, arrastra para moverla, Supr la borra. La hoja se guarda automáticamente
        en el navegador.
      </p>
      <p className="mt-2 text-xs text-muted">
        <strong>Colocar bloques:</strong> el clic izquierdo <em>fija</em> el punto de
        inserción (la barra parpadeante) sin crear nada; desde ahí, teclea para abrir una
        fórmula, haz doble clic para lo mismo, o pulsa <strong>= Fórmula</strong>,{' '}
        <strong>T Texto</strong>, <strong>ƒ Programa</strong> o <strong>▣ Imagen</strong>.
        Pulsar el mismo botón dos veces encadena bloques en columna.
      </p>
      <p className="mt-2 text-xs text-muted">
        <strong>Imágenes:</strong> pega una con <code>Ctrl+V</code>, arrastra el archivo a la
        hoja o elige el origen en <strong>▣ Imagen ▾</strong> (portapapeles o archivo). Se
        coloca donde pinchaste por última vez y se redimensiona desde el tirador de la
        esquina, manteniendo la proporción. Va dentro de la hoja (se exporta en el JSON y
        sale en el PDF), así que se reescala al entrar; aun así, conviene recortarla antes
        de pegarla.
      </p>

      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer font-medium text-ink">
          Programación: bucles, condicionales y funciones
        </summary>
        <div className="mt-2 space-y-2">
          <p>
            Pulsa <strong>ƒ Programa</strong> y haz clic en la hoja para crear un bloque. La{' '}
            <strong>indentación</strong> (sangría) define el cuerpo, como en Python. En el
            editor: <code>Enter</code> = nueva línea, <code>Tab</code> = indentar,{' '}
            <code>Esc</code> o <code>Ctrl+Enter</code> = confirmar.
          </p>
          <p>
            <code>nombre :=</code> exporta el valor de <code>return</code> como variable
            reutilizable; <code>nombre(args) :=</code> define una función llamable desde
            otras regiones. Usa los botones del grupo <em>Programación</em> de la paleta para
            insertar bloques ya armados (reemplaza los marcadores <code>cond</code>,{' '}
            <code>expr</code>, <code>1:n</code>).
          </p>
          <pre className="overflow-x-auto rounded border border-border bg-surface/60 p-2 font-mono text-ink">
{`beta1(fc) :=
    if fc <= 28
        return 0.85
    return max(0.65, 0.85 - 0.05*(fc - 28)/7)`}
          </pre>
          <p>
            Luego, en otra región: <code>beta1(35) =</code> → <code>0.8</code>.
          </p>
        </div>
      </details>
    </main>
  );
}
