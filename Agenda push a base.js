/*********** CONFIG ***********/
//const AGENDA_SS_ID         = '1hP8zMN8Ep7s1w9zb3Fllix2q_OqIhVwkrED0KCoVh4U'; // tu archivo de Agenda
//const AGENDA_SHEET         = 'Agenda';
//const AGENDA_ARCHIVE_SHEET = 'Agenda ya incorporada';

const DEST_SS_ID           = '1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo'; // Base Final
const DEST_SHEET_NAME      = 'Para Revisar';

function agenda_pushReadyToBaseFinal() {
  const DEBUG = true; // poné false para silenciar logs
  const tz = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';
  const ssA = SpreadsheetApp.openById(AGENDA_SS_ID);
  const shA = ssA.getSheetByName(AGENDA_SHEET);
  if (!shA) throw new Error('No existe la hoja Agenda');

  legEnsureHeaders_(shA, agendaHeaders_());
  const hdr = shA.getRange(1,1,1,shA.getLastColumn()).getValues()[0];
  const I   = agendaIdx_(hdr);

  const rows = Math.max(0, shA.getLastRow()-1);
  if (!rows) return;

  const vals = shA.getRange(2,1,rows,shA.getLastColumn()).getValues();

  // Destino: Base Final → "Para Revisar"
  const destSS = SpreadsheetApp.openById('1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo');
  const dest   = destSS.getSheetByName('Para Revisar') || destSS.insertSheet('Para Revisar');

  // Aseguramos columnas base
  const dHdr1 = dest.getRange(1,1,1,Math.max(1, dest.getLastColumn())).getValues()[0];
  legEnsureColumnsExist_(dest, dHdr1, [
    'Figura','Barrio','FECHA','HORA','Dirección','STATUS REUNIÓN','Asistentes','ID',
    'Inscriptos','Mail','Call Center','IVR','RRSS','Difusión','Masculinos','Femeninos'
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
  };

  // Índice clave → fila existente en destino
  const destRows = Math.max(0, dest.getLastRow()-1);
  const keyToRow = new Map();
  if (destRows > 0) {
    const dVals = dest.getRange(2,1,destRows,dest.getLastColumn()).getValues();
    for (let i=0;i<dVals.length;i++) {
      const r = dVals[i];
      const k = legKeyFBF_(r[D.Figura], r[D.Barrio], r[D.FECHA]);
      if (k) keyToRow.set(k, 2+i);
    }
  }

  let sent = 0, skipped = 0;
  for (let i=0;i<vals.length;i++) {
    const row = vals[i];
    const rowNum = 2 + i;

    const listo    = row[I.LISTO] === true;
    const enviado  = row[I.ENVIADO] === true;

    if (!listo || enviado) {
      if (DEBUG) Logger.log(`F${rowNum}: SKIP por listo=${listo} enviado=${enviado}`);
      continue;
    }

    // Manual > Auto (trim) — barrio con prioridad manual
    const persona       = legStr_(row[I.P_MAN]) || legStr_(row[I.P_AUTO]);
    const barrioManual  = legStr_(row[I.B_MAN]);
    const barrioAuto    = legStr_(row[I.B_AUTO]);
    const barrioRaw     = barrioManual !== '' ? barrioManual : barrioAuto;

    const fecha         = legToDate_(row[I.F_MAN]) || legToDate_(row[I.F_AUTO]);
    const horaTxt       = formatHoraTextSeconds_(row[I.H_MAN]) || formatHoraTextSeconds_(row[I.H_AUTO]); // "HH:mm:ss"
    const dir           = legStr_(row[I.D_MAN]) || legStr_(row[I.D_AUTO]);

    if (DEBUG) {
      Logger.log(`F${rowNum}: persona="${persona}" | barrioMan="${barrioManual}" | barrioAuto="${barrioAuto}" | barrioRaw="${barrioRaw}" | fecha="${row[I.F_MAN]||row[I.F_AUTO]}" -> ${fecha} | horaIn="${row[I.H_MAN]||row[I.H_AUTO]}" -> "${horaTxt}" | dir="${dir}"`);
    }

    if (!persona || !barrioRaw || !fecha) {
      if (DEBUG) Logger.log(`F${rowNum}: SKIP faltan datos clave -> persona:${!!persona} barrioRaw:${!!barrioRaw} fecha:${!!fecha}`);
      skipped++;
      continue;
    }

    // Normalizar barrio a canónico (se normaliza el que se eligió: manual si existía)
    const barrioN = mapBarrioCanon_(barrioRaw) || barrioRaw;

    if (DEBUG) {
      Logger.log(`F${rowNum}: barrio elegido="${barrioRaw}" -> normalizado="${barrioN}"`);
    }

    const key = legKeyFBF_(persona, barrioN, fecha);
    if (!key) {
      if (DEBUG) Logger.log(`F${rowNum}: SKIP key vacía (persona="${persona}", barrioN="${barrioN}", fecha=${fecha})`);
      skipped++;
      continue;
    }

    const idText = buildIdFinal_(persona, barrioN, fecha, tz);
    const dRow   = keyToRow.get(key);

    if (dRow) {
      if (DEBUG) Logger.log(`F${rowNum}: UPDATE destino row ${dRow} (key=${key})`);
      if (D.Figura!=null) dest.getRange(dRow, D.Figura+1).setValue(persona);
      if (D.Barrio!=null) dest.getRange(dRow, D.Barrio+1).setValue(barrioN);
      if (D.FECHA !=null) {
        dest.getRange(dRow, D.FECHA+1).setValue(fecha);
        dest.getRange(dRow, D.FECHA+1).setNumberFormat('dd/mm/yyyy');
      }
      if (D.HORA  !=null && horaTxt) {
        const cell = dest.getRange(dRow, D.HORA+1);
        cell.setNumberFormat('@STRING@'); // guardar como texto
        cell.setValue(horaTxt);
      }
      if (D.Dir   !=null && dir)  dest.getRange(dRow, D.Dir+1).setValue(dir);
      if (D.Status!=null) {
        const cur = String(dest.getRange(dRow, D.Status+1).getValue() || '').trim();
        if (!cur) dest.getRange(dRow, D.Status+1).setValue('en agenda');
      }
      if (D.ID !=null) dest.getRange(dRow, D.ID+1).setValue(idText);
    } else {
      if (DEBUG) Logger.log(`F${rowNum}: INSERT destino (key=${key})`);
      const arr = new Array(dest.getLastColumn()).fill('');
      arr[D.Figura] = persona;
      arr[D.Barrio] = barrioN;
      arr[D.FECHA]  = fecha;
      if (D.HORA!=null)   arr[D.HORA]   = horaTxt || '';
      if (D.Dir!=null)    arr[D.Dir]    = dir  || '';
      if (D.Status!=null) arr[D.Status] = 'en agenda';
      if (D.ID!=null)     arr[D.ID]     = idText;

      const start = dest.getLastRow()+1;
      dest.getRange(start,1,1,dest.getLastColumn()).setValues([arr]);
      dest.getRange(start, D.FECHA+1, 1, 1).setNumberFormat('dd/mm/yyyy');
      if (D.HORA!=null && horaTxt) {
        const cell = dest.getRange(start, D.HORA+1);
        cell.setNumberFormat('@STRING@');
        cell.setValue(horaTxt);
      }
      keyToRow.set(key, start);
    }

    // Marcar enviado en Agenda
    shA.getRange(rowNum, I.ENVIADO+1).setValue(true);
    shA.getRange(rowNum, I.ENVIADO_TS+1).setValue(new Date());
    sent++;
  }

  ensureAgendaCheckboxes_();
  SpreadsheetApp.getActive().toast(`Agenda → Base Final: enviados ${sent} | saltados ${skipped}`, 'agenda_pushReadyToBaseFinal', 5);
}

/** Convierte cualquier entrada de hora a texto "HH:mm:ss" */
function formatHoraTextSeconds_(v) {
  if (v == null || v === '') return '';
  const tz = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';

  // String: "H:mm" o "HH:mm" o "HH:mm:ss"
  if (typeof v === 'string') {
    const s = v.trim();
    let m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (m) {
      const hh = ('0' + parseInt(m[1],10)).slice(-2);
      const mm = ('0' + parseInt(m[2],10)).slice(-2);
      const ss = ('0' + parseInt(m[3],10)).slice(-2);
      return `${hh}:${mm}:${ss}`;
    }
    m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const hh = ('0' + parseInt(m[1],10)).slice(-2);
      const mm = ('0' + parseInt(m[2],10)).slice(-2);
      return `${hh}:${mm}:00`;
    }
    // cualquier otra cosa, la devuelvo "como venga"
    return s;
  }

  // Date (incluye 1899…)
  if (v instanceof Date) {
    return Utilities.formatDate(v, tz, 'HH:mm:ss');
  }

  // Número (fracción del día)
  if (typeof v === 'number' && !isNaN(v)) {
    const totalSec = Math.round(v * 24 * 60 * 60);
    const hh = ('0' + Math.floor(totalSec / 3600)).slice(-2);
    const mm = ('0' + Math.floor((totalSec % 3600) / 60)).slice(-2);
    const ss = ('0' + (totalSec % 60)).slice(-2);
    return `${hh}:${mm}:${ss}`;
  }

  return String(v).trim();
}

