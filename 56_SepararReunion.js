/**
 * 56_SepararReunion.js — SEPARAR "DOS REUNIONES EN UNA FILA" (19/10; prompt 08, punto 2; pasos 101, 102 y 103).
 *
 * El caso, confirmado por el equipo: Macri 15/10/2026. El 1 a 1 de Villa Santa Rita se SUSPENDIÓ (en rojo en el mail, v3 del 13/10)
 * y se hizo OTRO en Villa Devoto, que nunca estuvo en el mail. En RDV CONJUNTO están las dos, con la misma dirección (Bahía Blanca
 * 4025): 843 → Villa Santa Rita, "Cancelado"; 849 → Villa Devoto, "Realizada", 31 asistentes. La fila 824 de la base tiene el
 * agenda_uid de la reunión del mail (Villa Santa Rita) pero todos los datos de la de Villa Devoto (el barrio que cargó el equipo,
 * Realizada, los asistentes y oradores de la 849).
 *
 * **La opción más segura (la del prompt): la 824 conserva sus datos y se le saca la identidad del mail.**
 *   - la 824 (Villa Devoto, Realizada) se queda con todo; cambia sólo esto: se le vacían agenda_uid, las agenda_* y las columnas del
 *     mail (Evento / Lugar / Dirección / Marcas (mail), Conjunta con, No participa), que pasan a la fila nueva; "Origen fila" =
 *     "equipo"; "Tocado por el equipo" vacío (es de las filas de la agenda). La Dirección ("A CONFIRMAR…", la escribió el sistema)
 *     pasa a "Bahía Blanca 4025" SÓLO con `conDireccion` (el paso 101b / 102b), si el usuario lo aprueba al ver el seco;
 *   - una fila NUEVA, AL FINAL (nunca en el medio): la reunión del mail, Villa Santa Rita, Suspendida. Lo que la agenda había escrito
 *     (las agenda_*_escrita de la 824: FECHA, HORA, Dirección, Barrio) vuelve a ser su valor visible; Figura y EVENTO, los de la 824;
 *     STATUS "Suspendida" (por las dos transiciones de la agenda: '' → en agenda → Suspendida); el agenda_uid y las columnas del mail
 *     que salen de la 824; "Origen fila" = "sistema (agenda)". Sin asistentes, oradores, inscriptos, formularios ni IDs.
 * Todo por la excepción de la agenda (`escribirAgendaLote_`, CLAUDE.md §0): son todas columnas de la agenda, la lectura es fresca y
 * cada celda se escribe sólo si todavía tiene lo que el plan vio. Las derivadas (con la ID), recalculadas al final.
 *
 *   separarReunionAgenda_enSeco(opciones)  (paso 101, SÓLO LECTURA) el plan; lo que tiene la 824 (formularios, inscriptos, IDs,
 *                                          RDV_UID, asistentes: ¿de Villa Devoto o de Villa Santa Rita?); y LA SIMULACIÓN DE LA PRÓXIMA
 *                                          CORRIDA DE LA HORA COMPLETA (55_SimularCorrida.js) sobre la base de hoy y sobre la base
 *                                          separada, con TODAS las celdas que cambiarían. Si algo cambia fuera de la 824 y la fila nueva,
 *                                          o si la próxima corrida escribiría en ellas, o si algo de la 824 es de Villa Santa Rita:
 *                                          NO LISTO (no guarda la huella: el paso 102 no corre). Si está LISTO, guarda la HUELLA.
 *   separarReunionAgenda(opciones)         (paso 102, ESCRIBE la base) exige la huella del 101; con el bloqueo de la corrida de la hora;
 *                                          registro antes de escribir (REGISTRO_AGENDA_CAMBIOS, corrida "SEPARAR": el paso 38 no la toca).
 *   deshacerSepararReunionAgenda(enSeco)   (paso 103) vuelve la 824 a como estaba y saca la fila nueva (la borra si es la última; si
 *                                          no —p. ej. la base se ordenó—, la vacía). Encuentra cada fila por su identidad (el
 *                                          agenda_uid de la nueva; la 824 por su RDV_UID o figura + fecha + barrio), nunca por número.
 *
 * Por qué así y no al revés (la 824 = Villa Santa Rita y una fila nueva = Villa Devoto): los datos de la reunión que se hizo
 * (asistentes, oradores, formularios, IDs, la ID derivada, Looker) quedan donde están; lo único que se mueve es la identidad del
 * mail, que es del sistema. Las protecciones: el punto 3 del prompt (una Suspendida y su reemplazo no son "una reunión en dos filas",
 * `esSuspendidaYReemplazoAgenda_`) y que la agenda nunca vincula ni toca una fila del equipo que no es de la reunión del mail.
 */

const SEPARAR_PROP_HUELLA = 'SEPARAR_REUNION_HUELLA_101';
const SEPARAR_PROP_CORRIDA = 'SEPARAR_REUNION_CORRIDA_102';
/** El modo de su línea en REGISTRO_AGENDA: el paso 38 (deshacer la agenda) busca "ESCRITURA" y no la toca. */
const SEPARAR_MODO_REGISTRO = 'SEPARAR';
/** 19/10 (revisor): cuántas horas vale la huella del paso 101 para el 102. */
const SEPARAR_HUELLA_HORAS = 2;

/** El caso del prompt (los números del 19/10; la fila se encuentra por el agenda_uid, no por el número). */
const SEPARAR_CASO_MACRI_1510 = {
  nombre: 'Macri 15/10', fila: 824, figura: 'Jorge Macri', fecha: '2026-10-15', agendaUid: 'c-33a3fd0b-8836-420c-850e-99320fb5231f',
  barrioQueda: 'Villa Devoto', statusQueda: 'Realizada', barrioMail: 'Villa Santa Rita', hora: '09:15',
  direccionMail: 'A CONFIRMAR (NO SE COMUNICA LA DIRECCIÓN)', evento: 'Encuentro "1 a 1"', direccionPropuesta: 'Bahía Blanca 4025'
};

/** Las columnas que salen de la fila vieja y pasan a la nueva (la identidad del mail). */
const SEPARAR_COLUMNAS_MAIL_ = ['No participa', 'agenda_uid', 'agenda_mail', 'agenda_version', 'agenda_hora_escrita', 'agenda_direccion_escrita',
  'agenda_barrio_escrito', 'agenda_fecha_escrita', 'agenda_status_escrito', 'Evento (mail)', 'Lugar (mail)', 'Dirección (mail)', 'Marcas (mail)',
  'Conjunta con'];

// ===================== Los puntos de entrada =====================

/** Paso 101 (SÓLO LECTURA): el plan y la simulación de la próxima corrida completa. LISTO → guarda la huella. */
function separarReunionAgenda_enSeco(opciones) {
  return _separarReunion_(true, opciones || {});
}

/** Paso 102 (REAL): con el bloqueo de la corrida de la hora; exige la huella del paso 101. */
function separarReunionAgenda(opciones) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(ESPERA_BLOQUEO_MS)) {
    Logger.log('>>> Hay otra corrida (upsert o agenda) en curso: no se separa nada (LockService).');
    return { error: 'hay otra corrida en curso' };
  }
  try { return _separarReunion_(false, opciones || {}); }
  finally { lock.releaseLock(); }
}

