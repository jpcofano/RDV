/**
 * tests/agenda_conjunto_cancela.test.js — 16/10: RDV CONJUNTO como TERCERA fuente de cancelación (AGENDA_CANCELACION_CONJUNTO,
 * 53_CancelacionConjunto.js, paso 7d de planAgenda_): "Cancelado" → Suspendida (sólo "en agenda"), otro STATUS → aviso (una
 * vez), el par "Cancelado" + "Realizada" de la misma figura ese día (caso Macri 15/10) → no se suspende, el cruce ambiguo → no se
 * suspende, la suspendida no se reactiva por el mail, RDV CONJUNTO NUNCA se escribe, el interruptor apagado = idéntico, y la
 * medición en seco del paso 95 (diagnostico/36). Destino SIMULADO, RDV CONJUNTO y mails SINTÉTICOS (el mock es el de
 * tests/agenda_rojo_cancela.test.js). "Hoy" es el jueves 15/10/2026.
 *
 *     node tests/agenda_conjunto_cancela.test.js
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
                  '53_CancelacionConjunto.js', 'diagnostico/36_cancelaciones_conjunto.js'];
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
  // 16/10: con Dirección y Estado (las dos columnas de oradores, como en la de verdad, inmediatamente después de Asistentes)
  ssD.hojas['RDV CONJUNTO'] = new E.Hoja('RDV CONJUNTO', [['Figura', 'Barrio', 'FECHA', 'Dirección', 'Asistentes', 'Oradores anotados', 'Oradores que hablaron', 'Estado']]
    .concat((arguments[3] || []).map(function (r) { return r.slice(); })));
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


// ============================== los mails (inventados) y RDV CONJUNTO (sintético) ==============================

const ASUNTO_12 = 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 12/10 al 18/10';
const NL = String.fromCharCode(10);
let idMail = 0;
function mail(dia, hora, bloques, asunto) {
  return { fecha: new D(2026, 9, dia, hora, 0), asunto: asunto, cuerpo: [].concat.apply([], bloques).join(NL), truncado: false, id: 'm' + (++idMail) };
}
const MUZZIO = ['*Miércoles 14/10*', 'Evento: Encuentro con Vecinos Clara Muzzio, Recoleta', 'Hora: 18:30h', 'Lugar: Av. Santa Fe 1234, Club Social'];
const SABOR = ['*Jueves 15/10*', 'Evento: Encuentro con Vecinos Ezequiel Sabor, Comuna 5', 'Hora: 09:45h', 'Lugar: Bulnes 1000, Club'];
const M1 = mail(12, 9, [MUZZIO, SABOR], ASUNTO_12);

const SIS_ON = { AGENDA_CANCELACION_AUTOMATICA: 'true', AGENDA_CANCELACION_MODO: "'suspender'" };
const ON = Object.assign({}, SIS_ON, { AGENDA_CANCELACION_CONJUNTO: 'true' });
/** Una fila del equipo en la base (sin agenda_uid). */
const filaEquipo = function (fig, barrio, d, extra) {
  return function (r, C) {
    r[C('Figura')] = fig; r[C('Barrio')] = barrio; r[C('FECHA')] = dia(d); r[C('HORA')] = (extra && extra.hora) || '18:00';
    r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = (extra && extra.status) || 'en agenda';
    if (extra && extra.dir) r[C('Dirección')] = extra.dir;
    if (extra && extra.asis != null) r[C('Asistentes')] = extra.asis;
  };
};
/** Una fila de RDV CONJUNTO: Figura | Barrio | FECHA | Dirección | Asistentes | Oradores anotados | Oradores que hablaron | Estado. */
const cj = function (nombre, barrio, d, dir, asis, estado) { return [nombre, barrio, dia(d), dir || '', asis == null ? '' : asis, '', '', estado]; };
const filaBase = function (E, fig, d, barrio) {
  for (let i = 1; i < E.D.v.length; i++) {
    const r = E.D.v[i], f = r[E.C('FECHA')];
    if (r[E.C('Figura')] === fig && f instanceof Date && f.getDate() === d && f.getMonth() === 9 && (barrio === undefined || r[E.C('Barrio')] === barrio)) return i;
  }
  return -1;
};
const conj = function (E) { return E.ssD.hojas['RDV CONJUNTO']; };
const cambiosReg = function (E, tipo) { const h = E.ssI.hojas['REGISTRO_AGENDA_CAMBIOS']; return h ? h.v.filter(function (x) { return x[1] === tipo; }) : []; };

