# CLAUDE.md

Guía para trabajar en este repo. Ver `README.md` para qué es la aplicación y de dónde sale.

## Idioma — español neutro, siempre

Regla dura y transversal: interfaz, mensajes de error, comentarios, documentación, mensajes
de commit y respuestas de chat. `tú` nunca `vos`, `ustedes` nunca `vosotros`, cero
regionalismos (incluidos los chilenos: "al tiro", "cachai", "harto"). Vocabulario técnico
estándar. Aplica también a agentes y subagentes.

## Comandos

```sh
npm run dev              # servidor de desarrollo
npm run build            # tsc --noEmit && vite build
npm run verify:planillas # evalúa las 33 planillas de public/planillas/
npm run verify:planilla -- <archivo.json> [--md]
npm run verify:modulos   # evalúa los módulos de diseño y sus memorias exportadas
```

**No hay tests unitarios.** La red de seguridad son los dos verificadores.

`verify:planillas` ejecuta cada planilla publicada con el mismo motor que corre en el
navegador y falla si alguna región tiene error (sintaxis, variable indefinida, unidades que
no casan), si una comparación da `false` sin estar declarada en `meta.esperadoFalso`, o si
un esquema tiene tokens sin resolver. Córrelo ante cualquier cambio del motor.

`verify:modulos` hace lo propio con los módulos de diseño, que producen hojas del mismo
formato: por cada juego de entradas declarado en el módulo comprueba símbolos, evaluación,
tokens del esquema y que cada entrada y salida exista en el scope; después contrasta los
valores contra la planilla publicada de la que salió el módulo y pasa las memorias
exportadas por `verify-planilla.mjs`. Una verificación en ✗ **no** es un fallo aquí: un
diseño que no cumple es un resultado legítimo, al revés que en una planilla publicada.

## Arquitectura

La separación es estricta y hay que mantenerla:

**Vistas** (`src/App.tsx` + `src/lib/ruta.ts`): `/` es el menú, `/planillas` el catálogo,
`/canvas` la hoja y `/diseno/<id>` un módulo. El router es propio y son ~70 líneas puras;
`src/components/useRuta.ts` es el único puente con React. `MathCanvas` solo se monta en
`/canvas`, que es lo que mantiene válidos sus `useEffect` de deep-link con dependencias
`[]`. Las formas antiguas `/?planilla=…` se reescriben en `main.tsx` **antes** del primer
render.

**Diseño de elementos** (`src/lib/diseno/` + `src/components/diseno/`): un módulo declara
sus entradas y salidas y sabe armar una hoja (`construirHoja(entradas) => Item[]`); no
calcula nada por su cuenta. La UI hace `evaluateSheet` sobre esa hoja y de ahí saca los
resultados en vivo, el esquema y la memoria que se exporta — las tres cosas de la misma
evaluación, que es lo que impide que diverjan. `evaluar.ts` tiene esos pasos porque los
comparten la pantalla y `verify:modulos`; si el verificador los reprodujera, comprobaría su
propia copia. Añadir un elemento son dos archivos: el módulo y su SVG.

**Capa UI** (`src/components/canvas/`, React):
- `MathCanvas.tsx` — raíz: mantiene el estado `Region[]`, autoguarda en `localStorage`
  (clave `structpad.worksheet.v1`, debounce 300 ms), gestiona clic-para-crear, arrastre,
  selección múltiple, borrado, importación/exportación JSON y el menú de plantillas. Las
  regiones vacías son transitorias: se descartan al perder el foco, nunca se persisten.
- `MathRegion.tsx` — una región arrastrable; renderiza KaTeX o el input de edición y pinta
  el veredicto ✓/✗ de los resultados booleanos. Exporta `GRID` y `snap()`.
- `SymbolPalette.tsx` — paleta lateral de símbolos y fragmentos insertables.
- `WorksheetPrint.tsx` — el documento de impresión: un portal en `<body>` que refluye las
  regiones a un documento **lineal** (orden de lectura). **No** es el layout del canvas: no
  hay correspondencia geométrica entre dónde está una región en la hoja y dónde cae en el
  papel.
- `usePaginacion.ts` — mide ese documento y reporta en qué página cae cada región.

**Capa motor** (`src/lib/`, pura, sin React — *mantenerla así*, para que siga siendo
testeable y portable):
- `worksheet.ts` — `evaluateSheet(regions)` es el núcleo. Evalúa cada región no-texto
  contra un **único scope de mathjs compartido, en orden de lectura (y, luego x)**, así que
  lo definido más arriba/izquierda es visible más abajo/derecha (semántica SMath). Gramática
  del campo `src`: `nombre := expr` define, un `=` final muestra, `= unidad` convierte con
  chequeo dimensional. Registra la unidad local `tonf` (= 1000 kgf, alias `tf`).
