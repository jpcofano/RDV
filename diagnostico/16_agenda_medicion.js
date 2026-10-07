/**
 * diagnostico/16_agenda_medicion.js — AGENDA, ETAPA 1: medir antes de construir (06/10). SÓLO LECTURA.
 *
 * Prompt: docs/prompts/PROMPT-05-AGENDA-ETAPA1-MEDICION.md. Resultados y predicciones: docs/ESTADO.md, 0.x.
 *
 * **Nada de este archivo escribe en el destino.** Lee el destino, `Comunas` y RDV CONJUNTO (archivo 1), y los
 * mails (desde `DIAG_MAILS` de la intermedia, o desde Gmail); escribe sólo solapas de diagnóstico en la
 * intermedia: AGENDA_MAIL, AGENDA_MAIL_DESAPARECIDAS, AGENDA_CRUCE, AGENDA_DESTINO_SIN_MAIL,
 * AGENDA_BARRIO_DIRECCION, AGENDA_SEGURIDAD y la cache de geocodificación AGENDA_GEOCODE.
 *
 *   paso 29 — parsearAgendaMails():        el parser nuevo. Una fila por reunión de la ÚLTIMA versión de cada
 *                                           semana + grupo, y aparte las que desaparecen en la última versión.
 *   paso 30 — cruzarAgendaConDestino():    las reuniones del mail contra el destino (ventana de análisis), las
 *                                           filas del destino sin reunión en el mail, y la columna "No participa".
 *   paso 31 — medirBarrioDesdeDireccion(): Maps.newGeocoder() → lat/lng → barrio por punto en polígono
 *                                           (límites oficiales, diagnostico/17_barrios_caba_geo.js), contra el
 *                                           barrio que cargó el equipo. Con cache: una dirección se geocodifica
 *                                           una sola vez entre corridas.
 *   paso 32 — seguridadContraConjunto():   las reuniones del mail sin figura ("Seguridad en tu Barrio") contra
 *                                           RDV CONJUNTO por fecha + barrio (o comuna).
 *
 * --- El formato del mail (del análisis de DIAG_MAILS: 376 mails, 09/2025–10/2026) ---
 * Asunto "Agenda Encuentros de vecinos con {GRUPO} - Semana del DD/MM al DD/MM". Mails separados: por semana y
 * grupo llegan de 1 a 10 versiones ("Actualizo:"). **Vale la última** (la de fecha de mail más nueva). Cuerpo:
 *
 *     *Martes 29/09*
 *     Evento: <tipo> <figura(s)> [(NO PARTICIPA)], <comuna | eje | barrio> [(marcas)]
 *     Hora: 18:30h
 *     Lugar: <calle número, nombre del lugar> | A CONFIRMAR (NO SE COMUNICA LA DIRECCIÓN)
 *
 * --- Reglas de negocio que este archivo MIDE (no implementa todavía) ---
 *   1. Cada reunión de la última versión es una fila del destino.
 *   2. "NO PARTICIPA": la reunión SE HACE y tiene fila a nombre de esa figura (el legado las descartaba).
 *   3. Reunión conjunta: UNA fila, a nombre de la primera figura nombrada.
 *   4. "Seguridad en tu Barrio" viene sin figura: sale de RDV CONJUNTO por fecha + barrio.
 *   5. El barrio sale de la dirección.  6. Una reunión que desaparece se avisa, no se borra.
 *   7. Hora y dirección se actualizan mientras la fila está "en agenda".
 *
 * Usa del proyecto: normalizeText_, figuras y barrios de 02_Parsing.js (la columna Figura del destino,
 * FIGURAS_VARIANTES, los apellidos únicos, Comunas), leerDestino_ / ssDestino_ / ssIntermedia_ / escribirHoja_
 * (20_UpsertDestino.js), y los helpers del asunto de diagnostico/03_muestras_mail.js.
 */

// ===================== Configuración =====================

/** De dónde salen los mails: 'DIAG_MAILS' (la solapa de la intermedia, cuerpo truncado a 8000) o 'GMAIL'. */
const AGENDA_FUENTE_MAILS = 'DIAG_MAILS';

/** Solapas de salida, todas en la intermedia. */
const AGENDA_SOLAPA_MAIL = 'AGENDA_MAIL';
const AGENDA_SOLAPA_DESAPARECIDAS = 'AGENDA_MAIL_DESAPARECIDAS';
const AGENDA_SOLAPA_CRUCE = 'AGENDA_CRUCE';
const AGENDA_SOLAPA_SIN_MAIL = 'AGENDA_DESTINO_SIN_MAIL';
const AGENDA_SOLAPA_BARRIO = 'AGENDA_BARRIO_DIRECCION';
const AGENDA_SOLAPA_SEGURIDAD = 'AGENDA_SEGURIDAD';

/** Una reunión del mail sin fila a la fecha exacta busca la fila de su figura hasta ± estos días. */
const AGENDA_DIAS_REPROGRAMADA = 3;

// ===================== PASO 29 — el parser =====================

/**
 * El parser nuevo, sobre los mails de `AGENDA_FUENTE_MAILS`. Escribe AGENDA_MAIL (una fila por reunión de la
 * última versión de cada semana + grupo) y AGENDA_MAIL_DESAPARECIDAS. Sólo lectura sobre todo lo demás.
 */
function parsearAgendaMails() {
  const t0 = Date.now();
  Logger.log('=== parsearAgendaMails (paso 29) — sólo lectura: escribe %s y %s en la intermedia ===',
             AGENDA_SOLAPA_MAIL, AGENDA_SOLAPA_DESAPARECIDAS);
  leerDestino_();   // carga las figuras del destino (la lista con la que se reconocen los nombres)
  const r = agendaDesdeMails_();
  _logParser_(r);
  _escribirMedicionAgenda_(AGENDA_SOLAPA_MAIL, _filasAgendaMail_(r));
  _escribirMedicionAgenda_(AGENDA_SOLAPA_DESAPARECIDAS, _filasDesaparecidas_(r));
  Logger.log('%s ms', Date.now() - t0);
  return { reuniones: r.ultimas.length, unicas: r.unicas.length, desaparecidas: r.desaparecidas.length,
           semanas: r.semanas.length };
}

/**
 * Todo el parseo, en memoria: lee los mails, arma las versiones por semana + grupo, parsea cada una y compara
 * la última con las anteriores. No escribe nada. Lo usan los pasos 29, 30, 31 y 32.
 */
function agendaDesdeMails_() {
  const mails = _leerMailsAgenda_();
  return agendaDesdeListaDeMails_(mails.lista, mails);
}

/** Los mails, de DIAG_MAILS o de Gmail, como `{ fecha, asunto, cuerpo, truncado }`. */
function _leerMailsAgenda_() {
  if (AGENDA_FUENTE_MAILS === 'GMAIL') {
    const lista = [];
    _buscarHilos_diag3().forEach(function (h) {
      h.getMessages().forEach(function (msg) {
        lista.push({ fecha: msg.getDate(), asunto: msg.getSubject() || '', cuerpo: String(msg.getPlainBody() || ''), truncado: false });
      });
    });
    return { fuente: 'Gmail (' + DIAG3_QUERY + ')', lista: lista };
  }
  const sh = intermediaAgenda_().getSheetByName(DIAG3_SALIDA);
  if (!sh || sh.getLastRow() < 2) {
    // 07/10: DIAG_MAILS se borra con la limpieza de la intermedia (paso 39): las mediciones leen Gmail, 7 meses.
    const h = hoyMediodia_();
    Logger.log('  (no hay "%s" en la intermedia: los mails salen de Gmail, por etiqueta o asunto, desde hace 7 meses)', DIAG3_SALIDA);
    return leerMailsAgendaGmail_(new Date(h.getFullYear(), h.getMonth() - 7, h.getDate(), 12, 0, 0));
  }
  const vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const hdr = vals[0];
  const iF = findIdxOr_(hdr, ['fecha']), iA = findIdxOr_(hdr, ['asunto']), iC = findIdxOr_(hdr, ['cuerpo']);
  const iT = findIdxOr_(hdr, ['truncado'], true);
  const lista = [];
  for (let i = 1; i < vals.length; i++) {
    const v = vals[i];
    if (esVacio_(v[iA]) && esVacio_(v[iC])) continue;
    let f = v[iF];
    if (!(f instanceof Date)) {
      const m = /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(str(f));
      f = m ? new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0) : null;
    }
    if (!f) continue;
    lista.push({ fecha: f, asunto: str(v[iA]), cuerpo: String(v[iC] || ''),
                 truncado: iT != null && String(v[iT]).toUpperCase() === 'TRUE' });
  }
  return { fuente: '"' + DIAG3_SALIDA + '" (intermedia)', lista: lista };
}

