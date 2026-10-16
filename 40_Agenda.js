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
 *      15/10 (noche, "EL MAIL MANDA", con la cancelación automática en modo "suspender"): también la reunión que sigue en el
 *      mail pero en ROJO ENTERO (AGENDA_COLORES_MAIL, 41_AgendaColores.js; paso 7b); en las dos, sólo si el mail que la cancela
 *      es ANTERIOR a la fecha y hora de la reunión, y sólo una fila "en agenda" (otro STATUS: no se toca, se avisa); una
 *      suspendida por rojo no se reactiva mientras siga en rojo (ni nunca con los colores apagados: "suspendida_rojo" en el
 *      registro). La que el sistema suspendió y después recibe asistentes o inscriptos: nada se pisa, se avisa (7c);
 *      16/10 (AGENDA_CANCELACION_CONJUNTO, apagado): la TERCERA fuente, el Estado "Cancelado" de RDV CONJUNTO (que sólo se lee),
 *      con el mismo cruce que los Asistentes y las mismas reglas (paso 7d, 53_CancelacionConjunto.js); no se reactiva sola;
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
 * de crear, y "una reunión en dos filas" (H3), van ahí también, desde el 16/10 como UNA línea por par que pide decidir
 * ("Quedarse con la fila X" / "… Y" / "Son reuniones distintas"; se aplica antes del plan, 54_FusionAgenda.js
 * `fusionAntesDelPlanAgenda_`: una fila del equipo nunca se borra). AGENDA_DUPLICADOS es SÓLO lo que se decide: lo
 * informativo va a AGENDA_PENDIENTES (intermedia, `infoAgenda_`). Una fila que creó la agenda y el equipo
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
  // 16/10: los tramos de la agenda (49_Corridas.js, REGISTRO_CORRIDAS agenda_*_s): cada `tramo(k)` cierra el tramo k
  if (typeof agendaTiemposIniciar_ === 'function') agendaTiemposIniciar_();
  const tramo = typeof agendaTiempo_ === 'function' ? agendaTiempo_ : function () {};
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
  // 16/10 (AGENDA_DUPLICADOS sólo decisiones; 54_FusionAgenda.js): "una reunión en dos filas" ANTES del plan — lo que eligió el
  // equipo ("Quedarse con la fila X") y, con AGENDA_FUSION_AUTOMATICA, lo que juntan solas las reglas del paso 97. Con el bloqueo
  // que ya tiene esta corrida. Si escribió la base, se relee (las filas de abajo de una borrada subieron una).
  if (typeof fusionAntesDelPlanAgenda_ === 'function' && !A.faltan.length) {
    try {
      const fusionPrevia = fusionAntesDelPlanAgenda_(sh, dest, A, Object.assign({ alcance: alcance }, opciones), enSeco);
      // las mismas elecciones para el plan (no se leen dos veces: la fusión no cambia AGENDA_DUPLICADOS ni ELECCIONES_AGENDA)
      opciones = Object.assign({}, opciones, { fusionPrevia: fusionPrevia }, !opciones.elecciones && fusionPrevia.elecciones ? { elecciones: fusionPrevia.elecciones } : {});
      if (fusionPrevia.releer) _releerDestinoTrasFusionAgenda_(dest);
    } catch (err) {
      Logger.log('>>> "una reunión en dos filas" (fusión antes del plan) falló: %s (la agenda sigue; se relee la base por las dudas)', err);
      if (!enSeco) _releerDestinoTrasFusionAgenda_(dest);
    }
  }
  // 16/10: los barrios de Comunas (el parser los usa) se leen acá, en "base", y no adentro del parse (que así mide sólo el parser)
  try { _listas_(); } catch (err) { Logger.log('  (Comunas no se pudo leer acá: %s; el parser lo intenta de nuevo)', err); }
  tramo('base');
  // 15/10 (noche): los colores del mail (AGENDA_COLORES_MAIL, o `opciones.coloresMail`): el HTML y el color de cada reunión
  const coloresMail = opciones.coloresMail !== undefined ? !!opciones.coloresMail : AGENDA_COLORES_MAIL;
  // 16/10 (AGENDA_CACHE_MAILS, 41_AgendaCache.js): lo ya leído y parseado de cada mail, de la cache (`opciones.cacheMails`: la de un test)
  const cacheMails = opciones.cacheMails !== undefined ? opciones.cacheMails
    : (AGENDA_CACHE_MAILS && !opciones.mails && typeof cacheAgendaAbrir_ === 'function' ? cacheAgendaAbrir_() : null);
  let mails;
  try {
    const desdeCopia = AGENDA_COPIA_DESDE ? toDate_(AGENDA_COPIA_DESDE) : null;
    const leerDesde = desdeCopia && desdeCopia < alcance.desde ? desdeCopia : alcance.desde;
    mails = opciones.mails ? { fuente: '(lista de prueba)', lista: opciones.mails }
                           : leerMailsAgendaGmail_(new Date(leerDesde.getTime() - 7 * 86400000),
                                                   coloresMail || cacheMails ? { html: coloresMail, cache: cacheMails } : undefined);
  } catch (err) {
    const msg = 'no se pudieron leer los mails: ' + err;
    Logger.log('>>> %s. No se escribió nada.', msg);
    _registrarAgenda_(null, enSeco, t0, msg);
    return { error: msg };
  }
  if (mails.html && typeof agendaTiempoSumar_ === 'function') agendaTiempoSumar_('html', mails.html.ms || 0);
  tramo('gmail', mails.html ? mails.html.ms || 0 : 0);
  Logger.log('  mails: %s (%s) | alcance: %s', mails.lista.length, mails.fuente, alcance.desc);
  _logMailsAgenda_(mails);
  if (!mails.lista.length) {
    const msg = 'la búsqueda no trajo ningún mail: no se escribe nada (si hay mails con la etiqueta, revisar la cuenta)';
    Logger.log('>>> %s', msg);
    _registrarAgenda_(null, enSeco, t0, msg);
    return { error: msg };
  }
  // 15/10 (H4): `opciones.validarMails` fuerza la validación de los mails (si no, AGENDA_VALIDAR_MAILS)
  let meta = opciones.validarMails === undefined ? mails : Object.assign({}, mails, { validarMails: opciones.validarMails });
  if (opciones.coloresMail !== undefined) meta = Object.assign({}, meta, { coloresMail: opciones.coloresMail });
  // 16/10 (AGENDA_CACHE_MAILS): el parser con cache (la de Apps Script; si no se pudo abrir, al menos la memoria de esta corrida)
  if (cacheMails || (AGENDA_CACHE_MAILS && !opciones.mails)) meta = Object.assign({}, meta, { cacheParse: cacheMails || true });
  const r = agendaDesdeListaDeMails_(mails.lista, meta);
  _logCoberturaAgenda_(r, alcance);
  if (r.colores) {
    Logger.log('  colores del mail: versiones con HTML %s | sin HTML %s | reuniones en ROJO ENTERO (canceladas en el mail) %s | con nota %s | %s ms%s',
               r.colores.versionesConHtml, r.colores.versionesSinHtml, r.colores.rojas, r.colores.notas, r.colores.ms,
               r.colores.errores.length ? ' | el color no se pudo leer en: ' + r.colores.errores.join(' / ') : '');
  }
  if (r.parseCache) Logger.log('  parser: textos de la cache %s | repetidos en esta corrida %s | parseados %s', r.parseCache.deCache,
                               r.parseCache.repetidos, r.parseCache.parseados);
  tramo('parse');
  // 16/10: la cache de los mails se escribe apenas terminó el parse (todo lo que guarda ya se sabe): si la corrida se corta después,
  // la próxima ya no vuelve a bajar ni a parsear estos mails
  const statsCache = cacheMails ? cacheAgendaCerrar_(cacheMails) : null;
  if (typeof agendaMailsAnotar_ === 'function') agendaMailsAnotar_(mails.cache || null, r.parseCache || null, statsCache, mails.html || null);
  tramo('cache');
  // 16/10 (d): la GUARDA DE TIEMPO dentro de la agenda: si al terminar el parse la corrida ya lleva más de
  // AGENDA_GEO_LIMITE_TRAS_PARSE_MS, se geocodifican sólo las reuniones de hoy a AGENDA_GEO_DIAS_SI_TARDE días (el resto, pendiente)
  const opcPlan = Object.assign({ enSeco: enSeco }, opciones);
  const llevaMs = typeof corridaTranscurridoMs_ === 'function' && typeof _corrida_ !== 'undefined' && _corrida_ ? corridaTranscurridoMs_() : Date.now() - t0;
  if (AGENDA_GEO_AHORRO && opcPlan.geoSoloDias === undefined && llevaMs > AGENDA_GEO_LIMITE_TRAS_PARSE_MS) {
    opcPlan.geoSoloDias = AGENDA_GEO_DIAS_SI_TARDE;
    Logger.log('>>> GUARDA DE TIEMPO DE LA AGENDA: al terminar el parse la corrida lleva %s s (límite %s s): esta corrida geocodifica ' +
               'sólo las reuniones de hoy a %s días; las demás quedan para la próxima (sin crear ni tocar su barrio).',
               Math.round(llevaMs / 1000), Math.round(AGENDA_GEO_LIMITE_TRAS_PARSE_MS / 1000), AGENDA_GEO_DIAS_SI_TARDE);
  }
  const plan = planAgenda_(dest, r, A, alcance, opcPlan);
  plan.hdrNombres = dest.hdr;
  logPlanAgenda_(plan, dest);
  _logGeoAgenda_(plan);
  tramo('plan');
  if (!enSeco) {
    // REGISTRO_AGENDA es obligatorio: sin él no se puede deshacer. Si no se puede escribir, no se escribe el destino.
    const corrida = _idCorridaAgenda_();
    try {
      plan.escrito = aplicarPlanAgenda_(sh, dest, plan, corrida);
    } catch (err) {
      if (typeof baseCorridaInvalidar_ === 'function') baseCorridaInvalidar_('la agenda falló escribiendo');
      const msg = String(err && err.message || err);
      Logger.log('>>> %s', msg);
      if (/REGISTRO_AGENDA/.test(msg)) return { error: msg };
      throw err;
    }
    plan.corrida = corrida;
    // 16/10 (BASE_UNA_LECTURA_POR_CORRIDA): si la agenda escribió algo, el cruce y los demás vuelven a leer la base
    if (typeof baseCorridaInvalidar_ === 'function' && (!plan.escrito || (plan.escrito.hechas || []).length || plan.escrito.borradas)) {
      baseCorridaInvalidar_('la agenda escribió en la base');
    }
    if (DERIVADAS_POR_SCRIPT && (plan.escrito.creadas || plan.escrito.borradas)) {
      try { recalcDerivadas_(RDV_HOJA_DESTINO, true); }
      catch (err) { Logger.log('>>> las derivadas NO se recalcularon: %s (la corrida sigue)', err); }
      if (typeof baseCorridaInvalidar_ === 'function') baseCorridaInvalidar_('las derivadas de la agenda');
    }
  }
  tramo('escritura');
  _escribirSolapasAgenda_(plan);
  // 15/10 (noche): los avisos de la agenda segura y de la cancelación automática (sólo en la corrida real)
  if (!enSeco) {
    try { _avisosAgendaSegura_(plan, r); } catch (err) { Logger.log('>>> los avisos de la agenda no se registraron: %s', err); }
  }
  if (!enSeco) {
    // AGENDA_DUPLICADOS (archivo del destino) y las elecciones leídas: no son obligatorias, el destino ya quedó escrito.
    try { _guardarEleccionesAgenda_(plan); }
    catch (err) { Logger.log('>>> %s NO se guardó: %s (las elecciones siguen en la solapa)', RDV_HOJA_ELECCIONES_AGENDA, err); }
    try { escribirDuplicadosAgenda_(plan); }
    catch (err) { Logger.log('>>> %s NO se escribió: %s', AGENDA_SOLAPA_DUPLICADOS, err); }
  } else if (plan.duplicados.length) {
    Logger.log('  %s: en seco no se escribe (tendría %s reuniones).', AGENDA_SOLAPA_DUPLICADOS, plan.duplicados.length);
  }
  tramo('solapas');
  // 17. La copia en el archivo "Agenda": en seco sólo dice cuántas filas escribiría.
  const copia = armarCopiaAgenda_(plan, new Date());
  plan.resumen.copia = copia.length - 1;
  if (plan.repetidasCopia) Logger.log('  copia en el archivo "Agenda": %s líneas repetidas no se escriben (una por reunión)', plan.repetidasCopia);
  if (enSeco) {
    const pz = partirCopiaAgenda_(copia, hoyMediodia_());
    Logger.log('  copia en el archivo "Agenda": escribiría %s filas en "%s" y %s en "%s" (en seco no se escribe).',
               pz.abierta.length - 1, AGENDA_COPIA_SOLAPA, pz.cerrada.length - 1, AGENDA_COPIA_SOLAPA_CERRADA);
    if (AGENDA_COPIA_EN_RDV) Logger.log('  y las mismas %s filas en la solapa "%s" del archivo RDV (en seco no se escribe).',
                                        pz.abierta.length - 1, AGENDA_RDV_SOLAPA);
    if (typeof _vistaPreviaAgenda_ !== 'undefined' && _vistaPreviaAgenda_) {
      try { logVistasAgenda_(pz.abierta, plan); }
      catch (err) { Logger.log('>>> la vista previa de "%s" y "%s" falló: %s', AGENDA_SOLAPA_CALL, AGENDA_SOLAPA_VISTA_MAIL, err); }
    }
  }
  else {
    try { escribirCopiaAgenda_(copia, plan); }
    catch (err) { Logger.log('>>> la copia en el archivo "Agenda" NO se escribió: %s (el destino ya quedó escrito).', err); }
  }
  tramo('copia');
  if (enSeco) plan.corrida = _registrarAgenda_(plan, enSeco, t0, '');
  else _completarRegistroAgenda_(plan, t0);
  // Que nada quede pendiente para el flush implícito del final de la ejecución (07/10: la ejecución terminó en Error
  // ahí, con REGISTRO_AGENDA sin escribir). Si falla, se dice y la corrida termina igual.
  try { SpreadsheetApp.flush(); } catch (err) { Logger.log('>>> el flush final falló: %s (lo anterior ya se había escrito con su flush)', err); }
  tramo('registro');
  Logger.log('agenda: %s ms%s', Date.now() - t0, typeof agendaTiemposTexto_ === 'function' ? ' — ' + agendaTiemposTexto_() : '');
  return plan.resumen;
}

/**
 * 16/10: la base de nuevo, DESDE LA HOJA, después de que la fusión borró o escribió filas (las de abajo de una borrada subieron una).
 * Tiene que ser siempre una lectura real, nunca una copia guardada: si aparece un cache de la lectura de la base (p. ej. un
 * `leerDestinoCompartido_` o un global memoizado), hay que invalidarlo acá. El gancho: `invalidarDestinoCompartido_()`, si existe.
 * Reemplaza el contenido de `dest` (el mismo objeto, para quien ya lo tiene).
 */
