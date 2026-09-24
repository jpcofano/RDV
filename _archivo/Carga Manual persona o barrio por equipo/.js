/***** CONFIG *****/
const MANUAL_SPREADSHEET_ID = '1hP8zMN8Ep7s1w9zb3Fllix2q_OqIhVwkrED0KCoVh4U';
const MANUAL_SHEET_NAME     = 'Ajuste Formularios RDV';
const MANUAL_APPLIED_SHEET  = 'Ajustes Aplicados';

/**
 * Sincroniza B2 con la hoja externa de ajustes:
 * - Detecta faltantes (Persona/Barrio/Fecha) con prioridad manual y fallback BarrioN→Barrio.
 * - Exporta a la hoja externa con upsert: ahora rellena Persona si ya existe en B2; NO rellena Barrio.
 * - Importa solo si el manual agrega valor; si trae Barrio (manual), normaliza y escribe BarrioN.
 * - Mueve aplicados a “Ajustes Aplicados”.
 */
function syncManualCorrections_B2() {
  const ss  = SpreadsheetApp.getActive();
  const shB = ss.getSheetByName('B2');
  if (!shB) throw new Error('No existe la hoja B2');

  // ---- B2: headers & indices
  const bHdr = shB.getRange(1,1,1,shB.getLastColumn()).getValues()[0];
  const idxB = (names, opt=false) => findIdxOr_(bHdr, names, opt);
  const iID      = idxB(['id']);
  const iNombre  = idxB(['nombre']);
  const iPers    = idxB(['persona']);
  let   iBarrN   = idxB(['barrion'], true);
  const iBarr    = idxB(['barrio'],  true);
  const iFecha   = idxB(['fecha']);
  // manuales (asegurar que existan)
  let iPersM  = idxB(['persona (manual)'], true);
  let iBarrM  = idxB(['barrio (manual)'],  true);
  let iFechaM = idxB(['fecha (manual)'],   true);

  const need = [];
  if (iPersM  == null) need.push('Persona (manual)');
  if (iBarrM  == null) need.push('Barrio (manual)');
  if (iFechaM == null) need.push('Fecha (manual)');
  if (iBarrN  == null) need.push('BarrioN');  // para pegar normalizado
  if (need.length) {
    shB.getRange(1, shB.getLastColumn()+1, 1, need.length).setValues([need]);
    const bHdr2 = shB.getRange(1,1,1,shB.getLastColumn()).getValues()[0];
    iPersM  = bHdr2.indexOf('Persona (manual)');
    iBarrM  = bHdr2.indexOf('Barrio (manual)');
    iFechaM = bHdr2.indexOf('Fecha (manual)');
    iBarrN  = bHdr2.indexOf('BarrioN');
  }

  const rowsB = Math.max(0, shB.getLastRow()-1);
  if (!rowsB) return;
  const dataB = shB.getRange(2,1,rowsB,shB.getLastColumn()).getValues();

  // Map B2: ID -> row
  const idToRowB = new Map();
  for (let i=0;i<dataB.length;i++) {
    const id = str(dataB[i][iID]);
    if (id) idToRowB.set(id, 2+i);
  }

  // ---- Manual sheets
  const manSS  = SpreadsheetApp.openById(MANUAL_SPREADSHEET_ID);
  const manSh  = manSS.getSheetByName(MANUAL_SHEET_NAME) || manSS.insertSheet(MANUAL_SHEET_NAME);
  const applSh = manSS.getSheetByName(MANUAL_APPLIED_SHEET) || manSS.insertSheet(MANUAL_APPLIED_SHEET);

  const MAN_HEADERS = ['ID','Nombre','Persona','Barrio','Fecha'];
  ensureHeaders_(manSh, MAN_HEADERS);
  ensureHeaders_(applSh, MAN_HEADERS);

  const mHdr   = manSh.getRange(1,1,1,manSh.getLastColumn()).getValues()[0];
  const iMID   = mHdr.indexOf('ID')+1;
  const iMNom  = mHdr.indexOf('Nombre')+1;
  const iMPers = mHdr.indexOf('Persona')+1;
  const iMBar  = mHdr.indexOf('Barrio')+1;
  const iMFech = mHdr.indexOf('Fecha')+1;

  // Index manual por ID
  const rowsM = Math.max(0, manSh.getLastRow()-1);
  const valsM = rowsM ? manSh.getRange(2,1,rowsM,manSh.getLastColumn()).getValues() : [];
  const idToRowM = new Map();
  for (let i=0;i<valsM.length;i++) {
    const id = str(valsM[i][iMID-1]);
    if (id) idToRowM.set(id, 2+i);
  }

  /* === 1) EXPORT/UPSERT: detectar faltantes y upsertear en Manual === */
  const toAppend = [];
  let upserts = 0, appends = 0;

  for (let r=0; r<dataB.length; r++) {
    const row = dataB[r];
    const id = str(row[iID]);
    if (!id) continue;

    const nombre     = str(row[iNombre]);
    const personaEff = str(row[iPersM]) || str(row[iPers]);                         // ✔ Persona efectiva
    const barrioEff  = str(row[iBarrM]) || strSafe(row, iBarrN) || strSafe(row, iBarr); // Barrio efectivo
    const fechaEff   = toDate_(row[iFechaM]) || toDate_(row[iFecha]);

    const isMissing = (!personaEff) || (!barrioEff) || (!fechaEff);
    const existsM   = idToRowM.get(id);

    if (isMissing) {
      if (existsM) {
        // ➕ Completo SOLO celdas vacías del manual.
        if (manSh.getRange(existsM, iMID).getValue()   === '') manSh.getRange(existsM, iMID).setValue(id);
        if (manSh.getRange(existsM, iMNom).getValue()  === '') manSh.getRange(existsM, iMNom).setValue(nombre);
        // ✅ AHORA: si Persona en manual está vacía y en B2 sí hay, la copio
        if (manSh.getRange(existsM, iMPers).getValue() === '' && personaEff) manSh.getRange(existsM, iMPers).setValue(personaEff);
        // Fecha ayuda como referencia si está vacía
        if (manSh.getRange(existsM, iMFech).getValue() === '' && fechaEff)   manSh.getRange(existsM, iMFech).setValue(fechaEff);
        // ⚠️ Barrio lo dejamos vacío para que el equipo lo complete y gatille normalización
        upserts++;
      } else {
        // Insertar fila nueva en manual:
        // ✅ Persona va con lo que haya; Barrio lo dejamos vacío; Fecha si hay.
        toAppend.push([id, nombre, personaEff || '', '', fechaEff || '']);
        appends++;
      }
    } else {
      // No hay faltantes; si existe en manual y no agrega cambios, limpiar
      if (existsM) {
        const rowVals = manSh.getRange(existsM, 1, 1, MAN_HEADERS.length).getValues()[0];
        const manPers = str(rowVals[2]);
        const manBarr = str(rowVals[3]);
        const manFech = toDate_(rowVals[4]);

        const addsChange =
          (manPers && manPers !== personaEff) ||
          (manBarr && manBarr !== barrioEff) ||
          (manFech && (!fechaEff || +manFech !== +fechaEff));

        if (!addsChange) {
          const destStart = applSh.getLastRow()+1;
          applSh.getRange(destStart, 1, 1, MAN_HEADERS.length).setValues([rowVals]);
          manSh.deleteRow(existsM);
        }
      }
    }
  }

  if (toAppend.length) {
    const start = manSh.getLastRow()+1;
    manSh.getRange(start, 1, toAppend.length, MAN_HEADERS.length).setValues(toAppend);
    manSh.getRange(start, MAN_HEADERS.indexOf('Fecha')+1, toAppend.length, 1).setNumberFormat('dd/mm/yyyy');
  }

  // Releer manual tras posibles cambios
  const rowsM2 = Math.max(0, manSh.getLastRow()-1);
  const valsM2 = rowsM2 ? manSh.getRange(2,1,rowsM2,manSh.getLastColumn()).getValues() : [];

  /* === 2) IMPORT: aplicar solo si manual agrega valor; normalizar Barrio === */
  const rowsToDelete = [];
  const rowsToArchive = [];

  for (let i=0;i<valsM2.length;i++) {
    const baseRow = 2+i;
    const row = valsM2[i];
    const id = str(row[iMID-1]);
    if (!id) continue;

    const rowB = idToRowB.get(id);
    if (!rowB) continue;

    const bRow = dataB[rowB-2];
    const personaEff = str(bRow[iPersM]) || str(bRow[iPers]);
    const barrioEff  = str(bRow[iBarrM]) || strSafe(bRow, iBarrN) || strSafe(bRow, iBarr);
    const fechaEff   = toDate_(bRow[iFechaM]) || toDate_(bRow[iFecha]);

    const manPers = str(row[iMPers-1]);
    const manBarr = str(row[iMBar-1]);
    const manFech = toDate_(row[iMFech-1]);

    let applied = false;

    if (manPers && manPers !== personaEff) {
      shB.getRange(rowB, iPersM+1).setValue(manPers);
      applied = true;
    }
    if (manBarr && manBarr !== barrioEff) {
      shB.getRange(rowB, iBarrM+1).setValue(manBarr);
      const canon = (typeof mapBarrioCanon_ === 'function') ? mapBarrioCanon_(manBarr) : manBarr;
      if (iBarrN >= 0) shB.getRange(rowB, iBarrN+1).setValue(canon);
      applied = true;
    }
    if (manFech && (!fechaEff || (+manFech !== +fechaEff))) {
      shB.getRange(rowB, iFechaM+1).setValue(manFech);
      applied = true;
    }

    if (applied) {
      rowsToArchive.push(row.slice(0, MAN_HEADERS.length));
      rowsToDelete.push(baseRow);
    }
  }

  if (rowsToArchive.length) {
    const startA = applSh.getLastRow()+1;
    applSh.getRange(startA, 1, rowsToArchive.length, MAN_HEADERS.length).setValues(rowsToArchive);
  }
  if (rowsToDelete.length) {
    rowsToDelete.sort((a,b)=>b-a);
    for (const r of rowsToDelete) manSh.deleteRow(r);
  }

  if (rowsToArchive.length) {
    shB.getRange(2, iFechaM+1, rowsB, 1).setNumberFormat('dd/mm/yyyy');
  }

  SpreadsheetApp.getActive().toast(
    `Sync ajustes: export nuevos ${appends} | upserts ${upserts} | import aplicados ${rowsToArchive.length} (Persona copiada; Barrio manual normalizado a BarrioN)`,
    'syncManualCorrections_B2', 6
  );
}

