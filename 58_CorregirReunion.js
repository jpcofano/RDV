/**
 * 58_CorregirReunion.js — CORREGIR LA 824 (MACRI 15/10): VUELVE A SER LA REUNIÓN DEL MAIL (20/10; prompt 09, punto 6b).
 *
 * Lo que dijo el equipo (19/10): la reunión de Villa Devoto (RDV CONJUNTO 849) NO salió por nuestros canales, así que no va a la base
 * ("manda el mail: lo que no está en el mail no va"); la de Villa Santa Rita se suspendió y se REPROGRAMÓ al 23/10, también en Villa
 * Santa Rita (la fila 837, que vino en el mail de JM del 16/10). La 824 tiene el agenda_uid de la reunión del mail (Villa Santa Rita) y el
 * formulario "JORGE MACRI - Encuentro "1 a 1" - Jueves 15/10 Villa Santa Rita" con sus 176 inscriptos, pero el Barrio, el STATUS y los
 * asistentes / oradores de la de Villa Devoto. Queda:
 *   - Barrio "Villa Santa Rita" (el del mail; el usuario autoriza cambiar el que cargó), con agenda_barrio_escrito;
 *   - STATUS "Reprogramada" (regla 6c), con agenda_status_escrito;
 *   - Asistentes, Oradores anotados y Oradores que hablaron, VACÍOS (eran de RDV CONJUNTO 849: el seco verifica que lo sean);
 *   - todo lo demás igual: el formulario y sus inscriptos, RDV_UID, agenda_uid, las columnas del mail; "Tocado por el equipo" se
 *     recalcula; las derivadas, con la ID "Jorge Macri - Villa Santa Rita - 15/10/2026";
 *   - REGISTRO_AGENDA_CAMBIOS: "reprogramada al 23/10/2026 (fila 837, agenda_uid c-30639092…)".
 * Por la excepción anunciada `corregirFilaAutorizada_` (05_Escritura.js, CLAUDE.md §0): todo o nada, lectura fresca.
 *
 *   corregirReunion_enSeco(opciones)   (c01, SÓLO LECTURA) el plan, lo que hay en la 824, y la PRÓXIMA CORRIDA SIMULADA (55_SimularCorrida.js)
 *                                      sobre la base de hoy y la corregida: fuera de la 824 tiene que hacer lo mismo, y en la 824 NO puede
 *                                      volver a escribir los asistentes ni los oradores (ni el Barrio ni el STATUS corregidos). LISTO → la huella.
 *   corregirReunion(opciones)          (c02, ESCRIBE) exige la huella del c01 (vence a las 2 h); con el bloqueo de la corrida de la hora.
 *   deshacerCorregirReunion(enSeco)    vuelve la 824 a como estaba (sólo las celdas que todavía tienen lo que se escribió).
 */

const CORREGIR_PROP_HUELLA = 'CORREGIR_REUNION_HUELLA_C01';
const CORREGIR_PROP_CORRIDA = 'CORREGIR_REUNION_CORRIDA_C02';
const CORREGIR_MODO_REGISTRO = 'CORREGIR';
const CORREGIR_HUELLA_HORAS = 2;

/** El caso (el agenda_uid manda; el número de fila es sólo para el log). */
const CORREGIR_CASO_MACRI_1510 = {
  nombre: 'Macri 15/10', fila: 824, agendaUid: 'c-33a3fd0b-8836-420c-850e-99320fb5231f', figura: 'Jorge Macri', fecha: '2026-10-15',
  barrioAntes: 'Villa Devoto', barrioNuevo: 'Villa Santa Rita', statusAntes: 'Realizada', statusNuevo: 'Reprogramada',
  vaciar: ['Asistentes', 'Oradores anotados', 'Oradores que hablaron'],
  reprogramadaA: { fecha: '2026-10-23', barrio: 'Villa Santa Rita', uidPrefijo: 'c-30639092', fila: 837 }
};

// ===================== Los puntos de entrada =====================

/** c01 (SÓLO LECTURA): el plan y la simulación. LISTO → guarda la huella. */
function corregirReunion_enSeco(opciones) { return _corregirReunion_(true, opciones || {}); }

/** c02 (ESCRIBE): con el bloqueo; exige la huella del c01. */
function corregirReunion(opciones) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(ESPERA_BLOQUEO_MS)) { Logger.log('>>> Hay otra corrida en curso: no se corrige nada (LockService).'); return { error: 'hay otra corrida en curso' }; }
  try { return _corregirReunion_(false, opciones || {}); }
  finally { lock.releaseLock(); }
}