function _releerDestinoTrasFusionAgenda_(dest) {
  if (typeof invalidarDestinoCompartido_ === 'function') invalidarDestinoCompartido_();
  Object.keys(dest).forEach(function (k) { delete dest[k]; });
  return Object.assign(dest, leerDestino_());
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
  const P = { A: A, filaDe: new Map(), duplicadasEnCorrida: [], duplicados: [], borradasEquipo: [], cancelacionSigue: [], yaCargadas: [],
             figuraPorDireccion: [], acciones: [], ambiguas: [], editadas: [], noEnAgenda: [], reprogramadasNoMovibles: [], entreSemanas: [],
              saltadas60: [], noFuturas: [], viejasSinFila: [], figuraACompletar: [], eventoPorTipo: {}, barrio: {},
              alcance: alcance, r: r, A: A, resumen: {} };
  const val = function (f, n) { return A[n] == null ? '' : f.valores[A[n]]; };
  const cmp = function (v, n) { return valorAgendaComparable_(v, n); };
  const col = function (n) { return A[n] == null ? null : A[n] + 1; };
  // 15/10: las reglas nuevas, con su interruptor (la medición en seco las fuerza por `opciones`).
  const seguridadPorComuna = opciones.seguridadPorComuna !== undefined ? !!opciones.seguridadPorComuna : AGENDA_SEGURIDAD_POR_COMUNA;
  // 15/10 (noche): la agenda segura (H1-H4) y la cancelación automática que sólo suspende (J), con sus interruptores (la
  // medición en seco los fuerza por `opciones`). Con todos apagados, el plan es el de siempre.
  const opc = function (k, def) { return opciones[k] !== undefined ? !!opciones[k] : def; };
  const soloIdentificadas = opc('soloIdentificadas', AGENDA_CREAR_SOLO_IDENTIFICADAS);
  const conciliar = opc('conciliacion', AGENDA_CONCILIACION_SEMANAL);
  const invariante = opc('invariante', AGENDA_INVARIANTE_UNA_FILA);
  const validarMails = opc('validarMails', AGENDA_VALIDAR_MAILS);
  const cancelAuto = opc('cancelacionAutomatica', AGENDA_CANCELACION_AUTOMATICA);
  const suspenderSiempre = cancelAuto && (opciones.cancelacionModo || AGENDA_CANCELACION_MODO) === 'suspender';
  const hoyP = opciones.hoy || hoyMediodia_();
  // 15/10 (noche): los colores del mail (la cancelación por ROJO la decide el parser: `ev.canceladaEnMail`) y AMARILLO / VERDE
  const coloresMail = opc('coloresMail', AGENDA_COLORES_MAIL);
  const amarilloVerde = coloresMail && opc('amarilloVerde', AGENDA_COLORES_AMARILLO_VERDE);
  P.modos = { soloIdentificadas: soloIdentificadas, conciliacion: conciliar, invariante: invariante, validarMails: validarMails,
              cancelacionAutomatica: cancelAuto, suspenderSiempre: suspenderSiempre };
  if (coloresMail) { P.modos.coloresMail = true; P.modos.amarilloVerde = amarilloVerde; }
  P.pendientes = []; P.conciliadas = []; P.invariante = []; P.bloqueadasInvariante = []; P.repetidasEnMail = [];
  P.suspendidasAuto = []; P.cancelNoAplicada = []; P.cancelacionesEvaluadas = []; P.noReactivadasRojo = [];
  // 16/10 (AGENDA_DUPLICADOS sólo decisiones): lo que juntó la fusión antes del plan (40_Agenda.js correrAgendaEnBloqueo_) y si es en seco
  P.enSeco = !!opciones.enSeco; P.fusionPrevia = opciones.fusionPrevia || null;
  P.dosFilas = []; P.dosFilasDecididas = []; P.eleccionesAMano = [];
  P.creacionGeoDiferida = [];   // 16/10 (AGENDA_GEO_AHORRO): sin crear en esta corrida porque el barrio quedó pendiente

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
    // 07/10, UBICACION_TRES_NIVELES: la misma regla (compararUbicacion_), con la fila SIN lo del mail: "Lugar (mail)" de
    // una fila salió de un mail, y compararlo con una reunión del mail sería comparar el mail consigo mismo (dos
    // Seguridad en la misma comuna, sin barrio, quedarían como candidatas una de la otra).
    if (usarUbicacion3_()) return compararUbicacion_(ubicacionDeEvento_(ev), ubicacionDeFila_(f, true)).coincide === true;
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
      // 16/10 (bug 832/838, regla del usuario): una SEGURIDAD que ahora nombra a una figura sigue siendo la fila de su comuna
      // (grupo + fecha + "Lugar (mail)"), aunque la fila tenga otra figura (la que cargó RDV CONJUNTO) o ninguna
      if (!c.length && seguridadPorComuna && ev.tipo === 'Seguridad en tu Barrio') {
        c = (porFecha.get(ymd_(ev.fecha)) || []).filter(function (f) {
          return mismaReunionSinFiguraAgenda_(ev, str(val(f, 'agenda_uid')), str(val(f, 'Lugar (mail)')), str(val(f, 'Evento (mail)')),
                                              str(val(f, 'agenda_mail')), true);
        });
      }
    } else {
      const delDia = porFecha.get(ymd_(ev.fecha)) || [];
      const dir = normalizeText_(ev.lugarTexto);
      // 15/10 (AGENDA_SEGURIDAD_POR_COMUNA, casos 829/830 y 833/835): "A CONFIRMAR" no es una dirección (no identifica
      // nada: dos Seguridad del mismo día la comparten), y la fila de la agenda con el mismo "Lugar (mail)", el mismo tipo
      // y un grupo compatible ES la reunión (aunque la dirección haya cambiado de "A CONFIRMAR" a una calle).
      const dirVale = !seguridadPorComuna || esDireccionReal_(ev.lugarTexto);
      if (seguridadPorComuna) {
        c = delDia.filter(function (f) {
          return mismaReunionSinFiguraAgenda_(ev, str(val(f, 'agenda_uid')), str(val(f, 'Lugar (mail)')), str(val(f, 'Evento (mail)')),
                                              str(val(f, 'agenda_mail')));
        });
      }
      if (!c.length) c = delDia.filter(function (f) {
        if (dirVale && !esVacio_(val(f, 'agenda_uid')) && normalizeText_(val(f, 'agenda_direccion_escrita')) === dir && dir) return true;
        if (!f.figura && (ubica(ev, f) || (dirVale && dir && normalizeText_(val(f, 'Dirección')) === dir))) return true;
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
  // 16/10 (AGENDA_GEO_AHORRO): con las reuniones del mail (el orden de la geocodificación) y la base (las direcciones ya resueltas)
  const barrioDe = _barrioAgenda_(opciones, P, { r: r, dest: dest, A: A, hoy: hoyP });

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
  // 15/10 (AGENDA_ELECCIONES_SIEMPRE, caso Macri 01/10): las decisiones se aplican aunque la fila elegida ya no esté entre las
  // candidatas, con la identidad tolerante al corrimiento; y (AGENDA_CERRAR_CANCELADAS_MAIL) las canceladas en el mail se cierran.
  const siempre = opc('eleccionesSiempre', AGENDA_ELECCIONES_SIEMPRE);
  const cerrarCanceladas = opc('cerrarCanceladasMail', AGENDA_CERRAR_CANCELADAS_MAIL);
  P.modos.eleccionesSiempre = siempre; P.modos.cerrarCanceladasMail = cerrarCanceladas;
  P.eleccionesUsadas = []; P.eleccionesSinFila = []; P.eleccionesCerradas = []; P.canceladasMail = [];
  P.eleccionesConsultadas = new Map();   // la clave de cada elección que miró el plan → el id con que se la buscó
  // cuántas reuniones del mail tienen cada "base" (la identidad sin la hora): con una sola, la elección vale por la base
  const cuentaBase = {};
  r.unicas.concat(r.desaparecidas).forEach(function (ev) {
    const b = baseIdReunionAgenda_(idReunionAgenda_(ev));
    cuentaBase[b] = (cuentaBase[b] || 0) + 1;
  });
  /** La elección de una reunión (o de su pregunta de cancelación, "cancelacion|…"): por su id; con AGENDA_ELECCIONES_SIEMPRE,
   *  también por la base si la hora cambió (una sola reunión del mail y una sola elección con esa base). */
  const elDe = function (id) {
    const el = siempre ? eleccionDeReunionAgenda_(elecciones, id, function (b) {
      return cuentaBase[b.replace(/^cancelacion\|/, '')] || 0;
    }) : (elecciones.get(id) || null);
    if (el) P.eleccionesConsultadas.set(el.clave || id, id);
    return el;
  };
  /** ¿La fila `f` es la elegida (id_fila)? Exacta; con AGENDA_ELECCIONES_SIEMPRE, también figura + fecha si cambió el barrio
   *  (`filaDeEleccionAgenda_`: la única de esa figura ese día en la misma comuna). `unica`: `f` es LA fila de la reunión (la
   *  pregunta de cancelación tiene una sola): alcanza figura + fecha, aunque el barrio haya pasado a otra comuna. */
  const esLaElegida = function (el, f, unica) {
    if (!el || !f) return false;
    if (el.idFila === idFilaAgenda_(f)) return true;
    if (!siempre) return false;
    if (unica && baseIdReunionAgenda_(el.idFila) && baseIdReunionAgenda_(el.idFila) === baseIdReunionAgenda_(idFilaAgenda_(f)) &&
        el.idFila.split('|')[0]) return true;
    const x = filaDeEleccionAgenda_(dest.filas, el.idFila);
    return x.f === f && flexibleSegura(x, null);
  };
  /** 16/10 (revisor): una fila hallada SÓLO por figura + fecha (no por su id_fila exacto) vale si NO es la fila de otra reunión
   *  (sin agenda_uid) y el mail trae UNA sola reunión de esa figura ese día. Si no, la elección se vuelve a preguntar. */
  const flexibleSegura = function (x, ev) {
    if (!x || !x.f) return false;
    if (x.como === 'exacta') return true;
    return esVacio_(val(x.f, 'agenda_uid')) && (!ev || (cuentaBase[baseIdReunionAgenda_(idReunionAgenda_(ev))] || 0) === 1);
  };
  const comunaDeEv = function (ev) { return ev.comuna != null ? ev.comuna : (ev.barrio ? _comunaBarrioAg_(ev.barrio) : null); };
  /** Filas del equipo (sin agenda_uid) parecidas a una reunión (punto 7): la misma figura a ±AGENDA_DUP_DIAS días, o la
   *  misma fecha y comuna con otra figura o sin figura (y que no sea la fila de otra reunión del mail). */
  const casiDuplicados = function (ev, incluirMismaFecha, barrioEv) {
    const out = [];
    const figs = (ev.participan || ev.figuras).map(normalizeText_);   // "NO PARTICIPA" no cuenta
    const com = comunaDeEv(ev);
    // 07/10, UBICACION_TRES_NIVELES: "la misma ubicación" con la regla de los tres niveles (barrio con barrio; si no,
    // comuna con comuna, con la subzona de la Comuna 1; si no, eje con eje). `ev.ubic`: la de una fila de la agenda
    // (el bloque "después de crear"). Las filas de acá son del equipo (sin agenda_uid): no tienen nada del mail.
    const tres = usarUbicacion3_();
    const uEv = tres ? (ev.ubic || ubicacionDeEvento_(ev)) : null;
    const mismaUbic = function (f) {
      if (tres) return compararUbicacion_(uEv, ubicacionDeFila_(f)).coincide === true;
      return com != null && f.barrio && _comunaBarrioAg_(f.barrio) === com;
    };
    dest.filas.forEach(function (f) {
      if (!f.fecha || !esVacio_(val(f, 'agenda_uid')) || usadas.has(f.fila)) return;
      const d = Math.abs(diasEntre_(f.fecha, ev.fecha));
      const mismaFig = f.figura && figs.indexOf(normalizeText_(f.figura)) >= 0;
      let dif = '';
      if (mismaFig && d <= AGENDA_DUP_DIAS && (incluirMismaFecha || d > 0)) dif = d ? 'fecha (' + d + ' día' + (d > 1 ? 's' : '') + ')' : 'misma figura y fecha';
      else if (d === 0 && mismaUbic(f) && !mismaFig &&
               !nombradas.has(normalizeText_(f.figura) + '|' + ymd_(f.fecha))) dif = f.figura ? 'figura (' + f.figura + ')' : 'figura (vacía)';
      if (!dif) return;
      const h = valorAgendaComparable_(val(f, 'HORA'), 'HORA');
      if (ev.hora && h && h !== ev.hora) dif += ', hora (' + h + ' / ' + ev.hora + ')';
      out.push({ f: f, diferencia: dif });
    });
    // 07/10 (caso Macri 01/10): si alguna candidata tiene el MISMO BARRIO que la reunión, ésas son las candidatas; si
    // no, las de la misma comuna; si no, todas (y se muestran todas para elegir).
    if (tres) {
      const uB = ev.ubic || ubicacionDeEvento_(ev, barrioEv);
      const enNivel = function (u) {
        return out.filter(function (x) { return compararUbicacion_(u, ubicacionDeFila_(x.f)).coincide === true; });
      };
      const mismoBarrio = uB.barrio ? enNivel(uB) : [];
      if (mismoBarrio.length) return mismoBarrio;
      const mismaComuna = uB.comuna != null ? enNivel({ barrio: '', kb: '', comuna: uB.comuna, subzona: uB.subzona, eje: '', deComuna: uB.deComuna }) : [];
      return mismaComuna.length ? mismaComuna : out;
    }
    const bE = barrioEv ? normalizeText_(_canonBarrioAg_(barrioEv) || barrioEv) : '';
    const mismoB = bE ? out.filter(function (x) { return x.f.barrio && normalizeText_(_canonBarrioAg_(x.f.barrio) || x.f.barrio) === bE; }) : [];
    if (mismoB.length) return mismoB;
    const mismaC = com != null ? out.filter(function (x) { return x.f.barrio && _comunaBarrioAg_(x.f.barrio) === com; }) : [];
    return mismaC.length ? mismaC : out;
  };

  const enAlcance = r.unicas.filter(function (ev) { return _enAlcance_(alcance, ev.fecha); });
  // 15/10 (H3): el invariante "una reunión, una fila" en las filas del alcance. Una semana con la misma reunión en dos filas
  // vivas (más filas que reuniones con esa clave en el mail) no crea nada más hasta que el equipo lo resuelva.
  const semanasBloqueadas = new Set();
  // 16/10: lo que el equipo ya decidió de un par de filas ("Son reuniones distintas", "Quedarse con la fila X") no rompe el invariante
  const paresIgnorados = ignoradosDeEleccionesAgenda_(elecciones);
  if (invariante) {
    const cuenta = {};
    r.unicas.forEach(function (ev) { const k = claveInvarianteEvento_(ev); if (k) cuenta[k] = (cuenta[k] || 0) + 1; });
    P.invariante = reunionesRepetidasAgenda_(dest.filas.filter(function (f) { return f.fecha && _enAlcance_(alcance, f.fecha); }), A,
                                             function (k) { return cuenta[k] || 0; }, { ignorados: paresIgnorados });
    // 16/10: cada par va a AGENDA_DUPLICADOS para ELEGIR (_dosFilasAgenda_, más abajo); la semana frenada, a AGENDA_PENDIENTES
    P.invariante.forEach(function (x) { semanasBloqueadas.add(lunesYmdAgenda_(x.fecha)); });
  }
  const planeadas = {}, diferidas = {}, sueltas = [];
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
    const idR0 = idReunionAgenda_(ev);
    const elV = elDe(idR0);
    if (elV && elV.eleccion === 'vincular') {
      let fe = dest.filas.filter(function (f) { return !usadas.has(f.fila) && !esVacio_(val(f, 'agenda_uid')) && idFilaAgenda_(f) === elV.idFila; })[0];
      // 15/10 (AGENDA_ELECCIONES_SIEMPRE): la fila elegida, en toda la base (aunque ya no sea candidata ni tenga agenda_uid)
      if (!fe && siempre) {
        const x = filaDeEleccionAgenda_(dest.filas.filter(function (f) { return !usadas.has(f.fila); }), elV.idFila);
        fe = flexibleSegura(x, ev) ? x.f : null;
      }
      if (fe) {
        usadas.add(fe.fila);
        P.filaDe.set(ev.clave, { fila: fe.fila, status: val(fe, 'STATUS REUNIÓN'), f: fe });
        if (siempre) P.eleccionesUsadas.push({ id: idR0, el: elV, eleccion: 'vincular', f: fe });
        if (siempre && esVacio_(val(fe, 'agenda_uid'))) {
          P.eleccionesAplicadas.push({ id: idR0, eleccion: 'vincular', fila: fe.fila });
          _accionVincular_(P, fe, ev, A, barrioDe);
        } else {
          _accionActualizar_(P, fe, ev, A, barrioDe, {});
        }
        return;
      }
    }
    let c = candidatas(ev).filter(function (f) { return !usadas.has(f.fila); });
    if (c.length > 1) {
      const deAgenda = c.filter(function (f) { return !esVacio_(val(f, 'agenda_uid')); });
      if (deAgenda.length === 1) c = deAgenda;      // la de la agenda; la otra queda como duplicado posterior (abajo)
      else if (conciliar && deAgenda.length > 1) {
        // 15/10 (H2): 2+ filas de la agenda: la conciliación de la semana elige (o pregunta), después de ver todas las reuniones
        sueltas.push({ ev: ev, tipo: 'ambigua', motivo: c.length + ' filas candidatas', todas: c });
        return;
      }
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
    // 15/10: una reunión sin fila, CANCELADA en el mail (la marca del parser): no se crea ni se pregunta (AGENDA_CERRAR_CANCELADAS_MAIL)
    if (cerrarCanceladas && ev && ev.canceladaEnMail) { cerrarCanceladaMail(ev, idR0); return; }
    // 15/10 (AGENDA_ELECCIONES_SIEMPRE): lo que ya decidió el equipo, antes que cualquier otra regla que pueda volver a preguntar
    // (la conciliación, "casi duplicados" con otras candidatas): "ya cargada" no depende de que la fila siga siendo candidata.
    if (siempre && elV && (elV.eleccion === 'ya_cargada' || elV.eleccion === 'vincular')) {
      const x0 = filaDeEleccionAgenda_(dest.filas, elV.idFila);
      // 16/10 (revisor): sólo la fila exacta, o una hallada por figura + fecha que no es de otra reunión
      const x = flexibleSegura(x0, ev) ? x0 : { f: null, como: '', filas: x0.filas,
        motivo: x0.f ? 'la fila ' + x0.f.fila + ' se parece a la elegida pero es de otra reunión de la agenda, o el mail trae varias de esa figura ese día' : x0.motivo };
      if (elV.eleccion === 'ya_cargada' && x.f) {
        P.eleccionesAplicadas.push({ id: idR0, eleccion: 'ya_cargada', fila: x.f.fila });
        P.eleccionesUsadas.push({ id: idR0, el: elV, eleccion: 'ya_cargada', f: x.f, como: x.como });
        _yaCargada_(P, ev, idR0, x.f, 'elegido', val);
        return;
      }
      // la fila elegida ya no está en la base (o es ambigua): no se crea, y se vuelve a PREGUNTAR (16/10, revisor: también
      // "ya cargada" — sin la fila, la reunión quedaría sin fila para siempre y en silencio)
      const motivoSin = x.f ? 'la fila elegida (' + x.f.fila + ') ya la tomó otra reunión del mail' : x.motivo;
      P.eleccionesSinFila.push({ id: idR0, ev: ev, el: elV, eleccion: elV.eleccion, motivo: motivoSin });
      P.duplicados.push({ tipo: 'eleccion_sin_fila', ev: ev, id: idR0, eleccion: elV, motivo: motivoSin, candidatas: [] });
      P.filaDe.set(ev.clave, { fila: null, status: '', duplicado: true });
      return;
    }
    // Crear, al final — salvo que ya se vaya a crear en esta misma corrida la misma reunión (figura + fecha + hora; sin
    // figura, fecha + hora + lugar): el control de "ya existe" mira también lo planeado, no sólo el destino (07/10).
    const kPlan = (ev.figuraFila ? normalizeText_(ev.figuraFila) : 'sin_figura|' + normalizeText_(ev.lugar)) + '|' + ymd_(ev.fecha) + '|' + ev.hora;
    if (planeadas[kPlan] || diferidas[kPlan]) {
      const dup = { ev: ev, fila: planeadas[kPlan] || null }, fd = { fila: planeadas[kPlan] || null, status: 'en agenda', nueva: true };
      P.duplicadasEnCorrida.push(dup);
      P.filaDe.set(ev.clave, fd);
      if (!planeadas[kPlan]) diferidas[kPlan].copias.push({ dup: dup, fd: fd });   // se completa después de la conciliación
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
    // 16/10 (AGENDA_GEO_AHORRO): el barrio de la dirección quedó PENDIENTE (el tope de geocodificación o la guarda de tiempo de
    // la agenda): la reunión NO se crea en esta corrida —sin su barrio, "ya cargada en otra fila" y los casi duplicados no se
    // pueden mirar bien, y la fila nacería sin barrio—; la crea la corrida siguiente, con el barrio. No queda nada a medias.
    const bGeo = barrioDe(ev);
    if (bGeo.pendiente) {
      P.creacionGeoDiferida.push(ev);
      P.filaDe.set(ev.clave, { fila: null, status: '', geoDiferida: true });
      return;
    }
    // 07/10, regla del usuario (caso Macri 01/10): misma figura + mismo barrio a ±AGENDA_DUP_DIAS y el mail ANTERIOR a
    // la fecha de esa fila → es la MISMA reunión, que se adelantó o atrasó: no se crea ni se pregunta, ni se toca la fila.
    const bEv = ev.barrio || bGeo.barrio;
    // (sin las filas que ya tomó otra reunión del mail en esta corrida: ésa no puede ser también ésta)
    const ya = yaCargadaAgenda_(ev, dest.filas.filter(function (f) { return !usadas.has(f.fila); }), bEv);
    if (ya.fila) {
      _yaCargada_(P, ev, idR, ya.fila, 'regla', val);
      return;
    }
    if (hist.error && !opciones.enSeco) {
      P.noCreadasSinHistorial = (P.noCreadasSinHistorial || 0) + 1;
      return;
    }
    // 15/10 (H2): con la conciliación, la creación espera a ver las filas de la agenda de la semana que quedaron sin reunión.
    if (conciliar) {
      const s = { ev: ev, tipo: 'crear', kPlan: kPlan, idR: idR, bEv: bEv, copias: [] };
      sueltas.push(s);
      diferidas[kPlan] = s;
      return;
    }
    crearOPreguntar(ev, kPlan, idR, bEv);
  });

  // --- 15/10 (H2): la conciliación por semana de lo que quedó suelto ---
  if (sueltas.length) _conciliarSemanaAgenda_();

  /** Crear (al final) o preguntar: lo que hace la agenda con una reunión que no tiene fila (regla 4 y prompt 07). */
  function crearOPreguntar(ev, kPlan, idR, bEv) {
    if (cerrarCanceladas && ev && ev.canceladaEnMail) { cerrarCanceladaMail(ev, idR); return; }
    // 15/10 (H1): sin figura y sin dirección real, y a más de AGENDA_CREAR_SIN_DEFINIR_DIAS días: todavía no se crea.
    if (soloIdentificadas && !ev.figuraFila && !esDireccionReal_(ev.lugarTexto) && ev.fecha &&
        diasEntre_(ev.fecha, hoyP) > AGENDA_CREAR_SIN_DEFINIR_DIAS) {
      const cuando = new Date(ev.fecha.getFullYear(), ev.fecha.getMonth(), ev.fecha.getDate() - AGENDA_CREAR_SIN_DEFINIR_DIAS, 12, 0, 0);
      P.pendientes.push({ ev: ev, falta: 'figura y dirección', seCrea: cuando });
      P.filaDe.set(ev.clave, { fila: null, status: '', pendiente: true, seCrea: cuando });
      return;
    }
    // 15/10 (H4, revisor): una semana en la que TODOS los mails tienen formato raro: se muestra en la copia, pero no crea filas
    if (validarMails && ev.soloMailRaro) {
      P.pendientes.push({ ev: ev, falta: 'un mail de su semana sin formato raro', seCrea: null });
      P.filaDe.set(ev.clave, { fila: null, status: '', pendiente: true, seCrea: null });
      return;
    }
    // 15/10 (H4): la misma reunión dos veces en el mismo mail: no se crea ninguna (se avisa).
    if (validarMails && ev.repetidaEnMail) {
      if (!P.repetidasEnMail.some(function (o) { return _claveRepeticionAgenda_(o) === _claveRepeticionAgenda_(ev) && o.grupo === ev.grupo; })) P.repetidasEnMail.push(ev);
      P.filaDe.set(ev.clave, { fila: null, status: '', repetidaMail: true });
      return;
    }
    // 15/10 (H3): una semana con la misma reunión en dos filas no crea nada más.
    if (invariante && ev.fecha && semanasBloqueadas.has(lunesYmdAgenda_(ev.fecha))) {
      P.bloqueadasInvariante.push(ev);
      P.filaDe.set(ev.clave, { fila: null, status: '', bloqueada: true });
      return;
    }
    // 07/10: ¿una fila del equipo parecida? No se crea: se pregunta en AGENDA_DUPLICADOS (o se aplica lo que se eligió).
    const casi = casiDuplicados(ev, false, bEv);
    if (casi.length) {
      const el = elDe(idR);
      const yaElegida = el && el.eleccion === 'ya_cargada' ? casi.filter(function (x) { return esLaElegida(el, x.f); })[0] : null;
      if (yaElegida) {
        P.eleccionesAplicadas.push({ id: idR, eleccion: 'ya_cargada', fila: yaElegida.f.fila });
        _yaCargada_(P, ev, idR, yaElegida.f, 'elegido', val);
        return;
      }
      const elegida = el && el.eleccion === 'vincular' ? casi.filter(function (x) { return esLaElegida(el, x.f); })[0] : null;
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
  }

  /**
   * 15/10 (AGENDA_CERRAR_CANCELADAS_MAIL): una reunión sin fila que el mail marca como CANCELADA (`ev.canceladaEnMail`, la pone
   * el parser) no se crea ni se pregunta. Si habría ido a AGENDA_DUPLICADOS (tiene filas parecidas), o ya había una elección o
   * una línea suya en la solapa, la línea queda CERRADA ("cancelada en el mail: no se crea"), sin ELEGIR. No escribe la base.
   */
  function cerrarCanceladaMail(ev, idR) {
    const bEv = ev.barrio || barrioDe(ev).barrio;
    const casi = casiDuplicados(ev, false, bEv);
    const el = elDe(idR);
    const motivo = str(ev.canceladaEnMailMotivo);
    const previa = !!el || !!(elecciones.idsEnSolapa && elecciones.idsEnSolapa.has(idR));
    P.canceladasMail.push({ ev: ev, id: idR, motivo: motivo, eleccion: el || null, candidatas: casi, previa: previa });
    P.filaDe.set(ev.clave, { fila: null, status: '', canceladaMail: true, motivo: motivo });
    // 16/10 (arreglo 3 del usuario): no se crea, pero se AVISA: en AGENDA_PENDIENTES (entra al resumen del lunes) y en el aviso
    // diario de las suspendidas (_avisosAgendaSegura_)
    P.pendientes.push({ ev: ev, falta: 'cancelada en el mail: no se crea' + (motivo ? ' (' + motivo + ')' : ''), seCrea: null, cancelada: true });
    if (casi.length || previa) P.duplicados.push({ tipo: 'cancelada_mail', ev: ev, id: idR, motivo: motivo, eleccion: el || null, candidatas: casi });
  }

  /**
   * **H2 (15/10): la conciliación por semana.** Las reuniones sueltas (sin fila, o con 2+ filas de la agenda) contra las
   * filas de la agenda de su semana y su grupo que quedaron sin reunión: un par único (cada una es la mejor de la otra, sin
   * empate) se actualiza; si queda una fila compatible sin par, se pregunta en AGENDA_DUPLICADOS y no se crea; si no queda
   * ninguna, lo de siempre (crear, o "ambigua").
   */
  function _conciliarSemanaAgenda_() {
    const tomadas = new Set();
    P.filaDe.forEach(function (x) { if (x && x.fila) tomadas.add(x.fila); });
    const gruposEv = function (ev) {
      return [ev.grupo].concat(ev.otrosGrupos || []).filter(function (g) { return g && g !== '(sin grupo)'; }).map(normalizeText_);
    };
    const statusLibre = function (f) {
      const st = normStatus_(val(f, 'STATUS REUNIÓN'));
      return st === 'en agenda' || (st === 'suspendida' && normStatus_(val(f, 'agenda_status_escrito')) === 'suspendida');
    };
    const libre = function (f) { return !esVacio_(val(f, 'agenda_uid')) && !usadas.has(f.fila) && !tomadas.has(f.fila) && statusLibre(f); };
    const deSemana = function (ev, f) {
      if (!f.fecha || !ev.fecha) return false;
      const d0 = ev.desde || ev.fecha, d1 = ev.hasta || ev.fecha;
      if (ymd_(f.fecha) < ymd_(d0) || ymd_(f.fecha) > ymd_(d1)) return false;
      const g = grupoDeAgendaMail_(val(f, 'agenda_mail')), gs = gruposEv(ev);
      return !g || !gs.length || gs.indexOf(normalizeText_(g)) >= 0;
    };
    const fechaDelSistema = function (f) {
      return !esVacio_(val(f, 'agenda_fecha_escrita')) && cmp(val(f, 'FECHA'), 'FECHA') === cmp(val(f, 'agenda_fecha_escrita'), 'FECHA');
    };
    // 16/10 (test a del usuario, caso 17/09 Seguridad Comuna 11 → "Francisco Quintana, Comuna 11"): la fila de la agenda SIN
    // figura y la reunión que ahora la NOMBRA, la misma fecha y el mismo "Lugar (mail)": es la misma reunión, aunque el tipo cambie
    const ganoFigura = function (ev, f) {
      return !normalizeText_(f.figura) && !!ev.figuraFila && !!ev.lugar && ymd_(f.fecha) === ymd_(ev.fecha) &&
             normalizeText_(ev.lugar) === normalizeText_(val(f, 'Lugar (mail)'));
    };
    // compatible = puede ser la misma reunión que cambió: nunca dos figuras distintas, nunca dos tipos distintos (salvo la que ganó
    // figura, arriba), y otra fecha sólo si la FECHA de la fila es la que escribió el sistema (se mueve)
    const compatible = function (ev, f) {
      if (!libre(f) || !deSemana(ev, f)) return false;
      const fe = normalizeText_(ev.figuraFila), ff = normalizeText_(f.figura);
      if (fe && ff && fe !== ff && (ev.figuras || []).map(normalizeText_).indexOf(ff) < 0) return false;
      const tf = tipoAgendaDeTexto_(val(f, 'Evento (mail)'));
      if (tf && ev.tipo && tf !== ev.tipo && !ganoFigura(ev, f)) return false;
      return ymd_(f.fecha) === ymd_(ev.fecha) || fechaDelSistema(f);
    };
    const puntaje = function (ev, f) {
      let p = 0;
      if (ev.figuraFila && normalizeText_(ev.figuraFila) === normalizeText_(f.figura)) p += 8;
      if (ev.lugar && normalizeText_(ev.lugar) === normalizeText_(val(f, 'Lugar (mail)'))) p += 4;
      if (ymd_(ev.fecha) === ymd_(f.fecha)) p += 2;
      if (ev.hora && cmp(val(f, 'HORA'), 'HORA') === ev.hora) p += 1;
      const d = compararDirecciones_(ev.lugarTexto, val(f, 'Dirección'));
      if (d === 'exacta' || d === 'parecida') p += 1;
      return p;
    };
    const emparejar = function (s, f, como) {
      const ev = s.ev;
      usadas.add(f.fila);
      P.filaDe.set(ev.clave, { fila: f.fila, status: val(f, 'STATUS REUNIÓN'), f: f, conciliada: true });
      if (ymd_(f.fecha) !== ymd_(ev.fecha)) {
        const fecha = val(f, 'FECHA');
        P.acciones.push({ tipo: 'mover', f: f, ev: ev, de: null, detalle: 'conciliación de la semana: ' + fmtFecha_(f.fecha) + ' → ' + fmtFecha_(ev.fecha),
                          escrituras: [{ fila: f.fila, col: col('FECHA'), valor: ev.fecha, esperado: fecha },
                                       { fila: f.fila, col: col('agenda_fecha_escrita'), valor: ev.fecha, esperado: val(f, 'agenda_fecha_escrita') }] });
        _accionActualizar_(P, f, ev, A, barrioDe, { fechaYaMovida: true });
      } else {
        _accionActualizar_(P, f, ev, A, barrioDe, {});
      }
      // la que ganó figura: la Figura, sólo si la celda está vacía (lectura fresca: esperado '')
      if (ganoFigura(ev, f) && col('Figura') != null) {
        P.acciones.push({ tipo: 'figura_mail', f: f, ev: ev, detalle: 'la misma reunión, ahora con figura: ' + ev.figuraFila,
                          escrituras: [{ fila: f.fila, col: col('Figura'), valor: ev.figuraFila, esperado: '' }] });
        como += ' — la misma reunión, ahora con figura (' + ev.figuraFila + ')';
      }
      P.conciliadas.push({ ev: ev, f: f, como: como });
    };
    const quedan = sueltas.slice();
    for (let cambio = true; cambio;) {
      cambio = false;
      for (let i = 0; i < quedan.length && !cambio; i++) {
        const s = quedan[i];
        const cands = dest.filas.filter(function (f) { return compatible(s.ev, f); });
        if (!cands.length) continue;
        const pts = cands.map(function (f) { return puntaje(s.ev, f); });
        const mejor = Math.max.apply(null, pts);
        const tops = cands.filter(function (f, k) { return pts[k] === mejor; });
        if (tops.length !== 1) continue;
        // 15/10 (revisor): solo, sólo con evidencia (la misma figura o el mismo "Lugar (mail)": puntaje >= 4); y la fecha se
        // mueve sólo en una fila "en agenda". Si no, se pregunta (abajo).
        if (mejor < AGENDA_CONCILIACION_PUNTAJE_MIN) continue;
        if (ymd_(tops[0].fecha) !== ymd_(s.ev.fecha) && normStatus_(val(tops[0], 'STATUS REUNIÓN')) !== 'en agenda') continue;
        const f = tops[0];
        const rival = quedan.some(function (o) { return o !== s && compatible(o.ev, f) && puntaje(o.ev, f) >= mejor; });
        if (rival) continue;
        emparejar(s, f, 'par único (puntaje ' + mejor + ')');
        quedan.splice(i, 1);
        cambio = true;
      }
    }
    quedan.forEach(function (s) {
      const ev = s.ev;
      const libres = dest.filas.filter(function (f) { return compatible(ev, f); });
      if (libres.length) {
        const idR = s.idR || idReunionAgenda_(ev);
        const el = elDe(idR);
        const elegida = el && el.eleccion === 'vincular' ? libres.filter(function (f) { return esLaElegida(el, f); })[0] : null;
        if (elegida) { P.eleccionesAplicadas.push({ id: idR, eleccion: 'vincular', fila: elegida.fila }); emparejar(s, elegida, 'elegido'); return; }
        if (s.tipo === 'crear' && el && el.eleccion === 'crear') { crearOPreguntar(ev, s.kPlan, s.idR, s.bEv); return; }
        P.duplicados.push({ tipo: 'antes', ev: ev, id: idR, conciliacion: true, eleccion: el || null,
                            candidatas: libres.map(function (f) {
                              return { f: f, diferencia: 'fila de la agenda de esa semana sin su reunión en el mail (Lugar (mail) ' +
                                                         (str(val(f, 'Lugar (mail)')) || '—') + ', Dirección ' + (str(val(f, 'Dirección')) || '—') + ')' };
                            }) });
        P.filaDe.set(ev.clave, { fila: null, status: '', duplicado: true });
        return;
      }
      if (s.tipo === 'crear') crearOPreguntar(ev, s.kPlan, s.idR, s.bEv);
      else P.ambiguas.push({ ev: ev, motivo: s.motivo, filas: s.todas });
    });
    // las repetidas en la corrida de una reunión diferida: la fila que le tocó (o nada)
    sueltas.forEach(function (s) {
      (s.copias || []).forEach(function (c) {
        const x = P.filaDe.get(s.ev.clave) || {};
        Object.keys(x).forEach(function (k) { c.fd[k] = x[k]; });
        c.dup.fila = x.fila || null;
        if (!c.dup.fila) P.duplicadasEnCorrida.splice(P.duplicadasEnCorrida.indexOf(c.dup), 1);
      });
    });
  }

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
    // 15/10 (J): qué se decidió con cada desaparecida (lo lista la medición del paso 78); y, con el modo "suspender", las
    // salvaguardas que frenan una suspensión se avisan (cancelacion_no_aplicada).
    // 15/10 (noche): con "suspender", cada evaluación lleva cómo se canceló (`por`), el mail y el tiempo (lo listan los pasos 91 y 93)
    const evalua = function (decision, f, extra) {
      P.cancelacionesEvaluadas.push(Object.assign({ d: d, f: f || null, decision: decision }, suspenderSiempre ? { por: 'desaparecida', mail: d.mailQueLaSaco || null } : {}, extra || {}));
    };
    const noAplicada = function (motivo, f, extra) { evalua('no: ' + motivo, f, extra); if (suspenderSiempre) P.cancelNoAplicada.push({ d: d, f: f || null, motivo: motivo, mail: d.mailQueLaSaco || null }); };
    if (!d.futuraAlDesaparecer) { P.noFuturas.push(d); evalua('no: ya había pasado cuando salió del mail'); return; }
    // 16/10 (test a del usuario): la misma reunión, ahora con figura (no es una cancelación). Con H2 o con "suspender".
    if ((conciliar || suspenderSiempre) && !d.figuraFila && d.lugar) {
      const suc = r.unicas.filter(function (u) {
        return u.figuraFila && u.fecha && d.fecha && ymd_(u.fecha) === ymd_(d.fecha) && normalizeText_(u.lugar) === normalizeText_(d.lugar) &&
               (u.hora === d.hora || ['exacta', 'parecida'].indexOf(compararDirecciones_(u.lugarTexto, d.lugarTexto)) >= 0);
      });
      if (suc.length === 1) { evalua('no: la misma reunión, ahora con figura (' + suc[0].figuraFila + ', ' + (suc[0].lugar || '') + ')'); return; }
    }
    // 15/10 (noche, "el mail manda"): ya no está el resguardo del revisor "no una que ya pasó HOY": manda el TIEMPO del mail
    // (abajo: el mail que la saca tiene que ser anterior a la fecha y hora de la reunión)
    if (d.versionParcial) { P.saltadas60.push(d); noAplicada('protección del ' + Math.round(AGENDA_FRACCION_VERSION_PARCIAL * 100) + '% (el mail que la sacó trae muchas menos reuniones)'); return; }
    if ((suspenderSiempre || validarMails) && d.mailQueLaSacoRaro) { noAplicada('el mail que la sacó tiene formato raro (' + d.mailQueLaSacoRaro + ')'); return; }
    const c = candidatas(d).filter(function (f) { return !usadas.has(f.fila); });
    if (c.length !== 1) {
      if (c.length > 1) { P.ambiguas.push({ ev: d, motivo: 'desaparecida con ' + c.length + ' filas', filas: c }); noAplicada(c.length + ' filas candidatas'); }
      else evalua('no: sin fila en la base');
      return;
    }
    const f = c[0];
    const stF = normStatus_(val(f, 'STATUS REUNIÓN'));
    // 15/10 (noche, "el mail manda"): sólo si el mail que la saca es ANTERIOR a la reunión (fecha + hora); y sólo una fila
    // "en agenda" —la ponga el sistema o el equipo—; otro STATUS no se toca y se avisa (ya Suspendida: nada)
    let tiempo = null;
    if (suspenderSiempre) {
      tiempo = tiempoCancelacionAgenda_(d.mailQueLaSaco, d, val(f, 'HORA'));
      if (stF === 'suspendida') { evalua('no: la fila ya está "' + str(val(f, 'STATUS REUNIÓN')) + '"', f, { tiempo: tiempo }); return; }
      if (!tiempo.aTiempo) { noAplicada('el mail que la saca es posterior a la reunión (' + tiempo.texto + '): no se toca', f, { tiempo: tiempo }); return; }
      if (stF !== 'en agenda') {
        noAplicada('la fila está "' + str(val(f, 'STATUS REUNIÓN')) + '"' + _datosFilaTextoAgenda_(dest, f) + ': el equipo le puso otro STATUS, no se toca', f, { tiempo: tiempo });
        return;
      }
    }
    if (stF !== 'en agenda') { evalua('no: la fila está "' + str(val(f, 'STATUS REUNIÓN')) + '"', f); return; }
    usadas.add(f.fila);
    const salida = 'desapareció en la versión ' + (d.versionQueLaSaco || d.ultimaVersionVista + 1) + ' (' + fmtFecha_(d.mailQueLaSaco) + ')';
    // 15/10 (J, decisión del usuario): con el modo "suspender", la fila pasa a Suspendida — NUNCA se borra —, salvo que el
    // equipo haya elegido "Sigue" en AGENDA_DUPLICADOS. Las preguntas de cancelación pendientes se resuelven así.
    // 15/10 (noche, "el mail manda"): también un "en agenda" que puso el equipo (antes, el revisor lo preguntaba); queda
    // anotado si el "en agenda" era del sistema (statusDelSistema)
    const statusDelSistema = normStatus_(val(f, 'agenda_status_escrito')) === 'en agenda';
    if (suspenderSiempre) {
      const idC = 'cancelacion|' + idReunionAgenda_(d);
      const el = elDe(idC);
      if (el && esLaElegida(el, f, true) && el.eleccion === 'sigue') {
        P.cancelacionSigue.push({ ev: d, f: f });
        P.filaDe.set(d.clave, { fila: f.fila, status: val(f, 'STATUS REUNIÓN'), f: f, sigue: true });
        evalua('no: el equipo eligió "Sigue"', f, { tiempo: tiempo, statusDelSistema: statusDelSistema });
        return;
      }
      const escS = [
        { fila: f.fila, col: col('STATUS REUNIÓN'), valor: 'Suspendida', esperado: val(f, 'STATUS REUNIÓN') },
        { fila: f.fila, col: col('agenda_status_escrito'), valor: 'Suspendida', esperado: val(f, 'agenda_status_escrito') }
      ];
      if (esVacio_(val(f, 'agenda_uid'))) escS.push({ fila: f.fila, col: col('agenda_uid'), valor: uidAgenda_('vinculada'), esperado: '' });
      const accion = { tipo: 'suspender', f: f, ev: d, escrituras: escS, detalle: salida + ' (suspendida automáticamente: nunca se borra)' };
      P.acciones.push(accion);
      const cambiosTexto = 'suspendida: salió del mail del ' + fmtFecha_(d.mailQueLaSaco);
      P.filaDe.set(d.clave, { fila: f.fila, status: 'Suspendida', f: f, suspendidaAuto: true, cambiosTexto: cambiosTexto });
      P.suspendidasAuto.push({ d: d, f: f, salida: salida, accion: accion });
      P.duplicados.push({ tipo: 'cancelacion_aplicada', ev: d, candidatas: [{ f: f, diferencia: salida }] });
      evalua('suspender', f, { tiempo: tiempo, statusDelSistema: statusDelSistema });
      return;
    }
    // 07/10: con AGENDA_CANCELACION_AUTOMATICA = false, la cancelación se PREGUNTA en AGENDA_DUPLICADOS y se aplica en
    // la corrida siguiente según lo elegido (la fila, por figura + fecha + barrio; la reunión, por su identidad).
    if (!cancelAuto || suspenderSiempre) {
      const idC = 'cancelacion|' + idReunionAgenda_(d);
      const el = elDe(idC);
      const vale = el && esLaElegida(el, f, true);
      if (vale && el.eleccion === 'sigue') {
        P.cancelacionSigue.push({ ev: d, f: f });
        P.filaDe.set(d.clave, { fila: f.fila, status: val(f, 'STATUS REUNIÓN'), f: f, sigue: true });
        return;
      }
      if (!(vale && el.eleccion === 'cancelar')) {
        P.duplicados.push({ tipo: 'cancelacion', ev: d, id: idC, candidatas: [{ f: f, diferencia: salida }], eleccion: vale ? el : null });
        P.filaDe.set(d.clave, { fila: f.fila, status: val(f, 'STATUS REUNIÓN'), f: f, cancelacionPendiente: true });
        evalua('preguntar', f);
        return;
      }
      P.eleccionesAplicadas.push({ id: idC, eleccion: 'cancelar', fila: f.fila });
    }
    // 06/10, decisión del usuario: la fila que CREÓ la agenda y nadie tocó se BORRA (se guarda entera para deshacer).
    // con el modo "suspender" NUNCA se borra, tampoco cuando una persona eligió "Se canceló"
    const intocada = suspenderSiempre ? { ok: false, motivo: 'modo "suspender": nunca se borra' } : filaIntocadaAgenda_(f.valores, dest.hdr, d);
    if (intocada.ok) {
      evalua('borrar', f);
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
    evalua('suspender', f);
    P.filaDe.set(d.clave, { fila: f.fila, status: 'Suspendida', f: f });
    P.acciones.push({ tipo: 'suspender', f: f, ev: d, escrituras: esc,
                      detalle: salida + (/no la creó/.test(intocada.motivo) ? '' : ' (no se borra: ' + intocada.motivo + ')') });
  });

  // --- 7b (15/10, noche: "el mail manda"). CANCELADA EN EL MAIL EN ROJO: sigue escrita en el mail, pero en ROJO ENTERO en la
  // última versión válida de su semana (`ev.canceladaEnMail`, lo decide el parser con los colores prendidos). Con la cancelación
  // automática en modo "suspender": las mismas reglas que la desaparecida (el tiempo del mail, sólo "en agenda", "Sigue",
  // formato raro, nunca se borra). Con la cancelación automática apagada, sólo se evalúa (pasos 91 y 93).
  const filaPorNumero = new Map();
  dest.filas.forEach(function (f) { filaPorNumero.set(f.fila, f); });
  enAlcance.forEach(function (ev) {
    if (!ev.canceladaEnMail) return;
    const evalua = function (decision, f, extra) {
      P.cancelacionesEvaluadas.push(Object.assign({ d: ev, f: f || null, decision: decision, por: 'rojo', mail: ev.mailFecha, motivoMail: ev.canceladaEnMailMotivo }, extra || {}));
    };
    const noAplicada = function (motivo, f, extra) {
      evalua('no: ' + motivo, f, extra);
      if (suspenderSiempre) P.cancelNoAplicada.push({ d: ev, f: f || null, motivo: motivo, mail: ev.mailFecha, porRojo: true });
    };
    const x = P.filaDe.get(ev.clave);
    const f = x && x.fila && !x.nueva ? (x.f || filaPorNumero.get(x.fila)) : null;
    if (!f) { evalua('no: sin fila en la base' + (x && x.nueva ? ' (la agenda la crearía)' : '')); return; }
    // 16/10 (revisor): la fila de "ya cargada en otra fila" (o de otra fecha: la reunión se pasó de día y el equipo ya tiene la
    // fila nueva) NO es la de esta reunión del mail: no se suspende
    if (x.yaCargada || x.conciliada) { evalua('no: la fila ' + f.fila + ' es "ya cargada en otra fila" / conciliada, no la de esta reunión', f); return; }
    if (!f.fecha || !ev.fecha || ymd_(f.fecha) !== ymd_(ev.fecha)) { evalua('no: la fila ' + f.fila + ' es de otra fecha (' + (f.fecha ? fmtFecha_(f.fecha) : 'sin fecha') + ')', f); return; }
    if (!suspenderSiempre) { evalua('no: la cancelación automática (modo "suspender") está apagada', f); return; }
    if (validarMails && ev.soloMailRaro) { noAplicada('su semana sólo tiene mails con formato raro', f); return; }
    if (ev.colorMail && ev.colorMail.mailRaro) { noAplicada('el mail en rojo tiene formato raro (' + ev.colorMail.mailRaro + ')', f); return; }
    const tiempo = tiempoCancelacionAgenda_(ev.mailFecha, ev, val(f, 'HORA'));
    const st = normStatus_(val(f, 'STATUS REUNIÓN'));
    if (st === 'suspendida') { evalua('no: la fila ya está "' + str(val(f, 'STATUS REUNIÓN')) + '"', f, { tiempo: tiempo }); return; }
    if (!tiempo.aTiempo) { noAplicada('el mail en rojo es posterior a la reunión (' + tiempo.texto + '): no se toca', f, { tiempo: tiempo }); return; }
    if (st !== 'en agenda') {
      noAplicada('la fila está "' + str(val(f, 'STATUS REUNIÓN')) + '"' + _datosFilaTextoAgenda_(dest, f) + ': el equipo le puso otro STATUS, no se toca', f, { tiempo: tiempo });
      return;
    }
    const statusDelSistema = normStatus_(val(f, 'agenda_status_escrito')) === 'en agenda';
    const idC = 'cancelacion|' + idReunionAgenda_(ev);
    const el = elDe(idC);   // 16/10 (revisor): como en el paso 7
    if (el && esLaElegida(el, f, true) && el.eleccion === 'sigue') {
      P.cancelacionSigue.push({ ev: ev, f: f });
      evalua('no: el equipo eligió "Sigue"', f, { tiempo: tiempo, statusDelSistema: statusDelSistema });
      return;
    }
    const escS = [
      { fila: f.fila, col: col('STATUS REUNIÓN'), valor: 'Suspendida', esperado: val(f, 'STATUS REUNIÓN') },
      { fila: f.fila, col: col('agenda_status_escrito'), valor: 'Suspendida', esperado: val(f, 'agenda_status_escrito') }
    ];
    // el agenda_uid, si la fila no tiene y ninguna otra acción de esta corrida se lo pone (una fila del equipo que se vincula ahora)
    const yaUid = P.acciones.some(function (a) { return a.escrituras.some(function (e) { return e.fila === f.fila && e.col === col('agenda_uid'); }); });
    if (esVacio_(val(f, 'agenda_uid')) && !yaUid) escS.push({ fila: f.fila, col: col('agenda_uid'), valor: uidAgenda_('vinculada'), esperado: '' });
    const salida = 'cancelada en el mail: ' + ev.canceladaEnMailMotivo;
    const accion = { tipo: 'suspender', f: f, ev: ev, escrituras: escS, detalle: salida + ' (suspendida automáticamente: nunca se borra)',
                     porRojo: true, motivoRojo: ev.canceladaEnMailMotivo };
    P.acciones.push(accion);
    x.status = 'Suspendida'; x.suspendidaAuto = true; x.cambiosTexto = 'suspendida: ' + ev.canceladaEnMailMotivo;
    P.suspendidasAuto.push({ d: ev, f: f, salida: salida, accion: accion, porRojo: true, mail: ev.mailFecha });
    P.duplicados.push({ tipo: 'cancelacion_aplicada', ev: ev, candidatas: [{ f: f, diferencia: salida }] });
    evalua('suspender', f, { tiempo: tiempo, statusDelSistema: statusDelSistema });
  });

  // --- 7d (16/10). RDV CONJUNTO como TERCERA fuente de cancelación (AGENDA_CANCELACION_CONJUNTO, 53_CancelacionConjunto.js):
  // una fila de RDV CONJUNTO "Cancelado" → su fila de la base (el mismo cruce de Asistentes) pasa a Suspendida, con las mismas
  // reglas que J (sólo "en agenda"; otro STATUS: aviso; nunca se borra). RDV CONJUNTO sólo se lee.
  P.conjuntoCancela = [];
  if (suspenderSiempre && opc('cancelacionConjunto', AGENDA_CANCELACION_CONJUNTO)) {
    P.modos.cancelacionConjunto = true;
    let cc;
    try { cc = opciones.cancelacionesConjunto || cancelacionesConjunto_(dest, opciones.comunas || leerComunasMap_()); }
    catch (err) { cc = { error: String(err && err.message || err), decisiones: [] }; }
    P.cancelacionesConjunto = cc;
    if (cc.error) Logger.log('  >>> RDV CONJUNTO como fuente de cancelación: %s. No se suspende nada por RDV CONJUNTO.', cc.error);
    const colSt = col('STATUS REUNIÓN');
    const yaCambia = function (fila) {
      return P.acciones.some(function (a) { return a.escrituras.some(function (e) { return e.fila === fila && e.col === colSt; }); });
    };
    (cc.decisiones || []).forEach(function (dc) {
      const f = dc.f;
      if (!f) { P.conjuntoCancela.push({ dc: dc, decision: 'no: ' + dc.motivo }); return; }
      if (!f.fecha || !_enAlcance_(alcance, f.fecha)) { P.conjuntoCancela.push({ dc: dc, decision: 'no: la fila es de antes del alcance de la agenda' }); return; }
      // una reunión "de la agenda" armada desde la fila (los avisos, el log y el registro hablan de reuniones)
      const ev = { fecha: f.fecha, hora: valorAgendaComparable_(val(f, 'HORA'), 'HORA') || '', figuras: f.figura ? [f.figura] : [],
                   figuraFila: f.figura || '', tipo: f.figura ? '' : 'Seguridad en tu Barrio', lugar: f.barrio || str(val(f, 'Lugar (mail)')),
                   porConjunto: true, conjuntoTexto: dc.conjunto.map(textoFilaConjunto_).join(' / ') };
      if (dc.decision !== 'suspender') {
        P.conjuntoCancela.push({ dc: dc, decision: 'no: ' + dc.motivo });
        if (dc.aviso) P.cancelNoAplicada.push({ d: ev, f: f, motivo: dc.motivo, porConjunto: true, conjunto: dc.conjunto });
        return;
      }
      if (yaCambia(f.fila)) { P.conjuntoCancela.push({ dc: dc, decision: 'no: esta corrida ya le cambia el STATUS (el mail)' }); return; }
      // ya la suspendió RDV CONJUNTO en una corrida anterior y el equipo la volvió a "en agenda": es de ellos, no se vuelve a suspender
      if (_bloqueoConjuntoAgenda_(P.historial, str(val(f, 'agenda_uid')), f.fecha)) {
        P.conjuntoCancela.push({ dc: dc, decision: 'no: ya la suspendió RDV CONJUNTO antes y el equipo la volvió a "' + str(val(f, 'STATUS REUNIÓN')) + '": no se vuelve a suspender' });
        return;
      }
      const escS = [
        { fila: f.fila, col: colSt, valor: 'Suspendida', esperado: val(f, 'STATUS REUNIÓN') },
        { fila: f.fila, col: col('agenda_status_escrito'), valor: 'Suspendida', esperado: val(f, 'agenda_status_escrito') }
      ];
      const yaUid = P.acciones.some(function (a) { return a.escrituras.some(function (e) { return e.fila === f.fila && e.col === col('agenda_uid'); }); });
      if (esVacio_(val(f, 'agenda_uid')) && !yaUid) escS.push({ fila: f.fila, col: col('agenda_uid'), valor: uidAgenda_('vinculada'), esperado: '' });
      const salida = 'Cancelado en RDV CONJUNTO: ' + ev.conjuntoTexto;
      const accion = { tipo: 'suspender', f: f, ev: ev, escrituras: escS, detalle: salida + ' (suspendida automáticamente: nunca se borra)',
                       porConjunto: true, motivoConjunto: ev.conjuntoTexto };
      P.acciones.push(accion);
      P.suspendidasAuto.push({ d: ev, f: f, salida: salida, accion: accion, porConjunto: true });
      P.conjuntoCancela.push({ dc: dc, decision: 'suspender' });
      // la reunión del mail que tiene esta fila (si la hay): el archivo "Agenda" lo dice
      P.filaDe.forEach(function (x) {
        if (x && x.fila === f.fila && !x.nueva) { x.status = 'Suspendida'; x.suspendidaAuto = true; x.porConjunto = true; x.cambiosTexto = 'suspendida: Cancelado en RDV CONJUNTO'; }
      });
    });
  }

  // --- 7c (15/10, noche). Una fila que el sistema SUSPENDIÓ y después recibió asistentes o inscriptos: no se pisa nada (el
  // STATUS sigue Suspendida); se avisa una vez (suspendida_con_datos) y lo lista la auditoría (paso 66) ---
  P.suspendidasConDatos = [];
  const iAsis = dest.D ? dest.D['Asistentes'] : null, iIns = dest.D ? dest.D['Inscriptos'] : null;
  dest.filas.forEach(function (f) {
    if (normStatus_(val(f, 'STATUS REUNIÓN')) !== 'suspendida' || normStatus_(val(f, 'agenda_status_escrito')) !== 'suspendida') return;
    const as = iAsis == null ? '' : f.valores[iAsis], ins = iIns == null ? '' : f.valores[iIns];
    if (_hayDatoAgenda_(as) || _hayDatoAgenda_(ins)) P.suspendidasConDatos.push({ f: f, asistentes: as, inscriptos: ins, uid: str(val(f, 'agenda_uid')) });
  });

  // --- 8. Seguridad en tu Barrio: la Figura desde RDV CONJUNTO, en las filas de la agenda que todavía no la tienen ---
  // 07/10 (DIAS_FUTUROS_CRUCE, la tanda del 07/10): también las de los próximos días (RDV CONJUNTO ya trae las programadas).
  const finSeguridad = finActivas_();
  const sinFigura = dest.filas.filter(function (f) {
    // Seguridad en tu Barrio: el EVENTO es "Encuentro con Vecinos" (como lo escribe el equipo): se reconoce por la Figura vacía.
    return !f.figura && !esVacio_(val(f, 'agenda_uid')) && f.fecha && ymd_(f.fecha) <= ymd_(finSeguridad);
  });
  if (sinFigura.length) {
    const conj = opciones.conjunto || leerConjuntoPorFecha_();
    sinFigura.forEach(function (f) {
      // 07/10: con la dirección de la fila; sin barrio, la comuna que dice el mail ("Lugar (mail)": caso 818, Comuna 6)
      const comF = f.barrio ? _comunaBarrioAg_(f.barrio) : detectComuna_(str(val(f, 'Lugar (mail)')));
      // con UBICACION_TRES_NIVELES, la ubicación de la fila en tres niveles (la comuna o el eje del mail, si no tiene barrio)
      const res = figuraSeguridad_(f.fecha, f.barrio ? _canonBarrioAg_(f.barrio) || f.barrio : '', comF == null ? null : comF, conj,
                                   str(val(f, 'Dirección')) || str(val(f, 'Dirección (mail)')), undefined,
                                   ubicacionDeFila_(Object.assign({}, f, { lugarMail: str(val(f, 'Lugar (mail)')) })));
      if (res.figura) {
        P.figuraNueva = P.figuraNueva || {};
        P.figuraNueva[f.fila] = res.figura;
        P.acciones.push({ tipo: 'figura', f: f, escrituras: [{ fila: f.fila, col: col('Figura'), valor: res.figura, esperado: '' }],
                          detalle: res.figura + ' (RDV CONJUNTO fila ' + res.filas.join(', ') + (res.por ? '; por ' + res.por : '') +
                                   (res.barrioConjunto ? '; el barrio de RDV CONJUNTO es "' + res.barrioConjunto + '"' : '') + ')' });
        if (res.por && /^dirección/.test(res.por)) P.figuraPorDireccion.push({ f: f, res: res });
      } else {
        P.figuraACompletar.push({ f: f, motivo: res.motivo, filas: res.filas });
      }
    });
  }

  // --- 8 (prompt 07). Duplicados DESPUÉS de crear: una fila del equipo igual o casi igual a una creada por la agenda ---
  // 16/10: ya no son informativos: cada par (la de la agenda + la del equipo) es "una reunión en dos filas" y pide una decisión
  // (_dosFilasAgenda_, abajo), salvo que el equipo ya la haya tomado
  const despuesPares = [];
  dest.filas.forEach(function (fa) {
    if (!/^c-/.test(str(val(fa, 'agenda_uid'))) || !fa.fecha) return;
    const evFila = { figuras: fa.figura ? [fa.figura] : [], fecha: fa.fecha, hora: valorAgendaComparable_(val(fa, 'HORA'), 'HORA'),
                     comuna: fa.barrio ? _comunaBarrioAg_(fa.barrio) : null, barrio: '' };
    const lugarMail = str(val(fa, 'Lugar (mail)'));
    if (evFila.comuna == null && lugarMail) evFila.comuna = detectComuna_(lugarMail);
    // 07/10, UBICACION_TRES_NIVELES: la ubicación de la fila de la agenda en tres niveles (su barrio; la comuna del
    // barrio o la del mail; el eje del mail), contra las filas del equipo.
    if (usarUbicacion3_()) evFila.ubic = ubicacionDeFila_(Object.assign({}, fa, { lugarMail: lugarMail }));
    const casi = casiDuplicados(evFila, true).filter(function (x) { return x.f.fila !== fa.fila; });
    if (casi.length) despuesPares.push({ fAgenda: fa, candidatas: casi });
  });
  // 16/10: "una reunión en dos filas" — los pares del H3 y de "después de crear" que el equipo tiene que decidir (AGENDA_DUPLICADOS)
  _dosFilasAgenda_(P, dest, A, despuesPares, elecciones, paresIgnorados, P.fusionPrevia);

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
    if (x && x.yaCargada) {
      P.copia.push({ ev: ev, x: x, estado: 'ya cargada en la fila ' + x.fila + ' (fecha distinta)', fechaOriginal: ev.fechaOriginal || null });
      return;
    }
    // 15/10: cancelada en el mail (AGENDA_CERRAR_CANCELADAS_MAIL) y "ya cargada" elegida con la fila que ya no está (AGENDA_ELECCIONES_SIEMPRE)
    if (x && (x.canceladaMail || x.yaCargadaSinFila)) {
      P.copia.push({ ev: ev, x: null, fechaOriginal: ev.fechaOriginal || null,
                     estado: x.canceladaMail ? 'cancelada en el mail: no se crea' + (x.motivo ? ' (' + x.motivo + ')' : '') :
                             'ya cargada en otra fila (lo eligió el equipo; esa fila ya no se encuentra): no se crea' });
      return;
    }
    // 15/10 (H1, H3, H4): las reuniones que todavía no tienen fila, igual en el archivo "Agenda" (refleja el mail entero)
    if (x && (x.pendiente || x.repetidaMail || x.bloqueada)) {
      P.copia.push({ ev: ev, x: null, fechaOriginal: ev.fechaOriginal || null,
                     estado: x.pendiente ? 'pendiente de definir' : (x.repetidaMail ? 'repetida en el mail: no se crea (aviso)' :
                             'no se crea: la semana tiene una reunión en dos filas (AGENDA_DUPLICADOS)') });
      return;
    }
    if (x && x.geoDiferida) {   // 16/10 (AGENDA_GEO_AHORRO): se crea en la próxima corrida, con su barrio
      P.copia.push({ ev: ev, x: null, estado: 'se crea en la próxima corrida (falta geocodificar la dirección)', fechaOriginal: ev.fechaOriginal || null });
      return;
    }
    if (x && (x.borradaEquipo || x.duplicado)) {
      P.copia.push({ ev: ev, x: null, estado: x.borradaEquipo ? 'borrada por el equipo' : 'duplicado: ver AGENDA_DUPLICADOS', fechaOriginal: ev.fechaOriginal || null });
      return;
    }
    const item = { ev: ev, x: x, estado: x && x.reprogramadaDe ? 'reprogramada' : 'vigente',
                   fechaOriginal: x && x.reprogramadaDe ? x.reprogramadaDe : (ev.fechaOriginal || null) };
    // 15/10 (noche): cancelada en el mail en rojo: "Cambios" lo dice (la suspendió esta corrida, o ya estaba Suspendida)
    if (ev.canceladaEnMail) {
      const yaS = x && x.f && normStatus_(val(x.f, 'STATUS REUNIÓN')) === 'suspendida';
      if (x && x.cambiosTexto) item.cambios = x.cambiosTexto;
      else if (yaS) item.cambios = 'suspendida: ' + ev.canceladaEnMailMotivo;
      else item.cambios = 'cancelada en el mail (' + ev.canceladaEnMailMotivo + ')' + (ev.cambios ? '; ' + ev.cambios : '');
    }
    P.copia.push(item);
  });
  r.desaparecidas.forEach(function (d) {
    if (!enCopia(d) || presentes.has(d.clave) || atendidas.has(d.clave)) return;
    const x = P.filaDe.get(d.clave);
    if (x && x.borrada) P.copia.push({ ev: d, x: null, estado: 'desaparecida (fila borrada)', fechaOriginal: d.fechaOriginal || null });
    else if (x && x.cancelacionPendiente) P.copia.push({ ev: d, x: x, estado: 'desaparecida: ¿se canceló? (AGENDA_DUPLICADOS)', fechaOriginal: d.fechaOriginal || null });
    else if (x && x.sigue) P.copia.push({ ev: d, x: x, estado: 'desaparecida, pero sigue (lo eligió el equipo)', fechaOriginal: d.fechaOriginal || null });
    else if (x && x.suspendidaAuto) P.copia.push({ ev: d, x: x, estado: 'desaparecida: Suspendida', cambios: x.cambiosTexto, fechaOriginal: d.fechaOriginal || null });
    else {
      const xd = filaDeCopia(d);
      // 15/10 (J): una que ya suspendió el sistema en una corrida anterior lo sigue diciendo en "Cambios"
      const yaSusp = suspenderSiempre && xd && xd.f && normStatus_(val(xd.f, 'STATUS REUNIÓN')) === 'suspendida' &&
                     normStatus_(val(xd.f, 'agenda_status_escrito')) === 'suspendida';
      P.copia.push({ ev: d, x: xd, estado: 'desaparecida', fechaOriginal: d.fechaOriginal || null,
                     cambios: yaSusp ? 'suspendida: salió del mail del ' + fmtFecha_(d.mailQueLaSaco) : undefined });
    }
  });
  P.copia.forEach(function (c) { c.barrio = barrioDe(c.ev, 'mostrar'); });
  // 16/10 (AGENDA_CANCELACION_CONJUNTO): la fila que suspendió RDV CONJUNTO (en esta corrida o antes) lo dice en "Cambios"
  if (P.modos.cancelacionConjunto) {
    const susConj = (P.historial && P.historial.suspendidasConjunto) || new Set();
    P.copia.forEach(function (c) {
      if (!c.x || !c.x.fila) return;
      const fx = c.x.f || filaPorNumero.get(c.x.fila);
      const antes = !c.x.porConjunto && fx && susConj.has(str(val(fx, 'agenda_uid'))) && _bloqueoConjuntoAgenda_(P.historial, str(val(fx, 'agenda_uid')), fx.fecha) &&
                    normStatus_(val(fx, 'STATUS REUNIÓN')) === 'suspendida';
      if (!c.x.porConjunto && !antes) return;
      const t = 'suspendida: Cancelado en RDV CONJUNTO';
      const prev = c.cambios != null ? c.cambios : str(c.ev.cambios);
      c.cambios = prev && prev.indexOf(t) < 0 ? t + '; ' + prev : t;
    });
  }
  // 15/10 (noche, punto 5, AGENDA_COLORES_AMARILLO_VERDE): AMARILLO → "Cambios" y naranja en "Agenda (mail)"; VERDE → "nueva"
  if (amarilloVerde) P.copia.forEach(_marcaAmarilloVerdeAgenda_);

  // 15/10 (AGENDA_ELECCIONES_SIEMPRE): las elecciones que el plan NO miró (su reunión salió del alcance o del mail, o la pregunta
  // ya no corresponde) quedan CERRADAS: no vuelven a aparecer y se anotan una vez en REGISTRO_AGENDA_CAMBIOS.
  if (siempre) {
    elecciones.forEach(function (el, clave) {
      if (P.eleccionesConsultadas.has(clave)) return;
      P.eleccionesCerradas.push({ clave: clave, el: el, motivo: motivoEleccionNoUsadaAgenda_(clave, r, alcance, presentes) });
    });
    P.cancelacionSigue.forEach(function (x) {
      P.eleccionesUsadas.push({ id: 'cancelacion|' + idReunionAgenda_(x.ev), el: elDe('cancelacion|' + idReunionAgenda_(x.ev)), eleccion: 'sigue', f: x.f });
    });
  }

  const n = function (t) { return P.acciones.filter(function (a) { return a.tipo === t; }).length; };
  P.resumen = { mails: r.mails, reunionesEnAlcance: enAlcance.length, crear: n('crear'), vincular: n('vincular'),
                actualizar: n('actualizar'), mover: n('mover'), suspender: n('suspender'), borrar: n('borrar'), reactivar: n('reactivar'),
                figura: n('figura'), ambiguas: P.ambiguas.length, editadas: P.editadas.length,
                saltadas60: P.saltadas60.length, noFuturas: P.noFuturas.length, entreSemanas: P.entreSemanas.length,
                reprogramadasNoMovibles: P.reprogramadasNoMovibles.length, viejasSinFila: P.viejasSinFila.length,
                figuraACompletar: P.figuraACompletar.length, duplicadasEnCorrida: P.duplicadasEnCorrida.length, barrio: P.barrio,
                duplicadosAntes: P.duplicados.filter(function (x) { return x.tipo === 'antes'; }).length,
                duplicadosDespues: P.dosFilas.filter(function (x) { return x.origen === 'despues'; }).length,
                dosFilas: P.dosFilas.length, dosFilasDecididas: P.dosFilasDecididas.length,
                juntadasAntes: P.fusionPrevia ? (P.fusionPrevia.decididas || []).length + (P.fusionPrevia.automaticas || []).length : 0,
                cancelaciones: P.duplicados.filter(function (x) { return x.tipo === 'cancelacion'; }).length,
                cancelacionSigue: P.cancelacionSigue.length,
                borradasEquipo: P.borradasEquipo.length, origenEquipo: P.origenEquipo || 0, tocado: n('tocado'),
                eleccionesAplicadas: P.eleccionesAplicadas.length, noCreadasSinHistorial: P.noCreadasSinHistorial || 0,
                yaCargadas: P.yaCargadas.length,
                // 15/10 (noche)
                pendientes: P.pendientes.length, conciliadas: P.conciliadas.length, invariante: P.invariante.length,
                bloqueadasInvariante: P.bloqueadasInvariante.length, repetidasEnMail: P.repetidasEnMail.length,
                mailsRaros: (r.mailsRaros || []).length, suspendidasAuto: P.suspendidasAuto.length, cancelNoAplicada: P.cancelNoAplicada.length,
                // 15/10 (AGENDA_ELECCIONES_SIEMPRE, AGENDA_CERRAR_CANCELADAS_MAIL)
                eleccionesSinFila: P.eleccionesSinFila.length, eleccionesCerradas: P.eleccionesCerradas.length, canceladasMail: P.canceladasMail.length };
  if (coloresMail) {
    P.resumen.canceladasEnRojo = enAlcance.filter(function (ev) { return ev.canceladaEnMail; }).length;
    P.resumen.suspendidasPorRojo = P.suspendidasAuto.filter(function (x) { return x.porRojo; }).length;
    P.resumen.noReactivadasRojo = P.noReactivadasRojo.filter(function (x) { return !x.porConjunto; }).length;
  }
  if (suspenderSiempre || coloresMail) P.resumen.suspendidasConDatos = P.suspendidasConDatos.length;
  if (P.modos.cancelacionConjunto) {
    P.resumen.canceladasEnConjunto = P.conjuntoCancela.length;
    P.resumen.suspendidasPorConjunto = P.suspendidasAuto.filter(function (x) { return x.porConjunto; }).length;
  }
  return P;
}

