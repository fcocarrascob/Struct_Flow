// Las combinaciones de carga del modelo, leídas: cómo se agrupan, qué columnas
// tiene su matriz y qué conviene revisar.
//
// Puro, sin React: lo pintan el panel y la tabla del sub-nodo Combinaciones, y
// `verify:obra` lo comprueba. Todavía no se justifica nada contra la norma: eso
// es la etapa 6 (`docs/rumbo.md`), con una hoja que genere las combinaciones.

import type { CasoLeido, Combinacion, LecturaCombinaciones, TerminoCombinacion } from './modelo';

/**
 * La familia de una combinación: el prefijo hasta el primer `_`. `B25_EX_EVP` es
 * de `B25`, `DSCF_19_WXP` de `DSCF`. Es la convención con que se nombran en la
 * práctica —una familia por fila de la norma, o por estado límite—; sin `_`, la
 * combinación es su propia familia.
 */
export function familiaDe(nombre: string): string {
  const i = nombre.indexOf('_');
  return i > 0 ? nombre.slice(0, i) : nombre;
}

/** Una columna de la matriz: un caso o una combinación que alguna usa. */
export interface ColumnaCombinaciones {
  clase: TerminoCombinacion['clase'];
  nombre: string;
}

/**
 * Las columnas de la matriz: lo que usa alguna de `combos`, sin repetir.
 *
 * Primero los casos, en el orden de los Load Cases si se leyeron (el que el
 * ingeniero ve en SAP) y si no en el de aparición; después las combinaciones
 * anidadas, en el orden de la lista.
 */
export function columnasDe(
  combos: readonly Combinacion[],
  casos?: readonly CasoLeido[],
  todas: readonly Combinacion[] = combos,
): ColumnaCombinaciones[] {
  const casosUsados = new Set<string>();
  const combosUsados = new Set<string>();
  for (const c of combos) {
    for (const t of c.terminos) (t.clase === 'caso' ? casosUsados : combosUsados).add(t.nombre);
  }
  const orden = new Map((casos ?? []).map((c, i) => [c.nombre, i]));
  const deCasos = [...casosUsados].sort((a, b) => (orden.get(a) ?? Infinity) - (orden.get(b) ?? Infinity));
  const posCombo = new Map(todas.map((c, i) => [c.nombre, i]));
  const deCombos = [...combosUsados].sort((a, b) => (posCombo.get(a) ?? Infinity) - (posCombo.get(b) ?? Infinity));
  return [
    ...deCasos.map((nombre) => ({ clase: 'caso' as const, nombre })),
    ...deCombos.map((nombre) => ({ clase: 'combinacion' as const, nombre })),
  ];
}

/** El factor con que `combo` toma esa columna, o `undefined` si no la toma. */
export function terminoDe(combo: Combinacion, col: ColumnaCombinaciones): number | undefined {
  // Un término puede repetirse (SAP lo permite): se suman, que es lo que hace SAP
  // en una suma lineal.
  let sf: number | undefined;
  for (const t of combo.terminos) {
    if (t.clase === col.clase && t.nombre === col.nombre) sf = (sf ?? 0) + t.sf;
  }
  return sf;
}

export interface ResumenCombinaciones {
  total: number;
  /** `Lineal` → 162, `Envolvente` → 3, en el orden en que aparecen. */
  porTipo: { tipo: string; n: number }[];
  /** Cada familia con cuántas combinaciones tiene, en el orden de la lista. */
  familias: { familia: string; n: number }[];
  /**
   * Los casos que ninguna combinación usa, ni directa ni anidada, y cuyos
   * patrones tampoco entran por otro caso. Solo si se leyeron los Load Cases; un
   * modal no cuenta, porque no se combina.
   */
  sinUsar: string[];
  /**
   * Los casos que ninguna combinación usa, pero cuyos patrones entran todos por
   * otro caso que sí: en el Pachón, `DEAD` y `CM_VIA` entran por `CM`. Es la
   * forma habitual de armar un modelo, no un olvido.
   */
  cubiertos: { caso: string; por: string[] }[];
  /** Las combinaciones que otra usa como término. */
  anidadas: string[];
  /** Cuántos niveles de anidamiento hay como máximo: 0 si ninguna anida. */
  profundidad: number;
  /** Los términos que nombran algo que no está: `COMB → FALTA`. */
  inexistentes: { combinacion: string; termino: string }[];
}

