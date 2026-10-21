/**
 * 52_CancelacionMail.js — "EL MAIL MANDA": CANCELAR UNA FILA POR EL MAIL, de a una (15/10, noche; pasos 91 y 92).
 *
 * Decisión del usuario: CANCELADA EN EL MAIL = SUSPENDIDA (desaparecida de una versión nueva completa, o en ROJO ENTERO en la
 * última versión válida de su semana; 00_Config.js: AGENDA_CANCELACION_MODO y AGENDA_COLORES_MAIL). La corrida de la hora lo
 * hace sólo con AGENDA_CANCELACION_AUTOMATICA y AGENDA_COLORES_MAIL prendidos (APAGADOS hasta ver la medición del paso 93).
 * Para probarlo antes, sobre UNA fila:
 *
 *   cancelarFilaAgenda_enSeco(825)  (paso 91, SÓLO LECTURA) el plan de la agenda con los colores y la cancelación automática
 *                                   prendidos POR OPCIONES (no toca 00_Config.js): si la fila se suspendería y por qué (el
 *                                   mail, la versión, las líneas en rojo, la nota, el tiempo, el STATUS y quién lo puso), y
 *                                   los valores de la validación de datos de STATUS REUNIÓN (¿existe "Cancelada"?).
 *   cancelarFilaAgenda(825)         (paso 92, ESCRIBE la base, SÓLO esa fila) el mismo plan, filtrado a la suspensión de esa
 *                                   fila; se niega si el plan no la suspende o si tocaría otra cosa. Con el bloqueo de la
 *                                   corrida de la hora, por la excepción de la agenda (`aplicarPlanAgenda_` → escribirAgendaLote_:
 *                                   STATUS "en agenda" → "Suspendida", agenda_status_escrito) y con REGISTRO_AGENDA /
 *                                   REGISTRO_AGENDA_CAMBIOS (deshacer, paso 38, la vuelve atrás). Si fue por el ROJO, la nota
 *                                   "suspendida_rojo" del registro hace que la corrida de la hora (con los colores apagados)
 *                                   NO la reactive aunque la reunión siga escrita en el mail. Avisa (registrarAviso_('suspendidas')).
 *
 * `opciones` (los tests): `mails`, `geocodificar`, `historial`, `elecciones`, `conjunto`, `hoy`.
 */

/** Paso 91 (SÓLO LECTURA): ¿la cancelación del mail suspendería la fila `fila`? y por qué. No escribe nada. */
function cancelarFilaAgenda_enSeco(fila, opciones) {
  return _cancelarFilaAgenda_(fila, true, opciones || {});
}

/** Paso 92 (REAL, sólo esa fila): la suspende si el plan la suspende y no toca nada más. Con el bloqueo de la corrida. */
function cancelarFilaAgenda(fila, opciones) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(ESPERA_BLOQUEO_MS)) {
    Logger.log('>>> Hay otra corrida (upsert o agenda) en curso: no se hace nada (LockService).');
    return { error: 'hay otra corrida en curso' };
  }
  try { return _cancelarFilaAgenda_(fila, false, opciones || {}); }
  finally { lock.releaseLock(); }
}

