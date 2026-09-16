# Biblioteca de planillas genéricas

Cálculos paramétricos reutilizables, con forma y prosa **genéricas**: sin datos de
proyecto fuera del bloque `DATOS`, con la norma citada por artículo en el texto y por
clave del catálogo del harness en `meta.normas`. **Una genérica no respalda ninguna
memoria:** se instancia en un proyecto, ahí se cambian las entradas y ahí se agregan
los contrastes `c_*` contra los números que ese proyecto publica.

Es la copia canónica. La que había en `_plantillas/planillas/` de Struct_Harness se
retiró (los generadores `gen_*.py` y `hoja.py` quedaron en el historial de ese repo);
desde aquí se instancia con `python -m harness.planilla` y se verifica con
`npm run verify:biblioteca`.

## Las tres clases, y por qué no se mezclan

| | `generica` | `instancia` | `ejemplo` |
|---|---|---|---|
| Vive en | `public/biblioteca/<disciplina>/` | `<proyecto>/20_calculo/planillas/` del harness | `public/planillas/` |
| Contrastes `c_*` | **cero, por diseño** | uno por número publicado | contra el post que la documenta |
| `esperadoFalso` | ninguno: el ejemplo de referencia cierra en verde | los hallazgos y las tesis del proyecto | los del ejemplo |
| Datos cargados | un ejemplo que **cierra en verde** | los del proyecto | los del post |
| Entradas | declaradas en `meta.entradas`, regiones `in_<nombre>` | las mismas, reescritas | no hace falta |
| `meta.origen` | — | el `slug` y el `sha256` de la genérica de la que sale | — |

**Instanciar no es duplicar.** Lo que la anti-lista del harness prohíbe es tener dos
*fuentes* de la misma plantilla; por eso la genérica vive solo aquí. El contrato
completo del `meta` está en `docs/ESQUEMA-PLANILLA.md` §10.

## Inventario

Migradas el 2026-09-11 desde el harness. Las siete pasan `verify:biblioteca` con su
ejemplo de referencia y un caso que falla a propósito. **Norma americana en SI** —AISC,
ACI y ASCE— con una excepción declarada: el detallado sísmico del pedestal es de
**NCh2369:2025 §9.5**, porque ninguna norma americana cubre el pedestal bajo placa base
como zona singular y ACI §18.7 es el de otra cosa (una columna de pórtico especial de
hormigón). El resto de las citas argentinas y chilenas se reemplazó el 2026-09-15 por el
artículo americano equivalente, leído antes de citarlo.

**Auditadas el 2026-09-15 y corregidas el 16.** Se releyó del PDF cada artículo que citan
—102 páginas— y se juzgaron los siete esquemas sobre los PNG rendidos. Los dos informes,
con el estado de aplicación de cada hallazgo, están en `docs/auditoria-normativa-biblioteca.md`
y `docs/auditoria-esquemas-biblioteca.md`. Lo que cambió números: el descascaramiento de
grupo del anclaje, la interacción de corte biaxial y el confinamiento de la cabeza del
pedestal, la compacidad del alma de la carrilera por el caso 16 y su `l_b` del §5.8.4, y la
rotura en corte del §J4.2 en la llave y la silla.

### `acero/`