function _logParser_(r) {
  Logger.log('  fuente: %s | mails: %s | truncados a %s caracteres: %s%s', r.fuente, r.mails, DIAG3_MAX_CUERPO, r.truncados,
             r.truncados ? '  <<< un cuerpo truncado puede haber perdido reuniones del final: correr con AGENDA_FUENTE_MAILS = "GMAIL" para confirmar' : '');
  Logger.log('  mail más nuevo: %s%s', r.masNuevo ? Utilities.formatDate(r.masNuevo, RDV_TZ, 'dd/MM/yyyy HH:mm') : '—',
             r.masNuevo && (Date.now() - r.masNuevo) > 8 * 86400000 ? '  <<< DIAG_MAILS tiene más de una semana: rehacer_diagMuestrasMail()' : '');
  Logger.log('  mails sin semana reconocible (ni en el asunto ni en un "Asunto:" reenviado; no se usan): %s', r.sinSemana.length);
  r.sinSemana.slice(0, 20).forEach(function (a) { Logger.log('    %s', a); });
  const versiones = {};
  r.semanas.forEach(function (g) { versiones[g.versiones.length] = (versiones[g.versiones.length] || 0) + 1; });
  Logger.log('  semanas + grupo: %s | versiones por semana: %s', r.semanas.length,
             Object.keys(versiones).sort(function (a, b) { return a - b; }).map(function (k) { return k + ' → ' + versiones[k]; }).join(' · '));
  Logger.log('  reuniones de las últimas versiones: %s | únicas (la misma reunión en los mails de dos grupos cuenta una): %s',
             r.ultimas.length, r.unicas.length);
  const cuenta = function (lista, fn) {
    const c = {};
    lista.forEach(function (x) { const k = fn(x); c[k] = (c[k] || 0) + 1; });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).map(function (k) { return k + ' ' + c[k]; }).join(' · ');
  };
  Logger.log('  tipo: %s', cuenta(r.unicas, function (x) { return x.tipo || '(sin tipo)'; }));
  Logger.log('  lugar del evento: %s', cuenta(r.unicas, function (x) { return x.lugarTipo || '(ninguno)'; }));
  Logger.log('  figuras nombradas: %s', cuenta(r.unicas, function (x) { return x.figuras.length + (x.figuras.length === 1 ? ' figura' : ' figuras'); }));
  Logger.log('  con "NO PARTICIPA": %s | conjuntas (2+ figuras): %s | sin hora: %s | sin fecha: %s',
             r.unicas.filter(function (x) { return x.noParticipa.length; }).length,
             r.unicas.filter(function (x) { return x.conjunta; }).length,
             r.unicas.filter(function (x) { return !x.hora; }).length, r.sinFecha);
  Logger.log('  dirección: con calle y número %s | A CONFIRMAR %s | sólo nombre del lugar %s | vacía %s',
             r.unicas.filter(function (x) { return x.direccion; }).length,
             r.unicas.filter(function (x) { return x.direccionAConfirmar; }).length,
             r.unicas.filter(function (x) { return !x.direccion && !x.direccionAConfirmar && x.nombreLugar; }).length,
             r.unicas.filter(function (x) { return !x.direccion && !x.direccionAConfirmar && !x.nombreLugar; }).length);
  Logger.log('  marcas: %s', cuenta(r.unicas.filter(function (x) { return x.marcas.length; }), function (x) { return x.marcas.join(' + '); }) || 'ninguna');
  Logger.log('  cambios contra la versión anterior (en las últimas versiones): %s',
             cuenta(r.ultimas.filter(function (x) { return x.cambios; }), function (x) {
               return x.cambios === 'nueva en la última versión' ? 'nueva' : x.cambios.split('; ').map(function (c) { return c.split(' ')[0]; }).join('+');
             }) || 'ninguno');
  Logger.log('  desaparecen en la última versión de su semana: %s (posible cancelación o reprogramación; se avisa, no se borra)',
             r.desaparecidas.length);
  r.desaparecidas.slice(0, 15).forEach(function (x) {
    Logger.log('    %s | %s %s | %s | %s | vista hasta la versión %s de %s%s', x.grupo, fmtFecha_(x.fecha), x.hora,
               x.figuraFila || '(sin figura) ' + x.tipo, x.lugar, x.ultimaVersionVista, x.versiones,
               x.ahora ? ' | en la última, la figura está el ' + x.ahora : '');
  });
  if (r.parciales.length) {
    Logger.log('  >>> %s semanas cuya última versión tiene menos del %s%% de la anterior: puede ser un "Actualizo:" PARCIAL ' +
               '(sólo los cambios), y entonces sus "desaparecidas" NO son cancelaciones. Mirar antes de leer el número de arriba:',
               r.parciales.length, Math.round(AGENDA_FRACCION_VERSION_PARCIAL * 100));
    r.parciales.slice(0, 10).forEach(function (p) { Logger.log('    %s, semana del %s: reuniones por versión %s', p.g.grupo, p.g.semanaTexto, p.cantidades.join(' → ')); });
  }
  Logger.log('  asuntos con otra forma de semana (entran igual): %s', r.semanaOtraForma.length);
  r.semanaOtraForma.slice(0, 15).forEach(function (x) { Logger.log('    %s', x); });
  Logger.log('  líneas "[image:" ignoradas: %s', r.imagenes);
  Logger.log('  "Re:" con cita cortada: %s | reenvíos: %s | respuestas sin agenda propia (no son versión): %s',
             r.citasCortadas || 0, r.reenvios || 0, (r.respuestasSinAgenda || []).length);
  Logger.log('  FECHAS CORREGIDAS (el día del encabezado caía fuera de la semana del asunto; mismo día de la semana y mismo ' +
             'número, dentro de la semana): %s (en las últimas versiones: %s)', r.fechasCorregidas.length,
             r.ultimas.filter(function (x) { return x.fechaCorregida; }).length);
  r.fechasCorregidas.filter(function (x) { return r.ultimas.indexOf(x) >= 0; }).slice(0, 30).forEach(function (x) {
    Logger.log('    %s | %s | %s', x.grupo, x.figuraFila || x.tipo, x.fechaCorregida);
  });
  Logger.log('  fuera de la semana de su propio asunto, SIN corrección posible: %s (restricción interna del mail)',
             r.fueraDeSemana.length);
  r.fueraDeSemana.slice(0, 10).forEach(function (x) { Logger.log('    %s | semana %s | %s | %s', x.asunto, x.semana, x.diaTexto, x.eventoTexto); });
  const sinFig = r.unicas.filter(function (x) { return !x.figuras.length; });
  Logger.log('  sin ninguna figura reconocida: %s — por tipo: %s', sinFig.length, cuenta(sinFig, function (x) { return x.tipo || '(sin tipo)'; }));
  sinFig.filter(function (x) { return x.tipo !== 'Seguridad en tu Barrio'; }).slice(0, 15).forEach(function (x) {
    Logger.log('    (¿grafía?) %s | %s', fmtFecha_(x.fecha), x.eventoTexto);
  });
  if (_agendaTolerancia_.length) {
    const tol = {};
    _agendaTolerancia_.forEach(function (x) { tol[x] = (tol[x] || 0) + 1; });
    Logger.log('  figuras reconocidas por TOLERANCIA de tipeo (sólo el parser de la agenda; mirar que estén bien):');
    Object.keys(tol).sort(function (a, b) { return tol[b] - tol[a]; }).slice(0, 20)
      .forEach(function (k) { Logger.log('    %s × %s', tol[k], k); });
  }
  const sinTipo = r.unicas.filter(function (x) { return !x.tipo; });
  if (sinTipo.length) {
    Logger.log('  sin tipo reconocido: %s', sinTipo.length);
    sinTipo.slice(0, 10).forEach(function (x) { Logger.log('    %s', x.eventoTexto); });
  }
  const sinLugar = r.unicas.filter(function (x) { return !x.lugarTipo; });
  if (sinLugar.length) {
    Logger.log('  sin comuna, eje ni barrio en el evento: %s', sinLugar.length);
    sinLugar.slice(0, 10).forEach(function (x) { Logger.log('    %s', x.eventoTexto); });
  }
  const raras = Object.keys(r.lineasRaras);
  if (raras.length) {
    Logger.log('  líneas "Algo:" no reconocidas dentro de la agenda, por forma (NO son reuniones perdidas por sí solas):');
    raras.sort(function (a, b) { return r.lineasRaras[b] - r.lineasRaras[a]; }).slice(0, 10)
      .forEach(function (k) { Logger.log('    %s × "%s"', r.lineasRaras[k], k); });
  }
}

function _filasAgendaMail_(r) {
  const out = [['grupo', 'semana', 'version', 'de_versiones', 'fecha_mail', 'fecha', 'dia_semana', 'hora', 'tipo',
                'figura_fila', 'participan', 'no_participa', 'conjunta', 'lugar_tipo', 'lugar', 'comuna', 'barrio', 'eje',
                'direccion', 'nombre_lugar', 'direccion_a_confirmar', 'marcas', 'cambios_vs_anterior',
                'repetida_en_mail_de', 'fuera_de_semana', 'fecha_corregida', 'evento_texto', 'lugar_texto', 'clave']];
  r.ultimas.forEach(function (x) {
    out.push([x.grupo, x.semana, x.version, x.versiones, Utilities.formatDate(x.mailFecha, RDV_TZ, 'yyyy-MM-dd HH:mm'),
              x.fecha ? fmtFecha_(x.fecha) : '', x.fecha ? _diaSemanaAgenda_(x.fecha) : '', x.hora, x.tipo, x.figuraFila,
              x.participan.join(' / '), x.noParticipa.join(' / '), x.conjunta ? 'sí' : '', x.lugarTipo, x.lugar,
              x.comuna == null ? '' : x.comuna, x.barrio, x.eje, x.direccion, x.nombreLugar, x.direccionAConfirmar ? 'sí' : '',
              x.marcas.join(' + '), x.cambios || '', x.repetidaDe || (x.otrosGrupos && x.otrosGrupos.length ? 'también en: ' + x.otrosGrupos.join(', ') : ''),
              x.fueraDeSemana ? 'sí' : '', x.fechaCorregida || '', x.eventoTexto, x.lugarTexto, x.clave]);
  });
  return out;
}

function _filasDesaparecidas_(r) {
  const out = [['grupo', 'semana', 'vista_hasta_version', 'de_versiones', 'fecha', 'hora', 'tipo', 'figura_fila', 'lugar',
                'direccion', 'la_figura_en_la_ultima', 'evento_texto']];
  r.desaparecidas.forEach(function (x) {
    out.push([x.grupo, x.semana, x.ultimaVersionVista, x.versiones, fmtFecha_(x.fecha), x.hora, x.tipo, x.figuraFila,
              x.lugar, x.direccion, x.ahora, x.eventoTexto]);
  });
  if (out.length === 1) out.push(['(ninguna)', '', '', '', '', '', '', '', '', '', '', '']);
  return out;
}

// ===================== PASO 30 — el cruce contra el destino =====================

/**
 * Las reuniones del mail (únicas, de la ventana de análisis y ya pasadas) contra las filas del destino, y al
 * revés. Además la columna "No participa" (punto 5) y las reglas 2 y 3. Escribe AGENDA_CRUCE y
 * AGENDA_DESTINO_SIN_MAIL en la intermedia. No toca el destino.
 */
