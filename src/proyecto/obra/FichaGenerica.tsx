import { useState } from 'react';
import PanelResultados from '../../components/diseno/PanelResultados';
import VisorEsquema from '../../components/diseno/VisorEsquema';
import type { Entradas, SalidaDef } from '../../lib/diseno/tipos';
import {
  camposResueltos,
  entradasEfectivas,
  evaluarImportada,
  quedoAtras,
  type EstadoGenerica,
} from './biblioteca';
import FormularioAtable from './FormularioAtable';
import type { Importada } from './modelo';

/**
 * Las tres pestañas, y por qué el corte cae donde cae.
 *
 * No es una agrupación inventada: `SalidaDef.tipo` ya distingue las cuatro
 * clases de salida que declara una genérica. `valor` y `texto` son lo que la
 * hoja PRODUCE —un área de armadura, un espesor, un perfil elegido—; `uso` y
 * `veredicto` son lo que la hoja DICTAMINA. Mezclarlas en una sola columna es
 * lo que hacía que el pedestal, con 38 salidas, se leyera como una lista de
 * cuarenta filas donde el CUMPLE quedaba a media pantalla de scroll.
 */
type Pestaña = 'entradas' | 'salidas' | 'verificaciones';

const ES_SALIDA = (s: SalidaDef) => s.tipo === 'valor' || s.tipo === 'texto' || s.tipo === 'serie';
const ES_VERIFICACION = (s: SalidaDef) => s.tipo === 'uso' || s.tipo === 'veredicto';

/**
 * La marca de la pestaña «Verificaciones»: si hay algo que mirar sin abrirla.
 *
 * Una pestaña esconde cosas, y lo que no se puede esconder es un NO CUMPLE. El
 * rojo sale de `v_global` —la salida que el contrato de biblioteca le exige a
 * TODA genérica— y no de recontar los factores de utilización: recontarlos sería
 * una segunda autoridad sobre si la hoja cumple, y acabaría discrepando de la
 * que pinta `PanelResultados` y de la que lee el nodo del canvas.
 */
function severidadDeVerificaciones(
  salidas: SalidaDef[],
  scope: Record<string, unknown>,
  errores: number,
): 'ok' | 'aviso' | 'error' {
  if (errores > 0 || scope.v_global === false) return 'error';
  // Un veredicto marcado `aviso` en ✗ no dice que la sección falle: dice que el
  // resultado puede no ser válido. Por eso es ámbar y no rojo.
  const hayAviso = salidas.some((s) => s.tipo === 'veredicto' && s.aviso && scope[s.nombre] === false);
  return hayAviso ? 'aviso' : 'ok';
}

const PESTAÑAS: { clave: Pestaña; titulo: string }[] = [
  { clave: 'entradas', titulo: 'Entradas' },
  { clave: 'salidas', titulo: 'Salidas' },
  { clave: 'verificaciones', titulo: 'Verificaciones' },
];

const PUNTO: Record<string, string> = { ok: '', aviso: 'bg-aviso', error: 'bg-error' };

