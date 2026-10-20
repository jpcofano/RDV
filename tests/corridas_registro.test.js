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

console.log('[4] 20/10 (prompt 09, punto 3): el paso 67 muestra el plan por dentro, Gmail barata / completa y los topes');
E = entorno(null);
{
  const e = enc(E);
  const fila = function (o) { return e.map(function (k) { return k in o ? o[k] : (k === 'inicio' ? new Date(2026, 9, 20, 9) : (k === 'estado' ? 'ok' : '')); }); };
  const h = hoja('REGISTRO_CORRIDAS', [e,
    fila({ total_s: 150, plan_indices_s: 0.5, plan_historial_s: 12, plan_conciliacion_s: 40, plan_copia_s: 3, agenda_gmail_s: 1.2, agenda_gmail: 'barata',
           agenda_mails_cache: 'hilos 29/29 · cache sin cambios (no se escribió)' }),
    fila({ total_s: 160, plan_indices_s: 0.7, plan_historial_s: 14, plan_conciliacion_s: 60, plan_copia_s: 5, agenda_gmail_s: 22, agenda_gmail: 'completa: cada 4 horas',
           agenda_mails_cache: 'hilos 29/29 · cache escrita', topes: 'agenda (205 s)', salteadas_por_tiempo: 'agenda' }),
    fila({ total_s: 300, agenda_gmail_s: 30, agenda_gmail: 'completa: un mensaje nuevo en un hilo (asunto)', topes: 'escritura (250 s)', escritura_s: 'salteada' }),
    fila({ total_s: 120 })]);
  E = entorno(h);
  const t = E.run('tiemposDeCorridas()');
  ok(t.planTramos && t.planTramos.conciliacion && t.planTramos.conciliacion.mediana === 50 && t.planTramos.conciliacion.max === 60 && t.planTramos.historial.mediana === 13,
     'los tramos del plan: conciliación mediana 50 s, máximo 60 s; historial mediana 13 s — ' + JSON.stringify(t.planTramos));
  ok(E.logs.some(function (l) { return /plan\/conciliacion\s+mediana 50\.0 s · máximo 60\.0 s/.test(l); }), 'y el log los muestra');
  ok(t.gmail && t.gmail.barata === 1 && t.gmail.completa === 2 && t.gmail.motivos['cada 4 horas'] === 1, 'Gmail: barata 1, completa 2 (con el motivo) — ' + JSON.stringify(t.gmail));
  ok(E.logs.some(function (l) { return /Gmail: búsqueda BARATA 1 veces \(tramo gmail 1\.2 s/.test(l); }), 'el log dice cuánto tarda el tramo gmail con la barata y con la completa');
  ok(t.topes.agenda === 1 && t.topes.escritura === 1 && E.logs.some(function (l) { return /TOPES antes de escribir: la agenda no escribió por el tope 1 veces/.test(l); }),
     'los topes: la agenda 1 vez, la escritura del cruce 1 vez');
  ok(t.cacheEscrita && t.cacheEscrita.no === 1 && t.cacheEscrita.si === 1, 'la cache de los mails: sin cambios 1, escrita 1');
}

console.log('\n' + chequeos + ' chequeos.');
if (fallas) { console.log(fallas + ' FALLA(S)'); process.exit(1); }
console.log('Todo en verde.');
