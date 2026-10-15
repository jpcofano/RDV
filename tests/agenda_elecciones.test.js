/**
 * tests/agenda_elecciones.test.js — 15/10: las DECISIONES de AGENDA_DUPLICADOS se aplican siempre (AGENDA_ELECCIONES_SIEMPRE) y
 * las reuniones CANCELADAS en el mail se cierran solas (AGENDA_CERRAR_CANCELADAS_MAIL). El caso del usuario: Jorge Macri 01/10
 * Belgrano, "Ya está cargada en otra fila: no crear", y la línea volvió. Cada corrimiento que la perdía (la hora del mail, la fila
 * que deja de ser candidata, el barrio de la fila, una línea pre-cargada de otra candidata, la semana fuera del alcance), con el
 * interruptor apagado (el bug, tal cual) y prendido; "vincular", "Sigue" y "Se canceló" igual; y el paso 94 (sólo lectura).
 * Destino SIMULADO y mails SINTÉTICOS (el mock es el de tests/agenda_segura_1510.test.js). "Hoy" es el jueves 15/10/2026.
 *
 *     node tests/agenda_elecciones.test.js
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
                  'diagnostico/22_previsualizar.js', 'diagnostico/30_duplicados_agenda.js', 'diagnostico/32_medir_agenda_segura.js',
                  'diagnostico/35_elecciones_agenda.js'];
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
  const cfg = Object.assign({ DERIVADAS_POR_SCRIPT: 'false', AGENDA_SOLO_SEMANA: 'null', AGENDA_CANCELACION_AUTOMATICA: 'true', AGENDA_CANCELACION_MODO: "'regla7'" }, config || {});   // el alcance de cada escenario no depende de cómo quedó 00_Config.js
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

const sinFig = function (E, lugar, dia) {
  const out = [];
  for (let i = 1; i < E.D.v.length; i++) {
    const r = E.D.v[i], f = r[E.C('FECHA')];
    if (r[E.C('Lugar (mail)')] === lugar && f instanceof Date && f.getDate() === dia && f.getMonth() === 9 && !r[E.C('Figura')]) out.push(i);
  }
  return out;
};

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
const dups = function (E) { const h = E.ssD.hojas['AGENDA_DUPLICADOS']; return h ? h.v.slice(1).filter(function (r) { return r.some(Boolean); }) : []; };
const filasCon = function (E, fig, d) {
  const out = [];
  for (let i = 1; i < E.D.v.length; i++) {
    const r = E.D.v[i], f = r[E.C('FECHA')];
    if (r[E.C('Figura')] === fig && f instanceof Date && f.getDate() === d && f.getMonth() === 9) out.push(i);
  }
  return out;
};

// ============================== los mails (inventados) ==============================

const NL = String.fromCharCode(10);
const ASUNTO_JM28 = 'Agenda Encuentros de vecinos con JM - Semana del 28/09 al 04/10';
const cuerpoJM = function (hora01) {
  return ['*Martes 29/09*', 'Evento: Encuentro "1 a 1" Jorge Macri, Villa Santa Rita', 'Hora: 10:15h', 'Lugar: A CONFIRMAR', '',
          '*Jueves 01/10*', 'Evento: Encuentro "1 a 1" Jorge Macri, Belgrano', 'Hora: ' + hora01 + 'h', 'Lugar: A CONFIRMAR'].join(NL);
};
// la versión del 30/09 (POSTERIOR a la fila del 29/09: no es "ya cargada" sola, se pregunta) y una del 01/10 que cambia la hora
const V1 = { fecha: new D(2026, 8, 30, 9, 0), asunto: ASUNTO_JM28, cuerpo: cuerpoJM('15:00'), truncado: false };
const V2 = { fecha: new D(2026, 9, 1, 8, 0), asunto: ASUNTO_JM28, cuerpo: cuerpoJM('15:30'), truncado: false };
// sólo la del 01/10 (para el escenario con una sola fila del 29/09: la reunión del 29/09 la tomaría)
const V1b = { fecha: new D(2026, 8, 30, 9, 0), asunto: ASUNTO_JM28, truncado: false,
              cuerpo: ['*Jueves 01/10*', 'Evento: Encuentro "1 a 1" Jorge Macri, Belgrano', 'Hora: 15:00h', 'Lugar: A CONFIRMAR'].join(NL) };

// "804": Macri 29/09 Villa Santa Rita (Suspendida); "805": Macri 29/09 Belgrano (Realizada), la candidata del 01/10
const filasMacri = [function (r, C) {
  r[C('Figura')] = 'Jorge Macri'; r[C('Barrio')] = 'Villa Santa Rita'; r[C('FECHA')] = new D(2026, 8, 29, 12); r[C('HORA')] = '10:15';
  r[C('EVENTO')] = 'Uno a uno'; r[C('STATUS REUNIÓN')] = 'Suspendida';
}, function (r, C) {
  r[C('Figura')] = 'Jorge Macri'; r[C('Barrio')] = 'Belgrano'; r[C('FECHA')] = new D(2026, 8, 29, 12); r[C('HORA')] = '09:55';
  r[C('EVENTO')] = 'Uno a uno'; r[C('STATUS REUNIÓN')] = 'Realizada'; r[C('Inscriptos')] = 120;
}];
// otro reparto: sin fila del mismo barrio; dos candidatas de la misma comuna (13: Núñez el 30/09 y Colegiales el 02/10)
const filasDos = [function (r, C) {
  r[C('Figura')] = 'Jorge Macri'; r[C('Barrio')] = 'Núñez'; r[C('FECHA')] = new D(2026, 8, 30, 12); r[C('HORA')] = '11:00';
  r[C('EVENTO')] = 'Uno a uno'; r[C('STATUS REUNIÓN')] = 'Realizada';
}, function (r, C) {
  r[C('Figura')] = 'Jorge Macri'; r[C('Barrio')] = 'Colegiales'; r[C('FECHA')] = new D(2026, 9, 2, 12); r[C('HORA')] = '12:00';
  r[C('EVENTO')] = 'Uno a uno'; r[C('STATUS REUNIÓN')] = 'Realizada';
}];

const SI = { AGENDA_ELECCIONES_SIEMPRE: 'true' };
const lineas01 = function (E) { return dups(E).filter(function (x) { return /01\/10\/2026/.test(x[4]) && /Macri/.test(x[4]); }); };
const filaBelgrano = function (E) { return E.D.v.findIndex(function (x) { return x[E.C('Barrio')] === 'Belgrano' && x[E.C('Figura')] === 'Jorge Macri'; }); };
const macri01 = function (E) { return filasCon(E, 'Jorge Macri', 1).length; };
const cambiosTipo = function (E, t) { const h = E.ssI.hojas['REGISTRO_AGENDA_CAMBIOS']; return h ? h.v.filter(function (x) { return x[1] === t; }) : []; };
const elegir = function (E, re, texto) {
  const h = E.ssD.hojas['AGENDA_DUPLICADOS'];
  const i = h.v.findIndex(function (x, k) { return k > 0 && re.test(x.join('|')); });
  if (i < 0) throw new Error('no está la línea ' + re);
  h.v[i][0] = texto;
  return i;
};
/** La línea de la copia en el archivo "Agenda" (la semana del 28/09 ya terminó: está en "Agenda cerrada"). */
const lineaCopiaTodas = function (E, re) {
  const ss = E.planilla(E.run('AGENDA_COPIA_SS')), cols = E.run('AGENDA_COPIA_COLUMNAS');
  const out = [];
  ['Agenda', 'Agenda cerrada'].forEach(function (n) {
    const h = ss.hojas[n]; if (!h) return;
    h.v.slice(1).forEach(function (r) { if (re(r)) out.push({ estado: r[cols.indexOf('Estado en la agenda')], fila: r[cols.indexOf('Fila del destino')] }); });
  });
  return out;
};
const preguntar = function (E, mails, cfg) {
  const X = montar(true, filasMacri, cfg);
  correr(X, false, mails);
  return X;
};

