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

Migradas el 2026-09-11 desde el harness. Las seis pasan `verify:biblioteca` con su
ejemplo de referencia y un caso que falla a propósito.

### `acero/`

| Plantilla | Qué verifica | Norma | Entradas |
|---|---|---|---:|
| `placa-base-generica` | Aplastamiento, equilibrio, grupo de pernos y espesor de chapa. Cubre placa **lisa** y **rigidizada** con la misma hoja (`hay_nervios`) | AISC DG1 3.ª §4.3.7 · AISC 360 §J8, §J4.5 · ACI 318-25 §17.6.1 | 26 |
| `llave-corte-generica` | Los **siete** estados límite de la llave. Una chapa por dirección o dos paralelas desplazadas | AISC DG1 3.ª §4.3.3 y Ej. 4.7-5 · ACI 318-25 §17.11, §17.5.2.1.2 · AISC 360 §J2, §J4.2, §J4.5 | 27 |
| `silla-anclaje-generica` | El **camino de carga** completo: perno → chapa superior → nervios → ala (o ala extendida) → alma | CIRSOC 301-18 §J.10.8 · AISC 360 §J2, §J4.2, §J4.5 | 31 |
| `viga-carrilera-generica` | Flexión biaxial, corte, fuerzas concentradas del rodado —incluido el pandeo lateral del alma—, deflexiones y fatiga. Cubre la doble T **monosimétrica** de las dos formas en que se construye: con canal-tapa (`hay_canal`) y **armada con el ala superior más ancha** (`es_soldada`) | AISC 360-22 §F4, §G2, §H1, §J10, Ap. 3 | 43 |

### `hormigon/`

| Plantilla | Qué verifica | Norma | Entradas |
|---|---|---|---:|
| `pedestal-generico` | Cuantías, extremos del diagrama P–M, corte, estribos y armadura de anclaje contable | ACI 318-25 SI Cap. 10, 17, 21, 22, 25 | 27 |
| `zapata-generica` | Flexión, corte en una dirección y punzonamiento, con reparto en banda | ACI 318-25 SI Cap. 8, 13, 21, 22, 25 | 22 |

### `acciones/`

Vacía. Las candidatas (viento CIRSOC 102, nieve CIRSOC 104) se destilan de las hojas
del taller de neumáticos cuando se instancien por segunda vez; para una hoja de
acciones el contrato exige solo `v_global`, no `u_max` ni `gobierna`.

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
| `T_grupo` | `placa-base-generica` | `silla-anclaje-generica` · `pedestal-generico` |
| `Yb_comp` | `placa-base-generica` | `llave-corte-generica` (como `Yb`; de ahí sale `ψ_brg`) · `silla-anclaje-generica` |
| `t_bp` requerido | `placa-base-generica` **y** `llave-corte-generica` | manda **el mayor de los dos** |
| Reacción de base | el modelo estructural | `zapata-generica` |

> 🔴 **El espesor de la placa lo suele fijar la llave, no el panel entre nervios.** Por la
> regla `t_bp ≥ t_sl` de la DG1 §4.3.3 y por la flexión local que induce su excentricidad.
> Dimensionar la placa sin haber mirado la llave es el error fácil de esta familia.

> 🔴 **El *breakout* de la llave no se arregla con acero.** Va con `c_a1^1,5`, o sea con el
> **ancho del pedestal**: es variable de la fundación, no de la placa. Las salidas son
> ensanchar el pedestal o acreditar armadura de anclaje por el §17.5.2.1.2 — y esas ramas
> compiten por el mismo espacio que la llave ocupa.

## Fronteras e hipótesis

Lo que cada plantilla **no** calcula y tiene que entrar como dato con su origen, y lo que
asume sin chequear, está en `meta.fronteras` y `meta.hipotesis` de cada JSON — es lo
primero que pregunta un revisor externo, y por eso viaja con la hoja y no en un índice
aparte. Resumen:

| Plantilla | No calcula | Asume |
|---|---|---|
| `placa-base-generica` | **β** (entra medido o de tabla; la hoja lo acota entre 0,0479 y 0,125) · la silla · la llave | placa rectangular · una fila de pernos por lado · bloque rectangular |
| `llave-corte-generica` | el equilibrio de la placa · el despiece de la armadura de anclaje · la envolvente de dos chapas como bloque único | — |
| `silla-anclaje-generica` | el reparto de tracción entre pernos (uniforme) · el ancho eficaz de la chapa · el rigidizador a resistencia | extensión de ala con la lectura conservadora |
| `viga-carrilera-generica` | las cargas de rueda (del fabricante) · la clasificación del **ala** —la del **alma** sí la calcula— · el eje neutro plástico (`R_pc = R_pt = 1,0`) · los límites de deflexión · el riel y su unión | dos ruedas iguales · canal continuo y colaborante · vano simple · el ala superior (más el canal) toma íntegramente la fuerza lateral |
| `pedestal-generico` | los puntos intermedios del P–M (entran como pares) · los límites de cuantía | estribos cerrados · armadura simétrica · **detallado no sísmico** |
| `zapata-generica` | los esfuerzos mayorados | apoyo interior · sin armadura de corte · `Nu = 0` · X es el lado corto (**sí** se chequea) |

## Lo que queda por afinar en el `meta`

Las **etiquetas** de las entradas de `placa-base-generica` están escritas; en las otras
cinco la etiqueta es el nombre de la variable y la `ayuda` es el párrafo de la hoja que
la nombra, tal como las esbozó `scripts/promover-entradas.mjs`. Se completan en el
canvas cuando cada hoja se use por primera vez desde `/diseno`. Lo mismo con el
`aviso: true` de los veredictos: marca los chequeos de validez (rango de un dato,
hipótesis) y no los de resistencia, y se revisa hoja por hoja.

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
| **Viento CIRSOC 102** | `viento-cirsoc102` del taller de neumáticos (Struct_Harness) |
| **Nieve CIRSOC 104** | `nieve-cirsoc104` del taller de neumáticos |
| **Losa de fundación (flexión, corte, punzonamiento)** | el trío `*-aci318` del taller de neumáticos; **nomenclatura distinta** de `zapata-generica` (`b/h/rec/d_b/s` vs `bw/hzap/recub/db/sep`). Se dejó pendiente a propósito: unificar es editar cálculos que respaldan una memoria |
| **Espectro y factores de escala** | `espectro-factores-escala` (Pachón) |
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
