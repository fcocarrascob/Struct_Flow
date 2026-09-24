# Pendientes

Lo que está **abierto**: defectos localizados, deudas y límites conocidos, con lo justo para
retomarlos. Lo que se cerró sale de aquí y queda en el historial de git; el rumbo y las etapas
están en `docs/rumbo.md`.

Una entrada marcada **(muere con el flujo lineal)** desaparece cuando la hoja pierda `x`/`y`
(`rumbo.md`, «La hoja va hacia el flujo lineal»): arreglarla antes es afinar algo que se va a
retirar.

## Para retomar primero

Lo importante que quedó abierto al cerrar la sesión del 2026-09-24 (la rama
`grupos-sin-cargas` ya está en `master`). La obra de trabajo es `obras/pachon-soldadura`,
atada a `modelo_prueba.sdb`. La revisión del motor está en «Motor», más abajo.

1. **Combinaciones de carga — importantísimo.** El Pachón tiene 165 y no tienen dónde vivir.
   Leerlas del modelo (cada una con sus casos y factores) y justificarlas desde la obra contra
   la norma que la obra cita (CIRSOC 301 B.2). Por decidir: cómo se escribe una familia de
   combinaciones en la obra —165 no se atan una por una—; probablemente una hoja que las genera
   desde las reglas y el nodo SAP2000 compara la lista entera (`rumbo.md`, etapa 6).
2. **Segunda pestaña del nodo SAP2000: los Load Cases.** El espectro de respuesta se mueve ahí,
   porque es un caso. Agregar el **amortiguamiento** y la **combinación modal** como cosas
   justificables (hoy solo se muestran), y los demás casos (modal, estáticos) con sus patrones
   y factores. El puente ya lee amortiguamiento y combinación en `/espectro`.
3. **Masa sísmica.** Leer la fuente de masa del modelo (`SourceMass.GetMassSource`: qué patrones
   y con qué factor) y justificarla. En el Pachón el modelo lleva S con 0,5, que es el `f2` que
   la obra perdió al retirar «Casos de carga y fuente de masa»; tiene que volver a estar
   escrito en algún nodo (el del espectro es el candidato).
4. **Migrar las tablas de norma escritas como `program` a regiones `table` + `interp`.** El
   `Cp_cub` del CIRSOC 102 del Pachón (`docs/pachon/`, y su generador) y el `cp_techo` +
   `interp_lin` de `viento-caras-nch432-generica`, que es una tabla θ × h/L: para esa hace falta
   `interp2`, o interpolar por columnas a mano. La genérica mueve la paginación publicada y su
   sello: con su medición en `/calibrar` y un `verify:biblioteca`.
5. **Migrar las figuras hechas a mano a regiones `plot`.** La genérica
   `espectro-nch2369-generica` dibuja el espectro con 26 regiones `imprimir: false` de mapeo a
   píxeles, y `losa-unidireccional` arma sus curvas igual (`pts_fl`). Un `plot` las reemplaza,
   pero mueve la paginación publicada: cada una con su medición en `/calibrar`.
6. **El defecto del motor con el prefijo de las unidades** (abajo, en «Motor»): el mismo valor
   se muestra «1000 Pa» o «1 kPa» según lo evaluado antes en el proceso. Empieza por su caso
   en `verify:motor`; hoy `verify:obra` lo esquiva con una evaluación de calentamiento.

## Obra

- **Sin servidor, dos pestañas con la misma obra se siguen pisando.** El candado es del
  servidor de obras; una obra en `localStorage` no lo tiene, y la última en guardar gana.
  Con el servidor no pasa.
- **Solo lectura no impide editar.** La pestaña sin candado deja tocar la obra y lo dice en
  la banda, pero lo escrito se descarta al tomar el control. Bloquear la edición significa
  llegar a los paneles y al canvas de cada pestaña de hoja.
- **El candado vive en la memoria del servidor.** Dos servidores sobre la misma raíz (`npm run
  dev` y `npm run obras`) no lo comparten, y reiniciar el servidor lo suelta.
