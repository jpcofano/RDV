# Estado de la migración — al 2026-10-08 (destino: el real; migración hecha; antes de Agenda: derivadas 0.u, oradores 0.v, fichas en el destino 0.w; AGENDA etapa 1, medir: 0.x; REVISAR_MATCH con el formato aprobado, prendido: 0.y; AGENDA etapa 2, crear y actualizar: 0.z; ubicación en tres niveles y la tanda del 07/10, prendidas el 07/10 y el 08/10: 0.z, al final; las fichas del 08/10, prendidas: 0.z; el tablero de Looker, prendido el 08/10: 0.z; los IDs de los encuentros ("ID cuentas"), escritos y apagados hasta los pasos 55–57: 0.z, al final; la noche del 08/10, `manana()` y qué prender: 0.z, lo último)

Punto de retomada. **`CLAUDE.md` sigue siendo la fuente de verdad** sobre qué hace el sistema y
por qué; este archivo dice sólo **dónde quedamos y qué sigue**, para poder abrir el repo en otra
máquina y arrancar sin releer todo.

Rama: **`migracion`**. `main` queda intacto como referencia.

---

## 0. Prueba de escritura sobre la copia "AAA NOBORRAR" (02/10–03/10) — TERMINADA

> ✅ **03/10: `RDV_HOJA_DESTINO` volvió al destino real (`RVD JM-CM - ES`).** **04/10: migración al real hecha (0.t).** La secuencia en el real, con la
> predicción: **0.s**. Lo que sigue en 0.a–0.r es la historia de la prueba sobre la copia.
>
> (Antes: `RDV_HOJA_DESTINO` apuntaba a la copia, no al destino real. Ver f) para volver.)
> El activador **no se instala** hasta volver y verificar la escritura real
> (`instalarActivadorDiario_` se niega mientras apunte a la copia).

### a) Por qué

La primera escritura real (`upsertDestino()` con `DRY_RUN = false`, 02/10 14:50) **se cortó por
"Exceeded maximum execution time"** (6 minutos de Apps Script). El cálculo terminó a las 14:52:41
(leer `B` tardó ~1 minuto); el resto fue escritura hasta el corte, a las 14:56:56. No llegó a
`REGISTRO_UPSERT` ni a los reportes.

La causa: escribía **celda por celda** —leer, escribir, pintar—, y cada lectura obliga a Apps
Script a vaciar la cola de escrituras: un viaje completo al servicio por celda, ~2 segundos por
fila. Se reescribió **en lote** (abajo). Como **el equipo está trabajando en la solapa real**, las
pruebas de escritura se hacen sobre la copia hasta que la escritura en lote quede verificada.

### b) El destino real al empezar la prueba (no se revierte)

Paso 16 del 02/10 15:13, después del corte: **123 filas con `RDV_UID`**, 0 sin `form_origen`,
invariante 0, fórmulas bien, **azules manuales 605** (= línea de base), **totales 6368** (base 5749,
+619 ≈ 123 × 5). **Esas 123 se dejan como están**: cuando se vuelva a correr sobre el real, entran
por `RDV_UID` y sólo se completa lo que les falte (punto 2 del pedido, abajo).

Si están **completas** —todas las celdas que el plan escribía en esa fila, no sólo `RDV_UID` y la
traza— lo dice el paso 16 nuevo (bloque 4, "INCOMPLETAS"). Lo esperable: **0 o 1** (la fila donde
cayó el corte, si quedó a mitad: el orden era traza, `RDV_UID`, datos, STATUS).

### c) Qué tiene la copia

Solapa **"AAA NOBORRAR"** en el mismo archivo del destino (1): copia de "RVD JM-CM - ES", con los
**inscriptos borrados desde la fila 800**. Puede traer las 123 filas ya escritas (si se copió
después de las 14:50; los fondos se copian con la solapa).

> **Ojo: el upsert no va a completar esos inscriptos.** `Inscriptos` es una `COLUMNAS_MANUALES`: el
> pipeline la lee y nunca la escribe, ni vacía (decisión 8). Lo que la copia sí tiene para escribir:
> traza y `RDV_UID` en todas las filas a escribir que no los tengan, sexo y edades donde falten, y
> `en agenda` → `Realizada` donde haya asistentes. Para tener más filas "que completar", lo que hay
> que vaciar en la copia son **sexo/edades y las cinco de traza**, no los inscriptos.

### d) La constante

`RDV_HOJA_DESTINO` en `00_Config.js` = **`'AAA NOBORRAR'`**, con el comentario *"TEMPORAL 02/10 —
revertir a 'RVD JM-CM - ES'"*. Es **la única referencia** a la solapa destino: la usan el upsert, el
paso 2, el 10, el 14, el 16, los diagnósticos (el 01 tenía el nombre escrito a mano: ya no) y
`40_Alertas.js`. Cada paso lo dice en la cabecera del log (`destino ....... "AAA NOBORRAR" — COPIA
TEMPORAL, NO el destino real`).

**La guarda** (`verificarHojaDestino_`, `05_Escritura.js`): si la solapa no existe, o sus
encabezados no son exactamente los de "RVD JM-CM - ES" en el mismo orden, el upsert **se frena con
error antes de calcular**, sin escribir nada.

**La línea de base de azules es por solapa** (`LINEA_BASE_AZULES` en `00_Config.js`): la del real
(605 / 5749) no se pisa; la de la copia está en `null` hasta el primer paso 16 sobre ella.

Los legados apagados (`Barrio desde Base.js`, `Sinc Base usuario.js`) siguen con el nombre propio:
no corren y no se tocaron.

### e) La secuencia de la prueba, con la predicción anotada antes de correr

0. `git push` y `clasp push` (hechos con este commit).
1. **`paso16_verificarEscritura()`** — la línea de base de la copia. Anotar los dos totales de azules
   en `LINEA_BASE_AZULES['AAA NOBORRAR']` (`00_Config.js`), commit y clasp push.
   - **Predicción:** si la copia es posterior a las 14:50: **123 con `RDV_UID`**, incompletas **0 o
     1**, azules **605 / 6368**. Si es anterior: 0 con `RDV_UID`, **605 / 5749**.
2. **`upsertDestino()`** una vez, a mano (`20_UpsertDestino.js`).
   - **Predicción:** **completa en una sola corrida**, sin corte propio. La escritura, **menos de 1
     minuto** (el test en Node da 15 s calibrado; 22 s con el servicio el doble de lento); la
     ejecución entera, **2 a 3 minutos**, casi todo leer `B` (~1 min) y calcular el plan. El log
     dice `COMPLETA`, filas tocadas, tandas, ms por tanda, y la **huella de entradas**.
   - Números del plan: **cerca de 758 | 39 | 13** en total (la escritura de las 14:50), salvo lo que
     haya cambiado el equipo; si hay 123 con `RDV_UID`, ésas cuentan en "por RDV_UID" y no en
     escribiría.
3. **`paso16_verificarEscritura()`** otra vez.
   - **Predicción:** invariante **0**; azules manuales **sin subir** (= el número del paso 1);
     totales arriba; con `RDV_UID` **≈ 755-760** (todas las escribiría + las 123); sin `form_origen`
     **0**; **incompletas 0**; termina en **OK**. El bloque 5 lista las filas con `RDV_UID` que hoy
     el plan no escribiría igual (ver 0.g).

Si falla algo: frenar (`DRY_RUN = true`, clasp push) y mirar. La copia se puede rehacer.

### f) La lista para volver

1. `RDV_HOJA_DESTINO = 'RVD JM-CM - ES'` en `00_Config.js`; commit, **`git push` y `clasp push`**.
2. En un horario **sin carga del equipo**, la misma secuencia sobre la solapa real:
   `paso16_verificarEscritura()` (línea de base nueva del real: hoy 605 / 6368; anotarla en
   `LINEA_BASE_AZULES['RVD JM-CM - ES']`; y mirar el bloque 1: si alguna de las 123 está en un
   choque de gemelos, se corrige como la 309, 0.i) → **`paso1_columnasDeTraza()`** (le agrega
   `form_clave` al real: sólo el encabezado, al final) → `upsertDestino()` una vez →
   `paso16_verificarEscritura()` hasta **OK** (incompletas 0; las 123 entraron por `RDV_UID`).
3. Borrar la solapa "AAA NOBORRAR", su entrada en `LINEA_BASE_AZULES` y la línea de CLAUDE.md §1.
4. **Recién después**, el activador (si el usuario lo decide; `docs/triggers-legado.md` antes).

### g) Lo que cambió en el código (02/10)

- **Escritura en lote** (`aplicarDecisiones_`): por tandas de `UPSERT_FILAS_POR_TANDA` (50) filas.
  Cada tanda: **una lectura fresca** de sus filas, `setValues` por bloque (sólo celdas a escribir,
  todas vacías en esa lectura) y los fondos con **un `RangeList`**. La regla es la misma de siempre,
  en `setSiDelSistemaLote_` (`05_Escritura.js`); la excepción de STATUS, aparte, en
  `marcarRealizadaLote_`. La lectura fresca por tanda es a propósito: el equipo puede cargar algo
  entre que se calcula el plan y se escribe, y eso no se pisa (test [4]).
- **Corte propio** antes de `UPSERT_CORTE_PROPIO_MS` (4,5 min desde el arranque): no se empieza una
  tanda si con la más lenta vista se pasaría. Se corta **entre tandas, nunca a mitad de una fila**.
  "Hasta dónde llegó" queda en una propiedad del script (`UPSERT_ESCRITURA_INCOMPLETA`) y en
  `REGISTRO_UPSERT` (`escritura_completa`, `filas_por_escribir`); la corrida siguiente **sigue sola**:
  las filas ya escritas entran por `RDV_UID` y sólo se completan sus celdas vacías. No hay cursor por
  número de fila (regla del 02/10).
- **Se lee una sola vez**: `B` una vez (como antes) y el destino una vez para el plan —las figuras
  conocidas salen del mismo bloque, ya no de una segunda lectura—. Las filas que en esa lectura ya
  tienen todo lleno ni se vuelven a leer. Lo único que se relee es cada tanda, justo antes de
  escribirla. **Leer `B` sigue tardando ~1 minuto** (es el `QUERY` sobre el `IMPORTRANGE`): lo
  arregla la decisión 1 (`openById`), pendiente.
- **Las filas con `RDV_UID`** completan sólo datos y STATUS; su traza es la de la decisión original
  y no se rellena con `rdv_uid` / 1.
- **Paso 16**: línea de base por solapa; **filas incompletas** (con `celdasDeDecision_`, la misma
  función que usa la escritura); **la lista de las filas con `RDV_UID`** (fila, figura, fecha,
  formulario; hasta 300, después sólo las que difieren) y, para cada una, **si hoy el plan la
  escribiría igual**.
- **Huellas** en el log de cada plan y en `REGISTRO_UPSERT`: un hash corto del destino, de `B`, de
  las figuras y de `Comunas`, y uno del plan (punto 3, abajo).

**Test en Node** (`node tests/escritura_lote.test.js [--viejo]`, no sube a Apps Script; datos
sintéticos, 800 filas; reloj simulado donde cada lectura vacía la cola de escrituras):

| | resultado |
|---|---|
| código viejo, mismo modelo | se corta por el límite con 169 filas; escalado a la velocidad medida el 02/10 (123 filas / 255 s) → factor 1,38 |
| **código nuevo, 800 filas, calibrado** | **escritura 15,1 s**, ejecución 122 s (leer B 60 s y calcular 45 s, supuestos); 16 tandas, 38 lecturas y 233 escrituras al servicio |
| con el servicio el doble de lento | escritura 21,8 s |
| con el servicio 50 veces más lento | se corta sola 3 veces, ninguna corrida pasa de 278 s, termina en la 4ª, nada pisado |
| reanudación sobre lo que deja el viejo | las cortadas conservan su `RDV_UID`, se completa lo que falta, 0 incompletas |
| el equipo escribe en el medio | no se pisa ni se pinta |
| guarda | sin la copia, o con un encabezado distinto: error y nada escrito |
| seco contra real, mismas entradas | mismos números y misma huella |

El modelo de tiempo está calibrado contra **un** dato (la corrida del 02/10): es una estimación. La
medición real es la del paso e)2, que deja los ms por tanda en el log.

### i) La prueba del 02/10 17:01, y lo que destapó: los gemelos

**Resultado** (sobre la copia): escritura **completa en una corrida**, 635 filas en 13 tandas,
**13,9 s de escritura y 41 s en total** (la predicción era < 1 min y 2-3 min). **758 filas con
`RDV_UID`**, 0 incompletas, azules manuales **605** (sin cambio). Línea de base de la copia (16:59):
**605 / 6368**, anotada en `LINEA_BASE_AZULES['AAA NOBORRAR']`.

**Paso 16 de las 17:02: HAY PROBLEMAS.**

1. **Invariante = 1**: `VÍNCULO CIUDADANO - Encuentro con vecinos - Clara Muzzio 07/11 Villa
   Pueyrredon` en las filas **309 y 315**. En `B` hay **dos formularios con ese mismo nombre**. La
   315 se quedó con uno; la 309 perdió el invariante, se re-evaluó sin ése y **tomó el gemelo**
   ("toma otro: … (1)"). El invariante era por formulario, no por nombre, y la traza guardaba sólo el
   nombre: el paso 16 resolvió las dos filas al mismo formulario y lo vio como choque.
2. **"<<< HOY"**: 4 de los 5 avisos (134, 309, 315, 768) eran el mismo problema: el paso 16 elegía
   uno de los gemelos por nombre y el plan, el otro. El quinto (645) era otro defecto: el recálculo
   del paso 16 evaluaba la fila sola, sin el invariante, y la 645 se escribió con lo que decidió el
   invariante (`Educación - Eje Oeste`, 498 = 498).

**Lo que cambió (02/10 noche):**

- **`form_clave`**, sexta columna de traza: la clave estable del formulario (`claveFormulario_`:
  nombre normalizado + `Fecha_Fin`, **con la hora si `Fecha_Fin` la trae**). El enlace por traza y el
  paso 16 la usan primero; las filas escritas antes (sin `form_clave`) se enlazan por el nombre, y si
  ese nombre tiene gemelos la traza es **ambigua**: se sabe el grupo, no cuál de los dos. El grupo
  queda reservado igual, y sus celdas vacías no se completan a ciegas. Las no ambiguas reciben su
  `form_clave` en la corrida siguiente.
- **Dos formularios vivos con la misma clave** y los dos con inscriptos: ninguno se escribe solo →
  REVISAR por **`clave_repetida`**. Si uno tiene inscriptos y el otro casi cero
  (≤ `MAX_INSCRIPTOS_CASI_CERO` = 5), **regla 3**: el de casi cero no se hizo y se descarta como
  candidato (así la 134, 72 contra 2, y la 768, 116 contra 0, no van a revisión si sus gemelos
  comparten el cierre). **Esto es más fino que "si comparten la clave, revisión"**: lo decidí así para
  no mandar a revisión los casos que la regla 3 ya resuelve. Si se prefiere la versión estricta, es
  sacar el descarte en `marcarGemelos_`.
- **El invariante es por grupo de gemelos** (mismo nombre; desde 0.k, además cierres a 7 días o menos):
  una sola fila puede tener un formulario de ese nombre. La fila que pierde y tenía un gemelo, o que al
  re-evaluarse cae en un gemelo, va a REVISAR por **`formulario_gemelo`** (motivo nuevo). Un grupo
  con dueño por `RDV_UID` no lo toma ninguna otra fila. El chequeo del bloque 0 también es por grupo.
- **Bloque 0b del log** (paso 2 y upsert): los grupos de gemelos de `B` — nombre, cada formulario con
  su fila de B, `Fecha_Fin`, inscriptos, y a qué fila va (o "sin fila", o "descartado por regla 3").
  Marca los pares con cierres a más de 7 días (*¿otra reunión con el mismo nombre?*).
- **Paso 16**: invariante por grupo; filas sin `form_clave` y con traza ambigua, aparte; el **"HOY"
  con el mismo plan del upsert** (`calcularPlan_` entero, con el invariante, sobre el destino sin sus
  `RDV_UID`), comparando por `form_clave` o por nombre; y el desglose de azules (abajo, punto 3).
- **Guarda**: la copia puede tener columnas de traza al final que el real todavía no tiene
  (`form_clave`). Al volver, `paso1_columnasDeTraza()` sobre el real (0.f).
- **Test en Node** (`tests/escritura_lote.test.js`, escenario [8]; `--gemelos` corre sólo ése): la
  309/315 con cierres distintos (la sin barrio va a `formulario_gemelo`), clave repetida, casi cero
  (72 contra 2: se escribe con el de 72), la 645 (el paso 16 dice "igual"), y lo que quedó en la copia
  (el paso 16 lo detecta; corregida la 309, va a `formulario_gemelo` y el paso 16 da 0 avisos).

**Cómo se deshace la 309 en la copia** (y cualquier fila que el paso 16 marque en un choque):

1. En la fila 309 de "AAA NOBORRAR", **anotar qué celdas están en azul**: son las que escribió el
   sistema.
2. **Borrar el contenido** de `RDV_UID`, `form_origen`, `form_score`, `form_nivel` y
   `form_fecha_match`, y de las celdas de sexo y edades (`Masculinos` … `Sin identificar`) **que estén
   en azul**. Las que no están en azul las cargó el equipo: no se tocan.
3. **Sacarles el azul** a esas mismas celdas (color de relleno: ninguno, o el de las filas vecinas).
   No usar "Borrar formato" sobre la fila entera.
4. **`STATUS REUNIÓN` no se toca**: si pasó a `Realizada` en azul, fue por los asistentes de la fila,
   no por el formulario.
5. La próxima corrida: la 309 va a REVISAR por `formulario_gemelo` y no se vuelve a escribir. Si
   vuelve a pasar, el bloque 1 del paso 16 lo marca (invariante por grupo).

En el real, la 309 no debería estar entre las 123: se escribieron en orden de fila y las 123 son las
primeras filas a escribir. El paso 16 sobre el real (0.f) lo confirma.

**Los azules: "5 por fila" contra "2 por fila".** La regla es **una sola, la misma en las
dos corridas**: se pinta `#4F81BD` **cada celda que escribe el sistema, y nada más**. El código viejo
lo hacía celda por celda (`setSiDelSistema_`); el nuevo, con un `RangeList` sobre los mismos bloques
que escribe (`setSiDelSistemaLote_`). En una fila nueva se escriben **5 de traza** (`RDV_UID`,
`form_origen`, `form_score`, `form_nivel`, `form_fecha_match` si hay distancia), más sexo y edades
**sólo donde estaban vacíos**, más `STATUS` si avanza. Las 123 de la corrida cortada eran de 2025, con
sexo y edades ya cargados: **5 por fila** (+619). Con esa regla, las 635 de la prueba tendrían que haber
sumado **al menos 4 o 5 por fila** (≥ 2.500), y sumaron **1.364**. **El código no explica esa
diferencia**, y desde acá no puedo ver la planilla. Las dos explicaciones posibles: en la copia, muchas
celdas de traza **ya estaban en azul** antes de escribir (pintar azul sobre azul no suma), o **el
`RangeList` no pintó todo**. El paso 16 ahora lo dice sin interpretar: **"celdas de traza con valor:
N | de ésas, SIN azul: M"** (tiene que dar 0; si no, es un problema y lista ejemplos) y el **desglose
de azules por grupo** (traza / sexo y edades / STATUS / manuales / otras). **Correrlo sobre la copia
tal como está ahora contesta la pregunta.** El test en Node verifica que cada celda escrita queda en
azul, pero el mock no es Sheets.

**La secuencia, con la predicción anotada antes de correr** (sobre la copia):

1. `clasp push` (hecho con este commit).
2. **`paso16_verificarEscritura()`** tal como está la copia. **Predicción:** invariante **1** (309/315,
   por grupo); bloque 3: la línea "traza con valor / sin azul" contesta el punto 3; traza ambigua:
   las filas con `RDV_UID` cuyo nombre tiene gemelos vivos (al menos la **315** y la **309**).
3. **Deshacer la 309** (arriba).
4. **`paso1_columnasDeTraza()`**: agrega `form_clave` a la copia (sólo el encabezado, al final).
5. **`upsertDestino()`** una vez. **Predicción:** completa; escribe `form_clave` en las filas con
   `RDV_UID` no ambiguas (casi todas las 757); la **309 → REVISAR por `formulario_gemelo`**; el bloque
   0b lista los gemelos de `B` —al menos Muzzio 07/11, `Comuna 1 Sur - 3/9` (0 y 116) y Tapia
   Saavedra 21/8 (72 y 2)—; números del plan cerca de **758 | 39 | 13** (la 309 pasa de escribiría a
   revisar; puede haber otras por `formulario_gemelo` o `clave_repetida`, que el bloque 0b lista).
6. **`paso16_verificarEscritura()`**. **Predicción:** invariante **0**; **0 avisos "<<< HOY" por
   gemelos** (y la 645 "igual"); incompletas **0**; sin `form_clave` **0**; traza ambigua sólo la
   **315** y las que tengan gemelos vivos sin `form_clave` (pocas); azules manuales **605**.

### j) Pendiente: seco contra real

Desde las 14:50 las corridas reales dan **758 | 39 | 13**; el paso 2 en seco de las 14:35 dio **755 |
42 | 13**. La causa no está medida (0.h). **La próxima vez que una corrida en seco y una real
difieran, comparar las huellas** del log o de `REGISTRO_UPSERT` (`huella_entradas`, `huella_plan`):
misma huella de entradas → tiene que ser el mismo plan; distinta → la huella dice cuál de las cuatro
entradas (destino, `B`, figuras, `Comunas`) cambió.

### z) 06/10 noche: AGENDA, ETAPA 2 — crear y actualizar filas del destino (implementado; NADA escribió todavía)

Prompt: [prompts/PROMPT-06-AGENDA-ETAPA2-CREAR-ACTUALIZAR.md](prompts/PROMPT-06-AGENDA-ETAPA2-CREAR-ACTUALIZAR.md) (la versión
del 06/10 22:09, con el punto 17). Para el equipo: [agenda-equipo.md](agenda-equipo.md).

**La etapa 1 quedó cerrada con la segunda corrida (06/10 20:47)**: reuniones del mail con su fila 280/302 (92,7%);
reprogramadas 3; filas del destino sin reunión en el mail 0; fechas corregidas 26; mails afuera 1; desaparecidas con
fila: 9, las 9 "Suspendida"; NO PARTICIPA 74, todas con fila y Realizada; conjuntas 8 de 9 a nombre de la 1ª;
Seguridad en tu Barrio contra RDV CONJUNTO 13/16 (13 iguales al destino); barrio por polígono 93,3% exacto general y
95,7% con la regla de confianza (201/210: 6 barrios vecinos de la misma comuna, 3 donde el sistema coincide con la
comuna del mail y el equipo no).

**La copia "AAA NOBORRAR" ya no existe.** Todo va sobre el destino real, con cuatro protecciones: versión con nombre del
archivo antes de la primera escritura, en seco primero, una semana primero (`AGENDA_SOLO_SEMANA`) y deshacer (paso 38).
Se sacaron las referencias operativas: `RDV_HOJA_COPIA_PRUEBA` (y su línea de base de azules), `PASO_DERIVADAS_SOLAPA`
(los pasos 25-27 usan `RDV_HOJA_DESTINO`), `paso18_malEscritas_vaciarCopia`, y la copia en 30_Derivadas, diagnostico/07 y
/10. Los tests en Node siguen con una hoja simulada, que ahora se llama como el destino.

**Plan aprobado por el usuario (06/10)**, con sus respuestas: van `agenda_fecha_escrita` y `agenda_status_escrito`;
deshacer borra o vacía sólo las filas creadas **que siguen replicando lo que dice el mail**; Seguridad ambigua → solapa
propia; las fórmulas de las derivadas **ya se sacaron del real** (paso 26 hecho).

**Lo hecho:**

- **`40_Agenda.js`** (nuevo): `correrAgenda(enSeco)` lee Gmail (etiqueta `AGENDA_ETIQUETA_GMAIL`; si la búsqueda falla
  o trae cero, no escribe nada y lo dice), parsea con el parser de la etapa 1 y arma un plan: **crear** (al final),
  **vincular** (fila que ya existía: figura + fecha, u otra figura de la conjunta; sin figura, fecha + lugar),
  **actualizar** (HORA, Dirección y Barrio si cambió la dirección, sólo si la celda todavía tiene lo que escribió el
  sistema), **mover** (reprogramada dentro de la semana), **suspender** (desaparecida siendo futura, fila "en agenda";
  no con versión parcial), **reactivar** (volvió y el "Suspendida" lo había puesto el sistema), **figura** (Seguridad en
  tu Barrio, desde RDV CONJUNTO). Lo ambiguo no se toca y se lista. Al vincular, una celda del equipo que **replica el
  mail** queda anotada como del sistema y sigue al mail; una que dice otra cosa es del equipo para siempre.
- **La tercera excepción anunciada**, `escribirAgendaLote_` (05_Escritura.js; CLAUDE.md sección 0): sólo las columnas
  de `COLUMNAS_QUE_ESCRIBE_AGENDA`, sólo si la celda tiene lo esperado (lectura fresca), STATUS sólo por
  `AGENDA_TRANSICIONES_STATUS` ('' → en agenda, en agenda → Suspendida, Suspendida → en agenda), todo en `#CFE2F3`.
- **Columnas nuevas, al final, después de `form_clave`** (paso 36, sólo encabezados; si `form_clave` es AU):
  AV `No participa`, AW `agenda_uid`, AX `agenda_mail`, AY `agenda_version`, AZ `agenda_hora_escrita`,
  BA `agenda_direccion_escrita`, BB `agenda_barrio_escrito`, BC `agenda_fecha_escrita`, BD `agenda_status_escrito`.
- **Regla de confianza con margen** (`_reglaBarrioConMargen_`, 41_AgendaParser.js): (a) geocodificación "ok", (b) misma
  comuna o mismo barrio que el mail, (c) a más de `BARRIO_MARGEN_M` (100 m) de otro barrio, (d) celda vacía.
- **REGISTRO_AGENDA** (una línea por corrida) y **REGISTRO_AGENDA_CAMBIOS** (cada celda con antes, después y fondo) en la
  intermedia; **AGENDA_VIEJAS_SIN_FILA** (reuniones viejas del mail sin fila, no se crean) y **AGENDA_FIGURA_A_COMPLETAR**.
- **Punto 17 — la copia en el archivo "Agenda"** (`AGENDA_COPIA_SS` = `1_W4qry…`, solapa "Agenda"): una fila por
  reunión, 23 columnas (Semana … Última actualización), ordenada por fecha y hora, vigente / reprogramada / desaparecida,
  con la fila y el STATUS del destino, el asunto con link al mensaje de Gmail, la semana en curso destacada, protegida
  con advertencia; se reescribe entera en cada corrida real (en seco sólo dice cuántas filas). Deshacer no la toca.
  `AGENDA_COPIA_DESDE` (null) fija "desde que arranca Agenda".
- **Corre en el activador de cada hora** con `AGENDA_ACTIVA = true` (hoy `false`): dentro del bloqueo del upsert y antes
  del cruce con los formularios. Nunca en el paso 22.
- **Paso 16**: bloque 6 "filas de agenda" (duplicados figura + fecha: tiene que dar 0; "en agenda" vencidas hace más de
  `AGENDA_DIAS_VENCIDA` días: aviso; celdas editadas por el equipo: informativo) y el control de Barrio descuenta lo que
  escribió la agenda. **Paso 20**: por qué están vacíos Barrio y Figura.
- **Paso 35 / 35b**: la regla con margen sobre las filas del paso 31; las desaparecidas futuras / ya pasadas contra el
  STATUS y las reprogramaciones entre semanas.
- El parser pasó a **`41_AgendaParser.js`** y los polígonos a **`42_BarriosCabaGeo.js`** (código de producción);
  `diagnostico/16` quedó con las mediciones.
- **Tests**: `tests/agenda_escritura.test.js` (nuevo, 10 escenarios: en seco, crear y vincular sin duplicar,
  actualizar sólo lo del sistema y no lo editado, mover, suspender, "ya había pasado", reactivar, protección del 60%,
  Seguridad sin figura, deshacer, la guarda, el margen, AGENDA_SOLO_SEMANA, las columnas, la copia en "Agenda");
  `tests/agenda_parser.test.js`; `tests/escritura_lote.test.js` sin la copia y con el [23] (una fila sin Figura en el
  cruce con los formularios). Todo en verde.

**Choques con lo que ya existía, y cómo quedaron:**

1. *Invariante*: actualizar pisa celdas → **tercera excepción anunciada** (arriba), auditada por un grep como las otras dos.
2. *STATUS*: CLAUDE.md 3.4 decía que "Suspendida" es decisión de una persona. **Cambio de regla del usuario (regla 7)**: la
   agenda puede pasar "en agenda" → "Suspendida" y volver, sólo si el "Suspendida" lo puso ella.
3. *Barrio manual*: sigue en `COLUMNAS_MANUALES` para el upsert de formularios; la agenda lo escribe sólo por su
   excepción. El paso 16 descuenta esas celdas.
4. *Borrar filas* (CLAUDE.md §6): deshacer **borra** sólo si las filas creadas son las últimas; si no, las **vacía**.
5. *Fichas*: Seguridad ambigua NO va a REVISAR_MATCH: va a `AGENDA_FIGURA_A_COMPLETAR` (las fichas eligen formularios,
   no figuras); el equipo carga la Figura en la fila.
6. *El archivo "Agenda" y el legado*: el ID nuevo (`1_W4qry…`, creado el 06/10, de reporteseinformesgcba@gmail.com) **no
   lo abre ningún código del legado**. El legado (`Agenda traer datos del mail.js`, `Agenda push a base.js`,
   `Solapa agenda base final.js`) lee y escribe OTRO archivo, `RDV_SS_AGENDA` = `1hP8zMN8…`. El único activador vivo del
   legado de Agenda era `syncAgendaSheetInBaseFromAgenda_2` (espejo de ese archivo viejo en una solapa "Agenda" del
   archivo del destino): **no se mezcla con la copia nueva**, pero conviene confirmarlo con `paso23_listarActivadores()`
   y **no correr a mano `agenda_syncFromEmails` ni `agenda_pushReadyToBaseFinal`** (escriben en `Para Revisar`). **La
   cuenta que corre el script tiene que ser editora del archivo "Agenda" nuevo.**

**La secuencia, con la predicción anotada ANTES de correr** (también en la cabecera de 99_Correr.js):

1. **Versión con nombre** del archivo del destino (Archivo → Historial de versiones → Asignar un nombre).
2. **`paso35_medirReglaBarrio()`** → **Predicción**: con el margen de 100 m cumplen **menos que las 210** de la regla sin
   margen (cobertura por debajo del 80,8%; estimo 170-195) y el **exacto sube a ~98-99%**: salen casi todos los 6 bordes;
   los 3 de "comuna del mail" no se mueven (no son de borde). **`paso35b_medirDesaparecidas()`** → de las desaparecidas de
   la ventana, las 9 con fila "Suspendida" caen en **"futura al desaparecer"**; las que ya habían pasado, con fila
   Realizada. Reprogramaciones entre semanas: **pocas (0-3)** — si son muchas, se vinculan en vez de crear otra.
   → aprobar el margen.
3. **`paso36_columnasAgenda_enSeco()`** → faltan las 9, desde **AV** (si la última es `form_clave` en AU).
   **`paso36_columnasAgenda()`** → las 9, al final; volver a correrlo no hace nada.
4. **`AGENDA_SOLO_SEMANA = '2026-10-05'`** (o el lunes de la semana en curso), clasp push, **`paso37_agenda_enSeco()`** →
   **Predicción**: unas **10-15 reuniones** de la semana (302 en ~26 semanas); como el equipo carga las filas de la semana,
   **casi todas VINCULAR** y CREAR sólo las que todavía no cargó (0-5); suspender 0-1; ambiguas 0; editadas por el equipo
   algunas (HORA o Dirección cargadas distinto del mail); duplicados 0. La tabla "EVENTO que escribe hoy el equipo, por
   tipo" dice si hay que ajustar `AGENDA_EVENTO_POR_TIPO` antes de escribir. Copia en "Agenda": escribiría tantas filas
   como reuniones.
5. **`paso37_agenda()`** (real, esa semana) → escribe lo mismo que dijo el seco. **`paso16_verificarEscritura()`** → bloque
   6: **duplicados 0**; Barrio "sin subir" salvo lo de la agenda; mirar las filas en la planilla y el archivo "Agenda".
6. **`AGENDA_SOLO_SEMANA = null`**: en seco → **Predicción**: las semanas de los últimos 30 días, ~50 reuniones, casi todas
   VINCULAR (las pasadas ya tienen fila), CREAR casi 0 → real → paso 16.
7. **`AGENDA_ACTIVA = true`** (entra al activador de cada hora) y `AGENDA_COPIA_DESDE` = el lunes de la primera semana.

Si algo sale mal: **`paso38_deshacerAgenda_enSeco()`** → **`paso38_deshacerAgenda()`** (la última corrida que escribió).

**Resultados de `todas()` del 06/10 22:33** (pasos 35, 35b, 36 en seco, 37 en seco, con `DIAG_MAILS` y Gmail):

- **Regla 7 confirmada**: 24 desaparecidas, **todas futuras al desaparecer**; las 9 con fila, "Suspendida". Entre
  semanas: 5; en las 3 con fila vieja el equipo hizo suspender + crear → **queda el comportamiento por defecto** (no
  vincular).
- **Margen de 100 m APROBADO**: 175 cumplen, **97,1% exacto** (5 distintos, todos a más de 200 m del borde: criterio del
  equipo, no error). Contra la predicción (170-195, ~98-99%): cobertura dentro, exacto un poco por debajo.
- **Dos problemas**: Gmail leyó **sólo 10 mails** (faltaban las semanas del 14/09, 21/09 y 28/09), y abrir la intermedia
  falló tres veces (timeout) y la ejecución terminó en error.

**Ajustes (07/10), hechos:**

1. **Gmail por etiqueta O asunto** (`leerMailsAgendaGmail_`): la etiqueta, más `subject:("…") newer_than:Nd` con
   `AGENDA_ASUNTOS_GMAIL` ("Agenda Encuentros de vecinos" y "Agenda de Encuentros con Vecinos"), sin duplicar (por id de
   mensaje). El log lista cada mail (fecha, asunto, si su hilo tenía la etiqueta), las semanas + grupo del alcance y
   **avisa las semanas del alcance sin ningún mail**. El grupo de "Agenda de Encuentros con Vecinos con JM - Semana…"
   ahora sale bien (antes tomaba el primer "con").
2. **La intermedia**: se abre **una vez por corrida** (`intermediaAgenda_`, el mismo objeto que `ssIntermedia_()`), con
   reintentos de **2, 5 y 10 s**; las escrituras, en tandas con los mismos reintentos. Las solapas informativas y la
   cache de geocodificación **no hacen fallar la corrida** (tampoco las de medición del paso 31). **REGISTRO_AGENDA es
   obligatorio**: la corrida real escribe primero la línea de la corrida y TODOS los cambios planeados (con lo que se
   espera encontrar, el fondo y el `agenda_uid` de la fila) y, si no puede, **no escribe el destino**. El peso:
   **`paso39_medirIntermedia()`** (sólo lectura) mide por solapa celdas asignadas y con datos, fórmulas, la de A1 y el
   tiempo de abrir y de leer, y propone qué sacar. **Propuesta, a confirmar con esa medición**: mover a un archivo de
   diagnóstico aparte (o borrar) las solapas de medición de una vez —`DIAG_*` (DIAG_MAILS es la más grande: 376 cuerpos
   de hasta 8000 caracteres), `AGENDA_MAIL`, `AGENDA_MAIL_DESAPARECIDAS`, `AGENDA_CRUCE`, `AGENDA_DESTINO_SIN_MAIL`,
   `AGENDA_BARRIO_DIRECCION`, `AGENDA_SEGURIDAD` y las `*_PRUEBA` / `*_DEMO`—; quedan B, Asistentes, `AGENDA_GEOCODE`, los
   registros y los reportes de cada corrida. **B**: un `QUERY(IMPORTRANGE)` se recalcula del lado de Google, no al abrir
   con `openById`; lo que pesa al abrir son las celdas asignadas (el paso 39 dice cuántas).
3. **EVENTO como lo escribe el equipo** (`AGENDA_EVENTO_POR_TIPO` + `eventoAgenda_`): Seguridad en tu Barrio →
   "Encuentro con Vecinos"; Temático → `Encuentro Temático "<tema>"`; Primera Persona → `Encuentro "Primera Persona" con
   <invitado>`; "1 a 1" → "Uno a uno"; Encuentro con Vecinos, igual. El tema y el invitado salen del evento del mail
   (entre comillas, o el texto hasta la primera coma sin las figuras). **"Café con Vecinos": sin confirmar** (no apareció
   en el destino; la tabla del paso 37 en seco lo va a mostrar cuando aparezca). Como el EVENTO de Seguridad ya no la
   distingue, **una fila de Seguridad se reconoce por la Figura vacía** (con `agenda_uid`).
4. **Filas de Seguridad sin figura: toleradas, verificado**. El cruce con los formularios: no se rompe y no les escribe
   Figura (test [23]); un formulario sin figura de esa comuna y fecha sí puede escribirles los inscriptos (la regla de
   siempre). Asistentes: RDV CONJUNTO cruza por figura → no cruza nada, sin error. Las derivadas: se calculan (toman
   las filas con Figura **o** FECHA). Paso 16: sólo controla incompletas en filas con RDV_UID. **Paso 20: sus celdas
   vacías dicen "k) pendiente de figura"**, no "DEBERÍA ESTAR ESCRITA" (test [23]).
6. **Regla 7, decisión del usuario: BORRAR la fila creada por la agenda y sin tocar** (`filaIntocadaAgenda_`): la creó
   la agenda (`agenda_uid` "c-…"; las vinculadas o suspendidas llevan "v-…"), HORA / Dirección / FECHA / Barrio / STATUS
   siguen con lo anotado, Figura / EVENTO / "No participa" con lo del mail, STATUS "en agenda", y **ninguna otra celda**
   cargada (ni RDV_UID / form_*, Asistentes, Oradores, Observaciones, One Page…). Si no cumple todo, "Suspendida" como
   antes. **Se verifica dos veces**: al registrar (lectura fresca) y otra vez justo antes de borrar, con el bloqueo
   tomado; si cambió en el medio, no se borra (y en el registro queda "borrar_cancelado"). La fila borrada **queda
   entera** (valores y fondos) en REGISTRO_AGENDA_CAMBIOS y **deshacer la restaura** al final. Si la reunión vuelve a
   aparecer, se crea de nuevo. En el archivo "Agenda": "desaparecida (fila borrada)", sin fila. En seco, el log lista
   **BORRAR** aparte de **SUSPENDER**. `borrarFilaAgenda_` (05_Escritura.js) verifica el `agenda_uid` antes de borrar.
   - **6e — qué depende del número de fila**: las fichas de REVISAR_MATCH y ELECCIONES_MATCH, **no** (figura + fecha +
     barrio; se regeneran en cada corrida del upsert); **deshacer, no** (busca la fila por `agenda_uid`); lo que escribe
     la misma corrida de la agenda después de borrar (`AGENDA_FIGURA_A_COMPLETAR`, la columna "Fila del destino" de la
     copia) **se corrige** con el número de después (`ajustarFila`); SIN_MATCH, EMPAREJAR_MANUAL y HISTORICO_SIN_RESOLVER
     muestran números informativos que el upsert regenera en la misma corrida de cada hora (la agenda corre antes). Los
     números fijos del paso 21 (`PASO21_FILAS`) son de una vista previa manual.
