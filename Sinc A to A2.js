function syncA_to_A2_upsert() {
  const DEBUG = true;
  const SRC_SHEET = 'A';
  const DST_SHEET = 'A2';
  const ID_SEPARATOR = ' - ';
  const DATE_FMT_ID = 'dd/MM/yyyy';
  const tz = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';

  const ss  = SpreadsheetApp.getActive();
  const src = ss.getSheetByName(SRC_SHEET);
  const dst = ss.getSheetByName(DST_SHEET) || ss.insertSheet(DST_SHEET);
  if (!src) throw new Error('No existe la hoja "A".');

  const DEST_HEADERS = ['ID','Figura','Barrio','FECHA','HORA','Dirección','Asistentes','STATUS REUNIÓN'];
  ensureHeaders_(dst, DEST_HEADERS);

  // ---- Map headers fuente (A) ----
  const hdr = src.getRange(1,1,1,src.getLastColumn()).getValues()[0];
  const idx = (names) => indexByNames_(hdr, names);

  const iFigura = idx(['figura']);
  const iBarrio = idx(['barrio']);
  const iFecha  = idx(['fecha','fecha (fecha)','fecha_evento','fecha reunion','fecha reunión','fecha_reunion','fecha_reunión','fecha evento']);
  const iHora   = idx(['hora']);
  const iDir    = idx(['direccion','dirección']);
  const iAsis   = idx(['asistentes','asistente']);
  const iStat   = idx(['status reunion','status reunión','status_reunion','status_reunión','estado reunion','estado reunión']);

  const n = Math.max(0, src.getLastRow() - 1);
  if (n === 0) return;
  const data = src.getRange(2, 1, n, src.getLastColumn()).getValues();

  // ---- Índices destino (A2) ----
  const dh = dst.getRange(1,1,1,Math.max(dst.getLastColumn(),DEST_HEADERS.length)).getValues()[0];
  const colID   = dh.indexOf('ID') + 1;
  const colFIG  = dh.indexOf('Figura') + 1;
  const colBAR  = dh.indexOf('Barrio') + 1;
  const colFEC  = dh.indexOf('FECHA') + 1;
  const colHORA = dh.indexOf('HORA') + 1;
  const colDIR  = dh.indexOf('Dirección') + 1;
  const colASIS = dh.indexOf('Asistentes') + 1;
  const colSTAT = dh.indexOf('STATUS REUNIÓN') + 1;

  // (Opcional) detectar una columna de flag realizada/ok si existiera
  const realizedFlagIdx = findIdxOrOptional_(dh, [
    'realizada (auto)','realizada?','ok realizada','ok','marcada','flag realizada'
  ]); // devuelve -1 si no existe

  // ---- Construir mapas existentes en A2 ----
  const m = Math.max(0, dst.getLastRow() - 1);
  const keyToRow  = new Map();            // clave exacta Figura+Fecha+Hora
  const pairToRowUnique = new Map();      // Figura+Fecha (si hay 1 sola fila para ese par)
  if (m > 0) {
    const vals = dst.getRange(2, 1, m, Math.max(dst.getLastColumn(), DEST_HEADERS.length)).getValues();

    // Primero mapear exactos y recolectar por par (figura+fecha)
    const pairBuckets = new Map();
    for (let i = 0; i < vals.length; i++) {
      const figuraSan = sanitizeFigura_(str(vals[i][colFIG-1]));
      const fechaD    = toDate_(vals[i][colFEC-1]);
      const horaObj   = toTime_(vals[i][colHORA-1]);
      const horaKey   = horaObj ? Utilities.formatDate(horaObj, tz, 'HH:mm') : '';
      const kExact    = normKeyA_(figuraSan, fechaD, horaKey);
      if (kExact) keyToRow.set(kExact, 2 + i);

      const kPair = normPairKey_(figuraSan, fechaD);
      if (kPair) {
        if (!pairBuckets.has(kPair)) pairBuckets.set(kPair, []);
        pairBuckets.get(kPair).push(2 + i); // guardo fila
      }
    }
    // Dejar solo los pares unívocos
    for (const [kPair, rowsArr] of pairBuckets.entries()) {
      if (rowsArr.length === 1) pairToRowUnique.set(kPair, rowsArr[0]);
    }
  }

  const seenInRun = new Set();
  const toInsert = [];
  const toUpdate = [];

  for (let r = 0; r < data.length; r++) {
    const row        = data[r];
    const figuraSan  = sanitizeFigura_(str(row[iFigura]));            // corta en & (toma primera persona)
    const barrio     = sanitizeBarrio_(row[iBarrio]);                 // limpio espacios
    const fechaD     = toDate_(row[iFecha]);                          // fecha normalizada (12:00)
    const horaObj    = toTime_(row[iHora]);                           // Date time-only o null
    const horaKey    = horaObj ? Utilities.formatDate(horaObj, tz, 'HH:mm') : '';
    const dir        = str(row[iDir]);
    const asis       = num(row[iAsis]);
    const stat       = str(row[iStat]);

    const keyExact = normKeyA_(figuraSan, fechaD, horaKey);
    if (!keyExact || seenInRun.has(keyExact)) {
      // Si no tengo hora válida y por eso no hay keyExact, igual intentamos por par figura+fecha
      // (no marcamos seenInRun aquí porque la hora pudo ser vacía)
    } else {
      seenInRun.add(keyExact);
    }

    // Buscar fila destino: 1) exacta 2) par único (figura+fecha)
    let existsRow = keyExact ? keyToRow.get(keyExact) : null;
    if (!existsRow) {
      const kPair = normPairKey_(figuraSan, fechaD);
      if (kPair && pairToRowUnique.has(kPair)) {
        existsRow = pairToRowUnique.get(kPair);
      }
    }

    if (!existsRow) {
      // INSERT
      const idText = buildIdA2_(figuraSan, barrio, fechaD, tz, ID_SEPARATOR, DATE_FMT_ID);
      toInsert.push([idText, figuraSan, barrio, fechaD, (horaObj||''), dir, asis, stat]);
      if (DEBUG && toInsert.length <= 5) Logger.log('[INS] ' + JSON.stringify(toInsert[toInsert.length-1]));
    } else {
      // UPDATE **siempre** (sin importar estado): FECHA, HORA, Dirección, Asistentes, STATUS
      const newVals = [fechaD, (horaObj||''), dir, asis, stat];
      toUpdate.push({ row: existsRow, values: newVals });

      // (Opcional) actualizar flag si existe
      if (realizedFlagIdx !== -1) {
        try {
          const realized = isRealizada_(stat);
          dst.getRange(existsRow, realizedFlagIdx + 1).setValue(realized ? true : false);
        } catch (_) {}
      }

      if (DEBUG && toUpdate.length <= 5) Logger.log('[UPD] row ' + existsRow + ' -> ' + JSON.stringify(newVals));
    }
  }

  // INSERTS
  if (toInsert.length) {
    const start = dst.getLastRow() + 1;
    dst.getRange(start, 1, toInsert.length, DEST_HEADERS.length).setValues(toInsert);
    dst.getRange(start, colFEC,  toInsert.length, 1).setNumberFormat('dd/mm/yyyy');  // FECHA
    dst.getRange(start, colHORA, toInsert.length, 1).setNumberFormat('hh:mm AM/PM'); // HORA
  }

  // UPDATES
  for (const u of toUpdate) {
    dst.getRange(u.row, colFEC, 1, 5).setValues([u.values]); // FECHA..STATUS
    dst.getRange(u.row, colFEC,  1, 1).setNumberFormat('dd/mm/yyyy');
    dst.getRange(u.row, colHORA, 1, 1).setNumberFormat('hh:mm AM/PM');
  }

  // --- ORDENAR A2 por FECHA y luego HORA (ascendente) ---
  const lastRow = dst.getLastRow();
  if (lastRow > 1) {
    const lastCol = Math.max(dst.getLastColumn(), DEST_HEADERS.length);
    dst.getRange(2, 1, lastRow - 1, lastCol)
       .sort([
         { column: colFEC,  ascending: true },
         { column: colHORA, ascending: true }
       ]);
  }

  const msg = `A2 ← A | insertadas: ${toInsert.length} | actualizadas: ${toUpdate.length} | ordenado por FECHA, HORA`;
  Logger.log(msg);
  SpreadsheetApp.getActive().toast(msg, 'syncA_to_A2_upsert', 6);
}

