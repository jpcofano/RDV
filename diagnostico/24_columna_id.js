/**
 * diagnostico/24_columna_id.js — PASO 53 (08/10). SÓLO LECTURA: no escribe en ninguna planilla.
 *
 * La columna ID de la base, antes de la FASE 2 (la ID pasa a ser la derivada 12 del sistema): qué formatos hay y QUIÉN
 * escribió los ID que cambiaron desde el backup del 04/10 (RDV_SS_BACKUP_BASE). Lee el backup, la solapa de hoy,
 * "Para Revisar" (lo que copiaría el paso 5 del legado), "Datos_Unpivot" y "Aux_Maximos" (las del script atado).
 *
 *   1. los formatos, en el backup y hoy, y cuántas celdas tienen fórmula;
 *   2. las filas cuyo ID cambió desde el backup (la misma reunión: figura + fecha): antes → hoy, la fórmula (antes y hoy),
 *      el fondo, qué más cambió en la fila, si el ID nuevo es el que arma el legado con los datos de hoy
 *      (buildIdFinal_: "Figura - Barrio - dd/MM/yyyy") y si es el que tiene "Para Revisar"; y qué lo escribió, según esas
 *      pistas;
 *   3. los de guiones bajos, uno por uno;
 *   4. los ID repetidos (dos reuniones con el mismo ID: un "recuento distinto de ID" en Looker las cuenta como una);
 *   5. Datos_Unpivot (FechaCarga: la última corrida de unpivotEventos) y Aux_Maximos (la columna ID, ¿vacía?); y las celdas
 *      #4F81BD de toda la solapa, en el backup y hoy (si aumentaron, algo que pinta el azul viejo escribió: el paso 5);
 *   6. el formato propuesto para la derivada 12 ("Figura - Barrio - dd/MM/yyyy") sobre los datos de hoy: cuántos ID
 *      repetiría, y si la hora los desempata.
 *
 * Qué dice cada pista:
 *   - con fórmula hoy: la calcula la planilla, y cambia sola cuando cambian la figura, el barrio o la fecha;
 *   - con "GMT" donde estaba vacía: unpivotEventos (script atado);
 *   - fondo #4F81BD y el mismo ID en "Para Revisar": el paso 5 del legado (syncBaseFinal_ParaRevisar_y_RVD);
 *   - sin fórmula ni color, con el formato del legado: una persona (o un script de otra cuenta). Quién y cuándo: clic
 *     derecho en la celda → "Mostrar historial de ediciones".
 */
