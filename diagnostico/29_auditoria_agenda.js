/**
 * diagnostico/29_auditoria_agenda.js — AUDITORÍA DE LA AGENDA (15/10). SÓLO LECTURA: no escribe NADA.
 *
 * Ni valores, ni formatos, ni protecciones, ni propiedades, ni etiquetas de Gmail, ni la cache de geocodificación, ni
 * REGISTRO_AGENDA. Sólo el log (Logger.log) y el objeto que devuelve. Se corre desde 99_Correr.js (paso 66).
 *
 * Lee: los mails de agenda desde el lunes de la semana pasada (UNA lectura, con la misma función que usa la agenda:
 * `leerMailsAgendaGmail_`, etiqueta AGENDA_ETIQUETA_GMAIL o asunto AGENDA_ASUNTOS_GMAIL), la base (`leerDestino_`), RDV
 * CONJUNTO, el historial y las elecciones de la agenda, la cache AGENDA_GEOCODE (sin llamar a Maps), las solapas del archivo
 * "Agenda" (Agenda, AgendaCall, Agenda (mail)), la "Agenda" del archivo RDV, AGENDA_DUPLICADOS, AGENDA_FIGURA_A_COMPLETAR y
 * REGISTRO_AGENDA_CAMBIOS.
 *
 * Para saber qué fila es de qué reunión usa EL MISMO plan de la agenda (`planAgenda_`, en memoria, como la agenda en seco y
 * los pasos 49b y 51): el parser, la última versión de cada semana + grupo ("Re:"/"RV:"/"Fwd:" sólo agregan o actualizan),
 * las reuniones únicas entre grupos, las candidatas de cada reunión (regla 4), las ambiguas y los duplicados. No llama a
 * nada que escriba (ni `correrAgenda…`, que registra en REGISTRO_AGENDA).
 *
 * Secciones (cada una en su try/catch: si una falla, las demás siguen y el resumen lo dice):
 *   1. los mails desde el lunes de la semana pasada, y cuál es la versión que vale por semana + grupo;
 *   2. cada reunión de la semana en curso y la siguiente (última versión) contra su fila de la base:
 *      OK / DISTINTO / FALTA EN LA BASE / DUPLICADA;
 *   3. al revés: las filas de la base de esas semanas que no son de ninguna reunión del mail;
 *   4. las copias: "Agenda", "AgendaCall", "Agenda (mail)" (archivo "Agenda") y "Agenda" (archivo RDV);
 *   5. las filas que creó la agenda en los últimos 14 días, y lo pendiente en AGENDA_DUPLICADOS;
 *   6. las reuniones AMBIGUAS (más de una fila candidata): por qué no se distinguen y qué las distinguiría;
 *   7. AGENDA_FIGURA_A_COMPLETAR: cada fila de Seguridad sin figura, por qué, y si la base todavía la tiene vacía;
 *   y un RESUMEN con las cuentas y la lista de todo lo que no está OK.
 */

/** Días hacia atrás para "las filas que creó la agenda". */
const AUDITORIA_AGENDA_DIAS_CREADAS = 14;

/** Las columnas de la base que se comparan contra el mail (sección 2). */
const AUDITORIA_AGENDA_CAMPOS = ['Figura', 'FECHA', 'HORA', 'Dirección', 'Barrio', 'EVENTO', 'STATUS REUNIÓN', 'No participa',
  'Conjunta con', 'Evento (mail)'];

/** La traza de lo que escribió la agenda, por columna (sólo éstas la tienen). */
const AUDITORIA_AGENDA_ESCRITA = { 'HORA': 'agenda_hora_escrita', 'Dirección': 'agenda_direccion_escrita', 'FECHA': 'agenda_fecha_escrita',
  'Barrio': 'agenda_barrio_escrito', 'STATUS REUNIÓN': 'agenda_status_escrito' };

// ===================== El punto de entrada =====================

/**
 * **La auditoría.** `opciones` (sólo para los tests): `mails` (lista en vez de Gmail), `geocodificar` (en vez de la cache),
 * `hoy` (Date). Devuelve `{ cuentas, noOk, errores, reuniones, ... }`.
 */
function auditoriaAgenda(opciones) {
  opciones = opciones || {};
  const t0 = Date.now();
  const hoy = opciones.hoy || hoyMediodia_();
  const sem = semanasAuditoriaAgenda_(hoy);
  const lunesPasado = _masDias_(sem[0].desde, -7);
  const C = {
    hoy: hoy, sem: sem, desdeMails: new Date(lunesPasado.getFullYear(), lunesPasado.getMonth(), lunesPasado.getDate(), 0, 0, 0),
    enSemanas: function (f) { return !!f && ymd_(f) >= ymd_(sem[0].desde) && ymd_(f) <= ymd_(sem[1].hasta); },
    cuentas: { 'OK': 0, 'DISTINTO': 0, 'FALTA EN LA BASE': 0, 'DUPLICADA': 0 }, noOk: [], errores: [], reuniones: [], extra: {}, otrasDe: {}
  };
  Logger.log('=== auditoriaAgenda (paso 66) — SÓLO LECTURA: no escribe nada (ni la base, ni el archivo "Agenda", ni Gmail, ni ' +
             'REGISTRO_AGENDA) ===');
  Logger.log('  hoy %s | semana en curso %s al %s | siguiente %s al %s | mails desde el %s', fmtFecha_(hoy), fmtFecha_(sem[0].desde),
             fmtFecha_(sem[0].hasta), fmtFecha_(sem[1].desde), fmtFecha_(sem[1].hasta), fmtFecha_(C.desdeMails));

  // --- las lecturas (cada una aislada) ---
  _seccionAudAg_(C, 'lectura de la base', function () {
    C.dest = leerDestino_();
    C.A = indicesAgenda_(C.dest.hdr);
    if (C.A.faltan.length) Logger.log('  AVISO: a la base le faltan columnas de la agenda: %s', C.A.faltan.join(', '));
    C.porFila = new Map();
    C.dest.filas.forEach(function (f) { C.porFila.set(f.fila, f); });
    Logger.log('  base "%s": %s filas con datos', RDV_HOJA_DESTINO, C.dest.filas.length);
  });
  _seccionAudAg_(C, 'lectura de los mails', function () {
    C.mails = opciones.mails ? { fuente: '(lista de prueba)', lista: opciones.mails, errores: [] } : leerMailsAgendaGmail_(C.desdeMails);
    C.r = agendaDesdeListaDeMails_(C.mails.lista, C.mails);
    Logger.log('  mails: %s (%s)', C.mails.lista.length, C.mails.fuente);
  });
  _seccionAudAg_(C, 'lectura de RDV CONJUNTO', function () { C.conjunto = leerConjuntoPorFecha_(); });
  if (!C.conjunto) C.conjunto = new Map();
  C.geo = opciones.geocodificar || geocodificadorSoloCacheAudAg_();
  _seccionAudAg_(C, 'el plan de la agenda (en memoria)', function () {
    if (!C.dest || !C.r) throw new Error('sin la base o sin los mails no hay plan');
    const alcance = alcanceAgenda_();
    if (alcance.hasta && ymd_(alcance.hasta) < ymd_(sem[1].hasta)) {
      Logger.log('  AVISO: el alcance de la agenda (%s) no cubre las dos semanas: lo que quede afuera se ve como si no tuviera fila.', alcance.desc);
    }
    C.plan = planAgenda_(C.dest, C.r, C.A, alcance, { enSeco: true, historial: leerHistorialAgenda_(), elecciones: leerEleccionesAgenda_(),
                                                      conjunto: C.conjunto, geocodificar: C.geo });
    C.barrioDe = _barrioAgenda_({ geocodificar: C.geo }, { barrio: {} });
    // qué escribiría la agenda en cada fila en la próxima corrida (para decir "pendiente")
    C.pendiente = {};
    C.plan.acciones.forEach(function (a) {
      (a.escrituras || []).forEach(function (e) {
        const n = C.dest.hdr[e.col - 1];
        if (n == null) return;
        (C.pendiente[e.fila] = C.pendiente[e.fila] || {})[normalizeHeader_(n)] = { valor: e.valor, tipo: a.tipo };
      });
    });
    Logger.log('  el plan de la agenda (como la corrida de la hora, en seco): %s reuniones en el alcance | crearía %s | actualizaría %s | ' +
               'ambiguas %s | AGENDA_DUPLICADOS %s', C.plan.resumen.reunionesEnAlcance, C.plan.resumen.crear, C.plan.resumen.actualizar,
               C.plan.resumen.ambiguas, C.plan.duplicados.length);
  });

  _seccionAudAg_(C, '1. los mails', function () { _s1MailsAudAg_(C); });
  _seccionAudAg_(C, '2. las reuniones del mail contra la base', function () { _s2ReunionesAudAg_(C); });
  _seccionAudAg_(C, '3. las filas de la base que no están en el mail', function () { _s3FilasSinMailAudAg_(C); });
  _seccionAudAg_(C, '4. las copias de la agenda', function () { _s4CopiasAudAg_(C); });
  _seccionAudAg_(C, '5. las filas creadas por la agenda y AGENDA_DUPLICADOS', function () { _s5CreadasAudAg_(C); });
  _seccionAudAg_(C, '6. las reuniones ambiguas', function () { _s6AmbiguasAudAg_(C); });
  _seccionAudAg_(C, '7. AGENDA_FIGURA_A_COMPLETAR', function () { _s7FiguraACompletarAudAg_(C); });

  _resumenAudAg_(C);
  Logger.log('auditoriaAgenda: %s ms', Date.now() - t0);
  return { cuentas: C.cuentas, noOk: C.noOk, errores: C.errores, reuniones: C.reuniones, extra: C.extra };
}

