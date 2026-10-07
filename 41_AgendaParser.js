/**
 * 41_AgendaParser.js — el parser de los mails de agenda y el barrio desde la dirección (06/10, Agenda etapa 2).
 *
 * Es el parser de la etapa 1 (medición, `diagnostico/16_agenda_medicion.js`), MOVIDO tal cual a código de
 * producción para que lo use `40_Agenda.js` (crear y actualizar filas del destino). No escribe en el destino:
 * parsea mails, ubica direcciones y decide la regla de confianza del barrio. Las mediciones siguen en
 * `diagnostico/16`. Prompts: docs/prompts/PROMPT-05-… (etapa 1) y PROMPT-06-… (etapa 2).
 *
 *   - mails → reuniones: la última versión de cada semana + grupo, las que desaparecen, los cambios entre versiones,
 *     la fecha mal escrita corregida a la semana del asunto, la tolerancia de nombres;
 *   - dirección → barrio: Maps.newGeocoder (con cache en AGENDA_GEOCODE, intermedia) y punto en polígono con los
 *     límites oficiales (`42_BarriosCabaGeo.js`); la REGLA DE CONFIANZA (`_reglaBarrio_`), con el margen de borde.
 */

/** El asunto sin "Re:" / "Fwd:" / "RV:" ni espacios de más (la misma limpieza que diagnostico/03). */
function _sinPrefijosAsunto_(asunto) {
  return String(asunto || '')
    .replace(/^((re|rv|fwd|fw)\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const AGENDA_SOLAPA_GEOCODE = 'AGENDA_GEOCODE';
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

/** Lo mismo, sobre una lista de mails `{ fecha: Date, asunto, cuerpo, truncado }` (lo usan los tests). */
function agendaDesdeListaDeMails_(lista, meta) {
  const r = { fuente: (meta && meta.fuente) || '', mails: lista.length, truncados: 0, sinSemana: [], semanas: [],
              ultimas: [], unicas: [], desaparecidas: [], parciales: [], tipos: {}, lineasRaras: {},
              eventosIncompletos: [], fueraDeSemana: [], fechasCorregidas: [], semanaOtraForma: [], imagenes: 0,
              sinFecha: 0, masNuevo: null };
  _agendaTolerancia_ = [];
  const grupos = new Map();
  r.citasCortadas = 0; r.reenvios = 0; r.respuestasSinAgenda = [];
  lista = lista.map(function (m) {
    // 07/10: en un "Re:" el cuerpo trae el mail anterior CITADO (y _limpiarLineaAgenda_ le saca el ">"): se lee sólo lo
    // propio. En un reenvío, la agenda del mensaje reenviado, una vez.
    const propio = _cuerpoPropioAgenda_(m.asunto, m.cuerpo);
    if (propio.corte === 'cita') r.citasCortadas++;
    if (propio.corte === 'reenvio') r.reenvios++;
    return propio.corte ? Object.assign({}, m, { cuerpo: propio.texto, cuerpoCompleto: m.cuerpo, corte: propio.corte }) : m;
  });
  lista.forEach(function (m) {
    if (m.truncado) r.truncados++;
    if (!r.masNuevo || m.fecha > r.masNuevo) r.masNuevo = m.fecha;
    const sem = _semanaAgenda_(m.asunto, m.cuerpoCompleto || m.cuerpo, m.fecha);   // la semana, también del encabezado del reenviado
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
    // Una respuesta sin agenda propia (sólo "ok" arriba de la cita) no es una versión: si contara, todo "desaparecería".
    g.versiones = g.versiones.filter(function (m) {
      if (!m.corte) return true;
      const propias = _parsearCuerpoAgenda_(m.cuerpo, m.fecha, _rVacio_(), { grupo: g.grupo, semana: g.semanaTexto, version: 0,
        versiones: 0, mailFecha: m.fecha, asunto: m.asunto, mailId: m.id || '', desde: g.desde, hasta: g.hasta });
      if (propias.length) return true;
      r.respuestasSinAgenda.push(m.asunto + ' | ' + fmtFecha_(m.fecha));
      return false;
    });
    if (!g.versiones.length) return;
    const parseadas = g.versiones.map(function (m, i) {
      return _parsearCuerpoAgenda_(m.cuerpo, m.fecha, r, { grupo: g.grupo, semana: g.semanaTexto, version: i + 1,
                                    versiones: g.versiones.length, mailFecha: m.fecha, asunto: m.asunto, mailId: m.id || '',
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
      // La versión que la dejó afuera es la siguiente a la última en la que estaba (06/10, regla 7 de la etapa 2):
      // sólo cuenta como desaparecida si la reunión todavía era FUTURA cuando se mandó ese mail. Un "Actualizo:" de
      // mitad de semana que ya no lista los días que pasaron no es una cancelación.
      const saco = g.versiones[ev.version] || null;
      ev.mailQueLaSaco = saco ? saco.fecha : null;
      ev.futuraAlDesaparecer = !!(ev.fecha && saco && ymd_(ev.fecha) >= ymd_(saco.fecha));
      ev.versionParcial = r.parciales.some(function (x) { return x.g === g; });
      r.desaparecidas.push(ev);
    });
    r.semanas.push(g);
  });

  // Una reunión que figura en los mails de dos grupos la misma semana es UNA reunión (07/10: por figura + fecha + hora,
  // no por la clave de cada mail, que cambia si un grupo trae dos reuniones de la figura ese día).
  r.ultimas.sort(function (a, b) { return (a.fecha - b.fecha) || String(a.hora).localeCompare(String(b.hora)); });
  r.unicas = _unificarEntreGrupos_(r.ultimas);
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
    const t = _sinPrefijosAsunto_(texto).replace(/(\d)\s*\.\s*(\d)/g, '$1/$2');
    const g = /vecinos?\s+con\s+(.+?)\s*[-–]?\s*semana\b/i.exec(t) || /\bcon\s+(.+?)\s*[-–]?\s*semana\b/i.exec(t);
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
 * **Las reuniones únicas entre los mails de los distintos grupos** (07/10: la misma reunión de Macri del 08/10 17:15
 * venía en el mail de CM y Ministros y en el de JM, y se iba a crear dos veces). Dos reuniones de grupos distintos son
 * la MISMA si tienen la misma figura de la fila (o, sin figura, el mismo lugar) y la misma fecha, y además: la misma
 * hora, o el mismo tipo y lugar, o cada grupo trae una sola reunión de esa figura ese día. Se queda la versión más
 * nueva (la del mail más reciente); las otras quedan marcadas `repetidaDe`. Si dos reuniones únicas distintas quedan
 * con la misma clave (una figura con dos reuniones ese día), a la segunda se le suma la hora a la clave; la clave de
 * su mail queda en `claveGrupo`.
 */
function _unificarEntreGrupos_(ultimas) {
  const base = function (ev) {
    const f = ev.fecha ? ymd_(ev.fecha) : 'sin_fecha';
    return ev.figuraFila ? normalizeText_(ev.figuraFila) + '|' + f : 'sin_figura|' + f + '|' + normalizeText_(ev.lugar);
  };
  const cuenta = {};
  ultimas.forEach(function (ev) {
    const k = base(ev);
    cuenta[k] = cuenta[k] || {};
    cuenta[k][ev.grupo] = (cuenta[k][ev.grupo] || 0) + 1;
  });
  const porBase = {}, unicas = [];
  ultimas.slice().sort(function (a, b) { return b.mailFecha - a.mailFecha; }).forEach(function (ev) {
    const k = base(ev);
    const unoPorGrupo = Object.keys(cuenta[k]).every(function (g) { return cuenta[k][g] === 1; });
    const lista = porBase[k] = porBase[k] || [];
    const misma = lista.filter(function (u) {
      if (u._grupos[ev.grupo]) return false;
      return unoPorGrupo || (ev.hora && u.hora === ev.hora) || (u.tipo === ev.tipo && u.lugar && u.lugar === ev.lugar);
    })[0];
    if (misma) { misma._grupos[ev.grupo] = true; misma.otrosGrupos.push(ev.grupo); ev.repetidaDe = misma.grupo; return; }
    ev._grupos = {}; ev._grupos[ev.grupo] = true; ev.otrosGrupos = []; ev.repetidaDe = '';
    lista.push(ev); unicas.push(ev);
  });
  unicas.sort(function (a, b) { return (a.fecha - b.fecha) || String(a.hora).localeCompare(String(b.hora)); });
  const claves = {};
  unicas.forEach(function (ev) {
    if (claves[ev.clave]) { ev.claveGrupo = ev.clave; ev.clave = ev.clave + '|' + ev.hora + '|' + normalizeText_(ev.grupo); }
    claves[ev.clave] = true;
  });
  return unicas;
}

/**
 * Las reuniones de UN cuerpo de mail. Línea por línea: el encabezado del día fija la fecha; "Evento:", "Hora:"
 * y "Lugar:" llenan la reunión en curso; una línea que no es ninguna de esas, inmediatamente después de un
 * campo, se toma como continuación de ese campo (el texto plano a veces corta líneas largas).
 */
/** Un "r" descartable, para parsear un cuerpo sin sumar a los contadores de la corrida. */
function _rVacio_() {
  return { sinFecha: 0, eventosIncompletos: [], fueraDeSemana: [], fechasCorregidas: [], imagenes: 0, tipos: {}, lineasRaras: {} };
}

const RE_CITA_AGENDA_ = [
  /^\s*-{2,}\s*(mensaje original|original message)\s*-{2,}\s*$/i,
  /^\s*_{8,}\s*$/                                                        // separador de Outlook
];
const RE_REENVIO_AGENDA_ = /^\s*-{2,}\s*(forwarded message|mensaje reenviado)\s*-{2,}\s*$/i;
const RE_RESPUESTA_AGENDA_ = /^\s*((re|rv|fwd?|aw|wg)\s*:\s*)+/i;
const RE_ESCRIBIO_AGENDA_ = /(escribi[oó]|wrote)\s*:\s*$/i;

/**
 * **Lo propio de un mail** (07/10): corta el cuerpo donde empieza la cita del mail anterior ("El … escribió:", "On …
 * wrote:" —aunque Gmail la parta en dos líneas—, líneas con ">", "-----Mensaje original-----"). En un reenvío
 * ("---------- Forwarded message ---------" o "Mensaje reenviado"), se queda con el mensaje reenviado, sin su
 * encabezado (De/Date/Subject/To…) y sin lo que ése a su vez cita. Devuelve { texto, corte: '' | 'cita' | 'reenvio' }.
 */
function _cuerpoPropioAgenda_(asunto, cuerpo) {
  let lineas = String(cuerpo || '').split(/\r?\n/);
  let corte = '';
  const iR = lineas.findIndex(function (l) { return RE_REENVIO_AGENDA_.test(l); });
  if (iR >= 0) {
    let j = iR + 1;
    while (j < lineas.length && (/^\s*(de|from|date|fecha|subject|asunto|to|para|cc|cco)\s*:/i.test(lineas[j]) || !lineas[j].trim())) j++;
    lineas = lineas.slice(j);
    corte = 'reenvio';
  }
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    // ">" es cita sólo en una respuesta o un reenvío (en una agenda podría ser una viñeta)
    let cita = RE_CITA_AGENDA_.some(function (re) { return re.test(l); }) || (/^\s*>/.test(l) && RE_RESPUESTA_AGENDA_.test(asunto || ''));
    if (!cita && /^\s*(el|on)\s/i.test(l)) {
      // "El mié, 7 oct 2026 a las 10:00, Fulano <x@y> escribió:" (Gmail lo parte a veces en dos o tres líneas)
      const junto = [l, lineas[i + 1] || '', lineas[i + 2] || ''];
      cita = junto.some(function (x, k) { return RE_ESCRIBIO_AGENDA_.test(junto.slice(0, k + 1).join(' ')); });
    }
    if (cita) { lineas = lineas.slice(0, i); if (!corte) corte = 'cita'; break; }
  }
  return { texto: lineas.join('\n'), corte: corte };
}

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

/**
 * Lo que dice el evento después del tipo (el TEMA de un temático, el INVITADO de una Primera Persona): si viene entre
 * comillas, eso; si no, el texto hasta la primera coma, sin las palabras de las figuras ni "con" / guiones del
 * principio. '' si no queda nada. Ej.: 'Encuentro Temático "Salud" Jorge Macri, Eje Sur' → 'Salud';
 * 'Primera Persona con Juan Pérez, Jorge Macri, Comuna 14' → 'Juan Pérez'.
 */
function _textoDespuesDelTipo_(texto, reTipo, figuras) {
  const t = String(texto || '');
  const m = reTipo.exec(t);
  if (!m) return '';
  let resto = t.slice(m.index + m[0].length).replace(/^\s*["“”'«»]+/, '');
  const q = /^\s*[-–:]?\s*["“”«]([^"“”»]+)["“”»]/.exec(t.slice(m.index + m[0].length));
  if (q) return q[1].trim();
  resto = resto.split(',')[0];
  const deFiguras = {};
  (figuras || []).forEach(function (f) { normalizeText_(f).split(/\s+/).forEach(function (w) { deFiguras[w] = true; }); });
  const palabras = resto.split(/\s+/).filter(function (w) {
    const n = normalizeText_(w).replace(/[^a-z0-9]/g, '');
    return n && !deFiguras[n] && !/^\(?no$|^participa\)?$/.test(n);
  });
  while (palabras.length && /^(con|de|-|–|:|"|“|”)$/i.test(palabras[0])) palabras.shift();
  return palabras.join(' ').replace(/^["“”«»'\s]+|["“”«»'\s]+$/g, '').trim();
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
  ev.tema = ev.tipo === 'Encuentro Temático' ? _textoDespuesDelTipo_(ev.eventoTexto, /tem[aá]tico/i, ev.figuras) : '';
  ev.invitado = ev.tipo === 'Primera Persona' ? _textoDespuesDelTipo_(ev.eventoTexto, /primera\s+persona/i, ev.figuras) : '';
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

function _diaSemanaAgenda_(f) {
  return ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][f.getDay()];
}

/** Filas por tanda al escribir una solapa (de la intermedia o de los registros). */
const AGENDA_FILAS_POR_TANDA = 300;

/**
 * **La intermedia, abierta UNA vez por corrida** y reusada (06/10: abrirla falló tres veces seguidas y la ejecución
 * terminó en error). Comparte el objeto con `ssIntermedia_()` (20_UpsertDestino.js). Si abrirla falla, reintenta con
 * esperas crecientes (`AGENDA_ESPERAS_INTERMEDIA_MS`: 2, 5 y 10 s) y recién ahí tira.
 */
function intermediaAgenda_() {
  if (!_ssIntermedia_) _ssIntermedia_ = _abrirConReintentos_(RDV_SS_INTERMEDIA, 'la intermedia');
  return _ssIntermedia_;
}

/**
 * **Dónde van los registros de la agenda** (REGISTRO_AGENDA y REGISTRO_AGENDA_CAMBIOS): el archivo propio y liviano
 * "RDV registros" si `RDV_SS_REGISTROS` tiene su ID (07/10, si la intermedia sigue sin responder: paso 40), o la
 * intermedia. Se abre UNA vez por corrida, con los mismos reintentos.
 */
var _ssRegistros_ = null;
function registrosAgenda_() {
  if (!RDV_SS_REGISTROS) return intermediaAgenda_();
  if (!_ssRegistros_) _ssRegistros_ = _abrirConReintentos_(RDV_SS_REGISTROS, 'el archivo de registros');
  return _ssRegistros_;
}

/** openById con las esperas de `AGENDA_ESPERAS_INTERMEDIA_MS` (2, 5, 10 s) entre intentos; tira si no se puede. */
function _abrirConReintentos_(id, que) {
  let ultimo = null;
  for (let i = 0; i <= AGENDA_ESPERAS_INTERMEDIA_MS.length; i++) {
    try { return SpreadsheetApp.openById(id); } catch (err) {
      ultimo = err;
      Logger.log('[agenda] abrir %s falló (intento %s): %s', que, i + 1, err);
      if (i < AGENDA_ESPERAS_INTERMEDIA_MS.length) Utilities.sleep(AGENDA_ESPERAS_INTERMEDIA_MS[i]);
    }
  }
  throw ultimo;
}

/** Corre `fn` con los mismos reintentos (2, 5, 10 s); entre intentos vuelve a abrir la intermedia. Tira si no sale. */
function _conReintentosAgenda_(que, fn) {
  let ultimo = null;
  for (let i = 0; i <= AGENDA_ESPERAS_INTERMEDIA_MS.length; i++) {
    try { return fn(); } catch (err) {
      ultimo = err;
      Logger.log('[agenda] %s falló (intento %s): %s', que, i + 1, err);
      if (i < AGENDA_ESPERAS_INTERMEDIA_MS.length) { Utilities.sleep(AGENDA_ESPERAS_INTERMEDIA_MS[i]); _ssIntermedia_ = null; _ssRegistros_ = null; }
    }
  }
  throw ultimo;
}

/**
 * Escribe una solapa de la intermedia EN TANDAS, con los reintentos (06/10: AGENDA_BARRIO_DIRECCION se cortó con
 * "Service Spreadsheets timed out" escribiéndose de una vez). `clearContents`, nunca `clear`. Si igual falla, TIRA:
 * quien llama decide (las solapas informativas no hacen fallar la corrida; ver `_escribirSolapasAgenda_`).
 */
function _escribirHojaAgenda_(nombre, matriz) {
  const sh = _conReintentosAgenda_(nombre + ': abrir', function () {
    const ss = intermediaAgenda_();
    const h = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
    h.clearContents();
    return h;
  });
  const ancho = matriz[0].length;
  for (let i = 0; i < matriz.length; i += AGENDA_FILAS_POR_TANDA) {
    const tanda = matriz.slice(i, i + AGENDA_FILAS_POR_TANDA);
    _conReintentosAgenda_(nombre + ': tanda ' + (i / AGENDA_FILAS_POR_TANDA + 1), function () {
      sh.getRange(i + 1, 1, tanda.length, ancho).setValues(tanda);
      SpreadsheetApp.flush();
    });
  }
  try { sh.setFrozenRows(1); } catch (e) { /* no importa */ }
  Logger.log('[agenda] %s: %s filas', nombre, matriz.length - 1);
  return sh;
}

function _minHoraAgenda_(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  return m ? +m[1] * 60 + +m[2] : null;
}

function _pctAgenda_(a, b) { return b ? Math.round(1000 * a / b) / 10 : 0; }

function _repartoAgenda_(lista, fn) {
  const c = {};
  lista.forEach(function (x) { const k = fn(x); c[k] = (c[k] || 0) + 1; });
  return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).map(function (k) { return k + ' ' + c[k]; }).join(' · ') || '—';
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

/**
 * **La regla de confianza con el margen de borde** (06/10, etapa 2, punto 12): (a) y (b) de `_reglaBarrio_`, y
 * además (c) el punto está a más de `margenM` metros de cualquier OTRO barrio. (d), la celda vacía, se mira al
 * escribir. Sin `margenM` (null), es la regla sin margen.
 */
function _reglaBarrioConMargen_(res, ev, poligonos, margenM) {
  const r = _reglaBarrio_(res, ev);
  if (!r.cumple || margenM == null) return r;
  const d = _distanciaAOtroBarrioM_(res.lng, res.lat, poligonos, res.barrio);
  if (d != null && d <= margenM) return { cumple: false, motivo: '(c) a ' + Math.round(d) + ' m de otro barrio (margen ' + margenM + ' m)', distancia: d };
  r.distancia = d;
  return r;
}

/**
 * La distancia en METROS del punto al borde más cercano de un barrio distinto de `barrio`. Aproximación plana
 * (alcanza a la escala de la Ciudad): 1° de latitud = 110,95 km; 1° de longitud = 91,6 km a -34,6°.
 */
function _distanciaAOtroBarrioM_(lng, lat, poligonos, barrio) {
  if (lng == null || lat == null || lng === '' || lat === '') return null;
  const KX = 91600, KY = 110950;
  const x = Number(lng) * KX, y = Number(lat) * KY;
  let mejor = null;
  poligonos.forEach(function (b) {
    if (normalizeText_(b.barrio) === normalizeText_(barrio)) return;
    b.anillos.forEach(function (a) {
      const n = a.length / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const x1 = a[2 * j] * KX, y1 = a[2 * j + 1] * KY, x2 = a[2 * i] * KX, y2 = a[2 * i + 1] * KY;
        const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
        let t = L ? ((x - x1) * dx + (y - y1) * dy) / L : 0;
        t = Math.max(0, Math.min(1, t));
        const ex = x1 + t * dx - x, ey = y1 + t * dy - y, d = Math.sqrt(ex * ex + ey * ey);
        if (mejor == null || d < mejor) mejor = d;
      }
    });
  });
  return mejor;
}

/**
 * Los mails de agenda **desde Gmail** (etapa 2; 06/10: la etiqueta sola trajo 10 mails y faltaban tres semanas): los
 * hilos de la etiqueta `AGENDA_ETIQUETA_GMAIL` **o** los que traen en el asunto alguna de `AGENDA_ASUNTOS_GMAIL`, en
 * los días desde `desde`, **sin duplicar** (por id de mensaje). Cada uno: `{ fecha, asunto, cuerpo, id, hilo,
 * etiqueta }` (`etiqueta`: si su hilo tenía la etiqueta). Si no trae nada y Gmail falló, TIRA: no se escribe nada.
 */
function leerMailsAgendaGmail_(desde) {
  const vistos = {}, lista = [], enEtiqueta = {};
  const dias = Math.max(1, Math.ceil((Date.now() - desde.getTime()) / 86400000) + 1);
  const agregar = function (hilos, origen) {
    hilos.forEach(function (h) {
      if (h.getLastMessageDate() < desde) return;
      const idHilo = h.getId();
      if (origen === 'etiqueta') enEtiqueta[idHilo] = true;
      h.getMessages().forEach(function (msg) {
        const id = msg.getId();
        if (vistos[id] || msg.getDate() < desde) return;
        vistos[id] = true;
        lista.push({ fecha: msg.getDate(), asunto: msg.getSubject() || '', cuerpo: String(msg.getPlainBody() || ''), truncado: false,
                     id: id, hilo: idHilo });
      });
    });
  };
  const errores = [];
  // 1. la etiqueta (si existe)
  try {
    const etiqueta = GmailApp.getUserLabelByName(AGENDA_ETIQUETA_GMAIL);
    if (etiqueta) {
      for (let inicio = 0; inicio < 2000; inicio += 100) {
        const hilos = etiqueta.getThreads(inicio, 100);
        if (!hilos.length) break;
        agregar(hilos, 'etiqueta');
        if (hilos.length < 100 || hilos[hilos.length - 1].getLastMessageDate() < desde) break;
      }
    } else errores.push('no existe la etiqueta "' + AGENDA_ETIQUETA_GMAIL + '"');
  } catch (e) { errores.push('etiqueta: ' + e); }
  // 2. el asunto (las dos formas), en los últimos `dias` días
  AGENDA_ASUNTOS_GMAIL.forEach(function (asunto) {
    try {
      const q = 'subject:("' + asunto + '") newer_than:' + dias + 'd';
      for (let inicio = 0; inicio < 2000; inicio += 500) {
        const hilos = GmailApp.search(q, inicio, 500);
        if (!hilos.length) break;
        agregar(hilos, 'asunto');
        if (hilos.length < 500) break;
      }
    } catch (e) { errores.push('asunto "' + asunto + '": ' + e); }
  });
  if (!lista.length && errores.length) throw new Error('Gmail: ' + errores.join(' | '));
  lista.forEach(function (m) { m.etiqueta = !!enEtiqueta[m.hilo]; });
  lista.sort(function (x, y) { return x.fecha - y.fecha; });
  return { fuente: 'Gmail: etiqueta "' + AGENDA_ETIQUETA_GMAIL + '" o asunto (' + AGENDA_ASUNTOS_GMAIL.join(' / ') + '), ' + dias + ' días',
           lista: lista, errores: errores };
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
  if (p) return { estado: aprox ? 'aproximada' : (g.parcial ? 'ok_parcial' : 'ok'), barrio: p.barrio, comuna: p.comuna, lat: lat, lng: lng };
  p = _barrioMasCercano_(lng, lat, poligonos);
  if (p && p.dist <= GEOCODE_TOLERANCIA_BORDE) return { estado: 'borde', barrio: p.barrio, comuna: p.comuna, lat: lat, lng: lng };
  return { estado: 'fuera_de_caba', barrio: '', comuna: null, lat: lat, lng: lng };
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

function _leerCacheGeocode_() {
  const m = new Map();
  let sh;
  try { sh = intermediaAgenda_().getSheetByName(AGENDA_SOLAPA_GEOCODE); }
  catch (err) { Logger.log('[agenda] no se pudo leer la cache %s (%s): se sigue sin cache.', AGENDA_SOLAPA_GEOCODE, err); return m; }
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
  const ss = intermediaAgenda_();
  let sh = ss.getSheetByName(AGENDA_SOLAPA_GEOCODE);
  if (!sh) { sh = ss.insertSheet(AGENDA_SOLAPA_GEOCODE); sh.getRange(1, 1, 1, GEOCODE_ENCABEZADO.length).setValues([GEOCODE_ENCABEZADO]); sh.setFrozenRows(1); }
  const filas = nuevas.map(function (g) {
    return [g.consulta, g.estado, g.lat, g.lng, g.tipo, g.parcial ? 'TRUE' : 'FALSE', g.barrioGoogle, g.formateada, g.detalle, g.fecha,
            g.componentes || ''];
  });
  sh.getRange(sh.getLastRow() + 1, 1, filas.length, GEOCODE_ENCABEZADO.length).setValues(filas);
  Logger.log('[agenda] %s: %s geocodificaciones nuevas en la cache', AGENDA_SOLAPA_GEOCODE, filas.length);
}
