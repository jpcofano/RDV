/**
 * 49_Corridas.js — REGISTRO_CORRIDAS y la GUARDA DE TIEMPO de la corrida de la hora (15/10, decisión del usuario).
 * Configuración: 00_Config.js, "La GUARDA DE TIEMPO y REGISTRO_CORRIDAS".
 *
 * Por qué: el 15/10 la corrida de la hora fallaba ~23% por "Exceeded maximum execution time". No era un error de lógica:
 * cuando Gmail o Sheets están lentos, la suma de las partes pasa de los 6 min de Apps Script y la ejecución muere donde
 * esté (la de las 9:28: agenda 167 s, IDs 120 s, cortada en el cruce a los 361 s).
 *
 * Qué hace:
 *   - la corrida va por PARTES en orden de prioridad (20_UpsertDestino.js, `_correrUpsertPartes_`); antes de empezar una,
 *     `corridaHayTiempo_(parte)` mira el reloj contra GUARDA_INICIO_MAX_MS: si no alcanza, la parte NO empieza (nunca se
 *     corta una escritura a la mitad) y queda para la corrida siguiente, anotada como salteada;
 *   - `corridaAnotar_` guarda la duración y el error COMPLETO de cada parte;
 *   - después de cada parte, la corrida en curso queda en una propiedad del script (PROP_CORRIDA_EN_CURSO: barato, no toca
 *     planillas). Si la ejecución muere por el límite de 6 min (eso no se puede atrapar), la corrida siguiente la encuentra
 *     y la registra como CORTADA, con la parte en la que murió;
 *   - al final (también si falló), una línea en REGISTRO_CORRIDAS (intermedia). Si otra corrida tiene el bloqueo, también
 *     queda una línea: "no arrancó".
 * Nada de esto toca la base. Si el registro mismo falla, la corrida sigue: sólo lo loguea.
 */

/** Las partes, en el orden de las columnas de REGISTRO_CORRIDAS. */
const PARTES_CORRIDA_ = ['guardian', 'agenda', 'cruce', 'asistentes', 'escritura', 'derivadas', 'elecciones', 'reportes',
  'ids', 'looker', 'vistas_agenda', 'guardian_copia', 'registro_upsert'];

/** La corrida en curso (en memoria, dentro de una ejecución). */
var _corrida_ = null;
/**
 * La agenda de la corrida de la hora NO escribe las vistas del archivo "Agenda" ni la copia del archivo RDV: las deja acá,
 * y la corrida las escribe al final, si hay tiempo (prioridad 5). En un paso a mano, la agenda las escribe en el momento.
 */
var _diferirVistasAgenda_ = false;
var _vistasAgendaPendientes_ = null;

function _ahoraMs_() { return new Date().getTime(); }

/** Empieza el registro de una corrida (ya con el bloqueo). Si la anterior quedó sin cerrar, la registra como cortada. */
function corridaIniciar_(t0, enSeco, historial) {
  const inicio = t0 instanceof Date ? t0 : new Date();
  _corrida_ = { id: Utilities.formatDate(inicio, RDV_TZ, 'yyyyMMdd-HHmmss'), t0: inicio.getTime(),
                modo: (enSeco ? 'EN SECO' : 'real') + (historial ? ' (historial)' : ''),
                partes: {}, salteadas: [], errores: [], actual: '' };
  try {
    const props = PropertiesService.getScriptProperties();
    const previa = props.getProperty(PROP_CORRIDA_EN_CURSO);
    if (previa) {
      let p = null;
      try { p = JSON.parse(previa); } catch (e) { p = null; }
      if (p) {
        Logger.log('>>> ### LA CORRIDA ANTERIOR (%s) NO TERMINÓ: se cortó en "%s" (lo más probable, el límite de 6 min). ' +
                   'Queda en %s como CORTADA. ###', p.id, p.actual || '?', RDV_HOJA_CORRIDAS);
        _escribirFilaCorrida_(p, 'CORTADA en "' + (p.actual || '?') + '" (límite de 6 min o caída)', null);
      }
    }
  } catch (err) { Logger.log('>>> REGISTRO_CORRIDAS: no se pudo revisar la corrida anterior: %s', err); }
  _guardarCorridaEnCurso_();
}

/** ¿Hay tiempo para empezar esta parte? Sin límite para la parte, o sin la guarda, siempre. */
function corridaHayTiempo_(parte) {
  if (!GUARDA_TIEMPO_ACTIVA || !_corrida_) return true;
  const lim = GUARDA_INICIO_MAX_MS[parte];
  return lim == null || corridaTranscurridoMs_() < lim;
}

