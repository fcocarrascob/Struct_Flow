// ─────────────────────────────────────────────────────────────────────────────
// El contrato de un módulo de diseño.
//
// La idea de fondo: **un módulo no calcula por su cuenta**. Declara qué
// parámetros pide y qué resultados enseña, y sabe armar con ellos una hoja del
// canvas. Quien calcula es `evaluateSheet`, el mismo motor que corre las 33
// planillas publicadas.
//
// De ahí salen las tres cosas de una sola evaluación: los resultados en vivo,
// el esquema SVG (que se resuelve contra el scope de la hoja) y la memoria que
// se exporta. Lo que se ve mientras se diseña y lo que sale exportado no pueden
// divergir, porque son la misma hoja.
//
// Añadir un elemento nuevo es, por eso, escribir un archivo de estos y su SVG:
// el formulario, el visor, el panel de resultados y la exportación son un
// armazón genérico que se alimenta de esta declaración.
// ─────────────────────────────────────────────────────────────────────────────

import type { Item } from '../worksheet-layout';
import type { MetaPlanilla } from '../biblioteca/contrato';

/** Una opción de un selector, cuando el número por sí solo no dice nada. */
export interface OpcionCampo {
  valor: number;
  etiqueta: string;
}

/** Un parámetro de entrada. `nombre` es el símbolo con el que entra a la hoja. */
export interface CampoDef {
  nombre: string;
  etiqueta: string;
  /** Unidad con la que se emite a la hoja (`b_w := 30 cm`). Sin ella, adimensional. */
  unidad?: string;
  grupo: string;
  min?: number;
  max?: number;
  paso?: number;
  /**
   * Valores discretos: diámetros comerciales de barra, grados de acero…
   *
   * La forma con etiqueta existe porque hay listas que el número no explica: un
   * selector que ofrece «2530 / 3520» es críptico donde debería decir «ASTM A36»
   * y «ASTM A992 / A572 Gr. 50».
   */
  opciones?: number[] | OpcionCampo[];
  ayuda?: string;
}

/** Las opciones de un campo, siempre con etiqueta. */
export function normalizarOpciones(opciones: number[] | OpcionCampo[]): OpcionCampo[] {
  return opciones.map((o) => (typeof o === 'number' ? { valor: o, etiqueta: String(o) } : o));
}

/**
 * Cómo se pinta un resultado:
 * - `uso` — factor de utilización: barra, y en rojo por encima de 1.
 * - `veredicto` — booleano: ✓ / ✗.
 * - `valor` — número, con su unidad.
 * - `texto` — cadena (qué estado límite gobierna, por ejemplo).
 */
export type TipoSalida = 'valor' | 'uso' | 'veredicto' | 'texto';

export interface SalidaDef {
  nombre: string;
  etiqueta: string;
  unidad?: string;
  tipo: TipoSalida;
  /**
   * Un `veredicto` que, en ✗, es una advertencia sobre la VALIDEZ del
   * resultado y no un incumplimiento de la norma.
   *
   * La distinción no es cosmética: «el alma es esbelta y este módulo no cubre
   * E7» o «las propiedades de catálogo no cuadran con las planchas» no dicen
   * que la sección falle, dicen que el número de al lado puede no significar lo
   * que parece. Meterlos en el veredicto CUMPLE / NO CUMPLE los confunde con un
   * factor de utilización mayor que 1, que es otra cosa.
   */
  aviso?: boolean;
  /**
   * Cómo se enuncia un `aviso` cuando salta.
   *
   * Hacen falta las dos formas: la fila de veredictos lleva un ✓ al lado y por
   * eso su etiqueta tiene que estar en positivo («Dentro del alcance»), y el
   * recuadro de advertencias enuncia el problema («La sección sale del
   * alcance»). Con una sola, una de las dos se lee al revés.
   */
  avisoTexto?: string;
  ayuda?: string;
}

/**
 * Los valores de un formulario. Es un alias de tipo y no una interfaz a
 * propósito: solo un alias con todas sus propiedades numéricas es asignable a
 * `Record<string, number>`, que es lo que permite que el armazón genérico lea
 * un campo por su nombre.
 */
export type Entradas = Record<string, number>;

