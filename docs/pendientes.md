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

1. **Justificar las combinaciones — importantísimo.** Ya se leen y se ven: el sub-nodo
   Combinaciones muestra las 165 del Pachón en una matriz. Falta justificarlas desde la obra
   contra la norma que la obra cita (CIRSOC 301 B.2). Por decidir: cómo se escribe una familia de
   combinaciones en la obra —165 no se atan una por una—. Probablemente una hoja que las genera
   desde las reglas y le manda una flecha al nodo, que compara la lista entera (`rumbo.md`,
   etapa 6).
2. **El `f2` de la masa sísmica tiene que volver a estar escrito en la obra.** El nodo SAP2000
   ya lee la masa y deja justificar sus factores (S con 0,5 en el Pachón), pero la obra perdió
   el `f2` al retirar «Casos de carga y fuente de masa». El nodo del espectro es el candidato
   para escribirlo. Lo mismo vale para el 0,185 de `EV`.
3. **Migrar las tablas de norma escritas como `program` a regiones `table` + `interp`.** En la
   obra de trabajo del Pachón ya están hechos (2026-09-24) el nodo de viento SPRFV —`Cp_sot` y
   `Cp_cub` leen dos tablas de la Figura 3, con un gráfico de los Cp de cubierta— y el de
   presión de viento —`K_h` interpola la Tabla 5, con un gráfico de K_z—; el espectro tiene
   su gráfico de Sa(T). Los números no cambiaron. Falta llevarlo a `docs/pachon/autocontenida/` y su generador, y el `cp_techo`
   + `interp_lin` de `viento-caras-nch432-generica`, que es una tabla θ × h/L: para esa hace
   falta `interp2`, o interpolar por columnas a mano. La genérica mueve la paginación publicada
   y su sello: con su medición en `/calibrar` y un `verify:biblioteca`.
4. **Migrar las figuras hechas a mano a regiones `plot`.** La genérica
   `espectro-nch2369-generica` dibuja el espectro con 26 regiones `imprimir: false` de mapeo a
   píxeles, y `losa-unidireccional` arma sus curvas igual (`pts_fl`). Un `plot` las reemplaza,
   pero mueve la paginación publicada: cada una con su medición en `/calibrar`.