// ============================== [1] el caso, sin corrimiento: igual con y sin el interruptor ==============================

console.log('[1] Macri 01/10 Belgrano: se pregunta (candidata la fila de Belgrano), se elige "Ya está cargada…", se aplica; igual apagado y prendido');
[{}, SI].forEach(function (cfg) {
  const nom = cfg.AGENDA_ELECCIONES_SIEMPRE ? 'PRENDIDO' : 'APAGADO';
  const X = preguntar(null, [V1], cfg);
  const iB = filaBelgrano(X);
  let l = lineas01(X);
  ok(l.length === 1 && l[0][5] === 'fila ' + (iB + 1) && macri01(X) === 0, nom + ': una línea, candidata la fila ' + (iB + 1) + ', no se crea');
  elegir(X, /01\/10\/2026/, 'Ya está cargada en otra fila: no crear');
  let r = correr(X, false, [V1]);
  ok(r.crear === 0 && r.duplicadosAntes === 0 && r.yaCargadas === 1 && lineas01(X).length === 0, nom + ': aplicada, la línea no vuelve');
  r = correr(X, false, [V1]);
  ok(r.crear === 0 && r.duplicadosAntes === 0 && lineas01(X).length === 0 && cambiosTipo(X, 'ya_cargada').length === 1, nom + ': y en la corrida siguiente tampoco');
  ok(cambiosTipo(X, 'eleccion_aplicada').length === (cfg.AGENDA_ELECCIONES_SIEMPRE ? 1 : 0),
     nom + ': REGISTRO_AGENDA_CAMBIOS "eleccion_aplicada": ' + cambiosTipo(X, 'eleccion_aplicada').length + ' (prendido: una sola vez)');
});

