/**
 * tests/auditoria_colores_mail.test.js — LAS MARCAS DE COLOR DEL MAIL (diagnostico/34_colores_mail.js), en Node, con una base,
 * un Gmail (texto plano + HTML) y la lista de IDs SIMULADOS. "Hoy" es el jueves 15/10/2026.
 *
 *     node tests/auditoria_colores_mail.test.js          (VER_LOG=1 para ver el log)
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: figuras (salvo el nombre de Macri, que ya usan los
 * tests de la lista de IDs), direcciones, horarios, IDs y mails son inventados; los barrios y las comunas son los públicos.
 *
 * Toda planilla, rango, hilo y mensaje del mock es un Proxy: cualquier método que no sea de LECTURA queda anotado en
 * `E.escrituras`. La auditoría tiene que terminar con esa lista vacía.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', '05_Escritura.js', '20_UpsertDestino.js', '49_Corridas.js', '51_FormatoLectura.js',
                  '41_AgendaParser.js', '42_BarriosCabaGeo.js', '40_Agenda.js', '47_AgendaVistas.js', '25_Elecciones.js', '45_IdsCuentas.js',
                  'diagnostico/31_auditoria_cancelaciones.js', 'diagnostico/34_colores_mail.js'].filter(function (f) { return fs.existsSync(path.join(RAIZ, f)); });
const HOY = new Date(2026, 9, 15, 12, 0, 0);
class D extends Date {
  constructor(...a) { if (a.length === 0) super(HOY.getTime()); else super(...a); }
  static now() { return HOY.getTime(); }
}
const pad = function (n) { return ('0' + n).slice(-2); };

// ============================== el mock: sólo lectura, todo lo demás se anota ==============================

function proxyLectura(E, nombre, lecturas) {
  return new Proxy(lecturas, {
    get: function (t, p) {
      if (p in t) return t[p];
      if (typeof p === 'symbol') return undefined;
      return function () { E.escrituras.push(nombre + '.' + String(p)); return proxyLectura(E, nombre, {}); };
    }
  });
}

function crearEntorno() {
  const E = { logs: [], escrituras: [], planillas: {}, romper: null, gmail: 0 };
  E.hoja = function (nombre, v) {
    const h = { nombre: nombre, v: v.map(function (r) { return r.slice(); }) };
    const ultimaFila = function () { for (let i = h.v.length; i >= 1; i--) if (h.v[i - 1].some(function (x) { return x !== '' && x != null; })) return i; return 0; };
    const ultimaCol = function () { let m = 0; h.v.forEach(function (r) { for (let j = r.length; j >= 1; j--) if (r[j - 1] !== '' && r[j - 1] != null) { m = Math.max(m, j); break; } }); return m; };
    h.lect = {
      getLastRow: ultimaFila, getLastColumn: ultimaCol, getName: function () { return nombre; },
      getMaxRows: function () { return Math.max(h.v.length, 1000); }, getMaxColumns: function () { return Math.max(ultimaCol(), 26); },
      getRange: function (f, c, nf, nc) {
        if (E.romper === nombre) throw new Error('Service Spreadsheets timed out (simulado)');
        nf = nf || 1; nc = nc || 1;
        const leer = function () {
          const o = [];
          for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) { const fila = h.v[f - 1 + i]; r.push(fila && fila[c - 1 + j] !== undefined ? fila[c - 1 + j] : ''); } o.push(r); }
          return o;
        };
        return proxyLectura(E, nombre + '!rango', { getValues: leer, getValue: function () { return leer()[0][0]; } });
      }
    };
    h.proxy = proxyLectura(E, nombre, h.lect);
    return h;
  };
  E.planilla = function (id) {
    if (!E.planillas[id]) {
      const p = { hojas: {} };
      p.proxy = proxyLectura(E, 'planilla ' + id.slice(0, 6), {
        getSheetByName: function (n) { if (E.romper === 'planilla ' + id) throw new Error('no se pudo abrir (simulado)'); return p.hojas[n] ? p.hojas[n].proxy : null; },
        getSheets: function () { return Object.keys(p.hojas).map(function (k) { return p.hojas[k].proxy; }); },
        getName: function () { return 'planilla ' + id.slice(0, 6); }, getId: function () { return id; },
        getSpreadsheetTimeZone: function () { return 'America/Argentina/Buenos_Aires'; }
      });
      E.planillas[id] = p;
    }
    return E.planillas[id];
  };
  E.poner = function (id, nombre, v) { E.planilla(id).hojas[nombre] = E.hoja(nombre, v); return E.planilla(id).hojas[nombre]; };
  E.hilos = [];
  const mensaje = function (m) {
    return proxyLectura(E, 'mensaje', { getId: function () { return m.id; }, getDate: function () { return m.fecha; },
      getSubject: function () { return m.asunto; }, getPlainBody: function () { return m.cuerpo; }, getBody: function () { E.gmail++; return m.html || ''; } });
  };
  const hilo = function (h) {
    return proxyLectura(E, 'hilo', { getId: function () { return h.id; },
      getLastMessageDate: function () { return h.mensajes.reduce(function (a, m) { return m.fecha > a ? m.fecha : a; }, h.mensajes[0].fecha); },
      getMessages: function () { return h.mensajes.map(mensaje); } });
  };
  const ctx = {
    console: console, Date: D, Math: Math, JSON: JSON, Map: Map, Set: Set, Object: Object, Array: Array, String: String, Number: Number,
    Logger: { log: function () { const a = Array.prototype.slice.call(arguments); let s = String(a.shift()); s = s.replace(/%s/g, function () { return String(a.shift()); }).replace(/%%/g, '%'); E.logs.push(s); } },
    Utilities: {
      formatDate: function (d, tz, f) { return f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate())).replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds())); },
      getUuid: function () { return 'uuid-' + Math.random().toString(36).slice(2, 8); }, sleep: function () {},
      DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: function (alg, t) { return Array.from(crypto.createHash('md5').update(String(t), 'utf8').digest()).map(function (b) { return b > 127 ? b - 256 : b; }); }
    },
    SpreadsheetApp: proxyLectura(E, 'SpreadsheetApp', { openById: function (id) { return E.planilla(id).proxy; }, ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' } }),
    GmailApp: proxyLectura(E, 'GmailApp', {
      getUserLabelByName: function () { return proxyLectura(E, 'etiqueta', { getThreads: function (i, n2) { return E.hilos.slice(i, i + n2).map(hilo); } }); },
      search: function () { return []; }
    }),
    Maps: proxyLectura(E, 'Maps', {}), PropertiesService: proxyLectura(E, 'PropertiesService', {}),
    CacheService: proxyLectura(E, 'CacheService', {}), LockService: proxyLectura(E, 'LockService', {}), Session: proxyLectura(E, 'Session', {})
  };
  vm.createContext(ctx);
  ARCHIVOS.forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), ctx, { filename: f }); });
  E.ctx = ctx;
  E.run = function (expr) { vm.runInContext('_ssDestino_ = null; _ssIntermedia_ = null; _cacheParsing_ = null; _ssRegistros_ = null;', ctx); E.logs = []; return vm.runInContext(expr, ctx); };
  return E;
}

// ============================== los datos (inventados) ==============================

const HDR = (function () {
  const fx = fs.readFileSync(path.join(RAIZ, 'fixtures', 'RVD JM-CM - ES.csv'), 'utf8').split(/\r?\n/)[0].split(',');
  const nombres = { C: 'EVENTO', F: 'HORA', H: 'One Page Entregado', I: 'STATUS REUNIÓN', J: 'Observaciones',
    L: 'Mail', M: 'Call Center', N: 'IVR', O: 'RRSS', P: 'Difusión', R: 'Oradores anotados', S: 'Oradores que hablaron',
    T: 'Temas mas comentados', U: 'Semaforo politico', V: 'Síntesis cualitativa:', AH: 'Masculinos', AI: 'Femeninos',
    AJ: '18-24', AK: '25-39', AL: '40-55', AM: '56-65', AN: '66+', AO: 'Sin identificar' };
  return fx.map(function (h) { const m = /^PENDIENTE_([A-Z]+)$/.exec(h); return m && nombres[m[1]] ? nombres[m[1]] : h; })
           .concat(['RDV_UID', 'form_origen', 'form_score', 'form_nivel', 'form_fecha_match', 'form_clave',
                    'No participa', 'agenda_uid', 'agenda_mail', 'agenda_version', 'agenda_hora_escrita', 'agenda_direccion_escrita',
                    'agenda_barrio_escrito', 'agenda_fecha_escrita', 'agenda_status_escrito', 'Origen fila', 'Tocado por el equipo',
                    'Evento (mail)', 'Lugar (mail)', 'Dirección (mail)', 'Marcas (mail)', 'Conjunta con']);
})();
const fila = function (o) {
  const r = HDR.map(function () { return ''; });
  Object.keys(o).forEach(function (k) { const i = HDR.indexOf(k); if (i < 0) throw new Error('no existe la columna ' + k); r[i] = o[k]; });
  return r;
};
const F = function (d, m) { return new D(2026, m - 1, d, 12, 0, 0); };
const BARRIOS = [['Recoleta', 2], ['Palermo', 14], ['Flores', 7], ['Caballito', 6], ['Villa Riachuelo', 8], ['Almagro', 5]];

const CM = function (d1, d2) { return 'Agenda Encuentros de vecinos con CM y Ministros - Semana del ' + d1 + ' al ' + d2; };
const JM = function (d1, d2) { return 'Agenda Encuentros de vecinos con JM - Semana del ' + d1 + ' al ' + d2; };
const texto = function (b) { return [].concat.apply([], b).join('\n'); };
/** Un bloque de reunión en HTML, con el estilo de cada línea (`st`: el style del <span> de esa línea, o ''). */
const bloque = function (dia, ev, hora, lugar, st) {
  st = st || {};
  const l = function (t, s) { return '<div>' + (s ? '<span style="' + s + '">' + t + '</span>' : t) + '</div>'; };
  return l('<b>' + dia + '</b>', st.dia) + l('Evento: ' + ev, st.ev) + l('Hora: ' + hora, st.hora) + l('Lugar: ' + lugar, st.lugar) + '<br>';
};
const plano = function (dia, ev, hora, lugar) { return ['*' + dia + '*', 'Evento: ' + ev, 'Hora: ' + hora, 'Lugar: ' + lugar, '']; };
const ENVOLTORIO = function (h) { return '<div dir="ltr" style="background-color:#ffffff"><span style="background-color:transparent">' + h + '</span></div>'; };

