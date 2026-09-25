import { Fragment, useState } from 'react';
import type { CargaAsignada, LecturaCargas, LecturaPatrones } from './modelo';
import {
  cargaDe,
  cargasPorPatron,
  comoDe,
  esDelModelo,
  justificacionDe,
  objetosDe,
  valorDe,
  verificar,
} from './sap-cargas';
import { CampoJustificacion, Huerfanas, numero, SinLeer, type Justificar } from './CampoJustificacion';

/**
 * Una carga del modelo y la expresión de la obra que la respalda.
 *
 * Se escribe en el campo y se aplica al salir de él, como un campo atado: una
 * expresión a medio escribir no tiene nada que verificar.
 */
function CargaJustificable({
  carga,
  todas,
  justificar,
}: {
  carga: CargaAsignada;
  todas: readonly CargaAsignada[];
  justificar: Justificar;
}) {
  const j = justificacionDe(carga, todas, justificar.justificaciones);
  const v = j ? verificar(j.expr, carga, justificar.scope, justificar.unidades) : undefined;
  return (
    <li className="text-[10px] leading-snug">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-ink">{valorDe(carga, justificar.unidades)}</span>
        <span className="text-muted">{comoDe(carga)}</span>
        <span className="ml-auto whitespace-nowrap text-muted">{objetosDe(carga)}</span>
      </div>
      <CampoJustificacion
        j={j}
        v={v}
        etiqueta={`Expresión que justifica ${valorDe(carga, justificar.unidades)} de ${carga.patron}`}
        placeholder="justificar con una expresión de la obra"
        justificar={justificar}
        onCambiar={(expr) => justificar.onJustificar(carga, expr, j)}
      />
    </li>
  );
}

/** Las cargas de un patrón, una fila por valor distinto. */
function CargasDelPatron({
  cargas,
  todas,
  justificar,
}: {
  cargas: readonly CargaAsignada[];
  todas: readonly CargaAsignada[];
  justificar: Justificar;
}) {
  return (
    <tr>
      <td colSpan={4} className="pb-2 pl-4 pt-0.5">
        <ul className="space-y-1.5 border-l border-border pl-2">
          {cargas.map((c, i) => (
            <CargaJustificable key={i} carga={c} todas={todas} justificar={justificar} />
          ))}
        </ul>
      </td>
    </tr>
  );
}

/**
 * Los Load Patterns del modelo, tal como están: nombre, tipo, multiplicador de
 * peso propio (SWF) y las cargas que tiene asignadas. Solo se listan; se definen
 * y se corrigen en SAP.
 */
export default function PestanaPatrones({
  lectura,
  cargas,
  justificar,
  onQuitarJustificacion,
}: {
  lectura: LecturaPatrones | undefined;
  cargas: LecturaCargas | undefined;
  justificar: Justificar;
  onQuitarJustificacion: (id: string) => void;
}) {
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  const todas = cargas?.lista ?? [];
  const porPatron = cargasPorPatron(todas);
  const huerfanas = justificar.justificaciones.filter((j) => !esDelModelo(j) && !cargaDe(j, todas));
  /** Por patrón: cuántas cargas coinciden y si alguna no. */
  const estadoDe = (suyas: readonly CargaAsignada[]) => {
    let ok = 0;
    let mal = 0;
    for (const c of suyas) {
      const j = justificacionDe(c, todas, justificar.justificaciones);
      if (!j) continue;
      if (verificar(j.expr, c, justificar.scope).estado === 'coincide') ok++;
      else mal++;
    }
    return { ok, mal };
  };
  const alternar = (nombre: string) =>
    setAbiertos((a) => {
      const s = new Set(a);
      if (s.has(nombre)) s.delete(nombre);
      else s.add(nombre);
      return s;
    });

  if (!lectura) return <SinLeer>Los Load Patterns todavía no se leyeron.</SinLeer>;

  return (
    <>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[11px] leading-snug text-muted">
          {lectura.lista.length === 1 ? '1 patrón' : `${lectura.lista.length} patrones`}.{' '}
          {cargas
            ? `Pulsa un patrón para ver sus cargas asignadas (en ${justificar.unidades}, m y °C).`
            : 'Las cargas asignadas no se pudieron leer.'}
        </p>
        {/* Solo cambia cómo se muestran: se lee, se guarda y se compara en kN. */}
        <div
          role="group"
          aria-label="Unidades en que se muestran las cargas"
          title="Cómo se muestran las cargas del modelo. Se leen y se comparan siempre en kN."
          className="flex shrink-0 overflow-hidden rounded border border-border text-[11px]"
        >
          {(['kN', 'tonf'] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={justificar.unidades === u}
              onClick={() => justificar.onUnidades(u)}
              className={`px-2 py-0.5 ${justificar.unidades === u ? 'bg-accent text-white' : 'text-muted hover:text-accent'}`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {lectura.lista.length > 0 && (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted">
              <th className="py-1 font-semibold">Nombre</th>
              <th className="font-semibold">Tipo</th>
              <th className="text-right font-semibold" title="Multiplicador de peso propio (self weight multiplier)">
                SWF
              </th>
              <th className="text-right font-semibold" title="Cargas justificadas por la obra, de las distintas que tiene el patrón">
                Justif.
              </th>
            </tr>
          </thead>
          <tbody>
            {lectura.lista.map((p) => {
              const suyas = porPatron.get(p.nombre) ?? [];
              const abierto = abiertos.has(p.nombre);
              const objetos = suyas.reduce((s, c) => s + c.n, 0);
              const { ok, mal } = estadoDe(suyas);
              return (
                <Fragment key={p.nombre}>
                  <tr
                    onClick={suyas.length ? () => alternar(p.nombre) : undefined}
                    className={`border-t border-border/60 ${suyas.length ? 'cursor-pointer hover:bg-accent/5' : ''}`}
                  >
                    <td className="py-1 pr-2 font-mono text-ink">
                      <span className="inline-block w-3 text-muted">{suyas.length ? (abierto ? '▾' : '▸') : ''}</span>
                      {p.nombre}
                    </td>
                    <td className="pr-2 text-muted">{p.tipo || '—'}</td>
                    <td className="text-right font-mono text-muted">{numero(p.pesoPropio)}</td>
                    <td
                      className={`whitespace-nowrap text-right font-mono ${
                        mal ? 'text-error' : suyas.length && ok === suyas.length ? 'text-emerald-600' : 'text-muted'
                      }`}
                      title={
                        suyas.length
                          ? `${suyas.length} carga(s) distinta(s) en ${objetos} objeto(s); ${ok} justificada(s)` +
                            (mal ? `, ${mal} que no coincide(n)` : '')
                          : undefined
                      }
                    >
                      {!cargas ? '' : suyas.length ? `${ok}/${suyas.length}${mal ? ' ✗' : ''}` : '—'}
                    </td>
                  </tr>
                  {abierto && suyas.length > 0 && <CargasDelPatron cargas={suyas} todas={todas} justificar={justificar} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      {cargas && (
        <Huerfanas
          huerfanas={huerfanas}
          titulo="Justificaciones sin su carga en el modelo"
          onQuitar={onQuitarJustificacion}
        />
      )}
    </>
  );
}
