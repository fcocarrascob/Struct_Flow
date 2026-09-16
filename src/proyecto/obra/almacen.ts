// ─────────────────────────────────────────────────────────────────────────────
// Dónde viven las obras: `localStorage` de este navegador, y en ningún otro
// lado.
//
// UNA DIFERENCIA CON `../layout.ts` QUE IMPORTA
// --------------------------------------------
// Aquel guarda posiciones, que son una comodidad: si el almacenamiento está
// bloqueado se sigue trabajando y no pasa nada, y por eso su `catch` es mudo.
// Acá el almacenamiento ES el dato. Un `catch` mudo se lleva el trabajo del
// usuario sin decir una palabra, así que `guardarObra` devuelve un resultado y
// quien lo llama tiene que mostrarlo.
//
// Todo el archivo entra y sale por `leerTodo`/`escribirTodo`: una obra no se
// escribe sola sino dentro del conjunto, que es como está guardado.
// ─────────────────────────────────────────────────────────────────────────────

import {
  IDENTIFICADOR_RE,
  VERSION_OBRA,
  type Bloque,
  type Carga,
  type Importada,
  type Modulo,
  type NodoCalculo,
  type Obra,
  type Subcarga,
} from './modelo';

export const CLAVE_OBRAS = 'structflow.obras.v1';

export type Resultado = { ok: true } | { ok: false; motivo: string };

const MODULOS: ReadonlySet<string> = new Set<Modulo>(['cargas']);

/**
 * Lo que se lee de `localStorage` es texto que escribió una versión anterior de
 * esta aplicación, no un `Obra`. Se sanea igual que `sanearRegiones` hace con
 * una hoja: lo que no calza se descarta en vez de reventar la pantalla.
 */
/** `src` tiene que ser string sí o sí: `evaluateSheet` hace `region.src.trim()`
 *  sin red, así que un bloque con `src` de otro tipo rompería la evaluación
 *  entera de la carga en vez de estropear solo su propio bloque. */
function sanearBloque(crudo: unknown, i: number): Bloque | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const b = crudo as Partial<Bloque>;
  if (typeof b.src !== 'string') return null;
  return {
    id: typeof b.id === 'string' && b.id ? b.id : `b-recuperado-${i}`,
    tipo: b.tipo === 'text' ? 'text' : 'math',
    src: b.src,
  };
}

/** Sin `slug` no hay nada que descargar, así que la referencia se descarta
 *  entera y la partida vuelve a su hoja libre, que sí está guardada. */
function sanearImportada(crudo: unknown): Importada | undefined {
  if (typeof crudo !== 'object' || crudo === null) return undefined;
  const i = crudo as Partial<Importada>;
  if (typeof i.slug !== 'string' || !i.slug) return undefined;
  const entradas: Record<string, number> = {};
  if (typeof i.entradas === 'object' && i.entradas !== null) {
    for (const [k, v] of Object.entries(i.entradas)) {
      if (typeof v === 'number' && Number.isFinite(v)) entradas[k] = v;
    }
  }
  const formulas: Record<string, string> = {};
  if (typeof i.formulas === 'object' && i.formulas !== null) {
    for (const [k, v] of Object.entries(i.formulas)) {
      if (typeof v === 'string') formulas[k] = v;
    }
  }
  return {
    slug: i.slug,
    // Un sello ilegible se trata como «sin sello»: no se avisa de un desfase
    // que no se puede comprobar, y se vuelve a sellar al primer cambio.
    sha256: typeof i.sha256 === 'string' && /^[0-9a-f]{64}$/.test(i.sha256) ? i.sha256 : '',
    entradas,
    ...(Object.keys(formulas).length ? { formulas } : {}),
    ...(typeof i.salida === 'string' && i.salida ? { salida: i.salida } : {}),
  };
}

function sanearSubcarga(crudo: unknown, i: number): Subcarga | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const s = crudo as Partial<Subcarga>;
  if (typeof s.nombre !== 'string') return null;
  const importada = sanearImportada(s.importada);
  // MIGRACIÓN. Hasta ahora el nombre de la partida ERA su variable. Una obra
  // guardada entonces no trae `variable`, y adoptar el nombre viejo es lo único
  // que conserva su valor: sin esto, todas sus partidas abrirían en rojo
  // pidiendo que se elija una variable que ya estaba elegida.
  const variable =
    typeof s.variable === 'string' && s.variable
      ? s.variable
      : IDENTIFICADOR_RE.test(s.nombre.trim())
        ? s.nombre.trim()
        : undefined;
  return {
    id: typeof s.id === 'string' && s.id ? s.id : `s-recuperada-${i}`,
    nombre: s.nombre,
    bloques: (Array.isArray(s.bloques) ? s.bloques : [])
      .map(sanearBloque)
      .filter((b): b is Bloque => b !== null),
    ...(variable ? { variable } : {}),
    ...(importada ? { importada } : {}),
  };
}

