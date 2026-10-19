/**
 * tests/barrio_aproximado.test.js — 19/10 (prompt 08, punto 5): la regla de la geocodificación APROXIMADA
 * (AGENDA_BARRIO_APROXIMADO, apagada) y el diagnóstico de sólo lectura diagnostico/38_barrio_aproximado.js (el barrio de la 834).
 * Destino SIMULADO y mails SINTÉTICOS (el mock es el de tests/agenda_seguridad_1510.test.js). "Hoy" es el jueves 15/10/2026.
 *
 *     node tests/barrio_aproximado.test.js
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: mails, horarios y direcciones son inventados; los
 * barrios, las comunas y sus límites son los públicos de la Ciudad. Gmail y Maps no se llaman: los mails se pasan como lista
 * y el geocodificador es una tabla (con puntos buscados a una distancia dada del borde de otro barrio).
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', '05_Escritura.js', '20_UpsertDestino.js', '49_Corridas.js',
                  '41_AgendaColores.js', '41_AgendaParser.js', '42_BarriosCabaGeo.js', '40_Agenda.js', 'diagnostico/17_peso_intermedia.js',
                  'diagnostico/08_verificar_escritura.js', 'diagnostico/03_muestras_mail.js', 'diagnostico/16_agenda_medicion.js',
                  'diagnostico/19_direccion_conjunto.js', 'diagnostico/21_ubicacion.js', '25_Elecciones.js',
                  'diagnostico/22_previsualizar.js', 'diagnostico/30_duplicados_agenda.js', 'diagnostico/38_barrio_aproximado.js'];
const HOY = new Date(2026, 9, 15, 12, 0, 0);
/** UNA sola clase de fecha, la misma adentro y afuera del contexto: si no, `instanceof Date` falla adentro. */
class D extends Date {
  constructor(...a) { if (a.length === 0) super(HOY.getTime()); else super(...a); }
  static now() { return HOY.getTime(); }
}
const pad = function (n) { return ('0' + n).slice(-2); };

