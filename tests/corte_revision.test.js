/**
 * tests/corte_revision.test.js — 20/10 (prompt 10, punto 2): "LO VIEJO SE DEJA COMO ESTÁ" (REVISION_DESDE_FECHA_CORTE,
 * FECHA_CORTE_REVISION = '2026-10-06'; 59_CorteRevision.js). APAGADO: todo lo que escriben las solapas de revisión (REVISAR_MATCH
 * —fichas y RESUELTAS—, SIN_MATCH, EMPAREJAR_MANUAL, HISTORICO_SIN_RESOLVER, IDS_SIN_CRUZAR, "se hizo y no está en la base") y el plan
 * IDÉNTICOS al código de antes (el commit d5662f3, leído con git). PRENDIDO: lo de antes del corte no aparece, lo del corte en adelante
 * sí (igual que apagado), ninguna escritura de la base cambia y las elecciones guardadas se aplican igual. Y el seco
 * (`medirCorteRevision`): no escribe nada, simula prendido con el interruptor apagado y grita si desapareciera algo del corte en adelante.
 *
 *     node tests/corte_revision.test.js
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: la base, los formularios y las elecciones son inventados;
 * los barrios y comunas son los públicos de la Ciudad; las figuras, nombres de la columna Figura. "Hoy" es el martes 20/10/2026.
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
                  '56_SepararReunion.js', '51_FormatoLectura.js', '47_AgendaVistas.js', '57_OrdenBase.js', '53_HechasSinFila.js',
                  '53_CancelacionConjunto.js', '59_CorteRevision.js', 'diagnostico/40_corte_revision.js'];
/** El código de ANTES (el commit en que arrancó este cambio): para comparar "apagado = idéntico". null = sin git (se saltea). */
const BASE_GIT = 'd5662f3';
function fuenteDeGit(f) {
  try { return require('child_process').execSync('git show ' + BASE_GIT + ':' + f, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (e) { return null; }
}
const AHORA = new Date(2026, 9, 20, 12, 0, 0).getTime();
class D extends Date {
  constructor(...a) { if (a.length === 0) super(AHORA); else super(...a); }
  static now() { return AHORA; }
}
const pad = function (n) { return ('0' + n).slice(-2); };

// ============================== el mock de Apps Script (el de tests/suspendidas_fichas.test.js) ==============================

function crearEntorno(config, deGit) {
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
        setValues: function (m) { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.v[f - 1 + i][c - 1 + j] = m[i][j]; E.escrituras = (E.escrituras || 0) + 1; return rango; },
        setValue: function (x) { h._asegurar(f, c); h.v[f - 1][c - 1] = x; E.escrituras = (E.escrituras || 0) + 1; return rango; },
        setBackground: function (col) { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.bg[f - 1 + i][c - 1 + j] = col; return rango; },
        setBackgrounds: function (m) { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.bg[f - 1 + i][c - 1 + j] = m[i][j]; return rango; },
        clearContent: function () { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.v[f - 1 + i][c - 1 + j] = ''; return rango; },
        setNumberFormat: function () { return rango; }, setNumberFormats: function () { return rango; },
        getNumberFormats: function () { const o = []; for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) r.push('General'); o.push(r); } return o; },
        clearFormat: function () { return rango; }, setDataValidation: function () { return rango; }, setFontWeight: function () { return rango; }
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
    deleteRows(f, n) { this.v.splice(f - 1, n); this.bg.splice(f - 1, n); }
    deleteRow(f) { this.deleteRows(f, 1); }
    appendRow(r) { const f = this.getLastRow() + 1; this.getRange(f, 1, 1, r.length).setValues([r]); }
    setFrozenRows() {}
    clear() { this.v = []; this.bg = []; }
    getProtections() { return []; }
    protect() { const pr = { setDescription: function () { return pr; }, setWarningOnly: function () { return pr; }, setUnprotectedRanges: function () { return pr; },
                             isWarningOnly: function () { return true; }, addEditor: function () { return pr; }, getEditors: function () { return []; },
                             removeEditors: function () { return pr; }, canDomainEdit: function () { return false; }, setDomainEdit: function () { return pr; } }; return pr; }
    hideColumns() {}
    autoResizeColumns() {}
    clearContents() { this.v = this.v.map(function (r) { return r.map(function () { return ''; }); }); }
  }
  E.Hoja = Hoja;
  const planillas = {};
  E.planillas = planillas;
  E.planilla = function (id) {
    if (!planillas[id]) planillas[id] = { hojas: {}, getSheetByName: function (n) { return this.hojas[n] || null; },
                                           insertSheet: function (n) { E.creadas = (E.creadas || 0) + 1; this.hojas[n] = new Hoja(n, []); return this.hojas[n]; },
                                           getSheets: function () { return Object.keys(this.hojas).map(function (k) { return this.hojas[k]; }, this); },
                                           deleteSheet: function (sh) { delete this.hojas[sh.nombre]; } };
    return planillas[id];
  };
  const ctx = {
    console: console, Date: D, Math: Math, JSON: JSON, Map: Map, Set: Set, Object: Object, Array: Array, String: String, Number: Number,
    Logger: { log: function () { const a = Array.prototype.slice.call(arguments); let s = String(a.shift()); s = s.replace(/%s/g, function () { return String(a.shift()); }).replace(/%%/g, '%'); E.logs.push(s); } },
    Utilities: {
      formatDate: function (d, tz, f) { return f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate())).replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds())); },
      getUuid: function () { E.uuid++; return 'u' + E.uuid; }, sleep: function () {},
      DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: function (alg, t) { return Array.from(crypto.createHash('md5').update(String(t), 'utf8').digest()).map(function (b) { return b > 127 ? b - 256 : b; }); }
    },
    SpreadsheetApp: { openById: function (id) { return E.planilla(id); }, flush: function () {}, ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
                      newDataValidation: function () { const b = { requireValueInList: function () { return b; }, setAllowInvalid: function () { return b; }, build: function () { return b; } }; return b; } },
    GmailApp: { sendEmail: function (para, asunto, cuerpo) { E.mails.push({ to: para, subject: asunto, body: cuerpo }); } },
    Session: { getEffectiveUser: function () { return { getEmail: function () { return 'yo@test'; } }; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    PropertiesService: { getScriptProperties: function () { E.props = E.props || {}; return { getProperty: function (k) { return E.props[k] == null ? null : E.props[k]; }, setProperty: function (k, v) { E.props[k] = String(v); }, deleteProperty: function (k) { delete E.props[k]; } }; } }
  };
  vm.createContext(ctx);
  const cfg = Object.assign({ DERIVADAS_POR_SCRIPT: 'false', AGENDA_SOLO_SEMANA: 'null' }, config || {});
  ARCHIVOS.forEach(function (f) {
    let s = deGit ? fuenteDeGit(f) : fs.readFileSync(path.join(RAIZ, f), 'utf8');
    if (s === null) return;   // el código de antes no tenía 59_CorteRevision.js ni el seco
    if (f === '00_Config.js') Object.keys(cfg).forEach(function (k) {
      const re = new RegExp('^const ' + k + '\\s+=.*', 'm');
      if (re.test(s)) s = s.replace(re, 'const ' + k + ' = ' + cfg[k] + ';');
    });
    vm.runInContext(s, ctx, { filename: f });
  });
  E.ctx = ctx;
  E.run = function (expr) { vm.runInContext('_ssDestino_ = null; _ssIntermedia_ = null; _cacheParsing_ = null;', ctx); E.logs = []; return vm.runInContext(expr, ctx); };
  return E;
}

