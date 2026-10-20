/**
 * 57_OrdenBase.js — LA BASE ORDENADA POR FECHA, LAS MÁS NUEVAS AL FINAL (19/10; prompt 08, punto 7; pasos 107, 108 y 109).
 *
 * Al PRINCIPIO de cada corrida de la hora (20/10, decisión del usuario; con BASE_ORDEN_POR_FECHA, APAGADO hasta ver el seco), la base
 * queda ordenada por FECHA
 * ascendente, dentro del mismo día por HORA y después por Figura; las filas sin FECHA, al final de todo (y se listan). Lo seguro:
 *   - sólo si hace falta: si ya está en orden, no toca nada. "En orden" es lo que daría el ordenamiento de la hoja (`_claveOrden_`
 *     imita su criterio: números y fechas antes que textos, las celdas vacías al final, el texto sin mayúsculas). Si la hoja ordena
 *     distinto que este cálculo en algún empate raro (una HORA tipeada como texto), la secuencia que dejó el último orden queda en
 *     ORDEN_PROP_HUELLA y no se vuelve a ordenar en cada corrida;
 *   - el ordenamiento NATIVO (`ordenarFilasBase_`, 05_Escritura.js) sobre TODAS las columnas y sólo las filas con datos (sin el
 *     encabezado ni las vacías de abajo); nunca reescribe valores;
 *   - antes: si hay una fórmula en la base no ordena; guarda el orden anterior en ORDEN_SOLAPA_PREVIO (intermedia), OBLIGATORIO;
 *   - después: verifica, fila por fila por su contenido, que cada una siguió con sus valores, fondos, notas y formatos (cada
 *     agenda_uid y cada RDV_UID con lo suyo); si la hoja no movió un fondo / nota / formato con su fila, lo repone;
 *   - en la corrida de la hora: al PRINCIPIO (después del guardián, antes de la agenda: la corrida anterior ya terminó de escribir y
 *     los reportes de ésta ven la base ordenada), dentro del bloqueo; en REGISTRO_CORRIDAS, "base_ordenada";
 *   - deshacer (paso 109): vuelve al orden guardado (por el contenido de cada fila y, si cambió, por su identidad).
 *
 *   ordenBase_enSeco(opciones)       (paso 107, SÓLO LECTURA) cuántas filas se moverían, las primeras 20 (de qué fila a qué fila),
 *                                    las filas sin FECHA, que cada agenda_uid / RDV_UID sigue con sus datos, y LA PRÓXIMA CORRIDA
 *                                    SIMULADA sobre la base de hoy y sobre la ordenada (55_SimularCorrida.js): tiene que hacer lo
 *                                    mismo, fila por fila por su identidad (si no, algo depende del número de fila: NO LISTO).
 *   ordenarBaseAhora()               (paso 108, ESCRIBE) el primer orden, a mano, con el bloqueo (no depende del interruptor).
 *   deshacerOrdenBase(enSeco)        (paso 109) vuelve al orden anterior al último orden del sistema.
 *   ordenarBaseEnLaHora_()           lo que llama la corrida de la hora (20_UpsertDestino.js), con BASE_ORDEN_POR_FECHA.
 */

const ORDEN_PROP_HUELLA = 'ORDEN_BASE_HUELLA';    // la secuencia de filas que dejó el último orden del sistema
const ORDEN_PROP_CORRIDA = 'ORDEN_BASE_CORRIDA';  // el id del último orden (el paso 109 lo deshace)
// 20/10 (prompt 09): el paso 108 (c04) exige la huella del 107 (c03) LISTO: el mismo orden de la base que se vio en seco, hace menos de
// ORDEN_HUELLA_SECO_HORAS. Sirve una vez. La corrida de la hora (BASE_ORDEN_POR_FECHA) no la pide.
const ORDEN_PROP_HUELLA_SECO = 'ORDEN_BASE_HUELLA_107';
const ORDEN_HUELLA_SECO_HORAS = 2;

// ===================== El plan (en memoria) =====================

/**
 * El orden de `bloque` (la base entera). Devuelve { ultima (la última fila con datos), filas: [{ fila, clave, id }], orden (las
 * filas en el orden nuevo), mueve: [{ de, a, id }], sinFecha: [fila…], specs (las columnas del orden, 1-based), huellaActual,
 * huellaOrdenada, error }.
 */
