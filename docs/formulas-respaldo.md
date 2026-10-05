# Respaldo de las once fórmulas derivadas del destino

Para poder volver atrás si las derivadas por script (etapa "antes de Agenda", 05/10;
`30_Derivadas.js`) no funcionan. Son las fórmulas de array que viven en la **fila 1** (el
encabezado) de `RVD JM-CM - ES` y de la copia `AAA NOBORRAR`.

## Dónde está el respaldo de verdad

- **`DERIVADAS_RESPALDO`** (solapa de la intermedia): lo escribe `paso26_quitarFormulasDerivadas()`
  **antes** de quitar las fórmulas, una línea por columna y solapa, con el texto exacto que devuelve
  `getFormula()`. **Es lo que lee `paso27_restaurarFormulasDerivadas()`** para volver atrás. Un respaldo
  nunca se pisa con un "sin fórmula".
- **Este documento**: la copia legible, para quien no tenga la planilla a mano.

## El texto exacto

> ⚠️ **Pendiente de completar con el log de `paso25_compararDerivadas()`** (bloque "las once fórmulas,
> texto exacto"). Lo de abajo sale de CLAUDE.md 3.1.b, de la auditoría de 09/2026; en `% de
> Asistencia` y `Direccion2` el texto está **cortado** ("…") y no se puede usar para restaurar tal cual.

| columna | encabezado | fórmula (según CLAUDE.md 3.1.b) |
|---|---|---|
| D | Día de la semana | `={"Día de la semana"; IF(E2:E2374="","",TEXT(E2:E2374,"dddd"))}` |
| W | % de Asistencia | `={"% de Asistencia"; IF(LEN(K2:K2374)=0,"",IFERROR(Q2:Q2374/K2:K2374,…))}` (cortada) |
| X | Direccion2 | `={"Direccion2"; IF(G2:G2374="","",G2:G2374&", Buenos Aires, …")}` (cortada) |
| Y | Falta Informacion | `={"Falta Informacion"; IF(K2:K2374="","","No")}` |
| AA | Comuna | `={"Comuna"; IFERROR(VLOOKUP(B2:B2374, Comunas!A:B, 2, FALSE),)}` |
| AB | Poblacion | `VLOOKUP($B, Comunas!$A:$G, 3)` (forma según 3.1.b; texto exacto pendiente) |
| AC | p. Mujer | ídem, columna 4 |
| AD | P. Varon | ídem, columna 5 |
| AE | (km2) | ídem, columna 6 |
| AF | (hab/km2) | ídem, columna 7 |
| AG | Zona | `={"Zona"; IFERROR(VLOOKUP(B2:B2374, Comunas!A:Z, 8, FALSE),)}` |

Columnas de origen: `B` Barrio, `E` FECHA, `G` Dirección, `K` Inscriptos, `Q` Asistentes.

## Cómo se vuelve atrás

1. `PASO_DERIVADAS_SOLAPA` (en `99_Correr.js`) = la solapa a restaurar.
2. `paso27_restaurarFormulasDerivadas_enSeco()`: lista las fórmulas del respaldo que pondría.
3. `paso27_restaurarFormulasDerivadas()` (con `DRY_RUN = false`): borra los valores de las once columnas
   (si no, el array no se puede expandir), pone las fórmulas y saca la protección.
4. `DERIVADAS_POR_SCRIPT = false` (`00_Config.js`), push y clasp push.
5. `paso26_formulasDerivadas()` (el paso 14 sobre esa solapa): las once con fórmula y "valores = Comunas".

Si `DERIVADAS_RESPALDO` no tuviera una fórmula, se escribe a mano en la celda del encabezado con el
texto de la tabla de arriba (una vez completado).