// ============================== la base, B y las elecciones (inventadas) ==============================

const HDR = (function () {
  const fx = fs.readFileSync(path.join(RAIZ, 'fixtures', 'RVD JM-CM - ES.csv'), 'utf8').split(/\r?\n/)[0].split(',');
  const nombres = { C: 'EVENTO', F: 'HORA', H: 'One Page Entregado', I: 'STATUS REUNIÓN', J: 'Observaciones',
    L: 'Mail', M: 'Call Center', N: 'IVR', O: 'RRSS', P: 'Difusión', R: 'Oradores anotados', S: 'Oradores que hablaron',
    T: 'Temas mas comentados', U: 'Semaforo politico', V: 'Síntesis cualitativa:', AH: 'Masculinos', AI: 'Femeninos',
    AJ: '18-24', AK: '25-39', AL: '40-55', AM: '56-65', AN: '66+', AO: 'Sin identificar' };
  return fx.map(function (h) { const m = /^PENDIENTE_([A-Z]+)$/.exec(h); return m && nombres[m[1]] ? nombres[m[1]] : h; })
           .concat(['RDV_UID', 'form_origen', 'form_score', 'form_nivel', 'form_fecha_match', 'form_clave']);
})();
const BARRIOS = [['Recoleta', 2], ['Palermo', 14], ['Núñez', 13], ['Flores', 7], ['Saavedra', 12], ['Belgrano', 13]];
let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }

/*
 * La base (hoy 20/10; activas desde el 20/09; corte 06/10):
 *   2 Muzzio 25/09   antes del corte, activa, con un formulario a 5 días que no alcanza (SIN_MATCH; par en EMPAREJAR)
 *   3 Tapia 10/10    después del corte, sin formulario (ficha)
 *   4 Alonso 08/10   con su formulario: SE ESCRIBE (la escritura de la base, prendido o apagado, igual)
 *   5 Lombardi 06/10 EL DÍA DEL CORTE, sin formulario: se muestra
 *   6 Landerreche 05/10  el día ANTES del corte, sin formulario: no se muestra
 *   7 Pereyra 28/09  antes del corte, sin formulario; una elección "aplicado" guardada (RESUELTAS)
 *   8 Arengo 01/09   cerrada (no activa): HISTORICO_SIN_RESOLVER en la corrida del historial
 */
function montar(config, deGit) {
  const E = crearEntorno(config, deGit);
  const C = function (n) { return HDR.indexOf(n); };
  const filas = [HDR];
  const fila = function (fig, barrio, d, m) {
    const r = HDR.map(function () { return ''; });
    r[C('Figura')] = fig; r[C('Barrio')] = barrio; r[C('FECHA')] = new D(2026, m - 1, d, 12); r[C('HORA')] = '18:00';
    r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = 'en agenda';
    filas.push(r);
  };
  fila('Clara Muzzio', 'Recoleta', 25, 9);
  fila('Gabino Tapia', 'Núñez', 10, 10);
  fila('Laura Alonso', 'Flores', 8, 10);
  fila('Hernán Lombardi', 'Saavedra', 6, 10);
  fila('Ruth Landerreche', 'Flores', 5, 10);
  fila('Ana Pereyra', 'Palermo', 28, 9);
  fila('Gustavo Arengo Piragine', 'Flores', 1, 9);
  const ssD = E.planilla(E.run('RDV_SS_DESTINO')), ssI = E.planilla(E.run('RDV_SS_INTERMEDIA'));
  ssD.hojas['RVD JM-CM - ES'] = new E.Hoja('RVD JM-CM - ES', filas);
  ssD.hojas['Comunas'] = new E.Hoja('Comunas', [['Barrio', 'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona', 'Eje geográfico']]
    .concat(BARRIOS.map(function (b) { return [b[0], b[1], 1, 1, 1, 1, 1, 'Centro', '']; })));
  const cb = E.run('COLUMNAS_B');
  const hB = Object.keys(cb).map(function (k) { return cb[k][0]; });
  const form = function (nombre, cierre, ins) {
    const r = hB.map(function () { return 0; });
    r[hB.indexOf(cb.nombre[0])] = nombre; r[hB.indexOf(cb.fechaFin[0])] = cierre;
    r[hB.indexOf(cb.inscriptos[0])] = ins; r[hB.indexOf(cb.identificados[0])] = ins; r[hB.indexOf(cb.M[0])] = ins / 2; r[hB.indexOf(cb.F[0])] = ins / 2;
    r[hB.indexOf(cb.canalMailing[0])] = ins; r[hB.indexOf(cb.edad25_39[0])] = ins;
    return r;
  };
  ssI.hojas['B'] = new E.Hoja('B', [hB,
    form('LAURA ALONSO - Encuentro con Vecinos - 8/10 Flores', new D(2026, 9, 7, 12), 40),
    form('CLARA MUZZIO - Encuentro con Vecinos - 20/9 Recoleta', new D(2026, 8, 19, 12), 30),
    form('XX DESCONOCIDO - Charla - 28/9', new D(2026, 8, 27, 12), 10),
    form('YY DESCONOCIDO - Charla - 12/10', new D(2026, 9, 11, 12), 12)]);
  const enc = E.run('COLS_ELECCIONES_');
  const elec = function (fig, bar, d, m, est) {
    const r = enc.map(function () { return ''; });
    r[enc.indexOf('fecha_carga')] = new D(2026, 9, 1, 12); r[enc.indexOf('hoja')] = 'REVISAR_MATCH'; r[enc.indexOf('figura')] = fig;
    r[enc.indexOf('barrio')] = bar; r[enc.indexOf('fecha')] = new D(2026, m - 1, d, 12); r[enc.indexOf('elegido')] = '1';
    r[enc.indexOf('form_nombre')] = 'un formulario de ' + fig; r[enc.indexOf('form_clave')] = 'clave-' + fig;
    r[enc.indexOf('estado')] = est; r[enc.indexOf('resultado')] = est + ' 02/10/2026';
    return r;
  };
  ssI.hojas[E.run('RDV_HOJA_ELECCIONES')] = new E.Hoja(E.run('RDV_HOJA_ELECCIONES'), [enc, elec('Ana Pereyra', 'Palermo', 28, 9, 'aplicado'),
                                                                                       elec('Gabino Tapia', 'Núñez', 10, 10, 'aplicado')]);
  return E;
}

