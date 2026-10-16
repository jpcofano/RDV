/**
 * 41_AgendaCache.js — la CACHE de los mails de agenda (16/10, tarde, punto 5b; AGENDA_CACHE_MAILS, 00_Config.js).
 *
 * Un mail enviado no cambia. Lo que la agenda sacaba de cada mail en CADA corrida, ahora se guarda:
 *   - por HILO (`agh|<id>`): la fecha del último mensaje y los ids de sus mensajes, en orden. Si el hilo que trae la búsqueda tiene
 *     la misma fecha de último mensaje, no se baja (getMessages): sus mensajes salen de la cache;
 *   - por MENSAJE (`agm|<id>`): fecha, asunto y el texto (getPlainBody). Uno anterior a lo que se lee queda sin el texto;
 *   - por MENSAJE y versión del código de los colores (`agc|<id>|<v>`): lo que sale del HTML (getBody) para los colores
 *     (`_derivadoHtmlColMail_`: las líneas de texto, las letras de color de cada reunión, las de afuera). Sin HTML leído (el tope de
 *     60 s, o getBody falló), no se guarda: la próxima corrida lo vuelve a intentar;
 *   - por la HUELLA del texto que se parsea (`agp|<huella>`): lo que devuelve `_parsearCuerpoAgenda_` (las reuniones y lo que suma
 *     a los contadores). La huella es la del texto, la fecha del mail, la semana del asunto, las figuras de la base, los barrios de
 *     Comunas, el código del parser y AGENDA_PARSER_VERSION: si cambia cualquiera, es otra clave (se parsea de nuevo).
 *
 * Dónde: la cache de Apps Script (CacheService del script), no una planilla: se lee al empezar la agenda en UNA llamada (las claves
 * que usó la corrida anterior, `ag|manifiesto`) y se escribe al final en otra; leer una planilla grande cada hora es justamente lo
 * lento (la base tarda de 13 a 71 s). Vive hasta 6 h y lo que se usa se renueva: con el activador de cada hora no se vacía. Si se
 * pierde (o falla), la corrida baja y parsea todo, como antes: el resultado NUNCA depende de la cache (tests/agenda_tiempos.test.js
 * compara el plan con y sin ella, con varias versiones, un "Re:" y los colores).
 * Los valores van comprimidos (gzip + base64) y, si pasan de AGENDA_CACHE_MAX_VALOR, partidos en varias claves.
 * Sólo la usa la corrida de la agenda (correrAgendaEnBloqueo_); los pasos de sólo lectura (auditorías, mediciones) no.
 */

const AGENDA_CACHE_MANIFIESTO_ = 'ag|manifiesto';
/** CacheService guarda hasta 100 KB por clave: un valor más largo se parte. */
const AGENDA_CACHE_MAX_VALOR = 90000;

/**
 * Abre la cache: lee el manifiesto (las claves que usó la corrida anterior) y TODAS esas claves, en una llamada. `servicio`: el de
 * un test (con getAll / putAll / get). null si no hay cache (o falla): la corrida sigue sin ella.
 */
