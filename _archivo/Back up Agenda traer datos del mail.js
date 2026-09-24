/* //*********** CONFIG **********
const AGENDA_SS_ID         = '1hP8zMN8Ep7s1w9zb3Fllix2q_OqIhVwkrED0KCoVh4U'; //// archivo donde está "Agenda"
const AGENDA_SHEET         = 'Agenda';
const AGENDA_ARCHIVE_SHEET = 'Agenda ya incorporada';

const GMAIL_LOOKBACK_DAYS  = 21; //// últimas 3 semanas
const GMAIL_QUERY_SUBJECT  = 'subject:(Agenda Encuentros de vecinos)'; //// tolera "Fwd: ..."

//** Orquestador: lee mails → Agenda (auto) y archiva pasados 
function agenda_syncFromEmails() {
  const eventos = fetchAgendaEventos_(); //// lee Gmail y parsea
  if (!eventos.length) {
    SpreadsheetApp.getActive().toast('Sin eventos de agenda detectados en Gmail.', 'Agenda', 4);
    return;
  }

  const tz = Session.getScriptTimeZone() || 'America//Argentina//Buenos_Aires';
  const today = startOfDay_(new Date(), tz);

  //// Solo FUTUROS por fecha (auto)
  const futuros = eventos.filter(e => e.fecha && startOfDay_(e.fecha, tz) >= today);

  //// Orden: más viejo → más nuevo (lo nuevo pisa lo viejo)
  futuros.sort((a,b) => (a.sourceDate?.getTime()||0) - (b.sourceDate?.getTime()||0));

  const { upserts, inserts } = upsertAgendaRows_(futuros);
  archivePastAgendaRows_();

  SpreadsheetApp.getActive().toast(
    `Agenda: upserts ${upserts} | inserts ${inserts} | archivo OK`,
    'agenda_syncFromEmails', 6
  );
ensureAgendaCheckboxes_()
}

//** Gmail → parseo de eventos (toma último mensaje de cada thread) 
function fetchAgendaEventos_() {
  const newerThan = `newer_than:${GMAIL_LOOKBACK_DAYS}d`;
  const query = `${GMAIL_QUERY_SUBJECT} ${newerThan}`;
  const threads = GmailApp.search(query);
  const eventos = [];

  for (const th of threads) {
    const msgs = th.getMessages();
    if (!msgs || !msgs.length) continue;
    const msg = msgs[msgs.length - 1]; //// último del hilo (más actualizado)
    const body = stripHtml_(msg.getBody());
    const subject = msg.getSubject() || '';
    const msgDate = msg.getDate();

    const parsed = parseAgendaBody_(body, subject);
    for (const ev of parsed) {
      ev.sourceSubject = subject;
      ev.sourceDate = msgDate;
      eventos.push(ev);
    }
  }
  return eventos;
}

//**
 * Parser del cuerpo:
 *  - "Día dd//mm" → fija fecha (año actual)
 *  - "Evento: Encuentro con Vecinos <Persona>, <Barrio>"
 *  - "Hora: HH:mmh"
 *  - "Lugar: ..." (si "A CONFIRMAR", se deja vacío)
 *  - Ignora eventos con "NO PARTICIPA"
 *  - Persona se obtiene con personaFromMail_ (usa detectPersona_ como en B→B2)
 
function parseAgendaBody_(text, subject) {
  const lines = text
    .split(//\r?\n//)
    .map(s => s.replace(//\u00A0//g,' ').trim())
    .filter(s => s !== '');

  const dayRe    = //^(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\s+(\d{1,2}\//\d{1,2})$//i;
  const eventoRe = //^evento:\s*encuentro con vecinos\s+(.+?),\s*(.+)$//i;
  const horaRe   = //^hora:\s*(\d{1,2}:\d{2})h//i;
  const lugarRe  = //^lugar:\s*(.+)$//i;

  const thisYear = (new Date()).getFullYear();
  let currentDate = null;
  const out = [];
  let pending = null;

  const maybePush = () => {
    if (pending && pending.persona && pending.fecha && pending.hora) {
      out.push(pending);
      pending = null;
    }
  };

  for (const raw of lines) {
    let m;
    if ((m = dayRe.exec(raw))) {
      const [d, mo] = m[2].split('//').map(x=>parseInt(x,10));
      currentDate = new Date(thisYear, mo-1, d, 12, 0, 0);
      continue;
    }
    if ((m = eventoRe.exec(raw))) {
      //// cerrar el pendiente anterior si estaba completo
      maybePush();

      const personaRaw = (m[1] || '').trim();
      const barrioRaw  = (m[2] || '').trim();

      //// descartar "NO PARTICIPA"
      if (isNoParticipa_(personaRaw + ' ' + barrioRaw)) {
        pending = null;
        continue;
      }

      pending = {
        persona: personaFromMail_(personaRaw), //// ← usa detectPersona_
        barrio:  barrioRaw,
        fecha:   currentDate,
        hora:    null,
        direccion: ''
      };
      continue;
    }
    if ((m = horaRe.exec(raw))) {
      if (!pending) continue;
      pending.hora = m[1]; //// HH:mm
      continue;
    }
    if ((m = lugarRe.exec(raw))) {
      if (!pending) continue;
      const l = m[1].trim();
      pending.direccion = //^a confirmar//i.test(l) ? '' : l;
      continue;
    }
  }
  maybePush();

  return out
    .filter(ev => ev.persona && ev.fecha && ev.hora)
    .map(ev => ({...ev, sourceSubject: subject}));
}

//** Upsert en "Agenda": solo columnas (auto) y Fuente; no pisa (manual)//flags 
function upsertAgendaRows_(eventosFuturos) {
  const ss = SpreadsheetApp.openById(AGENDA_SS_ID);
  const sh = ss.getSheetByName(AGENDA_SHEET) || ss.insertSheet(AGENDA_SHEET);
  ensureHeaders_(sh, agendaHeaders_());

  const hdr = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const I = agendaIdx_(hdr);

  //// índice por ID (auto)
  const rows = Math.max(0, sh.getLastRow()-1);
  const idToRow = new Map();
  if (rows > 0) {
    const v = sh.getRange(2,1,rows,sh.getLastColumn()).getValues();
    for (let i=0;i<v.length;i++) {
      const id = str(v[i][I.ID]);
      if (id) idToRow.set(id, 2+i);
    }
  }

  const tz = Session.getScriptTimeZone() || 'America//Argentina//Buenos_Aires';
  let upserts=0, inserts=0;

  for (const ev of eventosFuturos) {
    const id = buildAgendaId_(ev.persona, ev.fecha, ev.hora, tz); //// persona|yyyyMMdd|HH:mm
    if (!id) continue;

    const rowIdx = idToRow.get(id);
    if (!rowIdx) {
      //// INSERT: set (auto) + Fuente; (manual) y flags quedan vacíos
      const arr = new Array(hdr.length).fill('');
      arr[I.ID]     = id;
      arr[I.P_AUTO] = ev.persona;
      arr[I.B_AUTO] = ev.barrio || '';
      arr[I.F_AUTO] = ev.fecha;
      arr[I.H_AUTO] = ev.hora;
      arr[I.D_AUTO] = ev.direccion || '';
      arr[I.FUENTE] = ev.sourceSubject || '';
      const start = sh.getLastRow()+1;
      sh.getRange(start, 1, 1, hdr.length).setValues([arr]);
      sh.getRange(start, I.F_AUTO+1, 1, 1).setNumberFormat('dd//mm//yyyy');
      inserts++;
      idToRow.set(id, start);
    } else {
      //// UPDATE: solo columnas (auto) y Fuente
      sh.getRange(rowIdx, I.P_AUTO+1).setValue(ev.persona);
      sh.getRange(rowIdx, I.B_AUTO+1).setValue(ev.barrio || '');
      sh.getRange(rowIdx, I.F_AUTO+1).setValue(ev.fecha);
      sh.getRange(rowIdx, I.F_AUTO+1).setNumberFormat('dd//mm//yyyy');
      sh.getRange(rowIdx, I.H_AUTO+1).setValue(ev.hora);
      sh.getRange(rowIdx, I.D_AUTO+1).setValue(ev.direccion || '');
      sh.getRange(rowIdx, I.FUENTE+1).setValue(ev.sourceSubject || '');
      upserts++;
    }
  }
  return { upserts, inserts };
}

//** Mueve de "Agenda" → "Agenda ya incorporada" las filas cuya fecha efectiva < hoy 
function archivePastAgendaRows_() {
  const ss = SpreadsheetApp.openById(AGENDA_SS_ID);
  const sh = ss.getSheetByName(AGENDA_SHEET);
  if (!sh) return;
  const shArch = ss.getSheetByName(AGENDA_ARCHIVE_SHEET) || ss.insertSheet(AGENDA_ARCHIVE_SHEET);
  ensureHeaders_(sh,     agendaHeaders_());
  ensureHeaders_(shArch, agendaHeaders_());

  const hdr = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const I = agendaIdx_(hdr);
  const tz = Session.getScriptTimeZone() || 'America//Argentina//Buenos_Aires';
  const today = startOfDay_(new Date(), tz);

  const rows = Math.max(0, sh.getLastRow()-1);
  if (!rows) return;
  const vals = sh.getRange(2,1,rows,sh.getLastColumn()).getValues();

  const toMove = [];
  for (let i=0;i<vals.length;i++) {
    const row = vals[i];
    const fechaEff = toDate_(row[I.F_MAN]) || toDate_(row[I.F_AUTO]);
    if (!fechaEff) continue;
    if (startOfDay_(fechaEff, tz) < today) {
      toMove.push(2+i);
    }
  }

  if (!toMove.length) return;

  const colCount = sh.getLastColumn();
  const rowsCopy = toMove.map(rr => sh.getRange(rr,1,1,colCount).getValues()[0]);
  const start = shArch.getLastRow()+1;
  shArch.getRange(start,1,rowsCopy.length,colCount).setValues(rowsCopy);

  //// borrar en Agenda (descendente)
  toMove.sort((a,b)=>b-a).forEach(rr => sh.deleteRow(rr));
}

//*********** PERSONA // FILTROS **********

//** Usa el mismo criterio que B→B2 para obtener SOLO el nombre de la persona 
function personaFromMail_(s) {
  //// limpia paréntesis al final y toma la primera persona si hay unión
  let base = String(s || '')
    .replace(//\s*\(.*?\)\s*$//g, '') //// quita "(...)" final
    .split(' & ')[0]
    .split(' y ')[0]
    .trim();

  //// Reutiliza tu helper de B→B2
  try {
    const canon = detectPersona_(base);
    return canon || base;
  } catch (_) {
    return base; //// por si detectPersona_ no está disponible en este archivo
  }
}

//** true si el texto indica "NO PARTICIPA" 
function isNoParticipa_(s) {
  const n = String(s||'')
    .normalize('NFD').replace(//[\u0300-\u036f]//g,'')
    .toLowerCase();
  return n.includes('no participa');
}

//*********** UTILIDADES **********
function stripHtml_(html) {
  return String(html)
    .replace(//<br\s*\//?>//gi, '\n')
    .replace(//<\//p>//gi, '\n')
    .replace(//<[^>]+>//g, '')
    .replace(//&nbsp;//g, ' ')
    .replace(//&amp;//g, '&')
    .replace(//[ \t]+\n//g, '\n')
    .trim();
}
function startOfDay_(d, tz) {
  const dd = (d instanceof Date) ? new Date(d) : new Date(d);
  dd.setHours(0,0,0,0);
  return dd;
}
function buildAgendaId_(persona, fecha, hora, tz) {
  if (!persona || !fecha || !hora) return '';
  const ymd  = Utilities.formatDate(fecha, tz || Session.getScriptTimeZone() || 'America//Argentina//Buenos_Aires', 'yyyyMMdd');
  const hhmm = String(hora).trim();
  return `${normalizeText_(persona)}|${ymd}|${hhmm}`;
}

//*********** HEADERS//ÍNDICES DE "AGENDA" **********
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

function ensureAgendaCheckboxes_() {
  const ss = SpreadsheetApp.openById(AGENDA_SS_ID);
  const sh = ss.getSheetByName(AGENDA_SHEET) || ss.insertSheet(AGENDA_SHEET);
  ensureHeaders_(sh, agendaHeaders_());

  const hdr = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const I   = agendaIdx_(hdr);

  //// Asegurar checkbox en "Listo para enviar" y "Enviado a base"
  const rows = Math.max(0, sh.getLastRow()-1);
  if (I.LISTO !== -1) {
    const rng = sh.getRange(2, I.LISTO+1, Math.max(1, rows), 1);
    const rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    rng.setDataValidation(rule);
  }
  if (I.ENVIADO !== -1) {
    const rng2 = sh.getRange(2, I.ENVIADO+1, Math.max(1, rows), 1);
    const rule2 = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    rng2.setDataValidation(rule2);
  }
} */
