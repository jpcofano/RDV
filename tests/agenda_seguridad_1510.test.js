/**
 * tests/agenda_seguridad_1510.test.js — 15/10: la Seguridad en la agenda (casos 829/830 y 833/835, AGENDA_SEGURIDAD_POR_COMUNA),
 * el barrio del mail (caso 824, AGENDA_BARRIO_DEL_MAIL), RDV CONJUNTO repetido (Macri 15/10, CONJUNTO_REPETIDA_POR_UBICACION)
 * y las mediciones de sólo lectura de diagnostico/30_duplicados_agenda.js. Destino SIMULADO y mails SINTÉTICOS (el mock es el
 * de tests/agenda_escritura.test.js). "Hoy" es el jueves 15/10/2026.
 *
 *     node tests/agenda_seguridad_1510.test.js
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: mails, horarios y direcciones son
 * inventados; los barrios, las comunas y sus límites son los públicos de la Ciudad; las figuras, nombres de la
 * columna Figura. Gmail y Maps no se llaman: los mails se pasan como lista y el geocodificador es una tabla.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', '05_Escritura.js', '20_UpsertDestino.js', '49_Corridas.js',
                  '41_AgendaParser.js', '42_BarriosCabaGeo.js', '40_Agenda.js', 'diagnostico/17_peso_intermedia.js',
                  'diagnostico/08_verificar_escritura.js', 'diagnostico/03_muestras_mail.js', 'diagnostico/16_agenda_medicion.js',
                  'diagnostico/19_direccion_conjunto.js', 'diagnostico/21_ubicacion.js', '25_Elecciones.js',
                  'diagnostico/22_previsualizar.js', 'diagnostico/30_duplicados_agenda.js'];
const HOY = new Date(2026, 9, 15, 12, 0, 0);
/** UNA sola clase de fecha, la misma adentro y afuera del contexto: si no, `instanceof Date` falla adentro. */
class D extends Date {
  constructor(...a) { if (a.length === 0) super(HOY.getTime()); else super(...a); }
  static now() { return HOY.getTime(); }
}
const pad = function (n) { return ('0' + n).slice(-2); };

// ============================== el mock de Apps Script ==============================

