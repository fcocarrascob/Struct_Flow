// Cómo se le cuenta al usuario lo que un saneo descartó.
//
// Vive aquí y no en `src/lib/hoja-json.ts`, que es quien produce el informe, por
// una razón mecánica y no estética: el harness sella el motor como el hash de
// árbol de `src/lib`, así que cada ajuste de redacción obligaría a resellar y a
// un commit `[harness]` en el repo hermano. El motor devuelve códigos; la prosa
// es de la capa que la enseña. Es la misma frontera por la que `src/proyecto/`
// está fuera de `src/lib/`.

import type { InformeSaneo, MotivoDescarte, RegionDescartada } from '../../lib/hoja-json';
import { MAX_SERIES, type CodigoGrafico } from '../../lib/grafico';
import { MAX_COLUMNAS, MAX_FILAS, type CodigoTabla } from '../../lib/tabla';

/** Cómo se lee cada código, en singular y sin sujeto: se compone abajo. */
const MOTIVOS: Record<MotivoDescarte, string> = {
  'no-es-objeto': 'no era un bloque',
  'sin-src': 'sin «src»',
  kind: 'con «kind» desconocido',
  coordenadas: 'sin «x» o sin «y»',
  grafico: 'gráfico con la especificación mal formada',
  tabla: 'tabla con la especificación mal formada',
};

/** Qué le falta a la especificación de una tabla (`motivoDeTabla`). */
const DETALLES_TABLA: Record<CodigoTabla, string> = {
  'no-es-objeto': 'no trae «tabla»',
  version: '«version» tiene que ser 1',
  celdas: '«celdas» no es una grilla rectangular de textos',
  dimensiones: `más de ${MAX_FILAS} filas o de ${MAX_COLUMNAS} columnas`,
  encabezado: '«encabezado» no es un número de filas entre 0 y las que tiene',
  columnas: '«columnas» con más entradas que columnas, o una mal formada',
  matriz: '«matriz» no es un texto',
};

/** Qué le falta a la especificación de un gráfico (`motivoDeGrafico`). */
const DETALLES_GRAFICO: Record<CodigoGrafico, string> = {
  'no-es-objeto': 'no trae «grafico»',
  version: '«version» tiene que ser 1',
  eje: '«ejeX» o «ejeY» sin «titulo»',
  'sin-series': 'sin series',
  'demasiadas-series': `más de ${MAX_SERIES} series`,
  serie: 'una serie sin los campos de su «tipo»',
  referencia: 'una referencia mal formada',
  opciones: '«leyenda», «cuadricula» o «alto» con un valor que no se admite',
};

/** El motivo de una descartada, con el `kind` citado cuando lo hay: «"formula"»
 *  en vez de «math» es el error que más manda un chat, y nombrarlo ahorra el
 *  viaje de ida y vuelta. */
function motivoDe(d: RegionDescartada): string {
  const base = MOTIVOS[d.motivo];
  if (d.motivo === 'grafico' && d.detalle) return `${base}: ${DETALLES_GRAFICO[d.detalle as CodigoGrafico]}`;
  if (d.motivo === 'tabla' && d.detalle) return `${base}: ${DETALLES_TABLA[d.detalle as CodigoTabla]}`;
  return d.motivo === 'kind' && d.kind ? `${base} («${d.kind}»)` : base;
}

/** Agrupa por motivo conservando el orden de aparición, para que el resumen
 *  empiece por lo que más se repite arriba del archivo. */
function porMotivo(descartadas: readonly RegionDescartada[]): [string, number][] {
  const cuenta = new Map<string, number>();
  for (const d of descartadas) {
    const m = motivoDe(d);
    cuenta.set(m, (cuenta.get(m) ?? 0) + 1);
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * El aviso de un saneo con descartes. Cadena vacía si no descartó nada.
 *
 * Dice el número, el motivo agregado y las posiciones. El número solo no sirve
 * para lo que hace falta hacer con él: «se descartaron 5 bloques» no se puede
 * pegar en la conversación donde se escribió el JSON y obtener una corrección.
 */
export function resumirDescartes(informe: InformeSaneo): string {
  const { descartadas, regions } = informe;
  if (descartadas.length === 0) return '';
  const total = regions.length + descartadas.length;
  const causas = porMotivo(descartadas)
    .map(([motivo, n]) => `${n} ${motivo}`)
    .join(', ');
  const donde = descartadas.map((d) => d.posicion).join(', ');
  return (
    `Se cargaron ${regions.length} de ${total} bloques. Se descartaron ` +
    `${descartadas.length}: ${causas}. Son los de las posiciones ${donde} del array «regions».`
  );
}

/**
 * El detalle largo, uno por línea y sin resumir, para copiar al portapapeles y
 * pegarlo donde se escribió el JSON.
 */
export function detalleDeDescartes(informe: InformeSaneo): string {
  const { descartadas, regions } = informe;
  if (descartadas.length === 0) return '';
  const total = regions.length + descartadas.length;
  const lineas = descartadas.map((d) => `- bloque ${d.posicion}: ${motivoDe(d)}`);
  return [
    `La hoja traía ${total} bloques y ${descartadas.length} no se pudieron cargar:`,
    ...lineas,
    '',
    'Un bloque válido lleva «kind» («math», «text», «program», «image», «plot» o «table»), «src» como texto, y «x» e «y» numéricos; un «plot» lleva además «grafico», y una «table», «tabla».',
  ].join('\n');
}
