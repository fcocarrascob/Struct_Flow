import { useMemo, useState } from 'react';
import type { MetaPlanilla } from '../../lib/biblioteca/contrato';
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

function Lista({ titulo, items }: { titulo: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{titulo}</p>
      <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-ink">
        {items.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * En lugar del esquema, lo que la genérica declara sobre su alcance. Una hoja
 * sin figura no tiene qué dibujar, pero sí qué NO calcula (las fronteras: datos
 * que entran con su origen) y qué asume sin chequear; eso es lo que hay que
 * tener a la vista mientras se tantea.
 */
function FichaBiblioteca({ meta }: { meta: MetaPlanilla }) {
  return (
    <div className="space-y-4 rounded border border-border bg-white p-4">
      {meta.normas?.length ? (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Normas</p>
          <ul className="space-y-0.5 text-[11px] text-ink">
            {meta.normas.map((nr) => (
              <li key={nr.clave}>
                <span className="font-mono">{nr.clave}</span>
                <span className="text-muted"> · {nr.rol}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Lista titulo="Fronteras — entran como dato" items={meta.fronteras} />
      <Lista titulo="Hipótesis — se asumen, no se chequean" items={meta.hipotesis} />
      {meta.entrega && Object.keys(meta.entrega).length > 0 && (
        <Lista
          titulo="Entrega a otras hojas"
          items={Object.entries(meta.entrega).map(([v, hojas]) => `${v} → ${hojas.join(', ')}`)}
        />
      )}
    </div>
  );
}

/**
 * El armazón de un módulo de diseño: formulario, esquema y resultados.
 *
 * No sabe de qué elemento se trata. Todo lo específico —qué se pide, qué se
 * enseña y qué memoria se arma— viene de la declaración del módulo, así que
 * añadir un elemento nuevo no toca esta pantalla. Tampoco distingue un módulo
 * TS de uno declarativo salvo en dos detalles: sin esquema enseña la ficha de
 * la genérica, y la memoria descargada lleva el slug de la instancia.
 */
export default function PaginaDiseno({ modulo }: Props) {
  const [entradas, setEntradas] = useState<Entradas>(modulo.porDefecto);

  /**
   * Una evaluación por render, sin aplazarla.
   *
   * Medido: `evaluateSheet` cuesta 2,9 ms sobre las ~110 regiones del módulo de
   * viga, y las genéricas de la biblioteca van de 3 a 8 ms de mediana (16 ms la
   * peor, `llave-corte-generica`, con dos bloques de programa). El canvas sí
   * aplaza (`MathCanvas`, 120 ms) porque allí una planilla con bloques de
   * programa pesados llega a segundos; acá arrastrar un deslizador con los
   * factores siguiendo al dedo vale más que ahorrar esos milisegundos. Si algún
   * módulo futuro se acerca al presupuesto de los 16 ms por cuadro, aquí es
   * donde toca aplazar.
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
            {modulo.biblioteca && (
              <p className="mt-0.5 font-mono text-[10px] text-muted">
                desde la biblioteca · {modulo.biblioteca.slug} · sha256{' '}
                {modulo.biblioteca.sha256.slice(0, 12)}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              className={botón}
              onClick={() => setEntradas(modulo.porDefecto)}
              disabled={entradas === modulo.porDefecto}
            >
              Restablecer
            </button>
            <button
              className={botón}
              onClick={() => {
                const h = hoja();
                descargarHoja(h, `${h.meta.slug ?? modulo.id}.json`);
              }}
            >
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

        <section aria-label={modulo.esquema ? 'Esquema' : 'Alcance de la hoja'}>
          {modulo.esquema ? (
            <VisorEsquema
              src={modulo.esquema}
              scope={scope}
              ancho={modulo.anchoEsquema ?? 660}
              alto={modulo.altoEsquema ?? 430}
            />
          ) : (
            modulo.biblioteca && <FichaBiblioteca meta={modulo.biblioteca.meta} />
          )}
          <p className="mt-2 text-[11px] text-muted">
            La memoria que exporta este módulo son las mismas {regions.length} regiones que se
            acaban de evaluar{modulo.esquema ? ', con este esquema dentro' : ''}. Lo que ves es lo
            que se imprime.
          </p>
        </section>

        <section aria-label="Resultados">
          <PanelResultados salidas={modulo.salidas} scope={scope} errores={errores} />
        </section>
      </div>
    </main>
  );
}
