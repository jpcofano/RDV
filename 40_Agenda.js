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
 *      afuera, y la fila está "en agenda" → "Suspendida". Con la protección del 60% (versión parcial) no se suspende
 *      nada. Si vuelve a aparecer, y el "Suspendida" lo puso el sistema, vuelve a "en agenda";
 *   8. Seguridad en tu Barrio: la fila nace sin figura; la Figura sale de RDV CONJUNTO por fecha + barrio (o comuna)
 *      cuando aparece. Ambigua o sin fila todavía → AGENDA_FIGURA_A_COMPLETAR (la carga el equipo en la fila);
 *   9. corre dentro del activador de cada hora si AGENDA_ACTIVA, antes del cruce con los formularios;
 *  10. sobre el destino real: versión con nombre, en seco primero, una semana primero, deshacer (paso 38);
 *  17. la COPIA en el archivo "Agenda" (AGENDA_COPIA_SS, solapa AGENDA_COPIA_SOLAPA): una fila por reunión, reescrita
 *      entera en cada corrida, con formato y protegida con advertencia (`armarCopiaAgenda_`, `escribirCopiaAgenda_`).
 *      Deshacer no la toca: se regenera en la corrida siguiente.
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
  if (!mails.lista.length) {
    const msg = 'la búsqueda no trajo ningún mail: no se escribe nada (si hay mails con la etiqueta, revisar la cuenta)';
    Logger.log('>>> %s', msg);
    _registrarAgenda_(null, enSeco, t0, msg);
    return { error: msg };
  }
  const r = agendaDesdeListaDeMails_(mails.lista, mails);
  const plan = planAgenda_(dest, r, A, alcance, opciones);
  plan.hdrNombres = dest.hdr;
  logPlanAgenda_(plan, dest);
  if (!enSeco) {
    plan.escrito = aplicarPlanAgenda_(sh, dest, plan);
    if (DERIVADAS_POR_SCRIPT && plan.escrito.creadas) {
      try { recalcDerivadas_(RDV_HOJA_DESTINO, true); }
      catch (err) { Logger.log('>>> las derivadas NO se recalcularon: %s (la corrida sigue)', err); }
    }
  }
  _escribirSolapasAgenda_(plan);
  // 17. La copia en el archivo "Agenda": en seco sólo dice cuántas filas escribiría.
  const copia = armarCopiaAgenda_(plan, new Date());
  plan.resumen.copia = copia.length - 1;
  if (enSeco) Logger.log('  copia en el archivo "Agenda": escribiría %s filas (en seco no se escribe).', copia.length - 1);
  else {
    try { escribirCopiaAgenda_(copia, plan); }
    catch (err) { Logger.log('>>> la copia en el archivo "Agenda" NO se escribió: %s (el destino ya quedó escrito).', err); }
  }
  plan.corrida = _registrarAgenda_(plan, enSeco, t0, '');
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
  const P = { filaDe: new Map(), acciones: [], ambiguas: [], editadas: [], noEnAgenda: [], reprogramadasNoMovibles: [], entreSemanas: [],
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
  const esSeguridad = function (f) { return normalizeText_(val(f, 'EVENTO')) === normalizeText_(AGENDA_EVENTO_POR_TIPO['Seguridad en tu Barrio']); };
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
        if (!f.figura && esSeguridad(f) && (ubica(ev, f) || (dir && normalizeText_(val(f, 'Dirección')) === dir))) return true;
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

  const enAlcance = r.unicas.filter(function (ev) { return _enAlcance_(alcance, ev.fecha); });
  const presentes = new Set(r.unicas.map(function (ev) { return ev.clave; }));
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
    const c = candidatas(ev).filter(function (f) { return !usadas.has(f.fila); });
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
    // Crear, al final
    const fila = proxima++;
    const b = barrioDe(ev);
    const lugar = _direccionAgenda_(ev);
    const valores = {
      'Figura': ev.figuraFila || '', 'EVENTO': AGENDA_EVENTO_POR_TIPO[ev.tipo] || ev.tipo || '', 'FECHA': ev.fecha,
      'HORA': ev.hora, 'Dirección': lugar, 'STATUS REUNIÓN': 'en agenda', 'Barrio': b.barrio,
      'No participa': ev.noParticipa.join(' / '), 'agenda_uid': Utilities.getUuid(), 'agenda_mail': _origenAgenda_(ev),
      'agenda_version': ev.version + ' de ' + ev.versiones, 'agenda_hora_escrita': ev.hora, 'agenda_direccion_escrita': lugar,
      'agenda_barrio_escrito': b.barrio, 'agenda_fecha_escrita': ev.fecha, 'agenda_status_escrito': 'en agenda'
    };
    const esc = [];
    Object.keys(valores).forEach(function (n) {
      if (col(n) == null || valores[n] === '' || valores[n] == null) return;
      esc.push({ fila: fila, col: col(n), valor: valores[n], esperado: '' });
    });
    P.acciones.push({ tipo: 'crear', fila: fila, ev: ev, escrituras: esc, barrio: b });
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
    const esc = [
      { fila: f.fila, col: col('STATUS REUNIÓN'), valor: 'Suspendida', esperado: val(f, 'STATUS REUNIÓN') },
      { fila: f.fila, col: col('agenda_status_escrito'), valor: 'Suspendida', esperado: val(f, 'agenda_status_escrito') }
    ];
    if (esVacio_(val(f, 'agenda_uid'))) esc.push({ fila: f.fila, col: col('agenda_uid'), valor: Utilities.getUuid(), esperado: '' });
    P.filaDe.set(d.clave, { fila: f.fila, status: 'Suspendida', f: f });
    P.acciones.push({ tipo: 'suspender', f: f, ev: d, escrituras: esc,
                      detalle: 'desapareció en la versión ' + (d.ultimaVersionVista + 1) + ' (' + fmtFecha_(d.mailQueLaSaco) + ')' });
  });

  // --- 8. Seguridad en tu Barrio: la Figura desde RDV CONJUNTO, en las filas de la agenda que todavía no la tienen ---
  const sinFigura = dest.filas.filter(function (f) {
    return !f.figura && !esVacio_(val(f, 'agenda_uid')) && esSeguridad(f) && f.fecha && f.fecha <= hoyMediodia_();
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
    P.copia.push({ ev: ev, x: x, estado: x && x.reprogramadaDe ? 'reprogramada' : 'vigente',
                   fechaOriginal: x && x.reprogramadaDe ? x.reprogramadaDe : (ev.fechaOriginal || null) });
  });
  r.desaparecidas.forEach(function (d) {
    if (!enCopia(d) || presentes.has(d.clave) || atendidas.has(d.clave)) return;
    P.copia.push({ ev: d, x: filaDeCopia(d), estado: 'desaparecida', fechaOriginal: d.fechaOriginal || null });
  });
  P.copia.forEach(function (c) { c.barrio = barrioDe(c.ev); });

  const n = function (t) { return P.acciones.filter(function (a) { return a.tipo === t; }).length; };
  P.resumen = { mails: r.mails, reunionesEnAlcance: enAlcance.length, crear: n('crear'), vincular: n('vincular'),
                actualizar: n('actualizar'), mover: n('mover'), suspender: n('suspender'), reactivar: n('reactivar'),
                figura: n('figura'), ambiguas: P.ambiguas.length, editadas: P.editadas.length,
                saltadas60: P.saltadas60.length, noFuturas: P.noFuturas.length, entreSemanas: P.entreSemanas.length,
                reprogramadasNoMovibles: P.reprogramadasNoMovibles.length, viejasSinFila: P.viejasSinFila.length,
                figuraACompletar: P.figuraACompletar.length, barrio: P.barrio };
  return P;
}

