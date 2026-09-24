# El flujo Agenda, leído

Lectura de los tres archivos tal como están en `main`, más `Barrio desde Base.js`, que resultó
ser parte del mismo circuito. **Nada de esto propone cambios todavía**: el punto 5 opina, pero
no toca código.

Estado de activadores al 2026-09-24: de todo lo que sigue, **sólo
`syncAgendaSheetInBaseFromAgenda_2` tiene activador.**

---

## 1. El flujo, archivo por archivo

```
Gmail ──agenda_syncFromEmails()──────────► (4) solapa `Agenda`        [A MANO]
                                                  │
              ┌───────────────────────────────────┤
              │                                   │
 agenda_pushReadyToBaseFinal()          syncAgendaSheetInBaseFromAgenda_2()
        [A MANO]                              [ACTIVADOR, 0,63%]
              │                                   │
              ▼                                   ▼
   (1) `Para Revisar`                   (1) solapa `Agenda`  (espejo, se borra y reescribe)
   inserta o actualiza filas            no la lee nadie más
```

> **El hallazgo que cambia la lectura de todo lo demás:** `CLAUDE.md` decía que el flujo Agenda
> está "funcionando". **Dos de sus tres pasos no tienen activador.** La ingesta desde Gmail y el
> push a `Para Revisar` **sólo corren si alguien los ejecuta a mano desde el editor.** Lo único
> automático es el espejo, que es el paso que menos hace.

### `Agenda traer datos del mail.js` — la ingesta

`agenda_syncFromEmails()` orquesta cuatro cosas:

| paso | qué hace |
|---|---|
| `fetchAgendaEventos_()` | Gmail → objetos evento |
| `upsertAgendaRows_()` | escribe en la solapa `Agenda` de **(4)** |
| `archivePastAgendaRows_()` | mueve filas viejas a `Agenda ya incorporada` |
| `agenda_formatWeeks_()` | pinta las filas por semana |

**Sólo procesa eventos futuros**: `futuros = eventos.filter(e => e.fecha >= hoy)`. Un mail que
llega tarde, con una reunión de ayer, **se descarta en silencio**.

Ordena por fecha del mail antes de escribir, `más viejo → más nuevo`, para que la versión más
reciente pise a la anterior. Ese detalle está bien pensado.

La solapa `Agenda` tiene **columnas dobles**: `(auto)` para lo que llega del mail y `(manual)`
para lo que corrige una persona, más tres flags: `Listo para enviar`, `Enviado a base`,
`Enviado timestamp`.

```
ID | Persona (auto) | Barrio (auto) | Fecha (auto) | Hora (auto) | Dirección (auto) | Fuente
   | Persona (manual) | Barrio (manual) | Fecha (manual) | Hora (manual) | Dirección (manual)
   | Listo para enviar | Enviado a base | Enviado timestamp
```

**El upsert nunca toca las columnas `(manual)` ni los flags.** Sólo reescribe `(auto)` y
`Fuente`. Es la misma disciplina que `setSiDelSistema_` propone para el destino, y acá ya está
implementada —por separación de columnas en vez de por celda vacía, que es incluso más claro.

### `Agenda push a base.js` — el push a `Para Revisar`

`agenda_pushReadyToBaseFinal()` recorre la solapa `Agenda` y **exige dos flags**:

```js
if (!listo || enviado) continue;   // Listo para enviar === true && Enviado a base !== true
```

Es una **compuerta manual explícita**: nada sale de Agenda hasta que una persona tilda la
casilla. En un proyecto donde casi todo lo demás escribe sin preguntar, esto es lo más parecido
a un control de calidad que hay.

Para cada fila que pasa la compuerta: `manual > auto` campo por campo, canoniza el barrio con
`mapBarrioCanon_` (ver punto 4.b: eso es un problema), arma la clave natural y escribe en
`Para Revisar` — `UPDATE` si la clave existe, `INSERT` si no.

En el `UPDATE`, `STATUS REUNIÓN` **sólo se escribe si está vacío**:

```js
const cur = String(dest.getRange(dRow, D.Status+1).getValue() || '').trim();
if (!cur) dest.getRange(dRow, D.Status+1).setValue('en agenda');
```

Otra vez la disciplina correcta, ya implementada.

### `Solapa agenda base final.js` — el espejo

`syncAgendaSheetInBaseFromAgenda_2()` es el **único con activador**, y es el que menos decide:
arma una vista de la solapa `Agenda` de (4) dentro de la planilla (1), en una solapa también
llamada `Agenda`, con las columnas de `Para Revisar` para que se lea igual.

```js
shAgendaBase.clear();
shAgendaBase.getRange(1,1,1,baseHdr.length).setValues([baseHdr]);
...
shAgendaBase.getRange(2,1,out.length,baseHdr.length).setValues(out);
```

Borra y reescribe entera en cada corrida. **Sobre esa solapa está bien** —es una vista derivada,
no tiene datos propios— aunque usa `clear()` y no `clearContents()`, así que también borra
formato.

Pone `STATUS = 'en agenda'` en **todas** las filas, sin condición. No importa: es un espejo que
nadie más lee.

#### ¿Qué explica el 0,63% de error?

Es bajo —del orden de un fallo cada 160 disparos— así que no es un bug estructural sino algo
intermitente. Los candidatos, en orden:

1. **`findIdxOr_` sin `optional`** en `figura`, `barrio` y `fecha` (líneas 46-48): si
   `Para Revisar` queda un instante sin alguna de esas columnas, tira. Y esta función **puede
   crear columnas** en `Para Revisar` vía `ensureColumnsExist_`, así que hay una ventana en la
   que la lee mientras la está modificando.
2. **Concurrencia con `agenda_pushReadyToBaseFinal`**, que escribe en `Para Revisar` fila por
   fila. Sin lock entre los dos.
3. Timeouts del servicio, como el que mató `diagFase1()`.

**No lo puedo cerrar sin el log de ejecuciones.** El dato que lo resolvería: si los fallos se
concentran en horarios donde alguien estaba trabajando en la planilla, es (1) o (2).

---

## 2. La entrada por Gmail

**La query:**

```js
const GMAIL_QUERY_SUBJECT = 'subject:(Agenda Encuentros de vecinos)';
const GMAIL_LOOKBACK_DAYS = 21;
// query final: subject:(Agenda Encuentros de vecinos) newer_than:21d
```

De cada hilo toma **el último mensaje**, no todos: `msgs[msgs.length - 1]`. Asume que un hilo es
una agenda y sus correcciones, y que la última versión manda.

**Qué parsea**, línea por línea, con cuatro expresiones regulares:

| patrón | ejemplo | a qué campo va |
|---|---|---|
| `^(lunes\|martes\|…)\s+(dd/mm)$` | `martes 14/10` | fija la fecha de las líneas que siguen |
| `^evento:\s*encuentro con vecinos\s+(.+?),\s*(.+)$` | `Evento: Encuentro con Vecinos Clara Muzzio, Palermo` | persona y barrio |
| `^hora:\s*(\d{1,2}:\d{2})h` | `Hora: 18:30h` | hora |
| `^lugar:\s*(.+)$` | `Lugar: Plaza Serrano` | dirección; si dice `A CONFIRMAR`, queda vacía |

Descarta los eventos que contengan `NO PARTICIPA`, y exige **persona + fecha + hora** para
aceptar un evento. Sin hora no entra.

**El año no viene en el mail:** `currentDate = new Date(thisYear, mo-1, d, 12, 0, 0)`. Toma el
año actual. Una agenda de fin de diciembre que menciona el 3 de enero queda **un año en el
pasado** — y como después filtra por futuros, **desaparece**.

### Qué pasa si cambia el formato del mail

**Se rompe en silencio, y de la peor manera: no tira error, deja de encontrar eventos.**

Las cuatro regex son anclas rígidas. Basta que el asunto cambie de `Encuentros de vecinos` a
otra cosa, o que la línea de evento pase a decir `Reunión con Vecinos` en vez de
`Encuentro con Vecinos`, para que `parseAgendaBody_` devuelva cero filas. Y el único aviso es:

```js
if (!eventos.length) {
  SpreadsheetApp.getActive().toast('Sin eventos de agenda detectados en Gmail.', 'Agenda', 4);
  return;
}
```

Un `toast` de cuatro segundos en una planilla que quizá nadie tiene abierta, y un `return`
limpio. **Para el activador es un éxito.** Es exactamente la misma clase de falla silenciosa que
3.1.a: el sistema informa que todo salió bien mientras no hace nada.

### ¿Reprocesa los mails?

**No hay marca de procesado en Gmail.** No usa etiquetas, no marca como leído, no guarda IDs de
mensaje. **Cada corrida reprocesa las últimas tres semanas completas.**

Lo que evita el daño no es una marca, son dos cosas:

1. el upsert es **idempotente por `ID`**: recalcula la misma clave y sobreescribe la misma fila;
2. **sólo toca las columnas `(auto)`**, así que reprocesar no pisa correcciones humanas.

Funciona, pero tiene un costo: **toda corrección hecha en una columna `(auto)` se pierde en la
corrida siguiente.** Por eso existen las columnas `(manual)`, y por eso hay que usarlas.

Y un efecto de borde: si un mail viejo se edita o alguien responde el hilo, el evento **revive**
mientras esté dentro de los 21 días.

---

## 3. Las claves

**Hay tres claves distintas en juego, y cada una tiene su propia definición.**

| tramo | clave | función |
|---|---|---|
| mail → `Agenda` | `normalizeText(persona)\|yyyyMMdd\|HH:mm` | `buildAgendaId_` |
| `Agenda` → `Para Revisar` | `normalizeText(figura)\|normalizeText(barrio)\|yyyyMMdd` | `keyFBF_` |
| destino → `Ajuste Formularios RDV` | `normalizeText(figura)\|yyyyMMdd` | `keyPersonaFecha_` |

### La del mail es la mejor de las tres, y se puede explicar por qué

`buildAgendaId_` usa **persona + fecha + hora**, y **no usa barrio**.

Eso la vuelve inmune a los dos problemas que están rompiendo el resto del pipeline:

- **no depende del barrio**, que es justo el campo que el origen dejó de mandar (CLAUDE.md
  3.3.b) y que genera las 49 `barrio_no_reconocido`;
- **no depende de canonizar nada**. No pasa por `mapBarrioCanon_` ni por listas de 48 nombres,
  así que no hereda el drift `Villa Gral. Mitre` / `Villa General Mitre`.

Y la hora la hace **más estricta** que `figura + fecha`, que ya alcanzaba: por la regla de
negocio de la sección 1.a no hay dos reuniones de la misma figura el mismo día, así que la hora
es redundante para identificar — pero **discrimina bien y no cuesta nada**.

> **La lección para el rediseño:** la clave del mail funciona mejor porque **usa menos campos, y
> ninguno que requiera interpretación.** Persona canonizada contra una lista de 20 es frágil;
> fecha y hora en formato fijo, no. Cada campo que se agrega a una clave es una forma más de que
> deje de matchear.

### El salto a `Para Revisar` pierde esa ventaja

En cuanto `agenda_pushReadyToBaseFinal` cruza al destino, **vuelve a `keyFBF_` con barrio**, y
con eso reintroduce toda la fragilidad que la clave del mail había evitado:

```js
const barrioN = mapBarrioCanon_(barrioRaw) || barrioRaw;
const key = keyFBF_(persona, barrioN, fecha);
if (!key) { skipped++; continue; }   // sin barrio, la fila se descarta
```

**Una fila de Agenda sin barrio no llega nunca al destino.** Y el barrio del mail es texto libre
después de la coma: `Encuentro con Vecinos Clara Muzzio, Palermo`.

---

## 4. El solapamiento con el resto del pipeline

### a) Sí, escriben en las mismas solapas

| quién | escribe en | conflicto |
|---|---|---|
| `upsertBaseFinal_A2_B2` (paso 4) | `Para Revisar` | ← |
| `agenda_pushReadyToBaseFinal` | `Para Revisar` | → **mismas filas, misma clave** |
| `syncAgendaSheetInBaseFromAgenda_2` | solapa `Agenda` de (1) | propia, pero… |

