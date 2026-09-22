/** == Helper de logging ============================================== */
const DEBUG_PIPELINE = true;  // poné false si querés silenciar

function _log(...args) {
  const msg = args.map(x => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ');
  if (DEBUG_PIPELINE) {
    console.log(msg);     // visible en Ver → Registros y Ejecuciones
    Logger.log(msg);      // idem
  }
}

function runStep(name, fn) {
  const t0 = Date.now();
  _log(`▶ ${name} :: start`);
  try {
    const out = fn();
    SpreadsheetApp.flush();
    const dt = Date.now() - t0;
    _log(`✓ ${name} :: ok (${dt} ms)`);
    return out;
  } catch (e) {
    const dt = Date.now() - t0;
    _log(`✗ ${name} :: ERROR tras ${dt} ms :: ${e && e.message}`, e && e.stack);
    throw e; // re-lanzamos para que la ejecución muestre “Failed”
  }
}

function runFullPipelineWithDelays() {
  const SLEEP_MS_BETWEEN = 2000;
  const lock = LockService.getDocumentLock();
  const toast = (m,t='Pipeline',s=5)=>SpreadsheetApp.getActive().toast(m,t,s);
  const t0 = Date.now();

  try {
    lock.waitLock(30*1000);

    // Verificaciones de existencia de funciones
    if (typeof syncA_to_A2_upsert !== 'function')
      throw new Error('Falta syncA_to_A2_upsert()');
    if (typeof syncB_to_B2 !== 'function')
      throw new Error('Falta syncB_to_B2()');
    if (typeof upsertBaseFinal_A2_B2 !== 'function')
      throw new Error('Falta upsertBaseFinal_A2_B2()');
    if (typeof normalizeBarriosToBarrioN_A2B2 !== 'function')
      throw new Error('Falta normalizeBarriosToBarrioN_A2B2()');
    if (typeof syncBaseFinal_ParaRevisar_y_RVD !== 'function')
      throw new Error('Falta syncBaseFinal_ParaRevisar_y_RVD()');

    // Paso 1: A → A2
    toast('Actualizando A2 desde A…','Paso 1/5');
    runStep('syncA_to_A2_upsert', syncA_to_A2_upsert);
    Utilities.sleep(SLEEP_MS_BETWEEN);

    // Paso 2: B → B2
    toast('Actualizando B2 desde B…','Paso 2/5');
    runStep('syncB_to_B2', syncB_to_B2);
    Utilities.sleep(SLEEP_MS_BETWEEN);

    // Paso 3: Normalizar barrios A2/B2
    toast('Normalizando barrios (Barrio → BarrioN) en A2/B2…','Paso 3/5');
    runStep('normalizeBarriosToBarrioN_A2B2', normalizeBarriosToBarrioN_A2B2);
    Utilities.sleep(SLEEP_MS_BETWEEN);

    // Paso 4: Upsert Base Final desde A2/B2
    toast('Upsert en Base Final…','Paso 4/5');
    runStep('upsertBaseFinal_A2_B2', upsertBaseFinal_A2_B2);
    Utilities.sleep(SLEEP_MS_BETWEEN);

    // Paso 5: Sincronizar Para Revisar ↔ hoja de trabajo del usuario
    toast('Sincronizando Para Revisar con RVD JM-CM - ES…','Paso 5/5');
    runStep('syncBaseFinal_ParaRevisar_y_RVD', syncBaseFinal_ParaRevisar_y_RVD);
    Utilities.sleep(SLEEP_MS_BETWEEN);

    const totalMs = Date.now() - t0;
    _log(`Pipeline OK (${totalMs} ms)`);
    toast(`Pipeline OK (${totalMs} ms)`,'Completado',5);

  } catch(e) {
    _log('Pipeline ERROR:', e && e.message, e && e.stack);
    toast('ERROR: ' + e, 'Pipeline', 8);
    throw e;
  } finally {
    try { lock.releaseLock(); } catch(_) {}
  }
}