function _cancelarFilaAgenda_(fila, enSeco, opciones) {
  const t0 = Date.now();
  fila = Number(fila);
  Logger.log('=== paso %s: %s la fila %s por la cancelación del mail — %s ===', enSeco ? 91 : 92,
             enSeco ? 'EN SECO (no escribe nada): ¿se suspendería' : 'REAL: suspender SÓLO', fila, descripcionHojaDestino_());
  const fin = function (o) { Logger.log('paso %s: %s ms', enSeco ? 91 : 92, Date.now() - t0); return o; };
  if (!(fila >= 2)) { Logger.log('>>> "%s" no es un número de fila de la base.', fila); return fin({ error: 'fila inválida' }); }
  const sh = verificarHojaDestino_(ssDestino_());
  const dest = leerDestino_();
  const A = indicesAgenda_(dest.hdr);
  if (A.faltan.length) { Logger.log('>>> faltan columnas de la agenda: %s. No se hace nada.', A.faltan.join(', ')); return fin({ error: 'faltan columnas de la agenda' }); }
  const f = dest.filas.filter(function (x) { return x.fila === fila; })[0];
  if (!f) { Logger.log('>>> la fila %s no tiene datos.', fila); return fin({ error: 'la fila no tiene datos' }); }
  const val = function (n) { return A[n] == null ? '' : f.valores[A[n]]; };
  const col = function (n) { return A[n] == null ? null : A[n] + 1; };
  // 16/10 (revisor): la fila se identifica por NÚMERO; `opciones.esperado` = { figura (texto o regex), fecha 'yyyy-MM-dd' } la
  // confirma (si el equipo insertó o borró filas arriba, el número es de otra reunión): si no coincide, no se hace nada.
  const esp = opciones.esperado;
  if (esp) {
    const figOk = !esp.figura || (esp.figura instanceof RegExp ? esp.figura.test(f.figura || '') : normalizeText_(f.figura || '').indexOf(normalizeText_(esp.figura)) >= 0);
    const fecOk = !esp.fecha || (f.fecha && ymd_(f.fecha) === String(esp.fecha).replace(/-/g, ''));
    if (!figOk || !fecOk) {
      Logger.log('>>> la fila %s es %s %s, no la esperada (%s %s): NO SE HACE NADA. ¿Se insertaron o borraron filas arriba?', fila,
                 f.figura || '(sin figura)', f.fecha ? fmtFecha_(f.fecha) : '(sin fecha)', String(esp.figura || ''), esp.fecha || '');
      return fin({ error: 'la fila no es la esperada', fila: fila, figura: f.figura, fecha: f.fecha ? fmtFecha_(f.fecha) : '' });
    }
  }
  // E: la lista de STATUS de la base (la validación de datos; sólo lectura): ¿existe "Cancelada"?
  const vs = validacionStatusAgenda_(sh, A);
  Logger.log('  STATUS REUNIÓN, la validación de datos: %s', vs.texto);
  // los mails, CON el HTML (sin tope de tiempo: es un paso a mano), y el plan con los colores y la cancelación prendidos
  const alcance = alcanceAgenda_();
  let mails;
  try {
    mails = opciones.mails ? { fuente: '(lista de prueba)', lista: opciones.mails }
                           : leerMailsAgendaGmail_(new Date(alcance.desde.getTime() - 7 * 86400000), { html: true, topeMs: null });
  } catch (err) { Logger.log('>>> no se pudieron leer los mails: %s. No se hace nada.', err); return fin({ error: 'mails: ' + err }); }
  const r = agendaDesdeListaDeMails_(mails.lista, Object.assign({}, mails, { coloresMail: true }));
  const P = planAgenda_(dest, r, A, alcance, {
    enSeco: true, historial: opciones.historial || leerHistorialAgenda_(), elecciones: opciones.elecciones || leerEleccionesAgenda_(),
    conjunto: opciones.conjunto, geocodificar: opciones.geocodificar || _geoSoloCacheCancelMail_(), hoy: opciones.hoy,
    // 20/10 (prompt 09, 6c): los pasos 91 / 92 SUSPENDEN una fila; "Reprogramada" (AGENDA_REPROGRAMADA) la decide la corrida de la hora
    cancelacionAutomatica: true, cancelacionModo: 'suspender', coloresMail: true, reprogramada: false });
  const st = str(val('STATUS REUNIÓN')), ste = str(val('agenda_status_escrito'));
  const delSistema = !esVacio_(ste) && normStatus_(ste) === normStatus_(st);
  const out = { fila: fila, status: st, statusEscrito: ste, statusDelSistema: delSistema, validacionStatus: vs, evaluaciones: [], explicacion: [],
                suspenderia: false };
  const decir = function (t) { out.explicacion.push(t); Logger.log('  %s', t); };
  decir('la fila ' + fila + ' | ' + (f.figura || '(sin figura)') + ' | ' + (f.fecha ? fmtFecha_(f.fecha) : '(sin fecha)') + ' ' +
        (valorAgendaComparable_(val('HORA'), 'HORA') || '--:--') + ' | ' + (f.barrio || 'sin barrio') + ' | STATUS "' + (st || '—') + '" (' +
        (esVacio_(ste) ? 'agenda_status_escrito vacío: lo puso el equipo' : (delSistema ? 'lo puso el sistema' : 'el sistema había escrito "' + ste + '": lo cambió el equipo')) + ')' +
        _datosFilaTextoAgenda_(dest, f));
  const evs = P.cancelacionesEvaluadas.filter(function (x) { return x.f && x.f.fila === fila; });
  evs.forEach(function (x) {
    const d = x.d;
    const e = { por: x.por || 'desaparecida', decision: x.decision, mail: x.mail ? Utilities.formatDate(x.mail, RDV_TZ, 'dd/MM/yyyy HH:mm') : '',
                asunto: x.por === 'rojo' ? str(d.asunto) : str(d.asuntoQueLaSaco), version: x.por === 'rojo' ? d.version + ' de ' + d.versiones : (d.versionQueLaSaco ? d.versionQueLaSaco + '' : ''),
                motivoMail: x.motivoMail || '', campos: d.colorMail ? d.colorMail.campos : '', notas: (d.notasMail || []).map(function (n) { return n.texto; }),
                tiempo: x.tiempo ? x.tiempo.texto : '', statusDelSistema: x.statusDelSistema };
    out.evaluaciones.push(e);
    decir('la reunión del mail: ' + _textoReunionAgenda_(d) + ' | ' + (e.por === 'rojo' ? 'CANCELADA EN EL MAIL: ' + e.motivoMail : 'DESAPARECIÓ del mail') +
          ' | mail "' + e.asunto + '" del ' + e.mail + (e.version ? ' (versión ' + e.version + ')' : ''));
    if (e.campos) decir('  el color de sus líneas en ese mail: ' + e.campos);
    if (e.notas.length) decir('  ' + notasTextoAgenda_(d).replace(/^ \| /, ''));
    if (e.tiempo) decir('  el tiempo: ' + e.tiempo);
    decir('  → ' + (x.decision === 'suspender' ? 'SE SUSPENDERÍA' : x.decision));
  });
  if (!evs.length) {
    decir('ninguna reunión del mail cancela esta fila (ni desaparecida ni en rojo entero, en el alcance ' + alcance.desc + ')');
    r.unicas.concat(r.desaparecidas).filter(function (ev) {
      return ev.fecha && f.fecha && ymd_(ev.fecha) === ymd_(f.fecha) && (!ev.figuraFila || !f.figura || normalizeText_(ev.figuraFila) === normalizeText_(f.figura));
    }).forEach(function (ev) {
      decir('  ese día en el mail: ' + _textoReunionAgenda_(ev) + ' | ' + ev.grupo + ' v' + ev.version + '/' + ev.versiones + ' | color: ' +
            (ev.colorMail ? (ev.colorMail.familia || 'sin fondo') + (ev.colorMail.campos ? ' — ' + ev.colorMail.campos : '') : 'no se sabe (sin HTML)') +
            (ev.canceladaEnMail ? ' | CANCELADA EN EL MAIL' : '') + notasTextoAgenda_(ev));
    });
  }
  const acciones = P.acciones.filter(function (a) { return a.tipo === 'suspender' && a.f && a.f.fila === fila; });
  out.suspenderia = acciones.length === 1;
  if (acciones.length === 1) out.motivo = acciones[0].detalle;
  Logger.log('>>> %s', out.suspenderia ? 'la cancelación del mail SUSPENDERÍA la fila ' + fila + ': ' + out.motivo : 'la fila ' + fila + ' NO se suspendería');
  if (enSeco) return fin(out);

  // --- REAL (paso 92): sólo esa suspensión, y sólo esas celdas ---
  if (acciones.length !== 1) { Logger.log('>>> NO SE ESCRIBE NADA: el plan no suspende la fila %s.', fila); out.error = 'el plan no suspende la fila'; return fin(out); }
  const a = acciones[0];
  const permitidas = [col('STATUS REUNIÓN'), col('agenda_status_escrito'), col('agenda_uid')];
  const ajena = a.escrituras.filter(function (e) { return e.fila !== fila || permitidas.indexOf(e.col) < 0; });
  if (ajena.length) { Logger.log('>>> NO SE ESCRIBE NADA: la suspensión tocaría otra cosa (%s).', JSON.stringify(ajena)); out.error = 'tocaría otra cosa'; return fin(out); }
  // 16/10 (revisor): si la fila no tiene agenda_uid, se lo estampa ESTA acción (en el plan entero lo ponía otra acción de la misma
  // fila, que acá no va): sin el uid, la nota del registro no se reconoce y la corrida de la hora la reactivaría
  const aF = Object.assign({}, a, { escrituras: a.escrituras.slice() });
  if (esVacio_(val('agenda_uid')) && !aF.escrituras.some(function (e) { return e.col === col('agenda_uid'); })) {
    aF.escrituras.push({ fila: fila, col: col('agenda_uid'), valor: uidAgenda_('vinculada'), esperado: '' });
  }
  // 16/10 (revisor): justo antes de escribir, la fila de nuevo (lectura fresca): la misma Figura, FECHA y agenda_uid que al planear
  const fresca = sh.getRange(fila, 1, 1, dest.hdr.length).getValues()[0];
  const igual = ['Figura', 'FECHA', 'agenda_uid'].every(function (n) {
    return A[n] == null || valorAgendaComparable_(fresca[A[n]], n) === valorAgendaComparable_(f.valores[A[n]], n);
  });
  if (!igual) { Logger.log('>>> NO SE ESCRIBE NADA: la fila %s cambió mientras se calculaba (Figura / FECHA / agenda_uid).', fila); out.error = 'la fila cambió'; return fin(out); }
  // sólo esta acción: sin las líneas del registro de otras reuniones (canceladas en el mail, elecciones) y el formato sólo en esta fila
  const planF = Object.assign({}, P, { acciones: [aF], yaCargadas: [], figuraPorDireccion: [], historial: null, canceladasMail: [],
                                       eleccionesUsadas: [], eleccionesSinFila: [], eleccionesCerradas: [],
                                       resumen: { mails: P.resumen.mails, reunionesEnAlcance: P.resumen.reunionesEnAlcance, suspender: 1 } });
  const destF = Object.assign({}, dest, { filas: [f] });
  const corrida = _idCorridaAgenda_();
  try { planF.escrito = aplicarPlanAgenda_(sh, destF, planF, corrida); }
  catch (err) { Logger.log('>>> %s', err && err.message || err); out.error = String(err && err.message || err); return fin(out); }
  _completarRegistroAgenda_(planF, t0);
  if (typeof guardianCopiaTrasEscritura_ === 'function') guardianCopiaTrasEscritura_('la suspensión a mano (paso 92)');   // apagado no hace nada
  out.corrida = corrida;
  out.escritas = planF.escrito.hechas.length;
  out.suspendida = planF.escrito.hechas.some(function (e) { return e.col === col('STATUS REUNIÓN'); });
  Logger.log('>>> corrida %s: %s', corrida, out.suspendida ? 'la fila ' + fila + ' quedó SUSPENDIDA (deshacer: paso 38 con esta corrida, deshacerAgenda(false, \'' + corrida + '\'))'
                                                          : 'NO se escribió: la celda ya no tenía lo esperado (alguien la cambió mientras corría)');
  if (out.suspendida && typeof registrarAviso_ === 'function') {
    try {
      registrarAviso_('suspendidas', _textoReunionAgenda_(a.ev) + ' | fila ' + fila + ' → Suspendida (' +
        (a.porRojo ? 'cancelada en el mail: ' + a.motivoRojo : 'salió del mail del ' + fmtFecha_(a.ev.mailQueLaSaco)) + '; paso 92, a mano)' + notasTextoAgenda_(a.ev));
    } catch (err) { Logger.log('>>> el aviso no se registró: %s', err); }
  }
  return fin(out);
}