// ============================== [2] la hora cambió (el id_reunion cambia) ==============================

console.log('[2] después de elegir llega una versión con OTRA HORA (15:00 → 15:30): el id_reunion cambia');
let E = preguntar(null, [V1], {});
elegir(E, /01\/10\/2026/, 'Ya está cargada en otra fila: no crear');
let r = correr(E, false, [V1, V2]);
let l = lineas01(E);
ok(r.duplicadosAntes === 1 && l.length === 1 && l[0][0] === '' && /15:30/.test(l[0][4]),
   'APAGADO (el bug): la línea VUELVE, con ELEGIR vacío (la elección quedó con el id de las 15:00)');
E = preguntar(null, [V1], SI);
elegir(E, /01\/10\/2026/, 'Ya está cargada en otra fila: no crear');
r = correr(E, false, [V1, V2]);
ok(r.crear === 0 && r.duplicadosAntes === 0 && r.yaCargadas === 1 && lineas01(E).length === 0, 'PRENDIDO: se aplica por la base (figura + fecha), no vuelve');
r = correr(E, false, [V1, V2]);
ok(r.duplicadosAntes === 0 && lineas01(E).length === 0 && cambiosTipo(E, 'eleccion_aplicada').length === 1, 'y la corrida siguiente igual; una sola línea "eleccion_aplicada"');

// ============================== [3] la fila elegida deja de ser candidata ==============================

