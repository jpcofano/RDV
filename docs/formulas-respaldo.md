# Respaldo de las once fórmulas derivadas del destino

Para poder volver atrás si las derivadas por script (etapa "antes de Agenda", 05/10;
`30_Derivadas.js`) no funcionan. Son fórmulas de **matriz** (array) que viven en la **fila 1** de
`RVD JM-CM - ES` y de la copia `AAA NOBORRAR` y se expanden hasta la fila **2374**. Las dos solapas
tienen **exactamente las mismas** fórmulas.

## Dónde está el respaldo de verdad

- **`DERIVADAS_RESPALDO`** (solapa de la intermedia): lo escribe `paso26_quitarFormulasDerivadas()`
  **antes** de quitar las fórmulas, una línea por columna y solapa, con el texto que devuelve
  `getFormula()` en Sheets (con su `=` y, donde corresponda, `ARRAYFORMULA(…)`). **Es lo que lee
  `paso27_restaurarFormulasDerivadas()`** para volver atrás. Un respaldo nunca se pisa con un "sin fórmula".
- **Este documento**: la copia legible.

## El texto exacto

Sacado del archivo exportado de la planilla del destino (`RDV JM CM ES + funcionarios.xlsx`, 02/10),
donde las once aparecen como fórmulas de matriz (`t="array"`, rango `X1:X2374`). **Al escribirlas a
mano en Sheets van con `=` adelante y, las que no empiezan con `{`, dentro de `ARRAYFORMULA(…)`**: el
xlsx guarda la fórmula sin el envoltorio de matriz.

| col | encabezado | fórmula (fila 1, matriz hasta la 2374) |
|---|---|---|
| D | Día de la semana | `{"Día de la semana"; IF(E2:E2374="", "", TEXT(E2:E2374, "dddd"))}` |
| W | % de Asistencia | `{"% de Asistencia"; IF(LEN(K2:K2374)=0, "", IFERROR(Q2:Q2374 / K2:K2374, ""))}` |
| X | Direccion2 | `{"Direccion2"; IF(G2:G2374 = "", "", G2:G2374 & ", Buenos Aires, Argentina")}` |
| Y | Falta Informacion | `{"Falta Informacion"; IF(K2:K2374="", "", "No")}` |
| AA | Comuna | `{"Comuna"; IFERROR(VLOOKUP(B2:B2374, Comunas!A:B, 2, FALSE), )}` |
| AB | Poblacion | `IFERROR(VLOOKUP($B$1:$B2374, Comunas!$A:$G, 3, FALSE),"")` |
| AC | p. Mujer | `IFERROR(VLOOKUP($B$1:$B2374, Comunas!$A:$G, 4, FALSE), )` |
| AD | P. Varon | `IFERROR(VLOOKUP($B$1:$B2374, Comunas!$A:$G, 5, FALSE), )` |
| AE | (km2) | `IFERROR(VLOOKUP($B$1:$B2374, Comunas!$A:$G, 6, FALSE), )` |
| AF | (hab/km2) | `IFERROR(VLOOKUP($B$1:$B2374, Comunas!$A:$G, 7, FALSE), )` |
| AG | Zona | `{"Zona"; IFERROR(VLOOKUP(B2:B2374, Comunas!A:Z, 8, FALSE), )}` |

Columnas de origen: `B` Barrio, `E` FECHA, `G` Dirección, `K` Inscriptos, `Q` Asistentes.

**Ojo con AB a AF**: no llevan el encabezado como texto. Empiezan en `$B$1`, así que la fila 1 busca
"Barrio" en `Comunas` y **el encabezado que muestran es el de `Comunas`** (C1 … G1: `Poblacion`, `p. Mujer`,
`P. Varon`, `(km2)`, `(hab/km2)`). Al quitar la fórmula, el paso 26 deja ese texto tal cual se ve.

## Validado contra los valores de la planilla (05/10)

El cálculo de `30_Derivadas.js` (`calcularDerivadasFila_`), corrido sobre los valores del mismo archivo
exportado, da **0 distintas en las once columnas, en las 810 filas con datos, en las dos solapas**. Se
confirman los tres supuestos que quedaban: el día de la semana en **minúscula** y en castellano
("sábado", "miércoles"), el **`IFERROR` de % devuelve vacío** (con Inscriptos = 0 la celda queda vacía) y
el sufijo de Direccion2 es **", Buenos Aires, Argentina"**.

## Cómo se vuelve atrás

1. `PASO_DERIVADAS_SOLAPA` (en `99_Correr.js`) = la solapa a restaurar.
2. `paso27_restaurarFormulasDerivadas_enSeco()`: lista las fórmulas del respaldo que pondría.
3. `paso27_restaurarFormulasDerivadas()` (con `DRY_RUN = false`): borra los valores de las once columnas
   (si no, el array no se puede expandir), pone las fórmulas y saca la protección.
4. `DERIVADAS_POR_SCRIPT = false` (`00_Config.js`), push y clasp push.
5. `paso26_formulasDerivadas()` (el paso 14 sobre esa solapa): las once con fórmula y "valores = Comunas".

Si `DERIVADAS_RESPALDO` no tuviera una fórmula, se escribe a mano en la celda de la fila 1 con el texto
de la tabla (con `=`, y `ARRAYFORMULA(…)` para las de AB a AF), habiendo vaciado antes la columna.
