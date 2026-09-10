# Pendientes

Hallazgos de la auditoría del 2026-09-08 que **no** se abordaron, con lo que costaría
cada uno. Están ordenados por relación valor/esfuerzo, no por gravedad.

Lo que sí se arregló ese día está en el historial: el generador de LaTeX (subíndices,
nombres de función, griegas), la robustez al cargar hojas y el panel de variables.

## El norte cambió: la hoja va hacia el flujo lineal

**2026-09-09.** Se descartó el modelo de SMath —posición libre, impresión en el sitio
exacto—: desordena las planillas, y el objetivo del canvas es ordenarlas. Ver
`docs/impresion-absoluta-descartada.md`. La hoja pasará a ser una **lista ordenada** sin
`x`/`y`.

Eso cambia qué merece la pena arreglar. Varios puntos de este documento **desaparecen con
el cambio de modelo**, y quedan marcados así: arreglarlos ahora sería afinar algo que se
va a retirar.

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

~~Sigue pendiente aparte, y es barato: `EsquemaImpreso` rehace el `fetch` del SVG cada vez
que cambia `scope`.~~ **Hecho** al montar el módulo de diseño: los tres consumidores de un
esquema —la región del canvas, el documento de impresión y el visor del módulo— comparten
`useEsquema`, que cachea la descarga por ruta. Y
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

**2026-09-09 — un borrado ya no espera la pausa.** Los 400 ms servían para agrupar una
ráfaga de tecleo, pero convertían el caso grave en irreversible: seleccionar 300 bloques,
pulsar `Supr` y pulsar `Ctrl+Z` al instante —en bastante menos de 400 ms— encontraba el
historial vacío y el botón ↶ deshabilitado, así que parecía que no había deshacer. Y el
autoguardado (300 ms) llegaba **antes** que el registro (400 ms): recargar en esa ventana
consolidaba la pérdida. Ahora, cuando el número de regiones **baja**, la instantánea entra
en el acto. Solo al bajar: crear un bloque y escribir dentro sigue siendo un solo `Ctrl+Z`.

## 3. Regiones que se solapan — hecho, salvo el reparto de clics

El diagnóstico, medido: los solapes del corpus están **todos en la misma columna**, y el
culpable es siempre un bloque de programa alto —`gobierna := if…` mide 197 px, y hay uno de
600— con las regiones siguientes colocadas 48 px más abajo, que es el paso de inserción
fijo. El 2 % de las regiones del corpus (126 de 8.377) supera ese paso.

Tres piezas:

- **Prevención.** El punto de inserción ya no cae dentro de un bloque existente: se miden
  las alturas reales del DOM (`data-region-id`) y el punto baja hasta despejarse. Encadenar
  tres fórmulas bajo un programa de 100 px ya no genera ningún solape.
- **Aviso.** Los bloques tapados se marcan en ámbar y la barra dice cuántos son.
- **Arreglo bajo demanda.** El botón «Separarlos» empuja hacia abajo lo justo. No se mueve
  nada solo: las planillas publicadas conservan la geometría con la que se publicaron hasta
  que alguien lo pide, y el `Ctrl+Z` lo revierte.

`separarSolapes` solo empuja **hacia abajo y en orden**, y se comprueba con
`mismoOrdenDeLectura` antes de aplicar. No es una precaución teórica: el orden de lectura
resuelve el scope compartido, así que reordenar regiones cambiaría qué variable ve cada
fórmula. Verificado sobre `viga-hss-flexion`: 5 solapes → 0, y los resultados de la hoja no
cambian ni un carácter.

**Lo que queda, y MUERE CON EL CAMBIO DE MODELO:** cuando dos regiones inactivas se pisan,
la de encima sigue comiéndose los clics de la de abajo (el `z-index` solo distingue activa y
seleccionada). En una lista ordenada el solape es imposible por construcción y `solapes.ts`
entero sobra, con su aviso ámbar y su botón. No se toca.

**Y hay un falso positivo que tampoco se arregla, por lo mismo.** Desde el renderizado
unificado toda región mide el ancho del papel (`A4_ANCHO_PX`), y como `medidas.ancho` se lee
del DOM, hoy vale 680 px para todas: dos bloques que compartan banda vertical se declaran
solapados aunque no se toquen. El comentario de `solapes.ts` que decía lo contrario ya está
corregido.

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