function _corregirReunion_(enSeco, opciones) {
  const t0 = Date.now();
  const caso = Object.assign({}, CORREGIR_CASO_MACRI_1510, opciones.caso || {});
  Logger.log('=== %s: corregir la fila de %s (%s) — %s ===', enSeco ? 'c01' : 'c02', caso.nombre, enSeco ? 'EN SECO, no escribe nada' : 'REAL: escribe la base',
             descripcionHojaDestino_());
  const fin = function (o) { Logger.log('%s: %s ms', enSeco ? 'c01' : 'c02', Date.now() - t0); return o; };
  const sh = verificarHojaDestino_(ssDestino_());
  const bloque = opciones.bloque || sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const plan = planCorregirReunion_(bloque, caso);
  _logPlanCorregir_(plan, caso);
  if (plan.error) { Logger.log('>>> NO SE PUEDE: %s. No se escribe nada.', plan.error); return fin({ error: plan.error, plan: plan }); }
  const props = PropertiesService.getScriptProperties();
  if (enSeco) {
    const v = verificarCorregirEnSeco_(bloque, plan, caso, opciones);
    if (v.listo) {
      try { props.setProperty(CORREGIR_PROP_HUELLA, JSON.stringify({ h: plan.huella, t: Date.now() })); } catch (e) { Logger.log('  (la huella no se pudo guardar: %s)', e); }
      Logger.log('>>> LISTO. HUELLA %s (el c02 la exige, dentro de las próximas %s horas). Para aplicarlo: c02_corregirMacri1510().', plan.huella, CORREGIR_HUELLA_HORAS);
    } else {
      try { props.deleteProperty(CORREGIR_PROP_HUELLA); } catch (e) { /* el log lo dice */ }
      Logger.log('>>> NO LISTO: %s. No se guarda la huella: el c02 no corre.', v.motivos.join(' | '));
    }
    return fin({ huella: plan.huella, listo: v.listo, motivos: v.motivos, plan: plan, verificacion: v });
  }
  // --- REAL (c02) ---
  const no = function (msg) { Logger.log('>>> NO SE ESCRIBE NADA: %s', msg); return fin({ error: msg, plan: plan }); };
  let g = null;
  try { g = JSON.parse(props.getProperty(CORREGIR_PROP_HUELLA) || 'null'); } catch (e) { g = null; }
  if (!g || !g.h) return no('primero hay que correr el c01 (en seco) y que dé LISTO: el c02 exige que el plan sea el mismo que se vio');
  if (Date.now() - (g.t || 0) > CORREGIR_HUELLA_HORAS * 3600000) return no('la huella del c01 tiene más de ' + CORREGIR_HUELLA_HORAS + ' horas: volver a correr el c01');
  if (g.h !== plan.huella) return no('la huella del plan es ' + plan.huella + ' y el c01 dio ' + g.h + ': algo cambió, volver a correr el c01');
  const r = aplicarCorregirReunion_(sh, plan, caso);
  try { props.deleteProperty(CORREGIR_PROP_HUELLA); } catch (e) { /* una huella sirve una vez */ }
  if (r.error && !r.corrida) return no(r.error);
  return fin(Object.assign({ plan: plan }, r));
}

// ===================== El plan =====================

/**
 * El plan sobre `bloque`: la fila por su agenda_uid (una sola), verificada (figura, fecha, el Barrio y el STATUS de hoy); la fila de la
 * reprogramación (figura, fecha, barrio y el prefijo de su agenda_uid: una sola); y los cambios { col, nombre, valor, esperado }.
 */