// ============================== 1. "Cancelado" → Suspendida ==============================

console.log('[1] "Cancelado" en RDV CONJUNTO → la fila "en agenda" pasa a Suspendida (también una fila "No aplica")');
let E = montar(true, [filaEquipo('Ezequiel Sabor', 'Almagro', 15, { hora: '09:45', dir: 'Bulnes 1000' })], ON,
               [cj('Sabor Ezequiel', 'Almagro', 15, 'Bulnes 1000', '', 'Cancelado'),
                cj('Alonso Laura', 'Flores', 7, '', 'No aplica', 'CANCELADA'),
                cj('Muzzio Clara', 'Recoleta', 14, 'Av. Santa Fe 1234', 50, 'Realizada')]);
let fotoCj = foto(conj(E));
E.avisos = [];
let r = correr(E, false, [M1]);
const iS = filaBase(E, 'Ezequiel Sabor', 15), iA = filaBase(E, 'Laura Alonso', 7);
ok(celda(E, iS, 'STATUS REUNIÓN') === 'Suspendida' && celda(E, iS, 'agenda_status_escrito') === 'Suspendida' && fondo(E, iS, 'STATUS REUNIÓN') === SIS,
   'Sabor 15/10: Suspendida (y agenda_status_escrito), con el color del sistema');
ok(!!celda(E, iS, 'agenda_uid'), 'con agenda_uid (para la nota del registro): ' + celda(E, iS, 'agenda_uid'));
ok(celda(E, iA, 'STATUS REUNIÓN') === 'Suspendida' && !!celda(E, iA, 'agenda_uid'), 'Alonso 07/10 (Asistentes "No aplica" en RDV CONJUNTO): también Suspendida, con su uid');
ok(r.suspendidasPorConjunto === 2 && r.canceladasEnConjunto === 2 && r.borrar === 0, 'resumen: 2 suspendidas por RDV CONJUNTO, nunca se borra — ' + JSON.stringify({ s: r.suspendidasPorConjunto, c: r.canceladasEnConjunto, b: r.borrar }));
ok(celda(E, filaBase(E, 'Clara Muzzio', 14), 'STATUS REUNIÓN') === 'en agenda', 'la de Muzzio (RDV CONJUNTO "Realizada") no se toca');
ok(E.avisos.filter(function (a) { return a[0] === 'suspendidas' && /Cancelado en RDV CONJUNTO fila \d/.test(a[1]); }).length === 2, 'aviso "suspendidas" (Cancelado en RDV CONJUNTO fila N) por cada una');
ok(!E.avisos.some(function (a) { return a[0] === 'cancelacion_no_aplicada'; }), 'ningún cancelacion_no_aplicada');
ok(cambiosReg(E, 'suspendida_conjunto').length === 2 && cambiosReg(E, 'suspendida_conjunto').every(function (x) { return !!x[8]; }),
   'REGISTRO_AGENDA_CAMBIOS: "suspendida_conjunto" con el uid de cada fila');
ok(lineaCopia(E, /Ezequiel Sabor/).some(function (x) { return x.cambios === 'suspendida: Cancelado en RDV CONJUNTO' && x.status === 'Suspendida'; }),
   'archivo "Agenda": "Cambios" = "suspendida: Cancelado en RDV CONJUNTO", STATUS Suspendida — ' + JSON.stringify(lineaCopia(E, /Ezequiel Sabor/)));
