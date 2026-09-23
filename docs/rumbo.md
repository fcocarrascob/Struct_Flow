# Rumbo de Struct_Flow

Hacia dónde va la aplicación, qué no se toca y en qué orden se construye. Es **el único
documento de rumbo**: una decisión nueva entra como sección aquí, no como archivo aparte. Lo
abierto que no es rumbo —defectos, deudas, límites conocidos— está en `docs/pendientes.md`.
Lo cerrado vive en el historial de git y en `docs/historial/`.

## La decisión: la obra es la aplicación

**2026-09-22.** La **obra** organiza un proyecto estructural completo: sus cálculos, las
cargas, las notas y los criterios, y más adelante el modelo de SAP2000 y los informes. Todo lo
demás —la hoja suelta, el catálogo, los módulos de diseño— se vuelve una forma de agregar algo
a una obra o de mirar lo que ya tiene.

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

La decisión se puso a prueba el mismo día con un proyecto real, el taller de soldadura de El
Pachón (`docs/pachon/`), y se confirmó: la obra ya lleva un proyecto de punta a punta en lo
que es cálculo. Lo que le falta está en «Lo que enseñó el Pachón», más abajo.

## Flow es la aplicación; el Harness, el asistente que la usa

**2026-09-23.** Son dos repos y siguen siéndolo. Se descarta la decisión anterior de fundir la
obra con el proyecto del harness.

- **Struct_Flow es la GUI del proyecto**, y es determinista: el usuario ve los cálculos,
  organiza las cargas y consulta la información. Es el dueño del documento y el único que
  escribe una obra.
- **Struct_Harness es el asistente estructural**: lleva las decisiones, los criterios y la
  lectura de normas, crea planillas y cargas, y **usa Flow** para proponer cálculos y organizar
  el proyecto.

La dependencia va en un solo sentido: el Harness depende de Flow (biblioteca, motor,
verificadores y ahora la obra), y **Flow funciona entero sin el Harness corriendo**. Lo que
Flow lea de afuera —resultados de SAP, por ejemplo— lo lee por un **formato sellado**, no por
quién lo produjo.

Cómo entra el asistente a una obra:

- **Por el contrato de Flow**, nunca escribiendo archivos por fuera: el servidor de obras con
  su candado y su 409, o una CLI de Flow que aplique el cambio por el mismo camino. El formato
  de la carpeta y `/obras-api` pasan a ser un **contrato público**, con versión y un
  validador que el Harness pueda correr.
- **Propone o escribe directo; las dos cosas.** En un proyecto que arma desde cero puede
  escribir; en uno en curso, lo natural es proponer y que el usuario acepte.
- **Todo nodo que el asistente crea o toca queda marcado «Revisar»**, con una nota breve de
  por qué. La marca la usa también el usuario para señalar supuestos, decisiones pendientes o
  datos por confirmar. Es deliberadamente simple: una marca, una nota corta, quién la puso,
  y un «Revisado» que la quita. No vota en ningún CUMPLE ni toca la evaluación.
- **Las decisiones D-/S-/H- son del Harness.** Flow las muestra o las cita dentro de la obra,
  pero no las interpreta ni es su dueño. Una vista aparte del grafo del harness
  (`/proyecto/<slug>`) deja de tener sentido cuando Flow es la GUI; lo que el asistente quiera
  mostrar va dentro de la obra.

## Lo que no se toca

- **El contrato de las genéricas, los verificadores y la procedencia por sha256.** Hacen la
  biblioteca más exigente de escribir, y son la razón de que sus números se puedan creer.
- **El grafo de cálculo de `obra/evaluacion.ts`:** el orden topológico ES el orden de lectura,
  y las flechas se derivan, no se guardan.
- **Las reglas de la biblioteca:** las hojas de acciones entregan cargas NOMINALES y las de
  diseño combinan; el signo es parte del contrato; los ciclos no existen entre nodos (una
  iteración de diseño vive dentro de su nodo).
- **Cada canal visual del grafo dice una sola cosa:** el borde es la severidad, el ícono la
  clase del nodo, la franja el grupo del usuario y la bandera ⚑ la marca «Revisar». Un canal
  nuevo no reutiliza uno existente.

## La hoja va hacia el flujo lineal

**2026-09-09.** Se descartó el modelo de SMath —posición libre en un plano, bloque impreso en
el sitio exacto—. Se implementó entero y se revirtió, porque desordena las planillas; las
medidas que costó obtener están en `docs/historial/impresion-absoluta-descartada.md`.