function planCorregirReunion_(bloque, caso) {
  const hdr = bloque[0];
  const out = { cambios: [], avisos: [], error: '' };
  const A = indicesAgenda_(hdr);
  if (A.faltan.length) { out.error = 'faltan columnas de la agenda: ' + A.faltan.join(', '); return out; }
  const ix = function (n) { return n === 'Dirección' ? A['Dirección'] : (A[n] != null ? A[n] : findIdxOr_(hdr, aliasColumna_(n), true)); };
  const conUid = [];
  for (let i = 1; i < bloque.length; i++) if (str(bloque[i][A.agenda_uid]) === caso.agendaUid) conUid.push(i + 1);
  if (conUid.length !== 1) { out.error = 'el agenda_uid ' + caso.agendaUid + ' está en ' + conUid.length + ' filas'; return out; }
  const X = conUid[0], rx = bloque[X - 1];
  out.fila = X;
  if (X !== caso.fila) out.avisos.push('la fila con ese agenda_uid es la ' + X + ' (el caso decía ' + caso.fila + ')');
  const v = function (n) { const k = ix(n); return k == null ? '' : rx[k]; };
  const kb = function (b) { return normalizeText_(_canonBarrioAg_(b) || b); };
  const fecha = toDate_(v('FECHA'));
  const mal = [];
  if (normalizeText_(v('Figura')) !== normalizeText_(caso.figura)) mal.push('Figura "' + str(v('Figura')) + '"');
  if (!fecha || ymd_(fecha) !== caso.fecha.replace(/-/g, '')) mal.push('FECHA ' + (fecha ? fmtFecha_(fecha) : '—'));
  if (kb(v('Barrio')) !== kb(caso.barrioAntes)) mal.push('Barrio "' + str(v('Barrio')) + '" (se esperaba "' + caso.barrioAntes + '")');
  if (normStatus_(v('STATUS REUNIÓN')) !== normStatus_(caso.statusAntes)) mal.push('STATUS "' + str(v('STATUS REUNIÓN')) + '" (se esperaba "' + caso.statusAntes + '")');
  if (mal.length) { out.error = 'la fila ' + X + ' no es la esperada: ' + mal.join('; ') + ' (¿ya se corrigió?)'; return out; }
  // la reprogramación (la 837)
  const rp = caso.reprogramadaA, fR = toDate_(rp.fecha);
  const cands = [];
  for (let i = 1; i < bloque.length; i++) {
    const r = bloque[i], f = toDate_(r[ix('FECHA')]);
    if (f && ymd_(f) === ymd_(fR) && normalizeText_(r[ix('Figura')]) === normalizeText_(caso.figura) && kb(r[ix('Barrio')]) === kb(rp.barrio) &&
        str(r[A.agenda_uid]).indexOf(rp.uidPrefijo) === 0) cands.push({ fila: i + 1, uid: str(r[A.agenda_uid]), status: str(r[ix('STATUS REUNIÓN')]) });
  }
  if (cands.length !== 1) { out.error = 'la fila de la reprogramación (' + caso.figura + ' ' + rp.fecha + ' ' + rp.barrio + ', agenda_uid ' + rp.uidPrefijo + '…) está ' + cands.length + ' veces'; return out; }
  out.reprogramada = cands[0];
  // los cambios
  const cambiar = function (n, valor) {
    const k = ix(n);
    if (k == null) { out.error = out.error || 'la base no tiene la columna "' + n + '"'; return; }
    if (valorAgendaComparable_(rx[k], n) === valorAgendaComparable_(valor, n) && !(esVacio_(valor) && !esVacio_(rx[k]))) return;
    out.cambios.push({ col: k + 1, nombre: str(hdr[k]), valor: valor, esperado: rx[k] });
  };
  cambiar('Barrio', caso.barrioNuevo);
  cambiar('agenda_barrio_escrito', caso.barrioNuevo);
  cambiar('STATUS REUNIÓN', caso.statusNuevo);
  cambiar('agenda_status_escrito', caso.statusNuevo);
  caso.vaciar.forEach(function (n) { cambiar(n, ''); });
  // "Tocado por el equipo", como lo deja la fila corregida (la agenda lo recalcularía en la corrida siguiente)
  const nueva = rx.slice();
  out.cambios.forEach(function (c) { nueva[c.col - 1] = c.valor; });
  cambiar('Tocado por el equipo', tocadoPorEquipoAgenda_(nueva, A));
  if (out.error) return out;
  out.datos = _datosFilaSeparar_(bloque, X);
  out.huella = _huellaSeparar_([caso.agendaUid, X, out.reprogramada.uid, rx.map(function (x, k) { return valorAgendaComparable_(x, hdr[k]); }).join('¦'),
                                out.cambios.map(function (c) { return c.col + '=' + valorAgendaComparable_(c.valor, c.nombre); }).join(',')].join('#'));
  return out;
}

function _logPlanCorregir_(p, caso) {
  if (p.error) return;
  Logger.log('--- el plan: la fila %s (%s %s) vuelve a ser la reunión del mail (%s) ---', p.fila, caso.figura, caso.fecha, caso.barrioNuevo);
  p.cambios.forEach(function (c) { Logger.log('    %s: "%s" → "%s"', c.nombre, _txtSim_(c.esperado), _txtSim_(c.valor)); });
  Logger.log('    se queda todo lo demás (el formulario "%s" con %s inscriptos, RDV_UID %s, agenda_uid, las columnas del mail)',
             _txtSim_(p.datos.form_origen), _txtSim_(p.datos.Inscriptos), _txtSim_(p.datos.RDV_UID));
  Logger.log('    la reprogramación: fila %s (agenda_uid %s, STATUS "%s"): no se toca', p.reprogramada.fila, p.reprogramada.uid, p.reprogramada.status);
  p.avisos.forEach(function (a) { Logger.log('  AVISO: %s', a); });
}

