# Esquema de una planilla del canvas

Contrato para escribir una planilla de `/herramientas/canvas` **fuera del canvas** — desde
una conversación, un script o a mano. Es la referencia única: todo lo que sigue está leído
del código, no de memoria, y cada regla apunta a dónde vive.

| Pieza | Archivo |
|---|---|
| Motor y gramática | `src/lib/worksheet.ts` |
| Intérprete de `program` | `src/lib/program.ts` |
| Constructores de layout | `src/lib/worksheet-layout.ts` |
| Esquemas paramétricos | `src/lib/esquema.ts` |
| Verificador | `scripts/verify-planilla.mjs` |

**Nada se da por bueno hasta que pasa el verificador:**

```bash
npm run verify:planilla -- <archivo.json>        # una, o varias, o un directorio
npm run verify:planilla -- <archivo.json> --md   # además, el desarrollo como tablas
npm run verify:planillas                         # todas las de public/planillas/
```

Sale con código 1 si alguna región tiene error, si una comparación da `false` sin estar
declarada, o si una declarada como falsa ahora pasa. Ese es el contrato real; este
documento solo explica cómo escribir algo que lo cumpla.

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

`version` y `regions` son el formato de export/import del canvas. `meta` es opcional y solo
lo entiende el verificador: el canvas lo ignora, salvo `meta.titulo`, que usa para preguntar
antes de reemplazar la hoja (`MathCanvas.tsx:166`).

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
