# Pendientes

Hallazgos de la auditoría del 2026-09-08 que **no** se abordaron, con lo que costaría
cada uno. Están ordenados por relación valor/esfuerzo, no por gravedad.

Lo que sí se arregló ese día está en el historial: el generador de LaTeX (subíndices,
nombres de función, griegas), la robustez al cargar hojas y el panel de variables.

## 1. Rendimiento — hecho en lo esencial, queda el motor

**Resuelto** (medido sobre `muro-flexocompresion`, 646 regiones, la planilla más pesada):

| | antes | después |
|---|---:|---:|
| por `pointermove` de un arrastre | 3.729 ms | 22 ms |
| por pulsación de tecla | 4.571 ms | 18 ms |
| `evaluateSheet` completo | 4.317 ms | ~1.400 ms |
| `npm run verify:planillas` | 8,8 s | 3,2 s |

Cuatro cambios: evaluación aplazada 120 ms (una evaluación por ráfaga en vez de una por
evento), `React.memo` en `MathRegion`, caché de expresiones parseadas, y scope heredado por
prototipo en lugar de copiado en cada llamada a función.

**Lo que queda.** `evaluateSheet` sigue costando ~1,4 s en esa planilla y **escala peor que
lineal**: al doblar el número de regiones el tiempo se multiplica por ~4,5. El coste está
casi entero en las regiones `program` — quitándolas, la misma hoja se evalúa en 14 ms.

La causa es la forma de esas planillas: `c_de_Pn` hace una bisección de 60 iteraciones y en
cada vuelta llama a `P_n`, que a su vez recorre las capas. Son decenas de miles de llamadas
a `node.evaluate(scope)` por evaluación de la hoja.

La sospecha para el siguiente paso es que math.js normaliza el objeto de scope en **cada**
`evaluate`, lo que volvería a hacer el coste proporcional al número de variables. Si se
confirma, la vía es llevar el scope como `Map`, que es la estructura que math.js prefiere.
No se pudo comprobar en esta sesión porque math.js no se deja importar suelto desde el
navegador para medirlo aislado; hay que instrumentarlo desde Node.

Sigue pendiente aparte, y es barato: `EsquemaImpreso` rehace el `fetch` del SVG cada vez que
cambia `scope`, que `evaluateSheet` construye como objeto nuevo en cada evaluación. Y
`usePaginacion` mide los ~250 nodos del documento impreso con `getBoundingClientRect`
(layout síncrono forzado); como su temporizador se reinicia con cada tecla, durante una
ráfaga de escritura la paginación **nunca** se actualiza y el contador de páginas queda
obsoleto justo mientras se edita.

## 2. Deshacer — hecho

`Ctrl+Z` / `Ctrl+Y`, con botones en la barra. `useHistorial` observa `regions` en vez de
envolver los ocho sitios que la modifican, así que no hay forma de añadir una acción nueva
y olvidarse de registrarla.

Los cambios entran en el historial tras 400 ms de pausa, de modo que una ráfaga de tecleo o
un arrastre completo son **un** paso: escribir `fy := 420 MPa` cuesta un Ctrl+Z, no trece.
Guardar 60 estados sale barato porque `setRegions` conserva los objetos de las regiones que
no cambiaron: cada instantánea es un array de punteros, no una copia de la hoja.

Queda fuera: mientras se edita el texto de una región, `Ctrl+Z` es del input y no del
canvas. Es lo esperable, pero conviene saberlo.

## 3. Regiones que se solapan

El punto de inserción avanza `3*GRID` = 48 px fijos, y ninguna región reporta su altura
medida (`Region.h` solo existe para imágenes). Una región con error muestra un mensaje extra
de dos líneas y pisa la de abajo; una fórmula con `\frac` mide 35-45 px más el relleno, al
filo de los 48. En `anclajes-pedestal` y `columna-interaccion-esbeltez` hay pares de
regiones separadas 16 px en la misma `x`. El `z-index` solo distingue activa y seleccionada,
así que dos regiones inactivas superpuestas se pisan en orden de array y la de encima se
come los clics de la otra.

*Coste*: alto. Hay que medir alturas reales y propagarlas.

## 4. Texto y figuras que desbordaban — hecho

Medido antes de tocar nada, imponiendo al documento de impresión el ancho real de una A4
(680 px), que es como lo mide `usePaginacion`:

- **Las ecuaciones no se recortaban.** La auditoría lo daba por hecho, pero ninguna de las
  6.000 del corpus excede su caja; la más ancha justo cabe. Aun así se blindó `.wp-eq` con
  `flex-wrap` y `min-width: 0`, para que la que llegue envuelva en vez de cortarse.
- **Las figuras sí.** Tres planillas (`anclajes-pedestal`, `mensula-puntal-tensor`,
  `placa-base-rigidez-rotacional`) se salían del papel hasta 40 px. La causa: el
  `max-width: 100%` de `global.css` alcanza al `<svg>` pero no al `div` que lo envuelve, que
  llevaba el ancho de la región en píxeles. Ahora ese contenedor se acota y declara su
  proporción, así que al estrecharse el alto la sigue.
- **En el canvas, el texto.** `whitespace-pre` sin tope dibujaba un párrafo de 271
  caracteres en una línea de 1.856 px sobre una hoja de 1.600. Ahora ajusta línea.

Los cortes de página no se movieron: 271 páginas en el corpus antes y después.

**El coste, medido:** un párrafo que pasa a ocupar varias líneas puede pisar la región de
abajo, porque el paso de inserción es fijo y nadie mide la altura real (ver el punto 3). El
corpus pasa de 5 a 6 pares de regiones solapadas. El tope de ancho se eligió por eso: con
uno más estrecho eran 8.

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
