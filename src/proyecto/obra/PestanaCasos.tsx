import { Fragment, useState } from 'react';
import type { CasoEspectro, CasoLeido, ConexionSap, Justificacion } from './modelo';
import { cifra, esJustificable, justificacionDelModelo, parteDe, verificarDelModelo } from './sap-cargas';
import { Huerfanas, Justificable, numero, SinLeer, type Justificar } from './CampoJustificacion';

/**
 * Los Load Cases del modelo: tipo, estado del análisis y lo que cada tipo tiene
 * que revisar.
 *
 * Un caso de espectro vive aquí porque el espectro ES un caso: su factor de
 * escala por dirección, su amortiguamiento y la función que usa se justifican
 * desde la obra. La combinación modal y el caso modal solo se muestran: son una
 * elección, no un número de norma. De un caso estático se justifican los
 * factores distintos de 1 (EV = 0,185 × DEAD); un 1 es el patrón tal cual.
 *
 * Los datos del espectro salen de `sap.espectro` y no de `sap.casos`: es donde
 * sus justificaciones los buscan desde antes de que existiera esta pestaña.
 */

const ESTADO: Record<string, { texto: string; clase: string }> = {
  analizado: { texto: 'analizado', clase: 'text-emerald-600' },
  'sin-analizar': { texto: 'sin analizar', clase: 'text-muted' },
  'no-empezo': { texto: 'no pudo empezar', clase: 'text-aviso' },
  incompleto: { texto: 'incompleto', clase: 'text-aviso' },
};

/** Lo que se ve de un caso sin desplegarlo. */
function detalleDe(c: CasoLeido, rs: CasoEspectro | undefined): string {
  if (rs) return rs.cargas.map((k) => `${k.dir} · ${k.funcion}`).join('; ') || 'sin direcciones';
  if (c.cargas) {
    const n = c.cargas.length;
    const sfs = new Set(c.cargas.map((k) => k.sf));
    const base = n === 1 ? '1 patrón' : `${n} patrones`;
    return sfs.size === 1 && n > 0 ? `${base} × ${numero(c.cargas[0].sf)}` : base;
  }
  if (c.modos) return `${c.modal ?? 'Modal'} · ${c.modos.min}–${c.modos.max} modos`;
  if (c.tipo === 'ResponseSpectrum') return 'sin leer el espectro';
  return 'no se detalla';
}

/** Un caso desplegado: sus patrones con su factor, o su espectro. */
function DetalleCaso({
  caso,
  rs,
  sap,
  justificar,
}: {
  caso: CasoLeido;
  rs: CasoEspectro | undefined;
  sap: ConexionSap;
  justificar: Justificar;
}) {
  if (rs) {
    return (
      <ul className="space-y-1.5 border-l border-border pl-2">
        <li className="text-[10px] text-muted">
          Combinación modal {rs.combinacion || '—'} · caso modal {rs.modal || '—'}
        </li>
        <Justificable
          que={{ clase: 'amortiguamiento', patron: rs.nombre, firma: 'amortiguamiento', valor: rs.amortiguamiento }}
          texto={
            <>
              <span className="font-mono text-ink">ξ = {cifra(rs.amortiguamiento)}</span>
              <span className="text-muted">amortiguamiento ({cifra(rs.amortiguamiento * 100)} %)</span>
            </>
          }
          etiqueta={`Expresión que justifica el amortiguamiento de ${rs.nombre}`}
          placeholder="justificar como fracción, por ejemplo xi o 0.05"
          sap={sap}
          justificar={justificar}
        />
        {rs.cargas.map((k) => (
          <Justificable
            key={k.dir}
            que={{ clase: 'factor-espectro', patron: rs.nombre, firma: k.dir, valor: k.sf }}
            texto={
              <>
                <span className="font-mono text-ink">SF {cifra(k.sf)} m/s²</span>
                <span className="text-muted">
                  {k.dir} · función {k.funcion}
                  {k.csys && k.csys.toUpperCase() !== 'GLOBAL' ? ` · ${k.csys}` : ''}
                  {k.angulo ? ` · ${cifra(k.angulo)}°` : ''}
                </span>
              </>
            }
            etiqueta={`Expresión que justifica el factor de escala de ${rs.nombre} en ${k.dir}`}
            placeholder="justificar el factor, por ejemplo SF_RSX"
            sap={sap}
            justificar={justificar}
          />
        ))}
      </ul>
    );
  }
  return (
    <ul className="space-y-1.5 border-l border-border pl-2">
      {(caso.cargas ?? []).map((k) =>
        esJustificable(k.sf) ? (
          <Justificable
            key={k.nombre}
            que={{ clase: 'factor-caso', patron: caso.nombre, firma: k.nombre, valor: k.sf }}
            texto={
              <>
                <span className="font-mono text-ink">
                  {numero(k.sf)} × {k.nombre}
                </span>
                {k.tipo !== 'Load' && <span className="text-muted">{k.tipo}</span>}
              </>
            }
            etiqueta={`Expresión que justifica el factor de ${k.nombre} en ${caso.nombre}`}
            placeholder="justificar el factor con una expresión de la obra"
            sap={sap}
            justificar={justificar}
          />
        ) : (
          <li key={k.nombre} className="text-[10px] leading-snug">
            <span className="font-mono text-muted">
              {numero(k.sf)} × {k.nombre}
            </span>
            {k.tipo !== 'Load' && <span className="ml-2 text-muted">{k.tipo}</span>}
          </li>
        ),
      )}
    </ul>
  );
}