/* ========================= Helpers extra usados arriba ========================= */

// Par clave sin hora
function normPairKey_(figura, fecha) {
  const f = normalizeText_(figura);
  const ymd = fecha ? Utilities.formatDate(fecha, Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires', 'yyyyMMdd') : '';
  return `${f}|${ymd}`;
}

// Igual que antes (ya la tenías)
function sanitizeFigura_(s) {
  const t = str(s);
  const pos = t.indexOf('&');
  return (pos >= 0 ? t.slice(0, pos).trim() : t);
}
function sanitizeBarrio_(s) { return str(s).replace(/\s+/g, ' ').trim(); }
function toTime_(v) {
  if (v instanceof Date) return v;
  const t = str(v);
  if (!t) return null;
  const m1 = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*$/i.exec(t);
  if (m1) {
    let hh = parseInt(m1[1],10), mm = parseInt(m1[2],10);
    const ampm = (m1[3]||'').toUpperCase();
    if (ampm === 'PM' && hh < 12) hh += 12;
    if (ampm === 'AM' && hh === 12) hh = 0;
    return new Date(1899, 11, 30, hh, mm, 0);
  }
  return null;
}
function buildIdA2_(figura, barrio, fecha, tz, sep, fmt) {
  const dTxt = fecha ? Utilities.formatDate(fecha, tz, fmt) : '';
  const parts = [figura];
  if (barrio) parts.push(barrio);
  if (dTxt) parts.push(dTxt);
  return parts.join(sep);
}
function normKeyA_(figura, fecha, horaHHmm) {
  const f = normalizeText_(figura);
  const h = normalizeText_(horaHHmm);
  const ymd = fecha ? Utilities.formatDate(fecha, Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires', 'yyyyMMdd') : '';
  return `${f}|${ymd}|${h}`;
}
function isRealizada_(status) {
  const s = normalizeStatus_(status);
  return /^realizad/.test(s);
}
function normalizeStatus_(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function ensureHeaders_(sheet, headers) {
  const firstRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  let needs = false;
  for (let i = 0; i < headers.length; i++) if (firstRow[i] !== headers[i]) { needs = true; break; }
  if (needs) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}
function indexByNames_(headers, names) {
  const norm = headers.map(h => normalizeHeader_(h));
  for (const n of names) {
    const i = norm.indexOf(normalizeHeader_(n));
    if (i !== -1) return i;
  }
  throw new Error('No se encontró alguna de estas columnas: ' + names.join(' | '));
}
function normalizeHeader_(s) {
  return String(s || '')
    .replace(/["']/g,'')
    .replace(/\n/g,' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/\s+/g,' ').trim();
}
function normalizeText_(s) {
  return (s || '')
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
    .replace(/[‒–—−]/g, '-')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/\s+/g,' ').trim();
}
function num(v){ if (v===''||v==null) return 0; if (typeof v==='number') return v; const n=Number(String(v).replace(',','.')); return isNaN(n)?0:n; }
function str(v){ return v==null ? '' : String(v).trim(); }
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
function findIdxOrOptional_(headers, names) {
  const norm = headers.map(h => normalizeHeader_(h));
  for (const n of names) {
    const i = norm.indexOf(normalizeHeader_(n));
    if (i !== -1) return i;
  }
  return -1;
}
