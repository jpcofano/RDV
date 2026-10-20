/**
 * tests/orden_base.test.js — 19/10 (prompt 08, punto 7): la base ordenada por FECHA, HORA y Figura (57_OrdenBase.js).
 *   [1] el plan (las filas sin FECHA al final, los empates por HORA); [2] el paso 107 en seco (no escribe; la próxima corrida
 *   simulada hace lo mismo sobre la base ordenada); [3] el paso 108 (cada fila entera, con valores, fondos y notas; el orden de antes
 *   guardado; la segunda vez no hace nada); [4] el paso 109 (vuelve exacto; sin la columna auxiliar); [5] una hoja que no moviera
 *   los fondos (se reponen) y una base con fórmulas (no se ordena); [6] la corrida de la hora; [7] 7f: el paso 38 encuentra por su
 *   identidad la fila del equipo (sin agenda_uid) después de ordenar.
 *
 *     node tests/orden_base.test.js
 *
 * NO sube a Apps Script y NO tiene datos reales. "Hoy" es el lunes 19/10/2026.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', '05_Escritura.js', '20_UpsertDestino.js', '49_Corridas.js',
                  '41_AgendaColores.js', '41_AgendaParser.js', '42_BarriosCabaGeo.js', '40_Agenda.js', 'diagnostico/17_peso_intermedia.js',
                  'diagnostico/08_verificar_escritura.js', 'diagnostico/03_muestras_mail.js', 'diagnostico/16_agenda_medicion.js',
                  'diagnostico/19_direccion_conjunto.js', 'diagnostico/21_ubicacion.js', '25_Elecciones.js', '26_Fichas.js', '27_RevisarFormato.js',
                  'diagnostico/22_previsualizar.js', 'diagnostico/30_duplicados_agenda.js', '54_FusionAgenda.js', '50_Avisos.js',
                  'diagnostico/29_auditoria_agenda.js', '30_Derivadas.js', '44_Looker.js', '45_IdsCuentas.js', '55_SimularCorrida.js',
                  '56_SepararReunion.js', '51_FormatoLectura.js', '47_AgendaVistas.js', '57_OrdenBase.js'];
let AHORA = new Date(2026, 9, 12, 9, 0, 0).getTime();
const avanzar = function (min) { AHORA += min * 60000; };
class D extends Date {
  constructor(...a) { if (a.length === 0) super(AHORA); else super(...a); }
  static now() { return AHORA; }
}
const pad = function (n) { return ('0' + n).slice(-2); };

// ============================== el mock de Apps Script ==============================

function crearEntorno(config) {
  const E = { logs: [], uuid: 0, mails: [] };
  class Hoja {
    constructor(nombre, v) { this.nombre = nombre; this.v = (v || []).map(function (r) { return r.slice(); }); this.bg = this.v.map(function (r) { return r.map(function () { return null; }); }); }
    _asegurar(f, c) {
      while (this.v.length < f) { this.v.push([]); this.bg.push([]); }
      for (let i = 0; i < f; i++) { while (this.v[i].length < c) { this.v[i].push(''); this.bg[i].push(null); } }
    }
    getRange(f, c, nf, nc) {
      const h = this; nf = nf || 1; nc = nc || 1;
      const leer = function (m) { const o = []; for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) { const fila = m[f - 1 + i]; r.push(fila && fila[c - 1 + j] !== undefined ? fila[c - 1 + j] : (m === h.v ? '' : null)); } o.push(r); } return o; };
      const rango = {
        getValues: function () { return leer(h.v); },
        getValue: function () { return leer(h.v)[0][0]; },
        getBackgrounds: function () { return leer(h.bg); },
        getFormula: function () { return ''; },
        getFormulas: function () { const o = []; for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) r.push(''); o.push(r); } return o; },
        setValues: function (m) { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) {
          let x = m[i][j];
          const dm = typeof x === 'string' && /^(\d{1,2}) de (\d{1,2})$/.exec(x);
          if (dm && ((h.nf || {})[(f + i) + ',' + (c + j)] !== '@')) x = 46022 + (+dm[2] === 3 ? 59 + (+dm[1]) : 0);
          h.v[f - 1 + i][c - 1 + j] = x;
        } return rango; },
        setValue: function (x) { h._asegurar(f, c); h.v[f - 1][c - 1] = x; return rango; },
        setBackground: function (col) { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.bg[f - 1 + i][c - 1 + j] = col; return rango; },
        setBackgrounds: function (m) { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.bg[f - 1 + i][c - 1 + j] = m[i][j]; return rango; },
        clearContent: function () { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.v[f - 1 + i][c - 1 + j] = ''; return rango; },
        setNumberFormat: function (fmt) { h.nf = h.nf || {}; for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.nf[(f + i) + ',' + (c + j)] = fmt; return rango; },
        getNumberFormats: function () { const o = []; for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) r.push((h.nf || {})[(f + i) + ',' + (c + j)] || 'General'); o.push(r); } return o; },
        setNumberFormats: function (m) { h.nf = h.nf || {}; for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.nf[(f + i) + ',' + (c + j)] = m[i][j]; return rango; },
        clearFormat: function () { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) { h.bg[f - 1 + i][c - 1 + j] = null; if (h.nf) delete h.nf[(f + i) + ',' + (c + j)]; } return rango; },
        setDataValidation: function (v) { h.validaciones = (h.validaciones || 0) + 1; h.opciones = v; return rango; },
        setFontWeight: function () { return rango; }
      };
      return rango;
    }
    getRangeList(a1s) {
      const h = this;
      const celdas = function (a1) {
        return a1.split(':').map(function (x) { const m = /^([A-Z]+)(\d+)$/.exec(x); let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return [+m[2], n]; });
      };
      const cada = function (fn) { a1s.forEach(function (a1) { const p = celdas(a1), b = p[1] || p[0]; fn(h.getRange(p[0][0], p[0][1], b[0] - p[0][0] + 1, b[1] - p[0][1] + 1)); }); };
      return { setNumberFormat: function (fmt) { cada(function (r) { r.setNumberFormat(fmt); }); },
               setBackground: function (col) { cada(function (r) { r.setBackground(col); }); },
               clearContent: function () { cada(function (r) { r.clearContent(); }); } };
    }
    getLastRow() { for (let i = this.v.length; i >= 1; i--) if (this.v[i - 1].some(function (x) { return x !== '' && x !== null && x !== undefined; })) return i; return 0; }
    getLastColumn() { let m = 0; this.v.forEach(function (r) { for (let j = r.length; j >= 1; j--) if (r[j - 1] !== '' && r[j - 1] != null) { m = Math.max(m, j); break; } }); return m; }
    getMaxRows() { return Math.max(this.v.length, 1000); }
    getMaxColumns() { return Math.max(this.getLastColumn(), 26); }
    getName() { return this.nombre; }
    insertRowsAfter() {}
    deleteRows(f, n) { this.v.splice(f - 1, n); this.bg.splice(f - 1, n); E.borradas = (E.borradas || 0) + n; }
    deleteRow(f) { this.deleteRows(f, 1); }
    appendRow(r) { const f = this.getLastRow() + 1; this.getRange(f, 1, 1, r.length).setValues([r]); }
    setFrozenRows() {}
    clear() { this.v = []; this.bg = []; }
    getProtections() { return []; }
    protect() {
      const h = this;
      const pr = { setDescription: function (d) { h.proteccion = d; return pr; }, getDescription: function () { return h.proteccion; },
                   setWarningOnly: function (w) { h.advertencia = w; return pr; }, setUnprotectedRanges: function (r) { h.libres = r.length; return pr; },
                   isWarningOnly: function () { return !!h.advertencia; },
                   addEditor: function () { if (h.advertencia) throw new Error('Exception: isWarningOnly'); return pr; },
                   getEditors: function () { return []; }, removeEditors: function () { return pr; },
                   canDomainEdit: function () { return false; }, setDomainEdit: function () { return pr; } };
      return pr;
    }
    hideColumns() {}
    autoResizeColumns() {}
    clearContents() { this.v = this.v.map(function (r) { return r.map(function () { return ''; }); }); }
  }
  E.Hoja = Hoja;
  const planillas = {};
  E.planilla = function (id) {
    if (!planillas[id]) planillas[id] = { hojas: {}, getSheetByName: function (n) { return this.hojas[n] || null; },
                                           insertSheet: function (n) { this.hojas[n] = new Hoja(n, []); return this.hojas[n]; },
                                           getSheets: function () { return Object.keys(this.hojas).map(function (k) { return this.hojas[k]; }, this); },
                                           deleteSheet: function (sh) { delete this.hojas[sh.nombre]; } };
    return planillas[id];
  };
  E.lockLibre = true;
  const ctx = {
    console: console, Date: D, Math: Math, JSON: JSON, Map: Map, Set: Set, Object: Object, Array: Array, String: String, Number: Number,
    Logger: { log: function () { const a = Array.prototype.slice.call(arguments); let s = String(a.shift()); s = s.replace(/%s/g, function () { return String(a.shift()); }).replace(/%%/g, '%'); E.logs.push(s); } },
    Utilities: {
      formatDate: function (d, tz, f) { return f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate())).replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds())); },
      getUuid: function () { E.uuid++; return 'u' + E.uuid + '-' + crypto.randomBytes(4).toString('hex'); }, sleep: function () {},
      DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: function (alg, t) {
        return Array.from(crypto.createHash('md5').update(String(t), 'utf8').digest()).map(function (b) { return b > 127 ? b - 256 : b; });
      }
    },
    SpreadsheetApp: { openById: function (id) { return E.planilla(id); },
                      flush: function () {}, ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
                      newDataValidation: function () { const b = { lista: null, requireValueInList: function (l) { b.lista = l; return b; },
                        setAllowInvalid: function () { return b; }, build: function () { return b.lista; } }; return b; } },
    GmailApp: { sendEmail: function (para, asunto, cuerpo) { E.mails.push({ to: para, subject: asunto, body: cuerpo }); } },
    Session: { getEffectiveUser: function () { return { getEmail: function () { return 'yo@test'; } }; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return E.lockLibre; }, releaseLock: function () {} }; } },
    PropertiesService: { getScriptProperties: function () { E.props = E.props || {}; return { getProperty: function (k) { return E.props[k] == null ? null : E.props[k]; }, setProperty: function (k, v) { E.props[k] = String(v); }, deleteProperty: function (k) { delete E.props[k]; } }; } }
  };
  vm.createContext(ctx);
  // la etapa 1 quedó PRENDIDA en 00_Config.js; cada escenario parte de todo APAGADO y prende lo suyo por `config`
  const cfg = Object.assign({ DERIVADAS_POR_SCRIPT: 'false', AGENDA_SOLO_SEMANA: 'null', AGENDA_CANCELACION_AUTOMATICA: 'true', AGENDA_CANCELACION_MODO: "'regla7'",
    AGENDA_SEGURIDAD_POR_COMUNA: 'false', AGENDA_BARRIO_DEL_MAIL: 'false', CONJUNTO_REPETIDA_POR_UBICACION: 'false',
    AGENDA_CREAR_SOLO_IDENTIFICADAS: 'false', AGENDA_CONCILIACION_SEMANAL: 'false', AGENDA_ELECCIONES_SIEMPRE: 'false',
    AGENDA_INVARIANTE_UNA_FILA: 'false', AGENDA_VALIDAR_MAILS: 'false', AGENDA_COLORES_MAIL: 'false' }, config || {});
  ARCHIVOS.forEach(function (f) {
    let s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    if (f === '00_Config.js') Object.keys(cfg).forEach(function (k) { s = s.replace(new RegExp('^const ' + k + '\\s+=.*', 'm'), 'const ' + k + ' = ' + cfg[k] + ';'); });
    vm.runInContext(s, ctx, { filename: f });
  });
  E.ctx = ctx;
  E.run = function (expr) { vm.runInContext('_ssDestino_ = null; _ssIntermedia_ = null; _cacheParsing_ = null;', ctx); E.logs = []; return vm.runInContext(expr, ctx); };
  return E;
}

// ============================== lo que el mock no tenía: sort, columnas, notas ==============================

function extenderMock(E, opciones) {
  opciones = opciones || {};
  const P = E.Hoja.prototype;
  const claveSheets = function (v) {
    if (v === '' || v == null) return [3, 0];
    if (v instanceof Date) return [0, v.getTime()];
    if (typeof v === 'number') return [0, v * 86400000 + new Date(1899, 11, 30).getTime()];
    if (typeof v === 'boolean') return [2, v ? 1 : 0];
    return [1, String(v).toLowerCase()];
  };
  const cmp = function (a, b) { if (a[0] !== b[0]) return a[0] - b[0]; return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0; };
  const getRange0 = P.getRange;
  P.getRange = function (f, c, nf, nc) {
    const h = this, r = getRange0.call(this, f, c, nf, nc);
    nf = nf || 1; nc = nc || 1;
    r.sort = function (specs) {
      E.sorts = (E.sorts || 0) + 1;
      h._asegurar(f + nf - 1, c + nc - 1);
      h.notas = h.notas || {};
      const filas = [];
      for (let i = 0; i < nf; i++) {
        const v = h.v[f - 1 + i].slice(c - 1, c - 1 + nc), bg = h.bg[f - 1 + i].slice(c - 1, c - 1 + nc);
        const no = [], fo = [];
        for (let j = 0; j < nc; j++) { no.push(h.notas[(f + i) + ',' + (c + j)] || ''); fo.push((h.nf || {})[(f + i) + ',' + (c + j)] || 'General'); }
        filas.push({ v: v, bg: bg, no: no, fo: fo, i: i });
      }
      filas.sort(function (a, b) {
        for (let s = 0; s < specs.length; s++) {
          const k = specs[s].column - c, x = cmp(claveSheets(a.v[k]), claveSheets(b.v[k]));
          if (x) return specs[s].ascending === false ? -x : x;
        }
        return a.i - b.i;
      });
      filas.forEach(function (x, i) {
        for (let j = 0; j < nc; j++) {
          h.v[f - 1 + i][c - 1 + j] = x.v[j];
          if (!opciones.noMueveFondos) h.bg[f - 1 + i][c - 1 + j] = x.bg[j];
          h.notas[(f + i) + ',' + (c + j)] = x.no[j];
          h.nf = h.nf || {}; h.nf[(f + i) + ',' + (c + j)] = x.fo[j];
        }
      });
      return r;
    };
    r.getNotes = function () { const o = []; for (let i = 0; i < nf; i++) { const q = []; for (let j = 0; j < nc; j++) q.push((h.notas || {})[(f + i) + ',' + (c + j)] || ''); o.push(q); } return o; };
    r.setNotes = function (m) { h.notas = h.notas || {}; for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.notas[(f + i) + ',' + (c + j)] = m[i][j]; return r; };
    const gf = r.getFormulas;
    r.getFormulas = function () { const o = gf(); (h.formulas || []).forEach(function (p) { if (p[0] >= f && p[0] < f + nf && p[1] >= c && p[1] < c + nc) o[p[0] - f][p[1] - c] = '=1'; }); return o; };
    return r;
  };
  P.getMaxColumns = function () { return this.maxCols || this.getLastColumn(); };
  P.insertColumnAfter = function (n) { this.maxCols = n + 1; this.aux = true; };
  P.deleteColumn = function (n) {
    this.v.forEach(function (r) { r.splice(n - 1, 1); }); this.bg.forEach(function (r) { r.splice(n - 1, 1); });
    this.maxCols = null; this.aux = false;
  };
}

// ============================== el destino simulado ==============================

const HDR = (function () {
  const fx = fs.readFileSync(path.join(RAIZ, 'fixtures', 'RVD JM-CM - ES.csv'), 'utf8').split(/\r?\n/)[0].split(',');
  const nombres = { C: 'EVENTO', F: 'HORA', H: 'One Page Entregado', I: 'STATUS REUNIÓN', J: 'Observaciones',
    L: 'Mail', M: 'Call Center', N: 'IVR', O: 'RRSS', P: 'Difusión', R: 'Oradores anotados', S: 'Oradores que hablaron',
    T: 'Temas mas comentados', U: 'Semaforo politico', V: 'Síntesis cualitativa:', AH: 'Masculinos', AI: 'Femeninos',
    AJ: '18-24', AK: '25-39', AL: '40-55', AM: '56-65', AN: '66+', AO: 'Sin identificar' };
  return fx.map(function (h) { const m = /^PENDIENTE_([A-Z]+)$/.exec(h); return m && nombres[m[1]] ? nombres[m[1]] : h; })
           .concat(['RDV_UID', 'form_origen', 'form_score', 'form_nivel', 'form_fecha_match', 'form_clave']);
})();
const COLUMNAS_AGENDA = ['No participa', 'agenda_uid', 'agenda_mail', 'agenda_version', 'agenda_hora_escrita',
  'agenda_direccion_escrita', 'agenda_barrio_escrito', 'agenda_fecha_escrita', 'agenda_status_escrito',
  'Origen fila', 'Tocado por el equipo', 'Evento (mail)', 'Lugar (mail)', 'Dirección (mail)', 'Marcas (mail)', 'Conjunta con'];
const BARRIOS = [['Recoleta', 2], ['Palermo', 14], ['Almagro', 5], ['Boedo', 5], ['Belgrano', 13], ['Núñez', 13],
  ['Flores', 7], ['Villa Urquiza', 12], ['Villa Santa Rita', 11], ['Villa Devoto', 11]];
const ETAPA1 = { DERIVADAS_POR_SCRIPT: 'true', AGENDA_SEGURIDAD_POR_COMUNA: 'true', AGENDA_BARRIO_DEL_MAIL: 'true', AGENDA_CREAR_SOLO_IDENTIFICADAS: 'true',
                 AGENDA_CONCILIACION_SEMANAL: 'true', AGENDA_INVARIANTE_UNA_FILA: 'true', AGENDA_VALIDAR_MAILS: 'true',
                 AGENDA_CANCELACION_AUTOMATICA: 'true', AGENDA_CANCELACION_MODO: "'suspender'", AGENDA_COLORES_MAIL: 'true',
                 AGENDA_ELECCIONES_SIEMPRE: 'true', CONJUNTO_REPETIDA_POR_UBICACION: 'true' };
const SIS = '#CFE2F3', EQ = '#FFF2CC';
let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }

/** La base DESORDENADA: filas de septiembre y octubre mezcladas, una sin FECHA en el medio, con colores y notas distintos. */
function montar(config, opcMock) {
  const E = crearEntorno(Object.assign({}, ETAPA1, config || {}));
  extenderMock(E, opcMock);
  const hdr = HDR.concat(COLUMNAS_AGENDA).concat(['ID cuentas', 'Fecha envío campañas']);
  const C = function (n) { return hdr.indexOf(n); };
  const filas = [hdr];
  const fila = function (fig, barrio, d, m, hora, extra) {
    const r = hdr.map(function () { return ''; });
    r[C('Figura')] = fig; r[C('Barrio')] = barrio; r[C('FECHA')] = d ? new D(2026, m, d, 12) : ''; r[C('HORA')] = hora;
    r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = 'Realizada'; r[C('Origen fila')] = 'equipo';
    Object.keys(extra || {}).forEach(function (k) { r[C(k)] = extra[k]; });
    filas.push(r);
  };
  fila('Clara Muzzio', 'Recoleta', 10, 9, '18:00', { Inscriptos: 100, RDV_UID: 'rdv-a' });
  fila('Gabino Tapia', 'Núñez', 3, 9, '10:00', { Inscriptos: 90, RDV_UID: 'rdv-b' });
  fila('Laura Alonso', 'Flores', 8, 9, '19:00', { Inscriptos: 80 });
  fila('Jorge Macri', 'Villa Devoto', 15, 9, '09:15', { Asistentes: 31, RDV_UID: 'rdv-c', 'Origen fila': 'equipo' });
  fila('Hernán Lombardi', '', 0, 0, '', { Observaciones: 'una fila sin FECHA (la cargó el equipo a medias)' });
  fila('Jorge Macri', 'Belgrano', 15, 9, '18:30', { 'agenda_uid': 'c-uid-1', 'Origen fila': 'sistema (agenda)' });
  fila('Ezequiel Sabor', 'Almagro', 1, 9, '18:00', { Inscriptos: 60 });
  fila('Clara Muzzio', 'Recoleta', 8, 9, '18:00', { Inscriptos: 70 });
  const ssD = E.planilla(E.run('RDV_SS_DESTINO')), ssI = E.planilla(E.run('RDV_SS_INTERMEDIA'));
  const h = new E.Hoja('RVD JM-CM - ES', filas);
  // colores y notas: cada fila con su marca (el sistema en Inscriptos / agenda_uid, el equipo en Observaciones)
  for (let i = 1; i < filas.length; i++) {
    h.bg[i][C('Inscriptos')] = filas[i][C('Inscriptos')] !== '' ? SIS : null;
    h.bg[i][C('Figura')] = i % 2 ? EQ : null;
    h.notas = h.notas || {}; h.notas[(i + 1) + ',' + (C('Figura') + 1)] = 'nota de la fila de ' + filas[i][C('Figura')] + ' ' + i;
  }
  ssD.hojas['RVD JM-CM - ES'] = h;
  ssD.hojas['Comunas'] = new E.Hoja('Comunas', [['Barrio', 'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona', 'Eje geográfico']]
    .concat(BARRIOS.map(function (b) { return [b[0], b[1], 1000 + b[1], 1, 1, 1, 1, 'Centro', '']; })));
  ssD.hojas['RDV CONJUNTO'] = new E.Hoja('RDV CONJUNTO', [['Figura', 'Barrio', 'FECHA', 'Dirección', 'Asistentes', 'Oradores anotados', 'Oradores que hablaron', 'Estado'],
    ['Macri Jorge', 'Villa Devoto', new D(2026, 9, 15, 12), 'Bahía Blanca 4025', 31, 5, 3, 'Realizada']]);
  const cb = E.run('COLUMNAS_B');
  const hB = Object.keys(cb).map(function (k) { return cb[k][0]; });
  ssI.hojas['B'] = new E.Hoja('B', [hB]);
  E.D = h; E.ssI = ssI; E.ssD = ssD; E.C = C; E.hdr = hdr;
  return E;
}
const filaDe = function (E, i) { return { v: JSON.stringify(E.D.v[i].slice(0, E.hdr.length).map(function (x) { return x instanceof Date ? x.getTime() : x; })), bg: JSON.stringify(E.D.bg[i].slice(0, E.hdr.length)),
                                          nota: (E.D.notas || {})[(i + 1) + ',' + (E.C('Figura') + 1)] || '' }; };
