# Auditoría normativa de las siete planillas genéricas

**2026-09-15.** Se releyó del PDF **cada artículo citado** por las siete hojas de
`public/biblioteca/`, sin dar por buena el acta de lectura previa del harness. Este
documento es el resultado; **ninguna corrección se ha aplicado todavía**.

## Cómo leer este informe

Cada hallazgo lleva la cita tal como está hoy en la hoja (con el id de región), la
transcripción de lo leído y un veredicto:

| Veredicto | Qué significa |
|---|---|
| **errata de cita** | el artículo no es el que dice la hoja; el número calculado no cambia |
| **artículo fuera de alcance** | el artículo existe y dice eso, pero no cubre el caso que la hoja le aplica |
| **estado límite ausente** | el alcance declarado exige una comprobación que la hoja no hace ni declara como frontera |
| **permiso no aprovechado** | la norma permite algo menos exigente y la hoja no lo dice, así que un ✗ puede no serlo |
| **`meta` incompleto** | la declaración legible por máquina no refleja lo que la hoja usa |
| **correcta** | la lectura confirma lo que la hoja afirma |

Las citas de evidencia van en el formato del harness: `CLAVE § artículo · pdf N = impresa M`.

### Offsets verificados antes de citar

| Norma | Regla | Comprobado leyendo |
|---|---|---|
| `US/AISC360-22` | `pdf = impresa + 68` | pdf 222 → «16.1-154», pdf 223 → «16.1-155» |
| `US/ACI318-25-SI` | `pdf = impresa + 1` | pdf 431 → «430», pdf 264 → «263», pdf 308 → «307» |
| `US/AISC-DG1-3ed` | `pdf = impresa + 10` | — |
| `US/AIST-TR13-2021` | `pdf = impresa + 9` | — |

`US/ASCE7-22` figura como **ausente** en `_norma\_catalogo.json`: no es citable. Ninguna de
las siete hojas la cita.

---

## Resumen por gravedad

### A — Cambian o pueden cambiar un número

| # | Hoja | Qué pasa |
|---|---|---|
| A1 | `anclaje-hormigon-generica` | El descascaramiento lateral se resuelve con el §17.6.4.1 (**un** perno) en una hoja de **grupo**. El §17.6.4.2 existe y es más exigente |
| A2 | `pedestal-generico` | Falta la **interacción de corte biaxial** del §22.5.1.11. La hoja comprueba `u_corte_X` y `u_corte_Y` por separado: dos cortes a 0,9 pasan, y la norma exige que sumen ≤ 1,5 |
| A3 | `viga-carrilera-generica` | La compacidad del alma usa `λ_pw = 3,76√(E/F_y)`, que es el **caso 15** de la Tabla B4.1b (alma **doblemente** simétrica). La hoja es explícitamente **monosimétrica**: le toca el **caso 16**, que depende de `h_c/h_p` y `M_p/M_y` |
| A4 | `pedestal-generico` | La separación de estribos no incluye la **Tabla 10.7.6.5.2** (`d/2` o `d/4`), que el §10.7.6.1.1 obliga a aplicar junto con la del §25.7.2.1 por ser «la más restrictiva» |
| A5 | `pedestal-generico` | Falta el **§10.7.6.1.5**: los pernos de anclaje en la cabeza de un pedestal se confinan con al menos dos estribos No. 13 o tres No. 10 dentro de los 125 mm superiores, rodeando cuatro barras longitudinales |
| A6 | `viga-carrilera-generica` | `l_b := 2·H_riel`, declarado como «criterio corriente». El **§5.8.4 de AIST TR-13** lo prescribe: `2·(altura del riel + espesor del ala)`. Con el ejemplo de referencia son 120 mm contra 170 |

### B — Erratas de cita (el número no cambia, la trazabilidad sí)

| # | Hoja | Qué dice | Qué corresponde |
|---|---|---|---|
| B1 | `zapata-generica` (r031) | «Tabla 21.2.1: φ = 0,75 en corte **(e)**» | el corte es la fila **(b)**; la **(e)** son ménsulas |
| B2 | `zapata-generica` (`v_no_aplica_862`) | «la reducción del **§8.6.2**» | es el **§8.6.1.2**, y es un **aumento** de `A_s,min`, no una reducción |
| B3 | `placa-base-generica` (`phi_sa`.etiqueta) | «ACI **Tabla 17.5.3(a)**, anclaje dúctil» | el §17.5.3 no tiene tabla: remite a la **Tabla 21.2.1**, fila **(o)** |
| B4 | `placa-base-generica` (r020) | el incremento C₂ «de la **Tabla C-J3.5**» | está en la **Tabla J3.5M**, que es **normativa**; no existe ninguna «Tabla C-J3.5» |
| B5 | `viga-carrilera-generica` (r004) | «PROHÍBE la acción de campo diagonal del **§G3**» | el §5.8.3 de TR-13 dice literalmente «Section G3», pero es la numeración de **AISC 360-16**; en la **22**, que es la que la hoja declara, el campo diagonal es el **§G2.2 y §G2.3** y el §G3 son **ángulos simples y tees** |
| B6 | `llave-corte-generica` (r082) | «**[J4-1]** fluencia en flexión … rotura con φ = 0,75» | [J4-1] y [J4-2] son de **tracción axial**. La flexión es el **§J4.5**, que no numera ecuaciones |
| B7 | `llave-corte-generica` (`v_regla_espesor`, r040) · `README.md` de la biblioteca | «t_bp ≥ t_sl (**DG1 §4.3.3**)» | el §4.3.3 es «Design for Shear» y **no contiene la regla**. Está en la **impresa 79**, antes del Ejemplo 4.7-5, y es una **regla práctica de los autores**, no una prescripción |
| B8 | `llave-corte-generica` (r062) | «**[17.11.3.1.1]** … y A_Vco = 4,5·c_a1²» | `A_Vco` lo define el **§17.7.2.1** (Fig. R17.7.2.1a), al que el §17.11.3.1 remite |

### C — Alcance y declaraciones

| # | Hoja | Qué pasa |
|---|---|---|
| C1 | `llave-corte-generica` | El §17.11.1.1.3 (pernos **soldados** a la placa: parte del corte entra en la interacción del §17.8) no se calcula ni se declara como frontera |
| C2 | `zapata-generica` | El §13.2.6.2 permite `V_c = 0,17λ√f'c·b_w·d` y `λ_s = 1,0` en punzonamiento para una zapata rígida sobre suelo. La hoja no lo usa ni lo menciona: un ✗ de corte puede no ser un ✗ |
| C3 | `anclaje-hormigon-generica` | La frontera dice que «la interacción del §17.8» va a `llave-corte-generica`, que no la calcula; y la **R17.8.4** dice que la interacción de acero *no* está pensada para llaves de corte |
| C4 | `zapata-generica` | El §18.13.2.5 **solo rige en SDC D, E o F** (§18.13.2.1) y solo donde el sismo produce levantamiento. La hoja lo impone a toda zapata: `v_sup_min` y `v_sup_flexion` votan siempre en `v_global` |
| C5 | `llave-corte-generica` · `silla-anclaje-generica` | El §J4.2 manda tomar el **menor** de fluencia y **rotura** en corte. Las dos hojas solo calculan la fluencia; con acero de F_u/F_y < 1,33 (un A572 Gr. 50: 450/345) **manda la rotura** |
| C6 | `viga-carrilera-generica` | `meta.normas` declara solo `US/AISC360-22`, y la hoja apoya dos veredictos y una frontera en **AIST TR-13 §5.8.2 y §5.8.3** |
| C7 | `viga-carrilera-generica` | De la lista de estados límite del §5.8.2 de TR-13 quedan sin cubrir y sin declarar: **fuerzas axiales**, **efectos de carga concentrada en los apoyos** y los **rigidizadores de apoyo** que el §5.8.3 exige «where required to transmit end reactions» |

---

## 1. `anclaje-hormigon-generica`

Norma declarada: `US/ACI318-25-SI`. Es la hoja mejor citada de las siete: de los 24
artículos que invoca, 23 dicen exactamente lo que ella afirma.

### A1 — El descascaramiento lateral se calcula como un perno solo · **estado límite ausente**

**Lo que hace la hoja.** Regiones `r_modo_sb` … `u_blowout`:

```
hef_lim_sb := 2.5*c_a1
modo_sb    := h_ef > hef_lim_sb ? "APLICA…" : "no aplica…"
f_ca2      := c_a2 < 3*c_a1 ? (1 + min(max(c_a2/c_a1, 1.0), 3.0))/4 : 1.0
N_sb       := psi_a*13*c_a1*sqrt(A_brg)*lambda_a*sqrt(f'c)*f_ca2
u_blowout  := h_ef > hef_lim_sb ? (Nua_g/n_trac)/phiN_sb : 0
```

Es decir: resistencia de **un** perno contra la carga **de un** perno.

**Lo leído.** `US/ACI318-25-SI § 17.6.4 · pdf 276 = impresa 275` y `pdf 277 = impresa 276`:

> **17.6.4.1** For a **single** headed anchor with deep embedment close to an edge
> (h_ef > 2.5c_a1), the nominal side-face blowout strength, N_sb, shall be calculated by:
> N_sb = ψ_a·13·c_a1·√A_brg·λ_a·√f'c  (17.6.4.1)
>
> **17.6.4.1.1** If c_a2 for the single headed anchor is less than 3c_a1, the value of N_sb
> shall be multiplied by the factor (1 + c_a2/c_a1)/4, where 1.0 ≤ c_a2/c_a1 ≤ 3.0.
>
> **17.6.4.2** For **multiple** headed anchors with deep embedment close to an edge
> (h_ef > 2.5h_ef) and anchor spacing less than 6c_a1, the nominal strength of those anchors
> susceptible to a side-face blowout failure, N_sbg, shall be calculated by:
> N_sbg = (1 + s/(6c_a1))·N_sb  (17.6.4.2)
> where s is the distance between the outer anchors along the edge, and N_sb is obtained
> from Eq. (17.6.4.1) **without modification for a perpendicular edge distance**.

Y `US/ACI318-25-SI § 17.10.5.4(d) · pdf 299 = impresa 298` confirma que el modo de grupo
existe también en el camino sísmico: «(d) 0.75φN_sb **or 0.75φN_sbg**».

**Por qué importa.** La hoja es explícitamente de **grupo**: tiene `n_trac` pernos en una
fila a separación `s_1`, y `s_1` es exactamente la `s` del §17.6.4.2. Con dos pernos:

- lo que comprueba la hoja equivale a `2·(N_ua/2) ≤ 2·φN_sb`;
- lo que exige el §17.6.4.2 es `2·(N_ua/2) ≤ φ·(1 + s/(6c_a1))·N_sb`.

Como `(1 + s/(6c_a1)) ≤ 2` siempre que `s ≤ 6c_a1`, **la hoja es menos exigente que la
norma** justo en el rango en que el artículo de grupo aplica. Con `s = 0,5·c_a1` el factor
es 1,083 contra el 2,0 implícito: la hoja admitiría casi el doble de carga.

El ejemplo de referencia no lo destapa porque `h_ef ≤ 2,5·c_a1` y el modo no aplica
(`u_blowout = 0`), pero una instancia con embebido profundo cerca de un borde sí cae ahí.

**Corrección propuesta.** Añadir la rama de grupo y hacer que gobierne cuando corresponda:

```
s_outer := (n_trac - 1)*s_1                      # separación entre pernos extremos
f_grupo := s_outer < 6*c_a1 ? 1 + s_outer/(6*c_a1) : n_trac
N_sbg   := f_grupo*N_sb_sin_f_ca2
u_blowout := h_ef > hef_lim_sb ? Nua_g/(f_sis*phi_c*N_sbg) : 0
```

con dos matices que la lectura obliga a respetar: el §17.6.4.2 usa `N_sb` **sin** el factor
de borde perpendicular `f_ca2`, y la `R17.6.4.2` acota los pernos a considerar a los que
están cerca del borde (`c_a1 < 0,4·h_ef`). **Cambia números**: hay que comparar contra la
versión de git con el centinela de scope antes de aceptarla.

### C3 — La frontera manda la interacción del §17.8 a una hoja que no la hace · **`meta` incompleto**

`meta.fronteras` dice: «no cubre el corte (pryout, breakout de borde e interacción **17.8**)
van en `llave-corte-generica`». Dos cosas no cuadran.

`US/ACI318-25-SI § R17.8.4 · pdf 293 = impresa 292`:

> The interaction check for steel is intended for the shaft of the anchor (anchor bolt,
> cast-in headed stud, threaded rod, screw). **It is not intended for shear lugs.**

Y `llave-corte-generica` no calcula ninguna interacción del §17.8: sus nueve secciones son
espesor, embebido, aplastamiento, *breakout*, dos chapas, acero de la chapa, soldadura,
flexión local y armadura de anclaje.

**Por qué no es un error de cálculo.** La familia declara que la llave toma el corte
íntegro (`llave-corte-generica`, hipótesis: «el corte lo transfiere íntegramente la llave,
sin fricción ni pernos»), así que los pernos quedan con tracción pura y la interacción se
satisface sola. La frontera está mal **escrita**, no mal pensada.

**Corrección propuesta.** Reemplazar esa frontera por: «El corte no llega a los pernos: lo
toma la llave (`llave-corte-generica`). Por eso no hay interacción tracción-corte del §17.8
que verificar; si en una instancia el corte se repartiera entre pernos y llave, el §17.8
volvería a aplicar y esta hoja no lo cubre.» No cambia ningún número.

### Citas que la lectura confirma

