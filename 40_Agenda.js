/**
 * 40_Agenda.js — AGENDA, ETAPA 2: crear y actualizar filas del destino desde los mails de agenda (06/10).
 *
 * Prompt: docs/prompts/PROMPT-06-AGENDA-ETAPA2-CREAR-ACTUALIZAR.md. Estado y predicciones: docs/ESTADO.md, 0.z.
 * Para el equipo: docs/agenda-equipo.md. El parser y el barrio desde la dirección: 41_AgendaParser.js.
 *
 * Toda escritura en el destino pasa por la excepción anunciada `escribirAgendaLote_` (05_Escritura.js, CLAUDE.md
 * sección 0): sólo sus columnas, sólo si la celda todavía tiene lo que el sistema espera, STATUS sólo por sus tres
 * transiciones. Las decisiones del usuario (las diez del prompt), en el código:
 *
 *   1. fuente: Gmail, etiqueta AGENDA_ETIQUETA_GMAIL; por semana + grupo vale la ÚLTIMA versión (el parser);
 *   2. alcance: reuniones desde hoy − DIAS_ACTIVOS en adelante (o sólo AGENDA_SOLO_SEMANA). Las viejas sin fila van a
 *      AGENDA_VIEJAS_SIN_FILA (informativa), no se crean;
 *   3. fila nueva AL FINAL: Figura (la 1ª nombrada; vacía en Seguridad en tu Barrio), EVENTO (AGENDA_EVENTO_POR_TIPO),
 *      FECHA, HORA, Dirección (la línea "Lugar:" del mail, tal cual), STATUS "en agenda", Barrio (sólo con la regla
 *      de confianza), "No participa" y la traza agenda_*. Todo en COLOR_SISTEMA. Las derivadas, en la misma corrida;
 *   4. sin duplicados: si ya hay fila de la figura (o de otra figura de la conjunta) ese día —o, sin figura, ese día y
 *      en ese lugar— se VINCULA (agenda_uid + sólo celdas vacías). Con 2+ candidatas, nada y se lista;
 *   5. actualizaciones: sólo filas "en agenda", y sólo celdas que todavía tienen lo que escribió el sistema
 *      (agenda_*_escrita). Si alguien la cambió: "editada por el equipo", no se toca nunca más;
 *   6. reprogramación dentro de la semana: se MUEVE la fecha de la fila (si está "en agenda" y la FECHA es del
 *      sistema). Entre semanas: la vieja se suspende (7), la nueva se crea y el par se lista;
 *   7. cancelación: desaparecida de la última versión, si todavía era FUTURA cuando se mandó la versión que la dejó
 *      afuera, y la fila está "en agenda": si la fila la CREÓ la agenda y nadie la tocó (`filaIntocadaAgenda_`), se
 *      BORRA (06/10, decisión del usuario; se guarda entera en REGISTRO_AGENDA_CAMBIOS y deshacer la restaura); si no,
 *      → "Suspendida". Con la protección del 60% (versión parcial) no se suspende ni se borra nada. Si vuelve a
 *      aparecer: una borrada se crea de nuevo; una "Suspendida" puesta por el sistema vuelve a "en agenda";
 *   8. Seguridad en tu Barrio: la fila nace sin figura; la Figura sale de RDV CONJUNTO por fecha + barrio (o comuna)
 *      cuando aparece. Ambigua o sin fila todavía → AGENDA_FIGURA_A_COMPLETAR (la carga el equipo en la fila);
 *   9. corre dentro del activador de cada hora si AGENDA_ACTIVA, antes del cruce con los formularios;
 *  10. sobre el destino real: versión con nombre, en seco primero, una semana primero, deshacer (paso 38);
 *  17. la COPIA en el archivo "Agenda" (AGENDA_COPIA_SS, solapa AGENDA_COPIA_SOLAPA): una fila por reunión, reescrita
 *      entera en cada corrida, con formato y protegida con advertencia (`armarCopiaAgenda_`, `escribirCopiaAgenda_`).
 *      Deshacer no la toca: se regenera en la corrida siguiente.
 *
 * --- Filas que carga o borra el equipo (07/10, prompt 07) ---
 * Antes de CREAR, además de figura + fecha exacta: si hay una fila del equipo (sin agenda_uid) de la misma figura a
 * ±AGENDA_DUP_DIAS días, o de la misma fecha y comuna con otra figura o sin figura, NO se crea: va a AGENDA_DUPLICADOS
 * (archivo del destino, con ELEGIR); la elección se aplica en la corrida siguiente. Los duplicados que aparecen DESPUÉS
 * de crear se listan ahí también (el sistema no borra ni fusiona nada solo). Una fila que creó la agenda y el equipo
 * BORRÓ no se vuelve a crear mientras la reunión siga en el mail ("borrada por el equipo"); si la reunión sale del mail
 * y vuelve, es nueva. "Origen fila" y "Tocado por el equipo" dicen quién creó la fila y qué cambió el equipo; las
 * columnas "(mail)" guardan lo que la forma del equipo no guarda.
 *
 * --- Una celda "del equipo" o "del sistema" ---
 * Cuando la agenda escribe una celda, guarda lo que escribió en `agenda_*_escrita`. Al vincular una fila que ya
 * existía, una celda del equipo que **replica lo que dice el mail** (el mismo valor) se trata como del sistema (se
 * anota en `agenda_*_escrita`) y sigue al mail; una que dice otra cosa es del equipo y no se toca.
 */

// ===================== Puntos de entrada =====================

/** La agenda a mano (paso 37), con su propio bloqueo. `enSeco`: calcula, loguea, registra; no escribe el destino. */
function correrAgenda(enSeco, opciones) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(ESPERA_BLOQUEO_MS)) {
    Logger.log('>>> Hay otra corrida (upsert o agenda) en curso: la agenda no hace nada (LockService).');
    return null;
  }
  try {
    return correrAgendaEnBloqueo_(enSeco, opciones);
  } finally {
    lock.releaseLock();
  }
}

/**
 * La agenda, con el bloqueo ya tomado (lo llama `correrAgenda` y, con AGENDA_ACTIVA, el upsert de cada hora antes
 * del cruce con los formularios). Si Gmail falla, no escribe nada y lo dice.
 */
function correrAgendaEnBloqueo_(enSeco, opciones) {
  const t0 = Date.now();
  opciones = opciones || {};
  Logger.log('=== agenda (%s)%s — destino: %s ===', enSeco ? 'EN SECO, no escribe el destino' : 'ESCRITURA REAL',
             AGENDA_SOLO_SEMANA ? ' — SÓLO LA SEMANA DEL ' + AGENDA_SOLO_SEMANA : '', descripcionHojaDestino_());
  const sh = verificarHojaDestino_(ssDestino_());
  const dest = leerDestino_();
  const A = indicesAgenda_(dest.hdr);
  if (A.faltan.length) {
    const msg = 'faltan las columnas de la agenda en el destino: ' + A.faltan.join(', ') + ' (paso36_columnasAgenda)';
    if (!enSeco) { Logger.log('>>> %s. No se escribió nada.', msg); _registrarAgenda_(null, enSeco, t0, msg); return { error: msg }; }
    Logger.log('  AVISO: %s. En seco se calcula igual, como si estuvieran vacías.', msg);
  }
  const alcance = alcanceAgenda_();
  let mails;
  try {
    const desdeCopia = AGENDA_COPIA_DESDE ? toDate_(AGENDA_COPIA_DESDE) : null;
    const leerDesde = desdeCopia && desdeCopia < alcance.desde ? desdeCopia : alcance.desde;
    mails = opciones.mails ? { fuente: '(lista de prueba)', lista: opciones.mails }
                           : leerMailsAgendaGmail_(new Date(leerDesde.getTime() - 7 * 86400000));
  } catch (err) {
    const msg = 'no se pudieron leer los mails: ' + err;
    Logger.log('>>> %s. No se escribió nada.', msg);
    _registrarAgenda_(null, enSeco, t0, msg);
    return { error: msg };
  }
  Logger.log('  mails: %s (%s) | alcance: %s', mails.lista.length, mails.fuente, alcance.desc);
  _logMailsAgenda_(mails);
  if (!mails.lista.length) {
    const msg = 'la búsqueda no trajo ningún mail: no se escribe nada (si hay mails con la etiqueta, revisar la cuenta)';
    Logger.log('>>> %s', msg);
    _registrarAgenda_(null, enSeco, t0, msg);
    return { error: msg };
  }
  const r = agendaDesdeListaDeMails_(mails.lista, mails);
  _logCoberturaAgenda_(r, alcance);
  const plan = planAgenda_(dest, r, A, alcance, Object.assign({ enSeco: enSeco }, opciones));
  plan.hdrNombres = dest.hdr;
  logPlanAgenda_(plan, dest);
  if (!enSeco) {
    // REGISTRO_AGENDA es obligatorio: sin él no se puede deshacer. Si no se puede escribir, no se escribe el destino.
    const corrida = _idCorridaAgenda_();
    try {
      plan.escrito = aplicarPlanAgenda_(sh, dest, plan, corrida);
    } catch (err) {
      const msg = String(err && err.message || err);
      Logger.log('>>> %s', msg);
      if (/REGISTRO_AGENDA/.test(msg)) return { error: msg };
      throw err;
    }
    plan.corrida = corrida;
    if (DERIVADAS_POR_SCRIPT && (plan.escrito.creadas || plan.escrito.borradas)) {
      try { recalcDerivadas_(RDV_HOJA_DESTINO, true); }
      catch (err) { Logger.log('>>> las derivadas NO se recalcularon: %s (la corrida sigue)', err); }
    }
  }
  _escribirSolapasAgenda_(plan);
  if (!enSeco) {
    // AGENDA_DUPLICADOS (archivo del destino) y las elecciones leídas: no son obligatorias, el destino ya quedó escrito.
    try { _guardarEleccionesAgenda_(plan); }
    catch (err) { Logger.log('>>> %s NO se guardó: %s (las elecciones siguen en la solapa)', RDV_HOJA_ELECCIONES_AGENDA, err); }
    try { escribirDuplicadosAgenda_(plan); }
    catch (err) { Logger.log('>>> %s NO se escribió: %s', AGENDA_SOLAPA_DUPLICADOS, err); }
  } else if (plan.duplicados.length) {
    Logger.log('  %s: en seco no se escribe (tendría %s reuniones).', AGENDA_SOLAPA_DUPLICADOS, plan.duplicados.length);
  }
  // 17. La copia en el archivo "Agenda": en seco sólo dice cuántas filas escribiría.
  const copia = armarCopiaAgenda_(plan, new Date());
  plan.resumen.copia = copia.length - 1;
  if (plan.repetidasCopia) Logger.log('  copia en el archivo "Agenda": %s líneas repetidas no se escriben (una por reunión)', plan.repetidasCopia);
  if (enSeco) Logger.log('  copia en el archivo "Agenda": escribiría %s filas (en seco no se escribe).', copia.length - 1);
  else {
    try { escribirCopiaAgenda_(copia, plan); }
    catch (err) { Logger.log('>>> la copia en el archivo "Agenda" NO se escribió: %s (el destino ya quedó escrito).', err); }
  }
  if (enSeco) plan.corrida = _registrarAgenda_(plan, enSeco, t0, '');
  else _completarRegistroAgenda_(plan, t0);
  // Que nada quede pendiente para el flush implícito del final de la ejecución (07/10: la ejecución terminó en Error
  // ahí, con REGISTRO_AGENDA sin escribir). Si falla, se dice y la corrida termina igual.
  try { SpreadsheetApp.flush(); } catch (err) { Logger.log('>>> el flush final falló: %s (lo anterior ya se había escrito con su flush)', err); }
  Logger.log('agenda: %s ms', Date.now() - t0);
  return plan.resumen;
}

/** En seco (paso 37): lo que crearía, vincularía, actualizaría, movería y suspendería. */
function correrAgendaEnSeco() { return correrAgenda(true); }

/** Real (paso 37). Respeta DRY_RUN (con DRY_RUN = true, también en seco). */
function correrAgendaReal() { return correrAgenda(DRY_RUN); }

// ===================== El alcance y las columnas =====================

/** El alcance: desde hoy − DIAS_ACTIVOS (o la semana de AGENDA_SOLO_SEMANA) en adelante. */
function alcanceAgenda_() {
  if (AGENDA_SOLO_SEMANA) {
    const lunes = toDate_(AGENDA_SOLO_SEMANA);
    if (!lunes) throw new Error('AGENDA_SOLO_SEMANA no es una fecha "yyyy-MM-dd": ' + AGENDA_SOLO_SEMANA);
    const fin = alMediodia_(lunes.getFullYear(), lunes.getMonth() + 1, lunes.getDate() + 6) ||
                new Date(lunes.getTime() + 6 * 86400000);
    return { desde: lunes, hasta: fin, desc: 'sólo la semana del ' + fmtFecha_(lunes) + ' al ' + fmtFecha_(fin) };
  }
  const desde = inicioActivas_() || hoyMediodia_();
  return { desde: desde, hasta: null, desc: 'desde ' + fmtFecha_(desde) + ' (hoy − ' + DIAS_ACTIVOS + ') en adelante' };
}

function _enAlcance_(alcance, fecha) {
  if (!fecha) return false;
  const d = ymd_(fecha);
  return d >= ymd_(alcance.desde) && (!alcance.hasta || d <= ymd_(alcance.hasta));
}

/** Los índices (0-based) de las columnas que usa la agenda, por encabezado. `faltan`: las de COLUMNAS_AGENDA ausentes. */
function indicesAgenda_(hdr) {
  const I = { faltan: [] };
  COLUMNAS_AGENDA.concat(['Figura', 'EVENTO', 'FECHA', 'HORA', 'Barrio', 'STATUS REUNIÓN']).forEach(function (n) {
    I[n] = findIdxOr_(hdr, aliasColumna_(n), true);
    if (I[n] == null && COLUMNAS_AGENDA.indexOf(n) >= 0) I.faltan.push(n);
  });
  I['Dirección'] = findIdxOr_(hdr, ['direccion', 'dirección'], true);
  return I;
}

// ===================== El plan (en memoria, no escribe nada) =====================

/**
 * Decide qué hace la agenda con cada reunión del alcance. Devuelve `{ acciones, listas, resumen }`; cada acción tiene
 * sus escrituras ({fila, col, valor, esperado}, col 1-based) y un `tipo` (crear, vincular, actualizar, mover,
 * suspender, reactivar, figura). Las filas nuevas se numeran a partir de la primera vacía después de la última con
 * datos. `opciones.geocodificar` reemplaza al geocodificador (tests).
 */