function corridaTranscurridoMs_() { return _corrida_ ? _ahoraMs_() - _corrida_.t0 : 0; }

/** Una parte que no empieza por tiempo: queda para la próxima corrida. */
function corridaSaltear_(parte, que) {
  const s = Math.round(corridaTranscurridoMs_() / 1000);
  Logger.log('>>> GUARDA DE TIEMPO: la corrida ya lleva %s s (límite para empezar "%s": %s s): %s queda para la corrida siguiente.',
             s, parte, Math.round((GUARDA_INICIO_MAX_MS[parte] || 0) / 1000), que || parte);
  if (_corrida_ && _corrida_.salteadas.indexOf(parte) < 0) _corrida_.salteadas.push(parte);
  _guardarCorridaEnCurso_();
}

/** Marca la parte que empieza (para saber dónde murió una corrida cortada). */
function corridaEmpieza_(parte) {
  if (!_corrida_) return;
  _corrida_.actual = parte;
  _guardarCorridaEnCurso_();
}

/** La duración de una parte (desde `desdeMs`) y su error, si lo hubo (el texto completo, con la pila). */
function corridaAnotar_(parte, desdeMs, err) {
  if (!_corrida_) return;
  _corrida_.partes[parte] = (_corrida_.partes[parte] || 0) + (_ahoraMs_() - desdeMs);
  if (err) _corrida_.errores.push(parte + ': ' + _textoError_(err));
  _corrida_.actual = '';
  _guardarCorridaEnCurso_();
}

/** Cierra la corrida: una línea en REGISTRO_CORRIDAS. `err`: el error que cortó la corrida (si lo hubo). */
function corridaCerrar_(err) {
  if (!_corrida_) return;
  const c = _corrida_;
  if (err) c.errores.push('LA CORRIDA: ' + _textoError_(err));
  const estado = err ? 'ERROR' : (c.errores.length ? 'terminó, con errores en partes' : (c.salteadas.length ? 'terminó, con partes salteadas' : 'ok'));
  _escribirFilaCorrida_(c, estado, _ahoraMs_() - c.t0);
  try { PropertiesService.getScriptProperties().deleteProperty(PROP_CORRIDA_EN_CURSO); }
  catch (e) { Logger.log('>>> REGISTRO_CORRIDAS: no se pudo borrar la corrida en curso: %s', e); }
  Logger.log('REGISTRO_CORRIDAS: %s | %s s | %s%s', estado, ((_ahoraMs_() - c.t0) / 1000).toFixed(1),
             PARTES_CORRIDA_.filter(function (p) { return p in c.partes; })
               .map(function (p) { return p + ' ' + (c.partes[p] / 1000).toFixed(1) + ' s'; }).join(' · ') || '—',
             c.salteadas.length ? ' | salteadas por tiempo: ' + c.salteadas.join(', ') : '');
  _corrida_ = null;
}

/** Una corrida que no arrancó porque otra tiene el bloqueo. */
function corridaSinBloqueo_(t0, enSeco) {
  const c = { id: Utilities.formatDate(t0 instanceof Date ? t0 : new Date(), RDV_TZ, 'yyyyMMdd-HHmmss'),
              t0: (t0 instanceof Date ? t0 : new Date()).getTime(), modo: enSeco ? 'EN SECO' : 'real',
              partes: {}, salteadas: [], errores: [] };
  _escribirFilaCorrida_(c, 'no arrancó: otra corrida tenía el bloqueo', _ahoraMs_() - c.t0);
}

function _textoError_(err) {
  const t = err && err.stack ? String(err.stack) : String(err && err.message || err);
  return t.length > 4000 ? t.slice(0, 4000) + '…' : t;
}

function _guardarCorridaEnCurso_() {
  if (!_corrida_) return;
  try {
    PropertiesService.getScriptProperties().setProperty(PROP_CORRIDA_EN_CURSO, JSON.stringify({
      id: _corrida_.id, t0: _corrida_.t0, modo: _corrida_.modo, partes: _corrida_.partes, salteadas: _corrida_.salteadas,
      errores: _corrida_.errores.map(function (e) { return e.slice(0, 600); }), actual: _corrida_.actual }));
  } catch (e) { /* el registro nunca corta la corrida */ }
}

/** El encabezado de REGISTRO_CORRIDAS. */
function encabezadoCorridas_() {
  return ['inicio', 'id', 'modo', 'estado', 'total_s'].concat(PARTES_CORRIDA_.map(function (p) { return p + '_s'; }))
    .concat(['salteadas_por_tiempo', 'errores']);
}