/** Un dato cargado (asistentes, inscriptos): no vacío y no 0. */
function _hayDatoAgenda_(v) {
  if (esVacio_(v)) return false;
  return !(typeof v === 'number' ? v === 0 : /^\s*0+\s*$/.test(String(v)));
}

/** " (asistentes N, inscriptos M)" de una fila, si tiene; '' si no. */
function _datosFilaTextoAgenda_(dest, f) {
  const D = dest && dest.D ? dest.D : {};
  const out = [];
  if (D['Asistentes'] != null && _hayDatoAgenda_(f.valores[D['Asistentes']])) out.push('asistentes ' + str(f.valores[D['Asistentes']]));
  if (D['Inscriptos'] != null && _hayDatoAgenda_(f.valores[D['Inscriptos']])) out.push('inscriptos ' + str(f.valores[D['Inscriptos']]));
  return out.length ? ' (' + out.join(', ') + ')' : '';
}

/**
 * **AMARILLO y VERDE en la copia** (15/10, noche, punto 5; AGENDA_COLORES_AMARILLO_VERDE). Una reunión con alguna línea en
 * AMARILLO: "Cambios" + 'cambió en el mail (amarillo): Hora / Lugar' y `c.amarillo` (las líneas que "Agenda (mail)" pinta
 * en naranja); con VERDE: 'nueva (verde en el mail)'. Sólo la copia del archivo "Agenda": nunca la base.
 */
