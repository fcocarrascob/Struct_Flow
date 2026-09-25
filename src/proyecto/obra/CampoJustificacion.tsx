import type { ReactNode } from 'react';
import type { CargaAsignada, ConexionSap, Justificacion, SistemaUnidades } from './modelo';
import { cifra, justificacionDelModelo, verificarDelModelo, type Verificacion } from './sap-cargas';
import { simbolosDeFormula } from '../../lib/worksheet';

/** Lo que hace falta para justificar: la obra, sus justificaciones y el gesto. */
export interface Justificar {
  scope: Record<string, unknown>;
  justificaciones: readonly Justificacion[];
  /** En qué se muestran las cargas del modelo. Solo presentación. */
  unidades: SistemaUnidades;
  onUnidades: (u: SistemaUnidades) => void;
  /** Si algún nodo de la obra define ese nombre. */
  puedeIrA: (nombre: string) => boolean;
  /** Abre la hoja del nodo que lo define, en el bloque que lo calcula. */
  onIrA: (nombre: string) => void;
  /** Ata la carga a la expresión, o la desata con `undefined`. `actual` es la
   *  justificación que ya tenía, si la tenía. */
  onJustificar: (carga: CargaAsignada, expr: string | undefined, actual: Justificacion | undefined) => void;
  /** Lo mismo para un dato del modelo —espectro, caso, masa—: `que` dice qué se
   *  ata, con los campos de la justificación que lo identifican. */
  onJustificarModelo: (
    que: Pick<Justificacion, 'clase' | 'patron' | 'firma' | 'valor'>,
    expr: string | undefined,
    actual: Justificacion | undefined,
  ) => void;
}

/** Cómo se lee un multiplicador: `1,3`, no `1.3`. */
export const numero = (n: number): string => String(n).replace('.', ',');

/**
 * Un campo para escribir la expresión que respalda algo del modelo, con su
 * veredicto debajo. Se aplica al salir del campo o con Enter, como un campo
 * atado: una expresión a medio escribir no tiene nada que verificar.
 */
export function CampoJustificacion({
  j,
  v,
  etiqueta,
  placeholder,
  justificar,
  onCambiar,
}: {
  j: Justificacion | undefined;
  v: Verificacion | undefined;
  etiqueta: string;
  placeholder: string;
  justificar: Justificar;
  onCambiar: (expr: string | undefined) => void;
}) {
  // Los nombres de la obra que la expresión usa, cada uno con su enlace a la
  // hoja que lo calcula: cuando no coincide con el modelo, lo siguiente es ver
  // de dónde salió el número. `simbolosDeFormula` es el único lector de nombres.
  const nombres = j ? simbolosDeFormula(j.expr).filter(justificar.puedeIrA) : [];
  return (
    <>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span
          className={`w-3 shrink-0 text-center ${!v ? 'text-muted' : v.estado === 'coincide' ? 'text-emerald-600' : 'text-error'}`}
          aria-hidden
        >
          {!v ? '·' : v.estado === 'coincide' ? '✓' : '✗'}
        </span>
        <input
          type="text"
          key={`${j?.id ?? 'nueva'}:${j?.expr ?? ''}`}
          defaultValue={j?.expr ?? ''}
          onBlur={(e) => {
            const t = e.target.value.trim();
            if (t !== (j?.expr ?? '')) onCambiar(t || undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          placeholder={placeholder}
          aria-label={etiqueta}
          className="min-w-0 flex-1 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-ink outline-none placeholder:font-sans placeholder:text-muted/70 focus:border-accent"
        />
      </div>
      {v && <p className={`ml-[18px] mt-0.5 ${v.estado === 'coincide' ? 'text-muted' : 'text-error'}`}>{v.detalle}</p>}
      {nombres.length > 0 && (
        <p className="ml-[18px] mt-0.5 flex flex-wrap gap-x-2">
          {nombres.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => justificar.onIrA(n)}
              title={`Abrir la hoja donde se calcula ${n}`}
              className="font-mono text-accent hover:underline"
            >
              → {n}
            </button>
          ))}
        </p>
      )}
    </>
  );
}

/**
 * Un dato del modelo —un factor, un amortiguamiento, una función— con su campo
 * de justificación. Lo que lo identifica va en `que`.
 */
export function Justificable({
  que,
  texto,
  etiqueta,
  placeholder,
  sap,
  justificar,
}: {
  que: Pick<Justificacion, 'clase' | 'patron' | 'firma' | 'valor'>;
  texto: ReactNode;
  etiqueta: string;
  placeholder: string;
  sap: ConexionSap;
  justificar: Justificar;
}) {
  const j = justificacionDelModelo(justificar.justificaciones, que.clase, que.patron, que.firma);
  return (
    <li className="text-[10px] leading-snug">
      <div className="flex flex-wrap items-baseline gap-x-2">{texto}</div>
      <CampoJustificacion
        j={j}
        v={j ? verificarDelModelo(j, sap, justificar.scope) : undefined}
        etiqueta={etiqueta}
        placeholder={placeholder}
        justificar={justificar}
        onCambiar={(expr) => justificar.onJustificarModelo(que, expr, j)}
      />
    </li>
  );
}

/**
 * Las justificaciones cuyo dato ya no está en el modelo leído: el valor cambió y
 * hay más de una candidata, o se borró. No se descartan solas —son trabajo del
 * ingeniero—; se ven aquí y se quitan a mano.
 */
export function Huerfanas({
  huerfanas,
  titulo,
  onQuitar,
}: {
  huerfanas: readonly Justificacion[];
  titulo: string;
  onQuitar: (id: string) => void;
}) {
  if (!huerfanas.length) return null;
  return (
    <div className="mt-3 rounded border border-aviso px-3 py-2">
      <p className="mb-1 text-[11px] font-semibold text-aviso">{titulo}</p>
      <ul className="space-y-1">
        {huerfanas.map((j) => (
          <li key={j.id} className="flex items-baseline gap-2 text-[10px]">
            <span className="font-mono text-ink">
              {j.patron}
              {/* La firma de una carga asignada es un JSON: no se lee. La de un
                  dato del modelo es un nombre (DEAD, U1) y sí. */}
              {j.clase && j.clase !== 'funcion-espectro' ? ` · ${j.firma}` : ''}
            </span>
            <span className="text-muted">era {cifra(j.valor)}</span>
            <span className="font-mono text-muted">{j.expr}</span>
            <button
              type="button"
              onClick={() => onQuitar(j.id)}
              className="ml-auto rounded border border-border px-1.5 text-muted hover:border-error hover:text-error"
            >
              quitar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Una línea que avisa de que la pestaña todavía no tiene lectura. */
export function SinLeer({ children }: { children: string }) {
  return (
    <p className="text-[11px] leading-snug text-muted">
      {children} Se leen con «Leer del modelo», arriba.
    </p>
  );
}
