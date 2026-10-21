/**
 * 50_Avisos.js — la AUDITORÍA SEMANAL de la agenda y los AVISOS POR MAIL al dueño del código (15/10, H5 y H6).
 * Configuración: 00_Config.js, "La AUDITORÍA SEMANAL y los AVISOS POR MAIL". TODO APAGADO (AUDITORIA_SEMANAL_ACTIVA,
 * AVISOS_MAIL_ACTIVO). Nada se instala solo: el activador semanal lo crea un paso a mano (`instalarAuditoriaSemanal_`).
 *
 * --- H5: la auditoría semanal ---
 * `auditoriaSemanalAgenda()` (la llama el activador, los lunes a las 8) corre la auditoría de la agenda (paso 66,
 * diagnostico/29_auditoria_agenda.js, SÓLO LECTURA) y escribe el resultado en la solapa AUDITORIA_AGENDA de la INTERMEDIA
 * (se reescribe cada lunes): arriba una línea ROJA si algo no está OK (verde si está todo bien), después el encabezado
 * (fila 2: "sección | texto"), el resumen, lo que no está OK y el log completo de la auditoría.
 * El resumen sale del OBJETO que devuelve la auditoría (`cuentas`, `noOk`, `errores`, `extra.copias`); el detalle, de su log:
 * la auditoría sólo loguea, así que se toma el log de esta ejecución antes y después (`Logger.getLog()`, que devuelve todo
 * lo logueado en la ejecución) y se queda con lo del medio. No se reemplaza `Logger.log` (es un servicio de Apps Script). Si
 * `getLog` no anduviera, la solapa queda sólo con el resumen y lo dice.
 * `auditoriaSemanalAgenda_enSeco()`: lo mismo, sin escribir la solapa ni mandar el mail (lo muestra en el log).
 *
 * --- H6: los mails ---
 * - el lunes, después de la auditoría: el RESUMEN SEMANAL (la auditoría de la agenda, las cancelaciones que la base no
 *   refleja —paso 68, si alcanza el tiempo—, las reuniones por definir —AGENDA_PENDIENTES—, las ambiguas, AGENDA_DUPLICADOS
 *   pendientes, las suspendidas de la semana y los tiempos de la corrida de la hora —REGISTRO_CORRIDAS, `tiemposDeCorridas`—);
 * - AVISOS INMEDIATOS, como mucho UNO por tema por día (el último día mandado, por tema, en una propiedad del script):
 *     'corridas_con_error'      dos corridas seguidas cortadas o con error (AVISOS_CORRIDAS_MALAS_SEGUIDAS);
 *     'parte_salteada'          una parte salteada por tiempo tres corridas seguidas (AVISOS_PARTE_SALTEADA_SEGUIDAS);
 *     'invariante_agenda'       "una reunión, una fila" roto (hasta el 16/10; desde entonces va por 'agenda_info', abajo);
 *     'mail_raro'               un mail de agenda raro (lo registra la agenda);
 *     'cancelacion_no_aplicada' una salvaguarda frenó una cancelación (lo registra la agenda);
 *     'suspendida_con_datos'    una fila que suspendió el sistema recibió después asistentes o inscriptos: no se pisó nada
 *                               (lo registra la agenda, una vez por fila; 15/10, noche);
 *     'guardian_desalineacion'  la base está desalineada: la corrida no escribió nada (lo registra el guardián; 20/10, prompt 10);
 *     'guardian_cambios'        alguien cambió columnas del sistema (el guardián avisa o restaura; 20/10, prompt 10);
 * - 'suspendidas' (lo registra la agenda, una línea por reunión suspendida): NO va de a una. Se anota en la solapa
 *   AVISOS_SUSPENDIDAS (intermedia) y sale en UN mail por día, "reuniones suspendidas hoy", en la primera corrida desde las
 *   AVISOS_SUSPENDIDAS_HORA; el lunes, además, en el resumen semanal.
 * - 'agenda_info' (16/10; lo registra la agenda UNA vez por cosa nueva de AGENDA_PENDIENTES: una semana frenada por "una reunión en
 *   dos filas", una reunión juntada sola o por decisión del equipo, una fila que sobra, una pendiente de definir): igual que las
 *   suspendidas, en AVISOS_AGENDA_INFO y UN mail por día desde las AVISOS_AGENDA_INFO_HORA (`_avDigests_`). Reemplaza al aviso
 *   'invariante_agenda' de cada corrida.
 *
 * `registrarAviso_(tema, texto)` NUNCA tira y es barato: con el mail apagado sólo loguea. Prendido, DENTRO de la corrida de
 * la hora no manda nada en el momento: lo pone en una cola (memoria + una propiedad, por si la ejecución muere por los 6 min)
 * y la corrida la manda al cerrar (`avisosAlCerrarCorrida_`, desde corridaCerrar_ en 49_Corridas.js); si la corrida se cortó,
 * la manda la siguiente al empezar (`avisosAlIniciarCorrida_`). Así los avisos de una misma corrida van juntos, uno por
 * tema, y un envío lento no frena la corrida en el medio. FUERA de la corrida (un paso a mano) manda en el momento.
 * Un mail que falla sólo se loguea: nunca corta la corrida.
 *
 * --- El permiso (15/10: GmailApp, no MailApp) ---
 * Se manda con GmailApp.sendEmail, desde la cuenta que corre el script. El proyecto ya tiene el permiso completo de Gmail
 * (la agenda lee los mails con GmailApp), así que NO suma ningún permiso nuevo y no hace falta reautorizar: el activador de
 * la hora no corre el riesgo de fallar por "se requiere autorización". (El servicio de mail aparte de Apps Script habría sumado el permiso
 * script.send_mail: como appsscript.json no declara oauthScopes, Apps Script los deduce del código, y el activador quedaba
 * sin autorización hasta que el dueño aceptara.) No usar ese servicio en ningún archivo del proyecto.
 */

/** 20/10 (prompt 09, 6c): ¿la agenda marca "Reprogramada" (AGENDA_REPROGRAMADA)? Los textos de las suspendidas lo dicen. */
function _avReprogramada_() { return typeof AGENDA_REPROGRAMADA !== 'undefined' && !!AGENDA_REPROGRAMADA; }