function _separarReunion_(enSeco, opciones) {
  const t0 = Date.now();
  const caso = Object.assign({}, SEPARAR_CASO_MACRI_1510, opciones.caso || {});
  const conDireccion = !!opciones.conDireccion;
  const paso = enSeco ? (conDireccion ? '101b' : '101') : (conDireccion ? '102b' : '102');
  Logger.log('=== paso %s: separar "%s" en dos filas (%s)%s — %s ===', paso, caso.nombre, enSeco ? 'EN SECO, no escribe nada' : 'REAL: escribe la base',
             conDireccion ? ', CON la dirección "' + caso.direccionPropuesta + '" en la que queda' : '', descripcionHojaDestino_());
  const fin = function (o) { Logger.log('paso %s: %s ms', paso, Date.now() - t0); return o; };
  const sh = verificarHojaDestino_(ssDestino_());
  const bloque = opciones.bloque || sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const plan = planSepararReunion_(bloque, caso, conDireccion);
  logPlanSeparar_(plan, caso);
  if (plan.error) { Logger.log('>>> NO SE PUEDE: %s. No se escribe nada.', plan.error); return fin({ error: plan.error, plan: plan }); }

  if (enSeco) {
    const v = verificarSepararEnSeco_(bloque, plan, caso, opciones);
    const out = { huella: plan.huella, listo: v.listo, motivos: v.motivos, plan: plan, verificacion: v };
    if (v.listo) {
      try { PropertiesService.getScriptProperties().setProperty(SEPARAR_PROP_HUELLA, JSON.stringify({ h: plan.huella, t: Date.now() })); } catch (e) { Logger.log('  (la huella no se pudo guardar: %s)', e); }
      Logger.log('>>> LISTO. HUELLA del plan: %s (el paso %s la exige igual, dentro de las próximas ' + SEPARAR_HUELLA_HORAS + ' horas). Para aplicarlo: paso%s.', plan.huella, conDireccion ? '102b' : '102',
                 conDireccion ? '102b_separarMacri1510ConDireccion()' : '102_separarMacri1510()');
    } else {
      try { PropertiesService.getScriptProperties().deleteProperty(SEPARAR_PROP_HUELLA); } catch (e) { /* el log lo dice */ }
      Logger.log('>>> NO LISTO: %s. No se guarda la huella: el paso 102 no corre.', v.motivos.join(' | '));
    }
    return fin(out);
  }

  // --- REAL (paso 102) ---
  const no = function (msg) { Logger.log('>>> NO SE ESCRIBE NADA: %s', msg); return fin({ error: msg, plan: plan }); };
  // 19/10 (revisor): la huella vence a las SEPARAR_HUELLA_HORAS horas (la base y los formularios siguen moviéndose); no se puede pasar a mano
  let g = null;
  try { g = JSON.parse(PropertiesService.getScriptProperties().getProperty(SEPARAR_PROP_HUELLA) || 'null'); } catch (e) { g = null; }
  const huella101 = g && g.h ? g.h : '';
  if (huella101 && Date.now() - (g.t || 0) > SEPARAR_HUELLA_HORAS * 3600000) return no('la huella del paso 101 tiene más de ' + SEPARAR_HUELLA_HORAS + ' horas: volver a correr el paso 101');
  if (!huella101) return no('primero hay que correr el paso 101 (en seco) y que dé LISTO: el 102 exige que el plan sea el mismo que se vio');
  if (huella101 !== plan.huella) return no('la huella del plan es ' + plan.huella + ' y el paso 101 dio ' + huella101 + ': algo cambió (o se corrió el 101 con/sin la dirección), volver a correr el paso 101');
  const r = aplicarSepararReunion_(sh, plan, caso);
  if (r.error && !r.corrida) return no(r.error);
  // el id de la corrida ya quedó guardado antes de escribir (aplicarSepararReunion_); si se volvió atrás, ya no está
  try { PropertiesService.getScriptProperties().deleteProperty(SEPARAR_PROP_HUELLA); } catch (e) { /* una huella sirve una vez */ }
  return fin(Object.assign({ plan: plan }, r));
}

// ===================== El plan (en memoria) =====================

/**
 * **El plan de la separación**, sobre `bloque` (la base entera). Encuentra la fila vieja por su agenda_uid (una sola), verifica que
 * sea la del caso (figura, fecha, el barrio que queda, el STATUS) y que la reunión no esté ya separada, y arma las escrituras:
 * `viejas` (en la fila que queda) y `nueva` (la fila nueva, al final), cada una { fila, col, valor, esperado, nombre }. Devuelve
 * { fila (la vieja), filaNueva, viejas, nueva, statusNueva, datos (lo que tiene la vieja), huella, error }.
 */
