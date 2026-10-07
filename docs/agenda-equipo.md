# La agenda: qué hace el sistema y qué cargan ustedes

Desde que se prende la agenda, el sistema lee los mails semanales de agenda ("Agenda Encuentros de vecinos con …") y
mantiene al día las filas de la planilla **"RVD JM-CM - ES"**. Esta página dice qué hace solo, qué no toca nunca y qué
les queda para cargar a ustedes.

## Qué hace el sistema, solo

- **Crea la fila de cada reunión** de la semana cuando llega el mail, **al final** de la planilla: Figura, EVENTO,
  FECHA, HORA, Dirección (la línea "Lugar:" del mail, tal cual, también si dice "A CONFIRMAR"), STATUS "en agenda", y
  el Barrio sólo cuando está seguro (abajo). El EVENTO, como lo escriben ustedes ("Encuentro con Vecinos", "Uno a uno",
  'Encuentro Temático "Salud"', 'Encuentro "Primera Persona" con …'; "Seguridad en tu Barrio" va como "Encuentro con
  Vecinos", con la Figura vacía hasta que se sepa).
- **No duplica.** Si ya hay una fila de esa figura ese día (porque la cargaron ustedes), la usa: completa sólo lo que
  esté vacío y no toca lo que ya cargaron.
- **Sigue los cambios del mail** ("Actualizo:"): hora, dirección y, si cambió la dirección, el barrio. Sólo mientras la
  reunión está "en agenda".
- **Si la reunión se pasa a otro día de la misma semana**, mueve la fecha de la fila (no crea otra).
- **Si una reunión que todavía no pasó desaparece del mail**: si la fila la había creado el sistema y nadie le cargó ni
  le cambió nada, **la borra** (si la reunión vuelve a aparecer, la crea de nuevo); si no, la pone en **"Suspendida"**. Si vuelve a aparecer, la
  vuelve a "en agenda". Si un "Actualizo:" trae mucho menos que el anterior (menos del 60%), no suspende nada: puede ser
  un mail con sólo los cambios.
- **"NO PARTICIPA"**: la reunión se hace igual y tiene su fila a nombre de esa figura; los nombres que no participan
  van a la columna **"No participa"**.
- **Reunión conjunta** (varias figuras): una sola fila, a nombre de la primera que nombra el mail.
- **"Seguridad en tu Barrio"** viene sin figura: la fila se crea sin Figura y el sistema la completa cuando la reunión
  aparece en RDV CONJUNTO (por fecha y barrio).
- **Todo lo que escribe el sistema queda en celeste** (#CFE2F3), para que se vea de un vistazo.
- **Una copia de toda la agenda** queda en el archivo **"Agenda"**: una fila por reunión, con su estado (vigente,
  reprogramada, desaparecida), qué cambió, el barrio que calculó (o por qué no), la fila de la planilla y su STATUS. **No
  se edita a mano**: se reescribe en cada corrida. Lo que haya que corregir, se corrige en la planilla.

## Lo que el sistema NO toca nunca

- **Una celda que ustedes cambiaron.** Si el sistema escribió una hora y alguien la corrigió, esa celda es de ustedes
  para siempre: aunque el mail cambie, el sistema no la vuelve a tocar.
- Inscriptos, canales, asistentes, temas, síntesis, observaciones: nada de eso lo toca la agenda.
- Una reunión que no está "en agenda" (ya Realizada, Reprogramada, o Suspendida por ustedes): no se actualiza.

## Lo que cargan ustedes

1. **El Barrio, cuando queda vacío.** El sistema lo saca de la dirección **sólo si está seguro**: la dirección se ubicó
   con precisión, el barrio cae en la comuna que dice el mail y no está a menos de 100 m de otro barrio. Si no, lo deja
   vacío. En el archivo "Agenda", la columna **"Sin barrio porque"** dice por qué (A CONFIRMAR, cerca del límite, el mail
   trae eje, otra comuna que la del mail…).
2. **La Figura de una "Seguridad en tu Barrio"** cuando RDV CONJUNTO todavía no la tiene, o tiene dos posibles para ese
   día y barrio. La lista está en la solapa **AGENDA_FIGURA_A_COMPLETAR** (base intermedia). Se carga directo en la fila
   de la planilla; el sistema no la vuelve a tocar.
3. Todo lo de siempre (inscriptos si faltan, asistentes, temas, síntesis…), como hasta ahora.

## Si algo no está como dice el mail

Corríjanlo en la planilla. El sistema respeta lo que cargan. Si una corrida escribió algo mal en muchas filas, se puede
**deshacer** la última corrida (lo corre quien mantiene el sistema): saca las filas que creó, si nadie les cargó nada, y
vuelve atrás lo que cambió, salvo lo que ustedes hayan tocado después.

## Casos para revisar

- **Jorge Macri, 01/10, "1 a 1", Belgrano** (07/10): el mail la trae y hoy no tiene fila (la agenda la crearía). Hay un
  formulario sin fila, "Jueves 1/10 Belgrano", con 2 inscriptos. Y la fila de Macri del 29/09 está "Suspendida": puede ser
  **la misma reunión antes de moverse** al 01/10. Si es así, conviene corregir la fila del 29/09 (fecha 01/10, STATUS) en
  vez de dejar que se cree otra; si son dos reuniones distintas, no hay que hacer nada.