function planOrdenBase_(bloque) {
  const hdr = bloque[0];
  const ix = function (n) { return findIdxOr_(hdr, aliasColumna_(n), true); };
  const iF = ix('FECHA'), iH = ix('HORA'), iFig = ix('Figura');
  const out = { filas: [], orden: [], mueve: [], sinFecha: [], error: '' };
  if (iF == null || iH == null || iFig == null) { out.error = 'la base no tiene FECHA, HORA y Figura por encabezado'; return out; }
  out.specs = [{ column: iF + 1, ascending: true }, { column: iH + 1, ascending: true }, { column: iFig + 1, ascending: true }];
  let ultima = 1;
  for (let i = bloque.length - 1; i >= 1; i--) {
    if (bloque[i].some(function (x, k) { return !esColumnaDerivada_(hdr[k]) && !esVacio_(x); })) { ultima = i + 1; break; }
  }
  out.ultima = ultima;
  out.hdr = hdr;
  for (let f = 2; f <= ultima; f++) {
    const r = bloque[f - 1];
    const conDatos = r.some(function (x, k) { return !esColumnaDerivada_(hdr[k]) && !esVacio_(x); });
    const x = { fila: f, clave: claveContenidoFila_(r), id: identidadFilaSim_(bloque, f), k: [_claveOrden_(r[iF]), _claveOrden_(r[iH]), _claveOrden_(r[iFig])] };
    out.filas.push(x);
    if (conDatos && !(r[iF] instanceof Date) && typeof r[iF] !== 'number') out.sinFecha.push(f);
  }
  out.orden = out.filas.slice().sort(function (a, b) {
    for (let j = 0; j < 3; j++) { const c = _compararClaveOrden_(a.k[j], b.k[j]); if (c) return c; }
    return a.fila - b.fila;   // el ordenamiento de la hoja es estable: los empates quedan como estaban
  });
  out.orden.forEach(function (x, j) { if (x.fila !== j + 2) out.mueve.push({ de: x.fila, a: j + 2, id: x.id }); });
  out.huellaActual = _huellaOrden_(out.filas);
  out.huellaOrdenada = _huellaOrden_(out.orden);
  return out;
}

/** La clave de un valor como la ordena la hoja (ascendente): [tipo, valor]; tipo 0 número o fecha, 1 texto, 2 lógico, 3 vacío. */
function _claveOrden_(v) {
  if (v === '' || v == null) return [3, 0];
  if (v instanceof Date) return [0, (v.getTime() - new Date(1899, 11, 30).getTime()) / 86400000];
  if (typeof v === 'number') return [0, v];
  if (typeof v === 'boolean') return [2, v ? 1 : 0];
  return [1, String(v).toLowerCase()];
}
function _compararClaveOrden_(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[0] === 1) return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
  return a[1] - b[1];
}

/** El contenido de una fila como texto estable (para reconocerla después de moverla). */
function claveContenidoFila_(r) {
  return _huellaSeparar_(JSON.stringify(r.map(function (v) { return v instanceof Date ? 'D' + v.getTime() : v; })));
}

/** La huella de una SECUENCIA de filas, por su identidad (no por su contenido: una escritura de la corrida no la cambia). */
function _huellaOrden_(filas) {
  return _huellaSeparar_(filas.map(function (x) { return x.id; }).join('|'));
}

/** El bloque en el orden del plan (en memoria): las filas 2..ultima permutadas; lo de abajo, igual. Y la fila de origen de cada una. */
function bloqueOrdenado_(bloque, plan) {
  const out = [bloque[0]], de = [null, 1];
  plan.orden.forEach(function (x) { out.push(bloque[x.fila - 1]); de.push(x.fila); });
  for (let i = plan.ultima; i < bloque.length; i++) { out.push(bloque[i]); de.push(i + 1); }
  return { bloque: out, de: de };   // de[filaNueva] = filaVieja
}

// ===================== Paso 107: en seco =====================

/**
 * **Paso 107, SÓLO LECTURA.** El plan del orden y la verificación: cada agenda_uid y RDV_UID con sus mismos datos en la base
 * ordenada, y la próxima corrida de la hora SIMULADA sobre la base de hoy y sobre la ordenada (lo mismo, fila por fila por su
 * identidad: si no, algo depende del número de fila). LISTO / NO LISTO para prender BASE_ORDEN_POR_FECHA.
 */
