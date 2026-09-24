import { useState } from 'react';
import type { Region } from '../../lib/worksheet';
import type { Sugerencia } from '../../lib/autocompletar';
import {
  ALTOS_GRAFICO,
  LADOS_ETIQUETA,
  MARCADORES,
  MAX_REFERENCIAS,
  MAX_SERIES,
  POSICIONES_ETIQUETA,
  POSICIONES_LEYENDA,
  TRAZOS,
  type EspecGrafico,
  type EspecReferencia,
  type EspecSerie,
  type LadoEtiqueta,
  type Marcador,
  type PosicionEtiqueta,
  type PosicionLeyenda,
  type Trazo,
} from '../../lib/grafico';
import { boton, CampoExpr, CampoTexto, entrada, etiqueta, Seccion } from './PanelPropiedades';

/**
 * Las propiedades de un gráfico: lo que se dibuja y cómo. Va dentro de
 * `PanelPropiedades`, que pone el armazón y la banda de error o aviso.
 */
interface Props {
  region: Region & { grafico: EspecGrafico };
  /** Los nombres que la hoja define por encima del gráfico, para autocompletar. */
  sugerencias?: readonly Sugerencia[];
  onCambiar: (grafico: EspecGrafico, titulo: string) => void;
  onListo: () => void;
}

const NOMBRE_TRAZO: Record<Trazo, string> = {
  continuo: 'continuo',
  discontinuo: 'discontinuo',
  punteado: 'punteado',
  'trazo-punto': 'trazo y punto',
};
const NOMBRE_MARCADOR: Record<Marcador, string> = {
  ninguno: 'sin marcador',
  circulo: 'círculo',
  cuadrado: 'cuadrado',
  triangulo: 'triángulo',
  rombo: 'rombo',
};