function planSepararReunion_(bloque, caso, conDireccion) {
  const hdr = bloque[0];
  const out = { viejas: [], nueva: [], datos: {}, avisos: [], error: '' };
  const ix = function (n) { return findIdxOr_(hdr, aliasColumna_(n), true); };
  const A = indicesAgenda_(hdr);
  if (A.faltan.length) { out.error = 'faltan columnas de la agenda: ' + A.faltan.join(', '); return out; }
  const iFig = ix('Figura'), iFec = ix('FECHA'), iBar = ix('Barrio'), iSt = ix('STATUS REUNIÓN'), iUid = A.agenda_uid;
  const conUid = [];
  for (let i = 1; i < bloque.length; i++) if (str(bloque[i][iUid]) === caso.agendaUid) conUid.push(i + 1);
  if (conUid.length !== 1) {
    out.error = conUid.length ? 'el agenda_uid ' + caso.agendaUid + ' está en ' + conUid.length + ' filas (' + conUid.join(', ') + ')'
                              : 'ninguna fila tiene el agenda_uid ' + caso.agendaUid + ' (¿ya se separó? ver el paso 103)';
    return out;
  }
  const X = conUid[0], rx = bloque[X - 1];
  out.fila = X;
  if (X !== caso.fila) out.avisos.push('la fila con ese agenda_uid es la ' + X + ' (el caso decía ' + caso.fila + ': la base se ordenó o se borraron filas)');
  const v = function (n) { const k = n === 'Dirección' ? A['Dirección'] : (A[n] != null ? A[n] : ix(n)); return k == null ? '' : rx[k]; };
  const fecha = toDate_(rx[iFec]);
  const mal = [];
  if (normalizeText_(rx[iFig]) !== normalizeText_(caso.figura)) mal.push('Figura "' + str(rx[iFig]) + '" (se esperaba "' + caso.figura + '")');
  if (!fecha || ymd_(fecha) !== caso.fecha.replace(/-/g, '')) mal.push('FECHA ' + (fecha ? fmtFecha_(fecha) : '—') + ' (se esperaba ' + caso.fecha + ')');
  if (normalizeText_(_canonBarrioAg_(rx[iBar]) || rx[iBar]) !== normalizeText_(caso.barrioQueda)) mal.push('Barrio "' + str(rx[iBar]) + '" (se esperaba "' + caso.barrioQueda + '")');
  if (normStatus_(rx[iSt]) !== normStatus_(caso.statusQueda)) mal.push('STATUS "' + str(rx[iSt]) + '" (se esperaba "' + caso.statusQueda + '")');
  if (mal.length) { out.error = 'la fila ' + X + ' no es la del caso: ' + mal.join('; '); return out; }
  // ¿ya hay una fila de la reunión del mail (la misma figura y fecha, con el barrio del mail)?
  for (let i = 1; i < bloque.length; i++) {
    const f = toDate_(bloque[i][iFec]);
    if (i + 1 !== X && f && ymd_(f) === ymd_(fecha) && normalizeText_(bloque[i][iFig]) === normalizeText_(caso.figura) &&
        normalizeText_(_canonBarrioAg_(bloque[i][iBar]) || bloque[i][iBar]) === normalizeText_(caso.barrioMail)) {
      out.error = 'ya hay una fila de ' + caso.figura + ' del ' + fmtFecha_(fecha) + ' en ' + caso.barrioMail + ' (la ' + (i + 1) + '): no se crea otra';
      return out;
    }
  }
  // la fila nueva: la primera después de la última con datos (sin contar las derivadas), y tiene que estar vacía
  let ultima = 1;
  for (let i = bloque.length - 1; i >= 1; i--) {
    if (bloque[i].some(function (x, k) { return !esColumnaDerivada_(hdr[k]) && !esVacio_(x); })) { ultima = i + 1; break; }
  }
  const N = ultima + 1;
  out.filaNueva = N;
  // lo que tiene la vieja (para el informe y para la huella)
  out.datos = _datosFilaSeparar_(bloque, X);

  const col = function (n) { const k = n === 'Dirección' ? A['Dirección'] : (A[n] != null ? A[n] : ix(n)); return k == null ? null : k + 1; };
  const nombre = function (c) { return str(hdr[c - 1]); };
  const vieja = function (n, valor) {
    const c = col(n);
    if (c == null) return;
    const cur = rx[c - 1];
    if (valorAgendaComparable_(cur, n) === valorAgendaComparable_(valor, n) && !(esVacio_(valor) && !esVacio_(cur))) return;
    out.viejas.push({ fila: X, col: c, valor: valor, esperado: cur, nombre: nombre(c) });
  };
  const nueva = function (n, valor) {
    const c = col(n);
    if (c == null || esVacio_(valor)) return;
    out.nueva.push({ fila: N, col: c, valor: valor, esperado: '', nombre: nombre(c) });
  };
  // 1. la fila nueva: lo que la agenda había escrito (las trazas), o lo del caso si la traza está vacía
  const traza = function (n, t, porDefecto) { const x = v(t); return esVacio_(x) ? (esVacio_(porDefecto) ? v(n) : porDefecto) : x; };
  const fechaN = traza('FECHA', 'agenda_fecha_escrita', fecha);
  const horaN = traza('HORA', 'agenda_hora_escrita', caso.hora);
  const dirN = traza('Dirección', 'agenda_direccion_escrita', caso.direccionMail);
  const barEsc = v('agenda_barrio_escrito');
  const barN = !esVacio_(barEsc) && normalizeText_(_canonBarrioAg_(barEsc) || barEsc) === normalizeText_(caso.barrioMail) ? barEsc : caso.barrioMail;
  if (!esVacio_(barEsc) && barN !== barEsc) out.avisos.push('agenda_barrio_escrito de la ' + X + ' dice "' + str(barEsc) + '": la fila nueva va con "' + caso.barrioMail + '" (el barrio del mail)');
  nueva('Figura', rx[iFig]);
  nueva('EVENTO', esVacio_(v('EVENTO')) ? caso.evento : v('EVENTO'));
  nueva('FECHA', fechaN); nueva('agenda_fecha_escrita', fechaN);
  nueva('HORA', horaN); nueva('agenda_hora_escrita', horaN);
  nueva('Dirección', dirN); nueva('agenda_direccion_escrita', dirN);
  nueva('Barrio', barN); nueva('agenda_barrio_escrito', barN);
  ['No participa', 'agenda_uid', 'agenda_mail', 'agenda_version', 'Evento (mail)', 'Lugar (mail)', 'Dirección (mail)', 'Marcas (mail)', 'Conjunta con']
    .forEach(function (n) { nueva(n, v(n)); });
  nueva('agenda_status_escrito', 'Suspendida');
  nueva('Origen fila', ORIGEN_SISTEMA);
  out.statusNueva = { fila: N, col: col('STATUS REUNIÓN'), nombre: 'STATUS REUNIÓN' };
  // 2. la vieja: sin la identidad del mail; "Origen fila" = equipo; "Tocado por el equipo" vacío; la Dirección, sólo si se aprobó
  SEPARAR_COLUMNAS_MAIL_.forEach(function (n) { vieja(n, ''); });
  vieja('Origen fila', ORIGEN_EQUIPO);
  vieja('Tocado por el equipo', '');
  if (conDireccion) {
    // 19/10 (revisor, B3): sólo si la Dirección todavía es la que escribió el sistema (si el equipo cargó otra, no se pisa)
    if (valorAgendaComparable_(v('Dirección'), 'Dirección') !== valorAgendaComparable_(v('agenda_direccion_escrita'), 'Dirección')) {
      out.error = 'la Dirección de la fila ' + X + ' ("' + str(v('Dirección')) + '") no es la que escribió el sistema: la cargó el equipo, no se pisa (usar el paso sin la dirección)';
      return out;
    }
    vieja('Dirección', caso.direccionPropuesta);
  }
  out.conDireccion = conDireccion;
  // la huella: la identidad, toda la fila vieja como está y lo que se escribiría
  out.huella = _huellaSeparar_([caso.agendaUid, X, N, conDireccion ? 'dir' : '',
                                rx.map(function (x, k) { return valorAgendaComparable_(x, hdr[k]); }).join('¦'),
                                out.viejas.concat(out.nueva).map(function (e) { return e.fila + ':' + e.col + '=' + valorAgendaComparable_(e.valor, e.nombre); }).join(',')].join('#'));
  return out;
}

/** Lo que tiene la fila (para decir de qué reunión es cada cosa): RDV_UID, form_*, Inscriptos, IDs, Asistentes, oradores, Dirección. */
function _datosFilaSeparar_(bloque, fila) {
  const hdr = bloque[0], r = bloque[fila - 1], out = {};
  ['RDV_UID', 'form_origen', 'form_clave', 'form_score', 'form_nivel', 'Inscriptos', COLUMNA_ID_CUENTAS, COLUMNA_FECHA_ENVIO, 'Asistentes']
    .concat(COLUMNAS_ORADORES, ['Dirección', 'HORA', 'EVENTO', 'Origen fila', 'Tocado por el equipo', 'agenda_barrio_escrito', 'Lugar (mail)', COLUMNA_ID])
    .forEach(function (n) {
      const k = n === 'Dirección' ? findIdxOr_(hdr, ['direccion', 'dirección'], true) : findIdxOr_(hdr, aliasColumna_(n), true);
      if (k != null) out[n] = r[k];
    });
  return out;
}

/** Un hash corto (12 hex) de un texto. */
function _huellaSeparar_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(s), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('').slice(0, 12);
}

/** El plan en el log: qué cambia en la vieja, qué tendría la nueva. */
function logPlanSeparar_(p, caso) {
  if (p.error) return;
  Logger.log('--- el plan ---');
  Logger.log('  la fila que QUEDA: %s (%s %s, %s, %s) — conserva todos sus datos; cambia:', p.fila, caso.figura, caso.fecha, caso.barrioQueda, caso.statusQueda);
  p.viejas.forEach(function (e) { Logger.log('    %s: "%s" → "%s"', e.nombre, _txtSim_(e.esperado), _txtSim_(e.valor)); });
  Logger.log('  la fila NUEVA, al final: %s (la reunión del mail, %s, Suspendida):', p.filaNueva, caso.barrioMail);
  p.nueva.forEach(function (e) { Logger.log('    %s = "%s"', e.nombre, _txtSim_(e.valor)); });
  Logger.log('    STATUS REUNIÓN = "Suspendida" (por las transiciones de la agenda: "" → en agenda → Suspendida)');
  p.avisos.forEach(function (a) { Logger.log('  AVISO: %s', a); });
}

// ===================== La verificación del seco (la simulación completa) =====================