function _marcaAmarilloVerdeAgenda_(c) {
  const cm = c.ev && c.ev.colorMail;
  if (!cm) return;
  const campos = ['Evento', 'Hora', 'Lugar'];
  const marcas = [];
  const amar = campos.filter(function (k) { return cm.porCampo[k] === 'AMARILLO'; });
  if (amar.length) { c.amarillo = amar; marcas.push('cambió en el mail (amarillo): ' + amar.join(' / ')); }
  if (cm.familia === 'VERDE' || campos.some(function (k) { return cm.porCampo[k] === 'VERDE'; })) marcas.push('nueva (verde en el mail)');
  if (!marcas.length) return;
  const base = c.cambios != null ? c.cambios : str(c.ev.cambios);
  c.cambios = [base].concat(marcas).filter(Boolean).join('; ');
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

// ===================== 15/10: la reunión sin figura por su identidad del mail (AGENDA_SEGURIDAD_POR_COMUNA) =====================

/**
 * ¿Es una dirección de verdad? Sólo con calle y número (`direccionComparable_`). "A CONFIRMAR (NO SE COMUNICA LA
 * DIRECCIÓN)", un nombre de lugar o nada: no. Una "dirección" que no es dirección no identifica ninguna reunión: dos
 * Seguridad del mismo día la comparten (caso 833/835).
 */
function esDireccionReal_(s) {
  const t = str(s);
  if (!t || /\ba confirmar\b|\bno se comunica\b/.test(normalizeText_(t))) return false;
  return direccionComparable_(t) != null;
}

/** El tipo de reunión (AGENDA_TIPOS, el mismo orden que el parser) de un texto de evento del mail; '' si no se reconoce. */
function tipoAgendaDeTexto_(texto) {
  const n = normalizeText_(texto);
  for (let i = 0; i < AGENDA_TIPOS.length; i++) if (AGENDA_TIPOS[i].re.test(n)) return AGENDA_TIPOS[i].tipo;
  return '';
}

/** El grupo del mail ("CM y Ministros", "JM"…) de un agenda_mail ("asunto | dd/MM/yyyy HH:mm"); '' si no se lee. */
function grupoDeAgendaMail_(agendaMail) {
  const asunto = str(agendaMail).replace(/\s*\|\s*\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2})?\s*$/, '');
  if (!asunto) return '';
  const sem = _semanaAgenda_(asunto, '', new Date());
  return sem && sem.grupo && sem.grupo !== '(sin grupo)' ? sem.grupo : '';
}

/**
 * **¿La fila es la de esta reunión SIN figura?** (15/10, AGENDA_SEGURIDAD_POR_COMUNA): una Seguridad en tu Barrio se
 * identifica por grupo + fecha + el LUGAR que dice el mail (la comuna), no por la dirección (que llega "A CONFIRMAR" y
 * después cambia). La fila (de la misma fecha: eso lo mira quien llama) tiene que ser de la agenda (agenda_uid), con el
 * mismo "Lugar (mail)", el mismo tipo en "Evento (mail)" y, si los dos se leen, un grupo de la reunión (el suyo o uno de
 * los otros grupos que la traen). La Figura de la fila no importa: la de una Seguridad la completa RDV CONJUNTO.
 */