5. **La base de columna como configuración de apoyo** (`rumbo.md`, «La base de columna como
   modelo geométrico, y sus componentes»). Hecho: la vista lleva `config` en su frontera
   (silla y llave pueden faltar, con sus verificaciones propias sin silla) y se elige en su
   ficha; la completa da byte a byte lo mismo que antes. Hecho también: la plantilla del grupo
   (`vistas/base-columna/plantilla.ts`) y `armarEnsamble`/`reconfigurar` (`obra/ensamble.ts`),
   con dos conjuntos (diseño y sobrerresistencia); con las externas del Pachón da sus mismos
   u_* con los nombres sufijados. Las dos puertas están (tipo en el panel de apoyos, y la
   paleta con las solicitaciones a mano), y la base del Pachón se regeneró con `_CP`
   (2026-09-25) conservando ids, grupo y notas ⚑, con los mismos números.
   Las condiciones de la plantilla ya eligen entre variantes (`placa=articulada`), y dos nodos
   con la misma clave son variantes de una pieza: cambiar de una a otra conserva el id, el
   grupo y la ⚑ (`problemasDePlantilla` exige que nunca coexistan). La primera variante real
   ya está (2026-09-25): `placa-base-rotulada-generica` (DG1 §4.3.1, §4.3.2, §4.3.7; reproduce
   los Ejemplos 4.7-1 y 4.7-3), elegida con `placa: rotulada`, que apaga la silla y la hoja de
   capacidad (`Opcion.soloSi`). Con las gobernantes de las cuatro COL-HASTIAL de
   `modelo_prueba.sdb` la base cierra: placa 0,69 (espesor por el arranque O0 de 182 kN),
   anclaje 0,54, pedestal 0,67. **La base del hastial ya está armada en el Pachón** («Base de
   columna COL_VIENTO», sufijo `_CV`, placa rotulada con llave en cruz; placa 0,69, anclaje
   0,54, llave 0,53, pedestal 0,67), con sus valores de partida marcados ⚑ para confirmar.
   **El armado del pedestal** (2026-09-25, `rumbo.md`): barra en cada esquina, el rombo de
   cabeza como amarre adicional, y `n_est_ll`, `n_est_cab` y `ramas_cab_x/y` derivados por la
   vista; `placa-base-generica` vota fuera de dominio con momento bajo, «+ base» sugiere la placa
   y anclaje y pedestal fallan limpio sin barras. En el Pachón: COL_PPALES con el primer estribo
   a 50 mm, dos niveles de cabeza sin ramas con rombo (placa 0,852, anclaje 0,859, llave 0,918,
   silla 0,986, pedestal 0,867); COL_VIENTO pasó a 16 φ25 con 4 ramas y φ16 a 75 mm en la zona
   (placa 0,685, anclaje 0,435, llave 0,316, pedestal 0,333), porque con 14 φ25 y solo el
   perimetral la barra central de la cara larga quedaba a 365 mm libres (§25.7.2.3(a)) y la
   cabeza tenía 1 estribo φ10 en los 125 mm (§10.7.6.1.5 pide 3).
   **Revisión del flujo de cálculo de las bases (2026-09-25).** Lecturas de norma en el acta del
   Harness (commit `cafa704`). Corregido lo que cambiaba veredictos: el descascaramiento hacia los
   dos bordes y con una o dos filas, la llave con la tracción concurrente (y un segundo caso en X
   para el arranque de la base extrema), el recubrimiento superior de las barras (`recub_sup`, y
   `v_s1_barras` vota), el rombo por el cos² de las dos ramas que corta el plano de falla, las
   gobernantes no concurrentes de `m` y `v` con la N menor, y la hoja libre con un `v_*` en falso
   en rojo. Queda:
   - **El Pachón vuelve a cumplir con los arreglos** (conjuntos releídos con la N menor). CP:
     llave 160 × 80 con placa de 80 mm y tres niveles sin ramas (llave 0,941, pedestal 0,898),
     PED_L 2000 y placa de apoyo embebida de 150 mm (anclaje 0,961: el descascaramiento nominal
     supera 1,2·n·N_sa y el perno fluye primero), placa 0,897, silla 0,986. La cabeza sigue el
     §9.5.3 de NCh2369 como criterio (CP a 55 y 70 mm, CV a 50 y 65 mm). El pedestal más largo no
     se contrastó con la zapata, que ningún nodo verifica. Ninguna hoja revisa `nc_*`.
   - **El desarrollo de la armadura de anclaje de los pernos ya se verifica** (§17.5.2.1.1(a), en
     `anclaje-hormigon-generica`, con los largos que mide la vista: las barras siguen dentro de la
     zapata, `h_zap` y `recub_zap` son supuestos por base). Queda: el **l_dh de la edición SI** está
     impreso con 21 en el denominador y da 3,6·d_b; se usa la constante de la 318-14 (1/4,2) hasta
     confirmarlo con una fe de erratas (acta del Harness, p. 517). Las **ramas de la llave**
     (§17.5.2.1.2(a)) siguen como hipótesis: estribo cerrado con gancho sísmico. En el Pachón, CV
     lleva gancho arriba (l_dh 456 contra 466 mm disponibles) y las dos bases, abajo.
   - **Jerarquía del fusible** (AISC 341 §D2.6c(b)(2)): solo el anclaje usa la capacidad del perno;
     silla, soldaduras y P-M del pedestal usan la demanda O0.
   - **Ev en las combinaciones O0** (ASCE 7 §2.3.6), por confirmar en el modelo: tracción +8 % (CP)
     y +20 % (CV).
   - Sin verificar en ningún nodo: zapata, desarrollo en la zapata (§18.13.2), soldadura
     columna–placa, 100/30 ortogonal.
   - **La planta dibuja el armado transversal** (perimetral, rombo de cabeza y las ramas del
     primer nivel que las tiene) y la vista vota dos choques: `v_estribo_perno` (una rama o el
     rombo no puede atravesar un perno; se pueden tocar, decisión del 2026-09-25) y
     `v_rama_golilla`. El reparto elige las barras de cara que no atraviesan pernos y sube (o
     baja) el nivel que caería en las placas de apoyo embebidas. Con un número par de barras por
     cara el rombo sale torcido, y se deja así a propósito: el dibujo delata la configuración sin
     necesidad de nota. COL_VIENTO pasó a 20 φ22 (5 y 7 por cara): rombo centrado y la cabeza sin
     aviso de amarre.
   - **Invariantes de cadena** (`obra/invariantes.ts`, `npm run verify:obras`): campo de una
     genérica o vista sin fijar ni atar (aviso), atadura que no resuelve (error) y base atrás de
     su plantilla (aviso). La obra `base-de-columna` los tiene: placa, anclaje y pedestal calculan
     campos estrenados después de armarla con el valor de ejemplo. Queda por hacer: los ids de los
     textos de plantilla son su posición en la sección, y un bloque nuevo en medio corre los
     siguientes (el desfase los reconoce por contenido; `actualizarPlantilla` todavía no los
     re-identifica).
   Menores: doble verificación llave/pedestal de la misma armadura (iguales en X, distintas en Y; el
   pedestal cuenta sus niveles desde `s1_est` y no sabe de `recub_sup`); `fy` de las barras
   declarado tres veces; φ25/φ36 fuera del rango investigado (R17.5.2.1: No. 16 en tracción, No. 19
   en corte); h_ef = 1950 > máx 1200 de la genérica sin validar; el cono de dos filas no cuenta el borde del lado de la segunda; par de la llave del
   caso 3 al eje equivocado; el corte resultante siempre en X del pedestal (en CV debería ir sobre el
   lado de 700); `n_niv_sin_ramas`, la columna y β declarados a mano; corte de capacidad en Y muy
   conservador (2436 contra ≈ 775 kN).
   **Pasos siguientes, en orden:**
   1. **El aviso `v_sin_ramas_hx` de `pedestal-generico`.** Con el rombo como amarre adicional,
      el §18.7.5.2 lo cumplen los niveles completos, y el aviso sobraría si el primero de ellos
      cae donde debe. Pero ACI 318-25 §18.7.5.1 no fija, para columnas, a qué distancia de la
      cara va el primer aro (acta del 2026-09-25); el ICH (§5.4.4, p. 23) pide menos de s/2 de la
      cara de apoyo, y eso es práctica sobre ACI 318-14. Decisión de quien diseña; mientras, el
      aviso sigue.
   2. **El proponedor de armado** con las tipologías del ICH (Manual de Detallamiento, pp.
      29-40): con la sección, n_barras y db, que la vista proponga anillos, rombo o trabas para
      que ninguna barra quede a más de 150 mm libres de una apoyada, y compruebe el choque con
      la llave. Para 36 barras el manual usa perimetral y cuatro anillos, sin rombo (p. 40).
      Hoy las ramas interiores se eligen repartidas y no «una sí, una no».
   3. La hoja de capacidad como variante por norma (NCh2369 para Chile) y las fuerzas de las
      diagonales como externa opcional.
   Lo que salió en el camino:
   - **La rotulada toma la tracción del criterio `t` del conjunto de sobrerresistencia**: si ese
     conjunto no tracciona, el nombre no se publica y la hoja queda en rojo.
   - **La plantilla no propaga sus cambios a una base ya armada desde la aplicación**:
     `actualizarPlantilla` (`obra/ensamble.ts`) lleva una base de una versión de la plantilla a
     otra conservando lo editado, pero necesita la plantilla vieja, que la aplicación no guarda; hoy
     se corre desde un script con la de git.
   - **El dato de partida de la placa rotulada vive dos veces**: en la plantilla y en
     `PLACA_ROTULADA_DE_PARTIDA` de `obra/recomendar-placa.ts`; `verify:obra` exige que coincidan.
   Límites de la plantilla: la hoja de capacidad es la del Pachón (AISC 341 §D2.6, pórtico
   arriostrado en X y de momento en Y) y usa las externas `H_int_dg`, `H_ext_dg` y
   `T_ext_dg` del arriostramiento, sin sufijo; una base sin diagonales, o sin
   sobrerresistencia, necesita otra variante. Una copia con «De otra obra…» que renombre ids
   deja el `ensamble` de la vista apuntando a los ids viejos.
