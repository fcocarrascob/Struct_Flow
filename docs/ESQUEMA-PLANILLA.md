# Esquema de una planilla del canvas

Contrato para escribir una planilla de `/canvas` **fuera del canvas** — desde una
conversación, un script o a mano. Es la referencia única: todo lo que sigue está leído
del código, no de memoria, y cada regla apunta a dónde vive.

| Pieza | Archivo |
|---|---|
| Motor y gramática | `src/lib/worksheet.ts` |
| Intérprete de `program` | `src/lib/program.ts` |
| Constructores de layout | `src/lib/worksheet-layout.ts` |
| Esquemas paramétricos | `src/lib/esquema.ts` |
| Contrato del `meta` | `src/lib/biblioteca/contrato.ts` |
| Verificador | `scripts/verify-planilla.mjs` → `scripts/lib/planilla.mjs` |
| Render a HTML/PDF | `scripts/render-planilla.mjs` → `src/lib/render-html.ts` |

**Nada se da por bueno hasta que pasa el verificador:**

```bash
npm run verify:planilla -- <archivo.json>                  # una, o varias, o un directorio
npm run verify:planilla -- <archivo.json> --md             # además, el desarrollo como tablas
npm run verify:planilla -- <archivo.json> --md-out <ruta>  # y lo escribe como <slug>.eval.md, con sello
npm run verify:planilla -- <archivo.json> --esquemas <dir> # busca los /esquemas/ también en <dir>
npm run verify:planillas                                   # todas las de public/planillas/
npm run render:planilla -- <archivo.json> --pdf <salida>   # el papel del canvas, por línea de comandos
```

Sale con código 1 si alguna región tiene error, si una comparación da `false` sin estar
declarada, si una declarada como falsa ahora pasa, o si el `meta` no cumple el contrato
de su clase (§10). Ese es el contrato real; este documento solo explica cómo escribir algo
que lo cumpla.

El `.eval.md` que escribe `--md-out` abre con un **sello**:

```
<!-- planilla: <slug> · sha256: <hash del JSON> · struct_flow: <commit de este repo> · <fecha ISO> -->
```

Es lo que el harness compara para saber si un eval sigue describiendo la planilla que
hay en disco — por hash y no por fecha, porque git no conserva fechas de archivo.

---

## 1. El envoltorio

```json
{
  "version": 1,
  "meta": {
    "titulo": "Viga de hormigón armado a flexión y corte — Cap. 9 de ACI 318-25",
    "ficha": "struct_pad/src/content/hormigon/ejemplo-viga-flexion-corte.mdx",
    "esperadoFalso": { "c_mu": "el ejemplo del post falla a propósito acá" }
  },
  "regions": [
    { "id": "d-01", "kind": "text", "x": 40, "y": 40, "src": "━━ DATOS ━━" },
    { "id": "d-02", "kind": "math", "x": 40, "y": 86, "src": "fc := 250 kgf/cm^2" }
  ]
}
```

`version` y `regions` son el formato de export/import del canvas. `meta` lo entiende el
verificador; el canvas hoy solo usa `meta.titulo`, para preguntar antes de reemplazar la
hoja. `titulo` es lo único obligatorio; el resto del `meta` —la clase, las normas, las
entradas declaradas— está en §10.

## 2. La región

Definida en `worksheet.ts:64`:

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `string` | **Único y estable.** `meta.esperadoFalso` se indexa por él. |
| `kind` | `'math' \| 'text' \| 'program' \| 'image'` | |
| `x`, `y` | `number` | Posición en px sobre la hoja, ajustada a la cuadrícula. |
| `src` | `string` | Expresión, texto libre o fuente de imagen según el `kind`. |
| `w`, `h` | `number?` | Solo `image`: tamaño mostrado. Sin ellos, el natural. |
| `pageBreak` | `boolean?` | Al imprimir, esta región abre una A4 nueva. |

### Convención de ids

