# Auditoría de los siete esquemas: ¿dibujan lo que la hoja calcula?

**2026-09-15.** Revisión de los SVG paramétricos de `public/biblioteca/` mirando las
**imágenes rendidas**, no el código. La pregunta no es si se leen bien: es si el dibujo
**representa el mecanismo que la ecuación supone**.

> **2026-09-16 — aplicado en parte.** La lista priorizada 1–6 está cerrada salvo F1, que
> se paró por falta de un dato. El detalle está en **[Estado de aplicación](#estado-de-aplicación)**,
> al final.
>
> **2026-09-16, más tarde — F1 cerrado.** La salida era la 1 de las dos que quedaron
> anotadas, y resultó más barata de lo que parecía: en vez de recibir la axial de cada
> punto, la hoja pasó a **calcular el diagrama entero** por compatibilidad de
> deformaciones, con el álgebra que ya estaba escrita dos veces en el corpus
> (`columna-interaccion-esbeltez` y `muro-flexocompresion`). Ver
> [F1 — cómo se cerró](#f1--cómo-se-cerró).

## Cómo se obtuvieron las imágenes

`<scratchpad>\render-esquemas.mjs` compone lo que ya existe en el repo, sin motor nuevo:
`verificarPlanilla` (de `scripts/lib/planilla.mjs`) para evaluar la hoja y traer los SVG
crudos; `instanciarRegiones` + `valoresDeEntradas` más el centinela de scope de
`verify-biblioteca.mjs:53` para el caso que falla; `renderEsquema` para sustituir los tokens;
y Chrome headless con `--screenshot`, siguiendo el molde de `scripts/render-planilla.mjs`.

**14 PNG**, dos por hoja —el ejemplo de referencia y el primer caso con `cumple: false`—, a
`--force-device-scale-factor=2`. Todos resolvieron sus tokens sin faltantes.

## El criterio

Por hoja, cinco preguntas: ¿está dibujado el mecanismo que gobierna? ¿la geometría dibujada
es la que entra en la ecuación, y en la proyección correcta? ¿se puede seguir el cálculo sin
leer la hoja? ¿qué sobra? ¿una vista por dirección resolvería una ambigüedad real?

---

## Resumen por gravedad

### E — El dibujo dice algo distinto de lo que calcula la hoja

| # | Hoja | Qué pasa |
|---|---|---|
| **E1** | `llave-corte` | `A_Vc` se dibuja como un **rectángulo en planta**. La norma la define como la **proyección sobre la cara lateral** del hormigón, base de una **semipirámide truncada a ≈35°**. Está en la vista equivocada y con la forma equivocada |
| **E2** | `llave-corte` | La **elevación no dibuja ninguna superficie de falla**, que es justo donde vive `A_Vc` |
| **E3** | `silla-anclaje` | Los pernos se dibujan **fuera de los dos nervios** y no tocan la chapa superior. La hoja calcula `M_chapa = P·luz/8`: viga biempotrada entre nervios con el perno **a media luz** |
| **E4** | `viga-carrilera` | Las ruedas se dibujan en `x_crít` (centro del vano, la posición de flexión) y el panel verifica el §J10 **en el extremo**. Nada dice que son dos posiciones distintas |
| **E5** | `anclaje-hormigon` (caso de falla) | El dibujo rotula «sin armadura de anclaje» y el panel sigue diciendo «provista 14 ø25 = 6872 mm²» |
| **E6** | `anclaje-hormigon` | La planta dibuja **4 pernos** y la elevación **2** |

### F — Falta el mecanismo que gobierna

| # | Hoja | Qué falta |
|---|---|---|
| **F1** | `pedestal` | El **diagrama P–M**. La hoja calcula tres extremos y recibe puntos intermedios, y el dibujo solo trae la sección y dos cifras en el panel |
| **F2** | `zapata` | La **superficie inclinada del punzonamiento** en el alzado. Está el perímetro `b_o` en planta, que es correcto, pero no el tronco de pirámide |
| **F3** | `viga-carrilera` | La **dispersión de la carga de rueda** (`2,5k + l_b` contra `5k + l_b`) y el **riel**, de donde sale `l_b`. Dos de los nueve estados límite no tienen apoyo gráfico |
| **F4** | `viga-carrilera` | La **fuerza lateral `H_lat`**, que produce el estado que gobierna (interacción H1, 0,8582) y justifica la hipótesis declarada |
| **F5** | `placa-base` | El **equilibrio**: falta el bloque de tensiones uniforme del §4.3.7, la resultante de compresión `C` y las acciones `M`/`P` |
| **F6** | `silla-anclaje` | El **rigidizador de alma**, que es el estado que **gobierna** (0,975) y solo aparece como una línea discontinua en la planta |
| **F7** | `pedestal` | El **radio de conteo** `0,5·h_ef` como círculo sobre la sección, con las barras que cuentan resaltadas. Hoy «cuentan 13 barras» es una afirmación |

### G — Legibilidad y solapes

| # | Hoja | Qué pasa |
|---|---|---|
| **G1** | `llave-corte` | El rótulo `h_ef,sl = 50 mm · e = 65 mm` cae **sobre la línea del mortero** (el solape que ya habías visto) |
| **G2** | `anclaje-hormigon` | La nota `4 pernos ø48 @ s₁ = 192 mm…` **entra dentro del área proyectada** (el otro solape que ya habías visto) |
| **G3** | `llave-corte` | La llave es **invisible**: 50 mm de parte efectiva sobre un pedestal de 900 mm. Toda la hoja trata de esa chapa |
| **G4** | `viga-carrilera` | `S_xc` y `S_xt` se apilan sobre la cota del eje neutro |
| **G5** | `silla-anclaje` | `y_fila = 767 mm` toca a «placa 45 + mortero 50» |
| **G6** | `placa-base` · `llave-corte` | El **mortero no se distingue de la placa**: los dos son una banda gris, y `t_mort` es la mitad del brazo `exc` que una hoja le entrega a la otra |

### H — Lo que el dibujo afirma sin que la hoja lo sepa

| # | Hoja | Qué pasa |
|---|---|---|
| **H1** | `zapata` | La **reacción del suelo se dibuja uniforme** (cuatro bloques iguales). La hoja recibe `Mu` y `Vu` como dato y **no calcula la distribución de presiones** |
| **H2** | `anclaje-hormigon` | Las barras de anclaje se dibujan cruzando el cono, pero **sin ninguna marca de desarrollo a ambos lados**, que es la condición (a) del §17.5.2.1.1 y la única razón por la que la armadura puede sustituir al cono. El despiece es una frontera declarada |
| **H3** | `pedestal` | La elevación dibuja las barras longitudinales **rectas hasta la zapata**, y el panel dice «rige §18.13.2 en la unión con la zapata» — cuyo §18.13.2.3 pide **ganchos a 90°** hacia el eje de la columna |

---

## 1. `llave-corte-generica` — el caso que planteaste

**Imágenes:** `png\llave-corte-generica--referencia.png` · `--falla.png`

### E1 y E2 — `A_Vc` está en la vista equivocada

El dibujo tiene dos vistas: PLANTA y ELEVACIÓN (corte en X). En la **planta**, una banda verde
translúcida cubre la mitad derecha del pedestal, rotulada `A_Vc,X = 1994·10³ mm²`. En la
**elevación** no hay ninguna superficie de falla: solo el pedestal, la placa, la llave (un
tick verde) y el perno.

Lo que la norma dice, leído en esta auditoría:

> `ACI 318-25 § 17.11.3.1 · pdf 306 = impresa 305`: «…y donde `A_Vc` es el área proyectada de
> la superficie de falla **on the side of the concrete member**.»
>
> `§ 17.11.3.1.1 · pdf 307 = impresa 306`: «`A_Vc` is the projected concrete failure area
> **on the side face** of the concrete that is approximated as the rectangular shape resulting
> from projecting **horizontally 1.5c_a1** from the edge of the shear lug and projecting
> **vertically 1.5c_a1** from the edge of the effective depth of the shear lug, `h_ef,sl`.»
>
> `§ 17.7.2.1.1 · pdf 287 = impresa 286`: «It shall be permitted to evaluate `A_Vc` as the
> base of a **truncated half-pyramid** projected on the side face of the member…»

Y la `Fig. R17.7.2.1a` (`pdf 285 = impresa 284`) lo dibuja: en **planta**, una cuña a ≈35°
que se abre desde el anclaje hacia el borde libre; en **elevación**, el rectángulo
`A_Vco = 2(1,5c_a1)×(1,5c_a1) = 4,5c_a1²`.

**Así que el esquema comete dos errores de una vez:**

1. pone en **planta** un área que es una **proyección vertical** — el número `1994·10³ mm²`
   no corresponde a ninguna superficie horizontal;
2. la dibuja **rectangular y recta**, cuando en planta el mecanismo es la **cuña inclinada a
   ≈35°** que se abre hacia el borde. Eso es lo que no se ve: la falla no es un prisma, es una
   pirámide truncada.

**Contraprueba dentro del propio repo.** `anclaje-hormigon-generica` hace lo correcto con el
mismo tipo de magnitud: `A_Nc` **sí** es un área proyectada sobre la **superficie** del
hormigón, y la dibuja en **planta**, con el cono a 35° en **elevación**. Las dos hojas usan la
misma familia de ecuaciones y una acierta la vista y la otra no.

**Corrección propuesta.**

- **Elevación:** llevar `A_Vc` a la cara lateral, que es donde vive. Rectángulo de
  `b_sl + 2(1,5·c_a1)` de ancho por `h_ef,sl + 1,5·c_a1` de alto, **restando** `A_ef,sl`
  (rayada aparte), con las tres cotas `1,5·c_a1` acotadas. Con eso el `1994·10³ mm²` se puede
  comprobar mirando.
- **Planta:** sustituir el rectángulo por la **cuña a 35°** desde los bordes de la chapa hasta
  el borde libre, y dejar en planta solo lo que es de planta: `c_a1` desde la **superficie de
  aplastamiento** (que es como la define el §17.11.3.1) y el recorte por el ancho del pedestal.
- Añadir una **vista de sección** (la tercera de la Fig. R17.7.2.1a), que es la que hace
  evidente el 35°.

Cabe en el `viewBox` actual reorganizando: la elevación tiene hoy mucho pedestal vacío.

### G3 — La llave no se ve

`h_ef,sl = 50 mm` sobre `H_PED = 900 mm` a escala común deja la chapa en un tick de ~5 px. La
hoja entera trata de esa chapa: su espesor, su aplastamiento, su *breakout*, su acero, su
soldadura. **Una vista de detalle a escala propia** —la chapa, el mortero, los `2·t_sl` que
topan `A_ef,sl`, la excentricidad `e`— resuelve a la vez G1 (el rótulo que se pisa), G6 (el
mortero indistinguible) y el que la pieza protagonista sea invisible.

### Otras

- **La planta no dice qué chapa toma qué corte.** Hay una cruz de dos chapas y el panel da
  «Aplastamiento X · Y» con dos números. Faltan las flechas `V_ux` y `V_uy` en planta.
- **`c_a1,X = 587,5 mm` no marca su origen.** El §17.11.3.1 lo mide desde la **superficie de
  aplastamiento** de la llave, no desde su eje; el dibujo no distingue.
- El panel imprime `t_bp ≥ t_sl (DG1 §4.3.3)`, que es la errata **B7** del informe normativo.

---

## 2. `anclaje-hormigon-generica` — el que sí acierta el mecanismo

**Imágenes:** `png\anclaje-hormigon-generica--referencia.png` · `--falla.png`

**Lo que está bien, y conviene no tocar.** El cono a 35° en elevación con `1,5·h_ef` a cada
lado, `A_Nc` en planta —que es la vista correcta, porque es una proyección sobre la
superficie—, las cabezas con su `A_brg`, y el estado de falla: el cono pasa a rojo, el rótulo
conmuta a «sin armadura de anclaje» y el recuadro de cierre se pinta rojo. **Es el patrón que
las otras seis deberían seguir.**

### E5 — El panel se contradice en el caso de falla

Con `usa_arm = 0`, el dibujo dice «sin armadura de anclaje» y el panel mantiene:

> Armadura de anclaje — exigida `A_s,req = 6678 mm²` · **provista 14 ø25 = 6872 mm²** · la
> dimensiona: capacidad del perno

No hay armadura provista: la hoja la anuló. **Corrección:** condicionar las tres filas a
`usa_arm` y, con 0, dejar una sola línea «no se dispone armadura de anclaje: el cono gobierna».

### E6 — Cuatro pernos en planta, dos en elevación

`n_trac = 4` y la planta dibuja cuatro puntos; la elevación dibuja dos. Es una elevación de
los pernos **extremos**, lo cual es defendible, pero nada lo dice y el lector cuenta dos.
**Corrección:** dibujar los `n_trac` en elevación (el `data-repetir` ya existe para la planta)
o rotular «pernos extremos de la fila».

### G2 y H2

- La nota `4 pernos ø48 @ s₁ = 192 mm (mín. 4·d_a = 192)` **entra dentro** del rectángulo de
  `A_Nc`. Se resuelve sacándola al margen izquierdo, que está vacío.
- Las barras de anclaje se dibujan como 14 líneas verticales que cruzan el cono y **terminan
  sin marca**. La condición (a) del §17.5.2.1.1 —desarrollo a ambos lados de la superficie—
  es la que autoriza a sustituir el cono, y el dibujo no la representa. La hoja declara el
  despiece como frontera, así que **lo honesto es dibujar la exigencia** (una marca `≥ l_d` a
  cada lado del plano de falla) y no un despiece concreto.
- **Falta la comparación `h_ef` contra `2,5·c_a1`**, que es la que decide si el
  descascaramiento aplica. El panel dice «no aplica» y en el dibujo las dos magnitudes están
  en vistas distintas.

---

## 3. `pedestal-generico` — dibuja la sección, no el mecanismo

**Imágenes:** `png\pedestal-generico--referencia.png` · `--falla.png`

### F1 — Falta el diagrama P–M

Es el hallazgo de mayor valor de toda esta revisión. La hoja calcula los **tres extremos** del
diagrama (`P_o`, `φP_n,max`, `φP_nt`), **recibe los puntos intermedios** como pares
`(M_u, φM_n)`, y resuelve la **flexocompresión** y la **flexión biaxial** — que son, con el
anclaje, sus estados límite centrales. El dibujo trae la sección con sus 37 barras y el panel
dos cifras sueltas (`φP_n,max = 44890 kN · φP_nt = 11250 kN`).

Una sección de hormigón armado con barras es fácil de dibujar y **no dice nada que no esté ya
en el texto**. Un diagrama P–M con la envolvente y los puntos de demanda encima dice de un
vistazo lo único que un revisor quiere saber: cuánto margen hay y por dónde se acaba.

**Corrección propuesta.** Sustituir la elevación —que hoy aporta poco: un fuste con estribos
igualmente espaciados— por un **P–M** con los tres extremos, los pares intermedios declarados
y los puntos `(M_u, P_u)` de las combinaciones. Es el mismo trabajo de mapeo a píxeles que ya
hace el bloque `ESQUEMA`, y el `data-repetir` ya sabe clonar por filas de una matriz.

### F7 — El radio de conteo es una afirmación

`0,5·h_ef = 625 mm` se dibuja como una **cota horizontal suelta** bajo la sección, con
«cuentan 13 barras · hacen falta 11». Que 13 barras caigan dentro del radio es **geometría**:
dibujando el círculo sobre la sección y resaltando esas 13, el lector lo verifica; como está,
tiene que creerlo. Y el estado límite que **gobierna** en el ejemplo de referencia es justo
ese («armadura de anclaje: barras dentro del cono», `u_max = 0,8462`).

### H3 y otros

- La elevación dibuja las barras longitudinales **rectas** hasta la zapata, y el panel afirma
  «rige §18.13.2 en la unión con la zapata». El §18.13.2.3 (`pdf 383 = impresa 382`) pide
  ganchos a 90° cerca del fondo con el extremo libre **hacia el eje de la columna**. El dibujo
  contradice al panel.
- **Los pernos de anclaje no están en la sección**, aunque el estado que gobierna es la
  armadura que los sustituye. Las dos líneas discontinuas de la elevación que bajan a
  `h_ef = 1250 mm` no están rotuladas.
- Si se aplica el hallazgo **A2** del informe normativo (interacción de corte biaxial), el
  panel debería mostrar `u_X + u_Y` contra 1,5 y no dos filas independientes; y si se aplica
  **A4**, la fila «separación ≤ 512 mm» pasa a ser `≤ d/2`.

---

## 4. `zapata-generica`

**Imágenes:** `png\zapata-generica--referencia.png` · `--falla.png`

### F2 — El punzonamiento no tiene superficie

La planta dibuja bien el **perímetro crítico a d/2** (rectángulo discontinuo) — eso es lo que
la ecuación integra y la vista es correcta. Lo que falta es el **alzado**: el tronco de
pirámide que va del perímetro crítico a la cara del pedestal a través del canto. Sin él,
`d = 912,5 mm` y `b_o = 10500 mm` son dos números que no se tocan en ningún dibujo.

### H1 — La reacción del suelo se dibuja uniforme

Cuatro bloques azules iguales bajo la zapata. La hoja **no calcula la distribución de
presiones**: recibe `Mu` y `Vu` mayorados como dato (es su primera frontera declarada). Dibujar
un diagrama uniforme afirma un reparto que la hoja no conoce, y que con excentricidad no es
uniforme. **Corrección:** flechas de reacción sin perfil, o un perfil rotulado «según la
combinación, no calculado aquí».

### Otras

- **Las dos secciones críticas de corte no se distinguen.** Hay una línea discontinua vertical
  y otra horizontal, y un solo rótulo «corte a d_Y = 912,5 mm de la cara» a la izquierda. Con
  `u_corte_Y = 0,7994` gobernando y `u_corte_X = 0,3027`, conviene que se vea cuál es cuál.
- **La banda central no está acotada.** El §13.3.3.3(b) la define de ancho igual al **lado
  corto** (`ZAP_X = 4 m`); el dibujo la insinúa por densidad de barras y no la cota, así que
  `γ_s` no se puede comprobar.
- El panel rotula bien **«canto útil d_Y ≥ 150 mm»**, que es lo que exige el §13.3.1.2.
- Si se aplica el hallazgo **C4** (el §18.13.2.5 solo rige en SDC D-F), la fila «Armadura
  superior ✓» tiene que decir bajo qué categoría sísmica.

---

## 5. `placa-base-generica`

**Imágenes:** `png\placa-base-generica--referencia.png` · `--falla.png`

**Lo que está muy bien.** El panel «Geometría mínima (mm)» con las seis comprobaciones en
formato *provisto ≥ exigido ✓* y el bloque «De dónde sale cada mínimo» con la cita de cada una
es, con diferencia, **el mejor panel de las siete**. Es el patrón que deberían copiar las otras
seis: cada chequeo con su número, su umbral y su artículo.

### F5 — Falta el equilibrio, que es lo que la hoja resuelve

El §4.3.7 de la DG1 es un **equilibrio con distribución uniforme de aplastamiento** —
`q = f_p·B` sobre una longitud `Y`, contra la tracción `T` del grupo. En el dibujo:

- el bloque comprimido es un **rectángulo azul vacío** rotulado «bloque Y = 229,9», que se lee
  como una caja geométrica y no como una presión;
- `f_p = 19,01 MPa` vive solo en el panel, sin contraparte gráfica;
- **no aparecen ni `M` ni `P`**, que son las acciones, ni la resultante de compresión `C`;
- la flecha `T = 3058 kN` está **desplazada a la izquierda** del perno al que corresponde.

Un revisor no puede comprobar ΣF = 0 ni ΣM = 0 mirando. **Corrección:** dibujar el diagrama de
cuerpo libre de la DG1 (su Figura 4-7): `P` y `M` sobre la columna, el bloque uniforme de
altura proporcional a `f_p` sobre la longitud `Y`, y `T` en el eje de la fila traccionada, con
`ε = N/2 − Y/2` acotada, que es la variable de la ecuación [4-35].

### Otras

- **La llave de corte no se dibuja**, aunque `hay_llave` suma el par del §17.11.1.1.9 a la
  tracción y `z_llave` es una entrada que viene de la hoja hermana. El README llama a esta
  relación «el error fácil de esta familia»: merece un trazo, aunque sea un muñón con su brazo
  `z_llave` acotado.
- **El mortero no se ve** (G6): placa y mortero son una sola banda gris.
- La cota `bloque Y = 229,9` y `voladizo 350` comparten renglón y casi se tocan.

---

## 6. `silla-anclaje-generica`

**Imágenes:** `png\silla-anclaje-generica--referencia.png` · `--falla.png`

### E3 — Los pernos no cargan la chapa que la hoja calcula

La hoja modela la chapa superior como **viga entre nervios con el perno a media luz**:
`M_chapa := P_perno*luz_max/8` (biempotrada; biapoyada daría `P·L/4`, y el texto lo dice). En
el dibujo, las dos líneas azules de los pernos están **por fuera de los dos nervios** y **no
tocan la chapa superior**, que se dibuja como un segmento corto entre ellos. El dibujo
representa una silla distinta de la que se calcula, y es el estado límite con mayor uso de los
seis (0,8287).

**Corrección:** pernos **entre** los nervios, atravesando la chapa superior a media luz, con
`luz_max` acotada de cara a cara de nervio. Es el dibujo del que sale el `P·L/8`.

### F6 — El rigidizador que gobierna casi no se dibuja

`u_max = 0,975`, «esbeltez del rigidizador de alma». En la elevación —que se titula «el camino
de carga»— el rigidizador **no está**; aparece solo como una línea discontinua en la planta del
ala. Y los dos últimos eslabones del camino (el **ala** y el **alma** de la columna) no se
distinguen: hay una barra verde rotulada «ala 550 × 45 mm» y una línea gris vertical que
podría ser el alma.

**Corrección:** dibujar la columna en corte (ala + alma), el rigidizador dentro de ella y la
cota de media altura contra la que se juzga la condición (c) del §J10.8. Si se adopta el
hallazgo **C9** del informe normativo (el §J10.8 manda el rigidizador de apoyo al §E6.2 con
`L_e = 0,75h` y `25·t_w` de alma colaborante), el dibujo debería mostrar esa sección
colaborante, que es lo que hace comprensible la comprobación.

### Otras

- **La planta no distingue el ala original de la extendida.** «ala extendida 950 mm · junta a
  tope a 200 mm de cada lado»: faltan el borde del ala original (550 mm) y la marca de la junta
  de penetración completa, que es un estado límite del panel (0,5961).
- `y_fila = 767 mm` toca a «placa 45 + mortero 50» (G5).

---

## 7. `viga-carrilera-generica`

**Imágenes:** `png\viga-carrilera-generica--referencia.png` · `--falla.png`

### F3 — Ni el riel ni la dispersión de la rueda

Dos de los nueve estados límite del panel son «Alma bajo la rueda: fluencia» (§J10.2) y
«Alma bajo la rueda: aplastamiento» (§J10.3), y los dos dependen de `l_b`. En el dibujo:

- **el riel no existe**, aunque `H_riel = 60 mm` es entrada y `l_b := 2·H_riel` sale de él;
- **la dispersión no se dibuja**: el `2,5k + l_b` del extremo contra el `5k + l_b` del interior
  es una difusión a través del ala hasta el alma, y no hay ningún detalle que la muestre.

Esto enlaza con el hallazgo **A6** del informe normativo: el §5.8.4 de AIST TR-13 prescribe
`l_b = 2·(altura del riel + espesor del ala)` y la hoja usa `2·H_riel`. **Con el riel y el ala
dibujados, el error se vería**; sin ellos, `l_b` es un número sin geometría.

**Corrección:** un detalle del ala superior a escala propia con el riel, `k`, `l_b` y las dos
dispersiones acotadas.

### E4 — Las ruedas están en una posición y el §J10 se verifica en otra

El alzado dibuja las dos ruedas en `x_crít = 3000 mm` y `x_crít + a`, que es la posición
crítica **de flexión**. El texto de la hoja dice que para el §J10 «se verifica el caso del
EXTREMO, que es el de menos resistencia». El dibujo muestra una posición y el panel reporta la
otra, sin decirlo.

**Corrección:** dibujar el tren en su posición de flexión **y** marcar el extremo con una
segunda posición fantasma rotulada «§J10: caso del extremo».

### F4 — La fuerza lateral no aparece

El estado que **gobierna** es la interacción H1 (0,8582), que combina flexión fuerte y
**flexión lateral**. `H_lat` no está dibujada ni en la sección —donde se aplicaría al nivel del
riel, que es lo que justifica la hipótesis de que el ala superior más el canal la toman
íntegra— ni en el alzado.

### Otras

- **El canal-tapa se dibuja como un rectángulo liso.** Un canal-tapa es un perfil C tumbado; y
  `hay_canal` es el interruptor que hace monosimétrica la sección, así que su forma es
  precisamente lo que hay que ver.
- El título de la sección dice «(monosimétrica)» y en el ejemplo de referencia las dos alas
  miden lo mismo (324 × 19,05): la monosimetría viene solo del canal. El eje neutro a
  `y_NA = 377,4` sobre `h_tot = 691,5` es la única pista, y es correcta pero discreta.
- `S_xc` y `S_xt` se apilan sobre la cota del eje neutro (G4).
- Si se aplica el hallazgo **A3** (la compacidad del alma por el caso 16 de la Tabla B4.1b), el
  panel tendrá que mostrar `h_c/h_p` y `M_p/M_y`, y el dibujo el **eje neutro plástico** junto
  al elástico, que hoy solo dibuja el elástico.

---

## ¿Hace falta una vista por dirección?

Se evaluó mirando, no por principio. **Conclusión: no, salvo una.**

| Hoja | Veredicto |
|---|---|
| `llave-corte` | **No.** Necesita una **vista de sección** (la del 35°) y una **vista de detalle** de la chapa, no una vista por dirección. Las dos chapas caben en la misma planta si se rotulan con su `V_u` |
| `pedestal` | **No.** El corte X y el corte Y son dos números sobre la misma sección; lo que falta es el P–M, no un segundo dibujo |
| `zapata` | **Sí, parcialmente.** El alzado es «en la dirección Y» y `u_corte_X` (0,3027) no tiene alzado. Basta con **rotular las dos secciones críticas en planta** y acotar la banda; un segundo alzado completo no compensa la página |
| `placa-base` | **No.** La flexión es en una dirección declarada (`L_bp`) y la planta ya cubre lo demás |

**Coste en páginas.** Ninguna de las correcciones propuestas exige crecer el `viewBox`: las
siete figuras tienen zonas vacías grandes (el pedestal vacío de la llave, el vano vacío de la
carrilera, la mitad inferior de la sección del pedestal). El único caso dudoso es la llave, que
gana una tercera vista; si no cupiera, `840×640` en vez de `840×560` cuesta **0 páginas** —la
región `image` mide `720×480` y la altura impresa la fija `r.h`, no el `viewBox`.

---

## Qué haría primero

Por relación valor/esfuerzo, y solo cuando lo apruebes:

1. **E1 + E2** (`llave-corte`): llevar `A_Vc` a la elevación y dibujar la cuña a 35° en planta.
   Es el error de fidelidad más claro y es el que motivó esta revisión.
2. **F1** (`pedestal`): el diagrama P–M en lugar de la elevación. Es el mayor salto de valor
   técnico de las siete.
3. **E3** (`silla-anclaje`): mover los pernos entre los nervios. Es un error de una línea y hoy
   el dibujo contradice la ecuación.
4. **F3 + E4** (`viga-carrilera`): el detalle del riel con `l_b` y las dos posiciones del tren.
   Va junto con el hallazgo normativo A6.
5. **G1, G2, G5, G6** (los solapes y el mortero): baratos, y dos de ellos ya los habías visto.
6. **E5, E6, H1, H3**: las cuatro contradicciones entre dibujo, panel y hoja.

---

## Estado de aplicación

**2026-09-16.** Se aplicó la **lista priorizada 1–6**, decisión tomada al abrir la sesión.
Cuatro commits: `3b8d980` (solapes y contradicciones), `a518a85` (la llave), `e6e909f`
(la silla) y `fe523e4` (la carrilera). **Ningún SVG se tocó sin mirar el PNG resultante**,
antes y después, con el mismo `render-esquemas.mjs` que produjo los 14 PNG de esta revisión.

| # | Estado | Qué se hizo |
|---|---|---|
| **E1 + E2 + G3** | aplicados | La llave pasa de dos vistas a cuatro sin crecer el `viewBox`. `A_Vc` sale de la planta y va a una **CARA LATERAL** propia, con el rectángulo teórico punteado —que suele desbordar el pedestal—, la parte recortada, `A_ef,sl` rayada porque se resta, la cota de `b_sl + 3·c_a1` y una nota que dice si hubo recorte. En planta queda la **cuña a ≈35°** y `c_a1` medida desde la superficie de aplastamiento. Y la chapa estrena **detalle a escala propia**, que de paso resuelve G1 y G6 |
| **E3** | aplicado, **y era más hondo** | No había que mover los pernos: la elevación dibujaba los nervios saliendo de `COL_B/2` y la hoja mide `y_fila` contra `COL_H/2` (lo dice `exc_n`). Con la dirección correcta, el perno a 767 cae dentro del nervio (500–850) y de la chapa, a 267 de la cara, sin mover nada. La planta arrastraba el mismo error |
| **F3 + E4** | aplicados | Detalle del ala superior con el riel, `l_b` acotada y las dos dispersiones (`5k + l_b` interior contra `2,5k + l_b` extremo); y la posición fantasma del tren en el apoyo, que es donde se verifica el §J10 |
| **G1, G2, G4, G5** | aplicados | La nota de pernos sale del área `A_Nc`; `S_xc` y `S_xt` van cada uno junto a su fibra; `y_fila` baja al perno izquierdo; el rótulo de la llave deja de caer sobre el mortero |
| **G6** | aplicado **donde el dato existe** | Trama de mortero en la silla y en la llave. En `placa-base` **no procede**: esa hoja no conoce el espesor del mortero, solo `z_llave` ya compuesto, y dibujarlo sería afirmar lo que la hoja no sabe — justo el defecto de la familia H |
| **E5, E6, H1, H3** | aplicados | El panel del anclaje deja de dar armadura provista con `usa_arm = 0`; la elevación dibuja los `n_trac` pernos; la reacción del suelo pierde el perfil de cierre que afirmaba un reparto uniforme; y las barras del pedestal bajan con gancho a 90° cuando `sdc_def = 1`, que es lo que el panel afirmaba |
| **F1** | **cerrado**, en una sesión posterior del mismo día | La hoja pasó a calcular el diagrama y el esquema lo dibuja. Ver [F1 — cómo se cerró](#f1--cómo-se-cerró) |

### F1 — por qué se paró

El informe pedía «un P–M con la envolvente y los puntos de demanda encima». Al ir a
dibujarlo apareció que **la hoja no tiene con qué**: recibe los tres puntos intermedios como
pares `(Mu_i, φMn_i)` pero **no la axial de cada uno**, y sin ella no se pueden situar en el
plano P–M. Interpolar una envolvente entre `φP_n,max` y `φP_nt` pasando por los `φMn_i` sin
saber su axial sería afirmar lo que la hoja no sabe.

Las dos salidas, para cuando se retome:

1. **Tres entradas `P_1`, `P_2`, `P_3`.** Da el diagrama completo. Cuidado: el harness
   instancia `Mu_i` y `phiMn_i` desde `sap/demanda.py` y no conoce las `P_i`, así que en una
   instancia los momentos vendrían del proyecto y las axiales del ejemplo — hay que añadirlas
   también allí o el diagrama sale incoherente en silencio.
2. **Diagrama parcial**: el eje P con los dos extremos calculados y la demanda axial marcada,
   más tres barras de uso por punto. No es la envolvente, pero no afirma ninguna axial.

### F1 — cómo se cerró

Se tomó la salida 1, y de camino apareció que la premisa de la que colgaba —«la φM_n de cada
punto entra como dato»— tampoco hacía falta. **La hoja calcula ahora el diagrama entero**,
por compatibilidad de deformaciones del §22.2: barre la profundidad del eje neutro, aplica la
Tabla 21.2.2 y el §21.2.2.3 punto a punto, y corta en el tope del §22.4.2.1. No es álgebra
nueva: es la que `columna-interaccion-esbeltez.json` y `muro-flexocompresion.json` ya tenían
escrita, con las capas generalizadas al reparto perimetral de barras que el propio esquema
dibujaba. Cuatro envolventes —los dos ejes por los dos sentidos, porque con un número impar
de barras el reparto no es simétrico— y las **seis** ternas `(P, M_X, M_Y)` encima.

Tres decisiones que conviene no perder:

- **Las entradas `(Mu_i, φMn_i)` desaparecen.** La advertencia de la salida 1 sobre
  `sap/demanda.py` sigue en pie y ahora es más grande: ese módulo emite `Mu_1..3` y pide un
  callback `phiMn(Pu, eje)` que ya sobra. Hay que reescribirlo para que devuelva las seis
  ternas; los datos ya los tiene (`filas_de_base` trae `P`, `Mf_b` y `Md_b` por combinación).
- **La resistencia se lee INTERPOLANDO sobre la misma matriz que se dibuja**, y no con una
  bisección aparte como hacen columna y muro. Con dos cálculos distintos, el número del panel
  y la curva del dibujo pueden separarse; con uno solo, no.
- **El barrido corre sin unidades.** Con cantidades de mathjs la hoja tardaba 0,62 s y el
  visor de `/diseno` reevalúa en cada tecla. Lo que se pierde —la comprobación dimensional
  dentro del bucle— lo cubre `v_pm_Po`, que compara el extremo del barrido contra el `P_o` del
  §22.4.2.2 con unidades. Aun así 0,28 s era demasiado para el visor, y `PaginaDiseno` estrenó
  `useDeferredValue`: el comentario de ese archivo ya decía que ahí era donde tocaría aplazar.

**F7 sigue fuera** (el círculo de `0,5·h_ef` sobre la sección con las barras que cuentan
resaltadas): la cota horizontal se mantiene como estaba.

### Lo que sigue fuera, por decisión

**F2** (tronco de pirámide del punzonamiento), **F4** (`H_lat` dibujada), **F5** (cuerpo
libre de la placa base), **F6** (columna en corte con el rigidizador), **F7** (círculo de
`0,5·h_ef` con las barras que cuentan) y **H2** (marca de desarrollo de la armadura de
anclaje). Quedaron fuera del alcance acordado al abrir la sesión, no por dificultad.

De «Otras», siguen pendientes: en la zapata, distinguir las dos secciones críticas de corte
y acotar la banda central; en la placa base, dibujar la llave con su brazo `z_llave`; en la
carrilera, dibujar el canal-tapa como perfil C y no como rectángulo liso.
