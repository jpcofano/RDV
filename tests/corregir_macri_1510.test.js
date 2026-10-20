/**
 * tests/corregir_macri_1510.test.js — 20/10 (prompt 09, 6b): corregir la 824 (Macri 15/10) para que vuelva a ser la reunión del mail.
 *   [1] la historia (la agenda crea Villa Santa Rita; el equipo la pasa a Villa Devoto / Realizada con los asistentes de la 849; la 837 del 23/10);
 *   [2] c01 en seco: el plan, la simulación de la próxima corrida (nada fuera de la 824; RDV CONJUNTO no vuelve a escribir), LISTO y la huella;
 *       NO LISTO sin la de Villa Santa Rita en RDV CONJUNTO, con otros asistentes, o con la fila ya cambiada;
 *   [3] c02 real: exige la huella (y que no esté vencida); escribe sólo la 824; REGISTRO_AGENDA_CAMBIOS; el paso 38 no la deshace;
 *   [4] después: la agenda no la toca, RDV CONJUNTO no le pone asistentes; [5] deshacer.
 *
 *     node tests/corregir_macri_1510.test.js
 *
 * NO sube a Apps Script y NO tiene datos reales (mails, direcciones y números inventados).
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
                  '56_SepararReunion.js', '58_CorregirReunion.js', '51_FormatoLectura.js', '47_AgendaVistas.js'];
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

// ============================== [1] la historia de la "824" y la 837 ==============================

console.log('[1] la historia: la agenda crea Villa Santa Rita, la v3 la trae en rojo, el equipo la pasa a Villa Devoto / Realizada; la 837 (23/10)');
AHORA = new Date(2026, 9, 12, 9, 0, 0).getTime();
let E = montar({}, CONJ), r;
correr(E, false, [V1]);
avanzar(25 * 60);   // 13/10 10:00
correr(E, false, MAILS);
let iM = filasDe(E, 'Jorge Macri', 15);
const X = iM[0];
const uidX = celda(E, X, 'agenda_uid');
ok(iM.length === 1 && celda(E, X, 'STATUS REUNIÓN') === 'Suspendida', 'la v3 en rojo la suspende (antes de la reunión)');
// el equipo: Villa Devoto, Realizada, los asistentes y oradores de la 849; el formulario de Villa Santa Rita (176) se queda
[['Barrio', 'Villa Devoto'], ['STATUS REUNIÓN', 'Realizada'], ['Asistentes', 31], ['Oradores anotados', 5], ['Oradores que hablaron', 3],
 ['Inscriptos', 176], ['RDV_UID', 'rdv-824'], ['form_origen', 'JORGE MACRI - Encuentro "1 a 1" - Jueves 15/10 Villa Santa Rita'],
 ['form_clave', 'jorge macri 1 a 1 jueves 15 10 villa santa rita|20261014'], ['form_score', 1], ['form_nivel', 'figura+fecha'],
 ['ID cuentas', '9999-OCTJMVSR']].forEach(function (p) { E.D.v[X][E.C(p[0])] = p[1]; });
// la reprogramación: el mail de la semana del 19/10 trae a Macri el viernes 23/10 en Villa Santa Rita (la "837")
AHORA = new Date(2026, 9, 16, 10, 0, 0).getTime();
const ASUNTO_19 = 'Agenda Encuentros de vecinos con JM - Semana del 19/10 al 25/10';
const V19 = mail(16, 9, [['*Viernes 23/10*', 'Evento: Encuentro "1 a 1" Jorge Macri, Villa Santa Rita', 'Hora: 10:00h', 'Lugar: Bahía Blanca 4025']], ASUNTO_19);
const MAILS2 = MAILS.concat([V19]);
correr(E, false, MAILS2);
const i837 = filasDe(E, 'Jorge Macri', 23);
ok(i837.length === 1 && celda(E, i837[0], 'STATUS REUNIÓN') === 'en agenda', 'la agenda crea la del 23/10 (en agenda)');
const uid837 = celda(E, i837[0], 'agenda_uid');
AHORA = new Date(2026, 9, 20, 12, 0, 0).getTime();
const antes = { filas: E.D.v.length, x: fila(E, X), r837: fila(E, i837[0]), todo: JSON.stringify(E.D.v.map(function (f) { return f.map(function (x) { return x instanceof Date ? x.getTime() : x; }); })) };

// ============================== [2] c01 (en seco) ==============================

console.log('[2] c01 (en seco): el plan, la simulación completa → LISTO');
const CASO = { fila: X + 1, agendaUid: uidX, reprogramadaA: { fecha: '2026-10-23', barrio: 'Villa Santa Rita', uidPrefijo: uid837.slice(0, 10), fila: i837[0] + 1 } };
E.ctx.__opc = { caso: CASO, simulacion: { mails: MAILS2, geocodificar: geocodificador(), listaIds: { registros: [] } } };
const s1 = E.run('corregirReunion_enSeco(__opc)');
const L1 = E.logs.join('\n');
if (process.env.VER) console.log(L1);
ok(s1 && !s1.error && s1.listo === true, 'LISTO — ' + JSON.stringify(s1 && (s1.error || s1.motivos)));
ok(JSON.stringify(E.D.v.map(function (f) { return f.map(function (x) { return x instanceof Date ? x.getTime() : x; }); })) === antes.todo, 'en seco no escribe nada');
const cambios = s1 && s1.plan ? s1.plan.cambios.map(function (c) { return c.nombre + '=' + c.valor; }) : [];
ok(['Barrio=Villa Santa Rita', 'STATUS REUNIÓN=Reprogramada', 'agenda_status_escrito=Reprogramada', 'Asistentes=', 'Oradores anotados=', 'Oradores que hablaron=']
   .every(function (c) { return cambios.indexOf(c) >= 0; }), 'el plan: Barrio, STATUS (y su escrito) y los tres de RDV CONJUNTO vaciados — ' + JSON.stringify(cambios));
ok(!cambios.some(function (c) { return /^(Inscriptos|form_|RDV_UID|agenda_uid|ID cuentas)/.test(c); }), 'el plan no toca el formulario, los inscriptos, los uid ni el ID');
ok(/Asistentes: base "31" \| RDV CONJUNTO fila 3 "31" → igual/.test(L1), '(1) los asistentes son los de RDV CONJUNTO Villa Devoto');
ok(/FUERA DE LO ESPERADO[\s\S]*nada: fuera de esa fila, la próxima corrida hace exactamente lo mismo/.test(L1), 'la simulación: nada fuera de la 824');
ok(/la ID derivada: "Jorge Macri - Villa Santa Rita - 15\/10\/2026"/.test(L1), 'la ID derivada nueva');
ok(/la agenda no la toca ni avisa/.test(L1), 'la agenda no la toca ni avisa');
ok(E.props && JSON.parse(E.props.CORREGIR_REUNION_HUELLA_C01).h === s1.huella, 'guardó la huella');

// NO LISTO: si RDV CONJUNTO no tuviera la de Villa Santa Rita "Cancelado", el cruce volvería a poner los 31 en la 824
E.ssD.hojas['RDV CONJUNTO'].v.splice(1, 1);
const sMal = E.run('corregirReunion_enSeco(__opc)');
ok(sMal && sMal.listo === false && sMal.motivos.some(function (m) { return /volvería a escribir/.test(m) && /Asistentes/.test(m); }) && !E.props.CORREGIR_REUNION_HUELLA_C01,
   'sin la de Villa Santa Rita en RDV CONJUNTO: la próxima corrida volvería a escribir los asistentes → NO LISTO, sin huella — ' + JSON.stringify(sMal && sMal.motivos));
E.ssD.hojas['RDV CONJUNTO'].v.splice(1, 0, CONJ[0].slice());
// NO LISTO: los asistentes de la fila no son los de RDV CONJUNTO Villa Devoto
E.D.v[X][E.C('Asistentes')] = 40;
const sMal2 = E.run('corregirReunion_enSeco(__opc)');
ok(sMal2 && sMal2.listo === false && sMal2.motivos.some(function (m) { return /no es el de RDV CONJUNTO/.test(m); }), 'asistentes que no son los de la 849: NO LISTO');
E.D.v[X][E.C('Asistentes')] = 31;
// la fila ya corregida (o cambiada): no se puede
E.D.v[X][E.C('Barrio')] = 'Villa Santa Rita';
const sMal3 = E.run('corregirReunion_enSeco(__opc)');
ok(sMal3 && sMal3.error && /no es la esperada/.test(sMal3.error), 'con otro Barrio: "no es la esperada" — ' + (sMal3 && sMal3.error));
E.D.v[X][E.C('Barrio')] = 'Villa Devoto';

// ============================== [3] c02 (real) ==============================

console.log('[3] c02 (real): exige la huella');
r = E.run('corregirReunion(__opc)');
ok(r && r.error && /primero hay que correr el c01/.test(r.error) && fila(E, X) === antes.x, 'sin la huella: no escribe nada');
const s1b = E.run('corregirReunion_enSeco(__opc)');
ok(s1b.listo === true && s1b.huella === s1.huella, 'otra vez el c01: LISTO, la misma huella');
E.props.CORREGIR_REUNION_HUELLA_C01 = JSON.stringify({ h: s1b.huella, t: D.now() - 3 * 3600000 });
r = E.run('corregirReunion(__opc)');
ok(r && r.error && /más de 2 horas/.test(r.error), 'con la huella vencida: no escribe');
E.run('corregirReunion_enSeco(__opc)');
r = E.run('corregirReunion(__opc)');
ok(r && !r.error && r.celdas >= 6, 'real: escribe — ' + JSON.stringify(r && (r.error || r.celdas)));
ok(celda(E, X, 'Barrio') === 'Villa Santa Rita' && celda(E, X, 'STATUS REUNIÓN') === 'Reprogramada' && celda(E, X, 'Asistentes') === '' &&
   celda(E, X, 'Oradores anotados') === '' && celda(E, X, 'Oradores que hablaron') === '' && celda(E, X, 'agenda_status_escrito') === 'Reprogramada',
   'la 824: Villa Santa Rita, Reprogramada, sin asistentes ni oradores');
ok(celda(E, X, 'Inscriptos') === 176 && celda(E, X, 'RDV_UID') === 'rdv-824' && celda(E, X, 'agenda_uid') === uidX && celda(E, X, 'ID cuentas') === '9999-OCTJMVSR' &&
   /Villa Santa Rita/.test(celda(E, X, 'form_origen')), 'se queda el formulario, los inscriptos, los uid y el ID');
ok(celda(E, X, 'ID') === 'Jorge Macri - Villa Santa Rita - 15/10/2026', 'la ID derivada: ' + celda(E, X, 'ID'));
ok(E.D.bg[X][E.C('Barrio')] === E.run('COLOR_SISTEMA') && E.D.bg[X][E.C('Asistentes')] == null, 'el color: lo escrito en COLOR_SISTEMA, lo vaciado sin fondo');
ok(fila(E, i837[0]) === antes.r837, 'la 837 no se toca');
const camb = hoja(E, 'REGISTRO_AGENDA_CAMBIOS') ? hoja(E, 'REGISTRO_AGENDA_CAMBIOS').v : [];
ok(camb.some(function (x) { return x[0] === r.corrida && x[1] === 'reprogramada' && /reprogramada al 23\/10\/2026 \(fila \d+, agenda_uid /.test(x[5]); }),
   'REGISTRO_AGENDA_CAMBIOS: "reprogramada al 23/10/2026 (fila 837, agenda_uid …)"');
ok(!E.props.CORREGIR_REUNION_HUELLA_C01 && E.props.CORREGIR_REUNION_CORRIDA_C02 === r.corrida, 'la huella sirve una vez; queda la corrida para deshacer');
const r2 = E.run('deshacerAgenda(false, ' + JSON.stringify(r.corrida) + ')');
ok(r2 && r2.deshecho === 0 && /corrección/.test(r2.error || ''), 'el paso 38 no la deshace — ' + JSON.stringify(r2));

// ============================== [4] después: la corrida de la hora no la toca ==============================

console.log('[4] después: la agenda, el cruce y la auditoría');
const xDespues = fila(E, X);
avanzar(60);
correr(E, false, MAILS2);
ok(fila(E, X) === xDespues, 'la agenda no toca la 824 (Reprogramada: cancelación ya reflejada)');
ok(fila(E, i837[0]) === antes.r837 || celda(E, i837[0], 'STATUS REUNIÓN') === 'en agenda', 'la 837 sigue en agenda');
E.ctx.__d = null;
r = E.run('(function () { const dest = leerDestino_(); const a = cruzarAsistentes_(dest, leerComunasMap_()); ' +
          'const p = a.porFila.get(' + (X + 1) + '); return { asis: p ? p.asis : null, de: p ? p.filaConjunto : null }; })()');
ok(!r || r.asis === null || r.asis === '' || r.asis === 0, 'RDV CONJUNTO: la 824 toma la de Villa Santa Rita (Cancelado, sin asistentes) o ninguna — ' + JSON.stringify(r));

// ============================== [5] deshacer ==============================

console.log('[5] deshacer');
r = E.run('deshacerCorregirReunion(true)');
ok(r && !r.error && r.celdas >= 6 && fila(E, X) === xDespues, 'en seco: dice qué haría, no toca nada');
r = E.run('deshacerCorregirReunion(false)');
ok(r && !r.error && r.saltadas === 0, 'real — ' + JSON.stringify(r));
const xAhora = JSON.parse(fila(E, X)), xAntes0 = JSON.parse(antes.x);
const difs = E.hdr.filter(function (h, k) { return !E.run('esColumnaDerivada_(' + JSON.stringify(h) + ')') && JSON.stringify(xAhora[k]) !== JSON.stringify(xAntes0[k]); });
ok(!difs.length, 'la 824 vuelve a como estaba (fuera de las derivadas) — ' + JSON.stringify(difs));
r = E.run('deshacerCorregirReunion(false)');
ok(r && r.error, 'deshacer dos veces: no hace nada');

console.log('');
console.log(fallas ? fallas + ' FALLA(S)' : 'Todo en verde.');
process.exit(fallas ? 1 : 0);