function cacheAgendaAbrir_(servicio) {
  let svc = servicio || null;
  if (!svc) { try { svc = CacheService.getScriptCache(); } catch (e) { svc = null; } }
  if (!svc) return null;
  const S = { svc: svc, mem: new Map(), edad: new Map(), nuevos: new Map(), usados: new Set(),
              stats: { leidas: 0, nuevas: 0, renovadas: 0, errores: [] }, t0: Date.now() };
  try {
    const man = svc.get(AGENDA_CACHE_MANIFIESTO_);
    const claves = man ? JSON.parse(man) : [];
    const crudo = {};
    for (let i = 0; i < claves.length; i += 500) {
      const parte = svc.getAll(claves.slice(i, i + 500)) || {};
      Object.keys(parte).forEach(function (k) { crudo[k] = parte[k]; });
    }
    Object.keys(crudo).forEach(function (k) {
      if (/#\d+$/.test(k)) return;               // una parte de un valor partido: la arma su cabeza
      const v = _cacheArmar_(crudo, k);
      if (v == null) return;
      try {
        const o = JSON.parse(_cacheDescomprimir_(v));
        S.mem.set(k, o.v);
        S.edad.set(k, o.t || 0);
        S.stats.leidas++;
      } catch (e) { /* una entrada rota es una entrada que no está */ }
    });
  } catch (err) {
    S.stats.errores.push('leer: ' + err);
    Logger.log('[agenda] la cache de los mails no se pudo leer (%s): esta corrida baja y parsea todo, como antes.', err);
  }
  return S;
}

/** El valor de la clave `k` (ya armado de sus partes), o undefined. Marca la clave como usada (se renueva y va al manifiesto). */
function cacheAgendaGet_(S, k) {
  if (!S || !S.mem.has(k)) return undefined;
  S.usados.add(k);
  return S.mem.get(k);
}

/** Guarda `v` (JSON-able) en la clave `k` (se escribe al cerrar). */
function cacheAgendaPut_(S, k, v) {
  if (!S) return;
  S.mem.set(k, v);
  S.edad.set(k, Date.now());
  S.nuevos.set(k, v);
  S.usados.add(k);
}

/**
 * Cierra la cache: escribe lo nuevo, renueva lo usado que tiene más de AGENDA_CACHE_RENOVAR_MS y el manifiesto (sólo las claves
 * usadas en esta corrida: lo que no se usó se deja vencer solo). Nunca tira.
 */
function cacheAgendaCerrar_(S) {
  if (!S) return null;
  try {
    const ahora = Date.now(), salida = {}, manifiesto = [];
    S.usados.forEach(function (k) {
      const nuevo = S.nuevos.has(k);
      const viejo = !nuevo && ahora - (S.edad.get(k) || 0) > AGENDA_CACHE_RENOVAR_MS;
      const txt = _cacheComprimir_(JSON.stringify({ t: nuevo ? ahora : (viejo ? ahora : S.edad.get(k) || ahora), v: S.mem.get(k) }));
      const partes = txt.length > AGENDA_CACHE_MAX_VALOR ? Math.ceil(txt.length / AGENDA_CACHE_MAX_VALOR) : 0;
      manifiesto.push(k);
      for (let i = 1; i <= partes; i++) manifiesto.push(k + '#' + i);
      if (!nuevo && !viejo) return;
      if (nuevo) S.stats.nuevas++; else S.stats.renovadas++;
      if (!partes) { salida[k] = txt; return; }
      salida[k] = 'p:' + partes;
      for (let i = 1; i <= partes; i++) salida[k + '#' + i] = txt.slice((i - 1) * AGENDA_CACHE_MAX_VALOR, i * AGENDA_CACHE_MAX_VALOR);
    });
    salida[AGENDA_CACHE_MANIFIESTO_] = JSON.stringify(manifiesto);
    const claves = Object.keys(salida);
    for (let i = 0; i < claves.length; i += 200) {
      const lote = {};
      claves.slice(i, i + 200).forEach(function (k) { lote[k] = salida[k]; });
      S.svc.putAll(lote, AGENDA_CACHE_TTL_S);
    }
  } catch (err) {
    S.stats.errores.push('escribir: ' + err);
    Logger.log('[agenda] la cache de los mails no se pudo escribir (%s): la próxima corrida baja y parsea lo que falte.', err);
  }
  return S.stats;
}

function _cacheArmar_(crudo, k) {
  const v = crudo[k];
  if (v == null) return null;
  const m = /^p:(\d+)$/.exec(v);
  if (!m) return v;
  let t = '';
  for (let i = 1; i <= +m[1]; i++) { if (crudo[k + '#' + i] == null) return null; t += crudo[k + '#' + i]; }
  return t;
}

function _cacheComprimir_(txt) {
  try {
    if (typeof Utilities !== 'undefined' && typeof Utilities.gzip === 'function') {
      return 'z:' + Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(txt, 'application/json')).getBytes());
    }
  } catch (e) { /* sin comprimir */ }
  return 'j:' + txt;
}

function _cacheDescomprimir_(v) {
  if (v.slice(0, 2) === 'j:') return v.slice(2);
  if (v.slice(0, 2) === 'z:') {
    return Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(v.slice(2)), 'application/x-gzip')).getDataAsString();
  }
  return v;
}

// ===================== Valores con fechas (las reuniones del parser) =====================

/**
 * A JSON y de vuelta SIN perder nada de lo que tiene una reunión: las fechas (Date → { __d }), `undefined` (→ { __u }: la clave
 * queda en su lugar, con undefined) y NaN. Así una reunión de la cache es igual, campo por campo y en el mismo orden, a la recién
 * parseada.
 */
function aJsonAgenda_(v) {
  return JSON.stringify(v, function (k, x) {
    const o = this[k];
    if (o instanceof Date) return { __d: o.getTime() };
    if (x === undefined) return { __u: 1 };
    if (typeof x === 'number' && isNaN(x)) return { __n: 1 };
    return x;
  });
}

