function syncB_to_B2() {
  const DEBUG = true;
  const SAMPLE_LOG_LIMIT = 10;
  const t0 = new Date();

  try {
    const ss  = SpreadsheetApp.getActive();
    const src = ss.getSheetByName('B');
    const dst = ss.getSheetByName('B2') || ss.insertSheet('B2');
    if (!src) throw new Error('No existe la hoja "B".');

    // === Headers destino asegurados (incluye manuales y etarios) ===
    const DEST_HEADERS = [
      'ID','Nombre','Persona','Barrio','Fecha','Inscriptos','Mail',
      'Call Center','IVR','RRSS','Difusión','Masculino','Femenino','KEY',
      'Fecha C','Clave PIM','Procesado BF','BarrioN',
      'Persona (manual)','Barrio (manual)','Fecha (manual)',
      '18-24','25-39','40-55','56-65','66+','Sin identificar'
    ];
    legEnsureHeaders_(dst, DEST_HEADERS);

    // === Mapeo columnas fuente B ===
    const srcHeaders = src.getRange(1, 1, 1, src.getLastColumn()).getValues()[0];
    const idx = (name) => {
      const i = srcHeaders.indexOf(name);
      if (i === -1) throw new Error('No se encontró la columna en B: ' + name);
      return i;
    };
    const iNombre      = idx('Nombre');
    const iFechaFin    = idx('Fecha_Fin');
    const iInscriptos  = idx('Inscriptos');
    const iUnique      = idx('Inscriptos unicos identificados');
    const iM           = idx('Inscriptos M');
    const iF           = idx('Inscriptos F');

    const iMailing     = idx('Inscriptos canal Mailing');
    const iFacebook    = idx('Inscriptos canal Facebook');
    const iGoogle      = idx('Inscriptos canal Google');
    const iCallCenter  = idx('Inscriptos canal Call Center');
    const iDifusion    = idx('Inscriptos canal Difusion');
    const iIVR         = idx('Inscriptos canal IVR');
    const iProgram     = idx('Inscriptos canal Programmatic');
    const iOtros       = idx('Inscriptos canal Otros');

    // Rangos etarios en B
    const iE18_24 = idx('Inscriptos edades 18-24');
    const iE25_39 = idx('Inscriptos edades 25-39');
    const iE40_55 = idx('Inscriptos edades 40-55');
    const iE56_65 = idx('Inscriptos edades 56-65');
    const iE66P   = idx('Inscriptos edades 66+');

    const srcRows = Math.max(0, src.getLastRow() - 1);
    if (srcRows === 0) return;
    const srcData = src.getRange(2, 1, srcRows, src.getLastColumn()).getValues();

    // === Índices destino por nombre de columna ===
    const dstHdrs = dst.getRange(1, 1, 1, Math.max(dst.getLastColumn(), DEST_HEADERS.length)).getValues()[0];
    const col = (h) => dstHdrs.indexOf(h) + 1;

    const colID     = col('ID');
    const colNOM    = col('Nombre');
    const colPER    = col('Persona');
    const colBAR    = col('Barrio');
    const colFEC    = col('Fecha');
    const colINS    = col('Inscriptos');
    const colMAIL   = col('Mail');
    const colCALL   = col('Call Center');
    const colIVR    = col('IVR');
    const colRRSS   = col('RRSS');
    const colDIF    = col('Difusión');
    const colMASC   = col('Masculino');
    const colFEM    = col('Femenino');
    const colKEY    = col('KEY');
    const colBARRN  = col('BarrioN');

    const colPMAN   = col('Persona (manual)');
    const colBMAN   = col('Barrio (manual)');
    const colFMAN   = col('Fecha (manual)');

    const colE18    = col('18-24');
    const colE25    = col('25-39');
    const colE40    = col('40-55');
    const colE56    = col('56-65');
    const colE66    = col('66+');
    const colSINID  = col('Sin identificar');

    // === Construir índice de filas existentes por KEY (Nombre normalizado + "|" + Inscriptos) ===
    const dstRows = Math.max(0, dst.getLastRow() - 1);
    const existingByKey = new Map(); // key -> rowIndex 2-based
    if (dstRows > 0) {
      const cur = dst.getRange(2, 1, dstRows, Math.max(dst.getLastColumn(), DEST_HEADERS.length)).getValues();
      for (let i = 0; i < cur.length; i++) {
        const nomCell = legStr_(cur[i][colNOM - 1]);
        const insVal  = legNum_(cur[i][colINS - 1]);
        const k       = buildKeyByNombreInscriptos_(nomCell, insVal);
        if (k) existingByKey.set(k, 2 + i);
      }
    }

    const tz = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';
    const newRows = [];
    const seenInRun = new Set();

    let updatesAges = 0;
    let inserts = 0;
    let skipped = 0;

    for (let r = 0; r < srcData.length; r++) {
      const row = srcData[r];
      const nombre   = legStr_(row[iNombre]);
      const fechaFin = row[iFechaFin];
      const ins      = legNum_(row[iInscriptos]);
      const unique   = legNum_(row[iUnique]);
      const nM       = legNum_(row[iM]);
      const nF       = legNum_(row[iF]);

      const mail     = legNum_(row[iMailing]);
      const callc    = legNum_(row[iCallCenter]);
      const ivr      = legNum_(row[iIVR]);
      const rrss     = legNum_(row[iFacebook]) + legNum_(row[iGoogle]) + legNum_(row[iProgram]);
      const difu     = legNum_(row[iDifusion]) + legNum_(row[iOtros]);

      // Rangos etarios desde B
      const e18  = legNum_(row[iE18_24]);
      const e25  = legNum_(row[iE25_39]);
      const e40  = legNum_(row[iE40_55]);
      const e56  = legNum_(row[iE56_65]);
      const e66  = legNum_(row[iE66P]);
      const sinI = Math.max(0, ins - (e18 + e25 + e40 + e56 + e66));

      const key    = buildKeyByNombreInscriptos_(nombre, ins);
      if (!key) { skipped++; continue; }
      if (seenInRun.has(key)) continue;
      seenInRun.add(key);

      // Si ya existe la KEY en B2 → UPDATE SOLO EDADES + SIN IDENTIFICAR (retrofit)
      const existsRow = existingByKey.get(key);
      if (existsRow) {
        // Actualizamos solo las columnas etarias + Sin identificar (no tocamos manuales ni otras)
        const vals = [];
        const cols = [];
        if (colE18)   { cols.push(colE18);   vals.push([e18]); }
        if (colE25)   { cols.push(colE25);   vals.push([e25]); }
        if (colE40)   { cols.push(colE40);   vals.push([e40]); }
        if (colE56)   { cols.push(colE56);   vals.push([e56]); }
        if (colE66)   { cols.push(colE66);   vals.push([e66]); }
        if (colSINID) { cols.push(colSINID); vals.push([sinI]); }

        // setValue por cada columna (evitamos escribir en bloque por columnas no contiguas)
        for (let c = 0; c < cols.length; c++) {
          dst.getRange(existsRow, cols[c]).setValue(vals[c][0]);
        }
        updatesAges++;
        if (DEBUG && updatesAges <= SAMPLE_LOG_LIMIT) Logger.log(`[UPD-AGES] row ${existsRow} -> e18=${e18}, e25=${e25}, e40=${e40}, e56=${e56}, e66=${e66}, sinId=${sinI}`);
        continue;
      }

      // Si NO existe → INSERT fila completa nueva
      const defaultYear = (legToDate_(fechaFin)?.getFullYear()) || new Date().getFullYear();
      const persona = (typeof detectPersona_ === 'function') ? detectPersona_(nombre) : '';
      const barrio  = (typeof detectBarrio_  === 'function') ? detectBarrio_(nombre) : '';
      let fecha     = (typeof detectFecha_   === 'function') ? detectFecha_(nombre, defaultYear) : null;
      if (!fecha && fechaFin) fecha = legToDate_(fechaFin);

      // Distribución aproximada de M/F como antes
      let masculino = 0, femenino = 0;
      if (unique > 0) {
        masculino = Math.round(ins * (nM / unique));
        femenino  = Math.round(ins * (nF / unique));
      }

      const idText = buildId_(nombre, fechaFin, tz);

      const outRow = new Array(DEST_HEADERS.length).fill('');
      outRow[DEST_HEADERS.indexOf('ID')]         = idText;
      outRow[DEST_HEADERS.indexOf('Nombre')]     = nombre;
      outRow[DEST_HEADERS.indexOf('Persona')]    = persona;
      outRow[DEST_HEADERS.indexOf('Barrio')]     = barrio;
      outRow[DEST_HEADERS.indexOf('Fecha')]      = fecha;
      outRow[DEST_HEADERS.indexOf('Inscriptos')] = ins;
      outRow[DEST_HEADERS.indexOf('Mail')]       = mail;
      outRow[DEST_HEADERS.indexOf('Call Center')] = callc;
      outRow[DEST_HEADERS.indexOf('IVR')]        = ivr;
      outRow[DEST_HEADERS.indexOf('RRSS')]       = rrss;
      outRow[DEST_HEADERS.indexOf('Difusión')]   = difu;
      outRow[DEST_HEADERS.indexOf('Masculino')]  = masculino;
      outRow[DEST_HEADERS.indexOf('Femenino')]   = femenino;
      outRow[DEST_HEADERS.indexOf('KEY')]        = key;

      // Manuales quedan vacíos (los completa la gente)
      // Edades
      outRow[DEST_HEADERS.indexOf('18-24')]          = e18;
      outRow[DEST_HEADERS.indexOf('25-39')]          = e25;
      outRow[DEST_HEADERS.indexOf('40-55')]          = e40;
      outRow[DEST_HEADERS.indexOf('56-65')]          = e56;
      outRow[DEST_HEADERS.indexOf('66+')]            = e66;
      outRow[DEST_HEADERS.indexOf('Sin identificar')] = sinI;

      newRows.push(outRow);
      inserts++;
      if (DEBUG && inserts <= SAMPLE_LOG_LIMIT) Logger.log('[INS] ' + JSON.stringify({key, nombre, ins}));
    }

    if (newRows.length) {
      const startRow = dst.getLastRow() + 1;
      dst.getRange(startRow, 1, newRows.length, DEST_HEADERS.length).setValues(newRows);
      // Formato fecha
      dst.getRange(startRow, DEST_HEADERS.indexOf('Fecha')+1, newRows.length, 1).setNumberFormat('dd/mm/yyyy');
    }

    SpreadsheetApp.getActive().toast(
      `B2 ← B | insertadas: ${inserts} | edades actualizadas: ${updatesAges} | skip: ${skipped} | ${new Date()-t0} ms`,
      'syncB_to_B2', 6
    );

  } catch (err) {
    Logger.log('❌ ERROR en syncB_to_B2: ' + err);
    SpreadsheetApp.getActive().toast('Error: ' + err, 'syncB_to_B2', 8);
    throw err;
  }
}

/* ================== helpers ================== */
function buildKeyByNombreInscriptos_(nombre, inscriptos) {
  const nom = legNormalizeText_(nombre);
  const ins = legNum_(inscriptos);
  if (!nom) return '';
  return `${nom}|${ins}`;
}
function buildId_(nombre, fechaFin, tz) {
  const zone = tz || Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';
  const d = legToDate_(fechaFin);
  const dTxt = d ? Utilities.formatDate(d, zone, 'dd/MM/yyyy') : '';
  const nom = (nombre == null ? '' : String(nombre)).trim();
  return (nom && dTxt) ? `${nom} - ${dTxt}` : (nom || dTxt);
}
function legToDate_(val) {
  if (!val) return null;
  if (Object.prototype.toString.call(val) === '[object Date]') {
    return isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
function legNormalizeText_(s) {
  return (s || '')
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
    .replace(/[\u2012\u2013\u2014\u2212]/g, '-')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/\s+/g,' ').trim();
}
function legNum_(v){ if (v===''||v==null) return 0; if (typeof v==='number') return v; const n=Number(String(v).replace(',','.')); return isNaN(n)?0:n; }
function legStr_(v){ return v==null ? '' : String(v).trim(); }
