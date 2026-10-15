/**
 * diagnostico/35_cancelaciones_mail.js — "EL MAIL MANDA", MEDIDO HACIA ATRÁS (15/10, noche; paso 93). SÓLO LECTURA: no escribe
 * NADA (ni la base, ni la intermedia, ni REGISTRO_AGENDA, ni la cache de geocodificación, ni Gmail). Sólo el log y el objeto.
 *
 *   medirCancelacionesMail({ desde: '2026-07-15' })
 *
 * Los mails desde `desde` − 7 días CON el HTML (la lectura de la auditoría de cancelaciones, diagnostico/31: `_leerMailsAudCan_`),
 * el parser con los COLORES prendidos y el plan de la agenda con la cancelación automática en modo "suspender" (todo por
 * opciones: 00_Config.js no se toca), sobre las reuniones con fecha desde `desde`. Es el ESTADO FINAL de cada semana (la última
 * versión válida), no una corrida por hora. Por cada reunión CANCELADA EN EL MAIL (desapareció de una versión nueva completa
 * siendo futura, o en ROJO ENTERO en la última versión válida):
 *   - si el mail que la cancela es ANTERIOR a la reunión (el tiempo de "el mail manda"), o no (rechazada por el tiempo);
 *   - contra el STATUS que le puso el equipo: Suspendida = COINCIDE; Realizada = NO COINCIDE (con los asistentes); "en agenda" =
 *     la suspendería hoy; otro STATUS (Reprogramada…): no se tocaría y avisaría (como la 824);
 *   - las notas del mail que la nombran ("SE CANCELA …"), como confirmación;
 *   - las que no se aplicarían por una salvaguarda (60%, formato raro, varias filas).
 * `opciones` (los tests): `mails`, `geocodificar`, `historial`, `elecciones`, `conjunto`, `hoy`.
 */

/** Desde cuándo se mide (la fecha de la reunión). */
const CANCEL_MAIL_DESDE = '2026-07-15';