/**
 * Lo que decide si el paso 102 puede correr (el seco del paso 101):
 *   (e) de qué reunión son el formulario, los inscriptos, el ID y los asistentes de la vieja (si algo es de la reunión del mail, la
 *       de Villa Santa Rita, NO LISTO: lo decide el usuario);
 *   la base separada en memoria (con las derivadas de las dos filas recalculadas, como hace el paso 102);
 *   la próxima corrida de la hora SIMULADA dos veces —sobre la base de hoy y sobre la separada— y todas las celdas que cambiarían;
 *   NO LISTO si cambia algo fuera de las dos filas, si la próxima corrida escribiría en ellas, si la agenda las ve como "una reunión
 *   en dos filas", ambigua o duplicada (protecciones a, b, c), si alguna simulación quedó incompleta, o si la ID derivada de las dos
 *   no es la esperada (f). También dice a qué fila iría cada fila de RDV CONJUNTO de ese día (d) y qué diría la auditoría (g).
 */
function verificarSepararEnSeco_(bloque, plan, caso, opciones) {
  const motivos = [];
  const X = plan.fila, N = plan.filaNueva, hdr = bloque[0];
  // la base separada, en memoria
  const sep = aplicarSepararEnBloque_(bloque, plan);
  // (e) de qué reunión es cada cosa de la vieja
  const E = entradasSimulacion_(Object.assign({ bloque: bloque }, opciones.simulacion || {}));
  const e = _origenDatosSeparar_(plan, caso, E);
  Logger.log('--- (e) lo que tiene la fila %s, ¿de qué reunión es? ---', X);
  e.lineas.forEach(function (t) { Logger.log('    %s', t); });
  if (e.deLaOtra.length) motivos.push('la fila ' + X + ' tiene algo de la reunión de ' + caso.barrioMail + ': ' + e.deLaOtra.join('; ') + ' (decidir antes de seguir)');
  // las derivadas de las dos filas, como las deja el paso 102 (recalcDerivadas_ sobre toda la base)
  const der = derivadasDeFilasSeparar_(sep, E, [X, N]);
  der.forEach(function (d) { sep[d.fila - 1][d.col - 1] = d.valor; });
  Logger.log('--- las derivadas que recalcula el paso 102 en las dos filas: %s ---', der.length);
  der.forEach(function (d) { Logger.log('    fila %s %s = "%s"', d.fila, d.nombre, _txtSim_(d.valor)); });
  // (f) la ID derivada de las dos
  const kId = findIdxOr_(hdr, [COLUMNA_ID], true);
  if (kId != null && lookerEnSistema_()) {
    const idX = str(sep[X - 1][kId]), idN = str(sep[N - 1][kId]);
    const espX = idBaseDeFila_(caso.figura, caso.barrioQueda, toDate_(caso.fecha)), espN = idBaseDeFila_(caso.figura, caso.barrioMail, toDate_(caso.fecha));
    Logger.log('--- (f) la ID derivada: fila %s "%s" | fila nueva %s "%s" ---', X, idX, N, idN);
    if (idX !== espX || idN !== espN) motivos.push('la ID derivada no es la esperada ("' + espX + '" / "' + espN + '")');
  }
  // la simulación de la próxima corrida, sobre las dos bases
  Logger.log('--- la próxima corrida de la hora, simulada sobre la base de HOY y sobre la SEPARADA (lecturas: %s ms; %s) ---', E.leidoMs,
             Object.keys(E.tiempos).map(function (k) { return k + ' ' + E.tiempos[k]; }).join(', '));
  E.avisos.forEach(function (a) { Logger.log('  AVISO de lectura: %s', a); motivos.push('no se pudo leer: ' + a); });
  const S0 = simularCorridaHora_(bloque, E, opciones.simulacion);
  const S1 = simularCorridaHora_(sep, E, opciones.simulacion);
  logSimulacion_(S1, 'con la base SEPARADA');
  if (S0.incompleta || S1.incompleta) motivos.push('la simulación quedó INCOMPLETA por tiempo (desde "' + (S0.incompleta || S1.incompleta) + '"): volver a correr el paso 101');
  const faltan = ['agenda', 'cruce', 'derivadas', 'ids', 'looker'].filter(function (p) {
    const activa = p === 'agenda' ? AGENDA_ACTIVA : p === 'derivadas' ? DERIVADAS_POR_SCRIPT : p === 'ids' ? IDS_EN_LA_HORA : p === 'looker' ? lookerEnSistema_() : true;
    return activa && S1.partes.indexOf(p) < 0;
  });
  if (faltan.length) motivos.push('no se simuló: ' + faltan.join(', '));
  const cmp = compararSimulaciones_(S0, S1, { excluirA: new Set([X]), excluirB: new Set([X, N]), filasOriginalesA: N - 1,
                                              mapaB: function (f) { return f < N ? f : null; } });
  Logger.log('--- FUERA DE LO ESPERADO (todo lo que cambia entre las dos simulaciones fuera de las filas %s y %s) ---', X, N);
  const fuera = cmp.soloEnB.map(function (c) { return 'aparece: ' + textoCambioSim_(c, S1.bloqueFinal); })
    .concat(cmp.soloEnA.map(function (c) { return 'deja de pasar: ' + textoCambioSim_(c, S0.bloqueFinal); }))
    .concat(cmp.borrar.soloEnB.map(function (k) { return 'la agenda borraría ' + k; }), cmp.borrar.soloEnA.map(function (k) { return 'la agenda ya no borraría ' + k; }))
    .concat(cmp.looker ? cmp.looker.soloEnB.concat(cmp.looker.soloEnA).filter(function (x) { return !_lookerDeFilasSeparar_(x, caso); })
                           .map(function (x) { return 'Looker: ' + x.slice(0, 160); }) : []);
  fuera.forEach(function (t) { Logger.log('    %s', t); });
  if (!fuera.length) Logger.log('    nada: fuera de esas dos filas, la próxima corrida hace exactamente lo mismo.');
  if (fuera.length) motivos.push(fuera.length + ' cambios fuera de las filas ' + X + ' y ' + N);
  // la próxima corrida no puede escribir en las dos filas (ni la agenda, ni el cruce, ni los IDs: la separación es final)
  Logger.log('--- lo que la próxima corrida escribiría en las filas %s y %s (se espera NADA) ---', X, N);
  cmp.enExcluidas.forEach(function (c) { Logger.log('    %s', textoCambioSim_(c, S1.bloqueFinal)); });
  if (!cmp.enExcluidas.length) Logger.log('    nada.');
  else motivos.push('la próxima corrida escribiría ' + cmp.enExcluidas.length + ' celdas en las filas ' + X + '/' + N + ' (' +
                    cmp.enExcluidas.map(function (c) { return c.parte + ' ' + c.nombre; }).join(', ') + ')');
  if (cmp.borrar.enExcluidas.length) motivos.push('la agenda borraría la fila ' + cmp.borrar.enExcluidas.map(function (b) { return b.fila; }).join(', '));
  // (a, b, c) la agenda y las dos filas
  const P = S1.P || {};
  const toca = function (fs) { return (fs || []).some(function (f) { const n = f && (f.fila || f); return n === X || n === N; }); };
  const agenda = [];
  (P.dosFilas || []).forEach(function (p) { if (toca([p.a, p.b])) agenda.push('"una reunión en dos filas": ' + p.texto); });
  (P.invariante || []).forEach(function (x) { if (toca(x.filas)) agenda.push('H3: ' + x.texto); });
  (P.ambiguas || []).forEach(function (x) { if (toca(x.filas)) agenda.push('ambigua: ' + x.motivo); });
  (P.duplicados || []).forEach(function (x) { if (toca((x.candidatas || []).map(function (c) { return c.f; })) || (x.par && toca([x.par.a, x.par.b]))) agenda.push('AGENDA_DUPLICADOS: ' + x.tipo); });
  (P.cancelNoAplicada || []).forEach(function (x) { if (toca([x.f])) agenda.push('aviso de cancelación: ' + x.motivo); });
  (P.acciones || []).forEach(function (a) { const n = a.fila || (a.f && a.f.fila); if (n === X || n === N) agenda.push('acción ' + a.tipo + ' en la fila ' + n); });
  Logger.log('--- (a, b, c) la agenda y las dos filas ---');
  const ev = (E.r ? E.r.unicas : []).filter(function (x) { return x.fecha && ymd_(x.fecha) === caso.fecha.replace(/-/g, '') && normalizeText_(x.figuraFila) === normalizeText_(caso.figura); });
  ev.forEach(function (x) {
    const fd = P.filaDe ? P.filaDe.get(x.clave) : null;
    const ce = (P.cancelacionesEvaluadas || []).filter(function (c) { return c.d && c.d.clave === x.clave; }).map(function (c) { return c.decision; });
    Logger.log('    la reunión del mail %s → fila %s%s%s', _textoReunionAgenda_(x), fd && fd.fila ? fd.fila : '(ninguna)', x.canceladaEnMail ? ' | en ROJO: ' + x.canceladaEnMailMotivo : '',
               ce.length ? ' | cancelación: ' + ce.join('; ') : '');
    if (!fd || fd.fila !== N) agenda.push('la reunión del mail ' + _textoReunionAgenda_(x) + ' no queda en la fila nueva (' + (fd && fd.fila ? fd.fila : 'ninguna') + ')');
  });
  if (!ev.length) Logger.log('    (los mails no traen la reunión de %s del %s: la agenda no la mira)', caso.figura, caso.fecha);
  agenda.forEach(function (t) { Logger.log('    NO: %s', t); });
  if (!agenda.length) Logger.log('    nada: la agenda no vincula, actualiza, concilia, suspende ni avisa nada de las dos filas.');
  else motivos.push('la agenda: ' + agenda.join(' | '));
  // 19/10 (revisor, B7): qué hace el cruce con formularios con cada una (no escribe nada en ellas —eso ya se miró arriba—, pero la
  // nueva, Suspendida y sin formulario, puede aparecer en las fichas de REVISAR_MATCH o en SIN_MATCH como cualquier fila sin formulario)
  Logger.log('--- el cruce con formularios, en las dos filas (informativo) ---');
  [[X, 'la que queda'], [N, 'la nueva']].forEach(function (p) {
    const pf = S1.plan && S1.plan.porFila ? S1.plan.porFila[p[0]] : null;
    Logger.log('    fila %s (%s): %s%s', p[0], p[1], pf ? pf.veredicto : '(sin veredicto: no es activa)', pf && pf.motivo ? ' (' + pf.motivo + ')' : '');
  });
  // (d) RDV CONJUNTO de ese día: a qué fila iría cada una
  Logger.log('--- (d) RDV CONJUNTO de %s del %s, con la base separada ---', caso.figura, caso.fecha);
  _conjuntoDelDiaSeparar_(S1, E, caso).forEach(function (t) { Logger.log('    %s', t); });
  // (g) la auditoría
  Logger.log('--- (g) la auditoría (paso 66) con la base separada ---');
  Logger.log('    fila %s: sin agenda_uid, Origen fila "%s", %s → "fila del equipo fuera del mail: OK"', X, ORIGEN_EQUIPO, caso.statusQueda);
  Logger.log('    la reunión del mail del %s → la fila nueva %s, Suspendida (el mail la cancela en rojo) → OK', caso.fecha, N);
  Logger.log('    (para verlo en la auditoría, después del paso 102: paso66b_auditoriaSemanaPasada(), la semana del 12/10)');
  return { listo: !motivos.length, motivos: motivos, S0: S0, S1: S1, cmp: cmp, sep: sep, origenDatos: e };
}