function investigarColumnaId() {
  Logger.log('=== investigarColumnaId (paso 53) — SÓLO LECTURA: la columna ID (backup del 04/10 y hoy); no escribe nada ===');
  const ss = ssDestino_();
  const hoy = _leerId_diag24(ss.getSheetByName(RDV_HOJA_DESTINO), 'HOY (' + RDV_HOJA_DESTINO + ')');
  if (!hoy) return { error: 'el destino no tiene columna ID' };
  let bk = null;
  try {
    const ssB = SpreadsheetApp.openById(RDV_SS_BACKUP_BASE);
    bk = _leerId_diag24(ssB.getSheetByName(RDV_HOJA_DESTINO_REAL), 'BACKUP (' + RDV_BACKUP_BASE_VERSION + ')');
  } catch (err) {
    Logger.log('>>> el backup de la base (%s) no se pudo abrir: %s', RDV_SS_BACKUP_BASE, err);
  }
  const pr = _idsPorClave_diag24(ss.getSheetByName('Para Revisar'));
  const out = { hoy: _resumenId_diag24(hoy), backup: bk ? _resumenId_diag24(bk) : null, cambios: [], porQuien: {},
                guionesBajos: [], repetidos: [], unpivot: null, aux: null };

  // 2. Los que cambiaron desde el backup.
  if (bk) {
    const enBk = new Map();
    for (let j = 1; j < bk.vals.length; j++) {
      const k = _claveFila_diag24(bk, j);
      if (!k) continue;
      if (!enBk.has(k)) enBk.set(k, []);
      enBk.get(k).push(j);
    }
    const colBk = {};
    bk.hdr.forEach(function (h, k) { if (h) colBk[normalizeHeader_(h)] = k; });
    for (let i = 1; i < hoy.vals.length; i++) {
      const k = _claveFila_diag24(hoy, i);
      const cands = k ? enBk.get(k) || [] : [];
      if (!cands.length) continue;                                // reunión nueva desde el backup
      const j = cands.indexOf(i) >= 0 ? i : cands[0];
      const antes = str(bk.vals[j][bk.iId]), ahora = str(hoy.vals[i][hoy.iId]);
      if (antes === ahora) continue;
      const otras = [];
      hoy.hdr.forEach(function (h, c) {
        if (!h || c === hoy.iId) return;
        const cb = colBk[normalizeHeader_(h)];
        if (cb == null || str(bk.disp[j][cb]) === str(hoy.disp[i][c])) return;
        otras.push(h + ': "' + str(bk.disp[j][cb]) + '" → "' + str(hoy.disp[i][c]) + '"');
      });
      const legado = _idLegado_diag24(hoy, i);
      const x = { fila: i + 1, filaBackup: j + 1, figura: str(hoy.vals[i][hoy.iFig]), fecha: str(hoy.disp[i][hoy.iFec]),
                  antes: antes, ahora: ahora, formulaAntes: bk.formulas[j] || '', formulaHoy: hoy.formulas[i] || '',
                  fondo: hoy.fondos[i], fondoAntes: bk.fondos[j], otras: otras, esLegado: ahora === legado,
                  enParaRevisar: (pr.get(k) || []).indexOf(ahora) >= 0 };
      x.quien = _quienEscribio_diag24(x);
      out.porQuien[x.quien] = (out.porQuien[x.quien] || 0) + 1;
      out.cambios.push(x);
    }
  }
  Logger.log('--- 2. ID que cambiaron desde el backup (la misma reunión, por figura + fecha): %s ---', out.cambios.length);
  out.cambios.forEach(function (x) {
    Logger.log('  fila %s (en el backup, %s) | %s | %s\n      antes: %s\n      hoy:   %s\n      fórmula antes: %s | hoy: %s | ' +
               'fondo antes %s, hoy %s | ¿el del legado con los datos de hoy? %s | ¿el de Para Revisar? %s\n      otras columnas que ' +
               'cambiaron: %s\n      → %s', x.fila, x.filaBackup, x.figura, x.fecha, x.antes || '(vacía)', x.ahora || '(vacía)',
               x.formulaAntes || '—', x.formulaHoy || '—', x.fondoAntes, x.fondo, x.esLegado ? 'sí' : 'no',
               x.enParaRevisar ? 'sí' : 'no', x.otras.length ? x.otras.slice(0, 8).join(' · ') : 'ninguna', x.quien);
  });
  Object.keys(out.porQuien).forEach(function (q) { Logger.log('  %s: %s', q, out.porQuien[q]); });

  // 3. Los de guiones bajos, uno por uno.
  (hoy.porFormato['con guiones bajos'] || []).forEach(function (n) {
    out.guionesBajos.push({ fila: n, figura: str(hoy.vals[n - 1][hoy.iFig]), fecha: str(hoy.disp[n - 1][hoy.iFec]),
                            id: str(hoy.vals[n - 1][hoy.iId]), formula: hoy.formulas[n - 1] || '', fondo: hoy.fondos[n - 1] });
  });
  Logger.log('--- 3. con guiones bajos: %s ---', out.guionesBajos.length);
  out.guionesBajos.slice(0, 30).forEach(function (x) {
    Logger.log('  fila %s | %s | %s | %s | fórmula: %s | fondo %s', x.fila, x.figura, x.fecha, x.id, x.formula || '—', x.fondo);
  });

  // 4. ID repetidos (hoy): el mismo valor en reuniones distintas.
  const porId = new Map();
  for (let i = 1; i < hoy.vals.length; i++) {
    const v = str(hoy.vals[i][hoy.iId]);
    if (!v) continue;
    if (!porId.has(v)) porId.set(v, []);
    porId.get(v).push(i + 1);
  }
  porId.forEach(function (filas, v) { if (filas.length >= 2) out.repetidos.push({ id: v, filas: filas }); });
  Logger.log('--- 4. ID repetidos (el mismo ID en 2 o más filas): %s ---', out.repetidos.length);
  out.repetidos.slice(0, 15).forEach(function (x) { Logger.log('  %s → filas %s', x.id, x.filas.join(', ')); });

  // 5. Las solapas del script atado.
  out.unpivot = _solapaAtado_diag24(ss.getSheetByName('Datos_Unpivot'), 'FechaCarga');
  out.aux = _solapaAtado_diag24(ss.getSheetByName('Aux_Maximos'), null);
  Logger.log('--- 5. el script atado ---');
  Logger.log('  Datos_Unpivot: %s', out.unpivot ? out.unpivot.filas + ' filas | ID con valor ' + out.unpivot.idsConValor +
             ' (distintos ' + out.unpivot.idsDistintos + ') | última corrida (FechaCarga): ' + out.unpivot.ultima : 'no está');
  Logger.log('  Aux_Maximos: %s', out.aux ? out.aux.filas + ' filas | ID con valor ' + out.aux.idsConValor : 'no está');
  Logger.log('  celdas #4F81BD (el azul VIEJO) en toda la solapa: backup %s | hoy %s   (si subió, algo que pinta el azul viejo ' +
             'escribió después del 04/10: el paso 5 del legado; el sistema pinta #CFE2F3)', bk ? bk.azulesViejos : '?', hoy.azulesViejos);
  // 6. El formato propuesto para la derivada 12 ("Figura - Barrio - dd/MM/yyyy", vacía sin figura): ¿repite?
  const prop = new Map();
  for (let i = 1; i < hoy.vals.length; i++) {
    if (esVacio_(hoy.vals[i][hoy.iFig])) continue;
    const v = _idLegado_diag24(hoy, i);
    if (!prop.has(v)) prop.set(v, []);
    prop.get(v).push(i + 1);
  }
  out.propuesto = { filas: 0, repetidos: [], laHoraDesempata: 0 };
  prop.forEach(function (filas, v) {
    out.propuesto.filas += filas.length;
    if (filas.length < 2) return;
    const horas = filas.map(function (n) { return hoy.iHora == null ? '' : str(hoy.disp[n - 1][hoy.iHora]); });
    const desempata = horas.every(function (h) { return h; }) && new Set(horas).size === horas.length;
    if (desempata) out.propuesto.laHoraDesempata++;
    out.propuesto.repetidos.push({ id: v, filas: filas, horas: horas, desempata: desempata });
  });
  Logger.log('--- 6. el formato propuesto ("Figura - Barrio - dd/MM/yyyy"), en las %s filas con figura: repetidos %s (la hora ' +
             'los desempata en %s) ---', out.propuesto.filas, out.propuesto.repetidos.length, out.propuesto.laHoraDesempata);
  out.propuesto.repetidos.slice(0, 15).forEach(function (x) {
    Logger.log('  %s → filas %s (horas: %s)', x.id, x.filas.join(', '), x.horas.join(' / '));
  });

  Logger.log('  >>> Nada de este proyecto escribe la columna ID. Para saber quién escribió una celda: clic derecho → "Mostrar ' +
             'historial de ediciones" (dice la cuenta y la hora).');
  return out;
}