| Plantilla | Qué verifica | Norma | Entradas |
|---|---|---|---:|
| `placa-base-generica` | Aplastamiento, equilibrio, grupo de pernos y espesor de chapa. Cubre placa **lisa** y **rigidizada** con la misma hoja (`hay_nervios`). Con llave de corte suma a la tracción el **par de la llave** (`hay_llave`) | AISC DG1 3.ª §4.3.7 · AISC 360 §J8, §J4.5 · ACI 318-25 §17.6.1, §17.5.3, §17.11.1.1.9 | 31 |
| `llave-corte-generica` | Los **siete** estados límite de la llave. Una chapa por dirección o dos paralelas desplazadas. Con `usa_arm_sl` la **armadura de anclaje del §17.5.2.1.2 sustituye al breakout** en el veredicto, como hace el anclaje en tracción, y entrega su `As_req` al pedestal, que comprueba que la zona de protección lo contiene | AISC DG1 3.ª Ej. 4.7-5 · ACI 318-25 §17.11, §17.5.2.1.2, Tabla 21.2.1 · AISC 360 §J2, §J4.2, §J4.5 | 32 |
| `silla-anclaje-generica` | El **camino de carga** completo: perno → chapa superior → nervios → ala (o ala extendida) → alma | AISC 360-22 §J10.8 (las tres condiciones geométricas del rigidizador, incluido t ≥ b/16) · §J2, §J4.1, §J4.2, §J4.4, §J4.5 | 32 |
| `viga-carrilera-generica` | Flexión biaxial, corte, fuerzas concentradas del rodado —incluido el pandeo lateral del alma—, deflexiones y fatiga. Cubre la doble T **monosimétrica** de las dos formas en que se construye: con canal-tapa (`hay_canal`) y **armada con el ala superior más ancha** (`es_soldada`) | AISC 360-22 Tabla B4.1b, §F4, §G2, §H1, §J10, Ap. 3 · AIST TR-13 §5.8.2 a §5.8.4 | 44 |

### `hormigon/`

| Plantilla | Qué verifica | Norma | Entradas |
|---|---|---|---:|
| `anclaje-hormigon-generica` | Grupo de pernos colados en tracción: acero, cono, extracción, descascaramiento y armadura de anclaje **por capacidad del perno**. Con sismo, la opción (d) del §17.10.5.3 y el **0,75** del §17.10.5.4 sobre los modos del hormigón (`sismo`) | ACI 318-25 SI §17.5, §17.6, §17.9, §17.10, Tabla 21.2.1 | 28 |
| `pedestal-generico` | Cuantías del §10.6.1.1 y del §18.7.4.1, el **diagrama de interacción P–M calculado** por compatibilidad de deformaciones en los dos ejes y los dos sentidos, seis combinaciones `(P, M_X, M_Y)` leídas sobre él, **flexión biaxial** por contorno lineal, corte con `V_c` **y `V_s`**, estribos, armadura de anclaje contable, el **detallado sísmico** por NCh2369 §9.5 y por ACI §18.7 —activables por separado— y el **área resistente de la zona de protección** contra la armadura de anclaje que exige la llave (§17.5.2.1.2) | ACI 318-25 SI §10.6, §10.7.6, §17.5.2.1, §17.5.2.1.2, §18.7, §18.13.2, §21.2.2, §22.2, §22.4, §22.5, §25.3.4, §25.7.2 · NCh2369:2025 §9.5, C9.5.2 | 55 |
| `zapata-generica` | Flexión, corte en una dirección y punzonamiento, con reparto en banda, más la armadura superior por levantamiento del §18.13.2.5 verificada a flexión | ACI 318-25 SI Cap. 7, 8, 13, 18, 21, 22, 25 | 23 |

### `acciones/`

Para una hoja de acciones el contrato exige solo `v_global`: no hay estado límite que
gobierne ni factor de uso, porque entrega cargas en vez de verificar una sección. Sus
`v_*` son de **validez** —que el dato caiga dentro de la tabla, que la corrección esté en
su rango—, no de resistencia.

| Plantilla | Qué entrega | Norma | Entradas |
|---|---|---|---:|
| `espectro-nch2369-generica` | El espectro de una dirección de análisis: ordenada de diseño en T\*, ordenada de referencia de §6.1, factor de escala del caso espectral y banda de corte basal. Cubre la dirección **horizontal y la vertical** con la misma hoja (`es_vert`), y deriva los parámetros de sitio de la zona, el suelo y la categoría | NCh2369:2025 §4.3.2, §5.4.1, §5.4.2, §5.12, §5.13, §6.1 · Tablas 3, 6 y 7 | 8 |

Siguen pendientes **viento** y **nieve por ASCE 7**, que se destilan de las hojas del
taller de neumáticos cuando se instancien por segunda vez.

