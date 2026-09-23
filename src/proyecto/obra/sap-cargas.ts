// Cómo se lee una carga asignada en SAP2000, en palabras.
//
// Puro, sin React: el panel del nodo SAP2000 lo pinta y `verify:obra` lo
// comprueba. Los valores llegan del puente en kN, m y °C (`puente-sap/puente.py`,
// `cargas`), así que la unidad sale de la clase y no hay que convertir nada.

import type { CargaAsignada } from './modelo';

/** Los códigos de dirección de la API de SAP2000. */
const DIRECCION: Record<number, string> = {
  1: 'local 1',
  2: 'local 2',
  3: 'local 3',
  4: 'X global',
  5: 'Y global',
  6: 'Z global',
  7: 'X proyectada',
  8: 'Y proyectada',
  9: 'Z proyectada',
  10: 'gravedad',
  11: 'gravedad proyectada',
};

/** Cuatro cifras significativas y coma decimal: `0,09807`, no `0.0980665`. */
export function cifra(n: number): string {
  return String(Number(n.toPrecision(4))).replace('.', ',');
}

export function unidadDe(c: CargaAsignada): string {
  switch (c.clase) {
    case 'barra-distribuida':
      return c.momento ? 'kN·m/m' : 'kN/m';
    case 'barra-puntual':
      return c.momento ? 'kN·m' : 'kN';
    case 'area-uniforme':
    case 'area-a-barras':
      return 'kN/m²';
    case 'nudo':
      return c.componente?.startsWith('M') ? 'kN·m' : 'kN';
    case 'barra-temperatura':
      return '°C';
  }
}

/** El valor con su unidad. Una distribuida no uniforme dice de cuánto a cuánto. */
export function valorDe(c: CargaAsignada): string {
  const u = unidadDe(c);
  if (c.clase === 'barra-distribuida' && c.valor2 !== undefined) {
    return `${cifra(c.valor)} → ${cifra(c.valor2)} ${u}`;
  }
  return `${cifra(c.valor)} ${u}`;
}

/** Cómo está aplicada: la clase, dónde y en qué dirección. */
export function comoDe(c: CargaAsignada): string {
  const partes: string[] = [];
  switch (c.clase) {
    case 'barra-distribuida':
      partes.push(
        c.valor2 !== undefined
          ? `distribuida en barra, de ${cifra(c.desde ?? 0)} a ${cifra(c.hasta ?? 1)} de la longitud`
          : 'distribuida en barra',
      );
      break;
    case 'barra-puntual':
      partes.push(`puntual en barra, a ${cifra(c.en ?? 0)} de la longitud`);
      break;
    case 'area-uniforme':
      partes.push('uniforme en área');
      break;
    case 'area-a-barras':
      partes.push(`área a barras, ${c.dist === 2 ? 'dos direcciones' : 'una dirección'}`);
      break;
    case 'nudo':
      partes.push(`en nudo, ${c.componente ?? '?'}`);
      break;
    case 'barra-temperatura':
      partes.push('temperatura en barra');
      break;
  }
  if (c.dir !== undefined) {
    const dir = DIRECCION[c.dir] ?? `dirección ${c.dir}`;
    // Una dirección local solo se entiende con su sistema: «local 3» de un área
    // no es la de una barra. Una global no lo necesita.
    partes.push(c.csys && c.csys.toUpperCase() !== 'GLOBAL' && c.dir <= 3 ? `${dir} (${c.csys})` : dir);
  } else if (c.clase === 'nudo' && c.csys && c.csys.toUpperCase() !== 'GLOBAL') {
    partes.push(c.csys);
  }
  return partes.join(' · ');
}

/** Sobre cuántos objetos, con el sustantivo de su clase. */
export function objetosDe(c: CargaAsignada): string {
  const [uno, varios] =
    c.clase === 'area-uniforme' || c.clase === 'area-a-barras'
      ? ['área', 'áreas']
      : c.clase === 'nudo'
        ? ['nudo', 'nudos']
        : ['barra', 'barras'];
  return `${c.n} ${c.n === 1 ? uno : varios}`;
}

/** Las cargas de cada patrón, en el orden en que llegaron. */
export function cargasPorPatron(lista: readonly CargaAsignada[]): Map<string, CargaAsignada[]> {
  const m = new Map<string, CargaAsignada[]>();
  for (const c of lista) {
    const l = m.get(c.patron);
    if (l) l.push(c);
    else m.set(c.patron, [c]);
  }
  return m;
}
