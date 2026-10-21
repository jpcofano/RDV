# Prompt para Code — El guardián aplicado, "lo viejo se deja como está" y el cierre de la Agenda

**Proyecto:** RDV — repo `jpcofano/RDV` (rama `migracion`)
**Guardar como:** `docs/prompts/PROMPT-10-GUARDIAN-Y-CIERRE.md`
**Fecha:** 20/10/2026

## Estado

- **c01 (corregir la 824): LISTO.** Fuera de la 824 no cambia ninguna celda de la base. Los cambios de Looker son todos "por la corrección": la 824 pasa a Villa Santa Rita Reprogramada, y en el máximo de Villa Devoto del 15/10 queda Horacio Giménez (29). El usuario corre c02, c03 y c04.
- **Decisiones del usuario:**
  1. **"Lo viejo se deja como está; trabajamos hacia adelante."** No se corrigen las 22 filas viejas de edades (dic/2025–ene/2026), los IDS_SIN_CRUZAR históricos, las fichas viejas de REVISAR_MATCH (778, 787, 813) ni las 3 reuniones viejas "hechas sin fila" (Muzzio 29/07 y 14/08, Sánchez Zinny 12/08).
  2. **El guardián tiene que quedar aplicado.**

## Reglas para todo

1. Todo lo que escribe: seco, huella y deshacer. Interruptores apagados hasta que el usuario vea el seco.
2. No cambiar el comportamiento de lo que ya anda.
3. Cada paso que tenga que correr el usuario va en `00_Correr.js`, numerado y en orden, diciendo si escribe o es sólo lectura. Lo que ya se corrió sale de `00_Correr.js`.
4. Tests, push y clasp push, y verificar el remoto.

---

## 1) El guardián, aplicado y al día

El guardián existe (`46_Guardian.js`, `GUARDIAN_ACTIVO = false`), pero nunca corrió: el paso 67 muestra 0 corridas de "guardian" y "guardian_copia". Además, SISTEMA_COPIA quedó vieja (termina en la fila 830). Desde que se diseñó cambiaron muchas cosas, y tiene que convivir con todas: las columnas de la agenda, las fusiones y correcciones (pasos 97 y c02), el orden de la base al principio de la corrida, las suspensiones y reprogramaciones del sistema, "Tocado por el equipo" y la regla "manda el mail".

### 1a) Tres clases de columnas (mostrame la lista antes de prender nada)

- **A. Del sistema, puras:** las escribe sólo el sistema y el equipo no tiene por qué tocarlas. Traza (`RDV_UID`, `form_*`), `agenda_uid`, `agenda_mail`, `agenda_version`, `agenda_*_escrita`, `agenda_status_escrito`, `Origen fila`, `Tocado por el equipo`, las columnas del mail (Evento, Lugar, Dirección y Marcas (mail)), `Conjunta con`, `No participa`, `ID cuentas`, `Fecha envío campañas` y las derivadas (Día de la semana, % de Asistencia, Direccion2, Falta Informacion, Comuna, Poblacion, p. Mujer, P. Varon, (km2), (hab/km2), Zona, ID). Completá la lista con lo que haya hoy en el código.
  - **Protegidas con advertencia** (el equipo ve el aviso, pero puede seguir).
  - Las **técnicas se ocultan**: las 14 de la traza y de `agenda_*`.
  - **El guardián las restaura** si alguien las cambió.
- **B. Datos que escribe el sistema pero el equipo puede corregir:** Figura, FECHA, HORA, Barrio, Dirección, EVENTO, STATUS REUNIÓN, Asistentes, Oradores, Inscriptos y canales. El guardián **no las restaura**: la corrección del equipo vale y queda anotada en "Tocado por el equipo", como hoy.
- **C. Del equipo:** el guardián y el sistema nunca las tocan.

### 1b) Seguridad del guardián

- **La copia, al día:** SISTEMA_COPIA se actualiza después de **toda** escritura del sistema (la corrida de la hora, las fusiones, las correcciones como la del c02, deshacer, el orden), así el guardián nunca "restaura" algo que cambió el propio sistema. Todo por clave (`agenda_uid`, `RDV_UID`, huella), nunca por número de fila.
- **Filas borradas por el equipo:** se respetan (la copia las da de baja), como dice el diseño.
- **Desalineación** (alguien ordenó sólo algunas columnas, o pegó corrido): el guardián **no la arregla moviendo datos**. Si la detecta, **en esa corrida no se escribe nada en la base**, y avisa por mail y en AGENDA_PENDIENTES con qué filas y columnas no cierran. La corrida siguiente vuelve a mirar.
- **Primero sólo avisa:** `GUARDIAN_MODO = 'avisar'` (detecta y reporta, no restaura) durante unos días. Después, con el OK del usuario, `'restaurar'`.
- **Va primero** en la corrida, antes del orden de la base. Si el guardián avisa una desalineación, el orden tampoco corre.

