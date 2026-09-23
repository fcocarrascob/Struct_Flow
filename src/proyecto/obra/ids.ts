// Los ids con que cada cosa de la obra se pinta en el canvas.
//
// Viven aparte de `proyeccion.ts` porque los necesitan los dos lados —la
// proyección, que dibuja, y la evaluación, que ordena por dependencia— y
// tenerlos en uno de ellos haría que el otro lo importara en círculo.
//
// El prefijo no es decorativo: el canvas maneja un solo `seleccion: string`, y
// de él tiene que poder deducirse qué clase de panel abrir.

export const ID_NODO_CARGAS = 'cargas';
export const ID_NODO_SAP = 'sap';

const PREFIJO_CARGA = 'carga:';
const PREFIJO_SUBCARGA = 'partida:';
const PREFIJO_CALCULO = 'calculo:';

export function idNodoDeCarga(id: string): string {
  return PREFIJO_CARGA + id;
}
export function idNodoDeSubcarga(id: string): string {
  return PREFIJO_SUBCARGA + id;
}
export function idNodoDeCalculo(id: string): string {
  return PREFIJO_CALCULO + id;
}

export function cargaDeNodo(idNodo: string): string | null {
  return idNodo.startsWith(PREFIJO_CARGA) ? idNodo.slice(PREFIJO_CARGA.length) : null;
}
export function subcargaDeNodo(idNodo: string): string | null {
  return idNodo.startsWith(PREFIJO_SUBCARGA) ? idNodo.slice(PREFIJO_SUBCARGA.length) : null;
}
export function calculoDeNodo(idNodo: string): string | null {
  return idNodo.startsWith(PREFIJO_CALCULO) ? idNodo.slice(PREFIJO_CALCULO.length) : null;
}
