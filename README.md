# Struct_Flow — memorias de cálculo estructural

Dos formas de llegar a la misma memoria de cálculo:

- **El canvas**, una hoja estilo SMath donde haces clic en cualquier parte del lienzo y
  escribes expresiones con unidades, que se evalúan con [math.js](https://mathjs.org) y se
  renderizan con [KaTeX](https://katex.org).
- **Los módulos de diseño**, donde ingresas parámetros, ves el elemento redibujarse y los
  factores de utilización moverse, y exportas la memoria cuando cuadra.

- `nombre := valor` define una variable
- un `=` final muestra el resultado
- `= unidad` convierte y **verifica la coherencia dimensional**

Las variables se comparten entre regiones en orden de lectura (arriba→abajo,
izquierda→derecha), como en SMath Studio. Hay además bloques de programación con
indentación estilo Python (condicionales, bucles, funciones) y un documento de impresión
que refluye la hoja a una memoria de cálculo paginada en A4.

## Cómo correrlo

```sh
npm install
npm run dev              # http://localhost:5173
npm run build            # typecheck + build de producción
npm run verify:planillas # evalúa las 33 planillas fuera del navegador
npm run verify:modulos   # evalúa los módulos de diseño y sus memorias exportadas
```

Requiere Node >= 22.12.0.

### Las rutas

| | |
|---|---|
| `/` | el menú |
| `/planillas` | el catálogo de las 33 memorias publicadas |
| `/canvas` | la hoja |
| `/diseno` · `/diseno/<id>` | los módulos de diseño |

La navegación es un micro-router propio (`src/lib/ruta.ts`, ~70 líneas): para cinco vistas
no se justifica una dependencia más. Al servir la aplicación en producción hace falta el
*fallback* de SPA —cualquier ruta devuelve `index.html`—, que `vite dev` y `vite preview`
ya hacen solos.

### Diseño de elementos

Un módulo **no calcula por su cuenta**: declara qué parámetros pide y qué resultados
enseña, y sabe armar con ellos una hoja del canvas. Quien calcula es `evaluateSheet`, el
mismo motor que corre las 33 planillas. De una sola evaluación salen las tres cosas —los
resultados en vivo, el esquema SVG y la memoria que se exporta—, así que lo que se ve
mientras se diseña y lo que sale exportado no pueden divergir.

Añadir un elemento son dos archivos: uno en `src/lib/diseno/` que implemente
`ModuloDiseno` (`src/lib/diseno/tipos.ts`) y su SVG en `public/esquemas/`. El formulario,
el visor, el panel de resultados y los botones de exportación son un armazón genérico.

Hay dos módulos:

- **`viga-hormigon`** — viga de hormigón armado a flexión y corte, la versión breve de
  `public/planillas/viga-flexion-corte.json` (ACI 318-25, Cap. 9). Su esquema es el primero
  del repo cuya **geometría** es paramétrica y no solo los rótulos: la sección se redibuja
  con `b_w`, `h`, el recubrimiento y el diámetro de las barras. Como SVG no tiene bucles y
  el número de barras es variable, se dibujan diez círculos y la hoja anula el radio de los
  que sobran.
- **`seccion-acero-i`** — perfil I doblemente simétrico: compresión (E3 y E4), flexión en el
  eje fuerte con pandeo lateral-torsional (F2), corte del alma (G2.1) e interacción (H1.1),
  contra `public/planillas/viga-columna.json`. Las propiedades se derivan de las cuatro
  planchas y se pueden anular escribiendo las de catálogo; el módulo compara las dos y avisa
  si se apartan más de la tolerancia por uniones ala-alma. Su esquema dibuja la sección y la
  recta de `L_b` con `L_p` y `L_r` marcados, que es el Capítulo F en una figura.

Un módulo declara qué queda **fuera de su alcance** y lo señala en pantalla en vez de
devolver un número de aspecto válido fuera de su dominio. Esa clase de aviso es distinta de
un incumplimiento —`SalidaDef.aviso`—: no dice que la sección falle, dice que el número de
al lado puede no significar lo que parece.

### El catálogo

El botón **Ejemplos** abre el catálogo: las plantillas editables del bundle
(`src/lib/worksheet-templates.ts`) y las 33 memorias de cálculo publicadas de
`public/planillas/`, agrupadas por disciplina y con buscador. El menú se puebla desde
`public/planillas-indice.json`, que genera `npm run indice:planillas` (lo invocan `dev` y
`build`, así que no puede quedar desfasado); cada planilla se descarga solo al abrirla.

### Deep-links

- `/canvas?plantilla=<id>` abre una plantilla de la galería
- `/canvas?planilla=<slug>` carga una planilla de `public/planillas/`

Las formas antiguas, `/?planilla=…` y `/?plantilla=…`, son de cuando el canvas era la raíz;
se reescriben a `/canvas` antes del primer render (`redirigirDeepLinkAntiguo`), así que los
enlaces ya publicados siguen funcionando.

## De dónde viene

Este repo es un **snapshot del canvas matemático** que vivía en
[`struct_pad`](https://github.com/fcocarrascob/fcocarrascob.github.io) como una página más
del sitio (`/herramientas/canvas`), extraído para poder crecer como aplicación
independiente.

| | |
|---|---|
| Origen | `F:\Proyectos_Python\struct_pad` |
| Commit | `0663620`, branch `serie-galpon` |
| Fecha del snapshot | 2026-09-08 |

Se cambió el shell de Astro a **Vite + React** (el canvas ya se montaba con
`client:only="react"`, o sea que siempre fue 100% cliente; Astro solo aportaba el `<head>`
y el chrome del blog). Los 14 archivos del canvas se copiaron **byte a byte**, sin editar
un solo import: por eso se conservan las rutas `src/components/canvas/` y `src/lib/`.

La única edición sobre código copiado fue `src/lib/canvas-handoff.ts`, donde la redirección
`/herramientas/canvas` pasó a `/`, porque aquí el canvas es la raíz.

### Paridad verificada

El snapshot se contrastó contra el original, no solo se dio por bueno:

- `verify:planillas` produce un reporte **idéntico byte a byte** (2.729 líneas, mismo md5)
- con `?planilla=zapata-aislada` (255 regiones) ambos anuncian **8 páginas**, generan el
  mismo documento de impresión carácter a carácter (24.674) y **0 diferencias** en las
  alturas de bloque medidas

## Deudas heredadas

- **Versión de KaTeX.** El paquete npm es `0.17`, pero el CSS que sirve `index.html` viene
  del CDN en `0.16.11` — la misma discrepancia que tenía `struct_pad`. Se mantuvo a
  propósito: `src/lib/paginacion.ts` está calibrado al píxel contra PDFs reales
  (`A4_ALTO_UTIL_PX = 1010`, no los 1009.134 de la cuenta teórica) y los cortes de página
  dependen de estas métricas tipográficas. Unificar las dos versiones exige volver a
  contrastar la paginación contra un PDF real.
- **`canvas-handoff.ts` no tiene consumidores aquí.** Es la API con la que las *otras*
  herramientas de `struct_pad` (acero, viga, placa base) abrían una memoria en el canvas.
  Se conserva porque define el contrato de entrada, pero en este repo nadie la llama — por
  eso `noUnusedLocals` va desactivado en `tsconfig.json`.
- **`WorksheetPrint.tsx` firma «struct/pad»** en la meta y el pie del PDF. Se dejó tal cual
  para que el diff de paridad saliera limpio; renombrarlo es seguro ahora.

## Estructura

```
src/
├── main.tsx, App.tsx        andamiaje y conmutador de vistas
├── components/              landing, catálogo, enlaces y hooks compartidos
│   ├── canvas/              la hoja (8 archivos)
│   └── diseno/              el armazón de un módulo (4 archivos)
├── lib/                     puro, sin React
│   └── diseno/              contrato de módulo, registro y módulos
└── styles/global.css        tokens Tailwind + documento de impresión
public/
├── planillas/               33 planillas de diseño + ESQUEMA.md (el contrato)
└── esquemas/                28 esquemas SVG paramétricos
scripts/                     verify-planilla.mjs, verify-modulos.mjs, lib/motor.mjs
docs/                        ESQUEMA-PLANILLA.md, canvas-planillas-roadmap.md
```
