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
veces en `Para Revisar`**. Es una marca de procedencia real, no decoración. **Se mantiene
tal cual: mismo color, misma semántica.** El detalle de cuándo pinta y cuándo no está en
[docs/sync-bidireccional.md](docs/sync-bidireccional.md).

### La regla

Toda escritura al destino pasa por un helper único:

```js
setSiDelSistema_(rango, valor)
```

que escribe **sólo si** la celda está vacía **o** ya tiene fondo `#4F81BD`, y que vuelve a
pintar `#4F81BD` al escribir.

**Celda con valor y sin ese fondo → la escribió una persona. No se toca.**

No hay `setValue` ni `setValues` sueltos contra el destino. Ninguno. Si aparece uno en un
diff, el diff está mal.

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
mata al paso 5 (sección 4, decisión 9).

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

**Riesgo adicional:** el upsert escribe las columnas de canales sin condición
(`setIfIndex_(dest, dRow, D.Mail, mail)`). Si el pipeline corre después de que alguien cargó un
valor a mano, lo pisa con lo que venga de B2 — incluido un cero.

> **Corrección (post-lectura del paso 5).** Ese pisado **hoy se detiene en `Para Revisar`**.
> El paso 4 escribe los ceros de B2 en el staging sin preguntar, pero el paso 5 sólo completa
> celdas **vacías** del destino, así que el trabajo manual de `RVD JM-CM - ES` está protegido
> — por accidente de esa regla, no por diseño, y nadie lo escribió en ningún lado.
>
> La consecuencia es incómoda: **sacar el staging (decisión 9) es exactamente el cambio que
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
- `detectFecha_` toma el primer `d/m` del texto libre: `"Reunión 10-12 hs"` devuelve
  **10 de diciembre**, y pasa la validación. Hay que exigir contexto de fecha.
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

9. **Se elimina el staging.** B2, A2 y el flujo Agenda escriben **directo al destino** a través
   de un único upsert. Con eso:

   - desaparece `Sinc Base usuario.js` entero (433 líneas) y con él la bidireccionalidad, que
     el invariante de la sección 0 prohíbe;
   - queda **una sola clave en juego** en vez de dos (`B2 → Para Revisar` y
     `Para Revisar → destino` hoy calculan la misma clave natural dos veces, con dos copias
     distintas de `toDate_`);
   - el flujo Agenda se redirige al upsert nuevo. El staging es su única dependencia real:
     `agenda_pushReadyToBaseFinal` escribe en `Para Revisar` y nada más.

   `Para Revisar` se renombra **`Para Revisar (legado)`** y queda como archivo de sólo lectura.

   **Orden obligatorio: no se toca hasta que haya corrido el diagnóstico de la Fase 1.**
   `Para Revisar` es evidencia. Si tiene filas que nunca cruzaron al destino (la regla 2 del
   paso 5 las reporta y las descarta), esas filas son **la fuente del backfill de la Fase 6**,
   no un residuo. Borrarlo antes de medirlo es destruir el dato que estamos buscando.

### Estructura de archivos

```
00_Config.js       IDs, nombres de solapa, constantes, COLUMNAS_MANUALES. Único lugar con literales.
01_Utils.js        toDate_, normalizeText_, normalizeHeader_, findIdxOr_, str, num  (una sola vez)
02_Parsing.js      detectPersona_, detectBarrio_, detectFecha_, mapBarrioCanon_
05_Escritura.js    setSiDelSistema_ y nada más. El único archivo que escribe en el destino.
10_LeerOrigenes.js openById → A2 y B2, con RDV_UID
20_UpsertDestino.js  A2+B2+Agenda → RVD JM-CM - ES, match uuid→natural, SIN_MATCH
30_Derivadas.js    recalcDerivadas_() — las 11 columnas que hoy son fórmulas
40_Agenda.js       flujo Gmail → Agenda → upsert  (rescatado del legado, redirigido)
99_Pipeline.js     orquestador + onOpen() con menú
_archivo/          código muerto, fuera del scope global
```

