# CLAUDE.md

Guía para trabajar en este repo. Ver `README.md` para qué es la aplicación y de dónde sale.

## Idioma — español neutro, siempre

Regla dura y transversal: interfaz, mensajes de error, comentarios, documentación, mensajes
de commit y respuestas de chat. `tú` nunca `vos`, `ustedes` nunca `vosotros`, cero
regionalismos (incluidos los chilenos: "al tiro", "cachai", "harto"). Vocabulario técnico
estándar. Aplica también a agentes y subagentes.

## Comandos

```sh
npm run dev              # servidor de desarrollo
npm run build            # tsc --noEmit && vite build
npm run verify:planillas # evalúa las 33 planillas de public/planillas/
npm run verify:planilla -- <archivo.json> [--md]
npm run verify:modulos   # evalúa los módulos de diseño (TS y declarativos) y sus memorias exportadas
npm run verify:motor     # casos de regresión del motor: hojas mínimas con su resultado
npm run verify:biblioteca          # el contrato de genérica y los casos de public/biblioteca/
npm run indice:planillas           # regenera los dos índices (lo corren dev y build)
npm run render:planilla -- <json> --pdf <salida>
```

**No hay tests unitarios.** La red de seguridad son los tres verificadores.

`verify:motor` cubre lo que el corpus no ejercita: formas de escribir que ninguna planilla
usa y que daban un número equivocado **sin error**. Cada caso es una hoja mínima y lo que
tiene que dar, y además exige que todo el LaTeX emitido componga en KaTeX. Un arreglo del
motor empieza por escribir su caso y verlo fallar.

`verify:planillas` ejecuta cada planilla publicada con el mismo motor que corre en el
navegador y falla si alguna región tiene error (sintaxis, variable indefinida, unidades que
no casan), si una comparación da `false` sin estar declarada en `meta.esperadoFalso`, o si
un esquema tiene tokens sin resolver. Córrelo ante cualquier cambio del motor.

`verify:modulos` hace lo propio con los módulos de diseño, que producen hojas del mismo
formato: por cada juego de entradas declarado en el módulo comprueba símbolos, evaluación,
tokens del esquema y que cada entrada y salida exista en el scope; después contrasta los
valores contra la planilla publicada de la que salió el módulo y pasa las memorias
exportadas por `verify-planilla.mjs`. Una verificación en ✗ **no** es un fallo aquí: un
diseño que no cumple es un resultado legítimo, al revés que en una planilla publicada.

## Hacia dónde va la hoja

**El modelo de SMath está descartado.** Posición libre en un plano y bloque impreso en el
sitio exacto: se implementó entero (rama `canvas-papel`, fases 4 y 5) y se revirtió, porque
desordena las planillas y el objetivo del canvas es lo contrario. Las medidas que costó
obtener están en `docs/impresion-absoluta-descartada.md`; la rama ya no existe.

Lo decide el corpus: las **8.377** regiones publicadas están en `x = 40`, sin una sola
excepción, y **7.471** de los 8.344 saltos verticales miden exactamente 48 px. Nadie usaba
la libertad que costaba mantener — y desde el renderizado unificado toda región ocupa el
ancho del papel, así que una disposición a dos columnas ya era imposible.

El destino es una hoja de **flujo lineal**: `Region` pierde `x`/`y`, la hoja es una lista
ordenada, arrastrar reordena en vez de reposicionar, y el orden de lectura pasa a ser el
orden del array. Con eso desaparecen `solapes.ts`, la anticolisión del punto de inserción,
el botón ① y buena parte de `MathCanvas.tsx`. **Todavía no está hecho.** Mientras tanto, al
tocar el canvas conviene preguntarse si lo que se arregla sobrevive al cambio; lo que no,
está marcado como tal en `docs/pendientes.md`.

## Arquitectura

La separación es estricta y hay que mantenerla:

**Vistas** (`src/App.tsx` + `src/lib/ruta.ts`): `/` es el menú, `/planillas` el catálogo,
`/canvas` la hoja y `/diseno/<id>` un módulo. `/calibrar` es una quinta vista **solo de
desarrollo** (`src/components/dev/`): mide cuántas páginas ocupa cada planilla y calibra
`A4_ALTO_UTIL_PX` contra un PDF real. Vive dentro de la aplicación porque mide con el
documento de impresión de verdad, y `App.tsx` la deja fuera con `import.meta.env.DEV`, así
que no llega al bundle de producción. Los resultados están en `docs/linea-base-pagina.md`. El router es propio y son ~70 líneas puras;
`src/components/useRuta.ts` es el único puente con React. `MathCanvas` solo se monta en
`/canvas`, que es lo que mantiene válidos sus `useEffect` de deep-link con dependencias
`[]`. Las formas antiguas `/?planilla=…` se reescriben en `main.tsx` **antes** del primer
render.

**Diseño de elementos** (`src/lib/diseno/` + `src/components/diseno/`): un módulo declara
sus entradas y salidas y sabe armar una hoja (`construirHoja(entradas) => Item[]`); no
calcula nada por su cuenta. La UI hace `evaluateSheet` sobre esa hoja y de ahí saca los
resultados en vivo, el esquema y la memoria que se exporta — las tres cosas de la misma
evaluación, que es lo que impide que diverjan. `evaluar.ts` tiene esos pasos porque los
comparten la pantalla y `verify:modulos`; si el verificador los reprodujera, comprobaría su
propia copia. Añadir un elemento son dos archivos: el módulo y su SVG.

Tres reglas al escribir uno. **Las expresiones se copian de una planilla publicada** y se
declaran en `contraste`, para que `verify:modulos` exija que sigan dando lo mismo; cuando el
módulo y la planilla llegan al mismo número por caminos distintos —el módulo derivando las
propiedades de la geometría y la planilla declarándolas del catálogo del perfil—, el valor
lleva una `tolerancia` declarada en vez de exigir identidad. `contraste` admite una **lista**
para el módulo que cruza dos cuerpos de norma que ninguna planilla sola cubre: la losa de
fundación saca el punzonamiento de `losa-punzonamiento-momento` y el corte de
`zapata-aislada`, cada uno con sus propias `entradas`. **Nada se declara que se pueda
derivar**: una propiedad escrita a mano es un número que hay que creer, y el punto de una
memoria es poder auditarla de arriba abajo. Y **lo que el módulo no cubre se declara**, con
un veredicto marcado `aviso` que lo señale en pantalla. Un aviso no es un incumplimiento: no dice que la sección falle, dice que el
resultado puede no ser válido, y por eso no vota en el CUMPLE / NO CUMPLE.

**Capa UI** (`src/components/canvas/`, React):
- `MathCanvas.tsx` — raíz: mantiene el estado `Region[]`, autoguarda en `localStorage`
  (clave `structpad.worksheet.v1`, debounce 300 ms), gestiona clic-para-crear, el marco de
  selección sobre el fondo, el arrastre en grupo, el portapapeles de regiones, borrado,
  importación/exportación JSON y el menú de plantillas. Las regiones vacías son
  transitorias: se descartan al perder el foco, nunca se persisten.
- `BloqueDoc.tsx` — **cómo se dibuja un bloque, y qué es una sección, en un solo sitio.**
  `nivelEncabezado` es la única autoridad sobre lo segundo: `# `, `## ` y `### ` al principio
  de un bloque de texto dan los tres niveles —con el espacio obligatorio, para que un
  «#3 barras» siga siendo un párrafo—, y una raya horizontal **pesada (U+2501) o ligera
  (U+2500)** vale por `##`. La raya no se retira porque la usan 439 regiones en 31 de las 33
  planillas publicadas. Lo usan el marcado, el ancho de la caja de interacción y el panel de
  secciones; con la comprobación repetida, los tres acabarían discrepando — que es justo lo
  que pasaba cuando solo contaba la raya pesada y 19 subtítulos escritos con la ligera salían
  como párrafo gris, sin `break-after: avoid` y colgando al pie de página. Lo usan la hoja y el
  documento de impresión, y el aspecto está en `global.css` bajo `.doc-papel`, que llevan los
  dos raíces. Antes eran dos renderizados —el canvas con `text-sm` (14 px) y el documento con
  `11pt` e interlineado propio—, así que un mismo bloque no medía lo mismo en pantalla y en el
  papel. Con el papel dentro del canvas eso es imposible: lo que se ve tiene que **ser** lo
  que sale, no parecerse.