ok(foto(conj(E)) === fotoCj, 'RDV CONJUNTO NO se escribió (valores y fondos iguales)');
r = correr(E, false, [M1]);
ok(r.suspender === 0 && r.reactivar === 0 && celda(E, iS, 'STATUS REUNIÓN') === 'Suspendida', 'la corrida siguiente: ni se vuelve a suspender ni la reactiva el mail (la reunión sigue en el mail)');
ok(lineaCopia(E, /Ezequiel Sabor/).some(function (x) { return x.cambios === 'suspendida: Cancelado en RDV CONJUNTO'; }), 'y la copia lo sigue diciendo (por el registro)');
r = correr(E, false, [M1], { cancelacionConjunto: false });
ok(r.reactivar === 0 && celda(E, iS, 'STATUS REUNIÓN') === 'Suspendida', 'con el interruptor APAGADO después: tampoco se reactiva (la nota del registro)');
// el equipo corrige RDV CONJUNTO (ya no "Cancelado"): igual no se reactiva sola
conj(E).v[1][7] = 'Realizada'; fotoCj = foto(conj(E));
r = correr(E, false, [M1]);
ok(r.reactivar === 0 && celda(E, iS, 'STATUS REUNIÓN') === 'Suspendida' && foto(conj(E)) === fotoCj, 'RDV CONJUNTO ya no dice Cancelado: no se reactiva sola (la vuelve atrás el equipo) y RDV CONJUNTO sigue sin escribirse');
// el equipo la vuelve a "en agenda" a mano, con RDV CONJUNTO todavía "Cancelado": no se vuelve a suspender (es de ellos)
conj(E).v[1][7] = 'Cancelado';
E.D.v[iS][E.C('STATUS REUNIÓN')] = 'en agenda';
r = correr(E, false, [M1]);
ok(celda(E, iS, 'STATUS REUNIÓN') === 'en agenda' && r.suspendidasPorConjunto === 0 &&
   E.logs.some(function (l) { return /no se vuelve a suspender/.test(l); }), 'el equipo la volvió a "en agenda": no se vuelve a suspender (y el log lo dice)');

// ============================== 2. otro STATUS / asistentes: no se toca, aviso UNA vez ==============================

console.log('[2] la fila de la base está Realizada (o "en agenda" con asistentes): no se toca y se avisa una sola vez');
E = montar(true, [filaEquipo('Gabino Tapia', 'Núñez', 15, { status: 'Realizada', asis: 20 }), filaEquipo('Hernán Lombardi', 'Palermo', 15, { asis: 12 })], ON,
           [cj('Tapia Gabino', 'Núñez', 15, '', '', 'Cancelado'), cj('Lombardi Hernán', 'Palermo', 15, '', '', 'Cancelado')]);
fotoCj = foto(conj(E));
E.avisos = [];
r = correr(E, false, [M1]);
const iT = filaBase(E, 'Gabino Tapia', 15), iL = filaBase(E, 'Hernán Lombardi', 15);
ok(celda(E, iT, 'STATUS REUNIÓN') === 'Realizada' && celda(E, iT, 'Asistentes') === 20 && celda(E, iL, 'STATUS REUNIÓN') === 'en agenda' && r.suspendidasPorConjunto === 0,
   'Tapia Realizada (20) y Lombardi "en agenda" con asistentes 12: no se tocan');
const noAp = E.avisos.filter(function (a) { return a[0] === 'cancelacion_no_aplicada'; });
ok(noAp.length === 2 && noAp.some(function (a) { return /Realizada/.test(a[1]) && /asistentes 20/.test(a[1]) && /Cancelado/.test(a[1]); }) &&
   noAp.some(function (a) { return /asistentes \(la base: 12\)/.test(a[1]); }), 'aviso cancelacion_no_aplicada por cada una — ' + JSON.stringify(noAp));
E.avisos = [];
correr(E, false, [M1]);
ok(!E.avisos.some(function (a) { return a[0] === 'cancelacion_no_aplicada'; }), 'la corrida siguiente NO repite el aviso (una vez por fila: la propiedad)');
ok(!!(E.props && E.props[E.run('AGENDA_PROP_CONJUNTO_AVISADAS')]), 'las avisadas, en la propiedad AGENDA_PROP_CONJUNTO_AVISADAS');
ok(foto(conj(E)) === fotoCj, 'RDV CONJUNTO NO se escribió');

