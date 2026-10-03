# Cómo elegir un match a mano

Para quien revisa las reuniones que el sistema no pudo emparejar solo.

## Qué es esto

Cada hora, el sistema empareja cada fila de **RVD JM-CM - ES** con su formulario de inscripción y
completa los datos (inscriptos, canales, sexo, edades, asistentes). Cuando no está seguro de cuál es el
formulario de una fila, **no escribe nada** y te muestra las opciones con sus puntajes para que elijas
vos. Lo que elijas se escribe en la corrida siguiente.

Las opciones están en la **Base intermedia de Reuniones de Vecinos**, en dos solapas:

- **REVISAR_MATCH**: una línea por reunión del destino que necesita una decisión.
- **EMPAREJAR_MANUAL**: arriba, pares "formulario ↔ reunión" posibles; abajo, en el bloque
  **"POR FILA DEL DESTINO"**, una línea por reunión con sus opciones (igual que REVISAR_MATCH).

## Qué mirar en cada línea

- **figura, barrio, fecha**: la reunión del destino.
- **motivo**: por qué el sistema no decidió solo (dos formularios muy parecidos, la ubicación no
  coincide, el formulario nombra a varias figuras, etc.).
- **op1, op2, op3**: hasta tres formularios candidatos, del más probable al menos probable. De cada
  uno: el nombre (`op1_formulario`), los inscriptos **del formulario**, el puntaje (de 0 a 1), las
  señales (si coincide la figura, a cuántos días está la fecha, si coincide la ubicación) y si ya lo
  tiene otra reunión (`tomado_por`).

## Qué escribir en "elegido"

| escribís | significa |
|---|---|
| `1`, `2` o `3` | la reunión es la de esa opción |
| `sí` | lo mismo que `1` (en REVISAR_MATCH y en el bloque "POR FILA DEL DESTINO") |
| `sí` (en un par de EMPAREJAR_MANUAL, bloque de arriba) | ese par es el correcto |
| `ninguno` | ninguna opción es esta reunión |

Una sola elección por reunión. No hace falta borrar nada después: el sistema guarda lo que elegiste.

## Qué significa "resultado"

Lo escribe el sistema, al lado de "elegido":

- **válida (en seco: …)**: la elección está bien y se va a escribir en la próxima corrida real.
- **aplicado `<fecha>`**: ya se escribió. La reunión tiene sus datos y en la traza dice
  `+elegido_por_persona`.
- **rechazado: `<motivo>`**: no se escribió nada. Los motivos:
  - *el formulario ya tiene otra fila*: ese formulario (o su gemelo con el mismo nombre) ya es de otra
    reunión. Si creés que está mal la otra, avisá: no se corrige solo;
  - *el formulario ya no existe en B*: lo sacaron del origen o le cambiaron el nombre;
  - *dos elecciones para la misma fila* / *para el mismo formulario*: hay que dejar una sola;
  - *elección ilegible*: escribí `1`, `2`, `3`, `sí` o `ninguno`;
  - *la fila ya está escrita*: la reunión ya tenía datos del sistema.
- **ninguno: no se vuelve a proponer**: la reunión deja de aparecer con opciones. Vuelve a
  aparecer sola si llega un formulario nuevo de esa figura a 7 días o menos de la fecha
  (**vencido: formulario nuevo …**).

## Lo que el sistema nunca hace

- **No pisa nada**: escribe sólo en celdas vacías. Si alguien ya cargó un número, queda.
- **No toca el Barrio**: lo carga el equipo.
- Lo que escribe queda pintado de **azul claro** (`#CFE2F3`), para que se vea qué puso el sistema.

## Si te equivocaste

Mientras diga "válida", todavía no se escribió: avisá y se anula (se borra su línea en la solapa
**ELECCIONES_MATCH**). Si ya dice "aplicado", hay que deshacerlo a mano en la reunión: avisá.