> 🔴 **La que entra al espectro es `A_r`, no `A_0`.** El encabezado de la tercera columna
> de la Tabla 3 es literalmente «A_r = 1,4 A_0», y las Ec. (3), (12) y (13) usan la de
> referencia. Meter `A_0` deja la demanda **1,4 veces menor**, perfectamente plausible y
> sin ninguna excepción que lo delate. La hoja lo comprueba sobre la fila que extrae
> (`v_Ar_14A0`), que es lo único que convierte ese riesgo en un veredicto.

> 🔴 **La reducción por `R*` se evalúa una sola vez, en `T*`, y escala la curva entera.**
> No es una reducción rama a rama del espectro: por eso la curva de diseño es la de
> referencia dividida por un número, y por eso la función que se carga en el modelo lleva
> el espectro de **referencia puro** mientras `R*` viaja en el factor de escala del caso.
> Con `R*` horneado en la curva, moverlo obliga a regenerar la función entera — y entonces
> no se mueve, y el modelo sigue con el `R*` de una estructura que ya cambió.

> 🟠 **Una estructura rígida es castigada, y eso no es un incumplimiento.** Bajo el codo
> `C_r·T_1` la Ec. (1b) degrada `R*` hacia 1,5, porque no alcanza a desarrollar la
> ductilidad que `R` supone. `v_T_est_sobre_codo` lo marca como **aviso** y no vota en
> `v_global`: dice en qué rama quedó la dirección, no que falle nada.

## La familia BASE DE COLUMNA

Cinco de las seis cubren la base completa, del acero al suelo. **Encadenan por dato
declarado, no por importación:** lo que una entrega, la siguiente lo recibe en su bloque
`DATOS` con su procedencia escrita. `meta.entrega` lo deja legible por máquina.

```
silla-anclaje-generica ──┐
                         ├─→ placa-base-generica ─→ pedestal-generico ─→ zapata-generica
llave-corte-generica  ───┘        (acero)               (hormigón)        (hormigón + suelo)
```

| Entrega | Quién lo produce | Quién lo consume |
|---|---|---|
| `T_grupo` | `placa-base-generica` | `silla-anclaje-generica` · `anclaje-hormigon-generica` (como `Nua_g`) · `pedestal-generico` |
| `As_req` | `anclaje-hormigon-generica` | `pedestal-generico` (como `As_req_anc`) |
| `N_sa` y `n_trac` | `anclaje-hormigon-generica` | `llave-corte-generica` (ψ_brg,sl en tracción, §17.11.2.2.1a) |
| `exc` | `llave-corte-generica` (mortero + mitad de la altura efectiva de la llave) | `placa-base-generica` (como `z_llave`, brazo del par del §17.11.1.1.9) |
| `As_reqx` y `As_reqy` | `llave-corte-generica` (§17.5.2.1.2, cuando acredita armadura en vez del breakout) | `pedestal-generico` (como `As_req_llave_X` y `As_req_llave_Y`) |
| `Yb_comp` | `placa-base-generica` | `llave-corte-generica` (como `Yb`; de ahí sale `ψ_brg`) · `silla-anclaje-generica` |
| `tbp_req` | `llave-corte-generica`, y el espesor que pide el aplastamiento en `placa-base-generica` | manda **el mayor de los dos** |
| Reacción de base | el modelo estructural | `zapata-generica` |

> 🔴 **El espesor de la placa lo suele fijar la llave, no el panel entre nervios.** Por la
> regla `t_bp ≥ t_sl` —una **regla práctica de los autores** de la DG1, entre las
> consideraciones que preceden al **Ejemplo 4.7-5**, no una prescripción del §4.3.3— y por la
> flexión local que induce su excentricidad. Dimensionar la placa sin haber mirado la llave
> es el error fácil de esta familia.