function deJsonAgenda_(txt) {
  const rev = function (x) {
    if (Array.isArray(x)) { for (let i = 0; i < x.length; i++) x[i] = rev(x[i]); return x; }
    if (x && typeof x === 'object') {
      const ks = Object.keys(x);
      if (ks.length === 1 && ks[0] === '__d') return new Date(x.__d);
      if (ks.length === 1 && ks[0] === '__u') return undefined;
      if (ks.length === 1 && ks[0] === '__n') return NaN;
      ks.forEach(function (k) { x[k] = rev(x[k]); });
      return x;
    }
    return x;
  };
  return rev(JSON.parse(txt));
}

// ===================== El parser con cache =====================

/** Lo que parsea `_parsearCuerpoAgenda_` mientras está activo (agendaDesdeListaDeMails_ con `meta.cacheParse`); null = sin cache. */
var _parseMemoAgenda_ = null;
/** Las claves de `meta` que NO entran en la huella: se ponen las de la llamada sobre la reunión de la cache. */
const META_REASIGNABLE_AGENDA_ = ['grupo', 'version', 'versiones', 'mailFecha', 'asunto', 'mailId'];

/**
 * Prende el parser con cache (`S`: cacheAgendaAbrir_, o null: sólo la memoria de esta corrida). La huella del contexto: las
 * figuras y apellidos de la base, los barrios de Comunas, las variantes, el código de las funciones del parser y
 * AGENDA_PARSER_VERSION. Devuelve el memo (para las estadísticas) o null si no se pudo (sin huellaContenido_).
 */
function parseMemoAgendaIniciar_(S) {
  if (typeof huellaContenido_ !== 'function') return null;
  let ctx = '';
  try { ctx = huellaContenido_(_contextoParserAgenda_()); } catch (err) { Logger.log('[agenda] parser sin cache (%s)', err); return null; }
  _parseMemoAgenda_ = { S: S || null, ctx: ctx, mem: new Map(), stats: { deCache: 0, repetidos: 0, parseados: 0 } };
  return _parseMemoAgenda_;
}

function parseMemoAgendaTerminar_() {
  const M = _parseMemoAgenda_;
  _parseMemoAgenda_ = null;
  return M ? M.stats : null;
}

/** Todo lo que, además del texto, decide lo que devuelve el parser. */
function _contextoParserAgenda_() {
  const L = _listas_();
  const fn = function (nombre) { try { const f = eval(nombre); return typeof f === 'function' ? String(f) : ''; } catch (e) { return ''; } };
  const re = function (k, x) { return x instanceof RegExp ? String(x) : x; };
  return {
    v: AGENDA_PARSER_VERSION,
    figuras: (L.figuras || []).map(function (f) { return f.canon + '=' + f.norm; }),
    apellidos: Array.from(_apellidosUnicos_().entries()),
    barrios: JSON.stringify(L.barrios || [], re), eje: [L.barrios && L.barrios.encabezadoEje, L.barrios && L.barrios.ejeValido],
    variantes: typeof FIGURAS_VARIANTES !== 'undefined' ? JSON.stringify(FIGURAS_VARIANTES, re) : '',
    bvariantes: typeof BARRIOS_VARIANTES !== 'undefined' ? JSON.stringify(BARRIOS_VARIANTES, re) : '',
    apellido: [FIGURA_POR_APELLIDO, MIN_LARGO_APELLIDO], tipos: JSON.stringify(AGENDA_TIPOS, re), marcas: JSON.stringify(AGENDA_MARCAS, re),
    codigo: ['_parsearCuerpoAgendaSinCache_', '_completarReunion_', '_figurasConPosicionSinMemo_', '_textoDespuesDelTipo_',
             '_limpiarLineaAgenda_', '_horaAgenda_', '_fechaDiaMes_', '_levenshtein_', 'detectComuna_', 'detectSubzonaComuna1_',
             'detectEje_', '_detectBarrioAg_', 'detectBarrio_', 'canonizarBarrio_', '_otraGrafiaBarrio_', '_canonFiguraDestino_',
             '_apellidosUnicos_', 'normalizeText_', '_expandirAbreviaturas_', 'alMediodia_'].map(fn)
  };
}

/**
 * `_parsearCuerpoAgenda_` con cache: la misma salida (las reuniones, en el mismo orden y con los mismos campos) y lo mismo sumado a
 * `r` y a los nombres "por tolerancia" del log. Sin memo activo, el parser de siempre.
 */