function ordenBase_enSeco(opciones) {
  opciones = opciones || {};
  const t0 = Date.now();
  Logger.log('=== paso 107: la base ordenada por FECHA, HORA y Figura (EN SECO, no escribe nada) — %s — BASE_ORDEN_POR_FECHA = %s ===',
             descripcionHojaDestino_(), BASE_ORDEN_POR_FECHA);
  const sh = verificarHojaDestino_(ssDestino_());
  const bloque = opciones.bloque || sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const plan = planOrdenBase_(bloque);
  if (plan.error) { Logger.log('>>> %s', plan.error); return { error: plan.error }; }
  const motivos = [];
  _logPlanOrden_(plan, bloque);
  const ord = bloqueOrdenado_(bloque, plan);
  // cada agenda_uid y cada RDV_UID, con los mismos datos
  const porId = function (b) {
    const m = new Map(), hdr = b[0];
    const iU = findIdxOr_(hdr, ['agenda_uid'], true), iR = findIdxOr_(hdr, ['rdv_uid'], true);
    for (let i = 1; i < b.length; i++) {
      [iU, iR].forEach(function (k) { if (k != null && str(b[i][k])) m.set((k === iU ? 'uid:' : 'rdv:') + str(b[i][k]), claveContenidoFila_(b[i])); });
    }
    return m;
  };
  const a = porId(bloque), b = porId(ord.bloque);
  let mal = 0;
  a.forEach(function (v, k) { if (b.get(k) !== v) mal++; });
  Logger.log('--- cada agenda_uid y cada RDV_UID, con sus mismos datos en la base ordenada: %s de %s%s ---', a.size - mal, a.size, mal ? ' — NO' : ' — OK');
  if (mal || a.size !== b.size) motivos.push(mal + ' identidades cambiarían de datos');
  // la próxima corrida, simulada sobre las dos
  if (plan.mueve.length && opciones.simular !== false) {
    const E = entradasSimulacion_(Object.assign({ bloque: bloque }, opciones.simulacion || {}));
    E.avisos.forEach(function (x) { Logger.log('  AVISO de lectura: %s', x); motivos.push('no se pudo leer: ' + x); });
    const S0 = simularCorridaHora_(bloque, E, opciones.simulacion), S1 = simularCorridaHora_(ord.bloque, E, opciones.simulacion);
    logSimulacion_(S0, 'con la base de HOY', 60);
    if (S0.incompleta || S1.incompleta) motivos.push('la simulación quedó INCOMPLETA por tiempo: volver a correr el paso 107');
    const cmp = compararSimulaciones_(S0, S1, { mapaB: function (f) { return f < ord.de.length ? ord.de[f] : null; }, filasOriginalesA: bloque.length });
    const fuera = cmp.soloEnB.map(function (c) { return 'aparece con la base ordenada: ' + textoCambioSim_(c, S1.bloqueFinal); })
      .concat(cmp.soloEnA.map(function (c) { return 'deja de pasar con la base ordenada: ' + textoCambioSim_(c, S0.bloqueFinal); }))
      .concat(cmp.borrar.soloEnB.concat(cmp.borrar.soloEnA).map(function (k) { return 'la agenda borraría otra fila: ' + k; }));
    Object.keys(cmp.agenda).forEach(function (k) {
      cmp.agenda[k].soloEnB.forEach(function (t) { fuera.push('agenda (' + k + ') aparece: ' + t); });
      cmp.agenda[k].soloEnA.forEach(function (t) { fuera.push('agenda (' + k + ') deja de pasar: ' + t); });
    });
    if (cmp.looker) fuera.push.apply(fuera, cmp.looker.soloEnB.concat(cmp.looker.soloEnA).map(function (x) { return 'Looker: ' + x.slice(0, 160); }));
    Logger.log('--- la próxima corrida con la base ORDENADA contra la de HOY (por la identidad de cada fila) ---');
    fuera.forEach(function (t) { Logger.log('    %s', t); });
    if (!fuera.length) Logger.log('    lo mismo: nada de la próxima corrida depende del número de fila.');
    else motivos.push(fuera.length + ' diferencias entre la próxima corrida sobre la base de hoy y sobre la ordenada');
  } else if (!plan.mueve.length) Logger.log('--- la base ya está en orden: no hay nada que simular ---');
  // 20/10: los empates de Aux_Maximos ya no dependen del orden de las filas; lo que cambia UNA vez, con la base de hoy (informativo)
  if (lookerEnSistema_()) {
    const cd = cambiosDesempateLooker_(bloque);
    Logger.log('--- Looker: los empates de Aux_Maximos que cambian de representante UNA vez, por el desempate nuevo (FECHA, HORA, Figura, ' +
               'RDV_UID / agenda_uid; no depende del orden de las filas): %s ---', cd.length);
    cd.forEach(function (t) { Logger.log('    %s', t); });
    if (!cd.length) Logger.log('    ninguno.');
  }
  const listo = !motivos.length;
  // 20/10 (prompt 09): la huella para el paso 108 (c04), sólo LISTO y con algo que mover
  try {
    const pr = PropertiesService.getScriptProperties();
    if (listo && plan.mueve.length) { pr.setProperty(ORDEN_PROP_HUELLA_SECO, JSON.stringify({ h: plan.huellaActual, t: Date.now() })); Logger.log('  la huella para el paso 108: %s (vence a las %s horas)', plan.huellaActual, ORDEN_HUELLA_SECO_HORAS); }
    else pr.deleteProperty(ORDEN_PROP_HUELLA_SECO);
  } catch (e) { Logger.log('  (la huella del seco no se pudo guardar: %s)', e); }
  Logger.log('>>> %s%s (paso 107: %s ms)', listo ? 'LISTO para prender BASE_ORDEN_POR_FECHA' : 'NO LISTO: ', listo ? '' : motivos.join(' | '), Date.now() - t0);
  return { listo: listo, motivos: motivos, movidas: plan.mueve.length, sinFecha: plan.sinFecha, plan: plan };
}

