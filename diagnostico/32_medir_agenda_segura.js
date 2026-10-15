/**
 * diagnostico/32_medir_agenda_segura.js — 15/10 (noche): MEDIR antes de prender la agenda segura (H1-H4) y la cancelación
 * automática que sólo suspende (J). SÓLO LECTURA: no escribe NADA (ni la base, ni la intermedia, ni REGISTRO_AGENDA, ni la
 * cache de geocodificación; no llama a Maps). Sólo el log y el objeto que devuelve.
 *
 *   medirAgendaSegura()          HOY, en seco: el plan de la agenda con las reglas de siempre y con H1-H4 prendidas; qué
 *                                cambia en cada reunión, las "pendiente de definir" (y cuándo se crearían), lo conciliado, el
 *                                invariante "una reunión, una fila" en la base (con y sin el mail), los mails raros y las
 *                                reuniones repetidas en un mail.
 *   replayAgendaSegura()         LA HISTORIA desde AGSEG_DESDE (07/09): los mails en orden, cada uno (y cada día a las 10:00)
 *                                como una corrida de la agenda simulada EN MEMORIA, con la regla de hoy y con H1-H4: cuántas
 *                                filas se habrían creado "de más" (la misma reunión que una fila viva), las pendientes y cuándo
 *                                se habrían creado. Límites: ver la función.
 *   medirCancelacionAutomatica() J: las reuniones que salieron del mail desde AGSEG_DESDE, qué haría la regla nueva (suspender) y
 *                                la regla 7 de hoy (borrar las intocadas), contra el STATUS que tiene hoy la fila (lo que hizo
 *                                el equipo); y las preguntas de cancelación de AGENDA_DUPLICADOS, cómo se resolverían.
 *
 * `opciones` (sólo los tests): `mails`, `geocodificar`, `historial`, `elecciones`, `conjunto`.
 * Usa `_queHaceAgendaDupAg_` y `_geoSoloCacheDupAg_` (diagnostico/30_duplicados_agenda.js).
 */

/** Desde cuándo se miden la historia y las cancelaciones (las semanas desde el 07/09). */
const AGSEG_DESDE = '2026-09-07';
/** El corte propio del replay (Apps Script corta a los 6 minutos). */
const AGSEG_CORTE_MS = 4.5 * 60 * 1000;

/** Las cuatro reglas nuevas de la agenda, prendidas (para forzarlas en el plan en seco). */
function _reglasNuevasAgSeg_() { return { soloIdentificadas: true, conciliacion: true, invariante: true, validarMails: true }; }
/** Las cuatro, apagadas (el plan de hoy aunque alguna ya esté prendida en 00_Config.js). */
function _reglasHoyAgSeg_() { return { soloIdentificadas: false, conciliacion: false, invariante: false, validarMails: false }; }

/** Los mails: los de la lista de prueba, o los de Gmail desde `desde` (sólo lectura). */
function _mailsAgSeg_(opciones, desde) {
  if (opciones.mails) return { fuente: '(lista de prueba)', lista: opciones.mails };
  return leerMailsAgendaGmail_(new Date(desde.getTime() - 7 * 86400000));
}

/** Qué hace un plan con una reunión, en palabras: lo de `_queHaceAgendaDupAg_` más los estados nuevos. */
function _queHaceAgSeg_(P, ev, A, dest) {
  if (!ev) return 'no está (el mail que la trae no se usa: formato raro)';
  const x = P.filaDe.get(ev.clave);
  if (x && x.pendiente) return 'pendiente de definir: no se crea todavía (se crearía el ' + fmtFecha_(x.seCrea) + ', o antes si llega la figura o la dirección)';
  if (x && x.repetidaMail) return 'no se crea: la misma reunión dos veces en el mail';
  if (x && x.bloqueada) return 'no se crea: la semana tiene una reunión en dos filas';
  if (x && x.duplicado && P.duplicados.some(function (d) { return d.ev === ev && d.conciliacion; })) {
    return 'no se crea: se pregunta en AGENDA_DUPLICADOS (fila de la agenda de esa semana sin su reunión)';
  }
  const t = _queHaceAgendaDupAg_(P, ev, A, dest, true);
  return x && x.conciliada ? t + ' [conciliada]' : t;
}

