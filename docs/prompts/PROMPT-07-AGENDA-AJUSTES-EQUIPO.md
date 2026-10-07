# Prompt para Code — Agenda, etapa 2: ajustes antes de la primera corrida real

**Proyecto:** RDV — repo `jpcofano/RDV`
**Guardar como:** `docs/prompts/PROMPT-07-AGENDA-AJUSTES-EQUIPO.md`
**Fecha:** 07/10/2026

La corrida en seco del 07/10 10:20 salió OK (CREAR 10, VINCULAR 35, duplicado de la misma
corrida resuelto, REGISTRO_AGENDA escrito, sin Error). Antes de la primera corrida real
(`semana()`, sólo 05/10–10/10) van estos ajustes. Decisiones del usuario.

---

## A. Que se sepa quién creó y quién tocó cada fila

1. Columna nueva **"Origen fila"** (al final, con las de la agenda), escrita por el sistema:
   - "sistema (agenda)": la creó la agenda;
   - "equipo": la cargó el equipo y la agenda no la vinculó;
   - "equipo + agenda": la cargó el equipo y la agenda la vinculó (completó lo vacío).
   Para las filas que ya existen hoy: "equipo" (o "equipo + agenda" cuando se vinculen).
2. Columna nueva **"Tocado por el equipo"**: en las filas que creó o vinculó la agenda, la lista
   de columnas que el equipo cambió respecto de lo que escribió el sistema (comparando contra
   agenda_*_escrita y lo demás que escribió), por ejemplo "Barrio, HORA". Vacía si no tocó nada.
   Se recalcula en cada corrida. Sirve para que el equipo vea qué cambió y para el control.
3. El color #CFE2F3 sigue marcando cada celda que escribió el sistema (como en formularios).

## B. Llenar las columnas del equipo COMO LAS LLENA EL EQUIPO, sin perder información

4. Antes de escribir: medí, sobre las filas cargadas por el equipo en los últimos 3 meses, cómo
   llena cada columna que la agenda va a escribir (Figura, Barrio, EVENTO, FECHA, HORA,
   Dirección, STATUS REUNIÓN): tipo de dato (fecha/hora como fecha o texto), formato
   (dd/mm/aaaa, 17:15), mayúsculas, si la Dirección lleva el nombre del lugar ("Chile 1769,
   Asociación Civil Casa Paraguaya") o sólo la calle, si EVENTO agrega el eje ("Encuentro con
   Vecinos - Eje Norte") o marcas ("SETB"), qué STATUS ponen antes de la reunión. Mostrá 5
   ejemplos por columna y reproducí exactamente esa forma. La HORA: confirmá si el equipo carga
   la del mail (que es la de convocatoria, con los 15 minutos previos ya incluidos) o la ajusta.
5. Lo que la forma del equipo pierde del mail va a COLUMNAS NUEVAS, al final (nunca se pierde
   nada del mail):
   - **"Evento (mail)"**: el texto completo del evento tal como viene en el mail
     (p. ej. 'Encuentro Temático "Inteligencia Artificial" Gabriel Sánchez Zinny, Eje Norte
     (SOLO SE COMUNICA POR REDES)');
   - **"Lugar (mail)"**: comuna / eje / barrio tal como lo dice el evento;
   - **"Dirección (mail)"**: la línea Lugar completa, si la Dirección del equipo la acorta;
   - **"Marcas (mail)"**: SOLO SE COMUNICA POR REDES, A CONFIRMAR, NO SE COMUNICA LA
     DIRECCIÓN…;
   - **"Conjunta con"**: las otras figuras de una reunión conjunta;
   - (ya estaba) **"No participa"**.
   Estas columnas se escriben en las filas creadas Y en las vinculadas (son del sistema; no
   pisan nada del equipo). Se actualizan con cada versión del mail.
6. Todas las columnas nuevas (las 9 que ya había + Origen fila + Tocado por el equipo + las del
   punto 5) van AL FINAL, después de form_clave, nunca insertadas en el medio. paso36 las agrega
   todas; decime el rango final (letras).

## C. Filas que carga o borra el equipo

7. CASI DUPLICADO ANTES DE CREAR: además de figura + fecha exacta, buscar filas (sin
   agenda_uid) de la misma figura a ±2 días, o misma fecha + misma comuna con otra figura o sin
   figura. Si hay alguna: NO crear; listar en una solapa nueva del destino "AGENDA_DUPLICADOS",
   con el formato de las fichas (ELEGIR adelante y protegida): reunión del mail | fila
   candidata | diferencia (fecha / figura / hora) | ELEGIR: "Es la misma: vincular" / "Son
   distintas: crear" / "No sé". La elección se lee en la corrida siguiente, como en
   REVISAR_MATCH.
8. DUPLICADO DESPUÉS DE CREAR: si aparece una fila sin agenda_uid igual (o casi igual, mismo
   criterio del punto 7) a una creada por la agenda, se lista en AGENDA_DUPLICADOS. El sistema
   NO borra ni fusiona nada solo.
9. FILA BORRADA POR EL EQUIPO: si un agenda_uid que creó la agenda (está en REGISTRO_AGENDA) ya
   no está en el destino y la reunión sigue en el mail, NO se vuelve a crear. Queda como
   "borrada por el equipo" en REGISTRO_AGENDA y en el archivo "Agenda". Excepción: si la
   reunión desaparece del mail y después vuelve a aparecer, se trata como nueva.
10. Paso 16: el control de duplicados incluye los casi duplicados; informa "Tocado por el
    equipo" (cuántas filas y qué columnas).

## D. Página del equipo (docs/agenda-equipo.md)

11. Explicar, corto: las reuniones del mail las crea el sistema (Origen fila = "sistema
    (agenda)", celdas en azul claro); si falta un dato, se completa en la fila que existe, no
    se carga otra; lo que corrijan, el sistema no lo vuelve a tocar (y queda en "Tocado por el
    equipo"); si una fila sobra, se borra y el sistema no la recrea; si el sistema duda,
    pregunta en AGENDA_DUPLICADOS; el texto completo del mail está en "Evento (mail)",
    "Lugar (mail)", "Dirección (mail)" y "Marcas (mail)".

## E. Tests y predicción

12. Tests en Node: forma del equipo reproducida; nada del mail se pierde (columnas mail);
    Origen fila y Tocado por el equipo; casi duplicado no crea y pregunta; duplicado posterior
    se lista; fila borrada no se recrea; reaparición tras desaparecer sí se crea.
13. Predicción para `semana()` (sólo 05/10–10/10): CREAR 9, VINCULAR 0, AGENDA_DUPLICADOS
    vacía, Origen fila "sistema (agenda)" en las 9, "Tocado por el equipo" vacío. Dejala en
    ESTADO antes de que el usuario corra.
