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

**Son cuatro.** Relevados desde el editor el 2026-09-24. Falta completar tipo, frecuencia, dueño
y última modificación de cada uno.

| # | función | archivo | tasa de error | tipo | frecuencia | dueño | última mod. |
|---|---|---|---|---|---|---|---|
| 1 | `runFullPipelineWithDelays` | `Completo.js` | **100%** | | | | |
| 2 | `syncManualCorrections_B2` | `Carga Manual persona o barrio por equipo/.js` | **24,22%** | | | | |
| 3 | `syncAgendaSheetInBaseFromAgenda_2` | `Solapa agenda base final.js` | *(pendiente)* | | | | |
| 4 | `syncBarriosFromBaseToAjusteRDV` | `Barrio desde Base.js` | *(pendiente)* | | | | |

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

**3 y 4.** Falta la tasa de error. Los dos estaban marcados para archivar por error —
ver "Lo que NO se archiva" en CLAUDE.md sección 4.

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