> 🔴 **El *breakout* de la llave no se arregla con más chapa.** Va con `c_a1^1,5`, o sea con
> el **ancho del pedestal**: es variable de la fundación, no de la placa. Las salidas son
> ensanchar el pedestal o acreditar armadura de anclaje por el §17.5.2.1.2 — y esas ramas
> compiten por el mismo espacio que la llave ocupa. Desde el 2026-09-16 la hoja acredita la
> segunda: con `usa_arm_sl = 1`, la armadura **reemplaza** al breakout en el veredicto y no se
> suma a él, que es lo que dice el «in lieu of» del §17.5.2.1. Es la práctica corriente en
> Chile, y el **C9.5.2 de NCh2369** la nombra: concentrar estribos en el sector superior del
> pedestal para prevenir el desprendimiento del sólido de falla en corte.

> 🔴 **Esas ramas son estribos del pedestal, y el pedestal tiene que responder por ellas.**
> Hasta el 2026-09-16 la llave acreditaba un área que la zona de protección del pedestal no
> comprobaba: ahí solo se verificaba la **separación** del §9.5.3, nunca el área resistente.
> Ahora `llave-corte-generica` entrega `As_reqx` y `As_reqy`, y la **sección 13** del pedestal
> cuenta los niveles de estribo que caben dentro del cono y comprueba que su área los cubre.
> Dos decisiones que sostienen esa sección:
>
> - **La zona que cuenta es `zp_b`, no `zp_ef`.** El §9.5.3 (b) —altura de la llave más la
>   proyección de un plano a 45° hasta la cara— **es** el sólido de falla en corte, y C9.5.3 lo
>   dice: «buscan contener de buena manera el sólido de desprendimiento lateral en corte». El
>   criterio (a), el lado menor, no tiene nada que ver con la llave, y contarlo regalaría área.
> - **Envolvente, no suma.** `A_v` ya está fuera del conflicto: el corte del pedestal se
>   acredita con la separación del **fuste**, no con la de la zona. Frente al confinamiento del
>   §18.7.5.4 no se suma, porque ese es detallado por ductilidad y no una demanda de equilibrio
>   bajo la combinación que produce el corte — el mismo criterio con el que `A_v` y `A_sh` ya
>   conviven sobre las mismas `n_ramas`.

## Fronteras e hipótesis

Lo que cada plantilla **no** calcula y tiene que entrar como dato con su origen, y lo que
asume sin chequear, está en `meta.fronteras` y `meta.hipotesis` de cada JSON — es lo
primero que pregunta un revisor externo, y por eso viaja con la hoja y no en un índice
aparte. Resumen:

| Plantilla | No calcula | Asume |
|---|---|---|
| `placa-base-generica` | **β** (entra medido o de tabla; la hoja lo acota entre 0,0479 y 0,125) · la silla · la llave | placa rectangular · una fila de pernos por lado · bloque rectangular |
| `llave-corte-generica` | el equilibrio de la placa · el **despiece** de la armadura de anclaje (la hoja comprueba el área, no dónde va cada rama ni su desarrollo) · la envolvente de dos chapas como bloque único | los estribos acreditados son cerrados, horizontales, caen dentro del cono y están desarrollados a ambos lados del plano de falla |
| `silla-anclaje-generica` | el reparto de tracción entre pernos (uniforme) · el ancho eficaz de la chapa · el rigidizador **a resistencia**, que el §J10.8 manda al §J4.1 en tracción y al §J4.4 en compresión | extensión de ala con la lectura conservadora |
| `viga-carrilera-generica` | las cargas de rueda (del fabricante) · la clasificación del **ala** —la del **alma** sí la calcula— · los límites de deflexión · el riel y su unión · de la lista del §5.8.2 de TR-13: fuerzas axiales, carga concentrada **en los apoyos** y rigidizadores de apoyo | dos ruedas iguales · canal continuo y colaborante · vano simple · el ala superior (más el canal) toma íntegramente la fuerza lateral |
| `anclaje-hormigon-generica` | la tracción del grupo · el corte (va a la llave) · las opciones (a), (b) y (c) del §17.10.5.3 | pernos colados con cabeza · una fila traccionada · armadura conformada (§17.10.4) |
| `pedestal-generico` | los esfuerzos (seis ternas concurrentes, ya mayoradas y amplificadas por 0,7·R₁ donde NCh2369 lo pide) · el `V_e` por capacidad del §18.7.6.1 · la capacidad esperada del anclaje del §9.5.2 · el `As_req` de la armadura de anclaje de la llave · el **despiece** de esa armadura: dónde va cada rama y su desarrollo a ambos lados del plano de falla · la esbeltez, que con altura sobre lado menor ≤ 3 no aplica | estribos cerrados · reparto perimetral uniforme · cada barra amarrada por esquina de estribo o traba (de ahí `h_x` y `n_l`) · el cierre de la envolvente hacia la tracción pura es una recta · biaxial por suma lineal (cota superior) · confinamiento y tirante de anclaje **no fluyen a la vez**: la zona de protección responde por la envolvente |
| `zapata-generica` | los esfuerzos mayorados · el momento negativo de la cara superior (`Mu_sup`) | apoyo interior · sin armadura de corte · `Nu = 0` · X es el lado corto (**sí** se chequea) · **renuncia al §13.2.6.2** e impone el §18.13.2.5 fuera de SDC D-F, las dos del lado seguro |

