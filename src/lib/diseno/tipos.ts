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
  /** Valores discretos (diámetros comerciales de barra, número de ramas…). */
  opciones?: number[];
  ayuda?: string;
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

export interface ModuloDiseno<E extends Entradas = Entradas> {
  /** Va en la URL: `/diseno/<id>`. Mismo alfabeto que el slug de una planilla. */
  id: string;
  titulo: string;
  /** Una línea para la tarjeta del menú. */
  resumen: string;
  disciplina: string;
  norma: string;
  /** Ruta bajo `/esquemas/`; es lo único que `renderEsquema` acepta incrustar. */
  esquema: string;
  anchoEsquema: number;
  altoEsquema: number;
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
   * Contraste contra una planilla publicada: con `porDefecto`, estos símbolos
   * tienen que dar lo mismo que da esa planilla.
   *
   * Es la comprobación que impide que la versión breve se despegue en silencio
   * de la memoria completa de la que salió — un coeficiente que se corrige en
   * una y no en la otra, un `d` que deja de derivarse igual. Misma idea que el
   * bloque «CONTRASTE CON EL POST» que llevan las planillas del corpus.
   */
  contraste?: {
    /** Slug en `public/planillas/`. */
    planilla: string;
    valores: string[];
  };
}
