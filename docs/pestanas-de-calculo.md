# Pestañas de cálculo: un nodo de obra que se abre como hoja

**2026-09-17.** Diseño acordado. Se escribió antes que el código porque la decisión que lo
define no es la del canvas, y equivocarla se paga en el modelo.

**Fase 1 hecha el mismo día**, que es todo lo que no se ve: el canvas separado de su origen
(`useHojaPersistida` + `origen-local`) y el modelo del nodo pasado a `hoja: Region[]` con
`frontera?`. Faltan las pestañas y las tres entradas. Tres decisiones que este documento
dejaba abiertas y se cerraron al empezar:

1. **Una sola hoja por nodo, con `frontera?` opcional.** Sin frontera es hoja libre y
   comparte el scope de la obra; con frontera tiene scope propio y procedencia. Es la
   simplificación que la sección «Con eso, los tres casos son uno solo» promete, y no dos
   campos conviviendo. El precio está abajo, en «Lo que el cambio se llevó».
2. **La pestaña activa vivirá en el estado de `CanvasObra`**, no en la ruta: `parsearRuta`
   solo mira el `pathname` y la query es un canal de arranque que se autodestruye, así que
   modelarla costaría extender `Ruta` y reabriría el 404 de recarga en despliegue estático.
3. **Por fases, con parada tras la primera.**

## Qué se quiere

En una obra (`/obra/<id>`), que un nodo de cálculo se pueda abrir como **pestaña a nivel de
vista**, con el canvas matemático entero dentro:

```
[ Obra ] [ Planilla 1 ] [ Planilla 2 ]
```

Tres entradas a lo mismo:

1. En un nodo de cálculo vacío, **«Crear planilla de cálculo»** abre una pestaña con
   `MathCanvas` para escribir la hoja de ese nodo.
2. En un nodo respaldado por una genérica, poder **abrirla para verla**.
3. Y poder **editarla**, si hay que apartarse de la genérica.

El fin es el control: hoy una obra encadena cálculos, pero el cálculo propio de un nodo se
escribe en una mini hoja de tres botones, y el de una genérica no se puede ni mirar entero.

## La decisión: el scope, no el canvas

Una obra ya distingue dos clases de nodo, y la diferencia real no es «hoja corta contra
planilla»: es **dónde vive su espacio de nombres**.

- Una **hoja libre** comparte scope con toda la obra. Lo que define lo ve todo el mundo, y esa
  es justamente su utilidad: es la geometría y los datos comunes.
- Una **planilla importada** tiene scope propio, y lo único que cruza la frontera es lo que
  su `publica` declara.

**Una planilla del nodo tiene que ser de la segunda clase**, y no es una preferencia:
`pedestal-generico` define más de 300 nombres —`d`, `As`, `phi`, `b`, `s`…—. Si sus regiones
entraran al scope compartido, cualquier nodo posterior colisionaría con media docena de ellos
y el canvas se llenaría de rojos de «definida en 2 nodos» sin que nadie haya escrito nada
mal. El aviso que hoy señala un error de verdad pasaría a ser ruido, y un aviso que salta por
lo que no es deja de leerse.

## Con eso, los tres casos son uno solo

Un nodo de cálculo pasa a ser un **cálculo con frontera**: se alimenta por campos atados
(`formulas`) y entrega por `publica`, exactamente como ya funciona una planilla importada. Lo
único que cambia es de dónde salen sus regiones:

| Procedencia | Qué es | Sello |
|---|---|---|
| `biblioteca` | una referencia al slug, que se instancia al abrir la obra | el `sha256` de la genérica |
| `propia` | regiones escritas aquí y guardadas en el documento de la obra | ninguno |
| `derivada` | una copia de una genérica, ya editada | `origen` + `desvios` |

`Importada` se generaliza a eso; `publica`, `formulas` y `salida` siguen valiendo tal cual,
y con ellos todo lo que ya cuelga de ellos: el orden topológico, las flechas derivadas, el
aviso de alias repetido y la detección de ciclos.

**Esto simplifica el modelo en vez de complicarlo.** Hoy hay dos cosas que se parecen y se
tratan distinto; después hay una con tres procedencias.