function crearEntorno(config) {
  const E = { logs: [], uuid: 0, hojas: {} };
  const FakeDate = D;
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
          // como Sheets en español: "3 de 3" se lee como el 3 de marzo (46084), salvo en una celda con formato texto
          const dm = typeof x === 'string' && /^(\d{1,2}) de (\d{1,2})$/.exec(x);
          if (dm && ((h.nf || {})[(f + i) + ',' + (c + j)] !== '@')) x = 46022 + (+dm[2] === 3 ? 59 + (+dm[1]) : 0);
          h.v[f - 1 + i][c - 1 + j] = x;
        } return rango; },
        setValue: function (x) { h._asegurar(f, c); h.v[f - 1][c - 1] = x; return rango; },
        setBackground: function (col) { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.bg[f - 1 + i][c - 1 + j] = col; return rango; },
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
      return { setNumberFormat: function (fmt) {
        a1s.forEach(function (a1) {
          const m = /^([A-Z]+)(\d+)$/.exec(a1); let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64;
          h.nf = h.nf || {}; h.nf[(+m[2]) + ',' + n] = fmt;
        });
      }, setBackground: function (col) {
        a1s.forEach(function (a1) {
          const p = a1.split(':').map(function (x) { const m = /^([A-Z]+)(\d+)$/.exec(x); let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return [+m[2], n]; });
          const b = p[1] || p[0];
          h.getRange(p[0][0], p[0][1], b[0] - p[0][0] + 1, b[1] - p[0][1] + 1).setBackground(col);
        });
      } };
    }
    getLastRow() { for (let i = this.v.length; i >= 1; i--) if (this.v[i - 1].some(function (x) { return x !== '' && x !== null && x !== undefined; })) return i; return 0; }
    getLastColumn() { let m = 0; this.v.forEach(function (r) { for (let j = r.length; j >= 1; j--) if (r[j - 1] !== '' && r[j - 1] != null) { m = Math.max(m, j); break; } }); return m; }
    getMaxRows() { return Math.max(this.v.length, 1000); }
    getMaxColumns() { return Math.max(this.getLastColumn(), 26); }
    getName() { return this.nombre; }
    insertRowsAfter() {}
    deleteRows(f, n) { this.v.splice(f - 1, n); this.bg.splice(f - 1, n); }
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
                   // como Google (07/10): una protección de advertencia no acepta editores
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
  const ctx = {
    console: console, Date: FakeDate, Math: Math, JSON: JSON, Map: Map, Set: Set, Object: Object, Array: Array, String: String, Number: Number,
    Logger: { log: function () { const a = Array.prototype.slice.call(arguments); let s = String(a.shift()); s = s.replace(/%s/g, function () { return String(a.shift()); }).replace(/%%/g, '%'); E.logs.push(s); } },
    Utilities: {
      formatDate: function (d, tz, f) { return f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate())).replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds())); },
      getUuid: function () { E.uuid++; return 'uuid-' + E.uuid + '-xxxx'; }, sleep: function (ms) { (E.esperas = E.esperas || []).push(ms); },
      // el hash de las huellas del plan (07/10: el paso 51 corre el cruce acá)
      DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: function (alg, t) {
        return Array.from(crypto.createHash('md5').update(String(t), 'utf8').digest()).map(function (b) { return b > 127 ? b - 256 : b; });
      }
    },
    SpreadsheetApp: { openById: function (id) { if (E.fallarAbrir && E.fallarAbrir(id)) throw new Error('Service Spreadsheets timed out'); return E.planilla(id); },
                      flush: function () {}, ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
                      newDataValidation: function () { const b = { lista: null, requireValueInList: function (l) { b.lista = l; return b; },
                        setAllowInvalid: function () { return b; }, build: function () { return b.lista; } }; return b; } },
    Session: { getEffectiveUser: function () { return { getEmail: function () { return 'yo@test'; } }; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function () { return null; }, setProperty: function () {}, deleteProperty: function () {} }; } }
  };
  vm.createContext(ctx);
  const cfg = Object.assign({ DERIVADAS_POR_SCRIPT: 'false', AGENDA_SOLO_SEMANA: 'null', AGENDA_CANCELACION_AUTOMATICA: 'true' }, config || {});   // el alcance de cada escenario no depende de cómo quedó 00_Config.js
  ARCHIVOS.forEach(function (f) {
    let s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    if (f === '00_Config.js') Object.keys(cfg).forEach(function (k) { s = s.replace(new RegExp('^const ' + k + '\\s+=.*', 'm'), 'const ' + k + ' = ' + cfg[k] + ';'); });
    vm.runInContext(s, ctx, { filename: f });
  });
  E.ctx = ctx;
  E.run = function (expr) { vm.runInContext('_ssDestino_ = null; _ssIntermedia_ = null; _cacheParsing_ = null;', ctx); E.logs = []; return vm.runInContext(expr, ctx); };
  return E;
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
  ['Colegiales', 13], ['Flores', 7], ['Parque Chacabuco', 7], ['San Nicolás', 1], ['Monserrat', 1], ['Villa Urquiza', 12],
  ['Villa Santa Rita', 11], ['Villa Devoto', 11]];
const FIGURAS = ['Clara Muzzio', 'Jorge Macri', 'Hernán Lombardi', 'Gabino Tapia', 'Laura Alonso', 'Ezequiel Sabor'];

