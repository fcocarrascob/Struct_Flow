# Línea base de la página, antes del posicionamiento libre

Las medidas de partida del trabajo de WYSIWYG del canvas. Todo lo que viene después
—renderizado unificado, impresión absoluta, migración del corpus— mueve los cortes de página;
sin un *antes* escrito no hay forma de distinguir un cambio esperado de una regresión.

Se toman con `/calibrar`, una vista que solo existe en desarrollo
(`src/components/dev/`). Mide con el pipeline de verdad —`WorksheetPrint` + `medirBloques` +
`paginar()`— y no con una reimplementación: medir con una copia sería medir la copia.

| | |
|---|---|
| Fecha | 2026-09-09 |
| Commit | el anterior a la fase 2 (`5640860`) |
| Chromium | 148.0.7778.96 (el de Playwright, en modo *headless*) |
| KaTeX | paquete npm 0.17 con el CSS 0.16.11 del CDN — la deuda del README, **sin tocar** |

## El reporte del verificador

```
node scripts/verify-planilla.mjs public/planillas
```

| | |
|---|---|
| Líneas | 2.728 |
| md5 | `17613b2b9ba8e2369e21e76507b21726` |

Es la primera puerta de la migración del corpus: el reporte se construye del orden de lectura
y de los valores, nunca de coordenadas, así que después de reacomodar las 33 planillas tiene
que salir **byte a byte idéntico**. Si cambia un carácter, algo se movió de sitio en el orden
de lectura y con él el scope compartido.

## El alto real de una A4 en Chromium

`A4_ALTO_UTIL_PX = 1010`, **confirmado**.

Hasta ahora el valor se deducía del comportamiento de un bloque al filo («uno que cerraba la
página en 1010,000 cabía y uno en 1010,622 no»), lo que obliga a fabricar ese bloque y a
fiarse de que no haya nada más en juego. La página-regla lo enseña: seis `<section>` de alto
`H` con la geometría marcada, impresas a PDF, contando las hojas que salen.

| Alto probado (px) | Hojas del PDF (6 secciones) | |
|---|---|---|
| 1005 – 1010 | 6 | cabe |
| 1010,2 | 8 | desborda |
| 1011 – 1014 | 8 | desborda |

La caja de página mide **1010,0 px exactos**: cualquier decimal por encima desborda. Los
1009,134 de la cuenta teórica (267 mm × 96/25,4) se quedan cortos porque Chromium arma la caja
en píxeles enteros, y usarlos adelanta un corte cada varias páginas.

## Páginas por planilla

271 páginas en las 33 planillas publicadas. **Ningún bloque del corpus es más alto que una
página**: el más alto mide 600 px de los 1010 disponibles, así que hoy no hay ninguna figura
que se desborde al imprimir.

| Planilla | Regiones | Páginas | Bloque más alto |
|---|---:|---:|---:|
| anclajes-pedestal | 298 | 9 | 444 px |
| chevron-nch2369 | 308 | 10 | 468 px |
| columna-galpon-compresion | 158 | 5 | 363 px |
| columna-interaccion-esbeltez | 266 | 9 | 470 px |
| conexion-apernada-corte | 181 | 7 | 387 px |
| conexion-doble-angulo | 241 | 9 | 488 px |
| conexion-momento-end-plate | 169 | 6 | 307 px |
| conexion-momento-placas-ala | 184 | 6 | 313 px |
| diagonal-hss-traccion | 283 | 9 | 413 px |
| diagonal-longitudinal-galpon | 112 | 4 | 60 px |
| ejemplo-analisis-sismico-cepa-nch2369 | 97 | 3 | 90 px |
| ejemplo-torre-deformaciones-nch2369 | 82 | 3 | 90 px |
| ejemplo-torre-sismica-nch2369 | 59 | 2 | 60 px |
| empalme-apernado-viga | 272 | 9 | 400 px |
| galpon-altiplano-cargas-combinaciones | 68 | 3 | 60 px |
| galpon-altiplano-sismico-nch2369 | 102 | 4 | 90 px |
| galpon-altiplano-viento-sitio-nch432 | 74 | 3 | 60 px |
| gusset-apice-chevron | 215 | 8 | 360 px |
| gusset-esquina-apernado | 284 | 10 | 430 px |
| gusset-simple-apernado | 175 | 6 | 474 px |
| gusset-simple-soldado | 154 | 6 | 474 px |
| losa-punzonamiento-momento | 454 | 14 | 402 px |
| losa-unidireccional | 601 | 17 | 490 px |
| mensula-puntal-tensor | 320 | 10 | 397 px |
| muro-flexocompresion | 646 | 19 | 436 px |
| pedestal-anclaje-nch2369 | 489 | 14 | 440 px |
| placa-base-rigidez-rotacional | 187 | 7 | 499 px |
| viga-carrilera-puente-grua | 394 | 12 | 427 px |
| viga-columna | 324 | 10 | 456 px |
| viga-flexion-corte | 218 | 7 | 427 px |
| viga-hss-flexion | 518 | 16 | 600 px |
| viga-ltb | 189 | 6 | 373 px |
| zapata-aislada | 255 | 8 | 440 px |
| **Total** | **8.377** | **271** | |

