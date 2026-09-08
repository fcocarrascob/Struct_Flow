// Imágenes del canvas: lectura, reescalado y recompresión (navegador, sin React).
//
// Una región `image` guarda su fuente en `Region.src`, que puede ser una ruta del
// sitio (`/esquemas/x.svg`) o un data URI. El data URI viaja dentro del JSON de
// export/import y del `localStorage`, así que el peso importa: una foto de 4 MB
// pegada tal cual revienta la cuota del navegador y se lleva por delante el
// autoguardado de toda la hoja. Por eso los rásteres se reescalan y recomprimen
// al entrar, y el llamador avisa cuando aun así quedan grandes.

/** Lado máximo (px) al que se reescala un ráster pegado. */
export const MAX_IMAGE_PX = 1600;
/** Calidad de recompresión (WebP). */
export const IMAGE_QUALITY = 0.8;
/** Ancho por defecto con el que se coloca una imagen en la hoja (px). */
export const DEFAULT_IMAGE_W = 480;
/** Por encima de este peso del data URI se avisa al usuario (bytes). */
export const IMAGE_WARN_BYTES = 512 * 1024;

export interface ImagePayload {
  /** Data URI listo para `Region.src`. */
  src: string;
  /** Tamaño natural en px: fija la relación de aspecto al redimensionar. */
  naturalW: number;
  naturalH: number;
  /** Peso aproximado del data URI en bytes. */
  bytes: number;
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error ?? new Error('No se pudo leer el archivo'));
    fr.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('El archivo no es una imagen válida'));
    img.src = src;
  });
}

/** Bytes reales que representa un data URI (la carga es base64: 4 chars = 3 bytes). */
function dataUrlBytes(url: string): number {
  const i = url.indexOf(',');
  const payload = i === -1 ? url : url.slice(i + 1);
  return Math.round(payload.length * 0.75);
}

/**
 * Convierte un archivo de imagen en la carga que guarda una región.
 *
 * Los SVG se dejan intactos: son texto, ya pesan poco, y rasterizarlos perdería
 * justo lo que los hace útiles. Los rásteres se reescalan a `MAX_IMAGE_PX` y se
 * recomprimen a WebP, salvo que el original ya sea más pequeño que el resultado
 * (frecuente en capturas de pantalla PNG chicas), en cuyo caso se conserva.
 */
export async function fileToImagePayload(file: File): Promise<ImagePayload> {
  const raw = await readAsDataUrl(file);
  const img = await loadImage(raw);

  // Un SVG sin `width`/`height` intrínsecos (solo `viewBox`) reporta 0: se
  // sustituye por el tamaño por defecto para no dividir por cero al fijar el aspecto.
  const naturalW = img.naturalWidth || DEFAULT_IMAGE_W;
  const naturalH = img.naturalHeight || Math.round(DEFAULT_IMAGE_W * 0.66);

  if (file.type === 'image/svg+xml') {
    return { src: raw, naturalW, naturalH, bytes: dataUrlBytes(raw) };
  }

  const scale = Math.min(1, MAX_IMAGE_PX / Math.max(naturalW, naturalH));
  const cw = Math.max(1, Math.round(naturalW * scale));
  const ch = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { src: raw, naturalW, naturalH, bytes: dataUrlBytes(raw) };
  ctx.drawImage(img, 0, 0, cw, ch);

  // Si el navegador no soporta WebP, toDataURL cae a PNG; sirve igual.
  const encoded = canvas.toDataURL('image/webp', IMAGE_QUALITY);
  const best = encoded.length < raw.length ? encoded : raw;
  const useScaled = best === encoded;

  return {
    src: best,
    naturalW: useScaled ? cw : naturalW,
    naturalH: useScaled ? ch : naturalH,
    bytes: dataUrlBytes(best),
  };
}

/** Tamaño con el que se coloca la imagen en la hoja, conservando el aspecto. */
export function fitToSheet(naturalW: number, naturalH: number): { w: number; h: number } {
  const w = Math.min(DEFAULT_IMAGE_W, naturalW);
  return { w, h: Math.max(1, Math.round((w * naturalH) / naturalW)) };
}
