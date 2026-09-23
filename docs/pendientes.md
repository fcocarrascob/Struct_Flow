# Pendientes

Lo que está **abierto**: defectos localizados, deudas y límites conocidos, con lo justo para
retomarlos. Lo que se cerró sale de aquí y queda en el historial de git; el rumbo y las etapas
están en `docs/rumbo.md`.

Una entrada marcada **(muere con el flujo lineal)** desaparece cuando la hoja pierda `x`/`y`
(`rumbo.md`, «La hoja va hacia el flujo lineal»): arreglarla antes es afinar algo que se va a
retirar.

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
  grupo y basta con «reordenar» (rama `grupos-sin-cargas`).
- **Los generadores del Pachón (`docs/pachon/*/generar.mjs`) siguen escribiendo cargas.** Se
  leen igual porque el saneo las migra, pero lo que escriben ya no es el formato de la obra.
- **Las franjas de «reordenar» no se rotulan.** El nombre del grupo está en la leyenda y en
  cada tarjeta; una banda sin marco se lee por proximidad, y con muchos grupos puede no bastar.
- **`identificadoresDe` es un tercer léxico** (`modelo.ts`): una regex donde math.js ya sabe
  analizar. Un nombre dentro de una cadena de texto de una fórmula cuenta como dependencia.
- **Teclado y foco.** El panel no atrapa el foco ni lleva `role="dialog"`; un nodo no se
  recorre ni se abre sin ratón (React Flow trae navegación propia y no está configurada).
- **La caché de genéricas es FIFO, no LRU** (`biblioteca.ts`). Con veinte cálculos no se nota.
- **El armazón común de los dos canvas.** `CanvasObra`/`CanvasProyecto` comparten ~120 líneas
  y `NodoObra`/`NodoHarness` son casi el mismo archivo. Se extrae con el tercer lienzo, o
  antes si `/proyecto/<slug>` desaparece (etapa 1).
- **`sanearConInforme` no tiene caso de regresión**: no encaja en `verify:motor` ni en
  `verify:obra`. Se comprobó a mano; le falta su sitio.

## SAP2000

**En la rama `grupos-sin-cargas` la comparación de patrones y la aplicación se retiraron** con
las cargas (`rumbo.md`, «Experimento: el grupo es la única forma de organizar la obra»); lo de
abajo queda como estaba en `master`, para cuando vuelvan. Lo que hay en la rama:

- **El nodo SAP2000 lista los patrones y sus cargas asignadas, sin compararlas con nada.** La
  lectura (`/cargas` del puente) cubre distribuidas y puntuales en barras, uniformes en áreas,
  áreas a barras, fuerzas en nudos y temperatura en barras. No lee presión de viento
  automática, gravedad ni temperatura en áreas: un patrón que solo tenga eso sale sin cargas.
- **Las cargas se agrupan por valor, no por objeto.** «0,769 kN/m en 22 barras» no dice cuáles
  son las 22; para justificar un valor alcanza, para ubicarlo en el modelo no.
- **Falta el paso que da sentido a la lectura:** atar cada carga a una expresión de la obra y
  decir si coincide (como un campo atado, convirtiendo con el motor), y leer el espectro.

Lo que dejó a la vista la primera comparación de Load Patterns contra el modelo del Pachón,
para la sesión de ajustes:

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

- **math.js simplifica las unidades al mostrarlas**: `5 kN * 2 m =` sale `10 kJ`, un momento
  escrito como energía, y 1.108 kN sale «1,108 MN». Solo se evita con `= kN*m`. Cambiarlo toca
  miles de resultados del corpus y la paginación: necesita su propia medición antes de decidir.
- **Rendimiento de `evaluateSheet`**: ~1,4 s en `muro-flexocompresion` (646 regiones), y
  escala peor que lineal; el coste está casi entero en las regiones `program` (sin ellas,
  14 ms). Sospecha: math.js normaliza el scope en cada `evaluate`; la vía sería llevarlo como
  `Map`. Hay que instrumentarlo desde Node.
- Un esquema que llama a una función de usuario la evalúa con el scope **final** de la hoja,
  no con el de su posición.
- NaN, infinitos y complejos se formatean mal (`Infinity` en cursiva, `1e+6i`).
- `atan` devuelve un número sin unidad, y `f(x) := …` en una región `math` da «Value expected
  (char 10)» sin decir que tiene que ir en un `program`.
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
- El aviso de «bloques más altos que una A4» no dice cuáles; `usePaginacion` ya tiene la
  lista.
- Si el corte de página cae en el pie, la línea no se dibuja (`__footer` no es una región).
- Las imágenes se descodifican enteras antes de mirar `file.size`; los SVG entran sin límite.
- No se puede copiar texto del canvas: `select-none` va en la raíz de cada región.
- Diálogos nativos (`confirm`/`alert`) en siete sitios; si el navegador los desactiva, varios
  errores se vuelven silenciosos.
- Deshacer descarta siempre la selección; dos deep-links a la vez disparan dos cargas.
- El textarea de un programa no tiene tope de ancho.
- La copia apartada por un conflicto entre pestañas se descarga, no se restaura en la hoja.
- Un espaciador solo se ve con el cursor encima: nada marca un hueco deliberado.
- Falta `touch-action: none` en el arrastre: en táctil hace scroll.
- **Limpieza pendiente dentro de `src/lib/`**, para el próximo cambio del motor (no vale un
  resellado por sí sola): `ruta.ts` dice «cinco vistas» (son nueve); `abrirEnCanvas` de
  `canvas-handoff.ts` quedó sin uso —lo reemplazó `components/canvas/abrir-en-canvas.ts`, que
  no pisa la hoja— y su comentario cita un `loadInitial()` que ya no existe; y quedan «acá»
  en comentarios. Fuera de `src/lib/` ya se corrigieron.
- **Accesibilidad**: las regiones no tienen `tabIndex`, `role` ni `aria-`; no se recorren ni
  mueven sin ratón, y los estados se comunican solo por color; las figuras van con `alt=""`.
  Conviene esperar a la lista ordenada, donde «recorrer con el teclado» tiene respuesta obvia.
- **(muere con el flujo lineal)**: dos regiones que se pisan se roban los clics y el detector
  de solapes da falsos positivos porque toda región mide el ancho del papel; el título abre
  varias planillas con la banda ámbar; el `<textarea>` de un texto no mide lo mismo que su
  `<p>`; no hay desplazamiento automático al arrastrar cerca del borde; el `ResizeObserver` se
  reconecta en cada `pointermove`; pegar un fragmento no evita solapes; alinear y distribuir.