El verificador cuenta como **contraste** toda verificación cuyo id empiece con `c_`
(`verify-planilla.mjs:268`): son las que comparan contra un número que el post publica. El
resto son chequeos internos de la hoja (rangos de tabla, equilibrios) y no cuentan. Usa el
prefijo `c_` solo para lo que de verdad contrasta contra una fuente externa.

## 3. Disposición: una sola columna, siempre

`evaluateSheet` evalúa con un **scope compartido en orden de lectura: `y` ascendente, luego
`x`** (`worksheet.ts:259`). Una hoja a dos columnas se evalúa **cruzando columnas dentro de
cada fila**, no hacia abajo por columna, y produce «variable indefinida» donde nadie lo
espera.

Por eso todas las planillas publicadas van en una columna: `x: 40` fijo y `y` creciente. El
paso que usa `layout()` (`worksheet-layout.ts:26`) es **46 px** por región de una línea, y
`líneas * 22 + 28` en las multilínea.

Si generas la hoja desde TypeScript, usa esos constructores en vez de calcular `y` a mano:

```ts
import { layout, m, t, p } from './worksheet-layout';

const regions = layout('viga', 40, 40, [
  t('━━ DATOS · MATERIALES ━━'),
  m('fc := 250 kgf/cm^2'),
  m('fy := 4200 kgf/cm^2'),
]);
```

Importar de ahí **no arrastra mathjs al bundle**: los tipos son `type`-only y se borran al
compilar.

**Los datos de entrada van todos arriba y a la vista, nunca incrustados dentro de una
fórmula.** Es lo que hace que la planilla sea paramétrica: al editar un dato, todo lo de
abajo se recalcula.

## 4. Regiones `math`

La gramática que parsea `parseMathRegion` (`worksheet.ts:121`):

| Forma | Qué hace |
|---|---|
| `nombre := expr` | Define `nombre` en el scope, sin mostrar resultado. |
| `nombre := expr =` | Define **y** muestra el resultado. |
| `expr =` | Solo evalúa y muestra. |
| `nombre := expr = unidad` | Además convierte a esa unidad, con chequeo dimensional. |

La conversión es el motivo por el que existe el verificador: `Mn := As*fy*d = kN*m` **falla**
si las unidades no cuajan, y ese fallo es lo que atrapa un error de transcripción que ninguna
revisión de resultados encuentra.

### La sutileza del `=` final

`TRAILING_EQ_RE` (`worksheet.ts:118`) toma el último `=` de nivel superior, y solo lo trata
como «mostrar» si lo que sigue está vacío o **parece una unidad** (letras, dígitos, `*`, `/`,
`^`, paréntesis, y al menos una letra). Consecuencias prácticas:

- `<=`, `>=`, `==`, `!=` y `:=` **no** lo disparan: una comparación se escribe con normalidad.
- `a = b + c` no se lee como display, porque la cola no parece unidad.
- Un nombre de variable en la cola **sí** parece unidad y se intentará convertir. Si quieres
  mostrar a secas, deja la cola vacía: `x =`.

### Chequeos: la forma de concluir algo

Una comparación con `=` final devuelve un booleano y el canvas la pinta ✓ o ✗
(`RegionResult.bool`, `worksheet.ts:311`):

```
phiMn >= Mu =
As >= Asmin =
et >= ety + 0.003 =
```

Un `false` hace fallar el verificador **salvo** que su id esté en `meta.esperadoFalso` con la
razón escrita. Eso es para los casos en que el hallazgo del ejemplo *es* que no cumple. Si una
excepción declarada empieza a pasar, el verificador también avisa: la excepción quedó
obsoleta y hay que borrarla.

### Unidades

`tonf` (alias `tf`) está registrada localmente como 1000 kgf (`worksheet.ts:24`); `kgf` ya
viene en mathjs. Las compuestas se derivan solas: `kgf/cm^2`, `tonf*m`, `tonf/m`. `max` y
`min` de mathjs ya comparan cantidades con unidad, así que `max(2.5 tonf, 30 kN)` funciona.

### Funciones de diseño disponibles

Registradas en toda hoja (`worksheet.ts:30-57`):

