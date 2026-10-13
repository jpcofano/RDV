/**
 * tests/agenda_vistas.test.js — las dos vistas nuevas del archivo "Agenda" (47_AgendaVistas.js, 09/10): "AgendaCall" y
 * "Agenda (mail)", y sobre todo que LO DEL EQUIPO (Responsable, Check 1, Check 2) sobreviva a un cambio de hora, a una
 * reescritura, a una reunión que desaparece y al cierre de la semana. El archivo "Agenda" simulado acá (con texto enriquecido,
 * casillas, desplegables, formato condicional y el orden de las solapas); la base y la intermedia, las de tests/ids_mock.js.
 *
 *     node tests/agenda_vistas.test.js
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: figuras, lugares y fechas inventados. Hoy: 08/10/2026.
 */
'use strict';
const { crearEntornoIds, filaBase, hdrBase } = require('./ids_mock');

let chequeos = 0, fallas = 0;
function ok(cond, que) { chequeos++; console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }
function igual(a, b, que) { const sa = JSON.stringify(a), sb = JSON.stringify(b); ok(sa === sb, que + (sa === sb ? '' : '  → dio ' + sa + ' y se esperaba ' + sb)); }

// ---------------------------- el archivo "Agenda" simulado ----------------------------
function archivoAgenda(nombres) {
  const hojas = [];
  const ss = {
    hojas: hojas,
    getSheetByName: function (n) { return hojas.filter(function (h) { return h.nombre === n; })[0] || null; },
    insertSheet: function (n) { const h = hoja(n); hojas.push(h); return h; },
    setActiveSheet: function (h) { ss.activa = h; return h; },
    moveActiveSheet: function (pos) { const i = hojas.indexOf(ss.activa); hojas.splice(i, 1); hojas.splice(pos - 1, 0, ss.activa); },
    getName: function () { return 'Agenda'; }
  };
  const hoja = function (nombre) {
    const h = { nombre: nombre, v: [], rich: {}, bg: {}, color: {}, bold: {}, val: {}, checks: {}, ocultas: [], reglas: [], prot: null, anchos: {} };
    const asegurar = function (r, c) { while (h.v.length < r) h.v.push([]); h.v.forEach(function (f) { while (f.length < c) f.push(''); }); };
    const rango = function (r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      const cada = function (fn) { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) fn(r + i, c + j, i, j); };
      const o = {
        getValues: function () { const out = []; for (let i = 0; i < nr; i++) { const f = []; for (let j = 0; j < nc; j++) { const x = h.v[r - 1 + i]; f.push(x && x[c - 1 + j] !== undefined ? x[c - 1 + j] : ''); } out.push(f); } return out; },
        setValues: function (m) { asegurar(r + nr - 1, c + nc - 1); cada(function (fi, co, i, j) { h.v[fi - 1][co - 1] = m[i][j]; }); return o; },
        setValue: function (x) { asegurar(r, c); h.v[r - 1][c - 1] = x; return o; },
        setRichTextValues: function (m) { asegurar(r + nr - 1, c + nc - 1); cada(function (fi, co, i, j) { h.v[fi - 1][co - 1] = m[i][j].text; h.rich[fi + ':' + co] = m[i][j]; }); return o; },
        setRichTextValue: function (x) { asegurar(r, c); h.v[r - 1][c - 1] = x.text; h.rich[r + ':' + c] = x; return o; },
        setBackground: function (b) { cada(function (fi, co) { h.bg[fi + ':' + co] = b; }); return o; },
        setFontColor: function (b) { cada(function (fi, co) { h.color[fi + ':' + co] = b; }); return o; },
        setFontWeight: function (w) { cada(function (fi, co) { h.bold[fi + ':' + co] = w; }); return o; },
        setNumberFormat: function () { return o; }, setWrap: function () { return o; }, setVerticalAlignment: function () { return o; },
        insertCheckboxes: function () { cada(function (fi, co) { h.checks[fi + ':' + co] = true; h.v[fi - 1] = h.v[fi - 1] || []; }); return o; },
        clearDataValidations: function () { cada(function (fi, co) { delete h.val[fi + ':' + co]; delete h.checks[fi + ':' + co]; }); return o; },
        setDataValidation: function (dv) { cada(function (fi, co) { h.val[fi + ':' + co] = dv; }); return o; },
        _a: [r, c, nr, nc]
      };
      return o;
    };
    Object.assign(h, {
      getName: function () { return nombre; },
      getIndex: function () { return ssRef.hojas.indexOf(h) + 1; },
      getRange: rango,
      getRangeList: function (l) { return { setBackground: function (b) { l.forEach(function (a1) { const p = a1.split(':'); const x = a1c(p[0]), y = a1c(p[1] || p[0]); rango(x[0], x[1], y[0] - x[0] + 1, y[1] - x[1] + 1).setBackground(b); }); } }; },
      getLastRow: function () { for (let i = h.v.length; i >= 1; i--) if (h.v[i - 1].some(function (x) { return x !== '' && x !== null && x !== undefined; })) return i; return 0; },
      getMaxRows: function () { return Math.max(h.v.length, 100); },
      clear: function () { h.v = []; h.rich = {}; h.bg = {}; h.color = {}; h.bold = {}; },
      setFrozenRows: function () {}, autoResizeColumns: function () {}, setColumnWidth: function (c, w) { h.anchos[c] = w; },
      hideColumns: function (c) { if (h.ocultas.indexOf(c) < 0) h.ocultas.push(c); },
      setConditionalFormatRules: function (r) { h.reglas = r; },
      getProtections: function () { return h.prot ? [h.prot] : []; },
      protect: function () {
        const p = { desc: '', adv: false, libres: [] };
        p.setDescription = function (d) { p.desc = d; return p; }; p.setWarningOnly = function (w) { p.adv = w; return p; };
        p.setUnprotectedRanges = function (l) { p.libres = l; return p; }; p.getDescription = function () { return p.desc; };
        p.remove = function () { h.prot = null; };
        h.prot = p; return p;
      }
    });
    return h;
  };
  const a1c = function (s) { const m = /^([A-Z]+)(\d+)$/.exec(s); let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return [+m[2], n]; };
  const ssRef = ss;
  (nombres || []).forEach(function (n) { const h = ss.insertSheet(n); h.v = [['contenido de ' + n]]; });
  return ss;
}