/*
 * Lo que escriben las solapas de revisión, con los escritores reemplazados por una captura (nada llega a una planilla): el plan
 * (porFila, decisiones), escribirReportes_ (fichas con sus RESUELTAS, SIN_MATCH, EMPAREJAR_MANUAL), HISTORICO_SIN_RESOLVER (plan del
 * historial), IDS_SIN_CRUZAR (un `res` inventado) y AGENDA_PENDIENTES ("se hizo y no está en la base", un `P` inventado).
 */
const CAPTURA = '(function () {' +
  ' var cap = {};' +
  ' escribirHoja_ = function (n, m) { cap[n] = m; };' +
  ' escribirReporte_ = function (n, enc, filas) { cap[n] = [enc].concat(filas); };' +
  ' escribirFichasFormato_ = function (n, fv) { cap[n] = { pendientes: fv.pendientes.map(function (p) { return { fila: p.reunion.fila, fecha: p.reunion.fecha, porque: p.porque, opciones: p.opciones, elegido: p.elegido }; }),' +
  '   resueltas: fv.resueltas }; return { pendientes: fv.pendientes.length, resueltas: fv.resueltas.length, conservadas: 0 }; };' +
  ' escribirFichas_ = function (n, fx) { cap[n + "_bloque"] = fx.matriz; };' +
  ' avisoFichasEnDestino_ = function () {};' +
  ' var p = calcularPlan_(true, null, null);' +
  ' var fallaron = []; escribirReportes_(p, fallaron, null);' +
  ' cap.fichasBloque = armarFichas_(p, null, {}).matriz;' +
  ' var ph = calcularPlan_(true, null, { historial: true }); escribirHistoricoSinResolver_(ph);' +
  ' var linea = function (o, t) { return { orden: o, linea: [t, "", "Agenda JM", 3, "ID-" + o, "Jorge Macri", "Belgrano", "", t, "", ""] }; };' +
  ' escribirSinCruzarIds_({ sinCruzar: [linea(20261015, "15/10"), linea(20261006, "06/10"), linea(20261001, "01/10"), linea(0, "sin fecha")] }, "hora");' +
  ' var h = function (d, fig) { return { id: "hecha_sin_fila|" + fig + "|2026100" + d, fecha: new Date(2026, 9, d, 12), figura: fig, barrio: "Belgrano",' +
  '   direccion: "", candidatas: [], texto: "RDV CONJUNTO: " + fig }; };' +
  ' cap.pendientesAgenda = infoAgenda_({ enSeco: true, hechasSinFila: { lista: [h(2, "Clara Muzzio"), h(6, "Gabino Tapia"), h(8, "Laura Alonso")] } });' +
  ' cap.plan = { porFila: p.porFila, decisiones: p.decisiones.map(function (d) { return [d.fila.fila, d.cand ? d.cand.clave : "", d.nivel, d.score, !!d.noEscribir]; }),' +
  '   elecciones: p.elecciones.todas.map(function (e) { return [e.figura, e.estado, e.resultadoPlan || ""]; }), fallaron: fallaron };' +
  ' return JSON.stringify(cap); })()';

const correr = function (E) { return JSON.parse(E.run(CAPTURA)); };
const fechasFichas = function (c) { return c.REVISAR_MATCH.pendientes.map(function (p) { return p.fecha; }); };
const tieneFicha = function (c, fila) { return c.REVISAR_MATCH.pendientes.some(function (p) { return p.fila === fila; }); };
const lineasSin = function (c) { return c.SIN_MATCH.slice(1); };
const datosEmp = function (m) { return m.slice(1).filter(function (l) { return !/^---/.test(String(l[0])) && l.some(function (x) { return x !== ''; }); }); };
const antes = function (s) { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(s)); return !!m && (m[3] + m[2] + m[1]) < '20261006'; };

// ---------------------------------------------------------------------------------------------------------------------------------
console.log('[1] APAGADO: las solapas de revisión y el plan IDÉNTICOS al código de antes (' + BASE_GIT + ')');
const off = correr(montar({}));
if (!fuenteDeGit('26_Fichas.js')) console.log('  (no se pudo leer el commit ' + BASE_GIT + ': se saltea)');
else {
  const git = correr(montar({}, true));
  ['REVISAR_MATCH', 'SIN_MATCH', 'EMPAREJAR_MANUAL', 'HISTORICO_SIN_RESOLVER', 'IDS_SIN_CRUZAR', 'pendientesAgenda', 'fichasBloque', 'plan'].forEach(function (k) {
    ok(JSON.stringify(off[k]) === JSON.stringify(git[k]), k + ': idéntico al código de antes');
  });
  ok(JSON.stringify(off) === JSON.stringify(git), 'todo lo capturado, idéntico');
}
ok(tieneFicha(off, 2) && tieneFicha(off, 6) && tieneFicha(off, 7) && tieneFicha(off, 3) && tieneFicha(off, 5),
   'apagado, las fichas tienen lo viejo y lo nuevo — ' + JSON.stringify(fechasFichas(off)));