/**
 * **E. La lista de STATUS de la base** (sólo lectura): la validación de datos de STATUS REUNIÓN (fila 2). `{ tipo, valores,
 * cancelada, otros, texto }`: `cancelada` si alguno dice "Cancelada"; `otros`, los que no son de los cinco que conoce el
 * sistema (CLAUDE.md 3.4). No cambia nada de lo que hace la agenda: sólo lo informa.
 */
function validacionStatusAgenda_(sh, A) {
  const out = { tipo: '', valores: [], cancelada: false, otros: [], texto: '' };
  try {
    if (A['STATUS REUNIÓN'] == null) { out.texto = 'la base no tiene la columna STATUS REUNIÓN'; return out; }
    const dv = sh.getRange(2, A['STATUS REUNIÓN'] + 1).getDataValidation();
    if (!dv) { out.texto = 'la columna no tiene validación de datos (fila 2): no hay lista'; return out; }
    out.tipo = String(dv.getCriteriaType());
    const c = dv.getCriteriaValues() || [];
    if (Array.isArray(c[0])) out.valores = c[0].map(str).filter(Boolean);
    else if (c[0] && typeof c[0].getValues === 'function') out.valores = c[0].getValues().map(function (x) { return str(x[0]); }).filter(Boolean);
    out.cancelada = out.valores.some(function (v) { return /cancelad/.test(normStatus_(v)); });
    const conocidos = ['en agenda', 'realizada', 'suspendida', 'reprogramada', 'se modifico el barrio'];
    out.otros = out.valores.filter(function (v) { return conocidos.indexOf(normStatus_(v)) < 0; });
    out.texto = out.tipo + ': ' + (out.valores.join(' | ') || '(sin valores)') + ' — ' +
      (out.cancelada ? 'EXISTE "Cancelada" en la lista (el sistema usa "Suspendida": decidir)' : 'no hay "Cancelada": el sistema usa "Suspendida"') +
      (out.otros.length ? ' | valores que el sistema no conoce (no los toca nunca): ' + out.otros.join(', ') : '');
  } catch (err) { out.texto = 'no se pudo leer la validación: ' + (err && err.message || err); }
  return out;
}

/** La geocodificación de los pasos 91 y 92: SÓLO la cache AGENDA_GEOCODE (no llama a Maps ni escribe la cache). */
function _geoSoloCacheCancelMail_() {
  let cache = null;
  return function (consulta) {
    if (!cache) { try { cache = _leerCacheGeocode_(); } catch (e) { cache = new Map(); } }
    return cache.get(consulta) || { consulta: consulta, estado: 'ERROR', lat: '', lng: '', detalle: 'no está en la cache (el paso no geocodifica)' };
  };
}
