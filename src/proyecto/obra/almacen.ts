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

import { newId } from '../../lib/hoja-json';
import {
  IDENTIFICADOR_RE,
  problemaDeAlias,
  slugificar,
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
 * Los ids que ya se repartieron dentro de UNA obra.
 *
 * Es el `vistos` de `sanearRegiones` (`src/lib/hoja-json.ts:91`) y hace falta
 * por lo mismo: los ids de bloque son las claves de `results` en la hoja global
 * que arma `evaluacion.ts`, así que dos bloques con el mismo id comparten
 * resultado, comparten `key` de React y rompen el filtro por posición del
 * autocompletado, que busca la región activa por id y se queda con la primera.
 *
 * Antes los ids de rescate llevaban el índice **dentro de su padre**, así que
 * dos partidas sin id daban las dos `s-recuperada-0` y los bloques colisionaban
 * entre nodos a la primera. El `newId` compartido no puede repetir.
 */
type Vistos = Set<string>;

function idUnico(crudo: unknown, vistos: Vistos): string {
  const id = typeof crudo === 'string' && crudo && !vistos.has(crudo) ? crudo : newId();
  vistos.add(id);
  return id;
}

/**
 * Lo que se lee de `localStorage` es texto que escribió una versión anterior de
 * esta aplicación, no un `Obra`. Se sanea igual que `sanearRegiones` hace con
 * una hoja: lo que no calza se descarta en vez de reventar la pantalla.
 */
/** `src` tiene que ser string sí o sí: `evaluateSheet` hace `region.src.trim()`
 *  sin red, así que un bloque con `src` de otro tipo rompería la evaluación
 *  entera de la carga en vez de estropear solo su propio bloque. */
function sanearBloque(crudo: unknown, vistos: Vistos): Bloque | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const b = crudo as Partial<Bloque>;
  if (typeof b.src !== 'string') return null;
  return {
    id: idUnico(b.id, vistos),
    tipo: b.tipo === 'text' ? 'text' : 'math',
    src: b.src,
  };
}

function sanearBloques(crudo: unknown, vistos: Vistos): Bloque[] {
  return (Array.isArray(crudo) ? crudo : [])
    .map((b) => sanearBloque(b, vistos))
    .filter((b): b is Bloque => b !== null);
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
  // Un alias que no es un nombre de variable no se puede escribir en ninguna
  // fórmula, así que publicarlo sería ofrecer algo inalcanzable. `problemaDeAlias`
  // decide, que es la misma autoridad que usa el selector.
  const publica: Record<string, string> = {};
  if (typeof i.publica === 'object' && i.publica !== null) {
    for (const [k, v] of Object.entries(i.publica)) {
      if (typeof v === 'string' && !problemaDeAlias(v)) publica[k] = v.trim();
    }
  }
  return {
    slug: i.slug,
    // Un sello ilegible se trata como «sin sello»: no se avisa de un desfase
    // que no se puede comprobar, y se vuelve a sellar al primer cambio.
    sha256: typeof i.sha256 === 'string' && /^[0-9a-f]{64}$/.test(i.sha256) ? i.sha256 : '',
    entradas,
    ...(Object.keys(formulas).length ? { formulas } : {}),
    ...(Object.keys(publica).length ? { publica } : {}),
    ...(typeof i.salida === 'string' && i.salida ? { salida: i.salida } : {}),
  };
}

function sanearSubcarga(crudo: unknown, vistos: Vistos): Subcarga | null {
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
    id: idUnico(s.id, vistos),
    nombre: s.nombre,
    bloques: sanearBloques(s.bloques, vistos),
    ...(variable ? { variable } : {}),
    ...(importada ? { importada } : {}),
  };
}

function sanearCalculo(crudo: unknown, vistos: Vistos): NodoCalculo | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const k = crudo as Partial<NodoCalculo>;
  const importada = sanearImportada(k.importada);
  return {
    id: idUnico(k.id, vistos),
    nombre: typeof k.nombre === 'string' ? k.nombre : 'Cálculo',
    bloques: sanearBloques(k.bloques, vistos),
    ...(importada ? { importada } : {}),
  };
}

function sanearCarga(crudo: unknown, vistos: Vistos): Carga | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const c = crudo as Partial<Carga>;
  if (typeof c.nombre !== 'string') return null;
  return {
    id: idUnico(c.id, vistos),
    nombre: c.nombre,
    // El `tipo` de una obra guardada con el catálogo cerrado se ignora: la carga
    // ya no lo tiene, y el nombre —que es lo que la identifica— no dependía de él.
    // Una obra guardada antes del desglose no trae `subcargas`; no es un dato
    // corrupto, es una obra anterior, y abre sin desglose y sin avisos.
    subcargas: (Array.isArray(c.subcargas) ? c.subcargas : [])
      .map((s) => sanearSubcarga(s, vistos))
      .filter((s): s is Subcarga => s !== null),
  };
}