/** Cada fila (por su identidad) → su contenido, fondo y nota. */
const fotoPorId = function (E) {
  const m = {};
  for (let i = 1; i < E.D.v.length; i++) {
    const r = E.D.v[i];
    if (!r.some(function (x) { return x !== '' && x != null; })) continue;
    const id = r[E.C('agenda_uid')] || r[E.C('RDV_UID')] || [r[E.C('Figura')], r[E.C('FECHA')] instanceof Date ? r[E.C('FECHA')].getTime() : '', r[E.C('HORA')]].join('|');
    m[id] = filaDe(E, i);
  }
  return m;
};
const fechas = function (E) {
  const out = [];
  for (let i = 1; i < E.D.v.length; i++) { const f = E.D.v[i][E.C('FECHA')]; out.push(f instanceof Date ? f.getDate() + '/' + (f.getMonth() + 1) + ' ' + E.D.v[i][E.C('HORA')] : '(sin)'); }
  return out;
};
const SIM = { mails: [{ fecha: new D(2026, 9, 12, 9), asunto: 'Agenda Encuentros de vecinos con JM - Semana del 12/10 al 18/10',
                        cuerpo: ['*Jueves 15/10*', 'Evento: Encuentro con Vecinos Jorge Macri, Belgrano', 'Hora: 18:30h', 'Lugar: A CONFIRMAR'].join(String.fromCharCode(10)),
                        truncado: false }],geocodificar: function (q) { return { consulta: q, estado: 'ZERO_RESULTS' }; }, listaIds: { registros: [] } };

