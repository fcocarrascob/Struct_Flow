// ─────────────────────────────────────────────────────────────────────────────
// La hoja de un nodo: una lista de `Region`, y las reglas de dónde cae cada una.
//
// POR QUÉ `Region` Y NO UNA LISTA DE BLOQUES SIN COORDENADAS
// ---------------------------------------------------------
// Es el tipo que ya usan `evaluateSheet`, `hoja-json.ts`, `WorksheetPrint` y la
// biblioteca entera. La hoja de un nodo se va a poder abrir en el canvas
// matemático, y convertir entre dos formatos en cada frontera es donde
// aparecerían los bugs. La mini hoja del panel es una vista en ORDEN DE LECTURA
// sobre estas regiones y la pestaña es la vista en el plano: las dos editan el
// mismo dato. El día que la hoja grande migre al flujo lineal
// (`docs/pendientes.md`, «El norte cambió»), las `x`/`y` desaparecen de los dos
// sitios a la vez y ninguna de las dos vistas se entera.
//
// POR QUÉ ESTE ARCHIVO, Y AQUÍ
// ----------------------------
// Una sola casa para las reglas de `y`, para que la mini hoja y la pestaña no
// puedan discrepar. Y en `src/proyecto/obra/` y no en `src/lib/` por la razón de
// siempre: el harness sella el motor como el hash de árbol de `src/lib` +
// `scripts`, y mover ese hash marca `eval_de_otro_motor` en todas las planillas
// de todos sus proyectos. De `src/lib` se importa; no se toca.
// ─────────────────────────────────────────────────────────────────────────────

import { parseMathRegion, type Region, type RegionKind } from '../../lib/worksheet';
import { parseProgram } from '../../lib/program';
import { abrirHueco, mismoOrdenDeLectura } from '../../lib/solapes';
import { sanearRegiones } from '../../lib/hoja-json';
import { INTRINSECOS } from '../../lib/canvas-handoff';
import { identificadoresDe } from './modelo';

/**
 * Dónde empieza una hoja. Son los mismos de `SiluetaPapel.tsx`, repetidos a
 * propósito: aquel es un componente de React y este módulo lo compila esbuild
 * para Node (`engine.ts`), así que importarlo arrastraría React al verificador.
 */
export const ORIGEN_X = 40;
export const ORIGEN_Y = 40;

/**
 * El paso con el que el canvas coloca el bloque siguiente:
 * `ALTO_POR_DEFECTO` (24) + `AIRE_TRAS_BLOQUE` (24). Es el paso con el que está
 * escrito el corpus —7.471 de los 8.344 saltos verticales miden exactamente
 * esto— y el de la hoja de ejemplo.
 */
export const PASO_LECTURA = 48;

/**
 * La hoja en orden de lectura.
 *
 * Es el MISMO comparador que `evaluateSheet`. Una segunda semántica del orden de
 * lectura sería una segunda semántica del scope compartido, que es lo que ese
 * orden resuelve.
 */