/** La línea que agrega la regla nueva en `_reglaBarrioConMargen_`: sin ella, el código es el de ANTES del 19/10. */
const LINEA_NUEVA = /^\s*if \(res && res\.estado === 'aproximada' && barrioAproximadoActivo_\(opc\)\) return _reglaBarrioAproximado_\(res, ev, poligonos\);\s*$/m;


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
  const antes = !!(config && config.__antes);
  const cfg = Object.assign({ DERIVADAS_POR_SCRIPT: 'false', AGENDA_SOLO_SEMANA: 'null', AGENDA_CANCELACION_AUTOMATICA: 'true', AGENDA_CANCELACION_MODO: "'regla7'",
    AGENDA_SEGURIDAD_POR_COMUNA: 'false', AGENDA_BARRIO_DEL_MAIL: 'false', CONJUNTO_REPETIDA_POR_UBICACION: 'false',
    AGENDA_CREAR_SOLO_IDENTIFICADAS: 'false', AGENDA_CONCILIACION_SEMANAL: 'false', AGENDA_ELECCIONES_SIEMPRE: 'false',
    AGENDA_INVARIANTE_UNA_FILA: 'false', AGENDA_VALIDAR_MAILS: 'false', AGENDA_COLORES_MAIL: 'false', AGENDA_BARRIO_APROXIMADO: 'false' }, config || {});
  delete cfg.__antes;
  ARCHIVOS.forEach(function (f) {
    let s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    if (f === '00_Config.js') Object.keys(cfg).forEach(function (k) { s = s.replace(new RegExp('^const ' + k + '\\s+=.*', 'm'), 'const ' + k + ' = ' + cfg[k] + ';'); });
    // `__antes`: el código de ANTES del 19/10 (sin la línea de la regla nueva en _reglaBarrioConMargen_)
    if (antes && f === '41_AgendaParser.js') { if (!LINEA_NUEVA.test(s)) throw new Error('no encontré la línea de la regla nueva'); s = s.replace(LINEA_NUEVA, ''); }
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
const BARRIOS = [['Recoleta', 2], ['Palermo', 14], ['Almagro', 5], ['Belgrano', 13], ['Núñez', 13], ['Colegiales', 13],
  ['Villa Crespo', 15], ['Chacarita', 15], ['Villa Urquiza', 12]];
const FIGURAS = ['Clara Muzzio', 'Jorge Macri', 'Gabino Tapia', 'Ruth Landerreche'];

function montar(config, filasExtra) {
  const E = crearEntorno(config);
  const hdr = HDR.concat(COLUMNAS_AGENDA);
  const C = function (n) { return hdr.indexOf(n); };
  const filas = [hdr];
  FIGURAS.forEach(function (fig, i) {
    const r = hdr.map(function () { return ''; });
    r[C('Figura')] = fig; r[C('Barrio')] = BARRIOS[i][0]; r[C('FECHA')] = new D(2026, 8, 10 + i, 12); r[C('HORA')] = '18:00';
    r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = 'Realizada'; r[C('Inscriptos')] = 100 + i;
    filas.push(r);
  });
  (filasExtra || []).forEach(function (fn) { const r = hdr.map(function () { return ''; }); fn(r, C); filas.push(r); });
  const ssD = E.planilla(E.run('RDV_SS_DESTINO')), ssI = E.planilla(E.run('RDV_SS_INTERMEDIA'));
  ssD.hojas['RVD JM-CM - ES'] = new E.Hoja('RVD JM-CM - ES', filas);
  ssD.hojas['Comunas'] = new E.Hoja('Comunas', [['Barrio', 'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona', 'Eje geográfico']]
    .concat(BARRIOS.map(function (b) { return [b[0], b[1], 1, 1, 1, 1, 1, 'Centro', '']; })));
  ssD.hojas['RDV CONJUNTO'] = new E.Hoja('RDV CONJUNTO', [['Figura', 'Barrio', 'FECHA', 'Asistentes', 'Oradores anotados', 'Oradores que hablaron']]);
  E.D = ssD.hojas['RVD JM-CM - ES']; E.ssI = ssI; E.ssD = ssD; E.C = C; E.hdr = hdr;
  return E;
}

let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }
const foto = function (h) { return JSON.stringify({ v: h.v, bg: h.bg }); };
const celda = function (E, i, n) { return E.D.v[i][E.C(n)]; };
const SIS = '#CFE2F3';

// ============================== puntos de Palermo a una distancia dada del borde ==============================

const E0 = montar();
/** Un punto adentro de Palermo a [dMin, dMax] metros del borde de otro barrio (búsqueda en grilla, determinista). */
function puntoPalermo(dMin, dMax) {
  return vm.runInContext(`(function () {
    const pol = _poligonosBarrios_();
    const p = pol.filter(function (b) { return normalizeText_(b.barrio) === 'palermo'; })[0];
    const cj = p.caja;
    for (let i = 1; i < 200; i++) for (let j = 1; j < 200; j++) {
      const x = cj[0] + (cj[2] - cj[0]) * i / 200, y = cj[1] + (cj[3] - cj[1]) * j / 200;
      const b = _barrioEnPunto_(x, y, pol);
      if (!b || normalizeText_(b.barrio) !== 'palermo') continue;
      const d = _distanciaAOtroBarrioM_(x, y, pol, 'Palermo');
      if (d > ${dMin} && d < ${dMax}) return { lng: x, lat: y, d: d };
    }
    return null;
  })()`, E0.ctx);
}
const P600 = puntoPalermo(600, 650), P400 = puntoPalermo(380, 420), P1500 = puntoPalermo(1200, 3000);
ok(P600 && P400 && P1500, 'puntos de Palermo: a ' + (P600 && Math.round(P600.d)) + ' m, a ' + (P400 && Math.round(P400.d)) + ' m y a ' +
   (P1500 && Math.round(P1500.d)) + ' m del borde de otro barrio');

// ============================== [1] la regla, sola ==============================

console.log('[1] _reglaBarrioConMargen_ con una geocodificación aproximada');
const regla = function (E, res, ev, opc) {
  E.ctx.__res = res; E.ctx.__ev = ev; E.ctx.__opc = opc;
  return E.run('_reglaBarrioConMargen_(__res, __ev, _poligonosBarrios_(), BARRIO_MARGEN_M' + (opc === undefined ? '' : ', __opc') + ')');
};
const aprox = function (p) { return { estado: 'aproximada', barrio: 'Palermo', comuna: 14, lat: p.lat, lng: p.lng }; };
const exacta = function (p) { return { estado: 'ok', barrio: 'Palermo', comuna: 14, lat: p.lat, lng: p.lng }; };
const C14 = { comuna: 14, barrio: '', eje: '' }, C13 = { comuna: 13, barrio: '', eje: '' };
const Eant = montar({ __antes: true });
const igual = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };
// apagada = antes, en todos los casos (aproximada, exacta; comunas; ejes)
[[aprox(P600), C14], [aprox(P400), C14], [aprox(P600), C13], [exacta(P600), C14], [exacta(P400), C13], [aprox(P1500), { comuna: null, barrio: '', eje: 'Norte' }],
 [{ estado: 'borde', barrio: 'Palermo', comuna: 14, lat: P600.lat, lng: P600.lng }, C14], [{ estado: 'sin_resultado', barrio: '', comuna: null }, C14]]
  .forEach(function (c, i) {
    const a = regla(Eant, c[0], c[1]), b = regla(E0, c[0], c[1]), b2 = regla(E0, c[0], c[1], { aproximado: false });
    ok(igual(a, b) && igual(a, b2), 'apagada, caso ' + (i + 1) + ' (' + c[0].estado + '): idéntica a antes — ' + (a.cumple ? 'cumple' : a.motivo));
  });
