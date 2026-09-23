// ─────────────────────────────────────────────────────────────────────────────
// Las genéricas de la biblioteca, vistas desde una obra.
//
// Aquí no se reimplementa nada: `cargarModuloDeBiblioteca` ya descarga la hoja,
// comprueba que cumpla el contrato de genérica, calcula el sha256 de los bytes
// que de verdad se instancian y arma el módulo declarativo; `evaluarModulo` ya
// instancia las entradas y devuelve el scope. Es la MISMA operación que
// `/diseno/<slug>` y que `harness.planilla instanciar`. Si la obra evaluara por
// su cuenta, tendríamos dos formas de instanciar la misma hoja, y la segunda
// daría otro número el día que una de las dos cambie.
//
// POR QUÉ HAY UNA CACHÉ DE EVALUACIONES
// -------------------------------------
// `proyectar()` corre en cada render de la obra —también al escribir su nombre—
// y una genérica son entre 120 y 324 regiones. Sin caché, teclear una letra
// reevaluaría todas las importadas. La clave incluye el sha256: si la genérica
// cambia en disco, la entrada vieja deja de servir sola.
// ─────────────────────────────────────────────────────────────────────────────

import { evalExpr } from '../../lib/worksheet';
import { cargarModuloDeBiblioteca, listarPromovibles } from '../../lib/diseno/biblioteca';
import { evaluarModulo, type EvaluacionModulo } from '../../lib/diseno/evaluar';
import type { Entradas, ModuloDiseno } from '../../lib/diseno/tipos';
import { sanearHoja } from './hoja';
import { newId } from '../../lib/hoja-json';
import type { Frontera, NodoCalculo } from './modelo';

export { listarPromovibles };
export type { EntradaIndice } from '../../lib/catalogo';

/** Lo que la obra sabe de una genérica referenciada. */
export type EstadoGenerica =
  | { fase: 'cargando' }
  | { fase: 'lista'; modulo: ModuloDiseno<Entradas> }
  | { fase: 'error'; motivo: string };

export type Genericas = Record<string, EstadoGenerica>;

export async function cargarGenerica(slug: string): Promise<EstadoGenerica> {
  try {
    const modulo = await cargarModuloDeBiblioteca(slug);
    if (!modulo) {
      return {
        fase: 'error',
        motivo: `«${slug}» ya no está en la biblioteca como genérica promovible.`,
      };
    }
    return { fase: 'lista', modulo };
  } catch (e) {
    return { fase: 'error', motivo: (e as Error).message };
  }
}

// ── Evaluación con caché ─────────────────────────────────────────────────────

const CACHE = new Map<string, EvaluacionModulo>();
/** Tope flojo: una obra con veinte cálculos y unos tanteos no lo alcanza, y sin
 *  él la caché crecería con cada tecla del formulario. */
const MAX_CACHE = 120;

function clave(slug: string, sha256: string, entradas: Entradas): string {
  const orden = Object.keys(entradas).sort();
  return `${slug}@${sha256}|${orden.map((k) => `${k}=${entradas[k]}`).join(',')}`;
}

export interface CampoResuelto {
  valor?: number;
  error?: string;
}

/**
 * El número que le toca a un campo atado a una expresión.
 *
 * La conversión a la unidad del campo se hace DIVIDIENDO por `1 <unidad>` en el
 * mismo motor, y no con una tabla de factores aquí: así `Mu_Y [kN*m]` atado a
 * algo escrito en `tonf*m` se convierte solo, y atado a un área falla con el
 * mensaje de math.js en vez de entregar un número sin sentido.
 */