/** La base con la separación aplicada, en memoria (las dos transiciones de STATUS en una). */
function aplicarSepararEnBloque_(bloque, plan) {
  const sep = bloque.map(function (r) { return r.slice(); });
  const ancho = sep[0].length;
  while (sep.length < plan.filaNueva) sep.push(new Array(ancho).fill(''));
  plan.viejas.concat(plan.nueva).forEach(function (e) { sep[e.fila - 1][e.col - 1] = e.valor; });
  if (plan.statusNueva.col) sep[plan.filaNueva - 1][plan.statusNueva.col - 1] = 'Suspendida';
  return sep;
}

/** Las derivadas que cambian en esas filas (el mismo cálculo que `recalcDerivadas_`). [{ fila, col, nombre, valor }] */
function derivadasDeFilasSeparar_(bloque, E, filas) {
  if (!DERIVADAS_POR_SCRIPT) return [];
  const hdr = bloque[0];
  const ctx = ctxDerivadasDeBloque_(bloque, E.tablaComunas);
  ctx.f1 = E.f1 || hdr.map(function () { return ''; }); ctx.f2 = E.f2 || hdr.map(function () { return ''; });
  const kId = lookerEnSistema_() ? findIdxOr_(hdr, [COLUMNA_ID], true) : null;
  if (kId != null) ctx.cols[COLUMNA_ID] = kId;
  const fx = _formulasDerivadas_(ctx);
  if (kId != null && !fx[COLUMNA_ID].tipo && E.idConFormula) fx[COLUMNA_ID] = { col: kId + 1, tipo: 'por_fila', formula: 'fórmulas' };
  const dc = derivadasQueCambian_(ctx, fx, kId), out = [];
  Object.keys(dc.tramos).forEach(function (n) {
    dc.tramos[n].forEach(function (t) {
      t.valores.forEach(function (v, j) { if (filas.indexOf(t.desde + j) >= 0) out.push({ fila: t.desde + j, col: ctx.cols[n] + 1, nombre: n, valor: v }); });
    });
  });
  return out;
}

/** ¿Esta fila de Looker (texto) es de una de las dos reuniones? (lo esperado: cambian las filas de la ID de las dos). */
function _lookerDeFilasSeparar_(x, caso) {
  const f = toDate_(caso.fecha);
  return [caso.barrioQueda, caso.barrioMail].some(function (b) { return x.indexOf(idBaseDeFila_(caso.figura, b, f)) >= 0; }) ||
         x.indexOf(idBaseDeFila_(caso.figura, '', f)) >= 0;
}