// reuniones (texto, igual en el plano y en el HTML)
const R = {
  ana21: ['Martes 21/07', 'Encuentro con Vecinos Ana Prueba, Recoleta', '18:00h', 'Av. Santa Fe 1234, Club'],
  bruno23: ['Jueves 23/07', 'Encuentro con Vecinos Bruno Ensayo, Palermo', '18:30h', 'Serrano 1500, Plaza'],
  bruno24: ['Viernes 24/07', 'Encuentro con Vecinos Bruno Ensayo, Palermo', 'A CONFIRMAR', 'A CONFIRMAR'],
  carla25: ['Sábado 25/07', 'Encuentro con Vecinos Carla Muestra, Flores', '11:00h', 'Rivadavia 7000, Plaza'],
  macri11: ['Martes 11/08', 'Encuentro "1 a 1" Jorge Macri, Villa Riachuelo', '18:00h', 'Av. General Paz 100, Club'],
  macri13: ['Jueves 13/08', 'Encuentro con Vecinos Jorge Macri, Flores', '18:00h', 'Rivadavia 7000, Plaza'],
  macri13b: ['Jueves 13/08', 'Encuentro con Vecinos Jorge Macri, Flores', '19:00h', 'Rivadavia 7000, Plaza'],
  macri14: ['Viernes 14/08', 'Encuentro con Vecinos Jorge Macri, Caballito', '18:00h', 'Av. Rivadavia 5000, Club'],
  diego16: ['Miércoles 16/09', 'Encuentro con Vecinos Diego Ficticio y Ana Prueba, Flores (NO PARTICIPA)', '18:00h', 'Rivadavia 7000, Plaza'],
  ana17: ['Jueves 17/09', 'Encuentro con Vecinos Ana Prueba, Recoleta', 'A CONFIRMAR', 'Av. Santa Fe 1234, Club'],
  carla18: ['Viernes 18/09', 'Encuentro con Vecinos Carla Muestra, Flores', '17:00h', 'Rivadavia 7000, Plaza'],
  diego12: ['Lunes 12/10', 'Encuentro con Vecinos Diego Ficticio, Caballito', '18:00h', 'Av. Rivadavia 5000, Club'],
  bruno13: ['Martes 13/10', 'Encuentro con Vecinos Bruno Ensayo, Palermo', '18:00h', 'Gorriti 4000, Centro Cultural'],
  ana16: ['Viernes 16/10', 'Encuentro con Vecinos Ana Prueba, Recoleta', '19:00h', 'Av. Santa Fe 1234, Club']
};
const P = function (k) { return plano.apply(null, R[k]); };
const H = function (k, st) { return bloque(R[k][0], R[k][1], R[k][2], R[k][3], st); };
const AMARILLO = 'background-color:rgb(255, 255, 0)';
const ROJO = 'background:red none repeat scroll 0% 0%';
const TODO = function (s) { return { dia: s, ev: s, hora: s, lugar: s }; };

