# La agenda: qué hace el sistema y qué cargan ustedes

> Versión corta: solapa GUÍA del archivo de la base.

> **En corto.** Las reuniones del mail las crea el sistema (columna **"Origen fila"** = "sistema (agenda)", celdas en
> celeste). **No carguen una fila nueva para una reunión que ya está: completen la que existe.** Lo que corrijan se
> respeta y queda anotado en **"Tocado por el equipo"**. Si una fila sobra, **bórrenla: el sistema no la vuelve a
> crear.** Si el sistema duda, pregunta en la solapa **AGENDA_DUPLICADOS**: ahí está **sólo lo que ustedes tienen que
> decidir**. Lo que es para saber (una semana frenada, una reunión juntada, una cancelación aplicada, una reunión por
> definir) está en **AGENDA_PENDIENTES** (base intermedia). El texto completo del mail queda en las columnas **"(mail)"**,
> al final.

## AGENDA_DUPLICADOS: sólo lo que hay que decidir (16/10)

- **Cada línea pide una decisión** en **ELEGIR** (la única columna, con **COMENTARIO**, donde se puede escribir). Se aplica
  en la corrida siguiente (cada hora) y la línea se va. No hay líneas "informativas".
- **Una reunión en dos filas** (la misma reunión cargada dos veces: la misma figura el mismo día, o la misma Seguridad en tu
  Barrio; o una fila de ustedes parecida a una que creó la agenda): **una línea por par**, con las dos filas, y en ELEGIR:
  - *"Quedarse con la fila X"*: el sistema completa la fila X con lo de la otra **sólo donde la X está vacía o tiene lo que
    escribió el sistema** (lo que ustedes cargaron en la X no se toca) y **borra la otra, si la creó la agenda**: queda
    guardada entera en el registro de la agenda y se puede deshacer (lo corre quien mantiene el sistema). La agenda no la
    vuelve a crear. **Si la otra la cargaron ustedes, el sistema NO la borra ni le copia nada**: queda en AGENDA_PENDIENTES
    como *"la que sobra: borrarla a mano"*, y mientras tanto ya no frena nada. **Si la otra tiene datos cargados por ustedes
    distintos de la X** (un STATUS, asistentes, inscriptos, un ID…), tampoco se borra: queda en AGENDA_PENDIENTES como *"decisión
    del equipo sin aplicar"*, para borrarla a mano o corregir esos datos. Sólo se descarta lo que había escrito el sistema.
    La decisión se aplica **una vez**: si después se deshace, el par vuelve a aparecer con ELEGIR vacío, y pueden elegir de
    nuevo o cambiar de idea;
  - *"Quedarse con la fila Y"*: lo mismo, al revés;
  - *"Son reuniones distintas"*: no se vuelve a preguntar, y esa semana la agenda sigue creando reuniones normalmente.
  - El sistema reconoce cada fila por su identidad (no por el número de fila): aunque ordenen o borren filas en el medio, la
    decisión vale. Si a una fila de ustedes le cambian la figura, la fecha o el barrio a otra comuna, el par puede volver a
    aparecer.
- **Próximamente (apagado: `AGENDA_FUSION_AUTOMATICA`)**: si las dos filas las creó la agenda, son del mismo día, el mismo
  "Lugar (mail)" y el mismo tipo, las dos están "en agenda" y no tienen datos distintos, el sistema **las junta solo** (se
  queda la más vieja) y lo anota en AGENDA_PENDIENTES (*"juntada sola"*). Lo que no puede juntar solo, se pregunta acá.

## AGENDA_PENDIENTES: lo que hay que saber (base intermedia)