export function resolverExpresion(
  expr: string,
  unidad: string | undefined,
  scope: Record<string, unknown>,
): CampoResuelto {
  if (!expr.trim()) return { error: 'Sin fórmula.' };
  let v: unknown;
  try {
    v = evalExpr(expr, scope);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (typeof v === 'number') {
    if (unidad) return { error: `El resultado no tiene unidades y el campo espera ${unidad}.` };
    return Number.isFinite(v) ? { valor: v } : { error: 'El resultado no es un número finito.' };
  }
  if (!unidad) return { error: 'El resultado tiene unidades y el campo no espera ninguna.' };
  try {
    const n = evalExpr(`(${expr}) / (1 ${unidad})`, scope);
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      return { error: `El resultado no se puede expresar en ${unidad}.` };
    }
    return { valor: n };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Qué da cada campo atado. Vacío si la planilla no tiene ninguno. */
export function camposResueltos(
  modulo: ModuloDiseno<Entradas>,
  frontera: Frontera,
  scope: Record<string, unknown>,
): Record<string, CampoResuelto> {
  const salida: Record<string, CampoResuelto> = {};
  for (const [nombre, expr] of Object.entries(frontera.formulas ?? {})) {
    const campo = modulo.entradas.find((c) => c.nombre === nombre);
    if (!campo) continue;
    salida[nombre] = resolverExpresion(expr, campo.unidad, scope);
  }
  return salida;
}

/** Las entradas efectivas: las de la genérica, pisadas por las guardadas y, al
 *  final, por lo que dio cada campo atado a una expresión. */
export function entradasEfectivas(
  modulo: ModuloDiseno<Entradas>,
  frontera: Frontera,
  scope: Record<string, unknown> = {},
): Entradas {
  // Las entradas guardadas se completan con las de la genérica: una genérica que
  // estrena un campo no deja la obra sin ese valor, lo estrena con su omisión.
  const entradas: Entradas = { ...modulo.porDefecto, ...frontera.entradas };
  for (const [nombre, r] of Object.entries(camposResueltos(modulo, frontera, scope))) {
    // Un campo atado que no resuelve conserva su número: la planilla sigue
    // evaluando con el último valor bueno, y el error se ve donde se escribió.
    if (r.valor !== undefined) entradas[nombre] = r.valor;
  }
  return entradas;
}

export function evaluarImportada(
  modulo: ModuloDiseno<Entradas>,
  frontera: Frontera,
  scope: Record<string, unknown> = {},
): EvaluacionModulo {
  const entradas = entradasEfectivas(modulo, frontera, scope);
  const k = clave(frontera.slug ?? modulo.id, modulo.biblioteca?.sha256 ?? '', entradas);
  const guardada = CACHE.get(k);
  if (guardada) return guardada;

  const ev = evaluarModulo(modulo, entradas);
  if (CACHE.size >= MAX_CACHE) CACHE.delete(CACHE.keys().next().value as string);
  CACHE.set(k, ev);
  return ev;
}

/**
 * Si la genérica de hoy no es la que se importó.
 *
 * No es un error: el resultado que se ve es el de la versión publicada, que es
 * la verificada. Es un aviso de que alguien tiene que mirar si el cambio afecta
 * a esta obra, exactamente como el lint del harness ante una instancia atrasada.
 */
export function quedoAtras(modulo: ModuloDiseno<Entradas>, frontera: Frontera): boolean {
  // Solo una referencia a la biblioteca puede quedarse atrás. Una derivada ya no
  // es una instancia de nada: avisar de un desfase respecto de algo de lo que la
  // hoja se desprendió sería pedir que se «actualice» a una copia que el autor
  // decidió no seguir.
  if (frontera.procedencia !== 'biblioteca') return false;
  const hoy = modulo.biblioteca?.sha256;
  return !!hoy && !!frontera.sha256 && hoy !== frontera.sha256;
}

/**
 * Desprende una instancia de la biblioteca: deja de ser una referencia sellada y
 * pasa a ser una copia con procedencia.
 *
 * `public/biblioteca/README.md` dice que la fuente de verdad de una genérica es
 * su JSON y que no se edita encima de la que respalda una memoria. Esto no lo
 * contradice: lo ordena. Al desprenderse, la hoja deja de decir «soy esta
 * genérica» y pasa a decir «salí de ella, en esta versión».
 *
 * LAS ENTRADAS QUEDAN HORNEADAS en las regiones `in_*`, y por eso se construye
 * la hoja una última vez con las efectivas. Una hoja editable no puede seguir
 * teniendo una lista de campos declarados, porque el primer cambio la haría
 * mentir — y así `propia` y `derivada` comparten un solo camino de evaluación.
 *
 * `vistos` es el de la obra: traer regiones a un nodo tiene que pasar por ahí, o
 * dos nodos que desprendan la misma genérica se quedarían con los mismos ids, y
 * los ids de región son las claves de `results` en la hoja global.
 */
export function desprender(
  nodo: NodoCalculo,
  modulo: ModuloDiseno<Entradas>,
  scope: Record<string, unknown> = {},
  vistos: Set<string> = new Set(),
): NodoCalculo {
  const f = nodo.frontera;
  if (!f) return nodo;
  const entradas = entradasEfectivas(modulo, f, scope);
  const hoja = sanearHoja(modulo.construirHoja(entradas), vistos, newId);
  const sello = f.sha256 || modulo.biblioteca?.sha256;
  const slug = f.slug ?? modulo.id;
  return {
    ...nodo,
    hoja,
    ...(modulo.biblioteca?.meta ? { meta: modulo.biblioteca.meta } : {}),
    frontera: {
      procedencia: 'derivada',
      ...(sello ? { origen: { slug, sha256: sello } } : {}),
      ...(f.formulas ? { formulas: f.formulas } : {}),
      ...(f.publica ? { publica: f.publica } : {}),
    },
  };
}
