/**
 * tests/agenda_tiempos.test.js — 16/10 (tarde, punto 5b): los TIEMPOS DE LA AGENDA.
 *   [1] la geocodificación (AGENDA_GEO_AHORRO): no se pide "A CONFIRMAR" ni lo que ya está en la cache; un fallo reciente no se
 *       vuelve a pedir, uno viejo sí (sin resultado: 7 días; ERROR: 24 h); el tope de 20 por corrida, las más cercanas en fecha
 *       primero; la consulta con las abreviaturas expandidas ("Av. Int. Bullrich" → "Av. Intendente Bullrich"); lo PENDIENTE no
 *       crea la fila ni toca el barrio; la guarda de tiempo (sólo hoy a 3 días); el log dice qué direcciones se pidieron;
 *   [2] la cache de los mails (AGENDA_CACHE_MAILS, 41_AgendaCache.js): con y SIN cache, la misma base, la misma copia y el mismo
 *       registro (varias versiones, un "Re:", los colores con una reunión en ROJO); la corrida con la cache no baja nada de Gmail
 *       (ni getMessages, ni getPlainBody, ni getBody) ni parsea nada; un mensaje nuevo baja sólo su hilo y parsea sólo lo nuevo;
 *       otra versión del parser no usa lo guardado; la serialización no pierde fechas, undefined ni el orden;
 *   [3] la base UNA vez por corrida (BASE_UNA_LECTURA_POR_CORRIDA): la que leyó la agenda la reusan el cruce y las derivadas si
 *       nadie escribió; si la agenda escribió, o el equipo ordenó / cambió una fila, se vuelve a leer; la escritura del cruce no
 *       escribe en una fila que ya no es la del plan;
 *   [4] la guarda de tiempo DENTRO de la agenda: con más de 150 s al terminar el parse, sólo se geocodifica hoy a 3 días.
 *
 *     node tests/agenda_tiempos.test.js
 *
 * NO sube a Apps Script. Sin datos reales: mails, direcciones y horarios inventados; barrios y comunas, los públicos de la Ciudad;
 * las figuras, nombres de la columna Figura. "Hoy" es el viernes 16/10/2026.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', '05_Escritura.js', '20_UpsertDestino.js', '49_Corridas.js', '49_Aceleraciones.js',
                  '41_AgendaCache.js', '41_AgendaColores.js', '41_AgendaParser.js', '42_BarriosCabaGeo.js', '40_Agenda.js', '47_AgendaVistas.js',
                  '25_Elecciones.js', '30_Derivadas.js', '44_Looker.js'];
const HOY = new Date(2026, 9, 16, 12, 0, 0);
class D extends Date {
  constructor(...a) { if (a.length === 0) super(HOY.getTime()); else super(...a); }
  static now() { return HOY.getTime(); }
}
const pad = function (n) { return ('0' + n).slice(-2); };
let fallas = 0, chequeos = 0;
function ok(c, q) { chequeos++; console.log((c ? '  ok   ' : '  FALLA ') + q); if (!c) fallas++; }

// ============================== el mock ==============================

/** La cache de Apps Script, compartida entre "ejecuciones" (como la real). */
function cacheServicio() {
  const S = { datos: {}, gets: 0, puts: 0 };
  S.get = function (k) { S.gets++; return k in S.datos ? S.datos[k] : null; };
  S.getAll = function (ks) { S.gets++; const o = {}; ks.forEach(function (k) { if (k in S.datos) o[k] = S.datos[k]; }); return o; };
  S.putAll = function (o) { S.puts++; Object.keys(o).forEach(function (k) { if (String(o[k]).length > 100000) throw new Error('más de 100 KB'); S.datos[k] = o[k]; }); };
  return S;
}

/** Gmail: hilos con mensajes; cuenta cada llamada que baja algo. */
function gmail(hilos) {
  const G = { hilos: hilos, getMessages: 0, getPlainBody: 0, getBody: 0 };
  const hilo = function (h) {
    return { getId: function () { return h.id; }, getLastMessageDate: function () { return h.msgs[h.msgs.length - 1].fecha; },
             getMessageCount: function () { return h.msgs.length; },
             getMessages: function () {
               G.getMessages++;
               return h.msgs.map(function (m) {
                 return { getId: function () { return m.id; }, getDate: function () { return m.fecha; }, getSubject: function () { return m.asunto; },
                          getPlainBody: function () { G.getPlainBody++; return m.cuerpo; }, getBody: function () { G.getBody++; return m.html || ''; } };
               });
             } };
  };
  G.app = {
    getUserLabelByName: function () { return { getThreads: function (i) { return i ? [] : G.hilos.map(hilo); } }; },
    search: function () { return G.hilos.map(hilo); }   // el mismo hilo por la etiqueta y por el asunto
  };
  return G;
}

