// ─────────────────────────────────────────────────────────────────────────────
// El origen de una pestaña: la hoja vive dentro del documento de la obra.
//
// Es la otra implementación de `OrigenHoja`, y es lo que `MathCanvas` necesitaba
// para poder abrirse sobre algo que no sea `localStorage`. Comparte la forma con
// `origen-local` y no una línea de implementación:
//
//   - No vigila. Un `storage` avisaría de que otra pestaña del navegador tocó la
//     clave; acá el único otro escritor es la mini hoja del panel, que no está
//     montada a la vez que la pestaña.
//   - No vacía al salir. Escribe en el documento de la obra, que a su vez se
//     persiste con su propio debounce, su guardado al desmontar y su `pagehide`
//     (`CanvasObra.tsx`). Registrar los mismos eventos otra vez sería guardar la
//     obra dos veces por el mismo motivo.
//   - No falla por cuota. Si `localStorage` se llena, lo dice `guardarObra` y lo
//     pinta la banda de la obra, que es donde vive esa decisión.
// ─────────────────────────────────────────────────────────────────────────────

import type { OrigenHoja } from '../../components/canvas/useHojaPersistida';
import type { Region } from '../../lib/worksheet';
import type { MetaPlanilla } from '../../lib/biblioteca/contrato';

/** Lo que la pestaña necesita saber del nodo, sin que el origen conozca la obra. */
export interface HojaDelNodo {
  hoja: Region[];
  meta?: MetaPlanilla;
}

/**
 * Crea el origen de la hoja de un nodo.
 *
 * `leer` es una función y no un valor porque el hook la llama UNA vez, al montar,
 * y para entonces el documento puede haber cambiado respecto del render en que se
 * construyó este origen.
 *
 * `escribir` recibe las regiones ya filtradas. Tiene que usar la forma con
 * actualizador de `setObra` —y por eso el que llama le pasa un escritor que lo
 * haga—: el hook guarda al desmontar desde un efecto con dependencias vacías, y
 * partir de una copia vieja de la obra resucitaría lo que se hubiera borrado en
 * el resto de los nodos.
 */
export function origenDeNodo({
  leer,
  escribir,
}: {
  leer: () => HojaDelNodo | null;
  escribir: (hoja: Region[], meta: MetaPlanilla | null) => void;
}): OrigenHoja {
  return {
    cargar() {
      const n = leer();
      return { regions: n?.hoja ?? [], meta: n?.meta ?? null };
    },
    guardar({ persistables, meta }) {
      escribir(persistables, meta);
      return { ok: true };
    },
  };
}