/**
 * 20/10: los representantes de Aux_Maximos (máximos y la fila de un total) que cambian entre el desempate de antes (el primero
 * que aparecía, según el orden de las filas) y el nuevo (`_antesEnOrdenLooker_`), sobre `bloque`. Una línea por cambio.
 */
function cambiosDesempateLooker_(bloque) {
  const ids = idsDerivados_(bloque);
  const viejo = armarAuxMaximos_(bloque, { modo: 'corregido', ids: ids, desempateLegado: true });
  const nuevo = armarAuxMaximos_(bloque, { modo: 'corregido', ids: ids });
  if (viejo.error || nuevo.error) return ['(no se pudo armar Aux_Maximos: ' + (viejo.error || nuevo.error) + ')'];
  // la clave de cada fila: granularidad, nivel, clave, fecha, status (y la figura en MaxPorFiguraFecha / TotalPorFiguraFecha)
  const clave = function (r) { return [r[10], r[11], r[12], _txtSim_(r[4]), r[6], r[10] === 'MaxPorFechaStatus' ? '' : r[0]].join('|'); };
  const mapa = function (filas) { const m = new Map(); filas.forEach(function (r) { m.set(clave(r), r); }); return m; };
  const mV = mapa(viejo.filas), mN = mapa(nuevo.filas), out = [];
  mN.forEach(function (rN, k) {
    const rV = mV.get(k);
    if (!rV || JSON.stringify(rV.map(_txtSim_)) === JSON.stringify(rN.map(_txtSim_))) return;
    const quien = function (r) { return r[0] + ' (' + (r[1] || 'sin barrio') + ', ' + (r[5] || 'sin hora') + ')'; };
    out.push(fmtFecha_(rN[4]) + ' | ' + rN[10] + ' ' + rN[11] + ' "' + rN[12] + '" ' + rN[6] + ' | antes: ' + quien(rV) + ' → ahora: ' + quien(rN) +
             (rN[13] != null ? ' (empate en ' + rN[13] + ' asistentes)' : ''));
  });
  return out.sort();
}

function _logPlanOrden_(plan, bloque) {
  const hdr = bloque[0];
  const iF = findIdxOr_(hdr, ['fecha'], true), iFig = findIdxOr_(hdr, ['figura'], true), iH = findIdxOr_(hdr, ['hora'], true);
  const txt = function (f) {
    const r = bloque[f - 1];
    return (str(r[iFig]) || '(sin figura)') + ' ' + (toDate_(r[iF]) ? fmtFecha_(toDate_(r[iF])) : '(sin FECHA)') + ' ' + valorAgendaComparable_(r[iH], 'HORA');
  };
  Logger.log('--- el plan: filas con datos 2..%s | se moverían %s ---', plan.ultima, plan.mueve.length);
  plan.mueve.slice(0, 20).forEach(function (m) { Logger.log('    fila %s → %s | %s', m.de, m.a, txt(m.de)); });
  if (plan.mueve.length > 20) Logger.log('    … y %s más', plan.mueve.length - 20);
  Logger.log('--- filas sin FECHA (van al final de todo): %s ---', plan.sinFecha.length);
  plan.sinFecha.forEach(function (f) { Logger.log('    fila %s | %s', f, txt(f)); });
}

