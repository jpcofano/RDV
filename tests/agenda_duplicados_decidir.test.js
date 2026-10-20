/**
 * tests/agenda_duplicados_decidir.test.js — 16/10: AGENDA_DUPLICADOS = SÓLO lo que el equipo tiene que DECIDIR.
 *   [1] lo informativo (la semana frenada, la cancelación aplicada, la cancelada en el mail) sale de AGENDA_DUPLICADOS y va a
 *       AGENDA_PENDIENTES (intermedia, con "tipo") y al aviso diario agenda_info (UNA vez por cosa, un mail por día);
 *   [2] la medición en seco de la fusión automática (fusionAutomaticaAgenda_enSeco, paso 99);
 *   [3] AGENDA_FUSION_AUTOMATICA prendido: lo que aceptan las reglas del paso 97 se junta solo, con registro y deshacer;
 *   [4] ELEGIR "Quedarse con la fila X" (la otra es de la agenda: se junta y se borra como BORRADA POR EL EQUIPO; deshacer);
 *   [5] ELEGIR "Son reuniones distintas" (el H3 la ignora; el paso 16 la cuenta aparte; la semana no se frena);
 *   [6] la otra es una fila del EQUIPO: nunca se borra ("borrarla a mano"); quedarse con la del equipo junta la de la agenda en ella;
 *   [7] c) los pares 832/838 y 834/839 ya juntados por el paso 97: las líneas viejas desaparecen y no se recrea nada.
 *
 *     node tests/agenda_duplicados_decidir.test.js
 *
 * El mock y el escenario (el bug 832/838: dos Seguridad del 22/10) son los de tests/agenda_fusion.test.js. Mails SINTÉTICOS, sin datos
 * reales. "Hoy" es el viernes 16/10/2026; el reloj avanza entre corridas.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', '05_Escritura.js', '20_UpsertDestino.js', '49_Corridas.js',
                  '41_AgendaColores.js', '41_AgendaParser.js', '42_BarriosCabaGeo.js', '40_Agenda.js', 'diagnostico/17_peso_intermedia.js',
                  'diagnostico/08_verificar_escritura.js', 'diagnostico/03_muestras_mail.js', 'diagnostico/16_agenda_medicion.js',
                  'diagnostico/19_direccion_conjunto.js', 'diagnostico/21_ubicacion.js', '25_Elecciones.js',
                  'diagnostico/22_previsualizar.js', 'diagnostico/30_duplicados_agenda.js', '54_FusionAgenda.js', '50_Avisos.js',
                  'diagnostico/29_auditoria_agenda.js'];
let AHORA = new Date(2026, 9, 16, 9, 0, 0).getTime();
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

function montar(config) {
  const E = crearEntorno(config);
  const hdr = HDR.concat(COLUMNAS_AGENDA).concat(['ID cuentas', 'Fecha envío campañas']);
  const C = function (n) { return hdr.indexOf(n); };
  const filas = [hdr];
  FIGURAS.forEach(function (fig, i) {
    const r = hdr.map(function () { return ''; });
    r[C('Figura')] = fig; r[C('Barrio')] = BARRIOS[i][0]; r[C('FECHA')] = new D(2026, 8, 10 + i, 12); r[C('HORA')] = '18:00';
    r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = 'Realizada'; r[C('Inscriptos')] = 100 + i;
    filas.push(r);
  });
  const ssD = E.planilla(E.run('RDV_SS_DESTINO')), ssI = E.planilla(E.run('RDV_SS_INTERMEDIA'));
  ssD.hojas['RVD JM-CM - ES'] = new E.Hoja('RVD JM-CM - ES', filas);
  ssD.hojas['Comunas'] = new E.Hoja('Comunas', [['Barrio', 'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona', 'Eje geográfico']]
    .concat(BARRIOS.map(function (b) { return [b[0], b[1], 1, 1, 1, 1, 1, 'Centro', '']; })));
  ssD.hojas['RDV CONJUNTO'] = new E.Hoja('RDV CONJUNTO', [['Figura', 'Barrio', 'FECHA', 'Asistentes', 'Oradores anotados', 'Oradores que hablaron']]);
  E.D = ssD.hojas['RVD JM-CM - ES']; E.ssI = ssI; E.ssD = ssD; E.C = C; E.hdr = hdr;
  return E;
}
/** Otro entorno (otra configuración) sobre LAS MISMAS planillas: el destino, la intermedia (registros) y AGENDA_DUPLICADOS. */
function sobre(X, config) {
  const E = montar(config);
  E.D.v = X.D.v; E.D.bg = X.D.bg; E.D.nf = X.D.nf; E.ssI.hojas = X.ssI.hojas;
  E.ssD.hojas['AGENDA_DUPLICADOS'] = X.ssD.hojas['AGENDA_DUPLICADOS'];
  E.ssD.hojas['RDV CONJUNTO'] = X.ssD.hojas['RDV CONJUNTO'];
  E.D = X.D;
  E.ssD.hojas['RVD JM-CM - ES'] = X.D;
  return E;
}

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
  const tabla = { 'Av. Inventada 4977': 'Villa Urquiza', 'Av. Ficticia 55': 'Palermo' };
  Object.keys(tabla).forEach(function (k) { GEO[k] = puntoDe(E, tabla[k]); });
  return function (consulta) {
    const k = Object.keys(tabla).filter(function (x) { return consulta.indexOf(x) === 0; })[0];
    return k ? { consulta: consulta, estado: 'OK', lat: GEO[k].lat, lng: GEO[k].lng, tipo: 'ROOFTOP', parcial: false } : { consulta: consulta, estado: 'ZERO_RESULTS' };
  };
}