/* === Helpers para hora === */
/** Devuelve "HH:mm" como texto, aun si viene Date/serial/hh:mm string. */
function formatHoraText_(v) {
  if (v == null || v === '') return '';
  const tz = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';

  // Si ya es string, normalizo "H:mm" → "HH:mm"
  if (typeof v === 'string') {
    const m = v.match(/^\s*(\d{1,2}):(\d{2})\s*$/);
    if (m) {
      const hh = ('0' + parseInt(m[1],10)).slice(-2);
      const mm = ('0' + parseInt(m[2],10)).slice(-2);
      return `${hh}:${mm}`;
    }
    // si no matchea, lo devuelvo recortado como texto
    return v.trim();
  }

  // Si es Date (incluye tiempos 1899…)
  if (v instanceof Date) {
    return Utilities.formatDate(v, tz, 'HH:mm');
  }

  // Si viene como número (fracción de día: 0..1)
  if (typeof v === 'number' && !isNaN(v)) {
    // 1 día = 24h → v*24 = horas decimales
    const totalMin = Math.round(v * 24 * 60);
    const hh = ('0' + Math.floor(totalMin / 60)).slice(-2);
    const mm = ('0' + (totalMin % 60)).slice(-2);
    return `${hh}:${mm}`;
  }

  // fallback
  return String(v).trim();
}


