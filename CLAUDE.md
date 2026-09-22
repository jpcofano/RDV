# RDV — Reuniones de Vecinos

Proyecto de Google Apps Script que consolida datos de inscriptos y asistentes de las
Reuniones de Vecinos en una planilla única de reporte.

**Estado: en migración.** El código de `main` es el legado auditado en septiembre 2026.
Este documento describe lo que hay, por qué falla y hacia dónde vamos. Leelo entero antes
de tocar nada.

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
4  upsertBaseFinal_A2_B2           Upset Base FInal.js   → 'RVD JM-CM - ES'
5  syncBaseFinal_ParaRevisar_y_RVD Sinc Base usuario.js
```

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
valor a mano, lo pisa con lo que venga de B2 — incluido un cero. Hay que confirmar qué columnas
son manuales y protegerlas explícitamente.

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

```
Hoja1 (1W7mzk) ──openById──► B2 ──┐
                                  ├──► RVD JM-CM - ES ──► recalcDerivadas_()
RDV CONJUNTO (1ZpHO6) ─openById─► A2 ┘         │
                                               └──► SIN_MATCH (lo que no matcheó)

Gmail ──► Agenda (1hP8zMN8) ──► Para Revisar   [flujo aparte, se mantiene]
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
8. **Columnas manuales protegidas.** `00_Config.js` lleva una lista explícita de columnas que el
   equipo carga a mano y que el script **nunca** escribe (canales, y las que se confirmen).
   Ningún `setIfIndex_` puede tocarlas. Regla: si una columna la llena una persona, el pipeline
   la lee pero no la escribe.

### Estructura de archivos

```
00_Config.js       IDs, nombres de solapa, constantes. Único lugar con literales.
01_Utils.js        toDate_, normalizeText_, normalizeHeader_, findIdxOr_, str, num  (una sola vez)
02_Parsing.js      detectPersona_, detectBarrio_, detectFecha_, mapBarrioCanon_
10_LeerOrigenes.js openById → A2 y B2, con RDV_UID
20_UpsertDestino.js  A2+B2 → RVD JM-CM - ES, match uuid→natural, SIN_MATCH
30_Derivadas.js    recalcDerivadas_() — las 11 columnas que hoy son fórmulas
40_Agenda.js       flujo Gmail → Agenda → Para Revisar  (rescatado del legado)
99_Pipeline.js     orquestador + onOpen() con menú
_archivo/          código muerto, fuera del scope global
```

### Qué se archiva

100% comentados: `Back up Agenda traer datos del mail.js`, `Completo Actualizacion sola.js`.
Diagnósticos de una época: `Comparacion.js`, `Test Puntual.js`, `Test claves.js`, `Control.js`,
`Backfill.js`. Forks del mismo upsert: `Con Barrio Sinc A to A2.js`,
`Upset Base FInal solo actualizacion.js`. Sueltos: `Sin título 3.js`, `Barrio desde Base.js`,
`En agenda a Realizada.js`, `Carga Manual persona o barrio por equipo/`.

Se rescata y reescribe: los tres `detect*_` de `Código.js`, la canonización de `Barrios.js`,
los cinco pasos de `Completo.js`, y el bloque Agenda completo.

---

## 5. Plan de migración

### Fase 0 — Red de contención
- Rama `migracion`. `main` queda intacto como referencia.
- Copia completa de (1) y (2) en Drive, fechada. **Antes de tocar una sola fórmula.**
- Inventario de los activadores actuales (editor → Activadores): función, tipo, frecuencia,
  dueño. Anotar en `docs/triggers-legado.md`. Todavía no dar de baja nada.

### Fase 1 — Diagnóstico del hueco
- Script de sólo lectura que cruza las 79 filas sin sexo/edades contra B2 y responde:
  ¿la fila existe en B2? ¿tiene los valores? ¿está marcada `Procesado BF = TRUE`?
- Según el resultado se decide si el backfill es un reproceso o hay que ir al origen.
- **No escribir nada en esta fase.**

### Fase 2 — Base limpia
- `00_Config.js`, `01_Utils.js`, `02_Parsing.js`.
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
- Correr en seco (modo `DRY_RUN` que sólo llena `SIN_MATCH` y loguea) antes de habilitar escritura.

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

- **Nada de datos reales en el repo.** Es público. `fixtures/` tiene sólo encabezados.
  `.gitignore` bloquea `*.xlsx` / `*.xls`.
- Un `const` top-level por nombre en todo el proyecto. Antes de `clasp push`, verificar
  que no hay duplicados en el scope global.
- Prefijo numérico en los archivos para fijar el orden de carga.
- Sufijo `_` para funciones internas (convención de Apps Script; no aparecen en el menú de ejecución).
- Fechas siempre a las 12:00 hora local para esquivar DST.
- Toda escritura al destino pasa por el upsert. Nada de `setValue` sueltos.