function cruzarAgendaConDestino() {
  const t0 = Date.now();
  Logger.log('=== cruzarAgendaConDestino (paso 30) — sólo lectura: escribe %s y %s en la intermedia ===',
             AGENDA_SOLAPA_CRUCE, AGENDA_SOLAPA_SIN_MAIL);
  Logger.log('  solapa destino: %s', descripcionHojaDestino_());
  const dest = leerDestino_();
  const r = agendaDesdeMails_();
  const c = agendaCruce_(dest, r);
  _logCruce_(c, r);
  _escribirMedicionAgenda_(AGENDA_SOLAPA_CRUCE, c.filasCruce);
  _escribirMedicionAgenda_(AGENDA_SOLAPA_SIN_MAIL, c.filasSinMail);
  Logger.log('%s ms', Date.now() - t0);
  return c.resumen;
}

/** El cruce, en memoria. Ventana: [inicio de la ventana de análisis, hoy]. */
function agendaCruce_(dest, r) {
  const ini = inicioVentanaAnalisis_(), hoy = hoyMediodia_();
  const iSt = dest.D['STATUS REUNIÓN'];
  const enRango = function (f) { return f && f >= ini && f <= hoy; };
  const porFigFecha = new Map(), porFecha = new Map();
  dest.filas.forEach(function (f) {
    if (!f.fecha) return;
    const k = normalizeText_(f.figura) + '|' + ymd_(f.fecha);
    if (!porFigFecha.has(k)) porFigFecha.set(k, []);
    porFigFecha.get(k).push(f);
    const kf = ymd_(f.fecha);
    if (!porFecha.has(kf)) porFecha.set(kf, []);
    porFecha.get(kf).push(f);
  });
  const filasDe = function (fig, fecha) { return porFigFecha.get(normalizeText_(fig) + '|' + ymd_(fecha)) || []; };
  const status = function (f) { return iSt != null ? str(f.valores[iSt]) : ''; };
  const comunaFila = function (f) { return f.barrio ? _comunaBarrioAg_(f.barrio) : null; };
  const ubicaCoincide = function (ev, f) {
    if (!f.barrio) return false;
    if (ev.barrio) return _canonBarrioAg_(ev.barrio) === (_canonBarrioAg_(f.barrio) || f.barrio);
    if (ev.comuna != null) {
      if (comunaFila(f) !== ev.comuna) return false;
      if (ev.comuna === 1 && ev.subzona) { const sz = _subzonaBarrioAg_(f.barrio); return !sz || sz === ev.subzona; }
      return true;
    }
    if (ev.eje) return barrioEnEje_(f.barrio, ev.eje);
    return false;
  };
  const elegir = function (ev, lista) {
    if (lista.length <= 1) return lista[0] || null;
    const porLugar = lista.filter(function (f) { return ubicaCoincide(ev, f); });
    if (porLugar.length === 1) return porLugar[0];
    const porHora = lista.filter(function (f) { return f.horaMin != null && ev.hora && _minHoraAgenda_(ev.hora) === f.horaMin; });
    return porHora.length === 1 ? porHora[0] : lista[0];
  };

  const usadas = new Map();   // fila del destino → reunión del mail
  const ev = r.unicas.filter(function (x) { return enRango(x.fecha); });
  const futuras = r.unicas.filter(function (x) { return x.fecha && x.fecha > hoy; }).length;
  const cat = {};
  const sumar = function (k, x) { (cat[k] = cat[k] || []).push(x); };
  // Las figuras que nombra el mail, en cualquier versión: una fila de ésas es de su reunión, no de una sin figura.
  const nombradas = new Set();
  r.ultimas.concat(r.desaparecidas).forEach(function (x) {
    if (!x.fecha) return;
    x.figuras.forEach(function (fig) { nombradas.add(normalizeText_(fig) + '|' + ymd_(x.fecha)); });
  });
  const deOtraReunion = function (f) { return usadas.has(f.fila) || nombradas.has(normalizeText_(f.figura) + '|' + ymd_(f.fecha)); };
  ev.forEach(function (x) {
    x.cruce = { cat: '', fila: null, dias: null, detalle: '' };
    if (!x.figuraFila) return;   // las sin figura, al final (abajo)
    const propias = filasDe(x.figuraFila, x.fecha);
    if (propias.length) {
      x.cruce.cat = x.noParticipa.indexOf(x.figuraFila) >= 0 ? 'con_fila_no_participa' : (x.conjunta ? 'con_fila_conjunta_primera' : 'con_fila');
      x.cruce.fila = elegir(x, propias);
      if (propias.length > 1) x.cruce.detalle = propias.length + ' filas de la figura ese día';
      usadas.set(x.cruce.fila.fila, x);
      sumar(x.cruce.cat, x);
      return;
    }
    // Conjunta: la fila está a nombre de otra de sus figuras
    for (let i = 1; i < x.figuras.length; i++) {
      const otras = filasDe(x.figuras[i], x.fecha);
      if (otras.length) {
        x.cruce.cat = 'conjunta_fila_de_otra';
        x.cruce.fila = elegir(x, otras);
        x.cruce.detalle = 'a nombre de ' + x.figuras[i] + ' (la ' + (i + 1) + 'ª nombrada)';
        usadas.set(x.cruce.fila.fila, x);
        sumar(x.cruce.cat, x);
        return;
      }
    }
    // Reprogramada: la fila de alguna de sus figuras a ±N días
    let mejor = null;
    x.figuras.forEach(function (fig) {
      for (let d = 1; d <= AGENDA_DIAS_REPROGRAMADA; d++) {
        [d, -d].forEach(function (s) {
          const f2 = new Date(x.fecha.getTime() + s * 86400000);
          filasDe(fig, f2).forEach(function (f) {
            if (!usadas.has(f.fila) && (!mejor || Math.abs(s) < Math.abs(mejor.dias))) mejor = { f: f, dias: s };
          });
        });
      }
    });
    if (mejor) {
      x.cruce.cat = 'fila_a_otra_fecha';
      x.cruce.fila = mejor.f; x.cruce.dias = mejor.dias;
      x.cruce.detalle = 'fila a ' + (mejor.dias > 0 ? '+' : '') + mejor.dias + ' días, status ' + status(mejor.f);
      sumar(x.cruce.cat, x);
      return;
    }
    // Otra figura el mismo día en el mismo lugar
    const mismoLugar = (porFecha.get(ymd_(x.fecha)) || []).filter(function (f) { return ubicaCoincide(x, f) && !usadas.has(f.fila); });
    if (mismoLugar.length === 1) {
      x.cruce.cat = 'fila_de_otra_figura_mismo_lugar';
      x.cruce.fila = mismoLugar[0];
      x.cruce.detalle = 'fila ' + mismoLugar[0].fila + ' a nombre de ' + mismoLugar[0].figura;
      sumar(x.cruce.cat, x);
      return;
    }
    x.cruce.cat = 'sin_fila';
    sumar(x.cruce.cat, x);
  });
  // Las "fila_a_otra_fecha" se marcan usadas al final, para no robarle la fila a una de fecha exacta.
  (cat.fila_a_otra_fecha || []).forEach(function (x) { if (!usadas.has(x.cruce.fila.fila)) usadas.set(x.cruce.fila.fila, x); });
  // Sin figura (Seguridad en tu Barrio): fila de esa fecha y ese lugar que no sea de otra reunión del mail.
  ev.filter(function (x) { return !x.figuraFila; }).forEach(function (x) {
    const cand = (porFecha.get(ymd_(x.fecha)) || []).filter(function (f) { return ubicaCoincide(x, f) && !deOtraReunion(f); });
    x.cruce.cat = cand.length === 1 ? 'sin_figura_fila_por_lugar' : (cand.length ? 'sin_figura_varias_filas' : 'sin_figura_sin_fila');
    if (cand.length === 1) { x.cruce.fila = cand[0]; usadas.set(cand[0].fila, x); }
    x.cruce.detalle = cand.map(function (f) { return f.fila + ' ' + f.figura + ' (' + f.barrio + ')'; }).join(' / ');
    sumar(x.cruce.cat, x);
  });

  // Las desaparecidas de la ventana: ¿tienen fila? ¿con qué status?
  const desap = r.desaparecidas.filter(function (x) { return enRango(x.fecha); }).map(function (x) {
    const filas = x.figuraFila ? filasDe(x.figuraFila, x.fecha) : [];
    return { ev: x, fila: filas[0] || null, status: filas[0] ? status(filas[0]) : '' };
  });

  // Filas del destino de la ventana sin ninguna reunión del mail. Se cubren también por cualquier figura de
  // cualquier versión (una que desapareció también "estaba en el mail").
  const semanaConMail = function (fecha) {
    return r.semanas.some(function (g) { return g.desde && g.hasta && fecha >= g.desde && fecha <= g.hasta; });
  };
  const sinMail = dest.filas.filter(function (f) {
    return enRango(f.fecha) && !usadas.has(f.fila) && !nombradas.has(normalizeText_(f.figura) + '|' + ymd_(f.fecha));
  }).map(function (f) {
    const sinFigMismoLugar = r.unicas.filter(function (x) { return !x.figuraFila && x.fecha && ymd_(x.fecha) === ymd_(f.fecha) && ubicaCoincide(x, f); });
    return { f: f, dia: _diaSemanaAgenda_(f.fecha), mes: Utilities.formatDate(f.fecha, RDV_TZ, 'yyyy-MM'),
             semanaConMail: semanaConMail(f.fecha), seguridad: sinFigMismoLugar.length, status: status(f) };
  });

  // Punto 5 y reglas 2 y 3
  const conNoPart = ev.filter(function (x) { return x.noParticipa.length; });
  const noPartConFila = conNoPart.filter(function (x) { return x.cruce.fila; });
  const noPartRealizada = noPartConFila.filter(function (x) { return status(x.cruce.fila) === 'Realizada'; });
  const conjuntas = ev.filter(function (x) { return x.conjunta; });

  const filasCruce = [['fecha', 'hora', 'tipo', 'figura_fila', 'participan', 'no_participa', 'conjunta', 'lugar', 'direccion',
                       'grupo', 'categoria', 'fila_destino', 'figura_destino', 'barrio_destino', 'fecha_destino', 'status_destino',
                       'dias', 'detalle', 'evento_texto']];
  ev.forEach(function (x) {
    const f = x.cruce.fila;
    filasCruce.push([fmtFecha_(x.fecha), x.hora, x.tipo, x.figuraFila, x.participan.join(' / '), x.noParticipa.join(' / '),
                     x.conjunta ? 'sí' : '', x.lugar, x.direccion, x.grupo, x.cruce.cat, f ? f.fila : '', f ? f.figura : '',
                     f ? f.barrio : '', f ? fmtFecha_(f.fecha) : '', f ? status(f) : '', x.cruce.dias == null ? '' : x.cruce.dias,
                     x.cruce.detalle, x.eventoTexto]);
  });
  desap.forEach(function (d) {
    filasCruce.push([fmtFecha_(d.ev.fecha), d.ev.hora, d.ev.tipo, d.ev.figuraFila, d.ev.participan.join(' / '),
                     d.ev.noParticipa.join(' / '), d.ev.conjunta ? 'sí' : '', d.ev.lugar, d.ev.direccion, d.ev.grupo,
                     'DESAPARECIDA' + (d.fila ? '_con_fila' : '_sin_fila'), d.fila ? d.fila.fila : '', d.fila ? d.fila.figura : '',
                     d.fila ? d.fila.barrio : '', d.fila ? fmtFecha_(d.fila.fecha) : '', d.status, '',
                     'vista hasta la versión ' + d.ev.ultimaVersionVista + ' de ' + d.ev.versiones + (d.ev.ahora ? '; en la última: ' + d.ev.ahora : ''),
                     d.ev.eventoTexto]);
  });
  const filasSinMail = [['fila', 'figura', 'barrio', 'fecha', 'dia', 'mes', 'evento', 'status', 'semana_con_mail',
                         'reuniones_sin_figura_mismo_dia_y_lugar']];
  sinMail.forEach(function (s) {
    filasSinMail.push([s.f.fila, s.f.figura, s.f.barrio, fmtFecha_(s.f.fecha), s.dia, s.mes, s.f.evento, s.status,
                       s.semanaConMail ? 'sí' : 'no', s.seguridad]);
  });
  if (filasSinMail.length === 1) filasSinMail.push(['(ninguna)', '', '', '', '', '', '', '', '', '']);

  const resumen = { reuniones: ev.length, futuras: futuras, categorias: {}, desaparecidas: desap.length,
                    desaparecidasConFila: desap.filter(function (d) { return d.fila; }).length, sinMail: sinMail.length,
                    noParticipa: conNoPart.length, noParticipaConFila: noPartConFila.length, noParticipaRealizada: noPartRealizada.length,
                    conjuntas: conjuntas.length };
  Object.keys(cat).forEach(function (k) { resumen.categorias[k] = cat[k].length; });
  return { ini: ini, hoy: hoy, ev: ev, cat: cat, desap: desap, sinMail: sinMail, conNoPart: conNoPart,
           noPartConFila: noPartConFila, noPartRealizada: noPartRealizada, conjuntas: conjuntas, status: status,
           filasCruce: filasCruce, filasSinMail: filasSinMail, resumen: resumen, dest: dest };
}

