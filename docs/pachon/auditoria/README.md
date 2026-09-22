# La obra con un proyecto real: el taller de soldadura de El Pachón

**2026-09-22.** Cierre del estudio que puso a prueba la obra con un proyecto de verdad, antes
de decidir si pasa a ser la forma en que se organiza un proyecto. Sin tocar el motor: la
pregunta era qué se puede hacer **hoy** y qué falta. Lo que falta, y el orden en que se
resuelve, está en `docs/rumbo.md`; aquí queda el estudio y lo que encontró en el proyecto.

Hay dos obras del mismo proyecto. Esta es la **auditoría**: contrasta cada patrón contra el
modelo v44. La **autocontenida** (`../autocontenida/`) calcula los mismos valores sin mirar
ningún modelo, citando solo norma y supuestos, y es la que va a la memoria del cliente.

## El método

Se tomó el taller de soldadura del harness (`proyectos/2026-bechtel-pachon-taller-soldadura`,
modelo vigente `v44_PORTONES_2026-09-16.sdb`, ingeniería básica) y se llevó a una obra **patrón
de carga por patrón de carga**, en el orden en que dependen unos de otros. Cada paso se escribió
en `generar.mjs`, se evaluó con el mismo motor de la obra que corre en el
navegador, se contrastó contra lo que mide el modelo o contra el memo del proyecto y se revisó en
la aplicación. Cada fricción se anotó en el momento en que apareció, que es lo que este documento
reúne.

Para reproducirlo:

```sh
node docs/pachon/auditoria/generar.mjs      # evalúa y reescribe el .json
node docs/pachon/autocontenida/generar.mjs  # lo mismo para la autocontenida
```

y se importa el `.json` de cada carpeta desde `/proyectos`.

## Lo que la obra cubre

**Todos los patrones y casos de carga del modelo**, los cálculos que los respaldan y dos
verificaciones de elementos. Son 29 nodos (20 cargas y 9 cálculos), 570 bloques, y la obra
entera se evalúa en **98 ms**.

| Tramo | Nodos | Contra qué cierra |
|---|---|---|
| Geometría y sitio | 1 cálculo | la superficie inclinada reproduce la de SAP (H-13, +1,11 %) |
| Permanentes: `DEAD`, `SDL_CUB`, `SDL_MURO`, `SDL_HOJA`, `POLVO`, `CM_VIA`, `CL_D` | 7 cargas | reacción de cada patrón en v44 |
| Nieve `S` y `LR` | 2 cargas | reacción en v44; CIRSOC 104 escrito entero |
| Viento de componentes y revestimientos | 1 cálculo (CIRSOC 102) | memo de costaneras |
| Costaneras de techo y de muro | 2 cálculos (AISC 360-22) + `CM_COS_TECHO`, `CM_COS_LAT` | memo de costaneras y reacción en v44 |
| Contraste de `CM` y de la masa sísmica | 1 cálculo | `CM` = 10.396,26 kN y W = 17.843,28 kN de v44 |
| Puente grúa, `CLV`, `CLH`, `CLL` | 1 cálculo + 3 cargas | reacción en v44 |
| Viga carrilera | la genérica de la biblioteca, 7 campos atados | memo de la vía |
| Viento del modelo `WX`, `WY`, `WPI` | 3 cargas + 1 cálculo | reacción en v44 |
| Espectro CIRSOC 103, `RSX`, `RSY`, `EV` | 1 cálculo + 3 cargas | memo del espectro y factores de SAP |

Los 24 contrastes cierran con un desvío máximo de **5·10⁻⁵**, que es el redondeo con que el
proyecto registró las reacciones. Las únicas diferencias mayores están explicadas en su hoja: la
viga carrilera de la biblioteca contra la copia del proyecto (0,773 contra 0,789) y el viento
lateral del TR-13 contra el del CIRSOC 101 (−0,03 %).

## Lo que funciona, y por qué importa

- **Un patrón es una carga, y su respaldo es una hoja con unidades.** El valor que se escribe en
  SAP, su cita, la salvedad y la reacción que tiene que dar quedan juntos, y el motor impide
  rotular mal una unidad. El informe del modelo rotula `SDL_HOJA` en kN/m² siendo kN/m; en la
  obra eso no se puede escribir.
- **Las flechas son las dependencias reales.** La cadena
  permanentes → `CM` y W → espectro → EV y factores de escala, o
  nieve y viento → costanera → peso de costaneras, está dibujada sin que nadie la dibuje. Cambiar
  f2 mueve W, el 85 % del corte basal y EV.