function planAgenda_(dest, r, A, alcance, opciones) {
  opciones = opciones || {};
  const P = { A: A, filaDe: new Map(), duplicadasEnCorrida: [], duplicados: [], borradasEquipo: [], cancelacionSigue: [], acciones: [], ambiguas: [], editadas: [], noEnAgenda: [], reprogramadasNoMovibles: [], entreSemanas: [],
              saltadas60: [], noFuturas: [], viejasSinFila: [], figuraACompletar: [], eventoPorTipo: {}, barrio: {},
              alcance: alcance, r: r, A: A, resumen: {} };
  const val = function (f, n) { return A[n] == null ? '' : f.valores[A[n]]; };
  const cmp = function (v, n) { return valorAgendaComparable_(v, n); };
  const col = function (n) { return A[n] == null ? null : A[n] + 1; };

  // Índices del destino
  const porFigFecha = new Map(), porFecha = new Map(), usadas = new Set();
  let ultima = 1;
  dest.filas.forEach(function (f) {
    ultima = Math.max(ultima, f.fila);
    if (!f.fecha) return;
    const k = normalizeText_(f.figura) + '|' + ymd_(f.fecha);
    if (!porFigFecha.has(k)) porFigFecha.set(k, []);
    porFigFecha.get(k).push(f);
    const kf = ymd_(f.fecha);
    if (!porFecha.has(kf)) porFecha.set(kf, []);
    porFecha.get(kf).push(f);
  });
  // Las filas con algo en las columnas de la agenda también cuentan para "la última con datos".
  dest.filas.forEach(function (f) { if (A.agenda_uid != null && !esVacio_(f.valores[A.agenda_uid])) ultima = Math.max(ultima, f.fila); });
  P.ultimaConDatos = ultima;
  let proxima = ultima + 1;
  const filasDe = function (fig, fecha) { return porFigFecha.get(normalizeText_(fig) + '|' + ymd_(fecha)) || []; };
  // Las figuras que nombra el mail en cualquier versión, por fecha: una fila de ésas es de su reunión.
  const nombradas = new Set();
  r.ultimas.concat(r.desaparecidas).forEach(function (x) {
    if (x.fecha) x.figuras.forEach(function (fig) { nombradas.add(normalizeText_(fig) + '|' + ymd_(x.fecha)); });
  });
  const ubica = function (ev, f) {
    if (!f.barrio) return false;
    if (ev.barrio) return normalizeText_(_canonBarrioAg_(ev.barrio) || ev.barrio) === normalizeText_(_canonBarrioAg_(f.barrio) || f.barrio);
    if (ev.comuna != null) {
      if (_comunaBarrioAg_(f.barrio) !== ev.comuna) return false;
      if (ev.comuna === 1 && ev.subzona) { const sz = _subzonaBarrioAg_(f.barrio); return !sz || sz === ev.subzona; }
      return true;
    }
    return false;
  };
  /** Las filas candidatas de una reunión (regla 4). */
  const candidatas = function (ev) {
    let c = [];
    if (ev.figuraFila) {
      c = filasDe(ev.figuraFila, ev.fecha);
      for (let i = 1; !c.length && i < ev.figuras.length; i++) c = filasDe(ev.figuras[i], ev.fecha);
    } else {
      const delDia = porFecha.get(ymd_(ev.fecha)) || [];
      const dir = normalizeText_(ev.lugarTexto);
      c = delDia.filter(function (f) {
        if (!esVacio_(val(f, 'agenda_uid')) && normalizeText_(val(f, 'agenda_direccion_escrita')) === dir && dir) return true;
        if (!f.figura && (ubica(ev, f) || (dir && normalizeText_(val(f, 'Dirección')) === dir))) return true;
        return ubica(ev, f) && !nombradas.has(normalizeText_(f.figura) + '|' + ymd_(f.fecha));
      });
    }
    if (c.length > 1 && ev.hora) {
      const h = c.filter(function (f) { return cmp(val(f, 'HORA'), 'HORA') === ev.hora; });
      if (h.length === 1) c = h;
    }
    return c;
  };

  // Barrio desde la dirección (regla de confianza con el margen), con cache entre corridas.
  const barrioDe = _barrioAgenda_(opciones, P);

  // 07/10: el historial de la agenda (qué filas creó, para saber cuáles BORRÓ el equipo) y las elecciones de
  // AGENDA_DUPLICADOS. Si el historial no se puede leer, en la corrida real NO se crea nada (podría recrear una borrada).
  const hist = opciones.historial || leerHistorialAgenda_();
  P.historial = hist;
  const uidsEnDestino = new Set();
  dest.filas.forEach(function (f) { if (!esVacio_(val(f, 'agenda_uid'))) uidsEnDestino.add(str(val(f, 'agenda_uid'))); });
  const borradaPorEquipo = {};
  hist.creadas.forEach(function (id, uid) { if (!uidsEnDestino.has(uid) && !hist.olvidadas.has(uid)) borradaPorEquipo[id] = uid; });
  P.borradaPorEquipo = borradaPorEquipo;
  const elecciones = opciones.elecciones || leerEleccionesAgenda_();
  P.elecciones = elecciones;
  P.eleccionesAplicadas = [];
  const comunaDeEv = function (ev) { return ev.comuna != null ? ev.comuna : (ev.barrio ? _comunaBarrioAg_(ev.barrio) : null); };
  /** Filas del equipo (sin agenda_uid) parecidas a una reunión (punto 7): la misma figura a ±AGENDA_DUP_DIAS días, o la
   *  misma fecha y comuna con otra figura o sin figura (y que no sea la fila de otra reunión del mail). */
  const casiDuplicados = function (ev, incluirMismaFecha) {
    const out = [];
    const figs = (ev.participan || ev.figuras).map(normalizeText_);   // "NO PARTICIPA" no cuenta
    const com = comunaDeEv(ev);
    dest.filas.forEach(function (f) {
      if (!f.fecha || !esVacio_(val(f, 'agenda_uid')) || usadas.has(f.fila)) return;
      const d = Math.abs(diasEntre_(f.fecha, ev.fecha));
      const mismaFig = f.figura && figs.indexOf(normalizeText_(f.figura)) >= 0;
      let dif = '';
      if (mismaFig && d <= AGENDA_DUP_DIAS && (incluirMismaFecha || d > 0)) dif = d ? 'fecha (' + d + ' día' + (d > 1 ? 's' : '') + ')' : 'misma figura y fecha';
      else if (d === 0 && com != null && f.barrio && _comunaBarrioAg_(f.barrio) === com && !mismaFig &&
               !nombradas.has(normalizeText_(f.figura) + '|' + ymd_(f.fecha))) dif = f.figura ? 'figura (' + f.figura + ')' : 'figura (vacía)';
      if (!dif) return;
      const h = valorAgendaComparable_(val(f, 'HORA'), 'HORA');
      if (ev.hora && h && h !== ev.hora) dif += ', hora (' + h + ' / ' + ev.hora + ')';
      out.push({ f: f, diferencia: dif });
    });
    return out;
  };

  const enAlcance = r.unicas.filter(function (ev) { return _enAlcance_(alcance, ev.fecha); });
  const planeadas = {};
  // Presentes: las claves de TODAS las últimas versiones (también las repetidas en otro grupo y la clave de su mail).
  const presentes = new Set();
  r.ultimas.concat(r.unicas).forEach(function (ev) { presentes.add(ev.clave); if (ev.claveGrupo) presentes.add(ev.claveGrupo); });
  const atendidas = new Set();

  // --- 6. reprogramación dentro de la semana: la desaparecida y la misma figura en otra fecha de la última versión ---
  r.desaparecidas.forEach(function (d) {
    if (!d.figuraFila || !_enAlcance_(alcance, d.fecha) || presentes.has(d.clave)) return;
    const nuevas = enAlcance.filter(function (u) {
      return u.grupo === d.grupo && ymd_(u.desde) === ymd_(d.desde) && u.figuraFila === d.figuraFila &&
             ymd_(u.fecha) !== ymd_(d.fecha) && !candidatas(u).length;
    });
    if (nuevas.length !== 1) return;
    const u = nuevas[0];
    const filas = filasDe(d.figuraFila, d.fecha);
    atendidas.add(d.clave); atendidas.add(u.clave);
    if (filas.length !== 1) {
      if (filas.length > 1) P.ambiguas.push({ ev: u, motivo: 'reprogramada: ' + filas.length + ' filas en la fecha vieja', filas: filas });
      else atendidas.delete(u.clave);    // sin fila vieja: se crea la nueva normalmente
      return;
    }
    const f = filas[0];
    const status = val(f, 'STATUS REUNIÓN'), fecha = val(f, 'FECHA');
    const fechaDelSistema = !esVacio_(val(f, 'agenda_fecha_escrita')) && cmp(fecha, 'FECHA') === cmp(val(f, 'agenda_fecha_escrita'), 'FECHA');
    if (normStatus_(status) !== 'en agenda' || !fechaDelSistema) {
      P.reprogramadasNoMovibles.push({ f: f, de: d, a: u, motivo: normStatus_(status) !== 'en agenda' ? 'STATUS ' + status : 'la FECHA es del equipo' });
      return;
    }
    const esc = [
      { fila: f.fila, col: col('FECHA'), valor: u.fecha, esperado: fecha },
      { fila: f.fila, col: col('agenda_fecha_escrita'), valor: u.fecha, esperado: val(f, 'agenda_fecha_escrita') }
    ];
    P.acciones.push({ tipo: 'mover', f: f, ev: u, de: d, escrituras: esc, detalle: fmtFecha_(d.fecha) + ' → ' + fmtFecha_(u.fecha) });
    P.filaDe.set(u.clave, { fila: f.fila, status: status, f: f, reprogramadaDe: d.fecha });
    usadas.add(f.fila);
    // y sigue al mail en lo demás (hora, dirección…), como cualquier fila de la agenda
    _accionActualizar_(P, f, u, A, barrioDe, { fechaYaMovida: true });
  });

  // --- 1-5. cada reunión del alcance: vincular, actualizar o crear ---
  enAlcance.forEach(function (ev) {
    if (atendidas.has(ev.clave)) return;
    // 07/10: "Es la misma: vincular" vale también en las corridas siguientes, aunque la fila del equipo tenga otra fecha:
    // la fila elegida se encuentra por su identidad (figura + fecha + barrio), no por la de la reunión.
    const elV = elecciones.get(idReunionAgenda_(ev));
    if (elV && elV.eleccion === 'vincular') {
      const fe = dest.filas.filter(function (f) { return !usadas.has(f.fila) && !esVacio_(val(f, 'agenda_uid')) && idFilaAgenda_(f) === elV.idFila; })[0];
      if (fe) {
        usadas.add(fe.fila);
        P.filaDe.set(ev.clave, { fila: fe.fila, status: val(fe, 'STATUS REUNIÓN'), f: fe });
        _accionActualizar_(P, fe, ev, A, barrioDe, {});
        return;
      }
    }
    let c = candidatas(ev).filter(function (f) { return !usadas.has(f.fila); });
    if (c.length > 1) {
      const deAgenda = c.filter(function (f) { return !esVacio_(val(f, 'agenda_uid')); });
      if (deAgenda.length === 1) c = deAgenda;      // la de la agenda; la otra queda como duplicado posterior (abajo)
    }
    if (c.length > 1) { P.ambiguas.push({ ev: ev, motivo: c.length + ' filas candidatas', filas: c }); return; }
    if (c.length === 1) {
      const f = c[0];
      usadas.add(f.fila);
      P.filaDe.set(ev.clave, { fila: f.fila, status: val(f, 'STATUS REUNIÓN'), f: f });
      // Lo que escribe hoy el equipo en EVENTO, por tipo del mail (para ajustar AGENDA_EVENTO_POR_TIPO).
      const e = str(val(f, 'EVENTO'));
      if (e) { const t = P.eventoPorTipo[ev.tipo || '(sin tipo)'] = P.eventoPorTipo[ev.tipo || '(sin tipo)'] || {}; t[e] = (t[e] || 0) + 1; }
      if (esVacio_(val(f, 'agenda_uid'))) _accionVincular_(P, f, ev, A, barrioDe);
      else _accionActualizar_(P, f, ev, A, barrioDe, {});
      return;
    }
    // Crear, al final — salvo que ya se vaya a crear en esta misma corrida la misma reunión (figura + fecha + hora; sin
    // figura, fecha + hora + lugar): el control de "ya existe" mira también lo planeado, no sólo el destino (07/10).
    const kPlan = (ev.figuraFila ? normalizeText_(ev.figuraFila) : 'sin_figura|' + normalizeText_(ev.lugar)) + '|' + ymd_(ev.fecha) + '|' + ev.hora;
    if (planeadas[kPlan]) {
      P.duplicadasEnCorrida.push({ ev: ev, fila: planeadas[kPlan] });
      P.filaDe.set(ev.clave, { fila: planeadas[kPlan], status: 'en agenda', nueva: true });
      return;
    }
    // 07/10: ¿una fila que creó la agenda y el equipo BORRÓ? No se vuelve a crear (salvo que la reunión haya salido del
    // mail y vuelto: entonces es "nueva en la última versión", o el historial ya la olvidó).
    const idR = idReunionAgenda_(ev);
    if (borradaPorEquipo[idR] && ev.cambios !== 'nueva en la última versión') {
      P.borradasEquipo.push({ ev: ev, uid: borradaPorEquipo[idR] });
      P.filaDe.set(ev.clave, { fila: null, status: '', borradaEquipo: true });
      return;
    }
    if (hist.error && !opciones.enSeco) {
      P.noCreadasSinHistorial = (P.noCreadasSinHistorial || 0) + 1;
      return;
    }
    // 07/10: ¿una fila del equipo parecida? No se crea: se pregunta en AGENDA_DUPLICADOS (o se aplica lo que se eligió).
    const casi = casiDuplicados(ev, false);
    if (casi.length) {
      const el = elecciones.get(idR);
      const elegida = el && el.eleccion === 'vincular' ? casi.filter(function (x) { return idFilaAgenda_(x.f) === el.idFila; })[0] : null;
      if (elegida) {
        usadas.add(elegida.f.fila);
        P.filaDe.set(ev.clave, { fila: elegida.f.fila, status: val(elegida.f, 'STATUS REUNIÓN'), f: elegida.f });
        P.eleccionesAplicadas.push({ id: idR, eleccion: 'vincular', fila: elegida.f.fila });
        _accionVincular_(P, elegida.f, ev, A, barrioDe);
        return;
      }
      if (!(el && el.eleccion === 'crear')) {
        P.duplicados.push({ tipo: 'antes', ev: ev, id: idR, candidatas: casi, eleccion: el || null });
        P.filaDe.set(ev.clave, { fila: null, status: '', duplicado: true });
        return;
      }
      P.eleccionesAplicadas.push({ id: idR, eleccion: 'crear' });
    }
    const fila = proxima++;
    planeadas[kPlan] = fila;
    const b = barrioDe(ev);
    const lugar = _direccionAgenda_(ev);
    const hora = horaAgendaEquipo_(ev);
    const valores = {
      'Figura': ev.figuraFila || '', 'EVENTO': eventoAgenda_(ev), 'FECHA': ev.fecha,
      'HORA': hora, 'Dirección': lugar, 'STATUS REUNIÓN': 'en agenda', 'Barrio': b.barrio,
      'agenda_uid': uidAgenda_('creada'), 'agenda_mail': _origenAgenda_(ev),
      'agenda_version': ev.version + ' de ' + ev.versiones, 'agenda_hora_escrita': hora, 'agenda_direccion_escrita': lugar,
      'agenda_barrio_escrito': b.barrio, 'agenda_fecha_escrita': ev.fecha, 'agenda_status_escrito': 'en agenda'
    };
    const mail = valoresMailAgenda_(ev, ORIGEN_SISTEMA);
    Object.keys(mail).forEach(function (n) { valores[n] = mail[n]; });
    const esc = [];
    Object.keys(valores).forEach(function (n) {
      if (col(n) == null || valores[n] === '' || valores[n] == null) return;
      esc.push({ fila: fila, col: col(n), valor: valores[n], esperado: '' });
    });
    P.acciones.push({ tipo: 'crear', fila: fila, ev: ev, escrituras: esc, barrio: b, id: idR, uid: valores.agenda_uid });
    P.filaDe.set(ev.clave, { fila: fila, status: 'en agenda', nueva: true });
  });

  // --- 7. suspender: desaparecidas futuras, sin reprogramar, fila "en agenda" ---
  r.desaparecidas.forEach(function (d) {
    if (!_enAlcance_(alcance, d.fecha) || atendidas.has(d.clave) || presentes.has(d.clave)) return;
    // ¿la misma figura en el mail de la semana siguiente, a 7 días o menos? (posible reprogramación entre semanas)
    if (d.figuraFila) {
      const sig = r.unicas.filter(function (u) {
        return u.figuraFila === d.figuraFila && u.desde && d.hasta && u.desde > d.hasta && u.fecha > d.fecha &&
               diasEntre_(u.fecha, d.fecha) <= 7;
      });
      if (sig.length) P.entreSemanas.push({ de: d, a: sig[0] });
    }
    if (!d.futuraAlDesaparecer) { P.noFuturas.push(d); return; }
    if (d.versionParcial) { P.saltadas60.push(d); return; }
    const c = candidatas(d).filter(function (f) { return !usadas.has(f.fila); });
    if (c.length !== 1) { if (c.length > 1) P.ambiguas.push({ ev: d, motivo: 'desaparecida con ' + c.length + ' filas', filas: c }); return; }
    const f = c[0];
    if (normStatus_(val(f, 'STATUS REUNIÓN')) !== 'en agenda') return;
    usadas.add(f.fila);
    const salida = 'desapareció en la versión ' + (d.versionQueLaSaco || d.ultimaVersionVista + 1) + ' (' + fmtFecha_(d.mailQueLaSaco) + ')';
    // 07/10: con AGENDA_CANCELACION_AUTOMATICA = false, la cancelación se PREGUNTA en AGENDA_DUPLICADOS y se aplica en
    // la corrida siguiente según lo elegido (la fila, por figura + fecha + barrio; la reunión, por su identidad).
    if (!AGENDA_CANCELACION_AUTOMATICA) {
      const idC = 'cancelacion|' + idReunionAgenda_(d);
      const el = elecciones.get(idC);
      const vale = el && el.idFila === idFilaAgenda_(f);
      if (vale && el.eleccion === 'sigue') {
        P.cancelacionSigue.push({ ev: d, f: f });
        P.filaDe.set(d.clave, { fila: f.fila, status: val(f, 'STATUS REUNIÓN'), f: f, sigue: true });
        return;
      }
      if (!(vale && el.eleccion === 'cancelar')) {
        P.duplicados.push({ tipo: 'cancelacion', ev: d, id: idC, candidatas: [{ f: f, diferencia: salida }], eleccion: vale ? el : null });
        P.filaDe.set(d.clave, { fila: f.fila, status: val(f, 'STATUS REUNIÓN'), f: f, cancelacionPendiente: true });
        return;
      }
      P.eleccionesAplicadas.push({ id: idC, eleccion: 'cancelar', fila: f.fila });
    }
    // 06/10, decisión del usuario: la fila que CREÓ la agenda y nadie tocó se BORRA (se guarda entera para deshacer).
    const intocada = filaIntocadaAgenda_(f.valores, dest.hdr, d);
    if (intocada.ok) {
      P.filaDe.set(d.clave, { fila: null, status: '', borrada: true });
      P.acciones.push({ tipo: 'borrar', f: f, ev: d, escrituras: [], uid: str(val(f, 'agenda_uid')),
                        detalle: salida + '; la creó la agenda y nadie la tocó' });
      return;
    }
    const esc = [
      { fila: f.fila, col: col('STATUS REUNIÓN'), valor: 'Suspendida', esperado: val(f, 'STATUS REUNIÓN') },
      { fila: f.fila, col: col('agenda_status_escrito'), valor: 'Suspendida', esperado: val(f, 'agenda_status_escrito') }
    ];
    if (esVacio_(val(f, 'agenda_uid'))) esc.push({ fila: f.fila, col: col('agenda_uid'), valor: uidAgenda_('vinculada'), esperado: '' });
    P.filaDe.set(d.clave, { fila: f.fila, status: 'Suspendida', f: f });
    P.acciones.push({ tipo: 'suspender', f: f, ev: d, escrituras: esc,
                      detalle: salida + (/no la creó/.test(intocada.motivo) ? '' : ' (no se borra: ' + intocada.motivo + ')') });
  });

  // --- 8. Seguridad en tu Barrio: la Figura desde RDV CONJUNTO, en las filas de la agenda que todavía no la tienen ---
  const sinFigura = dest.filas.filter(function (f) {
    // Seguridad en tu Barrio: el EVENTO es "Encuentro con Vecinos" (como lo escribe el equipo): se reconoce por la Figura vacía.
    return !f.figura && !esVacio_(val(f, 'agenda_uid')) && f.fecha && f.fecha <= hoyMediodia_();
  });
  if (sinFigura.length) {
    const conj = opciones.conjunto || leerConjuntoPorFecha_();
    sinFigura.forEach(function (f) {
      const res = figuraSeguridad_(f.fecha, f.barrio ? _canonBarrioAg_(f.barrio) || f.barrio : '', f.barrio ? _comunaBarrioAg_(f.barrio) : null, conj);
      if (res.figura) {
        P.figuraNueva = P.figuraNueva || {};
        P.figuraNueva[f.fila] = res.figura;
        P.acciones.push({ tipo: 'figura', f: f, escrituras: [{ fila: f.fila, col: col('Figura'), valor: res.figura, esperado: '' }],
                          detalle: res.figura + ' (RDV CONJUNTO fila ' + res.filas.join(', ') + ')' });
      } else {
        P.figuraACompletar.push({ f: f, motivo: res.motivo, filas: res.filas });
      }
    });
  }

  // --- 8 (prompt 07). Duplicados DESPUÉS de crear: una fila del equipo igual o casi igual a una creada por la agenda ---
  dest.filas.forEach(function (fa) {
    if (!/^c-/.test(str(val(fa, 'agenda_uid'))) || !fa.fecha) return;
    const evFila = { figuras: fa.figura ? [fa.figura] : [], fecha: fa.fecha, hora: valorAgendaComparable_(val(fa, 'HORA'), 'HORA'),
                     comuna: fa.barrio ? _comunaBarrioAg_(fa.barrio) : null, barrio: '' };
    const lugarMail = str(val(fa, 'Lugar (mail)'));
    if (evFila.comuna == null && lugarMail) evFila.comuna = detectComuna_(lugarMail);
    const casi = casiDuplicados(evFila, true).filter(function (x) { return x.f.fila !== fa.fila; });
    if (casi.length) P.duplicados.push({ tipo: 'despues', fAgenda: fa, candidatas: casi });
  });

  // --- A (prompt 07). "Tocado por el equipo" (en las filas de la agenda) y "Origen fila" = equipo (en las demás) ---
  dest.filas.forEach(function (f) {
    const uid = str(val(f, 'agenda_uid'));
    if (!uid) {
      if (col('Origen fila') != null && esVacio_(val(f, 'Origen fila')) && f.fecha && _enAlcance_(alcance, f.fecha)) {
        P.origenEquipo = (P.origenEquipo || 0) + 1;
        P.acciones.push({ tipo: 'origen', f: f, escrituras: [{ fila: f.fila, col: col('Origen fila'), valor: ORIGEN_EQUIPO, esperado: '' }] });
      }
      return;
    }
    if (col('Tocado por el equipo') == null) return;
    const tocado = tocadoPorEquipoAgenda_(f.valores, A);
    if (valorAgendaComparable_(val(f, 'Tocado por el equipo'), 'x') !== tocado) {
      P.acciones.push({ tipo: 'tocado', f: f, escrituras: [{ fila: f.fila, col: col('Tocado por el equipo'), valor: tocado, esperado: val(f, 'Tocado por el equipo') }],
                        detalle: tocado || '(nada)' });
    }
  });

  // --- 2. las viejas del mail sin fila (informativa) ---
  r.unicas.forEach(function (ev) {
    if (!ev.fecha || ymd_(ev.fecha) >= ymd_(alcance.desde)) return;
    if (!candidatas(ev).length) P.viejasSinFila.push(ev);
  });

  // --- 17. lo que va a la copia: las reuniones desde el inicio de la copia, vigentes, reprogramadas y desaparecidas ---
  const desdeCopia = AGENDA_COPIA_DESDE ? toDate_(AGENDA_COPIA_DESDE) : alcance.desde;
  const enCopia = function (ev) { return ev.fecha && ymd_(ev.fecha) >= ymd_(desdeCopia) && (!alcance.hasta || AGENDA_COPIA_DESDE || ymd_(ev.fecha) <= ymd_(alcance.hasta)); };
  const filaDeCopia = function (ev) {
    let x = P.filaDe.get(ev.clave);
    if (!x) {
      const c = candidatas(ev);
      if (c.length === 1) x = { fila: c[0].fila, status: val(c[0], 'STATUS REUNIÓN'), f: c[0] };
    }
    return x || null;
  };
  P.copia = [];
  r.unicas.forEach(function (ev) {
    if (!enCopia(ev)) return;
    const x = filaDeCopia(ev);
    if (x && (x.borradaEquipo || x.duplicado)) {
      P.copia.push({ ev: ev, x: null, estado: x.borradaEquipo ? 'borrada por el equipo' : 'duplicado: ver AGENDA_DUPLICADOS', fechaOriginal: ev.fechaOriginal || null });
      return;
    }
    P.copia.push({ ev: ev, x: x, estado: x && x.reprogramadaDe ? 'reprogramada' : 'vigente',
                   fechaOriginal: x && x.reprogramadaDe ? x.reprogramadaDe : (ev.fechaOriginal || null) });
  });
  r.desaparecidas.forEach(function (d) {
    if (!enCopia(d) || presentes.has(d.clave) || atendidas.has(d.clave)) return;
    const x = P.filaDe.get(d.clave);
    if (x && x.borrada) P.copia.push({ ev: d, x: null, estado: 'desaparecida (fila borrada)', fechaOriginal: d.fechaOriginal || null });
    else if (x && x.cancelacionPendiente) P.copia.push({ ev: d, x: x, estado: 'desaparecida: ¿se canceló? (AGENDA_DUPLICADOS)', fechaOriginal: d.fechaOriginal || null });
    else if (x && x.sigue) P.copia.push({ ev: d, x: x, estado: 'desaparecida, pero sigue (lo eligió el equipo)', fechaOriginal: d.fechaOriginal || null });
    else P.copia.push({ ev: d, x: filaDeCopia(d), estado: 'desaparecida', fechaOriginal: d.fechaOriginal || null });
  });
  P.copia.forEach(function (c) { c.barrio = barrioDe(c.ev); });

  const n = function (t) { return P.acciones.filter(function (a) { return a.tipo === t; }).length; };
  P.resumen = { mails: r.mails, reunionesEnAlcance: enAlcance.length, crear: n('crear'), vincular: n('vincular'),
                actualizar: n('actualizar'), mover: n('mover'), suspender: n('suspender'), borrar: n('borrar'), reactivar: n('reactivar'),
                figura: n('figura'), ambiguas: P.ambiguas.length, editadas: P.editadas.length,
                saltadas60: P.saltadas60.length, noFuturas: P.noFuturas.length, entreSemanas: P.entreSemanas.length,
                reprogramadasNoMovibles: P.reprogramadasNoMovibles.length, viejasSinFila: P.viejasSinFila.length,
                figuraACompletar: P.figuraACompletar.length, duplicadasEnCorrida: P.duplicadasEnCorrida.length, barrio: P.barrio,
                duplicadosAntes: P.duplicados.filter(function (x) { return x.tipo === 'antes'; }).length,
                duplicadosDespues: P.duplicados.filter(function (x) { return x.tipo === 'despues'; }).length,
                cancelaciones: P.duplicados.filter(function (x) { return x.tipo === 'cancelacion'; }).length,
                cancelacionSigue: P.cancelacionSigue.length,
                borradasEquipo: P.borradasEquipo.length, origenEquipo: P.origenEquipo || 0, tocado: n('tocado'),
                eleccionesAplicadas: P.eleccionesAplicadas.length, noCreadasSinHistorial: P.noCreadasSinHistorial || 0 };
  return P;
}

