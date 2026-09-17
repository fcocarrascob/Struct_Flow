import { useState } from 'react';
import PanelResultados from '../../components/diseno/PanelResultados';
import VisorEsquema from '../../components/diseno/VisorEsquema';
import type { SalidaDef } from '../../lib/diseno/tipos';
import { hojaDeModulo } from '../../lib/diseno/evaluar';
import { slugDeInstancia } from '../../lib/diseno/declarativo';
import { abrirEnCanvas, descargarHoja } from '../../lib/canvas-handoff';
import { camposResueltos, entradasEfectivas, quedoAtras, type EstadoGenerica } from './biblioteca';
import type { Instanciada } from './evaluacion';
import FormularioAtable from './FormularioAtable';
import Publicacion from './Publicacion';
import type { Frontera } from './modelo';

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
  publicados,
  severidad,
}: {
  activa: Pestaña;
  onCambiar: (p: Pestaña) => void;
  cuenta: Record<Pestaña, number>;
  /** Campos atados a una expresión: se anuncian en la pestaña porque son la
   *  diferencia entre una planilla aislada y una conectada al resto de la obra. */
  atados: number;
  /** Y salidas publicadas, que es la misma diferencia en el otro sentido. */
  publicados: number;
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
            {p.clave === 'salidas' && publicados > 0 && (
              <span
                title={`${publicados} salida(s) publicadas al resto de la obra`}
                className="text-[10px] text-accent"
              >
                ↗{publicados}
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
  frontera,
  instancia,
  otrosAlias,
  onEntrada,
  onFormula,
  onPublicar,
  onSalida,
  onResellar,
  onQuitar,
}: {
  estado: EstadoGenerica | undefined;
  frontera: Frontera;
  /**
   * Lo que esta planilla produjo, ya evaluado por `evaluarObra` en el sitio que
   * le toca dentro del orden de lectura, y el scope de la obra visible ahí.
   * Evaluarla otra vez desde aquí sería una segunda autoridad sobre el mismo
   * número, y con el scope final en vez del de su posición.
   */
  instancia: Instanciada | undefined;
  /** Los alias que ya usan los demás nodos, para no proponer uno que choque. */
  otrosAlias: ReadonlySet<string>;
  /**
   * Un campo, no el juego entero. Los valores que pinta el formulario son los
   * **efectivos** —los de la genérica, pisados por los guardados y por lo que
   * resolvió cada campo atado—, así que devolverlos todos congelaba en el
   * documento las omisiones de la genérica y el valor que en ese instante daba
   * una fórmula. Con eso, desatar un campo ya no devolvía «el número que había»,
   * que es lo que promete `modelo.ts`, sino el último calculado.
   */
  onEntrada: (nombre: string, valor: number) => void;
  onFormula: (campo: string, expr: string | undefined) => void;
  /** Publicar una salida con ese alias, o dejar de publicarla (`undefined`). */
  onPublicar: (salida: string, alias: string | undefined) => void;
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
        Cargando «<span className="font-mono">{frontera.slug}</span>» desde la biblioteca…
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
  // Mientras `evaluarObra` no haya llegado a este nodo —la genérica acaba de
  // terminar de descargarse y el render va por delante— se pinta con el scope
  // vacío, que es lo que el nodo del canvas está enseñando en ese mismo momento.
  const scopeObra = instancia?.scope ?? {};
  const valores = entradasEfectivas(modulo, frontera, scopeObra);
  const resueltos = camposResueltos(modulo, frontera, scopeObra);
  const ev = instancia?.ev;
  const atrasada = quedoAtras(modulo, frontera);
  const atados = Object.keys(frontera.formulas ?? {}).length;

  if (!ev) {
    return (
      <p className="text-[11px] text-muted">
        Calculando «<span className="font-mono">{frontera.slug}</span>»…
      </p>
    );
  }

  return (
    <div>
      <header className="mb-2">
        <h3 className="text-xs font-semibold leading-snug text-ink">{modulo.titulo}</h3>
        <p className="mt-0.5 font-mono text-[10px] text-muted">{modulo.norma}</p>
        <p className="mt-0.5 font-mono text-[10px] text-muted">
          {frontera.slug} · {(frontera.sha256 ?? frontera.origen?.sha256 ?? "").slice(0, 12)}…
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
            value={frontera.salida ?? ''}
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
        publicados={Object.keys(frontera.publica ?? {}).length}
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
              formulas={frontera.formulas ?? {}}
              resueltos={resueltos}
              onValor={onEntrada}
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
            {/* Al final de las salidas y no en una pestaña aparte: publicar es
                una decisión que se toma mirando el número que va a viajar. */}
            <Publicacion
              modulo={modulo}
              frontera={frontera}
              scope={ev.scope}
              otrosAlias={otrosAlias}
              onPublicar={onPublicar}
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

      {/* La memoria, que es el entregable. Es la MISMA que exporta
          `/diseno/<slug>`: una instancia estampada con el `origen.sha256` de la
          genérica y el commit de la aplicación, que `harness.planilla` acepta
          tal cual. Sin esto, una obra organizaba los cálculos y no producía
          nada que se pudiera anexar ni revisar. */}
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => descargarHoja(hojaDeModulo(modulo, ev), `${slugDeInstancia(modulo.id)}.json`)}
          title="La memoria de cálculo con estos datos, lista para el proyecto"
          className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
        >
          descargar la memoria
        </button>
        <button
          type="button"
          onClick={() => abrirEnCanvas(hojaDeModulo(modulo, ev))}
          title="Abrirla en el canvas para revisarla o imprimirla"
          className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
        >
          abrir en el canvas
        </button>
        <button
          type="button"
          onClick={onQuitar}
          className="ml-auto rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:border-error hover:text-error"
        >
          quitar la planilla
        </button>
      </div>
    </div>
  );
}