function mismaReunionSinFiguraAgenda_(ev, uid, lugarMail, eventoMail, agendaMail, aunqueNombreFigura) {
  // 16/10 (bug 832/838): `aunqueNombreFigura` — una SEGURIDAD se identifica siempre por grupo + fecha + "Lugar (mail)" (la
  // comuna), aunque el mail ahora nombre a una figura (y aunque la fila ya tenga la que cargó RDV CONJUNTO)
  if (!ev || (ev.figuraFila && !aunqueNombreFigura) || !uid || !ev.lugar || !lugarMail || !eventoMail) return false;
  if (normalizeText_(lugarMail) !== normalizeText_(ev.lugar)) return false;
  if (tipoAgendaDeTexto_(eventoMail) !== (ev.tipo || '')) return false;
  const g = grupoDeAgendaMail_(agendaMail);
  if (g && ev.grupo && ev.grupo !== '(sin grupo)') {
    const deLaReunion = [ev.grupo].concat(ev.otrosGrupos || []).map(normalizeText_);
    if (deLaReunion.indexOf(normalizeText_(g)) < 0) return false;
  }
  return true;
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
  // 15/10 (noche): una reunión CANCELADA EN EL MAIL EN ROJO sigue en el mail, pero no "volvió": no se reactiva. Y una fila que el
  // sistema suspendió por rojo (la nota "suspendida_rojo" del historial) no se reactiva si no se sabe el color de la reunión
  // (los colores apagados, o el mail sin HTML): con el color sabido y sin rojo, sí (dejó de estar en rojo).
  const porRojo = P.historial && P.historial.suspendidasRojo && P.historial.suspendidasRojo.has(str(val('agenda_uid')));
  // 16/10 (AGENDA_CANCELACION_CONJUNTO): la que suspendió un "Cancelado" de RDV CONJUNTO ("suspendida_conjunto" en el historial)
  // no la reactiva la agenda porque la reunión siga en el mail: la vuelve atrás el equipo, a mano.
  const porConjunto = _bloqueoConjuntoAgenda_(P.historial, str(val('agenda_uid')), f.fecha);
  const noReactivar = !!ev.canceladaEnMail || (!!porRojo && ev.colorMail == null) || porConjunto;
  if (noReactivar && normStatus_(status) === 'suspendida' && normStatus_(val('agenda_status_escrito')) === 'suspendida') {
    (P.noReactivadasRojo = P.noReactivadasRojo || []).push({ f: f, ev: ev, porConjunto: porConjunto && !ev.canceladaEnMail,
      motivo: ev.canceladaEnMail ? ev.canceladaEnMailMotivo : (porConjunto ? 'la suspendió un "Cancelado" de RDV CONJUNTO' : 'la suspendió el rojo del mail y hoy no se sabe el color') });
  } else if (normStatus_(status) === 'suspendida' && normStatus_(val('agenda_status_escrito')) === 'suspendida') {
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
    // 16/10: un barrio PENDIENTE (tope de geocodificación o guarda de tiempo) no toca la celda: ni la vacía ni la cambia
    if (!b.pendiente && cmp(b.barrio, 'Barrio') !== cmp(bCur, 'Barrio') && !(esVacio_(bCur) && !b.barrio)) {
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
 *
 * 16/10 (AGENDA_GEO_AHORRO, 00_Config.js): `extra` = { r, dest, A, hoy } (el plan). Las direcciones que faltan en la cache se piden
 * en orden de CERCANÍA de la reunión (las de hoy en adelante primero, de la más próxima; después las pasadas, de la más reciente),
 * hasta el tope; un fallo de la cache reciente no se vuelve a pedir; la consulta lleva las abreviaturas expandidas; con
 * `opciones.geoSoloDias` (la guarda de tiempo de la agenda) sólo las reuniones de hoy a esos días. Lo que no entra devuelve
 * `{ barrio: '', pendiente: true }`: quien lo usa no escribe nada que dependa del barrio. `uso` 'mostrar' (la copia): una dirección
 * que ya resolvió una fila de la base no gasta una llamada sólo para mostrarse. `P.geo`: lo que hizo (para el log y el paso 67).
 */
function _barrioAgenda_(opciones, P, extra) {
  let cache = null, poligonos = null;
  const nuevas = [];
  P.geocodeNuevas = nuevas;
  // 15/10: con su interruptor (la medición en seco lo fuerza por `opciones.barrioDelMail`)
  const barrioDelMail = opciones && opciones.barrioDelMail !== undefined ? !!opciones.barrioDelMail : AGENDA_BARRIO_DEL_MAIL;
  const ahorro = typeof AGENDA_GEO_AHORRO !== 'undefined' && AGENDA_GEO_AHORRO && !(opciones && opciones.geocodificar);
  const maximo = ahorro ? GEOCODE_MAX_POR_CORRIDA : (typeof GEOCODE_MAX_POR_CORRIDA_VIEJO !== 'undefined' ? GEOCODE_MAX_POR_CORRIDA_VIEJO : GEOCODE_MAX_POR_CORRIDA);
  const soloDias = ahorro && opciones && opciones.geoSoloDias != null ? opciones.geoSoloDias : null;
  const hoyG = (extra && extra.hoy) || hoyMediodia_();
  const G = P.geo = { activo: ahorro, maximo: maximo, soloDias: soloDias, llamadas: 0, cache: 0, fallosCache: 0, reintentos: 0, sinDireccion: 0,
                      resueltas: 0, pendientesTope: 0, pendientesTiempo: 0, direcciones: [] };
  let llamadas = 0;
  const memo = new Map();
  let permitidas = null;
  const consultasDe = function (ev) {
    const orig = _consultaGeocode_(ev.direccion);
    return { orig: orig, exp: ahorro && typeof _consultaGeocodeExpandida_ === 'function' ? _consultaGeocodeExpandida_(ev.direccion) : orig };
  };
  const enVentanaTiempo = function (ev) {
    if (soloDias == null) return true;
    if (!ev.fecha) return false;
    const d = Math.round((alMediodia_(ev.fecha.getFullYear(), ev.fecha.getMonth() + 1, ev.fecha.getDate()) - hoyG) / 86400000);
    return d >= 0 && d <= soloDias;
  };
  /** Lo que la cache tiene de una reunión: `{ g, estado }` ('ok' / 'fallo') o `{ g: null, previo }` (falta, o un fallo viejo). */
  const deCache = function (q) {
    if (!ahorro) { const g0 = cache.get(q.orig); return g0 ? { g: g0, estado: 'ok' } : { g: null }; }
    const gE = cache.get(q.exp), eE = gE ? estadoCacheGeo_(gE, poligonos) : null;
    if (gE && eE !== 'reintentar') return { g: gE, estado: eE };
    if (q.orig !== q.exp) {
      // la forma vieja (sin expandir) ya resolvió EXACTA: se usa, no se vuelve a pedir. Si dio aproximada, parcial o un fallo, se
      // pide la expandida (Bullrich: "Int." puede ser justo lo que Maps no entendió)
      const gO = cache.get(q.orig);
      if (gO && _barrioDeGeo_(gO, poligonos).estado === 'ok') return { g: gO, estado: 'ok' };
      if (gO && !gE) return { g: null, previo: gO };
    }
    return { g: null, previo: gE || null };
  };
  /** Las direcciones que la base ya resolvió: la consulta de agenda_direccion_escrita → el barrio del sistema que sigue en la fila. */
  let resueltas = null;
  const resueltasDeBase = function () {
    if (resueltas) return resueltas;
    resueltas = new Map();
    const d = extra && extra.dest, A = extra && extra.A;
    if (!d || !A || A.agenda_direccion_escrita == null || A.agenda_barrio_escrito == null) return resueltas;
    d.filas.forEach(function (f) {
      const dir = str(f.valores[A.agenda_direccion_escrita]), be = str(f.valores[A.agenda_barrio_escrito]);
      if (!dir || !be || _noEsDireccion_(dir) || normalizeText_(be) !== normalizeText_(f.barrio)) return;
      const q = consultasDe({ direccion: dir });
      resueltas.set(q.exp, { barrio: be, fila: f.fila });
      resueltas.set(q.orig, { barrio: be, fila: f.fila });
    });
    return resueltas;
  };
  /** Las consultas que esta corrida puede pedir a Maps: las de las reuniones más cercanas en fecha, hasta el tope. */
  const prepararPermitidas = function () {
    if (permitidas) return;
    permitidas = new Set();
    if (!ahorro || !extra || !extra.r) return;
    const evs = [].concat(extra.r.unicas || [], extra.r.ultimas || [], extra.r.desaparecidas || []);
    const prioridad = new Map();
    const res = resueltasDeBase();
    evs.forEach(function (ev) {
      if (!ev || !ev.direccion || _noEsDireccion_(ev.direccion) || !enVentanaTiempo(ev)) return;
      const q = consultasDe(ev);
      if (deCache(q).g || res.has(q.exp) || res.has(q.orig)) return;
      const t = ev.fecha ? ymd_(ev.fecha) : '';
      const hoyK = ymd_(hoyG);
      const k = !t ? [2, 0] : (t >= hoyK ? [0, ev.fecha - hoyG] : [1, hoyG - ev.fecha]);
      const ant = prioridad.get(q.exp);
      if (!ant || k[0] < ant[0] || (k[0] === ant[0] && k[1] < ant[1])) prioridad.set(q.exp, k);
    });
    Array.from(prioridad.keys()).sort(function (a, b) {
      const x = prioridad.get(a), y = prioridad.get(b);
      return (x[0] - y[0]) || (x[1] - y[1]) || (a < b ? -1 : a > b ? 1 : 0);
    }).slice(0, maximo).forEach(function (q) { permitidas.add(q); });
    G.candidatas = prioridad.size;
  };
  return function (ev, uso) {
    const k = ev.clave + '|' + ev.version + '|' + ev.grupo;
    if (memo.has(k)) return memo.get(k);
    if (uso === 'mostrar' && memo.has(k + '|m')) return memo.get(k + '|m');
    const b = _barrioAgendaUna_(ev, uso);
    memo.set(b.yaResuelta ? k + '|m' : k, b);   // "ya resuelta" vale sólo para mostrar: una decisión la vuelve a mirar
    return b;
  };
  function _barrioAgendaUna_(ev, uso) {
    const sumar = function (k) { P.barrio[k] = (P.barrio[k] || 0) + 1; };
    // 15/10 (AGENDA_BARRIO_DEL_MAIL, caso 824): sin barrio por la dirección, el barrio que el mail da como lugar (si Comunas
    // lo tiene), salvo que la dirección se haya geocodificado bien a OTRO barrio (`res`): ahí se contradicen y no va nada.
    const vacio = function (clave, b, res) {
      const m = barrioDelMail ? barrioDelLugarMailAgenda_(ev, res) : null;
      if (m) { sumar('escrito (el barrio del mail, "Lugar (mail)")'); return m; }
      sumar(clave);
      return b;
    };
    if (!ev.direccion || _noEsDireccion_(ev.direccion)) {
      G.sinDireccion++;
      return vacio('sin dirección (A CONFIRMAR o sin altura)', { barrio: '', motivo: ev.direccionAConfirmar ? 'A CONFIRMAR' : 'sin dirección con altura' });
    }
    if (!poligonos) poligonos = _poligonosBarrios_();
    const q = consultasDe(ev);
    let g, llamada = null;
    if (opciones.geocodificar) g = opciones.geocodificar(q.orig);
    else {
      if (!cache) cache = _leerCacheGeocode_();
      const c = deCache(q);
      g = c.g;
      if (g) { if (c.estado === 'fallo') G.fallosCache++; else G.cache++; }
      if (!g) {
        // 16/10: sólo para MOSTRAR (la copia), una dirección que ya resolvió una fila de la base no gasta una llamada
        const yaRes = ahorro && uso === 'mostrar' ? (resueltasDeBase().get(q.exp) || resueltasDeBase().get(q.orig)) : null;
        if (yaRes) { G.resueltas++; return { barrio: yaRes.barrio, motivo: 'cumple', por: 'ya resuelta en la base (fila ' + yaRes.fila + ')', yaResuelta: true }; }
        // 16/10: pendiente (el tope, o la guarda de tiempo): no se escribe nada que dependa del barrio (ni el del mail)
        const pendiente = function (porque) {
          sumar('pendiente: ' + porque);
          return { barrio: '', motivo: 'pendiente: tope de geocodificación (' + porque + ')', pendiente: true };
        };
        if (ahorro) {
          prepararPermitidas();
          if (!enVentanaTiempo(ev)) { G.pendientesTiempo++; return pendiente('guarda de tiempo: sólo las de los próximos ' + soloDias + ' días'); }
          const reservada = permitidas.has(q.exp);
          // las reservadas que todavía no se pidieron no se le dan a otra (las más cercanas en fecha tienen prioridad)
          const libres = maximo - G.llamadas - permitidas.size;
          if (!reservada && libres <= 0) { G.pendientesTope++; return pendiente('tope de ' + maximo + ' por corrida'); }
          if (reservada) permitidas.delete(q.exp);
        } else if (llamadas >= maximo) return vacio('pendiente: tope de geocodificación', { barrio: '', motivo: 'tope' });
        if (c.previo) G.reintentos++;
        g = _geocodificar_(ahorro ? q.exp : q.orig, true);
        llamadas++; G.llamadas++;
        if (ahorro) {
          g.fechaMs = Date.now();
          cache.set(q.exp, g); nuevas.push(g);   // también un fallo (con su fecha): no se vuelve a pedir en cada corrida
        } else if (g.estado !== 'ERROR') { cache.set(q.orig, g); nuevas.push(g); }
        llamada = { consulta: g.consulta, estado: g.estado, tipo: g.tipo || '', parcial: !!g.parcial, reintento: !!c.previo,
                    fecha: ev.fecha ? fmtFecha_(ev.fecha) : '' };
        G.direcciones.push(llamada);
      }
    }
    const res = _barrioDeGeo_(g, poligonos);
    const regla = _reglaBarrioConMargen_(res, ev, poligonos, BARRIO_MARGEN_M);
    if (llamada) { llamada.barrio = res.barrio || ''; llamada.resultado = res.estado; llamada.regla = regla.cumple ? 'cumple' : regla.motivo; }
    if (regla.cumple) {
      sumar(regla.por && /eje/.test(regla.por) ? 'escrito (el mail trae eje)' : 'escrito (cumple la regla)');
      // 07/10: el barrio de otro eje que el del mail no frena, pero queda anotado (log del plan y paso 51)
      if (regla.nota) (P.notasEje = P.notasEje || []).push({ ev: ev, barrio: res.barrio, nota: regla.nota });
      return { barrio: res.barrio, motivo: 'cumple', por: regla.por || '', nota: regla.nota || '' };
    }
    return vacio('vacío: ' + regla.motivo.replace(/\d+ m/, 'N m'), { barrio: '', motivo: regla.motivo, res: res }, res);
  }
}

/**
 * 16/10 (AGENDA_GEO_AHORRO): lo que hizo la geocodificación en esta corrida, en el log (y en REGISTRO_CORRIDAS, para el paso 67):
 * cuántas llamadas a Maps y para qué direcciones (sólo la consulta: calle, altura y la Ciudad), qué salió de la cache, qué no se
 * geocodificó y por qué.
 */
function _logGeoAgenda_(P) {
  const G = P && P.geo;
  if (!G) return;
  const dif = (P.creacionGeoDiferida || []).length;
  Logger.log('  geocodificación: %s llamadas a Maps (tope %s%s) | de la cache %s (+ %s fallos recientes, sin volver a pedir) | ' +
             'reintentos de fallos viejos %s | sin dirección (A CONFIRMAR, sin altura) %s | ya resueltas en la base (sólo para mostrar) %s | ' +
             'pendientes por el tope %s | por la guarda de tiempo %s | reuniones que se crean en la próxima corrida por eso %s',
             G.llamadas, G.maximo, G.soloDias != null ? '; GUARDA DE TIEMPO: sólo hoy a ' + G.soloDias + ' días' : '', G.cache, G.fallosCache,
             G.reintentos, G.sinDireccion, G.resueltas, G.pendientesTope, G.pendientesTiempo, dif);
  G.direcciones.forEach(function (d) {
    Logger.log('    Maps: "%s" (reunión del %s) → %s%s%s → %s: %s%s', d.consulta, d.fecha || '?', d.estado, d.tipo ? ' ' + d.tipo : '',
               d.parcial ? ' (coincidencia parcial)' : '', d.barrio || 'sin barrio', d.regla || '', d.reintento ? ' [reintento de un fallo viejo]' : '');
  });
  if (typeof agendaGeoAnotar_ === 'function') agendaGeoAnotar_(G, dif);
}

/**
 * 16/10: por qué una dirección da o no da barrio, PASO A PASO (para revisar un caso como "Av. Int. Bullrich 55, La Mezquita"):
 * las dos consultas (la del mail y la expandida), lo que tiene la cache AGENDA_GEOCODE de cada una, el barrio del punto, la
 * distancia al borde de otro barrio y la regla de confianza con el lugar del mail (`lugarMail`: "Comuna 14", "Palermo", "Eje
 * Norte"…). Con `conMaps` true pide a Maps las consultas que la cache no tiene (gasta cuota; NO escribe la cache). No escribe nada.
 */
function explicarBarrioAgenda(direccion, lugarMail, conMaps) {
  direccion = direccion || 'Av. Int. Bullrich 55, La Mezquita';
  const pol = _poligonosBarrios_(), cache = _leerCacheGeocode_();
  const ev = _completarReunion_({ eventoTexto: 'Encuentro con Vecinos' + (lugarMail ? ', ' + lugarMail : ''), lugarTexto: direccion, horaTexto: '18:00',
                                   fecha: hoyMediodia_() });
  Logger.log('=== por qué "%s" da o no da barrio (lugar del mail: %s) ===', direccion, lugarMail || '(ninguno)');
  Logger.log('  dirección leída: "%s" | ¿es una dirección? %s | lugar del mail: barrio %s, comuna %s, eje %s', ev.direccion,
             ev.direccion && !_noEsDireccion_(ev.direccion) ? 'sí' : 'NO (no se geocodifica)', ev.barrio || '—', ev.comuna == null ? '—' : ev.comuna, ev.eje || '—');
  const qs = [_consultaGeocode_(direccion), _consultaGeocodeExpandida_(direccion)].filter(function (q, i, a) { return a.indexOf(q) === i; });
  qs.forEach(function (q) {
    let g = cache.get(q), de = 'la cache (' + (g ? str(g.fecha) : '') + ')';
    if (!g && conMaps) { g = _geocodificar_(q, true); de = 'Maps, ahora'; }
    if (!g) { Logger.log('  "%s": no está en la cache%s', q, conMaps ? '' : ' (correr con conMaps = true para preguntarle a Maps)'); return; }
    const res = _barrioDeGeo_(g, pol), regla = _reglaBarrioConMargen_(res, ev, pol, BARRIO_MARGEN_M);
    const d = res.lat != null ? _distanciaAOtroBarrioM_(res.lng, res.lat, pol, res.barrio) : null;
    Logger.log('  "%s" (de %s): Maps %s, tipo %s%s, "%s" → punto %s → barrio %s (%s); a %s m del borde de otro barrio | estado de la cache: %s',
               q, de, g.estado, g.tipo || '—', g.parcial ? ', COINCIDENCIA PARCIAL' : '', g.formateada || '', res.lat != null ? res.lat + ',' + res.lng : '—',
               res.barrio || '—', res.estado, d == null ? '—' : Math.round(d), estadoCacheGeo_(g, pol));
    Logger.log('    regla de confianza: %s', regla.cumple ? 'CUMPLE (' + (regla.por || '') + ')' : 'no cumple: ' + regla.motivo);
  });
  return qs;
}

/**
 * **El barrio desde "Lugar (mail)"** (15/10, AGENDA_BARRIO_DEL_MAIL, caso 824): si el mail da como lugar un BARRIO (no una
 * comuna ni un eje: `ev.lugarTipo` 'barrio') que Comunas tiene, ese barrio canónico. `null` si no, o si la dirección se
 * geocodificó bien (`res.estado` 'ok') a OTRO barrio: el mail y la dirección se contradicen y no se escribe ninguno.
 */
function barrioDelLugarMailAgenda_(ev, res) {
  if (!ev || ev.lugarTipo !== 'barrio' || !ev.barrio) return null;
  const canon = _canonBarrioAg_(ev.barrio);
  if (!canon || comunaDeBarrio_(canon) == null) return null;
  if (res && res.estado === 'ok' && res.barrio && normalizeText_(_canonBarrioAg_(res.barrio) || res.barrio) !== normalizeText_(canon)) return null;
  return { barrio: canon, motivo: 'cumple', por: 'el barrio del mail ("Lugar (mail)")' };
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
  const iDir = findIdxOr_(hdr, ['direccion', 'dirección'], true);
  if (iFig == null || iFec == null) return porFecha;
  for (let i = 1; i < vals.length; i++) {
    const f = toDate_(vals[i][iFec]);
    if (!f) continue;
    const k = ymd_(f);
    if (!porFecha.has(k)) porFecha.set(k, []);
    porFecha.get(k).push({ fila: i + 1, nombre: str(vals[i][iFig]), ubic: iBar != null ? str(vals[i][iBar]) : '',
                           dir: iDir != null ? str(vals[i][iDir]) : '' });
  }
  return porFecha;
}

/**
 * La figura de una "Seguridad en tu Barrio" desde RDV CONJUNTO (regla 8, el cruce del paso 32): las filas de esa
 * fecha cuyo barrio coincide (o, con "C5" / barrio de otra comuna, cuya comuna coincide). `{ figura, filas, motivo }`:
 * figura sólo si sale UNA (por tokens del nombre).
 */
function figuraSeguridad_(fecha, barrio, comuna, porFecha, direccion, conDireccion, ubicFila) {
  const comunaDe = function (t) {
    if (/^\s*(c|comuna)\s*0?\d{1,2}\s*(n|s|norte|sur)?\s*$/i.test(t)) return detectComuna_(t);
    return _comunaBarrioAg_(t);
  };
  // 07/10: con UBICACION_TRES_NIVELES y la ubicación de la fila (`ubicacionDeFila_`: barrio; comuna del barrio o del
  // mail; eje del mail), la misma regla que el resto (`compararUbicacion_`); si no, la de antes (barrio, o comuna).
  const tres = usarUbicacion3_() && ubicFila ? ubicFila : null;
  const delDia = porFecha.get(ymd_(fecha)) || [];
  // 07/10: primero fecha + DIRECCIÓN (exacta; si no hay, parecida). Si señala UNA sola fila de RDV CONJUNTO, ésa
  // gana aunque el barrio no coincida (se avisa en `barrioConjunto`).
  const usarDir = conDireccion === undefined ? CRUCE_CONJUNTO_POR_DIRECCION : conDireccion;
  if (usarDir && direccion) {
    const ex = delDia.filter(function (x) { return compararDirecciones_(direccion, x.dir) === 'exacta'; });
    const porDir = ex.length ? ex : delDia.filter(function (x) { return compararDirecciones_(direccion, x.dir) === 'parecida'; });
    if (porDir.length === 1) {
      const fp = figuraPorTokens_(porDir[0].nombre);
      if (fp.figura) {
        const b = porDir[0].ubic, bc = b ? _canonBarrioAg_(b) : '';
        const difiere = tres ? !!(b && compararUbicacion_(ubicacionDeTexto_(b), tres).coincide === false)
                             : !!(barrio && bc && normalizeText_(bc) !== normalizeText_(barrio));
        return { figura: fp.figura, filas: [porDir[0].fila], motivo: '', por: 'dirección ' + (ex.length ? 'exacta' : 'parecida'),
                 barrioConjunto: difiere ? b : '' };
      }
    }
  }
  const niveles = {};
  const cand = delDia.filter(function (x) {
    if (!x.ubic) return false;
    if (tres) {
      const k = compararUbicacion_(ubicacionDeTexto_(x.ubic), tres);
      if (k.coincide === true) niveles[k.nivel] = true;
      return k.coincide === true;
    }
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
  const por = tres ? Object.keys(niveles).join(' / ') : (barrio ? 'barrio' : 'comuna');
  if (lista.length === 1 && lista[0].indexOf('? ') !== 0) return { figura: lista[0], filas: filas, motivo: '', por: por };
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
    const nuevo = e ? e.valor : (a.f && A.agenda_uid != null ? str(a.f.valores[A.agenda_uid]) : '');
    // 16/10 (revisor): una acción posterior de la misma fila (sin escribir el uid) no pisa con '' el que le estampa otra
    if (nuevo || !uidDe[fila]) uidDe[fila] = nuevo;
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
  })).concat(plan.historial ? _notasHistorialAgenda_(plan, corrida) : []).concat((plan.yaCargadas || []).filter(function (x) {
    // "ya cargada en la fila N (fecha distinta)": una línea la primera vez (no en cada corrida de cada hora)
    return !(plan.historial && plan.historial.yaCargadas && plan.historial.yaCargadas.has(x.id + '|' + x.f.fila));
  }).map(function (x) {
    return [corrida, 'ya_cargada', x.f.fila, '', '', 'ya cargada en la fila ' + x.f.fila + ' (fecha distinta)', x.id, '', ''];
  })).concat(plan.acciones.filter(function (a) { return a.tipo === 'suspender' && a.porRojo; }).map(function (a) {
    // 15/10 (noche): la suspendió el ROJO del mail: con los colores apagados (o el mail sin HTML) no se reactiva sola
    return [corrida, 'suspendida_rojo', a.f.fila, '', '', a.motivoRojo || '', idReunionAgenda_(a.ev), '', uidDe[a.f.fila] || ''];
  })).concat(plan.acciones.filter(function (a) { return a.tipo === 'suspender' && a.porConjunto; }).map(function (a) {
    // 16/10 (AGENDA_CANCELACION_CONJUNTO): la suspendió un "Cancelado" de RDV CONJUNTO: la agenda no la reactiva sola
    // (16/10, revisor: en "columna", la FECHA de la fila al suspenderla: el bloqueo vale sólo mientras siga en esa fecha)
    return [corrida, 'suspendida_conjunto', a.f.fila, '', a.f.fecha ? ymd_(a.f.fecha) : '', a.motivoConjunto || '', idReunionAgenda_(a.ev), '', uidDe[a.f.fila] || ''];
  })).concat((plan.figuraPorDireccion || []).map(function (x) {
    // la figura de una Seguridad salió de la DIRECCIÓN (07/10): queda registrado, con el barrio de RDV CONJUNTO si difiere
    return [corrida, 'figura_por_direccion', x.f.fila, '', '', x.res.barrioConjunto ? 'barrio RDV CONJUNTO: ' + x.res.barrioConjunto : '',
            x.res.figura + ' (' + x.res.por + ', RDV CONJUNTO fila ' + x.res.filas.join(', ') + ')', '', str(x.f.valores[A.agenda_uid])];
  })).concat(_filasRegistroEleccionesAgenda_(plan, corrida));
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
  // 07/10: el barrio que salió con el eje del mail y que en Comunas es de otro eje: no frenó, se anota.
  (P.notasEje || []).forEach(function (x) {
    Logger.log('    nota del eje | %s %s | %s', fmtFecha_(x.ev.fecha), x.ev.figuraFila || x.ev.tipo || '', x.nota);
  });
  const linea = function (a) {
    const ev = a.ev || {};
    return a.tipo.toUpperCase() + ' | fila ' + (a.fila || (a.f && a.f.fila)) + ' | ' + (ev.fecha ? fmtFecha_(ev.fecha) + ' ' + (ev.hora || '') : '') +
           ' | ' + (ev.figuraFila || (a.f && a.f.figura) || ev.tipo || '') + ' | ' + (ev.lugar || '') +
           (a.detalle ? ' | ' + a.detalle : '') + (a.barrio && a.barrio.barrio ? ' | barrio ' + a.barrio.barrio : '');
  };
  P.acciones.slice(0, 120).forEach(function (a) { Logger.log('    %s', linea(a)); });
  if (P.acciones.length > 120) Logger.log('    … y %s más', P.acciones.length - 120);
  // 15/10 (AGENDA_ELECCIONES_SIEMPRE, AGENDA_CERRAR_CANCELADAS_MAIL): sólo si hay algo
  (P.eleccionesSinFila || []).forEach(function (x) {
    Logger.log('    ELECCIÓN SIN FILA | %s | "%s" (id_fila %s) | %s → %s', _textoReunionAgenda_(x.ev), x.el.texto || x.eleccion, x.el.idFila || '—',
               x.motivo || 'la fila elegida no se encuentra', x.eleccion === 'ya_cargada' ? 'no se crea ni se pregunta' : 'no se crea: se vuelve a preguntar');
  });
  if ((P.eleccionesCerradas || []).length) Logger.log('    elecciones CERRADAS (su reunión ya no se evalúa): %s', P.eleccionesCerradas.length);
  (P.eleccionesCerradas || []).slice(0, 20).forEach(function (x) {
    Logger.log('      %s | "%s" | %s', x.clave, x.el.texto || x.el.eleccion, x.motivo);
  });
  (P.canceladasMail || []).forEach(function (x) {
    Logger.log('    CANCELADA EN EL MAIL | %s | %s | no se crea ni se pregunta%s', _textoReunionAgenda_(x.ev), x.motivo || '—',
               x.candidatas.length || x.previa ? ' (línea cerrada en AGENDA_DUPLICADOS)' : '');
  });
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
  Logger.log('  AGENDA_DUPLICADOS (sólo lo que se decide): antes de crear (NO se crean, se pregunta) %s | una reunión en dos filas (se pregunta) %s ' +
             '(de "después de crear" %s) | ya decididas por el equipo %s | juntadas antes del plan %s | elecciones aplicadas %s | BORRADAS POR EL ' +
             'EQUIPO (no se recrean) %s | "Origen fila" = equipo en %s filas | "Tocado por el equipo" recalculado en %s', s.duplicadosAntes,
             s.dosFilas || 0, s.duplicadosDespues, s.dosFilasDecididas || 0, s.juntadasAntes || 0, s.eleccionesAplicadas,
             s.borradasEquipo, s.origenEquipo, s.tocado);
  if (P.historial && P.historial.error) {
    Logger.log('  >>> el historial de la agenda NO se pudo leer (%s): en la corrida real no se crea nada (%s reuniones).',
               P.historial.error, s.noCreadasSinHistorial);
  }
  P.duplicados.forEach(function (x) {
    if (x.tipo === 'invariante' || x.tipo === 'cancelacion_aplicada') return;   // 15/10: en _logAgendaSegura_
    if (x.tipo === 'cancelada_mail' || x.tipo === 'eleccion_sin_fila') return;   // 15/10: en las líneas de las elecciones (arriba)
    if (x.tipo === 'antes') {
      Logger.log('    DUPLICADO (no se crea) | %s %s | %s | %s → %s', fmtFecha_(x.ev.fecha), x.ev.hora, x.ev.figuraFila || x.ev.tipo,
                 x.ev.lugar, x.candidatas.map(function (c) { return 'fila ' + c.f.fila + ' (' + c.diferencia + ')'; }).join('; '));
    } else if (x.tipo === 'cancelacion') {
      Logger.log('    ¿SE CANCELÓ? (se pregunta) | %s %s | %s | %s → fila %s | %s', fmtFecha_(x.ev.fecha), x.ev.hora,
                 x.ev.figuraFila || x.ev.tipo, x.ev.lugar, x.candidatas[0].f.fila, x.candidatas[0].diferencia);
    } else if (x.tipo === 'dos_filas') {
      // 16/10: "una reunión en dos filas" (H3 o "después de crear"): se pregunta en AGENDA_DUPLICADOS
      Logger.log('    UNA REUNIÓN EN DOS FILAS (se pregunta: quedarse con una, o son distintas) | filas %s y %s | %s | %s%s', x.par.a.fila, x.par.b.fila,
                 x.par.origen === 'despues' ? 'después de crear' : 'H3', x.par.texto,
                 x.par.eval ? (x.par.eval.motivos.length ? ' | no se junta sola: ' + x.par.eval.motivos.join('; ') : ' | las reglas del paso 97 la juntarían (se queda la ' + x.par.eval.vieja.fila + ')') : '');
    }
  });
  (P.dosFilasDecididas || []).forEach(function (d) {
    Logger.log('    YA DECIDIDO POR EL EQUIPO | %s | %s', d.clave, d.tipo === 'distintas' ? 'son reuniones distintas (no se cuenta en "una reunión, una fila")'
               : (d.tipo === 'sobra' ? 'quedarse con la fila ' + d.x.fila + '; la ' + d.y.fila + ' es del equipo: borrarla a mano' : 'quedarse con la fila ' + d.x.fila + '; la ' + d.y.fila + ' todavía no se juntó' + (d.motivo ? ' (' + d.motivo + ')' : '')));
  });
  if (!AGENDA_CANCELACION_AUTOMATICA) {
    Logger.log('  CANCELACIONES (AGENDA_CANCELACION_AUTOMATICA = false): se preguntan %s | "Sigue" (no se tocan) %s',
               s.cancelaciones, s.cancelacionSigue);
  }
  Logger.log('  YA CARGADAS en otra fila (fecha distinta: no se crean, no se pregunta, no se toca la fila): %s', s.yaCargadas);
  P.figuraPorDireccion.forEach(function (x) {
    Logger.log('    FIGURA POR DIRECCIÓN | fila %s | %s | %s → %s (RDV CONJUNTO fila %s, %s)%s', x.f.fila, fmtFecha_(x.f.fecha),
               x.f.barrio || '(sin barrio)', x.res.figura, x.res.filas.join(', '), x.res.por,
               x.res.barrioConjunto ? ' — el barrio de RDV CONJUNTO es "' + x.res.barrioConjunto + '"' : '');
  });
  P.yaCargadas.forEach(function (x) {
    Logger.log('    YA CARGADA | %s %s | %s | %s → fila %s (%s, %s)%s', fmtFecha_(x.ev.fecha), x.ev.hora, x.ev.figuraFila, x.ev.lugar,
               x.f.fila, fmtFecha_(x.f.fecha), x.f.barrio, x.como === 'elegido' ? ' — lo eligió el equipo' : '');
  });
  P.borradasEquipo.forEach(function (x) {
    Logger.log('    BORRADA POR EL EQUIPO (no se recrea) | %s %s | %s | %s', fmtFecha_(x.ev.fecha), x.ev.hora, x.ev.figuraFila || x.ev.tipo, x.ev.lugar);
  });
  _logAgendaSegura_(P);
  if (P.duplicadasEnCorrida.length) {
    Logger.log('  la misma reunión dos veces en esta corrida (se crea UNA): %s', P.duplicadasEnCorrida.length);
    P.duplicadasEnCorrida.forEach(function (x) {
      Logger.log('    DUPLICADA EN LA CORRIDA | %s %s | %s | %s → la fila nueva %s', fmtFecha_(x.ev.fecha), x.ev.hora,
                 x.ev.figuraFila || x.ev.tipo, x.ev.lugar, x.fila);
    });
  }
}

function _escribirSolapasAgenda_(P) {
  // 16/10: la cache de la geocodificación primero y aparte: si una solapa informativa falla, lo que se pidió a Maps no se pierde
  try { _agregarCacheGeocode_(P.geocodeNuevas || []); P.geocodeNuevas = []; }
  catch (err) { Logger.log('[agenda] la cache %s no se pudo escribir: %s (la próxima corrida vuelve a pedir esas direcciones)', AGENDA_SOLAPA_GEOCODE, err); }
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
    // 15/10 (H1) y 16/10: AGENDA_PENDIENTES, lo que el equipo tiene que SABER (pendientes de definir, canceladas en el mail, semanas
    // frenadas, cancelaciones aplicadas, reuniones juntadas, filas que sobran); escribirHoja_ le da el formato
    try { _escribirPendientesAgenda_(P); }
    catch (err) { Logger.log('[agenda] %s no se pudo escribir: %s (la corrida igual terminó)', AGENDA_SOLAPA_PENDIENTES, err); }
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
                    error || '', s.borrar || 0, s.borradasEquipo || 0, (s.duplicadosAntes || 0) + (s.duplicadosDespues || 0),
                    s.yaCargadas || 0]);
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
  // 16/10 (54_FusionAgenda.js): una fusión copió celdas de la REGLA GENERAL en la vieja ("fusionar_general": se vacían, no
  // son columnas de la agenda) y borró la nueva entera ("borrar_fusion": se restaura con todo, también lo que no es de la agenda)
  const otros = cambios.filter(function (c) { return c.col && c.tipo !== 'crear' && c.tipo !== 'fusionar_general'; })
    .map(function (c) { return Object.assign({}, c, { fila: filaActual(c) }); }).filter(function (c) { return c.fila; });
  const generales = cambios.filter(function (c) { return c.col && c.tipo === 'fusionar_general'; })
    .map(function (c) { return Object.assign({}, c, { fila: filaActual(c) }); }).filter(function (c) { return c.fila; });
  const restaurar = cambios.filter(function (c) { return c.tipo === 'borrar' && !cancelados[c.uid] && !filaDeUid[c.uid]; });
  // 16/10: también la que borró una decisión del equipo ("borrar_fusion_equipo", AGENDA_DUPLICADOS "Quedarse con la fila X")
  const restaurarFusion = cambios.filter(function (c) {
    return (c.tipo === 'borrar_fusion' || c.tipo === 'borrar_fusion_equipo') && !cancelados[c.uid] && !filaDeUid[c.uid];
  });
  Logger.log('  filas creadas: %s → se sacan %s | NO se sacan (alguien cargó algo) %s', Object.keys(creadas).length,
             aSacar.length, noSeSacan.length);
  noSeSacan.forEach(function (x) { Logger.log('    fila %s: %s', x.fila, x.motivo); });
  Logger.log('  celdas a volver a lo que había (vinculadas, actualizadas, movidas, suspendidas, reactivadas, figuras): %s', otros.length);
  Logger.log('  filas BORRADAS por la agenda que se restauran (al final): %s', restaurar.length);
  if (generales.length || restaurarFusion.length) {
    Logger.log('  FUSIÓN: celdas de la regla general a vaciar en la fila que quedó %s | filas FUSIONADAS que se restauran (al final, con sus fondos) %s',
               generales.length, restaurarFusion.length);
  }
  if (enSeco) {
    Logger.log('>>> EN SECO: no se deshizo nada.');
    return { corrida: id, sacarian: aSacar.length, noSeSacan: noSeSacan.length, celdas: otros.length, restaurarian: restaurar.length,
             generales: generales.length, restaurarianFusion: restaurarFusion.length };
  }

  // 1. las celdas; 2. las filas creadas; 3. las borradas, de vuelta al final.
  const d = deshacerAgendaLote_(sh, hdr, otros);
  d.saltadas.forEach(function (c) { Logger.log('    no se deshace (alguien la cambió): fila %s, %s', c.fila, hdr[c.col - 1]); });
  if (generales.length) {
    const g = deshacerGeneralesFusion_(sh, generales);
    g.saltadas.forEach(function (c) { Logger.log('    no se vacía (alguien la cambió): fila %s, %s', c.fila, hdr[c.col - 1]); });
    d.hechas = d.hechas.concat(g.hechas);
    d.saltadas = d.saltadas.concat(g.saltadas);
  }
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
  restaurarFusion.forEach(function (c) {
    if (restaurarFilaFusion_(sh, hdr, c, ultimaConDatos() + 1)) restauradas++;
  });
  if (restauradas && DERIVADAS_POR_SCRIPT) {
    try { recalcDerivadas_(RDV_HOJA_DESTINO, true); } catch (err) { Logger.log('    las derivadas no se recalcularon: %s', err); }
  }
  SpreadsheetApp.flush();
  reg.appendRow([id + '-deshacer', new Date(), 'DESHACER ' + id, '', '', '', '', '', '', '', '', '', '', '', '', '',
                 d.hechas.length, JSON.stringify({ filas_borradas: s.borradas, filas_vaciadas: s.vaciadas, filas_restauradas: restauradas }),
                 d.saltadas.length, Date.now() - t0, '', '', '', '', '']);
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
      c.estado, c.cambios != null ? c.cambios : (ev.cambios || ''), c.fechaOriginal || '', x ? (P.ajustarFila ? P.ajustarFila(x.fila) : x.fila) + (x.nueva ? ' (nueva)' : '') : '',
      x ? x.status || '' : '',
      ev.asunto, ev.version + ' de ' + ev.versiones, cuando
    ]);
  });
  out.ids = [null].concat(filas.map(function (c) { return c.ev.mailId || ''; }));
  out.items = filas;   // 09/10: cada reunión, para las vistas nuevas (47_AgendaVistas.js)
  out.semanas = filas.map(function (c) { return { desde: c.ev.desde || null, hasta: c.ev.hasta || null }; });
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
  // 07/10: dos solapas. "Agenda": la semana en curso (y las que vienen); "Agenda cerrada": las que terminaron.
  const pz = partirCopiaAgenda_(matriz, hoyMediodia_());
  _escribirSolapaCopiaAgenda_(ss, AGENDA_COPIA_SOLAPA, pz.abierta);
  _escribirSolapaCopiaAgenda_(ss, AGENDA_COPIA_SOLAPA_CERRADA, pz.cerrada);
  // 09/10: "AgendaCall" y "Agenda (mail)" (47_AgendaVistas.js), con AGENDA_VISTAS_NUEVAS; las de arriba, igual que siempre
  // 15/10: en la corrida de la hora, las vistas y la copia del archivo RDV quedan para el FINAL de la corrida (prioridad 5,
  // con la guarda de tiempo: 49_Corridas.js). En un paso a mano, se escriben acá.
  if (typeof _diferirVistasAgenda_ !== 'undefined' && _diferirVistasAgenda_) {
    _vistasAgendaPendientes_ = { abierta: pz.abierta, P: P };
    return;
  }
  if (AGENDA_VISTAS_NUEVAS) escribirVistasAgenda_(ss, pz.abierta, P);
  // 13/10: la misma "Agenda", también en el archivo RDV (AGENDA_COPIA_EN_RDV). Aislada: si falla, lo de arriba ya quedó.
  if (AGENDA_COPIA_EN_RDV) {
    try { escribirAgendaEnRdv_(pz.abierta); }
    catch (err) { Logger.log('>>> la solapa "%s" del archivo RDV NO se escribió: %s', AGENDA_RDV_SOLAPA, err); }
  }
}

/**
 * La "Agenda" en el archivo RDV (13/10): la misma matriz que la solapa "Agenda" del archivo "Agenda", con el mismo formato y
 * protegida con advertencia. Nunca en la solapa de la base (RDV_HOJA_DESTINO). La primera vez, si la solapa existe y no es
 * del sistema (la armaba el legado), se duplica como AGENDA_RDV_RESPALDO antes de reescribirla.
 */
function escribirAgendaEnRdv_(abierta) {
  if (AGENDA_RDV_SOLAPA === RDV_HOJA_DESTINO) throw new Error('AGENDA_RDV_SOLAPA no puede ser la solapa de la base');
  const ss = SpreadsheetApp.openById(RDV_SS_DESTINO);
  const sh = ss.getSheetByName(AGENDA_RDV_SOLAPA);
  if (sh && !ss.getSheetByName(AGENDA_RDV_RESPALDO)) {
    const delSistema = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)
      .some(function (pr) { return pr.getDescription() === DESC_PROTECCION_COPIA_AGENDA; });
    if (!delSistema) {
      sh.copyTo(ss).setName(AGENDA_RDV_RESPALDO);
      Logger.log('  archivo RDV: lo que había en "%s" (la armaba el legado) quedó guardado en "%s".', AGENDA_RDV_SOLAPA, AGENDA_RDV_RESPALDO);
    }
  }
  _escribirSolapaCopiaAgenda_(ss, AGENDA_RDV_SOLAPA, abierta, 'archivo RDV');
}

/**
 * Parte la copia por semana: las semanas que ya terminaron (hasta < hoy) van a la cerrada, **la más nueva primero** (y
 * dentro de cada semana, por fecha y hora); el resto —la semana en curso y las que vienen— a la abierta.
 */
function partirCopiaAgenda_(matriz, hoy) {
  const hdr = matriz[0], ab = [], ce = [];
  for (let i = 1; i < matriz.length; i++) {
    const sem = (matriz.semanas || [])[i - 1] || {};
    const x = { fila: matriz[i], id: (matriz.ids || [])[i] || '', enCurso: !!(matriz.semanaEnCurso || [])[i - 1], desde: sem.desde, orden: i,
                item: (matriz.items || [])[i - 1] || null };
    (sem.hasta && ymd_(sem.hasta) < ymd_(hoy) ? ce : ab).push(x);
  }
  ce.sort(function (a, b) { return (b.desde ? b.desde.getTime() : 0) - (a.desde ? a.desde.getTime() : 0) || a.orden - b.orden; });
  const armar = function (lista) {
    const m = [hdr].concat(lista.map(function (x) { return x.fila; }));
    m.ids = [null].concat(lista.map(function (x) { return x.id; }));
    m.semanaEnCurso = lista.map(function (x) { return x.enCurso; });
    m.items = lista.map(function (x) { return x.item; });
    return m;
  };
  return { abierta: armar(ab), cerrada: armar(ce) };
}

