# Prompt para Code — Agenda, etapa 2: crear y actualizar filas en el destino

**Proyecto:** RDV (Reuniones de Vecinos) — repo `jpcofano/RDV`
**Etapa:** Agenda, etapa 2 (construcción)
**Fecha:** 06/10/2026
**Guardar como:** `docs/prompts/PROMPT-06-AGENDA-ETAPA2-CREAR-ACTUALIZAR.md`

---

## Contexto

La etapa 1 (medición) quedó cerrada con la segunda corrida (06/10, 20:47):
- reuniones del mail con su fila: 280/302 (92,7%); reprogramadas 3; filas del destino sin
  reunión en el mail: 0; fechas corregidas 26; mails afuera 1.
- desaparecidas de la última versión que tienen fila: 9, las 9 "Suspendida".
- NO PARTICIPA: 74 reuniones, todas con fila y "Realizada".
- conjuntas: 8 de 9 a nombre de la 1ª figura nombrada.
- Seguridad en tu Barrio contra RDV CONJUNTO: 13/16 resuelven (13 iguales al destino).
- barrio por polígono: 93,3% exacto general; con la regla de confianza 95,7% (201/210). De
  los 9 distintos: 6 son barrios vecinos de la misma comuna (borde) y en 3 el barrio del
  sistema coincide con la comuna del mail y el del equipo no.

**IMPORTANTE: la copia "AAA NOBORRAR" ya NO EXISTE (el usuario la borró).** Todo se hace
directo sobre el destino real "RVD JM-CM - ES", con estas protecciones:
- antes de cada primera escritura, el usuario le pone nombre a la versión del archivo;
- todo paso nuevo tiene versión EN SECO (no escribe) y se corre primero así;
- la primera corrida real se limita a UNA semana (constante AGENDA_SOLO_SEMANA) y recién
  después se abre a todo el alcance;
- hay un paso para DESHACER lo que escribió una corrida de agenda (ver punto 11).
Sacá del código y de la documentación toda referencia operativa a "AAA NOBORRAR" (constantes,
PASO_DERIVADAS_SOLAPA, arnés de tests: los tests de Node siguen usando una hoja simulada).

## Decisiones del usuario (las diez, confirmadas)

1. FUENTE: Gmail, etiqueta "GCBA/Encuentros Con Vecinos". Por semana + grupo vale la ÚLTIMA
   versión. Reusar el parser de la etapa 1 (con las correcciones de fecha, asuntos, tipos y
   tolerancia de nombres). DIAG_MAILS queda sólo para diagnóstico.

2. ALCANCE: reuniones con fecha desde hoy − DIAS_ACTIVOS (30) en adelante. No se rellena el
   histórico. DATO DEL USUARIO: cada mail trae SÓLO la agenda de la semana en curso (no hay
   planificación de semanas siguientes). O sea: las filas se crean cuando llega el primer mail
   de la semana y se ajustan con las versiones de esa misma semana; una semana ya terminada no
   cambia más. Las reuniones viejas del mail sin fila (Sánchez Zinny 06/04/2026 San Cristóbal,
   Ricardes 12/06/2026 Comuna 2) se listan en una solapa informativa, no se crean.