AHORA = new Date(2026, 9, 19, 12, 0, 0).getTime();

// ============================== [1] el plan ==============================

console.log('[1] el plan: por FECHA, HORA y Figura; las filas sin FECHA al final');
let E = montar({});
let plan = E.run('planOrdenBase_(' + 'leerDestino_().sh.getRange(1, 1, leerDestino_().sh.getLastRow(), leerDestino_().sh.getLastColumn()).getValues())');
ok(plan.ultima === 9 && plan.sinFecha.length === 1 && plan.sinFecha[0] === 6, 'filas con datos 2..9; una sin FECHA (la 6) — ' + JSON.stringify({ u: plan.ultima, s: plan.sinFecha }));
ok(plan.mueve.length >= 6 && plan.orden.map(function (x) { return x.fila; }).join(',') === '8,3,9,4,2,5,7,6',
   'el orden: 01/10, 03/10, el 08/10 Muzzio 18:00 antes que Alonso 19:00 (HORA), 10/10, Macri 15/10 09:15 y 18:30, al final la sin FECHA — ' +
   plan.orden.map(function (x) { return x.fila; }).join(','));

// ============================== [2] el seco (paso 107) ==============================

console.log('[2] el seco (paso 107): no escribe nada; la próxima corrida, igual sobre la base ordenada');
const antes = JSON.stringify({ v: E.D.v, bg: E.D.bg });
E.ctx.__sim = SIM;
let r = E.run('ordenBase_enSeco({ simulacion: __sim })');
ok(r && r.listo === true && r.movidas === plan.mueve.length, 'LISTO, ' + (r && r.movidas) + ' filas se moverían — ' + JSON.stringify(r && r.motivos));
ok(JSON.stringify({ v: E.D.v, bg: E.D.bg }) === antes && !E.sorts, 'en seco no toca la base');
ok(/fila 8 → 2 \| Ezequiel Sabor 01\/10\/2026 18:00/.test(E.logs.join('\n')) && /filas sin FECHA \(van al final de todo\): 1/.test(E.logs.join('\n')),
   'el log: de qué fila a qué fila y las sin FECHA');
