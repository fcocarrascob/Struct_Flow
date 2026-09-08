# Struct_Flow — canvas matemático

Una hoja de cálculo estilo SMath para ingeniería estructural: haces clic en cualquier
parte del lienzo y escribes expresiones con unidades, que se evalúan con
[math.js](https://mathjs.org) y se renderizan con [KaTeX](https://katex.org).

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
```

Requiere Node >= 22.12.0.

### Deep-links

- `/?plantilla=<id>` abre una plantilla de la galería (`src/lib/worksheet-templates.ts`)
- `/?planilla=<slug>` carga una planilla de `public/planillas/`

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
├── main.tsx, App.tsx        andamiaje y chrome de la página
├── components/canvas/       UI React (5 archivos)
├── lib/                     motor puro, sin React (9 archivos)
└── styles/global.css        tokens Tailwind + documento de impresión
public/
├── planillas/               33 planillas de diseño + ESQUEMA.md (el contrato)
└── esquemas/                27 esquemas SVG paramétricos
scripts/                     verify-planilla.mjs + lib/motor.mjs
docs/                        ESQUEMA-PLANILLA.md, canvas-planillas-roadmap.md
```