/** La semana en curso y la siguiente, de lunes a domingo. */
function semanasAuditoriaAgenda_(hoy) {
  const lunes = _lunesAgenda_(hoy);
  return [{ nombre: 'en curso', desde: lunes, hasta: _masDias_(lunes, 6) },
          { nombre: 'siguiente', desde: _masDias_(lunes, 7), hasta: _masDias_(lunes, 13) }];
}

/** Una sección aislada: si falla, se dice y la auditoría sigue. */
function _seccionAudAg_(C, nombre, fn) {
  try { fn(); } catch (err) {
    const m = String(err && err.message || err);
    Logger.log('>>> la sección "%s" FALLÓ: %s (las demás siguen)', nombre, m);
    C.errores.push(nombre + ': ' + m);
  }
}

/** Anota algo que no está OK (para la lista final). */
function _noOkAudAg_(C, seccion, texto) { C.noOk.push('[' + seccion + '] ' + texto); }

/** La geocodificación de la auditoría: SÓLO la cache de AGENDA_GEOCODE (no llama a Maps, no escribe la cache). */
function geocodificadorSoloCacheAudAg_() {
  let cache = null;
  return function (consulta) {
    if (!cache) { try { cache = _leerCacheGeocode_(); } catch (e) { cache = new Map(); } }
    return cache.get(consulta) || { consulta: consulta, estado: 'ERROR', lat: '', lng: '', detalle: 'no está en la cache (la auditoría no geocodifica)' };
  };
}

// ===================== Ayudas =====================

function _valAudAg_(C, f, n) { return C.A[n] == null ? '' : f.valores[C.A[n]]; }

function _fmtAudAg_(v, n) {
  if (v instanceof Date) return valorAgendaComparable_(v, n || '') || fmtFecha_(v);
  return str(v).replace(/\s+/g, ' ');
}

/** Una fila de la base, en una línea (los campos que usa la agenda para reconocerla). */
function _filaTextoAudAg_(C, f) {
  const v = function (n) { return _valAudAg_(C, f, n); };
  return 'fila ' + f.fila + ' | ' + (f.figura || '(sin figura)') + ' | ' + (f.fecha ? fmtFecha_(f.fecha) : '(sin fecha)') + ' ' +
         (valorAgendaComparable_(v('HORA'), 'HORA') || '--:--') + ' | barrio ' + (f.barrio || '—') + ' | ' +
         (str(v('Dirección')) || '(sin dirección)') + ' | STATUS ' + (str(v('STATUS REUNIÓN')) || '—') + ' | agenda_uid ' +
         (str(v('agenda_uid')) || '—') + ' | Origen ' + (str(v('Origen fila')) || '—');
}

/** Una reunión del mail, en una línea. */
function _evTextoAudAg_(ev) {
  return (ev.fecha ? fmtFecha_(ev.fecha) : '(sin fecha)') + ' ' + (ev.hora || '--:--') + ' | ' + (ev.figuras && ev.figuras.length ? ev.figuras.join(' + ') : ev.tipo || '(sin figura)') +
         (ev.noParticipa && ev.noParticipa.length ? ' (no participa: ' + ev.noParticipa.join(', ') + ')' : '') + ' | ' + (ev.tipo || '') + ' | ' +
         (ev.lugar || '—') + ' | ' + str(ev.lugarTexto).replace(/\s+/g, ' ') + ' | ' + ev.grupo + ' v' + ev.version + '/' + ev.versiones +
         (ev.otrosGrupos && ev.otrosGrupos.length ? ' (también en ' + ev.otrosGrupos.join(', ') + ')' : '');
}

function _esSeguridadAudAg_(C, f) {
  return /seguridad en tu barrio/.test(normalizeText_(_valAudAg_(C, f, 'Evento (mail)'))) || /seguridad en tu barrio/.test(normalizeText_(_valAudAg_(C, f, 'EVENTO')));
}

/**
 * `ubica` de planAgenda_ (40_Agenda.js), la misma regla: con UBICACION_TRES_NIVELES, `compararUbicacion_` de la reunión
 * contra la fila SIN lo del mail; si no, barrio con barrio o la comuna del barrio de la fila con la del mail.
 */
function _ubicaComoAgendaAudAg_(ev, f) {
  if (usarUbicacion3_()) return compararUbicacion_(ubicacionDeEvento_(ev), ubicacionDeFila_(f, true)).coincide === true;
  if (!f.barrio) return false;
  if (ev.barrio) return normalizeText_(_canonBarrioAg_(ev.barrio) || ev.barrio) === normalizeText_(_canonBarrioAg_(f.barrio) || f.barrio);
  if (ev.comuna != null) {
    if (_comunaBarrioAg_(f.barrio) !== ev.comuna) return false;
    if (ev.comuna === 1 && ev.subzona) { const sz = _subzonaBarrioAg_(f.barrio); return !sz || sz === ev.subzona; }
    return true;
  }
  return false;
}

/** Las figuras que nombra el mail en cualquier versión, por fecha (el `nombradas` de planAgenda_). */
function _nombradasAudAg_(C) {
  if (C._nombradas) return C._nombradas;
  const s = new Set();
  C.r.ultimas.concat(C.r.desaparecidas).forEach(function (x) {
    if (x.fecha) x.figuras.forEach(function (fig) { s.add(normalizeText_(fig) + '|' + ymd_(x.fecha)); });
  });
  C._nombradas = s;
  return s;
}

/** Las reuniones vigentes del mail (última versión) en las dos semanas. */
function _vigentesAudAg_(C) {
  return C.r.unicas.filter(function (ev) { return C.enSemanas(ev.fecha); });
}

/** Las filas que la agenda tiene asignadas a una reunión VIGENTE (de cualquier fecha). */
function _asignadasAudAg_(C) {
  if (C._asignadas) return C._asignadas;
  const s = new Set();
  C.r.unicas.forEach(function (ev) { const x = C.plan.filaDe.get(ev.clave); if (x && x.fila && !x.nueva) s.add(x.fila); });
  C._asignadas = s;
  return s;
}

// ===================== 1. Los mails =====================