- **Escribir una obra no es atómico entre archivos**: cada archivo se escribe entero (temporal
  y renombrado), pero un corte a mitad puede dejar `obra.json` nuevo con alguna hoja vieja.
- **Una hoja ilegible se escribe vacía con el primer cambio.** La banda lo avisa al abrir;
  guardar sin arreglarla en el disco la pierde.
- **Las obras van por defecto a `./obras/` dentro de este repo** (ignorada por git). Para
  trabajo real conviene `STRUCTFLOW_OBRAS` apuntando a otro sitio, y cada obra como su propio
  repositorio.
- **El historial vive en memoria y cabe 60 pasos.** Un F5 lo vacía: borras un nodo, recargas,
  y no hay vuelta. El aviso del borrado cubre la ventana que importa, pero no más.
- **El aviso de ruptura no se puede consultar después.** Caduca con el siguiente cambio, a
  propósito (su «↶ Deshacer» desharía otra cosa); quien lo cierra sin leerlo pierde la frase
  que nombraba al nodo que se fue.
- **Una hoja con frontera puede publicar lo que ya no calcula.** `publica` se lee del
  documento, así que un alias sobre una salida que la hoja dejó de definir dibuja su flecha y
  deja al consumidor sin valor. Con una `propia`, que no declara salidas, nadie lo acota.
- **Publicar una salida de tipo `serie`.** Una matriz N×M no cabe en una variable que otro
  nodo multiplique; el selector la deja fuera. Hay que decidir qué significa nombrarla cuando
  un espectro alimente a otra hoja.
- **Un campo atado no puede leer otra entrada de su planilla.** En el Pachón, el peso propio
  de la vía repite las áreas del perfil y del canal en la expresión.
- **El autocompletado de una pestaña solo ve su propia hoja.** `scopeInicial` da los valores,
  pero `variablesVisibles` no conoce los nombres de otros nodos. Probablemente se resuelve
  como las regiones fantasma `pub:<idNodo>:<alias>` de la obra.
- **Una pestaña no sobrevive a un F5**: vive en el estado de `CanvasObra` (el router solo mira
  el `pathname`). Sin enlace a una hoja, ni atrás/adelante entre pestañas.
- **Una obra migrada pierde sus posiciones.** Los nodos que eran partidas cambian de id de
  nodo (`partida:` → `calculo:`) y el layout guardado ya no los encuentra: abren colocados por
  grupo y basta con «reordenar».
- **El generador de la auditoría del Pachón (`docs/pachon/auditoria/generar.mjs`) sigue
  escribiendo cargas.** Se lee igual porque el saneo las migra —y `verify:obra` lo usa como caso
  de migración real—, pero no es el formato de la obra. La autocontenida ya está simplificada:
  sin nodos por patrón, sin totales R = q·A y con grupos.
- **Las franjas de «reordenar» no se rotulan.** El nombre del grupo está en la leyenda y en
  cada tarjeta; una banda sin marco se lee por proximidad, y con muchos grupos puede no bastar.
- **`identificadoresDe` es un tercer léxico** (`modelo.ts`): una regex donde math.js ya sabe
  analizar. Un nombre dentro de una cadena de texto de una fórmula cuenta como dependencia.
- **Teclado y foco.** El panel no atrapa el foco ni lleva `role="dialog"`; un nodo no se
  recorre ni se abre sin ratón (React Flow trae navegación propia y no está configurada).
- **La caché de genéricas es FIFO, no LRU** (`biblioteca.ts`). Con veinte cálculos no se nota.
- **`sanearConInforme` no tiene caso de regresión**: no encaja en `verify:motor` ni en
  `verify:obra`. Se comprobó a mano; le falta su sitio.

## SAP2000

**La comparación de patrones y la aplicación se retiraron con las cargas** (2026-09-23,
`rumbo.md`, «El grupo es la única forma de organizar la obra»). Lo que hay:

- **El nodo SAP2000 lista los patrones y sus cargas asignadas, sin compararlas con nada.** La
  lectura (`/cargas` del puente) cubre distribuidas y puntuales en barras, uniformes en áreas,
  áreas a barras, fuerzas en nudos y temperatura en barras. No lee presión de viento
  automática, gravedad ni temperatura en áreas: un patrón que solo tenga eso sale sin cargas.
- **Las cargas se agrupan por valor, no por objeto.** «0,769 kN/m en 22 barras» no dice cuáles
  son las 22; para justificar un valor alcanza, para ubicarlo en el modelo no.
- **Una carga se justifica con una expresión de la obra** (`obra.justificaciones`, verificada
  en `sap-cargas.ts` con la conversión de los campos atados y una tolerancia de 0,5 %). Queda
  abierto:
  - **El espectro se lee y se justifica** (el factor de escala de cada dirección y la función,
    comparada en todos sus puntos con una función que publique la obra). El resto del caso y la
    masa sísmica están en «Para retomar primero».
  - **El campo no autocompleta** los nombres de la obra, al revés que una fórmula de la hoja.
  - **Una carga de dos valores** (distribuida trapezoidal) solo justifica el primero.
  - **Una justificación huérfana** (su carga cambió de valor y hay más de una candidata, o se
    borró) no se reasigna: se ve en el panel y se quita a mano.
  - **La tolerancia es una sola** para toda carga; no se puede declarar por carga.

Lo que dejó a la vista la primera comparación de Load Patterns contra el modelo del Pachón,
antes de retirar las cargas; vale para cuando la comparación vuelva:

- **Una carga de Flow no siempre es un Load Pattern.** `RSX`, `RSY` y `EV` salen «falta en
  SAP» porque en el modelo son casos (espectro, vertical sísmico), no patrones. La carga
  necesita poder decir «soy un caso, no un patrón».
- **Una carga de Flow puede ser varios patrones.** La grúa es `CLV` en Flow y `CLV_P1…P3` en
  SAP, una por posición del puente. Hoy salen como filas sueltas, a propósito: no se adivinan
  equivalencias.
- **El puente no se arranca solo** con `npm run dev`. Y el panel muestra la última conexión,
  que puede no ser el modelo abierto ahora (lo avisa, pero hay que volver a conectar a mano).
- La tabla de patrones es larga (33 filas en el Pachón) y no se filtra por estado.
- **El tope de 30 s es del navegador, no de SAP.** Si una llamada COM se cuelga, Flow deja de
  esperar pero el puente —que atiende de a una— sigue ocupado hasta que SAP responda.
- **La aplicación no cubre todo lo que el Pachón usa**: cargas puntuales (las ruedas de la
  grúa), una carga que son varios patrones (una por posición del carro) y las franjas de
  viento sobre parte de la cubierta. Hoy esas partidas no se pueden verificar.
- **Lo aplicado fuera de los grupos declarados no se ve.** La comparación mira los objetos del
  grupo de cada partida; un patrón que además carga objetos que ninguna partida menciona pasa
  por «igual».

## Motor

Revisión del 2026-09-24, con gráficos y tablas ya dentro, sondeada contra el motor. Por
gravedad: lo primero da **números falsos sin error**. Cada arreglo empieza por su caso en
`verify:motor` y por medir el corpus antes de endurecer.

### Nombres que el motor resuelve solo

Los tres son el mismo mecanismo —qué hacer con un nombre que la hoja no define— y conviene
atacarlos juntos.

- **Una constante de math.js ocupa el lugar de una variable sin definir.** `phi` vale 1,618 (la
  razón áurea), así que `phi*Mn` sin φ definido da 1,618·Mn; `E` y `e` valen 2,718
  (`sigma := E*0.001` da 0,0027); también `tau`, `pi`, `LN2`, `SQRT2`. Pasa además cuando la
  definición existe pero falla: se retira del scope y lo de abajo toma la constante. El corpus
  define `E` 14 veces y `phi` 5. Propuesta: un nombre sin definir que resuelve a una constante
  es error, salvo `pi`; medir antes cuántas regiones usan `pi` o `e` a propósito.