| Artículo | Dónde lo usa la hoja | Confirmado en |
|---|---|---|
| §17.5.2.1.1 (armadura de anclaje en vez del cono, con (a) desarrollo a ambos lados y (b) ramas paralelas) | r082, sección 5 | pdf 264 = impresa 263 |
| §17.5.2.1.3 (solo la componente paralela) · §17.5.2.1.4 (no vale corte-fricción del 22.9) | fronteras | pdf 265 = impresa 264 |
| §17.5.3 → Tabla 21.2.1 (los φ se consolidaron en la ed. 25) | r031 | pdf 266 = impresa 265 |
| Tabla 17.5.4.1: colado 0,95 sin armadura suplementaria, 1,00 con ella | `psi_a`.ayuda | pdf 267 = impresa 266 |
| §17.6.1.2: N_sa = A_se,N·f_uta, con f_uta ≤ 1,9f_ya y ≤ 860 MPa | r042 | pdf 267 = impresa 266 |
| R17.6.1.2: A_se,N = (π/4)(d_a − 0,9743/n_t)², n_t hilos **por pulgada** | r042 | pdf 268 = impresa 267 |
| §17.6.2.1(b): siete factores y **sin `n`** | r051 | pdf 268 = impresa 267 |
| §17.6.2.1.1 (A_Nc ≤ n·A_Nco) · §17.6.2.1.2 (tres bordes → h_ef ficticio) · §17.6.2.1.4 (A_Nco = 9h_ef²) | r051, `n_bordes`.ayuda | pdf 270-271 = impresas 269-270 |
| Fig. R17.6.2.1: cono ≈ 35°, 1,5·h_ef | r051 | pdf 269 = impresa 268 |
| §17.6.2.2.1 (k_c = 10 colado / 7 post-instalado) · §17.6.2.2.3 (rama h_ef^(5/3), 280–635 mm, colados con cabeza) | r051, `k_c`.ayuda | pdf 272 = impresa 271 |
| §17.6.2.3.1 (ψ_ec,N) · §17.6.2.4.1 (ψ_ed,N) · §17.6.2.5.1 (ψ_c,N = 1,25 colado no fisurado) · §17.6.2.6.2 (ψ_cp,N = 1,0 para colados) | secciones 2 y 5 | pdf 272-274 = impresas 271-273 |
| §17.6.2.7.1: ψ_cm,N = 2 − z/(1,5h_ef) ≥ 1,0, con las **dos** condiciones (1,5h_ef de borde libre y C/T > 0,8) | `psi_cm`.ayuda | pdf 274 = impresa 273 |
| §17.6.3.1 (N_pn = ψ_a·ψ_c,P·N_p) · §17.6.3.2.2(a) (N_p = 8·A_brg·f'c) · §17.6.3.3.1 (ψ_c,P = 1,4 / 1,0) | r068, sección 3 | pdf 274-276 = impresas 273-275 |
| Tabla 17.9.2(a): colado no torqueado 4·d_a y recubrimiento del §20.5.1.3; torqueado 6·d_a | r090 | pdf 295 = impresa 294 |
| Tabla 17.9.5: lista **solo** post-instalados, no alcanza a los colados | sección 6 | pdf 296 = impresa 295 |
| §17.10.2 (no aplica en rótula plástica) · §17.10.4 (barra conformada, §20.2.2, SDC C-F) · §17.10.5.2 (regla del 20 %) | r039, hipótesis | pdf 297 = impresa 296 |
| §17.10.5.3(d): tracción de combinaciones con E_h amplificado por Ω₀ | r039 | pdf 298 = impresa 297 |
| §17.10.5.4(b): con armadura de anclaje del 17.5.2.1(a), **N_cb/N_cbg no hace falta calcularlo** | r024 | pdf 299 = impresa 298 |
| §17.10.5.5: con armadura de anclaje no hay más reducción que el φ de la Tabla 21.2.1 | sección 5 | pdf 300 = impresa 299 |

**Un matiz sobre el §17.10.5.3(a).** La ayuda de `omega` dice «la resistencia gobernada por
el hormigón no baja de 1,2·N_sa». Para **un** perno el artículo dice eso; para un **grupo**
lo escribe como razón (`pdf 298 = impresa 297`): la razón entre la carga del perno más
solicitado y su resistencia de acero debe ser ≥ la razón entre la carga del grupo y su
resistencia gobernada por el hormigón, con el acero tomado como **1,2 veces** el nominal.
Con reparto uniforme —que es la hipótesis declarada— las dos formas coinciden. No es un
error; conviene que la ayuda lo diga.

---

## 2. `llave-corte-generica`

### C1 — El §17.11.1.1.3 no se calcula ni se declara · **estado límite ausente**

**Lo leído.** `US/ACI318-25-SI § 17.11.1.1.3 · pdf 303 = impresa 302`:

> For anchors **welded** to the attachment base plate, tension and shear interaction
> requirements of 17.8 shall include a portion of the total shear on the anchor.

Con `R17.11.1.1.3` dando el reparto: `V_ua,i = V_u · 2d_a²/(A_ef,sl + n·2d_a²)`.

**Lo que hace la hoja.** Nada: su alcance dice «los **siete** estados límite de la llave» y
sus hipótesis suponen que la llave toma el corte entero. Los pernos de la familia son
colados con cabeza y **no** soldados a la placa, así que el artículo no aplica — pero eso
no está escrito en ningún sitio, y una instancia con pernos soldados lo incumpliría en
silencio.

**Corrección propuesta.** Una frontera: «Pernos colados con cabeza, **no soldados** a la
placa base. Con pernos soldados, el §17.11.1.1.3 obliga a meter una parte del corte total
en la interacción del §17.8, y esta hoja no lo hace.» No cambia números.

### Citas que la lectura confirma

| Artículo | Dónde | Confirmado en |
|---|---|---|
| §17.11.1.1.2: mínimo **cuatro** pernos | sección 2 | pdf 303 = impresa 302 |
| §17.11.1.1.4 y §17.11.1.1.6: φ = 0,65 en aplastamiento y en *breakout* | r054, sección 4 | pdf 303 = impresa 302 |
| §17.11.1.1.8: (a) h_ef/h_sl ≥ 2,5 y (b) h_ef/c_sl ≥ 2,5 | r048, `hef_req` | pdf 303 = impresa 302 |
| §17.11.2.1: V_brg,sl = 1,7·f'c·A_ef,sl·ψ_brg,sl | r053, `phiVbrg_x` | pdf 304 = impresa 303 |
| §17.11.2.1.1(b): el área efectiva se topa a **2·t_sl** bajo la superficie del hormigón | r040, `hef_sl := min(h_sl, 2*t_sl)` — y `h_sl` está definida «bajo el mortero», que es lo que hace correcto el tope | pdf 304 = impresa 303 |
| §17.11.2.2.1: (a) tracción `1 + P_u/(n·N_sa) ≤ 1`, (b) sin axial `1`, (c) compresión `1 + 4P_u/(A_bp·f'c) ≤ 2` | r053, `psi_x`, `psi_y` | pdf 305 = impresa 304 |
| §17.11.2.4: aditividad de dos llaves si el corte en el plano entre ellas no pasa 0,2·f'c | sección 5 | pdf 306 = impresa 305 |
| §17.11.3.1: c_a1 de la **superficie de aplastamiento** al borde libre; A_Vc proyectada en la **cara lateral** | r062 | pdf 306 = impresa 305 |
| §17.11.3.1.1: A_Vc = rectángulo de 1,5c_a1 horizontal a cada lado y 1,5c_a1 bajo h_ef,sl, **menos A_ef,sl** | r062: `(h_ef,sl + 1,5c_a1)(b_sl + 3c_a1) − h_ef,sl·b_sl` | pdf 307 = impresa 306 |
| §17.11.3.3: llave en esquina → se calcula por cada borde y manda el mínimo | sección 4 | pdf 307 = impresa 306 |
| §17.11.3.4: varias llaves → una superficie por cada una (declarado como frontera) | fronteras | pdf 307 = impresa 306 |
| §17.7.2.2.1(b): V_b = 3,7·λ_a·√f'c·c_a1^1,5 | r062 | pdf 290 = impresa 289 |
| §17.5.2.1.2: armadura de anclaje **en corte**, con (a) desarrollo más allá de la superficie y (b) ramas paralelas al corte | sección 9 | pdf 264-265 = impresas 263-264 |

**Sobre `A_Vco = 4,5·c_a1²`.** La hoja lo atribuye a `[17.11.3.1.1]`. El artículo que lo
define es el **§17.7.2.1** (`Fig. R17.7.2.1a · pdf 285 = impresa 284`:
`A_Vco = 2(1,5c_a1)×(1,5c_a1) = 4,5c_a1²`), al que el §17.11.3.1 remite. La cadena es
correcta pero la atribución directa no; se arregla escribiendo `[17.7.2.1]` junto al
`[17.11.3.1.1]`. **Errata menor, no cambia números.**

---

## 3. `zapata-generica`

### B1 — El φ de corte es la fila (b), no la (e) · **errata de cita**

**Lo que dice la hoja**, región `r031`:

> **Tabla 21.2.1**: φ = 0,90 en tracción **(a)** y 0,75 en corte **(e)**.

**Lo leído.** `US/ACI318-25-SI § Tabla 21.2.1 · pdf 431 = impresa 430`:

| Fila | Acción | φ |
|---|---|---|
| (a) | Moment, axial force, or combined moment and axial force | 0,65 a 0,90 según 21.2.2 |
| **(b)** | **Shear** | **0,75** |
| (c) | Torsion | 0,75 |
| (d) | Bearing | 0,65 |
| **(e)** | **Brackets and corbels** | 0,75 |

El valor 0,75 es correcto; la letra no. La **(e)** son ménsulas y cartelas, que no es lo
que la zapata calcula.

**Corrección propuesta.** `«Tabla 21.2.1: φ = 0,90 en tracción (a) —con el 0,90 de la
Tabla 21.2.2 por ser sección controlada por tracción— y 0,75 en corte (b).»` No cambia
ningún número.

### B2 — El aviso cita el §8.6.2, que es de losas pretensadas · **errata de cita**

**Lo que dice la hoja.** El veredicto `v_no_aplica_862`:

```
v_no_aplica_862 := vuv <= phi_corte*0.17*lam_sP*lam*sqrt(fc_n)*(1 MPa) =
```
con etiqueta «No aplica la reducción del **§8.6.2**» y `avisoTexto` «Cae en el caso del
**§8.6.2** que esta hoja no cubre».

**Lo leído.** `US/ACI318-25-SI § 8.6.1.2 · pdf 123 = impresa 122`:

> **8.6.1.2** If v_uv > φ0.17√f'c·λ_s·λ on the critical section for two-way shear
> surrounding a column, concentrated load, or reaction area, A_s,min provided over the width
> b_slab shall satisfy Eq. (8.6.1.2): A_s,min = 5·v_uv·b_slab·b_o/(φ·α_s·f_y)

Y `pdf 124 = impresa 123`:

> **8.6.2** *Minimum flexural reinforcement in **prestressed** slabs*

Dos erratas en una: el artículo es el **§8.6.1.2**, y lo que hace es **subir** `A_s,min`
—no reducirla—. La condición que la hoja escribe es literalmente el umbral del §8.6.1.2, así
que el cálculo está bien y solo está mal rotulado.

**Corrección propuesta.** Renombrar el veredicto a `v_no_aplica_8612`, etiqueta «No se
dispara el mínimo del §8.6.1.2» y `avisoTexto` «v_uv supera φ·0,17·λ_s·λ·√f'c: el §8.6.1.2
exige subir A_s,min sobre b_slab, y esta hoja no lo hace». Ojo: renombrar el id obliga a
rehacer `meta.casos` con `npm run verify:biblioteca -- --casos-escribir`.

### C2 — El §13.2.6.2 permite dos simplificaciones que la hoja no usa ni menciona · **permiso no aprovechado**

**Lo leído.** `US/ACI318-25-SI § 13.2.6.2 · pdf 209 = impresa 208`:

> For shallow foundation members continuously supported by soil and designed based on the
> assumption of rigid behavior of the shallow member, (a) and (b) shall be permitted:
> (a) For one-way shear strength, V_c shall be taken as: V_c = 0.17λ√f'c·b_w·d
> (b) For two-way shear strength, the size effect factor λ_s, specified in 22.6, shall be
> taken equal to 1.0.

**Lo que hace la hoja.** Usa la Tabla 22.5.5.1 ecuación (c) con `λ_s` en corte en una
dirección, y `lam_sP := min(1, sqrt(2/(1 + d_pun/250 mm)))` en punzonamiento. Las dos cosas
son **más exigentes** que el permiso, así que no hay incumplimiento — pero la hoja cae de
lleno en el supuesto del §13.2.6.2 (su alcance es «zapata rectangular aislada», «apoyo
interior», rígida sobre suelo), y el lector no puede saber que un ✗ de corte podría
levantarse aplicando un artículo que la propia norma le ofrece.

Con un canto de 700 mm, `λ_s` vale 0,80: el punzonamiento sale un **20 % por debajo** del
que la norma permite calcular.

**Corrección propuesta.** No cambiar el cálculo —la vía conservadora es una decisión
legítima— y **declararlo**: una nota en la sección 5 y un renglón en `meta.hipotesis`
diciendo que la hoja renuncia al §13.2.6.2 y qué se gana si se invoca. Alternativa, si
prefieres aprovechar el permiso: una entrada booleana `rigida_sobre_suelo`. **Cambiaría
números**, así que exige la comparación contra git.

### Citas que la lectura confirma

| Artículo | Dónde | Confirmado en |
|---|---|---|
| Tabla 13.2.7.1: el momento en la **cara** de la columna o pedestal | `Mu_X`/`Mu_Y`.ayuda, r031 | pdf 211 = impresa 210 |
| §13.2.7.2: el corte se mide desde la sección crítica de M_u del 13.2.7.1 | r031 | pdf 211 = impresa 210 |
| §13.3.1.2: la **altura útil** de la armadura inferior ≥ 150 mm | `v_canto_min := d_Y >= 150 mm` — la hoja usa `d`, no `h`, que es lo correcto | pdf 213 = impresa 212 |
| §13.3.3.3: banda central de ancho igual al **lado corto**, γ_s = 2/(β+1), resto uniforme fuera | r056, sección 3 | pdf 213 = impresa 212 |
| §8.4.2.2.2: γ_f = 1/(1 + (2/3)√(b1/b2)) | sección 6 | pdf 117 = impresa 116 |
| §8.4.4.2.2: γ_v = 1 − γ_f | r084 | pdf 119 = impresa 118 |
| §8.6.1.1: A_s,min = 0,0018·A_g, **sin dependencia de f_y** en la ed. 25 | r043 | pdf 123 = impresa 122 |
| §8.7.2.2: separación máxima = menor de 2h y 450 mm en secciones críticas | r056 | pdf 126 = impresa 125 |

**Comprobado en el dibujo.** El panel del SVG rotula «canto útil d_Y ≥ 150 mm», que es
exactamente lo que exige el §13.3.1.2 y lo que la hoja calcula. Correcto en los tres sitios.

### B7 — La regla `t_bp ≥ t_sl` no está en el §4.3.3 · **errata de cita**

**Lo que dice la hoja.** La salida `v_regla_espesor` se etiqueta «t_bp ≥ t_sl (**DG1 §4.3.3**)»,
el encabezado de la sección 1 es «REGLA DE ESPESOR Y EXCENTRICIDAD DEL CORTE · **DG1 §4.3.3**
y Ej. 4.7-5» y `r040` abre con la cita «The base plate should be of equal or greater thickness
than the shear lug». El `README.md` de la biblioteca propaga lo mismo: «Por la regla
`t_bp ≥ t_sl` de la **DG1 §4.3.3**».

**Lo leído.** `US/AISC-DG1-3ed § 4.3.3 · pdf 43 = impresa 33`, texto completo de la apertura:

> **4.3.3 Design for Shear** — *Overview of Mechanics and Method.* «For exposed column bases
> similar to those shown in Figures 1-1(a) and (c), there are three principal ways of
> transferring shear from the column and/or the gusset plate into the concrete: (1) through
> shear in the anchor rods, (2) using shear lugs, or (3) through friction when compression is
> present…»

El §4.3.3 (impresas 33 y 34) es el corte de los pernos y las tres vías de transferencia. **No
contiene la regla.** Está en `US/AISC-DG1-3ed · pdf 89 = impresa 79`, en las «Additional
considerations related to the use of shear lugs» que preceden al Ejemplo 4.7-5:

> «2. The base plate and the anchor rods must be designed for the eccentricity resulting from
> bearing forces in the shear lug to the base plate… **As a rule of thumb, the authors
> recommend that the base plate should be of equal or greater thickness than the shear lug
> thickness.**»

Dos cosas cambian: el sitio, y el **estatuto**. Es una regla práctica *de los autores*, no una
prescripción. La hoja la hace votar en `v_global`, y conviene que el lector sepa que lo que lo
pone en ✗ es una recomendación.

**Corrección propuesta.** Etiqueta «t_bp ≥ t_sl (**DG1, Ej. 4.7-5, regla práctica de los
autores**)», el encabezado de la sección 1 a «DG1 Ej. 4.7-5», y la misma corrección en
`public/biblioteca/README.md`. No cambia ningún número.

### C5 — Solo se comprueba la fluencia en corte, y el §J4.2 pide el menor de dos

**Lo leído.** `US/AISC360-22 § J4.2 · pdf 213-214 = impresas 145-146`:

> **2. Strength of Elements in Shear.** «The available shear strength of affected and
> connecting elements in shear shall be the **lower value** obtained according to the limit
> states of shear yielding and shear rupture: (a) For shear yielding of the element
> R_n = 0.60 F_y A_gv (J4-3), φ = 1.00; (b) For shear rupture of the element
> R_n = 0.60 F_u A_nv (J4-4), φ = 0.75.»

**Lo que hace la hoja.** `phiVn_slx := 1.00*0.60*Fy_ac*bY_sl*t_sl` — solo la fluencia.

**Por qué importa.** Sin perforaciones `A_nv = A_gv`, y la rotura manda cuando
`0,75·F_u < F_y`, es decir cuando `F_u/F_y < 1,33`. Con el acero que trae la hoja
(`Fy_ac = 248,2 MPa`, `Fu_ac = 400 MPa`) la razón es 1,61 y manda la fluencia, así que el
ejemplo de referencia no lo destapa. Con un **A572 Gr. 50** (345 / 450 MPa) la razón baja a
1,30: `0,75 × 0,60 × 450 = 202,5 MPa` contra `1,00 × 0,60 × 345 = 207 MPa` — **manda la
rotura**, y la hoja daría un 2 % de más. Y la chapa A572 Gr. 50 es justo la del Ejemplo 4.7-5
de la DG1 (`pdf 90 = impresa 80`).

La `silla-anclaje-generica` tiene el mismo hueco y además lo razona mal: `r049` dice «con la
rotura del área neta regiría 0,75, **pero el nervio no tiene perforaciones**». El §J4.2 no
condiciona la rotura a que haya agujeros; sin ellos `A_nv = A_gv` y la comprobación sigue
existiendo.

**Corrección propuesta.** En las dos hojas, `phiVn := min(1.00*0.60*Fy*A_gv, 0.75*0.60*Fu*A_gv)`,
y reescribir la frase de `r049`. **Cambia números** cuando el acero declarado tenga
`F_u/F_y < 1,33`; con el ejemplo de referencia de las dos hojas no cambia nada, lo que hay que
comprobar contra git.

---

## 4. `placa-base-generica`

### B3 — `phi_sa` cita una tabla que no existe · **errata de cita**

**Lo que dice la hoja.** `meta.entradas`, campo `phi_sa`, etiqueta:
«φ acero del anclaje en tracción (**ACI Tabla 17.5.3(a)**, anclaje dúctil)».

**Lo leído.** `US/ACI318-25-SI § 17.5.3 · pdf 266 = impresa 265`, artículo completo:

> «φ for anchors in concrete and anchor reinforcement shall be in accordance with Table
> 21.2.1.»

Y `R17.5.3`: «The φ-factors for anchors in concrete have been **simplified and consolidated in
Table 21.2.1** in the 2025 Code.» El §17.5.3 no tiene ninguna tabla.

La propia hoja lo dice bien en `r018` («El φ de la **Tabla 21.2.1 (o)**, a la que remite el
§17.5.3») y en `meta.normas`. Es la etiqueta la que quedó con la cita vieja.

**Corrección propuesta.** «φ acero del anclaje en tracción (**ACI Tabla 21.2.1 (o)**, anclaje
dúctil)». No cambia números.

### B4 — El incremento C₂ está en una tabla normativa, no en el comentario · **errata de cita**

**Lo que dice la hoja**, región `r020`:

> «(2) BORDE DE LA CHAPA: [AISC 360-22 §J3.5 y Tabla J3.4M] … más el incremento C2 de la
> **Tabla C-J3.5** por la holgura del hueco»

**Lo leído.** `US/AISC360-22 § J3.5 · pdf 207 = impresa 139`:

> «The distance from the center of an oversized or slotted hole to an edge of a connected part
> shall be not less than that required for a standard hole to an edge of a connected part plus
> the applicable increment, C₂, from **Table J3.5 or Table J3.5M**.»

Y `pdf 208 = impresa 140` trae la **TABLE J3.5M — Values of Edge Distance Increment C₂, mm**,
que es **normativa**: agujeros sobredimensionados, diámetro nominal ≤22 → 2 mm; 24 → 3 mm;
≥27 → 3 mm. **No existe ninguna «Tabla C-J3.5»** con ese contenido; `meta.normas` ya declara
bien «Tabla J3.5M», así que la discrepancia es solo del cuerpo.

**Corrección propuesta.** Sustituir «Tabla C-J3.5» por «**Tabla J3.5M**». No cambia números.

### Citas que la lectura confirma

| Artículo | Dónde | Confirmado en |
|---|---|---|
| §J8: φ_c = 0,65; [J8-1] P_p = 0,85f'c·A_1; [J8-2] con √(A_2/A_1) y el tope 1,7f'c (equivale a topar la raíz en 2,0); A_2 semejante y concéntrica | r014, sección 1 | pdf 216-217 = impresas 148-149 |
| §J9: el anclaje al hormigón se diseña por ACI 318 o ACI 349 | reparto de la familia | pdf 217 = impresa 149 |
| §J3.4: paso ≥ 2⅔·d y luz libre ≥ d; *User Note* prefiere 3d | r020 (1) | pdf 206 = impresa 138 |
| Tabla J3.4M: 12→18 … 36→46, «Over 36» → 1,25d | r020 (2) | pdf 207 = impresa 139 |
| Tabla 17.9.2(a): colado no torqueado 4·d_a y recubrimiento del §20.5.1.3; torqueado 6·d_a | r020 (1) y (3), `torque`.ayuda | pdf 295 = impresa 294 |
| Tabla 20.5.1.3.1: 75 mm contra el terreno; 50 mm a la intemperie para barras No. 19-57 y 40 mm para No. 16 y menores; 40 mm no expuesto en **pedestales** | `recub := exposicion == 1 ? 75 mm : (exposicion == 3 ? 40 mm : (d_perno > 16 mm ? 50 mm : 40 mm))` — reproduce la tabla fila por fila, incluido el corte por diámetro | pdf 422 = impresa 421 |
| §17.6.1.2: N_sa = A_se·f_uta | r018 | pdf 267 = impresa 266 |
| §17.11.1.1.9: «The moment from the couple developed by the bearing reaction on the shear lug and the shear shall be considered in the design of the anchors for tension» | r006, `hay_llave` | pdf 303 = impresa 302 |
| **DG1 §4.3.7** «Design for Combined Axial Compression and Bending», Drake–Elkin modificado por Doyle–Fisher, distribución **uniforme**, [4-34] a [4-37] | encabezado 2, sección 2 | pdf 49 = impresa 39 |

**Una comprobación que valía la pena hacer.** El Ejemplo 4.7-5 de la DG1 remite al **§4.3.6**
para el equilibrio con momento (`pdf 92 = impresa 82`), lo que podía indicar que la hoja citaba
mal el §4.3.7. No es así: el **§4.3.6 es «Design for Bending»**, el caso de **flexión pura**
(`P_r = 0`), y el ejemplo lo usa porque solo tiene corte; el **§4.3.7** es «Design for Combined
Axial Compression and Bending», que es el caso de la hoja. La cita es **correcta**.

---

## 5. `pedestal-generico`

Es la hoja con más hallazgos que cambian números: dos estados límite ausentes y un detallado
obligatorio que no aparece.

### A2 — Falta la interacción de corte biaxial del §22.5.1.11 · **estado límite ausente**

**Lo que hace la hoja.**

```
u_corte_X := Vu_X/phiVc_X
u_corte_Y := Vu_Y/phiVc_Y
u_max     := max(u_comp, u_trac, u_pm, u_biax, u_corte_X, u_corte_Y, u_anclaje)
```

Los dos cortes entran al máximo por separado; nunca se suman.

**Lo leído.** `US/ACI318-25-SI § 22.5.1.10 · pdf 443 = impresa 442`:

> «The interaction of shear forces acting along orthogonal axes shall be permitted to be
> **neglected** if (a) or (b) is satisfied: (a) V_u,x/(φV_n,x) ≤ 0.5; (b) V_u,y/(φV_n,y) ≤ 0.5»

y `§ 22.5.1.11 · pdf 444 = impresa 443`:

> «If V_u,x/(φV_n,x) > 0.5 **and** V_u,y/(φV_n,y) > 0.5 then Eq. (22.5.1.11) shall be
> satisfied: **V_u,x/(φV_n,x) + V_u,y/(φV_n,y) ≤ 1.5**»

`R22.5.1.10` es explícito sobre la dirección del error:

> «Tests and analytical results have indicated that for columns subjected to biaxial shear
> loading, the shear strength follows an elliptical interaction diagram… Considering shear
> along each centroidal axis independently can be **unconservative**.»

**Por qué importa.** Con `u_corte_X = u_corte_Y = 0,9` la hoja da `u_max = 0,9` y **CUMPLE**;
la norma exige `0,9 + 0,9 = 1,8 ≤ 1,5` y da **NO CUMPLE**. El pedestal es explícitamente
biaxial —tiene `Vu_X` y `Vu_Y` de entrada y hace la flexión biaxial— así que el caso no es
rebuscado: es el que la hoja está para resolver. El techo real de la suma es 1,5, no 2,0.

**Corrección propuesta.**

```
u_corte_biax := (u_corte_X > 0.5 and u_corte_Y > 0.5) ? (u_corte_X + u_corte_Y)/1.5 : 0
```

y meterlo en `u_max` y en `gobierna`. **Cambia números**: exige la comparación con el
centinela contra `git show HEAD:…`.

### A4 — La separación de estribos ignora la Tabla 10.7.6.5.2 · **estado límite ausente**

**Lo que hace la hoja.** `sep_est_max := min(16*db_long, 48*db_est, min(PED_X, PED_Y))`, que es
el detallado de estribos del §25.7.2.1(b).

**Lo leído.** `US/ACI318-25-SI § 10.7.6.1.1 · pdf 176 = impresa 175`:

> «Transverse reinforcement shall satisfy **the most restrictive** requirements for
> reinforcement spacing.»

y `§ 10.7.6.5.2 · pdf 178 = impresa 177`, Tabla 10.7.6.5.2, columna «Nonprestressed column»:

| V_s | Máximo s |
|---|---|
| ≤ 0,33√f'c·b_w·d | el menor de **d/2** y 600 mm |
| > 0,33√f'c·b_w·d | el menor de **d/4** y 300 mm |

**Por qué importa.** Cuando el pedestal necesita armadura de corte —y la hoja lo comprueba con
`v_Av`—, los estribos son armadura de corte y les aplica también este límite, que suele
**morder primero**. Con `db_long = 32 mm`, `16·d_b = 512 mm`; con `PED_X = 900 mm`,
`d ≈ 0,8·h = 720 mm` y `d/2 = 360 mm`. La hoja admitiría 512 mm donde la norma tolera 360.

**Corrección propuesta.** Añadir al mínimo las dos ramas de la tabla, condicionadas a que haga
falta armadura de corte (§10.6.2.1: `V_u > 0,5·φ·V_c`). **Cambia números.**

### A5 — Falta el confinamiento de los pernos de anclaje del §10.7.6.1.5 · **estado límite ausente**

**Lo leído.** `US/ACI318-25-SI § 10.7.6.1.5 · pdf 177 = impresa 176`, texto completo:

> «If **anchor bolts are placed in the top of a column or pedestal**, the bolts shall be
> enclosed by transverse reinforcement that also surrounds at least **four longitudinal bars**
> within the column or pedestal. The transverse reinforcement shall be distributed **within
> 125 mm of the top** of the column or pedestal and shall consist of at least **two No. 13 or
> three No. 10 ties or hoops**.»

**Por qué importa.** Es exactamente el elemento que la hoja calcula: un pedestal que recibe
`T_grupo` de una placa base y lleva los pernos en su cabeza. Es una exigencia prescriptiva, no
una recomendación, y no aparece en ninguna de las ocho secciones de la hoja. `R10.7.6.1.5` da
la razón: el confinamiento mejora la transferencia allí donde el hormigón se fisura junto a los
pernos.

**Corrección propuesta.** Una comprobación de detallado en la sección 6, con su veredicto
(`v_confina_pernos`), sobre dos entradas nuevas —número y diámetro de estribos de cabeza— o,
mejor, derivándolo: el número exigido sale del diámetro adoptado (`db_est ≥ 13 mm` → 2;
`db_est ≥ 10 mm` → 3) y la zona son los 125 mm superiores. No cambia ningún uso; añade un
veredicto que vota.

### Citas que la lectura confirma

| Artículo | Dónde | Confirmado en |
|---|---|---|
| §10.1.1 y §10.5: el Cap. 10 alcanza a los pedestales; P_n y M_n por §22.4, V_n por §22.5 | r001 | pdf 172 = impresa 171 |
| §10.6.1.1: A_st entre 0,01·A_g y 0,08·A_g | sección 2 | pdf 172 = impresa 171 |
| §10.6.2.2: A_v,min = mayor de 0,062√f'c·b_w·s/f_yt y 0,35·b_w·s/f_yt | r086 | pdf 173 = impresa 172 |
| §10.7.6.1.2 → §25.7.2 para estribos | r086 | pdf 176 = impresa 175 |
| §22.4.2.1 y Tabla 22.4.2.1: con estribos, P_n,max = **0,80·P_o** | r058 | pdf 441 = impresa 440 |
| §22.4.2.2: P_o = 0,85f'c(A_g − A_st) + f_y·A_st | r058 | pdf 442 = impresa 441 |
| §22.4.3.1: P_nt,max = f_y·A_st | sección 3 | pdf 442 = impresa 441 |
| Tabla 21.2.2 y §21.2.2.1: φ = 0,65 controlada por compresión, 0,90 por tracción; ε_ty = 0,002 para Grado 420 | r058 | pdf 433-434 = impresas 432-433 |
| Tabla 22.5.5.1 ecuación (a) y sus dos notas (N_u negativo en tracción; V_c ≥ 0) | r074, `v_vc_positivo` | pdf 445 = impresa 444 |
| §22.5.5.1.1 (techo 0,42λ√f'c) y §22.5.5.1.2 (N_u/6A_g ≤ 0,05f'c) | r074, `v_vc_techo` | pdf 446 = impresa 445 |
| §22.5.2.1(a): d = 0,8h en columnas rectangulares | sección 5 | pdf 443 = impresa 442 |
| §17.5.2.1 y Tabla 21.2.1 (k): φ = 0,90 para la armadura de anclaje | sección 7 | pdf 264 y 431 = impresas 263 y 430 |
| §18.13.2.1 (SDC D, E o F), §18.13.2.2 (desarrollar f_y en la interfaz) y §18.13.2.3 (ganchos a 90° hacia el eje) | sección 8, `sdc_def` | pdf 383 = impresa 382 |

**Dos matices sobre `meta.normas`.** Declara la norma a nivel de **capítulo** («Cap. 10, 17, 18,
21, 22, 25») cuando el contrato admite `articulos`, que es lo que hacen las otras seis hojas. Y
el encabezado de la sección 3 cita la «Tabla 21.2.2» pero el cuerpo usa 0,65 / 0,90 sin volver a
nombrarla: se lee como si los φ estuvieran afirmados.

---

## 6. `silla-anclaje-generica`

Es la hoja que menos cita —una sola norma, `US/AISC360-22`— y la que más apoya sus veredictos
en un único artículo. La lectura de ese artículo la confirma, y de paso destapa lo que falta.

### El §J10.8, leído entero

`US/AISC360-22 § J10.8 · pdf 223 = impresa 16.1-155`, «Additional Stiffener Requirements for
Concentrated Forces». Las tres condiciones geométricas que la hoja verifica están **textuales**:

> «(a) The width of each stiffener plus one-half the thickness of the column web shall not be
> less than one-third of the flange or moment connection plate width delivering the
> concentrated force.
> (b) The thickness of a stiffener shall not be less than one-half the thickness of the flange
> or moment connection plate delivering the concentrated load nor less than the width divided
> by 16.
> (c) Transverse stiffeners shall extend a minimum of one-half the depth of the member **except
> as required in Sections J10.3, J10.5, and J10.7**.»

`v_rig1`, `v_rig2a`, `v_rig2b`, `v_rig3` y `v_rig_largo` reproducen (a), (b) y (c) sin desviarse.
**Correctas las cinco.** El único matiz: la hoja no recoge la excepción final de la (c).

Y la frontera declarada —«el §J10.8 remite al §J4.1 en tracción y al §J4.4 en compresión»— es
**correcta**: el artículo lo dice en sus dos primeros párrafos.

### C9 — El §J10.8 prescribe algo más que las tres condiciones · **estado límite ausente**

**Lo leído**, mismo artículo, párrafo tercero:

> «**Transverse full depth bearing stiffeners** for compressive forces applied to a beam
> flange(s) shall be designed as axially compressed members (columns) in accordance with the
> requirements of **Section E6.2 and Section J4.4**. The member properties shall be determined
> using an **effective length of 0.75h** and a cross section composed of **two stiffeners and a
> strip of the web having a width of 25t_w at interior stiffeners and 12t_w at the ends of
> members**.»

La hoja declara como frontera que no verifica el rigidizador **a resistencia**. Eso es honesto,
pero incompleto en un punto que importa: el artículo no deja la resistencia en el aire, **da la
sección y la longitud efectiva con las que calcularla**, y las dos son derivables de datos que
la hoja ya tiene (`RIG_T`, `rig_ancho`, `t_w` del alma, la altura del miembro).

**Corrección propuesta.** Dos caminos, y prefiero el primero:

1. **Calcularlo.** `L_e = 0,75h`, sección de dos rigidizadores más `25·t_w` (o `12·t_w` en el
   extremo), y de ahí `P_n` por el §E6.2 / §J4.4 con `φ = 0,90`. Es un estado límite nuevo que
   **vota**; cambia `u_max` y `gobierna`.
2. **Declararlo mejor.** Dejar la frontera, pero escribiendo qué prescribe el artículo
   (`0,75h`, `25t_w`/`12t_w`) para que quien instancie la hoja sepa qué le toca calcular
   aparte. No cambia números.

### Citas que la lectura confirma

| Artículo | Dónde | Confirmado en |
|---|---|---|
| §J4.5: la flexión de un elemento de conexión es el **menor** de fluencia, pandeo local, PLT y rotura | encabezado 1, `t_chapa_req` | pdf 214 = impresa 146 |
| §J4.2(a): fluencia en corte 0,60·F_y·A_gv con φ = 1,00 | r049, `tau_adm` | pdf 213 = impresa 145 |
| §J2.4 y Tabla J2.5: F_nw = 0,60·F_EXX con φ = 0,75 | r055, `sigma_adm` | pdf 198 y 200 = impresas 130 y 132 |
| §J4.1 (tracción) y §J4.4 (compresión), a los que el §J10.8 remite | fronteras, r085 | pdf 213-214 = impresas 145-146 |

**Una decisión que resulta correcta.** La hoja **no** aplica el incremento direccional `k_ds`
del §J2.4 al cordón en L, y hace bien: el §J2.4(1) lo condiciona a que se considere la
compatibilidad de deformaciones, y la *User Note* la limita a un «**linear weld group**… one in
which all elements are in a line or are parallel». Un cordón en L no lo es. El método vectorial
elástico que usa la hoja es la vía correcta, y omitir `k_ds` es conservador y consistente.
(La `llave-corte-generica` **sí** lo aplica, con `θ = 90°`, y ahí sí corresponde: son dos
cordones **paralelos** cargados por su centro de gravedad.)

**Lo que falta en `meta.normas`.** El cuerpo cita **§J4.4** (r002 y r085) y `meta.normas` lista
§J2, §J4.1, §J4.2, §J4.5 y §J10.8, sin el §J4.4.

---

## 7. `viga-carrilera-generica`

### A3 — La compacidad del alma usa el límite de una sección doblemente simétrica · **artículo fuera de alcance**

**Lo que hace la hoja.**

```
h_c     := 2*(d - t_f - y_NA)
lam_w   := h_c/t_w
lam_rw  := 5.70*sqrt(E/Fy)
lam_pw  := 3.76*sqrt(E/Fy)
v_alma_compacta := lam_w <= lam_pw
```

y `r016` lo dice explícitamente: «el límite de compacidad es λ_pw = 3,76·√(E/Fy)».

**Lo leído.** `US/AISC360-22 § Tabla B4.1b · pdf 91 = impresa 16.1-23`, elementos atiesados:

| Caso | Descripción | Razón | λ_p | λ_r |
|---|---|---|---|---|
| **15** | Webs of **doubly symmetric** I-shaped sections and channels | h/t_w | **3,76·√(E/F_y)** | 5,70·√(E/F_y) |
| **16** | Webs of **singly symmetric** I-shaped sections | h_c/t_w | **[(h_c/h_p)·√(E/F_y)] / (0,54·M_p/M_y − 0,09)²** ≤ λ_r | 5,70·√(E/F_y) |

con la nota [c]: `M_y` es el momento de fluencia de la fibra extrema, `M_p = F_y·Z_x`, y `h_p`
es el doble de la distancia del centroide al **eje neutro plástico**.

**Por qué importa.** La hoja es explícitamente **monosimétrica** —es la corrección de la
segunda pasada, y su `resumen` lo dice en el título—, así que le toca el **caso 16**. Que use
`h_c/t_w` como razón confirma que ya está en el caso 16 a medias: esa razón es la del caso 16,
no la del 15, que va con `h/t_w`.

El valor 3,76 **no es** un límite conservador del caso 16. Es lo que da el caso 16 al
particularizarlo a una sección doblemente simétrica (`h_c/h_p = 1` y `M_p/M_y ≈ 1,12` dan
`1/(0,54·1,12 − 0,09)² = 3,77`), y al apartarse de la doble simetría puede subir **o bajar**:
`h_c/h_p > 1` lo sube, y un `M_p/M_y` mayor —que es lo que produce un `S_xt < S_xc`— lo baja.
Así que `v_alma_compacta` puede dar **✓ donde el caso 16 da ✗**, y ese veredicto es el que
materializa la exigencia del §5.8.2 de AIST TR-13.

`v_alma_no_esbelta`, en cambio, **está bien**: `λ_r = 5,70·√(E/F_y)` es el mismo en los dos
casos, así que la decisión «§F4 o §F5» no se ve afectada.

**Corrección propuesta.** Derivar el eje neutro plástico. La hoja ya tiene las tres chapas
(`b_f`·`t_f`, `t_w`·`h_alma`, `b_fb`·`t_fb`) y el canal, así que `h_p`, `Z_x` y `M_p` salen sin
declarar nada — que es la regla 3 del README («nada se declara que se pueda derivar»). Con
`M_p` calculado se arregla de paso la otra simplificación: `R_pc` y `R_pt` dejan de ser 1,0 y
pasan a [F4-9a/b] y [F4-16a/b], que es la frontera que la hoja declara hoy. **Cambia números**,
y en dirección favorable (`R_pc ≥ 1`), así que la comparación contra git es imprescindible.

### A6 — La longitud de apoyo bajo la rueda deja fuera el espesor del ala · **prescripción no aplicada**

**Lo que hace la hoja.** `l_b := 2*H_riel`, con la ayuda de `H_riel` diciendo «La longitud de
apoyo de la rueda se toma como dos veces esta altura» y `r010` llamándolo «criterio corriente
que conviene declarar».

**Lo leído.** `US/AIST-TR13-2021 § 5.8.4 · pdf 33 = impresa 24`:

> «**Local Wheel Support.** For local design checks on the webs of crane girders, under crane
> wheel loads, the effective length of web beneath the wheel load **shall be equal to two times
> the combined depth of the crane rail and girder flange thickness**. This same effective
> length can be used to determine weld forces at the junction of the web and top flange of the
> crane girder.»

**Por qué importa.** No es un criterio corriente: es una prescripción («shall be») del mismo
documento en el que la hoja apoya `v_alma_compacta` y la prohibición del campo diagonal. Con el
ejemplo de referencia (`H_riel = 60 mm`, `t_f = 25 mm`) la hoja usa 120 mm y TR-13 pide 170: la
hoja se queda un **29 % corta**, lo que la hace conservadora en los dos estados límite que
dependen de `l_b` (§J10.2 y §J10.3) pero inconsistente con la norma que cita.

**Corrección propuesta.** `l_b := 2*(H_riel + t_f)`, y la ayuda pasa de «criterio corriente» a
la cita del §5.8.4. **Cambia números** (sube `R_n` en fluencia local y en aplastamiento).

### B5 — El «§G3» del campo diagonal es la numeración de AISC 360-16 · **errata de cita**

`r004` dice: «El §5.8.3 de AIST TR-13 **PROHÍBE la acción de campo diagonal del §G3** en vigas
carrileras.»

**Lo leído.** `US/AIST-TR13-2021 § 5.8.3 · pdf 33 = impresa 24`, último párrafo:

> «The design of crane girder webs for shear shall follow Chapter G of Ref. 1. The use of
> tension field action per **Section G3** of Ref. 1 is not permitted for crane girders.»

La hoja **cita bien a TR-13**. El problema es que TR-13 (2021) se escribió contra AISC 360-**16**,
y la hoja declara `US/AISC360-22`. En la edición 2022 (`pdf 143 = impresa 16.1-75`) la
organización del Capítulo G es:

> «G1. General Provisions · G2. I-Shaped Members and Channels · **G3. Single Angles and Tees** ·
> G4. Rectangular HSS… · G5. Round HSS · G6. Minor-Axis Shear · G7. Beams and Girders with Web
> Openings»

y la acción de campo diagonal es el **§G2.2** («Shear Strength of Interior Web Panels with
a/h ≤ 3 Considering Tension Field Action», `pdf 145 = impresa 77`) y el §G2.3. Quien abra la
edición 22 en el §G3 encuentra ángulos y tees.

**Corrección propuesta.** «El §5.8.3 de AIST TR-13 prohíbe la acción de campo diagonal en vigas
carrileras (su texto la cita como §G3, que es la numeración de AISC 360-16; en la edición 22 es
el §G2.2 y el §G2.3).» No cambia números.

### C6 — AIST TR-13 no está en `meta.normas` · **`meta` incompleto**

`meta.normas` declara una sola clave, `US/AISC360-22`. La hoja apoya en **AIST TR-13**:

- `v_alma_compacta`, cuyo `avisoTexto` dice «el §5.8.2 de AIST TR-13 lo exige en una viga
  carrilera, aunque al §F4 le baste con que no sea esbelta» — es decir, un veredicto que **vota**
  y cuya fuente no está declarada;
- la prohibición del campo diagonal (§5.8.3, r004);
- la hipótesis de que el ala superior más el canal toman íntegramente la fuerza lateral (r002);
- la frontera del riel y sus grampas (r002).

`US/AIST-TR13-2021` está **calibrada** en `_norma\_catalogo.json` (offset 9, capa de texto
utilizable), así que es citable sin más trámite.

**Corrección propuesta.** Añadir a `meta.normas`:

```json
{ "clave": "US/AIST-TR13-2021", "rol": "criterios de vía de grúa",
  "articulos": ["§5.8.2", "§5.8.3", "§5.8.4"] }
```

No cambia números. Nota para después: el lint E3 del harness distingue `norma` de `referencia`;
`US/AIST-TR13-2021` está declarada como `norma`, así que puede cubrir rol.

### C7 — Tres estados límite de la lista del §5.8.2 sin cubrir ni declarar

El §5.8.2 (`pdf 31 = impresa 22`) enumera los estados límite pertinentes a una carrilera. La
hoja cubre casi todos; quedan fuera, y **sin aparecer en `meta.fronteras`**:

| De la lista de TR-13 | Estado en la hoja |
|---|---|
| «Design for Axial Forces» y la interacción que las incluye | la hoja hace §H1 con **axial nulo** (`r022`) y no declara la hipótesis |
| «Design for Concentrated Load Effects **at Supports** (web yielding and web crippling)» | la hoja aplica §J10.2/§J10.3 **bajo la rueda**, que es el caso móvil, no en el apoyo |
| Rigidizadores de apoyo: el §5.8.3 abre con «**Bearing stiffeners shall be used where required to transmit end reactions**» | no se menciona |

**Corrección propuesta.** Tres renglones en `meta.fronteras` y una frase en `r002`. No cambia
números; es lo que separa «no lo calculo» de «no me acordé».

### Citas que la lectura confirma

| Artículo | Dónde | Confirmado en |
|---|---|---|
| §F4, alcance: «singly symmetric I-shaped members with webs attached to the mid-width of the flanges… with compact or noncompact webs», y sus **cuatro** estados límite | r001, r019 | pdf 124 = impresa 56 |
| [F4-1] M_n = R_pc·M_yc · [F4-4] M_yc = F_y·S_xc | r020 | pdf 124 = impresa 56 |
| [F4-6a/b] F_L · [F4-7] L_p = 1,1·r_t√(E/F_y) · [F4-8] L_r | r020, `Mn_ltb` | pdf 125 = impresa 57 |
| **§F4(7)(ii)**: con canal-tapa, r_t es el radio de giro de «the flange components in flexural compression plus one-third of the web area in compression» | r020 | pdf 126 = impresa 58 |
| §F4.3(a): con ala compacta el pandeo local no aplica | `ala_compacta`, frontera | pdf 127 = impresa 59 |
| §F4.4(b): con S_xt < S_xc, M_n = R_pt·M_yt [F4-15] | r020, sección 4 | pdf 127 = impresa 59 |
| §F5: alma esbelta, declarado fuera de alcance | `v_alma_no_esbelta` | pdf 128 = impresa 60 |
| §G1(a): φ_v = 0,90 «for all provisions in this chapter except Section G2.1(a)» | r004, `phi_v` | pdf 143 = impresa 75 |
| §G2.1(a): φ_v = 1,00 y C_v1 = 1,0 **solo** para almas de perfiles **laminados** con h/t_w ≤ 2,24√(E/F_y) | r024, `v_Cv1b` | pdf 144 = impresa 76 |
| §G2.1(b): [G2-3] y [G2-4]; h = distancia libre entre alas en secciones armadas soldadas | r024 | pdf 144 = impresa 76 |
| §G2.1(b)(2)(i): k_v = 5,34 sin rigidizadores transversales | `k_v`.ayuda | pdf 144 = impresa 76 |
| [H1-1b]: con P_r = 0 la interacción se reduce a la suma de los dos cocientes de flexión | r022 | pdf 150 = impresa 82 |
| §J10.2: φ = 1,00; [J10-2] con 5k lejos del extremo y [J10-3] con 2,5k a d o menos | r026 | pdf 219 = impresa 151 |
| §J10.3: φ = 0,75; [J10-4] coeficiente 0,80 y [J10-5a] 0,40 cerca del extremo, válida con l_b/d ≤ 0,2; Q_f = 1,0 en doble T | r026, `v_aa2`, `v_lb_d` | pdf 219-220 = impresas 151-152 |
| §J10.4: φ = 0,85; umbral 2,3 con el ala restringida al giro y 1,7 sin restricción | r028, `restr_rot` | pdf 220 = impresa 152 |
| §J10.4: C_r = 6,6·10⁶ MPa si α_s·M_r < M_y y 3,3·10⁶ si ≥; α_s = 1,0 en LRFD | r028 | pdf 221 = impresa 153 |
| Apéndice 3 §3.2: análisis **elástico**, sin factores de concentración | r032 | pdf 273 = impresa 205 |
| [A-3-1M] F_SR = 6900·(C_f/n_SR)^0,333 ≥ F_TH, y F_TH es «the maximum stress range for **indefinite design life**» | r032, `v_vida_infinita` | pdf 273 = impresa 205 |
| **AIST TR-13 §5.8.2**: «the top flange and web of the crane runway girder **shall be compact**» | `v_alma_compacta` | pdf 31 = impresa 22 |

**Una condición de aplicabilidad que conviene mirar.** El §J10.4 empieza acotándose: «This
section applies **only** to compressive single-concentrated forces applied to members where
relative lateral movement between the loaded compression flange and the tension flange **is not
restrained** at the point of application.» La hoja resuelve la aplicabilidad con el criterio
geométrico (2,3 / 1,7), que es el segundo filtro; el primero —que no haya restricción del
movimiento lateral relativo entre alas— no se comprueba ni se declara. En una vía con
arriostramiento de respaldo (§5.8.2.1 de TR-13) el §J10.4 sencillamente no aplica.

---

## Apéndice — cobertura de la lectura

| Norma | Páginas impresas leídas | Artículos auditados |
|---|---:|---|
| `US/ACI318-25-SI` | 75 | Cap. 7, 8, 10, 13, **17 entero**, 18.13, 20.5, 21.2, 22.2 a 22.6, 25 |
| `US/AISC360-22` | 26 | Tabla B4.1b, F4, F5, G1–G2.2, H1, J2.4 + Tabla J2.5, J3.4–J3.6, J4, J7, J8, J9, J10.2–J10.8, Apéndice 3 |
| `US/AISC-DG1-3ed` | 10 | 4.3.3 a 4.3.7 y el Ejemplo 4.7-5 |
| `US/AIST-TR13-2021` | 2 | 5.8.2, 5.8.3, 5.8.4 |

Las **102 lecturas** están registradas en el acta del harness
(`_norma\<NORMA>\leidas.json`), cada una con la hoja y la afirmación que se estaba auditando.
Commit `[harness] el acta registra las 102 lecturas de la auditoria de la biblioteca`.

**Lo que no se releyó del PDF** y se da por bueno con la transcripción previa del acta, por ser
constantes de una línea que ninguna hoja usa de forma dudosa: `ACI §19.2.4.3` (λ = 1 en hormigón
de peso normal), `ACI §20.2.2` (E_s = 200.000 MPa), `ACI §25.2.1` (separación libre mínima),
`ACI §25.7.2.1/.2` (detalle de estribos), `AISC §F1` (φ_b = 0,90 y C_b) y las dos filas de la
`Tabla A-3.1` del Apéndice 3 que la hoja de la carrilera ofrece como constantes de entrada.
Queda anotado para cerrarlo en la pasada de correcciones.