/** (e) De qué reunión es cada cosa de la vieja: el formulario (por su nombre), el ID (por la lista), los asistentes (RDV CONJUNTO). */
function _origenDatosSeparar_(plan, caso, E) {
  const d = plan.datos, out = { lineas: [], deLaOtra: [] };
  const es = function (texto) {
    const t = normalizeText_(texto);
    if (!t) return '';
    if (t.indexOf(normalizeText_(caso.barrioMail)) >= 0) return caso.barrioMail;
    if (t.indexOf(normalizeText_(caso.barrioQueda)) >= 0) return caso.barrioQueda;
    const c = detectComuna_(texto);
    return c != null ? 'Comuna ' + c + ' (no distingue: ' + caso.barrioQueda + ' y ' + caso.barrioMail + ' son de la ' + (_comunaBarrioAg_(caso.barrioQueda) === c ? 'misma comuna' : 'Comuna ' + _comunaBarrioAg_(caso.barrioQueda) + ' y ' + _comunaBarrioAg_(caso.barrioMail)) + ')' : 'no dice el lugar';
  };
  const marcar = function (que, lugar) {
    out.lineas.push(que + ' → ' + (lugar || '—'));
    if (lugar === caso.barrioMail) out.deLaOtra.push(que);
  };
  out.lineas.push('RDV_UID: ' + (str(d.RDV_UID) || '(vacío)') + ' | form_score ' + _txtSim_(d.form_score) + ' | form_nivel ' + _txtSim_(d.form_nivel));
  if (!esVacio_(d.form_origen)) marcar('formulario "' + str(d.form_origen) + '" (form_clave ' + _txtSim_(d.form_clave) + ')', es(d.form_origen));
  else out.lineas.push('formulario: ninguno (form_origen vacío)');
  out.lineas.push('Inscriptos: ' + _txtSim_(d.Inscriptos) + (esVacio_(d.Inscriptos) ? '' : ' (son del formulario de arriba)'));
  const id = str(d[COLUMNA_ID_CUENTAS]);
  if (id) {
    const regs = E.listaIds ? E.listaIds.registros.filter(function (r) { return r.id === normIdIds_(id); }) : [];
    if (!E.listaIds) marcar('ID cuentas ' + id + ' (la lista no se leyó)', '');
    else if (!regs.length) marcar('ID cuentas ' + id + ' (no está en la lista)', '');
    regs.forEach(function (r) { marcar('ID cuentas ' + id + ' (lista "' + r.solapa + '" fila ' + r.filaLista + ': "' + r.funcionario + '", "' + r.lugarTexto + '", ' + r.fechaTexto + ')', es(r.lugarTexto)); });
  } else out.lineas.push('ID cuentas: (vacío)');
  out.lineas.push('Asistentes ' + _txtSim_(d.Asistentes) + ' | ' + COLUMNAS_ORADORES.map(function (n) { return n + ' ' + _txtSim_(d[n]); }).join(' | '));
  out.lineas.push('Dirección "' + _txtSim_(d['Dirección']) + '" | HORA ' + _txtSim_(d.HORA) + ' | EVENTO "' + _txtSim_(d.EVENTO) + '" | Origen fila "' + _txtSim_(d['Origen fila']) +
                  '" | Tocado por el equipo "' + _txtSim_(d['Tocado por el equipo']) + '" | agenda_barrio_escrito "' + _txtSim_(d.agenda_barrio_escrito) +
                  '" | Lugar (mail) "' + _txtSim_(d['Lugar (mail)']) + '" | ID "' + _txtSim_(d[COLUMNA_ID]) + '"');
  return out;
}

/** (d) Las filas de RDV CONJUNTO de la figura ese día y a qué fila de la base van (con la base separada). */
function _conjuntoDelDiaSeparar_(S, E, caso) {
  const out = [];
  const a = S.asis;
  if (!a || !a.valores) return ['(RDV CONJUNTO no se cruzó en la simulación)'];
  const hdr = a.valores[0];
  const iFec = findIdxOr_(hdr, ['fecha', 'fecha (fecha)', 'fecha_evento', 'fecha reunion', 'fecha reunión', 'fecha_reunion', 'fecha_reunión', 'fecha evento'], true);
  const iBar = findIdxOr_(hdr, ['barrion', 'barrio'], true), iEst = findIdxOr_(hdr, ['estado'], true);
  const yd = caso.fecha.replace(/-/g, '');
  for (let i = 1; i < a.valores.length; i++) {
    const r = a.valores[i], f = toDate_(r[iFec]);
    if (!f || ymd_(f) !== yd) continue;
    const fp = figuraPorTokens_(str(r[a.iFig]));
    if (normalizeText_(fp.figura) !== normalizeText_(caso.figura)) continue;
    const fila = a.parDe.get(i + 1);
    const tomada = fila && a.porFila.get(fila) && a.porFila.get(fila).filaConjunto === i + 1;
    out.push('RDV CONJUNTO fila ' + (i + 1) + ' (' + str(iBar != null ? r[iBar] : '') + (iEst != null ? ', ' + str(r[iEst]) : '') + ', asistentes ' + _txtSim_(r[a.iAsi]) + ') → ' +
             (fila ? 'fila ' + fila + (tomada ? ' (sus asistentes valen para esa fila; sólo se escriben si la celda está vacía)' : ' (no aporta asistentes)') : 'ninguna'));
  }
  return out.length ? out : ['(ninguna fila de RDV CONJUNTO de esa figura ese día)'];
}

// ===================== La escritura (paso 102) =====================

/**
 * **La separación, en la base** (con el bloqueo ya tomado). (1) lectura fresca de la vieja: igual a lo que vio el plan; la nueva,
 * vacía; (2) el registro, OBLIGATORIO, antes de escribir (REGISTRO_AGENDA, modo SEPARAR; REGISTRO_AGENDA_CAMBIOS: cada celda, la
 * nota "separada" y la nota "suspendida_rojo" de la nueva); (3) la fila nueva (las dos transiciones de STATUS), (4) la vieja,
 * (5) los formatos, las derivadas y la verificación. Devuelve { corrida, celdas, error }.
 */
