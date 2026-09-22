/* 
//  Pipeline completo:
 // 1) Actualiza A2 desde A  (syncA_to_A2_upsert)
  //2) Actualiza B2 desde B  (syncB_to_B2)
  //3) Upsert a la base final (upsertBaseFinal_A2_B2)
 // 4) Normaliza STATUS REUNIÓN en la base final (runUpsertAndNormalize)
 
 /// Ajustá SLEEP_MS si necesitás más/menos tiempo entre etapas.
 
function runFullPipelineWithDelays2() {
  const SLEEP_MS_BETWEEN = 2000;
  const lock = LockService.getDocumentLock();
  const toast = (m,t='Pipeline',s=5)=>SpreadsheetApp.getActive().toast(m,t,s);

  const t0 = new Date();
  try {
    lock.waitLock(30*1000);

    if (typeof syncA_to_A2_upsert !== 'function') throw new Error('Falta syncA_to_A2_upsert()');
    if (typeof syncB_to_B2 !== 'function')        throw new Error('Falta syncB_to_B2()');
    if (typeof upsertBaseFinal_A2_B2soloact !== 'function') throw new Error('Falta upsertBaseFinal_A2_B2()');
    //if (typeof normalizeStatusesInBaseFinal !== 'function') throw new Error('Falta normalizeStatusesInBaseFinal()');

    // 1) A → A2
    toast('Actualizando A2 desde A…','Paso 1/5');
    syncA_to_A2_upsert(); SpreadsheetApp.flush(); Utilities.sleep(SLEEP_MS_BETWEEN);

    // 2) B → B2
    toast('Actualizando B2 desde B…','Paso 2/5');
    syncB_to_B2(); SpreadsheetApp.flush(); Utilities.sleep(SLEEP_MS_BETWEEN);

        // 3) Normalizar Barrios en A2/B2 → escribir en BarrioN
    toast('Normalizando barrios (Barrio → BarrioN) en A2/B2…','Paso 3/5');
    normalizeBarriosToBarrioN_A2B2();
    SpreadsheetApp.flush();
    Utilities.sleep(SLEEP_MS_BETWEEN);


    // 4) Upsert a Base Final
    toast('Upsert en Base Final…','Paso 4/5');
    upsertBaseFinal_A2_B2(); SpreadsheetApp.flush(); Utilities.sleep(SLEEP_MS_BETWEEN);

   // // 5) Normalizar STATUS en Base Final
    //toast('Normalizando STATUS en Base Final…','Paso 5/5');
    //normalizeStatusesInBaseFinal(); SpreadsheetApp.flush();
    
    toast(`Pipeline OK (${new Date()-t0} ms)`,'Completado',5);
  } catch(e) {
    toast('ERROR: ' + e, 'Pipeline', 8);
    throw e;
  } finally {
    try { lock.releaseLock(); } catch(_) {}
  }
}
 */