export default function CuerpoGrafico({ region, sugerencias, onCambiar, onListo }: Props) {
  const espec = region.grafico;
  const [abierta, setAbierta] = useState(0);
  const cambiar = (parcial: Partial<EspecGrafico>, titulo = region.src) => onCambiar({ ...espec, ...parcial }, titulo);

  const cambiarSerie = (i: number, s: EspecSerie) => cambiar({ series: espec.series.map((x, k) => (k === i ? s : x)) });
  const moverSerie = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= espec.series.length) return;
    const series = [...espec.series];
    [series[i], series[j]] = [series[j], series[i]];
    cambiar({ series });
    setAbierta(j);
  };
  const quitarSerie = (i: number) => {
    cambiar({ series: espec.series.filter((_, k) => k !== i) });
    setAbierta(Math.max(0, i - 1));
  };
  const agregarSerie = (tipo: EspecSerie['tipo']) => {
    const n = espec.series.length + 1;
    const nueva: EspecSerie =
      tipo === 'funcion'
        ? { tipo, nombre: `Serie ${n}`, expr: '', variable: espec.series.find((s) => s.tipo === 'funcion')?.variable ?? 'x', desde: '', hasta: '' }
        : { tipo, nombre: `Serie ${n}`, xy: '' };
    cambiar({ series: [...espec.series, nueva] });
    setAbierta(espec.series.length);
  };

  const referencias = espec.referencias ?? [];
  const cambiarRef = (i: number, r: EspecReferencia) =>
    cambiar({ referencias: referencias.map((x, k) => (k === i ? r : x)) });

  return (
    <>
      <Seccion titulo="Título">
        <CampoTexto
          valor={region.src}
          onChange={(v) => onCambiar(espec, v)}
          placeholder="Espectro de diseño"
          titulo="Se imprime centrado sobre la figura"
          onListo={onListo}
        />
      </Seccion>

      <Seccion
        titulo={`Series (${espec.series.length})`}
        extra={
          <span className="flex gap-1">
            <button type="button" className={boton} disabled={espec.series.length >= MAX_SERIES} onClick={() => agregarSerie('funcion')}>
              + función
            </button>
            <button type="button" className={boton} disabled={espec.series.length >= MAX_SERIES} onClick={() => agregarSerie('datos')}>
              + datos
            </button>
          </span>
        }
      >
        {espec.series.map((s, i) => (
          <div key={i} className="rounded border border-border bg-white">
            <div className="flex items-center gap-1 px-1.5 py-1">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-ink"
                onClick={() => setAbierta(abierta === i ? -1 : i)}
                aria-expanded={abierta === i}
              >
                {abierta === i ? '▾' : '▸'} {s.nombre || `Serie ${i + 1}`}{' '}
                <span className="font-normal text-muted">· {s.tipo === 'funcion' ? 'función' : 'datos'}</span>
              </button>
              <button type="button" className={boton} onClick={() => moverSerie(i, -1)} disabled={i === 0} title="Subir">
                ↑
              </button>
              <button type="button" className={boton} onClick={() => moverSerie(i, 1)} disabled={i === espec.series.length - 1} title="Bajar">
                ↓
              </button>
              <button type="button" className={boton} onClick={() => quitarSerie(i)} disabled={espec.series.length === 1} title="Quitar la serie">
                ×
              </button>
            </div>
            {abierta === i && (
              <div className="flex flex-col gap-1.5 border-t border-border px-1.5 py-1.5">
                <label className="flex flex-col gap-0.5">
                  <span className={etiqueta}>Nombre (leyenda)</span>
                  <CampoTexto valor={s.nombre} onChange={(v) => cambiarSerie(i, { ...s, nombre: v })} onListo={onListo} />
                </label>
                {s.tipo === 'funcion' ? (
                  <>
                    <div className="grid grid-cols-[1fr_4.5rem] gap-1">
                      <label className="flex flex-col gap-0.5">
                        <span className={etiqueta}>Expresión</span>
                        <CampoExpr
                          valor={s.expr}
                          onChange={(v) => cambiarSerie(i, { ...s, expr: v })}
                          sugerencias={sugerencias}
                          placeholder="Sa(T)"
                          titulo="Cualquier expresión de la hoja con la variable libre; una función de un bloque de programa también vale"
                          onListo={onListo}
                        />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className={etiqueta}>Variable</span>
                        <CampoTexto valor={s.variable} onChange={(v) => cambiarSerie(i, { ...s, variable: v })} mono onListo={onListo} />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <label className="flex flex-col gap-0.5">
                        <span className={etiqueta}>Desde</span>
                        <CampoExpr valor={s.desde} onChange={(v) => cambiarSerie(i, { ...s, desde: v })} sugerencias={sugerencias} placeholder="0 s" onListo={onListo} />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className={etiqueta}>Hasta</span>
                        <CampoExpr valor={s.hasta} onChange={(v) => cambiarSerie(i, { ...s, hasta: v })} sugerencias={sugerencias} placeholder="3 s" onListo={onListo} />
                      </label>
                    </div>
                    <label className="flex items-center justify-between gap-1">
                      <span className={etiqueta}>Muestras</span>
                      <input
                        type="number"
                        min={2}
                        max={1000}
                        className={`${entrada} !w-20`}
                        value={s.muestras ?? 200}
                        onChange={(e) => {
                          const n = Math.round(Number(e.target.value));
                          if (Number.isFinite(n) && n >= 2 && n <= 1000) cambiarSerie(i, { ...s, muestras: n });
                        }}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <div className="flex gap-2 text-[11px]">
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          checked={s.xy !== undefined}
                          onChange={() => cambiarSerie(i, { tipo: 'datos', nombre: s.nombre, trazo: s.trazo, marcador: s.marcador, xy: '' })}
                        />
                        matriz N×2
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          checked={s.xy === undefined}
                          onChange={() => cambiarSerie(i, { tipo: 'datos', nombre: s.nombre, trazo: s.trazo, marcador: s.marcador, x: '', y: '' })}
                        />
                        dos vectores
                      </label>
                    </div>
                    {s.xy !== undefined ? (
                      <label className="flex flex-col gap-0.5">
                        <span className={etiqueta}>Puntos (x, y)</span>
                        <CampoExpr
                          valor={s.xy}
                          onChange={(v) => cambiarSerie(i, { ...s, xy: v })}
                          sugerencias={sugerencias}
                          placeholder="tabla_esp[:, 1:2]"
                          titulo="Una matriz de N filas por 2 columnas: x en la primera, y en la segunda"
                          onListo={onListo}
                        />
                      </label>
                    ) : (
                      <div className="grid grid-cols-2 gap-1">
                        <label className="flex flex-col gap-0.5">
                          <span className={etiqueta}>x</span>
                          <CampoExpr valor={s.x ?? ''} onChange={(v) => cambiarSerie(i, { ...s, x: v })} sugerencias={sugerencias} onListo={onListo} />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className={etiqueta}>y</span>
                          <CampoExpr valor={s.y ?? ''} onChange={(v) => cambiarSerie(i, { ...s, y: v })} sugerencias={sugerencias} onListo={onListo} />
                        </label>
                      </div>
                    )}
                  </>
                )}
                <div className="grid grid-cols-2 gap-1">
                  <label className="flex flex-col gap-0.5">
                    <span className={etiqueta}>Trazo</span>
                    <select
                      className={entrada}
                      value={s.trazo ?? TRAZOS[i % TRAZOS.length]}
                      onChange={(e) => cambiarSerie(i, { ...s, trazo: e.target.value as Trazo })}
                    >
                      {TRAZOS.map((t) => (
                        <option key={t} value={t}>
                          {NOMBRE_TRAZO[t]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className={etiqueta}>Marcador</span>
                    <select
                      className={entrada}
                      value={s.marcador ?? (s.tipo === 'datos' ? MARCADORES[1 + (i % (MARCADORES.length - 1))] : 'ninguno')}
                      onChange={(e) => cambiarSerie(i, { ...s, marcador: e.target.value as Marcador })}
                    >
                      {MARCADORES.map((m) => (
                        <option key={m} value={m}>
                          {NOMBRE_MARCADOR[m]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}
          </div>
        ))}
      </Seccion>

      {(['ejeX', 'ejeY'] as const).map((clave) => {
        const eje = espec[clave];
        const poner = (parcial: Partial<typeof eje>) => cambiar({ [clave]: { ...eje, ...parcial } } as Partial<EspecGrafico>);
        return (
          <Seccion key={clave} titulo={clave === 'ejeX' ? 'Eje X' : 'Eje Y'}>
            <div className="grid grid-cols-[1fr_5.5rem] gap-1">
              <label className="flex flex-col gap-0.5">
                <span className={etiqueta}>Título</span>
                <CampoTexto valor={eje.titulo} onChange={(v) => poner({ titulo: v })} onListo={onListo} />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiqueta}>Unidad</span>
                <CampoTexto
                  valor={eje.unidad ?? ''}
                  onChange={(v) => poner({ unidad: v || undefined })}
                  placeholder="s, kN…"
                  titulo="La unidad en que se expresa el eje. Vacía: el eje es adimensional, y un valor con unidades es un error. Ojo: «g» es el gramo."
                  mono
                  onListo={onListo}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <label className="flex flex-col gap-0.5">
                <span className={etiqueta}>Mínimo</span>
                <CampoExpr valor={eje.min ?? ''} onChange={(v) => poner({ min: v || undefined })} sugerencias={sugerencias} placeholder="auto" onListo={onListo} />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={etiqueta}>Máximo</span>
                <CampoExpr valor={eje.max ?? ''} onChange={(v) => poner({ max: v || undefined })} sugerencias={sugerencias} placeholder="auto" onListo={onListo} />
              </label>
            </div>
            {clave === 'ejeY' && (
              <label className="flex items-center gap-1.5 text-[11px] text-ink">
                <input
                  type="checkbox"
                  checked={espec.ejeY.incluirCero !== false}
                  onChange={(e) => cambiar({ ejeY: { ...espec.ejeY, incluirCero: e.target.checked } })}
                />
                Con mínimo automático, llegar hasta el cero
              </label>
            )}
          </Seccion>
        );
      })}

      <Seccion
        titulo={`Referencias (${referencias.length})`}
        extra={
          <span className="flex gap-1">
            {(['horizontal', 'vertical', 'punto'] as const).map((tipo) => (
              <button
                key={tipo}
                type="button"
                className={boton}
                disabled={referencias.length >= MAX_REFERENCIAS}
                title={tipo === 'punto' ? 'Un punto rotulado' : `Una recta ${tipo} rotulada`}
                onClick={() =>
                  cambiar({
                    referencias: [
                      ...referencias,
                      tipo === 'punto' ? { tipo, x: '', y: '', etiqueta: '' } : { tipo, valor: '', etiqueta: '' },
                    ],
                  })
                }
              >
                + {tipo === 'horizontal' ? '—' : tipo === 'vertical' ? '|' : '•'}
              </button>
            ))}
          </span>
        }
      >
        {referencias.length === 0 && (
          <p className="text-[11px] leading-snug text-muted">
            Rectas o puntos rotulados: un límite de norma, T*, el punto de diseño. La etiqueta admite
            valores de la hoja: <code className="font-mono">{'T* = {{T_est:s}} s'}</code>.
          </p>
        )}
        {referencias.map((r, i) => (
          <div key={i} className="flex flex-col gap-1 rounded border border-border bg-white px-1.5 py-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-ink">
              {r.tipo === 'horizontal' ? 'Recta horizontal (y)' : r.tipo === 'vertical' ? 'Recta vertical (x)' : 'Punto (x, y)'}
              <button
                type="button"
                className={boton}
                onClick={() => cambiar({ referencias: referencias.filter((_, k) => k !== i) })}
                title="Quitar la referencia"
              >
                ×
              </button>
            </div>
            {r.tipo === 'punto' ? (
              <div className="grid grid-cols-2 gap-1">
                <CampoExpr valor={r.x} onChange={(v) => cambiarRef(i, { ...r, x: v })} sugerencias={sugerencias} placeholder="x" onListo={onListo} />
                <CampoExpr valor={r.y} onChange={(v) => cambiarRef(i, { ...r, y: v })} sugerencias={sugerencias} placeholder="y" onListo={onListo} />
              </div>
            ) : (
              <CampoExpr valor={r.valor} onChange={(v) => cambiarRef(i, { ...r, valor: v })} sugerencias={sugerencias} placeholder="valor" onListo={onListo} />
            )}
            <CampoTexto valor={r.etiqueta ?? ''} onChange={(v) => cambiarRef(i, { ...r, etiqueta: v })} placeholder="etiqueta" onListo={onListo} />
            {r.tipo !== 'punto' && r.etiqueta && (
              // Dónde va la etiqueta. «auto» la deja esquivar la leyenda y las demás;
              // fijada, va anclada a la recta y la acompaña si cambian los datos.
              <div className="grid grid-cols-2 gap-1">
                <select
                  className={`${entrada} !font-sans`}
                  value={r.lado ?? ''}
                  onChange={(e) => {
                    const { lado: _, ...resto } = r;
                    cambiarRef(i, e.target.value ? { ...resto, lado: e.target.value as LadoEtiqueta } : resto);
                  }}
                  title="De qué lado de la recta va la etiqueta"
                >
                  <option value="">lado: auto</option>
                  {LADOS_ETIQUETA[r.tipo].map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <select
                  className={`${entrada} !font-sans`}
                  value={r.posicion ?? ''}
                  onChange={(e) => {
                    const { posicion: _, ...resto } = r;
                    cambiarRef(i, e.target.value ? { ...resto, posicion: e.target.value as PosicionEtiqueta } : resto);
                  }}
                  title="En qué punto de la recta va la etiqueta"
                >
                  <option value="">posición: auto</option>
                  {POSICIONES_ETIQUETA[r.tipo].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ))}
      </Seccion>

      <Seccion titulo="Opciones">
        <label className="flex items-center justify-between gap-2 text-[11px] text-ink">
          Leyenda
          <select
            className={`${entrada} !w-32 !font-sans`}
            value={espec.leyenda ?? 'auto'}
            onChange={(e) => cambiar({ leyenda: e.target.value as EspecGrafico['leyenda'] })}
          >
            <option value="auto">con más de una serie</option>
            <option value="si">siempre</option>
            <option value="no">nunca</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-2 text-[11px] text-ink">
          Esquina de la leyenda
          <select
            className={`${entrada} !w-32 !font-sans`}
            value={espec.posicionLeyenda ?? 'auto'}
            onChange={(e) => {
              const v = e.target.value as PosicionLeyenda;
              cambiar({ posicionLeyenda: v === 'auto' ? undefined : v });
            }}
          >
            {POSICIONES_LEYENDA.map((p) => (
              <option key={p} value={p}>
                {p === 'auto' ? 'la más libre' : p.replace('-', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between gap-2 text-[11px] text-ink">
          Alto
          <select
            className={`${entrada} !w-32 !font-sans`}
            value={espec.alto ?? 340}
            onChange={(e) => cambiar({ alto: Number(e.target.value) })}
          >
            {ALTOS_GRAFICO.map((a, k) => (
              <option key={a} value={a}>
                {['bajo', 'medio', 'alto'][k]} ({Math.round((a / 680) * 180)} mm)
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-ink">
          <input type="checkbox" checked={espec.cuadricula !== false} onChange={(e) => cambiar({ cuadricula: e.target.checked })} />
          Cuadrícula
        </label>
      </Seccion>
    </>
  );
}
