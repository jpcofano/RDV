/**
 * diagnostico/25_looker_pruebas.js — PASO 54 (08/10). SÓLO LECTURA: las pruebas de la FASE 2 del tablero de Looker
 * (44_Looker.js), antes de que el sistema escriba la ID, Datos_Unpivot y Aux_Maximos (LOOKER_EN_SISTEMA).
 *
 *   A  pruebaLookerBackup()     el BACKUP de la base (04/10), modo compatible, contra SUS dos solapas: tiene que dar
 *                               IDÉNTICO.
 *   B  pruebaLookerHoy()        HOY, modo compatible, contra las dos solapas de hoy: IDÉNTICO, salvo lo que cambió RVD
 *                               después de la última corrida del script atado (FechaCarga). Esas diferencias se listan
 *                               por fila de RVD, con la hora de la última corrida de cada uno.
 *   C  pruebaLookerCorregido()  HOY, modo corregido contra modo compatible, sobre la MISMA lectura de RVD (sin
 *                               diferencias de horario): cada diferencia con su motivo —la ID, "Sin identificar" de
 *                               género, P. Varon / P. Mujer—; cualquier otra ("otra") es un error. Con cantidades y
 *                               ejemplos, las reuniones distintas (ID distintos) de Datos_Unpivot antes y después, y la ID
 *                               nueva de RVD (cuántas celdas cambian, repetidas, celdas con fórmula).
 *
 * FechaCarga no se compara (es la hora de cada corrida). Las fechas y horas se comparan como las guarda Sheets (una hora
 * escrita "19:00" vuelve como hora; un "1" escrito como texto, como número).
 */
function pruebaLookerBackup() {
  Logger.log('=== prueba A (paso 54a) — SÓLO LECTURA: el backup de la base (%s), modo compatible, contra sus solapas ===',
             RDV_BACKUP_BASE_VERSION);
  let ss;
  try { ss = SpreadsheetApp.openById(RDV_SS_BACKUP_BASE); }
  catch (err) { Logger.log('>>> el backup (%s) no se pudo abrir: %s', RDV_SS_BACKUP_BASE, err); return { error: String(err) }; }
  return _pruebaCompatible_diag25(ss, RDV_HOJA_DESTINO_REAL, 'A');
}

function pruebaLookerHoy() {
  Logger.log('=== prueba B (paso 54b) — SÓLO LECTURA: hoy, modo compatible, contra las solapas de hoy ===');
  const r = _pruebaCompatible_diag25(ssDestino_(), RDV_HOJA_DESTINO, 'B');
  const u = _ultimaEscrituraDeLaHora_diag25();
  Logger.log('  la corrida de la hora escribió por última vez: %s | el script atado corrió por última vez (FechaCarga): %s',
             u || '(no se sabe)', r.fechaCarga || '(no se sabe)');
  Logger.log('  Si la de la hora escribió DESPUÉS, las filas de RVD que cambió pueden diferir: no es un error de la copia.');
  r.ultimaEscritura = u;
  return r;
}