Una línea por cosa, con su **tipo**: *pendiente de definir* (una Seguridad sin figura ni dirección: todavía no tiene fila),
*cancelada en el mail: no se crea*, *semana frenada: una reunión en dos filas* (hasta que decidan en AGENDA_DUPLICADOS),
*cancelación aplicada (Suspendida)*, *juntada sola*, *juntada por decisión del equipo*, *la que sobra: borrarla a mano* y
*decisión del equipo sin aplicar*. Cada línea dice qué pasa y qué sigue. Se reescribe cada hora; lo que ya pasó (una
cancelación aplicada, una reunión juntada) se sigue mostrando 7 días. También sale en el resumen del lunes y, lo nuevo, en un
mail por día.

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
- **Si hay una fila parecida, pregunta antes de crear.** Una fila de ustedes con la misma figura uno o dos días antes o
  después, o la misma fecha y comuna con otra figura (o sin figura): el sistema **no crea** la reunión y la pone en la
  solapa **AGENDA_DUPLICADOS** (en este mismo archivo). Ahí, en **ELEGIR**: *"Es la misma: vincular"* (el sistema usa
  esa fila), *"Son distintas: crear"* (crea la suya) o *"No sé"* (sigue preguntando). **COMENTARIO** es libre. Se aplica
  en la corrida siguiente (cada hora). Sólo se puede escribir en esas dos columnas.
- **Si la reunión ya está cargada con otra fecha** (la misma figura y el mismo barrio, uno o dos días antes o después,
  y el mail es anterior a esa fecha: la reunión se adelantó o se atrasó), el sistema **no crea ni pregunta y no toca
  esa fila**: la anota como "ya cargada en la fila N (fecha distinta)" (en el archivo "Agenda", con el número de fila).
  Si duda, pregunta en AGENDA_DUPLICADOS, y ahí también está la opción **"Ya está cargada en otra fila: no crear"**.
  Si hay varias filas posibles, aparece una línea por cada una: se elige en la de la fila que corresponde.
- **Próximamente (15/10, apagado: `AGENDA_ELECCIONES_SIEMPRE`): lo que eligen en AGENDA_DUPLICADOS vale siempre.** Aunque
  después cambie la hora de la reunión en el mail, o corrijan el barrio de la fila elegida, o la fila deje de aparecer como
  candidata, la línea no vuelve a aparecer. Si la fila elegida ya no existe: con *"Ya está cargada en otra fila"* el sistema
  igual no crea nada; con *"Es la misma: vincular"* no crea y vuelve a preguntar, diciendo que la fila ya no está. Cada
  decisión aplicada (o cerrada porque la reunión salió del mail) queda anotada una sola vez en el registro de la agenda.
- **Una reunión que el mail marca como cancelada** no se crea ni se pregunta: no hay nada que elegir. Desde el 16/10 ya no
  aparece en AGENDA_DUPLICADOS: queda en AGENDA_PENDIENTES como *"cancelada en el mail: no se crea"*.
- **Si aparece un duplicado después** (alguien cargó una fila para una reunión que el sistema ya había creado), sale en
  AGENDA_DUPLICADOS como *"una reunión en dos filas"*, para elegir con cuál quedarse o decir que son distintas (arriba). **El
  sistema nunca borra una fila que cargaron ustedes.**
- **Si borran una fila que creó el sistema, no la vuelve a crear** mientras la reunión siga en el mail (en el archivo
  "Agenda" figura como "borrada por el equipo"). Si la reunión sale del mail y después vuelve, es una reunión nueva y sí
  la crea.
- **Sigue los cambios del mail** ("Actualizo:"): hora, dirección y, si cambió la dirección, el barrio. Sólo mientras la
  reunión está "en agenda".
- **Si la reunión se pasa a otro día de la misma semana**, mueve la fecha de la fila (no crea otra).
- **Si una reunión que todavía no pasó desaparece del mail, el sistema PREGUNTA** en **AGENDA_DUPLICADOS** (como
  "cancelación", con la fila, la reunión y el mail que la sacó): *"Se canceló: suspender/borrar"* (la pone en
  "Suspendida", o la borra si la había creado el sistema y nadie le cargó nada), *"Sigue"* (no la toca ni vuelve a
  preguntar) o *"No sé"*. Se aplica en la corrida siguiente. **Sólo un mail nuevo con la agenda completa hace
  desaparecer una reunión**: un "Re:" o un reenvío sólo agrega o actualiza. Si un "Actualizo:" trae mucho menos que el
  anterior (menos del 60%), no pregunta nada: puede ser un mail con sólo los cambios.