~~Y un bug concreto: cualquier tecla de un carácter sin modificadores crea una fórmula, y el
espacio mide uno — así que pulsar **Espacio sobre un botón de la barra** crea un bloque
basura en vez de activarlo.~~ **Hecho.** El guard va en la propia regla de «teclear crea una
fórmula» y no al principio del manejador, para que `Ctrl+Z`, `Supr` y compañía sigan
funcionando con el foco en un botón.

~~Los menús desplegables no cierran con `Escape` (el manejador global lo intercepta antes).~~
**Hecho**, junto con el resto del teclado: `Escape` va ahora **antes** de cualquier guard —era
la salida de todos ellos— y cierra el cuadro de «Pegar JSON», el menú de imagen y el de
plantillas; sin nada abierto, retira la capa de orden de lectura, luego el panel de variables,
luego la selección y luego el punto de inserción, una cosa por pulsación. Además `Ctrl+S`
exporta en vez de abrir el «Guardar página» del navegador, y `Retroceso` sin selección ya no
puede navegar hacia atrás.

**Lo que sigue pendiente:** no hay `tabIndex`, `role` ni `aria-` en las regiones, así que no
se puede recorrerlas, seleccionarlas ni moverlas sin ratón, y los estados —seleccionada,
tapada, con error— se comunican solo por color de anillo. Las figuras van con `alt=""` y sin
pie. Conviene esperar al cambio de modelo: en una lista, «recorrer los bloques con el teclado»
es una pregunta con una respuesta obvia que hoy no tiene.

*Coste*: medio en conjunto, pero cada pieza es barata por separado.

## 6. Encabezados detectados por un carácter mágico — hecho

**2026-09-09.** `nivelEncabezado` (`BloqueDoc.tsx`) sustituye al `src.includes('━')` y es la
única autoridad sobre qué es un encabezado. Tres niveles explícitos —`# `, `## `, `### `, con
el espacio obligatorio para que un «#3 barras» siga siendo un párrafo— y la raya como alias
de `##`, ahora **pesada o ligera**: las 19 regiones escritas con la ligera (8 en
`anclajes-pedestal`, 11 en `pedestal-anclaje-nch2369`) ya salen como `<h2>` con su
`break-after: avoid`, que era el fallo silencioso de abajo. Cuesta **1 página sobre 289**, y
solo en una planilla; el detalle está en `docs/linea-base-pagina.md`.

El corpus **no se migró**, y no hace falta: la raya sigue valiendo.

Con ellos llega el panel **☰ Secciones**, que es el índice de la hoja —los encabezados en
orden de lectura, con la sangría de su nivel y un clic para saltar—, hecho sobre el mismo
armazón que el de variables y reutilizando `irARegion`.

**Y el `Shift+Enter` que faltaba, también.** El texto se edita con un `<textarea>` que crece
con su contenido: Enter sale del bloque y deja el punto de inserción debajo, `Shift+Enter` (o
`Alt+Enter`) inserta el salto. En una fórmula, Enter sale y avanza igual. Un programa es la
excepción declarada —Enter sigue insertando línea y `Ctrl+Enter` sale y avanza—, porque su
contenido son líneas indentadas.

El texto de abajo se conserva como el diagnóstico que llevó hasta aquí.

### El diagnóstico original

`WorksheetPrint` decide qué es un encabezado de sección con `r.src.includes('━')` (la raya
pesada, U+2501). En el corpus 420 regiones la usan, pero `anclajes-pedestal` tiene 8
subtítulos con la ligera `──` (U+2500): salen como párrafo gris en vez de `<h2>` y pierden
el `break-after: avoid`, así que la paginación los deja colgando al pie. Fallo silencioso,
invisible hasta ver el PDF.

De fondo: la estructura del documento no debería estar codificada en un carácter.

### El diseño, para cuando toque

**Encabezados markdown.** `# `, `## ` y `### ` al principio de una región de texto dan tres
niveles reales, donde hoy solo hay uno (`wp-h2`) más el título. Con eso el `##` de un
subtítulo se escribe igual siempre y deja de depender de qué raya se pegó del portapapeles,
que es el fallo de arriba.

