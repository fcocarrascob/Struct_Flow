import {
  A4_ALTO_UTIL_PX,
  A4_ANCHO_PX,
  A4_HOJA_ANCHO_PX,
  A4_MARGEN_PX,
} from '../../lib/paginacion';
import { GRID } from './MathRegion';

/**
 * Dónde empieza el área útil del papel dentro del lienzo.
 *
 * Las **8.377** regiones del corpus están en `x = 40`, sin una sola excepción,
 * así que el papel se ancla ahí y no al contenido: anclarlo al mínimo de las `x`
 * haría que la hoja entera saltase de sitio al arrastrar un bloque. Es una
 * constante con fecha de caducidad — con la hoja de flujo lineal el papel pasa a
 * ser un contenedor de verdad y esto sobra.
 */
export const ORIGEN_PAPEL_X = 40;

/** El tope del papel, por el mismo motivo que `ORIGEN_PAPEL_X`. */
export const ORIGEN_PAPEL_Y = 40;

/** Cuánto hay que correr el lienzo para que quepa el margen izquierdo dibujado. */
export const DESPLAZAMIENTO_LIENZO = Math.max(0, A4_MARGEN_PX - ORIGEN_PAPEL_X);

/**
 * El borde izquierdo del papel, en coordenadas del lienzo. Sale negativo, y por
 * eso el lienzo va corrido (ver `DESPLAZAMIENTO_LIENZO`). Lo exporta para que
 * los rótulos de corte de página se alineen con la hoja sin rehacer la cuenta.
 */
export const IZQUIERDA_HOJA = ORIGEN_PAPEL_X - A4_MARGEN_PX;
export const ANCHO_HOJA = A4_HOJA_ANCHO_PX;

interface Props {
  /** Dónde abre cada página, en coordenadas del lienzo. */
  marcas: { pagina: number; y: number }[];
  /** Hasta dónde llega el bloque más bajo de la hoja. */
  fondo: number;
}

/**
 * La silueta del papel bajo los bloques: dónde está la hoja, dónde el margen y
 * dónde parte la página.
 *
 * **Es una guía, no una restricción.** Nada impide poner un bloque fuera de
 * ella; el documento de impresión refluye a un documento lineal y no mira la
 * posición de nada.
 *
 * ── Qué es exacto aquí y qué no ────────────────────────────────────────────────
 *
 * **En horizontal, la geometría es literal.** La hoja mide 210 mm y su caja de
 * contenido 180 mm, dibujadas a escala real, y esos 180 mm son exactamente los
 * `A4_ANCHO_PX` que mide la caja de medición de cada región: una línea envuelve
 * en pantalla donde envuelve en el PDF, así que el borde derecho dibujado es el
 * borde derecho de verdad.
 *
 * **En vertical, no puede serlo, y por eso no lo finge.** La `y` del lienzo no
 * guarda relación lineal con la página impresa: `WorksheetPrint` refluye los
 * bloques a un documento lineal con sus propios márgenes, de modo que apilar
 * rectángulos de `A4_HOJA_ALTO_PX` desde un origen dibujaría cortes que el PDF
 * no tiene. Las fronteras son las **medidas** —la `y` de la región que abre cada
 * página, que es lo que ya rotulan las líneas «página N»—, así que una página
 * dibujada mide lo que ocupa en el lienzo y no 1122 px.
 *
 * Dicho de otro modo: el ancho responde a «¿me cabe?» y el alto a «¿hasta dónde
 * llega la página 3?». Las dos preguntas son las que se hacen al escribir; la de
 * «¿tiene la hoja proporción A4?» no la hace nadie.
 */
/**
 * Los bordes horizontales del papel: el tope, cada corte de página medido, y el
 * cierre de la última hoja.
 *
 * Esa última se dibuja **entera** —`A4_ALTO_UTIL_PX` desde su corte—, y no
 * ceñida al último bloque: lo que queda por debajo de lo escrito es sitio donde
 * todavía cabe algo, que es justamente lo que se quiere ver. Y si el contenido
 * del lienzo se estira más allá (el canvas y el papel no separan los bloques
 * igual), manda el contenido, para que ningún bloque acabe sobre el gris.
 *
 * Se ordenan y se quitan los repetidos porque un corte puede caer sobre el mismo
 * píxel que el tope, cuando la primera región de la hoja abre página.
 *
 * Lo exporta porque el lienzo tiene que crecer al menos hasta el último de estos
 * bordes: si se quedara corto, el scroll no llegaría al pie de la última hoja.
 */
export function bordesDePagina(marcas: { y: number }[], fondo: number): number[] {
  const ultimoCorte = marcas.length ? Math.max(...marcas.map((m) => m.y)) : ORIGEN_PAPEL_Y;
  return [
    ORIGEN_PAPEL_Y,
    ...marcas.map((m) => m.y),
    Math.max(fondo + A4_MARGEN_PX, ultimoCorte + A4_ALTO_UTIL_PX),
  ]
    .filter((y, i, todos) => todos.indexOf(y) === i)
    .sort((a, b) => a - b);
}

export default function SiluetaPapel({ marcas, fondo }: Props) {
  const derechaUtil = ORIGEN_PAPEL_X + A4_ANCHO_PX;
  const bordes = bordesDePagina(marcas, fondo);

  const paginas = bordes.slice(0, -1).map((arriba, i) => ({
    arriba,
    alto: bordes[i + 1] - arriba,
  }));

  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
      {paginas.map((p) => (
        <div
          key={`hoja-${p.arriba}`}
          className="absolute border border-slate-300 bg-white shadow-sm"
          style={{
            left: IZQUIERDA_HOJA,
            top: p.arriba - A4_MARGEN_PX,
            width: ANCHO_HOJA,
            height: p.alto,
          }}
        />
      ))}

      {/* Las dos líneas de margen, continuas de arriba abajo: son el borde que
          de verdad importa al escribir, y partirlas por página las volvería un
          adorno intermitente. */}
      {[ORIGEN_PAPEL_X, derechaUtil].map((x) => (
        <div
          key={`margen-${x}`}
          className="absolute border-l border-dashed border-slate-300"
          style={{
            left: x,
            top: ORIGEN_PAPEL_Y - A4_MARGEN_PX,
            height: Math.max(0, bordes[bordes.length - 1] - ORIGEN_PAPEL_Y + A4_MARGEN_PX),
          }}
        />
      ))}

      {/* La cuadrícula, que antes cubría los 1600 px del lienzo entero. Dentro
          del área útil dice algo —a qué paso se ajusta lo que se coloca—; fuera
          solo era textura. */}
      {paginas.map((p) => (
        <div
          key={`rejilla-${p.arriba}`}
          className="absolute"
          style={{
            left: ORIGEN_PAPEL_X,
            top: p.arriba,
            width: A4_ANCHO_PX,
            height: Math.max(0, p.alto - A4_MARGEN_PX),
            backgroundImage:
              'linear-gradient(to right, rgba(100,116,139,0.10) 1px, transparent 1px), ' +
              'linear-gradient(to bottom, rgba(100,116,139,0.10) 1px, transparent 1px)',
            backgroundSize: `${GRID}px ${GRID}px`,
          }}
        />
      ))}
    </div>
  );
}