- **`todas()`**: la escribiste en el editor, al principio de `00_Config.js`. **Se movió tal cual a `99_Correr.js`**: un
  `clasp push` reemplaza el proyecto entero con lo del repo y la habría borrado. Conviene no dejar código sólo en el
  editor.
- Tests: `tests/agenda_escritura.test.js` [11] borrar / suspender / deshacer / volver a crear, [12] EVENTO, el grupo y
  Gmail por etiqueta o asunto, [13] reintentos y REGISTRO obligatorio; `escritura_lote` [23] ampliado (derivadas,
  Asistentes, paso 20). Todo en verde.

**La próxima corrida, con la predicción anotada ANTES**: `AGENDA_SOLO_SEMANA = '2026-10-05'`, clasp push, **`todas()`**:

- **paso 35 / 35b**: lo mismo que el 06/10 (miden la ventana con `DIAG_MAILS`; la semana no los afecta): 175 cumplen,
  97,1%; 24 desaparecidas futuras, 9 con fila Suspendida; entre semanas 5.
- **paso 36 en seco**: faltan las 9 columnas desde **AV** (si todavía no corriste `paso36_columnasAgenda()`).
- **paso 37 en seco, semana del 05/10 al 11/10**: Gmail lee desde el 28/09 (el lunes − 7 días): **más de 10 mails**,
  con los de la semana del 28/09 y los de esta (por etiqueta o asunto); **"semanas del alcance SIN ningún mail: ninguna"**;
  sin timeouts de la intermedia (y si aparece uno, los reintentos lo dicen en el log y la corrida termina igual).
  Reuniones de la semana **~10-15**: casi todas **VINCULAR** (el equipo ya las cargó), **CREAR 0-5**, **BORRAR 0**
  (todavía no hay ninguna fila creada por la agenda: "c-…"), SUSPENDER 0-2, ambiguas 0; la tabla de EVENTO muestra las
  formas del equipo y lo que se escribiría ya coincide ("Encuentro con Vecinos", "Uno a uno", "Encuentro Temático
  \"…\""). La copia en "Agenda": escribiría tantas filas como reuniones de la semana (+ las desaparecidas).

**`todas()` del 06/10 23:10** (con `AGENDA_SOLO_SEMANA = '2026-10-05'`): **Gmail OK** (33 mails, 9 semanas + grupo; casi
todos SIN la etiqueta desde el 09/09: **buscar por asunto queda fijo**). VINCULAR 35 OK. EVENTO OK. Dos problemas:

1. **Duplicado**: CREAR 821 y 822 eran la misma reunión (Jorge Macri, 08/10 17:15, Eje Norte), en el mail de CM y
   Ministros y en el de JM. **La causa** (reproducida en el test [14]): la unificación entre grupos comparaba la clave de
   cada mail, y esa clave suma la hora cuando un mail trae **dos** reuniones de la figura ese día. Con CM trayendo 10:00 y
   17:15 y JM sólo 17:15, la 17:15 de CM ("…|17:15") no se juntaba con la de JM, la 10:00 de CM se juntaba (mal) con
   ella, y la 17:15 se creaba dos veces (y la 10:00 se perdía). **Arreglo** (`_unificarEntreGrupos_`, 41_AgendaParser.js):
   dos reuniones de grupos distintos son la misma si tienen la misma figura (o, sin figura, el mismo lugar), la misma
   fecha y además la misma hora, o el mismo tipo y lugar, o cada grupo trae una sola de esa figura ese día; queda la
   versión más nueva. Y **el control de "ya existe fila" mira también lo que se va a crear en la misma corrida**
   (figura + fecha + hora): una segunda vez no crea otra fila (log "DUPLICADA EN LA CORRIDA").
2. **Timeout en la intermedia, otra vez**: falló REGISTRO_AGENDA y la ejecución terminó en Error en el flush final.
   - **El peso** (Drive, 07/10, rangos con datos): **47 solapas, ~278.000 celdas con datos**. Las de medición de la etapa 1
     (DIAG_MAILS, AGENDA_MAIL, AGENDA_MAIL_DESAPARECIDAS, AGENDA_CRUCE, AGENDA_DESTINO_SIN_MAIL, AGENDA_BARRIO_DIRECCION,
     AGENDA_SEGURIDAD) son ~43.000 (**15,5%**). **Lo que más pesa son restos del legado y diagnósticos viejos: ~165.000
     (59%)**: C (1072×32), Reporte Sincronización BF (4775×8), DIAG_PISADO (4011×7), Copia de B, Hoja 10, B2, A2,
     DIAG_TOTAL_DIVERGENTE, DIAG_ATOMICIDAD, TEST CLAVES… B es A1:Z (833×26). REGISTRO_AGENDA estaba vacía (nunca se pudo
     escribir). `paso39_medirIntermedia()` mide además las celdas ASIGNADAS (que cuentan aunque estén vacías), las
     fórmulas y el tiempo de abrir y de leer.
   - **`paso39_limpiarIntermedia_enSeco()` / `paso39_limpiarIntermedia()`**: borra las 7 de medición de la etapa 1
     (`SOLAPAS_MEDICION_ETAPA1`). **Ningún paso de producción las lee** (sólo los diagnósticos 03 y 16; el 16, sin
     DIAG_MAILS, lee Gmail). Nunca borra B, Asistentes, AGENDA_GEOCODE, REGISTRO_*, ELECCIONES_MATCH, los reportes
     (una lista con alguna de ésas da error y no borra nada).
   - **Propuesta, a confirmar**: `paso39b_limpiarLegado_enSeco()` lista los restos del legado (`SOLAPAS_LEGADO_INTERMEDIA`,
     23 solapas); `paso39b_limpiarLegado()` los borra sólo con `LIMPIAR_LEGADO_CONFIRMADO = true`. A2 y B2 no están en esa
     lista (las leen los pasos 1-4 del legado, apagados): se deciden aparte.
   - **Si con eso no alcanza**: `paso40_archivoRegistros()` crea "RDV registros" (liviano), copia REGISTRO_AGENDA y
     REGISTRO_AGENDA_CAMBIOS y dice el ID para `RDV_SS_REGISTROS`; desde ahí la agenda registra ahí (y deshacer lee de
     ahí). Los otros registros (REGISTRO_UPSERT) siguen en la intermedia.
   - **Cada archivo se abre UNA vez** por corrida (`intermediaAgenda_`, `registrosAgenda_`), con reintentos; **flush
     después de cada escritura** del registro (con reintentos) y **un flush final explícito** que, si falla, se loguea
     sin terminar en Error. En la corrida real, REGISTRO_AGENDA va ANTES de tocar el destino (ya era así).
   - **Los pasos de medición (29-32, 35) ya no escriben sus solapas** salvo `MEDICION_ESCRIBE_SOLAPAS = true`: todo
     queda en el log (la cache AGENDA_GEOCODE sí se sigue actualizando).
3. **AGENDA_FIGURA_A_COMPLETAR "1 fila" contra el log "0"**: **el log estaba bien**. La fila era el renglón "(ninguna)"
   que se ponía cuando no había nada, y el log genérico de la solapa lo contaba. Se sacó el renglón: sin casos, la
   solapa queda con el encabezado solo, y los dos números coinciden.
4. **Caso para el equipo** (no bloqueante): listado en docs/agenda-equipo.md, "Casos para revisar".

**La próxima corrida, con la predicción anotada ANTES**:

1. `paso39_limpiarIntermedia_enSeco()` → borraría las 7 de medición (~43.000 celdas con datos). `paso39_limpiarIntermedia()`.
2. `todas()` con `AGENDA_SOLO_SEMANA = '2026-10-05'`: pasos 35 y 35b ahora leen Gmail (siete meses; tardan más) y dan lo
   mismo que el 06/10 (175 / 97,1%; 24 futuras, 9 Suspendida; 5 entre semanas). **Paso 37 en seco: CREAR 10 (sin el
   duplicado), VINCULAR 35, "DUPLICADA EN LA CORRIDA" 0 (la unificación ya la resuelve), REGISTRO_AGENDA escrito (el log
   dice "línea de la corrida … escrita") y la ejecución termina sin Error.**
3. Si REGISTRO_AGENDA vuelve a fallar: `paso40_archivoRegistros()`, poner el ID en `RDV_SS_REGISTROS`, clasp push, y otra vez.

**Corrió el 07/10 10:20 (en seco): OK** — CREAR 10, VINCULAR 35, el duplicado de la misma corrida resuelto,
REGISTRO_AGENDA escrito, sin Error.

#### Ajustes del equipo, antes de la primera corrida real (07/10; prompt 07, [PROMPT-07](prompts/PROMPT-07-AGENDA-AJUSTES-EQUIPO.md))

**A. Quién creó y quién tocó cada fila.** Dos columnas nuevas, del sistema:
- **"Origen fila"**: *sistema (agenda)* en las que crea; *equipo + agenda* en las del equipo que vincula; *equipo* en
  las del equipo **del alcance de la agenda** (la semana, con `AGENDA_SOLO_SEMANA`; si no, desde hoy − 30) que la agenda
  no vincula. Las más viejas no se tocan.
- **"Tocado por el equipo"**: en las filas de la agenda, las columnas que el equipo cambió contra lo que escribió el
  sistema (FECHA, HORA, Dirección, Barrio, STATUS — contra `agenda_*_escrita`; pasar a Realizada no cuenta). Se
  recalcula en cada corrida (`tocadoPorEquipoAgenda_`); si el equipo vuelve al valor del mail, se vacía.

**B. La forma del equipo.** `paso41_medirFormatoEquipo()` (diagnostico/18_formato_equipo.js, sólo lectura) mide, en
las filas del equipo de los últimos 3 meses: tipo, formato de celda, mayúsculas y 5 ejemplos de Figura, Barrio,
EVENTO, FECHA, HORA, Dirección y STATUS; Dirección con nombre de lugar o sólo calle; EVENTO con eje o Seguridad; el
STATUS de las futuras; la HORA del equipo contra la del mail. Y dice qué poner en tres perillas nuevas (00_Config.js),
que arrancan con lo que venía haciendo la agenda: `AGENDA_DIRECCION_FORMA = 'completa'` (o `'calle'`),
`AGENDA_EVENTO_CON_EJE = false`, `AGENDA_HORA_AJUSTE_MIN = 0`. `AGENDA_COPIAR_FORMATO = true`: las filas nuevas toman
el **formato numérico** de la última fila (sólo el formato numérico, nunca fondos: `copiarFormatoNumericoAgenda_`).
**Nada del mail se pierde**: columnas nuevas **"Evento (mail)"**, **"Lugar (mail)"**, **"Dirección (mail)"**,
**"Marcas (mail)"**, **"Conjunta con"** (todas las otras figuras nombradas, participen o no; corregido el 07/10) y la que ya estaba, "No participa"; en las creadas y
en las vinculadas, y se actualizan con cada versión del mail (sólo lo que cambia).

**Las columnas.** `COLUMNAS_AGENDA` pasa de 9 a **16**; el paso 36 agrega las 7 que faltan, al final. Con form_clave en
**AU**, las 16 quedan en **AV..BK** (las 9 de antes en AV..BD si ya se habían agregado; las nuevas en **BE..BK**).

**C. Duplicados.**
- **Antes de crear** (punto 7): una fila del equipo (sin agenda_uid) con la misma figura a ±`AGENDA_DUP_DIAS` (2) días,
  o la misma fecha y comuna con otra figura o sin figura → **no se crea**; va a **AGENDA_DUPLICADOS**, en el archivo del
  destino, como las fichas: ELEGIR (desplegable *Es la misma: vincular / Son distintas: crear / No sé*) y COMENTARIO
  adelante, únicas celdas editables, protección real; la identidad en columnas ocultas (la reunión: figura + fecha +
  hora; la fila: figura + fecha + barrio, nunca el número). Se lee en la corrida siguiente y se guarda en
  **ELECCIONES_AGENDA** (archivo de registros o intermedia). "Vincular" sigue valiendo en las corridas siguientes aunque
  la fila del equipo tenga otra fecha. **La figura que "NO PARTICIPA" no cuenta** (test). **Las Seguridad sin figura no
  cambian**: siguen vinculando por fecha + comuna, como desde el 06/10 (es la regla que dio 13 de 16).
- **Después de crear** (punto 8): una fila del equipo igual o casi igual a una creada por la agenda → se lista en
  AGENDA_DUPLICADOS como "después de crear", informativa. **El sistema nunca borra ni fusiona.**
- **La fila que creó la agenda y borró el equipo no se recrea** (punto 9) mientras la reunión siga en el mail: log
  "BORRADA POR EL EQUIPO", "borrada por el equipo" en REGISTRO_AGENDA_CAMBIOS (una vez) y en el archivo "Agenda". Se
  sabe por el historial: cada fila creada deja una línea `crear_id` (agenda_uid → la reunión) en
  REGISTRO_AGENDA_CAMBIOS; un uid creado que ya no está en el destino, y que no borró la propia agenda (regla 7) ni
  una corrida deshecha, lo borró el equipo. Si la reunión sale del mail, se anota `olvidar_borrada`: si vuelve, se
  crea. **Si el historial no se puede leer, la corrida real no crea nada** (podría recrear una borrada); en seco sí
  las cuenta.
- **Paso 16** (punto 10): los casi duplicados de las filas creadas por la agenda (informativos), "Origen fila" por
  valor y "Tocado por el equipo" por columna. REGISTRO_AGENDA suma `borradas_equipo` y `duplicados`.

**D.** [agenda-equipo.md](agenda-equipo.md): el resumen de arriba, para el equipo.

**E.** Tests en Node: agenda_escritura [17]–[21] (forma y columnas del mail, Origen y Tocado, casi duplicado que pregunta
y aplica lo elegido, duplicado posterior listado, fila borrada no recreada y recreada al volver, sin historial no crea).

**La primera corrida real, con la predicción anotada ANTES** (`AGENDA_SOLO_SEMANA = '2026-10-05'`, clasp push):

1. `paso41_medirFormatoEquipo()` (sólo lectura). Si propone otra cosa para las tres perillas, cambiarlas, clasp push.
2. **`semana()`**: paso 36 real (agrega las columnas que falten, al final) → paso 37 **real** → paso 16. Se corta en el
   primer error. Predicción del prompt: **CREAR 9, VINCULAR 0, AGENDA_DUPLICADOS vacía, "Origen fila" = "sistema
   (agenda)" en las 9, "Tocado por el equipo" vacío.**
   > **Ojo, la predicción del prompt no cierra con la última en seco**: el 07/10 10:20 dio VINCULAR **35**, y nada de
   > este cambio deja de vincular. Si ninguna corrida real escribió todavía, lo esperable es **VINCULAR 35** (y esas
   > 35 con "Origen fila" = *equipo + agenda* y las columnas "(mail)"), y **CREAR + AGENDA_DUPLICADOS (antes) = 10**:
   > una de las 10 puede pasar a preguntar si hay una fila del equipo parecida. "Origen fila" = *equipo* en las filas
   > del equipo de esa semana que el mail no trae. "Tocado por el equipo" vacío. REGISTRO_AGENDA escrito, sin Error.
3. Para volver atrás: `paso38_deshacerAgenda_enSeco()` → `paso38_deshacerAgenda()`.

#### `semana()` (07/10 11:52) y los ajustes antes de abrir el alcance

**Resultado**: las 9 filas **812–820** bien (formato del equipo, barrio en 6 de 9 con los motivos correctos, derivadas,
Origen fila, No participa, la hora de la última versión; Clara Muzzio 07/10, desaparecida en la v3, no se creó). Seis
ajustes:

1. **`agenda_version` quedó como 46084**: Sheets en español leyó "3 de 3" como el 3 de marzo. Ahora las columnas de
   traza llevan su formato **antes** de escribir (`AGENDA_FORMATO_COLUMNAS`: `agenda_version` texto `@`); lo mismo
   "Versión" en el archivo "Agenda" y "antes"/"despues" de REGISTRO_AGENDA_CAMBIOS (si no, deshacer tampoco reconocía
   la fila como intacta: lo encontró el test).
2. **`agenda_hora_escrita` (0,6979…) y `agenda_fecha_escrita` (46301,5)**: formato `h:mm` y `d/MM/yyyy`. Y la
   comparación (`valorAgendaComparable_`) entiende los números de serie: **la FECHA por día** (46301 = 46301,5) y la
   hora por su parte fraccionaria, así "Tocado por el equipo" y "editada por el equipo" no dan falsos.
3. **"Re:" / "Fwd:"**: el parser leía el **texto citado** del mail anterior (`_limpiarLineaAgenda_` le saca el ">"):
   Macri 08/10 Eje Norte salía dos veces. `_cuerpoPropioAgenda_` (41_AgendaParser.js) corta en "El … escribió:" /
   "On … wrote:" (también partido en dos líneas), "-----Mensaje original-----", el separador de Outlook y, **sólo en un
   asunto Re:/RV:/Fwd:**, en las líneas con ">" (en una agenda podría ser una viñeta). En un reenvío se queda con el
   mensaje reenviado, una vez, sin su encabezado (la semana se sigue buscando en el cuerpo completo). Un "Re:" sin
   agenda propia (sólo "gracias" y la cita) **no cuenta como versión**. Una desaparecida ya no "vuelve" por estar
   citada. El log de la agenda y de la medición (paso 29) cuentan citas cortadas, reenvíos y respuestas sin agenda.
   > **Ojo**: si el último "Re:" de una semana trae arriba sólo los cambios, lo que estaba sólo en la parte citada
   > ahora cuenta como **desaparecido**. La protección del 60% cubre los casos chicos, no todos: por eso la próxima
   > corrida real va **después de una en seco que dé SUSPENDER 0 y BORRAR 0** (abajo).
4. **"Agenda": una línea por reunión** (`armarCopiaAgenda_`), con la identidad del destino: la fila si tiene, si no
   figura + fecha + hora; queda la vigente. El log dice cuántas repetidas no se escriben.
5. **"Conjunta con"**: el mismo valor en el destino y en "Agenda", **todas las otras figuras nombradas** (participen o
   no; `conjuntaAgenda_`). "No participa" va aparte. Lombardi 07/10: "Gabino Tapia / Gustavo Arengo Piragine".
6. **Las filas 812–820 se corrigen solas en la próxima corrida real**: la versión que quedó como número/fecha se
   reescribe como texto (con las columnas del mail), el formato de la hora y la fecha de la traza se pone en todas las
   filas de la agenda (sólo formato, ni valores ni fondos), y "Conjunta con" se actualiza donde cambia.

Tests: agenda_parser [9] (Re: con la cita, el "gracias" que no es versión, el reenvío, la viñeta con ">") y
agenda_escritura [22] (versión como texto, formatos, FECHA por día, la corrección de las filas viejas, "Conjunta con"
igual en los dos lados, una línea por reunión).

**Las próximas corridas, con la predicción anotada ANTES** (sigue `AGENDA_SOLO_SEMANA = '2026-10-05'`):

1. `paso37_agenda_enSeco()`: **CREAR 0, SUSPENDER 0, BORRAR 0**; las 9 filas con la versión a reescribir (acción
   "mail") y Lombardi con "Conjunta con"; el log: citas cortadas ≥ 1 (el "Re:" de JM). Si da SUSPENDER o BORRAR > 0,
   **no seguir**: es lo del "Ojo" de arriba, y se mira antes.
2. `semana()` (real): corrige las 812–820 (versión como texto, formato de la traza, "Conjunta con"); "Agenda" sin
   líneas repetidas.
3. `AGENDA_SOLO_SEMANA = null`, clasp push, `paso37_agenda_enSeco()`: **CREAR 1** (Jorge Macri 01/10 Belgrano, o
   pregunta en AGENDA_DUPLICADOS por la 804/805), **VINCULAR 35**, las 9 de esta semana sin cambios, "Agenda" sin
   líneas repetidas.

#### `semana()` 07/10 13:35: OK — y tres ajustes más

**Resultado**: 10 celdas (agenda_version 9, Conjunta con 1), "Agenda" 10 líneas sin repetidos, paso 16 OK (0
duplicados, 0 casi duplicados, 0 tocadas). El upsert de las 13:29 ya completó formularios, asistentes y oradores en las
filas que creó la agenda (812, 813).

1. **El color heredado**: las 16 columnas AV..BK heredaron el fondo de form_clave (agenda_uid: 784 celdas con color y 9
   con valor). **`paso43_limpiarFondoAgenda()`** (`limpiarFondoAgendaVacias`, 05_Escritura.js; en seco primero) saca el
   fondo de las celdas **vacías** de esas 16 columnas en todo el destino; las que tienen valor no se tocan. **El paso 36
   ya no hereda**: a las columnas que agrega les saca el formato debajo del encabezado. **El paso 16 avisa** (y lo cuenta
   como problema) si hay celdas con el color del sistema y sin valor en cualquier columna del sistema (traza y agenda).
2. **Un "Re:", "RV:", "RE:" o "Fwd:" sólo AGREGA o ACTUALIZA reuniones** (`agendaDesdeListaDeMails_`): el estado de la
   semana es el último mail completo más lo que agregan o actualizan las respuestas posteriores. **Una desaparición la
   produce sólo un mail nuevo con la agenda completa** (el que queda en "la sacó"). La versión parcial (60%) compara
   mails completos. Sin ningún mail completo, la unión. **`paso42_medirRespuestas()`** (sólo lectura) parsea los mails
   con la regla y con el comportamiento anterior y lista las desaparecidas que dejan de serlo (con su fila y su STATUS
   de hoy: si están Suspendida, el Re: era una cancelación de verdad) y las que aparecen.
3. **`AGENDA_CANCELACION_AUTOMATICA = false`**: una reunión futura que desaparece **no se suspende ni se borra sola**: se
   pregunta en AGENDA_DUPLICADOS como "cancelación" (*Se canceló: suspender/borrar* / *Sigue* / *No sé*), con la fila, la
   reunión y el mail que la sacó. Se aplica en la corrida siguiente: "Se canceló" hace lo de la regla 7 (Suspendida, o
   se borra si la creó la agenda y nadie la tocó); "Sigue" no la toca ni vuelve a preguntar (queda en ELECCIONES_AGENDA);
   "No sé" sigue preguntando. En "Agenda": "desaparecida: ¿se canceló?". Con `true`, la regla 7 automática.

Tests: agenda_parser [9] (el Re: sólo agrega; la saca el mail completo; un Re: posterior que la cita no la revive) y
agenda_escritura [23] (paso 36 sin heredar, la limpieza sólo en vacías, el aviso del paso 16), [24] (la cancelación se
pregunta; "Se canceló" y "Sigue") y [25] (el paso 42).

**Las próximas, con la predicción anotada ANTES** (`AGENDA_SOLO_SEMANA = null`):

1. `paso43_limpiarFondoAgenda_enSeco()` → del orden de 16 × ~775 celdas vacías con fondo (agenda_uid: 784 con color − 9
   con valor; igual las otras). `paso43_limpiarFondoAgenda()`. Después, en el paso 16, "color del sistema y SIN valor" en 0.
2. `paso42_medirRespuestas()` (sólo lectura): sin número previo; lo que da es el dato.
3. `paso37_agenda_enSeco()`: **CREAR 1** (Macri 01/10 Belgrano, o pregunta en AGENDA_DUPLICADOS por la 804/805),
   **VINCULAR 35, SUSPENDER 0, BORRAR 0** (con la cancelación preguntada, lo que antes se suspendía sale como "se
   pregunta"), **las 9 de esta semana sin cambios**.

#### La agenda en automático, desde el 07/10

**`AGENDA_ACTIVA = true`** (decisión del usuario), con `AGENDA_SOLO_SEMANA = null` y `AGENDA_CANCELACION_AUTOMATICA =
false`. Verificado en el código (y con un test, escritura_lote [24]):

- `upsertDiario` (el del activador de cada hora) → `upsertDestino()` → con el bloqueo tomado, **la agenda corre ANTES
  del cruce con los formularios** (`_correrUpsertConBloqueo_`, 20_UpsertDestino.js), así el cruce ya ve las filas
  nuevas;
- **si la agenda falla** (Gmail, timeout, lo que sea): queda en el log y, desde hoy, **en REGISTRO_AGENDA** (columna
  error: "la agenda falló dentro del upsert: …"), y **el resto del upsert corre igual**. Un error que la agenda maneja
  sola (sin mails, REGISTRO_AGENDA obligatorio que no se pudo escribir) ya quedaba registrado y no escribe el destino.

**El activador**: el repo (docs/triggers-legado.md) lo tiene como "NO INSTALADO" y desde acá no se puede consultar
(`clasp run` no está habilitado en este proyecto). El upsert de las 13:29 hace pensar que sí está. **Confirmarlo con
`paso23_listarActivadores()`** (sólo lectura): tiene que haber uno de `upsertDiario` cada 1 hora y ninguno del legado a
BORRAR. Si no está: `paso24_instalarActivadorCadaHora()`. Después, anotarlo en docs/triggers-legado.md.

**Qué mirar los primeros días:**

1. **REGISTRO_AGENDA**: una línea por hora, con la columna `error` vacía y `ms` razonable. La agenda y el upsert
   comparten los 6 minutos de la ejecución: si REGISTRO_UPSERT muestra corridas cortadas o la suma se acerca al
   límite, mirar el tiempo de la agenda (Gmail y geocodificación).
2. **El lunes, cuando llega el mail de la semana**: CREAR del orden de la semana entera (35-45 reuniones entre los
   grupos, la mayoría VINCULAR si el equipo ya las cargó). Mirar las filas nuevas: Barrio en las que corresponde,
   "Origen fila", columnas "(mail)".
3. **AGENDA_DUPLICADOS** (archivo del destino): alguien tiene que contestar las preguntas — casi duplicados ("Es la
   misma / Son distintas") y **cancelaciones** ("Se canceló / Sigue"). Mientras no se contesten, no pasa nada: ni se
   crea ni se suspende.
4. **Paso 16** una vez por día: 0 duplicados figura + fecha con fila de la agenda, 0 "color del sistema y SIN valor",
   y "Tocado por el equipo" (qué está corrigiendo el equipo: si es siempre la misma columna, la forma del sistema no es
   la del equipo → paso 41).
5. **El archivo "Agenda"**: sin líneas repetidas; las "desaparecida: ¿se canceló?" coinciden con AGENDA_DUPLICADOS.
6. **El log de la agenda**: "semanas del alcance SIN ningún mail" en ninguna; "respuestas sin agenda propia" y "citas
   cortadas" con números chicos; ninguna "DUPLICADA EN LA CORRIDA".
7. **Si algo sale mal**: `AGENDA_ACTIVA = false` + clasp push la saca del activador; `paso38_deshacerAgenda_enSeco()` →
   `paso38_deshacerAgenda()` vuelve atrás la última corrida.

**Pendiente, sin apuro**: las **18 celdas con color y sin valor en las columnas de traza**. El paso 43 ya cubre también
esas columnas (sólo celdas vacías) y las **lista una por una** en seco: `paso43_limpiarFondoAgenda_enSeco()` →
mirarlas → `paso43_limpiarFondoAgenda()`.

#### Macri 01/10 Belgrano: "ya cargada en otra fila" (07/10, decisión del usuario)

**El caso**: el mail de JM de la semana del 28/09 (versiones del 23/09 y del 25/09, **anteriores** al 29) trae Macri
29/09 10:15 Villa Santa Rita (= la fila 804, Suspendida) y 01/10 15:00 Belgrano. En el destino, la **805** es Macri
29/09 09:55 Belgrano, Realizada: **la del 01/10 es la 805, que se adelantó**. El sistema la comparaba con la 804 (otro
barrio) y preguntaba.

1. **Candidatas** (casi duplicado, AGENDA_DUPLICADOS): si alguna fila tiene el **mismo barrio** que la reunión, ésas son
   las candidatas; si no, las de la **misma comuna**; si no, todas, y **se muestran todas**, una por línea, para elegir en
   la de la fila que corresponde.
2. **La regla del usuario, automática** (`yaCargadaAgenda_`): misma figura + mismo barrio, a ±2 días, con otra fecha, y
   el mail que trae la reunión es **anterior** a la fecha de esa fila → es la **misma reunión**, se adelantó o atrasó:
   **no se crea, no se pregunta y la fila no se toca** (ni se vincula ni recibe las columnas del mail). Queda como "ya
   cargada en la fila N (fecha distinta)": en el log, en REGISTRO_AGENDA (columna `ya_cargadas`), en
   REGISTRO_AGENDA_CAMBIOS (una línea, la primera vez) y en el archivo "Agenda" (estado, y Fila del destino = N). Si el
   mail es **posterior** a la fecha de la fila, son reuniones distintas: se pregunta como antes. Con dos o más filas
   anteriores, también se pregunta. No usa una fila que en la misma corrida ya tomó otra reunión del mail.
3. **AGENDA_DUPLICADOS**: opción nueva **"Ya está cargada en otra fila: no crear"** (en la línea de esa fila): no crea,
   no vuelve a preguntar, queda como "ya cargada".
4. **`paso44_medirYaCargadas()`** (sólo lectura): sobre el historial de los mails, cuántas reuniones sin fila de su
   figura y fecha resuelve la regla, cuántas **contradicen** lo que hizo el equipo (la fila es, a su vez, la de otra
   reunión del mail: tiene que dar 0), cuántas se preguntarían (mail posterior) y cuántas son ambiguas.

Tests: agenda_escritura [26] (el caso Macri 01/10: no crea ni pregunta, la 805 intacta, "Agenda" con la fila; el mail
posterior pregunta con UNA candidata —la del mismo barrio—; la opción nueva) y [27] (el paso 44, y que el plan no usa
una fila que ya tomó otra reunión). El [18] cambió: una fila del equipo de la misma figura y barrio a ±2 días, con el
mail anterior, ahora es "ya cargada" (antes preguntaba).

**Predicción, anotada ANTES** (agenda en automático): `paso44_medirYaCargadas()` → resuelve ≥ 1 (Macri 01/10 → 805),
**contradice 0**. **La próxima corrida no pregunta por Macri 01/10** (queda "ya cargada en la fila 805") **y
AGENDA_DUPLICADOS queda vacía**.

#### La DIRECCIÓN en el cruce con RDV CONJUNTO (07/10, dato del usuario)

En general la dirección de RDV CONJUNTO es la misma que la del destino/mail, aunque escrita distinto. Implementado
**detrás de `CRUCE_CONJUNTO_POR_DIRECCION = false`**: primero se mide.

1. **Comparar direcciones** (`direccionComparable_` / `compararDirecciones_`, 41_AgendaParser.js): minúsculas, sin
   acentos, sin "av./avenida/gral./general/dr./pje.", sin puntuación; la primera parte (antes de la coma) que tenga
   calle + número ("25 de Mayo 1234" es calle "25 de mayo"). **Exacta** (misma calle y número), **parecida** (misma
   calle y número a ±`DIRECCION_NUMERO_TOLERANCIA` (100), o calle con 1-2 letras de diferencia y el mismo número),
   **no**; sin calle y número, no evaluable.
2. **Figura de Seguridad en tu Barrio** (`figuraSeguridad_`): fecha + **dirección** (exacta; si no hay, parecida) >
   fecha + barrio > fecha + comuna. Si la dirección señala UNA sola fila de RDV CONJUNTO, ésa gana aunque el barrio no
   coincida, y queda en el log ("FIGURA POR DIRECCIÓN") y en REGISTRO_AGENDA_CAMBIOS (`figura_por_direccion`, con el barrio
   de RDV CONJUNTO si difiere). Además, una fila **sin barrio** usa la comuna que dice el mail ("Lugar (mail)"): es el
   caso **818** (sin barrio, Comuna 6, "Gral. Manuel A. Rodriguez 1191"), que antes no encontraba candidata.
3. **Asistentes y oradores** (`cruzarAsistentes_`): con 2+ filas de la figura ese día, primero la **dirección**; si no
   desempata, el barrio o la comuna como antes.
4. **`paso45_medirDireccionConjunto()`** (sólo lectura, diagnostico/19_direccion_conjunto.js): cuántas filas de RDV
   CONJUNTO tienen dirección; en los cruces de hoy, % exacta / parecida / distinta; y qué cambiaría con la dirección:
   **CAMBIA** (una fila que hoy cruza iría a otra: **tiene que dar 0**), **RESUELVE** (ambiguas de hoy que la dirección
   desempata, listadas), **PIERDE**; y las Seguridad cuya figura cambiaría.

Tests: agenda_parser [10] (las comparaciones) y agenda_escritura [28] (la 818 con y sin la dirección, el registro, el
desempate de Asistentes y el paso 45).

**Predicción, anotada ANTES** de `paso45_medirDireccionConjunto()`: RDV CONJUNTO tiene columna de dirección (la lee el
legado, `Sinc A to A2.js`); en los cruces de hoy, mayoría exacta o parecida; **CAMBIA 0**; RESUELVE algunas de las
ambiguas de hoy (Macri con 2+ filas el mismo día); **Seguridad: la 818 → la figura de la fila de RDV CONJUNTO con
"Manuel A. Rodriguez 1191"** (si RDV CONJUNTO ya la tiene). Si da eso: `CRUCE_CONJUNTO_POR_DIRECCION = true` + clasp push,
y la próxima corrida de la hora completa la Figura de la 818.

**Paso 45, 07/10 16:31 — PRENDIDO (`CRUCE_CONJUNTO_POR_DIRECCION = true`, decisión del usuario):** RDV CONJUNTO tiene
dirección en **811 de 839** filas (788 con calle y número reconocibles). En los **769 cruces de hoy**, la dirección es
**exacta en el 88,7%** y **parecida en el 6,6%**. **CAMBIA 0, PIERDE 0**. Seguridad: **807 y 808** (01/10, Comuna 1)
pasan de ambiguas a resueltas por dirección exacta, con la misma figura que había cargado el equipo. Desde la corrida
de la hora siguiente al clasp push, el cruce usa la dirección.

#### El archivo "Agenda" en dos solapas (07/10)

**"Agenda"** (`AGENDA_COPIA_SOLAPA`): la semana en curso —y las que vienen, si ya llegó su mail, para que no queden en
ninguna de las dos—. **"Agenda cerrada"** (`AGENDA_COPIA_SOLAPA_CERRADA`): las semanas que ya terminaron, **la más nueva
primero** (y dentro de cada semana, por fecha y hora). Las dos se reescriben en cada corrida y quedan protegidas con
advertencia, con las mismas 23 columnas. La partición es por fecha en cada corrida (`partirCopiaAgenda_`): **el lunes, la
semana que terminó pasa sola a "Agenda cerrada"**. Test agenda_escritura [29].

#### B cambió de columnas (07/10, aplicado directo; no se había escrito nada)

1. **Mapeo** (`COLUMNAS_B` / `MAPEO_CANALES`, 00_Config.js): Mail = Mailing; RRSS = Instagram + Facebook + WhatsApp +
   Google + Web + LinkedIn + TikTok + Twitter + Programmatic + SMS + Redes; Difusión = Difusion + Territorial +
   AppAsistentes + AppFormulariosOffline + QR + Prensa + Otros; Call Center = CallCenter; IVR = IVR. Edades: las 5 de
   `inscriptos_edades_*`. Los nombres nuevos son `inscriptos_canal_<Nombre>` (como los que ya había); los alias viejos
   siguen. `conMail` / `conCelular` / `conFijo`: ignoradas.
2. **Sexo y Sin identificar — CORREGIDO el 07/10, mismo día**: **`Sin identificar` NO cambió de significado**: sigue
   siendo el resto de las EDADES, Inscriptos − (18-24 + 25-39 + 40-55 + 56-65 + 66+), como siempre (CLAUDE.md 1.e). En el
   commit 7c7b7fd se lo había cambiado por error (al resto del sexo, Inscriptos − Masculinos − Femeninos) y se volvió
   atrás en el siguiente. Masculinos y Femeninos, escalados sobre identificados como hasta hoy (`DIVISOR_SEXO =
   'identificados'`), con un ajuste que queda: si el redondeo de los dos se pasa de Inscriptos (con .5 y .5), se le resta
   1 al que más subió (`sexoEscalado_`), así M + F ≤ Inscriptos (en el test, 15 de 300 formularios; Masculinos = B2 en
   204 de 210). `inscriptos_X` no tiene columna en el destino: no se escribe en ningún lado.
   **Si alguna corrida de la hora escribió con la fórmula equivocada** (entre los dos commits), el paso 18 lo reconoce:
   `paso18_malEscritas_listar()` (en seco) lista las celdas de Sin identificar con el color del sistema que valen
   Inscriptos − Masculinos − Femeninos y no el resto de las edades; `paso18_malEscritas_vaciarReal()` las vacía y la
   corrida siguiente las completa bien.
3. **Protección** (cada corrida, antes de escribir): las columnas de B que hacen falta para el cruce (nombre, fecha_fin,
   inscriptos) siguen frenando todo; una obligatoria de DATOS que falta o una `inscriptos_*` sin mapear **frena los datos
   de B** (la traza, Asistentes, STATUS y la agenda siguen) y el log lo dice (">>> COLUMNAS DE B: …"); un formulario que
   no cierra frena **sus** datos. Los controles (`problemasFormularioB_`): los 5 canales = la suma de todos los de B;
   edades + Sin identificar = Inscriptos (y edades ≤ Inscriptos); Masculinos + Femeninos ≤ Inscriptos; no "Inscriptos >
   0 y todo lo demás en 0". El paso 20 lo muestra como "l) datos de B frenados". El paso 17 se frena.
4. **`paso46_chequearColumnasB()`** (sólo lectura, diagnostico/20_columnas_b.js): columnas reconocidas / faltantes / sin
   mapear; los formularios de los últimos 30 días que no cierran (canales, edades + Sin identificar, M + F ≤ Inscriptos,
   "Inscriptos > 0 y todo en 0");
   5 ejemplos de B → destino; y si la corrida de la hora escribe los datos de B.

Tests: escritura_lote [10] (falta una de datos: no escribe datos de B y sigue; una `inscriptos_*` sin mapear: lo mismo)
y [25] (B con los nombres nuevos: canales = suma de B, edades + Sin identificar = Inscriptos y M + F ≤ Inscriptos, el
formulario que no cierra no se escribe, el paso 46); [11] (el paso 18 reconoce y deshace la fórmula equivocada del 07/10).

**Predicción, anotada ANTES** de `paso46_chequearColumnasB()`: columnas: faltan 0, sin mapear 0 (si los nombres nuevos
son `inscriptos_canal_<Nombre>`; si el origen usa otra forma, aparecen acá con el nombre exacto y se agrega el alias); los
formularios de los últimos 30 días cierran; los 5 ejemplos con RRSS y Difusión iguales a la suma de sus canales en B.
Si da eso, la corrida de la hora escribe los datos de B (sólo en celdas vacías). Si no, el log dice qué y no los escribe.

#### Paso 46 y paso 18 después de la corrección (07/10)

**Paso 46: TODO CIERRA** (36 columnas, 0 faltan, 0 sin mapear, 41 formularios de los últimos 30 días cierran).

**Paso 18: 24 celdas de Sin identificar mal escritas**, filas **372–403** (12/2025–01/2026, cerradas). No pueden ser de
los 16 minutos de la fórmula equivocada (la corrida de la hora sólo toca 30 días). Hipótesis del usuario: se
escribieron el **04/10 con el paso 22**, cuando B no traía las edades de esos formularios (Sin identificar = Inscriptos −
0); hoy el origen nuevo sí las trae. **Ojo**: el paso 18 corrió **sin el backup del 02/10** ("no se pudo leer"), así que
el chequeo 4 no se aplicó, y desde el paso 19 el color del legado es el mismo que el del sistema: alguna de esas 24
podría ser del legado. Por eso:

- ~~**El backup** (`RDV_SS_BACKUP_0210`, 1QLDcmTb01LC_…): ni la cuenta conectada a Claude ni la que corre el script lo ven~~
  **Corregido el 07/10: ese archivo era una copia de la INTERMEDIA, no de la base** (no tiene la solapa "RVD JM-CM - ES";
  la lectura devolvía nada sin decirlo). Ahora: `RDV_SS_BACKUP_BASE` (abajo, y docs/backup.md §8.3).
  Lo que se había escrito: ni la cuenta conectada a Claude ni la que corre el script lo ven
  (Drive: "not found"; el destino sí se ve). Es la copia del 02/10 que se hizo a mano ("no compartir"). Hay que
  **compartirla como LECTOR con la cuenta que corre el script** (el aviso del paso 18 ahora dice cuál). Sin el backup,
  **ni el paso 18 ni el 47 vacían nada** (en seco listan igual, con el aviso).
- **`paso47_revisarDesagregado_enSeco()` / `paso47_revisarDesagregado()`** (diagnostico/10_mal_escritas.js): las filas del
  paso 18 con sus EDADES y su SEXO contra lo que trae B hoy. Sólo si la corrida las va a reescribir (los datos de B de
  ese formulario no están frenados y el Inscriptos del destino está vacío o es el de B):
  - edades del destino en 0 o vacías y B hoy trae edades → vacía **juntas** las edades en 0 y Sin identificar (si alguna
    de esas edades no la escribió el sistema, no toca la fila);
  - edades iguales a las de B → vacía sólo Sin identificar;
  - si no, no toca (lo lista);
  - Masculinos / Femeninos en 0 escritos por el sistema, si B hoy trae sexo: también.
  Sólo celdas con el color del sistema y vacías en el backup (chequeo 4). Guarda las filas (RDV_UID) para el 47b.
- **`paso47b_completarFilasRevisadas_enSeco()` / `paso47b_completarFilasRevisadas()`**: el paso 22 **limitado a esas
  filas** (el upsert del historial, sólo celdas vacías). El paso 22 entero también las reescribe, pero completaría
  además cualquier otra celda vacía del historial que hoy se pueda calcular (B trae ahora edades que antes no traía): si
  se prefiere ése, primero `paso22_completarHistorial_enSeco()` para ver cuánto escribe fuera de esas filas.

Test: escritura_lote [26] (los cuatro casos, la del legado, el 47b que devuelve los valores correctos y no toca ninguna
otra fila, y que sin backup no se vacía nada).

**Orden, con la predicción anotada ANTES:**
0. Compartir el backup del 02/10 como Lector con la cuenta que corre el script.
1. `paso18_malEscritas_listar()` → **con el chequeo 4**: si la hipótesis es buena, las 24 siguen (estaban vacías el 02/10);
   las que "ya estaban en el backup" (del legado) salen de la lista y no se tocan.
2. `paso47_revisarDesagregado_enSeco()` → casos, por la hipótesis mayormente "edades + Sin identificar" (edades del destino
   en 0 o vacías y B hoy con edades); mirar la lista. Después `paso47_revisarDesagregado()`.
3. `paso47b_completarFilasRevisadas_enSeco()` → del orden de las celdas vaciadas. Después `paso47b_completarFilasRevisadas()`.
4. `paso18_malEscritas_listar()` → 0 en esas filas.

#### Solapas de AYUDA (07/10)

`43_Ayuda.js`, **paso 48** (`paso48_ayuda_enSeco()` → `paso48_ayuda()`): **"GUÍA"** en el archivo del destino (base RDV) y
**"LEER"** en el archivo "Agenda", con el texto del usuario y formato: una columna (A, 900 px, ajuste, Arial 11), título
en la fila 1 (negrita 16, #1F3864, letra blanca, 36 px, congelada), secciones en negrita 12 sobre #D9E1F2 con una fila en
blanco antes, una viñeta por fila (" • "), los colores de "QUÉ SIGNIFICAN LOS COLORES" con el fondo que describen (los
de las fichas, `RM.COLOR`, y #CFE2F3), ELEGIR en negrita, sin cuadrícula, la primera de la izquierda. Protegidas (sólo el
dueño y quien corre el script). **Nada del sistema las lee ni las toca** (ningún código lee solapas por posición: se
verificó antes de ponerlas primeras); el paso 48 las reescribe enteras si ya existen. En docs/elegir-match.md y
docs/agenda-equipo.md, arriba: "Versión corta: solapa GUÍA del archivo de la base". Test: tests/ayuda.test.js.

#### El backup de la BASE para los pasos 18 y 47 (07/10)

El backup anterior (`1QLDcmTb…`) **era una copia de la INTERMEDIA**, no de la base: por eso "no se pudo leer" (no tiene
la solapa del destino, y la lectura devolvía nada **sin decirlo**). **Nuevo**: `RDV_SS_BACKUP_BASE` =
`1YPhxToFccTZ4RiEzCCI6LpohIhG9cGlZf4Z1MRG0MXA`, **copia de la base sacada del historial de versiones** (la versión del
**04/10 antes de las 00:20**, antes de la migración / el paso 22), solapa "RVD JM-CM - ES", de la misma cuenta que corre
el script, **no se comparte** (docs/backup.md §8.3).

- **El chequeo 4 ahora quiere decir**: una celda con valor en ese backup no la escribió el paso 22 (la dejó el legado, o el
  sistema antes del 04/10) → no se toca. El error del 02/10 (Sin identificar = Inscriptos, una celda en el real, la fila
  6) ya se había vaciado entonces, así que un backup posterior no pierde nada.
- **Al leerlo**, los pasos 18 y 47 confirman en el log *archivo, solapa encontrada y cantidad de filas*; si falla, **el
  error exacto** (no se puede abrir —y con qué cuenta—, no tiene la solapa —y cuáles tiene—, no tiene Figura y FECHA, o
  el error de lectura). Test: escritura_lote [26] (la confirmación, y un backup sin la solapa: error exacto, no vacía).

**Predicción del usuario para `limpiar24()`, anotada ANTES:** el paso 47 vacía **22 filas (132 celdas**: las 5 edades y
Sin identificar de cada una), el 47b las reescribe, y el paso 18 final lista **sólo la 399 y la 401**.

#### La ubicación en tres niveles, la columna ID y la protección (07/10, decisiones del usuario) — PRIMERO MEDIR

Pedido del 07/10, en este orden: **primero la medición del punto 1 (sólo lectura)**; con el resultado, lo demás (barrio
desde la dirección con eje, `pendiente_barrio` sólo sin ninguna ubicación, `DIAS_FUTUROS_CRUCE = 7`, conjuntas, la ID como
derivada 12). Lo hecho en esta tanda:

- **La regla** (CLAUDE.md, decisión 2, "La ubicación en TRES NIVELES"): `compararUbicacion_` y sus ubicaciones
  (`ubicacionDeFila_`, `ubicacionDeFormulario_`, `ubicacionDeTexto_`, `ubicacionDeEvento_`), en `02_Parsing.js`,
  **detrás de `UBICACION_TRES_NIVELES = false`**. La usan, con el flag: el matcher de formularios (`puntuar_`, y lo que
  sale de él: "¿por qué?", las fichas, EMPAREJAR), el cruce de asistentes y oradores (`_ubicConjuntoFila_`), la figura
  de Seguridad (`figuraSeguridad_`, con la ubicación de la fila) y la agenda (candidatas, casi duplicados antes y después
  de crear, "ya cargada"). `leerDestino_` lee "Lugar (mail)" (`f.lugarMail`). Con el flag apagado nada cambia: los tests
  de siempre pasan igual.
- **Lo que no sale solo de la regla, decidido así** (se puede revisar con la medición): un formulario SIN figura vale
  por barrio o comuna, nunca sólo por el eje (con fecha ±1, cualquier fila del eje ese día lo ganaría); el desempate por
  eje (`EJE_COMO_DESEMPATE`) mira el eje del mail, no el de Comunas; las candidatas de una reunión del mail se comparan
  SIN el "Lugar (mail)" de la fila (comparar el mail consigo mismo juntaría dos Seguridad de la misma comuna sin barrio);
  "ya cargada en otra fila" sigue exigiendo el mismo barrio (la regla del usuario); en la puerta de EMPAREJAR_MANUAL vale
  la ubicación que coincide en cualquier nivel.
- **La medición** (sólo lectura): `medir07()` = **paso 49** (`paso49_medirUbicacion`: formularios —el plan entero sin los
  RDV_UID, todo el historial, con las dos reglas—, asistentes y oradores, figura de Seguridad), **paso 49b**
  (`paso49b_medirUbicacionAgenda`: el plan de la agenda en seco con las dos reglas) y **paso 50** (`paso50_columnaId`).
  Tests: tests/ubicacion.test.js (la regla), escritura_lote [27] (paso 49, la regla prendida, paso 50), agenda_escritura
  [30] (paso 49b, la subzona en la figura de Seguridad).
- **La columna ID** (punto 6): **nada de este proyecto la escribe** en "RVD JM-CM - ES" (revisado: el upsert, la agenda
  —también el deshacer, que sólo restaura sus columnas—, las derivadas y el legado activo escriben otras columnas u otras
  solapas). El valor roto ("… | Tue Oct 06 2026 12:00:00 GMT-0300 … | Sat Dec 30 1899 16:45:00 GMT-0416") es una fecha y
  una hora pasadas a texto por **JavaScript**: una fórmula de Sheets daría números o el texto con formato; lo escribió un
  script (atado al archivo del destino, que es otro proyecto) o una función personalizada. El paso 50 muestra la fórmula
  del backup, si hoy hay fórmula en la columna, cuántas están rotas (y si son filas de la agenda) y 3 ejemplos antes /
  después (el después, con la plantilla que se deduce de los valores buenos del backup). La derivada 12 se escribe
  **después** de ver la fórmula, con su mismo resultado.
- **La protección** (punto 7, bug "addEditor … isWarningOnly"): una protección que había quedado de ADVERTENCIA no acepta
  editores, así que `addEditor` fallaba y volvía a quedar de advertencia para siempre. Ahora se le saca la advertencia
  antes (`_protegerFichas_`, `_protegerDuplicadosAgenda_`, `_protegerAyuda_`). REVISAR_MATCH y AGENDA_DUPLICADOS quedan con
  la protección real en la próxima corrida de la hora; GUÍA y LEER, con `paso48_ayuda()`. Tests: escritura_lote [21], agenda
  [18], ayuda [5] (los mocks ahora fallan como Google con una de advertencia).

**Predicción, anotada ANTES de correr `medir07()`:**

- **paso 49 a) formularios** [activas | total]: **CAMBIA 0 | 0** y **PIERDE 0 | 0**; "escritas que cambiarían" **0**.
  RESUELVE pocos o ninguno (0–3): casi todas las filas con "Lugar (mail)" tienen barrio, y las de hoy y ayer sin barrio
  siguen en `pendiente_barrio` (eso cambia en el punto 3), así que la 815 todavía **no** aparece. Si aparece algo en el
  total (cerradas), será por la canonización del barrio (una grafía que antes no daba comuna: Montserrat, Villa Gral.
  Mitre) y cada uno, mirado.
- **paso 49 b) asistentes y oradores**: CAMBIA **0**, PIERDE **0**; RESUELVE 0–2 (una figura con dos filas el mismo día y
  una de ellas sin barrio, con la comuna del mail).
