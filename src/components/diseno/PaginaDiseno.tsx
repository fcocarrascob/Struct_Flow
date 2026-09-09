import { useMemo, useState } from 'react';
import type { Entradas, ModuloDiseno } from '../../lib/diseno/tipos';
import { evaluarModulo, hojaDeModulo } from '../../lib/diseno/evaluar';
import { abrirEnCanvas, descargarHoja } from '../../lib/canvas-handoff';
import Enlace from '../Enlace';
import FormularioEntradas from './FormularioEntradas';
import PanelResultados from './PanelResultados';
import VisorEsquema from './VisorEsquema';

interface Props {
  modulo: ModuloDiseno<Entradas>;
}

const botón =
  'rounded border border-border bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent disabled:opacity-40';

/**
 * El armazón de un módulo de diseño: formulario, esquema y resultados.
 *
 * No sabe de qué elemento se trata. Todo lo específico —qué se pide, qué se
 * enseña y qué memoria se arma— viene de la declaración del módulo, así que
 * añadir un elemento nuevo no toca esta pantalla.
 */
export default function PaginaDiseno({ modulo }: Props) {
  const [entradas, setEntradas] = useState<Entradas>(modulo.porDefecto);

  /**
   * Una evaluación por render, sin aplazarla.
   *
   * Medido sobre este módulo: `evaluateSheet` cuesta 2,9 ms sobre sus ~110
   * regiones. El canvas sí aplaza (`MathCanvas`, 120 ms) porque allí una
   * planilla con bloques de programa pesados llega a segundos; acá no hay
   * ninguno, y arrastrar un deslizador con la figura siguiendo al dedo vale
   * más que ahorrar esos milisegundos. Si algún módulo futuro se acerca al
   * presupuesto de los 16 ms por cuadro, aquí es donde toca aplazar.
   */
  const evaluacion = useMemo(() => evaluarModulo(modulo, entradas), [modulo, entradas]);
  const { scope, errores, regions } = evaluacion;

  const hoja = () => hojaDeModulo(modulo, evaluacion);

  const cambiar = (nombre: string, valor: number) =>
    setEntradas((e) => (e[nombre] === valor ? e : { ...e, [nombre]: valor }));

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6">
      <header className="mb-5">
        <nav className="mb-2 text-xs text-muted">
          <Enlace a={{ vista: 'inicio' }} className="hover:text-accent">
            Inicio
          </Enlace>
          {' / '}
          <Enlace a={{ vista: 'diseno' }} className="hover:text-accent">
            Diseño de elementos
          </Enlace>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-ink">{modulo.titulo}</h1>
            <p className="text-xs text-muted">{modulo.norma}</p>
          </div>
          <div className="flex gap-2">
            <button
              className={botón}
              onClick={() => setEntradas(modulo.porDefecto)}
              disabled={entradas === modulo.porDefecto}
            >
              Restablecer
            </button>
            <button className={botón} onClick={() => descargarHoja(hoja(), `${modulo.id}.json`)}>
              Descargar .json
            </button>
            <button
              className="rounded border border-accent bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              onClick={() => abrirEnCanvas(hoja())}
            >
              Abrir la memoria en el canvas
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)_20rem]">
        <section aria-label="Parámetros de diseño">
          <FormularioEntradas campos={modulo.entradas} valores={entradas} onCambio={cambiar} />
        </section>

        <section aria-label="Esquema">
          <VisorEsquema
            src={modulo.esquema}
            scope={scope}
            ancho={modulo.anchoEsquema}
            alto={modulo.altoEsquema}
          />
          <p className="mt-2 text-[11px] text-muted">
            La memoria que exporta este módulo son las mismas {regions.length} regiones que se
            acaban de evaluar, con este esquema dentro. Lo que ves es lo que se imprime.
          </p>
        </section>

        <section aria-label="Resultados">
          <PanelResultados salidas={modulo.salidas} scope={scope} errores={errores} />
        </section>
      </div>
    </main>
  );
}
