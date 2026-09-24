/**
 * Valida consistencia entre:
 *  - A2 (campos operativos) vs Base Final
 *  - B2 (canales/cortes)   vs Base Final
 * Y control extra sobre:
 *  - Duplicados en Base Final por clave (Figura+Barrio+Fecha)
 *  - Filas en Base Final sin correspondencia en A2/B2 (Orphans)
 *  - Barrios canónicos y Status permitidos
 *
 * Resultado: hoja "VALIDACION" con el detalle de problemas.
 */
function validateConsistencyA2B2_vs_BaseFinal() {
  // === CONFIG ===
  const SHEET_A2 = 'A2';
  const SHEET_B2 = 'B2';
  const DEST_SPREADSHEET_ID = '1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo';
  const DEST_SHEET_NAME = 'RVD JM-CM - ES2';
  const OUT_SHEET = 'VALIDACION';
  const tz = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';

  // Barrios canónicos (exactamente como los definiste)
  const CANON_BARRIOS = new Set([
    'Agronomía','Almagro','Balvanera','Barracas','Belgrano','Boedo','Caballito','Chacarita','Coghlan','Colegiales',
    'Constitución','Flores','Floresta','La Boca','La Paternal','Liniers','Mataderos','Monserrat','Monte Castro',
    'Nueva Pompeya','Núñez','Palermo','Parque Avellaneda','Parque Chacabuco','Parque Chas','Parque Patricios',
    'Puerto Madero','Recoleta','Retiro','Saavedra','San Cristóbal','San Nicolás','San Telmo','Vélez Sarsfield',
    'Versalles','Villa Crespo','Villa del Parque','Villa Devoto','Villa Gral. Mitre','Villa Lugano','Villa Luro',
    'Villa Ortúzar','Villa Pueyrredón','Villa Real','Villa Riachuelo','Villa Santa Rita','Villa Soldati','Villa Urquiza'
  ]);
  const ALLOWED_STATUSES_BF = new Set(['Realizada','Suspendida','Reprogramada','en agenda','Se modifico el barrio']);

  // === Abrir hojas ===
  const ss = SpreadsheetApp.getActive();
  const shA = ss.getSheetByName(SHEET_A2);
  const shB = ss.getSheetByName(SHEET_B2);
  if (!shA) throw new Error('No existe la hoja A2');
  if (!shB) throw new Error('No existe la hoja B2');

  const destSS = SpreadsheetApp.openById(DEST_SPREADSHEET_ID);
  const shD = destSS.getSheetByName(DEST_SHEET_NAME);
  if (!shD) throw new Error('No existe la hoja destino: ' + DEST_SHEET_NAME);

  // === Índices A2 ===
  const aHdr = shA.getRange(1,1,1,shA.getLastColumn()).getValues()[0];
  const A = {
    Figura: findIdxOr_(aHdr, ['figura','persona','nombre']),
    Barrio: findIdxOr_(aHdr, ['barrio']),
    Fecha:  findIdxOr_(aHdr, ['fecha']),
    Hora:   findIdxOr_(aHdr, ['hora'], true),
    Dir:    findIdxOr_(aHdr, ['direccion','dirección'], true),
    Status: findIdxOr_(aHdr, ['status reunión','status reunion','estado reunión','estado reunion'], true),
    Asis:   findIdxOr_(aHdr, ['asistentes','asistente'], true),
    ID:     findIdxOr_(aHdr, ['id'], true)
  };
  const rowsA = Math.max(0, shA.getLastRow()-1);
  const dataA = rowsA ? shA.getRange(2,1,rowsA,shA.getLastColumn()).getValues() : [];

  // === Índices B2 ===
  const bHdr = shB.getRange(1,1,1,shB.getLastColumn()).getValues()[0];
  const B = {
    Figura: findIdxOr_(bHdr, ['persona','figura','nombre']),
    Barrio: findIdxOr_(bHdr, ['barrio']),
    Fecha:  findIdxOr_(bHdr, ['fecha']),
    Ins:    findIdxOr_(bHdr, ['inscriptos','inscritos']),
    Mail:   findIdxOr_(bHdr, ['mail','mailing','email']),
    Call:   findIdxOr_(bHdr, ['call center','callcenter']),
    IVR:    findIdxOr_(bHdr, ['ivr']),
    RRSS:   findIdxOr_(bHdr, ['rrss'], true),
    FB:     findIdxOr_(bHdr, ['facebook'], true),
    GG:     findIdxOr_(bHdr, ['google'], true),
    PR:     findIdxOr_(bHdr, ['programmatic'], true),
    Dif:    findIdxOr_(bHdr, ['difusión','difusion']),
    Mac:    findIdxOr_(bHdr, ['maculino','masculino','maculinos','masculinos'], true),
    Fem:    findIdxOr_(bHdr, ['femenino','femeninos'], true)
  };
  const rowsB = Math.max(0, shB.getLastRow()-1);
  const dataB = rowsB ? shB.getRange(2,1,rowsB,shB.getLastColumn()).getValues() : [];

  // === Índices Destino ===
  const dHdr = shD.getRange(1,1,1,shD.getLastColumn()).getValues()[0];
  const D = {
    Figura: findIdxOr_(dHdr, ['figura','persona','nombre']),
    Barrio: findIdxOr_(dHdr, ['barrio']),
    Fecha:  findIdxOr_(dHdr, ['fecha']),
    Hora:   findIdxOr_(dHdr, ['hora'], true),
    Dir:    findIdxOr_(dHdr, ['direccion','dirección'], true),
    Status: findIdxOr_(dHdr, ['status reunión','status reunion','estado reunión','estado reunion'], true),
    Asis:   findIdxOr_(dHdr, ['asistentes','asistente'], true),
    ID:     findIdxOr_(dHdr, ['id'], true),
    Ins:    findIdxOr_(dHdr, ['inscriptos','inscritos'], true),
    Mail:   findIdxOr_(dHdr, ['mail','mailing','email'], true),
    Call:   findIdxOr_(dHdr, ['call center','callcenter'], true),
    IVR:    findIdxOr_(dHdr, ['ivr'], true),
    RRSS:   findIdxOr_(dHdr, ['rrss'], true),
    Dif:    findIdxOr_(dHdr, ['difusión','difusion'], true),
    Mac:    findIdxOr_(dHdr, ['maculinos','masculinos','maculino','masculino'], true),
    Fem:    findIdxOr_(dHdr, ['femeninos','femenino'], true)
  };
  const rowsD = Math.max(0, shD.getLastRow()-1);
  const dataD = rowsD ? shD.getRange(2,1,rowsD,shD.getLastColumn()).getValues() : [];

  // === Armar mapas por clave (Figura+Barrio+Fecha) ===
  const key = (fig,barrio,fecha) => keyFBF_(fig, barrio, fecha);
  const Dmap = new Map(); // key -> {rowIndex, arr}
  const Ddups = new Map(); // key -> [rowIndex1,rowIndex2,...]
  for (let i=0;i<dataD.length;i++) {
    const r = dataD[i];
    const k = key(r[D.Figura], r[D.Barrio], r[D.Fecha]);
    if (!k) continue;
    if (Dmap.has(k)) {
      // duplicado
      const list = Ddups.get(k) || [Dmap.get(k).rowIndex];
      list.push(2+i);
      Ddups.set(k, list);
    } else {
      Dmap.set(k, {rowIndex: 2+i, arr: r});
    }
  }

  // Conjuntos para detectar orphans en BF
  const keysFromSources = new Set();

  // === Salida de validación ===
  const OUT_HEADERS = [
    'Origen','Fila origen','Clave','Tipo','Campo',
    'Valor Origen','Valor Base Final','Sugerencia'
  ];
  const results = [];

  // ===== 1) Validar A2 -> Base Final (campos operativos) =====
  for (let i=0;i<dataA.length;i++) {
    const r = dataA[i];
    const figura = str(r[A.Figura]), barrio = str(r[A.Barrio]), fec = toDate_(r[A.Fecha]);
    if (!figura || !barrio || !fec) continue;
    const k = key(figura, barrio, fec);
    keysFromSources.add(k);

    const hit = Dmap.get(k);
    if (!hit) {
      results.push(['A2', 2+i, k, 'FALTA EN BASE FINAL', '', '', '', 'Cargar/Upsert antes de validar']);
      continue;
    }
    const R = hit.arr;

    // Barrio canónico en A2 (ya debería estar normalizado)
    if (!CANON_BARRIOS.has(barrio)) {
      results.push(['A2', 2+i, k, 'BARRIO NO CANÓNICO', 'Barrio', barrio, '', 'Normalizar con normalizeBarriosIn(A2)']);
    }

    // Comparaciones
    cmpDate_('A2', 2+i, k, 'FECHA', fec, R[D.Fecha], results, tz);
    cmpText_('A2', 2+i, k, 'Figura', figura, R[D.Figura], results);
    cmpText_('A2', 2+i, k, 'Barrio', barrio, R[D.Barrio], results);
    if (A.Hora!=null && D.Hora!=null) cmpText_('A2', 2+i, k, 'HORA', r[A.Hora], R[D.Hora], results);
    if (A.Dir !=null && D.Dir !=null) cmpText_('A2', 2+i, k, 'Dirección', r[A.Dir], R[D.Dir], results);

    // Status: comparar mapeado-permitido contra BF
    if (A.Status!=null && D.Status!=null) {
      const sA = mapStatusToAllowed_(str(r[A.Status]));
      const sD = str(R[D.Status]);
      if (sD && !ALLOWED_STATUSES_BF.has(sD)) {
        results.push(['BaseFinal', hit.rowIndex, k, 'STATUS NO PERMITIDO', 'STATUS REUNIÓN', '', sD, 'Debe ser: '+[...ALLOWED_STATUSES_BF].join(', ')]);
      }
      if (sA !== sD) {
        results.push(['A2', 2+i, k, 'DIFERENCIA', 'STATUS REUNIÓN', sA, sD, 'Actualizar en Base Final']);
      }
    }

    // Asistentes / ID
    if (A.Asis!=null && D.Asis!=null) cmpNum_('A2', 2+i, k, 'Asistentes', r[A.Asis], R[D.Asis], results);
    if (A.ID  !=null && D.ID  !=null) cmpText_('A2', 2+i, k, 'ID', r[A.ID], R[D.ID], results);
  }

  // ===== 2) Validar B2 -> Base Final (canales) =====
  for (let i=0;i<dataB.length;i++) {
    const r = dataB[i];
    const figura = str(r[B.Figura]), barrio = str(r[B.Barrio]), fec = toDate_(r[B.Fecha]);
    if (!figura || !barrio || !fec) continue;
    const k = key(figura, barrio, fec);
    keysFromSources.add(k);

    const hit = Dmap.get(k);
    if (!hit) {
      results.push(['B2', 2+i, k, 'FALTA EN BASE FINAL', '', '', '', 'Cargar/Upsert antes de validar']);
      continue;
    }
    const R = hit.arr;

    // Barrio canónico en B2
    if (!CANON_BARRIOS.has(barrio)) {
      results.push(['B2', 2+i, k, 'BARRIO NO CANÓNICO', 'Barrio', barrio, '', 'Normalizar con normalizeBarriosIn(B2)']);
    }

    // RRSS puede venir sumado o separado: si en B2 no hay RRSS, sumamos FB+Google+Programmatic
    let rrssB = (B.RRSS!=null) ? num(r[B.RRSS]) :
      (num(B.FB!=null? r[B.FB]:0)+num(B.GG!=null? r[B.GG]:0)+num(B.PR!=null? r[B.PR]:0));

    if (D.Ins!=null) cmpNum_('B2', 2+i, k, 'Inscriptos', r[B.Ins], R[D.Ins], results);
    if (D.Mail!=null)cmpNum_('B2', 2+i, k, 'Mail', r[B.Mail], R[D.Mail], results);
    if (D.Call!=null)cmpNum_('B2', 2+i, k, 'Call Center', r[B.Call], R[D.Call], results);
    if (D.IVR!=null) cmpNum_('B2', 2+i, k, 'IVR', r[B.IVR], R[D.IVR], results);
    if (D.RRSS!=null)cmpNum_('B2', 2+i, k, 'RRSS', rrssB, R[D.RRSS], results);
    if (D.Dif!=null) cmpNum_('B2', 2+i, k, 'Difusión', r[B.Dif], R[D.Dif], results);
    if (D.Mac!=null) cmpNum_('B2', 2+i, k, 'Maculinos', r[B.Mac], R[D.Mac], results);
    if (D.Fem!=null) cmpNum_('B2', 2+i, k, 'Femeninos', r[B.Fem], R[D.Fem], results);
  }

  // ===== 3) Duplicados en Base Final =====
  for (const [k, rows] of Ddups.entries()) {
    results.push(['BaseFinal', rows.join(','), k, 'DUPLICADO EN BASE FINAL', '', '', '', 'Unificar a una sola fila por clave']);
  }

  // ===== 4) Orphans en Base Final (no están en A2 ni B2) =====
  for (const [k, hit] of Dmap.entries()) {
    if (!keysFromSources.has(k)) {
      const R = hit.arr;
      results.push(['BaseFinal', hit.rowIndex, k, 'ORPHAN EN BASE FINAL', '', '', '', `No existe en A2/B2`]);
      // Validación extra de barrio/status en BF
      const barrioBF = str(R[D.Barrio]);
      if (barrioBF && !CANON_BARRIOS.has(barrioBF)) {
        results.push(['BaseFinal', hit.rowIndex, k, 'BARRIO NO CANÓNICO', 'Barrio', barrioBF, '', 'Normalizar']);
      }
      if (D.Status!=null) {
        const sD = str(R[D.Status]);
        if (sD && !ALLOWED_STATUSES_BF.has(sD)) {
          results.push(['BaseFinal', hit.rowIndex, k, 'STATUS NO PERMITIDO', 'STATUS REUNIÓN', '', sD, 'Debe ser: '+[...ALLOWED_STATUSES_BF].join(', ')]);
        }
      }
    }
  }

  // === Volcar resultados a hoja VALIDACION ===
  const out = ss.getSheetByName(OUT_SHEET) || ss.insertSheet(OUT_SHEET);
  out.clear();
  out.getRange(1,1,1,OUT_HEADERS.length).setValues([OUT_HEADERS]);
  if (results.length) {
    out.getRange(2,1,results.length,OUT_HEADERS.length).setValues(results);
    out.getRange(1,1,1,OUT_HEADERS.length).setFontWeight('bold');
  }
  SpreadsheetApp.getActive().toast(`VALIDACION: ${results.length} hallazgos`, 'validateConsistency', 6);
}

