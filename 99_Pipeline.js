/**
 * 99_Pipeline.js — el activador del upsert. **LISTO PARA INSTALAR, NO INSTALADO** (04/10).
 *
 * Nada de este archivo corre solo. El activador no existe hasta que el usuario corra
 * `paso24_instalarActivadorCadaHora()` (99_Correr.js), cuando haya confirmado que el legado está
 * apagado. La instalación **se niega** si el destino no es el real o si queda algún activador del legado
 * marcado BORRAR (`activadoresABorrar_`, diagnostico/14_activadores.js; listarlos: paso 23).
 *
 * --- Cuándo corre (02/10, decisión del usuario) ---
 * **Cada 1 hora**, no una vez a las 18:00. Ya no hay restricción de "no antes de las 17": lo que
 * protege las filas del día es la regla `pendiente_barrio` del upsert (00_Config.js): una fila de
 * hoy o de ayer sin barrio en RDV no se escribe y se reevalúa en la corrida siguiente. Así se resuelven
 * los formularios "Comuna 1 Norte/Sur" de una reunión del día (regla 10): cuando el equipo carga los
 * barrios, la subzona decide en la corrida siguiente.
 *
 * --- Qué hace cuando corre ---
 * `upsertDiario` llama a `upsertDestino()`, que **respeta `DRY_RUN`** (con `true` es una corrida en
 * seco más), toma un bloqueo (`LockService`: dos corridas no se pisan) y deja una línea en
 * `REGISTRO_UPSERT` (intermedia): hora, cuántas escribió, pendientes, a revisar, sin match.
 *
 * --- Antes de instalarlo ---
 * Anotarlo en docs/triggers-legado.md (función, frecuencia, dueño), igual que los del legado.
 */

const ACTIVADOR_DIARIO_FUNCION = 'upsertDiario';
const ACTIVADOR_CADA_HORAS = 1;

/** La función que dispara el activador. Respeta DRY_RUN; el bloqueo y el registro los pone el upsert. */
function upsertDiario() {
  Logger.log('upsertDiario: %s h, DRY_RUN = %s', new Date().getHours(), DRY_RUN);
  return upsertDestino();
}

/** Crea el activador (cada ACTIVADOR_CADA_HORAS horas). Si ya existe, no crea otro. */
function instalarActivadorDiario_() {
  // 02/10: no se instala mientras el destino apunte a la copia de prueba. Primero se revierte
  // RDV_HOJA_DESTINO y se verifica la escritura real (docs/ESTADO.md).
  if (RDV_HOJA_DESTINO !== RDV_HOJA_DESTINO_REAL) {
    throw new Error('RDV_HOJA_DESTINO apunta a "' + RDV_HOJA_DESTINO + '", no al destino real. ' +
                    'El activador no se instala hasta revertirla y verificar la escritura real.');
  }
  // 04/10: no se instala con activadores del legado vivos (paso 23 los lista).
  const legado = activadoresABorrar_();
  if (legado.length) {
    throw new Error('Quedan activadores del legado que hay que borrar antes: ' +
                    legado.map(function (x) { return x.fn; }).join(', ') + '. Ver paso23_listarActivadores().');
  }
  const ya = _activadoresDiarios_();
  if (ya.length) {
    Logger.log('Ya hay %s activador(es) de %s: no se crea otro.', ya.length, ACTIVADOR_DIARIO_FUNCION);
    return ya.length;
  }
  ScriptApp.newTrigger(ACTIVADOR_DIARIO_FUNCION).timeBased().everyHours(ACTIVADOR_CADA_HORAS).create();
  Logger.log('Activador creado: %s cada %s hora(s). Anotarlo en docs/triggers-legado.md.',
             ACTIVADOR_DIARIO_FUNCION, ACTIVADOR_CADA_HORAS);
  return 1;
}

/** Borra el activador (todos los que llamen a upsertDiario). No toca ningún otro. */
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