/** Un juego de entradas con el que `verify:modulos` ejercita el módulo. */
export interface CasoPrueba<E extends Entradas> {
  nombre: string;
  entradas: E;
}

/**
 * Contraste contra una planilla publicada: con las entradas indicadas, estos
 * símbolos tienen que dar lo mismo que da esa planilla.
 *
 * Es la comprobación que impide que la versión breve se despegue en silencio de
 * la memoria completa de la que salió — un coeficiente que se corrige en una y
 * no en la otra, un `d` que deja de derivarse igual. Misma idea que el bloque
 * «CONTRASTE CON EL POST» que llevan las planillas del corpus.
 */
export interface ContrasteDef<E extends Entradas = Entradas> {
  /** Slug en `public/planillas/`. */
  planilla: string;
  /**
   * Entradas con las que correr el contraste. Sin ellas se usa `porDefecto`.
   *
   * Existe porque el caso que reproduce una planilla publicada no tiene por qué
   * ser el que uno quiere ver al abrir el módulo: la planilla fija un perfil
   * concreto, sus propiedades de catálogo y sus factores, y eso son datos de ese
   * ejemplo, no un buen punto de partida.
   */
  entradas?: E;
  /**
   * Los símbolos que tienen que coincidir. Una cadena cuando ambas hojas lo
   * llaman igual; la forma larga cuando no —una planilla que compara dos casos
   * sufija los suyos (`Rd_PA`), y ese sufijo es de su relato, no del cálculo—.
   *
   * `tolerancia` es el desvío relativo admitido. Sin ella se exige identidad
   * (1e-9), que es lo normal. Sirve para el caso en que las dos hojas calculan
   * lo mismo por caminos que no tienen por qué dar el mismo dígito: un módulo
   * que deriva las propiedades de la geometría contra una planilla que las
   * declara del catálogo del perfil difiere en lo que pesan las uniones, y ahí
   * exigir identidad sería exigir que el desvío no exista.
   */
  valores: (string | { mio: string; suyo?: string; tolerancia?: number })[];
}

export interface ModuloDiseno<E extends Entradas = Entradas> {
  /** Va en la URL: `/diseno/<id>`. Mismo alfabeto que el slug de una planilla. */
  id: string;
  titulo: string;
  /** Una línea para la tarjeta del menú. */
  resumen: string;
  disciplina: string;
  norma: string;
  /**
   * Ruta bajo `/esquemas/`; es lo único que `renderEsquema` acepta incrustar.
   * Los módulos escritos en TS la llevan siempre (`verify:modulos` lo exige);
   * uno declarativo, solo si la genérica trae una figura paramétrica.
   */
  esquema?: string;
  anchoEsquema?: number;
  altoEsquema?: number;
  entradas: CampoDef[];
  porDefecto: E;
  salidas: SalidaDef[];
  /**
   * La memoria completa, en orden de lectura y en una sola columna. La región
   * del esquema va al final: captura el scope en su posición, así que solo
   * puede rotular lo que ya se calculó antes que ella.
   */
  construirHoja(e: E): Item[];
  casos: CasoPrueba<E>[];
  /**
   * Contra qué planilla —o planillas— se contrasta este módulo.
   *
   * La lista existe porque un módulo puede cruzar dos cuerpos de norma que
   * ninguna planilla sola cubre entera: la losa de fundación saca el
   * punzonamiento de `losa-punzonamiento-momento` y el corte en una dirección
   * de `zapata-aislada`. Con un solo contraste habría que escribir uno de los
   * dos bloques directo de la norma y sin red, que es justo lo que el contraste
   * existe para evitar.
   */
  contraste?: ContrasteDef<E> | ContrasteDef<E>[];
  /**
   * El módulo sale de una genérica de la biblioteca y no de un archivo TS (ver
   * `declarativo.ts`). Cambia tres cosas: `construirHoja` devuelve las regiones
   * ya colocadas de la genérica, el scope final lo captura un centinela y no la
   * figura, y la memoria se exporta como instancia estampada.
   */
  declarativo?: boolean;
  /** Solo declarativos: la genérica de la que sale, con el sha256 de su archivo. */
  biblioteca?: { slug: string; sha256: string; meta: MetaPlanilla };
}