function buildIdFinal_(figura, barrio, fecha, tz) {
  const zone = tz || Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';
  const dTxt = fecha ? Utilities.formatDate(fecha, zone, 'dd/MM/yyyy') : '';
  const fTxt = figura == null ? '' : String(figura).trim();
  const bTxt = barrio == null ? '' : String(barrio).trim();
  return [fTxt, bTxt, dTxt].filter(Boolean).join(' - ');
}



/* function agenda_pushSelectedToBaseFinal() {
  const tz = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';

  // === Open Agenda ===
  const ssAgenda = SpreadsheetApp.openById(AGENDA_SS_ID);
  const shAgenda = ssAgenda.getSheetByName(AGENDA_SHEET);
  if (!shAgenda) throw new Error('No existe solapa "Agenda" en el archivo de Agenda');

  legEnsureHeaders_(shAgenda, agendaHeaders_());
  const aHdr = shAgenda.getRange(1,1,1,shAgenda.getLastColumn()).getValues()[0];
  const I = agendaIdx_(aHdr);

  const n = Math.max(0, shAgenda.getLastRow()-1);
  if (!n) return;
  const vals = shAgenda.getRange(2,1,n,shAgenda.getLastColumn()).getValues();

  // === Open Base Final ===
  const destSS = SpreadsheetApp.openById(DEST_SS_ID);
  const dest   = destSS.getSheetByName(DEST_SHEET_NAME) || destSS.insertSheet(DEST_SHEET_NAME);

  // Aseguro columnas mínimas en Base Final
  const dHdr1 = dest.getRange(1,1,1,Math.max(1, dest.getLastColumn())).getValues()[0];
  legEnsureColumnsExist_(dest, dHdr1, [
    'Figura','Barrio','FECHA','HORA','Dirección','STATUS REUNIÓN','Asistentes','ID',
    'Inscriptos','Mail','Call Center','IVR','RRSS','Difusión','Masculinos','Femeninos'
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
  };

  // Índice clave → fila en Base Final
  const m = Math.max(0, dest.getLastRow()-1);
  const keyToRow = new Map();
  if (m > 0) {
    const dataD = dest.getRange(2,1,m,dest.getLastColumn()).getValues();
    for (let i=0;i<dataD.length;i++) {
      const r = dataD[i];
      const k = legKeyFBF_(r[D.Figura], r[D.Barrio], r[D.FECHA]);
      if (k) keyToRow.set(k, 2+i);
    }
  }

  const toMarkSent = [];
  const toArchive  = [];
  let inserted=0, updated=0, skipped=0;

  for (let r=0; r<vals.length; r++) {
    const row = vals[r];

    // Flags Agenda
    const listo    = row[I.LISTO] === true || String(row[I.LISTO]).toLowerCase() === 'true';
    const enviado  = row[I.ENVIADO] === true || String(row[I.ENVIADO]).toLowerCase() === 'true';
    if (!listo || enviado) continue;

    // Efectivos (manual > auto)
    const personaEff = legStr_(row[I.P_MAN]) || legStr_(row[I.P_AUTO]);
    const barrioRaw  = legStr_(row[I.B_MAN]) || legStr_(row[I.B_AUTO]);
    const fechaEff   = legToDate_(row[I.F_MAN]) || legToDate_(row[I.F_AUTO]);
    const horaEff    = legStr_(row[I.H_MAN]) || legStr_(row[I.H_AUTO]);
    const dirEff     = legStr_(row[I.D_MAN]) || legStr_(row[I.D_AUTO]);

    // Auto (para fallback)
    const personaAuto = legStr_(row[I.P_AUTO]);
    const barrioAuto  = legStr_(row[I.B_AUTO]);
    const fechaAuto   = legToDate_(row[I.F_AUTO]);
    // hora auto no se usa para la clave, pero puede servir para ID
    const horaAuto    = legStr_(row[I.H_AUTO]);

    // Normalización de barrio (manual si hay, sino auto)
    const barrioNormEff = barrioRaw ? mapBarrioCanon_(barrioRaw) : '';
    const barrioNormAuto= barrioAuto ? mapBarrioCanon_(barrioAuto) : '';

    // Validación mínima
    if (!personaEff || !fechaEff) { skipped++; continue; }

    // Clave principal (manual-prioridad)
    let dRow = null;
    let keyMain = legKeyFBF_(personaEff, barrioNormEff || barrioNormAuto, fechaEff);
    if (keyMain && keyToRow.has(keyMain)) {
      dRow = keyToRow.get(keyMain);
    } else {
      // Fallbacks para encontrar una fila previa y actualizarla:
      // 1) personaEff + barrioNormAuto + fechaEff
      if (!dRow && barrioNormAuto) {
        const k = legKeyFBF_(personaEff, barrioNormAuto, fechaEff);
        if (k && keyToRow.has(k)) dRow = keyToRow.get(k);
      }
      // 2) personaEff + (barrioNormEff || barrioNormAuto) + fechaAuto
      if (!dRow && fechaAuto) {
        const k = legKeyFBF_(personaEff, (barrioNormEff || barrioNormAuto), fechaAuto);
        if (k && keyToRow.has(k)) dRow = keyToRow.get(k);
      }
      // 3) personaAuto + barrioNormAuto + fechaAuto (última chance si persona cambió)
      if (!dRow && personaAuto && fechaAuto && barrioNormAuto) {
        const k = legKeyFBF_((personaEff || personaAuto), barrioNormAuto, fechaAuto);
        if (k && keyToRow.has(k)) dRow = keyToRow.get(k);
      }
    }

    // Datos a escribir en Base Final
    const figuraOut = personaEff;
    const barrioOut = barrioNormEff || barrioNormAuto || '';
    const fechaOut  = fechaEff;
    const horaOut   = horaEff || horaAuto || '';
    const dirOut    = dirEff;
    const idText    = buildIdFinal_(figuraOut, barrioOut, fechaOut, tz);

    if (dRow) {
      // UPDATE en Base Final (no tocamos Asistentes ni canales)
      if (D.Figura!=null) dest.getRange(dRow, D.Figura+1).setValue(figuraOut);
      if (D.Barrio!=null) dest.getRange(dRow, D.Barrio+1).setValue(barrioOut);
      if (D.FECHA !=null) dest.getRange(dRow, D.FECHA+1 ).setValue(fechaOut);
      if (D.HORA  !=null && horaOut) dest.getRange(dRow, D.HORA+1).setValue(horaOut);
      if (D.Dir   !=null) dest.getRange(dRow, D.Dir+1 ).setValue(dirOut);
      if (D.Status!=null) dest.getRange(dRow, D.Status+1).setValue('en agenda');
      if (D.ID    !=null) dest.getRange(dRow, D.ID+1).setValue(idText);
      updated++;

      // si cambió la clave (por barrio/fecha), refrescamos el índice
      const newKey = legKeyFBF_(figuraOut, barrioOut, fechaOut);
      if (newKey) keyToRow.set(newKey, dRow);
    } else {
      // INSERT en Base Final
      const rowArr = new Array(dest.getLastColumn()).fill('');
      rowArr[D.Figura] = figuraOut;
      rowArr[D.Barrio] = barrioOut;
      rowArr[D.FECHA]  = fechaOut;
      if (D.HORA!=null)   rowArr[D.HORA]   = horaOut;
      if (D.Dir!=null)    rowArr[D.Dir]    = dirOut;
      if (D.Status!=null) rowArr[D.Status] = 'en agenda';
      if (D.Asis!=null)   rowArr[D.Asis]   = ''; // NO tocar asistentes
      if (D.ID!=null)     rowArr[D.ID]     = idText;

      const start = dest.getLastRow()+1;
      dest.getRange(start, 1, 1, dest.getLastColumn()).setValues([rowArr]);
      dest.getRange(start, D.FECHA+1, 1, 1).setNumberFormat('dd/mm/yyyy');

      // index
      const newKey = legKeyFBF_(figuraOut, barrioOut, fechaOut);
      if (newKey) keyToRow.set(newKey, start);

      inserted++;
    }

    // Marcar "Enviado a base" en Agenda
    const rr = 2 + r;
    shAgenda.getRange(rr, I.ENVIADO+1).setValue(true);
    shAgenda.getRange(rr, I.ENVIADO_TS+1).setValue(new Date());

    // Archivar si ya pasó (por fecha efectiva)
    const today = new Date(); today.setHours(0,0,0,0);
    const eff = new Date(fechaOut); eff.setHours(0,0,0,0);
    if (eff < today) toArchive.push(rr);
  }

  // Mover a "Agenda ya incorporada" las filas archivables
  if (toArchive.length) {
    const shArch = ssAgenda.getSheetByName(AGENDA_ARCHIVE_SHEET) || ssAgenda.insertSheet(AGENDA_ARCHIVE_SHEET);
    legEnsureHeaders_(shArch, agendaHeaders_());
    const colCount = shAgenda.getLastColumn();
    const rowsCopy = toArchive.map(rr => shAgenda.getRange(rr,1,1,colCount).getValues()[0]);
    const start = shArch.getLastRow()+1;
    shArch.getRange(start,1,rowsCopy.length,colCount).setValues(rowsCopy);
    // borrar en Agenda (descendente)
    toArchive.sort((a,b)=>b-a).forEach(rr => shAgenda.deleteRow(rr));
  }

  SpreadsheetApp.getActive().toast(
    `Agenda→Base Final: inserts ${inserted}, updates ${updated}, skip ${skipped}, archivados ${toArchive.length}`,
    'agenda_pushSelectedToBaseFinal', 6
  );
} */