`05_Escritura.js` está separado a propósito. Que `setSiDelSistema_` viva solo en su archivo
hace que la regla de la sección 0 sea verificable de un vistazo: si `grep -rn "setValue" .`
devuelve algo fuera de ahí que apunte al destino, está mal.

### Qué se archiva

100% comentados: `Back up Agenda traer datos del mail.js`, `Completo Actualizacion sola.js`.
Diagnósticos de una época: `Comparacion.js`, `Test Puntual.js`, `Test claves.js`, `Control.js`,
`Backfill.js`. Forks del mismo upsert: `Con Barrio Sinc A to A2.js`,
`Upset Base FInal solo actualizacion.js`. Sueltos: `Sin título 3.js`, `Barrio desde Base.js`,
`En agenda a Realizada.js`, `Carga Manual persona o barrio por equipo/`.

**Se elimina, no se archiva:** `Sinc Base usuario.js`. Es el paso 5 y con la decisión 9 deja de
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

Según el resultado se decide si el backfill es un reproceso o hay que ir al origen.
**Nada de la Fase 5b se toca hasta que estas cinco solapas existan.**

### Fase 2 — Base limpia
- `00_Config.js` (con `COLUMNAS_MANUALES`), `01_Utils.js`, `02_Parsing.js`, `05_Escritura.js`.
- `setSiDelSistema_` escrito y probado **antes** que cualquier cosa que escriba en el destino.
- `num()` deja de convertir vacío en cero: vacío se propaga como vacío (sección 0.a).
- Mover a `_archivo/` todo lo listado arriba y **borrarlo del proyecto de Apps Script** para
  que salga del scope global (queda en git).
- Arreglar `SRC_SHEET = 'A'` → `'Asistentes'`.
- Verificar que `clasp push` no deja duplicados: `grep -c "function toDate_"` debe dar 1.

### Fase 3 — Derivadas a valores
- Escribir `recalcDerivadas_()` y correrlo **sobre una copia** de (1).
- Comparar columna por columna contra el original. Deben coincidir en las 802 filas.
- Recién ahí: borrar las once fórmulas del original y correr el recálculo.
- El límite de la fila 2374 desaparece con esto.

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

### Fase 5b — Retiro del staging

Orden obligatorio. Cada paso depende del anterior.

1. **Confirmar que la Fase 1 corrió** y que `DIAG_HUECO` tiene la columna `existe_en_PR`
   poblada. Sin eso no se sabe qué hay en `Para Revisar` que no esté en el destino.
2. **Backfillear desde `Para Revisar` lo que nunca cruzó.** Las filas que el paso 5 venía
   reportando como "Solo en Para Revisar" y descartando (regla 2) son datos reales que nunca
   llegaron. Entran por el upsert nuevo, con `setSiDelSistema_`, como cualquier otro origen.
3. **Redirigir el flujo Agenda** al upsert nuevo. Es la única dependencia real del staging.
   Verificar con una reunión de prueba de punta a punta antes de seguir.
4. **Apagar el activador del paso 5**, si existe (Fase 0 dice cuál es). Dejar el código.
5. **Correr una semana sin el paso 5** y comparar contra `DIAG_*`. Nada nuevo tiene que faltar.
6. **Renombrar `Para Revisar` → `Para Revisar (legado)`.** El renombre rompe a propósito
   cualquier script que todavía la escriba: si algo se queja, es que quedaba una dependencia.
7. **Borrar `Sinc Base usuario.js`** del proyecto de Apps Script (queda en git).

**No se empieza por el 6 ni por el 7.** `Para Revisar` es evidencia hasta que el punto 2 esté
hecho y verificado.

### Fase 6 — Backfill
- Correr el pipeline completo sobre la ventana abril–septiembre 2026.
- Objetivo: las 79 filas sin sexo/edades y las 17 sin inscriptos.
- Verificar contra el conteo de la sección 3.2.

### Fase 7 — Activadores
- **Dar de baja todos los activadores viejos** (ahora sí, con el inventario de Fase 0 a mano).
- Crear los nuevos apuntando a `99_Pipeline.js`.
- Agregar `onOpen()` con menú para poder correr a mano sin abrir el editor.

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