- `MathRegion.tsx` — el chrome de una región: arrastre, anillo de selección, tirador de la
  imagen y el editor. El contenido lo pinta `BloqueDoc`. Exporta `GRID`, `snap()`,
  `AIRE_TRAS_BLOQUE` y `UMBRAL_ARRASTRE`.

  **Enter sale del bloque y deja el punto de inserción debajo**, con el alto **real** del
  bloque más `AIRE_TRAS_BLOQUE` ajustado a la cuadrícula — 48 px de salto para una fórmula,
  que es el paso con el que está escrito el corpus, y por debajo de sí mismo para un programa
  de 200 px, que es lo que el paso fijo anterior no sabía hacer. En un texto, `Shift+Enter` y
  `Alt+Enter` insertan un salto de línea (por eso es un `<textarea>` que crece con su
  contenido, y no el `<input>` de una fórmula). **Un programa es la excepción**: Enter inserta
  línea y `Ctrl+Enter` sale y avanza, porque su contenido son líneas indentadas y escribirlas
  con Shift+Enter sería pelear con el editor en cada una. Quien avanza el punto es
  `commitActive(avanzar)` del canvas; un blur y un Escape **no** avanzan. **No calcula a dónde va al arrastrarla**: emite el desplazamiento crudo
  del puntero (`onDragStart` / `onDrag` / `onDragEnd`) y es el canvas quien resuelve el grupo,
  porque es el único que sabe qué más está seleccionado. Y **no lleva relleno**: seis píxeles
  de `padding` son seis píxeles de diferencia con el papel; el realce va en `ring`, que es una
  sombra y no ocupa sitio.

  Son **dos cajas anidadas, y hay que mantenerlas separadas**. La exterior es la de
  *medición*: ocupa `A4_ANCHO_PX`, lleva `data-region-id` —es la que miden `usePaginacion`,
  `solapes.ts` y el salto del panel de variables— y va con `pointer-events: none`. La
  interior es la de *interacción y realce*: `width: fit-content` acotado al ancho del papel,
  y se lleva el cursor, el anillo y los manejadores de puntero. Cuando eran una sola, los
  680 px se comían el clic en el vacío a la derecha de una fórmula de 60 px —que es el gesto
  que fija el punto de inserción— y ofrecían mover un bloque desde media hoja de distancia.
  `fit-content` no cambia el ancho *disponible*, así que el salto de línea y el alto siguen
  siendo los del papel: comprobado sobre 1.900 bloques de cinco planillas, cero con altura
  distinta. Los encabezados (el título y los `━━ … ━━`) son la excepción y se quedan a ancho
  completo, porque su regla horizontal tiene que cruzar la página; la condición la decide
  `esEncabezado` de `BloqueDoc.tsx`, que es el único sitio donde vive.
- `SymbolPalette.tsx` — paleta lateral de símbolos y fragmentos insertables.
- `Autocompletado.tsx` — el desplegable de nombres al escribir una fórmula o un programa,
  como el de SMath. La lógica es pura y está en `src/lib/autocompletar.ts`: ofrece lo que la
  hoja define **por encima** de la región (lo único que el motor le deja ver), lo más cercano
  primero, y nunca unidades. Con la lista abierta, Enter y Escape son suyos; cerrada, las
  teclas del editor hacen lo de siempre. Solo la región activa recibe `sugerencias`, y la
  comparación del `memo` de `MathRegion` las incluye: si llegaran a todas, se perdería la
  memoización de las ~650 regiones.
- `SeccionesPanel.tsx` — el índice de la hoja: sus encabezados en orden de lectura, con la
  sangría de su nivel y un clic para saltar. Mismo armazón que `VariablePanel` y el mismo
  `irARegion`; los niveles salen de `nivelEncabezado`, nunca de un detector propio.