// ===================== La verificación del seco =====================

/**
 * Lo que decide si el c02 puede correr: (1) lo que se vacía son los asistentes / oradores de la fila de RDV CONJUNTO del barrio de
 * antes (la 849); (2) el formulario es el de la reunión del mail; (3) la próxima corrida simulada sobre la base de hoy y la corregida:
 * fuera de la fila, lo mismo; en la fila, nada que vuelva a poner los asistentes, los oradores, el Barrio o el STATUS corregidos;
 * (4) la agenda no la toca ni avisa; (5) RDV CONJUNTO de ese día, a qué fila iría cada una.
 */
function verificarCorregirEnSeco_(bloque, plan, caso, opciones) {
  const motivos = [];
  const X = plan.fila;
  const E = entradasSimulacion_(Object.assign({ bloque: bloque }, opciones.simulacion || {}));
  E.avisos.forEach(function (a) { Logger.log('  AVISO de lectura: %s', a); motivos.push('no se pudo leer: ' + a); });
  // (1) lo que se vacía, ¿es de la fila de RDV CONJUNTO del barrio de antes?
  const deConj = _conjuntoDeBarrioCorregir_(E.valoresConjunto, caso);
  Logger.log('--- (1) lo que se vacía: ¿viene de RDV CONJUNTO (%s, %s, %s)? ---', caso.figura, caso.fecha, caso.barrioAntes);
  if (!deConj) { Logger.log('    NO: RDV CONJUNTO no tiene una sola fila de %s %s en %s', caso.figura, caso.fecha, caso.barrioAntes); motivos.push('no se encontró la fila de RDV CONJUNTO de ' + caso.barrioAntes); }
  else {
    caso.vaciar.forEach(function (n) {
      const enBase = plan.datos[n], enConj = deConj.valores[n];
      const igual = num(enBase) === num(enConj) || (esVacio_(enBase) && esVacio_(enConj));
      Logger.log('    %s: base "%s" | RDV CONJUNTO fila %s "%s" → %s', n, _txtSim_(enBase), deConj.fila, _txtSim_(enConj), igual ? 'igual' : 'DISTINTO');
      if (!igual) motivos.push(n + ' de la fila (' + _txtSim_(enBase) + ') no es el de RDV CONJUNTO ' + caso.barrioAntes + ' (' + _txtSim_(enConj) + '): no se vacía sin mirarlo');
    });
  }
  // (2) el formulario
  const fo = str(plan.datos.form_origen);
  Logger.log('--- (2) el formulario de la fila: "%s" (%s inscriptos) → %s ---', fo, _txtSim_(plan.datos.Inscriptos),
             normalizeText_(fo).indexOf(normalizeText_(caso.barrioNuevo)) >= 0 ? 'de ' + caso.barrioNuevo + ' (se queda)' : 'NO dice ' + caso.barrioNuevo);
  if (fo && normalizeText_(fo).indexOf(normalizeText_(caso.barrioNuevo)) < 0) motivos.push('el formulario de la fila no es de ' + caso.barrioNuevo + ': "' + fo + '"');
  // la base corregida, con sus derivadas
  const cor = bloque.map(function (r) { return r.slice(); });
  plan.cambios.forEach(function (c) { cor[X - 1][c.col - 1] = c.valor; });
  const der = derivadasDeFilasSeparar_(cor, E, [X]);
  der.forEach(function (d) { cor[d.fila - 1][d.col - 1] = d.valor; });
  Logger.log('--- las derivadas que recalcula el c02 en la fila: %s ---', der.length);
  der.forEach(function (d) { Logger.log('    %s = "%s"', d.nombre, _txtSim_(d.valor)); });
  const kId = findIdxOr_(bloque[0], [COLUMNA_ID], true);
  if (kId != null && lookerEnSistema_()) {
    const esp = idBaseDeFila_(caso.figura, caso.barrioNuevo, toDate_(caso.fecha));
    Logger.log('    la ID derivada: "%s"%s', str(cor[X - 1][kId]), str(cor[X - 1][kId]) === esp ? '' : ' — se esperaba "' + esp + '"');
    if (str(cor[X - 1][kId]) !== esp) motivos.push('la ID derivada no es "' + esp + '"');
  }
  // (3) la próxima corrida, simulada
  Logger.log('--- (3) la próxima corrida de la hora, simulada sobre la base de HOY y sobre la CORREGIDA (lecturas: %s ms) ---', E.leidoMs);
  const S0 = simularCorridaHora_(bloque, E, opciones.simulacion), S1 = simularCorridaHora_(cor, E, opciones.simulacion);
  logSimulacion_(S1, 'con la fila CORREGIDA');
  if (S0.incompleta || S1.incompleta) motivos.push('la simulación quedó INCOMPLETA por tiempo (desde "' + (S0.incompleta || S1.incompleta) + '"): volver a correr el c01');
  const faltan = ['agenda', 'cruce', 'derivadas', 'ids', 'looker'].filter(function (p) {
    const activa = p === 'agenda' ? AGENDA_ACTIVA : p === 'derivadas' ? DERIVADAS_POR_SCRIPT : p === 'ids' ? IDS_EN_LA_HORA : p === 'looker' ? lookerEnSistema_() : true;
    return activa && S1.partes.indexOf(p) < 0;
  });
  if (faltan.length) motivos.push('no se simuló: ' + faltan.join(', '));
  const cmp = compararSimulaciones_(S0, S1, { excluirA: new Set([X]), excluirB: new Set([X]), filasOriginalesA: bloque.length });
  const fIds = toDate_(caso.fecha);
  // las filas de Looker de esa reunión: por su ID (Datos_Unpivot) o por figura + fecha (Aux_Maximos no lleva la ID; una figura, una reunión por día)
  const esDeLaFila = function (x) {
    return [caso.barrioAntes, caso.barrioNuevo, ''].some(function (b) { return x.indexOf(idBaseDeFila_(caso.figura, b, fIds)) >= 0; }) ||
           (x.indexOf(JSON.stringify(caso.figura)) >= 0 && x.indexOf('"' + caso.fecha + ' ') >= 0);
  };
  // 20/10 (después del c01): Aux_Maximos de ESA fecha en una dimensión que la fila tenía antes o tiene después (su barrio, su día,
  // su hora): el máximo / total cambia PORQUE la fila corregida deja de contar (o cuenta distinto). Es "Looker: por la corrección"
  const dimsFila = { 'Barrio': new Set(), 'Día de la semana': new Set(), 'HORA': new Set() };
  [S0.bloqueFinal, S1.bloqueFinal].forEach(function (b) {
    const h = b[0], r = b[X - 1];
    const k = function (n) { return findIdxOr_(h, aliasColumna_(n), true); };
    if (k('Barrio') != null) dimsFila['Barrio'].add(str(r[k('Barrio')]));
    if (k('Día de la semana') != null) dimsFila['Día de la semana'].add(str(r[k('Día de la semana')]));
    if (k('HORA') != null) dimsFila['HORA'].add(horaHHmm_(r[k('HORA')]));
  });
  const porLaCorreccion = function (x) {
    if (esDeLaFila(x)) return true;
    if (x.indexOf('X|') !== 0) return false;
    let a = null;
    try { a = JSON.parse(x.slice(2)); } catch (e) { return false; }
    return String(a[4] || '').indexOf(caso.fecha) === 0 && dimsFila[a[11]] && dimsFila[a[11]].has(String(a[12]));
  };
  const lookerTodo = cmp.looker ? cmp.looker.soloEnB.map(function (x) { return 'aparece ' + x; }).concat(cmp.looker.soloEnA.map(function (x) { return 'deja ' + x; })) : [];
  const lookerCorr = lookerTodo.filter(function (t) { return porLaCorreccion(t.replace(/^(aparece|deja) /, '')); });
  Logger.log('--- Looker: por la corrección (la fecha %s, en el barrio / día / hora que la fila tenía o tiene; esperado): %s ---', caso.fecha, lookerCorr.length);
  lookerCorr.forEach(function (t) { Logger.log('    %s', t.slice(0, 220)); });
  const fuera = cmp.soloEnB.map(function (c) { return 'aparece: ' + textoCambioSim_(c, S1.bloqueFinal); })
    .concat(cmp.soloEnA.map(function (c) { return 'deja de pasar: ' + textoCambioSim_(c, S0.bloqueFinal); }))
    .concat(cmp.borrar.soloEnB.map(function (k) { return 'la agenda borraría ' + k; }), cmp.borrar.soloEnA.map(function (k) { return 'la agenda ya no borraría ' + k; }))
    .concat(lookerTodo.filter(function (t) { return !porLaCorreccion(t.replace(/^(aparece|deja) /, '')); }).map(function (t) { return 'Looker: ' + t.slice(0, 200); }))
    // un aviso / pregunta / ambigua NUEVA de la agenda (lo que deja de aparecer, sólo se muestra abajo)
    .concat(Object.keys(cmp.agenda || {}).reduce(function (a, k) { return a.concat(cmp.agenda[k].soloEnB.map(function (t) { return 'la agenda, ' + k + ' nuevo: ' + t; })); }, []));
  if (cmp.borrar.enExcluidas.length) motivos.push('la agenda borraría o fusionaría la fila ' + X);
  Object.keys(cmp.agenda || {}).forEach(function (k) {
    cmp.agenda[k].soloEnA.forEach(function (t) { Logger.log('  (la agenda, %s que deja de aparecer: %s)', k, t); });
  });
  Logger.log('--- FUERA DE LO ESPERADO (lo que cambia entre las dos simulaciones fuera de la fila %s) ---', X);
  fuera.forEach(function (t) { Logger.log('    %s', t); });
  if (!fuera.length) Logger.log('    nada: fuera de esa fila, la próxima corrida hace exactamente lo mismo.');
  else motivos.push(fuera.length + ' cambios fuera de la fila ' + X);
  Logger.log('--- lo que la próxima corrida escribiría en la fila %s ---', X);
  cmp.enExcluidas.forEach(function (c) { Logger.log('    %s', textoCambioSim_(c, S1.bloqueFinal)); });
  if (!cmp.enExcluidas.length) Logger.log('    nada.');
  const prohibidas = caso.vaciar.concat(['Barrio', 'STATUS REUNIÓN', 'agenda_barrio_escrito', 'agenda_status_escrito']).map(normalizeHeader_);
  const vuelve = cmp.enExcluidas.filter(function (c) { return prohibidas.indexOf(normalizeHeader_(c.nombre)) >= 0; });
  if (vuelve.length) motivos.push('la próxima corrida volvería a escribir en la fila ' + X + ': ' + vuelve.map(function (c) { return c.parte + ' ' + c.nombre + ' = ' + _txtSim_(c.despues); }).join(', '));
  // (4) la agenda y la fila
  const P = S1.P || {};
  const toca = function (fs) { return (fs || []).some(function (f) { return f && (f.fila || f) === X; }); };
  const avisos = [];
  (P.dosFilas || []).forEach(function (p) { if (toca([p.a, p.b])) avisos.push('"una reunión en dos filas": ' + p.texto); });
  (P.invariante || []).forEach(function (x) { if (toca(x.filas)) avisos.push('H3: ' + x.texto); });
  (P.ambiguas || []).forEach(function (x) { if (toca(x.filas)) avisos.push('ambigua: ' + x.motivo); });
  (P.duplicados || []).forEach(function (x) { if (toca((x.candidatas || []).map(function (c) { return c.f; })) || (x.par && toca([x.par.a, x.par.b]))) avisos.push('AGENDA_DUPLICADOS: ' + x.tipo); });
  (P.cancelNoAplicada || []).forEach(function (x) { if (toca([x.f])) avisos.push('aviso de cancelación: ' + x.motivo); });
  (P.acciones || []).forEach(function (a) { if ((a.fila || (a.f && a.f.fila)) === X) avisos.push('acción ' + a.tipo + ' en la fila'); });
  Logger.log('--- (4) la agenda y la fila %s ---', X);
  (E.r ? E.r.unicas : []).filter(function (x) { return x.fecha && ymd_(x.fecha) === caso.fecha.replace(/-/g, '') && normalizeText_(x.figuraFila) === normalizeText_(caso.figura); })
    .forEach(function (x) {
      const fd = P.filaDe ? P.filaDe.get(x.clave) : null;
      const ce = (P.cancelacionesEvaluadas || []).filter(function (c) { return c.d && c.d.clave === x.clave; }).map(function (c) { return c.decision; });
      Logger.log('    la reunión del mail %s → fila %s%s', _textoReunionAgenda_(x), fd && fd.fila ? fd.fila : '(ninguna)', ce.length ? ' | cancelación: ' + ce.join('; ') : '');
    });
  avisos.forEach(function (t) { Logger.log('    NO: %s', t); });
  if (!avisos.length) Logger.log('    la agenda no la toca ni avisa ("Reprogramada": cancelación ya reflejada).');
  else motivos.push('la agenda: ' + avisos.join(' | '));
  // (5) RDV CONJUNTO
  Logger.log('--- (5) RDV CONJUNTO de %s del %s, con la fila corregida ---', caso.figura, caso.fecha);
  _conjuntoDelDiaSeparar_(S1, E, caso).forEach(function (t) { Logger.log('    %s', t); });
  return { listo: !motivos.length, motivos: motivos, S0: S0, S1: S1, cmp: cmp, corregida: cor };
}