ok(off.HISTORICO_SIN_RESOLVER.length === 2, 'apagado, HISTORICO_SIN_RESOLVER tiene la cerrada (Arengo 01/09)');
ok(off.IDS_SIN_CRUZAR.length === 5, 'apagado, IDS_SIN_CRUZAR tiene los 4 IDs');

console.log('[2] PRENDIDO: lo de antes del 06/10 no aparece; lo del corte en adelante, igual que apagado');
const on = correr(montar({ REVISION_DESDE_FECHA_CORTE: 'true' }));
ok(JSON.stringify(on.plan) === JSON.stringify(off.plan), 'el plan (veredictos, decisiones = lo que se escribe en la base, elecciones) idéntico');
ok(!tieneFicha(on, 2) && !tieneFicha(on, 6) && !tieneFicha(on, 7), 'fichas: sin Muzzio 25/09, Landerreche 05/10 ni Pereyra 28/09 — ' + JSON.stringify(fechasFichas(on)));
ok(tieneFicha(on, 3) && tieneFicha(on, 5), 'fichas: con Tapia 10/10 y Lombardi 06/10 (el día del corte)');
ok(JSON.stringify(on.REVISAR_MATCH.pendientes) === JSON.stringify(off.REVISAR_MATCH.pendientes.filter(function (p) { return !antes(p.fecha); })),
   'las fichas que quedan son exactamente las de apagado del corte en adelante (mismas opciones, mismo "¿por qué?")');
const resOff = off.REVISAR_MATCH.resueltas.map(function (r) { return r.figura; }), resOn = on.REVISAR_MATCH.resueltas.map(function (r) { return r.figura; });
ok(resOff.indexOf('Ana Pereyra') >= 0 && resOn.indexOf('Ana Pereyra') < 0 && resOn.indexOf('Gabino Tapia') >= 0,
   'RESUELTAS: la de Pereyra (28/09) deja de mostrarse; la de Tapia (10/10) sigue — ' + JSON.stringify(resOn));
ok(lineasSin(off).some(function (l) { return antes(l[3]); }) && !lineasSin(on).some(function (l) { return antes(l[3]); }),
   'SIN_MATCH: apagado tiene líneas de antes del corte; prendido, ninguna');
ok(JSON.stringify(lineasSin(on)) === JSON.stringify(lineasSin(off).filter(function (l) { return !antes(l[3]); })),
   'SIN_MATCH: lo que queda es exactamente lo de apagado del corte en adelante');
const eOff = datosEmp(off.EMPAREJAR_MANUAL), eOn = datosEmp(on.EMPAREJAR_MANUAL);
ok(eOff.some(function (l) { return antes(l[4]); }) && JSON.stringify(eOn) === JSON.stringify(eOff.filter(function (l) { return !antes(l[4]); })),
   'EMPAREJAR_MANUAL: sin las líneas de antes del corte (el par de Muzzio, el formulario XX del 28/09), el resto igual — ' + eOn.length + ' de ' + eOff.length);
const titulo = function (m, re) { return (m.filter(function (l) { return re.test(String(l[0])); })[0] || [''])[0]; };
ok(/\(1\)/.test(titulo(on.EMPAREJAR_MANUAL, /FORMULARIOS SIN/)) && /\(2\)/.test(titulo(off.EMPAREJAR_MANUAL, /FORMULARIOS SIN/)),
   'EMPAREJAR_MANUAL: el título de los formularios sin candidato se recuenta (2 → 1) — ' + titulo(on.EMPAREJAR_MANUAL, /FORMULARIOS SIN/));
ok(on.HISTORICO_SIN_RESOLVER.length === 1, 'HISTORICO_SIN_RESOLVER: sólo el encabezado (la cerrada del 01/09 no se muestra)');
ok(JSON.stringify(on.IDS_SIN_CRUZAR.slice(1).map(function (l) { return l[0]; })) === JSON.stringify(['15/10', '06/10', 'sin fecha']),
   'IDS_SIN_CRUZAR: sin el del 01/10; con el del 06/10 y el sin fecha — ' + JSON.stringify(on.IDS_SIN_CRUZAR.slice(1).map(function (l) { return l[0]; })));
