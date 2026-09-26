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

**2026-09-23, rama `grupos-sin-cargas`**, fusionada en `master` el 2026-09-24 tras probarla
con el Pachón. La obra tenía dos formas de agrupar
que competían: la jerarquía de cargas —el nodo «Cargas» → la carga → sus partidas, con plegado
cuando había una sola— y el `Grupo` del usuario, que solo pintaba una franja. Para el motor una
partida ya era un cálculo más; lo que añadía la carga era jerarquía visual y el Load Pattern de
SAP. Las líneas del nodo «Cargas» cruzaban el lienzo, y el grupo de una carga de varias
partidas solo se podía asignar desde una partida.

- **No hay cargas: todo nodo con hoja es un cálculo.** Una obra anterior se migra al leerla
  (`migrarCargas` de `almacen.ts`): cada partida pasa a ser un cálculo con su mismo id y su
  misma hoja, detrás de los que ya había; una carga de una partida le da su nombre, y una de
  varias, su grupo. Las dos obras del Pachón dan los mismos resultados, región por región, que
  antes del cambio.
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
  temperatura), el espectro de respuesta (cada caso con su dirección, función, factor de
  escala, amortiguamiento y combinación modal, y los puntos de sus funciones), todos los Load
  Cases (`/casos`: tipo, estado del análisis, los patrones y factores de un estático, los modos
  de un modal), las fuentes de masa (`/masa`) y un resumen del modelo (`/resumen`).
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

**2026-09-25: el nodo va en pestañas.** Con todo en una columna el panel ya no se podía leer.
La conexión queda arriba, siempre a la vista, con un solo «Leer del modelo» que lo lee todo;
debajo van cuatro pestañas de lectura, cada una con su cuenta de justificados y un punto si
algo no coincide:

- **Resumen**: nudos, barras, áreas y links; los grupos con sus barras y áreas; materiales y
  secciones; patrones, casos y combinaciones; si el modelo está analizado; y cómo va cada
  pestaña. Sirve para ver de un vistazo que el modelo leído es el que se cree.
- **Load Patterns**: lo de antes, las cargas asignadas.
- **Load Cases**: todos los casos, con tipo y estado del análisis. El espectro vive aquí porque
  **es** un caso.
- **Masa sísmica**: cada fuente de masa, qué toma (elementos, masas, cargas) y con qué factor.

**Qué se justifica y qué solo se muestra.** Se justifica lo que es un número de norma: el
factor de escala, la función y el **amortiguamiento** de un espectro, y los factores **distintos
de 1** de un caso estático (`EV` = 0,185 × cada patrón de peso) y de la masa (S × 0,5). Un 1 es
el patrón tal cual y no pide nada. La combinación modal y el caso modal solo se muestran:
son una elección, no un número que la obra calcule. La regla vive en `esJustificable` y
`resumirPorParte` de `sap-cargas.ts`; la usan el panel y la tarjeta, así que no pueden
discrepar.

**2026-09-25: lo demás cuelga del SAP2000 como sub-nodos.** El nodo SAP2000 queda como la vista
**pre-análisis** del modelo y no crece más. Cada tema nuevo es un sub-nodo en el grafo, unido a él
por una arista punteada (`deriva`, sin datos), y se construye de a uno: se usa en el Pachón y se
afina antes de pasar al siguiente. La receta es siempre la misma:
- un `Modulo` (`sap-combinaciones`…), que se sanea y sin el SAP2000 se descarta;
- un id `sap:<tema>`;
- su lectura dentro de `obra.sap`, fuera del historial como las demás;
- una ruta del puente;
- un panel lateral con su propio «Leer».

Quitar un sub-nodo **no borra su lectura**: el historial nunca restaura lecturas, y Ctrl+Z tiene
que devolverlo con sus datos.