// ===================== HOY, en seco =====================

/** **HOY, en seco** (sólo lectura): el plan con las reglas de siempre y con H1-H4, reunión por reunión. */
function medirAgendaSegura(opciones) {
  opciones = opciones || {};
  Logger.log('=== medirAgendaSegura — EN SECO, sólo lectura: la agenda con las reglas de hoy y con H1-H4 (crear sólo lo identificado, ' +
             'conciliar por semana, una reunión una fila, validar los mails) prendidas; no escribe nada ===');
  const dest = leerDestino_(), A = indicesAgenda_(dest.hdr), alcance = alcanceAgenda_();
  if (A.faltan.length) Logger.log('  AVISO: a la base le faltan columnas de la agenda: %s', A.faltan.join(', '));
  let mails;
  try { mails = _mailsAgSeg_(opciones, alcance.desde); } catch (err) { Logger.log('>>> no se pudieron leer los mails: %s', err); return { error: String(err) }; }
  const rHoy = agendaDesdeListaDeMails_(mails.lista, { fuente: mails.fuente, validarMails: false });
  const rH = agendaDesdeListaDeMails_(mails.lista, { fuente: mails.fuente, validarMails: true });
  const op = { enSeco: true, historial: opciones.historial || leerHistorialAgenda_(), elecciones: opciones.elecciones || leerEleccionesAgenda_(),
               conjunto: opciones.conjunto || leerConjuntoPorFecha_(), geocodificar: opciones.geocodificar || _geoSoloCacheDupAg_() };
  const pHoy = planAgenda_(dest, rHoy, A, alcance, Object.assign({}, op, _reglasHoyAgSeg_()));
  const pH = planAgenda_(dest, rH, A, alcance, Object.assign({}, op, _reglasNuevasAgSeg_()));
  Logger.log('  mails: %s | alcance: %s | reuniones en el alcance: %s', mails.lista.length, alcance.desc, pHoy.resumen.reunionesEnAlcance);
  ['crear', 'vincular', 'actualizar', 'mover', 'suspender', 'borrar', 'ambiguas', 'duplicadosAntes', 'pendientes', 'conciliadas',
   'invariante', 'bloqueadasInvariante', 'repetidasEnMail'].forEach(function (k) {
    Logger.log('  %s: hoy %s → con H1-H4 %s', k, pHoy.resumen[k] || 0, pH.resumen[k] || 0);
  });
  // 1) el invariante en la base (sin el mail: lo que cuenta el paso 16; con el mail: lo que frena la agenda)
  const invBase = reunionesRepetidasAgenda_(dest.filas, A, null);
  Logger.log('--- 1) una reunión en dos filas, HOY en la base (lo que cuenta el paso 16; tiene que dar 0): %s ---', invBase.length);
  invBase.forEach(function (x) { Logger.log('    %s', x.texto); });
  Logger.log('    con el mail (lo que frenaría la agenda en esas semanas): %s', pH.invariante.length);
  pH.invariante.forEach(function (x) { Logger.log('    %s', x.texto); });
  // 2) las pendientes de definir
  Logger.log('--- 2) PENDIENTE DE DEFINIR (sin figura ni dirección; hoy se crearían): %s ---', pH.pendientes.length);
  pH.pendientes.forEach(function (x) {
    const hoy = pHoy.filaDe.get(x.ev.clave);
    Logger.log('    %s | hoy: %s | se crearía el %s o al llegar la figura o la dirección', _evTextoDupAg_(x.ev),
               hoy && hoy.fila ? 'fila ' + hoy.fila + (hoy.nueva ? ' (nueva)' : ' (ya existe)') : 'sin fila', fmtFecha_(x.seCrea));
  });
  // 3) lo conciliado y lo que se pregunta por la conciliación
  Logger.log('--- 3) CONCILIADAS (la misma reunión que cambió, en la fila de la agenda de esa semana): %s ---', pH.conciliadas.length);
  pH.conciliadas.forEach(function (x) { Logger.log('    %s → fila %s (%s)', _evTextoDupAg_(x.ev), x.f.fila, x.como); });
  // 4) los mails
  Logger.log('--- 4) mails con FORMATO RARO (con H4 no se usan): %s | la misma reunión dos veces en un mail: %s ---',
             rH.mailsRaros.length, rH.repetidasEnMail.length);
  rH.mailsRaros.forEach(function (m) { Logger.log('    %s | %s | %s', fmtFecha_(m.fecha), m.asunto, m.motivos.join('; ')); });
  rH.repetidasEnMail.forEach(function (m) { Logger.log('    REPETIDA | %s | %s', m.asunto, m.texto); });
  // 5) reunión por reunión
  const porClave = new Map();
  rH.unicas.forEach(function (ev) { porClave.set(ev.clave + '|' + ev.grupo, ev); });
  const cambios = [];
  rHoy.unicas.forEach(function (ev) {
    if (!_enAlcance_(alcance, ev.fecha)) return;
    const a = _queHaceAgSeg_(pHoy, ev, A, dest), b = _queHaceAgSeg_(pH, porClave.get(ev.clave + '|' + ev.grupo), A, dest);
    if (a !== b) cambios.push({ reunion: _evTextoDupAg_(ev), hoy: a, con: b });
  });
  Logger.log('--- 5) las reuniones que cambian (hoy → con H1-H4): %s ---', cambios.length);
  cambios.forEach(function (c) { Logger.log('  %s:\n      hoy: %s\n      → con H1-H4: %s', c.reunion, c.hoy, c.con); });
  return { invarianteBase: invBase.map(function (x) { return x.texto; }), invarianteConMail: pH.invariante.length,
           pendientes: pH.pendientes.map(function (x) { return { reunion: _evTextoDupAg_(x.ev), seCrea: fmtFecha_(x.seCrea) }; }),
           conciliadas: pH.conciliadas.map(function (x) { return { reunion: _evTextoDupAg_(x.ev), fila: x.f.fila }; }),
           mailsRaros: rH.mailsRaros.length, repetidasEnMail: rH.repetidasEnMail.length, cambios: cambios,
           resumenHoy: pHoy.resumen, resumenH: pH.resumen };
}

