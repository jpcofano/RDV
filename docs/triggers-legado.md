# Inventario de activadores del legado

**Estado: pendiente de completar a mano.**

No hay ningún activador declarado en código (no existe `onOpen()` ni ningún
`ScriptApp.newTrigger(...)` en el repo). Todo lo que corre solo está cargado a mano en la
UI del editor de Apps Script, así que **esta tabla no se puede generar desde el repo**.

Cómo llenarla: editor de Apps Script → panel izquierdo → **Activadores** (ícono de reloj) →
anotar una fila por activador. También conviene mirar **Ejecuciones** para ver cuáles
dispararon de verdad en el último mes y cuáles están muertos.

> ⚠️ Fase 0 es sólo inventario. **No dar de baja nada todavía.** Las bajas son Fase 7,
> recién cuando el pipeline nuevo esté corriendo.

## Activadores

Eran cuatro. **Al 24/09/2026 queda uno activo.**

| función | archivo | estado | tasa de error | tipo | frecuencia | dueño |
|---|---|---|---|---|---|---|
| `syncAgendaSheetInBaseFromAgenda_2` | `Solapa agenda base final.js` | **ACTIVO** | 0,63% | | | |
| `runFullPipelineWithDelays` | `Completo.js` | APAGADO 24/09/2026 | 100% | | | |
| `syncManualCorrections_B2` | `Carga Manual persona o barrio por equipo/.js` | APAGADO 24/09/2026 | 24,22% | | | |
| `syncBarriosFromBaseToAjusteRDV` | `Barrio desde Base.js` | APAGADO 24/09/2026 | **0%** | | | |

Falta completar tipo, frecuencia y dueño de cada uno.

> **El pipeline principal está frenado a propósito.** No es una falla: es un estado elegido
> mientras dura la migración. Ver CLAUDE.md, "El pipeline está frenado". Consecuencia a tener
> presente: **el hueco de sexo/edades no se llena solo hasta la Fase 6.**

### Qué sabemos de cada uno

**1. `runFullPipelineWithDelays` — 100% de error.** Muere siempre en el paso 1 de 5:
`Sinc A to A2.js:3` busca la solapa `'A'` y se llama `Asistentes` (CLAUDE.md 3.1.a).
**Consecuencia: B2 no se está actualizando.**

> ⚠️ **Este activador hay que apagarlo ANTES de arreglar `SRC_SHEET`, no después.** Hoy es
> inofensivo porque falla. El arreglo lo despierta, y lo despierta sobre meses de datos
> acumulados, con el upsert legado que todavía no tiene `setSiDelSistema_`.

**2. `syncManualCorrections_B2` — 24,22% de error.** Uno de cada cuatro disparos. Análisis en
CLAUDE.md 3.6: depende de `mapBarrioCanon_`, que tiene **dos implementaciones distintas** en el
proyecto, y borra filas invalidando su propio índice a mitad del loop. Escribe `BarrioN` en B2,
que es la mitad de la clave natural.

**3. `syncAgendaSheetInBaseFromAgenda_2` — 0,63%, el único que queda vivo.** Arma la solapa
espejo `Agenda` dentro de la planilla (1). Es el paso que menos decide de todo el flujo Agenda, y
es el único de los tres que tiene activador: la ingesta desde Gmail y el push a `Para Revisar`
**se ejecutan a mano**. Detalle en [docs/agenda-legado.md](agenda-legado.md).

Ojo con un efecto lateral que su nombre no sugiere: llama a `ensureColumnsExist_` sobre
**`Para Revisar`**, así que puede agregarle columnas a la solapa de staging.

**4. `syncBarriosFromBaseToAjusteRDV` — 0% de error. PENDIENTE DE EVALUAR, no de baja.**

Venía funcionando sin fallar una sola vez, así que apagarlo **sacó algo que andaba**. Antes de
darlo de baja definitivo hay que saber qué hacía y quién dependía de eso.

**Qué hace, leído del código** ([Barrio desde Base.js](../Barrio%20desde%20Base.js)):

| | |
|---|---|
| **lee** | `RVD JM-CM - ES` de (1): columnas `Figura`, `FECHA`, `Barrio` |
| **arma** | un mapa `normalizeText(Figura)\|yyyyMMdd(FECHA)` → `Barrio` |
| **escribe** | la columna `Barrio` de `Ajuste Formularios RDV`, en la planilla de Agenda (4) |
| **cuándo escribe** | **sólo donde el barrio de esa hoja está vacío** |
| **cómo** | reescribe la columna entera en bloque, con los valores sin cambiar incluidos |

Tres cosas que importan:

1. **Usa `Figura + Fecha` como clave** — la única clave confirmada como única (CLAUDE.md 1.a).
   Es el único script del legado que ya usa la clave correcta, y encima sin depender del barrio.
2. **Sólo completa lo vacío.** La misma disciplina de `setSiDelSistema_`, sin el pintado.
3. **Cierra un circuito que nadie declaró.** `Ajuste Formularios RDV` es la hoja que lee
   `syncManualCorrections_B2` para escribir `B2.Barrio (manual)` → `B2.BarrioN`. O sea:
   **el barrio del destino vuelve al destino convertido en clave de búsqueda.**