ok(/cada agenda_uid y cada RDV_UID, con sus mismos datos en la base ordenada: 4 de 4 — OK/.test(E.logs.join('\n')), 'cada agenda_uid / RDV_UID con sus datos');
ok(/lo mismo: nada de la próxima corrida depende del número de fila/.test(E.logs.join('\n')), 'la próxima corrida simulada: lo mismo con la base ordenada');

// ============================== [3] el real (paso 108) y la verificación ==============================

console.log('[3] el real (paso 108): ordena entera cada fila, guarda el orden de antes; la segunda vez no hace nada');
const id0 = fotoPorId(E);
ok(E.props && JSON.parse(E.props.ORDEN_BASE_HUELLA_107).h === plan.huellaActual, 'el seco LISTO guarda la huella para el paso 108');
r = E.run('ordenarBaseAhora()');
ok(r && !r.error && r.movidas === plan.mueve.length && E.sorts === 1, 'ordenó (' + JSON.stringify(r) + ')');
ok(fechas(E).join(' | ') === '1/10 18:00 | 3/10 10:00 | 8/10 18:00 | 8/10 19:00 | 10/10 18:00 | 15/10 09:15 | 15/10 18:30 | (sin)', 'el orden: ' + fechas(E).join(' | '));
let id1 = fotoPorId(E);
ok(Object.keys(id0).length === 8 && Object.keys(id0).every(function (k) { return JSON.stringify(id0[k]) === JSON.stringify(id1[k]); }),
   'cada fila (por su identidad) con sus mismos valores, fondos y notas');
