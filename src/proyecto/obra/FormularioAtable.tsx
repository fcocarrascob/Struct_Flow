import { useState } from 'react';
import { normalizarOpciones, type CampoDef, type Entradas } from '../../lib/diseno/tipos';
import type { CampoResuelto } from './biblioteca';
import { mensajeDeMotor } from '../../components/canvas/mensajes-motor';
import { concurrenteEn, puertosCompatibles } from './puertos';

/**
 * El formulario de una genérica dentro de una obra, donde cada campo puede ser
 * un número o una expresión.
 *
 * NO es `components/diseno/FormularioEntradas`, y no lo reutiliza, porque aquel
 * tiene un contrato que aquí no se cumple: todos sus valores son `number` y su
 * única salida es `onCambio(nombre, número)`. Un campo atado no tiene número
 * propio —lo tiene la obra— y necesita un segundo canal. Cambiar el compartido
 * para que acepte expresiones metería el grafo de la obra dentro de
 * `/diseno/<slug>`, que no tiene grafo ninguno.
 *
 * Lo que sí se comparte es lo que importa: `CampoDef` —la declaración de la
 * genérica—, `normalizarOpciones` y el mismo aspecto de campo.
 *
 * El patrón de BORRADOR es el de aquel, y no es un adorno: sin él, borrar el
 * último dígito de «4» escribe 0 en el modelo y el input revierte a «0» en el
 * acto, así que no se puede teclear «45».
 */

const CAMPO =
  'w-full rounded border bg-white px-2 py-1 text-xs text-ink outline-none focus:border-accent';

function acotar(v: number, campo: CampoDef): number {
  let n = v;
  if (campo.min !== undefined) n = Math.max(campo.min, n);
  if (campo.max !== undefined) n = Math.min(campo.max, n);
  return n;
}

export default function FormularioAtable({
  campos,
  valores,
  formulas,
  resueltos,
  scope,
  onValor,
  onFormula,
}: {
  /**
   * Lo que la obra deja ver en la posición del nodo: de ahí salen los nombres que
   * se ofrecen al atar (los de dimensión compatible) y la marca ≠ de una
   * gobernante no concurrente (`puertos.ts`).
   */
  scope?: Record<string, unknown>;
  campos: CampoDef[];
  /** Los valores efectivos, ya con lo que resolvió cada campo atado. */
  valores: Entradas;
  formulas: Record<string, string>;
  resueltos: Record<string, CampoResuelto>;
  onValor: (nombre: string, valor: number) => void;
  /** `undefined` desata el campo y devuelve su número. */
  onFormula: (nombre: string, expr: string | undefined) => void;
}) {
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  // Las sugerencias solo del campo que se escribe: una lista por campo atado serían
  // miles de opciones en el DOM.
  const [enfocado, setEnfocado] = useState<string | null>(null);

  const grupos: { nombre: string; campos: CampoDef[] }[] = [];
  for (const c of campos) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.nombre === c.grupo) ultimo.campos.push(c);
    else grupos.push({ nombre: c.grupo, campos: [c] });
  }

  function confirmar(campo: CampoDef) {
    const crudo = borradores[campo.nombre];
    if (crudo !== undefined) {
      const n = Number(crudo);
      if (crudo.trim() !== '' && Number.isFinite(n)) onValor(campo.nombre, acotar(n, campo));
      setBorradores((b) => {
        const { [campo.nombre]: _fuera, ...resto } = b;
        return resto;
      });
    }
  }

  return (
    <div className="space-y-3">
      {grupos.map((g, i) => (
        <fieldset key={`${g.nombre}-${i}`}>
          <legend className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {g.nombre}
          </legend>
          <div className="space-y-2">
            {g.campos.map((campo) => {
              const atado = formulas[campo.nombre] !== undefined;
              const r = resueltos[campo.nombre];
              const id = `campo-${campo.nombre}`;
              return (
                <div key={campo.nombre}>
                  <div className="flex items-baseline justify-between gap-2">
                    <label htmlFor={id} className="text-xs text-ink">
                      {campo.etiqueta}
                    </label>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {campo.unidad && (
                        <span className="font-mono text-[10px] text-muted">{campo.unidad}</span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          onFormula(campo.nombre, atado ? undefined : String(valores[campo.nombre] ?? ''))
                        }
                        title={
                          atado
                            ? 'Desatar: volver al número'
                            : 'Atar a una expresión de la obra (ƒ)'
                        }
                        aria-pressed={atado}
                        className={`rounded border px-1 text-[10px] leading-4 ${
                          atado
                            ? 'border-accent bg-accent text-white'
                            : 'border-border text-muted hover:border-accent hover:text-accent'
                        }`}
                      >
                        ƒ
                      </button>
                    </span>
                  </div>

                  {atado ? (
                    <>
                      <input
                        id={id}
                        type="text"
                        spellCheck={false}
                        value={formulas[campo.nombre]}
                        onChange={(e) => onFormula(campo.nombre, e.target.value)}
                        onFocus={() => setEnfocado(campo.nombre)}
                        onBlur={() => setEnfocado((x) => (x === campo.nombre ? null : x))}
                        list={scope && enfocado === campo.nombre ? `${id}-puertos` : undefined}
                        placeholder="CM_losa * A_planta"
                        className={`${CAMPO} mt-0.5 font-mono ${
                          r?.error ? 'border-error' : 'border-accent'
                        }`}
                      />
                      {scope && enfocado === campo.nombre && (
                        <datalist id={`${id}-puertos`}>
                          {puertosCompatibles(scope, campo.unidad).map((p) => (
                            <option key={p.nombre} value={p.nombre}>
                              {`${p.texto}${p.concurrente === false ? ' · ≠ no concurrente' : ''}`}
                            </option>
                          ))}
                        </datalist>
                      )}
                      {scope && concurrenteEn(formulas[campo.nombre].trim(), scope) === false && (
                        <p className="mt-0.5 text-[10px] leading-snug text-aviso" title="nc = 1 en el nodo de apoyos">
                          ≠ No concurrente: sale de una envolvente o un espectro, y su M, N y V no son de un mismo
                          instante.
                        </p>
                      )}
                      <p
                        className={`mt-0.5 text-[10px] leading-snug ${
                          r?.error ? 'text-error' : 'text-muted'
                        }`}
                      >
                        {(r?.error && mensajeDeMotor(r.error)) ??
                          `= ${String(r?.valor ?? valores[campo.nombre] ?? '—').replace('.', ',')}${
                            campo.unidad ? ` ${campo.unidad}` : ''
                          }`}
                      </p>
                    </>
                  ) : campo.opciones ? (
                    <select
                      id={id}
                      value={valores[campo.nombre] ?? ''}
                      onChange={(e) => onValor(campo.nombre, Number(e.target.value))}
                      className={`${CAMPO} mt-0.5 border-border`}
                    >
                      {normalizarOpciones(campo.opciones).map((o) => (
                        <option key={o.valor} value={o.valor}>
                          {o.etiqueta}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      type="number"
                      inputMode="decimal"
                      min={campo.min}
                      max={campo.max}
                      step={campo.paso}
                      value={borradores[campo.nombre] ?? String(valores[campo.nombre] ?? '')}
                      onChange={(e) =>
                        setBorradores((b) => ({ ...b, [campo.nombre]: e.target.value }))
                      }
                      onBlur={() => confirmar(campo)}
                      className={`${CAMPO} mt-0.5 border-border font-mono`}
                    />
                  )}

                  {campo.ayuda && !atado && (
                    <p className="mt-0.5 text-[10px] leading-snug text-muted">{campo.ayuda}</p>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
