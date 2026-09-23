import { useCallback, useEffect, useRef, useState } from 'react';
import type { Region } from '../../lib/worksheet';

/**
 * Cuántos estados se recuerdan.
 *
 * Sale barato en los dos usuarios, y por la misma razón: tanto `setRegions` como
 * `setObra` construyen el estado nuevo con `map`/`filter` y spreads, conservando
 * los objetos que no cambiaron. Una instantánea es un árbol de punteros —unos
 * pocos kB en una hoja de 650 regiones—, no una copia del contenido; una imagen
 * pegada en base64 se comparte entre todas.
 */
const MAX = 60;

/**
 * Pausa tras la que un cambio se considera cerrado y entra en el historial.
 *
 * Sin ella, escribir «420» dejaría tres entradas y deshacer iría letra a letra.
 * Con ella, una ráfaga de tecleo o un arrastre completo son UN paso, que es lo
 * que espera quien pulsa Ctrl+Z.
 */
const PAUSA_MS = 400;

export interface Historial {
  deshacer: () => void;
  rehacer: () => void;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
}

export interface OpcionesHistorial<T> {
  /**
   * Corre DESPUÉS de aplicar el estado restaurado, y lo recibe.
   *
   * Lo necesitan los dos: la hoja para salir de edición, y la obra para soltar
   * la selección y las pestañas de un nodo que el paso restaurado ya no tiene.
   */
  alRestaurar?: (estado: T) => void;
  /**
   * ¿Este cambio es una PÉRDIDA? Entonces entra en el historial en el acto, sin
   * esperar la pausa.
   *
   * Es lo único que el hook no puede decidir solo: sabe que el estado cambió,
   * no si el cambio quitó algo. Ver la nota de abajo, en el efecto.
   */
  esPerdida?: (nuevo: T, asentado: T) => boolean;
  /** Se aplica al estado antes de restaurarlo. La hoja descarta sus bloques a medio crear. */
  alRestaurarEstado?: (estado: T) => T;
  /**
   * ¿Este cambio solo trae una LECTURA de fuera, sin que el usuario haya editado
   * nada? Entonces se asienta sin entrar en el historial.
   *
   * Es para lo que refleja un estado externo —lo leído de SAP en una obra—:
   * deshacerlo no deshace nada en el mundo, solo vuelve a mostrar una foto vieja
   * de él. Quien lo usa tiene que conservar esa lectura en `alRestaurarEstado`,
   * o deshacer una edición anterior la traería de vuelta igual.
   */
  esLectura?: (nuevo: T, asentado: T) => boolean;
}

/**
 * Deshacer y rehacer, sobre cualquier documento.
 *
 * Observa el VALOR en vez de envolver los sitios que lo modifican —ocho en la
 * hoja, más de veinte en una obra—: así no hay forma de añadir una acción nueva
 * y olvidarse de registrarla en el historial.
 *
 * Genérico porque los dos documentos lo necesitaban igual y solo se diferencian
 * en dos puntos, los dos inyectados: qué cuenta como pérdida, y qué limpiar al
 * restaurar. Escribir un segundo hook habría sido tener dos políticas de
 * deshacer que se irían separando.
 *
 * En ninguno de los dos había red: `Supr` borraba la selección de una planilla
 * de 650 regiones, o «quitar este nodo» se llevaba la hoja entera de un cálculo,
 * y 300 ms después el autoguardado consolidaba la pérdida.
 */
