/**
 * tests/aceleraciones.test.js — las ACELERACIONES de la corrida de la hora (16/10; 49_Aceleraciones.js, 49_Corridas.js):
 *   [1] la huella del tablero de Looker (Datos_Unpivot, Aux_Maximos): sin cambios no se reescribe; un cambio, la red de
 *       seguridad (6 h), una solapa tocada y el interruptor apagado sí;
 *   [2] los IDs cada 3 horas: una hora después no, tres sí, y la excepción (una reunión que recién pasó sin ID);
 *   [3] REGISTRO_CORRIDAS: las columnas nuevas al final (los tramos de la agenda, sin_cambios, no_tocaba), las filas viejas se
 *       siguen leyendo, y el paso 67 lista las CORTADAS (en qué parte) y las corridas con la agenda de más de 150 s;
 *   [4] los tramos de la agenda (agendaTiempo_): suman bien, restan el HTML de Gmail y dejan dónde murió una corrida.
 * (Las vistas del archivo "Agenda" y la copia del archivo RDV: tests/agenda_vistas.test.js [21]. Los IDs dentro de la corrida de
 * la hora: tests/escritura_lote.test.js --guarda.)
 *
 *     node tests/aceleraciones.test.js
 *
 * NO sube a Apps Script. Sin datos reales.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');

let chequeos = 0, fallas = 0;
function ok(c, q) { chequeos++; console.log((c ? '  ok   ' : '  FALLA ') + q); if (!c) fallas++; }

/** Una hoja simple: valores, y cuántas veces se borró y escribió. */
function hoja(nombre, filas) {
  const h = { v: (filas || []).map(function (r) { return r.slice(); }), borradas: 0, escrituras: 0 };
  h.getName = function () { return nombre; };
  h.getLastRow = function () { return h.v.length; };
  h.getLastColumn = function () { return h.v.reduce(function (m, r) { return Math.max(m, r.length); }, 0); };
  h.appendRow = function (r) { h.v.push(r.slice()); };
  h.insertRowBefore = function (n) { h.v.splice(n - 1, 0, []); };
  h.clearContents = function () { h.v = []; h.borradas++; };
  h.getRange = function (f, c, nf, nc) {
    nf = nf || 1; nc = nc || 1;
    const o = {
      getValues: function () {
        const out = [];
        for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) { const x = (h.v[f - 1 + i] || [])[c - 1 + j]; r.push(x == null ? '' : x); } out.push(r); }
        return out;
      },
      setValues: function (m) {
        if (h.falla) throw new Error('Sheets no responde');
        h.escrituras++;
        m.forEach(function (r, i) { h.v[f - 1 + i] = h.v[f - 1 + i] || []; r.forEach(function (x, j) { h.v[f - 1 + i][c - 1 + j] = x; }); });
        return o;
      },
      setNumberFormat: function () { return o; }
    };
    return o;
  };
  return h;
}

function entorno() {
  const logs = [], props = {};
  const E = { logs: logs, props: props, ahora: new Date(2026, 9, 16, 10, 0, 0).getTime() };
  const ss = { hojas: {} };
  ss.getSheetByName = function (n) { return ss.hojas[n] || null; };
  ss.insertSheet = function (n) { ss.hojas[n] = hoja(n, []); return ss.hojas[n]; };
  const ctx = {
    Logger: { log: function (fmt) { const a = Array.prototype.slice.call(arguments, 1); let k = 0; logs.push(String(fmt).replace(/%s/g, function () { return String(a[k++]); })); } },
    SpreadsheetApp: { flush: function () {} },
    PropertiesService: { getScriptProperties: function () { return {
      getProperty: function (k) { return k in props ? props[k] : null; }, setProperty: function (k, v) { props[k] = String(v); },
      deleteProperty: function (k) { delete props[k]; }, getProperties: function () { return Object.assign({}, props); } }; } },
    Utilities: { formatDate: function (d, tz, f) { return String(d.getTime()); } },
    console: console, Math: Math, JSON: JSON, Date: Date, String: String, Object: Object, Array: Array, RegExp: RegExp, Map: Map, Set: Set,
    Number: Number, Error: Error, isNaN: isNaN, parseInt: parseInt
  };
  vm.createContext(ctx);
  ['00_Config.js', '01_Utils.js', '02_Parsing.js', '49_Corridas.js', '49_Aceleraciones.js', '44_Looker.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), ctx, { filename: f });
  });
  ctx.__ss = ss;
  vm.runInContext('ssIntermedia_ = function () { return __ss; }; hoyMediodia_ = function () { return new Date(2026, 9, 16, 12, 0, 0); };', ctx);
  ctx._ahoraHuella_ = function () { return E.ahora; };
  E.ctx = ctx; E.ss = ss;
  E.run = function (e) { return vm.runInContext(e, ctx); };
  E.log = function () { return logs.join('\n'); };
  return E;
}