function _s1MailsAudAg_(C) {
  if (!C.r) throw new Error('no hay mails leídos');
  const clave = function (m) { return m.id || (m.fecha.getTime() + '|' + m.asunto); };
  const estado = new Map();
  C.r.semanas.forEach(function (g) {
    const n = g.versiones.length;
    const esResp = g.versiones.map(function (m) { return RE_RESPUESTA_AGENDA_.test(m.asunto || ''); });
    let base = -1;
    for (let i = n - 1; i >= 0; i--) if (!esResp[i]) { base = i; break; }
    g.versiones.forEach(function (m, i) {
      let t, vale = true;
      if (base < 0) t = 'VALE: respuesta (no hay mail completo de la semana: vale la unión de las respuestas)';
      else if (i === base) t = 'VÁLIDA: la última versión completa';
      else if (i > base) t = 'VALE: respuesta posterior (sólo agrega o actualiza; no saca reuniones)';
      else { vale = false; t = 'reemplazada' + (esResp[i] ? ' (respuesta anterior a la última completa)' : ' por la del ' + Utilities.formatDate(g.versiones[base].fecha, RDV_TZ, 'dd/MM HH:mm')); }
      estado.set(clave(m), { g: g, i: i, n: n, texto: t, vale: vale, cantidad: (g.cantidades || [])[i], resp: esResp[i] });
    });
  });
  const sinAgenda = new Set(C.r.respuestasSinAgenda || []);
  const sinSemana = new Set(C.r.sinSemana || []);
  const lista = C.mails.lista.filter(function (m) { return m.fecha >= C.desdeMails; })
    .sort(function (a, b) { return a.fecha - b.fecha; });
  Logger.log('--- 1. los mails desde el %s: %s ---', fmtFecha_(C.desdeMails), lista.length);
  Logger.log('    fecha | grupo | semana | Re/RV/Fwd | etiqueta | qué es | reuniones | asunto');
  lista.forEach(function (m) {
    const e = estado.get(clave(m));
    const resp = RE_RESPUESTA_AGENDA_.test(m.asunto || '');
    let que, grupo = '?', semana = '?', cant = '';
    if (e) { que = e.texto; grupo = e.g.grupo; semana = e.g.semanaTexto; cant = e.cantidad == null ? '' : e.cantidad; }
    else if (sinAgenda.has(m.asunto + ' | ' + fmtFecha_(m.fecha))) que = 'respuesta SIN agenda propia: no cuenta como versión';
    else if (sinSemana.has(m.asunto)) { que = 'NO SE LEE: no se reconoce la semana en el asunto'; _noOkAudAg_(C, '1', 'mail sin semana reconocible: ' + m.asunto); }
    else que = '(no clasificado)';
    Logger.log('    %s | %s | %s | %s | %s | %s | %s | %s', Utilities.formatDate(m.fecha, RDV_TZ, 'dd/MM HH:mm'), grupo, semana, resp ? 'sí' : 'no',
               m.etiqueta === undefined ? '—' : (m.etiqueta ? 'sí' : 'NO (lo trajo el asunto)'), que, cant, m.asunto);
  });
  (C.mails.errores || []).forEach(function (e) { Logger.log('    AVISO de Gmail: %s', e); _noOkAudAg_(C, '1', 'Gmail: ' + e); });
  // por semana + grupo de las dos semanas: cuántas versiones y cuál vale
  const grupos = {};
  C.r.semanas.forEach(function (g) { grupos[g.grupo] = true; });
  Logger.log('  por semana + grupo (las dos semanas):');
  C.sem.forEach(function (s) {
    const deLaSemana = C.r.semanas.filter(function (g) { return g.desde && g.hasta && ymd_(g.desde) <= ymd_(s.hasta) && ymd_(g.hasta) >= ymd_(s.desde); });
    deLaSemana.forEach(function (g) {
      const val = g.versiones.filter(function (m) { const e = estado.get(clave(m)); return e && e.vale; });
      Logger.log('    semana %s (%s) | %s | %s versión(es) [%s] | vale: %s', g.semanaTexto, s.nombre, g.grupo, g.versiones.length,
                 (g.cantidades || []).join(', ') + ' reuniones', val.map(function (m) { return Utilities.formatDate(m.fecha, RDV_TZ, 'dd/MM HH:mm') + (RE_RESPUESTA_AGENDA_.test(m.asunto) ? ' (resp.)' : ''); }).join(' + '));
      if (C.r.parciales.some(function (p) { return p.g === g; })) {
        Logger.log('      AVISO: la última completa tiene menos del %s%% de las reuniones de la anterior (versión parcial: no se suspende nada)',
                   Math.round(AGENDA_FRACCION_VERSION_PARCIAL * 100));
        _noOkAudAg_(C, '1', 'versión parcial: semana ' + g.semanaTexto + ' | ' + g.grupo + ' (' + (g.cantidades || []).join(' → ') + ' reuniones)');
      }
    });
    Object.keys(grupos).forEach(function (gr) {
      if (deLaSemana.some(function (g) { return g.grupo === gr; })) return;
      Logger.log('    semana del %s (%s) | %s | SIN MAIL todavía', fmtFecha_(s.desde), s.nombre, gr);
      _noOkAudAg_(C, '1', 'aviso: sin mail de "' + gr + '" para la semana del ' + fmtFecha_(s.desde));
    });
  });
  C.extra.mails = lista.length;
}

// ===================== 2. Cada reunión del mail contra la base =====================

function _s2ReunionesAudAg_(C) {
  if (!C.plan) throw new Error('no hay plan de la agenda');
  const evs = _vigentesAudAg_(C);
  const sinFecha = C.r.unicas.filter(function (ev) { return !ev.fecha; });
  Logger.log('--- 2. las reuniones del mail (última versión) en las dos semanas: %s, contra la base ---', evs.length);
  if (sinFecha.length) {
    Logger.log('    AVISO: %s reuniones del mail sin fecha (no se pueden ubicar)', sinFecha.length);
    sinFecha.forEach(function (ev) { _noOkAudAg_(C, '2', 'reunión del mail sin fecha: ' + str(ev.eventoTexto)); });
  }
  const asignadas = _asignadasAudAg_(C);
  evs.forEach(function (ev) {
    const res = { ev: ev, resultado: 'OK', fila: null, difs: [], notas: [], otras: [] };
    const x = C.plan.filaDe.get(ev.clave);
    const amb = C.plan.ambiguas.filter(function (a) { return a.ev && a.ev.clave === ev.clave; })[0];
    if (amb) {
      res.resultado = 'DUPLICADA';
      res.notas.push('AMBIGUA para la agenda (' + amb.motivo + '): filas ' + amb.filas.map(function (f) { return f.fila; }).join(', ') + ' (ver la sección 6)');
    } else if (!x || !x.fila || x.nueva) {
      res.resultado = 'FALTA EN LA BASE';
      if (x && x.nueva) res.notas.push('la agenda la crearía en la próxima corrida (no encontró fila)');
      else if (x && x.duplicado) {
        const d = C.plan.duplicados.filter(function (y) { return y.tipo === 'antes' && y.ev.clave === ev.clave; })[0];
        res.notas.push('pendiente en AGENDA_DUPLICADOS: hay una fila parecida del equipo' + (d ? ' (' + d.candidatas.map(function (c) { return 'fila ' + c.f.fila + ': ' + c.diferencia; }).join('; ') + ')' : '') +
                       '; la agenda no crea hasta que se elija');
      } else if (x && x.borradaEquipo) res.notas.push('la creó la agenda y el equipo la BORRÓ: la agenda no la vuelve a crear');
      else res.notas.push('la agenda no le encontró fila' + (C.plan.resumen.noCreadasSinHistorial ? ' (el historial no se pudo leer: no crea)' : ''));
    } else {
      const f = x.f || C.porFila.get(x.fila);
      res.fila = x.fila;
      if (x.yaCargada) res.notas.push('"ya cargada en otra fila" (regla del 07/10): la fila ' + x.fila + ' tiene otra fecha y la agenda no la toca');
      if (f) {
        _compararFilaAudAg_(C, ev, f, res);
        // ¿más de una fila para esta reunión?
        res.otras = _otrasFilasAudAg_(C, ev, f, asignadas);
        C.plan.duplicados.filter(function (y) { return y.tipo === 'despues' && y.fAgenda && y.fAgenda.fila === f.fila; }).forEach(function (y) {
          y.candidatas.forEach(function (c) {
            if (!res.otras.some(function (o) { return o.fila === c.f.fila; })) res.otras.push({ fila: c.f.fila, f: c.f, por: 'AGENDA_DUPLICADOS (después de crear): ' + c.diferencia });
          });
        });
        res.otras.forEach(function (o) {
          C.otrasDe[o.fila] = 'DUPLICADA de la reunión ' + fmtFecha_(ev.fecha) + ' ' + (ev.hora || '') + ' ' + (ev.figuraFila || ev.tipo) +
                              ' (la fila de la agenda es la ' + f.fila + '; ' + o.por + ')';
        });
        if (res.otras.length) res.resultado = 'DUPLICADA';
        else if (res.difs.length) res.resultado = 'DISTINTO';
      }
    }
    C.cuentas[res.resultado] = (C.cuentas[res.resultado] || 0) + 1;
    C.reuniones.push({ resultado: res.resultado, fila: res.fila, fecha: fmtFecha_(ev.fecha), hora: ev.hora, figura: ev.figuraFila, tipo: ev.tipo,
                       difs: res.difs.map(function (d) { return d.campo; }), otras: res.otras.map(function (o) { return o.fila; }) });
    const f = res.fila ? C.porFila.get(res.fila) : null;
    Logger.log('  [%s] %s%s', res.resultado, _evTextoAudAg_(ev), res.fila ? ' → fila ' + res.fila +
               (f && str(_valAudAg_(C, f, 'Tocado por el equipo')) ? ' (Tocado por el equipo: ' + str(_valAudAg_(C, f, 'Tocado por el equipo')) + ')' : '') : '');
    res.difs.forEach(function (d) {
      Logger.log('      %s: mail "%s" / base "%s" — %s%s', d.campo, _fmtAudAg_(d.mail, d.campo), _fmtAudAg_(d.base, d.campo), d.quien, d.pendiente || '');
    });
    res.otras.forEach(function (o) { Logger.log('      OTRA FILA para la misma reunión: %s (%s)', _filaTextoAudAg_(C, o.f), o.por); });
    res.notas.forEach(function (n) { Logger.log('      %s', n); });
    if (res.resultado !== 'OK') {
      _noOkAudAg_(C, '2', res.resultado + ' | ' + _evTextoAudAg_(ev) + (res.fila ? ' | fila ' + res.fila : '') +
                  (res.difs.length ? ' | ' + res.difs.map(function (d) { return d.campo + ' (mail "' + _fmtAudAg_(d.mail, d.campo) + '" / base "' + _fmtAudAg_(d.base, d.campo) + '"; ' + d.corto + ')'; }).join('; ') : '') +
                  (res.otras.length ? ' | otras filas: ' + res.otras.map(function (o) { return o.fila; }).join(', ') : '') +
                  (res.notas.length && !res.difs.length ? ' | ' + res.notas.join('; ') : ''));
    }
  });
  Logger.log('  reuniones: OK %s | DISTINTO %s | FALTA EN LA BASE %s | DUPLICADA %s', C.cuentas.OK, C.cuentas.DISTINTO,
             C.cuentas['FALTA EN LA BASE'], C.cuentas.DUPLICADA);
}