/**
 * El id con el que una obra guardada se identifica y se enlaza.
 *
 * Viaja en la URL (`/obra/<id>`), así que tiene que pasar el alfabeto cerrado de
 * `SLUG_PROYECTO_RE` (`src/lib/ruta.ts`): uno que no lo pase deja una obra que
 * está guardada y es **inalcanzable**, porque `parsearRuta` rechaza la ruta y
 * cae en el menú sin decir nada. Se slugifica en vez de descartar la obra.
 *
 * Es una función aparte porque la usan el saneo y `guardarObra`, que tiene que
 * encontrar la misma entrada en el archivo crudo.
 */
export function idDeObra(crudo: unknown): string | null {
  const id = (crudo as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || !id) return null;
  return /^[a-z0-9][a-z0-9-]*$/.test(id) ? id : slugificar(id) || null;
}

export function sanearObra(crudo: unknown): Obra | null {
  const id = idDeObra(crudo);
  if (id === null) return null;
  const o = crudo as Partial<Obra>;
  // Un solo juego de ids por obra: cargas, partidas, cálculos y bloques
  // comparten espacio porque todos acaban siendo claves de `results`.
  const vistos: Vistos = new Set();
  return {
    version: VERSION_OBRA,
    id,
    nombre: typeof o.nombre === 'string' ? o.nombre : id,
    creada: typeof o.creada === 'string' ? o.creada : new Date(0).toISOString(),
    modulos: (Array.isArray(o.modulos) ? o.modulos : []).filter((m): m is Modulo =>
      MODULOS.has(m as string),
    ),
    cargas: (Array.isArray(o.cargas) ? o.cargas : [])
      .map((c) => sanearCarga(c, vistos))
      .filter((c): c is Carga => c !== null),
    calculos: (Array.isArray(o.calculos) ? o.calculos : [])
      .map((k) => sanearCalculo(k, vistos))
      .filter((k): k is NodoCalculo => k !== null),
  };
}

/**
 * Las obras **tal como están escritas**, sin sanear.
 *
 * Existe para que guardar una obra no toque a las demás. `guardarObra` leía las
 * saneadas y las volvía a volcar todas, y como eso ocurre cada 300 ms mientras
 * se teclea, editar una obra le aplicaba la migración a las otras sin que nadie
 * las abriera: un bloque con `src` que no es texto desaparecía, los ids de
 * rescate se materializaban y los campos desconocidos se perdían. El saneo es
 * defensivo **al leer**; al escribir era destructivo.
 */
function leerCrudo(): unknown[] {
  try {
    const texto = window.localStorage.getItem(CLAVE_OBRAS);
    if (!texto) return [];
    const datos = JSON.parse(texto) as { obras?: unknown };
    return Array.isArray(datos?.obras) ? datos.obras : [];
  } catch {
    // Modo privado, almacenamiento bloqueado o JSON corrupto. Abrir con la lista
    // vacía es mejor que no abrir; el error real aparece al intentar guardar,
    // que es cuando hay algo que perder.
    return [];
  }
}

function leerTodo(): Obra[] {
  return leerCrudo()
    .map(sanearObra)
    .filter((o): o is Obra => o !== null);
}

/** Escribe el archivo entero. Las entradas que no se tocaron viajan **crudas**,
 *  como estaban: ver la nota de `leerCrudo`. */
function escribirTodo(obras: unknown[]): Resultado {
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

/**
 * Inserta o reemplaza **solo esta obra**, conservando su sitio en el archivo y
 * el texto crudo de todas las demás.
 *
 * Con `crear`, una obra que ya existe es un fallo en vez de un reemplazo. Sin
 * eso, dos pestañas abiertas en el índice proponían las dos el mismo id —cada
 * una ve su propia lista— y la segunda en guardar **borraba** la obra de la
 * primera sin decir una palabra.
 */
export function guardarObra(obra: Obra, { crear = false } = {}): Resultado {
  const obras = leerCrudo();
  const i = obras.findIndex((o) => idDeObra(o) === obra.id);
  if (i >= 0) {
    if (crear) {
      return {
        ok: false,
        motivo: `Ya hay una obra con el id «${obra.id}» en este navegador, quizá creada en otra pestaña.`,
      };
    }
    obras[i] = obra;
  } else {
    obras.push(obra);
  }
  return escribirTodo(obras);
}

export function borrarObra(id: string): Resultado {
  return escribirTodo(leerCrudo().filter((o) => idDeObra(o) !== id));
}