- **Combinaciones** (`sap:combinaciones`), el primero. El panel resume:
  - cuántas hay por tipo;
  - las familias (el prefijo hasta el primer «_»);
  - las anidadas;
  - los **casos que no entran en ninguna combinación**. Separa los que están cubiertos porque sus
    patrones entran por otro caso (`DEAD` por `CM`) de los que de verdad quedan fuera.

  **La familia es una convención de nombres, no una inferencia**: es el texto antes del primer
  «_» (`B25_EX_EVP` es de `B25`). Se decidió así y no con heurísticas —cortar en otros
  separadores, agrupar por los casos que usa cada combinación— para que haya un estándar de
  trabajo con Flow que se ve y se aplica al nombrar en SAP2000. El panel lo explica con un
  ejemplo, y avisa cuando la mayoría de las familias tiene una sola combinación (`COMB1`,
  `COMB2`…): ese modelo no sigue la convención. Si aparece un modelo real donde no alcance, la
  alternativa es agrupar por estructura o elegir el criterio en la tabla.

  La matriz completa —una fila por combinación, una columna por caso o combinación anidada, el
  factor en la celda— se abre como una pestaña de la obra. Se filtra por familia, por tipo, por
  nombre y por columna («¿dónde entra RSX?»), y salta de una anidada a su fila. Todavía no se
  justifica nada: el nodo queda listo para recibir la flecha de la hoja que las genere desde la
  norma (etapa 6).

- **Modal** (`sap:modal`), el primer nodo de **resultados**. Lee periodos y masas participantes
  de un caso modal **analizado**; si no lo está, el puente responde 409, porque un modelo sin
  analizar da ceros y un cero parece un dato.
  - Muestra el periodo fundamental y el modo dominante en X y en Y.
  - Muestra la masa acumulada por dirección y con qué modo llega al 90 %. Menos del 90 % en X o
    en Y es un aviso, no una verificación con cláusula.
  - Lleva la tabla de modos.
  - El puente deja la selección de salida de SAP como estaba (`_SalidaSolo`), igual que las
    unidades.
  - **Una lectura de resultados lleva sello**: la fecha del `.sdb` al leerla. Si la última
    conexión —o la última lectura— ve un `.sdb` más nuevo, u otro modelo, la lectura está
    **atrasada** y el nodo pasa a aviso. Así queda cerrado el paso «marcar la lectura
    atrasada» para lo que tiene sello.
  - **Publica `T_x` y `T_y`** (2026-09-25): el periodo del modo dominante en cada dirección,
    en segundos, como nombres de la obra. Una hoja escribe `T_y` en vez de copiar 0,715 s, y
    la flecha Modal → hoja sale sola. Es el primer **nodo de resultados** de `evaluacion.ts`:
    un nodo sin hoja que define nombres (entran en los choques como cualquier otro), no usa
    ninguno, y en la cadena escribe sus valores como `Unit` con su región fantasma para el
    autocompletado, igual que una planilla con frontera. Va **primero** en el orden de
    creación, para que toda hoja lo vea sin haberlo nombrado. Sin masas no publica nada; una
    lectura atrasada sigue publicando, porque el nodo ya está en aviso y retirar el valor
    pondría en rojo todo lo de aguas abajo. Quitar el nodo avisa qué hojas se quedan sin qué.

- **Reacción basal** (`sap:basal`): la resultante en la base de cada caso analizado (sin el
  modal; las combinaciones, más adelante), con el mismo sello. Lo que se revisa:
  - el **corte basal de cada caso sísmico**, en su dirección. Son sísmicos los de espectro
    (U1 es X, U2 es Y) y los estáticos que cargan una aceleración horizontal (UX, UY), el
    método estático equivalente;
  - que un caso **solo gravitacional** —sus patrones son `Dead`, `Live`, `Rooflive`, `Snow`…—
    no tenga reacción horizontal de más del 1 % de la vertical, que suele ser una carga con la
    dirección equivocada.

  La tarjeta dice Vx y Vy, una línea por dirección. No se calcula el peso sísmico W ni V/W: desde
  la reacción de cada caso podría contar dos veces el peso propio, según la fuente de masa, y un
  número dudoso ahí es peor que ninguno.

