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

/**
 * 16/10: la parte "agenda", por dentro (40_Agenda.js, correrAgendaEnBloqueo_, marca cada tramo con agendaTiempo_): leer la base,
 * Gmail (la búsqueda y getPlainBody, sin el HTML), el HTML de los colores (getBody), el parser, el plan (con la geocodificación
 * adentro: "geo" es lo que tardaron las llamadas a Maps, y geo_n cuántas fueron), la escritura en la base (y sus derivadas),
 * las solapas informativas / AGENDA_DUPLICADOS / elecciones / avisos, la copia en el archivo "Agenda" y REGISTRO_AGENDA.
 */
const SUBTIEMPOS_AGENDA_ = ['base', 'gmail', 'html', 'parse', 'plan', 'geo', 'escritura', 'solapas', 'copia', 'registro'];
var _tiemposAgenda_ = null;

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
                partes: {}, salteadas: [], errores: [], actual: '', agenda: null, sinCambios: [], noTocaba: {} };
  let cortada = null;   // la corrida anterior que no terminó (para los avisos, 50_Avisos.js)
  try {
    const props = PropertiesService.getScriptProperties();
    const previa = props.getProperty(PROP_CORRIDA_EN_CURSO);
    if (previa) {
      let p = null;
      try { p = JSON.parse(previa); } catch (e) { p = null; }
      if (p) {
        cortada = p;
        Logger.log('>>> ### LA CORRIDA ANTERIOR (%s) NO TERMINÓ: se cortó en "%s" (lo más probable, el límite de 6 min). ' +
                   'Queda en %s como CORTADA. ###', p.id, p.actual || '?', RDV_HOJA_CORRIDAS);
        _escribirFilaCorrida_(p, 'CORTADA en "' + (p.actual || '?') + '" (límite de 6 min o caída)', null);
      }
    }
  } catch (err) { Logger.log('>>> REGISTRO_CORRIDAS: no se pudo revisar la corrida anterior: %s', err); }
  _guardarCorridaEnCurso_();
  // 15/10 (H6): los avisos por mail (50_Avisos.js; apagados con AVISOS_MAIL_ACTIVO). Un mail que falla no corta la corrida.
  try { if (typeof avisosAlIniciarCorrida_ === 'function') avisosAlIniciarCorrida_(cortada); }
  catch (err) { Logger.log('>>> AVISOS: %s (la corrida sigue)', err); }
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

/** 16/10: una parte que no tocaba en esta corrida (los IDs cada IDS_CADA_HORAS horas): no es "salteada por tiempo". */
function corridaNoTocaba_(parte, porque) {
  Logger.log('>>> %s: no toca en esta corrida (%s).', parte, porque || '');
  if (_corrida_) { _corrida_.noTocaba[parte] = String(porque || ''); _guardarCorridaEnCurso_(); }
}

/** 16/10: una solapa que no se reescribió porque su contenido no cambió (49_Aceleraciones.js). */
function corridaSinCambios_(nombre) {
  if (_corrida_ && _corrida_.sinCambios.indexOf(nombre) < 0) _corrida_.sinCambios.push(nombre);
}

/** 16/10: los tiempos de la agenda por dentro (SUBTIEMPOS_AGENDA_). Lo llama correrAgendaEnBloqueo_ al empezar. */
function agendaTiemposIniciar_() { _tiemposAgenda_ = { ms: {}, geoN: 0, ultima: _ahoraMs_() }; }

/**
 * Cierra el tramo `k` de la agenda (desde el tramo anterior), menos `menosMs` (lo que ya se anotó aparte: el HTML dentro de
 * Gmail). Queda en la corrida en curso (y en su propiedad): si la ejecución muere en la agenda, la línea CORTADA dice hasta
 * dónde llegó ("agenda (después de plan)") y cuánto tardó cada tramo.
 */