function montar(conColumnas, filasExtra) {
  const E = crearEntorno(arguments[2]);
  const hdr = HDR.concat(conColumnas === false ? [] : COLUMNAS_AGENDA);
  const C = function (n) { return hdr.indexOf(n); };
  const filas = [hdr];
  // Historial: una fila por figura, de septiembre (cerradas o activas), todas Realizada
  FIGURAS.forEach(function (fig, i) {
    const r = hdr.map(function () { return ''; });
    r[C('Figura')] = fig; r[C('Barrio')] = BARRIOS[i][0]; r[C('FECHA')] = new D(2026, 8, 10 + i, 12); r[C('HORA')] = '18:00';
    r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = 'Realizada'; r[C('Inscriptos')] = 100 + i;
    filas.push(r);
  });
  // La fila que el equipo ya cargó para Laura Alonso del 07/10 (la agenda la VINCULA, no crea otra)
  const al = hdr.map(function () { return ''; });
  al[C('Figura')] = 'Laura Alonso'; al[C('Barrio')] = 'Flores'; al[C('FECHA')] = new D(2026, 9, 7, 12); al[C('HORA')] = '10:00';
  al[C('EVENTO')] = 'Café con Vecinos'; al[C('STATUS REUNIÓN')] = 'en agenda';
  filas.push(al);
  (filasExtra || []).forEach(function (fn) { const r = hdr.map(function () { return ''; }); fn(r, C); filas.push(r); });
  const ssD = E.planilla(E.run('RDV_SS_DESTINO')), ssI = E.planilla(E.run('RDV_SS_INTERMEDIA'));
  ssD.hojas['RVD JM-CM - ES'] = new E.Hoja('RVD JM-CM - ES', filas);
  ssD.hojas['Comunas'] = new E.Hoja('Comunas', [['Barrio', 'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona', 'Eje geográfico']]
    .concat(BARRIOS.map(function (b) { return [b[0], b[1], 1, 1, 1, 1, 1, 'Centro', '']; })));
  ssD.hojas['RDV CONJUNTO'] = new E.Hoja('RDV CONJUNTO', [['Figura', 'Barrio', 'FECHA', 'Asistentes', 'Oradores anotados', 'Oradores que hablaron']]);
  E.D = ssD.hojas['RVD JM-CM - ES']; E.ssI = ssI; E.ssD = ssD; E.C = C; E.hdr = hdr;
  return E;
}

// Puntos interiores (el promedio de los vértices de cada barrio, verificado adentro) para el geocodificador simulado.
const GEO = {};
function puntoDe(E, barrio) {
  return vm.runInContext(`(function () {
    const p = _poligonosBarrios_().filter(function (b) { return normalizeText_(b.barrio) === normalizeText_(${JSON.stringify(barrio)}); })[0];
    let x = 0, y = 0, n = 0;
    p.anillos[0].forEach(function (v, i) { if (i % 2 === 0) { x += v; n++; } else y += v; });
    return { lng: x / n, lat: y / n };
  })()`, E.ctx);
}
function geocodificador(E) {
  const tabla = { 'Av. Santa Fe 1234': 'Recoleta', 'Serrano 1500': 'Palermo', 'Bulnes 1000': 'Almagro', 'Rivadavia 7000': 'Flores',
                  'Cabildo 2000': 'Belgrano' };
  Object.keys(tabla).forEach(function (k) { GEO[k] = puntoDe(E, tabla[k]); });
  return function (consulta) {
    const k = Object.keys(tabla).filter(function (x) { return consulta.indexOf(x) === 0; })[0];
    return k ? { consulta: consulta, estado: 'OK', lat: GEO[k].lat, lng: GEO[k].lng, tipo: 'ROOFTOP', parcial: false } : { consulta: consulta, estado: 'ZERO_RESULTS' };
  };
}

let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }
function correr(E, enSeco, mails, extra) {
  E.ctx.__mails = mails; E.ctx.__geo = geocodificador(E); E.ctx.__extra = extra || {};
  return E.run('correrAgendaEnBloqueo_(' + enSeco + ', Object.assign({ mails: __mails, geocodificar: __geo }, __extra))');
}
const foto = function (h) { return JSON.stringify({ v: h.v, bg: h.bg }); };
const fila = function (E, fig, d) {
  for (let i = 1; i < E.D.v.length; i++) {
    const r = E.D.v[i], f = r[E.C('FECHA')];
    if (r[E.C('Figura')] === fig && f instanceof Date && f.getDate() === d && f.getMonth() === 9) return i;   // octubre
  }
  return -1;
};
const celda = function (E, i, n) { return E.D.v[i][E.C(n)]; };
const fondo = function (E, i, n) { return E.D.bg[i][E.C(n)]; };
const SIS = '#CFE2F3';

// ============================== los mails (inventados) ==============================