/* ====== headers/índices de Agenda ====== */
function agendaHeaders_() {
  return [
    'ID',
    'Persona (auto)','Barrio (auto)','Fecha (auto)','Hora (auto)','Dirección (auto)',
    'Fuente',
    'Persona (manual)','Barrio (manual)','Fecha (manual)','Hora (manual)','Dirección (manual)',
    'Listo para enviar','Enviado a base','Enviado timestamp'
  ];
}
function agendaIdx_(hdr) {
  const idx = (name)=> hdr.indexOf(name);
  return {
    ID: idx('ID'),
    P_AUTO: idx('Persona (auto)'),
    B_AUTO: idx('Barrio (auto)'),
    F_AUTO: idx('Fecha (auto)'),
    H_AUTO: idx('Hora (auto)'),
    D_AUTO: idx('Dirección (auto)'),
    FUENTE: idx('Fuente'),
    P_MAN:  idx('Persona (manual)'),
    B_MAN:  idx('Barrio (manual)'),
    F_MAN:  idx('Fecha (manual)'),
    H_MAN:  idx('Hora (manual)'),
    D_MAN:  idx('Dirección (manual)'),
    LISTO:  idx('Listo para enviar'),
    ENVIADO:idx('Enviado a base'),
    ENVIADO_TS: idx('Enviado timestamp')
  };
}
