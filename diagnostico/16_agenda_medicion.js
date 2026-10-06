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
const AGENDA_SOLAPA_GEOCODE = 'AGENDA_GEOCODE';
const AGENDA_SOLAPA_SEGURIDAD = 'AGENDA_SEGURIDAD';

/** Una reunión del mail sin fila a la fecha exacta busca la fila de su figura hasta ± estos días. */
const AGENDA_DIAS_REPROGRAMADA = 3;

/** Una última versión con menos de esta fracción de las reuniones de la versión anterior es sospechosa de parcial. */
const AGENDA_FRACCION_VERSION_PARCIAL = 0.6;

/** Tope de llamadas al geocodificador por corrida (la cache hace que la siguiente siga donde quedó). */
const GEOCODE_MAX_POR_CORRIDA = 450;
/** Corte propio por tiempo (Apps Script corta a los 6 minutos). */
const GEOCODE_CORTE_MS = 4.5 * 60 * 1000;
/** Sufijo de la consulta al geocodificador. */
const GEOCODE_SUFIJO = ', Ciudad Autónoma de Buenos Aires, Argentina';
/** Un punto fuera de todo polígono se asigna al barrio más cercano si está a menos de esto (grados, ~100 m). */
const GEOCODE_TOLERANCIA_BORDE = 0.001;

/** Las marcas conocidas del evento y del lugar (en el texto normalizado). */
const AGENDA_MARCAS = [
  { marca: 'NO PARTICIPA', re: /\bno participa\b/ },
  { marca: 'SOLO SE COMUNICA POR REDES', re: /\bsolo se comunica por redes\b/ },
  { marca: 'NO SE COMUNICA LA DIRECCION', re: /\bno se comunica (?:la )?direccion\b/ },
  { marca: 'A CONFIRMAR', re: /\ba confirmar\b/ }
];