/** La línea "Lugar:" del mail, tal cual (también "A CONFIRMAR (NO SE COMUNICA LA DIRECCIÓN)"). */
function _direccionAgenda_(ev) {
  return str(ev.lugarTexto).replace(/\s+/g, ' ');
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
  llenar('EVENTO', AGENDA_EVENTO_POR_TIPO[ev.tipo] || ev.tipo, null);
  llenar('HORA', ev.hora, 'agenda_hora_escrita');
  llenar('Dirección', lugar, 'agenda_direccion_escrita');
  llenar('FECHA', ev.fecha, 'agenda_fecha_escrita');
  llenar('No participa', ev.noParticipa.join(' / '), null);
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
  esc.push({ fila: f.fila, col: col('agenda_uid'), valor: Utilities.getUuid(), esperado: '' });
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
  if (normStatus_(status) !== 'en agenda') { P.noEnAgenda.push({ f: f, ev: ev, status: status }); return; }
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
  seguir('HORA', ev.hora, 'agenda_hora_escrita');
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
  if (col('No participa') != null && esVacio_(val('No participa')) && ev.noParticipa.length) {
    esc.push({ fila: f.fila, col: col('No participa'), valor: ev.noParticipa.join(' / '), esperado: '' });
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
 * Escribe todas las acciones del plan por la excepción `escribirAgendaLote_`, en una sola tanda (la lectura fresca
 * la hace el helper). Devuelve los cambios hechos (para REGISTRO_AGENDA_CAMBIOS) y las saltadas (la celda ya no
 * tenía lo esperado: alguien la cambió entre el cálculo y la escritura).
 */
function aplicarPlanAgenda_(sh, dest, plan) {
  const todas = [];
  plan.acciones.forEach(function (a, i) { a.escrituras.forEach(function (e) { todas.push(Object.assign({ accion: i }, e)); }); });
  const w = escribirAgendaLote_(sh, dest.hdr, todas);
  const porTipo = {}, porColumna = {};
  w.hechas.forEach(function (e) {
    const a = plan.acciones[e.accion];
    porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
    const n = dest.hdr[e.col - 1];
    porColumna[n] = (porColumna[n] || 0) + 1;
  });
  SpreadsheetApp.flush();
  const creadas = plan.acciones.filter(function (a) { return a.tipo === 'crear'; }).length;
  Logger.log('>>> ESCRITURA de la agenda en "%s": %s celdas (%s) | saltadas porque la celda ya no tenía lo esperado: %s',
             RDV_HOJA_DESTINO, w.hechas.length, Object.keys(porTipo).map(function (k) { return k + ' ' + porTipo[k]; }).join(', ') || 'nada',
             w.saltadas.length);
  Logger.log('    por columna: %s', Object.keys(porColumna).map(function (k) { return k + ' ' + porColumna[k]; }).join(' | ') || 'nada');
  return { hechas: w.hechas, saltadas: w.saltadas, creadas: creadas, porColumna: porColumna, porTipo: porTipo };
}

// ===================== El log, las solapas y el registro =====================

function logPlanAgenda_(P, dest) {
  const s = P.resumen;
  Logger.log('--- la agenda: qué haría ---');
  Logger.log('  reuniones del mail en el alcance: %s | CREAR %s | VINCULAR %s | ACTUALIZAR %s | MOVER (reprogramada) %s | ' +
             'SUSPENDER %s | REACTIVAR %s | FIGURA de Seguridad %s', s.reunionesEnAlcance, s.crear, s.vincular, s.actualizar,
             s.mover, s.suspender, s.reactivar, s.figura);
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
    Logger.log('  EVENTO que escribe hoy el equipo, por tipo del mail (para ajustar AGENDA_EVENTO_POR_TIPO):');
    tipos.forEach(function (t) {
      const c = P.eventoPorTipo[t];
      Logger.log('    %s → %s   (hoy se escribiría "%s")', t, Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })
        .map(function (k) { return '"' + k + '" ' + c[k]; }).join(' · '), AGENDA_EVENTO_POR_TIPO[t] || t);
    });
  }
  Logger.log('  Seguridad sin figura: se completa %s | a completar por el equipo %s | reuniones viejas del mail sin fila ' +
             '(no se crean) %s', s.figura, s.figuraACompletar, s.viejasSinFila);
}

