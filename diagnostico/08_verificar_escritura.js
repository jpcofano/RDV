/**
 * diagnostico/08_verificar_escritura.js — verificación DESPUÉS de una escritura real del upsert.
 *
 * SÓLO LECTURA. Lee el destino (1), `B` y `REGISTRO_UPSERT` de la intermedia (2); no escribe una
 * sola celda ni un fondo. Todo va al log. Corre a mano (`paso16_verificarEscritura()`), después de
 * la primera escritura con `DRY_RUN = false` y cada vez que se quiera.
 *
 * Cuatro controles, en este orden:
 *   1) **Invariante en el destino**: ningún formulario está escrito en 2+ filas con RDV_UID. El
 *      formulario de cada fila se resuelve por su traza (`form_origen`, `formularioDeTraza_`),
 *      no por la fila de B.
 *   2) **Fórmulas** (el paso 14): las once derivadas siguen siendo fórmula y muestran `Comunas`.
 *   3) **Azules contra la línea de base**: los `#4F81BD` de las `COLUMNAS_MANUALES` NO pueden subir
 *      (el upsert no las escribe nunca). Los del destino entero suben, por lo que se escribió.
 *      La línea de base se toma antes de escribir (docs/backup.md §8) y se anota en 00_Config.js.
 *   4) **Filas con RDV_UID**: cuántas, cuántas sin `form_origen` (no debería haber ninguna), y contra
 *      la última corrida de ESCRITURA de `REGISTRO_UPSERT`.
 */
function verificarEscritura() {
  Logger.log('=== verificarEscritura — sólo lectura, no escribe nada ===');
  const dest = leerDestino_();
  const cands = leerCandidatos_();
  const problemas = [];

  // --- 1) invariante en el destino ---
  const conUid = dest.filas.filter(function (f) { return f.uid; });
  const porForm = new Map(), sinForm = [];
  conUid.forEach(function (f) {
    const c = formularioDeTraza_(f, cands.vivos);
    if (!c) { sinForm.push(f); return; }
    if (!porForm.has(c)) porForm.set(c, []);
    porForm.get(c).push(f);
  });
  const choques = [];
  porForm.forEach(function (filas, c) { if (filas.length > 1) choques.push({ c: c, filas: filas }); });
  Logger.log('--- 1) invariante "un formulario, una fila" en el destino ---');
  Logger.log('  formularios con 2+ filas con RDV_UID: %s   (tiene que dar 0)', choques.length);
  choques.forEach(function (x) {
    Logger.log('    B fila %s | %s → filas %s', x.c.fila, x.c.nombre,
               x.filas.map(function (f) { return f.fila; }).join(', '));
  });
  if (choques.length) problemas.push('invariante: ' + choques.length + ' formularios en 2+ filas');
  if (sinForm.length) {
    Logger.log('  filas con RDV_UID cuyo form_origen ya no está en B (no se pueden chequear): %s', sinForm.length);
    sinForm.slice(0, 20).forEach(function (f) {
      Logger.log('    fila %s | %s | %s', f.fila, fmtFecha_(f.fecha), f.formOrigen || '(sin form_origen)');
    });
  }

  // --- 2) fórmulas ---
  Logger.log('--- 2) fórmulas de las derivadas (paso 14) ---');
  const fx = diagFormulasDestino();
  const formulasOk = fx && !fx.sinFormula && !fx.enError && !fx.malIndice &&
    Object.keys(fx.difs || {}).every(function (k) { return !fx.difs[k]; });
  if (!formulasOk) problemas.push('fórmulas: ver el bloque 2');

  // --- 3) azules contra la línea de base ---
  Logger.log('--- 3) #4F81BD contra la línea de base ---');
  const sh = dest.sh;
  const nFilas = sh.getLastRow(), nCols = sh.getLastColumn();
  const hdr = sh.getRange(1, 1, 1, nCols).getValues()[0];
  const fondos = sh.getRange(1, 1, nFilas, nCols).getBackgrounds();
  const manuales = {};
  COLUMNAS_MANUALES.forEach(function (n) {
    const k = hdr.findIndex(function (h) { return normalizeHeader_(h) === normalizeHeader_(n); });
    if (k >= 0) manuales[k] = n;
  });
  let azulTotal = 0, azulManual = 0;
  const azul = AZUL_SISTEMA_.toLowerCase();
  for (let i = 1; i < fondos.length; i++) {
    for (let k = 0; k < fondos[i].length; k++) {
      if (String(fondos[i][k]).toLowerCase() !== azul) continue;
      azulTotal++;
      if (manuales[k] != null) azulManual++;
    }
  }
  Logger.log('  en las COLUMNAS_MANUALES: %s   (línea de base: %s)', azulManual,
             LINEA_BASE_AZULES_MANUALES == null ? 'NO ANOTADA' : LINEA_BASE_AZULES_MANUALES);
  Logger.log('  en todo el destino ....: %s   (línea de base: %s)', azulTotal,
             LINEA_BASE_AZULES_TOTAL == null ? 'NO ANOTADA' : LINEA_BASE_AZULES_TOTAL);
  if (LINEA_BASE_AZULES_MANUALES == null) {
    Logger.log('  >>> Sin línea de base. Si esto corre ANTES de la primera escritura, anotar estos dos');
    Logger.log('      números en 00_Config.js (LINEA_BASE_AZULES_MANUALES / _TOTAL).');
  } else if (azulManual > LINEA_BASE_AZULES_MANUALES) {
    problemas.push('azules en columnas manuales: ' + azulManual + ' > ' + LINEA_BASE_AZULES_MANUALES);
    Logger.log('  >>> SUBIERON los azules en las columnas manuales: el upsert NO debería escribirlas.');
  }

  // --- 4) filas con RDV_UID ---
  Logger.log('--- 4) filas con RDV_UID ---');
  const sinTraza = conUid.filter(function (f) { return !f.formOrigen; });
  Logger.log('  con RDV_UID: %s | sin form_origen: %s   (tiene que dar 0)', conUid.length, sinTraza.length);
  if (sinTraza.length) problemas.push('filas con RDV_UID sin form_origen: ' + sinTraza.length);
  const ult = _ultimaEscrituraRegistrada_diag8();
  if (ult) {
    Logger.log('  última ESCRITURA en %s: %s | filas escritas %s | uids estampados %s', RDV_HOJA_REGISTRO,
               ult.hora, ult.filas, ult.uids);
    Logger.log('  (las filas con RDV_UID tienen que ser al menos los uids estampados de todas las escrituras)');
  } else {
    Logger.log('  %s no tiene ninguna corrida de ESCRITURA todavía.', RDV_HOJA_REGISTRO);
  }

  Logger.log(problemas.length ? '>>> HAY PROBLEMAS: ' + problemas.join(' | ') + '. Ver docs/backup.md §8.2.'
                              : '>>> OK: invariante 0, fórmulas bien, azules manuales sin subir, traza completa.');
  return { problemas: problemas, conUid: conUid.length, azulManual: azulManual, azulTotal: azulTotal };
}

function _ultimaEscrituraRegistrada_diag8() {
  const sh = ssIntermedia_().getSheetByName(RDV_HOJA_REGISTRO);
  if (!sh || sh.getLastRow() < 2) return null;
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (vals[i][1] === 'ESCRITURA') return { hora: vals[i][0], filas: vals[i][2], uids: vals[i][4] };
  }
  return null;
}