const ASUNTO_12 = 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 12/10 al 18/10';
const ASUNTO_19 = 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 19/10 al 25/10';
const NL = String.fromCharCode(10);
function mail(dia, hora, bloques, asunto) {
  return { fecha: new D(2026, 9, dia, hora, 0), asunto: asunto, cuerpo: [].concat.apply([], bloques).join(NL), truncado: false };
}
const SEG11 = function (lugar) { return ['*Jueves 15/10*', 'Evento: Seguridad en tu Barrio, Comuna 11', 'Hora: 18:00h', 'Lugar: ' + lugar]; };
const MACRI = function (lugar) { return ['*Jueves 15/10*', 'Evento: Encuentro con Vecinos Jorge Macri, Villa Santa Rita', 'Hora: 11:00h', 'Lugar: ' + lugar]; };
const MUZZIO = ['*Miércoles 14/10*', 'Evento: Encuentro con Vecinos Clara Muzzio, Recoleta', 'Hora: 18:30h', 'Lugar: Av. Santa Fe 1234, Club Social'];
const SEG12 = function (lugar) { return ['*Jueves 22/10*', 'Evento: Seguridad en tu Barrio, Comuna 12', 'Hora: 18:00h', 'Lugar: ' + lugar]; };
const SEG14 = ['*Jueves 22/10*', 'Evento: Seguridad en tu Barrio, Comuna 14', 'Hora: 18:00h', 'Lugar: A CONFIRMAR'];
// v1 (lunes 12/10): todo "A CONFIRMAR"; v2 (miércoles 14/10): la de la Comuna 11 ya tiene dirección (inventada)
const M1 = mail(12, 9, [MUZZIO, SEG11('A CONFIRMAR'), MACRI('A CONFIRMAR')], ASUNTO_12);
const M2 = mail(14, 9, [MUZZIO, SEG11('Pasaje Ficticio 1234, Club de Barrio'), MACRI('A CONFIRMAR')], ASUNTO_12);
const N1 = mail(15, 8, [SEG12('A CONFIRMAR'), SEG14], ASUNTO_19);
const N2 = mail(15, 10, [SEG12('Calle Inventada 500, Sociedad de Fomento'), SEG14], ASUNTO_19);

const sinFig = function (E, lugar, dia) {
  const out = [];
  for (let i = 1; i < E.D.v.length; i++) {
    const r = E.D.v[i], f = r[E.C('FECHA')];
    if (r[E.C('Lugar (mail)')] === lugar && f instanceof Date && f.getDate() === dia && f.getMonth() === 9 && !r[E.C('Figura')]) out.push(i);
  }
  return out;
};

// ============================== A: Seguridad en tu Barrio ==============================

console.log('[1] HOY (apagada): 829/830 — la Seguridad de la Comuna 11 cambia de "A CONFIRMAR" a una dirección y se crea OTRA fila');
let E = montar();
let r = correr(E, false, [M1]);
ok(r && !r.error && sinFig(E, 'Comuna 11', 15).length === 1, 'v1: una fila de Seguridad Comuna 11 (A CONFIRMAR)');
r = correr(E, false, [M1, M2]);
ok(r.crear === 1 && sinFig(E, 'Comuna 11', 15).length === 2, 'v2 con la regla apagada: crea una SEGUNDA fila (el bug de 829/830) — crear ' + r.crear);
const E829 = E;   // para la medición de duplicados

console.log('[2] CON AGENDA_SEGURIDAD_POR_COMUNA: la misma reunión se ACTUALIZA, no se crea otra');
E = montar(true, [], { AGENDA_SEGURIDAD_POR_COMUNA: 'true' });
correr(E, false, [M1]);
const i11 = sinFig(E, 'Comuna 11', 15)[0];
r = correr(E, false, [M1, M2]);
ok(r.crear === 0 && sinFig(E, 'Comuna 11', 15).length === 1, 'no se crea otra fila (crear ' + r.crear + ')');
ok(celda(E, i11, 'Dirección') === 'Pasaje Ficticio 1234, Club de Barrio' && celda(E, i11, 'agenda_direccion_escrita') === 'Pasaje Ficticio 1234, Club de Barrio' &&
   fondo(E, i11, 'Dirección') === SIS, 'la fila de la Comuna 11: Dirección "A CONFIRMAR" → "Pasaje Ficticio 1234, Club de Barrio", en #CFE2F3');
r = correr(E, false, [M1, M2]);
ok(r.crear === 0 && r.actualizar === 0, 'y otra corrida no cambia nada (idempotente)');