function sanearCalculo(crudo: unknown, i: number): NodoCalculo | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const k = crudo as Partial<NodoCalculo>;
  const importada = sanearImportada(k.importada);
  return {
    id: typeof k.id === 'string' && k.id ? k.id : `k-recuperado-${i}`,
    nombre: typeof k.nombre === 'string' ? k.nombre : 'Cálculo',
    bloques: (Array.isArray(k.bloques) ? k.bloques : [])
      .map(sanearBloque)
      .filter((b): b is Bloque => b !== null),
    ...(importada ? { importada } : {}),
  };
}

function sanearCarga(crudo: unknown, i: number): Carga | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const c = crudo as Partial<Carga>;
  if (typeof c.nombre !== 'string') return null;
  return {
    id: typeof c.id === 'string' && c.id ? c.id : `c-recuperada-${i}`,
    nombre: c.nombre,
    // El `tipo` de una obra guardada con el catálogo cerrado se ignora: la carga
    // ya no lo tiene, y el nombre —que es lo que la identifica— no dependía de él.
    // Una obra guardada antes del desglose no trae `subcargas`; no es un dato
    // corrupto, es una obra anterior, y abre sin desglose y sin avisos.
    subcargas: (Array.isArray(c.subcargas) ? c.subcargas : [])
      .map(sanearSubcarga)
      .filter((s): s is Subcarga => s !== null),
  };
}

function sanearObra(crudo: unknown): Obra | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const o = crudo as Partial<Obra>;
  if (typeof o.id !== 'string' || !o.id) return null;
  return {
    version: VERSION_OBRA,
    id: o.id,
    nombre: typeof o.nombre === 'string' ? o.nombre : o.id,
    creada: typeof o.creada === 'string' ? o.creada : new Date(0).toISOString(),
    modulos: (Array.isArray(o.modulos) ? o.modulos : []).filter((m): m is Modulo =>
      MODULOS.has(m as string),
    ),
    cargas: (Array.isArray(o.cargas) ? o.cargas : [])
      .map(sanearCarga)
      .filter((c): c is Carga => c !== null),
    calculos: (Array.isArray(o.calculos) ? o.calculos : [])
      .map(sanearCalculo)
      .filter((k): k is NodoCalculo => k !== null),
  };
}

function leerTodo(): Obra[] {
  try {
    const crudo = window.localStorage.getItem(CLAVE_OBRAS);
    if (!crudo) return [];
    const datos = JSON.parse(crudo) as { obras?: unknown };
    if (!Array.isArray(datos?.obras)) return [];
    return datos.obras.map(sanearObra).filter((o): o is Obra => o !== null);
  } catch {
    // Modo privado, almacenamiento bloqueado o JSON corrupto. Abrir con la lista
    // vacía es mejor que no abrir; el error real aparece al intentar guardar,
    // que es cuando hay algo que perder.
    return [];
  }
}

function escribirTodo(obras: Obra[]): Resultado {
  try {
    window.localStorage.setItem(CLAVE_OBRAS, JSON.stringify({ version: VERSION_OBRA, obras }));
    return { ok: true };
  } catch (e) {
    const nombre = (e as { name?: string })?.name ?? '';
    if (nombre === 'QuotaExceededError' || nombre === 'NS_ERROR_DOM_QUOTA_REACHED') {
      return {
        ok: false,
        motivo:
          'No cabe en el almacenamiento del navegador. Borra alguna obra que ya no uses y ' +
          'vuelve a intentarlo.',
      };
    }
    return {
      ok: false,
      motivo:
        'El navegador no dejó guardar. Suele pasar en ventana privada o con el ' +
        'almacenamiento del sitio bloqueado: lo que escribas no se va a conservar.',
    };
  }
}

/** Las obras, la más reciente primero. */
export function listarObras(): Obra[] {
  return leerTodo().sort((a, b) => b.creada.localeCompare(a.creada));
}

export function leerObra(id: string): Obra | null {
  return leerTodo().find((o) => o.id === id) ?? null;
}

/** Inserta o reemplaza, conservando el sitio que la obra ya tenía en el archivo. */
export function guardarObra(obra: Obra): Resultado {
  const obras = leerTodo();
  const i = obras.findIndex((o) => o.id === obra.id);
  if (i >= 0) obras[i] = obra;
  else obras.push(obra);
  return escribirTodo(obras);
}

export function borrarObra(id: string): Resultado {
  return escribirTodo(leerTodo().filter((o) => o.id !== id));
}