/** Lo que dice el mail de cada campo (como lo escribe la agenda). */
function _esperadoAudAg_(ev) {
  return { 'Figura': ev.figuraFila || '', 'FECHA': ev.fecha, 'HORA': horaAgendaEquipo_(ev), 'Dirección': _direccionAgenda_(ev),
           'EVENTO': eventoAgenda_(ev), 'No participa': (ev.noParticipa || []).join(' / '), 'Conjunta con': conjuntaAgenda_(ev),
           'Evento (mail)': str(ev.eventoTexto).replace(/\s+/g, ' ') };
}

/** Quién puso lo que hay en la celda (por la traza agenda_*_escrita, cuando la columna la tiene). */
function _quienAudAg_(C, f, n, cur) {
  const esc = AUDITORIA_AGENDA_ESCRITA[n];
  if (esc) {
    const e = _valAudAg_(C, f, esc);
    if (esVacio_(e)) return { largo: 'del equipo: la agenda nunca escribió esta celda (sin ' + esc + ')', corto: 'del equipo' };
    if (valorAgendaComparable_(cur, n) === valorAgendaComparable_(e, n)) {
      return { largo: 'del sistema: todavía tiene lo que escribió la agenda (la agenda la sigue al mail si la fila está "en agenda")', corto: 'del sistema' };
    }
    return { largo: 'TOCADA POR EL EQUIPO: la agenda había escrito "' + _fmtAudAg_(e, n) + '" y ya no la toca', corto: 'tocada por el equipo' };
  }
  if (n === 'No participa' || n === 'Conjunta con' || n === 'Evento (mail)') {
    return { largo: 'columna del sistema: la agenda la reescribe con cada versión', corto: 'del sistema' };
  }
  return { largo: 'sin traza: la agenda sólo la llena si está vacía (lo que hay lo cargó el equipo, o la agenda con una versión anterior)', corto: 'sin traza' };
}

function _compararFilaAudAg_(C, ev, f, res) {
  const E = _esperadoAudAg_(ev);
  const pend = C.pendiente[f.fila] || {};
  const agregar = function (n, mail, cur) {
    const q = _quienAudAg_(C, f, n, cur);
    const p = pend[normalizeHeader_(n)];
    res.difs.push({ campo: n, mail: mail, base: cur, quien: q.largo, corto: q.corto,
                    pendiente: p ? ' — la próxima corrida de la agenda la escribe ("' + _fmtAudAg_(p.valor, n) + '", ' + p.tipo + ')' : '' });
  };
  AUDITORIA_AGENDA_CAMPOS.forEach(function (n) {
    if (C.A[n] == null) { res.notas.push('la base no tiene la columna "' + n + '"'); return; }
    const cur = _valAudAg_(C, f, n);
    if (n === 'STATUS REUNIÓN') {
      const s = normStatus_(cur);
      if (s === 'en agenda' || s === 'realizada') return;
      agregar(n, 'en agenda (está en el mail)', cur);
      return;
    }
    if (n === 'FECHA' && res.notas.some(function (t) { return /ya cargada en otra fila/.test(t); })) {
      if (valorAgendaComparable_(cur, n) !== valorAgendaComparable_(E.FECHA, n)) agregar(n, E.FECHA, cur);
      return;
    }
    if (n === 'Barrio') { _compararBarrioAudAg_(C, ev, f, cur, res, agregar); return; }
    if (n === 'Figura' && !E.Figura) {
      if (!f.figura) res.notas.push('Figura vacía (Seguridad: sale de RDV CONJUNTO o la carga el equipo; ver la sección 7)');
      return;
    }
    if (valorAgendaComparable_(cur, n) === valorAgendaComparable_(E[n], n)) return;
    agregar(n, E[n], cur);
  });
}

/** Barrio: el que dice el mail o el de la dirección (regla de confianza, con la cache); si no hay, la comuna del mail. */
function _compararBarrioAudAg_(C, ev, f, cur, res, agregar) {
  let esp = ev.barrio ? (_canonBarrioAg_(ev.barrio) || ev.barrio) : '';
  let por = esp ? 'el mail' : '';
  if (!esp) { const b = C.barrioDe(ev); if (b.barrio) { esp = b.barrio; por = 'la dirección'; } }
  const canon = function (s) { return normalizeText_(_canonBarrioAg_(s) || s); };
  if (esp) {
    if (esVacio_(cur) || canon(cur) !== canon(esp)) agregar('Barrio', esp + ' (de ' + por + ')', cur);
    return;
  }
  if (ev.comuna != null && !esVacio_(cur)) {
    const cb = _comunaBarrioAg_(str(cur));
    if (cb != null && cb !== ev.comuna) agregar('Barrio', 'Comuna ' + ev.comuna + ' (el mail no dice barrio)', cur + ' (Comuna ' + cb + ')');
  }
}

/** Otras filas de la base para la misma reunión (no asignadas a otra reunión vigente del mail). */
function _otrasFilasAudAg_(C, ev, f, asignadas) {
  const out = [];
  const figs = (ev.figuras || []).map(normalizeText_);
  const dir = normalizeText_(_direccionAgenda_(ev));
  C.dest.filas.forEach(function (g) {
    if (g.fila === f.fila || asignadas.has(g.fila) || !g.fecha || ymd_(g.fecha) !== ymd_(ev.fecha)) return;
    const st = normStatus_(_valAudAg_(C, g, 'STATUS REUNIÓN'));
    if (st === 'suspendida' || st === 'reprogramada') return;
    if (ev.figuraFila) {
      if (g.figura && figs.indexOf(normalizeText_(g.figura)) >= 0) out.push({ fila: g.fila, f: g, por: 'misma figura y fecha' });
      return;
    }
    const mismaDir = dir && (normalizeText_(_valAudAg_(C, g, 'Dirección')) === dir || normalizeText_(_valAudAg_(C, g, 'agenda_direccion_escrita')) === dir);
    const sinFig = !g.figura || !_nombradasAudAg_(C).has(normalizeText_(g.figura) + '|' + ymd_(g.fecha));
    if (mismaDir) out.push({ fila: g.fila, f: g, por: 'misma fecha y misma dirección' });
    else if (sinFig && _esSeguridadAudAg_(C, g) && _ubicaComoAgendaAudAg_(ev, g)) out.push({ fila: g.fila, f: g, por: 'misma fecha, Seguridad, misma ubicación' });
  });
  return out;
}

// ===================== 3. Las filas de la base que no están en el mail =====================

function _s3FilasSinMailAudAg_(C) {
  if (!C.plan) throw new Error('no hay plan de la agenda');
  const asignadas = _asignadasAudAg_(C);
  const ambiguas = new Set();
  C.plan.ambiguas.forEach(function (a) { (a.filas || []).forEach(function (f) { ambiguas.add(f.fila); }); });
  const desap = new Map();
  C.r.desaparecidas.forEach(function (d) { const x = C.plan.filaDe.get(d.clave); if (x && x.fila) desap.set(x.fila, { d: d, x: x }); });
  const filas = C.dest.filas.filter(function (f) { return C.enSemanas(f.fecha) && !asignadas.has(f.fila) && !ambiguas.has(f.fila); });
  Logger.log('--- 3. filas de la base en las dos semanas que NO son de ninguna reunión del mail: %s ---', filas.length);
  let n = 0;
  filas.forEach(function (f) {
    const uid = str(_valAudAg_(C, f, 'agenda_uid')), origen = str(_valAudAg_(C, f, 'Origen fila'));
    const st = normStatus_(_valAudAg_(C, f, 'STATUS REUNIÓN'));
    let que;
    const dd = desap.get(f.fila);
    if (C.otrasDe[f.fila]) {
      que = C.otrasDe[f.fila] + (uid ? '' : ' — cargada a mano (sin agenda_uid; Origen fila: ' + (origen || 'vacío') + ')');
    } else if (dd) {
      que = 'DESAPARECIÓ DEL MAIL (la sacó ' + (dd.d.asuntoQueLaSaco || 'una versión posterior') + (dd.d.mailQueLaSaco ? ', ' + fmtFecha_(dd.d.mailQueLaSaco) : '') + ')' +
            (dd.x.cancelacionPendiente ? ': ¿se canceló? PENDIENTE en AGENDA_DUPLICADOS' : dd.x.sigue ? ': el equipo eligió "Sigue"' :
             dd.x.borrada ? ': la agenda la borraría' : st === 'suspendida' ? ': ya está Suspendida' : '');
    } else if (st === 'suspendida') que = 'SUSPENDIDA (¿cancelada?)';
    else if (st === 'reprogramada') que = 'REPROGRAMADA';
    else if (!uid) que = 'CARGADA A MANO (sin agenda_uid; Origen fila: ' + (origen || 'vacío') + ')';
    else que = 'de la agenda (' + (/^c-/.test(uid) ? 'la creó' : 'la vinculó') + '), pero la reunión ya no está en el mail' +
               (C.plan.yaCargadas.some(function (y) { return y.f.fila === f.fila; }) ? ' (es "ya cargada" de otra fecha)' : '');
    n++;
    Logger.log('  %s | %s', que, _filaTextoAudAg_(C, f));
    _noOkAudAg_(C, '3', 'FILA SIN REUNIÓN EN EL MAIL: ' + que + ' | ' + _filaTextoAudAg_(C, f));
  });
  C.cuentas['FILA SIN MAIL'] = n;
}