// ===================== El orden, en la base (pasos 108 y la corrida de la hora) =====================

/** Paso 108 (ESCRIBE): el orden ahora, a mano, con el bloqueo (no depende de BASE_ORDEN_POR_FECHA). */
function ordenarBaseAhora() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(ESPERA_BLOQUEO_MS)) { Logger.log('>>> Hay otra corrida en curso: no se ordena nada.'); return { error: 'hay otra corrida en curso' }; }
  try { return ordenarBase_({ aMano: true, exigirSeco: true }); }
  finally { lock.releaseLock(); }
}

/** La corrida de la hora (con el bloqueo ya tomado), al final: BASE_ORDEN_POR_FECHA. Devuelve lo de `ordenarBase_`. */
function ordenarBaseEnLaHora_() {
  if (!BASE_ORDEN_POR_FECHA) return { apagado: true };
  return ordenarBase_({});
}

/**
 * **Ordenar la base** (con el bloqueo ya tomado). Sólo si hace falta; sin fórmulas; el orden anterior guardado antes (obligatorio);
 * el ordenamiento nativo; la verificación (y la reposición de un formato que la hoja no movió). Devuelve { movidas, corrida,
 * repuestos, distintasDelCalculo, nada (no hacía falta), error }.
 */
function ordenarBase_(opciones) {
  opciones = opciones || {};
  const t0 = Date.now();
  const sh = verificarHojaDestino_(ssDestino_());
  const nCols = sh.getMaxColumns();
  const nFil = sh.getLastRow();
  if (nFil < 3) return { nada: 'la base tiene menos de dos filas' };
  const bloque = sh.getRange(1, 1, nFil, nCols).getValues();
  const plan = planOrdenBase_(bloque);
  if (plan.error) return { error: plan.error };
  if (!plan.mueve.length) { Logger.log('  base ordenada: ya está en orden (%s filas): no se toca.', plan.ultima - 1); return { nada: 'ya en orden', movidas: 0 }; }
  let props = null, ultimaHuella = '';
  try { props = PropertiesService.getScriptProperties(); ultimaHuella = props.getProperty(ORDEN_PROP_HUELLA) || ''; } catch (e) { ultimaHuella = ''; }
  // 20/10 (prompt 09): a mano (paso 108), sólo con la huella del paso 107 LISTO, la misma base, sin vencer; sirve una vez
  if (opciones.exigirSeco) {
    let g = null;
    try { g = JSON.parse(props.getProperty(ORDEN_PROP_HUELLA_SECO) || 'null'); } catch (e) { g = null; }
    const no = !g || !g.h ? 'primero hay que correr el paso 107 (c03, en seco) y que dé LISTO'
      : Date.now() - (g.t || 0) > ORDEN_HUELLA_SECO_HORAS * 3600000 ? 'la huella del paso 107 tiene más de ' + ORDEN_HUELLA_SECO_HORAS + ' horas: volver a correrlo'
      : g.h !== plan.huellaActual ? 'la base cambió desde el paso 107: volver a correrlo' : '';
    if (no) { Logger.log('>>> NO SE ORDENA: %s.', no); return { error: no }; }
    try { props.deleteProperty(ORDEN_PROP_HUELLA_SECO); } catch (e) { /* sirve una vez */ }
  }
  if (!opciones.aMano && ultimaHuella && ultimaHuella === plan.huellaActual) {
    Logger.log('  base ordenada: está como la dejó el último orden (la hoja ordena distinto que el cálculo en %s filas, un empate raro): no se toca.', plan.mueve.length);
    return { nada: 'como la dejó el último orden', movidas: 0 };
  }
  // sin fórmulas (una fórmula de array o una por fila se rompería al mover las filas)
  const fx = sh.getRange(1, 1, plan.ultima, nCols).getFormulas();
  const conF = [];
  fx.forEach(function (r, i) { r.forEach(function (f, k) { if (f && conF.length < 5) conF.push(_a1_(i + 1, k + 1)); }); });
  if (conF.length) { Logger.log('>>> NO SE ORDENA: la base tiene fórmulas (%s…)', conF.join(', ')); return { error: 'la base tiene fórmulas: ' + conF.join(', ') }; }
  // lo de antes: valores, fondos, notas y formatos de las filas 2..ultima
  const n = plan.ultima - 1;
  const rgAntes = sh.getRange(2, 1, n, nCols);
  // 19/10 (revisor): celdas combinadas en el rango → el orden de la hoja falla: no se intenta (ni se guarda nada)
  if (typeof rgAntes.getMergedRanges === 'function' && rgAntes.getMergedRanges().length) {
    Logger.log('>>> NO SE ORDENA: la base tiene celdas combinadas en las filas con datos.');
    return { error: 'la base tiene celdas combinadas' };
  }
  const antes = { valores: bloque.slice(1, plan.ultima), fondos: rgAntes.getBackgrounds(), notas: rgAntes.getNotes(), formatos: rgAntes.getNumberFormats() };
  // el orden anterior, OBLIGATORIO antes de mover nada; y el id, también antes (si la ejecución muere en el medio, el 109 deshace ÉSTE)
  const corrida = Utilities.formatDate(new Date(), RDV_TZ, 'yyyyMMdd-HHmmss') + '-o' + Utilities.getUuid().slice(0, 4);
  try { _guardarOrdenPrevio_(corrida, plan); props.setProperty(ORDEN_PROP_CORRIDA, corrida); }
  catch (err) { Logger.log('>>> NO SE ORDENA: no se pudo guardar el orden anterior (%s)', err); return { error: 'no se pudo guardar el orden anterior: ' + err }; }
  ordenarFilasBase_(sh, plan.ultima, plan.specs);
  SpreadsheetApp.flush();
  if (typeof baseCorridaInvalidar_ === 'function') baseCorridaInvalidar_('se ordenó la base');
  // la verificación
  const v = _verificarOrden_(sh, antes, plan, nCols);
  try { props.setProperty(ORDEN_PROP_HUELLA, v.huellaDespues); } catch (e) { Logger.log('  (la huella del orden no se pudo guardar: %s)', e); }
  // las vistas muestran "Fila del destino": que la próxima corrida las reescriba (49_Aceleraciones.js)
  if (typeof olvidarHuellasVistas === 'function') { try { olvidarHuellasVistas(); } catch (e) { /* la red de seguridad de 6 h igual las rehace */ } }
  if (GUARDIAN_ACTIVO && typeof tomarCopiaSiAlineada_ === 'function') { try { tomarCopiaSiAlineada_(); } catch (e) { Logger.log('  el guardián no pudo tomar la copia: %s', e); } }
  const out = { movidas: plan.mueve.length, corrida: corrida, repuestos: v.repuestos, distintasDelCalculo: v.distintas, error: v.error, ms: Date.now() - t0 };
  Logger.log('>>> BASE ORDENADA (corrida %s): %s filas movidas de %s | formatos repuestos en %s filas | distintas del cálculo %s%s | %s ms. ' +
             'Deshacer: paso 109.', corrida, out.movidas, n, v.repuestos, v.distintas, v.error ? ' | ERROR: ' + v.error : '', out.ms);
  return out;
}