/** Una solapa de la copia: reescrita entera, con formato y protegida con advertencia. */
function _escribirSolapaCopiaAgenda_(ss, nombre, matriz, dondeLog) {
  // 16/10 (VISTAS_AGENDA_SOLO_SI_CAMBIA, 49_Aceleraciones.js): sin cambios desde la última escritura, sólo "Última actualización"
  const claveH = (dondeLog ? 'RDV' : 'AGENDA') + '|' + nombre;
  const hz = typeof copiaAgendaSinCambios_ === 'function' ? copiaAgendaSinCambios_(ss.getSheetByName(nombre), claveH, matriz) : null;
  if (hz && hz.saltear) return;
  const sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre, ss.getSheets().length);   // 15/10: al final (no corre ninguna otra)
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
  if (hz) huellaGuardar_(claveH, hz.huella, sh);
  Logger.log('  copia en el %s: %s filas escritas, solapa "%s", protegida con advertencia.',
             dondeLog || 'archivo "Agenda" (' + AGENDA_COPIA_SS.slice(0, 8) + '…)', n - 1, nombre);
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
  'saltadas_al_escribir', 'ms', 'error', 'borradas', 'borradas_equipo', 'duplicados', 'ya_cargadas'];
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
                  (s.duplicadosAntes || 0) + (s.duplicadosDespues || 0), s.yaCargadas || 0]);
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
  // 15/10 (noche): `suspendidasRojo`: los agenda_uid que el sistema suspendió por el ROJO del mail (líneas "suspendida_rojo");
  // `eleccionesRegistradas`: las elecciones ya anotadas en el registro (AGENDA_ELECCIONES_SIEMPRE: una sola vez)
  const h = { creadas: new Map(), olvidadas: new Set(), notadas: new Set(), yaCargadas: new Set(), eleccionesRegistradas: new Set(),
              suspendidasRojo: new Set(), suspendidasConjunto: new Set(), suspendidasConjuntoFecha: new Map(),
              creacionPorUid: new Map(), error: '' };   // 16/10: agenda_uid → { corrida, id } de su "crear_id" (qué fila es la vieja de un par)
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
    const borradasSistema = [], cancelados = new Set();
    cam.getRange(2, 1, cam.getLastRow() - 1, Math.max(9, cam.getLastColumn())).getValues().forEach(function (r) {
      const corrida = str(r[0]), tipo = str(r[1]), uid = str(r[8]);
      if (deshechas[corrida]) return;
      if (tipo === 'ya_cargada') { h.yaCargadas.add(str(r[6]) + '|' + num(r[2])); return; }
      // 15/10 (AGENDA_ELECCIONES_SIEMPRE, AGENDA_CERRAR_CANCELADAS_MAIL): lo anotado una sola vez (tipo | id_reunion | elección)
      if (/^eleccion_|^cancelada_mail$/.test(tipo)) { h.eleccionesRegistradas.add(tipo + '|' + str(r[6]) + '|' + str(r[4])); return; }
      if (!uid) return;
      if (tipo === 'crear_id') {
        h.creadas.set(uid, str(r[6]));
        const ya = h.creacionPorUid.get(uid);
        if (!ya || corrida < ya.corrida) h.creacionPorUid.set(uid, { corrida: corrida, id: str(r[6]) });
      }
      else if (esBorradaPorSistemaAgenda_(tipo)) borradasSistema.push(corrida + '|' + uid);   // 16/10: también la fusión (54_FusionAgenda.js)
      else if (tipo === 'borrar_cancelado') cancelados.add(corrida + '|' + uid);
      else if (tipo === 'olvidar_borrada') h.olvidadas.add(uid);
      else if (tipo === 'borrada_por_equipo') h.notadas.add(uid);
      else if (tipo === 'suspendida_rojo') h.suspendidasRojo.add(uid);
      else if (tipo === 'suspendida_conjunto') { h.suspendidasConjunto.add(uid); h.suspendidasConjuntoFecha.set(uid, str(r[4])); }   // 16/10
    });
    // 16/10 (revisor): un borrado que se CANCELÓ en la misma corrida ("borrar_cancelado": la fila quedó) no es un borrado del
    // sistema: si después la borra el equipo, se reconoce como "borrada por el equipo" (y la agenda no la recrea)
    borradasSistema.forEach(function (k) { if (!cancelados.has(k)) h.creadas.delete(k.slice(k.indexOf('|') + 1)); });
  } catch (err) {
    h.error = String(err);
    Logger.log('[agenda] el historial de la agenda no se pudo leer: %s', err);
  }
  return h;
}

/**
 * ¿La línea de REGISTRO_AGENDA_CAMBIOS dice que la fila la borró el SISTEMA? La regla 7 ("borrar") y, desde el 16/10, la fusión
 * de un par "una reunión en dos filas" ("borrar_fusion" / "fusionada_sistema", 54_FusionAgenda.js). Una fila así no es
 * "borrada por el equipo": la reunión no queda bloqueada. (16/10: la que se borró porque el EQUIPO eligió "Quedarse con la fila X"
 * en AGENDA_DUPLICADOS —"borrar_fusion_equipo" / "fusionada_equipo"— NO es del sistema: cuenta como borrada por el equipo y la
 * agenda no la recrea mientras la reunión siga en el mail.)
 */
function esBorradaPorSistemaAgenda_(tipo) {
  return tipo === 'borrar' || tipo === 'borrar_fusion' || tipo === 'fusionada_sistema';
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
 *
 * 15/10 (AGENDA_ELECCIONES_SIEMPRE, o `opcionesLectura.siempre`): una línea de la solapa que trae la elección YA GUARDADA para
 * esa reunión (la pre-carga el sistema al regenerar) no cuenta como nueva, comparada contra lo guardado y no contra lo que ya se
 * leyó de la solapa: así una línea pre-cargada de OTRA candidata no pisa la elección nueva (con el código de antes, la que
 * venía más abajo ganaba). Entre dos elecciones nuevas de la misma reunión, una decisión le gana a "No sé".
 * Además (siempre, sólo informativo): `m.leidas` (cada elección leída, con su origen) y `m.idsEnSolapa` (los id_reunion de
 * todas las líneas de la solapa). Sólo lectura.
 */
function leerEleccionesAgenda_(opcionesLectura) {
  const siempre = opcionesLectura && opcionesLectura.siempre !== undefined ? !!opcionesLectura.siempre : AGENDA_ELECCIONES_SIEMPRE;
  const m = new Map();
  m.leidas = []; m.idsEnSolapa = new Set();
  const tomar = function (id, eleccion, idFila, comentario, nueva, origen) {
    const el = clasificarEleccionAgenda_(eleccion);
    m.leidas.push({ origen: origen || '', id: id, idFila: idFila, texto: eleccion, eleccion: el, comentario: comentario || '', tomada: !!(id && el) });
    if (!id || !el) return;
    m.set(id, { eleccion: el, idFila: idFila, comentario: comentario || '', nueva: !!nueva, texto: eleccion, origen: origen || '' });
  };
  try {
    const sh = registrosAgenda_().getSheetByName(RDV_HOJA_ELECCIONES_AGENDA);
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, ENC_ELECCIONES_AGENDA_.length).getValues().forEach(function (r, k) {
        tomar(str(r[1]), str(r[3]), str(r[2]), str(r[4]), false, RDV_HOJA_ELECCIONES_AGENDA + ' fila ' + (k + 2));
      });
    }
  } catch (err) { Logger.log('[agenda] ELECCIONES_AGENDA no se pudo leer: %s', err); }
  const guardadas = new Map(m);     // lo guardado, antes de leer la solapa
  const nuevasSolapa = [];
  try {
    const sh = ssDestino_().getSheetByName(AGENDA_SOLAPA_DUPLICADOS);
    if (sh && sh.getLastRow() > 1) {
      const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
      const hdr = v[0].map(normalizeHeader_);
      const i = function (n) { return hdr.indexOf(normalizeHeader_(n)); };
      v.slice(1).forEach(function (r, k) {
        const id = str(r[i('id_reunion')]), texto = str(r[i('ELEGIR')]);
        // 16/10: en la línea de un par ("una reunión en dos filas"), "Quedarse con la fila N" se traduce a la IDENTIDAD de esa fila
        // con el mapa de la columna oculta (el número sólo vale para esa línea); "Son reuniones distintas", sin fila
        const idFila = esIdEleccionParAgenda_(id) ? idFilaDeOpcionParAgenda_(texto, str(r[i('id_fila')])) : str(r[i('id_fila')]);
        const origen = AGENDA_SOLAPA_DUPLICADOS + ' fila ' + (k + 2);
        if (id) m.idsEnSolapa.add(id);
        if (esVacio_(r[i('ELEGIR')])) return;
        const ya = (siempre ? guardadas : m).get(id);
        if (ya && ya.idFila === idFila && normalizeText_(ya.texto) === normalizeText_(texto)) {
          m.leidas.push({ origen: origen, id: id, idFila: idFila, texto: texto, eleccion: clasificarEleccionAgenda_(texto), comentario: str(r[i('COMENTARIO')]),
                          tomada: false, precargada: true });
          return;
        }
        if (siempre) nuevasSolapa.push({ id: id, texto: texto, idFila: idFila, comentario: str(r[i('COMENTARIO')]), origen: origen });
        else tomar(id, texto, idFila, str(r[i('COMENTARIO')]), true, origen);
      });
    }
  } catch (err) { Logger.log('[agenda] %s no se pudo leer: %s', AGENDA_SOLAPA_DUPLICADOS, err); }
  if (siempre) {
    const porId = {};
    nuevasSolapa.forEach(function (x) {
      const prev = porId[x.id];
      if (!prev || clasificarEleccionAgenda_(prev.texto) === 'no_se' || clasificarEleccionAgenda_(x.texto) !== 'no_se') porId[x.id] = x;
    });
    nuevasSolapa.forEach(function (x) {
      if (porId[x.id] === x) tomar(x.id, x.texto, x.idFila, x.comentario, true, x.origen);
      else m.leidas.push({ origen: x.origen, id: x.id, idFila: x.idFila, texto: x.texto, eleccion: clasificarEleccionAgenda_(x.texto),
                           comentario: x.comentario, tomada: false, otraLinea: true });
    });
  }
  return m;
}

/** El texto de ELEGIR, en su código: 'ya_cargada' | 'vincular' | 'crear' | 'cancelar' | 'sigue' | 'no_se' ('' si no se reconoce).
 *  16/10, un par "una reunión en dos filas": 'quedarse' ("Quedarse con la fila N") | 'distintas' ("Son reuniones distintas"). */
function clasificarEleccionAgenda_(eleccion) {
  const e = normalizeText_(eleccion);
  if (/^quedarse con la fila/.test(e)) return 'quedarse';
  if (/^aplicada: juntada/.test(e)) return 'consumida';   // 16/10 (revisor): la marca de una decisión de un par ya aplicada (una vez)
  if (/reuniones distintas/.test(e)) return 'distintas';
  return /cargada|otra fila/.test(e) ? 'ya_cargada' : /vincular|es la misma/.test(e) ? 'vincular' : (/crear|distintas/.test(e) ? 'crear' :
         (/cancel/.test(e) ? 'cancelar' : (/^sigue/.test(e) ? 'sigue' : (/no s/.test(e) ? 'no_se' : ''))));
}

/** La "base" de un id_reunion (o de "cancelacion|…"): sin la hora (el último tramo). '' si no tiene. */
function baseIdReunionAgenda_(id) {
  const k = String(id == null ? '' : id), i = k.lastIndexOf('|');
  return i > 0 ? k.slice(0, i) : '';
}

/**
 * **La elección de una reunión, tolerante al corrimiento del id** (15/10, AGENDA_ELECCIONES_SIEMPRE). El id_reunion es figura (o
 * lugar) + fecha + HORA: si la hora cambió (un "Actualizo:", o la versión de otro grupo que pasó a ser la más nueva), el id
 * cambia y la elección se perdía. Regla: la elección con el MISMO id; si no hay, la ÚNICA elección con la misma base (figura o
 * lugar + fecha), y sólo si el mail trae UNA sola reunión con esa base (`cuentaDeBase(base)` === 1). Devuelve una copia con
 * `clave` (la del Map) y `porBase`, o null.
 */
function eleccionDeReunionAgenda_(elecciones, id, cuentaDeBase) {
  const exacta = elecciones.get(id);
  if (exacta) return Object.assign({}, exacta, { clave: id, porBase: false });
  const base = baseIdReunionAgenda_(id);
  if (!base || !cuentaDeBase || cuentaDeBase(base) !== 1) return null;
  let hallada = null, n = 0;
  elecciones.forEach(function (el, k) { if (k !== id && baseIdReunionAgenda_(k) === base) { hallada = { k: k, el: el }; n++; } });
  if (n !== 1) return null;
  return Object.assign({}, hallada.el, { clave: hallada.k, porBase: true });
}

/**
 * **La fila elegida, tolerante al corrimiento** (15/10, AGENDA_ELECCIONES_SIEMPRE). El id_fila es figura + fecha + barrio: si el
 * equipo completó o corrigió el Barrio, cambia. Regla: la ÚNICA fila con el mismo id_fila; si no hay, la ÚNICA fila de esa figura
 * (no vacía) esa fecha cuyo barrio está vacío, o la elección no tenía barrio, o es de la MISMA COMUNA que el elegido (una figura no
 * tiene dos reuniones el mismo día, CLAUDE.md 1.a; la comuna evita tomar otra fila de la figura ese día si la elegida se borró).
 * `{ f, como, motivo, filas }`.
 */
function filaDeEleccionAgenda_(filas, idFila) {
  const id = String(idFila == null ? '' : idFila);
  if (!id) return { f: null, como: '', motivo: 'la elección no nombra ninguna fila', filas: [] };
  const exactas = filas.filter(function (f) { return idFilaAgenda_(f) === id; });
  if (exactas.length === 1) return { f: exactas[0], como: 'exacta', motivo: '', filas: exactas };
  if (exactas.length > 1) return { f: null, como: '', motivo: exactas.length + ' filas con esa misma identidad', filas: exactas };
  const p = id.split('|');
  if (p.length < 3 || !p[0]) return { f: null, como: '', motivo: 'ninguna fila con esa identidad (' + id + ')', filas: [] };
  const fyf = p[0] + '|' + p[1];
  // el barrio pudo cambiar, pero no a otra comuna: sin barrio (en la elección o en la fila), o en la misma comuna
  const vale = function (c) { return c !== '' && c != null; };
  const comunaElegida = p[2] ? _comunaBarrioAg_(p[2]) : null;
  const compatible = function (f) {
    if (!p[2] || !f.barrio) return true;
    const c = _comunaBarrioAg_(f.barrio);
    return vale(c) && vale(comunaElegida) && String(c) === String(comunaElegida);
  };
  const parecidas = filas.filter(function (f) { const q = idFilaAgenda_(f).split('|'); return q[0] + '|' + q[1] === fyf && compatible(f); });
  if (parecidas.length === 1) {
    return { f: parecidas[0], como: 'por figura y fecha (el barrio cambió: ' + (p[2] || 'vacío') + ' → ' + (normalizeText_(parecidas[0].barrio) || 'vacío') + ')',
             motivo: '', filas: parecidas };
  }
  return { f: null, como: '', filas: parecidas,
           motivo: parecidas.length > 1 ? parecidas.length + ' filas de esa figura ese día en esa comuna, ninguna con el barrio elegido' :
                   'ninguna fila de esa figura ese día en esa comuna (se borró, o le cambiaron la figura, la fecha o el barrio a otra comuna)' };
}

/** Por qué el plan no miró una elección (15/10): su reunión salió del mail, del alcance, o la pregunta ya no corresponde. */
function motivoEleccionNoUsadaAgenda_(clave, r, alcance) {
  if (esIdEleccionParAgenda_(clave)) return 'el par ya no está en la base (se juntó, se borró una de las dos filas o dejó de ser "una reunión en dos filas")';
  const esCanc = /^cancelacion\|/.test(clave);
  const id = String(clave).replace(/^cancelacion\|/, '');
  const todas = r.unicas.concat(r.desaparecidas);
  const ev = todas.filter(function (e) { return idReunionAgenda_(e) === id; })[0] ||
             todas.filter(function (e) { return baseIdReunionAgenda_(idReunionAgenda_(e)) === baseIdReunionAgenda_(id); })[0];
  if (!ev) return 'la reunión ya no está en el mail';
  const idHoy = idReunionAgenda_(ev);
  const cambio = idHoy !== id ? ' (hoy su id es ' + idHoy + ')' : '';
  if (!_enAlcance_(alcance, ev.fecha)) return 'la reunión está fuera del alcance (' + fmtFecha_(ev.fecha) + ')' + cambio;
  if (esCanc && r.unicas.indexOf(ev) >= 0) return 'la reunión volvió al mail: la pregunta de cancelación ya no corresponde' + cambio;
  if (esCanc) return 'la pregunta de cancelación ya no corresponde (la fila ya no está "en agenda", o no se encuentra)' + cambio;
  return 'la reunión no se evaluó con ese id' + cambio;
}

/**
 * Las líneas de REGISTRO_AGENDA_CAMBIOS de las elecciones (15/10): "eleccion_aplicada", "eleccion_sin_fila", "eleccion_cerrada"
 * (con AGENDA_ELECCIONES_SIEMPRE) y "cancelada_mail" (AGENDA_CERRAR_CANCELADAS_MAIL). UNA vez por tipo + id_reunion + elección
 * (el historial dice cuáles ya están): no en cada corrida de cada hora. Sin columna (`col` vacía): deshacer no las toca.
 * Formato: corrida | tipo | fila | (vacío) | elección | qué pasó | id_reunion | (vacío) | (vacío).
 */
function _filasRegistroEleccionesAgenda_(P, corrida) {
  const ya = (P.historial && P.historial.eleccionesRegistradas) || new Set();
  const out = [], vistos = new Set();
  const una = function (tipo, fila, eleccion, texto, id) {
    const k = tipo + '|' + id + '|' + eleccion;
    if (ya.has(k) || vistos.has(k)) return;
    if (tipo === 'eleccion_cerrada' && (ya.has('eleccion_aplicada|' + id + '|' + eleccion) || vistos.has('eleccion_aplicada|' + id + '|' + eleccion))) return;
    vistos.add(k);
    out.push([corrida, tipo, fila || '', '', eleccion, texto, id, '', '']);
  };
  const textoEl = function (el, eleccion) { return '"' + ((el && el.texto) || eleccion) + '"' + (el && el.idFila ? ' (id_fila ' + el.idFila + ')' : ''); };
  if (P.modos && P.modos.eleccionesSiempre) {
    (P.eleccionesUsadas || []).concat(P.eleccionesAplicadas || []).forEach(function (x) {   // las "usadas" traen cómo se encontró la fila
      const el = x.el || (P.elecciones && P.elecciones.get ? P.elecciones.get(x.id) : null);
      const fila = x.fila || (x.f && x.f.fila) || '';
      una('eleccion_aplicada', fila, x.eleccion, 'elección ' + textoEl(el, x.eleccion) + ' aplicada' + (fila ? ' en la fila ' + fila : '') +
          (x.como && x.como !== 'exacta' ? ' (' + x.como + ')' : ''), x.id);
    });
    (P.eleccionesSinFila || []).forEach(function (x) {
      una('eleccion_sin_fila', '', x.eleccion, 'elección ' + textoEl(x.el, x.eleccion) + ': ' + (x.motivo || 'la fila elegida no se encuentra') +
          (x.eleccion === 'ya_cargada' ? ' → no se crea ni se pregunta' : ' → no se crea; se vuelve a preguntar'), x.id);
    });
    // 16/10 (revisor): "Quedarse con la fila X" que todavía no se aplicó (la otra es del equipo: borrarla a mano; o no se pudo juntar)
    (P.eleccionesAMano || []).forEach(function (x) {
      una('eleccion_a_mano', x.y.fila, x.eleccion, 'elección ' + textoEl(x.el, x.eleccion) + ': ' + (x.delEquipo ? 'la fila ' + x.y.fila +
          ' es del equipo: no se borra, borrarla a mano' : 'la fila ' + x.y.fila + ' todavía no se juntó' + (x.motivo ? ' (' + x.motivo + ')' : '')), x.id);
    });
    (P.eleccionesCerradas || []).forEach(function (x) {
      una('eleccion_cerrada', '', x.el.eleccion, 'elección ' + textoEl(x.el, x.el.eleccion) + ' cerrada: ' + x.motivo, x.clave);
    });
  }
  (P.canceladasMail || []).forEach(function (x) {
    una('cancelada_mail', '', x.eleccion ? x.eleccion.eleccion : '', 'cancelada en el mail: no se crea' + (x.motivo ? ' (' + x.motivo + ')' : '') +
        (x.eleccion ? '; había una elección: "' + x.eleccion.texto + '"' : ''), x.id);
  });
  return out;
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

/**
 * **Una decisión "Quedarse con la fila X" se aplica UNA vez** (16/10, revisor). Después de juntar el par, se agrega a
 * ELECCIONES_AGENDA una línea "aplicada: juntada …" con el mismo id_reunion (código 'consumida'), que vale más que la decisión
 * (es la más nueva) y que deshacer (paso 38) no toca: si un deshacer devuelve la fila borrada, el par vuelve a AGENDA_DUPLICADOS con
 * ELEGIR vacío (el equipo puede elegir de nuevo, o cambiar de idea) y la corrida siguiente NO lo vuelve a juntar. En el Map de las
 * elecciones de esta corrida la decisión queda reemplazada (así `_guardarEleccionesAgenda_` no la guarda después de la marca).
 * `decididas`: las de `fusionAntesDelPlanAgenda_` ({ clave, vieja, corrida, idFilaElegida }). Devuelve cuántas marcó.
 */
function consumirEleccionesParAgenda_(elecciones, decididas) {
  const filas = decididas.map(function (x) {
    return [new Date(), idEleccionParAgenda_(x.clave), x.idFilaElegida || '', 'aplicada: juntada en la fila ' + x.vieja.fila + ' (corrida ' + x.corrida +
            '); si el par vuelve a aparecer, elegir de nuevo', '', '', ''];
  });
  if (!filas.length) return 0;
  filas.forEach(function (r) {
    if (elecciones && elecciones.set) elecciones.set(r[1], { eleccion: 'consumida', idFila: r[2], comentario: '', nueva: false, texto: r[3], origen: 'consumida' });
  });
  try {
    _conReintentosAgenda_(RDV_HOJA_ELECCIONES_AGENDA, function () {
      const ss = registrosAgenda_();
      let sh = ss.getSheetByName(RDV_HOJA_ELECCIONES_AGENDA);
      if (!sh) { sh = ss.insertSheet(RDV_HOJA_ELECCIONES_AGENDA); sh.appendRow(ENC_ELECCIONES_AGENDA_); }
      sh.getRange(sh.getLastRow() + 1, 1, filas.length, ENC_ELECCIONES_AGENDA_.length).setValues(filas);
      SpreadsheetApp.flush();
    });
  } catch (err) {
    Logger.log('>>> %s: la marca "aplicada" de %s decisiones NO se guardó (%s): si se deshace la fusión, la decisión guardada podría volver a aplicarse',
               RDV_HOJA_ELECCIONES_AGENDA, filas.length, err);
  }
  return filas.length;
}

const ENC_DUPLICADOS_AGENDA_ = ['ELEGIR', 'COMENTARIO', 'resultado', 'tipo', 'reunión del mail', 'fila candidata', 'figura (fila)',
  'fecha (fila)', 'hora (fila)', 'barrio (fila)', 'STATUS (fila)', 'Origen fila', 'diferencia', 'qué hacer', 'id_reunion', 'id_fila'];

/**
 * **AGENDA_DUPLICADOS** en el archivo del destino (corrida real): SÓLO lo que el equipo tiene que decidir (16/10). "Antes de
 * crear", "cancelación" y "la fila elegida ya no está": una línea por fila candidata; "una reunión en dos filas" (H3 y
 * "después de crear"): una línea por PAR, con ELEGIR "Quedarse con la fila X" / "… Y" / "Son reuniones distintas". ELEGIR
 * (desplegable) y COMENTARIO adelante, en amarillo, únicas celdas editables. La identidad va en columnas ocultas (id_reunion,
 * id_fila; en un par, "X=identidad # Y=identidad"). Lo informativo (la cancelada en el mail, la cancelación aplicada, la semana
 * frenada) no se dibuja: va a AGENDA_PENDIENTES (`infoAgenda_`).
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
    // 16/10 (decisión del usuario): AGENDA_DUPLICADOS es SÓLO lo que el equipo tiene que decidir. Lo informativo —la cancelada en el
    // mail, la cancelación aplicada— va a AGENDA_PENDIENTES (intermedia), al resumen del lunes y al aviso diario.
    if (x.tipo === 'cancelada_mail' || x.tipo === 'cancelacion_aplicada' || x.tipo === 'invariante' || x.tipo === 'despues') return;
    // 16/10: "una reunión en dos filas" (H3 o "después de crear"): UNA línea por par, con ELEGIR "Quedarse con la fila X" / "… Y" /
    // "Son reuniones distintas"; la identidad de cada fila (agenda_uid, o figura + fecha + barrio), en las columnas ocultas
    if (x.tipo === 'dos_filas') {
      const par = x.par, a = par.a, b = par.b, ev = par.eval;
      const v = function (f, n) { return P.A[n] == null ? '' : f.valores[P.A[n]]; };
      const dos = function (fn) { const s1 = fn(a), s2 = fn(b); return s1 === s2 ? s1 : s1 + ' / ' + s2; };
      const puede = ev && !ev.motivos.length;
      const que = (par.origen === 'despues' ? 'Una fila de la agenda y una del equipo parecen la misma reunión. '
                   : 'La misma reunión está en dos filas: en esa semana la agenda no crea nada más hasta que se decida. ') +
        '"Quedarse con la fila N": el sistema completa la fila N con lo de la otra (sólo lo vacío; lo que ustedes cargaron en la N no se ' +
        'toca) y borra la otra, si la creó la agenda (queda guardada y se puede deshacer); si la otra la cargaron ustedes, no la borra: queda ' +
        'en AGENDA_PENDIENTES para borrarla a mano. Lo distinto de la otra fila se descarta sólo si lo escribió el sistema: si tiene datos ' +
        'cargados por ustedes distintos de la N (un STATUS, asistentes, inscriptos, un ID…), no se borra y queda en AGENDA_PENDIENTES para ' +
        'resolver a mano. "Son reuniones distintas": no se vuelve a preguntar. ' +
        (puede ? 'Sugerencia: quedarse con la fila ' + ev.vieja.fila + ' (' + ev.regla + ')' +
                 (AGENDA_FUSION_AUTOMATICA ? '.' : '; con la fusión automática prendida, el sistema la juntaría solo.')
               : (ev && ev.motivos.length ? 'El sistema no las junta solo: ' + ev.motivos.join('; ') + '.' : ''));
      filas.push(['', '', 'no se juntó sola: elegir' + (par.fallo ? ' (no se pudo juntar: ' + par.fallo + ')' : ''), 'una reunión en dos filas', par.texto,
                  'filas ' + a.fila + ' y ' + b.fila, dos(function (f) { return f.figura || '(sin figura)'; }), dos(function (f) { return f.fecha ? fmtFecha_(f.fecha) : ''; }),
                  dos(function (f) { return valorAgendaComparable_(v(f, 'HORA'), 'HORA'); }), dos(function (f) { return f.barrio || ''; }),
                  dos(function (f) { return str(v(f, 'STATUS REUNIÓN')); }), dos(function (f) { return str(v(f, 'Origen fila')) || ORIGEN_EQUIPO; }),
                  par.diferencia, que, par.id, mapaOpcionesParAgenda_(par, P.A)]);
      editables.push({ fila: filas.length, opciones: opcionesParAgenda_(par) });
      return;
    }
    // 15/10 (AGENDA_ELECCIONES_SIEMPRE): "Es la misma: vincular" con la fila elegida que ya no está: no se crea, se vuelve a
    // preguntar diciéndolo
    if (x.tipo === 'eleccion_sin_fila') {
      (x.candidatas.length ? x.candidatas : [null]).forEach(function (c) {
        const datosFila = c ? dato(c) : ['', '', '', '', '', '', '', ''];
        filas.push(['', x.eleccion ? x.eleccion.comentario : '', 'la fila elegida (' + (x.eleccion && x.eleccion.idFila || '—') + ') ya no está: ' +
                    (x.motivo || '') + '. No se creó: elegir de nuevo', 'antes de crear', reunionTexto(x.ev)].concat(datosFila,
                    ['Se había elegido "' + (x.eleccion ? x.eleccion.texto : '') + '" y esa fila ya no se encuentra. "Son distintas": la crea. ' +
                     '"Ya está cargada en otra fila": no crea nada.', x.id, '']));
        editables.push({ fila: filas.length, opciones: AGENDA_OPCIONES_DUPLICADO });
      });
      return;
    }
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
                    'antes de crear', reunionTexto(x.ev)].concat(dato(c), [(x.candidatas.length > 1 ? 'Hay ' + x.candidatas.length + ' filas posibles: elegir en la línea de la que corresponde. ' : '') +
                    '"Es la misma": la agenda usa esa fila. "Ya está cargada en otra fila": no crea ni toca nada. "Son distintas": la crea.',
                    x.id, idFilaAgenda_(c.f)]));
        editables.push({ fila: filas.length, opciones: AGENDA_OPCIONES_DUPLICADO });
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
  // 15/10: el formato para leer (51_FormatoLectura.js): ajustado, anchos según el contenido ("reunión del mail" ancha)
  if (typeof llevaFormatoLectura_ === 'function' && llevaFormatoLectura_(AGENDA_SOLAPA_DUPLICADOS)) formatoLectura_(sh, filas);
  else { try { sh.autoResizeColumns(1, ancho - 2); } catch (e) { /* no importa */ } }
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
    // 07/10: si la protección es (o quedó) de ADVERTENCIA, addEditor falla ("… isWarningOnly"): primero se le saca.
    if (pr.isWarningOnly()) pr.setWarningOnly(false);
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

