function syncBaseFinal_ParaRevisar_y_RVD() {
  const DEBUG = true;
  const SS_ID = '1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo';
  const SHEET_PR   = 'Para Revisar';
  const SHEET_USER = 'RVD JM-CM - ES';
  const tz = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';

  const log = (...args) => { if (DEBUG) Logger.log(args.join(' ')); };

  const ss = SpreadsheetApp.openById(SS_ID);
  const shPR   = ss.getSheetByName(SHEET_PR);
  const shUser = ss.getSheetByName(SHEET_USER);
  if (!shPR)   throw new Error('No existe la hoja "Para Revisar"');
  if (!shUser) throw new Error('No existe la hoja "RVD JM-CM - ES"');

  log('=== syncBaseFinal_ParaRevisar_y_RVD: INICIO ===');

  // ===== Leer headers =====
  const hdrPR   = shPR.getRange(1,1,1,shPR.getLastColumn()).getValues()[0];
  const hdrUser = shUser.getRange(1,1,1,shUser.getLastColumn()).getValues()[0];

  const normPR   = hdrPR.map(normalizeHeader_);
  const normUser = hdrUser.map(normalizeHeader_);

  const idxMap = (normArr) => {
    const m = new Map();
    normArr.forEach((n, i) => { if (n) m.set(n, i); });
    return m;
  };
  const mapPR   = idxMap(normPR);
  const mapUser = idxMap(normUser);

  // === columnas a ignorar (derivadas / errores) ===
  // IMPORTANTE: ignoramos #REF! (aunque haya varias columnas iguales, la normalización las agrupa)
  const IGNORE_NORMS = new Set([
    normalizeHeader_('#REF!')
  ]);

  // ==========================================================
  // ✅ CAMBIO: WHITELIST "al revés" -> ahora usamos BLACKLIST
  // Querés permitir completar TODO excepto estas columnas:
  // (las que "ahora estaban en la lista" y no deben completarse)
  const BLOCK_FILL_USER_NORMS = new Set([
    'Día de la semana',
    '% de Asistencia',
    'Falta Informacion',
    'Comuna',
    'Poblacion',
    'p. Mujer',
    'P. Varon',
    '(km2)',
    '(hab/km2)',
    'Zona',
  ].map(normalizeHeader_));

  // WHITELIST REAL: todas las columnas del usuario MENOS bloqueadas y menos ignoradas
  const ALLOWED_FILL_USER_NORMS = new Set(
    hdrUser
      .map(normalizeHeader_)
      .filter(n => n && !IGNORE_NORMS.has(n) && !BLOCK_FILL_USER_NORMS.has(n))
  );
  // ==========================================================

  // columnas clave (figura/persona/nombre, barrio, fecha)
  const idxKeyPR = {
    fig: findIdxOr_(hdrPR,   ['figura','persona','nombre']),
    bar: findIdxOr_(hdrPR,   ['barrio']),
    fec: findIdxOr_(hdrPR,   ['fecha'])
  };
  const idxKeyUser = {
    fig: findIdxOr_(hdrUser, ['figura','persona','nombre']),
    bar: findIdxOr_(hdrUser, ['barrio']),
    fec: findIdxOr_(hdrUser, ['fecha'])
  };

  const rowsPR   = Math.max(0, shPR.getLastRow()-1);
  const rowsUser = Math.max(0, shUser.getLastRow()-1);

  const dataPR   = rowsPR   ? shPR.getRange(2,1,rowsPR,shPR.getLastColumn()).getValues()   : [];
  const dataUser = rowsUser ? shUser.getRange(2,1,rowsUser,shUser.getLastColumn()).getValues() : [];

  log(`Para Revisar: rows=${rowsPR}, cols=${hdrPR.length}`);
  log(`RVD JM-CM - ES: rows=${rowsUser}, cols=${hdrUser.length}`);

  // ===== construir clave → fila =====
  const keyToRowPR   = new Map();
  const keyToRowUser = new Map();

  function keyFromRow(row, idxKey) {
    const figura = str(row[idxKey.fig]);
    const barrio = str(row[idxKey.bar]);
    const fec    = toDate_(row[idxKey.fec]);
    if (!figura || !barrio || !fec) return '';
    const ymd = Utilities.formatDate(fec, tz, 'yyyyMMdd');
    const f = normalizeText_(figura);
    const b = normalizeText_(barrio);
    return `${f}|${b}|${ymd}`;
  }

  for (let i=0;i<dataPR.length;i++) {
    const k = keyFromRow(dataPR[i], idxKeyPR);
    if (k) keyToRowPR.set(k, 2+i);
  }
  for (let i=0;i<dataUser.length;i++) {
    const k = keyFromRow(dataUser[i], idxKeyUser);
    if (k) keyToRowUser.set(k, 2+i);
  }

  log(`Claves PR: ${keyToRowPR.size}`);
  log(`Claves USER: ${keyToRowUser.size}`);

  // ===== determinar conjuntos de claves =====
  const keysPR   = new Set(keyToRowPR.keys());
  const keysUser = new Set(keyToRowUser.keys());

  const onlyUser = [];
  const onlyPR   = [];
  const inBoth   = [];

  keysUser.forEach(k => {
    if (keysPR.has(k)) inBoth.push(k);
    else onlyUser.push(k);
  });
  keysPR.forEach(k => {
    if (!keysUser.has(k)) onlyPR.push(k);
  });

  log(`onlyUser=${onlyUser.length} | onlyPR=${onlyPR.length} | inBoth=${inBoth.length}`);

  // Contadores para informe
  let countNewPR = 0;
  let countFillUser = 0;
  let countFillPR = 0;
  let countDiff = 0;
  let countOnlyUser = onlyUser.length;
  let countOnlyPR = onlyPR.length;
  let countSkipNumericPR = 0;
  let countSkipNotWhitelisted = 0;
  let countSkipUserFormula = 0;
  let countSkipPRFormula = 0; // ✅ nuevo: no pisar fórmulas en Para Revisar

  const actions = [];

  // ===== 1) agregar filas que están solo en usuario → Para Revisar =====
  const newRowsForPR = [];

  for (const k of onlyUser) {
    const rUser = keyToRowUser.get(k);
    if (!rUser) continue;
    const rowUser = dataUser[rUser-2];
    const out = new Array(hdrPR.length).fill('');

    for (let c=0;c<hdrPR.length;c++) {
      const normName = normPR[c];
      if (!normName) continue;
      if (IGNORE_NORMS.has(normName)) continue; // 🛑 ignoradas (#REF!)

      const idxU = mapUser.get(normName);
      if (idxU != null) out[c] = rowUser[idxU];
    }

    newRowsForPR.push(out);
    countNewPR++;

    actions.push([
      'Solo en usuario → agregado a Para Revisar',
      k,
      '',
      SHEET_USER,
      '',
      SHEET_PR,
      '',
      'Se insertó fila en Para Revisar (copiando columnas con mismo nombre normalizado; #REF! ignorada)'
    ]);

    if (DEBUG && countNewPR <= 10) {
      log(`onlyUser: key=${k} → insert en Para Revisar (fila origen USER=${rUser})`);
    }
  }

  if (newRowsForPR.length) {
    const start = shPR.getLastRow()+1;
    shPR.getRange(start,1,newRowsForPR.length,hdrPR.length).setValues(newRowsForPR);
    log(`Insertadas ${newRowsForPR.length} filas nuevas en "Para Revisar" desde hoja usuario.`);
  }

  // ===== 2) marcar filas solo en Para Revisar (sin tocar nada al usuario) =====
  for (const k of onlyPR) {
    actions.push([
      'Solo en Para Revisar',
      k,
      '',
      SHEET_PR,
      '',
      SHEET_USER,
      '',
      'Sin acción (no se agrega fila en hoja usuario)'
    ]);

    if (DEBUG && actions.length <= 20) {
      log(`onlyPR: key=${k} → solo reportado, sin cambios.`);
    }
  }

  // ===== 3) sincronizar celdas comunes sin pisar datos del usuario =====
  const commonNorms = [];
  mapPR.forEach((_, n) => {
    if (IGNORE_NORMS.has(n)) return;
    if (mapUser.has(n)) commonNorms.push(n);
  });
  log(`Columnas comunes (excluyendo #REF!): ${commonNorms.join(', ')}`);

  function cellsEqual(a,b) {
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    const sa = String(a == null ? '' : a).trim();
    const sb = String(b == null ? '' : b).trim();
    return sa === sb;
  }

  for (const k of inBoth) {
    const rPR   = keyToRowPR.get(k);
    const rUser = keyToRowUser.get(k);
    if (!rPR || !rUser) continue;

    const rowPR   = dataPR[rPR-2];
    const rowUser = dataUser[rUser-2];

    if (DEBUG) log(`== Clave en ambas hojas: key=${k} | PR row=${rPR} | USER row=${rUser} ==`);

    for (const n of commonNorms) {
      const cPR   = mapPR.get(n);
      const cUser = mapUser.get(n);
      const vPR   = rowPR[cPR];
      const vUser = rowUser[cUser];

      const sPR   = (vPR   instanceof Date) ? vPR   : str(vPR);
      const sUser = (vUser instanceof Date) ? vUser : str(vUser);

      const colNamePR   = hdrPR[cPR];
      const colNameUser = hdrUser[cUser];

      // a) si user está vacío y PR tiene dato → copiamos a usuario
      //    PERO SOLO si la columna está permitida (WHITELIST REAL) y la celda no tiene fórmula
      if (!sUser && sPR) {
        if (!ALLOWED_FILL_USER_NORMS.has(n)) {
          countSkipNotWhitelisted++;
          actions.push([
            'NO se rellena usuario (bloqueada)',
            k,
            colNameUser,
            SHEET_PR,
            String(sPR),
            SHEET_USER,
            '',
            'Columna bloqueada (blacklist); sin cambios'
          ]);
          if (DEBUG && countSkipNotWhitelisted <= 20) {
            log(`  [skipBlocked] col="${colNameUser}" está bloqueada → no se completa en usuario`);
          }
          continue;
        }

        const rng = shUser.getRange(rUser, cUser+1);

        // 🛑 no pisar fórmulas aunque el valor se vea vacío
        const formula = rng.getFormula();
        if (formula) {
          countSkipUserFormula++;
          actions.push([
            'NO se rellena usuario (tiene fórmula)',
            k,
            colNameUser,
            SHEET_PR,
            String(sPR),
            SHEET_USER,
            '',
            'La celda destino tiene fórmula; sin cambios'
          ]);
          if (DEBUG && countSkipUserFormula <= 20) {
            log(`  [skipUserFormula] col="${colNameUser}" USER(${rUser},${cUser+1}) tiene fórmula → no se pisa`);
          }
          continue;
        }

        rng.setValue(vPR);
        rng.setBackground('#4F81BD'); // azul
        countFillUser++;
        actions.push([
          'Relleno usuario desde Para Revisar',
          k,
          colNameUser,
          SHEET_PR,
          String(sPR),
          SHEET_USER,
          '',
          'Se completó celda vacía en hoja usuario (permitida); celda marcada en azul'
        ]);
        if (DEBUG && countFillUser <= 20) {
          log(`  [fillUser] col="${colNameUser}" USER(${rUser},${cUser+1}) ← PR(${rPR},${cPR+1}) val="${sPR}" (azul)`);
        }
        continue;
      }

      // b) si usuario tiene dato y PR está vacío → copiamos a PR SOLO si NO es numérico
      if (sUser && !sPR) {
        if (isNumericLike_(vUser)) {
          countSkipNumericPR++;
          actions.push([
            'NO se rellena Para Revisar (numérico)',
            k,
            colNamePR,
            SHEET_USER,
            String(sUser),
            SHEET_PR,
            '',
            'Valor numérico en usuario; Para Revisar se deja sin modificar'
          ]);
          if (DEBUG && countSkipNumericPR <= 20) {
            log(`  [skipFillPR numeric] col="${colNamePR}" USER="${sUser}" → PR se mantiene vacío (no se tocan números)`);
          }
        } else {
          const rngPR = shPR.getRange(rPR, cPR+1);

          // ✅ extra (recomendado): no pisar fórmulas en Para Revisar
          // Si NO querés este cambio, borrá este bloque.
          const fPR = rngPR.getFormula();
          if (fPR) {
            countSkipPRFormula++;
            actions.push([
              'NO se rellena Para Revisar (tiene fórmula)',
              k,
              colNamePR,
              SHEET_USER,
              String(sUser),
              SHEET_PR,
              '',
              'La celda destino en Para Revisar tiene fórmula; sin cambios'
            ]);
            if (DEBUG && countSkipPRFormula <= 20) {
              log(`  [skipPRFormula] col="${colNamePR}" PR(${rPR},${cPR+1}) tiene fórmula → no se pisa`);
            }
          } else {
            rngPR.setValue(vUser);
            countFillPR++;
            actions.push([
              'Relleno Para Revisar desde usuario',
              k,
              colNamePR,
              SHEET_USER,
              String(sUser),
              SHEET_PR,
              '',
              'Se completó celda vacía en Para Revisar con dato del usuario (solo no numéricos)'
            ]);
            if (DEBUG && countFillPR <= 20) {
              log(`  [fillPR] col="${colNamePR}" PR(${rPR},${cPR+1}) ← USER(${rUser},${cUser+1}) val="${sUser}"`);
            }
          }
        }
        continue;
      }

      // c) ambos con dato y distintos → solo reportamos
      if (sUser && sPR && !cellsEqual(vPR, vUser)) {
        countDiff++;
        actions.push([
          'Diferencia',
          k,
          colNamePR,
          SHEET_USER,
          String(sUser),
          SHEET_PR,
          String(sPR),
          'Sin cambios (prioridad usuario, solo se reporta la diferencia)'
        ]);
        if (DEBUG && countDiff <= 20) {
          log(`  [diff] col="${colNamePR}" USER="${sUser}" vs PR="${sPR}" → solo reporte`);
        }
      }
    }
  }

  // ===== 4) reporte en hoja del active spreadsheet =====
  const repSS = SpreadsheetApp.getActive();
  const REP_NAME = 'Reporte Sincronización BF';
  let rep = repSS.getSheetByName(REP_NAME);
  if (!rep) rep = repSS.insertSheet(REP_NAME);
  rep.clear();

  const headersRep = [
    'Tipo',
    'Key (figura|barrio|yyyyMMdd)',
    'Columna',
    'Hoja origen',
    'Valor origen',
    'Hoja destino',
    'Valor destino',
    'Acción'
  ];
  rep.getRange(1,1,1,headersRep.length).setValues([headersRep]);

  const resumenTexto =
    `newPR=${countNewPR} | fillUser=${countFillUser} | fillPR=${countFillPR} | diffs=${countDiff} | ` +
    `onlyUser=${countOnlyUser} | onlyPR=${countOnlyPR} | skipNumericPR=${countSkipNumericPR} | ` +
    `skipBlocked=${countSkipNotWhitelisted} | skipUserFormula=${countSkipUserFormula} | skipPRFormula=${countSkipPRFormula}`;

  rep.getRange(2,1,1,headersRep.length).setValues([[
    'RESUMEN','','','','','','',resumenTexto
  ]]);

  if (actions.length) {
    rep.getRange(3,1,actions.length,headersRep.length).setValues(actions);
  }

  log('=== syncBaseFinal_ParaRevisar_y_RVD: FIN ===');
  log(resumenTexto);

  SpreadsheetApp.getActive().toast(
    `Sync BF → ${resumenTexto}`,
    'syncBaseFinal_ParaRevisar_y_RVD',
    8
  );
}

/** Detecta si un valor es numérico (número o string numérico). */
function isNumericLike_(v) {
  if (v === '' || v == null) return false;
  if (typeof v === 'number') return true;
  if (v instanceof Date) return false;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return false;
  return !isNaN(Number(s));
}