- **paso 49 c) figura de Seguridad**: las del 08/10 (futuras) con la misma figura con las dos reglas, por la dirección:
  **816 Piñeiro (Brandsen 567), 817 Tapia (H. Yrigoyen 3922), 818 Giménez (Gral. Manuel A. Rodriguez 1191), 819
  Landerreche (Emilio Mitre 981)**; CAMBIA 0, PIERDE 0, contradice 0.
- **paso 49b (agenda)**: **ninguna diferencia** en vincular / actualizar / mover / suspender / borrar; si hay alguna, sólo
  casi duplicados de menos (barrio con barrio, la subzona) o figuras de Seguridad de más, cada una listada.
- **paso 50 (ID)**: en el backup, la fórmula (el usuario dice que era una fórmula); hoy, sin fórmula o con otra; las rotas,
  filas recientes (las que creó o tocó la agenda desde el 06/10).

**Predicción del usuario para el final de todo el pedido (después de los puntos 2–6):** la 815 con barrio y su
formulario de 20 inscriptos; 816 Piñeiro y 817 Tapia con formularios (138 y 110); 818 Giménez y 819 Landerreche con
figura; la ID con el formato correcto; la protección real.

#### medir07() (07/10 23:16) y la tanda del 07/10, puntos 1 a 5

**Resultado de medir07()** (lo pasó el usuario): paso 49 CAMBIA 0 / PIERDE 0 en formularios, asistentes y figura de
Seguridad (816–819 iguales, por dirección exacta); paso 49b, 0 diferencias en la agenda. **APROBADO.**

- **(1) `UBICACION_TRES_NIVELES = true`** — prendido.
- **(2) a (5): escritos, detrás de `CAMBIOS_0710_ACTIVOS`** (en `false` hasta ver el paso 51; **`true` desde el 08/10**,
  abajo). El usuario pidió ver EN SECO qué escribiría en
  815–827 antes de que se escriba: hasta que el interruptor pase a `true`, la corrida de la hora sigue como antes en esos
  cuatro puntos. El **paso 51** (`paso51_previsualizarFilas`, `previsualizarFilas(815, 827)`) los prende en memoria y hace
  lo mismo que la corrida —la agenda (con los mails), sus escrituras aplicadas a una copia del destino, el cruce con los
  formularios y con RDV CONJUNTO— y lista fila por fila lo que escribiría. No escribe nada (tampoco la cache).
  - (2) `BARRIO_DESDE_DIRECCION_CON_EJE`: el barrio desde la dirección cuando el mail trae eje (sin comuna ni barrio):
    geocodificación "ok" y a más de 100 m de otro barrio. Si en Comunas ese barrio es de otro eje, no frena: queda una
    "nota del eje" en el log de la agenda y en el paso 51 (`_reglaBarrio_`).
  - (3) `PENDIENTE_BARRIO_SOLO_SIN_UBICACION`: `pendiente_barrio` sólo para las filas sin barrio, sin comuna y sin eje
    (`ubicacionDeFila_`); las futuras sin ninguna ubicación también esperan.
  - (4) `DIAS_FUTUROS_CRUCE = 7`: las filas de los próximos 7 días entran al cruce (el plan, la escritura, las elecciones
    y la figura de Seguridad). Una futura sin formulario todavía no va a los reportes ni a las fichas (veredicto `futura`,
    "sin formulario todavía"). STATUS sigue "en agenda" hasta que haya asistentes. Las filas activas
    (`esFilaActiva_`) llegan hasta hoy + 7.
  - (5) `CONJUNTAS_AUTOMATICAS`: el formulario que nombra exactamente las figuras de la fila (la suya + "Conjunta con",
    que incluye las que no participan), a ±`DIAS_CONJUNTA` (1) día y sin desacuerdo de ubicación, deja de ser
    `multi_figura` y se cruza solo (traza `+conjunta`); un subconjunto sigue a revisión. En RDV CONJUNTO, una fila que
    nombra varias figuras va a la fila conjunta de esa fecha si es una sola (`_filaConjuntaDeConjunto_`).
- **Hallazgo al probarlo:** la escritura (`aplicarDecisiones_`) tenía su propio filtro de futuras (`f.fecha > hoy`), aparte
  del plan: con la tanda prendida, el plan habría decidido escribir las futuras y la escritura las habría salteado, mientras
  el paso 51 decía "escribiría". Ahora las dos usan `filaQueSeEscribe_`. Lo mismo en las elecciones y el paso 20.
- Tests: escritura_lote [28] (el upsert real, prendida y apagada: conjunta con formulario y con RDV CONJUNTO, subconjunto,
  futuras dentro y fuera de los 7 días, sin formulario fuera de SIN_MATCH, pendiente_barrio con y sin ubicación);
  agenda_escritura [31] (el paso 51 sin escribir nada; barrio con eje, figura de Seguridad de una futura, la del 15/10 no);
  ubicacion [6].

**Predicción del usuario para el paso 51 (07/10), anotada ANTES de correrlo:**
- 815 Lombardi 07/10: barrio desde Casafoust 540 y el formulario "Lombardi-Tapia-Piragine - Eje Oeste - 7/10" (20
  inscriptos, canales, sexo, edades);
- 816 Piñeiro + formulario "Seguridad - Comuna 4 - 8/10" (138);
- 817 Tapia + formulario "Seguridad - Comuna 5 - 8/10" (110);
- 818 Giménez, 819 Landerreche (sin formulario todavía);
- 824, 825, 827 (15/10): nada (RDV CONJUNTO no las tiene).

Las figuras de 816–819 las pone la agenda (desde RDV CONJUNTO, por la dirección): en el paso 51 salen como "AGENDA:
Figura ← …". Si el paso 51 coincide: `CAMBIOS_0710_ACTIVOS = true` + clasp push, y la corrida de la hora lo escribe.

**Resultado del paso 51 (08/10 00:02, lo pasó el usuario): coincide con la predicción.** 815 Villa Crespo + el formulario
de la conjunta (20); 816 Piñeiro + `Comuna 4` (138); 817 Tapia + `Comuna 5` (110: el desempate eligió bien); 818 Giménez
y 819 Landerreche con figura; 820–827 sin nada. Canales, sexo y edades cierran contra `B`.

→ **08/10: `CAMBIOS_0710_ACTIVOS = true`** (decisión del usuario) + clasp push. Nada para correr a mano: **la corrida de
la hora escribe 815–819 como mostró el paso 51** (la agenda primero —Barrio de la 815, figuras de 816–819—, después el
cruce). Qué mirar después de esa corrida:

- la 815: `Barrio` = Villa Crespo (en `COLOR_SISTEMA`), Inscriptos 20 con canales, sexo y edades, traza con `+conjunta`;
- 816 y 817: Inscriptos 138 y 110 con su desagregado; STATUS sigue "en agenda" (todavía no hay asistentes);
- el log: "de los próximos 7 días se cruzaron …", "conjuntas", y en la agenda la "nota del eje" si la hubo;
- REVISAR_MATCH: la 815 ya no tiene que aparecer como `multi_figura`; las futuras sin formulario (818, 819, 820–827) no
  aparecen como fichas.

Si algo no coincide: `CAMBIOS_0710_ACTIVOS = false` + clasp push vuelve los cuatro puntos a como antes del 07/10 (lo ya
escrito queda, como cualquier escritura del sistema: sólo en celdas que estaban vacías).

#### Las fichas del 08/10: "esperando formulario" y las opciones cercanas — PRENDIDAS el 08/10

Pedido del usuario (08/10, punto A). **`FICHAS_0810_ACTIVAS = true` desde el 08/10** (abajo, el paso 52 y la regla que se
sumó); antes, apagado hasta medir.

- **Esperando formulario**: una fila de hasta `DIAS_ESPERANDO_FORMULARIO` (3) días después de la reunión, o futura, que
  iría a REVISAR_MATCH o a SIN_MATCH y **no tiene ningún formulario libre que pueda ser el suyo a ±3 días** no va a las
  fichas, ni a SIN_MATCH, ni a EMPAREJAR_MANUAL (veredicto `esperando_formulario`; la causa, en el paso 20). Pasados esos
  días, ficha (la reunión del lunes espera hasta el jueves; el viernes es ficha).
  - "Que pueda ser el suyo": de su figura, o sin figura de su ubicación (`cercanosDeFila_`, el mismo criterio que
    `sin_formulario_propio`). **"Libre"**: uno que ya tiene otra fila (por RDV_UID o porque se escribe en esta corrida)
    no cuenta: si la figura tuvo otra reunión dos días antes, el formulario de ésa no es el de ésta.
  - Reemplaza a la regla del 07/10 de las futuras ("toda futura sin match queda afuera"): una futura **con** un
    formulario libre cerca que no alcanza ahora sí es ficha.
- **Opciones de una ficha** (todas las fichas): sólo formularios a ±`DIAS_OPCIONES_FICHA` (14) días; uno que ya tiene otra
  fila, sólo a ±`DIAS_OPCION_USADA` (3; un formulario sin fecha en el nombre, por su cierre, como en el puntaje); nunca uno
  de una reunión cerrada (con fecha anterior a las filas activas, o que tiene una fila cerrada). Sin ninguna: "No hay
  formulario cercano" en "¿por qué?" y ELEGIR sólo con Ninguno / No sé. Si el formulario del que habla el motivo quedó
  afuera, "¿por qué?" lo nombra igual ("… no está entre las opciones").
- No cambia ningún cruce escrito: las reglas tocan sólo qué fila es ficha y qué opciones muestra. Lo controla el paso 52
  (celdas a escribir con y sin las reglas) y el test [29] (el destino queda igual, valores y colores).

**Para correr: `paso52_medirFichas()`** (SÓLO LECTURA). Arma las fichas de hoy dos veces, con las reglas apagadas y
prendidas, y lista: 1. escritura (filas cuyas celdas a escribir cambian: tiene que dar **0**); 2. las que salen (con su
formulario cercano ya usado y por quién); 3. las que entran; 4. las que cambian de opciones (qué sale y por qué) y las que
quedan sin ninguna; 5. el resumen, con de qué son las opciones que quedan.

**Predicción, anotada antes de correrlo:**
- escritura: **0**;
- salen: **818 Giménez y 819 Landerreche** (08/10, si siguen sin formulario) y las de 05/10–07/10 sin formulario libre;
  las futuras sin match ya estaban afuera, así que por ellas no cambia nada;
- entran: **0 a 2**;
- otras opciones: **varias** (las fichas con formularios de su figura a más de 14 días, o usados a más de 3);
- sin ninguna opción: **pocas**.

**Ojo, a decidir con el número del paso 52:** la regla de las usadas no mira la figura. Un formulario de **otra** figura
que ya tiene su propia fila a ±3 días se sigue ofreciendo (antes casi nunca se veía: lo tapaban los de la misma figura,
con más puntaje; con los lejanos afuera, ocupan su lugar). El resumen del paso 52 lo cuenta ("ya usadas por otra fila …,
de ellas de otra figura N"). Si molesta, sacarlas es una línea en `_exclusionOpcion_`.

Si está bien: `FICHAS_0810_ACTIVAS = true` + clasp push; la próxima corrida de la hora regenera REVISAR_MATCH.

**Resultado del paso 52 (08/10 17:09, lo pasó el usuario):** escritura **0**; sale la **813** (esperando formulario); en
la **778** y la **787** entraban **5 formularios de OTRA figura ya usados por su propia fila**. Decisión del usuario: esos
salen de las opciones **a cualquier distancia** (`_exclusionOpcion_`: "es de otra figura (…) y ya lo tiene la fila …"; el
paso 52 los cuenta aparte); los libres —p. ej. una "Seguridad" sin figura— se siguen ofreciendo. Sin opciones: "No hay
formulario cercano" con Ninguno / No sé. Con eso, **`FICHAS_0810_ACTIVAS = true`** + clasp push: la próxima corrida de la
hora regenera REVISAR_MATCH. Test [29] (la "Seguridad" libre sí, las de otra figura ya usadas no).

#### El script atado a la base (Looker): FASE 1, el informe (08/10) — esperando la aprobación del usuario

Pedido del usuario (08/10, punto B: sólo informe, sin cambiar nada). El informe, entero:
**[script-looker.md](script-looker.md)** — qué hacen `unpivotEventos` y `buildAuxMaximos`, lo que está mal, los riesgos con
lo nuestro, la ID (formatos, quién la escribe, la propuesta, si Looker la usa como clave), qué cambia y qué queda igual, y
las dos correcciones de datos a aprobar. No se tocó el script ni la base.

- **Para correr: `paso53_investigarId()`** (SÓLO LECTURA, `diagnostico/24_columna_id.js`): los formatos de la ID (backup
  del 04/10 y hoy), qué escribió cada ID que cambió (fórmula / script atado / paso 5 del legado / una persona), los de
  guiones bajos, los ID repetidos, las celdas `#4F81BD` de toda la base (backup / hoy), la última corrida del script atado
  (`FechaCarga`) y cuántos ID repetiría el formato propuesto.
- **A decidir (usuario):** el formato único de la ID (propuesta: `Figura - Barrio - dd/MM/yyyy`, con `- HH:mm` sólo si dos
  filas repiten); "Sin identificar" de género = Inscriptos − M − F (y si da negativo, ¿0 o sin fila?); sacar los alias
  "P. Varon" / "P. Mujer"; mirar en Looker si algo parte la ID, la filtra o combina por ella.
- **FASE 2** (después de aprobar): las dos funciones a nuestro proyecto (dentro de `upsertDiario`, después de las
  derivadas), la ID como derivada 12, en seco primero, y el script atado con funciones vacías.

**Resultado del paso 53 (08/10 17:12, lo pasó el usuario):** **ningún ID cambió desde el 04/10** — los "7 que cambiaron"
del paso 50 eran de la medición: comparaba cada fila con la PRIMERA del backup de la misma figura y fecha, y con dos
reuniones de la misma figura el mismo día comparaba reuniones distintas (corregido: ahora, la misma fila). Así que nada
más escribe la ID. **26 ID repetidos** (`Jorge Macri | | | | |` en 78 filas): Datos_Unpivot cuenta **627 ID distintos
para ~827 reuniones**. **El formato propuesto da 0 repetidos.**

**Aprobado por el usuario (08/10) para la FASE 2:** la ID `Figura - Barrio - dd/MM/yyyy` (sin barrio
`Figura - dd/MM/yyyy`; vacía sin figura; `- HH:mm` si se repite), derivada 12, recalculada en cada corrida; "Sin
identificar" de género = Inscriptos − M − F, y si da negativo esa fila no se escribe; sin el reemplazo por P. Varon /
P. Mujer. **Queda igual:** una Suspendida con asistentes cuenta como realizada; las columnas vacías de Aux_Maximos. Antes de
escribir, tres pruebas: A (el backup, modo compatible: idéntico), B (hoy, modo compatible: idéntico), C (modo corregido:
diferencias sólo por esos motivos y la ID, con cantidades, ejemplos y las reuniones distintas que cuenta Datos_Unpivot
antes y después). Y la página para el dueño.

#### El tablero de Looker en el sistema: FASE 2 escrita y APAGADA (08/10) — primero las pruebas A, B y C

**`44_Looker.js`, detrás de `LOOKER_EN_SISTEMA = false`.** Con el interruptor, la corrida de la hora, después de las
derivadas: la ID es la **derivada 12** (`recalcDerivadas_` la escribe con las otras once: sólo donde cambió, sin color;
con fórmula en la columna no se escribe) y **Datos_Unpivot** y **Aux_Maximos** se rehacen desde RVD (en bloque; si a
una le falta una columna que usa, no se reescribe y el log lo dice). REGISTRO_UPSERT suma la columna `looker`.

- **Modo compatible** = el script atado tal cual (la ID de la planilla, y la que él armaba con " | " si faltaba). Sólo
  para las pruebas. **Probado contra el original corrido de verdad** (`tests/looker.test.js`, con la copia de
  `_externo/`): las mismas 151 filas de Datos_Unpivot y 78 de Aux_Maximos, celda por celda, con casos raros (sin ID, sin
  figura, texto, coma decimal, fechas como texto o serie, tres formatos de hora, sin Masculinos).
- **Modo corregido** (la corrida de la hora) = las tres correcciones aprobadas y nada más (el mismo test: 0 diferencias
  fuera de ellas). Una fila sin figura ya no entra (su ID nueva es vacía).
- **Paso 54 (SÓLO LECTURA): `pruebasLooker()`** = A (`paso54a`, el backup del 04/10 contra sus solapas), B (`paso54b`, hoy
  contra las solapas de hoy), C (`paso54c`, corregido contra compatible sobre la misma lectura de RVD: cada diferencia
  con su motivo; "OTRA" tiene que dar 0; reuniones distintas antes y después; la ID nueva: celdas que cambian,
  repetidas, fórmulas).

**Predicción, anotada antes de correrlas:**
- **A: IDÉNTICO** en las dos solapas (el backup es de las 00:20 del 04/10: nadie escribía a esa hora);
- **B: IDÉNTICO**, salvo las filas que cambiaron en la base después de la última corrida del script atado (la prueba lo
  lista por fila de RVD y dice las horas de las dos últimas corridas): hoy, por lo menos **816–821** si el script atado
  no corrió después de las 17:09;
- **C:** la ID cambia en **~830** filas de RVD; "Sin identificar" de género: mayormente **"sale"** (con el sexo escalado,
  Inscriptos − M − F da 0) y algunos **"cambia"** / **"entra"**; P. Varon / P. Mujer **0**; **OTRA 0**; reuniones
  distintas en Datos_Unpivot: **627 → ~820**; la ID nueva: **0** repetidas, **0** celdas con fórmula.

**La activación** (cuando las tres den bien, y con el OK del dueño): en la misma sesión, (1) `LOOKER_EN_SISTEMA = true` +
clasp push y (2) el script atado con las dos funciones vacías ("migrado al sistema RDV el <fecha>"), con clasp push
desde una carpeta fuera del repo con su propio `.clasp.json` (el único push a ese proyecto); después, mirar la primera
corrida de la hora (la columna `looker` de REGISTRO_UPSERT, y las dos solapas). Si no, los dos escribirían las mismas
solapas.

**La página para el dueño** (08/10): qué queda igual, qué cambia, las pruebas y lo que necesitamos de él (mirar en
Looker si algo usa la ID; el OK para las funciones vacías). Es privada: la comparte el usuario.

#### El tablero de Looker: PRENDIDO el 08/10 — y qué mirar después de la primera corrida de la hora

**Las pruebas (pruebasLooker, 08/10 19:00, las pasó el usuario): APROBADO.**
- **A** (el backup del 04/10): Aux_Maximos **idéntico**; Datos_Unpivot difiere sólo en la **fila 6** (su "Sin
  identificar" se corrigió entre el 02/10 y el 04/10, después de la última corrida del script atado).
- **B** (hoy): difiere sólo en **816, 819, 820 y 821** (escritas después de la última corrida del script atado) y en **4
  filas sin ID**.
- **C** (corregido contra compatible): **OTRA 0**; reuniones distintas **627 → 795**; ID repetidas **0**.

**La activación (08/10):**
- **Lo nuestro: `LOOKER_EN_SISTEMA = true`** + clasp push. Si la corrida de la hora ya lleva más de 4 minutos al llegar
  al tablero, no lo rehace en ésa (`LOOKER_TIEMPO_MAX_MS`): lo hace la próxima. Sin la columna ID en la base, no se
  escribe el tablero.
- **El script atado, VACÍO desde el 08/10 a las 21:22**: el código viejo de los siete archivos, todo comentado, en un
  solo `LEGACY.js` (con qué hacía, la fecha y dónde vive ahora), y `unpivotEventos` / `buildAuxMaximos` vacías en
  `Migrado.js` (sólo registran "migrado al sistema RDV el 08/10/2026"). El primer push falló (la cuenta de clasp de esta
  máquina podía leerlo pero no editarlo: `CAN_EDIT: false`); el usuario le dio permiso de edición sobre el archivo de la
  base y se subió con `clasp push -f` desde **`script-atado-base/`** (al lado del repo, fuera de él, con su propio
  `.clasp.json`). Antes del push, un clon del remoto dio los ocho archivos de siempre, iguales a la copia de
  `_externo/base-script/`; después, otro clon dio **sólo `LEGACY.js`, `Migrado.js` y `appsscript.json`, idénticos a la
  carpeta**. Cargado como lo carga Apps Script (todos los archivos en un solo alcance, sin SpreadsheetApp), define **sólo
  `unpivotEventos` y `buildAuxMaximos`**, y cada una hace un único `Logger.log`; `LEGACY.js` tiene los siete originales
  enteros, comentados línea por línea, sin ninguna línea ejecutable.
- **Los activadores del script atado los borró el usuario** (08/10, antes del push). Si quedara alguno, `Migrado.js` no
  escribe nada.
- Antes de los push, un agente revisor (sólo lectura): todo PASS — las dos solapas se arman con las mismas funciones y
  parámetros que la prueba C; los encabezados, iguales a los del original; `LEGACY.js` sin ninguna sentencia ejecutable y
  con los siete originales enteros; `Migrado.js`, sólo las dos funciones con un `Logger.log`. Encontró un test viejo (el
  [19] contaba 2 celdas de derivadas y ahora son 3, con la ID) y un caso borde (sin la columna ID en la base, el tablero no
  se escribe): arreglados.

**Qué mirar después de la primera corrida de la hora:**
1. **REGISTRO_UPSERT** (intermedia), la última línea, columna `looker`: `Datos_Unpivot N | Aux_Maximos M | reuniones
   795` (o un poco más, si entraron reuniones con datos después de las 19:00).
2. **Datos_Unpivot**: `FechaCarga` = la hora de esa corrida, igual en todas las filas; **N** filas (las de la columna
   `looker`); el encabezado de siempre (12 columnas).
3. **Aux_Maximos**: **M** filas; el encabezado de siempre (18 columnas).
4. **La ID nueva en la base**: en todas las filas con figura, `Figura - Barrio - dd/MM/yyyy` (`- HH:mm` sólo si se
   repite); vacía sin figura; ningún "GMT". `paso53_investigarId()`: en la sección 1 de hoy, sólo ese formato y "vacío";
   repetidos (sección 4) **0**. El log de la corrida: en las derivadas, `ID` con ~830 celdas la primera vez (después, sólo
   las que cambian).
5. **Que el script viejo no escribió**: en el proyecto del script atado → Ejecuciones, ninguna nueva (los activadores
   están borrados; si algo llamara a esas funciones, dirían "migrado al sistema RDV el 08/10/2026"); la `FechaCarga` de
   Datos_Unpivot es la de nuestra corrida; y no aparece ninguna ID nueva con "GMT".
6. **En Looker**: si cuenta reuniones por ID, sube de 627 a ~795; el gráfico de género ya no suma más que los
   inscriptos.

Si algo no da: `LOOKER_EN_SISTEMA = false` + clasp push frena lo nuestro (las solapas quedan como las dejó la última
corrida); el código viejo está en `LEGACY.js` del script atado, comentado: no se descomenta sin decidirlo.

#### Los IDs de los encuentros ("ID cuentas"): escritos y APAGADOS (08/10) — primero el paso 55

**Qué es** (decisión del usuario, 08/10; CLAUDE.md, decisión 14, con todas las reglas). La lista de IDs del equipo de
campañas (planilla 6, "Base reuniones - Digital - Call Center", `RDV_SS_IDS`; se lee, nunca se escribe), solapas "Agenda
JM" (sólo Macri: ID | Funcionario | Barrio / Comuna | Tipo | Fecha | Fecha de envío) y "Agenda funcionarios" (ID |
Funcionario | Barrio / Comuna | Fecha | Fecha de envío; conjuntas y "Seguridad en tu barrio"). En la base, dos columnas al
final: **"ID cuentas"** y **"Fecha envío campañas"**, por la regla general (sólo celda vacía, `#CFE2F3`). Código:
`45_IdsCuentas.js`; medición: `diagnostico/26_ids_cuentas.js`; configuración: 00_Config.js, "Los IDs de los encuentros".

**Cómo se revisó** (antes de cualquier push; todo en el mock `tests/ids_mock.js`, sin datos reales):
- tres agentes en paralelo: uno por solapa (`tests/ids_lista_jm.test.js`, `tests/ids_lista_funcionarios.test.js`: el
  encabezado de dos filas, las conjuntas, Seguridad, las fechas de envío raras, el Tipo, el caso 3735 y sus variantes, 50
  casos al azar) y un **revisor del cruce** (Opus);
- lo que encontraron, y quedó arreglado: un "#N/A", "-" o "Pendiente" en la columna ID se escribía como ID; Seguridad
  cruzaba por la fecha sola; el ±3 contaba sólo las filas con el lugar coincidente (una a ±3 sin lugar comparable no lo
  frenaba) y, con la fecha planeada todavía por venir, podía llevarse el ID a otra reunión cercana; la columna de envío se
  elegía por el orden de los nombres y no por posición; las fechas de la lista se leían en el huso del script; la hora
  completaba la fecha de envío en filas cerradas; REGISTRO_IDS perdía la traza al borde de la grilla; un apellido solo no
  resolvía una figura que está sólo en "Conjunta con"; y una columna que ya existiera con fórmulas se habría pisado;
- reglas que se endurecieron por eso: una parte del Funcionario que no se reconoce frena el cruce ("Agenda funcionarios";
  un lugar pegado, "Gabino Tapia - Retiro", no); una fila "Reprogramada" no es candidata; un Tipo que apunta a otra fila
  del día (entre las que el lugar no descartó) deja el caso ambiguo; una conjunta se compara también sin los de "No
  participa" (que tampoco se llevan la fila); dos barrios de la misma subzona de la Comuna 1 la conservan; un "0" no es un
  ID; un ID repetido se queda con su mejor cruce (no con el primero de la lista); una Fecha imposible se lista;
- segunda vuelta de los dos agentes de solapa, ya con las reglas nuevas: `ids_lista_jm` 332 chequeos (32 mutaciones del
  código, todas detectadas) y `ids_lista_funcionarios` 389 (con 50 casos al azar y 500 más aparte), todo en verde;
- `tests/ids_cuentas.test.js` (el flujo entero: el historial, la idempotencia, en seco y la medición sin escribir, columnas
  que ya existen, el bloqueo, los permisos, el determinismo, la hora, el huso, las fórmulas, el borde de la grilla, los IDs
  inválidos);
- **segunda vuelta del revisor** (08/10 de noche) y un test de **propiedades del ±3** (`tests/ids_tres_dias.test.js`: un
  oráculo propio, que no llama al código, contra 450 escenarios al azar). Lo que salió, y quedó arreglado el 09/10:
  - **(grave, latente)** un ID de la misma fecha podía caer en una fila de HOY o FUTURA que era de otra reunión (un temático
    sin lugar comparable, con la fila de Belgrano todavía sin crear por la agenda) y el invariante lo dejaba ahí para
    siempre. **Ahora un ID se escribe recién cuando la reunión de su fila ya pasó** (`reunion_futura`: se calcula igual, no
    se lista y lo escribe una corrida posterior);
  - el caso de control decía OK aunque el 3735 no se escribiera (otro ID le ganaba la fila): ahora exige que se escriba;
  - Seguridad cruzaba a ±3 aunque hubiera una fila de Seguridad ese día sin lugar comparable: ahora es ambiguo;
  - "Lugano", "Pompeya", "Paternal", "Vélez" y "C 13" (con espacio) no se leían como lugar;
  - la fecha de envío se escribía al lado de un ID que el equipo cargó en el medio: ahora va sólo al lado de un ID que quedó
    escrito o ya estaba (primero los IDs, después las fechas);
  - un ID repetido con otra grafía dependía del orden de la lista; un ID en una fila "fantasma" no contaba como ocupado; un
    ID sólo de dígitos ("03735") se habría escrito como número: ahora como texto;
  - el paso 43 limpia también el fondo de las celdas vacías de las dos columnas nuevas;
- **tercera vuelta del revisor** (09/10, sobre esos arreglos; confirmó que la corrida de la hora queda idéntica a la de
  8f1246b con `IDS_EN_LA_HORA = false`). Lo que salió, y quedó arreglado:
  - **(grave, latente)** "C 1 Sur" / "C1 Sur" / "C1 - Norte" perdían la subzona de la Comuna 1: un Seguridad "C 1 Sur" podía
    cruzar con la única fila de Seguridad del día en Retiro (Comuna 1 Norte). Ahora la subzona se lee con la palabra entera;
  - "Sede c/ 9 de Julio" ya no se lee como la comuna 9;
  - un ID sólo de dígitos ("03735") ahora sí se escribe como texto en la base (antes, sólo en los reportes);
  - en "ya estaba", si alguien cambia el ID de la celda en el medio, la fecha de envío no se escribe al lado (lectura fresca);
  - el paso 43 no le saca el fondo a una celda con fórmula de "ID cuentas";
  - el caso de control no da un "NO LISTO" falso cuando el 3735 está dos veces en la lista.

**La secuencia** (nada escribe en la base hasta el 57):
1. **`paso55_medirIds()`** — SÓLO LECTURA: ni la base ni la intermedia. Todo al log.
2. **`paso56_idsHistorial_enSeco()`** — el historial en seco: no toca la base; escribe `IDS_SIN_CRUZAR` (intermedia).
3. **`paso57_idsHistorial()`** — ESCRIBE, una vez: agrega "ID cuentas" y "Fecha envío campañas" al final si no están (sólo
   el encabezado, sin formato heredado) y escribe en todas las filas **cuya reunión ya pasó** (las de hoy y las futuras
   esperan). Traza en `REGISTRO_IDS`. Se puede volver a correr: no reescribe nada (lo que ya está, "ya estaba").
4. **`IDS_EN_LA_HORA = true`** + clasp push: la corrida de la hora, después de la agenda, sólo filas activas que ya
   pasaron (así se completan las de esta semana a medida que pasan); la columna `ids` de `REGISTRO_UPSERT` dice qué hizo.

**Predicción del paso 55** (anotada antes de correrlo; los números exactos no se pueden predecir sin la lista):
- **la lista**: huso horario de la lista (si no es `America/Argentina/Buenos_Aires`, el log lo dice y las fechas se leen en
  el suyo); en las dos solapas, el encabezado en la **fila 2**; "Agenda JM": id A, funcionario B, lugar C, tipo D, fecha E,
  envío F; "Agenda funcionarios": id A, funcionario B, lugar C, fecha D, envío E. Puede aparecer el aviso "está en más de
  una columna" para el envío (hay otros bloques): tiene que decir que usa la F (JM) y la E (funcionarios). Hasta 157 y 609
  IDs, menos las filas sin ID y las que **no son un ID** (la sección "la columna ID" las lista con su fila).
- **las columnas**: "FALTAN ID cuentas y Fecha envío campañas → el paso 57 las agrega al final, a partir de BL" (la última
  es "Conjunta con", BK), salvo que ya las hayan creado: entonces "están las dos" (y, si tuvieran fórmulas, el aviso).
- **el caso de control**: `3735-SEPJDGAG → fila 805 (Jorge Macri, 29/09/2026, Belgrano) por fecha distinta (−2 días: la
  lista dice 01/10/2026) · lugar: barrio`, "SE ESCRIBE", y **"OK: es la fila 805."**. Si diera ambiguo o DISTINTO, el log
  nombra las candidatas (una fila de Macri del 01/10, o una a ±3 en Belgrano o sin lugar comparable); si cruza pero otro ID le
  gana la fila, dice "CRUZA con la fila 805 pero NO se escribe" (y no es LISTO).
- **el cruce**: la gran mayoría por la **misma fecha**; por **fecha distinta**, pocos (todos listados, para revisarlos uno
  por uno); **ambiguos**, algunos (el ±3 es estricto a propósito); **conflictos del invariante**, pocos o ninguno; **futuras
  sin fila**: las reuniones de las próximas semanas que la agenda todavía no creó (no van a IDS_SIN_CRUZAR); **"cruzan con
  una reunión que todavía no pasó"**: las de hoy y de esta semana que ya tienen fila (se escriben después; tampoco se
  listan); y la lista nueva **"los cruces de la MISMA fecha con el lugar NO comparable"** (se escriben: la figura y la fecha
  alcanzan; están para mirarlos).
