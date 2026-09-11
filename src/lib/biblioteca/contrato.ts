// ─────────────────────────────────────────────────────────────────────────────
// El contrato de una planilla de la biblioteca: qué lleva `meta`, cómo se
// declaran las entradas y qué tiene que cumplir cada clase.
//
// Es la extensión del `{version, meta, regions}` de siempre, y es compatible
// hacia atrás: una planilla con solo `meta.titulo` sigue siendo válida (clase
// `ejemplo`). Lo nuevo existe para tres cosas que el formato viejo no podía
// decir:
//
//   1. De qué norma sale cada hoja, como CLAVE del catálogo del harness
//      (`PAIS/NORMA-EDICION`), no como prosa. La prosa de las regiones `text`
//      sigue diciendo «§4.3.7» o «Tabla 22.5.5.1»; la clave es lo que permite
//      comprobar que esa norma está calibrada y que la cita es verificable.
//   2. Cuáles regiones son ENTRADAS (`in_<nombre>`) y cuáles variables son
//      SALIDAS, con la misma declaración que usa un módulo de diseño. Es lo que
//      hace que una genérica se pueda instanciar sin tocarla a mano y que se
//      pueda promover a `/diseno/<slug>` sin escribir código.
//   3. De qué genérica sale una instancia de proyecto (`origen`), para poder
//      detectar que la biblioteca avanzó y la instancia quedó atrás.
//
// Todo lo que hay aquí es puro: sin mathjs, sin React, sin DOM. Se puede
// importar desde un módulo de diseño, desde un script de Node o desde el
// canvas sin arrastrar el motor. La validación NO evalúa la hoja — eso es de
// `verify:planilla`—; comprueba forma, y la forma es lo que un lector en otro
// lenguaje (el lint del harness, en Python) puede reproducir sin desviarse.
// ─────────────────────────────────────────────────────────────────────────────

import type { Region } from '../worksheet';
import type { CampoDef, SalidaDef } from '../diseno/tipos';
import { INTRINSECOS } from '../canvas-handoff';

export type ClasePlanilla = 'generica' | 'instancia' | 'ejemplo';

export const CLASES: readonly ClasePlanilla[] = ['generica', 'instancia', 'ejemplo'];

/** Una norma de la que la hoja toma ecuaciones, tablas o factores. */
export interface NormaRef {
  /** Clave del catálogo del harness: `US/ACI318-25-SI`, `AR/CIRSOC-301-2018`. */
  clave: string;
  /** Qué aporta a la hoja: `resistencia`, `anclaje`, `cargas de puente grúa`… */
  rol: string;
  /** Informativo: los artículos que la hoja cita en sus regiones de texto. */
  articulos?: string[];
}

/**
 * Un juego de entradas con el que la genérica tiene que dar un resultado
 * conocido. `entradas` trae solo lo que cambia respecto de los `in_*` de la
 * hoja: `{}` es el ejemplo de referencia tal cual está escrito.
 */
export interface CasoPlanilla {
  nombre: string;
  entradas: Record<string, number>;
  /** Qué tiene que dar `v_global`. */
  cumple: boolean;
  /**
   * Ids de veredicto que deben salir ✗ en este caso. `verify:biblioteca` exige
   * igualdad exacta, para que un caso que «falla a propósito» no tape una
   * regresión en otro veredicto.
   */
  esperadoFalso?: string[];
}

/** De qué genérica sale una instancia, y en qué estado estaba al instanciar. */
export interface OrigenInstancia {
  slug: string;
  /** HEAD de Struct_Flow en ese momento; `desconocido` si no se pudo leer. */
  commit: string;
  /** sha256 del archivo JSON de la genérica. Es lo que se compara después. */
  sha256: string;
  /** AAAA-MM-DD. */
  fecha: string;
  /** Qué se agregó o quitó respecto de la genérica, en una línea. */
  desvios?: string;
}