/** La línea "Lugar:" del mail, tal cual (también "A CONFIRMAR (NO SE COMUNICA LA DIRECCIÓN)"). */
function _direccionAgenda_(ev) {
  const completa = str(ev.lugarTexto).replace(/\s+/g, ' ');
  if (AGENDA_DIRECCION_FORMA === 'calle' && ev.direccion && !ev.direccionAConfirmar) return ev.direccion;
  return completa;
}

/** "asunto | dd/MM/yyyy HH:mm" del mail de la versión. */
function _origenAgenda_(ev) {
  return str(ev.asunto) + ' | ' + Utilities.formatDate(ev.mailFecha, RDV_TZ, 'dd/MM/yyyy HH:mm');
}

/**
 * Vincular una fila que ya existía (regla 4): agenda_uid, y sólo las celdas vacías. Una celda del equipo que
 * replica lo que dice el mail queda anotada como del sistema (sigue al mail); una que dice otra cosa, no.
 */
function _accionVincular_(P, f, ev, A, barrioDe) {
  const esc = [], col = function (n) { return A[n] == null ? null : A[n] + 1; };
  const val = function (n) { return A[n] == null ? '' : f.valores[A[n]]; };
  const lugar = _direccionAgenda_(ev);
  const llenar = function (n, valor, escrita) {
    if (col(n) == null || valor === '' || valor == null) return;
    const cur = val(n);
    if (esVacio_(cur)) {
      esc.push({ fila: f.fila, col: col(n), valor: valor, esperado: '' });
      if (escrita) esc.push({ fila: f.fila, col: col(escrita), valor: valor, esperado: val(escrita) });
    } else if (escrita && valorAgendaComparable_(cur, n) === valorAgendaComparable_(valor, n)) {
      esc.push({ fila: f.fila, col: col(escrita), valor: valor, esperado: val(escrita) });   // replica el mail
    }
  };
  llenar('Figura', ev.figuraFila, null);
  llenar('EVENTO', eventoAgenda_(ev), null);
  llenar('HORA', horaAgendaEquipo_(ev), 'agenda_hora_escrita');
  llenar('Dirección', lugar, 'agenda_direccion_escrita');
  llenar('FECHA', ev.fecha, 'agenda_fecha_escrita');
  _escriturasMailAgenda_(f, ev, A, ORIGEN_AMBOS).forEach(function (e) { esc.push(e); });
  if (esVacio_(val('STATUS REUNIÓN'))) {
    esc.push({ fila: f.fila, col: col('STATUS REUNIÓN'), valor: 'en agenda', esperado: '' });
    esc.push({ fila: f.fila, col: col('agenda_status_escrito'), valor: 'en agenda', esperado: val('agenda_status_escrito') });
  }
  if (esVacio_(val('Barrio'))) {
    const b = barrioDe(ev);
    if (b.barrio) {
      esc.push({ fila: f.fila, col: col('Barrio'), valor: b.barrio, esperado: '' });
      esc.push({ fila: f.fila, col: col('agenda_barrio_escrito'), valor: b.barrio, esperado: val('agenda_barrio_escrito') });
    }
  }
  esc.push({ fila: f.fila, col: col('agenda_uid'), valor: uidAgenda_('vinculada'), esperado: '' });
  esc.push({ fila: f.fila, col: col('agenda_mail'), valor: _origenAgenda_(ev), esperado: val('agenda_mail') });
  esc.push({ fila: f.fila, col: col('agenda_version'), valor: ev.version + ' de ' + ev.versiones, esperado: val('agenda_version') });
  P.acciones.push({ tipo: 'vincular', f: f, ev: ev, escrituras: esc.filter(function (e) { return e.col != null; }) });
}

