const SUPERINDICE: Record<string, string> = { '2': '²', '3': '³', '4': '⁴' };

/**
 * Un valor formateado por el motor, legible en una tarjeta: `kN / m^2` pasa a
 * `kN/m²`.
 *
 * Aquí y no en `formatValor`: aquel es del motor, y cambiarlo resellaría todas las
 * planillas del harness por un asunto de tipografía. En la hoja no hace falta,
 * porque la hoja pinta LaTeX; la tarjeta es texto plano.
 */
export function legible(texto: string): string {
  return texto.replace(/\^([234])(?!\d)/g, (_, d: string) => SUPERINDICE[d]).replace(/ \/ /g, '/');
}