function pruebaLookerCorregido() {
  Logger.log('=== prueba C (paso 54c) — SÓLO LECTURA: hoy, modo corregido contra modo compatible (la misma lectura de RVD) ===');
  const ss = ssDestino_();
  const shR = ss.getSheetByName(RDV_HOJA_DESTINO);
  const rvd = _valoresHoja_diag25(shR);
  if (!rvd) return { error: 'no está la solapa ' + RDV_HOJA_DESTINO };
  const ids = idsDerivados_(rvd);
  const uC = armarDatosUnpivot_(rvd, { modo: 'compatible', fechaCarga: '' });
  const uK = armarDatosUnpivot_(rvd, { modo: 'corregido', ids: ids, fechaCarga: '' });
  if (uC.error || uK.error) { Logger.log('>>> %s', uC.error || uK.error); return { error: uC.error || uK.error }; }
  const out = { unpivot: _clasificarUnpivot_diag25(rvd, uC, uK), aux: null, reuniones: {}, id: {} };

  // Aux_Maximos: lo único que cambia entre los dos modos es qué ID se usa para saltear filas sin ID.
  const aC = armarAuxMaximos_(rvd, { modo: 'compatible' }), aK = armarAuxMaximos_(rvd, { modo: 'corregido', ids: ids });
  if (aC.error || aK.error) out.aux = { error: aC.error || aK.error };
  else {
    const cmp = _compararFilas_diag25(aK.filas, aC.filas, []);
    const iIdR = rvd[0].map(function (h) { return String(h).trim(); }).indexOf('ID');
    const cambianFilas = [];
    for (let r = 1; r < rvd.length; r++) {
      const antes = iIdR === -1 ? '' : str(rvd[r][iIdR]), despues = str(ids[r]);
      if (!!antes !== !!despues) cambianFilas.push({ fila: r + 1, figura: str(rvd[r][findIdxOr_(rvd[0], ['figura'], true)]), antes: antes, despues: despues });
    }
    out.aux = { identico: cmp.identico, distintas: cmp.soloA.length + cmp.soloB.length, filasRvd: cambianFilas,
                otra: !cmp.identico && !cambianFilas.length };
  }

  // Las reuniones distintas que cuenta Datos_Unpivot: la solapa de hoy, y la del sistema.
  const du = _valoresHoja_diag25(ss.getSheetByName(RDV_HOJA_UNPIVOT));
  const distintos = function (filas) { return new Set(filas.map(function (f) { return _canonLooker_diag25(f[0]); })).size; };
  out.reuniones = { solapaHoy: du ? distintos(du.slice(1)) : null, compatible: distintos(uC.filas), corregido: distintos(uK.filas),
                    rvdConFigura: ids.filter(Boolean).length };

  // La ID nueva de RVD.
  const iId = rvd[0].map(function (h) { return String(h).trim(); }).indexOf('ID');
  let cambian = 0;
  const ejemplos = [];
  for (let r = 1; r < rvd.length; r++) {
    const antes = iId === -1 ? '' : str(rvd[r][iId]);
    if (antes === ids[r]) continue;
    cambian++;
    if (ejemplos.length < 8) ejemplos.push({ fila: r + 1, antes: antes, despues: ids[r] });
  }
  const cuenta = new Map();
  ids.forEach(function (v) { if (v) cuenta.set(v, (cuenta.get(v) || 0) + 1); });
  const repetidas = [];
  cuenta.forEach(function (n, v) { if (n > 1) repetidas.push(v); });
  const conFormula = iId === -1 || rvd.length < 2 ? 0
    : shR.getRange(2, iId + 1, rvd.length - 1, 1).getFormulas().filter(function (x) { return x[0]; }).length;
  out.id = { cambian: cambian, ejemplos: ejemplos, repetidas: repetidas.length, conFormula: conFormula,
             conHora: ids.filter(function (v) { return / - \d{2}:\d{2}( \(\d+\))?$/.test(v); }).length };

  _logPruebaC_diag25(out);
  return out;
}

// ===================== A y B =====================

function _pruebaCompatible_diag25(ss, hojaRvd, cual) {
  const rvd = _valoresHoja_diag25(ss.getSheetByName(hojaRvd));
  if (!rvd) { Logger.log('>>> no está la solapa %s', hojaRvd); return { error: 'no está la solapa ' + hojaRvd }; }
  const du = _valoresHoja_diag25(ss.getSheetByName(RDV_HOJA_UNPIVOT));
  const am = _valoresHoja_diag25(ss.getSheetByName(RDV_HOJA_AUX_MAXIMOS));
  const u = armarDatosUnpivot_(rvd, { modo: 'compatible', fechaCarga: '' });
  const a = armarAuxMaximos_(rvd, { modo: 'compatible' });
  const out = { prueba: cual, unpivot: null, aux: null, fechaCarga: null, sinId: u.idsGenerados || 0 };
  if (u.error) out.unpivot = { error: u.error };
  else if (!du) out.unpivot = { error: 'no está la solapa ' + RDV_HOJA_UNPIVOT };
  else {
    const suyas = du.slice(1).map(function (r) { return r.slice(0, ENCABEZADO_UNPIVOT_.length); });
    out.unpivot = _compararFilas_diag25(u.filas, suyas, [11]);
    out.unpivot.encabezado = _mismoEncabezado_diag25(du[0], ENCABEZADO_UNPIVOT_);
    out.unpivot.filasRvd = _filasRvdDistintas_diag25(rvd, u, out.unpivot, suyas);
    let ult = null;
    suyas.forEach(function (r) { if (r[11] instanceof Date && (!ult || r[11] > ult)) ult = r[11]; });
    out.fechaCarga = ult ? Utilities.formatDate(ult, RDV_TZ, 'dd/MM/yyyy HH:mm') : null;
  }
  if (a.error) out.aux = { error: a.error };
  else if (!am) out.aux = { error: 'no está la solapa ' + RDV_HOJA_AUX_MAXIMOS };
  else {
    out.aux = _compararFilas_diag25(a.filas, am.slice(1).map(function (r) { return r.slice(0, ENCABEZADO_AUX_MAXIMOS_.length); }), []);
    out.aux.encabezado = _mismoEncabezado_diag25(am[0], ENCABEZADO_AUX_MAXIMOS_);
  }
  _logPruebaCompatible_diag25(out, cual);
  return out;
}