export function useHistorial<T>(
  valor: T,
  aplicar: (v: T) => void,
  { alRestaurar, esPerdida, alRestaurarEstado, esLectura }: OpcionesHistorial<T> = {},
): Historial {
  const pasado = useRef<T[]>([]);
  const futuro = useRef<T[]>([]);
  /** El último estado ya asentado en el historial. */
  const asentado = useRef(valor);
  /** El estado vigente, para poder archivarlo al deshacer sin esperar la pausa. */
  const actual = useRef(valor);
  /** Evita que la propia restauración se registre como un cambio más. */
  const restaurando = useRef(false);
  /** Solo para que los botones se enteren de que hay algo que deshacer. */
  const [, revisar] = useState(0);

  actual.current = valor;

  useEffect(() => {
    if (restaurando.current) {
      restaurando.current = false;
      asentado.current = valor;
      return;
    }
    if (valor === asentado.current) return;
    if (esLectura?.(valor, asentado.current)) {
      asentado.current = valor;
      return;
    }

    const registrar = () => {
      pasado.current.push(asentado.current);
      if (pasado.current.length > MAX) pasado.current.shift();
      // Una edición nueva descarta el futuro: no se puede rehacer sobre una
      // rama distinta de la que se deshizo.
      futuro.current = [];
      asentado.current = valor;
      revisar((n) => n + 1);
    };

    // Una PÉRDIDA entra en el acto, sin esperar la pausa.
    //
    // Con la pausa para todo, seleccionar 300 bloques con el marco, pulsar Supr
    // y pulsar Ctrl+Z al instante —que es lo que uno hace, en bastante menos de
    // 400 ms— encontraba el historial vacío y el botón ↶ deshabilitado: el
    // usuario concluía que no había deshacer. Y el autoguardado (300 ms) llegaba
    // ANTES que el registro (400 ms), así que recargar en esa ventana volvía la
    // pérdida irreversible.
    //
    // Solo al perder, y no en cualquier cambio de tamaño: crear un bloque y
    // escribir dentro sigue siendo un solo Ctrl+Z, que es lo que espera quien
    // acaba de teclear una fórmula. Perder una creación no es una pérdida;
    // perder 300 bloques, o el nodo que alimentaba a media obra, sí.
    if (esPerdida?.(valor, asentado.current)) {
      registrar();
      return;
    }

    const t = setTimeout(registrar, PAUSA_MS);
    return () => clearTimeout(t);
    // `esPerdida` se lee del render en curso a propósito: es una función pura de
    // sus dos argumentos, y meterla en las dependencias obligaría a memoizarla en
    // cada usuario para no reiniciar la pausa en cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  const restaurar = useCallback(
    (estado: T) => {
      const limpio = alRestaurarEstado ? alRestaurarEstado(estado) : estado;
      restaurando.current = true;
      aplicar(limpio);
      alRestaurar?.(limpio);
      revisar((n) => n + 1);
    },
    [aplicar, alRestaurar, alRestaurarEstado],
  );

  const deshacer = useCallback(() => {
    // Con un cambio todavía sin asentar —menos de 400 ms desde la última
    // tecla o el último arrastre—, deshacer es volver al estado asentado, no al
    // anterior a él. Saltar directamente a `pasado` se llevaba dos pasos de
    // golpe: mover A, esperar, mover B y pulsar Ctrl+Z en el acto devolvía los
    // dos bloques, y el paso intermedio desaparecía del historial.
    if (actual.current !== asentado.current) {
      futuro.current = [actual.current];
      restaurar(asentado.current);
      return;
    }
    const anterior = pasado.current.pop();
    if (!anterior) return;
    futuro.current.push(actual.current);
    restaurar(anterior);
  }, [restaurar]);

  const rehacer = useCallback(() => {
    // Un cambio sin asentar es una edición nueva, y una edición nueva descarta el
    // futuro: rehacer encima de ella mezclaría dos ramas del historial.
    if (actual.current !== asentado.current) return;
    const siguiente = futuro.current.pop();
    if (!siguiente) return;
    pasado.current.push(actual.current);
    restaurar(siguiente);
  }, [restaurar]);

  const pendiente = actual.current !== asentado.current;
  return {
    deshacer,
    rehacer,
    // Un cambio pendiente también se puede deshacer: el botón ↶ se quedaba
    // deshabilitado 400 ms tras el primer cambio de la sesión.
    puedeDeshacer: pasado.current.length > 0 || pendiente,
    puedeRehacer: futuro.current.length > 0 && !pendiente,
  };
}

/**
 * Quita las fórmulas y los programas vacíos de un estado que se restaura.
 *
 * Son bloques a medio crear: una fórmula recién pedida con el botón, antes de
 * teclear nada. Si pasaba la pausa del historial, quedaba registrada, y al
 * deshacer volvía FUERA de edición — un bloque sin contenido que mide cero de
 * ancho, al que no se puede ni hacer clic y que el autoguardado ya no descarta.
 * Un texto vacío sí se conserva: es un espaciador, y ocupa sitio a propósito.
 */
export function sinTransitorias(estado: Region[]): Region[] {
  const limpio = estado.filter((r) => r.kind === 'text' || r.kind === 'image' || r.src.trim() !== '');
  return limpio.length === estado.length ? estado : limpio;
}
