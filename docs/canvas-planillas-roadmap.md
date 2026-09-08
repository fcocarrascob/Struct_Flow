# Planillas de diseño de hormigón en el Canvas — Evaluación y roadmap

> Documento de trabajo. Registro de la evaluación de factibilidad y el roadmap de mejoras al
> canvas para soportar planillas de diseño de hormigón. Pensado para estudiar y refinar antes de
> implementar.

## Contexto

El sitio tiene una herramienta tipo SMath en `/herramientas/canvas`:
- Motor: `src/lib/worksheet.ts`
- UI: `src/components/canvas/` (`MathCanvas.tsx`, `MathRegion.tsx`, `SymbolPalette.tsx`)
- Página: `src/pages/herramientas/canvas.astro`

Objetivo: ejemplificar el diseño de elementos de hormigón (vigas, columnas, losas, muros — ya
hay capítulos ACI 318-25 en `src/content/hormigon/`) mediante **planillas de cálculo
interactivas**, robustas y útiles.

Decisiones de dirección:
- **Ubicación elegida:** una **galería de plantillas cargables dentro del canvas** (no embebidas
  en los MDX por ahora).
- Este documento es solo evaluación + roadmap; aún sin implementar.

---

## Veredicto: muy factible (foundation correcta, trabajo aditivo)

El canvas ya tiene el motor que una planilla de ingeniería necesita, y ninguna mejora exige
reescribir — son extensiones incrementales del motor y de la UI.

**Lo que ya juega a favor** (verificado en el código):
- **math.js 15.2** con unidades y chequeo dimensional: `Mn := As*fy*d = kN*m` falla si las
  unidades no cuajan. Es el corazón de una planilla confiable.
- **Scope compartido entre regiones** en orden de lectura (`evaluateSheet`, worksheet.ts:149):
  las variables fluyen de una región a otra como en SMath.
- **Render KaTeX** con griegas y subíndices (`symbolTex`), notación científica y unidades en
  redonda — la salida ya "se ve" como una memoria de cálculo.
- **Persistencia + export/import JSON** (MathCanvas.tsx): la base para serializar plantillas ya
  existe; una plantilla de galería es exactamente el mismo formato `{version, regions}`.
- **Paleta de símbolos** extensible (`SymbolPalette.tsx`, estructura `GROUPS`).

Conclusión: armar planillas hoy es **posible pero incómodo**, porque faltan tres cosas que toda
planilla de diseño necesita (verificaciones, fórmulas reutilizables, unidades locales) y un
sistema de galería. Con eso resuelto, queda una herramienta genuinamente útil.

---

## Brechas que bloquean planillas robustas (ordenadas por impacto)

### 1. No hay idioma de verificación OK / NO CUMPLE  *(bloqueante #1)*
El 80% de una planilla de diseño es comparar `solicitación ≤ resistencia` y emitir un veredicto.
Hoy `=` solo muestra un número; no existe forma de renderizar `Mu ≤ φMn → ✓ Cumple` en verde /
rojo. math.js ya evalúa booleanos y el ternario (`cond ? a : b`), pero `MathRegion.tsx` no tiene
un tipo/convención de "región de chequeo" que lo pinte. **Sin esto, una planilla no concluye
nada.**

### 2. No hay galería de plantillas  *(bloqueante #2, es el objetivo elegido)*
Solo existe un slot único en localStorage (`structpad.worksheet.v1`) y la importación es manual
por archivo. No hay catálogo de ejemplos cargables, ni protección contra pisar la hoja del
usuario al cargar uno.

### 3. No se pueden definir funciones / fórmulas reutilizables
`DEF_RE` (worksheet.ts:51) solo reconoce `nombre := expr`, no `f(x) := ...`. Fórmulas que se
repiten (β1, `Vc`, longitud de desarrollo `ld`, `Pn,max`) deben reescribirse a mano en cada
planilla. Soportar definición de funciones de math.js las haría parametrizables y mucho más
legibles.

### 4. Faltan unidades de la práctica local (Chile / LatAm)
`create(all, {})` usa solo las unidades por defecto. `MPa`, `kN`, `mm`, `cm` funcionan, pero
**`tonf` y `kgf` no están definidas** y son las que se usan a diario. Se agregan con
`math.createUnit('tonf', ...)`. Sin ellas, las planillas obligan a trabajar en SI puro.

### 5. Orden de evaluación por filas es un footgun en layouts de columnas
`evaluateSheet` ordena por `y` y luego `x` (row-major). Una planilla a dos columnas se evalúa
**cruzando columnas dentro de cada fila**, no hacia abajo por columna. Para planillas con datos
a la izquierda y cálculos a la derecha esto produce "variable indefinida" inesperados. Hay que
decidir entre orden por columnas, numeración explícita, o documentar/forzar layout de una sola
columna lógica.