- **sin fila**, donde se espera: canceladas o movidas más de ±3 días (`sin_fila`, `lugar_distinto`); **Seguridad** sin
  lugar comparable (`seguridad_sin_lugar`) o de antes de que la agenda anotara "Evento (mail)" (06/10, alcance desde el
  06/09) y sin un formulario "sobre Seguridad" cruzado (no se reconocen como Seguridad); **conjuntas** cuya fila no tiene
  "Conjunta con" ni una Figura que junte a todas (`conjunta_sin_fila`); Funcionario con una parte que no se reconoce
  (`funcionario_en_parte`).
- **Fecha de envío**: "#N/A" y "-" frecuentes; los de **año que no cierra** (el usuario los anticipó), todos listados.

**Qué mirar después del 57**: el log ("Escritos en …: N IDs y M fechas de envío") igual al 56; en la base, las dos columnas
al final, `#CFE2F3` sólo en las celdas escritas y las fechas en `dd/MM/yyyy`; `REGISTRO_IDS` (una línea por fila escrita, con
"misma fecha" / "fecha distinta (−N días…)"); `IDS_SIN_CRUZAR` (los motivos); `paso16_verificarEscritura()` sigue OK
(invariante 0). Para volver atrás: `REGISTRO_IDS` dice la fila y el ID de cada escritura (no hay un deshacer automático).
**Un ID borrado vuelve** en la corrida siguiente (la celda quedó vacía): para que una fila no reciba un ID, escribir **"no"**
en su "ID cuentas" (una celda con valor no se toca; sale en IDS_SIN_CRUZAR como `fila_con_otro_id`, "lo puso el equipo").

#### La noche del 08/10 → la mañana del 09/10: qué se hizo, `manana()` y qué prender

**El pedido** (08/10 de noche, "sin esperar respuesta"): terminar los IDs; después ocultar y proteger las columnas del
sistema con el guardián; todo lo nuevo APAGADO (la corrida de la hora hace exactamente lo mismo que el 08/10; nada nuevo
escribe en la base); tests con agentes en paralelo y un revisor; commits por tema; y una función `manana()` que mida todo sin
escribir nada y diga qué está listo para prender.

**Qué se hizo**
1. **Los IDs de los encuentros: TERMINADOS y APAGADOS** (arriba, "Los IDs de los encuentros"; CLAUDE.md, decisión 14), con
   la segunda vuelta de revisión aplicada. `IDS_EN_LA_HORA = false`: la corrida de la hora no los toca, y `REGISTRO_UPSERT`
   no suma la columna `ids` mientras esté apagado. Nada escribe en la base hasta el paso 57, que corre una persona.
2. **El guardián: SU TEXTO NO LLEGÓ.** El pedido dice "con el guardián (el texto que te pasé)", pero ese texto no está en la
   sesión, ni en las anteriores, ni en el repo: sólo la mención. Sin él no se implementó ninguna de sus reglas (qué columnas,
   cómo protegerlas, qué hace la corrida si detecta una desalineación). Lo que NO depende de él quedó hecho, de SÓLO
   LECTURA, en `diagnostico/27_guardian.js`:
   - **el inventario**: qué columnas del sistema hay (traza, agenda, IDs, derivadas), cuáles están ocultas y qué
     protecciones cubren sus DATOS hoy, y una PROPUESTA (a confirmar con el texto) de cuáles ocultar y cómo proteger;
   - **"las celdas que difieren hoy"**: las filas cuyas trazas no cuadran con la fila (el formulario cruzado nombra otra
     figura, o —con `form_clave`— es de otra fecha; la agenda escribió otra FECHA, HORA o Barrio, dos o más, que "Tocado por
     el equipo" no explica). DESALINEADA con muchas (máx(5, 5%)) o con 6 SEGUIDAS;
   - **"la prueba del orden parcial"**: en memoria, ordena sólo las columnas del equipo (las del sistema quedan quietas) y
     mide cuántas filas MÁS dejan de cuadrar; GRANDE (toda la base) y CHICO (sólo las últimas 30: el mes activo, donde
     trabaja el equipo; lo tiene que ver la racha). El orden de filas enteras se mide, pero no prueba nada (cada fila se
     mira sola).
   No hay interruptor del guardián: no hay nada que prender hasta tener su texto.
3. **`manana()`** (99_Correr.js; la lógica, en `diagnostico/28_manana.js`): corre, en orden y sin escribir nada,
   `medirIds()` (el paso 55, con las listas largas acotadas a 12 por motivo para que el log no pierda el resumen) y
   `medirGuardian()`, y termina con un RESUMEN de qué está listo y qué no. Si un paso falla, sigue con el otro.
4. **Tests y agentes**: cinco agentes (uno por solapa de la lista, uno de propiedades del ±3, uno del guardián y de
   `manana()`, y un revisor en tres vueltas: la tercera, a la mañana, sobre los arreglos de la segunda). Los dos agentes de
   tests se cortaron por el límite de uso a las 00:2x; sus archivos los terminé yo a la mañana. En verde: `ids_cuentas` (77),
   `ids_lista_jm` (336), `ids_lista_funcionarios` (393), `ids_tres_dias` (130 chequeos: 708 + 1093 + 450 verificaciones
   contra el oráculo, en 450 escenarios), `guardian` (262), y los de siempre (`agenda_escritura`, `agenda_parser`, `ayuda`,
   `looker`, `ubicacion`, `escritura_lote`).

**Predicción de `manana()`** (anotada antes de correrla):
- **1. IDs**: lo de la predicción del paso 55 (arriba): el encabezado en la fila 2 de las dos solapas; las columnas que faltan
  "a partir de BL"; **"el caso 3735: OK: es la fila 805. (fecha distinta (−2 días: la lista dice 01/10/2026) · lugar:
  barrio)"**; la gran mayoría por la misma fecha, pocos por fecha distinta (todos listados), algunos ambiguos; "cruzan con
  una reunión que todavía no pasó": las de esta semana con fila; y el resumen **"IDS: LISTO para seguir"** si se leyeron las
  dos solapas, el caso 3735 dio OK (y se escribe) y "ID cuentas" no tiene fórmulas.
- **2. Guardián**: "las celdas que difieren HOY": **pocas** (de 0 a unas decenas: filas que el equipo corrigió después del
  cruce —dos o más de FECHA, HORA y Barrio de una fila de la agenda sin anotar en "Tocado por el equipo", o la Figura de una
  fila con formulario—), racha corta → **alineada**; el orden parcial GRANDE: **DESALINEADA con cientos** → "se ve"; el
  CHICO: **DESALINEADA por la racha** → "también se ve" (si las últimas 30 filas casi no tuvieran trazas, diría "NO se ve":
  sería un dato, no una falla).
- **3. Ocultar y proteger**: **34 columnas del sistema** (6 de traza, 16 de la agenda, 12 derivadas con la ID; 36 si "ID
  cuentas" y "Fecha envío campañas" ya existieran); **ocultas 0** (salvo que el equipo haya ocultado alguna); **con alguna
  protección: 11** (las derivadas, con advertencia, desde el paso 26; la ID no); la propuesta: ocultar 14 internas.
- **El resumen**: IDs LISTO (o NO LISTO con el motivo); GUARDIÁN NO LISTO ("su texto no llegó"); OCULTAR Y PROTEGER NO
  LISTO; `IDS_EN_LA_HORA = false`.

**Qué prender si da bien** (en este orden; cada uno lo corre una persona):
1. **IDs**: `paso56_idsHistorial_enSeco()` → mirar `IDS_SIN_CRUZAR` (los motivos) → `paso57_idsHistorial()` (escribe UNA
   vez: agrega las dos columnas y escribe en todas las filas que ya pasaron) → mirar `REGISTRO_IDS` y la base →
   **`IDS_EN_LA_HORA = true`** + clasp push.
2. **Guardián y ocultar/proteger**: nada todavía. Falta el texto del guardián: con él se implementan sus reglas (con su
   interruptor, apagado) y `manana()` ya deja la línea de base de hoy para comparar.

### y) 06/10: REVISAR_MATCH con el formato aprobado — integrado y PRENDIDO

> **06/10: `REVISAR_FORMATO_NUEVO = true`**, decisión del usuario después de correr la demo (paso 33) y la vista
> previa con datos reales (paso 34). El próximo `upsertDestino()` pasa la
> REVISAR_MATCH del destino al formato nuevo, conservando ELEGIR y COMENTARIO (test [22]).

Diseño aprobado el 06/10: [revisar-match-ficha-tecnica.md](revisar-match-ficha-tecnica.md) (columnas A..M fijas,
anchos, colores, bordes; §9: qué mirar en la primera prueba). Código:

- `27_RevisarFormato.js`: el `revisar_match_formato.gs` que vino con la ficha, sin cambios de diseño. Único
  cambio: `renderRevisarMatch(pendientes, resueltas, sh)` y `demoRevisarMatch(sh)` reciben la solapa (las fichas
  viven en el archivo del destino, no en `getActive()`).
- `26_Fichas.js`: `armarFichasFormato_` arma `pendientes` / `resueltas` con las **mismas piezas** de las fichas de
  hoy (qué reuniones, orden, opciones por puntaje, "¿por qué?", "coincide", colores, contexto, RESUELTAS);
  `escribirFichasFormato_` relee ELEGIR y COMENTARIO **justo antes de redibujar** (lo escrito mientras corría el
  upsert no se pierde; "Opción k" se traduce por la `form_clave` de la auxiliar, nunca por posición), dibuja, y
  con el mapa que devuelve el dibujo escribe las auxiliares ocultas desde la N (`AUX_FICHAS_`: `aux_linea`,
  `id_figura`, `id_fecha`, `id_barrio`, `aux_opcion`, `form_clave`, `form_nombre`, `puntaje`); las líneas
  "¿por qué?" y "coincide" quedan vacías de F en adelante. El lector (`leerFichas_`) entiende los dos formatos.
  Protección real, como en 0.w.
- `REVISAR_FORMATO_NUEVO` (00_Config.js): `true` desde el 06/10; en `false` vuelve el formato de 0.w.

Secuencia:
1. `paso33_demoFormatoRevisar()` → solapa `REVISAR_MATCH_DEMO` de la intermedia (los 3 casos de la ficha). Mirar
   §9: el "¿por qué?" de 2 líneas en dos renglones (la 778), comentario largo en B, el chip del desplegable.
2. `paso34_fichasFormatoDePrueba()` → solapa `REVISAR_FORMATO_PRUEBA` (datos reales, plan en seco). El log cuenta
   los "¿por qué?" de más de 300 caracteres (el diseño corta en dos renglones de 150) y las "coincide" de más de 160.
3. Recién ahí `REVISAR_FORMATO_NUEVO = true`. La primera corrida pasa la solapa del formato de 0.w al nuevo
   conservando ELEGIR y COMENTARIO (test [22]).

Lo que el diseño deja afuera respecto de 0.w: la columna **asistentes** de la línea REUNIÓN (no está entre A..M), y
el "su gemelo tiene N" de los formularios descartados del contexto (la nota de M es corta).

### x) 06/10: AGENDA, ETAPA 1 — medir antes de construir (todo sólo lectura sobre el destino)

Prompt: [prompts/PROMPT-05-AGENDA-ETAPA1-MEDICION.md](prompts/PROMPT-05-AGENDA-ETAPA1-MEDICION.md). **Nada de esta
etapa escribe en el destino**: los cuatro pasos escriben sólo solapas `AGENDA_*` en la intermedia. Código:
`diagnostico/16_agenda_medicion.js` (+ `diagnostico/17_barrios_caba_geo.js`, los polígonos). Test en Node con mails
sintéticos: `node tests/agenda_parser.test.js` (en verde; la suite de siempre, también).

**Reglas de negocio nuevas (usuario, 05/10)** — se miden acá, no se implementan todavía: (1) cada reunión de la
última versión es una fila; (2) **"NO PARTICIPA" no es "no se hace"**: la reunión se hace y tiene fila a nombre de
esa figura (el legado las descartaba: bug); los nombres van a una columna nueva "No participa"; (3) conjunta = UNA
fila, a nombre de la primera figura nombrada; (4) "Seguridad en tu Barrio" viene sin figura: sale de RDV CONJUNTO
por fecha + barrio; (5) el barrio sale de la dirección; (6) una reunión que desaparece se avisa, no se borra; (7)
hora y dirección se actualizan mientras la fila está "en agenda".

**Punto 0 — el código viejo del barrio: leído (06/10).** El usuario compartió "CODIGOS Ajuste RDV"; bajado con
`clasp clone` a `_externo/codigos-ajuste-rdv/` (en `.claspignore` y `.gitignore`: es otro proyecto y no tiene que
entrar a nuestro scope global ni al repo público). **No se tocó ese proyecto.** Seis archivos:

| archivo | qué hace |
|---|---|
| `Mail a agenda.js` | copia del parser del legado (`Agenda traer datos del mail.js`), mirando 10 días; **descarta igual "NO PARTICIPA"**; al final llama a `agenda_estimarBarrio_()` |
| `Barrios Estimados.js` | **el estimador de barrio** (abajo) |
| `A base.js` | el push de `Agenda` a `Para Revisar` por persona + fecha. En un UPDATE **pisa Figura, Fecha, Hora, Dirección e ID, y pone Barrio en vacío si no hay uno válido** (lo que el invariante prohíbe). Pinta de amarillo `Barrio (manual)` en `Agenda` cuando falta |
| `Hepers.js` | helpers **repetidos dentro del mismo archivo** (`normalizeHeader_` ×4, `findIdxOr_` ×3, `toDate_` ×2, `mapBarrioCanon_` ×2): el patrón de 3.1.c |
| `NOse usa desde aca Ajuste Formularios RDV.js` | export/import de faltantes de B2 ↔ "Ajuste Formularios RDV". Lo reemplazaron las fichas y `EMPAREJAR_MANUAL` |

**Cómo saca el barrio de la dirección** (`agenda_estimarBarrio_`, columna `Barrio Estimado` de `Agenda`; sólo si no hay
un barrio válido en auto ni en manual):

1. **heurística de texto, primero**: un "villa X" en la dirección; el nombre de un barrio en el texto (incluye formas
   cortas que también son calles: "Belgrano", "Chacabuco", "Avellaneda", "Boca", "Patricios"); y cinco reglas de
   **"calles emblemáticas"**: Cabildo / Juramento / Congreso / Libertador → Belgrano, Defensa / Balcarce / Paseo Colón →
   San Telmo, Azcuénaga / Santa Fe / Callao / Las Heras → Recoleta, Corrientes / Pueyrredón / Medrano → Almagro (la de
   San Nicolás nunca se alcanza: Corrientes ya cayó en Almagro);
2. si eso no da nada, **`Maps.newGeocoder()`** con "&lt;dirección&gt;, CABA, Argentina" (sin región): el primer
   componente `neighborhood` / `sublocality` / `political` que sea un barrio, después cualquiera, después la heurística
   sobre la dirección formateada. **Tope: 20 geocodificaciones por corrida**, cache sólo en memoria, errores en silencio.

No hay tabla de calles ni polígonos. **Lo que quedó a medio hacer: `Barrio Estimado` se calcula, pero el push no lo lee**
—usa `Barrio (manual)` y, si no, `Barrio (auto)`, que es el lugar del evento ("Comuna 10", "Montserrat"); como desde
11/2025 casi siempre es "Comuna N", que no es un barrio válido, el barrio sale vacío—. Y los dos canonizadores del
mismo proyecto no coinciden: `canonBarrio_` da "Villa General Mitre" y `mapBarrioCanon_` "Villa Gral. Mitre" (3.1.h,
otra vez). La hipótesis anterior ("copiaba el lugar del evento") era cierta para `Barrio (auto)`; la estimación por
dirección existía aparte y no se usaba.

**Qué sirve**: la idea de geocodificar (el paso 31 la mide con polígonos oficiales en vez de confiar en el componente
de Google); los alias de tipeo de `mapBarrioCanon_` ("Savedra", "Balbanera", "Palemo", "Monserratt", "Barrio Norte" →
Recoleta) como **candidatos** a `BARRIOS_VARIANTES`, sin medir. **Qué no**: las "calles emblemáticas" (Santa Fe,
Corrientes y Libertador cruzan cinco o seis barrios cada una) y los nombres de barrio que también son calles (Av.
Belgrano está en Monserrat y Balvanera). **El paso 31 mide el método viejo portado tal cual** (`_viejoPorTexto_`,
`_viejoPorGeo_`): la heurística sola por vía (villa / nombre / calle) y el método completo, contra el nuevo.

**Lo hecho:**

- **Paso 29 — `paso29_parsearAgendaMails()`** (parser nuevo). Lee `DIAG_MAILS` (o Gmail con
  `AGENDA_FUENTE_MAILS = 'GMAIL'`), agrupa por **semana + grupo** del asunto, ordena las versiones por fecha del
  mail y **se queda con la última**. Por reunión: fecha (el año, el más cercano a la fecha del mail: cubre dic→ene),
  hora, tipo (`Encuentro con Vecinos`, `Encuentro "1 a 1"`, `Encuentro Temático`, `Primera Persona`, `Seguridad en tu
  Barrio`), figuras **en el orden en que se nombran** (`figura_fila` = la primera), las que **no participan** (el
  "(NO PARTICIPA)" se asigna a la figura nombrada justo antes), conjunta (2+ figuras), lugar del evento (comuna con
  subzona de la Comuna 1 / eje / barrio), dirección ("calle número" y nombre del lugar; "A CONFIRMAR" no es
  dirección), marcas, mail y versión de origen, y **qué cambió contra la versión anterior** (hora / dirección /
  lugar / nueva). Aparte, **las que desaparecen** en la última versión (estaban en alguna anterior), con dónde está
  la figura en la última (posible reprogramación). La misma reunión en los mails de dos grupos cuenta una vez.
  - **Nombres**: la lista y las variantes de siempre (columna Figura, `FIGURAS_VARIANTES`, apellidos únicos) y,
    **sólo en este parser**, una tolerancia de tipeo por distancia de edición ("Maxiliano Piñeiro", "Baistocchi").
    No toca `figurasEnTexto_` ni el matcher del upsert. El log lista cada nombre reconocido así.
  - **Controles que no necesitan otra fuente** (§6, validación interna): reuniones **fuera de la semana de su
    propio asunto** (si hay, el día está mal parseado); **versiones parciales** (la última con menos del 60% de la
    anterior: un "Actualizo:" con sólo los cambios haría pasar por "desaparecidas" reuniones que no lo son — el log
    lo avisa antes del número); cuerpos **truncados** a 8000 caracteres en `DIAG_MAILS` (pueden haber perdido las
    reuniones del final: correr con `'GMAIL'` para confirmar); líneas "Algo:" no reconocidas, contadas por forma.
- **Paso 30 — `paso30_cruzarAgendaConDestino()`**. Las reuniones únicas de la **ventana de análisis** ya pasadas
  contra el destino: `con_fila` (figura de la fila + fecha; separa conjuntas y "no participa"),
  `conjunta_fila_de_otra`, `fila_a_otra_fecha` (±3 días: reprogramada), `fila_de_otra_figura_mismo_lugar`, las sin
  figura (una fila por fecha + lugar / varias / ninguna; sólo filas que no son de otra reunión del mail) y
  `sin_fila`; las **desaparecidas** con su fila y status; y **las filas del destino sin reunión en el mail** (por
  día, mes, EVENTO, si la semana tuvo mail, si hay una "Seguridad en tu Barrio" ese día en ese lugar). Al final, la
  **columna "No participa"** y las reglas 2 y 3.
- **Paso 31 — `paso31_barrioDesdeDireccion()`**. Filas del destino con Dirección y Barrio: `Maps.newGeocoder()`
  (región `ar`, sesgado a la Ciudad) con "calle número, Ciudad Autónoma de Buenos Aires, Argentina" → lat/lng →
  **punto en polígono** con los límites oficiales de los 48 barrios (Buenos Aires Data, CC BY 2.5 AR; simplificados
  a ~1 m: 73 KB, 9 diferencias en 12.903 puntos al azar contra el original). Compara además el barrio que devuelve
  Google (`neighborhood`/`sublocality`). **Cache** en `AGENDA_GEOCODE`: una dirección se pide una sola vez entre
  corridas; tope de 450 llamadas y corte a los 4,5 minutos por corrida — si el log dice PENDIENTES, se vuelve a
  correr y sigue. **Puede pedir autorizar de nuevo** (servicio Maps).
- **Paso 32 — `paso32_seguridadContraConjunto()`**. Las reuniones sin figura contra RDV CONJUNTO por fecha + barrio
  (o comuna: "C5", o la del barrio por `Comunas`): resuelve 1 / ambiguas / sin fila, y la figura contra la del
  destino ese día en ese lugar.
- **Arreglo de paso**: `diagMuestrasMail()` terminaba con `ReferenceError` (`claves` no existía) después de escribir
  `DIAG_MAILS`. Ahora devuelve bien.

**La secuencia, con la predicción anotada ANTES de correr:**

0. Si `DIAG_MAILS` tiene más de una semana (el paso 29 lo avisa): `rehacer_diagMuestrasMail()`.
1. **`paso29_parsearAgendaMails()`**. **Predicción** (del análisis de DIAG_MAILS): ~376 mails o más; versiones por
   semana de 1 a 10; **2538 eventos** sumando todas las versiones, muchos menos en las últimas; tipo mayoritario
   `Encuentro con Vecinos`; lugar del evento ~2/3 comuna (1723 de 2538), ~1/4 barrio (647, sobre todo JM), eje ~5%
   (139); **fuera de la semana del asunto: 0**; "sin ninguna figura" ≈ las "Seguridad en tu Barrio" (desde 09/2026)
   más pocas por grafía (listadas). Si las desaparecidas son muchas, mirar primero la línea de versiones parciales.
2. **`paso30_cruzarAgendaConDestino()`**. **Predicción** (del prompt): ~307 reuniones del mail en 6 meses; ~268 con
   fila (87%); 39 sin fila = **16 conjuntas** (la fila de otra figura) + **16 reprogramadas** (fila a ±2 días) +
   **5 desaparecidas** + **2 sin explicar**; **~23 filas del destino sin reunión en el mail**, casi todas jueves de
   09/2026 ("Seguridad en tu Barrio" sin figura). "No participa": **~66 reuniones, 63 con fila y Realizada**.
   Regla 3: las conjuntas, con la fila a nombre de la 1ª. Ojo: si la predicción contaba "reuniones" de otra forma
   (una conjunta por figura, o todas las versiones), los totales no se comparan uno a uno; las categorías sí.
3. **`paso31_barrioDesdeDireccion()`** (repetir hasta 0 pendientes). **Predicción** (sin medición previa, a ojo):
   geocodifica bien ≥ 90% de las direcciones con altura; **exacto ≥ 85%** de las ubicadas; los errores, en su
   mayoría "distinto, misma comuna" (direcciones sobre un límite, o el barrio cargado por el equipo con otro
   criterio); "A CONFIRMAR" y vacías, una parte grande del total. Si el exacto da < 80%, **el barrio desde la
   dirección no se escribe solo**. **El viejo** (predicción): la heurística responde en una parte chica
   de las direcciones; por la vía "calle", acierto bajo (< 50%); el método completo, por debajo del polígono.
4. **`paso32_seguridadContraConjunto()`**. **Predicción**: las ~20 de 09/2026; la mayoría **resuelve 1** y coincide
   con la figura del destino; las que no, por RDV CONJUNTO todavía sin cargar (las más recientes).

**Columna "No participa" (punto 5), propuesta:** **al final del destino, después de la traza (`form_clave`)**, con
los nombres separados por " / ". Nunca insertada en el medio (correría los fondos, CLAUDE.md §6). Cuántas filas de
los últimos 6 meses la tendrían: lo dice el paso 30.

**Resultados de la primera corrida (06/10, pasos 29–32, `DIAG_MAILS` del 23/09), contra la predicción:**

| | predicción | resultado |
|---|---|---|
| reuniones del mail en la ventana, con fila | ~268 de ~307 (87%) | **275 de 301 (91,4%)** |
| "NO PARTICIPA" | ~66, 63 con fila y Realizada | **74, todas Realizada** — confirma la regla 2 |
| conjuntas a nombre de la 1ª figura (regla 3) | todas | **8 de 9** |
| desaparecidas en la última versión | 5 | **27** (con fila: 9 Suspendida, 2 Realizada) |
| barrio desde la dirección, polígono | exacto ≥ 85% | **92,9%** |
| método viejo (Barrios Estimados.js) | por debajo del polígono | **85,9%**; el barrio de Google (neighborhood), peor que los dos |
| Seguridad en tu Barrio contra RDV CONJUNTO | la mayoría resuelve 1 | **13 de 16 resuelven (las 13 iguales al destino), 3 ambiguas** |

Lo que mostró, además: **28 reuniones con la fecha mal escrita en el mail** (casi todas "1 a 1" de JM: "Lunes 13/06" en
la semana del 13/07 al 18/07), **12 mails afuera** por asuntos con otra forma ("Semana del 02/002 al 07/02",
"Semana 15.12.2025", reenvíos), los tipos "Encuentro con Vecino" (singular) y "Café con Vecinos", la grafía
"Montserrat", líneas "[image:" en el cuerpo, "Armenia 1322" con *Service error* del geocodificador, valores que no
son direcciones (links, sólo el nombre del lugar) y un timeout al escribir AGENDA_BARRIO_DIRECCION.

**Ajustes antes de la etapa 2 (06/10, usuario) — hechos:**

1. **Fecha fuera de la semana del asunto**: se corrige al día de esa semana con **el mismo día de la semana y el
   mismo número de día**, si hay exactamente uno ("Lunes 13/06" en la semana del 13/07 → 13/07). Se registra
   (`fecha_corregida` en AGENDA_MAIL y la lista en el log). Lo que no tiene corrección posible sigue contado como
   "fuera de la semana".
2. **Asuntos con otra forma** (`_semanaAgenda_`): mes de tres dígitos ("02/002"), fechas con puntos, una sola fecha
   ("Semana 15.12.2025" = esa fecha + 6 días), y el reenvío sin semana en el asunto: se toma de la línea "Asunto:" /
   "Subject:" del cuerpo. El log lista los que entran con otra forma y los que todavía queden afuera.
3. **Tipos**: "Encuentro con Vecino" (singular) cuenta como Encuentro con Vecinos; "Café con Vecinos" es un tipo
   propio. **Barrio**: "Montserrat" = "Monserrat" (alias sólo de la agenda: se prueba la grafía del texto y, si
   `Comunas` no la reconoce, la otra; no toca `BARRIOS_VARIANTES`). Las líneas **"[image:"** se ignoran (antes podían
   pegarse al campo anterior).
4. **Regla de confianza del barrio, medida en el paso 31** (`_reglaBarrio_`): se escribiría SÓLO si (a) la
   geocodificación es "ok" (no ok_parcial, aproximada ni borde), (b) el barrio del polígono cae en la misma comuna
   que trae el mail, o coincide con el barrio que trae el mail, y (c) la celda está vacía. El paso 31 toma la reunión
   del mail de cada fila del cruce del paso 30 y reporta: cuántas cumplen, el % exacto entre ésas, por qué no cumplen
   las otras, el % exacto **por estado** de la geocodificación, y cuántas filas **sin** barrio recibirían uno. Lo que no
   cumple queda vacío para el equipo. Geocodificador: **no se pide lo que no es una dirección** (links, texto sin
   altura); un *Service error* o "sin resultado" se **reintenta** sin el rectángulo de la Ciudad y, si sigue, con la
   pista del mail ("Armenia 1322, &lt;barrio o Comuna N del mail&gt;, Ciudad…"). La pista sale **sólo del mail**, nunca
   del Barrio del destino (sería darle la respuesta).
5. **Producción lee de Gmail**: en la etapa 2, `AGENDA_FUENTE_MAILS = 'GMAIL'` (`DIAG_MAILS` es del 23/09). La segunda
   corrida de medición sigue con `DIAG_MAILS`, para comparar con la primera sobre la misma población de mails.
6. **Escritura en tandas con reintento** (`_escribirHojaAgenda_`, 300 filas por tanda, 3 intentos) en todas las
   solapas AGENDA_*; el paso 31 loguea los números **antes** de escribir.

Test en Node: `node tests/agenda_parser.test.js` (bloques [7] y [8] nuevos), en verde.

**La segunda corrida, con la predicción anotada ANTES de correr** (mismo `DIAG_MAILS`):

1. **`paso29_parsearAgendaMails()`** → **mails sin semana: 12 → 0** (o los que queden, listados); **fechas corregidas
   ≈ 28**, casi todas "1 a 1" de JM; fuera de la semana sin corrección: ~0; aparecen "Café con Vecinos" y el singular,
   y bajan las "sin tipo".
2. **`paso30_cruzarAgendaConDestino()`** → **desaparecen de "filas sin reunión" la 689, la 690 y la 773**; **bajan
   las reprogramadas** (las corregidas pasan a fecha exacta); con fila **sube** desde 275 (más reuniones por los 12
   mails que entran, y las corregidas que ahora encuentran su fila), y el % no baja de 91,4%.
3. **`paso31_barrioDesdeDireccion()`** (la medición del punto 4) → **~99% exacto entre las que cumplen la regla**
   (predicción del usuario); por estado, ok por encima de ok_parcial y de aproximada; "Armenia 1322" se resuelve con el
   reintento; algunos valores pasan a "no es dirección" y salen del denominador (por eso el 92,9% general puede
   moverse un poco).

**La etapa 2 (crear y actualizar filas en el destino) se define con esos números.**

### w) 06/10: las fichas, en el ARCHIVO del destino (donde trabaja el equipo)

**Lo hecho:**

- **Ubicación**: `SOLAPA_FICHAS_EN_DESTINO = true`: REVISAR_MATCH (fichas) se escribe en el archivo del
  destino (`RDV_SS_DESTINO`), solapa nueva **"REVISAR_MATCH"**. La de la intermedia queda **sólo con un aviso**
  ("las fichas están en el archivo del destino…"), sin desplegables, y **no se lee**.
- **Lectura**: "elegido" y "comentario" se leen de la solapa del destino, por su nombre (`leerElecciones_`).
  `ELECCIONES_MATCH`, `HISTORICO_SIN_RESOLVER` y `EMPAREJAR_MANUAL` siguen en la intermedia. Ninguna lectura
  del destino (`RDV_HOJA_DESTINO`) toca la solapa de fichas.
- **Adelante, lo que escribe el usuario**: columnas **ELEGIR** (desplegable: Opción 1/2/3, Ninguno, No sé),
  **COMENTARIO**, **resultado** (lo escribe el sistema), y recién después la ficha. ELEGIR y COMENTARIO sólo en
  la línea REUNIÓN de cada ficha: **amarillo claro, borde marcado**, encabezado en negrita.
- **Protección real** de toda la solapa salvo esas celdas (`_protegerFichas_`): quedan como editores sólo quien
  corre el script (y el dueño del archivo, que Google no deja sacar); sin edición por dominio. Si no se puede
  poner real (permisos), queda como **advertencia** y el log dice *"la protección REAL … no se pudo poner …
  Avisar."*. Se rehace en cada regeneración.
- **Formato** (en cada regeneración): encabezado congelado y ELEGIR/COMENTARIO congeladas a la izquierda; una
  línea gruesa arriba de cada ficha; REUNIÓN en negrita sobre gris suave; "¿por qué?" en itálica; contexto
  en gris; los colores de coincidencia como estaban; RESUELTAS al final, con título y en gris; anchos
  ajustados al texto de las líneas de datos (no al de las frases), máximo `FICHAS_ANCHO_MAX` (400 px), con
  ajuste de texto en el nombre del formulario.
- **docs/elegir-match.md** actualizada (dónde está la solapa, ELEGIR adelante, qué es editable).
- **Test en Node** [21]: la solapa en el archivo del destino con ELEGIR/COMENTARIO/resultado adelante;
  protección real, sin proteger sólo ELEGIR y COMENTARIO de cada REUNIÓN; amarillo y borde; congeladas;
  itálica; anchos ≤ 400; la de la intermedia con el aviso y sin desplegables; **una elección en ELEGIR del
  destino se lee y se aplica**; **lo escrito fuera de ELEGIR (otra línea u otra columna) no se lee**; la de la
  intermedia ya no se lee; sin permisos, advertencia y aviso. [15]–[17] adaptados al orden nuevo. Toda la
  suite en verde.

**Ojo con la autorización**: la protección real usa `Session.getEffectiveUser()` (permiso nuevo: "ver tu dirección de correo electrónico").
**La primera vez que corras algo después de este `clasp push`, Apps Script pide autorizar de nuevo**: correr
`upsertDestino()` a mano y aceptar. Si el activador de cada hora ya estuviera instalado, fallaría hasta
autorizar.

**La prueba, con la predicción anotada ANTES de correr:**

1. **`upsertDestino()`** a mano (y autorizar). **Predicción:** en el archivo del destino aparece la solapa
   **REVISAR_MATCH** con **3 fichas: las filas 778, 787 y 798**, con **ELEGIR y COMENTARIO adelante**, en
   amarillo con borde, congeladas, y como **única zona editable** (el log: *"[fichas] "REVISAR_MATCH"
   protegida: sólo ELEGIR y COMENTARIO (3 fichas) se pueden editar"*). La REVISAR_MATCH de la intermedia queda
   con el aviso. Nada más cambia: 0 celdas escritas en RVD JM-CM - ES (salvo lo que haya entrado nuevo).
2. **Probar con alguien del equipo** que pueda escribir en ELEGIR y COMENTARIO y en ningún otro lado. Si la
   protección real le da problemas de permisos, avisar.

### v) 06/10: ANTES DE AGENDA — los oradores desde RDV CONJUNTO

Decisión del usuario: sumar al paso que copia Asistentes las dos columnas de oradores.

| | RDV CONJUNTO | destino |
|---|---|---|
| Oradores anotados | la 1ª después de Asistentes | **R** |
| Oradores que hablaron | la 2ª después de Asistentes | **S** |

**Lo hecho:**

- **Por encabezado, con la letra como control**: si en el destino no están en R/S, o en RDV CONJUNTO no son
  las dos siguientes a Asistentes (o no se encuentran), **error y no se escribe nada** (`leerDestino_`,
  `cruzarAsistentes_`).
- **El mismo cruce de Asistentes** (figura por tokens + fecha; con 2+ filas, desempate por barrio o
  comuna) y **las mismas reglas**: sólo celda vacía, **un 0 del destino es un valor y no se pisa**,
  `#CFE2F3`, conteo por columna en `REGISTRO_UPSERT` (`por_columna`). Se toman sólo de las filas de RDV
  CONJUNTO que tienen asistentes (como Asistentes). Si el cruce no es seguro —varias figuras, 2+ filas sin
  desempate, dos asistentes distintos para la misma fila, **o dos valores de oradores distintos para la
  misma fila** (por columna)— no se escribe y se lista en el log del cruce. Un número o un texto se copian
  tal cual.
- **R y S pasan a ser columnas del sistema** (CLAUDE.md, decisión 8). **Paso 16**: las incompletas cuentan
  ahora también lo que trae RDV CONJUNTO (Asistentes y oradores; la misma `decisionDeFila_` que la
  escritura). **Paso 20**: los oradores en la lista, con sus causas ("dos valores distintos en RDV
  CONJUNTO", "RDV CONJUNTO tiene la fila, sin …", y las del cruce de Asistentes).
- **En el proceso**: van dentro de la misma escritura que Asistentes: **el paso 22** los completa en todas
  las filas (sólo vacías) y **`upsertDiario`** (cada hora) en las filas activas (30 días).
- **Paso 28 — `paso28_medirOradores()`** (sólo lectura): a) las dos columnas en los dos lados, el tipo de
  dato (número / texto / vacío) y 10 ejemplos de cada una; b) con el cruce, **por columna**: vacío en el
  destino y RDV CONJUNTO lo tiene (se completaría) **[activas | cerradas]**, mismo valor, distinto (no se
  toca) y dos valores en RDV CONJUNTO (no se escribe).
- **Test en Node** [20]: celda vacía se completa (número y texto) en `#CFE2F3`; celda con valor —un 0
  incluido— no se toca; cruce ambiguo (2 filas sin desempate) no escribe; dos valores distintos en RDV
  CONJUNTO no escribe esa columna; `REGISTRO_UPSERT` por columna; paso 20 con las causas y f = 0; paso 16
  con 0 incompletas; encabezado fuera de lugar → error y nada escrito, en los dos lados. El destino
  sintético de los tests tiene ahora las columnas en el orden del real. Toda la suite en verde.

**Medición previa, fuera de la planilla (06/10)**: el paso 28 corrido en Node, con el código del repo,
sobre el export del destino del **02/10** (`RDV JM CM ES + funcionarios.xlsx`; no está en el repo):

| | destino (R / S) | RDV CONJUNTO (K / L) |
|---|---|---|
| Oradores anotados | número 150, vacío 660 | número 642, vacío 358 |
| Oradores que hablaron | número 145, vacío 665 | número 647, vacío 353 |

Con el cruce: **614** filas del destino con algún orador en RDV CONJUNTO.

| | se completaría [activas · cerradas] | mismo valor | distinto (no se toca) | dos valores en RDV CONJUNTO |
|---|---|---|---|---|
| Oradores anotados | **464** [27 · 437] | 134 | 11 | 0 |
| Oradores que hablaron | **473** [27 · 446] | 134 | 7 | 0 |

Todo número (ningún texto). Cruce no seguro: varias figuras 18, 2+ filas sin desempate 0. Los distintos son
cargas a mano que difieren en 1 a 10 (p. ej. Macri 06/09/2025: 125 contra 71), y en la fila 422 (Macri
11/02/2026) anotados y hablaron están **invertidos** (destino 26 / 20, RDV CONJUNTO 20 / 26): se cuentan, no se
corrigen. Los números de la planilla de hoy pueden variar un poco (cargas desde el 02/10).

**La secuencia, con la predicción anotada ANTES de cada corrida:**

1. `clasp push` (hecho con este commit).
2. **`paso28_medirOradores()`**. **Predicción:** a) en el destino, R = "Oradores anotados" y S = "Oradores que
   hablaron"; en RDV CONJUNTO, las dos siguientes a Asistentes; mayoría **números** (algún texto posible);
   b) por columna, la mayoría de las filas cruzadas con el **mismo valor** (los carga el equipo, como
   Asistentes) y pocas "se completaría". **Pegar el bloque b): con esos números se anota la predicción
   exacta del paso 3.**