/** Por caso: cuántos de sus datos justificables coinciden, y cuántos no. */
function estadoDe(
  caso: CasoLeido,
  rs: CasoEspectro | undefined,
  sap: ConexionSap,
  justificar: Justificar,
): { total: number; ok: number; mal: number } {
  const ques: [Justificacion['clase'], string][] = rs
    ? [['amortiguamiento', 'amortiguamiento'], ...rs.cargas.map((k) => ['factor-espectro', k.dir] as [Justificacion['clase'], string])]
    : (caso.cargas ?? []).filter((k) => esJustificable(k.sf)).map((k) => ['factor-caso', k.nombre]);
  let ok = 0;
  let mal = 0;
  for (const [clase, firma] of ques) {
    const j = justificacionDelModelo(justificar.justificaciones, clase, caso.nombre, firma);
    const v = j ? verificarDelModelo(j, sap, justificar.scope) : undefined;
    if (!v) continue;
    if (v.estado === 'coincide') ok++;
    else mal++;
  }
  return { total: ques.length, ok, mal };
}

export default function PestanaCasos({
  sap,
  justificar,
  onQuitarJustificacion,
}: {
  sap: ConexionSap;
  justificar: Justificar;
  onQuitarJustificacion: (id: string) => void;
}) {
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  const esp = sap.espectro;
  // Una obra leída antes de esta pestaña tiene el espectro y no los casos: se
  // muestran los de espectro, que es lo que había.
  const lista: CasoLeido[] =
    sap.casos?.lista ?? (esp?.casos ?? []).map((c) => ({ nombre: c.nombre, tipo: 'ResponseSpectrum', estado: '' }));
  const huerfanas = justificar.justificaciones.filter(
    (j) => parteDe(j) === 'casos' && !verificarDelModelo(j, sap, justificar.scope),
  );
  const alternar = (nombre: string) =>
    setAbiertos((a) => {
      const s = new Set(a);
      if (s.has(nombre)) s.delete(nombre);
      else s.add(nombre);
      return s;
    });
  const rango = (p: [number, number][]) =>
    p.length ? `${p.length} puntos, T de ${cifra(p[0][0])} a ${cifra(p[p.length - 1][0])} s` : 'sin puntos';

  if (!sap.casos && !esp) return <SinLeer>Los Load Cases todavía no se leyeron.</SinLeer>;

  return (
    <>
      <p className="mb-2 text-[11px] leading-snug text-muted">
        {lista.length === 1 ? '1 caso' : `${lista.length} casos`}.{' '}
        {!sap.casos && 'Solo los de espectro: vuelve a leer el modelo para ver todos. '}
        Pulsa un caso estático o de espectro para ver lo que se justifica: los factores distintos de 1, el factor de
        escala y el amortiguamiento.
      </p>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted">
            <th className="py-1 font-semibold">Nombre</th>
            <th className="font-semibold">Tipo</th>
            <th className="font-semibold">Detalle</th>
            <th className="font-semibold">Estado</th>
            <th className="text-right font-semibold" title="Datos justificados por la obra, de los que admiten justificación">
              Justif.
            </th>
          </tr>
        </thead>
        <tbody>
          {lista.map((c) => {
            const rs = esp?.casos.find((x) => x.nombre === c.nombre);
            const desplegable = !!rs || !!c.cargas?.length;
            const abierto = abiertos.has(c.nombre);
            const { total, ok, mal } = estadoDe(c, rs, sap, justificar);
            const estado = ESTADO[c.estado];
            return (
              <Fragment key={c.nombre}>
                <tr
                  onClick={desplegable ? () => alternar(c.nombre) : undefined}
                  className={`border-t border-border/60 align-baseline ${desplegable ? 'cursor-pointer hover:bg-accent/5' : ''}`}
                >
                  <td className="whitespace-nowrap py-1 pr-2 font-mono text-ink">
                    <span className="inline-block w-3 text-muted">{desplegable ? (abierto ? '▾' : '▸') : ''}</span>
                    {c.nombre}
                  </td>
                  <td className="pr-2 text-muted">{c.tipo || '—'}</td>
                  <td className="pr-2 text-muted">{detalleDe(c, rs)}</td>
                  <td className={`whitespace-nowrap pr-2 ${estado?.clase ?? 'text-muted'}`}>
                    {estado?.texto ?? (c.estado || '—')}
                  </td>
                  <td
                    className={`whitespace-nowrap text-right font-mono ${
                      mal ? 'text-error' : total && ok === total ? 'text-emerald-600' : 'text-muted'
                    }`}
                  >
                    {total ? `${ok}/${total}${mal ? ' ✗' : ''}` : '—'}
                  </td>
                </tr>
                {abierto && desplegable && (
                  <tr>
                    <td colSpan={5} className="pb-2 pl-4 pt-0.5">
                      <DetalleCaso caso={c} rs={rs} sap={sap} justificar={justificar} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {esp && esp.funciones.length > 0 && (
        <>
          <h4 className="mb-1 mt-4 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Funciones de espectro
          </h4>
          <ul className="space-y-1.5">
            {esp.funciones.map((f) => (
              <Justificable
                key={f.nombre}
                que={{ clase: 'funcion-espectro', patron: f.nombre, firma: 'funcion', valor: f.puntos.length }}
                texto={
                  <>
                    <span className="font-mono text-ink">{f.nombre}</span>
                    <span className="text-muted">{rango(f.puntos)}</span>
                  </>
                }
                etiqueta={`Función de la obra que justifica ${f.nombre}`}
                placeholder="justificar con una función de la obra, por ejemplo Sa_esp"
                sap={sap}
                justificar={justificar}
              />
            ))}
          </ul>
        </>
      )}
      <Huerfanas
        huerfanas={huerfanas}
        titulo="Justificaciones sin su caso o su función en el modelo"
        onQuitar={onQuitarJustificacion}
      />
    </>
  );
}
