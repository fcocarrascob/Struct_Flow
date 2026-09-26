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
export { partirObra, unirObra } from './carpeta';
export { proyectar } from './proyeccion';
export { colocar, colocarPorGrupo } from '../layout';
export {
  definicionesDe,
  insertarEnHoja,
  migrarBloques,
  nombresSueltos,
  ordenDeLectura,
  PASO_LECTURA,
  regionQueDefine,
} from './hoja';
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
  problemaDeAlias,
  conPublicacion,
  conFormula,
  slugificar,
  nuevaObra,
  IDENTIFICADOR_RE,
  agregarGrupo,
  asignarGrupo,
  borrarGrupo,
  marcarRevision,
  porRevisar,
  nuevoId,
} from './modelo';
export { trazoDe, ladoDe } from './trazo';
export {
  obraDesde,
  traerNodos,
  dependenciasDe,
  choquesCon,
  nombresDefinidos,
  trasladarPosiciones,
} from './copia';
export {
  valorDe,
  comoDe,
  objetosDe,
  cargasPorPatron,
  firmaDe,
  cargaDe,
  verificar,
  verificarFactor,
  verificarFuncion,
  verificarEscalar,
  verificarDelModelo,
  resumirPorParte,
  parteDe,
  esJustificable,
  resumirJustificaciones,
} from './sap-cargas';

export { familiaDe, columnasDe, terminoDe, resumenCombinaciones } from './sap-combinaciones';
export { quitarModulo, agregarModulo } from './modelo';
export { resumenModal, atrasoDe, MASA_MINIMA } from './sap-modal';
export { cortesSismicos, gravitacionalesConHorizontal, fuerza } from './sap-basal';
export {
  extremosDeCaso,
  extremosPorCaso,
  casosConTraccion,
  descuadresConBasal,
  combosDeConjunto,
  gobernantesDeConjunto,
  estadoConjunto,
  extremosDeConjunto,
  tiposDeApoyo,
  envolventeDeTipo,
  aliasPorDefecto,
  publicaApoyos,
} from './sap-apoyos';
export { nuevoConjunto, conConjunto, quitarConjunto, conAliasTipo } from './modelo';
export { VISTAS, camposActivos, configCompleta, datosPorDefecto } from '../vistas/registro';
export {
  armarEnsamble,
  reconfigurar,
  actualizarPlantilla,
  actualizarBase,
  desfaseDePlantilla,
  nombresPropios,
  problemasDePlantilla,
  huellaDePlantilla,
  corrimientos,
  versionDeBase,
  estadoDePlantilla,
} from './ensamble';
export { invariantesDeObra } from './invariantes';
export { compararObras, comparacionEnTexto } from './propuesta';
export { puertosCompatibles, gobernanteDe, concurrenteEn } from './puertos';
export { recomendarPlaca, solicitacionesDeTipo, PLACA_ROTULADA_DE_PARTIDA } from './recomendar-placa';
export { cumple } from '../vistas/condicion';
export { barrasPerimetro, abscisasPernos, abscisasNervios } from '../vistas/base-columna/modelo';
export { TIPOLOGIAS_BASE_COLUMNA } from '../vistas/base-columna/campos';
export { svgVistas } from '../vistas/svg';

// El motor y el armado de una genérica, en el mismo bundle.
export { evaluateSheet, formatValor, parseMathRegion } from '../../lib/worksheet';
export { moduloDeBiblioteca } from '../../lib/diseno/declarativo';
export { evaluarModulo } from '../../lib/diseno/evaluar';
