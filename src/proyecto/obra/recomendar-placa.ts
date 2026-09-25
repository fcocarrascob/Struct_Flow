// Qué placa conviene a un tipo de apoyo: la rotulada o la de momento. Es una
// sugerencia para el diálogo «+ base»; decide el ingeniero.
//
// La rotulada resuelve el momento bajo (DG1 §4.3.7): con e ≤ e_crit la compresión
// se equilibra solo por aplastamiento, y el arranque se trata concéntrico (DG1
// §4.3.2). Así que hace falta la de momento en cuanto una gobernante tracciona
// con momento, o comprime con e > e_crit. El e_crit se mide con la placa
// rotulada DE PARTIDA de la plantilla —si ni con ella cabe, la de momento es la
// que toca—, que es lo que la rotulada vota en su v_dominio_comp.
//
// Puro, sin React: lo lee el diálogo y lo comprueba `verify:obra`.

import type { Obra } from './modelo';
import { CRITERIOS, envolventeDeTipo, tiposDeApoyo } from './sap-apoyos';

/** Una gobernante del tipo en un conjunto: N en kN (compresión positiva) y M en kN·m. */
export interface Solicitacion {
  conjunto: string;
  criterio: string;
  N: number;
  M: number;
}

/**
 * La placa rotulada con que parte la plantilla (`plantilla.ts`, secciones
 * `placa-rot` y `materiales`): 700 × 500 mm sobre f'c = 30 MPa. Sin confinamiento
 * (√(A2/A1) = 1), que es el e_crit más chico: la sugerencia se inclina a la de
 * momento.
 */
export const PLACA_ROTULADA_DE_PARTIDA = { L_mm: 700, B_mm: 500, fc_MPa: 30 } as const;

/** Por debajo de esto el momento es cero: el ruido numérico de SAP. */
const M_CERO = 1e-3;

export interface Recomendacion {
  variante: 'momento' | 'rotulada';
  motivo: string;
}

/** Las gobernantes del tipo en cada conjunto leído, como las publica el nodo de apoyos. */
export function solicitacionesDeTipo(obra: Obra, grupoSap: string): Solicitacion[] {
  const sap = obra.sap;
  if (!sap?.apoyos) return [];
  const tipo = tiposDeApoyo(sap.apoyos).tipos.find((t) => t.grupo === grupoSap);
  if (!tipo) return [];
  const salida: Solicitacion[] = [];
  for (const c of obra.conjuntosDiseno ?? []) {
    const lectura = sap.conjuntos?.[c.id];
    if (!lectura) continue;
    const env = envolventeDeTipo(lectura, tipo.apoyos);
    for (const { k } of CRITERIOS) {
      const g = env[k];
      if (g) salida.push({ conjunto: c.nombre, criterio: k, N: g.v[2], M: Math.hypot(g.v[3], g.v[4]) });
    }
  }
  return salida;
}

const n0 = (v: number) => Math.round(v).toLocaleString('es-CL');

export function recomendarPlaca(
  sol: readonly Solicitacion[],
  placa: { L_mm: number; B_mm: number; fc_MPa: number } = PLACA_ROTULADA_DE_PARTIDA,
): Recomendacion | null {
  if (!sol.length) return null;
  const conMomento = sol.find((s) => s.N < 0 && s.M > M_CERO);
  if (conMomento) {
    return {
      variante: 'momento',
      motivo: `tracciona con momento (${conMomento.criterio}, ${conMomento.conjunto}: N = ${n0(conMomento.N)} kN, M = ${n0(conMomento.M)} kN·m)`,
    };
  }
  // DG1 Ec. 4-37 y 4-40, con φ = 0,65 y el bloque de 0,85·f'c del §J8.
  const fp = 0.65 * 0.85 * placa.fc_MPa; // N/mm² = MPa
  const qMax = fp * placa.B_mm; // N/mm
  let peor: { s: Solicitacion; e: number; eCrit: number } | undefined;
  for (const s of sol) {
    if (s.N <= 0) continue;
    const e = (s.M * 1e6) / (s.N * 1e3); // mm
    const eCrit = placa.L_mm / 2 - (s.N * 1e3) / (2 * qMax);
    if (!peor || e - eCrit > peor.e - peor.eCrit) peor = { s, e, eCrit };
  }
  const dim = `${placa.L_mm}×${placa.B_mm}`;
  if (peor && peor.e > peor.eCrit) {
    return {
      variante: 'momento',
      motivo:
        `con la rotulada de partida (${dim}), e = ${n0(peor.e)} mm supera e_crit = ${n0(peor.eCrit)} mm ` +
        `(${peor.s.criterio}, ${peor.s.conjunto})`,
    };
  }
  const mMax = Math.max(...sol.map((s) => s.M));
  return {
    variante: 'rotulada',
    motivo:
      mMax <= M_CERO
        ? 'el apoyo no transmite momento'
        : `momento bajo: e máx = ${n0(peor?.e ?? 0)} mm ≤ e_crit = ${n0(peor?.eCrit ?? 0)} mm con la rotulada de partida (${dim})`,
  };
}
