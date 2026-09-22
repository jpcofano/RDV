/* function syncA_to_A2_upsert() {
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

  // ---- Construir mapa de claves existentes en A2 usando columnas separadas (NO parsear ID) ----
  const m = Math.max(0, dst.getLastRow() - 1);
  const keyToRow  = new Map(); // key -> rowIndex (2-based)
  const keyToStat = new Map(); // key -> status en A2
  if (m > 0) {
    const vals = dst.getRange(2, 1, m, Math.max(dst.getLastColumn(), DEST_HEADERS.length)).getValues();
    for (let i = 0; i < vals.length; i++) {
      const figura = str(vals[i][colFIG-1]);
      const barrio = str(vals[i][colBAR-1]);
      const fechaV = vals[i][colFEC-1]; // Date o string
      const fechaD = toDate_(fechaV);
      const key    = normKeyA_(figura, barrio, fechaD);
      if (key) {
        keyToRow.set(key, 2 + i);
        keyToStat.set(key, str(vals[i][colSTAT-1]));
      }
    }
  }

  const seenInRun = new Set(); // evita duplicados dentro de A en la misma ejecución
  const toInsert = [];
  const toUpdate = []; // {row, values:[FECHA,HORA,Dirección,Asistentes,STATUS]}

  for (let r = 0; r < data.length; r++) {
    const row    = data[r];
    const figura = str(row[iFigura]);
    const barrio = str(row[iBarrio]);
    const fechaD = toDate_(row[iFecha]); // normaliza a Date (12:00)
    const hora   = row[iHora];
    const dir    = str(row[iDir]);
    const asis   = num(row[iAsis]);
    const stat   = str(row[iStat]);      // estado que llega desde A

    const key    = normKeyA_(figura, barrio, fechaD);
    if (!key) continue; // faltan datos clave

    if (seenInRun.has(key)) continue; // evito duplicados en A
    seenInRun.add(key);

    const existsRow = keyToRow.get(key);
    if (!existsRow) {
      // INSERT
      const idText = buildIdA_(figura, barrio, fechaD, tz, ID_SEPARATOR, DATE_FMT_ID);
      toInsert.push([idText, figura, barrio, fechaD, hora, dir, asis, stat]);
      if (DEBUG && toInsert.length <= 5) Logger.log('[INS] ' + JSON.stringify(toInsert[toInsert.length-1]));
    } else {
      // UPDATE solo si en A2 está Programado y en A viene Realizada
      const a2Status = keyToStat.get(key) || '';
      if (isProgramado_(a2Status) && isRealizada_(stat)) {
        toUpdate.push({
          row: existsRow,
          values: [fechaD, hora, dir, asis, stat] // FECHA..STATUS
        });
        if (DEBUG && toUpdate.length <= 5) Logger.log('[UPD] row ' + existsRow + ' -> ' + JSON.stringify(toUpdate[toUpdate.length-1].values));
      }
    }
  }

  // INSERTS
  if (toInsert.length) {
    const start = dst.getLastRow() + 1;
    dst.getRange(start, 1, toInsert.length, DEST_HEADERS.length).setValues(toInsert);
    dst.getRange(start, colFEC, toInsert.length, 1).setNumberFormat('dd/mm/yyyy');
  }

  // UPDATES (fila por fila por simplicidad)
  for (const u of toUpdate) {
    dst.getRange(u.row, colFEC, 1, 5).setValues([u.values]); // FECHA..STATUS
    dst.getRange(u.row, colFEC, 1, 1).setNumberFormat('dd/mm/yyyy');
  }

  const msg = `A2 ← A | insertadas: ${toInsert.length} | actualizadas (Programado→Realizada): ${toUpdate.length}`;
  Logger.log(msg);
  SpreadsheetApp.getActive().toast(msg, 'syncA_to_A2_upsert', 6);
}

// ========================= Helpers ========================= 

function isProgramado_(status) {
  const s = normalizeStatus_(status);
  return /^programad/.test(s); // programado/a
}
function isRealizada_(status) {
  const s = normalizeStatus_(status);
  return /^realizad/.test(s);  // realizada/o
}
function normalizeStatus_(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().trim();
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

function buildIdA_(figura, barrio, fecha, tz, sep, fmt) {
  const dTxt = fecha ? Utilities.formatDate(fecha, tz, fmt) : '';
  return [figura, barrio, dTxt].filter(Boolean).join(sep);
}
function normKeyA_(figura, barrio, fecha) {
  const f = normalizeText_(figura);
  const b = normalizeText_(barrio);
  const ymd = fecha ? Utilities.formatDate(fecha, Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires', 'yyyyMMdd') : '';
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
    .replace(/[‒–—−]/g, '-') // guiones raros → '-'
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/\s+/g,' ').trim();
}
function num(v){ if (v===''||v==null) return 0; if (typeof v==='number') return v; const n=Number(String(v).replace(',','.')); return isNaN(n)?0:n; }
function str(v){ return v==null ? '' : String(v).trim(); }
 */