- **Reacciones en apoyos** (`sap:apoyos`), para placas base, pedestales y fundaciones. Son
  apoyos los nudos restringidos o con resorte, y cualquiera con reacción en algún caso (un link
  a tierra). **Paso 1, hecho: por caso.**
  - El panel muestra, por caso, qué apoyo se lleva la mayor compresión, tracción, corte y
    momento.
  - La tabla ancha muestra todos los apoyos de un caso, con ubicación, las seis componentes y V.
    Se ordena por columna y la suma de F3 queda al pie.
  - **El signo de F3 se dice con palabras**: positiva es compresión sobre la fundación, negativa
    es tracción.
  - Un espectro da máximos sin signo y no se le atribuye tracción.
  - Si la basal está leída, la suma de F3 de cada caso estático tiene que ser su FZ. Si no lo
    es, falta un apoyo en la lectura, y el nodo avisa.

  **Paso 2, hecho: conjuntos de diseño.** El ingeniero arma conjuntos con nombre a partir de
  las **familias** de combinaciones («Hormigón (LRFD)» = B21…B27, «Estabilidad» = SERV…).
  - Para cada apoyo, Flow da la combinación que gobierna la compresión, la tracción, el corte y
    el momento, con los valores que la acompañan en esa misma combinación (V y M con la N, N
    con el V…).
  - **Lo no concurrente se marca con ≠, no se esconde.** Una combinación con espectro o
    envolvente da `Max` y `Min` por componente. La compresión sale del `Max` de F3 y la
    tracción del `Min`. El corte y el momento salen de los extremos de cada componente, y su
    vector no es de un mismo instante.
  - Los conjuntos (`obra.conjuntosDiseno`) son decisión del ingeniero: van en la obra, con
    historial, y viajan en una copia, porque nombran familias y no el modelo.
  - Su lectura (`sap.conjuntos`) se guarda resumida, sin las filas crudas, y se marca
    desactualizada si cambian las familias o el modelo.
  - Las combinaciones se leen desde el mismo panel si no estaban leídas; es la misma lectura
    que usa el sub-nodo Combinaciones.

  **Paso 3a, hecho: tipos de apoyo por grupo de SAP.** Nadie diseña 25 placas: se diseña una por
  tipo, y el tipo lo dice cómo el ingeniero organizó el modelo. Un apoyo es del grupo al que
  está **asignado**. Si no está asignado a ninguno, es del grupo cuyas **barras** llegan a él.
  Así, un grupo de diagonales no se lleva la base de una columna. Los apoyos sin grupo quedan
  a la vista, con aviso, y el grupo `ALL` no cuenta.
  - El panel muestra los tipos y qué grupo cede qué apoyos.
  - Cada conjunto muestra su envolvente por tipo.
  - La tabla agrupa las filas por tipo, con la envolvente en la cabecera y el apoyo que gobierna
    resaltado dentro de su tipo.

  **Paso 3b, hecho: las gobernantes se publican** (2026-09-25) por tipo y conjunto, como
  nombres de la obra que la hoja de placa base usa: `<magnitud>_<criterio>_<tipo>_<conjunto>`.
  - `N_c_CP_LRFD` es la N de la combinación que gobierna la **c**ompresión del tipo CP en el
    conjunto LRFD. Los criterios son `c`, `t` (tracción), `v` (corte) y `m` (momento), y de
    cada uno salen N (positiva compresión, negativa tracción), V y M de esa misma combinación:
    12 nombres por tipo y conjunto, en kN y kN·m.
  - `nc_<criterio>_…` vale 1 si esa combinación **no es concurrente**. Los nombres no cambian
    por eso —renombrar en una relectura rompería las hojas—: la hoja que necesita concurrencia
    lo verifica, y la marca queda en la memoria.
  - El **alias del tipo** lo elige el ingeniero por grupo de SAP (`obra.aliasTipos`, con
    historial); por defecto, las iniciales (`COL_PPALES` → `CP`). El del **conjunto** va
    siempre, aunque haya uno solo, para que agregar otro no renombre nada; por defecto sale del
    nombre. Letras y números, sin «_». Un alias repetido o inválido no publica, y el panel lo
    dice.
  - Un criterio sin gobernante (nada tracciona) no publica: no se inventa un cero. Tampoco los
    apoyos sin grupo, ni un conjunto leído con otras familias.
  - **El criterio `e`, excentricidad** (2026-09-25): la combinación de mayor M/N con compresión.
    Es la que tracciona los pernos aunque nada arranque la placa, y no es la del momento
    máximo: una N chica con un M menor da más. En una combinación no concurrente se toma la
    compresión **menor** de su Max y su Min con el M de los extremos, que es lo que agranda e;
    si alguno de los dos no comprime, eso lo cubre la tracción. Publica `N_e`, `V_e`, `M_e` y
    `nc_e`, no la e: la hoja la saca con `e := M_e / N_e`. En el modelo de prueba, COL_PPALES
    da e = 3,50 m con B22_Lr (N = 10,3 tonf), no con la combinación del momento máximo. Una
    lectura anterior al criterio se marca desactualizada: su «—» diría que nada comprime con
    momento.

