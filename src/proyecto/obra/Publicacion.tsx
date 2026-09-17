import { formatValor } from '../../lib/worksheet';
import type { MetaPlanilla } from '../../lib/biblioteca/contrato';
import type { ModuloDiseno, Entradas, SalidaDef } from '../../lib/diseno/tipos';
import { problemaDeAlias, type Importada } from './modelo';

/**
 * Qué salidas de esta planilla ve el resto de la obra, y con qué nombre.
 *
 * ES LA MITAD QUE FALTABA DEL ENCADENAMIENTO. El botón ƒ del formulario deja que
 * la obra entre en la planilla; esto deja que la planilla salga a la obra. Con
 * las dos, la cadena de la familia BASE DE COLUMNA que documenta
 * `public/biblioteca/README.md` —la placa base entrega `T_grupo` al anclaje y al
 * pedestal, el anclaje entrega `As_req`…— se recorre sola en vez de copiando
 * números a mano.
 *
 * NO SE PUBLICA TODO. Una genérica declara hasta 38 salidas, y meterlas todas en
 * el espacio de nombres de la obra convertiría cualquier nombre corto en un
 * choque. Se marca lo que otro nodo vaya a usar, que en la práctica son una o
 * dos por planilla.
 *
 * EL ALIAS SE PUEDE CAMBIAR, y por eso hay un campo de texto y no solo una
 * casilla: dos zapatas publican las dos su `u_max`, y sin poder renombrar una,
 * la segunda dejaría a las dos sin dueño con un nombre repetido. Lo que la
 * genérica declara en `meta.entrega` sirve para PROPONER cuáles publicar —es el
 * encadenamiento que la biblioteca ya tenía escrito y que nadie leía—, nunca
 * para decidirlo.
 */

/** Una serie es una matriz N×M: no cabe en una variable que otro nodo multiplique. */
const PUBLICABLE = (s: SalidaDef) => s.tipo !== 'serie';

/** A quién le entrega esta variable la biblioteca, según el `meta` de la genérica. */
function entregaA(meta: MetaPlanilla | undefined, nombre: string): string[] {
  const destinos = meta?.entrega?.[nombre];
  return Array.isArray(destinos) ? destinos : [];
}

export default function Publicacion({
  modulo,
  importada,
  scope,
  otrosAlias,
  onPublicar,
}: {
  modulo: ModuloDiseno<Entradas>;
  importada: Importada;
  /** El scope de la planilla evaluada, para enseñar el valor que viajaría. */
  scope: Record<string, unknown>;
  otrosAlias: ReadonlySet<string>;
  onPublicar: (salida: string, alias: string | undefined) => void;
}) {
  const publica = importada.publica ?? {};
  const meta = modulo.biblioteca?.meta;
  const salidas = modulo.salidas.filter(PUBLICABLE);

  /** El alias que se propone al marcar: el nombre de la salida, y si ya está
   *  tomado por otro nodo, el de la planilla delante. Proponer uno que choca
   *  dejaría los dos nodos en rojo en el mismo clic que los conecta. */
  function aliasPropuesto(nombre: string): string {
    if (!otrosAlias.has(nombre) && !problemaDeAlias(nombre)) return nombre;
    const corto = modulo.id.replace(/-generic[ao]$/, '').replace(/-/g, '_');
    const conPrefijo = `${nombre}_${corto}`;
    return problemaDeAlias(conPrefijo) ? `${nombre}_2` : conPrefijo;
  }

  return (
    <section className="mt-3 border-t border-border pt-3">
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
        Qué publica al resto de la obra
      </h4>
      <p className="mt-0.5 text-[10px] leading-snug text-muted">
        Lo que marques queda disponible con ese nombre para cualquier otro nodo: una fórmula
        puede escribirlo, y otra planilla puede atarle un campo con ƒ.
      </p>

      <ul className="mt-2 space-y-1.5">
        {salidas.map((s) => {
          const alias = publica[s.nombre];
          const marcada = alias !== undefined;
          const destinos = entregaA(meta, s.nombre);
          // Un choque con otro nodo se marca, no se rechaza mientras se escribe:
          // el mismo criterio que el nombre de una carga.
          const problema =
            marcada && (problemaDeAlias(alias) || (otrosAlias.has(alias.trim()) ? `Ya hay otro nodo que publica «${alias.trim()}».` : ''));
          const valor = scope[s.nombre];
          return (
            <li key={s.nombre}>
              <div className="flex items-baseline gap-2">
                <input
                  type="checkbox"
                  id={`pub-${s.nombre}`}
                  checked={marcada}
                  onChange={() => onPublicar(s.nombre, marcada ? undefined : aliasPropuesto(s.nombre))}
                  className="shrink-0"
                />
                <label htmlFor={`pub-${s.nombre}`} className="min-w-0 flex-1 text-[11px] text-ink">
                  <span className="block truncate">{s.etiqueta}</span>
                  <span className="block truncate font-mono text-[10px] text-muted">
                    {s.nombre}
                    {s.unidad ? ` [${s.unidad}]` : ''}
                    {valor !== undefined && ` = ${formatValor(valor, s.unidad)}`}
                  </span>
                </label>
                {marcada && (
                  <input
                    type="text"
                    value={alias}
                    onChange={(e) => onPublicar(s.nombre, e.target.value)}
                    aria-label={`Nombre con el que se publica ${s.nombre}`}
                    spellCheck={false}
                    className={`w-36 shrink-0 rounded border bg-white px-1.5 py-0.5 font-mono text-[11px] text-ink outline-none focus:border-accent ${
                      problema ? 'border-error' : 'border-border'
                    }`}
                  />
                )}
              </div>
              {destinos.length > 0 && !marcada && (
                <p className="ml-6 text-[10px] leading-snug text-accent">
                  La biblioteca dice que esto lo consume {destinos.join(', ')}.
                </p>
              )}
              {problema && <p className="ml-6 text-[10px] leading-snug text-error">{problema}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
