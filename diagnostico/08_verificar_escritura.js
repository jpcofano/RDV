/**
 * diagnostico/08_verificar_escritura.js — verificación DESPUÉS de una escritura real del upsert.
 *
 * SÓLO LECTURA. Lee el destino (1) —la solapa a la que apunta `RDV_HOJA_DESTINO`—, `B` y
 * `REGISTRO_UPSERT` de la intermedia (2); no escribe una sola celda ni un fondo. Todo va al log.
 * Corre a mano (`paso16_verificarEscritura()`), antes de la primera escritura en una solapa (línea
 * de base) y después de cada escritura.
 *
 * Cinco controles, en este orden:
 *   1) **Invariante en el destino**: ningún formulario está escrito en 2+ filas con RDV_UID. El
 *      formulario de cada fila se resuelve por su traza (`form_origen`, `formularioDeTraza_`),
 *      no por la fila de B.
 *   2) **Fórmulas** (el paso 14): las once derivadas siguen siendo fórmula y muestran `Comunas`.
 *   3) **Azules contra la línea de base DE ESA SOLAPA** (`LINEA_BASE_AZULES` en 00_Config.js): los
 *      `#4F81BD` de las `COLUMNAS_MANUALES` NO pueden subir (el upsert no las escribe nunca). Los del
 *      destino entero suben, por lo que se escribió.
 *   4) **Filas con RDV_UID**: cuántas, cuántas sin `form_origen`, y **cuántas incompletas** (02/10):
 *      les queda alguna celda que el plan escribía en esa fila —traza, datos o la transición de
 *      STATUS— vacía. Lo decide `celdasDeDecision_`, la misma función que usa la escritura.
 *   5) **La lista de las filas con RDV_UID** (fila, figura, fecha, formulario) y, para cada una, si
 *      HOY el plan la escribiría igual: mismo veredicto `escribiria` y mismo formulario. Las que no,
 *      se marcan (02/10: las tres de "Seguridad en tu barrio" que el paso 2 y la escritura
 *      decidieron distinto). Es una evaluación de la fila sola, sin el invariante del plan entero.
 */
/** Hasta cuántas filas con RDV_UID lista el bloque 5 una por una. */
const MAX_FILAS_LISTA_DIAG8 = 300;