| Función | Devuelve | Si recibe un número plano |
|---|---|---|
| `beta1(fc)` | β₁ del bloque rectangular (ACI 318-25, Tabla 22.2.2.4.3) | lo interpreta en **MPa** |
| `sqrtfc(fc)` | √f'c **como tensión en kgf/cm²** | lo interpreta en **kgf/cm²** |
| `phiFlexion(et, ety)` | φ de flexión (Tabla 21.2.2), interpolado en la transición | — |

`sqrtfc` devuelve una tensión, no un número, justamente para que los coeficientes empíricos de
la práctica local (0,53 · 0,8 · 2,1 · 14) queden dimensionalmente coherentes.

## 5. Regiones `text`

Texto plano. No se evalúa, no aporta ni consume variables, y **se excluye del orden de
lectura** (`worksheet.ts:260`). Sirve para los encabezados que separan bloques:

```
━━ DATOS · GEOMETRÍA (b: ancho · d: peralte efectivo) ━━
Resistencia a flexión:  φMn ≥ Mu
Corte de diseño a distancia d de la cara del apoyo (Sec. 9.4.3.2)
```

**Con el `src` vacío es un espaciador:** un hueco deliberado de 16 px que ocupa lo mismo en la
hoja y en el PDF. Es el único caso en que una región sin contenido es válida y se conserva —
una `math` o una `program` vacía se descarta al guardar, porque esa es un bloque a medio
escribir. En el canvas lo inserta `Enter` con el punto de inserción puesto.

## 6. Regiones `program`

Un intérprete imperativo mínimo (`program.ts`), porque mathjs no tiene control de flujo. **Los
bloques se definen por indentación, como en Python.**

Cabeceras:

- `nombre := <programa>` — exporta el valor de retorno como variable.
- `nombre(a, b) := <programa>` — define una función reutilizable. El closure captura el scope
  vivo, así que ve las variables de la hoja al llamarse, y permite recursión.
- Sin cabecera — se ejecuta y muestra su valor de retorno.

Sentencias del cuerpo: `nombre := expr`, `return expr`, `if` / `else if` / `else`,
`for v in 1:n` o `for v in [..]`, `while cond`, `break`, `continue`. Una expresión suelta al
final es el retorno implícito.

```
gobierna(a, b) :=
    if a < b
        return "estado A"
    else
        return "estado B"
```

Dos detalles que importan:

- Un programa **inline** (con cabecera de variable, sin paréntesis) corre sobre una **copia**
  del scope: sus variables internas no contaminan la hoja. Solo se exporta el retorno.
- Hay un tope de 100.000 iteraciones acumuladas contra bucles infinitos.

## 7. Regiones `image`

`src` es una ruta del sitio (`/esquemas/x.svg`) o un data URI. No se evalúan, pero **sí
participan del orden de lectura**: capturan el scope visible en su posición para que un
esquema paramétrico rotule con las variables definidas más arriba (`worksheet.ts:269`).

Un SVG bajo `/esquemas/` se dibuja con los rótulos como tokens `{{expr}}`, que `esquema.ts`
sustituye contra ese scope:

```svg
<text>l = {{l_w:cm}} cm</text>          <!-- solo el número, convertido a cm -->
<text>U = {{U_5}}</text>                <!-- valor a secas -->
<polyline points="{{pts_px:svg}}" />    <!-- :svg = geometría cruda, para un ATRIBUTO -->
```

El modificador `:svg` es obligatorio dentro de un atributo: el formato de rótulo sale con coma
decimal y `width="211,4"` es SVG inválido. **Un token que no resuelve hace fallar el
verificador**, igual que un número.

## 8. Footguns registrados

Cosas que no fallan: devuelven otro número en silencio.

- **Una variable que eclipsa una unidad.** En mathjs `4 m` son cuatro metros, salvo que la
  hoja haya definido una variable `m`: ahí son `4·m`. El 2026-08-07 la planilla de rigidez
  rotacional definió `m` (el voladizo de la placa, como lo llama la DG1) y su `L_col := 4 m`
  pasó a valer 33 cm, con el índice β·L/EI 12,1 veces más chico; solo lo delató el contraste
  contra el post. El verificador ahora lo caza (`unidadesEclipsadas`), pero la regla al
  escribir es simple: **no uses como nombre de variable algo que sea una unidad** (`m`, `s`,
  `A`, `N`, `T`, `W`, `g`, `t`…), o escribe el producto explícito con `*`.