Lo decide el corpus: las 8.377 regiones publicadas están en `x = 40`, y 7.471 de los 8.344
saltos verticales miden 48 px. La hoja pasa a ser una **lista ordenada**: `Region` pierde
`x`/`y`, arrastrar reordena, y el orden de lectura es el orden del array. Desaparecen
`solapes.ts`, la anticolisión del punto de inserción y buena parte de `MathCanvas.tsx`. En
`pendientes.md`, lo que muere con este cambio está marcado así y no se arregla antes.

## Las etapas, en orden

El orden sale de las dependencias y de lo que el Pachón mostró que más frena.

### 1. La obra es un archivo, con un solo escritor — hecho

**2026-09-23.** Una obra es una **carpeta**: `obra.json` con el grafo y una hoja por nodo en
`hojas/<nodo>.json`, en el mismo formato que exporta el canvas. Las genéricas siguen
referenciadas por slug y sha256, no copiadas. La salida es determinista (dos espacios, LF),
así que tocar una fórmula cambia un solo archivo en git.

- **El servidor es propio**: `servidor/obras.mjs`, montado en Vite en `/obras-api` y suelto con
  `npm run obras`. Se descartó ampliar `harness.servidor`, que es solo GET a propósito; la
  unificación sigue abierta (abajo). La raíz es `STRUCTFLOW_OBRAS`, o `./obras/` (ignorada).
- **El servidor es tonto**: lee y escribe mapas ruta → texto. Cómo se parte una obra lo decide
  `obra/carpeta.ts`, puro. Lo suyo son dos garantías: **un solo escritor** (candado con
  latido; la segunda pestaña abre en solo lectura) y **nada se pisa sin saberlo** (cada
  escritura dice sobre qué versión se hizo; una carpeta que cambió por fuera es un 409).
- `obra/almacen-disco.ts` da a `CanvasObra` una **sesión** que no le dice dónde guarda.
  `localStorage` queda para las obras sin servidor y como **borrador** de lo que no llegó al
  disco al cerrar la página.
- La obra autocontenida del Pachón es el **caso de regresión** de la carpeta en `verify:obra`:
  la ida y vuelta no cambia un byte ni un resultado.

La idea de fundir la obra con el proyecto del harness quedó descartada: ver «Flow es la
aplicación; el Harness, el asistente que la usa».

### 2. El contrato del asistente, y el nodo Modelo

Primero, lo que deja entrar al asistente: el formato de la carpeta y `/obras-api` con versión
y validador, la marca «Revisar» (hecha), y las propuestas que el usuario acepta.

Después, el nodo Modelo. En la auditoría del Pachón hay **21 valores** de SAP copiados a mano
de dos `.result.json`: reacciones, periodos, cortes basales. Sin sello, si el modelo cambia
nada avisa. Un nodo Modelo publica lo medido con el sello del modelo (hash del `.sdb` y fecha
del análisis).

**Flow habla con SAP2000 por su propio puente** (`puente-sap/`, Python con comtypes, en
`localhost`), no leyendo lo que produce el Harness: un formato que solo el Harness sabe
escribir es depender del Harness aunque se lo llame contrato. Los `.result.json` del Harness
son suyos y Flow no los abre. **Se construye paso a paso**, probándolo en el trabajo diario
antes de dar el siguiente:

1. Conectarse al SAP2000 abierto y mostrar el nombre del modelo — **hecho** (2026-09-23).
   Solo se engancha y lee: no lanza SAP, no guarda ni analiza, y se niega con dos instancias.
1. **Las cargas son Load Patterns, y Flow manda** — primer paso **hecho** (2026-09-23): cada
   carga lleva su tipo SAP y su multiplicador de peso propio, y el nodo SAP2000 lee los patrones
   del modelo y dice en qué se aparta de la obra (igual, difiere, sin definir, falta en SAP,
   solo en SAP), más el peso propio en ninguna o en dos cargas. Un patrón no tiene valor: los
   valores van en los objetos, y eso es otro paso. **Traer de SAP** también está hecho: la
   comparación crea en la obra las cargas que solo están en el modelo y adopta el patrón de las
   que Flow no definía, sin pisar nunca uno que Flow ya define. **Empujar a SAP** también: crea
   los patrones que faltan (con su caso estático, salvo que ya haya un caso con ese nombre) y
   ajusta tipo y peso propio de los que difieren, tras mostrar la lista exacta y confirmarla.
   Nunca borra ni guarda, y se niega si el modelo abierto no es el comparado o está bloqueado.
   Es lo primero que Flow escribe en un modelo.
