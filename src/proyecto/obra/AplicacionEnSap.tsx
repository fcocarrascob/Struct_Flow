import { DIRECCIONES_SAP, type AplicacionSap, type GrupoSap } from './modelo';
import { numero, type FilaAplicacion } from './sap';

/**
 * Dónde va una partida en el modelo de SAP2000: qué carga, sobre qué grupo y en
 * qué dirección. El valor no se escribe: es el de la partida, y acá se muestra
 * ya convertido a la unidad de SAP, o el motivo por el que no se puede.
 *
 * Una partida, un grupo: cada componente (cubierta, muro, carrilera) es su
 * propia partida, así la memoria y el modelo se leen con la misma división.
 */
export default function AplicacionEnSap({
  valor,
  grupos,
  fila,
  onCambiar,
}: {
  valor: AplicacionSap | undefined;
  /** Los grupos leídos del modelo, si se leyeron. Se puede escribir otro. */
  grupos: readonly GrupoSap[] | undefined;
  fila: FilaAplicacion | undefined;
  onCambiar: (a: AplicacionSap | undefined) => void;
}) {
  const CAMPO =
    'rounded border border-border bg-white px-1.5 py-0.5 text-[11px] text-ink outline-none focus:border-accent';
  const tipo = valor?.tipo ?? '';
  const cambiar = (c: Partial<AplicacionSap>) =>
    valor && onCambiar({ ...valor, ...c } as AplicacionSap);
  const idLista = 'grupos-sap';

  return (
    <div className="rounded border border-border px-2 py-1.5 text-[11px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-ink">Aplicación en SAP</span>
        <select
          value={tipo}
          onChange={(e) => {
            const t = e.target.value as AplicacionSap['tipo'] | '';
            if (!t) return onCambiar(undefined);
            onCambiar({
              tipo: t,
              grupo: valor?.grupo ?? '',
              direccion: valor?.direccion ?? 10,
              ...(t === 'area-a-barras' ? { distribucion: valor?.distribucion ?? 1 } : {}),
            });
          }}
          aria-label="Tipo de carga en SAP"
          className={CAMPO}
        >
          <option value="">— no se aplica</option>
          <option value="area-a-barras">área repartida a barras</option>
          <option value="barra-distribuida">distribuida en barra</option>
        </select>
      </div>

      {valor && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1 text-muted">
            grupo
            <input
              type="text"
              list={idLista}
              value={valor.grupo}
              onChange={(e) => cambiar({ grupo: e.target.value })}
              placeholder="CUBIERTA"
              aria-label="Grupo de SAP"
              className={`${CAMPO} w-32 font-mono`}
            />
            <datalist id={idLista}>
              {(grupos ?? []).map((g) => (
                <option key={g.nombre} value={g.nombre}>
                  {`${g.areas} áreas · ${g.barras} barras`}
                </option>
              ))}
            </datalist>
          </label>
          <select
            value={valor.direccion}
            onChange={(e) => cambiar({ direccion: Number(e.target.value) })}
            aria-label="Dirección"
            className={CAMPO}
          >
            {DIRECCIONES_SAP.map((d) => (
              <option key={d.codigo} value={d.codigo}>
                {d.texto}
              </option>
            ))}
          </select>
          {valor.tipo === 'area-a-barras' && (
            <select
              value={valor.distribucion ?? 1}
              onChange={(e) => cambiar({ distribucion: Number(e.target.value) === 2 ? 2 : 1 })}
              aria-label="Distribución a las barras"
              className={CAMPO}
            >
              <option value={1}>en una dirección</option>
              <option value={2}>en dos direcciones</option>
            </select>
          )}
        </div>
      )}

      {valor && fila && (
        <p className={`mt-1 font-mono text-[10px] ${fila.error ? 'text-error' : 'text-muted'}`}>
          {fila.error ?? `valor en SAP: ${numero(Number(fila.valor!.toPrecision(6)))} ${fila.unidad.replace('^2', '²')}`}
        </p>
      )}
      {valor && !valor.grupo.trim() && <p className="mt-1 text-[10px] text-aviso">Falta el grupo.</p>}
    </div>
  );
}