La convención `━` (U+2501) se queda como **alias de `##`**: la usan **420 regiones en 30 de
las 33 planillas**, y romperlas para ganar sintaxis no compensa. Migrar el corpus es un paso
aparte, y ni siquiera obligatorio.

**Salto de línea en un bloque de texto.** El renderizado ya está listo: `.wp-label` lleva
`white-space: pre-wrap` (`global.css`), así que un `\n` ya se dibuja igual en la hoja y en el
papel. Lo que falta es el editor. Hoy el texto se edita con un `<input>` —el `<textarea>` está
reservado a `program`— y `Shift+Enter` y `Alt+Enter` hacen exactamente lo mismo que Enter,
porque el manejador no consulta los modificadores. Hay que cambiarlo a `<textarea>`: Enter
confirma, `Shift/Alt+Enter` inserta el salto. Y hay que volver a medir: un texto de varias
líneas es más alto, y de las alturas dependen los cortes de página.

**Por qué va con el cambio de modelo.** En una hoja de flujo lineal el tipo de bloque es
explícito en vez de deducirse del contenido, así que un nivel de encabezado pasa a ser un
campo y no un prefijo que haya que adivinar. Hacerlo antes sería escribir dos veces el mismo
detector.

## 7. Cosas menores ya localizadas

- **La primera región de texto se convierte en `<h1>`** y desaparece del cuerpo del PDF. Si
  no es el título (una nota, un `━━ DATOS ━━`), el documento sale mal titulado y se pierde
  ese contenido. `meta.titulo` existe en el formato y sería mejor fuente.
- ~~**Las regiones vacías se pierden en la primera recarga**~~ **Hecho.** Eran 39 en 8
  planillas (16 solo en `anclajes-pedestal`) y desaparecían en el primer autoguardado, así
  que la hoja se recolocaba sola tras un F5. Ahora solo se descarta la región **en edición**
  si está vacía, que es la única que puede quedar a medio crear; una vacía que llegó a
  guardarse es una decisión del autor.
- ~~**La paleta de símbolos no hace nada sin una región en edición**, y no lo indica: 70
  botones que parecen rotos.~~ **Hecho:** sin edición se deshabilita entera y lo dice.
- **El aviso de «bloques más altos que una A4» no dice cuáles.** `usePaginacion` ya calcula
  la lista de ids; solo falta resaltarlos.
- **Si el corte de página cae en el pie**, la línea no se dibuja (se busca por id de región
  y `__footer` no es una).
- ~~**`exportJson` revoca el blob de forma síncrona** tras el `click()`, sin añadir el
  enlace al DOM.~~ **Hecho.** Ahora hay una sola implementación, `descargarHoja` de
  `canvas-handoff.ts`, que añade el enlace al documento y revoca en el turno siguiente; la
  usan el botón «Exportar» del canvas y el «Descargar .json» de los módulos de diseño.
- ~~**`importJson` no tiene `.catch`**: si la lectura del archivo falla, no hay ningún aviso.~~
  **Hecho**, por el canal de avisos nuevo (una banda que se retira sola) en vez de un `alert`.
- ~~**`pointercancel` deja el arrastre pegado**~~ en el **tirador de la imagen**: **hecho**. El
  arrastre de la región ya tenía su red; al tirador se le había olvidado, y un gesto cancelado
  dejaba el redimensionado vivo, de modo que cualquier paso del ratón por encima sin botón
  pulsado cambiaba el tamaño. Sigue pendiente el `touch-action: none`: sin él, arrastrar en
  táctil hace scroll.
- **Sin guardas de tamaño al leer imágenes**: se hace `readAsDataURL` y se descodifica la
  imagen entera *antes* de mirar `file.size`. Una foto de móvil de 50 MB se materializa en
  memoria antes de reescalarla. Los SVG entran sin límite ni reescalado.
- **Multiselección**: ya hay marco, arrastre en grupo, copiar/cortar/pegar y duplicar.
  Alinear y distribuir **mueren con el cambio de modelo**: no significan nada en una lista.
