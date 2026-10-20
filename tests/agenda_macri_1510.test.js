/**
 * tests/agenda_macri_1510.test.js — 19/10 (prompt 08): el caso Macri 15/10 y "una reunión, una fila".
 *   [1] punto 3: una fila Suspendida y otra de la misma figura y fecha NO son "una reunión en dos filas" (ni el H3, ni "después de
 *       crear", ni la auditoría); dos filas NO suspendidas de la misma reunión se siguen detectando como hoy;
 *   [2] punto 2, la historia: la agenda crea la fila (Villa Santa Rita, A CONFIRMAR), la v3 la trae en ROJO, el equipo la pasa a
 *       Villa Devoto / Realizada con los asistentes de la otra reunión (la "824");
 *   [3] el paso 101 (en seco): el plan, (e) de qué reunión es cada cosa, la simulación de la próxima corrida completa (base de hoy
 *       contra la separada): nada fuera de las dos filas → LISTO y la huella; con un formulario de Villa Santa Rita → NO LISTO;
 *   [4] el paso 102 (real): exige la huella; la 824 queda del equipo sin la identidad del mail, la nueva al final (Suspendida, con
 *       el agenda_uid), las derivadas (la ID de cada una); el paso 38 no la deshace;
 *   [5] después: la agenda no toca ninguna de las dos (a, b), no hay pares ni H3 (c), RDV CONJUNTO va a cada una (d), la auditoría
 *       (g): la reunión del mail → la nueva, Suspendida, OK; la 824 → "fila del equipo fuera del mail: OK";
 *   [6] el paso 103: vuelve todo a como estaba.
 *
 *     node tests/agenda_macri_1510.test.js
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: mails, direcciones y números son inventados; los barrios y
 * comunas son los públicos de la Ciudad; las figuras, nombres de la columna Figura. "Hoy" es el lunes 19/10/2026.
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
                  '56_SepararReunion.js', '51_FormatoLectura.js', '47_AgendaVistas.js'];
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
const ETAPA1 = { DERIVADAS_POR_SCRIPT: 'true', AGENDA_SEGURIDAD_POR_COMUNA: 'true', AGENDA_BARRIO_DEL_MAIL: 'true', AGENDA_CREAR_SOLO_IDENTIFICADAS: 'true',
                 AGENDA_CONCILIACION_SEMANAL: 'true', AGENDA_INVARIANTE_UNA_FILA: 'true', AGENDA_VALIDAR_MAILS: 'true',
                 AGENDA_CANCELACION_AUTOMATICA: 'true', AGENDA_CANCELACION_MODO: "'suspender'", AGENDA_COLORES_MAIL: 'true',
                 AGENDA_ELECCIONES_SIEMPRE: 'true', CONJUNTO_REPETIDA_POR_UBICACION: 'true' };

function montar(config, conjunto) {
  const E = crearEntorno(Object.assign({}, ETAPA1, config || {}));
  const hdr = HDR.concat(COLUMNAS_AGENDA).concat(['ID cuentas', 'Fecha envío campañas']);
  const C = function (n) { return hdr.indexOf(n); };
  const filas = [hdr];
  FIGURAS.forEach(function (fig, i) {
    const r = hdr.map(function () { return ''; });
    r[C('Figura')] = fig; r[C('Barrio')] = BARRIOS[i][0]; r[C('FECHA')] = new D(2026, 8, 10 + i, 12); r[C('HORA')] = '18:00';
    r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = 'Realizada'; r[C('Inscriptos')] = 100 + i; r[C('Origen fila')] = 'equipo';
    filas.push(r);
  });
  const ssD = E.planilla(E.run('RDV_SS_DESTINO')), ssI = E.planilla(E.run('RDV_SS_INTERMEDIA'));
  ssD.hojas['RVD JM-CM - ES'] = new E.Hoja('RVD JM-CM - ES', filas);
  ssD.hojas['Comunas'] = new E.Hoja('Comunas', [['Barrio', 'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona', 'Eje geográfico']]
    .concat(BARRIOS.map(function (b) { return [b[0], b[1], 1000 + b[1], 1, 1, 1, 1, 'Centro', '']; })));
  ssD.hojas['RDV CONJUNTO'] = new E.Hoja('RDV CONJUNTO', [['Figura', 'Barrio', 'FECHA', 'Dirección', 'Asistentes', 'Oradores anotados', 'Oradores que hablaron', 'Estado']]
    .concat((conjunto || []).map(function (r) { return r.slice(); })));
  // B: sólo el encabezado (los nombres de hoy de COLUMNAS_B) y un formulario de otra reunión
  const cb = E.run('COLUMNAS_B');
  const hB = Object.keys(cb).map(function (k) { return cb[k][0]; });
  const fB = hB.map(function () { return 0; });
  fB[hB.indexOf(cb.nombre[0])] = 'CLARA MUZZIO - Encuentro con Vecinos - 10/9 Recoleta'; fB[hB.indexOf(cb.fechaFin[0])] = new D(2026, 8, 9, 12);
  fB[hB.indexOf(cb.inscriptos[0])] = 100;
  ssI.hojas['B'] = new E.Hoja('B', [hB, fB]);
  E.D = ssD.hojas['RVD JM-CM - ES']; E.ssI = ssI; E.ssD = ssD; E.C = C; E.hdr = hdr;
  return E;
}

const GEO = {};
function geocodificador() {
  return function (consulta) { return { consulta: consulta, estado: 'ZERO_RESULTS' }; };
}

let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }
function correr(E, enSeco, mails) {
  E.ctx.__mails = mails; E.ctx.__geo = geocodificador();
  return E.run('correrAgendaEnBloqueo_(' + enSeco + ', { mails: __mails, geocodificar: __geo })');
}
const celda = function (E, i, n) { return E.D.v[i][E.C(n)]; };
const filasDe = function (E, fig, d) {
  const out = [];
  for (let i = 1; i < E.D.v.length; i++) {
    const r = E.D.v[i], f = r[E.C('FECHA')];
    if (r[E.C('Figura')] === fig && f instanceof Date && f.getDate() === d && f.getMonth() === 9) out.push(i);
  }
  return out;
};
const hoja = function (E, n, enDestino) { return (enDestino ? E.ssD : E.ssI).hojas[n] || null; };
const dups = function (E) { const h = hoja(E, 'AGENDA_DUPLICADOS', true); return h ? h.v.slice(1).filter(function (r) { return r.some(function (x) { return x !== '' && x != null; }); }) : []; };
const pares = function (E) { return dups(E).filter(function (x) { return x[3] === 'una reunión en dos filas'; }); };
const fila = function (E, i) { return JSON.stringify(E.D.v[i].map(function (x) { return x instanceof Date ? x.getTime() : x; })); };

// ============================== los mails (inventados), con HTML ==============================

const ASUNTO_12 = 'Agenda Encuentros de vecinos con JM - Semana del 12/10 al 18/10';
const NL = String.fromCharCode(10);
let idMail = 0;
const ROJO = 'background-color:#ff0000';
const TODO_ROJO = { dia: ROJO, ev: ROJO, hora: ROJO, lugar: ROJO };
function mail(dia, hora, bloques, asunto, estilos) {
  const html = '<div dir="ltr">' + bloques.map(function (b, i) {
    const st = (estilos || [])[i] || {};
    return b.map(function (l, k) {
      const s = [st.dia, st.ev, st.hora, st.lugar][k];
      const t = l.replace(/^\*(.*)\*$/, '<b>$1</b>');
      return '<div>' + (s ? '<span style="' + s + '">' + t + '</span>' : t) + '</div>';
    }).join('') + '<br>';
  }).join('') + '</div>';
  return { fecha: new D(2026, 9, dia, hora, 0), asunto: asunto, cuerpo: [].concat.apply([], bloques).join(NL), truncado: false, html: html, id: 'm' + (++idMail) };
}
const MACRI = ['*Jueves 15/10*', 'Evento: Encuentro "1 a 1" Jorge Macri, Villa Santa Rita', 'Hora: 09:15h', 'Lugar: A CONFIRMAR (NO SE COMUNICA LA DIRECCIÓN)'];
const MUZZIO = ['*Miércoles 14/10*', 'Evento: Encuentro con Vecinos Clara Muzzio, Recoleta', 'Hora: 18:30h', 'Lugar: A CONFIRMAR'];
const V1 = mail(12, 9, [MUZZIO, MACRI], ASUNTO_12);
const V3 = mail(13, 10, [MUZZIO, MACRI], ASUNTO_12, [null, TODO_ROJO]);
const MAILS = [V1, V3];
// RDV CONJUNTO del 15/10: la de Villa Santa Rita, Cancelado (la "843"); la de Villa Devoto, Realizada, 31 asistentes (la "849")
const CONJ = [['Macri Jorge', 'Villa Santa Rita', new D(2026, 9, 15, 12), 'Bahía Blanca 4025', '', '', '', 'Cancelado'],
              ['Macri Jorge', 'Villa Devoto', new D(2026, 9, 15, 12), 'Bahía Blanca 4025', 31, 5, 3, 'Realizada']];

// ============================== [1] punto 3: una Suspendida y su reemplazo ==============================

console.log('[1] punto 3: una Suspendida y otra de la misma figura y fecha no son "una reunión en dos filas"');
let E = montar({}, CONJ);
const fx = function (fig, d, st, uid, barrio) { return { fila: 0, figura: fig, fecha: new D(2026, 9, d, 12), barrio: barrio || '', valores: null, st: st, uid: uid }; };
E.ctx.__f = function (lista) {
  const A = E.ctx.indicesAgenda_(E.hdr);
  return lista.map(function (x, k) {
    const v = E.hdr.map(function () { return ''; });
    v[E.C('Figura')] = x.figura; v[E.C('FECHA')] = x.fecha; v[E.C('STATUS REUNIÓN')] = x.st; v[E.C('agenda_uid')] = x.uid || ''; v[E.C('HORA')] = '09:15';
    return { fila: 100 + k, figura: x.figura, fecha: x.fecha, barrio: x.barrio, valores: v, A: A };
  });
};
E.ctx.__fl = [fx('Jorge Macri', 15, 'Suspendida', 'c-1', 'Villa Santa Rita'), fx('Jorge Macri', 15, 'Realizada', '', 'Villa Devoto')];
let r = E.run('(function () { const fs = __f(__fl); const A = indicesAgenda_(' + JSON.stringify(E.hdr) + '); return [esSuspendidaYReemplazoAgenda_(fs[0], fs[1], A), esSuspendidaYReemplazoAgenda_(fs[1], fs[0], A), reunionesRepetidasAgenda_(fs, A, null).length]; })()');
ok(r[0] === true && r[1] === true && r[2] === 0, 'Suspendida + Realizada de la misma figura y fecha: es "una suspendida y su reemplazo" (las dos direcciones) y el H3 no la cuenta — ' + JSON.stringify(r));
E.ctx.__fl = [fx('Jorge Macri', 15, 'en agenda', 'c-1'), fx('Jorge Macri', 15, 'en agenda', 'c-2')];
r = E.run('(function () { const fs = __f(__fl); const A = indicesAgenda_(' + JSON.stringify(E.hdr) + '); return [esSuspendidaYReemplazoAgenda_(fs[0], fs[1], A), reunionesRepetidasAgenda_(fs, A, function () { return 1; }).length]; })()');
ok(r[0] === false && r[1] === 1, 'dos filas NO suspendidas de la misma reunión: siguen siendo un par y el H3 las sigue viendo — ' + JSON.stringify(r));
E.ctx.__fl = [fx('Jorge Macri', 15, 'Suspendida', 'c-1'), fx('Jorge Macri', 16, 'Realizada', '')];
r = E.run('(function () { const fs = __f(__fl); return esSuspendidaYReemplazoAgenda_(fs[0], fs[1], indicesAgenda_(' + JSON.stringify(E.hdr) + ')); })()');
ok(r === false, 'otra fecha: no es "una suspendida y su reemplazo" (la regla es sólo la misma fecha)');
E.ctx.__fl = [fx('Jorge Macri', 15, 'Suspendida', 'c-1'), fx('Jorge Macri', 15, 'Suspendida', '')];
r = E.run('(function () { const fs = __f(__fl); return esSuspendidaYReemplazoAgenda_(fs[0], fs[1], indicesAgenda_(' + JSON.stringify(E.hdr) + ')); })()');
ok(r === false, 'las dos Suspendidas: no (hace falta una sola)');

// "después de crear": una fila de la agenda y una del equipo, la misma figura y fecha, las dos "en agenda" → par; si la del equipo
// pasa a Suspendida, el par desaparece
AHORA = new Date(2026, 9, 12, 9, 0, 0).getTime();
E = montar({}, CONJ);
correr(E, false, [V1]);
let iM = filasDe(E, 'Jorge Macri', 15);
ok(iM.length === 1 && /^c-/.test(celda(E, iM[0], 'agenda_uid')) && celda(E, iM[0], 'Barrio') === 'Villa Santa Rita', 'la v1 crea la fila de Macri 15/10 (Villa Santa Rita, por el barrio del mail)');
const eq = E.hdr.map(function () { return ''; });
eq[E.C('Figura')] = 'Jorge Macri'; eq[E.C('FECHA')] = new D(2026, 9, 15, 12); eq[E.C('HORA')] = '09:15'; eq[E.C('Barrio')] = 'Villa Devoto';
eq[E.C('EVENTO')] = 'Uno a uno'; eq[E.C('STATUS REUNIÓN')] = 'en agenda';
E.D.v.splice(iM[0], 0, eq); E.D.bg.splice(iM[0], 0, eq.map(function () { return null; }));   // la del equipo, arriba (como si estuviera antes)
avanzar(60);
correr(E, false, [V1]);
let P2 = pares(E);
ok(P2.length === 1 && /después de crear|una reunión en dos filas/.test(P2[0].join(' ')), 'dos filas NO suspendidas (agenda + equipo): "una reunión en dos filas", como hoy — ' + P2.length);
E.D.v[iM[0]][E.C('STATUS REUNIÓN')] = 'Suspendida';   // el equipo suspendió la suya: ahora es "una suspendida y su reemplazo"
avanzar(60);
correr(E, false, [V1]);
ok(pares(E).length === 0, 'la del equipo pasa a Suspendida: ya no es un par (no va a AGENDA_DUPLICADOS)');

// ============================== [2] la historia de la "824" ==============================

console.log('[2] la historia: la agenda crea Villa Santa Rita, la v3 la trae en rojo, el equipo la pasa a Villa Devoto / Realizada');
AHORA = new Date(2026, 9, 12, 9, 0, 0).getTime();
E = montar({}, CONJ);
correr(E, false, [V1]);
avanzar(25 * 60);   // 13/10 10:00
correr(E, false, MAILS);
iM = filasDe(E, 'Jorge Macri', 15);
const X = iM[0];
const uidX = celda(E, X, 'agenda_uid');
ok(iM.length === 1 && celda(E, X, 'STATUS REUNIÓN') === 'Suspendida', 'la v3 en rojo la suspende (antes de la reunión)');
// el equipo: Villa Devoto, Realizada, los asistentes y oradores de la 849, un formulario y un ID (todo de Villa Devoto)
[['Barrio', 'Villa Devoto'], ['STATUS REUNIÓN', 'Realizada'], ['Asistentes', 31], ['Oradores anotados', 5], ['Oradores que hablaron', 3],
 ['Inscriptos', 50], ['RDV_UID', 'rdv-824'], ['form_origen', 'JORGE MACRI - Encuentro "1 a 1" - 15/10 Villa Devoto'], ['form_clave', 'jorge macri 1 a 1 15 10 villa devoto|20261014'],
 ['form_score', 1], ['form_nivel', 'figura+fecha'], ['ID cuentas', '9999-OCTJMVD']].forEach(function (p) { E.D.v[X][E.C(p[0])] = p[1]; });
AHORA = new Date(2026, 9, 19, 12, 0, 0).getTime();
const antes = { filas: E.D.v.length, x: fila(E, X) };
r = correr(E, true, MAILS);
ok(r && !r.error, 'la agenda en seco con la "824" Realizada en Villa Devoto: corre');

// ============================== [3] el paso 101 (en seco) ==============================

console.log('[3] el paso 101 (en seco): el plan, (e), la simulación completa → LISTO');
const CASO = { fila: X + 1, agendaUid: uidX };
E.ctx.__opc = { caso: CASO, simulacion: { mails: MAILS, geocodificar: geocodificador(), listaIds: { registros: [] } } };
const s101 = E.run('separarReunionAgenda_enSeco(__opc)');
const L101 = E.logs.join('\n');
ok(s101 && !s101.error && s101.listo === true, 'LISTO — ' + JSON.stringify(s101 && (s101.error || s101.motivos)));
ok(E.D.v.length === antes.filas && fila(E, X) === antes.x, 'en seco no escribe nada');
ok(s101 && s101.plan.filaNueva === E.D.v.length + 1, 'la fila nueva va AL FINAL (' + (s101 && s101.plan.filaNueva) + ')');
ok(/formulario "JORGE MACRI - Encuentro "1 a 1" - 15\/10 Villa Devoto".*→ Villa Devoto/.test(L101), '(e) el formulario de la 824 es de Villa Devoto');
ok(/ID cuentas 9999-OCTJMVD \(no está en la lista\)/.test(L101), '(e) el ID: lo busca en la lista');
ok(/FUERA DE LO ESPERADO[\s\S]*nada: fuera de esas dos filas, la próxima corrida hace exactamente lo mismo/.test(L101), 'la simulación: nada fuera de las dos filas');
ok(/la reunión del mail .*Jorge Macri.* → fila \d+ \| en ROJO/.test(L101) && /no vincula, actualiza, concilia, suspende ni avisa nada de las dos filas/.test(L101),
   '(a, b, c) la reunión del mail → la fila nueva; la agenda no toca ninguna');
ok(/RDV CONJUNTO fila 3 \(Villa Devoto, Realizada, asistentes 31\) → fila \d+/.test(L101), '(d) RDV CONJUNTO de ese día, en el log');
ok(/\(f\) la ID derivada: fila \d+ "Jorge Macri - Villa Devoto - 15\/10\/2026" \| fila nueva \d+ "Jorge Macri - Villa Santa Rita - 15\/10\/2026"/.test(L101), '(f) la ID de cada una');
ok(E.props && JSON.parse(E.props.SEPARAR_REUNION_HUELLA_101).h === s101.huella, 'guardó la huella (con su hora: vence a las 2 h)');
// un formulario de Villa Santa Rita en la 824: NO LISTO (lo decide el usuario)
const F0 = E.D.v[X][E.C('form_origen')];
E.D.v[X][E.C('form_origen')] = 'JORGE MACRI - Encuentro "1 a 1" - 15/10 Villa Santa Rita';
const sMal = E.run('separarReunionAgenda_enSeco(__opc)');
ok(sMal && sMal.listo === false && sMal.motivos.some(function (m) { return /Villa Santa Rita/.test(m); }) && !E.props.SEPARAR_REUNION_HUELLA_101,
   'con un formulario de Villa Santa Rita en la 824: NO LISTO y sin huella — ' + JSON.stringify(sMal && sMal.motivos));
E.D.v[X][E.C('form_origen')] = F0;
const s101b = E.run('separarReunionAgenda_enSeco(__opc)');
ok(s101b.listo === true && s101b.huella === s101.huella, 'otra vez sin eso: LISTO, la misma huella');

// la simulación de verdad mira: un ID de la lista para la reunión del mail (planeada en Villa Santa Rita) y la 824 SIN ID →
// la próxima corrida lo escribiría en la fila nueva → NO LISTO (lo decide el usuario)
const ID0 = E.D.v[X][E.C('ID cuentas')];
E.D.v[X][E.C('ID cuentas')] = '';
E.ctx.__bloqueJM = [['grupo', '', '', '', '', ''], ['ID', 'Funcionario', 'Barrio / Comuna', 'Tipo', 'Fecha', 'Fecha de envío'],
                    ['4242-OCTJMVSR', 'Jorge Macri', 'Villa Santa Rita', '1 a 1', new D(2026, 9, 15, 12), new D(2026, 9, 13, 12)]];
const listaJM = E.run('({ registros: armarListaIds_(IDS_SOLAPA_JM, __bloqueJM, { tz: RDV_TZ }).registros })');
ok(listaJM.registros.length === 1, 'la lista de prueba: un registro (Macri 15/10, Villa Santa Rita)');
E.ctx.__opcId = { caso: CASO, simulacion: { mails: MAILS, geocodificar: geocodificador(), listaIds: listaJM } };
const sId = E.run('separarReunionAgenda_enSeco(__opcId)');
ok(sId && sId.listo === false && sId.motivos.some(function (m) { return /escribiría .* celdas en las filas/.test(m) && /ids ID cuentas/.test(m); }),
   'un ID que la próxima corrida pondría en la fila nueva: NO LISTO — ' + JSON.stringify(sId && sId.motivos));
E.D.v[X][E.C('ID cuentas')] = ID0;
// el plan de la agenda que simula 55_SimularCorrida.js es el MISMO que el de la agenda en seco (las mismas acciones)
E.ctx.__mm = MAILS; E.ctx.__gg = geocodificador();
const igual = E.run('(function () {' +
  ' const ent = entradasSimulacion_({ mails: __mm, geocodificar: __gg, listaIds: { registros: [] } });' +
  ' const S = simularCorridaHora_(ent.bloque, ent, { sinIds: true });' +
  ' const A = indicesAgenda_(ent.bloque[0]);' +
  ' const P = planAgenda_(leerDestino_(), agendaDesdeListaDeMails_(__mm, { fuente: "x", lista: __mm }), A, alcanceAgenda_(),' +
  '   { enSeco: true, historial: leerHistorialAgenda_(), elecciones: leerEleccionesAgenda_(), conjunto: leerConjuntoPorFecha_(), geocodificar: __gg });' +
  ' const t = function (Q) { return Q.acciones.map(function (a) { return a.tipo + ":" + a.escrituras.map(function (e) { return e.fila + "/" + e.col + "=" + String(e.valor); }).join(";"); }).join("|"); };' +
  ' return { sim: t(S.P), agenda: t(P), n: P.acciones.length }; })()');
ok(igual.sim === igual.agenda, 'la agenda simulada da exactamente las mismas acciones que el plan de la agenda (' + igual.n + ' acciones)');
const seco = E.run('correrAgendaEnBloqueo_(true, { mails: __mm, geocodificar: __gg })');
ok(seco && !seco.error, 'y la agenda en seco corre igual sobre la misma base');
// 19/10 (revisor, M2): dos simulaciones de la MISMA base, con una reunión nueva en el mail (la agenda la CREARÍA, con un agenda_uid
// aleatorio en cada una): nada "fuera de lo esperado"
const TAPIA = ['*Miércoles 21/10*', 'Evento: Encuentro con Vecinos Gabino Tapia, Núñez', 'Hora: 18:00h', 'Lugar: Av. Inventada 100, Club'];
E.ctx.__mm2 = MAILS.concat([mail(19, 9, [TAPIA], 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 19/10 al 25/10')]);
const m2 = E.run('(function () {' +
  ' const ent = entradasSimulacion_({ mails: __mm2, geocodificar: __gg, listaIds: { registros: [] } });' +
  ' const a = simularCorridaHora_(ent.bloque, ent), b = simularCorridaHora_(ent.bloque, ent);' +
  ' const c = compararSimulaciones_(a, b, {});' +
  ' return { crea: a.P.resumen.crear, sB: c.soloEnB.length, sA: c.soloEnA.length }; })()');
ok(m2.crea === 1 && m2.sB === 0 && m2.sA === 0, 'dos simulaciones iguales que CREAN una fila (uids aleatorios): ninguna diferencia — ' + JSON.stringify(m2));
// 19/10 (revisor, B2): una huella de más de 2 horas no vale
const sV = E.run('separarReunionAgenda_enSeco(__opc)');
ok(sV.listo === true, 'el 101: LISTO');
E.props.SEPARAR_REUNION_HUELLA_101 = JSON.stringify({ h: sV.huella, t: D.now() - 3 * 3600000 });
const sVieja = E.run('separarReunionAgenda({ caso: ' + JSON.stringify(CASO) + ' })');
ok(sVieja && /más de 2 horas/.test(sVieja.error || '') && E.D.v.length === antes.filas, 'la huella del 101 de hace 3 horas: el 102 no corre — ' + (sVieja && sVieja.error));
// 19/10 (revisor, M1): si la escritura falla a la mitad, se vuelve atrás (nunca dos filas con el mismo agenda_uid)
E.run('separarReunionAgenda_enSeco(__opc)');
E.run('var __escOrig = escribirAgendaLote_; var __n = 0; escribirAgendaLote_ = function (a, b, c) { if (++__n === 3) throw new Error("falla simulada"); return __escOrig(a, b, c); };');
const xFalla = fila(E, X);
const sF = E.run('separarReunionAgenda({ caso: ' + JSON.stringify(CASO) + ' })');
E.run('escribirAgendaLote_ = __escOrig;');
let conUid = 0; for (let i = 1; i < E.D.v.length; i++) if (E.D.v[i][E.C('agenda_uid')] === uidX) conUid++;
ok(sF && /falló a la mitad/.test(sF.error || '') && conUid === 1 && fila(E, X) === xFalla && E.D.v.length === antes.filas,
   'la escritura falla a la mitad: vuelve atrás (la 824 igual, sin fila nueva, un solo agenda_uid) — ' + (sF && sF.error));
ok(!E.props.SEPARAR_REUNION_CORRIDA_102, 'y no queda una separación para deshacer');

// el último seco dio NO LISTO (el ID): borró la huella; sin un seco LISTO, el 102 no corre
E.ctx.__opcR0 = { caso: CASO };
const sinSeco = E.run('separarReunionAgenda(__opcR0)');
ok(sinSeco && /primero hay que correr el paso 101/.test(sinSeco.error || '') && E.D.v.length === antes.filas, 'el último seco dio NO LISTO: el 102 se niega y no escribe nada');
const s101c = E.run('separarReunionAgenda_enSeco(__opc)');
ok(s101c.listo === true, 'el 101 otra vez (sin el ID en la lista): LISTO');

// ============================== [4] el paso 102 (real) ==============================

console.log('[4] el paso 102 (real)');
E.ctx.__opcR = { caso: CASO };
const s102 = E.run('separarReunionAgenda(__opcR)');
const N = E.D.v.length - 1;
ok(s102 && !s102.error && s102.corrida, 'escribió (corrida ' + (s102 && s102.corrida) + ') — ' + JSON.stringify(s102 && s102.error));
ok(celda(E, X, 'agenda_uid') === '' && celda(E, X, 'Origen fila') === 'equipo' && celda(E, X, 'Lugar (mail)') === '' && celda(E, X, 'agenda_hora_escrita') === '' &&
   celda(E, X, 'Barrio') === 'Villa Devoto' && celda(E, X, 'STATUS REUNIÓN') === 'Realizada' && celda(E, X, 'Asistentes') === 31 && celda(E, X, 'ID cuentas') === '9999-OCTJMVD' &&
   celda(E, X, 'RDV_UID') === 'rdv-824' && celda(E, X, 'Dirección') === 'A CONFIRMAR (NO SE COMUNICA LA DIRECCIÓN)',
   'la 824: sin la identidad del mail, del equipo, con TODOS sus datos (la dirección no cambia sin "con dirección")');
ok(celda(E, N, 'agenda_uid') === uidX && celda(E, N, 'Figura') === 'Jorge Macri' && celda(E, N, 'Barrio') === 'Villa Santa Rita' && celda(E, N, 'STATUS REUNIÓN') === 'Suspendida' &&
   celda(E, N, 'Origen fila') === 'sistema (agenda)' && celda(E, N, 'agenda_status_escrito') === 'Suspendida' && celda(E, N, 'Asistentes') === '' && celda(E, N, 'Inscriptos') === '' &&
   !celda(E, N, 'RDV_UID') && !celda(E, N, 'ID cuentas') &&/A CONFIRMAR/.test(celda(E, N, 'Dirección')) && celda(E, N, 'Lugar (mail)') === 'Villa Santa Rita',
   'la nueva, al final: la reunión del mail (Villa Santa Rita, Suspendida, el agenda_uid), sin datos de la otra reunión');
ok(celda(E, X, 'ID') === 'Jorge Macri - Villa Devoto - 15/10/2026' && celda(E, N, 'ID') === 'Jorge Macri - Villa Santa Rita - 15/10/2026', '(f) la ID derivada de cada una');
ok(E.D.bg[N][E.C('agenda_uid')] === '#CFE2F3' && E.D.bg[N][E.C('Figura')] === '#CFE2F3', 'lo escrito, en COLOR_SISTEMA');
const cam = hoja(E, 'REGISTRO_AGENDA_CAMBIOS').v;
ok(cam.some(function (x) { return x[0] === s102.corrida && x[1] === 'separada' && /separada del \d+ \(Macri 15\/10\)/.test(x[5]); }) &&
   cam.some(function (x) { return x[0] === s102.corrida && x[1] === 'suspendida_rojo' && x[8] === uidX; }), 'REGISTRO_AGENDA_CAMBIOS: "separada del 824 (Macri 15/10)" y la nota "suspendida_rojo"');
ok(!E.props.SEPARAR_REUNION_HUELLA_101, 'la huella se usa una vez');
const sinH = E.run('separarReunionAgenda(__opcR)');
ok(sinH && sinH.error, 'otra vez el 102: no corre (ya está separada / sin huella) — ' + (sinH && sinH.error));
r = E.run('deshacerAgenda(false, ' + JSON.stringify(s102.corrida) + ')');
ok(r && /separación/.test(r.error || ''), 'el paso 38 no deshace una separación (manda al 103)');

// ============================== [5] después ==============================

console.log('[5] después: la agenda, RDV CONJUNTO y la auditoría');
const xAntes = fila(E, X), nAntes = fila(E, N);
avanzar(60);
r = correr(E, false, MAILS);
ok(fila(E, X) === xAntes && fila(E, N) === nAntes, '(a, b) la agenda no toca la 824 ni la nueva');
ok(pares(E).length === 0 && r.invariante === 0, '(c) no hay "una reunión en dos filas" ni H3');
ok(!dups(E).some(function (x) { return /Macri/.test(x.join(' ')); }), 'nada de Macri en AGENDA_DUPLICADOS');
E.ctx.__dest = null;
r = E.run('(function () { const d = leerDestino_(); const a = cruzarAsistentes_(d, leerComunasMap_()); return { p2: a.parDe.get(2), p3: a.parDe.get(3), asis: a.porFila.get(' + (X + 1) + ') }; })()');
ok(r.p3 === X + 1 && r.p2 === N + 1 && r.asis && r.asis.asis === 31, '(d) RDV CONJUNTO: la de Villa Devoto → la 824 (31), la de Villa Santa Rita → la nueva — ' + JSON.stringify(r));
E.ctx.__aud = { mails: MAILS, geocodificar: geocodificador(), semanas: [{ nombre: 'pasada', desde: new D(2026, 9, 12, 12), hasta: new D(2026, 9, 18, 12) },
                                                                       { nombre: 'en curso', desde: new D(2026, 9, 19, 12), hasta: new D(2026, 9, 25, 12) }] };
const aud = E.run('auditoriaAgenda(__aud)');
const reu = (aud.reuniones || []).filter(function (x) { return x.figura === 'Jorge Macri'; })[0];
ok(reu && reu.resultado === 'OK' && reu.fila === N + 1, '(g) la reunión del mail del 15/10 → la fila nueva, OK — ' + JSON.stringify(reu));
// 20/10 (prompt 09, 6a: "manda el mail"): la fila del equipo fuera del mail ya no es OK: "fuera del mail: revisar" (sólo se muestra)
ok(aud.noOk.some(function (t) { return /^\[3\] .*FUERA DEL MAIL: revisar/.test(t) && /Jorge Macri/.test(t); }) &&
   !aud.noOk.some(function (t) { return /^\[[25]\]/.test(t) && /Jorge Macri/.test(t); }),
   '(g) la 824 separada: "fuera del mail: revisar" (sección 3); nada de Macri en las secciones 2 y 5 — ' +
   JSON.stringify(aud.noOk.filter(function (t) { return /Macri/.test(t); })));

// ============================== [6] el paso 103 ==============================

console.log('[6] el paso 103: deshacer');
r = E.run('deshacerSepararReunionAgenda(true)');
ok(r && !r.error && E.D.v.length === N + 1, 'en seco: dice qué haría, no toca nada');
r = E.run('deshacerSepararReunionAgenda(false)');
ok(r && !r.error && r.borradas === 1, 'real: la nueva se borra (es la última) — ' + JSON.stringify(r));
const xAhora = JSON.parse(fila(E, X)), xAntes0 = JSON.parse(antes.x);
const difs = E.hdr.filter(function (h, k) { return !E.run('esColumnaDerivada_(' + JSON.stringify(h) + ')') && JSON.stringify(xAhora[k]) !== JSON.stringify(xAntes0[k]); });
ok(E.D.v.length === antes.filas && !difs.length, 'la 824 vuelve a como estaba (fuera de las derivadas) — ' + JSON.stringify(difs));
r = E.run('deshacerSepararReunionAgenda(false)');
ok(r && r.error, 'deshacer dos veces: no hace nada');

console.log('');
console.log(fallas ? fallas + ' FALLA(S)' : 'Todo en verde.');
process.exit(fallas ? 1 : 0);