function verificarEscritura() {
  Logger.log('=== verificarEscritura — sólo lectura, no escribe nada ===');
  Logger.log('  solapa destino: %s', descripcionHojaDestino_());
  const dest = leerDestino_();
  const cands = leerCandidatos_();
  const comunas = leerComunasMap_();
  const problemas = [];

  // --- 1) invariante en el destino ---
  const conUid = dest.filas.filter(function (f) { return f.uid; });
  const porForm = new Map(), sinForm = [], formDe = new Map();
  conUid.forEach(function (f) {
    const c = formularioDeTraza_(f, cands.vivos);
    if (!c) { sinForm.push(f); return; }
    formDe.set(f, c);
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

  // --- 3) azules contra la línea de base de esta solapa ---
  Logger.log('--- 3) #4F81BD contra la línea de base de "%s" ---', RDV_HOJA_DESTINO);
  const sh = dest.sh;
  const nFilas = sh.getLastRow(), nCols = sh.getLastColumn();
  const hdr = dest.hdr;
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
  const base = lineaBaseAzules_();
  Logger.log('  en las COLUMNAS_MANUALES: %s   (línea de base: %s)', azulManual,
             base.manuales == null ? 'NO ANOTADA' : base.manuales);
  Logger.log('  en toda la solapa .....: %s   (línea de base: %s)', azulTotal,
             base.total == null ? 'NO ANOTADA' : base.total);
  if (base.manuales == null) {
    Logger.log('  >>> Sin línea de base para "%s". Si esto corre ANTES de la primera escritura en esta', RDV_HOJA_DESTINO);
    Logger.log('      solapa, anotar estos dos números en 00_Config.js (LINEA_BASE_AZULES["%s"]).', RDV_HOJA_DESTINO);
  } else if (azulManual > base.manuales) {
    problemas.push('azules en columnas manuales: ' + azulManual + ' > ' + base.manuales);
    Logger.log('  >>> SUBIERON los azules en las columnas manuales: el upsert NO debería escribirlas.');
  }

  // --- 4) filas con RDV_UID: traza y completitud ---
  Logger.log('--- 4) filas con RDV_UID ---');
  const sinTraza = conUid.filter(function (f) { return !f.formOrigen; });
  const incompletas = [];
  conUid.forEach(function (f) {
    const c = formDe.get(f);
    if (!c) return;   // ya contada arriba: sin formulario no se puede saber qué le faltaría
    const falta = _faltantesDeFila_diag8(dest, f, c, comunas);
    if (falta.length) incompletas.push({ f: f, falta: falta });
  });
  Logger.log('  con RDV_UID: %s | sin form_origen: %s   (tiene que dar 0)', conUid.length, sinTraza.length);
  Logger.log('  INCOMPLETAS (les falta alguna celda que el plan escribía en esa fila): %s   (tiene que dar 0;',
             incompletas.length);
  Logger.log('    si no da 0, la próxima corrida del upsert las completa: entran por RDV_UID)');
  incompletas.slice(0, 40).forEach(function (x) {
    Logger.log('    fila %s | %s | %s | falta: %s', x.f.fila, x.f.figura, fmtFecha_(x.f.fecha), x.falta.join(', '));
  });
  if (sinTraza.length) problemas.push('filas con RDV_UID sin form_origen: ' + sinTraza.length);
  if (incompletas.length) problemas.push('filas con RDV_UID incompletas: ' + incompletas.length);
  const ult = _ultimaEscrituraRegistrada_diag8();
  if (ult) {
    Logger.log('  última ESCRITURA en %s: %s | solapa %s | completa %s | filas %s | uids estampados %s',
               RDV_HOJA_REGISTRO, ult.hora, ult.hoja || '(no registrada)', ult.completa || '(no registrado)',
               ult.filas, ult.uids);
  } else {
    Logger.log('  %s no tiene ninguna corrida de ESCRITURA todavía.', RDV_HOJA_REGISTRO);
  }

  // --- 5) la lista, y si hoy el plan las escribiría igual ---
  // Con muchas filas (en régimen, todas) el log se iría de tamaño: se listan sólo las que difieren.
  const listarTodas = conUid.length <= MAX_FILAS_LISTA_DIAG8;
  Logger.log('--- 5) las %s filas con RDV_UID: fila | figura | fecha | formulario | hoy%s ---', conUid.length,
             listarTodas ? '' : ' (más de ' + MAX_FILAS_LISTA_DIAG8 + ': sólo las que hoy difieren)');
  let distintas = 0;
  conUid.forEach(function (f) {
    const c = formDe.get(f);
    const hoy = _hoyLaEscribiria_diag8(f, c, cands.vivos, comunas);
    if (!hoy.igual) distintas++;
    if (!listarTodas && hoy.igual) return;
    Logger.log('  fila %s | %s | %s | %s | %s', f.fila, f.figura, fmtFecha_(f.fecha),
               f.formOrigen || '(sin form_origen)', hoy.texto);
  });
  Logger.log('  >>> filas con RDV_UID que HOY el plan no escribiría igual: %s (no es un error de la ' +
             'escritura: la fila queda como está; se mira con paso12_explicarFila)', distintas);

  Logger.log(problemas.length ? '>>> HAY PROBLEMAS: ' + problemas.join(' | ') + '. Ver docs/backup.md §8.2.'
                              : '>>> OK: invariante 0, fórmulas bien, azules manuales sin subir, traza completa, 0 incompletas.');
  return { problemas: problemas, conUid: conUid.length, incompletas: incompletas.length,
           azulManual: azulManual, azulTotal: azulTotal, distintas: distintas };
}

/**
 * Qué le falta a una fila con RDV_UID de lo que el plan escribía en ella: los cuatro de traza
 * (RDV_UID, form_origen, form_score, form_nivel), form_fecha_match si el par tiene distancia, y lo
 * que `celdasDeDecision_` diga para datos y STATUS (la misma función que usa la escritura).
 */
function _faltantesDeFila_diag8(dest, f, c, comunas) {
  const v = f.valores, T = dest.T, falta = [];
  [['form_score', T.score], ['form_nivel', T.nivel]].forEach(function (x) {
    if (x[1] != null && esVacio_(v[x[1]])) falta.push(x[0]);
  });
  if (T.fechaMatch != null && esVacio_(v[T.fechaMatch]) && puntuar_(f, c, comunas).dist !== null) {
    falta.push('form_fecha_match');
  }
  const d = { fila: f, cand: c, score: 1, nivel: 'rdv_uid', dist: null };
  const pend = celdasDeDecision_(dest, d, v, true);
  pend.celdas.forEach(function (x) { falta.push(dest.hdr[x.col - 1]); });
  if (pend.status) falta.push('STATUS → Realizada');
  return falta;
}

/** ¿Hoy, evaluada sola (sin su RDV_UID), la fila se escribiría con el mismo formulario? */
function _hoyLaEscribiria_diag8(f, c, vivos, comunas) {
  const sinUid = Object.assign({}, f, { uid: '' });
  const r = evaluarCandidatos_(sinUid, vivos, comunas);
  const mismo = !!(r.mejor && c && r.mejor.c === c);
  if (r.veredicto === 'escribiria' && mismo) return { igual: true, texto: 'igual' };
  return { igual: false,
           texto: '<<< HOY: ' + r.veredicto + (r.motivo ? ' (' + r.motivo + ')' : '') +
                  (r.mejor ? (mismo ? ', mismo formulario' : ' con "' + r.mejor.c.nombre + '"') : '') };
}

function _ultimaEscrituraRegistrada_diag8() {
  const sh = ssIntermedia_().getSheetByName(RDV_HOJA_REGISTRO);
  if (!sh || sh.getLastRow() < 2) return null;
  const nCols = Math.max(5, Math.min(sh.getLastColumn(), 17));
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, nCols).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (vals[i][1] !== 'ESCRITURA') continue;
    // La de ESTA solapa. Las líneas de antes del 02/10 no dicen solapa: eran del destino real.
    const hoja = nCols >= 16 ? str(vals[i][15]) : '';
    if ((hoja || RDV_HOJA_DESTINO_REAL) !== RDV_HOJA_DESTINO) continue;
    return { hora: vals[i][0], filas: vals[i][2], uids: vals[i][4],
             hoja: hoja, completa: nCols >= 17 ? vals[i][16] : '' };
  }
  return null;
}
