// ─────────────────────────────────────────────────────────────────────────────
// El desglose de una carga: qué valor muestra cada partida.
//
// Aquí ya no se evalúa ninguna hoja. La hoja es una sola y la evalúa
// `evaluacion.ts` para toda la obra; esto solo LEE del scope compartido el
// nombre que cada partida declaró como su valor.
//
// UNA CARGA NO SUMA SUS PARTIDAS, Y ESO ES EL MODELO, NO UNA CARENCIA.
// --------------------------------------------------------------------
// Hubo un total: se armaba `v0 + v1 + v2` y lo evaluaba el motor, para que
// sumar `30 tonf` con `4 kN/m²` fallara en vez de dar un número sin sentido.
// Servía para el caso que lo originó —una permanente que es la suma de los pesos
// de cubierta, instalaciones y muros— y estorbaba en todos los demás, porque la
// suma era FORZOSA y su fracaso era un error rojo que subía hasta el nodo de las
// definiciones.
//
// Una carga con un espectro, un corte basal y un factor de utilización dentro no
// está mal escrita: está ORGANIZADA. El desglose agrupa, y lo que haya que sumar
// se suma dentro de la hoja de un nodo, que es donde el motor puede hacerlo con
// sus unidades a la vista. Además, al sumar de a una, el error acusaba a la
// primera partida que rompía EN EL ORDEN DEL ARRAY: reordenar el desglose movía
// la culpa de sitio, que es la señal de que no estaba describiendo un defecto.
// ─────────────────────────────────────────────────────────────────────────────

import { formatValor } from '../../lib/worksheet';
import { type Genericas } from './biblioteca';
import type { EvaluacionObra } from './evaluacion';
import { idNodoDeSubcarga } from './ids';
import { variableDePartida, type Carga, type Frontera, type Subcarga } from './modelo';

export interface ValorSubcarga {
  id: string;
  /** La etiqueta de la partida, que ya no es su variable. */
  nombre: string;
  /** El nombre del que sale el valor, para poder decirlo cuando falta. */
  variable?: string;
  /** El valor crudo: un `Unit` de math.js, un número o nada. */
  valor?: unknown;
  /** Ya formateado con su unidad, o «—». */
  texto: string;
  /** Por qué no hay valor. Cadena vacía si todo cuadra. */
  problema: string;
  /** La genérica todavía se está descargando: no hay valor y no es un fallo. */
  cargando?: boolean;
}

export interface EvaluacionCarga {
  valores: ValorSubcarga[];
  /** Qué hay dentro, para el subtítulo del nodo: los valores encadenados. */
  resumen: string;
}

const SUPERINDICE: Record<string, string> = { '2': '²', '3': '³', '4': '⁴' };

/**
 * Un valor formateado por el motor, legible en una tarjeta: `kN / m^2` pasa a
 * `kN/m²`.
 *
 * Aquí y no en `formatValor`: aquel es del motor, y cambiarlo resellaría todas las
 * planillas del harness por un asunto de tipografía. En la hoja no hace falta,
 * porque la hoja pinta LaTeX; la tarjeta es texto plano.
 */
export function legible(texto: string): string {
  return texto.replace(/\^([234])(?!\d)/g, (_, d: string) => SUPERINDICE[d]).replace(/ \/ /g, '/');
}

/** Cuántos valores caben en el resumen antes de resumirlos con un «+N». */
const MAX_EN_RESUMEN = 4;

/**
 * Lo que un nodo de carga enseña bajo su nombre.
 *
 * Los valores de sus partidas, en orden y separados por `·`. No es un total —una
 * carga no suma—, es un vistazo a lo que hay dentro sin abrirla. Con más de
 * cuatro partidas la cadena dejaría de leerse antes de decir nada, así que se
 * corta y se cuenta el resto.
 */
function resumirValores(valores: ValorSubcarga[]): string {
  if (valores.length === 0) return 'sin partidas';
  const visibles = valores.slice(0, MAX_EN_RESUMEN).map((v) => v.texto);
  const resto = valores.length - visibles.length;
  return resto > 0 ? `${visibles.join(' · ')} +${resto}` : visibles.join(' · ');
}