ok(!regla(E0, aprox(P600), C14).cumple && /\(a\) geocodificación aproximada/.test(regla(E0, aprox(P600), C14).motivo),
   'apagada: la aproximada sigue rechazada en (a), como hoy');
let r = regla(E0, aprox(P600), C14, { aproximado: true });
ok(r.cumple && r.aproximada && /comuna del mail/.test(r.por), 'prendida: aproximada a ~600 m del borde, en la comuna del mail (C14) → CUMPLE (' + r.por + ')');
r = regla(E0, aprox(P400), C14, { aproximado: true });
ok(!r.cumple && /\(c\) a \d+ m de otro barrio \(margen 500 m\)/.test(r.motivo), 'prendida: a ~400 m del borde → no cumple (' + r.motivo + ')');
r = regla(E0, aprox(P600), C13, { aproximado: true });
ok(!r.cumple && /otra comuna/.test(r.motivo), 'prendida: otra comuna que la del mail (C13) → no cumple (' + r.motivo + ')');
r = regla(E0, aprox(P600), { comuna: null, barrio: 'Palermo', eje: '' }, { aproximado: true });
ok(r.cumple && /barrio del mail/.test(r.por), 'prendida: el barrio del mail (Palermo), lejos del borde → cumple');
r = regla(E0, aprox(P600), { comuna: 14, barrio: 'Belgrano', eje: '' }, { aproximado: true });
ok(!r.cumple && /otro barrio/.test(r.motivo), 'prendida: el mail nombra OTRO barrio → no cumple (más estricta que la de una "ok")');
r = regla(E0, aprox(P1500), { comuna: null, barrio: '', eje: 'Norte' }, { aproximado: true });
ok(!r.cumple && /no trae comuna ni barrio/.test(r.motivo), 'prendida: con sólo un eje en el mail → no cumple');
ok(igual(regla(E0, exacta(P400), C14, { aproximado: true }), regla(E0, exacta(P400), C14)), 'prendida: una geocodificación "ok" se evalúa igual que siempre');
const Eon = montar({ AGENDA_BARRIO_APROXIMADO: 'true' });
ok(regla(Eon, aprox(P600), C14).cumple && !regla(Eon, aprox(P600), C14, { aproximado: false }).cumple,
   'con el interruptor en true (sin opciones) cumple; `{ aproximado: false }` la apaga para medir');

// ============================== [2] la agenda ==============================

