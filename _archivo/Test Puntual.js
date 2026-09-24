
function auditClaves_Final_A2_B2() {
  const SHEET_A2 = 'A2';
  const SHEET_B2 = 'B2';
  const DEST_SPREADSHEET_ID = '1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo';
  const DEST_SHEET_NAMES = ['RVD JM-CM - ES', 'RVD JM-CM - ES2']; // usa la primera que exista
  const OUT_SHEET = 'AUDIT Claves';
  const tz = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';

  const ss = SpreadsheetApp.getActive();
  const shA = ss.getSheetByName(SHEET_A2);
  const shB = ss.getSheetByName(SHEET_B2);
  if (!shA) throw new Error('No existe la hoja A2');
  if (!shB) throw new Error('No existe la hoja B2');

  const destSS = SpreadsheetApp.openById(DEST_SPREADSHEET_ID);
  const base = getSheetByAnyName_(destSS, DEST_SHEET_NAMES);

  // ====== Índices BASE FINAL ======
  const dHdr = base.getRange(1,1,1,base.getLastColumn()).getValues()[0];
  const D = {
    Figura: findIdxOr_(dHdr, ['figura','persona','nombre']),
    Barrio: findIdxOr_(dHdr, ['barrio']),
    FECHA:  findIdxOr_(dHdr, ['fecha']),
    HORA:   findIdxOr_(dHdr, ['hora'], true),
    Status: findIdxOr_(dHdr, ['status reunión','status reunion','estado reunión','estado reunion'], true),
    Asis:   findIdxOr_(dHdr, ['asistentes','asistente'], true),
    ID:     findIdxOr_(dHdr, ['id'], true),
  };

  const dRows = Math.max(0, base.getLastRow()-1);
  const destData = dRows ? base.getRange(2,1,dRows,base.getLastColumn()).getValues() : [];
  const destKeyToRows = new Map();   // key -> [rowNums]
  const destKeySet = new Set();

  for (let i=0;i<destData.length;i++) {
    const r = destData[i];
    const k = keyFBF_(r[D.Figura], r[D.Barrio], r[D.FECHA]);
    if (!k) continue;
    destKeySet.add(k);
    const arr = destKeyToRows.get(k) || [];
    arr.push(2+i);
    destKeyToRows.set(k, arr);
  }

  // ====== Duplicados en BASE FINAL ======
  const dupRows = [];
  const dupHeader = ['Key', 'Repeticiones', 'Fila Base', 'Figura', 'Barrio', 'Fecha(YYYYMMDD)', 'Hora', 'Status', 'Asistentes', 'ID'];
  for (const [key, rows] of destKeyToRows.entries()) {
    if (rows.length <= 1) continue;
    for (const rowNum of rows) {
      const r = base.getRange(rowNum,1,1,base.getLastColumn()).getValues()[0];
      dupRows.push([
        key,
        rows.length,
        rowNum,
        String(r[D.Figura] || ''),
        String(r[D.Barrio] || ''),
        fmtYMD_(r[D.FECHA], tz),
        (D.HORA!=null ? String(r[D.HORA]||'') : ''),
        (D.Status!=null ? String(r[D.Status]||'') : ''),
        (D.Asis!=null ? Number(r[D.Asis]||0) : 0),
        (D.ID!=null ? String(r[D.ID]||'') : '')
      ]);
    }
  }
  dupRows.sort((a,b) => a[0].localeCompare(b[0]) || (a[2]-b[2]));

  // ====== Huérfanos A2 ======
  const aHdr = shA.getRange(1,1,1,shA.getLastColumn()).getValues()[0];
  const A = {
    Figura: findIdxOr_(aHdr, ['figura','persona','nombre']),
    Barrio: findIdxOr_(aHdr, ['barrion','barrio']),
    FECHA:  findIdxOr_(aHdr, ['fecha']),
    HORA:   findIdxOr_(aHdr, ['hora'], true),
    Dir:    findIdxOr_(aHdr, ['direccion','dirección'], true),
    Status: findIdxOr_(aHdr, ['status reunión','status reunion','estado reunión','estado reunion'], true),
    Asis:   findIdxOr_(aHdr, ['asistentes','asistente'], true),
    Proc:   findIdxOr_(aHdr, ['procesado bf','procesado','procesado base final'], true),
    ID:     findIdxOr_(aHdr, ['id'], true),
  };
  const aRows = Math.max(0, shA.getLastRow()-1);
  const dataA = aRows ? shA.getRange(2,1,aRows,shA.getLastColumn()).getValues() : [];
  const orfA = [];
  const orfAHeader = ['Fila A2','Key','Figura','Barrio','Fecha(YYYYMMDD)','Hora','Status','Asistentes','Proc','ID'];
  for (let i=0;i<dataA.length;i++) {
    const r = dataA[i];
    const k = keyFBF_(r[A.Figura], r[A.Barrio], r[A.FECHA]);
    if (!k) continue;
    if (!destKeySet.has(k)) {
      orfA.push([
        2+i,
        k,
        String(r[A.Figura]||''),
        String(r[A.Barrio]||''),
        fmtYMD_(toDate_(r[A.FECHA]), tz),
        (A.HORA!=null ? String(r[A.HORA]||'') : ''),
        (A.Status!=null ? String(r[A.Status]||'') : ''),
        (A.Asis!=null ? Number(r[A.Asis]||0) : 0),
        (A.Proc!=null ? r[A.Proc]===true : false),
        (A.ID!=null ? String(r[A.ID]||'') : '')
      ]);
    }
  }
  orfA.sort((a,b) => a[1].localeCompare(b[1]) || (a[0]-b[0]));

  // ====== Huérfanos B2 ======
  const bHdr = shB.getRange(1,1,1,shB.getLastColumn()).getValues()[0];
  const B = {
    Figura: findIdxOr_(bHdr, ['persona','figura','nombre']),
    Barrio: findIdxOr_(bHdr, ['barrion','barrio']),
    FECHA:  findIdxOr_(bHdr, ['fecha']),
    Ins:    findIdxOr_(bHdr, ['inscriptos','inscritos'], true),
    Mail:   findIdxOr_(bHdr, ['mail','mailing','email'], true),
    Call:   findIdxOr_(bHdr, ['call center','callcenter'], true),
    IVR:    findIdxOr_(bHdr, ['ivr'], true),
    RRSS:   findIdxOr_(bHdr, ['rrss'], true),
    FB:     findIdxOr_(bHdr, ['facebook'], true),
    GG:     findIdxOr_(bHdr, ['google'], true),
    PR:     findIdxOr_(bHdr, ['programmatic'], true),
    Dif:    findIdxOr_(bHdr, ['difusión','difusion'], true),
    Mac:    findIdxOr_(bHdr, ['maculino','masculino','maculinos','masculinos'], true),
    Fem:    findIdxOr_(bHdr, ['femenino','femeninos'], true),
    Proc:   findIdxOr_(bHdr, ['procesado bf','procesado','procesado base final'], true)
  };
  const bRows = Math.max(0, shB.getLastRow()-1);
  const dataB = bRows ? shB.getRange(2,1,bRows,shB.getLastColumn()).getValues() : [];
  const orfB = [];
  const orfBHeader = ['Fila B2','Key','Figura','Barrio','Fecha(YYYYMMDD)','Inscriptos','Mail','Call','IVR','RRSS','Dif','Mac','Fem','Proc'];
  for (let i=0;i<dataB.length;i++) {
    const r = dataB[i];
    const k = keyFBF_(r[B.Figura], r[B.Barrio], r[B.FECHA]);
    if (!k) continue;
    if (!destKeySet.has(k)) {
      const rrss = (B.RRSS!=null ? num(r[B.RRSS]) :
                   (num(B.FB!=null? r[B.FB]:0) + num(B.GG!=null? r[B.GG]:0) + num(B.PR!=null? r[B.PR]:0)));
      orfB.push([
        2+i,
        k,
        String(r[B.Figura]||''),
        String(r[B.Barrio]||''),
        fmtYMD_(toDate_(r[B.FECHA]), tz),
        (B.Ins!=null ? num(r[B.Ins]) : 0),
        (B.Mail!=null ? num(r[B.Mail]) : 0),
        (B.Call!=null ? num(r[B.Call]) : 0),
        (B.IVR!=null ? num(r[B.IVR])  : 0),
        rrss,
        (B.Dif!=null ? num(r[B.Dif])  : 0),
        (B.Mac!=null ? num(r[B.Mac])  : 0),
        (B.Fem!=null ? num(r[B.Fem])  : 0),
        (B.Proc!=null ? r[B.Proc]===true : false),
      ]);
    }
  }
  orfB.sort((a,b) => a[1].localeCompare(b[1]) || (a[0]-b[0]));

  // ====== Escribir OUT ======
  const out = ss.getSheetByName(OUT_SHEET) || ss.insertSheet(OUT_SHEET);
  out.clear();

  let row = 1;

  // Bloque duplicados
  out.getRange(row,1,1,1).setValue('DUPLICADOS en Base Final');
  row += 1;
  writeTable_(out, row, 1, dupHeader, dupRows);
  row += Math.max(1, dupRows.length) + 2;

  // Bloque huérfanos A2
  out.getRange(row,1,1,1).setValue('HUÉRFANOS desde A2 (no existen en Base Final)');
  row += 1;
  writeTable_(out, row, 1, orfAHeader, orfA);
  row += Math.max(1, orfA.length) + 2;

  // Bloque huérfanos B2
  out.getRange(row,1,1,1).setValue('HUÉRFANOS desde B2 (no existen en Base Final)');
  row += 1;
  writeTable_(out, row, 1, orfBHeader, orfB);

  // Ajustes visuales
  out.autoResizeColumns(1, 12);
  SpreadsheetApp.getActive().toast(
    `AUDIT listo | Duplicados: ${dupRows.length} filas | Huérfanos A2: ${orfA.length} | Huérfanos B2: ${orfB.length}`,
    'auditClaves_Final_A2_B2',
    5
  );
}