let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }
function correr(E, enSeco, mails) {
  E.ctx.__mails = mails; E.ctx.__geo = geocodificador(E);
  return E.run('correrAgendaEnBloqueo_(' + enSeco + ', { mails: __mails, geocodificar: __geo })');
}
const foto = function (h) { return JSON.stringify({ v: h.v, bg: h.bg }); };
const celda = function (E, i, n) { return E.D.v[i][E.C(n)]; };
const fondo = function (E, i, n) { return E.D.bg[i][E.C(n)]; };
const SIS = '#CFE2F3';
const deLaComuna = function (E, lugar) {
  const out = [];
  for (let i = 1; i < E.D.v.length; i++) {
    const rr = E.D.v[i], f = rr[E.C('FECHA')];
    if (rr[E.C('Lugar (mail)')] === lugar && f instanceof Date && f.getDate() === 22 && f.getMonth() === 9) out.push(i);
  }
  return out;
};
const cambios = function (E) {
  const h = E.ssI.hojas['REGISTRO_AGENDA_CAMBIOS'];
  return h ? h.v.slice(1) : [];
};

// ============================== los mails (inventados) ==============================

const ASUNTO_19 = 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 19/10 al 25/10';
const NL = String.fromCharCode(10);
function mail(dia, hora, bloques) {
  return { fecha: new D(2026, 9, dia, hora, 0), asunto: ASUNTO_19, cuerpo: [].concat.apply([], bloques).join(NL), truncado: false };
}
const SEG = function (comuna, lugar) { return ['*Jueves 22/10*', 'Evento: Seguridad en tu Barrio, Comuna ' + comuna, 'Hora: 17:15h', 'Lugar: ' + lugar]; };
const V1 = mail(15, 8, [SEG(12, 'A CONFIRMAR'), SEG(14, 'A CONFIRMAR')]);
const V3 = mail(16, 11, [SEG(12, 'Av. Inventada 4977, Club Social'), SEG(14, 'Av. Ficticia 55, Sede Vecinal')]);
const ETAPA1 = { AGENDA_SEGURIDAD_POR_COMUNA: 'true', AGENDA_BARRIO_DEL_MAIL: 'true', AGENDA_CREAR_SOLO_IDENTIFICADAS: 'true',
                 AGENDA_CONCILIACION_SEMANAL: 'true', AGENDA_INVARIANTE_UNA_FILA: 'true', AGENDA_VALIDAR_MAILS: 'true',
                 AGENDA_CANCELACION_AUTOMATICA: 'true', AGENDA_CANCELACION_MODO: "'suspender'", AGENDA_COLORES_MAIL: 'true',
                 AGENDA_ELECCIONES_SIEMPRE: 'true', CONJUNTO_REPETIDA_POR_UBICACION: 'true' };

/**
 * El bug, reproducido: la v1 crea las dos Seguridad "A CONFIRMAR" (las "832" y "834"); RDV CONJUNTO les completa la Figura; el
 * equipo carga algo en ellas; la v3 (con la regla de ANTES) crea las dos nuevas ("838" y "839"), que también reciben la Figura y
 * algún dato del sistema (un formulario, un ID).
 */
function escenario(conflicto) {
  AHORA = new Date(2026, 9, 15, 9, 0, 0).getTime();
  const X = montar({});
  correr(X, false, [V1]);
  const a = deLaComuna(X, 'Comuna 12')[0], b = deLaComuna(X, 'Comuna 14')[0];
  X.D.v[a][X.C('Figura')] = 'Gabino Tapia';          // RDV CONJUNTO (la agenda lo escribe por su excepción: acá, a mano)
  X.D.v[b][X.C('Figura')] = 'Laura Alonso';
  X.D.v[a][X.C('Observaciones')] = 'nota del equipo'; X.D.bg[a][X.C('Observaciones')] = '#FFF2CC';
  X.D.v[b][X.C('Dirección')] = 'Sede a definir';      // el equipo cambió la dirección (la traza sigue "A CONFIRMAR")
  if (conflicto) X.D.v[a][X.C('Inscriptos')] = 40;
  avanzar(26 * 60 + 41);                             // 16/10 11:41
  const r3 = correr(X, false, [V1, V3]);
  const n12 = deLaComuna(X, 'Comuna 12').filter(function (i) { return i !== a; })[0];
  const n14 = deLaComuna(X, 'Comuna 14').filter(function (i) { return i !== b; })[0];
  X.D.v[n12][X.C('Figura')] = 'Gabino Tapia';
  X.D.v[n14][X.C('Figura')] = 'Laura Alonso';
  // datos del sistema en la nueva (por la regla general: COLOR_SISTEMA) y uno del equipo con su color
  [['Inscriptos', 57], ['ID cuentas', '3735-SEGTEST'], ['RDV_UID', 'rdv-uid-prueba-1'], ['form_origen', 'Seguridad - Comuna 12 - 22/10'],
   ['form_clave', 'seguridad comuna 12 22 10|20261021']].forEach(function (p) { X.D.v[n12][X.C(p[0])] = p[1]; X.D.bg[n12][X.C(p[0])] = SIS; });
  X.D.v[n12][X.C('Temas mas comentados')] = 'tema del equipo'; X.D.bg[n12][X.C('Temas mas comentados')] = '#FFFF00';
  avanzar(30);
  return { X: X, a: a, b: b, n12: n12, n14: n14, r3: r3 };
}