/**
 * El valor de una partida respaldada por un cálculo con frontera: la salida
 * elegida del scope de esa hoja, que es otra hoja y otro scope.
 *
 * Mientras la genérica se descarga NO es un fallo, y por eso `cargando` va
 * aparte de `problema`: pintar el nodo en rojo durante la descarga enseñaría un
 * error que se arregla solo un segundo después, y un rojo que se arregla solo es
 * un rojo que se deja de mirar.
 */
function valorConFrontera(
  sub: Subcarga,
  f: Frontera,
  genericas: Genericas,
  ev: EvaluacionObra,
): ValorSubcarga {
  const base = { id: sub.id, nombre: sub.nombre, variable: f.salida };
  const estado = f.procedencia === 'biblioteca' && f.slug ? genericas[f.slug] : undefined;
  if (f.procedencia === 'biblioteca') {
    if (!estado || estado.fase === 'cargando') {
      return { ...base, texto: '…', problema: '', cargando: true };
    }
    if (estado.fase === 'error') return { ...base, texto: '—', problema: estado.motivo };
  }
  if (!f.salida) {
    return {
      ...base,
      texto: '—',
      problema: 'Elige cuál de las salidas de este cálculo es el valor de la partida.',
    };
  }
  // La evaluación la hizo `evaluarObra`, en el sitio que le toca a este nodo
  // dentro del orden de lectura. Reevaluarla aquí con el scope final de la obra
  // daría otro número el día que el cálculo lea algo que se resuelve debajo.
  const instancia = ev.importadas.get(idNodoDeSubcarga(sub.id));
  if (!instancia) return { ...base, texto: '…', problema: '', cargando: true };
  const valor = instancia.salidas[f.salida];
  if (valor === undefined) {
    return { ...base, texto: '—', problema: `El cálculo no dejó valor en «${f.salida}».` };
  }
  // La unidad declarada solo existe si hay un módulo detrás; una hoja propia
  // entrega el `Unit` que el motor calculó, que ya la lleva.
  const unidad =
    estado?.fase === 'lista'
      ? estado.modulo.salidas.find((s) => s.nombre === f.salida)?.unidad
      : undefined;
  return {
    ...base,
    valor,
    texto: legible(unidad ? `${formatValor(valor, unidad)} ${unidad}` : formatValor(valor)),
    problema: '',
  };
}

/** El valor de una partida de hoja libre: su variable, leída del scope común. */
function valorLibre(sub: Subcarga, ev: EvaluacionObra): ValorSubcarga {
  const variable = sub.variable;
  const base = { id: sub.id, nombre: sub.nombre, variable };
  if (!variable) {
    return {
      ...base,
      texto: '—',
      problema: 'Elige cuál variable de esta hoja es el valor de la partida.',
    };
  }
  const valor = ev.scope[variable];
  if (valor === undefined) {
    // El error del bloque, si lo hay, dice más que «no está definida»: es el
    // motivo por el que el motor retiró la variable del scope.
    const error = sub.hoja.map((r) => ev.results[r.id]?.error).find(Boolean);
    return {
      ...base,
      texto: '—',
      problema: error ?? `La hoja de esta partida no define «${variable}».`,
    };
  }
  return { ...base, valor, texto: legible(formatValor(valor)), problema: '' };
}

export function evaluarCarga(
  carga: Carga,
  ev: EvaluacionObra,
  genericas: Genericas = {},
): EvaluacionCarga {
  const valores = carga.subcargas.map((sub) =>
    sub.frontera ? valorConFrontera(sub, sub.frontera, genericas, ev) : valorLibre(sub, ev),
  );

  return { valores, resumen: resumirValores(valores) };
}

/** Las variables que una partida de hoja libre puede ofrecer como su valor. */
export function variablesDePartida(sub: Subcarga, ev: EvaluacionObra): string[] {
  return ev.define.get(idNodoDeSubcarga(sub.id)) ?? [];
}

export { variableDePartida };
