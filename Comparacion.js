function compareA2_vs_B2() {
  const SHEET_A2 = 'A2';
  const SHEET_B2 = 'B2';
  const REPORT_SHEET = 'REPORTE_A2_vs_B2';

  const ss = SpreadsheetApp.getActive();
  const shA = ss.getSheetByName(SHEET_A2);
  const shB = ss.getSheetByName(SHEET_B2);
  if (!shA) throw new Error('No existe la hoja A2');
  if (!shB) throw new Error('No existe la hoja B2');

  // ===== Helpers locales =====
  const nh_ = s => String(s||'').replace(/["']/g,'').replace(/\n/g,' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/\s+/g,' ').trim();

  const nt_ = s => String(s||'')
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g,' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/\s+/g,' ').trim();

  const td_ = v => {
    if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12,0,0);
    if (v==='' || v==null) return null;
    const m = /^\s*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s*$/.exec(String(v));
    if (m) {
      const d = +m[1], M = +m[2];
      let y = m[3] ? +m[3] : (new Date()).getFullYear();
      if (y < 100) y += 2000;
      return new Date(y, M-1, d, 12,0,0);
    }
    const m2 = /^\s*(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})\s*$/.exec(String(v));
    if (m2) return new Date(+m2[1], +m2[2]-1, +m2[3], 12,0,0);
    return null;
  };

  const key3_ = (fig,barr,fecha) => {
    const d = td_(fecha); if (!fig || !barr || !d) return '';
    const y = d.getFullYear(), M = ('0'+(d.getMonth()+1)).slice(-2), D = ('0'+d.getDate()).slice(-2);
    return `${nt_(fig)}|${nt_(barr)}|${y}${M}${D}`;
  };

  const findIdxFlex_ = (hdr, cand) => {
    const norm = hdr.map(nh_);
    for (const c of cand) { const i = norm.indexOf(nh_(c)); if (i !== -1) return i; }
    return -1;
  };

  // ===== Indices A2 =====
  const aHdr = shA.getRange(1,1,1,shA.getLastColumn()).getValues()[0];
  const iA_ID     = findIdxFlex_(aHdr, ['id']);
  const iA_Fig    = findIdxFlex_(aHdr, ['figura','persona','nombre']);
  const iA_BarrN  = findIdxFlex_(aHdr, ['barrion']);
  const iA_Barr   = iA_BarrN === -1 ? findIdxFlex_(aHdr, ['barrio']) : -1;
  const iA_Fecha  = findIdxFlex_(aHdr, ['fecha','fecha c','fecha fin']);
  const iA_Hora   = findIdxFlex_(aHdr, ['hora']);
  const iA_Dir    = findIdxFlex_(aHdr, ['direccion','dirección']);
  const iA_Asis   = findIdxFlex_(aHdr, ['asistentes','asistente']);
  const iA_Status = findIdxFlex_(aHdr, ['status reunión','status reunion','estado reunión','estado reunion']);

  if (iA_Fig === -1 || (iA_BarrN === -1 && iA_Barr === -1) || iA_Fecha === -1) {
    throw new Error('A2: faltan columnas clave (Figura/Persona, Barrio(N), Fecha).');
  }

  const aN = Math.max(0, shA.getLastRow()-1);
  const aVals = aN ? shA.getRange(2,1,aN,shA.getLastColumn()).getValues() : [];

  const Amap = new Map();      // key -> objeto
  const Adup = new Set();
  for (let i=0;i<aVals.length;i++) {
    const r = aVals[i];
    const fig   = r[iA_Fig];
    const barr  = iA_BarrN !== -1 ? r[iA_BarrN] : r[iA_Barr];
    const fecha = r[iA_Fecha];
    const key = key3_(fig,barr,fecha);
    if (!key) continue;

    const obj = {
      _filaA: i+2,
      Key: key,
      ID: iA_ID!==-1 ? r[iA_ID] : '',
      Figura: fig,
      BarrioN: barr,
      FECHA: td_(fecha),
      HORA: iA_Hora!==-1 ? r[iA_Hora] : '',
      Dirección: iA_Dir!==-1 ? r[iA_Dir] : '',
      Asistentes: iA_Asis!==-1 ? r[iA_Asis] : '',
      STATUS: iA_Status!==-1 ? r[iA_Status] : ''
    };
    if (Amap.has(key)) Adup.add(key);
    Amap.set(key, obj);
  }

  // ===== Indices B2 =====
  const bHdr = shB.getRange(1,1,1,shB.getLastColumn()).getValues()[0];
  const iB_ID     = findIdxFlex_(bHdr, ['id']);
  const iB_Pers   = findIdxFlex_(bHdr, ['persona','nombre','figura']);
  const iB_BarrN  = findIdxFlex_(bHdr, ['barrion']);
  const iB_Barr   = iB_BarrN === -1 ? findIdxFlex_(bHdr, ['barrio']) : -1;
  const iB_Fecha  = findIdxFlex_(bHdr, ['fecha']);
  const iB_Ins    = findIdxFlex_(bHdr, ['inscriptos','inscritos']);
  const iB_Mail   = findIdxFlex_(bHdr, ['mail','mailing','email']);
  const iB_Call   = findIdxFlex_(bHdr, ['call center','callcenter']);
  const iB_IVR    = findIdxFlex_(bHdr, ['ivr']);
  const iB_RRSS   = findIdxFlex_(bHdr, ['rrss','facebook','google','programmatic']);
  const iB_Dif    = findIdxFlex_(bHdr, ['difusión','difusion']);
  const iB_Mac    = findIdxFlex_(bHdr, ['maculino','masculino','maculinos','masculinos']);
  const iB_Fem    = findIdxFlex_(bHdr, ['femenino','femeninos']);

  if (iB_Pers === -1 || (iB_BarrN === -1 && iB_Barr === -1) || iB_Fecha === -1) {
    throw new Error('B2: faltan columnas clave (Persona/Nombre, Barrio(N), Fecha).');
  }

  const bN = Math.max(0, shB.getLastRow()-1);
  const bVals = bN ? shB.getRange(2,1,bN,shB.getLastColumn()).getValues() : [];

  const Bmap = new Map();
  const Bdup = new Set();
  for (let i=0;i<bVals.length;i++) {
    const r = bVals[i];
    const fig   = r[iB_Pers];
    const barr  = iB_BarrN !== -1 ? r[iB_BarrN] : r[iB_Barr];
    const fecha = r[iB_Fecha];
    const key = key3_(fig,barr,fecha);
    if (!key) continue;

    const obj = {
      _filaB: i+2,
      Key: key,
      ID: iB_ID!==-1 ? r[iB_ID] : '',
      Persona: fig,
      BarrioN: barr,
      FECHA: td_(fecha),
      Inscriptos: iB_Ins!==-1 ? r[iB_Ins] : '',
      Mail: iB_Mail!==-1 ? r[iB_Mail] : '',
      Call: iB_Call!==-1 ? r[iB_Call] : '',
      IVR: iB_IVR!==-1 ? r[iB_IVR] : '',
      RRSS: iB_RRSS!==-1 ? r[iB_RRSS] : '',
      Difusión: iB_Dif!==-1 ? r[iB_Dif] : '',
      Maculino: iB_Mac!==-1 ? r[iB_Mac] : '',
      Femenino: iB_Fem!==-1 ? r[iB_Fem] : ''
    };
    if (Bmap.has(key)) Bdup.add(key);
    Bmap.set(key, obj);
  }

  // ===== Comparación =====
  const keysA = Array.from(Amap.keys());
  const keysB = Array.from(Bmap.keys());
  const setB = new Set(keysB);
  const setA = new Set(keysA);

  const faltanEnB = keysA.filter(k => !setB.has(k)).map(k => Amap.get(k));
  const faltanEnA = keysB.filter(k => !setA.has(k)).map(k => Bmap.get(k));
  const interseccion = keysA.filter(k => setB.has(k)).length;

  // ===== Reporte =====
  const rep = ss.getSheetByName(REPORT_SHEET) || ss.insertSheet(REPORT_SHEET);
  // 🔧 quitar filtro existente (si lo hubiera) ANTES de limpiar
  const prevFilter = rep.getFilter();
  if (prevFilter) prevFilter.remove();
  rep.clear();

  // Resumen
  const resumen = [
    ['Métrica','Valor'],
    ['A2 - total (todas)', keysA.length],
    ['B2 - total (todas)', keysB.length],
    ['Intersección', interseccion],
    ['Faltan en B2 (están en A2)', faltanEnB.length],
    ['Faltan en A2 (están en B2)', faltanEnA.length],
    ['Claves duplicadas en A2', Adup.size],
    ['Claves duplicadas en B2', Bdup.size]
  ];
  rep.getRange(1,1,resumen.length,2).setValues(resumen);
  rep.getRange(1,1,1,2).setFontWeight('bold');

  // Tabla: Faltan en B2
  let row = resumen.length + 2;
  rep.getRange(row,1,1,1).setValue('Faltan en B2 (están en A2)').setFontWeight('bold');
  row++;
  const hdrA = ['Key','ID (A2)','Figura','BarrioN','FECHA','HORA','Dirección','Asistentes','STATUS','Fila A2'];
  const dataA = faltanEnB.map(o => [
    o.Key, o.ID, o.Figura, o.BarrioN, o.FECHA, o.HORA, o.Dirección, o.Asistentes, o.STATUS, o._filaA
  ]);
  const headerRowA = row; // <-- guardamos la primera cabecera para el filtro
  if (dataA.length) {
    rep.getRange(row,1,1,hdrA.length).setValues([hdrA]).setFontWeight('bold');
    rep.getRange(row+1,1,dataA.length,hdrA.length).setValues(dataA);
    rep.getRange(row+1,5,dataA.length,1).setNumberFormat('dd/mm/yyyy');
    row += dataA.length + 2;
  } else {
    rep.getRange(row,1,1,1).setValue('— sin diferencias —');
    row += 2;
  }

  // Tabla: Faltan en A2
  rep.getRange(row,1,1,1).setValue('Faltan en A2 (están en B2)').setFontWeight('bold');
  row++;
  const hdrB = ['Key','ID (B2)','Persona','BarrioN','FECHA','Inscriptos','Mail','Call','IVR','RRSS','Difusión','Maculino','Femenino','Fila B2'];
  const dataB = faltanEnA.map(o => [
    o.Key, o.ID, o.Persona, o.BarrioN, o.FECHA, o.Inscriptos, o.Mail, o.Call, o.IVR, o.RRSS, o.Difusión, o.Maculino, o.Femenino, o._filaB
  ]);
  if (dataB.length) {
    rep.getRange(row,1,1,hdrB.length).setValues([hdrB]).setFontWeight('bold');
    rep.getRange(row+1,1,dataB.length,hdrB.length).setValues(dataB);
    rep.getRange(row+1,5,dataB.length,1).setNumberFormat('dd/mm/yyyy');
    row += dataB.length + 2;
  } else {
    rep.getRange(row,1,1,1).setValue('— sin diferencias —');
    row += 2;
  }

  // ✅ Crear UN SOLO filtro que cubra ambas tablas (si hay datos)
  const lastRow = rep.getLastRow();
  const lastCol = rep.getLastColumn();
  if (lastRow >= headerRowA) {
    rep.getRange(headerRowA, 1, lastRow - headerRowA + 1, lastCol).createFilter();
  }

  // Estética mínima
  rep.setFrozenRows(1);
  ss.toast(`Comparación lista: ${faltanEnB.length} faltan en B2 | ${faltanEnA.length} faltan en A2`, 'A2 vs B2', 6);
}