// ===================== LA HISTORIA, simulada en memoria =====================

/**
 * **LA HISTORIA desde AGSEG_DESDE, simulada** (sólo lectura). Cómo:
 *   - la base de partida: las filas de HOY con fecha desde AGSEG_DESDE − 10 días que NO creó la agenda (agenda_uid "c-…"
 *     afuera), con las 16 columnas de la agenda vacías (las vinculadas se vuelven a vincular en la simulación);
 *   - los momentos: cada mail y cada día a las 10:00, desde AGSEG_DESDE hasta hoy. En cada uno, los mails recibidos hasta ese
 *     momento (los de los 37 días anteriores, como la corrida real) y el plan de la agenda con "hoy" = ese día y el alcance de
 *     ese día (hoy − DIAS_ACTIVOS); lo que el plan escribiría se aplica a la base simulada;
 *   - dos simulaciones independientes: la regla de hoy (las cuatro reglas apagadas; lo demás, como está en 00_Config.js) y
 *     con H1-H4 prendidas;
 *   - "de más": una fila creada cuya reunión (`claveInvarianteFila_`) ya tenía una fila viva en la base simulada, y el mail no
 *     traía tantas reuniones con esa clave.
 * Límites (decirlos al leer los números): las filas que cargó el equipo están desde el principio aunque las haya cargado
 * después (y las que borró, no están); nadie contesta AGENDA_DUPLICADOS; la Figura de las Seguridad no se completa desde RDV
 * CONJUNTO; el barrio, sólo con la cache de geocodificación; el equipo no edita ni borra nada en el medio. Con el corte
 * propio (AGSEG_CORTE_MS) termina antes y lo dice.
 */