const ASUNTO_19 = 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 19/10 al 25/10';
const NL = String.fromCharCode(10);
const MAIL = { fecha: new D(2026, 9, 15, 9, 0), asunto: ASUNTO_19, truncado: false, cuerpo: [
  '*Martes 20/10*', 'Evento: Seguridad en tu Barrio, Comuna 14', 'Hora: 18:00h', 'Lugar: Av. Ficticia 100, Club Inventado',
  '*Miércoles 21/10*', 'Evento: Seguridad en tu Barrio, Comuna 14', 'Hora: 18:00h', 'Lugar: Calle Cerca 200, Sociedad Inventada',
  '*Jueves 22/10*', 'Evento: Seguridad en tu Barrio, Comuna 13', 'Hora: 18:00h', 'Lugar: Av. Ficticia 100, Club Inventado',
  '*Viernes 23/10*', 'Evento: Seguridad en tu Barrio, Comuna 14', 'Hora: 18:00h', 'Lugar: Pasaje Exacto 300, Centro Inventado'].join(NL) };
/** El geocodificador simulado: "Av. Ficticia 100" (a ~600 m del borde) y "Calle Cerca 200" (a ~400 m), aproximadas; "Pasaje Exacto 300", exacta. */
function geo(consulta) {
  const t = [['Av. Ficticia 100', P600, 'GEOMETRIC_CENTER'], ['Calle Cerca 200', P400, 'GEOMETRIC_CENTER'], ['Pasaje Exacto 300', P1500, 'ROOFTOP']]
    .filter(function (x) { return consulta.indexOf(x[0]) === 0; })[0];
  return t ? { consulta: consulta, estado: 'OK', lat: t[1].lat, lng: t[1].lng, tipo: t[2], parcial: false } : { consulta: consulta, estado: 'ZERO_RESULTS' };
}
function correr(E, enSeco, extra) {
  E.ctx.__mails = [MAIL]; E.ctx.__geo = geo; E.ctx.__extra = extra || {};
  return E.run('correrAgendaEnBloqueo_(' + enSeco + ', Object.assign({ mails: __mails, geocodificar: __geo }, __extra))');
}
const deDia = function (E, d) {
  for (let i = 1; i < E.D.v.length; i++) { const f = E.D.v[i][E.C('FECHA')]; if (f instanceof Date && f.getDate() === d && f.getMonth() === 9) return i; }
  return -1;
};

console.log('[2] la agenda: apagada, las mismas acciones que ANTES; prendida, gana el barrio sólo la que cumple');
const Xa = montar({ __antes: true }), Xn = montar();
const ra = correr(Xa, false), rn = correr(Xn, false);
ok(ra && rn && !ra.error && !rn.error && ra.crear === 4 && rn.crear === 4, 'antes y apagada: crean las 4 reuniones (crear ' + (ra && ra.crear) + ' / ' + (rn && rn.crear) + ')');
ok(foto(Xa.D) === foto(Xn.D), 'apagada: la base queda IDÉNTICA a la del código de antes (valores y fondos)');
ok(JSON.stringify(Xa.ssI.hojas['REGISTRO_AGENDA_CAMBIOS'].v.map(function (r) { return r.slice(1); })) ===
   JSON.stringify(Xn.ssI.hojas['REGISTRO_AGENDA_CAMBIOS'].v.map(function (r) { return r.slice(1); })), 'apagada: las mismas líneas en REGISTRO_AGENDA_CAMBIOS');
ok(celda(Xn, deDia(Xn, 20), 'Barrio') === '' && celda(Xn, deDia(Xn, 23), 'Barrio') === 'Palermo',
   'apagada: la aproximada (20/10) sin barrio; la exacta (23/10) con Palermo, como siempre');
const ra2 = correr(Xa, false), rn2 = correr(Xn, false);
ok(foto(Xa.D) === foto(Xn.D) && ra2.actualizar === rn2.actualizar && ra2.crear === rn2.crear, 'apagada: la segunda corrida también igual a antes');
const Xp = montar({ AGENDA_BARRIO_APROXIMADO: 'true' });
const rp = correr(Xp, false);
const i20 = deDia(Xp, 20), i21 = deDia(Xp, 21), i22 = deDia(Xp, 22), i23 = deDia(Xp, 23);
ok(rp && !rp.error && celda(Xp, i20, 'Barrio') === 'Palermo' && celda(Xp, i20, 'agenda_barrio_escrito') === 'Palermo' && Xp.D.bg[i20][Xp.C('Barrio')] === SIS,
   'prendida: 20/10 (aproximada a ~600 m, Comuna 14) → Barrio "Palermo", con agenda_barrio_escrito y en #CFE2F3');