Dos comprobaciones cruzadas de que se está midiendo lo que se cree: `zapata-aislada` anuncia
8 páginas, que es lo que registró la nota de paridad del `README` al extraer el snapshot; y el
total de 271 coincide con el que había apuntado antes.

## Un hallazgo aparte: los `¿token?` de la consola

Al medir las 33 saltan errores de SVG en la consola —`<line> attribute y1: Expected length,
"¿y_lim?"`— en `losa-unidireccional` y `losa-punzonamiento-momento`. **No es un fallo de la
medición ni una regresión**: ocurre igual abriendo esas planillas en `/canvas`, y el DOM final
queda limpio (0 tokens sin resolver en los 200 SVG de la hoja y otros tantos del documento de
impresión).

Es un transitorio del primer pintado: `EsquemaInline` inyecta el SVG con `scope ?? {}` antes
de que llegue el scope de la evaluación, el navegador se queja de los atributos, y el efecto
siguiente lo corrige. No afecta a las alturas —la figura reserva su tamaño con `aspectRatio`
desde el principio— ni a lo que se imprime. Queda anotado porque es ruido que confunde al
depurar, no porque haya que arreglarlo ahora.

---

# Después de la fase 3 (renderizado unificado)

El canvas y el papel pasan a dibujar el mismo marcado con el mismo CSS
(`BloqueDoc.tsx` + `.doc-papel`). Medido con `/calibrar` sobre el mismo Chromium.

## Paridad de alturas: exacta

Comparando bloque a bloque el alto en el lienzo contra el alto en el documento de impresión,
con tolerancia de 0,5 px:

| Planilla | Bloques | Con alto distinto |
|---|---:|---:|
| viga-flexion-corte | 218 | 0 |
| zapata-aislada | 255 | 0 |
| losa-unidireccional | 601 | 0 |

Era el objetivo de la fase: hasta aquí el canvas dibujaba con `text-sm` (14 px) y el documento
con `11pt` (14,67 px) e interlineado propio, así que un mismo bloque no medía lo mismo en un
sitio y en otro.

## Lo que cambia en el papel: 271 → 287 páginas

Volcando el documento de impresión a texto y diferenciándolo contra el estado anterior, las
únicas diferencias son las dos que la fase se propuso resolver, y **ninguna otra**:

| Planilla | Líneas de diferencia | De ellas |
|---|---:|---|
| viga-flexion-corte | 6 sobre 216 | 1 el título, 2 bloques de programa |
| zapata-aislada | 6 sobre 255 | 1 el título, 2 bloques de programa |
| muro-flexocompresion | 58 sobre 646 | 1 el título, 28 bloques de programa |

1. **El título deja de mudarse.** El bloque `__header` que el documento fabricaba aparte pasa
   a ser la propia región de texto (`r000`), con el mismo contenido, dibujada donde el autor
   la puso. Antes la misma región estaba en un sitio del canvas y en otro del papel.
2. **Un bloque de programa imprime su código.** Antes el papel enseñaba solo el resultado, y
   una función se despachaba con «X — función definida»: el algoritmo, que es justo lo que
   hay que poder auditar en una memoria, no salía. Ahora sale el mismo `pre` que se ve en la
   hoja.