export function resumenCombinaciones(lectura: LecturaCombinaciones, casos?: readonly CasoLeido[]): ResumenCombinaciones {
  const porNombre = new Map(lectura.lista.map((c) => [c.nombre, c]));
  const nombresCaso = casos ? new Set(casos.map((c) => c.nombre)) : undefined;
  const porTipo = new Map<string, number>();
  const familias = new Map<string, number>();
  const usados = new Set<string>();
  const anidadas = new Set<string>();
  const inexistentes: ResumenCombinaciones['inexistentes'] = [];
  for (const c of lectura.lista) {
    porTipo.set(c.tipo, (porTipo.get(c.tipo) ?? 0) + 1);
    const f = familiaDe(c.nombre);
    familias.set(f, (familias.get(f) ?? 0) + 1);
    for (const t of c.terminos) {
      if (t.clase === 'combinacion') {
        anidadas.add(t.nombre);
        if (!porNombre.has(t.nombre)) inexistentes.push({ combinacion: c.nombre, termino: t.nombre });
      } else {
        usados.add(t.nombre);
        if (nombresCaso && !nombresCaso.has(t.nombre)) inexistentes.push({ combinacion: c.nombre, termino: t.nombre });
      }
    }
  }

  // La profundidad, con memoria y a salvo de un ciclo (SAP no los permite, pero
  // una lectura guardada es un archivo que cualquiera puede editar).
  const nivel = new Map<string, number>();
  const nivelDe = (nombre: string, camino: Set<string>): number => {
    const hecho = nivel.get(nombre);
    if (hecho !== undefined) return hecho;
    const c = porNombre.get(nombre);
    if (!c || camino.has(nombre)) return 0;
    camino.add(nombre);
    let n = 0;
    for (const t of c.terminos) if (t.clase === 'combinacion') n = Math.max(n, 1 + nivelDe(t.nombre, camino));
    camino.delete(nombre);
    nivel.set(nombre, n);
    return n;
  };
  const profundidad = lectura.lista.reduce((m, c) => Math.max(m, nivelDe(c.nombre, new Set())), 0);

  // Qué casos combinados llevan cada patrón: un caso sin combinar cuyos patrones
  // entran todos por alguno de estos está cubierto.
  const quienLleva = new Map<string, string[]>();
  for (const c of casos ?? []) {
    if (!usados.has(c.nombre)) continue;
    for (const k of c.cargas ?? []) quienLleva.set(k.nombre, [...(quienLleva.get(k.nombre) ?? []), c.nombre]);
  }
  const sinUsar: string[] = [];
  const cubiertos: ResumenCombinaciones['cubiertos'] = [];
  for (const c of casos ?? []) {
    if (c.tipo === 'Modal' || usados.has(c.nombre)) continue;
    const patrones = (c.cargas ?? []).map((k) => k.nombre);
    const por = patrones.length && patrones.every((p) => quienLleva.has(p)) ? patrones.flatMap((p) => quienLleva.get(p)!) : [];
    if (por.length) cubiertos.push({ caso: c.nombre, por: [...new Set(por)] });
    else sinUsar.push(c.nombre);
  }

  return {
    total: lectura.lista.length,
    porTipo: [...porTipo].map(([tipo, n]) => ({ tipo, n })),
    familias: [...familias].map(([familia, n]) => ({ familia, n })),
    sinUsar,
    cubiertos,
    anidadas: lectura.lista.filter((c) => anidadas.has(c.nombre)).map((c) => c.nombre),
    profundidad,
    inexistentes,
  };
}

/** El factor como se lee en la tabla: `1,2`, `-0,525`, sin ceros de más. */
export function factorDe(sf: number): string {
  return String(Number(sf.toPrecision(6))).replace('.', ',').replace('-', '−');
}