/**
 * Actualizar una fila de la agenda (regla 5): sólo si está "en agenda" (o "Suspendida" por el sistema: primero
 * vuelve a "en agenda", regla 7), y sólo las celdas que todavía tienen lo que escribió el sistema. HORA, Dirección y,
 * si cambió la dirección, Barrio (con la regla de confianza; si ya no se cumple, el barrio del sistema se vacía).
 */
function _accionActualizar_(P, f, ev, A, barrioDe, op) {
  const col = function (n) { return A[n] == null ? null : A[n] + 1; };
  const val = function (n) { return A[n] == null ? '' : f.valores[A[n]]; };
  const cmp = valorAgendaComparable_;
  const esc = [];
  let status = val('STATUS REUNIÓN');
  if (normStatus_(status) === 'suspendida' && normStatus_(val('agenda_status_escrito')) === 'suspendida') {
    if (P.filaDe.get(ev.clave)) P.filaDe.get(ev.clave).status = 'en agenda';
    P.acciones.push({ tipo: 'reactivar', f: f, ev: ev, detalle: 'volvió a aparecer en la versión ' + ev.version, escrituras: [
      { fila: f.fila, col: col('STATUS REUNIÓN'), valor: 'en agenda', esperado: status },
      { fila: f.fila, col: col('agenda_status_escrito'), valor: 'en agenda', esperado: val('agenda_status_escrito') }] });
    status = 'en agenda';
  }
  const delMail = _escriturasMailAgenda_(f, ev, A, /^c-/.test(str(val('agenda_uid'))) ? ORIGEN_SISTEMA : ORIGEN_AMBOS);
  if (normStatus_(status) !== 'en agenda') {
    P.noEnAgenda.push({ f: f, ev: ev, status: status });
    if (delMail.length) P.acciones.push({ tipo: 'mail', f: f, ev: ev, escrituras: delMail, detalle: 'columnas del mail' });
    return;
  }
  delMail.forEach(function (e) { esc.push(e); });
  const cambia = {};
  const seguir = function (n, valor, escrita) {
    if (col(n) == null || valor === '' || valor == null) return;
    const cur = val(n), esc0 = val(escrita);
    if (cmp(cur, n) === cmp(valor, n)) {
      if (esVacio_(esc0)) esc.push({ fila: f.fila, col: col(escrita), valor: valor, esperado: esc0 });   // replica el mail
      return;
    }
    if (esVacio_(cur)) {
      esc.push({ fila: f.fila, col: col(n), valor: valor, esperado: '' });
    } else if (!esVacio_(esc0) && cmp(cur, n) === cmp(esc0, n)) {
      esc.push({ fila: f.fila, col: col(n), valor: valor, esperado: cur });
      cambia[n] = { antes: cur, despues: valor };
    } else {
      P.editadas.push({ f: f, col: n, valor: cur, mail: valor });
      return;
    }
    esc.push({ fila: f.fila, col: col(escrita), valor: valor, esperado: esc0 });
  };
  seguir('HORA', horaAgendaEquipo_(ev), 'agenda_hora_escrita');
  const lugar = _direccionAgenda_(ev);
  const dirAntes = val('agenda_direccion_escrita');
  seguir('Dirección', lugar, 'agenda_direccion_escrita');
  const dirCambio = !esVacio_(dirAntes) && cmp(dirAntes, 'Dirección') !== cmp(lugar, 'Dirección');
  // Barrio: si está vacío, o si cambió la dirección y el barrio es el del sistema.
  const bCur = val('Barrio'), bEsc = val('agenda_barrio_escrito');
  if (esVacio_(bCur) || (dirCambio && !esVacio_(bEsc) && cmp(bCur, 'Barrio') === cmp(bEsc, 'Barrio'))) {
    const b = barrioDe(ev);
    if (cmp(b.barrio, 'Barrio') !== cmp(bCur, 'Barrio') && !(esVacio_(bCur) && !b.barrio)) {
      esc.push({ fila: f.fila, col: col('Barrio'), valor: b.barrio, esperado: bCur });
      esc.push({ fila: f.fila, col: col('agenda_barrio_escrito'), valor: b.barrio, esperado: bEsc });
      if (!esVacio_(bCur)) cambia['Barrio'] = { antes: bCur, despues: b.barrio || '(vacío: ' + b.motivo + ')' };
    }
  } else if (dirCambio && !esVacio_(bCur) && cmp(bCur, 'Barrio') !== cmp(bEsc, 'Barrio')) {
    P.editadas.push({ f: f, col: 'Barrio', valor: bCur, mail: '(cambió la dirección)' });
  }
  if (!f.figura && ev.figuraFila) esc.push({ fila: f.fila, col: col('Figura'), valor: ev.figuraFila, esperado: '' });
  if (!esc.length) return;
  const orig = _origenAgenda_(ev), ver = ev.version + ' de ' + ev.versiones;
  if (cmp(val('agenda_mail'), 'agenda_mail') !== cmp(orig, 'agenda_mail')) esc.push({ fila: f.fila, col: col('agenda_mail'), valor: orig, esperado: val('agenda_mail') });
  if (cmp(val('agenda_version'), 'agenda_version') !== cmp(ver, 'agenda_version')) esc.push({ fila: f.fila, col: col('agenda_version'), valor: ver, esperado: val('agenda_version') });
  P.acciones.push({ tipo: 'actualizar', f: f, ev: ev, escrituras: esc, cambia: cambia,
                    detalle: Object.keys(cambia).map(function (k) {
                      return k + ': ' + valorAgendaComparable_(cambia[k].antes, k) + ' → ' + valorAgendaComparable_(cambia[k].despues, k);
                    }).join('; ') });
}

/**
 * El barrio de una reunión desde su dirección, con la regla de confianza y el margen (punto 12): devuelve
 * `{ barrio, motivo }` (barrio '' si no se cumple). Cache por consulta en AGENDA_GEOCODE (intermedia), y las que
 * faltan se piden a Maps (hasta GEOCODE_MAX_POR_CORRIDA). `opciones.geocodificar(consulta)` lo reemplaza (tests).
 */
function _barrioAgenda_(opciones, P) {
  let cache = null, poligonos = null;
  const nuevas = [];
  P.geocodeNuevas = nuevas;
  let llamadas = 0;
  const memo = new Map();
  return function (ev) {
    if (memo.has(ev.clave + '|' + ev.version + '|' + ev.grupo)) return memo.get(ev.clave + '|' + ev.version + '|' + ev.grupo);
    const b = _barrioAgendaUna_(ev);
    memo.set(ev.clave + '|' + ev.version + '|' + ev.grupo, b);
    return b;
  };
  function _barrioAgendaUna_(ev) {
    const sumar = function (k) { P.barrio[k] = (P.barrio[k] || 0) + 1; };
    if (!ev.direccion || _noEsDireccion_(ev.direccion)) {
      sumar('sin dirección (A CONFIRMAR o sin altura)');
      return { barrio: '', motivo: ev.direccionAConfirmar ? 'A CONFIRMAR' : 'sin dirección con altura' };
    }
    if (!poligonos) poligonos = _poligonosBarrios_();
    const consulta = _consultaGeocode_(ev.direccion);
    let g;
    if (opciones.geocodificar) g = opciones.geocodificar(consulta);
    else {
      if (!cache) cache = _leerCacheGeocode_();
      g = cache.get(consulta);
      if (!g) {
        if (llamadas >= GEOCODE_MAX_POR_CORRIDA) { sumar('pendiente: tope de geocodificación'); return { barrio: '', motivo: 'tope' }; }
        g = _geocodificar_(consulta, true);
        llamadas++;
        if (g.estado !== 'ERROR') { cache.set(consulta, g); nuevas.push(g); }
      }
    }
    const res = _barrioDeGeo_(g, poligonos);
    const regla = _reglaBarrioConMargen_(res, ev, poligonos, BARRIO_MARGEN_M);
    if (regla.cumple) { sumar('escrito (cumple la regla)'); return { barrio: res.barrio, motivo: 'cumple' }; }
    sumar('vacío: ' + regla.motivo.replace(/\d+ m/, 'N m'));
    return { barrio: '', motivo: regla.motivo, res: res };
  }
}

// ===================== Seguridad en tu Barrio: la figura desde RDV CONJUNTO =====================

/** RDV CONJUNTO por fecha: yyyyMMdd → [{ fila, nombre, ubic }]. */
function leerConjuntoPorFecha_() {
  const porFecha = new Map();
  const sh = ssDestino_().getSheetByName(RDV_HOJA_ASISTENTES_SRC);
  if (!sh || sh.getLastRow() < 2) return porFecha;
  const vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const hdr = vals[0];
  const iFig = findIdxOr_(hdr, ['figura', 'persona', 'nombre'], true);
  const iBar = findIdxOr_(hdr, ['barrion', 'barrio'], true);
  const iFec = findIdxOr_(hdr, ['fecha', 'fecha (fecha)', 'fecha_evento', 'fecha reunion', 'fecha reunión', 'fecha evento'], true);
  if (iFig == null || iFec == null) return porFecha;
  for (let i = 1; i < vals.length; i++) {
    const f = toDate_(vals[i][iFec]);
    if (!f) continue;
    const k = ymd_(f);
    if (!porFecha.has(k)) porFecha.set(k, []);
    porFecha.get(k).push({ fila: i + 1, nombre: str(vals[i][iFig]), ubic: iBar != null ? str(vals[i][iBar]) : '' });
  }
  return porFecha;
}

/**
 * La figura de una "Seguridad en tu Barrio" desde RDV CONJUNTO (regla 8, el cruce del paso 32): las filas de esa
 * fecha cuyo barrio coincide (o, con "C5" / barrio de otra comuna, cuya comuna coincide). `{ figura, filas, motivo }`:
 * figura sólo si sale UNA (por tokens del nombre).
 */
function figuraSeguridad_(fecha, barrio, comuna, porFecha) {
  const comunaDe = function (t) {
    if (/^\s*(c|comuna)\s*0?\d{1,2}\s*(n|s|norte|sur)?\s*$/i.test(t)) return detectComuna_(t);
    return _comunaBarrioAg_(t);
  };
  const cand = (porFecha.get(ymd_(fecha)) || []).filter(function (x) {
    if (!x.ubic) return false;
    if (barrio) {
      const b = _canonBarrioAg_(x.ubic);
      if (b) return normalizeText_(b) === normalizeText_(barrio);
    }
    return comuna != null && comunaDe(x.ubic) === comuna;
  });
  const figs = {};
  cand.forEach(function (x) { const fp = figuraPorTokens_(x.nombre); figs[fp.figura || ('? ' + x.nombre)] = true; });
  const lista = Object.keys(figs);
  const filas = cand.map(function (x) { return x.fila; });
  if (lista.length === 1 && lista[0].indexOf('? ') !== 0) return { figura: lista[0], filas: filas, motivo: '' };
  if (!lista.length) return { figura: '', filas: filas, motivo: 'RDV CONJUNTO todavía no tiene la fila' };
  return { figura: '', filas: filas, motivo: lista.length > 1 ? 'ambigua: ' + lista.join(' / ') : 'nombre no reconocido: ' + lista[0].slice(2) };
}

// ===================== Escribir el plan =====================

/**
 * Escribe el plan, en este orden (06/10):
 *   1. **el registro primero, y es obligatorio**: la línea de la corrida en REGISTRO_AGENDA y cada cambio en
 *      REGISTRO_AGENDA_CAMBIOS (antes = lo que se espera encontrar, que es lo único que se pisa; el fondo; el
 *      agenda_uid de la fila; y las filas a borrar ENTERAS, valores y fondos). Si no se puede escribir, TIRA y no se
 *      toca el destino: sin registro no hay deshacer;
 *   2. las celdas, por la excepción `escribirAgendaLote_` (lectura fresca: sólo donde todavía está lo esperado);
 *   3. los borrados, de abajo hacia arriba, **volviendo a verificar cada fila justo antes** (`filaIntocadaAgenda_`;
 *      corremos con el bloqueo tomado). Una que alguien tocó en el medio no se borra: se suspende.
 * Las filas se identifican por `agenda_uid` en el registro: borrar corre los números de las filas de abajo.
 */