Lo que sigue en esta línea, de a uno:
- ~~el mecanismo para que un nodo sin hoja publique nombres~~ — hecho, con `T_x` y `T_y` del
  modal;
- ~~que los apoyos publiquen las gobernantes por tipo y conjunto~~ — hecho; sigue la hoja de
  placa base del Pachón que las usa, y después la basal (Vx, Vy);
- los esfuerzos, con el mismo patrón;
- la **justificación de las combinaciones** (etapa 6).

## Una obra parte de otra

**2026-09-24.** Una segunda estructura del mismo proyecto, o una con cargas parecidas, no
empieza de cero: se recicla lo que ya cierra. Dos gestos sobre una misma capa pura
(`obra/copia.ts`, cubierta por `verify:obra`):

- **«Nueva obra a partir de esta»** (⧉ en la ficha del índice): una obra nueva con los nodos
  elegidos de otra, todos marcados de partida; lo que sobra se quita por grupo. Conserva los
  ids, así que las posiciones del lienzo se copian tal cual.
- **«De otra obra…»** (en «+ agregar nodo»): copia nodos a la obra abierta, al final y en el
  orden del origen, que es el de creación con el que desempata el orden topológico. Un id que
  choca se renombra, un grupo con el mismo nombre se reutiliza y Ctrl+Z lo retira entero.

Lo que la selección usa entra solo (`dependenciasDe`, estático: lee `publica` y `formulas`
del documento, sin descargar genéricas), rotulado con quién lo necesita, salvo que el destino
ya defina ese nombre: traer la grúa a una obra con su geometría no arrastra otra geometría.
Antes de confirmar se avisa de los nombres que quedarían definidos dos veces.

**Se copian** hojas, fronteras (slug y sello, entradas, campos atados, publicaciones), grupos,
posiciones y marcas ⚑: un supuesto por confirmar lo sigue estando en la copia. **No se
copian** la lectura de SAP2000 ni las justificaciones, porque hablan del modelo de la
estructura de origen; el nodo SAP2000 se conserva vacío, con las unidades de la obra.

## La base de columna como modelo geométrico, y sus componentes

**2026-09-25.** La base de COL_PPALES del Pachón cierra como cálculo —placa, silla, anclaje
dúctil, llave y pedestal, con la capacidad del §D2.6 de AISC 341—, pero su **geometría está
declarada y no derivada**: las barras del pedestal que cuentan como armadura de anclaje se
escribieron a mano, la silla y el β de la placa están «a confirmar», y nadie comprueba que una
golilla no choque con otra, con un nervio, con la llave o con una barra. Cada genérica ve solo
su parte; un choque entre dos de ellas no lo ve ninguna.

**Un nodo vista.** Una procedencia nueva de frontera, `'vista'`, con un registro de vistas en
código (`src/proyecto/vistas/`, fuera de `src/lib` para no resellar el motor). Una vista lee
sus datos por campos atados, como una genérica, y construye un **modelo geométrico** puro en
milímetros —piezas (cajas, cilindros, prismas, lazos) con su rol, verificaciones de choque y
coherencia, y valores derivados— del que salen las vistas.

- **Lo que imprime y lo que vota es una hoja sintetizada**, no el dibujo: fórmulas auditables
  sobre los campos, los valores combinatorios con su criterio escrito y cada verificación como
  un `v_*`. El dibujo va al final, como la región de un esquema.
- **La vista lee solo datos, nunca salidas de cálculo**, y lo que deriva (las barras que
  cuentan, la zona de protección de la llave, las medidas de la silla) vuelve a las genéricas
  por nombre. Así el orden topológico queda datos → vista → cálculos, sin ciclos.
- **2D primero, 3D después.** Planta y dos elevaciones en SVG propio, puro y determinista, que
  se imprime en la memoria como cualquier esquema. El 3D es solo de pantalla, sobre las mismas
  piezas, y se carga bajo demanda para no engordar el bundle.
- Por qué no una genérica con esquema: el número de piezas es variable, el 3D no sale de un SVG
  con tokens, y un JSON que no es genérica no cabe en `public/biblioteca/`.

