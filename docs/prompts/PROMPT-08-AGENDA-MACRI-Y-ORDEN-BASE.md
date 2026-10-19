# Prompt para Code — Agenda: separar Macri 15/10, "una reunión, una fila" y ordenar la base

**Proyecto:** RDV — repo `jpcofano/RDV` (rama `migracion`)
**Guardar como:** `docs/prompts/PROMPT-08-AGENDA-MACRI-Y-ORDEN-BASE.md`
**Fecha:** 19/10/2026

## Estado de hoy (paso 66 del 19/10, 14:30)

Todo OK, no romper nada de esto:

- Reuniones del mail (semana 19/10): OK 8 | DISTINTO 0 | FALTA EN LA BASE 0 | DUPLICADA 0.
- Filas sin reunión en el mail: 0 | ambiguas: 0 | AGENDA_DUPLICADOS: vacía.
- Las cuatro copias (Agenda, AgendaCall, Agenda (mail), Agenda del archivo RDV): 8 de 8, sin diferencias.
- Filas 832 y 834 (juntadas con el paso 97): con su dirección y su barrio (Villa Urquiza y Palermo).
- Paso 99 (fusión automática en seco): 0 pares para juntar.
- Paso 100 (Bullrich 55): da Palermo, pero "aproximada" (GEOMETRIC_CENTER). La regla de confianza lo rechaza, y "Int." → "Intendente" da el mismo resultado.

## Reglas para TODO lo de este prompt

1. Todo lo nuevo, **apagado** por defecto, hasta que el usuario vea la medición en seco.
2. Nada escribe la base sin un paso **en seco** antes, una **huella** que el paso real exija y un paso para **deshacer**.
3. Cuando un cambio toque filas de la base, el seco tiene que **simular la próxima corrida de la hora completa** (agenda, cruce de formularios, asistentes, IDs, derivadas, Looker) y **listar todas las celdas que cambiarían en toda la base**. Si cambia algo fuera de lo esperado, el paso real no corre.
4. Nunca insertar filas en el medio de la base, para no correr las filas de abajo: una fila nueva va **al final**.
5. Tests para cada caso nombrado acá, push y clasp push, y verificar el remoto.

---

## 1) AGENDA_PENDIENTES: sólo en la intermedia

Es para el administrador, y ya va en el mail diario y en el resumen del lunes. No hace falta escribirla en el archivo de la base.

## 2) Caso Macri 15/10: dos reuniones en una fila (la opción más segura)

**Qué pasó (confirmado por el equipo):** el 1 a 1 de **Villa Santa Rita se SUSPENDIÓ** (en rojo en el mail, v3 del 13/10) y se hizo **otro en Villa Devoto**, que **nunca estuvo en el mail**. En RDV CONJUNTO figuran las dos, con la misma dirección (Bahía Blanca 4025):

- 843 → Villa Santa Rita, "Cancelado";
- 849 → Villa Devoto, "Realizada", 31 asistentes.

**Hoy** la fila 824 tiene el `agenda_uid` de la reunión del mail (`c-33a3fd0b-8836-420c-850e-99320fb5231f`, Villa Santa Rita), pero todos los datos son de la reunión de Villa Devoto: el barrio Villa Devoto que cargó el usuario, STATUS Realizada, y los asistentes y oradores de la 849.

**La opción más segura: la 824 conserva sus datos y se le saca la identidad del mail.** Los datos de la reunión que se hizo (asistentes, oradores, formularios, IDs, ID derivada, Looker) quedan donde están, y se agrega al final una fila mínima para la reunión suspendida.

- **Fila 824 = Villa Devoto (Realizada).** Se queda con todos sus datos. Cambia sólo esto:
  - deja de ser la reunión del mail: se le saca el `agenda_uid`, las columnas `agenda_*` y las del mail (Evento (mail), Lugar (mail), Dirección (mail), Marcas (mail)), que pasan a la fila nueva;
  - `Origen fila` = "equipo";
  - Dirección: hoy dice "A CONFIRMAR (NO SE COMUNICA LA DIRECCIÓN)", que escribió el sistema. **Proponer** "Bahía Blanca 4025" (de RDV CONJUNTO 849) y aplicarlo sólo si el usuario lo aprueba al ver el seco.
