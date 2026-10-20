/**
 * tests/agenda_reprogramada.test.js — 20/10 (prompt 09, 6c): "REPROGRAMADA" EN VEZ DE "SUSPENDIDA" (AGENDA_REPROGRAMADA). Una
 * reunión cancelada en el mail (en ROJO entero, paso 7b; o desaparecida, paso 7) cuya MISMA figura tiene en el mail otra reunión en
 * el MISMO lugar en una fecha posterior (a AGENDA_REPROGRAMADA_DIAS días o menos) queda "Reprogramada"; si la fecha nueva llega
 * después de que el sistema la suspendió, pasa de "Suspendida" a "Reprogramada"; una "Suspendida" del equipo no se toca (sólo se
 * cuenta, paso 110); otra figura, otro lugar, una fecha anterior o a más de 21 días: "Suspendida"; y APAGADO = el plan y la base
 * IDÉNTICOS al código de antes (el commit fda608e, leído con git). Destino SIMULADO y mails SINTÉTICOS (el mock es el de
 * tests/agenda_rojo_cancela.test.js). "Hoy" es el jueves 15/10/2026.
 *
 *     node tests/agenda_reprogramada.test.js
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: mails, horarios y direcciones son inventados; los
 * barrios y comunas son los públicos de la Ciudad; las figuras, nombres de la columna Figura.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', '05_Escritura.js', '20_UpsertDestino.js', '49_Corridas.js',
                  '41_AgendaColores.js', '41_AgendaParser.js', '42_BarriosCabaGeo.js', '40_Agenda.js', '47_AgendaVistas.js', '25_Elecciones.js',
                  '52_CancelacionMail.js', 'diagnostico/17_peso_intermedia.js', 'diagnostico/08_verificar_escritura.js',
                  'diagnostico/29_auditoria_agenda.js', 'diagnostico/31_auditoria_cancelaciones.js', 'diagnostico/35_cancelaciones_mail.js',
                  'diagnostico/39_reprogramadas.js'];
/** El código de ANTES de la regla (el commit fda608e): para comparar "apagado = idéntico a hoy". null = sin git (se saltea). */
const BASE_GIT = 'fda608e';   // 20/10: el commit de migracion justo antes de juntar el 6c (los puntos 4, 5, 6a y 6b ya adentro)
function fuenteDeGit(f) {
  try { return require('child_process').execSync('git show ' + BASE_GIT + ':' + f, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (e) { return null; }
}
const HOY = new Date(2026, 9, 15, 12, 0, 0);
/** UNA sola clase de fecha, la misma adentro y afuera del contexto: si no, `instanceof Date` falla adentro. */
class D extends Date {
  constructor(...a) { if (a.length === 0) super(HOY.getTime()); else super(...a); }
  static now() { return HOY.getTime(); }
}
const pad = function (n) { return ('0' + n).slice(-2); };

// ============================== el mock de Apps Script ==============================

function crearEntorno(config, deGit) {
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
        setFontWeight: function () { return rango; },
        getDataValidation: function () { return E.validacion || null; }
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
    PropertiesService: { getScriptProperties: function () { E.props = E.props || {}; return { getProperty: function (k) { return k in E.props ? E.props[k] : null; }, setProperty: function (k, v) { E.props[k] = String(v); }, deleteProperty: function (k) { delete E.props[k]; } }; } }
  };
  vm.createContext(ctx);
  const cfg = Object.assign({ DERIVADAS_POR_SCRIPT: 'false', AGENDA_SOLO_SEMANA: 'null', AGENDA_CANCELACION_AUTOMATICA: 'true', AGENDA_CANCELACION_MODO: "'regla7'",
    // 16/10: la etapa 1 quedó PRENDIDA en 00_Config.js; cada escenario parte de todo APAGADO y prende lo suyo por `config`
    AGENDA_SEGURIDAD_POR_COMUNA: 'false', AGENDA_BARRIO_DEL_MAIL: 'false', CONJUNTO_REPETIDA_POR_UBICACION: 'false',
    AGENDA_CREAR_SOLO_IDENTIFICADAS: 'false', AGENDA_CONCILIACION_SEMANAL: 'false', AGENDA_ELECCIONES_SIEMPRE: 'false',
    AGENDA_INVARIANTE_UNA_FILA: 'false', AGENDA_VALIDAR_MAILS: 'false', AGENDA_COLORES_MAIL: 'false' }, config || {});   // el alcance de cada escenario no depende de cómo quedó 00_Config.js
  // `deGit`: el código de ANTES (BASE_GIT); el archivo de la medición nueva no existía
  (deGit ? ARCHIVOS.filter(function (f) { return f !== 'diagnostico/39_reprogramadas.js'; }) : ARCHIVOS).forEach(function (f) {
    let s = deGit ? fuenteDeGit(f) : fs.readFileSync(path.join(RAIZ, f), 'utf8');
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
  const E = crearEntorno(arguments[2], arguments[3]);
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


// ============================== los mails (inventados), con HTML ==============================

const ASUNTO_12 = 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 12/10 al 18/10';
const ASUNTO_19 = 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 19/10 al 25/10';
const ASUNTO_02 = 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 02/11 al 08/11';
const NL = String.fromCharCode(10);
let idMail = 0;
const ROJO = 'background-color:#ff0000';
const TODO_ROJO = { dia: ROJO, ev: ROJO, hora: ROJO, lugar: ROJO };
function mail(dia, hora, bloques, asunto, estilos, min, mes) {
  const html = '<div dir="ltr">' + bloques.map(function (b, i) {
    const st = (estilos || [])[i] || {};
    return b.map(function (l, k) {
      const s = [st.dia, st.ev, st.hora, st.lugar][k];
      const t = l.replace(/^\*(.*)\*$/, '<b>$1</b>');
      return '<div>' + (s ? '<span style="' + s + '">' + t + '</span>' : t) + '</div>';
    }).join('') + '<br>';
  }).join('') + '</div>';
  return { fecha: new D(2026, mes == null ? 9 : mes, dia, hora, min || 0), asunto: asunto, cuerpo: [].concat.apply([], bloques).join(NL), truncado: false,
           html: html, id: 'm' + (++idMail) };
}
const MUZZIO = ['*Miércoles 14/10*', 'Evento: Encuentro con Vecinos Clara Muzzio, Recoleta', 'Hora: 18:30h', 'Lugar: Av. Santa Fe 1234, Club Social'];
const SABOR = ['*Jueves 15/10*', 'Evento: Encuentro con Vecinos Ezequiel Sabor, Comuna 5', 'Hora: 09:45h', 'Lugar: Bulnes 1000, Club'];
const TAPIA = ['*Sábado 17/10*', 'Evento: Encuentro con Vecinos Gabino Tapia, Núñez', 'Hora: 10:00h', 'Lugar: Cabildo 2000, Club'];
const MACRI15 = ['*Jueves 15/10*', 'Evento: Encuentro "1 a 1" Jorge Macri, Villa Santa Rita', 'Hora: 11:00h', 'Lugar: Calle Inventada 100, Plaza'];
const MACRI_EN = function (diaTxt, lugar) { return ['*' + diaTxt + '*', 'Evento: Encuentro "1 a 1" Jorge Macri, ' + lugar, 'Hora: 11:00h', 'Lugar: Calle Inventada 200, Club']; };
const MACRI23 = MACRI_EN('Viernes 23/10', 'Villa Santa Rita');
// v1 (lunes 12/10): todo normal (4 reuniones). v2r (martes 13/10): la de Macri del 15/10 en ROJO ENTERO. v2d: sin la de Macri (desaparece)
const V1 = mail(12, 9, [MUZZIO, SABOR, TAPIA, MACRI15], ASUNTO_12);
const V2R = mail(13, 14, [MUZZIO, SABOR, TAPIA, MACRI15], ASUNTO_12, [null, null, null, TODO_ROJO], 50);
const V2D = mail(13, 14, [MUZZIO, SABOR, TAPIA], ASUNTO_12, null, 50);
// la semana siguiente (llega el miércoles 14/10): Macri el viernes 23/10 en Villa Santa Rita (la reprogramación)
const W19 = function (bloque) { return mail(14, 16, [bloque], ASUNTO_19); };

const SIS_ON = { AGENDA_CANCELACION_AUTOMATICA: 'true', AGENDA_CANCELACION_MODO: "'suspender'" };
const REP_ON = Object.assign({ AGENDA_REPROGRAMADA: 'true' }, SIS_ON);
const ON = { coloresMail: true };
const cambios = function (E) { const h = E.ssI.hojas['REGISTRO_AGENDA_CAMBIOS']; return h ? h.v : []; };

// ============================== 1. ROJO + la misma figura y lugar el 23/10 → Reprogramada ==============================

console.log('[1] Macri 15/10 Villa Santa Rita en ROJO, y Macri 23/10 Villa Santa Rita en el mail de la semana siguiente');
let E = montar(true, [], REP_ON);
correr(E, false, [V1]);
const iM = fila(E, 'Jorge Macri', 15);
ok(iM > 0 && celda(E, iM, 'STATUS REUNIÓN') === 'en agenda', 'la corrida 1 crea la fila del 15/10 "en agenda"');
E.avisos = [];
let r = correr(E, false, [V1, V2R, W19(MACRI23)], ON);
const i23 = fila(E, 'Jorge Macri', 23);
ok(i23 > 0 && celda(E, i23, 'STATUS REUNIÓN') === 'en agenda', 'la del 23/10 se crea "en agenda" (fila ' + (i23 + 1) + ')');
ok(celda(E, iM, 'STATUS REUNIÓN') === 'Reprogramada' && celda(E, iM, 'agenda_status_escrito') === 'Reprogramada',
   'PRENDIDO: la del 15/10 queda "Reprogramada" (y agenda_status_escrito = Reprogramada) — ' + celda(E, iM, 'STATUS REUNIÓN'));
ok(fondo(E, iM, 'STATUS REUNIÓN') === SIS, 'con el color del sistema');
ok(r.reprogramar === 1 && r.suspender === 0 && r.borrar === 0, 'resumen: reprogramar 1, suspender 0, borrar 0 — ' + JSON.stringify({ rp: r.reprogramar, s: r.suspender }));
const uid23 = celda(E, i23, 'agenda_uid');
const nota = cambios(E).filter(function (x) { return x[1] === 'reprogramada' && x[2] === iM + 1; })[0];
ok(nota && nota[5] === 'reprogramada al 23/10/2026 (fila ' + (i23 + 1) + ', agenda_uid ' + uid23 + ')',
   'REGISTRO_AGENDA_CAMBIOS: "reprogramada al 23/10/2026 (fila N, agenda_uid …)", con el uid de la fila nueva — ' + JSON.stringify(nota && nota[5]));
ok(lineaCopia(E, /Jorge Macri/).some(function (x) { return /^reprogramada al 23\/10\/2026 \(fila \d+, agenda_uid /.test(x.cambios || ''); }),
   'archivo "Agenda", "Cambios": "reprogramada al 23/10/2026 (fila …)" — ' + JSON.stringify(lineaCopia(E, /Jorge Macri/)));
const pend = pendientes(E) || [];
ok(pend.some(function (x) { return x.join(' | ').indexOf('cancelación aplicada (Reprogramada)') >= 0 && /reprogramada al 23\/10\/2026/.test(x.join(' | ')); }),
   'AGENDA_PENDIENTES: "cancelación aplicada (Reprogramada)", con la fecha nueva');
ok(E.avisos.some(function (a) { return a[0] === 'suspendidas' && /→ Reprogramada/.test(a[1]) && /reprogramada al 23\/10\/2026/.test(a[1]); }),
   'aviso "suspendidas": "→ Reprogramada (… reprogramada al 23/10/2026 …)" — ' + JSON.stringify(E.avisos));
r = correr(E, false, [V1, V2R, W19(MACRI23)], ON);
ok(!r.reprogramar && r.suspender === 0 && r.reactivar === 0 && celda(E, iM, 'STATUS REUNIÓN') === 'Reprogramada', 'la corrida siguiente: no la toca (ni se reactiva)');
const V3 = mail(14, 18, [MUZZIO, SABOR, TAPIA, MACRI15], ASUNTO_12);
r = correr(E, false, [V1, V2R, W19(MACRI23), V3], ON);
ok(!r.reactivar && celda(E, iM, 'STATUS REUNIÓN') === 'Reprogramada', 'una v3 SIN el rojo: una "Reprogramada" del sistema nunca se reactiva sola');
E.ctx.__m = [V1, V2R, W19(MACRI23)]; E.ctx.__g = geocodificador(E);
const audit = E.run('auditoriaAgenda({ mails: __m, geocodificar: __g })');
// (el Barrio vacío de la fila es otra diferencia, la de siempre: la dirección inventada no se geocodifica)
const audM = audit.noOk.filter(function (t) { return /Jorge Macri/.test(t) && /15\/10/.test(t) && /STATUS|cancela/.test(t); });
const logM = E.logs.filter(function (l) { return /y la fila está Reprogramada \(reprogramada al 23\/10\/2026 \(fila \d+/.test(l); });
ok(!audM.length && logM.length >= 1 && !(audit.reuniones || []).some(function (x) { return x.fila === iM + 1 && x.difs.indexOf('STATUS REUNIÓN') >= 0; }),
   'la auditoría (paso 66): la Reprogramada refleja la cancelación ("OK: … y la fila está Reprogramada (reprogramada al 23/10/2026 …)") — ' + JSON.stringify(audM));
// 20/10 (el hueco del 6c): la Reprogramada del sistema que después recibe asistentes → el aviso "suspendida_con_datos", una sola vez
E.D.v[iM][E.C('Asistentes')] = 12;
E.avisos = [];
correr(E, false, [V1, V2R, W19(MACRI23)], ON);
correr(E, false, [V1, V2R, W19(MACRI23)], ON);
const avCD = (E.avisos || []).filter(function (a) { return a[0] === 'suspendida_con_datos'; });
ok(avCD.length === 1 && /Reprogramada/.test(avCD[0][1]) && /asistentes \(12\)/.test(avCD[0][1]) && /el STATUS sigue "Reprogramada"/.test(avCD[0][1]) &&
   celda(E, iM, 'STATUS REUNIÓN') === 'Reprogramada',
   'una Reprogramada del sistema con asistentes: un solo aviso "suspendida_con_datos" en dos corridas, y no se pisa nada — ' + JSON.stringify(avCD));

// ============================== 1b. APAGADO: Suspendida ==============================

console.log('[1b] lo mismo, APAGADO → Suspendida (como siempre)');
E = montar(true, [], SIS_ON);
correr(E, false, [V1]);
r = correr(E, false, [V1, V2R, W19(MACRI23)], ON);
ok(celda(E, fila(E, 'Jorge Macri', 15), 'STATUS REUNIÓN') === 'Suspendida' && r.suspender === 1 && r.reprogramar === undefined,
   'APAGADO: "Suspendida", y el resumen sin la clave "reprogramar"');
ok(!cambios(E).some(function (x) { return x[1] === 'reprogramada'; }), 'APAGADO: ninguna nota "reprogramada"');

// ============================== 2. desaparecida (paso 7) con la fecha nueva → Reprogramada ==============================

console.log('[2] la de Macri DESAPARECE del mail (v2 completa, sin ella) y está el 23/10 → Reprogramada (paso 7)');
E = montar(true, [], REP_ON);
correr(E, false, [V1]);
r = correr(E, false, [V1, V2D, W19(MACRI23)], ON);
const i2 = fila(E, 'Jorge Macri', 15);
ok(celda(E, i2, 'STATUS REUNIÓN') === 'Reprogramada' && celda(E, i2, 'agenda_status_escrito') === 'Reprogramada' && r.reprogramar === 1,
   'desaparecida: "Reprogramada" — ' + celda(E, i2, 'STATUS REUNIÓN'));
ok(lineaCopia(E, /Jorge Macri/).some(function (x) { return x.estado === 'desaparecida: Reprogramada' && /^reprogramada al 23\/10\/2026/.test(x.cambios || ''); }),
   'la copia: "desaparecida: Reprogramada", "Cambios" con la fecha nueva — ' + JSON.stringify(lineaCopia(E, /Jorge Macri/)));
// la auditoría de cancelaciones (paso 68): REFLEJADA, con la fecha nueva
E.ctx.__m = [V1, V2D, W19(MACRI23)];
const antes68 = foto(E.D);
const a68 = E.run('auditoriaCancelaciones({ mails: __m, desde: new Date(2026, 9, 12, 12), hasta: new Date(2026, 9, 25, 12) })');
const h68 = ((a68 && a68.hallazgos) || []).concat([]);
const log68 = E.logs.filter(function (l) { return /la fila está Reprogramada: reprogramada al 23\/10\/2026 \(fila \d+/.test(l); });
ok(foto(E.D) === antes68 && log68.length >= 1 && E.logs.some(function (l) { return /^\s*\[REFLEJADA\] 15\/10\/2026 11:00 \| Jorge Macri/.test(l); }),
   'paso 68: la desaparecida está REFLEJADA ("la fila está Reprogramada: reprogramada al 23/10/2026 (fila …)") y no escribe nada — ' + JSON.stringify(h68.length));

// ============================== 3. Suspendida por el sistema → la fecha nueva llega después → Reprogramada ==============================

console.log('[3] el sistema la suspende (todavía sin la fecha nueva); la fecha nueva llega en un mail posterior → Suspendida → Reprogramada');
E = montar(true, [], REP_ON);
correr(E, false, [V1]);
r = correr(E, false, [V1, V2D], ON);
const i3 = fila(E, 'Jorge Macri', 15);
ok(celda(E, i3, 'STATUS REUNIÓN') === 'Suspendida' && r.suspender === 1 && r.reprogramar === 0, 'sin la reunión nueva: "Suspendida" (del sistema)');
r = correr(E, false, [V1, V2D, W19(MACRI23)], ON);
ok(celda(E, i3, 'STATUS REUNIÓN') === 'Reprogramada' && celda(E, i3, 'agenda_status_escrito') === 'Reprogramada' && r.reprogramar === 1 &&
   r.reprogramadasDesdeSuspendida === 1, 'llega el 23/10: Suspendida → Reprogramada');
const nota3 = cambios(E).filter(function (x) { return x[1] === 'reprogramada' && x[2] === i3 + 1; })[0];
ok(nota3 && /^reprogramada al 23\/10\/2026 \(fila \d+, agenda_uid .+\) \(antes: Suspendida por el sistema\)$/.test(nota3[5]), 'la nota lo dice — ' + (nota3 && nota3[5]));
// el rojo, igual (paso 7b)
E = montar(true, [], REP_ON);
correr(E, false, [V1]);
correr(E, false, [V1, V2R], ON);
const i3b = fila(E, 'Jorge Macri', 15);
ok(celda(E, i3b, 'STATUS REUNIÓN') === 'Suspendida', 'en rojo, sin la reunión nueva: "Suspendida"');
r = correr(E, false, [V1, V2R, W19(MACRI23)], ON);
ok(celda(E, i3b, 'STATUS REUNIÓN') === 'Reprogramada' && r.reprogramar === 1, 'en rojo, llega el 23/10: Suspendida → Reprogramada (paso 7b)');
// deshacer (paso 38) la vuelve a Suspendida
E.run('deshacerAgenda(false)');
ok(celda(E, i3b, 'STATUS REUNIÓN') === 'Suspendida' && celda(E, i3b, 'agenda_status_escrito') === 'Suspendida', 'deshacer (paso 38): vuelve a "Suspendida"');

// ============================== 4. una Suspendida del EQUIPO no se toca (el caso Clara Muzzio 09/09 → 18/09) ==============================

console.log('[4] la fila es "Suspendida" del EQUIPO: no se toca; el paso 110 sólo la cuenta');
E = montar(true, [], REP_ON);
correr(E, false, [V1]);
const i4 = fila(E, 'Jorge Macri', 15);
E.D.v[i4][E.C('STATUS REUNIÓN')] = 'Suspendida';   // la cambió el equipo (agenda_status_escrito sigue "en agenda")
const antes4 = E.D.v[i4].slice();
r = correr(E, false, [V1, V2R, W19(MACRI23)], ON);
ok(celda(E, i4, 'STATUS REUNIÓN') === 'Suspendida' && celda(E, i4, 'agenda_status_escrito') === antes4[E.C('agenda_status_escrito')] && r.reprogramar === 0,
   'sigue "Suspendida" (del equipo): no se toca');
// la medición (paso 110): NO COINCIDE (el equipo la tiene Suspendida; la regla diría Reprogramada)
E.ctx.__m = [V1, V2R, W19(MACRI23)]; E.ctx.__g = geocodificador(E);
let antes = foto(E.D);
const m110 = E.run('medirReprogramadas({ desde: "2026-10-12", mails: __m, geocodificar: __g, elecciones: new Map(), historial: leerHistorialAgenda_() })');
ok(foto(E.D) === antes, 'paso 110: no escribe nada');
const l4 = m110.lineas.filter(function (l) { return l.fila === i4 + 1; })[0];
ok(l4 && l4.regla === 'Reprogramada' && l4.tipo === 'noCoincide' && l4.fechaNueva === '23/10/2026' && l4.filaNueva === fila(E, 'Jorge Macri', 23) + 1,
   'paso 110: la regla diría "Reprogramada" al 23/10 (fila nueva), el equipo la tiene Suspendida → NO COINCIDE — ' + JSON.stringify(l4));
// y una que ya quedó Reprogramada: COINCIDE
{
  const X = montar(true, [], REP_ON);
  correr(X, false, [V1]);
  correr(X, false, [V1, V2R, W19(MACRI23)], ON);
  X.ctx.__m = [V1, V2R, W19(MACRI23)]; X.ctx.__g = geocodificador(X);
  const m = X.run('medirReprogramadas({ desde: "2026-10-12", mails: __m, geocodificar: __g, elecciones: new Map(), historial: leerHistorialAgenda_() })');
  const l = m.lineas.filter(function (x) { return x.fila === fila(X, 'Jorge Macri', 15) + 1; })[0];
  ok(l && l.tipo === 'coincide' && l.regla === 'Reprogramada', 'paso 110: la que ya está "Reprogramada" → COINCIDE — ' + JSON.stringify(l && l.tipo));
}

// ============================== 5. lo que NO es una reprogramación → Suspendida ==============================

console.log('[5] otra figura, otro lugar, otro barrio de la misma comuna, una fecha anterior, a más de 21 días → Suspendida');
const caso = function (bloqueNuevo, asunto, que, diaMail, mesMail) {
  const X = montar(true, [], REP_ON);
  correr(X, false, [V1]);
  const extra = bloqueNuevo ? [mail(diaMail || 14, 16, [bloqueNuevo], asunto || ASUNTO_19, null, 0, mesMail)] : [];
  const rr = correr(X, false, [V1, V2R].concat(extra), ON);
  ok(celda(X, fila(X, 'Jorge Macri', 15), 'STATUS REUNIÓN') === 'Suspendida' && rr.suspender === 1 && rr.reprogramar === 0, que + ' → "Suspendida"');
};
caso(['*Viernes 23/10*', 'Evento: Encuentro con Vecinos Gabino Tapia, Villa Santa Rita', 'Hora: 11:00h', 'Lugar: Calle Inventada 200, Club'], null,
     'OTRA FIGURA (Tapia) el 23/10 en Villa Santa Rita');
caso(MACRI_EN('Viernes 23/10', 'Recoleta'), null, 'Macri el 23/10 en OTRO LUGAR (Recoleta, otra comuna)');
caso(MACRI_EN('Viernes 23/10', 'Villa Devoto'), null, 'Macri el 23/10 en Villa Devoto (la misma comuna 11, pero OTRO BARRIO: manda el barrio)');
caso(MACRI_EN('Viernes 6/11', 'Villa Santa Rita'), ASUNTO_02, 'Macri el 06/11 en Villa Santa Rita (a 22 días: MÁS de 21)');
caso(null, null, 'sin ninguna otra reunión de Macri');
// una fecha ANTERIOR (el mismo mail, el 14/10 en Villa Santa Rita)
{
  const X = montar(true, [], REP_ON);
  const V1b = mail(12, 9, [MUZZIO, MACRI_EN('Miércoles 14/10', 'Villa Santa Rita'), SABOR, TAPIA, MACRI15], ASUNTO_12);
  const V2b = mail(13, 14, [MUZZIO, MACRI_EN('Miércoles 14/10', 'Villa Santa Rita'), SABOR, TAPIA, MACRI15], ASUNTO_12, [null, null, null, null, TODO_ROJO], 50);
  correr(X, false, [V1b]);
  const rr = correr(X, false, [V1b, V2b], ON);
  ok(celda(X, fila(X, 'Jorge Macri', 15), 'STATUS REUNIÓN') === 'Suspendida' && rr.reprogramar === 0, 'Macri el 14/10 (ANTERIOR) en Villa Santa Rita → "Suspendida"');
}
// a 21 días justos (05/11): sí
{
  const X = montar(true, [], REP_ON);
  correr(X, false, [V1]);
  const rr = correr(X, false, [V1, V2R, mail(14, 16, [MACRI_EN('Jueves 5/11', 'Villa Santa Rita')], ASUNTO_02)], ON);
  ok(celda(X, fila(X, 'Jorge Macri', 15), 'STATUS REUNIÓN') === 'Reprogramada' && rr.reprogramar === 1, 'Macri el 05/11 (a 21 días justos) en Villa Santa Rita → "Reprogramada"');
}
// la misma comuna sin barrio en el mail ("Comuna 11" en los dos): cuenta (el mismo "Lugar (mail)")
{
  const X = montar(true, [], REP_ON);
  const M15c = ['*Jueves 15/10*', 'Evento: Encuentro "1 a 1" Jorge Macri, Comuna 11', 'Hora: 11:00h', 'Lugar: Calle Inventada 100, Plaza'];
  const V1c = mail(12, 9, [MUZZIO, SABOR, TAPIA, M15c], ASUNTO_12);
  const V2c = mail(13, 14, [MUZZIO, SABOR, TAPIA, M15c], ASUNTO_12, [null, null, null, TODO_ROJO], 50);
  correr(X, false, [V1c]);
  const rr = correr(X, false, [V1c, V2c, W19(MACRI_EN('Viernes 23/10', 'Comuna 11'))], ON);
  ok(celda(X, fila(X, 'Jorge Macri', 15), 'STATUS REUNIÓN') === 'Reprogramada' && rr.reprogramar === 1, '"Comuna 11" → "Comuna 11" (el mismo Lugar (mail)): "Reprogramada"');
}
// una reunión NUEVA que también está en rojo no es la reprogramación
{
  const X = montar(true, [], REP_ON);
  correr(X, false, [V1]);
  const W19r = mail(14, 16, [MACRI23], ASUNTO_19, [TODO_ROJO]);
  const rr = correr(X, false, [V1, V2R, W19r], ON);
  ok(celda(X, fila(X, 'Jorge Macri', 15), 'STATUS REUNIÓN') === 'Suspendida' && rr.reprogramar === 0, 'la del 23/10 TAMBIÉN en rojo: no es la reprogramación → "Suspendida"');
}

// ============================== 6. los resguardos de J ==============================

console.log('[6] los resguardos de J: el mail posterior a la reunión, otro STATUS');
{
  const X = montar(true, [], REP_ON);
  correr(X, false, [V1]);
  const tarde = mail(15, 11, [MUZZIO, SABOR, TAPIA, MACRI15], ASUNTO_12, [null, null, null, TODO_ROJO], 30);   // 11:30, la reunión era 11:00
  const rr = correr(X, false, [V1, tarde, W19(MACRI23)], ON);
  ok(celda(X, fila(X, 'Jorge Macri', 15), 'STATUS REUNIÓN') === 'en agenda' && rr.reprogramar === 0, 'el mail en rojo es POSTERIOR a la reunión: no se toca');
  const Y = montar(true, [], REP_ON);
  correr(Y, false, [V1]);
  const iy = fila(Y, 'Jorge Macri', 15);
  Y.D.v[iy][Y.C('STATUS REUNIÓN')] = 'Realizada';
  const ry = correr(Y, false, [V1, V2R, W19(MACRI23)], ON);
  ok(celda(Y, iy, 'STATUS REUNIÓN') === 'Realizada' && ry.reprogramar === 0, 'la fila está "Realizada": no se toca');
}

// ============================== 7. APAGADO = IDÉNTICO al código de antes ==============================

console.log('[7] APAGADO: la base, el registro, la copia y el plan IDÉNTICOS al código de antes (' + BASE_GIT + ')');
if (!fuenteDeGit('40_Agenda.js')) console.log('  (no se pudo leer el commit ' + BASE_GIT + ': se saltea)');
else {
  const escenarios = [
    ['rojo + 23/10', [[V1], [V1, V2R, W19(MACRI23)], [V1, V2R, W19(MACRI23)]]],
    ['desaparecida, después 23/10', [[V1], [V1, V2D], [V1, V2D, W19(MACRI23)]]],
    ['otro lugar', [[V1], [V1, V2R, mail(14, 16, [MACRI_EN('Viernes 23/10', 'Recoleta')], ASUNTO_19)]]]
  ];
  escenarios.forEach(function (esc) {
    const N = montar(true, [], SIS_ON), V = montar(true, [], SIS_ON, true);
    const plan = function (X, ms) {
      X.ctx.__m = ms; X.ctx.__g = geocodificador(X);
      return X.run('(function () { var d = leerDestino_(), A = indicesAgenda_(d.hdr); var r = agendaDesdeListaDeMails_(__m, { fuente: "x", coloresMail: true }); ' +
                   'var P = planAgenda_(d, r, A, alcanceAgenda_(), { enSeco: true, geocodificar: __g, conjunto: new Map(), historial: leerHistorialAgenda_(), elecciones: new Map(), coloresMail: true }); ' +
                   'return JSON.stringify({ a: P.acciones.map(function (a) { return [a.tipo, a.fila || (a.f && a.f.fila), a.detalle, a.escrituras.map(function (e) { return [e.fila, e.col, String(e.valor), String(e.esperado)]; })]; }), ' +
                   'r: P.resumen, d: P.duplicados.map(function (x) { return [x.tipo, (x.candidatas || []).map(function (c) { return c.diferencia; })]; }), ' +
                   'c: P.copia.map(function (c) { return [c.estado, c.cambios]; }), e: P.cancelacionesEvaluadas.map(function (x) { return [x.decision, x.f && x.f.fila, Object.keys(x).sort()]; }), ' +
                   'm: P.modos, s: P.suspendidasAuto.map(function (x) { return Object.keys(x).sort(); }), k: Object.keys(P).sort() }).replace(/uuid-\\d+/g, "u"); })()');
    };
    let iguales = true, cuando = '';
    esc[1].forEach(function (ms, k) {
      const pn = plan(N, ms), pv = plan(V, ms);
      if (pn !== pv && iguales) { iguales = false; cuando = 'plan de la corrida ' + (k + 1) + ': ' + pn.slice(0, 400) + ' ≠ ' + pv.slice(0, 400); }
      N.avisos = []; V.avisos = [];
      const rn = JSON.stringify(correr(N, false, ms, ON)), rv = JSON.stringify(correr(V, false, ms, ON));
      if (rn !== rv && iguales) { iguales = false; cuando = 'resumen de la corrida ' + (k + 1) + ': ' + rn + ' ≠ ' + rv; }
      if (JSON.stringify(N.avisos) !== JSON.stringify(V.avisos) && iguales) { iguales = false; cuando = 'avisos de la corrida ' + (k + 1); }
    });
    const reg = function (X) { return JSON.stringify((X.ssI.hojas['REGISTRO_AGENDA_CAMBIOS'] || { v: [] }).v); };
    const cop = function (X) { const h = X.planilla(X.run('AGENDA_COPIA_SS')).hojas['Agenda']; return JSON.stringify(h ? h.v : null); };
    const pen = function (X) { return JSON.stringify(pendientes(X)); };
    ok(iguales && foto(N.D) === foto(V.D) && reg(N) === reg(V) && cop(N) === cop(V) && pen(N) === pen(V),
       esc[0] + ': idéntico (plan, resumen, avisos, base con fondos, REGISTRO_AGENDA_CAMBIOS, copia, AGENDA_PENDIENTES)' + (cuando ? ' — ' + cuando : ''));
  });
}

// ============================== 8. 00_Config.js y las transiciones ==============================

console.log('[8] 00_Config.js: APAGADO, 21 días, y las transiciones nuevas sólo desde "en agenda" y "Suspendida"');
const cfgTxt = fs.readFileSync(path.join(RAIZ, '00_Config.js'), 'utf8');
ok(/^const AGENDA_REPROGRAMADA = false;/m.test(cfgTxt) && /^const AGENDA_REPROGRAMADA_DIAS = 21;/m.test(cfgTxt), 'AGENDA_REPROGRAMADA = false y AGENDA_REPROGRAMADA_DIAS = 21');
E = montar(true, [], {});
const tr = E.run('JSON.stringify(AGENDA_TRANSICIONES_STATUS.filter(function (t) { return normStatus_(t.hacia) === "reprogramada"; }).map(function (t) { return t.desde; }))');
ok(tr === JSON.stringify(['en agenda', 'Suspendida']), 'hacia "Reprogramada": sólo desde "en agenda" y "Suspendida" — ' + tr);
ok(E.run('AGENDA_TRANSICIONES_STATUS.some(function (t) { return normStatus_(t.desde) === "reprogramada"; })') === false, 'y ninguna DESDE "Reprogramada" (nunca se reactiva sola)');
ok(/reprogramada: false/.test(fs.readFileSync(path.join(RAIZ, '52_CancelacionMail.js'), 'utf8')), 'los pasos 91 / 92 suspenden (reprogramada: false por opciones)');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
