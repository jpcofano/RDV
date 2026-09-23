# fixtures — esquemas, sin datos

**Sólo encabezados.** Una línea por archivo, la fila 1 de la solapa. El repo es público: acá
no entra ni una fila de datos reales. `.gitignore` bloquea `*.xlsx`, `*.xls`, `.clasprc.json`
y `node_modules/`.

Para qué sirven: fijar contra qué nombres de columna trabaja el código, y que un cambio de
encabezado en una planilla se vea como un diff en vez de como un `findIdxOr_` que tira
excepción en producción.

## De dónde salió cada uno

| archivo | columnas | procedencia | ¿confiable? |
|---|---|---|---|
| `B2.csv` | 27 | `DEST_HEADERS` en [Sync B to B2.js:14-20](../Sync%20B%20to%20B2.js#L14-L20) | **sí**, el script las crea en ese orden |
| `A2.csv` | 8 | `DEST_HEADERS` en [Sinc A to A2.js:14](../Sinc%20A%20to%20A2.js#L14) | **sí**, mismo caso |
| `B.csv` | 22 | nombres que pide `idx()` en [Sync B to B2.js:30-50](../Sync%20B%20to%20B2.js#L30-L50) + las tres manuales de S/T/U | **nombres sí, orden no** |
| `Para Revisar.csv` | 22 | `ensureColumnsExist_` en [Upset Base FInal.js:27-31](../Upset%20Base%20FInal.js#L27-L31) | **nombres sí, orden no** |
| `RVD JM-CM - ES.csv` | 41 | posiciones ancladas por las fórmulas de array (CLAUDE.md 3.1.b) | **parcial** |

## Los `PENDIENTE_<letra>`

`RVD JM-CM - ES.csv` tiene 41 columnas porque son 41, pero sólo 21 tienen nombre verificado.
Las que están ancladas salen de leer las fórmulas de array auditadas, que citan celdas por
letra y por lo tanto fijan la posición sin lugar a dudas:

- `B` ← `VLOOKUP(B2:B2374, Comunas!A:B, ...)` en la fórmula de `AA` ⇒ **Barrio**
- `E` ← `TEXT(E2:E2374,"dddd")` en la fórmula de `D` ⇒ **FECHA**
- `G` ← `G2:G2374&", Buenos Aires..."` en la de `X` ⇒ **Dirección**
- `K` y `Q` ← `Q2:Q2374/K2:K2374` en la de `W` ⇒ **Asistentes** y **Inscriptos**
- `D`, `W`, `X`, `Y`, `AA`–`AG` son las once fórmulas mismas
- `Z` es `ID` (CLAUDE.md 3.2)
- `A` es `Figura`: es la columna sobre la que están las tres reglas de formato condicional,
  por nombre de figura

El resto quedó como `PENDIENTE_<letra>` **a propósito**. Inventarlas sería peor que dejarlas
vacías: el código busca por nombre normalizado, así que un nombre mal adivinado en el fixture
da una falsa sensación de contrato verificado.

## Cómo completarlos

Correr `diagEsquemas()` de [diagnostico/01_hueco_sexo_edades.js](../diagnostico/01_hueco_sexo_edades.js).
Es de sólo lectura, no escribe en ninguna planilla, y vuelca al log la fila 1 de las cuatro
hojas ya escapada como CSV. Copiar del log y pegar acá, reemplazando el archivo entero.

Después de completar `RVD JM-CM - ES.csv`, verificar contra las anclas de arriba: si alguna no
coincide (por ejemplo, si `K` no resulta ser `Inscriptos`), **no es que el fixture esté mal, es
que alguien movió una columna** y las once fórmulas de array están apuntando a otro lado.