…pero el espejo **también puede modificar `Para Revisar`**, aunque no lo parezca:

```js
const shBaseMain = ssBase.getSheetByName(DEST_SHEET_NAME);   // DEST_SHEET_NAME === 'Para Revisar'
ensureColumnsExist_(shBaseMain, baseHdr1, [ ...16 columnas... ]);
```

Si falta cualquiera de esas 16, **le agrega columnas a `Para Revisar`**. Una función que se
presenta como "armar una solapa espejo" puede cambiar la estructura de la solapa de staging.

Los dos usan `keyFBF_`, así que apuntan exactamente a las mismas filas.

### b) No hay orden implícito que los proteja. Hay suerte.

**No existe ningún lock, ni dependencia, ni orden declarado entre los activadores.** Lo que hoy
los mantiene separados es una coincidencia de tres cosas:

1. el pipeline principal **falla el 100% de las veces** y ahora está apagado (CLAUDE.md 3.1.a);
2. `agenda_pushReadyToBaseFinal` **no tiene activador** — sólo corre si alguien lo ejecuta;
3. el push **exige dos flags manuales**, así que aun ejecutándolo casi nunca hay filas para
   mandar.

**Nada de eso es diseño.** Arreglar `SRC_SHEET` y volver a encender el pipeline reactiva el paso
4 sobre `Para Revisar` mientras el espejo corre por su cuenta. Es otra razón para el orden que
ya está anotado en la Fase 2: **apagar antes de arreglar.**

### c) `Barrio desde Base.js` cierra un circuito que nadie declaró

Este archivo no parecía parte de Agenda. Lo es, y cierra un anillo:

```
(1) RVD JM-CM - ES  ──syncBarriosFromBaseToAjusteRDV()──►  (4) Ajuste Formularios RDV
        ▲                    [clave: figura|fecha]                    │
        │                                                             │
        │                                          syncManualCorrections_B2()
        │                                                             │
        │                                                             ▼
        └────── paso 4 + paso 5 ◄────── B2.BarrioN ◄──── B2.Barrio (manual)
```

`syncBarriosFromBaseToAjusteRDV` lee el `Barrio` del **destino** y lo copia a la hoja de ajustes
manuales cuando ahí falta. Después `syncManualCorrections_B2` lo lleva a `B2.Barrio (manual)` y
de ahí a `B2.BarrioN`, que es **la mitad de la clave** con la que el upsert busca en el destino.

O sea: **el barrio del destino termina determinando la clave con la que se busca ese mismo
destino.** Es una sincronización bidireccional de hecho, de las que la sección 0.b prohíbe, y
no está declarada en ningún lado.

Tiene un efecto que hay que entender antes de desarmarlo: **este circuito es lo que mantuvo vivo
`BarrioN` en B2 después de que el origen dejara de mandar barrio.** No compensa el problema de
3.3.b —sólo rellena lo que ya existía en el destino— pero lo enmascara parcialmente.

> **Consecuencia directa de haberlo apagado el 24/09:** `B2.BarrioN` deja de recibir el barrio
> que venía del destino. Las filas nuevas de B2 van a quedar sin `BarrioN`, y la proporción de
> claves incompletas —23 al momento del diagnóstico— debería **subir** en las próximas semanas.
> Vale la pena medirlo: es la confirmación de que el circuito estaba haciendo ese trabajo.

---

## 5. Qué sobrevive al rediseño

Opinión, con el motivo. Ordenado por lo que haría primero.

### Se rescata casi tal cual

**La separación `(auto)` / `(manual)` de la solapa `Agenda`.** Es la mejor idea del legado. Hace
innecesario todo el mecanismo de "no pisar": no hay que decidir si una celda es del sistema o de
una persona porque **están en columnas distintas**. Donde `setSiDelSistema_` tiene que inferir la
procedencia por el fondo `#4F81BD` —con la limitación de que el azul no sobrevive a una edición
humana—, acá la procedencia es estructural y no se puede perder.