/** Las filas de RVD de las filas de Datos_Unpivot que no coinciden (las nuestras, por su origen; las suyas, por la ID). */
function _filasRvdDistintas_diag25(rvd, u, cmp, suyas) {
  if (cmp.identico) return [];
  const iId = rvd[0].map(function (h) { return String(h).trim(); }).indexOf('ID');
  const porId = new Map();
  for (let r = 1; r < rvd.length; r++) {
    const k = iId === -1 ? '' : _canonLooker_diag25(rvd[r][iId]);
    if (!porId.has(k)) porId.set(k, []);
    porId.get(k).push(r);
  }
  const filas = new Map();
  const sumar = function (r) { filas.set(r, (filas.get(r) || 0) + 1); };
  cmp.soloA.forEach(function (i) { sumar(u.origen[i]); });
  cmp.soloB.forEach(function (j) { (porId.get(_canonLooker_diag25(suyas[j][0])) || [-1]).forEach(sumar); });
  const iFig = findIdxOr_(rvd[0], ['figura'], true), iFec = findIdxOr_(rvd[0], ['fecha'], true);
  return Array.from(filas.keys()).sort(function (a, b) { return a - b; }).map(function (r) {
    return r < 0 ? { fila: '(una ID que ya no está en RVD)', n: filas.get(r) }
      : { fila: r + 1, figura: str(rvd[r][iFig]), fecha: rvd[r][iFec] instanceof Date ? fmtFecha_(rvd[r][iFec]) : str(rvd[r][iFec]),
          n: filas.get(r) };
  });
}

// ===================== C =====================

/**
 * Datos_Unpivot, corregido contra compatible, por fila de RVD y categoría. Motivos: "la ID" (cambia la ID, o la fila sale
 * porque no tiene figura), "Sin identificar de género" (cambia el valor, sale o entra), "P. Varon / P. Mujer" (si el modo
 * compatible los usaba porque faltaba Masculinos / Femeninos), y "otra" (cualquier otra: un error).
 */
