# La obra como centro de la aplicación

**2026-09-22.** Decisión de rumbo, sin código todavía. Se escribe antes porque ordena todo
lo que viene: qué se construye primero, qué se retira y qué no se toca.

## La decisión

La **obra** pasa a ser la aplicación. Organiza un proyecto estructural completo: sus
cálculos, las cargas, las notas y los criterios, y más adelante el modelo de SAP2000 y los
informes. Todo lo demás —la hoja suelta, el catálogo, los módulos de diseño— se vuelve una
forma de agregar algo a una obra o de mirar lo que ya tiene.

El flujo que la justifica, con la biblioteca que ya existe:

```
viento-cyr  ──p_cos_suc──►  costaneras (AISI S100, por escribir)  ──peso propio──►  modelo SAP (D)
viento-caras ──WXP…WPIN──────────────────────────────────────────────────────────►  modelo SAP (W)
espectro    ──función y factor de escala──────────────────────────────────────────►  modelo SAP (E)
modelo SAP  ──reacciones──►  placa base · pedestal · zapata
todo lo anterior ──valores citados──►  informe (Rev. A, B, 0…)
```

Cada hoja responde una pregunta y la conexión es solo el valor que pasa. Eso es lo que hace
auditable la memoria y lo que permite saber qué quedó atrás cuando algo cambia aguas arriba.

## Lo que no se toca

- **El contrato de las genéricas, los verificadores y la procedencia por sha256.** Hacen la
  biblioteca más exigente de escribir, y son la razón de que sus números se puedan creer.
- **El grafo de cálculo de `obra/evaluacion.ts`:** el orden topológico ES el orden de lectura,
  y las flechas se derivan, no se guardan.
- **Las reglas de la biblioteca:** las hojas de acciones entregan cargas NOMINALES y las de
  diseño combinan; el signo es parte del contrato; los ciclos no existen entre nodos (una
  iteración de diseño vive dentro de su nodo).

## Las etapas, en orden de dependencia

### 1. La obra es un archivo, no `localStorage`

Es el requisito de todo lo demás: hoy una obra se pierde con el navegador, no tiene versiones
y no se comparte.

- Una obra es una **carpeta de proyecto**: un `obra.json` con el grafo, un archivo por hoja de
  nodo y las instancias de genéricas con su sha, todo en JSON legible y versionable en git.
- `obra/almacen.ts` pasa a ser una capa de almacenamiento con dos implementaciones: archivos,
  por un servidor local, y `localStorage` solo como borrador sin guardar. Sigue saneando al
  leer y nunca al escribir.
- **La decisión grande: una obra y un proyecto del harness son lo mismo.** Hoy hay dos
  mundos —la obra en el navegador y el proyecto del harness en disco— con dos lienzos que solo
  comparten `contrato.ts` y `layout.ts`. La obra pasa a SER la carpeta del proyecto, y el
  harness la lee en vez de proyectar un grafo propio. `/proyecto/<slug>` desaparece.

Pregunta abierta: si el servidor local es `harness.servidor` o uno propio de Struct_Flow. El
enlace con SAP (etapa 5) necesita el mismo puente, porque SAP2000 es COM y solo local.

### 2. La hoja en flujo lineal

Ya decidido en `CLAUDE.md` («Hacia dónde va la hoja») y todavía no hecho. Dentro de una obra
es más urgente: una hoja con posición libre dentro de un nodo es complejidad que no aporta.
Se van `x`/`y`, `solapes.ts`, la anticolisión y las dos cajas anidadas de cada región, y
`MathCanvas` se achica hasta ser un componente embebible en la pestaña de un nodo. El
autoguardado pasa a ser de la obra, no de la clave global `structpad.worksheet.v1`.

### 3. La navegación cuelga de la obra

| Hoy | Mañana |
|---|---|
| `/` menú | abre la última obra o el índice de obras |
| `/proyectos` | el índice de obras |
| `/obra/<id>` | la aplicación |
| `/canvas` | «abrir la hoja de un nodo», que ya hace la pestaña de cálculo |
| `/planillas`, `/diseno/<id>` | el panel «agregar a la obra», con búsqueda por disciplina y norma |
| `/proyecto/<slug>` | desaparece: es una obra |
| catálogo del blog | ejemplos de solo lectura |
| `/calibrar` | sigue, solo en desarrollo |

Las rutas antiguas se reescriben en `main.tsx` antes del primer render, como ya se hace con
`/?planilla=…`, para no romper enlaces.

### 4. El caso vertical, en disco

Antes de generalizar nada, el **galpón simulado de punta a punta** como una obra en archivos:
el espectro, el viento por caras y los componentes y revestimiento encadenados, con sus
entradas comunes atadas. `verify:obra` se extiende a obras en disco y ese galpón queda
versionado como la prueba de regresión de la capa de obra, igual que las 33 planillas lo son
del motor. Si el flujo se traba, se traba aquí, con un solo caso, y no con cinco a medio hacer.

### 5. El nodo SAP y, después, el informe

Ambos dependen de lo mismo: **la procedencia de cada valor publicado** —qué nodo lo publica,
de qué instancia (sha) o de qué modelo (sello)—. Conviene diseñarla en la etapa 1 aunque se
use aquí.