### 6. Formato/precisión fijo
`precision: 5` global en `resultToTex`. No se puede pedir "2 decimales" o notación fija por
región — importante para que una memoria se vea profesional.

### 7. Estructura visual pobre para una memoria
Las regiones `text` son planas: no hay títulos, divisores de sección, ni referencia a cláusula
(p. ej. "Ec. 22.4.2.2"). Una planilla seria necesita jerarquía visual mínima.

### 8. Sin tablas/matrices ni resumen de chequeos  *(nice-to-have)*
No hay región de tabla (combinaciones de carga, barrido de diámetros de barra) ni un panel que
liste "todos los chequeos: 4/5 cumplen". math.js soporta matrices; falta UI.

---

## Roadmap recomendado (3 fases, orientado a la galería)

### Fase 1 — Habilitar el lenguaje de una planilla de diseño
*Sin esto la galería tendría plantillas que no concluyen.*
1. **Región/idioma de verificación** — renderizar comparaciones como veredicto ✓/✗ con color.
   Archivos: `src/lib/worksheet.ts` (detectar expresión booleana o sintaxis `chk: a <= b`),
   `src/components/canvas/MathRegion.tsx` (pintar pass/fail).
2. **Unidades locales** — agregar `tonf`, `kgf` (y aliases útiles) vía `math.createUnit` en
   `worksheet.ts`; sumarlas a la paleta `GROUPS` en `SymbolPalette.tsx`.
3. **Definición de funciones** — extender `DEF_RE`/`parseMathRegion` para aceptar `f(x) := ...`
   y registrarlas en el scope (`worksheet.ts`).

### Fase 2 — Galería de plantillas (el objetivo)
4. **Catálogo de plantillas** — nuevo `src/lib/worksheet-templates.ts` exportando un array
   `{id, titulo, norma, descripcion, regions}` (mismo formato que export/import).
5. **Menú "Ejemplos"** en la toolbar (`MathCanvas.tsx`): lista las plantillas; al elegir una,
   **confirmar antes de reemplazar** la hoja actual (o abrir en limpio).
6. **Curar 3–4 planillas piloto** ligadas a los capítulos existentes:
   - Viga: diseño a flexión + cuantía mín/máx + chequeo `φMn ≥ Mu` (Cap. 9).
   - Columna: `P0`, `Pn,max = 0.80 P0`, chequeo de cuantía `0.01 ≤ ρg ≤ 0.08` (Cap. 10).
   - Muro: cortante en el plano `Vn = (αc λ√f'c + ρt fyt)Acv` con tope y chequeo (Cap. 11).
   - (Opcional) Losa unidireccional: espesor mínimo (Cap. 7).
7. (Opcional) **Modo solo-lectura / "reiniciar ejemplo"** para que una plantilla cargada no se
   edite por accidente y se pueda restaurar.

### Fase 3 — Pulido de robustez y presentación
8. **Precisión por región** — sufijo opcional (p. ej. `= kN*m, 2` → 2 decimales) en
   `parseMathRegion`/`resultToTex`.
9. **Resolver el orden de evaluación** — orden por columnas o numeración explícita de regiones
   (decisión de diseño; documentar el elegido).
10. **Estilo de texto** — variantes de región texto (título / nota / referencia a cláusula) en
    `MathRegion.tsx`.
11. (Nice-to-have) **Panel de resumen de chequeos** y/o región de tabla para combinaciones.

---

## Riesgos / decisiones abiertas
- **Sintaxis de verificación**: ¿reusar el `=` con expresión booleana, o introducir un prefijo
  explícito (`chk:`)? Afecta `parseMathRegion`. Recomendación: prefijo explícito para no
  ambiguar con `=` de display.
- **Orden de evaluación** (brecha #5): elegir antes de curar planillas multi-columna, porque
  condiciona cómo se diseñan los layouts de ejemplo.
- **Compatibilidad de plantillas guardadas**: al crecer el esquema de `Region`, versionar el
  JSON (`version: 2`) y migrar lo que haya en localStorage.

## Verificación (cuando se implemente cada fase)
- `npm run build` debe pasar sin errores de TS/Zod.
- `npm run dev` → `/herramientas/canvas`: cargar cada plantilla de la galería y comprobar que
  (a) evalúa sin "variable indefinida", (b) los chequeos pintan ✓/✗ correctos al variar un dato,
  (c) `tonf`/`kgf` convierten bien, (d) cargar un ejemplo no pisa la hoja del usuario sin
  confirmar.