// ============================== 3. el caso Macri 15/10: Cancelado + Realizada ==============================

console.log('[3] el caso Macri 15/10: RDV CONJUNTO Villa Santa Rita "Cancelado" y Villa Devoto "Realizada", la misma dirección');
const PAR = [cj('Macri Jorge', 'Villa Santa Rita', 15, 'Calle Inventada 100', '', 'Cancelado'), cj('Macri Jorge', 'Villa Devoto', 15, 'Calle Inventada 100', 40, 'Realizada')];
E = montar(true, [filaEquipo('Jorge Macri', 'Villa Devoto', 15, { dir: 'Calle Inventada 100' })], ON, PAR);
fotoCj = foto(conj(E)); E.avisos = [];
r = correr(E, false, [M1]);
const iM = filaBase(E, 'Jorge Macri', 15);
ok(celda(E, iM, 'STATUS REUNIÓN') === 'en agenda' && r.suspendidasPorConjunto === 0, 'la base (Villa Devoto, una fila) es la Realizada: NO se suspende');
ok(!E.avisos.some(function (a) { return a[0] === 'cancelacion_no_aplicada'; }), 'y no avisa (es lo esperado)');
ok(E.logs.some(function (l) { return /CONJUNTO \|.*Villa Santa Rita.*fila de la base \d+ .*la de la base es la no cancelada/.test(l); }), 'el log lo dice');
ok(foto(conj(E)) === fotoCj, 'RDV CONJUNTO NO se escribió');
E = montar(true, [filaEquipo('Jorge Macri', '', 15, { dir: 'Calle Inventada 100' })], ON, PAR);
r = correr(E, false, [M1]);
ok(celda(E, filaBase(E, 'Jorge Macri', 15), 'STATUS REUNIÓN') === 'en agenda' && r.suspendidasPorConjunto === 0, 'la base SIN barrio, con el mismo par: NO se suspende (ambiguo)');
E = montar(true, [filaEquipo('Jorge Macri', 'Villa Santa Rita', 15, { dir: 'Calle Inventada 100' })], ON, PAR);
r = correr(E, false, [M1]);
ok(celda(E, filaBase(E, 'Jorge Macri', 15), 'STATUS REUNIÓN') === 'en agenda' && r.suspendidasPorConjunto === 0,
   'aunque la base diga Villa Santa Rita: con UNA fila en la base y el par, la de la base es la Realizada');
// 16/10 (revisor, ALTA): la base tiene UNA fila (Villa Devoto) y RDV CONJUNTO SÓLO la de Villa Santa Rita "Cancelado" (la de Villa
// Devoto todavía no se cargó): el lugar contradice → puede ser otra reunión: NO se suspende y se avisa
E = montar(true, [filaEquipo('Jorge Macri', 'Villa Devoto', 15, { dir: 'Calle Inventada 100' })], ON, [PAR[0]]);
E.avisos = [];
r = correr(E, false, [M1]);
ok(celda(E, filaBase(E, 'Jorge Macri', 15), 'STATUS REUNIÓN') === 'en agenda' && r.suspendidasPorConjunto === 0,
   'sólo "Cancelado" en Villa Santa Rita y la base en Villa Devoto: NO se suspende (el lugar contradice)');
ok(E.avisos.some(function (a) { return a[0] === 'cancelacion_no_aplicada' && /puede ser otra reunión/.test(a[1]); }), 'y se avisa (cancelacion_no_aplicada)');
console.log('[3b] DOS filas en la base (Villa Santa Rita y Villa Devoto, la misma dirección): se suspende sólo la cancelada');
E = montar(true, [filaEquipo('Jorge Macri', 'Villa Santa Rita', 15, { dir: 'Calle Inventada 100' }), filaEquipo('Jorge Macri', 'Villa Devoto', 15, { dir: 'Calle Inventada 100' })], ON, PAR);
fotoCj = foto(conj(E));
r = correr(E, false, [M1]);
ok(celda(E, filaBase(E, 'Jorge Macri', 15, 'Villa Santa Rita'), 'STATUS REUNIÓN') === 'Suspendida' && celda(E, filaBase(E, 'Jorge Macri', 15, 'Villa Devoto'), 'STATUS REUNIÓN') === 'en agenda' &&
   r.suspendidasPorConjunto === 1, 'Villa Santa Rita → Suspendida; Villa Devoto sigue "en agenda"');