- **Nodo SAP.** Un `.sdb` con su sello. Hacia el modelo: los estados de viento, la función de
  espectro y el peso propio, cada patrón marcado con la instancia de la que salió. Desde el
  modelo: reacciones y combinaciones, hacia las hojas de conexiones y fundaciones. Si el
  modelo cambió después de empujar, la carga aplicada se marca atrasada, igual que una
  instancia cuya genérica avanzó.
- **Informe.** Un consumidor más del grafo, con dos estados: el **borrador vivo**, que muestra
  los valores actuales y dice qué cambió, y la **revisión emitida** (Rev. A, B, 0), que
  congela valores, shas y sellos y nunca cambia sola. Se escribe en bloques propios —texto,
  valores citados, tablas, figuras y las memorias de las instancias como anexos— y de ahí sale
  el PDF, con el mismo documento de impresión de hoy, y un Word como salida, nunca como fuente.
  Plantillas por cliente: bloque de título, codificación, tabla de revisiones y firma.

## Los tipos de nodo

Hoy un nodo lleva una hoja (`hoja: Region[]`) con `frontera?` opcional: sin frontera comparte
el scope de la obra, con frontera tiene scope propio y procedencia (ver
`docs/pestanas-de-calculo.md`). Hacia adelante el tipo se declara:

| Tipo | Evalúa | Publica | Estado |
|---|---|---|---|
| Cálculo (hoja libre o genérica instanciada) | sí | sus salidas | existe |
| Cargas | no | el catálogo de la obra | existe como paneles |
| Nota o documento (texto, criterio, PDF adjunto) | no | se cita en un informe | nuevo |
| Modelo SAP | no | lo que se lee del modelo | etapa 5 |
| Informe | no | nada: consume y congela | etapa 5 |

El orden topológico sigue siendo el orden de lectura; los tipos que no evalúan solo ocupan su
lugar en él.

## Lo que se simplifica de paso

- **Un solo tipo de módulo de diseño: la genérica declarativa.** Los módulos en TypeScript no
  se escriben más; los existentes se migran a genéricas o se congelan.
- **Las entradas de una genérica se escriben una vez.** Hoy viven en la región `in_*` y en
  `meta.entradas`, con la unidad repetida; derivar una de otra quita una fuente de errores a
  quien escribe la biblioteca, que es el cuello de botella de la suite.
- **La memoria se lee como memoria.** Una tabla de norma se imprime como `program` con
  `if/else if`, y una serie de más de 12 valores como «matriz 10×7». Un modo de impresión
  «tabla» con encabezados la haría legible para el cliente sin tocar el cálculo.
- **Nombres y unidades.** Una variable no puede llamarse `h`, `B`, `L`, `V`, `A`, `g`, `s` ni
  `m`, que son unidades y a la vez los símbolos más comunes en estructuras. SMath lo resuelve
  separando los espacios de nombres. Toca el motor —y obliga a resellar—, pero es la primera
  fricción que nota quien viene de SMath o Mathcad.

## Propuestas tras la obra autocontenida

**2026-09-22.** La obra autocontenida del Pachón (`docs/obra-pachon/`, 35 nodos) se revisó en
el navegador. Lo que se arregló en ese momento es la lectura del grafo, que no toca el motor:
la clase de cada nodo (carga, cálculo, biblioteca, resumen) con su ícono, grupos de color
libres, el trazo del nodo enfocado por encima de las tarjetas, las etiquetas de las flechas
solo de cerca o en el trazo, y pestañas con límites.

Quedó fuera, a propósito, lo que muestra **valores** en vez de relaciones:

- **Bloque tabla en la hoja.** Celdas con expresiones y encabezados. Sirve para dos cosas
  que hoy se escriben mal: el resumen de lo que va al modelo (en el Pachón son 55 líneas
  `x = unidad` seguidas) y las tablas de norma con interpolación (el `Cp_cub` de la Fig. 3
  del CIRSOC 102 es un `program` con `if/else`). Es una región nueva: toca `src/lib`,
  `render-html.ts`, `verify:motor` y obliga a resellar.
- **Valores en la tarjeta y nodo Datos.** La tarjeta se expande con lo que el nodo publica,
  con su valor y su unidad, sin abrir la hoja. Un nodo Datos es una grilla de
  nombre · valor · unidad · fuente que por dentro genera `x := valor`: los supuestos y los
  datos de entrada de una obra, con su cita en una columna. No toca el motor.
- **Bloque gráfico.** Una función o una serie sobre un rango, dibujada en SVG, igual en el
  canvas y en el PDF. El caso que lo pide es el espectro Sa(T) de la hoja del CIRSOC 103.
  Toca `src/lib` como la tabla.

## Riesgos

- **El alcance.** Un editor de flujos genérico tipo n8n es un producto en sí mismo. La fuerza
  está en que los nodos sean cálculos estructurales con contrato, no automatizaciones
  arbitrarias; el dominio se mantiene acotado.
- **La biblioteca es el cuello de botella.** El valor de la obra crece con el número de
  genéricas verificadas, y cada una cuesta leer la norma, escribir los casos y pasar los
  verificadores. Hoy son 10.
- **El rendimiento del motor.** La obra se reevalúa entera en cada cambio; con decenas de
  nodos y hojas de 300 regiones hará falta evaluación incremental.
- **SAP2000 es COM, Windows y local.** El enlace necesita un puente local y es frágil ante
  cambios del modelo; el sello es lo que lo hace confiable.
- **Lo no técnico.** La responsabilidad profesional sobre resultados automatizados, y que los
  PDF de norma no se distribuyen: las actas de lectura y las citas sí.
