import { useEffect, useMemo, useRef, useState } from 'react';
import type { Template } from '../../lib/worksheet-templates';

/** Una planilla publicada, tal como la describe `public/planillas-indice.json`. */
export interface EntradaIndice {
  slug: string;
  titulo: string;
  disciplina: string;
  regiones: number;
}

interface Props {
  plantillas: readonly Template[];
  onPlantilla: (tpl: Template) => void;
  onPlanilla: (slug: string) => void;
  onCerrar: () => void;
}

/** Nombres de sección; los del índice vienen en minúscula y sin tilde. */
const TITULOS: Record<string, string> = {
  hormigon: 'Hormigón',
  acero: 'Acero',
  geotecnia: 'Geotecnia',
  apuntes: 'Apuntes',
  otros: 'Otros',
};

/** Orden de las disciplinas; lo que no esté aquí va al final, alfabético. */
const ORDEN = ['hormigon', 'acero', 'geotecnia', 'apuntes', 'otros'];

/**
 * El índice, descargado una vez por sesión. Vive fuera del componente para que
 * cerrar y reabrir el menú no vuelva a pedirlo.
 */
let indiceCache: EntradaIndice[] | null = null;

/**
 * El catálogo: las plantillas editables del bundle y las planillas publicadas.
 *
 * Son cosas distintas y por eso van separadas. Una **plantilla** es un punto de
 * partida pensado para editarse; una **planilla** es una memoria de cálculo
 * completa y ya resuelta, la misma que acompaña al post. Hasta ahora las
 * planillas solo se abrían escribiendo su slug en la URL, así que el corpus
 * entero era invisible desde la aplicación.
 */
export default function CatalogoMenu({ plantillas, onPlantilla, onPlanilla, onCerrar }: Props) {
  const [indice, setIndice] = useState<EntradaIndice[] | null>(indiceCache);
  const [error, setError] = useState(false);
  const [filtro, setFiltro] = useState('');
  const buscador = useRef<HTMLInputElement>(null);

  useEffect(() => {
    buscador.current?.focus();
    if (indiceCache) return;
    let vivo = true;
    fetch('/planillas-indice.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!Array.isArray(d?.planillas)) throw new Error('índice inválido');
        indiceCache = d.planillas as EntradaIndice[];
        if (vivo) setIndice(indiceCache);
      })
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, []);

  const q = filtro.trim().toLowerCase();
  const coincide = (texto: string) => !q || texto.toLowerCase().includes(q);

  const plantillasVisibles = useMemo(
    () => plantillas.filter((t) => coincide(`${t.titulo} ${t.norma} ${t.id}`)),
    [plantillas, q],
  );

  const grupos = useMemo(() => {
    const visibles = (indice ?? []).filter((e) => coincide(`${e.titulo} ${e.slug}`));
    const porDisciplina = new Map<string, EntradaIndice[]>();
    for (const e of visibles) {
      const lista = porDisciplina.get(e.disciplina) ?? [];
      lista.push(e);
      porDisciplina.set(e.disciplina, lista);
    }
    return [...porDisciplina.entries()].sort(([a], [b]) => {
      const ia = ORDEN.indexOf(a);
      const ib = ORDEN.indexOf(b);
      return (ia < 0 ? ORDEN.length : ia) - (ib < 0 ? ORDEN.length : ib) || a.localeCompare(b);
    });
  }, [indice, q]);

  const nada = plantillasVisibles.length === 0 && grupos.length === 0;

  return (
    <>
      {/* Capa para cerrar el menú al hacer clic fuera. */}
      <div className="fixed inset-0 z-30" onClick={onCerrar} />
      <div className="absolute left-0 top-full z-40 mt-1 flex max-h-[26rem] w-96 flex-col rounded border border-border bg-white shadow-lg">
        <div className="border-b border-border p-2">
          <input
            ref={buscador}
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onCerrar()}
            placeholder="Buscar entre las plantillas y los ejemplos…"
            aria-label="Buscar en el catálogo"
            className="w-full rounded border border-border px-2 py-1 text-xs text-ink outline-none focus:border-accent"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {plantillasVisibles.length > 0 && (
            <>
              <p className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Plantillas
              </p>
              {plantillasVisibles.map((tpl) => (
                <button
                  key={tpl.id}
                  className="block w-full px-3 py-1.5 text-left hover:bg-accent/10"
                  onClick={() => onPlantilla(tpl)}
                >
                  <span className="block text-xs font-medium text-ink">{tpl.titulo}</span>
                  <span className="block text-[10px] text-muted">{tpl.norma}</span>
                </button>
              ))}
            </>
          )}

          {grupos.map(([disciplina, entradas]) => (
            <div key={disciplina}>
              <p className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {TITULOS[disciplina] ?? disciplina}
              </p>
              {entradas.map((e) => (
                <button
                  key={e.slug}
                  className="block w-full px-3 py-1.5 text-left hover:bg-accent/10"
                  onClick={() => onPlanilla(e.slug)}
                  title={e.titulo}
                >
                  <span className="block truncate text-xs font-medium text-ink">{e.titulo}</span>
                  <span className="block text-[10px] text-muted">
                    {e.slug} · {e.regiones} bloques
                  </span>
                </button>
              ))}
            </div>
          ))}

          {indice === null && !error && (
            <p className="px-3 py-2 text-[11px] text-muted">Cargando los ejemplos…</p>
          )}
          {error && (
            <p className="px-3 py-2 text-[11px] text-muted">
              No se pudo cargar el catálogo de ejemplos. Genera el índice con{' '}
              <code className="font-mono">npm run indice:planillas</code>.
            </p>
          )}
          {nada && indice !== null && (
            <p className="px-3 py-2 text-[11px] text-muted">
              Nada coincide con «{filtro.trim()}».
            </p>
          )}
        </div>
      </div>
    </>
  );
}
