/**
 * diagnostico/04_legado_fechas.js — ¿qué `legToDate_` corre, y qué le llega?
 *
 * SÓLO LECTURA. No escribe en ninguna planilla: todo va al log. Corre a mano, sin activador.
 *
 * --- Para qué ---
 * Hay tres copias de `legToDate_` en el legado (`Sinc A to A2.js`, `Sync B to B2.js`,
 * `Upset Base FInal.js`) y en Apps Script gana la última que carga (CLAUDE.md 3.1.c, y el
 * pendiente *"los leg*_ duplicados"* de la Fase 2). La llama el **único activador vivo**,
 * `syncAgendaSheetInBaseFromAgenda_2` (`Solapa agenda base final.js:72`):
 *
 *     const fecha = legToDate_(row[I.F_MAN]) || legToDate_(row[I.F_AUTO]);
 *
 * sobre `getValues()` de la solapa `Agenda` del archivo (4), columnas `Fecha (manual)` y
 * `Fecha (auto)`. Son dos preguntas, y ninguna se contesta leyendo el orden del push:
 *
 *   1. ¿Qué copia gana? Se le pregunta a la función: `'03/04/2026'` da 03/04 en las copias de
 *      A2 y Upset (día primero, idénticas entre sí) y 04/03 en la de B2 (`new Date(string)`).
 *   2. ¿Qué le llega? Con un `Date` las tres dan el mismo día —sólo cambia la hora: A2/Upset
 *      fijan las 12:00, B2 deja la original—. La diferencia real está en los `string`. Se
 *      cuenta cuántos llegan, y cuántos son ambiguos (día y mes ≤ 12).
 */

const DIAG4_COL_MANUAL = 'Fecha (manual)';   // los nombres exactos de agendaIdx_()
const DIAG4_COL_AUTO   = 'Fecha (auto)';
const DIAG4_EJEMPLOS   = 5;

/** Los dos puntos de arriba, en ese orden. Sólo lectura. */
function diagLegToDate() {
  const tz = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';
  Logger.log('=== diagLegToDate — sólo lectura, no escribe nada ===');
  Logger.log('zona horaria del script: %s', tz);

  _quienGana_diag4(tz);
  _queLlega_diag4(tz);
}

// ===================== 1. ¿Qué copia gana? =====================

function _quienGana_diag4(tz) {
  Logger.log('--- 1. ¿QUÉ COPIA DE legToDate_ GANA? (se le pregunta a la función) ---');
  if (typeof legToDate_ !== 'function') {
    Logger.log('  >>> legToDate_ NO EXISTE en el proyecto. El activador de Agenda fallaría.');
    return;
  }

  const real = new Date(2026, 3, 3, 15, 30, 0);   // 03/04/2026 15:30, un Date con hora
  const pruebas = [
    ['\'03/04/2026\'', '03/04/2026'],
    ['\'3/4/2026\'', '3/4/2026'],
    ['\'13/04/2026\'', '13/04/2026'],
    ['Date 03/04/2026 15:30', real]
  ];
  const r = {};
  pruebas.forEach(function (p) {
    let out, err = '';
    try { out = legToDate_(p[1]); } catch (e) { err = String(e); }
    r[p[0]] = out;
    Logger.log('  %s → %s', _pad_diag4(p[0], 24), err ? 'ERROR: ' + err : _desc_diag4(out, tz));
  });

  const d = r['\'03/04/2026\''];
  const dia = (_esDate_diag4(d) && !isNaN(d.getTime()))
    ? Utilities.formatDate(d, tz, 'dd/MM') : '';
  if (dia === '03/04') {
    Logger.log('  >>> Gana una copia DÍA PRIMERO: la de Sinc A to A2.js o la de Upset Base FInal.js');
    Logger.log('      (son idénticas; no hace falta saber cuál). Para strings dd/mm, correcta.');
  } else if (dia === '04/03') {
    Logger.log('  >>> Gana la copia de Sync B to B2.js (new Date(string)): lee MES PRIMERO.');
    Logger.log('      Un string dd/mm con día ≤ 12 sale con el mes corrido. Mirar el punto 2.');
  } else {
    Logger.log('  >>> Resultado inesperado para \'03/04/2026\' (%s). Ninguna de las tres copias',
               _desc_diag4(d, tz));
    Logger.log('      conocidas da eso: hay una cuarta, o cambió alguna. Mirar el proyecto.');
  }

  const h = r['Date 03/04/2026 15:30'];
  if (_esDate_diag4(h) && !isNaN(h.getTime())) {
    const hh = Utilities.formatDate(h, tz, 'HH:mm');
    Logger.log('      Confirmación por la hora del Date: %s → %s', hh,
               hh === '12:00' ? 'fija las 12:00 (A2/Upset)' :
               hh === '15:30' ? 'deja la hora (B2)' : 'no coincide con ninguna copia conocida');
  }
}

// ===================== 2. ¿Qué le llega? =====================