ok(celda(Xp, i21, 'Barrio') === '' && celda(Xp, i22, 'Barrio') === '', 'prendida: 21/10 (a ~400 m) y 22/10 (Comuna 13) siguen sin barrio');
ok(celda(Xp, i23, 'Barrio') === 'Palermo', 'prendida: 23/10 (exacta) igual que siempre');
// prendida sobre una base que ya corrió apagada: la fila del 20/10 (Barrio vacío) lo GANA en la corrida siguiente (actualizar)
const Xq = montar();
correr(Xq, false);
const rq = correr(Xq, false, { barrioAproximado: true });   // la regla forzada por opciones (como la mediría un paso en seco)
ok(rq && !rq.error && celda(Xq, deDia(Xq, 20), 'Barrio') === 'Palermo' && rq.crear === 0 && celda(Xq, deDia(Xq, 21), 'Barrio') === '',
   'una fila ya creada sin barrio lo gana con la regla prendida (actualizar, sólo celda vacía); la de ~400 m no');

// ============================== [3] la medición (paso 106) ==============================

console.log('[3] medirBarrioAproximado(): sólo la cache, sin Maps ni Gmail, sin escribir nada');
/** Las filas de la cache AGENDA_GEOCODE para unas direcciones (como las devuelve _filasCacheGeoBA_). */
function cacheDe(E, dirs, fecha) {
  return dirs.map(function (d, i) {
    E.ctx.__d = d;
    const q = E.run('_consultaGeocodeExpandida_(__d)');
    const g = geo(E.run('_consultaGeocode_(__d)'));
    return { filaHoja: i + 2, consulta: q, estado: g.estado, lat: g.lat, lng: g.lng, tipo: g.tipo || '', parcial: false, barrioGoogle: '', formateada: '',
             detalle: '', fecha: fecha || '2026-10-15 09:00', fechaMs: new D(2026, 9, 15, 9, 0).getTime(), componentes: '' };
  });
}
const Xm = montar({}, [
  // una fila del EQUIPO con barrio, cuya dirección da aproximada en Palermo (C14 en el mail): coincide
  function (r, C) { r[C('Figura')] = 'Gabino Tapia'; r[C('FECHA')] = new D(2026, 9, 5, 12); r[C('Barrio')] = 'Palermo'; r[C('Dirección')] = 'Av. Ficticia 100, Club Inventado';
                    r[C('Lugar (mail)')] = 'Comuna 14'; r[C('Evento (mail)')] = 'Seguridad en tu Barrio, Comuna 14'; r[C('STATUS REUNIÓN')] = 'Realizada'; },
  // una fila del equipo SIN datos del mail con un barrio que la geometría contradice (sólo geometría: no es la regla)
  function (r, C) { r[C('Figura')] = 'Clara Muzzio'; r[C('FECHA')] = new D(2026, 9, 6, 12); r[C('Barrio')] = 'Recoleta'; r[C('Dirección')] = 'Av. Ficticia 100';
                    r[C('STATUS REUNIÓN')] = 'Realizada'; }
]);
correr(Xm, false);   // crea las 4 de la agenda (apagada: la del 20/10 sin barrio)
const fotoAntes = foto(Xm.D), regAntes = JSON.stringify(Xm.ssI.hojas['REGISTRO_AGENDA_CAMBIOS'].v), hojasAntes = Object.keys(Xm.ssI.hojas).join(',');
Xm.ctx.__cache = cacheDe(Xm, ['Av. Ficticia 100, Club Inventado', 'Calle Cerca 200, Sociedad Inventada', 'Pasaje Exacto 300, Centro Inventado']);
let m = Xm.run('medirBarrioAproximado({ cacheFilas: __cache })');
if (process.env.VER_LOG) console.log(Xm.logs.join(NL));   // y el del paso 106
ok(m && !m.error && m.ganarian.length === 1 && m.ganarian[0].barrio === 'Palermo' && m.ganarian[0].fecha === '20/10/2026',
   '(i) gana barrio sólo la del 20/10 (Palermo, a ' + (m.ganarian[0] && m.ganarian[0].distancia) + ' m) — ganarían ' + m.ganarian.length);