// ===================== "Ya cargada en otra fila" (07/10, regla del usuario) =====================

/**
 * **¿La reunión ya está cargada en otra fila, con otra fecha?** (07/10, regla del usuario, caso Macri 01/10 ↔ fila 805):
 * misma figura + mismo barrio, a ±AGENDA_DUP_DIAS días, con otra fecha. Si el mail que la trae es ANTERIOR a la fecha de
 * esa fila, es la MISMA reunión que se adelantó o atrasó (`fila`); si es posterior, son reuniones distintas
 * (`posteriores`: se pregunta como un casi duplicado). Con dos o más filas anteriores, ninguna (se pregunta).
 * La usan el plan y la medición (paso 44).
 */
function yaCargadaAgenda_(ev, filas, barrio) {
  const out = { fila: null, anteriores: [], posteriores: [] };
  if (!ev.figuraFila || !ev.fecha || !barrio || !ev.mailFecha) return out;
  const b = normalizeText_(_canonBarrioAg_(barrio) || barrio), fig = normalizeText_(ev.figuraFila);
  // 07/10, UBICACION_TRES_NIVELES: la misma comparación que el resto, y en el nivel BARRIO (la regla del usuario es
  // "mismo barrio": dos reuniones de una figura en la misma comuna a dos días pueden ser distintas).
  const uEv = usarUbicacion3_() ? _ubicDeBarrio_(barrio) : null;
  filas.forEach(function (f) {
    if (!f.fecha || !f.figura || !f.barrio || normalizeText_(f.figura) !== fig) return;
    if (ymd_(f.fecha) === ymd_(ev.fecha) || Math.abs(diasEntre_(f.fecha, ev.fecha)) > AGENDA_DUP_DIAS) return;
    if (uEv) {
      const k = compararUbicacion_(uEv, ubicacionDeFila_(f));
      if (!(k.nivel === 'barrio' && k.coincide)) return;
    } else if (normalizeText_(_canonBarrioAg_(f.barrio) || f.barrio) !== b) return;
    (ymd_(ev.mailFecha) < ymd_(f.fecha) ? out.anteriores : out.posteriores).push(f);
  });
  if (out.anteriores.length === 1) out.fila = out.anteriores[0];
  return out;
}

/** Anota una reunión "ya cargada en la fila N (fecha distinta)": no se crea, no se pregunta y la fila no se toca. */
function _yaCargada_(P, ev, id, f, como, val) {
  P.yaCargadas.push({ ev: ev, id: id, f: f, como: como });
  P.filaDe.set(ev.clave, { fila: f.fila, status: val(f, 'STATUS REUNIÓN'), f: f, yaCargada: true });
}

// ===================== 15/10 (noche): la AGENDA SEGURA — una reunión, una fila (H1-H4) y la cancelación que suspende (J) =====================

/**
 * 16/10 (revisor): ¿la fila la suspendió un "Cancelado" de RDV CONJUNTO ("suspendida_conjunto") y sigue en la FECHA con que se la
 * suspendió? Si la agenda la movió a otra fecha (una reprogramación), el bloqueo ya no vale. Sin fecha anotada (líneas de antes),
 * vale el bloqueo.
 */
function _bloqueoConjuntoAgenda_(h, uid, fecha) {
  if (!h || !h.suspendidasConjunto || !uid || !h.suspendidasConjunto.has(uid)) return false;
  const y = h.suspendidasConjuntoFecha ? h.suspendidasConjuntoFecha.get(uid) : '';
  return !y || !fecha || y === ymd_(fecha);
}

/** El lunes (yyyyMMdd) de la semana de una fecha: la semana de los mails de agenda (lunes a domingo). */
function lunesYmdAgenda_(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7), 12, 0, 0);
  return ymd_(x);
}

/**
 * **La clave de "la misma reunión" de una fila** (H3): fecha + figura; o, en una reunión SIN figura en el mail (Seguridad en tu
 * Barrio: "Evento (mail)" de ese tipo y una Figura vacía o que el mail no nombra —la completó RDV CONJUNTO—), fecha + tipo +
 * "Lugar (mail)". '' si no hay con qué (sin fecha, o sin figura ni lugar del mail).
 */
function claveInvarianteFila_(f, A) {
  if (!f || !f.fecha) return '';
  const v = function (n) { return A[n] == null ? '' : f.valores[A[n]]; };
  const evMail = str(v('Evento (mail)')), lugar = str(v('Lugar (mail)'));
  const tipo = tipoAgendaDeTexto_(evMail);
  const sinFiguraEnMail = !f.figura || (tipo === 'Seguridad en tu Barrio' && normalizeText_(evMail).indexOf(normalizeText_(f.figura)) < 0);
  if (sinFiguraEnMail && (tipo || lugar) && evMail) {
    return lugar ? 'seg|' + ymd_(f.fecha) + '|' + normalizeText_(tipo) + '|' + normalizeText_(lugar) : '';
  }
  return f.figura ? 'fig|' + ymd_(f.fecha) + '|' + normalizeText_(f.figura) : '';
}

/** La misma clave, de una reunión del mail. */
function claveInvarianteEvento_(ev) {
  if (!ev || !ev.fecha) return '';
  if (!ev.figuraFila) return ev.lugar ? 'seg|' + ymd_(ev.fecha) + '|' + normalizeText_(ev.tipo) + '|' + normalizeText_(ev.lugar) : '';
  return 'fig|' + ymd_(ev.fecha) + '|' + normalizeText_(ev.figuraFila);
}

/**
 * **El invariante "una reunión, una fila"** (H3, 15/10; lo usan el plan y el paso 16). Las filas VIVAS (STATUS vacío, "en
 * agenda" o "Realizada": una Suspendida / Reprogramada no es una reunión que vaya a hacerse) agrupadas por
 * `claveInvarianteFila_`; un grupo con 2+ filas y al menos una de la agenda (agenda_uid) es una violación si tiene MÁS filas
 * que las reuniones que trae el mail con esa clave (`cuentaEnMail(clave)`, mínimo 1: Macri puede tener dos reuniones el mismo
 * día). Sin el mail (`cuentaEnMail` null, el paso 16), se permite un grupo cuyas filas tienen todas una HORA distinta.
 * Devuelve [{ clave, fecha, filas: [f…], texto }].
 *
 * 16/10 (AGENDA_DUPLICADOS sólo decisiones), `opciones.ignorados` (`ignoradosDeEleccionesAgenda_`): lo que el EQUIPO ya decidió
 * de un par de filas no rompe el invariante — "Son reuniones distintas": una fila declarada distinta de TODAS las otras del grupo
 * sale del grupo; "Quedarse con la fila X": la otra (la que sobra) sale del grupo. Lo que salió por eso va en `.ignoradas` del
 * resultado ([{ clave, filas, por: 'distintas' | 'sobra', texto }]): no frena la semana ni avisa; el paso 16 lo cuenta aparte.
 */
function reunionesRepetidasAgenda_(filas, A, cuentaEnMail, opciones) {
  const v = function (f, n) { return A[n] == null ? '' : f.valores[A[n]]; };
  const ign = opciones && opciones.ignorados && opciones.ignorados.size ? opciones.ignorados : null;
  const grupos = new Map();
  filas.forEach(function (f) {
    const st = normStatus_(v(f, 'STATUS REUNIÓN'));
    if (st && st !== 'en agenda' && st !== 'realizada') return;
    const k = claveInvarianteFila_(f, A);
    if (!k) return;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(f);
  });
  const out = [];
  out.ignoradas = [];
  const quienDe = function (k, lista) {
    const p = k.split('|');
    return p[0] === 'seg' ? (lista[0].figura ? lista[0].figura + ' / ' : '') + (str(v(lista[0], 'Evento (mail)')).split(',')[0] || 'sin figura') + ' ' + str(v(lista[0], 'Lugar (mail)'))
                          : lista[0].figura;
  };
  grupos.forEach(function (todas, k) {
    if (todas.length < 2 || !todas.some(function (f) { return !esVacio_(v(f, 'agenda_uid')); })) return;
    let lista = todas;
    if (ign) {
      const ids = todas.map(function (f) { return idParFilaAgenda_(f, A); });
      const fuera = {};
      for (let i = 0; i < todas.length; i++) {
        for (let j = i + 1; j < todas.length; j++) {
          const d = ign.get(claveParAgenda_(ids[i], ids[j]));
          if (d && d.tipo === 'sobra') {
            if (d.quedarse === ids[i]) fuera[j] = 'sobra';
            else if (d.quedarse === ids[j]) fuera[i] = 'sobra';
          }
        }
      }
      const quedan = function () { return todas.map(function (f, i) { return i; }).filter(function (i) { return !fuera[i]; }); };
      quedan().forEach(function (i) {
        const otras = quedan().filter(function (j) { return j !== i; });
        if (otras.length && otras.every(function (j) { const d = ign.get(claveParAgenda_(ids[i], ids[j])); return d && d.tipo === 'distintas'; })) fuera[i] = 'distintas';
      });
      if (Object.keys(fuera).length) {
        out.ignoradas.push({ clave: k, filas: todas, fuera: todas.filter(function (f, i) { return fuera[i]; }),
                             por: Object.keys(fuera).some(function (i) { return fuera[i] === 'sobra'; }) ? 'sobra' : 'distintas',
                             texto: fmtFecha_(todas[0].fecha) + ' | ' + quienDe(k, todas) + ' | filas ' + todas.map(function (f) { return f.fila; }).join(', ') });
        lista = todas.filter(function (f, i) { return !fuera[i]; });
        if (lista.length < 2) return;
      }
    }
    let permitidas;
    if (cuentaEnMail) permitidas = Math.max(1, cuentaEnMail(k) || 0);
    else {
      const horas = lista.map(function (f) { return valorAgendaComparable_(v(f, 'HORA'), 'HORA'); });
      const distintas = horas.every(function (h, i) { return h && horas.indexOf(h) === i; });
      permitidas = distintas ? lista.length : 1;
    }
    if (lista.length <= permitidas) return;
    out.push({ clave: k, fecha: lista[0].fecha, filas: lista,
               texto: fmtFecha_(lista[0].fecha) + ' | ' + quienDe(k, lista) + ' | filas ' + lista.map(function (f) { return f.fila; }).join(', ') +
                      (cuentaEnMail ? ' (el mail trae ' + (cuentaEnMail(k) || 0) + ')' : '') });
  });
  out.sort(function (a, b) { return a.fecha - b.fecha; });
  return out;
}

// ===================== 16/10: "una reunión en dos filas" — un PAR de filas, la decisión del equipo (AGENDA_DUPLICADOS) =====================

/** La identidad de una fila para un par (nunca el número de fila): su agenda_uid ("uid:…"), o, sin agenda_uid, figura + fecha + barrio ("fila:…"). */
function idParFilaAgenda_(f, A) {
  const u = A.agenda_uid == null ? '' : str(f.valores[A.agenda_uid]);
  return u ? 'uid:' + u : 'fila:' + idFilaAgenda_(f);
}

/** La clave de un par: las dos identidades, ordenadas (la misma sea cual sea el orden de las filas). */
function claveParAgenda_(idA, idB) {
  return [String(idA), String(idB)].sort().join(' # ');
}

/** El id_reunion de la línea de AGENDA_DUPLICADOS (y de ELECCIONES_AGENDA) de un par: "dos_filas|" + la clave. */
function idEleccionParAgenda_(clave) { return 'dos_filas|' + clave; }
function esIdEleccionParAgenda_(id) { return /^dos_filas\|/.test(String(id == null ? '' : id)); }

/** Una fila por su identidad de par: "uid:" = la ÚNICA con ese agenda_uid; "fila:" = la única SIN agenda_uid con ese id_fila (o la
 *  hallada por `filaDeEleccionAgenda_` entre las del equipo, si el barrio cambió dentro de la comuna). null si no hay una sola. */
function _filaPorIdParAgenda_(filas, A, id) {
  const s = String(id == null ? '' : id);
  if (/^uid:/.test(s)) {
    const u = s.slice(4);
    const xs = filas.filter(function (f) { return A.agenda_uid != null && str(f.valores[A.agenda_uid]) === u; });
    return xs.length === 1 ? xs[0] : null;
  }
  if (!/^fila:/.test(s)) return null;
  const delEquipo = filas.filter(function (f) { return A.agenda_uid == null || esVacio_(f.valores[A.agenda_uid]); });
  const x = filaDeEleccionAgenda_(delEquipo, s.slice(5));
  return x.f || null;
}

/** Las dos filas de un par (por su clave), si están las dos y son distintas: { a, b, porId: { id: fila } }; si no, null. */
function filasDelParAgenda_(filas, A, clave) {
  const ids = String(clave == null ? '' : clave).split(' # ');
  if (ids.length !== 2) return null;
  const fa = _filaPorIdParAgenda_(filas, A, ids[0]), fb = _filaPorIdParAgenda_(filas, A, ids[1]);
  if (!fa || !fb || fa === fb) return null;
  const porId = {};
  porId[ids[0]] = fa; porId[ids[1]] = fb;
  return { a: fa, b: fb, porId: porId };
}

/** Lo que el equipo DECIDIÓ de cada par (ELECCIONES_AGENDA / AGENDA_DUPLICADOS): Map clave → { eleccion: 'quedarse' | 'distintas', idFila, el }. */
function decisionesParesAgenda_(elecciones) {
  const out = new Map();
  if (!elecciones || !elecciones.forEach) return out;
  elecciones.forEach(function (el, id) {
    if (!esIdEleccionParAgenda_(id) || !el) return;
    if (el.eleccion === 'quedarse' && el.idFila) out.set(String(id).slice('dos_filas|'.length), { eleccion: 'quedarse', idFila: el.idFila, el: el });
    else if (el.eleccion === 'distintas') out.set(String(id).slice('dos_filas|'.length), { eleccion: 'distintas', idFila: '', el: el });
  });
  return out;
}

/** Los pares que el invariante H3 no cuenta (`reunionesRepetidasAgenda_`, `opciones.ignorados`): Map clave → { tipo: 'distintas' } |
 *  { tipo: 'sobra', quedarse: idFila de la que se queda }. */
function ignoradosDeEleccionesAgenda_(elecciones) {
  const out = new Map();
  decisionesParesAgenda_(elecciones).forEach(function (d, clave) {
    out.set(clave, d.eleccion === 'distintas' ? { tipo: 'distintas' } : { tipo: 'sobra', quedarse: d.idFila });
  });
  return out;
}

/** Las opciones de ELEGIR de un par: exactamente "Quedarse con la fila X", "Quedarse con la fila Y", "Son reuniones distintas". */
function opcionesParAgenda_(par) {
  return [AGENDA_OPCION_QUEDARSE + par.a.fila, AGENDA_OPCION_QUEDARSE + par.b.fila, AGENDA_OPCION_DISTINTAS];
}

/** La columna oculta id_fila de la línea de un par: "X=identidad # Y=identidad" (el número de fila sólo traduce la opción de ESA línea). */
function mapaOpcionesParAgenda_(par, A) {
  return par.a.fila + '=' + idParFilaAgenda_(par.a, A) + ' # ' + par.b.fila + '=' + idParFilaAgenda_(par.b, A);
}

/** "Quedarse con la fila 838" + el mapa de la línea → la identidad de esa fila; '' si es otra cosa (o no se reconoce). */
function idFilaDeOpcionParAgenda_(texto, mapa) {
  const m = /quedarse con la fila\s*(\d+)/.exec(normalizeText_(texto));
  if (!m) return '';
  let out = '';
  String(mapa == null ? '' : mapa).split(' # ').forEach(function (p) {
    const k = p.indexOf('=');
    if (k > 0 && p.slice(0, k).trim() === m[1]) out = p.slice(k + 1).trim();
  });
  return out;
}

/**
 * **Los pares "una reunión en dos filas" que el equipo tiene que DECIDIR** (16/10; lo llama `planAgenda_`): los grupos del invariante
 * H3 (de a dos) y las filas parecidas de "después de crear" (una de la agenda y una del equipo), sin los que el equipo ya decidió.
 * Cada par: { clave, id, a, b (a la de número de fila menor), origen, texto, diferencia, eval (las reglas del paso 97, para decir
 * si se podría juntar solo), fallo (por qué la fusión de esta corrida no lo juntó) }. Además (`P.dosFilasDecididas`): los pares ya
 * decididos que siguen en la base ("distintas"; "sobra" = la otra es del equipo, borrarla a mano; "sin_aplicar" = la otra es de
 * la agenda y todavía no se juntó), y las elecciones de esos pares quedan como consultadas (no se cierran).
 */
function _dosFilasAgenda_(P, dest, A, despues, elecciones, ignorados, fusionPrevia) {
  const pares = [], vistos = new Set();
  const uidDe = function (f) { return A.agenda_uid == null ? '' : str(f.valores[A.agenda_uid]); };
  const fallo = {};
  ((fusionPrevia && fusionPrevia.fallidas) || []).forEach(function (x) { if (x.clave) fallo[x.clave] = x.motivo; });
  const hist = { porUid: (P.historial && P.historial.creacionPorUid) || new Map() };
  const agregar = function (f1, f2, origen, texto, diferencia) {
    if (!f1 || !f2 || f1.fila === f2.fila) return;
    const clave = claveParAgenda_(idParFilaAgenda_(f1, A), idParFilaAgenda_(f2, A));
    if (vistos.has(clave) || ignorados.has(clave)) return;
    vistos.add(clave);
    const a = f1.fila < f2.fila ? f1 : f2, b = a === f1 ? f2 : f1;
    let ev = null;
    if (typeof evaluarParAutomaticoFusion_ === 'function') {
      try { ev = evaluarParAutomaticoFusion_(dest.hdr, A, a, b, hist); } catch (err) { ev = null; }
    }
    pares.push({ clave: clave, id: idEleccionParAgenda_(clave), a: a, b: b, origen: origen, texto: texto, diferencia: diferencia,
                 eval: ev, fallo: fallo[clave] || '' });
  };
  (P.invariante || []).forEach(function (x) {
    for (let i = 0; i < x.filas.length; i++) {
      for (let j = i + 1; j < x.filas.length; j++) agregar(x.filas[i], x.filas[j], 'invariante', x.texto, 'la misma reunión: ' + x.texto);
    }
  });
  (despues || []).forEach(function (d) {
    const fa = d.fAgenda;
    d.candidatas.forEach(function (c) {
      agregar(fa, c.f, 'despues', 'fila ' + fa.fila + ' (de la agenda): ' + (fa.figura || '(sin figura)') + ' ' + (fa.fecha ? fmtFecha_(fa.fecha) : '') + ' ' +
              (fa.barrio || '') + ' ~ fila ' + c.f.fila + ' (del equipo)', c.diferencia);
    });
  });
  P.dosFilas = pares;
  pares.forEach(function (par) {
    P.duplicados.push({ tipo: 'dos_filas', par: par });
    if (P.eleccionesConsultadas) P.eleccionesConsultadas.set(par.id, par.id);
  });
  // lo ya decidido que sigue en la base
  P.dosFilasDecididas = [];
  ignorados.forEach(function (d, clave) {
    const par = filasDelParAgenda_(dest.filas, A, clave);
    if (!par) return;                                    // el par ya no está: la elección se cierra (eleccion_cerrada)
    const id = idEleccionParAgenda_(clave);
    const el = elecciones && elecciones.get ? elecciones.get(id) : null;
    if (P.eleccionesConsultadas) P.eleccionesConsultadas.set(id, id);
    if (d.tipo === 'distintas') {
      P.eleccionesUsadas.push({ id: id, el: el, eleccion: 'distintas' });
      P.dosFilasDecididas.push({ clave: clave, tipo: 'distintas', a: par.a, b: par.b });
      return;
    }
    const x = par.porId[d.quedarse];
    if (!x) return;
    const y = x === par.a ? par.b : par.a;
    // 16/10 (revisor): no se aplicó nada (la otra es del equipo, o no se pudo juntar): otro tipo en el registro, no "eleccion_aplicada"
    (P.eleccionesAMano = P.eleccionesAMano || []).push({ id: id, el: el, eleccion: 'quedarse', x: x, y: y, motivo: fallo[clave] || '',
                                                          delEquipo: !/^c-/.test(uidDe(y)) });
    P.dosFilasDecididas.push({ clave: clave, tipo: /^c-/.test(uidDe(y)) ? 'sin_aplicar' : 'sobra', x: x, y: y, motivo: fallo[clave] || '' });
  });
  // las decisiones que la fusión de esta corrida YA aplicó (el par ya no está): se anotan como aplicadas
  ((fusionPrevia && fusionPrevia.decididas) || []).forEach(function (x) {
    const id = idEleccionParAgenda_(x.clave);
    if (P.eleccionesConsultadas) P.eleccionesConsultadas.set(id, id);
    P.eleccionesUsadas.push({ id: id, el: elecciones && elecciones.get ? elecciones.get(id) : null, eleccion: 'quedarse', fila: x.vieja.fila,
                              como: 'juntada: la fila ' + x.nueva.fila + ' se borró (corrida ' + x.corrida + ')' });
  });
}

// ===================== 16/10: AGENDA_PENDIENTES — lo que el equipo tiene que SABER (no decidir) =====================

/** Los tipos de AGENDA_PENDIENTES que son un HECHO de una corrida (se listan AGENDA_PENDIENTES_DIAS_EVENTOS días); los demás son un estado (se recalculan). */
const TIPOS_EVENTO_PENDIENTES_AGENDA_ = ['cancelación aplicada (Suspendida)', 'juntada sola (fusión automática)', 'juntada por decisión del equipo'];
const ENC_PENDIENTES_AGENDA_ = ['tipo', 'reunión', 'semana', 'grupo', 'fecha', 'hora', 'lugar', 'fila', 'qué pasa', 'qué sigue', 'desde', 'id'];

/**
 * Lo que el equipo tiene que SABER de la agenda en esta corrida (no decidir: eso va a AGENDA_DUPLICADOS). Una entrada por cosa:
 * { tipo, reunion, semana, grupo, fecha, hora, lugar, fila, que, sigue, id (estable entre corridas), evento, avisar }. `avisar`: va
 * al aviso diario 'agenda_info' (una vez por id); las que ya avisa otro tema ('suspendidas', 'mail_raro') no. En seco no hay
 * hechos (no se escribió nada).
 */