const prev = E.ssI.hojas['ORDEN_BASE_PREVIO'];
ok(prev && prev.v.length === 9 && prev.v[1][0] === r.corrida, 'ORDEN_BASE_PREVIO: el orden de antes (8 filas), con el id de la corrida');
r = E.run('ordenarBaseAhora()');
ok(r && r.nada === 'ya en orden' && E.sorts === 1, 'la segunda vez: ya está en orden, no toca nada');
ok(!E.props.ORDEN_BASE_HUELLA_107, 'la huella del 107 sirve una vez');

// ============================== [4] deshacer (paso 109) ==============================

console.log('[4] deshacer (paso 109): vuelve al orden de antes, exacto');
r = E.run('deshacerOrdenBase(true)');
ok(r && r.moverian > 0 && E.sorts === 1, 'en seco: dice cuántas se moverían (' + (r && r.moverian) + ')');
r = E.run('deshacerOrdenBase(false)');
ok(r && !r.error && JSON.stringify({ v: E.D.v.map(function (x) { return x.slice(0, E.hdr.length); }), bg: E.D.bg.map(function (x) { return x.slice(0, E.hdr.length); }) }) ===
   JSON.stringify({ v: JSON.parse(antes).v.map(function (x) { return x.slice(0, E.hdr.length); }), bg: JSON.parse(antes).bg.map(function (x) { return x.slice(0, E.hdr.length); }) }) &&
   !E.D.aux && E.D.v[0].length === E.hdr.length,
   'la base vuelve exacta al orden de antes y la columna auxiliar ya no está — ' + JSON.stringify(r));