/** Guarda el orden de antes (intermedia, ORDEN_SOLAPA_PREVIO): una fila por fila de la base. Tira si no puede. */
function _guardarOrdenPrevio_(corrida, plan) {
  const ss = ssIntermedia_();
  let sh = ss.getSheetByName(ORDEN_SOLAPA_PREVIO);
  const enc = ['corrida', 'hora', 'posicion', 'clave', 'identidad'];
  if (!sh) { sh = ss.insertSheet(ORDEN_SOLAPA_PREVIO); sh.getRange(1, 1, 1, enc.length).setValues([enc]); }
  const ahora = new Date();
  const filas = plan.filas.map(function (x) { return [corrida, ahora, x.fila, x.clave, x.id]; });
  const desde = sh.getLastRow() + 1;
  sh.getRange(desde, 1, filas.length, enc.length).setValues(filas);
  SpreadsheetApp.flush();
  // 19/10 (revisor): sólo los últimos ORDEN_PREVIOS_GUARDADOS órdenes (la solapa no crece sin límite); los viejos, arriba, se borran
  // (es la intermedia, no la base)
  const col = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return str(r[0]); });
  const corridas = col.filter(function (c, i) { return c && col.indexOf(c) === i; });
  if (corridas.length > ORDEN_PREVIOS_GUARDADOS) {
    const quedan = corridas.slice(-ORDEN_PREVIOS_GUARDADOS);
    let n = 0;
    while (n < col.length && quedan.indexOf(col[n]) < 0) n++;
    if (n) sh.deleteRows(2, n);
  }
}