function entorno(baseFilas) {
  const HDR = hdrBase();
  const E = crearEntornoIds({ bloqueBase: [HDR].concat(baseFilas || []), maxColsBase: HDR.length, extra: ['40_Agenda.js', '47_AgendaVistas.js'] });
  const ss = archivoAgenda(['Agenda cerrada', 'LEER', 'Agenda']);          // en otro orden: el sistema las ordena
  E.archivos[E.cfg('AGENDA_COPIA_SS')] = { ss: ss, hojas: {} };
  const SA = E.ctx.SpreadsheetApp;
  SA.ProtectionType = { SHEET: 'SHEET', RANGE: 'RANGE' };
  SA.newRichTextValue = function () {
    const v = { text: '', estilos: [], link: '' };
    const b = { setText: function (t) { v.text = t; return b; }, setTextStyle: function (a, z, st) { v.estilos.push({ desde: a, hasta: z, st: st }); return b; },
                setLinkUrl: function (u) { v.link = u; return b; }, build: function () { return v; } };
    return b;
  };
  SA.newTextStyle = function () {
    const st = {};
    const b = { setBold: function (x) { st.bold = x; return b; }, setForegroundColor: function (c) { st.color = c; return b; },
                setStrikethrough: function (x) { st.tachado = x; return b; }, build: function () { return st; } };
    return b;
  };
  SA.newDataValidation = function () {
    const dv = {};
    const b = { requireValueInRange: function (rg) { dv.rango = rg._a; return b; }, setAllowInvalid: function (x) { dv.invalido = x; return b; }, build: function () { return dv; } };
    return b;
  };
  SA.newConditionalFormatRule = function () {
    const r = {};
    const b = { whenTextEqualTo: function (t) { r.texto = t; return b; }, setBackground: function (c) { r.fondo = c; return b; }, setRanges: function () { return b; }, build: function () { return r; } };
    return b;
  };
  E.agenda = ss;
  return E;
}