const NOTA_BRUNO = 'Actualizo: CAMBIO DE DÍA DE LA REUNIÓN DE BRUNO, CON LUGAR Y HORARIO A CONFIRMAR';
const MAILS = [
  // 20/07: la v1 de la semana del 20/07 (sin HTML)
  { id: 'm1', hilo: 'h1', fecha: new D(2026, 6, 18, 10, 0), asunto: CM('20/07', '25/07'), cuerpo: texto([P('ana21'), P('bruno23')]) },
  // 22/07: la v2 (completa). Bruno pasa al 24/07 (AMARILLO, con la nota arriba) y Carla 25/07 se agrega (VERDE, en una tabla con bgcolor)
  { id: 'm2', hilo: 'h2', fecha: new D(2026, 6, 22, 10, 0), asunto: CM('20/07', '25/07'),
    cuerpo: texto([[NOTA_BRUNO, ''], P('ana21'), P('bruno24'), P('carla25')]),
    html: ENVOLTORIO('<div>' + NOTA_BRUNO + '</div><br>' + H('ana21') + H('bruno24', TODO(AMARILLO)) +
      '<table><tr><td bgcolor="#b6d7a8"><b>Sábado 25/07</b></td></tr><tr><td bgcolor="#b6d7a8">Evento: Encuentro con Vecinos Carla Muestra, Flores</td></tr>' +
      '<tr><td bgcolor="#b6d7a8">Hora: 11:00h</td></tr><tr><td bgcolor="#b6d7a8">Lugar: Rivadavia 7000, Plaza</td></tr></table>') },
  // 07/08: JM, semana del 10/08. Macri 11/08 Villa Riachuelo TODO EN ROJO; Macri 14/08, con el TEXTO rojo (<font color>)
  { id: 'm3', hilo: 'h3', fecha: new D(2026, 7, 7, 10, 0), asunto: JM('10/08', '15/08'),
    cuerpo: texto([P('macri11'), P('macri13'), P('macri14')]),
    html: ENVOLTORIO(H('macri11', TODO(ROJO)) + H('macri13') +
      '<div><b>Viernes 14/08</b></div><div><font color="#ff0000">Evento: Encuentro con Vecinos Jorge Macri, Caballito</font></div><div>Hora: 18:00h</div>' +
      '<div>Lugar: Av. Rivadavia 5000, Club</div>') },
  // 10/08: un "RE:" (Gmail) que cambia la hora de Macri 13/08; lo citado (el 11/08 en rojo) no es de este mail
  { id: 'm4', hilo: 'h3', fecha: new D(2026, 7, 10, 9, 0), asunto: 'RE: ' + JM('10/08', '15/08'),
    cuerpo: texto([['Actualizo: cambio de horario de la del jueves', ''], P('macri13b')]),
    html: '<div dir="ltr"><div>Actualizo: cambio de horario de la del jueves</div><br>' + H('macri13b', { hora: AMARILLO }) +
          '<div class="gmail_quote"><div>El vie, 7 ago 2026 a las 10:00, Persona Inventada escribió:</div><blockquote>' + H('macri11', TODO(ROJO)) + '</blockquote></div></div>' },
  // 14/09: Carla 18/09 en <mark> (VERDE no: <mark> es amarillo) → se usa un <p> con clase de <style> para el verde;
  // la conjunta con "(NO PARTICIPA)" al final; Ana 17/09 con "Hora: A CONFIRMAR"
  { id: 'm5', hilo: 'h5', fecha: new D(2026, 8, 14, 10, 0), asunto: CM('14/09', '19/09'),
    cuerpo: texto([P('diego16'), P('ana17'), P('carla18')]),
    html: '<html><head><style>.verde { background-color: #93C47D } p { margin: 0 }</style></head><body>' + H('diego16') + H('ana17') +
          '<p class="verde"><b>Viernes 18/09</b></p><p class="verde">Evento: Encuentro con Vecinos Carla Muestra, Flores</p>' +
          '<p class="verde">Hora: 17:00h</p><p class="verde">Lugar: Rivadavia 7000, Plaza</p></body></html>' },
  // 09/10: Bruno 13/10 con el LUGAR amarillo (<mark>); Diego 12/10 en rojo claro (y la base dice que se hizo: alerta); Ana 16/10 sin color
  { id: 'm6', hilo: 'h6', fecha: new D(2026, 9, 9, 10, 0), asunto: CM('12/10', '17/10'),
    cuerpo: texto([P('diego12'), P('bruno13'), P('ana16')]),
    html: ENVOLTORIO(H('diego12', TODO('background-color:#f4cccc')) +
      '<div><b>Martes 13/10</b></div><div>Evento: Encuentro con Vecinos Bruno Ensayo, Palermo</div><div>Hora: 18:00h</div>' +
      '<div>Lugar: <mark>Gorriti 4000, Centro Cultural</mark></div><br>' + H('ana16')) },
  // un mail viejo (antes de los 3 meses): no se lee
  { id: 'm0', hilo: 'h0', fecha: new D(2026, 5, 1, 10, 0), asunto: CM('01/06', '06/06'), cuerpo: texto([P('ana21')]), html: H('ana21', TODO(ROJO)) }
];

