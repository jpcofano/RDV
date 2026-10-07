/**
 * tests/agenda_escritura.test.js — Agenda, etapa 2 (crear y actualizar filas del destino), en Node, con un destino
 * SIMULADO y mails SINTÉTICOS. "Hoy" es el martes 06/10/2026.
 *
 *     node tests/agenda_escritura.test.js
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: mails, horarios y direcciones son
 * inventados; los barrios, las comunas y sus límites son los públicos de la Ciudad; las figuras, nombres de la
 * columna Figura. Gmail y Maps no se llaman: los mails se pasan como lista y el geocodificador es una tabla.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', '05_Escritura.js', '20_UpsertDestino.js',
                  '41_AgendaParser.js', '42_BarriosCabaGeo.js', '40_Agenda.js', 'diagnostico/17_peso_intermedia.js',
                  'diagnostico/08_verificar_escritura.js', 'diagnostico/03_muestras_mail.js', 'diagnostico/16_agenda_medicion.js',
                  'diagnostico/19_direccion_conjunto.js'];
const HOY = new Date(2026, 9, 6, 12, 0, 0);
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
                   addEditor: function () { return pr; }, getEditors: function () { return []; }, removeEditors: function () { return pr; },
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
      getUuid: function () { E.uuid++; return 'uuid-' + E.uuid + '-xxxx'; }, sleep: function (ms) { (E.esperas = E.esperas || []).push(ms); }
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
  ['Villa Santa Rita', 11]];
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

// Los mails de la semana del 05/10 al 10/10
const ASUNTO = 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 05/10 al 10/10';
const EV = {
  sabor: ['*Lunes 05/10*', 'Evento: Encuentro con Vecinos Ezequiel Sabor, Comuna 12', 'Hora: 18:00h', 'Lugar: A CONFIRMAR'],
  lombardi: ['*Miércoles 07/10*', 'Evento: Encuentro con Vecinos Hernán Lombardi, Gabino Tapia (NO PARTICIPA), Comuna 13', 'Hora: 19:00 hs',
             'Lugar: A CONFIRMAR (NO SE COMUNICA LA DIRECCIÓN)'],
  alonso: ['*Miércoles 07/10*', 'Evento: Café con Vecinos Laura Alonso, Comuna 7', 'Hora: 10:00h', 'Lugar: Rivadavia 7000, Plaza'],
  muzzio: function (dia, hora) { return ['*' + dia + '*', 'Evento: Encuentro con Vecinos Clara Muzzio, Recoleta', 'Hora: ' + hora + 'h', 'Lugar: Av. Santa Fe 1234, Club Social']; },
  seguridad: ['*Jueves 08/10*', 'Evento: Seguridad en tu Barrio, Comuna 5', 'Hora: 18:00h', 'Lugar: Bulnes 1000, Escuela'],
  macri: function (lugar) { return ['*Viernes 09/10*', 'Evento: Encuentro "1 a 1" Jorge Macri, Comuna 14', 'Hora: 11:00h', 'Lugar: ' + lugar]; }
};
function mail(dia, hora, bloques, asunto) {
  return { fecha: new D(2026, 9, dia, hora, 0), asunto: asunto || ASUNTO, cuerpo: [].concat.apply([], bloques).join('\n'), truncado: false };
}
const V1 = mail(2, 9, [EV.sabor, EV.lombardi, EV.alonso, EV.muzzio('Jueves 08/10', '18:30'), EV.seguridad, EV.macri('Serrano 1500')]);
const V2 = mail(5, 9, [EV.sabor, EV.lombardi.map(function (l) { return l.replace('19:00 hs', '19:30 hs'); }), EV.alonso,
                       EV.muzzio('Jueves 08/10', '19:00'), EV.seguridad, EV.macri('Cabildo 2000')]);
// V3 (martes 06/10 8 h): Muzzio pasa al sábado 10/10; Lombardi desaparece (futura → se suspende); Sabor (lunes 05/10)
// ya no está (ya había pasado → no cuenta como cancelación).
const V3 = mail(6, 8, [EV.alonso, EV.muzzio('Sábado 10/10', '19:00'), EV.seguridad, EV.macri('Cabildo 2000')]);
const V4 = mail(6, 10, [EV.lombardi.map(function (l) { return l.replace('19:00 hs', '19:30 hs'); }), EV.alonso,
                        EV.muzzio('Sábado 10/10', '19:00'), EV.seguridad, EV.macri('Cabildo 2000')]);
const VIEJO = mail(1, 9, [['*Martes 04/08*', 'Evento: Encuentro con Vecinos Ezequiel Sabor, Comuna 12', 'Hora: 18:00h', 'Lugar: A CONFIRMAR']],
                   'Agenda Encuentros de vecinos con CM y Ministros - Semana del 03/08 al 08/08');
VIEJO.fecha = new D(2026, 6, 31, 9, 0);

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

// ============================== escenarios ==============================

console.log('[1] en seco: calcula y no toca el destino');
let E = montar();
let antes = foto(E.D);
let r = correr(E, true, [V1, VIEJO]);
ok(r && !r.error, 'sin error' + (r && r.error ? ': ' + r.error : ''));
ok(foto(E.D) === antes, 'el destino no cambió');
ok(r.crear === 5 && r.vincular === 1, 'crearía 5 y vincularía 1 (crear ' + r.crear + ', vincular ' + r.vincular + ')');
ok(r.viejasSinFila === 1, 'la reunión vieja del mail (04/08) sin fila va a la solapa informativa, no se crea');
const reg = E.ssI.hojas['REGISTRO_AGENDA'];
ok(reg && reg.v.length === 2 && reg.v[1][2] === 'en seco', 'REGISTRO_AGENDA: una línea "en seco"');

console.log('[2] crear y vincular (V1)');
const nAntes = E.D.v.length;
r = correr(E, false, [V1, VIEJO]);
ok(r && !r.error, 'sin error' + (r && r.error ? ': ' + r.error : ''));
ok(E.D.v.length === nAntes + 5, 'cinco filas nuevas, AL FINAL (' + (E.D.v.length - nAntes) + ')');
const iMu = fila(E, 'Clara Muzzio', 8), iMa = fila(E, 'Jorge Macri', 9), iLo = fila(E, 'Hernán Lombardi', 7), iAl = fila(E, 'Laura Alonso', 7);
const iSe = E.D.v.findIndex(function (x, i) { return i > 0 && x[E.C('Figura')] === '' && x[E.C('agenda_uid')] !== ''; });
ok(iMu >= nAntes && iMa >= nAntes && iLo >= nAntes && iSe >= nAntes, 'las nuevas están después de las que había');
ok(iAl === nAntes - 1 && E.D.v.filter(function (x) { return x[E.C('Figura')] === 'Laura Alonso'; }).length === 2,
   'Laura Alonso 07/10 NO se duplicó: se vinculó la fila del equipo');
ok(celda(E, iMu, 'HORA') === '18:30' && celda(E, iMu, 'STATUS REUNIÓN') === 'en agenda' && celda(E, iMu, 'EVENTO') === 'Encuentro con Vecinos',
   'Muzzio: hora, "en agenda", EVENTO');
ok(celda(E, iMu, 'Dirección') === 'Av. Santa Fe 1234, Club Social', 'Dirección: la línea "Lugar:" del mail, tal cual');
ok(celda(E, iMu, 'Barrio') === 'Recoleta' && celda(E, iMu, 'agenda_barrio_escrito') === 'Recoleta', 'Barrio por la regla de confianza: Recoleta');
ok(celda(E, iMa, 'EVENTO') === 'Uno a uno' && celda(E, iMa, 'Barrio') === 'Palermo', 'Macri "1 a 1": EVENTO "Uno a uno", Barrio Palermo (Comuna 14 = la del mail)');
ok(celda(E, iLo, 'No participa') === 'Gabino Tapia' && celda(E, iLo, 'Barrio') === '' &&
   /A CONFIRMAR/.test(celda(E, iLo, 'Dirección')), 'conjunta: a nombre de Lombardi, "No participa" Tapia, sin barrio, Dirección A CONFIRMAR tal cual');
ok(celda(E, iSe, 'Figura') === '' && celda(E, iSe, 'Barrio') === 'Almagro' && celda(E, iSe, 'EVENTO') === 'Encuentro con Vecinos',
   'Seguridad en tu Barrio: SIN figura, EVENTO "Encuentro con Vecinos" (como el equipo), Barrio Almagro (Comuna 5)');
ok(/^c-/.test(celda(E, iMu, 'agenda_uid')) && /^v-/.test(celda(E, nAntes - 1, 'agenda_uid')), 'agenda_uid: "c-" la creada, "v-" la vinculada');
ok([iMu, iMa, iLo, iSe].every(function (i) { return fondo(E, i, 'FECHA') === SIS && fondo(E, i, 'agenda_uid') === SIS; }), 'todo lo escrito en #CFE2F3');
ok(celda(E, iAl, 'Dirección') === 'Rivadavia 7000, Plaza' && celda(E, iAl, 'agenda_uid') !== '' && celda(E, iAl, 'Barrio') === 'Flores' &&
   celda(E, iAl, 'agenda_hora_escrita') === '10:00', 'vinculada: Dirección vacía completada, agenda_uid, Barrio del equipo intacto, la hora del equipo replica el mail');
ok(fondo(E, iAl, 'HORA') === null && fondo(E, iAl, 'Barrio') === null, 'las celdas del equipo de la vinculada no se pintaron');
ok(fila(E, 'Ezequiel Sabor', 5) > 0, 'Sabor del lunes 05/10 (en el alcance) se crea');
const cam = E.ssI.hojas['REGISTRO_AGENDA_CAMBIOS'];
ok(cam && cam.v.length > 30, 'REGISTRO_AGENDA_CAMBIOS: cada celda con antes y después (' + (cam ? cam.v.length - 1 : 0) + ')');
r = correr(E, false, [V1, VIEJO]);
ok(r.crear === 0 && r.vincular === 0 && E.D.v.length === nAntes + 5, 'correrla otra vez con lo mismo: no crea ni vincula nada (idempotente)');

console.log('[3] actualizar sólo lo del sistema (V2)');
E.D.v[iLo][E.C('HORA')] = '20:00';            // alguien del equipo cambió la hora de Lombardi
r = correr(E, false, [V1, V2, VIEJO]);
ok(celda(E, iMu, 'HORA') === '19:00' && celda(E, iMu, 'agenda_hora_escrita') === '19:00', 'Muzzio: hora del sistema 18:30 → 19:00');
ok(celda(E, iLo, 'HORA') === '20:00', 'Lombardi: la hora que cambió el equipo NO se toca (el mail dice 19:30)');
ok(r.editadas >= 1, 'y se registra como "editada por el equipo" (' + r.editadas + ')');
ok(celda(E, iMa, 'Dirección') === 'Cabildo 2000' && celda(E, iMa, 'Barrio') === '',
   'Macri: cambió la dirección (Cabildo 2000 = Belgrano, Comuna 13; el mail dice Comuna 14) → la regla no se cumple y el barrio del sistema se vacía');
ok(fondo(E, iMa, 'Barrio') === null, 'y la celda vaciada queda sin color');

console.log('[4] reprogramación dentro de la semana, suspensión y "ya había pasado" (V3, martes 06/10 8 h)');
const filasAntes = E.D.v.length;
r = correr(E, false, [V1, V2, V3, VIEJO]);
ok(r.mover === 1 && fila(E, 'Clara Muzzio', 10) === iMu && fila(E, 'Clara Muzzio', 8) === -1, 'Muzzio: la fila se MUEVE del 08/10 al 10/10');
ok(E.D.v.length === filasAntes, 'no se crea una segunda fila');
ok(celda(E, iLo, 'STATUS REUNIÓN') === 'Suspendida' && fondo(E, iLo, 'STATUS REUNIÓN') === SIS &&
   celda(E, iLo, 'agenda_status_escrito') === 'Suspendida', 'Lombardi desapareció siendo futura: "Suspendida", en #CFE2F3');
const iSa = fila(E, 'Ezequiel Sabor', 5);
ok(celda(E, iSa, 'STATUS REUNIÓN') === 'en agenda' && r.noFuturas >= 1, 'Sabor (lunes 05/10) ya había pasado cuando salió: NO se suspende');

console.log('[5] reactivar (V4) y la protección del 60%');
r = correr(E, false, [V1, V2, V3, V4, VIEJO]);
ok(celda(E, iLo, 'STATUS REUNIÓN') === 'en agenda' && r.reactivar === 1, 'Lombardi volvió a aparecer: vuelve a "en agenda" (lo había suspendido el sistema)');
const V5 = mail(6, 11, [EV.alonso]);            // una versión con 1 reunión de 5: parcial
r = correr(E, false, [V1, V2, V3, V4, V5, VIEJO]);
ok(r.suspender === 0 && r.saltadas60 >= 3, 'versión parcial: no se suspende nada (' + r.saltadas60 + ' saltadas por la protección)');
ok(celda(E, iLo, 'STATUS REUNIÓN') === 'en agenda', 'Lombardi sigue "en agenda"');

console.log('[6] Seguridad en tu Barrio: la Figura desde RDV CONJUNTO');
E = montar(true, [
  function (r, C) { r[C('EVENTO')] = 'Seguridad en tu Barrio'; r[C('FECHA')] = new D(2026, 9, 1, 12); r[C('Barrio')] = 'Almagro';
                    r[C('STATUS REUNIÓN')] = 'en agenda'; r[C('agenda_uid')] = 'uuid-a'; },
  function (r, C) { r[C('EVENTO')] = 'Seguridad en tu Barrio'; r[C('FECHA')] = new D(2026, 9, 2, 12); r[C('Barrio')] = 'Flores';
                    r[C('STATUS REUNIÓN')] = 'en agenda'; r[C('agenda_uid')] = 'uuid-b'; }]);
const conj = E.ssD.hojas['RDV CONJUNTO'];
conj.v.push(['Sabor Ezequiel', 'Almagro', new D(2026, 9, 1, 12), 30, '', '']);
conj.v.push(['Alonso Laura', 'C7', new D(2026, 9, 2, 12), 20, '', '']);
conj.v.push(['Muzzio Clara', 'Flores', new D(2026, 9, 2, 12), 20, '', '']);
r = correr(E, false, [V1]);
const iS1 = E.D.v.findIndex(function (x) { return x[E.C('agenda_uid')] === 'uuid-a'; });
const iS2 = E.D.v.findIndex(function (x) { return x[E.C('agenda_uid')] === 'uuid-b'; });
ok(celda(E, iS1, 'Figura') === 'Ezequiel Sabor' && fondo(E, iS1, 'Figura') === SIS, 'una sola fila de RDV CONJUNTO ese día en Almagro → Figura "Ezequiel Sabor"');
ok(celda(E, iS2, 'Figura') === '' && r.figuraACompletar === 1, 'dos figuras posibles (Flores y C7) → no se escribe; va a AGENDA_FIGURA_A_COMPLETAR');
ok(E.ssI.hojas['AGENDA_FIGURA_A_COMPLETAR'].v.length === 2, 'la solapa la lista');

console.log('[7] deshacer');
E = montar();
correr(E, false, [V1, VIEJO]);
const despues = E.D.v.length;
const iLaura = fila(E, 'Laura Alonso', 7);
const iMac = fila(E, 'Jorge Macri', 9);
E.D.v[iMac][E.C('Inscriptos')] = 77;           // alguien cargó algo en una fila creada
let d = E.run('deshacerAgenda(true)');
ok(d && d.sacarian === 4 && d.noSeSacan === 1 && E.D.v.length === despues, 'en seco: sacaría 4, la editada no; no toca nada');
d = E.run('deshacerAgenda(false)');
ok(d && d.borradas + d.vaciadas === 4, 'saca las 4 que siguen replicando el mail (borradas ' + d.borradas + ', vaciadas ' + d.vaciadas + ')');
ok(fila(E, 'Jorge Macri', 9) > 0 && E.D.v[fila(E, 'Jorge Macri', 9)][E.C('Inscriptos')] === 77, 'la que tiene Inscriptos cargado queda');
ok(celda(E, iLaura, 'Dirección') === '' && celda(E, iLaura, 'agenda_uid') === '' && fondo(E, iLaura, 'Dirección') === null,
   'la vinculada vuelve a como estaba (Dirección vacía, sin agenda_uid, sin color)');
ok(celda(E, iLaura, 'HORA') === '10:00' && celda(E, iLaura, 'Barrio') === 'Flores', 'y lo del equipo sigue igual');
d = E.run('deshacerAgenda(false)');
ok(d && d.deshecho === 0, 'no se deshace dos veces');

console.log('[8] la guarda de la excepción y la regla con margen');
E = montar();
let error = null;
try { E.run(`escribirAgendaLote_(ssDestino_().getSheetByName('RVD JM-CM - ES'), ${JSON.stringify(E.hdr)}, [{ fila: 2, col: ${E.C('Inscriptos') + 1}, valor: 5, esperado: 100 }])`); }
catch (e) { error = e; }
ok(error && /no la escribe la agenda/.test(error.message) && celda(E, 1, 'Inscriptos') === 100, 'Inscriptos no es columna de la agenda: error, no escribe nada');
error = null;
try { E.run(`escribirAgendaLote_(ssDestino_().getSheetByName('RVD JM-CM - ES'), ${JSON.stringify(E.hdr)}, [{ fila: 2, col: ${E.C('STATUS REUNIÓN') + 1}, valor: 'en agenda', esperado: 'Realizada' }])`); }
catch (e) { error = e; }
ok(error && /no es una transición/.test(error.message) && celda(E, 1, 'STATUS REUNIÓN') === 'Realizada', 'Realizada → en agenda no es una transición de la agenda');
const borde = vm.runInContext(`(function () {
  const p = _poligonosBarrios_(), pa = p.filter(function (b) { return b.barrio === 'Palermo'; })[0];
  for (let i = 0; i < pa.anillos[0].length; i += 2) {
    const x = pa.anillos[0][i] + 0.00012, y = pa.anillos[0][i + 1];
    for (const dx of [0.00012, -0.00012]) for (const dy of [0.00012, -0.00012]) {
      const b = _barrioEnPunto_(pa.anillos[0][i] + dx, pa.anillos[0][i + 1] + dy, p);
      const dist = b && b.barrio === 'Palermo' ? _distanciaAOtroBarrioM_(pa.anillos[0][i] + dx, pa.anillos[0][i + 1] + dy, p, 'Palermo') : null;
      if (dist != null && dist < 50) return _reglaBarrioConMargen_({ estado: 'ok', barrio: 'Palermo', comuna: 14, lat: pa.anillos[0][i + 1] + dy, lng: pa.anillos[0][i] + dx },
                                                                   { comuna: 14, barrio: '' }, p, 100);
    }
  }
  return null;
})()`, E.ctx);
ok(borde && !borde.cumple && /\(c\)/.test(borde.motivo), 'a menos de 100 m de otro barrio: no cumple (c) — ' + (borde && borde.motivo));

console.log('[9] AGENDA_SOLO_SEMANA y las columnas');
E = montar(true, [], { AGENDA_SOLO_SEMANA: "'2026-10-12'" });
r = correr(E, false, [V1]);
ok(r.crear === 0 && r.vincular === 0, 'con AGENDA_SOLO_SEMANA = 12/10, nada de la semana del 05/10');
E = montar(false);
r = correr(E, false, [V1]);
ok(r && /faltan las columnas/.test(r.error || ''), 'sin las columnas de la agenda, la escritura real no corre: ' + (r && r.error));
E.ctx.__x = 1;
const col = E.run('agregarColumnasAgenda(true)');
ok(col.agregadas === 16 && E.D.v[0].slice(-16).join('|') === COLUMNAS_AGENDA.join('|'), 'paso 36: las 16 columnas al final, en orden (desde ' + col.desde + ')');
ok(E.run('agregarColumnasAgenda(true)').agregadas === 0, 'y es idempotente');

console.log('[10] la copia en el archivo "Agenda"');
E = montar();
correr(E, true, [V1]);
const idCopia = E.run('AGENDA_COPIA_SS');
ok(!E.planilla(idCopia).hojas['Agenda'], 'en seco no se escribe la copia');
correr(E, false, [V1]);
correr(E, false, [V1, V2, V3]);
const cp = E.planilla(idCopia).hojas['Agenda'];
ok(cp && cp.v[0].length === 23 && cp.v[0][0] === 'Semana' && cp.v[0][22] === 'Última actualización', 'la solapa con las 23 columnas, en orden');
const enc = cp.v[0], K = function (n) { return enc.indexOf(n); };
const filaCopia = function (fig) { return cp.v.filter(function (x, i) { return i > 0 && x[K('Figura')] === fig; })[0]; };
const cmu = filaCopia('Clara Muzzio');
ok(cmu && cmu[K('Estado en la agenda')] === 'reprogramada' && cmu[K('FECHA')].getDate() === 10 && cmu[K('Fecha original')].getDate() === 8,
   'Muzzio: "reprogramada", FECHA 10/10, Fecha original 08/10');
const clo = filaCopia('Hernán Lombardi');
ok(clo && clo[K('Estado en la agenda')] === 'desaparecida (fila borrada)' && clo[K('Fila del destino')] === '' && clo[K('No participa')] === 'Gabino Tapia' &&
   clo[K('Conjunta con')] === 'Gabino Tapia', 'Lombardi (creada y sin tocar): "desaparecida (fila borrada)", sin fila; No participa y Conjunta con');
const cse = cp.v.filter(function (x, i) { return i > 0 && x[K('Figura')] === '' && x[K('Lugar del mail')] === 'Comuna 5'; })[0];
ok(cse && cse[K('Figura')] === '' && cse[K('Barrio calculado')] === 'Almagro' && cse[K('Comuna')] === 'Comuna 5' && cse[K('Fila del destino')] !== '',
   'Seguridad: sin figura, Barrio calculado Almagro, Comuna 5, con su fila del destino');
const cma = filaCopia('Jorge Macri');
ok(cma && cma[K('Barrio calculado')] === '' && cma[K('Sin barrio porque')] === 'otra comuna que la del mail' && cma[K('Comuna')] === 'Comuna 14',
   'Macri: sin barrio porque "otra comuna que la del mail"; la Comuna, la del mail');
const fechas = cp.v.slice(1).map(function (x) { return x[K('FECHA')].getTime(); });
ok(fechas.every(function (t, i) { return i === 0 || t >= fechas[i - 1]; }), 'ordenada por fecha');
ok(cp.proteccion && cp.advertencia === true, 'protegida con advertencia');

console.log('[11] regla 7: BORRAR la fila creada por la agenda y sin tocar; suspender la tocada; deshacer la restaura');
const VB = mail(6, 8, [EV.sabor, EV.lombardi, EV.alonso, EV.muzzio('Jueves 08/10', '18:30')]);   // sin Macri ni Seguridad
E = montar();
correr(E, false, [V1]);
const nFilas = E.D.v.length;
const iSeg = E.D.v.findIndex(function (x, i) { return i > 0 && x[E.C('Figura')] === '' && x[E.C('agenda_uid')] !== ''; });
E.D.v[iSeg][E.C('Observaciones')] = 'nota del equipo';            // la de Seguridad: alguien la tocó
let seco = correr(E, true, [V1, VB]);
ok(seco.borrar === 1 && seco.suspender === 1, 'en seco: BORRAR 1 (Macri) y SUSPENDER 1 (Seguridad, tocada), aparte');
ok(E.logs.some(function (l) { return /^    BORRAR \|.*Jorge Macri/.test(l); }) && E.logs.some(function (l) { return /^    SUSPENDER \|.*no se borra: tiene "Observaciones"/.test(l); }),
   'el log los lista por separado, con el motivo de la que no se borra');
ok(E.D.v.length === nFilas, 'y en seco no borra nada');
r = correr(E, false, [V1, VB]);
ok(E.D.v.length === nFilas - 1 && fila(E, 'Jorge Macri', 9) === -1, 'real: la fila de Macri (creada y sin tocar) se BORRÓ');
const iSeg2 = E.D.v.findIndex(function (x, i) { return i > 0 && x[E.C('Observaciones')] === 'nota del equipo'; });
ok(celda(E, iSeg2, 'STATUS REUNIÓN') === 'Suspendida', 'la de Seguridad (tocada) quedó "Suspendida"');
const camB = E.ssI.hojas['REGISTRO_AGENDA_CAMBIOS'].v.filter(function (x) { return x[1] === 'borrar'; });
ok(camB.length === 1 && /Jorge Macri/.test(camB[0][5]) && /^c-/.test(camB[0][8]), 'la fila borrada quedó ENTERA en REGISTRO_AGENDA_CAMBIOS (con su agenda_uid)');
const cpB = E.planilla(idCopia).hojas['Agenda'];
const macriCopia = cpB.v.filter(function (x) { return x[K('Figura')] === 'Jorge Macri'; })[0];
ok(macriCopia && macriCopia[K('Estado en la agenda')] === 'desaparecida (fila borrada)' && macriCopia[K('Fila del destino')] === '',
   'en el archivo "Agenda": "desaparecida (fila borrada)", sin fila del destino');
d = E.run('deshacerAgenda(true)');
ok(d && d.restaurarian === 1 && E.D.v.length === nFilas - 1, 'deshacer en seco: restauraría 1, no toca nada');
d = E.run('deshacerAgenda(false)');
const iMacR = fila(E, 'Jorge Macri', 9);
ok(d && d.restauradas === 1 && iMacR > 0 && celda(E, iMacR, 'EVENTO') === 'Uno a uno' && celda(E, iMacR, 'STATUS REUNIÓN') === 'en agenda' &&
   /^c-/.test(celda(E, iMacR, 'agenda_uid')), 'deshacer: la fila de Macri vuelve (al final), con lo que tenía');
ok(celda(E, iSeg2, 'STATUS REUNIÓN') === 'en agenda', 'y la de Seguridad vuelve a "en agenda"');
// Si vuelve a aparecer, se crea de nuevo
E = montar();
correr(E, false, [V1]);
correr(E, false, [V1, VB]);
ok(fila(E, 'Jorge Macri', 9) === -1, '(otra vez) borrada');
const VC = mail(6, 11, [EV.sabor, EV.lombardi, EV.alonso, EV.muzzio('Jueves 08/10', '18:30'), EV.seguridad, EV.macri('Serrano 1500')]);
r = correr(E, false, [V1, VB, VC]);
ok(r.crear === 2 && fila(E, 'Jorge Macri', 9) > 0, 'vuelven a aparecer en una versión posterior (Macri y la de Seguridad, las dos borradas): se CREAN de nuevo (' + r.crear + ')');

console.log('[12] EVENTO como lo escribe el equipo, el grupo de "Agenda de Encuentros con Vecinos", y Gmail por etiqueta O asunto');
E = montar();
E.ctx.__m = [mail(2, 9, [['*Martes 06/10*', 'Evento: Encuentro Temático "Salud" Clara Muzzio, Comuna 2', 'Hora: 18:00h', 'Lugar: A CONFIRMAR',
                          'Evento: Primera Persona con Juan Pérez, Jorge Macri, Comuna 14', 'Hora: 19:00h', 'Lugar: A CONFIRMAR',
                          'Evento: Seguridad en tu Barrio, Comuna 5', 'Hora: 18:00h', 'Lugar: A CONFIRMAR']],
                     'Agenda de Encuentros con Vecinos con JM - Semana del 05/10 al 10/10')];
const ev12 = E.run('(function () { leerDestino_(); return agendaDesdeListaDeMails_(__m, {}).unicas.map(function (x) { return [x.grupo, x.tipo, eventoAgenda_(x)]; }); })()');
ok(ev12.every(function (x) { return x[0] === 'JM'; }), '"Agenda de Encuentros con Vecinos con JM - Semana…" → grupo JM');
ok(ev12.some(function (x) { return x[2] === 'Encuentro Temático "Salud"'; }), 'Temático → \'Encuentro Temático "Salud"\'');
ok(ev12.some(function (x) { return x[2] === 'Encuentro "Primera Persona" con Juan Pérez'; }), 'Primera Persona → \'Encuentro "Primera Persona" con Juan Pérez\'');
ok(ev12.some(function (x) { return x[1] === 'Seguridad en tu Barrio' && x[2] === 'Encuentro con Vecinos'; }), 'Seguridad en tu Barrio → "Encuentro con Vecinos"');
// Gmail simulado: un hilo con la etiqueta, otro sólo por asunto, uno en los dos (no se duplica)
const msj = function (id, d, asunto) { return { getId: function () { return id; }, getDate: function () { return new D(2026, 9, d, 9); },
                                                 getSubject: function () { return asunto; }, getPlainBody: function () { return V1.cuerpo; } }; };
const hilo = function (id, ms) { return { getId: function () { return id; }, getLastMessageDate: function () { return ms[ms.length - 1].getDate(); },
                                          getMessages: function () { return ms; } }; };
const hA = hilo('A', [msj('a1', 2, ASUNTO)]), hB = hilo('B', [msj('b1', 3, 'Fwd: ' + ASUNTO)]), hC = hilo('C', [msj('c1', 4, 'Agenda de Encuentros con Vecinos con JM - Semana del 05/10 al 10/10')]);
E.ctx.GmailApp = {
  getUserLabelByName: function () { return { getThreads: function (i) { return i === 0 ? [hA, hB] : []; } }; },
  search: function (q, i) { if (i) return []; return /Agenda Encuentros de vecinos/.test(q) ? [hA, hB] : [hC]; }
};
const gm = E.run('leerMailsAgendaGmail_(new Date(2026, 8, 1))');
ok(gm.lista.length === 3 && gm.lista.filter(function (m) { return m.etiqueta; }).length === 2,
   'Gmail: 3 mails sin duplicar (la etiqueta trae 2, el asunto 3), y se sabe cuáles tenían la etiqueta');
correr(E, true, [V1]);
ok(E.logs.some(function (l) { return /semanas del alcance SIN ningún mail: .*\d\d\/09\/2026/.test(l); }),
   'el log avisa las semanas del alcance sin ningún mail');

console.log('[13] la intermedia: reintentos (2, 5, 10 s) y el REGISTRO obligatorio');
E = montar();
let fallos = 0;
E.fallarAbrir = function (id) { return id === E.run('RDV_SS_INTERMEDIA') && fallos++ < 2; };
E.esperas = [];
const ssI = E.run('intermediaAgenda_()');
ok(ssI && fallos === 3 && E.esperas.join(',') === '2000,5000', 'abrir la intermedia falló 2 veces: esperó 2 y 5 s y la abrió');
E.fallarAbrir = null;
antes = foto(E.D);
E.ctx._registrarCorridaAntesDeEscribir_ = function () { throw new Error('Service Spreadsheets timed out'); };
r = correr(E, false, [V1]);
ok(r && /REGISTRO_AGENDA/.test(r.error || '') && foto(E.D) === antes, 'sin REGISTRO_AGENDA la corrida real NO escribe el destino: ' + (r && r.error));

console.log('[14] la misma reunión en el mail de dos grupos: UNA fila (el caso del 06/10, CREAR 821 y 822)');
E = montar();
const ASUNTO_JM = 'Agenda Encuentros de vecinos con JM - Semana del 05/10 al 10/10';
const macriEN = ['*Jueves 08/10*', 'Evento: Encuentro con Vecinos Jorge Macri, Eje Norte', 'Hora: 17:15h', 'Lugar: A CONFIRMAR'];
const macri10 = ['Evento: Encuentro con Vecinos Jorge Macri, Comuna 14', 'Hora: 10:00h', 'Lugar: Serrano 1500'];
// El caso del 06/10: CM trae dos de Macri ese día (10:00 y 17:15) y JM sólo la de las 17:15. Con la clave de cada mail,
// la de las 17:15 de CM ('…|17:15') no se juntaba con la de JM, la de las 10:00 de CM se juntaba con ella (mal), y la
// de las 17:15 se creaba DOS veces (y la de las 10:00 se perdía).
const mCM = mail(3, 9, [['*Jueves 08/10*'], macri10, macriEN.slice(1)]);
const mJM = mail(4, 9, [macriEN], ASUNTO_JM);                         // JM (más nuevo): sólo la de las 17:15
r = correr(E, true, [mCM, mJM]);
ok(r.crear === 2, 'en seco: CREAR 2 (la de las 10:00 y la de las 17:15 una sola vez) — ' + r.crear);
r = correr(E, false, [mCM, mJM]);
const macris = E.D.v.filter(function (x, i) { return i > 0 && x[E.C('Figura')] === 'Jorge Macri' && x[E.C('FECHA')] instanceof Date && x[E.C('FECHA')].getDate() === 8 && x[E.C('FECHA')].getMonth() === 9; });
ok(macris.length === 2 && macris.map(function (x) { return x[E.C('HORA')]; }).sort().join('|') === '10:00|17:15', 'dos filas: 10:00 y 17:15');
ok(macris.filter(function (x) { return x[E.C('HORA')] === '17:15'; })[0][E.C('agenda_mail')].indexOf('con JM') >= 0, 'la de las 17:15 quedó con la versión más nueva (el mail de JM)');
r = correr(E, false, [mCM, mJM]);
ok(r.crear === 0, 'otra corrida: no crea nada');

console.log('[15] limpiar la intermedia: sólo la medición de la etapa 1; nunca B, la cache ni los registros');
E = montar();
const ssInt = E.planilla(E.run('RDV_SS_INTERMEDIA'));
['DIAG_MAILS', 'AGENDA_MAIL', 'AGENDA_CRUCE', 'B', 'AGENDA_GEOCODE', 'REGISTRO_AGENDA'].forEach(function (n) { ssInt.hojas[n] = new E.Hoja(n, [['x'], [1]]); });
let lim = E.run('limpiarIntermedia(SOLAPAS_MEDICION_ETAPA1, false, "test")');
ok(lim.borradas === 0 && ssInt.hojas['DIAG_MAILS'], 'en seco: no borra nada');
lim = E.run('limpiarIntermedia(SOLAPAS_MEDICION_ETAPA1, true, "test")');
ok(lim.borradas === 3 && !ssInt.hojas['DIAG_MAILS'] && !ssInt.hojas['AGENDA_MAIL'] && !ssInt.hojas['AGENDA_CRUCE'] &&
   ssInt.hojas['B'] && ssInt.hojas['AGENDA_GEOCODE'] && ssInt.hojas['REGISTRO_AGENDA'], 'real: borra las 3 de medición que había; B, la cache y el registro quedan');
error = null;
try { E.run('limpiarIntermedia(["DIAG_MAILS", "B"], true, "test")'); } catch (e) { error = e; }
ok(error && /no se borra nunca/.test(error.message) && ssInt.hojas['B'], 'una lista con B: error, no borra nada');

console.log('[16] los registros en su propio archivo (RDV_SS_REGISTROS)');
E = montar(true, [], { RDV_SS_REGISTROS: "'archivo-de-registros'" });
correr(E, false, [V1]);
const regs = E.planilla('archivo-de-registros');
ok(regs.hojas['REGISTRO_AGENDA'] && regs.hojas['REGISTRO_AGENDA'].v.length === 2 && regs.hojas['REGISTRO_AGENDA_CAMBIOS'] &&
   !E.planilla(E.run('RDV_SS_INTERMEDIA')).hojas['REGISTRO_AGENDA'], 'REGISTRO_AGENDA y los cambios van al archivo de registros, no a la intermedia');
d = E.run('deshacerAgenda(true)');
ok(d && d.sacarian === 5, 'y deshacer los lee de ahí (sacaría las 5 creadas)');

console.log('[17] la forma del equipo, las columnas del mail, "Origen fila" y "Tocado por el equipo"');
E = montar(true, [function (r, C) {   // una fila del equipo en el alcance que el mail no trae
  r[C('Figura')] = 'Gabino Tapia'; r[C('Barrio')] = 'Núñez'; r[C('FECHA')] = new D(2026, 9, 9, 12); r[C('HORA')] = '17:00';
  r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = 'en agenda';
}, function (r, C) {                  // y una vieja, de agosto: fuera del alcance (hoy − 30)
  r[C('Figura')] = 'Laura Alonso'; r[C('Barrio')] = 'Flores'; r[C('FECHA')] = new D(2026, 7, 20, 12); r[C('STATUS REUNIÓN')] = 'Realizada';
}, function (r, C) {                  // la del equipo, otra vez al final: es la "fila modelo" del formato
  r[C('Figura')] = 'Laura Alonso'; r[C('Barrio')] = 'Flores'; r[C('FECHA')] = new D(2026, 8, 30, 12); r[C('STATUS REUNIÓN')] = 'Realizada';
}]);
E.D.nf = {}; E.D.nf[(E.D.getLastRow()) + ',' + (E.C('FECHA') + 1)] = 'dd/MM/yyyy'; E.D.nf[(E.D.getLastRow()) + ',' + (E.C('HORA') + 1)] = 'HH:mm';
const ultimaEquipo = E.D.getLastRow();
r = correr(E, false, [V1]);
let iM = fila(E, 'Clara Muzzio', 8), iL = fila(E, 'Hernán Lombardi', 7), iA = fila(E, 'Laura Alonso', 7), iT = fila(E, 'Gabino Tapia', 9);
ok(celda(E, iM, 'Origen fila') === 'sistema (agenda)' && celda(E, iA, 'Origen fila') === 'equipo + agenda' && celda(E, iT, 'Origen fila') === 'equipo',
   '"Origen fila": sistema (agenda) la creada, equipo + agenda la vinculada, equipo la del equipo que el mail no trae');
const iAgo = E.D.v.findIndex(function (x) { return x[E.C('FECHA')] instanceof Date && x[E.C('FECHA')].getMonth() === 7; });
ok(celda(E, iAgo, 'Origen fila') === '' && celda(E, 1, 'Origen fila') === 'equipo',
   'la de agosto (fuera del alcance, hoy − 30) no se toca; las de septiembre del equipo: "equipo"');
ok(celda(E, iL, 'Conjunta con') === 'Gabino Tapia', '"Conjunta con": todas las otras figuras nombradas, también la que NO PARTICIPA (' + celda(E, iL, 'Conjunta con') + ')');
ok(/Clara Muzzio/.test(celda(E, iM, 'Evento (mail)')) && celda(E, iM, 'Dirección (mail)') === 'Av. Santa Fe 1234, Club Social' &&
   celda(E, iM, 'Lugar (mail)') !== '', 'columnas del mail: Evento (mail), Lugar (mail), Dirección (mail) — ' + celda(E, iM, 'Lugar (mail)'));
ok(celda(E, iL, 'No participa') === 'Gabino Tapia' && /Lombardi/.test(celda(E, iL, 'Evento (mail)')), 'conjunta: "No participa" y el evento entero');
ok(celda(E, iA, 'Dirección (mail)') === 'Rivadavia 7000, Plaza' && fondo(E, iA, 'Dirección (mail)') === SIS && fondo(E, iA, 'HORA') === null,
   'la vinculada también recibe las columnas del mail (en #CFE2F3); las del equipo, sin color');
ok(E.D.nf[(iM + 1) + ',' + (E.C('FECHA') + 1)] === 'dd/MM/yyyy' && E.D.nf[(iM + 1) + ',' + (E.C('HORA') + 1)] === 'HH:mm' && iM + 1 > ultimaEquipo,
   'las filas nuevas toman el formato numérico de la última fila (FECHA dd/MM/yyyy, HORA HH:mm)');
ok(celda(E, iM, 'Tocado por el equipo') === '', '"Tocado por el equipo" vacío recién creada');
E.D.v[iL][E.C('HORA')] = '20:00'; E.D.v[iM][E.C('Dirección')] = 'Av. Santa Fe 1250';
r = correr(E, false, [V1]);
ok(celda(E, iL, 'Tocado por el equipo') === 'HORA' && celda(E, iM, 'Tocado por el equipo') === 'Dirección' && r.tocado === 2,
   '"Tocado por el equipo": HORA en Lombardi, Dirección en Muzzio (' + celda(E, iL, 'Tocado por el equipo') + ' / ' + celda(E, iM, 'Tocado por el equipo') + ')');
E.D.v[iL][E.C('HORA')] = '19:00';
r = correr(E, false, [V1]);
ok(celda(E, iL, 'Tocado por el equipo') === '', 'si el equipo la vuelve a lo del mail, "Tocado" se vacía (se recalcula cada corrida)');
const Vl = mail(5, 9, [EV.sabor, EV.lombardi, EV.alonso, EV.muzzio('Jueves 08/10', '18:30'), EV.seguridad, EV.macri('Serrano 1500 piso 2')]);
r = correr(E, false, [V1, Vl]);
const iMa2 = fila(E, 'Jorge Macri', 9);
ok(celda(E, iMa2, 'Dirección (mail)') === 'Serrano 1500 piso 2', 'cada versión del mail actualiza las columnas del mail');

console.log('[18] casi duplicado ANTES de crear: no se crea, se pregunta en AGENDA_DUPLICADOS; se aplica lo elegido');
E = montar(true, [function (r, C) {     // el equipo cargó a Muzzio el 09/10 (el mail dice 08/10)
  r[C('Figura')] = 'Clara Muzzio'; r[C('Barrio')] = 'Almagro'; r[C('FECHA')] = new D(2026, 9, 9, 12); r[C('HORA')] = '18:30';   // otro barrio: no es "ya cargada" (07/10)
  r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = 'en agenda';
}, function (r, C) {                     // y otra figura en la misma fecha y comuna que la de Macri (09/10, Comuna 14)
  r[C('Figura')] = 'Ezequiel Sabor'; r[C('Barrio')] = 'Palermo'; r[C('FECHA')] = new D(2026, 9, 9, 12); r[C('HORA')] = '11:00';
  r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = 'en agenda';
}]);
let nFil = E.D.v.length;
r = correr(E, true, [V1]);
ok(r.crear === 3 && r.duplicadosAntes === 2, 'en seco: crearía 3 (no 5): Muzzio y Macri van a AGENDA_DUPLICADOS (' + r.crear + ' / ' + r.duplicadosAntes + ')');
ok(!E.ssD.hojas['AGENDA_DUPLICADOS'], 'en seco no se escribe la solapa');
r = correr(E, false, [V1]);
const dup = E.ssD.hojas['AGENDA_DUPLICADOS'];
ok(E.D.v.length === nFil + 3 && dup && dup.v.length === 3 && dup.v[0][0] === 'ELEGIR' && dup.v[0][1] === 'COMENTARIO',
   'real: 3 filas nuevas; AGENDA_DUPLICADOS en el archivo del destino, ELEGIR y COMENTARIO adelante, 2 líneas');
ok(dup.validaciones === 2 && dup.proteccion === E.run('DESC_PROTECCION_DUPLICADOS') && dup.libres === 2 && dup.advertencia === false,
   'desplegable en las 2, protección real con ELEGIR/COMENTARIO libres');
ok(/fecha \(1 día\)/.test(dup.v.map(function (x) { return x.join('|'); }).join('\n')) && /figura \(Ezequiel Sabor\)/.test(dup.v.map(function (x) { return x.join('|'); }).join('\n')),
   'la diferencia en palabras: "fecha (1 día)" y "figura (Ezequiel Sabor)"');
r = correr(E, false, [V1]);
ok(r.crear === 0 && r.duplicadosAntes === 2 && E.D.v.length === nFil + 3, 'sin elegir: sigue preguntando, no crea');
const lMuz = dup.v.findIndex(function (x) { return /Clara Muzzio/.test(x.join('|')); });
const lSeg = dup.v.findIndex(function (x, i) { return i > 0 && i !== lMuz; });
dup.v[lMuz][0] = 'Es la misma: vincular'; dup.v[lMuz][1] = 'la cargamos con la fecha mal';
dup.v[lSeg][0] = 'Son distintas: crear';
const iEq = fila(E, 'Clara Muzzio', 9);
r = correr(E, false, [V1]);
ok(r.eleccionesAplicadas === 2 && r.crear === 1 && r.vincular === 1, 'elegido: vincula Muzzio y crea Macri (' + r.vincular + ' / ' + r.crear + ')');
ok(/^v-/.test(celda(E, iEq, 'agenda_uid')) && celda(E, iEq, 'Origen fila') === 'equipo + agenda' && celda(E, iEq, 'Barrio') === 'Almagro',
   'la fila del equipo quedó vinculada, con su barrio');
const elec = E.ssI.hojas['ELECCIONES_AGENDA'];
ok(elec && elec.v.length === 3, 'las elecciones se guardaron en ELECCIONES_AGENDA (sobreviven a que se regenere la solapa)');
ok(E.ssD.hojas['AGENDA_DUPLICADOS'].v.length === 1, 'resueltas: AGENDA_DUPLICADOS queda con el encabezado solo');
r = correr(E, false, [V1]);
ok(r.crear === 0 && r.vincular === 0 && r.duplicadosAntes === 0, 'otra corrida: nada nuevo (' + JSON.stringify([r.crear, r.vincular, r.duplicadosAntes, r.eleccionesAplicadas]) + ')');

console.log('[19] duplicado DESPUÉS de crear: se lista, nunca se borra ni se fusiona');
E = montar();
correr(E, false, [V1]);
nFil = E.D.v.length;
const copiaFila = E.D.v[0].map(function () { return ''; });
copiaFila[E.C('Figura')] = 'Clara Muzzio'; copiaFila[E.C('Barrio')] = 'Recoleta'; copiaFila[E.C('FECHA')] = new D(2026, 9, 8, 12);
copiaFila[E.C('HORA')] = '18:30'; copiaFila[E.C('STATUS REUNIÓN')] = 'en agenda';
E.D.v.push(copiaFila); E.D.bg.push(copiaFila.map(function () { return null; }));
r = correr(E, false, [V1]);
ok(r.duplicadosDespues === 1 && r.crear === 0 && r.ambiguas === 0, 'la fila que cargó el equipo encima de la de la agenda: 1 duplicado posterior, ninguna ambigua');
ok(E.D.v.length === nFil + 1 && E.ssD.hojas['AGENDA_DUPLICADOS'].v.some(function (x) { return x[3] === 'después de crear'; }),
   'no se borró nada; en AGENDA_DUPLICADOS como "después de crear"');

console.log('[20] una fila creada por la agenda y BORRADA por el equipo no se recrea; si sale del mail y vuelve, sí');
E = montar();
correr(E, false, [V1]);
let iMz = fila(E, 'Clara Muzzio', 8);
nFil = E.D.v.length;
E.D.deleteRow(iMz + 1);                         // el equipo la borra
r = correr(E, false, [V1]);
ok(r.crear === 0 && r.borradasEquipo === 1 && fila(E, 'Clara Muzzio', 8) === -1, 'no se recrea (BORRADA POR EL EQUIPO)');
const camE = E.ssI.hojas['REGISTRO_AGENDA_CAMBIOS'].v;
ok(camE.filter(function (x) { return x[1] === 'borrada_por_equipo'; }).length === 1, 'REGISTRO_AGENDA_CAMBIOS: "borrada_por_equipo", una vez');
r = correr(E, false, [V1]);
ok(r.crear === 0 && E.ssI.hojas['REGISTRO_AGENDA_CAMBIOS'].v.filter(function (x) { return x[1] === 'borrada_por_equipo'; }).length === 1,
   'otra corrida: sigue sin recrearla, y no la vuelve a anotar');
ok(E.planilla(E.run('AGENDA_COPIA_SS')).hojas[E.run('AGENDA_COPIA_SOLAPA')].v.some(function (x) { return x.join('|').indexOf('borrada por el equipo') >= 0; }),
   'en el archivo "Agenda": "borrada por el equipo"');
const sinMuzzio = mail(5, 9, [EV.sabor, EV.lombardi, EV.alonso, EV.seguridad, EV.macri('Serrano 1500')]);
r = correr(E, false, [V1, sinMuzzio]);
ok(E.ssI.hojas['REGISTRO_AGENDA_CAMBIOS'].v.some(function (x) { return x[1] === 'olvidar_borrada'; }), 'salió del mail: se olvida');
const vuelve = mail(6, 9, [EV.sabor, EV.lombardi, EV.alonso, EV.muzzio('Jueves 08/10', '18:30'), EV.seguridad, EV.macri('Serrano 1500')]);
r = correr(E, false, [V1, sinMuzzio, vuelve]);
ok(r.crear === 1 && fila(E, 'Clara Muzzio', 8) > 0, 'volvió al mail: se crea de nuevo');

console.log('[21] sin historial legible, la corrida real no crea (podría recrear una borrada)');
E = montar();
r = correr(E, false, [V1], { historial: { creadas: new Map(), olvidadas: new Set(), notadas: new Set(), error: 'Service Spreadsheets timed out' } });
ok(!r.error && r.crear === 0 && r.noCreadasSinHistorial === 5 && r.vincular === 1, 'no crea ninguna de las 5 (las vincula igual): ' + r.noCreadasSinHistorial);
r = correr(E, true, [V1], { historial: { creadas: new Map(), olvidadas: new Set(), notadas: new Set(), error: 'x' } });
ok(r.crear === 5, 'en seco sí las cuenta como CREAR (para ver el plan)');

console.log('[22] semana() del 07/10: la versión como texto, el formato de la traza, FECHA por día, una línea por reunión en "Agenda"');
E = montar();
r = correr(E, false, [V1]);
let iM2 = fila(E, 'Clara Muzzio', 8), iL2 = fila(E, 'Hernán Lombardi', 7);
const cV = E.C('agenda_version') + 1, cH = E.C('agenda_hora_escrita') + 1, cF = E.C('agenda_fecha_escrita') + 1;
ok(celda(E, iM2, 'agenda_version') === '1 de 1' && E.D.nf[(iM2 + 1) + ',' + cV] === '@',
   'agenda_version "1 de 1" como TEXTO (sin "@", Sheets en español la lee como el 3 de marzo): ' + celda(E, iM2, 'agenda_version'));
ok(E.D.nf[(iM2 + 1) + ',' + cH] === 'h:mm' && E.D.nf[(iM2 + 1) + ',' + cF] === 'd/MM/yyyy', 'agenda_hora_escrita "h:mm", agenda_fecha_escrita "d/MM/yyyy"');
ok(celda(E, iL2, 'Conjunta con') === 'Gabino Tapia' && celda(E, iL2, 'No participa') === 'Gabino Tapia',
   'Lombardi: "Conjunta con" Gabino Tapia (todas las otras nombradas) y "No participa" aparte');
const copiaAg = E.planilla(E.run('AGENDA_COPIA_SS')).hojas[E.run('AGENDA_COPIA_SOLAPA')];
const encC = copiaAg.v[0], lomC = copiaAg.v.filter(function (x) { return x[encC.indexOf('Figura')] === 'Hernán Lombardi'; })[0];
ok(lomC && lomC[encC.indexOf('Conjunta con')] === celda(E, iL2, 'Conjunta con'), 'el mismo "Conjunta con" en el destino y en "Agenda"');
ok(copiaAg.v.slice(1).every(function (x) { return typeof x[encC.indexOf('Versión')] === 'string'; }), '"Versión" en "Agenda" como texto');
// Las 9 filas del 07/10: la versión quedó como número (46084) y la hora y la fecha de la traza como número de serie
const serial = function (d) { return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000; };
[iM2, iL2].forEach(function (i) {
  E.D.v[i][E.C('agenda_version')] = 46084;
  E.D.v[i][E.C('agenda_fecha_escrita')] = serial(E.D.v[i][E.C('FECHA')]) + 0.5;          // 46301,5
  E.D.v[i][E.C('agenda_hora_escrita')] = (+E.D.v[i][E.C('HORA')].slice(0, 2) * 60 + +E.D.v[i][E.C('HORA')].slice(3)) / 1440;
  delete E.D.nf[(i + 1) + ',' + cV]; delete E.D.nf[(i + 1) + ',' + cH]; delete E.D.nf[(i + 1) + ',' + cF];
});
ok(E.run('valorAgendaComparable_(46301, "FECHA") === valorAgendaComparable_(46301.5, "agenda_fecha_escrita")') &&
   E.run('valorAgendaComparable_(0.6979166, "agenda_hora_escrita")') === '16:45', 'FECHA por día (46301 = 46301,5) y la hora de un serial (0,6979… = 16:45)');
r = correr(E, false, [V1]);
ok(celda(E, iM2, 'agenda_version') === '1 de 1' && celda(E, iL2, 'agenda_version') === '1 de 1', 'la corrida siguiente CORRIGE la versión (texto)');
ok(E.D.nf[(iM2 + 1) + ',' + cH] === 'h:mm' && E.D.nf[(iL2 + 1) + ',' + cF] === 'd/MM/yyyy', 'y pone el formato a la hora y la fecha de la traza');
ok(celda(E, iM2, 'Tocado por el equipo') === '' && celda(E, iL2, 'Tocado por el equipo') === '' && r.editadas === 0 && r.crear === 0,
   'sin "Tocado" ni "editadas" falsas por el número de serie, y no crea nada');
// "Agenda": una línea por reunión aunque la reunión llegue dos veces
E.ctx.__evs = E.run('agendaDesdeListaDeMails_([' + "{ fecha: new Date(2026, 9, 2, 9, 0), asunto: 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 05/10 al 10/10', " +
  "cuerpo: '*Jueves 08/10*' + String.fromCharCode(10) + 'Evento: Encuentro con Vecinos Clara Muzzio, Recoleta' + String.fromCharCode(10) + 'Hora: 18:30h', truncado: false }" + '], {}).unicas');
const cop = E.run('(function () { const ev = __evs[0]; const P = { copia: [{ ev: ev, x: { fila: 9 }, estado: "vigente" }, { ev: ev, x: null, estado: "desaparecida" }] }; ' +
                  'const m = armarCopiaAgenda_(P, new Date()); return { lineas: m.length - 1, repetidas: P.repetidasCopia }; })()');
ok(cop.lineas === 1 && cop.repetidas === 1, '"Agenda": la misma reunión dos veces → UNA línea (la vigente)');

console.log('[23] el color heredado: las columnas de la agenda sin fondo en las celdas vacías; paso 36 no hereda; paso 16 avisa');
E = montar(false);
const cFC = E.C('form_clave');
for (let i = 1; i < E.D.v.length; i++) E.D.bg[i][cFC] = SIS;              // form_clave con el color del sistema
let col36 = E.run('agregarColumnasAgenda(true)');
E.D.v.forEach(function (x, i) { if (i > 0) { E.D.bg[i][E.D.v[0].indexOf('agenda_uid')] = E.D.bg[i][E.D.v[0].indexOf('agenda_uid')]; } });
ok(col36.agregadas === 16 && E.D.bg.slice(1).every(function (x) { return x.slice(cFC + 1).every(function (b) { return !b; }); }),
   'paso 36: las 16 columnas nuevas sin formato debajo del encabezado (no heredan el de form_clave)');
// lo que pasó en el real: las 16 heredaron el color en todas las filas; sólo algunas tienen valor
E = montar();
correr(E, false, [V1]);
const cUid = E.C('agenda_uid'), cOri = E.C('Origen fila');
for (let i = 1; i < E.D.v.length; i++) for (let k = cUid - 1; k < E.D.v[0].length; k++) E.D.bg[i][k] = E.D.bg[i][k] || SIS;
const conValorAntes = E.D.v.filter(function (x, i) { return i > 0 && x[cUid] !== ''; }).length;
const az = E.run('_azules_diag8(leerDestino_())');
ok(az.sistemaSinValorTotal > 0 && az.sistemaSinValor['agenda_uid'] > 0, 'paso 16 avisa: color del sistema sin valor en columnas del sistema (' + az.sistemaSinValorTotal + ')');
let lim23 = E.run('limpiarFondoAgendaVacias(false)');
ok(lim23.celdas > 0 && E.D.bg[1][cUid] === SIS, 'en seco: cuenta (' + lim23.celdas + ') y no toca nada');
lim23 = E.run('limpiarFondoAgendaVacias(true)');
const iMu3 = fila(E, 'Clara Muzzio', 8);
ok(E.D.bg[1][cUid] === null && E.D.bg[1][E.C('Marcas (mail)')] === null && E.D.bg[1][cOri] === SIS && celda(E, 1, 'Origen fila') === 'equipo' && fondo(E, iMu3, 'agenda_uid') === SIS && celda(E, iMu3, 'agenda_uid') !== '',
   'real: sin fondo las vacías; las que tienen valor (la fila creada) conservan su color');
// una celda de traza vacía con color (las 18 del real): también se limpia, y el paso 43 la lista
const cFS = E.C('form_score');
E.D.bg[2][cFS] = SIS; E.D.v[2][cFS] = '';
const iMuT = fila(E, 'Clara Muzzio', 8);
lim23 = E.run('limpiarFondoAgendaVacias(false)');
ok(lim23.deTraza.length === 1 && lim23.deTraza[0].fila === 3 && lim23.deTraza[0].columna === 'form_score', 'paso 43 lista las de traza: fila 3, form_score');
E.run('limpiarFondoAgendaVacias(true)');
ok(E.D.bg[2][cFS] === null, 'y les saca el fondo');
ok(E.D.v.filter(function (x, i) { return i > 0 && x[cUid] !== ''; }).length === conValorAntes && E.run('_azules_diag8(leerDestino_())').sistemaSinValorTotal === 0,
   'ningún valor cambió, y el paso 16 queda en 0');

console.log('[24] AGENDA_CANCELACION_AUTOMATICA = false: la cancelación se PREGUNTA en AGENDA_DUPLICADOS');
E = montar(true, [], { AGENDA_CANCELACION_AUTOMATICA: 'false' });
correr(E, false, [V1]);
const iLo4 = fila(E, 'Hernán Lombardi', 7), nFil4 = E.D.v.length;
const V3b = mail(6, 8, [EV.sabor, EV.alonso, EV.muzzio('Jueves 08/10', '18:30'), EV.seguridad, EV.macri('Serrano 1500')]);   // sin Lombardi
r = correr(E, true, [V1, V3b]);
ok(r.suspender === 0 && r.borrar === 0 && r.cancelaciones === 1, 'en seco: SUSPENDER 0, BORRAR 0, se pregunta 1 (Lombardi 07/10)');
r = correr(E, false, [V1, V3b]);
const dup4 = E.ssD.hojas['AGENDA_DUPLICADOS'];
const lin4 = dup4.v.findIndex(function (x) { return x[3] === 'cancelación'; });
ok(lin4 > 0 && E.D.v.length === nFil4 && celda(E, iLo4, 'STATUS REUNIÓN') === 'en agenda',
   'real: la fila NO se toca; en AGENDA_DUPLICADOS como "cancelación"');
ok(/la sacó: Agenda Encuentros/.test(dup4.v[lin4][4]) && /fila /.test(dup4.v[lin4][5]) && dup4.opciones && dup4.opciones.indexOf('Sigue') >= 0,
   'con la reunión, el mail que la sacó, la fila, y el desplegable "Se canceló / Sigue / No sé"');
dup4.v[lin4][0] = 'Se canceló: suspender/borrar';
r = correr(E, false, [V1, V3b]);
ok(r.borrar === 1 && fila(E, 'Hernán Lombardi', 7) === -1 && r.eleccionesAplicadas >= 1,
   'elegido "Se canceló": se aplica en la corrida siguiente (la creó la agenda y nadie la tocó → se borra)');
E = montar(true, [], { AGENDA_CANCELACION_AUTOMATICA: 'false' });
correr(E, false, [V1]);
correr(E, false, [V1, V3b]);
const dup5 = E.ssD.hojas['AGENDA_DUPLICADOS'];
dup5.v[dup5.v.findIndex(function (x) { return x[3] === 'cancelación'; })][0] = 'Sigue';
r = correr(E, false, [V1, V3b]);
ok(r.suspender === 0 && r.borrar === 0 && r.cancelaciones === 0 && r.cancelacionSigue === 1 && fila(E, 'Hernán Lombardi', 7) > 0,
   '"Sigue": no se toca y no se vuelve a preguntar');
r = correr(E, false, [V1, V3b]);
ok(r.cancelaciones === 0 && r.cancelacionSigue === 1, 'y en las corridas siguientes tampoco (ELECCIONES_AGENDA)');

console.log('[25] paso 42: cuántas desaparecidas cambian porque un "Re:" ya no hace desaparecer');
E = montar();
const reSinLombardi = mail(5, 9, [EV.sabor, EV.alonso, EV.muzzio('Jueves 08/10', '18:30'), EV.seguridad, EV.macri('Serrano 1500')], 'Re: ' + ASUNTO);
E.ssI.hojas['DIAG_MAILS'] = new E.Hoja('DIAG_MAILS', [['fecha', 'asunto', 'cuerpo', 'truncado']].concat([V1, reSinLombardi].map(function (m) {
  return [m.fecha, m.asunto, m.cuerpo, false];
})));
const med = E.run('medirRespuestasAgenda()');
ok(med.respuestas === 1 && med.antes === 1 && med.ahora === 0 && med.dejan === 1 && med.porCaso.futura === 1,
   'Lombardi 07/10 (futura) la sacaba el "Re:": antes 1, con la regla 0 — ' + JSON.stringify(med));
r = correr(E, true, [V1, reSinLombardi]);
ok(r.suspender === 0 && r.borrar === 0 && r.cancelaciones === 0, 'y la agenda no la suspende, ni borra, ni pregunta');

console.log('[26] Macri 01/10 Belgrano: "ya cargada en otra fila" (la 805, que se adelantó), no se crea ni se pregunta');
const filasMacri = [function (r, C) {          // "804": 29/09 Villa Santa Rita, Suspendida
  r[C('Figura')] = 'Jorge Macri'; r[C('Barrio')] = 'Villa Santa Rita'; r[C('FECHA')] = new D(2026, 8, 29, 12); r[C('HORA')] = '10:15';
  r[C('EVENTO')] = 'Uno a uno'; r[C('STATUS REUNIÓN')] = 'Suspendida';
}, function (r, C) {                           // "805": 29/09 Belgrano 09:55, Realizada (la del 01/10, que se adelantó)
  r[C('Figura')] = 'Jorge Macri'; r[C('Barrio')] = 'Belgrano'; r[C('FECHA')] = new D(2026, 8, 29, 12); r[C('HORA')] = '09:55';
  r[C('EVENTO')] = 'Uno a uno'; r[C('STATUS REUNIÓN')] = 'Realizada'; r[C('Inscriptos')] = 120;
}];
const ASUNTO_JM28 = 'Agenda Encuentros de vecinos con JM - Semana del 28/09 al 04/10';
const cuerpoJM28 = ['*Martes 29/09*', 'Evento: Encuentro "1 a 1" Jorge Macri, Villa Santa Rita', 'Hora: 10:15h', 'Lugar: A CONFIRMAR', '',
                    '*Jueves 01/10*', 'Evento: Encuentro "1 a 1" Jorge Macri, Belgrano', 'Hora: 15:00h', 'Lugar: A CONFIRMAR'].join(String.fromCharCode(10));
const mailsJM = function (d1, d2) {
  return [{ fecha: new D(2026, 8, d1, 9, 0), asunto: ASUNTO_JM28, cuerpo: cuerpoJM28, truncado: false },
          { fecha: new D(2026, 8, d2, 9, 0), asunto: ASUNTO_JM28, cuerpo: cuerpoJM28, truncado: false }];
};
E = montar(true, filasMacri);
const i805 = E.D.v.findIndex(function (x) { return x[E.C('Barrio')] === 'Belgrano' && x[E.C('Figura')] === 'Jorge Macri'; });
const fila805Antes = JSON.stringify(E.D.v[i805]);
r = correr(E, false, mailsJM(23, 25));                       // los mails son del 23/09 y 25/09: ANTERIORES al 29/09
ok(r.crear === 0 && r.duplicadosAntes === 0 && r.yaCargadas === 1, 'no crea ni pregunta: ya cargada (crear ' + r.crear + ', pregunta ' + r.duplicadosAntes + ', ya cargadas ' + r.yaCargadas + ')');
ok(E.ssD.hojas['AGENDA_DUPLICADOS'].v.length === 1, 'AGENDA_DUPLICADOS queda vacía');
(function () {
  const a = JSON.parse(fila805Antes), b = E.D.v[i805], cOr = E.C('Origen fila');
  const otras = b.filter(function (x, k) { return k !== cOr && JSON.stringify(x) !== JSON.stringify(a[k] === undefined ? '' : a[k]); }).length;
  ok(otras === 0 && b[cOr] === 'equipo' && !b[E.C('agenda_uid')],
     'la 805 no se toca: ni se vincula ni recibe las columnas del mail (sólo "Origen fila" = equipo, como toda fila del equipo)');
})();
const copiaJM = E.planilla(E.run('AGENDA_COPIA_SS')).hojas['Agenda cerrada'];   // la semana del 28/09 ya terminó (hoy 06/10)
const encJM = copiaJM.v[0], lin01 = copiaJM.v.filter(function (x) { return x[encJM.indexOf('FECHA')] instanceof Date && x[encJM.indexOf('FECHA')].getDate() === 1; })[0];
ok(lin01 && lin01[encJM.indexOf('Estado en la agenda')] === 'ya cargada en la fila ' + (i805 + 1) + ' (fecha distinta)' &&
   String(lin01[encJM.indexOf('Fila del destino')]) === String(i805 + 1), '"Agenda": "ya cargada en la fila ' + (i805 + 1) + ' (fecha distinta)", Fila del destino = ' + (i805 + 1));
r = correr(E, false, mailsJM(23, 25));
ok(E.ssI.hojas['REGISTRO_AGENDA_CAMBIOS'].v.filter(function (x) { return x[1] === 'ya_cargada'; }).length === 1 &&
   E.ssI.hojas['REGISTRO_AGENDA'].v.slice(1).every(function (x) { return x[E.run('ENC_REGISTRO_AGENDA_').indexOf('ya_cargadas')] === 1; }),
   'REGISTRO_AGENDA cuenta "ya_cargadas" en cada corrida; REGISTRO_AGENDA_CAMBIOS la anota una sola vez');
// el mail POSTERIOR a la fecha de la fila: son reuniones distintas → se pregunta, y la candidata es la del MISMO barrio
E = montar(true, filasMacri);
const i805b = E.D.v.findIndex(function (x) { return x[E.C('Barrio')] === 'Belgrano' && x[E.C('Figura')] === 'Jorge Macri'; });
r = correr(E, false, [{ fecha: new D(2026, 8, 30, 9, 0), asunto: ASUNTO_JM28, cuerpo: cuerpoJM28, truncado: false }]);
const dupJM = E.ssD.hojas['AGENDA_DUPLICADOS'];
ok(r.yaCargadas === 0 && r.duplicadosAntes === 1 && dupJM.v.length === 2 && dupJM.v[1][5] === 'fila ' + (i805b + 1),
   'mail del 30/09 (posterior a la fila): se pregunta, con UNA candidata, la del mismo barrio (fila ' + (i805b + 1) + '), no la de Villa Santa Rita');
ok(dupJM.opciones && dupJM.opciones.indexOf('Ya está cargada en otra fila: no crear') >= 0, 'con la opción "Ya está cargada en otra fila: no crear"');
dupJM.v[1][0] = 'Ya está cargada en otra fila: no crear';
r = correr(E, false, [{ fecha: new D(2026, 8, 30, 9, 0), asunto: ASUNTO_JM28, cuerpo: cuerpoJM28, truncado: false }]);
ok(r.crear === 0 && r.duplicadosAntes === 0 && r.yaCargadas === 1 && E.ssD.hojas['AGENDA_DUPLICADOS'].v.length === 1,
   'elegido "Ya está cargada en otra fila": no crea, no pregunta más, queda como ya cargada');

console.log('[27] paso 44: la regla "ya cargada" sobre el historial (resuelve / contradice al equipo / se preguntaría)');
E = montar(true, filasMacri);
E.ssI.hojas['DIAG_MAILS'] = new E.Hoja('DIAG_MAILS', [['fecha', 'asunto', 'cuerpo', 'truncado']].concat(mailsJM(23, 25).map(function (m) {
  return [m.fecha, m.asunto, m.cuerpo, false];
})));
let m44 = E.run('medirYaCargadasAgenda()');
ok(m44.resuelve === 1 && m44.contradice === 0 && m44.preguntaria === 0, 'Macri 01/10: la resuelve (la 805), sin contradecir al equipo — ' + JSON.stringify(m44));
// si el mail TAMBIÉN trajera una reunión de Macri el 29/09 en Belgrano, la 805 sería de ésa: la regla contradiría al equipo
const conOtra = cuerpoJM28.replace('Villa Santa Rita', 'Belgrano').replace('Hora: 10:15h', 'Hora: 09:55h');
E.ssI.hojas['DIAG_MAILS'] = new E.Hoja('DIAG_MAILS', [['fecha', 'asunto', 'cuerpo', 'truncado'], [new D(2026, 8, 25, 9, 0), ASUNTO_JM28, conOtra, false]]);
m44 = E.run('medirYaCargadasAgenda()');
ok(m44.contradice === 1 && m44.resuelve === 0, 'si la fila ya es la de otra reunión del mail, la cuenta como CONTRADICE — ' + JSON.stringify(m44));

E = montar(true, filasMacri);
r = correr(E, true, [{ fecha: new D(2026, 8, 25, 9, 0), asunto: ASUNTO_JM28, cuerpo: conOtra, truncado: false }]);
ok(r.yaCargadas === 0, 'y el plan no usa la 805 para el 01/10 si ya la tomó la reunión del 29/09 en Belgrano (ya cargadas ' + r.yaCargadas + ')');

console.log('[28] la DIRECCIÓN en el cruce con RDV CONJUNTO: la figura de la 818 (Seguridad, sin barrio, Comuna 6) y el desempate de asistentes');
const filasDir = [function (r, C) {      // "818": Seguridad en tu Barrio que creó la agenda, sin barrio, Comuna 6
  r[C('Figura')] = ''; r[C('Barrio')] = ''; r[C('FECHA')] = new D(2026, 9, 1, 12); r[C('HORA')] = '18:00';
  r[C('Dirección')] = 'Gral. Manuel A. Rodriguez 1191'; r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = 'en agenda';
  r[C('agenda_uid')] = 'c-818'; r[C('Lugar (mail)')] = 'Comuna 6'; r[C('Evento (mail)')] = 'Seguridad en tu Barrio, Comuna 6';
}, function (r, C) {                     // dos de Macri el 02/10
  r[C('Figura')] = 'Jorge Macri'; r[C('Barrio')] = 'Belgrano'; r[C('FECHA')] = new D(2026, 9, 2, 12); r[C('Dirección')] = 'Cabildo 2000';
}, function (r, C) {
  r[C('Figura')] = 'Jorge Macri'; r[C('Barrio')] = 'Palermo'; r[C('FECHA')] = new D(2026, 9, 2, 12); r[C('Dirección')] = 'Av. Serrano 1500, Club';
}];
const conjuntoDir = [['Figura', 'Barrio', 'FECHA', 'Dirección', 'Asistentes', 'Oradores anotados', 'Oradores que hablaron'],
  ['Muzzio Clara', 'Almagro', new D(2026, 9, 1, 12), 'Manuel A. Rodríguez 1191', 80, 3, 2],     // la dirección de la 818; el barrio, otro
  ['Tapia Gabino', 'Flores', new D(2026, 9, 1, 12), 'Rivadavia 7000', 60, '', ''],
  ['Macri Jorge', '', new D(2026, 9, 2, 12), 'Serrano 1500', 120, '', '']];                      // sin barrio: hoy es ambigua
const montarDir = function (flag) {
  const X = montar(true, filasDir, { CRUCE_CONJUNTO_POR_DIRECCION: flag });
  X.ssD.hojas['RDV CONJUNTO'] = new X.Hoja('RDV CONJUNTO', conjuntoDir);
  return X;
};
E = montarDir('false');
const med45 = E.run('medirDireccionConjunto()');
ok(med45.conjunto === 3 && med45.conDireccion === 3 && med45.cambia === 0 && med45.resuelve === 1 && med45.seguridad === 1,
   'paso 45: 3 con dirección; CAMBIA 0, RESUELVE 1 (Macri 02/10), Seguridad 1 (la 818) — ' + JSON.stringify(med45));
r = correr(E, true, [V1]);
ok(r.figura === 0, 'con CRUCE_CONJUNTO_POR_DIRECCION = false (hoy): la 818 no tiene figura (Comuna 6: nadie en RDV CONJUNTO)');
const asisSin = E.run('(function () { const x = cruzarAsistentes_(leerDestino_(), leerComunasMap_()); return { amb: x.ambiguas.length, n: x.porFila.size }; })()');
ok(asisSin.amb === 1, 'y Macri 02/10 en Asistentes queda ambigua');
E = montarDir('true');
const i818 = E.D.v.findIndex(function (x) { return x[E.C('agenda_uid')] === 'c-818'; });
const iPal = E.D.v.findIndex(function (x) { return x[E.C('Barrio')] === 'Palermo' && x[E.C('Figura')] === 'Jorge Macri' && x[E.C('FECHA')] instanceof Date && x[E.C('FECHA')].getMonth() === 9 && x[E.C('FECHA')].getDate() === 2; });
r = correr(E, false, [V1]);
ok(r.figura === 1 && celda(E, i818, 'Figura') === 'Clara Muzzio', 'con la dirección: la 818 → Clara Muzzio (fecha + dirección), aunque el barrio de RDV CONJUNTO sea otro');
ok(E.ssI.hojas['REGISTRO_AGENDA_CAMBIOS'].v.some(function (x) { return x[1] === 'figura_por_direccion' && /Clara Muzzio \(dirección exacta/.test(x[6]); }),
   'y queda registrado (figura_por_direccion)');
const asisCon = E.run('(function () { const x = cruzarAsistentes_(leerDestino_(), leerComunasMap_()); const p = x.porFila.get(' + (iPal + 1) + ');' +
                      'return { amb: x.ambiguas.length, asis: p ? p.asis : null, dir: x.desempatadasPorDireccion.length }; })()');
ok(asisCon.amb === 0 && asisCon.asis === 120 && asisCon.dir === 1, 'Asistentes: Macri 02/10 se desempata por dirección → la fila de Palermo (Serrano 1500), 120');

console.log('[29] el archivo "Agenda" en dos solapas: la semana en curso y "Agenda cerrada" (las que terminaron, la más nueva primero)');
E = montar(true, filasMacri);
const ASUNTO_21 = 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 21/09 al 27/09';
const mail21 = { fecha: new D(2026, 8, 18, 9, 0), asunto: ASUNTO_21, truncado: false,
                 cuerpo: ['*Martes 22/09*', 'Evento: Encuentro con Vecinos Clara Muzzio, Recoleta', 'Hora: 18:00h', 'Lugar: Av. Santa Fe 1234'].join(String.fromCharCode(10)) };
r = correr(E, false, [mail21].concat(mailsJM(23, 25), [V1]));
const arch = E.planilla(E.run('AGENDA_COPIA_SS'));
const ab = arch.hojas['Agenda'], ce = arch.hojas['Agenda cerrada'];
const encA = ab.v[0], semA = function (h, x) { return x[h.v[0].indexOf('Semana')]; };
ok(ab && ce && ab.v.slice(1).every(function (x) { return /05\/10/.test(semA(ab, x)); }) && ab.v.length > 1,
   '"Agenda": sólo la semana en curso (05/10 al 10/10): ' + (ab.v.length - 1) + ' líneas');
const semCe = ce.v.slice(1).map(function (x) { return semA(ce, x); });
ok(semCe.length === 3 && /28\/09/.test(semCe[0]) && /21\/09/.test(semCe[2]),
   '"Agenda cerrada": las semanas que terminaron, la más nueva primero (28/09 antes que 21/09): ' + semCe.join(' · '));
ok(ab.proteccion && ab.advertencia === true && ce.proteccion && ce.advertencia === true, 'las dos protegidas con advertencia');
ok(encA.length === 23 && ce.v[0].join('|') === encA.join('|'), 'las dos con las mismas 23 columnas');
// el lunes la semana que terminó pasa sola a "Agenda cerrada": se parte por fecha en cada corrida
const pz = E.run('(function () { const p = planAgenda_(leerDestino_(), agendaDesdeListaDeMails_(__mails, {}), indicesAgenda_(leerDestino_().hdr), ' +
                 'alcanceAgenda_(), { geocodificar: __geo, historial: { creadas: new Map(), olvidadas: new Set(), notadas: new Set(), yaCargadas: new Set(), error: "" }, elecciones: new Map(), conjunto: new Map() }); ' +
                 'const m = armarCopiaAgenda_(p, new Date()); const a = partirCopiaAgenda_(m, new Date(2026, 9, 6, 12)), b = partirCopiaAgenda_(m, new Date(2026, 9, 12, 12)); ' +
                 'return { hoyAb: a.abierta.length - 1, hoyCe: a.cerrada.length - 1, lunAb: b.abierta.length - 1, lunCe: b.cerrada.length - 1 }; })()');
ok(pz.lunAb === 0 && pz.lunCe === pz.hoyAb + pz.hoyCe, 'el lunes 12/10, la semana del 05/10 ya está en "Agenda cerrada" (' + JSON.stringify(pz) + ')');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