// las reuniones: `{ figura, fecha [d, m], hora, evento, lugar, cambios, estado, fila, semana [d, m, d, m] }`
function abierta(E, reuniones) {
  const F = E.ctx.Date, COLS = E.cfg('AGENDA_COPIA_COLUMNAS');
  const m = [COLS.slice()], items = [], ids = [null];
  reuniones.forEach(function (x) {
    const fecha = new F(2026, x.fecha[1] - 1, x.fecha[0], 12, 0, 0);
    const s = x.semana || [5, 10, 10, 10];
    const ev = { eventoTexto: x.evento, hora: x.hora, lugarTexto: x.lugar, lugar: x.lugar, fecha: fecha, cambios: x.cambios || '',
                 desde: new F(2026, s[1] - 1, s[0], 12), hasta: new F(2026, s[3] - 1, s[2], 12), figuraFila: x.figura, mailId: 'm1' };
    const fila = COLS.map(function (c) {
      return ({ 'Figura': x.figura, 'FECHA': fecha, 'HORA': x.hora, 'Semana': s[0] + '/' + s[1] + ' al ' + s[2] + '/' + s[3], 'EVENTO': x.evento,
                'Lugar del mail': x.lugar, 'Cambios': x.cambios || '', 'Estado en la agenda': x.estado || 'vigente', 'Fila del destino': x.fila || '',
                'Mail': 'Agenda … Semana', 'Versión': '1 de 1', 'Día': '' })[c] || '';
    });
    m.push(fila); ids.push('m1');
    items.push({ ev: ev, x: x.fila ? { fila: x.fila } : null, estado: x.estado || 'vigente' });
  });
  m.items = items; m.ids = ids;
  return m;
}
const BASE = function () {
  return [filaBase({ Figura: 'Jorge Macri', agenda_uid: 'c-1' }), filaBase({ Figura: 'Gabino Tapia', agenda_uid: 'c-2' }),
          filaBase({ Figura: 'Ana Pereyra', agenda_uid: 'c-3' }), filaBase({ Figura: 'Ruth Landerreche', agenda_uid: 'v-4' })];
};
const SEMANA = [
  { figura: 'Jorge Macri', fecha: [6, 10], hora: '18:00', evento: 'Encuentro con Vecinos Jorge Macri, Belgrano', lugar: 'Club Belgrano, Av. Cabildo 100', fila: 2 },
  { figura: 'Gabino Tapia', fecha: [8, 10], hora: '17:00', evento: 'Encuentro con Vecinos Gabino Tapia, Retiro', lugar: 'Plaza San Martín', fila: 3, cambios: 'hora 16:00 → 17:00' },
  { figura: 'Ana Pereyra', fecha: [9, 10], hora: '19:00', evento: 'Café con Ana Pereyra, Palermo', lugar: 'Café X, Honduras 4000', fila: 4 },
  { figura: 'Ruth Landerreche', fecha: [13, 10], hora: '18:30', evento: 'Encuentro con Vecinos Ruth Landerreche', lugar: 'Sede Comuna 1', fila: 5, semana: [12, 10, 17, 10] }
];
const nombres = function (ss) { return ss.hojas.map(function (h) { return h.nombre; }); };
const vista = function (E) { return E.agenda.getSheetByName('Agenda (mail)'); };
/** La fila de la vista donde está la reunión de clave `k`, y lo del equipo ahí. */
const enVista = function (E, k) {
  const h = vista(E);
  for (let i = 1; i < h.v.length; i++) if (h.v[i][4] === k) return { fila: i + 1, resp: h.v[i][1], c1: h.v[i][2], c2: h.v[i][3], texto: h.v[i][0] };
  return null;
};

// ===================================================================================================================
console.log('[1] apagado por defecto, y el gancho');
{
  const E = entorno(BASE());
  ok(E.cfg('AGENDA_VISTAS_NUEVAS') === false, 'AGENDA_VISTAS_NUEVAS = false');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', '40_Agenda.js'), 'utf8');
  ok(/_escribirSolapaCopiaAgenda_\(ss, AGENDA_COPIA_SOLAPA_CERRADA, pz\.cerrada\);\s*\/\/[^\n]*\n\s*if \(AGENDA_VISTAS_NUEVAS\) escribirVistasAgenda_\(ss, pz\.abierta, P\);/.test(src),
     'las vistas se escriben DESPUÉS de "Agenda" y "Agenda cerrada", y sólo con AGENDA_VISTAS_NUEVAS');
}

console.log('[2] AgendaCall: las columnas en su orden y un color por fila');
{
  const E = entorno(BASE());
  E.ctx.__ab = abierta(E, SEMANA);
  const c = E.run('armarVistaCallAgenda_(__ab, hoyMediodia_())');
  igual(c[0], E.cfg('AGENDA_CALL_COLUMNAS'), 'el encabezado: Figura | FECHA | Día | HORA | Semana | … | Mail | Versión');
  igual(c.slice(1).map(function (r) { return r[0]; }), ['Jorge Macri', 'Gabino Tapia', 'Ana Pereyra', 'Ruth Landerreche'], 'las mismas reuniones, en el mismo orden');
  igual(c.colores, ['#D9EAD3', '#FFF2CC', '#FFF2CC', '#F4CCCC'], 'colores: el 06/10 ya pasó (verde), hoy 08/10 y el 09/10 (amarillo), el 13/10 es la semana siguiente (rosado)');
}