function _escribirSolapasAgenda_(P) {
  try {
    const viejas = [['fecha', 'hora', 'tipo', 'figura', 'lugar', 'direccion', 'grupo', 'mail', 'evento_texto']];
    P.viejasSinFila.forEach(function (ev) {
      viejas.push([fmtFecha_(ev.fecha), ev.hora, ev.tipo, ev.figuraFila, ev.lugar, ev.lugarTexto, ev.grupo, _origenAgenda_(ev), ev.eventoTexto]);
    });
    if (viejas.length === 1) viejas.push(['(ninguna)', '', '', '', '', '', '', '', '']);
    _escribirHojaAgenda_(AGENDA_SOLAPA_VIEJAS, viejas);
    const fig = [['fila', 'fecha', 'barrio', 'evento', 'por qué falta la figura', 'filas de RDV CONJUNTO']];
    P.figuraACompletar.forEach(function (x) {
      fig.push([x.f.fila, fmtFecha_(x.f.fecha), x.f.barrio, x.f.evento, x.motivo, (x.filas || []).join(', ')]);
    });
    if (fig.length === 1) fig.push(['(ninguna)', '', '', '', '', '']);
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
  const id = Utilities.formatDate(new Date(), RDV_TZ, 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 4);
  try {
    const ss = ssIntermedia_();
    const enc = ['corrida', 'hora', 'modo', 'solo_semana', 'mails', 'reuniones', 'creadas', 'vinculadas', 'actualizadas',
                 'movidas', 'suspendidas', 'reactivadas', 'figuras', 'ambiguas', 'editadas_equipo', 'saltadas_60',
                 'celdas_escritas', 'por_columna', 'saltadas_al_escribir', 'ms', 'error'];
    let sh = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA);
    if (!sh) { sh = ss.insertSheet(RDV_HOJA_REGISTRO_AGENDA); sh.appendRow(enc); }
    const s = P ? P.resumen : {}, w = P && P.escrito ? P.escrito : null;
    sh.appendRow([id, new Date(), enSeco ? 'en seco' : 'ESCRITURA', AGENDA_SOLO_SEMANA || '', s.mails || '',
                  s.reunionesEnAlcance || 0, s.crear || 0, s.vincular || 0, s.actualizar || 0, s.mover || 0, s.suspender || 0,
                  s.reactivar || 0, s.figura || 0, s.ambiguas || 0, s.editadas || 0, s.saltadas60 || 0,
                  w ? w.hechas.length : 0, w ? JSON.stringify(w.porColumna) : '', w ? w.saltadas.length : 0, Date.now() - t0, error || '']);
    if (w && w.hechas.length) {
      let c = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA_CAMBIOS);
      if (!c) { c = ss.insertSheet(RDV_HOJA_REGISTRO_AGENDA_CAMBIOS); c.appendRow(['corrida', 'tipo', 'fila', 'col', 'columna', 'antes', 'despues', 'fondo_antes']); }
      const filas = w.hechas.map(function (e) {
        return [id, P.acciones[e.accion].tipo, e.fila, e.col, P.hdrNombres ? P.hdrNombres[e.col - 1] : '', _celdaRegistro_(e.antes),
                _celdaRegistro_(e.valor), e.fondoAntes || ''];
      });
      c.getRange(c.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
    }
  } catch (err) {
    Logger.log('[agenda] no se pudo escribir %s: %s (la corrida igual terminó)', RDV_HOJA_REGISTRO_AGENDA, err);
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
 * fila (fuera de las derivadas)— y vuelve las demás celdas a lo que había, sólo si todavía tienen lo que escribió la
 * agenda. En seco, sólo dice qué haría. Deja una línea "DESHACER" en REGISTRO_AGENDA.
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
  const ss = ssIntermedia_();
  const reg = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA), cam = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA_CAMBIOS);
  if (!reg || !cam || cam.getLastRow() < 2) { Logger.log('>>> No hay ninguna corrida de la agenda que haya escrito.'); return { deshecho: 0 }; }
  const regV = reg.getRange(1, 1, reg.getLastRow(), reg.getLastColumn()).getValues();
  const deshechas = {};
  regV.forEach(function (r) { const m = /^DESHACER (.+)$/.exec(str(r[2])); if (m) deshechas[m[1]] = true; });
  let id = corrida;
  if (!id) {
    for (let i = regV.length - 1; i >= 1; i--) {
      if (str(regV[i][2]) === 'ESCRITURA' && num(regV[i][16]) > 0 && !deshechas[str(regV[i][0])]) { id = str(regV[i][0]); break; }
    }
  }
  if (!id) { Logger.log('>>> No hay ninguna corrida de ESCRITURA sin deshacer.'); return { deshecho: 0 }; }
  if (deshechas[id]) { Logger.log('>>> La corrida %s ya fue deshecha.', id); return { deshecho: 0 }; }
  const camV = cam.getRange(2, 1, cam.getLastRow() - 1, 8).getValues().filter(function (r) { return str(r[0]) === id; });
  Logger.log('  corrida %s: %s celdas cambiadas', id, camV.length);

  const sh = verificarHojaDestino_(ssDestino_());
  const nCols = sh.getLastColumn();
  const hdr = sh.getRange(1, 1, 1, nCols).getValues()[0];
  const valor = function (v, n) {
    const nn = normalizeHeader_(n);
    if ((nn === 'fecha' || nn === 'agenda_fecha_escrita') && /^\d{4}-\d{2}-\d{2}$/.test(str(v))) return toDate_(v);
    return v;
  };
  const cambios = camV.map(function (r) {
    return { tipo: str(r[1]), fila: num(r[2]), col: num(r[3]), antes: valor(r[5], hdr[num(r[3]) - 1]),
             despues: valor(r[6], hdr[num(r[3]) - 1]), fondoAntes: str(r[7]) || null };
  });
  // Las filas creadas: ¿todavía replican el mail?
  const creadas = {};
  cambios.forEach(function (c) { if (c.tipo === 'crear') (creadas[c.fila] = creadas[c.fila] || []).push(c); });
  const derivadas = hdr.map(function (h) { return esColumnaDerivada_(h); });
  const aSacar = [], noSeSacan = [];
  Object.keys(creadas).forEach(function (fila) {
    const fi = Number(fila);
    const fv = sh.getRange(fi, 1, 1, nCols).getValues()[0];
    const escritas = {};
    creadas[fila].forEach(function (c) { escritas[c.col] = c; });
    let replica = true, motivo = '';
    for (let k = 0; k < nCols && replica; k++) {
      if (derivadas[k]) continue;
      const c = escritas[k + 1];
      if (c) {
        if (valorAgendaComparable_(fv[k], hdr[k]) !== valorAgendaComparable_(c.despues, hdr[k])) { replica = false; motivo = hdr[k] + ' cambió'; }
      } else if (!esVacio_(fv[k])) {
        // otras columnas de la agenda (las escribió otra corrida) cuentan como de la agenda
        if (COLUMNAS_QUE_ESCRIBE_AGENDA.map(normalizeHeader_).indexOf(normalizeHeader_(hdr[k])) < 0) { replica = false; motivo = 'tiene "' + hdr[k] + '" cargado'; }
      }
    }
    (replica ? aSacar : noSeSacan).push({ fila: fi, motivo: motivo });
  });
  const otros = cambios.filter(function (c) { return c.tipo !== 'crear'; });
  Logger.log('  filas creadas: %s → se sacan %s | NO se sacan (alguien cargó algo) %s', Object.keys(creadas).length,
             aSacar.length, noSeSacan.length);
  noSeSacan.forEach(function (x) { Logger.log('    fila %s: %s', x.fila, x.motivo); });
  Logger.log('  celdas a volver a lo que había (vinculadas, actualizadas, movidas, suspendidas, reactivadas, figuras): %s', otros.length);
  if (enSeco) { Logger.log('>>> EN SECO: no se deshizo nada.'); return { corrida: id, sacarian: aSacar.length, noSeSacan: noSeSacan.length, celdas: otros.length }; }

  // Primero las celdas (de abajo hacia arriba no hace falta: no se mueven filas), después las filas.
  const d = deshacerAgendaLote_(sh, hdr, otros);
  d.saltadas.forEach(function (c) { Logger.log('    no se deshace (alguien la cambió): fila %s, %s', c.fila, hdr[c.col - 1]); });
  let ultimaConDatos = sh.getLastRow();
  const vals = sh.getRange(1, 1, ultimaConDatos, nCols).getValues();
  while (ultimaConDatos > 1 && vals[ultimaConDatos - 1].every(function (v, k) { return derivadas[k] || esVacio_(v); })) ultimaConDatos--;
  const s = sacarFilasCreadasAgenda_(sh, aSacar.map(function (x) { return x.fila; }), ultimaConDatos);
  SpreadsheetApp.flush();
  reg.appendRow([id + '-deshacer', new Date(), 'DESHACER ' + id, '', '', '', '', '', '', '', '', '', '', '', '', '',
                 d.hechas.length, JSON.stringify({ filas_borradas: s.borradas, filas_vaciadas: s.vaciadas }), d.saltadas.length,
                 Date.now() - t0, '']);
  Logger.log('>>> deshecho: filas borradas %s, vaciadas %s | celdas vueltas atrás %s | no se deshicieron (alguien las cambió) %s',
             s.borradas, s.vaciadas, d.hechas.length, d.saltadas.length);
  return { corrida: id, borradas: s.borradas, vaciadas: s.vaciadas, celdas: d.hechas.length, saltadas: d.saltadas.length };
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
  const filas = (P.copia || []).slice().sort(function (a, b) {
    return (a.ev.fecha - b.ev.fecha) || String(a.ev.hora).localeCompare(String(b.ev.hora));
  });
  filas.forEach(function (c) {
    const ev = c.ev, x = c.x, b = c.barrio || {};
    const figuraFila = x && x.f ? (x.f.figura || (P.figuraNueva && P.figuraNueva[x.fila]) || '') : '';
    const figura = figuraFila || ev.figuraFila || '';
    const comuna = b.barrio ? _comunaBarrioAg_(b.barrio) : ev.comuna;
    out.push([
      ev.semana, ev.grupo, _diaSemanaAgenda_(ev.fecha), ev.fecha, ev.hora, figura, ev.noParticipa.join(' / '),
      ev.figuras.filter(function (f) { return f !== ev.figuraFila; }).join(' / '),
      AGENDA_EVENTO_POR_TIPO[ev.tipo] || ev.tipo || '', ev.lugar, _direccionAgenda_(ev), b.barrio || '',
      comuna == null ? '' : 'Comuna ' + comuna, _sinBarrioPorque_(b),
      ev.marcas.map(function (m) { return m.replace(' (lugar)', ''); }).filter(function (m, i, a) { return a.indexOf(m) === i; }).join(' / '),
      c.estado, ev.cambios || '', c.fechaOriginal || '', x ? x.fila + (x.nueva ? ' (nueva)' : '') : '', x ? x.status || '' : '',
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

