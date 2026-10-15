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
    // como Google: con índice (base 0), en ese lugar; sin índice, al final (15/10: el sistema inserta siempre al final)
    insertSheet: function (n, i) { const h = hoja(n); if (i == null || i >= hojas.length) hojas.push(h); else hojas.splice(i, 0, h); return h; },
    getSheets: function () { return hojas.slice(); },
    movidas: 0,
    setActiveSheet: function (h) { ss.activa = h; return h; },
    moveActiveSheet: function (pos) { const i = hojas.indexOf(ss.activa); hojas.splice(i, 1); hojas.splice(pos - 1, 0, ss.activa); },
    getName: function () { return 'Agenda'; }
  };
  const hoja = function (nombre) {
    const h = { nombre: nombre, v: [], rich: {}, bg: {}, color: {}, bold: {}, val: {}, checks: {}, ocultas: [], reglas: [], prot: null, anchos: {},
               merges: [], oculta: false, maxCols: 26, bordes: {} };
    const asegurar = function (r, c) { while (h.v.length < r) h.v.push([]); h.v.forEach(function (f) { while (f.length < c) f.push(''); }); };
    const rango = function (r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      const cada = function (fn) { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) fn(r + i, c + j, i, j); };
      const o = {
        getValues: function () { const out = []; for (let i = 0; i < nr; i++) { const f = []; for (let j = 0; j < nc; j++) { const x = h.v[r - 1 + i]; f.push(x && x[c - 1 + j] !== undefined ? x[c - 1 + j] : ''); } out.push(f); } return out; },
        // lo que se ve: una fecha, como "martes 13/10" (el formato que le pone Sheets a "martes 13/10" si lo convierte en fecha)
        getDisplayValues: function () { return o.getValues().map(function (f) { return f.map(function (x) {
          if (x instanceof Date) return ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][x.getDay()] + ' ' + ('0' + x.getDate()).slice(-2) + '/' + ('0' + (x.getMonth() + 1)).slice(-2);
          return typeof x === 'boolean' ? (x ? 'TRUE' : 'FALSE') : String(x == null ? '' : x); }); }); },
        setValues: function (m) { asegurar(r + nr - 1, c + nc - 1); cada(function (fi, co, i, j) { h.v[fi - 1][co - 1] = m[i][j]; }); return o; },
        setValue: function (x) { asegurar(r, c); h.v[r - 1][c - 1] = x; return o; },
        setRichTextValues: function (m) { asegurar(r + nr - 1, c + nc - 1); cada(function (fi, co, i, j) { h.v[fi - 1][co - 1] = m[i][j].text; h.rich[fi + ':' + co] = m[i][j]; }); return o; },
        setRichTextValue: function (x) { asegurar(r, c); h.v[r - 1][c - 1] = x.text; h.rich[r + ':' + c] = x; return o; },
        setBackground: function (b) { cada(function (fi, co) { h.bg[fi + ':' + co] = b; }); return o; },
        setFontColor: function (b) { cada(function (fi, co) { h.color[fi + ':' + co] = b; }); return o; },
        setFontWeight: function (w) { cada(function (fi, co) { h.bold[fi + ':' + co] = w; }); return o; },
        setNumberFormat: function () { return o; }, setWrap: function () { return o; }, setVerticalAlignment: function () { return o; },
        // con valores propios ("Sí" / "No"), la casilla los recuerda
        insertCheckboxes: function (si, no) { cada(function (fi, co) { h.checks[fi + ':' + co] = si === undefined ? true : { si: si, no: no }; asegurar(fi, 1); }); return o; },
        clearDataValidations: function () { cada(function (fi, co) { delete h.val[fi + ':' + co]; delete h.checks[fi + ':' + co]; }); return o; },
        setDataValidation: function (dv) { cada(function (fi, co) { h.val[fi + ':' + co] = dv; }); return o; },
        // 15/10: combinaciones, bordes, alineación, "pegar formato" y las validaciones (para el formato de "Agenda Directa")
        getDataValidations: function () {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const f = [];
            for (let j = 0; j < nc; j++) { const k = (r + i) + ':' + (c + j); const ck = h.checks[k];
              f.push(h.val[k] || (ck ? { getCriteriaType: function () { return 'CHECKBOX'; }, getCriteriaValues: function () { return typeof ck === 'object' ? [ck.si, ck.no] : []; } } : null)); }
            out.push(f);
          }
          return out;
        },
        getMergedRanges: function () {
          return h.merges.filter(function (m) { return m[0] <= r + nr - 1 && m[0] + m[2] - 1 >= r && m[1] <= c + nc - 1 && m[1] + m[3] - 1 >= c; })
            .map(function (m) { return { getRow: function () { return m[0]; }, getColumn: function () { return m[1]; }, getNumRows: function () { return m[2]; }, getNumColumns: function () { return m[3]; } }; });
        },
        merge: function () { if (!h.merges.some(function (m) { return m.join() === [r, c, nr, nc].join(); })) h.merges.push([r, c, nr, nc]); return o; },
        breakApart: function () { h.merges = h.merges.filter(function (m) { return !(m[0] <= r + nr - 1 && m[0] + m[2] - 1 >= r && m[1] <= c + nc - 1 && m[1] + m[3] - 1 >= c); }); return o; },
        setBorder: function () { cada(function (fi, co) { h.bordes[fi + ':' + co] = true; }); return o; },
        setHorizontalAlignment: function () { return o; },
        copyTo: function (dest, tipo) {   // "pegar formato": fondos, letra, negrita, bordes y combinaciones
          const d = dest._h, dr = dest._a[0], dc = dest._a[1];
          cada(function (fi, co, i, j) {
            const k = fi + ':' + co, kd = (dr + i) + ':' + (dc + j);
            ['bg', 'color', 'bold', 'bordes'].forEach(function (p) { if (h[p][k] !== undefined) d[p][kd] = h[p][k]; });
          });
          o.getMergedRanges().forEach(function (m) { d.merges.push([m.getRow() - r + dr, m.getColumn() - c + dc, m.getNumRows(), m.getNumColumns()]); });
          d.pegados = (d.pegados || []).concat([tipo]);
          return o;
        },
        _h: h, _a: [r, c, nr, nc]
      };
      return o;
    };
    Object.assign(h, {
      getName: function () { return h.nombre; },
      setName: function (n) { h.nombre = n; return h; },
      copyTo: function (dest) { const c = dest.insertSheet('Copia de ' + h.nombre); c.v = JSON.parse(JSON.stringify(h.v)); return c; },
      getIndex: function () { return ssRef.hojas.indexOf(h) + 1; },
      getRange: rango,
      getRangeList: function (l) {
        const rs = l.map(function (a1) { const p = a1.split(':'); const x = a1c(p[0]), y = a1c(p[1] || p[0]); return rango(x[0], x[1], y[0] - x[0] + 1, y[1] - x[1] + 1); });
        const rl = {};
        ['setBackground', 'setFontColor', 'setFontWeight', 'insertCheckboxes', 'setNumberFormat'].forEach(function (m) {
          rl[m] = function () { const a = arguments; rs.forEach(function (q) { q[m].apply(q, a); }); return rl; };
        });
        return rl;
      },
      getColumnWidth: function (c) { return h.anchos[c] || 100; },
      isColumnHiddenByUser: function (c) { return h.ocultas.indexOf(c) >= 0; },
      showColumns: function (c, n) { h.ocultas = h.ocultas.filter(function (x) { return x < c || x > c + (n || 1) - 1; }); },
      insertColumnsAfter: function (c, n) { h.maxCols += n; }, getMaxColumns: function () { return h.maxCols; },
      getConditionalFormatRules: function () { return h.reglas.slice(); },
      hideSheet: function () { h.oculta = true; return h; }, isSheetHidden: function () { return h.oculta; },
      getLastRow: function () { for (let i = h.v.length; i >= 1; i--) if (h.v[i - 1].some(function (x) { return x !== '' && x !== null && x !== undefined; })) return i; return 0; },
      getLastColumn: function () { let m = 0; h.v.forEach(function (f) { for (let j = f.length; j >= 1; j--) if (f[j - 1] !== '' && f[j - 1] != null) { m = Math.max(m, j); break; } }); return m; },
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

function entorno(baseFilas, opciones) {
  const HDR = hdrBase();
  const o = opciones || {};
  // 15/10: `o.directa` prende AGENDA_MAIL_FORMATO_DIRECTA; `o.solapas`: las solapas del archivo "Agenda" (y su orden)
  const E = crearEntornoIds({ bloqueBase: [HDR].concat(baseFilas || []), maxColsBase: HDR.length,
    extra: ['40_Agenda.js', '47_AgendaVistas.js', '47_AgendaDirecta.js'],
    reemplazos: o.directa ? { '00_Config.js': [['const AGENDA_MAIL_FORMATO_DIRECTA = false;', 'const AGENDA_MAIL_FORMATO_DIRECTA = true;']] } : {} });
  const ss = archivoAgenda(o.solapas || ['Agenda cerrada', 'LEER', 'Agenda']);          // en otro orden: el sistema las ordena
  E.archivos[E.cfg('AGENDA_COPIA_SS')] = { ss: ss, hojas: {} };
  const SA = E.ctx.SpreadsheetApp;
  SA.ProtectionType = { SHEET: 'SHEET', RANGE: 'RANGE' };
  SA.CopyPasteType = { PASTE_FORMAT: 'PASTE_FORMAT' };
  SA.DataValidationCriteria = { CHECKBOX: 'CHECKBOX', VALUE_IN_LIST: 'VALUE_IN_LIST', VALUE_IN_RANGE: 'VALUE_IN_RANGE' };
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
  // el archivo RDV: la base y la solapa "Agenda" que armaba el legado (sin la protección del sistema)
  const rdv = archivoAgenda(['RVD JM-CM - ES', 'Agenda']);
  rdv.getSheetByName('Agenda').v = [['Figura', 'Barrio', 'FECHA'], ['(lo que armaba el legado)', 'Palermo', '01/10/2026']];
  // encima del archivo RDV del mock (la base sigue ahí: la leen las vistas para el agenda_uid); las solapas de agenda, en `rdv`
  const orig = E.archivos[E.cfg('RDV_SS_DESTINO')].ss;
  const capa = Object.create(orig);
  capa.getSheetByName = function (n) { return /^(Agenda|Agenda \(legado\)|Copia de .*)$/.test(n) ? rdv.getSheetByName(n) : orig.getSheetByName(n); };
  capa.insertSheet = function (n) { return rdv.insertSheet(n); };
  rdv.getSheetByName('RVD JM-CM - ES').v = [['(la base del mock vive en el archivo original)']];
  E.archivos[E.cfg('RDV_SS_DESTINO')].ss = capa;
  E.rdv = rdv;
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
console.log('[1] prendido (13/10), y el gancho');
{
  const E = entorno(BASE());
  ok(E.cfg('AGENDA_VISTAS_NUEVAS') === true, 'AGENDA_VISTAS_NUEVAS = true (prendido el 13/10)');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', '40_Agenda.js'), 'utf8');
  ok(/_escribirSolapaCopiaAgenda_\(ss, AGENDA_COPIA_SOLAPA_CERRADA, pz\.cerrada\);[\s\S]{0,700}?if \(AGENDA_VISTAS_NUEVAS\) escribirVistasAgenda_\(ss, pz\.abierta, P\);/.test(src),
     'las vistas se escriben DESPUÉS de "Agenda" y "Agenda cerrada", y sólo con AGENDA_VISTAS_NUEVAS');
  ok(/_escribirSolapaCopiaAgenda_\(ss, AGENDA_COPIA_SOLAPA_CERRADA, pz\.cerrada\);[\s\S]{0,400}?if \(typeof _diferirVistasAgenda_ !== 'undefined' && _diferirVistasAgenda_\) \{\s*_vistasAgendaPendientes_ = \{ abierta: pz\.abierta, P: P \};\s*return;/.test(src),
     '15/10: en la corrida de la hora, las vistas y la copia del archivo RDV quedan para el final (prioridad 5)');
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

console.log('[9] de punta a punta: la copia de siempre (escribirCopiaAgenda_) escribe también las dos vistas, con el interruptor');
{
  const E = entorno(BASE());
  E.ctx.__m = abierta(E, SEMANA);
  E.run('escribirCopiaAgenda_(__m, {})');
  const L = E.log();
  ok(!/NO se escribi|is not defined|TypeError/.test(L), 'sin errores en el log' + (/NO se escribi|is not defined|TypeError/.test(L) ? ': ' + L.split('\n').filter(function (x) { return /NO se escribi|is not defined|TypeError/.test(x); }).join(' | ') : ''));
  igual(nombres(E.agenda), ['LEER', 'Agenda', 'AgendaCall', 'Agenda (mail)', 'Agenda cerrada'], 'las cinco solapas, en su orden');
  ok(E.agenda.getSheetByName('AgendaCall').v.length >= 2 && !!enVista(E, 'c-2'), 'AgendaCall y "Agenda (mail)" escritas desde la misma corrida');
}

console.log('[10] la "Agenda" también en el archivo RDV (13/10): la misma matriz; lo del legado, guardado una vez; la base, intacta');
{
  const E = entorno(BASE());
  ok(E.cfg('AGENDA_COPIA_EN_RDV') === true, 'AGENDA_COPIA_EN_RDV = true');
  const baseAntes = JSON.stringify(E.rdv.getSheetByName('RVD JM-CM - ES').v);
  E.ctx.__m = abierta(E, SEMANA);
  E.run('escribirCopiaAgenda_(__m, {})');
  const r = E.rdv.getSheetByName('Agenda'), a = E.agenda.getSheetByName('Agenda');
  ok(JSON.stringify(r.v) === JSON.stringify(a.v) && r.v.length === 5, 'la solapa "Agenda" del archivo RDV = la "Agenda" del archivo "Agenda" (4 reuniones)');
  ok(r.prot && r.prot.adv && r.prot.desc === E.cfg('DESC_PROTECCION_COPIA_AGENDA'), 'protegida con advertencia, como la otra');
  const leg = E.rdv.getSheetByName('Agenda (legado)');
  ok(!!leg && leg.v[1][0] === '(lo que armaba el legado)', 'lo que había (lo armaba el legado) quedó en "Agenda (legado)"');
  ok(JSON.stringify(E.rdv.getSheetByName('RVD JM-CM - ES').v) === baseAntes, '"RVD JM-CM - ES" no se toca');
  // otra corrida: no hay un segundo respaldo y "Agenda (legado)" no cambia
  E.ctx.__m = abierta(E, SEMANA.slice(1));
  E.run('escribirCopiaAgenda_(__m, {})');
  ok(E.rdv.hojas.filter(function (h) { return /legado|Copia de/.test(h.nombre); }).length === 1 && E.rdv.getSheetByName('Agenda (legado)').v[1][0] === '(lo que armaba el legado)'
     && E.rdv.getSheetByName('Agenda').v.length === 4, 'la segunda corrida: reescribe "Agenda" (3 reuniones) y no vuelve a respaldar');
  const leg2 = require('fs').readFileSync(require('path').join(__dirname, '..', 'Solapa agenda base final.js'), 'utf8');
  ok(/function syncAgendaSheetInBaseFromAgenda_2\(\) \{\s*\/\/[^\n]*\n[^\n]*\n\s*if \(typeof AGENDA_COPIA_EN_RDV !== 'undefined' && AGENDA_COPIA_EN_RDV\) \{[^}]*return;/.test(leg2),
     'el espejo del legado (syncAgendaSheetInBaseFromAgenda_2) no escribe nada con AGENDA_COPIA_EN_RDV');
}

// =========================== 15/10: "Agenda Directa" (del equipo) y "Agenda (mail)" con su formato ===========================

/**
 * "Agenda Directa", la solapa del equipo, simulada (inventada). Los grupos en OTRO orden que el respaldo (POST antes que
 * CONFIRMACIÓN) y "Ok Sol." / "Ok sol" escritos distinto: el sistema tiene que reconocerlas por el texto. Un día como texto, otro
 * que Sheets convirtió en fecha. Desplegable en Implementador, casillas, una regla de color y una protección del equipo.
 */
function ponerDirecta(E) {
  const F = E.ctx.Date;
  const h = E.agenda.getSheetByName('Agenda Directa') || E.agenda.insertSheet('Agenda Directa');
  const no = function () { return [false, false, false, false, false, false, false, false, false, false]; };
  const dia = function (x) { return [x, '', '', '', '', '', '', '', '', '', '', '']; };
  h.v = [
    ['Info', 'Implementador', 'CONVOCATORIA', '', '', '', 'POST', '', 'CONFIRMACIÓN', '', 'CANCELACIÓN', ''],
    ['', '', 'Hecho', 'Ok Sol.', 'Programado', 'IVR', 'Ok Sol', 'Programado', 'Ok Sol', 'Programado', 'Ok sol', 'Programado'],
    dia('martes 06/10'),
    ['Evento: Encuentro con Vecinos Jorge Macri, Belgrano\nHora: 18:00h\nLugar: Club Belgrano, Av. Cabildo 100', 'Lu'].concat([true]).concat(no().slice(1)),
    dia(new F(2026, 9, 8, 0, 0, 0)),                                                     // el día, que Sheets hizo fecha
    ['*Encuentro con Vecinos Gabino Tapia, Retiro*', 'Cris', false, false, false, false, true, false, false, false, false, false],
    dia('viernes 09/10'),
    ['Evento: Café con Ana Pereyra, Palermo', ''].concat(no()),                         // nada cargado
    ['Evento: Una reunión que el mail no tiene', 'Mel', true, false, false, false, false, false, false, false, false, false]
  ];
  h.merges = [[1, 1, 2, 1], [1, 2, 2, 1], [1, 3, 1, 4], [1, 7, 1, 2], [1, 9, 1, 2], [1, 11, 1, 2], [3, 1, 1, 12], [5, 1, 1, 12], [7, 1, 1, 12]];
  for (let c = 1; c <= 12; c++) { h.bg['1:' + c] = '#1C4587'; h.color['1:' + c] = '#FFFFFF'; h.bg['2:' + c] = '#C9DAF8'; }
  [3, 5, 7].forEach(function (r) { for (let c = 1; c <= 12; c++) { h.bg[r + ':' + c] = '#38761D'; h.color[r + ':' + c] = '#FFFFFF'; h.bold[r + ':' + c] = 'bold'; } });
  h.anchos = { 1: 380, 2: 140 };
  for (let c = 3; c <= 12; c++) h.anchos[c] = 64;
  const lista = { getCriteriaType: function () { return 'VALUE_IN_LIST'; }, getCriteriaValues: function () { return [['Lu', 'Cris', 'Mel', 'Yami', 'Sofi'], true]; },
                  copy: function () { return { build: function () { return { copiaDe: lista }; } }; } };
  const regla = { getRanges: function () { return [{ getColumn: function () { return 2; }, getNumColumns: function () { return 1; } }]; },
                  copy: function () { const b = { setRanges: function (x) { b.rangos = x; return b; }, build: function () { return { copiaDe: regla, rangos: b.rangos }; } }; return b; } };
  [4, 6, 8, 9].forEach(function (r) { h.val[r + ':2'] = lista; for (let c = 3; c <= 12; c++) h.checks[r + ':' + c] = true; });
  h.reglas = [regla];
  h.protect().setDescription('del equipo');
  return { hoja: h, lista: lista, regla: regla };
}
/** Todo lo que se puede ver de una solapa (para comprobar que el sistema NO la tocó). */
const foto = function (h) {
  return JSON.stringify([h.v, h.bg, h.color, h.bold, Object.keys(h.val).sort(), h.checks, h.merges, h.oculta, h.prot && h.prot.desc,
                         h.anchos, h.reglas.length, h.ocultas, h.getIndex()]);
};
const fila13 = function (E, k) { const h = vista(E); for (let i = 2; i < h.v.length; i++) if (h.v[i][12] === k) return i + 1; return 0; };
const equipoGuardado = function (E) {
  const h = E.intermedia('AGENDA_EQUIPO');
  if (!h) return {};
  const hdr = h.valores[0], out = {};
  h.valores.slice(1).forEach(function (r) { const o = {}; hdr.forEach(function (n, j) { o[n] = r[j]; }); out[r[0]] = o; });
  return out;
};

console.log('[11] D1: las solapas del equipo no se mueven ni se tocan (el sistema ordena las suyas entre los lugares que ya ocupan)');
{
  const E = entorno(BASE(), { solapas: ['Agenda cerrada', 'Agenda Directa', 'LEER', 'Agenda', 'Sugerencia - Equipo Directa'] });
  const d = ponerDirecta(E).hoja, sug = E.agenda.getSheetByName('Sugerencia - Equipo Directa');
  const antesD = foto(d), antesS = foto(sug);
  E.ctx.__ab = abierta(E, SEMANA);
  E.run('escribirVistasAgenda_(SpreadsheetApp.openById(AGENDA_COPIA_SS), __ab, {})');
  igual(nombres(E.agenda), ['LEER', 'Agenda Directa', 'Agenda', 'AgendaCall', 'Sugerencia - Equipo Directa', 'Agenda (mail)', 'Agenda cerrada'],
        'las del sistema, en su orden, en los lugares que ya ocupaban; "Agenda Directa" sigue 2ª y "Sugerencia…" 5ª');
  ok(foto(d) === antesD && foto(sug) === antesS, '"Agenda Directa" y "Sugerencia - Equipo Directa": exactamente como estaban (valores, formato, protección, lugar)');
  E.run('escribirVistasAgenda_(SpreadsheetApp.openById(AGENDA_COPIA_SS), __ab, {})');
  ok(!/intercambios entre solapas/.test(E.log().split('"Agenda (mail)": ').pop()) && foto(d) === antesD, 'la segunda vez ya están en orden: no se mueve nada');
  let tiro = '';
  try { E.run('insertarSolapaAgendaAlFinal_(SpreadsheetApp.openById(AGENDA_COPIA_SS), AGENDA_SOLAPA_DIRECTA)'); } catch (e) { tiro = String(e); }
  ok(/es una solapa del equipo/.test(tiro), 'el sistema se niega a crear o escribir una solapa del equipo');
}

console.log('[12] D2: "Agenda (mail)" copia el formato de "Agenda Directa" (desde el formato de siempre, con Responsable cargado)');
let E12 = null;
{
  const E = entorno(BASE(), { directa: true, solapas: ['LEER', 'Agenda', 'AgendaCall', 'Agenda (mail)', 'Agenda cerrada', 'Agenda Directa', 'Sugerencia - Equipo Directa'] });
  E12 = E;
  ok(E.cfg('AGENDA_MAIL_FORMATO_DIRECTA') === true, '(el interruptor, prendido en este entorno)');
  const P = ponerDirecta(E), d = P.hoja, sug = E.agenda.getSheetByName('Sugerencia - Equipo Directa');
  const antesD = foto(d), antesS = foto(sug);
  // "Agenda (mail)" con el formato de siempre, con Responsable / Check 1 en la de Tapia
  vista(E).v = [['Reunión (como el mail)', 'Responsable', 'Check 1', 'Check 2', 'clave', '', 'Responsables (opciones)'],
                ['jueves 08/10', '', '', '', '', '', 'Lu'], ['Evento: Encuentro con Vecinos Gabino Tapia, Retiro', 'Cris', true, false, 'c-2', '', 'Cris']];
  vista(E).ocultas = [5];
  E.ctx.__ab = abierta(E, SEMANA);
  E.run('escribirVistasAgenda_(SpreadsheetApp.openById(AGENDA_COPIA_SS), __ab, {})');
  const h = vista(E), g = equipoGuardado(E);
  if (process.env.VER) console.log(E.log());
  ok(g['c-2'] && g['c-2'].Responsable === 'Cris' && g['c-2']['Check 1'] === true, 'lo de siempre (Responsable / Check 1) quedó guardado en AGENDA_EQUIPO');
  igual(E.intermedia('AGENDA_EQUIPO').valores[0].slice(7), E.run('idsDirecta_()'), 'AGENDA_EQUIPO suma, a la derecha, las 11 columnas nuevas');
  igual([h.v[0].slice(0, 13), h.v[1].slice(0, 12)], [d.v[0].concat(['clave']), d.v[1]], 'el encabezado: los dos renglones de "Agenda Directa", tal cual, y "clave"');
  igual(h.merges.filter(function (m) { return m[0] <= 2; }).map(String).sort(), d.merges.filter(function (m) { return m[0] <= 2; }).map(String).sort(),
        'las combinaciones del encabezado, las mismas');
  ok(h.bg['1:3'] === '#1C4587' && h.color['1:3'] === '#FFFFFF' && h.bg['2:5'] === '#C9DAF8' && (h.pegados || []).indexOf('PASTE_FORMAT') >= 0,
     'los colores del encabezado, copiados ("pegar formato")');
  ok(h.anchos[1] === 380 && h.anchos[2] === 140 && h.anchos[7] === 64, 'los anchos de "Agenda Directa"');
  ok(h.ocultas.join() === '13' && h.v[0][12] === 'clave', 'la clave en la 13, oculta (la E de antes ya no está oculta)');
  const r1 = fila13(E, 'c-1'), r2 = fila13(E, 'c-2');
  ok(r1 > 2 && /^Evento: Encuentro con Vecinos Jorge Macri/.test(h.v[r1 - 1][0]) && h.bg[r1 + ':1'] === '#D9EAD3', 'Info: la celda de la reunión, con el color de su semana');
  ok(h.val[r1 + ':2'] && h.val[r1 + ':2'].copiaDe === P.lista && h.checks[r1 + ':3'] && h.checks[r1 + ':12'] && !h.val[r1 + ':3'],
     'Implementador: el desplegable de "Agenda Directa"; casillas en los grupos');
  const lunes = h.v.findIndex(function (r) { return r[0] === 'lunes 05/10'; }) + 1;
  ok(lunes > 2 && h.merges.some(function (m) { return m.join() === [lunes, 1, 1, 12].join(); }) && h.bg[lunes + ':1'] === '#38761D' &&
     !h.checks[lunes + ':3'] && !h.val[lunes + ':2'], 'los días: combinados a lo ancho, con el formato del día de "Agenda Directa"; sin casillas ni desplegable');
  ok(h.reglas.length === 1 && h.reglas[0].copiaDe === P.regla, 'la regla de color de Implementador, copiada');
  ok(h.prot && h.prot.adv && h.prot.desc === E.cfg('DESC_PROTECCION_VISTA_MAIL_DIRECTA') && h.prot.libres.length === 11, 'protegida con advertencia; libres, las 11 columnas del equipo');
  ok(foto(d) === antesD && foto(sug) === antesS, '"Agenda Directa" y "Sugerencia…": intactas');
  // el equipo carga en el formato nuevo; Tapia se mueve al viernes: lo suyo la sigue (y Responsable sigue guardado aparte)
  h.v[r2 - 1][1] = 'Yami'; h.v[r2 - 1][6] = true;                                   // Implementador y POST · Ok Sol (columna G)
  const sem2 = SEMANA.map(function (x) { return Object.assign({}, x); });
  sem2[1].fecha = [9, 10]; sem2[1].hora = '20:00';
  E.ctx.__ab = abierta(E, sem2);
  E.run('escribirVistasAgenda_(SpreadsheetApp.openById(AGENDA_COPIA_SS), __ab, {})');
  const r2b = fila13(E, 'c-2'), g2 = equipoGuardado(E);
  ok(r2b > 0 && vista(E).v[r2b - 1][1] === 'Yami' && vista(E).v[r2b - 1][6] === true && /Hora: 20:00h/.test(vista(E).v[r2b - 1][0]),
     'Tapia cambió de día: su Implementador y su "POST · Ok Sol" la siguen');
  ok(g2['c-2'].Responsable === 'Cris' && g2['c-2'].Implementador === 'Yami' && g2['c-2']['POST · Ok Sol'] === true,
     'AGENDA_EQUIPO: lo viejo (Responsable) y lo nuevo (Implementador, POST · Ok Sol), juntos');
}

console.log('[13] volver atrás (interruptor apagado): "Agenda (mail)" vuelve al formato de siempre y no se pierde nada');
{
  const E = entorno(BASE(), { solapas: ['LEER', 'Agenda', 'AgendaCall', 'Agenda (mail)', 'Agenda cerrada'] });
  const src = vista(E12), h = vista(E);
  ['v', 'merges', 'ocultas', 'val', 'checks', 'bg'].forEach(function (p) { h[p] = JSON.parse(JSON.stringify(src[p])); });
  h.prot = src.prot;
  E.archivos[E.cfg('RDV_SS_INTERMEDIA')].hojas['AGENDA_EQUIPO'] = E12.archivos[E12.cfg('RDV_SS_INTERMEDIA')].hojas['AGENDA_EQUIPO'];
  const sem2 = SEMANA.map(function (x) { return Object.assign({}, x); });
  sem2[1].fecha = [9, 10]; sem2[1].hora = '20:00';
  E.ctx.__ab = abierta(E, sem2);
  E.run('escribirVistasAgenda_(SpreadsheetApp.openById(AGENDA_COPIA_SS), __ab, {})');
  const t = enVista(E, 'c-2'), g = equipoGuardado(E);
  ok(h.v[0].slice(0, 5).join('|') === 'Reunión (como el mail)|Responsable|Check 1|Check 2|clave' && h.merges.length === 0 && h.ocultas.join() === '5',
     'el formato de siempre: sin combinaciones, la clave en la E (y sólo ésa oculta)');
  ok(t && t.resp === 'Cris' && t.c1 === true, 'Tapia vuelve a mostrar su Responsable y su Check 1');
  ok(g['c-2'].Implementador === 'Yami' && g['c-2']['POST · Ok Sol'] === true, 'y lo del formato nuevo sigue guardado en AGENDA_EQUIPO');
  ok(!(h.prot && h.prot.desc === E.cfg('DESC_PROTECCION_VISTA_MAIL_DIRECTA')) && h.prot.desc === E.cfg('DESC_PROTECCION_VISTA_MAIL'), 'la protección de siempre (no quedan dos)');
}

console.log('[14] sin "Agenda Directa": el diseño de respaldo');
{
  const E = entorno(BASE(), { directa: true });
  E.ctx.__ab = abierta(E, SEMANA);
  E.run('escribirVistasAgenda_(SpreadsheetApp.openById(AGENDA_COPIA_SS), __ab, {})');
  const h = vista(E);
  igual(h.v[0].slice(0, 13), ['Info', 'Implementador', 'CONVOCATORIA', '', '', '', 'CONFIRMACIÓN', '', 'POST', '', 'CANCELACIÓN', '', 'clave'], 'renglón 1: los grupos');
  igual(h.v[1].slice(0, 12), ['', '', 'Hecho', 'Ok Sol', 'Programado', 'IVR', 'Ok Sol', 'Programado', 'Ok Sol', 'Programado', 'Ok Sol', 'Programado'], 'renglón 2: las subcolumnas');
  igual(h.merges.filter(function (m) { return m[0] <= 2; }).map(String).sort(), ['1,1,2,1', '1,11,1,2', '1,2,2,1', '1,3,1,4', '1,7,1,2', '1,9,1,2'], 'las combinaciones');
  const r1 = fila13(E, 'c-1');
  ok(h.v[0][14] === 'Implementadores (opciones)' && h.v[2][14] === 'Lu' && h.val[r1 + ':2'].rango.join() === '3,15,20,1' && h.reglas.length === 4,
     'Implementador: desplegable desde las opciones (columna O), un color por opción');
  ok(h.bordes['1:1'] && h.bg['1:3'] === '#C9DAF8' && h.checks[r1 + ':3'], 'encabezado con bordes y colores por grupo; casillas');
  ok(/diseño de respaldo — no existe la solapa "Agenda Directa"/.test(E.log()), 'el log dice por qué va el respaldo');
}

console.log('[15] D3 y D4: copiar lo que el equipo cargó en "Agenda Directa" (en seco y de verdad) y ocultar la sugerencia');
{
  const E = entorno(BASE(), { directa: true, solapas: ['LEER', 'Agenda', 'AgendaCall', 'Agenda (mail)', 'Agenda cerrada', 'Agenda Directa', 'Sugerencia - Equipo Directa'] });
  const d = ponerDirecta(E).hoja, sug = E.agenda.getSheetByName('Sugerencia - Equipo Directa');
  E.ctx.__ab = abierta(E, SEMANA);
  E.run('escribirVistasAgenda_(SpreadsheetApp.openById(AGENDA_COPIA_SS), __ab, {})');
  vista(E).v[fila13(E, 'c-2') - 1][1] = 'Yami';                              // en "Agenda (mail)", Tapia ya tiene otro Implementador
  const antesD = foto(d), antesEq = JSON.stringify((E.intermedia('AGENDA_EQUIPO') || { valores: [] }).valores), antesV = JSON.stringify(vista(E).v);
  E.logs.length = 0;
  let r = E.run('copiarAgendaDirectaEnSeco()');
  let L = E.log();
  ok(/COPIARÍA renglón 4 \(06\/10\/2026 \| Evento: Encuentro con Vecinos Jorge Macri, Belgrano\) → c-1 .*mismo evento.*Implementador = Lu; CONVOCATORIA · Hecho = ☑/.test(L),
     'Macri 06/10: copiaría Implementador y CONVOCATORIA · Hecho');
  ok(/COPIARÍA renglón 6 \(08\/10\/2026 .*→ c-2 .*POST · Ok Sol = ☑.*NO SE PISA: Implementador \(en "Agenda \(mail\)": Yami; en "Agenda Directa": Cris\)/.test(L),
     'Tapia 08/10 (el día era una fecha; el evento sin "Evento:"): copiaría POST · Ok Sol y NO pisa el Implementador que ya tiene');
  ok(/SIN CRUCE renglón 9 \(09\/10\/2026 \| Evento: Una reunión que el mail no tiene\): ninguna reunión del sistema con ese evento ese día \(ese día: "Evento: Café con Ana Pereyra, Palermo" 19:00\)/.test(L),
     'la que no cruza, con el motivo y las reuniones de ese día');
  ok(/con algo cargado: 3 \(sin nada: 1\)/.test(L) && /"Sugerencia - Equipo Directa": la OCULTARÍA/.test(L), 'cuenta las vacías; diría que oculta la sugerencia');
  ok(r.copiadas === 2 && r.campos === 3 && r.sinCruce === 1 && r.conflictos === 1, 'el resumen: 2 reuniones, 3 valores, 1 sin cruce, 1 conflicto');
  ok(JSON.stringify((E.intermedia('AGENDA_EQUIPO') || { valores: [] }).valores) === antesEq && JSON.stringify(vista(E).v) === antesV && !sug.oculta && foto(d) === antesD,
     'EN SECO: no escribió nada (ni AGENDA_EQUIPO, ni las solapas)');
  r = E.run('copiarAgendaDirecta()');
  const g = equipoGuardado(E);
  ok(g['c-1'].Implementador === 'Lu' && g['c-1']['CONVOCATORIA · Hecho'] === true && g['c-2'].Implementador === 'Yami' && g['c-2']['POST · Ok Sol'] === true,
     'AGENDA_EQUIPO: lo copiado, y lo que ya tenía "Agenda (mail)" sin pisar');
  ok(sug.oculta === true && E.agenda.getSheetByName('Sugerencia - Equipo Directa') === sug, '"Sugerencia - Equipo Directa": oculta, no borrada');
  ok(foto(d) === antesD, '"Agenda Directa": intacta (sólo se leyó)');
  E.run('escribirVistasAgenda_(SpreadsheetApp.openById(AGENDA_COPIA_SS), __ab, {})');
  const h = vista(E), r1 = fila13(E, 'c-1');
  ok(h.v[r1 - 1][1] === 'Lu' && h.v[r1 - 1][2] === true, 'la reescritura siguiente lo muestra en "Agenda (mail)"');
  E.logs.length = 0;
  r = E.run('copiarAgendaDirecta()');
  ok(r.campos === 0 && /ya estaba: Implementador, CONVOCATORIA · Hecho/.test(E.log()) && /ya está oculta/.test(E.log()), 'otra vez: nada nuevo ("ya estaba"; ya oculta)');
}

console.log('[16] D2 en seco: el diseño que saldría, sin escribir nada');
{
  const E = entorno(BASE(), { solapas: ['LEER', 'Agenda', 'Agenda (mail)', 'Agenda Directa'] });
  ponerDirecta(E);
  E.ctx.__ab = abierta(E, SEMANA);
  E.run('escribirVistasAgenda_(SpreadsheetApp.openById(AGENDA_COPIA_SS), __ab, {})');          // la vista de siempre
  const antes = E.agenda.hojas.map(foto).join('|'), antesEq = JSON.stringify((E.intermedia('AGENDA_EQUIPO') || { valores: [] }).valores);
  E.logs.length = 0;
  const r = E.run('vistaMailDirectaEnSeco()');
  const L = E.log();
  ok(r.fuente === 'directa' && /ENCONTRADA y coincide/.test(L) && /POST · Ok Sol → columna G \| casilla \| ancho 64/.test(L) &&
     /Implementador → columna B \| desplegable: Lu, Cris, Mel, Yami, Sofi/.test(L), 'qué columna encontró y dónde, el desplegable, los anchos');
  ok(/renglón 1: Info \| Implementador \| CONVOCATORIA \| · \| · \| · \| POST/.test(L) && /la clave: columna M \(oculta\)/.test(L) && /■■■ LUNES 05\/10 ■■■/.test(L) &&
     /Encuentro con Vecinos Gabino Tapia, Retiro .*‖ Implementador: — \| CONVOCATORIA ☐Hecho/.test(L), 'el encabezado que saldría y las reuniones de hoy en ese formato');
  ok(E.agenda.hojas.map(foto).join('|') === antes && JSON.stringify((E.intermedia('AGENDA_EQUIPO') || { valores: [] }).valores) === antesEq, 'no escribió nada');
  if (process.env.VER) console.log(L);
}

// =========================== 15/10, revisión: tipos reales, cruce más estricto, posiciones, "Info" que no es la A ===========================

console.log('[17] MEDIA 1: el tipo de cada columna sale de "Agenda Directa"; un texto o una fecha nunca se vuelven una casilla en false');
{
  const E = entorno(BASE(), { directa: true, solapas: ['LEER', 'Agenda', 'AgendaCall', 'Agenda (mail)', 'Agenda cerrada', 'Agenda Directa', 'Sugerencia - Equipo Directa'] });
  const d = ponerDirecta(E).hoja, F = E.ctx.Date;
  // "CONVOCATORIA · Programado" (E) sin validación: texto o fecha; "CONVOCATORIA · IVR" (F) casilla con valores propios "Sí" / "No"
  [4, 6, 8, 9].forEach(function (r) { delete d.checks[r + ':5']; d.checks[r + ':6'] = { si: 'Sí', no: 'No' }; d.v[r - 1][5] = 'No'; d.v[r - 1][4] = ''; });
  d.v[3][4] = '14/10 10hs'; d.v[3][5] = 'Sí';                    // Macri: un texto y la casilla marcada ("Sí")
  d.v[5][4] = new F(2026, 9, 7, 0, 0, 0);                         // Tapia: una fecha
  E.ctx.__ab = abierta(E, SEMANA);
  const ss = 'SpreadsheetApp.openById(AGENDA_COPIA_SS)';
  E.run('escribirVistasAgenda_(' + ss + ', __ab, {})');
  const h = vista(E);
  // el equipo escribió un texto en una casilla de la vista (la de Pereyra, "CONVOCATORIA · Hecho")
  h.v[fila13(E, 'c-3') - 1][2] = 'hecho a mano';
  E.run('copiarAgendaDirecta()');
  E.run('escribirVistasAgenda_(' + ss + ', __ab, {})');
  E.logs.length = 0;
  E.run('escribirVistasAgenda_(' + ss + ', __ab, {})');
  const r1 = fila13(E, 'c-1'), r2 = fila13(E, 'c-2'), r3 = fila13(E, 'c-3'), g = equipoGuardado(E);
  ok(h.v[r1 - 1][4] === '14/10 10hs' && !h.checks[r1 + ':5'], 'Macri: "CONVOCATORIA · Programado" = "14/10 10hs" (texto, sin casilla), después de dos reescrituras');
  ok(h.v[r2 - 1][4] instanceof Date && h.v[r2 - 1][4].getDate() === 7 && !h.checks[r2 + ':5'], 'Tapia: la fecha, tal cual');
  ok(h.v[r1 - 1][5] === 'Sí' && h.checks[r1 + ':6'] && h.checks[r1 + ':6'].si === 'Sí' && h.v[r2 - 1][5] === 'No',
     'IVR: casilla con los valores de "Agenda Directa" ("Sí" marcada en Macri, "No" en Tapia)');
  ok(h.v[r3 - 1][2] === 'hecho a mano' && !h.checks[r3 + ':3'] && /quedaron como TEXTO .*CONVOCATORIA · Hecho: "hecho a mano"/.test(E.log()),
     'Pereyra: un texto en una columna de casilla queda como TEXTO (sin casilla) y el log lo avisa');
  ok(g['c-1']['CONVOCATORIA · Programado'] === '14/10 10hs' && g['c-1']['CONVOCATORIA · IVR'] === 'Sí' &&
     g['c-2']['CONVOCATORIA · Programado'] instanceof Date && g['c-3']['CONVOCATORIA · Hecho'] === 'hecho a mano',
     'AGENDA_EQUIPO: ninguno se volvió false');
}

/** Una "Agenda Directa" chica, con `renglones` (cada uno: [Info, Implementador]; un día es un texto o una fecha). */
function ponerDirectaChica(E, renglones, infoEnB) {
  const h = E.agenda.getSheetByName('Agenda Directa') || E.agenda.insertSheet('Agenda Directa');
  const g1 = ['CONVOCATORIA', '', '', '', 'POST', '', 'CONFIRMACIÓN', '', 'CANCELACIÓN', ''];
  const g2 = ['Hecho', 'Ok Sol', 'Programado', 'IVR', 'Ok Sol', 'Programado', 'Ok Sol', 'Programado', 'Ok Sol', 'Programado'];
  const vacias = function () { return ['', '', '', '', '', '', '', '', '', '']; };
  h.v = infoEnB ? [['Implementador', 'Info'].concat(g1), ['', ''].concat(g2)] : [['Info', 'Implementador'].concat(g1), ['', ''].concat(g2)];
  renglones.forEach(function (x) {
    const esDia = !x[1] && !/Evento|Hora|Lugar|Encuentro|Seguridad/.test(String(x[0]));
    if (esDia) h.v.push([x[0], ''].concat(vacias()));                      // el día en la A (combinado a lo ancho)
    else h.v.push(infoEnB ? [x[1], x[0]].concat(vacias()) : [x[0], x[1]].concat(vacias()));
  });
  for (let r = 3; r <= h.v.length; r++) if (h.v[r - 1][1] || h.v[r - 1][0] && /Evento|Encuentro|Seguridad/.test(String(infoEnB ? h.v[r - 1][1] : h.v[r - 1][0]))) {
    for (let c = 3; c <= 12; c++) h.checks[r + ':' + c] = true;
  }
  h.merges = [];
  return h;
}

console.log('[18] MEDIA 2: el cruce de la copia única no se equivoca de reunión (hora distinta, lugar distinto, evento genérico)');
{
  const base = BASE().concat([filaBase({ Figura: '', agenda_uid: 'c-5' })]);
  const E = entorno(base, { directa: true, solapas: ['LEER', 'Agenda', 'AgendaCall', 'Agenda (mail)', 'Agenda cerrada', 'Agenda Directa'] });
  const sem = SEMANA.concat([{ figura: '', fecha: [7, 10], hora: '18:00', evento: 'Seguridad en tu Barrio', lugar: 'Comuna 7 - Plaza Flores', fila: 6 }]);
  E.ctx.__ab = abierta(E, sem);
  ponerDirectaChica(E, [
    ['martes 06/10', ''],
    ['Evento: Encuentro con Vecinos', 'Mel'],                                                                 // genérico, sin hora
    ['miércoles 07/10', ''],
    ['Evento: Seguridad en tu Barrio\nHora: 10:00h\nLugar: Comuna 4 - Parque Patricios', 'Lu'],              // la de las 10, C4: no está
    ['Evento: Seguridad en tu Barrio\nHora: 18:00h\nLugar: Comuna 7 - Plaza Flores', 'Cris'],                 // la de las 18, C7
    ['Evento: Seguridad en tu Barrio\nHora: 18:00h\nLugar: Comuna 9 - Mataderos', 'Yami']                     // misma hora, otra comuna
  ]);
  E.run('escribirVistasAgenda_(SpreadsheetApp.openById(AGENDA_COPIA_SS), __ab, {})');
  E.logs.length = 0;
  const r = E.run('copiarAgendaDirectaEnSeco()');
  const L = E.log();
  ok(/SIN CRUCE renglón 6 .*hora distinta \(aquí 10:00, el sistema 18:00\)/.test(L), 'la de las 10:00 (C4): SIN CRUCE, hora distinta');
  ok(/COPIARÍA renglón 7 .*→ c-5 .*Implementador = Cris/.test(L), 'la de las 18:00 (C7) va a la reunión del sistema');
  ok(/SIN CRUCE renglón 8 .*lugar distinto \(Comuna 9 \/ Comuna 7\)/.test(L), 'misma hora y otra comuna: SIN CRUCE, lugar distinto');
  ok(/SIN CRUCE renglón 4 .*ninguna reunión del sistema con ese evento ese día/.test(L) && !/COPIARÍA renglón 4/.test(L),
     'un "Encuentro con Vecinos" genérico, sin hora, ya no cae en la única reunión que lo contiene');
  ok(r.copiadas === 1 && r.sinCruce === 3, 'una copiada, tres sin cruce (' + JSON.stringify(r) + ')');
}

console.log('[19] BAJA 4: el formato de siempre se lee POR POSICIÓN; en el nuevo, un título cambiado no hace perder nada');
{
  const E = entorno(BASE(), { solapas: ['LEER', 'Agenda', 'AgendaCall', 'Agenda (mail)', 'Agenda cerrada'] });
  E.ctx.__ab = abierta(E, SEMANA);
  const ss = 'SpreadsheetApp.openById(AGENDA_COPIA_SS)';
  E.run('escribirVistasAgenda_(' + ss + ', __ab, {})');
  const h = vista(E), t = enVista(E, 'c-2');
  h.v[t.fila - 1][1] = 'Cris'; h.v[t.fila - 1][2] = true;
  h.v[0][4] = 'xx'; h.v[0][0] = 'otra cosa';                                    // el equipo cambió los títulos de A y de E
  E.run('escribirVistasAgenda_(' + ss + ', __ab, {})');
  ok(enVista(E, 'c-2').resp === 'Cris' && enVista(E, 'c-2').c1 === true && equipoGuardado(E)['c-2'].Responsable === 'Cris',
     'apagado: con "clave" (E) y la A renombradas, la clave y B:D se leen por posición: no se pierde nada');
  // el formato nuevo: la "clave" renombrada (sigue oculta) → se usa la columna oculta; un título del equipo renombrado → no se reescribe
  const E2 = entorno(BASE(), { directa: true, solapas: ['LEER', 'Agenda', 'AgendaCall', 'Agenda (mail)', 'Agenda cerrada', 'Agenda Directa'] });
  ponerDirecta(E2);
  E2.ctx.__ab = abierta(E2, SEMANA);
  E2.run('escribirVistasAgenda_(' + ss + ', __ab, {})');
  const h2 = vista(E2), r2 = fila13(E2, 'c-2');
  h2.v[r2 - 1][1] = 'Yami';
  h2.v[0][12] = 'id';                                                           // "clave" → "id"
  E2.logs.length = 0;
  E2.run('escribirVistasAgenda_(' + ss + ', __ab, {})');
  ok(equipoGuardado(E2)['c-2'] && equipoGuardado(E2)['c-2'].Implementador === 'Yami' && /se usa la columna oculta \(13\)/.test(E2.log()),
     '"clave" renombrada: se toma la única columna oculta, y lo del equipo se guarda');
  h2.v[0][6] = 'POSTE';                                                         // el grupo "POST" renombrado
  h2.v[fila13(E2, 'c-1') - 1][1] = 'Lu';
  const antes = JSON.stringify(h2.v);
  E2.logs.length = 0;
  E2.run('escribirVistasAgenda_(' + ss + ', __ab, {})');
  ok(JSON.stringify(h2.v) === antes && /NO SE REESCRIBE "Agenda \(mail\)" \(lo del equipo se perdería\): no se encuentran las columnas POST · Ok Sol, POST · Programado/.test(E2.log()),
     'un grupo renombrado ("POST" → "POSTE"): "Agenda (mail)" NO se reescribe y el log lo dice en grande');
}

console.log('[20] BAJA 5: "Info" no es la A en "Agenda Directa": el día va en la A del renglón combinado y se lee igual');
{
  const E = entorno(BASE(), { directa: true, solapas: ['LEER', 'Agenda', 'AgendaCall', 'Agenda (mail)', 'Agenda cerrada', 'Agenda Directa'] });
  ponerDirectaChica(E, [['martes 06/10', ''], ['Evento: Encuentro con Vecinos Jorge Macri, Belgrano\nHora: 18:00h', 'Lu']], true);
  E.ctx.__ab = abierta(E, SEMANA);
  E.run('escribirVistasAgenda_(SpreadsheetApp.openById(AGENDA_COPIA_SS), __ab, {})');
  const h = vista(E);
  const lunes = h.v.findIndex(function (r) { return r[0] === 'lunes 05/10'; }) + 1;
  ok(h.v[0][1] === 'Info' && h.v[0][0] === 'Implementador' && lunes > 2 && h.v[lunes - 1][1] === '' &&
     h.merges.some(function (m) { return m.join() === [lunes, 1, 1, 12].join(); }), 'Info en la B; el día escrito en la A, combinado de A a L');
  const r = E.run('leerRenglonesVistaMail_(SpreadsheetApp.openById(AGENDA_COPIA_SS).getSheetByName(AGENDA_SOLAPA_VISTA_MAIL), hoyMediodia_())');
  const reus = r.renglones.filter(function (x) { return x.tipo === 'reunion'; });
  ok(r.renglones.filter(function (x) { return x.tipo === 'dia'; }).length === 12 && reus.length === 4 &&
     reus.every(function (x) { return x.fecha && x.clave; }) && /Macri/.test(reus[0].texto) && E.ctx.ymd_(reus[0].fecha) === '20261006',
     'el lector encuentra los 12 días (en la A) y las 4 reuniones, cada una con su día' +
     (process.env.VER ? JSON.stringify(r.renglones.map(function (x) { return [x.fila, x.tipo, x.texto, x.clave, x.fecha && E.ctx.ymd_(x.fecha)]; })) : ''));
  E.logs.length = 0;
  E.run('copiarAgendaDirectaEnSeco()');
  ok(/COPIARÍA renglón 4 \(06\/10\/2026 .*→ c-1 .*Implementador = Lu/.test(E.log()), 'y la copia única también lee el día de la A en "Agenda Directa"');
}

console.log('\n' + chequeos + ' chequeos.');
console.log(fallas ? fallas + ' FALLA(S)' : 'Todo en verde.');
process.exit(fallas ? 1 : 0);