/** Lee la columna ID de una solapa: valores, lo que se ve, fórmulas y fondos de la columna, y los formatos. */
function _leerId_diag24(sh, titulo) {
  if (!sh) { Logger.log('--- %s: no está la solapa ---', titulo); return null; }
  const nF = sh.getLastRow(), nC = sh.getLastColumn();
  const rango = sh.getRange(1, 1, nF, nC);
  const vals = rango.getValues(), disp = rango.getDisplayValues(), hdr = vals[0];
  const iId = findIdxOr_(hdr, ['id'], true);
  if (iId == null) { Logger.log('--- %s: no tiene columna "ID" ---', titulo); return null; }
  const colId = sh.getRange(1, iId + 1, nF, 1);
  const ix = function (n) { return findIdxOr_(hdr, aliasColumna_(n), true); };
  const t = { titulo: titulo, hdr: hdr, vals: vals, disp: disp, iId: iId, iFig: ix('Figura'), iBar: ix('Barrio'), iFec: ix('FECHA'),
              iHora: ix('HORA'),
              formulas: colId.getFormulas().map(function (x) { return x[0]; }),
              fondos: colId.getBackgrounds().map(function (x) { return String(x[0] || '').toLowerCase(); }),
              porFormato: {}, conFormula: 0, azulesViejos: 0 };
  // El azul viejo (#4F81BD) en TODA la solapa: el sistema pinta #CFE2F3 desde el 02/10; el paso 5 del legado, #4F81BD.
  rango.getBackgrounds().forEach(function (fila) {
    fila.forEach(function (c) { if (String(c || '').toLowerCase() === '#4f81bd') t.azulesViejos++; });
  });
  for (let i = 1; i < nF; i++) {
    const conDatos = !esVacio_(vals[i][t.iFig]) || !esVacio_(vals[i][t.iFec]) || !esVacio_(vals[i][iId]);
    if (!conDatos) continue;
    const f = _formatoId_diag24(vals[i][iId]);
    (t.porFormato[f] = t.porFormato[f] || []).push(i + 1);
    if (t.formulas[i]) t.conFormula++;
  }
  Logger.log('--- 1. %s: ID en la columna %s | celdas con fórmula: %s ---', titulo, _letraCol_(iId + 1), t.conFormula);
  Object.keys(t.porFormato).forEach(function (f) {
    const l = t.porFormato[f];
    Logger.log('    %s: %s%s', f, l.length, f === 'vacío' ? '' : ' (ej. fila ' + l[0] + ': ' + str(vals[l[0] - 1][iId]) + ')');
  });
  return t;
}