- **No se puede copiar texto del canvas**: `select-none` está en la raíz de cada región
  (lo necesita el arrastre), así que un resultado calculado no se puede copiar a un informe.
- **Diálogos nativos bloqueantes** (`confirm`/`alert`) en siete sitios; al soltar un lote de
  archivos puede salir un `alert` por cada uno que falle.

## 8. De la auditoría del 2026-09-09

Lo que se arregló ese día está repartido por los puntos de arriba y en el historial: el
`Ctrl+X` que borraba sin copiar, las regiones vacías, el `localStorage` ilegible, el
deshacer inmediato al borrar, la caja de arrastre de 680 px, el `ErrorBoundary` compartido,
el bucle que colgaba la pestaña, el escape de los esquemas y el teclado.

Lo que **no** se tocó:

### Sin red de tests, y con reglas que nadie comprueba

No hay un solo archivo de test, no hay ESLint instalado —pese a que `MathCanvas.tsx` lleva
dos `// eslint-disable-next-line react-hooks/exhaustive-deps` que no verifica nadie— y el
`build` solo corre `tsc --noEmit`. Los dos verificadores cubren el motor, que es lo que más
importa; **de la capa de interfaz no comprueba nada nada.** Las pruebas de navegador de esta
sesión se escribieron y se tiraron.

### El deep-link puede pisar lo que se esté escribiendo

`hayTrabajoGuardado()` se evalúa **al montar** y se le pasa congelada a `cargarHoja`. En un
navegador limpio vale `false`. Si el `fetch` de la planilla tarda —una hoja grande, red
lenta— y en ese rato el usuario empieza a teclear, al resolver no pregunta nada y reemplaza
la hoja. `señal.cancelado` solo cubre el desmontaje, no la edición.

### El contrato JSON acepta cosas que no debería

- `esHoja` da por buena `{"regions": []}`, así que pegar eso vacía la hoja con un `confirm`
  genérico que no dice que lo que viene está vacío. Convendría anunciar el recuento.
- `sanearRegiones` solo comprueba que `x`/`y` sean finitos: una `y` negativa deja una región
  que se evalúa y se imprime pero es inalcanzable en el canvas, y una `y` de `1e9` pide un
  `<div>` de mil millones de píxeles. `w`/`h`/`pageBreak` no se validan.
- `Math.max(...regions.map(...))` hace *spread* de un array de tamaño arbitrario: un pegado
  con ~100k regiones revienta con «Maximum call stack size exceeded» dentro del render.
- Si el navegador desactiva los diálogos («impedir que esta página cree más diálogos»),
  `confirm` pasa a devolver `false` y los `alert` desaparecen: varios errores se vuelven
  silenciosos. Quedan `alert`/`confirm` en varios sitios; el canal de avisos nuevo debería
  absorberlos.

### Cuatro debounces sobre el mismo `regions`, sin coordinar

120 ms la evaluación, 300 ms el autoguardado, 400 ms el historial, 250 ms la paginación. La
desalineación 300/400 ya se resolvió para el caso grave (ver el punto 2), pero siguen siendo
cuatro relojes independientes. Y en cada pausa de tecleo se disparan **dos mediciones
completas** —`usePaginacion` fuerza una relayout del documento de impresión entero mutando
estilos en línea, y el `ResizeObserver` remide el canvas— más una evaluación de math.js.

### Duplicación que sigue en pie

- `STORAGE_KEY` está centralizada en `hoja-guardada.ts`… y repetida en `ErrorBoundary.tsx`.
- La descarga de un blob está en `canvas-handoff.ts` y copiada en `ErrorBoundary.tsx`, pese
  al comentario que explica por qué no debe duplicarse.
- El comparador de orden de lectura `(a,b) => a.y-b.y || a.x-b.x` vive en **diez** sitios. Es
  *el* invariante del motor: define el scope compartido. Se unifica con el cambio de modelo.
- La elección del título («la primera región `text` en orden de lectura») está en
  `MathCanvas.tsx` y en `WorksheetPrint.tsx`.
- Tres criterios distintos sobre qué es una hoja válida guardada en `localStorage`.

### Cosas menores localizadas

