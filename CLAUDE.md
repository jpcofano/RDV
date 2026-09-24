# RDV — Reuniones de Vecinos

Proyecto de Google Apps Script que consolida datos de inscriptos y asistentes de las
Reuniones de Vecinos en una planilla única de reporte.

**Estado: en migración.** El código de `main` es el legado auditado en septiembre 2026.
Este documento describe lo que hay, por qué falla y hacia dónde vamos. Leelo entero antes
de tocar nada.

---

## 0. El invariante

> **El pipeline nunca pisa lo que carga el usuario.**

Esta regla está por encima de todo lo demás que dice este documento. Si algo del plan,
de la arquitectura o de una fase choca con ella, **gana el invariante** y lo que se
replantea es lo otro.

**Por qué.** El equipo carga a mano una parte de `RVD JM-CM - ES`. Ese trabajo no es
recuperable: no hay ningún origen del cual volver a sacarlo. Un dato del pipeline que se
pierde se vuelve a calcular corriendo el pipeline; un dato que cargó una persona y se pisó
está perdido y nadie se entera hasta que alguien nota que un número cambió.

### La marca de procedencia

El sistema ya distingue lo suyo de lo ajeno, aunque nunca lo haya leído de vuelta.
[Sinc Base usuario.js:286](Sinc%20Base%20usuario.js#L286) pinta `#4F81BD` cada celda que
escribe, inmediatamente después del `setValue`:

```js
rng.setValue(vPR);
rng.setBackground('#4F81BD'); // azul
```

Verificado sobre la planilla: ese azul aparece **3.779 veces en `RVD JM-CM - ES` y cero
veces en `Para Revisar`**. Es una marca de procedencia real, no decoración. **Se mantiene: mismo
color, se sigue pintando en cada escritura del sistema.** Lo que no hace es decidir si escribir
— ver "Por qué esa regla alcanza", más abajo. El detalle de cuándo pinta hoy y cuándo
no está en [docs/sync-bidireccional.md](docs/sync-bidireccional.md).

### La regla

Toda escritura al destino pasa por un helper único:

```js
setSiDelSistema_(rango, valor)
```

que escribe **sólo si la celda está vacía**, y que pinta `#4F81BD` al escribir.

**Celda con cualquier valor → no se toca.** No importa quién lo puso ni de qué color está.

No hay `setValue` ni `setValues` sueltos contra el destino. Ninguno. Si aparece uno en un
diff, el diff está mal.

#### Por qué esa regla alcanza: los números del sistema son cerrados

El formulario de inscripción **cierra**. Después de eso el total no se actualiza más: los
inscriptos de una reunión del mes pasado son los que son y no van a cambiar. Lo mismo el
desagregado por sexo y edades, que sale de ese mismo total.

Eso simplifica el problema entero. Si el origen no corrige, **no hay nada que propagar**, y por
lo tanto:

- **no hace falta una regla de resolución de conflictos.** No existe el caso "el sistema tiene
  un valor nuevo y mejor que el que está en la planilla";
- **no hace falta distinguir una corrección humana del valor original del sistema.** Da igual
  quién escribió lo que está: si hay algo, es el valor final.

`setSiDelSistema_` queda exactamente como está:

1. escribe **sólo si la celda está vacía**;
2. pinta `#4F81BD` al escribir, como **aviso visual para el equipo**;
3. **lo que ya está cargado no se toca ni se recalcula.** Nunca.

Y por eso mismo el azul **no se consulta para decidir si escribir**. Sería tentador relajar la
regla a "vacío **o** con fondo `#4F81BD`" —total, el azul marca lo que escribió el sistema—
pero eso sólo serviría para reescribir un valor con otro, que es justo lo que no pasa: no hay
valor nuevo. Lo único que se ganaría es el riesgo de pisar algo.

El `#4F81BD` tiene entonces dos usos, los dos de lectura:

- **aviso visual**: alguien mirando la planilla ve de un vistazo qué llenó el proceso y qué no;
- **métrica**: `DIAG_PROCEDENCIA` mide cuánto de las columnas del equipo viene aportando hoy el
  pipeline (sección 3.2).

No decide nada, y no hace falta que decida.

> **Descartado: el `onEdit` que despintaba el azul.** Estuvo un tiempo anotado en la Fase 7.
> Su única razón de ser era volver el fondo confiable como token de permiso, para poder habilitar
> "vacío o azul" y que el pipeline pudiera **propagar correcciones del origen**. Como el origen
> no corrige, no hay correcciones que propagar y el `onEdit` no resuelve ningún problema real:
> agrega un trigger, una forma de romper el formato y una regla más que explicar, a cambio de
> nada. **No reabrirlo.** Lo que sí hace falta —enterarse si un número cerrado se movió— lo
> resuelve `verificarCambiosRecientes_()` (sección 4, decisión 11), que avisa en vez de escribir.

### Tres consecuencias que no son negociables

**a) El cero cuenta como valor escrito.** Escribir `0` sobre una celda vacía la marca como
ocupada y borra la diferencia entre "no hay dato" y "el dato es cero". Por eso **B2 tiene
que guardar celda vacía cuando no hay dato, nunca `0`**. Hoy hace lo contrario: `num()`
convierte vacío en cero en todos lados, y por eso una fila de B2 que llegó sin datos se ve
igual que una que llegó con ceros legítimos. Se arregla en la Fase 2, cuando `01_Utils.js`
reemplaza las nueve copias de `num()`.

**b) No puede haber sincronización bidireccional.** Sincronizar en dos direcciones obliga a
elegir un ganador en cada conflicto, y acá el ganador es siempre el usuario — con lo cual la
dirección destino → origen no tiene nada que aportar y sí mucho que romper. El origen se lee,
el destino se escribe, y las diferencias se reportan en vez de resolverse. Esto es lo que
mata al paso 5 (sección 4, decisión 10).

**c) Las columnas manuales no se escriben ni aunque estén vacías.** Ver `COLUMNAS_MANUALES`
en la decisión 8. El invariante protege celdas; esta lista protege columnas enteras, incluso
antes de que nadie haya cargado nada en ellas.

---

## 1. Planillas

| # | Rol | ID | ¿Somos dueños? |
|---|---|---|---|
| 1 | **Destino final** — workbook "RDV JM-CM - ES / funcionarios" | `1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo` | sí |
| 2 | **Intermedia** — "Base intermedia Reuniones de Vecinos". El script está atado acá (`getActive()`) | `1dNLcBjh1ncEVBeALD-szhIlcRGkfOiMaPJp2tGqrsyM` | sí |
| 3 | **Origen inscriptos** — `Hoja1` | `1W7mzk0cTmiabfEMZ56M9pDsqf6jK6I2fDpqbpP3dWQg` | **no** |
| 4 | **Agenda** | `1hP8zMN8Ep7s1w9zb3Fllix2q_OqIhVwkrED0KCoVh4U` | sí |

Solapas que importan:

- **(1) `RVD JM-CM - ES`** → destino final, 41 columnas, 802 filas con datos. **Es el único destino.**
- **(1) `RDV CONJUNTO`** → origen de asistentes (12 col).
- **(1) `Comunas`** → tabla de lookup, A:H. Estable, no cambia.
- **(1) `Para Revisar`** → destino del flujo Agenda.
- **(2) `B`** → IMPORTRANGE de (3) `Hoja1!A1:R` + `Hoja1!S1:AC`.
- **(2) `Asistentes`** → IMPORTRANGE de (1) `RDV CONJUNTO!A:L`. Antes se llamaba `A`.
- **(2) `A2`, `B2`** → versiones transformadas. `B2` tiene 27 columnas.
- **(2) `import B2 Completo`** → en `#REF!`. Apunta a `'Hoja 1'` (con espacio) y la solapa real
  es `Hoja1`. Está muerta, se elimina.