// ===================== 4. Las copias =====================

function _s4CopiasAudAg_(C) {
  if (!C.plan) throw new Error('no hay plan de la agenda');
  const evs = _vigentesAudAg_(C);
  const desap = C.r.desaparecidas.filter(function (d) { return C.enSemanas(d.fecha); });
  Logger.log('--- 4. las copias: cada solapa contra las %s reuniones del mail de las dos semanas ---', evs.length);
  const fuentes = [
    { nombre: '"' + AGENDA_COPIA_SOLAPA + '" (archivo "Agenda")', ss: AGENDA_COPIA_SS, solapa: AGENDA_COPIA_SOLAPA, tipo: 'tabla', activa: true },
    { nombre: '"' + AGENDA_SOLAPA_CALL + '" (archivo "Agenda")', ss: AGENDA_COPIA_SS, solapa: AGENDA_SOLAPA_CALL, tipo: 'tabla', activa: AGENDA_VISTAS_NUEVAS },
    { nombre: '"' + AGENDA_SOLAPA_VISTA_MAIL + '" (archivo "Agenda")', ss: AGENDA_COPIA_SS, solapa: AGENDA_SOLAPA_VISTA_MAIL, tipo: 'mail', activa: AGENDA_VISTAS_NUEVAS },
    { nombre: '"' + AGENDA_RDV_SOLAPA + '" (archivo RDV)', ss: RDV_SS_DESTINO, solapa: AGENDA_RDV_SOLAPA, tipo: 'tabla', activa: AGENDA_COPIA_EN_RDV }
  ];
  C.extra.copias = {};
  fuentes.forEach(function (fu) {
    _seccionAudAg_(C, '4. ' + fu.nombre, function () {
      if (!fu.activa) { Logger.log('  %s: apagada en 00_Config.js, no se audita', fu.nombre); return; }
      const sh = SpreadsheetApp.openById(fu.ss).getSheetByName(fu.solapa);
      if (!sh) { Logger.log('  %s: NO EXISTE', fu.nombre); _noOkAudAg_(C, '4', fu.nombre + ': la solapa no existe'); return; }
      const r = fu.tipo === 'mail' ? _copiaMailAudAg_(C, sh, evs, desap) : _copiaTablaAudAg_(C, sh, evs, desap);
      C.extra.copias[fu.solapa + (fu.ss === RDV_SS_DESTINO ? ' (RDV)' : '')] = { reuniones: r.n, faltan: r.faltan.length, sobran: r.sobran.length, distintas: r.distintas.length };
      Logger.log('  %s: %s reuniones de las dos semanas (el mail tiene %s) | faltan %s | sobran %s | con campos distintos %s | desaparecidas mostradas %s | otras semanas %s',
                 fu.nombre, r.n, evs.length, r.faltan.length, r.sobran.length, r.distintas.length, r.desaparecidas, r.fuera);
      r.faltan.forEach(function (ev) { Logger.log('      FALTA: %s', _evTextoAudAg_(ev)); _noOkAudAg_(C, '4', fu.nombre + ': falta ' + _evTextoAudAg_(ev)); });
      r.sobran.forEach(function (t) { Logger.log('      SOBRA: %s', t); _noOkAudAg_(C, '4', fu.nombre + ': sobra ' + t); });
      r.distintas.forEach(function (t) { Logger.log('      DISTINTA: %s', t); _noOkAudAg_(C, '4', fu.nombre + ': ' + t); });
    });
  });
}

/** La figura que tiene que mostrar la copia: la de la fila (Seguridad: la de RDV CONJUNTO o del equipo) o la 1ª del mail. */
function _figuraCopiaAudAg_(C, ev) {
  const x = C.plan.filaDe.get(ev.clave);
  const f = x && x.fila ? (x.f || C.porFila.get(x.fila)) : null;
  return (f && f.figura) || (x && C.plan.figuraNueva && C.plan.figuraNueva[x.fila]) || ev.figuraFila || '';
}

/** "Agenda", "AgendaCall" y la "Agenda" del archivo RDV: una fila por reunión, por encabezado. */
function _copiaTablaAudAg_(C, sh, evs, desap) {
  const out = { n: 0, faltan: [], sobran: [], distintas: [], desaparecidas: 0, fuera: 0 };
  const last = sh.getLastRow(), cols = sh.getLastColumn();
  if (last < 1 || cols < 1) { out.faltan = evs.slice(); return out; }
  const v = sh.getRange(1, 1, last, cols).getValues();
  const hdr = v[0];
  const I = {};
  ['FECHA', 'HORA', 'Figura', 'Dirección', 'EVENTO', 'No participa', 'Conjunta con', 'Estado en la agenda', 'Fila del destino'].forEach(function (n) {
    I[n] = findIdxOr_(hdr, [n], true);
  });
  if (I.FECHA == null || I.HORA == null) throw new Error('la solapa no tiene FECHA y HORA en el encabezado');
  const items = [];
  for (let i = 1; i < v.length; i++) {
    const fe = toDate_(v[i][I.FECHA]);
    if (!fe) continue;
    if (!C.enSemanas(fe)) { out.fuera++; continue; }
    const g = function (n) { return I[n] == null ? '' : v[i][I[n]]; };
    items.push({ fila: i + 1, fecha: fe, hora: valorAgendaComparable_(g('HORA'), 'HORA'), figura: str(g('Figura')), dir: g('Dirección'),
                 evento: g('EVENTO'), noPart: g('No participa'), conj: g('Conjunta con'), estado: str(g('Estado en la agenda')), usado: false });
  }
  const cmpT = function (a, b) { return str(a).replace(/\s+/g, ' ') === str(b).replace(/\s+/g, ' '); };
  evs.forEach(function (ev) {
    const fig = _figuraCopiaAudAg_(C, ev);
    let c = items.filter(function (it) { return !it.usado && ymd_(it.fecha) === ymd_(ev.fecha) && it.hora === (ev.hora || ''); });
    if (c.length > 1 && fig) { const c2 = c.filter(function (it) { return normalizeText_(it.figura) === normalizeText_(fig); }); if (c2.length) c = c2; }
    if (c.length > 1) { const c3 = c.filter(function (it) { return cmpT(it.dir, _direccionAgenda_(ev)); }); if (c3.length) c = c3; }
    if (!c.length && fig) c = items.filter(function (it) { return !it.usado && ymd_(it.fecha) === ymd_(ev.fecha) && normalizeText_(it.figura) === normalizeText_(fig); });
    if (!c.length) { out.faltan.push(ev); return; }
    const it = c[0];
    it.usado = true;
    out.n++;
    const d = [];
    if (fig && normalizeText_(it.figura) !== normalizeText_(fig)) d.push('Figura "' + it.figura + '" (debería "' + fig + '")');
    if (it.hora !== (ev.hora || '')) d.push('HORA "' + it.hora + '" (el mail "' + ev.hora + '")');
    if (!cmpT(it.dir, _direccionAgenda_(ev))) d.push('Dirección "' + str(it.dir) + '" (el mail "' + _direccionAgenda_(ev) + '")');
    if (!cmpT(it.evento, eventoAgenda_(ev))) d.push('EVENTO "' + str(it.evento) + '" (debería "' + eventoAgenda_(ev) + '")');
    if (!cmpT(it.noPart, (ev.noParticipa || []).join(' / '))) d.push('No participa "' + str(it.noPart) + '" (el mail "' + (ev.noParticipa || []).join(' / ') + '")');
    if (!cmpT(it.conj, conjuntaAgenda_(ev))) d.push('Conjunta con "' + str(it.conj) + '" (el mail "' + conjuntaAgenda_(ev) + '")');
    if (/^desaparecida|^borrada/.test(it.estado)) d.push('Estado "' + it.estado + '" (está en el mail)');
    if (d.length) out.distintas.push('fila ' + it.fila + ' | ' + _evTextoAudAg_(ev) + ' | ' + d.join('; '));
  });
  items.forEach(function (it) {
    if (it.usado) return;
    const esDesap = /^desaparecida|^borrada/.test(it.estado) || desap.some(function (d) {
      return ymd_(d.fecha) === ymd_(it.fecha) && (d.hora || '') === it.hora;
    });
    if (esDesap) { out.desaparecidas++; return; }
    out.sobran.push('fila ' + it.fila + ' | ' + fmtFecha_(it.fecha) + ' ' + it.hora + ' | ' + (it.figura || '(sin figura)') + ' | ' + str(it.dir) + ' | ' + it.estado);
  });
  return out;
}

