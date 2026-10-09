/**
 * tests/ayuda.test.js — las solapas de ayuda (paso 48, 43_Ayuda.js): "GUÍA" en el archivo del destino y "LEER" en el
 * archivo "Agenda", con su formato. En Node, con un mock de Apps Script que registra valores y formato por celda.
 *
 *     node tests/ayuda.test.js
 *
 * NO sube a Apps Script (.claspignore: tests/**). Sin datos reales.
 */
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '27_RevisarFormato.js', '43_Ayuda.js'];

let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }

function crearEntorno() {
  const E = { logs: [], planillas: {} };
  class Hoja {
    constructor(nombre) {
      this.nombre = nombre; this.v = {}; this.fmt = {}; this.maxFilas = 1000; this.maxCols = 26;
      this.anchos = {}; this.altos = {}; this.congeladas = 0; this.sinGrilla = false; this.protecciones = [];
    }
    _f(f, c) { const k = f + ',' + c; return this.fmt[k] = this.fmt[k] || {}; }
    getName() { return this.nombre; }
    getMaxRows() { return this.maxFilas; }
    getMaxColumns() { return this.maxCols; }
    deleteColumns(c, n) { this.maxCols -= n; }
    deleteRows(f, n) { this.maxFilas -= n; }
    insertRowsAfter(f, n) { this.maxFilas += n; }
    clear() { this.v = {}; this.fmt = {}; }
    setColumnWidth(c, w) { this.anchos[c] = w; }
    setRowHeight(f, h) { this.altos[f] = h; }
    setFrozenRows(n) { this.congeladas = n; }
    setHiddenGridlines(b) { this.sinGrilla = b; }
    getProtections() { return this.protecciones.slice(); }
    protect() {
      const h = this;
      const pr = { desc: '', aviso: null, editores: [{ getEmail: function () { return 'otro@x'; } }],
        setDescription: function (d) { pr.desc = d; return pr; }, getDescription: function () { return pr.desc; },
        addEditor: function (u) { if (pr.aviso) throw new Error('Exception: isWarningOnly'); pr.editores.push(u); return pr; },
        getEditors: function () { return pr.editores.slice(); }, isWarningOnly: function () { return !!pr.aviso; },
        removeEditors: function (l) { pr.editores = pr.editores.filter(function (e) { return l.indexOf(e) < 0; }); return pr; },
        canDomainEdit: function () { return false; }, setDomainEdit: function () { return pr; },
        setWarningOnly: function (w) { pr.aviso = w; return pr; },
        remove: function () { h.protecciones = h.protecciones.filter(function (x) { return x !== pr; }); } };
      h.protecciones.push(pr);
      return pr;
    }
    getRange(f, c, nf, nc) {
      const h = this; nf = nf || 1; nc = nc || 1;
      const cada = function (fn) { for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) fn(f + i, c + j, i, j); };
      const r = {
        setValues: function (m) { cada(function (a, b, i, j) { h.v[a + ',' + b] = m[i][j]; }); return r; },
        setRichTextValue: function (rt) { h.v[f + ',' + c] = rt.texto; h._f(f, c).negritas = rt.negritas; return r; },
        setFontFamily: function (x) { cada(function (a, b) { h._f(a, b).fuente = x; }); return r; },
        setFontSize: function (x) { cada(function (a, b) { h._f(a, b).tamano = x; }); return r; },
        setWrap: function (x) { cada(function (a, b) { h._f(a, b).ajuste = x; }); return r; },
        setVerticalAlignment: function (x) { cada(function (a, b) { h._f(a, b).valign = x; }); return r; },
        setFontWeight: function (x) { cada(function (a, b) { h._f(a, b).peso = x; }); return r; },
        setFontColor: function (x) { cada(function (a, b) { h._f(a, b).letra = x; }); return r; },
        setBackground: function (x) { cada(function (a, b) { h._f(a, b).fondo = x; }); return r; }
      };
      return r;
    }
  }
  const planilla = function (id) {
    if (!E.planillas[id]) {
      const p = { hojas: [], activa: null,
        getSheetByName: function (n) { return p.hojas.filter(function (h) { return h.nombre === n; })[0] || null; },
        insertSheet: function (n) { const h = new Hoja(n); p.hojas.push(h); p.activa = h; return h; },
        getSheets: function () { return p.hojas.slice(); },
        setActiveSheet: function (h) { p.activa = h; return h; },
        moveActiveSheet: function (pos) { p.hojas = p.hojas.filter(function (x) { return x !== p.activa; }); p.hojas.splice(pos - 1, 0, p.activa); } };
      E.planillas[id] = p;
    }
    return E.planillas[id];
  };
  E.planilla = planilla;
  const ctx = {
    console: console, Date: Date, Math: Math, JSON: JSON, Map: Map, Set: Set, Object: Object, Array: Array, String: String,
    Logger: { log: function () { const a = Array.prototype.slice.call(arguments); let s = String(a.shift()); s = s.replace(/%s/g, function () { return String(a.shift()); }); E.logs.push(s); } },
    SpreadsheetApp: {
      openById: planilla, flush: function () {}, ProtectionType: { SHEET: 'SHEET' },
      newTextStyle: function () { const b = { negrita: false, setBold: function (x) { b.negrita = x; return b; }, build: function () { return { negrita: b.negrita }; } }; return b; },
      newRichTextValue: function () {
        const b = { texto: '', negritas: [], setText: function (t) { b.texto = t; return b; },
                    setTextStyle: function (i, j, st) { if (st.negrita) b.negritas.push(b.texto.slice(i, j)); return b; },
                    build: function () { return { texto: b.texto, negritas: b.negritas.slice() }; } };
        return b;
      }
    },
    Session: { getEffectiveUser: function () { return { getEmail: function () { return 'yo@x'; } }; } },
    Utilities: { formatDate: function () { return ''; } }
  };
  vm.createContext(ctx);
  ARCHIVOS.forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), ctx, { filename: f }); });
  E.ctx = ctx;
  E.run = function (expr) { E.logs = []; return vm.runInContext(expr, ctx); };
  return E;
}