/** La fila de RDV CONJUNTO de la figura, la fecha y el barrio de antes (la 849): { fila, valores: { Asistentes, Oradores… } } o null. */
function _conjuntoDeBarrioCorregir_(vals, caso) {
  if (!vals || !vals.length) return null;
  const hdr = vals[0];
  const iFig = findIdxOr_(hdr, ['figura', 'persona', 'nombre'], true), iBar = findIdxOr_(hdr, ['barrion', 'barrio'], true);
  const iFec = findIdxOr_(hdr, ['fecha', 'fecha (fecha)', 'fecha_evento', 'fecha reunion', 'fecha reunión', 'fecha_reunion', 'fecha_reunión', 'fecha evento'], true);
  if (iFig == null || iFec == null || iBar == null) return null;
  const kb = function (b) { return normalizeText_(_canonBarrioAg_(b) || b); };
  const out = [];
  for (let i = 1; i < vals.length; i++) {
    const r = vals[i], f = toDate_(r[iFec]);
    if (!f || ymd_(f) !== caso.fecha.replace(/-/g, '') || kb(r[iBar]) !== kb(caso.barrioAntes)) continue;
    if (normalizeText_(figuraPorTokens_(str(r[iFig])).figura) !== normalizeText_(caso.figura)) continue;
    const valores = {};
    caso.vaciar.forEach(function (n) { const k = findIdxOr_(hdr, aliasColumna_(n), true); valores[n] = k == null ? '' : r[k]; });
    out.push({ fila: i + 1, valores: valores });
  }
  return out.length === 1 ? out[0] : null;
}