function agendaTiempo_(k, menosMs) {
  const T = _tiemposAgenda_;
  if (!T) return;
  const ahora = _ahoraMs_();
  T.ms[k] = (T.ms[k] || 0) + Math.max(0, ahora - T.ultima - (menosMs || 0));
  T.ultima = ahora;
  if (_corrida_) {
    _corrida_.agenda = { ms: T.ms, geoN: T.geoN };
    if (_corrida_.actual === 'agenda' || /^agenda \(/.test(_corrida_.actual)) _corrida_.actual = 'agenda (después de ' + k + ')';
    _guardarCorridaEnCurso_();
  }
}

/** Suma a un tramo lo medido adentro (el HTML, la geocodificación); `n`: cuántas llamadas (geo). */
function agendaTiempoSumar_(k, ms, n) {
  const T = _tiemposAgenda_;
  if (!T) return;
  T.ms[k] = (T.ms[k] || 0) + (ms || 0);
  if (k === 'geo') T.geoN += (n == null ? 1 : n);
}

/** Los tramos de la agenda, para el log: "base 3.1 s · gmail 40.2 s · …". */
function agendaTiemposTexto_() {
  const T = _tiemposAgenda_;
  if (!T) return '';
  return SUBTIEMPOS_AGENDA_.concat(['cache']).filter(function (k) { return k in T.ms; })
    .map(function (k) { return k + ' ' + (T.ms[k] / 1000).toFixed(1) + ' s' + (k === 'geo' ? ' (' + T.geoN + ' llamadas, dentro de plan)' : ''); })
    .join(' · ');
}

/**
 * 16/10 (tarde, punto 5b): lo que hizo la geocodificación de la agenda (40_Agenda.js, `_logGeoAgenda_`): queda en la corrida en curso
 * y en REGISTRO_CORRIDAS (agenda_geo_detalle): "cache 41 · fallos 3 · saltadas 12 · pendientes 0 · tiempo 0 · reintentos 1 · sin crear 0".
 */
function agendaGeoAnotar_(G, sinCrear) {
  if (!_corrida_ || !G) return;
  _corrida_.agendaGeo = { cache: G.cache, fallos: G.fallosCache, sinDireccion: G.sinDireccion, resueltas: G.resueltas,
                          pendientes: G.pendientesTope, tiempo: G.pendientesTiempo, reintentos: G.reintentos, sinCrear: sinCrear || 0,
                          guarda: G.soloDias != null, llamadas: G.llamadas };
  _guardarCorridaEnCurso_();
}

/** 16/10: lo que salió de la cache de los mails (41_AgendaCache.js) en esta corrida: hilos, mensajes, colores y textos parseados. */
function agendaMailsAnotar_(gmail, parse, cache, html) {
  if (!_corrida_) return;
  _corrida_.agendaMails = { hilosCache: gmail ? gmail.hilosCache : null, hilosBajados: gmail ? gmail.hilosBajados : null,
                            mensajesCache: gmail ? gmail.mensajesCache : null, mensajesBajados: gmail ? gmail.mensajesBajados : null,
                            htmlCache: html ? html.deCache || 0 : null, htmlLeidos: html ? html.leidos : null,
                            parseCache: parse ? parse.deCache : null, parseados: parse ? parse.parseados : null,
                            errores: cache && cache.errores && cache.errores.length ? cache.errores.join(' | ').slice(0, 300) : '' };
  _guardarCorridaEnCurso_();
}

/** El texto de REGISTRO_CORRIDAS de lo de arriba (columnas agenda_geo_detalle y agenda_mails_cache). */
function _textoGeoCorrida_(g) {
  if (!g) return '';
  return 'cache ' + g.cache + ' · fallos ' + g.fallos + ' · sin dirección ' + g.sinDireccion + ' · ya resueltas ' + g.resueltas +
         ' · pendientes ' + g.pendientes + ' · guarda ' + g.tiempo + ' · reintentos ' + g.reintentos + ' · sin crear ' + g.sinCrear +
         (g.guarda ? ' · GUARDA DE TIEMPO' : '');
}
function _textoMailsCorrida_(m) {
  if (!m) return '';
  const p = function (a, b) { return a == null ? '—' : a + '/' + ((a || 0) + (b || 0)); };
  return 'hilos ' + p(m.hilosCache, m.hilosBajados) + ' · mensajes ' + p(m.mensajesCache, m.mensajesBajados) +
         ' · colores ' + p(m.htmlCache, m.htmlLeidos) + ' · parse ' + p(m.parseCache, m.parseados) + (m.errores ? ' · ' + m.errores : '');
}

/**
 * 16/10 (BASE_UNA_LECTURA_POR_CORRIDA, 49_Aceleraciones.js): cada lectura ENTERA de la base en la corrida (y cuánto tardó), y cada
 * vez que una parte reusó la de otra. Para el paso 67 (base_lecturas, base_reusos, base_lecturas_s).
 */
function corridaLecturaBase_(que, ms, reuso) {
  if (!_corrida_) return;
  const b = _corrida_.base = _corrida_.base || { lecturas: 0, reusos: 0, ms: 0, detalle: [] };
  if (reuso) b.reusos++; else { b.lecturas++; b.ms += ms || 0; }
  if (b.detalle.length < 12) b.detalle.push(que + (reuso ? ' (reusada)' : ' ' + ((ms || 0) / 1000).toFixed(1) + ' s'));
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
  // 15/10 (H6): la racha de corridas malas / partes salteadas y los avisos de esta corrida (50_Avisos.js; apagados).
  try { if (typeof avisosAlCerrarCorrida_ === 'function') avisosAlCerrarCorrida_(c, estado); }
  catch (e) { Logger.log('>>> AVISOS: %s', e); }
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
      errores: _corrida_.errores.map(function (e) { return e.slice(0, 600); }), actual: _corrida_.actual,
      agenda: _corrida_.agenda, sinCambios: _corrida_.sinCambios, noTocaba: _corrida_.noTocaba,
      agendaGeo: _corrida_.agendaGeo || null, agendaMails: _corrida_.agendaMails || null, base: _corrida_.base || null,
      orden: _corrida_.orden || '' }));
  } catch (e) { /* el registro nunca corta la corrida */ }
}