console.log('[3] la fila elegida deja de ser candidata (le estamparon agenda_uid): antes se CREABA la reunión');
const sacarDeCandidatas = function (X) { X.D.v[filaBelgrano(X)][X.C('agenda_uid')] = 'v-de-otra-corrida'; };
E = preguntar(null, [V1], {});
elegir(E, /01\/10\/2026/, 'Ya está cargada en otra fila: no crear');
sacarDeCandidatas(E);
r = correr(E, false, [V1]);
ok(r.crear === 1 && macri01(E) === 1, 'APAGADO (el bug): sin candidatas, la elección no se mira y la reunión SE CREA');
E = preguntar(null, [V1], SI);
elegir(E, /01\/10\/2026/, 'Ya está cargada en otra fila: no crear');
sacarDeCandidatas(E);
r = correr(E, false, [V1]);
ok(r.crear === 0 && r.duplicadosAntes === 0 && r.yaCargadas === 1 && macri01(E) === 0, 'PRENDIDO: se busca la fila en toda la base: ya cargada, no se crea ni se pregunta');
// la fila elegida se BORRA: "ya cargada" no crea, y se vuelve a PREGUNTAR (16/10, revisor: si no, la reunión queda sin fila
// para siempre y en silencio); se anota una vez
const borrarBelgrano = function (X) { const i = filaBelgrano(X); X.D.v.splice(i, 1); X.D.bg.splice(i, 1); };
borrarBelgrano(E);
r = correr(E, false, [V1]);
ok(r.crear === 0 && r.eleccionesSinFila === 1 && lineas01(E).length === 1, 'la fila elegida se borró: no se crea y se vuelve a preguntar (sin fila ' + r.eleccionesSinFila + ', líneas ' + lineas01(E).length + ')');
r = correr(E, false, [V1]);
ok(cambiosTipo(E, 'eleccion_sin_fila').length === 1, 'REGISTRO_AGENDA_CAMBIOS "eleccion_sin_fila": una sola vez');
const es01 = function (r) { return /Macri/.test(r.join(' | ')) && r.some(function (x) { return x instanceof Date && x.getDate() === 1 && x.getMonth() === 9; }); };
let lc = lineaCopiaTodas(E, es01);
ok(lc.length && /duplicado: ver AGENDA_DUPLICADOS/.test(lc[0].estado), 'el archivo "Agenda" lo dice — ' + JSON.stringify(lc[0] && lc[0].estado));

// ============================== [4] el barrio de la fila elegida cambió (el id_fila cambia) ==============================

console.log('[4] el equipo corrige el Barrio de la fila elegida (id_fila figura + fecha + barrio cambia)');
const filasUna = [filasMacri[1]];    // sólo la de Belgrano el 29/09: figura + fecha la identifica
const cambiarBarrio = function (X) { X.D.v[filaBelgrano(X)][X.C('Barrio')] = 'Núñez'; };
E = montar(true, filasUna, {});
correr(E, false, [V1b]);
elegir(E, /01\/10\/2026/, 'Ya está cargada en otra fila: no crear');
const iN = E.D.v.findIndex(function (x) { return x[E.C('Barrio')] === 'Belgrano' && x[E.C('Figura')] === 'Jorge Macri'; });
cambiarBarrio(E);
r = correr(E, false, [V1b]);
l = lineas01(E);
ok(r.duplicadosAntes === 1 && l.length === 1 && l[0][0] === '', 'APAGADO (el bug): la línea vuelve con ELEGIR vacío (el id_fila ya no coincide)');
E = montar(true, filasUna, SI);
correr(E, false, [V1b]);
elegir(E, /01\/10\/2026/, 'Ya está cargada en otra fila: no crear');
cambiarBarrio(E);
r = correr(E, false, [V1b]);
ok(r.crear === 0 && r.duplicadosAntes === 0 && r.yaCargadas === 1 && /barrio cambió/.test((cambiosTipo(E, 'eleccion_aplicada')[0] || [])[5]),
   'PRENDIDO: la fila se encuentra por figura + fecha (única ese día): aplicada — ' + (cambiosTipo(E, 'eleccion_aplicada')[0] || [])[5]);
ok(iN > 0 && E.D.v[iN][E.C('Barrio')] === 'Núñez' && !E.D.v[iN][E.C('agenda_uid')], 'y la fila no se toca');
// 16/10 (revisor, ALTA): la fila parecida (misma figura y día, otro barrio) es de OTRA reunión de la agenda (tiene agenda_uid):
// no se toma; la elección se vuelve a preguntar y no se crea nada
E = montar(true, filasUna, SI);
correr(E, false, [V1b]);
elegir(E, /01\/10\/2026/, 'Ya está cargada en otra fila: no crear');
cambiarBarrio(E);
let filaNunez; E.D.v[filaNunez = E.D.v.findIndex(function (x) { return x[E.C('Barrio')] === 'Núñez' && x[E.C('Figura')] === 'Jorge Macri'; })][E.C('agenda_uid')] = 'c-otra-reunion';
r = correr(E, false, [V1b]);
ok(r.crear === 0 && r.yaCargadas === 0 && r.eleccionesSinFila === 1 && lineas01(E).length === 1,
   'PRENDIDO: la parecida es de otra reunión (agenda_uid): no se usa; se vuelve a preguntar y no se crea (sin fila ' + r.eleccionesSinFila + ')');