function replayAgendaSegura(opciones) {
  opciones = opciones || {};
  const t0 = Date.now();
  Logger.log('=== replayAgendaSegura — sólo lectura: la agenda desde el %s, simulada en memoria con la regla de hoy y con H1-H4 ===',
             fmtFecha_(toDate_(AGSEG_DESDE)));
  const desde = toDate_(AGSEG_DESDE), hoy = hoyMediodia_();
  const dest = leerDestino_(), A = indicesAgenda_(dest.hdr);
  let mails;
  try { mails = _mailsAgSeg_(opciones, desde); } catch (err) { Logger.log('>>> no se pudieron leer los mails: %s', err); return { error: String(err) }; }
  const lista = mails.lista.slice().sort(function (a, b) { return a.fecha - b.fecha; });
  // los momentos: cada mail desde `desde` y cada día a las 10:00
  const momentos = [];
  lista.forEach(function (m) { if (m.fecha >= desde && m.fecha <= new Date()) momentos.push(m.fecha); });
  for (let d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate(), 10, 0, 0); d <= new Date(); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 10, 0, 0)) momentos.push(d);
  momentos.sort(function (a, b) { return a - b; });
  const geo = opciones.geocodificar || _geoSoloCacheDupAg_();
  const iAgenda = COLUMNAS_AGENDA.map(function (n) { return A[n]; }).filter(function (i) { return i != null; });
  const corte = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() - 10, 12, 0, 0);
  const nueva = function (nombre, flags) {
    const filas = dest.filas.filter(function (f) {
      return f.fecha && f.fecha >= corte && !/^c-/.test(str(A.agenda_uid == null ? '' : f.valores[A.agenda_uid]));
    }).map(function (f) {
      const v = f.valores.slice();
      iAgenda.forEach(function (i) { v[i] = ''; });
      return _filaSimAgSeg_(dest, v, f.fila);
    });
    return { nombre: nombre, flags: flags, dest: { hdr: dest.hdr, D: dest.D, T: dest.T, filas: filas },
             hist: { creadas: new Map(), olvidadas: new Set(), notadas: new Set(), yaCargadas: new Set(), error: '' },
             creadas: 0, deMas: [], pendientes: new Map(), cache: { n: -1, r: null } };
  };
  const sims = [nueva('regla de hoy', _reglasHoyAgSeg_()), nueva('con H1-H4', _reglasNuevasAgSeg_())];
  _memoFigurasAgenda_ = new Map();
  let ultimo = null, cortado = false;
  try {
    for (let k = 0; k < momentos.length; k++) {
      if (Date.now() - t0 > AGSEG_CORTE_MS) { cortado = true; break; }
      const t = momentos[k];
      const dia = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12, 0, 0);
      const alcance = { desde: new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() - (DIAS_ACTIVOS || 30), 12, 0, 0), hasta: null, desc: 'simulado' };
      const vistos = lista.filter(function (m) { return m.fecha <= t && m.fecha >= new Date(t.getTime() - 37 * 86400000); });
      sims.forEach(function (s) {
        if (s.cache.n !== vistos.length || s.cache.ultima !== (vistos.length ? vistos[vistos.length - 1].fecha.getTime() : 0)) {
          s.cache = { n: vistos.length, ultima: vistos.length ? vistos[vistos.length - 1].fecha.getTime() : 0,
                      r: agendaDesdeListaDeMails_(vistos, { fuente: 'replay', validarMails: s.flags.validarMails }) };
        }
        const r = s.cache.r;
        const P = planAgenda_(s.dest, r, A, alcance, Object.assign({ enSeco: true, hoy: dia, historial: s.hist, elecciones: new Map(),
                                                                     conjunto: new Map(), geocodificar: geo }, s.flags));
        P.pendientes.forEach(function (x) {
          const id = idReunionAgenda_(x.ev);
          if (!s.pendientes.has(id)) s.pendientes.set(id, { ev: x.ev, primero: t, creada: null, por: '' });
        });
        _aplicarPlanSimAgSeg_(s, P, r, A, t);
      });
      ultimo = t;
    }
  } finally {
    _memoFigurasAgenda_ = null;
  }
  Logger.log('  mails: %s | momentos simulados: %s de %s (hasta el %s)%s | filas de partida: %s', lista.length,
             momentos.indexOf(ultimo) + 1, momentos.length, ultimo ? Utilities.formatDate(ultimo, RDV_TZ, 'dd/MM HH:mm') : '—',
             cortado ? ' — CORTADO por tiempo: los números son hasta ahí' : '', sims[0].dest.filas.length);
  const out = {};
  sims.forEach(function (s) {
    const ultimaR = s.cache.r || { unicas: [] };
    const cuenta = {};
    ultimaR.unicas.forEach(function (ev) { const k = claveInvarianteEvento_(ev); if (k) cuenta[k] = (cuenta[k] || 0) + 1; });
    const fin = reunionesRepetidasAgenda_(s.dest.filas, A, null);
    Logger.log('--- %s: filas creadas %s | creadas DE MÁS (la misma reunión que una fila viva) %s | una reunión en dos filas al final %s ---',
               s.nombre, s.creadas, s.deMas.length, fin.length);
    s.deMas.forEach(function (x) { Logger.log('    DE MÁS | creada el %s | %s', Utilities.formatDate(x.cuando, RDV_TZ, 'dd/MM HH:mm'), x.texto); });
    fin.forEach(function (x) { Logger.log('    AL FINAL, EN DOS FILAS | %s', x.texto); });
    const pend = [];
    s.pendientes.forEach(function (p) { pend.push(p); });
    if (pend.length) {
      Logger.log('  PENDIENTES DE DEFINIR (no se crearon al llegar; cuándo se crearon y por qué): %s', pend.length);
      pend.forEach(function (p) {
        Logger.log('    %s | pendiente desde el %s | %s', _evTextoDupAg_(p.ev), Utilities.formatDate(p.primero, RDV_TZ, 'dd/MM HH:mm'),
                   p.creada ? 'creada el ' + Utilities.formatDate(p.creada, RDV_TZ, 'dd/MM HH:mm') + ' (' + p.por + ')' : 'nunca se creó (todavía pendiente, o salió del mail)');
      });
    }
    out[s.nombre] = { creadas: s.creadas, deMas: s.deMas.map(function (x) { return x.texto; }), alFinal: fin.length,
                      pendientes: pend.map(function (p) { return { reunion: _evTextoDupAg_(p.ev), creada: p.creada ? fmtFecha_(p.creada) : '', por: p.por }; }) };
  });
  Logger.log('  >>> RESUMEN: de más con la regla de hoy %s | con H1-H4 %s | pendientes con H1-H4 %s%s', out['regla de hoy'].deMas.length,
             out['con H1-H4'].deMas.length, out['con H1-H4'].pendientes.length, cortado ? ' (CORTADO)' : '');
  out.cortado = cortado;
  return out;
}