function _logCruce_(c, r) {
  Logger.log('  ventana: %s → %s (hoy). Reuniones únicas del mail en la ventana: %s (futuras, fuera del cruce: %s)',
             fmtFecha_(c.ini), fmtFecha_(c.hoy), c.ev.length, c.resumen.futuras);
  const n = function (k) { return (c.cat[k] || []).length; };
  const conFila = n('con_fila') + n('con_fila_conjunta_primera') + n('con_fila_no_participa');
  Logger.log('--- 2. las reuniones del mail contra el destino ---');
  Logger.log('  CON FILA (figura de la fila + fecha exacta): %s (%s%%) — simples %s | conjuntas, a nombre de la 1ª %s | ' +
             '"NO PARTICIPA" de la figura de la fila %s', conFila, _pctAgenda_(conFila, c.ev.length), n('con_fila'),
             n('con_fila_conjunta_primera'), n('con_fila_no_participa'));
  Logger.log('  conjuntas, la fila a nombre de OTRA de sus figuras: %s', n('conjunta_fila_de_otra'));
  Logger.log('  fila de su figura a otra fecha (±%s días; reprogramada): %s — por días: %s', AGENDA_DIAS_REPROGRAMADA,
             n('fila_a_otra_fecha'), _repartoAgenda_(c.cat.fila_a_otra_fecha || [], function (x) { return (x.cruce.dias > 0 ? '+' : '') + x.cruce.dias; }));
  Logger.log('  fila de OTRA figura el mismo día y en el mismo lugar: %s', n('fila_de_otra_figura_mismo_lugar'));
  Logger.log('  sin figura (Seguridad en tu Barrio): una fila por fecha + lugar %s | varias %s | ninguna %s',
             n('sin_figura_fila_por_lugar'), n('sin_figura_varias_filas'), n('sin_figura_sin_fila'));
  Logger.log('  SIN FILA, sin explicar: %s', n('sin_fila'));
  ['conjunta_fila_de_otra', 'fila_a_otra_fecha', 'fila_de_otra_figura_mismo_lugar', 'sin_figura_varias_filas',
   'sin_figura_sin_fila', 'sin_fila'].forEach(function (k) {
    (c.cat[k] || []).slice(0, 8).forEach(function (x) {
      Logger.log('    [%s] %s %s | %s | %s | %s', k, fmtFecha_(x.fecha), x.hora, x.figuras.join(' + ') || x.tipo, x.lugar,
                 x.cruce.detalle || '');
    });
  });
  Logger.log('  desaparecidas en la última versión (de la ventana): %s — con fila en el destino %s (status: %s) | sin fila %s',
             c.desap.length, c.resumen.desaparecidasConFila,
             _repartoAgenda_(c.desap.filter(function (d) { return d.fila; }), function (d) { return d.status || '(vacío)'; }),
             c.desap.length - c.resumen.desaparecidasConFila);
  c.desap.slice(0, 10).forEach(function (d) {
    Logger.log('    %s %s | %s | %s | fila %s %s%s', fmtFecha_(d.ev.fecha), d.ev.hora, d.ev.figuraFila || d.ev.tipo, d.ev.lugar,
               d.fila ? d.fila.fila : '—', d.status, d.ev.ahora ? ' | en la última: ' + d.ev.ahora : '');
  });
  const sinExpl = n('sin_fila') + n('fila_de_otra_figura_mismo_lugar') + n('sin_figura_varias_filas') + n('sin_figura_sin_fila');
  Logger.log('  CONTRA LA PREDICCIÓN (~307 reuniones; ~268 con fila 87%%; 39 sin fila = 16 conjuntas + 16 reprogramadas + ' +
             '5 desaparecidas + 2 sin explicar; ~23 filas sin reunión):');
  Logger.log('    reuniones %s | con fila %s (%s%%) | conjuntas con la fila de otra %s | reprogramadas %s | desaparecidas %s | ' +
             'sin explicar %s | filas sin reunión %s', c.ev.length, conFila, _pctAgenda_(conFila, c.ev.length), n('conjunta_fila_de_otra'),
             n('fila_a_otra_fecha'), c.desap.length, sinExpl, c.sinMail.length);
  Logger.log('    (ojo: si la predicción contaba como "reunión" algo distinto —p. ej. una conjunta listada una vez por figura, o ' +
             'las de todas las versiones— los totales no son comparables uno a uno; las categorías sí)');

  Logger.log('--- filas del destino (ventana, ya pasadas) sin ninguna reunión en el mail: %s ---', c.sinMail.length);
  Logger.log('  por día: %s', _repartoAgenda_(c.sinMail, function (s) { return s.dia; }));
  Logger.log('  por mes: %s', _repartoAgenda_(c.sinMail, function (s) { return s.mes; }));
  Logger.log('  por EVENTO: %s', _repartoAgenda_(c.sinMail, function (s) { return s.f.evento || '(vacío)'; }));
  Logger.log('  semana cubierta por algún mail: sí %s | no %s | con una reunión sin figura el mismo día y lugar: %s',
             c.sinMail.filter(function (s) { return s.semanaConMail; }).length,
             c.sinMail.filter(function (s) { return !s.semanaConMail; }).length,
             c.sinMail.filter(function (s) { return s.seguridad; }).length);
  c.sinMail.slice(0, 25).forEach(function (s) {
    Logger.log('    fila %s | %s | %s %s | %s | %s | %s', s.f.fila, s.f.figura, s.dia, fmtFecha_(s.f.fecha), s.f.barrio, s.f.evento, s.status);
  });

  Logger.log('--- 5. columna "No participa" ---');
  Logger.log('  reuniones de la ventana con alguna figura "NO PARTICIPA": %s | con fila en el destino: %s → son las filas que ' +
             'la tendrían | de ésas, Realizada: %s (predicción: 63 de 66 con fila y Realizada)', c.conNoPart.length,
             c.noPartConFila.length, c.noPartRealizada.length);
  Logger.log('  figuras que no participan: %s', _repartoAgenda_([].concat.apply([], c.conNoPart.map(function (x) { return x.noParticipa; })), function (f) { return f; }));
  c.conNoPart.filter(function (x) { return !x.cruce.fila || c.status(x.cruce.fila) !== 'Realizada'; }).slice(0, 10).forEach(function (x) {
    Logger.log('    %s | %s | no participa: %s | %s', fmtFecha_(x.fecha), x.figuras.join(' + '), x.noParticipa.join(', '),
               x.cruce.fila ? 'fila ' + x.cruce.fila.fila + ' ' + c.status(x.cruce.fila) : x.cruce.cat);
  });
  Logger.log('  propuesta: una columna nueva "No participa" AL FINAL del destino, después de la traza (form_clave). ' +
             'Nunca insertada en el medio: correría los fondos (CLAUDE.md §6). Texto: los nombres, separados por " / ".');
  Logger.log('--- regla 3: conjuntas (ventana) %s → fila a nombre de la 1ª %s | de otra %s | a otra fecha %s | sin fila %s',
             c.conjuntas.length,
             c.conjuntas.filter(function (x) { return /^con_fila/.test(x.cruce.cat); }).length,
             c.conjuntas.filter(function (x) { return x.cruce.cat === 'conjunta_fila_de_otra'; }).length,
             c.conjuntas.filter(function (x) { return x.cruce.cat === 'fila_a_otra_fecha'; }).length,
             c.conjuntas.filter(function (x) { return x.cruce.cat === 'sin_fila'; }).length);
  c.conjuntas.filter(function (x) { return x.cruce.cat === 'conjunta_fila_de_otra'; }).slice(0, 10).forEach(function (x) {
    Logger.log('    %s | nombradas: %s | %s', fmtFecha_(x.fecha), x.figuras.join(' + '), x.cruce.detalle);
  });
}