### 1c) Pasos para `00_Correr.js`

1. `c2x_guardian_enSeco`: sólo lectura. Con la base de hoy y una copia nueva (en memoria), qué restauraría o avisaría. Hoy tiene que dar 0 o sólo cosas reales; mostrámelas.
2. `c2x_guardian_copiaNueva`: escribe **sólo** SISTEMA_COPIA, la copia de hoy.
3. `c2x_ocultarProteger_enSeco` → `c2x_ocultarProteger` (escribe) → `c2x_deshacerOcultarProteger`. Qué columnas se ocultan y cuáles se protegen con advertencia. Lo que tenía protegido el equipo no se toca.
4. Después, el usuario te avisa y prendés `GUARDIAN_ACTIVO = true` con `GUARDIAN_MODO = 'avisar'`. Tras unos días sin avisos falsos, `'restaurar'`.
- Tests: que el sistema siga pudiendo escribir con las protecciones puestas; que un cambio del equipo en una columna B no se restaure; que uno en una columna A se avise (modo avisar) o se restaure (modo restaurar); que una desalineación frene la escritura; y que el orden de la base y la fusión no disparen falsos avisos.
- Actualizá la GUÍA y la LEER: qué columnas puede tocar el equipo, qué pasa si toca una protegida, y que no se ordena una sola columna.

## 2) "Lo viejo se deja como está": que no se reporte más

- Escribí la decisión en CLAUDE.md y en `docs/ESTADO.md`, con la lista de lo que no se toca (las 22 filas de edades, los IDS_SIN_CRUZAR históricos, las fichas viejas 778, 787 y 813, y las 3 reuniones "hechas sin fila" viejas).
- **Hacia adelante:** que las solapas de revisión (REVISAR_MATCH y las fichas, SIN_MATCH, EMPAREJAR_MANUAL, HISTORICO_SIN_RESOLVER, IDS_SIN_CRUZAR, el aviso de "hechas sin fila") muestren sólo lo de una **fecha de corte** en adelante (`FECHA_CORTE_REVISION`, que propongo en el **06/10/2026**, el inicio de la agenda). Lo anterior no se borra de los datos: deja de aparecer para revisar.
- Seco: qué líneas dejarían de aparecer en cada solapa, y que no desaparezca nada posterior a la fecha de corte.
- Interruptor apagado hasta ver el seco.

## 3) El cierre de la Agenda: dejarlo preparado

Dejá todo listo para que el usuario sólo corra pasos y te dé OK:

- **`BASE_ORDEN_POR_FECHA`:** lo prendés cuando el usuario te confirme que el c04 y una corrida de la hora salieron bien.
- **`AGENDA_REPROGRAMADA`:** lo prendés cuando el usuario mire el c13 y te dé OK.
- **Etapa 2**, preparada en `00_Correr.js` en este orden, con los interruptores apagados:
  1. "Agenda (mail)" con el formato de "Agenda Directa": el seco del paso 74 (qué copiaría del equipo), el real, y después prendés `AGENDA_MAIL_FORMATO_DIRECTA`.
  2. Los avisos por mail: prendés `AVISOS_MAIL_ACTIVO` y el usuario corre el paso 80 (mail de prueba a jpcofano2@gmail.com).
  3. La auditoría de los lunes: prendés `AUDITORIA_SEMANAL_ACTIVA` y el usuario corre el paso 82 (el activador).
- Sacá de `00_Correr.js` lo que ya se corrió: c01 y c02 después del c02; c03 y c04 después del c04.

---

## Qué me tenés que devolver

1. La lista de columnas A, B y C (punto 1a), para que el usuario la apruebe antes de proteger y ocultar.
2. Cómo quedó `00_Correr.js`: los pasos nuevos del guardián, del punto 2 y de la etapa 2, en orden.
3. Qué interruptores quedan esperando, y qué OK necesita cada uno.
4. Tests, push, clasp push y remoto verificado.
5. Guardá este prompt en `docs/prompts/PROMPT-10-GUARDIAN-Y-CIERRE.md`.