function montar() {
  const E = crearEntorno();
  const cfg = function (n) { return vm.runInContext(n, E.ctx); };
  const Rw = function (o) { return fila(Object.assign({ EVENTO: 'Encuentro con Vecinos' }, o)); };
  const filas = [HDR,
    Rw({ Figura: 'Ana Prueba', Barrio: 'Recoleta', FECHA: F(21, 7), HORA: '18:00', 'STATUS REUNIÓN': 'Realizada', Asistentes: 30 }),       // 2
    Rw({ Figura: 'Bruno Ensayo', Barrio: 'Palermo', FECHA: F(24, 7), HORA: '18:30', 'STATUS REUNIÓN': 'Realizada', Asistentes: 25 }),     // 3
    Rw({ Figura: 'Carla Muestra', Barrio: 'Flores', FECHA: F(25, 7), HORA: '11:00', 'STATUS REUNIÓN': 'Realizada', Asistentes: 20 }),     // 4
    Rw({ Figura: 'Jorge Macri', Barrio: 'Flores', FECHA: F(13, 8), HORA: '19:00', 'STATUS REUNIÓN': 'Realizada', Asistentes: 40 }),       // 5
    Rw({ Figura: 'Jorge Macri', Barrio: 'Villa Riachuelo', FECHA: F(27, 8), HORA: '18:00', EVENTO: 'Encuentro "1 a 1"', 'STATUS REUNIÓN': 'Realizada', Asistentes: 50 }), // 6
    Rw({ Figura: 'Jorge Macri', Barrio: 'Caballito', FECHA: F(14, 8), HORA: '18:00', 'STATUS REUNIÓN': 'Suspendida' }),                   // 7
    Rw({ Figura: 'Diego Ficticio', Barrio: 'Flores', FECHA: F(16, 9), HORA: '18:00', 'STATUS REUNIÓN': 'Realizada', Asistentes: 15 }),    // 8
    Rw({ Figura: 'Ana Prueba', Barrio: 'Recoleta', FECHA: F(17, 9), HORA: '', 'STATUS REUNIÓN': 'Suspendida' }),                         // 9
    Rw({ Figura: 'Carla Muestra', Barrio: 'Flores', FECHA: F(18, 9), HORA: '17:00', 'STATUS REUNIÓN': 'Realizada', Asistentes: 22 }),     // 10
    Rw({ Figura: 'Diego Ficticio', Barrio: 'Caballito', FECHA: F(12, 10), HORA: '18:00', 'STATUS REUNIÓN': 'Realizada', Asistentes: 20 }), // 11
    Rw({ Figura: 'Bruno Ensayo', Barrio: 'Palermo', FECHA: F(13, 10), HORA: '18:00', 'STATUS REUNIÓN': 'Realizada', Asistentes: 18 }),   // 12
    Rw({ Figura: 'Ana Prueba', Barrio: 'Recoleta', FECHA: F(16, 10), HORA: '19:00', 'STATUS REUNIÓN': 'en agenda' })                      // 13
  ];
  const DEST = cfg('RDV_SS_DESTINO');
  E.poner(DEST, cfg('RDV_HOJA_DESTINO'), filas);
  E.poner(DEST, 'Comunas', [['Barrio', 'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona', 'Eje geográfico']]
    .concat(BARRIOS.map(function (b) { return [b[0], b[1], 1, 1, 1, 1, 1, 'Centro', '']; })));
  // la lista de IDs (planilla 6): una fila de grupos arriba del encabezado
  const IDS = cfg('RDV_SS_IDS');
  E.poner(IDS, cfg('IDS_SOLAPA_JM'), [['', 'Encuentros', '', '', 'Fechas', ''], ['ID', 'Funcionario', 'Barrio / Comuna', 'Tipo', 'Fecha', 'Fecha de envío'],
    ['9001-AGOVR', 'Jorge Macri', 'Villa Riachuelo', '1 a 1', F(27, 8), F(20, 8)],
    ['9002-AGOFL', 'Jorge Macri', 'Flores', 'Encuentro con vecinos', F(13, 8), F(6, 8)]]);
  E.poner(IDS, cfg('IDS_SOLAPA_FUNCIONARIOS'), [['', 'Encuentros', '', 'Fechas', ''], ['ID', 'Funcionario', 'Barrio / Comuna', 'Fecha', 'Fecha de envío'],
    ['9101-SEPFL', 'Carla Muestra', 'Flores', F(18, 9), F(11, 9)],
    ['9102-OCTCA', 'Diego Ficticio', 'Caballito', F(12, 10), F(5, 10)]]);
  const porHilo = {};
  MAILS.forEach(function (m) { (porHilo[m.hilo] = porHilo[m.hilo] || []).push(m); });
  E.hilos = Object.keys(porHilo).map(function (k) { return { id: k, mensajes: porHilo[k] }; });
  E.escrituras = [];
  return E;
}