### Regla dura

**No se modifica nada en (3) ni en `RDV CONJUNTO`.** No se agregan columnas, no se pide un
`evento_id` al origen. Cualquier identidad se genera de nuestro lado.

---

## 2. Flujo actual

`runFullPipelineWithDelays()` en `Completo.js`, cinco pasos con `Utilities.sleep()` entre medio:

```
1  syncA_to_A2_upsert              Sinc A to A2.js
2  syncB_to_B2                     Sync B to B2.js
3  normalizeBarriosToBarrioN_A2B2  Barrios.js
4  upsertBaseFinal_A2_B2           Upset Base FInal.js   → 'Para Revisar'   (staging, en (1))
5  syncBaseFinal_ParaRevisar_y_RVD Sinc Base usuario.js  → 'Para Revisar' ⇄ 'RVD JM-CM - ES'
```

**Entre B2 y el destino hay dos saltos, no uno.** El paso 4 no toca `RVD JM-CM - ES`: escribe
en `Para Revisar`, que es una solapa de staging dentro de la misma planilla (1)
([Upset Base FInal.js:7](Upset%20Base%20FInal.js#L7), `DEST_SHEET_NAME = 'Para Revisar'`).
Recién el paso 5 cruza al destino, y lo hace **en las dos direcciones**, con reglas distintas
según el sentido.

Esto importa para leer cualquier diagnóstico: una fila puede estar completa en B2 y faltar en
el destino porque se cortó en `B2 → Para Revisar` **o** porque se cortó en
`Para Revisar → RVD JM-CM - ES`, y son dos causas distintas con dos arreglos distintos. Por eso
la Fase 1 mide los dos saltos por separado.

Las reglas del paso 5, leídas línea por línea, están en
[docs/sync-bidireccional.md](docs/sync-bidireccional.md). El resumen: escribe al destino sólo
sobre celda vacía, y sólo ahí pinta `#4F81BD`; en el otro sentido copia al staging únicamente
valores no numéricos; cuando los dos lados tienen valor y difieren, no escribe y lo reporta.

Flujo Agenda, separado y **funcionando** (no romper):
Gmail → `Agenda traer datos del mail.js` → solapa `Agenda` en (4) → `Agenda push a base.js`
→ `Para Revisar` en (1).

No hay `onOpen()` ni triggers declarados en código. Todo corre por activadores cargados a
mano en la UI del editor.

---

## 3. Hallazgos de la auditoría (2026-09)

### 3.1 Bloqueantes

**a) El paso 1 está roto.** `Sinc A to A2.js:3` tiene `const SRC_SHEET = 'A'` y la solapa se
renombró a `Asistentes`. Tira `throw new Error('No existe la hoja "A".')` y corta el pipeline
entero en el primer paso.

**b) Las fórmulas del destino impiden escribir.** En `RVD JM-CM - ES`, once columnas son
fórmulas de array que viven **en la celda del encabezado** y se expanden hacia abajo:

| col | fórmula |
|---|---|
| `D` Día de la semana | `={"Día de la semana"; IF(E2:E2374="","",TEXT(E2:E2374,"dddd"))}` |
| `W` % de Asistencia | `={"% de Asistencia"; IF(LEN(K2:K2374)=0,"",IFERROR(Q2:Q2374/K2:K2374,...))}` |
| `X` Direccion2 | `={"Direccion2"; IF(G2:G2374="","",G2:G2374&", Buenos Aires, ...")}` |
| `Y` Falta Informacion | `={"Falta Informacion"; IF(K2:K2374="","","No")}` |
| `AA` Comuna | `={"Comuna"; IFERROR(VLOOKUP(B2:B2374, Comunas!A:B, 2, FALSE),)}` |
| `AB`–`AF` | `VLOOKUP($B, Comunas!$A:$G, 3..7)` → Poblacion, p.Mujer, P.Varon, km2, hab/km2 |
| `AG` Zona | `={"Zona"; IFERROR(VLOOKUP(B2:B2374, Comunas!A:Z, 8, FALSE),)}` |

Un `setValue()` en cualquier celda de esas columnas rompe el array completo
(*"Array result was not expanded because it would overwrite data"* → `#REF!` en todo el bloque).
Además están clavadas hasta la fila **2374**: la fila 2375 en adelante no recibe nada, en silencio.

→ **Decisión: reemplazar las once por valores escritos desde el script.** Las cuatro primeras
son aritmética de la misma fila; las siete restantes son un `VLOOKUP` contra `Comunas!A:H`
que se resuelve leyendo esa tabla una vez a un `Map`.

**c) Colisiones en el scope global.** Apps Script comparte un único scope entre todos los `.gs`.
Hay declaraciones repetidas: `normalizeHeader_` ×10, `toDate_` ×9, `str`/`num` ×9/×7,
`normalizeText_` ×7, `findIdxOr_` ×6, `ensureHeaders_` ×5, `mapBarrioCanon_` ×2.
Gana la última que carga, y el orden de carga es el orden de archivos del proyecto —
no está en el repo y cambia si alguien arrastra un archivo en el editor.

El caso grave es `toDate_`, porque decide la clave:

```js
// Upset Base FInal.js  → día primero.  03/04/2025 = 3 de abril
const m = /^\s*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s*$/.exec(String(v));

// Sync B to B2.js      → motor de JS.  03/04/2025 = 4 de marzo
if (typeof val === 'string') { const d = new Date(val); ... }
```

Del día 1 al 12 de cada mes la fecha puede quedar corrida de mes según el orden de carga.
Es el origen probable del "a veces funciona".

Aparte, `Upset Base FInal.js` define `runUpsertAndNormalize`, `logDbg`, `ensureColumnsExist_`,
`setIfIndex_`, `_normNoAccents_`, `mapStatusToAllowed_`, `findIdxOr_` y `normalizeHeader_`
**dos veces dentro del mismo archivo** (bloque duplicado desde la línea 413).

**d) Lo que no matchea se pierde sin ruido.** En `upsertBaseFinal_A2_B2`:

```js
const dRow = keyToRow.get(key);
if (!dRow) { skippedB++; SKIP_CAUSES.noKeyDest++; continue; }
```

No hay camino de inserción. Si la reunión no existe todavía en el destino, el dato se descarta
y sólo queda un contador en un log que nadie mira.

**e) 676 líneas dentro de comentarios de bloque.**

- `Back up Agenda traer datos del mail.js` — las 340 líneas (abre `/*` en la 1, cierra en la 340).
- `Completo Actualizacion sola.js` — las 54.
- `Carga Manual persona o barrio por equipo/.js` — líneas 265 a 547. Ahí adentro están
  `exportMissingPersonaBarrio_B2_toManualSheet()` e `importManuals_fromManualSheet_toB2()`:
  **esas funciones no existen en runtime.**

**f) `syncB_to_B2` inserta filas que después nadie puede encontrar.**