/** Los títulos de cada tema (el asunto del mail). */
const AVISOS_TITULOS_ = {
  corridas_con_error: 'corridas seguidas cortadas o con error',
  parte_salteada: 'una parte de la corrida de la hora se saltea por tiempo',
  invariante_agenda: 'la agenda rompió "una reunión, una fila"',
  mail_raro: 'llegó un mail de agenda raro',
  cancelacion_no_aplicada: 'una cancelación de la agenda NO se aplicó (la frenó una salvaguarda)',
  suspendidas: 'reuniones suspendidas hoy',
  suspendida_con_datos: 'una reunión que el sistema suspendió o dejó "Reprogramada" recibió asistentes o inscriptos (no se pisó nada)',
  agenda_info: 'lo nuevo de la agenda que el equipo tiene que saber',
  // 20/10 (prompt 10): el guardián (46_Guardian.js), sólo con GUARDIAN_ACTIVO
  guardian_desalineacion: 'la base está DESALINEADA (alguien ordenó o pegó sólo algunas columnas): la corrida no escribió nada',
  guardian_cambios: 'alguien cambió columnas del sistema de la base (el guardián avisa)',
  resumen_semanal: 'resumen semanal'
};
/**
 * Los temas que NO van de a uno (16/10): se anotan en una solapa de la intermedia y salen en UN mail por día, desde una hora, con
 * todo lo que todavía no se mandó. 'suspendidas' (las que suspendió la agenda) y 'agenda_info' (lo nuevo de AGENDA_PENDIENTES: una
 * semana frenada, una reunión juntada, una fila que sobra…; la agenda ya lo manda una sola vez por cosa).
 */
function _avDigests_() {
  return {
    suspendidas: { hoja: AVISOS_HOJA_SUSPENDIDAS, hora: AVISOS_SUSPENDIDAS_HORA,
                   // 20/10 (prompt 09, 6c): con AGENDA_REPROGRAMADA, también las que quedaron "Reprogramada" (con la fecha nueva)
                   intro: _avReprogramada_() ? 'La agenda suspendió estas reuniones, o las marcó "Reprogramada" cuando la misma figura tiene otra fecha ' +
                                               'en el mismo lugar (el mail las canceló siendo futuras):'
                                             : 'La agenda suspendió estas reuniones (desaparecieron del mail siendo futuras):' },
    agenda_info: { hoja: AVISOS_HOJA_AGENDA_INFO, hora: AVISOS_AGENDA_INFO_HORA,
                   intro: 'Lo nuevo de la agenda que el equipo tiene que saber (no hay que decidir nada acá: lo que se decide está en ' +
                          'AGENDA_DUPLICADOS, en el archivo de la base). Todo, también, en la solapa ' + AVISOS_SOLAPA_PENDIENTES + ' de la intermedia:' }
  };
}
/** Cuántos textos entran en un mail (los demás: "y N más"). */
const AVISOS_MAX_LINEAS_MAIL_ = 40;

/** La cola de avisos de la corrida en curso: { tema: [textos] }. */
var _avisosCola_ = null;

// ===================== registrarAviso_ =====================

/**
 * Registra un aviso. NUNCA tira. Devuelve true si quedó para mandar (o se mandó), false si no.
 * Con AVISOS_MAIL_ACTIVO = false: sólo el log.
 */
function registrarAviso_(tema, texto) {
  try {
    tema = _avTema_(tema);
    texto = String(texto == null ? '' : texto);
    Logger.log('>>> AVISO [%s]%s: %s', tema, AVISOS_MAIL_ACTIVO ? '' : ' (el mail está apagado: sólo el log)', texto.slice(0, 1500));
    if (!AVISOS_MAIL_ACTIVO) return false;
    if (_avEnCorrida_()) { _avisosEncolar_(tema, texto, true); return true; }
    const cola = {};
    cola[tema] = [texto];
    _avisosVaciar_(cola);
    return true;
  } catch (err) {
    try { Logger.log('>>> registrarAviso_ falló (no corta nada): %s', err); } catch (e) { /* nada */ }
    return false;
  }
}

function _avTema_(t) { return String(t || 'otro').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60) || 'otro'; }
function _avEnCorrida_() { return typeof _corrida_ !== 'undefined' && !!_corrida_; }
function _avProps_() { return PropertiesService.getScriptProperties(); }
function _avHoy_() { return Utilities.formatDate(new Date(), RDV_TZ, 'yyyy-MM-dd'); }
function _avHora_() { return Number(Utilities.formatDate(new Date(), RDV_TZ, 'HH')); }
function _avFechaHora_(d) { return Utilities.formatDate(d || new Date(), RDV_TZ, 'dd/MM/yyyy HH:mm'); }

function _avisosEncolar_(tema, texto, persistir) {
  _avisosCola_ = _avisosCola_ || {};
  (_avisosCola_[tema] = _avisosCola_[tema] || []).push(texto);
  if (persistir) _avGuardarCola_();
}

/** La cola en una propiedad (barato; si la ejecución muere, la próxima corrida la manda). Acotada a AVISOS_COLA_MAX_CHARS. */
function _avGuardarCola_() {
  try {
    const out = { cola: {}, omitidos: {} };
    let largo = 40;
    Object.keys(_avisosCola_ || {}).forEach(function (t) {
      out.cola[t] = [];
      _avisosCola_[t].forEach(function (x) {
        const s = String(x).slice(0, 500);
        if (largo + s.length + 10 > AVISOS_COLA_MAX_CHARS) { out.omitidos[t] = (out.omitidos[t] || 0) + 1; return; }
        largo += s.length + 10;
        out.cola[t].push(s);
      });
    });
    _avProps_().setProperty(AVISOS_PROP_COLA, JSON.stringify(out));
  } catch (e) { /* el aviso nunca corta la corrida */ }
}

/** La cola que dejó una corrida que no terminó (y la borra). { tema: [textos] }. */
function _avLeerColaGuardada_() {
  const props = _avProps_();
  const v = props.getProperty(AVISOS_PROP_COLA);
  if (!v) return {};
  props.deleteProperty(AVISOS_PROP_COLA);
  let o = null;
  try { o = JSON.parse(v); } catch (e) { return {}; }
  const cola = (o && o.cola) || {};
  Object.keys((o && o.omitidos) || {}).forEach(function (t) {
    (cola[t] = cola[t] || []).push('(y ' + o.omitidos[t] + ' avisos más de este tema que no entraron en la propiedad del script)');
  });
  return cola;
}

