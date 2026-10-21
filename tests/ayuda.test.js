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
// 15/10: 47_AgendaVistas.js por ordenarSolapasAgenda_ (la LEER va a la primera de las del sistema, sin mover las del equipo)
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '27_RevisarFormato.js', '43_Ayuda.js', '47_AgendaVistas.js'];

let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }

function crearEntorno(formsSinFila, formatoDirecta) {
  const E = { logs: [], planillas: {} };
  class Hoja {
    constructor(nombre) {
      this.nombre = nombre; this.v = {}; this.fmt = {}; this.maxFilas = 1000; this.maxCols = 26;
      this.anchos = {}; this.altos = {}; this.congeladas = 0; this.sinGrilla = false; this.protecciones = [];
    }
    _f(f, c) { const k = f + ',' + c; return this.fmt[k] = this.fmt[k] || {}; }
    getName() { return this.nombre; }
    getIndex() { return this.p.hojas.indexOf(this) + 1; }
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
        insertSheet: function (n, i) { const h = new Hoja(n); h.p = p; if (i == null || i >= p.hojas.length) p.hojas.push(h); else p.hojas.splice(i, 0, h); p.activa = h; return h; },
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
  ARCHIVOS.forEach(function (f) {
    let src = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    // 16/10: la etapa 1 quedó prendida en 00_Config.js; estos chequeos cuentan la GUÍA / LEER con todo APAGADO
    if (f === '00_Config.js') src = src.replace(/^const (\w+) = true;\s+\/\/ 16\/10: PRENDIDO \(etapa 1[^\n]*$/gm, 'const $1 = false;');
    // 13/10: la sección de FORMULARIOS_SIN_FILA entra a la GUÍA sólo con la solapa prendida
    if (formsSinFila && f === '00_Config.js') src = src.replace('const FORMULARIOS_SIN_FILA_ACTIVA = false;', 'const FORMULARIOS_SIN_FILA_ACTIVA = true;');
    // 15/10: la LEER habla del formato de "Agenda Directa" sólo con AGENDA_MAIL_FORMATO_DIRECTA
    if (formatoDirecta && f === '00_Config.js') src = src.replace('const AGENDA_MAIL_FORMATO_DIRECTA = false;', 'const AGENDA_MAIL_FORMATO_DIRECTA = true;');
    // 20/10 (prompt 10): el guardián prendido, en 'avisar' o en 'restaurar' (crearEntorno.guardian = 'avisar' | 'restaurar')
    if (crearEntorno.guardian && f === '00_Config.js') {
      src = src.replace('const GUARDIAN_ACTIVO = false;', 'const GUARDIAN_ACTIVO = true;').replace("const GUARDIAN_MODO = 'avisar';", "const GUARDIAN_MODO = '" + crearEntorno.guardian + "';");
    }
    vm.runInContext(src, ctx, { filename: f });
  });
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
ok(secciones.length === 8 && filas.filter(function (t) { return /^ • /.test(t); }).length === 28,
   '8 secciones y 28 viñetas (20/10, prompt 10: COLUMNAS: CUÁLES PUEDE TOCAR EL EQUIPO, con el guardián apagado; 20/10: MANDA EL MAIL; 09/10: la de las columnas grises; 13/10: la solapa "Agenda" de este archivo; 16/10: AGENDA_DUPLICADOS sólo decide, y una reunión en dos filas; FORMULARIOS_SIN_FILA apagada: no está) (" • "), una por fila (' + secciones.length + ' / ' + filas.filter(function (t) { return /^ • /.test(t); }).length + ')');
const colores = E.run('_coloresAyuda_()');
const conColor = function (inicio) { const i = filas.findIndex(function (t) { return t.indexOf(' • ' + inicio) === 0; }); return fmt(g, i + 1).fondo; };
ok(conColor('Azul claro') === '#CFE2F3' && conColor('Verde') === colores.verde && conColor('Rojo') === colores.rojo &&
   conColor('Gris') === colores.gris && conColor('Amarillo') === colores.amarillo && colores.verde === '#CDEBD3',
   'QUÉ SIGNIFICAN LOS COLORES: cada línea con su color (los de las fichas y #CFE2F3)');
const iEleg = filas.findIndex(function (t) { return /ELEGIR/.test(t); });
ok(iEleg > 0 && JSON.stringify(fmt(g, iEleg + 1).negritas) === '["ELEGIR"]', 'ELEGIR en negrita');
ok(filas.indexOf(' • Del sistema, no escribir en ellas: columnas calculadas, RDV_UID, form_*, agenda_*, Origen fila, Tocado por el equipo, columnas "(mail)", No participa, Conjunta con, ID cuentas, Fecha envío campañas.') > 0 &&
   filas.indexOf(' • Del equipo (el sistema nunca las toca): One Page Entregado, Observaciones, Temas mas comentados, Semaforo politico, Síntesis cualitativa:.') > 0 &&
   filas.some(function (t) { return /^ • Datos que completa el sistema y el equipo puede corregir: Figura, Barrio, EVENTO, FECHA, HORA, Dirección, STATUS REUNIÓN, Inscriptos, .*Sin identificar\. /.test(t); }) &&
   filas.some(function (t) { return /Nunca ordenar ni pegar corrido sólo algunas columnas/.test(t); }) &&
   !filas.some(function (t) { return /encabezado gris|no la corrige|vuelve a poner|no escribe nada en la base hasta/.test(t); }) &&
   filas.indexOf(' • "Agenda": la semana en curso. "Agenda cerrada": las anteriores. Sólo lectura.') === n - 2 &&
   filas[n - 1] === ' • La solapa "Agenda" de este archivo es la misma "Agenda": la escribe el sistema cada hora. Sólo lectura.', 'el texto, tal cual');
ok(g.protecciones.length === 1 && g.protecciones[0].aviso === false && g.protecciones[0].editores.length === 1 &&
   g.protecciones[0].editores[0].getEmail() === 'yo@x', 'protegida: sólo quien corre el script (y el dueño)');

console.log('[3] real: "LEER" en el archivo "Agenda"');
const l = E.planilla(idAg).getSheetByName('LEER');
ok(E.planilla(idAg).getSheets()[0] === l && celda(l, 1) === 'AGENDA DE ENCUENTROS CON VECINOS' && fmt(l, 1).fondo === '#1F3864',
   'primera de la izquierda, con su título');
const fl = []; for (let f = 1; f <= r.leer.filas; f++) fl.push(celda(l, f));
ok(fl.indexOf('IMPORTANTE') > 0 && fl[fl.length - 2] === ' • No se edita: se reescribe en cada actualización. Las correcciones se hacen en la base RDV. (La excepción: las columnas del equipo de "Agenda (mail)".)' &&
   /^ • En la base RDV se corrigen los datos .* nunca sólo algunas columnas\.$/.test(fl[fl.length - 1]) &&
   l.congeladas === 1 && l.sinGrilla && l.maxCols === 1, 'el texto y el mismo formato');
ok(E.planilla(idDest).getSheetByName('RVD JM-CM - ES').v && Object.keys(E.planilla(idDest).getSheetByName('RVD JM-CM - ES').v).length === 0 &&
   Object.keys(E.planilla(idAg).getSheetByName('Agenda').v).length === 0, 'no toca ninguna otra solapa');

console.log('[3b] con FORMULARIOS_SIN_FILA prendida (13/10), la GUÍA suma su sección; apagada, no');
{
  const E2 = crearEntorno(true);
  const f2 = E2.run('filasAyuda_(AYUDA_GUIA_)').map(function (x) { return x.texto; });
  const f1 = E.run('filasAyuda_(AYUDA_GUIA_)').map(function (x) { return x.texto; });
  ok(f2.indexOf('SOLAPA FORMULARIOS_SIN_FILA (formularios que no quedaron en ninguna fila)') >= 0 &&
     f2.filter(function (t) { return /^ • /.test(t); }).length === 31 && f1.join('|').indexOf('FORMULARIOS_SIN_FILA') < 0,
     'prendida: 9 secciones y 31 viñetas; apagada: ni una mención');
}

console.log('[3d] 20/10 (prompt 10): con el guardián prendido, la GUÍA dice qué pasa si se toca una columna del sistema (según el modo)');
{
  crearEntorno.guardian = 'avisar';
  const Ea = crearEntorno(false);
  crearEntorno.guardian = 'restaurar';
  const Er = crearEntorno(false);
  crearEntorno.guardian = null;
  const ga = Ea.run('filasAyuda_(AYUDA_GUIA_)').map(function (x) { return x.texto; }), gr = Er.run('filasAyuda_(AYUDA_GUIA_)').map(function (x) { return x.texto; });
  const tiene = function (l, re) { return l.some(function (t) { return re.test(t); }); };
  ok(tiene(ga, /encabezado gris y están protegidas/) && tiene(ga, /el sistema no la corrige: le avisa/) && !tiene(ga, /vuelve a poner como estaba/) &&
     tiene(ga, /no escribe nada en la base hasta que se arregle/) && ga.filter(function (t) { return /^ • /.test(t); }).length === 31,
     'modo avisar: el gris y la protección, "no la corrige: le avisa", y que una desalineación frena (31 viñetas)');
  ok(tiene(gr, /vuelve a poner como estaba en la hora siguiente/) && !tiene(gr, /no la corrige: le avisa/) && tiene(gr, /no escribe nada en la base hasta que se arregle/),
     'modo restaurar: "la vuelve a poner como estaba"');
}

console.log('[3c] la LEER y el formato de "Agenda Directa" (15/10): sólo con AGENDA_MAIL_FORMATO_DIRECTA');
{
  const E3 = crearEntorno(false, true);
  const on = E3.run('filasAyuda_(AYUDA_LEER_)').map(function (x) { return x.texto; }).join(' ¶ ');
  const off = E.run('filasAyuda_(AYUDA_LEER_)').map(function (x) { return x.texto; }).join(' ¶ ');
  const tiene = function (t, s) { return t.indexOf(s) >= 0; };
  ok(tiene(on, 'con el formato de "Agenda Directa"') && tiene(on, '"Agenda Directa" es del equipo: el sistema no la escribe, no la mueve y no la protege') &&
     tiene(on, 'COLUMNAS DEL EQUIPO ("Agenda (mail)", formato "Agenda Directa")') && tiene(on, 'Implementador (desplegable); CONVOCATORIA') &&
     !tiene(on, 'por su lugar (B, C y D)') && !tiene(on, 'Responsable (desplegable)'),
     'prendido: las dos solapas ("Agenda (mail)" con el formato de "Agenda Directa"; "Agenda Directa" es del equipo) y sus columnas; nada de B, C y D');
  ok(!tiene(off, 'Agenda Directa') && tiene(off, 'por su lugar (B, C y D)') && tiene(off, 'Responsable (desplegable)'),
     'apagado: la LEER de siempre, sin nombrar "Agenda Directa"');
}

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

console.log('[6] 15/10: en el archivo "Agenda", la LEER va a la PRIMERA DE LAS DEL SISTEMA; las del equipo no se mueven');
{
  const E6 = crearEntorno();
  const ag = E6.planilla(E6.run('AGENDA_COPIA_SS'));
  ['Agenda Directa', 'Agenda', 'Sugerencia - Equipo Directa', 'Agenda cerrada'].forEach(function (n) { ag.insertSheet(n); });
  E6.run('escribirSolapasAyuda(true)');
  ok(ag.getSheets().map(function (h) { return h.nombre; }).join(' | ') === 'Agenda Directa | LEER | Sugerencia - Equipo Directa | Agenda | Agenda cerrada',
     'LEER en el primer lugar de las del sistema (2º); "Agenda Directa" sigue 1ª y "Sugerencia…" 3ª (' + ag.getSheets().map(function (h) { return h.nombre; }).join(' | ') + ')');
  E6.run('escribirSolapasAyuda(true)');
  ok(ag.getSheets().map(function (h) { return h.nombre; }).join(' | ') === 'Agenda Directa | LEER | Sugerencia - Equipo Directa | Agenda | Agenda cerrada',
     'otra vez: nada se mueve');
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
