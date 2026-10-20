# Prompt para Code — 00_Correr, "manda el mail", Macri 15/10 reprogramada, tiempos, avisos y barrio aproximado

**Proyecto:** RDV — repo `jpcofano/RDV` (rama `migracion`)
**Guardar como:** `docs/prompts/PROMPT-09-CORRER-Y-TIEMPOS.md`
**Fecha:** 19/10/2026

## Lo que mostraron las mediciones (`mediciones_soloLectura`, 19/10 22:23)

- **Paso 67 (48 corridas):** ok 38 | con partes salteadas 6 | **CORTADA 4**. El total bajó de 197 s a **147 s** de mediana; la agenda, de 69,5 s a **57,6 s**. Maps: **0 llamadas por corrida**. La cache de los mails acierta en todo (hilos 29/29, mensajes 30/30, colores 30/30, parse 60/60). Vistas, Looker y Agenda cerrada se saltean cuando no cambiaron (31 a 35 veces). Pero:
  - 2 de las 4 cortadas murieron **dentro de la agenda** (19/10 09:28 y 10:28, "después de cache"): base 43 y 31 s · gmail 72 y 58 s · parse 43 y 28 s · cache 41 y 30 s, con todo saliendo de la cache;
  - el tramo **gmail** tarda 22 s de mediana y llega a 170 s, aunque todo venga de la cache;
  - el **plan** tardó 141 s dos veces (18/10 05:28 y 20:28) con **0 llamadas a Maps** y "GUARDA DE TIEMPO";
  - escribir la cache de los mails llega a 41 s;
  - `leerDestino_` llega a 107 s;
  - la cortada del 18/10 06:28 murió en "escritura", después de cruce 230 s y asistentes 94 s.
- **Paso 104:** 3 reuniones hechas sin fila desde el 15/07, todas fuera del alcance de la agenda (las revisa el equipo): Clara Muzzio 29/07 Palermo (Av. Int. Bullrich 55, 15 asistentes) · Gabriel Sánchez Zinny 12/08 C2 (Uriburu 1022, 46; la base tiene una el 13/08, fila 735) · Clara Muzzio 14/08 Palermo (Av. Sarmiento 2600, 7; la base tiene una "Reprogramada" el 12/08, fila 733).
- **Paso 105:** el "Palermo" de la 834 **no lo escribió la agenda**: ninguna línea de REGISTRO_AGENDA_CAMBIOS lo escribió, `agenda_barrio_escrito` está vacío y el fondo es #d0e0e3. Lo cargó una persona. Está bien así; no hay nada que hacer.
- **Paso 106:** la regla del barrio aproximado: ganarían 0 · contradicen al equipo 0 → **LISTO**. Con sólo la geometría (sin la comuna del mail) habría 5 contradicciones.

## Lo que dijo el equipo (19/10)

- **Macri 15/10 Villa Devoto:** esa reunión **no salió por nuestros canales**, así que **no va a la base**. Regla del usuario: **"manda el mail: lo que no está en el mail no va"**.
- **Macri 15/10 Villa Santa Rita:** se suspendió y **se reprogramó al 23/10, también en Villa Santa Rita** (es la fila 837, que vino en el mail de JM del 16/10).
- **STATUS:** "Reprogramada" si el sistema puede detectar la reprogramación; si no, "Suspendida". Como regla general: si una reunión cancelada en el mail vuelve a aparecer otro día en el mismo lugar, la vieja queda **"Reprogramada"**.

## Reglas para todo

1. Todo lo que escribe la base: seco, huella y deshacer, como hasta ahora.
2. No cambiar el comportamiento de lo que ya anda: el paso 66 del 19/10 salió limpio.
3. Tests, push y clasp push, y verificar el remoto.

---

## 1) `00_Correr.js`: sólo lo que el usuario tiene que correr

El usuario quiere abrir un solo archivo y ver **sólo** las funciones que tiene que ejecutar, en orden. El menú "Ejecutar" del editor muestra las funciones **del archivo abierto**.

- Archivo nuevo **`00_Correr.js`**, primero en el editor. Adentro van **sólo** las funciones que el usuario tiene que correr ahora, en el orden en que las tiene que correr, con nombres numerados: `c01_…`, `c02_…` (un nombre de JavaScript no puede empezar con un número).
- Cada `cNN_` sólo llama al paso que corresponde, y lleva arriba un comentario de una línea: qué hace, si **escribe** o es **sólo lectura**, qué tiene que dar y cuál es el paso siguiente.
- Arriba de todo, un bloque **"LO QUE TENÉS QUE CORRER"** con la lista, en orden, y cuáles esperan un OK.
- Los `pasoNN_` siguen donde están (`99_Correr.js`), con los mismos nombres, porque los usan los tests y los docs. Si los nombres de `cNN_` chocan con otros, cambiá los de `cNN_`.
- Cuando un paso ya se corrió o deja de servir, sacalo de `00_Correr.js` en el push siguiente; la función de `99_Correr.js` queda.
- **Hoy, en `00_Correr.js`, en este orden:**
  - `c01_corregirMacri1510_enSeco` → el seco del punto 6 (sólo lectura).
  - `c02_corregirMacri1510` → el real del punto 6 (**escribe**). Sólo con el OK del usuario después de ver el c01; exige la huella del c01.
  - `c03_ordenBase_enSeco` → paso 107 (sólo lectura).
  - `c04_ordenBase_ahora` → paso 108 (**escribe**). Sólo con el OK del usuario después de ver el c03. Que exija la huella del 107; si no la exige hoy, agregáselo.
  - `c05_ayuda` → paso 48 (escribe la GUÍA y la LEER, con las reglas nuevas de este prompt).
  - Bloque **"cuando quieras (sólo lectura)"**: `c10_auditoria` (paso 66), `c11_mediciones` (`mediciones_soloLectura`), `c12_revisarTodo` (`revisarTodo`).
  - Los pasos 101 a 103 (separar Macri) **no van**: quedan descartados (punto 6).

