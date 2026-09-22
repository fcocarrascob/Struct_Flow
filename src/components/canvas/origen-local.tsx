// ─────────────────────────────────────────────────────────────────────────────
// El origen de `/canvas`: la hoja vive en `localStorage`, bajo una única clave.
//
// Es todo lo que `useHojaPersistida` NO sabe —la clave, la hoja de ejemplo, el
// evento `storage`, la copia que se aparta cuando lo guardado no se lee— para
// que el hook se pueda usar con otro origen sin arrastrar nada de esto.
//
// `.tsx` y no `.ts` porque dos de los tres avisos llevan marcado: el nombre de
// la clave apartada va en un `<code>` y el «cambió en otra pestaña» en negrita.
// ─────────────────────────────────────────────────────────────────────────────

import { ORIGEN_PAPEL_X, ORIGEN_PAPEL_Y } from './SiluetaPapel';
import type {
  Arranque,
  AvisoDelOrigen,
  Conflicto,
  HojaParaGuardar,
  OrigenHoja,
  ResultadoGuardado,
} from './useHojaPersistida';
import type { Region } from '../../lib/worksheet';
import { metaDe, sanearConInforme } from '../../lib/hoja-json';
import { detalleDeDescartes, resumirDescartes } from './informe-descartes';
import { STORAGE_KEY } from '../../lib/hoja-guardada';
import { descargarHoja } from '../../lib/canvas-handoff';

/** Hoja de ejemplo para la primera visita (se reemplaza al editar). */
const DEMO: Region[] = [
  { id: 'demo-t', kind: 'text', x: ORIGEN_PAPEL_X, y: ORIGEN_PAPEL_Y, src: 'Ejemplo: momento máximo de una viga biapoyada' },
  { id: 'demo-1', kind: 'math', x: ORIGEN_PAPEL_X, y: 144, src: 'F := 30 kN' },
  { id: 'demo-2', kind: 'math', x: ORIGEN_PAPEL_X, y: 192, src: 'L := 6 m' },
  { id: 'demo-3', kind: 'math', x: ORIGEN_PAPEL_X, y: 240, src: 'M := F*L/4 = kN*m' },
  { id: 'demo-4', kind: 'math', x: ORIGEN_PAPEL_X, y: 288, src: 'M <= 60 kN*m =' },
];

/** Dónde se aparta una hoja guardada que no se pudo leer. */
export const CLAVE_APARTADA = `${STORAGE_KEY}.apartada`;

/**
 * Dónde va lo que se escribe mientras el guardado está en pausa por un conflicto.
 *
 * Clave propia, y no `CLAVE_APARTADA`: las dos guardan «una hoja que no está en
 * su sitio», pero la otra guarda lo que HABÍA y esta lo que HAY. Compartirlas
 * haría que abrir con una hoja ilegible y después pelearse con otra pestaña
 * pisara la primera copia con la segunda, que es justo el caso en que las dos
 * importan.
 */
export const CLAVE_EN_PAUSA = `${STORAGE_KEY}.sin-guardar`;

/** Lo último que esta pestaña escribió, para no reaccionar a su propio eco. */
let escrito: string | null = null;