- **Una unidad ocupa el lugar de una variable sin definir.** `M := q*L^2/8` con `L` sin definir
  da «0,25 kN·L²/m» (litros); tampoco fallan `A`, `N`, `V`, `T`, `F`, `h` (hora), `t`
  (tonelada), `g` (gramo), `b` (barn), `s`, `m` ni `Es` (exasegundo: el módulo del acero). Con
  `A := sqrt(-4)` en rojo, `B := A*2` da «2 A» sin error propio. Y con los prefijos casi
  cualquier nombre corto es unidad: el corpus define `dA`, `mA`, `mC`, `dT`, `pm`, `Yb`, `qK`,
  `amp` y `alt`. Propuesta: el aviso inverso al de «unidad tapada» —una unidad escrita fuera de
  una cantidad literal—; medir antes patrones legítimos como `fc/MPa`.
- **Dos detectores del mismo problema.** `unidadesEclipsadas` (regex ASCII en
  `scripts/lib/planilla.mjs`, error en el verificador) y `avisoUnidadTapada` (árbol, en el
  motor, aviso en la hoja) pueden discrepar. Tiene que quedar uno, en el motor, que cubra
  también lo de arriba.

### Valores no finitos

- `0/0` da NaN, `1/0` da Infinity, `log(0)` −Infinity y `1 kN/0` «Infinity N», sin error y
  mal formateados (`Infinity` en cursiva); una comparación con NaN sale ✗ y se lee como un
  incumplimiento. Propuesta: error, como el complejo (`ERROR_COMPLEJO`); medir el corpus antes.
- `interp` con un x NaN da un error críptico de math.js (el bucle se pasa del final): falta
  comprobar que x sea finito.

### Cómo se muestran las unidades (no cambia números, cambia el papel)

- **El prefijo con que se muestra una unidad sin convertir es inestable.** En una misma hoja,
  `1 * 1 kN/m^2 =` sale «1000 Pa» y `3 kN/m^2 =` «3 kPa»; en la obra autocontenida del Pachón,
  `pf_min := I_nieve * 1 kN/m^2` sale «1000 Pa» la primera vez y «1 kPa» las siguientes. Una
  misma hoja no se imprime igual dos veces. **La reproducción mínima ya está** (las dos líneas
  de arriba): falta el caso en `verify:motor`; hasta entonces, el caso de la carpeta de
  `verify:obra` evalúa una vez antes de comparar.
- **math.js simplifica las unidades al mostrarlas**: `5 kN * 2 m =` sale `10 kJ`, un momento
  escrito como energía, y 1.108 kN sale «1,108 MN». Solo se evita con `= kN*m`. Cambiarlo toca
  miles de resultados del corpus y la paginación: necesita su propia medición antes de decidir.
- `atan` devuelve un número sin unidad (radianes implícitos).

### Tablas

- **Una coma decimal en una celda la vuelve texto sin aviso**: `0,5` se imprime como si fuera
  un número y solo falla si la columna se publica; igual `50%`. Propuesta: un aviso en la celda
  cuando un texto tiene forma de número.
- **El tope de iteraciones es por celda**: una tabla de 60×12 que llama funciones caras puede
  gastar 720 veces el tope de una región. Falta un presupuesto por tabla.
- Una matriz publicada puede mezclar unidades (`1 kN`, `2 m`) y falla recién al usarla
  (`sum(M)`). Menor; bastaría un aviso.

### Un solo lector de nombres

- **Los nombres no ASCII funcionan en el motor y no en sus lectores.** `σ_c` y `año` se definen
  y se usan bien, pero `RE_INDEFINIDO` de la obra, `simbolos` de `canvas-handoff.ts`,
  `unidadesEclipsadas` y `contrato.ts` (detección de `v_*`) leen `[A-Za-z_]`: faltan flechas en
  la obra y errores sin detectar. Con `identificadoresDe` (en «Obra») son cinco léxicos; la
  salida es un lector de símbolos sobre `math.parse`, compartido.

