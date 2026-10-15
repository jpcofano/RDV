/**
 * tests/auditoria_cancelaciones.test.js — la AUDITORÍA DE CANCELACIONES (diagnostico/31_auditoria_cancelaciones.js), en
 * Node, con una base, un Gmail (texto plano + HTML), RDV CONJUNTO y "Agenda Directa" SIMULADOS. "Hoy" es el jueves 15/10/2026.
 *
 *     node tests/auditoria_cancelaciones.test.js          (VER_LOG=1 para ver el log)
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: figuras, direcciones, horarios y mails son
 * inventados; los barrios y las comunas son los públicos de la Ciudad.
 *
 * Toda planilla, rango, hilo y mensaje del mock es un Proxy: cualquier método que no sea de LECTURA queda anotado en
 * `E.escrituras`. La auditoría tiene que terminar con esa lista vacía.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', '05_Escritura.js', '20_UpsertDestino.js', '49_Corridas.js',
                  '41_AgendaColores.js', '41_AgendaParser.js', '42_BarriosCabaGeo.js', '40_Agenda.js', '47_AgendaVistas.js', '25_Elecciones.js',
                  'diagnostico/31_auditoria_cancelaciones.js'].filter(function (f) { return fs.existsSync(path.join(RAIZ, f)); });
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
  const E = { logs: [], escrituras: [], planillas: {}, romper: null };
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
        // las celdas combinadas (una lectura): las de la hoja que caen en el rango; `h.combinadasFallan` simula que no se pueden leer
        const combinadas = function () {
          if (h.combinadasFallan) throw new Error('no se pudieron leer las celdas combinadas (simulado)');
          return (h.combinadas || []).filter(function (m) { return m[0] >= f && m[0] < f + nf; }).map(function (m) {
            return { getRow: function () { return m[0]; }, getColumn: function () { return m[1]; }, getNumRows: function () { return m[2]; }, getNumColumns: function () { return m[3]; } };
          });
        };
        return proxyLectura(E, nombre + '!rango', { getValues: leer, getValue: function () { return leer()[0][0]; }, getMergedRanges: combinadas });
      }
    };
    h.proxy = proxyLectura(E, nombre, h.lect);
    return h;
  };
  E.planilla = function (id) {
    if (!E.planillas[id]) {
      const p = { hojas: {} };
      p.proxy = proxyLectura(E, 'planilla ' + id.slice(0, 6), {
        getSheetByName: function (n) { return p.hojas[n] ? p.hojas[n].proxy : null; },
        getSheets: function () { return Object.keys(p.hojas).map(function (k) { return p.hojas[k].proxy; }); },
        getName: function () { return 'planilla ' + id.slice(0, 6); }, getId: function () { return id; }
      });
      E.planillas[id] = p;
    }
    return E.planillas[id];
  };
  E.poner = function (id, nombre, v) { E.planilla(id).hojas[nombre] = E.hoja(nombre, v); return E.planilla(id).hojas[nombre]; };
  E.hilos = [];
  const mensaje = function (m) {
    return proxyLectura(E, 'mensaje', { getId: function () { return m.id; }, getDate: function () { return m.fecha; },
      getSubject: function () { return m.asunto; }, getPlainBody: function () { return m.cuerpo; }, getBody: function () { return m.html || ''; } });
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
const BARRIOS = [['Recoleta', 2], ['Palermo', 14], ['Almagro', 5], ['Boedo', 5], ['Flores', 7], ['Caballito', 6]];
const FIGURAS = ['Ana Prueba', 'Bruno Ensayo', 'Carla Muestra', 'Diego Ficticio', 'Elena Inventada', 'Fabio Simulado'];

const cuerpo = function (b) { return [].concat.apply([], b).join('\n'); };
const SEM1 = 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 21/09 al 26/09';
const SEM2 = 'Agenda Encuentros de vecinos con JM - Semana del 05/10 al 10/10';
const SEM3 = 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 12/10 al 17/10';
const SEM4 = 'Agenda Encuentros de vecinos con JM - Semana del 19/10 al 24/10';
const B = {
  ana22: ['*Martes 22/09*', 'Evento: Encuentro con Vecinos Ana Prueba, Recoleta', 'Hora: 18:00h', 'Lugar: Av. Santa Fe 1234, Club'],
  bruno23: ['*Miércoles 23/09*', 'Evento: Encuentro con Vecinos Bruno Ensayo, Palermo', 'Hora: 18:30h', 'Lugar: Serrano 1500, Plaza'],
  carla24: ['*Jueves 24/09*', 'Evento: Encuentro con Vecinos Carla Muestra, Flores', 'Hora: 19:00h', 'Lugar: Rivadavia 7000, Plaza'],
  carla25: ['*Viernes 25/09*', 'Evento: Encuentro con Vecinos Carla Muestra, Flores', 'Hora: 19:00h', 'Lugar: Rivadavia 7000, Plaza'],
  diego06: function (h) { return ['*Martes 06/10*', 'Evento: Encuentro con Vecinos Diego Ficticio, Flores', 'Hora: ' + h + 'h', 'Lugar: Rivadavia 7000, Plaza']; },
  elena08: ['*Jueves 08/10*', 'Evento: Encuentro con Vecinos Elena Inventada, Caballito', 'Hora: 19:00h', 'Lugar: Av. Rivadavia 5000, Club'],
  fabio14: ['*Miércoles 14/10*', 'Evento: Encuentro con Vecinos Fabio Simulado, Flores (SUSPENDIDA)', 'Hora: 18:00h', 'Lugar: Rivadavia 7000, Plaza'],
  ana16: ['*Viernes 16/10*', 'Evento: Encuentro con Vecinos Ana Prueba, Recoleta', 'Hora: 19:00h', 'Lugar: Av. Santa Fe 1234, Club'],
  diego20: ['*Martes 20/10*', 'Evento: Encuentro con Vecinos Diego Ficticio, Caballito', 'Hora: 18:00h', 'Lugar: Av. Rivadavia 5000, Club'],
  // Elena el lunes 21/09 (sale en la v2) y su reunión de la semana siguiente, que YA ESTABA en el mail de esa semana
  elena21: ['*Lunes 21/09*', 'Evento: Encuentro con Vecinos Elena Inventada, Caballito', 'Hora: 17:00h', 'Lugar: Av. Rivadavia 5000, Club'],
  elena29: ['*Martes 29/09*', 'Evento: Encuentro con Vecinos Elena Inventada, Caballito', 'Hora: 17:00h', 'Lugar: Av. Rivadavia 5000, Club'],
  diego26: ['*Sábado 26/09*', 'Evento: Encuentro con Vecinos Diego Ficticio, Flores', 'Hora: 11:00h', 'Lugar: Rivadavia 7000, Plaza'],
  // Bruno el 15/10: la hora vieja tachada y la nueva al lado (un CAMBIO, no una cancelación)
  bruno15: ['*Jueves 15/10*', 'Evento: Encuentro con Vecinos Bruno Ensayo, Palermo', 'Hora: 17:00 18:00h', 'Lugar: Serrano 1500, Plaza'],
  // "se pasa" solo: un cambio de lugar (señal débil)
  fabio21: ['*Miércoles 21/10*', 'Evento: Encuentro con Vecinos Fabio Simulado, Flores', 'Hora: 18:00h', 'Lugar: Se pasa al Club Social, Rivadavia 7100'],
  // una conjunta suspendida: Carla (sin fila ese día) y Ana (con OTRA reunión ese día, a otra hora y en otro lugar)
  conj23: ['*Viernes 23/10*', 'Evento: Encuentro con Vecinos Carla Muestra y Ana Prueba, Boedo (SUSPENDIDA)', 'Hora: 18:00h', 'Lugar: Boedo 900, Club']
};
// El HTML del mail de la semana del 12/10: Fabio dice SUSPENDIDA; Ana del 16/10, TACHADA ENTERA (<s> y line-through); Bruno del
// 15/10, sólo la hora vieja tachada.
const HTML_SEM3 = '<div dir="ltr"><div><b>Mi&eacute;rcoles 14/10</b></div>' +
  '<div>Evento: Encuentro con Vecinos Fabio Simulado, Flores (SUSPENDIDA)</div><div>Hora: 18:00h</div><div>Lugar: Rivadavia 7000, Plaza</div><br>' +
  '<div><b>Jueves 15/10</b></div><div>Evento: Encuentro con Vecinos Bruno Ensayo, Palermo</div><div>Hora: <s>17:00</s> 18:00h</div>' +
  '<div>Lugar: Serrano 1500, Plaza</div><br>' +
  '<div><b>Viernes 16/10</b></div><div><s>Evento: Encuentro con Vecinos Ana Prueba, Recoleta</s></div>' +
  '<div><span style="text-decoration: line-through;">Hora: 19:00h</span></div><div>Lugar: Av. Santa Fe 1234, Club</div></div>';
// Un "RE:" de Outlook: lo propio (Diego 20/10, igual) y, debajo del borde de Outlook y el bloque De/Enviado, la versión VIEJA
// citada con una reunión TACHADA (Carla 22/10). Lo citado no es de este mail: no es una cancelación.
const HTML_RE_OUTLOOK = '<html><head><style>p{margin:0}</style></head><body><div class="WordSection1">' +
  '<p>Actualizo:</p><p><b>Martes 20/10</b></p><p>Evento: Encuentro con Vecinos Diego Ficticio, Caballito</p><p>Hora: 18:00h</p>' +
  '<p>Lugar: Av. Rivadavia 5000, Club</p>' +
  '<div style="border:none;border-top:solid #E1E1E1 1.0pt;padding:3.0pt 0cm 0cm 0cm"><p><b>De:</b> Persona Inventada<br><b>Enviado:</b> ' +
  'miércoles, 14 de octubre de 2026 10:00<br><b>Para:</b> Equipo<br><b>Asunto:</b> ' + SEM4 + '</p></div>' +
  '<p><b>Jueves 22/10</b></p><p><s>Evento: Encuentro con Vecinos Carla Muestra, Boedo</s></p><p><s>Hora: 18:00h</s></p></div></body></html>';
const MAILS = [
  { id: 'm7', hilo: 'h7', fecha: new D(2026, 8, 19, 10, 0), asunto: 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 28/09 al 03/10',
    cuerpo: cuerpo([B.elena29]) },
  { id: 'm1', hilo: 'h1', fecha: new D(2026, 8, 18, 10, 0), asunto: SEM1, cuerpo: cuerpo([B.elena21, B.ana22, B.bruno23, B.carla24, B.diego26]) },
  // la v2, COMPLETA: Ana del 22/09 y Elena del 21/09 desaparecen (futuras) y Carla pasa del 24 al 25/09
  { id: 'm2', hilo: 'h2', fecha: new D(2026, 8, 20, 10, 0), asunto: SEM1, cuerpo: cuerpo([B.bruno23, B.carla25, B.diego26]) },
  { id: 'm3', hilo: 'h3', fecha: new D(2026, 9, 1, 10, 0), asunto: SEM2, cuerpo: cuerpo([B.diego06('18:00'), B.elena08]) },
  // el "Re:" sólo trae a Diego con otra hora: NO saca a Elena
  { id: 'm4', hilo: 'h3', fecha: new D(2026, 9, 3, 9, 0), asunto: 'Re: ' + SEM2, cuerpo: cuerpo([['Actualizo:'], B.diego06('18:30')]) },
  { id: 'm5', hilo: 'h5', fecha: new D(2026, 9, 9, 10, 0), asunto: SEM3, cuerpo: cuerpo([B.fabio14, B.bruno15, B.ana16]), html: HTML_SEM3 },
  { id: 'm6', hilo: 'h6', fecha: new D(2026, 9, 14, 10, 0), asunto: SEM4, cuerpo: cuerpo([B.diego20, B.fabio21, B.conj23]) },
  { id: 'm8', hilo: 'h6', fecha: new D(2026, 9, 15, 8, 0), asunto: 'RE: ' + SEM4, html: HTML_RE_OUTLOOK,
    cuerpo: cuerpo([['Actualizo:'], B.diego20, ['________________________________', 'De: Persona Inventada', 'Enviado: miércoles, 14 de octubre de 2026 10:00',
                    'Asunto: ' + SEM4, '', '*Jueves 22/10*', 'Evento: Encuentro con Vecinos Carla Muestra, Boedo', 'Hora: 18:00h']]) }
];

function montar() {
  const E = crearEntorno();
  const cfg = function (n) { return vm.runInContext(n, E.ctx); };
  const filas = [HDR];
  FIGURAS.forEach(function (fig, i) {   // historial de agosto (fuera del período): así las figuras se conocen
    filas.push(fila({ Figura: fig, Barrio: BARRIOS[i][0], FECHA: F(10 + i, 8), HORA: '18:00', EVENTO: 'Encuentro con Vecinos', 'STATUS REUNIÓN': 'Realizada', Inscriptos: 50, Asistentes: 30 }));
  });
  const R = function (o) { return fila(Object.assign({ EVENTO: 'Encuentro con Vecinos' }, o)); };
  filas.push(R({ Figura: 'Ana Prueba', Barrio: 'Recoleta', FECHA: F(22, 9), HORA: '18:00', 'Dirección': 'Av. Santa Fe 1234, Club', 'STATUS REUNIÓN': 'Suspendida' }));        // 8
  filas.push(R({ Figura: 'Bruno Ensayo', Barrio: 'Palermo', FECHA: F(23, 9), HORA: '18:30', 'Dirección': 'Serrano 1500, Plaza', 'STATUS REUNIÓN': 'Realizada', Asistentes: 40 })); // 9
  filas.push(R({ Figura: 'Carla Muestra', Barrio: 'Flores', FECHA: F(25, 9), HORA: '19:00', 'Dirección': 'Rivadavia 7000, Plaza', 'STATUS REUNIÓN': 'Realizada', Asistentes: 30 })); // 10
  filas.push(R({ Figura: 'Diego Ficticio', Barrio: 'Flores', FECHA: F(6, 10), HORA: '18:30', 'STATUS REUNIÓN': 'Realizada', Asistentes: 25 }));       // 11
  filas.push(R({ Figura: 'Elena Inventada', Barrio: 'Caballito', FECHA: F(8, 10), HORA: '19:00', 'STATUS REUNIÓN': 'Realizada', Asistentes: 20 }));   // 12
  filas.push(R({ Figura: 'Fabio Simulado', Barrio: 'Flores', FECHA: F(14, 10), HORA: '18:00', 'STATUS REUNIÓN': 'en agenda' }));                    // 13
  filas.push(R({ Figura: 'Ana Prueba', Barrio: 'Recoleta', FECHA: F(16, 10), HORA: '19:00', 'STATUS REUNIÓN': 'en agenda' }));                       // 14
  filas.push(R({ Figura: 'Diego Ficticio', Barrio: 'Caballito', FECHA: F(20, 10), HORA: '18:00', 'STATUS REUNIÓN': 'en agenda' }));                   // 15
  filas.push(R({ Figura: 'Carla Muestra', Barrio: 'Boedo', FECHA: F(9, 10), HORA: '18:00', 'STATUS REUNIÓN': 'en agenda' }));                        // 16: vencida
  filas.push(R({ Figura: 'Elena Inventada', Barrio: 'Caballito', FECHA: F(21, 9), HORA: '17:00', 'STATUS REUNIÓN': 'Suspendida' }));                // 17
  filas.push(R({ Figura: 'Elena Inventada', Barrio: 'Caballito', FECHA: F(29, 9), HORA: '17:00', 'Dirección': 'Av. Rivadavia 5000, Club',
                 'STATUS REUNIÓN': 'Realizada', Asistentes: 15 }));                                                                                     // 18: otra reunión
  filas.push(R({ Figura: 'Bruno Ensayo', Barrio: 'Palermo', FECHA: F(15, 10), HORA: '18:00', 'STATUS REUNIÓN': 'en agenda' }));                     // 19
  filas.push(R({ Figura: 'Fabio Simulado', Barrio: 'Flores', FECHA: F(21, 10), HORA: '18:00', 'STATUS REUNIÓN': 'en agenda' }));                    // 20
  filas.push(R({ Figura: 'Ana Prueba', Barrio: 'Recoleta', FECHA: F(23, 10), HORA: '10:00', 'Dirección': 'Av. Santa Fe 1234, Club', 'STATUS REUNIÓN': 'en agenda' })); // 21
  const DEST = cfg('RDV_SS_DESTINO'), COPIA = cfg('AGENDA_COPIA_SS');
  E.poner(DEST, cfg('RDV_HOJA_DESTINO'), filas);
  E.poner(DEST, 'Comunas', [['Barrio', 'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona', 'Eje geográfico']]
    .concat(BARRIOS.map(function (b) { return [b[0], b[1], 1, 1, 1, 1, 1, 'Centro', '']; })));
  // RDV CONJUNTO: "Apellido Nombre", con una columna "Estado"
  E.poner(DEST, 'RDV CONJUNTO', [['Figura', 'Barrio', 'FECHA', 'Asistentes', 'Oradores anotados', 'Oradores que hablaron', 'Dirección', 'Estado'],
    ['Prueba Ana', 'Recoleta', F(22, 9), '', '', '', 'Av. Santa Fe 1234', 'Suspendida'],
    ['Ensayo Bruno', 'Palermo', F(23, 9), '', '', '', 'Serrano 1500', 'Suspendida'],     // la base dice Realizada: CONTRADICTORIA
    ['Ficticio Diego', 'Flores', F(6, 10), 25, '', '', 'Rivadavia 7000', 'Realizada'],
    ['Muestra Carla', 'Boedo', F(9, 10), '', '', '', 'Boedo 900', 'Programado'],
    ['Simulado Fabio', 'Flores', F(2, 10), '', '', '', 'Rivadavia 7000', 'Cancelada'],  // sin fila en la base
    ['Inventada Elena', 'Caballito', F(30, 10), '', '', '', 'x', 'Reprogramada']]);   // fuera del período
  // AGENDA_DUPLICADOS: la cancelación de Ana 22/09, ya elegida
  const enc = vm.runInContext('ENC_DUPLICADOS_AGENDA_', E.ctx).slice();
  const dup = function (o) { return enc.map(function (h) { return o[h] == null ? '' : o[h]; }); };
  E.poner(DEST, cfg('AGENDA_SOLAPA_DUPLICADOS'), [enc,
    dup({ ELEGIR: 'Se canceló: suspender/borrar', resultado: 'aplicado', tipo: 'cancelación', 'reunión del mail': '22/09/2026 18:00 | Ana Prueba',
          id_reunion: 'cancelacion|ana prueba|20260922|18:00', id_fila: 'ana prueba|20260922|recoleta' })]);
  // "Agenda Directa": dos filas de encabezado (grupos combinados), renglones de día, casillas; a la derecha de CANCELACIÓN, una
  // columna "Comentarios" con texto (no es CANCELACIÓN)
  const g1 = ['Info', 'Implementador', 'CONVOCATORIA', '', '', '', 'CONFIRMACIÓN', '', 'POST', '', 'CANCELACIÓN', '', ''];
  const g2 = ['', '', 'Hecho', 'Ok Sol', 'Programado', 'IVR', 'Ok Sol', 'Programado', 'Ok Sol', 'Programado', 'Ok Sol', 'Programado', 'Comentarios'];
  const casillas = function (cancelOk, cancelProg, comentario) {
    return [false, false, false, false, false, false, false, false, cancelOk, cancelProg, comentario || ''];
  };
  const vacia = function (t) { return [t, '', '', '', '', '', '', '', '', '', '', '', '']; };
  const directa = E.poner(COPIA, 'Agenda Directa', [g1, g2,
    // antes del primer renglón de día: CANCELACIÓN marcada, sin día reconocido
    ['Evento: Encuentro con Vecinos Ana Prueba, Recoleta\nHora: 09:00h', 'Nadie'].concat(casillas(true, false)),
    vacia('martes 20/10'),
    ['Evento: Encuentro con Vecinos Diego Ficticio, Caballito\nHora: 18:00h\nLugar: Av. Rivadavia 5000, Club', 'Juan Inventado'].concat(casillas(true, false, 'llamar a la sede')),
    vacia('miércoles 21 de octubre'),
    // Implementador escrito como un día (no es un renglón de día); CANCELACIÓN Programado con un texto que no es marca; Comentarios con texto
    ['Evento: Encuentro con Vecinos Fabio Simulado, Flores\nHora: 18:00h', 'lunes 19/10'].concat(casillas(false, 'pendiente', 'se suspende?'))]);
  directa.combinadas = [[1, 3, 1, 4], [1, 7, 1, 2], [1, 9, 1, 2], [1, 11, 1, 2], [1, 1, 2, 1], [1, 2, 2, 1]];
  const porHilo = {};
  MAILS.forEach(function (m) { (porHilo[m.hilo] = porHilo[m.hilo] || []).push(m); });
  E.hilos = Object.keys(porHilo).map(function (k) { return { id: k, mensajes: porHilo[k] }; });
  E.escrituras = [];
  return E;
}

let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }
const de = function (r, fuente, fila) { return r.hallazgos.filter(function (h) { return h.fuente === fuente && (fila == null || h.fila === fila); }); };

// ============================== escenarios ==============================

console.log('[1] la auditoría completa');
let E = montar();
let r = E.run('auditoriaCancelaciones()');
const L = E.logs.join('\n');
if (process.env.VER_LOG) console.log(L);
ok(r && r.errores.length === 0, 'ninguna sección falló' + (r && r.errores.length ? ': ' + r.errores.join(' | ') : ''));
ok(E.escrituras.length === 0, 'NO ESCRIBIÓ NADA (ni planillas, ni Gmail, ni propiedades): ' + JSON.stringify(E.escrituras.slice(0, 5)));

console.log('[2] desaparecidas del mail');
const ana22 = de(r, 'mail (desapareció)', 8)[0] || {};
ok(ana22.veredicto === 'REFLEJADA' && ana22.dice === 'cancelada', 'Ana 22/09: desapareció en la v2 siendo futura; la base dice Suspendida → REFLEJADA (' + JSON.stringify(ana22) + ')');
ok(/\[REFLEJADA\] 22\/09\/2026 18:00 \| Ana Prueba.*la sacó la v2 \(mail completo del 20\/09 10:00.*futura al desaparecer: sí \| ¿se movió\?: no/.test(L),
   'el log dice la versión que la sacó, que era futura y que no se movió');
ok(/AGENDA_DUPLICADOS: línea 2 \(cancelación\): ELEGIR "Se canceló: suspender\/borrar"/.test(L), 'y lo que dice AGENDA_DUPLICADOS');
const carla = de(r, 'mail (desapareció)').filter(function (h) { return /24\/09\/2026/.test(h.reunion); })[0] || {};
ok(carla.dice === 'reprogramada' && carla.veredicto === 'REFLEJADA', 'Carla 24/09 → 25/09: reprogramada, y la base la tiene en la fecha nueva (' + JSON.stringify(carla) + ')');
ok(/¿se movió\?: sí, al 25\/09\/2026 19:00 \(misma semana, nueva, misma hora y mismo lugar\)/.test(L), 'el log dice a qué fecha se movió y por qué');
ok(!de(r, 'mail (desapareció)').some(function (h) { return /08\/10\/2026.*Elena/.test(h.reunion); }), 'el "Re:" que no trae a Elena 08/10 NO la hace desaparecer');
ok(/08\/10\/2026 19:00 \| Elena Inventada.*no está en "Re: Agenda.*SIGUE/.test(L), 'y el log lo dice: falta en el "Re:" pero sigue');
const ele = de(r, 'mail (desapareció)', 17)[0] || {};
ok(ele.dice === 'cancelada' && ele.veredicto === 'REFLEJADA', 'Elena 21/09: su reunión del 29/09 YA ESTABA en el mail de esa semana → NO es reprogramación (' + JSON.stringify(ele) + ')');
ok(/\[REFLEJADA\] 21\/09\/2026 17:00 \| Elena Inventada.*¿se movió\?: sin reprogramación clara/.test(L) &&
   /sin reprogramación clara: 29\/09\/2026 17:00 ya estaba en la primera versión de su semana \(no es nueva\)/.test(L), 'y el log dice por qué no');
ok(!r.resumen.yaRefleja.concat(r.resumen.dudosas).some(function (t) { return /fila 18/.test(t); }), 'la fila 18 (la otra reunión de Elena) no se usa como "la fecha nueva"');

console.log('[3] marcadas en el mail');
const fab = de(r, 'mail (palabra)', 13)[0] || {};
ok(fab.veredicto === 'NO REFLEJADA' && /suspendid/.test(fab.detalle), 'Fabio 14/10: "SUSPENDIDA" en el evento, la base "en agenda" → NO REFLEJADA');
const tach = de(r, 'mail (tachada)', 14)[0] || {};
ok(tach.veredicto === 'NO REFLEJADA', 'Ana 16/10: TACHADA en el HTML, la base "en agenda" → NO REFLEJADA (' + JSON.stringify(tach) + ')');
ok(r.tachado.mails === 1 && r.tachado.reuniones.length === 1 && /Evento \(entera\) "Encuentro con Vecinos Ana Prueba, Recoleta"/.test(r.tachado.reuniones[0].campos.join()) &&
   /Hora \(entera\) "19:00h"/.test(r.tachado.reuniones[0].campos.join()), 'un mail con tachado, una reunión tachada entera (evento y hora): ' + JSON.stringify(r.tachado.reuniones));
ok(/getPlainBody\(\) \(41_AgendaParser\.js, leerMailsAgendaGmail_\): el texto plano NO trae el tachado/.test(L) && /el tachado SE PIERDE/.test(L) &&
   /que el texto plano trae SIN marca: 3/.test(L), 'el log dice que el parser pierde el tachado (y que el texto plano lo trae sin marca)');
ok(!r.tachado.reuniones.some(function (t) { return /Fabio/.test(t.reunion); }), 'Fabio no está tachado');
// ALTA 1: tachar sólo la hora vieja y escribir la nueva al lado es un CAMBIO
ok(de(r, 'mail (tachada)', 19).length === 0 && r.tachado.cambios.length === 1 && /Bruno Ensayo/.test(r.tachado.cambios[0].reunion) &&
   /Hora \(parcial\) "17:00"/.test(r.tachado.cambios[0].campos.join()), 'Bruno 15/10: sólo la hora vieja tachada → CAMBIO TACHADO, no cancelación (' + JSON.stringify(r.tachado.cambios) + ')');
ok(/\[CAMBIO TACHADO\] 15\/10\/2026 17:00 \| Bruno Ensayo/.test(L) && /OJO: la agenda lee la hora TACHADA \(17:00\)/.test(L), 'y el log avisa que la agenda lee la hora tachada');
ok(r.cambios.some(function (c) { return c.tipo === 'cambio tachado' && c.filas[0] === 19; }), 'va a la lista de posibles cambios, no al resumen de cancelaciones');
// MEDIA 3: el "RE:" de Outlook cita la versión vieja con una reunión tachada: no es de este mail
ok(!r.tachado.reuniones.concat(r.tachado.cambios).some(function (t) { return /Carla Muestra/.test(t.reunion); }) &&
   !de(r, 'mail (tachada)').some(function (h) { return /22\/10/.test(h.reunion); }), 'el "RE:" de Outlook: lo tachado en la cita NO es una cancelación');
// BAJA 6: "se pasa" solo
ok(de(r, 'mail (palabra)', 20).length === 0 && r.cambios.some(function (c) { return /se pasa/.test(c.tipo) && c.filas[0] === 20; }) &&
   /\[POSIBLE CAMBIO\] 21\/10\/2026 18:00 \| Fabio Simulado \| .*señal DÉBIL/.test(L), 'Fabio 21/10 "Se pasa al Club Social": posible cambio (señal débil), no cancelación');
// BAJA 8: la conjunta suspendida; Ana tiene ese día OTRA reunión (otra hora y otro lugar): no es su fila
const conj = de(r, 'mail (palabra)').filter(function (h) { return /23\/10\/2026/.test(h.reunion); })[0] || {};
ok(conj.veredicto === 'SIN FILA' && conj.filas.length === 0, 'la conjunta Carla + Ana 23/10: la fila de Ana a las 10:00 en otro lugar NO es la suya → SIN FILA (' + JSON.stringify(conj) + ')');

console.log('[4] RDV CONJUNTO');
ok(/la columna de estado es "Estado" \(H, por encabezado\)/.test(L), 'la columna de estado, por encabezado');
const bru = de(r, 'RDV CONJUNTO', 9)[0] || {};
ok(bru.veredicto === 'CONTRADICTORIA', 'Bruno 23/09: RDV CONJUNTO "Suspendida", la base Realizada con Asistentes → CONTRADICTORIA');
ok((de(r, 'RDV CONJUNTO', 8)[0] || {}).veredicto === 'REFLEJADA', 'Ana 22/09: RDV CONJUNTO "Suspendida", la base Suspendida → REFLEJADA');
ok(de(r, 'RDV CONJUNTO').some(function (h) { return h.veredicto === 'SIN FILA' && /Simulado Fabio/.test(h.reunion); }), 'Fabio 02/10 "Cancelada": sin fila en la base');
ok(!de(r, 'RDV CONJUNTO').some(function (h) { return /Diego|Carla|Elena/.test(h.reunion); }), 'Realizada / Programado / fuera del período: no se listan');

console.log('[5] Agenda Directa');
ok(/encabezado en las filas 1 y 2 \| Info: A \| CANCELACIÓN: K "Ok Sol", L "Programado" \| el grupo, por las celdas combinadas/.test(L),
   'lee el encabezado de dos filas por las celdas combinadas (Comentarios, a la derecha, NO es CANCELACIÓN)');
const dir = de(r, 'Agenda Directa', 15)[0] || {};
ok(dir.veredicto === 'NO REFLEJADA' && /CANCELACIÓN: Ok Sol$/.test(dir.detalle), 'Diego 20/10: CANCELACIÓN marcada, la base "en agenda" → NO REFLEJADA (' + JSON.stringify(dir) + ')');
ok(de(r, 'Agenda Directa').length === 1, 'Fabio 21/10 ("pendiente" no es una marca; "Comentarios" no es CANCELACIÓN) no se lista');
ok(/\[SIN DÍA RECONOCIDO\] renglón 3 \| .*Ana Prueba.*CANCELACIÓN: Ok Sol/.test(L), 'una CANCELACIÓN sin renglón de día arriba: se dice');
ok(/con CANCELACIÓN marcada en el período: 1 \| marcadas sin día reconocido: 1/.test(L), '"miércoles 21 de octubre" es un día; "lunes 19/10" en Implementador no');
E = montar();
E.planilla(vm.runInContext('AGENDA_COPIA_SS', E.ctx)).hojas['Agenda Directa'].combinadasFallan = true;
r = E.run('auditoriaCancelaciones()');
const L5 = E.logs.join('\n');
ok(/CANCELACIÓN: K "Ok Sol", L "Programado" \| el grupo, no se pudieron leer las celdas combinadas/.test(L5) && de(r, 'Agenda Directa').length === 1 &&
   E.escrituras.length === 0, 'sin poder leer las combinadas: arrastra sólo sobre las sub-columnas conocidas (corta en "Comentarios")');
E = montar();
r = E.run('auditoriaCancelaciones()');

console.log('[6] filas vencidas');
ok(r.vencidas.length === 1 && r.vencidas[0].fila === 16, 'Carla 09/10 "en agenda" sin Asistentes: vencida (' + JSON.stringify(r.vencidas) + ')');
ok(!r.vencidas.some(function (v) { return v.fila === 13; }), 'Fabio 14/10 (hace 1 día) todavía no está vencida');

console.log('[7] el resumen');
const R = r.resumen;
ok(R.yaRefleja.some(function (t) { return /^fila 8 \|/.test(t) && /mail \(desapareció\).*RDV CONJUNTO/.test(t); }), 'YA LO REFLEJA: la fila 8 (el mail y RDV CONJUNTO juntos)');
ok(R.noRefleja.some(function (t) { return /^fila 13 \|/.test(t) && /mail \(palabra\)/.test(t); }) && R.noRefleja.some(function (t) { return /^fila 14 \|/.test(t) && /tachada/.test(t); }) &&
   R.noRefleja.some(function (t) { return /^fila 15 \|/.test(t) && /Agenda Directa/.test(t); }), 'NO LO REFLEJA: 13 (palabra), 14 (tachada), 15 (Agenda Directa), con la fuente');
ok(R.contradictorias.length === 1 && /^fila 9 \|/.test(R.contradictorias[0]), 'CONTRADICTORIAS: la fila 9 (' + JSON.stringify(R.contradictorias) + ')');
ok(/=== RESUMEN de la auditoría de cancelaciones \(07\/09\/2026 al 24\/10\/2026\) ===/.test(L), 'el resumen, con el período');

console.log('[8] una sección que falla no frena las otras');
E = montar();
E.romper = 'RDV CONJUNTO';
r = E.run('auditoriaCancelaciones()');
ok(r.errores.length === 1 && /RDV CONJUNTO/.test(r.errores[0]), 'falla sólo esa sección: ' + r.errores.join(' | '));
ok(de(r, 'Agenda Directa', 15).length === 1 && r.vencidas.length === 1 && /SECCIONES QUE FALLARON: 1/.test(E.logs.join('\n')), 'las demás siguen y el resumen lo dice');
ok(E.escrituras.length === 0, 'y tampoco escribió nada');

console.log('[9] sin "Agenda Directa": se dice y sigue');
E = montar();
delete E.planilla(vm.runInContext('AGENDA_COPIA_SS', E.ctx)).hojas['Agenda Directa'];
r = E.run('auditoriaCancelaciones()');
ok(r.errores.length === 0 && /"Agenda Directa": NO EXISTE/.test(E.logs.join('\n')) && r.vencidas.length === 1, 'lo dice y la auditoría termina');

console.log('[10] reprogramada, pero la fila de la fecha nueva no es clara: DUDOSA, no REFLEJADA');
E = montar();
const hb = E.planilla(vm.runInContext('RDV_SS_DESTINO', E.ctx)).hojas[vm.runInContext('RDV_HOJA_DESTINO', E.ctx)];
hb.v[9][HDR.indexOf('STATUS REUNIÓN')] = 'Suspendida';   // la fila 10 (Carla 25/09): ya no es una reunión vigente
r = E.run('auditoriaCancelaciones()');
const carla2 = de(r, 'mail (desapareció)').filter(function (h) { return /24\/09\/2026/.test(h.reunion); })[0] || {};
ok(carla2.veredicto === 'DUDOSA' && r.resumen.dudosas.length === 1 && /la fila de la fecha nueva no es clara \(filas: 10 \(Suspendida\)\)/.test(E.logs.join('\n')),
   'Carla 24/09 → 25/09 con la fila del 25/09 Suspendida: DUDOSA (' + JSON.stringify(carla2) + ')');
ok(E.escrituras.length === 0, 'y no escribió nada');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