console.log('[3] Agenda (mail): los días, la celda de tres líneas, lo cambiado en naranja, lo desaparecido tachado');
{
  const E = entorno(BASE());
  E.ctx.__ab = abierta(E, SEMANA.concat([{ figura: 'Jorge Macri', fecha: [10, 10], hora: '11:00', evento: 'Primera Persona', lugar: 'Teatro', fila: 0, estado: 'desaparecida', cambios: '' }]));
  const f = E.run('armarVistaMailAgenda_(__ab, hoyMediodia_(), __ab.items.map(function (it, i) { return "k" + i; }), {})');
  const dias = f.filter(function (x) { return x.tipo === 'dia'; }).map(function (x) { return x.texto; });
  igual(dias, ['lunes 05/10', 'martes 06/10', 'miércoles 07/10', 'jueves 08/10', 'viernes 09/10', 'sábado 10/10',
               'lunes 12/10', 'martes 13/10', 'miércoles 14/10', 'jueves 15/10', 'viernes 16/10', 'sábado 17/10'],
        'un renglón por día de lunes a sábado, de las dos semanas, aunque no haya reuniones');
  const tapia = f.filter(function (x) { return x.tipo === 'reunion' && /Tapia/.test(x.celda.texto); })[0];
  ok(tapia.celda.texto === 'Evento: Encuentro con Vecinos Gabino Tapia, Retiro\nHora: 17:00h\nLugar: Plaza San Martín', 'la celda, como el mail: "Evento: …" / "Hora: 17:00h" / "Lugar: …"');
  igual(tapia.celda.naranja.map(function (r) { return tapia.celda.texto.slice(r.desde, r.hasta); }), ['17:00h'], 'cambió la hora: en naranja sólo "17:00h"');
  const des = f.filter(function (x) { return x.tipo === 'reunion' && /Primera Persona/.test(x.celda.texto); })[0];
  ok(des.celda.tachada, 'una reunión desaparecida: tachada');
  E.ctx.__it = { ev: { eventoTexto: 'E', hora: '10:00', lugarTexto: 'Lugar nuevo', cambios: 'dirección A → B' }, estado: 'vigente' };
  const c2 = E.run('celdaMailAgenda_(__it)');
  igual(c2.naranja.map(function (r) { return c2.texto.slice(r.desde, r.hasta); }), ['Lugar nuevo'], 'cambió la dirección: en naranja sólo el lugar');
}

console.log('[4] escribir: las cinco solapas en su orden; "Agenda" y "Agenda cerrada" no se tocan');
{
  const E = entorno(BASE());
  const agendaAntes = JSON.stringify(E.agenda.getSheetByName('Agenda').v), cerradaAntes = JSON.stringify(E.agenda.getSheetByName('Agenda cerrada').v);
  E.ctx.__ab = abierta(E, SEMANA);
  E.run('escribirVistasAgenda_(SpreadsheetApp.openById(AGENDA_COPIA_SS), __ab, {})');
  igual(nombres(E.agenda), ['LEER', 'Agenda', 'AgendaCall', 'Agenda (mail)', 'Agenda cerrada'], 'el orden: LEER | Agenda | AgendaCall | Agenda (mail) | Agenda cerrada');
  ok(JSON.stringify(E.agenda.getSheetByName('Agenda').v) === agendaAntes && JSON.stringify(E.agenda.getSheetByName('Agenda cerrada').v) === cerradaAntes,
     '"Agenda" y "Agenda cerrada" quedan exactamente como estaban');
  const call = E.agenda.getSheetByName('AgendaCall');
  ok(call.v.length === 5 && call.bg['2:1'] === '#D9EAD3' && call.bg['5:1'] === '#F4CCCC' && call.prot && call.prot.adv, 'AgendaCall: 4 reuniones, los colores por fila, protegida con advertencia');
  const h = vista(E);
  ok(h.v[0].slice(0, 5).join('|') === 'Reunión (como el mail)|Responsable|Check 1|Check 2|clave' && h.v[0][6] === 'Responsables (opciones)', 'el encabezado y las opciones (columna G)');
  igual([h.v[1][6], h.v[2][6], h.v[3][6], h.v[4][6]], ['Lu', 'Cris', 'Mel', 'Yami'], 'las opciones de Responsable, la primera vez');
  const t = enVista(E, 'c-2');
  ok(!!t && h.rich[t.fila + ':1'].estilos.some(function (e) { return e.st.color === '#E69138' && e.st.bold; }) && h.bg[t.fila + ':1'] === '#FFF2CC', 'la reunión de Tapia: lo cambiado en naranja y negrita; amarilla (hoy)');
  const lunes = h.v.findIndex(function (r) { return r[0] === 'lunes 05/10'; }) + 1;
  ok(h.bg[lunes + ':1'] === '#000000' && h.color[lunes + ':1'] === '#FFFFFF' && h.bold[lunes + ':1'] === 'bold', 'los días: fondo negro, letra blanca, negrita');
  ok(h.checks[t.fila + ':3'] && h.checks[t.fila + ':4'] && !h.checks[lunes + ':3'] && h.val[t.fila + ':2'] && !h.val[lunes + ':2'],
     'casillas y desplegable sólo en las reuniones (no en los días)');
  ok(h.ocultas.indexOf(5) >= 0 && h.reglas.length === 4 && h.prot.adv && h.prot.libres.length === 3, 'la clave oculta (E), un color por responsable, protegida con advertencia y B:D + las opciones libres');
}