// ============================== [5] una línea pre-cargada de otra candidata pisaba la elección nueva ==============================

console.log('[5] dos candidatas: "No sé" en una (queda pre-cargada) y después "Ya está cargada" en la otra');
const dosLineas = function (cfg) {
  const X = montar(true, filasDos, cfg);
  correr(X, false, [V1]);
  ok(lineas01(X).length === 2, (cfg.AGENDA_ELECCIONES_SIEMPRE ? 'PRENDIDO' : 'APAGADO') + ': dos líneas (Núñez 30/09 y Colegiales 02/10)');
  elegir(X, /01\/10\/2026[^]*Colegiales/, 'No sé');
  correr(X, false, [V1]);
  const lc2 = lineas01(X).filter(function (x) { return /Colegiales/.test(x.join('|')); })[0];
  ok(lc2 && lc2[0] === 'No sé', 'la corrida siguiente muestra "No sé" pre-cargado en la de Colegiales');
  elegir(X, /01\/10\/2026[^]*Núñez/, 'Ya está cargada en otra fila: no crear');
  return X;
};
E = dosLineas({});
r = correr(E, false, [V1]);
ok(r.yaCargadas === 0 && lineas01(E).length === 2, 'APAGADO (el bug): la línea de Colegiales (más abajo) PISA la elección: vuelven las dos líneas');
ok(!E.ssI.hojas['ELECCIONES_AGENDA'].v.some(function (x) { return /cargada/.test(String(x[3])); }), 'APAGADO: y "Ya está cargada" ni siquiera se guardó');
E = dosLineas(SI);
r = correr(E, false, [V1]);
ok(r.yaCargadas === 1 && lineas01(E).length === 0, 'PRENDIDO: vale la elección nueva; no vuelve (la del 29/09 sigue preguntando: ' + r.duplicadosAntes + ')');
ok(E.ssI.hojas['ELECCIONES_AGENDA'].v.some(function (x) { return /cargada/.test(String(x[3])); }), 'PRENDIDO: y quedó guardada en ELECCIONES_AGENDA');

// ============================== [6] la semana sale del alcance ==============================

console.log('[6] la reunión sale del alcance (AGENDA_SOLO_SEMANA en otra semana): la elección se cierra, una vez');
E = montar(true, filasMacri, Object.assign({ AGENDA_SOLO_SEMANA: "'2026-10-12'" }, SI));
E.ssI.hojas['ELECCIONES_AGENDA'] = new E.Hoja('ELECCIONES_AGENDA', [E.run('ENC_ELECCIONES_AGENDA_'),
  [new D(2026, 9, 2, 10, 0), 'jorge macri|20261001|15:00', 'jorge macri|20260929|belgrano', 'Ya está cargada en otra fila: no crear', '', '', '']]);
r = correr(E, false, [V1]);
ok(r.eleccionesCerradas === 1 && lineas01(E).length === 0 && cambiosTipo(E, 'eleccion_cerrada').length === 1 &&
   /fuera del alcance/.test(cambiosTipo(E, 'eleccion_cerrada')[0][5]), 'cerrada: "' + (cambiosTipo(E, 'eleccion_cerrada')[0] || [])[5] + '"');
r = correr(E, false, [V1]);
ok(cambiosTipo(E, 'eleccion_cerrada').length === 1, 'la corrida siguiente no la vuelve a anotar');

// ============================== [7] "vincular" sobrevive igual ==============================