function aplicarPlanAgenda_(sh, dest, plan, corrida) {
  const A = plan.A, hdr = dest.hdr;
  const colUid = A.agenda_uid != null ? A.agenda_uid + 1 : null;
  const todas = [];
  plan.acciones.forEach(function (a, i) { a.escrituras.forEach(function (e) { todas.push(Object.assign({ accion: i }, e)); }); });
  // el agenda_uid de cada fila: el de la fila, o el que le estampa esta corrida
  const uidDe = {};
  plan.acciones.forEach(function (a) {
    const fila = a.fila || (a.f && a.f.fila);
    const e = a.escrituras.filter(function (x) { return x.col === colUid; })[0];
    uidDe[fila] = e ? e.valor : (a.f && A.agenda_uid != null ? str(a.f.valores[A.agenda_uid]) : '');
  });
  // 1a. los fondos de lo que se va a pisar (una lectura)
  const ultima = sh.getLastRow();
  const existentes = todas.filter(function (e) { return e.fila <= ultima; });
  let fondos = null, f1 = 0, c1 = 0;
  if (existentes.length) {
    f1 = Math.min.apply(null, existentes.map(function (e) { return e.fila; }));
    c1 = Math.min.apply(null, existentes.map(function (e) { return e.col; }));
    const f2 = Math.max.apply(null, existentes.map(function (e) { return e.fila; }));
    const c2 = Math.max.apply(null, existentes.map(function (e) { return e.col; }));
    fondos = sh.getRange(f1, c1, f2 - f1 + 1, c2 - c1 + 1).getBackgrounds();
  }
  const fondoDe = function (e) { return fondos && e.fila <= ultima ? (fondos[e.fila - f1] || [])[e.col - c1] || '' : ''; };
  // 1b. las filas a borrar, verificadas ahora (lectura fresca de cada una)
  const nCols = sh.getLastColumn();
  const borrar = [];
  plan.acciones.forEach(function (a, i) {
    if (a.tipo !== 'borrar') return;
    const rg = sh.getRange(a.f.fila, 1, 1, nCols);
    const v = rg.getValues()[0], bg = rg.getBackgrounds()[0];
    const ok = filaIntocadaAgenda_(v, hdr, a.ev);
    if (ok.ok && str(v[A.agenda_uid]) === a.uid) borrar.push({ accion: i, fila: a.f.fila, uid: a.uid, valores: v, fondos: bg });
    else {
      Logger.log('    NO SE BORRA la fila %s (%s): alguien la tocó (%s) → se suspende', a.f.fila, a.f.figura, ok.motivo || 'otra fila');
      a.tipo = 'suspender';
      a.escrituras = [{ fila: a.f.fila, col: A['STATUS REUNIÓN'] + 1, valor: 'Suspendida', esperado: 'en agenda' },
                      { fila: a.f.fila, col: A.agenda_status_escrito + 1, valor: 'Suspendida', esperado: a.f.valores[A.agenda_status_escrito] }];
      a.escrituras.forEach(function (e) { todas.push(Object.assign({ accion: i }, e)); });
    }
  });
  // 1c. el registro (obligatorio)
  const cambios = todas.map(function (e) {
    return [corrida, plan.acciones[e.accion].tipo, e.fila, e.col, hdr[e.col - 1], _celdaRegistro_(e.esperado), _celdaRegistro_(e.valor),
            fondoDe(e), uidDe[e.fila] || ''];
  }).concat(borrar.map(function (b) {
    return [corrida, 'borrar', b.fila, '', '', JSON.stringify(b.valores.map(_celdaRegistro_)), '', JSON.stringify(b.fondos), b.uid];
  })).concat(plan.acciones.filter(function (a) { return a.tipo === 'crear'; }).map(function (a) {
    // 07/10: qué reunión es cada fila creada, para reconocer después las que BORRÓ el equipo (y no recrearlas)
    return [corrida, 'crear_id', a.fila, '', '', '', a.id, '', a.uid];
  })).concat(plan.historial ? _notasHistorialAgenda_(plan, corrida) : []);
  try {
    _registrarCorridaAntesDeEscribir_(corrida, plan, cambios, todas.length, borrar.length);
  } catch (err) {
    throw new Error('no se pudo escribir REGISTRO_AGENDA (' + err + '): NO se escribió nada en el destino.');
  }
  // 2. las celdas
  const w = escribirAgendaLote_(sh, hdr, todas);
  const nuevas = plan.acciones.filter(function (a) { return a.tipo === 'crear'; }).map(function (a) { return a.fila; });
  try {
    const deAgenda = dest.filas.filter(function (f) { return A.agenda_uid != null && !esVacio_(f.valores[A.agenda_uid]); })
      .map(function (f) { return f.fila; }).concat(nuevas);
    formatearColumnasAgenda_(sh, hdr, deAgenda);
  } catch (err) { Logger.log('    el formato de las columnas de traza no se pudo poner: %s (los valores ya están)', err); }
  if (AGENDA_COPIAR_FORMATO && nuevas.length) {
    try { copiarFormatoNumericoAgenda_(sh, ultima, nuevas); }
    catch (err) { Logger.log('    el formato de las filas nuevas no se copió: %s (los valores ya están)', err); }
  }
  SpreadsheetApp.flush();
  // 3. los borrados, de abajo hacia arriba, verificando otra vez
  let borradas = 0;
  const filasBorradas = [];
  borrar.sort(function (x, y) { return y.fila - x.fila; }).forEach(function (b) {
    const v = sh.getRange(b.fila, 1, 1, nCols).getValues()[0];
    const ok = filaIntocadaAgenda_(v, hdr, plan.acciones[b.accion].ev);
    if (!ok.ok || str(v[A.agenda_uid]) !== b.uid) {
      Logger.log('    NO SE BORRA la fila %s: cambió entre la verificación y el borrado (%s). Queda; la próxima corrida la suspende.',
                 b.fila, ok.motivo || 'otra fila');
      try { _anotarCambiosAgenda_([[corrida, 'borrar_cancelado', b.fila, '', '', '', '', '', b.uid]]); } catch (e) { /* el log lo dice */ }
      return;
    }
    borrarFilaAgenda_(sh, hdr, b.fila, b.uid);
    borradas++;
    filasBorradas.push(b.fila);
  });
  SpreadsheetApp.flush();
  const porTipo = {}, porColumna = {};
  w.hechas.forEach(function (e) {
    const a = plan.acciones[e.accion];
    porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
    const n = hdr[e.col - 1];
    porColumna[n] = (porColumna[n] || 0) + 1;
  });
  const creadas = plan.acciones.filter(function (a) { return a.tipo === 'crear'; }).length;
  Logger.log('>>> ESCRITURA de la agenda en "%s" (corrida %s): %s celdas (%s) | filas BORRADAS %s | saltadas porque la celda ' +
             'ya no tenía lo esperado: %s', RDV_HOJA_DESTINO, corrida, w.hechas.length,
             Object.keys(porTipo).map(function (k) { return k + ' ' + porTipo[k]; }).join(', ') || 'nada', borradas, w.saltadas.length);
  Logger.log('    por columna: %s', Object.keys(porColumna).map(function (k) { return k + ' ' + porColumna[k]; }).join(' | ') || 'nada');
  // Borrar corre los números de las filas de abajo: lo que se escribe después en esta corrida (las solapas
  // informativas, la copia en "Agenda") usa el número de ahora.
  plan.ajustarFila = function (n) { return typeof n === 'number' ? n - filasBorradas.filter(function (b) { return b < n; }).length : n; };
  return { hechas: w.hechas, saltadas: w.saltadas, creadas: creadas, borradas: borradas, porColumna: porColumna, porTipo: porTipo };
}

// ===================== El log, las solapas y el registro =====================

function logPlanAgenda_(P, dest) {
  const s = P.resumen;
  Logger.log('--- la agenda: qué haría ---');
  Logger.log('  reuniones del mail en el alcance: %s | CREAR %s | VINCULAR %s | ACTUALIZAR %s | MOVER (reprogramada) %s | ' +
             'SUSPENDER %s | BORRAR (creada por la agenda y sin tocar) %s | REACTIVAR %s | FIGURA de Seguridad %s',
             s.reunionesEnAlcance, s.crear, s.vincular, s.actualizar, s.mover, s.suspender, s.borrar, s.reactivar, s.figura);
  Logger.log('  ambiguas (no se hace nada) %s | celdas editadas por el equipo (no se tocan) %s | filas que no están "en agenda" ' +
             '(no se actualizan) %s', s.ambiguas, s.editadas, P.noEnAgenda.length);
  Logger.log('  desaparecidas: ya pasadas al desaparecer (NO son cancelación) %s | saltadas por la protección del %s%% %s | ' +
             'reprogramadas que no se pueden mover %s | posibles reprogramaciones entre semanas %s',
             s.noFuturas, Math.round(AGENDA_FRACCION_VERSION_PARCIAL * 100), s.saltadas60, s.reprogramadasNoMovibles, s.entreSemanas);
  Logger.log('  barrio (regla de confianza, margen %s m): %s', BARRIO_MARGEN_M,
             Object.keys(s.barrio).map(function (k) { return k + ' ' + s.barrio[k]; }).join(' · ') || '—');
  const linea = function (a) {
    const ev = a.ev || {};
    return a.tipo.toUpperCase() + ' | fila ' + (a.fila || (a.f && a.f.fila)) + ' | ' + (ev.fecha ? fmtFecha_(ev.fecha) + ' ' + (ev.hora || '') : '') +
           ' | ' + (ev.figuraFila || (a.f && a.f.figura) || ev.tipo || '') + ' | ' + (ev.lugar || '') +
           (a.detalle ? ' | ' + a.detalle : '') + (a.barrio && a.barrio.barrio ? ' | barrio ' + a.barrio.barrio : '');
  };
  P.acciones.slice(0, 120).forEach(function (a) { Logger.log('    %s', linea(a)); });
  if (P.acciones.length > 120) Logger.log('    … y %s más', P.acciones.length - 120);
  P.ambiguas.slice(0, 20).forEach(function (x) {
    Logger.log('    AMBIGUA | %s | %s | %s | filas %s', fmtFecha_(x.ev.fecha), x.ev.figuraFila || x.ev.tipo, x.motivo,
               x.filas.map(function (f) { return f.fila; }).join(', '));
  });
  P.editadas.slice(0, 20).forEach(function (x) {
    Logger.log('    EDITADA POR EL EQUIPO | fila %s | %s: "%s" (el mail dice "%s") — no se toca', x.f.fila, x.col,
               valorAgendaComparable_(x.valor, x.col), valorAgendaComparable_(x.mail, x.col));
  });
  P.reprogramadasNoMovibles.forEach(function (x) {
    Logger.log('    REPROGRAMADA, NO SE MUEVE | fila %s | %s | %s → %s | %s', x.f.fila, x.f.figura, fmtFecha_(x.de.fecha),
               fmtFecha_(x.a.fecha), x.motivo);
  });
  P.entreSemanas.slice(0, 20).forEach(function (x) {
    Logger.log('    POSIBLE REPROGRAMACIÓN ENTRE SEMANAS | %s | %s → %s', x.de.figuraFila, fmtFecha_(x.de.fecha), fmtFecha_(x.a.fecha));
  });
  P.saltadas60.slice(0, 10).forEach(function (d) {
    Logger.log('    NO SE SUSPENDE (versión parcial, protección del 60%%) | %s | %s | %s', d.grupo, fmtFecha_(d.fecha), d.figuraFila || d.tipo);
  });
  const tipos = Object.keys(P.eventoPorTipo);
  if (tipos.length) {
    Logger.log('  EVENTO que escribe hoy el equipo, por tipo del mail (para ajustar AGENDA_EVENTO_POR_TIPO; "{tema}" e ' +
               '"{invitado}" se completan con lo que dice el evento del mail):');
    tipos.forEach(function (t) {
      const c = P.eventoPorTipo[t];
      Logger.log('    %s → %s   (hoy se escribiría "%s")', t, Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })
        .map(function (k) { return '"' + k + '" ' + c[k]; }).join(' · '), AGENDA_EVENTO_POR_TIPO[t] || t);
    });
  }
  Logger.log('  Seguridad sin figura: se completa %s | a completar por el equipo %s | reuniones viejas del mail sin fila ' +
             '(no se crean) %s', s.figura, s.figuraACompletar, s.viejasSinFila);
  Logger.log('  AGENDA_DUPLICADOS: antes de crear (NO se crean, se pregunta) %s | después de crear (informativos) %s | ' +
             'elecciones aplicadas %s | BORRADAS POR EL EQUIPO (no se recrean) %s | "Origen fila" = equipo en %s filas | ' +
             '"Tocado por el equipo" recalculado en %s', s.duplicadosAntes, s.duplicadosDespues, s.eleccionesAplicadas,
             s.borradasEquipo, s.origenEquipo, s.tocado);
  if (P.historial && P.historial.error) {
    Logger.log('  >>> el historial de la agenda NO se pudo leer (%s): en la corrida real no se crea nada (%s reuniones).',
               P.historial.error, s.noCreadasSinHistorial);
  }
  P.duplicados.forEach(function (x) {
    if (x.tipo === 'antes') {
      Logger.log('    DUPLICADO (no se crea) | %s %s | %s | %s → %s', fmtFecha_(x.ev.fecha), x.ev.hora, x.ev.figuraFila || x.ev.tipo,
                 x.ev.lugar, x.candidatas.map(function (c) { return 'fila ' + c.f.fila + ' (' + c.diferencia + ')'; }).join('; '));
    } else if (x.tipo === 'cancelacion') {
      Logger.log('    ¿SE CANCELÓ? (se pregunta) | %s %s | %s | %s → fila %s | %s', fmtFecha_(x.ev.fecha), x.ev.hora,
                 x.ev.figuraFila || x.ev.tipo, x.ev.lugar, x.candidatas[0].f.fila, x.candidatas[0].diferencia);
    } else {
      Logger.log('    DUPLICADO POSTERIOR | fila %s de la agenda (%s %s) ~ %s', x.fAgenda.fila, x.fAgenda.figura || '(sin figura)',
                 fmtFecha_(x.fAgenda.fecha), x.candidatas.map(function (c) { return 'fila ' + c.f.fila + ' (' + c.diferencia + ')'; }).join('; '));
    }
  });
  if (!AGENDA_CANCELACION_AUTOMATICA) {
    Logger.log('  CANCELACIONES (AGENDA_CANCELACION_AUTOMATICA = false): se preguntan %s | "Sigue" (no se tocan) %s',
               s.cancelaciones, s.cancelacionSigue);
  }
  P.borradasEquipo.forEach(function (x) {
    Logger.log('    BORRADA POR EL EQUIPO (no se recrea) | %s %s | %s | %s', fmtFecha_(x.ev.fecha), x.ev.hora, x.ev.figuraFila || x.ev.tipo, x.ev.lugar);
  });
  if (P.duplicadasEnCorrida.length) {
    Logger.log('  la misma reunión dos veces en esta corrida (se crea UNA): %s', P.duplicadasEnCorrida.length);
    P.duplicadasEnCorrida.forEach(function (x) {
      Logger.log('    DUPLICADA EN LA CORRIDA | %s %s | %s | %s → la fila nueva %s', fmtFecha_(x.ev.fecha), x.ev.hora,
                 x.ev.figuraFila || x.ev.tipo, x.ev.lugar, x.fila);
    });
  }
}

function _escribirSolapasAgenda_(P) {
  try {
    const viejas = [['fecha', 'hora', 'tipo', 'figura', 'lugar', 'direccion', 'grupo', 'mail', 'evento_texto']];
    P.viejasSinFila.forEach(function (ev) {
      viejas.push([fmtFecha_(ev.fecha), ev.hora, ev.tipo, ev.figuraFila, ev.lugar, ev.lugarTexto, ev.grupo, _origenAgenda_(ev), ev.eventoTexto]);
    });
    _escribirHojaAgenda_(AGENDA_SOLAPA_VIEJAS, viejas);
    const fig = [['fila', 'fecha', 'barrio', 'evento', 'por qué falta la figura', 'filas de RDV CONJUNTO']];
    P.figuraACompletar.forEach(function (x) {
      fig.push([P.ajustarFila ? P.ajustarFila(x.f.fila) : x.f.fila, fmtFecha_(x.f.fecha), x.f.barrio, x.f.evento, x.motivo, (x.filas || []).join(', ')]);
    });
    _escribirHojaAgenda_(AGENDA_SOLAPA_FIGURA, fig);
    _agregarCacheGeocode_(P.geocodeNuevas || []);
  } catch (err) {
    Logger.log('[agenda] no se pudieron escribir las solapas informativas: %s (la corrida igual terminó)', err);
  }
}

/**
 * Una línea por corrida en REGISTRO_AGENDA y, si escribió, cada celda cambiada en REGISTRO_AGENDA_CAMBIOS (con lo
 * que había antes y su fondo: es lo que usa deshacer). Devuelve el id de la corrida.
 */
function _registrarAgenda_(P, enSeco, t0, error) {
  const id = _idCorridaAgenda_();
  const s = P ? P.resumen : {}, w = P && P.escrito ? P.escrito : null;
  try {
    _conReintentosAgenda_('REGISTRO_AGENDA', function () {
      const sh = _hojaRegistroAgenda_(registrosAgenda_());
      sh.appendRow([id, new Date(), enSeco ? 'en seco' : 'ESCRITURA', AGENDA_SOLO_SEMANA || '', s.mails || '',
                    s.reunionesEnAlcance || 0, s.crear || 0, s.vincular || 0, s.actualizar || 0, s.mover || 0, s.suspender || 0,
                    s.reactivar || 0, s.figura || 0, s.ambiguas || 0, s.editadas || 0, s.saltadas60 || 0,
                    w ? w.hechas.length : 0, w ? JSON.stringify(w.porColumna) : '', w ? w.saltadas.length : 0, Date.now() - t0,
                    error || '', s.borrar || 0, s.borradasEquipo || 0, (s.duplicadosAntes || 0) + (s.duplicadosDespues || 0)]);
      SpreadsheetApp.flush();
    });
    Logger.log('  %s: línea de la corrida %s escrita.', RDV_HOJA_REGISTRO_AGENDA, id);
  } catch (err) {
    Logger.log('>>> no se pudo escribir %s: %s (en seco o con error no es obligatorio: la corrida igual terminó)', RDV_HOJA_REGISTRO_AGENDA, err);
  }
  return id;
}

