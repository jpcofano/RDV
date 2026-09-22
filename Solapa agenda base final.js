const DEST_AGENDA_SHEET    = 'Agenda'; // solapa espejo en la base

function syncAgendaSheetInBaseFromAgenda_2() {
  const tz = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';

  // === Abrimos Agenda original ===
  const ssA = SpreadsheetApp.openById(AGENDA_SS_ID);
  const shA = ssA.getSheetByName(AGENDA_SHEET);
  if (!shA) throw new Error('No existe la hoja Agenda en el archivo de Agenda');

  ensureHeaders_(shA, agendaHeaders_());
  const aHdr  = shA.getRange(1,1,1,shA.getLastColumn()).getValues()[0];
  const I     = agendaIdx_(aHdr);
  const nRows = Math.max(0, shA.getLastRow()-1);

  // índice de "Barrio Estimado" si existe en la hoja Agenda
  const idxBEst = aHdr.indexOf('Barrio Estimado');

  if (!nRows) {
    // nada en agenda, limpiamos la solapa Agenda en base y dejamos sólo headers
    const ssBase = SpreadsheetApp.openById(DEST_SS_ID);
    const shBaseMain = ssBase.getSheetByName(DEST_SHEET_NAME) || ssBase.insertSheet(DEST_SHEET_NAME);
    const baseHdr = shBaseMain.getRange(1,1,1,Math.max(1, shBaseMain.getLastColumn())).getValues()[0];
    const shAgendaBase = ssBase.getSheetByName(DEST_AGENDA_SHEET) || ssBase.insertSheet(DEST_AGENDA_SHEET);
    shAgendaBase.clear();
    shAgendaBase.getRange(1,1,1,baseHdr.length).setValues([baseHdr]);
    return;
  }

  const valsA = shA.getRange(2,1,nRows,shA.getLastColumn()).getValues();

  // === Abrimos Base Final para tomar estructura de columnas (Para Revisar) ===
  const ssBase = SpreadsheetApp.openById(DEST_SS_ID);
  const shBaseMain = ssBase.getSheetByName(DEST_SHEET_NAME) || ssBase.insertSheet(DEST_SHEET_NAME);

  const baseHdr1 = shBaseMain.getRange(1,1,1,Math.max(1, shBaseMain.getLastColumn())).getValues()[0];
  // Aseguramos que "Para Revisar" tenga las columnas mínimas
  ensureColumnsExist_(shBaseMain, baseHdr1, [
    'Figura','Barrio','FECHA','HORA','Dirección','STATUS REUNIÓN','Asistentes','ID',
    'Inscriptos','Mail','Call Center','IVR','RRSS','Difusión','Masculinos','Femeninos'
  ]);
  const baseHdr = shBaseMain.getRange(1,1,1,shBaseMain.getLastColumn()).getValues()[0];

  const D = {
    Figura: findIdxOr_(baseHdr, ['figura','persona','nombre']),
    Barrio: findIdxOr_(baseHdr, ['barrio']),
    FECHA:  findIdxOr_(baseHdr, ['fecha']),
    HORA:   findIdxOr_(baseHdr, ['hora'], true),
    Dir:    findIdxOr_(baseHdr, ['direccion','dirección'], true),
    Status: findIdxOr_(baseHdr, ['status reunión','status reunion','estado reunión','estado reunion'], true),
    Asis:   findIdxOr_(baseHdr, ['asistentes','asistente'], true),
    ID:     findIdxOr_(baseHdr, ['id'], true),
  };

  // === Solapa "Agenda" dentro de la base ===
  const shAgendaBase = ssBase.getSheetByName(DEST_AGENDA_SHEET) || ssBase.insertSheet(DEST_AGENDA_SHEET);

  // Limpiamos todo y copiamos headers con mismo orden que "Para Revisar"
  shAgendaBase.clear();
  shAgendaBase.getRange(1,1,1,baseHdr.length).setValues([baseHdr]);

  // Primero armamos objetos {fecha, arr} para poder ordenar luego
  const temp = [];

  for (let i=0; i<nRows; i++) {
    const row = valsA[i];

    const persona = str(row[I.P_MAN]) || str(row[I.P_AUTO]);
    const bMan    = str(row[I.B_MAN]);
    const bAuto   = str(row[I.B_AUTO]);
    const bEst    = idxBEst !== -1 ? str(row[idxBEst]) : '';
    const fecha   = toDate_(row[I.F_MAN]) || toDate_(row[I.F_AUTO]);
    const horaTxt = formatHoraTextSeconds_(row[I.H_MAN]) || formatHoraTextSeconds_(row[I.H_AUTO]);
    const dir     = str(row[I.D_MAN]) || str(row[I.D_AUTO]);

    if (!persona || !fecha) {
      // sin figura o sin fecha no tiene sentido mostrarlo en la agenda de la base
      continue;
    }

    // === ORDEN DE BARRIO con validación:
    // manual (si es barrio válido) > auto (válido) > estimado (válido) ===
    let barrioRaw = '';

    if (bMan && isValidBarrio_(bMan)) {
      barrioRaw = bMan;
    } else if (bAuto && isValidBarrio_(bAuto)) {
      barrioRaw = bAuto;
    } else if (bEst && isValidBarrio_(bEst)) {
      barrioRaw = bEst;
    }

    // Normalización del barrio elegido
    let barrioN = '';
    if (barrioRaw) {
      // si tenés mapBarrioCanon_ usalo, si no, canonBarrio_ o similar
      try {
        if (typeof mapBarrioCanon_ === 'function') {
          barrioN = mapBarrioCanon_(barrioRaw) || barrioRaw;
        } else if (typeof canonBarrio_ === 'function') {
          barrioN = canonBarrio_(barrioRaw) || barrioRaw;
        } else {
          barrioN = barrioRaw;
        }
      } catch (_) {
        barrioN = barrioRaw;
      }
    }

    const idText = buildIdFinal_(persona, barrioN, fecha, tz);

    const arr = new Array(baseHdr.length).fill('');
    if (D.Figura!=null) arr[D.Figura] = persona;
    if (D.Barrio!=null) arr[D.Barrio] = barrioN || '';
    if (D.FECHA !=null) arr[D.FECHA]  = fecha;
    if (D.HORA  !=null) arr[D.HORA]   = horaTxt || '';
    if (D.Dir   !=null) arr[D.Dir]    = dir || '';
    if (D.Status!=null) arr[D.Status] = 'en agenda';
    if (D.ID    !=null) arr[D.ID]     = idText;

    temp.push({ fecha, arr });
  }

  if (temp.length) {
    // Ordenar por fecha ascendente (las más viejas primero)
    temp.sort((a, b) => a.fecha - b.fecha);

    const out = temp.map(o => o.arr);

    shAgendaBase.getRange(2,1,out.length,baseHdr.length).setValues(out);

    if (D.FECHA != null) {
      shAgendaBase.getRange(2, D.FECHA+1, out.length, 1).setNumberFormat('dd/mm/yyyy');
    }
    if (D.HORA != null) {
      const rngH = shAgendaBase.getRange(2, D.HORA+1, out.length, 1);
      rngH.setNumberFormat('@STRING@');
    }
  }
}