// ============================== utilidades de este test ==============================

const FILAS = function (S) {
  return [[S.a + 1, S.n12 + 1, { figura: 'Gabino Tapia', fecha: '2026-10-22', lugar: 'Comuna 12' }],
          [S.b + 1, S.n14 + 1, { figura: 'Laura Alonso', fecha: '2026-10-22', lugar: 'Comuna 14' }]];
};
const AVISOS_ON = { AVISOS_MAIL_ACTIVO: 'true' };
const conf = function (extra) { return Object.assign({}, ETAPA1, AVISOS_ON, extra || {}); };
const hoja = function (E, n, enDestino) { return (enDestino ? E.ssD : E.ssI).hojas[n] || null; };
const dups = function (E) { const h = hoja(E, 'AGENDA_DUPLICADOS', true); return h ? h.v.slice(1).filter(function (r) { return r.some(function (x) { return x !== '' && x != null; }); }) : []; };
const pares = function (E) { return dups(E).filter(function (x) { return x[3] === 'una reunión en dos filas'; }); };
const pend = function (E, tipo) { const h = hoja(E, 'AGENDA_PENDIENTES'); return h ? h.v.slice(1).filter(function (x) { return !tipo || x[0] === tipo; }) : []; };
const filasDe = function (x) { return (String(x[5]).match(/\d+/g) || []).map(Number); };
const elegir = function (E, par, texto) {
  const h = hoja(E, 'AGENDA_DUPLICADOS', true);
  for (let i = 1; i < h.v.length; i++) if (h.v[i][14] === par[14]) { h.v[i][0] = texto; return true; }
  return false;
};
const parDe = function (E, fila) { return pares(E).filter(function (x) { return filasDe(x).indexOf(fila) >= 0; })[0]; };
const paso66 = function (E) {
  return E.run('(function () { var C = { cuentas: {}, noOk: [] }; _pendientesDuplicadosAudAg_(C); return C.cuentas["DUPLICADOS PENDIENTES"]; })()');
};
// la corrida de la hora, con su registro (49_Corridas.js): los avisos se mandan al cerrarla, como en Apps Script
const correrHora = function (E, mails) { E.run('corridaIniciar_(new Date(), false, false)'); const r = correr(E, false, mails); E.run('corridaCerrar_(null)'); return r; };
const infoAvisos = function (E) { const h = hoja(E, 'AVISOS_AGENDA_INFO'); return h ? h.v.slice(1).filter(function (x) { return x[1]; }) : []; };

// ============================== [1] lo informativo sale de AGENDA_DUPLICADOS ==============================

console.log('[1] AGENDA_DUPLICADOS = SÓLO lo que se decide; lo informativo va a AGENDA_PENDIENTES y al aviso diario (fusión automática APAGADA)');
let S = escenario(true);                       // C12: datos distintos en las dos (no se puede juntar sola); C14: se podría
let E = sobre(S.X, conf());
ok(E.run('AGENDA_FUSION_AUTOMATICA') === false, 'AGENDA_FUSION_AUTOMATICA está APAGADO en 00_Config.js');
let nFilas = S.X.D.v.length;
let r = correrHora(E, [V1, V3]);
ok(r && !r.error && S.X.D.v.length === nFilas && r.invariante === 2, 'la corrida de la hora: no junta nada (apagado), el H3 ve los dos pares — ' + JSON.stringify({ inv: r.invariante, n: S.X.D.v.length - nFilas }));
let P2 = pares(E);
ok(P2.length === 2 && P2.every(function (x) { return x[0] === '' && /^no se juntó sola: elegir/.test(x[2]) && /^dos_filas\|/.test(x[14]); }),
   'AGENDA_DUPLICADOS: UNA línea por par ("una reunión en dos filas"), que pide ELEGIR — ' + JSON.stringify(P2.map(function (x) { return x[2]; })));
ok(!dups(E).some(function (x) { return /informativo|aplicado|cancelada en el mail/.test(x[2]); }), 'y NADA informativo en AGENDA_DUPLICADOS');
const l12 = parDe(E, S.a + 1), l14 = parDe(E, S.b + 1);
ok(l12 && filasDe(l12).join(',') === [S.a + 1, S.n12 + 1].join(',') && l14 && filasDe(l14).join(',') === [S.b + 1, S.n14 + 1].join(','), 'cada línea nombra las dos filas del par');
ok(/El sistema no las junta solo: .*Inscriptos/.test(l12[13]) && /Sugerencia: quedarse con la fila \d+/.test(l14[13]) && /fusión automática prendida/.test(l14[13]),
   '"qué hacer": C12 dice por qué no se junta sola (Inscriptos); C14, la sugerencia (con la fusión automática se juntaría sola)');