r = E.run('ordenarBaseEnLaHora_()');
ok(r && r.apagado === true, 'la corrida de la hora con BASE_ORDEN_POR_FECHA apagado: no hace nada');

// ============================== [5] una hoja que no mueve los fondos; con fórmulas ==============================

console.log('[5] si la hoja no moviera los fondos con su fila, se reponen; con fórmulas, no se ordena');
E = montar({}, { noMueveFondos: true });
const idA = fotoPorId(E);
r = E.run('ordenarBaseAhora()');
ok(r && /primero hay que correr el paso 107/.test(r.error || '') && !E.sorts, 'el paso 108 sin el 107: no ordena — ' + (r && r.error));
E.run('ordenBase_enSeco({ simular: false })');
const huellaV = E.props.ORDEN_BASE_HUELLA_107;
E.props.ORDEN_BASE_HUELLA_107 = JSON.stringify({ h: JSON.parse(huellaV).h, t: E.ctx.Date.now() - 3 * 3600000 });
r = E.run('ordenarBaseAhora()');
ok(r && /más de 2 horas/.test(r.error || '') && !E.sorts, 'con la huella vencida: no ordena');
E.props.ORDEN_BASE_HUELLA_107 = JSON.stringify({ h: 'otra', t: E.ctx.Date.now() });
r = E.run('ordenarBaseAhora()');
ok(r && /la base cambió/.test(r.error || '') && !E.sorts, 'con otra base: no ordena');
E.props.ORDEN_BASE_HUELLA_107 = huellaV;
r = E.run('ordenarBaseAhora()');
const idB = fotoPorId(E);
ok(r && r.repuestos > 0 && Object.keys(idA).every(function (k) { return JSON.stringify(idA[k]) === JSON.stringify(idB[k]); }),
   'la hoja dejó los fondos quietos: se repusieron, cada uno a su fila (' + (r && r.repuestos) + ' filas)');