/** Un valor para REGISTRO_AGENDA_CAMBIOS: las fechas como "yyyy-MM-dd" (y las horas como "HH:mm"), para leerlas igual. */
function _celdaRegistro_(v) {
  if (v instanceof Date) return v.getFullYear() < 1900 ? Utilities.formatDate(v, RDV_TZ, 'HH:mm') : Utilities.formatDate(v, RDV_TZ, 'yyyy-MM-dd');
  return v == null ? '' : v;
}

// ===================== Deshacer (paso 38) =====================

/**
 * **Deshace una corrida de la agenda** (la última que escribió, o `corrida`): borra las filas que CREÓ —sólo si
 * todavía replican lo que dice el mail: todas las celdas que escribió siguen igual y nadie cargó nada más en la
 * fila (fuera de las derivadas)—, vuelve las demás celdas a lo que había, sólo si todavía tienen lo que escribió la
 * agenda, y RESTAURA las filas que borró (al final, con lo que tenían). Las filas se ubican por `agenda_uid`, no por
 * número: borrar filas corre los números. En seco, sólo dice qué haría. Deja una línea "DESHACER" en REGISTRO_AGENDA.
 */
function deshacerAgenda(enSeco, corrida) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(ESPERA_BLOQUEO_MS)) { Logger.log('>>> Hay otra corrida en curso: no se deshace nada.'); return null; }
  try {
    return _deshacerAgenda_(enSeco, corrida);
  } finally {
    lock.releaseLock();
  }
}

function _deshacerAgenda_(enSeco, corrida) {
  const t0 = Date.now();
  Logger.log('=== deshacer la agenda (%s) ===', enSeco ? 'EN SECO' : 'REAL');
  const ss = registrosAgenda_();
  const reg = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA), cam = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA_CAMBIOS);
  if (!reg || !cam || cam.getLastRow() < 2) { Logger.log('>>> No hay ninguna corrida de la agenda que haya escrito.'); return { deshecho: 0 }; }
  const regV = reg.getRange(1, 1, reg.getLastRow(), reg.getLastColumn()).getValues();
  const deshechas = {};
  regV.forEach(function (r) { const m = /^DESHACER (.+)$/.exec(str(r[2])); if (m) deshechas[m[1]] = true; });
  let id = corrida;
  if (!id) {
    for (let i = regV.length - 1; i >= 1; i--) {
      if (str(regV[i][2]) === 'ESCRITURA' && (num(regV[i][16]) > 0 || num(regV[i][21]) > 0) && !deshechas[str(regV[i][0])]) { id = str(regV[i][0]); break; }
    }
  }
  if (!id) { Logger.log('>>> No hay ninguna corrida de ESCRITURA sin deshacer.'); return { deshecho: 0 }; }
  if (deshechas[id]) { Logger.log('>>> La corrida %s ya fue deshecha.', id); return { deshecho: 0 }; }
  const anchoCam = Math.max(9, cam.getLastColumn());
  const camV = cam.getRange(2, 1, cam.getLastRow() - 1, anchoCam).getValues().filter(function (r) { return str(r[0]) === id; });
  Logger.log('  corrida %s: %s líneas de cambios', id, camV.length);

  const sh = verificarHojaDestino_(ssDestino_());
  const nCols = sh.getLastColumn();
  const hdr = sh.getRange(1, 1, 1, nCols).getValues()[0];
  const A = indicesAgenda_(hdr);
  const valor = function (v, n) {
    const nn = normalizeHeader_(n);
    if ((nn === 'fecha' || nn === 'agenda_fecha_escrita') && /^\d{4}-\d{2}-\d{2}$/.test(str(v))) return toDate_(v);
    return v;
  };
  // Las filas, por agenda_uid (borrar filas corre los números).
  const ultimaHoja = sh.getLastRow();
  const uids = A.agenda_uid != null && ultimaHoja > 1 ? sh.getRange(2, A.agenda_uid + 1, ultimaHoja - 1, 1).getValues() : [];
  const filaDeUid = {};
  uids.forEach(function (r, i) { if (str(r[0])) filaDeUid[str(r[0])] = i + 2; });
  const filaActual = function (c) { return c.uid ? (filaDeUid[c.uid] || null) : c.fila; };
  const cambios = camV.map(function (r) {
    const col = num(r[3]);
    return { tipo: str(r[1]), fila: num(r[2]), col: col, antes: col ? valor(r[5], hdr[col - 1]) : r[5],
             despues: col ? valor(r[6], hdr[col - 1]) : r[6], fondoAntes: str(r[7]) || null, uid: str(r[8]) };
  });
  const cancelados = {};
  cambios.forEach(function (c) { if (c.tipo === 'borrar_cancelado') cancelados[c.uid] = true; });
  // Las filas creadas: ¿todavía replican el mail?
  const creadas = {};
  cambios.forEach(function (c) { if (c.tipo === 'crear') { const k = c.uid || ('fila ' + c.fila); (creadas[k] = creadas[k] || []).push(c); } });
  const derivadas = hdr.map(function (h) { return esColumnaDerivada_(h); });
  const deAgenda = COLUMNAS_QUE_ESCRIBE_AGENDA.map(normalizeHeader_);
  const aSacar = [], noSeSacan = [];
  Object.keys(creadas).forEach(function (k) {
    const fi = filaActual(creadas[k][0]);
    if (!fi) { noSeSacan.push({ fila: '—', motivo: 'ya no está en el destino' }); return; }
    const fv = sh.getRange(fi, 1, 1, nCols).getValues()[0];
    const escritas = {};
    creadas[k].forEach(function (c) { escritas[c.col] = c; });
    let replica = true, motivo = '';
    for (let j = 0; j < nCols && replica; j++) {
      if (derivadas[j]) continue;
      const c = escritas[j + 1];
      if (c) {
        if (valorAgendaComparable_(fv[j], hdr[j]) !== valorAgendaComparable_(c.despues, hdr[j])) { replica = false; motivo = hdr[j] + ' cambió'; }
      } else if (!esVacio_(fv[j]) && deAgenda.indexOf(normalizeHeader_(hdr[j])) < 0) { replica = false; motivo = 'tiene "' + hdr[j] + '" cargado'; }
    }
    (replica ? aSacar : noSeSacan).push({ fila: fi, motivo: motivo });
  });
  const otros = cambios.filter(function (c) { return c.col && c.tipo !== 'crear'; })
    .map(function (c) { return Object.assign({}, c, { fila: filaActual(c) }); }).filter(function (c) { return c.fila; });
  const restaurar = cambios.filter(function (c) { return c.tipo === 'borrar' && !cancelados[c.uid] && !filaDeUid[c.uid]; });
  Logger.log('  filas creadas: %s → se sacan %s | NO se sacan (alguien cargó algo) %s', Object.keys(creadas).length,
             aSacar.length, noSeSacan.length);
  noSeSacan.forEach(function (x) { Logger.log('    fila %s: %s', x.fila, x.motivo); });
  Logger.log('  celdas a volver a lo que había (vinculadas, actualizadas, movidas, suspendidas, reactivadas, figuras): %s', otros.length);
  Logger.log('  filas BORRADAS por la agenda que se restauran (al final): %s', restaurar.length);
  if (enSeco) {
    Logger.log('>>> EN SECO: no se deshizo nada.');
    return { corrida: id, sacarian: aSacar.length, noSeSacan: noSeSacan.length, celdas: otros.length, restaurarian: restaurar.length };
  }

  // 1. las celdas; 2. las filas creadas; 3. las borradas, de vuelta al final.
  const d = deshacerAgendaLote_(sh, hdr, otros);
  d.saltadas.forEach(function (c) { Logger.log('    no se deshace (alguien la cambió): fila %s, %s', c.fila, hdr[c.col - 1]); });
  const ultimaConDatos = function () {
    let u = sh.getLastRow();
    const vals = u > 0 ? sh.getRange(1, 1, u, nCols).getValues() : [];
    while (u > 1 && vals[u - 1].every(function (v, k) { return derivadas[k] || esVacio_(v); })) u--;
    return u;
  };
  const s = sacarFilasCreadasAgenda_(sh, aSacar.map(function (x) { return x.fila; }), ultimaConDatos());
  let restauradas = 0;
  restaurar.forEach(function (c) {
    let valores = [];
    try { valores = JSON.parse(c.antes || '[]'); } catch (e) { valores = []; }
    const fila = ultimaConDatos() + 1;
    const esc = [];
    valores.forEach(function (v, k) {
      if (k >= nCols || esVacio_(v) || deAgenda.indexOf(normalizeHeader_(hdr[k])) < 0) return;
      esc.push({ fila: fila, col: k + 1, valor: valor(v, hdr[k]), esperado: '' });
    });
    if (esc.length) { escribirAgendaLote_(sh, hdr, esc); restauradas++; }
  });
  if (restauradas && DERIVADAS_POR_SCRIPT) {
    try { recalcDerivadas_(RDV_HOJA_DESTINO, true); } catch (err) { Logger.log('    las derivadas no se recalcularon: %s', err); }
  }
  SpreadsheetApp.flush();
  reg.appendRow([id + '-deshacer', new Date(), 'DESHACER ' + id, '', '', '', '', '', '', '', '', '', '', '', '', '',
                 d.hechas.length, JSON.stringify({ filas_borradas: s.borradas, filas_vaciadas: s.vaciadas, filas_restauradas: restauradas }),
                 d.saltadas.length, Date.now() - t0, '', '', '', '']);
  Logger.log('>>> deshecho: filas creadas borradas %s, vaciadas %s | celdas vueltas atrás %s | no se deshicieron (alguien las ' +
             'cambió) %s | filas borradas por la agenda RESTAURADAS %s', s.borradas, s.vaciadas, d.hechas.length, d.saltadas.length, restauradas);
  return { corrida: id, borradas: s.borradas, vaciadas: s.vaciadas, celdas: d.hechas.length, saltadas: d.saltadas.length, restauradas: restauradas };
}

// ===================== 17. La copia en el archivo "Agenda" =====================

/** "Sin barrio porque", en palabras, a partir del motivo de la regla de confianza. */
function _sinBarrioPorque_(b) {
  if (!b || b.barrio) return '';
  const m = String(b.motivo || '');
  if (/A CONFIRMAR/i.test(m)) return 'A CONFIRMAR';
  if (/sin dirección/.test(m)) return 'sin dirección con altura';
  if (/\(c\)/.test(m)) return 'cerca del límite con otro barrio';
  if (/aproximada|ok_parcial|borde/.test(m)) return 'geocodificación aproximada';
  if (/sin_resultado|error|fuera_de_caba/.test(m)) return 'la dirección no se encontró';
  if (/trae eje/.test(m)) return 'el mail trae eje, no comuna';
  if (/no trae comuna/.test(m)) return 'el mail no trae comuna ni barrio';
  if (/otra comuna/.test(m)) return 'otra comuna que la del mail';
  if (/otro barrio/.test(m)) return 'otro barrio que el del mail';
  if (/tope/.test(m)) return 'pendiente de geocodificar';
  return m;
}

/**
 * La matriz de la copia (encabezado + una fila por reunión), ordenada por fecha y hora. Lo que va en cada columna:
 * prompt, punto 17 b). La Figura es la de la fila del destino si la tiene (en Seguridad en tu Barrio, la que salió de
 * RDV CONJUNTO o cargó el equipo); si no, la 1ª nombrada.
 */
function armarCopiaAgenda_(P, cuando) {
  const out = [AGENDA_COPIA_COLUMNAS.slice()];
  // 07/10: una línea por reunión, con la misma identidad que el destino (la fila, si tiene; si no, figura + fecha +
  // hora). Las vigentes van primero en P.copia, así que una reunión que vino dos veces queda con su versión vigente.
  const vistas = new Set();
  P.repetidasCopia = 0;
  const unicas = (P.copia || []).filter(function (c) {
    const claves = [idReunionAgenda_(c.ev)].concat(c.x && c.x.fila ? ['fila ' + c.x.fila] : []);
    if (claves.some(function (k) { return vistas.has(k); })) { P.repetidasCopia++; return false; }
    claves.forEach(function (k) { vistas.add(k); });
    return true;
  });
  const filas = unicas.slice().sort(function (a, b) {
    return (a.ev.fecha - b.ev.fecha) || String(a.ev.hora).localeCompare(String(b.ev.hora));
  });
  filas.forEach(function (c) {
    const ev = c.ev, x = c.x, b = c.barrio || {};
    const figuraFila = x && x.f ? (x.f.figura || (P.figuraNueva && P.figuraNueva[x.fila]) || '') : '';
    const figura = figuraFila || ev.figuraFila || '';
    const comuna = b.barrio ? _comunaBarrioAg_(b.barrio) : ev.comuna;
    out.push([
      ev.semana, ev.grupo, _diaSemanaAgenda_(ev.fecha), ev.fecha, ev.hora, figura, ev.noParticipa.join(' / '),
      conjuntaAgenda_(ev),
      eventoAgenda_(ev), ev.lugar, _direccionAgenda_(ev), b.barrio || '',
      comuna == null ? '' : 'Comuna ' + comuna, _sinBarrioPorque_(b),
      ev.marcas.map(function (m) { return m.replace(' (lugar)', ''); }).filter(function (m, i, a) { return a.indexOf(m) === i; }).join(' / '),
      c.estado, ev.cambios || '', c.fechaOriginal || '', x ? (P.ajustarFila ? P.ajustarFila(x.fila) : x.fila) + (x.nueva ? ' (nueva)' : '') : '',
      x ? x.status || '' : '',
      ev.asunto, ev.version + ' de ' + ev.versiones, cuando
    ]);
  });
  out.ids = [null].concat(filas.map(function (c) { return c.ev.mailId || ''; }));
  out.semanaEnCurso = filas.map(function (c) { return !!(c.ev.desde && c.ev.hasta && ymd_(hoyMediodia_()) >= ymd_(c.ev.desde) && ymd_(hoyMediodia_()) <= ymd_(c.ev.hasta)); });
  return out;
}

/**
 * Escribe la copia: reescribe la solapa entera (es del sistema: nadie la edita), encabezado fijo en negrita, fechas
 * y horas con el formato del destino, el asunto con link al mensaje de Gmail, la semana en curso destacada, anchos
 * ajustados, y protegida con advertencia. No es el destino: no pasa por 05_Escritura.js.
 */