ok(m.coincidenEquipo === 1 && m.contradicen.length === 0 && m.contradicenGeometria.length === 1, '(ii) el equipo: 1 coincide, 0 contradicen; 1 sólo por la geometría (la de Recoleta, sin mail)');
ok(/ganarían barrio 1 \| contradicen al equipo 0 → LISTO/.test(m.resumen), 'resumen: ' + m.resumen);
ok(foto(Xm.D) === fotoAntes && JSON.stringify(Xm.ssI.hojas['REGISTRO_AGENDA_CAMBIOS'].v) === regAntes && Object.keys(Xm.ssI.hojas).join(',') === hojasAntes,
   'no escribió nada (la base, el registro y las solapas, iguales)');
// una fila del equipo con OTRO barrio en la comuna del mail que la regla daría distinto → NO LISTO
const iTapia = Xm.D.v.findIndex(function (r) { const f = r[Xm.C('FECHA')]; return r[Xm.C('Figura')] === 'Gabino Tapia' && f instanceof Date && f.getMonth() === 9 && f.getDate() === 5; });
Xm.D.v[iTapia][Xm.C('Barrio')] = 'Belgrano';   // la del equipo con mail (C14): el equipo puso Belgrano
m = Xm.run('medirBarrioAproximado({ cacheFilas: __cache })');
ok(m.contradicen.length === 1 && /NO LISTO/.test(m.resumen), 'un barrio del equipo que la regla contradice → NO LISTO (' + m.resumen + ')');

// ============================== [4] de dónde salió el barrio (paso 105) ==============================

console.log('[4] explicarBarrioFila(): la 834 (el barrio por la fusión desde la 839)');
const Xe = montar({}, [
  function (r, C) { r[C('FECHA')] = new D(2026, 9, 22, 12); r[C('HORA')] = '17:15'; r[C('Figura')] = 'Ruth Landerreche'; r[C('Barrio')] = 'Palermo';
                    r[C('Dirección')] = 'Av. Int. Ficticia 55, Club'; r[C('agenda_direccion_escrita')] = 'Av. Int. Ficticia 55, Club';
                    r[C('agenda_barrio_escrito')] = 'Palermo'; r[C('agenda_uid')] = 'c-vieja'; r[C('Lugar (mail)')] = 'Comuna 14';
                    r[C('Evento (mail)')] = 'Seguridad en tu Barrio, Comuna 14'; r[C('Dirección (mail)')] = 'Av. Int. Ficticia 55, Club';
                    r[C('Origen fila')] = 'sistema'; r[C('STATUS REUNIÓN')] = 'en agenda'; }
]);
const filaV = Xe.D.v.length;   // la fila (1-based) de la vieja
const borrada = Xe.hdr.map(function (h) { return { 'Barrio': 'Palermo', 'agenda_barrio_escrito': 'Palermo', 'agenda_uid': 'c-nueva', 'Lugar (mail)': 'Comuna 14' }[h] || ''; });
const ENC = ['corrida', 'tipo', 'fila', 'col', 'columna', 'antes', 'despues', 'fondo_antes', 'agenda_uid'];
const cBar = Xe.C('Barrio') + 1;
Xe.ctx.__cambios = [ENC,
  ['20261012-090000-aaaa', 'crear', filaV, cBar - 1, 'Figura', '', '', '', 'c-vieja'],
  ['20261012-090000-aaaa', 'crear_id', filaV, '', '', '', 'id-1', '', 'c-vieja'],
  ['20261016-114500-bbbb', 'crear', filaV + 5, cBar, 'Barrio', '', 'Palermo', '', 'c-nueva'],
  ['20261016-114500-bbbb', 'crear', filaV + 5, Xe.C('agenda_barrio_escrito') + 1, 'agenda_barrio_escrito', '', 'Palermo', '', 'c-nueva'],
  ['20261016-185548-cf82', 'fusionar', filaV, cBar, 'Barrio', '', 'Palermo', '', 'c-vieja'],
  ['20261016-185548-cf82', 'fusionar', filaV, Xe.C('agenda_barrio_escrito') + 1, 'agenda_barrio_escrito', '', 'Palermo', '', 'c-vieja'],
  ['20261016-185548-cf82', 'borrar_fusion', filaV + 5, '', '', JSON.stringify(borrada), '', JSON.stringify(borrada.map(function () { return null; })), 'c-nueva'],
  ['20261016-185548-cf82', 'fusionada_sistema', filaV + 5, '', 'fila ' + filaV, 'fusionada por el sistema con la fila ' + filaV + ' (agenda_uid c-vieja)', 'id-1', '', 'c-nueva']];