let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }

// ============================== escenarios ==============================

console.log('[0] los colores, sueltos');
let E = montar();
const col = function (v) { return E.run('JSON.stringify(_colorColMail_(' + JSON.stringify(v) + '))'); };
const fam = function (v) { const c = JSON.parse(col(v)); return c ? (c.blanco ? 'BLANCO' : c.familia) : null; };
ok(fam('#ff0') === 'AMARILLO' && fam('yellow') === 'AMARILLO' && fam('rgb(255, 255, 0)') === 'AMARILLO' && fam('#fff2cc') === 'AMARILLO', 'amarillo: #ff0, yellow, rgb(), #fff2cc (el claro de Docs)');
ok(fam('#00FF00') === 'VERDE' && fam('lime') === 'VERDE' && fam('#b6d7a8') === 'VERDE' && fam('#93c47d') === 'VERDE', 'verde: #00FF00, lime, #b6d7a8, #93c47d');
ok(fam('red') === 'ROJO' && fam('#f4cccc') === 'ROJO' && fam('rgba(255,0,0,0.5)') === 'ROJO' && fam('#e06666') === 'ROJO', 'rojo: red, #f4cccc, rgba(), #e06666');
ok(fam('#ff9900') === 'OTRO' && fam('#cfe2f3') === 'OTRO', 'naranja y celeste: OTRO');
ok(fam('transparent') === null && fam('inherit') === null && fam('none') === null && fam('rgba(255,0,0,0)') === null, 'transparente / inherit / none / alfa 0: sin color');
ok(fam('#ffffff') === 'BLANCO' && fam('white') === 'BLANCO' && fam('rgb(250,250,250)') === 'BLANCO', 'blanco y casi blanco: no es un resaltado');