const hOn = on.pendientesAgenda.map(function (x) { return x.reunion; }), hOff = off.pendientesAgenda.map(function (x) { return x.reunion; });
ok(hOff.length === 3 && hOn.length === 2 && !hOn.some(function (r) { return /Muzzio/.test(r); }),
   '"se hizo y no está en la base": sin la del 02/10; con la del 06/10 y la del 08/10 — ' + JSON.stringify(hOn));
ok(!on.plan.fallaron.length && !off.plan.fallaron.length, 'ningún reporte falló');

console.log('[3] PRENDIDO: la escritura de la base es la misma (una corrida real del upsert sobre las dos bases)');
const base = function (E) {
  E.run('(function () { var p = calcularPlan_(false, null, null); aplicarDecisiones_(p.dest, p.decisiones, new Date(), null, false, null); })()');
  const h = E.planilla(E.run('RDV_SS_DESTINO')).hojas['RVD JM-CM - ES'];
  return JSON.stringify({ v: h.v, bg: h.bg });
};
const bOff = base(montar({})), bOn = base(montar({ REVISION_DESDE_FECHA_CORTE: 'true' }));
ok(bOff === bOn, 'la base después de escribir: idéntica (valores y fondos)');
ok(/Laura Alonso/.test(bOn) && JSON.parse(bOn).v[3][HDR.indexOf('Inscriptos')] === 40, 'y se escribió (Alonso 08/10: 40 inscriptos)');

console.log('[4] la fecha de corte: el día del corte se muestra; sin fecha, se muestra; mal escrita, no se esconde nada');
let E = montar({ REVISION_DESDE_FECHA_CORTE: 'true' });
ok(E.run('antesDelCorte_("05/10/2026", "20261006")') === true && E.run('antesDelCorte_("06/10/2026", "20261006")') === false,
   '05/10 antes, 06/10 no');
ok(E.run('antesDelCorte_("", "20261006")') === false && E.run('antesDelCorte_("1/10", "20261006")') === false &&
   E.run('antesDelCorte_(null, "20261006")') === false, 'vacía, sin año o null: se muestra');
ok(E.run('antesDelCorte_(new Date(2026, 9, 5, 12), "20261006")') === true && E.run('antesDelCorte_(new Date(2026, 9, 5, 12), null)') === false,
   'un Date antes del corte: antes; sin corte: nunca');
ok(E.run('corteRevisionYmd_()') === '20261006', 'prendido: el corte es 20261006');
E = montar({ REVISION_DESDE_FECHA_CORTE: 'true', FECHA_CORTE_REVISION: "'06/10/2026'" });
ok(E.run('corteRevisionYmd_()') === null, 'una fecha mal escrita ("06/10/2026"): no se esconde nada');
const malEscrita = correr(E);
ok(JSON.stringify(malEscrita.REVISAR_MATCH) === JSON.stringify(off.REVISAR_MATCH) && JSON.stringify(malEscrita.SIN_MATCH) === JSON.stringify(off.SIN_MATCH),
   'y las solapas salen como apagado');
E = montar({ REVISION_DESDE_FECHA_CORTE: 'true', FECHA_CORTE_REVISION: "'2026-02-30'" });
ok(E.run('corteRevisionYmd_()') === null, 'una fecha que no existe (30/02): tampoco');

console.log('[5] el seco (medirCorteRevision): con el interruptor APAGADO, simula prendido, no escribe nada y verifica');
E = montar({});
const antesSeco = JSON.stringify(Object.keys(E.planillas).map(function (id) {
  return Object.keys(E.planillas[id].hojas).map(function (n) { return [n, E.planillas[id].hojas[n].v, E.planillas[id].hojas[n].bg]; }); }));
E.escrituras = 0; E.creadas = 0;
const R = E.run('medirCorteRevision({ n: 10 })');
const log = E.logs.join('\n');   // antes de otro E.run (que vacía los logs)
if (process.env.VER_LOG) console.log(log);
const despuesSeco = JSON.stringify(Object.keys(E.planillas).map(function (id) {
  return Object.keys(E.planillas[id].hojas).map(function (n) { return [n, E.planillas[id].hojas[n].v, E.planillas[id].hojas[n].bg]; }); }));