function Pestañas({
  activa,
  onCambiar,
  cuenta,
  atados,
  severidad,
}: {
  activa: Pestaña;
  onCambiar: (p: Pestaña) => void;
  cuenta: Record<Pestaña, number>;
  /** Campos atados a una expresión: se anuncian en la pestaña porque son la
   *  diferencia entre una planilla aislada y una conectada al resto de la obra. */
  atados: number;
  severidad: 'ok' | 'aviso' | 'error';
}) {
  return (
    <div role="tablist" className="mb-3 flex gap-1 border-b border-border">
      {PESTAÑAS.map((p) => {
        const marca = p.clave === 'verificaciones' ? PUNTO[severidad] : '';
        const esActiva = p.clave === activa;
        return (
          <button
            key={p.clave}
            type="button"
            role="tab"
            aria-selected={esActiva}
            onClick={() => onCambiar(p.clave)}
            className={`-mb-px flex items-center gap-1 border-b-2 px-2.5 py-1 text-xs ${
              esActiva
                ? 'border-accent font-medium text-accent'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {p.titulo}
            <span className="text-[10px] text-muted">{cuenta[p.clave]}</span>
            {p.clave === 'entradas' && atados > 0 && (
              <span title={`${atados} campo(s) atados a una expresión`} className="text-[10px] text-accent">
                ƒ{atados}
              </span>
            )}
            {marca && <span className={`inline-block h-1.5 w-1.5 rounded-full ${marca}`} />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Una genérica instanciada dentro del panel de la obra.
 *
 * El formulario y el panel de resultados son LOS MISMOS que usa `/diseno/<slug>`
 * (`FormularioEntradas`, `PanelResultados`), y la evaluación es la misma
 * `evaluarModulo`. No hay una segunda forma de instanciar una genérica: si la
 * obra armara su propio formulario o su propia evaluación, el día que una de las
 * dos cambiara darían números distintos para la misma planilla.
 *
 * El aviso de desfase es la contrapartida de guardar una referencia y no la
 * hoja: lo que se ve es la genérica publicada de hoy, y si no es la que se
 * importó, hay que decirlo.
 */
export default function FichaGenerica({
  estado,
  importada,
  scopeObra,
  onEntradas,
  onFormula,
  onSalida,
  onResellar,
  onQuitar,
}: {
  estado: EstadoGenerica | undefined;
  importada: Importada;
  /** El scope compartido de la obra: lo que pueden nombrar los campos atados. */
  scopeObra: Record<string, unknown>;
  onEntradas: (entradas: Entradas) => void;
  onFormula: (campo: string, expr: string | undefined) => void;
  /** Solo en una partida de carga: cuál salida es su valor. */
  onSalida?: (nombre: string) => void;
  /** Aceptar la versión de hoy: reescribe el sello con el sha256 actual. */
  onResellar: (sha256: string) => void;
  onQuitar: () => void;
}) {
  const [pestaña, setPestaña] = useState<Pestaña>('entradas');

  if (!estado || estado.fase === 'cargando') {
    return (
      <p className="text-[11px] text-muted">
        Cargando «<span className="font-mono">{importada.slug}</span>» desde la biblioteca…
      </p>
    );
  }

  if (estado.fase === 'error') {
    return (
      <div>
        <p className="text-[11px] leading-snug text-error">{estado.motivo}</p>
        <button
          type="button"
          onClick={onQuitar}
          className="mt-2 rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-error hover:text-error"
        >
          quitar la planilla
        </button>
      </div>
    );
  }

  const modulo = estado.modulo;
  const valores = entradasEfectivas(modulo, importada, scopeObra);
  const resueltos = camposResueltos(modulo, importada, scopeObra);
  const ev = evaluarImportada(modulo, importada, scopeObra);
  const atrasada = quedoAtras(modulo, importada);
  const atados = Object.keys(importada.formulas ?? {}).length;

  return (
    <div>
      <header className="mb-2">
        <h3 className="text-xs font-semibold leading-snug text-ink">{modulo.titulo}</h3>
        <p className="mt-0.5 font-mono text-[10px] text-muted">{modulo.norma}</p>
        <p className="mt-0.5 font-mono text-[10px] text-muted">
          {importada.slug} · {importada.sha256.slice(0, 12)}…
        </p>
      </header>

      {atrasada && (
        <div className="mb-2 rounded border border-aviso bg-white px-2 py-1.5">
          <p className="text-[10px] leading-snug text-aviso">
            La genérica cambió en la biblioteca desde que la importaste. Lo que se ve es el
            resultado de la versión publicada de hoy, que es la verificada; revisa que el cambio
            no afecte a esta obra.
          </p>
          <button
            type="button"
            onClick={() => onResellar(modulo.biblioteca!.sha256)}
            title="Aceptar la versión de hoy y dejar de avisar"
            className="mt-1 rounded border border-aviso px-2 py-0.5 text-[10px] text-aviso hover:bg-aviso hover:text-white"
          >
            ya la revisé: actualizar el sello
          </button>
        </div>
      )}

      {onSalida && (
        <label className="mb-2 block">
          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted">
            Qué salida es el valor de la partida
          </span>
          <select
            value={importada.salida ?? ''}
            onChange={(e) => onSalida(e.target.value)}
            className="w-full rounded border border-border bg-white px-2 py-1 text-xs text-ink outline-none focus:border-accent"
          >
            <option value="">— elige una —</option>
            {modulo.salidas
              // Lo que resume una partida es un número: un veredicto es un ✓/✗,
              // un texto es una frase y una serie es una tabla entera. Ninguno
              // de los tres cabe en la línea con la que el nodo se lee de un
              // vistazo.
              .filter((s) => s.tipo === 'valor' || s.tipo === 'uso')
              .map((s) => (
                <option key={s.nombre} value={s.nombre}>
                  {s.etiqueta}
                  {s.unidad ? ` [${s.unidad}]` : ''}
                </option>
              ))}
          </select>
        </label>
      )}

      <Pestañas
        activa={pestaña}
        onCambiar={setPestaña}
        atados={atados}
        cuenta={{
          entradas: modulo.entradas.length,
          salidas: modulo.salidas.filter(ES_SALIDA).length,
          verificaciones: modulo.salidas.filter(ES_VERIFICACION).length,
        }}
        severidad={severidadDeVerificaciones(modulo.salidas, ev.scope, ev.errores.length)}
      />

      <section role="tabpanel" className="mb-3">
        {pestaña === 'entradas' && (
          <>
            <p className="mb-2 text-[10px] leading-snug text-muted">
              El botón <span className="font-mono text-ink">ƒ</span> ata un campo a una expresión
              de la obra: en vez de un número escrito a mano, el valor lo produce otro nodo y se
              convierte a la unidad del campo.
            </p>
            <FormularioAtable
              campos={modulo.entradas}
              valores={valores}
              formulas={importada.formulas ?? {}}
              resueltos={resueltos}
              onValor={(nombre, valor) => onEntradas({ ...valores, [nombre]: valor })}
              onFormula={onFormula}
            />
          </>
        )}

        {/* Los errores del motor van en las DOS pestañas de resultado, no solo en
            una: significan que una combinación de datos rompió el cálculo, así
            que los números de «Salidas» pueden estar a medio hacer y quien los
            está mirando tiene que enterarse sin cambiar de pestaña. */}
        {pestaña === 'salidas' && (
          <div className="space-y-3">
            {/* La figura va con los resultados y no en una pestaña propia: en
                una hoja de acciones ES un resultado —la curva que se carga en el
                modelo—, y leer la ordenada sin ver de qué curva sale es
                justamente lo que se quiere evitar. En el canvas cabe porque el
                visor escala el SVG al ancho disponible. */}
            {modulo.esquema && (
              <VisorEsquema
                src={modulo.esquema}
                scope={ev.scope}
                ancho={modulo.anchoEsquema ?? 660}
                alto={modulo.altoEsquema ?? 430}
              />
            )}
            <PanelResultados
              salidas={modulo.salidas.filter(ES_SALIDA)}
              scope={ev.scope}
              errores={ev.errores}
            />
          </div>
        )}

        {pestaña === 'verificaciones' && (
          <PanelResultados
            salidas={modulo.salidas.filter(ES_VERIFICACION)}
            scope={ev.scope}
            errores={ev.errores}
          />
        )}
      </section>

      <button
        type="button"
        onClick={onQuitar}
        className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-error hover:text-error"
      >
        quitar la planilla
      </button>
    </div>
  );
}