Eso cuesta **16 páginas sobre 271** (+5,9 %), repartidas en 10 de las 33 planillas. Las 10
son todas de las 23 que tienen bloques de programa; **ninguna planilla sin programas cambió
de paginación**, que es la comprobación que descarta que se haya movido algo por otro motivo.

| Planilla | Antes | Ahora | |
|---|---:|---:|---:|
| anclajes-pedestal | 9 | 10 | +1 |
| chevron-nch2369 | 10 | 12 | +2 |
| columna-interaccion-esbeltez | 9 | 11 | +2 |
| diagonal-hss-traccion | 9 | 10 | +1 |
| gusset-simple-apernado | 6 | 7 | +1 |
| losa-punzonamiento-momento | 14 | 15 | +1 |
| losa-unidireccional | 17 | 20 | +3 |
| muro-flexocompresion | 19 | 22 | +3 |
| viga-carrilera-puente-grua | 12 | 13 | +1 |
| viga-hss-flexion | 16 | 17 | +1 |
| **Total** | **271** | **287** | **+16** |

## Consecuencia esperada: aparecen solapes en el canvas

El bloque del título pasa de 24 px a **90 px**: ahora es el `<h1>` a 15 pt —que en 680 px de
ancho ocupa dos líneas— más la línea de fecha y la regla. En el papel siempre midió eso; lo
que ha cambiado es que el canvas ya no miente.

Las planillas del corpus dejan 48 px entre el título y lo siguiente, que era de sobra para un
título de 24 px y no lo es para uno de 90. Por eso el canvas empieza a avisar de bloques
tapados —uno en `viga-flexion-corte`, tres en `muro-flexocompresion`— donde antes no avisaba
de ninguno.

**No es una regresión: es el aviso funcionando.** El botón «Separarlos» lo resuelve en un
clic y es reversible con Ctrl+Z, y la migración de la fase 6 recoloca las 33 con las alturas
de papel, que es cuando deja de hacer falta.

---

# Después del espaciador (2026-09-09)

Una región de texto vacía deja de medir cero y pasa a ocupar **16 px**, un paso de la
cuadrícula, en la hoja **y** en el papel: `.doc-papel .wp-space`, con `ALTO_ESPACIADOR` de
`BloqueDoc.tsx` como su pareja en TypeScript. Es lo que hace que el Enter del canvas abra un
hueco de verdad en vez de uno que solo se ve en pantalla.

Hasta ahora `WorksheetPrint` descartaba todo lo que tuviera el `src` vacío, así que las **39
regiones vacías** del corpus —16 solo en `anclajes-pedestal`— ocupaban sitio en el JSON y en
el lienzo pero eran invisibles al imprimir. Sus autores las pusieron como espaciador; ahora lo
son.

## Lo que cambia en el papel: 287 → 289 páginas

| Planilla | Antes | Ahora | | Regiones vacías |
|---|---:|---:|---:|---:|
| mensula-puntal-tensor | 10 | 11 | +1 | 5 |
| zapata-aislada | 8 | 9 | +1 | 1 |
| **Total del corpus** | **287** | **289** | **+2** | **39** |

**La comprobación que descarta otra causa:** de las 33 planillas, las únicas que cambian de
paginación son dos de las **ocho** que tienen regiones vacías. Ninguna de las 25 sin regiones
vacías se movió.

Que `anclajes-pedestal` no gane una página con 16 espaciadores (256 px) y `zapata-aislada` sí
con uno solo (16 px) no es una anomalía: depende de lo cerca que estuviera cada corte del filo
de la hoja.

## Alturas: solo cambian las vacías

Comparando bloque a bloque el alto en el lienzo antes y después, con tolerancia de 0,5 px:

| | |
|---|---:|
| Bloques comparados (5 planillas) | 1.900 |
| Con alto distinto | **5** |
| De ellos, regiones vacías | **5 de 5** |
| Cualquier otra diferencia | **0** |

Las cinco pasan de 0 a 16 px. Es exactamente el cambio buscado y ninguno más.