- `program.ts` — intérprete **imperativo** mínimo para las regiones `program`, porque mathjs
  no tiene control de flujo. Bloques definidos por **indentación** estilo Python (`if` /
  `else if` / `else`, `for … in range/list`, `while`, `break`/`continue`, `return`),
  delegando cada expresión a mathjs. Protegido por `MAX_ITERS` (100k) contra bucles
  infinitos.
- `paginacion.ts` — el modelo de saltos de página A4. **No "simplificar" las reglas de
  margen ni `A4_ALTO_UTIL_PX` sin volver a contrastar contra un PDF real**: el valor es
  1010 px y no los 1009.134 de la cuenta teórica porque Chromium arma la caja de página en
  píxeles enteros, y usar el teórico adelanta un corte cada varias páginas.
- `esquema.ts` — esquemas SVG paramétricos: sustituye tokens `{{expr:unidad}}` contra el
  scope de la hoja.

Tres tipos de región: `math`, `text`, `program` (más `image`). Al añadir funcionalidad al
motor, extiende los módulos puros y mantén los componentes React delgados.

## Invariantes que cuestan caro romper

- **Los estilos de impresión van FUERA de `@media print`** en `global.css`; el media query
  solo decide visibilidad. `usePaginacion` mide ese documento **en pantalla**, y unas reglas
  dentro de una consulta print-only no aplicarían ahí: mediría un documento sin estilar y
  anunciaría cortes falsos.
- **`#root` es hijo directo de `<body>`.** La regla `body > :not(.worksheet-print)` es un
  selector de hijo directo; con un envoltorio de por medio, la UI no se oculta al imprimir.
- **No envolver en `React.StrictMode`.** El doble montaje de desarrollo dispara dos veces
  los `useEffect` de deep-link: descargaría la planilla dos veces y repetiría el diálogo de
  reemplazo.
- **Un solo scope de mathjs.** Hoja y esquema comparten instancia: las unidades locales
  (`tonf`) y los objetos `Unit` del scope no sobreviven a dos instancias distintas. Por eso
  el punto de entrada de Node es `planilla-engine.ts` y no `worksheet.ts` directamente, y
  por eso `src/lib/diseno/engine.ts` —la entrada de `verify:modulos`— reexporta también el
  motor: compilar el motor y el catálogo como dos bundles daría dos instancias.

- **La región del esquema va la última de la hoja.** No se evalúa, pero participa del orden
  de lectura y captura una instantánea del scope en su posición: esa instantánea es la que
  resuelve los tokens del SVG y la que lee el panel de resultados de un módulo. Emitida
  antes de los cálculos que rotula, el esquema sale con `{{tokens}}` a la vista y
  `verify:planilla` lo rechaza.

- **Un factor de utilización no puede salir negativo.** Donde una demanda se resta de una
  capacidad (`V_sreq := V_ud/phi_v - V_c`), el resultado es negativo cuando no hace falta
  refuerzo, y dividirlo pinta una barra verde con un −0,19 que no significa nada. Acota en
  cero al construir el uso, no al pintarlo.
- **`nombreTex` es la única autoridad sobre nombre → LaTeX.** Los tres caminos que dibujan
  un identificador —el lado izquierdo de una definición, los símbolos de una expresión y los
  nombres de función dentro de `\mathrm{}`— tienen que salir por ella. Cuando cada uno se
  las arreglaba por su cuenta, el corpus acumuló 11 regiones en rojo y unas 250 impresas mal
  en silencio.

  Los segmentos de un nombre se unen con **coma en un único subíndice plano**
  (`A_s_min` → `A_{s,min}`), nunca con `_`: un `_` crudo dentro de un subíndice vuelve a ser
  un subíndice para KaTeX, y con dos ya es un «doble subíndice», que es sintaxis inválida.
  Plano y no anidado también porque no crece en altura, y los cortes de página están
  calibrados al píxel. Y las llaves alrededor no son decorativas: sin ellas, un `\cdot`
  pegado al nombre se lee como el comando inexistente `\cdotM`.

## Planillas

Las de `public/planillas/` son el corpus de prueba y la fuente de verdad de los ejemplos.
El contrato del JSON está en `public/planillas/ESQUEMA.md`; el formato es el mismo
`{version, regions}` de exportar/importar del canvas, más un `meta` opcional
(`titulo`, `esperadoFalso`). Toda planilla nueva tiene que pasar `verify:planilla`.