> **Por qué importa haberlo apagado:** ese circuito era lo que mantenía vivo `BarrioN` en B2
> después de que el origen dejara de mandar barrio (CLAUDE.md 3.3.b). Con los dos activadores
> apagados, las filas nuevas de B2 van a quedar sin `BarrioN` y **las 23 claves incompletas
> deberían subir**. Vale la pena medirlo con `diagDupB2()` en unas semanas: confirma que el
> circuito estaba haciendo ese trabajo.

**La pregunta que no se contesta leyendo código:** ¿quién mira `Ajuste Formularios RDV`? Si hay
gente que corrige datos ahí, el barrio prellenado les ahorraba trabajo y hay que reemplazarlo por
otra cosa antes de dar el activador de baja definitiva. Opinión sobre el rediseño en
[docs/agenda-legado.md](agenda-legado.md), punto 5.

### Y uno que NO tiene activador

`marcarRevisadaEnOrden` (`En agenda a Realizada.js`) **no tiene**, verificado. Nunca corrió
contra el destino y las once fórmulas de array están intactas. Sigue siendo riesgo latente
—reescribe la planilla entera y la ordena (CLAUDE.md 3.1.g)— pero no hay nada que apagar.
**No ejecutarla a mano desde el editor.**

Referencia de columnas:

- **función** — nombre exacto como figura en el activador.
- **tipo** — `temporizador` / `al abrir` / `al editar` / `al enviar formulario`.
- **frecuencia** — `cada hora`, `diario 6-7am`, `cada 15 min`, etc.
- **dueño** — la cuenta de Google bajo la que corre. Importa: un activador corre con los
  permisos de quien lo creó, y si esa persona pierde acceso a alguna de las cuatro planillas,
  el activador falla en silencio.
- **última modificación** — si no se sabe, poner `?`.

## Funciones candidatas a estar enganchadas

Lista de los puntos de entrada públicos que hay hoy en el proyecto. Las cuatro con activador
están arriba; **las de esta tabla que no figuran ahí no tienen.**

Vale al revés también, y es la lección que dejó este relevamiento: que el código no llame a una
función **no** la vuelve huérfana. Tres de los cuatro activadores apuntan a archivos que ninguna
función del proyecto invoca, y por eso estaban mal marcados para archivar.

| función | archivo | nota |
|---|---|---|
| `runFullPipelineWithDelays` | `Completo.js` | **ACTIVADOR** · 100% error · orquestador de los 5 pasos |
| `syncA_to_A2_upsert` | `Sinc A to A2.js` | paso 1 — **roto**, ver CLAUDE.md 3.1.a |
| `syncB_to_B2` | `Sync B to B2.js` | paso 2 |
| `normalizeBarriosToBarrioN_A2B2` | `Barrios.js` | paso 3 |
| `upsertBaseFinal_A2_B2` | `Upset Base FInal.js` | paso 4 |
| `runUpsertAndNormalize` | `Upset Base FInal.js` | wrapper con lock del paso 4 |
| `syncBaseFinal_ParaRevisar_y_RVD` | `Sinc Base usuario.js` | paso 5 |
| `agenda_syncFromEmails` | `Agenda traer datos del mail.js` | flujo Agenda — **no romper** |
| `agenda_pushReadyToBaseFinal` | `Agenda push a base.js` | flujo Agenda — **no romper** |
| `syncAgendaSheetInBaseFromAgenda_2` | `Solapa agenda base final.js` | **ACTIVADOR** · flujo Agenda |
| `marcarRevisadaEnOrden` | `En agenda a Realizada.js` | sin activador · **no ejecutar a mano** |
| `runFullPipelineWithDelays2` | `Completo Actualizacion sola.js` | **no existe en runtime**: el archivo está 100% comentado |
| `backfillEtarios_B_to_B2` | `Backfill.js` | diagnóstico de época |
| `backfillEtarios_B2_to_BaseFinal` | `Backfill.js` | diagnóstico de época |
| `compareA2_vs_B2` | `Comparacion.js` | diagnóstico de época |
| `validateConsistencyA2B2_vs_BaseFinal` | `Control.js` | diagnóstico de época |
| `auditClaves_Final_A2_B2` | `Test Puntual.js` | diagnóstico de época |
| `testKeys_A2_B2_toSheet` | `Test claves.js` | diagnóstico de época |
| `syncBarriosFromBaseToAjusteRDV` | `Barrio desde Base.js` | **ACTIVADOR** · no era suelto |
| `fillFechaC_into_A2` | `Sin título 3.js` | suelto |
| `splitPersonaBarrioFecha` | `Código.js` | suelto |
| `syncManualCorrections_B2` | `Carga Manual persona o barrio por equipo/.js` | **ACTIVADOR** · 24,22% error |

Si en la UI aparece un activador apuntando a una función que **no** está en esta lista, es
una señal: o quedó de un archivo borrado (falla en cada disparo), o hay código en el
proyecto de Apps Script que nunca se bajó al repo. Anotarlo igual.