function cargar(): Arranque {
  if (typeof window === 'undefined') return { regions: DEMO, meta: null };
  // Se calcula antes de las ramas y viaja con todas: la copia de una pausa
  // anterior hay que enseñarla se abra lo que se abra.
  const avisos = avisoDeLaCopiaEnPausa();
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      // Si lo guardado es la hoja de ejemplo sin tocar, se devuelve DEMO por
      // referencia: así el guardado la sigue reconociendo y no empieza a
      // contarla como trabajo del usuario a partir de la segunda visita.
      if (data?.demo) return { regions: DEMO, meta: null, avisos };
      if (Array.isArray(data?.regions)) {
        // Saneadas también aquí: el localStorage puede traer una hoja escrita
        // por una versión anterior, o a medio escribir.
        //
        // Sin filtrar las vacías: una región vacía que llegó a guardarse es
        // DELIBERADA —39 del corpus se usan como espaciador, 16 de ellas en
        // `anclajes-pedestal`—, y las transitorias no llegan aquí porque el
        // guardado descarta la que está en edición. Filtrarlas hacía que la
        // hoja se recolocara sola en el primer F5.
        const informe = sanearConInforme(data.regions);
        // Lo que hay en esta clave lo escribió `guardar` de esta misma
        // aplicación, con regiones YA saneadas. Que al volver a leerla sobren
        // bloques quiere decir que algo la corrompió —y no que un chat escribiera
        // mal un JSON—, así que es trabajo propio encogiendo. En 300 ms el
        // autoguardado escribe la versión corta encima: se aparta el texto crudo
        // ANTES, por el mismo camino y a la misma clave que una hoja ilegible,
        // porque una vez sobrescrito no hay de dónde sacarlo.
        if (informe.descartadas.length > 0) {
          try {
            localStorage.setItem(CLAVE_APARTADA, raw);
          } catch {
            /* si no cabe la copia, el aviso igual tiene que salir */
          }
          avisos.push(avisoDeBloquesPerdidos(resumirDescartes(informe), detalleDeDescartes(informe)));
        }
        return { regions: informe.regions, meta: metaDe(data), avisos };
      }
    }
  } catch {
    // Cae abajo: había algo y no se pudo leer.
  }

  // Había algo guardado que no se lee como hoja —un JSON truncado, que es lo
  // típico cuando una escritura anterior chocó con la cuota— y en 300 ms el
  // autoguardado va a escribir la demo encima. Se aparta ANTES, porque una vez
  // sobrescrito no hay de dónde recuperarlo.
  if (raw) {
    try {
      localStorage.setItem(CLAVE_APARTADA, raw);
      return {
        regions: DEMO,
        meta: null,
        avisos: [
          ...avisos,
          {
            clave: 'apartada',
            cierre: 'Entendido',
            texto: (
              <>
                La hoja que había guardada <strong>no se pudo leer</strong> y se abrió el ejemplo.
                La copia sin tocar quedó en <code>{CLAVE_APARTADA}</code> del almacenamiento local
                del navegador, por si hay algo que rescatar.
              </>
            ),
          },
        ],
      };
    } catch {
      // Si no cabe la copia, no hay nada mejor que hacer que seguir.
    }
  }
  return { regions: DEMO, meta: null, avisos };
}

function guardar({ regions, persistables, meta }: HojaParaGuardar): ResultadoGuardado {
  try {
    // Se marca la hoja de ejemplo intacta para que `hayTrabajoGuardado` no la
    // confunda con trabajo del usuario (ver el comentario de esa función).
    //
    // ES UNA COMPARACIÓN DE IDENTIDAD, y por eso mira `regions` y no
    // `persistables`: `filter` devuelve siempre un array nuevo.
    const demo = regions === DEMO;
    const texto = JSON.stringify({
      version: 1,
      ...(meta ? { meta } : {}),
      regions: persistables,
      ...(demo ? { demo: true } : {}),
    });
    localStorage.setItem(STORAGE_KEY, texto);
    escrito = texto;
    return { ok: true };
  } catch (err) {
    const quota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return {
      ok: false,
      motivo: quota
        ? 'La hoja superó la cuota del navegador y dejó de autoguardarse. Exporta el JSON y borra alguna imagen.'
        : 'No se pudo autoguardar la hoja en este navegador. Exporta el JSON para no perder el trabajo.',
    };
  }
}

/**
 * Lo que se escribe mientras el guardado está en pausa por un conflicto.
 *
 * No va a `STORAGE_KEY`, que es justo lo que la pausa protege; pero tampoco se
 * tira, que es lo que hacía antes: la tarjeta del conflicto no bloquea la
 * edición ni se repite, así que se podía escribir media hora encima de ella y
 * perderlo todo al cerrar la pestaña, sin una sola señal.
 */
function apartar({ persistables, meta }: HojaParaGuardar): ResultadoGuardado {
  try {
    localStorage.setItem(
      CLAVE_EN_PAUSA,
      JSON.stringify({ version: 1, ...(meta ? { meta } : {}), regions: persistables }),
    );
    return { ok: true };
  } catch {
    return {
      ok: false,
      motivo:
        'La hoja está en pausa por otra pestaña y la copia aparte no cabe en el navegador: ' +
        'lo que escribas ahora no se está guardando. Exporta el JSON.',
    };
  }
}

/**
 * La hoja guardada perdió bloques al leerla.
 *
 * Se abre con lo bueno —caer a la demo sería cambiar una pérdida parcial por una
 * total— y el aviso ofrece bajar la copia sin tocar. Lleva el detalle aparte
 * porque el resumen cabe en la tarjeta y la lista de posiciones no.
 */
