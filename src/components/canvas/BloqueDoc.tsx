import { useEffect, useMemo, useRef } from 'react';
import katex from 'katex';
import type { Region, RegionResult } from '../../lib/worksheet';
import { renderEsquema, esRutaDeEsquema } from '../../lib/esquema';
import { useEsquema } from '../useEsquema';

/**
 * Un bloque de la hoja, tal como se ve **y** tal como se imprime.
 *
 * Antes había dos renderizados: `MathRegion` dibujaba con `text-sm` (14 px) y
 * `WorksheetPrint` con `11pt` (14,67 px) y su propio interlineado, de modo que
 * los bloques no median lo mismo en un sitio y en otro. Mientras la impresión
 * refluía a un documento lineal eso solo era una incomodidad; con el papel
 * dentro del canvas es imposible: lo que se ve tiene que ser lo que sale, y
 * para eso tiene que ser lo mismo, no algo parecido.
 *
 * Aquí vive el marcado; el aspecto está en `global.css` bajo `.doc-papel`, que
 * llevan los dos raíces. El chrome de edición —el anillo de selección, el
 * tirador de la imagen, el input— se queda en `MathRegion`, envolviendo a esto.
 *
 * Los huecos entre bloques NO se declaran aquí: son márgenes que solo tienen
 * sentido en el documento lineal, y en el canvas la separación la da la
 * posición de cada bloque.
 */
interface Props {
  region: Region;
  result?: RegionResult;
  /**
   * La primera región de texto de la hoja: se dibuja como título con la fecha.
   *
   * Antes el documento de impresión se comía esa región y la reponía en una
   * banda fija de encabezado, así que en el canvas estaba en un sitio y en el
   * papel en otro. Ahora se queda donde el autor la puso.
   */
  titulo?: boolean;
  /** Clases extra del contenedor (el salto de página forzado, por ahora). */
  className?: string;
  /**
   * `data-wp-id` del contenedor. Lo pone el documento de impresión, que es
   * quien se mide; en el canvas la marca la lleva el envoltorio de arrastre.
   */
  wpId?: string;
}

/** Render KaTeX imperativo (sin `dangerouslySetInnerHTML`). */
function Katex({ tex }: { tex: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) katex.render(tex, ref.current, { throwOnError: false });
  }, [tex]);
  return <span ref={ref} />;
}

/**
 * Esquema paramétrico: el SVG de `/esquemas/` inyectado inline con los tokens
 * resueltos contra el scope que la región capturó en su posición.
 *
 * Un `<img src="/esquemas/x.svg">` traería el archivo del servidor, y el
 * archivo tiene los `{{tokens}}` sin sustituir: la memoria salía impresa con
 * «{{Rd_pan:tonf}}» donde debía ir el número.
 */
