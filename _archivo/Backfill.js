/****************** 1) B → B2 (solo ETARIOS en filas ya existentes) ******************/
function backfillEtarios_B_to_B2() {
  const DEBUG = true;
  const ss  = SpreadsheetApp.getActive();
  const shB = ss.getSheetByName('B');
  const shB2 = ss.getSheetByName('B2') || ss.insertSheet('B2');
  if (!shB) throw new Error('No existe la hoja "B".');

  // Asegurar headers mínimos en B2 (incluye columnas etarias y manuales)
  const DEST_HEADERS = [
    'ID','Nombre','Persona','Barrio','Fecha','Inscriptos','Mail',
    'Call Center','IVR','RRSS','Difusión','Masculino','Femenino','KEY',
    'Fecha C','Clave PIM','Procesado BF','BarrioN',
    'Persona (manual)','Barrio (manual)','Fecha (manual)',
    '18-24','25-39','40-55','56-65','66+','Sin identificar'
  ];
  ensureHeaders_(shB2, DEST_HEADERS);

  // --- Map B (fuente) ---
  const bHdr = shB.getRange(1,1,1,shB.getLastColumn()).getValues()[0];
  const idxB = (name) => {
    const i = bHdr.indexOf(name);
    if (i === -1) throw new Error('B: falta columna ' + name);
    return i;
  };
  const iNombre   = idxB('Nombre');
  const iInsc     = idxB('Inscriptos');

  const iE18_24   = idxB('Inscriptos edades 18-24');
  const iE25_39   = idxB('Inscriptos edades 25-39');
  const iE40_55   = idxB('Inscriptos edades 40-55');
  const iE56_65   = idxB('Inscriptos edades 56-65');
  const iE66P     = idxB('Inscriptos edades 66+');

  const nB = Math.max(0, shB.getLastRow()-1);
  if (nB === 0) return;
  const dataB = shB.getRange(2,1,nB,shB.getLastColumn()).getValues();

  // --- Map B2 (destino intermedio) ---
  const b2Hdr = shB2.getRange(1,1,1,Math.max(shB2.getLastColumn(), DEST_HEADERS.length)).getValues()[0];
  const col = (h) => b2Hdr.indexOf(h) + 1;

  const colNOM   = col('Nombre');
  const colINS   = col('Inscriptos');
  const colKEY   = col('KEY');

  const colE18   = col('18-24');
  const colE25   = col('25-39');
  const colE40   = col('40-55');
  const colE56   = col('56-65');
  const colE66   = col('66+');
  const colSINID = col('Sin identificar');

  // Índice por KEY ya existente en B2
  const nB2 = Math.max(0, shB2.getLastRow()-1);
  const keyToRow = new Map(); // key -> row (2-based)
  if (nB2 > 0) {
    const cur = shB2.getRange(2,1,nB2,Math.max(shB2.getLastColumn(), DEST_HEADERS.length)).getValues();
    for (let i=0;i<cur.length;i++) {
      const nomCell = str(cur[i][colNOM-1]);
      const insVal  = num(cur[i][colINS-1]);
      const key     = buildKeyByNombreInscriptos_(nomCell, insVal);
      if (key) keyToRow.set(key, 2+i);
    }
  }

  let updated = 0, skipped = 0;
  for (let r=0; r<dataB.length; r++) {
    const row = dataB[r];
    const nombre = str(row[iNombre]);
    const ins    = num(row[iInsc]);

    const e18 = num(row[iE18_24]);
    const e25 = num(row[iE25_39]);
    const e40 = num(row[iE40_55]);
    const e56 = num(row[iE56_65]);
    const e66 = num(row[iE66P]);
    const sinId = Math.max(0, ins - (e18+e25+e40+e56+e66));

    const key = buildKeyByNombreInscriptos_(nombre, ins);
    if (!key) { skipped++; continue; }

    const rowB2 = keyToRow.get(key);
    if (!rowB2) { skipped++; continue; }

    // Actualizamos SOLO las columnas etarias + sin identificar
    if (colE18) shB2.getRange(rowB2, colE18).setValue(e18);
    if (colE25) shB2.getRange(rowB2, colE25).setValue(e25);
    if (colE40) shB2.getRange(rowB2, colE40).setValue(e40);
    if (colE56) shB2.getRange(rowB2, colE56).setValue(e56);
    if (colE66) shB2.getRange(rowB2, colE66).setValue(e66);
    if (colSINID) shB2.getRange(rowB2, colSINID).setValue(sinId);

    updated++;
    if (DEBUG && updated <= 10) Logger.log(`[B→B2 etarios] row ${rowB2} key=${key} e18=${e18} e25=${e25} e40=${e40} e56=${e56} e66=${e66} sinId=${sinId}`);
  }

  SpreadsheetApp.getActive().toast(`B→B2 (etarios): actualizadas ${updated} | skip ${skipped}`, 'backfillEtarios_B_to_B2', 6);
}