### Lo demás

- **Rendimiento de `evaluateSheet`**: ~1,4 s en `muro-flexocompresion` (646 regiones), y
  escala peor que lineal; el coste está casi entero en las regiones `program` (sin ellas,
  14 ms). Sospecha: math.js normaliza el scope en cada `evaluate`; la vía sería llevarlo como
  `Map`. Hay que instrumentarlo desde Node.
- Un esquema que llama a una función de usuario la evalúa con el scope **final** de la hoja,
  no con el de su posición.
- `f(x) := …` en una región `math` da «Value expected (char 10)» sin decir que tiene que ir en
  un `program`.
- `ones(20000, 20000)` agota la memoria dentro de math.js, y no es un error atrapable.

## Módulos de diseño

Se corrigen **módulo y planilla juntos**, para que `verify:modulos` siga contrastando lo mismo.
Por gravedad:

- **Zapata, longitud de desarrollo** (`k_ld`): usa 2,1 para cualquier diámetro; la Tabla
  25.4.2.3 lo reserva a No. 19 o menores (de 22 mm en adelante, 1,7), así que `l_d` sale un
  19 % corta. El mínimo de 300 mm no vota, y ψ_g queda en 1 con f_y = 5000 kgf/cm².
- **Zapata, punzonamiento** (`V_u2`): resta la reacción dentro del perímetro con `q_u_max`;
  sale un 3,6 % corto con el momento por defecto y un 9 % dentro del núcleo. El contraste no lo
  ve porque se hace con M = 0.
- **El CUMPLE ignora lo que no se calculó** (`PanelResultados.tsx`): un uso NaN se descarta
  en silencio y un veredicto `undefined` no cuenta como incumplimiento.
- **Los avisos que invalidan el número no apagan el CUMPLE** (zapata con e > B/6, `v_mom` de
  la losa).
- **Viga**: `h_min = L/16` sin el factor (0,4 + f_y/700); `u_V` negativo en vigas cortas sin
  aviso de viga de gran altura.
- **Zapata**: se comprueba la separación máxima de barras y no la libre mínima.
- **Formulario**: acepta `n_b = 3,5`, evalúa negativos mientras se escribe, y con
  `type="number"` una coma decimal deja ver «2,5» y calcula con 2.
- **Acero**: la clasificación de esbeltez vota (una no compacta, que AISC permite, sale NO
  CUMPLE), y φ_v = 1,0 es de laminados cuando el módulo arma uno soldado (0,90).
- **`verify:modulos` no mira signo ni finitud de los usos**, y un módulo con `casos: []` pasa
  sin evaluar nada.
- Las entradas de un módulo no se guardan: F5 las devuelve a los valores por defecto.
- **Ctrl+P fuera del canvas imprime en blanco**: la regla de impresión oculta todo lo que no
  sea `.worksheet-print`.

## Hoja y canvas

- **La tabla, lo que quedó fuera** (región `table`, 2026-09-24):
  - **El lint del harness no conoce la regla `tabla.entrada`** de `validarMeta` (una entrada
    `in_*` no puede vivir en una celda), ni cuenta los `v_*` que define una celda. El
    contrato dice que el lint en Python lo reproduce: hay que llevarlas allá.
  - **La grilla no se ajusta a la escala.** En edición cada celda va en una línea recortada; lo
    que mide el papel es la tabla impresa, así que al salir de edición el bloque puede cambiar
    de alto (y tapar lo de abajo, como un programa que crece).
  - **Una tabla más alta que una A4 no se parte**: va con `break-inside: avoid` y la paginación
    la mide como un bloque. La banda de «bloques largos» la señala, pero no hay forma de
    repetir el encabezado en la página siguiente.
  - **La mini hoja de la obra la muestra de solo lectura**, como el gráfico: se edita en la
    pestaña de la hoja.
  - **Mover una fila corre los ids de sus veredictos** (`r12[f,c]`): el verificador lo delata,
    pero la entrada de `esperadoFalso` se corrige a mano.
  - **La banda de «no caben en el ancho» habla de fórmulas** aunque lo que desborda sea una
    tabla entera.
