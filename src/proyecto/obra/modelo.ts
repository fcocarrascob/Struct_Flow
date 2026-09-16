// ─────────────────────────────────────────────────────────────────────────────
// El documento de una obra: lo único que se guarda de un proyecto propio.
//
// Capa pura, sin React y sin `localStorage`: decidir cómo se llama la próxima
// carga o si un nombre está libre es aritmética de cadenas, y se tiene que poder
// probar fuera del navegador.
//
// POR QUÉ ACÁ Y NO EN `src/lib/`
// ------------------------------
// La misma razón que documenta `../contrato.ts`: el harness sella el motor de
// este repo como el hash de árbol de `src/lib` y `scripts`. Una obra no evalúa
// ninguna planilla; que su código mueva ese hash haría que el sello dijera
// «cambió el motor» cuando no cambió.
//
// QUÉ ES UNA OBRA Y QUÉ NO
// ------------------------
// Una obra es de este navegador. NO es un proyecto del harness: aquel se
// proyecta desde archivos versionados y acá no se escribe nada de vuelta. Los
// dos se pintan con el mismo contrato de grafo (`../contrato.ts`) porque los dos
// son proyecciones, pero la fuente es distinta y no se mezclan.
// ─────────────────────────────────────────────────────────────────────────────

/** Un tipo de carga del catálogo. `simbolo` es el de la norma, y es el que
 *  después van a usar las combinaciones: por eso el catálogo es cerrado. */
export interface TipoCargaDef {
  clave: string;
  simbolo: string;
  nombre: string;
}

/**
 * El catálogo del ASCE 7, que es la norma en la que está escrita la biblioteca
 * de este repo. `otra` existe para no obligar a mentir cuando algo no calza; su
 * símbolo queda vacío a propósito, porque una carga sin símbolo no puede entrar
 * en una combinación sin que alguien la bautice primero.
 */
export const TIPOS_CARGA: readonly TipoCargaDef[] = [
  { clave: 'permanente', simbolo: 'D', nombre: 'Permanente' },
  { clave: 'sobrecarga', simbolo: 'L', nombre: 'Sobrecarga de uso' },
  { clave: 'sobrecarga-techo', simbolo: 'Lr', nombre: 'Sobrecarga de techo' },
  { clave: 'nieve', simbolo: 'S', nombre: 'Nieve' },
  { clave: 'lluvia', simbolo: 'R', nombre: 'Lluvia' },
  { clave: 'viento', simbolo: 'W', nombre: 'Viento' },
  { clave: 'sismo', simbolo: 'E', nombre: 'Sismo' },
  { clave: 'empuje-suelo', simbolo: 'H', nombre: 'Empuje de suelo' },
  { clave: 'fluidos', simbolo: 'F', nombre: 'Presión de fluidos' },
  { clave: 'termica', simbolo: 'T', nombre: 'Térmica o deformación impuesta' },
  { clave: 'otra', simbolo: '', nombre: 'Otra' },
];

export const TIPO_CARGA_POR_OMISION = 'permanente';

const POR_CLAVE = new Map(TIPOS_CARGA.map((t) => [t.clave, t]));

/** Un tipo que no esté en el catálogo se devuelve tal cual, visible y no perdido:
 *  una obra guardada con una versión anterior no se puede quedar sin su tipo. */
export function tipoCarga(clave: string): TipoCargaDef {
  return POR_CLAVE.get(clave) ?? { clave, simbolo: '', nombre: clave };
}

/**
 * Un bloque de la mini hoja de una subcarga.
 *
 * NO LLEVA x/y A PROPÓSITO. Es una lista ordenada, y el orden del array es el
 * orden de lectura. El motor ordena por `(y, x)`, así que al evaluar se le
 * sintetizan coordenadas desde el índice; guardarlas sería guardar dos veces lo
 * mismo. Es además hacia donde va la hoja grande, según `docs/pendientes.md`.
 */
export interface Bloque {
  id: string;
  /** `program` e `image` quedan fuera: una partida de carga no los necesita. */
  tipo: 'math' | 'text';
  src: string;
}

/**
 * Una genérica de `public/biblioteca/` traída a la obra.
 *
 * SE GUARDA UNA REFERENCIA CON SELLO, NO LA HOJA.
 * ----------------------------------------------
 * Lo que persiste es el slug, lo que el usuario escribió en el formulario y el
 * `sha256` que tenía la genérica **al importarla**. La hoja se vuelve a
 * descargar de `/biblioteca` al abrir la obra, así que siempre se instancia la
 * versión publicada y verificada, no una copia congelada que envejece a
 * escondidas.
 *
 * El sello es lo que hace honesta esa decisión: si el archivo de hoy tiene otro
 * hash, el nodo lo dice. Es la misma señal con la que el harness detecta que una
 * instancia quedó atrás (`meta.origen.sha256`), y sin ella un cambio en la
 * genérica movería un número ya emitido sin que nadie se entere — la primera
 * clase de falla de la taxonomía: resultado plausible y falso.
 */
