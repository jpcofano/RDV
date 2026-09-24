/**
 * Genera una hoja "TEST CLAVES" con el resultado de matcheo de claves
 * de A2 y B2 contra la Base Final (RVD JM-CM - ES2).
 *
 * Requiere helpers ya presentes:
 * - findIdxOr_, keyFBF_, toDate_, fmtYMD_, normalizeHeader_, normalizeText_, str
 */
function testKeys_A2_B2_toSheet() {
  const DEST_SPREADSHEET_ID = '1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo';
  const DEST_SHEET_NAME     = 'RVD JM-CM - ES';
  const SHEET_A2 = 'A2';
  const SHEET_B2 = 'B2';
  const OUT_SHEET = 'TEST CLAVES';
  const tz = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';

  const ss  = SpreadsheetApp.getActive();
  const shA = ss.getSheetByName(SHEET_A2);
  const shB = ss.getSheetByName(SHEET_B2);
  if (!shA) throw new Error('No existe la hoja A2');
  if (!shB) throw new Error('No existe la hoja B2');

  // --- Base Final: índice clave -> fila ---
  const destSS = SpreadsheetApp.openById(DEST_SPREADSHEET_ID);
  const dest   = destSS.getSheetByName(DEST_SHEET_NAME);
  if (!dest) throw new Error('No existe la hoja destino: ' + DEST_SHEET_NAME);

  const dHdr = dest.getRange(1,1,1,dest.getLastColumn()).getValues()[0];
  const D = {
    Figura: findIdxOr_(dHdr, ['figura','persona','nombre']),
    Barrio: findIdxOr_(dHdr, ['barrio']),
    FECHA:  findIdxOr_(dHdr, ['fecha'])
  };
  const dRows = Math.max(0, dest.getLastRow()-1);
  const dVals = dRows ? dest.getRange(2,1,dRows,dest.getLastColumn()).getValues() : [];
  const keyToRow = new Map();
  for (let i=0;i<dVals.length;i++){
    const r = dVals[i];
    const k = keyFBF_(r[D.Figura], r[D.Barrio], r[D.FECHA]);
    if (k) keyToRow.set(k, 2+i); // fila real en Base Final
  }

  // --- Recolectar resultados A2 y B2 ---
  const out = [];
  const pushRowsFrom = (sheetName, sh, cfg) => {
    const hdr  = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    const I = {
      Figura: findIdxOr_(hdr, cfg.figuraHdrs),
      Barrio: findIdxOr_(hdr, cfg.barrioHdrs),
      FECHA:  findIdxOr_(hdr, cfg.fechaHdrs)
    };
    const n = Math.max(0, sh.getLastRow()-1);
    if (!n) return;
    const vals = sh.getRange(2,1,n,sh.getLastColumn()).getValues();

    for (let i=0;i<vals.length;i++){
      const rowNum = i + 2; // fila en hoja origen
      const r = vals[i];
      const figura = str(r[I.Figura]);
      const barrio = str(r[I.Barrio]);
      const fechaSrc = r[I.FECHA];

      const fechaObj = toDate_(fechaSrc);
      const ymd = fechaObj ? fmtYMD_(fechaObj, tz) : '';
      const key = (figura && barrio && fechaObj) ? keyFBF_(figura, barrio, fechaObj) : '';

      const destRow = key ? (keyToRow.get(key) || '') : '';
      const match = destRow ? 'Sí' : 'No';

      out.push([
        sheetName,           // Origen
        rowNum,              // Fila Origen
        figura,              // Figura
        barrio,              // Barrio
        fechaSrc,            // Fecha (src)
        ymd,                 // Fecha (YMD)
        key,                 // Clave
        match,               // Match
        destRow              // Fila Base
      ]);
    }
  };

  // A2 (prefiere Barrion si existe)
  pushRowsFrom('A2', shA, {
    figuraHdrs: ['figura','persona','nombre'],
    barrioHdrs: ['barrion','barrio'],
    fechaHdrs:  ['fecha']
  });
  // B2 (barrio viene en Barrion)
  pushRowsFrom('B2', shB, {
    figuraHdrs: ['persona','figura','nombre'],
    barrioHdrs: ['barrion'],
    fechaHdrs:  ['fecha']
  });

  // --- Escribir salida en solapa OUT_SHEET ---
  const headers = [
    'Origen','Fila Origen','Figura','Barrio','Fecha (src)','Fecha (YMD)','Clave','Match','Fila Base'
  ];
  const shOut = ss.getSheetByName(OUT_SHEET) || ss.insertSheet(OUT_SHEET);
  shOut.clearContents();
  shOut.getRange(1,1,1,headers.length).setValues([headers]);
  if (out.length) {
    shOut.getRange(2,1,out.length,headers.length).setValues(out);
  }

  // Ajustes visuales
  shOut.setFrozenRows(1);
  shOut.autoResizeColumns(1, headers.length);
  shOut.getRange(1,1,1,headers.length).setFontWeight('bold');

  SpreadsheetApp.getActive().toast(
    `Diagnóstico generado: ${out.length} filas en "${OUT_SHEET}"`,
    'testKeys_A2_B2_toSheet', 5
  );
}