console.log('[7] "Es la misma: vincular" con la hora cambiada, y con la fila que ya no está');
E = preguntar(null, [V1], {});
elegir(E, /01\/10\/2026/, 'Es la misma: vincular');
r = correr(E, false, [V1, V2]);
ok(r.vincular === 0 && r.duplicadosAntes === 1, 'APAGADO (el bug): con la hora cambiada no se vincula y vuelve a preguntar');
E = preguntar(null, [V1], SI);
elegir(E, /01\/10\/2026/, 'Es la misma: vincular');
r = correr(E, false, [V1, V2]);
const iBv = filaBelgrano(E);
ok(r.vincular === 1 && r.duplicadosAntes === 0 && /^v-/.test(String(E.D.v[iBv][E.C('agenda_uid')])), 'PRENDIDO: se vincula la fila elegida');
r = correr(E, false, [V1, V2]);
ok(r.vincular === 0 && r.crear === 0 && r.duplicadosAntes === 0, 'y después sigue en esa fila (actualizar), sin preguntar');
E = preguntar(null, [V1], SI);
elegir(E, /01\/10\/2026/, 'Es la misma: vincular');
borrarBelgrano(E);
r = correr(E, false, [V1]);
l = lineas01(E);
ok(r.crear === 0 && macri01(E) === 0 && l.length === 1 && /ya no está/.test(l[0][2]) && E.ssD.hojas['AGENDA_DUPLICADOS'].validaciones >= 1,
   'la fila elegida se borró: NO se crea; se vuelve a preguntar diciéndolo — "' + (l[0] && l[0][2]) + '"');
elegir(E, /01\/10\/2026/, 'Son distintas: crear');
r = correr(E, false, [V1]);
ok(r.crear === 1 && macri01(E) === 1, 'y si eligen "Son distintas: crear", se crea');

// ============================== [8] la cancelación: "Sigue" y "Se canceló" con el id_fila corrido ==============================

console.log('[8] la pregunta de cancelación ("Sigue" / "Se canceló") sobrevive al cambio de barrio de la fila');
const ASUNTO_19 = 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 19/10 al 25/10';
const MUZ = ['*Martes 20/10*', 'Evento: Encuentro con Vecinos Clara Muzzio, Recoleta', 'Hora: 18:30h', 'Lugar: Av. Santa Fe 1234, Club Social'];
const SAB = ['*Miércoles 21/10*', 'Evento: Encuentro con Vecinos Ezequiel Sabor, Palermo', 'Hora: 11:00h', 'Lugar: Serrano 1500'];
const LOM = ['*Jueves 22/10*', 'Evento: Encuentro con Vecinos Hernán Lombardi, Belgrano', 'Hora: 18:00h', 'Lugar: Cabildo 2000'];
// la v2 (completa, no "Re:") saca a Muzzio y conserva 2 de 3 (más del 60%: no es una versión parcial)
const C1 = { fecha: new D(2026, 9, 12, 9, 0), asunto: ASUNTO_19, cuerpo: MUZ.concat(['']).concat(SAB).concat(['']).concat(LOM).join(NL), truncado: false };
const C2 = { fecha: new D(2026, 9, 14, 9, 0), asunto: ASUNTO_19, cuerpo: SAB.concat(['']).concat(LOM).join(NL), truncado: false };
const filaMuzzio = [function (r, C) {
  r[C('Figura')] = 'Clara Muzzio'; r[C('Barrio')] = 'Recoleta'; r[C('FECHA')] = new D(2026, 9, 20, 12); r[C('HORA')] = '18:30';
  r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = 'en agenda';
}];
const NOAUTO = { AGENDA_CANCELACION_AUTOMATICA: 'false' };
['Sigue', 'Se canceló: suspender/borrar'].forEach(function (texto) {
  [{}, SI].forEach(function (cfg) {
    const nom = (cfg.AGENDA_ELECCIONES_SIEMPRE ? 'PRENDIDO' : 'APAGADO') + ', "' + texto + '"';
    const X = montar(true, filaMuzzio, Object.assign({}, NOAUTO, cfg));
    correr(X, false, [C1]);
    let rr = correr(X, false, [C1, C2]);
    ok(rr.cancelaciones === 1, nom + ': se pregunta la cancelación');
    elegir(X, /cancelación/, texto);
    const iM = filasCon(X, 'Clara Muzzio', 20)[0];
    X.D.v[iM][X.C('Barrio')] = 'Palermo';           // el equipo corrige el barrio (cambia el id_fila)
    rr = correr(X, false, [C1, C2]);
    const st = X.D.v[iM][X.C('STATUS REUNIÓN')];
    if (cfg.AGENDA_ELECCIONES_SIEMPRE) {
      ok(rr.cancelaciones === 0 && (texto === 'Sigue' ? st === 'en agenda' && rr.cancelacionSigue === 1 : st === 'Suspendida'),
         nom + ': se aplica (STATUS "' + st + '"), no vuelve a preguntar');
    } else {
      ok(rr.cancelaciones === 1 && st === 'en agenda', nom + ' (el bug): vuelve a preguntar, no se aplica');
    }
  });
});

