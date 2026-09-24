function upsertBaseFinal_A2_B2() {
  const DEBUG = true;
  const LOG_LIMIT = 120;
  const SHEET_A2 = 'A2';
  const SHEET_B2 = 'B2';
  const DEST_SPREADSHEET_ID = '1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo';
  const DEST_SHEET_NAME = 'Para Revisar';
  const tz = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';
  const t0 = new Date();

  try {
    const ss   = SpreadsheetApp.getActive();
    const shA  = ss.getSheetByName(SHEET_A2);
    const shB  = ss.getSheetByName(SHEET_B2);
    if (!shA) throw new Error('No existe la hoja A2');
    if (!shB) throw new Error('No existe la hoja B2');

    // === NUEVO: normalizar y poblar BarrioN en B2 antes de armar claves ===
    fillBarrioNFromSources_B2_X();

    const destSS = SpreadsheetApp.openById(DEST_SPREADSHEET_ID);
    const dest   = destSS.getSheetByName(DEST_SHEET_NAME) || destSS.insertSheet(DEST_SHEET_NAME);

    // Asegurar columnas mínimas en destino (incluye edades)
    const dHdr1 = dest.getRange(1,1,1,Math.max(1, dest.getLastColumn())).getValues()[0];
    legEnsureColumnsExist_(dest, dHdr1, [
      'Figura','Barrio','FECHA','HORA','Dirección','STATUS REUNIÓN','Asistentes','ID',
      'Inscriptos','Mail','Call Center','IVR','RRSS','Difusión','Masculinos','Femeninos',
      '18-24','25-39','40-55','56-65','66+','Sin identificar'
    ]);
    const dHdr = dest.getRange(1,1,1,dest.getLastColumn()).getValues()[0];
    const D = {
      Figura: legFindIdxOr_(dHdr, ['figura','persona','nombre']),
      Barrio: legFindIdxOr_(dHdr, ['barrio']),
      FECHA:  legFindIdxOr_(dHdr, ['fecha']),
      HORA:   legFindIdxOr_(dHdr, ['hora'], true),
      Dir:    legFindIdxOr_(dHdr, ['direccion','dirección'], true),
      Status: legFindIdxOr_(dHdr, ['status reunión','status reunion','estado reunión','estado reunion'], true),
      Asis:   legFindIdxOr_(dHdr, ['asistentes','asistente'], true),
      ID:     legFindIdxOr_(dHdr, ['id'], true),
      Ins:    legFindIdxOr_(dHdr, ['inscriptos','inscritos'], true),
      Mail:   legFindIdxOr_(dHdr, ['mail','mailing','email'], true),
      Call:   legFindIdxOr_(dHdr, ['call center','callcenter'], true),
      IVR:    legFindIdxOr_(dHdr, ['ivr'], true),
      RRSS:   legFindIdxOr_(dHdr, ['rrss'], true),
      Dif:    legFindIdxOr_(dHdr, ['difusión','difusion'], true),
      Mac:    legFindIdxOr_(dHdr, ['Masculinos','masculinos','Masculino','masculino'], true),
      Fem:    legFindIdxOr_(dHdr, ['femeninos','femenino'], true),
      A18_24: legFindIdxOr_(dHdr, ['18-24'], true),
      A25_39: legFindIdxOr_(dHdr, ['25-39'], true),
      A40_55: legFindIdxOr_(dHdr, ['40-55'], true),
      A56_65: legFindIdxOr_(dHdr, ['56-65'], true),
      A66p:   legFindIdxOr_(dHdr, ['66+'], true),
      ASinId: legFindIdxOr_(dHdr, ['sin identificar'], true),
    };
    logDbg(DEBUG, `=== upsertBaseFinal_A2_B2 (A2 actualiza Asistentes y Status; B2 canales+edades) ===`);

    // Índice clave → fila en destino
    const destRows = Math.max(0, dest.getLastRow()-1);
    const keyToRow = new Map();
    if (destRows > 0) {
      const dataD = dest.getRange(2,1,destRows,dest.getLastColumn()).getValues();
      for (let i=0;i<dataD.length;i++) {
        const r = dataD[i];
        const k = legKeyFBF_(r[D.Figura], r[D.Barrio], r[D.FECHA]);
        if (k) keyToRow.set(k, 2+i);
      }
    }

    /* === A2: SOLO Asistentes y Status→Realizada cuando sube Asistentes === */
    const aHdr = shA.getRange(1,1,1,shA.getLastColumn()).getValues()[0];
    const A = {
      Figura: legFindIdxOr_(aHdr, ['figura','persona','nombre']),
      Barrio: legFindIdxOr_(aHdr, ['barrion','barrio']),
      FECHA:  legFindIdxOr_(aHdr, ['fecha']),
      Asis:   legFindIdxOr_(aHdr, ['asistentes','asistente'], true),
      Proc:   legFindIdxOr_(aHdr, ['procesado bf','procesado','procesado base final'], true),
    };
    if (A.Proc == null) {
      const newCol = shA.getLastColumn()+1;
      shA.getRange(1,newCol,1,1).setValues([['Procesado BF']]);
      A.Proc = newCol - 1;
    }

    const aRows = Math.max(0, shA.getLastRow()-1);
    const dataA = aRows ? shA.getRange(2,1,aRows,shA.getLastColumn()).getValues() : [];
    const toMarkA_TRUE = [];
    let updatesA = 0, skippedA = 0;

    for (let i=0;i<dataA.length;i++) {
      const r = dataA[i];
      const figura = legStr_(r[A.Figura]);
      const barrio = legStr_(r[A.Barrio]);
      const fec    = legToDate_(r[A.FECHA]);
      const asis   = (A.Asis!=null) ? legNum_(r[A.Asis]) : 0;

      if (!figura || !barrio || !fec) { skippedA++; continue; }
      if (!(asis > 0)) { skippedA++; continue; }

      const key  = legKeyFBF_(figura, barrio, fec);
      const dRow = keyToRow.get(key);
      if (!dRow) { skippedA++; continue; }

      if (D.Asis != null) {
        const curAsis = Number(dest.getRange(dRow, D.Asis+1).getValue() || 0);
        if (asis >= curAsis) {
          setIfIndex_(dest, dRow, D.Asis, asis);
          if (D.Status != null) setIfIndex_(dest, dRow, D.Status, 'Realizada');
          updatesA++;
          toMarkA_TRUE.push(i);
        }
      }
    }
    if (toMarkA_TRUE.length) {
      const rngA = shA.getRange(2, A.Proc+1, aRows, 1);
      const curA = rngA.getValues();
      for (const idx of toMarkA_TRUE) curA[idx][0] = true;
      rngA.setValues(curA);
    }

    /* === B2: usa BarrioN; solo procesa filas con Procesado BF != TRUE; actualiza canales + edades === */
    const bHdr = shB.getRange(1,1,1,shB.getLastColumn()).getValues()[0];
    const B = {
      Figura: legFindIdxOr_(bHdr, ['persona','figura','nombre']),
      BarrioN: legFindIdxOr_(bHdr, ['barrion']), // "BarrioN" normaliza a "barrion"
      Fecha:  legFindIdxOr_(bHdr, ['fecha']),
      Ins:    legFindIdxOr_(bHdr, ['inscriptos','inscritos']),
      Mail:   legFindIdxOr_(bHdr, ['mail','mailing','email']),
      Call:   legFindIdxOr_(bHdr, ['call center','callcenter']),
      IVR:    legFindIdxOr_(bHdr, ['ivr']),
      RRSS:   legFindIdxOr_(bHdr, ['rrss'], true),
      FB:     legFindIdxOr_(bHdr, ['facebook'], true),
      GG:     legFindIdxOr_(bHdr, ['google'], true),
      PR:     legFindIdxOr_(bHdr, ['programmatic'], true),
      Dif:    legFindIdxOr_(bHdr, ['difusión','difusion']),
      Mac:    legFindIdxOr_(bHdr, ['masculino','masculinos'], true),
      Fem:    legFindIdxOr_(bHdr, ['femenino','femeninos'], true),
      E18_24: legFindIdxOr_(bHdr, ['18-24'], true),
      E25_39: legFindIdxOr_(bHdr, ['25-39'], true),
      E40_55: legFindIdxOr_(bHdr, ['40-55'], true),
      E56_65: legFindIdxOr_(bHdr, ['56-65'], true),
      E66p:   legFindIdxOr_(bHdr, ['66+'], true),
      ESinId: legFindIdxOr_(bHdr, ['sin identificar'], true),
      Proc:   legFindIdxOr_(bHdr, ['procesado bf','procesado','procesado base final'], true)
    };
    if (B.Proc == null) {
      const newCol = shB.getLastColumn()+1;
      shB.getRange(1,newCol,1,1).setValues([['Procesado BF']]);
      B.Proc = newCol - 1;
    }

    const bRows = Math.max(0, shB.getLastRow()-1);
    const dataB = bRows ? shB.getRange(2,1,bRows,shB.getLastColumn()).getValues() : [];
    const toMarkB_TRUE = [];
    let updatesB = 0, skippedB = 0;
    const SKIP_CAUSES = { processedTrue:0, noFigura:0, noBarrioN:0, noFecha:0, noKeyDest:0 };

    for (let i=0;i<dataB.length;i++) {
      const r = dataB[i];

      // Saltar si ya fue procesado (solo procesa los que NO tienen TRUE)
      if (B.Proc != null) {
        const v = r[B.Proc];
        const isProcessed = (v === true) || String(v).toLowerCase() === 'true' || String(v).trim() === '1';
        if (isProcessed) { skippedB++; SKIP_CAUSES.processedTrue++; continue; }
      }

      const figura = legStr_(r[B.Figura]);
      if (!figura) { skippedB++; SKIP_CAUSES.noFigura++; continue; }

      const barrioN = legStr_(r[B.BarrioN]);
      if (!barrioN) { skippedB++; SKIP_CAUSES.noBarrioN++; continue; }

      const fec = legToDate_(r[B.Fecha]);
      if (!fec) { skippedB++; SKIP_CAUSES.noFecha++; continue; }

      const key  = legKeyFBF_(figura, barrioN, fec);
      const dRow = keyToRow.get(key);
      if (!dRow) { skippedB++; SKIP_CAUSES.noKeyDest++; continue; }

      const ins  = legNum_(r[B.Ins]);
      const mail = legNum_(r[B.Mail]);
      const call = legNum_(r[B.Call]);
      const ivr  = legNum_(r[B.IVR]);
      const rrss = (B.RRSS!=null && r[B.RRSS] !== '') ? legNum_(r[B.RRSS]) :
                   (legNum_(B.FB!=null? r[B.FB]:0) + legNum_(B.GG!=null? r[B.GG]:0) + legNum_(B.PR!=null? r[B.PR]:0));
      const dif  = legNum_(r[B.Dif]);
      const mac  = (B.Mac!=null) ? legNum_(r[B.Mac]) : 0;
      const fem  = (B.Fem!=null) ? legNum_(r[B.Fem]) : 0;

      const a18_24 = (B.E18_24!=null) ? legNum_(r[B.E18_24]) : 0;
      const a25_39 = (B.E25_39!=null) ? legNum_(r[B.E25_39]) : 0;
      const a40_55 = (B.E40_55!=null) ? legNum_(r[B.E40_55]) : 0;
      const a56_65 = (B.E56_65!=null) ? legNum_(r[B.E56_65]) : 0;
      const a66p   = (B.E66p  !=null) ? legNum_(r[B.E66p])   : 0;
      const aSinId = (B.ESinId!=null) ? legNum_(r[B.ESinId]) : 0;

      setIfIndex_(dest, dRow, D.Ins,  ins);
      setIfIndex_(dest, dRow, D.Mail, mail);
      setIfIndex_(dest, dRow, D.Call, call);
      setIfIndex_(dest, dRow, D.IVR,  ivr);
      setIfIndex_(dest, dRow, D.RRSS, rrss);
      setIfIndex_(dest, dRow, D.Dif,  dif);
      setIfIndex_(dest, dRow, D.Mac,  mac);
      setIfIndex_(dest, dRow, D.Fem,  fem);

      setIfIndex_(dest, dRow, D.A18_24, a18_24);
      setIfIndex_(dest, dRow, D.A25_39, a25_39);
      setIfIndex_(dest, dRow, D.A40_55, a40_55);
      setIfIndex_(dest, dRow, D.A56_65, a56_65);
      setIfIndex_(dest, dRow, D.A66p,   a66p);
      setIfIndex_(dest, dRow, D.ASinId, aSinId);

      updatesB++;
      toMarkB_TRUE.push(i);
    }

    // Marcar "Procesado BF" = TRUE en B2 para filas actualizadas
    if (toMarkB_TRUE.length) {
      const rngB = shB.getRange(2, B.Proc+1, bRows, 1);
      const curB = rngB.getValues();
      for (const idx of toMarkB_TRUE) curB[idx][0] = true;
      rngB.setValues(curB);
    }

    logDbg(DEBUG, 'B2 skipped detail (solo BarrioN): ' + JSON.stringify(SKIP_CAUSES));

    SpreadsheetApp.getActive().toast(
      `FIN upsert | A2 updAsis+Realizada:${updatesA} skipA:${skippedA} | B2 upd:${updatesB} skipB:${skippedB} | ${new Date()-t0} ms`,
      'upsertBaseFinal_A2_B2', 6
    );

  } catch (err) {
    SpreadsheetApp.getActive().toast('Error: ' + err, 'upsertBaseFinal_A2_B2', 8);
    throw err;
  }
}