- **Rutas profundas sin *fallback* de SPA.** `vite dev` y `vite preview` lo sirven, pero un
  despliegue estático sin `try_files` devuelve 404 en cualquier recarga o enlace compartido
  — que es justo el caso de uso de los deep-links `?planilla=`.
- **Exportar pierde el título** (`meta.titulo` no se emite, aunque `cargarHoja` sí lo lee) y
  el archivo siempre se llama igual. Y exporta las regiones vacías sin filtrar, al revés que
  el autoguardado.
- **Si el corte de página cae en el pie**, la marca no se dibuja: se busca por id de región y
  `__footer` no es una. El contador dice 8 páginas y en la hoja hay 6 líneas.
- **El textarea de un programa no tiene tope de ancho**: una línea de 400 caracteres pide
  ~400ch y desborda la hoja.
- **Deshacer descarta la selección** siempre, así que mover un grupo, verlo mal y reintentar
  obliga a rehacer la selección. Solo hace falta limpiarla cuando los ids restaurados no
  existen.
- **Dos deep-links a la vez** (`?plantilla=…&planilla=…`) disparan dos cargas y dos
  confirmaciones, y la segunda pisa a la primera.
- **`ones(20000, 20000)` agota la memoria** dentro de math.js, y eso no es un error que se
  pueda atrapar. No es propio del `for`: una región `math` con esa expresión hace lo mismo.

### Dos que parecen algo y no lo son (2026-09-09)

- **La clase `app-screen`** (`MathCanvas.tsx`, el `div` raíz) **no está definida en ninguna
  hoja de estilos.** Solo aparece en el bundle compilado. Es inerte: la altura la da `h-full`.
  Tiene toda la pinta de ser significativa, y no lo es.
- ~~**El comentario de `insertRegion` apuntaba a un `avanzarPunto`** que reajustaría el punto
  de inserción con el alto ya medido del bloque. **Esa función nunca existió.**~~ **Hecho**
  (2026-09-09), aunque no donde lo prometía el comentario: lo hace `commitActive(avanzar)` al
  confirmar con Enter, que es cuando hay un bloque renderizado que medir. La reserva fija de
  `insertRegion` (48 px, u 80 para un programa) se queda como provisional mientras se edita
  —el punto ni siquiera se dibuja entonces— y el alto real la corrige al salir. El alto se
  lee del DOM tras **dos** `requestAnimationFrame`: el primero espera al repintado que
  sustituye el editor por el bloque, y el segundo a que KaTeX componga, que ocurre en un
  efecto pasivo y puede llegar después.

## 9. De la sesión del 2026-09-09 (segunda tanda)

**Los avisos dejaron de empujar el lienzo.** Eran cinco franjas hermanas de la fila de
trabajo, que es la única con `flex-1`: cada una que se montaba le robaba alto al visor y el
papel daba un salto — y la del acuse lo hacía dos veces, al entrar y al salir. Ahora flotan
sobre el visor, arriba a la derecha, donde no tapan nada porque el papel ocupa los primeros
680 px de un lienzo de 1600. Medido: el primer bloque se queda en el mismo píxel al aparecer
y al retirarse el aviso.

El cuadro «Pegar JSON» **no** se movió, a propósito: lo abre el usuario, y que el visor se
acorte mientras está abierto es esperable, al revés que un aviso que sale solo.

**Enter abre una línea de espacio.** Con el punto de inserción fijado, Enter mete un
espaciador y baja lo que haya debajo. Un espaciador es una región de texto vacía —lo que el
corpus ya usaba— que ahora ocupa 16 px, un paso de la cuadrícula, **en la hoja y en el papel**:
`WorksheetPrint` dejó de descartar las vacías de tipo texto. Las `math` y `program` vacías se
siguen descartando: esas no son un hueco, son un bloque a medio escribir.

Coste medido en el corpus: las 39 regiones vacías pasan de ocupar cero a ocupar 16 px, y eso
suma **2 páginas sobre 287** (`mensula-puntal-tensor` 10→11 y `zapata-aislada` 8→9). Ninguna
planilla sin regiones vacías cambió de paginación, que es la comprobación que descarta otra
causa. Y de 1.900 bloques medidos en cinco planillas, los únicos que cambiaron de alto son las
propias regiones vacías.