function medirCancelacionesMail(opciones) {
  opciones = opciones || {};
  const t0 = Date.now();
  const desde = toDate_(opciones.desde || CANCEL_MAIL_DESDE);
  Logger.log('=== medirCancelacionesMail (paso 93) — SÓLO LECTURA: qué filas habría suspendido "el mail manda" (desaparecidas y en ROJO ' +
             'entero) desde el %s, contra lo que hizo el equipo; no escribe nada ===', fmtFecha_(desde));
  const dest = leerDestino_(), A = indicesAgenda_(dest.hdr);
  let mails;
  try {
    mails = opciones.mails ? { fuente: '(lista de prueba)', lista: opciones.mails } : _leerMailsAudCan_(new Date(desde.getTime() - 7 * 86400000));
  } catch (err) { Logger.log('>>> no se pudieron leer los mails: %s', err); return { error: String(err) }; }
  const r = agendaDesdeListaDeMails_(mails.lista, { fuente: mails.fuente, coloresMail: true });
  Logger.log('  mails: %s (%s) | con HTML: %s | reuniones en rojo entero (estado final): %s', mails.lista.length, mails.fuente,
             mails.lista.filter(function (m) { return str(m.html); }).length, r.colores ? r.colores.rojas : 0);
  const alcance = { desde: desde, hasta: null, desc: 'desde el ' + fmtFecha_(desde) };
  const P = planAgenda_(dest, r, A, alcance, {
    enSeco: true, historial: opciones.historial || leerHistorialAgenda_(), elecciones: opciones.elecciones || leerEleccionesAgenda_(),
    conjunto: opciones.conjunto || new Map(), geocodificar: opciones.geocodificar || _geoSoloCacheCancelMail_(), hoy: opciones.hoy,
    cancelacionAutomatica: true, cancelacionModo: 'suspender', coloresMail: true });
  const iAs = dest.D ? dest.D['Asistentes'] : null;
  const lineas = [];
  const c = { evaluadas: 0, desaparecidas: 0, rojas: 0, coincide: 0, noCoincide: 0, suspenderiaHoy: 0, porTiempo: 0, otroStatus: 0,
              salvaguarda: 0, sinFila: 0, pasadas: 0, conNota: 0, notaCancela: 0 };
  P.cancelacionesEvaluadas.forEach(function (x) {
    if (/ya había pasado cuando salió del mail/.test(x.decision)) { c.pasadas++; return; }
    c.evaluadas++;
    if (x.por === 'rojo') c.rojas++; else c.desaparecidas++;
    const d = x.d, f = x.f;
    const status = f ? str(f.valores[A['STATUS REUNIÓN']]) : '';
    const n = normStatus_(status);
    const asis = f && iAs != null ? f.valores[iAs] : '';
    let equipo, tipo;
    if (!f) { equipo = 'sin fila en la base'; tipo = 'sinFila'; }
    else if (x.tiempo && !x.tiempo.aTiempo) { equipo = 'RECHAZADA POR EL TIEMPO: ' + x.tiempo.texto + ' (STATUS "' + status + '")'; tipo = 'porTiempo'; }
    else if (n === 'suspendida') { equipo = 'COINCIDE: el equipo la tiene Suspendida'; tipo = 'coincide'; }
    else if (n === 'realizada') { equipo = 'NO COINCIDE: la fila está Realizada' + (_hayDatoAgenda_(asis) ? ' con ' + str(asis) + ' asistentes' : ' (sin asistentes)') + ': no se tocaría y se avisaría'; tipo = 'noCoincide'; }
    else if (n === 'en agenda') {
      if (x.decision === 'suspender') { equipo = 'la SUSPENDERÍA hoy (el equipo todavía no; el "en agenda" lo puso ' + (x.statusDelSistema ? 'el sistema' : 'el equipo') + ')'; tipo = 'suspenderiaHoy'; }
      else { equipo = 'sigue "en agenda" y no se suspendería: ' + x.decision; tipo = 'salvaguarda'; }
    }
    else { equipo = 'otro STATUS ("' + status + '"): no se tocaría y se avisaría'; tipo = 'otroStatus'; }
    if (/^no: (protección|el mail que la sacó tiene formato raro|el mail en rojo tiene formato raro|\d+ filas candidatas|su semana sólo)/.test(x.decision)) tipo = 'salvaguarda';
    c[tipo]++;
    const notas = d.notasMail || [];
    if (notas.length) c.conNota++;
    if (d.notaCancela) c.notaCancela++;
    lineas.push({ reunion: _textoReunionAgenda_(d), por: x.por === 'rojo' ? 'ROJO (' + (x.motivoMail || '') + ')' : 'desapareció (' + fmtFecha_(d.mailQueLaSaco) + ')',
                  fila: f ? f.fila : '', status: status, asistentes: asis, equipo: equipo, tipo: tipo, decision: x.decision,
                  tiempo: x.tiempo ? x.tiempo.texto : '', notas: notas.map(function (k) { return k.texto; }),
                  campos: d.colorMail ? d.colorMail.campos : '' });
  });
  // las reuniones en rojo que no llegaron a evaluarse (sin fila asignada en el plan: lo dice la evaluación) ya están arriba
  Logger.log('--- las reuniones CANCELADAS EN EL MAIL desde el %s: %s (desaparecidas %s, en rojo %s); y %s desaparecidas que ya habían pasado (no son cancelación) ---',
             fmtFecha_(desde), c.evaluadas, c.desaparecidas, c.rojas, c.pasadas);
  ['coincide', 'noCoincide', 'suspenderiaHoy', 'otroStatus', 'porTiempo', 'salvaguarda', 'sinFila'].forEach(function (t) {
    const xs = lineas.filter(function (l) { return l.tipo === t; });
    if (!xs.length) return;
    Logger.log('  == %s: %s ==', { coincide: 'COINCIDEN con el equipo (Suspendida)', noCoincide: 'NO COINCIDEN (Realizada)', suspenderiaHoy: 'las suspendería hoy',
                                   otroStatus: 'otro STATUS: no se tocarían, se avisaría', porTiempo: 'rechazadas por el tiempo (el mail es posterior a la reunión)',
                                   salvaguarda: 'frenadas por una salvaguarda', sinFila: 'sin fila en la base' }[t], xs.length);
    xs.forEach(function (l) {
      Logger.log('    %s | %s | fila %s | STATUS "%s" | %s%s%s', l.reunion, l.por, l.fila || '—', l.status || '—', l.equipo,
                 l.campos ? ' | color: ' + l.campos : '', l.notas.length ? ' | nota: ' + l.notas.join(' / ') : '');
    });
  });
  Logger.log('  >>> RESUMEN: coinciden %s | NO coinciden (Realizada) %s | las suspendería hoy %s | otro STATUS (aviso) %s | rechazadas por el tiempo %s | ' +
             'salvaguardas %s | sin fila %s | con nota del mail %s (que dice que se cancela: %s)', c.coincide, c.noCoincide, c.suspenderiaHoy, c.otroStatus,
             c.porTiempo, c.salvaguarda, c.sinFila, c.conNota, c.notaCancela);
  Logger.log('medirCancelacionesMail: %s ms', Date.now() - t0);
  return { lineas: lineas, cuenta: c };
}
