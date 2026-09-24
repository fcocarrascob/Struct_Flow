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
  pero no las interpreta ni es su dueño. La vista aparte del grafo del harness
  (`/proyecto/<slug>`), con su proxy `/api` hacia `harness.servidor`, **se retiró**: Flow no
  lee nada del harness, y lo que el asistente quiera mostrar va dentro de la obra.

## Flow no escribe en el modelo

**2026-09-23.** Flow **solo lee** SAP2000. Calcula y registra las cargas; el ingeniero las aplica
en el modelo; Flow lee el modelo y verifica que tenga lo que la obra declara. Después viene la
lectura de resultados y de la configuración de diseño, con el mismo criterio.

- **Una verificación independiente vale más que una escritura cómoda.** Si Flow escribiera y
  después leyera, se verificaría a sí mismo. Con el ingeniero aplicando y Flow comparando, un
  error en un camino lo ve el otro. Los errores reales del Pachón son de aplicación, no de
  cálculo: el área de costaneras que no existía (`H-31`), el peso de la hoja de portón en el
  paño equivocado y a un décimo (`H-32`), la etiqueta invertida de `WYN`.
- **Se va el código más riesgoso.** Reemplazar sin borrar a las hermanas, las escrituras a
  medias, el modelo bloqueado, qué modelo es el esperado: todo eso existía porque Flow
  escribía. El puente queda sin ninguna ruta que modifique el modelo.
- **No choca con el harness,** que opera SAP con instancias propias tomadas por PID.
  Engancharse para leer no le cambia nada a nadie.
- **Reparto:** Flow declara y verifica; el ingeniero aplica y firma. Si alguna vez hace falta
  automatizar la escritura, es del asistente (los scripts del harness ya lo hacen), y Flow
  verifica lo que dejó: dos caminos, que es lo que da valor a la verificación.
- **Flow no calcula resultantes.** Quien quiera controlar una la escribe en una variable de la
  obra y la compara a mano.
- **Flow tampoco declara el modelo.** Hubo un tiempo en que la obra decía qué patrones debía
  tener SAP y los comparaba («Flow manda»); se retiró con las cargas. Ahora el modelo es lo
  que es, y la obra lo **justifica**: ver «El modelo se justifica desde la obra».

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

## El grupo es la única forma de organizar la obra

**2026-09-23, rama `grupos-sin-cargas`** (por fusionar). La obra tenía dos formas de agrupar
que competían: la jerarquía de cargas —el nodo «Cargas» → la carga → sus partidas, con plegado
cuando había una sola— y el `Grupo` del usuario, que solo pintaba una franja. Para el motor una
partida ya era un cálculo más; lo que añadía la carga era jerarquía visual y el Load Pattern de
SAP. Las líneas del nodo «Cargas» cruzaban el lienzo, y el grupo de una carga de varias
partidas solo se podía asignar desde una partida.

- **No hay cargas: todo nodo con hoja es un cálculo.** Una obra anterior se migra al leerla
  (`migrarCargas` de `almacen.ts`): cada partida pasa a ser un cálculo con su mismo id y su
  misma hoja, detrás de los que ya había; una carga de una partida le da su nombre, y una de
  varias, su grupo. Las dos obras del Pachón dan los mismos resultados, región por región, que
  en `master`.
- **«Reordenar» arma franjas por grupo** (`colocarPorGrupo` de `layout.ts`): una banda
  horizontal por grupo, en el orden de la lista, y los sin grupo al final. La columna se
  calcula sobre la obra entera, así que una flecha entre grupos sigue yendo a la derecha. No
  se dibuja marco: el grupo ya tiene su canal, la franja de la tarjeta.
- **Un valor que va al modelo vive en el nodo que lo calcula.** Nada de un nodo por patrón, de
  alias (`pw_barl_XP := pw_barl`), de totales R = q·A ni de un «resumen de cargas»: el nodo
  SAP2000 los reemplaza a todos, porque es él quien contrasta cada valor con lo asignado. La
  obra del taller del Pachón pasó de 34 nodos a 11, en seis grupos (sitio, cargas permanentes
  y sobrecargas, viento, elementos secundarios, puente grúa, sismo), sin cambiar un número.