function _escribirFilaCorrida_(c, estado, totalMs) {
  try {
    const ss = ssIntermedia_();
    let sh = ss.getSheetByName(RDV_HOJA_CORRIDAS);
    const enc = encabezadoCorridas_();
    if (!sh) { sh = ss.insertSheet(RDV_HOJA_CORRIDAS); sh.appendRow(enc); }
    const fila = [new Date(c.t0), c.id, c.modo, estado, totalMs == null ? '' : Math.round(totalMs / 100) / 10]
      .concat(PARTES_CORRIDA_.map(function (p) {
        if (p in c.partes) return Math.round(c.partes[p] / 100) / 10;
        return c.salteadas.indexOf(p) >= 0 ? 'salteada' : '';
      }))
      .concat([c.salteadas.join(', '), c.errores.join('\n\n').slice(0, 45000)]);
    sh.appendRow(fila);
    SpreadsheetApp.flush();
  } catch (err) { Logger.log('>>> REGISTRO_CORRIDAS: no se pudo escribir la línea de la corrida: %s', err); }
}

/**
 * Las vistas del archivo "Agenda" y la copia del archivo RDV que la agenda dejó para el final (prioridad 5). Cada una en su
 * try (escribirVistasAgenda_ ya aísla las suyas), y un flush adentro: un error no queda para el flush implícito del final.
 */
function escribirVistasAgendaDiferidas_() {
  const p = _vistasAgendaPendientes_;
  _vistasAgendaPendientes_ = null;
  if (!p) return null;
  if (AGENDA_VISTAS_NUEVAS) escribirVistasAgenda_(SpreadsheetApp.openById(AGENDA_COPIA_SS), p.abierta, p.P);
  if (AGENDA_COPIA_EN_RDV) {
    try { escribirAgendaEnRdv_(p.abierta); }
    catch (err) { Logger.log('>>> la solapa "%s" del archivo RDV NO se escribió: %s', AGENDA_RDV_SOLAPA, err); throw err; }
  }
  SpreadsheetApp.flush();
  return true;
}

// ===================== El paso 67: cuánto tarda cada parte (sólo lectura) =====================

/**
 * **Paso 67 — SÓLO LECTURA**: lee REGISTRO_CORRIDAS (las últimas `n` corridas) y dice, por parte, cuántas veces corrió, la
 * mediana y el máximo, cuántas veces se salteó por tiempo, y cuántas corridas terminaron, fallaron o se cortaron. Es la
 * medición para decidir las aceleraciones (los IDs, las vistas, Looker): cuánto ahorra cada una.
 */
function tiemposDeCorridas(n) {
  n = n || 48;
  const sh = ssIntermedia_().getSheetByName(RDV_HOJA_CORRIDAS);
  if (!sh || sh.getLastRow() < 2) { Logger.log('Todavía no hay corridas en %s.', RDV_HOJA_CORRIDAS); return null; }
  const datos = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const enc = datos[0].map(String), filas = datos.slice(1).slice(-n);
  const col = function (k) { return enc.indexOf(k); };
  const estados = {};
  filas.forEach(function (r) { const e = String(r[col('estado')]).split(':')[0].split(' en ')[0]; estados[e] = (estados[e] || 0) + 1; });
  Logger.log('=== paso 67 — cuánto tarda cada parte (las últimas %s corridas de %s) ===', filas.length, RDV_HOJA_CORRIDAS);
  Logger.log('  estados: %s', Object.keys(estados).map(function (k) { return k + ' ' + estados[k]; }).join(' | '));
  const med = function (xs) { const s = xs.slice().sort(function (a, b) { return a - b; }); const m = Math.floor(s.length / 2);
    return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
  const out = {};
  ['total'].concat(PARTES_CORRIDA_).forEach(function (p) {
    const k = col(p + '_s');
    if (k < 0) return;
    const xs = filas.map(function (r) { return r[k]; }).filter(function (v) { return typeof v === 'number'; });
    const salt = filas.filter(function (r) { return r[k] === 'salteada'; }).length;
    out[p] = { veces: xs.length, mediana: med(xs), max: xs.length ? Math.max.apply(null, xs) : null, salteada: salt };
    Logger.log('  %s corrió %s veces · mediana %s s · máximo %s s%s', (p + '                ').slice(0, 16), xs.length,
               out[p].mediana == null ? '—' : out[p].mediana.toFixed(1), out[p].max == null ? '—' : out[p].max.toFixed(1),
               salt ? ' · salteada por tiempo ' + salt + ' veces' : '');
  });
  return out;
}