- **Próximamente (decisión del 15/10, todavía apagado: `AGENDA_CANCELACION_AUTOMATICA` + `AGENDA_CANCELACION_MODO =
  'suspender'`): si una reunión sale del mail, el sistema la pone en "Suspendida"; si vuelve, la reactiva.** No pregunta
  y **nunca borra una fila**. Sólo si: la sacó un mail nuevo con la agenda completa (no un "Re:" ni un reenvío), ese mail
  no tiene un formato raro y no trae muchas menos reuniones que el anterior; **el mail es anterior a la fecha y hora de
  la reunión** (también el mismo día, o aunque la hora ya haya pasado: el mail manda; si el mail es posterior a la
  reunión, no se toca y se avisa); y la fila está "en agenda" (lo haya puesto el sistema o ustedes; si ustedes le
  pusieron otro STATUS —Realizada, Reprogramada…— no se toca y se avisa). Si se pasa a otro día
  de la misma semana, se mueve la fecha (no se suspende); si se pasa a otra semana, la vieja queda Suspendida y se crea la
  nueva. En el archivo "Agenda", "Cambios" dice *"suspendida: salió del mail del …"*; en AGENDA_PENDIENTES queda *"cancelación
  aplicada (Suspendida)"* (16/10: ya no en AGENDA_DUPLICADOS, que es sólo para decidir). Si alguien ya había elegido *"Sigue"*,
  se respeta.
- **Próximamente (15/10, noche, apagado: `AGENDA_COLORES_MAIL`): el COLOR del mail.** Una reunión que el mail marca en
  **ROJO** (Evento, Hora y Lugar) en su última versión está **cancelada aunque siga escrita**: con la cancelación
  automática, pasa a "Suspendida" con las mismas reglas de arriba ("Cambios": *"suspendida: rojo en la v3 del 13/10"*), y
  no se reactiva mientras siga en rojo. Las notas del mail (*"SE CANCELA LA REUNIÓN DE …"*, *"CAMBIO DE DÍA …"*) no
  deciden nada solas: confirman el color en el aviso y en la auditoría. Si una reunión que suspendió el sistema recibe
  después asistentes o inscriptos, no se pisa nada: se avisa una vez (por mail y en AUDITORIA_AGENDA) para que ustedes
  decidan. Más adelante (apagado: `AGENDA_COLORES_AMARILLO_VERDE`): lo AMARILLO aparece en "Cambios" y en naranja en
  "Agenda (mail)"; lo VERDE, como "nueva".
- **Próximamente (16/10, apagado: `AGENDA_CANCELACION_CONJUNTO`, junto con la cancelación automática): RDV CONJUNTO como
  tercera fuente.** Si en RDV CONJUNTO una reunión tiene el Estado **"Cancelado"**, su fila de la planilla pasa a
  "Suspendida" (la fila se busca como para los Asistentes: figura + fecha, y si la figura tiene dos filas ese día, la
  dirección y el barrio; si no queda una sola, no se toca). Sólo si está "en agenda": si ustedes le pusieron otro STATUS
  (Realizada…) o tiene asistentes cargados, no se toca y se avisa una vez. **Si RDV CONJUNTO tiene la misma figura el
  mismo día una vez "Cancelado" y otra "Realizada"** (el caso Macri 15/10: Villa Santa Rita y Villa Devoto), la de la
  planilla es la Realizada: no se suspende. "Cambios" dice *"suspendida: Cancelado en RDV CONJUNTO"*, y el sistema no la
  reactiva solo aunque la reunión siga en el mail: si fue un error, la vuelven ustedes a "en agenda". **RDV CONJUNTO
  nunca se modifica**: el sistema sólo la lee.