export interface Importada {
  slug: string;
  /** 64 hex. El de los bytes que se instanciaron el día que se importó. */
  sha256: string;
  entradas: Record<string, number>;
  /**
   * Campos atados a una expresión de la obra, por nombre de campo.
   *
   * Es lo que conecta el cálculo de cargas con la planilla que las usa: el
   * momento que entra a la zapata deja de ser un número copiado a mano y pasa a
   * ser el que produjo el nodo de esfuerzos. La expresión se evalúa en el scope
   * compartido y se convierte a la unidad que el campo declara, así que atar
   * `Mu_Y [kN*m]` a algo en `tonf*m` funciona y atarlo a un área no.
   *
   * Un campo atado ignora su valor en `entradas`, que se conserva: desatarlo
   * devuelve el número que había.
   */
  formulas?: Record<string, string>;
  /**
   * Cuál de las salidas declaradas es el valor que la partida aporta al total.
   * Solo tiene sentido dentro de una partida; un nodo de cálculo suelto muestra
   * todas sus salidas y no elige ninguna.
   */
  salida?: string;
}

/**
 * Una partida del desglose de una carga permanente, respaldada por su cálculo.
 *
 * `nombre` ES UNA ETIQUETA LIBRE: «Equipos sala de bombas», no `CM_1`. Antes era
 * la variable que su hoja tenía que definir, y eso ataba dos cosas que no tienen
 * por qué coincidir —cómo se llama la partida en la memoria y cómo se llama el
 * número dentro del cálculo—, además de obligar a escribir etiquetas con guion
 * bajo. Cuál variable aporta el valor lo dice `variable`.
 *
 * Dos respaldos posibles y excluyentes: la mini hoja propia (`bloques`) o una
 * genérica de la biblioteca (`importada`). Los `bloques` no se borran al
 * importar: quitar la planilla devuelve la hoja que había, que suele ser el
 * tanteo del que salió la decisión de buscar una genérica.
 */
export interface Subcarga {
  id: string;
  nombre: string;
  bloques: Bloque[];
  /** Cuál variable de su hoja libre es el valor de la partida. */
  variable?: string;
  importada?: Importada;
}

/**
 * Qué nombre aporta el valor de una partida, venga de donde venga.
 *
 * Los dos respaldos lo guardan en sitios distintos a propósito —`variable` es de
 * la hoja libre, `importada.salida` es de la planilla— para que cada uno se
 * borre con su respaldo: cambiar de genérica no puede dejar apuntando a una
 * salida que la nueva no tiene. Pero se LEE por acá y solo por acá, así que el
 * resto del código no tiene que saber cuál de los dos es.
 */
export function variableDePartida(sub: Subcarga): string | undefined {
  return sub.importada ? sub.importada.salida : sub.variable;
}

/**
 * Un cálculo suelto de la obra: una genérica de la biblioteca instanciada, que
 * no cuelga de ninguna carga.
 *
 * Es el caso de las costaneras, una zapata o un anclaje: cálculos que la obra
 * tiene que respaldar y que no producen una carga. Por eso no lleva variable de
 * salida —muestra las que la genérica declara— ni entra en ninguna suma.
 */
export interface NodoCalculo {
  id: string;
  /** Lo que se lee en el canvas. Al importar se propone el título de la genérica. */
  nombre: string;
  /**
   * Su hoja libre. Es lo que convierte al canvas en un grafo de datos y no en
   * una colección de planillas sueltas: un nodo «Geometría» que define
   * `A_planta` y `h_losa` y del que cuelgan los demás no es ninguna planilla de
   * la biblioteca, es el dato común de la obra.
   */
  bloques: Bloque[];
  importada?: Importada;
}

export interface Carga {
  id: string;
  /** Lo que el usuario escribe: `D`, `SC oficinas`, `Wx`. Es el identificador
   *  con el que la carga se va a citar, así que tiene que ser único. */
  nombre: string;
  tipo: string;
  /** El desglose. Hoy solo lo llevan las permanentes; ver `admiteSubcargas`. */
  subcargas: Subcarga[];
}

