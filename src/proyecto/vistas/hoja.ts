// La hoja que sintetiza una vista geométrica: es lo que se imprime y lo que vota.
//
// El dibujo es solo el final. Arriba van los datos con los que se armó el modelo
// —los atados, con su valor ya resuelto; los propios, con su supuesto—, cada
// medida geométrica con el criterio con que se tomó, cada verificación como una
// comparación que el motor evalúa y los valores derivados. Así una verificación
// geométrica se audita igual que una de norma: la medida está escrita, el límite
// también, y el ✓ o el ✗ lo pone el motor.
//
// Los ids son `<idBase>:<n>` y deterministas: la hoja no se guarda, se vuelve a
// sintetizar en cada evaluación, y sus resultados tienen que caer siempre en las
// mismas claves.

import type { Region } from '../../lib/worksheet';
import type { DefVista, ModeloGeometrico } from './tipos';

/** Un número como literal de fórmula: punto decimal, sin exponente para lo usual. */
const lit = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));
const conUnidad = (v: number, unidad: string) => (unidad ? `${lit(v)} ${unidad}` : lit(v));
/** El nombre de la medida de una verificación: `v_gol_gol` mide `m_gol_gol`. */
const medida = (id: string) => `m_${id.replace(/^v_/, '')}`;

export function hojaDeVista(
  def: DefVista,
  datos: Record<string, number>,
  atados: ReadonlySet<string>,
  m: ModeloGeometrico,
  idBase: string,
): Region[] {
  const bloques: { kind: 'text' | 'math'; src: string }[] = [];
  const t = (src: string) => bloques.push({ kind: 'text', src });
  const f = (src: string) => bloques.push({ kind: 'math', src });

  t(`# ${def.titulo} — geometría`);
  t(
    'Modelo geométrico de la base armado con los mismos datos que usan sus cálculos. Comprueba que las ' +
      'piezas no choquen y que lo que las hojas de cálculo declaran de la geometría sea lo que la geometría da.',
  );

  t('## Datos');
  for (const c of def.campos) {
    if (!atados.has(c.nombre) && c.supuesto) t(`Supuesto: ${c.supuesto}.`);
    f(`${c.nombre} := ${conUnidad(datos[c.nombre], c.unidad)}`);
  }

  t('## Verificaciones geométricas');
  for (const c of m.chequeos) {
    t(c.texto + '.');
    f(`${medida(c.id)} := ${conUnidad(c.valor, c.unidad)}`);
    f(`${c.id} := ${medida(c.id)} ${c.sentido} ${conUnidad(c.limite, c.unidad)} =`);
  }

  t('## Valores derivados');
  for (const d of m.derivados) {
    t(`${d.criterio[0].toUpperCase()}${d.criterio.slice(1)}.`);
    f(`${d.nombre} := ${conUnidad(d.valor, d.unidad)} =`);
  }

  t('## Resumen');
  f(`v_global := ${m.chequeos.map((c) => c.id).join(' and ') || 'true'} =`);

  return bloques.map((b, i) => ({ id: `${idBase}:${i + 1}`, kind: b.kind, x: 40, y: 40 + i * 48, src: b.src }));
}
