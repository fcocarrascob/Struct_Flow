// Punto de entrada para Node de la capa de obra.
//
// Reexporta también el motor y el armado de un módulo declarativo, por la misma
// razón que lo hace `src/lib/diseno/engine.ts`: `verify:obra` tiene que quedarse
// con UNA sola instancia de mathjs. Compilando dos entradas por separado —la
// obra por un lado y el motor por otro— habría dos, y los objetos `Unit` que una
// planilla publica al scope de la obra no sobreviven a esa frontera: llegarían
// como un valor de otra instancia y el primer `+` fallaría.
//
// De lo que se compila aquí NO se usa nada que hable con el navegador:
// `cargarGenerica` hace `fetch` de una ruta relativa y no tiene sentido en Node.
// El verificador arma los módulos desde el archivo con `moduloDeBiblioteca`, que
// es la misma operación que hace la aplicación después de descargarlo.

export {
  evaluarObra,
  evaluarHojaConFrontera,
  nodosDeLaObra,
  problemaDeGrafo,
  rupturaPorQuitar,
} from './evaluacion';
export { sanearObra, idDeObra, archivoDeObra, importarObra } from './almacen';
export { proyectar } from './proyeccion';
export { colocar } from '../layout';
export {
  definicionesDe,
  insertarEnHoja,
  migrarBloques,
  nombresSueltos,
  ordenDeLectura,
  PASO_LECTURA,
} from './hoja';
export { evaluarCarga, variablesDePartida } from './calculo';
export {
  resolverExpresion,
  camposResueltos,
  entradasEfectivas,
  evaluarImportada,
  desprender,
  quedoAtras,
} from './biblioteca';
export * from './ids';
export {
  identificadoresDe,
  problemaDeNombre,
  problemaDeAlias,
  conPublicacion,
  conFormula,
  slugificar,
  nuevaObra,
  IDENTIFICADOR_RE,
} from './modelo';

// El motor y el armado de una genérica, en el mismo bundle.
export { evaluateSheet, formatValor, parseMathRegion } from '../../lib/worksheet';
export { moduloDeBiblioteca } from '../../lib/diseno/declarativo';
export { evaluarModulo } from '../../lib/diseno/evaluar';