/** 19/10 (revisor): cuántos órdenes anteriores se guardan en ORDEN_SOLAPA_PREVIO (el paso 109 deshace sólo el último). */
const ORDEN_PREVIOS_GUARDADOS = 5;

/**
 * Después de ordenar: cada fila de ahora es una de antes (por su contenido, como multiconjunto); su fondo, sus notas y sus formatos,
 * los de ESA fila de antes (si no, se reponen); y el orden que dejó la hoja contra el calculado.
 */
function _verificarOrden_(sh, antes, plan, nCols) {
  const n = plan.ultima - 1;
  const rg = sh.getRange(2, 1, n, nCols);
  const ahora = { valores: rg.getValues(), fondos: rg.getBackgrounds(), notas: rg.getNotes(), formatos: rg.getNumberFormats() };
  const libres = new Map();
  antes.valores.forEach(function (r, i) {
    const k = claveContenidoFila_(r);
    if (!libres.has(k)) libres.set(k, []);
    libres.get(k).push(i);
  });
  const de = [];
  let error = '';
  ahora.valores.forEach(function (r, j) {
    const l = libres.get(claveContenidoFila_(r));
    if (!l || !l.length) { if (!error) error = 'la fila ' + (j + 2) + ' quedó con un contenido que no tenía ninguna fila antes'; de.push(null); return; }
    de.push(l.shift());
  });
  // los formatos de cada fila, los de su fila de antes (19/10, revisor: sólo las filas que difieren)
  const reponer = [];
  de.forEach(function (i, j) {
    if (i != null && ['fondos', 'notas', 'formatos'].some(function (k) { return JSON.stringify(antes[k][i]) !== JSON.stringify(ahora[k][j]); })) {
      reponer.push({ fila: j + 2, fondos: antes.fondos[i], notas: antes.notas[i], formatos: antes.formatos[i] });
    }
  });
  const repuestos = reponer.length;
  if (repuestos && !error) {
    Logger.log('  ATENCIÓN: la hoja no movió los fondos / notas / formatos de %s filas con sus valores: se reponen (cada uno a su fila).', repuestos);
    reponerFormatoFilas_(sh, reponer);
  }
  const bAhora = [plan.hdr].concat(ahora.valores);
  const despues = ahora.valores.map(function (r, j) { return { clave: claveContenidoFila_(r), id: identidadFilaSim_(bAhora, j + 2) }; });
  let distintas = 0;
  plan.orden.forEach(function (x, j) { if (!despues[j] || despues[j].clave !== x.clave) distintas++; });
  if (distintas) Logger.log('  la hoja ordenó distinto que el cálculo en %s filas (un empate raro, p. ej. una HORA tipeada como texto): ' +
                            'queda como lo dejó la hoja y no se vuelve a ordenar hasta que algo cambie.', distintas);
  if (error) Logger.log('>>> ERROR DE VERIFICACIÓN: %s. No se repuso nada: mirar la base y, si hace falta, deshacer (paso 109).', error);
  return { repuestos: repuestos, distintas: distintas, error: error, huellaDespues: _huellaOrden_(despues) };
}

// ===================== Paso 109: deshacer el orden =====================

/**
 * **Vuelve la base al orden anterior al último orden del sistema** (ORDEN_PROP_CORRIDA, o `corrida`). Cada fila de hoy, a su lugar
 * de antes: por su contenido y, si cambió desde el orden (la corrida de la hora le escribió algo), por su identidad (agenda_uid,
 * RDV_UID o figura + fecha + hora + barrio). Las que no estaban (nuevas) quedan después, en el orden de hoy. Con el bloqueo; en
 * seco sólo dice cuántas filas se moverían.
 */
function deshacerOrdenBase(enSeco, corrida) {
  const lock = enSeco ? null : LockService.getScriptLock();
  if (lock && !lock.tryLock(ESPERA_BLOQUEO_MS)) { Logger.log('>>> Hay otra corrida en curso: no se deshace nada.'); return { error: 'hay otra corrida en curso' }; }
  try { return _deshacerOrden_(!!enSeco, corrida); }
  finally { if (lock) lock.releaseLock(); }
}