// ============================== [9] canceladas en el mail (la marca del parser) ==============================

console.log('[9] una reunión marcada como cancelada en el mail (ev.canceladaEnMail): no se crea ni se pregunta; la línea se cierra');
const marcar = function (X, re) {
  X.run('if (!this.__parseOrig) this.__parseOrig = agendaDesdeListaDeMails_;' +
        'agendaDesdeListaDeMails_ = function (l, o) { const r = __parseOrig(l, o); r.ultimas.concat(r.unicas).forEach(function (ev) {' +
        ' if (' + re + '.test(idReunionAgenda_(ev))) { ev.canceladaEnMail = true; ev.canceladaEnMailMotivo = "rojo en la v2 del 25/09"; } }); return r; };');
};
E = preguntar(null, [V1], {});
ok(lineas01(E).length === 1, 'sin la marca: se pregunta');
marcar(E, '/^jorge macri\\|20261001/');
const val0 = E.ssD.hojas['AGENDA_DUPLICADOS'].validaciones || 0;
r = correr(E, false, [V1]);
l = lineas01(E);
ok(r.crear === 0 && r.duplicadosAntes === 0 && r.canceladasMail === 1 && l.length === 1 && l[0][0] === '' &&
   l[0][2] === 'cancelada en el mail: no se crea (rojo en la v2 del 25/09)' && l[0][3] === 'cancelada en el mail',
   'con la marca: la línea queda CERRADA, sin ELEGIR — "' + (l[0] && l[0][2]) + '"');
ok((E.ssD.hojas['AGENDA_DUPLICADOS'].validaciones || 0) === val0, 'sin desplegable (no se agregó ninguna validación)');
r = correr(E, false, [V1]);
ok(cambiosTipo(E, 'cancelada_mail').length === 1, 'REGISTRO_AGENDA_CAMBIOS "cancelada_mail": una sola vez');
lc = lineaCopiaTodas(E, es01);
ok(lc.length && /cancelada en el mail/.test(lc[0].estado), 'el archivo "Agenda": "' + (lc[0] && lc[0].estado) + '"');
// sin filas parecidas: no se crea y no hay línea
E = montar(true, [], {});
marcar(E, '/^jorge macri\\|20261001/');
r = correr(E, false, [V1]);
ok(r.crear === 1 && macri01(E) === 0 && lineas01(E).length === 0, 'sin filas parecidas: la del 01/10 no se crea (sólo la del 29/09) y no hay línea');
E = montar(true, [], { AGENDA_CERRAR_CANCELADAS_MAIL: 'false' });
marcar(E, '/^jorge macri\\|20261001/');
r = correr(E, false, [V1]);
ok(r.crear === 2 && macri01(E) === 1, 'con AGENDA_CERRAR_CANCELADAS_MAIL = false la marca no cambia nada (se crea, como hoy)');

// ============================== [10] apagado: nada cambia ==============================