ok(foto(conj(E)) === fotoCj, 'RDV CONJUNTO NO se escribió');
console.log('[3c] el cruce no es único: no se suspende nada');
E = montar(true, [filaEquipo('Jorge Macri', 'Villa Santa Rita', 15, { dir: 'Calle A 1' }), filaEquipo('Jorge Macri', 'Villa Devoto', 15, { dir: 'Calle B 2' })], ON,
           [cj('Macri Jorge', '', 15, '', '', 'Cancelado')]);
r = correr(E, false, [M1]);
ok(filasCon(E, 'Jorge Macri', 15).every(function (i) { return celda(E, i, 'STATUS REUNIÓN') === 'en agenda'; }) && r.suspendidasPorConjunto === 0,
   '"Cancelado" sin barrio ni dirección con dos filas de Macri ese día (ambiguo): ninguna se suspende');
E = montar(true, [filaEquipo('Jorge Macri', 'Villa Santa Rita', 15, { dir: 'Calle A 1' }), filaEquipo('Jorge Macri', 'Villa Devoto', 15, { dir: 'Calle B 2' })], ON,
           [cj('Macri Jorge', 'Villa Santa Rita', 15, '', '', 'Cancelado'), cj('Macri Jorge', '', 15, '', 30, 'Realizada')]);
r = correr(E, false, [M1]);
ok(filasCon(E, 'Jorge Macri', 15).every(function (i) { return celda(E, i, 'STATUS REUNIÓN') === 'en agenda'; }) && r.suspendidasPorConjunto === 0,
   'el "Cancelado" cruza con Villa Santa Rita, pero la "Realizada" de ese día no se pudo cruzar: no se sabe cuál es, no se suspende');

// ============================== 4. el interruptor apagado: idéntico ==============================

console.log('[4] AGENDA_CANCELACION_CONJUNTO apagado (o sin la cancelación automática): idéntico a no tener los "Cancelado"');
const extras4 = [filaEquipo('Ezequiel Sabor', 'Almagro', 15, { hora: '09:45', dir: 'Bulnes 1000' }), filaEquipo('Jorge Macri', 'Villa Santa Rita', 15)];
const cj4 = function (estado) { return [cj('Sabor Ezequiel', 'Almagro', 15, 'Bulnes 1000', '', estado), cj('Macri Jorge', 'Villa Santa Rita', 15, '', '', estado)]; };
const quieto = function (cfg, estado) {
  const X = montar(true, extras4, cfg, cj4(estado));
  const fc = foto(conj(X));
  const rr = correr(X, false, [M1]);
  return { d: foto(X.D).replace(/uuid-\d+/g, 'u'), r: JSON.stringify(rr).replace(/uuid-\d+/g, 'u'), conjIgual: foto(conj(X)) === fc, X: X };
};
const q0 = quieto(SIS_ON, ''), q1 = quieto(SIS_ON, 'Cancelado'), q2 = quieto(Object.assign({}, ON, { AGENDA_CANCELACION_AUTOMATICA: 'false' }), 'Cancelado');
ok(q0.d === q1.d && q0.r === q1.r, 'apagado: la base y el resumen, idénticos con o sin los "Cancelado"');
ok(q0.d === q2.d, 'prendido pero sin la cancelación automática (modo "suspender"): tampoco cambia nada');
ok(celda(q1.X, filaBase(q1.X, 'Ezequiel Sabor', 15), 'STATUS REUNIÓN') === 'en agenda', 'y la de Sabor sigue "en agenda"');
ok(q0.conjIgual && q1.conjIgual && q2.conjIgual, 'RDV CONJUNTO NO se escribió en ninguna');
ok(/const AGENDA_CANCELACION_CONJUNTO = false;/.test(fs.readFileSync(path.join(RAIZ, '00_Config.js'), 'utf8')), '00_Config.js: AGENDA_CANCELACION_CONJUNTO = false');
console.log('[4b] RDV CONJUNTO sin columna de estado: no se suspende nada (y se dice)');
E = montar(true, [filaEquipo('Ezequiel Sabor', 'Almagro', 15, { hora: '09:45' })], ON, [cj('Sabor Ezequiel', 'Almagro', 15, '', '', 'Cancelado')]);
conj(E).v[0][7] = 'Notas'; conj(E).v[1][7] = 'cualquier cosa';
r = correr(E, false, [M1]);
ok(celda(E, filaBase(E, 'Ezequiel Sabor', 15), 'STATUS REUNIÓN') === 'en agenda' && r.suspendidasPorConjunto === 0 &&
   E.logs.some(function (l) { return /no tiene columna de estado/.test(l); }), 'sin "Estado": nada, y el log lo dice');