- **Próximamente (15/10, apagado): una reunión sin figura y sin dirección** (una Seguridad en tu Barrio "A CONFIRMAR")
  **no crea fila hasta que llegue la figura o la dirección, o falten 2 días**. Mientras tanto aparece en el archivo
  "Agenda" como *"pendiente de definir"* (sin fila) y en la solapa AGENDA_PENDIENTES de la intermedia. Y una reunión que
  cambió dentro de la semana (otra dirección, otro día) se busca entre las filas de esa semana que quedaron sin reunión
  antes de crear otra: si hay una sola posible, se actualiza; si hay dudas, se pregunta en AGENDA_DUPLICADOS.
- **"NO PARTICIPA"**: la reunión se hace igual y tiene su fila a nombre de esa figura; los nombres que no participan
  van a la columna **"No participa"**.
- **Reunión conjunta** (varias figuras): una sola fila, a nombre de la primera que nombra el mail.
- **"Seguridad en tu Barrio"** viene sin figura: la fila se crea sin Figura y el sistema la completa cuando la reunión
  aparece en RDV CONJUNTO (por fecha y barrio).
- **Todo lo que escribe el sistema queda en celeste** (#CFE2F3), para que se vea de un vistazo.
- **Columnas al final de la planilla** (las escribe el sistema): **"Origen fila"** (*sistema (agenda)*: la creó el
  sistema; *equipo*: la cargaron ustedes; *equipo + agenda*: la cargaron ustedes y el sistema la completó), **"Tocado
  por el equipo"** (qué columnas cambiaron ustedes respecto de lo que escribió el sistema: FECHA, HORA, Dirección,
  Barrio, STATUS; se recalcula en cada corrida), y lo del mail tal cual: **"Evento (mail)"**, **"Lugar (mail)"**,
  **"Dirección (mail)"**, **"Marcas (mail)"**, **"Conjunta con"**, **"No participa"**. Así no se pierde nada del mail
  aunque las columnas de ustedes tengan otra forma.
- **Una copia de toda la agenda** queda en el archivo **"Agenda"**, en dos solapas: **"Agenda"**, la semana en curso, y
  **"Agenda cerrada"**, las semanas que ya terminaron (la más nueva primero; el lunes la semana anterior pasa sola). Una fila por reunión, con su estado (vigente,
  reprogramada, desaparecida), qué cambió, el barrio que calculó (o por qué no), la fila de la planilla y su STATUS. **No
  se edita a mano**: se reescribe en cada corrida. Lo que haya que corregir, se corrige en la planilla.

## Lo que el sistema NO toca nunca

- **Una celda que ustedes cambiaron.** Si el sistema escribió una hora y alguien la corrigió, esa celda es de ustedes
  para siempre: aunque el mail cambie, el sistema no la vuelve a tocar.
- Inscriptos, canales, asistentes, temas, síntesis, observaciones: nada de eso lo toca la agenda.
- Una reunión que no está "en agenda" (ya Realizada, Reprogramada, o Suspendida por ustedes): no se actualiza.

## Manda el mail (20/10)

La base tiene **las reuniones del mail de agenda**. Lo que no está en el mail **no va**: el sistema no crea filas desde RDV CONJUNTO
ni desde los formularios.

- Una reunión que se hizo y no está en el mail (por ejemplo, fuera de nuestros canales) no se carga. Si alguien la cargó a mano, la
  auditoría la muestra como **"fuera del mail: revisar"**: nunca se borra ni se cambia sola.
- En AGENDA_PENDIENTES (base intermedia), una reunión "se hizo y no está en la base" se marca **"no va (fuera de nuestros canales)"**
  y no vuelve a avisar.
- Una reunión del mail que se pasa a otro día queda **"Reprogramada"**; la nueva fecha es otra fila, la del mail de esa semana.
  Caso: **Macri 15/10, Villa Santa Rita**, reprogramada al 23/10 (la de Villa Devoto de ese día no va).

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