**La base es una configuración de apoyo hecha de componentes** (2026-09-25; reemplaza a la
familia JSON del mismo día). Se pesaron tres formas de agregar una base a una obra: una familia
importable —un JSON generado desde el Pachón que entra por `traerNodos`—, un bloque que nace del
nodo «Reacciones en apoyos», y esta. La familia es una foto: cada variante (sin silla, sin
llave, columna HSS…) sería otra familia o nodos borrados a mano, y la vista no se enteraría de
que falta una pieza. El bloque desde apoyos es el gesto natural, pero por debajo necesita la
misma plantilla y ata la base al SAP2000.

- **La unidad es el componente**, no el grupo copiado: columna, placa, pernos, silla, llave y
  pedestal —después, columna HSS o cuadrada, llave simple— se declaran **una vez en código**,
  cada uno con su sección de datos, la genérica que lo justifica y sus ataduras, y las piezas y
  choques que aporta a la vista. Un choque entre dos componentes solo existe si los dos están.
- **El nodo vista es el ensamble**: su frontera guarda la configuración (qué componentes y de qué
  clase), el tipo de apoyo y el conjunto, si los tiene, y el sufijo de sus nombres. Arma el
  dibujo desde los componentes presentes y dice qué nodos de cálculo existen.
- **Una sola función pura arma el grupo** (`armarBase`): hoja de datos por secciones, un nodo
  por componente con su genérica, el resumen y la vista, entrando por `traerNodos` desde un
  origen sintético. Cambiar la configuración después agrega o quita el nodo del componente, con
  el aviso de siempre sobre las hojas que se quedan sin algo.
- **Dos puertas a la misma función**: desde un tipo del panel de apoyos, con tipo, conjunto y
  sufijo (el alias, `L_pb_CP`) ya puestos y las solicitaciones atadas a las gobernantes; y desde
  la paleta, sin tipo, con las solicitaciones para escribir a mano (una obra sin SAP2000). Qué
  base tiene cada tipo **se deriva** de los nodos vista, no se guarda en el nodo de apoyos.

Las familias JSON quedan, si hacen falta, para grupos sin variantes (el arriostramiento).

**El armado del pedestal se deriva de la geometría, no se declara** (2026-09-25). Lo que las
genéricas contaban de los estribos lo cuenta ahora la vista, sobre los niveles que dibuja:
`n_est_ll` (los estribos equivalentes que cortan el sólido de falla de la llave), `n_est_cab`
(los que caen en los 125 mm superiores, §10.7.6.1.5) y `ramas_cab_x/y` (las ramas por dirección
de un nivel de cabeza). El primer estribo se declara (`s1_est`), porque la hoja suponía uno en la
misma cara. Tres criterios con los que se decidió:

- **Barra en cada esquina.** El reparto (vista y `pedestal-generico`, idénticos) pone una por
  esquina y el resto a paso constante por cara, con los vanos en proporción al largo. El paso
  uniforme por el perímetro dejaba las esquinas vacías cuando el lado no era múltiplo del paso,
  y ACI 318-25 §25.7.2.3(a) las exige.
- **El rombo de cabeza es un amarre adicional**, no el obligatorio. Los niveles que la llave
  cruzaría van sin ramas interiores y pueden llevar un rombo por las barras centrales de las
  caras (Fig. R25.7.2.3a), que aporta la proyección de sus ramas. La regla de los 150 mm libres
  del §25.7.2.3(a) vota en los niveles normales y **avisa** en los de cabeza: la vista tiene
  avisos, que no entran en `v_global` y dejan el nodo en ámbar.
- **El detallamiento chileno es referencia, no norma.** El *Manual de Detallamiento* del ICH
  (2.ª ed., 2019) está en el catálogo del Harness (`CL/ICH-DETALLAMIENTO-2019`) con su acta: es
  práctica sobre ACI 318-14, así que cada regla se cita contra la norma vigente, y el manual sirve
  por sus tipologías (columnas de 4 a 36 barras, pp. 29-40) para proponer armados.

En el panel de apoyos, **«crear apoyo»** ofrece tipologías de partida —momento grande con o sin
silla, momento bajo o rotulada con o sin llave (`TIPOLOGIAS_BASE_COLUMNA`, combinaciones de las
opciones, no bases aparte)— y «personalizar». Marca la sugerida con las gobernantes del tipo y el
e_crit de la rotulada de partida, y abre el armado con esa configuración: cada componente se sigue
eligiendo ahí y en la ficha de la vista. Decide el ingeniero.

