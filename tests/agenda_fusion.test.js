/**
 * tests/agenda_fusion.test.js — 16/10: JUNTAR los pares "una reunión en dos filas" que dejó la agenda (54_FusionAgenda.js,
 * pasos 96 y 97). Reproduce el bug 832/838 y 834/839: dos Seguridad del 22/10 "A CONFIRMAR" (con la Figura que les completó RDV
 * CONJUNTO), y una v3 con las direcciones procesada con la regla de ANTES, que crea dos filas nuevas. Después: el paso 96 (en
 * seco), el 97 (la vieja recibe lo de la nueva, la nueva se borra como "fusionada_sistema"), la corrida de la hora con la ETAPA 1
 * (no crea nada, no hay "borrada por el equipo", el H3 no ve nada), deshacer (paso 38) y los casos en que se niega.
 *
 *     node tests/agenda_fusion.test.js
 *
 * Destino SIMULADO y mails SINTÉTICOS (el mock es el de tests/agenda_seguridad_1510.test.js, con `setBackgrounds`). "Hoy" es el
 * viernes 16/10/2026; el reloj avanza entre corridas (las corridas tienen hora distinta). Sin datos reales.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', '05_Escritura.js', '20_UpsertDestino.js', '49_Corridas.js',
                  '41_AgendaColores.js', '41_AgendaParser.js', '42_BarriosCabaGeo.js', '40_Agenda.js', 'diagnostico/17_peso_intermedia.js',
                  'diagnostico/08_verificar_escritura.js', 'diagnostico/03_muestras_mail.js', 'diagnostico/16_agenda_medicion.js',
                  'diagnostico/19_direccion_conjunto.js', 'diagnostico/21_ubicacion.js', '25_Elecciones.js',
                  'diagnostico/22_previsualizar.js', 'diagnostico/30_duplicados_agenda.js', '54_FusionAgenda.js'];
let AHORA = new Date(2026, 9, 16, 9, 0, 0).getTime();
const avanzar = function (min) { AHORA += min * 60000; };
class D extends Date {
  constructor(...a) { if (a.length === 0) super(AHORA); else super(...a); }
  static now() { return AHORA; }
}
const pad = function (n) { return ('0' + n).slice(-2); };

// ============================== el mock de Apps Script ==============================

function crearEntorno(config) {
  const E = { logs: [], uuid: 0 };
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

// ============================== [1] el bug ==============================

console.log('[1] la regla de ANTES: la v3 con las direcciones CREA dos filas nuevas (como la 838 y la 839)');
let S = escenario(false);
ok(S.r3.crear === 2 && S.n12 > S.a && S.n14 > S.b && S.n12 > S.b, 'crear 2: las nuevas quedan al final (filas ' + (S.n12 + 1) + ', ' + (S.n14 + 1) + '); las viejas ' + (S.a + 1) + ', ' + (S.b + 1));
let E = sobre(S.X, ETAPA1);
ok(E.run('reunionesRepetidasAgenda_(leerDestino_().filas, indicesAgenda_(leerDestino_().hdr), null).length') === 2, 'el H3 ve dos "una reunión en dos filas"');
const FILAS = function (S) {
  return [[S.a + 1, S.n12 + 1, { figura: 'Gabino Tapia', fecha: '2026-10-22', lugar: 'Comuna 12' }],
          [S.b + 1, S.n14 + 1, { figura: 'Laura Alonso', fecha: '2026-10-22', lugar: 'Comuna 14' }]];
};

// ============================== [2] paso 96 ==============================

console.log('[2] paso 96 (en seco): qué haría, sin escribir nada');
let antes = foto(S.X.D), antesReg = cambios(E).length;
E.ctx.__f = FILAS(S);
const seco = E.run('fusionarParesAgenda_enSeco({ filas: __f })');
if (process.env.VER_LOG) console.log(E.logs.join('\n'));
ok(foto(S.X.D) === antes && cambios(E).length === antesReg, 'no escribe nada (ni la base ni el registro)');
ok(seco.pares.length === 2 && seco.rechazados.length === 0 && seco.faltantes.length === 0, 'dos pares para juntar, ninguno rechazado — ' + JSON.stringify({ p: seco.pares.length, r: seco.rechazados.length }));
const p12 = seco.pares.filter(function (p) { return p.vieja === S.a + 1; })[0], p14 = seco.pares.filter(function (p) { return p.vieja === S.b + 1; })[0];
ok(p12 && p12.nueva === S.n12 + 1 && /la creó primero la agenda/.test(p12.regla) && p12.creadaVieja < p12.creadaNueva && /^20261015-0900/.test(p12.creadaVieja) && /^20261016-1141/.test(p12.creadaNueva),
   'se queda la VIEJA, por la corrida de su "crear_id" (' + (p12 && p12.creadaVieja) + ' antes que ' + (p12 && p12.creadaNueva) + ')');
const cols = function (p) { return p.copiar.map(function (c) { return c.columna; }); };
ok(['Dirección', 'agenda_direccion_escrita', 'Barrio', 'agenda_barrio_escrito', 'agenda_mail', 'agenda_version', 'Dirección (mail)', 'Inscriptos', 'ID cuentas', 'RDV_UID',
    'form_origen', 'form_clave', 'Temas mas comentados'].every(function (n) { return cols(p12).indexOf(n) >= 0; }),
   'C12: copia dirección, barrio, sus trazas, lo del mail, Inscriptos, ID cuentas, RDV_UID, form_* y el dato del equipo de la nueva — ' + cols(p12).join(', '));
ok(cols(p12).indexOf('Observaciones') < 0 && cols(p12).indexOf('agenda_uid') < 0 && cols(p12).indexOf('Figura') < 0, 'C12: no toca Observaciones (del equipo), agenda_uid ni Figura (iguales)');
ok(p14 && cols(p14).indexOf('Dirección') < 0 && cols(p14).indexOf('agenda_direccion_escrita') < 0 &&
   p14.conservar.some(function (c) { return c.nombre === 'Dirección' && /del equipo/.test(c.motivo); }) && cols(p14).indexOf('Barrio') >= 0,
   'C14: la Dirección que cambió el equipo ("Sede a definir") SE QUEDA (y su traza); el barrio se copia');
ok(/mismo grupo: sí/.test(p12.porQue) && /mismo "Lugar \(mail\)": sí/.test(p12.porQue) && /se hubiera ACTUALIZADO/.test(p12.porQue) && /no es una dirección/.test(p12.porQue),
   'por qué: mismo grupo, mismo lugar, mismo tipo; "A CONFIRMAR" no es dirección → la regla de hoy la hubiera actualizado');
ok(E.logs.some(function (l) { return /SE JUNTARÍA/.test(l); }) && E.logs.some(function (l) { return /HUELLA del plan/.test(l); }), 'el log muestra los pares y la huella');

// ============================== [3] paso 97 ==============================

console.log('[3] paso 97 (real): la vieja recibe lo de la nueva y la nueva se borra');
const uidN12 = celda(E, S.n12, 'agenda_uid'), uidN14 = celda(E, S.n14, 'agenda_uid'), uidA = celda(E, S.a, 'agenda_uid');
const n0 = S.X.D.v.length;
E.ctx.__f = FILAS(S); E.ctx.__h = seco.huella;
const real = E.run('fusionarParesAgenda({ filas: __f, huella: __h })');
ok(!real.error && real.borradas === 2 && S.X.D.v.length === n0 - 2, 'dos filas borradas (fusionadas) — ' + JSON.stringify({ e: real.error, b: real.borradas }));
const a = S.a, b = S.b;
ok(celda(E, a, 'agenda_uid') === uidA && celda(E, a, 'Dirección') === 'Av. Inventada 4977, Club Social' && celda(E, a, 'agenda_direccion_escrita') === 'Av. Inventada 4977, Club Social' &&
   celda(E, a, 'Barrio') === 'Villa Urquiza' && celda(E, a, 'agenda_barrio_escrito') === 'Villa Urquiza' && fondo(E, a, 'Dirección') === SIS,
   'la vieja C12: su agenda_uid, la dirección y el barrio de la nueva con su traza, en COLOR_SISTEMA');
ok(celda(E, a, 'Inscriptos') === 57 && celda(E, a, 'ID cuentas') === '3735-SEGTEST' && celda(E, a, 'RDV_UID') === 'rdv-uid-prueba-1' &&
   celda(E, a, 'Temas mas comentados') === 'tema del equipo' && fondo(E, a, 'Inscriptos') === SIS, 'la vieja C12: Inscriptos, ID cuentas, RDV_UID, el tema (regla general, celda vacía)');
ok(!celda(E, a, 'Marcas (mail)') && /16\/10\/2026 11:00$/.test(celda(E, a, 'agenda_mail')), 'la vieja C12: lo del mail es el de la v3 (agenda_mail; la marca "A CONFIRMAR" ya no está)');
ok(celda(E, a, 'Observaciones') === 'nota del equipo' && fondo(E, a, 'Observaciones') === '#FFF2CC' && celda(E, a, 'Figura') === 'Gabino Tapia', 'lo del equipo en la vieja, intacto');
ok(celda(E, b, 'Dirección') === 'Sede a definir' && celda(E, b, 'agenda_direccion_escrita') === 'A CONFIRMAR' && celda(E, b, 'Barrio') === 'Palermo' &&
   celda(E, b, 'Dirección (mail)') === 'Av. Ficticia 55, Sede Vecinal', 'la vieja C14: la Dirección del equipo se queda (y su traza), el barrio y lo del mail entran');
ok(deLaComuna(E, 'Comuna 12').length === 1 && deLaComuna(E, 'Comuna 14').length === 1, 'una fila por comuna');
const reg = cambios(E).filter(function (r) { return r[0] === real.corrida; });
ok(reg.filter(function (r) { return r[1] === 'fusionada_sistema'; }).length === 2 && reg.filter(function (r) { return r[1] === 'borrar_fusion'; }).length === 2 &&
   reg.some(function (r) { return r[1] === 'fusionar_general'; }) && reg.some(function (r) { return r[1] === 'fusionar'; }),
   'el registro: "borrar_fusion" (la fila entera), "fusionada_sistema", "fusionar" y "fusionar_general"');
ok(reg.filter(function (r) { return r[1] === 'borrar_fusion'; }).every(function (r) { return /^\[/.test(r[5]) && /^\[/.test(r[7]) && (r[8] === uidN12 || r[8] === uidN14); }),
   '  con los valores y los fondos de la fila borrada, y su agenda_uid');
const h = E.run('(function () { const h = leerHistorialAgenda_(); return { n12: h.creadas.has(' + JSON.stringify(uidN12) + '), a: h.creadas.has(' + JSON.stringify(uidA) + ') }; })()');
ok(!h.n12 && h.a, 'leerHistorialAgenda_: la fusionada NO queda como creada-y-desaparecida (no es "borrada por el equipo"); la vieja sí sigue');
const despues = foto(S.X.D);

console.log('[4] la corrida de la hora (ETAPA 1) después de juntar');
avanzar(60);
const rH = correr(E, false, [V1, V3]);
ok(rH && !rH.error && rH.crear === 0 && rH.borradasEquipo === 0 && rH.invariante === 0, 'no crea nada, ninguna "borrada por el equipo", el H3 no ve nada — ' +
   JSON.stringify({ crear: rH.crear, borradasEquipo: rH.borradasEquipo, invariante: rH.invariante }));
ok(deLaComuna(E, 'Comuna 12').length === 1 && deLaComuna(E, 'Comuna 14').length === 1 && celda(E, a, 'Dirección') === 'Av. Inventada 4977, Club Social', 'y sigue una fila por comuna, con la dirección');
ok(E.run('reunionesRepetidasAgenda_(leerDestino_().filas, indicesAgenda_(leerDestino_().hdr), null).length') === 0, 'el H3 (paso 16) da 0');
const dup = S.X.ssD.hojas['AGENDA_DUPLICADOS'];
ok(!dup || !dup.v.some(function (r) { return r.indexOf('una reunión en dos filas') >= 0; }), 'AGENDA_DUPLICADOS sin líneas "una reunión en dos filas" (se reescribió)');
const E0 = sobre(S.X, {});
const rH0 = correr(E0, true, [V1, V3]);
ok(rH0.crear === 0 && rH0.borradasEquipo === 0, 'y con la regla de ANTES tampoco crearía nada (la vieja ya tiene la dirección escrita)');

// ============================== [5] deshacer ==============================

console.log('[5] deshacer (paso 38) con la corrida de la fusión');
S = escenario(false);
E = sobre(S.X, ETAPA1);
const fotoAntes = JSON.parse(foto(S.X.D));
E.ctx.__f = FILAS(S);
// 16/10 (revisor): sin el paso 96 antes, el 97 se niega (exige la huella de lo que se vio)
const r5no = E.run('fusionarParesAgenda({ filas: __f })');
ok(r5no.error && /primero hay que correr el paso 96/.test(r5no.error) && JSON.stringify(JSON.parse(foto(S.X.D))) === JSON.stringify(fotoAntes), 'el 97 sin el 96: se NIEGA y no escribe nada');
E.run('fusionarParesAgenda_enSeco({ filas: __f })');
const r5 = E.run('fusionarParesAgenda({ filas: __f })');
ok(!r5.error && r5.borradas === 2, 'juntadas (con la huella que guardó el 96)');
const dsec = E.run('deshacerAgenda(true, ' + JSON.stringify(r5.corrida) + ')');
ok(dsec.restaurarianFusion === 2 && dsec.generales > 0 && dsec.celdas > 0, 'en seco: restauraría 2 filas, vaciaría las de la regla general y volvería las de la agenda — ' + JSON.stringify(dsec));
// 16/10 (revisor): el paso 98 deshace la ÚLTIMA fusión por su id (el 97 lo guardó), aunque después hayan corrido otras
const d5 = E.run('deshacerUltimaFusionAgenda(false)');
ok(d5 && d5.restauradas === 2 && d5.saltadas === 0, 'deshecho: 2 filas restauradas, nada saltado — ' + JSON.stringify(d5));
const norm = function (v) { return v instanceof Date ? (v.getFullYear() < 1900 ? 'hora' : v.getFullYear() + '-' + (v.getMonth() + 1) + '-' + v.getDate()) : (v == null ? '' : String(v)); };
const igualFila = function (x, y) {
  const n = Math.max(x.length, y.length);
  for (let k = 0; k < n; k++) {
    if (E.hdr[k] === 'ID' || E.hdr[k] === 'Día de la semana' || /Comuna|Poblacion|Mujer|Varon|km2|Zona|Direccion2|Falta|Asistencia/.test(E.hdr[k] || '')) continue;
    if (norm(x[k]) !== norm(y[k])) return E.hdr[k] + ': ' + norm(x[k]) + ' / ' + norm(y[k]);
  }
  return '';
};
const v5 = S.X.D.v;
ok(v5.length === fotoAntes.v.length, 'la base tiene las mismas filas que antes');
const difs = [];
for (let i = 1; i < fotoAntes.v.length; i++) {
  const x = fotoAntes.v[i].map(function (c) { return typeof c === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(c) ? new Date(c) : c; });
  const d = igualFila(x, v5[i]);
  if (d) difs.push('fila ' + (i + 1) + ' ' + d);
  for (let k = 0; k < x.length; k++) {
    if (/Comuna|Poblacion|Mujer|Varon|km2|Zona|Direccion2|Falta|Asistencia|^ID$|Día de la semana/.test(E.hdr[k] || '')) continue;
    if ((fotoAntes.bg[i][k] || null) !== (S.X.D.bg[i][k] || null)) { difs.push('fila ' + (i + 1) + ' fondo ' + E.hdr[k] + ': ' + fotoAntes.bg[i][k] + ' / ' + S.X.D.bg[i][k]); break; }
  }
}
ok(difs.length === 0, 'las viejas vuelven a lo que tenían y las nuevas vuelven al final con sus valores y sus FONDOS (también el amarillo del equipo)' + (difs.length ? ' — ' + difs.slice(0, 4).join(' | ') : ''));
const h5 = E.run('(function () { const h = leerHistorialAgenda_(); return h.creadas.has(' + JSON.stringify(celda(E, S.n12, 'agenda_uid')) + '); })()');
ok(h5 && celda(E, S.n12, 'agenda_uid') === fotoAntes.v[S.n12][E.C('agenda_uid')], 'la restaurada con su agenda_uid, y el historial la vuelve a contar como creada (la corrida deshecha no cuenta)');

// ============================== [6] cuando se niega ==============================

console.log('[6] los casos en que NO se junta');
S = escenario(true);                                   // la vieja C12 con Inscriptos 40, la nueva con 57
E = sobre(S.X, ETAPA1);
antes = foto(S.X.D);
E.ctx.__f = FILAS(S);
const s6 = E.run('fusionarParesAgenda_enSeco({ filas: __f })');
ok(s6.rechazados.length === 1 && s6.pares.length === 1 && /Inscriptos/.test(s6.rechazados[0].motivos.join(' ')), 'datos del equipo distintos (Inscriptos 40 / 57): el par C12 se RECHAZA y se lista');
const r6 = E.run('fusionarParesAgenda({ filas: __f })');
ok(r6.error && /se rechaza/.test(r6.error) && foto(S.X.D) === antes, 'en real: no escribe NADA (tampoco el otro par) — ' + r6.error);
E.ctx.__f = [FILAS(S)[1]];
E.run('fusionarParesAgenda_enSeco({ filas: __f })');   // el 96 con el par que se va a juntar (el 97 exige su huella)
const r6b = E.run('fusionarParesAgenda({ filas: __f })');
ok(!r6b.error && r6b.borradas === 1 && deLaComuna(E, 'Comuna 12').length === 2, 'pidiendo sólo el par bueno (C14): se junta ése y el C12 queda como estaba');

S = escenario(false);
E = sobre(S.X, ETAPA1);
antes = foto(S.X.D);
E.ctx.__f = [[S.a + 1, S.n12 + 1, { figura: 'Ezequiel Sabor', fecha: '2026-10-22', lugar: 'Comuna 12' }]];
let r = E.run('fusionarParesAgenda({ filas: __f })');
ok(r.error && /no es la esperada/.test(r.error) && foto(S.X.D) === antes, 'la identidad no coincide (otra figura): no escribe nada');
E.ctx.__f = [[S.n12 + 1, S.a + 1]];
r = E.run('fusionarParesAgenda({ filas: __f })');
ok(r.error && /se pidió quedarse con la fila/.test(r.error) && foto(S.X.D) === antes, 'pedir quedarse con la NUEVA: se niega (la regla dice la vieja)');
E.ctx.__f = [[S.a + 2, S.n12 + 1]];
r = E.run('fusionarParesAgenda({ filas: __f })');
ok(r.error && /ya no son/.test(r.error) && foto(S.X.D) === antes, 'números de fila corridos (el par no existe): no escribe nada');
E.ctx.__f = FILAS(S);
r = E.run('fusionarParesAgenda({ filas: __f, huella: "otra" })');
ok(r.error && /huella/.test(r.error) && foto(S.X.D) === antes, 'la huella del paso 96 no coincide: no escribe nada');
r = E.run('fusionarParesAgenda({})');
ok(r.error && /hay que decir los pares/.test(r.error) && foto(S.X.D) === antes, 'en real sin opciones.filas: no escribe nada');
E.lockLibre = false;
r = E.run('fusionarParesAgenda({ filas: __f })');
ok(r.error === 'hay otra corrida en curso' && foto(S.X.D) === antes, 'el bloqueo ocupado (corrida de la hora): no hace nada');
E.lockLibre = true;
S.X.D.v[S.n14][S.X.C('STATUS REUNIÓN')] = 'Suspendida';
E.ctx.__f = FILAS(S);
const s6c = E.run('fusionarParesAgenda_enSeco({ filas: __f })');
ok(s6c.pares.length === 1 && s6c.faltantes.length === 1, 'una nueva Suspendida ya no es "una reunión en dos filas" (el H3 sólo mira filas vivas): no se toca');
ok(foto(S.X.ssD.hojas['RDV CONJUNTO']) === JSON.stringify({ v: [['Figura', 'Barrio', 'FECHA', 'Asistentes', 'Oradores anotados', 'Oradores que hablaron']], bg: [[null, null, null, null, null, null]] }),
   'RDV CONJUNTO no se tocó en ningún momento');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
