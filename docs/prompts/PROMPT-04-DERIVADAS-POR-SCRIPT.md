# Prompt para Code — Derivadas del destino por Apps Script

**Proyecto:** RDV (Reuniones de Vecinos) — repo `jpcofano/RDV`, rama `migracion`
**Etapa:** antes de Agenda
**Fecha:** 04/10/2026

---

Nueva etapa antes de Agenda (decisión del usuario): reemplazar por Apps Script SÓLO las 11
derivadas del destino, hoy ARRAYFORMULA en la fila 1: Día de la semana, % de Asistencia,
Direccion2, Falta Informacion, Comuna, Poblacion, p. Mujer, P. Varon, (km2), (hab/km2), Zona.
Ninguna otra fórmula se toca (B, intermedia y otras solapas quedan como están).

1. Respaldo: guardá el texto exacto de las 11 fórmulas (el que muestra el paso 14) en
   docs/formulas-respaldo.md, con la columna, para poder volver atrás.

2. Cálculo por script, con la misma lógica que la fórmula de hoy, exacta:
   - Día de la semana = TEXT(FECHA; "dddd") en castellano, como la planilla.
   - % de Asistencia = Asistentes / Inscriptos (vacío si Inscriptos vacío o error).
   - Direccion2 = Dirección & ", Buenos Aires, Argentina" (vacío si Dirección vacía).
   - Falta Informacion = "No" si Inscriptos tiene dato; vacío si no (igual que hoy).
   - Comuna, Poblacion, p. Mujer, P. Varon, (km2), (hab/km2), Zona = VLOOKUP del Barrio en
     Comunas (mismas columnas: 2, 3, 4, 5, 6, 7, 8); vacío si el barrio no está.
   Se recalculan en cada corrida del upsert, en TODAS las filas (no sólo 30 días), y se
   sobrescriben: son columnas del sistema. En lote, sin color, sólo donde el valor cambió.
   Protección con advertencia sobre esas 11 columnas.
   Constante DERIVADAS_POR_SCRIPT = false hasta validar.

3. Validación en "AAA NOBORRAR" (pasoN_compararDerivadas, sólo lectura): calcula por script y
   compara con lo que muestran las fórmulas, en las 810 filas, por columna (iguales /
   distintas, con las 10 primeras distintas). Tiene que dar 0 distintas. Ojo con el formato:
   % como número (no texto), día de la semana con el mismo idioma y mayúsculas, números de
   Comunas sin redondeo.

4. Cambio, sólo después de 0 distintas:
   a) pasoN_quitarFormulasDerivadas(solapa): borra las 11 ARRAYFORMULA de la fila 1, deja el
      encabezado como texto, y escribe los valores por script en la misma corrida (que no
      quede ni un momento la columna vacía). En seco primero.
   b) Primero en la copia: quitar, prender DERIVADAS_POR_SCRIPT, upsert, paso 14 (tiene que
      decir "valores = Comunas" aunque ya no haya fórmula; adaptá el paso 14 para eso).
   c) Después en el real, con la misma secuencia y la predicción escrita antes.
   d) Volver atrás: un paso que restaura las 11 fórmulas desde el respaldo.

5. Recalcular al editar (barrio, fecha, inscriptos o asistentes): por ahora NO; sólo en la
   corrida de cada hora. Dejá anotado en ESTADO que se puede agregar un activador de edición
   si el equipo lo necesita.

6. ESTADO: esta etapa como "antes de Agenda", con la predicción escrita antes de cada corrida.

---

## Contexto (para quien lo lea después)

- La migración al destino real se cerró el 04/10/2026: 757 filas con `RDV_UID`, invariante 0,
  0 incompletas en todo el destino, `Barrio` sin subir (línea de base 0).
- Cierre pendiente de la etapa anterior: `paso23_listarActivadores()` (0 para borrar),
  `upsertDestino()` normal (nada para escribir), paso 19 (repintar el azul viejo, sin
  `Semaforo politico`) y `paso24_instalarActivadorCadaHora()`.
- Después de esta etapa: proceso de Agenda.
