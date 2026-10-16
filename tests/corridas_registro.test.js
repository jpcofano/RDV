/**
 * tests/corridas_registro.test.js — REGISTRO_CORRIDAS sin encabezado (16/10): el paso 67 y el resumen del lunes mostraban
 * "estados: undefined 8". Una solapa que ya existía sin el encabezado: el escritor lo pone en la fila 1 y el lector lo busca
 * (o usa el orden fijo de las columnas).
 *
 *     node tests/corridas_registro.test.js
 *
 * NO sube a Apps Script. Sin datos reales.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');

let chequeos = 0, fallas = 0;
function ok(c, q) { chequeos++; console.log((c ? '  ok   ' : '  FALLA ') + q); if (!c) fallas++; }

function hoja(nombre, filas) {
  const h = { v: filas.map(function (r) { return r.slice(); }) };
  h.getName = function () { return nombre; };
  h.getLastRow = function () { return h.v.length; };
  h.getLastColumn = function () { return h.v.reduce(function (m, r) { return Math.max(m, r.length); }, 0); };
  h.appendRow = function (r) { h.v.push(r.slice()); };
  h.insertRowBefore = function (n) { h.v.splice(n - 1, 0, []); };
  h.getRange = function (f, c, nf, nc) {
    nf = nf || 1; nc = nc || 1;
    return {
      getValue: function () { return (h.v[f - 1] || [])[c - 1] == null ? '' : h.v[f - 1][c - 1]; },
      getValues: function () {
        const out = [];
        for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) { const x = (h.v[f - 1 + i] || [])[c - 1 + j]; r.push(x == null ? '' : x); } out.push(r); }
        return out;
      },
      setValues: function (m) { m.forEach(function (r, i) { h.v[f - 1 + i] = h.v[f - 1 + i] || []; r.forEach(function (x, j) { h.v[f - 1 + i][c - 1 + j] = x; }); }); }
    };
  };
  return h;
}

function entorno(hojaInicial) {
  const logs = [];
  const ss = { hojas: {} };
  if (hojaInicial) ss.hojas.REGISTRO_CORRIDAS = hojaInicial;
  ss.getSheetByName = function (n) { return ss.hojas[n] || null; };
  ss.insertSheet = function (n) { ss.hojas[n] = hoja(n, []); return ss.hojas[n]; };
  const ctx = {
    Logger: { log: function (fmt) { const a = Array.prototype.slice.call(arguments, 1); let k = 0; logs.push(String(fmt).replace(/%s/g, function () { return String(a[k++]); })); } },
    SpreadsheetApp: { flush: function () {} },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function () { return null; }, setProperty: function () {}, deleteProperty: function () {} }; } },
    Utilities: { formatDate: function (d) { return String(d.getTime()); } },
    console: console, Math: Math, JSON: JSON, Date: Date, String: String, Object: Object, Array: Array, RegExp: RegExp
  };
  vm.createContext(ctx);
  ['00_Config.js', '01_Utils.js', '49_Corridas.js'].forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), ctx, { filename: f }); });
  ctx.__ss = ss;
  vm.runInContext('ssIntermedia_ = function () { return __ss; };', ctx);
  return { ctx: ctx, ss: ss, logs: logs, run: function (e) { return vm.runInContext(e, ctx); } };
}
const enc = function (E) { return E.run('encabezadoCorridas_()'); };
const filaDe = function (E, estado) {
  const e = enc(E);
  return e.map(function (k) { return k === 'estado' ? estado : (k === 'inicio' ? new Date(2026, 9, 15, 9) : (k === 'total_s' ? 200 : (k === 'agenda_s' ? 90 : ''))); });
};

console.log('[1] la solapa existe SIN encabezado (8 corridas): el lector las cuenta bien');
let E = entorno(null);
const sinEnc = hoja('REGISTRO_CORRIDAS', []);
for (let i = 0; i < 8; i++) sinEnc.v.push(filaDe(E, i < 6 ? 'ok' : 'terminó, con partes salteadas'));
E = entorno(sinEnc);
let t = E.run('tiemposDeCorridas()');
ok(t && t.estados && t.estados.ok === 6 && t.estados['terminó, con partes salteadas'] === 2 && !t.estados.undefined,
   'estados: ok 6 | terminó, con partes salteadas 2 (no "undefined 8") — ' + JSON.stringify(t && t.estados));
ok(t.agenda && t.agenda.veces === 8 && t.agenda.mediana === 90, 'y las partes también se leen por el orden fijo (agenda 8 veces, mediana 90 s)');
ok(E.logs.some(function (l) { return /no tiene encabezado/.test(l); }), 'el log lo dice');

console.log('[2] el escritor pone el encabezado en la fila 1 si falta');
E.run('_escribirFilaCorrida_({ t0: Date.now(), id: "x", modo: "real", partes: { agenda: 1000 }, salteadas: [], errores: [] }, "ok", 2000)');
ok(E.ss.hojas.REGISTRO_CORRIDAS.v[0][0] === 'inicio' && E.ss.hojas.REGISTRO_CORRIDAS.v[0][3] === 'estado' && E.ss.hojas.REGISTRO_CORRIDAS.v.length === 10,
   'el encabezado quedó en la fila 1, arriba de las 8 viejas y la nueva');
t = E.run('tiemposDeCorridas()');
ok(t.estados.ok === 7 && !t.estados.undefined, 'y ahora se lee con el encabezado: ok 7 — ' + JSON.stringify(t.estados));
E.run('_escribirFilaCorrida_({ t0: Date.now(), id: "y", modo: "real", partes: {}, salteadas: [], errores: [] }, "ok", 1000)');
ok(E.ss.hojas.REGISTRO_CORRIDAS.v.filter(function (r) { return r[0] === 'inicio'; }).length === 1, 'la corrida siguiente no lo vuelve a poner');

console.log('[3] la solapa nueva: se crea con su encabezado (como siempre)');
E = entorno(null);
E.run('_escribirFilaCorrida_({ t0: Date.now(), id: "z", modo: "real", partes: {}, salteadas: [], errores: [] }, "ok", 1000)');
ok(E.ss.hojas.REGISTRO_CORRIDAS.v.length === 2 && E.ss.hojas.REGISTRO_CORRIDAS.v[0][0] === 'inicio', 'encabezado + una corrida');
t = E.run('tiemposDeCorridas()');
ok(t === null || (t.estados && !t.estados.undefined), 'con una sola corrida no hay nada raro');

console.log('\n' + chequeos + ' chequeos.');
if (fallas) { console.log(fallas + ' FALLA(S)'); process.exit(1); }
console.log('Todo en verde.');
