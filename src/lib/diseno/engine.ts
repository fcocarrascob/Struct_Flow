// Punto de entrada para Node de los módulos de diseño.
//
// Reexporta también el motor, y eso es deliberado: `verify:modulos` tiene que
// quedarse con UNA sola instancia de mathjs. Compilando dos entradas por
// separado —el motor por un lado y el catálogo por otro— habría dos, y las
// unidades locales (`tonf`) y los objetos `Unit` del scope no sobreviven a esa
// frontera. Con un único bundle, la hoja, el esquema y el contraste contra una
// planilla publicada comparten instancia.
//
// Separado de `planilla-engine.ts` porque `verify:planillas` no tiene por qué
// arrastrar el catálogo de módulos.

export { MODULOS, moduloPorId } from './registro';
export { evaluarModulo, hojaDeModulo } from './evaluar';
export { layout } from '../worksheet-layout';
export { verificarSimbolos } from '../canvas-handoff';
export { evaluateSheet } from '../worksheet';
export { renderEsquema, ESQUEMAS_PREFIX } from '../esquema';
