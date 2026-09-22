/* 
 function upsertBaseFinal_A2_B2soloact() {
  const DEBUG = true;                 // poné false para silenciar
  const LOG_LIMIT = 120;
  const SHEET_A2 = 'A2';
  const SHEET_B2 = 'B2';
  const DEST_SPREADSHEET_ID = '1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo';
  const DEST_SHEET_NAME = 'Copia de RVD JM-CM - ES';
  const tz = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';
  const t0 = new Date();

  try {
    const ss   = SpreadsheetApp.getActive();
    const shA  = ss.getSheetByName(SHEET_A2);
    const shB  = ss.getSheetByName(SHEET_B2);
    if (!shA) throw new Error('No existe la hoja A2');
    if (!shB) throw new Error('No existe la hoja B2');

    const destSS = SpreadsheetApp.openById(DEST_SPREADSHEET_ID);
    const dest   = destSS.getSheetByName(DEST_SHEET_NAME) || destSS.insertSheet(DEST_SHEET_NAME);

    // Aseguro columnas mínimas (principalmente “Asistentes” y las de B2)
    const dHdr1 = dest.getRange(1,1,1,Math.max(1, dest.getLastColumn())).getValues()[0];
    ensureColumnsExist_(dest, dHdr1, [
      'Figura','Barrio','FECHA','Asistentes',
      'Inscriptos','Mail','Call Center','IVR','RRSS','Difusión','Maculinos','Femeninos'
    ]);
    const dHdr = dest.getRange(1,1,1,dest.getLastColumn()).getValues()[0];
    const D = {
      Figura: findIdxOr_(dHdr, ['figura','persona','nombre']),
      Barrio: findIdxOr_(dHdr, ['barrio']),
      FECHA:  findIdxOr_(dHdr, ['fecha']),
      Asis:   findIdxOr_(dHdr, ['asistentes','asistente']),
      Ins:    findIdxOr_(dHdr, ['inscriptos','inscritos'], true),
      Mail:   findIdxOr_(dHdr, ['mail','mailing','email'], true),
      Call:   findIdxOr_(dHdr, ['call center','callcenter'], true),
      IVR:    findIdxOr_(dHdr, ['ivr'], true),
      RRSS:   findIdxOr_(dHdr, ['rrss'], true),
      Dif:    findIdxOr_(dHdr, ['difusión','difusion'], true),
      Mac:    findIdxOr_(dHdr, ['maculinos','masculinos','maculino','masculino'], true),
      Fem:    findIdxOr_(dHdr, ['femeninos','femenino'], true),
    };
    logDbg(DEBUG, `=== upsertBaseFinal_A2_B2 (A2 solo completa Asistentes vacíos; B2 solo completa vacíos) ===`);
    logDbg(DEBUG, 'DEST idx:', JSON.stringify(D));

    // Índice clave→fila en destino
    const destRows = Math.max(0, dest.getLastRow()-1);
    const keyToRow = new Map();
    if (destRows > 0) {
      const dataD = dest.getRange(2,1,destRows,dest.getLastColumn()).getValues();
      for (let i=0;i<dataD.length;i++) {
        const r = dataD[i];
        const k = keyFBF_(r[D.Figura], r[D.Barrio], r[D.FECHA]);
        if (k) {
          if (i < LOG_LIMIT) logDbg(DEBUG, `DEST key: raw[${r[D.Figura]}] [${r[D.Barrio]}] [${fmtYMD_(r[D.FECHA], tz)}] -> ${k}`);
          keyToRow.set(k, 2+i);
        }
      }
    }
    logDbg(DEBUG, `DEST rows=${destRows} | keys=${keyToRow.size}`);

    // === A2: SOLO completa Asistentes si está vacío/0 en destino. NUNCA inserta. === 
    const aHdr = shA.getRange(1,1,1,shA.getLastColumn()).getValues()[0];
    const A = {
      Figura: findIdxOr_(aHdr, ['figura','persona','nombre']),
      Barrio: findIdxOr_(aHdr, ['barrion','barrio']),
      FECHA:  findIdxOr_(aHdr, ['fecha']),
      Asis:   findIdxOr_(aHdr, ['asistentes','asistente'], true)
    };
    logDbg(DEBUG, 'A2 idx:', JSON.stringify(A));

    let updatesA = 0, skippedA = 0;
    const aRows = Math.max(0, shA.getLastRow()-1);
    const dataA = aRows ? shA.getRange(2,1,aRows,shA.getLastColumn()).getValues() : [];

    for (let i=0;i<dataA.length;i++) {
      const r = dataA[i];
      const figura = str(r[A.Figura]);
      const barrio = str(r[A.Barrio]);
      const fec    = toDateLog_(r[A.FECHA], `A2 F${i+2}`, tz);

      if (!figura || !barrio || !fec) { skippedA++; continue; }
      const key  = keyFBF_(figura, barrio, fec);
      const dRow = keyToRow.get(key);
      if (!dRow) { if (i<LOG_LIMIT) logDbg(DEBUG, `A2 F${i+2}: SKIP sin match`); skippedA++; continue; }

      const asisCandidate = (A.Asis!=null) ? num(r[A.Asis]) : 0;
      if (asisCandidate <= 0) { if (i<LOG_LIMIT) logDbg(DEBUG, `A2 F${i+2}: SIN DATO de asistentes (>0 requerido)`); skippedA++; continue; }

      if (D.Asis == null) { if (i<LOG_LIMIT) logDbg(DEBUG, `A2 F${i+2}: No existe col Asistentes en destino`); skippedA++; continue; }

      const curAsis = dest.getRange(dRow, D.Asis+1).getValue();
      if (isEmptyOrZero_(curAsis)) {
        setIfIndex_(dest, dRow, D.Asis, asisCandidate);
        updatesA++;
        if (i<LOG_LIMIT) logDbg(DEBUG, `A2 F${i+2}: UPDATE Asistentes = ${asisCandidate}`);
      } else {
        if (i<LOG_LIMIT) logDbg(DEBUG, `A2 F${i+2}: SKIP Asistentes ya informados (${curAsis})`);
        skippedA++;
      }
    }

    // === B2: SOLO completa campos vacíos/0 en destino. NUNCA inserta. === 
    const bHdr = shB.getRange(1,1,1,shB.getLastColumn()).getValues()[0];
    const B = {
      Figura: findIdxOr_(bHdr, ['persona','figura','nombre']),
      Barrio: findIdxOr_(bHdr, ['barrion']),
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
    };
    logDbg(DEBUG, 'B2 idx:', JSON.stringify(B));

    let updatesB = 0, skippedB = 0;
    const bRows = Math.max(0, shB.getLastRow()-1);
    const dataB = bRows ? shB.getRange(2,1,bRows,shB.getLastColumn()).getValues() : [];

    for (let i=0;i<dataB.length;i++) {
      const r = dataB[i];
      const figura = str(r[B.Figura]);
      const barrio = str(r[B.Barrio]);
      const fec    = toDateLog_(r[B.FECHA], `B2 F${i+2}`, tz);

      if (!figura || !barrio || !fec) { skippedB++; continue; }
      const key  = keyFBF_(figura, barrio, fec);
      const dRow = keyToRow.get(key);
      if (!dRow) { if (i<LOG_LIMIT) logDbg(DEBUG, `B2 F${i+2}: SKIP sin match`); skippedB++; continue; }

      // Valores desde B2
      const ins  = (B.Ins!=null)  ? num(r[B.Ins])  : 0;
      const mail = (B.Mail!=null) ? num(r[B.Mail]) : 0;
      const call = (B.Call!=null) ? num(r[B.Call]) : 0;
      const ivr  = (B.IVR!=null)  ? num(r[B.IVR])  : 0;
      const dif  = (B.Dif!=null)  ? num(r[B.Dif])  : 0;
      const mac  = (B.Mac!=null)  ? num(r[B.Mac])  : 0;
      const fem  = (B.Fem!=null)  ? num(r[B.Fem])  : 0;

      const rrss = (B.RRSS!=null)
        ? num(r[B.RRSS])
        : (num(B.FB!=null? r[B.FB]:0) + num(B.GG!=null? r[B.GG]:0) + num(B.PR!=null? r[B.PR]:0));

      // Helper para “completar solo si vacío/0”
      const fillIfEmpty = (destColIdx, value, label) => {
        if (destColIdx == null) return false;
        if (!(value > 0)) return false; // si no hay valor útil en B2, no completar
        const cur = dest.getRange(dRow, destColIdx+1).getValue();
        if (isEmptyOrZero_(cur)) {
          setIfIndex_(dest, dRow, destColIdx, value);
          if (i<LOG_LIMIT) logDbg(DEBUG, `B2 F${i+2}: UPDATE ${label} = ${value}`);
          return true;
        } else {
          if (i<LOG_LIMIT) logDbg(DEBUG, `B2 F${i+2}: SKIP ${label} ya informado (${cur})`);
          return false;
        }
      };

      let didUpdate = false;
      didUpdate = fillIfEmpty(D.Ins,  ins,  'Inscriptos') || didUpdate;
      didUpdate = fillIfEmpty(D.Mail, mail, 'Mail')       || didUpdate;
      didUpdate = fillIfEmpty(D.Call, call, 'Call')       || didUpdate;
      didUpdate = fillIfEmpty(D.IVR,  ivr,  'IVR')        || didUpdate;
      didUpdate = fillIfEmpty(D.RRSS, rrss, 'RRSS')       || didUpdate;
      didUpdate = fillIfEmpty(D.Dif,  dif,  'Difusión')   || didUpdate;
      didUpdate = fillIfEmpty(D.Mac,  mac,  'Maculinos')  || didUpdate;
      didUpdate = fillIfEmpty(D.Fem,  fem,  'Femeninos')  || didUpdate;

      if (didUpdate) updatesB++; else skippedB++;
    }

    SpreadsheetApp.getActive().toast(
      `FIN upsert (solo completa vacíos) | A2 upd:${updatesA} skip:${skippedA} | B2 upd:${updatesB} skip:${skippedB} | ${new Date()-t0} ms`,
      'upsertBaseFinal_A2_B2', 6
    );

  } catch (err) {
    SpreadsheetApp.getActive().toast('Error: ' + err, 'upsertBaseFinal_A2_B2', 8);
    throw err;
  }
}


function logDbg(enabled, ...args) {
  if (!enabled) return;
  Logger.log(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
}
function fmtYMD_(d, tz) {
  if (!(d instanceof Date)) return String(d);
  return Utilities.formatDate(d, tz || Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires', 'yyyyMMdd');
}
function toDateLog_(v, ctx, tz) {
  const d = toDate_(v);
  if (!d) { Logger.log(`⚠️ Fecha inválida (${ctx}): "${v}"`); }
  else    { Logger.log(`✔ Fecha OK (${ctx}): src="${v}" → ${d.toDateString()} | ymd=${fmtYMD_(d, tz)}`); }
  return d;
}
function ensureColumnsExist_(sheet, currentHeaders, neededNames) {
  const have = currentHeaders.slice();
  for (const name of neededNames) {
    const exists = have.some(h => normalizeHeader_(h) === normalizeHeader_(name));
    if (!exists) {
      sheet.getRange(1, sheet.getLastColumn()+1, 1, 1).setValues([[name]]);
      have.push(name);
    }
  }
}
function setIfIndex_(sheet, row, idx0, value) {
  if (idx0 == null) return;
  sheet.getRange(row, idx0+1).setValue(value);
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
function isEmptyOrZero_(v){
  if (v==null) return true;
  const s = String(v).trim();
  if (s==='') return true;
  const n = Number(s.replace(',','.'));
  return isFinite(n) ? n===0 : false;
}
 */