// ===================== La escritura (c02) y deshacer =====================

function aplicarCorregirReunion_(sh, plan, caso) {
  const out = { corrida: '', celdas: 0, error: '' };
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const X = plan.fila;
  const permitidas = CORREGIR_COLUMNAS_PERMITIDAS.map(normalizeHeader_);
  const ajenas = plan.cambios.filter(function (c) { return permitidas.indexOf(normalizeHeader_(hdr[c.col - 1])) < 0 || normalizeHeader_(hdr[c.col - 1]) !== normalizeHeader_(c.nombre); });
  if (ajenas.length) { out.error = 'columnas que no se corrigen por acá (o se movieron): ' + ajenas.map(function (c) { return c.nombre; }).join(', '); return out; }
  const fondos = sh.getRange(X, 1, 1, hdr.length).getBackgrounds()[0];
  const corrida = _idCorridaAgenda_();
  const rp = plan.reprogramada;
  const lineas = plan.cambios.map(function (c) {
    return [corrida, 'corregir', X, c.col, c.nombre, _celdaRegistro_(c.esperado), _celdaRegistro_(c.valor), fondos[c.col - 1] || '', caso.agendaUid];
  }).concat([[corrida, 'reprogramada', X, '', 'fila ' + rp.fila, 'reprogramada al ' + fmtFecha_(toDate_(caso.reprogramadaA.fecha)) + ' (fila ' + rp.fila + ', agenda_uid ' + rp.uid + ')' +
              ' — corregida a mano (prompt 09, 6b): Barrio ' + caso.barrioNuevo + ', se vaciaron ' + caso.vaciar.join(', ') + ' (eran de la reunión de ' + caso.barrioAntes + ', que no va)',
              '', '', caso.agendaUid]]);
  try {
    _anotarCambiosAgenda_(lineas);
    _conReintentosAgenda_('REGISTRO_AGENDA', function () {
      _hojaRegistroAgenda_(registrosAgenda_()).appendRow([corrida, new Date(), CORREGIR_MODO_REGISTRO, '', '', 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, plan.cambios.length, '', 0, 0,
                                                          'corregir ' + caso.nombre + ': fila ' + X + ' (deshacer: deshacerCorregirReunion)', 0, 0, 0, 0]);
      SpreadsheetApp.flush();
    });
  } catch (err) { out.error = 'no se pudo escribir REGISTRO_AGENDA (' + err + '): NO se escribió nada en la base'; return out; }
  out.corrida = corrida;
  try { PropertiesService.getScriptProperties().setProperty(CORREGIR_PROP_CORRIDA, corrida); } catch (e) { Logger.log('  (el id no se pudo guardar: %s)', e); }
  let w;
  try { w = corregirFilaAutorizada_(sh, hdr, X, plan.cambios); } catch (err) { w = { hechas: [], error: String(err && err.message || err) }; }
  if (w.error) {
    out.error = w.error;
    try {
      registrosAgenda_().getSheetByName(RDV_HOJA_REGISTRO_AGENDA).appendRow([corrida + '-deshacer', new Date(), 'DESHACER ' + corrida, '', '', '', '', '', '', '', '', '', '', '', '', '', 0,
                                                                            'no se escribió nada: ' + w.error, 0, 0, '', '', '', '', '']);
      PropertiesService.getScriptProperties().deleteProperty(CORREGIR_PROP_CORRIDA);
    } catch (e) { /* el log lo dice */ }
    Logger.log('>>> NO SE ESCRIBIÓ NADA: %s', w.error);
    return out;
  }
  SpreadsheetApp.flush();
  if (DERIVADAS_POR_SCRIPT) { try { recalcDerivadas_(RDV_HOJA_DESTINO, true); } catch (err) { Logger.log('>>> las derivadas NO se recalcularon: %s', err); } }
  if (GUARDIAN_ACTIVO && typeof tomarCopiaSiAlineada_ === 'function') { try { tomarCopiaSiAlineada_(); } catch (err) { Logger.log('>>> el guardián no pudo tomar la copia: %s', err); } }
  out.celdas = w.hechas.length;
  Logger.log('>>> corrida %s: la fila %s corregida (%s celdas). Deshacer: deshacerCorregirReunion(false).', corrida, X, w.hechas.length);
  return out;
}