- **La frontera propia sirve para el diseño.** Las dos costaneras usan los mismos nombres
  (`M_p`, `phi_Mn`, `L_b`) sin chocar, y el panel muestra qué entra atado y con qué valor.
- **La procedencia por sha256 encontró dos defectos en la biblioteca.** El proyecto usa una
  copia derivada de la viga carrilera que los corregía en silencio como desvíos. Al instanciar
  la genérica publicada aparecieron: la fibra lateral tomada en el ala cuando el canal sobresale
  (18 % del lado **no seguro**) y un `h_p` negativo que declaraba no compacta un alma que lo es.
  Están corregidos, con sus casos, en `c83d712`.
- **Registrar un patrón heredado sirve aunque no se lo pueda recalcular.** El viento del modelo
  no tiene memoria de cálculo, pero reconstruirlo encontró una etiqueta invertida y una
  presión interna que contradice la de las costaneras.

## Lo que se arregló durante el estudio

| Commit | Qué |
|---|---|
| `23afa4a` | Layout sin flechas hacia atrás · las funciones de un `program` tienen dueño (un nodo que llamaba a la de otro podía evaluarse antes y fallar) y no aparecen como entradas · una carga de una sola partida es un solo nodo (de 21 a 13 nodos en ese momento) · el pie de los paneles ya no tapa el contenido · unidades legibles en las tarjetas |
| `c83d712` | Viga carrilera genérica: fibra lateral en la punta del canal (`D_c`) y `h_p` acotado a 0, con dos casos nuevos en `verify:biblioteca` |

## Hallazgos en el proyecto, para el harness

Ninguno cambia un veredicto emitido. Todos son de la clase que no da síntoma.

| # | Dónde | Qué | Qué hacer |
|---|---|---|---|
| 1 | `cargas.json` · `_casos_agregadores` | Dice `CM` = 12.771 kN y W = 20.218,04 kN; v44 da 10.396,26 y 17.843,28. La diferencia es exactamente lo que movieron v43 y v44 | corregir el texto |
| 2 | `cargas.json` · `WYN` | Rotula «0,313813 barlovento / 0,529559 sotavento» y es al revés: solo la asignación inversa reproduce los 813,74 kN medidos | corregir la etiqueta |
| 3 | `cargas.json` · `CLV_P*` | «127,13 kN por rueda» es el promedio de cuatro ruedas distintas; la que dimensiona es la de 190,4 kN | declarar las dos ruedas |
| 4 | `cargas.json` · `SDL_HOJA` e informe `s03_cargas.tex` | La descripción dice «(area 43)» y el informe rotula kN/m² una carga de kN/m | corregir |
| 5 | `SDL_HOJA` | Se adoptó el peso del S-19 de neumáticos, pero no su «dintel admite L/360»: no hay verificación de la flecha de los cordones bajo la hoja | verificar o declarar |
| 6 | Viento | Las costaneras usan GC_pi = 0,55; la presión interna del modelo implica **0,40**, que no es ninguno de los dos valores de la Tabla 7 | fijar la clasificación del §5.9 y aplicarla a los dos |
| 7 | Viento | El muro bajo carga 813,2 m² y la geometría da 1.032,8 m²: hay 219,6 m² sin explicar | revisar las áreas de `WY` |
| 8 | Viento | Los seis patrones no tienen memoria de cálculo | leer la Fig. 4 del CIRSOC 102 para vertiente única y escribirla |
| 9 | Memo de la vía | Supone un riel de 105 mm «tipo A75»; por el catálogo DIN 536, el A75 mide 85 mm (**verificar contra el catálogo**) | confirmar el riel |
| 10 | Memo de la vía | Un supuesto conserva «con la interacción en 0,9994», que era del C12x30 | texto viejo |
| 11 | `costaneras.py` | El área efectiva del muro usa la luz de 8,0 m de la cubierta y no los 8,5 del hastial (conservador, 1,2 %); dos textos viejos («S_NB», «L = 6,6 m») | anotar |
| 12 | Espectro | N_a y N_v siguen siendo supuestos: el operador de [3.11] y [3.12] no se lee en el PDF | ya declarado |

## Lo que el estudio concluyó

**Sí a la obra como centro.** Ya puede llevar un proyecto real de punta a punta en lo que es
cálculo: cada número tiene su respaldo, su cadena y su contraste, y encontró más defectos en el
proyecto y en la biblioteca que los que costó armarla. Lo que no puede es **reemplazar al
harness**: todo lo que viene del modelo entra a mano y no hay dónde declarar cómo se aplica una
carga. Los límites que encontró, y el orden en que se resuelven, están en `docs/rumbo.md`
(«Lo que enseñó el Pachón» y «Las etapas»).