function escribirCopiaAgenda_(matriz, P) {
  const ss = SpreadsheetApp.openById(AGENDA_COPIA_SS);
  const sh = ss.getSheetByName(AGENDA_COPIA_SOLAPA) || ss.insertSheet(AGENDA_COPIA_SOLAPA);
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (pr) {
    if (pr.getDescription() === DESC_PROTECCION_COPIA_AGENDA) pr.remove();
  });
  sh.clear();
  const n = matriz.length, m = matriz[0].length;
  // "Versión" como texto ANTES de escribir: si no, "3 de 3" se lee como el 3 de marzo (07/10)
  if (n > 1) sh.getRange(2, AGENDA_COPIA_COLUMNAS.indexOf('Versión') + 1, n - 1, 1).setNumberFormat('@');
  sh.getRange(1, 1, n, m).setValues(matriz);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, m).setFontWeight('bold').setBackground('#D9D9D9');
  if (n > 1) {
    const col = function (nombre) { return AGENDA_COPIA_COLUMNAS.indexOf(nombre) + 1; };
    sh.getRange(2, col('FECHA'), n - 1, 1).setNumberFormat('d/MM/yyyy');
    sh.getRange(2, col('Fecha original'), n - 1, 1).setNumberFormat('d/MM/yyyy');
    sh.getRange(2, col('HORA'), n - 1, 1).setNumberFormat('HH:mm');
    sh.getRange(2, col('Última actualización'), n - 1, 1).setNumberFormat('d/MM/yyyy HH:mm');
    // El asunto con link al mensaje de Gmail
    if (typeof SpreadsheetApp.newRichTextValue === 'function' && matriz.ids) {
      const rich = matriz.slice(1).map(function (r, i) {
        const id = matriz.ids[i + 1];
        const v = SpreadsheetApp.newRichTextValue().setText(String(r[col('Mail') - 1] || ''));
        return [(id ? v.setLinkUrl('https://mail.google.com/mail/u/0/#all/' + id) : v).build()];
      });
      sh.getRange(2, col('Mail'), n - 1, 1).setRichTextValues(rich);
    }
    // La semana en curso, destacada
    const enCurso = [];
    (matriz.semanaEnCurso || []).forEach(function (si, i) { if (si) enCurso.push('A' + (i + 2) + ':' + _a1_(i + 2, m)); });
    if (enCurso.length) sh.getRangeList(enCurso).setBackground('#FFF2CC');
  }
  try { sh.autoResizeColumns(1, m); } catch (e) { /* no importa */ }
  sh.protect().setDescription(DESC_PROTECCION_COPIA_AGENDA).setWarningOnly(true);
  SpreadsheetApp.flush();
  Logger.log('  copia en el archivo "Agenda" (%s): %s filas escritas, solapa "%s", protegida con advertencia.',
             AGENDA_COPIA_SS.slice(0, 8) + '…', n - 1, AGENDA_COPIA_SOLAPA);
}

// ===================== EVENTO, agenda_uid, "intocada" (06/10) =====================

/**
 * El EVENTO de una reunión, **como lo escribe el equipo** (06/10): `AGENDA_EVENTO_POR_TIPO`, con "{tema}" (Temático) e
 * "{invitado}" (Primera Persona) completados con lo que dice el evento del mail. Sin tema o invitado, la forma corta.
 */
function eventoAgenda_(ev) {
  const t = AGENDA_EVENTO_POR_TIPO[ev.tipo] || ev.tipo || '';
  return t.replace(/\s*"?\{tema\}"?/, ev.tema ? ' "' + ev.tema + '"' : '')
          .replace(/\s*con \{invitado\}/, ev.invitado ? ' con ' + ev.invitado : '')
          .replace(/\s+/g, ' ').trim() + (AGENDA_EVENTO_CON_EJE && ev.eje ? ' - Eje ' + ev.eje : '');
}

/** El agenda_uid nuevo: "c-…" si la fila la CREA la agenda, "v-…" si es una fila del equipo que vincula o suspende. */
function uidAgenda_(como) {
  return (como === 'creada' ? 'c-' : 'v-') + Utilities.getUuid();
}

/**
 * **¿La fila la creó la agenda y nadie la tocó?** (regla 7, 06/10: si sí, se BORRA en vez de suspenderse). Todo:
 *   - la creó la agenda (agenda_uid "c-…"), STATUS "en agenda" (y lo anotado, también);
 *   - HORA, Dirección, FECHA y Barrio siguen con lo que escribió (agenda_*_escrita); Figura, EVENTO y "No participa"
 *     con lo que dice el mail de la reunión (`ev`) — la Figura puede estar vacía (Seguridad sin figura todavía);
 *   - ninguna otra celda cargada (fuera de las derivadas): ni RDV_UID / form_*, ni Asistentes, Oradores, Observaciones,
 *     One Page, Inscriptos…
 * Devuelve `{ ok, motivo }`.
 */
function filaIntocadaAgenda_(valores, hdr, ev) {
  const A = indicesAgenda_(hdr);
  const v = function (n) { return A[n] == null ? '' : valores[A[n]]; };
  const c = valorAgendaComparable_;
  if (!/^c-/.test(str(v('agenda_uid')))) return { ok: false, motivo: 'no la creó la agenda' };
  if (c(v('STATUS REUNIÓN'), 'STATUS REUNIÓN') !== 'en agenda') return { ok: false, motivo: 'STATUS ' + str(v('STATUS REUNIÓN')) };
  const pares = [['HORA', 'agenda_hora_escrita'], ['Dirección', 'agenda_direccion_escrita'], ['FECHA', 'agenda_fecha_escrita'],
                 ['Barrio', 'agenda_barrio_escrito'], ['STATUS REUNIÓN', 'agenda_status_escrito']];
  for (let i = 0; i < pares.length; i++) {
    if (c(v(pares[i][0]), pares[i][0]) !== c(v(pares[i][1]), pares[i][0])) return { ok: false, motivo: pares[i][0] + ' cambió' };
  }
  if (!esVacio_(v('Figura')) && c(v('Figura'), 'Figura') !== c(ev.figuraFila || '', 'Figura')) return { ok: false, motivo: 'Figura cambió' };
  if (c(v('EVENTO'), 'EVENTO') !== c(eventoAgenda_(ev), 'EVENTO')) return { ok: false, motivo: 'EVENTO cambió' };
  if (c(v('No participa'), 'No participa') !== c((ev.noParticipa || []).join(' / '), 'No participa')) return { ok: false, motivo: '"No participa" cambió' };
  const deAgenda = COLUMNAS_QUE_ESCRIBE_AGENDA.map(normalizeHeader_);
  for (let k = 0; k < hdr.length; k++) {
    if (!hdr[k] || esColumnaDerivada_(hdr[k]) || deAgenda.indexOf(normalizeHeader_(hdr[k])) >= 0) continue;
    if (!esVacio_(valores[k])) return { ok: false, motivo: 'tiene "' + hdr[k] + '" cargado' };
  }
  return { ok: true, motivo: '' };
}

// ===================== El registro (obligatorio antes de escribir) =====================

function _idCorridaAgenda_() {
  return Utilities.formatDate(new Date(), RDV_TZ, 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 4);
}

const ENC_REGISTRO_AGENDA_ = ['corrida', 'hora', 'modo', 'solo_semana', 'mails', 'reuniones', 'creadas', 'vinculadas', 'actualizadas',
  'movidas', 'suspendidas', 'reactivadas', 'figuras', 'ambiguas', 'editadas_equipo', 'saltadas_60', 'celdas_escritas', 'por_columna',
  'saltadas_al_escribir', 'ms', 'error', 'borradas', 'borradas_equipo', 'duplicados'];
const ENC_CAMBIOS_AGENDA_ = ['corrida', 'tipo', 'fila', 'col', 'columna', 'antes', 'despues', 'fondo_antes', 'agenda_uid'];

/** REGISTRO_AGENDA (la crea y completa el encabezado si le faltan columnas nuevas). */
function _hojaRegistroAgenda_(ss) {
  let sh = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA);
  if (!sh) { sh = ss.insertSheet(RDV_HOJA_REGISTRO_AGENDA); sh.appendRow(ENC_REGISTRO_AGENDA_); }
  else if (sh.getLastColumn() < ENC_REGISTRO_AGENDA_.length) sh.getRange(1, 1, 1, ENC_REGISTRO_AGENDA_.length).setValues([ENC_REGISTRO_AGENDA_]);
  return sh;
}

/** Agrega líneas a REGISTRO_AGENDA_CAMBIOS (con reintentos). Tira si no puede. */
function _anotarCambiosAgenda_(filas) {
  if (!filas.length) return;
  _conReintentosAgenda_('REGISTRO_AGENDA_CAMBIOS', function () {
    const ss = registrosAgenda_();
    let c = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA_CAMBIOS);
    if (!c) { c = ss.insertSheet(RDV_HOJA_REGISTRO_AGENDA_CAMBIOS); c.appendRow(ENC_CAMBIOS_AGENDA_); }
    else if (c.getLastColumn() < ENC_CAMBIOS_AGENDA_.length) c.getRange(1, 1, 1, ENC_CAMBIOS_AGENDA_.length).setValues([ENC_CAMBIOS_AGENDA_]);
    for (let i = 0; i < filas.length; i += AGENDA_FILAS_POR_TANDA) {
      const t = filas.slice(i, i + AGENDA_FILAS_POR_TANDA);
      const desde = c.getLastRow() + 1;
      // "antes" y "despues" como TEXTO antes de escribir: si no, Sheets lee "3 de 3" como el 3 de marzo y deshacer no
      // reconoce la fila como intacta (07/10). Las fechas ya van como "yyyy-MM-dd" (_celdaRegistro_).
      c.getRange(desde, 5, t.length, 3).setNumberFormat('@');
      c.getRange(desde, 1, t.length, ENC_CAMBIOS_AGENDA_.length).setValues(t);
    }
    SpreadsheetApp.flush();
  });
}

/**
 * **El registro de una corrida real, ANTES de escribir el destino** (obligatorio): la línea en REGISTRO_AGENDA (con lo
 * planeado) y los cambios en REGISTRO_AGENDA_CAMBIOS. Si algo falla (con los reintentos), TIRA: quien llama no escribe.
 */
function _registrarCorridaAntesDeEscribir_(corrida, P, cambios, nCeldas, nBorrar) {
  const s = P.resumen;
  _anotarCambiosAgenda_(cambios);
  _conReintentosAgenda_('REGISTRO_AGENDA', function () {
    const sh = _hojaRegistroAgenda_(registrosAgenda_());
    sh.appendRow([corrida, new Date(), 'ESCRITURA', AGENDA_SOLO_SEMANA || '', s.mails || '', s.reunionesEnAlcance || 0, s.crear || 0,
                  s.vincular || 0, s.actualizar || 0, s.mover || 0, s.suspender || 0, s.reactivar || 0, s.figura || 0, s.ambiguas || 0,
                  s.editadas || 0, s.saltadas60 || 0, nCeldas, '', '', '', '', nBorrar, s.borradasEquipo || 0,
                  (s.duplicadosAntes || 0) + (s.duplicadosDespues || 0)]);
    SpreadsheetApp.flush();
    P.filaRegistro = sh.getLastRow();
  });
}

/** Después de escribir: completa la línea de la corrida con lo que efectivamente pasó. No es obligatorio. */
function _completarRegistroAgenda_(P, t0) {
  try {
    if (!P.filaRegistro || !P.escrito) return;
    const sh = registrosAgenda_().getSheetByName(RDV_HOJA_REGISTRO_AGENDA);
    const w = P.escrito;
    sh.getRange(P.filaRegistro, 17, 1, 6).setValues([[w.hechas.length, JSON.stringify(w.porColumna), w.saltadas.length,
                                                       Date.now() - t0, '', w.borradas || 0]]);
    SpreadsheetApp.flush();
  } catch (err) {
    Logger.log('[agenda] no se pudo completar la línea de REGISTRO_AGENDA: %s (lo planeado ya estaba registrado)', err);
  }
}

// ===================== El log de los mails y de las semanas =====================

/** Cada mail leído: fecha, asunto y si su hilo tenía la etiqueta. */
function _logMailsAgenda_(mails) {
  Logger.log('--- mails leídos: %s ---', mails.lista.length);
  mails.lista.forEach(function (m) {
    Logger.log('    %s | %s | etiqueta: %s', Utilities.formatDate(m.fecha, RDV_TZ, 'dd/MM HH:mm'), m.asunto,
               m.etiqueta === undefined ? '—' : (m.etiqueta ? 'sí' : 'NO'));
  });
  (mails.errores || []).forEach(function (e) { Logger.log('    AVISO de Gmail: %s', e); });
}

/** Las semanas + grupo del alcance, y las semanas del alcance SIN ningún mail (aviso). */
function _logCoberturaAgenda_(r, alcance) {
  const fin = alcance.hasta || hoyMediodia_();
  const enAl = r.semanas.filter(function (g) {
    return g.desde && g.hasta && ymd_(g.hasta) >= ymd_(alcance.desde) && ymd_(g.desde) <= ymd_(fin);
  });
  Logger.log('  mails "Re:" con el mail anterior citado (se lee sólo lo propio): %s | reenvíos (se lee el reenviado): %s | ' +
             'respuestas sin agenda propia (no cuentan como versión): %s', r.citasCortadas || 0, r.reenvios || 0,
             (r.respuestasSinAgenda || []).length);
  (r.respuestasSinAgenda || []).forEach(function (x) { Logger.log('    sin agenda propia: %s', x); });
  Logger.log('--- semanas + grupo en el alcance: %s ---', enAl.length);
  enAl.forEach(function (g) {
    const ult = g.versiones[g.versiones.length - 1];
    Logger.log('    semana del %s | %s | %s versión(es), la última del %s', g.semanaTexto, g.grupo, g.versiones.length,
               Utilities.formatDate(ult.fecha, RDV_TZ, 'dd/MM HH:mm'));
  });
  const d0 = alcance.desde;
  const lunes = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - ((d0.getDay() + 6) % 7), 12, 0, 0);
  const sinMail = [];
  for (let d = lunes; ymd_(d) <= ymd_(fin); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7, 12, 0, 0)) {
    const dom = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6, 12, 0, 0);
    const cubre = r.semanas.some(function (g) { return g.desde && g.hasta && ymd_(g.desde) <= ymd_(dom) && ymd_(g.hasta) >= ymd_(d); });
    if (!cubre) sinMail.push(fmtFecha_(d));
  }
  Logger.log('  semanas del alcance SIN ningún mail: %s', sinMail.length ? sinMail.join(', ') + '   <<< revisar Gmail (etiqueta, asunto, cuenta)' : 'ninguna');
  return sinMail;
}

// ===================== Prompt 07 (07/10): identidad, forma del equipo, columnas del mail, "Tocado" =====================

/** La identidad de una reunión del mail, estable entre corridas: figura (o, sin figura, el lugar) + fecha + hora. */
function idReunionAgenda_(ev) {
  return (ev.figuraFila ? normalizeText_(ev.figuraFila) : 'sin_figura|' + normalizeText_(ev.lugar)) + '|' +
         (ev.fecha ? ymd_(ev.fecha) : '') + '|' + (ev.hora || '');
}

/** La identidad de una fila del destino para AGENDA_DUPLICADOS: figura + fecha + barrio (nunca el número de fila). */
function idFilaAgenda_(f) {
  return normalizeText_(f.figura) + '|' + (f.fecha ? ymd_(f.fecha) : '') + '|' + normalizeText_(f.barrio);
}

/** La HORA como la carga el equipo: la del mail, más AGENDA_HORA_AJUSTE_MIN minutos. */
function horaAgendaEquipo_(ev) {
  if (!ev.hora || !AGENDA_HORA_AJUSTE_MIN) return ev.hora;
  const m = /^(\d{2}):(\d{2})$/.exec(ev.hora);
  if (!m) return ev.hora;
  const t = (+m[1]) * 60 + (+m[2]) + AGENDA_HORA_AJUSTE_MIN;
  return ('0' + Math.floor(((t % 1440) + 1440) % 1440 / 60)).slice(-2) + ':' + ('0' + (((t % 60) + 60) % 60)).slice(-2);
}

/** Las marcas del evento, sin repetir y sin "(lugar)". */
function _marcasTextoAgenda_(ev) {
  return (ev.marcas || []).map(function (m) { return m.replace(' (lugar)', ''); })
    .filter(function (m, i, a) { return a.indexOf(m) === i; }).join(' / ');
}

/**
 * Lo del mail que la forma del equipo no guarda (prompt 07, B.5), y "Origen fila": columnas del sistema, al final.
 * Se escriben en las filas creadas y en las vinculadas, y se actualizan con cada versión del mail.
 */
