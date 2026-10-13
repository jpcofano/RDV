# Formularios sin fila

> **Estado (13/10): escrito y APAGADO, por decisión del usuario** (`FORMULARIOS_SIN_FILA_ACTIVA = false` en
> `00_Config.js`). La solapa todavía no existe en el archivo de la base. Para prenderla, ver "Cómo se prende" al final.

Para quien mira la base RDV y quiere saber qué reuniones faltan cargar.

## Qué es esto

Cada formulario de inscripción corresponde a una reunión. Cada hora, el sistema busca la fila de **RVD JM-CM - ES** de cada
formulario y completa sus datos. Cuando un formulario **no queda en ninguna fila**, casi siempre es porque **la reunión no
está cargada en la base**: el formulario existe, la fila no.

La solapa **FORMULARIOS_SIN_FILA** lista esos formularios, para que el equipo los vea sin tener que leer el log del sistema.

> **Un formulario sin fila suele ser una reunión que falta cargar en la base.** Cargá la fila (figura, fecha, barrio) y el
> sistema la completa solo en la corrida siguiente.

## Dónde está

En el **mismo archivo de RVD JM-CM - ES**, solapa **FORMULARIOS_SIN_FILA**. Se reescribe entera cada hora. Es de **sólo
lectura**: si se edita, aparece una advertencia, y lo que se escriba se pierde en la corrida siguiente.

## Qué formularios aparecen

Los formularios con fecha en **los últimos 30 días** (la fecha del nombre del formulario o, si el nombre no tiene fecha, la
del cierre de la inscripción) que no quedaron en ninguna fila.

**No aparecen**:

- los de **reuniones futuras**: todavía esperan su fila;
- los que tienen **0 inscriptos**;
- los **duplicados descartados**: dos formularios con el mismo nombre, y uno casi sin inscriptos (ése no se hizo);
- los **duplicados de un formulario que ya tiene fila**: son la misma reunión.

Arriba de la lista, una línea dice cuántos hay y cuántos quedaron afuera por cada uno de esos motivos.

## Las columnas

| columna | qué dice |
|---|---|
| Formulario | el nombre, tal como viene |
| Fecha | la de la reunión según el nombre; "(cierre)" si el nombre no tenía fecha y es la del cierre de la inscripción |
| Inscriptos | los del formulario |
| Figura (del nombre) | las figuras que nombra el formulario; "(ninguna)" si no nombra a nadie |
| Lugar (del nombre) | el barrio, la comuna ("Comuna 1 Sur") o el eje que dice el nombre; "(no dice)" |
| Motivo | por qué no quedó en ninguna fila (abajo) |
| Fila más cercana | la fila de la base más parecida: número, figura, barrio, fecha, a cuántos días, y si ya tiene formulario |

## Qué quiere decir cada motivo, y qué hacer

| motivo | qué pasa | qué hacer |
|---|---|---|
| **Sin ninguna fila de *figura* a ±7 días** | no hay ninguna reunión de esa figura cerca de esa fecha | **cargar la reunión** en la base |
| **La fila más cercana está a N días (más de 3)** | hay una fila de la figura, pero a más de 3 días: el sistema no las une solo | si es la misma reunión, corregir la fecha de la fila; si no, cargar la reunión |
| **La fila es en otro lugar** | hay una fila de la figura esos días, en otro barrio o comuna | si se mudó, está bien (vale el barrio de la base); si son dos reuniones, cargar la otra |
| **La fila ya tiene otro formulario** | la fila de la figura ese día ya tiene su formulario | ¿hubo otra reunión ese día? cargarla; si es un formulario viejo de la misma reunión, no hay nada que hacer |
| **No nombra ninguna figura** | el formulario no dice de quién es (p. ej. los de Seguridad) | ver la fila más cercana de su lugar; si falta la reunión, cargarla |
| **Nombra varias figuras** | una inscripción compartida | lo decide una persona |
| **En revisión** | es la mejor opción de una reunión que está en REVISAR_MATCH | elegirlo en su ficha (ver docs/elegir-match.md) |
| **Su fila espera el barrio** | la reunión es de hoy o ayer y le falta el barrio | cargar el barrio; se une solo |
| **La fila es de antes de las filas activas** | la fila tiene más de 30 días: el sistema ya no la trabaja | nada, salvo que haga falta completarla a mano |
| **Hay una fila libre … que no se cruzó** | la fila está ahí y no se unió | avisar: es para revisar |

## Cómo se prende

1. `paso65_formulariosSinFila_enSeco()` (99_Correr.js): no escribe nada. Deja en el log cuántos hay hoy y cuáles, con el
   motivo y la fila más cercana.
2. Si está bien: `FORMULARIOS_SIN_FILA_ACTIVA = true` en `00_Config.js`, commit, push y clasp push. La corrida de la hora
   siguiente crea la solapa.
3. `paso48_ayuda()`: reescribe la GUÍA con la sección de FORMULARIOS_SIN_FILA. Esa sección entra sólo con el interruptor
   prendido: mientras esté apagado, la GUÍA no la nombra (y el paso 48 se puede correr igual por otros motivos).

Detalle técnico: CLAUDE.md, decisión 2, "FORMULARIOS_SIN_FILA"; código en `48_FormulariosSinFila.js`; tests en
`tests/formularios_sin_fila.test.js`.
