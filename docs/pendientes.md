# Pendientes

Hallazgos de la auditoría del 2026-09-08 que **no** se abordaron, con lo que costaría
cada uno. Están ordenados por relación valor/esfuerzo, no por gravedad.

Lo que sí se arregló ese día está en el historial: el generador de LaTeX (subíndices,
nombres de función, griegas), la robustez al cargar hojas y el panel de variables.

## 1. Rendimiento: se reevalúa la hoja entera en cada tecla y en cada píxel de arrastre

`MathCanvas.tsx` — `useMemo(() => evaluateSheet(regions), [regions])`. Cada pulsación crea
un array nuevo, así que se reevalúan con mathjs las ~250 expresiones (parse + toTex +
evaluate, más `runProgram`). No hay un solo `React.memo` en el proyecto, de modo que además
se vuelven a renderizar las 250 `MathRegion` y las 250 filas de `WorksheetPrint`.

Lo peor es el arrastre: `MathRegion` llama `onMove` en **cada `pointermove`** (60-120 Hz)
y dispara ese mismo ciclo completo. Mover un bloque en `chevron-nch2369` (308 regiones) es
muy lento.

Relacionado: `EsquemaImpreso` rehace el `fetch` del SVG en cada tecla, porque su efecto
depende de `scope`, que `evaluateSheet` construye como objeto nuevo en cada evaluación. Y
`usePaginacion` mide los ~250 nodos del documento impreso cada 250 ms de escritura, con
`getBoundingClientRect` — un layout síncrono forzado. Como el temporizador se reinicia con
cada tecla, durante una ráfaga la paginación **nunca** se actualiza: el contador de páginas
queda obsoleto justo mientras se edita.

*Coste*: medio. `React.memo` en `MathRegion` y arrastre con estado local (confirmando solo
en `pointerup`) resuelven la mitad. Es el mayor salto de calidad percibida que queda.

## 2. No hay deshacer

`Supr` borra toda la selección y 300 ms después el autoguardado consolida la pérdida. No
existe historial. Perder media planilla con una tecla es un evento real.

*Coste*: medio. El estado ya es inmutable, así que una pila de versiones de `regions` es
viable.

## 3. Regiones que se solapan

El punto de inserción avanza `3*GRID` = 48 px fijos, y ninguna región reporta su altura
medida (`Region.h` solo existe para imágenes). Una región con error muestra un mensaje extra
de dos líneas y pisa la de abajo; una fórmula con `\frac` mide 35-45 px más el relleno, al
filo de los 48. En `anclajes-pedestal` y `columna-interaccion-esbeltez` hay pares de
regiones separadas 16 px en la misma `x`. El `z-index` solo distingue activa y seleccionada,
así que dos regiones inactivas superpuestas se pisan en orden de array y la de encima se
come los clics de la otra.

*Coste*: alto. Hay que medir alturas reales y propagarlas.

## 4. Texto que desborda, en el canvas y en el PDF

Las regiones `text` usan `whitespace-pre` sin ancho máximo. Las planillas reales tienen
párrafos de 271 caracteres (`ejemplo-torre-deformaciones-nch2369`): ~1.900 px en una sola
línea, sobre una hoja de 1.600 y un visor de ~950. En edición es peor: el input se
dimensiona en `ch` sobre una fuente proporcional, así que el ancho ni siquiera corresponde
al texto.

En el PDF el problema es otro: `.wp-eq` no acota el ancho ni permite salto, así que una
ecuación larga con su resultado **se recorta** en el margen derecho. La paginación no lo
detecta porque solo mira alturas.

*Coste*: bajo el ajuste de línea; encontrar el punto de corte de una fórmula LaTeX es
intrínsecamente feo.

## 5. Accesibilidad

No hay un solo `tabIndex`, `role` ni `aria-` en los componentes del canvas. Las regiones son
`div` sin foco: **no se puede seleccionar, editar, mover ni borrar una región sin ratón**, y
no hay flechas para desplazar la seleccionada. Los menús desplegables no cierran con
`Escape` (el manejador global lo intercepta antes) y su capa de cierre se come el primer
clic. Las figuras van con `alt=""` y sin pie.

Y un bug concreto: cualquier tecla de un carácter sin modificadores crea una fórmula, y el
espacio mide uno — así que pulsar **Espacio sobre un botón de la barra** crea un bloque
basura en vez de activarlo. Basta excluir el caso en que el foco esté en un botón.

*Coste*: medio en conjunto, pero cada pieza es barata por separado.

## 6. Encabezados detectados por un carácter mágico

`WorksheetPrint` decide qué es un encabezado de sección con `r.src.includes('━')` (la raya
pesada, U+2501). En el corpus 420 regiones la usan, pero `anclajes-pedestal` tiene 8
subtítulos con la ligera `──` (U+2500): salen como párrafo gris en vez de `<h2>` y pierden
el `break-after: avoid`, así que la paginación los deja colgando al pie. Fallo silencioso,
invisible hasta ver el PDF.

De fondo: la estructura del documento no debería estar codificada en un carácter.

## 7. Cosas menores ya localizadas

- **La primera región de texto se convierte en `<h1>`** y desaparece del cuerpo del PDF. Si
  no es el título (una nota, un `━━ DATOS ━━`), el documento sale mal titulado y se pierde
  ese contenido. `meta.titulo` existe en el formato y sería mejor fuente.
- **Las regiones vacías se pierden en la primera recarga**: `cargarHoja` las conserva pero
  el autoguardado las filtra. `anclajes-pedestal` las usa como espaciador, así que la
  geometría de la hoja cambia sola tras un F5.
- **La paleta de símbolos no hace nada sin una región en edición**, y no lo indica: 70
  botones que parecen rotos.
- **El aviso de «bloques más altos que una A4» no dice cuáles.** `usePaginacion` ya calcula
  la lista de ids; solo falta resaltarlos.
- **Si el corte de página cae en el pie**, la línea no se dibuja (se busca por id de región
  y `__footer` no es una).
- **`exportJson` revoca el blob de forma síncrona** tras el `click()`, sin añadir el enlace
  al DOM. Funciona en Chromium; en Firefox es el fallo clásico de la descarga que no ocurre.
  Importa porque es la vía de rescate cuando `localStorage` se llena.
- **`importJson` no tiene `.catch`**: si la lectura del archivo falla, no hay ningún aviso.
- **`pointercancel` deja el arrastre pegado** (no hay `onPointerCancel` ni
  `onLostPointerCapture`), y sin `touch-action: none` arrastrar en táctil hace scroll.
- **Sin guardas de tamaño al leer imágenes**: se hace `readAsDataURL` y se descodifica la
  imagen entera *antes* de mirar `file.size`. Una foto de móvil de 50 MB se materializa en
  memoria antes de reescalarla. Los SVG entran sin límite ni reescalado.
- **Multiselección casi inútil**: solo sirve para borrar y para el salto de página. No hay
  mover en grupo, alinear, distribuir, duplicar ni selección por rectángulo.
- **No se puede copiar texto del canvas**: `select-none` está en la raíz de cada región
  (lo necesita el arrastre), así que un resultado calculado no se puede copiar a un informe.
- **Diálogos nativos bloqueantes** (`confirm`/`alert`) en siete sitios; al soltar un lote de
  archivos puede salir un `alert` por cada uno que falle.