function aplicarSepararReunion_(sh, plan, caso) {
  const out = { corrida: '', celdas: 0, error: '' };
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const nCols = hdr.length;
  const X = plan.fila, N = plan.filaNueva;
  const fresca = sh.getRange(X, 1, 1, nCols).getValues()[0], fondos = sh.getRange(X, 1, 1, nCols).getBackgrounds()[0];
  const cambio = plan.viejas.filter(function (e) { return valorAgendaComparable_(fresca[e.col - 1], e.nombre) !== valorAgendaComparable_(e.esperado, e.nombre); });
  if (cambio.length) { out.error = 'la fila ' + X + ' cambió desde el plan: ' + cambio.map(function (e) { return e.nombre; }).join(', '); return out; }
  if (N <= sh.getLastRow()) {
    const vN = sh.getRange(N, 1, 1, nCols).getValues()[0];
    const lleno = vN.map(function (x, k) { return esColumnaDerivada_(hdr[k]) || esVacio_(x) ? '' : hdr[k]; }).filter(Boolean);
    if (lleno.length) { out.error = 'la fila ' + N + ' (la nueva) no está vacía: ' + lleno.join(', '); return out; }
  }
  // 2. el registro
  const corrida = _idCorridaAgenda_();
  const idVieja = _identidadViejaSeparar_(plan, caso);
  const lineas = plan.viejas.map(function (e) {
    return [corrida, 'separar', X, e.col, e.nombre, _celdaRegistro_(e.esperado), _celdaRegistro_(e.valor), fondos[e.col - 1] || '', idVieja];
  }).concat(plan.nueva.map(function (e) {
    return [corrida, 'separar_crear', N, e.col, e.nombre, '', _celdaRegistro_(e.valor), '', caso.agendaUid];
  })).concat([
    [corrida, 'separar_crear', N, plan.statusNueva.col, 'STATUS REUNIÓN', '', 'Suspendida', '', caso.agendaUid],
    [corrida, 'separada', N, '', 'fila ' + X, 'separada del ' + X + ' (' + caso.nombre + '): la ' + X + ' queda como ' + caso.barrioQueda + ' (' + caso.statusQueda +
     ', del equipo) y esta fila es la reunión del mail (' + caso.barrioMail + ', Suspendida)', idReunionDeCasoSeparar_(caso, plan), '', caso.agendaUid],
    [corrida, 'suspendida_rojo', N, '', '', 'separada del ' + X + ': la reunión del mail está en rojo (suspendida)', idReunionDeCasoSeparar_(caso, plan), '', caso.agendaUid]
  ]);
  try {
    _anotarCambiosAgenda_(lineas);
    _conReintentosAgenda_('REGISTRO_AGENDA', function () {
      const r = _hojaRegistroAgenda_(registrosAgenda_());
      r.appendRow([corrida, new Date(), SEPARAR_MODO_REGISTRO, '', '', 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, lineas.length - 2, '', 0, 0,
                   'separar ' + caso.nombre + ': fila ' + X + ' → nueva ' + N + ' (deshacer: paso 103)', 0, 0, 0, 0]);
      SpreadsheetApp.flush();
    });
  } catch (err) { out.error = 'no se pudo escribir REGISTRO_AGENDA (' + err + '): NO se escribió nada en la base'; return out; }
  out.corrida = corrida;
  // 19/10 (revisor): el id, ANTES de escribir (si la ejecución muere en el medio, el paso 103 lo encuentra)
  Logger.log('  corrida %s: escribiendo (si algo falla, deshacer con el paso 103)', corrida);
  try { PropertiesService.getScriptProperties().setProperty(SEPARAR_PROP_CORRIDA, corrida); } catch (e) { Logger.log('  (el id no se pudo guardar: %s)', e); }
  // 3. la fila nueva (todas sus celdas, y el STATUS por las dos transiciones de la agenda), 4. la vieja. 19/10 (revisor): si algo
  // falla en el medio, se vuelve atrás lo que se llegó a escribir (la vieja a lo que tenía; la nueva, sacada): nunca dos filas con el
  // mismo agenda_uid ni la reunión sin fila
  let hechas = 0, w1 = { hechas: [], saltadas: [] }, w2 = { hechas: [], saltadas: [] }, w3 = { hechas: [], saltadas: [] };
  try {
    w1 = escribirAgendaLote_(sh, hdr, plan.nueva.concat([{ fila: N, col: plan.statusNueva.col, valor: 'en agenda', esperado: '' }]));
    w2 = escribirAgendaLote_(sh, hdr, [{ fila: N, col: plan.statusNueva.col, valor: 'Suspendida', esperado: 'en agenda' }]);
    w3 = escribirAgendaLote_(sh, hdr, plan.viejas);
  } catch (err) {
    Logger.log('>>> la escritura falló a la mitad: %s. Se vuelve atrás lo escrito.', err && err.message || err);
    try {
      deshacerAgendaLote_(sh, hdr, w3.hechas.map(function (e) { return { fila: X, col: e.col, antes: e.antes, despues: e.valor, fondoAntes: e.fondoAntes }; }));
      if (w1.hechas.length) sacarFilasCreadasAgenda_(sh, [N], N);
      SpreadsheetApp.flush();
      _anotarCambiosAgenda_([[corrida, 'separar_fallo', N, '', '', String(err && err.message || err).slice(0, 500), '', '', caso.agendaUid]]);
      registrosAgenda_().getSheetByName(RDV_HOJA_REGISTRO_AGENDA).appendRow([corrida + '-deshacer', new Date(), 'DESHACER ' + corrida, '', '', '', '', '', '', '', '', '', '',
                                                                            '', '', '', 0, 'falló a la mitad: vuelto atrás', 0, 0, '', '', '', '', '']);
      PropertiesService.getScriptProperties().deleteProperty(SEPARAR_PROP_CORRIDA);
    } catch (e2) { Logger.log('>>> ### Y NO SE PUDO VOLVER ATRÁS: %s. Mirar las filas %s y %s a mano (corrida %s). ###', e2, X, N, corrida); }
    out.error = 'la escritura falló a la mitad (' + (err && err.message || err) + '); se volvió atrás lo escrito';
    return out;
  }
  hechas = w1.hechas.length + w2.hechas.length + w3.hechas.length;
  const saltadas = w1.saltadas.concat(w2.saltadas, w3.saltadas);
  try { formatearColumnasAgenda_(sh, hdr, [N]); } catch (err) { Logger.log('    el formato de las columnas de traza no se pudo poner: %s', err); }
  if (AGENDA_COPIAR_FORMATO) {
    try { copiarFormatoNumericoAgenda_(sh, N - 1, [N]); } catch (err) { Logger.log('    el formato de la fila nueva no se copió: %s', err); }
  }
  SpreadsheetApp.flush();
  if (DERIVADAS_POR_SCRIPT) {
    try { recalcDerivadas_(RDV_HOJA_DESTINO, true); } catch (err) { Logger.log('>>> las derivadas NO se recalcularon: %s (lo demás ya quedó)', err); }
  }
  if (typeof guardianCopiaTrasEscritura_ === 'function') guardianCopiaTrasEscritura_('separar la reunión (paso 102)');   // apagado no hace nada
  // 5. la verificación
  const vx = sh.getRange(X, 1, 1, nCols).getValues()[0], vn = sh.getRange(N, 1, 1, nCols).getValues()[0];
  const falta = plan.viejas.filter(function (e) { return valorAgendaComparable_(vx[e.col - 1], e.nombre) !== valorAgendaComparable_(e.valor, e.nombre); })
    .concat(plan.nueva.filter(function (e) { return valorAgendaComparable_(vn[e.col - 1], e.nombre) !== valorAgendaComparable_(e.valor, e.nombre); }));
  if (normStatus_(vn[plan.statusNueva.col - 1]) !== 'suspendida') falta.push({ fila: N, nombre: 'STATUS REUNIÓN' });
  out.celdas = hechas;
  Logger.log('>>> corrida %s: %s celdas escritas (saltadas porque ya no tenían lo esperado: %s). Fila %s = %s (del equipo); fila %s = la reunión del mail (%s, Suspendida).',
             corrida, hechas, saltadas.length, X, caso.barrioQueda, N, caso.barrioMail);
  if (falta.length) {
    out.error = 'quedaron sin escribir: ' + falta.map(function (e) { return 'fila ' + e.fila + ' ' + e.nombre; }).join(', ') + ' — revisar y, si hace falta, deshacer (paso 103)';
    Logger.log('>>> ATENCIÓN: %s', out.error);
  } else Logger.log('    verificado: las dos filas quedaron como el plan. Deshacer: paso 103 (deshacerSepararReunionAgenda, corrida %s).', corrida);
  return out;
}

/** La identidad de la vieja en el registro (para encontrarla al deshacer, aunque la base se haya ordenado): RDV_UID o figura|fecha|barrio. */
function _identidadViejaSeparar_(plan, caso) {
  const rdv = str(plan.datos.RDV_UID);
  return rdv ? 'rdv:' + rdv : 'id:' + normalizeText_(caso.figura) + '|' + caso.fecha.replace(/-/g, '') + '|' + normalizeText_(caso.barrioQueda);
}

/** El id de la reunión del mail (como `idReunionAgenda_`: figura|yyyyMMdd|hora). */
function idReunionDeCasoSeparar_(caso, plan) {
  const h = (plan.nueva.filter(function (e) { return normalizeHeader_(e.nombre) === 'hora'; })[0] || {}).valor;
  return normalizeText_(caso.figura) + '|' + caso.fecha.replace(/-/g, '') + '|' + (valorAgendaComparable_(h, 'HORA') || caso.hora);
}

// ===================== Deshacer (paso 103) =====================

/**
 * **Deshace la separación** (la corrida del paso 102 guardada en SEPARAR_PROP_CORRIDA, o `corrida`): la vieja vuelve a lo que tenía
 * (sus celdas, con sus fondos, sólo si todavía tienen lo que escribió el paso 102) y la fila nueva sale (borrada si es la última con
 * datos; si no, vaciada). Las dos filas se encuentran por su identidad. Si algo cambió desde la separación (la nueva recibió otro
 * dato, una celda de la vieja ya no tiene lo escrito), NO deshace nada y lo dice. En seco, sólo dice qué haría.
 */
function deshacerSepararReunionAgenda(enSeco, corrida) {
  const lock = enSeco ? null : LockService.getScriptLock();
  if (lock && !lock.tryLock(ESPERA_BLOQUEO_MS)) { Logger.log('>>> Hay otra corrida en curso: no se deshace nada.'); return { error: 'hay otra corrida en curso' }; }
  try { return _deshacerSeparar_(!!enSeco, corrida); }
  finally { if (lock) lock.releaseLock(); }
}

