/**
 * diagnostico/31_auditoria_cancelaciones.js — AUDITORÍA DE CANCELACIONES (15/10). SÓLO LECTURA: no escribe NADA.
 *
 * Ni valores, ni formatos, ni protecciones, ni propiedades, ni etiquetas o marcas de leído de Gmail, ni caches. Sólo el
 * log (Logger.log) y el objeto que devuelve. Se corre desde 99_Correr.js (paso 68).
 *
 * Período: del AUDITORIA_CANCEL_DESDE (07/09/2026) al AUDITORIA_CANCEL_HASTA (24/10/2026, el fin de la semana que viene).
 * Por cada fuente que puede decir "esta reunión no se hizo", la lista con la fila de la base ("RVD JM-CM - ES") y su
 * STATUS REUNIÓN de hoy, y si coinciden:
 *   1. DESAPARECIDAS DEL MAIL: estaban en una versión del mail de su semana + grupo y no en la última. Con la misma lectura
 *      que la agenda (`agendaDesdeListaDeMails_`, 41_AgendaParser.js): un "Re:"/"RV:"/"Fwd:" sólo agrega o actualiza; sólo
 *      un mail COMPLETO hace desaparecer una reunión. Con la versión que la sacó, si era futura cuando desapareció, si
 *      reaparece en otra fecha (reprogramación sólo si la reunión de la fecha nueva es POSTERIOR, NUEVA y con la misma hora
 *      o lugar), qué dice la base y qué dice AGENDA_DUPLICADOS;
 *   2. MARCADAS EN EL MAIL: siguen en el mail, pero con "suspendida", "cancelada", "reprogramada", "posterga", "no se
 *      realiza" en el evento, la hora o el lugar ("se pasa" solo es una señal débil: posible cambio); o TACHADAS en el HTML
 *      (<s>, <strike>, <del>, line-through): cancelación sólo si está tachada la línea "Evento:" entera o el día entero;
 *      tachar sólo la hora o el lugar es un CAMBIO. En una respuesta o reenvío, sólo lo propio (no la cita, de Gmail ni de
 *      Outlook). El parser de la agenda lee getPlainBody() (41_AgendaParser.js, leerMailsAgendaGmail_): el tachado no le
 *      llega. Acá se lee además getBody() (el HTML), sólo para medir;
 *   3. RDV CONJUNTO: filas del período con un estado distinto de Realizada / Programado, contra la fila de la base (el
 *      cruce de `cruzarAsistentes_`: figura por tokens + fecha; con 2+ filas, la dirección y después el barrio);
 *   4. "Agenda Directa" (archivo "Agenda", del equipo): las reuniones con algo marcado en CANCELACIÓN;
 *   5. FILAS VENCIDAS: "en agenda" con FECHA de hace más de AUDITORIA_CANCEL_DIAS_VENCIDA días y sin Asistentes;
 *   y un RESUMEN: lo que la base YA refleja, lo que NO (con la fuente que lo dice) y lo CONTRADICTORIO.
 * Cada sección en su try/catch: si una falla, las demás siguen y el resumen lo dice. Todo se lee por encabezado.
 */

/** El período auditado (fecha de la reunión), "yyyy-MM-dd". */
const AUDITORIA_CANCEL_DESDE = '2026-09-07';
const AUDITORIA_CANCEL_HASTA = '2026-10-24';
/** Los mails se leen desde unos días antes del período (el mail de una semana llega la semana anterior). */
const AUDITORIA_CANCEL_DIAS_MAILS_ANTES = 14;
/** Una fila "en agenda" sin Asistentes con la FECHA de hace más de estos días: vencida (probablemente no se hizo). */
const AUDITORIA_CANCEL_DIAS_VENCIDA = 2;
/** Hasta cuántos días de distancia la misma figura en otra fecha cuenta como posible reprogramación. */
const AUDITORIA_CANCEL_DIAS_REPROG = 14;
/** La solapa del equipo en el archivo "Agenda" (AGENDA_COPIA_SS). */
const AUDITORIA_CANCEL_SOLAPA_DIRECTA = 'Agenda Directa';
/** Las palabras que marcan una reunión en el mail (sobre el texto normalizado: sin tildes ni mayúsculas). */
const AUDITORIA_CANCEL_PALABRAS = /suspendid|cancelad|reprogramad|postergad|posterga|\bse pasa\b|no se realiza/;
/** Las que dicen "se movió" (y no "se cayó"). */
const AUDITORIA_CANCEL_PALABRAS_REPROG = /reprogramad|postergad|posterga|\bse pasa\b/;
/** Encabezados posibles de la columna de estado de RDV CONJUNTO (si ninguno está, se busca por el contenido). */
const AUDITORIA_CANCEL_ENC_ESTADO = ['estado', 'status', 'estado reunion', 'estado reunión', 'status reunion', 'status reunión',
  'estado del evento', 'estado evento', 'estado del encuentro', 'situacion', 'situación'];
/** Las marcas internas del HTML pasado a texto (caracteres de uso privado: no aparecen en un mail): tachado y cita. */
const AUDITORIA_CANCEL_INI = String.fromCharCode(0xE000);
const AUDITORIA_CANCEL_FIN = String.fromCharCode(0xE001);
const AUDITORIA_CANCEL_CITA = String.fromCharCode(0xE002);
/** Las sub-columnas conocidas de "Agenda Directa" (para arrastrar el grupo si no se pueden leer las celdas combinadas). */
const AUDITORIA_CANCEL_SUBCOLUMNAS = ['hecho', 'ok sol', 'programado', 'ivr'];
/** Una casilla marcada: true, o una marca explícita. */
const AUDITORIA_CANCEL_MARCA = /^(true|verdadero|si|x|✓|✔|☑)$/;
/** Valores de estado que se reconocen (para encontrar la columna por contenido). */
const AUDITORIA_CANCEL_RE_ESTADO = /^(realizad|programad|suspendid|cancelad|reprogramad|postergad|en agenda|no se realiz)/;

// ===================== El punto de entrada =====================

/**
 * **La auditoría.** `opciones` (sólo para los tests): `mails` (lista `{fecha, asunto, cuerpo, html, id}` en vez de
 * Gmail), `hoy` (Date). Devuelve `{ cuentas, resumen, hallazgos, vencidas, tachado, errores }`.
 */
function auditoriaCancelaciones(opciones) {
  opciones = opciones || {};
  const t0 = Date.now();
  const hoy = opciones.hoy || hoyMediodia_();
  // 15/10: el período se puede pasar (el resumen semanal de 50_Avisos.js usa uno móvil); si no, el fijo de arriba (paso 68)
  const desde = opciones.desde || toDate_(AUDITORIA_CANCEL_DESDE), hasta = opciones.hasta || toDate_(AUDITORIA_CANCEL_HASTA);
  const C = {
    hoy: hoy, desde: desde, hasta: hasta,
    desdeMails: new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() - AUDITORIA_CANCEL_DIAS_MAILS_ANTES, 0, 0, 0),
    enPeriodo: function (f) { return !!f && ymd_(f) >= ymd_(desde) && ymd_(f) <= ymd_(hasta); },
    cuentas: {}, hallazgos: [], errores: [], vencidas: [], tachado: { mails: 0, reuniones: [], cambios: [], fuera: 0 },
    cambios: [],               // posibles cambios (no cancelaciones): "se pasa" solo, y el tachado parcial (hora / lugar)
    conjRealizada: new Map()   // fila de la base → fila de RDV CONJUNTO que dice "Realizada" (para las contradicciones)
  };
  Logger.log('=== auditoriaCancelaciones (paso 68) — SÓLO LECTURA: no escribe nada (ni la base, ni el archivo "Agenda", ni Gmail) ===');
  Logger.log('  hoy %s | período (fecha de la reunión) %s al %s | mails desde el %s', fmtFecha_(hoy), fmtFecha_(desde), fmtFecha_(hasta),
             fmtFecha_(C.desdeMails));

  _seccionAudCan_(C, 'lectura de la base', function () {
    C.dest = leerDestino_();
    C.A = indicesAgenda_(C.dest.hdr);
    C.iAsis = C.dest.D['Asistentes'];
    if (C.A['STATUS REUNIÓN'] == null) throw new Error('la base no tiene la columna STATUS REUNIÓN');
    Logger.log('  base "%s": %s filas con datos', RDV_HOJA_DESTINO, C.dest.filas.length);
  });
  _seccionAudCan_(C, 'lectura de los mails', function () {
    C.mails = opciones.mails ? { fuente: '(lista de prueba)', lista: opciones.mails, errores: [] } : _leerMailsAudCan_(C.desdeMails);
    C.r = agendaDesdeListaDeMails_(C.mails.lista, C.mails);
    Logger.log('  mails: %s (%s)', C.mails.lista.length, C.mails.fuente);
    (C.mails.errores || []).forEach(function (e) { Logger.log('  AVISO de Gmail: %s', e); });
  });
  _seccionAudCan_(C, 'lectura de AGENDA_DUPLICADOS', function () { C.dup = _leerDuplicadosAudCan_(); });
  if (!C.dup) C.dup = { porReunion: new Map(), porFila: new Map(), elecciones: new Map() };

  _seccionAudCan_(C, '1. desaparecidas del mail', function () { _s1DesaparecidasAudCan_(C); });
  _seccionAudCan_(C, '2. marcadas en el mail', function () { _s2MarcadasAudCan_(C); });
  _seccionAudCan_(C, '3. RDV CONJUNTO', function () { _s3ConjuntoAudCan_(C); });
  _seccionAudCan_(C, '4. Agenda Directa', function () { _s4DirectaAudCan_(C); });
  _seccionAudCan_(C, '5. filas vencidas', function () { _s5VencidasAudCan_(C); });

  const resumen = _resumenAudCan_(C);
  Logger.log('auditoriaCancelaciones: %s ms', Date.now() - t0);
  return { cuentas: C.cuentas, resumen: resumen, hallazgos: C.hallazgos.map(_hallazgoPlanoAudCan_), vencidas: C.vencidas,
           tachado: C.tachado, cambios: C.cambios, errores: C.errores };
}