function Esquema({
  src,
  scope,
  w,
  h,
}: {
  src: string;
  scope?: Record<string, unknown>;
  w?: number;
  h?: number;
}) {
  const raw = useEsquema(src);
  const html = useMemo(() => (raw ? renderEsquema(raw, scope ?? {}).svg : null), [raw, scope]);

  // El tamaño va reservado desde el principio: sin esto el bloque mide 0 hasta
  // que llega el SVG, y la medición vería una figura inexistente.
  //
  // Con `aspectRatio` y no `height` a secas: el `max-width: 100%` acota el
  // ancho de una figura que no cabe en el papel, y el alto tiene que seguirlo
  // en vez de quedarse con el hueco reservado.
  const proporcion = w && h ? `${w} / ${h}` : undefined;
  const estilo = {
    width: w,
    maxWidth: '100%',
    aspectRatio: proporcion,
    height: proporcion ? undefined : h,
  };

  if (!html) return <div style={estilo} />;
  return (
    <div
      className="[&>svg]:block [&>svg]:h-full [&>svg]:w-full"
      style={estilo}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Nivel de un encabezado de sección: 1, 2 o 3, y 0 si no lo es.
 *
 * **Es la única autoridad sobre qué es un encabezado**, igual que `nombreTex` lo
 * es sobre nombre → LaTeX. La usan el marcado de aquí, el ancho de la caja de
 * interacción (`MathRegion`) y el panel de secciones; con la comprobación
 * repetida, un cambio en la sintaxis dejaría a los tres diciendo cosas
 * distintas.
 *
 * Dos sintaxis, y por qué conviven:
 *
 * - **`# `, `## `, `### `** — la buena. El nivel es explícito y se escribe igual
 *   siempre. El espacio y el carácter que le sigue son obligatorios, de modo que
 *   un texto como «#3 barras» sigue siendo un párrafo.
 * - **Una raya horizontal, como `━━ TÍTULO ━━`** — la heredada, que vale por
 *   `##`. No se retira porque la usan 439 regiones en 31 de las 33 planillas
 *   publicadas, y romperlas para ganar sintaxis no compensa.
 *
 * La raya se acepta **pesada (U+2501) o ligera (U+2500)**. Antes solo contaba la
 * pesada, y las 19 regiones que se escribieron con la ligera —8 en
 * `anclajes-pedestal`, 11 en `pedestal-anclaje-nch2369`— salían como párrafo
 * gris: perdían el `break-after: avoid` y la paginación las dejaba colgando al
 * pie de página. Un fallo invisible hasta ver el PDF, que es exactamente lo que
 * pasa cuando la estructura del documento depende de qué carácter se pegó del
 * portapapeles.
 */
export function nivelEncabezado(region: Region): 0 | 1 | 2 | 3 {
  if (region.kind !== 'text') return 0;
  const m = /^(#{1,3})\s+\S/.exec(region.src.trim());
  if (m) return m[1].length as 1 | 2 | 3;
  return region.src.includes('━') || region.src.includes('─') ? 2 : 0;
}

/** El texto de un encabezado, sin el prefijo `#` ni las rayas. */
export function textoEncabezado(region: Region): string {
  return region.src
    .trim()
    .replace(/^#{1,3}\s+/, '')
    .replace(/[━─]/g, '')
    .trim();
}

/** Derivada de `nivelEncabezado`, para quien solo necesita el sí o el no. */
export function esEncabezado(region: Region): boolean {
  return nivelEncabezado(region) > 0;
}

/**
 * Alto de un espaciador, en píxeles CSS.
 *
 * **Tiene que coincidir con `.doc-papel .wp-space` de `global.css`**, igual que
 * `A4` de `paginacion.ts` coincide con la regla `@page`: aquí lo necesita el
 * canvas para saber cuánto empujar hacia abajo al abrir el hueco, y allí lo
 * necesita el bloque para ocupar ese alto en la hoja y en el papel. Si
 * divergieran, el empujón dejaría de cuadrar con lo que se ve.
 *
 * Un paso de la cuadrícula (`GRID`), y no una línea de texto entera, porque todo
 * el canvas se ajusta a 16 px: así el hueco que se abre y el alto del bloque son
 * el mismo número exacto, sin redondeos, y Enter se puede repetir para dosificar.
 */
export const ALTO_ESPACIADOR = 16;

/**
 * Un espaciador: una región de texto sin contenido.
 *
 * No es un tipo nuevo. Es lo que el corpus ya usa —39 regiones en 8 planillas,
 * 16 solo en `anclajes-pedestal`— y lo que sus autores quisieron que fuera;
 * hasta ahora no ocupaba nada en ninguna parte, porque un párrafo vacío mide
 * cero y el documento de impresión las descartaba.
 *
 * Solo `text`: una `math` o una `program` vacía no es un espaciador, es un
 * bloque a medio escribir.
 */
export function esEspaciador(region: Region): boolean {
  return region.kind === 'text' && region.src.trim() === '';
}

export default function BloqueDoc({ region, result, titulo, className = '', wpId }: Props) {
  const clase = (base: string) => (className ? `${base} ${className}` : base);
  const rest = { 'data-wp-id': wpId };

  if (titulo) {
    const fecha = new Date().toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return (
      <div className={clase('wp-header')} {...rest}>
        {/* Si el autor escribió el título como «# Algo», el prefijo se retira:
            el título ya se dibuja como título, y el `#` impreso sería ruido. */}
        <h1>{esEncabezado(region) ? textoEncabezado(region) : region.src}</h1>
        <p className="wp-meta">Memoria de cálculo · struct/pad · {fecha}</p>
      </div>
    );
  }

  if (region.kind === 'image') {
    return (
      <figure className={clase('wp-fig')} {...rest}>
        {esRutaDeEsquema(region.src) ? (
          <Esquema src={region.src} scope={result?.scope} w={region.w} h={region.h} />
        ) : (
          <img src={region.src} alt="" draggable={false} width={region.w} height={region.h} />
        )}
      </figure>
    );
  }

  if (region.kind === 'text') {
    // Va antes que el encabezado y que el párrafo: un espaciador no lleva texto
    // que mirar, solo alto.
    if (esEspaciador(region)) {
      return <p className={clase('wp-space')} {...rest} />;
    }
    // Los tres niveles salen del mismo sitio: `wp-h1`, `wp-h2` y `wp-h3` son la
    // misma estructura con distinto peso, así que elegir la clase basta.
    const nivel = nivelEncabezado(region);
    if (nivel > 0) {
      const Etiqueta = (['h1', 'h2', 'h3'] as const)[nivel - 1];
      return (
        <Etiqueta className={clase(`wp-h${nivel}`)} {...rest}>
          {textoEncabezado(region)}
        </Etiqueta>
      );
    }
    return (
      <p className={clase('wp-label')} {...rest}>
        {region.src}
      </p>
    );
  }

  // Un error se muestra junto a su fuente, y en el flujo. Antes el canvas lo
  // añadía DEBAJO del bloque, que es alto que el papel no tenía.
  if (result?.error) {
    return (
      <p className={clase('wp-eq wp-err')} {...rest}>
        {region.src} — {result.error}
      </p>
    );
  }

  if (region.kind === 'program') {
    return (
      <div className={clase('wp-prog')} {...rest}>
        <pre>{region.src}</pre>
        {result?.tex && (
          <span className="wp-prog-val">
            <span className="wp-flecha">→</span>
            <Katex tex={result.tex} />
          </span>
        )}
        {result?.defined && <em className="wp-prog-def">{result.defined} definida</em>}
      </div>
    );
  }

  return (
    <div className={clase('wp-eq')} {...rest}>
      {result?.tex ? <Katex tex={result.tex} /> : <span className="wp-raw">{region.src}</span>}
      {result?.bool !== undefined && (
        <span className={result.bool ? 'wp-ok' : 'wp-no'}>{result.bool ? '✓' : '✗'}</span>
      )}
    </div>
  );
}