/** Una fila de la base simulada (los campos que usa el plan de la agenda), desde sus valores. */
function _filaSimAgSeg_(dest, valores, fila) {
  const D = dest.D;
  const iL = findIdxOr_(dest.hdr, aliasColumna_('Lugar (mail)'), true);
  return { fila: fila, valores: valores, figura: str(valores[D['Figura']]), barrio: D['Barrio'] != null ? str(valores[D['Barrio']]) : '',
           fecha: toDate_(valores[D['FECHA']]), lugarMail: iL != null ? str(valores[iL]) : '',
           evento: D['EVENTO'] != null ? str(valores[D['EVENTO']]) : '', uid: '' };
}

/** Aplica a la base simulada lo que el plan escribiría (crear, y las celdas de las demás acciones; borrar saca la fila). */
function _aplicarPlanSimAgSeg_(s, P, r, A, cuando) {
  const porFila = new Map();
  s.dest.filas.forEach(function (f) { porFila.set(f.fila, f); });
  const cuenta = {};
  r.unicas.forEach(function (ev) { const k = claveInvarianteEvento_(ev); if (k) cuenta[k] = (cuenta[k] || 0) + 1; });
  const vivas = function (k) {
    return s.dest.filas.filter(function (f) {
      const st = normStatus_(A['STATUS REUNIÓN'] == null ? '' : f.valores[A['STATUS REUNIÓN']]);
      return (!st || st === 'en agenda' || st === 'realizada') && claveInvarianteFila_(f, A) === k;
    });
  };
  const tocadas = new Set();
  P.acciones.forEach(function (a) {
    if (a.tipo === 'borrar') {
      s.dest.filas = s.dest.filas.filter(function (f) { return f.fila !== a.f.fila; });
      porFila.delete(a.f.fila);
      return;
    }
    if (a.tipo === 'crear') {
      const v = s.dest.hdr.map(function () { return ''; });
      a.escrituras.forEach(function (e) { v[e.col - 1] = e.valor; });
      const f = _filaSimAgSeg_(s.dest, v, a.fila);
      const k = claveInvarianteFila_(f, A);
      if (k) {
        const ya = vivas(k);
        if (ya.length + 1 > Math.max(1, cuenta[k] || 0)) {
          s.deMas.push({ cuando: cuando, texto: _evTextoDupAg_(a.ev) + ' → fila nueva ' + a.fila + ' (ya estaba: fila ' + ya.map(function (x) { return x.fila; }).join(', ') + ')' });
        }
      }
      s.dest.filas.push(f);
      porFila.set(f.fila, f);
      s.hist.creadas.set(a.uid, a.id);
      s.creadas++;
      const p = s.pendientes.get(idReunionAgenda_(a.ev));
      if (p && !p.creada) {
        p.creada = cuando;
        p.por = a.ev.figuraFila ? 'llegó la figura' : (esDireccionReal_(a.ev.lugarTexto) ? 'llegó la dirección' : 'faltaban ' + AGENDA_CREAR_SIN_DEFINIR_DIAS + ' días o menos');
      }
      return;
    }
    a.escrituras.forEach(function (e) {
      const f = porFila.get(e.fila);
      if (!f) return;
      f.valores[e.col - 1] = e.valor;
      tocadas.add(f.fila);
    });
  });
  tocadas.forEach(function (n) {
    const f = porFila.get(n);
    const g = _filaSimAgSeg_(s.dest, f.valores, n);
    Object.keys(f).forEach(function (k) { if (/^_ubic/.test(k)) delete f[k]; });
    ['figura', 'barrio', 'fecha', 'lugarMail', 'evento'].forEach(function (k) { f[k] = g[k]; });
  });
}

