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

// Qué es un encabezado, un espaciador o el título vive en `lib/bloque.ts`,
// porque el render a HTML de Node (`render-html.ts`) tiene que decidirlo igual
// que este componente. Se reexporta para que los importadores no cambien.
import { nivelEncabezado, textoEncabezado, esEncabezado, esEspaciador, ALTO_ESPACIADOR } from '../../lib/bloque';
export { nivelEncabezado, textoEncabezado, esEncabezado, esEspaciador, ALTO_ESPACIADOR };

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