## El esqueleto de una genérica

Las siete tienen la misma forma desde el 2026-09-15, y una hoja nueva la copia. El
objetivo es que la memoria impresa quepa en un anexo: entre 4 y 9 páginas por hoja.
`pedestal-generico` se salió a 10 al pasar a calcular el diagrama P–M: el precio de
calcular lo que antes entraba como dato, y el techo se sube una vez, no cada vez. Está en
**11** desde que la sección 13 comprueba el área de la zona de protección; la próxima que
lo empuje tiene que compensar recortando, no sumando.

1. **Alcance**, uno o dos párrafos: qué verifica, hipótesis y fronteras en prosa corta.
   Lo demás vive en `meta`, que es de donde lo lee la ficha de `/diseno`.
2. **`━━ DATOS · <GRUPO> ━━`**: solo regiones `in_*`, con una nota por bloque como
   máximo. Lo que explica un dato concreto va en su `ayuda`, que la GUI muestra al lado
   del campo y el papel no imprime.
3. **`━━ N — ESTADO LÍMITE · <norma> §<art.> ━━`**, numerados de corrido: cada ecuación
   de norma con su valor, las adimensionalizaciones en línea, y cierre con `u_x`. Un
   `v_*` solo para lo que **no** es resistencia —geometría, detallado, validez—, porque
   un veredicto que repite `u_x ≤ 1` no agrega nada y ocupa una línea.
4. **`━━ RESUMEN ━━`**: `u_max`, `gobierna` y `v_global`, que suma la resistencia y los
   veredictos que no son aviso. Nada suelto después.
5. **`━━ ESQUEMA · MAPEO A PÍXELES ━━`**, todo con `imprimir: false`: la escala, las
   funciones de coordenadas y los colores `col_*` alimentan la figura y no salen en el
   papel. La región `image` va la última y **sí** se imprime.

Reglas de redacción: español neutro con tildes, cero `pdf N` / `rasterizada` / `impresa
NN` —la evidencia de lectura vive en el harness, en la hoja va el artículo—, cero
`pageBreak` y cita en un solo formato (`ACI 318-25 §17.6.2` en el encabezado,
`[17.6.2.1b]` en la ecuación).

## Lo que queda por afinar en el `meta`

Las **etiquetas** y las `ayuda` de las entradas están escritas en las siete. El
`aviso: true` de los veredictos marca los chequeos de validez (rango de un dato,
hipótesis) y no los de resistencia; un aviso **no vota** en `v_global`.

## Cómo se usa

```powershell
# desde el harness: instanciar en un proyecto, cambiando solo las entradas
python -m harness.planilla listar
python -m harness.planilla entradas zapata-generica
python -m harness.planilla instanciar zapata-generica proyectos\<slug> --como zapata-eje-3 --dato ZAP_X=4.5
python -m harness.planilla verificar proyectos\<slug> zapata-eje-3

# aquí: verificar la biblioteca entera, o una
npm run verify:biblioteca
npm run verify:biblioteca -- placa-base-generica
npm run verify:biblioteca -- --casos-escribir   # registra los ✗ medidos de cada caso
```