function infoAgenda_(P) {
  const out = [];
  const real = !P.enSeco;
  const textoEv = function (ev) { return _textoReunionAgenda_(ev); };
  (P.pendientes || []).forEach(function (x) {
    const ev = x.ev, idR = idReunionAgenda_(ev);
    const base = { reunion: textoEv(ev) + (ev.lugarTexto ? ' | ' + str(ev.lugarTexto).replace(/\s+/g, ' ') : ''), semana: ev.semana || '', grupo: ev.grupo || '',
                   fecha: ev.fecha || '', hora: ev.hora || '', lugar: ev.lugar || '', fila: '' };
    if (x.cancelada) {
      out.push(Object.assign(base, { tipo: 'cancelada en el mail: no se crea', que: x.falta, id: 'cancelada_mail|' + idR, avisar: false,
                                     sigue: 'nada: no se crea (si un mail posterior la trae sin el rojo, se crea)' }));
    } else if (x.seCrea) {
      out.push(Object.assign(base, { tipo: 'pendiente de definir', que: 'le falta: ' + x.falta + ' (no se crea la fila todavía)', id: 'pendiente|' + idR, avisar: true,
                                     sigue: 'se crea cuando llegue la figura o una dirección (hoy: "' + (str(ev.lugarTexto).replace(/\s+/g, ' ') || 'sin Lugar') +
                                            '"), o el ' + fmtFecha_(x.seCrea) + ' (' + AGENDA_CREAR_SIN_DEFINIR_DIAS + ' días antes), lo que pase primero' }));
    } else {
      out.push(Object.assign(base, { tipo: 'pendiente: mail con formato raro', que: 'le falta: ' + x.falta, id: 'mail_raro|' + idR, avisar: false,
                                     sigue: 'se crea cuando llegue un mail de esa semana sin formato raro' }));
    }
  });
  const bloqueadasPorSemana = {};
  (P.bloqueadasInvariante || []).forEach(function (ev) {
    if (!ev.fecha) return;
    const k = lunesYmdAgenda_(ev.fecha);
    (bloqueadasPorSemana[k] = bloqueadasPorSemana[k] || []).push(ev);
  });
  (P.invariante || []).forEach(function (x) {
    const lun = lunesYmdAgenda_(x.fecha), bl = bloqueadasPorSemana[lun] || [];
    const lunD = new Date(+lun.slice(0, 4), +lun.slice(4, 6) - 1, +lun.slice(6, 8), 12);
    out.push({ tipo: 'semana frenada: una reunión en dos filas', reunion: x.texto, semana: 'semana del ' + fmtFecha_(lunD), grupo: '',
               fecha: x.fecha, hora: '', lugar: '', fila: x.filas.map(function (f) { return f.fila; }).join(', '),
               que: 'la misma reunión está en ' + x.filas.length + ' filas: en esa semana la agenda no crea ninguna reunión nueva' +
                    (bl.length ? ' (esperan ' + bl.length + ': ' + bl.slice(0, 5).map(textoEv).join(' / ') + (bl.length > 5 ? ' …' : '') + ')' : ''),
               sigue: 'elegir en AGENDA_DUPLICADOS (archivo de la base): "Quedarse con la fila …" o "Son reuniones distintas"',
               id: 'semana_frenada|' + x.clave, avisar: true });
  });
  if (real) {
    const hechas = new Set();
    ((P.escrito && P.escrito.hechas) || []).forEach(function (e) { hechas.add(P.acciones[e.accion]); });
    (P.suspendidasAuto || []).forEach(function (x) {
      if (!hechas.has(x.accion)) return;
      const uid = P.A && P.A.agenda_uid != null ? str(x.f.valores[P.A.agenda_uid]) : '';
      out.push({ tipo: 'cancelación aplicada (Suspendida)', reunion: textoEv(x.d), semana: x.d.semana || '', grupo: x.d.grupo || '', fecha: x.d.fecha || '',
                 hora: x.d.hora || '', lugar: x.d.lugar || '', fila: x.f.fila, que: 'la fila ' + x.f.fila + ' pasó a Suspendida: ' + x.salida + ' (nunca se borra)',
                 sigue: 'si vuelve al mail, el sistema la reactiva; si se hizo igual, el equipo la pasa a Realizada',
                 id: 'suspendida|' + (uid || 'fila ' + x.f.fila) + '|' + (x.f.fecha ? ymd_(x.f.fecha) : ''), avisar: false, evento: true });
    });
    const fp = P.fusionPrevia || {};
    const juntada = function (x, tipo, quien) {
      const v = x.vieja, n = x.nueva;
      out.push({ tipo: tipo, reunion: (v.fecha ? fmtFecha_(v.fecha) : '') + ' ' + (v.hora || '') + ' | ' + (v.figura || '(sin figura)') + ' | ' + (v.lugar || '—'),
                 semana: '', grupo: '', fecha: v.fecha || '', hora: v.hora || '', lugar: v.lugar || '', fila: v.fila,
                 que: quien + ': la fila ' + n.fila + ' era la misma reunión que la ' + v.fila + '; se completó la ' + v.fila + ' (sólo lo vacío o lo del sistema) y la ' +
                      n.fila + ' se borró (guardada entera en el registro de la agenda)',
                 sigue: 'nada. Si estuvo mal: deshacer (paso 38) con la corrida ' + x.corrida,
                 id: (tipo === 'juntada por decisión del equipo' ? 'juntada_equipo|' : 'juntada_sola|') + x.clave, avisar: true, evento: true });
    };
    (fp.automaticas || []).forEach(function (x) { juntada(x, 'juntada sola (fusión automática)', 'el sistema la juntó solo (las reglas del paso 97)'); });
    (fp.decididas || []).forEach(function (x) { juntada(x, 'juntada por decisión del equipo', 'el equipo eligió quedarse con la fila ' + x.vieja.fila); });
  }
  (P.dosFilasDecididas || []).forEach(function (d) {
    if (d.tipo === 'distintas') return;
    const x = d.x, y = d.y;
    const reunion = (x.fecha ? fmtFecha_(x.fecha) : '') + ' | ' + (x.figura || '(sin figura)') + ' | filas ' + x.fila + ' y ' + y.fila;
    if (d.tipo === 'sobra') {
      out.push({ tipo: 'la que sobra: borrarla a mano', reunion: reunion, semana: '', grupo: '', fecha: x.fecha || '', hora: '', lugar: '', fila: y.fila,
                 que: 'el equipo eligió quedarse con la fila ' + x.fila + '; la ' + y.fila + ' la cargó el equipo: el sistema no la borra ni le copia nada',
                 sigue: 'borrar la fila ' + y.fila + ' a mano (mientras tanto, "una reunión, una fila" no la cuenta)', id: 'sobra|' + d.clave, avisar: true });
    } else {
      out.push({ tipo: 'decisión del equipo sin aplicar', reunion: reunion, semana: '', grupo: '', fecha: x.fecha || '', hora: '', lugar: '', fila: y.fila,
                 que: 'el equipo eligió quedarse con la fila ' + x.fila + '; la ' + y.fila + ' todavía no se juntó' + (d.motivo ? ': ' + d.motivo : ''),
                 // 16/10 (revisor): con datos del equipo en la otra fila, el sistema no la borra: lo resuelve el equipo
                 sigue: /datos del equipo/.test(d.motivo || '') ? 'el sistema no la borra: borrar la fila ' + y.fila + ' a mano, o corregir sus datos para que ' +
                        'coincidan con la ' + x.fila + ' (entonces se junta sola en la corrida siguiente)'
                        : 'el sistema lo vuelve a intentar cada hora; si no puede, borrar la fila ' + y.fila + ' a mano',
                 id: 'sin_aplicar|' + d.clave, avisar: !!d.motivo });
    }
  });
  return out;
}

/**
 * **AGENDA_PENDIENTES** (intermedia): lo que el equipo tiene que saber de la agenda, una línea por cosa, con su `tipo` (16/10:
 * antes, sólo las "pendiente de definir" y las canceladas en el mail). `previas`: las líneas que ya tenía la solapa ([{ id, tipo,
 * desde, fila: [valores] }]): un hecho (TIPOS_EVENTO_PENDIENTES_AGENDA_) se sigue listando AGENDA_PENDIENTES_DIAS_EVENTOS días;
 * "desde" es la primera vez que se listó. Los estados se recalculan (si ya no pasa, la línea se va).
 */
function matrizPendientesAgenda_(P, previas) {
  const items = P.infoAgenda || infoAgenda_(P);
  const ahora = new Date();
  const prev = {};
  (previas || []).forEach(function (x) { if (x.id) prev[x.id] = x; });
  const out = [ENC_PENDIENTES_AGENDA_.slice()];
  const ids = new Set();
  items.forEach(function (it) {
    ids.add(it.id);
    const desde = prev[it.id] && prev[it.id].desde instanceof Date ? prev[it.id].desde : ahora;
    out.push([it.tipo, it.reunion, it.semana, it.grupo, it.fecha instanceof Date ? fmtFecha_(it.fecha) : str(it.fecha), it.hora || '', it.lugar || '',
              it.fila === '' || it.fila == null ? '' : String(it.fila), it.que, it.sigue, desde, it.id]);
  });
  const limite = ahora.getTime() - AGENDA_PENDIENTES_DIAS_EVENTOS * 86400000;
  (previas || []).forEach(function (x) {
    if (!x.id || ids.has(x.id) || TIPOS_EVENTO_PENDIENTES_AGENDA_.indexOf(x.tipo) < 0) return;
    if (!(x.desde instanceof Date) || x.desde.getTime() < limite) return;
    ids.add(x.id);
    out.push(x.fila.slice(0, ENC_PENDIENTES_AGENDA_.length));
  });
  return out;
}

/**
 * Escribe AGENDA_PENDIENTES (intermedia) si hay algo que decir, o si ya existe (para que lo viejo se vaya), o con H1 prendido.
 * `P.infoAgenda` queda calculado (lo usa el aviso diario).
 */
function _escribirPendientesAgenda_(P) {
  P.infoAgenda = infoAgenda_(P);
  const previas = _leerPendientesPreviasAgenda_();
  const m = matrizPendientesAgenda_(P, previas.filas);
  if (!(P.modos && P.modos.soloIdentificadas) && m.length < 2 && !previas.existe) return false;
  escribirHoja_(AGENDA_SOLAPA_PENDIENTES, m);
  return true;
}

/** Las líneas que ya tiene AGENDA_PENDIENTES (por su encabezado; las de antes del 16/10, sin "id", no se conservan). Sólo lectura. */
function _leerPendientesPreviasAgenda_() {
  const sh = ssIntermedia_().getSheetByName(AGENDA_SOLAPA_PENDIENTES);
  if (!sh || sh.getLastRow() < 2) return { existe: !!sh, filas: [] };
  const v = sh.getRange(1, 1, sh.getLastRow(), Math.max(1, sh.getLastColumn())).getValues();
  const hdr = v[0].map(normalizeHeader_);
  const i = function (n) { return hdr.indexOf(normalizeHeader_(n)); };
  if (i('id') < 0 || i('tipo') < 0) return { existe: true, filas: [] };
  const filas = v.slice(1).filter(function (r) { return str(r[i('id')]); }).map(function (r) {
    const fila = ENC_PENDIENTES_AGENDA_.map(function (n) { const k = i(n); return k < 0 ? '' : r[k]; });
    return { id: str(r[i('id')]), tipo: str(r[i('tipo')]), desde: i('desde') >= 0 && r[i('desde')] instanceof Date ? r[i('desde')] : null, fila: fila };
  });
  return { existe: true, filas: filas };
}

/**
 * **El aviso diario de lo que hay que saber** (16/10; tema 'agenda_info' de 50_Avisos.js, que los junta en UN mail por día): cada
 * cosa NUEVA de AGENDA_PENDIENTES con `avisar`, UNA sola vez. Las ya avisadas, en la propiedad AGENDA_PROP_INFO_AVISADOS (un hash
 * corto del id → la fecha; se olvidan a los AGENDA_INFO_AVISADOS_DIAS días; si no entra en la propiedad, se descartan las más
 * viejas). Devuelve cuántas avisó.
 */
function _avisarInfoAgenda_(P, av) {
  const items = (P.infoAgenda || infoAgenda_(P)).filter(function (it) { return it.avisar; });
  if (!items.length) return 0;
  let props = null, vistas = {};
  try { props = PropertiesService.getScriptProperties(); vistas = JSON.parse(props.getProperty(AGENDA_PROP_INFO_AVISADOS) || '{}') || {}; }
  catch (err) { vistas = {}; }
  const hoy = Utilities.formatDate(new Date(), RDV_TZ, 'yyyy-MM-dd');
  const viejo = Utilities.formatDate(new Date(Date.now() - AGENDA_INFO_AVISADOS_DIAS * 86400000), RDV_TZ, 'yyyy-MM-dd');
  Object.keys(vistas).forEach(function (k) { if (String(vistas[k]) < viejo) delete vistas[k]; });
  let n = 0;
  items.forEach(function (it) {
    const k = _hashCortoAgenda_(it.id);
    if (vistas[k]) return;
    // 16/10 (revisor): se marca como avisada SÓLO si el aviso quedó de verdad para mandar (con el mail apagado, registrarAviso_
    // devuelve false: al prenderlo, lo que esté pendiente se avisa)
    const ok = av('agenda_info', it.tipo.toUpperCase() + ' | ' + it.reunion + (it.fila !== '' && it.fila != null ? ' | fila ' + it.fila : '') + ' | ' + it.que + ' → ' + it.sigue);
    if (ok !== true) return;
    vistas[k] = hoy;
    n++;
  });
  if (n && props) {
    try {
      let s = JSON.stringify(vistas);
      if (s.length > 8000) {   // 9 KB por propiedad: se descartan las más viejas
        const ks = Object.keys(vistas).sort(function (a, b) { return String(vistas[a]).localeCompare(String(vistas[b])); });
        while (s.length > 8000 && ks.length) { delete vistas[ks.shift()]; s = JSON.stringify(vistas); }
      }
      props.setProperty(AGENDA_PROP_INFO_AVISADOS, s);
    } catch (err) { /* el aviso nunca corta */ }
  }
  return n;
}

/** Un hash corto (12 hex) de un texto: la clave de "ya avisado" (los ids de la agenda pueden ser largos). */
function _hashCortoAgenda_(s) {
  try {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(s), Utilities.Charset.UTF_8)
      .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('').slice(0, 12);
  } catch (err) { return String(s).slice(0, 60); }
}

/** El log de lo nuevo del 15/10 (sólo si algún interruptor está prendido o hay algo que decir). */
function _logAgendaSegura_(P) {
  const m = P.modos || {}, r = P.r || {};
  const algo = m.soloIdentificadas || m.conciliacion || m.invariante || m.validarMails || m.suspenderSiempre || m.coloresMail;
  if (!algo && !(r.mailsRaros || []).length && !(r.repetidasEnMail || []).length) return;
  Logger.log('  AGENDA SEGURA (15/10): pendientes de definir %s | conciliadas por semana %s | una reunión en dos filas %s (reuniones ' +
             'que no se crean por eso %s) | la misma reunión dos veces en un mail %s | mails con formato raro %s%s',
             (P.pendientes || []).length, (P.conciliadas || []).length, (P.invariante || []).length, (P.bloqueadasInvariante || []).length,
             (r.repetidasEnMail || []).length, (r.mailsRaros || []).length, m.validarMails ? ' (no se usan)' : ' (informativo: AGENDA_VALIDAR_MAILS apagado)');
  (P.pendientes || []).forEach(function (x) {
    if (x.cancelada) {
      Logger.log('    CANCELADA EN EL MAIL, NO SE CREA | %s %s | %s | %s | %s', fmtFecha_(x.ev.fecha), x.ev.hora, x.ev.tipo || (x.ev.figuras || []).join(' + '),
                 x.ev.lugar, x.falta);
      return;
    }
    Logger.log('    PENDIENTE DE DEFINIR | %s %s | %s | %s | "%s" | se crea con la figura o la dirección, o el %s', fmtFecha_(x.ev.fecha), x.ev.hora,
               x.ev.tipo, x.ev.lugar, str(x.ev.lugarTexto), fmtFecha_(x.seCrea));
  });
  (P.conciliadas || []).forEach(function (x) {
    Logger.log('    CONCILIADA (la misma reunión, cambió) | %s %s | %s | %s → fila %s (%s %s, %s)', fmtFecha_(x.ev.fecha), x.ev.hora,
               x.ev.figuraFila || x.ev.tipo, x.ev.lugar, x.f.fila, x.f.figura || '(sin figura)', fmtFecha_(x.f.fecha), x.como);
  });
  (P.invariante || []).forEach(function (x) { Logger.log('    UNA REUNIÓN EN DOS FILAS | %s', x.texto); });
  (P.bloqueadasInvariante || []).forEach(function (ev) {
    Logger.log('    NO SE CREA (la semana tiene una reunión en dos filas) | %s %s | %s | %s', fmtFecha_(ev.fecha), ev.hora, ev.figuraFila || ev.tipo, ev.lugar);
  });
  (r.repetidasEnMail || []).forEach(function (x) { Logger.log('    LA MISMA REUNIÓN DOS VECES EN EL MAIL | %s | %s', x.asunto, x.texto); });
  (r.mailsRaros || []).forEach(function (x) {
    Logger.log('    MAIL CON FORMATO RARO%s | %s | %s | %s', x.usado ? '' : ' (NO SE USA)', fmtFecha_(x.fecha), x.asunto, x.motivos.join('; '));
  });
  (r.semanasSinMailValido || []).forEach(function (t) { Logger.log('    SEMANA SIN NINGÚN MAIL VÁLIDO (se muestra en la copia, pero no crea ni suspende filas) | %s', t); });
  if (m.suspenderSiempre) {
    Logger.log('  CANCELACIÓN AUTOMÁTICA (modo "suspender", nunca se borra): suspendidas %s | NO aplicadas (una salvaguarda falló) %s',
               (P.suspendidasAuto || []).length, (P.cancelNoAplicada || []).length);
    (P.suspendidasAuto || []).forEach(function (x) {
      Logger.log('    SUSPENDIDA | fila %s | %s %s | %s | %s', x.f.fila, fmtFecha_(x.d.fecha), x.d.hora, x.d.figuraFila || x.d.tipo, x.salida);
    });
    (P.cancelNoAplicada || []).forEach(function (x) {
      Logger.log('    NO SE SUSPENDE | %s %s | %s | %s%s', fmtFecha_(x.d.fecha), x.d.hora, x.d.figuraFila || x.d.tipo,
                 x.porRojo ? 'cancelada en el mail (' + x.d.canceladaEnMailMotivo + '): ' : (x.porConjunto ? 'Cancelado en ' + x.d.conjuntoTexto + ': ' : ''), x.motivo);
    });
    // 16/10 (AGENDA_CANCELACION_CONJUNTO): cada "Cancelado" de RDV CONJUNTO y qué se hizo
    if (m.cancelacionConjunto) {
      const cc = P.cancelacionesConjunto || {};
      Logger.log('  RDV CONJUNTO COMO FUENTE DE CANCELACIÓN%s: filas "Cancelado" %s | suspendidas %s | columna de estado "%s" (%s)',
                 cc.error ? ' (ERROR: ' + cc.error + ')' : '', (P.conjuntoCancela || []).length,
                 (P.suspendidasAuto || []).filter(function (x) { return x.porConjunto; }).length, cc.nombreEst || '—', cc.comoEst || '—');
      (P.conjuntoCancela || []).forEach(function (x) {
        Logger.log('    CONJUNTO | %s | fila de la base %s | %s', x.dc.conjunto.map(textoFilaConjunto_).join(' / '),
                   x.dc.f ? x.dc.f.fila + ' (' + (x.dc.f.figura || 'sin figura') + ', ' + (x.dc.f.barrio || 'sin barrio') + ')' : '—', x.decision);
      });
    }
    (P.suspendidasConDatos || []).forEach(function (x) {
      Logger.log('    SUSPENDIDA POR EL SISTEMA CON DATOS (no se pisa nada; se avisa una vez) | fila %s | %s | %s%s', x.f.fila, x.f.figura || '(sin figura)',
                 x.f.fecha ? fmtFecha_(x.f.fecha) : '', _datosFilaTextoAgenda_({ D: {} }, x.f) || ' | asistentes ' + str(x.asistentes) + ', inscriptos ' + str(x.inscriptos));
    });
  }
  if (m.coloresMail) {
    const rojas = (P.cancelacionesEvaluadas || []).filter(function (x) { return x.por === 'rojo'; });
    Logger.log('  COLORES DEL MAIL: reuniones del alcance CANCELADAS EN EL MAIL (rojo entero) %s | suspendidas por rojo %s | Suspendidas que no se ' +
               'reactivan (siguen en rojo, o no se sabe el color) %s%s', rojas.length, (P.suspendidasAuto || []).filter(function (x) { return x.porRojo; }).length,
               (P.noReactivadasRojo || []).filter(function (x) { return !x.porConjunto; }).length, m.suspenderSiempre ? '' : ' (la cancelación automática está apagada: no se suspende nada)');
    rojas.forEach(function (x) {
      Logger.log('    ROJO | %s | %s | %s%s', _textoReunionAgenda_(x.d), x.motivoMail, x.decision, notasTextoAgenda_(x.d));
    });
  }
}

/** Una reunión, en una línea para un aviso. */
function _textoReunionAgenda_(ev) {
  return (ev.fecha ? fmtFecha_(ev.fecha) : '(sin día)') + ' ' + (ev.hora || '--:--') + ' | ' +
         ((ev.figuras || []).join(' + ') || ev.tipo || '(sin figura)') + ' | ' + (ev.lugar || '—');
}

/**
 * Los AVISOS de la agenda (corrida real; `registrarAviso_` es del sistema de mails, 50_Avisos.js): lo nuevo de AGENDA_PENDIENTES
 * (agenda_info, una vez por cosa: 16/10, en vez de invariante_agenda en cada corrida), los mails raros y la misma reunión dos veces (mail_raro: sólo los mails de las últimas 24 h, para no
 * repetir cada hora el mismo mail), y con el modo "suspender" cada suspensión escrita (suspendidas) y cada salvaguarda que
 * frenó una (cancelacion_no_aplicada). Sin `registrarAviso_`, nada. Devuelve cuántos avisos registró.
 */
function _avisosAgendaSegura_(P, r) {
  if (typeof registrarAviso_ !== 'function' || !P || !P.modos) return 0;
  let n = 0;
  const av = function (tema, texto) {
    // 16/10 (revisor): devuelve lo que devolvió registrarAviso_ (true = quedó para mandar; false = mail apagado o falló)
    try { const ok = registrarAviso_(tema, texto); n++; return ok; } catch (err) { Logger.log('>>> el aviso "%s" no se registró: %s', tema, err); return false; }
  };
  const reciente = function (d) { return d && (Date.now() - d.getTime()) <= 86400000; };
  // 16/10 (AGENDA_DUPLICADOS sólo decisiones): lo informativo NUEVO de AGENDA_PENDIENTES —una semana frenada por "una reunión en dos
  // filas", una reunión juntada sola o por decisión del equipo, una fila que sobra, una pendiente de definir— va al aviso diario
  // 'agenda_info', UNA vez por cosa (antes: 'invariante_agenda' en cada corrida)
  _avisarInfoAgenda_(P, av);
  if (P.modos.validarMails) {
    ((r && r.mailsRaros) || []).forEach(function (m) {
      if (!reciente(m.fecha)) return;
      av('mail_raro', 'no se usó el mail "' + m.asunto + '" (' + Utilities.formatDate(m.fecha, RDV_TZ, 'dd/MM HH:mm') + ', ' + m.grupo +
                      ', semana del ' + m.semana + '): ' + m.motivos.join('; ') + '. La semana sigue con la versión anterior.');
    });
    (P.repetidasEnMail || []).forEach(function (ev) {
      if (!reciente(ev.mailFecha)) return;
      av('mail_raro', 'la misma reunión dos veces en el mail "' + ev.asunto + '": ' + _textoReunionAgenda_(ev) + '. No se creó ninguna fila.');
    });
  }
  // 16/10 (arreglo 3): una reunión en ROJO sin fila no se crea, pero se avisa (en el aviso diario de las suspendidas)
  if (P.modos.cerrarCanceladasMail) {
    (P.canceladasMail || []).forEach(function (x) {
      if (!reciente(x.ev.mailFecha)) return;
      av('suspendidas', _textoReunionAgenda_(x.ev) + ' | sin fila en la base: NO SE CREA (cancelada en el mail' + (x.motivo ? ': ' + x.motivo : '') + ')' +
         (typeof notasTextoAgenda_ === 'function' ? notasTextoAgenda_(x.ev) : ''));
    });
  }
  if (P.modos.suspenderSiempre) {
    const hechas = new Set();
    ((P.escrito && P.escrito.hechas) || []).forEach(function (e) { hechas.add(P.acciones[e.accion]); });
    (P.suspendidasAuto || []).forEach(function (x) {
      if (!hechas.has(x.accion)) return;
      // 15/10 (noche): la cancelada en ROJO lo dice, con las notas del mail que la nombran (confirman el color)
      av('suspendidas', _textoReunionAgenda_(x.d) + ' | fila ' + x.f.fila + ' → Suspendida (' +
         (x.porRojo ? 'cancelada en el mail: ' + x.d.canceladaEnMailMotivo :
          (x.porConjunto ? 'Cancelado en ' + x.d.conjuntoTexto : 'salió del mail del ' + fmtFecha_(x.d.mailQueLaSaco))) + ')' + notasTextoAgenda_(x.d));
    });
    // 16/10 (AGENDA_CANCELACION_CONJUNTO): un "Cancelado" de RDV CONJUNTO que no se aplicó, UNA vez por fila (no tiene fecha de mail)
    _avisarConjuntoNoAplicadoAgenda_(P, av);
    (P.cancelNoAplicada || []).forEach(function (x) {
      if (x.porConjunto) return;
      if (!reciente(x.mail || x.d.mailQueLaSaco)) return;   // 15/10 (revisor): no repetir cada hora el mismo aviso
      av('cancelacion_no_aplicada', _textoReunionAgenda_(x.d) + (x.f ? ' | fila ' + x.f.fila : '') +
         (x.porRojo ? ' está cancelada en el mail (' + x.d.canceladaEnMailMotivo + ') y NO se suspendió: ' : ' salió del mail y NO se suspendió: ') +
         x.motivo + notasTextoAgenda_(x.d));
    });
    // 15/10 (noche): una fila que el sistema suspendió y después recibió asistentes o inscriptos (una vez por fila)
    _avisarSuspendidasConDatosAgenda_(P, av);   // (av ya cuenta en n)
  }
  return n;
}

/**
 * **"Cancelado" en RDV CONJUNTO que no se aplicó** (16/10, AGENDA_CANCELACION_CONJUNTO): otro STATUS en la base, o asistentes
 * que se contradicen. RDV CONJUNTO no tiene fecha de mail, así que se avisa UNA vez por fila (y filas de RDV CONJUNTO): las ya
 * avisadas, en la propiedad AGENDA_PROP_CONJUNTO_AVISADAS (se olvidan a los 120 días). Devuelve cuántas avisó.
 */
function _avisarConjuntoNoAplicadoAgenda_(P, av) {
  const xs = ((P && P.cancelNoAplicada) || []).filter(function (x) { return x.porConjunto; });
  if (!xs.length) return 0;
  let props = null, vistas = {};
  try { props = PropertiesService.getScriptProperties(); vistas = JSON.parse(props.getProperty(AGENDA_PROP_CONJUNTO_AVISADAS) || '{}') || {}; }
  catch (err) { vistas = {}; }
  const hoy = Utilities.formatDate(new Date(), RDV_TZ, 'yyyy-MM-dd');
  const viejo = Utilities.formatDate(new Date(Date.now() - 120 * 86400000), RDV_TZ, 'yyyy-MM-dd');
  Object.keys(vistas).forEach(function (k) { if (String(vistas[k]) < viejo) delete vistas[k]; });
  let n = 0;
  xs.forEach(function (x) {
    const uid = P.A && P.A.agenda_uid != null ? str(x.f.valores[P.A.agenda_uid]) : '';
    const k = (uid || 'fila ' + x.f.fila) + '|' + (x.f.fecha ? ymd_(x.f.fecha) : '') + '|' + (x.conjunto || []).map(function (c) { return c.fila; }).join(',');
    if (vistas[k]) return;
    vistas[k] = hoy;
    av('cancelacion_no_aplicada', _textoReunionAgenda_(x.d) + ' | fila ' + x.f.fila + ' figura "Cancelado" en ' + x.d.conjuntoTexto +
       ' y NO se suspendió: ' + x.motivo);
    n++;
  });
  if (n && props) { try { props.setProperty(AGENDA_PROP_CONJUNTO_AVISADAS, JSON.stringify(vistas)); } catch (err) { /* el aviso nunca corta */ } }
  return n;
}

/**
 * **Suspendida por el sistema, y después con asistentes o inscriptos** (15/10, noche): nada se pisa (el STATUS sigue
 * Suspendida); se avisa UNA vez por fila (registrarAviso_('suspendida_con_datos')): las ya avisadas, en la propiedad
 * AGENDA_PROP_SUSP_CON_DATOS (por agenda_uid + fecha; se olvidan a los 120 días). Devuelve cuántas avisó.
 */
function _avisarSuspendidasConDatosAgenda_(P, av) {
  const xs = (P && P.suspendidasConDatos) || [];
  if (!xs.length) return 0;
  let props = null, vistas = {};
  try { props = PropertiesService.getScriptProperties(); vistas = JSON.parse(props.getProperty(AGENDA_PROP_SUSP_CON_DATOS) || '{}') || {}; }
  catch (err) { vistas = {}; }
  const hoy = Utilities.formatDate(new Date(), RDV_TZ, 'yyyy-MM-dd');
  const viejo = Utilities.formatDate(new Date(Date.now() - 120 * 86400000), RDV_TZ, 'yyyy-MM-dd');
  Object.keys(vistas).forEach(function (k) { if (String(vistas[k]) < viejo) delete vistas[k]; });
  let n = 0;
  xs.forEach(function (x) {
    const k = (x.uid || 'fila ' + x.f.fila) + '|' + (x.f.fecha ? ymd_(x.f.fecha) : '');
    if (vistas[k]) return;
    vistas[k] = hoy;
    av('suspendida_con_datos', 'fila ' + x.f.fila + ' | ' + (x.f.figura || '(sin figura)') + ' | ' + (x.f.fecha ? fmtFecha_(x.f.fecha) : '(sin fecha)') +
       ' | la suspendió el sistema (salió del mail o estaba cancelada en el mail) y después recibió ' +
       [_hayDatoAgenda_(x.asistentes) ? 'asistentes (' + str(x.asistentes) + ')' : '', _hayDatoAgenda_(x.inscriptos) ? 'inscriptos (' + str(x.inscriptos) + ')' : '']
         .filter(Boolean).join(' e ') + '. No se pisó nada: el STATUS sigue "Suspendida". ¿Se hizo igual? Si se hizo, el equipo la pasa a Realizada.');
    n++;
  });
  if (n && props) { try { props.setProperty(AGENDA_PROP_SUSP_CON_DATOS, JSON.stringify(vistas)); } catch (err) { /* el aviso nunca corta */ } }
  return n;
}
