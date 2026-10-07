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
  const plan = planAgenda_(dest, r, A, alcance, opciones);
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
  // 17. La copia en el archivo "Agenda": en seco sólo dice cuántas filas escribiría.
  const copia = armarCopiaAgenda_(plan, new Date());
  plan.resumen.copia = copia.length - 1;
  if (enSeco) Logger.log('  copia en el archivo "Agenda": escribiría %s filas (en seco no se escribe).', copia.length - 1);
  else {
    try { escribirCopiaAgenda_(copia, plan); }
    catch (err) { Logger.log('>>> la copia en el archivo "Agenda" NO se escribió: %s (el destino ya quedó escrito).', err); }
  }
  if (enSeco) plan.corrida = _registrarAgenda_(plan, enSeco, t0, '');
  else _completarRegistroAgenda_(plan, t0);
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
  const P = { A: A, filaDe: new Map(), acciones: [], ambiguas: [], editadas: [], noEnAgenda: [], reprogramadasNoMovibles: [], entreSemanas: [],
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
      'Figura': ev.figuraFila || '', 'EVENTO': eventoAgenda_(ev), 'FECHA': ev.fecha,
      'HORA': ev.hora, 'Dirección': lugar, 'STATUS REUNIÓN': 'en agenda', 'Barrio': b.barrio,
      'No participa': ev.noParticipa.join(' / '), 'agenda_uid': uidAgenda_('creada'), 'agenda_mail': _origenAgenda_(ev),
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
    const salida = 'desapareció en la versión ' + (d.ultimaVersionVista + 1) + ' (' + fmtFecha_(d.mailQueLaSaco) + ')';
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
    const x = P.filaDe.get(d.clave);
    if (x && x.borrada) P.copia.push({ ev: d, x: null, estado: 'desaparecida (fila borrada)', fechaOriginal: d.fechaOriginal || null });
    else P.copia.push({ ev: d, x: filaDeCopia(d), estado: 'desaparecida', fechaOriginal: d.fechaOriginal || null });
  });
  P.copia.forEach(function (c) { c.barrio = barrioDe(c.ev); });

  const n = function (t) { return P.acciones.filter(function (a) { return a.tipo === t; }).length; };
  P.resumen = { mails: r.mails, reunionesEnAlcance: enAlcance.length, crear: n('crear'), vincular: n('vincular'),
                actualizar: n('actualizar'), mover: n('mover'), suspender: n('suspender'), borrar: n('borrar'), reactivar: n('reactivar'),
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
  llenar('EVENTO', eventoAgenda_(ev), null);
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
  }));
  try {
    _registrarCorridaAntesDeEscribir_(corrida, plan, cambios, todas.length, borrar.length);
  } catch (err) {
    throw new Error('no se pudo escribir REGISTRO_AGENDA (' + err + '): NO se escribió nada en el destino.');
  }
  // 2. las celdas
  const w = escribirAgendaLote_(sh, hdr, todas);
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
      fig.push([P.ajustarFila ? P.ajustarFila(x.f.fila) : x.f.fila, fmtFecha_(x.f.fecha), x.f.barrio, x.f.evento, x.motivo, (x.filas || []).join(', ')]);
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
  const id = _idCorridaAgenda_();
  try {
    const ss = intermediaAgenda_();
    const sh = _hojaRegistroAgenda_(ss);
    const s = P ? P.resumen : {}, w = P && P.escrito ? P.escrito : null;
    sh.appendRow([id, new Date(), enSeco ? 'en seco' : 'ESCRITURA', AGENDA_SOLO_SEMANA || '', s.mails || '',
                  s.reunionesEnAlcance || 0, s.crear || 0, s.vincular || 0, s.actualizar || 0, s.mover || 0, s.suspender || 0,
                  s.reactivar || 0, s.figura || 0, s.ambiguas || 0, s.editadas || 0, s.saltadas60 || 0,
                  w ? w.hechas.length : 0, w ? JSON.stringify(w.porColumna) : '', w ? w.saltadas.length : 0, Date.now() - t0, error || '',
                  s.borrar || 0]);
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
  const ss = intermediaAgenda_();
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
                 d.saltadas.length, Date.now() - t0, '', '']);
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
          .replace(/\s+/g, ' ').trim();
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
  'saltadas_al_escribir', 'ms', 'error', 'borradas'];
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
    const ss = intermediaAgenda_();
    let c = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA_CAMBIOS);
    if (!c) { c = ss.insertSheet(RDV_HOJA_REGISTRO_AGENDA_CAMBIOS); c.appendRow(ENC_CAMBIOS_AGENDA_); }
    else if (c.getLastColumn() < ENC_CAMBIOS_AGENDA_.length) c.getRange(1, 1, 1, ENC_CAMBIOS_AGENDA_.length).setValues([ENC_CAMBIOS_AGENDA_]);
    for (let i = 0; i < filas.length; i += AGENDA_FILAS_POR_TANDA) {
      const t = filas.slice(i, i + AGENDA_FILAS_POR_TANDA);
      c.getRange(c.getLastRow() + 1, 1, t.length, ENC_CAMBIOS_AGENDA_.length).setValues(t);
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
    const sh = _hojaRegistroAgenda_(intermediaAgenda_());
    sh.appendRow([corrida, new Date(), 'ESCRITURA', AGENDA_SOLO_SEMANA || '', s.mails || '', s.reunionesEnAlcance || 0, s.crear || 0,
                  s.vincular || 0, s.actualizar || 0, s.mover || 0, s.suspender || 0, s.reactivar || 0, s.figura || 0, s.ambiguas || 0,
                  s.editadas || 0, s.saltadas60 || 0, nCeldas, '', '', '', '', nBorrar]);
    SpreadsheetApp.flush();
    P.filaRegistro = sh.getLastRow();
  });
}

/** Después de escribir: completa la línea de la corrida con lo que efectivamente pasó. No es obligatorio. */
function _completarRegistroAgenda_(P, t0) {
  try {
    if (!P.filaRegistro || !P.escrito) return;
    const sh = intermediaAgenda_().getSheetByName(RDV_HOJA_REGISTRO_AGENDA);
    const w = P.escrito;
    sh.getRange(P.filaRegistro, 17, 1, 6).setValues([[w.hechas.length, JSON.stringify(w.porColumna), w.saltadas.length,
                                                       Date.now() - t0, '', w.borradas || 0]]);
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
