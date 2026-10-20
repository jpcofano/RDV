/**
 * diagnostico/39_reprogramadas.js — "REPROGRAMADA" EN VEZ DE "SUSPENDIDA", MEDIDO HACIA ATRÁS (20/10, prompt 09, 6c; paso 110).
 * SÓLO LECTURA: no escribe NADA (ni la base, ni la intermedia, ni REGISTRO_AGENDA, ni la cache de geocodificación, ni Gmail).
 * Sólo el log y el objeto.
 *
 *   medirReprogramadas({ desde: '2026-07-15' })
 *
 * La misma lectura que el paso 93 (diagnostico/35_cancelaciones_mail.js): los mails desde `desde` − 7 días CON el HTML, el parser
 * con los COLORES prendidos y el plan de la agenda con la cancelación automática en modo "suspender" y AGENDA_REPROGRAMADA
 * PRENDIDA (todo por opciones: 00_Config.js no se toca), sobre las reuniones con fecha desde `desde`. Es el ESTADO FINAL de cada
 * semana. Por cada reunión CANCELADA EN EL MAIL (desapareció, o en ROJO entero) con fila en la base:
 *   - si la regla la deja "Reprogramada" (la misma figura, en el mismo lugar, en una fecha posterior a AGENDA_REPROGRAMADA_DIAS
 *     días o menos: `reprogramacionDeAgenda_`), con la fecha nueva y la fila nueva (y su agenda_uid); si no, "Suspendida";
 *   - contra el STATUS que tiene hoy la fila: Reprogramada = COINCIDE; Suspendida del equipo = NO COINCIDE (no se toca, sólo se
 *     cuenta: el caso Clara Muzzio 09/09 → 18/09); Suspendida del sistema = pasaría a Reprogramada; "en agenda" = la marcaría hoy;
 *     Realizada u otro = no se toca;
 *   - y lo que la regla de tiempo o una salvaguarda frenarían (como el paso 93).
 * `opciones` (los tests): `mails`, `geocodificar`, `historial`, `elecciones`, `conjunto`, `hoy`.
 */

/** Desde cuándo se mide (la fecha de la reunión). */
const REPROGRAMADAS_DESDE = '2026-07-15';

