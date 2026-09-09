import { useCallback, useEffect, useRef, useState } from 'react';
import type { Region } from '../../lib/worksheet';

/**
 * Cuántos estados se recuerdan.
 *
 * Sale barato: `setRegions` siempre construye el array nuevo con `map`/`filter`
 * conservando los objetos de las regiones que no cambiaron, así que un
 * instantánea es un array de punteros (unos pocos kB en una hoja de 650
 * regiones), no una copia del contenido. Una imagen pegada en base64 se
 * comparte entre todas las instantáneas.
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

/**
 * Deshacer y rehacer para la hoja.
 *
 * Observa `regions` en vez de envolver los ocho sitios que la modifican: así no
 * hay forma de añadir una acción nueva y olvidarse de registrarla en el
 * historial.
 *
 * Hasta ahora no había ninguna red: `Supr` borraba la selección y 300 ms
 * después el autoguardado consolidaba la pérdida en `localStorage`. En una
 * planilla de 650 regiones eso era irreversible.
 */
export function useHistorial(
  regions: Region[],
  setRegions: (r: Region[]) => void,
  alRestaurar?: () => void,
): Historial {
  const pasado = useRef<Region[][]>([]);
  const futuro = useRef<Region[][]>([]);
  /** El último estado ya asentado en el historial. */
  const asentado = useRef(regions);
  /** El estado vigente, para poder archivarlo al deshacer sin esperar la pausa. */
  const actual = useRef(regions);
  /** Evita que la propia restauración se registre como un cambio más. */
  const restaurando = useRef(false);
  /** Solo para que los botones se enteren de que hay algo que deshacer. */
  const [, revisar] = useState(0);

  actual.current = regions;

  useEffect(() => {
    if (restaurando.current) {
      restaurando.current = false;
      asentado.current = regions;
      return;
    }
    if (regions === asentado.current) return;

    const t = setTimeout(() => {
      pasado.current.push(asentado.current);
      if (pasado.current.length > MAX) pasado.current.shift();
      // Una edición nueva descarta el futuro: no se puede rehacer sobre una
      // rama distinta de la que se deshizo.
      futuro.current = [];
      asentado.current = regions;
      revisar((n) => n + 1);
    }, PAUSA_MS);
    return () => clearTimeout(t);
  }, [regions]);

  const deshacer = useCallback(() => {
    const anterior = pasado.current.pop();
    if (!anterior) return;
    futuro.current.push(actual.current);
    restaurando.current = true;
    setRegions(anterior);
    alRestaurar?.();
    revisar((n) => n + 1);
  }, [setRegions, alRestaurar]);

  const rehacer = useCallback(() => {
    const siguiente = futuro.current.pop();
    if (!siguiente) return;
    pasado.current.push(actual.current);
    restaurando.current = true;
    setRegions(siguiente);
    alRestaurar?.();
    revisar((n) => n + 1);
  }, [setRegions, alRestaurar]);

  return {
    deshacer,
    rehacer,
    puedeDeshacer: pasado.current.length > 0,
    puedeRehacer: futuro.current.length > 0,
  };
}