console.log('[3] la 829 que BORRÓ el equipo no se recrea (con y sin la regla)');
['false', 'true'].forEach(function (flag) {
  [0, 1].forEach(function (cual) {
    const X = montar(true, [], { AGENDA_SEGURIDAD_POR_COMUNA: 'false' });
    correr(X, false, [M1]);
    correr(X, false, [M1, M2]);                         // hoy: quedan dos (la "829" y la "830")
    const dos = sinFig(X, 'Comuna 11', 15);
    const borrar = dos[cual], queda = dos[1 - cual];
    const uidQueda = celda(X, queda, 'agenda_uid');
    X.D.deleteRow(borrar + 1);                          // el equipo borra una
    const rr = correr(X, false, [M1, M2], { seguridadPorComuna: flag === 'true' });
    const quedan = sinFig(X, 'Comuna 11', 15);
    ok(rr.crear === 0 && quedan.length === 1 && celda(X, quedan[0], 'agenda_uid') === uidQueda,
       'regla ' + (flag === 'true' ? 'prendida' : 'apagada') + ', borrada la ' + (cual ? 'segunda (con dirección)' : 'primera (A CONFIRMAR)') +
       ': no se recrea (crear ' + rr.crear + ', borradas por el equipo ' + rr.borradasEquipo + ')');
    if (flag === 'true') ok(celda(X, quedan[0], 'Dirección') === 'Pasaje Ficticio 1234, Club de Barrio', '  y la que queda tiene la dirección del mail');
  });
});

console.log('[4] 833/835: dos Seguridad del 22/10 (Comunas 12 y 14) con "A CONFIRMAR"');
E = montar();
correr(E, false, [N1]);
const i12 = sinFig(E, 'Comuna 12', 22)[0], i14 = sinFig(E, 'Comuna 14', 22)[0];
ok(i12 > 0 && i14 > 0, 'la primera corrida crea las dos');
r = correr(E, true, [N1]);
ok(r.ambiguas === 2, 'HOY (apagada): las dos quedan AMBIGUAS ("A CONFIRMAR" = "A CONFIRMAR") — ambiguas ' + r.ambiguas);
r = correr(E, true, [N1], { seguridadPorComuna: true });
ok(r.ambiguas === 0 && r.crear === 0, 'con la regla: ninguna ambigua, ninguna nueva — ambiguas ' + r.ambiguas);
r = correr(E, false, [N1, N2], { seguridadPorComuna: true });
ok(celda(E, i12, 'Dirección') === 'Calle Inventada 500, Sociedad de Fomento' && celda(E, i14, 'Dirección') === 'A CONFIRMAR' && r.crear === 0,
   'con la dirección nueva de la Comuna 12: se actualiza SÓLO la de la Comuna 12');

console.log('[5] la identidad: tipo, lugar y grupo');
E = montar();
const id = function (ev, uid, lugar, evento, mailT) { E.ctx.__a = [ev, uid, lugar, evento, mailT]; return E.run('mismaReunionSinFiguraAgenda_.apply(null, __a)'); };
const evS = { figuraFila: '', lugar: 'Comuna 11', tipo: 'Seguridad en tu Barrio', grupo: 'CM y Ministros', otrosGrupos: [] };
ok(id(evS, 'c-1', 'Comuna 11', 'Seguridad en tu Barrio, Comuna 11', ASUNTO_12 + ' | 12/10/2026 09:00') === true, 'mismo lugar, tipo y grupo (la fecha la mira quien llama): es la misma');
ok(id(evS, 'c-1', 'Comuna 12', 'Seguridad en tu Barrio, Comuna 12', '') === false, 'otra comuna: no');
ok(id(evS, '', 'Comuna 11', 'Seguridad en tu Barrio, Comuna 11', '') === false, 'una fila del equipo (sin agenda_uid): no');
ok(id(evS, 'c-1', 'Comuna 11', 'Encuentro con Vecinos, Comuna 11', '') === false, 'otro tipo: no');
ok(id(evS, 'c-1', 'Comuna 11', 'Seguridad en tu Barrio, Comuna 11', 'Agenda Encuentros de vecinos con JM - Semana del 12/10 al 18/10 | 12/10/2026 09:00') === false,
   'otro grupo (JM): no');
ok(id(Object.assign({}, evS, { otrosGrupos: ['JM'] }), 'c-1', 'Comuna 11', 'Seguridad en tu Barrio, Comuna 11',
      'Agenda Encuentros de vecinos con JM - Semana del 12/10 al 18/10 | 12/10/2026 09:00') === true, 'el grupo de otro mail que también la trae: sí');