// =====================================================================================================
console.log('[1] Looker: la huella (LOOKER_SOLO_SI_CAMBIA)');
{
  const E = entorno();
  const enc = ['ID', 'Figura', 'Valor', 'FechaCarga'];
  E.ctx.__enc = enc;
  E.ctx.__filas = [['a', 'Ana', 3, new Date(2026, 9, 16, 10)], ['b', 'Bea', 5, new Date(2026, 9, 16, 10)]];
  const escribir = function () { return E.run('_escribirSolapaLooker_(__ss, "Datos_Unpivot", __enc, __filas, null)'); };
  escribir();
  const h = E.ss.hojas['Datos_Unpivot'];
  ok(h.borradas === 1 && h.v.length === 3 && !!E.props['HUELLA_VISTA_LOOKER|Datos_Unpivot'], 'la primera vez se escribe y queda la huella');
  E.ctx.__filas = [['a', 'Ana', 3, new Date(2026, 9, 16, 11)], ['b', 'Bea', 5, new Date(2026, 9, 16, 11)]];   // sólo cambió FechaCarga
  E.logs.length = 0;
  const n = escribir();
  ok(h.borradas === 1 && n === 2 && /"Datos_Unpivot": sin cambios/.test(E.log()), 'sólo cambió FechaCarga (la hora de la corrida): NO se reescribe');
  E.ctx.__filas = [['a', 'Ana', 4, new Date(2026, 9, 16, 12)], ['b', 'Bea', 5, new Date(2026, 9, 16, 12)]];
  escribir();
  ok(h.borradas === 2 && h.v[1][2] === 4, 'cambió un valor: se reescribe');
  escribir();
  ok(h.borradas === 2, 'otra vez lo mismo: no');
  E.ahora += 7 * 3600000;
  escribir();
  ok(h.borradas === 3, 'siete horas después (red de seguridad, cada ' + E.run('HUELLAS_REESCRIBIR_CADA_HORAS') + ' h): se reescribe igual');
  h.v.push(['alguien', 'pegó', 'algo']);
  escribir();
  ok(h.borradas === 4 && h.v.length === 3, 'la solapa tiene una fila de más (la tocaron): se reescribe');
  E.run('olvidarHuellasVistas()');
  escribir();
  ok(h.borradas === 5, 'olvidarHuellasVistas(): la próxima reescribe');
  // falla a la mitad: no deja huella
  E.ctx.__filas = [['a', 'Ana', 9, new Date()], ['b', 'Bea', 5, new Date()]];
  h.falla = true;
  let tiro = false; try { escribir(); } catch (e) { tiro = true; }
  h.falla = false;
  ok(tiro && !E.props['HUELLA_VISTA_LOOKER|Datos_Unpivot'], 'una escritura que falla: la huella se borró antes de escribir');
  escribir();
  ok(h.v[1][2] === 9 && !!E.props['HUELLA_VISTA_LOOKER|Datos_Unpivot'], 'la siguiente, con lo mismo, escribe');
  // con el interruptor apagado
  const src = fs.readFileSync(path.join(RAIZ, '44_Looker.js'), 'utf8');
  ok(/huellaSinCambios_\(claveH, huella, ss\.getSheetByName\(nombre\), LOOKER_SOLO_SI_CAMBIA\)/.test(src), 'la huella pasa por el interruptor LOOKER_SOLO_SI_CAMBIA');
  ok(E.run('huellaSinCambios_("x", "h", { getLastRow: function () { return 1; }, getLastColumn: function () { return 1; } }, false)') === false,
     'huellaSinCambios_ con el interruptor apagado: siempre false (se escribe)');
  ok(E.run('huellaContenido_({a: [1, "x", new Date(2026, 0, 1)]})') === E.run('huellaContenido_({a: [1, "x", new Date(2026, 0, 1)]})') &&
     E.run('huellaContenido_([1, 2])') !== E.run('huellaContenido_([1, 3])'), 'huellaContenido_: lo mismo da lo mismo; distinto, distinto');
}