**Alternativas de un mismo apoyo** (2026-09-25; decidido, sin hacer: después de la revisión del
flujo de cálculo de las bases, que cambia los veredictos que la comparación mostraría). Evaluar
dos o más configuraciones contra los MISMOS esfuerzos, a la vista en el lienzo, sin tocar los
parámetros de un diseño para probar otro: con y sin silla, con y sin rombo, otro pedestal.

- **El tipo y la alternativa se separan.** Hoy el sufijo de los nombres es el alias del tipo
  (`_CP`), y por eso una segunda base del mismo tipo se rechaza. El tipo dice de dónde salen los
  esfuerzos (`N_c_CP_LRFD`, que se publican una vez y cualquier cadena lee); la alternativa lleva
  su propio sufijo (`_CP` la primera, `_CPb`… o uno que elija el usuario). El ensamble ya guarda
  tipo y conjuntos: le falta el sufijo propio.
- **En el panel de apoyos, por tipo:** la lista de sus bases con su tipología y su u máx,
  «crear alternativa…» con el menú de tipologías, y «duplicar», que copia una base con sus datos
  editados para cambiar una sola cosa. Duplicar es probablemente el uso más frecuente.
- **Una sola adoptada.** Una marca en la base que va a la memoria y al informe; las demás se
  evalúan y se ven, pero no se imprimen ni votan en el resumen de la obra. Dos placas para un
  mismo apoyo en el informe no dirían cuál se construye.
- **Comparación lado a lado** en el mismo panel: los u_* por componente (placa, anclaje, llave,
  silla, pedestal, geometría) y la cantidad de acero de cada alternativa.

Riesgos: el costo de evaluación (unos 9 nodos por base, y el P-M del pedestal es el caro: medir
antes de dejarlo sin límite), el ruido en el autocompletado (los nombres de las no adoptadas no
se ofrecen a las hojas libres) y la copia «De otra obra…», que ya deja el ensamble apuntando a
ids viejos.

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
y validador, la marca «Revisar» (hecha), y las propuestas que el usuario acepta (hechas).

**Las propuestas (2026-09-25).** Salieron de cómo se trabajó el Pachón: cada cambio de armado se
corría en seco, se miraba una tabla de usos antes y después, se respaldaba la obra a mano y
recién entonces se escribía con candado. Ahora es una función de la aplicación:

- **Una propuesta es la obra entera como quedaría**, en los archivos de `partirObra`, más la
  versión del disco de la que parte. `POST /obras-api/<id>/propuestas` la deja en
  `_propuestas/<id>/`, fuera de la carpeta de la obra (no mueve su versión); no pide candado,
  porque proponer no escribe, y se rechaza con 409 si la obra ya no está en esa versión.
- **La tabla la hace `obra/propuesta.ts`** (`compararObras`), pura, y la comparten el diálogo,
  la CLI y `verify:obra`: por nodo, si es nuevo, se quita, cambia o solo le llega otra cosa; la
  severidad, el veredicto, cada `u_*`/`v_*` y chequeo de vista que cambia, los datos (fijados,
  atados, publicados, opciones) y los bloques, con lo que empeora primero. Un bloque con el
  mismo contenido bajo otro id se dice como tal y no como editado.
- **La pestaña abierta se entera en el latido** (que devuelve cuántas esperan) y lo dice en una
  banda. Aceptar respalda la carpeta en `_respaldos/` (`POST …/respaldo`, con candado; sin
  respaldo no se aplica), aplica la obra —queda en el historial, Ctrl+Z la retira— y marca
  «Revisar» cada nodo que la propuesta del asistente tocó. Rechazar la archiva en `resueltas/`.
  Una propuesta que parte de otra versión, o con cambios sin guardar en la pestaña, no se acepta.
- **El asistente la arma con `npm run obra:comparar`**: corre en seco contra una carpeta, un
  JSON o `--actualizar-plantilla`, imprime la tabla y, con `--proponer`, la deja en espera.
  Escribe por `crearObras` sobre la misma raíz, sin HTTP ni candado.

