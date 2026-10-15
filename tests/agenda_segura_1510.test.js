/**
 * tests/agenda_segura_1510.test.js — 15/10 (noche): la AGENDA SEGURA (H1 crear sólo lo identificado, H2 conciliación por semana,
 * H3 el invariante "una reunión, una fila", H4 validar los mails) y la cancelación automática que SÓLO SUSPENDE (J), con los casos
 * 829/830 y 833/835, y las mediciones de sólo lectura de diagnostico/32_medir_agenda_segura.js. Destino SIMULADO y mails
 * SINTÉTICOS (el mock es el de tests/agenda_seguridad_1510.test.js). "Hoy" es el jueves 15/10/2026.
 *
 *     node tests/agenda_segura_1510.test.js
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: mails, horarios y direcciones son inventados; los
 * barrios y comunas son los públicos de la Ciudad; las figuras, nombres de la columna Figura.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', '05_Escritura.js', '20_UpsertDestino.js', '49_Corridas.js',
                  '41_AgendaParser.js', '42_BarriosCabaGeo.js', '40_Agenda.js', 'diagnostico/17_peso_intermedia.js',
                  'diagnostico/08_verificar_escritura.js', 'diagnostico/03_muestras_mail.js', 'diagnostico/16_agenda_medicion.js',
                  'diagnostico/19_direccion_conjunto.js', 'diagnostico/21_ubicacion.js', '25_Elecciones.js',
                  'diagnostico/22_previsualizar.js', 'diagnostico/30_duplicados_agenda.js', 'diagnostico/32_medir_agenda_segura.js'];
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
    // el sistema de avisos (50_Avisos.js, de otro agente): acá sólo se anotan
    registrarAviso_: function (tema, texto) { (E.avisos = E.avisos || []).push([tema, texto]); },
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

const dia = function (d) { return new D(2026, 9, d, 12, 0, 0); };
const copia = function (E) {
  const h = E.planilla(E.run('AGENDA_COPIA_SS')).hojas['Agenda'];
  const cols = E.run('AGENDA_COPIA_COLUMNAS');
  return { filas: h ? h.v.slice(1) : [], c: function (n) { return cols.indexOf(n); } };
};
const lineaCopia = function (E, re) {
  const k = copia(E);
  return k.filas.filter(function (r) { return re.test(r.join(' | ')); }).map(function (r) {
    return { estado: r[k.c('Estado en la agenda')], fila: r[k.c('Fila del destino')], cambios: r[k.c('Cambios')], status: r[k.c('STATUS en el destino')] };
  });
};
const pendientes = function (E) { const h = E.ssI.hojas['AGENDA_PENDIENTES']; return h ? h.v.filter(function (r) { return r.some(Boolean); }) : null; };
const dups = function (E) { const h = E.ssD.hojas['AGENDA_DUPLICADOS']; return h ? h.v.slice(1).filter(function (r) { return r.some(Boolean); }) : []; };
const filasCon = function (E, fig, d) {
  const out = [];
  for (let i = 1; i < E.D.v.length; i++) {
    const r = E.D.v[i], f = r[E.C('FECHA')];
    if (r[E.C('Figura')] === fig && f instanceof Date && f.getDate() === d && f.getMonth() === 9) out.push(i);
  }
  return out;
};

// ============================== H1: crear sólo lo identificado ==============================

console.log('[1] H1, caso 829/830: la Seguridad de la Comuna 11 "A CONFIRMAR" no se crea hasta que llega la dirección');
let E = montar(true, [], { AGENDA_CREAR_SOLO_IDENTIFICADAS: 'true' });
let r = correr(E, false, [M1], { hoy: dia(12) });
ok(sinFig(E, 'Comuna 11', 15).length === 0 && r.pendientes === 1, 'el lunes 12/10 (v1, faltan 3 días): NO se crea, queda pendiente (pendientes ' + r.pendientes + ')');
ok(fila(E, 'Jorge Macri', 15) > 0 && fila(E, 'Clara Muzzio', 14) > 0, 'las reuniones con figura se crean igual (Macri "A CONFIRMAR" tiene figura)');
let lc = lineaCopia(E, /Comuna 11/);
ok(lc.length === 1 && lc[0].estado === 'pendiente de definir' && lc[0].fila === '', 'el archivo "Agenda" la muestra: "pendiente de definir", sin "Fila del destino" — ' + JSON.stringify(lc));
let pz = pendientes(E);
ok(pz && pz.length === 2 && /Comuna 11/.test(pz[1][0]) && pz[1][7] === 'figura y dirección' && /13\/10\/2026/.test(pz[1][8]),
   'AGENDA_PENDIENTES (intermedia): una línea, la reunión primero, qué le falta y "el 13/10/2026" — ' + JSON.stringify(pz && pz[1]));
r = correr(E, false, [M1, M2], { hoy: dia(14) });
const c11 = sinFig(E, 'Comuna 11', 15);
ok(c11.length === 1 && celda(E, c11[0], 'Dirección') === 'Pasaje Ficticio 1234, Club de Barrio' && r.crear === 1 && r.pendientes === 0,
   'el miércoles 14/10 (v2 con dirección): se crea UNA, con la dirección');
r = correr(E, false, [M1, M2], { hoy: dia(15) });
ok(r.crear === 0 && sinFig(E, 'Comuna 11', 15).length === 1, 'y la corrida siguiente no crea otra (la 829 nunca existe)');
E = montar(true, [], { AGENDA_CREAR_SOLO_IDENTIFICADAS: 'true' });
r = correr(E, false, [M1], { hoy: dia(13) });
ok(sinFig(E, 'Comuna 11', 15).length === 1 && r.pendientes === 0, 'sin dirección pero a 2 días (13/10): se crea');
// H1 solo no alcanza si la fila ya se creó "A CONFIRMAR" a 2 días y DESPUÉS llega la dirección: hace falta H2 (o
// AGENDA_SEGURIDAD_POR_COMUNA) para encontrarla
r = correr(E, true, [M1, M2], { hoy: dia(14) });
ok(r.crear === 1, 'H1 SOLO: creada el 13/10 "A CONFIRMAR", la dirección del 14/10 crearía OTRA (crear ' + r.crear + ')');
r = correr(E, false, [M1, M2], { hoy: dia(14), conciliacion: true });
ok(r.crear === 0 && sinFig(E, 'Comuna 11', 15).length === 1 && celda(E, sinFig(E, 'Comuna 11', 15)[0], 'Dirección') === 'Pasaje Ficticio 1234, Club de Barrio',
   'H1 + H2: se actualiza la misma fila');
E = montar(true, [], {});
r = correr(E, false, [M1], { hoy: dia(12) });
ok(sinFig(E, 'Comuna 11', 15).length === 1 && !pendientes(E), 'APAGADO: se crea el 12/10, como hoy, y no hay AGENDA_PENDIENTES');

console.log('[2] H1, 833/835: las dos Seguridad del 22/10 (Comunas 12 y 14), "A CONFIRMAR"');
E = montar(true, [], { AGENDA_CREAR_SOLO_IDENTIFICADAS: 'true' });
r = correr(E, false, [N1]);
ok(r.pendientes === 2 && sinFig(E, 'Comuna 12', 22).length === 0 && sinFig(E, 'Comuna 14', 22).length === 0, 'el 15/10 (faltan 7 días): ninguna se crea, las dos pendientes');
ok(pendientes(E).length === 3, 'AGENDA_PENDIENTES: dos líneas');
r = correr(E, false, [N1, N2]);
ok(sinFig(E, 'Comuna 12', 22).length === 1 && sinFig(E, 'Comuna 14', 22).length === 0 && r.pendientes === 1, 'llega la dirección de la Comuna 12: se crea ésa; la 14 sigue pendiente');
r = correr(E, false, [N1, N2], { hoy: dia(20) });
ok(sinFig(E, 'Comuna 14', 22).length === 1 && r.crear === 1, 'el 20/10 (faltan 2 días): se crea la de la Comuna 14');
r = correr(E, false, [N1, N2], { hoy: dia(20) });
ok(r.crear === 0 && r.ambiguas === 0 && sinFig(E, 'Comuna 12', 22).length === 1 && sinFig(E, 'Comuna 14', 22).length === 1,
   'cada una es la de su comuna, una sola fila cada una, y nada ambiguo');

// ============================== H2: la conciliación por semana ==============================

console.log('[3] H2: la conciliación por semana (con AGENDA_SEGURIDAD_POR_COMUNA apagado)');
E = montar(true, [], { AGENDA_CONCILIACION_SEMANAL: 'true' });
correr(E, false, [M1]);
const i11 = sinFig(E, 'Comuna 11', 15)[0];
r = correr(E, false, [M1, M2]);
ok(r.crear === 0 && r.conciliadas === 1 && sinFig(E, 'Comuna 11', 15).length === 1 && celda(E, i11, 'Dirección') === 'Pasaje Ficticio 1234, Club de Barrio',
   '829/830: la reunión sin fila y la fila de la agenda sin reunión de esa semana son la misma: se ACTUALIZA (crear ' + r.crear + ')');
E = montar(true, [], {});
correr(E, false, [N1]);
const i12 = sinFig(E, 'Comuna 12', 22)[0], i14 = sinFig(E, 'Comuna 14', 22)[0];
r = correr(E, true, [N1], { conciliacion: true });
ok(r.ambiguas === 0 && r.crear === 0 && r.conciliadas === 2, '833/835: hoy AMBIGUAS → con la conciliación, cada una la de su comuna (ambiguas ' + r.ambiguas + ')');
r = correr(E, false, [N1, N2], { conciliacion: true });
ok(celda(E, i12, 'Dirección') === 'Calle Inventada 500, Sociedad de Fomento' && celda(E, i14, 'Dirección') === 'A CONFIRMAR' && r.crear === 0,
   'y la dirección nueva de la Comuna 12 va SÓLO a la de la Comuna 12');
// se pasa a otro día de la misma semana (sin figura: la regla de "mover" de siempre es sólo con figura)
const SEG11_16 = ['*Viernes 16/10*', 'Evento: Seguridad en tu Barrio, Comuna 11', 'Hora: 18:00h', 'Lugar: A CONFIRMAR'];
const M3 = mail(14, 9, [MUZZIO, SEG11_16, MACRI('A CONFIRMAR')], ASUNTO_12);
E = montar();
correr(E, false, [M1]);
const j11 = sinFig(E, 'Comuna 11', 15)[0];
r = correr(E, true, [M1, M3]);
ok(r.crear === 1 && r.borrar === 1, 'HOY: la del 15/10 se borra (cancelación) y se crea otra el 16/10 (crear ' + r.crear + ', borrar ' + r.borrar + ')');
r = correr(E, false, [M1, M3], { conciliacion: true });
ok(r.crear === 0 && r.borrar === 0 && r.mover === 1 && celda(E, j11, 'FECHA').getDate() === 16, 'con la conciliación: se MUEVE la misma fila al 16/10');
// dos reuniones nuevas, una fila sin par, y empatan: se pregunta, no se crea
const SEG12_16 = ['*Viernes 16/10*', 'Evento: Seguridad en tu Barrio, Comuna 12', 'Hora: 18:00h', 'Lugar: A CONFIRMAR'];
const SEG14_16 = ['*Viernes 16/10*', 'Evento: Seguridad en tu Barrio, Comuna 14', 'Hora: 18:00h', 'Lugar: A CONFIRMAR'];
const M4 = mail(14, 9, [MUZZIO, MACRI('A CONFIRMAR'), SEG12_16, SEG14_16], ASUNTO_12);
E = montar();
correr(E, false, [M1]);
r = correr(E, false, [M1, M4], { conciliacion: true });
const preg = dups(E).filter(function (x) { return x[3] === 'antes de crear' && /sin su reunión/.test(x.join(' ')); });
ok(r.crear === 0 && preg.length === 2, 'dos reuniones nuevas que empatan con UNA fila de la agenda sin reunión: no se crea ninguna, se pregunta (líneas ' + preg.length + ')');
r = correr(E, false, [M1, M4]);
ok(r.crear === 2, 'APAGADO: se crean las dos (como hoy)');

// ============================== H3: una reunión, una fila ==============================

console.log('[4] H3: el invariante "una reunión, una fila"');
E = montar();
correr(E, false, [M1]);
correr(E, false, [M1, M2]);                                   // hoy: dos filas de la Comuna 11 (la 829 y la 830)
const TAPIA16 = ['*Viernes 16/10*', 'Evento: Encuentro con Vecinos Gabino Tapia, Núñez', 'Hora: 10:00h', 'Lugar: Cabildo 2000, Club'];
const M5 = mail(15, 9, [MUZZIO, SEG11('Pasaje Ficticio 1234, Club de Barrio'), MACRI('A CONFIRMAR'), TAPIA16], ASUNTO_12);
E.avisos = [];
r = correr(E, true, [M1, M2, M5]);
ok(r.crear === 1, 'APAGADO: se crea Tapia 16/10 (crear ' + r.crear + ')');
r = correr(E, false, [M1, M2, M5], { invariante: true });
ok(r.invariante === 1 && r.bloqueadasInvariante === 1 && r.crear === 0 && filasCon(E, 'Gabino Tapia', 16).length === 0,
   'con el invariante: una reunión en dos filas → en esa semana no se crea nada más (Tapia no se crea)');
const linInv = dups(E).filter(function (x) { return x[3] === 'una reunión en dos filas'; });
ok(linInv.length === 2, 'AGENDA_DUPLICADOS: las dos filas, "una reunión en dos filas" (' + linInv.length + ')');
ok((E.avisos || []).some(function (a) { return a[0] === 'invariante_agenda' && /Comuna 11/.test(a[1]); }), 'y el aviso invariante_agenda');
r = correr(E, true, [M1, M2, N1], { invariante: true });
ok(r.crear === 2, 'otra semana (la del 19/10) sí crea (crear ' + r.crear + ')');
const p16 = E.run('_filasAgenda_diag8(leerDestino_()).invariante.length');
ok(p16 === 1, 'el paso 16 lo cuenta (tiene que dar 0; acá 1)');
// Macri dos veces el mismo día a distinta hora: no es una violación si el mail las trae (sin el mail: horas distintas)
E = montar(true, [function (q, C) { q[C('Figura')] = 'Jorge Macri'; q[C('FECHA')] = new D(2026, 9, 16, 12); q[C('HORA')] = '11:00'; q[C('STATUS REUNIÓN')] = 'en agenda'; q[C('agenda_uid')] = 'c-1'; },
                    function (q, C) { q[C('Figura')] = 'Jorge Macri'; q[C('FECHA')] = new D(2026, 9, 16, 12); q[C('HORA')] = '18:00'; q[C('STATUS REUNIÓN')] = 'en agenda'; q[C('agenda_uid')] = 'c-2'; }]);
ok(E.run('reunionesRepetidasAgenda_(leerDestino_().filas, indicesAgenda_(leerDestino_().hdr), null).length') === 0, 'Macri 11:00 y 18:00, sin el mail: dos reuniones (horas distintas)');
ok(E.run('reunionesRepetidasAgenda_(leerDestino_().filas, indicesAgenda_(leerDestino_().hdr), function () { return 1; }).length') === 1, 'con un mail que trae UNA: violación');
ok(E.run('reunionesRepetidasAgenda_(leerDestino_().filas, indicesAgenda_(leerDestino_().hdr), function () { return 2; }).length') === 0, 'con un mail que trae DOS: bien');

// ============================== H4: validar los mails ==============================

console.log('[5] H4: la misma reunión dos veces en un mail, y los mails raros');
const MD = mail(15, 8, [MUZZIO, MACRI('A CONFIRMAR'), MACRI('A CONFIRMAR')], ASUNTO_12);
E = montar();
r = correr(E, true, [MD]);
ok(r.crear === 2, 'APAGADO: Macri dos veces en el mail → se crea UNA (y Muzzio): crear ' + r.crear);
E.avisos = [];
r = correr(E, false, [MD], { validarMails: true });
ok(r.crear === 1 && filasCon(E, 'Jorge Macri', 15).length === 0 && r.repetidasEnMail === 1, 'con H4: Macri no se crea (sólo Muzzio), una repetida — repetidas ' + r.repetidasEnMail);
ok(E.avisos.some(function (a) { return a[0] === 'mail_raro' && /dos veces/.test(a[1]); }), 'y el aviso mail_raro');
ok(lineaCopia(E, /Jorge Macri/).some(function (x) { return /repetida en el mail/.test(x.estado); }), 'el archivo "Agenda" lo dice');
const RARO = mail(15, 9, ['*Jueves 15/10*', 'Actividad: Encuentro con Vecinos Jorge Macri, Villa Santa Rita', 'Horario: 11 hs', 'Sitio: A CONFIRMAR', '',
                          'Actividad: Seguridad en tu Barrio, Comuna 11', 'Horario: 18 hs'], ASUNTO_12);
E = montar();
correr(E, false, [M1]);
r = correr(E, true, [M1, RARO]);
ok(r.saltadas60 === 2 && r.mailsRaros === 1, 'APAGADO: el mail raro es la última versión (0 reuniones): todo "desaparece" (lo frena la protección del 60%)');
E.avisos = [];
r = correr(E, false, [M1, RARO], { validarMails: true });
ok(r.saltadas60 === 0 && r.noFuturas === 0 && r.crear === 0 && r.actualizar === 0, 'con H4: el mail raro no se usa, la semana queda con la versión anterior');
ok(E.avisos.some(function (a) { return a[0] === 'mail_raro' && /no se usó/.test(a[1]); }), 'y el aviso mail_raro');
// menos / más, con el parser solo
const SEM19 = function (d, nombre) { return ['*' + nombre + ' ' + d + '/10*', 'Evento: Encuentro con Vecinos Clara Muzzio, Recoleta', 'Hora: 18:00h', 'Lugar: Av. Santa Fe 1234, Club']; };
const FIGS = ['Clara Muzzio', 'Jorge Macri', 'Hernán Lombardi', 'Gabino Tapia', 'Laura Alonso', 'Ezequiel Sabor'];
const reunion = function (d, i) { return ['*' + ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d - 19] + ' ' + d + '/10*', 'Evento: Encuentro con Vecinos ' + FIGS[i] + ', Recoleta', 'Hora: 18:00h', 'Lugar: Av. Santa Fe 1234, Club']; };
const V6 = mail(15, 9, [19, 20, 21, 22, 23, 24].map(function (d, i) { return reunion(d, i); }), ASUNTO_19);
const raros = function (lista) { E.ctx.__l = lista; return E.run('agendaDesdeListaDeMails_(__l, { validarMails: true }).mailsRaros.map(function (m) { return m.motivos.join("; "); })'); };
E = montar();
ok(raros([V6, mail(19, 9, [reunion(19, 0), reunion(20, 1)], ASUNTO_19)]).length === 1, 'MENOS: 2 contra 6 que no habían pasado → raro');
ok(raros([V6, mail(22, 9, [reunion(22, 3), reunion(23, 4)], ASUNTO_19)]).length === 0, 'menos, pero el mail es del 22/10 (sólo quedaban 3 por venir): no es raro');
const V2 = mail(15, 9, [reunion(19, 0), reunion(20, 1)], ASUNTO_19);
ok(raros([V2, mail(16, 9, [19, 20, 21, 22, 23, 24].map(function (d, i) { return reunion(d, i); }), ASUNTO_19)]).length === 0, 'MÁS: las 2 anteriores y 4 nuevas: no es raro');
ok(raros([V2, mail(16, 9, [21, 22, 23, 24].map(function (d, i) { return reunion(d, i + 2); }), ASUNTO_19)]).length === 0, 'MÁS sólo cuenta con 3+ de diferencia');
const NOTA = mail(16, 9, [reunion(19, 0), ['', 'Nota: reunión con prensa', '', 'Nota: llevar sillas'], reunion(20, 1)], ASUNTO_19);
ok(raros([V2, NOTA]).length === 1, 'dos líneas "Nota:" que no son Evento / Hora / Lugar → raro');

// ============================== J: la cancelación automática que sólo suspende ==============================

console.log('[6] J: una reunión futura que sale del mail → Suspendida, nunca borrada');
const TAPIA17 = ['*Sábado 17/10*', 'Evento: Encuentro con Vecinos Gabino Tapia, Núñez', 'Hora: 10:00h', 'Lugar: Cabildo 2000, Club'];
const J1 = mail(12, 9, [MUZZIO, MACRI('A CONFIRMAR'), TAPIA17], ASUNTO_12);
const J2 = mail(15, 9, [MUZZIO, MACRI('A CONFIRMAR')], ASUNTO_12);
const SUSP = { AGENDA_CANCELACION_AUTOMATICA: 'true', AGENDA_CANCELACION_MODO: "'suspender'" };
E = montar(true, [], SUSP);
correr(E, false, [J1]);
const iT = fila(E, 'Gabino Tapia', 17);
E.avisos = [];
r = correr(E, false, [J1, J2]);
ok(iT > 0 && fila(E, 'Gabino Tapia', 17) === iT && celda(E, iT, 'STATUS REUNIÓN') === 'Suspendida' && celda(E, iT, 'agenda_status_escrito') === 'Suspendida' &&
   r.borrar === 0 && r.suspender === 1, 'la fila que creó la agenda y nadie tocó: Suspendida, NO borrada (borrar ' + r.borrar + ')');
ok(E.avisos.filter(function (a) { return a[0] === 'suspendidas'; }).length === 1, 'un aviso "suspendidas"');
ok(lineaCopia(E, /Gabino Tapia/).some(function (x) { return x.cambios === 'suspendida: salió del mail del 15/10/2026'; }), '"Cambios" en el archivo "Agenda": "suspendida: salió del mail del 15/10/2026"');
ok(dups(E).some(function (x) { return x[3] === 'cancelación' && /^aplicado: Suspendida/.test(x[2]); }), 'AGENDA_DUPLICADOS: la línea "cancelación" con el resultado (aplicado)');
r = correr(E, false, [J1, J2]);
ok(r.suspender === 0 && lineaCopia(E, /Gabino Tapia/).some(function (x) { return /^suspendida: salió/.test(x.cambios); }), 'la corrida siguiente no hace nada más (y "Cambios" lo sigue diciendo)');
const J3 = mail(15, 11, [MUZZIO, MACRI('A CONFIRMAR'), TAPIA17], ASUNTO_12);
r = correr(E, false, [J1, J2, J3]);
ok(celda(E, iT, 'STATUS REUNIÓN') === 'en agenda' && r.reactivar === 1, 'vuelve al mail (v3 completa): se REACTIVA → "en agenda"');
E = montar(true, [], SUSP);
correr(E, false, [J1]);
correr(E, false, [J1, J2]);
E.run('deshacerAgenda(false)');
ok(celda(E, fila(E, 'Gabino Tapia', 17), 'STATUS REUNIÓN') === 'en agenda', 'deshacer (paso 38) la vuelve a "en agenda"');
E = montar(true, [], { AGENDA_CANCELACION_AUTOMATICA: 'true' });
correr(E, false, [J1]);
r = correr(E, false, [J1, J2]);
ok(r.borrar === 1 && fila(E, 'Gabino Tapia', 17) < 0, 'modo "regla7" (el de hoy con la automática): la borra');

console.log('[7] J: lo que NO se suspende');
const caso = function (nombre, mails2, prep, extra) {
  const X = montar(true, [], SUSP);
  correr(X, false, [J1]);
  const k = fila(X, 'Gabino Tapia', 17);
  if (prep) prep(X, k);
  X.avisos = [];
  const rr = correr(X, false, mails2, extra);
  return { X: X, k: k, rr: rr, status: celda(X, fila(X, 'Gabino Tapia', 17) >= 0 ? fila(X, 'Gabino Tapia', 17) : k, 'STATUS REUNIÓN') };
};
let q = caso('Re', [J1, mail(15, 9, [MUZZIO, MACRI('A CONFIRMAR')], 'RE: ' + ASUNTO_12)]);
ok(q.status === 'en agenda' && q.rr.suspender === 0, 'un "RE:" sin la reunión no la saca del mail');
q = caso('pasada', [J1, mail(18, 9, [MUZZIO, MACRI('A CONFIRMAR')], ASUNTO_12)]);
ok(q.status === 'en agenda' && q.rr.suspender === 0, 'si ya había pasado cuando salió del mail (mail del 18/10), no');
q = caso('equipo', [J1, J2], function (X, k) { X.D.v[k][X.C('STATUS REUNIÓN')] = 'Realizada'; });
ok(q.status === 'Realizada' && q.rr.suspender === 0, 'si el equipo le puso otro STATUS (Realizada), no se toca');
const J2RARO = mail(15, 9, [MUZZIO, ['', 'Nota: cambió la agenda', '', 'Nota: ver con prensa'], MACRI('A CONFIRMAR')], ASUNTO_12);
q = caso('raro', [J1, J2RARO]);
ok(q.status === 'en agenda' && q.rr.suspender === 0 && q.rr.cancelNoAplicada === 1 &&
   q.X.avisos.some(function (a) { return a[0] === 'cancelacion_no_aplicada' && /formato raro/.test(a[1]); }),
   'el mail que la sacó tiene formato raro: no se suspende y se avisa (cancelacion_no_aplicada)');
const TAPIA16b = ['*Viernes 16/10*', 'Evento: Encuentro con Vecinos Gabino Tapia, Núñez', 'Hora: 10:00h', 'Lugar: Cabildo 2000, Club'];
q = caso('misma semana', [J1, mail(15, 9, [MUZZIO, MACRI('A CONFIRMAR'), TAPIA16b], ASUNTO_12)]);
ok(q.rr.mover === 1 && q.rr.suspender === 0 && celda(q.X, q.k, 'FECHA').getDate() === 16 && celda(q.X, q.k, 'STATUS REUNIÓN') === 'en agenda',
   'se pasó a otro día de la misma semana: se MUEVE, no se suspende');
const TAPIA20 = ['*Martes 20/10*', 'Evento: Encuentro con Vecinos Gabino Tapia, Núñez', 'Hora: 10:00h', 'Lugar: Cabildo 2000, Club'];
q = caso('otra semana', [J1, J2, mail(15, 10, [TAPIA20], ASUNTO_19)]);
ok(celda(q.X, q.k, 'STATUS REUNIÓN') === 'Suspendida' && filasCon(q.X, 'Gabino Tapia', 20).length === 1 && q.rr.entreSemanas === 1,
   'se pasó a otra semana: la vieja Suspendida y la nueva creada');
q = caso('sigue', [J1, J2], null, { cancelacionAutomatica: false });
ok(q.status === 'en agenda' && dups(q.X).some(function (x) { return x[3] === 'cancelación' && /elegir/.test(x[2]); }), 'APAGADA: se pregunta (como hoy)');
r = correr(q.X, false, [J1, J2]);
ok(celda(q.X, q.k, 'STATUS REUNIÓN') === 'Suspendida', 'y la pregunta pendiente se resuelve con la regla en la corrida siguiente (prendida)');

// ============================== las mediciones (sólo lectura) ==============================

console.log('[8] medirAgendaSegura, replayAgendaSegura y medirCancelacionAutomatica: no escriben nada');
E = montar();
correr(E, false, [M1]);
correr(E, false, [M1, M2]);                                   // la base de hoy, con la 829 y la 830
let antes = foto(E.D), antesI = JSON.stringify(Object.keys(E.ssI.hojas));
E.ctx.__mails = [M1, M2, N1]; E.ctx.__geo = geocodificador(E);
const med = E.run('medirAgendaSegura({ mails: __mails, geocodificar: __geo, conjunto: new Map() })');
ok(foto(E.D) === antes && JSON.stringify(Object.keys(E.ssI.hojas)) === antesI, 'medirAgendaSegura no escribe nada');
ok(med.invarianteBase.length === 1 && /Comuna 11/.test(med.invarianteBase[0]), 'el invariante en la base: 1 (la 829/830) — ' + med.invarianteBase.join(' / '));
ok(med.pendientes.length === 2 && med.pendientes.every(function (p) { return /Comuna 1[24]/.test(p.reunion) && p.seCrea === '20/10/2026'; }),
   'pendientes con H1: las dos del 22/10, se crearían el 20/10 — ' + JSON.stringify(med.pendientes));
E = montar();
antes = foto(E.D);
E.ctx.__mails = [M1, M2, N1, N2]; E.ctx.__geo = geocodificador(E);
const rep = E.run('replayAgendaSegura({ mails: __mails, geocodificar: __geo })');
ok(foto(E.D) === antes, 'replayAgendaSegura no escribe nada');
// la regla de hoy crea DOS de más: la 830 (Comuna 11, al llegar la dirección el 14/10) y la Comuna 12 del 22/10 (al llegar la
// dirección el 15/10 10:00): el mismo error
ok(rep['regla de hoy'].deMas.length === 2 && /Comuna 11/.test(rep['regla de hoy'].deMas[0]) && /Comuna 12/.test(rep['regla de hoy'].deMas[1]),
   'con la regla de hoy: 2 filas de más (la 830 y la Comuna 12 del 22/10) — ' + rep['regla de hoy'].deMas.join(' / '));
ok(rep['con H1-H4'].deMas.length === 0, 'con H1-H4: 0 de más');
const pC11 = rep['con H1-H4'].pendientes.filter(function (p) { return /Comuna 11/.test(p.reunion); })[0];
const pC12 = rep['con H1-H4'].pendientes.filter(function (p) { return /Comuna 12/.test(p.reunion); })[0];
const pC14 = rep['con H1-H4'].pendientes.filter(function (p) { return /Comuna 14/.test(p.reunion); })[0];
// la corrida de cada día a las 10:00: el martes 13/10 la del 15/10 ya está a 2 días y se crea "A CONFIRMAR" (y el 14/10 la
// dirección la ACTUALIZA, no crea otra: 0 de más)
ok(pC11 && pC11.creada === '13/10/2026' && /2 días/.test(pC11.por) && pC12 && pC12.creada === '15/10/2026' && /dirección/.test(pC12.por) && pC14 && !pC14.creada,
   'pendientes: la Comuna 11 se crea el 13/10 (a 2 días), la 12 el 15/10 al llegar la dirección, la 14 todavía no — ' + JSON.stringify(rep['con H1-H4'].pendientes));
E = montar();
correr(E, false, [J1]);
antes = foto(E.D);
E.ctx.__mails = [J1, J2]; E.ctx.__geo = geocodificador(E);
let mc = E.run('medirCancelacionAutomatica({ mails: __mails, geocodificar: __geo, elecciones: new Map() })');
ok(foto(E.D) === antes, 'medirCancelacionAutomatica no escribe nada');
ok(mc.lineas.length === 1 && mc.lineas[0].nueva === 'suspender' && mc.lineas[0].regla7 === 'borrar' && /todavía no la suspendió/.test(mc.lineas[0].equipo),
   'Tapia 17/10: la regla nueva la suspendería, la 7 la borraría; el equipo todavía no — ' + JSON.stringify(mc.lineas));
E.D.v[fila(E, 'Gabino Tapia', 17)][E.C('STATUS REUNIÓN')] = 'Suspendida';
mc = E.run('medirCancelacionAutomatica({ mails: __mails, geocodificar: __geo, elecciones: new Map() })');
ok(mc.cuenta.yaSuspendida === 1 && /COINCIDE/.test(mc.lineas[0].equipo), 'si el equipo ya la había suspendido: COINCIDE');

console.log('[9] GUÍA y LEER (43_Ayuda.js): el texto nuevo sólo con el interruptor');
const ayuda = function (cfg) {
  const ctx = { console: console, Date: Date, Math: Math, JSON: JSON, Map: Map, Set: Set, Object: Object, Array: Array, String: String, Number: Number };
  vm.createContext(ctx);
  ['00_Config.js', '01_Utils.js', '27_RevisarFormato.js', '43_Ayuda.js'].forEach(function (f) {
    let s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    if (f === '00_Config.js') Object.keys(cfg).forEach(function (k) { s = s.replace(new RegExp('^const ' + k + '\\s+=.*', 'm'), 'const ' + k + ' = ' + cfg[k] + ';'); });
    vm.runInContext(s, ctx, { filename: f });
  });
  return vm.runInContext('filasAyuda_(AYUDA_GUIA_).concat(filasAyuda_(AYUDA_LEER_)).map(function (x) { return x.texto; }).join("\\n")', ctx);
};
const g0 = ayuda({}), g1 = ayuda({ AGENDA_CANCELACION_AUTOMATICA: 'true', AGENDA_CANCELACION_MODO: "'suspender'", AGENDA_CREAR_SOLO_IDENTIFICADAS: 'true' });
ok(/Se canceló: suspender\/borrar/.test(g0) && !/nunca borra la fila/.test(g0) && !/pendiente de definir/.test(g0), 'APAGADO: la GUÍA y la LEER de siempre');
ok(!/Se canceló: suspender\/borrar/.test(g1) && /el sistema la pone en Suspendida \(nunca borra la fila\); si vuelve al mail, la reactiva/.test(g1) &&
   /suspendida: salió del mail del/.test(g1) && /pendiente de definir/.test(g1), 'PRENDIDO: "si una reunión sale del mail, el sistema la pone en Suspendida; si vuelve, la reactiva"');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