## El modelo se justifica desde la obra

**2026-09-23, rama `grupos-sin-cargas`.** La idea es simple: **usar el valor de una variable de
la obra para justificar un valor asignado en el modelo.** El nodo SAP2000 lee el modelo tal
como está —no lo declara ni lo corrige— y el ingeniero ata cada cosa leída a una expresión de
la obra; Flow dice si coincide.

- **Qué se lee** (`puente-sap/puente.py`, solo lectura, siempre en kN-m-°C): los Load
  Patterns (nombre, tipo, SWF), las cargas asignadas de cada patrón agrupadas por valor
  (distribuidas y puntuales en barras, uniformes en áreas, áreas a barras, fuerzas en nudos,
  temperatura) y el espectro de respuesta (cada caso con su dirección, función, factor de
  escala, amortiguamiento y combinación modal, y los puntos de sus funciones).
- **La justificación es de la obra** (`obra.justificaciones`), no de la lectura: entra en el
  historial y viaja con la carpeta. Encuentra su carga por patrón y firma —todo menos el valor—,
  así que un valor cambiado en SAP no la suelta: la deja en rojo diciendo en cuánto se aparta.
- **La comparación la hace el motor**, con la misma conversión que un campo atado y 0,5 % de
  tolerancia: `q_cub := 10 kgf/m^2` coincide con los 0,0981 kN/m² del modelo. Una función del
  espectro se compara **en todos sus puntos** contra una función que publique la obra
  (`Sa_esp`), no en una muestra.
- **El nodo SAP2000 recibe flechas** de los nodos que definen lo que las justificaciones
  nombran, y se pinta en rojo si algo no coincide. En el Pachón: 21 de 72 justificados; el
  viento, CLV y CLL del modelo de prueba no coinciden con la obra, que es justo lo que el
  ingeniero tiene que revisar.
- **Las unidades en que se muestra el modelo** (kN o tonf) son una elección de la obra
  (`unidadesSap`) y solo de presentación: se lee, se guarda y se compara siempre en kN.

Lo que sigue en esta línea, en orden: los **Load Cases** en una pestaña propia del nodo
SAP2000 (el espectro se mueve ahí, porque es un caso, con su amortiguamiento y su combinación
modal justificables), la **masa sísmica** y las **combinaciones de carga**, que son lo más
importante que falta (etapa 6).

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
  `npm run obras`. Se descartó ampliar `harness.servidor`: Flow no depende del harness, y
  el asistente entra a una obra por `/obras-api` como cualquier otro cliente. La raíz es
  `STRUCTFLOW_OBRAS`, o `./obras/` (ignorada).
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
1. **Los Load Patterns y sus cargas asignadas, justificados desde la obra** — **hecho**
   (2026-09-23, rama `grupos-sin-cargas`): ver «El modelo se justifica desde la obra». Reemplaza
   al camino anterior —la obra declaraba los patrones y la aplicación de cada partida sobre un
   grupo del modelo—, que se retiró con las cargas.
1. **El espectro de respuesta** — **hecho** (2026-09-23): el factor de escala de cada dirección
   y la función, comparada en todos sus puntos.
1. **Los Load Cases, en una pestaña propia del nodo SAP2000** — **siguiente**. El espectro se
   mueve ahí, porque es un caso; se agregan el amortiguamiento y la combinación modal como
   cosas justificables, y los demás casos (estáticos, modal) con sus patrones y factores.
1. **La masa sísmica**: la fuente de masa del modelo (qué patrones y con qué factor; en el
   Pachón, S con 0,5) contra la obra.
2. Leer lo medido (reacciones por caso, periodos, cortes basales) con su sello, y publicarlo
   como nombres que las hojas usan en vez de copiarlos a mano. **Exige un modelo analizado**:
   las tablas de uno sin analizar devuelven ceros, no vacío, y un cero parece un dato.
