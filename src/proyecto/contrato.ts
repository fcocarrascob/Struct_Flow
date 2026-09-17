// ─────────────────────────────────────────────────────────────────────────────
// El contrato del grafo que publica `harness.grafo`.
//
// Esta capa es pura: no importa React ni hace fetch. Lo único que hace es
// decidir si lo que llegó se puede pintar, y ese «no» es la pieza importante
// del archivo.
//
// POR QUÉ `src/proyecto/` Y NO `src/lib/proyecto/`
// -----------------------------------------------
// Por convención le tocaría vivir junto a `lib/diseno/`. Está aparte por una
// razón mecánica: `_herramientas.json` del harness sella el MOTOR de este repo
// como el hash de árbol de `src/lib` y `scripts`, y el lint lo vigila con E13.
// Cualquier archivo nuevo dentro de `src/lib` mueve ese hash, y mover el hash
// del motor marca `eval_de_otro_motor` en TODAS las planillas de TODOS los
// proyectos del harness, que hay que reverificar una por una.
//
// El canvas de proyecto no evalúa ninguna planilla. Que su código dispare esa
// cascada haría que el sello dijera «cambió el motor» cuando no cambió, y un
// aviso que salta por lo que no es deja de leerse.
//
// POR QUÉ EL CONTRATO VA VERSIONADO
// ---------------------------------
// El harness y este repo son repositorios distintos, y lo que viaja entre ellos
// no es una API con contrato negociado: son los ESQUEMAS de `PERFIL.json`, de
// las planillas y del registro. Cuando el harness agrega una clave o cambia la
// forma de un nodo, un front que dibuja «lo que entiende» no lanza ningún
// error: dibuja un grafo más chico, que se ve perfecto y es viejo. Es la
// primera clase de falla de la taxonomía —resultado plausible y falso— y la
// única defensa es negarse a pintar una versión que no se conoce.
//
// Cuando `harness.grafo` suba a `contrato: 2`, acá se agrega el 2 a
// `CONTRATOS_SOPORTADOS` DESPUÉS de mirar qué cambió, nunca antes.
// ─────────────────────────────────────────────────────────────────────────────

export const CONTRATOS_SOPORTADOS = [1] as const;

export type Severidad = 'ok' | 'aviso' | 'error';

/** Los tipos que hoy emite `harness.grafo`. Uno nuevo no rompe: se pinta genérico. */
export type TipoNodo =
  | 'proyecto'
  | 'norma'
  | 'hueco'
  | 'accion'
  | 'carga'
  | 'familia-combinacion'
  | 'modelo'
  | 'hoja-de-valores'
  | 'planilla'
  | 'lectura'
  | 'documento'
  | 'decision'
  | 'hallazgo';

export interface NodoGrafo {
  id: string;
  tipo: TipoNodo | string;
  etiqueta: string;
  subtitulo: string;
  campos: Record<string, unknown>;
  severidad: Severidad;
  archivo: string;
  linea: number;
  editable: boolean;
  /** Por qué el nodo está en amarillo o en rojo. Un nodo rojo sin motivo obliga
   *  a salir del canvas para averiguarlo, que es lo que el canvas viene a evitar. */
  motivos: string[];
}

export interface AristaGrafo {
  desde: string;
  hasta: string;
  tipo: string;
  etiqueta: string;
  severidad: Severidad;
}

export interface Grafo {
  contrato: number;
  generado: string;
  proyecto: string;
  ruta: string;
  modelo_vigente: string;
  nodos: NodoGrafo[];
  aristas: AristaGrafo[];
  /** Lo que la proyección no pudo resolver. No son desfases del proyecto. */
  avisos: string[];
}

export interface ProyectoListado {
  slug: string;
  nombre: string;
  cliente: string;
  pais: string;
  fase: string;
  ambito: string;
  modelo_vigente: string;
}

export type Veredicto =
  | { ok: true; grafo: Grafo }
  | { ok: false; motivo: string; detalle: string };

const SEVERIDADES: ReadonlySet<string> = new Set<Severidad>(['ok', 'aviso', 'error']);

/**
 * Un nodo utilizable, o `null`.
 *
 * Hay que comprobarlo de verdad, nodo por nodo, por lo mismo que `esRegion` lo
 * hace con una región (`src/lib/hoja-json.ts`): quien lo consume no tiene red.
 * `NodoHarness` hace `motivos.join()`, `PanelLateral` hace
 * `Object.entries(campos)` y `colocar` hace `etiqueta.localeCompare()`; con
 * cualquiera de los tres ausente, la vista entera cae en el `ErrorBoundary` y
 * el usuario ve la pantalla de error sin saber que el problema está del otro
 * lado. Comprobar la versión del contrato y luego hacer un cast de la forma era
 * media defensa.
 */