/**
 * El encabezado de REGISTRO_CORRIDAS. 16/10: las columnas nuevas (los tramos de la agenda, sin_cambios, no_tocaba) van AL FINAL:
 * las filas viejas no las tienen y se siguen leyendo igual (el paso 67 busca cada columna por su encabezado).
 */
function encabezadoCorridas_() {
  return ['inicio', 'id', 'modo', 'estado', 'total_s'].concat(PARTES_CORRIDA_.map(function (p) { return p + '_s'; }))
    .concat(['salteadas_por_tiempo', 'errores'])
    .concat(SUBTIEMPOS_AGENDA_.map(function (k) { return 'agenda_' + k + '_s'; }))
    .concat(['agenda_geo_n', 'sin_cambios', 'no_tocaba'])
    // 16/10 (tarde, punto 5b): también AL FINAL (las filas de antes no las tienen)
    .concat(COLUMNAS_CORRIDA_5B_);
}
/** 16/10 (tarde): la escritura de la cache de los mails, la geocodificación y los mails por dentro, y las lecturas de la base. */
const COLUMNAS_CORRIDA_5B_ = ['agenda_cache_s', 'agenda_geo_detalle', 'agenda_mails_cache', 'base_lecturas', 'base_reusos', 'base_lecturas_s', 'base_detalle',
  'orden'];

/** 16/10 (noche): el orden de las partes de esta corrida (CRUCE_PRIMERO_TRAS_SALTEOS): "agenda, cruce" o "cruce antes de la agenda (…)". */
function corridaOrden_(texto) {
  if (!_corrida_) return;
  _corrida_.orden = String(texto || '');
  _guardarCorridaEnCurso_();
}

