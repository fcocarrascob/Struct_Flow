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