// ============================== 5. la medición en seco (paso 95) ==============================

console.log('[5] medirCancelacionesConjunto({ desde: "2026-07-15" }): sólo lectura');
E = montar(true, [filaEquipo('Ezequiel Sabor', 'Almagro', 15, { hora: '09:45' }), filaEquipo('Gabino Tapia', 'Núñez', 15, { status: 'Realizada', asis: 20 }),
                  filaEquipo('Hernán Lombardi', 'Palermo', 13, { status: 'Suspendida' }), filaEquipo('Jorge Macri', 'Villa Devoto', 15, { dir: 'Calle Inventada 100' })], {},
           [cj('Sabor Ezequiel', 'Almagro', 15, '', '', 'Cancelado'), cj('Tapia Gabino', 'Núñez', 15, '', '', 'Cancelado'),
            cj('Lombardi Hernán', 'Palermo', 13, '', '', 'Cancelado'), cj('Muzzio Clara', 'Recoleta', 3, '', '', 'Cancelado'),
            cj('Sabor Ezequiel', 'Almagro', 1, '', '', 'Cancelado')].concat(PAR).concat([['Tapia Gabino', 'Núñez', new D(2026, 5, 1, 12), '', '', '', '', 'Cancelado']]));
const todas = function (X) {
  const t = {};
  [X.ssD, X.ssI].forEach(function (ss, k) { Object.keys(ss.hojas).forEach(function (n) { t[k + ':' + n] = foto(ss.hojas[n]); }); });
  return JSON.stringify(t) + JSON.stringify(X.props || {});
};
const antes5 = todas(E);
const R = E.run('medirCancelacionesConjunto({ desde: "2026-07-15" })');
ok(todas(E) === antes5, 'no escribió NADA (ninguna solapa de la base ni de la intermedia, ninguna propiedad)');
ok(R.canceladas === 6, '6 "Cancelado" desde el 15/07 (la de junio, afuera): ' + R.canceladas);
ok(R.coincide === 1 && R.noCoincide === 1 && R.seSuspenderia === 1, 'COINCIDE (Lombardi, ya Suspendida) 1 | NO COINCIDE (Tapia, Realizada) 1 | SE SUSPENDERÍA (Sabor 15/10) 1 — ' +
   JSON.stringify({ c: R.coincide, n: R.noCoincide, s: R.seSuspenderia }));
ok(R.sinFila === 2, 'sin fila en la base: Muzzio 03/10 y Sabor 01/10 — ' + R.sinFila);
ok(R.pares === 1 && R.paresQueNoSuspenden === 1 && R.decisiones.misma_fila_viva === 1, 'el par Macri 15/10: lo lista y no suspende (misma_fila_viva) — ' + JSON.stringify(R.decisiones));
ok(R.lineas.some(function (l) { return /NO COINCIDE \(Realizada, asistentes 20\)/.test(l); }), 'la Realizada muestra sus asistentes');
ok(E.logs.some(function (l) { return /^--- RESUMEN/.test(l); }) && E.logs.some(function (l) { return /^  PAR \|/.test(l); }), 'el log: la lista, los pares y el resumen');
// 16/10 (dato del usuario): "Estado" vale Realizada / Cancelado / Programado; un valor nuevo en el período se AVISA
ok(R.valoresNuevos === 0 && E.logs.some(function (l) { return /sólo los conocidos \(Realizada \/ Cancelado \/ Programado\)/.test(l); }),
   'sólo los valores conocidos: no avisa nada');
