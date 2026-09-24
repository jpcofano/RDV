function syncBarriosFromBaseToAjusteRDV() {
  const TZ = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';

  // === IDs y hojas involucradas ===
  const AJUSTE_SS_ID   = '1hP8zMN8Ep7s1w9zb3Fllix2q_OqIhVwkrED0KCoVh4U'; // archivo de Agenda
  const AJUSTE_SHEET   = 'Ajuste Formularios RDV';

  const BASE_SS_ID     = '1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo'; // archivo Base Final
  const BASE_SHEET     = 'RVD JM-CM - ES';

  // ==== helpers locales simples ====
  const str = v => (v == null ? '' : String(v)).trim();

  function toDateLocal_(v) {
    // usá tu legToDate_ si ya lo tenés en el proyecto
    try {
      if (typeof legToDate_ === 'function') return legToDate_(v);
    } catch (_) {}
    if (v instanceof Date) return new Date(v);
    if (!v) return null;
    // intento parsear string
    const s = String(v).trim();
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function keyPersonaFecha_(persona, fecha) {
    if (!persona || !fecha) return '';
    let normPers = legStr_(persona).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ').trim();

    // si existe legNormalizeText_ en tu proyecto, reusalo
    try {
      if (typeof legNormalizeText_ === 'function') {
        const n2 = legNormalizeText_(persona);
        if (n2) normPers = n2;
      }
    } catch (_) {}

    const ymd = Utilities.formatDate(fecha, TZ, 'yyyyMMdd');
    return `${normPers}|${ymd}`;
  }

  // ============================================================
  // 1) Leer BASE: RVD JM-CM - ES  → mapa (Figura+Fecha) → Barrio
  // ============================================================
  const ssBase = SpreadsheetApp.openById(BASE_SS_ID);
  const shBase = ssBase.getSheetByName(BASE_SHEET);
  if (!shBase) throw new Error(`No existe la hoja "${BASE_SHEET}" en la base.`);

  const lastRowBase = shBase.getLastRow();
  const lastColBase = shBase.getLastColumn();
  if (lastRowBase < 2) {
    Logger.log('Base: hoja "RVD JM-CM - ES" sin datos.');
    return;
  }

  const hdrBase = shBase.getRange(1,1,1,lastColBase).getValues()[0];
  const colFiguraBase = hdrBase.indexOf('Figura');
  const colFechaBase  = hdrBase.indexOf('FECHA');
  const colBarrioBase = hdrBase.indexOf('Barrio');

  if (colFiguraBase === -1 || colFechaBase === -1 || colBarrioBase === -1) {
    throw new Error('En "RVD JM-CM - ES" deben existir las columnas "Figura", "FECHA" y "Barrio".');
  }

  const valsBase = shBase.getRange(2,1,lastRowBase-1,lastColBase).getValues();

  const keyToBarrio = new Map(); // clave persona+fecha → barrio

  for (let i = 0; i < valsBase.length; i++) {
    const row = valsBase[i];
    const figura = legStr_(row[colFiguraBase]);
    const fecha  = toDateLocal_(row[colFechaBase]);
    const barrio = legStr_(row[colBarrioBase]);

    if (!figura || !fecha || !barrio) continue;

    const key = keyPersonaFecha_(figura, fecha);
    if (!key) continue;

    // Si hay duplicados, el último pisa al anterior (sencillo y predecible)
    keyToBarrio.set(key, barrio);
  }

  Logger.log(`Base: cargadas ${keyToBarrio.size} combinaciones Figura+Fecha con barrio.`);

  // ============================================================
  // 2) Leer AJUSTE: Ajuste Formularios RDV  y completar Barrio si falta
  // ============================================================
  const ssAj = SpreadsheetApp.openById(AJUSTE_SS_ID);
  const shAj = ssAj.getSheetByName(AJUSTE_SHEET);
  if (!shAj) throw new Error(`No existe la hoja "${AJUSTE_SHEET}" en el archivo de Ajuste.`);

  const lastRowAj = shAj.getLastRow();
  const lastColAj = shAj.getLastColumn();
  if (lastRowAj < 2) {
    Logger.log('Ajuste Formularios RDV: sin datos.');
    return;
  }

  const hdrAj = shAj.getRange(1,1,1,lastColAj).getValues()[0];
  const colPersonaAj = hdrAj.indexOf('Persona'); // columna Persona en Ajuste
  const colBarrioAj  = hdrAj.indexOf('Barrio');
  const colFechaAj   = hdrAj.indexOf('Fecha');

  if (colPersonaAj === -1 || colBarrioAj === -1 || colFechaAj === -1) {
    throw new Error('En "Ajuste Formularios RDV" deben existir las columnas "Persona", "Barrio" y "Fecha".');
  }

  const valsAj = shAj.getRange(2,1,lastRowAj-1,lastColAj).getValues();
  const barriosOut = [];
  let completados = 0;

  for (let i = 0; i < valsAj.length; i++) {
    const row = valsAj[i];
    const persona = legStr_(row[colPersonaAj]);
    const fecha   = toDateLocal_(row[colFechaAj]);
    const barrioActual = legStr_(row[colBarrioAj]);

    let barrioNuevo = barrioActual;

    // Solo intentamos completar cuando en Ajuste falta barrio
    if (!barrioActual && persona && fecha) {
      const key = keyPersonaFecha_(persona, fecha);
      if (key && keyToBarrio.has(key)) {
        barrioNuevo = keyToBarrio.get(key);
        completados++;
      }
    }

    barriosOut.push([barrioNuevo]);
  }

  // Escribir solo la columna Barrio en bloque
  if (barriosOut.length > 0) {
    shAj.getRange(2, colBarrioAj + 1, barriosOut.length, 1).setValues(barriosOut);
  }

  Logger.log(`syncBarriosFromBaseToAjusteRDV: barrios completados = ${completados}`);
}