// ===================== PASO 31 — barrio desde la dirección =====================

/**
 * Para las filas del destino con Dirección: geocodifica la dirección (Maps.newGeocoder, con cache en AGENDA_GEOCODE),
 * ubica el punto en el polígono de su barrio y lo compara con el Barrio que cargó el equipo; compara también el
 * barrio de Google y el método viejo. Y mide la REGLA DE CONFIANZA (06/10, punto 4): el barrio desde la dirección se
 * escribiría SÓLO si (a) la geocodificación es "ok" (no ok_parcial, aproximada ni borde), (b) el barrio del polígono
 * cae en la misma comuna que trae el mail, o coincide con el barrio que trae el mail, y (c) la celda está vacía. La
 * reunión del mail de cada fila sale del cruce del paso 30 (ventana de análisis). (c) no se puede medir sobre las
 * filas que el equipo ya cargó: ahí se mide si la regla ACIERTA; aparte se cuentan las filas sin barrio a las que
 * la regla les escribiría uno. Escribe AGENDA_BARRIO_DIRECCION y agrega a la cache lo geocodificado.
 *
 * Geocodificación (06/10): no se pide lo que no es una dirección (un link, un nombre de lugar sin altura); un error
 * de servicio o un "sin resultado" se reintenta una vez sin el rectángulo de la Ciudad y, si sigue fallando y la
 * fila tiene reunión en el mail, con la pista del mail ("calle número, <barrio o Comuna N>, Ciudad…"). La pista sale
 * SÓLO del mail, nunca del Barrio del destino (sería darle la respuesta).
 */