function valoresMailAgenda_(ev, origen) {
  const v = {
    'Evento (mail)': str(ev.eventoTexto).replace(/\s+/g, ' '), 'Lugar (mail)': ev.lugar || '',
    'Dirección (mail)': str(ev.lugarTexto).replace(/\s+/g, ' '), 'Marcas (mail)': _marcasTextoAgenda_(ev),
    'Conjunta con': conjuntaAgenda_(ev),
    'No participa': (ev.noParticipa || []).join(' / ')
  };
  if (origen) v['Origen fila'] = origen;
  return v;
}

/** "Conjunta con" (07/10): todas las otras figuras que nombra el evento, participen o no ("No participa" va aparte). */
function conjuntaAgenda_(ev) {
  return (ev.figuras || []).filter(function (x) { return x !== ev.figuraFila; }).join(' / ');
}

/** Las escrituras de esas columnas en una fila que ya existe: sólo las que cambian (esperado = lo que tiene hoy). */
function _escriturasMailAgenda_(f, ev, A, origen) {
  const v = valoresMailAgenda_(ev, origen), out = [];
  // 07/10: agenda_version que Sheets convirtió en fecha ("3 de 3" → 46084): se reescribe como texto.
  const ver = A.agenda_version == null ? '' : f.valores[A.agenda_version];
  if (typeof ver === 'number' || ver instanceof Date) {
    out.push({ fila: f.fila, col: A.agenda_version + 1, valor: ev.version + ' de ' + ev.versiones, esperado: ver });
  }
  Object.keys(v).forEach(function (n) {
    if (A[n] == null) return;
    const cur = f.valores[A[n]];
    if (valorAgendaComparable_(cur, n) === valorAgendaComparable_(v[n], n)) return;
    out.push({ fila: f.fila, col: A[n] + 1, valor: v[n], esperado: cur });
  });
  return out;
}

/**
 * "Tocado por el equipo" (prompt 07, A.2): las columnas que el equipo cambió respecto de lo que escribió la agenda
 * (contra `agenda_*_escrita`). Pasar de "en agenda" a "Realizada" no cuenta (lo hace el sistema con los asistentes).
 */
function tocadoPorEquipoAgenda_(valores, A) {
  const v = function (n) { return A[n] == null ? '' : valores[A[n]]; };
  const c = valorAgendaComparable_;
  const out = [];
  [['FECHA', 'agenda_fecha_escrita'], ['HORA', 'agenda_hora_escrita'], ['Dirección', 'agenda_direccion_escrita'],
   ['Barrio', 'agenda_barrio_escrito'], ['STATUS REUNIÓN', 'agenda_status_escrito']].forEach(function (p) {
    const esc = v(p[1]);
    if (esVacio_(esc) || c(v(p[0]), p[0]) === c(esc, p[0])) return;
    if (p[0] === 'STATUS REUNIÓN' && normStatus_(v(p[0])) === 'realizada' && normStatus_(esc) === 'en agenda') return;
    out.push(p[0]);
  });
  return out.join(', ');
}

// ===================== El historial de la agenda (qué creó; qué borró el equipo) =====================

/**
 * Del registro de la agenda (REGISTRO_AGENDA_CAMBIOS): las filas que CREÓ (agenda_uid → identidad de la reunión, de
 * las líneas "crear_id"), sin las de corridas deshechas ni las que borró la propia agenda (regla 7), y las ya
 * "olvidadas" (la reunión salió del mail: si vuelve, es nueva) y las ya notadas como "borrada por el equipo". Si no se
 * puede leer, `error` (la corrida real no crea nada).
 */
function leerHistorialAgenda_() {
  const h = { creadas: new Map(), olvidadas: new Set(), notadas: new Set(), error: '' };
  try {
    const ss = registrosAgenda_();
    const cam = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA_CAMBIOS), reg = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA);
    if (!cam || cam.getLastRow() < 2) return h;
    const deshechas = {};
    if (reg && reg.getLastRow() > 1) {
      reg.getRange(2, 3, reg.getLastRow() - 1, 1).getValues().forEach(function (r) {
        const m = /^DESHACER (.+)$/.exec(str(r[0])); if (m) deshechas[m[1]] = true;
      });
    }
    const borradasSistema = new Set();
    cam.getRange(2, 1, cam.getLastRow() - 1, Math.max(9, cam.getLastColumn())).getValues().forEach(function (r) {
      const corrida = str(r[0]), tipo = str(r[1]), uid = str(r[8]);
      if (!uid || deshechas[corrida]) return;
      if (tipo === 'crear_id') h.creadas.set(uid, str(r[6]));
      else if (tipo === 'borrar') borradasSistema.add(uid);
      else if (tipo === 'olvidar_borrada') h.olvidadas.add(uid);
      else if (tipo === 'borrada_por_equipo') h.notadas.add(uid);
    });
    borradasSistema.forEach(function (uid) { h.creadas.delete(uid); });
  } catch (err) {
    h.error = String(err);
    Logger.log('[agenda] el historial de la agenda no se pudo leer: %s', err);
  }
  return h;
}

/** Las notas del historial de una corrida real: "borrada_por_equipo" la primera vez, "olvidar_borrada" si salió del mail. */
function _notasHistorialAgenda_(P, corrida) {
  const filas = [];
  P.borradasEquipo.forEach(function (x) {
    if (!P.historial.notadas.has(x.uid)) filas.push([corrida, 'borrada_por_equipo', '', '', '', '', idReunionAgenda_(x.ev), '', x.uid]);
  });
  const enMail = new Set(P.r.unicas.map(idReunionAgenda_));
  Object.keys(P.borradaPorEquipo).forEach(function (id) {
    if (!enMail.has(id)) filas.push([corrida, 'olvidar_borrada', '', '', '', '', id, '', P.borradaPorEquipo[id]]);
  });
  return filas;
}

// ===================== AGENDA_DUPLICADOS: elecciones y la solapa =====================

const ENC_ELECCIONES_AGENDA_ = ['fecha', 'id_reunion', 'id_fila', 'eleccion', 'comentario', 'reunion', 'fila_texto'];

/**
 * Las elecciones de AGENDA_DUPLICADOS: las guardadas en ELECCIONES_AGENDA (registros) y las que hay hoy en la solapa
 * del destino (ELEGIR), la más nueva por reunión. Map id_reunion → { eleccion: 'vincular' | 'crear' | 'no_se', idFila }.
 */
function leerEleccionesAgenda_() {
  const m = new Map();
  const tomar = function (id, eleccion, idFila, comentario, nueva) {
    const e = normalizeText_(eleccion);
    const el = /vincular|es la misma/.test(e) ? 'vincular' : (/crear|distintas/.test(e) ? 'crear' :
               (/cancel/.test(e) ? 'cancelar' : (/^sigue/.test(e) ? 'sigue' : (/no s/.test(e) ? 'no_se' : ''))));
    if (!id || !el) return;
    m.set(id, { eleccion: el, idFila: idFila, comentario: comentario || '', nueva: !!nueva, texto: eleccion });
  };
  try {
    const sh = registrosAgenda_().getSheetByName(RDV_HOJA_ELECCIONES_AGENDA);
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, ENC_ELECCIONES_AGENDA_.length).getValues().forEach(function (r) {
        tomar(str(r[1]), str(r[3]), str(r[2]), str(r[4]), false);
      });
    }
  } catch (err) { Logger.log('[agenda] ELECCIONES_AGENDA no se pudo leer: %s', err); }
  try {
    const sh = ssDestino_().getSheetByName(AGENDA_SOLAPA_DUPLICADOS);
    if (sh && sh.getLastRow() > 1) {
      const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
      const hdr = v[0].map(normalizeHeader_);
      const i = function (n) { return hdr.indexOf(normalizeHeader_(n)); };
      v.slice(1).forEach(function (r) {
        if (esVacio_(r[i('ELEGIR')])) return;
        const ya = m.get(str(r[i('id_reunion')]));
        if (ya && ya.idFila === str(r[i('id_fila')]) && normalizeText_(ya.texto) === normalizeText_(r[i('ELEGIR')])) return;
        tomar(str(r[i('id_reunion')]), str(r[i('ELEGIR')]), str(r[i('id_fila')]), str(r[i('COMENTARIO')]), true);
      });
    }
  } catch (err) { Logger.log('[agenda] %s no se pudo leer: %s', AGENDA_SOLAPA_DUPLICADOS, err); }
  return m;
}

/** Guarda en ELECCIONES_AGENDA las elecciones nuevas (las de la solapa), para que sobrevivan a que se regenere. */
function _guardarEleccionesAgenda_(P) {
  const nuevas = [];
  P.elecciones.forEach(function (e, id) { if (e.nueva) nuevas.push([new Date(), id, e.idFila, e.texto, e.comentario, '', '']); });
  if (!nuevas.length) return 0;
  _conReintentosAgenda_(RDV_HOJA_ELECCIONES_AGENDA, function () {
    const ss = registrosAgenda_();
    let sh = ss.getSheetByName(RDV_HOJA_ELECCIONES_AGENDA);
    if (!sh) { sh = ss.insertSheet(RDV_HOJA_ELECCIONES_AGENDA); sh.appendRow(ENC_ELECCIONES_AGENDA_); }
    sh.getRange(sh.getLastRow() + 1, 1, nuevas.length, ENC_ELECCIONES_AGENDA_.length).setValues(nuevas);
    SpreadsheetApp.flush();
  });
  return nuevas.length;
}

const ENC_DUPLICADOS_AGENDA_ = ['ELEGIR', 'COMENTARIO', 'resultado', 'tipo', 'reunión del mail', 'fila candidata', 'figura (fila)',
  'fecha (fila)', 'hora (fila)', 'barrio (fila)', 'STATUS (fila)', 'Origen fila', 'diferencia', 'qué hacer', 'id_reunion', 'id_fila'];

/**
 * **AGENDA_DUPLICADOS** en el archivo del destino (corrida real): una línea por fila candidata. "Antes de crear": ELEGIR
 * (desplegable) y COMENTARIO adelante, en amarillo, únicas celdas editables; "después de crear": informativa (la resuelve
 * el equipo a mano, borrando la fila que sobra). La identidad va en columnas ocultas (id_reunion, id_fila).
 */
function escribirDuplicadosAgenda_(P) {
  const ss = ssDestino_();
  const sh = ss.getSheetByName(AGENDA_SOLAPA_DUPLICADOS) || ss.insertSheet(AGENDA_SOLAPA_DUPLICADOS);
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (pr) {
    if (pr.getDescription() === DESC_PROTECCION_DUPLICADOS) pr.remove();
  });
  sh.clear();
  const filas = [ENC_DUPLICADOS_AGENDA_.slice()], editables = [];
  const reunionTexto = function (ev) {
    return fmtFecha_(ev.fecha) + ' ' + (ev.hora || '') + ' | ' + (ev.figuras.join(' + ') || ev.tipo) + ' | ' + (ev.lugar || '') +
           (ev.lugarTexto ? ' | ' + str(ev.lugarTexto) : '');
  };
  const dato = function (c) {
    const f = c.f, v = function (n) { return P.A[n] == null ? '' : f.valores[P.A[n]]; };
    return ['fila ' + f.fila, f.figura || '(sin figura)', f.fecha ? fmtFecha_(f.fecha) : '', valorAgendaComparable_(v('HORA'), 'HORA'),
            f.barrio || '', str(v('STATUS REUNIÓN')), str(v('Origen fila')) || ORIGEN_EQUIPO, c.diferencia];
  };
  P.duplicados.forEach(function (x) {
    x.candidatas.forEach(function (c) {
      if (x.tipo === 'cancelacion') {
        const el = x.eleccion;
        filas.push([el ? el.texto : '', el ? el.comentario : '', el && el.eleccion === 'no_se' ? 'pendiente (No sé)' : 'no se tocó: elegir',
                    'cancelación', reunionTexto(x.ev) + ' | la sacó: ' + (x.ev.asuntoQueLaSaco || '') + ' (' + fmtFecha_(x.ev.mailQueLaSaco) + ')']
                    .concat(dato(c), ['"Se canceló": la fila pasa a Suspendida (o se borra, si la creó la agenda y nadie la tocó). ' +
                    '"Sigue": no se toca y no se vuelve a preguntar.', x.id, idFilaAgenda_(c.f)]));
        editables.push({ fila: filas.length, opciones: AGENDA_OPCIONES_CANCELACION });
        return;
      }
      if (x.tipo === 'antes') {
        const el = x.eleccion && x.eleccion.idFila === idFilaAgenda_(c.f) ? x.eleccion : null;
        filas.push([el ? el.texto : '', el ? el.comentario : '', el && el.eleccion === 'no_se' ? 'pendiente (No sé)' : 'no se creó: elegir',
                    'antes de crear', reunionTexto(x.ev)].concat(dato(c), ['"Es la misma": la agenda usa esa fila. "Son distintas": la crea.',
                    x.id, idFilaAgenda_(c.f)]));
        editables.push({ fila: filas.length, opciones: AGENDA_OPCIONES_DUPLICADO });
      } else {
        const fa = x.fAgenda;
        filas.push(['', '', 'informativo', 'después de crear', 'fila ' + fa.fila + ' (de la agenda): ' + (fa.figura || '(sin figura)') + ' ' +
                    fmtFecha_(fa.fecha) + ' ' + (fa.barrio || '')].concat(dato(c), ['La agenda no borra ni fusiona: si es la misma reunión, ' +
                    'borren la fila que sobra (la de la agenda no se recrea).', '', idFilaAgenda_(c.f)]));
      }
    });
  });
  const ancho = ENC_DUPLICADOS_AGENDA_.length;
  sh.getRange(1, 1, filas.length, ancho).setValues(filas);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, ancho).setFontWeight('bold').setBackground('#D9D9D9');
  editables.forEach(function (e) {
    sh.getRange(e.fila, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(e.opciones, true)
      .setAllowInvalid(false).build());
    sh.getRange(e.fila, 1, 1, 2).setBackground('#FFF2CC');
  });
  try { sh.hideColumns(ancho - 1, 2); } catch (e) { /* no importa */ }
  try { sh.autoResizeColumns(1, ancho - 2); } catch (e) { /* no importa */ }
  _protegerDuplicadosAgenda_(sh, editables.map(function (e) { return sh.getRange(e.fila, 1, 1, 2); }));
  SpreadsheetApp.flush();
  Logger.log('  %s (archivo del destino): %s líneas, %s para elegir.', AGENDA_SOLAPA_DUPLICADOS, filas.length - 1, editables.length);
  return { lineas: filas.length - 1, elegir: editables.length };
}

/** La protección de AGENDA_DUPLICADOS: real (sólo quien corre el script) salvo ELEGIR y COMENTARIO; si no se puede, advertencia. */
function _protegerDuplicadosAgenda_(sh, editables) {
  const pr = sh.protect().setDescription(DESC_PROTECCION_DUPLICADOS);
  if (editables.length) pr.setUnprotectedRanges(editables);
  try {
    const yo = Session.getEffectiveUser();
    pr.addEditor(yo);
    const otros = pr.getEditors().filter(function (e) { return e.getEmail() !== yo.getEmail(); });
    if (otros.length) pr.removeEditors(otros);
    if (pr.canDomainEdit()) pr.setDomainEdit(false);
    pr.setWarningOnly(false);
  } catch (err) {
    pr.setWarningOnly(true);
    Logger.log('>>> la protección REAL de %s no se pudo poner (%s): quedó como ADVERTENCIA.', AGENDA_SOLAPA_DUPLICADOS, err);
  }
}
