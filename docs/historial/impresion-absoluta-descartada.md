# La impresión absoluta, y por qué se descartó

El canvas persiguió durante seis fases el modelo de SMath: posición libre en un plano, y el
bloque impreso exactamente donde está. Las fases 4 y 5 llegaron a implementarlo —rama
`canvas-papel`, commits `2b5f992` y `fe697a7`— y se revirtieron con un `git reset` a
`257e47e`.

**El motivo no fue técnico: funcionaba.** Fue que imitar a SMath *desordena* las planillas, y
el objetivo del canvas es lo contrario, ordenarlas. El repo lo confirmaba sin ambigüedad: las
**8.377 regiones** del corpus están en `x = 40`, **sin una sola excepción**, y **7.471 de los
8.344** saltos verticales miden exactamente 48 px, que es el paso de inserción. Nadie usaba
la libertad que costaba mantener. La dirección pasa a ser una hoja de **flujo lineal**: una
lista ordenada, sin coordenadas.

Este documento existe porque esas dos fases midieron cosas caras de medir, y las medidas
siguen valiendo aunque el código no se fusione. La rama se borró; los commits siguen
alcanzables por su hash mientras el reflog los conserve.

## Lo que quedó comprobado

**La posición del canvas y la del papel pueden coincidir al píxel.** Región a región, `top`
dentro de su página más el tope de esa página, con tolerancia de 0,5 px: 33 planillas,
**8.229 bloques, cero desplazados**. Los que aparecían en el lienzo y no en el papel eran
exactamente las regiones vacías del corpus, comprobadas una por una.

**El contador de páginas del canvas puede no mentir.** Generando el PDF de cada planilla y
contando sus objetos `/Type /Page`, coincidía en las 33, incluida `muro-flexocompresion` con
646 regiones y 21 páginas.

## Las cinco trampas de la página en blanco

Al imprimir una `<section>` por página, cada una del tamaño exacto de la caja de contenido de
una A4, salían hojas vacías por cinco causas distintas. Cada una con su defensa en el CSS, y
todas siguen siendo ciertas para cualquiera que vuelva a tocar la impresión:

1. `break-after: page` en la **última** sección añade una hoja vacía al final. Se excluye con
   `:last-child`.
2. Un margen de un hijo **colapsa a través** de la sección y la empuja. Se evita poniendo
   todos los hijos en `position: absolute`; el `overflow: hidden` crea además un contexto de
   formato de bloque.
3. Un nodo de **texto residual** entre secciones hereda el interlineado y ocupa alto.
   `font-size: 0` en el contenedor, repuesto dentro.
4. Medio píxel de **redondeo** desborda la caja. Lo corta el `overflow: hidden`.
5. Los **encabezados del propio diálogo de Chrome** se dibujan en el margen de `@page` y se
   superponen al contenido. Hay que desmarcarlos en el diálogo; no hay defensa desde el CSS,
   así que el botón tiene que decirlo.

## El margen superior tras un salto forzado

La medida menos evidente de las dos fases, y la que más costó: **tras un `break-before: page`
el navegador SÍ respeta el margen superior del bloque.** CSS 2.1 §13.3.3 solo trunca los
márgenes en los cortes **no** forzados.

Consecuencia práctica: la página empezaba 17,6 px más abajo de donde el apilado la había
calculado, el contenido pasaba de los 1010 px por unos pocos, el último bloque se iba a la
hoja siguiente y —con el salto forzado que venía detrás— cada desbordamiento costaba una
página entera. `muro-flexocompresion` salía con 26 páginas en vez de 21. Al poner
`margin-top: 0` en el bloque que abre página, el total del corpus bajaba de 287 a 276: once
planillas perdían exactamente una página y ninguna ganaba.

Quien vuelva a apilar bloques contra cortes de página tiene que tenerlo en cuenta, use el
modelo que use.

## Lo que se rescató al código

Una pieza de esas fases no dependía del modelo y sobrevive: la nota
«Verifique los valores de entrada…» dejó de ser un pie fijo impreso —lo último que salía en
el papel sin ser una región que el autor hubiera colocado— y pasó a ser un fragmento
insertable desde la paleta, bajo «Memoria». Esa idea vale igual en una hoja de flujo lineal.