2. Leer lo medido (reacciones por caso, periodos, cortes basales) con su sello, y publicarlo
   como nombres que las hojas usan en vez de copiarlos a mano.
3. Marcar la lectura atrasada cuando el `.sdb` cambió después de leerla.

### 3. La hoja en flujo lineal

La sección de arriba. Dentro de una obra es más urgente: `MathCanvas` se achica hasta ser un
componente embebible en la pestaña de un nodo, el autoguardado pasa a ser de la obra, y
desaparece el alto estimado de cada bloque que hoy obliga a los generadores a calcularlo.

### 4. Los valores a la vista

La obra muestra relaciones; falta que muestre **números** sin entrar a cada hoja.

- **Bloque tabla** en la hoja: celdas con expresiones y encabezados. Para el resumen de lo
  que va al modelo (en el Pachón son 55 líneas `x = unidad`) y para las tablas de norma con
  interpolación (el `Cp_cub` de la Fig. 3 del CIRSOC 102 es un `program` con `if/else`).
- **Bloque gráfico**: una función o una serie sobre un rango, en SVG, igual en el canvas y en
  el PDF. El caso que lo pide es el espectro Sa(T).
- **Valores en la tarjeta**: la tarjeta del grafo se expande con lo que el nodo publica.
- **Nodo Datos**: una grilla nombre · valor · unidad · fuente que por dentro genera
  `x := valor`. Los supuestos y datos de entrada de una obra, con su cita en una columna.

La tabla y el gráfico son regiones nuevas: tocan `src/lib`, `render-html.ts` y
`verify:motor`, y obligan a resellar. La tarjeta y el nodo Datos no tocan el motor.

### 5. El informe

Un consumidor más del grafo, con dos estados: el **borrador vivo**, que muestra los valores
actuales y dice qué cambió, y la **revisión emitida** (Rev. A, B, 0), que congela valores,
shas y sellos y nunca cambia sola.

- Se escribe en bloques propios: texto con **valores citados** por token
  (`{{R_CM:kN}}`, el mismo mecanismo `{{expr:unidad}}` de `esquema.ts`, con la unidad
  comprobada por el motor), tablas, figuras, y las memorias de las instancias como anexos.
- **Plantillas por cliente**: carátula, codificación, tabla de revisiones y firmas.
- El PDF sale del documento de impresión de hoy; un Word como salida, nunca como fuente.

### 6. La carga aplicada, las combinaciones y el puente con SAP2000

- **La aplicación de una carga** —tipo SAP del patrón, objetos, dirección, patrón o caso—
  entra como bloque estructurado de la partida. Va antes que las combinaciones: es lo que deja
  escribir una combinación que se pueda empujar al modelo.
- **Combinaciones**: un módulo que cita las cargas por su nombre, que ya es su identificador.
  En el Pachón son 165 y hoy no tienen dónde vivir.
- **El puente**: un servicio local en Python (comtypes) al que la aplicación habla por
  `localhost`. Empuja estados de carga, función de espectro y factores; trae reacciones y
  esfuerzos con el sello del modelo. Si el modelo cambió después de empujar, la carga
  aplicada se marca atrasada, igual que una instancia cuya genérica avanzó. La API de ETABS es
  casi la misma, así que el puente sirve también para ETABS.

### 7. La navegación cuelga de la obra, y el lanzamiento

| Hoy | Mañana |
|---|---|
| `/` menú | abre la última obra o el índice de obras |
| `/proyectos` | el índice de obras |
| `/obra/<id>` | la aplicación |
| `/canvas` | «abrir la hoja de un nodo», que ya hace la pestaña |
| `/planillas`, `/diseno/<id>` | el panel «agregar a la obra», con búsqueda por disciplina y norma |
| `/proyecto/<slug>` | desaparece: es una obra |
| catálogo del blog | ejemplos de solo lectura |
| `/calibrar` | sigue, solo en desarrollo |

Las rutas antiguas se reescriben en `main.tsx` antes del primer render.

**El lanzamiento es local-first, no un SaaS puro.** El cálculo ya corre entero en el
navegador; el servidor solo guarda y comparte. Tres razones: los proyectos de clientes
mineros no se suben a la nube de un tercero sin contrato, y una carpeta local versionable se
vende mejor; SAP2000 exige algo corriendo en el equipo del usuario de todos modos; y es más
barato de operar. Lo mínimo para lanzar: las etapas 1 a 5, cuentas y sincronización
opcionales, el bundle dividido (hoy pesa 1,6 MB) y un descargo de responsabilidad claro —la
herramienta comprueba aritmética y unidades; la firma sigue siendo del ingeniero—.