function medirBarrioDesdeDireccion() {
  const t0 = Date.now();
  Logger.log('=== medirBarrioDesdeDireccion (paso 31) — sólo lectura sobre el destino; escribe %s y %s en la intermedia ===',
             AGENDA_SOLAPA_BARRIO, AGENDA_SOLAPA_GEOCODE);
  const dest = leerDestino_();
  const iDir = findIdxOr_(dest.hdr, ['direccion', 'dirección'], true);
  if (iDir == null) { Logger.log('>>> el destino no tiene columna Dirección'); return { error: 'sin Dirección' }; }
  // La reunión del mail de cada fila (el cruce del paso 30).
  const cruce = agendaCruce_(dest, agendaDesdeMails_());
  const delMail = new Map();
  cruce.ev.forEach(function (x) { if (x.cruce.fila) delMail.set(x.cruce.fila.fila, x); });
  const poligonos = _poligonosBarrios_();
  const cache = _leerCacheGeocode_();
  const nuevas = [];
  const c = { filas: 0, vacia: 0, aConfirmar: 0, noEsDireccion: 0, noEsDireccionEj: [], sinBarrio: 0, consultas: 0, llamadas: 0,
              cacheHits: 0, reintentos: 0, reintentosOk: 0, reintentosPista: 0,
              pendientes: 0, cortePor: '', geo: {}, exacto: 0, mismaComuna: 0, otraComuna: 0, google: { exacto: 0, distinto: 0, sinDato: 0 },
              distintos: [], fallas: [], porEstado: {},
              regla: { universo: 0, sinMail: 0, cumple: 0, exacto: 0, distintos: [], falla: {}, sinBarrio: 0, seEscribirian: 0, ejemplos: [] },
              // la regla CON el margen de borde (etapa 2, punto 12): (c) a más de BARRIO_MARGEN_M de otro barrio
              reglaM: { cumple: 0, exacto: 0, distintos: [], porMargen: 0, seEscribirian: 0 },
              // el método viejo (Barrios Estimados.js): la heurística de texto sola, y el método completo (texto, y si no, Google)
              viejoTexto: { resp: 0, exacto: 0, mismaComuna: 0, otraComuna: 0, via: {} }, viejoCompleto: { evaluadas: 0, resp: 0, exacto: 0 },
              viejoDistintos: [] };
  const comparar = function (barrio, canonDest) {
    const b = _canonBarrioAg_(barrio) || barrio;
    if (normalizeText_(b) === normalizeText_(canonDest)) return 'exacto';
    const cb = _comunaBarrioAg_(b);
    return cb != null && cb === _comunaBarrioAg_(canonDest) ? 'distinto, misma comuna' : 'distinto, otra comuna';
  };
  const reintentable = function (x) { return x && (x.estado === 'ZERO_RESULTS' || x.estado === 'ERROR') && !/reintento/.test(x.detalle || ''); };
  const cuota = function (x) { return x.estado === 'ERROR' && /too many|cuota|quota|limit/i.test(x.detalle); };
  /** La geocodificación de una dirección: de la cache, o pedida (con el reintento). null si se cortó (tope, tiempo, cuota). */
  const obtener = function (consulta, dir, ev) {
    let g = cache.get(consulta);
    if (g && !reintentable(g)) { c.cacheHits++; return g; }
    if (c.cortePor) return null;
    if (c.llamadas >= GEOCODE_MAX_POR_CORRIDA) { c.cortePor = 'tope de ' + GEOCODE_MAX_POR_CORRIDA + ' llamadas'; return null; }
    if (Date.now() - t0 > GEOCODE_CORTE_MS) { c.cortePor = 'tiempo'; return null; }
    if (!g) {
      g = _geocodificar_(consulta, true);
      c.llamadas++;
      if (cuota(g)) { c.cortePor = 'cuota: ' + g.detalle; return null; }
    }
    if (reintentable(g)) {
      c.reintentos++;
      let g2 = _geocodificar_(consulta, false), via = 'sin el rectángulo de la Ciudad';
      c.llamadas++;
      if (g2.estado !== 'OK' && ev && (ev.barrio || ev.comuna != null)) {
        const pista = ev.barrio || ('Comuna ' + ev.comuna);
        g2 = _geocodificar_(_calleNumero_(dir) + ', ' + pista + GEOCODE_SUFIJO, true);
        c.llamadas++;
        via = 'con la pista del mail (' + pista + ')';
        if (g2.estado === 'OK') c.reintentosPista++;
      }
      if (cuota(g2)) { c.cortePor = 'cuota: ' + g2.detalle; return null; }
      g2.detalle = 'reintento ' + via + (g2.detalle ? ': ' + g2.detalle : '') + ' | antes: ' + g.estado + (g.detalle ? ' ' + g.detalle : '');
      g2.consulta = consulta;
      if (g2.estado === 'OK') c.reintentosOk++;
      g = g2;
    }
    cache.set(consulta, g);
    nuevas.push(g);
    return g;
  };
  const filas = [['fila', 'figura', 'fecha', 'barrio_destino', 'direccion', 'consulta', 'estado_geo', 'tipo_ubicacion', 'lat', 'lng',
                  'barrio_poligono', 'comuna_poligono', 'resultado', 'barrio_google', 'resultado_google', 'direccion_google',
                  'viejo_texto', 'viejo_texto_via', 'resultado_viejo_texto', 'viejo_completo', 'resultado_viejo_completo',
                  'lugar_del_mail', 'regla_confianza', 'detalle_geo']];
  dest.filas.forEach(function (f) {
    const dir = str(f.valores[iDir]);
    c.filas++;
    if (!dir) { c.vacia++; return; }
    if (/\ba confirmar\b|\bno se comunica\b/.test(normalizeText_(dir))) { c.aConfirmar++; return; }
    if (_noEsDireccion_(dir)) { c.noEsDireccion++; if (c.noEsDireccionEj.length < 10) c.noEsDireccionEj.push(f.fila + ' | ' + dir); return; }
    const ev = delMail.get(f.fila) || null;
    const lugarMail = ev ? (ev.lugar || '(sin lugar)') : '';
    const consulta = _consultaGeocode_(dir);

    // Fila SIN barrio: sólo interesa si tiene reunión del mail (¿la regla le escribiría uno?).
    if (!f.barrio) {
      c.sinBarrio++;
      if (!ev) return;
      c.regla.sinBarrio++;
      const g0 = obtener(consulta, dir, ev);
      if (!g0) return;
      const res0 = _barrioDeGeo_(g0, poligonos), r0 = _reglaBarrio_(res0, ev);
      if (_reglaBarrioConMargen_(res0, ev, poligonos, BARRIO_MARGEN_M).cumple) c.reglaM.seEscribirian++;
      if (r0.cumple) {
        c.regla.seEscribirian++;
        if (c.regla.ejemplos.length < 15) c.regla.ejemplos.push(f.fila + ' | ' + f.figura + ' | ' + fmtFecha_(f.fecha) + ' | ' + dir + ' → ' + res0.barrio + ' (mail: ' + lugarMail + ')');
      }
      filas.push([f.fila, f.figura, fmtFecha_(f.fecha), '', dir, consulta, res0.estado, g0.tipo || '', g0.lat || '', g0.lng || '',
                  res0.barrio, res0.comuna == null ? '' : res0.comuna, '(sin barrio en el destino)', '', '', g0.formateada || '',
                  '', '', '', '', '', lugarMail, r0.cumple ? 'se escribiría' : r0.motivo, g0.detalle || '']);
      return;
    }

    c.consultas++;
    const canonDest = _canonBarrioAg_(f.barrio) || f.barrio;
    // El viejo, primero la heurística de texto: no usa el geocodificador, se mide en todas.
    const vt = _viejoPorTexto_(dir);
    let resVT = '';
    if (vt) {
      resVT = comparar(vt.barrio, canonDest);
      c.viejoTexto.resp++;
      if (resVT === 'exacto') c.viejoTexto.exacto++; else if (resVT === 'distinto, misma comuna') c.viejoTexto.mismaComuna++; else c.viejoTexto.otraComuna++;
      const v = c.viejoTexto.via[vt.via] = c.viejoTexto.via[vt.via] || { n: 0, ok: 0 };
      v.n++; if (resVT === 'exacto') v.ok++;
      if (resVT !== 'exacto' && c.viejoDistintos.length < 20) c.viejoDistintos.push(f.fila + ' | ' + canonDest + ' ← ' + vt.barrio + ' (' + vt.via + ') | ' + dir);
    }
    const g = obtener(consulta, dir, ev);
    if (!g) { c.pendientes++; return; }
    const res = _barrioDeGeo_(g, poligonos);
    c.geo[res.estado] = (c.geo[res.estado] || 0) + 1;
    let resultado = '', resG = '';
    if (res.barrio) {
      if (normalizeText_(res.barrio) === normalizeText_(canonDest)) { resultado = 'exacto'; c.exacto++; }
      else if (res.comuna != null && res.comuna === _comunaBarrioAg_(canonDest)) { resultado = 'distinto, misma comuna'; c.mismaComuna++; }
      else { resultado = 'distinto, otra comuna'; c.otraComuna++; }
      if (resultado !== 'exacto' && c.distintos.length < 25) c.distintos.push(f.fila + ' | ' + canonDest + ' ← ' + res.barrio + ' | ' + dir + ' | ' + res.estado);
      const pe = c.porEstado[res.estado] = c.porEstado[res.estado] || { n: 0, exacto: 0 };
      pe.n++; if (resultado === 'exacto') pe.exacto++;
    } else if (c.fallas.length < 15) c.fallas.push(f.fila + ' | ' + dir + ' | ' + res.estado + (g.detalle ? ' ' + g.detalle : ''));
    // La regla de confianza (punto 4)
    let reglaTxt = '';
    if (ev) {
      c.regla.universo++;
      const rg = _reglaBarrio_(res, ev);
      const rgM = _reglaBarrioConMargen_(res, ev, poligonos, BARRIO_MARGEN_M);
      if (rgM.cumple) {
        c.reglaM.cumple++;
        if (resultado === 'exacto') c.reglaM.exacto++;
        else c.reglaM.distintos.push(f.fila + ' | ' + canonDest + ' ← ' + res.barrio + ' | ' + dir + ' | mail: ' + lugarMail +
                                     ' | a ' + Math.round(rgM.distancia) + ' m de otro barrio');
      } else if (rg.cumple) c.reglaM.porMargen++;
      if (rg.cumple) {
        c.regla.cumple++;
        reglaTxt = 'cumple (' + rg.por + ')';
        if (resultado === 'exacto') c.regla.exacto++;
        else c.regla.distintos.push(f.fila + ' | ' + canonDest + ' ← ' + res.barrio + ' | ' + dir + ' | mail: ' + lugarMail + ' | ' + resultado);
      } else {
        reglaTxt = rg.motivo;
        c.regla.falla[rg.motivo] = (c.regla.falla[rg.motivo] || 0) + 1;
      }
    } else c.regla.sinMail++;
    const bg = g.barrioGoogle ? (_canonBarrioAg_(g.barrioGoogle) || _detectBarrioAg_(g.barrioGoogle)) : '';
    if (!bg) { c.google.sinDato++; resG = g.barrioGoogle ? 'no reconocido: ' + g.barrioGoogle : 'sin dato'; }
    else if (normalizeText_(bg) === normalizeText_(canonDest)) { c.google.exacto++; resG = 'exacto'; }
    else { c.google.distinto++; resG = 'distinto'; }
    // El viejo completo: la heurística si dio algo; si no, lo que saca de la respuesta de Google.
    const vc = vt ? vt.barrio : _viejoPorGeo_(g);
    const resVC = vc ? comparar(vc, canonDest) : '';
    c.viejoCompleto.evaluadas++;
    if (vc) { c.viejoCompleto.resp++; if (resVC === 'exacto') c.viejoCompleto.exacto++; }
    filas.push([f.fila, f.figura, fmtFecha_(f.fecha), canonDest, dir, consulta, res.estado, g.tipo || '', g.lat || '', g.lng || '',
                res.barrio, res.comuna == null ? '' : res.comuna, resultado, bg || g.barrioGoogle || '', resG, g.formateada || '',
                vt ? vt.barrio : '', vt ? vt.via : '', resVT, vc, resVC, lugarMail, reglaTxt, g.detalle || '']);
  });
  try { _agregarCacheGeocode_(nuevas); } catch (err) { Logger.log('[agenda] la cache %s no se actualizó: %s (lo geocodificado se vuelve a pedir la próxima vez)', AGENDA_SOLAPA_GEOCODE, err); }

  // El log, ANTES de escribir la solapa (si la escritura se cae, los números ya están).
  const ubicadas = c.exacto + c.mismaComuna + c.otraComuna;
  const evaluadas = c.consultas - c.pendientes;
  Logger.log('  filas del destino: %s | sin Dirección %s | "A CONFIRMAR" %s | NO son una dirección (link o sin altura; no se geocodifican) %s | ' +
             'sin Barrio %s', c.filas, c.vacia, c.aConfirmar, c.noEsDireccion, c.sinBarrio);
  c.noEsDireccionEj.forEach(function (s) { Logger.log('    no es dirección: %s', s); });
  Logger.log('  con dirección y barrio: %s | evaluadas en esta corrida %s | PENDIENTES %s%s',
             c.consultas, evaluadas, c.pendientes, c.cortePor ? '  <<< cortó por ' + c.cortePor + ': volver a correr, sigue de la cache' : '');
  Logger.log('  CUOTA: llamadas al geocodificador en esta corrida %s (cache: %s aciertos) | reintentos %s → ok %s (con la pista del mail %s). ' +
             'El límite diario depende del tipo de cuenta; si se agota, el log lo dice y la corrida siguiente sigue.',
             c.llamadas, c.cacheHits, c.reintentos, c.reintentosOk, c.reintentosPista);
  Logger.log('  geocodificación: %s', Object.keys(c.geo).map(function (k) { return k + ' ' + c.geo[k]; }).join(' · '));
  Logger.log('  POLÍGONO contra Barrio del destino (sobre %s ubicadas): exacto %s (%s%%) | distinto, misma comuna %s | distinto, otra comuna %s',
             ubicadas, c.exacto, _pctAgenda_(c.exacto, ubicadas), c.mismaComuna, c.otraComuna);
  Logger.log('    sobre todas las evaluadas (%s, incluye las que no se pudieron ubicar): exacto %s%% | fallas de geocodificación %s%%',
             evaluadas, _pctAgenda_(c.exacto, evaluadas), _pctAgenda_(evaluadas - ubicadas, evaluadas));
  Logger.log('    %% exacto POR ESTADO de la geocodificación: %s', ['ok', 'ok_parcial', 'aproximada', 'borde'].map(function (k) {
    const pe = c.porEstado[k] || { n: 0, exacto: 0 };
    return k + ' ' + pe.exacto + '/' + pe.n + ' (' + _pctAgenda_(pe.exacto, pe.n) + '%)';
  }).join(' · '));
  Logger.log('--- 4. REGLA DE CONFIANZA: (a) geocodificación "ok" + (b) misma comuna que el mail o el mismo barrio + (c) celda vacía ---');
  Logger.log('  filas con barrio del equipo y reunión del mail (ventana): %s | sin reunión del mail (fuera de la ventana o sin cruce): %s',
             c.regla.universo, c.regla.sinMail);
  Logger.log('  CUMPLEN (a) y (b): %s (%s%% de las que tienen reunión) → EXACTO %s (%s%%)   [predicción: ~99%%]',
             c.regla.cumple, _pctAgenda_(c.regla.cumple, c.regla.universo), c.regla.exacto, _pctAgenda_(c.regla.exacto, c.regla.cumple));
  c.regla.distintos.forEach(function (s) { Logger.log('    cumple y NO coincide: %s', s); });
  Logger.log('  no cumplen (quedarían vacías para el equipo): %s',
             Object.keys(c.regla.falla).sort(function (a, b) { return c.regla.falla[b] - c.regla.falla[a]; })
               .map(function (k) { return k + ' ' + c.regla.falla[k]; }).join(' · ') || '—');
  Logger.log('  filas SIN barrio, con dirección y reunión del mail: %s → la regla les escribiría uno a %s', c.regla.sinBarrio, c.regla.seEscribirian);
  c.regla.ejemplos.forEach(function (s) { Logger.log('    se escribiría: %s', s); });
  Logger.log('--- 12. LA REGLA CON EL MARGEN DE BORDE: además (c) el punto a más de %s m de cualquier otro barrio ---', BARRIO_MARGEN_M);
  Logger.log('  CUMPLEN (a), (b) y (c): %s (%s%% de las %s con reunión del mail; sin el margen eran %s) → EXACTO %s (%s%%)   ' +
             '[predicción: ~98-99%%, con menos cobertura]', c.reglaM.cumple, _pctAgenda_(c.reglaM.cumple, c.regla.universo),
             c.regla.universo, c.regla.cumple, c.reglaM.exacto, _pctAgenda_(c.reglaM.exacto, c.reglaM.cumple));
  Logger.log('  las que el margen saca (cumplían sin él): %s | filas SIN barrio a las que les escribiría uno: %s (sin el margen: %s)',
             c.reglaM.porMargen, c.reglaM.seEscribirian, c.regla.seEscribirian);
  c.reglaM.distintos.forEach(function (s) { Logger.log('    cumple con margen y NO coincide: %s', s); });
  Logger.log('  GOOGLE (neighborhood / sublocality) contra el destino: exacto %s | distinto %s | sin dato o no reconocido %s',
             c.google.exacto, c.google.distinto, c.google.sinDato);
  c.distintos.forEach(function (s) { Logger.log('    distinto: %s', s); });
  c.fallas.forEach(function (s) { Logger.log('    sin ubicar: %s', s); });
  Logger.log('  VIEJO ("CODIGOS Ajuste RDV", Barrios Estimados.js), heurística de texto sola, sobre las %s con dirección y barrio: ' +
             'responde %s | exacto %s (%s%% de las que responde) | distinto, misma comuna %s | distinto, otra comuna %s',
             c.consultas, c.viejoTexto.resp, c.viejoTexto.exacto, _pctAgenda_(c.viejoTexto.exacto, c.viejoTexto.resp),
             c.viejoTexto.mismaComuna, c.viejoTexto.otraComuna);
  Logger.log('    por vía: %s   ("calle" = las calles emblemáticas: Santa Fe → Recoleta, Corrientes → Almagro, Libertador → Belgrano…)',
             Object.keys(c.viejoTexto.via).map(function (k) { const v = c.viejoTexto.via[k]; return k + ' ' + v.ok + '/' + v.n; }).join(' · ') || '—');
  c.viejoDistintos.forEach(function (s) { Logger.log('    viejo distinto: %s', s); });
  Logger.log('  VIEJO completo (heurística; si no, Google) sobre las %s geocodificadas: responde %s | exacto %s (%s%% de las evaluadas)  ' +
             'contra el NUEVO (polígono): exacto %s (%s%%)', c.viejoCompleto.evaluadas, c.viejoCompleto.resp, c.viejoCompleto.exacto,
             _pctAgenda_(c.viejoCompleto.exacto, c.viejoCompleto.evaluadas), c.exacto, _pctAgenda_(c.exacto, evaluadas));
  Logger.log('    (la parte Google del viejo se aplica sobre la misma respuesta del nuevo; su consulta original era la dirección ' +
             'completa + ", CABA, Argentina", sin región)');
  _escribirMedicionAgenda_(AGENDA_SOLAPA_BARRIO, filas);
  Logger.log('%s ms', Date.now() - t0);
  return { evaluadas: evaluadas, exacto: c.exacto, ubicadas: ubicadas, pendientes: c.pendientes, llamadas: c.llamadas,
           regla: { universo: c.regla.universo, cumple: c.regla.cumple, exacto: c.regla.exacto, seEscribirian: c.regla.seEscribirian },
           reglaMargen: { cumple: c.reglaM.cumple, exacto: c.reglaM.exacto, porMargen: c.reglaM.porMargen, seEscribirian: c.reglaM.seEscribirian } };
}