Xe.ctx.__cacheA = [{ filaHoja: 2, consulta: 'Av. Int. Ficticia 55, Ciudad Autónoma de Buenos Aires, Argentina', estado: 'OK', lat: P600.lat, lng: P600.lng, tipo: 'GEOMETRIC_CENTER',
                     parcial: false, formateada: '', fecha: '2026-10-16 11:44', fechaMs: new D(2026, 9, 16, 11, 44).getTime() }];
let x = Xe.run('explicarBarrioFila(' + filaV + ', { cambios: __cambios, deshechas: {}, cacheFilas: __cacheA, fondoBarrio: "#cfe2f3", esperado: { figura: "Landerreche", fecha: "2026-10-22" } })');
if (process.env.VER_LOG) console.log(Xe.logs.join(NL));   // VER_LOG=1 node tests/barrio_aproximado.test.js: el log del paso 105
ok(x && !x.error && x.escritoPorSistema === true, 'queda registrado como escrito por el sistema: sí (agenda_barrio_escrito = Palermo)');
ok(/la fusión/.test(x.origen) && /c-nueva/.test(x.origen) && /20261016-114500-bbbb/.test(x.origen) && /NINGUNA regla la explica/.test(x.origen),
   'con la cache sólo aproximada: la fusión copió el de la 839, y ninguna regla explica el de la 839 — "' + x.origen + '"');
ok(x.lineas.length >= 6 && x.cache.length === 1 && x.cache[0].reglaNueva.cumple && !x.cache[0].reglaVieja.cumple,
   'lista las líneas del registro (' + x.lineas.length + ') y la cache: la regla de siempre no, la de la aproximada sí');
Xe.ctx.__cacheB = Xe.ctx.__cacheA.concat([{ filaHoja: 3, consulta: 'Av. Intendente Ficticia 55, Ciudad Autónoma de Buenos Aires, Argentina', estado: 'OK',
  lat: P600.lat, lng: P600.lng, tipo: 'ROOFTOP', parcial: false, formateada: '', fecha: '2026-10-16 11:40', fechaMs: new D(2026, 9, 16, 11, 40).getTime() }]);
x = Xe.run('explicarBarrioFila(' + filaV + ', { cambios: __cambios, deshechas: {}, cacheFilas: __cacheB, fondoBarrio: "#cfe2f3" })');
ok(/REGLA DE CONFIANZA/.test(x.origen) && x.cache.length === 2, 'con una geocodificación "ok" anterior (la consulta expandida, otra fila de la cache): la regla de confianza — "' + x.origen + '"');
Xe.ctx.__cambios2 = Xe.ctx.__cambios.filter(function (l) { return l[4] !== 'Barrio'; });
x = Xe.run('explicarBarrioFila(' + filaV + ', { cambios: __cambios2, deshechas: {}, cacheFilas: __cacheA, fondoBarrio: "" })');
ok(/NINGUNA línea/.test(x.origen), 'sin ninguna línea que escriba el Barrio: "no lo puso la agenda"');

console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTODO OK');
process.exit(fallas ? 1 : 0);
