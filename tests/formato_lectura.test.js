/**
 * tests/formato_lectura.test.js — el formato para leer de las solapas de reporte (51_FormatoLectura.js, 15/10): texto
 * ajustado arriba a la izquierda, encabezado en negrita gris congelado, anchos según el contenido, ELEGIR / COMENTARIO
 * resaltadas; los escritores que lo aplican en cada reescritura.
 *
 *     node tests/formato_lectura.test.js
 *
 * NO sube a Apps Script. Sin datos reales.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');

let chequeos = 0, fallas = 0;
function ok(c, q) { chequeos++; console.log((c ? '  ok   ' : '  FALLA ') + q); if (!c) fallas++; }

function entorno(reemplazos) {
  const logs = [];
  const ctx = { Logger: { log: function (fmt) { const a = Array.prototype.slice.call(arguments, 1); let k = 0; logs.push(String(fmt).replace(/%s/g, function () { return String(a[k++]); })); } }, console: console,
                Math: Math, JSON: JSON, Date: Date, String: String, Object: Object, Array: Array, RegExp: RegExp };
  vm.createContext(ctx);
  ['00_Config.js', '01_Utils.js', '51_FormatoLectura.js'].forEach(function (f) {
    let s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    (reemplazos || []).forEach(function (r) { s = s.split(r[0]).join(r[1]); });
    vm.runInContext(s, ctx, { filename: f });
  });
  return { ctx: ctx, logs: logs, run: function (e) { return vm.runInContext(e, ctx); } };
}
function hoja(nombre, falla) {
  const h = { nombre: nombre, anchos: {}, congeladas: 0, rangos: [], getName: function () { return nombre; } };
  h.getRange = function (f, c, nf, nc) {
    const r = { f: f, c: c, nf: nf || 1, nc: nc || 1, fmt: {} };
    ['setWrap', 'setVerticalAlignment', 'setHorizontalAlignment', 'setFontWeight', 'setBackground'].forEach(function (k) {
      r[k] = function (v) { if (falla) throw new Error('Service Spreadsheets timed out'); r.fmt[k] = v; return r; };
    });
    h.rangos.push(r);
    return r;
  };
  h.setFrozenRows = function (n) { h.congeladas = n; };
  h.setColumnWidth = function (c, w) { h.anchos[c] = w; };
  return h;
}

console.log('[1] AGENDA_DUPLICADOS: ELEGIR y COMENTARIO adelante y resaltadas, "reunión del mail" ancha, el resto según el contenido');
{
  const E = entorno();
  const enc = ['ELEGIR', 'COMENTARIO', 'resultado', 'tipo', 'reunión del mail', 'fila candidata', 'figura (fila)', 'fecha (fila)', 'hora (fila)',
               'barrio (fila)', 'STATUS (fila)', 'Origen fila', 'diferencia', 'qué hacer', 'id_reunion', 'id_fila'];
  const fila = ['', '', 'no se creó: elegir', 'antes de crear', '22/10/2026 18:00 | Seguridad en tu Barrio | Comuna 12 | A CONFIRMAR', 'fila 833',
                '(sin figura)', '22/10/2026', '18:00', 'Villa Ejemplo', 'en agenda', 'agenda', 'misma fecha y comuna',
                '"Es la misma": la agenda usa esa fila. "Ya está cargada en otra fila": no crea ni toca nada. "Son distintas": la crea.', 'x', 'y'];
  const h = hoja('AGENDA_DUPLICADOS');
  E.ctx.__h = h; E.ctx.__m = [enc, fila];
  const r = E.run('formatoLectura_(__h, __m)');
  const todo = h.rangos[0];
  ok(todo.f === 1 && todo.nf === 2 && todo.nc === 16 && todo.fmt.setWrap === true && todo.fmt.setVerticalAlignment === 'top' &&
     todo.fmt.setHorizontalAlignment === 'left', 'todas las celdas: ajustadas, arriba a la izquierda');
  const encR = h.rangos[1];
  ok(encR.f === 1 && encR.nc === 16 && encR.fmt.setFontWeight === 'bold' && encR.fmt.setBackground === '#D9D9D9' && h.congeladas === 1,
     'el encabezado: negrita, gris claro, congelado');
  ok(h.rangos.filter(function (x) { return x.f === 1 && x.nf === 1 && x.nc === 1 && x.fmt.setBackground === '#FFE599'; }).map(function (x) { return x.c; }).join(',') === '1,2',
     'ELEGIR y COMENTARIO, resaltadas en el encabezado');
  ok(r.descripcion === 4 && h.anchos[5] === 350, '"reunión del mail" (la que describe la reunión): 350 px');
  ok(h.anchos[8] === 95 && h.anchos[9] === 95, 'fecha y hora: angostas (95)');
  ok(h.anchos[7] === 160 && h.anchos[10] === 160, 'figura y barrio: 160');
  ok(h.anchos[14] === 250, 'el texto largo ("qué hacer"): 250');
  ok(h.anchos[1] === 170 && h.anchos[2] === 220, 'ELEGIR 170, COMENTARIO 220');
  ok(Object.keys(h.anchos).every(function (k) { return h.anchos[k] >= 70; }), 'ninguna columna por debajo de 70 px');
}

console.log('[2] sin columna que diga "reunión": la primera (que no sea ELEGIR / COMENTARIO) es la ancha; encabezado en otra fila');
{
  const E = entorno();
  const h = hoja('IDS_SIN_CRUZAR');
  E.ctx.__h = h; E.ctx.__m = [['aviso'], ['ID', 'motivo', 'Fecha'], ['3000-ABC', 'lugar distinto: la lista dice Comuna 6 y la fila Comuna 1 Sur', '14/05/2026']];
  const r = E.run('formatoLectura_(__h, __m, { filaEncabezado: 2 })');
  ok(r.descripcion === 0 && h.anchos[1] === 350 && h.anchos[2] === 250 && h.anchos[3] === 95 && h.congeladas === 2,
     'la A ancha, el motivo largo, la fecha angosta; congela hasta el encabezado (fila 2)');
}

console.log('[3] la lista de solapas, el interruptor, y una falla que no corta');
{
  const E = entorno();
  ok(E.run('llevaFormatoLectura_("AGENDA_DUPLICADOS") && llevaFormatoLectura_("SIN_MATCH") && llevaFormatoLectura_("AGENDA_PENDIENTES")') &&
     !E.run('llevaFormatoLectura_("REVISAR_MATCH")') && !E.run('llevaFormatoLectura_("REGISTRO_UPSERT")'),
     'llevan formato las de la lista; REVISAR_MATCH (fichas) y los registros, no');
  const E2 = entorno([['const FORMATO_LECTURA_ACTIVO = true;', 'const FORMATO_LECTURA_ACTIVO = false;']]);
  const h2 = hoja('SIN_MATCH');
  E2.ctx.__h = h2;
  ok(E2.run('formatoLectura_(__h, [["a"],["b"]])') === null && h2.rangos.length === 0 && !E2.run('llevaFormatoLectura_("SIN_MATCH")'),
     'con FORMATO_LECTURA_ACTIVO = false: no hace nada');
  const h3 = hoja('SIN_MATCH', true);
  E.ctx.__h3 = h3;
  let tiro = false;
  try { E.run('formatoLectura_(__h3, [["clave","motivo"],["x","y"]])'); } catch (e) { tiro = true; }
  ok(!tiro && E.logs.some(function (l) { return /el formato para leer de "SIN_MATCH" no se aplicó/.test(l); }), 'si falla, no tira: la solapa ya quedó escrita, y lo loguea');
}

console.log('[4] los escritores lo aplican en cada reescritura');
{
  const src = function (f) { return fs.readFileSync(path.join(RAIZ, f), 'utf8'); };
  ok(/setFrozenRows\(1\);\s*\/\/[^\n]*\n\s*if \(typeof llevaFormatoLectura_ === 'function' && llevaFormatoLectura_\(nombre\)\) formatoLectura_\(sh, matriz\);/.test(src('20_UpsertDestino.js')),
     'escribirHoja_ (los reportes de la intermedia: SIN_MATCH, EMPAREJAR_MANUAL, IDS_SIN_CRUZAR, HISTORICO…)');
  ok(/llevaFormatoLectura_\(nombre\)\) formatoLectura_\(sh, matriz\);/.test(src('41_AgendaParser.js')), '_escribirHojaAgenda_ (AGENDA_FIGURA_A_COMPLETAR, …)');
  ok(/llevaFormatoLectura_\(AGENDA_SOLAPA_DUPLICADOS\)\) formatoLectura_\(sh, filas\);/.test(src('40_Agenda.js')), 'AGENDA_DUPLICADOS (archivo del destino)');
}

console.log('\n' + chequeos + ' chequeos.');
console.log(fallas ? fallas + ' FALLA(S)' : 'Todo en verde.');
process.exit(fallas ? 1 : 0);