/** Una sección aislada: si falla, se dice y la auditoría sigue. */
function _seccionAudCan_(C, nombre, fn) {
  try { fn(); } catch (err) {
    const m = String(err && err.message || err);
    Logger.log('>>> la sección "%s" FALLÓ: %s (las demás siguen)', nombre, m);
    C.errores.push(nombre + ': ' + m);
  }
}

// ===================== Lecturas =====================

/**
 * Los mails de agenda desde `desde`, **igual que `leerMailsAgendaGmail_`** (41_AgendaParser.js: la etiqueta
 * AGENDA_ETIQUETA_GMAIL o el asunto AGENDA_ASUNTOS_GMAIL, sin duplicar por id), y además el HTML (`getBody()`), que la
 * agenda no lee. Sólo lectura: no marca leídos ni toca etiquetas.
 */
function _leerMailsAudCan_(desde) {
  const vistos = {}, lista = [], errores = [];
  const dias = Math.max(1, Math.ceil((Date.now() - desde.getTime()) / 86400000) + 1);
  const agregar = function (hilos) {
    hilos.forEach(function (h) {
      if (h.getLastMessageDate() < desde) return;
      const idHilo = h.getId();
      h.getMessages().forEach(function (msg) {
        const id = msg.getId();
        if (vistos[id] || msg.getDate() < desde) return;
        vistos[id] = true;
        let html = '';
        try { html = String(msg.getBody() || ''); } catch (e) { html = ''; }
        lista.push({ fecha: msg.getDate(), asunto: msg.getSubject() || '', cuerpo: String(msg.getPlainBody() || ''), html: html,
                     truncado: false, id: id, hilo: idHilo });
      });
    });
  };
  try {
    const etiqueta = GmailApp.getUserLabelByName(AGENDA_ETIQUETA_GMAIL);
    if (etiqueta) {
      for (let inicio = 0; inicio < 2000; inicio += 100) {
        const hilos = etiqueta.getThreads(inicio, 100);
        if (!hilos.length) break;
        agregar(hilos);
        if (hilos.length < 100 || hilos[hilos.length - 1].getLastMessageDate() < desde) break;
      }
    } else errores.push('no existe la etiqueta "' + AGENDA_ETIQUETA_GMAIL + '"');
  } catch (e) { errores.push('etiqueta: ' + e); }
  AGENDA_ASUNTOS_GMAIL.forEach(function (asunto) {
    try {
      const q = 'subject:("' + asunto + '") newer_than:' + dias + 'd';
      for (let inicio = 0; inicio < 2000; inicio += 500) {
        const hilos = GmailApp.search(q, inicio, 500);
        if (!hilos.length) break;
        agregar(hilos);
        if (hilos.length < 500) break;
      }
    } catch (e) { errores.push('asunto "' + asunto + '": ' + e); }
  });
  if (!lista.length && errores.length) throw new Error('Gmail: ' + errores.join(' | '));
  lista.sort(function (x, y) { return x.fecha - y.fecha; });
  return { fuente: 'Gmail (como la agenda, más el HTML): ' + dias + ' días', lista: lista, errores: errores };
}

/**
 * AGENDA_DUPLICADOS (archivo de la base): las líneas por id_reunion y por id_fila, y las elecciones guardadas
 * (`leerEleccionesAgenda_`, que lee ELECCIONES_AGENDA y la solapa: sólo lectura).
 */
function _leerDuplicadosAudCan_() {
  const out = { porReunion: new Map(), porFila: new Map(), elecciones: new Map() };
  try { out.elecciones = leerEleccionesAgenda_(); } catch (e) { Logger.log('  AVISO: las elecciones de la agenda no se pudieron leer: %s', e); }
  const sh = ssDestino_().getSheetByName(AGENDA_SOLAPA_DUPLICADOS);
  if (!sh || sh.getLastRow() < 2) { Logger.log('  %s: vacía o no existe', AGENDA_SOLAPA_DUPLICADOS); return out; }
  const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const hdr = v[0].map(normalizeHeader_);
  const i = function (n) { return hdr.indexOf(normalizeHeader_(n)); };
  v.slice(1).forEach(function (r, k) {
    const g = function (n) { return i(n) < 0 ? '' : str(r[i(n)]); };
    const l = { linea: k + 2, tipo: g('tipo'), elegir: g('ELEGIR'), resultado: g('resultado'), reunion: g('reunión del mail'),
                idReunion: g('id_reunion'), idFila: g('id_fila') };
    if (l.idReunion) out.porReunion.set(l.idReunion, l);
    if (l.idFila && /cancel/.test(normalizeText_(l.tipo))) out.porFila.set(l.idFila, l);
  });
  Logger.log('  %s: %s líneas', AGENDA_SOLAPA_DUPLICADOS, v.length - 1);
  return out;
}

// ===================== Ayudas =====================

function _valAudCan_(C, f, n) { return C.A[n] == null ? '' : f.valores[C.A[n]]; }
function _statusAudCan_(C, f) { return str(_valAudCan_(C, f, 'STATUS REUNIÓN')); }
function _asisAudCan_(C, f) { return C.iAsis == null ? '' : f.valores[C.iAsis]; }

function _filaTextoAudCan_(C, f) {
  return 'fila ' + f.fila + ' | ' + (f.figura || '(sin figura)') + ' | ' + (f.fecha ? fmtFecha_(f.fecha) : '(sin fecha)') + ' ' +
         (valorAgendaComparable_(_valAudCan_(C, f, 'HORA'), 'HORA') || '') + ' | ' + (f.barrio || 'sin barrio') + ' | STATUS ' +
         (_statusAudCan_(C, f) || '(vacío)') + (esVacio_(_asisAudCan_(C, f)) ? '' : ' | Asistentes ' + _asisAudCan_(C, f));
}

function _evTextoAudCan_(ev) {
  return (ev.fecha ? fmtFecha_(ev.fecha) : '(sin fecha)') + ' ' + (ev.hora || '--:--') + ' | ' +
         ((ev.figuras && ev.figuras.length) ? ev.figuras.join(' + ') : (ev.tipo || '(sin figura)')) + ' | ' + (ev.tipo || '') + ' | ' + (ev.lugar || '—');
}

/** Barrio / comuna / eje de una reunión contra una fila (la regla de los tres niveles, como la agenda; sin lo del mail de la fila). */
function _ubicaAudCan_(ev, f) {
  if (usarUbicacion3_()) return compararUbicacion_(ubicacionDeEvento_(ev), ubicacionDeFila_(f, true)).coincide === true;
  if (!f.barrio) return false;
  if (ev.barrio) return normalizeText_(_canonBarrioAg_(ev.barrio) || ev.barrio) === normalizeText_(_canonBarrioAg_(f.barrio) || f.barrio);
  return ev.comuna != null && _comunaBarrioAg_(f.barrio) === ev.comuna;
}

/**
 * Las filas de la base de una reunión (del mail o de "Agenda Directa"), como las candidatas de la agenda (regla 4 de
 * `planAgenda_`): con figura, las filas de esa figura (o de la siguiente que nombra) ese día; sin figura, las de ese día
 * con la misma dirección o, sin figura, la misma ubicación. Con 2+, desempata la HORA si deja una.
 * Una conjunta: las filas de la SEGUNDA figura (o siguientes) sólo si son la misma reunión (la misma hora o el mismo
 * lugar); una fila de otra figura nombrada ese día puede ser otra reunión suya (revisión del 15/10).
 */
function _filasDeEventoAudCan_(C, ev, fecha) {
  fecha = fecha || ev.fecha;
  if (!fecha || !C.dest) return [];
  const delDia = C.dest.filas.filter(function (f) { return f.fecha && ymd_(f.fecha) === ymd_(fecha); });
  const dir = str(ev.lugarTexto);
  const mismoLugar = function (f) {
    const d = str(_valAudCan_(C, f, 'Dirección')), de = str(_valAudCan_(C, f, 'agenda_direccion_escrita'));
    return !!dir && (normalizeText_(de) === normalizeText_(dir) || /exacta|parecida/.test(compararDirecciones_(dir, d)));
  };
  const mismaHora = function (f) { return !!ev.hora && valorAgendaComparable_(_valAudCan_(C, f, 'HORA'), 'HORA') === ev.hora; };
  let c = [];
  const figs = ev.figuras || [];
  for (let i = 0; !c.length && i < figs.length; i++) {
    c = delDia.filter(function (f) { return normalizeText_(f.figura) === normalizeText_(figs[i]); });
    if (i > 0) c = c.filter(function (f) { return mismaHora(f) || mismoLugar(f) || _ubicaAudCan_(ev, f); });
  }
  if (!figs.length) {
    c = delDia.filter(function (f) { return mismoLugar(f) || (!f.figura && _ubicaAudCan_(ev, f)); });
  }
  if (c.length > 1 && ev.hora) {
    const h = c.filter(function (f) { return valorAgendaComparable_(_valAudCan_(C, f, 'HORA'), 'HORA') === ev.hora; });
    if (h.length === 1) c = h;
  }
  return c;
}