function crearEntorno(config, servicios) {
  servicios = servicios || {};
  const E = { logs: [], uuid: 0, geo: [] };
  class Hoja {
    constructor(nombre, v) { this.nombre = nombre; this.v = (v || []).map(function (r) { return r.slice(); }); this.bg = this.v.map(function (r) { return r.map(function () { return null; }); }); this.lecturas = 0; }
    _asegurar(f, c) {
      while (this.v.length < f) { this.v.push([]); this.bg.push([]); }
      for (let i = 0; i < f; i++) { while (this.v[i].length < c) { this.v[i].push(''); this.bg[i].push(null); } }
    }
    getRange(f, c, nf, nc) {
      const h = this; nf = nf || 1; nc = nc || 1;
      const leer = function (m) { const o = []; for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) { const fila = m[f - 1 + i]; r.push(fila && fila[c - 1 + j] !== undefined ? fila[c - 1 + j] : (m === h.v ? '' : null)); } o.push(r); } return o; };
      const rango = {
        getValues: function () { h.lecturas++; h.celdasLeidas = (h.celdasLeidas || 0) + nf * nc; return leer(h.v); },
        getValue: function () { return leer(h.v)[0][0]; },
        getBackgrounds: function () { return leer(h.bg); },
        getFormula: function () { return ''; },
        getFormulas: function () { const o = []; for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) r.push(''); o.push(r); } return o; },
        setValues: function (m) { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.v[f - 1 + i][c - 1 + j] = m[i][j]; h.escrituras = (h.escrituras || 0) + 1; return rango; },
        setValue: function (x) { h._asegurar(f, c); h.v[f - 1][c - 1] = x; return rango; },
        setBackground: function (col) { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.bg[f - 1 + i][c - 1 + j] = col; return rango; },
        clearContent: function () { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.v[f - 1 + i][c - 1 + j] = ''; return rango; },
        setNumberFormat: function () { return rango; }, getNumberFormats: function () { const o = []; for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) r.push('General'); o.push(r); } return o; },
        setNumberFormats: function () { return rango; }, clearFormat: function () { return rango; },
        setDataValidation: function () { return rango; }, setFontWeight: function () { return rango; }, getDataValidation: function () { return null; },
        setFontColor: function () { return rango; }, setFontLine: function () { return rango; }, setWrap: function () { return rango; },
        setVerticalAlignment: function () { return rango; }, setHorizontalAlignment: function () { return rango; }, setBorder: function () { return rango; },
        setFontStyle: function () { return rango; }, setBackgrounds: function () { return rango; }, setFontColors: function () { return rango; },
        setFontWeights: function () { return rango; }, setFontLines: function () { return rango; }, setWrapStrategy: function () { return rango; },
        setNote: function () { return rango; }, merge: function () { return rango; }, setRichTextValues: function () { return rango; },
        protect: function () { return h.protect(); }, getA1Notation: function () { return 'A1'; }, getRow: function () { return f; }, getColumn: function () { return c; },
        getNumRows: function () { return nf; }, getNumColumns: function () { return nc; }
      };
      return rango;
    }
    getRangeList() { const r = {}; ['setNumberFormat', 'setBackground', 'setFontColor', 'setFontWeight', 'setWrap', 'setFontLine'].forEach(function (k) { r[k] = function () { return r; }; }); return r; }
    getLastRow() { for (let i = this.v.length; i >= 1; i--) if (this.v[i - 1].some(function (x) { return x !== '' && x !== null && x !== undefined; })) return i; return 0; }
    getLastColumn() { let m = 0; this.v.forEach(function (r) { for (let j = r.length; j >= 1; j--) if (r[j - 1] !== '' && r[j - 1] != null) { m = Math.max(m, j); break; } }); return m; }
    getMaxRows() { return Math.max(this.v.length, 1000); }
    getMaxColumns() { return Math.max(this.getLastColumn(), 26); }
    getName() { return this.nombre; }
    insertRowsAfter() {} insertRowBefore(n) { this.v.splice(n - 1, 0, []); this.bg.splice(n - 1, 0, []); }
    deleteRows(f, n) { this.v.splice(f - 1, n); this.bg.splice(f - 1, n); }
    deleteRow(f) { this.deleteRows(f, 1); }
    appendRow(r) { const f = this.getLastRow() + 1; this.getRange(f, 1, 1, r.length).setValues([r]); }
    setFrozenRows() {} setFrozenColumns() {} setColumnWidth() {} setColumnWidths() {} setRowHeight() {} setRowHeights() {} setTabColor() {}
    clear() { this.v = []; this.bg = []; }
    clearContents() { this.v = this.v.map(function (r) { return r.map(function () { return ''; }); }); }
    clearFormats() {} clearConditionalFormatRules() {} setConditionalFormatRules() {} getConditionalFormatRules() { return []; }
    getProtections() { return []; }
    protect() { const pr = {}; ['setDescription', 'setWarningOnly', 'setUnprotectedRanges', 'addEditor', 'removeEditors', 'setDomainEdit'].forEach(function (k) { pr[k] = function () { return pr; }; });
      pr.getDescription = function () { return ''; }; pr.isWarningOnly = function () { return true; }; pr.getEditors = function () { return []; }; pr.canDomainEdit = function () { return false; }; return pr; }
    hideColumns() {} showColumns() {} autoResizeColumns() {} isColumnHiddenByUser() { return false; } getFrozenRows() { return 0; }
    getSheetId() { return 1; } activate() {} showSheet() {} hideSheet() {} isSheetHidden() { return false; } getIndex() { return 1; }
  }
  E.Hoja = Hoja;
  const planillas = {};
  E.planilla = function (id) {
    if (!planillas[id]) planillas[id] = { hojas: {}, getSheetByName: function (n) { return this.hojas[n] || null; },
      insertSheet: function (n) { this.hojas[n] = new Hoja(n, []); return this.hojas[n]; },
      getSheets: function () { return Object.keys(this.hojas).map(function (k) { return this.hojas[k]; }, this); },
      deleteSheet: function (sh) { delete this.hojas[sh.nombre]; }, setActiveSheet: function () {}, moveActiveSheet: function () {},
      getSpreadsheetTimeZone: function () { return 'America/Argentina/Buenos_Aires'; }, getUrl: function () { return 'https://x/' + id; }, getId: function () { return id; } };
    return planillas[id];
  };
  const blob = function (bytes) { return { getBytes: function () { return Array.from(bytes); }, getDataAsString: function () { return Buffer.from(bytes).toString('utf8'); } }; };
  const ctx = {
    console: console, Date: D, Math: Math, JSON: JSON, Map: Map, Set: Set, Object: Object, Array: Array, String: String, Number: Number,
    RegExp: RegExp, Error: Error, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat, Buffer: undefined,
    Logger: { log: function () { const a = Array.prototype.slice.call(arguments); let s = String(a.shift()); s = s.replace(/%s/g, function () { return String(a.shift()); }); E.logs.push(s); } },
    Utilities: {
      formatDate: function (d, tz, f) { return f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate())).replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds())); },
      getUuid: function () { E.uuid++; return 'uuid-' + E.uuid + '-xxxx'; }, sleep: function () {},
      DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: function (alg, t) { return Array.from(crypto.createHash('md5').update(String(t), 'utf8').digest()).map(function (b) { return b > 127 ? b - 256 : b; }); },
      base64Encode: function (b) { return Buffer.from(b.map(function (x) { return x & 255; })).toString('base64'); },
      base64Decode: function (s) { return Array.from(Buffer.from(s, 'base64')); },
      newBlob: function (d) { return blob(typeof d === 'string' ? Buffer.from(d, 'utf8') : Buffer.from(d.map(function (x) { return x & 255; }))); },
      gzip: function (b) { return blob(zlib.gzipSync(Buffer.from(b.getBytes()))); },
      ungzip: function (b) { return blob(zlib.gunzipSync(Buffer.from(b.getBytes()))); }
    },
    SpreadsheetApp: { openById: function (id) { return E.planilla(id); }, flush: function () {}, ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
      newDataValidation: function () { const b = { requireValueInList: function () { return b; }, setAllowInvalid: function () { return b; }, build: function () { return b; } }; return b; },
      newTextStyle: function () { const b = {}; ['setStrikethrough', 'setForegroundColor', 'setBold', 'setUnderline'].forEach(function (k) { b[k] = function () { return b; }; }); b.build = function () { return b; }; return b; },
      newRichTextValue: function () { const b = {}; ['setText', 'setTextStyle', 'setLinkUrl'].forEach(function (k) { b[k] = function () { return b; }; }); b.build = function () { return b; }; return b; },
      BorderStyle: { SOLID_MEDIUM: 1, SOLID: 1, SOLID_THICK: 1 }, WrapStrategy: { WRAP: 1, CLIP: 1 } },
    Session: { getEffectiveUser: function () { return { getEmail: function () { return 'yo@test'; } }; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    registrarAviso_: function () {},
    PropertiesService: { getScriptProperties: function () { E.props = E.props || {}; return { getProperty: function (k) { return k in E.props ? E.props[k] : null; },
      setProperty: function (k, v) { E.props[k] = String(v); }, deleteProperty: function (k) { delete E.props[k]; }, getProperties: function () { return Object.assign({}, E.props); } }; } },
    CacheService: { getScriptCache: function () { if (!servicios.cache) throw new Error('sin cache'); return servicios.cache; } },
    GmailApp: servicios.gmail ? servicios.gmail.app : { getUserLabelByName: function () { return null; }, search: function () { return []; } }
  };
  vm.createContext(ctx);
  const cfg = Object.assign({ DERIVADAS_POR_SCRIPT: 'false', AGENDA_SOLO_SEMANA: 'null', AGENDA_CANCELACION_AUTOMATICA: 'true', AGENDA_CANCELACION_MODO: "'suspender'",
    AGENDA_VISTAS_NUEVAS: 'false', AGENDA_COPIA_EN_RDV: 'false', AGENDA_MAIL_FORMATO_DIRECTA: 'false', AGENDA_COLORES_MAIL: 'true' }, config || {});
  ARCHIVOS.forEach(function (f) {
    let s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    if (f === '00_Config.js') Object.keys(cfg).forEach(function (k) { s = s.replace(new RegExp('^const ' + k + '\\s+=.*', 'm'), 'const ' + k + ' = ' + cfg[k] + ';'); });
    vm.runInContext(s, ctx, { filename: f });
  });
  // el geocodificador: una tabla dirección → barrio (un punto interior), y cuenta las consultas
  ctx._geocodificar_ = function (consulta) {
    E.geo.push(consulta);
    if (typeof ctx.agendaTiempoSumar_ === 'function') ctx.agendaTiempoSumar_('geo', 0, 1);   // como el de verdad (REGISTRO_CORRIDAS agenda_geo_n)
    if (E.geoError) return { consulta: consulta, estado: 'ERROR', lat: '', lng: '', fecha: '2026-10-16 12:00', detalle: 'cuota' };
    const k = Object.keys(E.tablaGeo || {}).filter(function (x) { return consulta.indexOf(x) === 0; })[0];
    if (!k) return { consulta: consulta, estado: 'ZERO_RESULTS', lat: '', lng: '', fecha: '2026-10-16 12:00' };
    const p = E.punto(E.tablaGeo[k]);
    return { consulta: consulta, estado: 'OK', lat: p.lat, lng: p.lng, tipo: 'ROOFTOP', parcial: false, fecha: '2026-10-16 12:00' };
  };
  E.ctx = ctx;
  E.run = function (expr) { vm.runInContext('_ssDestino_ = null; _ssIntermedia_ = null; _cacheParsing_ = null; _versionColoresAgenda_ = null;', ctx); E.logs = []; return vm.runInContext(expr, ctx); };
  const puntos = {};
  E.punto = function (barrio) {
    if (!puntos[barrio]) puntos[barrio] = vm.runInContext(`(function () {
      const p = _poligonosBarrios_().filter(function (b) { return normalizeText_(b.barrio) === normalizeText_(${JSON.stringify(barrio)}); })[0];
      let x = 0, y = 0, n = 0; p.anillos[0].forEach(function (v, i) { if (i % 2 === 0) { x += v; n++; } else y += v; });
      return { lng: x / n, lat: y / n }; })()`, ctx);
    return puntos[barrio];
  };
  return E;
}