- **Sin red de pruebas de interfaz.** Los verificadores cubren el motor, la obra y la
  biblioteca; de la interfaz no se comprueba nada, y no hay ESLint pese a los
  `eslint-disable` de `MathCanvas.tsx`.
- **El deep-link puede pisar lo que se está escribiendo**: `hayTrabajoGuardado()` se evalúa al
  montar; si el `fetch` tarda y el usuario teclea, al resolver reemplaza la hoja sin preguntar.
- **El contrato JSON acepta de más**: `{"regions": []}` vacía la hoja con un `confirm`
  genérico; una `y` negativa o de `1e9` pasa el saneo; `w`/`h`/`pageBreak` no se validan; y
  `Math.max(...regions.map(...))` revienta con ~100k regiones.
- **Cuatro debounces sin coordinar** sobre `regions` (120 evaluación, 300 guardado, 400
  historial, 250 paginación), y dos mediciones completas del documento en cada pausa. Durante
  una ráfaga de tecleo el contador de páginas no se actualiza.
- **Duplicación**: `STORAGE_KEY` y la descarga de un blob repetidas en `ErrorBoundary.tsx`; la
  elección del título en `MathCanvas.tsx` y `WorksheetPrint.tsx`; tres criterios sobre qué es
  una hoja válida en `localStorage`; el comparador de orden de lectura en diez sitios
  **(muere con el flujo lineal)**.
- **La primera región de texto se convierte en `<h1>`**: si no es el título, el documento sale
  mal titulado. `meta.titulo` sería mejor fuente.
- **Exportar pierde el título** (`meta.titulo` no se emite) y el archivo siempre se llama
  igual.
- **Rutas profundas sin *fallback* de SPA**: un despliegue estático sin `try_files` da 404 en
  cualquier recarga o enlace `?planilla=`.
- Si el corte de página cae en el pie, la línea no se dibuja (`__footer` no es una región).
- Las imágenes se descodifican enteras antes de mirar `file.size`; los SVG entran sin límite.
- No se puede copiar texto del canvas: `select-none` va en la raíz de cada región.
- Diálogos nativos (`confirm`/`alert`) en siete sitios; si el navegador los desactiva, varios
  errores se vuelven silenciosos.
- Deshacer descarta siempre la selección; dos deep-links a la vez disparan dos cargas.
- La copia apartada por un conflicto entre pestañas se descarga, no se restaura en la hoja.
- Un espaciador solo se ve con el cursor encima: nada marca un hueco deliberado.
- Falta `touch-action: none` en el arrastre: en táctil hace scroll.
- **El PDF de `render:planilla` no pagina igual que `/calibrar`.** Con el tamaño de KaTeX ya
  igualado, `viga-ltb` coincide (6 páginas), pero `losa-unidireccional` da 18 contra 20 y
  `viga-hss-flexion` 15 contra 17. El PDF de uso normal sale de «Imprimir» en el navegador,
  así que no se persiguió; el HTML de consola lleva el mismo ajuste al ancho, que corre si se
  abre en un navegador.
- **Accesibilidad**: las regiones no tienen `tabIndex`, `role` ni `aria-`; no se recorren ni
  mueven sin ratón, y los estados se comunican solo por color; las figuras van con `alt=""`.
  Conviene esperar a la lista ordenada, donde «recorrer con el teclado» tiene respuesta obvia.
- **(muere con el flujo lineal)**: dos regiones que se pisan se roban los clics y el detector
  de solapes da falsos positivos porque toda región mide el ancho del papel; el título abre
  varias planillas con la banda ámbar; el `<textarea>` de un texto no mide lo mismo que su
  `<p>`; no hay desplazamiento automático al arrastrar cerca del borde; el `ResizeObserver` se
  reconecta en cada `pointermove`; pegar un fragmento no evita solapes; alinear y distribuir.