## 2) El orden de la base: después de corregir la 824

Primero se corrige la 824 (c01 → c02, punto 6), y después se ordena (c03 → c04). Así el seco del punto 6 trabaja con los números de fila de hoy.

Después del c04 y de una corrida de la hora OK, el usuario te avisa y prendés `BASE_ORDEN_POR_FECHA`.

## 3) Tiempos: que la agenda no muera adentro

Los arreglos anteriores funcionan en la mediana, pero 2 de las 4 cortadas murieron **dentro** de la agenda.

- **a) Gmail:** con todo en la cache, el tramo sigue tardando 22 s y hasta 170 s. Probablemente es la búsqueda. Una consulta barata ("¿hay mails nuevos desde la última corrida?", con `after:` o `newer_than:`) y la búsqueda completa sólo si hay mails nuevos o cada N horas. Medí antes y después.
- **b) El plan:** 141 s con 0 llamadas a Maps. Partí el plan en tramos en el registro (qué parte del plan es lenta) y arreglá lo que encuentres.
- **c) La cache de los mails:** escribirla sólo si cambió algo (llega a 41 s).
- **d) Un tope duro para la agenda:** si antes de escribir la agenda ya va por unos 200 s (configurable), la agenda **no escribe nada** en esa corrida (nada a medias), queda como "salteada por tiempo", corren las demás partes, y la corrida siguiente arranca por la agenda. Que la agenda nunca más muera adentro.
- **e) El cruce:** la cortada del 18/10 06:28 (cruce 230 s + asistentes 94 s) murió en "escritura". Que antes de escribir se verifique el tiempo que queda, igual que en (d).
- Medí con el paso 67 (los tramos nuevos del plan, más cuántas veces actuó el tope).

## 4) Prender el aviso de "hechas sin fila"

Prender `AGENDA_AVISO_HECHAS_SIN_FILA`. **Sólo avisa**: AGENDA_PENDIENTES y mail diario, nunca crea filas. El paso 104 dio 3 desde el 15/07, todas fuera del alcance (hoy no avisaría ninguna). Las tres de la lista de arriba las revisa el equipo.

- Con la regla "manda el mail", **una reunión hecha que no salió por nuestros canales no va a la base**. Cuando se corrija la 824 (punto 6), la de Villa Devoto (RDV CONJUNTO 849) va a aparecer como "se hizo y no está en la base". En AGENDA_PENDIENTES tiene que poder marcarse **"no va (fuera de nuestros canales)"**, y entonces no se avisa más, ni en el mail diario ni en el resumen del lunes. Se guarda por clave (figura, fecha y lugar de RDV CONJUNTO), no por número de fila.
- El aviso nunca escribe nada de RDV CONJUNTO en la base.

## 5) Prender el barrio con geocodificación aproximada (con las dos condiciones)

- Prender `AGENDA_BARRIO_APROXIMADO`. El paso 106 dio ganarían 0 y contradicen 0. La condición de la **comuna o el barrio del mail es obligatoria**: nunca sólo la geometría, que daría 5 contradicciones.
- Sólo escribe un Barrio vacío, y lo marca como escrito por el sistema (`agenda_barrio_escrito`), así se puede deshacer.
- En la cache hay una entrada peligrosa: **"Int. Bullrich 55"** (sin "Av.") → ROOFTOP parcial → "Monasterio 301", **Parque Patricios**. Hoy se rechaza por ser "ok_parcial". Confirmá que nunca se usa, y marcala para que no se vuelva a leer.

## 6) "Manda el mail", Macri 15/10 y la regla de "Reprogramada"

### 6a) La regla: manda el mail

- **Lo que no está en el mail no va a la base.** El sistema nunca crea filas desde RDV CONJUNTO ni desde otra fuente. Los datos de RDV CONJUNTO (asistentes, oradores, figura, barrio) sólo se escriben en la fila de **su** reunión del mail. Si RDV CONJUNTO tiene una reunión que no está en el mail, a lo sumo se avisa (punto 4).
- **Auditoría (paso 66):** una fila de la época de la agenda que no corresponde a ninguna reunión del mail ya no es "OK": queda **"fuera del mail: revisar"**. Sólo se muestra: nunca se borra ni se cambia sola. Las filas de antes de la agenda no se marcan.
- Escribilo en CLAUDE.md, en `docs/agenda-equipo.md` y en la GUÍA (c05).

