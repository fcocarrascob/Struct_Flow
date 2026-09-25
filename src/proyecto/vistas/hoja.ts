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
import { svgVistas } from './svg';
import type { Campo, Config, DefVista, ModeloGeometrico } from './tipos';

/** Un número como literal de fórmula: punto decimal, sin exponente para lo usual. */
const lit = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));
const conUnidad = (v: number, unidad: string) => (unidad ? `${lit(v)} ${unidad}` : lit(v));
/** El nombre de la medida de una verificación: `v_gol_gol` mide `m_gol_gol`. */
const medida = (id: string) => `m_${id.replace(/^v_/, '')}`;

export function hojaDeVista(
  def: DefVista,
  config: Config,
  campos: Campo[],
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
  // Solo se dice lo que se aparta de la base por defecto: la completa no lleva la
  // línea, y su hoja es la misma que antes de que existieran las opciones.
  const otras = def.opciones
    .filter((o) => config[o.clave] !== 'no' && config[o.clave] !== o.porDefecto)
    .map((o) => `${o.titulo.toLowerCase()} ${o.variantes.find((v) => v.id === config[o.clave])?.titulo.toLowerCase() ?? ''}`.trim());
  const faltan = def.opciones.filter((o) => config[o.clave] === 'no').map((o) => o.titulo.toLowerCase());
  const partes = [...otras, ...(faltan.length ? [`sin ${faltan.join(' ni ')}`] : [])];
  if (partes.length) t(`Configuración: ${partes.join('; ')}.`);

  t('## Datos');
  for (const c of campos) {
    if (!atados.has(c.nombre) && c.supuesto) t(`Supuesto: ${c.supuesto}.`);
    f(`${c.nombre} := ${conUnidad(datos[c.nombre], c.unidad)}`);
  }

  t('## Verificaciones geométricas');
  for (const c of m.chequeos) {
    t(c.aviso ? `AVISO, NO VOTA: ${c.texto}.` : c.texto + '.');
    f(`${medida(c.id)} := ${conUnidad(c.valor, c.unidad)}`);
    f(`${c.id} := ${medida(c.id)} ${c.sentido} ${conUnidad(c.limite, c.unidad)} =`);
  }

  t('## Valores derivados');
  for (const d of m.derivados) {
    t(`${d.criterio[0].toUpperCase()}${d.criterio.slice(1)}.`);
    f(`${d.nombre} := ${conUnidad(d.valor, d.unidad)} =`);
  }

  t('## Resumen');
  f(`v_global := ${m.chequeos.filter((c) => !c.aviso).map((c) => c.id).join(' and ') || 'true'} =`);

  const regiones: Region[] = bloques.map((b, i) => ({ id: `${idBase}:${i + 1}`, kind: b.kind, x: 40, y: 40 + i * 48, src: b.src }));

  // El dibujo, al pie: un SVG autocontenido en línea, que el papel y la pestaña
  // pintan como cualquier imagen. No es un esquema de `/esquemas/`: no tiene
  // tokens que resolver, porque sale del mismo modelo que las verificaciones.
  const dibujo = svgVistas(m);
  if (dibujo.svg) {
    regiones.push({
      id: `${idBase}:dibujo`,
      kind: 'image',
      x: 40,
      y: 40 + bloques.length * 48,
      src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(dibujo.svg)}`,
      w: dibujo.ancho,
      h: dibujo.alto,
    });
  }
  return regiones;
}