const E = crearEntorno();
const idDest = E.run('RDV_SS_DESTINO'), idAg = E.run('AGENDA_COPIA_SS');
// los archivos ya tienen sus solapas (la guía tiene que quedar PRIMERA)
E.planilla(idDest).insertSheet('RVD JM-CM - ES'); E.planilla(idDest).insertSheet('REVISAR_MATCH');
E.planilla(idAg).insertSheet('Agenda'); E.planilla(idAg).insertSheet('Agenda cerrada');

console.log('[1] en seco: no escribe nada');
let r = E.run('escribirSolapasAyuda(false)');
ok(!E.planilla(idDest).getSheetByName('GUÍA') && !E.planilla(idAg).getSheetByName('LEER') && r.guia.filas > 0,
   'no crea ninguna solapa; dice cuántas filas escribiría (' + r.guia.filas + ' / ' + r.leer.filas + ')');

console.log('[2] real: "GUÍA" en el archivo del destino');
r = E.run('escribirSolapasAyuda(true)');
const g = E.planilla(idDest).getSheetByName('GUÍA');
const celda = function (h, f) { return h.v[f + ',1']; };
const fmt = function (h, f) { return h.fmt[f + ',1'] || {}; };
const n = r.guia.filas;
ok(E.planilla(idDest).getSheets()[0] === g, 'la primera de la izquierda');
ok(celda(g, 1) === 'GUÍA RÁPIDA — BASE RDV' && fmt(g, 1).peso === 'bold' && fmt(g, 1).tamano === 16 &&
   fmt(g, 1).fondo === '#1F3864' && fmt(g, 1).letra === '#FFFFFF' && g.altos[1] === 36, 'fila 1: el título, negrita 16, azul oscuro, letra blanca, 36 px');
ok(g.congeladas === 1 && g.sinGrilla === true && g.maxCols === 1 && g.anchos[1] === 900 && g.maxFilas === n,
   'fila 1 congelada, sin cuadrícula, una sola columna de 900 px, las filas justas');
let todas = true;
for (let f = 1; f <= n; f++) { const x = fmt(g, f); if (!(x.fuente === 'Arial' && x.ajuste === true && (f === 1 || x.tamano === 11 || x.tamano === 12))) todas = false; }
ok(todas, 'todas en Arial, con ajuste de texto, 11 (12 las secciones, 16 el título)');
const filas = []; for (let f = 1; f <= n; f++) filas.push(celda(g, f));
const iSec = filas.indexOf('QUÉ HACE EL SISTEMA (solo, cada hora)');
ok(iSec > 0 && filas[iSec - 1] === '' && fmt(g, iSec + 1).peso === 'bold' && fmt(g, iSec + 1).tamano === 12 && fmt(g, iSec + 1).fondo === '#D9E1F2',
   'título de sección: negrita 12, gris claro, con una fila en blanco antes');