3. **`paso22_completarHistorial()`**. **Predicción:** escribe, por columna, **exactamente el "se completaría"
   del paso 28** (activas + cerradas; con el export del 02/10, **≈ 464 y ≈ 473**) en "Oradores anotados" y "Oradores que hablaron" del `por columna`;
   el resto, 0 (todo lo demás ya estaba completo); 0 pisadas; derivadas: 0 celdas que cambian.
4. **`paso16_verificarEscritura()`**. **Predicción: OK**, 0 incompletas en todo el destino (ya cuentan
   Asistentes y oradores).
5. **`paso20_porQueVacia()`**: los oradores vacíos que quedan, con su causa; f = 0.
6. Después, el proceso normal: cada `upsertDiario` copia los oradores de las filas activas, junto con
   Asistentes.

### u) 05/10: ANTES DE AGENDA — las once derivadas por Apps Script

Etapa nueva, decisión del usuario (docs/prompts/PROMPT-04-DERIVADAS-POR-SCRIPT.md). Se reemplazan por
script **sólo** las once derivadas del destino (hoy fórmulas de array en la fila 1: Día de la semana, %
de Asistencia, Direccion2, Falta Informacion, Comuna, Poblacion, p. Mujer, P. Varon, (km2), (hab/km2),
Zona). Ninguna otra fórmula se toca. Queda pendiente, de la etapa anterior: paso 23, `upsertDestino()`
normal, paso 19 y paso 24 (0.t).

**Lo hecho (05/10):**

- **`30_Derivadas.js`**: el cálculo, con la lógica exacta de la fórmula: Día = TEXT(FECHA; "dddd") en
  castellano ("lunes" … "domingo", minúsculas, como la planilla en español); % = Asistentes / Inscriptos
  (número, no texto; vacío si Inscriptos está vacío o la división da error: 0, texto); Direccion2 =
  Dirección & `SUFIJO_DIRECCION2` (", Buenos Aires, Argentina"); Falta Informacion = "No" si Inscriptos
  tiene algo; las siete = VLOOKUP exacto del Barrio en `Comunas` (columnas 2 a 8, sin distinguir
  mayúsculas, sin redondeo), vacío si no está.
- **La escritura**, en `05_Escritura.js`: **la segunda excepción anunciada** (CLAUDE.md, sección 0):
  sólo esas once columnas, sobrescribe sólo lo que cambió, sin color; una columna con fórmula no se
  escribe.
- **`DERIVADAS_POR_SCRIPT = false`** hasta validar. Con `true`, el upsert (y el paso 22) las recalcula al
  final de cada corrida en **TODAS** las filas (no sólo 30 días); `REGISTRO_UPSERT` suma la columna
  `derivadas` (celdas que cambió, o "fórmulas").
- **Paso 25 — `paso25_compararDerivadas()`** (sólo lectura): el texto **exacto** de las once fórmulas
  (para completar docs/formulas-respaldo.md) y, por columna, iguales / distintas con las 10 primeras.
- **Paso 26 — `paso26_quitarFormulasDerivadas_enSeco()` / `paso26_quitarFormulasDerivadas()`**: compara
  (si hay alguna distinta, **no hace nada**), guarda el respaldo en **`DERIVADAS_RESPALDO`**
  (intermedia), cambia cada fórmula por sus valores **en la misma tanda** (el encabezado queda como texto),
  pone la **protección con advertencia** y verifica (sin fórmula, 0 distintas).
  `paso26_recalcularDerivadas()`: lo que hace el upsert, a mano, sobre la solapa de la etapa (para la
  copia: **el upsert escribe en el real**, así que en la copia el "upsert" de la secuencia es este paso).
  `paso26_formulasDerivadas()`: el paso 14 sobre esa solapa.
- **Paso 14 adaptado**: una columna sin fórmula con `DERIVADAS_POR_SCRIPT = true` no es error ("la calcula
  el script"); c) sigue comparando los valores contra `Comunas`, y d) compara las cuatro de la fila
  contra el script. Termina en "CONFIRMADO: valores = Comunas…" con o sin fórmula.
- **Paso 27 — volver atrás**: `paso27_restaurarFormulasDerivadas_enSeco()` / `…()`, desde
  `DERIVADAS_RESPALDO`. Respaldo legible: **docs/formulas-respaldo.md** (con lo de CLAUDE.md 3.1.b; el
  texto exacto se completa con el log del paso 25).
- La solapa de los pasos 25 a 27: `PASO_DERIVADAS_SOLAPA` en `99_Correr.js` (hoy `'AAA NOBORRAR'`).
- **Test en Node** [19]: 0 distintas; una distinta la cuenta y frena el paso 26; en seco no cambia nada;
  quitar deja los mismos valores, sin fórmula, el encabezado como texto, sin color, protegidas, con
  respaldo; recalcular escribe sólo lo que cambió; el paso 14 sin fórmulas dice "valores = Comunas"; el
  upsert no escribe en una solapa que todavía tiene fórmulas; restaurar vuelve a poner las once. Toda la
  suite en verde.

**Recalcular al editar** (barrio, fecha, inscriptos, asistentes): **por ahora no**; sólo en la corrida de
cada hora. **Si el equipo lo necesita, se puede agregar un activador de edición** (`onEdit` instalable) que
recalcule la fila editada: anotado acá, no hecho.

**Validación previa, fuera de la planilla (05/10):** con el archivo exportado del destino
(`RDV JM CM ES + funcionarios.xlsx`, 02/10) se sacó el **texto exacto de las once fórmulas** (ahora en
docs/formulas-respaldo.md: real y copia idénticas; las de AB a AF empiezan en `$B$1`, así que su
encabezado es el de `Comunas`) y se corrió **el cálculo de `30_Derivadas.js`** contra los valores que
guardó la planilla: **0 distintas en las once columnas, 810 filas, en las dos solapas**. Quedan confirmados
el día en minúscula ("sábado"), el `IFERROR` de % vacío (Inscriptos = 0 → vacío) y el sufijo ", Buenos
Aires, Argentina". No hubo que cambiar el cálculo. (La comparación se hizo en Node con el código del repo;
el archivo, con datos reales, no está en el repo.)

**La secuencia, con la predicción anotada ANTES de cada corrida:**

*En la copia* (`PASO_DERIVADAS_SOLAPA = 'AAA NOBORRAR'`):

1. **`paso25_compararDerivadas()`**. **Predicción:** **0 distintas** en las 810 filas con datos (ya dio 0
   sobre el export del 02/10). Si aparece alguna, es un dato cargado después del 02/10: mirar los ejemplos.
2. **`paso26_quitarFormulasDerivadas_enSeco()`**. **Predicción:** "quitaría 11 columnas, ~8.900 celdas"
   (11 × ~810), 0 distintas, nada cambia.
3. **`paso26_quitarFormulasDerivadas()`** (con `DRY_RUN = false`). **Predicción:** quitadas 11, con
   fórmula 0, **0 distintas** después; `DERIVADAS_RESPALDO` con 11 líneas de la copia; las 11 columnas con
   protección (advertencia). Visualmente, la copia se ve igual.
4. **`DERIVADAS_POR_SCRIPT = true`**, push y clasp push.
5. **`paso26_recalcularDerivadas()`** (en la copia, en lugar del upsert). **Predicción:** **0 celdas** que
   cambian (recién quitadas, ya son las del script). Para probarlo de verdad: cambiar a mano el barrio o
   los inscriptos de una fila de la copia y volver a correrlo: cambian sólo esas celdas.
6. **`paso26_formulasDerivadas()`** (paso 14 sobre la copia). **Predicción:** "sin fórmula: 0 |
   calculadas por script: 11", c) todas coinciden, d) 0 distintas, **"CONFIRMADO: valores = Comunas"**.
   El upsert de esa hora sobre el real loguea "todavía con fórmula (no se escriben): …" las once: correcto.

**COPIA: HECHA (05/10).** Paso 25 en 0, las once fórmulas quitadas, los valores por script.

**Cambios para el real (05/10):**

- **`DERIVADAS_POR_SCRIPT = true`** y **`PASO_DERIVADAS_SOLAPA = 'RVD JM-CM - ES'`** (push y clasp push).
- **La protección**: si una derivada todavía tiene su fórmula en la fila 1, el recálculo **no escribe en esa
  columna** y lo avisa en el log, una línea por columna: *"la columna X todavía tiene fórmula: no se escribe.
  Correr paso26_quitarFormulasDerivadas"*. Así, mientras el real tenga las fórmulas (hasta el paso 26), las
  corridas de cada hora no rompen nada aunque el flag ya esté prendido.
- **En el proceso**: el recálculo de las once corre dentro de `upsertDestino` —y por lo tanto de
  `upsertDiario`, el del activador de cada hora, y del paso 22—, **después de escribir**, sobre **todas las
  filas**, sólo donde el valor cambió, sin color. El log dice cuántas celdas cambió **por columna**;
  `REGISTRO_UPSERT`, el total (columna `derivadas`).
- **Paso 16**: con `DERIVADAS_POR_SCRIPT`, el control del bloque 2 pasa a ser **"valores = cálculo" en las once
  columnas** (`compararDerivadas`: tiene que dar **0 distintas**; si no, es un problema), no la presencia de
  la fórmula. El paso 14 se sigue mostrando, como información (2b).
- **Test** [19] ampliado: el aviso por columna con fórmula; el paso 16 con 0 distintas aunque el real tenga
  fórmulas; una celda tipeada a mano en una derivada es un problema del paso 16; el upsert la corrige y lo
  dice por columna. Toda la suite en verde.

**REAL: PENDIENTE.** La secuencia, con la predicción anotada ANTES de correr:

1. **`paso25_compararDerivadas()`**. **Predicción: 0 distintas** en las ~810 filas con datos.
2. **`paso26_quitarFormulasDerivadas_enSeco()`**. **Predicción:** "quitaría la fórmula de 11 columnas", 0
   distintas, nada cambia.
3. **`paso26_quitarFormulasDerivadas()`**. **Predicción: quitadas 11**, con fórmula 0, 0 distintas después;
   `DERIVADAS_RESPALDO` suma las 11 líneas del real; las once protegidas con advertencia. Se ve igual.
4. **`upsertDestino()`** (o la corrida de cada hora). **Predicción: recálculo con 0 cambios** (los valores ya
   son los mismos): "celdas que cambió: 0" y 0 en cada una de las once; ningún aviso de "todavía tiene
   fórmula".
5. **`paso16_verificarEscritura()`**. **Predicción: OK**: invariante 0, Barrio 0, 0 incompletas, y en el
   bloque 2 **"distintas en las once: 0"**.

Si algo sale mal: paso 27 (restaurar las fórmulas desde `DERIVADAS_RESPALDO`) y `DERIVADAS_POR_SCRIPT = false`.

### t) 04/10: migración al real — HECHA. Lo que falta: los activadores

**Migración al real (04/10 00:20–00:21): OK, coincide con la predicción de 0.s.**

| | resultado |
|---|---|
| antes (paso 16) | Barrio con color del sistema **0**, **123** con `RDV_UID`, **1** incompleta (la fila 6) |
| paso 1 | `form_clave` agregada (columna 47) |
| **paso 22** | **757 filas**, **634 uids nuevos** (123 ya estaban), **781 celdas de dato**, **0 pisadas**, 14 s de escritura (33 s en total), `HISTORICO_SIN_RESOLVER` **50**, **3 fichas** |
| paso 16 después | **OK**: invariante 0, Barrio 0, **0 incompletas en todo el destino** |
| paso 20 (activas) | **f = 0** |

**Línea de base del real anotada**: `LINEA_BASE_AZULES['RVD JM-CM - ES'] = { barrio: 0, … }` (`00_Config.js`).
Barrio no puede subir de 0.

**Lo que sigue de la secuencia de 0.s:** el 7 sobre todo el destino (`PASO20_DESDE = 2`, si se quiere: el de
las activas ya dio f = 0), el 8 (`upsertDestino()` normal: no escribe nada), el 9 (paso 19, sin "Semaforo
politico") y el 10, **los activadores**:

1. **`paso23_listarActivadores()`** (`diagnostico/14_activadores.js`, **sólo lectura**): lista los
   activadores del proyecto —**el legado está en el mismo proyecto de Apps Script** (mismo scriptId)— y
   marca cada uno **BORRAR / MANTENER / AGENDA / NUEVO / DESCONOCIDO** según docs/triggers-legado.md (la
   lista exacta de lo que no tiene que tener activador está ahí, sección "04/10"). **Límite:**
   `getProjectTriggers()` ve sólo los de la cuenta que lo corre; los de otra cuenta, en el editor →
   Activadores (columna "Propietario"). Un script atado a otra planilla es otro proyecto: no se puede
   listar desde acá. **Predicción:** ninguno a BORRAR de esta cuenta (los tres del legado se apagaron el
   24/09); `syncAgendaSheetInBaseFromAgenda_2` como MANTENER, si es de esta cuenta.
2. Borrar en el editor lo que marque BORRAR (si hay algo).
3. **`paso24_instalarActivadorCadaHora()`** (**lo corre el usuario** cuando confirme que el legado está
   apagado): crea UN activador de tiempo, `upsertDiario` cada 1 hora (respeta `DRY_RUN`; `LockService` y
   `REGISTRO_UPSERT` ya están en el upsert). **Se niega** si el destino no es el real o si el paso 23
   marca alguno a BORRAR; si ya existe, no crea otro. Las filas de hoy o de ayer sin barrio quedan
   `pendiente_barrio` y se reevalúan en la corrida siguiente (con los barrios cargados, la subzona de la
   Comuna 1 —regla 10— decide). Después: anotarlo en docs/triggers-legado.md (fecha, dueño).
   `paso24_borrarActivadorCadaHora()` lo saca (sólo ése).

**Test en Node** [18]: el paso 23 marca a BORRAR el legado y una función que no existe, Agenda como
MANTENER; el paso 24 se niega con legado vivo o con el destino en la copia, instala uno solo y no
duplica; borrarlo no toca los demás. Toda la suite en verde.

#### Pendientes al 04/10

- **Agenda**: otro proceso (Fase 8). Las columnas de agenda del destino (`Figura`, `Barrio`, `FECHA`,
  `HORA`, `Dirección`, `EVENTO`) no las escribe el sistema.
- **Eliminar B2**: el sistema ya no la usa (calcula desde `B`); falta sacar la solapa y el código legado que
  la escribe (`Sync B to B2.js`).
- **Borrar la solapa "AAA NOBORRAR"** (la copia de prueba) y su entrada en `LINEA_BASE_AZULES`.
- **Consultas al equipo** (1a):
  - **"Otros"**: ¿a qué canal va? Mientras tanto, Otros → Difusión (como el legado);
  - **`Jorge Macri - Genérico 2026`** (774 inscriptos): ¿un formulario genérico tiene que matchear con
    alguna reunión?;
  - **Mraida Comuna 3, 20/7 y 22/7**: sin fila, los dos con más de 100 inscriptos;
  - **Flores 29/1 contra CCV Versalles 29/1**: ¿una reunión o dos?;
  - **1 a 1 Villa Riachuelo 11/8 contra Parque Avellaneda 12/8**: ¿reubicación?;
  - **Boedo**: el equipo puso "Sur | Centro" en el eje; quedó "Sur". ¿Va con los dos?

### s) 03/10 22:00: fichas aprobadas y prendidas; paso 22 (completar el historial) y la secuencia en el real

**Paso 21 de las 21:51: fichas aprobadas** (orden por confianza y "¿por qué?" sobre la opción 1 —631 y
309 correctas—, eje en amarillo, confianza en palabras, gemelo descartado en la 309).

**Hecho en este commit:**

1. **El eje no se repite**: con "⚠️/✅ Eje …" a la vista, ya no se agrega "⚪ ubicación (el formulario dice
   Eje …)" (631, opción 1). Test [16].
2. **`REVISAR_COMO_FICHAS = true`**: la próxima corrida del upsert escribe REVISAR_MATCH como fichas.
   **docs/elegir-match.md es ahora la página de las fichas** (la vieja quedó en git). **La solapa
   `REVISAR_FICHAS_PRUEBA` la borra el usuario**: `paso21_borrarSolapaDePrueba()` (sólo esa solapa, por
   nombre), o a mano.
3. **`paso22_completarHistorial()`** (`completarHistorial`, decisión 13 de CLAUDE.md): el upsert UNA VEZ
   sobre todas las filas, `{ historial: true }` sólo para esa corrida (**`DIAS_ACTIVOS` no se toca**).
   Mismas reglas: sólo celda vacía, invariante sobre todo el destino, traza y `#CFE2F3`, `LockService`,
   `REGISTRO_UPSERT` (columna nueva **`alcance`**: "historial (paso 22)" / "activas (30 días)"). Asistentes
   y STATUS también en las filas viejas. **Reanudable**: si se corta, el log dice *"FALTAN N filas del
   historial: volver a correr paso22_completarHistorial()"* y la siguiente sigue por `RDV_UID`. Lo viejo
   sin resolver va a **`HISTORICO_SIN_RESOLVER`** (intermedia, sólo informativa: fila, figura, fecha,
   barrio, veredicto, motivo, mejor opción, confianza); las fichas siguen con los últimos 30 días;
   SIN_MATCH y EMPAREJAR no se reescriben en esa corrida (los regenera la próxima normal). Hay versión en
   seco: `paso22_completarHistorial_enSeco()`.
   - **paso 16**: las incompletas de las filas cerradas se cuentan aparte (información) y suma *"incompletas
     en TODO el destino"*; el control sigue siendo sobre las activas.
   - **paso 20 con rango** (`PASO20_DESDE = 2`): usa el plan de todo el historial, así una fila cerrada
     tiene su decisión y "DEBERÍA ESTAR ESCRITA" se puede leer sobre todo el destino.
   - **Test [17]**: con `DIAS_ACTIVOS = 30`, el paso 22 escribe **lo mismo** que el upsert con `DIAS_ACTIVOS
     = null` (salvo los uuids); completa las viejas (Asistentes y en agenda → Realizada incluidos); 0
     pisadas; la fila vieja en revisión va a HISTORICO_SIN_RESOLVER y no a las fichas; paso 16 con 0
     incompletas en todo el destino; paso 20 sobre todo el destino con f = 0; **después, un upsert normal
     no escribe nada**; con el servicio 50 veces más lento se corta, dice cuánto falta, sigue y termina
     igual. Toda la suite en verde.
4. **Paso 19 sin "Semaforo politico"**: `COLUMNAS_NO_REPINTAR` (`00_Config.js`); el log dice cuántas
   celdas de esa columna dejó sin repintar.

**Paso 22 sobre la copia (03/10 22:15), como se esperaba:** 0 celdas escritas (la copia ya estaba
completa), `HISTORICO_SIN_RESOLVER` con **50 filas**, **3 fichas**, EMPAREJAR con **1 formulario sin
candidato** (y **64 de reuniones cerradas, descartados**: los que antes sumaban al 65), **15 s**.
`COLUMNAS_NO_REPINTAR` con "Semaforo politico": correcto.

**Confirmado por el usuario: `RDV_HOJA_DESTINO = 'RVD JM-CM - ES'` (commit del 03/10, push y clasp push).**

**La secuencia en el real, con la predicción anotada ANTES de correr:**

1. ~~`RDV_HOJA_DESTINO = 'RVD JM-CM - ES'` en `00_Config.js`, commit, `git push` y `clasp push`.~~ **Hecho
   el 03/10**, con la confirmación del usuario. **Lo próximo es el paso 2.**
2. El usuario le pone nombre a la versión del destino (Archivo → Historial de versiones).
3. **`paso16_verificarEscritura()`** → la línea de base de Barrio del real: anotarla en
   `LINEA_BASE_AZULES['RVD JM-CM - ES'].barrio`.
4. **`paso1_columnasDeTraza()`** → agrega `form_clave` al real (sólo el encabezado, al final).
5. **`paso22_completarHistorial()`** (repetir si se corta). **Predicción:** **unas 757 filas con
   `RDV_UID`** (123 ya estaban: entran por `RDV_UID` y sólo se completa lo que les falta); cantidades por
   columna (`por columna` del log y `REGISTRO_UPSERT`) **parecidas a lo que se escribió en la copia**
   (Inscriptos, canales, sexo, edades, Sin identificar, Asistentes); **0 valores pisados**; **Sin
   identificar de la fila 6 = 13**; invariante 0; **`HISTORICO_SIN_RESOLVER` con ~50 filas**.
6. **`paso16_verificarEscritura()`** → **OK**: invariante 0, traza ambigua 0, Barrio sin subir, **0
   incompletas en TODO el destino**.
7. **`paso20_porQueVacia()` sobre todo el destino** (`PASO20_DESDE = 2` en `99_Correr.js`) → **f = 0**.
   Después, volver `PASO20_DESDE = null`.
8. **`upsertDestino()` normal** → **no escribe nada** (todo completo); REVISAR_MATCH con las fichas de los
   últimos 30 días.