- **Un resultado enorme se resume, no se vuelca.** Por encima de 12 entradas, una matriz se
  imprime como `matriz 200×2` (`MAX_ENTRADAS_TEX`, `worksheet.ts:212`). La variable queda
  íntegra en el scope; lo que se recorta es la impresión. Es deliberado: un barrido de 200
  puntos metería 400 números en una región y reventaría la paginación.
- **`= unidad` sobre algo sin unidades lanza.** Si el resultado es adimensional, deja la cola
  vacía.

## 9. Dónde va el archivo

- **Planilla publicada junto a un post**: `public/planillas/<slug>.json`, donde `<slug>` es el
  id del post **sin** el prefijo `ejemplo-`. Con eso el enlace aparece solo
  (`src/lib/planillas.ts`), y el deep-link `/herramientas/canvas?planilla=<slug>` la importa
  al abrir.
- **Borrador de una conversación**: cualquier ruta. Se verifica igual, y se abre en el canvas
  pegándola con el botón «Pegar JSON» o con Ctrl+V sobre la hoja.

La galería de `worksheet-templates.ts` es otra cosa y **no** crece con cada ejemplo: son
plantillas compiladas al bundle, no archivos sueltos.

## 10. El `meta` extendido: clase, normas, entradas y salidas

Definido en `src/lib/biblioteca/contrato.ts` (`MetaPlanilla`) y validado por
`validarMeta`, que corre dentro de `verify:planilla`. Es **compatible hacia atrás**: una
planilla con solo `meta.titulo` es de clase `ejemplo` y pasa igual que antes.

```json
"meta": {
  "titulo": "Placa base de columna con gran excentricidad — aplastamiento, equilibrio, pernos y espesor",
  "slug": "placa-base-generica",
  "clase": "generica",
  "disciplina": "acero",
  "resumen": "Placa lisa o rigidizada bajo columna con momento. Entrega T_grupo e Yb al resto de la base.",
  "normas": [
    { "clave": "US/AISC-DG1-3ed", "rol": "procedimiento", "articulos": ["§4.3.7"] },
    { "clave": "US/ACI318-25-SI", "rol": "anclaje", "articulos": ["§17.6.1"] }
  ],
  "entradas": [
    { "nombre": "t_bp", "etiqueta": "Espesor de la placa", "unidad": "mm", "grupo": "Geometría", "min": 10, "max": 120, "paso": 1 },
    { "nombre": "hay_nervios", "etiqueta": "Rigidización", "grupo": "Rigidización",
      "opciones": [{ "valor": 0, "etiqueta": "placa lisa" }, { "valor": 1, "etiqueta": "silla con nervios" }] }
  ],
  "salidas": [
    { "nombre": "u_max", "etiqueta": "Uso máximo", "tipo": "uso" },
    { "nombre": "gobierna", "etiqueta": "Estado límite que gobierna", "tipo": "texto" },
    { "nombre": "v_global", "etiqueta": "u_max ≤ 1", "tipo": "veredicto" }
  ],
  "fronteras": ["β entra medido o de tabla, con la condición de borde declarada"],
  "hipotesis": ["Una fila de pernos por lado"],
  "entrega": { "T_grupo": ["silla-anclaje-generica", "pedestal-generico"] },
  "casos": [
    { "nombre": "ejemplo de referencia", "entradas": {}, "cumple": true },
    { "nombre": "chapa de 20 mm", "entradas": { "t_bp": 20 }, "cumple": false, "esperadoFalso": ["v_espesor", "v_global"] }
  ]
}
```

### Las tres clases