6. **La leyenda «debajo del gráfico».** Las etiquetas ya se esquivan y la leyenda busca la
   esquina libre (o la que fije el autor); falta la opción de sacarla del área de trazado, que
   obliga a achicarla dentro del mismo alto para no mover la paginación. Y una etiqueta es
   texto: `T_1` sale literal (en el Pachón se escribió con subíndices Unicode, T₁).

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
  escribiendo cargas, y ya no corre**: se cae en `saneada.cargas.flatMap` porque el saneo migra
  las cargas a grupos y `cargas` no existe después. El JSON se lee igual —`verify:obra` lo usa
  como caso de migración real—, pero no es el formato de la obra, y mientras el generador esté
  roto el JSON se corrige a mano en paralelo (así pasó el `atan` del 2026-09-24). La autocontenida ya está simplificada:
  sin nodos por patrón, sin totales R = q·A y con grupos.
- **Las franjas de «reordenar» no se rotulan.** El nombre del grupo está en la leyenda y en
  cada tarjeta; una banda sin marco se lee por proximidad, y con muchos grupos puede no bastar.
- **Teclado y foco.** El panel no atrapa el foco ni lleva `role="dialog"`; un nodo no se
  recorre ni se abre sin ratón (React Flow trae navegación propia y no está configurada).
- **La caché de genéricas es FIFO, no LRU** (`biblioteca.ts`). Con veinte cálculos no se nota.
- **`sanearConInforme` no tiene caso de regresión**: no encaja en `verify:motor` ni en
  `verify:obra`. Se comprobó a mano; le falta su sitio.