E = montar({});
E.D.formulas = [[3, 2]];
E.run('ordenBase_enSeco({ simular: false })');
r = E.run('ordenarBaseAhora()');
ok(r && /fórmulas/.test(r.error || '') && !E.sorts, 'con una fórmula en la base: no ordena — ' + (r && r.error));

// ============================== [6] la corrida de la hora, prendida ==============================

console.log('[6] la corrida de la hora (BASE_ORDEN_POR_FECHA prendido)');
E = montar({ BASE_ORDEN_POR_FECHA: 'true' });
r = E.run('ordenarBaseEnLaHora_()');
ok(r && r.movidas > 0 && E.sorts === 1, 'ordena (' + (r && r.movidas) + ' filas)');
r = E.run('ordenarBaseEnLaHora_()');
ok(r && r.nada && E.sorts === 1, 'la corrida siguiente: no hace falta');

// ============================== [7] 7f: el paso 38 encuentra la fila del equipo por su identidad ==============================

console.log('[7] 7f: deshacer la agenda (paso 38) después de ordenar, en una fila SIN agenda_uid');
E = montar({ BASE_ORDEN_POR_FECHA: 'true' });
const iSabor = 7;   // Ezequiel Sabor 01/09: vacío "Origen fila" → la agenda lo escribe ("equipo")
E.D.v[iSabor][E.C('Origen fila')] = ''; E.D.v[iSabor][E.C('FECHA')] = new D(2026, 9, 1, 12);   // dentro del alcance
r = E.run('correrAgendaEnBloqueo_(false, { mails: [{ fecha: new Date(2026, 9, 12, 9), asunto: "Agenda Encuentros de vecinos con JM - Semana del 12/10 al 18/10", cuerpo: "*Lunes 12/10*\\nEvento: Encuentro con Vecinos Clara Muzzio, Recoleta\\nHora: 18:00h\\nLugar: A CONFIRMAR", truncado: false }], geocodificar: function (q) { return { consulta: q, estado: "ZERO_RESULTS" }; } })');
const cam = E.ssI.hojas['REGISTRO_AGENDA_CAMBIOS'].v.filter(function (x) { return x[1] === 'origen'; });
ok(cam.length && cam.every(function (x) { return /^id:/.test(x[8]); }), 'las líneas "origen" (filas sin agenda_uid) llevan la identidad: ' + JSON.stringify(cam.map(function (x) { return x[8]; })));
const corrAg = cam.length ? cam[0][0] : '';
E.run('ordenarBaseEnLaHora_()');
let filaSabor = -1;
for (let i = 1; i < E.D.v.length; i++) if (E.D.v[i][E.C('Figura')] === 'Ezequiel Sabor') filaSabor = i;
ok(filaSabor !== iSabor && E.D.v[filaSabor][E.C('Origen fila')] === 'equipo', 'la base se ordenó: Sabor está en otra fila (' + (filaSabor + 1) + ')');
const otras = []; for (let i = 1; i < E.D.v.length; i++) if (i !== filaSabor) otras.push(E.D.v[i][E.C('Origen fila')]);
r = E.run('deshacerAgenda(false, ' + JSON.stringify(corrAg) + ')');
const otras2 = []; for (let i = 1; i < E.D.v.length; i++) if (i !== filaSabor) otras2.push(E.D.v[i][E.C('Origen fila')]);
ok(E.D.v[filaSabor][E.C('Origen fila')] === '' && JSON.stringify(otras) === JSON.stringify(otras2),
   'deshacer: vuelve "Origen fila" de Sabor (por su identidad), y ninguna otra fila se toca');