/** La atadura de una instancia al modelo estructural del que toma esfuerzos. */
export interface ModeloRef {
  /** `10_modelo/vNN_ETIQUETA_AAAA-MM-DD.sdb`, relativo al proyecto. */
  archivo: string;
  /** El `.result.json` o snapshot del que salieron los esfuerzos. */
  esfuerzos?: string;
  barras?: string[];
  patrones?: string[];
}

export interface FiguraRef {
  /** Id de la región `image` que lleva el data URI. */
  region: string;
  /** Archivo del proyecto del que salió, relativo al proyecto. */
  fuente: string;
}

export interface MetaPlanilla {
  // ── v1, sin cambios ────────────────────────────────────────────────────────
  titulo: string;
  esperadoFalso?: Record<string, string>;
  /** Ruta al post o al eval que documenta la hoja. Se conserva por historia. */
  ficha?: string;

  // ── La extensión ───────────────────────────────────────────────────────────
  /** `^[a-z0-9-]+$`, igual al nombre del archivo sin `.json`. */
  slug?: string;
  clase?: ClasePlanilla;
  /** `acero` · `hormigon` · `geotecnia` · `acciones` · `apuntes` · `otros`. */
  disciplina?: string;
  /** Una línea para la tarjeta del catálogo. */
  resumen?: string;
  normas?: NormaRef[];
  entradas?: CampoDef[];
  salidas?: SalidaDef[];
  /** Lo que la hoja NO calcula y tiene que entrar como dato con su origen. */
  fronteras?: string[];
  /** Lo que asume y no chequea. */
  hipotesis?: string[];
  /** Variable que entrega → slugs de las hojas que la consumen. */
  entrega?: Record<string, string[]>;
  casos?: CasoPlanilla[];
  /** Solo instancia. */
  origen?: OrigenInstancia;
  /** Solo instancia. */
  modelo?: ModeloRef;
  /** Decisiones del registro del proyecto que la hoja materializa (`D-07`). */
  decisiones?: string[];
  figuras?: FiguraRef[];
}

export interface HojaBiblioteca {
  version: 1;
  meta: MetaPlanilla;
  regions: Region[];
}

/** Prefijo del id de una región de entrada. */
export const PREFIJO_ENTRADA = 'in_';

/**
 * La forma que tiene que tener el `src` de una región de entrada:
 * `nombre := número [unidad]`, sin expresión. Grupos: nombre, valor, unidad.
 *
 * Es deliberadamente estrecha —ni `2*pi`, ni `sqrt(2) m`— porque una entrada
 * es un dato que se reemplaza entero. Lo que necesite fórmula no es entrada,
 * es derivación, y va debajo del bloque DATOS.
 */