function _clasificarUnpivot_diag25(rvd, uC, uK) {
  const agrupar = function (u) {
    const m = new Map();
    u.filas.forEach(function (f, i) { const r = u.origen[i]; if (!m.has(r)) m.set(r, []); m.get(r).push(f); });
    return m;
  };
  const mC = agrupar(uC), mK = agrupar(uK);
  const hdr = rvd[0].map(function (h) { return _normLooker_(h); });
  const aliasM = ['p. varon', 'p varon'].indexOf(_primeroDe_diag25(hdr, ['Masculinos', 'Maculinos', 'Varones', 'P. Varon', 'P Varon'])) >= 0;
  const aliasF = ['p. mujer', 'p mujer'].indexOf(_primeroDe_diag25(hdr, ['Femeninos', 'Mujeres', 'P. Mujer', 'P Mujer'])) >= 0;
  const motivos = { id: { filas: 0, filasRvd: 0, ejemplos: [] }, idSale: { filas: 0, filasRvd: 0, ejemplos: [] },
                    genero: { cambia: 0, sale: 0, entra: 0, ejemplos: [] }, pvaron: { filas: 0, ejemplos: [] },
                    otra: { filas: 0, ejemplos: [] } };
  const filasRvd = new Set(Array.from(mC.keys()).concat(Array.from(mK.keys())));
  const cat = function (f) { return f[8] + '|' + f[9]; };
  const fila = function (r) { return { fila: r + 1, figura: str(rvd[r][findIdxOr_(rvd[0], ['figura'], true)]) }; };
  filasRvd.forEach(function (r) {
    const rc = mC.get(r) || [], rk = mK.get(r) || [];
    if (rc.length && !rk.length) {
      motivos.idSale.filas += rc.length; motivos.idSale.filasRvd++;
      if (motivos.idSale.ejemplos.length < 5) motivos.idSale.ejemplos.push(Object.assign(fila(r), { id: str(rc[0][0]) }));
      return;
    }
    if (!rc.length && rk.length) {   // no debería pasar: el modo compatible incluye toda fila con figura
      motivos.otra.filas += rk.length;
      if (motivos.otra.ejemplos.length < 5) motivos.otra.ejemplos.push(Object.assign(fila(r), { que: 'sólo en el corregido' }));
      return;
    }
    if (_canonLooker_diag25(rc[0][0]) !== _canonLooker_diag25(rk[0][0])) {
      motivos.id.filas += rk.length; motivos.id.filasRvd++;
      if (motivos.id.ejemplos.length < 5) motivos.id.ejemplos.push(Object.assign(fila(r), { antes: str(rc[0][0]), despues: str(rk[0][0]) }));
    }
    const porCat = new Map();
    rc.forEach(function (f) { porCat.set(cat(f), { c: f }); });
    rk.forEach(function (f) { const x = porCat.get(cat(f)) || {}; x.k = f; porCat.set(cat(f), x); });
    porCat.forEach(function (x, k) {
      const valC = x.c ? x.c[10] : null, valK = x.k ? x.k[10] : null;
      if (k === 'Género|Sin identificar') {
        const t = !x.c ? 'entra' : !x.k ? 'sale' : valC !== valK ? 'cambia' : '';
        if (!t) return;
        motivos.genero[t]++;
        if (motivos.genero.ejemplos.length < 8) motivos.genero.ejemplos.push(Object.assign(fila(r), { que: t, antes: valC, despues: valK }));
        return;
      }
      if ((k === 'Género|Masculinos' && aliasM) || (k === 'Género|Femeninos' && aliasF)) {
        motivos.pvaron.filas++;
        if (motivos.pvaron.ejemplos.length < 5) motivos.pvaron.ejemplos.push(Object.assign(fila(r), { cat: k, antes: valC, despues: valK }));
        return;
      }
      const igual = x.c && x.k && x.c.every(function (v, j) { return j === 0 || j === 11 || _canonLooker_diag25(v) === _canonLooker_diag25(x.k[j]); });
      if (!igual) {
        motivos.otra.filas++;
        if (motivos.otra.ejemplos.length < 5) motivos.otra.ejemplos.push(Object.assign(fila(r), { cat: k, antes: valC, despues: valK }));
      }
    });
  });
  return { motivos: motivos, filasCompatible: uC.filas.length, filasCorregido: uK.filas.length, aliasActivos: aliasM || aliasF };
}

function _primeroDe_diag25(hdrNorm, aliases) {
  for (let a = 0; a < aliases.length; a++) { const k = _normLooker_(aliases[a]); if (hdrNorm.indexOf(k) >= 0) return k; }
  return '';
}

// ===================== Comparar =====================

/**
 * Compara dos listas de filas: en orden (¿idénticas?) y como multiconjunto (las que están sólo de un lado). `ignorar`:
 * índices de columna que no se comparan (FechaCarga). Devuelve `{ identico, a, b, mismoConjunto, soloA, soloB, primera }`
 * (soloA / soloB: índices).
 */
function _compararFilas_diag25(a, b, ignorar) {
  const clave = function (r) {
    return r.map(function (v, k) { return ignorar.indexOf(k) >= 0 ? '' : _canonLooker_diag25(v); }).join('␟');
  };
  const ka = a.map(clave), kb = b.map(clave);
  let primera = -1;
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) if (ka[i] !== kb[i]) { primera = i; break; }
  if (primera < 0) return { identico: true, a: ka.length, b: kb.length, soloA: [], soloB: [], mismoConjunto: true, primera: -1 };
  const cuenta = function (lista) { const m = new Map(); lista.forEach(function (k) { m.set(k, (m.get(k) || 0) + 1); }); return m; };
  const cB = cuenta(kb), cA = cuenta(ka), soloA = [], soloB = [];
  ka.forEach(function (k, i) { const n = cB.get(k) || 0; if (n > 0) cB.set(k, n - 1); else soloA.push(i); });
  kb.forEach(function (k, j) { const n = cA.get(k) || 0; if (n > 0) cA.set(k, n - 1); else soloB.push(j); });
  return { identico: false, a: ka.length, b: kb.length, soloA: soloA, soloB: soloB,
           mismoConjunto: !soloA.length && !soloB.length, primera: primera, ejA: soloA.slice(0, 5).map(function (i) { return a[i]; }),
           ejB: soloB.slice(0, 5).map(function (j) { return b[j]; }) };
}