/** Manda (o anota, las suspendidas) lo de la cola. Cada tema en su try. */
function _avisosVaciar_(cola) {
  Object.keys(cola || {}).forEach(function (t) {
    if (!cola[t] || !cola[t].length) return;
    try {
      if (_avDigests_()[t]) _avAnotarDigest_(t, cola[t]);
      else _avisosEnviarTema_(t, cola[t]);
    } catch (err) { Logger.log('>>> AVISOS: el tema "%s" no se pudo mandar: %s', t, err); }
  });
  Object.keys(_avDigests_()).forEach(function (t) {
    try { _avisosDigestDelDia_(t); } catch (err) { Logger.log('>>> AVISOS: el mail diario de "%s" falló: %s', t, err); }
  });
}

// ===================== los hooks de la corrida de la hora (49_Corridas.js) =====================

/**
 * Al empezar una corrida (ya con el bloqueo): lo que dejó en la cola una corrida que no terminó, y, si la anterior se
 * cortó, la racha. Se manda EN EL MOMENTO: si esta corrida también se corta, el aviso no se pierde.
 * `previa`: el registro de la corrida cortada (PROP_CORRIDA_EN_CURSO), o null.
 */
function avisosAlIniciarCorrida_(previa) {
  if (!AVISOS_MAIL_ACTIVO) return;
  try {
    const cola = _avLeerColaGuardada_();
    if (previa) {
      const r = _avisosRacha_(previa, 'CORTADA en "' + (previa.actual || '?') + '"', true);
      Object.keys(r).forEach(function (t) { (cola[t] = cola[t] || []).push(r[t]); });
    }
    _avisosVaciar_(cola);
  } catch (err) { Logger.log('>>> AVISOS al empezar la corrida: %s (la corrida sigue)', err); }
}

/** Al cerrar la corrida: la racha (cortadas / con error, partes salteadas) y la cola de la corrida. */
function avisosAlCerrarCorrida_(c, estado) {
  if (!AVISOS_MAIL_ACTIVO || !c) return;
  try {
    // 15/10 (revisor): la racha cuenta sólo las corridas REALES de la hora (no las en seco ni las del historial, paso 22)
    const r = c.modo === 'real' ? _avisosRacha_(c, estado, (c.errores || []).length > 0) : {};
    // 15/10 (revisor): sin tiempo para mandar (la corrida ya pasa de AVISOS_ENVIO_MAX_MS), se guarda todo y lo manda la siguiente
    const tarde = typeof corridaTranscurridoMs_ === 'function' && c.t0 && (Date.now() - c.t0) > AVISOS_ENVIO_MAX_MS;
    Object.keys(r).forEach(function (t) { _avisosEncolar_(t, r[t], tarde); });
    if (tarde) {
      _avGuardarCola_();
      Logger.log('AVISOS: la corrida ya lleva %s s: los avisos quedan guardados y los manda la corrida siguiente.', Math.round((Date.now() - c.t0) / 1000));
      _avisosCola_ = null;
      return;
    }
    const cola = _avisosCola_ || {};
    _avisosCola_ = null;
    _avisosVaciar_(cola);
    // la propiedad se borra DESPUÉS de mandar: si la ejecución muere mandando, la próxima corrida lo manda (lo ya mandado
    // hoy no se repite: el "uno por día" ya quedó anotado)
    try { _avProps_().deleteProperty(AVISOS_PROP_COLA); } catch (e) { /* nada */ }
  } catch (err) { Logger.log('>>> AVISOS al cerrar la corrida: %s', err); }
}

/**
 * La racha, en una propiedad: cuántas corridas seguidas cortadas o con error (una que no arrancó por el bloqueo no cuenta)
 * y, por parte, cuántas seguidas salteadas por tiempo (una que corrió la pone en 0). Devuelve { tema: texto } a avisar.
 */
function _avisosRacha_(c, estado, mala) {
  const props = _avProps_();
  let R = null;
  try { R = JSON.parse(props.getProperty(AVISOS_PROP_RACHA) || 'null'); } catch (e) { R = null; }
  R = R || { malas: 0, ultimas: [], salteadas: {} };
  if (mala) {
    R.malas++;
    const err = (c.errores || [])[0];
    R.ultimas.push(c.id + ' | ' + estado + (err ? ' | ' + String(err).split('\n')[0].slice(0, 300) : ''));
    R.ultimas = R.ultimas.slice(-5);
  } else { R.malas = 0; R.ultimas = []; }
  const partes = typeof PARTES_CORRIDA_ !== 'undefined' ? PARTES_CORRIDA_ : [];
  partes.forEach(function (p) {
    if ((c.salteadas || []).indexOf(p) >= 0) R.salteadas[p] = (R.salteadas[p] || 0) + 1;
    else if (c.partes && p in c.partes) R.salteadas[p] = 0;
    // 16/10 (revisor): una parte que "no tocaba" (los IDs cada 3 h) corta la racha: no es una salteada por tiempo
    else if (c.noTocaba && p in c.noTocaba) R.salteadas[p] = 0;
  });
  try { props.setProperty(AVISOS_PROP_RACHA, JSON.stringify(R)); } catch (e) { /* nada */ }
  const out = {};
  if (R.malas >= AVISOS_CORRIDAS_MALAS_SEGUIDAS) {
    out.corridas_con_error = 'Las últimas ' + R.malas + ' corridas de la hora se cortaron o tuvieron error:\n' +
      R.ultimas.map(function (u) { return '  ' + u; }).join('\n') +
      '\nEl detalle (el error completo de cada parte): ' + RDV_HOJA_CORRIDAS + ', en la intermedia.';
  }
  const salt = Object.keys(R.salteadas).filter(function (p) { return R.salteadas[p] >= AVISOS_PARTE_SALTEADA_SEGUIDAS; });
  if (salt.length) {
    out.parte_salteada = 'Partes que la guarda de tiempo salteó en las últimas corridas seguidas (no empezaron por falta de tiempo): ' +
      salt.map(function (p) { return p + ' (' + R.salteadas[p] + ' seguidas)'; }).join(', ') +
      '. Lo salteado queda para la corrida siguiente; si no corre nunca, ese dato no se actualiza. Tiempos: paso 67 (' +
      RDV_HOJA_CORRIDAS + ').';
  }
  return out;
}