/* ==== Helpers ==== */
function ensureHeaders_(sheet, headers) {
  const firstRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  let needs = false;
  for (let i = 0; i < headers.length; i++) if (firstRow[i] !== headers[i]) { needs = true; break; }
  if (needs) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}
function findIdxOr_(headers, candidates, optional=false) {
  const norm = headers.map(h => normalizeHeader_(h));
  for (const c of candidates) {
    const i = norm.indexOf(normalizeHeader_(c));
    if (i !== -1) return i;
  }
  if (optional) return null;
  throw new Error('No se encontró alguna de estas columnas: ' + candidates.join(' | ')
    + '\nDisponibles: ' + norm.join(' | '));
}
function normalizeHeader_(s) {
  return String(s || '')
    .replace(/["']/g,'').replace(/\n/g,' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/\s+/g,' ').trim();
}
function toDate_(v) {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12, 0, 0);
  if (v === '' || v == null) return null;
  const m = /^\s*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s*$/.exec(String(v));
  if (m) {
    const d = parseInt(m[1],10), mo = parseInt(m[2],10);
    let y = m[3] ? parseInt(m[3],10) : new Date().getFullYear();
    if (y < 100) y += 2000;
    return new Date(y, mo-1, d, 12, 0, 0);
  }
  const m2 = /^\s*(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})\s*$/.exec(String(v));
  if (m2) {
    const y = parseInt(m2[1],10), mo = parseInt(m2[2],10), d = parseInt(m2[3],10);
    return new Date(y, mo-1, d, 12, 0, 0);
  }
  return null;
}
function str(v){ return v==null ? '' : String(v).trim(); }
function strSafe(row, idx){ return (idx==null || idx<0) ? '' : str(row[idx]); }