El diferencial frente a Mathcad, SMath y ClearCalcs es la **biblioteca con citas por
artículo** en normativa chilena y argentina, que ningún producto grande cubre bien. Las citas
y las actas de lectura se pueden distribuir; los PDF de norma, no.

## Los tipos de nodo

Hoy un nodo lleva una hoja (`hoja: Region[]`) con `frontera?` opcional: sin frontera comparte
el scope de la obra; con frontera tiene scope propio y procedencia (`biblioteca`, `propia` o
`derivada`). Hacia adelante:

| Tipo | Evalúa | Publica | Estado |
|---|---|---|---|
| Cálculo (hoja libre o genérica instanciada) | sí | sus salidas | existe |
| Cargas | no | el catálogo de la obra | existe como paneles |
| Datos (grilla con fuente) | sí | cada fila | etapa 4 |
| Nota o documento (texto, criterio, PDF adjunto) | no | se cita en un informe | por decidir |
| Modelo SAP | no | lo que se lee del modelo | etapas 2 y 6 |
| Informe | no | nada: consume y congela | etapa 5 |

El orden topológico sigue siendo el orden de lectura; los tipos que no evalúan solo ocupan su
lugar en él. La clase que se dibuja en la tarjeta (carga, cálculo, biblioteca, resumen) **se
deriva** de esto y no se declara.

## Lo que enseñó el Pachón

El estudio completo y los 12 hallazgos para el harness están en `docs/pachon/auditoria/`.
Los límites de la obra que encontró, además de los que ya tienen etapa (1, 2, 4 y 6):

- **Faltan la nota y la verificación como nodos.** Un nodo de contraste publica todos sus
  nombres aunque no alimente a nadie (el de `CM` metió 17 al scope y hubo que renombrar
  `C_a`); a un nodo de biblioteca no se le puede agregar una nota; y las decisiones,
  supuestos y hallazgos del harness (`D-`, `S-`, `H-`) solo se citan como texto.
- **Criterios compartidos entre obras.** Soldadura toma de neumáticos el S-19, el D-24 y la
  nomenclatura de cargas. Hoy eso es copiar el número; hace falta un lugar común de criterios
  del cliente, con el mismo sello que una genérica.
- **La biblioteca argentina está vacía.** Nieve CIRSOC 104, viento de componentes 102,
  espectro 103, costaneras AISC y las cargas de grúa del 4.14 ya están escritas, contrastadas
  y citadas en la obra: son las candidatas naturales a genéricas. La costanera, además, está
  escrita dos veces (techo y muro).

## Lo que se simplifica de paso

- **Un solo tipo de módulo de diseño: la genérica declarativa.** Los módulos en TypeScript no
  se escriben más; los existentes se migran a genéricas o se congelan.
- **Las entradas de una genérica se escriben una vez.** Hoy viven en la región `in_*` y en
  `meta.entradas`, con la unidad repetida; derivar una de otra quita una fuente de errores a
  quien escribe la biblioteca, que es el cuello de botella de la suite.
- **Nombres y unidades.** Una variable no puede llamarse `h`, `B`, `L`, `V`, `A`, `g`, `s` ni
  `m`, que son unidades y a la vez los símbolos más comunes en estructuras. SMath lo resuelve
  separando los espacios de nombres. Toca el motor —y obliga a resellar—, pero es la primera
  fricción que nota quien viene de SMath o Mathcad.

## Riesgos

- **El alcance.** Un editor de flujos genérico tipo n8n es un producto en sí mismo. La fuerza
  está en que los nodos sean cálculos estructurales con contrato, no automatizaciones
  arbitrarias; el dominio se mantiene acotado.
- **La biblioteca es el cuello de botella.** El valor de la obra crece con el número de
  genéricas verificadas, y cada una cuesta leer la norma, escribir los casos y pasar los
  verificadores. Hoy son 10.
- **El rendimiento del motor.** La obra se reevalúa entera en cada cambio (98 ms con 35
  nodos); con cientos hará falta evaluación incremental.
- **SAP2000 es COM, Windows y local.** El enlace necesita un puente local y es frágil ante
  cambios del modelo; el sello es lo que lo hace confiable.
- **Lo no técnico.** La responsabilidad profesional sobre resultados automatizados, y que los
  PDF de norma no se distribuyen: las actas de lectura y las citas sí.