const HDR = (function () {
  const fx = fs.readFileSync(path.join(RAIZ, 'fixtures', 'RVD JM-CM - ES.csv'), 'utf8').split(/\r?\n/)[0].split(',');
  const nombres = { C: 'EVENTO', F: 'HORA', H: 'One Page Entregado', I: 'STATUS REUNIÓN', J: 'Observaciones', L: 'Mail', M: 'Call Center', N: 'IVR',
    O: 'RRSS', P: 'Difusión', R: 'Oradores anotados', S: 'Oradores que hablaron', T: 'Temas mas comentados', U: 'Semaforo politico', V: 'Síntesis cualitativa:',
    AH: 'Masculinos', AI: 'Femeninos', AJ: '18-24', AK: '25-39', AL: '40-55', AM: '56-65', AN: '66+', AO: 'Sin identificar' };
  return fx.map(function (h) { const m = /^PENDIENTE_([A-Z]+)$/.exec(h); return m && nombres[m[1]] ? nombres[m[1]] : h; })
           .concat(['RDV_UID', 'form_origen', 'form_score', 'form_nivel', 'form_fecha_match', 'form_clave']);
})();
const COLUMNAS_AGENDA = ['No participa', 'agenda_uid', 'agenda_mail', 'agenda_version', 'agenda_hora_escrita', 'agenda_direccion_escrita', 'agenda_barrio_escrito',
  'agenda_fecha_escrita', 'agenda_status_escrito', 'Origen fila', 'Tocado por el equipo', 'Evento (mail)', 'Lugar (mail)', 'Dirección (mail)', 'Marcas (mail)', 'Conjunta con'];
const BARRIOS = [['Recoleta', 2], ['Palermo', 14], ['Almagro', 5], ['Boedo', 5], ['Belgrano', 13], ['Núñez', 13], ['Colegiales', 13], ['Flores', 7],
  ['Parque Chacabuco', 7], ['San Nicolás', 1], ['Monserrat', 1], ['Villa Urquiza', 12], ['Villa Santa Rita', 11], ['Villa Devoto', 11]];
const FIGURAS = ['Clara Muzzio', 'Jorge Macri', 'Hernán Lombardi', 'Gabino Tapia', 'Laura Alonso', 'Ezequiel Sabor'];

