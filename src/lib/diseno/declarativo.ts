// ─────────────────────────────────────────────────────────────────────────────
// Un módulo de diseño que no se escribe: sale de una genérica de la biblioteca.
//
// Un módulo TS declara entradas y salidas y sabe armar una hoja. Una genérica
// de `public/biblioteca/` ya trae las tres cosas en su `meta` y sus regiones
// `in_<nombre>`, así que el módulo se deriva de ella sin código: el formulario
// sale de `meta.entradas`, el panel de `meta.salidas`, y la hoja es la genérica
// con las entradas reescritas (`instanciarRegiones`), la misma operación que
// hace `harness.planilla instanciar` en Python.
//
// Tres diferencias con un módulo TS, y las tres son a propósito:
//   - Las regiones NO se re-colocan con `layout()`: van con la x/y de la
//     genérica y sus saltos de página. Así la memoria exportada es, región por
//     región, la instancia que escribiría el harness.
//   - No hay figura obligatoria. El scope final lo captura un centinela que
//     `evaluarModulo` agrega al evaluar y no devuelve.
//   - La memoria exportada es una INSTANCIA estampada (`clase`, `origen` con el
//     sha256 de la genérica y el commit de esta aplicación), aceptable por
//     `harness.planilla` tal cual.
// ─────────────────────────────────────────────────────────────────────────────

import {
  instanciarRegiones,
  validarMeta,
  valoresDeEntradas,
  type HojaBiblioteca,
  type MetaPlanilla,
} from '../biblioteca/contrato';
import { partirTitulo } from '../catalogo';
import type { Entradas, ModuloDiseno } from './tipos';

/** Mismo prefijo que `ESQUEMAS_PREFIX` de `esquema.ts`, sin arrastrar el motor. */
const PREFIJO_ESQUEMA = '/esquemas/';

/**
 * El módulo de una genérica. Lanza si la hoja no cumple el contrato de
 * genérica: un formulario armado sobre entradas mal declaradas reescribiría
 * regiones que no son las que dice.
 */
export function moduloDeBiblioteca(
  hoja: HojaBiblioteca,
  { sha256 }: { sha256: string },
): ModuloDiseno<Entradas> {
  const meta = hoja.meta;
  if (meta?.clase !== 'generica') {
    throw new Error(`«${meta?.slug ?? meta?.titulo ?? '?'}» no es una genérica de la biblioteca`);
  }
  const errores = validarMeta(meta, hoja.regions).filter((h) => h.severidad === 'error');
  if (errores.length) {
    throw new Error(
      `«${meta.slug}» no cumple el contrato de genérica: ${errores.map((e) => e.mensaje).join('; ')}`,
    );
  }
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`sha256 inválido para «${meta.slug}»`);

  const base = hoja.regions.map((r) => ({ ...r }));
  const entradas = meta.entradas ?? [];
  const porDefecto = valoresDeEntradas(base, entradas);
  const figura = [...base]
    .reverse()
    .find((r) => r.kind === 'image' && r.src.startsWith(PREFIJO_ESQUEMA));
  const { nombre, detalle } = partirTitulo(meta.titulo);

  return {
    id: meta.slug!,
    titulo: nombre,
    resumen: meta.resumen ?? detalle ?? '',
    disciplina: meta.disciplina ?? 'otros',
    norma: (meta.normas ?? []).map((nr) => nr.clave).join(' · '),
    ...(figura
      ? { esquema: figura.src, anchoEsquema: figura.w ?? 660, altoEsquema: figura.h ?? 430 }
      : {}),
    entradas,
    porDefecto,
    salidas: meta.salidas ?? [],
    // Devuelve regiones —con x/y— y no ítems: `evaluarModulo` las usa tal cual.
    construirHoja: (e) => instanciarRegiones(base, e, entradas),
    // Los casos de la genérica, completados con el ejemplo de referencia: son
    // los que `verify:modulos` ejercita, y ahí se contrasta además `cumple` y
    // `esperadoFalso` de cada uno.
    casos: (meta.casos ?? []).map((c) => ({ nombre: c.nombre, entradas: { ...porDefecto, ...c.entradas } })),
    declarativo: true,
    biblioteca: { slug: meta.slug!, sha256, meta },
  };
}

/**
 * El commit de esta aplicación, que `vite.config.ts` inyecta al arrancar (y
 * `scripts/lib/motor.mjs` al compilar para Node). Tiene que leerse con la
 * expresión literal: el reemplazo es textual. El `try` cubre un bundle sin
 * `import.meta.env`, donde la lectura lanzaría.
 */
export function commitDeLaAplicacion(): string {
  let c: unknown;
  try {
    c = import.meta.env.VITE_COMMIT;
  } catch {
    c = undefined;
  }
  return typeof c === 'string' && /^[0-9a-f]{40}$/.test(c) ? c : 'desconocido';
}

/** AAAA-MM-DD en la hora local: la fecha que vería quien exporta. */
function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * El slug de la instancia: el de la genérica sin el sufijo. La nomenclatura
 * del harness es `<elemento>-generica` para la genérica y `<elemento>[-<eje>]`
 * para la instancia; el eje lo pone quien la guarda en el proyecto.
 */
export function slugDeInstancia(slugGenerica: string): string {
  return slugGenerica.replace(/-generic[ao]$/, '') || slugGenerica;
}

/**
 * El `meta` de la memoria que exporta un módulo declarativo: el de la genérica
 * menos sus casos, como instancia, con su `origen`. Es el mismo que escribe
 * `harness.planilla.instanciar`, para que la hoja descargada entre al proyecto
 * sin estampar nada a mano.
 */
export function metaDeInstancia(
  { slug, sha256, meta }: { slug: string; sha256: string; meta: MetaPlanilla },
  { commit = commitDeLaAplicacion(), fecha = hoy() }: { commit?: string; fecha?: string } = {},
): MetaPlanilla {
  const { titulo, casos: _casos, esperadoFalso: _ef, clase: _clase, slug: _slug, origen: _origen, ...resto } = meta;
  return {
    titulo,
    slug: slugDeInstancia(slug),
    clase: 'instancia',
    ...resto,
    origen: { slug, commit, sha256, fecha },
  };
}