> Vale la pena preguntarse si el destino no debería adoptar el mismo patrón en vez del azul. Es
> un cambio grande y no lo propongo ahora, pero es la solución correcta y conviene tenerla
> anotada.

**La compuerta de dos flags.** `Listo para enviar` + `Enviado a base` es un control de calidad
humano explícito, con marca de idempotencia. Se mantiene, y encaja perfecto con `REVISAR_MATCH`:
son el mismo patrón —el sistema propone, una persona confirma.

**La clave del mail** (`persona|fecha|hora`). Ver punto 3. Se mantiene como identidad interna de
la solapa `Agenda` hasta que se estampe el `RDV_UID`.

### Se adapta

**`agenda_pushReadyToBaseFinal` → el upsert único.** Es el punto 3 de la Fase 5b y no cambia:
en vez de escribir en `Para Revisar`, llama al upsert nuevo. Con dos cambios de fondo:

- **toda escritura por `setSiDelSistema_`**, que además resuelve el `if (!cur)` del `STATUS` de
  forma uniforme;
- **`STATUS = 'en agenda'` sigue siendo correcto** en el `INSERT`, y es justamente el estado de
  origen de `marcarRealizada_` (decisión 12). El flujo Agenda **crea** las filas en el estado del
  que después parte la transición. Encajan sin fricción.

**La ingesta de Gmail** se mantiene, pero **necesita un activador y una alerta.** Hoy no tiene
ninguno de los dos, y falla en silencio si cambia el formato del mail. Mínimo: si
`fetchAgendaEventos_` devuelve cero eventos y en los últimos 21 días hubo mails que matchean el
asunto, eso es un error, no un "sin novedades".

### Se reescribe

**El paso del espejo, `syncAgendaSheetInBaseFromAgenda_2`.** Es el único con activador y es el
que menos aporta: una vista que se podría resolver con un `QUERY` o un `IMPORTRANGE`, o
simplemente mirando la solapa `Agenda` de (4). A cambio, **puede modificar la estructura de
`Para Revisar`** sin que su nombre lo sugiera. Cuando el staging se retire (decisión 10), se cae
solo. **Mi recomendación: no portarlo.**

**Toda la canonización de barrios.** Ver el bloqueante nuevo en CLAUDE.md 3.1.h. Hay dos
`mapBarrioCanon_` con listas distintas y **una de ellas se contradice a sí misma**. Va una sola
implementación a `02_Parsing.js`, y las otras se borran. No es adaptar: es tirar y escribir de
nuevo, con una sola lista.

### Se elimina

**`archivePastAgendaRows_` y `agenda_formatWeeks_`**, si el criterio de "qué se ve en Agenda" se
resuelve con filtros de la planilla. Mover filas entre solapas por fecha es mantenimiento
gratuito, y `agenda_formatWeeks_` pinta fondos, que es exactamente lo que la sección 6 pide
evitar como mecanismo.

**El filtro de "sólo futuros"** de `agenda_syncFromEmails`. Descarta en silencio un mail que
llega tarde con una reunión de ayer. Con el upsert idempotente no hace falta: que entren todos y
que el estado los ordene.

### La decisión que queda abierta

**`Barrio desde Base.js` (punto 4.c).** Está apagado desde el 24/09 y venía en 0% de error, o
sea que funcionaba. Pero lo que hacía era cerrar un circuito bidireccional que el invariante
prohíbe.

Mi opinión: **no revivirlo como está.** Lo que resolvía —que B2 se quede sin barrio— se resuelve
bien con `RDV_UID`: una vez estampado el uuid, la clave deja de depender del barrio y el
circuito pierde su razón de ser. Revivirlo sería reinstalar una sincronización bidireccional
para sostener una clave que estamos por reemplazar.

Lo que sí hay que hacer antes de darlo de baja definitivo: **averiguar quién mira
`Ajuste Formularios RDV`.** Si hay gente que usa esa hoja para corregir datos, el barrio
prellenado les ahorraba trabajo y hay que reemplazarlo por otra cosa. Eso no se contesta leyendo
código.