| `clase` | Qué es | Vive en | Exige |
|---|---|---|---|
| `ejemplo` | Un ejemplo resuelto, ligado a un post. Lleva contrastes `c_*` contra los números publicados | `public/planillas/` | solo `titulo` |
| `generica` | Una plantilla reutilizable: sin datos de proyecto fuera de las entradas, cargada con un ejemplo que cierra en verde | `public/biblioteca/<disciplina>/` | `slug`, `disciplina`, `normas`, `entradas`, las tres salidas `u_max` (uso) · `gobierna` (texto) · `v_global` (veredicto), al menos un caso con `cumple: true`, **cero** `c_*` y **cero** `esperadoFalso` |
| `instancia` | Una genérica llevada a un proyecto: se cambian las entradas, se agregan los `c_*` contra el modelo y la memoria | el proyecto, fuera de este repo | `slug`, `normas`; `origen` con el `slug` y el `sha256` de la genérica si sale de una; `modelo` recomendado |

### Las entradas: regiones `in_<nombre>`

Una entrada es una región `math` cuyo **id** es `in_` + el nombre de la variable y cuyo
`src` tiene exactamente la forma `nombre := número [unidad]` (`RE_ENTRADA`). Ni `2*pi`
ni `sqrt(2) m`: una entrada es un dato que se reemplaza entero. Lo que necesite fórmula
es derivación y va debajo del bloque DATOS.

```json
{ "id": "in_t_bp", "kind": "math", "x": 40, "y": 400, "src": "t_bp := 45 mm" }
```

La unidad del `src` y la de `entradas[i].unidad` tienen que coincidir: es la unidad con
la que un formulario o el instanciador del harness reescriben el valor. Una entrada no
puede llamarse como una unidad o función del motor (`m`, `s`, `min`, `e`…).

`instanciarRegiones(regions, valores, entradas)` devuelve la copia con esas regiones
reescritas; `valoresDeEntradas(regions, entradas)` lee los que la hoja trae. Es todo lo
que hace falta para que una genérica sea un módulo de `/diseno` sin escribir código.

### Las salidas y los veredictos

Una salida es una variable del scope. Un `veredicto` es una **variable booleana** con
nombre: `v_global := u_max <= 1 =`, no `u_max <= 1 =` a secas. Es como lo leen los
módulos de diseño (`PanelResultados`) y como lo exige una genérica.

### Las normas y la cita

`normas[].clave` es la clave del catálogo del harness (`PAIS/NORMA-EDICION`), que es lo
que permite comprobar que la norma está calibrada. En las regiones `text` la cita es **el
artículo y nada más** —`§4.3.7`, `Tabla 22.5.5.1`, `Ec. (13)`—: la evidencia de lectura
(`pdf 56 = impresa 51 · rasterizada 2026-08-20`) vive en el acta de lectura del harness,
no en la hoja. El verificador avisa si una región de texto la trae.

### `origen` y `modelo` de una instancia

```json
"origen": { "slug": "viga-carrilera-generica", "commit": "<HEAD de Struct_Flow>", "sha256": "<sha de la genérica>", "fecha": "2026-09-11",
            "desvios": "Calcula el PNA; +86 regiones; sección como SVG embebido" },
"modelo": { "archivo": "10_modelo/v38_CONEXIONES_2026-08-31.sdb", "barras": ["VC_A_*"], "patrones": ["CM_VIA", "CL_D"] },
"decisiones": ["D-07", "D-36"],
"figuras": [ { "region": "r006", "fuente": "20_calculo/figuras/viga-carrilera-seccion.svg" } ]
```

`origen.sha256` es lo que se compara después: si la genérica avanzó, la instancia quedó
atrás y alguien tiene que mirar. Se compara por hash y no por ids porque una instancia
puede reordenar y agregar regiones.

---

## Aviso para quien genere esto desde un chat

Si estás escribiendo una planilla en claude.ai, **no puedes correr el verificador**, así que lo
que produzcas es un **borrador**. Los errores que más importan aquí —una unidad que no cuaja,
una variable que eclipsa a `m`, un coeficiente mal transcrito— no se ven leyendo el resultado:
la aritmética cierra consigo misma. Entrégala diciendo que falta verificarla, y que se cierra
con:

```bash
npm run verify:planilla -- <archivo.json> --md
```