/** "Agenda (mail)": un renglón por día ("lunes 12/10") y una celda "Evento: … / Hora: … / Lugar: …" por reunión. */
function _copiaMailAudAg_(C, sh, evs, desap) {
  const out = { n: 0, faltan: [], sobran: [], distintas: [], desaparecidas: 0, fuera: 0 };
  const last = sh.getLastRow();
  const v = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues() : [];
  const norm = function (t) { return str(t).replace(/\s+/g, ' ').trim(); };
  const items = [];
  let dia = null;
  v.forEach(function (r, i) {
    const t = str(r[0]);
    const m = /^(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+(\d{1,2})\/(\d{1,2})/.exec(normalizeText_(t));
    if (m) { dia = _fechaDiaMes_(m[2] + '/' + m[3], C.hoy); return; }
    if (!/^\s*evento\s*:/i.test(t)) return;
    if (!dia || !C.enSemanas(dia)) { out.fuera++; return; }
    const lineas = t.split(/\r?\n/);
    const hora = lineas.filter(function (l) { return /^\s*hora\s*:/i.test(l); }).map(function (l) { return _horaAgenda_(l); })[0] || '';
    items.push({ fila: i + 2, fecha: dia, hora: hora, texto: norm(t), evento: norm(lineas[0]), usado: false });
  });
  const textoDe = function (ev) { return norm(celdaMailAgenda_({ ev: ev, estado: 'vigente' }).texto); };
  evs.forEach(function (ev) {
    const esp = textoDe(ev), evLinea = norm('Evento: ' + str(ev.eventoTexto));
    let c = items.filter(function (it) { return !it.usado && ymd_(it.fecha) === ymd_(ev.fecha) && it.texto === esp; });
    if (!c.length) c = items.filter(function (it) { return !it.usado && ymd_(it.fecha) === ymd_(ev.fecha) && it.evento === evLinea; });
    if (!c.length) c = items.filter(function (it) { return !it.usado && ymd_(it.fecha) === ymd_(ev.fecha) && it.hora === (ev.hora || ''); });
    if (!c.length) { out.faltan.push(ev); return; }
    const it = c[0];
    it.usado = true;
    out.n++;
    if (it.texto !== esp) out.distintas.push('renglón ' + it.fila + ' | ' + _evTextoAudAg_(ev) + ' | la celda dice "' + it.texto + '" y el mail "' + esp + '"');
  });
  const desapTextos = desap.map(textoDe);
  items.forEach(function (it) {
    if (it.usado) return;
    if (desapTextos.indexOf(it.texto) >= 0) { out.desaparecidas++; return; }
    out.sobran.push('renglón ' + it.fila + ' | ' + fmtFecha_(it.fecha) + ' | ' + it.texto);
  });
  return out;
}

// ===================== 5. Filas creadas por la agenda (últimos 14 días) y AGENDA_DUPLICADOS =====================

function _s5CreadasAudAg_(C) {
  if (!C.dest) throw new Error('no se leyó la base');
  const desde = _masDias_(C.hoy, -AUDITORIA_AGENDA_DIAS_CREADAS);
  let creadas = null, como = '';
  try {
    creadas = _creadasDelRegistroAudAg_(desde);
    como = 'por REGISTRO_AGENDA_CAMBIOS (crear_id de las corridas desde el ' + fmtFecha_(desde) + ', sin las deshechas)';
  } catch (err) {
    Logger.log('  AVISO: REGISTRO_AGENDA_CAMBIOS no se pudo leer (%s): se usan las filas "c-…" con FECHA desde el %s', err, fmtFecha_(desde));
  }
  const filas = C.dest.filas.filter(function (f) {
    const uid = str(_valAudAg_(C, f, 'agenda_uid'));
    if (!/^c-/.test(uid)) return false;
    return creadas ? creadas.has(uid) : (f.fecha && ymd_(f.fecha) >= ymd_(desde));
  });
  if (!creadas) como = 'filas con agenda_uid "c-…" y FECHA desde el ' + fmtFecha_(desde) + ' (sin registro)';
  Logger.log('--- 5. filas que creó la agenda en los últimos %s días: %s (%s) ---', AUDITORIA_AGENDA_DIAS_CREADAS, filas.length, como);
  if (creadas) {
    const enBase = new Set(filas.map(function (f) { return str(_valAudAg_(C, f, 'agenda_uid')); }));
    let ya = 0;
    creadas.forEach(function (x, uid) { if (!enBase.has(uid)) ya++; });
    if (ya) Logger.log('    (%s filas creadas en esos días ya no están en la base: las borró el equipo o la agenda)', ya);
  }
  let problemas = 0;
  filas.forEach(function (f) {
    const p = [];
    const seg = _esSeguridadAudAg_(C, f);
    if (seg && !f.figura) {
      const fc = C.plan ? C.plan.figuraACompletar.filter(function (x) { return x.f.fila === f.fila; })[0] : null;
      const fn = C.plan && C.plan.figuraNueva ? C.plan.figuraNueva[f.fila] : '';
      p.push('Seguridad SIN FIGURA' + (f.fecha && ymd_(f.fecha) >= ymd_(C.hoy) ? ' (futura)' : ' (ya pasó)') +
             (fn ? ': la próxima corrida pone "' + fn + '"' : fc ? ': ' + fc.motivo : ''));
    }
    if (esVacio_(_valAudAg_(C, f, 'Origen fila'))) p.push('"Origen fila" VACÍO');
    const dup = _duplicadasDeFilaAudAg_(C, f);
    if (dup.length) p.push('posible DUPLICADA con ' + dup.map(function (g) { return 'fila ' + g.fila + ' (' + (g.figura || 'sin figura') + ')'; }).join(', '));
    Logger.log('  [%s] %s%s', p.length ? 'REVISAR' : 'OK', seg ? 'Seguridad | ' : '', _filaTextoAudAg_(C, f));
    p.forEach(function (t) { Logger.log('      %s', t); });
    if (p.length) { problemas++; _noOkAudAg_(C, '5', p.join('; ') + ' | ' + _filaTextoAudAg_(C, f)); }
  });
  C.cuentas['CREADAS CON PROBLEMAS'] = problemas;
  _pendientesDuplicadosAudAg_(C);
}

/** uid → fecha de la corrida que la creó (crear_id / crear), desde `desde`, sin las corridas deshechas. Tira si no puede leer. */
function _creadasDelRegistroAudAg_(desde) {
  const ss = registrosAgenda_();
  const cam = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA_CAMBIOS), reg = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA);
  if (!cam) throw new Error('no existe ' + RDV_HOJA_REGISTRO_AGENDA_CAMBIOS);
  const deshechas = {};
  if (reg && reg.getLastRow() > 1) {
    reg.getRange(2, 3, reg.getLastRow() - 1, 1).getValues().forEach(function (r) { const m = /^DESHACER (.+)$/.exec(str(r[0])); if (m) deshechas[m[1]] = true; });
  }
  const out = new Map();
  if (cam.getLastRow() < 2) return out;
  const d0 = ymd_(desde);
  cam.getRange(2, 1, cam.getLastRow() - 1, 9).getValues().forEach(function (r) {
    const corrida = str(r[0]), tipo = str(r[1]), uid = str(r[8]);
    if (!uid || deshechas[corrida] || (tipo !== 'crear_id' && tipo !== 'crear')) return;
    const m = /^(\d{8})-/.exec(corrida);
    if (!m || m[1] < d0) return;
    if (!out.has(uid) || m[1] < out.get(uid)) out.set(uid, m[1]);
  });
  return out;
}