ok(antesSeco === despuesSeco && !E.escrituras && !E.creadas && !E.mails.length, 'no escribió ninguna celda, no creó solapas, no mandó mails');
ok(E.run('_forzarCorteRevision_') === null && E.run('corteRevisionYmd_()') === null, 'el interruptor sigue apagado y el forzado quedó como estaba');
ok(!R.error && !R.problemas.length, 'sin errores ni problemas — ' + (R.error || JSON.stringify(R.problemas)));
const sol = function (re) { return R.solapas.filter(function (s) { return re.test(s.nombre); })[0] || {}; };
ok(sol(/fichas pendientes/).salen === 3 && sol(/fichas pendientes/).quedan === 2, 'fichas: dejan de aparecer 3, quedan 2 — ' + JSON.stringify(sol(/fichas pendientes/)));
ok(sol(/RESUELTAS/).salen === 1, 'RESUELTAS: deja de aparecer 1 (Pereyra 28/09)');
ok(sol(/^SIN_MATCH/).salen >= 1 && sol(/^EMPAREJAR/).salen >= 2, 'SIN_MATCH y EMPAREJAR_MANUAL: lo de antes del corte — ' +
   JSON.stringify([sol(/^SIN_MATCH/), sol(/^EMPAREJAR/)]));
ok(/DEJAN DE APARECER 3/.test(log) && /25\/09\/2026 \| fila 2 \| Clara Muzzio/.test(log) && /VERIFICACIÓN: no desaparece nada del 06\/10\/2026/.test(log),
   'el log: cuántas, cuáles (con su fecha) y la verificación');
ok(/HISTORICO_SIN_RESOLVER .*no existe o está vacía/.test(log) && /IDS_SIN_CRUZAR .*no existe o está vacía/.test(log),
   'HISTORICO_SIN_RESOLVER e IDS_SIN_CRUZAR, sin solapa: lo dice (nada que esconder)');

console.log('[5b] el seco con HISTORICO_SIN_RESOLVER, IDS_SIN_CRUZAR y RDV CONJUNTO (fechas como Date y como texto)');
E = montar({});
(function () {
  const ssI = E.planilla(E.run('RDV_SS_INTERMEDIA')), ssD = E.planilla(E.run('RDV_SS_DESTINO'));
  ssI.hojas['HISTORICO_SIN_RESOLVER'] = new E.Hoja('HISTORICO_SIN_RESOLVER', [
    ['fila', 'figura', 'fecha', 'barrio', 'veredicto', 'motivo', 'mejor_opcion', 'confianza', 'puntaje', 'form_clave', 'en_ventana'],
    [8, 'Gustavo Arengo Piragine', '01/09/2026', 'Flores', 'SIN_MATCH', 'score_bajo', '', '', '', '', 'TRUE'],
    [9, 'Hernán Lombardi', new D(2026, 9, 7, 12), 'Saavedra', 'SIN_MATCH', 'score_bajo', '', '', '', '', 'TRUE']]);
  const enc = E.run('IDS_ENCABEZADO_SIN_CRUZAR_').slice();
  const id = function (fecha, idt) { return ['sin_fila', '', 'Agenda JM', 3, idt, 'Jorge Macri', 'Belgrano', '', fecha, '', '']; };
  ssI.hojas['IDS_SIN_CRUZAR'] = new E.Hoja('IDS_SIN_CRUZAR', [enc, id(new D(2026, 9, 1, 12), 'A-01'), id('15/10/2026', 'A-15'), id('1/10', 'A-sin-año')]);
  const dia = function (d, m) { return new D(2026, m - 1, d, 12); };
  ssD.hojas['RDV CONJUNTO'] = new E.Hoja('RDV CONJUNTO', [['Figura', 'Barrio', 'FECHA', 'Dirección', 'Asistentes', 'Oradores anotados', 'Oradores que hablaron', 'Estado'],
    ['Tapia Gabino', 'Núñez', dia(2, 10), '', 30, '', '', 'Realizada'],
    ['Tapia Gabino', 'Núñez', dia(13, 10), '', 25, '', '', 'Realizada'],
    ['Muzzio Clara', 'Recoleta', dia(15, 9), '', 20, '', '', 'Realizada']]);   // antes del alcance de la agenda (20/09)
})();
const R5 = E.run('medirCorteRevision({ n: 10 })');
const log5 = E.logs.join('\n');
if (process.env.VER_LOG) console.log(log5);
const sol5 = function (re) { return R5.solapas.filter(function (s) { return re.test(s.nombre); })[0] || {}; };
ok(!R5.error && !R5.problemas.length, 'sin errores ni problemas — ' + (R5.error || JSON.stringify(R5.problemas)));
ok(sol5(/^HISTORICO/).total === 2 && sol5(/^HISTORICO/).salen === 1, 'HISTORICO_SIN_RESOLVER: la del 01/09 (texto) sale, la del 07/10 (Date) queda — ' + JSON.stringify(sol5(/^HISTORICO/)));
ok(sol5(/^IDS_SIN_CRUZAR/).total === 3 && sol5(/^IDS_SIN_CRUZAR/).salen === 1 && /01\/10\/2026 \| A-01/.test(log5),
   'IDS_SIN_CRUZAR: el del 01/10 sale; el del 15/10 y el "1/10" sin año quedan — ' + JSON.stringify(sol5(/^IDS_SIN_CRUZAR/)));
