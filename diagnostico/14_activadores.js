/**
 * diagnostico/14_activadores.js — PASO 23: los activadores instalados (04/10). SÓLO LECTURA.
 *
 * Lista los activadores del proyecto (`ScriptApp.getProjectTriggers()`) y marca cada uno según
 * docs/triggers-legado.md: BORRAR (legado que no tiene que correr), MANTENER, NUEVO (el del pipeline) o
 * DESCONOCIDO. No borra ni crea nada.
 *
 * --- Qué ve y qué no ---
 *   - **Este proyecto es también el del legado**: el código viejo (`main`) y el nuevo (`migracion`) suben
 *     al MISMO proyecto de Apps Script (scriptId de .clasp.json). Los activadores del legado, si quedan,
 *     están acá;
 *   - `getProjectTriggers()` devuelve **sólo los activadores de la cuenta que corre el paso**. Los que haya
 *     creado otra cuenta no aparecen: mirarlos en el editor (Activadores, columna "Propietario");
 *   - otro proyecto (por ejemplo, un script atado a la planilla de Agenda o a la del destino) no se puede
 *     listar desde acá: hay que abrir su editor → Activadores.
 *
 * La misma clasificación la usa la instalación del activador cada hora (`instalarActivadorDiario_`,
 * 99_Pipeline.js): **no se instala mientras haya uno marcado BORRAR**.
 */

/**
 * Las funciones del legado y qué hacer si tienen activador (docs/triggers-legado.md, 04/10).
 * `BORRAR` = no tiene que tener activador. `MANTENER` = puede seguir. `AGENDA` = el flujo Agenda corre a
 * mano; un activador ahí no es del pipeline (Fase 8), no bloquea pero hay que saberlo.
 */
const ACTIVADORES_CONOCIDOS_ = {
  // El pipeline legado: escribe B2 / Para Revisar / el destino con reglas viejas.
  runFullPipelineWithDelays:          { que: 'BORRAR', por: 'orquestador del pipeline legado (Completo.js); el upsert nuevo lo reemplaza' },
  runFullPipelineWithDelays2:         { que: 'BORRAR', por: 'Completo Actualizacion sola.js: archivado, no existe' },
  syncA_to_A2_upsert:                 { que: 'BORRAR', por: 'paso 1 del legado (Sinc A to A2.js)' },
  syncB_to_B2:                        { que: 'BORRAR', por: 'paso 2 del legado (Sync B to B2.js); B2 se elimina' },
  normalizeBarriosToBarrioN_A2B2:     { que: 'BORRAR', por: 'paso 3 del legado (Barrios.js, archivado)' },
  upsertBaseFinal_A2_B2:              { que: 'BORRAR', por: 'paso 4 del legado (Upset Base FInal.js)' },
  runUpsertAndNormalize:              { que: 'BORRAR', por: 'wrapper del paso 4 del legado' },
  syncBaseFinal_ParaRevisar_y_RVD:    { que: 'BORRAR', por: 'paso 5 del legado: ESCRIBE RVD JM-CM - ES sin setSiDelSistema_' },
  syncManualCorrections_B2:           { que: 'BORRAR', por: 'Carga Manual … (archivado): escribía BarrioN en B2' },
  syncBarriosFromBaseToAjusteRDV:     { que: 'BORRAR', por: 'apagado desde el 24/09; alimentaba el circuito de B2 (pendiente de evaluar si alguien usa "Ajuste Formularios RDV": decidirlo antes de reactivarlo)' },
  marcarRevisadaEnOrden:              { que: 'BORRAR', por: 'En agenda a Realizada.js (archivado): reescribe y ORDENA el destino' },
  backfillEtarios_B_to_B2:            { que: 'BORRAR', por: 'diagnóstico de época (Backfill.js, archivado)' },
  backfillEtarios_B2_to_BaseFinal:    { que: 'BORRAR', por: 'diagnóstico de época (Backfill.js, archivado)' },
  compareA2_vs_B2:                    { que: 'BORRAR', por: 'diagnóstico de época (Comparacion.js, archivado)' },
  validateConsistencyA2B2_vs_BaseFinal: { que: 'BORRAR', por: 'diagnóstico de época (Control.js, archivado)' },
  auditClaves_Final_A2_B2:            { que: 'BORRAR', por: 'diagnóstico de época (Test Puntual.js, archivado)' },
  testKeys_A2_B2_toSheet:             { que: 'BORRAR', por: 'diagnóstico de época (Test claves.js, archivado)' },
  fillFechaC_into_A2:                 { que: 'BORRAR', por: 'suelto (Sin título 3.js, archivado)' },
  splitPersonaBarrioFecha:            { que: 'BORRAR', por: 'suelto (Código.js, archivado)' },
  // El flujo Agenda (otro proceso, Fase 8).
  syncAgendaSheetInBaseFromAgenda_2:  { que: 'MANTENER', por: 'Agenda: arma la solapa espejo "Agenda"; no escribe RVD JM-CM - ES' },
  agenda_syncFromEmails:              { que: 'AGENDA', por: 'Agenda: ingesta de Gmail, hoy corre a mano' },
  agenda_pushReadyToBaseFinal:        { que: 'AGENDA', por: 'Agenda: escribe "Para Revisar" (staging), hoy corre a mano' }
};