/** Un valor como lo guarda Sheets: una hora (fecha de 1899) "h19:00", una fecha "d2026-10-06", un número "n5", texto "s…". */
function _canonLooker_diag25(v) {
  if (v instanceof Date) {
    if (v.getFullYear() <= 1900) return 'h' + Utilities.formatDate(v, RDV_TZ, 'HH:mm');
    const t = Utilities.formatDate(v, RDV_TZ, 'yyyy-MM-dd HH:mm');
    return 'd' + (/ 00:00$/.test(t) ? t.slice(0, 10) : t);
  }
  if (typeof v === 'number') return 'n' + v;
  if (typeof v === 'boolean') return 'b' + v;
  const s = v == null ? '' : String(v);
  const t = s.trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return 'n' + Number(t);
  if (/^\d{1,2}:\d{2}$/.test(t)) return 'h' + t.padStart(5, '0');
  return 's' + s;
}

function _mismoEncabezado_diag25(fila, esperado) {
  return esperado.every(function (h, k) { return String(fila[k] == null ? '' : fila[k]).trim() === h; });
}

function _valoresHoja_diag25(sh) {
  if (!sh || sh.getLastRow() < 1 || sh.getLastColumn() < 1) return null;
  return sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
}

/** La hora de la última corrida de la hora que escribió (REGISTRO_UPSERT, modo ESCRITURA), o null. */
function _ultimaEscrituraDeLaHora_diag25() {
  try {
    const sh = ssIntermedia_().getSheetByName(RDV_HOJA_REGISTRO);
    if (!sh || sh.getLastRow() < 2) return null;
    const n = Math.min(80, sh.getLastRow() - 1);
    const v = sh.getRange(sh.getLastRow() - n + 1, 1, n, 2).getValues();
    for (let i = v.length - 1; i >= 0; i--) {
      if (String(v[i][1]) === 'ESCRITURA' && v[i][0] instanceof Date) return Utilities.formatDate(v[i][0], RDV_TZ, 'dd/MM/yyyy HH:mm');
    }
  } catch (err) { Logger.log('  (no se pudo leer %s: %s)', RDV_HOJA_REGISTRO, err); }
  return null;
}

// ===================== El log =====================

function _textoFila_diag25(r) {
  return r.map(function (v) { return _canonLooker_diag25(v).slice(1); }).join(' | ');
}

function _logComparacion_diag25(nombre, c) {
  if (!c) return;
  if (c.error) { Logger.log('  %s: NO SE PUDO COMPARAR — %s', nombre, c.error); return; }
  Logger.log('  %s: %s | filas: el sistema %s, la solapa %s | encabezado igual: %s', nombre,
             c.identico ? 'IDÉNTICO' : c.mismoConjunto ? 'las mismas filas, en otro orden' : 'DISTINTO', c.a, c.b,
             c.encabezado === undefined ? '—' : (c.encabezado ? 'sí' : 'NO'));
  if (c.identico || c.mismoConjunto) return;
  Logger.log('    sólo en el sistema: %s | sólo en la solapa: %s', c.soloA.length, c.soloB.length);
  (c.ejA || []).forEach(function (r) { Logger.log('      sistema: %s', _textoFila_diag25(r)); });
  (c.ejB || []).forEach(function (r) { Logger.log('      solapa:  %s', _textoFila_diag25(r)); });
}