/*********** BARRIOS CABA: normalización, alias y validación ***********/

/** Normaliza texto (minúsculas, sin tildes, colapsa espacios) */
function _norm_(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
}

/** Lista canónica (48 barrios + alias “Pompeya” → Nueva Pompeya) */
const CABA_BARRIOS_CANON = [
  'Agronomía','Almagro','Balvanera','Barracas','Belgrano','Boedo','Caballito','Chacarita','Coghlan','Colegiales',
  'Constitución','Flores','Floresta','La Boca','La Paternal','Liniers','Mataderos','Monte Castro','Monserrat',
  'Nueva Pompeya','Núñez','Palermo','Parque Avellaneda','Parque Chacabuco','Parque Chas','Parque Patricios',
  'Puerto Madero','Recoleta','Retiro','Saavedra','San Cristóbal','San Nicolás','San Telmo','Vélez Sarsfield',
  'Versalles','Villa Crespo','Villa del Parque','Villa Devoto','Villa Gral. Mitre','Villa Lugano','Villa Luro',
  'Villa Ortúzar','Villa Pueyrredón','Villa Real','Villa Riachuelo','Villa Santa Rita','Villa Soldati','Villa Urquiza'
];

/** Alias habituales → canónico */
const BARRIO_ALIAS_MAP = (function () {
  const map = new Map();
  const pairs = [
    // simples
    ['agronomia','Agronomía'], ['almagro','Almagro'], ['balvanera','Balvanera'], ['barracas','Barracas'],
    ['belgrano','Belgrano'], ['boedo','Boedo'], ['caballito','Caballito'], ['chacarita','Chacarita'],
    ['coghlan','Coghlan'], ['colegiales','Colegiales'], ['constitucion','Constitución'],
    ['flores','Flores'], ['floresta','Floresta'], ['la boca','La Boca'], ['boca','La Boca'],
    ['la paternal','La Paternal'], ['paternal','La Paternal'], ['liniers','Liniers'], ['mataderos','Mataderos'],
    ['monte castro','Monte Castro'], ['monserrat','Monserrat'],
    ['nueva pompeya','Nueva Pompeya'], ['pompeya','Nueva Pompeya'],
    ['nunez','Núñez'], ['núñez','Núñez'], ['nunez','Núñez'],
    ['palermo','Palermo'], ['parque avellaneda','Parque Avellaneda'], ['parque chacabuco','Parque Chacabuco'],
    ['parque chas','Parque Chas'], ['parque patricios','Parque Patricios'], ['puerto madero','Puerto Madero'],
    ['recoleta','Recoleta'], ['retiro','Retiro'], ['saavedra','Saavedra'],
    ['san cristobal','San Cristóbal'], ['san cristóbal','San Cristóbal'],
    ['san nicolas','San Nicolás'], ['san nicolás','San Nicolás'], ['san nicolás','San Nicolás'],
    ['san telmo','San Telmo'], ['velez sarsfield','Vélez Sarsfield'], ['vélez sarsfield','Vélez Sarsfield'],
    ['versalles','Versalles'], ['villa crespo','Villa Crespo'], ['villa del parque','Villa del Parque'],
    ['villa devoto','Villa Devoto'], ['villa gral mitre','Villa General Mitre'], ['villa general mitre','Villa Gral. Mitre'],
    ['villa lugano','Villa Lugano'], ['villa luro','Villa Luro'], ['villa ortuzar','Villa Ortúzar'], ['villa ortúzar','Villa Ortúzar'],
    ['villa pueyrredon','Villa Pueyrredón'], ['villa pueyrredón','Villa Pueyrredón'], ['villa real','Villa Real'],
    ['villa riachuelo','Villa Riachuelo'], ['villa sta rita','Villa Santa Rita'], ['villa santa rita','Villa Santa Rita'],
    ['villa soldati','Villa Soldati'], ['villa urquiza','Villa Urquiza']
  ];
  pairs.forEach(([k, v]) => map.set(k, v));
  return map;
})();

/** Devuelve el nombre canónico del barrio o '' si no reconoce */
function canonBarrio_(s) {
  const ns = _norm_(s);
  if (!ns) return '';
  if (BARRIO_ALIAS_MAP.has(ns)) return BARRIO_ALIAS_MAP.get(ns);
  const exact = CABA_BARRIOS_CANON.find(b => _norm_(b) === ns);
  return exact || '';
}

/** true si el string corresponde a un barrio válido (canónico o alias) */
function isValidBarrio_(s) {
  if (!s) return false;
  return !!canonBarrio_(s);
}

/** Mapea cualquier entrada (manual/auto/estimado) a canónico; '' si no reconoce */
function mapBarrioCanon_(s) {
  return canonBarrio_(s);
}