- `SiluetaPapel.tsx` — el papel dibujado bajo los bloques, y la cuadrícula, que ya no cubre
  el lienzo entero. **En horizontal la geometría es literal** —210 mm de hoja y 180 de caja de
  contenido, y esos 180 son los `A4_ANCHO_PX` que mide cada región—, **pero en vertical no
  puede serlo y no lo finge**: la `y` del lienzo no es lineal con la página impresa, porque
  `WorksheetPrint` refluye a un documento con sus propios márgenes. Una A4 del corpus ocupa
  unos 1.650 px de lienzo y no los 1.122 de una A4, porque el canvas separa los bloques 48 px
  y el papel 8.

  Por eso el papel es **una sola banda continua** y no una hoja por página: dónde parte lo
  dice la línea «página N», que va sobre el corte **medido**. Dibujar un rectángulo por
  página metía entre cada par sus dos bordes horizontales pegados y una franja de 57 px sin
  cuadrícula —el margen inferior de una más el superior de la siguiente—, que se leía como un
  borde grueso en mitad del texto sin decir nada: el papel del canvas es continuo porque los
  bloques lo son. Apilar rectángulos de alto fijo, además, daría cortes que el PDF no tiene.

  El origen es la constante `ORIGEN_PAPEL_X = 40`, que es donde está el 100 % del corpus;
  anclarlo al contenido haría saltar la hoja al mover un bloque.

**Los avisos flotan, no empujan.** Las cinco bandas —bloques largos, bloques tapados, fallo de
autoguardado, hoja apartada y el acuse efímero— van en una pila `absolute` sobre el visor del
lienzo, no como hermanas de la fila de trabajo. Ahí eran hijas del mismo flex en columna que
el visor, que es el único con `flex-1`: cada una que se montaba le robaba alto y el papel daba
un salto, y la del acuse lo hacía dos veces porque se retira sola. La pila va
`pointer-events-none` y cada tarjeta `pointer-events-auto`, para que el hueco entre tarjetas
deje pasar el clic que fija el punto de inserción. El cuadro «Pegar JSON» sigue en el flujo a
propósito: lo abre el usuario.

**Un espaciador es una región de texto vacía**, y ocupa `ALTO_ESPACIADOR` (16 px, un paso de
la cuadrícula) **en la hoja y en el papel**. Ese número vive en dos sitios que tienen que
coincidir —la constante de `BloqueDoc.tsx` y `.doc-papel .wp-space` de `global.css`—, igual
que `A4` de `paginacion.ts` coincide con la regla `@page`: el canvas lo necesita para saber
cuánto empujar al abrir el hueco, y el bloque para ocupar ese alto. `WorksheetPrint` conserva
las vacías **solo si son de tipo texto**; una `math` o una `program` vacía no es un hueco, es
un bloque a medio escribir. Y el título del papel las salta explícitamente, o el primer
espaciador de la hoja se convertiría en el `<h1>`.
- `WorksheetPrint.tsx` — el documento de impresión: un portal en `<body>` que refluye las
  regiones a un documento **lineal** (orden de lectura). **No** es el layout del canvas: no
  hay correspondencia geométrica entre dónde está una región en la hoja y dónde cae en el
  papel.
- `usePaginacion.ts` — mide ese documento y reporta en qué página cae cada región.

**Capa motor** (`src/lib/`, pura, sin React — *mantenerla así*, para que siga siendo
testeable y portable):
- `worksheet.ts` — `evaluateSheet(regions)` es el núcleo. Evalúa cada región no-texto
  contra un **único scope de mathjs compartido, en orden de lectura (y, luego x)**, así que
  lo definido más arriba/izquierda es visible más abajo/derecha (semántica SMath). Gramática
  del campo `src`: `nombre := expr` define, un `=` final muestra, `= unidad` convierte con
  chequeo dimensional. Registra la unidad local `tonf` (= 1000 kgf, alias `tf`).
  Una definición que falla **retira** la variable del scope, para que el error se propague
  en vez de dejar a lo de abajo calculando con el valor anterior. Y una variable que tapa una
  unidad del mismo nombre en posición de unidad (`s := 20 cm` y luego `3 m/s`) deja un
  `aviso` en el resultado: no es error ni cuenta en `verify:planillas`, y el canvas lo marca
  al margen sin imprimirlo.
- `program.ts` — intérprete **imperativo** mínimo para las regiones `program`, porque mathjs
  no tiene control de flujo. Bloques definidos por **indentación** estilo Python (`if` /
  `else if` / `else`, `for … in range/list`, `while`, `break`/`continue`, `return`),
  delegando cada expresión a mathjs. Protegido por `MAX_ITERS` (500k) contra bucles
  infinitos: el contador es **por región** y cuenta las vueltas y las llamadas a funciones de
  usuario que la región desencadena, a cualquier profundidad (con un tope de recursión
  aparte). La región más cara del corpus llega a 58.590; no bajar el tope sin medirlo.