function _deshacerOrden_(enSeco, corrida) {
  let id = corrida || '';
  if (!id) { try { id = PropertiesService.getScriptProperties().getProperty(ORDEN_PROP_CORRIDA) || ''; } catch (e) { id = ''; } }
  Logger.log('=== paso 109: deshacer el orden %s (%s) ===', id || '(ninguno guardado)', enSeco ? 'EN SECO' : 'REAL');
  if (!id) return { error: 'no hay ningún orden guardado' };
  const hs = ssIntermedia_().getSheetByName(ORDEN_SOLAPA_PREVIO);
  if (!hs || hs.getLastRow() < 2) return { error: 'no está ' + ORDEN_SOLAPA_PREVIO };
  const prev = hs.getRange(2, 1, hs.getLastRow() - 1, 5).getValues().filter(function (r) { return str(r[0]) === id; })
    .map(function (r) { return { pos: num(r[2]), clave: str(r[3]), id: str(r[4]) }; });
  if (!prev.length) return { error: 'el orden ' + id + ' no está en ' + ORDEN_SOLAPA_PREVIO };
  const sh = verificarHojaDestino_(ssDestino_());
  const bloque = sh.getRange(1, 1, sh.getLastRow(), sh.getMaxColumns()).getValues();
  const plan = planOrdenBase_(bloque);
  const porClave = new Map(), porId = new Map();
  prev.forEach(function (p) {
    if (!porClave.has(p.clave)) porClave.set(p.clave, []); porClave.get(p.clave).push(p);
    if (p.id) { if (!porId.has(p.id)) porId.set(p.id, []); porId.get(p.id).push(p); }
  });
  const usado = new Set();
  const tomar = function (lista) { const p = (lista || []).filter(function (x) { return !usado.has(x); })[0]; if (p) usado.add(p); return p || null; };
  const destino = plan.filas.map(function (x) {
    const p = tomar(porClave.get(x.clave)) || (x.id && !/^fila:\|/.test(x.id) ? tomar(porId.get(x.id)) : null);
    return { x: x, pos: p ? p.pos : null };
  });
  const maxPos = Math.max.apply(null, prev.map(function (p) { return p.pos; }));
  let extra = 0;
  destino.forEach(function (d) { if (d.pos == null) d.pos = maxPos + (++extra); });   // las nuevas, después, en el orden de hoy
  const rank = destino.slice().sort(function (a, b) { return a.pos - b.pos || a.x.fila - b.x.fila; });
  const posiciones = new Array(destino.length);
  rank.forEach(function (d, j) { posiciones[d.x.fila - 2] = j + 1; });
  const moverian = posiciones.filter(function (p, i) { return p !== i + 1; }).length;
  Logger.log('  filas %s | vuelven a su lugar de antes %s | nuevas desde el orden (quedan después) %s | se moverían %s', destino.length,
             destino.length - extra, extra, moverian);
  if (enSeco || !moverian) { if (!moverian) Logger.log('  ya está en el orden de antes.'); return { corrida: id, moverian: moverian }; }
  // 19/10 (revisor): la misma verificación que el orden (cada fila con sus valores, fondos, notas y formatos; si no, se reponen)
  const nCols = sh.getMaxColumns();
  const rgA = sh.getRange(2, 1, plan.ultima - 1, nCols);
  const antes = { valores: bloque.slice(1, plan.ultima), fondos: rgA.getBackgrounds(), notas: rgA.getNotes(), formatos: rgA.getNumberFormats() };
  ordenarFilasPorPosicion_(sh, plan.ultima, posiciones);
  SpreadsheetApp.flush();
  const v = _verificarOrden_(sh, antes, { ultima: plan.ultima, hdr: plan.hdr, orden: rank.map(function (d) { return d.x; }) }, nCols);
  if (v.error) Logger.log('>>> ATENCIÓN (deshacer el orden): %s', v.error);
  if (typeof baseCorridaInvalidar_ === 'function') baseCorridaInvalidar_('se deshizo el orden de la base');
  try {
    const props = PropertiesService.getScriptProperties();
    props.deleteProperty(ORDEN_PROP_CORRIDA);
    props.setProperty(ORDEN_PROP_HUELLA, _huellaOrden_(planOrdenBase_(sh.getRange(1, 1, sh.getLastRow(), sh.getMaxColumns()).getValues()).filas));
  } catch (e) { /* el log lo dice */ }
  if (typeof olvidarHuellasVistas === 'function') { try { olvidarHuellasVistas(); } catch (e) { /* nada */ } }
  Logger.log('>>> deshecho: %s filas volvieron a su lugar. Mientras BASE_ORDEN_POR_FECHA esté prendido, la corrida siguiente NO la vuelve a ordenar ' +
             '(es la secuencia que dejó el sistema); para que no se ordene más, apagar el interruptor.', moverian);
  return { corrida: id, movidas: moverian };
}
