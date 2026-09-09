import { useMemo, useState } from 'react';
import type { CampoDef, Entradas } from '../../lib/diseno/tipos';

interface Props {
  campos: CampoDef[];
  valores: Entradas;
  onCambio: (nombre: string, valor: number) => void;
}

/** Ordena los campos por grupo conservando el orden en que los declaró el módulo. */
function porGrupos(campos: CampoDef[]): [string, CampoDef[]][] {
  const grupos = new Map<string, CampoDef[]>();
  for (const c of campos) {
    const lista = grupos.get(c.grupo) ?? [];
    lista.push(c);
    grupos.set(c.grupo, lista);
  }
  return [...grupos.entries()];
}

const acotar = (v: number, c: CampoDef) =>
  Math.min(c.max ?? Infinity, Math.max(c.min ?? -Infinity, v));

/**
 * El formulario de un módulo, generado a partir de su declaración de entradas.
 * No sabe nada de vigas ni de hormigón: eso es todo lo que hace falta para que
 * el elemento siguiente no cueste una pantalla nueva.
 */
export default function FormularioEntradas({ campos, valores, onCambio }: Props) {
  /**
   * Lo que hay escrito en un campo mientras se escribe. Sin esto no se puede
   * borrar el último dígito para teclear otro número: el input volvería a
   * pintar el valor anterior en cuanto la cadena deja de parsear.
   */
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  const grupos = useMemo(() => porGrupos(campos), [campos]);

  function escribir(campo: CampoDef, texto: string) {
    setBorradores((b) => ({ ...b, [campo.nombre]: texto }));
    const v = Number(texto);
    if (texto.trim() !== '' && Number.isFinite(v)) onCambio(campo.nombre, v);
  }

  function confirmar(campo: CampoDef) {
    // Al salir del campo se acota al rango declarado y se descarta el borrador,
    // de modo que lo que se ve vuelve a ser exactamente lo que se calcula.
    const actual = valores[campo.nombre];
    const acotado = acotar(actual, campo);
    if (acotado !== actual) onCambio(campo.nombre, acotado);
    setBorradores((b) => {
      const { [campo.nombre]: _, ...resto } = b;
      return resto;
    });
  }

  return (
    <div className="space-y-4">
      {grupos.map(([grupo, lista]) => (
        <fieldset key={grupo}>
          <legend className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {grupo}
          </legend>
          <div className="space-y-2.5">
            {lista.map((campo) => {
              const valor = valores[campo.nombre];
              const texto = borradores[campo.nombre] ?? String(valor);
              const id = `campo-${campo.nombre}`;
              return (
                <div key={campo.nombre}>
                  <label htmlFor={id} className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-ink" title={campo.ayuda}>
                      {campo.etiqueta}
                    </span>
                    {campo.unidad && (
                      <span className="font-mono text-[10px] text-muted">{campo.unidad}</span>
                    )}
                  </label>

                  {campo.opciones ? (
                    <select
                      id={id}
                      value={valor}
                      onChange={(e) => onCambio(campo.nombre, Number(e.target.value))}
                      className="mt-1 w-full rounded border border-border bg-white px-2 py-1 font-mono text-xs text-ink outline-none focus:border-accent"
                    >
                      {campo.opciones.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        id={id}
                        type="number"
                        inputMode="decimal"
                        value={texto}
                        min={campo.min}
                        max={campo.max}
                        step={campo.paso}
                        onChange={(e) => escribir(campo, e.target.value)}
                        onBlur={() => confirmar(campo)}
                        className="w-24 rounded border border-border bg-white px-2 py-1 font-mono text-xs text-ink outline-none focus:border-accent"
                      />
                      {campo.min !== undefined && campo.max !== undefined && (
                        // El deslizador es lo que convierte esto en un tanteo:
                        // arrastrarlo redibuja la sección y mueve los factores
                        // de utilización mientras se mira.
                        <input
                          type="range"
                          aria-label={`${campo.etiqueta} (deslizador)`}
                          value={valor}
                          min={campo.min}
                          max={campo.max}
                          step={campo.paso ?? 1}
                          onChange={(e) => onCambio(campo.nombre, Number(e.target.value))}
                          className="min-w-0 flex-1 accent-accent"
                        />
                      )}
                    </div>
                  )}

                  {campo.ayuda && <p className="mt-0.5 text-[10px] text-muted">{campo.ayuda}</p>}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