/**
 * El veredicto de una fuente que dice "no se hizo" (`dice`: 'cancelada' | 'reprogramada') contra las filas de la base:
 * SIN FILA | AMBIGUA | REFLEJADA (Suspendida o Reprogramada) | CONTRADICTORIA (Realizada, o con Asistentes) |
 * NO REFLEJADA ("en agenda" o vacío, sin Asistentes) | OTRO ESTADO.
 */
function _veredictoAudCan_(C, filas) {
  if (!filas.length) return 'SIN FILA';
  if (filas.length > 1) return 'AMBIGUA';
  const f = filas[0], st = normStatus_(_statusAudCan_(C, f));
  if (st === 'suspendida' || st === 'reprogramada') return 'REFLEJADA';
  if (st === 'realizada' || numOcero_(_asisAudCan_(C, f)) > 0) return 'CONTRADICTORIA';
  if (st === 'en agenda' || st === '') return 'NO REFLEJADA';
  return 'OTRO ESTADO';
}

/** Anota un hallazgo (lo que va al resumen). */
function _hallazgoAudCan_(C, h) {
  h.fila = h.filas && h.filas.length === 1 ? h.filas[0] : null;
  C.hallazgos.push(h);
  C.cuentas[h.fuente + ': ' + h.veredicto] = (C.cuentas[h.fuente + ': ' + h.veredicto] || 0) + 1;
  return h;
}

function _hallazgoPlanoAudCan_(h) {
  return { fuente: h.fuente, dice: h.dice, veredicto: h.veredicto, fila: h.fila ? h.fila.fila : null,
           filas: (h.filas || []).map(function (f) { return f.fila; }), reunion: h.reunion, detalle: h.detalle };
}

/** Lo que dice AGENDA_DUPLICADOS de la cancelación de una reunión del mail (por id_reunion) o de una fila (por id_fila). */
function _dupTextoAudCan_(C, ev, f) {
  const idC = ev ? 'cancelacion|' + idReunionAgenda_(ev) : '';
  const l = (idC && C.dup.porReunion.get(idC)) || (f ? C.dup.porFila.get(idFilaAgenda_(f)) : null);
  const el = idC ? C.dup.elecciones.get(idC) : null;
  if (l) return 'línea ' + l.linea + ' (' + l.tipo + '): ELEGIR "' + (l.elegir || '(vacío: PENDIENTE)') + '"' + (l.resultado ? ', ' + l.resultado : '');
  if (el) return 'elegido antes: "' + el.texto + '"';
  return 'no está';
}

function _logFilasAudCan_(C, filas) {
  if (!filas.length) { Logger.log('      base: SIN FILA ese día'); return; }
  filas.forEach(function (f) { Logger.log('      base: %s', _filaTextoAudCan_(C, f)); });
  if (filas.length > 1) Logger.log('      AMBIGUA: %s filas posibles; no se elige', filas.length);
}

// ===================== 1. Desaparecidas del mail =====================

function _s1DesaparecidasAudCan_(C) {
  if (!C.r) throw new Error('no hay mails leídos');
  if (!C.dest) throw new Error('no se leyó la base');
  const presentes = new Set(), presentesFigFecha = new Set();
  C.r.ultimas.concat(C.r.unicas).forEach(function (ev) {
    presentes.add(ev.clave); if (ev.claveGrupo) presentes.add(ev.claveGrupo);
    if (ev.figuraFila && ev.fecha) presentesFigFecha.add(normalizeText_(ev.figuraFila) + '|' + ymd_(ev.fecha));
  });
  const lista = C.r.desaparecidas.filter(function (d) { return C.enPeriodo(d.fecha); })
    .sort(function (a, b) { return a.fecha - b.fecha; });
  Logger.log('--- 1. DESAPARECIDAS DEL MAIL (estaban en una versión de su semana + grupo y no en la última): %s en el período ---', lista.length);
  Logger.log('    (un "Re:"/"RV:"/"Fwd:" sólo agrega o actualiza: sólo un mail COMPLETO saca una reunión; así lo lee la agenda)');
  let otroGrupo = 0, pasadas = 0;
  lista.forEach(function (d) {
    if (presentes.has(d.clave) || (d.figuraFila && presentesFigFecha.has(normalizeText_(d.figuraFila) + '|' + ymd_(d.fecha)))) {
      otroGrupo++;
      Logger.log('  [SIGUE EN EL MAIL] %s | %s: salió del mail de "%s" pero sigue en otro (otro grupo o la misma figura ese día)',
                 _evTextoAudCan_(d), d.semana, d.grupo);
      return;
    }
    const vista = 'vista hasta la v' + d.ultimaVersionVista + '/' + d.versiones + ' (mail ' + _hhAudCan_(d.mailFecha) + ')';
    const saco = d.versionQueLaSaco ? 'la sacó la v' + d.versionQueLaSaco + ' (mail completo del ' + _hhAudCan_(d.mailQueLaSaco) + ': "' + d.asuntoQueLaSaco + '")'
                                    : 'ningún mail completo posterior la sacó';
    const reprog = _reprogramacionAudCan_(C, d);
    const filas = _filasDeEventoAudCan_(C, d);
    const dup = _dupTextoAudCan_(C, d, filas.length === 1 ? filas[0] : null);
    let veredicto, dice = 'cancelada', nota = '';
    if (!d.futuraAlDesaparecer) {
      veredicto = 'NO ES CANCELACIÓN';
      nota = 'ya había pasado cuando salió del mail (la agenda no la toca)';
      pasadas++;
    } else if (reprog && reprog.ev) {
      dice = 'reprogramada';
      const filasNueva = _filasDeEventoAudCan_(C, reprog.ev);
      const textoNueva = filasNueva.length ? filasNueva.map(function (f) { return f.fila + ' (' + (_statusAudCan_(C, f) || 'sin STATUS') + ')'; }).join(', ') : 'ninguna';
      const stNueva = filasNueva.length === 1 ? normStatus_(_statusAudCan_(C, filasNueva[0])) : '';
      if (!filas.length && filasNueva.length === 1 && (stNueva === 'en agenda' || stNueva === 'realizada')) {
        veredicto = 'REFLEJADA';
        nota = 'reprogramada: la base tiene la fila del ' + fmtFecha_(reprog.ev.fecha) + ' (fila ' + filasNueva[0].fila + ', ' + _statusAudCan_(C, filasNueva[0]) +
               ') y ninguna en la fecha vieja';
      } else if (!filas.length) {
        // la fila de la fecha nueva no es clara (ninguna, varias, o con un STATUS que no es de una reunión vigente): no se afirma nada
        veredicto = 'DUDOSA';
        nota = 'reprogramada al ' + fmtFecha_(reprog.ev.fecha) + ', pero la fila de la fecha nueva no es clara (filas: ' + textoNueva + '): revisar a mano';
      } else {
        veredicto = _veredictoAudCan_(C, filas);
        nota = 'reprogramada al ' + fmtFecha_(reprog.ev.fecha) + ' (' + reprog.como + '); filas de la fecha nueva: ' + textoNueva;
      }
    } else {
      veredicto = _veredictoAudCan_(C, filas);
      if (reprog && reprog.dudas) nota = 'sin reprogramación clara: ' + reprog.dudas;
      if (d.versionParcial) nota = (nota ? nota + '; ' : '') + 'OJO: la versión que la sacó es PARCIAL (menos del ' + Math.round(AGENDA_FRACCION_VERSION_PARCIAL * 100) + '% de las reuniones): la agenda no suspende';
    }
    Logger.log('  [%s] %s | %s, semana %s | %s; %s | futura al desaparecer: %s | ¿se movió?: %s', veredicto, _evTextoAudCan_(d), d.grupo, d.semana,
               vista, saco, d.futuraAlDesaparecer ? 'sí' : 'NO', reprog && reprog.ev ? 'sí, al ' + fmtFecha_(reprog.ev.fecha) + ' ' + (reprog.ev.hora || '') + ' (' + reprog.como + ')'
                                                                                : (reprog && reprog.dudas ? 'sin reprogramación clara' : 'no'));
    _logFilasAudCan_(C, filas);
    Logger.log('      AGENDA_DUPLICADOS: %s', dup);
    if (nota) Logger.log('      %s', nota);
    if (veredicto === 'NO ES CANCELACIÓN') return;
    _hallazgoAudCan_(C, { fuente: 'mail (desapareció)', dice: dice, veredicto: veredicto, filas: filas, reunion: _evTextoAudCan_(d),
                          detalle: saco + (reprog && reprog.ev ? '; reprogramada al ' + fmtFecha_(reprog.ev.fecha) : '') + '; AGENDA_DUPLICADOS: ' + dup + (nota ? '; ' + nota : '') });
  });
  // Lo que falta en una respuesta pero sigue en el estado (no es desaparición: la respuesta sólo agrega o actualiza).
  const noSacan = _faltanEnRespuestasAudCan_(C);
  Logger.log('  faltan en un "Re:"/"RV:"/"Fwd:" posterior pero SIGUEN en el mail (no son desaparecidas): %s', noSacan.length);
  noSacan.forEach(function (t) { Logger.log('      %s', t); });
  C.cuentas['1 desaparecidas en el período'] = lista.length;
  C.cuentas['1 siguen en el mail de otro grupo'] = otroGrupo;
  C.cuentas['1 ya habían pasado'] = pasadas;
}

