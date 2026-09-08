import { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import type { Region, RegionResult } from '../../lib/worksheet';
import { renderEsquema, ESQUEMAS_PREFIX } from '../../lib/esquema';

export const GRID = 16;
export const snap = (v: number) => Math.max(0, Math.round(v / GRID) * GRID);

/** Ancho mínimo de una imagen al redimensionar (px). */
const MIN_IMAGE_W = GRID * 3;

interface Props {
  region: Region;
  result?: RegionResult;
  /** En edición: muestra el input de texto plano. */
  active: boolean;
  selected: boolean;
  onChange: (src: string) => void;
  /** Sale de edición (Enter, Escape o blur). */
  onCommit: () => void;
  onActivate: () => void;
  onSelect: (additive: boolean) => void;
  onMove: (x: number, y: number) => void;
  /** Solo `image`: nuevo tamaño tras arrastrar el tirador de la esquina. */
  onResize: (w: number, h: number) => void;
  /** Registra el input/textarea activo para que la paleta inserte símbolos. */
  registerInput: (el: HTMLInputElement | HTMLTextAreaElement | null) => void;
}

/** Texto de cada esquema ya descargado, por ruta (no cambian en la sesión). */
const esquemaCache = new Map<string, string>();

/**
 * Esquema paramétrico: SVG de `/esquemas/` inyectado inline con los tokens
 * `{{expr}}` sustituidos contra el scope capturado por la región (solo rutas
 * de autoría propia pasan por aquí; una imagen pegada va por `<img>`).
 */
function EsquemaInline({
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
  const [raw, setRaw] = useState<string | null>(esquemaCache.get(src) ?? null);

  useEffect(() => {
    if (esquemaCache.has(src)) {
      setRaw(esquemaCache.get(src)!);
      return;
    }
    let vivo = true;
    fetch(src)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        esquemaCache.set(src, text);
        if (vivo) setRaw(text);
      })
      .catch(() => vivo && setRaw(null));
    return () => {
      vivo = false;
    };
  }, [src]);

  const html = useMemo(() => (raw ? renderEsquema(raw, scope ?? {}).svg : null), [raw, scope]);

  if (!html) return <div className="rounded-sm bg-surface" style={{ width: w, height: h }} />;
  return (
    <div
      className="[&>svg]:block [&>svg]:h-full [&>svg]:w-full"
      style={{ width: w, height: h }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Render KaTeX imperativo (sin dangerouslySetInnerHTML). */
function Katex({ tex }: { tex: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) katex.render(tex, ref.current, { throwOnError: false });
  }, [tex]);
  return <span ref={ref} />;
}

export default function MathRegion({
  region,
  result,
  active,
  selected,
  onChange,
  onCommit,
  onActivate,
  onSelect,
  onMove,
  onResize,
  registerInput,
}: Props) {
  const drag = useRef<{ px: number; py: number; rx: number; ry: number; moved: boolean } | null>(null);
  const resize = useRef<{ px: number; w0: number; ratio: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (active) return; // en edición no se arrastra
    e.stopPropagation();
    drag.current = { px: e.clientX, py: e.clientY, rx: region.x, ry: region.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    onMove(snap(d.rx + dx), snap(d.ry + dy));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) onSelect(e.ctrlKey || e.shiftKey);
  };

  // Redimensión de una imagen desde la esquina, con el aspecto bloqueado: solo
  // se sigue el desplazamiento horizontal y el alto se deriva de la proporción.
  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const w0 = region.w ?? MIN_IMAGE_W;
    resize.current = { px: e.clientX, w0, ratio: (region.h ?? w0) / w0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resize.current;
    if (!r) return;
    e.stopPropagation();
    const w = Math.max(MIN_IMAGE_W, snap(r.w0 + (e.clientX - r.px)));
    onResize(w, Math.max(1, Math.round(w * r.ratio)));
  };
  const onResizeUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    resize.current = null;
  };

  const isText = region.kind === 'text';
  const isProgram = region.kind === 'program';
  const isImage = region.kind === 'image';
  const hasError = Boolean(result?.error) && !active;

  const lines = region.src.split('\n');
  const progRows = Math.max(lines.length, 2);
  const progCols = Math.max(...lines.map((l) => l.length), 24);

  return (
    <div
      className={`group absolute select-none rounded ${isImage ? 'p-0' : 'px-1.5 py-0.5'} ${
        active
          ? 'z-20 ring-1 ring-accent bg-white shadow-sm'
          : selected
            ? 'z-10 cursor-move ring-1 ring-accent/60 bg-accent/5'
            : `cursor-move hover:ring-1 ${hasError ? 'ring-1 ring-red-300' : 'hover:ring-border'}`
      }`}
      style={{ left: region.x, top: region.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!isImage) onActivate(); // una imagen no tiene modo edición
      }}
    >
      {isImage ? (
        <>
          {region.src.startsWith(ESQUEMAS_PREFIX) ? (
            <EsquemaInline src={region.src} scope={result?.scope} w={region.w} h={region.h} />
          ) : (
            <img
              src={region.src}
              alt=""
              draggable={false}
              className="block max-w-none rounded-sm"
              style={{ width: region.w, height: region.h }}
            />
          )}
          {/* Tirador de esquina: siempre visible si la región está seleccionada,
              y al pasar el cursor por encima para que se descubra sin clic. */}
          <span
            className={`absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-accent bg-white ${
              selected ? '' : 'hidden group-hover:block'
            }`}
            title="Arrastra para redimensionar (mantiene la proporción)"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
        </>
      ) : active && isProgram ? (
        <textarea
          ref={registerInput}
          autoFocus
          className="resize-none bg-transparent font-mono text-sm leading-snug text-ink outline-none"
          style={{ width: `${progCols + 2}ch` }}
          rows={progRows}
          value={region.src}
          placeholder={'S :=\n    s := 0\n    for i in 1:10\n        s := s + i\n    return s'}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            // Enter inserta línea; se confirma con Escape o Ctrl/⌘+Enter.
            if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
              e.preventDefault();
              onCommit();
            } else if (e.key === 'Tab') {
              e.preventDefault();
              const ta = e.currentTarget;
              const s = ta.selectionStart;
              const next = ta.value.slice(0, s) + '    ' + ta.value.slice(ta.selectionEnd);
              onChange(next);
              requestAnimationFrame(() => ta.setSelectionRange(s + 4, s + 4));
            }
            e.stopPropagation();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : active ? (
        <input
          ref={registerInput}
          autoFocus
          className={`min-w-32 bg-transparent text-sm text-ink outline-none ${isText ? '' : 'font-mono'}`}
          style={{ width: `${Math.max(region.src.length + 2, 12)}ch` }}
          value={region.src}
          placeholder={isText ? 'texto…' : 'ej. M := F*L/4 = kN*m'}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
              e.preventDefault();
              onCommit();
            }
            e.stopPropagation();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : isText ? (
        <span className="whitespace-pre text-sm text-ink">{region.src}</span>
      ) : isProgram ? (
        <div>
          <div className="flex items-center gap-2">
            <pre className="whitespace-pre border-l-2 border-accent pl-2 font-mono text-sm leading-snug text-ink">
              {region.src}
            </pre>
            {result?.tex && (
              <span className="flex items-center gap-1">
                <span className="text-muted">→</span>
                <Katex tex={result.tex} />
              </span>
            )}
            {result?.defined && (
              <span className="text-xs italic text-muted">{result.defined} definida</span>
            )}
          </div>
          {hasError && <div className="max-w-64 text-xs text-red-600">{result?.error}</div>}
        </div>
      ) : (
        <div>
          {result?.bool !== undefined ? (
            <div className="flex items-center gap-2">
              {result.tex && <Katex tex={result.tex} />}
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-sm font-bold ${
                  result.bool ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {result.bool ? '✓' : '✗'}
              </span>
            </div>
          ) : result?.tex ? (
            <Katex tex={result.tex} />
          ) : (
            <span className="font-mono text-sm text-ink">{region.src}</span>
          )}
          {hasError && <div className="max-w-64 text-xs text-red-600">{result?.error}</div>}
        </div>
      )}
    </div>
  );
}