console.log('[1] la auditoría completa');
E = montar();
let r = E.run('coloresMail()');
const L = E.logs.join('\n');
if (process.env.VER_LOG) console.log(L);
ok(r && r.errores.length === 0, 'ninguna sección falló' + (r && r.errores.length ? ': ' + r.errores.join(' | ') : ''));
ok(E.escrituras.length === 0, 'NO ESCRIBIÓ NADA (ni planillas, ni Gmail, ni propiedades): ' + JSON.stringify(E.escrituras.slice(0, 5)));
ok(E.gmail === 6, 'una lectura de HTML por mensaje (6 en la ventana; el del 01/06 no se lee): ' + E.gmail);

console.log('[2] la paleta');
const pal = function (raw) { return r.paleta.filter(function (x) { return x.raw === raw; })[0] || {}; };
ok(pal('rgb(255, 255, 0)').familia === 'AMARILLO' && pal('rgb(255, 255, 0)').hex === '#ffff00', 'el amarillo de Bruno, con su valor crudo y el hex');
ok(pal('#b6d7a8').familia === 'VERDE' && pal('#93c47d').familia === 'VERDE', 'el verde por bgcolor (<td>) y por una clase de <style>');
ok(pal('red').familia === 'ROJO' && pal('#f4cccc').familia === 'ROJO', 'el rojo por "background:" (shorthand) y el rojo claro');
ok(pal('yellow').familia === 'AMARILLO', '<mark> sin estilo: amarillo');
ok(!r.paleta.some(function (x) { return x.raw === '#ffffff' || x.raw === 'transparent'; }), 'el blanco y el transparente del envoltorio no cuentan');
ok(r.colorTexto.length === 1 && r.colorTexto[0].familia === 'ROJO' && /TEXTO ROJO \(aparte del fondo\): 1/.test(L), 'el texto rojo (<font color>) va aparte: Macri 14/08');
ok(/COLOR DEL TEXTO \(aparte/.test(L) && /#ff0000 → #ff0000 \| ROJO \(rojo\)/.test(L), 'y el log lo lista con su valor');
const reu = function (re) { return r.reuniones.filter(function (x) { return re.test(x.reunion); }); };
ok(reu(/Bruno Ensayo/).some(function (x) { return x.familia === 'AMARILLO' && /Evento AMARILLO .*\(entera\)/.test(x.campos); }), 'Bruno 24/07: amarillo, la línea Evento entera');
ok(reu(/Bruno Ensayo/).some(function (x) { return /13\/10/.test(x.reunion) && x.familia === 'AMARILLO' && /Lugar AMARILLO/.test(x.campos) && !/Evento/.test(x.campos); }),
   'Bruno 13/10: sólo el LUGAR amarillo');
ok(reu(/Carla Muestra/).filter(function (x) { return x.familia === 'VERDE'; }).length === 2, 'Carla 25/07 y 18/09: verdes');
ok(!r.reuniones.some(function (x) { return /Ana Prueba/.test(x.reunion) && /21\/07/.test(x.reunion); }), 'Ana 21/07 (sin color) no es una reunión resaltada');
const macriRe = reu(/11\/08\/2026.*Jorge Macri/);
ok(macriRe.length === 1 && macriRe[0].familia === 'ROJO', 'Macri 11/08 en rojo UNA vez: lo citado en el "RE:" no cuenta (' + JSON.stringify(macriRe.map(function (x) { return x.mail; })) + ')');
ok(reu(/13\/08\/2026 19:00.*Jorge Macri/).some(function (x) { return x.familia === 'AMARILLO' && /^RE:/.test(x.asunto); }), 'el "RE:": Macri 13/08 con la hora amarilla (lo propio)');
ok(r.fuera.length === 0, 'sin color fuera de una reunión (la nota no está resaltada)');

console.log('[3] qué pasó con cada color');
const caso = function (f, re) { return (r.familias[f].casos || []).filter(function (c) { return re.test(c.reunion); })[0] || {}; };
const bru = caso('AMARILLO', /24\/07.*Bruno/);
ok(bru.antes === 'NUEVA (¿cambio de día?)' && bru.base === 'Realizada' && bru.despues === 'última versión', 'Bruno 24/07: nueva con cambio de día (estaba el 23/07), la base la tiene Realizada (' + JSON.stringify(bru) + ')');
ok(/¿CAMBIO DE DÍA\? en la v1 la figura estaba el 23\/07\/2026 18:30 y en ésta ya no/.test(L), 'el log dice el día anterior');
const carla = caso('VERDE', /25\/07.*Carla/);
ok(carla.antes === 'NUEVA' && carla.base === 'Realizada', 'Carla 25/07 (verde): NUEVA contra la v1 (' + JSON.stringify(carla) + ')');
const carla18 = caso('VERDE', /18\/09.*Carla/);
ok(carla18.antes === 'primera versión' && carla18.ids === 'ID misma fecha', 'Carla 18/09: primera versión de su semana; con ID la misma fecha');
const m11 = caso('ROJO', /11\/08.*Macri/);
ok(m11.base === 'SIN FILA' && m11.ids === 'ID otra fecha' && m11.despues === 'siguió igual', 'Macri 11/08 (rojo): sin fila ese día, ID de otra fecha, siguió en el mail (' + JSON.stringify(m11) + ')');
ok(/lista de IDs: \(mismo lugar\) 9001-AGOVR 27\/08\/2026 \(\+16 d\) "Villa Riachuelo"/.test(L), 'el ID del 1 a 1 de Villa Riachuelo, el 27/08 (+16 días)');
ok(/otras de la figura a ±14 días: .*fila 5 13\/08\/2026 Flores Realizada/.test(L), 'y las otras filas de la figura cerca');
const d12 = caso('ROJO', /12\/10.*Diego/);
ok(/Realizada/.test(d12.base) && /ROJO pero la base dice que se HIZO/.test(d12.alerta), 'Diego 12/10 (rojo claro), la base Realizada: ALERTA (' + JSON.stringify(d12) + ')');
ok(/=> ROJO: 2 reuniones → base: 1 SIN FILA, 1 Realizada \(!\)/.test(L) || /=> ROJO: 2 reuniones → base: 1 Realizada \(!\), 1 SIN FILA/.test(L), 'el resumen de la familia ROJO');
ok(/=> VERDE: 2 reuniones/.test(L) && /=> AMARILLO: 3 reuniones/.test(L), 'VERDE 2 y AMARILLO 3 (Bruno 24/07 y 13/10, Macri 13/08 del RE:)');
const m13 = caso('AMARILLO', /13\/08.*Macri/);
ok(m13.antes === 'cambió' && m13.base === 'Realizada', 'Macri 13/08 (hora amarilla en el RE:): CAMBIÓ contra la v1 (' + JSON.stringify(m13) + ')');

console.log('[4] el caso Macri 11/08 Villa Riachuelo');
ok(r.caso && r.caso.versiones.length === 1 && /color: ROJO/.test(r.caso.versiones[0]), 'una versión del mail lo trae, en rojo');
ok(/SIGUE en el estado final/.test(r.caso.estadoFinal), 'sigue en el mail (el "RE:" no lo saca)');
ok(r.caso.base.length === 0 && r.caso.baseBarrio.length === 1 && r.caso.baseBarrio[0] === 6, 'la base: sin fila el 11/08; la de Villa Riachuelo es la 6 (27/08)');
ok(r.caso.ids.length === 1 && /9001-AGOVR 27\/08\/2026/.test(r.caso.ids[0]) && r.caso.idsDelDia.length === 0, 'la lista de IDs: Villa Riachuelo el 27/08, nada el 11/08');

console.log('[5] las notas');
const nb = r.notas.filter(function (n) { return /CAMBIO DE DIA DE LA REUNION DE BRUNO|CAMBIO DE DÍA DE LA REUNIÓN DE BRUNO/.test(n.nota); })[0] || {};
ok(nb.grupo === 'CM y Ministros' && nb.palabras.some(function (p) { return /cambio de dia/.test(p); }) && nb.palabras.indexOf('a confirmar') >= 0,
   'la nota de Bruno: cambio de día y "a confirmar" (' + JSON.stringify(nb) + ')');
ok(r.notas.some(function (n) { return /cambio de horario/.test(n.nota) && n.palabras.some(function (p) { return /cambio de horario/.test(p); }); }), 'el "Actualizo: cambio de horario" del RE:');
ok(/\[MARCA: .*\] mail 22\/07 10:00 \| CM y Ministros, semana 20\/07 al 25\/07 \| nota: Actualizo: CAMBIO DE DÍA/.test(L), 'el log con la fecha, el grupo y la semana');

console.log('[6] "Hora: A CONFIRMAR" y "(NO PARTICIPA)"');
const h = r.horaAConfirmar;
ok(h.aConfirmar === 2 && h.parsean === 2 && h.horas.every(function (x) { return x === ''; }), 'Bruno 24/07 y Ana 17/09: hora "", y se parsean igual (' + JSON.stringify(h) + ')');
ok(/_horaAgenda_ \(41_AgendaParser\.js:623-630\)/.test(L), 'el log cita el parser');
const np = r.noParticipa;
ok(np.reuniones === 1 && np.alFinal === 1 && /NO participa: Ana Prueba/.test(np.ejemplos[0]) && /fila a nombre de: Diego Ficticio/.test(np.ejemplos[0]),
   'la conjunta: "(NO PARTICIPA)" al final, el parser se la asigna a Ana (la última nombrada); la fila va a Diego (' + JSON.stringify(np) + ')');

console.log('[7] el resumen');
ok(/=== RESUMEN de los colores del mail/.test(L) && /SECCIONES QUE FALLARON: 0/.test(L), 'el resumen');
ok(r.resumen.alertas.length === 1 && /Diego Ficticio/.test(r.resumen.alertas[0]), 'una alerta: el rojo de Diego que se hizo');

console.log('[8] una sección que falla no frena las otras');
E = montar();
E.romper = 'planilla ' + vm.runInContext('RDV_SS_IDS', E.ctx);
r = E.run('coloresMail()');
ok(r.errores.length === 1 && /lista de IDs/.test(r.errores[0]), 'falla sólo la lectura de la lista de IDs: ' + r.errores.join(' | '));
ok(r.familias.ROJO && r.familias.ROJO.reuniones === 2 && /lista no leída/.test(JSON.stringify(r.familias.ROJO.casos)) && /SECCIONES QUE FALLARON: 1/.test(E.logs.join('\n')),
   'las demás siguen (sin IDs) y el resumen lo dice');
ok(E.escrituras.length === 0, 'y tampoco escribió nada');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