function _hhAudCan_(d) { return d ? Utilities.formatDate(d, RDV_TZ, 'dd/MM HH:mm') : '—'; }

/**
 * ¿Se movió? (revisión del 15/10: una figura como Macri tiene varias reuniones por semana, así que "la misma figura otro
 * día" no alcanza). Una reunión de la última versión es la reprogramación de la desaparecida `d` si:
 *   - es de la misma figura (sin figura: el mismo tipo y lugar), en una fecha POSTERIOR, a lo sumo
 *     AUDITORIA_CANCEL_DIAS_REPROG días después;
 *   - es NUEVA: no estaba en la primera versión de su semana + grupo, y apareció con el mail que sacó a `d` o después;
 *   - tiene la misma hora o el mismo lugar (dirección); de varias, la que coincide en más cosas y, a igual, la más cercana.
 * Devuelve `null` (ninguna de la figura después), `{ ev, como }` o `{ dudas }` ("sin reprogramación clara": por qué no).
 */
function _reprogramacionAudCan_(C, d) {
  const misma = function (u) {
    if (d.figuraFila) return u.figuraFila === d.figuraFila;
    return !u.figuraFila && u.tipo === d.tipo && !!u.lugar && u.lugar === d.lugar;
  };
  const posibles = C.r.unicas.filter(function (u) {
    if (!u.fecha || !d.fecha || !misma(u) || ymd_(u.fecha) <= ymd_(d.fecha)) return false;
    return diasEntre_(u.fecha, d.fecha) <= AUDITORIA_CANCEL_DIAS_REPROG;
  });
  if (!posibles.length) return null;
  const dudas = [];
  const c = [];
  posibles.forEach(function (u) {
    const ap = _primeraAparicionAudCan_(C, u);
    const t = fmtFecha_(u.fecha) + ' ' + (u.hora || '');
    if (!ap || ap.indice === 0) { dudas.push(t + ' ya estaba en la primera versión de su semana (no es nueva)'); return; }
    if (d.mailQueLaSaco && ap.fecha < d.mailQueLaSaco) { dudas.push(t + ' apareció antes de que saliera la del ' + fmtFecha_(d.fecha)); return; }
    const hora = !!d.hora && u.hora === d.hora;
    const lugar = !!str(d.lugarTexto) && (normalizeText_(d.lugarTexto) === normalizeText_(u.lugarTexto) ||
                                          /exacta|parecida/.test(compararDirecciones_(d.lugarTexto, u.lugarTexto)));
    if (!hora && !lugar) { dudas.push(t + ' es nueva pero con otra hora y otro lugar'); return; }
    c.push({ u: u, puntos: (hora ? 1 : 0) + (lugar ? 1 : 0), dist: diasEntre_(u.fecha, d.fecha), hora: hora, lugar: lugar });
  });
  if (!c.length) return { dudas: dudas.join('; ') };
  c.sort(function (a, b) { return (b.puntos - a.puntos) || (a.dist - b.dist); });
  if (c.length > 1 && c[1].puntos === c[0].puntos && c[1].dist === c[0].dist) {
    return { dudas: c.length + ' reuniones nuevas igual de parecidas (' + c.map(function (x) { return fmtFecha_(x.u.fecha) + ' ' + x.u.hora; }).join(', ') + ')' };
  }
  const u = c[0].u;
  return { ev: u, como: ((u.grupo === d.grupo && u.semana === d.semana) ? 'misma semana' : 'otra semana: ' + u.semana) + ', nueva, ' +
                        [c[0].hora ? 'misma hora' : '', c[0].lugar ? 'mismo lugar' : ''].filter(Boolean).join(' y ') };
}

/**
 * La primera versión de su semana + grupo en la que aparece una reunión de la última versión: `{ indice, fecha }` (índice
 * 0 = la primera versión). Cada semana + grupo se parsea una sola vez (en memoria).
 */
function _primeraAparicionAudCan_(C, u) {
  C._versiones = C._versiones || new Map();
  const g = C.r.semanas.filter(function (x) { return x.grupo === u.grupo && x.semanaTexto === u.semana; })[0];
  if (!g) return null;
  const k = g.grupo + '|' + g.semanaTexto;
  if (!C._versiones.has(k)) {
    C._versiones.set(k, g.versiones.map(function (m) {
      return new Set(_parsearCuerpoAgenda_(m.cuerpo, m.fecha, _rVacio_(), { grupo: g.grupo, semana: g.semanaTexto, desde: g.desde, hasta: g.hasta })
        .map(function (x) { return x.claveBase; }));
    }));
  }
  const sets = C._versiones.get(k);
  for (let i = 0; i < sets.length; i++) if (sets[i].has(u.claveBase)) return { indice: i, fecha: g.versiones[i].fecha };
  return null;
}

/** Por cada semana + grupo: las reuniones del estado que NO trae una respuesta posterior al último mail completo. */
function _faltanEnRespuestasAudCan_(C) {
  const out = [];
  C.r.semanas.forEach(function (g) {
    let base = -1;
    for (let i = g.versiones.length - 1; i >= 0; i--) if (!RE_RESPUESTA_AGENDA_.test(g.versiones[i].asunto || '')) { base = i; break; }
    if (base < 0) return;
    const estado = C.r.ultimas.filter(function (ev) { return ev.grupo === g.grupo && ev.semana === g.semanaTexto && C.enPeriodo(ev.fecha); });
    for (let i = base + 1; i < g.versiones.length; i++) {
      const m = g.versiones[i];
      const trae = new Set(_parsearCuerpoAgenda_(m.cuerpo, m.fecha, _rVacio_(), { grupo: g.grupo, semana: g.semanaTexto, desde: g.desde, hasta: g.hasta })
        .map(function (x) { return x.claveBase; }));
      estado.forEach(function (ev) {
        if (!trae.has(ev.claveBase)) out.push(_evTextoAudCan_(ev) + ' | no está en "' + m.asunto + '" (' + _hhAudCan_(m.fecha) + '): SIGUE');
      });
    }
  });
  return out;
}

// ===================== 2. Marcadas en el mail (palabras y tachado) =====================

