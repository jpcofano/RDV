# Prompt para Code — Agenda, etapa 1: medición (sólo lectura)

**Proyecto:** RDV (Reuniones de Vecinos) — repo `jpcofano/RDV`
**Etapa:** Agenda, etapa 1 (medir antes de construir)
**Fecha:** 05/10/2026

---

Nueva etapa: AGENDA. Primero se mide; no se escribe nada en el destino. Todo lo de esta etapa
es sólo lectura (salvo solapas de diagnóstico en la intermedia).

## Contexto (lo que ya sabemos, del análisis de DIAG_MAILS: 376 mails, 09/2025–10/2026)

- Mails semanales: asunto "Agenda Encuentros de vecinos con {GRUPO} - Semana del DD/MM al
  DD/MM". Grupos: "CM y Ministros", "JM", "CM, LA y Ministros". Remitente casi siempre Ivan
  Rosales. Son mails separados (no respuestas en un hilo): por semana y grupo llegan de 1 a 10
  versiones, muchas con "Actualizo:". VALE LA ÚLTIMA VERSIÓN.
- Cuerpo muy estable: encabezado de día ("*Martes 29/09*") y por reunión tres líneas
  "Evento:", "Hora:", "Lugar:" (2538 eventos, 100% con día).
- Evento: "<tipo> <figura(s)> [(NO PARTICIPA)], <comuna | eje | barrio> [(marcas)]".
  Tipos: "Encuentro con Vecinos", "Encuentro "1 a 1"", "Encuentro Temático", "Primera
  Persona", "Seguridad en tu Barrio". Marcas: "SOLO SE COMUNICA POR REDES", "A CONFIRMAR",
  "NO SE COMUNICA LA DIRECCIÓN".
- Lugar del evento: desde 11/2025 casi siempre "Comuna N" (1723), eje (139), barrio (647,
  sobre todo JM). El barrio lo termina poniendo el equipo.
- Lugar: "calle número, nombre del lugar" o "A CONFIRMAR (NO SE COMUNICA LA DIRECCIÓN)".

## Reglas de negocio confirmadas por el usuario

1. Cada reunión de la última versión del mail es una fila del destino.
2. "NO PARTICIPA": la reunión SE HACE igual y tiene fila a nombre de esa figura (63 de 66 con
   fila y "Realizada" en 6 meses). El legado las descartaba: es un bug. Los nombres que no
   participan van a una COLUMNA NUEVA "No participa" en el destino.
3. Reunión conjunta (Lombardi, Tapia, Arengo Piragine): UNA sola fila, a nombre de la primera
   figura nombrada (verificar contra el destino).
4. "Seguridad en tu Barrio" (desde 09/2026) viene SIN figura: la figura sale de RDV CONJUNTO,
   cruzando por FECHA + BARRIO (cuando RDV CONJUNTO se actualiza, se completa la figura en el
   destino).
5. El barrio sale de la DIRECCIÓN. Si en una versión nueva cambia la dirección, el barrio se
   recalcula (sólo si el barrio lo puso el sistema y nadie lo corrigió).
6. Una reunión que desaparece de la última versión no se borra: se avisa (posible
   cancelación o reprogramación).
7. Cambios de hora o dirección entre versiones se actualizan mientras la fila está "en agenda".

## Lo que hay que hacer en esta etapa

0. CÓDIGO VIEJO DEL BARRIO: bajar con `clasp clone 1Q3g6srkd4kHn-zfIaGMYi7pi96KXkcTMX21QKLZrjMxxH87OqIfL2pn8`
   (proyecto de Apps Script de la planilla "CODIGOS Ajuste RDV") a una carpeta aparte,
   `_externo/codigos-ajuste-rdv/`, sin tocar ese proyecto. Contame qué hace: cómo saca el
   barrio de la dirección (¿Maps.newGeocoder?, ¿tabla de calles?, ¿texto?), qué quedó a medio
   hacer y qué sirve.

1. PARSER NUEVO (pasoN_parsearAgendaMails, sólo lectura): lee los mails (desde DIAG_MAILS para
   esta etapa; en producción, GmailApp), arma una solapa AGENDA_MAIL en la intermedia con una
   fila por reunión de la ÚLTIMA versión de cada semana+grupo: fecha (año inferido de la fecha
   del mail, cuidando dic→ene), hora, tipo, figuras participantes, figuras "no participa",
   conjunta sí/no, lugar (comuna / eje / barrio), dirección, marcas, mail y versión de origen,
   y si cambió hora/dirección/lugar respecto de la versión anterior. Tolerancia de nombres
   (variantes: "Maxiliano Piñeiro", "Baistocchi") usando las figuras del destino. Aparte: las
   reuniones que DESAPARECEN en la última versión de su semana.

2. CRUCE CONTRA EL DESTINO, últimos 6 meses (sólo lectura). Predicción, del análisis previo:
   ~307 reuniones del mail; ~268 con fila (87%); 39 sin fila = 16 conjuntas (una fila por
   reunión), 16 reprogramadas (fila a ±2 días), 5 desaparecidas (canceladas), 2 sin explicar;
   ~23 filas del destino sin reunión en el mail, casi todas jueves de 09/2026 ("Seguridad en
   tu Barrio" sin figura). Reportá cada grupo con ejemplos y si coincide la predicción.

3. BARRIO DESDE LA DIRECCIÓN (medición de precisión, sólo lectura): para las filas del destino
   que tienen Dirección y Barrio cargados por el equipo, calcular el barrio desde la dirección
   y comparar. Propuesta: Maps.newGeocoder() con "calle número, Ciudad Autónoma de Buenos
   Aires" → lat/lng → barrio por punto-en-polígono con los límites oficiales de los barrios de
   CABA (GeoJSON de data.buenosaires.gob.ar, embebido en el proyecto). Reportá: % de acierto
   exacto, % de fallas de geocodificación, ejemplos de errores, cuántas direcciones son
   "A CONFIRMAR" o vacías, y la cuota de Maps usada. Si el código viejo (punto 0) hace algo
   mejor, medilo también y compará.

4. SEGURIDAD EN TU BARRIO CONTRA RDV CONJUNTO (sólo lectura): para las reuniones del mail sin
   figura, cruzar con RDV CONJUNTO por fecha + barrio (o comuna) y ver si sale UNA figura.
   Contar: resuelve 1, ambiguas (2+), sin fila en RDV CONJUNTO. Comparar contra la figura que
   tiene hoy el destino.

5. COLUMNA "No participa": proponé dónde va en el destino (al final, junto a la traza o donde
   corresponda) y medí cuántas filas de los últimos 6 meses la tendrían.

6. Documentá todo en ESTADO (sección Agenda) y en docs/agenda-legado.md (corregí lo de
   "NO PARTICIPA": no es "no se hace"). Con la predicción escrita antes de cada corrida.
   Nada se escribe en el destino en esta etapa.