// ===================== mandar =====================

/** Un aviso de un tema, como mucho uno por día. */
function _avisosEnviarTema_(tema, textos) {
  const n = textos.length;
  const lista = textos.slice(0, AVISOS_MAX_LINEAS_MAIL_).map(function (t) { return '- ' + t; });
  if (n > AVISOS_MAX_LINEAS_MAIL_) lista.push('(y ' + (n - AVISOS_MAX_LINEAS_MAIL_) + ' más: ver el log de la corrida)');
  const titulo = AVISOS_TITULOS_[tema] || ('aviso: ' + tema);
  const cuerpo = titulo.charAt(0).toUpperCase() + titulo.slice(1) + '.\n\n' + lista.join('\n') + '\n\n' + _avPie_();
  return _avEnviarUnaVezPorDia_(tema, AVISOS_MAIL_ASUNTO + titulo + (n > 1 ? ' (' + n + ')' : ''), cuerpo);
}

function _avPie_() {
  return '—\n' + _avFechaHora_() + '. Como mucho un mail por tema por día: lo que se repita hoy queda sólo en el log.\n' +
    'Para no recibir más estos mails: AVISOS_MAIL_ACTIVO = false (00_Config.js) + clasp push.';
}

/** Manda el mail si hoy todavía no se mandó uno de este tema. Devuelve true si lo mandó. */
function _avEnviarUnaVezPorDia_(tema, asunto, cuerpo) {
  const props = _avProps_(), clave = AVISOS_PROP_ULTIMO + tema, hoy = _avHoy_();
  if (props.getProperty(clave) === hoy) {
    Logger.log('AVISOS: ya se mandó hoy un mail de "%s": no se manda otro (%s).', tema, asunto);
    return false;
  }
  if (!_enviarMailAviso_(asunto, cuerpo)) return false;
  props.setProperty(clave, hoy);
  return true;
}

/** El único lugar que manda: GmailApp (sin permiso nuevo; ver arriba), a AVISOS_MAIL_PARA. Nunca tira. */
function _enviarMailAviso_(asunto, cuerpo) {
  try {
    GmailApp.sendEmail(AVISOS_MAIL_PARA, String(asunto).slice(0, 250), String(cuerpo).slice(0, 100000));
    Logger.log('AVISOS: mail mandado a %s: %s', AVISOS_MAIL_PARA, asunto);
    return true;
  } catch (err) {
    Logger.log('>>> AVISOS: el mail NO se mandó (%s): %s', asunto, err);
    return false;
  }
}

// ===================== las suspendidas: un mail por día =====================

/** Anota las suspendidas en AVISOS_SUSPENDIDAS (intermedia): fecha | texto | mandado. */
function _avAnotarSuspendidas_(textos) { return _avAnotarDigest_('suspendidas', textos); }

/** Anota los textos de un tema "de un mail por día" (`_avDigests_`) en su solapa de la intermedia: fecha | texto | mandado. */
function _avAnotarDigest_(tema, textos) {
  const dg = _avDigests_()[tema];
  const ss = ssIntermedia_();
  let sh = ss.getSheetByName(dg.hoja);
  if (!sh) { sh = ss.insertSheet(dg.hoja); sh.getRange(1, 1, 1, 3).setValues([['fecha', 'texto', 'mandado']]); }
  const ahora = new Date();
  const filas = textos.map(function (t) { return [ahora, _avTextoCelda_(t), '']; });
  sh.getRange(sh.getLastRow() + 1, 1, filas.length, 3).setValues(filas);
}

/**
 * El mail "reuniones suspendidas hoy": desde las AVISOS_SUSPENDIDAS_HORA, una vez por día, con todo lo que todavía no se
 * mandó (lo de otro día, con su fecha). Si no hay nada, ese día no se vuelve a mirar.
 */
function _avisosSuspendidasDelDia_() { return _avisosDigestDelDia_('suspendidas'); }

/** El mail diario de un tema de `_avDigests_` (16/10: 'suspendidas' y 'agenda_info'): lo mismo que el de las suspendidas. */
function _avisosDigestDelDia_(tema) {
  if (!AVISOS_MAIL_ACTIVO) return false;
  const dg = _avDigests_()[tema];
  const props = _avProps_(), clave = AVISOS_PROP_ULTIMO + tema, hoy = _avHoy_();
  if (props.getProperty(clave) === hoy || _avHora_() < dg.hora) return false;
  const sh = ssIntermedia_().getSheetByName(dg.hoja);
  const n = sh ? sh.getLastRow() : 0;
  const v = n >= 2 ? sh.getRange(2, 1, n - 1, 3).getValues() : [];
  const pend = [];
  v.forEach(function (r, i) { if (str(r[1]) && !str(r[2])) pend.push(i); });
  if (!pend.length) return false;   // 15/10 (revisor): sin pendientes NO se marca el día (lo que anote esta corrida sale hoy)
  const lineas = pend.slice(0, AVISOS_MAX_LINEAS_MAIL_).map(function (i) {
    const d = v[i][0] instanceof Date ? v[i][0] : null;
    const cuando = d ? (Utilities.formatDate(d, RDV_TZ, 'yyyy-MM-dd') === hoy ? Utilities.formatDate(d, RDV_TZ, 'HH:mm') : _avFechaHora_(d)) : '?';
    return '- [' + cuando + '] ' + str(v[i][1]);
  });
  if (pend.length > AVISOS_MAX_LINEAS_MAIL_) lineas.push('(y ' + (pend.length - AVISOS_MAX_LINEAS_MAIL_) + ' más: ver la solapa ' + dg.hoja + ')');
  const cuerpo = dg.intro + '\n\n' + lineas.join('\n') +
    '\n\nTodas, en la solapa ' + dg.hoja + ' de la intermedia.\n\n' + _avPie_();
  if (!_enviarMailAviso_(AVISOS_MAIL_ASUNTO + AVISOS_TITULOS_[tema] + ' (' + pend.length + ')', cuerpo)) return false;
  props.setProperty(clave, hoy);
  const marca = _avFechaHora_();
  const col = v.map(function (r, i) { return [pend.indexOf(i) >= 0 ? marca : r[2]]; });
  sh.getRange(2, 3, col.length, 1).setValues(col);
  return true;
}