function _escribirFilaCorrida_(c, estado, totalMs) {
  try {
    const ss = ssIntermedia_();
    let sh = ss.getSheetByName(RDV_HOJA_CORRIDAS);
    const enc = encabezadoCorridas_();
    if (!sh) { sh = ss.insertSheet(RDV_HOJA_CORRIDAS); sh.appendRow(enc); }
    else if (sh.getLastRow() === 0 || String(sh.getRange(1, 1, 1, 1).getValues()[0][0]) !== enc[0]) {
      // 16/10: la solapa existía sin el encabezado (vacía, o creada por otro camino): las corridas se anotaban sin él y el paso 67
      // leía "estados: undefined". Se pone el encabezado en la fila 1 (es la intermedia, no la base).
      if (sh.getLastRow() > 0) sh.insertRowBefore(1);
      sh.getRange(1, 1, 1, enc.length).setValues([enc]);
    } else if (sh.getLastColumn() < enc.length ||
               sh.getRange(1, 1, 1, enc.length).getValues()[0].map(String).join('|') !== enc.join('|')) {
      // 16/10: el encabezado viejo (sin las columnas nuevas, que van al final): se completa; las filas no se tocan
      sh.getRange(1, 1, 1, enc.length).setValues([enc]);
    }
    const fila = [new Date(c.t0), c.id, c.modo, estado, totalMs == null ? '' : Math.round(totalMs / 100) / 10]
      .concat(PARTES_CORRIDA_.map(function (p) {
        if (p in c.partes) return Math.round(c.partes[p] / 100) / 10;
        if (c.noTocaba && p in c.noTocaba) return 'no tocaba';
        return c.salteadas.indexOf(p) >= 0 ? 'salteada' : '';
      }))
      .concat([c.salteadas.join(', '), c.errores.join('\n\n').slice(0, 45000)])
      .concat(SUBTIEMPOS_AGENDA_.map(function (k) {
        return c.agenda && c.agenda.ms && k in c.agenda.ms ? Math.round(c.agenda.ms[k] / 100) / 10 : '';
      }))
      .concat([c.agenda ? c.agenda.geoN || 0 : '', (c.sinCambios || []).join(', '),
               Object.keys(c.noTocaba || {}).map(function (p) { return p + ': ' + c.noTocaba[p]; }).join(' | ')])
      .concat([c.agenda && c.agenda.ms && 'cache' in c.agenda.ms ? Math.round(c.agenda.ms.cache / 100) / 10 : '',
               _textoGeoCorrida_(c.agendaGeo), _textoMailsCorrida_(c.agendaMails),
               c.base ? c.base.lecturas : '', c.base ? c.base.reusos : '', c.base ? Math.round(c.base.ms / 100) / 10 : '',
               c.base ? c.base.detalle.join(' · ') : '', c.orden || '']);
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
  // 16/10 (revisor): con la guarda de tiempo de la agenda, también la copia del archivo "Agenda" y AGENDA_DUPLICADOS quedaron para
  // acá (después del cruce). escribirCopiaAgenda_ escribe la copia y, como ya no se difiere, las vistas y la del archivo RDV.
  if (p.copiaCompleta) {
    _diferirVistasAgenda_ = false;
    let errC = null;
    try { escribirCopiaAgenda_(p.copiaCompleta, p.P); } catch (err) { errC = err; Logger.log('>>> la copia en el archivo "Agenda" NO se escribió: %s', err); }
    if (p.duplicados) {
      try { escribirDuplicadosAgenda_(p.P); } catch (err) { Logger.log('>>> %s NO se escribió: %s', AGENDA_SOLAPA_DUPLICADOS, err); errC = errC || err; }
    }
    SpreadsheetApp.flush();
    if (errC) throw errC;
    return true;
  }
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
  // 16/10: el encabezado puede no estar en la fila 1 (la solapa existía sin él): se lo busca; si no está, el orden fijo de las
  // columnas (_escribirFilaCorrida_ escribe siempre en ese orden). Una fila que repite el encabezado no es una corrida.
  const esEnc = function (r) { return r.map(String).indexOf('estado') >= 0 && r.map(String).indexOf('inicio') >= 0; };
  const iEnc = datos.findIndex(esEnc);
  const enc = iEnc >= 0 ? datos[iEnc].map(String) : encabezadoCorridas_();
  if (iEnc < 0) Logger.log('  (%s no tiene encabezado: se leen las columnas por su orden fijo)', RDV_HOJA_CORRIDAS);
  const filas = datos.slice(iEnc >= 0 ? iEnc + 1 : 0).filter(function (r) { return !esEnc(r) && r.some(function (v) { return v !== '' && v != null; }); }).slice(-n);
  const col = function (k) { return enc.indexOf(k); };
  const estados = {};
  filas.forEach(function (r) {
    const e = (String(r[col('estado')] == null ? '' : r[col('estado')]).split(':')[0].split(' en ')[0].trim()) || '(sin estado)';
    estados[e] = (estados[e] || 0) + 1;
  });
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
    const noToc = filas.filter(function (r) { return r[k] === 'no tocaba'; }).length;
    out[p] = { veces: xs.length, mediana: med(xs), max: xs.length ? Math.max.apply(null, xs) : null, salteada: salt, noTocaba: noToc };
    Logger.log('  %s corrió %s veces · mediana %s s · máximo %s s%s%s', (p + '                ').slice(0, 16), xs.length,
               out[p].mediana == null ? '—' : out[p].mediana.toFixed(1), out[p].max == null ? '—' : out[p].max.toFixed(1),
               salt ? ' · salteada por tiempo ' + salt + ' veces' : '', noToc ? ' · no tocaba (cada ' + IDS_CADA_HORAS + ' h) ' + noToc + ' veces' : '');
  });
  out.estados = estados;   // 15/10: para el resumen del lunes (50_Avisos.js)
  const num = function (v) { return typeof v === 'number' ? v : null; };
  const seg = function (v) { return v == null ? '—' : v.toFixed(1) + ' s'; };
  const tramosDe = function (r) {   // los tramos de la agenda de una corrida (16/10; las filas viejas no los tienen)
    return SUBTIEMPOS_AGENDA_.map(function (s) { const j = col('agenda_' + s + '_s'); return { k: s, v: j < 0 ? null : num(r[j]) }; })
      .filter(function (x) { return x.v != null; });
  };
  const textoTramos = function (r) {
    const t = tramosDe(r), jn = col('agenda_geo_n');
    // 16/10 (tarde): la escritura de la cache, y qué hizo la geocodificación y la cache de los mails (las corridas de antes no lo tienen)
    const extra = function (k, rot) { const j = col(k); return j >= 0 && r[j] !== '' && r[j] != null ? ' | ' + rot + ': ' + (typeof r[j] === 'number' ? seg(r[j]) : r[j]) : ''; };
    return t.length ? t.map(function (x) { return x.k + ' ' + seg(x.v) + (x.k === 'geo' && jn >= 0 && r[jn] !== '' ? ' (' + r[jn] + ' llamadas)' : ''); }).join(' · ') +
                      extra('agenda_cache_s', 'cache') + extra('agenda_geo_detalle', 'geocodificación') + extra('agenda_mails_cache', 'mails') +
                      extra('base_detalle', 'lecturas de la base')
                    : '(sin los tramos: corrida de antes del 16/10)';
  };
  const partesDe = function (r) {
    return PARTES_CORRIDA_.map(function (p) { const j = col(p + '_s'); return j < 0 ? null : { p: p, v: r[j] }; })
      .filter(function (x) { return x && x.v !== '' && x.v != null; })
      .map(function (x) { return x.p + ' ' + (typeof x.v === 'number' ? x.v.toFixed(1) + ' s' : x.v); }).join(' · ');
  };
  // 16/10: los tramos de la agenda (mediana y máximo), sólo de las corridas que los tienen
  const conTramos = filas.filter(function (r) { return tramosDe(r).length; });
  out.agendaTramos = {};
  if (conTramos.length) {
    Logger.log('  --- la agenda por dentro (%s corridas con los tramos; "geo" está DENTRO de "plan") ---', conTramos.length);
    SUBTIEMPOS_AGENDA_.forEach(function (s) {
      const j = col('agenda_' + s + '_s');
      const xs = conTramos.map(function (r) { return num(r[j]); }).filter(function (v) { return v != null; });
      if (!xs.length) return;
      out.agendaTramos[s] = { mediana: med(xs), max: Math.max.apply(null, xs) };
      Logger.log('    agenda/%s mediana %s · máximo %s', (s + '          ').slice(0, 10), seg(med(xs)), seg(Math.max.apply(null, xs)));
    });
  } else Logger.log('  (la agenda por dentro: todavía ninguna corrida con los tramos; aparecen desde la próxima)');
  // 16/10 (tarde, punto 5b): la cache de los mails, la geocodificación y las lecturas de la base, de las corridas que lo tienen
  const iGn = col('agenda_geo_n'), iCa = col('agenda_cache_s'), iBl = col('base_lecturas'), iBr = col('base_reusos'), iBs = col('base_lecturas_s');
  const iGd = col('agenda_geo_detalle'), iMc = col('agenda_mails_cache');
  const con5b = filas.filter(function (r) { return iBl >= 0 && num(r[iBl]) != null; });
  out.punto5b = null;
  if (con5b.length) {
    const serie = function (j) { return con5b.map(function (r) { return j < 0 ? null : num(r[j]); }).filter(function (v) { return v != null; }); };
    const mm = function (xs) { return xs.length ? med(xs) + ' (máx ' + Math.max.apply(null, xs) + ')' : '—'; };
    out.punto5b = { corridas: con5b.length, geoLlamadas: serie(iGn), cacheS: serie(iCa), lecturas: serie(iBl), reusos: serie(iBr), lecturasS: serie(iBs) };
    Logger.log('  --- punto 5b (%s corridas desde el cambio): llamadas a Maps por corrida %s | escribir la cache de los mails %s s | ' +
               'lecturas enteras de la base %s, reusos %s, tiempo de leerla %s s ---', con5b.length, mm(out.punto5b.geoLlamadas),
               mm(out.punto5b.cacheS), mm(out.punto5b.lecturas), mm(out.punto5b.reusos), mm(out.punto5b.lecturasS));
    const ult = con5b[con5b.length - 1];
    if (iGd >= 0) Logger.log('    la última: geocodificación %s', ult[iGd] || '—');
    if (iMc >= 0) Logger.log('    la última: cache de los mails (de la cache / total) %s', ult[iMc] || '—');
    const iOr = col('orden');
    if (iOr >= 0) {
      out.punto5b.cruceAntes = con5b.filter(function (r) { return /^cruce antes/.test(String(r[iOr])); }).length;
      Logger.log('    corridas con el cruce ANTES de la agenda (porque la anterior lo salteó): %s de %s', out.punto5b.cruceAntes, con5b.length);
    }
  } else Logger.log('  (punto 5b: todavía ninguna corrida con la geocodificación, la cache de los mails y las lecturas de la base; aparecen desde la próxima)');
  // 16/10: las CORTADAS, una por una: en qué parte murió (lo dice el estado) y cuánto tardó lo que alcanzó a terminar
  const iEst = col('estado'), iId = col('id'), iTot = col('total_s'), iAg = col('agenda_s');
  out.cortadas = filas.filter(function (r) { return /^CORTADA/.test(String(r[iEst])); }).map(function (r) {
    const m = /CORTADA en "([^"]*)"/.exec(String(r[iEst]));
    const parciales = PARTES_CORRIDA_.map(function (p) { return num(r[col(p + '_s')]); }).filter(function (v) { return v != null; });
    return { id: String(r[iId]), parte: m ? m[1] : '?', estado: String(r[iEst]),
             terminadas_s: parciales.reduce(function (a, b) { return a + b; }, 0), partes: partesDe(r), tramos: tramosDe(r) };
  });
  Logger.log('  --- CORTADAS: %s ---', out.cortadas.length || 'ninguna');
  out.cortadas.forEach(function (c, i) {
    const r = filas.filter(function (x) { return String(x[iId]) === c.id && /^CORTADA/.test(String(x[iEst])); })[0];
    Logger.log('    %s. %s — murió en "%s". Lo que terminó antes: %s (suma %s). Agenda por dentro: %s', i + 1, c.id, c.parte,
               c.partes || 'nada', seg(c.terminadas_s), textoTramos(r));
  });
  // 16/10: las corridas con la agenda de más de 150 s, con sus tramos
  out.agendaLentas = iAg < 0 ? [] : filas.filter(function (r) { return num(r[iAg]) != null && r[iAg] > 150; }).map(function (r) {
    return { id: String(r[iId]), agenda_s: r[iAg], total_s: num(r[iTot]), tramos: tramosDe(r) };
  });
  Logger.log('  --- corridas con la AGENDA de más de 150 s: %s ---', out.agendaLentas.length || 'ninguna');
  out.agendaLentas.forEach(function (a) {
    const r = filas.filter(function (x) { return String(x[iId]) === a.id; })[0];
    Logger.log('    %s — agenda %s (total %s; %s). Por dentro: %s', a.id, seg(a.agenda_s), seg(a.total_s),
               String(r[iEst]), textoTramos(r));
  });
  // 16/10: las aceleraciones: qué no se reescribió por no tener cambios
  const iSc = col('sin_cambios');
  if (iSc >= 0) {
    const sc = {};
    filas.forEach(function (r) { String(r[iSc] || '').split(', ').filter(Boolean).forEach(function (n) { sc[n] = (sc[n] || 0) + 1; }); });
    out.sinCambios = sc;
    Logger.log('  --- sin cambios (no se reescribieron): %s ---',
               Object.keys(sc).map(function (n) { return n + ' ' + sc[n]; }).join(' | ') || 'ninguna todavía');
  }
  return out;
}