/* ============ Helpers locales de comparación ============ */

function cmpText_(origen, rowNum, k, campo, vSrc, vDst, results) {
  const s = str(vSrc), d = str(vDst);
  if (s === '' && d === '') return;
  if (s !== d) {
    results.push([origen, rowNum, k, 'DIFERENCIA', campo, s, d, 'Actualizar Base Final']);
  }
}
function cmpNum_(origen, rowNum, k, campo, vSrc, vDst, results) {
  const s = num(vSrc), d = num(vDst);
  if (s !== d) {
    results.push([origen, rowNum, k, 'DIFERENCIA', campo, s, d, 'Actualizar Base Final']);
  }
}
function cmpDate_(origen, rowNum, k, campo, vSrc, vDst, results, tz) {
  const ds = toDate_(vSrc), dd = toDate_(vDst);
  const fmt = d => d ? Utilities.formatDate(d, tz, 'yyyyMMdd') : '';
  if (fmt(ds) !== fmt(dd)) {
    results.push([origen, rowNum, k, 'DIFERENCIA', campo,
                  ds ? Utilities.formatDate(ds, tz, 'dd/MM/yyyy') : '',
                  dd ? Utilities.formatDate(dd, tz, 'dd/MM/yyyy') : '',
                  'Actualizar Base Final']);
  }
}

/* ====== Re-usa tus helpers globales existentes ======
   Necesitás tener definidas en tu proyecto:
   - findIdxOr_(headers, candidates, optional)
   - normalizeHeader_(s)
   - normalizeText_(s)
   - toDate_(v)
   - num(v), str(v)
   - keyFBF_(figura,barrio,fecha)
   - mapStatusToAllowed_(s)
*/