/** El formato de un ID. */
function _formatoId_diag24(v) {
  const s = str(v);
  if (!s) return 'vacío';
  if (/GMT[+-]\d{4}/.test(s)) return 'con " | " y una fecha de JavaScript ("GMT": unpivotEventos)';
  if (/ \| /.test(s)) return 'con " | ", sin GMT';
  if (/^[^|]+ - [^|]+ - \d{2}\/\d{2}\/\d{4}$/.test(s) || /^[^|]+ - \d{2}\/\d{2}\/\d{4}$/.test(s)) return 'Figura - Barrio - dd/MM/yyyy';
  if (/_/.test(s)) return 'con guiones bajos';
  return 'otro';
}

function _resumenId_diag24(t) {
  const r = { conFormula: t.conFormula, porFormato: {}, azulesViejos: t.azulesViejos };
  Object.keys(t.porFormato).forEach(function (f) { r.porFormato[f] = t.porFormato[f].length; });
  return r;
}

/** La reunión de una fila: figura + fecha (por día). '' si falta alguna. */
function _claveFila_diag24(t, i) {
  const fig = normalizeText_(t.vals[i][t.iFig]), f = t.vals[i][t.iFec];
  const dia = f instanceof Date ? ymd_(f) : str(t.disp[i][t.iFec]);
  return fig && dia ? fig + '|' + dia : '';
}

/** El ID que arma el legado (buildIdFinal_ de "Agenda push a base.js", buildIdA2_): "Figura - Barrio - dd/MM/yyyy". */
function _idLegado_diag24(t, i) {
  const f = t.vals[i][t.iFec];
  const fecha = f instanceof Date ? Utilities.formatDate(f, RDV_TZ, 'dd/MM/yyyy') : str(t.disp[i][t.iFec]);
  return [str(t.vals[i][t.iFig]), t.iBar == null ? '' : str(t.vals[i][t.iBar]), fecha].filter(Boolean).join(' - ');
}

/** Los ID de "Para Revisar" por reunión (figura + fecha). */
function _idsPorClave_diag24(sh) {
  const m = new Map();
  if (!sh || sh.getLastRow() < 2) return m;
  const vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), hdr = vals[0];
  const iId = findIdxOr_(hdr, ['id'], true), iFig = findIdxOr_(hdr, aliasColumna_('Figura'), true);
  const iFec = findIdxOr_(hdr, aliasColumna_('FECHA'), true);
  if (iId == null || iFig == null || iFec == null) return m;
  for (let i = 1; i < vals.length; i++) {
    const f = vals[i][iFec], fig = normalizeText_(vals[i][iFig]);
    if (!fig || !(f instanceof Date)) continue;
    const k = fig + '|' + ymd_(f);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(str(vals[i][iId]));
  }
  return m;
}

/** Qué escribió un ID que cambió, según las pistas (ver el encabezado del archivo). */
function _quienEscribio_diag24(x) {
  if (x.formulaHoy) return 'una fórmula (la calcula la planilla)';
  if (/GMT[+-]\d{4}/.test(x.ahora) && !x.antes) return 'unpivotEventos (script atado), en una celda vacía';
  if (x.fondo === '#4f81bd' && x.enParaRevisar) return 'el paso 5 del legado (copió de Para Revisar, pinta #4F81BD)';
  if (x.formulaAntes && !x.formulaHoy) return 'se borró la fórmula y quedó un valor (alguien pegó valores o escribió encima)';
  if (x.esLegado) return 'el formato del legado, sin fórmula ni color: una persona o un script de otra cuenta (historial de ediciones)';
  return 'otro: mirar el historial de ediciones de la celda';
}

/** Una solapa del script atado: filas, ID con valor y distintos, y la última corrida (columna `colFecha`, si se pide). */
function _solapaAtado_diag24(sh, colFecha) {
  if (!sh || sh.getLastRow() < 1) return null;
  const nF = sh.getLastRow(), nC = sh.getLastColumn();
  const vals = sh.getRange(1, 1, nF, nC).getValues(), hdr = vals[0];
  const iId = findIdxOr_(hdr, ['id'], true), iF = colFecha ? findIdxOr_(hdr, [colFecha], true) : null;
  const ids = new Set();
  let conValor = 0, ultima = null;
  for (let i = 1; i < nF; i++) {
    if (iId != null && !esVacio_(vals[i][iId])) { conValor++; ids.add(str(vals[i][iId])); }
    const d = iF == null ? null : vals[i][iF];
    if (d instanceof Date && (!ultima || d > ultima)) ultima = d;
  }
  return { filas: nF - 1, idsConValor: conValor, idsDistintos: ids.size,
           ultima: ultima ? Utilities.formatDate(ultima, RDV_TZ, 'dd/MM/yyyy HH:mm') : (colFecha ? '(sin fecha)' : null) };
}
