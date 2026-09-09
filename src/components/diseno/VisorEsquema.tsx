import { useMemo } from 'react';
import { renderEsquema } from '../../lib/esquema';
import { useEsquema } from '../useEsquema';

interface Props {
  src: string;
  scope: Record<string, unknown>;
  ancho: number;
  alto: number;
}

/**
 * El esquema del módulo, con los tokens resueltos contra el scope de la hoja.
 *
 * Es el mismo camino que recorre la figura dentro del canvas y dentro del PDF
 * —`renderEsquema` con el scope que capturó la región `image`—, así que lo que
 * se ve aquí mientras se diseña es literalmente lo que sale impreso.
 */
export default function VisorEsquema({ src, scope, ancho, alto }: Props) {
  const raw = useEsquema(src);
  const render = useMemo(() => (raw ? renderEsquema(raw, scope) : null), [raw, scope]);

  return (
    <div>
      <div
        className="rounded border border-border bg-white [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        style={{ maxWidth: ancho, aspectRatio: `${ancho} / ${alto}` }}
        {...(render ? { dangerouslySetInnerHTML: { __html: render.svg } } : {})}
      />
      {render && render.faltantes.length > 0 && (
        // Se enseña en vez de callarse: un token sin resolver es lo que hace
        // fallar a `verify:modulos`, y verlo aquí ahorra el viaje de ida y
        // vuelta mientras se escribe un esquema nuevo.
        <p className="mt-1 text-[11px] text-[#b91c1c]">
          {render.faltantes.length} token(s) del esquema sin resolver:{' '}
          <code className="font-mono">{render.faltantes.slice(0, 3).join(' · ')}</code>
        </p>
      )}
    </div>
  );
}
