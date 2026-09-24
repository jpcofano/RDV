/* ====================== Helpers de log (añadir si faltan) ====================== */
function log_(DEBUG, ...args) {
  if (!DEBUG) return;
  try {
    Logger.log(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
  } catch (e) {
    Logger.log(args.join(' '));
  }
}

function logSampleRows_(DEBUG, data, labels, idxs, limit) {
  if (!DEBUG) return;
  const n = Math.min(limit || 5, data.length);
  for (let i = 0; i < n; i++) {
    const row = data[i];
    const obj = {};
    for (let j = 0; j < idxs.length; j++) obj[labels[j]] = row[idxs[j]];
    Logger.log(`Sample fila ${i+2}: ` + JSON.stringify(obj));
  }
}

function fillFechaC_into_A2() {
  const DEBUG = true;
  const SRC = 'B2';
  const LOOKUP = 'C';
  const KEY_HEADER = 'Clave PIM';
  const DATE_HEADER = 'Fecha C';

  const ss = SpreadsheetApp.getActive();
  const a2 = ss.getSheetByName(SRC);
  const c  = ss.getSheetByName(LOOKUP);
  if (!a2) throw new Error('No existe la hoja A2');
  if (!c)  throw new Error('No existe la hoja C');

  // ==== Encabezados A2 ====
  const a2Hdr = a2.getRange(1,1,1,a2.getLastColumn()).getValues()[0];
  const a2IdxPersona = findIdx_(a2Hdr, ['persona','figura','nombre']);
  const a2IdxInsc    = findIdx_(a2Hdr, ['inscriptos','inscritos']);
  const a2IdxMail    = findIdx_(a2Hdr, ['mail','email','correo','e-mail','mails','mailing']);

  // Crear columnas de salida si faltan (respetando el orden: Clave PIM, Fecha C)
  let colKey = a2Hdr.indexOf(KEY_HEADER) + 1;
  let colDate = a2Hdr.indexOf(DATE_HEADER) + 1;
  if (!colKey && !colDate) {
    const start = a2.getLastColumn() + 1;
    a2.getRange(1, start, 1, 2).setValues([[KEY_HEADER, DATE_HEADER]]);
    colKey = start;
    colDate = start + 1;
  } else {
    if (!colKey) { colKey = a2.getLastColumn() + 1; a2.getRange(1, colKey, 1, 1).setValues([[KEY_HEADER]]); }
    if (!colDate){ colDate= a2.getLastColumn() + 1; a2.getRange(1, colDate,1, 1).setValues([[DATE_HEADER]]); }
  }

  // ==== Encabezados C ====
  const cHdr = c.getRange(1,1,1,c.getLastColumn()).getValues()[0];
  const cIdxPersona = findIdx_(cHdr, ['figura','persona','nombre']);
  const cIdxInsc    = findIdx_(cHdr, ['inscriptos','inscritos']);
  const cIdxMail    = findIdx_(cHdr, ['mail','email','correo','e-mail','mails','mailing']);
  const cIdxFecha   = findIdx_(cHdr, ['fecha','fecha c']);

  // ==== Mapa clave (persona+insc+mail) -> fecha más reciente (Date) desde C ====
  const nC = Math.max(0, c.getLastRow() - 1);
  const mapFecha = new Map();
  if (nC > 0) {
    const cData = c.getRange(2,1,nC,c.getLastColumn()).getValues();
    for (const row of cData) {
      const key = keyPIM_(row[cIdxPersona], row[cIdxInsc], row[cIdxMail]);
      if (!key) continue;
      const d = toDateLocal_(row[cIdxFecha]);
      if (!d) continue;
      const prev = mapFecha.get(key);
      if (!prev || d > prev) mapFecha.set(key, d); // más reciente
    }
  }
  if (DEBUG) Logger.log('Claves únicas en C: ' + mapFecha.size);

  // ==== Recorro A2 y escribo clave + fecha ====
  const nA2 = Math.max(0, a2.getLastRow() - 1);
  if (nA2 === 0) return;
  const a2Data = a2.getRange(2,1,nA2,a2.getLastColumn()).getValues();

  const outKeys  = new Array(nA2).fill(['']);
  const outDates = new Array(nA2).fill(['']);
  let matches = 0;

  for (let i = 0; i < nA2; i++) {
    const row = a2Data[i];
    const key = keyPIM_(row[a2IdxPersona], row[a2IdxInsc], row[a2IdxMail]);
    outKeys[i] = [key];
    const d = key ? mapFecha.get(key) : null;
    outDates[i] = [d || ''];
    if (d) matches++;
  }

  a2.getRange(2, colKey,  nA2, 1).setValues(outKeys);
  a2.getRange(2, colDate, nA2, 1).setValues(outDates);
  a2.getRange(2, colDate, nA2, 1).setNumberFormat('dd/mm/yyyy');

  SpreadsheetApp.getActive().toast(
    `Escritas ${nA2} claves y ${matches} fechas en "${DATE_HEADER}"`,
    'fillFechaC_into_A2', 5
  );
}

/* ================= Helpers ================= */

// Busca índice por nombres candidatos (case/acento/espacios-insensible). Si no encuentra, error mostrando columnas.
function findIdx_(headers, candidates) {
  const norm = headers.map(h => normalizeHeader_(h));
  for (const name of candidates) {
    const i = norm.indexOf(normalizeHeader_(name));
    if (i !== -1) return i;
  }
  throw new Error('No se encontró alguna de estas columnas: ' + candidates.join(' | ')
                  + '\nDisponibles: ' + norm.join(' | '));
}
function normalizeHeader_(s) {
  return String(s || '')
    .replace(/["']/g,'')
    .replace(/\n/g,' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/\s+/g,' ')
    .trim();
}

// Clave técnica: persona + inscriptos + mail (normalizados)
function keyPIM_(persona, inscriptos, mail) {
  const p = normalizeText_(str(persona));
  const n = num(inscriptos);
  const m = normalizeEmail_(str(mail));
  if (!p || !m) return '';  // si falta info clave, no arma clave
  return `${p}|${n}|${m}`;
}

// Normaliza email: minúsculas y trim
function normalizeEmail_(s) {
  return String(s || '').toLowerCase().trim();
}

// Convierte a Date (12:00) usando tu toDate_ y asegura zona horaria
function toDateLocal_(v) {
  const d = toDate_(v);
  return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0) : null;
}