ok(E.run('esCanceladoConjunto_("Cancelado") && esCanceladoConjunto_(" Cancelado ") && esCanceladoConjunto_("Cancelada") && !esCanceladoConjunto_("Programado") && !esCanceladoConjunto_("Realizada")') === true,
   '"Cancelado" (exacto) y lo que contenga "cancel" cancelan; "Programado" y "Realizada" no');
{
  const X = montar(true, [filaEquipo('Ezequiel Sabor', 'Almagro', 15, { hora: '09:45' })], {},
                   [cj('Sabor Ezequiel', 'Almagro', 15, '', '', 'Postergado'), cj('Tapia Gabino', 'Núñez', 14, '', '', 'Programado')]);
  const R2 = X.run('medirCancelacionesConjunto({ desde: "2026-07-15" })');
  ok(R2.valoresNuevos === 1 && R2.estadosNuevos.Postergado === 1 && !R2.estadosNuevos.Programado &&
     X.logs.some(function (l) { return /AVISO: en el período, "Estado" de RDV CONJUNTO tiene valores que NO son los conocidos.*"Postergado" 1/.test(l); }),
     'un valor nuevo ("Postergado") en el período: el paso 95 lo AVISA — ' + JSON.stringify(R2.estadosNuevos));
  ok(R2.canceladas === 0, 'y "Postergado" no cuenta como cancelación');
}

// ============================== 6. la GUÍA / LEER, sólo con el interruptor ==============================

console.log('[6] GUÍA y LEER: la línea de RDV CONJUNTO sólo con el interruptor prendido');
const ayuda = function (cfg) {
  cfg = Object.assign({ FORMULARIOS_SIN_FILA_ACTIVA: 'false', AGENDA_MAIL_FORMATO_DIRECTA: 'false', AGENDA_CANCELACION_AUTOMATICA: 'true', AGENDA_CANCELACION_MODO: "'suspender'" }, cfg || {});
  const ctx = { console: console, Date: Date, Math: Math, JSON: JSON, Map: Map, Set: Set, Object: Object, Array: Array, String: String, Number: Number };
  vm.createContext(ctx);
  ['00_Config.js', '01_Utils.js', '27_RevisarFormato.js', '43_Ayuda.js'].forEach(function (f) {
    let s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    if (f === '00_Config.js') Object.keys(cfg).forEach(function (k) { s = s.replace(new RegExp('^const ' + k + '\\s+=.*', 'm'), 'const ' + k + ' = ' + cfg[k] + ';'); });
    vm.runInContext(s, ctx, { filename: f });
  });
  return vm.runInContext('filasAyuda_(AYUDA_GUIA_).concat(filasAyuda_(AYUDA_LEER_)).map(function (x) { return x.texto; }).join("\\n")', ctx);
};
ok(!/RDV CONJUNTO una reunión figura "Cancelado"/.test(ayuda({})) && !/Cancelado en RDV CONJUNTO/.test(ayuda({})), 'APAGADO: no aparece');
const a1 = ayuda({ AGENDA_CANCELACION_CONJUNTO: 'true' });
ok(/RDV CONJUNTO una reunión figura "Cancelado"/.test(a1) && /suspendida: Cancelado en RDV CONJUNTO/.test(a1), 'PRENDIDO: en la GUÍA y en LEER');
ok(!/Cancelado en RDV CONJUNTO/.test(ayuda({ AGENDA_CANCELACION_CONJUNTO: 'true', AGENDA_CANCELACION_AUTOMATICA: 'false' })), 'sin la cancelación automática: no aparece');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