ok(sol5(/se hizo y no está/).total === 2 && sol5(/se hizo y no está/).salen === 1 && /02\/10\/2026 \| 02\/10\/2026 \| Gabino Tapia/.test(log5),
   '"se hizo y no está en la base": la del 02/10 sale, la del 13/10 queda — ' + JSON.stringify(sol5(/se hizo y no está/)));
ok(/como el paso 104, desde el 15\/07: 3 "hechas sin fila", 2 de antes del corte/.test(log5) && /15\/09\/2026 Clara Muzzio/.test(log5),
   'y como el paso 104 (desde el 15/07): la vieja de Muzzio 15/09 (fuera del alcance de la agenda), listada aparte');

console.log('[6] la verificación del seco grita si desapareciera algo del corte en adelante (o sin fecha)');
E = montar({});
const Rv = E.run('(function () { var R = { solapas: [], problemas: [] };' +
  ' var a = { f: "05/10/2026" }, b = { f: "06/10/2026" }, c = { f: "" };' +
  ' _informarCorte_(R, "prueba", [a, b, c], [a], "20261006", 5, function (x) { return x.f; }, function (x) { return "linea " + x.f; });' +
  ' return R; })()');
ok(Rv.problemas.length === 2 && /DESAPARECERÍA "linea 06\/10\/2026"/.test(Rv.problemas.join('|')) && /ilegible/.test(Rv.problemas.join('|')),
   'el 06/10 y el sin fecha que desaparecen: problema — ' + JSON.stringify(Rv.problemas));
const Rv2 = E.run('(function () { var R = { solapas: [], problemas: [] }; var a = { f: "05/10/2026" }, b = { f: "07/10/2026" };' +
  ' _informarCorte_(R, "prueba", [a], [a, b], "20261006", 5, function (x) { return x.f; }, function (x) { return "linea " + x.f; }); return R; })()');
ok(Rv2.problemas.length === 1 && /APARECERÍA/.test(Rv2.problemas[0]), 'algo que aparece y no estaba: problema');
// el seco entero, con un filtro roto a propósito (esconde también el 06/10): MAYÚSCULAS en el log
E = montar({});
E.run('antesDelCorte_ = (function (orig) { return function (v, corte) { return orig(v, corte ? "20261007" : corte); }; })(antesDelCorte_)');
const Rroto = E.run('medirCorteRevision({ n: 5 })');
ok(Rroto.problemas.length > 0 && /DESAPARECERÍA ALGO CON FECHA IGUAL O POSTERIOR AL CORTE/.test(E.logs.join('\n')),
   'un filtro roto que esconde el 06/10: el seco lo dice en MAYÚSCULAS — ' + Rroto.problemas.length + ' problema(s)');

console.log('[7] un solo nombre top-level por función/const en los archivos nuevos');
const nombres = {};
['59_CorteRevision.js', 'diagnostico/40_corte_revision.js'].forEach(function (f) {
  const s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
  (s.match(/^(?:function|const|var|let)\s+([A-Za-z0-9_$]+)/mg) || []).forEach(function (x) { const n = x.split(/\s+/)[1]; nombres[n] = (nombres[n] || 0) + 1; });
});
const repetidos = [];
fs.readdirSync(RAIZ).filter(function (f) { return /\.js$/.test(f) && f !== '59_CorteRevision.js'; }).map(function (f) { return f; })
  .concat(fs.readdirSync(path.join(RAIZ, 'diagnostico')).filter(function (f) { return /\.js$/.test(f) && f !== '40_corte_revision.js'; }).map(function (f) { return 'diagnostico/' + f; }))
  .forEach(function (f) {
    const s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    (s.match(/^(?:function|const|var|let)\s+([A-Za-z0-9_$]+)/mg) || []).forEach(function (x) { const n = x.split(/\s+/)[1]; if (nombres[n]) repetidos.push(n + ' (' + f + ')'); });
  });
ok(!repetidos.length && Object.keys(nombres).every(function (n) { return nombres[n] === 1; }), 'sin repetidos — ' + JSON.stringify(repetidos));

console.log('');
console.log(fallas ? fallas + ' FALLA(S)' : 'Todo en verde.');
process.exit(fallas ? 1 : 0);