9. **`paso19_repintarAzulViejo_enSeco()`**, después **`paso19_repintarAzulViejo()`** (sin "Semaforo
   politico").
10. **El activador cada hora** (`docs/triggers-legado.md` antes).

### r) 03/10 noche: lo que dejó el paso 21 de las 16:37 (antes de prender las fichas)

**Resultado del paso 21 y del upsert** (03/10 16:37–16:39, sobre la copia): las frases y las líneas
✅/❌ se entienden; **el corte de 30 días anda: 44 filas activas, 14 s, 3 fichas pendientes.** Cinco
arreglos antes de prender `REVISAR_COMO_FICHAS`:

1. **ERROR, el orden de las opciones.** Iba primero el que el sistema eligió o propone; en la 631 la
   opción 1 tenía 0,81 y la 2 tenía 1, en la 309 0,63 y 1. Ahora **por puntaje, de mayor a menor, y a
   igual puntaje por cercanía de fecha** (`listaOpcionesFila_`; el elegido sigue siempre entre las 3;
   también en el formato viejo de REVISAR_MATCH y en el bloque "POR FILA" de EMPAREJAR). **"¿por qué?"
   habla de la opción 1**; si el motivo es de otro formulario (reubicación, `multi_figura`, clave
   repetida), lo nombra por su número y dice por qué la 1 no se escribe. En la 309 hablaba del 12/11
   Constitución (0,63, lo que dejó la re-evaluación del invariante) cuando la mejor es el 07/11 Villa
   Pueyrredón (1, a 2 días). Test [16] (la 309 sintética).
2. **El eje, sólo para la persona**: "✅ Eje X" o "⚠️ Eje Sur, la reunión está en el Eje Oeste" (columna
   I de `Comunas`), y la celda de ubicación en verde o **amarillo** si no hay barrio ni comuna que
   comparar. **No cambia el puntaje ni la decisión** (`EJE_COMO_UBICACION` sigue en `false`). Test [16].
3. **Confianza en palabras**: *alta* (≥ 0,88) / *media* (≥ `CONFIANZA_MEDIA` = 0,6) / *baja*. El número,
   en una columna oculta (`puntaje`; ahora son 5 las ocultas). El paso 21 lo muestra en el log.
4. **Contexto**: en gris, los formularios de la figura **descartados por la regla 3** a ±7 días
   ("descartado: 0 inscriptos, cierra 04/11; su gemelo tiene 49"). Caso: la 309.
5. **EMPAREJAR_MANUAL, "formularios sin candidato" 29 → 65**: era un bug mío del 03/10 tarde. El filtro
   de formularios viejos estaba sólo en la lista de pares; **el bloque de huérfanos recorría todos los
   formularios sin usar**, y al sacar las filas cerradas, los de esas reuniones quedaron sin pares y
   pasaron a contar. Ahora un formulario de una reunión cerrada (su fecha antes del primer día activo
   menos la tolerancia: 3 días con fecha en el nombre, 6 con el cierre; `formularioDeReunionActiva_`)
   **no propone pares ni es huérfano**: se cuenta aparte. **Cuántos de los 65 eran de reuniones cerradas
   lo dice el próximo log** (no puedo leer la planilla desde acá), en el bloque 3:
   - `formularios sin candidato` → sólo los de reuniones activas;
   - `formularios de reuniones CERRADAS sin usar, descartados` → todos los de reuniones cerradas;
   - `de ésos, los que antes del 03/10 se contaban como "sin candidato"` → **ésta es la parte de los 65
     que era de reuniones cerradas** (columna ventana | total, como el 65).
   **Predicción:** `sin candidato` vuelve a **menos de 29** (sólo formularios de los últimos 30 días) y
   `antes se contaban` da **≈ 65 − ese número** en la columna de la ventana. Test: [15].

**Test en Node**: [15] actualizado (5 columnas ocultas, frase del margen chico, EMPAREJAR sin los
formularios de reuniones cerradas) y [16] nuevo (`--fichas` corre los dos). Toda la suite en verde.

**La secuencia, con la predicción anotada antes de correr:**

1. `clasp push` (hecho con este commit).
2. **`paso21_fichasDePrueba()`** (las mismas 5 filas). **Predicción:** en las 5 fichas, las opciones con
   la confianza de mayor a menor; **en la 309, la opción 1 es el 07/11 Villa Pueyrredón** (confianza alta,
   ocupado por la 315) y "¿por qué?" habla de ella; en la 631, la opción 1 es la de puntaje 1; la 309
   muestra en gris el gemelo descartado. La solapa `REVISAR_FICHAS_PRUEBA`, regenerada: **la ve el
   usuario antes de prender `REVISAR_COMO_FICHAS`.**
3. `upsertDestino()` una vez (o `paso2_upsertEnSeco()`): el bloque 3 del log con los dos números de
   EMPAREJAR del punto 5.

### q) 03/10 tarde: filas activas (`DIAS_ACTIVOS = 30`) y REVISAR_MATCH como fichas

**Dos decisiones del usuario**, implementadas juntas porque se tocan (CLAUDE.md, decisión 13 y
"REVISAR_MATCH como fichas" en la decisión 2):

**1. Filas activas.** El sistema trabaja sólo sobre las reuniones de hoy − 30 a hoy
(`DIAS_ACTIVOS`, `00_Config.js`; `esFilaActiva_`, `01_Utils.js`). Lo anterior está cerrado y no se
toca. Dato del usuario que lo sostiene: **un formulario aparece en `B` recién cuando cerró**, así que
sus números son finales y se escriben apenas hay match (anotado en CLAUDE.md, sección 0).

- **sólo filas activas**: la escritura del upsert (datos, traza, STATUS, Asistentes), REVISAR_MATCH,
  SIN_MATCH, EMPAREJAR_MANUAL (sin los formularios de reuniones cerradas: ver 0.r, punto 5), la lectura de "elegido" y el rango por defecto
  del paso 20 (`PASO20_DESDE = null`);
- **todo el historial, sin cambios**: el invariante (una fila vieja con `RDV_UID` sigue teniendo su
  formulario), los candidatos de `B` y el invariante del paso 16. Las "incompletas" y "sin
  form_clave" del paso 16 se cuentan sólo en las activas (una cerrada no se completa más);
- **las mediciones** (pasos 6 a 13, 17, el bloque 5 del paso 16) piden el plan entero
  (`{ historial: true }`). La calibración sobre la ventana de análisis, que no cambió:
  **`paso2b_calibrarHistorial()`** (sólo log);
- **log**: *"filas activas: N (de … a …, hoy − 30) | cerradas: M (sin resolver, sin RDV_UID: X) |
  futuras: K"* y, al final del upsert, *"tiempo de corrida: S s"*.

**2. Las fichas** (`26_Fichas.js`). **Apagadas** (`REVISAR_COMO_FICHAS = false`): REVISAR_MATCH sigue
como estaba hasta que el usuario las valide. Una ficha por reunión pendiente activa: la línea
REUNIÓN (con "elegido" en desplegable, "comentario" y "resultado"), "¿por qué?", hasta 3 opciones en
las mismas columnas con colores por celda y su línea de coincide / no coincide, las otras reuniones
de la figura a ±7 días en gris, y RESUELTAS al final. "No sé" y un comentario solo son notas
(`ELECCIONES_MATCH`, nueva columna `comentario`); una elección nueva en una ficha reemplaza la
pendiente de esa fila. Identidad, igual que antes: fila por figura + fecha + barrio (columnas ocultas),
formulario por `form_clave`. El lector de "elegido" reconoce los dos formatos.

**Paso 21 — `paso21_fichasDePrueba()`** (`diagnostico/13_fichas_prueba.js`): **no escribe el
destino ni REVISAR_MATCH**. Al log, las fichas de las filas de `PASO21_FILAS` (631, 521, 274, 618 y
309) como texto, con marcas `[v]` verde / `[x]` rojo / `[·]` gris, estén o no pendientes o activas
(usa el plan entero: **274 y 309 son de 2025, cerradas: el log lo dice y no aparecen en la solapa**).
Y la solapa entera, como la escribiría el upsert, en **`REVISAR_FICHAS_PRUEBA`** (intermedia).

**Test en Node** [15] (`--fichas`): con `DIAS_ACTIVOS = 30`, ninguna fila cerrada se toca y las
activas se escriben; la fila cerrada en revisión no tiene ficha; orden por fecha; desplegable;
columnas ocultas; frase y línea de coincide de una posible reubicación ("❌ comuna (C6, la reunión es
Flores (C7))") y de un margen chico; colores; "Opción 2" válida en seco → RESUELTAS → aplicada en la
real; "No sé" con comentario queda pendiente y se guarda como nota; "Ninguno" la reemplaza y la
ficha pasa a RESUELTAS; el paso 21 muestra una fila cerrada sin tocar el destino; paso 16 OK; paso 20
por defecto sobre las activas. Los escenarios de antes corren con `DIAS_ACTIVOS = null` (sus fechas
son de 2025-2026 contra un "hoy" fijo). Toda la suite en verde.

**La secuencia, con la predicción anotada ANTES de correr** (la constante sigue en `'AAA NOBORRAR'`):

1. `clasp push` (hecho con este commit).
2. **`paso21_fichasDePrueba()`**. **Predicción:** las 5 fichas en el log; **274 y 309 marcadas
   CERRADA** (no aparecen en la solapa); 631, 521 y 618 dicen si están pendientes (si alguna ya tiene
   `RDV_UID` o se escribe, la ficha lo dice en "¿por qué?"). La solapa `REVISAR_FICHAS_PRUEBA` queda
   sólo con las pendientes de los últimos 30 días (de las 40 en revisión de hoy, las del 03/09 en
   adelante), más las SIN_MATCH de ese período. **El usuario valida las frases y las líneas de
   coincide / no coincide** antes de pasarlo al equipo.
3. **`upsertDestino()`** una vez. **Predicción:** el log dice **unas 40–50 filas activas**; **no
   escribe nada nuevo** (ya está todo completo: 0 celdas de dato, 0 uids); REVISAR_MATCH (todavía en
   el formato viejo) y SIN_MATCH quedan sólo con filas de los últimos 30 días; **el tiempo de corrida
   baja** (se evalúan ~50 filas en vez de ~800; leer `B` sigue costando lo mismo, ~1 minuto).
4. Si las fichas se validan: `REVISAR_COMO_FICHAS = true`, commit, push y clasp push; reemplazar
   **docs/elegir-match.md** por **docs/elegir-match-fichas.md** (ya escrita) y pasarla al equipo.

### p) 03/10: paso 20 ("por qué está vacía") y la lectura de "elegido"

**Paso 20 — `paso20_porQueVacia()`** (`diagnostico/12_por_que_vacia.js`, sólo lectura). Rango en
`99_Correr.js` (`PASO20_DESDE` = 800, `PASO20_HASTA` = null: hasta el final). Para cada celda vacía de las
columnas del sistema (Inscriptos —también en 0—, los cinco canales, Masculinos, Femeninos, las 5 edades,
Sin identificar, Asistentes; y STATUS que no sea "Realizada"), UNA causa: a) sin formulario
(REVISAR_MATCH con su motivo, SIN_MATCH, pendiente de barrio, "ninguno", RDV_UID ambiguo); b) B trae 0 o
vacío; c) desagregado retenido (Inscriptos ≠ B); d) Asistentes (RDV CONJUNTO no tiene la fila / varias
figuras / 2+ filas sin desempate / dos valores / la tiene sin asistentes); e) STATUS (no está "en
agenda" / sin asistentes); f) **DEBERÍA ESTAR ESCRITA**: el sistema la escribiría ahora mismo
(`celdasDeDecision_`, la misma función que la escritura). Al final, resumen por causa y la lista de f.
**Después de una corrida real, f tiene que dar 0.** Usa el mismo plan, el mismo cruce de Asistentes y la
misma decisión por fila que el upsert (`decisionDeFila_`).

**"elegido" (regla 4)** — `25_Elecciones.js`; para el equipo, **docs/elegir-match.md**:

- dónde: `REVISAR_MATCH` (el número de la opción, "sí" = la 1, o "ninguno"), `EMPAREJAR_MANUAL` arriba
  ("sí" en el par) y su bloque "POR FILA DEL DESTINO" (como REVISAR). Cada opción lleva ahora su
  `op{n}_clave`; la columna `confirmar` de EMPAREJAR pasó a llamarse `elegido`, con `resultado` y
  `form_clave` al lado;
- identidad: la fila por figura + fecha + barrio, el formulario por su clave (`form_clave`). Nunca por
  número de fila;
- válida → se escribe en la corrida REAL siguiente como cualquier match (sólo celda vacía, invariante
  por grupo), traza `+elegido_por_persona`. En seco sólo se dice ("válida (en seco…)");
- rechazos (nada se escribe): el formulario ya tiene otra fila / ya no existe en B / dos elecciones
  para la misma fila o el mismo formulario / ilegible / la fila no se encuentra, ya está escrita o es
  futura;
- "ninguno" → no se escribe ni se propone; **vence** si aparece un formulario nuevo de la figura a
  ±`VENTANA_NINGUNO_DIAS` (7) días;
- **se guardan en `ELECCIONES_MATCH`** (intermedia; el sistema no la borra nunca). Al regenerar las
  solapas, cada línea vuelve a mostrar su "elegido" y "resultado"; las de filas que ya no aparecen
  (aplicadas, válidas, "ninguno") van al final de REVISAR_MATCH con su resultado. Anular una elección:
  borrar su fila en `ELECCIONES_MATCH`;
- el paso 2 y el upsert listan las leídas, válidas, rechazadas, "ninguno" y vencidas.

**Test en Node:** [13] el paso 20 (antes del upsert, f > 0; después, f = 0 y aparecen b, c, d, e); [14]
"elegido": sin elecciones el upsert no cambia nada; una válida (se escribe con
`+elegido_por_persona` y su línea dice "aplicado <fecha>"), una que choca con el invariante ("rechazado:
el formulario ya tiene otra fila"), un "ninguno" (no se propone, no se escribe, vence con un formulario
nuevo a 3 días) y la solapa regenerada en seco que conserva lo elegido. Toda la suite en verde.

**Predicción en la copia, anotada antes de correr:** con **0 elecciones cargadas**, `upsertDestino()`
**no cambia nada** de lo que haría sin esta función (el log dice "leídas nuevas: 0"), y `ELECCIONES_MATCH`
no se crea. `paso20_porQueVacia()` después de un upsert: **f = 0**.

**Falso aviso de incompletas** (0.o): el usuario vuelve a correr el paso 16 en la copia para ver si las
filas **29, 36, 66, 86 y 786** dejaron de aparecer. Si siguen, con fila y columna se mira.

### o) Pendientes al 03/10

- **Backup del 02/10: resuelto** (había que compartirlo con la cuenta que corre el script). El ID de
  `RDV_SS_BACKUP_0210` no cambia; el chequeo 4 del paso 18 vuelve a aplicarse.
  *[Corrección del 07/10: no estaba resuelto. Ese archivo era una copia de la intermedia, sin la solapa del destino, y
  el chequeo 4 nunca se aplicó. Ver docs/backup.md §8.3.]*
- **"Otros"**: consulta al equipo (1a). `MAPEO_CANALES` sigue en Otros → Difusión.
- **El falso aviso de incompletas cuando B trae 0: arreglado (03/10).** En `Inscriptos`, un 0 del
  destino cuenta como vacío; si `B` también traía 0, el sistema "escribía" 0 sobre 0, la celda seguía en
  0 y el paso 16 la daba por incompleta en cada corrida (y la repintaba). Ahora un 0 de `B` no completa
  una celda que vale por vacía porque tiene 0. Test [12], caso b2. Si el aviso que se vio era en otra
  columna, falta el ejemplo (fila y columna).
- ~~Paso 20 ("por qué está vacía")~~ **hecho** (0.p).
- ~~La lectura de `elegido`~~ **hecha** (0.p): por la clave del formulario de la línea (`op{n}_clave`),
  nunca por la fila de `B`.
- **`paso19_repintarAzulViejo_enSeco()` en la copia**: pendiente de correr.
- Siguen de antes: las columnas de agenda (otro proceso), eliminar B2, volver la constante al real.

### n) 02/10 noche: PASO B implementado — prueba en la copia

**Resultados que lo habilitaron** (paso 17 de las 23:12 y paso 18 de las 23:13, sobre la copia):

- **Cuentas: B = B2 en todas las columnas** (Inscriptos 691/692, canales 678–702 de ~700, sexo 677/678,
  edades 681/682, Sin identificar 697/698). Las diferencias con el destino son cargas a mano (destino ≠
  B2): no se corrigen. **`DIVISOR_SEXO` queda en "identificados"** (698/703, igual que M+F+X; M+F da
  peor). Regla del desagregado: **0 filas** quedan sin él.
- **Paso 18**: real 1 celda (fila 6, Sin identificar 62 → 13), copia 97. Las vacía el usuario
  (`vaciarCopia`, `vaciarReal`). **El backup no se pudo abrir ("no permission")**: el usuario verifica el
  ID (`RDV_SS_BACKUP_0210`); si cambia, se actualiza. El paso 18 ahora avisa y sigue sin el chequeo 4,
  nunca termina en error.
- **Asistentes: cruzan 754 de 780.** El destino tiene Asistentes en 798 filas y sólo 7 con el color del
  sistema: **los carga el equipo**. Con "sólo celda vacía", hoy se escribirían 9. Las 41 que difieren:
  sólo se cuentan.

**Qué hace el sistema desde el paso B** (CLAUDE.md, decisión 8):

- **`COLUMNAS_MANUALES = ['Barrio']`**. Inscriptos, los cinco canales, el desagregado y Asistentes son
  columnas del sistema: **sólo celda vacía, nunca se pisa un valor**;
- **Inscriptos**: un 0 cuenta como vacío (`INSCRIPTOS_CERO_ES_VACIO`);
- **canales** con `COLUMNAS_B` + `MAPEO_CANALES` (RRSS = Facebook + Google + Programmatic; Difusión =
  Difusion + Otros);
- **el desagregado** (sexo, edades, Sin identificar) **sólo si Inscriptos está vacío o es igual al de
  B**, mirado sobre la fila fresca de la tanda;
- **Asistentes** desde RDV CONJUNTO (`cruzarAsistentes_`, el mismo cruce que el paso 17), **con o sin
  formulario**: figura por tokens + fecha; **2+ filas de esa figura ese día → desempata el barrio**
  (normalizado: "Villa Gral. Mitre" = "Villa General Mitre") **o la comuna** si RDV CONJUNTO la trae
  ("C3", "C1N", "C1S" contra la comuna y la subzona del barrio del destino); sin desempate, se lista y
  no se escribe. Nombres con varias figuras (Lombardi/Tapia/Piragine) o ninguna ("Deporte"): fuera. Dos
  asistentes distintos para la misma fila: no se escribe ninguno;
- **STATUS** `en agenda` → `Realizada` sólo con asistentes (los que tenía la fila o los que se escriben
  ahora), en cualquier fila que no sea de una reunión futura;
- **color `#CFE2F3`** (`COLOR_SISTEMA`) en todo lo nuevo; los controles reconocen también el
  `#4F81BD`. **`paso19_repintarAzulViejo_enSeco()`** cuenta por columna y
  **`paso19_repintarAzulViejo()`** (con `DRY_RUN = false`) repinta sin tocar valores. Lo corre el usuario;
- **paso 16**: "no puede subir" sólo para `Barrio` (`LINEA_BASE_AZULES[solapa].barrio`, se anota con el
  próximo paso 16); el resto, **por columna** (actual | viejo), y lo que escribió la última corrida por
  columna (`REGISTRO_UPSERT`, columna `por_columna`).

**Test en Node** [12]: Inscriptos completado en las filas vaciadas y en la que tenía 0; con Inscriptos ≠
B el desagregado no se escribe; canales completados; Asistentes completados y "en agenda" → Realizada;
dos filas con la misma figura y fecha desempatadas por barrio y por comuna; 0 pisadas, Barrio y
derivadas sin tocar, todo lo nuevo en `#CFE2F3`; paso 16 sin problemas; el paso 19 en seco no toca nada y
después repinta sin cambiar el valor. Toda la suite en verde.

**La secuencia en la copia, con la predicción anotada antes de correr** (la constante sigue en
`'AAA NOBORRAR'`):

1. `paso18_malEscritas_vaciarCopia()` (si todavía no se corrió): vacía las 97.
2. **`paso16_verificarEscritura()`** — línea de base de Barrio: anotarla en
   `LINEA_BASE_AZULES['AAA NOBORRAR'].barrio`. **Predicción:** "incompletas" sube (ahora cuenta Inscriptos
   y canales vacíos que B tiene: las filas de la 800 en adelante y las 97 de Sin identificar); invariante
   0; traza con el color 0 sin color.
3. **`upsertDestino()`** una vez. **Predicción:** completa en una corrida; escribe **Inscriptos y canales
   en las filas de la 800 en adelante** (las que el usuario vació) y en las escritas que tengan esas celdas
   vacías; **Sin identificar recompletado con el valor correcto** en las 97; **Asistentes ≈ 9** (más las
   que desempate el barrio o la comuna); STATUS → Realizada donde corresponda; **0 celdas con valor
   pisadas**; todo lo nuevo en `#CFE2F3`. El log del cruce: desempatadas por barrio o comuna, y la lista
   de las que siguen sin desempate.
4. **`paso16_verificarEscritura()`**. **Predicción:** **OK**: invariante 0, Barrio sin subir, 0
   incompletas, traza toda con el color, "por columna" con lo escrito.
5. `paso19_repintarAzulViejo_enSeco()`: cuántas celdas en `#4F81BD` por columna. Repintar, cuando el
   usuario decida.

**Si da OK** (y sólo entonces): `RDV_HOJA_DESTINO = 'RVD JM-CM - ES'`, push y clasp push; "AAA NOBORRAR"
queda como referencia. En el real, con la predicción escrita antes: `paso16` (línea de base de Barrio) →
`paso1_columnasDeTraza` → `upsertDestino` → `paso16`. Recién después, el activador cada hora.

### m) 02/10 19:25: el paso A destapó un bug — `B` cambió los encabezados

> ⛔ **NO correr `upsertDestino()` en ninguna solapa hasta terminar la secuencia de abajo** (pasos 1 a
> 3). El código ya está arreglado, pero las celdas mal escritas siguen en el destino.

**Resultado del paso 17** (02/10 19:25, sobre la copia): **Inscriptos B = B2 en 702 de 703** (la
fórmula es la del legado). Destino ≠ B en 64 filas, 63 porque el destino no vino de B2 (carga a mano):
no se corrigen. Pero **sexo, edades y canales no se leían**, y **Asistentes no cruzó ninguna fila (0
de 766)**.

**1. El bug.** Desde que `B` es un `QUERY` sobre `Hoja1` (02/10), sus encabezados son los del origen:
`nombre | fecha_fin | inscriptos | inscriptos_identificados | inscriptos_M | inscriptos_F | inscriptos_X |
inscriptos_conMail | inscriptos_conCelular | inscriptos_conFijo | inscriptos_canal_Mailing | … |
inscriptos_canal_CallCenter | … | inscriptos_edades_18_24 | … | inscriptos_edades_66plus`. El upsert los
buscaba con los nombres viejos (`Inscriptos M`, `Inscriptos unicos identificados`, `Inscriptos edades
18-24`…), **como opcionales**, y calculó con ceros: **`Sin identificar = Inscriptos`**, y **lo escribió**
donde estaba vacío (real 14:50 y copia 17:01). Masculinos, Femeninos y las bandas daban vacío y no se
escribieron. `Nombre`, `Fecha_Fin` e `Inscriptos` sí se leían: el encabezado se compara normalizado.

**El arreglo:**

- **`COLUMNAS_B`** en `00_Config.js`: cada campo con su nombre actual y el viejo como alias. Si el origen
  vuelve a cambiar, se toca sólo esa tabla. `MAPEO_CANALES` ahora apunta a esos campos.
- **Obligatorios**: sexo, identificados, las 5 edades, los 8 canales (y nombre, cierre, inscriptos). Si
  falta uno, `leerCandidatos_` tira error y **nada se calcula ni se escribe** —ni el upsert, ni el paso
  17, ni ningún paso que arme el plan—. `inscriptos_X` es opcional.
- **El divisor del sexo** (`DIVISOR_SEXO = 'identificados'`, el del legado) queda configurable:
  `'M+F'` o `'M+F+X'`. El paso 17 (bloque **1c**) mide con los tres cuál da lo mismo que B2.
- **Paso 18, lo mal escrito** (esto sí se corrige: es error nuestro, no del pasado):
  `paso18_malEscritas_listar()` en seco lista, en el real y en la copia, cada celda de sexo o edades
  de una fila con `RDV_UID` que tiene el azul, tiene el valor que daba el cálculo roto, es distinta de
  la correcta y **estaba vacía en el backup del 02/10** (buscada por figura + fecha). Muestra el valor
  escrito y el correcto. Después, `paso18_malEscritas_vaciarCopia()` y `paso18_malEscritas_vaciarReal()`
  las vacían y les sacan el color, y sólo si siguen como se listaron. La corrida siguiente del upsert
  las completa bien: entran por `RDV_UID`. Por construcción, la única columna afectada es `Sin
  identificar`.

**2. Asistentes: el cruce nuevo.** RDV CONJUNTO escribe "Apellido Nombre(s)" ("Macri Jorge", "Gonzalez
Bernaldo De Quiros Fernan", "Muzzio Maria Clara"). Ahora (bloque 4 del paso 17):

- **4a, la medición previa**: cómo están escritos los nombres en RDV CONJUNTO y en **A2** (la última
  salida del legado), con cuántos resuelven a una figura; y en el destino, cuántas filas tienen
  Asistentes y cuántas de ésas en azul (las puso el legado). Dice si RDV CONJUNTO cambió de formato o si
  los asistentes se cargaban por otro lado;
- **figura por tokens** (`figuraPorTokens_`, `02_Parsing.js`): coincide si **todos** los tokens del
  nombre canónico están en el texto, en cualquier orden. **`FIGURAS_CANONICAS` no existe**: los nombres
  canónicos son los de la columna `Figura` del destino. Con varias o ninguna, se lista y no se usa;
- **clave figura + fecha**; el barrio sólo confirma (si difiere, se lista y cruza igual);
- "No aplica" y las filas de antes del inicio del destino se ignoran y se cuentan aparte.

**3. `INSCRIPTOS_CERO_ES_VACIO = true`**: en Inscriptos, un 0 del destino cuenta como vacío (filas 6,
680, 696, 697). Hoy lo usa el paso 17; el paso B lo va a usar para escribir.

**Test en Node:** [9] el paso 17 con los encabezados nuevos (sexo, edades y Sin identificar B = B2 en
todas; el divisor "identificados" coincide; los Asistentes "Apellido Nombre" cruzan por tokens + fecha,
también las filas sin barrio; "No aplica" y 2024 aparte); [10] los encabezados viejos se leen por alias, y
con una obligatoria faltando el upsert y el paso 17 se frenan sin escribir; [11] el paso 18 lista en seco,
respeta lo que estaba en el backup, vacía, saca el color, y la corrida siguiente completa bien. Todo en
verde.

**La secuencia, con la predicción anotada antes de correr:**

1. **`paso17_validarCuentas()`**. Predicción: **Masculinos, Femeninos, las 5 bandas y Sin identificar
   con B = B2 en casi todas las filas** (antes, Sin identificar 7 de 698); en 1c, el divisor
   "identificados" coincide con B2 en casi todas (si "M+F" coincide más, se cambia `DIVISOR_SEXO`);
   canales con B = B2 casi siempre; **Asistentes: casi todas las de 2025-2026 cruzan**, con la lista de
   las que no y de los nombres que caen en varias figuras.
2. **`paso18_malEscritas_listar()`** (en seco). Predicción: sólo `Sin identificar`; en la copia del orden
   de las celdas de dato que escribió la corrida de las 17:01 (72) más las de la corrida cortada; en el
   real, las de las 123 filas que tenían `Sin identificar` vacío.
3. Si la lista está bien: **`paso18_malEscritas_vaciarCopia()`** y, cuando el usuario decida,
   **`paso18_malEscritas_vaciarReal()`**.
4. Recién ahí se puede volver a correr el upsert (en la copia) y seguir con el paso B.

### l) 02/10: alcance nuevo del sistema — PASO A (validar) hecho, PASO B (implementar) esperando

**Criterio del usuario (02/10): los errores del pasado no se corrigen.** Lo cargado en el destino
queda como está, aunque difiera. Las diferencias se cuentan, no se arreglan. Las reglas nuevas rigen
de acá en adelante.

**Alcance**: el sistema escribe, sólo en celdas vacías, `Inscriptos`, `Mail`, `Call Center`, `IVR`,
`RRSS`, `Difusión`, sexo, edades, `Sin identificar` y `Asistentes`, y pasa `STATUS` de `en agenda` a
`Realizada`. **B2 se elimina**: el sistema calcula al vuelo desde `B`. Antes de implementar, se valida.

**PASO A — `paso17_validarCuentas()`** (`diagnostico/09_validar_cuentas.js`). **Sólo lectura**: no
escribe en ninguna planilla (verificado en el test en Node, escenario [9]). En el log:

1. por cada fila con formulario resuelto (`RDV_UID` por su traza, o `escribiria` en el plan), las 14
   cuentas calculadas desde `B` —`Inscriptos`, los 5 canales con `MAPEO_CANALES` (RRSS = Facebook +
   Google + Programmatic; Difusión = Difusion + Otros), `Masculinos` y `Femeninos` escalados, las 5
   bandas y `Sin identificar`— contra el destino **donde el destino ya tiene el valor**: por columna
   exacto | ≤ 5% | más, cuántas tienen el destino vacío y cuántas `B` vacío, y las 10 peores;
2. contra **B2**, por la clave del formulario (nombre + la `Fecha_Fin` del `ID` de B2): por columna,
   "B = B2" (la fórmula da lo mismo), y dónde destino ≠ B: **destino = B2** (B cambió después), **B2
   = B** (el destino no vino de B2: carga a mano u otra fuente), los tres distintos, o sin B2;
3. filas con `Inscriptos` del destino ≠ el de `B`, y de ésas **las que tienen sexo o edades vacíos**:
   son las que la regla nueva ("el desagregado sólo si `Inscriptos` está vacío o es igual al de B")
   **dejaría sin desagregado** (lista de hasta 15);
4. **Asistentes desde RDV CONJUNTO** con el cruce del legado (`figura + barrio + fecha`): cuántas
   filas de RDV CONJUNTO encuentran fila en el destino, **cuáles no** (con la fila que tendría por
   figura + fecha, si la hay), cuántos `Asistentes` del destino están **vacíos y RDV CONJUNTO los
   tiene** (y de ésos cuántos pasarían de `en agenda` a `Realizada`), cuántos son iguales y cuántos
   **difieren** (sólo se cuentan). El legado pisaba si el número nuevo era mayor o igual; la regla
   nueva escribe sólo si está vacío;
5. qué NO dice: en las filas que cargó el legado, B y el destino coinciden **por construcción**; eso
   valida la fórmula, no que el número sea verdad.

También, sin apuro, la línea del log del plan: *"formularios en B: N | NO USAR n | gemelos descartados
n | candidatos n"*, y **la huella de B calculada sobre B crudo**, antes de cualquier descarte.

**Predicción, anotada antes de correr:** Inscriptos y canales **casi todos exactos** donde el destino
tiene dato —el legado los cargó con la misma fórmula—, con las diferencias concentradas en filas
cargadas a mano; sexo y edades exactos donde los escribió el legado; **contra B2, B = B2 casi siempre**
(si no, la fórmula no es la misma y hay que mirarlo antes del paso B); las filas sin barrio en el
destino **no cruzan** con RDV CONJUNTO por la clave del legado.

**PASO B — implementar, DESPUÉS de que el usuario vea el paso A** (no empezado):

1. `COLUMNAS_MANUALES = ['Barrio']`. Inscriptos, canales y Asistentes pasan a columnas del sistema:
   sólo celda vacía, nunca se pisa un valor. STATUS → `Realizada` sólo desde `en agenda` y con
   asistentes. El desagregado, sólo si `Inscriptos` está vacío o es igual al de B. Actualizar
   CLAUDE.md (decisión 8, `DIAG_PROCEDENCIA`, 3.4) y la regla 5 del handoff.
2. Color: `COLOR_SISTEMA = '#CFE2F3'` para toda escritura nueva; los controles reconocen `#CFE2F3` y el
   `#4F81BD` viejo. `pasoN_repintarAzulViejo()`: en seco cuenta por columna; con `DRY_RUN = false`
   repinta `#4F81BD` → `COLOR_SISTEMA` sin tocar valores. Lo corre el usuario.
3. Paso 16: "no puede subir" sólo para `Barrio`; para el resto, cuántas celdas escribió el sistema
   por columna en la corrida. Línea de base nueva por columna.
4. Prueba en la copia (la constante sigue en `'AAA NOBORRAR'`), con la predicción escrita antes: se
   completan Inscriptos y canales en las filas de la 800 en adelante y en las escritas con esas celdas
   vacías; se completan los Asistentes vacíos que RDV CONJUNTO tiene; 0 celdas con valor pisadas;
   invariante 0; todo lo nuevo en `#CFE2F3`.
5. Si da OK: `RDV_HOJA_DESTINO = 'RVD JM-CM - ES'`, push y clasp push. **"AAA NOBORRAR" queda como
   referencia, no se borra** (cambia 0.f.3). En el real: `paso1_columnasDeTraza` → upsert → paso 16,
   con la predicción escrita antes. Recién después, el activador cada hora.

**Pendientes que abre esta decisión:**

- **Las columnas de la agenda** (`Figura`, `Barrio`, `FECHA`, `HORA`, `Dirección`, `EVENTO`) quedan
  fuera del sistema: son otro proceso (Fase 8) y se encaran después.
- **Eliminar B2** (y `Sync B to B2.js`): el sistema ya calcula desde `B`. Después del paso B, cuando
  el paso A haya mostrado que B = B2.

### k) 02/10 18:02–18:14: la 309 deshecha, `form_clave`, y el ajuste de los gemelos

**Resultados** (sobre la copia, todavía con la regla de gemelos de 0.i):

- la **309** quedó deshecha y va a REVISAR por `formulario_gemelo`;
- **azules: 3.785 celdas de traza con valor, 0 sin azul.** Era **azul sobre azul** en la copia: el
  `RangeList` pinta bien. La regla es una sola en todas las corridas (0.i);
- el upsert **bloqueó bien** con el invariante roto: 0 filas escritas;
- `paso1_columnasDeTraza()` agregó `form_clave` (columna 47); el upsert la escribió en **752 filas** (16
  tandas, 17 s); paso 16: **0 incompletas, 0 traza sin azul, manuales 605**;
- quedaban **invariante 1 (697/709)** y **5 trazas ambiguas (134, 315, 697, 709, 768)**.

**El ajuste (regla 3, decisión del usuario):**

1. **Gemelos = mismo nombre normalizado Y cierres (`Fecha_Fin`) a `GEMELOS_MAX_DIAS` (7) días o
   menos** (encadenados). Mismo nombre con cierres más lejos son **reuniones distintas**: cada formulario
   va por su clave y el invariante no los junta. Caso: Macri *Encuentro Temático "Orden Público"/
   Seguridad - Eje Norte*, B 705 (16/07, 73) → fila 697 y B 729 (28/07, 753) → fila 709 (753 = 753 en la
   calibración). No era un error.
2. **Dentro de un grupo, el gemelo con ≤ 5 inscriptos sale de los candidatos aunque los cierres
   difieran** (antes hacía falta la misma clave): 134 (B 123, 2 ins, 18/08 | B 140, 72 ins, 21/08), 315
   (B 310, 0 | B 317, 49) y 768 (B 785, 0, 27/08 | B 790, 116, 02/09). Cada grupo queda con un solo
   formulario vivo, y la traza deja de ser ambigua.
3. **Dos gemelos con más de 5 inscriptos cada uno: `clave_repetida`**, ninguno solo (también si los
   cierres difieren, dentro de los 7 días).
4. **El paso 16, el bloque 0b y el invariante usan la misma definición** (`marcarGemelos_`). El bloque
   0b lista aparte los nombres repetidos con cierres a más de 7 días ("reuniones DISTINTAS").

La traza de una fila escrita sin `form_clave` se resuelve por el nombre: si el nombre tiene varios
grupos, el más cercano en fecha a la fila (empate entre grupos = ambiguo); dentro del grupo, el
formulario vivo. **Efecto a tener presente:** si la 315 (o la 134, o la 768) se había escrito con el
gemelo de casi cero, ahora su traza resuelve al otro, y la próxima corrida completa con los datos de
ése **sólo sus celdas vacías** (sexo y edades) y le estampa su `form_clave`. Nada se pisa.

Test en Node, escenario [8]: la 309/315 con el de 0 inscriptos, clave repetida con el mismo cierre y
a 3 días, la 134 (72 contra 2 a 3 días), la Macri "Orden Público" (dos reuniones), la 645, y lo que
quedó en la copia (invariante 1 detectado; corregida la 309: invariante 0, ambiguas 0, `form_clave` en
todas). Todo en verde.

**Predicción, anotada antes de correr** (un `upsertDestino()` y el paso 16 en la copia): **invariante
0, traza ambigua 0**, y `form_clave` estampada en las 5:

```
697 → B 705 (16/07)   709 → B 729 (28/07)   134 → B 140   315 → B 317   768 → B 790
```

más: incompletas 0, traza sin azul 0, manuales 605, 0 avisos "<<< HOY", la 309 en revisión. El bloque
0b: los grupos de gemelos con sus descartados (al menos los de la 134, la 315 y la 768) y la Macri en
"reuniones DISTINTAS".

### h) Punto 3: el paso 2 (14:35) y la escritura (14:50) dieron distinto

Total **755 | 42 | 13** en seco contra **758 | 39 | 13** en la escritura: las 3 filas de "Seguridad
en tu barrio" del 02/10/2025 (Landerreche, Piñeiro, Tapia) pasaron de `multi_figura` a escribiría.

**Lo que se puede afirmar leyendo el código:** los dos caminos calculan el plan con **la misma
función** (`calcularPlan_`); `enSeco` sólo decide si después se escribe. El plan no depende de la
hora salvo por el día (`_hoy_`, el mismo a las 14:35 y a las 14:50), ni de nada aleatorio. El test
[6] lo confirma: con las mismas entradas, seco y real dan los mismos números y el mismo plan. **Así
que entre las 14:35 y las 14:50 cambió una entrada.** Cuál, no se puede saber sin los datos de ese
momento. Las candidatas, sin medir:

1. **`B`**: es un `QUERY` sobre `IMPORTRANGE`, se recalcula solo, y los formularios entran a lo
   largo del día. Se ve comparando la primera línea de los dos logs: *"candidatos en B: N"*.
2. **El destino**: el equipo estaba trabajando en la solapa real. Dos ediciones alcanzan para
   cambiar esas tres filas: un **barrio** cargado (un formulario propio sin figura, por comuna, sólo
   compite si la fila tiene barrio —`SIN_FIGURA_POR_UBICACION`—, y entonces el desempate por
   evidencia le gana al `multi_figura`), o una **figura nueva** en la columna `Figura` (cambia qué
   apellidos son únicos, y con eso qué formulario cuenta como `multi_figura`). **Hipótesis.**

**Desde ahora queda medido**: cada plan loguea su huella de entradas y la deja en `REGISTRO_UPSERT`.
Si dos corridas dan distinto, la huella dice cuál de las cuatro entradas se movió.

**¿Alguna de esas 3 está entre las 123?** No se puede saber desde el repo. La escritura iba en
**orden de fila del destino**, así que las 123 son las primeras 123 filas a escribir de la planilla.
El paso 16 nuevo lo dice: lista las 123 con fila, figura y fecha, y marca `<<< HOY: …` las que el plan
de ahora no escribiría igual. Para mirar una: `paso12_explicarFila()` con su número de fila.

---

## 1. Lo primero, porque no está en git

**Nada de lo escrito en las últimas sesiones corrió todavía contra la planilla.** El código está
commiteado; el proyecto de Apps Script **no está actualizado**.

```
clasp show-file-status   # sólo appsscript.json, los .js de la raíz y diagnostico/ (ver .claspignore)
clasp push
```

El push **reemplaza el proyecto entero**: lo que está en `_archivo/` sale del scope global, que
es lo buscado. El único activador vivo (`syncAgendaSheetInBaseFromAgenda_2`) está en
`Solapa agenda base final.js`, que sí sube.

Y después, en el editor, abrir **[99_Correr.js](../99_Correr.js)** y correr en este orden:

| # | qué correr | llama a | qué hace | escribe? |
|---|---|---|---|---|
| 1 | `paso1_columnasDeTraza()` | `correrFase2b()` | agrega los encabezados de las 5 columnas de traza al final del destino | sí, sólo encabezados. **Ya corrió** (el destino tiene las cinco) |
| 2 | `paso2_upsertEnSeco()` | `correrEnSeco()` | el upsert completo en `DRY_RUN` | **no toca el destino**; escribe 3 solapas de reporte en la intermedia. Última: 30/09 14:19. **← PRÓXIMO (después de las 17)**: sin la guarda (t, eliminada), con la reubicación a revisión (v) y las opciones en los reportes (y) |
| 13 | `paso13_formulariosSinFila()` | `listarFormulariosSinFila()` | formularios sin fila: **canceladas o reubicadas**, informativo, en dos listas (decisión w, reglas 8 y 9) | **no escribe en ninguna planilla**; sólo log. **← después del 2** |
| 10 | `paso10_validarContraInscriptos()` | `medirValidacionInscriptos()` | calibración contra los inscriptos que hoy tiene el destino (decisión s), con la búsqueda inversa (u) y la medición de los formularios con `fecha_fin` | **no escribe en ninguna planilla**; sólo log. **No entra en ninguna decisión**. Última: 30/09 14:23. **← después del 13** |
| 11 | `paso11_desacuerdoUbicacion()` | `medirDesacuerdoUbicacion()` | reubicaciones: figura + fecha 0-1 con la ubicación en desacuerdo, y cuáles son sin ambigüedad (decisión v) | **no escribe en ninguna planilla**; sólo log. **← último** |
| 14 | `paso14_formulasDestino()` | `diagFormulasDestino()` | las once derivadas siguen siendo fórmula y muestran lo que dice `Comunas` (decisión x) | **no escribe en ninguna planilla**; sólo log |
| 12 | `paso12_explicarFormulario()` / `paso12_explicarFila()` | `explicarFormulario()` / `explicarFila()` | un caso, señal por señal; leen `CASO_A_EXPLICAR` (decisión w) | **no escribe en ninguna planilla**; sólo log. Cuando haga falta |
| 3 | `paso3_medirReglaDelMes()` | `diagCorteB()` | mide las `desfase_reprogramacion`: texto = `fecha_fin` y destino corrido 1-3 días | no toca el destino; escribe `DIAG_CORTE_B` |
| 6 | `paso6_medirFormulariosSinFigura()` | `medirFormulariosSinFigura()` | el tamaño de sacar la figura del denominador (decisión k) | sólo log. Corrió el 26/09 |
| 7 | `paso7_formulariosFaltantes()` | `diagFormulariosFaltantes()` | las filas sin formulario propio (decisión o) | sólo log. Corrió el 01/10 14:11: faltantes 2 \| 3 (antes 14 \| 16) |

Los pasos 8 y 9 ya corrieron y quedaron implementados (decisiones p y q); están en YA CORRIDOS
como `rehacer_medirVariantesSinFigura()` y `rehacer_medirDesempatePorEvidencia()`.

**Resultados del 30/09 14:19-14:23 (pasos 2 y 10), con el desempate por evidencia y el invariante
aplicados:**

| | resultado |
|---|---|
| paso 2 (ventana) | **277 \| 3 \| 25** — predicción 272-278 \| 2-8 \| ~24. Total: **746 \| 15 \| 44** |
| invariante | **11 choques resueltos en 3 vueltas; chequeo 0** → **deja de ser bloqueante** (decisión r) |
| desempate | 26 por señales, 9 por distancia, 2 por inscriptos. **La salvaguarda se acepta** (hoy no frenó ninguno) |
| `EMPAREJAR_MANUAL` | 19 pares en ventana, **1,7 por fila** |
| paso 10 (ventana) | **96,2% exacto (253 de 263)**, 2,7% ≤ 5%, **3 en "más"** (527, 748, 769) |
| desempates vs destino | **33 de 33** coinciden |
| choques vs destino | **8 de 9**. El que no: `RDV JM Velez Sarfield - 5/6` (33 ins), que no coincide con ninguna de sus dos filas (la 626 tiene 105) |

Del invariante: la **645** terminó en el `Temático Educación` (el destino tiene 498, sus
inscriptos); la **626** (Flores 04/06) perdió tres formularios en cascada y terminó en
`formulario_compartido`, que es lo correcto.

**Landerreche 03/09** con el `Comuna 1 Sur` de 116: **aceptado** (regla de negocio), atado a la
respuesta del equipo sobre la fila **769**.

### Resultados del 01/10 18:23 (`5f84cc1`) contra la predicción, y la regresión de la 801

Mismos datos que a las 18:04. Contra la predicción (284 → ≈ 285 | 9 → ≈ 18 | 16 → ≈ 7):

| (ventana \| total) | 18:23 |
|---|---|
| escribiría | **284 \| 753** |
| a revisar | **19 \| 43** — `multi_figura` 11 \| 22 · `ubicacion_en_desacuerdo` 5 \| 15 · `formulario_compartido` 3 \| 6 |
| sin match | **6 \| 13** — `sin_formulario_propio` 4 \| 6 · `score_bajo` 2 \| 7 |
| `sin_figura_por_ubicacion` | escribiría 15 \| 15 |
| paso 10 | exacto **261/268 (97,4%)** \| 674/730 (92,3%); desempates **35/35** \| 59/59; invariante **6/6**; `fecha_fin` **10 \| 27** confirmados, **0 negativos** |

- **✓ a revisar** y **✓ sin match**: las figuras por apellido mandaron a las LTP a revisión
  (`multi_figura`) y sacaron a las de Lombardi de `SIN_MATCH`;
- **✗ escribiría quedó en 284**: entró la 626 (ventana asimétrica ✓) y **salió la 801**.

**La regresión.** Fila 801, Gabino Tapia 24/09 Núñez. Su formulario propio, `VÍNCULO CIUDADANO -
Encuentro con vecinos sobre Seguridad - Comuna 13 - 24/9` (B 806, 0 días, score 1,0, 143 = 143 en
el paso 10), quedó empatado con `… comerciantes -Lombardi-Tapia-Piragine - Eje Norte - 22/9` (2
días, 1,0), que desde el 01/10 es `multi_figura` por apellido. El veto `multi_figura` se aplicaba
**antes** del desempate, y además el LTP —como "nombra la figura"— sacaba al de Seguridad (sin
figura) de la competencia. Resultado: REVISAR `multi_figura`, y el de Seguridad huérfano en el
paso 13 como "sin fila (posible cancelada)".

**Corregido (01/10 noche):** el veto se evalúa sobre el **ganador** del desempate por evidencia; un
`multi_figura` no saca de la competencia a un formulario sin figura. Si el multi_figura gana con
margen (la 716), sigue en revisión. Línea nueva en el paso 2: *"empates con un candidato
multi_figura: N | N — resueltos a favor de un formulario simple N | N, siguen en revisión N | N"*,
con la lista. **Probado en Node**: la 801 se escribe con el de Seguridad 24/9 (desempate por
distancia, 0 contra 2 días); la 716 sigue en revisión con LTP 29/7 como primera opción; una fila LTP
sola sigue en revisión.

**Predicción (ventana), antes de correr:** paso 2 → **escribiría 285, revisar 18, sin match 6**.
Paso 13 → **B fila 806** (Seguridad Comuna 13 24/9) sale de "sin fila"; **quedan 6** en ventana.
**`sin_figura_por_ubicacion` pasa de 15 | 15 a 16 | 16** (sólo la 801). Si sube más, es efecto del
cambio "un `multi_figura` no saca de carrera a otro formulario", y se revisa fila por fila.

**sin_formulario_propio subió de 2 a 4.** La línea de motivos del paso 2 ahora las lista una por
una y marca las que con la regla simétrica de antes (±3 para todos) tenían formulario propio —o
sea, las que antes eran `score_bajo`—. **Hipótesis, sin medir:** son las que cambió la ventana
asimétrica de `fecha_fin` (un cierre posterior a la reunión ya no cuenta como cercano). Lo dice la
próxima corrida.

**Paso 13 del 01/10 18:28:** las LTP salieron de "sin fila" ✓; "Primera Persona 12/8" marcada
**DUDOSO** ✓. Los casos nuevos para el equipo, en 1a.

### Resultados del 01/10 18:04–18:07 (`e921457`): línea base anterior

| | resultado | predicción |
|---|---|---|
| paso 2 (ventana) | **284 \| 9 \| 16** | 283-290 \| 10-16 \| 3-8 |
| invariante | **0** | 0 |
| decididas por el eje | **0** | 0 |
| `ubicacion_en_desacuerdo` | **6 \| 15** | ≈ 9 \| 27 |
| subzona de la Comuna 1 | **19 \| 32 pares coinciden** | 1/10 → Monserrat; 3/9 igual |
| paso 10 | **97,4% exacto** en ventana; desempates **35 de 35** | 769 fuera de "más" |
| paso 11 | sin ambigüedad **2 \| 4** | ≥ 5 en ventana |
| paso 13 | **Bereciartua `Comuna 6 - 29/7` como reemplazo** | ídem |
| `fecha_fin` (paso 10) | **100%** de las reuniones en o después del cierre; **p90 = +6** | — |

Lo que se apartó: **sin match 16** contra 3-8. La explicación está en la búsqueda inversa: **9
filas de la ventana** tienen su formulario a 0 días con los inscriptos exactos, pero el formulario
nombra a las figuras **sólo por apellido** (Lombardi-Tapia-Piragine) y el matcher no las reconocía
(punto 1 de abajo). Y **sin ambigüedad 2 | 4** quedó por debajo de lo previsto.

**Dos decisiones del usuario con esos números:**

- **las reubicaciones NO se escriben solas**: quedan en revisión con las opciones (decisión v);
- **la ventana asimétrica SÍ se implementa** para los formularios con fuente `fecha_fin` (decisión s).

**Predicciones para la próxima corrida (puntos 1 y 2), anotadas antes de correr** —paso 2 y paso
10, después de las 17—:

```
(ventana)            01/10 18:04     predicción
escribiría               284         ≈ 285       (+ la 626 por la ventana asimétrica; puede
                                                  sumar alguna más con fuente fecha_fin)
a revisar                  9         ≈ 18        (+ ≈ 9 multi_figura: los formularios de Lombardi
                                                  por apellido, como los históricos)
sin match                 16         ≈ 7
formularios con figura sólo por apellido (línea nueva del paso 2): los de Lombardi-Tapia-Piragine
  de la ventana (≈ 9) y del histórico; ninguno que no sea de una figura real
invariante                 0         0
```

- **paso 10**: el bloque de `fecha_fin` muestra la **626 como elegida** (`1 a 1 - Comuna 7`,
  105 = 105, +6 días), y la fila pasa a escribiría;
- **paso 13** (cuando se corra): las filas de Lombardi-Tapia-Piragine **salen de "sin fila"**;
  "Primera Persona 12/8 con Nicolás Vázquez" (425) sigue en "posible reemplazo" pero marcada
  **DUDOSO** (tiene más inscriptos que su "nuevo", `1 a 1 - 12/8 Parque Avellaneda`, 128).

La línea base anterior, 30/09 14:19: ventana **277 | 3 | 25**. La predicción con la guarda (≈ 267 |
13 | 25) no llegó a correrse (decisión t).

**Predicciones del 01/10 para `e921457`, anotadas antes de correr** (ya corridas: resultado arriba;
se dejan para comparar). Desde la línea base cambiaron cuatro cosas a la vez, así que son rangos y la confianza es
**baja** en el paso 2:

- `B` pasó a **825** formularios y la consulta de Lombardi se corrigió (paso 7: faltantes
  **14 → 2** en ventana): ≈ 12 filas que eran `sin_formulario_propio` ahora tienen formulario;
- la reubicación a revisión (v) saca de `SIN_MATCH` las filas con figura + fecha + comuna en
  desacuerdo: **≈ 9 | 27** (predicción del usuario);
- RDV se corrigió (Comuna 1 del 3/9) y la columna I quedó con **sólo los 18 ejes priorizados**
  (los 30 completados por comuna y los 12 `?` salieron);
- las **subzonas de la Comuna 1** deciden la ubicación (regla 10, decisión aa);
- se eliminó la guarda: la 748 vuelve a escribirse (113).

```
(ventana | total)   30/09 14:19        predicción próximo paso 2
escribiría          277 | 746          ≈ 283-290 | ≈ 755-765   (los formularios nuevos)
a revisar             3 |  15          ≈  10-16  | ≈  38-48    (≈ 9 | 27 ubicacion_en_desacuerdo)
sin match            25 |  44          ≈   3-8   | ≈   5-15
ubicacion_en_desacuerdo (motivo)       ≈ 9 | 27
decididas por el eje                   0         (menos barrios con eje: sólo los 18 priorizados)
subzona de la Comuna 1                 "Comuna 1 Sur - 1/10" → Monserrat (808); el 3/9 igual
                                       (Landerreche ← Sur, Tapia ← Norte)
2e                                     barrios con eje 18 | sin eje 30 | pendientes 0
invariante (bloque 0)                  0 formularios con 2+ filas
filas de hoy/ayer sin barrio           ≥ 2      (Retiro y Monserrat del 1/10, si siguen sin barrio)
```

- **paso 13**: en **posible reemplazo** al menos **Bereciartua `Comuna 6 - 29/7` (169)**; en **sin
  fila (posible cancelada)**, en ventana, ≈ 5: Mraida Comuna 3 20/7 y 22/7, Primera Persona 12/8,
  Sánchez Zinny San Cristóbal 8/4, Miguel Comuna 15 22/4 (si alguno resulta reemplazo, pasa de
  lista);
- **paso 10**: la 769 sale de la banda "más" (RDV corregido); la 748 también si RDV ya tiene 113.
  Banda "más" ≈ **1-2** (la 527). El bloque de `fecha_fin` lista la 626 (+6 días);
- **paso 11**: REVISAR por `ubicacion_en_desacuerdo` ≈ **9 | 27**; sin ambigüedad, al menos los 5
  de la ventana (587, 590, 592, 543, 716), y en ellos **inscriptos iguales al destino** (es como el
  equipo los describió).

Si el paso 2 se aleja mucho de los rangos, mirar antes de seguir.

La corrida del 26/09 17:44 (D-C y tope de 3): **241 | 39 | 24** en ventana, predicción 241 | 39 |
25; paso 10 del 26/09 17:51: 94,4% exacto (221 de 234), desempate 36 de 38.

La corrida del 26/09 16:45 (B con 807 formularios; 304 evaluables): 229 | 38 | 37 (score_bajo 23,
sin_formulario_propio 14).

La corrida anterior, del 26/09 14:21 (810 filas, ventana 310 / 304 evaluables): 223 | 30 | 51,
con las 51 = 25 sin formulario propio cerca + 18 con un formulario cercano sin figura (13 de la
serie de Seguridad) + 8 con su figura pero bajo el umbral.

Las anteriores, para la historia (totales, salvo donde dice ventana):

```
                  25/09 18:13   26/09 11:36
escribiría (total)       627          641
a revisar  (total)        68           85
sin match  (total)       107           76
2f figura_no_reconocida (ventana)   103 (37,3%)   92 (32,7%)
densidad EMPAREJAR_MANUAL           4,9           7,0
"ninguno a ±3" del 2b (ventana)      15            23
```

> ⚠️ **El 2f no cuenta filas que fallan**, y su categoría estaba mal rotulada. Cuenta filas cuyo
> formulario de comuna más cercano no fue el que ganó; muchas se escriben igual con otro. Y
> `figura_no_reconocida` era en realidad *"el formulario no nombra la figura de la fila"*.
> **Medido el 26/09 16:45 (ventana): `otra_figura` 73, `sin_figura` 16, `posible_grafia` 0**: el
> 32,7% era otra figura —otras reuniones de la misma comuna—, no una falla de reconocimiento
> (decisión l).

Las ventanas del log ya no son comparables con las de antes del 26/09 si no se corrigen por el
corte: la del 25/09 usaba 25/03 (base 307).

Ya corridos, en el bloque YA CORRIDOS de `99_Correr.js`: `rehacer_medirFiguraEnPrefijo()` (el
viejo paso 4, decisión i) y `rehacer_verificarLegToDate()` (el viejo paso 5, decisión j).

Si en el paso 2 falla la escritura de un reporte: `paso2_rehacer_revisarMatch()`,
`paso2_rehacer_emparejarManual()` o `paso2_rehacer_sinMatch()`, que rehacen sólo ése.

**`DRY_RUN = false` en [20_UpsertDestino.js](../20_UpsertDestino.js) desde el 02/10** (decisión del
usuario, con el backup hecho; ver 1b). `upsertDestino()` escribe; los `pasoN_` no.

> ✅ **Ya no es bloqueante: el invariante "un formulario, una fila".** El paso 2 del 30/09 14:19
> resolvió 11 choques en 3 vueltas y el chequeo del bloque 0 dio **0**. Se sigue chequeando en cada
> corrida; si algún día no da 0, el log lo dice en mayúsculas. Ver decisión r). Lo que falta para
> `DRY_RUN = false` está en la lista de abajo (1b).

> El pipeline legado está **frenado a propósito**: un solo activador vivo,
> `syncAgendaSheetInBaseFromAgenda_2`. Ver el recuadro de la sección 2 de `CLAUDE.md`. No
> encender nada sin leerlo.

---

## 1a. Consultas al equipo (al 01/10 noche)

**Para el equipo (03/10): ¿qué es el canal "Otros" de `B` y dónde va?**

Análisis del usuario (02/10) sobre las 752 filas con formulario: sin Otros en `B`, RRSS/Difusión
coinciden en **468**; Otros sumado a **Difusión** (el legado) **104**; Otros sumado a **RRSS** **109**;
ninguna de las dos (otra carga a mano) **61**; vacíos **10**. **No hay regla consistente**: hasta
09/2025 iba siempre a Difusión (era el legado); desde 10/2025 es un hábito de carga —Landerreche,
Piñeiro, Giménez, Tapia y Quintana: 101 a RRSS y 22 a Difusión; Macri, Sánchez Zinny, Mraida, Sabor y
el resto: 8 a RRSS y 47 a Difusión—, con excepciones en los dos grupos en las mismas fechas (p. ej.
30/04/2026, fila 802).

**Decisión mientras tanto: `MAPEO_CANALES` no cambia (Otros → Difusión, como el legado).** El sistema
escribe sólo en celdas vacías, así que no pisa lo que cargue el equipo. **Si el equipo define otra cosa,
se cambia sólo `MAPEO_CANALES`** (`00_Config.js`) y nada más.

**Para el equipo (del paso 13 del 01/10 18:28):**

- **Flores 29/1** contra **CCV Versalles 29/1**: marcado **DUDOSO**; probablemente dos reuniones.
- **1 a 1 Villa Riachuelo 11/8** contra **Parque Avellaneda 12/8**: posible reubicación.
- **Mraida Comuna 3 20/7 y 22/7**: sin fila, los dos con más de 100 inscriptos.
- ~~**Ejes**: el paso 2 cuenta 19 barrios con eje y se esperaban 18~~ → **CERRADA (01/10)**: el
  equipo confirmó la lista y ya está pegada en `Comunas` columna I. **18 barrios con eje:**

  | eje | barrios |
  |---|---|
  | Centro | Balvanera, Caballito |
  | Norte | Belgrano, Núñez, Palermo, Recoleta, Retiro, Villa Urquiza |
  | Oeste | Chacarita, La Paternal, Parque Chacabuco, Villa Devoto |
  | Sur | Barracas, Boedo, Flores, La Boca, Parque Patricios |
  | Este | San Nicolás |

  Contra la provisoria de 19 (Centro: Balvanera, Caballito, Almagro, Boedo · Este: San Nicolás ·
  Norte: Villa Urquiza, Belgrano, Recoleta, Palermo, Retiro, Núñez · Oeste: Parque Chacabuco, Villa
  Ortúzar, Chacarita, La Boca · Sur: Parque Patricios, Constitución, Barracas, Floresta): salen
  Almagro, Constitución, Floresta y Villa Ortúzar; entran Flores, La Paternal y Villa Devoto; La
  Boca pasa de Oeste a Sur; Boedo de Centro a Sur (el equipo puso "Sur | Centro"; quedó "Sur").
  En el código (01/10): la celda se lee recortada ("Sur " → "Sur") y con **varios ejes separados
  por `|`** coincide cualquiera, por si el equipo vuelve a poner Boedo con los dos.

**Cerradas el 01/10:**

| caso | respuesta | qué cambia |
|---|---|---|
| **748** (Tapia Villa Real 20/08, destino 6) | **RDV tenía el error; vale 113** | el matcher ya elige el de 113, y el sistema escribe 113. La guarda que la frenaba se eliminó (t) |
| **Comuna 1 del 3/9** (769 Tapia Retiro) | **RDV corregido** | la 769 sale de la banda "más" del paso 10. **Landerreche 768**: el match con `Comuna 1 Sur - 3/9` es correcto |
| **Bereciartua 29/7** | **reunión reubicada** | la fila **714** (Flores) se escribe con `Comuna 7 - 29/7` (185); `Comuna 6 - 29/7` (169) es el **formulario viejo** de la misma reunión. No era un typo ni un faltante |
| **(5)** comuna del formulario ≠ barrio de RDV (587, 590, 592, 543, 716 + 380, 393, 425, 443, 468, 247) | **reuniones reubicadas que no se actualizaron de un lado** | **regla 8 confirmada** (CLAUDE.md 1). El dato vigente es el barrio de RDV. Implementado: van a revisión, nunca se escriben solos (v). La medición "sin ambigüedad" sigue en pie para decidir cuáles se escribirían solos |
| **(4)** formularios con inscriptos sin fila en RDV | **probablemente reuniones canceladas** (o reubicadas) | **regla 9**: no es un faltante a reclamar. El paso 13 pasa a "formularios sin fila: canceladas o reubicadas", informativo (w) |
| **(7)** ejes dudosos | **son ejes PRIORIZADOS: sólo 18 barrios tienen eje** | los otros 30 no pertenecen a ningún eje: celda **vacía** (= no pertenece, no pendiente). El usuario corrigió la columna I: sacó los 30 completados por comuna y los 12 `?`. **No hay pendientes**; el `?` queda sólo como posibilidad (g). ~~Los 12 propuestos quedan definitivos~~ (corregido el mismo 01/10) |
| subzonas de la **Comuna 1** | **Norte = Puerto Madero, Retiro, San Nicolás; Sur = Constitución, Monserrat, San Telmo** | no son ejes; deciden la ubicación de los formularios "Comuna 1 Norte/Sur" (regla 10, decisión aa) |
| **Lombardi 2026** | **consulta de `Hoja1` corregida** | **verificado** con el paso 7 (01/10 14:11, `B` con 825 formularios): faltantes **14 \| 16 → 2 \| 3** (decisión o) |

Los 2 faltantes que quedan en ventana —**Sánchez Zinny 19/06 Caballito** y **Muzzio 28/08
Recoleta**— tienen el formulario de su figura tomado por otra fila, a 7 y 14 días: posibles
reubicaciones o filas duplicadas en RDV, no faltantes de la consulta. Quedan anotados; con la regla
9 no hay consulta abierta por ellos.

~~**Regla operativa (01/10): el match del día corre después de las 17.**~~ **Reemplazada el 02/10**:
el activador corre **cada 1 hora**, y lo que protege a las filas del día es **`pendiente_barrio`**
(una fila de hoy o de ayer sin barrio en RDV no se escribe y se reevalúa en la corrida siguiente;
ver 1b). Los formularios se cierran y los barrios de RDV se cargan a lo largo del día. `Comuna 1 Sur
- 1/10` (125) calzaba con dos filas del 1/10 (Retiro y Monserrat): con los barrios cargados, la
**subzona** (regla 10) la manda a **Monserrat (808)** —Sur— y deja a Retiro en desacuerdo.

---

## 1b. Lista para pasar a `DRY_RUN = false`

**`DRY_RUN` lo cambia el usuario, no el código ni Claude.** Esto es la lista de lo que tiene que
estar en verde antes, y el orden de la primera escritura real. Nada de esto está hecho todavía.

### 02/10 12:4x: `DRY_RUN = false` (decisión del usuario)

**`DRY_RUN` pasó a `false` el 02/10** (commit de este cambio), con:

- **Backup** (docs/backup.md §8.1):
  <https://docs.google.com/spreadsheets/d/1QLDcmTb01LC_pw4DRXBqIWOEcutvOBeOkVwvQd4OGEY/edit?gid=705217578#gid=705217578>
- **Línea de base de azules** (`paso16_verificarEscritura()` del 02/10 12:44, **OK**): **605** en las
  `COLUMNAS_MANUALES`, **5749** en todo el destino. Anotada en `00_Config.js`
  (`LINEA_BASE_AZULES`, por solapa desde el 02/10).
- **Paso 10 con B ordenado** (02/10 12:43): candidatos **825** (3 `NO USAR`); exacto **262/269 =
  97,4%**; desempates **36/36**; invariante **6/6**. Los inscriptos siguen alineados con su
  formulario: el orden de `B` no cambió las elecciones.
- **`B`** quedó como **una sola fórmula en `A1`** (`QUERY(IMPORTRANGE(…"Hoja1!A1:AC"), "select *
  where Col2 is not null order by Col2", 1)`): reemplaza a los dos IMPORTRANGE y a las columnas
  manuales S, T, U (CLAUDE.md 1 y 3.3).

**Lo que falta, en este orden:**

> **02/10 14:50: el punto 1 corrió y se cortó a los 6 minutos con 123 filas escritas.** La escritura
> se rehízo en lote y se prueba sobre la copia "AAA NOBORRAR": ver la **sección 0**. Los puntos de
> abajo se retoman sobre la solapa real con la lista de 0.f.

1. **`upsertDestino()`**, a mano, **una vez** (`20_UpsertDestino.js`). Qué escribe: más abajo, en
   "El pase a `DRY_RUN = false`".
2. **`paso16_verificarEscritura()`** hasta que dé **OK**: invariante 0 en el destino, el paso 14
   `CONFIRMADO`, azules de las columnas manuales **≤ 605**, todas las filas con `RDV_UID` con
   `form_origen`. Si algo falla: docs/backup.md §8.2.
3. El activador (cada hora) se instala después, si el usuario lo decide.

**Nota:** el paso 2 con `B` ordenado no se reportó en este pase; el paso 10 sí, y dio las mismas
elecciones. La predicción del paso 2 (mismos números que con `B` sin ordenar, salvo la 811 y las
`pendiente_barrio`) queda para la próxima corrida en seco.

**Pendiente para después del pase, sin apuro:** la decisión 1 de CLAUDE.md, leer el origen por ID
(`openById`) y no por la solapa `B`.

### Resultados del 02/10 10:56 (`5ecaa4a`): línea base de la corrida en seco

Ventana **285 | 18 | 7** contra la predicción **285 | 18 | 6**. La diferencia es la **fila 811**
(Quirós, Villa Devoto, 02/10): la reunión de hoy, con el formulario todavía sin importar. **La 801 se
escribe** ✓; empates con `multi_figura` resueltos a favor de un formulario simple **4** (664, 694,
762, 801); `sin_figura_por_ubicacion` **16 | 16** ✓; ejes **18 / 30** ✓; "perderían por el eje"
**1 | 1** ✓; invariante **0** ✓.

### 02/10: B ordenado, activador cada hora, `pendiente_barrio`, y el pase a `DRY_RUN = false`

**B va a quedar ordenado por `fecha_fin`** (SORT sobre el IMPORTRANGE): los formularios cambian de
fila. Revisado qué dependía de la posición en B (CLAUDE.md, decisión 3):

| | ¿dependía? | cómo quedó |
|---|---|---|
| `RDV_UID` y columnas de traza | no se guardan por fila de B. **Pero** una fila con `RDV_UID` no volvía a encontrar su formulario y lo dejaba libre para otra fila en la corrida siguiente | se encuentra por la traza (`form_origen` + fecha más cercana, `formularioDeTraza_`) y queda reservado; el chequeo del invariante cuenta esas filas |
| `elegido` de EMPAREJAR_MANUAL | todavía no se lee | cuando se lea, por `op{n}_formulario` (Nombre), nunca por `op{n}_fila_B` |
| desempate entre empates exactos | **sí**: "a igual score, el primero visto" = orden de B | formularios ordenados por **clave estable** antes de evaluar (`ordenarFormularios_`) |
| invariante | dentro de una corrida, consistente (B no cambia en medio) | igual; entre corridas, ver la primera fila |

**La clave estable del formulario es `claveFormulario_`: `normalizeText_(Nombre) | AAAAMMDD(Fecha_Fin)`**
(decisión 3 de CLAUDE.md), con inscriptos y fila sólo para desempatar formularios
indistinguibles. **Probado en Node:** con B invertido y renumerado, el plan da **cero diferencias**.

**El activador corre cada 1 hora**, no a las 18:00 (preparado, **no instalado**: `99_Pipeline.js`):

- sin la restricción de "no antes de las 17";
- **regla nueva `pendiente_barrio`** (`PENDIENTE_BARRIO_RECIENTE`): una fila de **hoy o de ayer sin
  barrio** que se escribiría o iría a revisión **no se escribe**; veredicto propio, se reevalúa en
  la corrida siguiente, no entra a los reportes ni a EMPAREJAR. Una fila sin match sigue como hoy;
- **`LockService`**: dos corridas no se pisan (la segunda no hace nada y lo loguea);
- **`REGISTRO_UPSERT`** (intermedia): una línea por corrida con hora, modo, filas y celdas
  escritas, uids, escribiría, pendientes, a revisar y sin match `[ventana | total]`.

**Predicciones para la próxima corrida, anotadas antes de correr (02/10):**

- **con B ordenado, el paso 2 da exactamente los mismos números que con B sin ordenar** (por
  construcción: el resultado ya no depende del orden);
- contra las 10:56 (285 | 18 | 7) puede moverse por dos cosas, y sólo por ésas: la **811** pasa a
  escribiría si ya llegó su formulario, y las filas de hoy o de ayer **sin barrio** que se
  escribirían o irían a revisión pasan a **`pendiente_barrio`** (línea nueva en el paso 2, y la
  línea fija de "filas de hoy o de ayer sin barrio" dice cuáles).

**El pase a `DRY_RUN = false` (punto 3):** ~~no hecho, faltaba el link del backup~~ **hecho el
02/10** (arriba, con el link).

- **Qué se corre para la primera escritura:** `upsertDestino()` (en `20_UpsertDestino.js`), **a
  mano, una vez**, con `DRY_RUN = false`. No hay wrapper `pasoN_` a propósito: es la única función
  que escribe en el destino.
- **Qué escribe:** en el destino, por `setSiDelSistema_` (sólo celdas **vacías**, pintadas
  `#4F81BD`), en las filas con veredicto `escribiria` y en las que ya tienen `RDV_UID`: sexo y
  edades (`Masculinos`, `Femeninos`, `18-24` … `66+`, `Sin identificar`), `RDV_UID` y la traza
  (`form_origen`, `form_score`, `form_nivel`, `form_fecha_match`); y `STATUS REUNIÓN` `en agenda` →
  `Realizada` donde hay asistentes (`marcarRealizada_`, la única excepción). **Nunca** las
  `COLUMNAS_MANUALES` ni las derivadas. Las filas a revisar, sin match o `pendiente_barrio` no se
  tocan. En la intermedia: los tres reportes y una línea en `REGISTRO_UPSERT`.
- **Verificación después de escribir: `paso16_verificarEscritura()`** (`diagnostico/08`): invariante
  en el destino (ningún formulario en 2+ filas con `RDV_UID`), el paso 14, los azules de las
  `COLUMNAS_MANUALES` contra la línea de base (no pueden subir) y las filas con `RDV_UID` (todas con
  `form_origen`). **Correrlo también ANTES de escribir** y anotar los dos totales de azules en
  `00_Config.js` (`LINEA_BASE_AZULES`, por solapa desde el 02/10): es la línea de base.

**Lo que queda antes de la primera escritura real (al 02/10):**

1. **Paso 2 con B ordenado y las reglas nuevas** (pendiente_barrio), contra la predicción de arriba.
2. **Backup** según [docs/backup.md](backup.md) §8 (el mismo día, justo antes), con el **link** en
   ESTADO.
3. **Línea de base de azules**: `paso16_verificarEscritura()` antes de escribir; los dos totales a
   `00_Config.js`.
4. **Invariante en 0** en el bloque 0 del paso 2.
5. **El usuario revisa `REVISAR_MATCH` con las opciones** (`paso15_resumenParaRevisar()`).
6. Con el link: `DRY_RUN = false`, push y clasp push; `upsertDestino()` una vez;
   `paso16_verificarEscritura()` hasta que dé OK. El activador (cada hora) se instala después, si
   el usuario lo decide.

Predicciones del 01/10 noche (corridas el 02/10 10:56; resultado arriba):

*Para comparar:* —con el veto
`multi_figura` sobre el ganador y los 18 ejes confirmados—:

| paso | predicción (ventana) |
|---|---|
| 2 | **285 \| 18 \| 6**; `sin_figura_por_ubicacion` **16 \| 16**; ejes **18 / 30**; "perderían a su ganador por el eje" **1 \| 1** (la 613); decididas por el eje **0** |
| 10 | desempates **36 / 36** |
| 13 | la fila **806** de B sale de "sin fila"; **quedan 6** en la ventana |

El detalle, como lista de chequeo:

**Antes (todo en verde, o no se pasa):**

- [ ] **Puntos 1 y 2 del 01/10 verificados** con el paso 2 y el paso 10 (arriba).
- [ ] **`REVISAR_MATCH` revisada por el usuario**, con las opciones y sus puntajes.
- [ ] **Backup completo** según [docs/backup.md](backup.md): copias de (1), (2) y (4) con fecha;
      el **texto** de las once fórmulas en `docs/formulas-legado.md`; foto de `Comunas` **A:I**
      (ahora incluye la columna I del eje); los números de control; el conteo de `#4F81BD` de hoy.
- [ ] **`clasp push` desde Rdv** y `clasp show-file-status` sin diferencias con el commit.
- [ ] **Activadores**: sigue habiendo uno solo vivo (`syncAgendaSheetInBaseFromAgenda_2`), y
      ninguno apunta a `upsertDestino` ([docs/triggers-legado.md](triggers-legado.md)).
- [ ] **`paso14_formulasDestino()`** da `CONFIRMADO`: las once derivadas conservan su fórmula y
      muestran lo que dice `Comunas`.
- [ ] **Invariante en 0**: el bloque 0 del paso 2 dice 0 formularios con 2+ filas escritas.
- [ ] **El paso 2 cerca de la predicción** (arriba).
- [ ] **El paso 10 revisado**: la banda "más" y la búsqueda inversa miradas caso por caso.
      **Ya no hay guarda**: lo que el paso 10 marque como dudoso y se escriba, se escribe.
- [ ] **Las `ubicacion_en_desacuerdo` vistas**: no se escriben solas; quedan en revisión.
- [ ] **El grep del invariante**: `grep -rn "setValue\|setValues" 20_UpsertDestino.js` da sólo
      `escribirHoja_` (intermedia).
- [ ] **Después de las 17**, por la regla operativa (1a).

**La primera escritura, en este orden:**

1. El usuario pone `DRY_RUN = false` en `20_UpsertDestino.js`; `clasp push`.
2. En el editor, **a mano y después de las 17**, `upsertDestino()` **una sola vez**. El log dice
   cuántas celdas y cuántos `RDV_UID` escribió.
3. Sugerido: volver a `DRY_RUN = true` y `clasp push` hasta terminar la verificación.
4. Verificar:
   - `paso14_formulasDestino()` sigue dando `CONFIRMADO` (ninguna derivada se rompió);
   - `rehacer_diagProcedencia()`: los `#4F81BD` de las `COLUMNAS_MANUALES` **no subieron** (el
     upsert no las escribe nunca);
   - `paso2_upsertEnSeco()`: las que se escribieron ahora entran **por `RDV_UID`**, y el resto
     queda igual.

**A saber antes de la primera escritura:** una fila que **no** se escribe no se toca —ni
`RDV_UID`, ni datos, ni traza— (decisión z). Su motivo y su mejor candidato están en
`REVISAR_MATCH` / `SIN_MATCH`, que se recalculan en cada corrida. La traza del destino es sólo de
las filas escritas.

---

## 2. Qué hay que mirar de esa corrida, y qué decide cada número

Son varias decisiones pendientes, todas esperando el mismo log. **Ninguna se toma sin el número
delante**; están descritas en `CLAUDE.md` con su razonamiento completo.

### a) ¿El umbral 0,88 sigue valiendo?

Bloque **`barrido de umbral`** del log. El 0,88 salió del valle de la distribución **histórica**,
que mezcla el formulario viejo con el de ahora. `_logValle_()` recalcula la meseta **sobre la
ventana de 6 meses** y dice una de tres cosas:

- cae adentro → no tocar nada;
- cae afuera → el log propone el medio de la meseta medida. Cambiar `UMBRAL_MATCH` en
  [00_Config.js](../00_Config.js) **y anotar el número al lado**;
- el barrido no calibra → la población está toda de un lado. No inventar un corte.

### b) ~~¿Se enciende `EVENTO_COMO_UBICACION`?~~ CERRADA: no

El bloque 2d dio que `EVENTO` coincide con **718 de 802** filas (`Encuentro con Vecinos`): es una
categoría, no un identificador. Queda en `false` y **se sacó de la puerta de
`EMPAREJAR_MANUAL`**, donde había subido la densidad de 2,6 a 8,2 pares por fila.

### c) ~~¿La regla del mes resolvió las `fecha_mal_parseada`?~~ Reinterpretada

Resolvió **0 de 20**, y no porque fallara: **no eran de mes**. Texto y `fecha_fin` coinciden y el
destino está corrido 1-3 días — **desfase por reprogramación**. Se renombraron
`desfase_reprogramacion` y el arreglo fue la escala: hasta ±3 días puntúa como coincidencia plena
(`TOLERANCIA_REPROGRAMACION_DIAS`). `diagCorteB()` ahora lo mide: "texto y fecha_fin caen el
mismo día" y "el destino está corrido 1-3 días". Lo esperable son casi todas en las dos.

En el upsert, la línea *"de las que escribiría, a 1-3 días"* del bloque 1 dice cuántas entran
gracias a la tolerancia.

### d) ¿Qué es el "lejos" del grupo bajo?

Bloque **2b**, *"desvío REAL del mejor candidato"* y *"¿había algún formulario a ±3 días?"*. La
corrida anterior dio ±1: 0, ±3: 8, **lejos: 50**; si el desfase típico es de 1 a 3 días, esas 50
no son reprogramación. Tres poblaciones:

- **con su figura reconocida** → el problema no es la fecha: mirar ubicación u hora;
- **sin ninguna figura reconocida** → probable: el formulario es el suyo pero `figurasEnTexto_`
  no encontró el nombre, y uno lejano que sí lo nombra le ganó. El log lista los casos;
- **ninguno** → el formulario no está en `B` con esa fecha. Otra población, otro arreglo.

### e) ¿Por qué no entran las de comuna coincidente?

Bloque **2f**. Las 65 `deberia_haber_entrado` son las de comuna, y **en `diagCorteB()` esa
categoría ya implica fecha exacta** —así que la fecha no es la sospechosa principal. El bloque
toma el formulario de la misma comuna más cercano en fecha y dice por qué no entró. ~~Si domina
`figura_no_reconocida_en_el_formulario`, el arreglo es cómo `figurasEnTexto_` reconoce nombres.~~
Corregido: esa categoría era mayormente **otra figura**, no reconocimiento (decisión l). El
reconocimiento sólo explica lo que caiga en `posible_grafia`.

### f) Huérfanos y densidad de `EMPAREJAR_MANUAL`

Bloque **3**. La puerta es `figura Y (fecha±21 O comuna)` —sin evento—. La **densidad** tiene
que volver a 2-4 pares por fila (con el evento había subido a 8,2). Si pasa de 5 el log avisa.

### g) ¿Se enciende `EJE_COMO_UBICACION`? — ahora con el mapeo del equipo

~~¿La `Zona` de `Comunas` es el eje?~~ No lo era (25/09: sin `Oeste`, descartaba el 82,5% de los
pares de la ventana). **Desde el 29/09 el mapeo está en `Comunas`, columna I, `Eje geográfico`**:
18 barrios los definió el equipo, 30 se completaron por comuna, y **12 están pendientes**, con el
valor terminado en `?` (Villa Crespo; la Comuna 10 entera; Liniers; Monserrat, San Telmo, Puerto
Madero y Constitución). La columna H (`Zona`) no se usa para el eje.

**Convención del `?`:** pendiente = eje no evaluable (no puntúa ni descalifica). Cuando el equipo
confirma un barrio, borra el `?` en la celda y el código lo toma solo, sin tocar el repo.

Bloque **2e** del paso 2:

- **a)** el encabezado de la columna I (si no dice `Eje geográfico`, el eje no se evalúa y lo
  avisa), los barrios de cada eje, y los pendientes aparte;