Los chequeos `v_*` **tienen que salir en verde con el ejemplo de referencia**. Un caso que
falla a propósito declara `cumple: false` y la lista exacta de veredictos en ✗, que se
obtiene corriendo y no escribiendo.

## Las reglas de la biblioteca

1. **Se generaliza a la segunda vez, no a la primera.** Una planilla que respalda una
   memoria se queda donde está; cuando el mismo elemento aparece en otro encargo, ahí se
   destila. Destilar en frío produce plantillas que nadie valida.
2. **No se edita encima de la que respalda una memoria.** Esa se queda intacta en su
   proyecto.
3. **Lo que hace genérica a una plantilla no es borrarle los números del proyecto:**
   - las constantes de tabla **se derivan de los datos**, no se cablean;
   - lo que era supuesto pasa a chequeo `v_*` — el `φ` deja de afirmarse;
   - las conclusiones en prosa se vuelven `program` que las computan;
   - el detallado se resuelve en **magnitudes continuas**, no en barras adoptadas a mano;
   - lo que no puede calcular se declara como **frontera**, con su origen escrito.
4. **La plantilla viene cargada con un ejemplo que cierra en verde.** Una plantilla de
   referencia no debe traer un estado límite incumplido adentro.
5. **La hoja responde «qué gobierna»**: `u_max := max(…)`, un `program` que devuelve el
   nombre del estado límite que manda, y un único `v_global := u_max <= 1 =`.
6. **Al cerrar una decisión de norma, se barren las plantillas que la tocan.** Una
   instancia guarda el `sha256` de su genérica en `meta.origen`: el lint del harness avisa
   cuando la biblioteca avanzó y la instancia quedó atrás.
7. **Para preparar una hoja nueva:** `node scripts/promover-entradas.mjs <json> --escribir`
   pone los `in_*`, nombra los `v_*` y esboza `meta.entradas`; el resto del `meta` se
   completa con `scripts/estampar-meta.mjs --patch`.

## Pendientes

Candidatas que el trabajo ya señaló y todavía no tienen genérica. **Se destilan contra un
caso real, cuando haga falta** — no antes.

| Falta | De dónde sale |
|---|---|
| **Viento ASCE 7** (Cap. 26 y 27) | las hojas de viento del taller de neumáticos (Struct_Harness), rehechas contra ASCE 7-16, que es la edición calibrada del catálogo |
| **Nieve ASCE 7** (Cap. 7) | las hojas de nieve del mismo proyecto, con la misma conversión |
| **Losa de fundación (flexión, corte, punzonamiento)** | el trío `*-aci318` del taller de neumáticos; **nomenclatura distinta** de `zapata-generica` (`b/h/rec/d_b/s` vs `bw/hzap/recub/db/sep`). Se dejó pendiente a propósito: unificar es editar cálculos que respaldan una memoria |
| **R_1 y el amplificador de 0,7·R_1** | necesitan el `Q_0` del análisis, así que no son de una hoja de acciones: van en una hoja de **verificación del análisis**, junto al escalado de §5.12 y a la deriva de §6.3 |
| **Riostras — esbeltez y compacidad** | `esbelteces-c103p4` del taller de neumáticos |
| **Capacidad de soporte · balasto · estabilidad · volcamiento** | las cuatro de fundación (Pachón) |
| **Viga de alma llena / columna PRS** | no existe |

## Procedencia

Las seis se destilaron en `Pachon/MDC/planillas/` entre el 2026-08-19 y el 2026-08-20,
cada una a partir de la planilla del proyecto que respalda su memoria. Cinco de las seis
**reprodujeron los números de la del proyecto desde sus propias ecuaciones**, que es la
mejor validación que puede tener una plantilla: llegar al mismo número por otro camino.