/** Las suspendidas de los últimos 7 días (para el resumen del lunes). null si la solapa no existe. */
function _avSuspendidasDeLaSemana_(ahora) {
  const sh = ssIntermedia_().getSheetByName(AVISOS_HOJA_SUSPENDIDAS);
  if (!sh) return null;
  const n = sh.getLastRow();
  if (n < 2) return [];
  const desde = (ahora || new Date()).getTime() - 7 * 24 * 3600 * 1000;
  return sh.getRange(2, 1, n - 1, 3).getValues().filter(function (r) {
    return r[0] instanceof Date && r[0].getTime() >= desde && str(r[1]);
  }).map(function (r) { return _avFechaHora_(r[0]) + ' | ' + str(r[1]); });
}

/** Un texto que Sheets no lea como fórmula. */
function _avTextoCelda_(t) {
  const s = String(t == null ? '' : t).slice(0, 49000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// ===================== H5: la auditoría semanal =====================

/** La función del activador semanal (los lunes a las 8). Con AUDITORIA_SEMANAL_ACTIVA = false no hace nada. */
function auditoriaSemanalAgenda() {
  if (!AUDITORIA_SEMANAL_ACTIVA) {
    Logger.log('auditoriaSemanalAgenda: AUDITORIA_SEMANAL_ACTIVA = false (00_Config.js): no hace nada.');
    return null;
  }
  return auditoriaSemanal_(false);
}

/** EN SECO: la auditoría y lo que escribiría / mandaría, sólo en el log. No escribe la solapa, no manda el mail. */
function auditoriaSemanalAgenda_enSeco() { return auditoriaSemanal_(true); }

/**
 * La auditoría semanal. `opciones` (sólo los tests): `auditoria` y `cancelaciones` (se pasan a cada auditoría).
 * Devuelve { res, falla, lineas, cancel, cancelNota, pendientes, suspendidas, tiempos, matriz, ok, mail }.
 */
function auditoriaSemanal_(enSeco, opciones) {
  opciones = opciones || {};
  const t0 = Date.now();
  const R = { ahora: new Date(), res: null, falla: null, lineas: null, cancel: null, cancelNota: '' };
  Logger.log('=== auditoría semanal de la agenda (%s) ===', enSeco ? 'EN SECO: no escribe la solapa ni manda el mail'
             : 'escribe ' + RDV_HOJA_AUDITORIA_AGENDA + ' (intermedia)' + (AVISOS_MAIL_ACTIVO ? ' y manda el resumen a ' + AVISOS_MAIL_PARA : '; el mail está apagado'));
  const largo = _avLargoLog_();
  try { R.res = auditoriaAgenda(opciones.auditoria); }
  catch (err) { R.falla = String(err && err.message || err); Logger.log('>>> LA AUDITORÍA FALLÓ: %s', R.falla); }
  R.lineas = _avLogDesde_(largo);
  const tAg = Date.now() - t0;
  // 15/10 (revisor): la solapa con lo de la agenda se escribe YA (si después la ejecución se pasa de los 6 min con las
  // cancelaciones, lo central de H5 ya quedó); al final se reescribe completa.
  if (!enSeco) {
    try { const m0 = filasAuditoriaAgenda_(R); _avEscribirHojaAuditoria_(m0, m0.ok); }
    catch (err) { Logger.log('>>> la solapa %s (parcial) NO se escribió: %s', RDV_HOJA_AUDITORIA_AGENDA, err); }
  }
  if (!AUDITORIA_SEMANAL_CANCELACIONES) R.cancelNota = 'apagada (AUDITORIA_SEMANAL_CANCELACIONES = false)';
  else if (typeof auditoriaCancelaciones !== 'function') R.cancelNota = 'no está en el proyecto';
  else if (tAg > AUDITORIA_SEMANAL_CANCEL_MAX_MS) {
    R.cancelNota = 'no se corrió: la auditoría de la agenda tardó ' + Math.round(tAg / 1000) + ' s (límite ' +
      Math.round(AUDITORIA_SEMANAL_CANCEL_MAX_MS / 1000) + ' s). Correr el paso 68 a mano.';
  } else {
    // 15/10: un período MÓVIL (las últimas 6 semanas hasta el sábado de la semana que viene): el fijo del paso 68 envejece
    const h = hoyMediodia_(), aSab = (6 - h.getDay() + 7) % 7 + 7;
    const per = { desde: new Date(h.getFullYear(), h.getMonth(), h.getDate() - 42, 12), hasta: new Date(h.getFullYear(), h.getMonth(), h.getDate() + aSab, 12) };
    R.cancelPeriodo = Object.assign(per, opciones.cancelaciones || {});
    try { R.cancel = auditoriaCancelaciones(R.cancelPeriodo); }
    catch (err) { R.cancelNota = 'falló: ' + String(err && err.message || err); }
  }
  try { R.pendientes = _avLeerPendientes_(); } catch (err) { R.pendientes = { error: String(err && err.message || err) }; }
  try { R.suspendidas = _avSuspendidasDeLaSemana_(R.ahora); } catch (err) { R.suspendidas = null; }
  try { R.tiempos = typeof tiemposDeCorridas === 'function' ? tiemposDeCorridas(AUDITORIA_SEMANAL_CORRIDAS) : null; }
  catch (err) { R.tiempos = null; Logger.log('>>> los tiempos de REGISTRO_CORRIDAS no se pudieron leer: %s', err); }

  R.matriz = filasAuditoriaAgenda_(R);
  R.ok = R.matriz.ok;
  R.mail = mailSemanal_(R);
  if (enSeco) {
    Logger.log('--- EN SECO: la solapa %s quedaría así (%s filas; se muestran las primeras 60) ---', RDV_HOJA_AUDITORIA_AGENDA, R.matriz.length);
    R.matriz.slice(0, 60).forEach(function (r) { Logger.log('  %s | %s', r[0], r[1]); });
    Logger.log('--- EN SECO: el mail (%s) a %s ---', AVISOS_MAIL_ACTIVO ? 'se mandaría' : 'NO se mandaría: AVISOS_MAIL_ACTIVO = false', AVISOS_MAIL_PARA);
    Logger.log('  asunto: %s', R.mail.asunto);
    R.mail.cuerpo.split('\n').forEach(function (l) { Logger.log('  %s', l); });
    return R;
  }
  try { _avEscribirHojaAuditoria_(R.matriz, R.ok); }
  catch (err) { Logger.log('>>> la solapa %s NO se escribió: %s', RDV_HOJA_AUDITORIA_AGENDA, err); }
  if (AVISOS_MAIL_ACTIVO) _avEnviarUnaVezPorDia_('resumen_semanal', R.mail.asunto, R.mail.cuerpo);
  return R;
}

/** El largo del log de esta ejecución (-1 si Logger.getLog no anda). */
function _avLargoLog_() {
  try { return typeof Logger.getLog === 'function' ? String(Logger.getLog()).length : -1; } catch (e) { return -1; }
}

/** Las líneas logueadas desde `largo` (sin la marca de hora de Apps Script), o null. */
function _avLogDesde_(largo) {
  if (largo < 0) return null;
  try {
    return String(Logger.getLog()).slice(largo).split('\n')
      .map(function (l) { return l.replace(/^\[[^\]]*\]\s?/, '').replace(/\s+$/, ''); })
      .filter(function (l) { return l !== ''; });
  } catch (e) { return null; }
}

/**
 * La solapa: fila 1 la línea roja / verde, fila 2 el encabezado "sección | texto", y después resumen, lo que falló, lo que
 * no está OK y el log. `matriz.ok`: si está todo bien.
 */
function filasAuditoriaAgenda_(R) {
  const m = [];
  const res = R.res;
  const noOk = res ? res.noOk || [] : [], errores = res ? res.errores || [] : [];
  const ok = !!res && !noOk.length && !errores.length && !R.falla;
  let linea;
  if (!res) linea = 'LA AUDITORÍA FALLÓ: ' + (R.falla || '?') + ' — ver el log de la ejecución';
  else if (ok) linea = 'OK: la agenda, la base y las copias coinciden (' + _avFechaHora_(R.ahora) + ')';
  else linea = 'NO ESTÁ TODO OK: ' + noOk.length + ' cosas para revisar' + (errores.length ? ' y ' + errores.length + ' secciones que fallaron' : '') +
    ' (abajo, "no está OK")';
  m.push([linea, '']);
  m.push(['sección', 'texto']);
  m.push(['auditoría', 'Auditoría de la agenda (paso 66, sólo lectura) del ' + _avFechaHora_(R.ahora) +
          '. Se reescribe cada lunes (activador semanal, ' + AUDITORIA_SEMANAL_FUNCION + ').']);
  if (res) {
    const c = res.cuentas || {};
    const k = function (x) { return c[x] == null ? '(no se calculó)' : c[x]; };
    m.push(['resumen', 'reuniones del mail (dos semanas): OK ' + k('OK') + ' | decidido por el equipo ' + (c['DECIDIDO POR EL EQUIPO'] || 0) +
            ' | DISTINTO ' + k('DISTINTO') + ' | FALTA EN LA BASE ' +
            k('FALTA EN LA BASE') + ' | DUPLICADA ' + k('DUPLICADA')]);
    m.push(['resumen', 'filas de la base sin reunión en el mail: ' + k('FILA SIN MAIL') + ' | ambiguas: ' + k('AMBIGUAS') +
            ' | creadas (14 días) con algo para revisar: ' + k('CREADAS CON PROBLEMAS') + ' | AGENDA_DUPLICADOS pendientes: ' +
            k('DUPLICADOS PENDIENTES') + ' | Seguridad sin figura: ' + k('FIGURA A COMPLETAR') +
            (c['SUSPENDIDAS CON DATOS'] != null ? ' | suspendidas por el sistema con asistentes o inscriptos: ' + c['SUSPENDIDAS CON DATOS'] : '')]);
    const copias = (res.extra && res.extra.copias) || {};
    Object.keys(copias).forEach(function (n) {
      const x = copias[n];
      m.push(['resumen', 'copia "' + n + '": ' + x.reuniones + ' reuniones | faltan ' + x.faltan + ' | sobran ' + x.sobran + ' | distintas ' + x.distintas]);
    });
  }
  errores.forEach(function (e) { m.push(['falló', e]); });
  noOk.forEach(function (t) { m.push(['no está OK', t]); });
  if (R.lineas) R.lineas.slice(0, 4000).forEach(function (l) { m.push(['log', l]); });
  else m.push(['log', '(no se pudo tomar el log de la auditoría: Logger.getLog no respondió; sólo el resumen)']);
  const out = m.map(function (r) { return [_avTextoCelda_(r[0]), _avTextoCelda_(r[1])]; });
  out.ok = ok;
  return out;
}

/** Escribe AUDITORIA_AGENDA (intermedia): la reescribe entera. */
function _avEscribirHojaAuditoria_(matriz, ok) {
  const ss = ssIntermedia_();
  let sh = ss.getSheetByName(RDV_HOJA_AUDITORIA_AGENDA);
  if (!sh) sh = ss.insertSheet(RDV_HOJA_AUDITORIA_AGENDA);
  sh.clearContents();
  const datos = matriz.map(function (r) { return [r[0], r[1]]; });
  sh.getRange(1, 1, datos.length, 2).setValues(datos);
  if (typeof formatoLectura_ === 'function') {
    try { formatoLectura_(sh, datos, { filaEncabezado: 2, columnaDescripcion: 1 }); } catch (err) { Logger.log('>>> el formato de %s falló: %s', RDV_HOJA_AUDITORIA_AGENDA, err); }
  }
  sh.getRange(1, 1, 1, 2).setBackground(ok ? '#D9EAD3' : '#CC0000').setFontColor(ok ? '#274E13' : '#FFFFFF').setFontWeight('bold');
  SpreadsheetApp.flush();
  Logger.log('%s: %s filas escritas (%s).', RDV_HOJA_AUDITORIA_AGENDA, datos.length, ok ? 'todo OK' : 'NO está todo OK: línea roja arriba');
}

/** AGENDA_PENDIENTES (intermedia, la escribe la agenda): las filas con algo, debajo del encabezado. null si no existe. */
function _avLeerPendientes_() {
  const sh = ssIntermedia_().getSheetByName(AVISOS_SOLAPA_PENDIENTES);
  if (!sh) return null;
  const n = sh.getLastRow(), nc = sh.getLastColumn();
  if (n < 2 || nc < 1) return { filas: [] };
  const v = sh.getRange(1, 1, n, nc).getValues();
  const hdr = v[0].map(normalizeHeader_);
  // 16/10: AGENDA_PENDIENTES tiene "tipo" (lo que el equipo tiene que saber, agrupado) y columnas que no van al mail ("desde", "id")
  const iTipo = hdr.indexOf(normalizeHeader_('tipo'));
  const fuera = ['id', 'desde', 'tipo'].map(normalizeHeader_);
  const conDatos = v.slice(1).filter(function (r) { return r.some(function (x) { return x !== '' && x != null; }); });
  const texto = function (r) {
    return r.filter(function (x, k) { return x !== '' && x != null && (iTipo < 0 || fuera.indexOf(hdr[k]) < 0); })
      .map(function (x) { return x instanceof Date ? fmtFecha_(x) : String(x); }).join(' | ');
  };
  const filas = conDatos.map(texto);
  const out = { filas: filas, encabezado: v[0].filter(String).join(' | ') };
  if (iTipo >= 0) {
    out.porTipo = {};
    conDatos.forEach(function (r) { const t = str(r[iTipo]) || '(sin tipo)'; (out.porTipo[t] = out.porTipo[t] || []).push(texto(r)); });
  }
  return out;
}

/** 16/10: los tipos de AGENDA_PENDIENTES que son un HECHO ya hecho (no cuentan como "cosas para revisar" en el resumen). */
const AVISOS_TIPOS_PENDIENTES_HECHOS_ = ['cancelación aplicada (Suspendida)', 'juntada sola (fusión automática)', 'juntada por decisión del equipo',
                                         'cancelación aplicada (Reprogramada)'];   // 20/10 (prompt 09, 6c: AGENDA_REPROGRAMADA)

/** El resumen del lunes: { asunto, cuerpo, problemas }. */
function mailSemanal_(R) {
  const L = [], MAX = 15;
  let problemas = 0;
  const lista = function (xs, sangria) {
    xs.slice(0, MAX).forEach(function (t) { L.push((sangria || '   ') + '- ' + t); });
    if (xs.length > MAX) L.push((sangria || '   ') + '(y ' + (xs.length - MAX) + ' más)');
  };
  const res = R.res;
  L.push('Resumen semanal de RDV — ' + _avFechaHora_(R.ahora));
  L.push('');
  // 1. la auditoría de la agenda
  L.push('1. AUDITORÍA DE LA AGENDA (detalle: solapa ' + RDV_HOJA_AUDITORIA_AGENDA + ' de la intermedia)');
  const noOk = res ? res.noOk || [] : [];
  if (!res) { L.push('   LA AUDITORÍA FALLÓ: ' + (R.falla || '?')); problemas++; }
  else {
    const c = res.cuentas || {};
    L.push('   ' + (R.ok ? 'OK' : 'NO ESTÁ TODO OK') + ' | reuniones del mail: OK ' + (c.OK || 0) + ' | DISTINTO ' + (c.DISTINTO || 0) +
           ' | FALTA EN LA BASE ' + (c['FALTA EN LA BASE'] || 0) + ' | DUPLICADA ' + (c.DUPLICADA || 0));
    const otras = noOk.filter(function (t) { return !/^\[6\]/.test(t) && !/AGENDA_DUPLICADOS pendiente/.test(t); });
    if (otras.length) { L.push('   lo que no está OK (' + otras.length + '):'); lista(otras, '   '); }
    (res.errores || []).forEach(function (e) { L.push('   sección que falló: ' + e); });
    problemas += noOk.length + (res.errores || []).length;
  }
  L.push('');
  // 2. cancelaciones
  // 15/10 (revisor): el período que se usó de verdad (el móvil), no el fijo del paso 68
  const fmtP = function (d) { return d instanceof Date ? Utilities.formatDate(d, RDV_TZ, 'dd/MM/yyyy') : String(d); };
  L.push('2. CANCELACIONES QUE LA BASE NO REFLEJA (paso 68' + (R.cancelPeriodo ?
         ', del ' + fmtP(R.cancelPeriodo.desde) + ' al ' + fmtP(R.cancelPeriodo.hasta) : '') + ')');
  if (R.cancel && R.cancel.resumen) {
    const rr = R.cancel.resumen;
    L.push('   no reflejadas: ' + (rr.noRefleja || []).length);
    lista(rr.noRefleja || []);
    L.push('   contradictorias: ' + (rr.contradictorias || []).length);
    lista(rr.contradictorias || []);
    if ((rr.dudosas || []).length) L.push('   dudosas (revisar a mano): ' + rr.dudosas.length);
    problemas += (rr.noRefleja || []).length + (rr.contradictorias || []).length;
  } else L.push('   ' + (R.cancelNota || 'no se corrió'));
  L.push('');
  // 3. por definir
  L.push('3. LO QUE HAY QUE SABER DE LA AGENDA: REUNIONES POR DEFINIR, SEMANAS FRENADAS, JUNTADAS, SUSPENDIDAS… (' + AVISOS_SOLAPA_PENDIENTES + ', intermedia)');
  if (!R.pendientes) L.push('   la solapa no existe todavía');
  else if (R.pendientes.error) L.push('   no se pudo leer: ' + R.pendientes.error);
  else if (R.pendientes.porTipo) {
    // 16/10: agrupado por tipo; los HECHOS (una cancelación aplicada, una reunión juntada) no cuentan como "cosas para revisar"
    L.push('   ' + R.pendientes.filas.length);
    Object.keys(R.pendientes.porTipo).forEach(function (t) {
      const xs = R.pendientes.porTipo[t];
      L.push('   ' + t + ': ' + xs.length);
      lista(xs, '      ');
      if (AVISOS_TIPOS_PENDIENTES_HECHOS_.indexOf(t) < 0) problemas += xs.length;
    });
  } else { L.push('   ' + R.pendientes.filas.length); lista(R.pendientes.filas); problemas += R.pendientes.filas.length; }
  L.push('');
  // 4. ambiguas
  const amb = noOk.filter(function (t) { return /^\[6\]/.test(t); });
  L.push('4. REUNIONES AMBIGUAS (la agenda no sabe cuál es su fila): ' + (res && res.cuentas && res.cuentas.AMBIGUAS != null ? res.cuentas.AMBIGUAS : amb.length));
  lista(amb);
  L.push('');
  // 5. AGENDA_DUPLICADOS
  const dup = noOk.filter(function (t) { return /AGENDA_DUPLICADOS pendiente/.test(t); });
  L.push('5. AGENDA_DUPLICADOS PENDIENTES (esperan una decisión del equipo): ' +
         (res && res.cuentas && res.cuentas['DUPLICADOS PENDIENTES'] != null ? res.cuentas['DUPLICADOS PENDIENTES'] : dup.length));
  lista(dup);
  L.push('');
  // 6. suspendidas
  L.push(_avReprogramada_() ? '6. REUNIONES QUE LA AGENDA SUSPENDIÓ (O MARCÓ "REPROGRAMADA", CON LA FECHA NUEVA) EN LA SEMANA'
                             : '6. REUNIONES QUE LA AGENDA SUSPENDIÓ EN LA SEMANA');
  if (R.suspendidas == null) L.push('   ninguna anotada (la solapa ' + AVISOS_HOJA_SUSPENDIDAS + ' no existe: se crea con la primera, con el mail prendido)');
  else { L.push('   ' + R.suspendidas.length); lista(R.suspendidas); }
  L.push('');
  // 7. la corrida de la hora
  L.push('7. LA CORRIDA DE LA HORA (las últimas ' + AUDITORIA_SEMANAL_CORRIDAS + ' de ' + RDV_HOJA_CORRIDAS + ')');
  const T = R.tiempos;
  if (!T) L.push('   sin datos (' + RDV_HOJA_CORRIDAS + ' vacía o no se pudo leer)');
  else {
    const est = T.estados || {};
    L.push('   estados: ' + (Object.keys(est).map(function (k) { return k + ' ' + est[k]; }).join(' | ') || '—'));
    problemas += (est.ERROR || 0) + (est.CORTADA || 0);
    Object.keys(T).forEach(function (p) {
      if (p === 'estados') return;
      const x = T[p];
      if (!x || (!x.veces && !x.salteada)) return;
      L.push('   ' + p + ': mediana ' + (x.mediana == null ? '—' : x.mediana.toFixed(1) + ' s') + ', máximo ' +
             (x.max == null ? '—' : x.max.toFixed(1) + ' s') + (x.salteada ? ', salteada por tiempo ' + x.salteada + ' veces' : ''));
    });
  }
  L.push('');
  L.push(_avPie_());
  const fecha = Utilities.formatDate(R.ahora, RDV_TZ, 'dd/MM');
  return { asunto: AVISOS_MAIL_ASUNTO + 'resumen semanal ' + fecha + ': ' + (problemas ? problemas + ' cosas para revisar' : 'todo OK'),
           cuerpo: L.join('\n'), problemas: problemas };
}

// ===================== el activador semanal y el permiso =====================

/** Crea el activador semanal (lunes, AUDITORIA_SEMANAL_HORA). Se niega con la auditoría apagada; no duplica. */
function instalarAuditoriaSemanal_() {
  if (!AUDITORIA_SEMANAL_ACTIVA) {
    throw new Error('AUDITORIA_SEMANAL_ACTIVA = false (00_Config.js): prenderla y hacer clasp push antes de instalar el activador.');
  }
  const ya = _activadoresAuditoriaSemanal_();
  if (ya.length) { Logger.log('Ya hay %s activador(es) de %s: no se crea otro.', ya.length, AUDITORIA_SEMANAL_FUNCION); return 0; }
  ScriptApp.newTrigger(AUDITORIA_SEMANAL_FUNCION).timeBased().onWeekDay(ScriptApp.WeekDay[AUDITORIA_SEMANAL_DIA])
    .atHour(AUDITORIA_SEMANAL_HORA).create();
  Logger.log('Activador creado: %s, los %s a las %s (Apps Script lo dispara dentro de esa hora). Anotarlo en docs/triggers-legado.md.',
             AUDITORIA_SEMANAL_FUNCION, AUDITORIA_SEMANAL_DIA, AUDITORIA_SEMANAL_HORA);
  return 1;
}

/** Borra el activador semanal (sólo ése). */
function borrarAuditoriaSemanal_() {
  const ya = _activadoresAuditoriaSemanal_();
  ya.forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('Borrados %s activador(es) de %s. Los demás no se tocaron.', ya.length, AUDITORIA_SEMANAL_FUNCION);
  return ya.length;
}

function _activadoresAuditoriaSemanal_() {
  return ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === AUDITORIA_SEMANAL_FUNCION; });
}

/**
 * La PRUEBA de los avisos: con AVISOS_MAIL_ACTIVO = true manda un mail de prueba a AVISOS_MAIL_PARA (no cuenta para el "uno
 * por día" de ningún tema). Con el mail apagado, no manda nada. No hace falta autorizar nada nuevo (GmailApp: ver arriba).
 */
function autorizarMailAvisos() {
  if (AVISOS_MAIL_ACTIVO) {
    const ok = _enviarMailAviso_(AVISOS_MAIL_ASUNTO + 'prueba de los avisos', 'Si te llegó este mail, los avisos de RDV andan.\n\n' + _avPie_());
    Logger.log(ok ? 'AVISOS: mail de prueba mandado a %s.' : 'AVISOS: el mail de prueba NO salió (ver arriba).', AVISOS_MAIL_PARA);
    return ok;
  }
  Logger.log('AVISOS_MAIL_ACTIVO = false: no se manda el mail de prueba.');
  return null;
}