ok(E.run('esDireccionReal_("A CONFIRMAR (NO SE COMUNICA LA DIRECCIÓN)")') === false && E.run('esDireccionReal_("Club de Barrio")') === false &&
   E.run('esDireccionReal_("Pasaje Ficticio 1234, Club")') === true, 'esDireccionReal_: "A CONFIRMAR" y un nombre de lugar no; calle y número sí');
ok(E.run('compararDirecciones_("A CONFIRMAR", "A CONFIRMAR")') === '', 'compararDirecciones_ no compara "A CONFIRMAR" (no es dirección)');

// ============================== B: el barrio del mail ==============================

console.log('[6] 824: Macri 15/10, Villa Santa Rita, "A CONFIRMAR"');
E = montar();
correr(E, false, [M1]);
const iMa = fila(E, 'Jorge Macri', 15);
ok(iMa > 0 && celda(E, iMa, 'Barrio') === '', 'HOY (apagada): la fila se crea SIN barrio (la dirección es "A CONFIRMAR")');
r = correr(E, false, [M1], { barrioDelMail: true });
ok(celda(E, iMa, 'Barrio') === 'Villa Santa Rita' && celda(E, iMa, 'agenda_barrio_escrito') === 'Villa Santa Rita' && fondo(E, iMa, 'Barrio') === SIS,
   'con AGENDA_BARRIO_DEL_MAIL: se ACTUALIZA con Barrio "Villa Santa Rita" (y su traza), en #CFE2F3');
E = montar(true, [], { AGENDA_BARRIO_DEL_MAIL: 'true' });
correr(E, false, [M1]);
ok(celda(E, fila(E, 'Jorge Macri', 15), 'Barrio') === 'Villa Santa Rita', 'y una fila nueva nace con ese barrio (interruptor en 00_Config.js)');
E = montar();
correr(E, false, [M1]);
E.D.v[fila(E, 'Jorge Macri', 15)][E.C('Barrio')] = 'Villa Devoto';
correr(E, false, [M1], { barrioDelMail: true });
ok(celda(E, fila(E, 'Jorge Macri', 15), 'Barrio') === 'Villa Devoto', 'un Barrio que cargó el equipo no se toca');
E = montar();
correr(E, false, [mail(12, 9, [MACRI('Av. Santa Fe 1234, Salón')], ASUNTO_12)], { barrioDelMail: true });
ok(celda(E, fila(E, 'Jorge Macri', 15), 'Barrio') === '', 'si la dirección da OTRO barrio (Recoleta), no se escribe ninguno');
E = montar();
correr(E, false, [M1], { barrioDelMail: true });
ok(sinFig(E, 'Comuna 11', 15).every(function (i) { return celda(E, i, 'Barrio') === ''; }), 'la Seguridad "Comuna 11" (una comuna, no un barrio) sigue sin barrio');

// ============================== las mediciones en seco ==============================

