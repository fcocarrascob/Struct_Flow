// Punto de entrada del motor para Node (`scripts/verify-planilla.mjs`): un solo
// bundle en el que hoja y esquema comparten la misma instancia de mathjs (las
// unidades locales como `tonf` y los objetos Unit del scope no sobreviven a dos
// instancias distintas).
export { evaluateSheet, parseMathRegion } from './worksheet';
export { renderEsquema, ESQUEMAS_PREFIX, esRutaDeEsquema } from './esquema';
export { ordenDeLectura, tienenPosicion } from './orden-lectura';
export {
  validarMeta,
  instanciarRegiones,
  valoresDeEntradas,
  regionDeEntrada,
  RE_ENTRADA,
  RE_SLUG,
  RE_CITA_PROHIBIDA,
  PREFIJO_ENTRADA,
  CLASES,
  n,
} from './biblioteca/contrato';
export { nivelEncabezado, textoEncabezado, esEncabezado, esEspaciador } from './bloque';
export { renderHtml, documentoHtml } from './render-html';
