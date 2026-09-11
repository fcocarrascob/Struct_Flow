import type { ReactNode } from 'react';
import { MODULOS } from '../lib/diseno/registro';
import { hayTrabajoGuardado } from '../lib/hoja-guardada';
import type { Ruta } from '../lib/ruta';
import Enlace from './Enlace';
import { useIndice } from './useIndice';

function Tarjeta({
  a,
  titulo,
  cuenta,
  children,
}: {
  a: Ruta;
  titulo: string;
  cuenta?: string;
  children: ReactNode;
}) {
  return (
    <Enlace
      a={a}
      className="group flex flex-col rounded-lg border border-border bg-white p-5 no-underline transition-colors hover:border-accent"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-ink group-hover:text-accent">{titulo}</h2>
        {cuenta && <span className="shrink-0 font-mono text-[11px] text-muted">{cuenta}</span>}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{children}</p>
    </Enlace>
  );
}

/**
 * El menú de entrada. Hasta ahora la raíz era el canvas y el corpus de
 * planillas vivía dentro de un desplegable de su barra de herramientas.
 */
export default function Landing() {
  const { indice } = useIndice();
  const continuar = hayTrabajoGuardado();
  // Los módulos TS más las genéricas promovibles, que son módulos sin código.
  const nModulos = MODULOS.length + (indice ?? []).filter((e) => e.promovible).length;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-ink">Struct_Flow</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
          Memorias de cálculo para ingeniería estructural: una hoja estilo SMath donde las
          expresiones llevan unidades y se verifica la coherencia dimensional, con módulos de
          diseño que arman la memoria por ti.
        </p>
      </header>

      {continuar && (
        <Enlace
          a={{ vista: 'canvas' }}
          className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-accent bg-accent/5 px-4 py-3 no-underline hover:bg-accent/10"
        >
          <span className="text-sm font-medium text-accent">Continuar donde ibas</span>
          <span className="text-[11px] text-muted">Tienes una hoja guardada en este navegador</span>
        </Enlace>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Tarjeta
          a={{ vista: 'planillas' }}
          titulo="Planillas"
          cuenta={indice ? `${indice.length} memorias` : undefined}
        >
          Memorias de cálculo completas y resueltas —acero, hormigón y apuntes de norma— que se
          abren en el canvas y se pueden editar, recalcular e imprimir.
        </Tarjeta>

        <Tarjeta
          a={{ vista: 'diseno' }}
          titulo="Diseño de elementos"
          cuenta={`${nModulos} ${nModulos === 1 ? 'módulo' : 'módulos'}`}
        >
          Ingresa los parámetros y mira cómo se redibuja el elemento y cómo se mueven los factores
          de utilización. Cuando cuadre, exporta la memoria con el esquema dentro.
        </Tarjeta>

        <Tarjeta a={{ vista: 'canvas' }} titulo="Canvas">
          La hoja en blanco: escribe expresiones con unidades, define variables y bloques de
          programación, e imprime el resultado paginado en A4.
        </Tarjeta>
      </div>

      <details className="mt-8 text-xs text-muted">
        <summary className="cursor-pointer font-medium text-ink">Cómo se escribe en la hoja</summary>
        <div className="mt-3 space-y-2">
          <p>
            <code>nombre := valor</code> define una variable, un <code>=</code> final muestra el
            resultado, y <code>= unidad</code> lo convierte verificando la coherencia dimensional.
            Las variables se comparten entre regiones en orden de lectura (arriba→abajo,
            izquierda→derecha), como en SMath Studio.
          </p>
          <p>
            Ejemplo: <code>f_y := 420 MPa</code>, <code>A_s := 1000 mm^2</code>,{' '}
            <code>d := 450 mm</code> y luego <code>M_n := A_s*f_y*d = kN*m</code>.
          </p>
          <p>
            <strong>Colocar bloques:</strong> el clic izquierdo <em>fija</em> el punto de inserción
            sin crear nada; desde ahí, teclea para abrir una fórmula, haz doble clic para lo mismo,
            o pulsa <strong>= Fórmula</strong>, <strong>T Texto</strong>, <strong>ƒ Programa</strong>{' '}
            o <strong>▣ Imagen</strong>. Doble clic edita una región, arrastra para moverla, Supr la
            borra. La hoja se guarda sola en el navegador.
          </p>
          <p>
            <strong>Abrir espacio:</strong> con el punto de inserción puesto, <code>Enter</code>{' '}
            mete una línea en blanco y empuja hacia abajo lo que haya debajo. Púlsalo varias veces
            para separar más. El hueco es un bloque como cualquier otro —se selecciona y se borra
            con Supr— y ocupa lo mismo en la hoja que en el PDF.
          </p>
          <p>
            <strong>Imágenes:</strong> pega una con <code>Ctrl+V</code>, arrastra el archivo a la
            hoja o elige el origen en <strong>▣ Imagen ▾</strong>. Va dentro de la hoja (se exporta
            en el JSON y sale en el PDF), así que conviene recortarla antes de pegarla.
          </p>
          <p>
            <strong>Programación:</strong> pulsa <strong>ƒ Programa</strong>. La{' '}
            <strong>indentación</strong> define el cuerpo, como en Python; <code>Enter</code> es
            nueva línea, <code>Tab</code> indenta, <code>Ctrl+Enter</code> confirma y{' '}
            <code>Esc</code> descarta lo escrito. <code>nombre :=</code> exporta el valor de{' '}
            <code>return</code> como variable;{' '}
            <code>nombre(args) :=</code> define una función llamable desde otras regiones.
          </p>
          <pre className="overflow-x-auto rounded border border-border bg-surface/60 p-2 font-mono text-ink">
{`beta1(fc) :=
    if fc <= 28
        return 0.85
    return max(0.65, 0.85 - 0.05*(fc - 28)/7)`}
          </pre>
        </div>
      </details>
    </main>
  );
}