**Las plantillas se congelan por versión.** Una base armada guarda la huella de la plantilla
con que se armó (`ensamble.plantilla`); las versiones viven en `vistas/<vista>/versiones/`
(`npm run plantillas:congelar`) y actualizar es la diferencia entre la suya y la de hoy, desde
el botón de la ficha de la vista y a través de una propuesta. Una base anterior a las
versiones se toma como armada con la primera. Los bloques que se agregan a una sección ya
publicada llevan `id`, y el índice de los demás no los cuenta: así un texto nuevo no corre los
siguientes. `corrimientos` lo comprueba contra la última congelada, y `actualizarPlantilla`
alinea por contenido los ids de una base armada antes (el Pachón tenía tres textos corridos
por `s1_est_ped`, agregado en medio de su sección).

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
1. **Los Load Cases y la masa sísmica, en pestañas del nodo SAP2000** — **hecho**
   (2026-09-25): ver «El nodo va en pestañas», en «El modelo se justifica desde la obra». El
   espectro pasó a Load Cases con su amortiguamiento justificable; los estáticos traen sus
   patrones con su factor, y la masa, sus fuentes.
2. Leer lo medido (reacciones por caso, periodos, cortes basales) con su sello, y publicarlo
   como nombres que las hojas usan en vez de copiarlos a mano. **Exige un modelo analizado**:
   las tablas de uno sin analizar devuelven ceros, no vacío, y un cero parece un dato. **El
   modal ya se lee con su sello y publica `T_x` y `T_y`** (2026-09-25, sub-nodo Modal); faltan
   las reacciones y los cortes basales.
3. Marcar la lectura atrasada cuando el `.sdb` cambió después de leerla — **hecho para lo que
   tiene sello** (el modal): la fecha del `.sdb` se compara con la de la última conexión.

### 3. La hoja en flujo lineal

La sección de arriba. Dentro de una obra es más urgente: `MathCanvas` se achica hasta ser un
componente embebible en la pestaña de un nodo, el autoguardado pasa a ser de la obra, y
desaparece el alto estimado de cada bloque que hoy obliga a los generadores a calcularlo.

### 4. Los valores a la vista

La obra muestra relaciones; falta que muestre **números** sin entrar a cada hoja.

- **Bloque tabla — hecho** (2026-09-24, región `table`). Para las tablas de norma con
  interpolación y para presentar juntos los valores de una familia (las presiones de viento
  por cara y franja). Decisiones: cada celda es una fórmula con **la misma gramática** que una
  región math (`evaluarFormula`, compartida), un valor escrito o un texto; se evalúa **fila a
  fila** en su posición y escribe en el scope; publica el cuerpo como **matriz** y cada
  columna con nombre como **vector**, que alimentan `interp` y la `xy` de un gráfico; una
  comparación en una celda es un **veredicto** `id[f,c]`; una columna puede imprimir **solo el
  valor**, con la unidad subida al encabezado. `interp(xs, ys, x)` es 1D y **fuera de la tabla
  es un error**: el extremo que manda la norma se escribe a la vista, con `min(max(…))`. El
  `Cp_cub` del CIRSOC 102 se escribe así y da lo mismo que el `program` (comprobado); el
  `interp2` queda para cuando se migre la tabla θ × h/L de NCh432. El resumen de lo que va al
  modelo ya no hace falta: lo hace el nodo SAP2000.
- **Bloque gráfico — hecho** (2026-09-24, región `plot`). Funciones de una variable, series
  x–y y rectas o puntos de referencia; sin flechas ni ejes logarítmicos todavía. Decisiones:
  la especificación es **estructurada** (`Region.grafico`) y se edita con un panel, no con un
  mini lenguaje; el SVG es **propio y puro en `src/lib`**, sin librería de gráficos, para que la
  hoja, el papel y Node dibujen lo mismo; el resultado del motor son **datos en unidades de los
  ejes** y el SVG se arma al pintar; la unidad de cada eje se aplica **en el motor**, estricta
  como el `:svg` de un esquema. El espectro Sa(T) de la obra y el del modelo se dibujan juntos
  con una serie función y una de datos.
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
- **Casos**: la pestaña de Load Cases y la de masa sísmica ya existen (etapa 2). Falta lo que
  no se detalla: los casos no lineales y de tiempo-historia.
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
| `/planillas`, `/diseno/<id>` | el panel «agregar a la obra», con búsqueda por disciplina y norma: una genérica suelta o una familia |
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
| Vista geométrica (frontera `'vista'`) | sí: una hoja sintetizada con sus verificaciones | lo que deriva de la geometría | en curso: la base de columna |
| Nota o documento (texto, criterio, PDF adjunto) | no | se cita en un informe | por decidir |
| Modelo SAP | no; justifica lo que lee | por ahora nada; después lo medido | existe (patrones, cargas, casos, espectro, masa, resumen); etapas 2 y 6 |
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