console.log('[2] los IDs cada 3 horas (IDS_SOLO_CADA_HORAS) y la excepción de las reuniones que recién pasaron');
{
  const E = entorno();
  const hdr = ['Figura', 'Barrio', 'FECHA', 'ID cuentas'];
  const fila = function (fig, d, id) { const f = new Date(2026, 9, d, 12); return { figura: fig, barrio: 'Palermo', fecha: f, valores: [fig, 'Palermo', f, id || ''] }; };
  const dest = { hdr: hdr, filas: [fila('Ana', 13, ''), fila('Bea', 14, 'ID-1'), fila('Cris', 15, ''), fila('Dani', 16, ''), fila('Eva', 20, '')] };
  E.ctx.__dest = dest;
  const toca = function () { return E.run('idsTocaEnEstaCorrida_(__dest)'); };
  let t = toca();
  ok(t.toca && /no hay registro/.test(t.porque) && t.pend.length === 2, 'la primera vez: corren (pendientes: Ana 13/10 y Cris 15/10; Bea tiene ID; Dani es hoy; Eva es futura)');
  E.ctx.__t = t; E.run('idsAnotarCorrida_(__t)');
  E.ahora += 3600000;
  t = toca();
  ok(!t.toca && /cada 3 h: la última fue hace 60 min, y no hay reuniones nuevas/.test(t.porque), 'una hora después: no tocan (' + t.porque + ')');
  // al día siguiente, la de Dani (16/10) ya pasó y no tiene ID: corren aunque no pasaron 3 horas
  vm.runInContext('hoyMediodia_ = function () { return new Date(2026, 9, 17, 12, 0, 0); };', E.ctx);
  t = toca();
  ok(t.toca && /1 reunión\(es\) que ya pasaron, sin ID, nuevas/.test(t.porque), 'una reunión que recién pasó, sin ID (Dani, 16/10): corren en esta corrida');
  E.ctx.__t = t; E.run('idsAnotarCorrida_(__t)');
  E.ahora += 3600000;
  ok(!toca().toca, 'y la corrida siguiente, otra vez no');
  dest.filas.push(fila('Fede', 15, ''));
  ok(toca().toca, 'una fila nueva en la base (la creó la agenda) con una reunión que ya pasó sin ID: corren');
  E.ctx.__t = toca(); E.run('idsAnotarCorrida_(__t)');
  E.ahora += 2 * 3600000 + 55 * 60000;
  t = toca();
  ok(t.toca && /pasaron 175 min/.test(t.porque), 'dos horas 55 min después (3 h con el margen del activador): corren');
  E.ctx.__t = t; E.run('idsAnotarCorrida_(__t)');
  E.ahora += 3600000;
  ok(E.run('idsTocaEnEstaCorrida_(null).toca') === false && /sólo el horario/.test(E.run('idsTocaEnEstaCorrida_(null).porque')),
     'sin la base leída (el cruce no corrió): sólo cuenta el horario');
  const src = fs.readFileSync(path.join(RAIZ, '20_UpsertDestino.js'), 'utf8');
  ok(/idsTocaEnEstaCorrida_\(plan \? plan\.dest : null\)/.test(src) && /idsAnotarCorrida_\(tocaIds\)/.test(src) && /corridaNoTocaba_\('ids'/.test(src),
     'la corrida de la hora lo usa (con la base que ya leyó el cruce) y anota la corrida sólo si los IDs terminaron sin error');
  ok(!/DriveApp|getLastUpdated/.test(fs.readFileSync(path.join(RAIZ, '49_Aceleraciones.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')),
     'sin Drive (ningún permiso nuevo: no hay que volver a autorizar)');
}

console.log('[3] REGISTRO_CORRIDAS: las columnas nuevas al final, las filas viejas, y el paso 67 (CORTADAS, agenda lenta)');
{
  const E = entorno();
  const encViejo = ['inicio', 'id', 'modo', 'estado', 'total_s', 'guardian_s', 'agenda_s', 'cruce_s', 'asistentes_s', 'escritura_s', 'derivadas_s',
    'elecciones_s', 'reportes_s', 'ids_s', 'looker_s', 'vistas_agenda_s', 'guardian_copia_s', 'registro_upsert_s', 'salteadas_por_tiempo', 'errores'];
  const filaVieja = function (id, estado, total, agenda, cruce) {
    return [new Date(), id, 'real', estado, total, '', agenda, cruce, 2, 10, 5, 1, 8, 20, 15, 30, '', 1, '', ''];
  };
  const vieja = hoja('REGISTRO_CORRIDAS', [encViejo, filaVieja('20261015-0900', 'ok', 190, 70, 40),
    filaVieja('20261015-1000', 'CORTADA en "ids" (límite de 6 min o caída)', '', 279.6, 30), filaVieja('20261015-1100', 'ok', 287, 160, 50)]);
  vieja.v[2][13] = '';   // la cortada: los IDs no terminaron
  E.ss.hojas.REGISTRO_CORRIDAS = vieja;
  const enc = E.run('encabezadoCorridas_()');
  ok(JSON.stringify(enc.slice(0, encViejo.length)) === JSON.stringify(encViejo) && enc.indexOf('agenda_gmail_s') > encViejo.length &&
     // 16/10 (tarde): las del punto 5b, también al final (después de las del 16/10 de la mañana)
     enc.slice(-12, -9).join('|') === 'agenda_geo_n|sin_cambios|no_tocaba' &&
     enc.slice(-9, -1).join('|') === 'agenda_cache_s|agenda_geo_detalle|agenda_mails_cache|base_lecturas|base_reusos|base_lecturas_s|base_detalle|orden' &&
     enc[enc.length - 1] === 'base_ordenada',   // 19/10 (prompt 08, punto 7)
     'el encabezado: las columnas de siempre en su orden y las nuevas AL FINAL');
  // una corrida nueva, con los tramos de la agenda, una solapa sin cambios y los IDs que no tocaban
  E.run('corridaIniciar_(new Date(), false, false)');
  E.run('corridaEmpieza_("agenda"); agendaTiemposIniciar_(); _tiemposAgenda_.ms = { base: 3000, gmail: 40000, html: 55000, parse: 2000, plan: 90000, geo: 60000 }; _tiemposAgenda_.geoN = 12; agendaTiempo_("escritura")');
  E.run('corridaAnotar_("agenda", Date.now() - 190000, null); corridaSinCambios_("AgendaCall"); corridaSinCambios_("Datos_Unpivot"); corridaNoTocaba_("ids", "cada 3 h: la última fue hace 60 min")');
  E.run('corridaCerrar_(null)');
  ok(JSON.stringify(vieja.v[0]) === JSON.stringify(enc), 'el encabezado viejo se completó en la fila 1 (las filas no se tocaron: ' + (vieja.v.length - 1) + ')');
  const nueva = vieja.v[vieja.v.length - 1], c = function (k) { return nueva[enc.indexOf(k)]; };
  ok(c('agenda_gmail_s') === 40 && c('agenda_html_s') === 55 && c('agenda_plan_s') === 90 && c('agenda_geo_s') === 60 && c('agenda_geo_n') === 12,
     'la línea nueva: los tramos de la agenda en segundos (gmail 40, html 55, plan 90, geo 60 en 12 llamadas)');
  ok(c('sin_cambios') === 'AgendaCall, Datos_Unpivot' && c('ids_s') === 'no tocaba' && /^ids: cada 3 h/.test(c('no_tocaba')) && c('estado') === 'ok',
     'sin_cambios, "no tocaba" en ids_s y el porqué en no_tocaba; la corrida, "ok"');
  // el paso 67
  E.logs.length = 0;
  const out = E.run('tiemposDeCorridas(48)');
  ok(out.estados.ok === 3 && out.estados.CORTADA === 1, 'el paso 67 lee las viejas y la nueva: ok 3, CORTADA 1');
  ok(out.agenda.veces === 4 && out.cruce.veces === 3, 'las partes, de las filas viejas y la nueva (agenda 4 veces; el cruce 3)');
  ok(out.cortadas.length === 1 && out.cortadas[0].id === '20261015-1000' && out.cortadas[0].parte === 'ids' &&
     /agenda 279\.6 s/.test(out.cortadas[0].partes), 'las CORTADAS, una por una: la de las 10, murió en "ids", con lo que terminó antes (agenda 279,6 s…)');
  ok(/1\. 20261015-1000 — murió en "ids"/.test(E.log()) && /sin los tramos: corrida de antes del 16\/10/.test(E.log()), '   el log lo dice (y que esa corrida no tiene los tramos)');
  ok(out.agendaLentas.map(function (a) { return a.id; }).join(',') === '20261015-1000,20261015-1100,' + nueva[1],
     'las corridas con la agenda de más de 150 s: las de las 10, las 11 y la nueva');
  ok(/gmail 40\.0 s · html 55\.0 s · parse 2\.0 s · plan 90\.0 s · geo 60\.0 s \(12 llamadas\)/.test(E.log()), '   con sus tramos, para la nueva');
  ok(out.agendaTramos.html.max === 55 && out.sinCambios.AgendaCall === 1 && out.ids.noTocaba === 1,
     'la agenda por dentro (mediana / máximo), las solapas sin cambios y los IDs que no tocaban');
}

console.log('[4] los tramos de la agenda: el HTML se resta de Gmail; una corrida que muere en la agenda dice dónde');
{
  const E = entorno();
  E.ctx.__r = { t: 1000000 };
  E.run('_ahoraMs_ = function () { return __r.t; }');
  E.run('corridaIniciar_(new Date(), false, false); corridaEmpieza_("agenda"); agendaTiemposIniciar_()');
  E.ctx.__r.t += 2000; E.run('agendaTiempo_("base")');
  E.ctx.__r.t += 100000; E.run('agendaTiempoSumar_("html", 60000); agendaTiempo_("gmail", 60000)');
  E.ctx.__r.t += 5000; E.run('agendaTiempoSumar_("geo", 3000, 1); agendaTiempoSumar_("geo", 2000, 1); agendaTiempo_("plan")');
  const T = E.run('_tiemposAgenda_');
  ok(T.ms.base === 2000 && T.ms.gmail === 40000 && T.ms.html === 60000 && T.ms.plan === 5000 && T.ms.geo === 5000 && T.geoN === 2,
     'base 2 s, Gmail 100 s de los que 60 s son el HTML → gmail 40 s y html 60 s; plan 5 s con 2 geocodificaciones (5 s)');
  const p = JSON.parse(E.props[E.run('PROP_CORRIDA_EN_CURSO')]);
  ok(p.actual === 'agenda (después de plan)' && p.agenda.ms.gmail === 40000, 'la corrida en curso (propiedad) sabe hasta dónde llegó la agenda y sus tramos');
  // la corrida siguiente la encuentra cortada
  E.ss.hojas.REGISTRO_CORRIDAS = hoja('REGISTRO_CORRIDAS', []);
  E.run('_corrida_ = null; corridaIniciar_(new Date(), false, false)');
  const h = E.ss.hojas.REGISTRO_CORRIDAS, enc = h.v[0];
  const cort = h.v.filter(function (r) { return /^CORTADA/.test(String(r[3])); })[0];
  ok(cort && /CORTADA en "agenda \(después de plan\)"/.test(cort[3]) && cort[enc.indexOf('agenda_gmail_s')] === 40,
     'la cortada queda como CORTADA en "agenda (después de plan)", con los tramos que alcanzó a medir');
  const src = fs.readFileSync(path.join(RAIZ, '40_Agenda.js'), 'utf8');
  ok(['base', 'parse', 'plan', 'escritura', 'solapas', 'copia', 'registro'].every(function (k) { return src.indexOf("tramo('" + k + "')") >= 0; }) &&
     /tramo\('gmail', mails\.html \? mails\.html\.ms \|\| 0 : 0\)/.test(src), 'correrAgendaEnBloqueo_ marca cada tramo');
  ok(/agendaTiempoSumar_\('geo', Date\.now\(\) - tGeo, 1\)/.test(fs.readFileSync(path.join(RAIZ, '41_AgendaParser.js'), 'utf8')), 'y _geocodificar_ suma lo que tarda Maps');
}

console.log('\n' + chequeos + ' chequeos.');
console.log(fallas ? fallas + ' FALLA(S)' : 'Todo en verde.');
process.exit(fallas ? 1 : 0);