function montar(config, servicios, filasExtra) {
  const E = crearEntorno(config, servicios);
  const hdr = HDR.concat(COLUMNAS_AGENDA);
  const C = function (n) { return hdr.indexOf(n); };
  const filas = [hdr];
  FIGURAS.forEach(function (fig, i) {
    const r = hdr.map(function () { return ''; });
    r[C('Figura')] = fig; r[C('Barrio')] = BARRIOS[i][0]; r[C('FECHA')] = new D(2026, 8, 10 + i, 12); r[C('HORA')] = '18:00';
    r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = 'Realizada'; r[C('Inscriptos')] = 100 + i;
    filas.push(r);
  });
  (filasExtra || []).forEach(function (fn) { const r = hdr.map(function () { return ''; }); fn(r, C); filas.push(r); });
  const ssD = E.planilla(E.run('RDV_SS_DESTINO')), ssI = E.planilla(E.run('RDV_SS_INTERMEDIA'));
  ssD.hojas['RVD JM-CM - ES'] = new E.Hoja('RVD JM-CM - ES', filas);
  ssD.hojas['Comunas'] = new E.Hoja('Comunas', [['Barrio', 'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona', 'Eje geográfico']]
    .concat(BARRIOS.map(function (b) { return [b[0], b[1], 1, 1, 1, 1, 1, 'Centro', '']; })));
  ssD.hojas['RDV CONJUNTO'] = new E.Hoja('RDV CONJUNTO', [['Figura', 'Barrio', 'FECHA', 'Asistentes', 'Oradores anotados', 'Oradores que hablaron']]);
  E.D = ssD.hojas['RVD JM-CM - ES']; E.ssI = ssI; E.ssD = ssD; E.C = C; E.hdr = hdr;
  E.tablaGeo = { 'Av. Santa Fe 1234': 'Recoleta', 'Serrano 1500': 'Palermo', 'Bulnes 1000': 'Almagro', 'Cabildo 2000': 'Belgrano',
                 'Av. Intendente Bullrich 55': 'Palermo' };
  return E;
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const NL = String.fromCharCode(10);
let idMail = 0;
/** Un bloque de reunión: el día, "Evento:", "Hora:", "Lugar:". */
function bloque(d, figura, lugar, hora, dir) {
  const f = new D(2026, 9, d, 12);
  if (d > 31) f.setTime(new D(2026, 10, d - 31, 12).getTime());
  return ['*' + DIAS[f.getDay()] + ' ' + pad(f.getDate()) + '/' + pad(f.getMonth() + 1) + '*', 'Evento: Encuentro con Vecinos ' + figura + ', ' + lugar,
          'Hora: ' + hora + 'h', 'Lugar: ' + dir];
}
const ROJO = 'background-color:#ff0000';
/** Un mail (texto y HTML con las mismas líneas); `rojos`: los índices de los bloques en ROJO ENTERO. */
function mail(fecha, asunto, bloques, rojos) {
  const html = '<div dir="ltr">' + bloques.map(function (b, i) {
    const rojo = (rojos || []).indexOf(i) >= 0;
    return b.map(function (l) { const t = l.replace(/^\*(.*)\*$/, '<b>$1</b>'); return '<div>' + (rojo ? '<span style="' + ROJO + '">' + t + '</span>' : t) + '</div>'; }).join('') + '<br>';
  }).join('') + '</div>';
  return { fecha: fecha, asunto: asunto, cuerpo: [].concat.apply([], bloques).join(NL), html: html, id: 'm' + (++idMail) };
}
const ASUNTO = function (a, b) { return 'Agenda Encuentros de vecinos con CM y Ministros - Semana del ' + a + ' al ' + b; };

// ============================== [1] la geocodificación ==============================

/** El plan de la agenda (en seco, sin escribir) sobre unos mails, con la geocodificación del sistema (no la de los tests viejos). */
function plan(E, mails, extra) {
  E.ctx.__m = mails; E.ctx.__x = extra || {};
  return E.run('(function () { var d = leerDestino_(), A = indicesAgenda_(d.hdr); var r = agendaDesdeListaDeMails_(__m, { fuente: "x" }); ' +
               'var P = planAgenda_(d, r, A, alcanceAgenda_(), Object.assign({ enSeco: true, conjunto: new Map(), historial: leerHistorialAgenda_(), elecciones: new Map() }, __x)); ' +
               '_logGeoAgenda_(P); return P; })()');
}
function cacheGeo(E, filas) {
  E.ssI.hojas['AGENDA_GEOCODE'] = new E.Hoja('AGENDA_GEOCODE', [E.run('GEOCODE_ENCABEZADO')].concat(filas));
}
const SUF = ', Ciudad Autónoma de Buenos Aires, Argentina';

console.log('[1] la geocodificación: lo que no se pide, la cache de los fallos, el tope de 20 (las más cercanas primero), las abreviaturas');
{
  const E = montar();
  const pR = E.punto('Recoleta');
  cacheGeo(E, [
    ['Av. Santa Fe 1234' + SUF, 'OK', pR.lat, pR.lng, 'ROOFTOP', 'FALSE', '', '', '', '2026-09-01 10:00', ''],              // resuelta
    ['Calle Falla Reciente 10' + SUF, 'ZERO_RESULTS', '', '', '', 'FALSE', '', '', '', '2026-10-14 10:00', ''],              // hace 2 días
    ['Calle Falla Vieja 20' + SUF, 'ZERO_RESULTS', '', '', '', 'FALSE', '', '', '', '2026-10-05 10:00', ''],                 // hace 11 días
    ['Calle Error Reciente 30' + SUF, 'ERROR', '', '', '', 'FALSE', '', '', 'cuota', '2026-10-16 08:00', ''],                // hace 4 h
    ['Calle Error Viejo 40' + SUF, 'ERROR', '', '', '', 'FALSE', '', '', 'cuota', '2026-10-15 06:00', '']                   // hace 30 h
  ]);
  const M = mail(new D(2026, 9, 12, 9), ASUNTO('12/10', '18/10'), [
    bloque(16, 'Clara Muzzio', 'Comuna 2', '18:00', 'A CONFIRMAR'),
    bloque(16, 'Jorge Macri', 'Comuna 2', '10:00', 'Av. Santa Fe 1234, Club'),
    bloque(17, 'Hernán Lombardi', 'Comuna 2', '11:00', 'Calle Falla Reciente 10, Club'),
    bloque(17, 'Gabino Tapia', 'Comuna 2', '12:00', 'Calle Falla Vieja 20, Club'),
    bloque(18, 'Laura Alonso', 'Comuna 2', '13:00', 'Calle Error Reciente 30, Club'),
    bloque(18, 'Ezequiel Sabor', 'Comuna 14', '14:00', 'Calle Error Viejo 40, Club'),
    bloque(17, 'Jorge Macri', 'Comuna 14', '18:00', 'Av. Int. Bullrich 55, La Mezquita')
  ]);
  const P = plan(E, [M]);
  const G = P.geo;
  ok(E.geo.indexOf('A CONFIRMAR' + SUF) < 0 && G.sinDireccion >= 1, '"A CONFIRMAR" no se geocodifica (sin dirección: ' + G.sinDireccion + ')');
  ok(E.geo.every(function (q) { return q.indexOf('Av. Santa Fe 1234') < 0; }) && G.cache >= 1, 'la dirección resuelta en la cache no se vuelve a pedir');
  ok(E.geo.every(function (q) { return q.indexOf('Calle Falla Reciente') < 0; }) && G.fallosCache >= 1,
     'un "sin resultado" de hace 2 días: se usa el fallo de la cache, no se pide (GEOCODE_REINTENTAR_FALLOS_DIAS = 7)');
  ok(E.geo.some(function (q) { return q.indexOf('Calle Falla Vieja 20') === 0; }), 'uno de hace 11 días se vuelve a pedir (reintento)');
  ok(E.geo.every(function (q) { return q.indexOf('Calle Error Reciente') < 0; }), 'un ERROR de hace 4 h no se pide (GEOCODE_REINTENTAR_ERROR_HORAS = 24)');
  ok(E.geo.some(function (q) { return q.indexOf('Calle Error Viejo 40') === 0; }) && G.reintentos === 2, 'uno de hace 30 h sí (reintentos: ' + G.reintentos + ')');
  ok(E.geo.indexOf('Av. Intendente Bullrich 55' + SUF) >= 0 && E.geo.every(function (q) { return q.indexOf('Int. Bullrich') < 0; }),
     'la consulta a Maps lleva la abreviatura expandida: "Av. Intendente Bullrich 55, …" (' + E.geo.filter(function (q) { return /Bullrich/.test(q); }).join(' / ') + ')');
  const crear = P.acciones.filter(function (a) { return a.tipo === 'crear' && a.ev.figuraFila === 'Jorge Macri' && a.ev.hora === '18:00'; })[0];
  ok(crear && crear.barrio && crear.barrio.barrio === 'Palermo' && crear.escrituras.some(function (e) { return e.col === E.C('Dirección') + 1 && /Av\. Int\. Bullrich 55/.test(e.valor); }),
     'Bullrich 55 da Palermo (Comuna 14) y en la base se escribe la dirección del MAIL, tal cual ("Av. Int. Bullrich 55, …")');
  ok(E.logs.some(function (l) { return /geocodificación: \d+ llamadas a Maps \(tope 20\)/.test(l); }) &&
     E.logs.some(function (l) { return /Maps: "Calle Falla Vieja 20, Ciudad.*\[reintento de un fallo viejo\]/.test(l); }),
     'el log dice cuántas llamadas y para qué direcciones (y cuáles son reintentos)');
  // la cache guarda TAMBIÉN los fallos (con su fecha): la próxima corrida no los pide
  E.ctx.__P = P; E.run('_agregarCacheGeocode_(__P.geocodeNuevas)');
  const filasCache = E.ssI.hojas['AGENDA_GEOCODE'].v.slice(1);
  ok(filasCache.some(function (r) { return /^Calle Error Viejo 40/.test(r[0]) && r[1] === 'ZERO_RESULTS' && r[9] === '2026-10-16 12:00'; }) &&
     filasCache.some(function (r) { return /^Calle Falla Vieja 20/.test(r[0]) && r[9] === '2026-10-16 12:00'; }),
     'lo pedido (también un fallo) queda en AGENDA_GEOCODE con la fecha de hoy');
  E.geo = [];
  const P2 = plan(E, [M]);
  ok(E.geo.length === 0, 'la corrida siguiente no pide nada: todo sale de la cache (' + E.geo.length + ' llamadas; de la cache ' + P2.geo.cache + ' + ' + P2.geo.fallosCache + ' fallos)');
  // la cache con la forma VIEJA de la consulta (sin expandir): si resolvió exacta, se usa; si dio parcial, se pide la expandida
  const Ex = montar();
  const pP = Ex.punto('Palermo');
  cacheGeo(Ex, [['Av. Int. Bullrich 99' + SUF, 'OK', pP.lat, pP.lng, 'ROOFTOP', 'FALSE', '', '', '', '2026-09-01 10:00', ''],
                ['Av. Gral. Paz 100' + SUF, 'OK', pP.lat, pP.lng, 'ROOFTOP', 'TRUE', '', '', '', '2026-09-01 10:00', '']]);
  Ex.tablaGeo['Av. General Paz 100'] = 'Palermo';
  plan(Ex, [mail(new D(2026, 9, 12, 9), ASUNTO('12/10', '18/10'), [bloque(17, 'Jorge Macri', 'Comuna 14', '18:00', 'Av. Int. Bullrich 99, Club'),
                                                                   bloque(18, 'Gabino Tapia', 'Comuna 14', '10:00', 'Av. Gral. Paz 100, Club')])]);
  ok(Ex.geo.length === 1 && Ex.geo[0] === 'Av. General Paz 100' + SUF,
     'la forma vieja resuelta exacta se sigue usando (Bullrich 99: sin llamada); la que dio PARCIAL se pide expandida ("Av. General Paz 100")');
  // con el ahorro apagado: un ERROR no se lee de la cache (el comportamiento de antes)
  const Ev = montar({ AGENDA_GEO_AHORRO: 'false' });
  cacheGeo(Ev, [['Calle Error Reciente 30' + SUF, 'ERROR', '', '', '', 'FALSE', '', '', 'cuota', '2026-10-16 08:00', '']]);
  plan(Ev, [mail(new D(2026, 9, 12, 9), ASUNTO('12/10', '18/10'), [bloque(18, 'Laura Alonso', 'Comuna 2', '13:00', 'Calle Error Reciente 30, Club')])]);
  ok(Ev.geo.length === 1, 'AGENDA_GEO_AHORRO = false: como antes (el ERROR de la cache se vuelve a pedir)');
}

console.log('[1b] el tope de 20 por corrida, las reuniones más cercanas en fecha primero; lo pendiente no se crea');
{
  const E = montar();
  // 32 reuniones con direcciones distintas: la semana pasada (05 a 11/10), ésta (12 a 18), la próxima (19 a 25) y la otra (26/10 a 01/11)
  const semanas = [[5, '05/10', '11/10', new D(2026, 9, 5, 9)], [12, '12/10', '18/10', new D(2026, 9, 12, 9)], [19, '19/10', '25/10', new D(2026, 9, 15, 9)],
                   [26, '26/10', '01/11', new D(2026, 9, 16, 9)]];
  const todas = [], mails = [];
  semanas.forEach(function (s, k) {
    const bs = [];
    for (let i = 0; i < 8; i++) {
      const d = s[0] + (i % 7), fig = FIGURAS[i % 6], hora = pad(8 + i) + ':00';
      const dir = 'Calle Prueba ' + (k * 100 + i + 1) + ', Club';
      bs.push(bloque(d, fig, 'Comuna 2', hora, dir));
      todas.push({ d: d, dir: 'Calle Prueba ' + (k * 100 + i + 1) });
    }
    mails.push(mail(s[3], ASUNTO(s[1], s[2]), bs));
  });
  E.tablaGeo['Calle Prueba'] = 'Recoleta';
  const P = plan(E, mails);
  // lo esperado: hoy en adelante, de la más próxima; después las pasadas, de la más reciente; a igual fecha, por la consulta
  const hoy = 16;
  const orden = todas.slice().sort(function (a, b) {
    const fa = a.d >= hoy, fb = b.d >= hoy;
    if (fa !== fb) return fa ? -1 : 1;
    const dd = fa ? a.d - b.d : b.d - a.d;
    return dd || ((a.dir + SUF) < (b.dir + SUF) ? -1 : 1);
  });
  const esperadas = orden.slice(0, 20).map(function (x) { return x.dir; }).sort();
  const pedidas = E.geo.map(function (q) { return q.replace(SUF, ''); });
  ok(pedidas.length === 20 && P.geo.llamadas === 20, 'tope: 20 llamadas a Maps (de ' + todas.length + ' direcciones nuevas)');
  const dias = todas.filter(function (x) { return pedidas.indexOf(x.dir) >= 0; }).map(function (x) { return x.d; }).sort(function (a, b) { return a - b; });
  ok(JSON.stringify(pedidas.slice().sort()) === JSON.stringify(esperadas),
     'las pedidas son las más cercanas en fecha: las de hoy en adelante primero, de la más próxima (días ' + dias.join(',') + ')');
  ok(P.geo.pendientesTope > 0 && P.creacionGeoDiferida.length > 0 &&
     P.creacionGeoDiferida.every(function (ev) { return !P.acciones.some(function (a) { return a.tipo === 'crear' && a.ev === ev; }); }),
     'las que no entraron no se crean en esta corrida (' + P.creacionGeoDiferida.length + '), ni sin barrio');
  ok(P.copia.some(function (c) { return /se crea en la próxima corrida \(falta geocodificar/.test(c.estado); }), 'y la copia lo dice ("se crea en la próxima corrida")');
  ok(P.acciones.filter(function (a) { return a.tipo === 'crear'; }).every(function (a) { return a.barrio && a.barrio.barrio === 'Recoleta'; }),
     'las que se crean, con su barrio');
}

console.log('[1c] la guarda de tiempo (sólo hoy a 3 días) y un barrio pendiente que no se toca');
{
  const E = montar({}, null, [function (r, C) {
    // una fila de la agenda (Muzzio 21/10) con el barrio del sistema, y el mail le cambia la dirección a una que no está en la cache
    r[C('Figura')] = 'Clara Muzzio'; r[C('FECHA')] = new D(2026, 9, 21, 12); r[C('HORA')] = '18:00'; r[C('Barrio')] = 'Recoleta';
    r[C('STATUS REUNIÓN')] = 'en agenda'; r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('Dirección')] = 'Av. Santa Fe 1234, Club';
    r[C('agenda_uid')] = 'c-1'; r[C('agenda_hora_escrita')] = '18:00'; r[C('agenda_direccion_escrita')] = 'Av. Santa Fe 1234, Club';
    r[C('agenda_barrio_escrito')] = 'Recoleta'; r[C('agenda_fecha_escrita')] = new D(2026, 9, 21, 12); r[C('agenda_status_escrito')] = 'en agenda';
  }]);
  const M = mail(new D(2026, 9, 15, 9), ASUNTO('19/10', '25/10'), [
    bloque(19, 'Jorge Macri', 'Comuna 2', '10:00', 'Calle Cerca 1, Club'),          // dentro de los 3 días
    bloque(21, 'Clara Muzzio', 'Comuna 2', '18:00', 'Calle Lejos 2, Club'),         // a 5 días: pendiente
    bloque(23, 'Gabino Tapia', 'Comuna 2', '12:00', 'Calle Lejos 3, Club')
  ]);
  E.tablaGeo['Calle'] = 'Recoleta';
  const P = plan(E, [M], { geoSoloDias: 3 });
  ok(E.geo.length === 1 && /^Calle Cerca 1/.test(E.geo[0]) && P.geo.pendientesTiempo >= 2,
     'con la guarda de tiempo sólo se geocodifica la de los próximos 3 días (' + E.geo.join(' / ') + '; diferidas ' + P.geo.pendientesTiempo + ')');
  const act = P.acciones.filter(function (a) { return a.f && a.f.figura === 'Clara Muzzio'; })[0];
  ok(act && !act.escrituras.some(function (e) { return e.col === E.C('Barrio') + 1 || e.col === E.C('agenda_barrio_escrito') + 1; }) &&
     act.escrituras.some(function (e) { return e.col === E.C('Dirección') + 1; }),
     'la fila de Muzzio: la dirección se actualiza, pero el barrio PENDIENTE no se toca (antes se vaciaba)');
  ok(!P.acciones.some(function (a) { return a.tipo === 'crear' && a.ev.figuraFila === 'Gabino Tapia'; }) &&
     P.acciones.some(function (a) { return a.tipo === 'crear' && a.ev.figuraFila === 'Jorge Macri'; }),
     'la de Tapia (23/10) no se crea en esta corrida; la de Macri (19/10), sí');
}

// ============================== [2] la cache de los mails ==============================

console.log('[2] la cache de los mails: con y sin cache, la misma base, la misma copia y el mismo registro');
const V1 = mail(new D(2026, 9, 12, 9), ASUNTO('12/10', '18/10'), [bloque(16, 'Clara Muzzio', 'Recoleta', '18:30', 'Av. Santa Fe 1234, Club'),
  bloque(17, 'Ezequiel Sabor', 'Comuna 5', '09:45', 'Bulnes 1000, Club'), bloque(18, 'Gabino Tapia', 'Núñez', '10:00', 'Cabildo 2000, Club')]);
const V2 = mail(new D(2026, 9, 13, 14), ASUNTO('12/10', '18/10'), [bloque(16, 'Clara Muzzio', 'Recoleta', '18:30', 'Av. Santa Fe 1234, Club'),
  bloque(17, 'Ezequiel Sabor', 'Comuna 5', '09:45', 'Bulnes 1000, Club'), bloque(18, 'Gabino Tapia', 'Núñez', '11:00', 'Cabildo 2000, Club')], [1]);   // Sabor en ROJO
const RE = mail(new D(2026, 9, 14, 10), 'Re: ' + ASUNTO('12/10', '18/10'), [bloque(18, 'Hernán Lombardi', 'Comuna 2', '17:00', 'Serrano 1500, Club')]);
RE.cuerpo += NL + NL + 'El mar, 13 oct 2026 a las 14:00, Alguien <a@b.c> escribió:' + NL + '> ' + V2.cuerpo.split(NL).join(NL + '> ');
const W1 = mail(new D(2026, 9, 15, 9), ASUNTO('19/10', '25/10'), [bloque(20, 'Jorge Macri', 'Palermo', '10:00', 'Serrano 1500, Club'),
  bloque(22, 'Laura Alonso', 'Comuna 2', '12:00', 'A CONFIRMAR')]);
const HILOS = function () { return [{ id: 'h1', msgs: [V1, V2, RE] }, { id: 'h2', msgs: [W1] }]; };

/** Una corrida REAL de la agenda (Gmail simulado), sobre una base nueva; devuelve lo que dejó (base, copia, registro, cache). */
function corridaAgenda(config, servicios) {
  const E = montar(config, servicios);
  E.run('correrAgendaEnBloqueo_(false)');
  E.logsCorrida = E.logs.slice();
  const copia = E.planilla(E.run('AGENDA_COPIA_SS'));
  const foto = { base: JSON.stringify(E.D.v), copia: JSON.stringify(Object.keys(copia.hojas).sort().map(function (k) { return [k, copia.hojas[k].v]; })),
                 registro: JSON.stringify((E.ssI.hojas['REGISTRO_AGENDA_CAMBIOS'] || { v: [] }).v),
                 dups: JSON.stringify((E.ssD.hojas['AGENDA_DUPLICADOS'] || { v: [] }).v) };
  return { E: E, foto: foto };
}
{
  const gA = gmail(HILOS()), sinCache = corridaAgenda({ AGENDA_CACHE_MAILS: 'false' }, { gmail: gA });
  const svc = cacheServicio();
  const gB = gmail(HILOS()), fria = corridaAgenda({}, { gmail: gB, cache: svc });
  const gC = gmail(HILOS()), tibia = corridaAgenda({}, { gmail: gC, cache: svc });
  const igual = function (a, b) { return ['base', 'copia', 'registro', 'dups'].every(function (k) { return a.foto[k] === b.foto[k]; }); };
  ok(/Suspendida|cancelada|rojo/i.test(sinCache.foto.copia + sinCache.foto.base) && sinCache.E.D.v.length > 7,
     'el escenario tiene de todo: filas nuevas, un "Re:" que agrega a Lombardi, y Sabor en ROJO (cancelada en el mail)');
  ok(igual(sinCache, fria), 'cache FRÍA (la primera corrida): la misma base, copia, registro y AGENDA_DUPLICADOS que sin cache');
  ok(igual(sinCache, tibia), 'cache TIBIA (la siguiente, todo de la cache): lo mismo');
  ok(gA.getMessages >= 2 && gB.getMessages === gA.getMessages, 'sin cache y con la cache fría se bajan los hilos (' + gA.getMessages + ' getMessages)');
  ok(gC.getMessages === 0 && gC.getPlainBody === 0 && gC.getBody === 0,
     'con la cache tibia NO se baja nada de Gmail: 0 getMessages, 0 getPlainBody, 0 getBody (antes: ' + gA.getMessages + ', ' + gA.getPlainBody + ', ' + gA.getBody + ')');
  ok(tibia.E.logsCorrida.some(function (l) { return /parser: textos de la cache [1-9]\d* \| repetidos en esta corrida \d+ \| parseados 0$/.test(l); }),
     'y no se parsea nada: ' + (tibia.E.logsCorrida.filter(function (l) { return /parser: textos/.test(l); })[0] || '?'));
  ok(Object.keys(svc.datos).every(function (k) { return String(svc.datos[k]).length <= 100000; }) && Object.keys(svc.datos).some(function (k) { return /^agp\|/.test(k); }) &&
     /^z:/.test(svc.datos[Object.keys(svc.datos).filter(function (k) { return /^agm\|/.test(k); })[0]]),
     'lo guardado: por hilo, por mensaje, los colores y lo parseado, comprimido y de menos de 100 KB por clave');

  // un mensaje NUEVO en un hilo (una versión más de la semana 19/10): se baja sólo ese hilo y se parsea sólo lo nuevo
  const W2 = mail(new D(2026, 9, 16, 8), ASUNTO('19/10', '25/10'), [bloque(20, 'Jorge Macri', 'Palermo', '10:30', 'Serrano 1500, Club'),
    bloque(22, 'Laura Alonso', 'Comuna 2', '12:00', 'Bulnes 1000, Club')]);
  const H2 = function () { const h = HILOS(); h[1].msgs.push(W2); return h; };
  const gD = gmail(H2()), sin2 = corridaAgenda({ AGENDA_CACHE_MAILS: 'false' }, { gmail: gD });
  const gE = gmail(H2()), con2 = corridaAgenda({}, { gmail: gE, cache: svc });
  ok(igual(sin2, con2), 'con un mensaje nuevo: con y sin cache, el mismo resultado');
  ok(gE.getMessages === 1 && gE.getPlainBody === 1 && gE.getBody === 1, 'se baja SÓLO el hilo que cambió y sólo el mensaje nuevo (getMessages ' +
     gE.getMessages + ', getPlainBody ' + gE.getPlainBody + ', getBody ' + gE.getBody + ')');
  const lp = con2.E.logsCorrida.filter(function (l) { return /parser: textos/.test(l); })[0] || '';
  ok(/parseados [1-4]$/.test(lp), 'y se parsea sólo lo nuevo: ' + lp);

  // otra versión del parser (AGENDA_PARSER_VERSION): lo parseado guardado no sirve; el resultado, igual
  const gF = gmail(H2()), otra = corridaAgenda({ AGENDA_PARSER_VERSION: "'2'" }, { gmail: gF, cache: svc });
  const lo = otra.E.logsCorrida.filter(function (l) { return /parser: textos/.test(l); })[0] || '';
  ok(igual(sin2, otra) && /textos de la cache 0 \|/.test(lo), 'AGENDA_PARSER_VERSION distinta: se parsea todo de nuevo (' + lo + ') y da lo mismo');
  // la cache que no responde: se sigue sin ella
  const roto = cacheServicio(); roto.get = function () { throw new Error('Cache no responde'); }; roto.putAll = function () { throw new Error('Cache no responde'); };
  const gG = gmail(H2()), rota = corridaAgenda({}, { gmail: gG, cache: roto });
  ok(igual(sin2, rota), 'si la cache de Apps Script falla, la corrida baja y parsea todo y da lo mismo');
}

console.log('[2b] la serialización de una reunión: fechas, undefined, NaN y el orden de los campos');
{
  const E = montar();
  E.ctx.__o = { a: new D(2026, 9, 16, 12), b: undefined, c: NaN, d: [new D(2026, 0, 1), { e: null, f: 'x' }], g: 1 };
  const r = E.run('(function () { var x = deJsonAgenda_(aJsonAgenda_(__o)); return { k: Object.keys(x).join(","), a: x.a instanceof Date && x.a.getTime(), ' +
                  'b: "b" in x && x.b === undefined, c: isNaN(x.c), d: x.d[0] instanceof Date && x.d[0].getTime(), f: x.d[1].f, e: x.d[1].e }; })()');
  ok(r.k === 'a,b,c,d,g' && r.a === new D(2026, 9, 16, 12).getTime() && r.b && r.c && r.d === new D(2026, 0, 1).getTime() && r.f === 'x' && r.e === null,
     'ida y vuelta sin perder nada: ' + JSON.stringify(r));
}

// ============================== [3] la base, una vez por corrida ==============================

console.log('[3] la base UNA vez por corrida: la que leyó la agenda la reusan las partes siguientes mientras nadie escriba');
{
  const E = montar();
  E.run('baseCorridaIniciar_(); corridaIniciar_(new Date(), false, false);');
  const d1 = E.run('leerDestino_()');
  const lect = E.D.lecturas;
  E.ctx.__d1 = d1;
  ok(E.run('baseCorridaTomar_("dest", "el cruce") === __d1') && E.D.lecturas === lect + 1,
     'el cruce reusa la base que leyó la agenda (sólo relee la identidad de las filas: una lectura de las columnas A:F)');
  const antes = E.D.celdasLeidas;
  E.run('baseCorridaTomar_("bloque", "las derivadas", ssDestino_().getSheetByName(RDV_HOJA_DESTINO))');
  const leidasIdent = E.D.celdasLeidas - antes;
  ok(leidasIdent === E.D.v.length * 6, 'la identidad es chica: ' + leidasIdent + ' celdas (la base entera: ' + E.D.v.length * E.D.v[0].length + ')');
  // el equipo ordenó (cambia la fila 3): se vuelve a leer
  const tmp = E.D.v[2]; E.D.v[2] = E.D.v[3]; E.D.v[3] = tmp;
  ok(E.run('baseCorridaTomar_("dest", "el cruce")') === null, 'si el equipo ORDENÓ (la fila 3 ya es otra reunión), no se reusa: se lee de nuevo');
  E.run('leerDestino_()');
  ok(E.run('baseCorridaTomar_("dest", "los IDs")') !== null, 'después de leer de nuevo, se puede reusar');
  // una fila BORRADA (la fusión de la agenda, o el equipo) después de la lectura: no se reusa, aunque nadie haya invalidado
  E.run('leerDestino_()');
  const borrada = E.D.v.splice(4, 1);
  ok(E.run('leerDestinoCompartido_("el cruce")') !== null && E.D.lecturas > 0 && E.run('_corrida_.base.lecturas') === 4,
     'una fila borrada después de leer: leerDestinoCompartido_ vuelve a leer la hoja (no usa los números de fila viejos)');
  E.D.v.splice(4, 0, borrada[0]);
  E.run('leerDestino_()');
  E.run('invalidarDestinoCompartido_("la escritura del cruce escribió en la base")');
  ok(E.run('baseCorridaTomar_("dest", "los IDs")') === null, 'si una parte escribió, la siguiente lee de nuevo');
  const c = E.run('_corrida_.base');
  ok(c && c.lecturas === 5 && c.reusos === 3, 'la corrida cuenta las lecturas enteras (' + c.lecturas + ') y los reusos (' + c.reusos + ') para el paso 67');
  // sin la corrida de la hora (un paso a mano): nada se comparte
  E.run('baseCorridaTerminar_(); leerDestino_();');
  ok(E.run('baseCorridaTomar_("dest", "x")') === null, 'fuera de la corrida de la hora no se comparte nada');
  // la agenda que escribe descarta la lectura; la que no escribe, no
  const Ea = montar();
  Ea.ctx.__m = [V1];
  Ea.run('baseCorridaIniciar_(); corridaIniciar_(new Date(), false, false); correrAgendaEnBloqueo_(false, { mails: __m, geocodificar: function (q) { return { consulta: q, estado: "ZERO_RESULTS" }; } });');
  ok(Ea.run('baseCorridaTomar_("dest", "el cruce")') === null, 'la agenda CREÓ filas: el cruce vuelve a leer la base');
  Ea.run('correrAgendaEnBloqueo_(false, { mails: __m, geocodificar: function (q) { return { consulta: q, estado: "ZERO_RESULTS" }; } });');
  const reuso = Ea.run('baseCorridaTomar_("dest", "el cruce")');
  ok(reuso !== null, 'la misma agenda otra vez (nada que escribir): el cruce reusa su lectura');
  ok(Ea.run('(function () { var d = recalcDerivadas_(RDV_HOJA_DESTINO, false); return _corrida_.base.reusos; })()') >= 2,
     'y las derivadas también (sin leer la base entera otra vez)');
  // la escritura del cruce no escribe en una fila que ya no es la del plan
  const f = E.run('leerDestino_()').filas[0];
  E.ctx.__f = f;
  ok(E.run('_mismaFilaFresca_(leerDestino_(), __f, __f.valores)') === true, '_mismaFilaFresca_: la misma fila → sí');
  const otra = f.valores.slice(); otra[E.C('Figura')] = 'Otra Figura';
  E.ctx.__o = otra;
  ok(E.run('_mismaFilaFresca_(leerDestino_(), __f, __o)') === false, 'otra Figura en ese número de fila (el equipo ordenó) → no se escribe ahí');
}

// ============================== [4] la guarda de tiempo dentro de la agenda ==============================

console.log('[4] la guarda de tiempo DENTRO de la agenda: con más de 150 s al terminar el parse, sólo hoy a 3 días');
{
  const E = montar();
  E.tablaGeo['Calle'] = 'Recoleta';
  E.ctx.__m = [mail(new D(2026, 9, 15, 9), ASUNTO('19/10', '25/10'), [bloque(19, 'Jorge Macri', 'Comuna 2', '10:00', 'Calle Cerca 1, Club'),
                                                                        bloque(24, 'Gabino Tapia', 'Comuna 2', '12:00', 'Calle Lejos 3, Club')])];
  // la corrida empezó hace 200 s (la agenda tardó en Gmail y el parse)
  E.run('corridaIniciar_(new Date(Date.now() - 200000), false, false); correrAgendaEnBloqueo_(true, { mails: __m });');
  ok(E.logs.some(function (l) { return /GUARDA DE TIEMPO DE LA AGENDA: al terminar el parse la corrida lleva 200 s \(límite 150 s\)/.test(l); }),
     'el log lo dice (lleva 200 s, límite 150 s)');
  ok(E.geo.length === 1 && /^Calle Cerca 1/.test(E.geo[0]), 'sólo se geocodifica la de los próximos 3 días (' + E.geo.join(' / ') + ')');
  const g = E.run('_corrida_.agendaGeo');
  ok(g && g.guarda && g.tiempo >= 1 && g.sinCrear >= 1, 'REGISTRO_CORRIDAS (agenda_geo_detalle) lo anota: ' + E.run('_textoGeoCorrida_(_corrida_.agendaGeo)'));
  const E2 = montar();
  E2.tablaGeo['Calle'] = 'Recoleta';
  E2.ctx.__m = E.ctx.__m;
  E2.run('corridaIniciar_(new Date(Date.now() - 60000), false, false); correrAgendaEnBloqueo_(true, { mails: __m });');
  ok(E2.geo.length === 2 && !E2.logs.some(function (l) { return /GUARDA DE TIEMPO DE LA AGENDA/.test(l); }), 'con 60 s, todo como siempre (' + E2.geo.length + ' llamadas)');
  // REGISTRO_CORRIDAS: las columnas nuevas, con lo de esta corrida
  E.run('corridaCerrar_(null)');
  const reg = E.ssI.hojas['REGISTRO_CORRIDAS'];
  const enc = reg.v[0], ult = reg.v[reg.v.length - 1];
  ok(enc.slice(-7).join('|') === 'agenda_cache_s|agenda_geo_detalle|agenda_mails_cache|base_lecturas|base_reusos|base_lecturas_s|base_detalle' &&
     /GUARDA DE TIEMPO/.test(ult[enc.indexOf('agenda_geo_detalle')]) && ult[enc.indexOf('agenda_geo_n')] === 1,
     'REGISTRO_CORRIDAS: las columnas del punto 5b al final, y la línea con la geocodificación (1 llamada, la guarda)');
  const t = E.run('tiemposDeCorridas(10)');
  ok(t && t.punto5b && t.punto5b.corridas === 1 && E.logs.some(function (l) { return /punto 5b \(1 corridas desde el cambio\): llamadas a Maps por corrida 1/.test(l); }),
     'el paso 67 lo muestra (llamadas a Maps, la cache, las lecturas de la base)');
}

// ============================== la guarda: los límites nuevos ==============================

console.log('[5] los límites de la guarda de tiempo (CORTADAS i y ii)');
{
  const E = montar();
  const g = E.run('GUARDA_INICIO_MAX_MS');
  ok(g.cruce === 150000 && g.asistentes === 290000, 'el cruce empieza antes de los 150 s (era 210) y los asistentes antes de los 290 s (no tenían)');
  ok(E.run('GEOCODE_MAX_POR_CORRIDA') === 20 && E.run('AGENDA_GEO_LIMITE_TRAS_PARSE_MS') === 150000 && E.run('AGENDA_GEO_DIAS_SI_TARDE') === 3,
     'el tope de geocodificación: 20 por corrida; la guarda de la agenda: 150 s, hoy a 3 días');
}

console.log('\n%s chequeos. %s', chequeos, fallas ? fallas + ' FALLA(S)' : 'TODO OK');
process.exit(fallas ? 1 : 0);