function _deshacerSeparar_(enSeco, corrida) {
  const t0 = Date.now();
  let id = corrida || '';
  if (!id) { try { id = PropertiesService.getScriptProperties().getProperty(SEPARAR_PROP_CORRIDA) || ''; } catch (e) { id = ''; } }
  Logger.log('=== paso 103: deshacer la separación %s (%s) ===', id || '(ninguna guardada)', enSeco ? 'EN SECO' : 'REAL');
  if (!id) { Logger.log('>>> no hay ninguna separación guardada (el paso 102 no corrió, o ya se deshizo): no se hace nada.'); return { error: 'sin separación guardada' }; }
  const ss = registrosAgenda_();
  const reg = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA), cam = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA_CAMBIOS);
  if (!reg || !cam || cam.getLastRow() < 2) return { error: 'no hay registro de la agenda' };
  const regV = reg.getRange(1, 1, reg.getLastRow(), Math.max(3, reg.getLastColumn())).getValues();
  if (regV.some(function (r) { return str(r[2]) === 'DESHACER ' + id; })) { Logger.log('>>> la corrida %s ya se deshizo.', id); return { error: 'ya deshecha' }; }
  if (!regV.some(function (r) { return str(r[0]) === id && str(r[2]) === SEPARAR_MODO_REGISTRO; })) return { error: 'la corrida ' + id + ' no es una separación' };
  const lineas = cam.getRange(2, 1, cam.getLastRow() - 1, Math.max(9, cam.getLastColumn())).getValues().filter(function (r) { return str(r[0]) === id; });
  const sh = verificarHojaDestino_(ssDestino_());
  const nCols = sh.getLastColumn();
  const bloque = sh.getRange(1, 1, sh.getLastRow(), nCols).getValues();
  const hdr = bloque[0];
  const A = indicesAgenda_(hdr);
  const valor = function (v, n) {
    const nn = normalizeHeader_(n);
    if ((nn === 'fecha' || nn === 'agenda_fecha_escrita') && /^\d{4}-\d{2}-\d{2}$/.test(str(v))) return toDate_(v);
    return v;
  };
  const viejas = lineas.filter(function (r) { return str(r[1]) === 'separar'; }).map(function (r) {
    return { col: num(r[3]), nombre: str(r[4]), antes: valor(r[5], r[4]), despues: valor(r[6], r[4]), fondoAntes: str(r[7]) || null, ident: str(r[8]) };
  });
  const nuevas = lineas.filter(function (r) { return str(r[1]) === 'separar_crear'; }).map(function (r) {
    return { col: num(r[3]), nombre: str(r[4]), despues: valor(r[6], r[4]), uid: str(r[8]) };
  });
  const uid = (nuevas[0] || {}).uid;
  // la nueva, por su agenda_uid (una sola); la vieja, por su identidad y SIN agenda_uid
  const conUid = [];
  for (let i = 1; i < bloque.length; i++) if (uid && str(bloque[i][A.agenda_uid]) === uid) conUid.push(i + 1);
  const ident = (viejas[0] || {}).ident || '';
  const iRdv = findIdxOr_(hdr, ['rdv_uid'], true), iFig = findIdxOr_(hdr, ['figura'], true), iFec = findIdxOr_(hdr, ['fecha'], true), iBar = findIdxOr_(hdr, ['barrio'], true);
  const candidatasX = [];
  for (let i = 1; i < bloque.length; i++) {
    const r = bloque[i];
    if (!esVacio_(r[A.agenda_uid])) continue;
    const f = toDate_(r[iFec]);
    const k = /^rdv:/.test(ident) ? 'rdv:' + str(r[iRdv]) : 'id:' + normalizeText_(r[iFig]) + '|' + (f ? ymd_(f) : '') + '|' + normalizeText_(r[iBar]);
    if (k === ident) candidatasX.push(i + 1);
  }
  const no = [];
  if (conUid.length !== 1) no.push('la fila nueva (agenda_uid ' + uid + ') está en ' + conUid.length + ' filas');
  if (candidatasX.length !== 1) no.push('la fila que quedó (' + ident + ', sin agenda_uid) está en ' + candidatasX.length + ' filas');
  const X = candidatasX[0], N = conUid[0];
  if (!no.length) {
    const rx = bloque[X - 1], rn = bloque[N - 1];
    viejas.forEach(function (c) { if (valorAgendaComparable_(rx[c.col - 1], c.nombre) !== valorAgendaComparable_(c.despues, c.nombre)) no.push('fila ' + X + ' ' + c.nombre + ' ya no tiene lo escrito ("' + _txtSim_(rx[c.col - 1]) + '")'); });
    const escritas = {};
    nuevas.forEach(function (c) { escritas[c.col] = c; });
    for (let k = 0; k < hdr.length; k++) {
      if (esColumnaDerivada_(hdr[k])) continue;
      const c = escritas[k + 1];
      if (c) { if (valorAgendaComparable_(rn[k], hdr[k]) !== valorAgendaComparable_(c.despues, hdr[k])) no.push('la fila nueva (' + N + ') cambió en ' + hdr[k]); }
      else if (!esVacio_(rn[k])) no.push('la fila nueva (' + N + ') tiene "' + hdr[k] + '" cargado');
    }
  }
  Logger.log('  la fila que quedó: %s | la nueva: %s | celdas a volver: %s', X || '—', N || '—', viejas.length);
  if (no.length) { no.forEach(function (t) { Logger.log('    NO: %s', t); }); Logger.log('>>> NO SE DESHACE NADA (hay que mirarlo a mano).'); return { error: no.join(' | ') }; }
  let ultima = 1;
  for (let i = bloque.length - 1; i >= 1; i--) if (bloque[i].some(function (x, k) { return !esColumnaDerivada_(hdr[k]) && !esVacio_(x); })) { ultima = i + 1; break; }
  Logger.log('  la fila %s vuelve a tener la identidad del mail; la %s %s.', X, N, N === ultima ? 'se BORRA (es la última con datos)' : 'se VACÍA (no es la última: borrarla correría las de abajo)');
  if (enSeco) { Logger.log('>>> EN SECO: no se deshizo nada.'); return { corrida: id, fila: X, filaNueva: N }; }
  const d = deshacerAgendaLote_(sh, hdr, viejas.map(function (c) { return { fila: X, col: c.col, antes: c.antes, despues: c.despues, fondoAntes: c.fondoAntes }; }));
  const s = sacarFilasCreadasAgenda_(sh, [N], ultima);
  if (DERIVADAS_POR_SCRIPT) { try { recalcDerivadas_(RDV_HOJA_DESTINO, true); } catch (err) { Logger.log('    las derivadas no se recalcularon: %s', err); } }
  SpreadsheetApp.flush();
  reg.appendRow([id + '-deshacer', new Date(), 'DESHACER ' + id, '', '', '', '', '', '', '', '', '', '', '', '', '', d.hechas.length,
                 JSON.stringify({ filas_borradas: s.borradas, filas_vaciadas: s.vaciadas }), d.saltadas.length, Date.now() - t0, '', '', '', '', '']);
  try { PropertiesService.getScriptProperties().deleteProperty(SEPARAR_PROP_CORRIDA); } catch (e) { /* el log lo dice */ }
  if (typeof guardianCopiaTrasEscritura_ === 'function') guardianCopiaTrasEscritura_('deshacer la separación (paso 103)');   // apagado no hace nada
  Logger.log('>>> deshecho: celdas vueltas %s (no se pudieron: %s) | fila nueva borrada %s, vaciada %s', d.hechas.length, d.saltadas.length, s.borradas, s.vaciadas);
  return { corrida: id, celdas: d.hechas.length, saltadas: d.saltadas.length, borradas: s.borradas, vaciadas: s.vaciadas };
}