/*  CONFIG 
const MANUAL_SPREADSHEET_ID = '1hP8zMN8Ep7s1w9zb3Fllix2q_OqIhVwkrED0KCoVh4U';
const MANUAL_SHEET_NAME     = 'Ajuste Formularios RDV';
const MANUAL_ARCHIVE_SHEET  = 'Ajustes Aplicados';  usado sólo si ARCHIVE_APPLIED = true
const ARCHIVE_APPLIED       = false;  true => mueve aplicados; false => borra


  1) Exportaactualiza en la hoja externa las filas de B2 que
     no tienen Persona o no tienen Barrio (BarrioN vacío).
     - Upsert por ID.
     - No pisa lo que ya completó el equipo.
 
function exportMissingPersonaBarrio_B2_toManualSheet() {
  const ss = SpreadsheetApp.getActive();
  const shB = ss.getSheetByName('B2');
  if (!shB) throw new Error('No existe la hoja B2');

   B2 headers & indices
  const bHdr = shB.getRange(1,1,1,shB.getLastColumn()).getValues()[0];
  const idxB = (names, opt=false) => findIdxOr_(bHdr, names, opt);
  const iID     = idxB(['id']);
  const iNombre = idxB(['nombre']);
  const iPers   = idxB(['persona']);    auto en B2
  const iBarrN  = idxB(['barrion']);    canónico en B2
  const iFecha  = idxB(['fecha']);

  const rows = Math.max(0, shB.getLastRow()-1);
  if (!rows) return;

  const dataB = shB.getRange(2,1,rows,shB.getLastColumn()).getValues();

   Manual sheet
  const manSS = SpreadsheetApp.openById(MANUAL_SPREADSHEET_ID);
  const manSh = manSS.getSheetByName(MANUAL_SHEET_NAME) || manSS.insertSheet(MANUAL_SHEET_NAME);

   Ensure headers
  const MAN_HEADERS = ['ID','Nombre','Persona','Barrio','Fecha'];
  ensureHeaders_(manSh, MAN_HEADERS);

   Manual header indices
  const mHdr   = manSh.getRange(1,1,1,manSh.getLastColumn()).getValues()[0];
  const iMID   = mHdr.indexOf('ID')+1;
  const iMNom  = mHdr.indexOf('Nombre')+1;
  const iMPers = mHdr.indexOf('Persona')+1;
  const iMBar  = mHdr.indexOf('Barrio')+1;
  const iMFech = mHdr.indexOf('Fecha')+1;

   Index manual by ID
  const mRows = Math.max(0, manSh.getLastRow()-1);
  const idToRow = new Map();
  if (mRows > 0) {
    const mVals = manSh.getRange(2,1,mRows,manSh.getLastColumn()).getValues();
    for (let i=0;i<mVals.length;i++) {
      const id = str(mVals[i][iMID-1]);
      if (id) idToRow.set(id, 2+i);
    }
  }

  const toAppend = [];
  let upserts = 0, appends = 0;

  for (let r=0; r<dataB.length; r++) {
    const row   = dataB[r];
    const id     = str(row[iID]);
    const nombre = str(row[iNombre]);
    const pers   = str(row[iPers]);       puede venir lleno
    const barrn  = str(row[iBarrN]);      puede venir lleno
    const fecha  = row[iFecha];           Date o string

    if (!id) continue;

     🚩 Exportar si falta AL MENOS UNO de Persona, BarrioN o Fecha en B2
    const personaMissing = !pers;
    const barrioMissing  = !barrn;
    const fechaMissing   = !toDate_(fecha);  si no parsea a fecha válida, consideramos que falta

    if (!(personaMissing || barrioMissing || fechaMissing)) continue;

    const destRow = idToRow.get(id);
    if (destRow) {
       Completar SOLO celdas vacías en la hoja manual
      if (manSh.getRange(destRow, iMID).getValue()   === '') manSh.getRange(destRow, iMID).setValue(id);
      if (manSh.getRange(destRow, iMNom).getValue()  === '') manSh.getRange(destRow, iMNom).setValue(nombre);
      if (manSh.getRange(destRow, iMPers).getValue() === '' && pers)  manSh.getRange(destRow, iMPers).setValue(pers);
      if (manSh.getRange(destRow, iMBar).getValue()  === '' && barrn) manSh.getRange(destRow, iMBar).setValue(barrn);
      if (manSh.getRange(destRow, iMFech).getValue() === '' && toDate_(fecha)) manSh.getRange(destRow, iMFech).setValue(fecha);
      upserts++;
    } else {
       Insertar fila con lo que YA haya en B2 (y vacío donde falte)
      toAppend.push([
        id,
        nombre,
        pers   || '',
        barrn  || '',
        toDate_(fecha) ? fecha : ''  si no es fecha válida, va vacío
      ]);
      appends++;
    }
  }

  if (toAppend.length) {
    const start = manSh.getLastRow()+1;
    manSh.getRange(start, 1, toAppend.length, MAN_HEADERS.length).setValues(toAppend);
    manSh.getRange(start, MAN_HEADERS.indexOf('Fecha')+1, toAppend.length, 1).setNumberFormat('ddmmyyyy');
  }

  SpreadsheetApp.getActive().toast(
    `Exportados: nuevos ${appends} | actualizados ${upserts} → "${MANUAL_SHEET_NAME}"`,
    'exportMissingPersonaBarrio', 5
  );
}



  2) Importa ajustes desde el archivo externo a B2 y:
     - Si un ajuste se aplicó (al menos PersonaBarrioFecha tenía dato), lo elimina del archivo externo.
     - (Opcional) Si ARCHIVE_APPLIED=true, los mueve a "Ajustes Aplicados".
 
function importManuals_fromManualSheet_toB2() {
  const ss = SpreadsheetApp.getActive();
  const shB = ss.getSheetByName('B2');
  if (!shB) throw new Error('No existe la hoja B2');

   ---- B2 headers & indices
  const bHdr = shB.getRange(1,1,1,shB.getLastColumn()).getValues()[0];
  const idxB = (names, opt=false) => findIdxOr_(bHdr, names, opt);
  const iID     = idxB(['id']);
  const iPersM  = idxB(['persona (manual)'], true);
  const iBarrM  = idxB(['barrio (manual)'],  true);
  const iFechaM = idxB(['fecha (manual)'],   true);

   Asegurar columnas manuales en B2 si faltan
  const needAdd = [];
  if (iPersM == null) needAdd.push('Persona (manual)');
  if (iBarrM == null) needAdd.push('Barrio (manual)');
  if (iFechaM == null) needAdd.push('Fecha (manual)');
  let colPersM, colBarrM, colFechaM;
  if (needAdd.length) {
    shB.getRange(1, shB.getLastColumn()+1, 1, needAdd.length).setValues([needAdd]);
    const bHdr2 = shB.getRange(1,1,1,shB.getLastColumn()).getValues()[0];
    const reIdx = (name)=> bHdr2.indexOf(name)+1;
    colPersM  = reIdx('Persona (manual)');
    colBarrM  = reIdx('Barrio (manual)');
    colFechaM = reIdx('Fecha (manual)');
  } else {
    colPersM  = iPersM+1;
    colBarrM  = iBarrM+1;
    colFechaM = iFechaM+1;
  }

  const rowsB = Math.max(0, shB.getLastRow()-1);
  if (!rowsB) return;
  const dataB = shB.getRange(2,1,rowsB,shB.getLastColumn()).getValues();

   Map B2: ID -> row
  const idToRowB = new Map();
  for (let i=0;i<dataB.length;i++) {
    const id = str(dataB[i][iID]);
    if (id) idToRowB.set(id, 2+i);
  }

   ---- Abrir archivo externo
  const manSS = SpreadsheetApp.openById(MANUAL_SPREADSHEET_ID);
  const manSh = manSS.getSheetByName(MANUAL_SHEET_NAME);
  if (!manSh) throw new Error('No existe la hoja "'+MANUAL_SHEET_NAME+'"');

   Manual headers
  const mHdr = manSh.getRange(1,1,1,manSh.getLastColumn()).getValues()[0];
  const iMID   = mHdr.indexOf('ID')+1;
  const iMNom  = mHdr.indexOf('Nombre')+1;  para archivar
  const iMPers = mHdr.indexOf('Persona')+1;
  const iMBar  = mHdr.indexOf('Barrio')+1;
  const iMFech = mHdr.indexOf('Fecha')+1;

  const rowsM = Math.max(0, manSh.getLastRow()-1);
  if (!rowsM) return;

  const valsM = manSh.getRange(2,1,rowsM,manSh.getLastColumn()).getValues();

   (Opcional) preparar hoja de archivo
  let archSh = null;
  if (ARCHIVE_APPLIED) {
    archSh = manSS.getSheetByName(MANUAL_ARCHIVE_SHEET) || manSS.insertSheet(MANUAL_ARCHIVE_SHEET);
     Asegurar mismas cabeceras
    const archHdr = archSh.getRange(1,1,1,Math.max(archSh.getLastColumn(), mHdr.length)).getValues()[0];
    let differs = false;
    for (let c=0;c<mHdr.length;c++) if (archHdr[c] !== mHdr[c]) { differs = true; break; }
    if (differs) archSh.getRange(1,1,1,mHdr.length).setValues([mHdr]);
  }

  let updates = 0;
  const rowsToDelete = [];
  const rowsToArchive = [];

  for (let i=0;i<valsM.length;i++) {
    const baseRow = 2+i;  fila real en manual
    const row = valsM[i];

    const id   = str(row[iMID-1]);
    if (!id) continue;
    const rowB = idToRowB.get(id);
    if (!rowB) continue;

    const pers  = str(row[iMPers-1]);
    const barri = str(row[iMBar-1]);
    const fRaw  = row[iMFech-1];
    const fVal  = toDate_(fRaw);

    let applied = false;
    if (pers)  { shB.getRange(rowB, colPersM).setValue(pers); applied = true; }
    if (barri) { shB.getRange(rowB, colBarrM).setValue(barri); applied = true; }
    if (fVal)  { shB.getRange(rowB, colFechaM).setValue(fVal); applied = true; }

    if (applied) {
      updates++;
      rowsToDelete.push(baseRow);
      if (ARCHIVE_APPLIED) rowsToArchive.push(row.slice(0, mHdr.length));
    }
  }

  if (updates) {
    shB.getRange(2, colFechaM, rowsB, 1).setNumberFormat('ddmmyyyy');
  }

   Archivar (opcional) y borrar
  if (rowsToDelete.length) {
    if (ARCHIVE_APPLIED && rowsToArchive.length) {
      const startArch = archSh.getLastRow()+1;
      archSh.getRange(startArch, 1, rowsToArchive.length, mHdr.length).setValues(rowsToArchive);
    }
    rowsToDelete.sort((a,b)=>b-a);
    for (const r of rowsToDelete) manSh.deleteRow(r);
  }

  SpreadsheetApp.getActive().toast(
    `Importados ${updates} ajustes a B2 y ${ARCHIVE_APPLIED ? 'archivados' : 'eliminados'} ${rowsToDelete.length} en "${MANUAL_SHEET_NAME}"`,
    'importManuals_to_B2', 6
  );
}

 ==== Helpers mínimos ==== 
function ensureHeaders_(sheet, headers) {
  const firstRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  let needs = false;
  for (let i = 0; i < headers.length; i++) if (firstRow[i] !== headers[i]) { needs = true; break; }
  if (needs) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}
function findIdxOr_(headers, candidates, optional=false) {
  const norm = headers.map(h => normalizeHeader_(h));
  for (const c of candidates) {
    const i = norm.indexOf(normalizeHeader_(c));
    if (i !== -1) return i;
  }
  if (optional) return null;
  throw new Error('No se encontró alguna de estas columnas: ' + candidates.join(' | ')
    + '\nDisponibles: ' + norm.join(' | '));
}
function normalizeHeader_(s) {
  return String(s || '')
    .replace(["']g,'').replace(\ng,' ')
    .normalize('NFD').replace([\u0300-\u036f]g,'')
    .toLowerCase().replace(\s+g,' ').trim();
}
function toDate_(v) {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12, 0, 0);
  if (v === '' || v == null) return null;
  const m = ^\s(\d{1,2})[\\-](\d{1,2})(?:[\\-](\d{2,4}))?\s$.exec(String(v));
  if (m) {
    const d = parseInt(m[1],10), mo = parseInt(m[2],10);
    let y = m[3] ? parseInt(m[3],10) : new Date().getFullYear();
    if (y < 100) y += 2000;
    return new Date(y, mo-1, d, 12, 0, 0);
  }
  const m2 = ^\s(20\d{2})[\\-](\d{1,2})[\\-](\d{1,2})\s$.exec(String(v));
  if (m2) {
    const y = parseInt(m2[1],10), mo = parseInt(m2[2],10), d = parseInt(m2[3],10);
    return new Date(y, mo-1, d, 12, 0, 0);
  }
  return null;
}
function str(v){ return v==null ? '' : String(v).trim(); }
 */