**Lo que queda pendiente de esto:** un espaciador solo se ve al pasar el cursor por encima (el
anillo de `hover`); no hay ninguna marca permanente que diga «aquí hay un hueco deliberado».
En una hoja con varios seguidos cuesta saber cuántos son sin seleccionarlos.

## 10. De la sesión del 2026-09-09 (tercera tanda)

Tres cosas, y las tres están contadas donde toca: el Enter que avanza y los encabezados
markdown cierran el punto 6 y la nota de `avanzarPunto` del punto 8; las medidas están en
`docs/linea-base-pagina.md`. Queda por escribir aquí lo que **no** resuelven.

**El papel del canvas no tiene la proporción de una A4, y eso es correcto.** Una página del
corpus ocupa unos 1.650 px de lienzo y no los 1.122 de una A4, porque el canvas separa los
bloques 48 px y el papel 8. La alternativa —apilar rectángulos de alto fijo desde un origen—
daría la proporción correcta y cortes que el PDF no tiene, que es peor. Por eso el papel se
dibuja como **una banda continua** y el corte es una marca: la línea «página N» sobre el
corte medido. Con la hoja de flujo lineal el papel pasa a ser un contenedor de verdad y la
pregunta desaparece.

**El origen del papel es una constante (`ORIGEN_PAPEL_X`/`_Y` = 40)**, no el contenido. Un
bloque colocado fuera de ella se dibuja sobre el gris, y no pasa nada: al imprimir se refluye
igual, porque el documento lineal no mira la posición de nadie. La silueta es una guía, no
una restricción. **Muere con el cambio de modelo.**

**El aviso de solape del título sigue ahí.** El `<h1>` mide 90 px y las planillas dejan 48
entre el título y lo siguiente (ver la nota de la fase 3 en `docs/linea-base-pagina.md`), así
que varias planillas abren con la banda ámbar. La hoja de ejemplo del canvas sí se separó,
que era lo barato; el corpus se recoloca con la migración.

**Y el `<textarea>` de un texto no mide exactamente lo mismo que el `<p>` que lo sustituye**
mientras se edita. No mueve los cortes de página —esos se miden sobre `WorksheetPrint`, no
sobre el canvas—, pero sí puede hacer parpadear el detector de solapes durante la edición.


## 11. De la auditoría del 2026-09-10

Tres revisiones en paralelo —motor, canvas, y módulos de diseño con rutas e impresión— dieron
unos 45 hallazgos que no estaban en este documento. Se abordaron el motor, el canvas y, como
funcionalidad nueva, el autocompletado; el detalle está en los tres commits de ese día. Lo
que importa dejar escrito aquí es lo que **no** se tocó.

**Lo que se arregló, en una línea cada cosa.** En el motor, lo que daba un número equivocado
sin error: el programa que se comía su cuerpo, el `if` final sin valor, las condiciones con
matrices, NaN o unidades, el tope de iteraciones que se reiniciaba en cada llamada (ahora es
por región, cuenta llamadas y está en 500.000), las funciones que alteraban matrices de la
hoja, la redefinición fallida que dejaba viva la anterior, `x = 5` que asignaba en silencio,
los nombres de `Object.prototype` y los textos en modo matemático. Cada caso vive en
`npm run verify:motor`. En el canvas: dos pestañas que se pisaban, la ráfaga perdida al
cerrar, el Ctrl+Z que retrocedía dos pasos, las fórmulas vacías que resucitaban, Enter y
Escape, Alt+Tab, Ctrl+S en edición, AltGr, IME, ⌘+clic, Shift+Tab y el soltado de archivos.

**Una variable que tapa una unidad ahora avisa.** `s := 20 cm` y luego `3 m/s` dan 15, sin
unidades, porque math.js busca antes en el scope que entre las unidades. Es un aviso y no un
error —la expresión es válida— y solo en posición de unidad: `b*h` con `h` definida no avisa.
Un paréntesis expresa la intención: `(26 cm)/h` es «entre la variable» y no avisa. En el corpus
no salta ninguno.

**Un hallazgo que resultó no serlo:** «al vaciar la hoja, la paginación queda congelada». El
pie del documento de impresión es un bloque medido, así que la lista nunca está vacía y la
paginación sí se recalcula; una hoja vacía ocupa, con razón, una página.