export const RE_ENTRADA =
  /^\s*([A-Za-z_]\w*)\s*:=\s*([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*([A-Za-z][\w*/^()]*)?\s*$/;

export const RE_SLUG = /^[a-z0-9-]+$/;

/**
 * Lo que una región de texto NO puede traer: la evidencia de lectura de una
 * norma (`pdf 56 = impresa 51 · rasterizada 2026-08-20`) vive en el acta de
 * lectura del harness, no en la hoja. En la hoja la cita es el artículo y nada
 * más.
 */
export const RE_CITA_PROHIBIDA = /\bpdf\s*\d+\s*=|rasterizad/i;

/**
 * Un número listo para el código fuente de una región: con punto decimal y sin
 * la cola binaria que arrastraría un `24.444444444444443 cm` a la vista.
 */
export const n = (v: number): string => (Number.isFinite(v) ? String(Number(v.toPrecision(12))) : '0');

export interface Hallazgo {
  codigo: string;
  severidad: 'error' | 'aviso';
  mensaje: string;
}

const SALIDAS_DE_GENERICA: { nombre: string; tipo: SalidaDef['tipo'] }[] = [
  { nombre: 'u_max', tipo: 'uso' },
  { nombre: 'gobierna', tipo: 'texto' },
  { nombre: 'v_global', tipo: 'veredicto' },
];

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function esListaDeTextos(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

/** Región `in_<nombre>` de una hoja, o `undefined`. */
export function regionDeEntrada(regions: readonly Region[], nombre: string): Region | undefined {
  return regions.find((r) => r.id === PREFIJO_ENTRADA + nombre);
}

/**
 * Valida la forma del `meta` contra sus regiones. Puro: no evalúa nada y no
 * lanza. Un `error` invalida la planilla para su clase; un `aviso` es deuda.
 */
export function validarMeta(metaCrudo: unknown, regions: readonly Region[]): Hallazgo[] {
  const h: Hallazgo[] = [];
  const error = (codigo: string, mensaje: string) => h.push({ codigo, severidad: 'error', mensaje });
  const aviso = (codigo: string, mensaje: string) => h.push({ codigo, severidad: 'aviso', mensaje });

  if (!esObjeto(metaCrudo)) {
    error('meta.ausente', 'la planilla no tiene `meta`');
    return h;
  }
  const meta = metaCrudo as Partial<MetaPlanilla>;

  if (typeof meta.titulo !== 'string' || !meta.titulo.trim()) {
    error('meta.titulo', '`meta.titulo` es obligatorio');
  }

  const clase = meta.clase ?? 'ejemplo';
  if (!CLASES.includes(clase)) {
    error('meta.clase', `\`meta.clase\` «${String(meta.clase)}» no es generica, instancia ni ejemplo`);
  }
  if (meta.slug !== undefined && !RE_SLUG.test(meta.slug)) {
    error('meta.slug', `\`meta.slug\` «${meta.slug}» no cumple ^[a-z0-9-]+$`);
  }

  // ── Normas ──────────────────────────────────────────────────────────────────
  const normas = meta.normas ?? [];
  if (!Array.isArray(normas)) {
    error('meta.normas', '`meta.normas` tiene que ser una lista');
  } else {
    normas.forEach((nr, i) => {
      if (!esObjeto(nr) || typeof nr.clave !== 'string' || !/^[A-Z0-9_-]+\/[A-Za-z0-9._-]+$/.test(nr.clave)) {
        error('meta.normas', `\`meta.normas[${i}]\` no trae una clave PAIS/NORMA-EDICION`);
      } else if (typeof nr.rol !== 'string' || !nr.rol.trim()) {
        error('meta.normas', `\`meta.normas[${i}]\` (${nr.clave}) no declara su rol`);
      }
    });
  }

  // ── Entradas ────────────────────────────────────────────────────────────────
  const entradas = meta.entradas ?? [];
  const nombresEntrada = new Set<string>();
  if (!Array.isArray(entradas)) {
    error('meta.entradas', '`meta.entradas` tiene que ser una lista');
  } else {
    entradas.forEach((campo, i) => {
      if (!esObjeto(campo) || typeof campo.nombre !== 'string') {
        error('meta.entradas', `\`meta.entradas[${i}]\` no tiene nombre`);
        return;
      }
      const nombre = campo.nombre as string;
      if (nombresEntrada.has(nombre)) error('meta.entradas', `la entrada «${nombre}» está declarada dos veces`);
      nombresEntrada.add(nombre);
      if (typeof campo.etiqueta !== 'string' || !campo.etiqueta) {
        aviso('meta.entradas', `la entrada «${nombre}» no tiene etiqueta`);
      }
      if (typeof campo.grupo !== 'string' || !campo.grupo) {
        aviso('meta.entradas', `la entrada «${nombre}» no tiene grupo`);
      }
      if (INTRINSECOS.has(nombre)) {
        error('meta.entradas', `la entrada «${nombre}» se llama como una unidad o función del motor: cambia el nombre`);
      }
      const region = regionDeEntrada(regions, nombre);
      if (!region) {
        error('meta.entradas', `la entrada «${nombre}» no tiene región con id \`${PREFIJO_ENTRADA}${nombre}\``);
        return;
      }
      if (region.kind !== 'math') {
        error('meta.entradas', `la región \`${region.id}\` de la entrada «${nombre}» no es math`);
        return;
      }
      const m = RE_ENTRADA.exec(region.src);
      if (!m) {
        error(
          'meta.entradas',
          `la región \`${region.id}\` no tiene la forma «${nombre} := número [unidad]»: «${region.src}»`,
        );
        return;
      }
      if (m[1] !== nombre) {
        error('meta.entradas', `la región \`${region.id}\` define «${m[1]}», no «${nombre}»`);
      }
      const unidadSrc = (m[3] ?? '').replace(/\s+/g, '');
      const unidadDecl = (typeof campo.unidad === 'string' ? campo.unidad : '').replace(/\s+/g, '');
      if (unidadSrc !== unidadDecl) {
        error(
          'meta.entradas',
          `la entrada «${nombre}» declara unidad «${unidadDecl || '—'}» y la región trae «${unidadSrc || '—'}»`,
        );
      }
    });
  }

  // ── Salidas ─────────────────────────────────────────────────────────────────
  const salidas = meta.salidas ?? [];
  const porNombreSalida = new Map<string, SalidaDef>();
  if (!Array.isArray(salidas)) {
    error('meta.salidas', '`meta.salidas` tiene que ser una lista');
  } else {
    salidas.forEach((s, i) => {
      if (!esObjeto(s) || typeof s.nombre !== 'string' || typeof s.tipo !== 'string') {
        error('meta.salidas', `\`meta.salidas[${i}]\` no tiene nombre o tipo`);
        return;
      }
      if (!['valor', 'uso', 'veredicto', 'texto'].includes(s.tipo as string)) {
        error('meta.salidas', `la salida «${s.nombre}» tiene tipo «${String(s.tipo)}» desconocido`);
      }
      porNombreSalida.set(s.nombre as string, s as unknown as SalidaDef);
    });
  }

  // ── Casos ───────────────────────────────────────────────────────────────────
  const casos = meta.casos ?? [];
  if (!Array.isArray(casos)) {
    error('meta.casos', '`meta.casos` tiene que ser una lista');
  } else {
    casos.forEach((c, i) => {
      if (!esObjeto(c) || typeof c.nombre !== 'string' || typeof c.cumple !== 'boolean' || !esObjeto(c.entradas)) {
        error('meta.casos', `\`meta.casos[${i}]\` necesita nombre, entradas y cumple`);
        return;
      }
      for (const k of Object.keys(c.entradas as object)) {
        if (!nombresEntrada.has(k)) error('meta.casos', `el caso «${c.nombre}» toca «${k}», que no es una entrada declarada`);
      }
      if (c.esperadoFalso !== undefined && !esListaDeTextos(c.esperadoFalso)) {
        error('meta.casos', `el caso «${c.nombre}» tiene un \`esperadoFalso\` que no es lista de ids`);
      }
    });
  }

  // ── Texto: la cita es el artículo, la evidencia vive en el harness ─────────
  for (const r of regions) {
    if (r.kind === 'text' && RE_CITA_PROHIBIDA.test(r.src)) {
      aviso('texto.cita', `la región \`${r.id}\` trae evidencia de lectura (pdf N / rasterizada); en la hoja va solo el artículo`);
    }
  }

  // ── Por clase ───────────────────────────────────────────────────────────────
  const contrastes = regions.filter((r) => r.id.startsWith('c_')).length;
  const esperadoFalso = meta.esperadoFalso ?? {};

  if (clase === 'generica') {
    if (!meta.slug) error('generica.slug', 'una genérica declara `slug`');
    if (!meta.disciplina) error('generica.disciplina', 'una genérica declara `disciplina`');
    if (!Array.isArray(normas) || normas.length === 0) error('generica.normas', 'una genérica declara al menos una norma');
    if (!Array.isArray(entradas) || entradas.length === 0) error('generica.entradas', 'una genérica declara al menos una entrada');
    // Una hoja de ACCIONES (viento, nieve, cargas de grúa) no tiene estado
    // límite que gobierne ni factor de uso: entrega cargas. Se le exige el
    // veredicto global y nada más.
    const exigidas =
      meta.disciplina === 'acciones' ? SALIDAS_DE_GENERICA.filter((s) => s.nombre === 'v_global') : SALIDAS_DE_GENERICA;
    for (const { nombre, tipo } of exigidas) {
      const s = porNombreSalida.get(nombre);
      if (!s) error('generica.salidas', `una genérica declara la salida «${nombre}» (${tipo})`);
      else if (s.tipo !== tipo) error('generica.salidas', `la salida «${nombre}» tiene que ser de tipo ${tipo}`);
    }
    if (!Array.isArray(casos) || !casos.some((c) => esObjeto(c) && c.cumple === true)) {
      error('generica.casos', 'una genérica trae al menos un caso que cumple (el ejemplo de referencia)');
    }
    if (contrastes > 0) error('generica.contrastes', `una genérica no lleva contrastes \`c_*\` (tiene ${contrastes})`);
    if (Object.keys(esperadoFalso).length > 0) error('generica.esperadoFalso', 'una genérica no declara `esperadoFalso`');
  }

  if (clase === 'instancia') {
    if (!meta.slug) error('instancia.slug', 'una instancia declara `slug`');
    const o = meta.origen;
    if (o !== undefined) {
      if (!esObjeto(o) || typeof o.slug !== 'string' || typeof o.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(o.sha256)) {
        error('instancia.origen', '`meta.origen` necesita `slug` y `sha256` (64 hex)');
      }
    }
    if (!Array.isArray(normas) || normas.length === 0) error('instancia.normas', 'una instancia declara al menos una norma');
    if (!meta.modelo) aviso('instancia.modelo', 'la instancia no declara `modelo`: no se sabe de qué .sdb salen sus esfuerzos');
    if (meta.casos && meta.casos.length) aviso('instancia.casos', 'los casos son de la genérica; una instancia no los lleva');
  }

  return h;
}

/**
 * Copia de las regiones con las entradas reescritas: cada `in_<nombre>` pasa a
 * `nombre := valor unidad`. Lanza si un valor no tiene región donde ir — es
 * preferible a instanciar una hoja a medias.
 *
 * La unidad sale de la declaración (`CampoDef.unidad`), no del `src` que había:
 * así el formulario de un módulo y el instanciador del harness escriben lo
 * mismo, y `validarMeta` ya exige que las dos coincidan.
 */
export function instanciarRegiones(
  regions: readonly Region[],
  valores: Readonly<Record<string, number>>,
  entradas: readonly CampoDef[],
): Region[] {
  const porNombre = new Map(entradas.map((c) => [c.nombre, c]));
  const faltantes: string[] = [];
  const ids = new Map<string, string>();
  for (const [nombre, valor] of Object.entries(valores)) {
    const campo = porNombre.get(nombre);
    if (!campo) {
      faltantes.push(`«${nombre}» no es una entrada declarada`);
      continue;
    }
    if (!regionDeEntrada(regions, nombre)) {
      faltantes.push(`«${nombre}» no tiene región ${PREFIJO_ENTRADA}${nombre}`);
      continue;
    }
    const unidad = campo.unidad ? ` ${campo.unidad}` : '';
    ids.set(PREFIJO_ENTRADA + nombre, `${nombre} := ${n(valor)}${unidad}`);
  }
  if (faltantes.length) {
    throw new Error(`No se puede instanciar: ${faltantes.join('; ')}`);
  }
  return regions.map((r) => (ids.has(r.id) ? { ...r, src: ids.get(r.id)! } : { ...r }));
}

/**
 * Los valores que la hoja trae escritos en sus `in_*`: el ejemplo de
 * referencia de una genérica, y el `porDefecto` de un módulo declarativo.
 */
export function valoresDeEntradas(
  regions: readonly Region[],
  entradas: readonly CampoDef[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const campo of entradas) {
    const r = regionDeEntrada(regions, campo.nombre);
    const m = r ? RE_ENTRADA.exec(r.src) : null;
    if (!m) throw new Error(`la entrada «${campo.nombre}» no tiene región ${PREFIJO_ENTRADA}${campo.nombre} con la forma «nombre := número [unidad]»`);
    out[campo.nombre] = Number(m[2]);
  }
  return out;
}
