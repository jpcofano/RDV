# Estado de la migración — al 2026-10-03

Punto de retomada. **`CLAUDE.md` sigue siendo la fuente de verdad** sobre qué hace el sistema y
por qué; este archivo dice sólo **dónde quedamos y qué sigue**, para poder abrir el repo en otra
máquina y arrancar sin releer todo.

Rama: **`migracion`**. `main` queda intacto como referencia.

---

## 0. Prueba de escritura sobre la copia "AAA NOBORRAR" (02/10) — EN CURSO

> ⚠️ **`RDV_HOJA_DESTINO` apunta a la copia, no al destino real. TEMPORAL.** Ver f) para volver.
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

**`RDV_HOJA_DESTINO` sigue en `'AAA NOBORRAR'`: no se cambia hasta que el usuario lo confirme.**

**La secuencia en el real, con la predicción anotada ANTES de correr:**

1. `RDV_HOJA_DESTINO = 'RVD JM-CM - ES'` en `00_Config.js`, commit, `git push` y `clasp push`. **(Espera
   la confirmación del usuario.)**
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