Lo único que hace saltear una fila del import es que falte `Nombre`
([Sync B to B2.js:132](Sync%20B%20to%20B2.js#L132)):

```js
const key = buildKeyByNombreInscriptos_(nombre, ins);
if (!key) { skipped++; continue; }   // buildKey sólo devuelve '' si no hay nombre
```

Más abajo, cuando `detectPersona_` o `detectBarrio_` no reconocen el texto libre, **la fila se
inserta igual**, con la columna vacía:

```js
const persona = (typeof detectPersona_ === 'function') ? detectPersona_(nombre) : '';
const barrio  = (typeof detectBarrio_  === 'function') ? detectBarrio_(nombre)  : '';
// ...y se escriben así, vacías, en la fila nueva de B2
```

El resultado es una fila que **está en B2 pero no es indexable por la clave natural**
`Persona|BarrioN|Fecha`: le falta uno de los tres componentes. El upsert nunca la encuentra, y
cualquier diagnóstico que indexe B2 por clave natural la cuenta como si no existiera.

**Son las 23 claves incompletas** que midió la Fase 1 (sección 3.2). Y son la razón por la que
`no_existe_en_B2` no quiere decir "la fila no llegó a B2".

→ **Dos ramas de arreglo, con costos muy distintos.** No son alternativas: hay que saber cuánto
pesa cada una antes de elegir por dónde empezar.

| rama | qué es | costo |
|---|---|---|
| **Ampliar las listas fijas** de `detectPersona_` (20 nombres) y `detectBarrio_`, o derivar la figura de otro lado en vez de adivinarla del texto libre | la fila **sí está** en B2, sólo que sin `Persona`/`BarrioN` | **bajo**: es data, no arquitectura. Se puede hacer hoy |
| **Rehacer `syncB_to_B2` como acumulativo** | la fila **no está** en B2 porque ya no está en `B`, y B2 es un espejo del import, no un acumulado | **alto**: cambia el modelo de la solapa y hay que rellenarla hacia atrás |

`DIAG_CORTE_B` (Fase 1b) mide el reparto. **Las 23 claves incompletas no alcanzan a explicar 72
filas**, así que hay que esperar las dos causas mezcladas y dimensionar cada una, no elegir la
primera que aparezca.

Mientras tanto, el arreglo de fondo es la decisión 2: con `RDV_UID` la identidad deja de
depender de que una lista fija de nombres reconozca el texto libre.

### 3.2 Calidad de datos, medida

Destino `RVD JM-CM - ES`, 802 filas con datos, fechas 05/07/2025 → 24/09/2026:

- clave natural `Figura|Barrio|Fecha` completa: **793** (faltan 9, todas por Barrio vacío)
- claves naturales **duplicadas: 0** → la clave natural es única hoy, sirve como puente
- columna `Z (ID)`: 612 de 802 con formato roto (`Jorge Macri |  |  |  | `). Inservible como clave,
  pero es columna literal, el script puede reescribirla.
- 48 variantes distintas de Barrio, con drift (`villa gral. mitre` vs `Villa General Mitre`).

**El hueco a llenar:**

| mes | filas | sin Inscriptos | con Ins. y sin Sexo | sin Edades | sin Canales |
|---|---|---|---|---|---|
| 2026-04 | 55 | 0 | 6 | 6 | 0 |
| 2026-05 | 50 | 0 | 7 | 7 | 0 |
| 2026-06 | 55 | 0 | 11 | 11 | 0 |
| 2026-07 | 46 | 0 | 12 | 12 | 0 |
| 2026-08 | 48 | 4 | 7 | 7 | 0 |
| 2026-09 | 36 | 13 | 20 | 20 | 0 |
| **total** | **802** | **17** | **79** | **79** | **0** |

**Las columnas de canales (`Mail`, `Call Center`, `IVR`, `RRSS`, `Difusión`) las carga el equipo
a mano.** Por eso nunca figuran vacías, y por eso su completitud **no dice nada** sobre la salud
del pipeline.

Sexo y edades son las únicas columnas que dependen puramente del proceso automático, así que
son el único indicador real de si el pipeline funciona. Faltan **siempre juntas** (mismo número
exacto), lo que apunta a una falla única de la cadena B2 → destino y no a un problema por columna.

Tasa de falla del pipeline, por mes: 11% en abril, 20% en junio, 26% en julio, **56% en septiembre**
(20 de 36 filas). Está empeorando. El resto de la planilla se ve completa porque el trabajo manual
la cubre.

Causas candidatas, a discriminar en la Fase 1 sin presuponer ninguna: la fila no llega a B2;
llega vacía; llega completa pero el flag `Procesado BF = TRUE` impide reprocesarla; o la clave
natural no matchea contra el destino.

#### Resultado del diagnóstico (2026-09-22): el corte está en `B → B2`

`DIAG_HUECO`, 79 filas analizadas:

| diagnostico | filas | % |
|---|---|---|
| `no_existe_en_B2` | **72** | 91,1% |
| `clave_incompleta` | 7 | 8,9% |
| `B2_vacio_tambien` | 0 | — |
| `corte_B2_a_PR_flag_TRUE` | 0 | — |
| `corte_B2_a_PR_flag_FALSE` | 0 | — |
| `corte_PR_a_destino` | 0 | — |

Conteos de contexto:

```
Destino:        802 filas con datos (getLastRow=2374)
B2:             714 claves únicas · 14 duplicadas · 23 con clave incompleta
Para Revisar:   802 claves · 0 duplicadas
Inscriptos > 0 con las ocho columnas de sexo/edad exactamente en cero: 1
```

**El staging no pierde datos.** Cero cortes en el paso 4 y cero en el paso 5. Las dos causas
candidatas que apuntaban al flag `Procesado BF` y al match de la clave natural contra el destino
quedan **descartadas**: ninguna fila del hueco llegó a B2 con datos.

**El corte está en `B → B2` o antes.** B2 tiene 714 claves contra las 802 del destino: le faltan
~88, del mismo orden que las 72. Lo que falta nunca entró.

**`Para Revisar` es un espejo del destino**, no un reservorio: 802 claves, las mismas, cero
duplicadas. No tiene filas que el destino no tenga, así que **no sirve como fuente del backfill**
— hay que ir a `B` y, si hace falta, al origen.

**14 claves naturales duplicadas en B2.** Deja de ser una preocupación teórica: es evidencia
directa del problema de la clave `nombre|inscriptos` (decisión 3). Cuando `Inscriptos` cambia
entre dos corridas, la clave cambia y `syncB_to_B2` inserta una fila nueva en vez de actualizar
la que ya estaba. Se listan en `DIAG_DUP_B2`.

**Las 23 claves incompletas en B2 son una causa aparte, no un detalle.** Esas filas **están en
B2** pero sin `Persona` o sin `BarrioN`, así que no se pueden indexar y el upsert nunca las
encuentra — ver el bloqueante **3.1.f**. Es distinto de "no llegó", y `DIAG_CORTE_B` lo separa
(`persona_no_reconocida` / `barrio_no_reconocido`). 23 no alcanzan para 72: hay dos causas
mezcladas.

El seguimiento está en [docs/prompts/PROMPT-02-CORTE-B.md](docs/prompts/PROMPT-02-CORTE-B.md) y
lo mide `diagnostico/02_corte_B_a_B2.js`.

#### Los dos totales que no coinciden: estado heredado, no bug

`DIAG_TOTAL_DIVERGENTE` dio **72 filas** donde el `Inscriptos` del destino no es el mismo número
que el `Inscriptos` de B2. El contraste con `DIAG_ATOMICIDAD` dice qué son:

| comparación | filas que no cuadran |
|---|---|
| suma de canales ≠ `Inscriptos` del destino | **3** |
| suma de sexo ≠ `Inscriptos` del destino | **72** |

Los canales y el total **los carga la misma persona**, así que cierran entre sí: 3 de 802 es
ruido de tipeo. El desagregado de sexo y edades **lo calcula el sistema**, y lo calcula bien —
`syncB_to_B2` hace `Math.round(ins × nM / unique)` sobre el `Inscriptos` **del origen**, y el
resultado cuadra contra ese número. **No hay bug de reparto.**

Lo que hay son **dos números distintos conviviendo en la misma fila**: el total que ve la gente,
escrito a mano, y un desagregado calculado contra otro total. Las 72 filas **quedan así**. No se
recalculan: el formulario cerró, el desagregado del origen es el que es, y reescribirlo sobre un
total manual sería inventar un reparto que nadie midió.

**La regla nueva evita que se repita**, sin necesidad de ninguna lógica extra:

- si el total ya está cargado, el sistema **no escribe** el desagregado (`Inscriptos` es
  `COLUMNAS_MANUALES`, y `setSiDelSistema_` no toca celdas con valor);
- si está vacío, lo escribe él, contra su propio total, y los dos números son el mismo.

#### `DIAG_PROCEDENCIA`: cuánto aporta el pipeline, no cuánto pisa

**605 celdas azules** en las seis `COLUMNAS_MANUALES`, y **0 celdas vacías con azul**.

Ese cero confirma la lectura: el paso 5 escribe **sólo sobre celda vacía**, así que las 605 son
**huecos que el sistema rellenó**, no cosas que pisó. Por eso la métrica se llama **aporte del
sistema** y no "pisado" — la primera versión del reporte la etiquetó mal.

Por columna, las que más dependen del pipeline:

| columna | aporte del sistema |
|---|---|
| `IVR` | 28% |
| `Call Center` | 26% |
| `Difusión` | 14% |

**La consecuencia es incómoda y hay que decidirla, no descubrirla en producción.** Con
`COLUMNAS_MANUALES` intocables (decisión 8), ese aporte **desaparece**: más de una cuarta parte
de `IVR` y de `Call Center` la venía llenando el proceso. Dos salidas, y hay que elegir una:

- **reemplazarlo con carga humana**, sabiendo que son ~605 celdas por ciclo de vida de la
  planilla y que alguien tiene que hacerse cargo;
- **decidir explícitamente que se pierde**, y asumir que esas columnas van a quedar más vacías
  que hoy.

Lo que no se puede es dejarlo implícito. Si nadie decide, el equipo va a ver columnas que antes
se llenaban solas y ahora no, sin saber por qué.

**Riesgo adicional:** el upsert escribe las columnas de canales sin condición
(`setIfIndex_(dest, dRow, D.Mail, mail)`). Si el pipeline corre después de que alguien cargó un
valor a mano, lo pisa con lo que venga de B2 — incluido un cero.

> **Corrección (post-lectura del paso 5).** Ese pisado **hoy se detiene en `Para Revisar`**.
> El paso 4 escribe los ceros de B2 en el staging sin preguntar, pero el paso 5 sólo completa
> celdas **vacías** del destino, así que el trabajo manual de `RVD JM-CM - ES` está protegido
> — por accidente de esa regla, no por diseño, y nadie lo escribió en ningún lado.
>
> La consecuencia es incómoda: **sacar el staging (decisión 10) es exactamente el cambio que
> rompería la protección**, si el upsert nuevo hereda el `setIfIndex_` del legado. Por eso
> `setSiDelSistema_` (sección 0) no es una mejora opcional sino la condición previa para poder
> eliminar el paso 5. Las columnas manuales ya están confirmadas: ver `COLUMNAS_MANUALES` en la
> decisión 8.

### 3.3 Fragilidades del origen

- `B` tiene `Persona`/`Barrio`/`Fecha` escritas a mano en las columnas S, T, U, encajadas entre
  el IMPORTRANGE de `A1:R` y el de `s1:AC` (col V). Si el origen agrega una columna, el primer
  IMPORTRANGE intenta expandirse a S y todo el bloque tira `#REF!`. Esas derivadas se mudan a B2.
- IMPORTRANGE se recalcula asincrónico. El script puede leer `B` mientras muestra `Loading...`
  y procesar filas vacías creyendo que no hay datos.
- **El bug de fechas es una inversión de prioridad, no un regex flojo.**
  [Sync B to B2.js:162-163](Sync%20B%20to%20B2.js#L162):

  ```js
  let fecha = detectFecha_(nombre, defaultYear);        // texto libre, primero
  if (!fecha && fechaFin) fecha = toDate_(fechaFin);    // columna estructurada, de fallback
  ```

  El texto libre gana y `fecha_fin` sólo entra si el regex falla. **Y el regex casi nunca
  falla**, así que una columna de fecha estructurada, disponible en el **99%** de las filas,
  prácticamente no se usa. Que `detectFecha_` lea `"Reunión 10-12 hs"` como *10 de diciembre*
  es el síntoma; la causa es que ese resultado le gana a un dato confiable que ya estaba ahí.

  Medido sobre las **1.000 filas de `B`**:

  | | |
  |---|---|
  | filas con fecha en el texto | **743** |
  | dentro de ±3 días de `fecha_fin` | **96,1%** |
  | moda: 0 días | 444 casos |
  | +1 día | 236 casos |

  O sea: **la reunión es el día que cierra el formulario, o el siguiente.** El texto libre no
  aporta información que `fecha_fin` no tenga — sólo aporta ruido. Los outliers incluyen dos de
  **+303 días**: `fecha_fin` 2026-02-11 → texto 2026-12-11, y 2026-02-18 → 2026-12-18. Eventos
  de febrero leídos como diciembre. Son los que estiraban el rango efectivo de `B` hasta el
  18/12/2026 y ensuciaban el cálculo de la ventana del import.

  → **Arreglo en `02_Parsing.js`: `fecha_fin` es el ancla.** Se acepta la fecha del texto sólo
  si cae dentro de `[fecha_fin − 2, fecha_fin + 7]`; si no, se usa `fecha_fin` y **se marca la
  fila** para poder auditar cuántas veces pasó. La ventana va en `00_Config.js` como
  `VENTANA_FECHA_TEXTO = {min: -2, max: 7}`, calibrable: es asimétrica a propósito, por el
  sesgo hacia adelante que muestran los 236 casos de +1 día.

  `diagAnclaFecha()` (en `diagnostico/02_corte_B_a_B2.js`) mide cuántas de las
  `fecha_mal_parseada` de `DIAG_CORTE_B` resuelve esta regla, antes de escribirla en el parser.
- `detectPersona_` y `detectBarrio_` son listas fijas. Nombre fuera de lista → `''` → la fila se
  descarta en el upsert como `noFigura` / `noBarrioN`.
- `DEFAULT_YEAR = 2025` hardcodeado en `Código.js`.

---

## 4. Arquitectura destino

**Hoy** (dos saltos, staging en el medio, el paso 5 bidireccional):

```
Hoja1 (1W7mzk) ──IMPORTRANGE──► B ──► B2 ──┐
                                           ├─paso 4──► Para Revisar ──paso 5──► RVD JM-CM - ES
RDV CONJUNTO (1ZpHO6) ─IMPORTRANGE─► A ──► A2 ┘            ▲                          │
                                                           └──────────────────────────┘
                                                        (sólo valores no numéricos)

Gmail ──► Agenda (1hP8zMN8) ──► Para Revisar
```

**Destino** (un salto, sin staging, una sola dirección):

```
Hoja1 (1W7mzk) ──openById──► B2 ──┐
                                  │
RDV CONJUNTO (1ZpHO6) ─openById─► A2 ──┼──► upsert único ──► RVD JM-CM - ES ──► recalcDerivadas_()
                                  │       (setSiDelSistema_)        │
Gmail ──► Agenda (1hP8zMN8) ───────┘                                 └──► SIN_MATCH

Para Revisar (legado)   [archivo, sólo lectura, no lo escribe nadie]
```

### Decisiones

1. **Leer por ID, no por IMPORTRANGE.** `SpreadsheetApp.openById()` sólo necesita permiso de
   lectura, que ya tenemos. Elimina la carrera de recálculo. `B` y `Asistentes` quedan como
   vista para el equipo; el script deja de depender de ellas.
2. **`RDV_UID`**: uuid generado en B2/A2 al insertar, inmutable. En el destino va como columna
   nueva al final (`AP`). El upsert busca por `RDV_UID`; si está vacío cae a la clave natural
   `normalizeText_(Figura)|normalizeText_(Barrio)|yyyyMMdd(Fecha)` y **estampa el uuid**.
   Después de una corrida casi todo entra por uuid y el drift de acentos deja de importar.

   #### Cuando la clave natural tampoco alcanza: match por score

   Los nombres de evento del origen **no los controlamos** (regla dura, sección 1). Son texto
   libre, y a veces una sola inscripción menciona a varios funcionarios. Un match exacto o nada
   deja afuera casos perfectamente resolubles, así que el tercer nivel es un **score**.

   Cada candidato de `B` recibe un puntaje sobre **1.0**:

   | señal | puntaje |
   |---|---|
   | figura mencionada en el texto del evento | **0,35** |
   | fecha exacta | **0,30** |
   | fecha ±1 día | 0,20 |
   | fecha ±3 días | 0,10 |
   | barrio canónico coincide | **0,25** |
   | misma comuna | 0,15 |
   | hora coincide | **0,10** |

   **Decide el umbral más el margen contra el segundo candidato, no la unicidad.** Que haya un
   solo candidato no lo vuelve correcto, y que haya varios no vuelve al mejor incorrecto:

   | condición | qué pasa |
   |---|---|
   | score ≥ `UMBRAL_MATCH` **y** margen ≥ `MARGEN_MINIMO` | escribe y **estampa el `RDV_UID`** |
   | score ≥ `UMBRAL_MATCH` pero margen chico | va a **`REVISAR_MATCH`**, no se escribe |
   | score < `UMBRAL_MATCH` | va a **`SIN_MATCH`** |

   ```js
   // 00_Config.js — PROVISORIOS, a calibrar
   const UMBRAL_MATCH  = 0.75;
   const MARGEN_MINIMO = 0.15;
   ```

   **Los dos números son provisorios y están puestos a ojo.** Se calibran corriendo en seco
   contra las **103 filas de `DIAG_CORTE_B`** y mirando la distribución real de scores:
   `diagScores()` (en `diagnostico/02_corte_B_a_B2.js`) la vuelca sin escribir nada. Hasta que
   esa distribución exista, cualquier umbral es inventado.

   #### Barrio contra barrio, comuna contra comuna

   **Nunca se compara un barrio contra una comuna.** Para el parcial de 0,15 se **sube** cada
   barrio a su comuna con la tabla `Comunas` (la misma que hoy alimenta las columnas `AA`–`AG`)
   y se comparan **dos comunas**. Si alguno de los dos barrios no está en la tabla, esa señal
   no suma: no se inventa la comuna ni se compara el texto crudo.

   #### `multi_figura` no es ambigüedad

   Si el texto del evento menciona **dos o más figuras conocidas**, el caso no es "no sé cuál
   es": es **una inscripción compartida por varias reuniones**. Se marca `multi_figura` y se
   lista en `REVISAR_MATCH` con **todos** los candidatos, no sólo el mejor.

   > **Abierto, decisión de negocio:** cómo se reparten los inscriptos de una inscripción
   > compartida entre las reuniones que la comparten. ¿Se duplica el total en cada una? ¿Se
   > divide? ¿Se asigna a una sola? **No lo resuelve el pipeline por su cuenta.** Hasta que haya
   > una respuesta, estos casos quedan en `REVISAR_MATCH` sin escribir nada.

   #### `REVISAR_MATCH`

   Una fila por cada caso que quedó a mano, con lo necesario para resolverlo sin volver a
   calcular nada: **fila del destino, los candidatos con su score, el margen y el motivo**
   (`margen_chico` o `multi_figura`). Cuando una persona confirma cuál era, **se estampa el
   `RDV_UID`** y el caso no vuelve a aparecer: la próxima corrida entra por uuid.
3. **Clave B→B2 sin métricas**: `normalizeText_(Nombre) + "|" + yyyyMMdd(fecha_fin)`.
   Hoy usa `nombre|inscriptos`. Los inscriptos son finales (el formulario cierra), así que en
   la práctica funciona, pero una métrica no puede formar parte de una clave.
4. **Un solo `toDate_`, un solo `normalizeText_`, un solo `normalizeHeader_`**, en `01_Utils.js`.
   `toDate_` con formato día-primero explícito, nunca `new Date(string)`. Borrar las otras copias.
5. **`SIN_MATCH` visible**: lo que hoy es `skippedB++` pasa a ser una fila con origen, clave
   calculada y motivo.
6. **Sacar `Procesado BF` como flag permanente.** Con clave estable el upsert es idempotente:
   reprocesar escribe el mismo valor en la misma fila. Si preocupa el tiempo de ejecución,
   filtrar por ventana de fecha, no por flag.
7. **Reescribir la columna `Z (ID)`** con formato consistente `Figura - Barrio - dd/MM/yyyy`.
8. **Columnas manuales protegidas.** `00_Config.js` lleva la lista explícita de columnas que el
   equipo carga a mano. **Confirmadas, son seis:**

   ```js
   const COLUMNAS_MANUALES = [
     'Inscriptos', 'Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión'
   ];
   ```

   El pipeline **las lee y nunca las escribe, ni aunque estén vacías.** No es "no pisar": es no
   escribir. Una celda vacía en una columna manual significa que todavía nadie la cargó, y ese
   hueco es información — si el script lo rellena con un cero, el equipo pierde la señal de que
   falta cargarlo.

   Esto es más fuerte que el invariante de la sección 0: `setSiDelSistema_` permitiría escribir
   sobre una celda vacía, y acá ni eso. Las dos reglas conviven — la lista se chequea primero.

   Ojo con `Inscriptos`: es el total que ve la gente y lo escribe una persona, pero el
   desagregado de sexo y edades lo calcula el sistema a partir del `Inscriptos` de B2, que es
   otro número. `DIAG_TOTAL_DIVERGENTE` (Fase 1) mide en cuántas filas no coinciden.

9. **Las once columnas derivadas, bloqueadas por nombre desde `00_Config.js`.**

   ```js
   const COLUMNAS_DERIVADAS = [
     'Día de la semana', '% de Asistencia', 'Direccion2', 'Falta Informacion',
     'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona'
   ];
   ```

   **Nada de `getFormula()` dinámico.** El paso 5 lo usa como guard ([línea 266](Sinc%20Base%20usuario.js#L266))
   y no protege nada: en un bloque expandido por una fórmula de array, la fórmula vive **sólo en
   la celda ancla** — acá, el encabezado de la fila 1. `getFormula()` sobre `X500` devuelve
   cadena vacía, el guard no dispara, el `setValue` entra y rompe el array entero.

   La lista del paso 5 tiene **diez** nombres para once columnas: le falta `Direccion2` (`X`),
   que es justo la que el `getFormula()` tampoco cubre. Es un `#REF!` esperando su turno, si
   `Para Revisar` tiene una columna que normalice a `direccion2` — hay que mirarlo en la
   planilla. Detalle en [docs/sync-bidireccional.md](docs/sync-bidireccional.md).

   Una lista explícita de once nombres es aburrida, verificable de un vistazo y no depende de
   que la API devuelva lo que uno cree. Es todo lo que se necesita.

   **Esto es un puente, no una solución.** La Fase 3 convierte las once columnas en valores
   escritos por el script, y con eso **desaparece la clase entera de problema**: sin fórmulas de
   array no hay bloque que romper, no hay celda ancla, no hay límite en la fila 2374 y la lista
   pasa a ser sólo "columnas que calcula `recalcDerivadas_()`". Por eso **la Fase 3 es
   prerrequisito duro de la Fase 5b**: sacar el staging con las fórmulas todavía puestas es
   poner un upsert nuevo a escribir contra once bombas.

10. **Se elimina el staging.** B2, A2 y el flujo Agenda escriben **directo al destino** a través
   de un único upsert. Con eso:

   - desaparece `Sinc Base usuario.js` entero (433 líneas) y con él la bidireccionalidad, que
     el invariante de la sección 0 prohíbe;
   - queda **una sola clave en juego** en vez de dos (`B2 → Para Revisar` y
     `Para Revisar → destino` hoy calculan la misma clave natural dos veces, con dos copias
     distintas de `toDate_`);
   - el flujo Agenda se redirige al upsert nuevo. El staging es su única dependencia real:
     `agenda_pushReadyToBaseFinal` escribe en `Para Revisar` y nada más.

   `Para Revisar` se renombra **`Para Revisar (legado)`** y queda como archivo de sólo lectura.

   **Confirmada por el diagnóstico del 2026-09-22 (sección 3.2).** La duda era si `Para Revisar`
   guardaba filas que nunca cruzaron al destino: en ese caso habría sido la fuente del backfill
   y no un residuo. **No las guarda.** Tiene 802 claves, las mismas 802 del destino, cero
   duplicadas: es un espejo. Y los pasos 4 y 5 dieron cero cortes, así que tampoco pierde nada.
   La decisión no hay que reabrirla.

   Lo que sí cambió es la **urgencia**: sacar el staging es simplificación, no cura. El hueco no
   está acá. Ver Fase 5b.

   Lo que **no** cambió es el **orden**: Fase 3 → `setSiDelSistema_` (Fase 2) → Fase 5b. Que ya
   no sea urgente no lo vuelve barato.

11. **Avisar, no corregir: `verificarCambiosRecientes_()` en `40_Alertas.js`.**

    Corre **al final del pipeline**. Toma las filas del destino cuya **fecha de reunión** cae
    dentro de los últimos `VENTANA_ALERTA_DIAS` días y compara `Inscriptos`, sexo, edades y los
    cinco canales contra lo que trae B2. Si difieren, escribe una línea en `ALERTA_CAMBIOS`
    (en la intermedia):

    ```
    clave | columna | valor_destino | valor_origen | diferencia | fecha_deteccion
    ```

    **Sólo lectura sobre el destino: no corrige, no escribe, no repinta.** Los números del
    sistema son cerrados (sección 0). Si uno que ya estaba cargado aparece distinto en el
    origen, lo más probable **no** es que el origen tenga la versión buena — es que el origen se
    equivocó. Escribirlo encima **propagaría el error en vez de detectarlo**, y de paso pisaría
    carga del equipo. La alerta existe para que lo mire una persona.

    Es lo que queda en lugar del `onEdit` descartado: aquel escribía formato para habilitar
    escrituras que no hacen falta; este no escribe nada y avisa de lo único que sí importa.

    ```js
    // 00_Config.js
    const VENTANA_ALERTA_DIAS = 15;
    ```

    **La ventana se mide sobre la fecha de la reunión, no sobre cuándo se cargó la fila**,
    porque **no hay ninguna columna con timestamp de carga** ni en el destino ni en B2. Es una
    aproximación conocida: una fila vieja que alguien completa hoy queda fuera de la ventana.
    El día que exista una columna de timestamp, esto debería medirse sobre ella.

    `ALERTA_CAMBIOS` es un log: se acumula, no se limpia, y las alertas repetidas no se vuelven
    a escribir (dedupe por clave + columna + par de valores) para que correr el pipeline todos
    los días no la llene de la misma línea.

    Un detalle que va a cambiar: hoy se saltea el caso "B2 trae 0", porque `num()` convierte
    vacío en cero en todo el legado y los dos casos son indistinguibles (sección 0.a). Cuando la
    Fase 2 haga que vacío se propague como vacío, un 0 real pasa a alertar. Está marcado en el
    código.

### Estructura de archivos

```
00_Config.js       IDs, solapas, COLUMNAS_MANUALES, COLUMNAS_DERIVADAS, VENTANA_ALERTA_DIAS.
                   Único lugar con literales.                                   ← ya escrito
01_Utils.js        toDate_, normalizeText_, normalizeHeader_, findIdxOr_, str, num  (una sola vez)
02_Parsing.js      detectPersona_, detectBarrio_, detectFecha_, mapBarrioCanon_
05_Escritura.js    setSiDelSistema_ y nada más. El único archivo que escribe en el destino.
10_LeerOrigenes.js openById → A2 y B2, con RDV_UID
20_UpsertDestino.js  A2+B2+Agenda → RVD JM-CM - ES, match uuid→natural, SIN_MATCH
30_Derivadas.js    recalcDerivadas_() — las 11 columnas que hoy son fórmulas
40_Agenda.js       flujo Gmail → Agenda → upsert  (rescatado del legado, redirigido)
40_Alertas.js      verificarCambiosRecientes_() → ALERTA_CAMBIOS                ← ya escrito
99_Pipeline.js     orquestador + onOpen() con menú
diagnostico/       reportes de sólo lectura de las Fases 1 y 1b                 ← ya escrito
_archivo/          código muerto, fuera del scope global
```

`00_Config.js` y `40_Alertas.js` **ya están en el repo**, adelantados al resto: la alerta es de
sólo lectura sobre el destino, no depende de nada de la Fase 2 y no rompe nada al convivir con
el legado. **Todavía no están enganchados al pipeline** — `verificarCambiosRecientes_()` se
llama desde `99_Pipeline.js` cuando ese archivo exista, o a mano con `correrAlertaCambios()`.
Sus helpers `_alerta` son provisorios y los reemplaza `01_Utils.js` en la Fase 2.

`05_Escritura.js` está separado a propósito. Que `setSiDelSistema_` viva solo en su archivo
hace que la regla de la sección 0 sea verificable de un vistazo: si `grep -rn "setValue" .`
devuelve algo fuera de ahí que apunte al destino, está mal.

### Qué se archiva

100% comentados: `Back up Agenda traer datos del mail.js`, `Completo Actualizacion sola.js`.
Diagnósticos de una época: `Comparacion.js`, `Test Puntual.js`, `Test claves.js`, `Control.js`,
`Backfill.js`. Forks del mismo upsert: `Con Barrio Sinc A to A2.js`,
`Upset Base FInal solo actualizacion.js`. Sueltos: `Sin título 3.js`, `Barrio desde Base.js`,
`En agenda a Realizada.js`, `Carga Manual persona o barrio por equipo/`.

**Se elimina, no se archiva:** `Sinc Base usuario.js`. Es el paso 5 y con la decisión 10 deja de
tener razón de existir: sincroniza dos hojas cuando va a quedar una sola, y lo hace en las dos
direcciones, que el invariante prohíbe. Queda en git y, leído, en
[docs/sync-bidireccional.md](docs/sync-bidireccional.md) — lo único que hay que llevarse de ahí
es la regla de `#4F81BD`, que ya está en la sección 0. **Se borra en la Fase 5b, no antes.**

Se rescata y reescribe: los tres `detect*_` de `Código.js`, la canonización de `Barrios.js`,
los cinco pasos de `Completo.js`, y el bloque Agenda completo (redirigido al upsert nuevo:
hoy escribe en `Para Revisar` y va a escribir en el destino).

---

## 5. Plan de migración

### Fase 0 — Red de contención
- Rama `migracion`. `main` queda intacto como referencia.
- Copia completa de (1) y (2) en Drive, fechada. **Antes de tocar una sola fórmula.**
- Inventario de los activadores actuales (editor → Activadores): función, tipo, frecuencia,
  dueño. Anotar en `docs/triggers-legado.md`. Todavía no dar de baja nada.

### Fase 1 — Diagnóstico del hueco
`diagnostico/01_hueco_sexo_edades.js`, sólo lectura, cinco solapas de salida en la planilla
intermedia (2). **No escribe ni un valor ni un fondo en el destino.**

- `DIAG_HUECO` — las filas sin sexo/edades contra los **dos saltos**: ¿existe en B2? ¿existe en
  `Para Revisar`? ¿dónde se cortó, en `B2 → PR` o en `PR → destino`? ¿está marcada
  `Procesado BF = TRUE`?
- `DIAG_PISADO` — qué valor de canales traería B2 contra lo que hay hoy en el destino.
- `DIAG_ATOMICIDAD` — `Inscriptos` y canales los carga el usuario y tienen que entrar juntos.
  Mide las filas donde entraron a medias.
- `DIAG_TOTAL_DIVERGENTE` — el total que ve la gente lo escribe el usuario; el desagregado lo
  calcula el sistema sobre el total de B2. Cuenta en cuántas filas no son el mismo número.
- `DIAG_PROCEDENCIA` — cuántas celdas de las seis `COLUMNAS_MANUALES` tienen fondo `#4F81BD`.
  Es la medida directa de cuánto pisó el legado la carga del equipo.

Cada reporte es un entry point ejecutable suelto y lee sólo las solapas que necesita: la primera
corrida murió con `Service Spreadsheets timed out` en el último y se llevó puesto todo lo previo.

**Corrió el 2026-09-22. Resultado en la sección 3.2: el corte está en `B → B2`.** Los pasos 4 y
5 no pierden nada, así que el backfill no es un reproceso del staging — hay que ir a `B` y, si
hace falta, al origen.

### Fase 1b — Dónde se corta `B → B2`  *(en curso)*

`diagnostico/02_corte_B_a_B2.js`, sólo lectura. Busca cada reunión en el import crudo `B` y
clasifica por qué `syncB_to_B2` no generó fila: la persona o el barrio fuera de las listas fijas,
la fecha no parseable o mal parseada, la fila que ya no está en `B`, o la que debería haber
entrado y no entró.

**La población son todas las filas del destino sin contraparte en B2**, no sólo las 72 del hueco.
El recorte por el hueco era operativo y traía un sesgo que apuntaba contra lo que hay que medir:
**las filas viejas ya tienen sexo y edades cargados a mano, así que nunca entran al hueco**, y es
justo ahí donde se manifestaría una ventana móvil del import. Medir sólo el hueco habría dado
`desaparecida_del_origen = 0` por construcción. La columna `origen_fila` separa `hueco` de
`sin_contraparte_B2` y el reporte da el reparto de causa en cada población y en el total.

Suma `DIAG_DUP_B2` con las 14 claves duplicadas. Detalle en
[docs/prompts/PROMPT-02-CORTE-B.md](docs/prompts/PROMPT-02-CORTE-B.md).

`diagScores()` va aparte, y es el insumo de la decisión 2: calcula el score de las **103 filas**
de la población contra todos los candidatos de `B` y vuelca la distribución en `DIAG_SCORES`,
con un barrido de umbrales. **Es lo que convierte `UMBRAL_MATCH` y `MARGEN_MINIMO` de suposición
en número medido.** Sólo lectura, y no estampa ningún `RDV_UID`.

**La pregunta que decide el arreglo:** si `B` es una ventana móvil del origen que deja caer
eventos viejos, ampliar las listas de nombres y barrios no alcanza y **B2 tiene que pasar a ser
acumulativo** en vez de un espejo del import. Las dos ramas y sus costos están en **3.1.f**;
lo esperable es encontrarlas mezcladas.

### Fase 2 — Base limpia
- `00_Config.js` **ya está escrito** (IDs, solapas, `COLUMNAS_MANUALES`, `COLUMNAS_DERIVADAS`,
  `VENTANA_ALERTA_DIAS`); falta `01_Utils.js`, `02_Parsing.js` y `05_Escritura.js`.
- Al escribir `01_Utils.js`, reemplazar los helpers `_alerta` provisorios de `40_Alertas.js`.
- `setSiDelSistema_` escrito y probado **antes** que cualquier cosa que escriba en el destino.
- `num()` deja de convertir vacío en cero: vacío se propaga como vacío (sección 0.a).
- Mover a `_archivo/` todo lo listado arriba y **borrarlo del proyecto de Apps Script** para
  que salga del scope global (queda en git).
- Arreglar `SRC_SHEET = 'A'` → `'Asistentes'`.
- Verificar que `clasp push` no deja duplicados: `grep -c "function toDate_"` debe dar 1.

### Fase 3 — Derivadas a valores

**Es prerrequisito duro de la Fase 5b.** No se saca el staging con las fórmulas de array
todavía puestas: sería poner un upsert nuevo a escribir contra once bloques que se rompen
enteros con un `setValue` mal ubicado. Terminada esta fase, esa clase de problema no existe más.

- Escribir `recalcDerivadas_()` y correrlo **sobre una copia** de (1).
- Comparar columna por columna contra el original. Deben coincidir en las 802 filas.
- Recién ahí: borrar las once fórmulas del original y correr el recálculo.
- El límite de la fila 2374 desaparece con esto.
- `COLUMNAS_DERIVADAS` (decisión 9) deja de ser una lista de cosas prohibidas y pasa a ser la
  lista de lo que calcula `recalcDerivadas_()`. **No se borra del config**: el upsert las sigue
  sin tocar, porque las escribe el recálculo y nadie más.
- Verificar que ninguna quedó con fórmula:
  `getRange(1,1,1,ultimaCol).getFormulas()[0].filter(String)` tiene que dar vacío.

### Fase 4 — Lectura directa y UID
- `10_LeerOrigenes.js` con `openById`.
- Agregar `RDV_UID` a A2, B2 y al destino (columna nueva al final, no intercalada).
- Primera corrida: matchea por clave natural y estampa uuids. Verificar que se estamparon 793.

### Fase 5 — Upsert nuevo
- `20_UpsertDestino.js` con match uuid → natural → `SIN_MATCH`.
- **Toda escritura por `setSiDelSistema_`. Cero `setValue` sueltos.** Revisar el diff con
  `grep -rn "setValue\|setValues" 20_UpsertDestino.js` — tiene que dar cero.
- `COLUMNAS_MANUALES` chequeadas antes que nada: esas seis ni se intentan.
- Correr en seco (modo `DRY_RUN` que sólo llena `SIN_MATCH` y loguea) antes de habilitar escritura.

### Fase 5b — Retiro del staging  *(baja prioridad desde 2026-09-22)*

> **Ya no bloquea nada.** El diagnóstico mostró que el staging no pierde datos: cero cortes en
> los pasos 4 y 5, y `Para Revisar` es un espejo exacto del destino. Sacarlo es **simplificación,
> no cura** — deja el sistema más fácil de entender y le saca una clave de encima, pero no
> recupera ni una fila. El hueco está en `B → B2` (sección 3.2) y ahí va el esfuerzo primero.
>
> El paso 2 de la lista original — "backfillear desde `Para Revisar` lo que nunca cruzó" —
> **queda sin objeto**: no hay nada ahí que el destino no tenga.

Cuando le llegue el turno, el orden sigue siendo obligatorio.

**Prerrequisito duro: la Fase 3 tiene que estar terminada.** Con las once fórmulas de array
todavía puestas, cualquier escritura mal ubicada del upsert nuevo rompe un bloque entero y el
daño es silencioso. Convertidas a valores, esa clase de problema desaparece y el retiro del
staging es un cambio de ruteo y nada más.

**Prerrequisito duro: `setSiDelSistema_` escrito y probado** (Fase 2). El paso 5 protege hoy la
carga manual del destino por accidente, escribiendo sólo sobre celda vacía; si se lo saca sin
el helper, el upsert nuevo hereda el `setIfIndex_` del legado y pisa todo.

1. **Redirigir el flujo Agenda** al upsert nuevo. Es la única dependencia real del staging.
   Verificar con una reunión de prueba de punta a punta antes de seguir.
2. **Apagar el activador del paso 5**, si existe (Fase 0 dice cuál es). Dejar el código.
3. **Correr una semana sin el paso 5** y comparar contra `DIAG_*`. Nada nuevo tiene que faltar.
4. **Renombrar `Para Revisar` → `Para Revisar (legado)`.** El renombre rompe a propósito
   cualquier script que todavía la escriba: si algo se queja, es que quedaba una dependencia.
5. **Borrar `Sinc Base usuario.js`** del proyecto de Apps Script (queda en git).

**No se empieza por el 4 ni por el 5.** Hasta que el punto 3 esté verificado, `Para Revisar` es
la red que atrapa lo que el upsert nuevo deje pasar.

### Fase 6 — Backfill
- Correr el pipeline completo sobre la ventana abril–septiembre 2026.
- Objetivo: las 79 filas sin sexo/edades y las 17 sin inscriptos.
- Verificar contra el conteo de la sección 3.2.
- **El origen del backfill no es `Para Revisar`.** El diagnóstico lo descartó: es un espejo del
  destino y no tiene nada que el destino no tenga. Los datos hay que sacarlos de `B`, y lo que
  ya no esté en `B`, del origen (3) — con la regla dura de la sección 1: se lee, no se modifica.
- Correr con `setSiDelSistema_`: el backfill escribe sobre celdas vacías, que es justo lo que
  son las 79. Ninguna de estas filas debería pisar nada.

### Fase 7 — Activadores
- **Dar de baja todos los activadores viejos** (ahora sí, con el inventario de Fase 0 a mano).
- Crear los nuevos apuntando a `99_Pipeline.js`.
- Agregar `onOpen()` con menú para poder correr a mano sin abrir el editor.
- **Enganchar `verificarCambiosRecientes_()` al final de `99_Pipeline.js`** (decisión 11), después
  del upsert y del recálculo de derivadas. Hasta entonces se corre a mano con
  `correrAlertaCambios()`.
- Revisar `ALERTA_CAMBIOS` la primera semana: si se llena, no es que todo cambió — es que algún
  guard está mal calibrado. Si queda vacía con el pipeline corriendo, tampoco está bien: probar
  a mano moviendo un número en una copia.

> **No lleva `onEdit`.** Estuvo anotado acá y se descartó: ver el recuadro al final de la
> sección 0. Servía sólo para habilitar "vacío o azul" en `setSiDelSistema_`, y eso servía sólo
> para propagar correcciones del origen. El origen no corrige. El aviso de que un número cerrado
> se movió lo da `verificarCambiosRecientes_()` al final del pipeline, sin tocar el destino.

---

## 6. Convenciones

- **Nada de datos reales en el repo.** Es público. `fixtures/` tiene sólo encabezados, en CSV.
  `.gitignore` bloquea `*.xlsx`, `*.xls`, `.clasprc.json` (tiene el token de OAuth) y
  `node_modules/`.
- Un `const` top-level por nombre en todo el proyecto. Antes de `clasp push`, verificar
  que no hay duplicados en el scope global.
- Prefijo numérico en los archivos para fijar el orden de carga.
- Sufijo `_` para funciones internas (convención de Apps Script; no aparecen en el menú de ejecución).
- Fechas siempre a las 12:00 hora local para esquivar DST.
- Toda escritura al destino pasa por el upsert, y dentro del upsert por `setSiDelSistema_`
  (sección 0). Nada de `setValue` / `setValues` sueltos.

### Formato: el color es información, no decoración

**Ninguna operación puede alterar fondos existentes en el destino.** El `#4F81BD` es la marca
de procedencia de la que depende el invariante entero; si se pierde, no hay forma de
reconstruirlo. Además, sólo hay **3 reglas de formato condicional** en `RVD JM-CM - ES` (sobre
la columna `A`, por nombre de figura): **todo el resto del color es estático**, o sea que vive
pegado a la celda y se pierde o se corre con cualquier operación estructural.

Prohibido contra el destino:

| prohibido | por qué | qué usar |
|---|---|---|
| `Sheet.clear()` | borra contenido **y formato** | `clearContents()` |
| `Range.clear()` | ídem | `clearContent()` |
| `sort()` | mueve los valores y deja los fondos quietos: cada celda queda con el color de otra fila | ordenar una copia, o leer a memoria y ordenar ahí |
| `deleteRow()` / `deleteRows()` | desplaza todo lo de abajo contra fondos que no se mueven igual | marcar la fila, no borrarla |
| `insertRow*()` en el medio | ídem | `appendRow` / escribir después de la última fila |
| `setBackground` con cualquier color que no sea `#4F81BD` | pisa la marca de procedencia | sólo `setSiDelSistema_` pinta |

Las tres reglas condicionales de la columna `A` sí se recalculan solas y no hay que preocuparse
por ellas. El problema es el otro 100% del color.

Antes de cualquier operación que toque estructura en el destino: leer los fondos con
`getBackgrounds()`, guardarlos, y verificar después. `DIAG_PROCEDENCIA` hace exactamente esa
lectura y sirve de línea de base.