3. FILA NUEVA, al final del destino (append, nunca insertada en el medio):
   - Figura: la 1ª nombrada si es conjunta; VACÍA si es "Seguridad en tu Barrio".
   - EVENTO: el tipo normalizado ("Encuentro con Vecinos", "Uno a uno", "Encuentro Temático
     …", "Primera Persona …", "Café con Vecinos", "Seguridad en tu Barrio"). Mirá cómo lo
     escribe hoy el equipo en el destino y usá esas mismas formas.
   - FECHA, HORA, Dirección (la del mail; si es "A CONFIRMAR…", tal cual).
   - STATUS REUNIÓN: "en agenda".
   - Barrio: sólo si cumple la REGLA DE CONFIANZA (punto 12); si no, vacío para el equipo.
   - Columna nueva "No participa" (al final del destino, después de form_clave): los nombres,
     separados por " / ".
   - Traza nueva (al final): agenda_uid, agenda_mail (asunto + fecha del mail), agenda_version,
     agenda_hora_escrita, agenda_direccion_escrita, agenda_barrio_escrito (lo que escribió el
     sistema, para saber después si alguien lo cambió).
   - Todo lo que escribe el sistema en #CFE2F3. Las 11 derivadas se recalculan en la misma
     corrida.

4. SIN DUPLICADOS: antes de crear, buscar fila con la misma figura + fecha (o, si no tiene
   figura, misma fecha + barrio/comuna). Si existe, se VINCULA (se le estampa agenda_uid y se
   completan sólo celdas vacías) y no se crea otra. Si hay 2+ candidatas, no se hace nada y se
   lista.

5. ACTUALIZACIONES: sólo en filas con STATUS "en agenda" y sólo si la celda todavía tiene lo
   que escribió el sistema (comparar contra agenda_*_escrita). Se actualizan HORA, Dirección y,
   si cambió la dirección, Barrio (con la misma regla de confianza). Si alguien del equipo
   cambió la celda, no se toca nunca más (y se registra "editada por el equipo").

6. REPROGRAMACIÓN: si una reunión desaparece de una fecha y la misma figura aparece en otra
   fecha de la misma semana en la última versión, se MUEVE la fecha de la fila (sólo si está
   "en agenda" y la FECHA no fue editada por el equipo). No se crea una segunda fila.
   Registrar fecha anterior → nueva.
   ENTRE SEMANAS: como cada mail trae sólo su semana, una reunión pasada a la semana siguiente
   desaparece de esta semana y aparece en el mail de la próxima. Medí en el histórico
   (DIAG_MAILS / AGENDA_MAIL) cuántas veces pasa: desaparecida sin reprogramar dentro de su
   semana + la misma figura en el mail de la semana siguiente (a ≤ 7 días). Por defecto: la
   fila vieja queda "Suspendida" (regla 7), la nueva se crea, y el par se lista como "posible
   reprogramación entre semanas". Si es frecuente, proponé vincularlas en vez de crear otra.

7. CANCELACIÓN: si desaparece sin reprogramarse y la fila está "en agenda", pasa a
   "Suspendida" (en #CFE2F3). PROTECCIÓN: si la última versión del mail trae menos del 60% de
   las reuniones de la versión anterior, NO se suspende nada y se avisa. Si la reunión vuelve
   a aparecer en una versión posterior, la fila vuelve a "en agenda" (sólo si el "Suspendida"
   lo puso el sistema).
   SÓLO CUENTA COMO DESAPARECIDA si la reunión todavía era FUTURA cuando se mandó la versión
   que la dejó afuera (fecha de la reunión ≥ fecha del mail de esa versión). Si un
   "Actualizo:" de mitad de semana ya no lista los días que pasaron, eso NO es una
   cancelación: esas reuniones no se suspenden. Medí en el histórico cuántas de las 24
   desaparecidas de la ventana caen en cada caso (futura al desaparecer / ya pasada) y
   comparalo con el STATUS del destino.

8. SEGURIDAD EN TU BARRIO: la fila se crea sin figura. Cuando RDV CONJUNTO tiene la fila,
   se completa la Figura cruzando por fecha + barrio (o comuna), como en el paso 32. Si es
   ambigua, va a una ficha en REVISAR_MATCH (con el mismo formato y ELEGIR) o, si es más
   simple, a una solapa propia de "figura a completar"; proponé cuál.

9. CUÁNDO CORRE: dentro del activador de cada hora (upsertDiario), ANTES del cruce con los
   formularios. Constante AGENDA_ACTIVA = false hasta que el usuario la prenda. Lee Gmail con
   la etiqueta; si la búsqueda falla, no escribe nada y avisa.

10. EN EL DESTINO REAL, con las protecciones de arriba (versión con nombre, en seco, una
    semana primero, deshacer).

## Además

11. DESHACER (pasoN_deshacerAgenda): borra las filas CREADAS por una corrida de agenda
    (identificadas por agenda_uid + la corrida en REGISTRO_AGENDA) y revierte las
    actualizaciones (hora, dirección, barrio, fecha, STATUS) a lo que había antes, que queda
    guardado en REGISTRO_AGENDA. En seco primero. Sólo si nadie editó esas filas después.

12. REGLA DE CONFIANZA DEL BARRIO, con margen de borde: escribir el barrio sólo si
    (a) la geocodificación es "ok", (b) el barrio del polígono cae en la misma comuna que trae
    el mail (o es el barrio que trae el mail), (c) el punto está a más de BARRIO_MARGEN_M
    (100 m) de cualquier otro barrio, y (d) la celda está vacía. Antes de usarla: medila sobre
    las 260 filas del paso 31 (cuántas cumplen y % exacto); predicción ~98–99% exacto, con
    menos cobertura que el 80,8% actual.

13. REGISTRO_AGENDA (intermedia): una fila por corrida: mails leídos, reuniones, creadas,
    vinculadas, actualizadas (por columna), reprogramadas, suspendidas, reactivadas,
    ambiguas, saltadas por la protección del 60%, y los valores anteriores de todo lo que se
    cambió (para deshacer).

14. CONTROLES: el paso 16 suma "filas de agenda": duplicados figura+fecha (tiene que dar 0),
    filas "en agenda" con fecha pasada hace más de 2 días (aviso), y celdas editadas por el
    equipo (informativo). El paso 20 suma causas de "por qué está vacía" para Barrio y Figura
    (regla de confianza no cumplida, Seguridad sin figura todavía).

15. TESTS en Node: crear, vincular sin duplicar, actualizar sólo lo del sistema, no tocar lo
    editado, reprogramar, suspender y reactivar, la protección del 60%, Seguridad sin figura,
    deshacer.

16. DOCUMENTACIÓN: ESTADO (sección Agenda, con la predicción antes de cada corrida),
    CLAUDE.md (decisiones de Agenda y columnas nuevas), docs/agenda-legado.md (qué reemplaza),
    y una página para el equipo: qué hace el sistema con la agenda y qué tienen que cargar
    ellos (barrio cuando queda vacío, figura de Seguridad ambigua).

## Secuencia de corridas para el usuario (dejala en ESTADO y en la cabecera de 99_Correr.js)

1. Versión con nombre del destino.
2. pasoN_medirReglaBarrio (punto 12) → aprobar el margen.
3. pasoN_agenda_enSeco con AGENDA_SOLO_SEMANA = la semana en curso → revisar qué crearía,
   vincularía, actualizaría, reprogramaría y suspendería.
4. pasoN_agenda (real) sólo esa semana → paso 16 → mirar las filas en la planilla.
5. Abrir el alcance (AGENDA_SOLO_SEMANA = null): en seco → real → paso 16.
6. AGENDA_ACTIVA = true (entra al activador de cada hora).