- **Lo que la vista geométrica de la base de COL_PPALES del Pachón todavía no cierra**
  (`rumbo.md`, «La base de columna como modelo geométrico»). Ya derivados: las barras que
  cuentan como armadura de anclaje (`n_cont_ped`, 20 y no los 21 escritos a mano) y la silla
  (pernos a 440 mm, luz entre nervios y nervio de borde calculados). Siguen declarados: el β de
  la placa «a confirmar», el espesor de la placa de apoyo embebida y la vaina del tramo de
  estiramiento del perno, que ninguna hoja verifica.

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
  - **Los Load Cases y la masa sísmica se leen y se justifican** en sus pestañas del nodo. Queda
    abierto: la **combinación modal** (CQC) y el **caso modal** solo se muestran, porque son una
    elección y el campo de justificación compara números; de un caso **no lineal, de
    tiempo-historia** u otro que no sea estático lineal, modal o espectro solo se ven el tipo y
    el estado; y el amortiguamiento se escribe **como fracción** (0.05), no en %.
  - **Una lectura vieja del espectro** (antes de `/casos`) muestra en Load Cases solo los casos de
    espectro, hasta que se vuelve a leer el modelo.
  - **Los desplegados de una pestaña se cierran al cambiar de pestaña**: su estado es del
    componente, que se desmonta.
  - **Los filtros de la tabla de combinaciones no sobreviven a cerrar la pestaña**, salvo la
    familia. Y el filtro por columna mira solo los términos directos: «donde entra CLH_P1» no
    muestra las combinaciones que la toman a través de `ENVCL_H`.
  - **Un sub-nodo quitado deja su lectura en `obra.sap`**, a propósito, para que Ctrl+Z lo
    devuelva entero. Si no se vuelve a agregar, es un dato que la obra lleva sin mostrar.
- **El modal no publica nada todavía.** Para que T₁ o los dominantes lleguen a las hojas hay que
  tocar `evaluacion.ts`:
  - un nodo sin hoja que publica, con una marca propia en `nodosDeLaObra`;
  - sus nombres en `defineDe`;
  - una rama en el bucle de tramos que escriba en el scope y emita la región fantasma `pub:`.

  Antes hay que decidir qué nombres sirven.
- **El sello es la fecha del `.sdb`, no un hash.** Guardar el modelo sin cambiarlo también
  atrasa la lectura. Además, la atrasada solo se detecta al conectar o al leer: si el modelo
  se guarda mientras la obra está abierta, nada avisa hasta la próxima conexión.
- **Un modelo sin analizar no se probó contra el panel**: el 409 del puente sale de `_estados`,
  que sí se probó, pero con el modelo de prueba ya analizado.
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

Cerrado en la rama `motor-robusto` (ver `evaluarNodo` en `worksheet.ts`). Las unidades que
siguen aceptándose sueltas (`UNIDADES_SUELTAS`: `MPa`, `mm`, `kgf`…) no son nombres de
variable corrientes; `N` y `m`, que sí lo son, salieron de la lista.

### Cómo se muestran las unidades

Cerrado (`paraMostrar`: momento en tonf·m o kN·m, prefijo del autor y, si no, prefijo sin
histéresis; los ángulos llevan unidad). Queda un detalle del **panel de variables**: el valor
se formatea con 4 cifras y math.js pasa a exponencial desde 10⁵, así que `E_s := 200000 MPa`
se lee «2e+5 MPa». No toca lo impreso.

### Un solo lector de nombres

Cerrado (`simbolosDeFormula`). Queda `RE_ENTRADA` de `contrato.ts` en ASCII: es parte del
contrato de una genérica que el harness también lee para instanciar, así que no se tocó sin
revisar antes qué acepta el lado de Struct_Harness.

### Lo demás

- **Rendimiento de `evaluateSheet`**: `muro-flexocompresion` baja de ~2,0 s a ~1,3 s y
  `losa-unidireccional` de ~230 a ~68 ms desde que el compilado de math.js se cachea
  (`compilado` en `worksheet.ts`: `node.evaluate` recompilaba en cada llamada). Perfilado lo
  que queda, es aritmética de `Unit` (`clone`, `multiply`) y el `typed.find` que math.js hace
  por dentro al multiplicar y al recorrer matrices; el scope pesa ~5 %, así que llevarlo como
  `Map` no rendiría. Bajar más pide que los bucles calientes de una hoja trabajen sin unidades.
- **Un condicional dentro de un token choca con `:unidad`.** En `{{c ? a : h_c/h_p}}` la rama
  final parece una unidad y `separarToken` la toma como tal; hay que ordenar las ramas para
  que la última no lo parezca (así quedó el rótulo de `h_c/h_p` en
  `viga-carrilera-generica.svg`).

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