`viga-carrilera-generica` es la excepción, y por una razón que vale registrar: **corrigió**
a la del proyecto. La anterior aplicaba el §F2 —*doubly symmetric*—, que no alcanza a una
viga con canal-tapa; el que corresponde es el §F4, y con él aparece un cuarto estado
límite, la fluencia del ala traccionada, que quedó a 3 puntos de gobernar.

**Segunda pasada, 2026-09-11, desde el galpón simulado con puente grúa.** La hoja cubría
la monosimetría **sólo por el canal-tapa**: con `hay_canal := 0` el eje neutro caía a media
altura por construcción, `S_xc` y `S_xt` quedaban iguales y el §F4 se degradaba a un §F2
disfrazado — justo lo que el párrafo de arriba dice que no hay que hacer. Una carrilera
armada con el ala superior más ancha, que es la tipología que el §5.8.2 de AIST TR-13
describe, no la representaba nadie. Cuatro cambios, y tres de ellos van del lado inseguro
al seguro:

1. `es_soldada` + `b_fb` y `t_fb`: la hoja deriva `A`, `I_x`, `I_y` y `J` de las tres chapas.
2. **`C_v1` de verdad.** Estaba fijo en 1,0, que es el §G2.1(**a**) y vale **sólo para
   almas de perfiles laminados**. Una armada cae en el (b), y en la viga que motivó el
   cambio `C_v1` da 0,754: la resistencia al corte estaba **un 33 % sobrestimada**.
3. **Alma compacta.** El §F4 se conforma con que no sea esbelta; el §5.8.2 de AIST TR-13
   exige que el ala superior *y el alma* sean **compactas**. Son dos límites distintos.
4. **§J10.4, pandeo lateral del alma**, que ese mismo §5.8.2 lista y la hoja no tenía. En
   la mayoría de las vías no aplica, pero eso hay que **comprobarlo**, no suponerlo: el
   criterio de aplicabilidad es una razón geométrica contra 2,3 o 1,7.

Vivieron en `_plantillas/planillas/` de Struct_Harness hasta el 2026-09-11, generadas por
`_gen/hoja.py` + `gen_*.py`; desde entonces la fuente de verdad es este JSON.

**Tercera pasada, 2026-09-16: la primera de `acciones/`.** `espectro-nch2369-generica` se
destiló de `public/planillas/galpon-altiplano-sismico-nch2369.json` —de donde se copiaron
literalmente la Ec. (3) y la Ec. (1b), que allí están contrastadas contra el post— y se
cruzó contra `codigo_cl/sismo_nch2369.py` y `sismo_nch2369.valores.json` del galpón
simulado, que llegan a los mismos números por otro camino.

Una genérica no puede llevar contrastes `c_*`, así que el anclaje se hizo al escribirla,
corriendo. Los **catorce** valores que reprodujo, con las entradas de cada caso:

| Con | Da | Que es el de |
|---|---|---|
| altiplano · zona 2, suelo B, R = 5, T\* = 0,8527 s | `Sa_ref` = 0,6306425 · `Q0_min` = 70,860415 kN · `R*` = 5 | las regiones `e-01`, `b-01` y `r-06` de la planilla publicada |
| simulado · zona 2, suelo C, T\* = 0,1111578 s | `R*` = 2,8894726912 · `Sa_dis` = 0,3576673096 · `Sa_ref` = 1,0334699237 · `codo` = 0,28 s · `coef_Q0max` = 0,2916057185 | `sismo_nch2369.valores.json`, a 1e-12 |
| vertical · suelo C | `f_ξ` = 1,2267032047 · `S_aV(0)` = 0,3087 · `Sa_dis(0)` = 0,1893416396 | el mismo, rama vertical |

Los dos primeros cuadran a 1e-7 porque el post publica siete cifras; el resto, a 1e-12 o
exacto. **Las tablas 3 y 6 se releyeron del PDF** para poder derivarlas en vez de pedirlas:
la Tabla 6 entera (suelos A a E) vive ahora en un `program` de la hoja, y los seis
parámetros del suelo del altiplano y los del simulado salieron de ella idénticos a los que
las dos fuentes traían escritos a mano.