function _queLlega_diag4(tz) {
  Logger.log('--- 2. ¿QUÉ LE LLEGA A LA LÍNEA 72? (solapa %s del archivo (4)) ---', RDV_HOJA_AGENDA);
  const sh = SpreadsheetApp.openById(RDV_SS_AGENDA).getSheetByName(RDV_HOJA_AGENDA);
  if (!sh) { Logger.log('  >>> No existe la solapa "%s".', RDV_HOJA_AGENDA); return; }

  const nFilas = sh.getLastRow() - 1;
  if (nFilas < 1) { Logger.log('  La solapa no tiene filas de datos. Nada que medir.'); return; }
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  // Igual que agendaIdx_(): nombre exacto, sin normalizar. Si no está, el activador tampoco lo ve.
  const iMan = hdr.indexOf(DIAG4_COL_MANUAL), iAuto = hdr.indexOf(DIAG4_COL_AUTO);
  Logger.log('  %s filas | "%s" en la columna %s | "%s" en la columna %s', nFilas,
             DIAG4_COL_MANUAL, iMan === -1 ? 'NO ESTÁ' : iMan + 1,
             DIAG4_COL_AUTO, iAuto === -1 ? 'NO ESTÁ' : iAuto + 1);
  if (iMan === -1 && iAuto === -1) return;

  const vals = sh.getRange(2, 1, nFilas, sh.getLastColumn()).getValues();
  const man = _nuevoConteo_diag4(), auto = _nuevoConteo_diag4(), linea72 = _nuevoConteo_diag4();

  for (let i = 0; i < vals.length; i++) {
    const fila = i + 2;
    const vMan = iMan !== -1 ? vals[i][iMan] : '';
    const vAuto = iAuto !== -1 ? vals[i][iAuto] : '';
    if (iMan !== -1) _contar_diag4(man, vMan, fila);
    if (iAuto !== -1) _contar_diag4(auto, vAuto, fila);
    /*
     * Lo que efectivamente recibe la línea 72: `legToDate_(F_MAN) || legToDate_(F_AUTO)`. La
     * manual gana si da algo; si está vacía, entra la automática. Se replica sólo la elección
     * de cuál celda llega, no lo que hace legToDate_ con ella.
     */
    const llega = (vMan !== '' && vMan != null) ? vMan : vAuto;
    _contar_diag4(linea72, llega, fila);
  }

  _logConteo_diag4('Fecha (manual)', man, tz);
  _logConteo_diag4('Fecha (auto)', auto, tz);
  _logConteo_diag4('lo que llega a la línea 72 (manual si tiene algo, si no auto)', linea72, tz);

  Logger.log('  Qué NO dice esto:');
  Logger.log('   - "ambiguo" es día y mes ≤ 12. Sólo los que además tienen día ≠ mes cambian de');
  Logger.log('     fecha si gana la copia de B2; con día = mes (05/05) da lo mismo.');
  Logger.log('   - No mide el daño hecho: la solapa espejo se rehace entera en cada corrida, así');
  Logger.log('     que lo que hay hoy es lo que produjo la copia que ganó en la última.');

  if (linea72.str.n === 0) {
    Logger.log('  >>> A la línea 72 no le llega NINGÚN string. Con Date las tres copias dan el mismo');
    Logger.log('      día: la diferencia de copias no afecta a este activador hoy.');
  } else {
    Logger.log('  >>> A la línea 72 le llegan %s strings, %s ambiguos con día ≠ mes. Esos son los',
               linea72.str.n, linea72.str.ambiguosDistintos);
    Logger.log('      que dependen de qué copia gane (punto 1).');
  }
}

function _nuevoConteo_diag4() {
  return { vacias: 0, date: 0, dateConHora: 0, num: 0, otro: 0,
           str: { n: 0, ddmm: 0, ambiguos: 0, ambiguosDistintos: 0, otroFormato: 0, ejemplos: [] } };
}

function _contar_diag4(c, v, fila) {
  if (v === '' || v == null) { c.vacias++; return; }
  if (_esDate_diag4(v)) {
    c.date++;
    if (v.getHours() !== 0 || v.getMinutes() !== 0) c.dateConHora++;
    return;
  }
  if (typeof v === 'number') { c.num++; return; }
  if (typeof v !== 'string') { c.otro++; return; }

  c.str.n++;
  const m = /^\s*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s*$/.exec(v);
  if (!m) {
    c.str.otroFormato++;
  } else {
    c.str.ddmm++;
    const d = parseInt(m[1], 10), mo = parseInt(m[2], 10);
    if (d <= 12 && mo <= 12) {
      c.str.ambiguos++;
      if (d !== mo) c.str.ambiguosDistintos++;
    }
  }
  if (c.str.ejemplos.length < DIAG4_EJEMPLOS) c.str.ejemplos.push({ fila: fila, v: v });
}

function _logConteo_diag4(nombre, c, tz) {
  Logger.log('  [%s]', nombre);
  Logger.log('    vacías %s | Date %s (con hora ≠ 00:00: %s) | número %s | otro %s | string %s',
             c.vacias, c.date, c.dateConHora, c.num, c.otro, c.str.n);
  if (!c.str.n) return;
  Logger.log('    de los string: con forma d/m[/a] %s — ambiguos (día y mes ≤ 12) %s, de esos con ' +
             'día ≠ mes %s | otro formato %s', c.str.ddmm, c.str.ambiguos,
             c.str.ambiguosDistintos, c.str.otroFormato);
  c.str.ejemplos.forEach(function (x) {
    Logger.log('      fila %s: %s', x.fila, JSON.stringify(x.v));
  });
}

function _desc_diag4(v, tz) {
  if (v === null) return 'null (typeof object)';
  if (v === undefined) return 'undefined';
  if (_esDate_diag4(v)) {
    return isNaN(v.getTime()) ? 'Invalid Date (typeof object)'
      : Utilities.formatDate(v, tz, 'dd/MM/yyyy HH:mm') + ' (typeof object, Date)';
  }
  return JSON.stringify(v) + ' (typeof ' + typeof v + ')';
}

function _pad_diag4(s, n) {
  s = String(s);
  while (s.length < n) s += ' ';
  return s;
}

/**
 * ¿Es un `Date`? Por la etiqueta interna y no por `instanceof`, que falla si el valor viene de
 * otro contexto de ejecución. En Apps Script `getValues()` y el script comparten contexto, pero
 * el conteo no debería depender de eso.
 */
function _esDate_diag4(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}