// ===================== El método VIEJO ("CODIGOS Ajuste RDV", Barrios Estimados.js), portado para medirlo =====================
//
// Copia fiel de `guessBarrioFromText_` y de la extracción de `geocodeAddressToBarrio_` (_externo/codigos-ajuste-rdv/,
// bajado el 06/10). El orden del viejo: PRIMERO la heurística de texto sobre la dirección (nombres de barrio en el
// texto y "calles emblemáticas"); si no da nada, el geocodificador ("<dirección>, CABA, Argentina"), del que toma el
// primer componente neighborhood / sublocality / political que sea un barrio, después cualquier componente, después
// la heurística sobre la dirección formateada. Acá la parte del geocodificador se aplica sobre la MISMA respuesta que
// usa el método nuevo (la consulta del viejo era la dirección completa, sin región: no se pide dos veces). Sólo mide.

const VIEJO_BARRIOS_CANON_ = [
  'Agronomía','Almagro','Balvanera','Barracas','Belgrano','Boedo','Caballito','Chacarita','Coghlan','Colegiales',
  'Constitución','Flores','Floresta','La Boca','La Paternal','Liniers','Mataderos','Monte Castro','Monserrat',
  'Nueva Pompeya','Núñez','Palermo','Parque Avellaneda','Parque Chacabuco','Parque Chas','Parque Patricios',
  'Puerto Madero','Recoleta','Retiro','Saavedra','San Cristóbal','San Nicolás','San Telmo','Vélez Sarsfield',
  'Versalles','Villa Crespo','Villa del Parque','Villa Devoto','Villa General Mitre','Villa Lugano','Villa Luro',
  'Villa Ortúzar','Villa Pueyrredón','Villa Real','Villa Riachuelo','Villa Santa Rita','Villa Soldati',
  'Villa Urquiza','Pompeya'
];
const VIEJO_ALIAS_ = { 'boca': 'La Boca', 'paternal': 'La Paternal', 'pompeya': 'Nueva Pompeya', 'villa gral mitre': 'Villa General Mitre',
                       'villa sta rita': 'Villa Santa Rita' };

function _viejoNorm_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

/** `canonBarrio_` del viejo: alias o igualdad exacta con su lista; '' si no. */
function _viejoCanon_(s) {
  const ns = _viejoNorm_(s);
  if (!ns) return '';
  if (VIEJO_ALIAS_[ns]) return VIEJO_ALIAS_[ns];
  const m = VIEJO_BARRIOS_CANON_.filter(function (b) { return _viejoNorm_(b) === ns; })[0];
  return m ? (VIEJO_ALIAS_[ns] || m) : '';
}

/** `guessBarrioFromText_` del viejo. Devuelve { barrio, via: 'villa' | 'nombre' | 'calle' } o null. */
function _viejoPorTexto_(direccion) {
  if (!direccion) return null;
  const d = ' ' + _viejoNorm_(direccion).replace(/[.,;:()]/g, ' ') + ' ';
  const mV = d.match(/\bvilla\s+(crespo|del\s+parque|devoto|general\s+mitre|gral\s+mitre|lugano|luro|ortuzar|pueyrredon|real|riachuelo|santa\s+rita|soldati|urquiza)\b/);
  if (mV) { const c = _viejoCanon_('villa ' + mV[1].replace(/\s+/g, ' ')); if (c) return { barrio: c, via: 'villa' }; }
  const cands = VIEJO_BARRIOS_CANON_.concat(['Paternal', 'Chas', 'Chacabuco', 'Avellaneda', 'Patricios', 'Boca', 'Constitucion',
                                             'Constitución', 'Nunez', 'Núñez', 'Velez Sarsfield', 'Vélez Sarsfield']);
  for (let i = 0; i < cands.length; i++) {
    const n = _viejoNorm_(cands[i]);
    if (new RegExp('\\b' + n.replace(/\s+/g, '\\s+') + '\\b', 'i').test(d)) {
      const c = _viejoCanon_(cands[i]);
      if (c) return { barrio: c, via: 'nombre' };
    }
  }
  const pistas = [
    { re: /\b(cabildo|juramento|congreso|libertador)\b/, barrio: 'Belgrano' },
    { re: /\b(defensa|balcarce|paseo colon)\b/, barrio: 'San Telmo' },
    { re: /\b(azcuenaga|santa fe|callao|las heras)\b/, barrio: 'Recoleta' },
    { re: /\b(corrientes|pueyrredon|medrano)\b/, barrio: 'Almagro' },
    { re: /\b(av corrientes 2\d{3,4}|obelisco|9 de julio)\b/, barrio: 'San Nicolás' }
  ];
  for (let i = 0; i < pistas.length; i++) if (pistas[i].re.test(d)) return { barrio: pistas[i].barrio, via: 'calle' };
  return null;
}

/** La extracción del geocodificador del viejo, sobre los componentes guardados en la cache. */
function _viejoPorGeo_(g) {
  if (!g || g.estado !== 'OK') return '';
  let comps = [];
  try { comps = JSON.parse(g.componentes || '[]'); } catch (e) { comps = []; }
  const tipos = ['neighborhood', 'sublocality', 'political'];
  for (let t = 0; t < tipos.length; t++) {
    const c = comps.filter(function (x) { return (x[1] || []).indexOf(tipos[t]) !== -1; })[0];
    if (c && _viejoCanon_(c[0])) return _viejoCanon_(c[0]);
  }
  for (let i = 0; i < comps.length; i++) if (_viejoCanon_(comps[i][0])) return _viejoCanon_(comps[i][0]);
  const p = _viejoPorTexto_(g.formateada);
  return p ? p.barrio : '';
}

// ===================== PASO 32 — Seguridad en tu Barrio contra RDV CONJUNTO =====================

/**
 * Las reuniones del mail sin figura contra RDV CONJUNTO, por fecha + ubicación: el barrio del mail contra el de
 * RDV CONJUNTO (canonizados), o la comuna del mail contra la de RDV CONJUNTO ("C5", o la del barrio por
 * Comunas). Cuenta si sale UNA figura, varias o ninguna, y compara con la figura de la fila del destino de esa
 * fecha y lugar. Escribe AGENDA_SEGURIDAD en la intermedia.
 */