/** Los activadores del proyecto (de la cuenta que corre), clasificados. Sólo lectura. */
function clasificarActivadores_() {
  return ScriptApp.getProjectTriggers().map(function (t) {
    const fn = t.getHandlerFunction();
    const existe = typeof _globalActivadores_()[fn] === 'function';
    let x = ACTIVADORES_CONOCIDOS_[fn];
    if (fn === ACTIVADOR_DIARIO_FUNCION) x = { que: 'NUEVO', por: 'el activador del pipeline nuevo (99_Pipeline.js)' };
    if (!x) {
      x = existe ? { que: 'DESCONOCIDO', por: 'no está en docs/triggers-legado.md: mirarlo antes de seguir' }
                 : { que: 'BORRAR', por: 'la función no existe en el proyecto: falla en cada disparo' };
    }
    let tipo = '';
    try { tipo = String(t.getEventType()); } catch (e) { tipo = '?'; }
    let fuente = '';
    try { fuente = String(t.getTriggerSource()) + (t.getTriggerSourceId() ? ' ' + t.getTriggerSourceId() : ''); } catch (e) { fuente = '?'; }
    return { fn: fn, que: x.que, por: x.por, existe: existe, tipo: tipo, fuente: fuente, id: t.getUniqueId() };
  });
}

/** El objeto global (las funciones del proyecto), para saber si la función de un activador existe. */
function _globalActivadores_() {
  return typeof globalThis !== 'undefined' ? globalThis : (function () { return this; })();
}

/** Los que hay que borrar (los usa la instalación del activador cada hora). */
function activadoresABorrar_() {
  return clasificarActivadores_().filter(function (x) { return x.que === 'BORRAR'; });
}

function listarActivadores() {
  Logger.log('=== listarActivadores (paso 23) — sólo lectura, no borra ni crea nada ===');
  Logger.log('  proyecto: el mismo del legado (código viejo y nuevo suben al mismo scriptId)');
  Logger.log('  OJO: sólo se ven los activadores de la cuenta que corre este paso. Los de otra cuenta, en el');
  Logger.log('  editor → Activadores (columna "Propietario"). Otro proyecto (un script atado a otra planilla) no');
  Logger.log('  se puede listar desde acá.');
  const lista = clasificarActivadores_();
  Logger.log('--- activadores instalados (de esta cuenta): %s ---', lista.length);
  lista.forEach(function (x) {
    Logger.log('  [%s] %s | %s | %s%s — %s', x.que, x.fn, x.tipo, x.fuente, x.existe ? '' : ' | LA FUNCIÓN NO EXISTE', x.por);
  });
  const borrar = lista.filter(function (x) { return x.que === 'BORRAR'; });
  const desc = lista.filter(function (x) { return x.que === 'DESCONOCIDO'; });
  const nuevo = lista.filter(function (x) { return x.que === 'NUEVO'; });
  Logger.log('--- resumen ---');
  Logger.log('  a BORRAR: %s%s', borrar.length, borrar.length ? ' → ' + borrar.map(function (x) { return x.fn; }).join(', ') +
             ' (en el editor: Activadores → los tres puntos → Borrar activador)' : '');
  Logger.log('  desconocidos: %s%s', desc.length, desc.length ? ' → ' + desc.map(function (x) { return x.fn; }).join(', ') : '');
  Logger.log('  el del pipeline nuevo (%s): %s', ACTIVADOR_DIARIO_FUNCION, nuevo.length ? 'INSTALADO' : 'no instalado');
  Logger.log(borrar.length ? '>>> Hay activadores del legado: el activador cada hora NO se instala hasta borrarlos.'
                           : '>>> Ningún activador del legado a borrar (de esta cuenta). Si el editor no muestra otros de otra cuenta, ' +
                             'se puede instalar el activador cada hora (paso 24).');
  return { total: lista.length, borrar: borrar.map(function (x) { return x.fn; }),
           desconocidos: desc.map(function (x) { return x.fn; }), nuevoInstalado: nuevo.length > 0 };
}