function avisoDeBloquesPerdidos(resumen: string, detalle: string): AvisoDelOrigen {
  return {
    clave: 'bloques-perdidos',
    cierre: 'Entendido',
    texto: (
      <>
        La hoja guardada <strong>perdió bloques al abrirse</strong>. {resumen} La copia sin
        tocar quedó apartada, por si hay algo que rescatar.
      </>
    ),
    acciones: [
      {
        etiqueta: 'Descargar la copia',
        titulo: 'Baja la hoja tal como estaba guardada, con los bloques malformados incluidos.',
        hacer: () => {
          let crudo: string | null = null;
          try {
            crudo = localStorage.getItem(CLAVE_APARTADA);
          } catch {
            /* sin copia: se baja lo que se sabe */
          }
          let hoja: unknown;
          try {
            hoja = crudo === null ? { detalle } : JSON.parse(crudo);
          } catch {
            hoja = { crudo, detalle };
          }
          descargarHoja(hoja, 'hoja-con-bloques-perdidos.json');
        },
      },
    ],
  };
}

/** La copia deja de tener sentido en cuanto la hoja vuelve a estar en su sitio. */
function olvidarApartada(): void {
  try {
    localStorage.removeItem(CLAVE_EN_PAUSA);
  } catch {
    /* si no se puede borrar, el aviso al abrir deja descartarla a mano */
  }
}

/**
 * El aviso de que quedó una copia de una pausa anterior.
 *
 * Lleva acciones y no solo un «Entendido» porque la copia **no se abre sola**:
 * un aviso que diga dónde está y no ofrezca sacarla obliga a ir a la consola del
 * navegador, y el que la descarta es el que hace que no vuelva a salir.
 */
function avisoDeLaCopiaEnPausa(): AvisoDelOrigen[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(CLAVE_EN_PAUSA);
  } catch {
    return [];
  }
  if (!raw) return [];
  const copia = raw;
  return [
    {
      clave: 'en-pausa',
      texto: (
        <>
          Mientras esta hoja estaba <strong>en pausa por otra pestaña</strong> se siguió
          escribiendo, y eso se guardó aparte. No se abre solo: descárgalo si hay algo que
          rescatar.
        </>
      ),
      acciones: [
        {
          etiqueta: 'Descargar la copia',
          titulo: 'Baja un JSON con lo que se escribió durante la pausa, y descarta la copia.',
          hacer: () => {
            let hoja: unknown;
            try {
              hoja = JSON.parse(copia);
            } catch {
              // Truncada por la cuota: se entrega tal cual antes que no entregar nada.
              hoja = { crudo: copia };
            }
            descargarHoja(hoja, 'hoja-sin-guardar.json');
            olvidarApartada();
          },
        },
        {
          etiqueta: 'Descartar',
          titulo: 'Borra la copia sin descargarla.',
          hacer: olvidarApartada,
        },
      ],
    },
  ];
}

/**
 * Otra pestaña escribió la hoja guardada.
 *
 * Hay una sola clave para la hoja y cada pestaña guarda su copia en memoria
 * sobre ella: con dos abiertas, basta con volver a la vieja y entrar y salir de
 * un bloque para que su autoguardado escriba encima de todo lo hecho en la otra.
 *
 * No se compara contra lo escrito por la propia pestaña: el evento `storage`
 * solo llega a las DEMÁS, así que cualquiera que se reciba es de fuera. Sí se
 * ignora el que trae exactamente lo que esta pestaña ya tiene, que es lo que
 * pasa cuando otra acaba de abrir la misma hoja y la guarda sin tocarla.
 */
function vigilar(alCambiar: (c: Conflicto) => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || e.storageArea !== window.localStorage) return;
    if (e.newValue !== null && e.newValue === escrito) return;
    alCambiar({
      texto: (
        <>
          La hoja guardada <strong>cambió en otra pestaña</strong>. Esta dejó de autoguardarse
          para no pisarla —lo que escribas mientras tanto se guarda aparte—: elige con cuál te
          quedas.
        </>
      ),
      etiquetaTraer: 'Cargar la de la otra pestaña',
      tituloTraer: 'Reemplaza esta hoja por la de la otra pestaña. Se deshace con Ctrl+Z.',
      etiquetaQuedarme: 'Quedarme con esta',
      tituloQuedarme: 'Guarda esta hoja encima de la de la otra pestaña.',
      traer: cargar,
    });
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

/**
 * El origen de `/canvas`, único por módulo.
 *
 * No hace nada al construirse —todo el IO está en los métodos—, así que es
 * seguro a nivel de módulo, y su identidad no cambia nunca: eso es lo que hace
 * inofensivo que el hook lo lea de un ref.
 */
export const ORIGEN_LOCAL: OrigenHoja = {
  cargar,
  guardar,
  apartar,
  olvidarApartada,
  vigilar,
  vaciarAlSalir: true,
};
