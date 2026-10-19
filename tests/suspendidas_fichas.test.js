/**
 * tests/suspendidas_fichas.test.js — 20/10 (decisión del usuario, prompt 08): una fila Suspendida sin formulario no va a las fichas,
 * ni a SIN_MATCH, ni a EMPAREJAR_MANUAL (SUSPENDIDAS_FUERA_DE_FICHAS); una Suspendida con su formulario se escribe igual; apagado,
 * como antes.
 *
 *     node tests/suspendidas_fichas.test.js
 *
 * NO sube a Apps Script y NO tiene datos reales.
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
                  '56_SepararReunion.js', '51_FormatoLectura.js', '47_AgendaVistas.js', '57_OrdenBase.js'];
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
const BARRIOS = [['Recoleta', 2], ['Palermo', 14], ['Almagro', 5], ['Belgrano', 13], ['Núñez', 13], ['Flores', 7]];
let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }

/** La base: dos filas sin formulario (una Suspendida, una "en agenda") y una Suspendida CON su formulario en B. */
function montar(config) {
  const E = crearEntorno(Object.assign({ DERIVADAS_POR_SCRIPT: 'false' }, config || {}));
  const hdr = HDR;
  const C = function (n) { return hdr.indexOf(n); };
  const filas = [hdr];
  const fila = function (fig, barrio, d, st) {
    const r = hdr.map(function () { return ''; });
    r[C('Figura')] = fig; r[C('Barrio')] = barrio; r[C('FECHA')] = new D(2026, 9, d, 12); r[C('HORA')] = '18:00';
    r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = st;
    filas.push(r);
  };
  fila('Clara Muzzio', 'Recoleta', 6, 'Suspendida');     // 2: Suspendida, sin formulario
  fila('Gabino Tapia', 'Núñez', 7, 'en agenda');          // 3: en agenda, sin formulario
  fila('Laura Alonso', 'Flores', 8, 'Suspendida');        // 4: Suspendida, CON su formulario (se escribe igual)
  const ssD = E.planilla(E.run('RDV_SS_DESTINO')), ssI = E.planilla(E.run('RDV_SS_INTERMEDIA'));
  ssD.hojas['RVD JM-CM - ES'] = new E.Hoja('RVD JM-CM - ES', filas);
  ssD.hojas['Comunas'] = new E.Hoja('Comunas', [['Barrio', 'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona', 'Eje geográfico']]
    .concat(BARRIOS.map(function (b) { return [b[0], b[1], 1, 1, 1, 1, 1, 'Centro', '']; })));
  const cb = E.run('COLUMNAS_B');
  const hB = Object.keys(cb).map(function (k) { return cb[k][0]; });
  const fB = hB.map(function () { return 0; });
  fB[hB.indexOf(cb.nombre[0])] = 'LAURA ALONSO - Encuentro con Vecinos - 8/10 Flores'; fB[hB.indexOf(cb.fechaFin[0])] = new D(2026, 9, 7, 12);
  fB[hB.indexOf(cb.inscriptos[0])] = 40; fB[hB.indexOf(cb.identificados[0])] = 40; fB[hB.indexOf(cb.M[0])] = 20; fB[hB.indexOf(cb.F[0])] = 20;
  fB[hB.indexOf(cb.canalMailing[0])] = 40; fB[hB.indexOf(cb.edad25_39[0])] = 40;
  ssI.hojas['B'] = new E.Hoja('B', [hB, fB]);
  E.D = ssD.hojas['RVD JM-CM - ES']; E.C = C;
  return E;
}

AHORA = new Date(2026, 9, 19, 12, 0, 0).getTime();
const plan = function (E) {
  return E.run('(function () { const p = calcularPlan_(true, null, null); const fx = armarFichas_(p, null, {});' +
    ' return { v: [2, 3, 4].map(function (k) { return (p.porFila[k] || {}).veredicto; }),' +
    ' sinMatch: p.filasSinMatch.map(function (x) { return x[1]; }), revisar: p.filasRevisar.map(function (x) { return x[1]; }),' +
    ' fichas: JSON.stringify(fx).match(/Clara Muzzio|Gabino Tapia|Laura Alonso/g) || [],' +
    ' emp: JSON.stringify(p.emparejar || p.emp || null).match(/Clara Muzzio/g) || [] }; })()');
};

console.log('[1] una fila Suspendida sin formulario no va a las fichas, ni a SIN_MATCH, ni a EMPAREJAR_MANUAL');
let E = montar({});
let r = plan(E);
ok(r.v[0] === 'suspendida_sin_formulario', 'la Suspendida sin formulario (Muzzio): veredicto propio — ' + JSON.stringify(r.v));
ok(r.sinMatch.indexOf('Clara Muzzio') < 0 && r.revisar.indexOf('Clara Muzzio') < 0 && r.fichas.indexOf('Clara Muzzio') < 0 && !r.emp.length,
   'no está en SIN_MATCH, REVISAR_MATCH, las fichas ni EMPAREJAR_MANUAL — ' + JSON.stringify(r));
ok(r.v[1] === 'SIN_MATCH' || r.v[1] === 'REVISAR_MATCH' || r.v[1] === 'esperando_formulario',
   'la "en agenda" sin formulario (Tapia): como siempre — ' + r.v[1]);
ok(r.v[2] === 'escribiria', 'la Suspendida CON su formulario (Alonso): se escribe igual (nada más del cruce cambia) — ' + r.v[2]);

console.log('[2] con SUSPENDIDAS_FUERA_DE_FICHAS apagado, como antes');
E = montar({ SUSPENDIDAS_FUERA_DE_FICHAS: 'false' });
const r0 = plan(E);
ok(r0.v[0] !== 'suspendida_sin_formulario' && (r0.sinMatch.indexOf('Clara Muzzio') >= 0 || r0.revisar.indexOf('Clara Muzzio') >= 0 || r0.v[0] === 'esperando_formulario'),
   'apagado: la Suspendida va a donde iba antes — ' + r0.v[0]);
ok(r0.fichas.indexOf('Clara Muzzio') >= 0, 'apagado, la Suspendida aparece en las fichas (lo que se quería sacar) — ' + JSON.stringify(r0.fichas));
ok(r0.v[1] === r.v[1] && r0.v[2] === r.v[2], 'y las otras dos, igual que prendido');

console.log('');
console.log(fallas ? fallas + ' FALLA(S)' : 'Todo en verde.');
process.exit(fallas ? 1 : 0);