- `paginacion.ts` — el modelo de saltos de página A4. **No "simplificar" las reglas de
  margen ni `A4_ALTO_UTIL_PX` sin volver a contrastar contra un PDF real**: el valor es
  1010 px y no los 1009.134 de la cuenta teórica porque Chromium arma la caja de página en
  píxeles enteros, y usar el teórico adelanta un corte cada varias páginas.
- `esquema.ts` — esquemas SVG paramétricos: sustituye tokens `{{expr:unidad}}` contra el
  scope de la hoja.
- `hoja-json.ts` — el contrato JSON de una hoja: `esRegion`, `esHoja`, `sanearRegiones`,
  `parsearHoja`. Salió de `MathCanvas.tsx` cuando el portapapeles de fragmentos pasó a
  necesitar las mismas comprobaciones: tenerlas dos veces sería tener dos contratos.
- `seleccion.ts` — la caja de una región, qué toca el marco de selección, y el anclaje del
  arrastre en grupo. El delta se ajusta a la cuadrícula y se acota **una sola vez, sobre la
  región agarrada**; hacerlo región por región deforma el grupo.
- `fragmento.ts` — el trozo de hoja que viaja por el portapapeles. Lleva la marca
  `fragmento: true` porque un fragmento también parsea como hoja, y sin ella el Ctrl+V que
  carga una planilla completa borraría la hoja en la que se está pegando.

Tres tipos de región: `math`, `text`, `program` (más `image`). Al añadir funcionalidad al
motor, extiende los módulos puros y mantén los componentes React delgados.

## Invariantes que cuestan caro romper

- **Los estilos del bloque van FUERA de `@media print`** en `global.css`; el media query solo
  decide visibilidad. Ya no es una sutileza de medición: `.doc-papel` es el estilo **de la
  hoja**, y el canvas lo usa en pantalla todo el tiempo. Dentro del media query el canvas se
  quedaría sin él.
- **Los márgenes de `.wp-*` van bajo `.worksheet-print`, no bajo `.doc-papel`.** Un margen
  separa bloques que van uno detrás de otro; en el canvas cada bloque está posicionado, y ahí
  un margen no separa nada: desplaza el bloque respecto de la caja que se mide, y con eso lo
  que se ve deja de caer donde dice su `y`.
- **`#root` es hijo directo de `<body>`.** La regla `body > :not(.worksheet-print)` es un
  selector de hijo directo; con un envoltorio de por medio, la UI no se oculta al imprimir.
- **No envolver en `React.StrictMode`.** El doble montaje de desarrollo dispara dos veces
  los `useEffect` de deep-link: descargaría la planilla dos veces y repetiría el diálogo de
  reemplazo.
- **Un solo scope de mathjs.** Hoja y esquema comparten instancia: las unidades locales
  (`tonf`) y los objetos `Unit` del scope no sobreviven a dos instancias distintas. Por eso
  el punto de entrada de Node es `planilla-engine.ts` y no `worksheet.ts` directamente, y
  por eso `src/lib/diseno/engine.ts` —la entrada de `verify:modulos`— reexporta también el
  motor: compilar el motor y el catálogo como dos bundles daría dos instancias.

- **La región del esquema va la última de la hoja.** No se evalúa, pero participa del orden
  de lectura y captura una instantánea del scope en su posición: esa instantánea es la que
  resuelve los tokens del SVG y la que lee el panel de resultados de un módulo. Emitida
  antes de los cálculos que rotula, el esquema sale con `{{tokens}}` a la vista y
  `verify:planilla` lo rechaza.

- **Un factor de utilización no puede salir negativo.** Donde una demanda se resta de una
  capacidad (`V_sreq := V_ud/phi_v - V_c`), el resultado es negativo cuando no hace falta
  refuerzo, y dividirlo pinta una barra verde con un −0,19 que no significa nada. Acota en
  cero al construir el uso, no al pintarlo.