/****************** 2) B2 → Base Final (solo ETARIOS en filas ya existentes) ******************/
function backfillEtarios_B2_to_BaseFinal() {
  const DEST_SPREADSHEET_ID = '1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo';
  const DEST_SHEET_NAME = 'Para Revisar';
  const ss   = SpreadsheetApp.getActive();
  const shB2 = ss.getSheetByName('B2');
  if (!shB2) throw new Error('No existe la hoja "B2"');

  // Abrir destino y asegurar columnas de etarios
  const destSS = SpreadsheetApp.openById(DEST_SPREADSHEET_ID);
  const dest   = destSS.getSheetByName(DEST_SHEET_NAME) || destSS.insertSheet(DEST_SHEET_NAME);

  const dHdr1 = dest.getRange(1,1,1,Math.max(1, dest.getLastColumn())).getValues()[0];
  ensureColumnsExist_(dest, dHdr1, ['18-24','25-39','40-55','56-65','66+','Sin identificar']);

  const dHdr = dest.getRange(1,1,1,dest.getLastColumn()).getValues()[0];
  const D = {
    Figura: findIdxOr_(dHdr, ['figura','persona','nombre']),
    Barrio: findIdxOr_(dHdr, ['barrio']),
    FECHA:  findIdxOr_(dHdr, ['fecha']),
    E18_24: findIdxOr_(dHdr, ['18-24']),
    E25_39: findIdxOr_(dHdr, ['25-39']),
    E40_55: findIdxOr_(dHdr, ['40-55']),
    E56_65: findIdxOr_(dHdr, ['56-65']),
    E66P:   findIdxOr_(dHdr, ['66+']),
    SinId:  findIdxOr_(dHdr, ['sin identificar'])
  };

  // Índice en destino por clave Figura|Barrio|yyyymmdd
  const nD = Math.max(0, dest.getLastRow()-1);
  const keyToRow = new Map();
  if (nD > 0) {
    const dataD = dest.getRange(2,1,nD,dest.getLastColumn()).getValues();
    for (let i=0;i<dataD.length;i++) {
      const r = dataD[i];
      const k = keyFBF_(r[D.Figura], r[D.Barrio], r[D.FECHA]);
      if (k) keyToRow.set(k, 2+i);
    }
  }

  // Map B2
  const b2Hdr = shB2.getRange(1,1,1,shB2.getLastColumn()).getValues()[0];
  const B = {
    // Overrides manuales (si hay dato, se usan)
    PersonaM: findIdxOr_(b2Hdr, ['persona (manual)'], true),
    BarrioM : findIdxOr_(b2Hdr, ['barrio (manual)'],  true),
    FechaM  : findIdxOr_(b2Hdr, ['fecha (manual)'],   true),

    // Campos base para fallback “como siempre”
    Persona : findIdxOr_(b2Hdr, ['persona'], true),
    Barrio  : findIdxOr_(b2Hdr, ['barrio'],  true),
    BarrioN : findIdxOr_(b2Hdr, ['barrion'], true),
    Fecha   : findIdxOr_(b2Hdr, ['fecha'],   true),
    Nombre  : findIdxOr_(b2Hdr, ['nombre'],  true),

    // Métricas necesarias para recalcular Sin identificar si faltara
    Insc    : findIdxOr_(b2Hdr, ['inscriptos','inscritos'], true),

    // Etarios en B2
    E18_24  : findIdxOr_(b2Hdr, ['18-24'], true),
    E25_39  : findIdxOr_(b2Hdr, ['25-39'], true),
    E40_55  : findIdxOr_(b2Hdr, ['40-55'], true),
    E56_65  : findIdxOr_(b2Hdr, ['56-65'], true),
    E66P    : findIdxOr_(b2Hdr, ['66+'], true),
    SinId   : findIdxOr_(b2Hdr, ['sin identificar'], true),
  };

  const nB2 = Math.max(0, shB2.getLastRow()-1);
  if (nB2 === 0) return;
  const dataB2 = shB2.getRange(2,1,nB2,shB2.getLastColumn()).getValues();

  let updated = 0, skipped = 0;

  for (let i=0;i<dataB2.length;i++) {
    const r = dataB2[i];

    // Figura efectiva
    const figura = (B.PersonaM!=null && str(r[B.PersonaM])) ? str(r[B.PersonaM])
                  : (B.Persona!=null ? str(r[B.Persona]) : '');

    // Barrio efectivo
    const barrio = (B.BarrioM!=null && str(r[B.BarrioM])) ? str(r[B.BarrioM])
                  : (B.BarrioN!=null && str(r[B.BarrioN])) ? str(r[B.BarrioN])
                  : (B.Barrio!=null ? str(r[B.Barrio]) : '');

    // Fecha efectiva
    let fecha = null;
    if (B.FechaM!=null) fecha = toDate_(r[B.FechaM]);
    if (!fecha && B.Fecha!=null) fecha = toDate_(r[B.Fecha]);

    if (!figura || !barrio || !fecha) { skipped++; continue; }

    const k = keyFBF_(figura, barrio, fecha);
    const dRow = keyToRow.get(k);
    if (!dRow) { skipped++; continue; }

    // Valores etarios desde B2 (si faltan, intentamos calcular sinId con Inscriptos)
    const e18 = (B.E18_24!=null) ? num(r[B.E18_24]) : 0;
    const e25 = (B.E25_39!=null) ? num(r[B.E25_39]) : 0;
    const e40 = (B.E40_55!=null) ? num(r[B.E40_55]) : 0;
    const e56 = (B.E56_65!=null) ? num(r[B.E56_65]) : 0;
    const e66 = (B.E66P  !=null) ? num(r[B.E66P])   : 0;

    let sinId = (B.SinId!=null) ? num(r[B.SinId]) : 0;
    if (!sinId && B.Insc!=null) {
      const ins = num(r[B.Insc]);
      const sum = e18+e25+e40+e56+e66;
      if (ins>0 && sum>0) sinId = Math.max(0, ins - sum);
    }

    // Escribimos SOLO las columnas etarias en destino
    setIfIndex_(dest, dRow, D.E18_24, e18);
    setIfIndex_(dest, dRow, D.E25_39, e25);
    setIfIndex_(dest, dRow, D.E40_55, e40);
    setIfIndex_(dest, dRow, D.E56_65, e56);
    setIfIndex_(dest, dRow, D.E66P,   e66);
    setIfIndex_(dest, dRow, D.SinId,  sinId);

    updated++;
  }

  SpreadsheetApp.getActive().toast(`B2→BaseFinal (etarios): actualizadas ${updated} | skip ${skipped}`, 'backfillEtarios_B2_to_BaseFinal', 6);
}


/************************ Helpers compartidos ************************/
function ensureHeaders_(sheet, headers) {
  const firstRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  let needs = false;
  for (let i = 0; i < headers.length; i++) if (firstRow[i] !== headers[i]) { needs = true; break; }
  if (needs) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}
function buildKeyByNombreInscriptos_(nombre, inscriptos) {
  const nom = normalizeText_(nombre);
  const ins = num(inscriptos);
  if (!nom) return '';
  return `${nom}|${ins}`;
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
function keyFBF_(figura, barrio, fecha) {
  const f = normalizeText_(str(figura));
  const b = normalizeText_(str(barrio));
  const d = toDate_(fecha);
  if (!f || !b || !d) return '';
  const ymd = Utilities.formatDate(d, Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires', 'yyyyMMdd');
  return `${f}|${b}|${ymd}`;
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
function normalizeText_(s) {
  return (s || '')
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
    .replace(/[‒–—−]/g, '-')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
function num(v){ if (v===''||v==null) return 0; if (typeof v==='number') return v; const n=Number(String(v).replace(',','.')); return isNaN(n)?0:n; }
function str(v){ return v==null ? '' : String(v).trim(); }