### Módulos de diseño — sin tocar, con la decisión tomada

Se corrigen **módulo y planilla juntos**, para que `verify:modulos` siga contrastando lo mismo.
Ordenados por gravedad:

- **Zapata, longitud de desarrollo** (`zapata-aislada.ts`, `k_ld`): usa 2,1 para cualquier
  diámetro, y la Tabla 25.4.2.3 lo reserva a barras No. 19 o menores; de 22 mm en adelante es
  1,7. El selector ofrece 22 a 32 mm, así que para esas barras `l_d` sale un 19 % corta y puede
  dar ✓ lo que es ✗. Además: el mínimo de 300 mm (`v_ld300`) se calcula pero no vota, y ψ_g
  queda en 1 también con f_y = 5000 kgf/cm², donde corresponde al menos 1,15.
- **Zapata, punzonamiento** (`V_u2`): resta la reacción del suelo dentro del perímetro con
  `q_u_max`, que es conservador en flexión pero no aquí. Con el momento por defecto `V_u2` sale
  un 3,6 % corto, y un 9 % con el momento dentro del núcleo. El contraste no lo ve porque se
  hace con M = 0.
- **El CUMPLE ignora lo que no se calculó** (`PanelResultados.tsx`): un uso NaN o infinito se
  descarta del máximo en silencio, un veredicto `undefined` no cuenta como incumplimiento, y
  puede salir el recuadro rojo de «regiones que no evaluaron» junto a un CUMPLE verde.
- **Los avisos que invalidan el número no apagan el CUMPLE.** En la zapata, con e > B/6 la
  presión máxima se subestima (hasta un 24 % con valores plausibles); en la losa, `v_mom` dice
  en su propio texto que `v_u` está subestimado. Los dos dan CUMPLE verde.
- **Viga**: `h_min = L/16` sin el factor (0,4 + f_y/700) de la nota de la Tabla 9.3.1.1, que
  con f_y = 5000 vale 1,10; y `u_V` sale negativo en vigas cortas (d > L/2) con la barra verde,
  sin un aviso de viga de gran altura.
- **Zapata**: se comprueba la separación máxima de barras y no la libre mínima.
- **Formulario**: acepta `n_b = 3,5` barras (nada redondea al `paso`), evalúa negativos
  mientras se escribe, y con `type="number"` una coma decimal deja ver «2,5» y calcular con 2.
- **Acero**: la clasificación de esbeltez vota, así que una sección no compacta —que AISC
  permite— sale NO CUMPLE; y φ_v = 1,0 es de perfiles laminados, cuando el módulo arma uno
  soldado (0,90).
- **`verify:modulos` no mira signo ni finitud de los usos**, solo que existan; un módulo con
  `casos: []` pasa sin evaluar nada.
- Las entradas de un módulo no se guardan: F5 las devuelve a los valores por defecto.
- **Ctrl+P fuera del canvas imprime en blanco**: la regla de impresión oculta todo lo que no
  sea `.worksheet-print`, que solo existe en `/canvas`.

### Motor — sin tocar

- **math.js simplifica las unidades al mostrarlas**: `5 kN * 2 m =` sale `10 kJ`, un momento
  escrito como energía. Solo se evita con `= kN*m`. Cambiarlo toca miles de resultados del
  corpus y la paginación, así que necesita su propia medición antes de decidir nada.
- Un esquema que llama a una función de usuario la evalúa con el scope **final** de la hoja,
  no con el de su posición.
- NaN, infinitos y complejos se formatean mal (`Infinity` en cursiva, `1e+6i`).

### Canvas — sin tocar

- No hay desplazamiento automático al arrastrar cerca del borde del visor: llevar un bloque de
  la página 1 a la 3 son varios arrastres.
- El `ResizeObserver` de las medidas se reconecta con cada cambio de `regions`, así que un
  arrastre remide las ~650 regiones en **cada** `pointermove`, no solo en cada pausa. Matiza el
  punto de los cuatro debounces (sección 8). **Muere con el cambio de modelo.**
- Pegar un fragmento no evita solapes: usa el punto de inserción tal cual. **Muere con el
  cambio de modelo.**
