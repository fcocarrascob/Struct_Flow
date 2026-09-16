// ─────────────────────────────────────────────────────────────────────────────
// El desglose de una carga: qué aporta cada partida y cuánto suma.
//
// Acá ya no se evalúa ninguna hoja. La hoja es una sola y la evalúa
// `evaluacion.ts` para toda la obra; esto solo LEE del scope compartido el
// nombre que cada partida declaró como su valor, y suma.
//
// El total NO se suma en JavaScript: se arma la expresión `A + B + C` y la
// evalúa el mismo motor, con los mismos objetos `Unit`. Así sumar `30 tonf` con
// `4 kN/m²` falla como tiene que fallar en vez de dar un número que no significa
// nada.
// ─────────────────────────────────────────────────────────────────────────────

import { evalExpr, formatValor } from '../../lib/worksheet';
import { evaluarImportada, type Genericas } from './biblioteca';
import type { EvaluacionObra } from './evaluacion';
import { idNodoDeSubcarga } from './ids';
import { variableDePartida, type Carga, type Importada, type Subcarga } from './modelo';

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
  total?: unknown;
  totalTexto: string;
  /** Por qué no hay total: unidades que no casan, partidas sin valor… */
  problemaTotal: string;
}

/**
 * El valor de una partida respaldada por una genérica: la salida elegida del
 * scope de esa hoja instanciada, que es otra hoja y otro scope.
 *
 * Mientras la genérica se descarga NO es un fallo, y por eso `cargando` va
 * aparte de `problema`: pintar el nodo en rojo durante la descarga enseñaría un
 * error que se arregla solo un segundo después, y un rojo que se arregla solo es
 * un rojo que se deja de mirar.
 */
function valorImportado(
  sub: Subcarga,
  imp: Importada,
  genericas: Genericas,
  scopeObra: Record<string, unknown>,
): ValorSubcarga {
  const base = { id: sub.id, nombre: sub.nombre, variable: imp.salida };
  const estado = genericas[imp.slug];
  if (!estado || estado.fase === 'cargando') {
    return { ...base, texto: '…', problema: '', cargando: true };
  }
  if (estado.fase === 'error') return { ...base, texto: '—', problema: estado.motivo };
  if (!imp.salida) {
    return {
      ...base,
      texto: '—',
      problema: 'Elige cuál de las salidas de la planilla es el valor de la partida.',
    };
  }
  const ev = evaluarImportada(estado.modulo, imp, scopeObra);
  const valor = ev.scope[imp.salida];
  if (valor === undefined) {
    return { ...base, texto: '—', problema: `La planilla no dejó valor en «${imp.salida}».` };
  }
  const unidad = estado.modulo.salidas.find((s) => s.nombre === imp.salida)?.unidad;
  return {
    ...base,
    valor,
    texto: unidad ? `${formatValor(valor, unidad)} ${unidad}` : formatValor(valor),
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
    const error = sub.bloques.map((b) => ev.results[b.id]?.error).find(Boolean);
    return {
      ...base,
      texto: '—',
      problema: error ?? `La hoja de esta partida no define «${variable}».`,
    };
  }
  return { ...base, valor, texto: formatValor(valor), problema: '' };
}

export function evaluarCarga(
  carga: Carga,
  ev: EvaluacionObra,
  genericas: Genericas = {},
): EvaluacionCarga {
  const valores = carga.subcargas.map((sub) =>
    sub.importada
      ? valorImportado(sub, sub.importada, genericas, ev.scope)
      : valorLibre(sub, ev),
  );

  const sumables = valores.filter((v) => !v.problema && v.valor !== undefined);
  let total: unknown;
  let totalTexto = '—';
  let problemaTotal = '';

  if (sumables.length === 0) {
    problemaTotal =
      carga.subcargas.length === 0 || valores.some((v) => v.cargando)
        ? ''
        : 'Ninguna partida entrega un valor.';
    return { valores, total, totalTexto, problemaTotal };
  }

  // El scope de la suma se arma aparte y no se toma del de la hoja: las partidas
  // importadas no están ahí —su cálculo es otra hoja— y aun así suman. Las
  // claves son sintéticas (`v0`, `v1`) y no los nombres de las variables: dos
  // partidas pueden apuntar a la misma variable, y entonces un scope por nombre
  // las contaría una sola vez.
  const scopeSuma: Record<string, unknown> = {};
  sumables.forEach((v, i) => {
    scopeSuma[`v${i}`] = v.valor;
  });

  // Se suma DE A UNA, y no todo de un golpe, para poder decir cuál es la que
  // rompe. Sumar `A + B + C` de una vez deja el mensaje crudo de math.js
  // —«Units do not match»—, que es cierto y no dice qué mirar entre veinte
  // partidas.
  let acumulado = 'v0';
  total = sumables[0].valor;
  for (let i = 1; i < sumables.length; i++) {
    const v = sumables[i];
    try {
      total = evalExpr(`${acumulado} + v${i}`, scopeSuma);
      acumulado = `${acumulado} + v${i}`;
    } catch {
      problemaTotal =
        `«${v.nombre}» (${v.texto}) no suma con lo anterior (${formatValor(total)}): ` +
        'no son la misma magnitud.';
      total = undefined;
      break;
    }
  }
  totalTexto = total === undefined ? '—' : formatValor(total);

  // Una partida que todavía se está descargando no cuenta como «sin valor»: el
  // total se completa solo en cuanto llegue.
  const faltan = valores.filter((v) => v.valor === undefined && !v.cargando).length;
  if (faltan > 0 && !problemaTotal) {
    problemaTotal = `El total deja fuera ${faltan} partida(s) sin valor.`;
  }

  return { valores, total, totalTexto, problemaTotal };
}

/** Las variables que una partida de hoja libre puede ofrecer como su valor. */
export function variablesDePartida(sub: Subcarga, ev: EvaluacionObra): string[] {
  return ev.define.get(idNodoDeSubcarga(sub.id)) ?? [];
}

export { variableDePartida };