function medirReprogramadas(opciones) {
  opciones = opciones || {};
  const t0 = Date.now();
  const desde = toDate_(opciones.desde || REPROGRAMADAS_DESDE);
  Logger.log('=== medirReprogramadas (paso 110) — SÓLO LECTURA: desde el %s, qué cancelaciones del mail habrían quedado "Reprogramada" ' +
             '(la misma figura, en el mismo lugar, en una fecha posterior a %s días o menos) y cuáles "Suspendida", contra el STATUS de hoy; ' +
             'no escribe nada (AGENDA_REPROGRAMADA hoy: %s) ===', fmtFecha_(desde), AGENDA_REPROGRAMADA_DIAS, AGENDA_REPROGRAMADA ? 'PRENDIDO' : 'apagado');
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
    cancelacionAutomatica: true, cancelacionModo: 'suspender', coloresMail: true, reprogramada: true });
  const iAs = dest.D ? dest.D['Asistentes'] : null;
  const lineas = [];
  const c = { evaluadas: 0, reprogramada: 0, suspendida: 0, coincide: 0, noCoincide: 0, pasaria: 0, marcariaHoy: 0, noSeToca: 0,
              porTiempo: 0, salvaguarda: 0, sinFila: 0, pasadas: 0 };
  const yaVista = new Set();
  P.cancelacionesEvaluadas.forEach(function (x) {
    if (/ya había pasado cuando salió del mail/.test(x.decision)) { c.pasadas++; return; }
    const d = x.d, f = x.f;
    if (!f) { c.sinFila++; return; }
    // la misma fila evaluada dos veces (desaparecida de un grupo y en rojo en otro): una sola línea
    const k = f.fila + '|' + (d.clave || '');
    if (yaVista.has(k)) return;
    yaVista.add(k);
    c.evaluadas++;
    const rp = x.reprogramada || (P.reprogramacionDe ? P.reprogramacionDe(d, f) : null);
    const status = str(f.valores[A['STATUS REUNIÓN']]);
    const escrito = A.agenda_status_escrito == null ? '' : str(f.valores[A.agenda_status_escrito]);
    const n = normStatus_(status);
    const delSistema = !!escrito && normStatus_(escrito) === n;
    const asis = iAs != null ? f.valores[iAs] : '';
    const regla = rp ? 'Reprogramada' : 'Suspendida';
    if (rp) c.reprogramada++; else c.suspendida++;
    let equipo, tipo;
    const salvaguarda = /^no: (protección|el mail que la sacó tiene formato raro|el mail en rojo tiene formato raro|\d+ filas candidatas|su semana sólo|el equipo eligió "Sigue")/.test(x.decision);
    if (x.tiempo && !x.tiempo.aTiempo) { equipo = 'RECHAZADA POR EL TIEMPO: ' + x.tiempo.texto + ' (no se tocaría)'; tipo = 'porTiempo'; }
    else if (salvaguarda) { equipo = 'frenada por una salvaguarda: ' + x.decision.replace(/^no: /, ''); tipo = 'salvaguarda'; }
    else if (n === normStatus_(regla)) { equipo = 'COINCIDE: la fila ya está "' + status + '"' + (delSistema ? ' (la puso el sistema)' : ' (la puso el equipo)'); tipo = 'coincide'; }
    else if (n === 'suspendida' && rp && delSistema) { equipo = 'la suspendió el sistema: PASARÍA a Reprogramada'; tipo = 'pasaria'; }
    else if (n === 'suspendida' && rp) { equipo = 'NO COINCIDE: el equipo la tiene Suspendida (no se toca: es del equipo; sólo se cuenta)'; tipo = 'noCoincide'; }
    else if (n === 'reprogramada' && !rp) { equipo = 'NO COINCIDE: el equipo la tiene Reprogramada y la regla no encontró la fecha nueva (no se toca)'; tipo = 'noCoincide'; }
    else if (n === 'en agenda') { equipo = 'la marcaría "' + regla + '" hoy (el "en agenda" lo puso ' + (delSistema ? 'el sistema' : 'el equipo') + ')'; tipo = 'marcariaHoy'; }
    else {
      equipo = 'no se toca: la fila está "' + (status || '(vacío)') + '"' + (n === 'realizada' && _hayDatoAgenda_(asis) ? ' con ' + str(asis) + ' asistentes' : '') +
               ' (la regla diría "' + regla + '")';
      tipo = 'noSeToca';
    }
    c[tipo]++;
    lineas.push({ reunion: _textoReunionAgenda_(d), por: x.por === 'rojo' ? 'ROJO (' + (x.motivoMail || '') + ')' : 'desapareció (' + fmtFecha_(d.mailQueLaSaco) + ')',
                  fila: f.fila, status: status, statusDelSistema: delSistema, regla: regla, tipo: tipo, equipo: equipo, decision: x.decision,
                  fechaNueva: rp ? fmtFecha_(rp.fecha) : '', filaNueva: rp ? rp.fila : '', uidNueva: rp ? rp.uid : '', como: rp ? rp.como : '',
                  texto: rp ? textoReprogramadaAgenda_(rp) : '' });
  });
  Logger.log('--- las cancelaciones del mail con fila desde el %s: %s → la regla las dejaría REPROGRAMADA %s | SUSPENDIDA %s (y %s sin fila, %s que ya ' +
             'habían pasado: no son cancelación) ---', fmtFecha_(desde), c.evaluadas, c.reprogramada, c.suspendida, c.sinFila, c.pasadas);
  const titulos = { coincide: 'COINCIDEN con el STATUS de hoy', noCoincide: 'NO COINCIDEN (lo del equipo no se toca: sólo se cuenta)',
                    pasaria: 'Suspendidas por el sistema que pasarían a Reprogramada', marcariaHoy: 'las marcaría hoy (están "en agenda")',
                    noSeToca: 'otro STATUS: no se tocarían', porTiempo: 'rechazadas por el tiempo (el mail es posterior a la reunión)',
                    salvaguarda: 'frenadas por una salvaguarda' };
  ['coincide', 'noCoincide', 'pasaria', 'marcariaHoy', 'noSeToca', 'porTiempo', 'salvaguarda'].forEach(function (t) {
    const xs = lineas.filter(function (l) { return l.tipo === t; });
    if (!xs.length) return;
    Logger.log('  == %s: %s ==', titulos[t], xs.length);
    xs.forEach(function (l) {
      Logger.log('    %s | %s | fila %s | STATUS hoy "%s" | la regla: %s%s | %s', l.reunion, l.por, l.fila, l.status || '—', l.regla,
                 l.texto ? ' (' + l.texto + ', ' + l.como + ')' : '', l.equipo);
    });
  });
  Logger.log('  >>> RESUMEN: Reprogramada %s | Suspendida %s || coinciden %s | NO coinciden %s | pasarían de Suspendida a Reprogramada %s | ' +
             'las marcaría hoy %s | otro STATUS (no se tocan) %s | rechazadas por el tiempo %s | salvaguardas %s',
             c.reprogramada, c.suspendida, c.coincide, c.noCoincide, c.pasaria, c.marcariaHoy, c.noSeToca, c.porTiempo, c.salvaguarda);
  Logger.log('medirReprogramadas: %s ms', Date.now() - t0);
  return { lineas: lineas, cuenta: c };
}
