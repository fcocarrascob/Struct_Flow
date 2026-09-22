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
npm run verify:obra      # el grafo de cálculo de una obra: orden, ciclos, encadenamiento
```

Requiere Node >= 22.12.0.

### Las rutas

| | |
|---|---|
| `/` | el menú |
| `/planillas` | el catálogo de las 33 memorias publicadas |
| `/canvas` | la hoja |
| `/diseno` · `/diseno/<id>` | los módulos de diseño |
| `/proyectos` | las obras de este navegador y los proyectos del harness |
| `/obra/<id>` | una obra: el grafo de cálculo, editable |
| `/proyecto/<slug>` | un proyecto del harness, **solo lectura** |
| `/calibrar` | herramientas de calibración de la A4 — **solo en desarrollo** |

La navegación es un micro-router propio (`src/lib/ruta.ts`, ~100 líneas): para ocho vistas
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

Hay cuatro módulos:

- **`viga-hormigon`** — viga de hormigón armado a flexión y corte, la versión breve de
  `public/planillas/viga-flexion-corte.json` (ACI 318-25, Cap. 9). Su esquema es el primero
  del repo cuya **geometría** es paramétrica y no solo los rótulos: la sección se redibuja
  con `b_w`, `h`, el recubrimiento y el diámetro de las barras. Como SVG no tiene bucles y
  el número de barras es variable, se dibujan diez círculos y la hoja anula el radio de los
  que sobran.
- **`seccion-acero-i`** — perfil I doblemente simétrico: compresión (E3 y E4), flexión en el
  eje fuerte con pandeo lateral-torsional (F2), corte del alma (G2.1) e interacción (H1.1),
  contra `public/planillas/viga-columna.json`. **Ninguna propiedad se declara**: `A_g`, `I_x`,
  `Z_x`, `J`… se derivan de `d`, `b_f`, `t_f` y `t_w`, de modo que la cadena entera es
  auditable y no hay un solo número que haya que creer. El modelo de cuatro planchas ignora
  las uniones ala-alma, lo que en un laminado deja `A_g` y `Z_x` un 2 % bajos y `J` un 8 %
  bajo — del lado seguro. Su esquema dibuja la sección y la recta de `L_b` con `L_p` y `L_r`
  marcados, que es el Capítulo F en una figura.
- **`losa-fundacion`** — losa de fundación (ACI 318-25, Cap. 13 y Cap. 8): la franja de
  1 m a flexión en sus dos caras, corte en una dirección, los mínimos de losa (8.6.1.1 y
  8.6.1.2) y el punzonamiento concéntrico de una columna interior, de borde o de esquina.
  **Los esfuerzos son dato**: una losa de fundación se analiza sobre resortes en elementos
  finitos, y ningún modelo de franja continua reproduce eso — el módulo verifica la
  sección, no resuelve el modelo. Es el primero con **dos contrastes**, porque cruza dos
  cuerpos de norma que ninguna planilla sola cubre: el punzonamiento sale de
  `losa-punzonamiento-momento.json` y el corte de `zapata-aislada.json`. Y el primero cuyo
  esquema dibuja una figura que cambia de **topología**: el perímetro crítico es cerrado en
  una columna interior, una U en una de borde y una L en una de esquina, y las tres salen
  de una polilínea que la hoja arma como matriz.
- **`zapata-aislada`** — zapata rectangular bajo columna, con momento uniaxial (ACI 318-25,
  Cap. 13 y Cap. 8): área en planta con cargas de servicio (13.3.1.1), corte en una
  dirección y flexión en **las dos direcciones**, punzonamiento, mínimos, el reparto en la
  banda central de 13.3.3.3 y el desarrollo de la barra. Su esquema tiene el primer
  **diagrama de presiones** del repo: al subir el momento el rectángulo se vuelve trapecio, y
  al salirse la resultante del núcleo central la base se despega y salta un aviso. Contrasta
  contra `zapata-aislada.json` —35 valores idénticos y 11 con tolerancia declarada, porque
  cada dirección se verifica con su propia altura útil y esa planilla usa la promediada— y
  contra `losa-punzonamiento-momento.json` para la cadena de v_c, que en la primera está
  escrita con el álgebra de ACI 318-14.

Un módulo declara qué queda **fuera de su alcance** y lo señala en pantalla en vez de
devolver un número de aspecto válido fuera de su dominio. Esa clase de aviso es distinta de
un incumplimiento —`SalidaDef.aviso`—: no dice que la sección falle, dice que el número de
al lado puede no significar lo que parece.

### Proyectos: cálculos encadenados

Una **obra** (`/obra/<id>`) es un grafo de cálculo, y su fin es que la salida de un cálculo
sea la entrada de otro sin copiar un número a mano. Un nodo es una **hoja libre** —una mini
hoja del mismo motor, para la geometría y los datos comunes— o una **planilla genérica de
`public/biblioteca/`** instanciada.

Lo que los une son los nombres, en los dos sentidos:

- un nodo publica lo que su hoja define, y una planilla publica las salidas que marques,
  con el nombre que elijas (`meta.entrega` de la genérica propone cuáles);
- una fórmula nombra lo que publicó otro nodo, y un campo de una planilla se ata con **ƒ** a
  una expresión de la obra, que se convierte a la unidad que el campo declara.

**Las flechas no se dibujan: se derivan.** Una flecha de A a B es «B nombra esto que
publica A», así que borrar la línea que lo usaba borra la flecha. De ahí sale también el
orden en que se calcula todo —un orden topológico—, y los dos fallos que ese modelo puede
tener se dicen en el nodo: un nombre definido en dos sitios y un ciclo.

De cada planilla instanciada sale su **memoria**, la misma que exporta `/diseno/<slug>`: una
instancia estampada con el sha256 de la genérica, que pasa `verify:planilla` sin retoques.

Una obra vive en el `localStorage` de un navegador, así que se exporta y se importa como
archivo. Los **proyectos del harness** (`/proyecto/<slug>`) son otra cosa: se proyectan desde
archivos versionados, los sirve `python -m harness.servidor` y no se escribe nada de vuelta.

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
│   ├── canvas/              la hoja (11 archivos)
│   └── diseno/              el armazón de un módulo (4 archivos)
├── lib/                     puro, sin React
│   └── diseno/              contrato de módulo, registro y módulos
├── proyecto/                el canvas del harness (solo lectura) y el contrato del grafo
│   └── obra/                una obra: documento, evaluación, proyección y paneles
└── styles/global.css        tokens Tailwind + documento de impresión
public/
├── planillas/               33 planillas de diseño
├── biblioteca/              las genéricas, por disciplina
└── esquemas/                28 esquemas SVG paramétricos
scripts/                     verify-planilla.mjs, verify-modulos.mjs, lib/motor.mjs
verificadores/               verify:obra — fuera de scripts/ para no mover el sello del motor
docs/                        rumbo.md, pendientes.md, ESQUEMA-PLANILLA.md, historial/, pachon/
```

`src/proyecto/` está fuera de `src/lib/` a propósito: el harness sella el motor como el hash
de árbol de `src/lib` + `scripts`, y una obra no evalúa ninguna planilla publicada.