console.log('[7] medirReglasAgenda1510 (en seco): lo que cambiaría, y "CAMBIA en lo demás" 0');
E = montar();
correr(E, false, [M1, N1]);                              // la base de hoy: todo creado con "A CONFIRMAR", sin barrio
let antesD = foto(E.D), antesC = foto(E.ssD.hojas['RDV CONJUNTO']);
E.ctx.__mails = [M1, M2, N1]; E.ctx.__geo = geocodificador(E);
const med = E.run('medirReglasAgenda1510({ mails: __mails, geocodificar: __geo })');
ok(foto(E.D) === antesD && foto(E.ssD.hojas['RDV CONJUNTO']) === antesC, 'no escribe nada (la base y RDV CONJUNTO, iguales)');
med.cambios.forEach(function (c) { console.log('       ' + c.reunion + ' :: ' + c.hoy + ' → ' + c.con); });
ok(med.cambios.some(function (c) { return /Comuna 11/.test(c.reunion) && /se crearía una fila nueva/.test(c.hoy) && /se actualiza la fila \d+ \(Dirección A CONFIRMAR → Pasaje Ficticio 1234/.test(c.con); }),
   'la Comuna 11: hoy se crearía una fila nueva → con la regla se actualiza (Dirección A CONFIRMAR → Pasaje…)');
ok(med.cambios.filter(function (c) { return /Comuna 1[24]/.test(c.reunion) && /^AMBIGUA/.test(c.hoy) && /sin cambios/.test(c.con); }).length === 2,
   'las Comunas 12 y 14: hoy AMBIGUAS → con la regla, cada una su fila (sin cambios)');
ok(med.cambios.some(function (c) { return /Jorge Macri/.test(c.reunion) && /Barrio \(vacío\) → Villa Santa Rita/.test(c.con); }),
   'Macri 15/10: Barrio (vacío) → Villa Santa Rita');
ok(med.cambios.length === 4 && med.otros.length === 0, 'cuatro reuniones cambian, y CAMBIA en lo demás 0 (' + med.otros.join(' | ') + ')');
ok(!med.cambios.some(function (c) { return /Muzzio/.test(c.reunion); }), 'Muzzio (con figura y dirección) no cambia');

console.log('[8] duplicadosAgenda (sólo lectura): los 829/830 que ya creó la agenda');
antesD = foto(E829.D);
let dup = E829.run('duplicadosAgenda()');
ok(foto(E829.D) === antesD, 'no escribe nada');
ok(dup.probables.length === 1 && dup.probables[0].filas.length === 2 && /una sin dirección real/.test(dup.probables[0].porque),
   'un duplicado probable: dos filas de la Comuna 11 del 15/10, una sin dirección real — ' + JSON.stringify(dup.probables));
const dosF = dup.probables[0].filas;
E829.D.deleteRow(dosF[0]);                            // el equipo borra la primera ("829")
dup = E829.run('duplicadosAgenda()');
ok(dup.probables.length === 0 && dup.borradas.length === 1 && dup.borradas[0].quedo.length === 1 && dup.borradas[0].quedo[0] === dosF[1] - 1,
   'borrada la "829": ya no hay duplicado, y se lista como borrada por el equipo con la que quedó — ' + JSON.stringify(dup.borradas));

// ============================== C: RDV CONJUNTO repetido ==============================

console.log('[9] RDV CONJUNTO con Macri dos veces el 15/10 (Villa Santa Rita y Villa Devoto, la misma dirección)');
const baseMacri = function (barrio) {
  return [function (r, C) {
    r[C('Figura')] = 'Jorge Macri'; r[C('Barrio')] = barrio; r[C('FECHA')] = new D(2026, 9, 15, 12); r[C('HORA')] = '11:00';
    r[C('Dirección')] = 'A CONFIRMAR'; r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = 'en agenda';
  }];
};
const conjunto = function (asisVSR, asisVD) {
  return [['Figura', 'Barrio', 'FECHA', 'Asistentes', 'Oradores anotados', 'Oradores que hablaron', 'Dirección'],
          ['Macri Jorge', 'Villa Santa Rita', new D(2026, 9, 15, 12), asisVSR, '', '', 'Calle Inventada 77'],
          ['Macri Jorge', 'Villa Devoto', new D(2026, 9, 15, 12), asisVD, '', '', 'Calle Inventada 77']];
};
const cruce = function (barrio, asisVSR, asisVD, regla) {
  const X = montar(true, baseMacri(barrio));
  X.ssD.hojas['RDV CONJUNTO'] = new X.Hoja('RDV CONJUNTO', conjunto(asisVSR, asisVD));
  const iF = fila(X, 'Jorge Macri', 15) + 1;
  return X.run('(function () { const x = cruzarAsistentes_(leerDestino_(), leerComunasMap_(), { repetidaPorUbicacion: ' + regla + ' }); ' +
               'const p = x.porFila.get(' + iF + '); return { asis: p ? p.asis : null, de: p ? p.filaConjunto : null, conflicto: x.conflicto.length, ' +
               'difiere: x.barrioDifiere.length, sinDecidir: x.repetidasSinDecidir.length, elegidas: x.repetidasElegidas.length }; })()');
};
let c = cruce('Villa Santa Rita', '', 120, false);
ok(c.asis === 120 && c.de === 3 && c.difiere === 1, 'HOY, base Villa Santa Rita, sólo la de Villa Devoto con asistentes: escribiría 120 (la de Villa Devoto) — ' + JSON.stringify(c));
c = cruce('Villa Santa Rita', '', 120, true);
ok(c.asis === null && c.elegidas === 1, 'con la regla: vale la de Villa Santa Rita (sin asistentes): no se escribe nada — ' + JSON.stringify(c));
c = cruce('Villa Santa Rita', 95, 120, false);
ok(c.asis === null && c.conflicto === 1, 'HOY, las dos con asistentes distintos: conflicto, no se escribe — ' + JSON.stringify(c));
c = cruce('Villa Santa Rita', 95, 120, true);
ok(c.asis === 95 && c.de === 2, 'con la regla: 95, la de Villa Santa Rita — ' + JSON.stringify(c));
c = cruce('', '', 120, false);
ok(c.asis === 120, 'HOY, base SIN barrio, sólo la de Villa Devoto con asistentes: escribiría 120 — ' + JSON.stringify(c));
c = cruce('', 95, 120, false);
ok(c.asis === null && c.conflicto === 1, 'HOY, base SIN barrio, las dos con asistentes distintos: conflicto, no se escribe');
c = cruce('', '', 120, true);
ok(c.asis === null && c.sinDecidir === 1, 'con la regla: no se puede decidir (misma comuna, misma dirección): no se escribe y se lista — ' + JSON.stringify(c));
c = cruce('', 95, 120, true);
ok(c.asis === null && c.sinDecidir === 1, 'con la regla, sin barrio y las dos con asistentes: no se escribe y se lista');
c = cruce('', 95, 95, true);
ok(c.asis === 95 && c.sinDecidir === 0, 'con la regla, las dos con lo mismo: se escribe (no hay nada que elegir)');

console.log('[10] medirConjuntoRepetido (en seco) y RDV CONJUNTO no se escribe');
E = montar(true, baseMacri('Villa Santa Rita').concat([function (r, C) {
  r[C('Figura')] = 'Clara Muzzio'; r[C('Barrio')] = 'Recoleta'; r[C('FECHA')] = new D(2026, 9, 14, 12); r[C('STATUS REUNIÓN')] = 'en agenda';
}]));
E.ssD.hojas['RDV CONJUNTO'] = new E.Hoja('RDV CONJUNTO', conjunto('', 120).concat([['Muzzio Clara', 'Recoleta', new D(2026, 9, 14, 12), 40, 2, 1, 'Av. Santa Fe 1234']]));
antesC = foto(E.ssD.hojas['RDV CONJUNTO']); antesD = foto(E.D);
const mc = E.run('medirConjuntoRepetido()');
mc.cambios.forEach(function (t) { console.log('       ' + t); });
ok(mc.cambios.length === 1 && /Asistentes: hoy escribiría 120 \(RDV CONJUNTO fila 3\) → con la regla: nada/.test(mc.cambios[0]) && mc.otros.length === 0,
   'fila de Macri: hoy 120 (Villa Devoto) → con la regla nada; CAMBIA en lo demás 0 (Muzzio igual)');
ok(foto(E.ssD.hojas['RDV CONJUNTO']) === antesC && foto(E.D) === antesD, 'no escribe nada');
E = montar(true, [], { AGENDA_SEGURIDAD_POR_COMUNA: 'true', AGENDA_BARRIO_DEL_MAIL: 'true' });
E.ssD.hojas['RDV CONJUNTO'] = new E.Hoja('RDV CONJUNTO', conjunto(95, 120));
antesC = foto(E.ssD.hojas['RDV CONJUNTO']);
correr(E, false, [M1, M2]);
ok(foto(E.ssD.hojas['RDV CONJUNTO']) === antesC, 'la agenda real (con las reglas prendidas) no toca RDV CONJUNTO');
// la figura de una Seguridad de la Comuna 11 ese día, HOY: las dos filas son de Macri (misma dirección) y dan la misma figura
const fs1 = E.run('(function () { const c = leerConjuntoPorFecha_(); return figuraSeguridad_(new Date(2026, 9, 15, 12), "", 11, c, "Calle Inventada 77", undefined, ' +
                  'ubicacionDeFila_({ barrio: "", lugarMail: "Comuna 11" })); })()');
ok(fs1.figura === 'Jorge Macri', 'figuraSeguridad_ (HOY): una Seguridad de la Comuna 11 en "Calle Inventada 77" → Jorge Macri (las dos filas son de él) — ' + JSON.stringify(fs1));

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);