3. Marcar la lectura atrasada cuando el `.sdb` cambió después de leerla.

### 3. La hoja en flujo lineal

La sección de arriba. Dentro de una obra es más urgente: `MathCanvas` se achica hasta ser un
componente embebible en la pestaña de un nodo, el autoguardado pasa a ser de la obra, y
desaparece el alto estimado de cada bloque que hoy obliga a los generadores a calcularlo.

### 4. Los valores a la vista

La obra muestra relaciones; falta que muestre **números** sin entrar a cada hoja.

- **Bloque tabla** en la hoja: celdas con expresiones y encabezados. Para las tablas de norma
  con interpolación (el `Cp_cub` de la Fig. 3 del CIRSOC 102 es un `program` con `if/else`) y
  para presentar juntos los valores de una familia (las presiones de viento por cara y
  franja). El resumen de lo que va al modelo ya no hace falta: lo hace el nodo SAP2000.
- **Bloque gráfico**: una función o una serie sobre un rango, en SVG, igual en el canvas y en
  el PDF. El caso que lo pide es el espectro Sa(T), que ahora además se compara con el del
  modelo punto a punto: el gráfico mostraría las dos curvas.
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

### 6. Las combinaciones de carga, los casos y el puente con SAP2000

- **Combinaciones — lo más importante que falta.** En el Pachón son 165 y hoy no tienen dónde
  vivir. Siguen el mismo criterio que el resto: se leen del modelo (cada combinación con sus
  casos y factores) y se justifican desde la obra, término por término, contra la norma de
  combinaciones que la obra cita (CIRSOC 301 B.2 en el Pachón). Queda por decidir cómo se
  escribe en la obra una familia de combinaciones —165 filas no se justifican una por una—:
  probablemente una hoja que genera la lista desde las reglas de la norma, y el nodo SAP2000
  la compara entera.
- **Casos**: la pestaña de Load Cases de la etapa 2 (espectro, modal, estáticos) y la masa
  sísmica, con lo que el espectro ya tiene: todo lo leído se justifica con la obra.
- **El puente**: un servicio local en Python (comtypes) al que la aplicación habla por
  `localhost`. **Trae, no empuja** («Flow no escribe en el modelo»): patrones, cargas
  asignadas y espectro ya; casos, masa y combinaciones después, y más tarde reacciones y
  esfuerzos con el sello del modelo. Si el modelo cambió después de verificarlo, la
  verificación se marca atrasada, igual que una instancia cuya genérica avanzó. La API de ETABS
  es casi la misma, así que el puente sirve también para ETABS.

### 7. La navegación cuelga de la obra, y el lanzamiento

| Hoy | Mañana |
|---|---|
| `/` menú | abre la última obra o el índice de obras |
| `/proyectos` | el índice de obras |
| `/obra/<id>` | la aplicación |
| `/canvas` | «abrir la hoja de un nodo», que ya hace la pestaña |
| `/planillas`, `/diseno/<id>` | el panel «agregar a la obra», con búsqueda por disciplina y norma |
| `/proyecto/<slug>` | retirada: es una obra |
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
| Datos (grilla con fuente) | sí | cada fila | etapa 4 |
| Nota o documento (texto, criterio, PDF adjunto) | no | se cita en un informe | por decidir |
| Modelo SAP | no; justifica lo que lee | por ahora nada; después lo medido | existe (patrones, cargas, espectro); etapas 2 y 6 |
| Informe | no | nada: consume y congela | etapa 5 |

Ya no hay nodo de cargas: una carga es un cálculo, o un grupo de ellos («El grupo es la única
forma de organizar la obra»). El orden topológico sigue siendo el orden de lectura; los tipos
que no evalúan solo ocupan su lugar en él. La clase que se dibuja en la tarjeta (cálculo,
biblioteca, resumen, modelo) **se deriva** de esto y no se declara.

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