- **Fila NUEVA, al final = Villa Santa Rita (Suspendida):**
  - Jorge Macri, 15/10/2026, 09:15, Encuentro "1 a 1", Barrio "Villa Santa Rita", Dirección "A CONFIRMAR (NO SE COMUNICA LA DIRECCIÓN)", STATUS "Suspendida";
  - recibe el `agenda_uid` y las columnas del mail que salen de la 824: pasa a ser la reunión del mail de ese día;
  - sin asistentes, sin oradores, sin inscriptos y sin formularios;
  - `Origen fila` = "sistema (agenda)", anotado en REGISTRO_AGENDA_CAMBIOS como "separada del 824 (Macri 15/10)".

**Protecciones** (lo que más importa, porque la reunión de Villa Devoto no está en el mail):

- a) La agenda **nunca** vincula, actualiza, concilia (H2) ni suspende (J, rojo, RDV CONJUNTO "Cancelado") la 824: no tiene `agenda_uid`, es del equipo y no es la reunión del mail. La reunión del mail de ese día es la fila nueva, por `agenda_uid`. Test.
- b) Para la cancelación, la fila nueva ya está Suspendida: "coincide", no escribe nada y no avisa. Test.
- c) El punto 3 de este prompt (una Suspendida más su reemplazo no es una reunión en dos filas) tiene que estar **antes**. Sin eso, este caso frena la semana.
- d) El cruce de RDV CONJUNTO por ubicación: 849 → 824 (Villa Devoto, Realizada); 843 → la fila nueva (Villa Santa Rita, Cancelado, coincide). La 824 conserva sus 31 asistentes y no se escribe nada nuevo.
- e) **Formularios e IDs:** en el seco, mostrá si la 824 tiene formularios (`form_*`), inscriptos, ID cuentas o RDV_UID, y si son de Villa Devoto o de Villa Santa Rita. Si alguno es de Villa Santa Rita, decime antes de moverlo; no lo muevas solo.
- f) La ID derivada ("Figura - Barrio - fecha") queda distinta en las dos filas: "Jorge Macri - Villa Devoto - 15/10/2026" y "Jorge Macri - Villa Santa Rita - 15/10/2026".
- g) La auditoría (paso 66) muestra la 824 como "fila del equipo fuera del mail: OK", y la reunión del mail del 15/10 → la fila nueva, Suspendida, OK.

**Cómo se hace:**

1. Paso en seco: el plan, más la simulación de la próxima corrida completa (regla 3 de arriba). Las únicas celdas que pueden cambiar son las de la 824 y la fila nueva.
2. Paso real: exige la huella del seco.
3. Paso para deshacer: vuelve la 824 a como estaba y borra la fila nueva.

Decime qué pasos correr.

## 3) "Una reunión, una fila" (H3): una Suspendida más su reemplazo no es un duplicado

Una fila **Suspendida** y otra de la misma figura y fecha **no** son "una reunión en dos filas": así carga el equipo una reunión cancelada y la que se hizo en su lugar. No frena la semana, no pide decisión y no va a AGENDA_DUPLICADOS.

- Tiene que estar antes del punto 2.
- Test con el caso Macri 15/10. Test también con que **dos filas no suspendidas** de la misma reunión sigan detectándose como hoy, para que no se pierda lo que ya funciona.

## 4) Reunión que se hizo pero no está en la base: sólo AVISO

Una fila de RDV CONJUNTO "Realizada" o con asistentes, que no tiene fila en la base o cuya única candidata está Suspendida y en otro barrio, es "una reunión que se hizo y no está en la base" (como Macri 15/10 en Villa Devoto).

- **Sólo aviso**, nunca crear la fila: en AGENDA_PENDIENTES y en el mail diario, con todos los datos para que la cargue el equipo.
- Apagado, con medición en seco desde el 15/07: cuántas habría habido y cuáles.

## 5) El barrio de la 834 y la geocodificación aproximada: sólo medir