// ============================== [8] revisor A1: la fila de una línea "id:" quedó vinculada (con agenda_uid) ==============================

console.log('[8] revisor A1: deshacer encuentra por su identidad una fila que DESPUÉS quedó vinculada, y la base ordenada');
E = montar({ BASE_ORDEN_POR_FECHA: 'true' });
const iAl = 3;   // Laura Alonso 08/10, Flores (sin agenda_uid ni RDV_UID): una "fusión" le copió la HORA
E.ssI.hojas['REGISTRO_AGENDA'] = new E.Hoja('REGISTRO_AGENDA', [['corrida', 'hora', 'modo'], ['20261019-110000-x', new D(), 'ESCRITURA']]);
E.ssI.hojas['REGISTRO_AGENDA_CAMBIOS'] = new E.Hoja('REGISTRO_AGENDA_CAMBIOS', [['corrida', 'tipo', 'fila', 'col', 'columna', 'antes', 'despues', 'fondo_antes', 'agenda_uid'],
  ['20261019-110000-x', 'fusionar', iAl + 1, E.C('HORA') + 1, 'HORA', '', '19:00', '', 'id:laura alonso|20261008|flores']]);
E.D.v[iAl][E.C('HORA')] = '19:00';
E.D.v[iAl][E.C('agenda_uid')] = 'v-vinculada-despues';   // la corrida siguiente la vinculó
E.run('ordenarBaseEnLaHora_()');
let filaAl = -1;
for (let i = 1; i < E.D.v.length; i++) if (E.D.v[i][E.C('Figura')] === 'Laura Alonso') filaAl = i;
ok(filaAl !== iAl, 'la base se ordenó: Alonso pasó de la fila ' + (iAl + 1) + ' a la ' + (filaAl + 1));
const obsOtras = E.D.v.map(function (r, i) { return i === filaAl ? null : r[E.C('HORA')]; });
r = E.run('deshacerAgenda(false, "20261019-110000-x")');
ok(E.D.v[filaAl][E.C('HORA')] === '' && JSON.stringify(E.D.v.map(function (r, i) { return i === filaAl ? null : r[E.C('HORA')]; })) === JSON.stringify(obsOtras),
   'deshacer vuelve la celda en la fila de Alonso (por su identidad, aunque ahora tenga agenda_uid) y no toca otra');

// ============================== [9] 20/10: un EMPATE de Aux_Maximos (el NO LISTO del c03 real) ==============================

console.log('[9] un empate en Aux_Maximos (mismos asistentes, mismo barrio y fecha): el seco da LISTO y dice qué representante cambia una vez');
E = montar({});
[['Ezequiel Sabor', '18:00', 'rdv-e2'], ['Laura Alonso', '10:00', 'rdv-e1']].forEach(function (p) {   // Sabor primero en la base; Alonso, antes en el orden
  const r = E.hdr.map(function () { return ''; });
  r[E.C('Figura')] = p[0]; r[E.C('Barrio')] = 'Flores'; r[E.C('FECHA')] = new D(2026, 9, 2, 12); r[E.C('HORA')] = p[1]; r[E.C('EVENTO')] = 'Encuentro con Vecinos';
  r[E.C('STATUS REUNIÓN')] = 'Realizada'; r[E.C('Asistentes')] = 20; r[E.C('RDV_UID')] = p[2]; r[E.C('Origen fila')] = 'equipo';
  E.D.v.push(r); E.D.bg.push(r.map(function () { return null; }));
});
E.ctx.__sim = SIM;
r = E.run('ordenBase_enSeco({ simulacion: __sim })');
const L9 = E.logs.join('\n');
ok(r && r.listo === true, 'LISTO: con el desempate nuevo, la próxima corrida da el mismo Aux_Maximos con la base ordenada — ' + JSON.stringify(r && r.motivos));
ok(/cambian de representante UNA vez[^\n]*: 1 ---\n\s+02\/10\/2026 \| MaxPorFechaStatus Barrio "Flores" Realizada \| antes: Ezequiel Sabor \(Flores, 18:00\) → ahora: Laura Alonso \(Flores, 10:00\) \(empate en 20 asistentes\)/.test(L9),
   'el seco lista el empate que cambia de representante una vez (Sabor → Alonso, la de las 10:00)');

console.log('');
console.log(fallas ? fallas + ' FALLA(S)' : 'Todo en verde.');
process.exit(fallas ? 1 : 0);