// ===================== J: la cancelación automática que sólo suspende =====================

/**
 * **J, sólo lectura**: las reuniones que salieron del mail (mails desde AGSEG_DESDE − 7) con fecha desde AGSEG_DESDE, y qué
 * harían la regla nueva (AGENDA_CANCELACION_AUTOMATICA + modo 'suspender') y la regla 7 de hoy (modo 'regla7': borra la fila
 * que creó la agenda y nadie tocó), contra el STATUS que tiene HOY la fila (lo que hizo el equipo). Y las preguntas de
 * cancelación que hay hoy en AGENDA_DUPLICADOS, cómo se resolverían con la regla nueva.
 */
function medirCancelacionAutomatica(opciones) {
  opciones = opciones || {};
  Logger.log('=== medirCancelacionAutomatica — sólo lectura: las reuniones que salieron del mail desde el %s, con la regla nueva ' +
             '("suspender", nunca borrar) y con la regla 7 de hoy; no escribe nada ===', fmtFecha_(toDate_(AGSEG_DESDE)));
  const desde = toDate_(AGSEG_DESDE);
  const dest = leerDestino_(), A = indicesAgenda_(dest.hdr);
  let mails;
  try { mails = _mailsAgSeg_(opciones, desde); } catch (err) { Logger.log('>>> no se pudieron leer los mails: %s', err); return { error: String(err) }; }
  const r = agendaDesdeListaDeMails_(mails.lista, { fuente: mails.fuente });
  const alcance = { desde: desde, hasta: null, desc: 'desde el ' + fmtFecha_(desde) };
  const op = { enSeco: true, historial: opciones.historial || leerHistorialAgenda_(), elecciones: opciones.elecciones || leerEleccionesAgenda_(),
               conjunto: opciones.conjunto || new Map(), geocodificar: opciones.geocodificar || _geoSoloCacheDupAg_(), cancelacionAutomatica: true };
  const pS = planAgenda_(dest, r, A, alcance, Object.assign({}, op, { cancelacionModo: 'suspender' }));
  const p7 = planAgenda_(dest, r, A, alcance, Object.assign({}, op, { cancelacionModo: 'regla7' }));
  const de7 = new Map();
  p7.cancelacionesEvaluadas.forEach(function (x) { de7.set(x.d.clave + '|' + x.d.grupo, x.decision); });
  const st = function (f) { return f ? str(f.valores[A['STATUS REUNIÓN']]) : ''; };
  const lineas = [], cuenta = { suspenderia: 0, borraria7: 0, yaSuspendida: 0, noCoincide: 0, pasadas: 0, sinFila: 0 };
  pS.cancelacionesEvaluadas.forEach(function (x) {
    if (/ya había pasado/.test(x.decision)) { cuenta.pasadas++; return; }
    const d7 = de7.get(x.d.clave + '|' + x.d.grupo) || '—';
    const status = st(x.f), n = normStatus_(status);
    let equipo;
    if (!x.f) { equipo = 'sin fila en la base'; cuenta.sinFila++; }
    else if (n === 'suspendida') { equipo = 'COINCIDE: ya está Suspendida'; cuenta.yaSuspendida++; }
    else if (n === 'en agenda') equipo = x.decision === 'suspender' ? 'el equipo todavía no la suspendió' : 'sigue "en agenda"';
    else { equipo = 'NO COINCIDE: la fila está "' + status + '" (¿se hizo igual, o se reprogramó?)'; cuenta.noCoincide++; }
    if (x.decision === 'suspender') cuenta.suspenderia++;
    if (d7 === 'borrar') cuenta.borraria7++;
    lineas.push({ reunion: _evTextoDupAg_(x.d), fila: x.f ? x.f.fila : '', status: status, nueva: x.decision, regla7: d7, equipo: equipo,
                  salio: fmtFecha_(x.d.mailQueLaSaco) + ' (' + (x.d.asuntoQueLaSaco || '') + ')' });
  });
  Logger.log('--- las reuniones FUTURAS que salieron del mail: %s (y %s que ya habían pasado: no son cancelación) ---', lineas.length, cuenta.pasadas);
  lineas.forEach(function (l) {
    Logger.log('  %s | fila %s | STATUS hoy "%s" | regla nueva: %s | regla 7: %s | %s | salió: %s', l.reunion, l.fila || '—', l.status || '—',
               l.nueva, l.regla7, l.equipo, l.salio);
  });
  Logger.log('  >>> la regla nueva suspendería %s | la regla 7 borraría %s | ya Suspendidas por el equipo (coincide) %s | con OTRO STATUS ' +
             '(no coincide) %s | sin fila %s', cuenta.suspenderia, cuenta.borraria7, cuenta.yaSuspendida, cuenta.noCoincide, cuenta.sinFila);
  // las salvaguardas que frenarían alguna
  Logger.log('  NO se suspendería por una salvaguarda (se avisaría: cancelacion_no_aplicada): %s', pS.cancelNoAplicada.length);
  pS.cancelNoAplicada.forEach(function (x) { Logger.log('    %s | %s', _evTextoDupAg_(x.d), x.motivo); });
  // las preguntas de hoy en AGENDA_DUPLICADOS
  const preguntas = [];
  try {
    const sh = ssDestino_().getSheetByName(AGENDA_SOLAPA_DUPLICADOS);
    if (sh && sh.getLastRow() > 1) {
      const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
      const hdr = v[0].map(normalizeHeader_);
      const i = function (n) { return hdr.indexOf(normalizeHeader_(n)); };
      const porId = new Map();
      pS.cancelacionesEvaluadas.forEach(function (x) { porId.set('cancelacion|' + idReunionAgenda_(x.d), x); });
      v.slice(1).forEach(function (row) {
        if (normalizeText_(row[i('tipo')]) !== 'cancelacion') return;
        const x = porId.get(str(row[i('id_reunion')]));
        preguntas.push({ reunion: str(row[i('reunión del mail')]), elegido: str(row[i('ELEGIR')]),
                         resultado: x ? (x.decision === 'suspender' ? 'se SUSPENDE (fila ' + x.f.fila + ')' : x.decision) : 'ya no sale del mail en el alcance' });
      });
    }
  } catch (err) { Logger.log('  %s no se pudo leer: %s', AGENDA_SOLAPA_DUPLICADOS, err); }
  Logger.log('--- las preguntas de cancelación de hoy en %s, con la regla nueva: %s ---', AGENDA_SOLAPA_DUPLICADOS, preguntas.length);
  preguntas.forEach(function (p) { Logger.log('    %s | ELEGIR "%s" → %s', p.reunion, p.elegido || '', p.resultado); });
  return { lineas: lineas, cuenta: cuenta, noAplicadas: pS.cancelNoAplicada.length, preguntas: preguntas };
}