- **b)** los pares formulario con eje × fila del destino: coincide / **descartaría** / no
  evaluable, con el 82,5% del 25/09 al lado para comparar, y **una línea aparte para los
  pendientes** —"coincidiría N / descartaría M"— para que el equipo sepa qué está confirmando;
- la lista de los **"descartaría" a 0-3 días**, ventana primero: son los que más importan,
  porque descartar ahí es perder un match correcto.

~~`EJE_COMO_UBICACION` sigue en `false`. Se enciende si el descarte baja mucho respecto del 82,5%
y la lista de 0-3 días no tiene matches correctos.~~

**🔴 CERRADA (30/09): `EJE_COMO_UBICACION = false` es una DECISIÓN, no un pendiente.** El 2e del
29/09 13:08, con la columna I, dio "descartaría 66,4%" (antes 82,5%), pero ese porcentaje cuenta
todos los pares figura + fecha ±21, que en su mayoría no son la reunión correcta. Mirando cada
temático contra su fila a 0-1 días, **el eje descartaría matches CORRECTOS**:

- fila **645** (Macri 16/06 Almagro, eje Centro) ← `Temático Educación - Eje Oeste`: el destino
  tiene 498, los inscriptos de ese temático (paso 10);
- fila **613** (Macri 28/05 Balvanera, eje Centro) ← `Ciudad Atractiva 28/5 - Eje Este`;
- fila **665** (Macri 25/06 Monserrat, `Este?`) ← `Ciudad Atractiva / Cultura - Eje Sur`, si se
  confirmara.

**Hipótesis:** la tabla del equipo es de sedes donde se hacen los temáticos de cada eje, no una
partición barrio → eje (tiene barrios repetidos). Y el desempate por evidencia ya resuelve los
casos que el eje venía a resolver.

La columna I y la convención del `?` **se quedan**. El 2e ahora mide primero **cuántas filas
perderían a su ganador actual (o el del desempate) por el eje**, con los casos —la única cifra que
dice si el eje hace daño—; el % de pares queda como dato secundario.

**El eje queda SÓLO como último desempate (30/09, `EJE_COMO_DESEMPATE = true`).** Cuarto criterio
de `_desempatePorEvidencia_`, después de señales, distancia e inscriptos del formulario: gana el
contendiente cuyo eje coincide con el del barrio de la fila, **sólo si exactamente uno coincide**.
Eje distinto, vacío o `?` = neutro. **Nunca entra al score ni al margen, y nunca descalifica.**
Respeta la salvaguarda del desempate (umbral propio, no `multi_figura`). Traza:
`+desempate_por_eje`. El paso 2 tiene una línea fija con cuántas filas decidió: **se espera 0**
(los tres criterios anteriores ya resuelven todo lo que se vio). Si da más de 0, mirar esas filas
con `paso12_explicarFila()` antes de confiar.

**Ejes PRIORIZADOS (01/10, dato del equipo):** sólo **18 barrios tienen eje**, los que definió el
equipo. Los otros 30 **no pertenecen a ningún eje**: la celda va **vacía**, y vacío = "no
pertenece", no "pendiente". **No se completa por comuna** —lo habíamos hecho y era un error— y **no
hay pendientes**: el usuario sacó de la columna I los 30 completados y los 12 `?`. La convención
del `?` queda sólo como posibilidad. El eje sigue siendo **sólo último desempate**. El 2e dice
"barrios con eje 18 | sin eje 30". (Lo que se anotó un rato antes —"los 12 quedan definitivos"—
quedó corregido.)

### h) ¿Los formularios temáticos tienen alguna reunión cerca?

Bloque **2e**, punto c). Para cada formulario temático, si hay **alguna** fila de su figura a
±3 días. Los que no tienen ninguna se listan uno por uno: **son huérfanos reales**, y ningún
peso de ubicación los salva. El caso a mirar primero es **B fila 730** (Eje Sur, 14/08), cuyos
cuatro candidatos están a 7, 7, 11 y 13 días.

### i) ~~¿`limpiarPrefijos_` se saca, se acota o se conserva?~~ CERRADA: sale de la figura

`rehacer_medirFiguraEnPrefijo()` corrió el **25/09 20:18** (280 formularios en ventana / 776
vivos), comparando las figuras con y sin la limpieza:

```
EVITA multi_figura   0 |  0     ← el único beneficio posible (por construcción)
sigue multi_figura   0 |  0
PIERDE la figura    18 | 41     ← una sola forma: Jorge Macri → ninguna
otro                 0 |  0
```

**El beneficio para la figura es cero, también en el histórico.** `figurasEnTexto_` pasó a buscar
sobre el texto completo, como el legado.

- **No se tocó** `limpiarPrefijos_` en los demás usos: `leerCandidatos_` sigue detectando barrio,
  comuna, eje, temática, hora y fecha sobre el texto limpio, y `diagScores()` la usa para la
  fecha. Ahí **sigue siendo una hipótesis sin medir**.
- **Corregido respecto de la versión anterior:** se había anotado como hipótesis que `PIERDE`
  explicaría "buena parte del 37,3%" del 2f. **18 formularios difícilmente explican 103 filas**
  —y además el 37,3% nunca fueron "filas que fallan" (decisión l). El 26/09, con el cambio, el
  2f bajó de 103 a 92 en ventana.
  Cuánto aportan lo dirá el paso 2 (comparar contra la línea base de la sección 1); **el resto no
  tiene causa medida**, y las variantes de grafía son candidata, sin medir.

### j) ~~¿La copia de `legToDate_` que gana afecta al activador de Agenda?~~ CERRADA: no, hoy no

`rehacer_verificarLegToDate()` corrió el **25/09 23:26**:

- gana una copia **día primero** (A2/Upset): `'03/04/2026'` → `03/04`, el `Date` de las 15:30 →
  `12:00`;
- a la línea 72 **no le llega ningún `string`**: `Fecha (manual)` está vacía en las 5 filas, y lo
  que llega son 4 `Date` de `Fecha (auto)`. Con `Date` las tres copias dan el mismo día.

El pendiente queda **latente** en CLAUDE.md: hace falta que un push cambie el orden de carga y
gane la copia de B2 **y** que alguien tipee una fecha como texto. El arreglo (las tres copias día
primero) va, a más tardar, en la Fase 9. Rehacer la medición si cambia el orden de los archivos
o si empieza a cargarse `Fecha (manual)`.

### k) ¿Cuánto movería sacar la figura del denominador para los formularios sin figura?

Log de **`paso6_medirFormulariosSinFigura()`**. El formato de 09/2026 —`VÍNCULO CIUDADANO -
Encuentro con vecinos sobre Seguridad - Comuna X - d/m`— no nombra a nadie (CLAUDE.md 3.3): 14 en
ventana, todos sin candidato. Hoy lo mejor que dan es fecha + comuna sobre figura + fecha +
comuna = 0,56. Tres bloques:

1. **cuántos hay y de qué forma**, con la comuna y la fecha normalizadas antes de agrupar;
2. **filas de su misma comuna** (barrio → comuna) a 0 días y a ±3: exactamente 1 es el caso
   limpio, 2 o más necesita otra señal, ninguna es huérfano. Con el veredicto de hoy de esas
   filas;
3. **la otra cara, el costo**: simulando `obtenido / (alcanzable − 0,35)` sólo para estos
   formularios, cuántas filas que hoy se escriben con otro formulario tendrían un empate o un
   rival que las mande a revisión; y cuántas que hoy no se escriben llegarían al umbral.

**No es el resultado del cambio: es su tamaño.** No se tocaron pesos, puertas ni `puntuar_`. Si
se decide el cambio, el resultado lo dice volver a correr el paso 2 con él hecho.

### l) El 2f: ¿cuántas de las "no entran" fallan de verdad?

Bloque **2f** del paso 2. Ahora trae un **cruce motivo × veredicto de la fila** y la línea
*"De las N donde el más cercano no ganó, M son filas que IGUAL SE ESCRIBEN"*. Las que fallan de
verdad son las columnas *revisar* y *sin match*. Los ejemplos listados son sólo de filas que no
se escriben, ventana primero.

**Y el rótulo cambió:** `figura_no_reconocida_en_el_formulario` era *"el formulario no nombra la
figura de la fila"*, que no es una falla de reconocimiento. Se separa en **`otra_figura`**
(otra reunión de la misma comuna: Lombardi 30/03 ← un formulario de Landerreche), **`sin_figura`**
y **`posible_grafia`** (algún apellido de la figura está en el nombre). La suma de las tres es el
número viejo; el log la muestra para comparar. Mirar cuánto pesa `posible_grafia`: es la única
que apunta al reconocimiento de nombres.

**Medido (26/09 16:45, ventana): `otra_figura` 73, `sin_figura` 16, `posible_grafia` 0.** La
grafía no pesa en la ventana; afecta sólo al histórico. Cerrada.

### m) ¿De dónde sale la densidad de `EMPAREJAR_MANUAL`? (4,9 → 7,0) — medido: Jorge Macri