/**
 * Qué tipos de carga se desglosan.
 *
 * Solo la permanente, que es lo acordado. El resto del código no supone nada de
 * esto: una carga siempre tiene `subcargas`, y abrirlo a otro tipo es cambiar
 * esta condición y nada más.
 */
export function admiteSubcargas(tipo: string): boolean {
  return tipo === 'permanente';
}

/**
 * Los nodos que el usuario agregó desde la paleta.
 *
 * `cargas` es único por obra —las definiciones son una sola tabla, como en
 * SAP—; `calculo` no, y por eso no vive acá sino en su propia lista: de un
 * cálculo suelto puede haber tantos como la obra necesite.
 */
export type Modulo = 'cargas';

export interface Obra {
  version: 1;
  id: string;
  nombre: string;
  /** ISO. Ordena el índice sin depender del orden en que se guardaron. */
  creada: string;
  modulos: Modulo[];
  cargas: Carga[];
  calculos: NodoCalculo[];
}

export const VERSION_OBRA = 1;

let secuencia = 0;

/** Lleva la marca del reloj, un contador y azar: dos pestañas abriendo obras al
 *  mismo tiempo no pueden coincidir. */
function nuevoId(prefijo: string): string {
  return `${prefijo}${Date.now().toString(36)}${(secuencia++).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/**
 * El id viaja en la URL (`/obra/<id>`), así que tiene que pasar el alfabeto
 * cerrado de `SLUG_PROYECTO_RE` en `src/lib/ruta.ts`. Se quitan las tildes antes
 * de filtrar para que «Galpón» dé `galpon` y no `galp-n`.
 */
export function slugificar(nombre: string): string {
  const plano = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const limpio = plano
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  // Un nombre que no deja ninguna letra —«###»— no puede quedarse sin ruta.
  return /^[a-z0-9]/.test(limpio) ? limpio : `obra-${limpio}`.replace(/-+$/, '');
}

export const NOMBRE_OBRA_POR_OMISION = 'Obra sin nombre';

/**
 * Una obra nueva, con el id ya libre respecto de `ocupados`. El sufijo es un
 * número y no un hash porque el id se ve en la barra de direcciones.
 */
export function nuevaObra(nombre: string, ocupados: readonly string[] = []): Obra {
  const limpio = nombre.trim() || NOMBRE_OBRA_POR_OMISION;
  const base = slugificar(limpio) || 'obra';
  const tomados = new Set(ocupados);
  let id = base;
  for (let i = 2; tomados.has(id); i++) id = `${base}-${i}`;
  return {
    version: VERSION_OBRA,
    id,
    nombre: limpio,
    creada: new Date().toISOString(),
    modulos: [],
    cargas: [],
    calculos: [],
  };
}

export function nuevoCalculo(): NodoCalculo {
  return { id: nuevoId('k'), nombre: 'Cálculo', bloques: [] };
}

/**
 * La próxima carga, ya bautizada. Propone el símbolo del tipo (`D`, `W`) y, si
 * está tomado, le agrega el número que sigue: escribir tres permanentes seguidas
 * no debería empezar por corregir tres veces el mismo nombre repetido.
 */
export function nuevaCarga(cargas: readonly Carga[], tipo = TIPO_CARGA_POR_OMISION): Carga {
  const base = tipoCarga(tipo).simbolo || 'C';
  const tomados = new Set(cargas.map((c) => c.nombre.trim()));
  let nombre = base;
  for (let i = 2; tomados.has(nombre); i++) nombre = `${base}${i}`;
  return { id: nuevoId('c'), nombre, tipo, subcargas: [] };
}

/**
 * El mismo alfabeto que el lado izquierdo de un `:=` en el motor
 * (`DEF_RE` de `src/lib/worksheet.ts`). Tiene que coincidir: si acá se acepta un
 * nombre que allá no es una definición válida, la hoja nunca va a definir la
 * variable y quien la espere se queda sin valor sin decir por qué.
 */
export const IDENTIFICADOR_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;

/** Todos los identificadores que aparecen en un texto, sin repetir. */
export function identificadoresDe(src: string): string[] {
  return [...new Set(src.match(/[\p{L}_][\p{L}\p{N}_]*/gu) ?? [])];
}

export function nuevaSubcarga(subcargas: readonly Subcarga[]): Subcarga {
  const n = subcargas.length + 1;
  // Nace con la línea que la define: una hoja en blanco no dice qué se espera de
  // ella, y esta línea es literalmente el respaldo mínimo de la partida. La
  // variable propuesta y la etiqueta ya no son lo mismo, y eso es el punto.
  const variable = `CM_${n}`;
  return {
    id: nuevoId('s'),
    nombre: `Partida ${n}`,
    variable,
    bloques: [{ id: nuevoId('b'), tipo: 'math', src: `${variable} := ` }],
  };
}

export function nuevoBloque(tipo: 'math' | 'text', src = ''): Bloque {
  return { id: nuevoId('b'), tipo, src };
}

/**
 * Qué le pasa al nombre de una carga, o cadena vacía si no le pasa nada.
 *
 * Devuelve el motivo en vez de un booleano porque es el motivo lo que se pinta:
 * un nodo rojo que no dice por qué obliga a salir del canvas a averiguarlo.
 */
export function problemaDeNombre(carga: Carga, cargas: readonly Carga[]): string {
  const nombre = carga.nombre.trim();
  if (!nombre) return 'Sin nombre: una carga sin nombre no se puede citar en una combinación.';
  const otra = cargas.find((c) => c.id !== carga.id && c.nombre.trim() === nombre);
  if (otra) return `Nombre repetido: ya hay otra carga que se llama «${nombre}».`;
  return '';
}

// ── Operaciones sobre el documento ───────────────────────────────────────────
//
// Devuelven una obra nueva en vez de mutar la que reciben: el canvas las usa
// dentro de `setState`, y mutar ahí deja a React sin saber que algo cambió.

export function agregarModulo(obra: Obra, modulo: Modulo): Obra {
  if (obra.modulos.includes(modulo)) return obra;
  return { ...obra, modulos: [...obra.modulos, modulo] };
}

export function agregarCarga(obra: Obra, tipo?: string): { obra: Obra; carga: Carga } {
  const carga = nuevaCarga(obra.cargas, tipo);
  return { obra: { ...obra, cargas: [...obra.cargas, carga] }, carga };
}

export function cambiarCarga(obra: Obra, id: string, campos: Partial<Omit<Carga, 'id'>>): Obra {
  return {
    ...obra,
    cargas: obra.cargas.map((c) => (c.id === id ? { ...c, ...campos } : c)),
  };
}

export function borrarCarga(obra: Obra, id: string): Obra {
  return { ...obra, cargas: obra.cargas.filter((c) => c.id !== id) };
}

/** Reemplaza las partidas de una carga. Un solo camino de escritura para el
 *  desglose: agregar, renombrar, borrar y editar una hoja pasan todos por acá. */
export function conSubcargas(obra: Obra, idCarga: string, subcargas: Subcarga[]): Obra {
  return {
    ...obra,
    cargas: obra.cargas.map((c) => (c.id === idCarga ? { ...c, subcargas } : c)),
  };
}

export function cargaDeSubcarga(obra: Obra, idSub: string): Carga | undefined {
  return obra.cargas.find((c) => c.subcargas.some((s) => s.id === idSub));
}

export function agregarCalculo(obra: Obra, calculo: NodoCalculo): Obra {
  return { ...obra, calculos: [...obra.calculos, calculo] };
}

export function cambiarCalculo(obra: Obra, id: string, cambio: (k: NodoCalculo) => NodoCalculo): Obra {
  return { ...obra, calculos: obra.calculos.map((k) => (k.id === id ? cambio(k) : k)) };
}

export function borrarCalculo(obra: Obra, id: string): Obra {
  return { ...obra, calculos: obra.calculos.filter((k) => k.id !== id) };
}

/** Todos los slugs que la obra referencia, para saber qué hay que descargar. */
export function slugsImportados(obra: Obra): string[] {
  const s = new Set<string>();
  for (const k of obra.calculos) if (k.importada) s.add(k.importada.slug);
  for (const c of obra.cargas) {
    for (const sub of c.subcargas) if (sub.importada) s.add(sub.importada.slug);
  }
  return [...s];
}

/**
 * Ata o desata un campo de una planilla importada.
 *
 * Desatar (`expr` sin valor) BORRA la clave en vez de dejarla vacía: `formulas`
 * responde «¿este campo está atado?», y una cadena vacía diría que sí a una
 * pregunta cuya respuesta es que no.
 */
export function conFormula(imp: Importada, campo: string, expr: string | undefined): Importada {
  const { [campo]: _fuera, ...resto } = imp.formulas ?? {};
  return { ...imp, formulas: expr === undefined ? resto : { ...resto, [campo]: expr } };
}

/** Todas las hojas libres de la obra, con el id de nodo con que se pintan. */
export interface HojaDeNodo {
  /** El id del NODO del canvas, no el del documento: `partida:xxx`, `calculo:xxx`. */
  idNodo: string;
  etiqueta: string;
  bloques: Bloque[];
}