### 6b) Corregir la 824 (Macri 15/10): vuelve a ser la reunión del mail

Hoy la 824 tiene el `agenda_uid` de la reunión del mail (Villa Santa Rita) pero datos de la de Villa Devoto, que no va. Queda así:

- **Barrio:** "Villa Santa Rita" (el del mail). Hoy dice "Villa Devoto", que cargó el usuario; él autoriza cambiarlo.
- **STATUS REUNIÓN:** "Reprogramada" (por la regla 6c: se reprogramó al 23/10, fila 837).
- **Se vacían** Asistentes (31), Oradores anotados (10) y Oradores que hablaron (8): vinieron de RDV CONJUNTO 849 (Villa Devoto), que no va.
- **Se queda todo lo demás:** el formulario "JORGE MACRI - Encuentro "1 a 1" - Jueves 15/10 Villa Santa Rita" con sus **176 inscriptos** (es de esta reunión), el `RDV_UID`, el `agenda_uid` y las columnas del mail.
- La ID derivada vuelve a ser "Jorge Macri - Villa Santa Rita - 15/10/2026".
- En REGISTRO_AGENDA_CAMBIOS: "reprogramada al 23/10/2026 (fila 837, agenda_uid c-30639092…)".

**Protecciones:**

- El seco **simula la próxima corrida completa** con la 824 corregida y lista todas las celdas que cambiarían en toda la base. Tienen que ser sólo las de la 824. En particular, el cruce de RDV CONJUNTO **no puede volver a escribir** en la 824 los asistentes ni los oradores de la 849: con el barrio Villa Santa Rita tiene que elegir la 843 ("Cancelado", sin asistentes) o nada. Si los volvería a escribir, **NO LISTO**.
- La cancelación (J y rojo) no la toca: ya está cancelada ("Reprogramada" cuenta como cancelación reflejada).
- La fila 837 (23/10, Villa Santa Rita, "en agenda") no se toca.
- Real con la huella del seco, y un paso para deshacer.
- **Los pasos 101 a 103 (separar) quedan descartados**: sacalos de `00_Correr.js` y marcalos como obsoletos en `99_Correr.js` y en `docs/ESTADO.md`.

### 6c) Regla general: "Reprogramada" en vez de "Suspendida"

Cuando una reunión está **cancelada en el mail** (desaparece o está en rojo) y **la misma figura** tiene una reunión **en el mismo lugar** (mismo barrio, misma comuna o el mismo "Lugar (mail)") **en una fecha posterior** de un mail (de la misma semana o de las siguientes, hasta 21 días después), la vieja queda **"Reprogramada"**. Si no se puede detectar, queda **"Suspendida"**, como hoy.

- Si la reprogramación aparece **después** de que el sistema ya la puso "Suspendida" (la nueva fecha llegó en un mail posterior), pasa de "Suspendida" a "Reprogramada", **sólo si el "Suspendida" lo puso el sistema**. Lo que puso el equipo no se toca.
- Mismos resguardos que J: el mail manda, sólo filas "en agenda" o suspendidas por el sistema, nunca se borra.
- "Reprogramada" ya está en la lista de STATUS (el paso 91 la mostró).
- La auditoría, los avisos y el resumen del lunes cuentan "Reprogramada" como cancelación reflejada, con la fecha nueva ("reprogramada al 23/10").
- Tests: Macri 15/10 → 23/10 (Villa Santa Rita) y Clara Muzzio 09/09 → 18/09 (el paso 68 la mostró como "se movió, mismo lugar"; la 778 es "Suspendida" del equipo, así que no se toca, sólo se cuenta).
- Medición en seco desde el 15/07: cuáles habrían quedado "Reprogramada", y contra qué STATUS tiene hoy el equipo cada una (coincide o no).
- Interruptor `AGENDA_REPROGRAMADA` **apagado** hasta que el usuario vea la medición. La 824 (6b) se corrige igual, a mano con el c02, sin esperar el interruptor.

---

## Qué me tenés que devolver

1. Cómo quedó `00_Correr.js` (la lista de funciones y el bloque de arriba).
2. Lo de los tiempos: qué encontraste en el plan y en Gmail, qué cambiaste y cómo medirlo.
3. Los interruptores que prendiste (puntos 4 y 5) y los que quedan esperando (`BASE_ORDEN_POR_FECHA`, `AGENDA_REPROGRAMADA`).
4. La medición en seco de la regla 6c (desde el 15/07) y cómo correrla.
5. Tests, push, clasp push y remoto verificado.
6. Guardá este prompt en `docs/prompts/PROMPT-09-CORRER-Y-TIEMPOS.md`.

**Lo que viene después de esto:** la etapa 2 (`AGENDA_MAIL_FORMATO_DIRECTA` y el paso 74; `AVISOS_MAIL_ACTIVO` y el paso 80; `AUDITORIA_SEMANAL_ACTIVA` y el paso 82). No la hagas todavía.