/** Otras filas que parecen la misma reunión que la fila `f`: misma figura y fecha; sin figura, misma fecha y dirección o ubicación. */
function _duplicadasDeFilaAudAg_(C, f) {
  if (!f.fecha) return [];
  const dir = normalizeText_(_valAudAg_(C, f, 'Dirección'));
  const seg = _esSeguridadAudAg_(C, f);
  return C.dest.filas.filter(function (g) {
    if (g.fila === f.fila || !g.fecha || ymd_(g.fecha) !== ymd_(f.fecha)) return false;
    const st = normStatus_(_valAudAg_(C, g, 'STATUS REUNIÓN'));
    if (st === 'suspendida' || st === 'reprogramada') return false;
    if (f.figura) return normalizeText_(g.figura) === normalizeText_(f.figura);
    if (dir && normalizeText_(_valAudAg_(C, g, 'Dirección')) === dir) return true;
    return seg && _esSeguridadAudAg_(C, g) && !g.figura &&
           compararUbicacion_(ubicacionDeFila_(f), ubicacionDeFila_(g)).coincide === true;
  });
}

/** AGENDA_DUPLICADOS (archivo de la base): las líneas que esperan una elección (vacías o "No sé"). */
function _pendientesDuplicadosAudAg_(C) {
  const sh = ssDestino_().getSheetByName(AGENDA_SOLAPA_DUPLICADOS);
  if (!sh || sh.getLastRow() < 2) { Logger.log('  %s: vacía o no existe (nada pendiente)', AGENDA_SOLAPA_DUPLICADOS); C.cuentas['DUPLICADOS PENDIENTES'] = 0; return; }
  const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const hdr = v[0].map(normalizeHeader_);
  const i = function (n) { return hdr.indexOf(normalizeHeader_(n)); };
  let pend = 0, info = 0;
  Logger.log('  %s (archivo de la base): líneas que esperan una decisión del equipo:', AGENDA_SOLAPA_DUPLICADOS);
  v.slice(1).forEach(function (r, k) {
    const g = function (n) { return i(n) < 0 ? '' : str(r[i(n)]); };
    if (/despues de crear/.test(normalizeText_(g('tipo')))) { info++; return; }
    if (!g('tipo') && !g('reunión del mail')) return;
    const el = g('ELEGIR');
    if (el && !/^no s/.test(normalizeText_(el))) return;
    pend++;
    const t = 'línea ' + (k + 2) + ' | ' + g('tipo') + ' | ' + g('reunión del mail') + ' | ' + g('fila candidata') + ' (' + g('figura (fila)') + ' ' +
              g('fecha (fila)') + ' ' + g('barrio (fila)') + ') | ' + g('diferencia') + ' | ELEGIR: ' + (el || '(vacío)');
    Logger.log('    PENDIENTE | %s', t);
    _noOkAudAg_(C, '5', 'AGENDA_DUPLICADOS pendiente: ' + t);
  });
  Logger.log('  %s: pendientes %s | informativas ("después de crear") %s', AGENDA_SOLAPA_DUPLICADOS, pend, info);
  C.cuentas['DUPLICADOS PENDIENTES'] = pend;
}

// ===================== 6. Las reuniones ambiguas =====================

function _s6AmbiguasAudAg_(C) {
  if (!C.plan) throw new Error('no hay plan de la agenda');
  const amb = C.plan.ambiguas.filter(function (a) { return a.ev && C.enSemanas(a.ev.fecha); });
  Logger.log('--- 6. reuniones AMBIGUAS de las dos semanas (la agenda no sabe cuál es su fila y no hace nada): %s ---', amb.length);
  C.cuentas.AMBIGUAS = amb.length;
  amb.forEach(function (a) {
    const ev = a.ev;
    const E = _esperadoAudAg_(ev);
    Logger.log('  AMBIGUA | %s | %s', _evTextoAudAg_(ev), a.motivo);
    Logger.log('      el mail: Figura "%s" | FECHA %s | HORA %s | ubicación %s | Dirección "%s" | Evento "%s"', E.Figura || '(ninguna: Seguridad)',
               fmtFecha_(ev.fecha), ev.hora || '—', ev.lugar || '—', E['Dirección'], E['Evento (mail)']);
    const regla = _reglaAmbiguaAudAg_(C, ev, a);
    a.filas.forEach(function (f) {
      Logger.log('      %s | Evento (mail) "%s" | entró por: %s', _filaTextoAudAg_(C, f), str(_valAudAg_(C, f, 'Evento (mail)')),
                 regla.porFila[f.fila] || '—');
    });
    regla.pasos.forEach(function (p) { Logger.log('      regla: %s', p); });
    const dist = _loQueLasDistingueAudAg_(C, a.filas);
    Logger.log('      lo que las distingue hoy: %s', dist.length ? dist.join('; ') : 'NADA (las filas son iguales en todo lo que mira la agenda)');
    regla.desempate.forEach(function (p) { Logger.log('      la desambiguaría: %s', p); });
    _noOkAudAg_(C, '6', 'AMBIGUA | ' + _evTextoAudAg_(ev) + ' | filas ' + a.filas.map(function (f) { return f.fila; }).join(', ') + ' | ' + regla.pasos.join(' → '));
  });
}

/** Qué paso de las candidatas (planAgenda_, regla 4) dejó la reunión ambigua, con qué criterio entró cada fila, y qué la resolvería. */
function _reglaAmbiguaAudAg_(C, ev, a) {
  const out = { porFila: {}, pasos: [], desempate: [] };
  const hora = function (f) { return valorAgendaComparable_(_valAudAg_(C, f, 'HORA'), 'HORA'); };
  const conUid = a.filas.filter(function (f) { return !esVacio_(_valAudAg_(C, f, 'agenda_uid')); });
  if (!/filas candidatas/.test(a.motivo)) {
    out.pasos.push(/^desaparecida/.test(a.motivo)
      ? 'la reunión DESAPARECIÓ del mail y tiene ' + a.filas.length + ' filas candidatas (regla 7): no se pregunta ni se suspende'
      : 'reprogramada dentro de la semana (regla 6) con ' + a.filas.length + ' filas en la fecha vieja: no se mueve');
  }
  if (ev.figuraFila) {
    a.filas.forEach(function (f) { out.porFila[f.fila] = 'Figura "' + f.figura + '" + FECHA ' + fmtFecha_(f.fecha) + ' (filas de la figura ese día)'; });
    out.pasos.push('regla 4, con figura: candidatas = las filas de ' + (ev.figuras || []).join(' / ') + ' del ' + fmtFecha_(ev.fecha) +
                   ' (' + a.filas.length + ')');
  } else {
    const dir = normalizeText_(ev.lugarTexto);
    const nombradas = _nombradasAudAg_(C);
    a.filas.forEach(function (f) {
      const r = [];
      if (!esVacio_(_valAudAg_(C, f, 'agenda_uid')) && dir && normalizeText_(_valAudAg_(C, f, 'agenda_direccion_escrita')) === dir) r.push('(a) es de la agenda con la misma dirección escrita');
      if (!f.figura && _ubicaComoAgendaAudAg_(ev, f)) r.push('(b) sin Figura y misma ubicación (' + (f.barrio || str(_valAudAg_(C, f, 'Lugar (mail)')) || '—') + ' ~ ' + (ev.lugar || '—') + ')');
      if (!f.figura && dir && normalizeText_(_valAudAg_(C, f, 'Dirección')) === dir) r.push('(b) sin Figura y misma Dirección');
      if (f.figura && _ubicaComoAgendaAudAg_(ev, f) && !nombradas.has(normalizeText_(f.figura) + '|' + ymd_(f.fecha))) r.push('(c) misma ubicación y su figura (' + f.figura + ') no está en el mail ese día');
      out.porFila[f.fila] = r.join(' y ') || '(la regla de antes de la ubicación, o una fila usada por otra reunión)';
    });
    out.pasos.push('regla 4, SIN figura (' + (ev.tipo || 'sin tipo') + '): candidatas = las filas del ' + fmtFecha_(ev.fecha) +
                   ' que (a) ya son de la agenda con la misma dirección, (b) no tienen figura y tienen la misma ubicación o Dirección, o (c) tienen la ' +
                   'misma ubicación y una figura que el mail no nombra ese día (' + a.filas.length + ')');
    out.desempate.push('la Dirección del mail ("' + _direccionAgenda_(ev) + '") en UNA sola de las filas (hoy: ' +
                       a.filas.filter(function (f) { return normalizeText_(_valAudAg_(C, f, 'Dirección')) === dir && dir; }).length + ' la tienen)');
    out.desempate.push('la Figura de RDV CONJUNTO cargada en la fila que corresponde (una fila con figura sale de (b))');
    out.desempate.push('el Barrio de la fila que NO es esta reunión: con un barrio fuera de "' + (ev.lugar || 'la ubicación del mail') +
                       '" deja de ser candidata');
  }
  if (ev.hora) {
    const conHora = a.filas.filter(function (f) { return hora(f) === ev.hora; }).length;
    out.pasos.push('la HORA del mail (' + ev.hora + ') no desempata: ' + conHora + ' de las ' + a.filas.length + ' filas la tienen (desempata sólo si es exactamente 1)');
    out.desempate.push('la HORA ' + ev.hora + ' en una sola de las filas');
  } else out.pasos.push('el mail no trae hora: no hay desempate por HORA');
  out.pasos.push('agenda_uid: ' + conUid.length + ' de las ' + a.filas.length + ' filas lo tienen (desempata sólo si es exactamente 1)');
  out.desempate.push('que una sola sea de la agenda: si una sobra (duplicada), borrarla o pasarla a "Suspendida" / corregir su fecha');
  return out;
}