/** Deshacer la última corrección (CORREGIR_PROP_CORRIDA, o `corrida`): la fila por su agenda_uid; sólo las celdas que todavía tienen lo escrito. */
function deshacerCorregirReunion(enSeco, corrida) {
  const lock = enSeco ? null : LockService.getScriptLock();
  if (lock && !lock.tryLock(ESPERA_BLOQUEO_MS)) { Logger.log('>>> Hay otra corrida en curso: no se deshace nada.'); return { error: 'hay otra corrida en curso' }; }
  try {
    let id = corrida || '';
    if (!id) { try { id = PropertiesService.getScriptProperties().getProperty(CORREGIR_PROP_CORRIDA) || ''; } catch (e) { id = ''; } }
    Logger.log('=== deshacer la corrección %s (%s) ===', id || '(ninguna guardada)', enSeco ? 'EN SECO' : 'REAL');
    if (!id) return { error: 'no hay ninguna corrección guardada' };
    const ss = registrosAgenda_();
    const reg = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA), cam = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA_CAMBIOS);
    const regV = reg.getRange(1, 1, reg.getLastRow(), Math.max(3, reg.getLastColumn())).getValues();
    if (regV.some(function (r) { return str(r[2]) === 'DESHACER ' + id; })) return { error: 'ya deshecha' };
    const lineas = cam.getRange(2, 1, cam.getLastRow() - 1, Math.max(9, cam.getLastColumn())).getValues().filter(function (r) { return str(r[0]) === id && str(r[1]) === 'corregir'; });
    if (!lineas.length) return { error: 'la corrida ' + id + ' no es una corrección' };
    const sh = verificarHojaDestino_(ssDestino_());
    const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const A = indicesAgenda_(hdr);
    const uid = str(lineas[0][8]);
    const uids = sh.getRange(2, A.agenda_uid + 1, sh.getLastRow() - 1, 1).getValues();
    const filas = [];
    uids.forEach(function (r, i) { if (str(r[0]) === uid) filas.push(i + 2); });
    if (filas.length !== 1) return { error: 'la fila del agenda_uid ' + uid + ' está ' + filas.length + ' veces' };
    const valor = function (v, n) { const nn = normalizeHeader_(n); return (nn === 'fecha' || nn === 'agenda_fecha_escrita') && /^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? toDate_(v) : v; };
    const cambios = lineas.map(function (r) { return { col: num(r[3]), antes: valor(r[5], r[4]), despues: valor(r[6], r[4]), fondoAntes: str(r[7]) || null }; });
    Logger.log('  la fila %s: %s celdas a volver', filas[0], cambios.length);
    if (enSeco) return { corrida: id, fila: filas[0], celdas: cambios.length };
    const d = deshacerCorreccionAutorizada_(sh, hdr, filas[0], cambios);
    if (DERIVADAS_POR_SCRIPT) { try { recalcDerivadas_(RDV_HOJA_DESTINO, true); } catch (err) { Logger.log('    las derivadas no se recalcularon: %s', err); } }
    SpreadsheetApp.flush();
    reg.appendRow([id + '-deshacer', new Date(), 'DESHACER ' + id, '', '', '', '', '', '', '', '', '', '', '', '', '', d.hechas.length, '', d.saltadas.length, 0, '', '', '', '', '']);
    try { PropertiesService.getScriptProperties().deleteProperty(CORREGIR_PROP_CORRIDA); } catch (e) { /* nada */ }
    Logger.log('>>> deshecho: %s celdas vueltas; no se pudieron (alguien las cambió) %s', d.hechas.length, d.saltadas.length);
    return { corrida: id, celdas: d.hechas.length, saltadas: d.saltadas.length };
  } finally { if (lock) lock.releaseLock(); }
}