## Editar una genérica es una transición de estado

`public/biblioteca/README.md` dice que la fuente de verdad de una genérica es su JSON y que
no se edita encima de la que respalda una memoria. Eso no impide esta función: la ordena.

Al pulsar editar, la planilla **se desprende**. Sus regiones se copian al nodo y la
procedencia pasa de *sellada* a *derivada de `<slug>@<sha256>`*. Deja de tener sentido el
aviso de «la genérica cambió» —ya no es una instancia de nada— y pasa a tenerlo la
procedencia: de dónde salió y en qué versión.

El vocabulario ya existe: `origen.desvios` de `src/lib/biblioteca/contrato.ts` es
exactamente eso, y es lo que hace que la memoria exportada siga sin mentir sobre su origen
cuando entre a un proyecto del harness.

## El nodo guarda `Region[]`

Y no una lista de bloques sin coordenadas, que es lo que guarda hoy. `Region` es el tipo que
ya usan `evaluateSheet`, `hoja-json.ts`, `WorksheetPrint` y la biblioteca entera: convertir
entre dos formatos en cada frontera es donde aparecerían los bugs.

La mini hoja pasa a ser **una vista en orden de lectura** sobre esas regiones, y la pestaña
es la vista en el plano. Las dos editan el mismo dato. El día que la hoja grande migre al
flujo lineal (`docs/pendientes.md`, «El norte cambió»), las `x`/`y` desaparecen de los dos
sitios a la vez y ninguna de las dos vistas se entera.

## Lo que NO hace falta

**Un editor de `meta`.** «Definir inputs, outputs y verificaciones» en una obra ya tiene otro
nombre: el input es un campo atado, el output es `publica`, y las verificaciones son las
variables `v_*` del scope, que `PanelResultados` sabe leer sin que nadie las declare. El
`meta` formal —`meta.entradas`, las regiones `in_*`, `RE_ENTRADA`— solo hace falta para
**promover** una hoja a la biblioteca, y ese flujo ya tiene sus herramientas
(`promover-entradas.mjs`, `estampar-meta.mjs`). Además, la regla 1 de la biblioteca dice que
se generaliza a la segunda vez, no a la primera: pedir el `meta` al crear una hoja sería
pedirlo justo cuando todavía no se sabe si esa hoja se va a repetir.

**Migrar el plano.** Ver arriba: el canvas se queda con sus coordenadas hasta que la
migración al flujo lineal las retire de todo el repo.

## Lo que cuesta

Hacer `MathCanvas` controlable. No es difícil: es **ancho**. Son 1.946 líneas con 36 hooks,
y el estado de la hoja está entretejido con su persistencia.

- **El origen de la hoja**, en unos diez sitios: `guardarHoja`, el debounce de 300 ms, el
  guardado al desmontar, `pagehide` y `visibilitychange`, el listener de `storage`,
  `CLAVE_APARTADA` y `hayTrabajoGuardado`. Todo eso quiere salir a un hook inyectable: en
  `/canvas` la hoja de `localStorage`, en una obra la hoja de un nodo.
- **Los deep-links** (`?planilla=`, `?plantilla=`) y el diálogo de reemplazo: son de
  `/canvas` y se apagan con un prop.
- **Seis listeners globales** —`paste`, dos de `keydown`, `drop`, `dragover`— y el portal de
  `WorksheetPrint` a `<body>`. Se resuelven con una regla de interfaz: **se monta únicamente
  la pestaña activa**. Dos canvas a la vez se pelean por `Ctrl+V` y dejan dos documentos de
  impresión en el `<body>`.
- **`useHistorial`**: decidir de quién es `Ctrl+Z` en cada pestaña. Como el historial observa
  el documento en vez de envolver a los ocho sitios que lo modifican, es un hook por pestaña
  y no una refactorización.

Estimado: dos o tres días el modelo y las pestañas, tres o cuatro el canvas controlado, uno
de pruebas a mano. Una semana y media.

## Por dónde empezar, y dónde está el riesgo