function _logPruebaCompatible_diag25(out, cual) {
  Logger.log('--- prueba %s ---', cual);
  _logComparacion_diag25(RDV_HOJA_UNPIVOT + ' (sin FechaCarga)', out.unpivot);
  _logComparacion_diag25(RDV_HOJA_AUX_MAXIMOS, out.aux);
  if (out.sinId) Logger.log('  filas de RVD sin ID (el script atado no corrió desde que se crearon; el modo compatible les arma la ' +
                            'ID como él): %s', out.sinId);
  if (out.unpivot && out.unpivot.filasRvd && out.unpivot.filasRvd.length) {
    Logger.log('  las filas de RVD de las diferencias de %s (filas de la solapa que difieren por cada una):', RDV_HOJA_UNPIVOT);
    out.unpivot.filasRvd.slice(0, 40).forEach(function (x) { Logger.log('    fila %s | %s | %s → %s', x.fila, x.figura || '', x.fecha || '', x.n); });
  }
  Logger.log('  la última corrida del script atado (FechaCarga de %s): %s', RDV_HOJA_UNPIVOT, out.fechaCarga || '(no se sabe)');
}

function _logPruebaC_diag25(out) {
  const m = out.unpivot.motivos;
  Logger.log('--- prueba C: %s, corregido contra compatible (filas: compatible %s, corregido %s) ---', RDV_HOJA_UNPIVOT,
             out.unpivot.filasCompatible, out.unpivot.filasCorregido);
  Logger.log('  la ID: cambia en %s filas de RVD (%s filas de la solapa)', m.id.filasRvd, m.id.filas);
  m.id.ejemplos.forEach(function (x) { Logger.log('      fila %s | %s → %s', x.fila, x.antes, x.despues); });
  Logger.log('  la ID: salen %s filas de RVD sin figura que tenían una ID vieja (%s filas de la solapa)', m.idSale.filasRvd, m.idSale.filas);
  m.idSale.ejemplos.forEach(function (x) { Logger.log('      fila %s | ID vieja: %s', x.fila, x.id); });
  Logger.log('  "Sin identificar" de género: cambia el valor %s | sale (falta un dato o no da positivo) %s | entra %s',
             m.genero.cambia, m.genero.sale, m.genero.entra);
  m.genero.ejemplos.forEach(function (x) { Logger.log('      fila %s | %s | %s: %s → %s', x.fila, x.figura, x.que, x.antes, x.despues); });
  Logger.log('  P. Varon / P. Mujer: %s filas (%s)', m.pvaron.filas, out.unpivot.aliasActivos ? 'el modo compatible los usaba' :
             'hoy el script atado no los usa: Masculinos y Femeninos existen');
  Logger.log('  OTRA (tiene que dar 0): %s', m.otra.filas);
  m.otra.ejemplos.forEach(function (x) { Logger.log('      fila %s | %s | %s: %s → %s', x.fila, x.figura, x.cat || x.que, x.antes, x.despues); });
  if (out.aux.error) Logger.log('--- %s: %s', RDV_HOJA_AUX_MAXIMOS, out.aux.error);
  else {
    Logger.log('--- prueba C: %s — %s; filas de RVD que entran o salen por la ID: %s%s', RDV_HOJA_AUX_MAXIMOS,
               out.aux.identico ? 'IDÉNTICO' : out.aux.distintas + ' filas distintas', out.aux.filasRvd.length,
               out.aux.otra ? ' — OJO: hay diferencias sin ninguna fila que cambie por la ID (OTRA)' : '');
    out.aux.filasRvd.slice(0, 8).forEach(function (x) { Logger.log('      fila %s | %s | ID: "%s" → "%s"', x.fila, x.figura, x.antes, x.despues); });
  }
  Logger.log('--- reuniones distintas (ID distintos) en %s: la solapa de hoy %s | el sistema, compatible %s | corregido %s ' +
             '(filas de RVD con figura: %s) ---', RDV_HOJA_UNPIVOT, out.reuniones.solapaHoy == null ? '—' : out.reuniones.solapaHoy,
             out.reuniones.compatible, out.reuniones.corregido, out.reuniones.rvdConFigura);
  Logger.log('--- la ID nueva de RVD (derivada 12): cambiarían %s celdas | repetidas %s | con "- HH:mm" %s | celdas con fórmula hoy %s ---',
             out.id.cambian, out.id.repetidas, out.id.conHora, out.id.conFormula);
  out.id.ejemplos.forEach(function (x) { Logger.log('      fila %s | "%s" → "%s"', x.fila, x.antes, x.despues); });
  if (out.id.conFormula) Logger.log('  >>> la columna ID tiene fórmulas: la corrida de la hora no la escribe (ni las solapas) hasta sacarlas.');
}
