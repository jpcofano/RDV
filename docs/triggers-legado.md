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

| función | tipo | frecuencia | dueño | última modificación |
|---|---|---|---|---|
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |

Referencia de columnas:

- **función** — nombre exacto como figura en el activador.
- **tipo** — `temporizador` / `al abrir` / `al editar` / `al enviar formulario`.
- **frecuencia** — `cada hora`, `diario 6-7am`, `cada 15 min`, etc.
- **dueño** — la cuenta de Google bajo la que corre. Importa: un activador corre con los
  permisos de quien lo creó, y si esa persona pierde acceso a alguna de las cuatro planillas,
  el activador falla en silencio.
- **última modificación** — si no se sabe, poner `?`.

## Funciones candidatas a estar enganchadas

Lista de los puntos de entrada públicos que hay hoy en el proyecto, para cotejar contra lo
que aparezca en la UI. Que una función esté acá **no** significa que tenga activador.

| función | archivo | nota |
|---|---|---|
| `runFullPipelineWithDelays` | `Completo.js` | orquestador de los 5 pasos |
| `syncA_to_A2_upsert` | `Sinc A to A2.js` | paso 1 — **roto**, ver CLAUDE.md 3.1.a |
| `syncB_to_B2` | `Sync B to B2.js` | paso 2 |
| `normalizeBarriosToBarrioN_A2B2` | `Barrios.js` | paso 3 |
| `upsertBaseFinal_A2_B2` | `Upset Base FInal.js` | paso 4 |
| `runUpsertAndNormalize` | `Upset Base FInal.js` | wrapper con lock del paso 4 |
| `syncBaseFinal_ParaRevisar_y_RVD` | `Sinc Base usuario.js` | paso 5 |
| `agenda_syncFromEmails` | `Agenda traer datos del mail.js` | flujo Agenda — **no romper** |
| `agenda_pushReadyToBaseFinal` | `Agenda push a base.js` | flujo Agenda — **no romper** |
| `syncAgendaSheetInBaseFromAgenda_2` | `Solapa agenda base final.js` | flujo Agenda |
| `marcarRevisadaEnOrden` | `En agenda a Realizada.js` | suelto |
| `runFullPipelineWithDelays2` | `Completo Actualizacion sola.js` | **no existe en runtime**: el archivo está 100% comentado |
| `backfillEtarios_B_to_B2` | `Backfill.js` | diagnóstico de época |
| `backfillEtarios_B2_to_BaseFinal` | `Backfill.js` | diagnóstico de época |
| `compareA2_vs_B2` | `Comparacion.js` | diagnóstico de época |
| `validateConsistencyA2B2_vs_BaseFinal` | `Control.js` | diagnóstico de época |
| `auditClaves_Final_A2_B2` | `Test Puntual.js` | diagnóstico de época |
| `testKeys_A2_B2_toSheet` | `Test claves.js` | diagnóstico de época |
| `syncBarriosFromBaseToAjusteRDV` | `Barrio desde Base.js` | suelto |
| `fillFechaC_into_A2` | `Sin título 3.js` | suelto |
| `splitPersonaBarrioFecha` | `Código.js` | suelto |
| `syncManualCorrections_B2` | `Carga Manual persona o barrio por equipo/.js` | suelto |

Si en la UI aparece un activador apuntando a una función que **no** está en esta lista, es
una señal: o quedó de un archivo borrado (falla en cada disparo), o hay código en el
proyecto de Apps Script que nunca se bajó al repo. Anotarlo igual.
