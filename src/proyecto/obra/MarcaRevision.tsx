import { LARGO_NOTA_REVISION, type Revision } from './modelo';

/**
 * Marcar un nodo para revisar, con la razón en una línea, y quitar la marca.
 *
 * Es a propósito lo mínimo: un botón, una nota y «Revisado». La marca la pone
 * también el asistente en lo que crea o toca; editar su nota no la hace del
 * usuario, porque lo que cuenta es quién pidió que se mirara.
 */
export default function MarcaRevision({
  valor,
  onCambiar,
}: {
  valor: Revision | undefined;
  onCambiar: (revision: Revision | undefined) => void;
}) {
  if (!valor) {
    return (
      <button
        type="button"
        onClick={() => onCambiar({ nota: '', por: 'usuario' })}
        title="Señalar un supuesto, una decisión pendiente o un dato por confirmar"
        className="rounded border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted hover:border-ink hover:text-ink"
      >
        ⚑ Marcar para revisar
      </button>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded border border-dashed border-ink/40 px-1.5 py-1 text-[11px]">
      <span className="shrink-0 font-medium text-ink">
        ⚑ Revisar{valor.por === 'asistente' ? ' · asistente' : ''}
      </span>
      <input
        type="text"
        value={valor.nota}
        maxLength={LARGO_NOTA_REVISION}
        autoFocus={valor.por === 'usuario' && !valor.nota}
        onChange={(e) => onCambiar({ ...valor, nota: e.target.value })}
        placeholder="Por qué: supuesto, decisión pendiente, dato por confirmar…"
        aria-label="Razón de la revisión"
        className="min-w-0 flex-1 rounded border border-border bg-white px-1.5 py-0.5 text-ink outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={() => onCambiar(undefined)}
        title="Quitar la marca: ya se revisó"
        className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
      >
        Revisado ✓
      </button>
    </div>
  );
}