/** Los tipos de reunión, en orden de prueba (el primero que matchea). */
const AGENDA_TIPOS = [
  { tipo: 'Seguridad en tu Barrio', re: /\bseguridad en tu barrio\b/ },
  { tipo: 'Encuentro "1 a 1"', re: /\bencuentro\s*["“”'«»]*\s*1\s*a\s*1\b\s*["“”'«»]*/ },
  { tipo: 'Encuentro Temático', re: /\bencuentro tematico\b/ },
  { tipo: 'Primera Persona', re: /\bprimera persona\b/ },
  { tipo: 'Café con Vecinos', re: /\bcafe con (?:los )?vecinos?\b/ },
  { tipo: 'Encuentro con Vecinos', re: /\bencuentros? con (?:los )?vecinos?\b/ }   // también el singular (06/10)
];

/**
 * Alias de barrio SÓLO para la agenda (06/10, usuario): "Montserrat" = "Monserrat". Se prueba la grafía que trae el
 * texto y, si Comunas no la reconoce, la otra: así funciona tenga Comunas la que tenga. No toca BARRIOS_VARIANTES.
 */
function _otraGrafiaBarrio_(s) {
  const t = String(s == null ? '' : s);
  if (/montserrat/i.test(t)) return t.replace(/montserrat/gi, 'Monserrat');
  if (/monserrat/i.test(t)) return t.replace(/monserrat/gi, 'Montserrat');
  return '';
}
function _canonBarrioAg_(s) { return canonizarBarrio_(s) || (_otraGrafiaBarrio_(s) ? canonizarBarrio_(_otraGrafiaBarrio_(s)) : ''); }
function _detectBarrioAg_(s) { return detectBarrio_(s) || (_otraGrafiaBarrio_(s) ? detectBarrio_(_otraGrafiaBarrio_(s)) : ''); }
function _comunaBarrioAg_(s) { return comunaDeBarrio_(_canonBarrioAg_(s) || s); }
function _subzonaBarrioAg_(s) { return subzonaDeBarrio_(_canonBarrioAg_(s) || s) || (_otraGrafiaBarrio_(s) ? subzonaDeBarrio_(_otraGrafiaBarrio_(s)) : ''); }

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
  _escribirHojaAgenda_(AGENDA_SOLAPA_MAIL, _filasAgendaMail_(r));
  _escribirHojaAgenda_(AGENDA_SOLAPA_DESAPARECIDAS, _filasDesaparecidas_(r));
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

/** Lo mismo, sobre una lista de mails `{ fecha: Date, asunto, cuerpo, truncado }` (lo usan los tests). */
function agendaDesdeListaDeMails_(lista, meta) {
  const r = { fuente: (meta && meta.fuente) || '', mails: lista.length, truncados: 0, sinSemana: [], semanas: [],
              ultimas: [], unicas: [], desaparecidas: [], parciales: [], tipos: {}, lineasRaras: {},
              eventosIncompletos: [], fueraDeSemana: [], fechasCorregidas: [], semanaOtraForma: [], imagenes: 0,
              sinFecha: 0, masNuevo: null };
  _agendaTolerancia_ = [];
  const grupos = new Map();
  lista.forEach(function (m) {
    if (m.truncado) r.truncados++;
    if (!r.masNuevo || m.fecha > r.masNuevo) r.masNuevo = m.fecha;
    const sem = _semanaAgenda_(m.asunto, m.cuerpo, m.fecha);
    if (!sem) { r.sinSemana.push(m.asunto); return; }
    if (sem.forma !== 'del … al …') r.semanaOtraForma.push(sem.forma + ': ' + m.asunto);
    const grupo = sem.grupo;
    const desde = sem.desde, hasta = sem.hasta;
    const k = normalizeText_(grupo) + '|' + ymd_(desde);
    if (!grupos.has(k)) grupos.set(k, { grupo: grupo, desde: desde, hasta: hasta, semanaTexto: sem.texto, versiones: [] });
    grupos.get(k).versiones.push(m);
  });

  grupos.forEach(function (g) {
    g.versiones.sort(function (a, b) { return a.fecha - b.fecha; });
    const parseadas = g.versiones.map(function (m, i) {
      return _parsearCuerpoAgenda_(m.cuerpo, m.fecha, r, { grupo: g.grupo, semana: g.semanaTexto, version: i + 1,
                                    versiones: g.versiones.length, mailFecha: m.fecha, asunto: m.asunto,
                                    desde: g.desde, hasta: g.hasta });
    });
    const n = parseadas.length, ultima = parseadas[n - 1];
    g.cantidades = parseadas.map(function (p) { return p.length; });
    if (n > 1 && parseadas[n - 2].length && ultima.length < parseadas[n - 2].length * AGENDA_FRACCION_VERSION_PARCIAL) {
      r.parciales.push({ g: g, cantidades: g.cantidades });
    }
    // Cambios contra la versión anterior (sólo las reuniones que estaban).
    const anterior = n > 1 ? _porClave_(parseadas[n - 2]) : new Map();
    ultima.forEach(function (ev) {
      const prev = anterior.get(ev.clave);
      ev.cambios = n === 1 ? '' : (prev ? _cambiosEntre_(prev, ev) : 'nueva en la última versión');
      r.ultimas.push(ev);
    });
    // Las que desaparecen: estaban en alguna versión anterior y no en la última.
    const enUltima = _porClave_(ultima);
    const vistas = new Map();
    for (let i = 0; i < n - 1; i++) parseadas[i].forEach(function (ev) { vistas.set(ev.clave, ev); });
    vistas.forEach(function (ev, clave) {
      if (enUltima.has(clave)) return;
      const misma = ultima.filter(function (u) { return ev.figuraFila && u.figuraFila === ev.figuraFila; });
      ev.ahora = misma.length ? misma.map(function (u) { return fmtFecha_(u.fecha) + ' ' + u.hora; }).join(' / ') : '';
      ev.ultimaVersionVista = ev.version;
      r.desaparecidas.push(ev);
    });
    r.semanas.push(g);
  });

  // Una reunión que figura en los mails de dos grupos la misma semana es UNA reunión.
  const unicas = new Map();
  r.ultimas.sort(function (a, b) { return (a.fecha - b.fecha) || String(a.hora).localeCompare(String(b.hora)); });
  r.ultimas.forEach(function (ev) {
    const k = ev.clave;
    const ya = unicas.get(k);
    if (!ya) { unicas.set(k, ev); ev.otrosGrupos = []; return; }
    ya.otrosGrupos.push(ev.grupo);
    ev.repetidaDe = ya.grupo;
    if (ev.mailFecha > ya.mailFecha) { ev.otrosGrupos = ya.otrosGrupos.concat([ya.grupo]); ev.repetidaDe = ''; ya.repetidaDe = ev.grupo; unicas.set(k, ev); }
  });
  unicas.forEach(function (ev) { r.unicas.push(ev); });
  r.semanas.sort(function (a, b) { return (a.desde || 0) - (b.desde || 0); });
  return r;
}

/**
 * La semana y el grupo de un mail (06/10). Del asunto, y si el asunto no los trae, de la línea "Asunto:" /
 * "Subject:" del cuerpo (un reenvío). Formas: "Semana del 13/07 al 18/07" (también con un mes de tres dígitos,
 * "02/002", y con puntos, "02.02"), y "Semana 15.12.2025" / "Semana del 15/12" (una sola fecha: la semana es esa
 * fecha + 6 días). El año, el más cercano a la fecha del mail. `null` si no hay semana.
 */
function _semanaAgenda_(asunto, cuerpo, fechaMail) {
  const F = '(\\d{1,2}\\s*\\/\\s*\\d{1,3}(?:\\s*\\/\\s*\\d{2,4})?)';
  const probar = function (texto) {
    const t = _sinPrefijos_diag3(texto).replace(/(\d)\s*\.\s*(\d)/g, '$1/$2');
    const g = /\bcon\s+(.+?)\s*[-–]?\s*semana\b/i.exec(t);
    const grupo = g ? g[1].replace(/[-–]\s*$/, '').trim() : '';
    let m = new RegExp('semana\\s+del\\s+' + F + '\\s+al\\s+' + F, 'i').exec(t);
    if (m) {
      const d = _fechaDiaMes_(m[1], fechaMail), h = _fechaDiaMes_(m[2], fechaMail);
      if (d && h) return { desde: d, hasta: h, texto: m[1].replace(/\s+/g, '') + ' al ' + m[2].replace(/\s+/g, ''), grupo: grupo,
                           forma: /\/\d{3}\b/.test(m[0]) ? 'mes de tres dígitos' : (/\d\.\d/.test(texto) ? 'con puntos' : 'del … al …') };
    }
    m = new RegExp('semana\\s+(?:del\\s+)?' + F, 'i').exec(t);
    if (m) {
      const d = _fechaDiaMes_(m[1], fechaMail);
      if (d) return { desde: d, hasta: alMediodia_(new Date(d.getTime() + 6 * 86400000).getFullYear(), new Date(d.getTime() + 6 * 86400000).getMonth() + 1,
                                                    new Date(d.getTime() + 6 * 86400000).getDate()),
                      texto: m[1].replace(/\s+/g, '') + ' (+6 días)', grupo: grupo, forma: 'una sola fecha' };
    }
    return null;
  };
  let sem = probar(asunto);
  if (sem && !sem.grupo) {
    const lin = /^\s*(?:asunto|subject)\s*:\s*(.+)$/im.exec(String(cuerpo || ''));
    const otra = lin ? probar(lin[1]) : null;
    if (otra && otra.grupo) sem.grupo = otra.grupo;
  }
  if (!sem) {
    const lin = /^\s*(?:asunto|subject)\s*:\s*(.+)$/im.exec(String(cuerpo || ''));
    if (lin) { sem = probar(lin[1]); if (sem) sem.forma = 'del asunto reenviado (' + sem.forma + ')'; }
  }
  if (sem && !sem.grupo) sem.grupo = '(sin grupo)';
  return sem;
}

/**
 * Las reuniones de UN cuerpo de mail. Línea por línea: el encabezado del día fija la fecha; "Evento:", "Hora:"
 * y "Lugar:" llenan la reunión en curso; una línea que no es ninguna de esas, inmediatamente después de un
 * campo, se toma como continuación de ese campo (el texto plano a veces corta líneas largas).
 */
function _parsearCuerpoAgenda_(cuerpo, fechaMail, r, meta) {
  const lineas = String(cuerpo || '').split(/\r?\n/);
  const out = [];
  let fecha = null, diaTexto = '', diaSemanaNum = null, diaNum = null, ev = null, campo = null;
  const cerrar = function () {
    if (!ev) return;
    _completarReunion_(ev);
    if (!ev.fecha) r.sinFecha++;
    if (!ev.hora) r.eventosIncompletos.push('sin hora: ' + ev.eventoTexto);
    if (ev.fecha && ev.fueraDeSemana) r.fueraDeSemana.push(ev);
    if (ev.fechaCorregida) r.fechasCorregidas.push(ev);
    out.push(ev);
    ev = null; campo = null;
  };
  for (let i = 0; i < lineas.length; i++) {
    const limpia = _limpiarLineaAgenda_(lineas[i]);
    if (/^\[image:/i.test(limpia)) { r.imagenes++; continue; }   // una imagen no es parte de ningún campo (06/10)
    if (!limpia) { campo = null; continue; }
    const dia = /^(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s*,?\s*(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\s*[.:]?$/
      .exec(normalizeText_(limpia));
    if (dia) {
      cerrar();
      fecha = _fechaDiaMes_(dia[2] + '/' + dia[3], fechaMail);
      diaTexto = limpia;
      diaSemanaNum = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'].indexOf(dia[1]);
      diaNum = +dia[2];
      continue;
    }
    const etiqueta = /^\s*(evento|hora|lugar|direcci[oó]n)\s*:\s*(.*)$/i.exec(limpia);
    if (etiqueta) {
      const e = normalizeText_(etiqueta[1]), valor = etiqueta[2].trim();
      if (e === 'evento') {
        cerrar();
        ev = Object.assign({ fecha: fecha, diaTexto: diaTexto, diaSemanaNum: diaSemanaNum, diaNum: diaNum,
                             eventoTexto: valor, horaTexto: '', lugarTexto: '' }, meta);
        campo = 'eventoTexto';
      } else if (ev) {
        const k = e === 'hora' ? 'horaTexto' : 'lugarTexto';
        ev[k] = ev[k] ? ev[k] + ' ' + valor : valor;
        campo = k;
      }
      continue;
    }
    if (ev && campo) { ev[campo] += ' ' + limpia; continue; }
    // Una línea con forma "Algo: …" que no se reconoce, dentro del bloque de la agenda: se cuenta por su forma.
    if (fecha && /^[^:]{2,25}:/.test(limpia)) {
      const forma = normalizeText_(limpia.split(':')[0]) + ':';
      r.lineasRaras[forma] = (r.lineasRaras[forma] || 0) + 1;
    }
  }
  cerrar();
  // La clave de cada reunión, única dentro de esta versión (Macri puede tener 2+ el mismo día: se suma la hora).
  const vistas = {};
  out.forEach(function (x) {
    let k = x.claveBase;
    if (vistas[k]) k += '|' + x.hora;
    vistas[x.claveBase] = true;
    x.clave = k;
  });
  return out;
}

/** Saca viñetas, asteriscos y guiones bajos de negrita/itálica, y espacios raros. */
function _limpiarLineaAgenda_(s) {
  return String(s || '').replace(/[\u00A0\u200B\uFEFF]/g, ' ').replace(/[*_]/g, '')
    .replace(/^\s*(?:[-•·>]\s*)+/, '').replace(/\s+/g, ' ').trim();
}

/**
 * Completa una reunión a partir de los textos de Evento, Hora y Lugar: tipo, figuras (las que participan y las
 * que no), conjunta, lugar (comuna / eje / barrio), dirección, marcas, la clave y si cae fuera de la semana del
 * asunto (restricción interna del propio mail: no necesita otra fuente).
 */
function _completarReunion_(ev) {
  const n = normalizeText_(ev.eventoTexto);
  // Tipo
  ev.tipo = '';
  let sinTipo = n;
  for (let i = 0; i < AGENDA_TIPOS.length; i++) {
    const m = AGENDA_TIPOS[i].re.exec(n);
    if (m) { ev.tipo = AGENDA_TIPOS[i].tipo; sinTipo = n.slice(0, m.index) + ' '.repeat(m[0].length) + n.slice(m.index + m[0].length); break; }
  }
  // Marcas (del evento y del lugar)
  const marcas = [];
  const nl = normalizeText_(ev.lugarTexto);
  AGENDA_MARCAS.forEach(function (x) {
    if (x.marca === 'NO PARTICIPA') return;
    if (x.re.test(n) || x.re.test(nl)) marcas.push(x.marca + (x.re.test(n) ? '' : ' (lugar)'));
  });
  // Figuras con su posición, en el orden en que se nombran
  const figs = _figurasConPosicion_(sinTipo);
  const noPart = [];
  const reNP = /\bno participa\b/g;
  let mnp;
  while ((mnp = reNP.exec(n)) !== null) {
    let mejor = null;
    figs.forEach(function (f) { if (f.fin <= mnp.index && (!mejor || f.fin > mejor.fin)) mejor = f; });
    if (!mejor) mejor = figs.filter(function (f) { return f.pos >= mnp.index; })[0] || null;
    if (mejor && noPart.indexOf(mejor.canon) < 0) noPart.push(mejor.canon);
  }
  ev.figuras = figs.map(function (f) { return f.canon; });
  ev.noParticipa = noPart;
  ev.participan = ev.figuras.filter(function (f) { return noPart.indexOf(f) < 0; });
  ev.figuraFila = ev.figuras[0] || '';
  ev.conjunta = ev.figuras.length >= 2;
  // Ubicación: lo que queda después de la última figura (sin el tipo, las marcas ni los paréntesis)
  let resto = sinTipo;
  figs.forEach(function (f) { resto = resto.slice(0, f.pos) + ' '.repeat(f.fin - f.pos) + resto.slice(f.fin); });
  const ultimoFin = figs.reduce(function (a, f) { return Math.max(a, f.fin); }, 0);
  let tramo = resto.slice(ultimoFin);
  AGENDA_MARCAS.forEach(function (x) { tramo = tramo.replace(new RegExp(x.re.source, 'g'), ' '); });
  tramo = tramo.replace(/[()"“”]/g, ' ');
  ev.comuna = detectComuna_(tramo);
  ev.subzona = ev.comuna === 1 ? detectSubzonaComuna1_(tramo) : null;
  const eje = detectEje_(tramo);
  ev.eje = eje ? (eje.eje || eje.forma) : '';
  const segmentos = tramo.split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean);
  ev.barrio = '';
  for (let i = segmentos.length - 1; i >= 0 && !ev.barrio; i--) ev.barrio = _detectBarrioAg_(segmentos[i]);
  if (ev.comuna != null) { ev.lugarTipo = 'comuna'; ev.lugar = 'Comuna ' + ev.comuna + (ev.subzona ? ' ' + ev.subzona : ''); }
  else if (ev.eje) { ev.lugarTipo = 'eje'; ev.lugar = 'Eje ' + ev.eje; }
  else if (ev.barrio) { ev.lugarTipo = 'barrio'; ev.lugar = ev.barrio; }
  else { ev.lugarTipo = ''; ev.lugar = ''; }
  // Hora
  ev.hora = _horaAgenda_(ev.horaTexto);
  // Dirección: "calle número, nombre del lugar"; "A CONFIRMAR" no es dirección.
  const lugar = str(ev.lugarTexto);
  ev.direccionAConfirmar = /\ba confirmar\b|\bno se comunica\b/.test(nl);
  if (!lugar || ev.direccionAConfirmar) { ev.direccion = ''; ev.nombreLugar = ''; }
  else {
    const partes = lugar.split(',');
    if (/\d/.test(partes[0])) { ev.direccion = partes[0].trim(); ev.nombreLugar = partes.slice(1).join(',').trim(); }
    else { ev.direccion = ''; ev.nombreLugar = lugar; }
  }
  ev.marcas = marcas;
  // Fuera de la semana del asunto. Si el encabezado del día dice una fecha que cae fuera ("Lunes 13/06" en la semana
  // del 13/07 al 18/07: casi siempre el mes mal tipeado), se corrige al día de ESA semana con el mismo día de la
  // semana y el mismo número de día, si hay exactamente uno. Se registra (06/10, usuario).
  const fuera = function (f) { return !!(f && ev.desde && ev.hasta && (f < ev.desde || f > ev.hasta)); };
  ev.fechaCorregida = '';
  if (fuera(ev.fecha) && ev.diaSemanaNum != null && ev.diaSemanaNum >= 0) {
    const cands = [];
    for (let t = ev.desde.getTime(); t <= ev.hasta.getTime() + 3600000; t += 86400000) {
      const d = new Date(t);
      if (d.getDay() === ev.diaSemanaNum && d.getDate() === ev.diaNum) cands.push(alMediodia_(d.getFullYear(), d.getMonth() + 1, d.getDate()));
    }
    if (cands.length === 1) {
      ev.fechaCorregida = ev.diaTexto + ' → ' + fmtFecha_(cands[0]) + ' (semana del ' + ev.semana + ')';
      ev.fechaOriginal = ev.fecha;
      ev.fecha = cands[0];
    }
  }
  ev.fueraDeSemana = fuera(ev.fecha);
  // Clave: figura de la fila + fecha; sin figura, tipo + fecha + lugar
  const f = ev.fecha ? ymd_(ev.fecha) : 'sin_fecha';
  ev.claveBase = ev.figuraFila ? normalizeText_(ev.figuraFila) + '|' + f
                               : 'sin_figura|' + normalizeText_(ev.tipo) + '|' + f + '|' + normalizeText_(ev.lugar);
  return ev;
}

/**
 * Las figuras del destino nombradas en un texto ya normalizado, con su posición: nombre completo, variante
 * (FIGURAS_VARIANTES) o apellido único — el mismo criterio que figurasEnTexto_, pero sólo figuras simples (una
 * entrada "A - B" del destino no cuenta: la conjunta es UNA fila a nombre de la primera, regla 3) y sin
 * solapamientos (de dos nombres que se pisan, gana el más largo).
 */
function _figurasConPosicion_(t) {
  const hallados = [];
  const tomar = function (canon, pos, fin) {
    if (!canon) return;
    if (hallados.some(function (h) { return pos < h.fin && fin > h.pos; })) return;
    hallados.push({ canon: canon, pos: pos, fin: fin });
  };
  const buscar = function (re) { const m = re.exec(t); return m ? { pos: m.index + (m[1] ? m[0].indexOf(m[1]) : 0), fin: m.index + m[0].length } : null; };
  _listas_().figuras.forEach(function (f) {
    if (/[-,\/+&]| y /.test(f.norm)) return;
    const m = buscar(new RegExp('(?:^|[^a-z0-9])(' + _escapeRe_(f.norm) + ')(?![a-z0-9])'));
    if (m) tomar(f.canon, m.pos, m.pos + f.norm.length);
  });
  if (typeof FIGURAS_VARIANTES !== 'undefined') {
    FIGURAS_VARIANTES.forEach(function (v) {
      const m = v.re.exec(t);
      if (m) tomar(_canonFiguraDestino_(v.canon), m.index, m.index + m[0].length);
    });
  }
  if (FIGURA_POR_APELLIDO) {
    _apellidosUnicos_().forEach(function (canon, ap) {
      if (hallados.some(function (h) { return h.canon === canon; })) return;
      const m = buscar(new RegExp('(?:^|[^a-z0-9])(' + _escapeRe_(ap) + ')(?![a-z0-9])'));
      if (m) tomar(canon, m.pos, m.pos + ap.length);
    });
  }
  // Tolerancia de tipeo, SÓLO para la agenda ("Maxiliano Piñeiro", "Baistocchi"): el nombre completo de una
  // figura simple con cada palabra a distancia de edición chica, o su apellido único a distancia 1. No toca
  // FIGURAS_VARIANTES ni figurasEnTexto_ (el matcher del upsert). Cada caso queda en `porTolerancia` para el log.
  const palabras = [];
  const reP = /[a-z0-9]+/g;
  let mp;
  while ((mp = reP.exec(t)) !== null) palabras.push({ w: mp[0], pos: mp.index, fin: mp.index + mp[0].length });
  const libre = function (p) { return !hallados.some(function (h) { return p.pos < h.fin && p.fin > h.pos; }); };
  const tope = function (w) { return w.length >= 8 ? 2 : (w.length >= 5 ? 1 : 0); };
  _listas_().figuras.forEach(function (f) {
    if (/[-,\/+&]| y /.test(f.norm) || hallados.some(function (h) { return h.canon === f.canon; })) return;
    const tk = f.norm.split(/\s+/);
    for (let i = 0; i + tk.length <= palabras.length; i++) {
      const tramo = palabras.slice(i, i + tk.length);
      if (!tramo.every(libre)) continue;
      let total = 0, ok = true;
      for (let j = 0; j < tk.length && ok; j++) {
        const d = _levenshtein_(tramo[j].w, tk[j]);
        if (d > tope(tk[j])) ok = false;
        total += d;
      }
      if (ok && total > 0 && total <= 3) {
        tomar(f.canon, tramo[0].pos, tramo[tramo.length - 1].fin);
        _agendaTolerancia_.push(tramo.map(function (p) { return p.w; }).join(' ') + ' → ' + f.canon);
        return;
      }
    }
  });
  if (FIGURA_POR_APELLIDO) {
    _apellidosUnicos_().forEach(function (canon, ap) {
      if (ap.length < 7 || hallados.some(function (h) { return h.canon === canon; })) return;
      const p = palabras.filter(function (x) { return libre(x) && _levenshtein_(x.w, ap) === 1; })[0];
      if (p) { tomar(canon, p.pos, p.fin); _agendaTolerancia_.push(p.w + ' → ' + canon + ' (apellido)'); }
    });
  }
  // Una figura nombrada dos veces cuenta una vez, en su primera posición.
  const vistos = {};
  return hallados.sort(function (a, b) { return a.pos - b.pos; })
    .filter(function (h) { if (vistos[h.canon]) return false; vistos[h.canon] = true; return true; });
}

/** Los nombres reconocidos por tolerancia de tipeo en la corrida (para el log). */
var _agendaTolerancia_ = [];

/** Distancia de edición (Levenshtein). */
function _levenshtein_(a, b) {
  if (a === b) return 0;
  let prev = [];
  for (let j = 0; j <= b.length; j++) prev.push(j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** "18:30h", "18.30 hs", "18 hs" → "18:30" / "18:00"; '' si no hay hora. */
function _horaAgenda_(texto) {
  const t = str(texto);
  let m = /(\d{1,2})\s*[:.]\s*(\d{2})/.exec(t);
  if (m && +m[1] < 24 && +m[2] < 60) return ('0' + (+m[1])).slice(-2) + ':' + m[2];
  m = /\b(\d{1,2})\s*(?:h|hs|horas)\b/i.exec(t);
  if (m && +m[1] < 24) return ('0' + (+m[1])).slice(-2) + ':00';
  return '';
}

/**
 * "dd/mm" con el año inferido de la fecha del mail: de los tres años posibles (el del mail, el anterior y el
 * siguiente), el que deja la fecha más cerca del mail. Cubre la agenda de fin de diciembre que nombra el 3 de
 * enero (el legado tomaba el año en curso y la mandaba un año atrás).
 */
function _fechaDiaMes_(texto, fechaMail) {
  const m = /(\d{1,2})\s*\/\s*(\d{1,3})(?:\s*\/\s*(\d{2,4}))?/.exec(str(texto));
  if (!m) return null;
  const d = +m[1], mo = +m[2];
  if (m[3]) { let y = +m[3]; if (y < 100) y += 2000; return alMediodia_(y, mo, d); }
  const base = fechaMail instanceof Date ? fechaMail : new Date();
  const y0 = base.getFullYear();
  let mejor = null;
  [y0 - 1, y0, y0 + 1].forEach(function (y) {
    const f = alMediodia_(y, mo, d);
    if (f && (!mejor || Math.abs(f - base) < Math.abs(mejor - base))) mejor = f;
  });
  return mejor;
}

function _porClave_(lista) {
  const m = new Map();
  lista.forEach(function (ev) { m.set(ev.clave, ev); });
  return m;
}

/** Qué cambió de una versión a la otra: hora, dirección, lugar. '' si nada. */
function _cambiosEntre_(a, b) {
  const c = [];
  if (a.hora !== b.hora) c.push('hora ' + (a.hora || '—') + ' → ' + (b.hora || '—'));
  if (normalizeText_(a.direccion) !== normalizeText_(b.direccion) ||
      a.direccionAConfirmar !== b.direccionAConfirmar) {
    c.push('dirección ' + (a.direccion || (a.direccionAConfirmar ? 'A CONFIRMAR' : '—')) + ' → ' +
           (b.direccion || (b.direccionAConfirmar ? 'A CONFIRMAR' : '—')));
  }
  if (a.lugar !== b.lugar) c.push('lugar ' + (a.lugar || '—') + ' → ' + (b.lugar || '—'));
  return c.join('; ');
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
  const sh = ssIntermedia_().getSheetByName(DIAG3_SALIDA);
  if (!sh || sh.getLastRow() < 2) throw new Error('No hay "' + DIAG3_SALIDA + '" en la intermedia: correr rehacer_diagMuestrasMail() primero.');
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

function _diaSemanaAgenda_(f) {
  return ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][f.getDay()];
}

/**
 * Escribe una solapa de la intermedia EN TANDAS, cada una con reintento (06/10: AGENDA_BARRIO_DIRECCION se cortó con
 * "Service Spreadsheets timed out" escribiéndose de una vez). `clearContents`, nunca `clear`. Una tanda que falla dos
 * veces corta con error: la solapa queda a medias, pero el log ya tiene los números (se loguea antes de escribir).
 */
const AGENDA_FILAS_POR_TANDA = 300;
function _escribirHojaAgenda_(nombre, matriz) {
  const intentar = function (que, fn) {
    for (let intento = 1; ; intento++) {
      try { return fn(); } catch (err) {
        Logger.log('[agenda] %s: %s falló (intento %s): %s', nombre, que, intento, err);
        if (intento >= 3) throw err;
        Utilities.sleep(4000 * intento);
        _ssIntermedia_ = null;
      }
    }
  };
  const sh = intentar('abrir', function () {
    const ss = ssIntermedia_();
    const h = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
    h.clearContents();
    return h;
  });
  const ancho = matriz[0].length;
  for (let i = 0; i < matriz.length; i += AGENDA_FILAS_POR_TANDA) {
    const tanda = matriz.slice(i, i + AGENDA_FILAS_POR_TANDA);
    intentar('tanda ' + (i / AGENDA_FILAS_POR_TANDA + 1), function () {
      sh.getRange(i + 1, 1, tanda.length, ancho).setValues(tanda);
      SpreadsheetApp.flush();
    });
  }
  try { sh.setFrozenRows(1); } catch (e) { /* no importa */ }
  Logger.log('[agenda] %s: %s filas', nombre, matriz.length - 1);
  return sh;
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
  _escribirHojaAgenda_(AGENDA_SOLAPA_CRUCE, c.filasCruce);
  _escribirHojaAgenda_(AGENDA_SOLAPA_SIN_MAIL, c.filasSinMail);
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

function _minHoraAgenda_(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  return m ? +m[1] * 60 + +m[2] : null;
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

function _pctAgenda_(a, b) { return b ? Math.round(1000 * a / b) / 10 : 0; }

function _repartoAgenda_(lista, fn) {
  const c = {};
  lista.forEach(function (x) { const k = fn(x); c[k] = (c[k] || 0) + 1; });
  return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).map(function (k) { return k + ' ' + c[k]; }).join(' · ') || '—';
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
  _agregarCacheGeocode_(nuevas);

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
  _escribirHojaAgenda_(AGENDA_SOLAPA_BARRIO, filas);
  Logger.log('%s ms', Date.now() - t0);
  return { evaluadas: evaluadas, exacto: c.exacto, ubicadas: ubicadas, pendientes: c.pendientes, llamadas: c.llamadas,
           regla: { universo: c.regla.universo, cumple: c.regla.cumple, exacto: c.regla.exacto, seEscribirian: c.regla.seEscribirian } };
}

/**
 * La regla de confianza del barrio desde la dirección (punto 4): (a) geocodificación "ok" y (b) el barrio del
 * polígono en la misma comuna que trae el mail, o el mismo barrio que trae el mail. (c), la celda vacía, se mira
 * al escribir. Devuelve `{ cumple, por }` o `{ cumple: false, motivo }`.
 */
function _reglaBarrio_(res, ev) {
  if (!ev) return { cumple: false, motivo: 'sin reunión del mail' };
  if (res.estado !== 'ok') return { cumple: false, motivo: '(a) geocodificación ' + res.estado };
  const mismoBarrio = !!ev.barrio && normalizeText_(_canonBarrioAg_(ev.barrio) || ev.barrio) === normalizeText_(res.barrio);
  if (mismoBarrio) return { cumple: true, por: 'mismo barrio que el mail' };
  if (ev.comuna != null) {
    return res.comuna === ev.comuna ? { cumple: true, por: 'misma comuna que el mail' }
                                     : { cumple: false, motivo: '(b) otra comuna que la del mail' };
  }
  if (ev.barrio) return { cumple: false, motivo: '(b) otro barrio que el del mail' };
  return { cumple: false, motivo: '(b) el mail no trae comuna ni barrio' + (ev.eje ? ' (trae eje)' : '') };
}

/** ¿No es una dirección? Un link, o un texto sin ningún número en "calle número" (sólo el nombre del lugar). */
function _noEsDireccion_(dir) {
  const t = str(dir);
  if (/https?:\/\/|www\.|goo\.gl|maps\.app/i.test(t)) return true;
  return !/\d/.test(_calleNumero_(t));
}

/** "calle número": lo anterior a la primera coma si tiene un número; si no, el texto entero. */
function _calleNumero_(dir) {
  const partes = str(dir).split(',');
  return (/\d/.test(partes[0]) ? partes[0].trim() : str(dir)).replace(/\s+/g, ' ');
}

/** La consulta al geocodificador: "calle número" (lo anterior a la primera coma si tiene un número) + el sufijo. */
function _consultaGeocode_(dir) {
  return _calleNumero_(dir) + GEOCODE_SUFIJO;
}

/**
 * Una llamada a Maps.newGeocoder(), región "ar" y en castellano; con `conLimites` (lo normal), sesgada al rectángulo
 * de la Ciudad. Nunca tira: los errores vuelven como estado 'ERROR'.
 */
function _geocodificar_(consulta, conLimites) {
  const g = { consulta: consulta, estado: '', lat: '', lng: '', tipo: '', parcial: false, barrioGoogle: '', formateada: '', detalle: '',
              fecha: Utilities.formatDate(new Date(), RDV_TZ, 'yyyy-MM-dd HH:mm') };
  try {
    let geo = Maps.newGeocoder().setRegion('ar').setLanguage('es');
    if (conLimites !== false) geo = geo.setBounds(-34.71, -58.54, -34.52, -58.33);
    const resp = geo.geocode(consulta);
    g.estado = resp.status || '';
    const res = resp.results && resp.results[0];
    if (res) {
      g.lat = res.geometry.location.lat; g.lng = res.geometry.location.lng;
      g.tipo = res.geometry.location_type || '';
      g.parcial = !!res.partial_match;
      g.formateada = res.formatted_address || '';
      g.componentes = JSON.stringify((res.address_components || []).map(function (a) { return [a.long_name, a.types || []]; }));
      (res.address_components || []).forEach(function (a) {
        if (g.barrioGoogle) return;
        if ((a.types || []).some(function (t) { return t === 'neighborhood' || t === 'sublocality_level_1' || t === 'sublocality'; })) g.barrioGoogle = a.long_name;
      });
    }
  } catch (e) {
    g.estado = 'ERROR'; g.detalle = String(e && e.message || e);
  }
  return g;
}

/**
 * El barrio de una geocodificación: punto en polígono. Estados: 'ok' (exacta: ROOFTOP / RANGE_INTERPOLATED),
 * 'aproximada' (GEOMETRIC_CENTER / APPROXIMATE: Google no encontró la altura), 'borde' (fuera de todo polígono
 * pero a menos de GEOCODE_TOLERANCIA_BORDE de uno), 'fuera_de_caba', 'sin_resultado', 'error'. 'aproximada'
 * igual se ubica (se cuenta aparte): con un centro de calle, el barrio puede salir bien o no.
 */
function _barrioDeGeo_(g, poligonos) {
  if (g.estado === 'ERROR') return { estado: 'error', barrio: '', comuna: null };
  if (g.estado !== 'OK' || g.lat === '' || g.lat == null) return { estado: 'sin_resultado', barrio: '', comuna: null };
  const lat = Number(g.lat), lng = Number(g.lng);
  const aprox = g.tipo === 'APPROXIMATE' || g.tipo === 'GEOMETRIC_CENTER';
  let p = _barrioEnPunto_(lng, lat, poligonos);
  if (p) return { estado: aprox ? 'aproximada' : (g.parcial ? 'ok_parcial' : 'ok'), barrio: p.barrio, comuna: p.comuna };
  p = _barrioMasCercano_(lng, lat, poligonos);
  if (p && p.dist <= GEOCODE_TOLERANCIA_BORDE) return { estado: 'borde', barrio: p.barrio, comuna: p.comuna };
  return { estado: 'fuera_de_caba', barrio: '', comuna: null };
}

/** Los polígonos con el nombre canonizado contra Comunas (el del dataset si Comunas no lo reconoce). */
function _poligonosBarrios_() {
  const noReconocidos = [];
  const out = BARRIOS_CABA_GEO.map(function (b) {
    const canon = _canonBarrioAg_(b.nombre) || _detectBarrioAg_(b.nombre);
    if (!canon) noReconocidos.push(b.nombre);
    let minX = 999, minY = 999, maxX = -999, maxY = -999;
    b.anillos.forEach(function (a) {
      for (let i = 0; i < a.length; i += 2) { minX = Math.min(minX, a[i]); maxX = Math.max(maxX, a[i]); minY = Math.min(minY, a[i + 1]); maxY = Math.max(maxY, a[i + 1]); }
    });
    return { barrio: canon || b.nombre, comuna: b.comuna, anillos: b.anillos, caja: [minX, minY, maxX, maxY] };
  });
  if (noReconocidos.length) Logger.log('  AVISO: barrios del dataset que Comunas no reconoce (quedan con el nombre del dataset): %s', noReconocidos.join(', '));
  return out;
}

/** Punto en polígono por paridad (los huecos se restan solos). */
function _barrioEnPunto_(x, y, poligonos) {
  for (let k = 0; k < poligonos.length; k++) {
    const b = poligonos[k], cj = b.caja;
    if (x < cj[0] || x > cj[2] || y < cj[1] || y > cj[3]) continue;
    let adentro = false;
    b.anillos.forEach(function (a) {
      const n = a.length / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = a[2 * i], yi = a[2 * i + 1], xj = a[2 * j], yj = a[2 * j + 1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) adentro = !adentro;
      }
    });
    if (adentro) return b;
  }
  return null;
}

/** El barrio con el borde más cercano al punto, y la distancia (en grados). */
function _barrioMasCercano_(x, y, poligonos) {
  let mejor = null;
  poligonos.forEach(function (b) {
    b.anillos.forEach(function (a) {
      const n = a.length / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const x1 = a[2 * j], y1 = a[2 * j + 1], x2 = a[2 * i], y2 = a[2 * i + 1];
        const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
        let t = L ? ((x - x1) * dx + (y - y1) * dy) / L : 0;
        t = Math.max(0, Math.min(1, t));
        const ex = x1 + t * dx - x, ey = y1 + t * dy - y, d = Math.sqrt(ex * ex + ey * ey);
        if (!mejor || d < mejor.dist) mejor = { barrio: b.barrio, comuna: b.comuna, dist: d };
      }
    });
  });
  return mejor;
}

const GEOCODE_ENCABEZADO = ['consulta', 'estado', 'lat', 'lng', 'tipo_ubicacion', 'parcial', 'barrio_google', 'direccion_google', 'detalle', 'fecha',
                            'componentes'];

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

function _leerCacheGeocode_() {
  const m = new Map();
  const sh = ssIntermedia_().getSheetByName(AGENDA_SOLAPA_GEOCODE);
  if (!sh || sh.getLastRow() < 2) return m;
  sh.getRange(2, 1, sh.getLastRow() - 1, GEOCODE_ENCABEZADO.length).getValues().forEach(function (v) {
    if (!str(v[0]) || v[1] === 'ERROR') return;   // un error no se cachea: se vuelve a intentar
    m.set(str(v[0]), { consulta: str(v[0]), estado: str(v[1]), lat: v[2], lng: v[3], tipo: str(v[4]),
                       parcial: String(v[5]).toUpperCase() === 'TRUE', barrioGoogle: str(v[6]), formateada: str(v[7]),
                       detalle: str(v[8]), componentes: str(v[10]) });
  });
  return m;
}

/** Agrega al final de la cache lo geocodificado en esta corrida (la intermedia; la crea si no existe). */
function _agregarCacheGeocode_(nuevas) {
  if (!nuevas.length) return;
  const ss = ssIntermedia_();
  let sh = ss.getSheetByName(AGENDA_SOLAPA_GEOCODE);
  if (!sh) { sh = ss.insertSheet(AGENDA_SOLAPA_GEOCODE); sh.getRange(1, 1, 1, GEOCODE_ENCABEZADO.length).setValues([GEOCODE_ENCABEZADO]); sh.setFrozenRows(1); }
  const filas = nuevas.map(function (g) {
    return [g.consulta, g.estado, g.lat, g.lng, g.tipo, g.parcial ? 'TRUE' : 'FALSE', g.barrioGoogle, g.formateada, g.detalle, g.fecha,
            g.componentes || ''];
  });
  sh.getRange(sh.getLastRow() + 1, 1, filas.length, GEOCODE_ENCABEZADO.length).setValues(filas);
  Logger.log('[agenda] %s: %s geocodificaciones nuevas en la cache', AGENDA_SOLAPA_GEOCODE, filas.length);
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
  _escribirHojaAgenda_(AGENDA_SOLAPA_SEGURIDAD, filas);
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