export function ordenDeLectura(hoja: readonly Region[]): Region[] {
  return [...hoja].sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Lo que la hoja define, en orden de lectura.
 *
 * `parseMathRegion` y `parseProgram` son las MISMAS funciones con las que el
 * motor decide si una región define algo. Detectar el `:=` por nuestra cuenta
 * sería una segunda gramática, y bastaría un caso raro para que discreparan.
 *
 * LOS PROGRAMAS CUENTAN. Una función de usuario solo se puede escribir en una
 * región `program` —en una `math`, `f(x) := …` es un error de sintaxis—, así que
 * mirar solo las `math` dejaba a toda función sin dueño: el nodo que la llamaba
 * no recibía flecha, podía quedar delante en el orden de lectura y fallar con
 * «Undefined function», y el panel ofrecía atarla como si fuera una entrada.
 */
export function definicionesDe(hoja: readonly Region[]): string[] {
  const nombres: string[] = [];
  for (const r of ordenDeLectura(hoja)) {
    const v = r.kind === 'math' ? parseMathRegion(r.src).varName : r.kind === 'program' ? cabeceraDePrograma(r.src) : undefined;
    if (v && !nombres.includes(v)) nombres.push(v);
  }
  return nombres;
}

/** El nombre que define un programa por su cabecera, o nada. Un programa que no
 *  parsea no define nada: el motor dirá por qué en su propio bloque. */
function cabeceraDePrograma(src: string): string | undefined {
  try {
    return parseProgram(src).name;
  } catch {
    return undefined;
  }
}

/**
 * Los nombres que la hoja USA y no define: sus entradas, aunque nadie las haya
 * declarado.
 *
 * Es lo que una hoja propia necesita para poder atarse a la obra. Una genérica
 * declara sus campos en `meta.entradas` y el formulario sale de ahí; una hoja
 * escrita a mano no declara nada, así que lo único honesto es leerlo de lo que
 * está escrito: si una fórmula nombra `L_ext` y ninguna línea la define, esa es
 * una entrada del cálculo.
 *
 * Se descartan las unidades y las funciones del motor con `INTRINSECOS`, que es
 * la misma lista con la que `problemaDeAlias` impide llamar `m` o `min` a un
 * alias. Sin ella, `kN` y `sqrt` aparecerían como entradas que faltan.
 */
export function nombresSueltos(hoja: readonly Region[]): string[] {
  const define = new Set(definicionesDe(hoja));
  const sueltos: string[] = [];
  for (const r of ordenDeLectura(hoja)) {
    if (r.kind !== 'math') continue;
    for (const id of identificadoresDe(r.src)) {
      if (define.has(id) || INTRINSECOS.has(id) || sueltos.includes(id)) continue;
      sueltos.push(id);
    }
  }
  return sueltos;
}

/** Un bloque de las obras guardadas antes de que el nodo llevara regiones. */
interface BloqueViejo {
  id?: unknown;
  tipo?: unknown;
  src?: unknown;
}

/**
 * Convierte la lista de bloques sin coordenadas que guardaban las obras a una
 * hoja de regiones.
 *
 * SINTETIZA LAS COORDENADAS ANTES DE VALIDAR NADA, y ese orden importa:
 * `esRegion` exige `x` e `y` finitos, así que validar primero descartaría las
 * regiones de cada nodo y la obra abriría VACÍA. Es un modo de fallo que no
 * avisa de nada, y por eso tiene su propio caso en `verify:obra`.
 *
 * El orden del array ERA el orden de lectura, así que se reparte el paso de la
 * cuadrícula desde el origen del papel: la hoja migrada se abre en el canvas con
 * la misma forma que tendría si se hubiera escrito ahí.
 */
export function migrarBloques(crudo: unknown): unknown[] {
  if (!Array.isArray(crudo)) return [];
  return crudo.map((b: BloqueViejo, i) => ({
    id: b?.id,
    kind: (b?.tipo === 'text' ? 'text' : 'math') as RegionKind,
    x: ORIGEN_X,
    y: ORIGEN_Y + i * PASO_LECTURA,
    src: b?.src,
  }));
}

/**
 * Dónde cae un bloque nuevo escrito «detrás de» otro.
 *
 * Tres decisiones, y las tres salen de que la mini hoja y la pestaña editan el
 * mismo dato:
 *
 * - **La `x` se hereda del bloque de referencia**, no del origen del papel. Si
 *   el autor abrió una segunda columna en la pestaña, escribir debajo de un
 *   bloque de esa columna tiene que caer en esa columna.
 * - **Si el hueco ya estaba, no se mueve nada.** Es el caso corriente al final
 *   de la hoja, y también el de un hueco deliberado.
 * - **Si no cabe, se abre con `abrirHueco`**, que solo baja lo que está en esa
 *   `y` o más abajo: lo de arriba no se toca nunca. NO se renumera la hoja, que
 *   es lo que haría una lista: eso desharía la disposición hecha en el canvas.
 */
export function insertarEnHoja(
  hoja: readonly Region[],
  nueva: Region,
  despuesDe?: string,
): Region[] {
  const orden = ordenDeLectura(hoja);
  if (orden.length === 0) return [{ ...nueva, x: ORIGEN_X, y: ORIGEN_Y }];

  // Un `despuesDe` que ya no está en la hoja apunta al final y no al principio,
  // que es lo que pide quien está escribiendo hacia abajo.
  const i = despuesDe ? orden.findIndex((r) => r.id === despuesDe) : -1;
  const ancla = orden[i >= 0 ? i : orden.length - 1];
  const siguiente = orden[(i >= 0 ? i : orden.length - 1) + 1];

  const colocada: Region = { ...nueva, x: ancla.x, y: ancla.y + PASO_LECTURA };
  if (!siguiente || siguiente.y >= colocada.y + PASO_LECTURA) {
    return [...hoja, colocada];
  }

  const falta = colocada.y + PASO_LECTURA - siguiente.y;
  const corrida = abrirHueco(hoja, siguiente.y, falta);
  const salida = [...corrida, colocada];
  // El orden de lectura resuelve el scope, y ahí no se razona: se comprueba, que
  // es lo que pide el propio docstring de `abrirHueco`. Si algo adelantara a
  // otro, se deja la hoja como estaba y el bloque al final.
  if (!mismoOrdenDeLectura(hoja, corrida)) {
    const ultima = orden[orden.length - 1];
    return [...hoja, { ...nueva, x: ancla.x, y: ultima.y + PASO_LECTURA }];
  }
  return salida;
}

/**
 * La hoja de un nodo, saneada.
 *
 * Dos pasos, y son de dos dueños distintos:
 *
 * - **La forma** la decide `sanearRegiones`, del motor: descarta lo que no es
 *   una región —`src` que no es texto, `kind` fuera del catálogo, coordenadas no
 *   finitas— y deduplica con su propio `Set`, que cubre este nodo y solo este.
 * - **La unicidad dentro de la obra** la decide `vistos`, que el almacén comparte
 *   entre todos los nodos. Sin él, traer las regiones de una misma genérica a dos
 *   nodos les daría los mismos ids — y los ids de región son las claves de
 *   `results` en la hoja global de la obra, la `key` de React y el filtro del
 *   autocompletado.
 */
export function sanearHoja(crudo: unknown, vistos: Set<string>, nuevoId: () => string): Region[] {
  const lista = Array.isArray(crudo) ? crudo : [];
  return sanearRegiones(lista).map((r) => {
    const id = vistos.has(r.id) ? nuevoId() : r.id;
    vistos.add(id);
    return id === r.id ? r : { ...r, id };
  });
}