- El barrio Palermo de la 834 lo cargó el sistema solo, aunque el paso 100 muestra que la geocodificación (aproximada) no pasa la regla de confianza. Decime **de dónde salió** (RDV CONJUNTO, barrio por comuna u otra regla) y si queda registrado como escrito por el sistema.
- La regla de aceptar una geocodificación aproximada (a más de 500 m del borde de otro barrio y en la comuna del mail): **medila en seco y no la prendas**. Mostrame qué filas ganarían barrio y que ninguna contradiga un barrio cargado por el equipo.

## 6) Archivos temporales del editor

Si en el editor de Apps Script quedó algún archivo temporal (por ejemplo `zz_pasos100y99.js`, con `pasos100y99_soloLectura`), incorporalo a `99_Correr.js` con un nombre claro, o borralo. Que el remoto y GitHub queden iguales.

## 7) Dejar la base ordenada por fecha, las más nuevas al final

Al final de cada corrida de la hora, la base queda ordenada por **FECHA ascendente** (las más viejas arriba, las más nuevas al final), y dentro del mismo día por **HORA** y después por **Figura**. Las filas sin FECHA van al final de todo y se listan en el aviso.

**Lo más seguro, para no romper nada:**

- a) Interruptor `BASE_ORDEN_POR_FECHA`, **apagado** hasta ver el seco.
- b) Ordena sólo si hace falta: si la base ya está en orden, no toca nada.
- c) Usa el ordenamiento nativo de la hoja (`Range.sort`), sobre **todas las columnas** (también las ocultas y las del sistema), así cada fila se mueve entera con sus formatos, notas y colores (el #CFE2F3 de lo que escribió el sistema). Nunca reescribe valores y nunca ordena sólo algunas columnas.
- d) **Sólo las filas con datos**: sin el encabezado y sin las filas vacías de abajo. El legado (`marcarRevisadaEnOrden`) ordenaba hasta `lastRow`, que por las fórmulas daba 2374 en vez de 802, y arrastraba unas 1.570 filas vacías; que eso no pase.
- e) Corre al **final** de la corrida, dentro del bloqueo de una corrida por vez, y **sólo si queda tiempo** (si no, queda para la siguiente). Nunca a la mitad de una escritura.
- f) **Antes de prenderlo, verificá** que nada dependa del número de fila entre una corrida y otra: AGENDA_DUPLICADOS, REVISAR_MATCH y las fichas, EMPAREJAR_MANUAL, IDS_SIN_CRUZAR, AGENDA_PENDIENTES, AGENDA_FIGURA_A_COMPLETAR, REGISTRO_AGENDA_CAMBIOS, los pasos para deshacer (38, 98 y el del punto 2) y SISTEMA_COPIA. Todo tiene que encontrar su fila por clave (`agenda_uid`, `RDV_UID`, huella), o regenerarse en la misma corrida después de ordenar. Si algo depende del número de fila, arreglalo primero y decime qué era. CLAUDE.md ya dice que el equipo ordena y borra filas; confirmá que lo nuevo de las últimas semanas también lo soporta.
- g) Antes de ordenar, guarda el orden anterior (la lista de claves por fila), para poder **deshacer el orden**.
- h) Queda registrado en REGISTRO_CORRIDAS ("ordenada: N filas movidas").

**Seco:** cuántas filas se moverían, las primeras 20 (de qué fila a qué fila), las filas sin FECHA, y la verificación de que después de ordenar cada `agenda_uid` y cada `RDV_UID` sigue con sus mismos datos. Va **después** del punto 2: la fila nueva de Villa Santa Rita, que se agrega al final, queda al lado de la 824 cuando se ordene.

---

## Orden de trabajo y qué me tenés que devolver

1. Punto 3 (con sus tests), después el punto 2 y después el punto 7. Los puntos 1, 4, 5 y 6 pueden ir en paralelo.
   Guardá este prompt en `docs/prompts/PROMPT-08-AGENDA-MACRI-Y-ORDEN-BASE.md`.
2. Al terminar:
   - los pasos para correr el punto 2, en orden: seco, real y deshacer;
   - el paso de medición del punto 4 y el del punto 5;
   - el seco del punto 7 y lo que encontraste en la verificación 7f;
   - confirmación de tests, push, clasp push y remoto verificado.