function _parsearCuerpoAgendaConCache_(cuerpo, fechaMail, r, meta) {
  const M = _parseMemoAgenda_;
  meta = meta || {};
  const fija = {}, nombres = Object.keys(meta).sort();
  nombres.forEach(function (k) { if (META_REASIGNABLE_AGENDA_.indexOf(k) < 0) fija[k] = meta[k]; });
  const clave = 'agp|' + huellaContenido_([M.ctx, String(cuerpo || ''), fechaMail instanceof Date ? fechaMail.getTime() : String(fechaMail),
                                           nombres, aJsonAgenda_(fija)]);
  let txt = M.mem.get(clave);
  if (txt !== undefined) M.stats.repetidos++;   // el mismo texto otra vez en esta corrida (la validación, los colores)
  else if (M.S) { txt = cacheAgendaGet_(M.S, clave); if (txt !== undefined) { M.mem.set(clave, txt); M.stats.deCache++; } }
  if (txt === undefined) {
    const rv = _rVacio_(), n0 = _agendaTolerancia_.length;
    const evs = _parsearCuerpoAgendaSinCache_(cuerpo, fechaMail, rv, meta);
    const idx = function (lista) { return lista.map(function (ev) { return evs.indexOf(ev); }); };
    txt = aJsonAgenda_({ evs: evs, sinFecha: rv.sinFecha, imagenes: rv.imagenes, inc: rv.eventosIncompletos, lineasRaras: rv.lineasRaras,
                         fuera: idx(rv.fueraDeSemana), corr: idx(rv.fechasCorregidas), tol: _agendaTolerancia_.slice(n0) });
    _agendaTolerancia_.length = n0;   // se vuelven a sumar abajo, igual que si viniera de la cache
    M.mem.set(clave, txt);
    if (M.S) cacheAgendaPut_(M.S, clave, txt);
    M.stats.parseados++;
  }
  const o = deJsonAgenda_(txt);
  o.evs.forEach(function (ev) { META_REASIGNABLE_AGENDA_.forEach(function (k) { if (k in meta || k in ev) ev[k] = meta[k]; }); });
  // lo que el parser suma a `r`, en el mismo orden
  r.sinFecha = (r.sinFecha || 0) + o.sinFecha;
  r.imagenes = (r.imagenes || 0) + o.imagenes;
  o.inc.forEach(function (x) { r.eventosIncompletos.push(x); });
  o.fuera.forEach(function (i) { r.fueraDeSemana.push(o.evs[i]); });
  o.corr.forEach(function (i) { r.fechasCorregidas.push(o.evs[i]); });
  Object.keys(o.lineasRaras).forEach(function (k) { r.lineasRaras[k] = (r.lineasRaras[k] || 0) + o.lineasRaras[k]; });
  o.tol.forEach(function (x) { _agendaTolerancia_.push(x); });
  return o.evs;
}

// ===================== Los colores con cache =====================

var _versionColoresAgenda_ = null;
/** La versión del código que saca los colores del HTML (si cambia, lo guardado no vale). */
function versionColoresAgenda_() {
  if (_versionColoresAgenda_) return _versionColoresAgenda_;
  const fn = function (nombre) { try { const f = eval(nombre); return typeof f === 'function' ? String(f) : ''; } catch (e) { return ''; } };
  _versionColoresAgenda_ = huellaContenido_([AGENDA_PARSER_VERSION, typeof COLORES_MAIL_NOMBRES !== 'undefined' ? COLORES_MAIL_NOMBRES : null,
    ['_derivadoHtmlColMail_', '_htmlALineasColMail_', '_letrasColMail_', '_clasesDeEstiloColMail_', '_declaracionColMail_', '_colorColMail_',
     '_familiaColMail_', '_colorDeFondoCortoColMail_', '_entidadesHtmlAgenda_', '_propioDeHtmlAgenda_', '_textoLineaColMail_',
     '_sumarLetrasColMail_', '_letrasVaciasColMail_', '_limpiarLineaAgenda_'].map(fn)]).replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
  return _versionColoresAgenda_;
}

function claveColoresAgenda_(id) { return 'agc|' + id + '|' + versionColoresAgenda_(); }

/** Lo que sale del HTML de un mail para los colores, para guardarlo (JSON con las fechas: no tiene). */
function derivadoColoresParaCache_(d) { return d ? aJsonAgenda_(d) : null; }
function derivadoColoresDeCache_(txt) { return txt ? deJsonAgenda_(txt) : null; }