console.log('[10] AGENDA_CERRAR_CANCELADAS_MAIL prendido, sin la marca del parser: la base y AGENDA_DUPLICADOS quedan iguales que apagado');
const correrTodo = function (cfg) {
  const X = montar(true, filasMacri.concat(filasDos), cfg);
  correr(X, false, [V1]);
  elegir(X, /01\/10\/2026/, 'No sé');
  correr(X, false, [V1, V2]);
  return { D: foto(X.D), dup: JSON.stringify(dups(X)), cam: cambiosTipo(X, 'eleccion_aplicada').length + cambiosTipo(X, 'eleccion_cerrada').length };
};
const a = correrTodo({ AGENDA_CERRAR_CANCELADAS_MAIL: 'false' }), b = correrTodo({});
ok(a.D === b.D && a.dup === b.dup && a.cam === 0 && b.cam === 0, 'idénticos (sin la marca del parser, AGENDA_CERRAR_CANCELADAS_MAIL no hace nada)');

// ============================== [11] el paso 94 (sólo lectura) ==============================

console.log('[11] paso 94, diagnosticarEleccionesAgenda: el caso, el motivo, y no escribe nada');
E = preguntar(null, [V1], {});
elegir(E, /01\/10\/2026/, 'Ya está cargada en otra fila: no crear');
correr(E, false, [V1]);     // guardada en ELECCIONES_AGENDA
const todo = function (X) {
  return JSON.stringify(Object.keys(X.ssD.hojas).concat(Object.keys(X.ssI.hojas)).map(function (k) {
    const h = X.ssD.hojas[k] || X.ssI.hojas[k]; return [k, h.v, h.bg];
  }));
};
const antes = todo(E);
E.ctx.__mails = [V1, V2]; E.ctx.__geo = geocodificador(E);
const d94 = E.run('diagnosticarEleccionesAgenda({ mails: __mails, geocodificar: __geo })');
const lm = d94.elecciones.filter(function (x) { return /^jorge macri\|20261001/.test(x.id); })[0];
ok(lm && !lm.hoy.consumida && lm.hoy.motivo === 'el id_reunion cambió' && /15:30/.test(lm.hoy.texto) && lm.conArreglo.consumida,
   'Macri 01/10: hoy NO se consume ("' + (lm && lm.hoy.texto) + '"); con el arreglo sí ("' + (lm && lm.conArreglo.texto) + '")');
ok(d94.caso && d94.caso.guardadas.length === 1 && d94.caso.reuniones.length >= 1 && E.logs.some(function (x) { return /EL CASO: Jorge Macri 01\/10\/2026/.test(x); }),
   'el caso va primero en el log, con lo guardado y las reuniones del mail');
ok(todo(E) === antes, 'no escribió nada');
// la fila elegida deja de ser candidata: el motivo
E = preguntar(null, [V1], {});
elegir(E, /01\/10\/2026/, 'Ya está cargada en otra fila: no crear');
correr(E, false, [V1]);
sacarDeCandidatas(E);
E.ctx.__mails = [V1];
const d94b = E.run('diagnosticarEleccionesAgenda({ mails: __mails, geocodificar: __geo })');
const lmb = d94b.elecciones.filter(function (x) { return /^jorge macri\|20261001/.test(x.id); })[0];
ok(lmb && !lmb.hoy.consumida && /otra/.test(lmb.hoy.motivo) && /se crearía/.test(lmb.hoy.texto) && lmb.conArreglo.consumida,
   'sin la fila entre las candidatas: "' + (lmb && lmb.hoy.texto) + '" → con el arreglo: "' + (lmb && lmb.conArreglo.texto) + '"');

// la línea pre-cargada de otra candidata que pisa la elección nueva (el escenario [5], antes de la corrida)
E = dosLineas({});
const d94c = E.run('diagnosticarEleccionesAgenda({ mails: __mails, geocodificar: __geo })');
const lmc = d94c.elecciones.filter(function (x) { return /^jorge macri\|20261001/.test(x.id); })[0];
ok(d94c.pisadas === 1 && lmc && lmc.eleccion === 'no_se' && lmc.leidaDistinta && lmc.conArreglo.consumida,
   'dos candidatas: 1 línea pisada; hoy vale "No sé" (la pre-cargada), con el arreglo "Ya está cargada" y se aplica');

console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