function sanearNodo(crudo: unknown): NodoGrafo | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const n = crudo as Partial<NodoGrafo>;
  if (typeof n.id !== 'string' || !n.id) return null;
  return {
    id: n.id,
    tipo: typeof n.tipo === 'string' ? n.tipo : 'desconocido',
    etiqueta: typeof n.etiqueta === 'string' ? n.etiqueta : n.id,
    subtitulo: typeof n.subtitulo === 'string' ? n.subtitulo : '',
    campos: typeof n.campos === 'object' && n.campos !== null ? n.campos : {},
    severidad: SEVERIDADES.has(n.severidad as string) ? n.severidad! : 'ok',
    archivo: typeof n.archivo === 'string' ? n.archivo : '',
    linea: Number.isFinite(n.linea) ? (n.linea as number) : 0,
    editable: n.editable === true,
    motivos: Array.isArray(n.motivos) ? n.motivos.filter((m): m is string => typeof m === 'string') : [],
  };
}

function sanearArista(crudo: unknown): AristaGrafo | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const a = crudo as Partial<AristaGrafo>;
  if (typeof a.desde !== 'string' || typeof a.hasta !== 'string' || !a.desde || !a.hasta) return null;
  return {
    desde: a.desde,
    hasta: a.hasta,
    tipo: typeof a.tipo === 'string' ? a.tipo : '',
    etiqueta: typeof a.etiqueta === 'string' ? a.etiqueta : '',
    severidad: SEVERIDADES.has(a.severidad as string) ? a.severidad! : 'ok',
  };
}

/**
 * Valida lo que llegó del servidor. Devuelve un veredicto en vez de lanzar
 * porque el motivo del rechazo es lo que hay que mostrar en pantalla: «no puedo
 * pintar esto» sin decir por qué es tan inútil como pintarlo mal.
 */
export function validarGrafo(crudo: unknown): Veredicto {
  if (typeof crudo !== 'object' || crudo === null) {
    return { ok: false, motivo: 'La respuesta no es un objeto', detalle: String(crudo) };
  }
  const g = crudo as Partial<Grafo>;

  if (typeof g.contrato !== 'number') {
    return {
      ok: false,
      motivo: 'La respuesta no declara contrato',
      detalle:
        'Un grafo sin versión no se puede pintar sin adivinar su forma. ' +
        'Revisa que del otro lado esté corriendo `python -m harness.servidor`.',
    };
  }
  if (!(CONTRATOS_SOPORTADOS as readonly number[]).includes(g.contrato)) {
    return {
      ok: false,
      motivo: `Contrato ${g.contrato}, y esta vista sabe pintar ${CONTRATOS_SOPORTADOS.join(', ')}`,
      detalle:
        'El harness cambió la forma del grafo. Pintar lo que se entienda daría un ' +
        'canvas más chico que se ve correcto y está viejo. Actualiza Struct_Flow, ' +
        'o agrega la versión a CONTRATOS_SOPORTADOS después de mirar qué cambió.',
    };
  }
  if (!Array.isArray(g.nodos) || !Array.isArray(g.aristas)) {
    return {
      ok: false,
      motivo: 'El grafo no trae `nodos` y `aristas`',
      detalle: 'Contrato declarado ' + g.contrato + ', pero la forma no corresponde.',
    };
  }

  // Los ids se deduplican como hace `sanearRegiones` con las regiones: dos nodos
  // con el mismo id se pisan en `colocar()` —que devuelve un objeto por id— y
  // comparten `key` de React.
  const vistos = new Set<string>();
  const nodos: NodoGrafo[] = [];
  for (const crudoNodo of g.nodos) {
    const n = sanearNodo(crudoNodo);
    if (!n || vistos.has(n.id)) continue;
    vistos.add(n.id);
    nodos.push(n);
  }

  return {
    ok: true,
    grafo: {
      contrato: g.contrato,
      generado: typeof g.generado === 'string' ? g.generado : '',
      proyecto: typeof g.proyecto === 'string' ? g.proyecto : '',
      ruta: typeof g.ruta === 'string' ? g.ruta : '',
      modelo_vigente: typeof g.modelo_vigente === 'string' ? g.modelo_vigente : '',
      nodos,
      // Una arista hacia un nodo que no llegó no se pinta: React Flow la
      // descarta con un aviso en consola, y es ruido que nadie va a leer.
      aristas: g.aristas
        .map(sanearArista)
        .filter((a): a is AristaGrafo => a !== null && vistos.has(a.desde) && vistos.has(a.hasta)),
      avisos: Array.isArray(g.avisos) ? g.avisos.filter((m): m is string => typeof m === 'string') : [],
    },
  };
}

/** El peor de dos severidades. El orden importa: un nodo con varios desfases
 *  toma el peor, nunca el último que se leyó. */
export const ORDEN_SEVERIDAD: Record<Severidad, number> = { ok: 0, aviso: 1, error: 2 };

export function peor(a: Severidad, b: Severidad): Severidad {
  return ORDEN_SEVERIDAD[a] >= ORDEN_SEVERIDAD[b] ? a : b;
}