function _s2MarcadasAudCan_(C) {
  if (!C.r) throw new Error('no hay mails leídos');
  // 2a. palabras, en las reuniones vigentes (última versión)
  const vig = C.r.unicas.filter(function (ev) { return C.enPeriodo(ev.fecha); });
  const conPalabra = vig.filter(function (ev) {
    return AUDITORIA_CANCEL_PALABRAS.test(normalizeText_([ev.eventoTexto, ev.horaTexto, ev.lugarTexto].join(' ')));
  });
  Logger.log('--- 2a. MARCADAS CON PALABRAS en el mail (siguen en la última versión): %s de %s reuniones del período ---', conPalabra.length, vig.length);
  conPalabra.forEach(function (ev) {
    const t = normalizeText_([ev.eventoTexto, ev.horaTexto, ev.lugarTexto].join(' '));
    const palabras = t.match(new RegExp(AUDITORIA_CANCEL_PALABRAS.source, 'g')) || [];
    const palabra = palabras.join(', ');
    const filas = _filasDeEventoAudCan_(C, ev);
    // "se pasa" solo es una señal DÉBIL: puede ser un cambio de sala o de horario ("se pasa al salón 2"). Sin otra palabra, es
    // un posible cambio y no entra al resumen de cancelaciones.
    const soloSePasa = palabras.every(function (p) { return /se pasa/.test(p); });
    if (soloSePasa) {
      Logger.log('  [POSIBLE CAMBIO] %s | dice "%s" (señal DÉBIL: puede ser un cambio de sala u horario, no una cancelación) | Evento: %s | Hora: %s | Lugar: %s',
                 _evTextoAudCan_(ev), palabra, str(ev.eventoTexto), str(ev.horaTexto), str(ev.lugarTexto));
      _logFilasAudCan_(C, filas);
      C.cambios.push({ tipo: 'posible cambio ("se pasa")', reunion: _evTextoAudCan_(ev), filas: filas.map(function (f) { return f.fila; }) });
      return;
    }
    const dice = AUDITORIA_CANCEL_PALABRAS_REPROG.test(t.replace(/\bse pasa\b/g, ' ')) ? 'reprogramada' : 'cancelada';
    const v = _veredictoAudCan_(C, filas);
    Logger.log('  [%s] %s | dice "%s" | %s v%s/%s | Evento: %s | Hora: %s | Lugar: %s', v, _evTextoAudCan_(ev), palabra, ev.grupo, ev.version, ev.versiones,
               str(ev.eventoTexto), str(ev.horaTexto), str(ev.lugarTexto));
    _logFilasAudCan_(C, filas);
    _hallazgoAudCan_(C, { fuente: 'mail (palabra)', dice: dice, veredicto: v, filas: filas, reunion: _evTextoAudCan_(ev), detalle: 'el mail dice "' + palabra + '"' });
  });

  // 2b. el tachado del HTML
  const lista = (C.mails ? C.mails.lista : []).filter(function (m) { return m.fecha >= C.desdeMails; });
  const conHtml = lista.filter(function (m) { return str(m.html); });
  const estadoMail = _estadoDeMailsAudCan_(C);
  Logger.log('--- 2b. TACHADO en el HTML (<s>, <strike>, <del>, text-decoration: line-through) ---');
  Logger.log('  el parser de la agenda lee getPlainBody() (41_AgendaParser.js, leerMailsAgendaGmail_): el texto plano NO trae el tachado, ' +
             'así que una reunión tachada se lee como VIGENTE. Mails con HTML: %s de %s', conHtml.length, lista.length);
  let mailsCon = 0, enPlano = 0, total = 0;
  conHtml.forEach(function (m) {
    const res = _tachadosDeMailAudCan_(m);
    if (!res.tachados.length) return;
    mailsCon++;
    const em = estadoMail.get(m.id) || null;
    Logger.log('  mail %s | "%s" | %s | %s fragmento(s) tachado(s)', _hhAudCan_(m.fecha), m.asunto,
               em ? (em.vale ? 'versión que VALE' : 'versión reemplazada') : 'sin semana reconocida', res.tachados.length);
    const porReunion = new Map();
    res.tachados.forEach(function (t) {
      total++;
      const lee = normalizeText_(m.cuerpo).indexOf(normalizeText_(t.texto)) >= 0;
      if (lee) enPlano++;
      if (t.k < 0 || !res.evs[t.k]) {
        C.tachado.fuera++;
        Logger.log('      tachado FUERA de una reunión: "%s"', t.texto);
        return;
      }
      if (!porReunion.has(t.k)) porReunion.set(t.k, { campos: [], cancela: false });
      const pr = porReunion.get(t.k);
      // CANCELACIÓN sólo si está tachada la línea "Evento:" ENTERA o el encabezado del día entero (revisión del 15/10): tachar
      // la hora o el lugar viejos y escribir los nuevos al lado ("Hora: 17:00 18:00") es un CAMBIO, no una cancelación.
      if (t.entera && (t.campo === 'Evento' || t.campo === 'día')) pr.cancela = true;
      pr.campos.push(t.campo + (t.entera ? ' (entera)' : ' (parcial)') + ' "' + t.texto.replace(/^\s*(evento|hora|lugar|direcci[oó]n)\s*:\s*/i, '') + '"' +
                     (lee ? ' (en el texto plano, sin marca)' : ' (NO está igual en el texto plano)'));
      if (t.campo === 'Hora' && !t.entera && res.evs[t.k] && _horaAgenda_(t.texto) && _horaAgenda_(t.texto) === res.evs[t.k].hora) {
        pr.campos.push('OJO: la agenda lee la hora TACHADA (' + res.evs[t.k].hora + '): el texto plano trae las dos y el parser toma la primera');
      }
    });
    porReunion.forEach(function (pr, k) {
      const ev = res.evs[k], campos = pr.campos;
      const enPer = ev.fecha && C.enPeriodo(ev.fecha);
      const filas = enPer ? _filasDeEventoAudCan_(C, ev) : [];
      if (!pr.cancela) {
        Logger.log('    [CAMBIO TACHADO] %s | %s (sólo una parte: no es una cancelación, no va al resumen)', _evTextoAudCan_(ev), campos.join('; '));
        if (enPer) _logFilasAudCan_(C, filas);
        C.tachado.cambios.push({ mail: m.asunto, fecha: _hhAudCan_(m.fecha), reunion: _evTextoAudCan_(ev), campos: campos, vale: !!(em && em.vale) });
        if (enPer && em && em.vale) C.cambios.push({ tipo: 'cambio tachado', reunion: _evTextoAudCan_(ev), filas: filas.map(function (f) { return f.fila; }) });
        return;
      }
      const v = enPer ? _veredictoAudCan_(C, filas) : 'FUERA DEL PERÍODO';
      Logger.log('    [%s] TACHADA: %s | %s', v, _evTextoAudCan_(ev), campos.join('; '));
      if (enPer) _logFilasAudCan_(C, filas);
      C.tachado.reuniones.push({ mail: m.asunto, fecha: _hhAudCan_(m.fecha), reunion: _evTextoAudCan_(ev), campos: campos, veredicto: v, vale: !!(em && em.vale) });
      if (enPer && em && em.vale) {
        _hallazgoAudCan_(C, { fuente: 'mail (tachada)', dice: 'cancelada', veredicto: v, filas: filas, reunion: _evTextoAudCan_(ev),
                              detalle: 'tachada en el mail del ' + _hhAudCan_(m.fecha) + ' (' + campos.join('; ') + ')' });
      }
    });
  });
  C.tachado.mails = mailsCon;
  C.tachado.seLoPierde = true;
  Logger.log('  mails con algo tachado: %s | fragmentos: %s (que el texto plano trae SIN marca: %s) | reuniones tachadas (Evento o día entero): %s | ' +
             'cambios tachados (sólo hora / lugar / parte): %s | tachado fuera de una reunión: %s',
             mailsCon, total, enPlano, C.tachado.reuniones.length, C.tachado.cambios.length, C.tachado.fuera);
  Logger.log('  => el tachado SE PIERDE: el parser no lo ve (lee getPlainBody). Las tachadas de una versión que vale quedan como vigentes en la agenda.');
  C.cuentas['2 marcadas con palabras'] = conPalabra.length;
  C.cuentas['2 mails con tachado'] = mailsCon;
  C.cuentas['2 reuniones tachadas'] = C.tachado.reuniones.length;
}

/** id del mail → { g, vale }: si es la última versión completa de su semana + grupo o una respuesta posterior. */
function _estadoDeMailsAudCan_(C) {
  const out = new Map();
  C.r.semanas.forEach(function (g) {
    let base = -1;
    for (let i = g.versiones.length - 1; i >= 0; i--) if (!RE_RESPUESTA_AGENDA_.test(g.versiones[i].asunto || '')) { base = i; break; }
    g.versiones.forEach(function (m, i) { if (m.id) out.set(m.id, { g: g, vale: base < 0 || i >= base }); });
  });
  return out;
}

/**
 * Lo tachado de un mail: el HTML a texto con marcas en lo tachado (en una respuesta o reenvío, sólo lo propio:
 * `_propioDeHtmlAudCan_`), línea por línea con las MISMAS reglas que `_parsearCuerpoAgenda_` (encabezado del día, "Evento:",
 * "Hora:", "Lugar:", continuación). La k-ésima línea "Evento:" es la k-ésima reunión que devuelve el parser sobre ese mismo
 * texto. Devuelve `{ evs, tachados: [{ k, campo, texto, entera }] }` (k = -1: fuera de una reunión; `entera`: toda la línea
 * está tachada, salvo la etiqueta).
 */
