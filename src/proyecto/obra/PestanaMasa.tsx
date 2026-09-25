import type { ConexionSap } from './modelo';
import { esJustificable, parteDe, verificarDelModelo } from './sap-cargas';
import { Huerfanas, Justificable, numero, SinLeer, type Justificar } from './CampoJustificacion';

/**
 * La masa sísmica: de dónde toma la masa cada fuente del modelo y con qué
 * factor toma cada patrón.
 *
 * Se justifican los factores distintos de 1, que son los de norma (S × 0,5 en
 * el Pachón); un 1 es el patrón tal cual. Que la fuente tome o no el peso propio
 * de los elementos y las masas asignadas solo se muestra: se revisa, no se
 * calcula.
 */
export default function PestanaMasa({
  sap,
  justificar,
  onQuitarJustificacion,
}: {
  sap: ConexionSap;
  justificar: Justificar;
  onQuitarJustificacion: (id: string) => void;
}) {
  const masa = sap.masa;
  if (!masa) return <SinLeer>La masa sísmica todavía no se leyó.</SinLeer>;
  const huerfanas = justificar.justificaciones.filter(
    (j) => parteDe(j) === 'masa' && !verificarDelModelo(j, sap, justificar.scope),
  );

  return (
    <>
      {masa.fuentes.length === 0 && (
        <p className="text-[11px] leading-snug text-muted">El modelo no tiene fuentes de masa.</p>
      )}
      <div className="space-y-4">
        {masa.fuentes.map((f) => {
          const toma = [f.deElementos && 'peso propio de los elementos', f.deMasas && 'masas asignadas', f.deCargas && 'patrones de carga'].filter(
            Boolean,
          );
          return (
            <section key={f.nombre}>
              <p className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
                <span className="font-mono font-semibold text-ink">{f.nombre}</span>
                {f.porDefecto && <span className="text-muted">(la que se usa por defecto)</span>}
              </p>
              <p className="mb-1.5 text-[11px] leading-snug text-muted">
                Toma la masa de: {toma.length ? toma.join(', ') : 'nada'}.
              </p>
              {f.deCargas && (
                <ul className="space-y-1.5 border-l border-border pl-2">
                  {f.cargas.map((k) =>
                    esJustificable(k.sf) ? (
                      <Justificable
                        key={k.patron}
                        que={{ clase: 'factor-masa', patron: f.nombre, firma: k.patron, valor: k.sf }}
                        texto={
                          <span className="font-mono text-ink">
                            {numero(k.sf)} × {k.patron}
                          </span>
                        }
                        etiqueta={`Expresión que justifica el factor de masa de ${k.patron} en ${f.nombre}`}
                        placeholder="justificar el factor con una expresión de la obra"
                        sap={sap}
                        justificar={justificar}
                      />
                    ) : (
                      <li key={k.patron} className="font-mono text-[10px] leading-snug text-muted">
                        {numero(k.sf)} × {k.patron}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <Huerfanas
        huerfanas={huerfanas}
        titulo="Justificaciones sin su fuente o su patrón en el modelo"
        onQuitar={onQuitarJustificacion}
      />
    </>
  );
}