**Por el hook de persistencia, no por las pestañas.** Extraerlo con `/canvas` funcionando
exactamente igual, y comprobarlo antes de que exista ninguna obra que lo use.

El riesgo está casi entero ahí. `/canvas` es la parte más usada de la aplicación y **no tiene
ninguna red automática**: ese refactor toca deep-links, autoguardado, dos pestañas
pisándose, impresión y portapapeles, que es justo lo que la auditoría del 2026-09-10 arregló
a mano y que hoy no comprueba nadie. Hay que probarlo en el navegador, no solo compilar.

## Lo que hay que comprobar

- `npm run verify:obra` cubre la capa pura de una obra. **Los casos se escriben antes de
  cambiar el modelo**, sobre todo el scope propio de un cálculo y el desprendimiento de una
  genérica: una hoja de nodo con 300 nombres no puede filtrar ninguno al scope común.
- `verify:motor`, `verify:planillas`, `verify:biblioteca`, `verify:modulos` y `npm run build`
  siguen en verde.
- A mano en `/canvas`: cargar una planilla por deep-link, escribir sin pausa y recargar,
  dos pestañas del navegador sobre la misma hoja, imprimir, y pegar un JSON.
- Si se toca `src/lib` o `scripts`, resellar en Struct_Harness
  (`python -m harness.herramientas --sellar struct_flow`) y commit `[harness]`.

## Trampas

- **Los ids de bloque son las claves de `results`** en la hoja global de la obra: dos
  regiones con el mismo id comparten resultado y `key` de React. `sanearRegiones` ya
  deduplica, y el saneo de la obra también; traer regiones de una genérica a un nodo tiene
  que pasar por ahí.
- **El orden topológico ES el orden de lectura** (`evaluacion.ts`): cambiarlo cambia lo que
  cada nodo ve y lo que le ofrece el autocompletado.
- La evaluación de una obra va **por tramos**, acumulando scope, y cada planilla se evalúa
  con el scope de *su* posición. No conviene volver a una sola pasada.
- `localStorage` no es el cuello de botella: la genérica más grande del repo pesa 81 KB, así
  que caben decenas de hojas propias en los ~5 MB. Con exportar e importar, alcanza.

## Lo que el cambio se llevó, y lo que no

**El aviso de «hoja tapada» ya no existe**, y con él la función que lo emitía. Decía qué
nombres dejaba de ver la obra cuando un nodo con hoja libre pasaba a estar respaldado por
una planilla. Con una sola hoja por nodo esa situación no se puede dar: o el nodo tiene
frontera o no la tiene.

**Lo que sí sobrevive es el tanteo.** La migración no borra nada: un nodo que traía
`bloques` y `importada` se lee con esos bloques en su `hoja` y su `frontera` de procedencia
`biblioteca`. La hoja no se evalúa mientras la frontera sea de la biblioteca —igual que
antes—, y quitar la planilla la devuelve. Lo que se perdió es el aviso, no los datos.

**`problemaDeGrafo` gana un diagnóstico**: un campo atado que la propia hoja vuelve a
definir. El valor atado entra como scope inicial y la región lo pisa después, así que el
campo no tiene ningún efecto y el número sale plausible y equivocado — la primera clase de
falla de la taxonomía. Solo aplica a `propia` y `derivada`; en una de `biblioteca` un campo
atado reescribe la región `in_*` que lo declara, así que no hay nada que tapar.

**Una trampa que apareció al implementar, y no estaba escrita acá.** Las regiones de un nodo
traen sus propias coordenadas y **todos los nodos empiezan en `y = 40`**: concatenarlas tal
cual para armar la hoja global interleaveaba las hojas y rompía el orden topológico, que ES
el orden de lectura. `evaluarObra` re-estampa cada hoja debajo de la anterior conservando su
forma interna y su `x` —y con ella una segunda columna que el autor haya abierto en el
canvas—, y avanza el paso **antes** de emitir: con el paso después, la primera región de un
nodo empataba en `y` con la región fantasma de lo que publicó el nodo anterior, y el
desempate lo decidía la `x`, que es la del papel y no dice nada del orden entre nodos.