console.log('[5] LO DEL EQUIPO: sobrevive a un cambio de hora, a una reescritura, a una reunión que desaparece y al cierre de la semana');
{
  const E = entorno(BASE());
  const ss = 'SpreadsheetApp.openById(AGENDA_COPIA_SS)';
  E.ctx.__ab = abierta(E, SEMANA);
  E.run('escribirVistasAgenda_(' + ss + ', __ab, {})');
  // el equipo carga lo suyo en la de Tapia y en la de Pereyra
  let t = enVista(E, 'c-2'), p = enVista(E, 'c-3');
  vista(E).v[t.fila - 1][1] = 'Cris'; vista(E).v[t.fila - 1][2] = true;
  vista(E).v[p.fila - 1][1] = 'Mel'; vista(E).v[p.fila - 1][3] = true;
  // la agenda: Tapia pasa a las 20:00 del VIERNES (cambia el día, la hora y el orden); Pereyra igual
  const sem2 = SEMANA.map(function (x) { return Object.assign({}, x); });
  sem2[1].fecha = [9, 10]; sem2[1].hora = '20:00'; sem2[1].cambios = 'hora 17:00 → 20:00';
  E.ctx.__ab = abierta(E, sem2);
  E.run('escribirVistasAgenda_(' + ss + ', __ab, {})');
  t = enVista(E, 'c-2'); p = enVista(E, 'c-3');
  ok(t && t.resp === 'Cris' && t.c1 === true && t.c2 === false && /Hora: 20:00h/.test(t.texto), 'Tapia cambió de día y de hora: su Responsable y su Check 1 la siguen (fila ' + (t && t.fila) + ')');
  ok(p && p.resp === 'Mel' && p.c2 === true, 'Pereyra, igual');
  // otra reescritura igual: nada se pierde
  E.run('escribirVistasAgenda_(' + ss + ', __ab, {})');
  t = enVista(E, 'c-2');
  ok(t.resp === 'Cris' && t.c1 === true, 'reescrita otra vez: sigue todo');
  // Tapia desaparece del mail: tachada, con lo suyo
  const sem3 = sem2.map(function (x) { return Object.assign({}, x); });
  sem3[1].estado = 'desaparecida';
  E.ctx.__ab = abierta(E, sem3);
  E.run('escribirVistasAgenda_(' + ss + ', __ab, {})');
  t = enVista(E, 'c-2');
  ok(t.resp === 'Cris' && vista(E).rich[t.fila + ':1'].estilos.some(function (e) { return e.st.tachado; }), 'desaparecida: tachada y con su Responsable');
  // cierra la semana: Tapia y Pereyra ya no están en la vista, pero lo suyo queda guardado
  E.ctx.__ab = abierta(E, [SEMANA[3]]);
  E.run('escribirVistasAgenda_(' + ss + ', __ab, {})');
  const g = E.intermedia('AGENDA_EQUIPO').valores.slice(1);
  const de = function (k) { return g.filter(function (r) { return r[0] === k; })[0]; };
  ok(!enVista(E, 'c-2') && de('c-2') && de('c-2')[1] === 'Cris' && de('c-2')[2] === true && de('c-3')[1] === 'Mel',
     'la semana cerró: ya no están en la vista y lo suyo queda en AGENDA_EQUIPO (para consulta)');
  // y si vuelven a aparecer (otra versión), vuelven con lo suyo
  E.ctx.__ab = abierta(E, sem2);
  E.run('escribirVistasAgenda_(' + ss + ', __ab, {})');
  ok(enVista(E, 'c-2').resp === 'Cris' && enVista(E, 'c-3').resp === 'Mel', 'si vuelven a aparecer, vuelven con lo suyo');
  // el equipo borra lo suyo: queda borrado (no "vuelve")
  const tt = enVista(E, 'c-2'); vista(E).v[tt.fila - 1][1] = ''; vista(E).v[tt.fila - 1][2] = false;
  E.run('escribirVistasAgenda_(' + ss + ', __ab, {})');
  ok(enVista(E, 'c-2').resp === '' && enVista(E, 'c-2').c1 === false, 'si el equipo lo borra, queda borrado');
}