- **`nombreTex` es la única autoridad sobre nombre → LaTeX.** Los tres caminos que dibujan
  un identificador —el lado izquierdo de una definición, los símbolos de una expresión y los
  nombres de función dentro de `\mathrm{}`— tienen que salir por ella. Cuando cada uno se
  las arreglaba por su cuenta, el corpus acumuló 11 regiones en rojo y unas 250 impresas mal
  en silencio.

  Los segmentos de un nombre se unen con **coma en un único subíndice plano**
  (`A_s_min` → `A_{s,min}`), nunca con `_`: un `_` crudo dentro de un subíndice vuelve a ser
  un subíndice para KaTeX, y con dos ya es un «doble subíndice», que es sintaxis inválida.
  Plano y no anidado también porque no crece en altura, y los cortes de página están
  calibrados al píxel. Y las llaves alrededor no son decorativas: sin ellas, un `\cdot`
  pegado al nombre se lee como el comando inexistente `\cdotM`.

## Planillas

Las de `public/planillas/` son el corpus de prueba y la fuente de verdad de los ejemplos.
El contrato del JSON está en **`docs/ESQUEMA-PLANILLA.md`** (la copia que había en
`public/planillas/` se retiró: divergía). El formato es el mismo `{version, regions}` de
exportar/importar del canvas, más un `meta` cuyo contrato vive en
`src/lib/biblioteca/contrato.ts`: `titulo` obligatorio y, para la biblioteca, `clase`,
`normas` (claves del catálogo del harness), `entradas` (regiones `in_<nombre>`),
`salidas`, `casos`. Toda planilla nueva tiene que pasar `verify:planilla`, que además
valida esa forma.

Tres cosas de la verificación que conviene saber:

- La lógica está en `scripts/lib/planilla.mjs` (`verificarPlanilla`); la CLI, el render
  y `verify:modulos` la comparten. No se reimplementa en ningún otro sitio.
- `--md-out <ruta>` escribe el `.eval.md` con un **sello** en la primera línea (sha256
  de la planilla y commit de este repo). El harness compara ese hash para saber si el
  eval sigue describiendo la planilla que hay en disco.
- `npm run render:planilla -- <json> --pdf <salida>` imprime el mismo papel que el
  canvas (`render-html.ts` emite las clases de `BloqueDoc.tsx`; `papel.css` es la hoja
  de estilos compartida) y se niega si la planilla no verifica.

## Biblioteca

Este repo es la **biblioteca canónica de planillas genéricas** de Struct_Harness, que lo
declara como herramienta hermana en su `_herramientas.json`. Tres clases de hoja:

| Clase | Dónde | Qué es |
|---|---|---|
| `generica` | `public/biblioteca/<disciplina>/<slug>.json` | Hoja reutilizable con entradas `in_<nombre>`, salidas `u_max` · `gobierna` · `v_global`, normas por clave y casos. Cero `c_*`, cero `esperadoFalso` |
| `ejemplo` | `public/planillas/` | Las 33 del blog. Corpus de prueba del motor |
| `instancia` | en los proyectos del harness, nunca aquí | Una genérica con sus entradas reescritas y `meta.origen` (slug, sha256, commit) |

- **La fuente de verdad de una genérica es su JSON**, editado aquí. `npm run
  verify:biblioteca` exige el contrato, evalúa cada caso instanciado y compara sus ✗ con
  igualdad exacta. Los ✗ de un caso se registran corriendo (`--casos-escribir`), no a mano.
- `scripts/indice-planillas.mjs` escribe `public/planillas-indice.json` (todo, para la
  aplicación) y `public/biblioteca-indice.json` (solo genéricas, con su sha256: el harness
  lo lee para instanciar y para detectar que una instancia quedó atrás).
- **Una genérica promovible es un módulo de diseño sin código** (`src/lib/diseno/declarativo.ts`):
  `/diseno/<slug>` arma el formulario del `meta`, evalúa la hoja con `instanciarRegiones`
  —la misma operación que `harness.planilla instanciar`— y exporta una **instancia
  estampada** (`clase`, `origen` con el sha256 del archivo y `VITE_COMMIT`). No se re-colocan
  sus regiones: la memoria exportada es, región por región, la instancia del harness.
  `verify:modulos` los cubre junto a los TS.
- **El harness sella el motor.** Cada commit que toca `src/lib` o `scripts` cambia el hash
  de árbol que su lint (E13) compara; tras el commit, en Struct_Harness:
  `python -m harness.herramientas --sellar struct_flow` y un commit `[harness]`.
- `public/biblioteca/README.md` guarda la doctrina (familia base de columna, fronteras,
  pendientes, incluida la unificación de zapata/losa).
