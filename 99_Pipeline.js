/**
 * 99_Pipeline.js — el activador diario del upsert. **PREPARADO, NO INSTALADO** (01/10).
 *
 * Nada de este archivo corre solo. El activador no existe hasta que alguien llame a
 * `instalarActivadorDiario_()`, y eso no lo hace ningún código: las dos funciones de gestión
 * terminan en `_`, así que no aparecen en el desplegable del editor. Para usarlas, descomentar los
 * wrappers `fase7_…` al final de `99_Correr.js` (y volver a comentarlos después).
 *
 * --- La regla operativa (01/10, CLAUDE.md Fase 7) ---
 * El match del día corre **después de las 17**: los formularios se cierran y los barrios de RDV se
 * cargan a lo largo del día. El activador va a las **18:00** (hora del proyecto,
 * America/Argentina/Buenos_Aires, appsscript.json), y `upsertDiario` igual se niega a correr antes
 * de las 17 por si alguien lo dispara a mano o el activador se corre de hora.
 *
 * --- Qué hace cuando corre ---
 * `upsertDiario` llama a `upsertDestino()`, que **respeta `DRY_RUN`**: con `DRY_RUN = true` es una
 * corrida en seco más (escribe los tres reportes en la intermedia, no toca el destino). Pasar a
 * `DRY_RUN = false` lo decide el usuario (docs/ESTADO.md, 1b).
 *
 * --- Antes de instalarlo ---
 * Anotarlo en docs/triggers-legado.md (función, hora, dueño), igual que los activadores del legado.
 */

const ACTIVADOR_DIARIO_FUNCION = 'upsertDiario';
const ACTIVADOR_DIARIO_HORA = 18;       // nunca antes de las 17
const ACTIVADOR_DIARIO_HORA_MINIMA = 17;

/** La función que dispara el activador. Respeta DRY_RUN y no corre antes de las 17. */
function upsertDiario() {
  const hora = new Date().getHours();
  if (hora < ACTIVADOR_DIARIO_HORA_MINIMA) {
    Logger.log('upsertDiario: son las %s; no corre antes de las %s (regla operativa del 01/10).',
               hora, ACTIVADOR_DIARIO_HORA_MINIMA);
    return null;
  }
  Logger.log('upsertDiario: %s h, DRY_RUN = %s', hora, DRY_RUN);
  return upsertDestino();
}

/** Crea el activador diario de las 18:00. Si ya existe, no crea otro. */
function instalarActivadorDiario_() {
  const ya = _activadoresDiarios_();
  if (ya.length) {
    Logger.log('Ya hay %s activador(es) de %s: no se crea otro.', ya.length, ACTIVADOR_DIARIO_FUNCION);
    return ya.length;
  }
  ScriptApp.newTrigger(ACTIVADOR_DIARIO_FUNCION)
    .timeBased().everyDays(1).atHour(ACTIVADOR_DIARIO_HORA).nearMinute(0).create();
  Logger.log('Activador creado: %s todos los días a las %s:00 (hora del proyecto). Anotarlo en ' +
             'docs/triggers-legado.md.', ACTIVADOR_DIARIO_FUNCION, ACTIVADOR_DIARIO_HORA);
  return 1;
}

/** Borra el activador diario (todos los que llamen a upsertDiario). No toca ningún otro. */
function borrarActivadorDiario_() {
  const ya = _activadoresDiarios_();
  ya.forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('Borrados %s activador(es) de %s. Los demás activadores del proyecto no se tocaron.',
             ya.length, ACTIVADOR_DIARIO_FUNCION);
  return ya.length;
}

function _activadoresDiarios_() {
  return ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === ACTIVADOR_DIARIO_FUNCION;
  });
}