console.log('[6] los títulos y las opciones que cambió el equipo se conservan; si guardar falla, la vista no se toca');
{
  const E = entorno(BASE());
  const ss = 'SpreadsheetApp.openById(AGENDA_COPIA_SS)';
  E.ctx.__ab = abierta(E, SEMANA);
  E.run('escribirVistasAgenda_(' + ss + ', __ab, {})');
  vista(E).v[0][1] = 'Quién llama'; vista(E).v[0][2] = 'Llamado'; vista(E).v[4][6] = 'Ana';   // G5: Yami → Ana
  E.run('escribirVistasAgenda_(' + ss + ', __ab, {})');
  ok(vista(E).v[0][1] === 'Quién llama' && vista(E).v[0][2] === 'Llamado' && vista(E).v[0][3] === 'Check 2', 'los títulos que puso el equipo se conservan');
  ok(vista(E).v[4][6] === 'Ana' && vista(E).reglas.some(function (r) { return r.texto === 'Ana'; }), 'las opciones editadas también (y su color)');
  // guardar falla → la vista queda como estaba
  const t = enVista(E, 'c-1'); vista(E).v[t.fila - 1][1] = 'Lu';
  const antes = JSON.stringify(vista(E).v);
  E.ctx.escribirReporte_ = function () { throw new Error('la intermedia no responde'); };
  E.ctx.__ab = abierta(E, SEMANA.slice(1));
  E.run('escribirVistasAgenda_(' + ss + ', __ab, {})');
  ok(JSON.stringify(vista(E).v) === antes && /"Agenda \(mail\)" NO se escribió: Error: la intermedia no responde/.test(E.log()),
     'si no se puede guardar lo del equipo, "Agenda (mail)" NO se reescribe (no se pierde nada) y el log lo dice');
  ok(E.agenda.getSheetByName('AgendaCall').v.length === 4, '   (AgendaCall sí se escribe: es del sistema)');
}

console.log('[7] la LEER nueva');
{
  const leer = require('fs').readFileSync(require('path').join(__dirname, '..', '43_Ayuda.js'), 'utf8');
  ok(/"AgendaCall"/.test(leer) && /"Agenda \(mail\)"/.test(leer) && /Verde/.test(leer) && /Rosado/.test(leer) && /no se pierde/.test(leer) && /por su lugar \(B, C y D\)/.test(leer),
     'LEER: las dos solapas, los colores y que las columnas del equipo se pueden renombrar y no se pierden');
}

console.log('[8] el EN SECO (paso 64): la vista previa en el log, sin escribir nada');
{
  const E = entorno(BASE());
  E.ctx.__ab = abierta(E, SEMANA.concat([{ figura: 'Jorge Macri', fecha: [10, 10], hora: '11:00', evento: 'Primera Persona', lugar: 'Teatro', estado: 'desaparecida' }]));
  const antes = nombres(E.agenda).join('|');
  E.run('logVistasAgenda_(__ab, {})');
  const L = E.log();
  ok(/AgendaCall/.test(L) && /Agenda \(mail\)/.test(L) && /AMARILLO/.test(L) && /ROSADO/.test(L) && /«17:00h»/.test(L) && /~~/.test(L),
     'el log: las dos solapas, los colores, lo naranja «…» y lo tachado ~~…~~');
  ok(nombres(E.agenda).join('|') === antes && !E.agenda.getSheetByName('AgendaCall'), 'no crea ni toca ninguna solapa');
  if (process.env.VER) console.log(L);
}

console.log('\n' + chequeos + ' chequeos.');
console.log(fallas ? fallas + ' FALLA(S)' : 'Todo en verde.');
process.exit(fallas ? 1 : 0);