/* ===== Helpers locales ===== */
function writeTable_(sheet, r0, c0, headerArr, rows) {
  const hdr = [headerArr];
  sheet.getRange(r0, c0, 1, headerArr.length).setValues(hdr).setFontWeight('bold');
  const body = rows.length ? rows : [['(sin resultados)']];
  sheet.getRange(r0+1, c0, body.length, body[0].length).setValues(body);
}

function getSheetByAnyName_(ss, names) {
  for (const n of names) {
    const sh = ss.getSheetByName(n);
    if (sh) return sh;
  }
  throw new Error('No se encontró ninguna hoja con estos nombres: ' + names.join(' | '));
}

/* Reusa tus helpers existentes del proyecto: findIdxOr_, normalizeHeader_, keyFBF_, toDate_, normalizeText_, str, num, fmtYMD_ */
// Si te falta fmtYMD_ acá va una mínima:
function fmtYMD_(d, tz) {
  if (!(d instanceof Date)) d = toDate_(d);
  if (!(d instanceof Date)) return '';
  return Utilities.formatDate(d, tz || Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires', 'yyyyMMdd');
}






function pelotas(){
debugCompareByRows(340, 142);
}

function debugCompareByRows(testRow, baseRow) {
  const DEST_SPREADSHEET_ID = '1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo';
  const DEST_SHEET_NAME     = 'RVD JM-CM - ES';
  const OUT_SHEET_TEST      = 'TEST CLAVES';
  const OUT_SHEET_POINT     = 'TEST PUNTUAL';
  const tz = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';

  const ss     = SpreadsheetApp.getActive();
  const shTest = ss.getSheetByName(OUT_SHEET_TEST);
  if (!shTest) throw new Error('No existe la hoja "'+OUT_SHEET_TEST+'". Primero corré el test de claves.');

  // --- leer fila de TEST CLAVES (SRC) ---
  const hdrT = shTest.getRange(1,1,1,shTest.getLastColumn()).getValues()[0];
  const idxFiguraSrc = findHeaderExact_(hdrT, 'Figura');
  const idxBarrioSrc = findHeaderExact_(hdrT, 'Barrio');
  const idxFechaSrc  = findHeaderExact_(hdrT, 'Fecha (src)');
  if (idxFiguraSrc===-1 || idxBarrioSrc===-1 || idxFechaSrc===-1) {
    throw new Error('En "'+OUT_SHEET_TEST+'" no encuentro columnas Figura/Barrio/Fecha (src).');
  }
  const rowSrc = shTest.getRange(testRow, 1, 1, shTest.getLastColumn()).getValues()[0];
  const figuraSrc = str(rowSrc[idxFiguraSrc]);
  const barrioSrc = str(rowSrc[idxBarrioSrc]);
  const fechaSrc  = rowSrc[idxFechaSrc]; // puede ser Date o string
  const dSrc = toDate_(fechaSrc);
  const ymdSrc = dSrc ? Utilities.formatDate(dSrc, tz, 'yyyyMMdd') : '';
  const keySrc = keyFBF_(figuraSrc, barrioSrc, dSrc);

  dbgKey('SRC ', figuraSrc, barrioSrc, fechaSrc, tz);
  Logger.log('SRC ymd=%s | key=%s', ymdSrc, keySrc);

  // --- leer fila de BASE FINAL (DEST) ---
  const destSS = SpreadsheetApp.openById(DEST_SPREADSHEET_ID);
  const shBase = destSS.getSheetByName(DEST_SHEET_NAME);
  if (!shBase) throw new Error('No existe la hoja destino: ' + DEST_SHEET_NAME);

  const hdrB = shBase.getRange(1,1,1,shBase.getLastColumn()).getValues()[0];
  const iFig = findIdxOr_(hdrB, ['figura','persona','nombre']);
  const iBar = findIdxOr_(hdrB, ['barrio']);
  const iFec = findIdxOr_(hdrB, ['fecha']);

  const rowBaseVals = shBase.getRange(baseRow, 1, 1, shBase.getLastColumn()).getValues()[0];
  const figuraBase = str(rowBaseVals[iFig]);
  const barrioBase = str(rowBaseVals[iBar]);
  const fechaBase  = rowBaseVals[iFec];
  const dBase = toDate_(fechaBase);
  const ymdBase = dBase ? Utilities.formatDate(dBase, tz, 'yyyyMMdd') : '';
  const keyBase = keyFBF_(figuraBase, barrioBase, dBase);

  dbgKey('BASE', figuraBase, barrioBase, fechaBase, tz);
  Logger.log('BASE ymd=%s | key=%s', ymdBase, keyBase);

  const iguales = (keySrc && keyBase && keySrc === keyBase);

  // --- salida en hoja TEST PUNTUAL ---
  const outHdr = [
    'Fila TEST','Figura (SRC)','Barrio (SRC)','Fecha (SRC)','YMD (SRC)','Clave (SRC)',
    'Fila BASE','Figura (BASE)','Barrio (BASE)','Fecha (BASE)','YMD (BASE)','Clave (BASE)',
    'Claves iguales?'
  ];
  const outRow = [[
    testRow, figuraSrc, barrioSrc, fechaSrc, ymdSrc, keySrc,
    baseRow, figuraBase, barrioBase, fechaBase, ymdBase, keyBase,
    iguales ? 'Sí' : 'No'
  ]];

  const shOut = ss.getSheetByName(OUT_SHEET_POINT) || ss.insertSheet(OUT_SHEET_POINT);
  shOut.clearContents();
  shOut.getRange(1,1,1,outHdr.length).setValues([outHdr]).setFontWeight('bold');
  shOut.getRange(2,1,1,outHdr.length).setValues(outRow);
  shOut.autoResizeColumns(1, outHdr.length);
  shOut.setFrozenRows(1);

  SpreadsheetApp.getActive().toast(
    `Comparado TEST ${testRow} vs BASE ${baseRow} → claves ${iguales ? 'IGUALES' : 'DISTINTAS'}`,
    'debugCompareByRows', 5
  );
}

/* ===== helper para buscar encabezado EXACTO (no “Figura Base”) ===== */
function findHeaderExact_(headers, name) {
  const target = normalizeHeader_(name);
  for (let i=0;i<headers.length;i++){
    if (normalizeHeader_(headers[i]) === target) return i;
  }
  return -1;
}
function dbgKey(prefix, figura, barrio, fecha, tz){
  const fN = normalizeText_(str(figura));
  const bN = normalizeText_(str(barrio));
  const d  = toDate_(fecha);
  const ymd= d
    ? Utilities.formatDate(d, tz || Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires', 'yyyyMMdd')
    : '(fecha inválida)';
  Logger.log(`${prefix}: raw[${figura}] [${barrio}] [${fecha}] -> norm[${fN}] [${bN}] [${ymd}]`);
}