const secciones = filas.filter(function (t, i) { return fmt(g, i + 1).fondo === '#D9E1F2'; });
ok(secciones.length === 6 && filas.filter(function (t) { return /^ • /.test(t); }).length === 20,
   '6 secciones y 20 viñetas (09/10: la de las columnas grises) (" • "), una por fila (' + secciones.length + ' / ' + filas.filter(function (t) { return /^ • /.test(t); }).length + ')');
const colores = E.run('_coloresAyuda_()');
const conColor = function (inicio) { const i = filas.findIndex(function (t) { return t.indexOf(' • ' + inicio) === 0; }); return fmt(g, i + 1).fondo; };
ok(conColor('Azul claro') === '#CFE2F3' && conColor('Verde') === colores.verde && conColor('Rojo') === colores.rojo &&
   conColor('Gris') === colores.gris && conColor('Amarillo') === colores.amarillo && colores.verde === '#CDEBD3',
   'QUÉ SIGNIFICAN LOS COLORES: cada línea con su color (los de las fichas y #CFE2F3)');
const iEleg = filas.findIndex(function (t) { return /ELEGIR/.test(t); });
ok(iEleg > 0 && JSON.stringify(fmt(g, iEleg + 1).negritas) === '["ELEGIR"]', 'ELEGIR en negrita');
ok(filas.indexOf(' • No escribir en: columnas calculadas, RDV_UID, form_*, agenda_*, Origen fila, Tocado por el equipo, columnas "(mail)", No participa, Conjunta con.') > 0 &&
   filas.indexOf(' • "Agenda": la semana en curso. "Agenda cerrada": las anteriores. Sólo lectura.') === n - 1, 'el texto, tal cual');
ok(g.protecciones.length === 1 && g.protecciones[0].aviso === false && g.protecciones[0].editores.length === 1 &&
   g.protecciones[0].editores[0].getEmail() === 'yo@x', 'protegida: sólo quien corre el script (y el dueño)');

console.log('[3] real: "LEER" en el archivo "Agenda"');
const l = E.planilla(idAg).getSheetByName('LEER');
ok(E.planilla(idAg).getSheets()[0] === l && celda(l, 1) === 'AGENDA DE ENCUENTROS CON VECINOS' && fmt(l, 1).fondo === '#1F3864',
   'primera de la izquierda, con su título');
const fl = []; for (let f = 1; f <= r.leer.filas; f++) fl.push(celda(l, f));
ok(fl.indexOf('IMPORTANTE') > 0 && fl[fl.length - 1] === ' • No se edita: se reescribe en cada actualización. Las correcciones se hacen en la base RDV.' &&
   l.congeladas === 1 && l.sinGrilla && l.maxCols === 1, 'el texto y el mismo formato');
ok(E.planilla(idDest).getSheetByName('RVD JM-CM - ES').v && Object.keys(E.planilla(idDest).getSheetByName('RVD JM-CM - ES').v).length === 0 &&
   Object.keys(E.planilla(idAg).getSheetByName('Agenda').v).length === 0, 'no toca ninguna otra solapa');

console.log('[4] otra vez: se reescriben, sin duplicar');
E.run('escribirSolapasAyuda(true)');
ok(E.planilla(idDest).getSheets().filter(function (h) { return h.nombre === 'GUÍA'; }).length === 1 &&
   E.planilla(idDest).getSheetByName('GUÍA').protecciones.length === 1 && E.planilla(idDest).getSheets()[0].nombre === 'GUÍA',
   'una sola GUÍA, una sola protección, sigue primera');

console.log('[5] una protección que quedó de ADVERTENCIA (07/10, bug "addEditor … isWarningOnly"): vuelve a ser real');
const gg = E.planilla(idDest).getSheetByName('GUÍA');
gg.protecciones.forEach(function (p) { p.aviso = true; p.desc = 'otra'; });   // de advertencia y con otra descripción
const protOrig = gg.protect;
gg.protect = function () { return gg.protecciones[0] || protOrig.call(gg); };   // como Google: devuelve la que ya tiene
E.run('escribirSolapasAyuda(true)');
ok(gg.protecciones.length === 1 && gg.protecciones[0].aviso === false &&
   gg.protecciones[0].editores.every(function (e) { return e.getEmail() === 'yo@x'; }),
   'la que había quedado de advertencia pasa a real (sólo quien corre el script)');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