**Jorge Macri tiene 328 de 346 pares en ventana** (10,3 por fila); el resto está entre 1,3 y 3,3.
El bloque 3 sigue contando cuántos pares existen **sólo porque la figura sale del prefijo** (la
hipótesis de por qué subió), y ahora **simula un tope de 3 pares por fila**: cuántos se cortan,
la densidad que queda, cuántas filas quedarían con 0 pares (tendría que ser ninguna) y cuántos
formularios se quedarían sin propuesta. Orden para elegir: score, después cercanía de fecha.

**Fijado: `MAX_PARES_POR_FILA = 3`**, con una garantía. Simulado sin ella (26/09), la densidad
bajaba de 11,0 a 2,6 y ninguna fila quedaba vacía, pero **5 formularios se quedaban sin ninguna
propuesta**. Regla: tope de 3 por fila, pero un formulario al que el tope dejaría sin ningún par
**conserva su mejor par** aunque exceda el tope de esa fila. El bloque 3 lista esos formularios
con el par que conservan, y la densidad final. Es la lista de propuestas: **no cambia ningún
veredicto**.

### n) ¿Por qué "ninguno a ±3" pasó de 15 a 23?

Bloque **2b** del paso 2. "ninguno" se cuenta igual que antes (para poder comparar) y se
desglosa en *con un formulario a ±3 de OTRA figura* y *sin ningún formulario*, con la lista de
las filas (fecha, figura, barrio). Hipótesis, sin medir: los `JORGE MACRI - ...` que antes eran
"sin figura" ahora son "de otra figura" para filas de otras personas. Parte puede ser población:
entre las dos corridas el corte se movió; desde ahora está fijo (`VENTANA_ANALISIS_DESDE`).

### o) Las filas sin formulario propio: ¿faltan o están mal fechados?

**Toda reunión tiene formulario** (confirmado el 26/09; CLAUDE.md 1). Las filas "ninguno" del
2b —25 en ventana en la última corrida— no son reuniones sin formulario: son formularios que
faltan o que están mal fechados. En el upsert ahora llevan el motivo **`sin_formulario_propio`**
en `SIN_MATCH`, separado de `score_bajo`; el veredicto no cambia.

Log de **`paso7_formulariosFaltantes()`**, en tres partes:

- **a)** para cada fila, el formulario de su figura más cercano **a cualquier distancia**. Si
  coincide barrio o comuna y no es ya de otra fila → **candidato a mal fechado**, con la fecha
  detectada, de dónde salió (texto o `fecha_fin`) y el nombre crudo. Es una sospecha, no un hecho;
- **b)** `B` contra `Hoja1` por nombre normalizado + `fecha_fin`. Si no hay nada en `Hoja1` que
  falte en `B`, el faltante está **en la consulta**, no en el IMPORTRANGE;
- **c)** lo que queda: la lista de **FORMULARIOS FALTANTES** (fecha, figura, barrio, comuna),
  ventana primero y por fecha. Es lo que se le pasa a quien mantiene la consulta.

Las filas con la reunión hace menos de 7 días salen marcadas como **posible "todavía no
importado"** —las 2 de Jorge Macri del 29/09 son el caso—: volver a mirarlas en unos días antes
de reclamarlas.

**CERRADO el 01/10: Lombardi.** La consulta de `Hoja1` se corrigió y el paso 7 (01/10 14:11,
`B` con 825 formularios) lo verificó: faltantes **14 | 16 → 2 | 3**. Los 2 de la ventana
(Sánchez Zinny 19/06 Caballito, Muzzio 28/08 Recoleta) tienen el formulario de su figura tomado por
otra fila a 7 y 14 días: posibles reubicaciones o filas duplicadas en RDV, no faltantes de la
consulta (1a).

### p) ~~¿Qué variante del cambio "sin figura" rescata sin costo?~~ CERRADA: D-C, implementada

`paso8_…` corrió el **26/09 16:46** (hoy en YA CORRIDOS como `rehacer_medirVariantesSinFigura()`).
El paso 6 había dado que sacar la figura del denominador para los formularios sin figura sirve
(13 filas SIN_MATCH de la serie de Seguridad; 11 de 14 formularios con exactamente 1 fila de su
comuna a 0 días) pero cuesta (6 | 40 filas escritas empatadas o superadas). Las variantes:

| variante | regla | resultado (ventana) |
|---|---|---|
| 0 | el paso 6 tal cual | el costo de arriba |
| A | ubicación coincidente obligatoria (barrio o comuna) + fecha ±3 | — |
| B | A + fecha exacta | — |
| C | A + fecha ±1 | — |
| D-B | B + desempate | — |
| **D-C** | **C + desempate** | **12 de 14 objetivos recuperados, costo 0 \| 0; 1 a revisión** |

(De A, B, C y D-B tengo sólo la regla: los números no vinieron en el resumen.)

**La decisión: D-C, implementada** detrás de `SIN_FIGURA_POR_UBICACION = true` (`00_Config.js`;
CLAUDE.md decisión 2). La fila que va a revisión es Landerreche 03/09, con dos
`Comuna 1 Sur - 3/9` (0 y 116 inscriptos): **es lo correcto**, no hay con qué elegir entre dos
formularios iguales. La traza lleva `sin_figura_por_ubicacion` en `form_nivel`.

Probado en Node con los casos del paso 8: Sabor 31/08, Tapia Retiro 03/09, Mraida 16/09 y
Baistrocchi 08/09 se siguen escribiendo con su formulario; `"Gustavo Arengo 26/7"` (sin
ubicación) no puntúa por la regla; Landerreche 03/09 va a revisión; Piñeiro 03/09 se recupera.

### q) ~~¿El desempate por evidencia elige bien?~~ CERRADA: implementado

Log de **`paso9_medirDesempatePorEvidencia()`**. Muchas de las 38 REVISAR_MATCH de la ventana
son Jorge Macri con dos candidatos a 1,0: el `"1 a 1"` (figura + fecha exacta + comuna) contra
un temático `EJE Oeste/Norte` o `Primera Persona` (figura + fecha a 1 día, ubicación no
evaluable). **El `"1 a 1"` es la reunión de Macri** (confirmado; CLAUDE.md 3.3), pero la
normalización los deja iguales.

Sobre los contendientes de cada `margen_chico` —los que quedan a menos de `MARGEN_MINIMO` del
mejor—, el orden simulado es:

1. más señales evaluadas **y** coincidentes (figura, fecha, ubicación, hora; la fecha cuenta si
   está dentro de ±3);
2. menor distancia en días;
3. **más inscriptos del formulario** (hasta el 26/09: inscriptos > 0). Nunca los del destino.

Gana sólo el **estrictamente** mejor en el primer criterio que lo distinga; si empatan en los
tres, sigue en revisión. El log da, en [ventana | total], cuántas se resolverían y por qué
criterio, cuántas siguen (con los casos), y **todos los resueltos** con ganador, rivales y el
porqué. Mirar primero *"ganador = OTRO"*: son las filas donde el desempate le da la fila a un
formulario que hoy no es el mejor por score.

**No se implementa sin que una persona confirme los resueltos.** Aparte, se listan los
formularios con 0 inscriptos que hoy ganan una fila (Mercedes Miguel, `Comuna 9 15/9` → Miguel
15/09 Liniers), sin tocarlos.

**Corrió el 26/09 17:06: 37 de 38 resueltas** (27 por señales, 10 por distancia). Después:

- el criterio 3 pasó a **más inscriptos del formulario** (regla de negocio: de dos formularios de
  una misma reunión, el que casi no tiene inscriptos no se hizo). Debería resolver la fila 708
  (`Primera Persona 27/7`, 1344 contra su duplicado `DEPORTES` con 1) y la 134 (Tapia Saavedra
  21/8, 72 contra 2);
- cada resuelto dice si el ganador es **el mejor de hoy** u **"OTRO"**;
- se listan aparte los formularios **"Genérico"** (`Jorge Macri - Genérico 2026`, 774 ins) y las
  filas que ganan o disputan: no está claro que un genérico deba matchear.

**Implementado (30/09), detrás de `DESEMPATE_POR_EVIDENCIA = true`**, con los números del
26/09 17:44-17:51: 39 de 39 resueltas, y coincidencia con los inscriptos del destino en 36 de 38
(de las 2 que no, una la arregla el invariante y la otra tiene destino 0). El ganador tiene que
llegar al umbral por sí mismo y no ser `multi_figura`; si empatan en los tres criterios, la fila
sigue en REVISAR por margen_chico. La traza lleva `+desempate_por_<criterio>`. El orden vive en
una sola función, `_desempatePorEvidencia_`, que usan también el invariante de r) y el paso 10.

### r) ~~El invariante "un formulario, una fila" — bloqueante~~ CERRADA: chequeo 0 (30/09 14:19)

**Implementado el 30/09** (`aplicarFormularioUnico_`, entre las dos vueltas de `calcularPlan_`,
después del desempate). Si un formulario lo ganan 2+ filas, se lo queda la de mejor evidencia
(`_desempatePorEvidencia_`); las otras se **re-evalúan sin él con las mismas reglas** (umbral,
margen, sin figura por ubicación, desempate); si su nuevo mejor también está tomado, se repite,
hasta que no haya choques o se llegue a `MAX_VUELTAS_FORMULARIO_UNICO` (10). Sin un ganador claro
→ REVISAR_MATCH por `formulario_compartido`. Los inscriptos del destino no entran.

El bloque **0** del log pasó de simulación a **chequeo**: dice qué resolvió (se quedan / toman
otro / a revisar, con los casos) y, sobre el resultado final, cuántos formularios siguen con 2+
filas escritas. **Tiene que dar 0**; si no, lo dice en mayúsculas.

Probado en Node con los casos del paso 9: la **648** se queda con `1 a 1 - Comuna 5 17/6` y la
**645** termina en `Encuentro Temático Educación - Eje Oeste`; Ricardes `Comuna 9 29/6` → **671**
(no la 669); Muzzio `11/9 Recoleta` → **785** (no la 778). **Deja de ser bloqueante cuando el
chequeo del próximo paso 2 dé 0.**

**Dio 0 el 30/09 14:19**: 11 choques resueltos en 3 vueltas. La 645 terminó en el `Temático
Educación`; la 626 (Flores 04/06) perdió tres formularios en cascada y terminó en
`formulario_compartido`, que es lo correcto. En el paso 10, **8 de 9** choques coinciden con el
destino; el que no es `RDV JM Velez Sarfield - 5/6` (33 ins), que no coincide con ninguna de sus
dos filas (la 626 tiene 105) — lo mira la búsqueda inversa (u).

### s) ¿Qué tan bien acierta el matcher contra los inscriptos que hoy tiene el destino?

Log de **`paso10_validarContraInscriptos()`**. **Es una calibración de una sola vez**: los
inscriptos que hoy tiene el destino no van a existir en régimen como dato independiente (los
escribe el propio sistema), así que **no entran en el score, ni en ningún desempate, ni en la
regla de r)**. Mide:

- **cobertura**: filas evaluables con inscriptos cargados;
- **las que se escribirían**: destino contra el formulario elegido, en bandas (exacto / ≤ 5% /
  ≤ 20% / más), con la lista de las diferencias grandes —candidatas a match equivocado—;
- **los resueltos del paso 9**: si el ganador coincide con el destino o un rival coincide mejor,
  con los desacuerdos listados;
- **los choques de r)**: qué fila coincide con los inscriptos del formulario, y si la regla
  simulada eligió esa.

Lo que no dice, y está en el log: las filas que el legado cargó desde el mismo formulario
coinciden por construcción (valida al matcher nuevo contra el viejo, no contra la verdad); las
filas sin inscriptos no aportan; y una diferencia chica puede ser inscriptos que crecieron después
de la carga, no un error.

**Corrió el 26/09 17:51: 94,4% exacto en ventana (221 de 234); el desempate coincide con el
destino en 36 de 38.** Cambios desde entonces:

- **un destino con 0 inscriptos es "sin cargar", no una diferencia**: va en su propia línea y
  sale de la banda "más". En los choques, un formulario con 0 que "coincide" con un destino 0 no
  cuenta;
- los desempates y los choques que valida son los **implementados** (leídos del plan), no una
  simulación.

**El destino no es verdad absoluta** (CLAUDE.md): la fila 769 (Tapia Retiro 3/9) tenía 116 —los
inscriptos de `Comuna 1 Sur - 3/9`— y el matcher le asigna `Tapia - Comuna 1 Norte - 3/9` (88); la
748 (Tapia Villa Real 20/08) tiene 6 contra un formulario de 113. **Cerradas el 01/10** (1a): en la
748 RDV tenía el error y vale 113; la Comuna 1 del 3/9 se corrigió en RDV.

**Corrió el 30/09 14:23: 96,2% exacto en ventana (253 de 263), 2,7% ≤ 5%, 3 en "más" (527, 748,
769). Desempates 33 de 33. Choques 8 de 9.**

Se vuelve a correr después del próximo paso 2, ahora **con la búsqueda inversa** (u) al final y
con la medición de los **formularios sin fecha en el texto** (01/10): usan `fecha_fin`, el cierre
de la inscripción, que cae **antes** de la reunión (caso: fila 626 Flores 04/06 ↔ `1 a 1 - Comuna
7`, 105 = 105, a 6 días). Sobre los pares confirmados por la calibración —inscriptos iguales, con
`MIN_INSCRIPTOS_CALIBRACION_FECHA_FIN` (10) o más para no contar casualidades— mide (fecha de la
fila − `fecha_fin`) día por día. Si en la ventana es sistemáticamente ≥ 0 (≥ 80% de al menos 5
casos), **propone** una tolerancia asimétrica `[0, p90]` para esos formularios. No implementa nada.

**Medido el 01/10 18:04: el 100% de las reuniones confirmadas cae en o después del cierre, p90 =
+6. Decisión del usuario: se implementa** (`FECHA_FIN_ASIMETRICA = true`, `FECHA_FIN_VENTANA =
[0, +6]`). Para los formularios con fuente `fecha_fin`: pleno de 0 a +6 días, **cero hacia atrás**,
y más allá de +6 la escala de siempre. Traza `fecha_fin+N`. Los formularios con fecha en el texto
no cambian. Probado en Node: la 626 (Flores 04/06) se escribe con `1 a 1 - Comuna 7` (cierre a
+6), y un cierre posterior a la reunión puntúa 0 en fecha. Predicción: el bloque de `fecha_fin`
del próximo paso 10 muestra la 626 como elegida.

### t) ~~La guarda de transición: `TRANSICION_RESPETAR_DESTINO`~~ — ELIMINADA (01/10)

> **Decisión del usuario (01/10): se eliminó del código** —la constante, el bloque de
> `calcularPlan_`, el motivo `difiere_del_destino` y su línea del paso 2—, no sólo se apagó. Los
> inscriptos del destino son **sólo validación; nunca señal, desempate ni guarda** (CLAUDE.md 1):
> el sistema no va a tener ese dato. La 748, su caso, la cerró el equipo (vale 113) y se escribe.
> Revisado: el destino no entra en ningún otro punto del flujo de escritura (`_insDestino_` sólo
> lo leen el paso 10, el paso 11 y `explicarFila`, que sólo loguean). La predicción ≈ 10 | 59 no
> llegó a medirse. Lo de abajo queda como registro.

**Regla de transición, no del matcher.** Sólo para filas con veredicto `escribiria`: si el destino
tiene inscriptos cargados (≠ 0) y son **distintos** de los del formulario elegido, **no se
escribe**: va a REVISAR_MATCH con motivo `difiere_del_destino`, con los dos valores en la columna
de nivel (`… | destino N vs formulario M`). Igual o sin cargar → se escribe como siempre.

- **No toca el matching**: la elección ya está hecha cuando la guarda mira. Los inscriptos del
  destino siguen fuera del score, de los desempates y del invariante (CLAUDE.md 1). Es la única
  lectura de ese dato fuera del paso 10, y es para **decidir si se escribe**, no qué.
- **Es un seguro de migración**: la primera escritura no pisa (en el desagregado) una fila que el
  legado cargó con otro número, que puede ser el correcto (769, 748). **Se apaga después del
  backfill.**
- El paso 2 muestra cuántas frena `[ventana | total]` —**se espera ≈ 10 | 59**— con los casos. El
  paso 10 las sigue contando en sus bandas: lo que valida es la elección.

### u) La búsqueda inversa del paso 10 — implementada (30/09), sólo calibración

Para cada fila dudosa —la banda "más", los choques resueltos al revés, los desempates donde un
rival coincide mejor, las que no se escriben con dato en el destino, y las de
`FILAS_BUSQUEDA_INVERSA` (527, 626, 631; la 748 y la 769 salieron el 01/10, cerradas)—, los formularios **de su figura** (o sin
figura) a ±`DIAS_BUSQUEDA_INVERSA` (7) con **exactamente** los inscriptos del destino: *"el
destino tiene N: coincide con este formulario"*, y si ese formulario es el elegido, está libre o ya
lo toma otra fila.

**Sólo log; no entra en el score.** Un número igual puede ser casualidad, sobre todo con números
chicos: propone dónde mirar.

### v) Ubicación en desacuerdo con figura y fecha coincidentes — reubicación: implementada a revisión (01/10)

Caso: **Bereciartua**, fila 29/07/2026 **Flores (Comuna 7)**, 185 ins, contra *"VÍNCULO CIUDADANO -
Encuentro con vecinos - Pablo Bereciartua - Comuna 6 - 29/7"* (169). Figura y fecha exactas; la
comuna distinta lo **descalifica**. Hoy, si la fila tiene **cualquier** otro candidato limpio, el
descalificado ni siquiera llega a REVISAR (sólo va si es lo único que hay).

`paso11_desacuerdoUbicacion()` mide:

- **a)** los pares figura + fecha a 0-1 días + ubicación en desacuerdo, `[ventana | total]`, con
  los casos: en qué quedó la fila (¿ya se escribe con otro formulario?) y si el par está hoy en
  `EMPAREJAR_MANUAL`;
- **b) la propuesta, simulada y NO implementada**: esos pares no se descartan; si la fila no tiene
  un ganador mejor → REVISAR_MATCH con motivo `ubicacion_en_desacuerdo`; el par aparece siempre en
  `EMPAREJAR_MANUAL`; **nunca se escribe solo**. Cuenta cuántas filas y pares cambiarían.

**Corrección (01/10):** la fila de Bereciartua 29/07 es la **714** (Flores) y **se escribe** con
`Comuna 7 - 29/7` (185). `Comuna 6 - 29/7` (169) es el **formulario viejo** de la misma reunión,
que se reubicó: no hay ningún 185 contra 169 que resolver, y no es un faltante.

**Regla 8, confirmada por el equipo (01/10):** figura + fecha + inscriptos iguales + comuna
distinta en el título = **reunión reubicada que no se actualizó de un lado**. El dato vigente es el
barrio de RDV. Casos: 587 ↔ `Comuna 3 13/5` (250), 590 ↔ `Comuna 7 - 14/05` (119), 592 ↔
`Comuna 6 - 14/5` (92), 543 ↔ `Comuna 1 - 20/4` (236), 716 ↔ `Comuna 13 - 30/7` (147); en el
histórico 380, 393, 425, 443, 468 y 247.

**Implementado (01/10), `UBICACION_DESACUERDO_A_REVISION = true`:** el par figura + fecha a
±`DIAS_REUBICACION` (1) + ubicación en desacuerdo **no se descarta**. Si la fila no tiene un
ganador mejor → REVISAR_MATCH con motivo `ubicacion_en_desacuerdo` y el texto *"form dice Comuna
N / RDV dice Barrio (Comuna M) — posible reubicación"*; el par aparece **siempre** en
`EMPAREJAR_MANUAL` (el tope no lo corta). **Nunca se escribe solo.** Arreglado lo que encontró la
medición: el descalificado llega a revisión **aunque la fila tenga candidatos más flojos**.
**Predicción, antes de correr: ≈ 9 | 27 filas a revisar por este motivo.**

**La medición 2b sigue en pie** (`paso11_desacuerdoUbicacion()`, bloque b): de esos pares, cuántos
son **sin ambigüedad** —la figura tiene un solo formulario ese día ±1, y la fila un solo candidato
con figura y fecha (±7)— y cuántos ambiguos, `[ventana | total]` con los casos; y de los sin
ambigüedad, cuántos tienen inscriptos del formulario iguales a los del destino (calibración). Con
esos números el usuario decide si los sin ambigüedad se escriben solos con traza
`posible_reubicacion`.

**Medido el 01/10 18:04: `ubicacion_en_desacuerdo` 6 | 15 (predicción ≈ 9 | 27); sin ambigüedad
2 | 4. Decisión del usuario: NO se escriben solas.** Quedan en revisión, con las opciones y sus
puntajes (decisión y), y las resuelve una persona.

### w) Herramientas para revisar casos uno por uno — `diagnostico/06_revisar_casos.js`

Sólo lectura, sólo log.

- **`explicarFormulario`** (`paso12_explicarFormulario()`): fecha detectada y su fuente (texto o
  `fecha_fin`, y las ocurrencias que descartó la regla del mes), figuras, barrio, comuna, eje,
  inscriptos, y **todas** las filas de su figura a ±21 días con el score señal por señal, si quedó
  descalificado y por qué, y si pasó la puerta de `EMPAREJAR_MANUAL` (y si no, por qué: fila ya
  resuelta, formulario tomado, no nombra la figura, fecha lejos sin comuna, bajo el piso, o el tope).
- **`explicarFila`** (`paso12_explicarFila()`): lo mismo desde la fila, más su veredicto, su
  traza, sus contendientes y cómo ganó.
- Los dos leen **`CASO_A_EXPLICAR`** en `99_Correr.js`: número de fila de B o texto del nombre
  (formulario), o número de fila del destino (fila).
- **`listarFormulariosSinFila`** (`paso13_formulariosSinFila()`, antes `listarFilasFaltantes`):
  **"formularios sin fila: canceladas o reubicadas"**, **informativo** (regla 9: un formulario sin
  fila no es un faltante a reclamar). Formularios **sin ningún candidato** con
  `MIN_INSCRIPTOS_SIN_FILA` (10) o más, ventana primero, en dos listas:
  - **posible reemplazo / reunión reubicada** (regla 8): hay otro formulario de la misma figura a
    ±1 día que **ya se escribe** en una fila con la ubicación coincidente. Ej.: Bereciartua
    `Comuna 6 - 29/7` (169), reemplazado por `Comuna 7 - 29/7` en la 714;
  - **sin fila (posible cancelada)**: el resto. Del 30/09 se esperaban Mraida Comuna 3 20/7 (103) y
    22/7 (129), Primera Persona 12/8 (425), Sánchez Zinny San Cristóbal 8/4 (91), Miguel Comuna 15
    22/4 (46).

### y) Revisión con opciones y puntajes — implementada (01/10)

Principio del usuario: **lo que el sistema no resuelve, se lo presenta a una persona con las
opciones y sus puntajes.** En `REVISAR_MATCH` (todos los motivos), después de las columnas de
siempre, y en `EMPAREJAR_MANUAL`, en un bloque nuevo al final (*"POR FILA DEL DESTINO"*), cada fila
del destino muestra hasta `OPCIONES_REVISION` (3) formularios candidatos en el orden del sistema,
con seis columnas por opción: `formulario`, `fila_B`, `inscriptos` (**del formulario**), `score`,
`senales` (`figura ✓ · fecha 1 d · ubicación coincide (comuna) | DESACUERDO (…) | no evaluable ·
eje …`) y `tomado_por` (`libre` / `esta fila` / `fila N`). Al final, una columna vacía
**`elegido`**: el formato de la herramienta manual, **todavía no se lee**. Del destino no se muestra
nada más que lo que ya muestra la fila. Lo que había no cambia: las columnas viejas siguen en su
lugar y `leerConfirmaciones_` no lee el bloque nuevo (columnas A e I vacías).

### z) La traza de las filas no escritas se recalcula en cada corrida (01/10)

Antes, `aplicarDecisiones_` escribía la traza también para los descartados, y como
`setSiDelSistema_` escribe sólo en celda vacía, **quedaba fija** con la decisión de la primera
corrida. Corregido: **una fila que no se escribe no se toca** —ni `RDV_UID`, ni datos, ni traza—.
Su motivo y su mejor candidato viven en `REVISAR_MATCH` / `SIN_MATCH`, que se regeneran en cada
corrida. **Probado en Node** con una hoja simulada: las filas no escritas no reciben ninguna
escritura, y en una segunda corrida con datos cambiados su decisión cambia.

### x) Las derivadas del destino leen `Comunas` B-H — chequeo (30/09)

Las siete columnas `Comuna`, `Poblacion`, `p. Mujer`, `P. Varon`, `(km2)`, `(hab/km2)` y
`Zona` del destino son VLOOKUP del barrio contra `Comunas` B-H (CLAUDE.md 3.1.b). **La
corrección de las columnas E-G de `Comunas` cambió esos valores en el destino, a los correctos.**
`paso14_formulasDestino()` lo confirma: las once derivadas conservan su fórmula (y el ancla no
está en `#REF!`), las siete de lookup leen la columna que corresponde (2 a 8), y fila por fila el
valor del destino es el que da `Comunas` hoy. Sólo lectura: si algo difiere, se lista.

---

## 3. Cómo leer los logs nuevos

Todo el log del upsert salió a **dos columnas**:

```
VENTANA: N en ventana / M totales | corte: dd/MM/yyyy (últimos 6 meses)

  escribiría ..........   312 |   654   (81.5% | 81.5%)
                          ↑       ↑
                       ventana   histórico completo
```

**La columna que decide es la de la izquierda.** La derecha describe, en parte, un origen que ya
no existe — el formulario cambió en 2025-10 y dejó de mandar barrio. Los veredictos automáticos
del log (*"domina la fecha"*, *"el umbral se confirma"*) salen de la ventana.

**El upsert igual procesa las 802 filas**: la ventana filtra lo que se reporta y se calibra, no
lo que se hace. El backfill de la Fase 6 necesita el histórico entero.

Las tres solapas de reporte (`REVISAR_MATCH`, `EMPAREJAR_MANUAL`, `SIN_MATCH`) llevan columna
`en_ventana`, igual que las `DIAG_*`.

---

## 4. Conclusiones viejas que hay que releer, no citar

Estas salieron de la corrida del 25/09 **antes** de que el upsert tuviera la ventana, o sea
sobre las 802 históricas. Están marcadas también en `CLAUDE.md`:

| conclusión | por qué está en cuarentena |
|---|---|
| *"domina la fecha, 52 de 112"* | las 112 incluyen filas de 2025 |
| **81 formularios huérfanos** | ídem, y los midió la puerta de dos términos, ya corregida |
| **56 filas del destino sin candidato** | ídem |

---

## 5. Dónde está cada cosa

### Archivos nuevos de la arquitectura

| archivo | estado |
|---|---|
| [00_Config.js](../00_Config.js) | escrito. **Único lugar con literales** |
| [01_Utils.js](../01_Utils.js) | escrito. Helpers únicos + ventana de análisis |
| [02_Parsing.js](../02_Parsing.js) | escrito. `detect*`, canonización, `coincideEvento_` |
| [05_Escritura.js](../05_Escritura.js) | escrito. `setSiDelSistema_`, `marcarRealizada_`, `correrFase2b()` |
| [20_UpsertDestino.js](../20_UpsertDestino.js) | escrito, **en `DRY_RUN`** |
| `10_LeerOrigenes.js` | **falta** (Fase 4) |
| `30_Derivadas.js` | **falta** (Fase 3) |
| `40_Agenda.js` | **falta** (Fase 8) |
| [40_Alertas.js](../40_Alertas.js) | escrito, **no enganchado**. A mano: `correrAlertaCambios()` |
| [99_Correr.js](../99_Correr.js) | escrito. **El único archivo que se abre para correr algo**: `paso1_…` a `paso3_…`, `paso6_…`, `paso7_…`, `paso10_…` a `paso14_…` y `rehacer_…`; la constante `CASO_A_EXPLICAR`. Sin lógica propia; se actualiza en el mismo commit en que cambia qué correr |
| `99_Pipeline.js` | **falta** (Fase 7) |

### Diagnósticos (sólo lectura, ninguno escribe en el destino)

| archivo | entry points |
|---|---|
| [diagnostico/01_hueco_sexo_edades.js](../diagnostico/01_hueco_sexo_edades.js) | `diagFase1()` y uno por reporte |
| [diagnostico/02_corte_B_a_B2.js](../diagnostico/02_corte_B_a_B2.js) | `diagCorteB()`, `diagDupB2()`, `diagFechaFin()`, `diagScores()`, `diagAnclaFecha()` |
| [diagnostico/03_muestras_mail.js](../diagnostico/03_muestras_mail.js) | `diagMuestrasMail()` |
| [diagnostico/04_legado_fechas.js](../diagnostico/04_legado_fechas.js) | `diagLegToDate()` — qué `legToDate_` gana y qué le llega (`rehacer_verificarLegToDate()`, corrido el 25/09) |
| [diagnostico/05_formularios_faltantes.js](../diagnostico/05_formularios_faltantes.js) | `diagFormulariosFaltantes()` — faltantes y mal fechados (`paso7_…`) |
| [diagnostico/06_revisar_casos.js](../diagnostico/06_revisar_casos.js) | `explicarFormulario()`, `explicarFila()` (`paso12_…`), `listarFormulariosSinFila()` (`paso13_…`, informativo) — decisión w |
| [diagnostico/07_formulas_destino.js](../diagnostico/07_formulas_destino.js) | `diagFormulasDestino()` — las derivadas contra `Comunas` (`paso14_…`) — decisión x |

Todos tienen su `rehacer_…` en [99_Correr.js](../99_Correr.js).
`diagAnclaFecha()` queda como registro de una medición cerrada. **No hace falta volver a
correrlo**: el ancla está descartada (3.3.c).

### Documentos

- [CLAUDE.md](../CLAUDE.md) — la fuente de verdad. Invariante, hallazgos, decisiones, plan
- [docs/sync-bidireccional.md](sync-bidireccional.md) — el paso 5 leído línea por línea
- [docs/agenda-legado.md](agenda-legado.md) — el flujo Agenda, para la Fase 8
- [docs/triggers-legado.md](triggers-legado.md) — inventario de activadores. **Prerrequisito de
  cualquier decisión de archivado**
- [docs/backup.md](backup.md) — las copias de las planillas
- [docs/HANDOFF-2026-09-25.md](HANDOFF-2026-09-25.md) y [docs/HANDOFF-2026-10-01.md](HANDOFF-2026-10-01.md)
  — fotos de cierre de sesión; no se corrigen
- [docs/prompts/](prompts/) — los prompts que originaron cada fase

---

## 6. Las dos cosas que más fácil se rompen si alguien las olvida

**1. El invariante.** El pipeline nunca pisa lo que carga el usuario. Toda escritura al destino
pasa por `setSiDelSistema_`, que escribe **sólo si la celda está vacía**. Verificable de un
vistazo:

```
grep -rn "setValue\|setValues" 20_UpsertDestino.js
```

tiene que dar sólo `escribirHoja_`, que escribe en la **intermedia**, no en el destino.

**2. El color es información.** El `#4F81BD` marca lo que escribió el sistema, y hay 3.779
celdas así. Prohibido contra el destino: `clear()`, `sort()`, `deleteRow()`, `insertRow*()` en el
medio, y cualquier `setBackground` que no sea el azul. La tabla completa está al final de
`CLAUDE.md`.

---

## 7. El orden de lo que sigue

```
Fase 2   base limpia         ── en curso. Cierra sola al final de la Fase 5
Fase 2b  columnas de traza   ── listo el código; falta correr correrFase2b()
Fase 5   upsert              ── escrito, calibrando en DRY_RUN   ← acá estamos
Fase 3   derivadas a valores ── prerrequisito duro de la Fase 9
Fase 4   lectura directa
Fase 6   backfill
Fase 7   activadores
Fase 8   Agenda              ── prerrequisito de la Fase 9
Fase 9   retiro del staging  ── última
```

La Fase 2 **no cierra hasta el final de la Fase 5**, y no es un descuido: tres archivos del
legado no se pueden archivar todavía porque el único activador vivo los necesita. El detalle está
en *"Por qué la Fase 2 no cierra"*, en `CLAUDE.md`.

### aa) Las subzonas de la Comuna 1 — implementadas (01/10, regla 10)

**No son ejes.** Comuna 1 **Norte** = Puerto Madero, Retiro, San Nicolás; **Sur** = Constitución,
Monserrat, San Telmo (`COMUNA1_SUBZONAS`, con `Montserrat` como grafía alternativa). Los títulos
las usan (`Comuna 1 Sur - 3/9`).

- `detectComuna_` sigue devolviendo el número; `detectSubzonaComuna1_` conserva la subzona
  (`Comuna 1 Norte/Sur`, `1N`, `C1S`), que viaja en el candidato como `subzona`. Antes se
  descartaba.
- Ubicación (`comparaComuna_`): formulario con subzona contra una fila de un barrio de la Comuna 1
  → **coincide** si el barrio está en esa subzona, **desacuerdo** si está en la otra (y con la
  regla 8: a revisión, nunca descartar). Sin subzona, o barrio de la Comuna 1 fuera de las listas:
  como antes. La usan también la puerta de `EMPAREJAR_MANUAL`, `cercanosDeFila_`, el paso 7 y
  las herramientas de revisión.
- **Línea fija en el paso 2**: pares que decidió la subzona `[ventana | total]`, con los casos.
- **Probado en Node**: el 3/9 queda igual (Landerreche 768 ← `Comuna 1 Sur - 3/9`, Tapia 769 ←
  `Tapia - Comuna 1 Norte - 3/9`) y `Comuna 1 Sur - 1/10` (125) va a **Monserrat (808)**; Retiro
  (807) queda en desacuerdo.
- **Corrió el 01/10 18:04**: 19 | 32 pares coinciden por la subzona.

### bb) Figuras nombradas sólo por apellido — implementado (01/10)

Los formularios nuevos de Lombardi (*"RDV - Eje norte, Lombardi-Tapia-Piragine- 30/3"*, *"Encuentro
con comerciantes 24/6 Eje Oeste"*, …) nombran a las figuras **sólo por apellido**. El matcher no
las reconocía y esas filas quedaban SIN_MATCH aunque el formulario estuviera a 0 días con los
inscriptos exactos del destino: la búsqueda inversa del 01/10 marcó **510, 542, 620, 658, 686,
755, 798** (y 470, 444 en el histórico). **Son 9 filas de la ventana.**

`FIGURA_POR_APELLIDO = true`: en `figurasEnTexto_`, un apellido suelto cuenta como figura **sólo
si es único** entre las figuras del destino (la última palabra del nombre, que no aparezca en el
nombre de ninguna otra figura; mínimo 4 letras; las entradas que juntan varias figuras no cuentan).
Lombardi → Hernán Lombardi, Tapia → Gabino Tapia, Piragine → Gustavo Arengo Piragine. Uno compartido
no cuenta. Traza `figura_por_apellido`. **Línea nueva del paso 2**: qué formularios suman figuras
así, para ver que no entre basura.

Con tres figuras el formulario es `multi_figura` → REVISAR_MATCH, como los históricos
`HERNÁN LOMBARDI-GUSTAVO ARENGO PIRAGINE`: lo decide una persona con las opciones. **Probado en
Node**: `"RDV - Eje norte, Lombardi-Tapia-Piragine- 30/3"` → 3 figuras → multi_figura; un
apellido compartido ("Miguel", de Mercedes Miguel y Miguel Sabor) no suma. **Predicción**: sin match
en ventana 16 → ≈ 7, revisar 9 → ≈ 18.

**Variantes del legado (01/10, pedido aparte del mismo día).** Se portó la tabla de
`detectPersona_` de `_archivo/Código.js` a `00_Config.js` como **`FIGURAS_VARIANTES`** (una regex
por figura, con su origen), y `figurasEnTexto_` la usa además de la lista del destino: Piñeiro /
Pineiro, Baistrocchi / Biastrocchi, Quirós / Quiroz, "Gustavo Arengo" con o sin "Piragine",
Landerreche / Landereche, y los dos casos del 2b: **"Horacio Lombardi" → Hernán Lombardi** y
**"Arengo Peragine" → Gustavo Arengo Piragine**. Traza `figura_por_variante` (o
`figura_por_apellido`). También se portaron las variantes de barrio (**`BARRIOS_VARIANTES`**:
Vélez, Paternal, Pompeya, Lugano…), que entran sólo si `Comunas` no reconoció ningún barrio. La
línea del paso 2 cuenta y lista las dos cosas. **Bug arreglado de paso**: `_expandirAbreviaturas_`
dejaba el punto de `gral.`, y "Villa Gral. Mitre" no coincidía nunca con "Villa Gral Mitre". Probado
en Node (Pineiro, Landereche, Horacio Lombardi, Arengo Peragine, Quiroz, Biastrocchi, Pompeya,
Velez, Paternal, Lugano, Villa Gral Mitre). La predicción no cambia: **sin match 16 → ≈ 7, revisar
≈ +9**; la línea de variantes puede sumar algún formulario más, y eso es lo que hay que mirar.

**Paso 13** (01/10): "Primera Persona 12/8 con Nicolás Vázquez" (425) salió como reemplazado por
`1 a 1 - 12/8 Parque Avellaneda` (128), y puede ser otra reunión del mismo día. Queda en la lista,
marcado **DUDOSO** cuando el formulario "viejo" tiene más inscriptos que el "nuevo"; el encabezado
aclara que la lista es para que el equipo confirme.

---

## 7b. Ideas para después

- **La Agenda (Fase 8) tiene el lugar final de cada reunión.** Sirve para **confirmar
  reubicaciones** (regla 8: si la Agenda dice el barrio de RDV, el formulario con otra comuna es el
  viejo) y para **detectar filas que faltan en RDV** (una reunión agendada y realizada sin fila).
  El destino ya trae un texto de agenda por fila. Sin medir: es una fuente a cruzar cuando toque la
  Fase 8, no una regla.
- ~~**Escribir solas las reubicaciones sin ambigüedad**~~: **descartado el 01/10** (sin ambigüedad
  2 | 4): quedan en revisión (decisión v).
- **No evaluar una fila sin barrio con menos de 1 día** (regla de las 17): medida en el paso 2, sin
  implementar (1a).
- ~~**Tolerancia asimétrica para los formularios con fuente `fecha_fin`**~~: **implementada el
  01/10** (decisión s).

**Handoff del 01/10:** [docs/HANDOFF-2026-10-01.md](HANDOFF-2026-10-01.md), el texto del usuario
(01/10 noche), guardado tal cual. Es una foto: su "Pendiente para Code" (puntos 1 a 4) ya está
hecho en `5f84cc1`; lo que sigue es correr el paso 2 y el paso 10.

---

## 8. La regla de trabajo que conviene no perder

> **Si el próximo commit de código invalida algo que dice `CLAUDE.md`, el documento se corrige en
> ese mismo commit.** No en el siguiente, no en uno de limpieza al final.

En esta migración cambiamos de premisa doce veces. Entre la medición y la actualización, el
documento decía algo falso — y ése es justo el momento en que alguien lo abre para decidir.