function seguridadContraConjunto() {
  const t0 = Date.now();
  Logger.log('=== seguridadContraConjunto (paso 32) — sólo lectura: escribe %s en la intermedia ===', AGENDA_SOLAPA_SEGURIDAD);
  const dest = leerDestino_();
  const r = agendaDesdeMails_();
  const sinFig = r.unicas.filter(function (x) { return !x.figuraFila && x.fecha; });
  const sh = ssDestino_().getSheetByName(RDV_HOJA_ASISTENTES_SRC);
  if (!sh) { Logger.log('>>> no existe "%s"', RDV_HOJA_ASISTENTES_SRC); return { error: 'sin RDV CONJUNTO' }; }
  const vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const hdr = vals[0];
  const iFig = findIdxOr_(hdr, ['figura', 'persona', 'nombre'], true);
  const iBar = findIdxOr_(hdr, ['barrion', 'barrio'], true);
  const iFec = findIdxOr_(hdr, ['fecha', 'fecha (fecha)', 'fecha_evento', 'fecha reunion', 'fecha reunión', 'fecha evento'], true);
  if (iFig == null || iFec == null) { Logger.log('>>> RDV CONJUNTO sin Figura o FECHA por encabezado'); return { error: 'encabezados' }; }
  const porFecha = new Map();
  for (let i = 1; i < vals.length; i++) {
    const f = toDate_(vals[i][iFec]);
    if (!f) continue;
    const k = ymd_(f);
    if (!porFecha.has(k)) porFecha.set(k, []);
    porFecha.get(k).push({ fila: i + 1, nombre: str(vals[i][iFig]), ubic: iBar != null ? str(vals[i][iBar]) : '' });
  }
  const comunaDe = function (texto) {
    if (/^\s*(c|comuna)\s*0?\d{1,2}\s*(n|s|norte|sur)?\s*$/i.test(texto)) return detectComuna_(texto);
    return _comunaBarrioAg_(texto);
  };
  const coincide = function (ev, ubic) {
    if (!ubic) return false;
    if (ev.barrio) {
      const b = _canonBarrioAg_(ubic);
      if (b) return normalizeText_(b) === normalizeText_(ev.barrio);
    }
    const c = ev.comuna != null ? ev.comuna : (ev.barrio ? _comunaBarrioAg_(ev.barrio) : null);
    return c != null && comunaDe(ubic) === c;
  };
  const destPorFecha = new Map();
  dest.filas.forEach(function (f) { if (f.fecha) { const k = ymd_(f.fecha); if (!destPorFecha.has(k)) destPorFecha.set(k, []); destPorFecha.get(k).push(f); } });
  const ini = inicioVentanaAnalisis_();
  const c = { total: sinFig.length, ventana: 0, una: 0, varias: 0, ninguna: 0, sinLugar: 0, igualDestino: 0, distintaDestino: 0,
              sinDestino: 0, ejemplos: [] };
  const filas = [['fecha', 'hora', 'tipo', 'lugar', 'direccion', 'en_ventana', 'resultado', 'figura_conjunto', 'filas_conjunto',
                  'figura_destino', 'fila_destino', 'comparacion', 'evento_texto']];
  sinFig.forEach(function (ev) {
    const enV = ev.fecha >= ini;
    if (enV) c.ventana++;
    let resultado, figura = '', filasC = '';
    if (!ev.lugarTipo || ev.lugarTipo === 'eje') { resultado = 'sin barrio ni comuna en el mail'; c.sinLugar++; }
    else {
      const cand = (porFecha.get(ymd_(ev.fecha)) || []).filter(function (x) { return coincide(ev, x.ubic); });
      const figs = {};
      cand.forEach(function (x) { const fp = figuraPorTokens_(x.nombre); figs[fp.figura || ('? ' + x.nombre)] = true; });
      const lista = Object.keys(figs);
      filasC = cand.map(function (x) { return x.fila + ' ' + x.nombre + ' (' + x.ubic + ')'; }).join(' / ');
      if (lista.length === 1 && lista[0].indexOf('? ') !== 0) { resultado = 'resuelve 1'; figura = lista[0]; c.una++; }
      else if (lista.length >= 1) { resultado = lista.length === 1 ? 'una fila, figura no reconocida' : 'ambigua (' + lista.length + ')'; c.varias++; }
      else { resultado = 'sin fila en RDV CONJUNTO'; c.ninguna++; }
    }
    // El destino ese día y en ese lugar
    const fd = (destPorFecha.get(ymd_(ev.fecha)) || []).filter(function (f) {
      if (!f.barrio) return false;
      if (ev.barrio) return normalizeText_(_canonBarrioAg_(f.barrio) || f.barrio) === normalizeText_(ev.barrio);
      return ev.comuna != null && _comunaBarrioAg_(f.barrio) === ev.comuna;
    });
    let comp = '';
    if (!fd.length) { comp = 'sin fila en el destino'; c.sinDestino++; }
    else if (figura && fd.some(function (f) { return normalizeText_(f.figura) === normalizeText_(figura); })) { comp = 'igual'; c.igualDestino++; }
    else if (figura) { comp = 'distinta'; c.distintaDestino++; if (c.ejemplos.length < 10) c.ejemplos.push(fmtFecha_(ev.fecha) + ' ' + ev.lugar + ': RDV CONJUNTO ' + figura + ' / destino ' + fd.map(function (f) { return f.figura; }).join(', ')); }
    filas.push([fmtFecha_(ev.fecha), ev.hora, ev.tipo, ev.lugar, ev.direccion, enV ? 'sí' : '', resultado, figura, filasC,
                fd.map(function (f) { return f.figura; }).join(' / '), fd.map(function (f) { return f.fila; }).join(' / '), comp, ev.eventoTexto]);
  });
  if (filas.length === 1) filas.push(['(ninguna)', '', '', '', '', '', '', '', '', '', '', '', '']);
  _escribirMedicionAgenda_(AGENDA_SOLAPA_SEGURIDAD, filas);
  Logger.log('  reuniones del mail sin figura: %s (en la ventana: %s) — por tipo: %s', c.total, c.ventana,
             _repartoAgenda_(sinFig, function (x) { return x.tipo || '(sin tipo)'; }));
  Logger.log('  contra RDV CONJUNTO por fecha + barrio/comuna: RESUELVE 1 %s | ambiguas o figura no reconocida %s | sin fila %s | ' +
             'el mail no trae barrio ni comuna %s', c.una, c.varias, c.ninguna, c.sinLugar);
  Logger.log('  la figura que sale contra la del destino (misma fecha y lugar): igual %s | distinta %s | sin fila en el destino %s',
             c.igualDestino, c.distintaDestino, c.sinDestino);
  c.ejemplos.forEach(function (e) { Logger.log('    distinta: %s', e); });
  Logger.log('%s ms', Date.now() - t0);
  return c;
}

// ===================== PASO 35b — las desaparecidas y las reprogramaciones entre semanas (etapa 2) =====================

/**
 * Antes de que la agenda suspenda nada (regla 7 de la etapa 2), en el histórico de `DIAG_MAILS`, sólo lectura:
 *   a) las desaparecidas de la ventana, por si todavía eran FUTURAS cuando se mandó la versión que las dejó afuera
 *      (sólo ésas serían cancelación) o ya habían pasado ("Actualizo:" de mitad de semana), y por versión parcial
 *      (protección del 60%), contra el STATUS que tiene hoy su fila en el destino;
 *   b) las reprogramaciones ENTRE semanas: desaparecida sin reprogramar dentro de su semana + la misma figura en el
 *      mail de la semana siguiente a 7 días o menos. Si es frecuente, conviene vincularlas en vez de crear otra fila.
 * No escribe nada (ni solapas): sólo el log.
 */
function medirDesaparecidasAgenda() {
  Logger.log('=== medirDesaparecidasAgenda (paso 35b) — sólo lectura, no escribe nada ===');
  const dest = leerDestino_();
  const r = agendaDesdeMails_();
  const c = agendaCruce_(dest, r);
  const status = c.status;
  const cat = {};
  c.desap.forEach(function (d) {
    const k = d.ev.versionParcial ? 'versión parcial (no se suspende)' : (d.ev.futuraAlDesaparecer ? 'FUTURA al desaparecer (se suspendería)' : 'ya había pasado (NO es cancelación)');
    const st = d.fila ? (d.status || '(vacío)') : 'sin fila';
    (cat[k] = cat[k] || {})[st] = ((cat[k] || {})[st] || 0) + 1;
  });
  Logger.log('--- a) las %s desaparecidas de la ventana, por caso, contra el STATUS de su fila hoy ---', c.desap.length);
  Object.keys(cat).forEach(function (k) {
    Logger.log('  %s: %s', k, Object.keys(cat[k]).map(function (s) { return s + ' ' + cat[k][s]; }).join(' · '));
  });
  c.desap.forEach(function (d) {
    Logger.log('    %s %s | %s | %s | mail que la sacó %s | %s | fila %s %s', fmtFecha_(d.ev.fecha), d.ev.hora,
               d.ev.figuraFila || d.ev.tipo, d.ev.lugar, d.ev.mailQueLaSaco ? Utilities.formatDate(d.ev.mailQueLaSaco, RDV_TZ, 'dd/MM HH:mm') : '—',
               d.ev.versionParcial ? 'parcial' : (d.ev.futuraAlDesaparecer ? 'futura' : 'ya pasada'), d.fila ? d.fila.fila : '—', status(d.fila || { valores: [] }) || '');
  });
  Logger.log('  >>> lo que se espera si la regla 7 es correcta: las "futura" con fila están casi todas Suspendida o Reprogramada; ' +
             'las "ya pasada", Realizada.');
  // b) entre semanas
  const pares = [];
  c.desap.forEach(function (d) {
    const ev = d.ev;
    if (!ev.figuraFila || ev.ahora) return;    // sin figura, o reprogramada dentro de su semana
    const sig = r.unicas.filter(function (u) {
      return u.figuraFila === ev.figuraFila && u.desde && ev.hasta && u.desde > ev.hasta && u.fecha > ev.fecha && diasEntre_(u.fecha, ev.fecha) <= 7;
    });
    if (sig.length) pares.push({ d: d, u: sig[0] });
  });
  Logger.log('--- b) posibles reprogramaciones ENTRE semanas (desaparecida sin reprogramar + la misma figura en el mail de la ' +
             'semana siguiente, a 7 días o menos): %s de %s desaparecidas con figura ---', pares.length,
             c.desap.filter(function (d) { return d.ev.figuraFila; }).length);
  pares.forEach(function (x) {
    Logger.log('    %s | %s → %s | la vieja: %s | la nueva: %s', x.d.ev.figuraFila, fmtFecha_(x.d.ev.fecha), fmtFecha_(x.u.fecha),
               x.d.fila ? 'fila ' + x.d.fila.fila + ' ' + status(x.d.fila) : 'sin fila', x.u.cruce && x.u.cruce.fila ? 'fila ' + x.u.cruce.fila.fila : 'sin fila');
  });
  Logger.log('  >>> por defecto la agenda suspende la vieja y crea la nueva, y lista el par. Si son muchas, conviene vincularlas.');
  return { desaparecidas: c.desap.length, categorias: cat, entreSemanas: pares.length };
}


/**
 * Las solapas de MEDICIÓN de este archivo (06/10): si la intermedia no responde ni con los reintentos, la medición
 * no falla — los números ya están en el log, que se escribe antes.
 */
function _escribirMedicionAgenda_(nombre, matriz) {
  if (!MEDICION_ESCRIBE_SOLAPAS) {
    Logger.log('[agenda] la solapa de medición %s no se escribe (MEDICION_ESCRIBE_SOLAPAS = false; %s filas, todo en el log).',
               nombre, matriz.length - 1);
    return;
  }
  try { _escribirHojaAgenda_(nombre, matriz); }
  catch (err) { Logger.log('[agenda] la solapa de medición %s NO se escribió: %s (los números de arriba valen igual)', nombre, err); }
}