function _tachadosDeMailAudCan_(m) {
  const I = AUDITORIA_CANCEL_INI, F = AUDITORIA_CANCEL_FIN, Q = AUDITORIA_CANCEL_CITA;
  const reSeg = new RegExp(I + '([^' + F + ']*)' + F, 'g');
  const reMarcas = new RegExp('[' + I + F + Q + ']', 'g');
  const limpiaDe = function (l) { return String(l || '').replace(reMarcas, ''); };
  let lineas = _htmlATextoMarcadoAudCan_(m.html).split('\n');
  // el mismo criterio que la agenda para "respuesta" (RE_RESPUESTA_AGENDA_: re, rv, fwd, aw, wg): se lee sólo lo propio
  if (RE_RESPUESTA_AGENDA_.test(m.asunto || '')) lineas = _propioDeHtmlAudCan_(lineas, limpiaDe, m.asunto);
  const limpias = [], tachados = [];
  let k = -1, campo = null, diaTachado = false;
  lineas.forEach(function (marcada) {
    const limpia0 = limpiaDe(marcada);
    const limpia = _limpiarLineaAgenda_(limpia0);
    limpias.push(limpia0);
    const seg = [];
    marcada.replace(reSeg, function (x, t) { if (str(t)) seg.push(str(t)); return x; });
    const tachado = _limpiarLineaAgenda_(seg.join(' '));
    // ¿la línea ENTERA está tachada? (lo que queda sin tachar, sin la etiqueta "Evento:" / "Hora:" / "Lugar:", no tiene letras ni números)
    const resto = normalizeText_(_limpiarLineaAgenda_(limpiaDe(marcada.replace(reSeg, ' '))).replace(/^\s*(evento|hora|lugar|direcci[oó]n)\s*:\s*/i, ''));
    const entera = !!tachado && !/[a-z0-9]/.test(resto);
    if (/^\[image:/i.test(limpia)) return;
    if (!limpia) { campo = null; return; }
    if (/^(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s*,?\s*(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\s*[.:]?$/.test(normalizeText_(limpia))) {
      diaTachado = entera; campo = null;
      if (tachado && !entera) tachados.push({ k: -1, campo: 'día (parcial)', texto: tachado, entera: false });
      return;
    }
    const et = /^\s*(evento|hora|lugar|direcci[oó]n)\s*:\s*(.*)$/i.exec(limpia);
    if (et) {
      const e = normalizeText_(et[1]);
      if (e === 'evento') {
        k++; campo = 'Evento';
        if (diaTachado) tachados.push({ k: k, campo: 'día', texto: '(el encabezado del día está tachado entero)', entera: true });
      } else if (k >= 0) campo = e === 'hora' ? 'Hora' : 'Lugar';
      if (tachado) tachados.push({ k: k, campo: campo || e, texto: tachado, entera: entera });
      return;
    }
    // una continuación: no cuenta como "la línea Evento entera" (sólo la línea con la etiqueta decide)
    if (tachado) tachados.push({ k: k, campo: (campo ? campo + ' (continuación)' : 'otra línea'), texto: tachado, entera: false });
  });
  const sem = _semanaAgenda_(m.asunto, m.cuerpo, m.fecha);
  const evs = _parsearCuerpoAgenda_(limpias.join('\n'), m.fecha, _rVacio_(), { grupo: sem ? sem.grupo : '', semana: sem ? sem.texto : '',
    version: 0, versiones: 0, mailFecha: m.fecha, asunto: m.asunto, mailId: m.id || '', desde: sem ? sem.desde : null, hasta: sem ? sem.hasta : null });
  return { evs: evs, tachados: tachados };
}

/**
 * Lo propio de una respuesta o un reenvío, sobre las líneas del HTML (como `_cuerpoPropioAgenda_` con el texto plano, más
 * las citas de Outlook): en un reenvío ("Forwarded message" / "Mensaje reenviado", o un "RV:"/"Fwd:" de Outlook con su
 * bloque "De: … Enviado: …"), lo reenviado sin su encabezado; y se corta en la primera cita: la marca de cita del HTML
 * (gmail_quote, blockquote, divRplyFwdMsg, el borde superior de Outlook, <hr>), "-----Original Message-----" /
 * "-----Mensaje original-----", una línea con ">", "El … escribió:" / "On … wrote:", o un bloque "De:/From: … Enviado:/Sent:".
 */
function _propioDeHtmlAudCan_(lineas, limpiaDe, asunto) {
  // 15/10 (noche): movida a producción (41_AgendaColores.js), la misma para los colores de la agenda
  return _propioDeHtmlAgenda_(lineas, limpiaDe, asunto, AUDITORIA_CANCEL_CITA);
}

/**
 * El HTML de un mail a texto plano, con lo tachado entre \uE000 y \uE001: <s>, <strike>, <del> o cualquier elemento con
 * "line-through" en su style. Los bloques (div, p, br, li, tr, h1-h6) cortan línea; las entidades se decodifican.
 */
function _htmlATextoMarcadoAudCan_(html) {
  const h = String(html || '').replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const vacios = { br: 1, img: 1, hr: 1, meta: 1, input: 1, wbr: 1, link: 1, col: 1, area: 1, base: 1 };
  const bloque = /^(div|p|br|li|tr|h[1-6]|table|ul|ol|blockquote|hr)$/;
  const pila = [];
  let out = '';
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(h)) !== null) {
    if (m[4] != null) {
      const t = _entidadesAudCan_(m[4].replace(/\s+/g, ' '));
      if (!t) continue;
      out += pila.some(function (x) { return x.tachado; }) ? '\uE000' + t + '\uE001' : t;
      continue;
    }
    const cierra = !!m[1], nombre = m[2].toLowerCase(), attrs = m[3] || '';
    if (bloque.test(nombre)) out += '\n';
    // dónde empieza una cita (Gmail, Outlook): una línea con la marca; sólo se usa en respuestas y reenvíos (_propioDeHtmlAudCan_)
    if (!cierra && (nombre === 'blockquote' || nombre === 'hr' || /class\s*=\s*["'][^"']*gmail_quote/i.test(attrs) || /divRplyFwdMsg/i.test(attrs) ||
                    /border-top\s*:\s*solid\s*#(e1e1e1|b5c4df)/i.test(attrs))) out += '\n' + AUDITORIA_CANCEL_CITA + '\n';
    if (vacios[nombre] || /\/\s*$/.test(attrs)) continue;
    if (!cierra) {
      const tach = /^(s|strike|del)$/.test(nombre) || /style\s*=\s*["'][^"']*line-through/i.test(attrs);
      pila.push({ nombre: nombre, tachado: tach });
    } else {
      for (let i = pila.length - 1; i >= 0; i--) if (pila[i].nombre === nombre) { pila.length = i; break; }
    }
  }
  return out.replace(/\uE001\uE000/g, '').split('\n').map(function (l) { return l.replace(/[ \t]+/g, ' ').trim(); }).join('\n');
}

/** Las entidades HTML a texto (15/10, noche: movida a producción, 41_AgendaColores.js). */
function _entidadesAudCan_(t) { return _entidadesHtmlAgenda_(t); }

// ===================== 3. RDV CONJUNTO =====================

function _s3ConjuntoAudCan_(C) {
  if (!C.dest) throw new Error('no se leyó la base');
  const sh = ssDestino_().getSheetByName(RDV_HOJA_ASISTENTES_SRC);
  if (!sh || sh.getLastRow() < 2) { Logger.log('--- 3. RDV CONJUNTO: vacía o no existe ---'); return; }
  const vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const hdr = vals[0];
  // las mismas columnas que lee cruzarAsistentes_ (20_UpsertDestino.js)
  const iFig = findIdxOr_(hdr, ['figura', 'persona', 'nombre'], true);
  const iBar = findIdxOr_(hdr, ['barrion', 'barrio'], true);
  const iFec = findIdxOr_(hdr, ['fecha', 'fecha (fecha)', 'fecha_evento', 'fecha reunion', 'fecha reunión', 'fecha_reunion', 'fecha_reunión', 'fecha evento'], true);
  const iDir = findIdxOr_(hdr, ['direccion', 'dirección'], true);
  const iAsi = findIdxOr_(hdr, ['asistentes', 'asistente'], true);
  if (iFig == null || iFec == null) throw new Error('RDV CONJUNTO no tiene Figura y FECHA por encabezado: ' + hdr.filter(String).join(' | '));
  const est = _columnaEstadoAudCan_(hdr, vals, [iFig, iBar, iFec, iDir, iAsi]);
  if (est.i == null) {
    Logger.log('--- 3. RDV CONJUNTO: NO SE ENCONTRÓ la columna de estado (ni por encabezado: %s; ni por contenido). Encabezados: %s ---',
               AUDITORIA_CANCEL_ENC_ESTADO.join(' / '), hdr.filter(String).join(' | '));
    throw new Error('RDV CONJUNTO sin columna de estado');
  }
  Logger.log('--- 3. RDV CONJUNTO: la columna de estado es "%s" (%s, %s) ---', hdr[est.i], _letraCol_(est.i + 1), est.como);
  const porFigFecha = new Map();
  C.dest.filas.forEach(function (f) {
    if (!f.fecha) return;
    const k = normalizeText_(f.figura) + '|' + ymd_(f.fecha);
    if (!porFigFecha.has(k)) porFigFecha.set(k, []);
    porFigFecha.get(k).push(f);
  });
  const valores = {};
  let enPer = 0, distintas = 0, sinEstado = 0;
  for (let i = 1; i < vals.length; i++) {
    const row = vals[i];
    const fec = toDate_(row[iFec]);
    if (!fec || !C.enPeriodo(fec)) continue;
    enPer++;
    const estado = str(row[est.i]), n = normalizeText_(estado);
    valores[estado || '(vacío)'] = (valores[estado || '(vacío)'] || 0) + 1;
    const nombre = str(row[iFig]), bar = iBar != null ? str(row[iBar]) : '', dir = iDir != null ? str(row[iDir]) : '';
    const m = _filasDeConjuntoAudCan_(C, nombre, fec, bar, dir, porFigFecha);
    if (!n) { sinEstado++; continue; }
    if (/^realizad/.test(n) || (/^programad/.test(n))) {
      if (/^realizad/.test(n) && m.filas.length === 1) C.conjRealizada.set(m.filas[0].fila, 'RDV CONJUNTO fila ' + (i + 1) + ' (' + estado + ')');
      continue;
    }
    distintas++;
    const dice = /reprogramad|postergad|posterga/.test(n) ? 'reprogramada' : (/suspendid|cancelad|no se realiz|baja/.test(n) ? 'cancelada' : 'otro');
    const v = m.error ? m.error : _veredictoAudCan_(C, m.filas);
    Logger.log('  [%s] RDV CONJUNTO fila %s | %s | %s | %s | %s | estado "%s"%s', v, i + 1, nombre, fmtFecha_(fec), bar || 'sin barrio', dir || 'sin dirección', estado,
               m.figura ? ' | figura: ' + m.figura + (m.por ? ' (' + m.por + ')' : '') : '');
    if (m.error) Logger.log('      %s', m.detalle);
    else _logFilasAudCan_(C, m.filas);
    if (dice === 'otro') { Logger.log('      (estado que no es cancelación ni reprogramación: sólo se lista)'); continue; }
    _hallazgoAudCan_(C, { fuente: 'RDV CONJUNTO', dice: dice, veredicto: m.error ? (m.filas.length > 1 ? 'AMBIGUA' : 'SIN FILA') : v, filas: m.filas,
                          reunion: nombre + ' ' + fmtFecha_(fec) + ' ' + (bar || ''), detalle: 'RDV CONJUNTO fila ' + (i + 1) + ': "' + estado + '"' + (m.detalle ? '; ' + m.detalle : '') });
  }
  Logger.log('  filas del período: %s | con estado distinto de Realizada / Programado: %s | sin estado: %s | valores: %s', enPer, distintas, sinEstado,
             Object.keys(valores).map(function (k) { return k + ' ' + valores[k]; }).join(' · '));
  C.cuentas['3 RDV CONJUNTO distinto de Realizada/Programado'] = distintas;
}

/**
 * La columna de estado: por encabezado (AUDITORIA_CANCEL_ENC_ESTADO); si no, por contenido: la columna (que no sea
 * figura, barrio, fecha, dirección ni asistentes) con más valores que son un estado conocido, si son al menos 3 y la
 * mitad de los no vacíos.
 */
function _columnaEstadoAudCan_(hdr, vals, excluir) {
  const i = findIdxOr_(hdr, AUDITORIA_CANCEL_ENC_ESTADO, true);
  if (i != null) return { i: i, como: 'por encabezado' };
  let mejor = null;
  for (let j = 0; j < hdr.length; j++) {
    if (excluir.indexOf(j) >= 0) continue;
    let si = 0, no = 0;
    for (let k = 1; k < vals.length; k++) {
      const t = normalizeText_(vals[k][j]);
      if (!t) continue;
      if (AUDITORIA_CANCEL_RE_ESTADO.test(t)) si++; else no++;
    }
    if (si >= 3 && si >= no && (!mejor || si > mejor.si)) mejor = { j: j, si: si, total: si + no };
  }
  return mejor ? { i: mejor.j, como: 'por contenido: ' + mejor.si + ' de ' + mejor.total + ' valores son un estado' } : { i: null };
}

/** La fila de la base de una fila de RDV CONJUNTO, como `cruzarAsistentes_`: figura por tokens + fecha; con 2+, dirección y después barrio. */
function _filasDeConjuntoAudCan_(C, nombre, fec, bar, dir, porFigFecha) {
  const fp = figuraPorTokens_(nombre);
  if (!fp.figura) {
    return { filas: [], error: 'SIN FIGURA', detalle: fp.candidatas.length ? 'el nombre nombra varias figuras (' + fp.candidatas.join(' / ') + '): no se elige'
                                                                            : 'el nombre no es ninguna figura de la base (por tokens)' };
  }
  const lista = porFigFecha.get(normalizeText_(fp.figura) + '|' + ymd_(fec)) || [];
  if (lista.length <= 1) return { filas: lista, figura: fp.figura };
  const iDirD = findIdxOr_(C.dest.hdr, ['direccion', 'dirección'], true);
  if (dir && iDirD != null) {
    const ex = lista.filter(function (x) { return compararDirecciones_(dir, x.valores[iDirD]) === 'exacta'; });
    const pd = ex.length ? ex : lista.filter(function (x) { return compararDirecciones_(dir, x.valores[iDirD]) === 'parecida'; });
    if (pd.length === 1) return { filas: pd, figura: fp.figura, por: 'dirección ' + (ex.length ? 'exacta' : 'parecida') };
  }
  const ub = lista.filter(function (x) {
    if (usarUbicacion3_()) return compararUbicacion_(ubicacionDeTexto_(bar), ubicacionDeFila_(x)).coincide === true;
    return bar && x.barrio && normalizeText_(_canonBarrioAg_(bar) || bar) === normalizeText_(_canonBarrioAg_(x.barrio) || x.barrio);
  });
  if (ub.length === 1) return { filas: ub, figura: fp.figura, por: 'barrio' };
  return { filas: lista, figura: fp.figura, error: 'AMBIGUA', detalle: 'la figura tiene ' + lista.length + ' filas ese día y ni la dirección ni el barrio desempatan (filas ' +
           lista.map(function (x) { return x.fila + ' ' + (x.barrio || 'sin barrio'); }).join(', ') + ')' };
}

// ===================== 4. "Agenda Directa" (archivo "Agenda") =====================

function _s4DirectaAudCan_(C) {
  const ss = SpreadsheetApp.openById(AGENDA_COPIA_SS);
  const sh = ss.getSheetByName(AUDITORIA_CANCEL_SOLAPA_DIRECTA);
  if (!sh) {
    let hay = '';
    try { hay = ss.getSheets().map(function (s) { return s.getName(); }).join(' | '); } catch (e) { hay = '?'; }
    Logger.log('--- 4. "%s": NO EXISTE en el archivo "Agenda" (solapas: %s) ---', AUDITORIA_CANCEL_SOLAPA_DIRECTA, hay);
    C.cuentas['4 Agenda Directa'] = 'no existe';
    return;
  }
  const last = sh.getLastRow(), cols = sh.getLastColumn();
  if (last < 3 || cols < 2) { Logger.log('--- 4. "%s": vacía ---', AUDITORIA_CANCEL_SOLAPA_DIRECTA); return; }
  const v = sh.getRange(1, 1, last, cols).getValues();
  // las celdas combinadas de las primeras filas (una LECTURA): el grupo vale sólo dentro de su rango combinado
  let combinadas = null;
  try {
    combinadas = sh.getRange(1, 1, Math.min(7, last), cols).getMergedRanges().map(function (r) {
      return { fila: r.getRow(), col: r.getColumn(), nf: r.getNumRows(), nc: r.getNumColumns() };
    });
  } catch (e) { combinadas = null; }
  const enc = _encabezadoDirectaAudCan_(v, combinadas);
  if (!enc.ok) {
    Logger.log('--- 4. "%s": los encabezados NO coinciden (%s). Primeras filas: %s ---', AUDITORIA_CANCEL_SOLAPA_DIRECTA, enc.motivo,
               v.slice(0, 3).map(function (r) { return r.map(str).join(' | '); }).join(' // '));
    C.cuentas['4 Agenda Directa'] = 'encabezados distintos';
    return;
  }
  Logger.log('--- 4. "%s": encabezado en las filas %s y %s | Info: %s | CANCELACIÓN: %s | el grupo, %s ---', AUDITORIA_CANCEL_SOLAPA_DIRECTA, enc.fila + 1, enc.fila + 2,
             _letraCol_(enc.iInfo + 1), enc.cancel.map(function (c) { return _letraCol_(c.i + 1) + ' "' + c.sub + '"'; }).join(', '), enc.como);
  let dia = null, reuniones = 0, marcadas = 0, sinDia = 0;
  for (let i = enc.fila + 2; i < v.length; i++) {
    const r = v[i];
    const d = _diaDeFilaAudCan_(r, enc.iInfo, C.hoy);
    if (d) { dia = d; continue; }
    const info = str(r[enc.iInfo]);
    const marcas = enc.cancel.filter(function (c) { return _marcadoAudCan_(r[c.i]); }).map(function (c) { return c.sub; });
    if (!info) {
      if (marcas.length) Logger.log('  [SIN INFO] renglón %s: CANCELACIÓN marcada (%s) pero la celda Info está vacía', i + 1, marcas.join(', '));
      continue;
    }
    reuniones++;
    if (!marcas.length) continue;
    if (!dia) {
      sinDia++;
      Logger.log('  [SIN DÍA RECONOCIDO] renglón %s | %s | CANCELACIÓN: %s (no hay un renglón de día arriba: no se cruza)', i + 1, info.replace(/\s+/g, ' '), marcas.join(', '));
      continue;
    }
    if (!C.enPeriodo(dia)) continue;
    marcadas++;
    const ev = _infoAEventoAudCan_(info, dia, C.hoy);
    const filas = _filasDeEventoAudCan_(C, ev, dia);
    const vv = _veredictoAudCan_(C, filas);
    Logger.log('  [%s] renglón %s | %s | %s | CANCELACIÓN: %s%s', vv, i + 1, fmtFecha_(dia) + ' ' + (ev.hora || ''), info.replace(/\s+/g, ' '),
               marcas.join(', '), enc.iImpl != null && str(r[enc.iImpl]) ? ' | Implementador: ' + str(r[enc.iImpl]) : '');
    _logFilasAudCan_(C, filas);
    _hallazgoAudCan_(C, { fuente: 'Agenda Directa', dice: 'cancelada', veredicto: vv, filas: filas, reunion: _evTextoAudCan_(ev),
                          detalle: 'renglón ' + (i + 1) + ', CANCELACIÓN: ' + marcas.join(', ') });
  }
  Logger.log('  reuniones en la solapa: %s | con CANCELACIÓN marcada en el período: %s | marcadas sin día reconocido: %s', reuniones, marcadas, sinDia);
  C.cuentas['4 Agenda Directa con CANCELACIÓN'] = marcadas;
  if (sinDia) C.cuentas['4 Agenda Directa sin día reconocido'] = sinDia;
}

/**
 * El encabezado de dos filas de "Agenda Directa": la fila con un grupo "CANCELACIÓN" (en las primeras 6) y la de abajo
 * con las sub-columnas. El grupo de una celda combinada vale SÓLO dentro de su rango combinado (`combinadas`, leídas de la
 * hoja). Si no se pudieron leer, se arrastra a la derecha sólo mientras la sub-columna sea una conocida
 * (AUDITORIA_CANCEL_SUBCOLUMNAS: Hecho, Ok Sol, Programado, IVR) y se corta en la primera que no lo es ("Comentarios").
 * Info e Implementador: en cualquiera de las dos filas.
 */
function _encabezadoDirectaAudCan_(v, combinadas) {
  for (let f = 0; f < Math.min(6, v.length - 1); f++) {
    const g = v[f].map(str), s = v[f + 1].map(str);
    if (!g.some(function (x) { return /^cancelacion/.test(normalizeText_(x)); })) continue;
    const grupo = g.slice();
    const delaFila = (combinadas || []).filter(function (m) { return m.fila === f + 1 && m.nc > 1; });
    let como;
    if (delaFila.length) {
      como = 'por las celdas combinadas';
      delaFila.forEach(function (m) {
        for (let j = m.col; j < m.col - 1 + m.nc && j < g.length; j++) if (!g[j]) grupo[j] = g[m.col - 1];
      });
    } else {
      como = combinadas ? 'sin celdas combinadas en esa fila: arrastrado sólo sobre las sub-columnas conocidas'
                        : 'no se pudieron leer las celdas combinadas: arrastrado sólo sobre las sub-columnas conocidas';
      let actual = '';
      for (let j = 0; j < g.length; j++) {
        if (g[j]) { actual = g[j]; continue; }
        if (actual && AUDITORIA_CANCEL_SUBCOLUMNAS.indexOf(normalizeText_(s[j])) >= 0) grupo[j] = actual;
        else actual = '';
      }
    }
    const busca = function (re) {
      for (let j = 0; j < g.length; j++) if (re.test(normalizeText_(g[j])) || re.test(normalizeText_(s[j]))) return j;
      return null;
    };
    const iInfo = busca(/^info/), iImpl = busca(/^implementador/);
    const cancel = [];
    for (let j = 0; j < g.length; j++) if (/^cancelacion/.test(normalizeText_(grupo[j])) && s[j]) cancel.push({ i: j, sub: s[j] });
    if (iInfo == null) return { ok: false, motivo: 'no hay columna "Info"' };
    if (!cancel.length) return { ok: false, motivo: 'el grupo CANCELACIÓN no tiene sub-columnas en la fila de abajo' };
    return { ok: true, fila: f, iInfo: iInfo, iImpl: iImpl, cancel: cancel, como: como };
  }
  return { ok: false, motivo: 'no hay un grupo "CANCELACIÓN" en las primeras 6 filas' };
}

const AUDITORIA_CANCEL_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * ¿Es un renglón de día? Sólo mira la PRIMERA celda y la de Info (no cualquier celda): "martes 13/10", "martes 13 de
 * octubre" (también "setiembre"), o una fecha sola. Devuelve la fecha o null.
 */
function _diaDeFilaAudCan_(r, iInfo, hoy) {
  const celdas = [r[0], r[iInfo]];
  for (let j = 0; j < celdas.length; j++) {
    const x = celdas[j];
    if (x instanceof Date) {
      const otras = r.filter(function (y, k) { return k !== 0 && k !== iInfo && !esVacio_(y) && y !== false; });
      if (!otras.length) return toDate_(x);
      continue;
    }
    const t = normalizeText_(x).replace(/setiembre/, 'septiembre');
    let m = /^(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s*,?\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/.exec(t);
    if (m) return _fechaDiaMes_(m[2] + '/' + m[3], hoy);
    m = /^(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s*,?\s*(\d{1,2})\s+de\s+([a-z]+)\b/.exec(t);
    if (m && AUDITORIA_CANCEL_MESES.indexOf(m[3]) >= 0) return _fechaDiaMes_(m[2] + '/' + (AUDITORIA_CANCEL_MESES.indexOf(m[3]) + 1), hoy);
  }
  return null;
}

/** ¿La casilla está marcada? Una casilla en true, o una marca explícita (TRUE, sí, x, ✓). Cualquier otro texto no. */
function _marcadoAudCan_(x) {
  if (x === true) return true;
  if (x === false || x == null) return false;
  return AUDITORIA_CANCEL_MARCA.test(normalizeText_(x));
}

/** La celda Info ("Evento: …\nHora: …\nLugar: …"; sin "Evento:", la primera línea es el evento) → una reunión, con el parser de la agenda. */
function _infoAEventoAudCan_(info, dia, hoy) {
  let t = String(info || '').replace(/\r/g, '');
  if (!/^\s*\W*\s*evento\s*:/im.test(t)) t = 'Evento: ' + t;
  const evs = _parsearCuerpoAgenda_(t, hoy, _rVacio_(), { grupo: AUDITORIA_CANCEL_SOLAPA_DIRECTA, semana: '', version: 0, versiones: 0 });
  const ev = evs[0] || { figuras: [], tipo: '', lugar: '', hora: '', eventoTexto: info, lugarTexto: '' };
  ev.fecha = dia;
  return ev;
}

// ===================== 5. Filas vencidas =====================

function _s5VencidasAudCan_(C) {
  if (!C.dest) throw new Error('no se leyó la base');
  const limite = new Date(C.hoy.getFullYear(), C.hoy.getMonth(), C.hoy.getDate() - AUDITORIA_CANCEL_DIAS_VENCIDA, 12, 0, 0);
  const filas = C.dest.filas.filter(function (f) {
    return f.fecha && C.enPeriodo(f.fecha) && ymd_(f.fecha) < ymd_(limite) && normStatus_(_statusAudCan_(C, f)) === 'en agenda' &&
           numOcero_(_asisAudCan_(C, f)) === 0;
  });
  Logger.log('--- 5. FILAS VENCIDAS: "en agenda", FECHA antes del %s y sin Asistentes (probablemente no se hicieron): %s ---', fmtFecha_(limite), filas.length);
  filas.forEach(function (f) {
    const otras = C.hallazgos.filter(function (h) { return h.fila && h.fila.fila === f.fila; }).map(function (h) { return h.fuente + ' dice ' + h.dice; });
    const dup = C.dup.porFila.get(idFilaAgenda_(f));
    Logger.log('  VENCIDA | %s%s%s', _filaTextoAudCan_(C, f), otras.length ? ' | además: ' + otras.join('; ') : '',
               dup ? ' | AGENDA_DUPLICADOS línea ' + dup.linea + ': ELEGIR "' + (dup.elegir || '(vacío)') + '"' : '');
    C.vencidas.push({ fila: f.fila, figura: f.figura, fecha: fmtFecha_(f.fecha), barrio: f.barrio, otras: otras });
  });
  C.cuentas['5 vencidas'] = filas.length;
}

// ===================== El resumen =====================

/**
 * Por fila de la base (o por reunión, si no tiene fila): todo lo que dicen las fuentes. CONTRADICTORIA si una fuente dice
 * "no se hizo" y la base dice Realizada (o tiene Asistentes), o RDV CONJUNTO dice Realizada para esa fila. Si no, NO LO
 * REFLEJA si alguna fuente queda sin reflejar; si no, YA LO REFLEJA.
 */
function _resumenAudCan_(C) {
  const grupos = new Map();
  C.hallazgos.forEach(function (h) {
    const k = h.fila ? 'fila ' + h.fila.fila : (h.veredicto + ' | ' + h.reunion);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(h);
  });
  const R = { yaRefleja: [], noRefleja: [], contradictorias: [], dudosas: [], ambiguas: [], sinFila: [], cambios: [] };
  grupos.forEach(function (hs, k) {
    const h0 = hs[0];
    const fuentes = hs.map(function (h) { return h.fuente + ' (' + h.dice + (h.detalle ? ': ' + h.detalle : '') + ')'; }).join(' + ');
    const base = h0.fila ? _filaTextoAudCan_(C, h0.fila) : h0.reunion;
    const vs = hs.map(function (h) { return h.veredicto; });
    const conjReal = h0.fila ? C.conjRealizada.get(h0.fila.fila) : null;
    const linea = base + ' | fuentes: ' + fuentes + (conjReal ? ' | ' + conjReal : '');
    if (vs.indexOf('CONTRADICTORIA') >= 0 || (conjReal && hs.some(function (h) { return h.fuente !== 'RDV CONJUNTO'; }))) R.contradictorias.push(linea);
    else if (vs.indexOf('NO REFLEJADA') >= 0 || vs.indexOf('OTRO ESTADO') >= 0) R.noRefleja.push(linea);
    else if (vs.indexOf('DUDOSA') >= 0) R.dudosas.push(linea);
    else if (vs.indexOf('REFLEJADA') >= 0) R.yaRefleja.push(linea);
    else if (vs.indexOf('AMBIGUA') >= 0) R.ambiguas.push(linea);
    else R.sinFila.push(linea);
  });
  Logger.log('=== RESUMEN de la auditoría de cancelaciones (%s al %s) ===', fmtFecha_(C.desde), fmtFecha_(C.hasta));
  const bloque = function (titulo, l) {
    Logger.log('  %s: %s', titulo, l.length);
    l.forEach(function (t) { Logger.log('    %s', t); });
  };
  bloque('la base YA LO REFLEJA (Suspendida / Reprogramada, o la reunión se movió y la base la tiene en la fecha nueva)', R.yaRefleja);
  bloque('la base NO LO REFLEJA (sigue "en agenda" o vacía, sin Asistentes)', R.noRefleja);
  bloque('CONTRADICTORIAS (una fuente dice que no se hizo y la base o RDV CONJUNTO dicen Realizada / tienen Asistentes)', R.contradictorias);
  bloque('DUDOSAS (se movió de fecha, pero la fila de la fecha nueva no es clara: revisar a mano)', R.dudosas);
  bloque('AMBIGUAS (más de una fila posible en la base: no se elige)', R.ambiguas);
  bloque('SIN FILA en la base (nada que reflejar, o la reunión no está cargada)', R.sinFila);
  C.cambios.forEach(function (x) { R.cambios.push(x.tipo + ' | ' + x.reunion + (x.filas.length ? ' | filas ' + x.filas.join(', ') : ' | sin fila')); });
  bloque('aparte, POSIBLES CAMBIOS (no son cancelaciones: "se pasa" solo, o tachado sólo de la hora o el lugar)', R.cambios);
  Logger.log('  filas vencidas ("en agenda", sin Asistentes, hace más de %s días): %s', AUDITORIA_CANCEL_DIAS_VENCIDA, C.vencidas.length);
  Logger.log('  tachado en el HTML: %s mails, %s reuniones tachadas enteras, %s cambios tachados (el parser lo PIERDE: lee getPlainBody)',
             C.tachado.mails, C.tachado.reuniones.length, C.tachado.cambios.length);
  Logger.log('  cuentas: %s', Object.keys(C.cuentas).map(function (k) { return k + ' = ' + C.cuentas[k]; }).join(' | '));
  if (C.errores.length) {
    Logger.log('  SECCIONES QUE FALLARON: %s', C.errores.length);
    C.errores.forEach(function (e) { Logger.log('    %s', e); });
  }
  return R;
}