/* ==== Helpers generales ==== */
function logDbg(enabled, ...args) {
  if (!enabled) return;
  Logger.log(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
}
function legEnsureColumnsExist_(sheet, currentHeaders, neededNames) {
  const have = currentHeaders.slice();
  for (const name of neededNames) {
    const exists = have.some(h => legNormalizeHeader_(h) === legNormalizeHeader_(name));
    if (!exists) {
      sheet.getRange(1, sheet.getLastColumn()+1, 1, 1).setValues([[name]]);
      have.push(name);
    }
  }
}
function legFindIdxOr_(headers, candidates, optional=false) {
  const norm = headers.map(h => legNormalizeHeader_(h));
  for (const c of candidates) {
    const i = norm.indexOf(legNormalizeHeader_(c));
    if (i !== -1) return i;
  }
  if (optional) return null;
  throw new Error('No se encontró alguna de estas columnas: ' + candidates.join(' | ')
    + '\nDisponibles: ' + norm.join(' | '));
}
function legNormalizeHeader_(s) {
  return String(s || '')
    .replace(/["']/g,'').replace(/\n/g,' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/\s+/g,' ').trim();
}
function legKeyFBF_(figura, barrio, fecha) {
  const f = legNormalizeText_(legStr_(figura));
  const b = legNormalizeText_(legStr_(barrio));
  const d = legToDate_(fecha);
  if (!f || !b || !d) return '';
  const ymd = Utilities.formatDate(d, Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires', 'yyyyMMdd');
  return `${f}|${b}|${ymd}`;
}
function legToDate_(v) {
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
function legNormalizeText_(s) {
  return (s || '')
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
    .replace(/[\u2012\u2013\u2014\u2212]/g, '-')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
function legNum_(v){ if (v===''||v==null) return 0; if (typeof v==='number') return v; const n=Number(String(v).replace(',','.')); return isNaN(n)?0:n; }
function legStr_(v){ return v==null ? '' : String(v).trim(); }
function setIfIndex_(sheet, row, idx0, value) {
  if (idx0 == null) return;
  sheet.getRange(row, idx0+1).setValue(value);
}

/* ===== Estados permitidos y mapeo (no usados aquí, pero útil tener) ===== */
const ALLOWED_STATUSES_BF = new Set([
  'Realizada', 'Suspendida', 'Reprogramada', 'en agenda', 'Se modifico el barrio'
]);
function _normNoAccents_(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().trim();
}
function mapStatusToAllowed_(s) {
  const raw = String(s || '').trim();
  if (ALLOWED_STATUSES_BF.has(raw)) return raw;
  const n = _normNoAccents_(raw);
  if (n.startsWith('realizad')) return 'Realizada';
  if (n.startsWith('programad')) return 'en agenda';
  if (n.startsWith('reprogramad')) return 'Reprogramada';
  if (n.includes('suspendid')) return 'Suspendida';
  if (n.startsWith('cancelad')) return 'Suspendida';
  if (n.includes('se modifico el barrio') || n.includes('se modifico barrio') || n.includes('modifico el barrio'))
    return 'Se modifico el barrio';
  return 'en agenda';
}

/* ==== Helper NUEVO: poblar BarrioN desde Barrio (manual) o Barrio ==== */
function _normSimpleX_(s) {
  return String(s || '')
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
function _toTitleX_(s) {
  const t = String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
}
function normalizeBarrioCanonicalX_(raw) {
  const n = _normSimpleX_(raw);
  if (!n) return '';
  const ALIAS = new Map([
    ['villa ortuzar', 'Villa Ortúzar'],
    ['villa ortuzar caba', 'Villa Ortúzar'],
    ['nunez', 'Núñez'],
    ['nuñez', 'Núñez'],
    ['san nicolas', 'San Nicolás'],
    ['parque chacabuco', 'Parque Chacabuco'],
    ['balvanera', 'Balvanera'],
    ['retiro', 'Retiro'],
    ['villa crespo', 'Villa Crespo'],
  ]);
  if (ALIAS.has(n)) return ALIAS.get(n);
  return _toTitleX_(n);
}
function ensureColX_(sheet, headers, name) {
  const norm = headers.map(h => legNormalizeHeader_(h));
  const idx = norm.indexOf(legNormalizeHeader_(name));
  if (idx !== -1) return idx;
  const col = sheet.getLastColumn() + 1;
  sheet.getRange(1, col, 1, 1).setValues([[name]]);
  return col - 1;
}
/**
 * B2: llena "BarrioN" normalizando desde:
 *   1) "Barrio (manual)" si tiene valor
 *   2) "Barrio" si el manual está vacío
 * No escribe si ambas fuentes están vacías.
 */
function fillBarrioNFromSources_B2_X() {
  const ss  = SpreadsheetApp.getActive();
  const shB = ss.getSheetByName('B2');
  if (!shB) throw new Error('No existe la hoja B2');

  const lastRow = shB.getLastRow();
  if (lastRow < 2) return;

  const hdr = shB.getRange(1,1,1,shB.getLastColumn()).getValues()[0];

  const idxBarrioManual = legFindIdxOr_(hdr, ['barrio (manual)'], true);
  const idxBarrio       = legFindIdxOr_(hdr, ['barrio'], true);
  const idxBarrioN      = ensureColX_(shB, hdr, 'BarrioN');

  const rows = lastRow - 1;
  const data = shB.getRange(2, 1, rows, shB.getLastColumn()).getValues();

  const curBarrioN = shB.getRange(2, idxBarrioN + 1, rows, 1).getValues();
  const outBarrioN = new Array(rows).fill(null).map((_, i) => [curBarrioN[i][0]]);

  for (let i = 0; i < rows; i++) {
    const srcManual = (idxBarrioManual != null) ? String(data[i][idxBarrioManual] || '') : '';
    const srcBarrio = (idxBarrio != null)       ? String(data[i][idxBarrio]       || '') : '';

    let chosen = '';
    if (srcManual.trim() !== '') {
      chosen = normalizeBarrioCanonicalX_(srcManual);
    } else if (srcBarrio.trim() !== '') {
      chosen = normalizeBarrioCanonicalX_(srcBarrio);
    }

    if (chosen) outBarrioN[i][0] = chosen;
  }

  shB.getRange(2, idxBarrioN + 1, rows, 1).setValues(outBarrioN);
}

/* ==== Runner con lock (opcional) ==== */
function runUpsertAndNormalize() {
  const t0 = new Date();
  const lock = LockService.getDocumentLock();
  try {
    lock.tryLock(30 * 1000);
    upsertBaseFinal_A2_B2();
    const ms = new Date() - t0;
    SpreadsheetApp.getActive().toast('Upsert OK (' + ms + ' ms)', 'runUpsertAndNormalize', 5);
  } catch (err) {
    SpreadsheetApp.getActive().toast('Error: ' + err, 'runUpsertAndNormalize', 8);
    throw err;
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

/*
 * El bloque duplicado que estaba acá (líneas 429-537) se eliminó en la Fase 2.
 * Era una copia textual de los helpers de arriba más un segundo runUpsertAndNormalize,
 * dentro del MISMO archivo (CLAUDE.md 3.1.c). Dedup puro: no cambia ningún comportamiento.
 */