ok(/^\d+=uid:c-\S+ # \d+=uid:c-\S+$/.test(l12[15]), 'la identidad de cada fila (agenda_uid), en la columna oculta id_fila — ' + l12[15]);
ok(JSON.stringify(hoja(E, 'AGENDA_DUPLICADOS', true).opciones) === JSON.stringify(['Quedarse con la fila ' + filasDe(P2[1])[0], 'Quedarse con la fila ' + filasDe(P2[1])[1], 'Son reuniones distintas']),
   'ELEGIR: exactamente "Quedarse con la fila X" / "Quedarse con la fila Y" / "Son reuniones distintas" — ' + JSON.stringify(hoja(E, 'AGENDA_DUPLICADOS', true).opciones));
const fr = pend(E, 'semana frenada: una reunión en dos filas');
ok(fr.length === 2 && fr.every(function (x) { return /no crea ninguna reunión nueva/.test(x[8]) && /AGENDA_DUPLICADOS/.test(x[9]) && /^semana_frenada\|/.test(x[11]) && x[10] instanceof Date; }),
   'AGENDA_PENDIENTES (intermedia): las dos "semana frenada", con qué pasa / qué sigue / desde / id');
ok(hoja(E, 'AGENDA_PENDIENTES').v[0].join('|') === 'tipo|reunión|semana|grupo|fecha|hora|lugar|fila|qué pasa|qué sigue|desde|id|no va', 'AGENDA_PENDIENTES: las columnas nuevas, "tipo" primero (20/10: y "no va" al final)');
ok(paso66(E) === 2, 'paso 66 (_pendientesDuplicadosAudAg_): las 2 líneas esperan una decisión');
ok(infoAvisos(E).length === 2 && infoAvisos(E).every(function (x) { return /^SEMANA FRENADA/.test(x[1]); }) && E.mails.length === 0,
   'el aviso diario agenda_info: anotado en AVISOS_AGENDA_INFO (2), sin mail todavía (es a las 20)');
avanzar(60);
r = correrHora(E, [V1, V3]);
ok(infoAvisos(E).length === 2 && pares(E).length === 2, 'la corrida siguiente: el aviso NO se repite (una vez por cosa) y las líneas siguen');
AHORA = new Date(2026, 9, 16, 20, 5, 0).getTime();
r = correrHora(E, [V1, V3]);
ok(E.mails.length === 1 && /lo nuevo de la agenda que el equipo tiene que saber \(2\)/.test(E.mails[0].subject) && /SEMANA FRENADA/.test(E.mails[0].body),
   'a las 20: UN mail con lo nuevo — ' + (E.mails[0] && E.mails[0].subject));
avanzar(60);
r = correrHora(E, [V1, V3]);
ok(E.mails.length === 1 && infoAvisos(E).length === 2, 'y no otro ese día, ni otra línea');

// ============================== [2] la medición en seco ==============================

console.log('[2] fusionAutomaticaAgenda_enSeco (paso 99): qué juntaría sola y qué iría a ELEGIR, sin escribir nada');
S = escenario(true);
E = sobre(S.X, conf());
let antes = foto(S.X.D), antesReg = cambios(E).length;
const seco = E.run('fusionAutomaticaAgenda_enSeco()');
ok(foto(S.X.D) === antes && cambios(E).length === antesReg && !(E.props || {}).FUSION_AGENDA_HUELLA_96 && !(E.props || {}).FUSION_AGENDA_CORRIDA_97, 'no escribe nada (ni la base, ni el registro, ni las propiedades)');
ok(seco.solas.length === 1 && seco.solas[0].vieja.fila === S.b + 1 && seco.elegir.length === 1 && /Inscriptos/.test(seco.elegir[0].motivos.join(' ')),
   'C14 se juntaría sola (se queda la ' + (S.b + 1) + '); C12 iría a ELEGIR (Inscriptos distintos) — ' + JSON.stringify({ s: seco.solas.length, e: seco.elegir }));

// ============================== [3] la fusión automática PRENDIDA ==============================

console.log('[3] AGENDA_FUSION_AUTOMATICA = true: junta sola lo que aceptan las reglas del paso 97; lo demás, a ELEGIR');
S = escenario(true);
E = sobre(S.X, conf({ AGENDA_FUSION_AUTOMATICA: 'true' }));
nFilas = S.X.D.v.length;
const uidN14 = celda(E, S.n14, 'agenda_uid');
r = correr(E, false, [V1, V3]);
ok(r && !r.error && S.X.D.v.length === nFilas - 1 && deLaComuna(E, 'Comuna 14').length === 1 && deLaComuna(E, 'Comuna 12').length === 2 && r.invariante === 1,
   'C14 juntada (una fila menos), C12 no (se rechaza): el H3 sólo ve C12 — ' + JSON.stringify({ n: S.X.D.v.length - nFilas, inv: r.invariante }));
ok(celda(E, S.b, 'Barrio') === 'Palermo' && celda(E, S.b, 'Dirección') === 'Sede a definir', 'la vieja C14 recibió el barrio y conservó la dirección del equipo');
const regA = cambios(E).filter(function (x) { return x[1] === 'fusionada_sistema'; });
ok(regA.length === 1 && /automática/.test(regA[0][5]) && regA[0][0] === E.props.FUSION_AGENDA_CORRIDA_97 && cambios(E).some(function (x) { return x[1] === 'borrar_fusion' && x[8] === uidN14; }),
   'el registro: "borrar_fusion" + "fusionada_sistema" (automática), con la corrida guardada para el paso 98');
ok(pares(E).length === 1 && filasDe(pares(E)[0]).indexOf(S.a + 1) >= 0, 'AGENDA_DUPLICADOS: sólo el par C12, para elegir');
const js = pend(E, 'juntada sola (fusión automática)');
ok(js.length === 1 && String(js[0][7]) === String(S.b + 1) && /deshacer/.test(js[0][9]) && pend(E, 'semana frenada: una reunión en dos filas').length === 1,
   'AGENDA_PENDIENTES: "juntada sola" (con cómo deshacer) y la semana frenada por C12');
ok(infoAvisos(E).some(function (x) { return /^JUNTADA SOLA/.test(x[1]); }), 'y en el aviso diario (agenda_info)');
const hA = E.run('leerHistorialAgenda_().creadas.has(' + JSON.stringify(uidN14) + ')');
ok(!hA, 'la borrada por la fusión automática NO queda como "borrada por el equipo"');
avanzar(60);
r = correr(E, false, [V1, V3]);
ok(r.crear === 0 && r.borradasEquipo === 0 && deLaComuna(E, 'Comuna 14').length === 1 && pend(E, 'juntada sola (fusión automática)').length === 1,
   'la corrida siguiente: no recrea nada, ninguna "borrada por el equipo", y "juntada sola" se sigue listando (un hecho, 7 días)');
const d3 = E.run('deshacerUltimaFusionAgenda(false)');
ok(d3 && d3.restauradas === 1 && deLaComuna(E, 'Comuna 14').length === 2, 'deshacer (paso 98, con la corrida guardada): la nueva vuelve — ' + JSON.stringify(d3));

// ============================== [4] "Quedarse con la fila X" ==============================

console.log('[4] ELEGIR "Quedarse con la fila X" (la otra es de la agenda): se junta por la decisión del equipo, y se puede deshacer');
S = escenario(true);
E = sobre(S.X, conf());
correr(E, false, [V1, V3]);
const uidA = celda(E, S.a, 'agenda_uid'), uidN12 = celda(E, S.n12, 'agenda_uid');
ok(elegir(E, parDe(E, S.a + 1), 'Quedarse con la fila ' + (S.a + 1)), 'el equipo elige "Quedarse con la fila ' + (S.a + 1) + '" en el par C12 (el que no se juntaba solo)');
nFilas = S.X.D.v.length;
avanzar(60);
r = correr(E, false, [V1, V3]);
ok(S.X.D.v.length === nFilas - 1 && deLaComuna(E, 'Comuna 12').length === 1 && celda(E, S.a, 'agenda_uid') === uidA, 'juntadas: la nueva C12 se borró, la elegida queda');
ok(celda(E, S.a, 'Inscriptos') === 40 && celda(E, S.a, 'Observaciones') === 'nota del equipo' && celda(E, S.a, 'Dirección') === 'Av. Inventada 4977, Club Social' &&
   celda(E, S.a, 'ID cuentas') === '3735-SEGTEST' && celda(E, S.a, 'Temas mas comentados') === 'tema del equipo',
   'la elegida conserva SU Inscriptos (40, no el 57 de la otra) y lo del equipo; recibe lo vacío (dirección, ID cuentas, el tema)');
const regE = cambios(E).filter(function (x) { return x[1] === 'fusionada_equipo'; });
ok(regE.length === 1 && /decisión del equipo/.test(regE[0][5]) && cambios(E).some(function (x) { return x[1] === 'borrar_fusion_equipo' && x[8] === uidN12 && /57/.test(x[5]); }),
   'el registro: "borrar_fusion_equipo" (la fila entera, con su Inscriptos 57) + "fusionada_equipo"');
const elec = (hoja(E, 'ELECCIONES_AGENDA') || { v: [] }).v.filter(function (x) { return /^dos_filas\|/.test(x[1]); });
ok(elec.length === 1 && elec[0][2] === 'uid:' + uidA && /^aplicada: juntada en la fila/.test(elec[0][3]),
   'ELECCIONES_AGENDA: la decisión queda CONSUMIDA ("aplicada: juntada…"), por la IDENTIDAD de la fila (uid:' + uidA + '), no por el número — ' + JSON.stringify(elec.map(function (x) { return x[3]; })));
ok(E.run('leerHistorialAgenda_().creadas.has(' + JSON.stringify(uidN12) + ')'), 'la borrada por decisión del equipo cuenta como BORRADA POR EL EQUIPO (no se recrea)');
ok(pend(E, 'juntada por decisión del equipo').length === 1 && !parDe(E, S.a + 1), 'AGENDA_PENDIENTES: "juntada por decisión del equipo"; AGENDA_DUPLICADOS ya no tiene el par C12');
avanzar(60);
r = correr(E, false, [V1, V3]);
ok(r.crear === 0 && deLaComuna(E, 'Comuna 12').length === 1, 'la corrida siguiente: no se recrea');
const idE = regE[0][0];
const d4 = E.run('deshacerAgenda(false, ' + JSON.stringify(idE) + ')');
const nueva12 = deLaComuna(E, 'Comuna 12').filter(function (i) { return i !== S.a; })[0];
ok(d4 && d4.restauradas === 1 && nueva12 && celda(E, nueva12, 'agenda_uid') === uidN12 && celda(E, nueva12, 'Inscriptos') === 57,
   'deshacer (paso 38 con la corrida): la borrada vuelve, con su Inscriptos 57 — ' + JSON.stringify(d4));
// 16/10 (revisor): el deshacer TIENE QUE QUEDAR — la corrida siguiente no vuelve a juntar el par (la decisión ya se aplicó una vez)
nFilas = S.X.D.v.length;
avanzar(60);
r = correr(E, false, [V1, V3]);
ok(S.X.D.v.length === nFilas && deLaComuna(E, 'Comuna 12').length === 2 && !cambios(E).some(function (x) { return x[1] === 'fusionada_equipo' && x[0] !== idE; }),
   'DESPUÉS DEL DESHACER, la corrida siguiente NO vuelve a juntar (la decisión estaba consumida) — filas ' + (S.X.D.v.length - nFilas));
const l4 = parDe(E, S.a + 1);
ok(l4 && l4[0] === '' && /elegir/.test(l4[2]), 'el par vuelve a AGENDA_DUPLICADOS con ELEGIR vacío (el equipo puede elegir de nuevo, o cambiar)');
avanzar(60);
r = correr(E, false, [V1, V3]);
ok(deLaComuna(E, 'Comuna 12').length === 2 && parDe(E, S.a + 1), '  y sigue así en la otra corrida');
elegir(E, parDe(E, S.a + 1), 'Son reuniones distintas');
avanzar(60);
r = correr(E, false, [V1, V3]);
ok(deLaComuna(E, 'Comuna 12').length === 2 && !parDe(E, S.a + 1) && pend(E, 'semana frenada: una reunión en dos filas').every(function (x) { return !/Comuna 12|Gabino/.test(x[1]); }),
   'el equipo cambió de idea ("Son reuniones distintas"): las dos filas quedan, el par no se pregunta más');

// "Quedarse con la fila Y" (la NUEVA): la vieja tiene datos del EQUIPO distintos (Inscriptos 40, sin el color del sistema) → no se borra
S = escenario(true);
E = sobre(S.X, conf());
correr(E, false, [V1, V3]);
elegir(E, parDe(E, S.a + 1), 'Quedarse con la fila ' + (S.n12 + 1));
nFilas = S.X.D.v.length;
avanzar(60);
r = correr(E, false, [V1, V3]);
const sa = pend(E, 'decisión del equipo sin aplicar');
ok(S.X.D.v.length === nFilas && deLaComuna(E, 'Comuna 12').length === 2 && celda(E, S.a, 'Inscriptos') === 40 &&
   sa.length === 1 && /datos del equipo distintos/.test(sa[0][8]) && /Inscriptos/.test(sa[0][8]) && /borrar la fila \d+ a mano, o corregir/.test(sa[0][9]) && !parDe(E, S.a + 1),
   '"Quedarse con la fila Y" con datos del EQUIPO en la otra (Inscriptos 40): NO se borra; AGENDA_PENDIENTES "decisión del equipo sin aplicar" — ' + JSON.stringify(sa[0] && sa[0].slice(8, 10)));
ok(cambios(E).some(function (x) { return x[1] === 'eleccion_a_mano'; }) && !cambios(E).some(function (x) { return x[1] === 'eleccion_aplicada' && /^dos_filas/.test(x[6]); }),
   '  el registro: "eleccion_a_mano" (no "eleccion_aplicada": no se aplicó nada)');
// y si el dato distinto lo escribió el sistema (fondo COLOR_SISTEMA), sí se junta
S.X.D.bg[S.a][S.X.C('Inscriptos')] = SIS;
avanzar(60);
r = correr(E, false, [V1, V3]);
const q12 = deLaComuna(E, 'Comuna 12');
ok(q12.length === 1 && celda(E, q12[0], 'Inscriptos') === 57 && pend(E, 'juntada por decisión del equipo').length === 1,
   'el mismo par con el 40 escrito por el SISTEMA (color del sistema): se junta (se queda la nueva con su 57)');

// ============================== [5] "Son reuniones distintas" ==============================

console.log('[5] ELEGIR "Son reuniones distintas": el par no vuelve, no frena la semana, no avisa; el paso 16 lo cuenta aparte');
S = escenario(true);
E = sobre(S.X, conf());
correr(E, false, [V1, V3]);
elegir(E, parDe(E, S.a + 1), 'Son reuniones distintas');
elegir(E, parDe(E, S.b + 1), 'Son reuniones distintas');
nFilas = S.X.D.v.length;
const avisosAntes = infoAvisos(E).length;
const V4 = mail(16, 12, [SEG(12, 'Av. Inventada 4977, Club Social'), SEG(14, 'Av. Ficticia 55, Sede Vecinal'),
                         ['*Miércoles 21/10*', 'Evento: Encuentro con Vecinos Clara Muzzio, Recoleta', 'Hora: 18:00h', 'Lugar: Av. Inventada 4977, Club Social']]);
avanzar(60);
r = correr(E, false, [V1, V3, V4]);
ok(r.invariante === 0 && pares(E).length === 0 && pend(E, 'semana frenada: una reunión en dos filas').length === 0, 'el H3 ya no ve los pares: ninguna línea, ninguna semana frenada');
ok(r.crear === 1 && S.X.D.v.length === nFilas + 1, 'la semana NO está frenada: la reunión nueva de esa semana (Muzzio 21/10) se crea');
ok(infoAvisos(E).length === avisosAntes, 'y no hay aviso nuevo');
const p16 = E.run('(function () { var a = _filasAgenda_diag8(leerDestino_()).invariante; return { n: a.length, ign: (a.ignoradas || []).map(function (x) { return x.por; }) }; })()');
ok(p16.n === 0 && p16.ign.length === 2 && p16.ign.every(function (x) { return x === 'distintas'; }), 'paso 16: 0 problemas y 2 "distintas por decisión del equipo" — ' + JSON.stringify(p16));
avanzar(60);
r = correr(E, false, [V1, V3, V4]);
ok(r.invariante === 0 && pares(E).length === 0, 'y sigue así (la decisión quedó en ELECCIONES_AGENDA)');

// ============================== [6] la otra es una fila del EQUIPO ==============================

console.log('[6] "después de crear": una fila de la agenda y una del EQUIPO; la del equipo nunca se borra');
const MZ = mail(15, 8, [['*Miércoles 21/10*', 'Evento: Encuentro con Vecinos Clara Muzzio, Recoleta', 'Hora: 18:00h', 'Lugar: Av. Inventada 4977, Club Social']]);
const conEquipo = function () {
  AHORA = new Date(2026, 9, 15, 9, 0, 0).getTime();
  const X = montar({});
  const Ex = sobre(X, conf());
  correr(Ex, false, [MZ]);
  const ia = (function () { for (let i = 1; i < X.D.v.length; i++) if (X.D.v[i][X.C('Figura')] === 'Clara Muzzio' && X.D.v[i][X.C('FECHA')] instanceof Date && X.D.v[i][X.C('FECHA')].getDate() === 21) return i; return -1; })();
  const q = X.D.v[0].map(function () { return ''; });
  q[X.C('Figura')] = 'Clara Muzzio'; q[X.C('Barrio')] = 'Recoleta'; q[X.C('FECHA')] = new D(2026, 9, 21, 12); q[X.C('HORA')] = '18:30';
  q[X.C('STATUS REUNIÓN')] = 'en agenda'; q[X.C('Observaciones')] = 'cargada por el equipo';
  X.D.v.push(q); X.D.bg.push(q.map(function () { return null; }));
  avanzar(60);
  correr(Ex, false, [MZ]);
  return { X: X, E: Ex, ia: ia, ie: X.D.v.length - 1 };
};
let T = conEquipo();
const p6 = pares(T.E);
ok(ia_ok(T) && p6.length === 1 && filasDe(p6[0]).join(',') === [T.ia + 1, T.ie + 1].join(',') && /uid:c-/.test(p6[0][15]) && /=fila:clara muzzio\|20261021\|recoleta/.test(p6[0][15]),
   'UNA línea para el par (H3 y "después de crear" juntos); la fila del equipo identificada por figura + fecha + barrio — ' + JSON.stringify(p6.map(function (x) { return x[15]; })));
function ia_ok(T) { return T.ia > 0 && T.ie > T.ia; }
elegir(T.E, p6[0], 'Quedarse con la fila ' + (T.ia + 1));
antes = JSON.stringify(T.X.D.v[T.ie]);
nFilas = T.X.D.v.length;
avanzar(60);
r = correr(T.E, false, [MZ]);
ok(T.X.D.v.length === nFilas && JSON.stringify(T.X.D.v[T.ie]) === antes, '"Quedarse con la de la agenda": la fila del EQUIPO NO se borra ni se toca');
const sob = pend(T.E, 'la que sobra: borrarla a mano');
ok(sob.length === 1 && String(sob[0][7]) === String(T.ie + 1) && /borrar la fila \d+ a mano/.test(sob[0][9]) && pares(T.E).length === 0 && r.invariante === 0,
   'AGENDA_PENDIENTES: "la que sobra: borrarla a mano" (fila ' + (T.ie + 1) + '); AGENDA_DUPLICADOS sin la línea; el H3 ya no la cuenta');
ok(infoAvisos(T.E).some(function (x) { return /^LA QUE SOBRA/.test(x[1]); }), 'y el aviso diario lo dice (una vez)');
T = conEquipo();
const uidMz = T.X.D.v[T.ia][T.X.C('agenda_uid')];
elegir(T.E, pares(T.E)[0], 'Quedarse con la fila ' + (T.ie + 1));
nFilas = T.X.D.v.length;
avanzar(60);
r = correr(T.E, false, [MZ]);
const ie2 = T.ie - 1;                                  // la de la agenda estaba arriba: se borró y la del equipo subió una
ok(T.X.D.v.length === nFilas - 1 && T.X.D.v[ie2][T.X.C('Observaciones')] === 'cargada por el equipo' && T.X.D.v[ie2][T.X.C('HORA')] === '18:30' && r.crear === 0,
   '"Quedarse con la del equipo": la de la agenda se junta en ella y se borra; la del equipo conserva su HORA y lo suyo; no se crea nada');
ok(cambios(T.E).some(function (x) { return x[1] === 'borrar_fusion_equipo' && x[8] === uidMz; }) && !!T.X.D.v[ie2][T.X.C('agenda_uid')],
   '  borrada por el camino auditado ("borrar_fusion_equipo"), y la del equipo quedó vinculada a la reunión (agenda_uid)');
ok(!cambios(T.E).some(function (x) { return (x[1] === 'fusionar' || x[1] === 'fusionar_general') && x[0] === cambios(T.E).filter(function (y) { return y[1] === 'fusionada_equipo'; })[0][0]; }),
   '  la del equipo estaba DEBAJO de la borrada (su número cambia): no se le copió nada, así deshacer no apunta a otra fila');
const d6 = T.E.run('deshacerAgenda(false, ' + JSON.stringify(cambios(T.E).filter(function (y) { return y[1] === 'fusionada_equipo'; })[0][0]) + ')');
ok(d6 && d6.restauradas === 1 && T.X.D.v[ie2][T.X.C('Observaciones')] === 'cargada por el equipo' &&
   T.X.D.v[T.X.D.v.length - 1][T.X.C('agenda_uid')] === uidMz, 'deshacer: la de la agenda vuelve (al final, con su agenda_uid); la del equipo, intacta');

// ============================== [6b] el mail APAGADO: no se marca nada como avisado ==============================

console.log('[6b] con AVISOS_MAIL_ACTIVO = false (como hoy): lo informativo NO queda marcado como avisado; al prender el mail, se avisa');
S = escenario(true);
E = sobre(S.X, Object.assign({}, ETAPA1));
correr(E, false, [V1, V3]);
ok(E.run('AVISOS_MAIL_ACTIVO') === false && !(E.props || {}).AGENDA_INFO_AVISADOS && pend(E, 'semana frenada: una reunión en dos filas').length === 2,
   'mail apagado: AGENDA_PENDIENTES tiene las 2 semanas frenadas, y la propiedad de "ya avisado" queda VACÍA');
const E6b = sobre(S.X, conf());
E6b.props = E.props || {};
avanzar(60);
correr(E6b, false, [V1, V3]);
ok(infoAvisos(E6b).length === 2 && /SEMANA FRENADA/.test(infoAvisos(E6b)[0][1]), 'al prender el mail: las dos se avisan (no quedaron "avisadas" con el mail apagado)');

// ============================== [7] c) los pares viejos 832/838 y 834/839, ya juntados por el paso 97 ==============================

console.log('[7] c) después del paso 97: las 4 líneas viejas de AGENDA_DUPLICADOS desaparecen y no se recrea nada');
S = escenario(false);
E = sobre(S.X, conf());
// las 4 líneas que dejó la versión de antes (informativas, una por fila del par)
E.ssD.hojas['AGENDA_DUPLICADOS'] = new E.Hoja('AGENDA_DUPLICADOS', [E.run('ENC_DUPLICADOS_AGENDA_')].concat([S.a, S.n12, S.b, S.n14].map(function (i) {
  return ['', '', 'informativo: en esa semana no se crea nada más', 'una reunión en dos filas', '22/10/2026 | Seguridad | filas …', 'fila ' + (i + 1), '', '', '', '', '', '', '', '', '', 'x|20261022|'];
})));
E.ctx.__f = FILAS(S);
E.run('fusionarParesAgenda_enSeco({ filas: __f })');
const r97 = E.run('fusionarParesAgenda({ filas: __f })');
ok(!r97.error && r97.borradas === 2, 'el paso 97 junta los dos pares');
avanzar(60);
r = correr(E, false, [V1, V3]);
ok(r.crear === 0 && r.borradasEquipo === 0 && r.invariante === 0, 'la corrida de la hora siguiente: no crea nada, ninguna "borrada por el equipo", el H3 no ve nada — ' +
   JSON.stringify({ c: r.crear, b: r.borradasEquipo, i: r.invariante }));
ok(dups(E).length === 0, 'AGENDA_DUPLICADOS se reescribió entera: las 4 líneas viejas ya no están (y no hay ninguna nueva)');
ok(pend(E, 'semana frenada: una reunión en dos filas').length === 0 && deLaComuna(E, 'Comuna 12').length === 1 && deLaComuna(E, 'Comuna 14').length === 1,
   'AGENDA_PENDIENTES sin semana frenada; una fila por comuna');

// ============================== [8] deshacer restaura EXACTO (cualquier STATUS, los fondos del equipo) ==============================

console.log('[8] restaurarFilaFusion_: la fila borrada vuelve EXACTA (STATUS "Realizada" del equipo, Asistentes, y sus fondos; sin pintar COLOR_SISTEMA)');
S = escenario(false);
E = sobre(S.X, conf());
{
  const fila = S.X.D.v[S.n12].slice();
  fila[E.C('STATUS REUNIÓN')] = 'Realizada'; fila[E.C('Asistentes')] = 31;
  const fondos = fila.map(function () { return null; });
  fondos[E.C('STATUS REUNIÓN')] = '#FFFF00'; fondos[E.C('Asistentes')] = '#FFFF00'; fondos[E.C('Inscriptos')] = SIS;
  E.ctx.__c = { antes: JSON.stringify(fila.map(function (v) { return E.run('_celdaRegistro_')(v); })), fondoAntes: JSON.stringify(fondos), uid: fila[E.C('agenda_uid')] };
  const dondeVa = S.X.D.v.length + 1;
  // la fila original se saca de la base (como si la hubiera borrado una fusión)
  S.X.D.v.splice(S.n12, 1); S.X.D.bg.splice(S.n12, 1);
  const okR = E.run('restaurarFilaFusion_(verificarHojaDestino_(ssDestino_()), leerDestino_().hdr, __c, ' + (dondeVa - 1) + ')');
  const i = dondeVa - 2;
  ok(okR && S.X.D.v[i][E.C('STATUS REUNIÓN')] === 'Realizada' && S.X.D.v[i][E.C('Asistentes')] === 31 && S.X.D.v[i][E.C('agenda_uid')] === fila[E.C('agenda_uid')],
     'los valores, también STATUS "Realizada" y los Asistentes');
  ok(S.X.D.bg[i][E.C('STATUS REUNIÓN')] === '#FFFF00' && S.X.D.bg[i][E.C('Asistentes')] === '#FFFF00' && S.X.D.bg[i][E.C('Inscriptos')] === SIS,
     'y los fondos originales (el amarillo del equipo, no COLOR_SISTEMA)');
  let tiro = false;
  try { E.run('restaurarFilaFusion_(verificarHojaDestino_(ssDestino_()), leerDestino_().hdr, __c, ' + (i + 1) + ')'); } catch (e) { tiro = /no está vacía/.test(String(e)); }
  ok(tiro && S.X.D.v[i][E.C('Asistentes')] === 31, 'sobre una fila con datos, no escribe nada (tira)');
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