/** Los campos en los que difieren las filas candidatas. */
function _loQueLasDistingueAudAg_(C, filas) {
  const out = [];
  ['Figura', 'HORA', 'Barrio', 'Dirección', 'Lugar (mail)', 'Evento (mail)', 'agenda_uid', 'Origen fila', 'STATUS REUNIÓN'].forEach(function (n) {
    const vals = filas.map(function (f) { return n === 'Figura' ? f.figura : valorAgendaComparable_(_valAudAg_(C, f, n), n); });
    if (vals.some(function (x) { return x !== vals[0]; })) out.push(n + ' (' + vals.map(function (x) { return x || '—'; }).join(' / ') + ')');
  });
  return out;
}

// ===================== 7. AGENDA_FIGURA_A_COMPLETAR =====================

function _s7FiguraACompletarAudAg_(C) {
  if (!C.dest) throw new Error('no se leyó la base');
  const sh = intermediaAgenda_().getSheetByName(AGENDA_SOLAPA_FIGURA);
  const lineas = [];
  if (sh && sh.getLastRow() >= 2) {
    const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    const hdr = v[0];
    const I = {};
    ['fila', 'fecha', 'barrio', 'evento', 'por qué falta la figura', 'filas de RDV CONJUNTO'].forEach(function (n) { I[n] = findIdxOr_(hdr, [n], true); });
    v.slice(1).forEach(function (r) {
      const g = function (n) { return I[n] == null ? '' : r[I[n]]; };
      if (esVacio_(g('fila')) && esVacio_(g('fecha'))) return;
      lineas.push({ fila: Number(g('fila')) || null, fecha: toDate_(g('fecha')), barrio: str(g('barrio')), motivo: str(g('por qué falta la figura')),
                    conj: str(g('filas de RDV CONJUNTO')) });
    });
  }
  Logger.log('--- 7. %s (intermedia, de la última corrida de la agenda): %s filas ---', AGENDA_SOLAPA_FIGURA, lineas.length);
  const vistas = new Set();
  let siguen = 0;
  lineas.forEach(function (l) {
    let f = l.fila ? C.porFila.get(l.fila) : null;
    let nota = '';
    if (f && l.fecha && (!f.fecha || ymd_(f.fecha) !== ymd_(l.fecha))) {
      // la fila se corrió (la agenda borró filas más arriba): la de esa fecha, sin figura y de la agenda
      const otra = C.dest.filas.filter(function (g) { return g.fecha && ymd_(g.fecha) === ymd_(l.fecha) && _esSeguridadAudAg_(C, g) &&
        normalizeText_(g.barrio) === normalizeText_(l.barrio) && !esVacio_(_valAudAg_(C, g, 'agenda_uid')); });
      nota = otra.length === 1 ? ' (la fila ' + l.fila + ' es hoy otra reunión; ésta está ahora en la ' + otra[0].fila + ')' : ' (la fila ' + l.fila + ' es hoy otra reunión)';
      f = otra.length === 1 ? otra[0] : null;
    }
    if (f) vistas.add(f.fila);
    siguen += _logFiguraAudAg_(C, f, l.fila, l.fecha, l.barrio, l.motivo, l.conj, nota);
  });
  // las que el plan de hoy agrega (no estaban en la solapa)
  (C.plan ? C.plan.figuraACompletar : []).forEach(function (x) {
    if (vistas.has(x.f.fila)) return;
    siguen += _logFiguraAudAg_(C, x.f, x.f.fila, x.f.fecha, x.f.barrio, x.motivo, (x.filas || []).join(', '), ' (NUEVA: no estaba en la solapa; la agrega la próxima corrida)');
  });
  C.cuentas['FIGURA A COMPLETAR'] = siguen;
}

/** Una línea de la sección 7. Devuelve 1 si la base sigue con la Figura vacía. */
function _logFiguraAudAg_(C, f, filaNum, fecha, barrio, motivo, conjFilas, nota) {
  const v = function (n) { return f ? _valAudAg_(C, f, n) : ''; };
  const lugarMail = str(v('Lugar (mail)'));
  const comuna = f && f.barrio ? _comunaBarrioAg_(f.barrio) : (lugarMail ? detectComuna_(lugarMail) : null);
  const vacia = !f || !f.figura;
  const plan = f && C.plan ? C.plan.figuraACompletar.filter(function (x) { return x.f.fila === f.fila; })[0] : null;
  const nueva = f && C.plan && C.plan.figuraNueva ? C.plan.figuraNueva[f.fila] : '';
  Logger.log('  fila %s%s | %s | barrio %s | %s | %s | dirección "%s"', filaNum || '?', nota || '', fecha ? fmtFecha_(fecha) : '(sin fecha)', barrio || (f && f.barrio) || '—',
             comuna != null ? 'Comuna ' + comuna : 'sin comuna', lugarMail ? 'mail: ' + lugarMail : 'sin "Lugar (mail)"', str(v('Dirección')) || str(v('Dirección (mail)')) || '—');
  Logger.log('      por qué no hay figura: %s%s', motivo || '—', conjFilas ? ' (RDV CONJUNTO filas ' + conjFilas + ')' : '');
  if (plan && plan.motivo !== motivo) Logger.log('      hoy la agenda diría: %s', plan.motivo);
  if (nueva) Logger.log('      hoy la agenda SÍ la encuentra: la próxima corrida pone "%s"', nueva);
  const delDia = fecha ? (C.conjunto.get(ymd_(fecha)) || []) : [];
  Logger.log('      RDV CONJUNTO ese día: %s', delDia.length ? delDia.slice(0, 12).map(function (x) {
    return 'fila ' + x.fila + ' ' + x.nombre + ' (' + (x.ubic || 'sin barrio') + (x.dir ? ', ' + x.dir : '') + ')';
  }).join(' · ') + (delDia.length > 12 ? ' …' : '') : 'NINGUNA fila');
  Logger.log('      en la base hoy: %s', !f ? 'NO SE ENCONTRÓ LA FILA' : vacia ? 'la Figura SIGUE VACÍA' : 'ya tiene Figura: "' + f.figura + '"');
  if (vacia) _noOkAudAg_(C, '7', 'Seguridad sin figura | fila ' + (f ? f.fila : filaNum + ' (no encontrada)') + ' | ' + (fecha ? fmtFecha_(fecha) : '') + ' | ' +
                         (barrio || (f && f.barrio) || (comuna != null ? 'Comuna ' + comuna : '—')) + ' | ' + (motivo || '—'));
  return vacia ? 1 : 0;
}

// ===================== El resumen =====================

function _resumenAudAg_(C) {
  Logger.log('=== RESUMEN de la auditoría de la agenda ===');
  Logger.log('  reuniones del mail (dos semanas): OK %s | DISTINTO %s | FALTA EN LA BASE %s | DUPLICADA %s', C.cuentas.OK, C.cuentas.DISTINTO,
             C.cuentas['FALTA EN LA BASE'], C.cuentas.DUPLICADA);
  Logger.log('  filas de la base sin reunión en el mail: %s | ambiguas: %s | creadas (14 días) con algo para revisar: %s | AGENDA_DUPLICADOS ' +
             'pendientes: %s | Seguridad sin figura: %s', _cAudAg_(C, 'FILA SIN MAIL'), _cAudAg_(C, 'AMBIGUAS'), _cAudAg_(C, 'CREADAS CON PROBLEMAS'),
             _cAudAg_(C, 'DUPLICADOS PENDIENTES'), _cAudAg_(C, 'FIGURA A COMPLETAR'));
  Object.keys(C.extra.copias || {}).forEach(function (k) {
    const x = C.extra.copias[k];
    Logger.log('  copia "%s": %s reuniones | faltan %s | sobran %s | distintas %s', k, x.reuniones, x.faltan, x.sobran, x.distintas);
  });
  if (C.errores.length) {
    Logger.log('  SECCIONES QUE FALLARON: %s', C.errores.length);
    C.errores.forEach(function (e) { Logger.log('    %s', e); });
  }
  Logger.log('  TODO LO QUE NO ESTÁ OK: %s', C.noOk.length);
  C.noOk.forEach(function (t) { Logger.log('    %s', t); });
  if (!C.noOk.length && !C.errores.length) Logger.log('    nada: la agenda, la base y las copias coinciden.');
}

function _cAudAg_(C, k) { return C.cuentas[k] == null ? '(no se calculó)' : C.cuentas[k]; }
