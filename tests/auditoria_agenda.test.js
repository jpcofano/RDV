/**
 * tests/auditoria_agenda.test.js — la AUDITORÍA DE LA AGENDA (diagnostico/29_auditoria_agenda.js), en Node, con una base,
 * un Gmail y unas copias SIMULADOS. "Hoy" es el jueves 15/10/2026: la semana en curso es la del 12/10 y la siguiente la del 19/10.
 *
 *     node tests/auditoria_agenda.test.js
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: figuras, direcciones, horarios y mails son
 * inventados; los barrios y las comunas son los públicos de la Ciudad.
 *
 * Toda planilla, rango, hilo y mensaje del mock es un Proxy: cualquier método que no sea de LECTURA queda anotado en
 * `E.escrituras` (y Maps también). La auditoría tiene que terminar con esa lista vacía.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', '05_Escritura.js', '20_UpsertDestino.js', '49_Corridas.js',
                  '41_AgendaParser.js', '42_BarriosCabaGeo.js', '40_Agenda.js', '47_AgendaVistas.js', '25_Elecciones.js',
                  'diagnostico/29_auditoria_agenda.js'].filter(function (f) { return fs.existsSync(path.join(RAIZ, f)); });
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
  const E = { logs: [], escrituras: [], planillas: {}, gmail: { etiqueta: 0, busquedas: 0 }, romper: null };
  E.hoja = function (nombre, v) {
    const h = { nombre: nombre, v: v.map(function (r) { return r.slice(); }) };
    const ultimaFila = function () { for (let i = h.v.length; i >= 1; i--) if (h.v[i - 1].some(function (x) { return x !== '' && x != null; })) return i; return 0; };
    const ultimaCol = function () { let m = 0; h.v.forEach(function (r) { for (let j = r.length; j >= 1; j--) if (r[j - 1] !== '' && r[j - 1] != null) { m = Math.max(m, j); break; } }); return m; };
    h.lect = {
      getLastRow: ultimaFila, getLastColumn: ultimaCol, getName: function () { return nombre; },
      getMaxRows: function () { return Math.max(h.v.length, 1000); }, getMaxColumns: function () { return Math.max(ultimaCol(), 26); },
      getProtections: function () { return []; },
      getRange: function (f, c, nf, nc) {
        if (E.romper === nombre) throw new Error('Service Spreadsheets timed out (simulado)');
        nf = nf || 1; nc = nc || 1;
        const leer = function () {
          const o = [];
          for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) { const fila = h.v[f - 1 + i]; r.push(fila && fila[c - 1 + j] !== undefined ? fila[c - 1 + j] : ''); } o.push(r); }
          return o;
        };
        const vacias = function (x) { const o = []; for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) r.push(x); o.push(r); } return o; };
        return proxyLectura(E, nombre + '!rango', {
          getValues: leer, getValue: function () { return leer()[0][0]; }, getDisplayValues: function () { return leer().map(function (r) { return r.map(String); }); },
          getBackgrounds: function () { return vacias(null); }, getFormulas: function () { return vacias(''); }, getFormula: function () { return ''; },
          getNumberFormats: function () { return vacias('General'); }
        });
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
  // Gmail: una etiqueta con hilos; la búsqueda por asunto no trae nada nuevo (los mismos hilos ya vienen por la etiqueta)
  E.hilos = [];
  const mensaje = function (m) {
    return proxyLectura(E, 'mensaje', { getId: function () { return m.id; }, getDate: function () { return m.fecha; },
      getSubject: function () { return m.asunto; }, getPlainBody: function () { return m.cuerpo; } });
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
      getUserLabelByName: function (n) {
        E.gmail.etiqueta++;
        return proxyLectura(E, 'etiqueta', { getThreads: function (i, n2) { return E.hilos.slice(i, i + n2).map(hilo); } });
      },
      search: function () { E.gmail.busquedas++; return []; }
    }),
    Maps: proxyLectura(E, 'Maps', {}),
    PropertiesService: proxyLectura(E, 'PropertiesService', {}),
    CacheService: proxyLectura(E, 'CacheService', {}),
    LockService: proxyLectura(E, 'LockService', {}),
    Session: proxyLectura(E, 'Session', {})
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
const BARRIOS = [['Recoleta', 2], ['Palermo', 14], ['Almagro', 5], ['Boedo', 5], ['Belgrano', 13], ['Flores', 7], ['Caballito', 6]];
const FIGURAS = ['Ana Prueba', 'Bruno Ensayo', 'Carla Muestra', 'Diego Ficticio', 'Elena Inventada'];

/** Una fila creada por la agenda, con la traza igual a lo que tiene (como la deja la agenda). */
function filaAgenda(o, uid, origen) {
  const base = { 'STATUS REUNIÓN': 'en agenda', 'agenda_uid': uid, 'agenda_hora_escrita': o['agenda_hora_escrita'] || o.HORA,
    'agenda_direccion_escrita': o['Dirección'], 'agenda_barrio_escrito': o.Barrio, 'agenda_fecha_escrita': o.FECHA,
    'agenda_status_escrito': 'en agenda', 'Origen fila': origen === undefined ? 'sistema (agenda)' : origen };
  return fila(Object.assign(base, o));
}

function cuerpo(bloques) { return [].concat.apply([], bloques).join('\n'); }
const ASUNTO_CM = 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 12/10 al 17/10';
const ASUNTO_JM = 'Agenda Encuentros de vecinos con JM - Semana del 19/10 al 24/10';
const B = {
  ana: ['*Martes 13/10*', 'Evento: Encuentro con Vecinos Ana Prueba, Recoleta', 'Hora: 18:00h', 'Lugar: Av. Santa Fe 1234, Club'],
  bruno: function (h) { return ['*Miércoles 14/10*', 'Evento: Encuentro con Vecinos Bruno Ensayo, Palermo', 'Hora: ' + h + 'h', 'Lugar: Serrano 1500, Plaza']; },
  carla: ['*Viernes 16/10*', 'Evento: Encuentro con Vecinos Carla Muestra, Flores', 'Hora: 19:00h', 'Lugar: Rivadavia 7000, Plaza'],
  seg19: ['*Lunes 19/10*', 'Evento: Seguridad en tu Barrio, Comuna 13', 'Hora: 17:00h', 'Lugar: Cabildo 2000, Plaza'],
  diego: ['*Martes 20/10*', 'Evento: Encuentro con Vecinos Diego Ficticio, Flores', 'Hora: 18:00h', 'Lugar: Rivadavia 7000, Plaza'],
  seg22: ['*Jueves 22/10*', 'Evento: Seguridad en tu Barrio, Comuna 5', 'Hora: 18:00h', 'Lugar: Av. La Plata 500, Sociedad de Fomento']
};
const MAILS = [
  { id: 'm-viejo', hilo: 'h0', fecha: new D(2026, 8, 30, 9, 0), asunto: 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 28/09 al 03/10',
    cuerpo: cuerpo([['*Jueves 01/10*', 'Evento: Encuentro con Vecinos Ana Prueba, Recoleta', 'Hora: 18:00h', 'Lugar: Av. Santa Fe 1234, Club']]) },
  { id: 'm4', hilo: 'h4', fecha: new D(2026, 9, 2, 10, 0), asunto: 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 05/10 al 10/10',
    cuerpo: cuerpo([['*Miércoles 07/10*', 'Evento: Encuentro con Vecinos Ana Prueba, Recoleta', 'Hora: 18:00h', 'Lugar: Av. Santa Fe 1234, Club']]) },
  { id: 'm0', hilo: 'h1', fecha: new D(2026, 9, 8, 10, 0), asunto: ASUNTO_CM, cuerpo: cuerpo([B.ana, B.bruno('18:30')]) },
  { id: 'm1', hilo: 'h2', fecha: new D(2026, 9, 9, 10, 0), asunto: ASUNTO_CM, cuerpo: cuerpo([B.ana, B.bruno('18:30'), B.carla]) },
  // el "Re:" del martes 13/10: sólo trae a Bruno con la hora nueva. NO saca a Ana ni a Carla.
  { id: 'm2', hilo: 'h2', fecha: new D(2026, 9, 13, 9, 0), asunto: 'Re: ' + ASUNTO_CM, cuerpo: cuerpo([['Actualizo:'], B.bruno('19:00')]) },
  { id: 'm3', hilo: 'h3', fecha: new D(2026, 9, 14, 10, 0), asunto: ASUNTO_JM, cuerpo: cuerpo([B.seg19, B.diego, B.seg22]) }
];
// m4 (02/10) y el viejo (30/09) son anteriores al lunes 05/10: no se leen (la lectura es desde el lunes de la semana pasada)
MAILS[1].fecha = new D(2026, 9, 6, 10, 0);   // m4: el martes 06/10, dentro de lo que se lee

function montar() {
  const E = crearEntorno();
  E.ev = function (t) { return E.run('eventoAgenda_({ tipo: ' + JSON.stringify(t) + ' })'); };
  const cfg = function (n) { return vm.runInContext(n, E.ctx); };
  const EV_VEC = E.ev('Encuentro con Vecinos'), EV_SEG = E.ev('Seguridad en tu Barrio');
  const filas = [HDR];
  FIGURAS.forEach(function (fig, i) {   // historial de septiembre: así las figuras se conocen
    filas.push(fila({ Figura: fig, Barrio: BARRIOS[i][0], FECHA: F(10 + i, 9), HORA: '18:00', EVENTO: 'Encuentro con Vecinos', 'STATUS REUNIÓN': 'Realizada', Inscriptos: 50 }));
  });
  // fila 7: Ana 13/10 — todo igual al mail → OK
  filas.push(filaAgenda({ Figura: 'Ana Prueba', Barrio: 'Recoleta', FECHA: F(13, 10), HORA: '18:00', 'Dirección': 'Av. Santa Fe 1234, Club', EVENTO: EV_VEC,
    'Evento (mail)': 'Encuentro con Vecinos Ana Prueba, Recoleta', 'Lugar (mail)': 'Recoleta', 'Dirección (mail)': 'Av. Santa Fe 1234, Club' }, 'c-a1'));
  // fila 8: Bruno 14/10 — el equipo cambió la HORA (la agenda había escrito 19:00) → DISTINTO, tocada por el equipo
  filas.push(filaAgenda({ Figura: 'Bruno Ensayo', Barrio: 'Palermo', FECHA: F(14, 10), HORA: '20:00', 'agenda_hora_escrita': '19:00', 'Dirección': 'Serrano 1500, Plaza',
    EVENTO: EV_VEC, 'Evento (mail)': 'Encuentro con Vecinos Bruno Ensayo, Palermo', 'Lugar (mail)': 'Palermo', 'Tocado por el equipo': 'HORA' }, 'c-b1'));
  // fila 9 y 10: Diego 20/10 — la de la agenda y una del equipo → DUPLICADA
  filas.push(filaAgenda({ Figura: 'Diego Ficticio', Barrio: 'Flores', FECHA: F(20, 10), HORA: '18:00', 'Dirección': 'Rivadavia 7000, Plaza', EVENTO: EV_VEC,
    'Evento (mail)': 'Encuentro con Vecinos Diego Ficticio, Flores', 'Lugar (mail)': 'Flores' }, 'c-d1'));
  filas.push(fila({ Figura: 'Diego Ficticio', Barrio: 'Flores', FECHA: F(20, 10), HORA: '18:00', EVENTO: 'Encuentro con Vecinos', 'STATUS REUNIÓN': 'en agenda', 'Origen fila': 'equipo' }));
  // filas 11 y 12: Seguridad 22/10, Comuna 5, las dos sin figura, de la agenda, a la misma hora → AMBIGUA (la 12 sin "Origen fila")
  filas.push(filaAgenda({ Figura: '', Barrio: 'Almagro', FECHA: F(22, 10), HORA: '18:00', 'Dirección': 'Bulnes 1000, Escuela', EVENTO: EV_SEG,
    'Evento (mail)': 'Seguridad en tu Barrio, Comuna 5', 'Lugar (mail)': 'Comuna 5' }, 'c-s1'));
  filas.push(filaAgenda({ Figura: '', Barrio: 'Boedo', FECHA: F(22, 10), HORA: '18:00', 'Dirección': 'Boedo 900, Club', EVENTO: EV_SEG,
    'Evento (mail)': 'Seguridad en tu Barrio, Comuna 5', 'Lugar (mail)': 'Comuna 5' }, 'c-s2', ''));
  // fila 13: Seguridad 19/10, la figura ya la cargó el equipo
  filas.push(filaAgenda({ Figura: 'Elena Inventada', Barrio: 'Belgrano', FECHA: F(19, 10), HORA: '17:00', 'Dirección': 'Cabildo 2000, Plaza', EVENTO: EV_SEG,
    'Evento (mail)': 'Seguridad en tu Barrio, Comuna 13', 'Lugar (mail)': 'Comuna 13' }, 'c-s0'));
  // fila 14: Elena 15/10, cargada a mano, no está en ningún mail
  filas.push(fila({ Figura: 'Elena Inventada', Barrio: 'Caballito', FECHA: F(15, 10), HORA: '19:00', EVENTO: 'Encuentro con Vecinos', 'STATUS REUNIÓN': 'en agenda', 'Origen fila': 'equipo' }));
  const DEST = cfg('RDV_SS_DESTINO'), INT = cfg('RDV_SS_INTERMEDIA'), COPIA = cfg('AGENDA_COPIA_SS');
  E.poner(DEST, cfg('RDV_HOJA_DESTINO'), filas);
  E.poner(DEST, 'Comunas', [['Barrio', 'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona', 'Eje geográfico']]
    .concat(BARRIOS.map(function (b) { return [b[0], b[1], 1, 1, 1, 1, 1, 'Centro', '']; })));
  E.poner(DEST, 'RDV CONJUNTO', [['Figura', 'Barrio', 'FECHA', 'Asistentes', 'Oradores anotados', 'Oradores que hablaron', 'Dirección'],
    ['Ficticio Diego', 'Palermo', F(22, 10), '', '', '', 'Serrano 2000']]);
  // AGENDA_DUPLICADOS: una sin elegir, una "No sé", una ya elegida y una informativa
  const enc = vm.runInContext('ENC_DUPLICADOS_AGENDA_', E.ctx).slice();
  const dup = function (o) { return enc.map(function (h) { return o[h] == null ? '' : o[h]; }); };
  E.poner(DEST, cfg('AGENDA_SOLAPA_DUPLICADOS'), [enc,
    dup({ tipo: 'antes de crear', 'reunión del mail': '21/10/2026 10:00 | Carla Muestra | Comuna 7', 'fila candidata': 'fila 99', 'diferencia': 'fecha (1 día)', id_reunion: 'x1' }),
    dup({ ELEGIR: 'No sé', tipo: 'cancelación', 'reunión del mail': '23/10/2026 | Bruno Ensayo', 'fila candidata': 'fila 98', id_reunion: 'cancelacion|x2' }),
    dup({ ELEGIR: 'Son distintas: crear', tipo: 'antes de crear', 'reunión del mail': '24/10/2026 | Ana Prueba', id_reunion: 'x3' }),
    dup({ resultado: 'informativo', tipo: 'después de crear', 'reunión del mail': 'fila 9 (de la agenda)' })]);
  // la intermedia: lo que dejó la última corrida de la agenda
  E.poner(INT, cfg('AGENDA_SOLAPA_FIGURA'), [['fila', 'fecha', 'barrio', 'evento', 'por qué falta la figura', 'filas de RDV CONJUNTO'],
    [11, '22/10/2026', 'Almagro', EV_SEG, 'RDV CONJUNTO todavía no tiene la fila', ''],
    [12, '22/10/2026', 'Boedo', EV_SEG, 'RDV CONJUNTO todavía no tiene la fila', ''],
    [13, '19/10/2026', 'Belgrano', EV_SEG, 'RDV CONJUNTO todavía no tiene la fila', '']]);
  E.poner(INT, cfg('RDV_HOJA_REGISTRO_AGENDA'), [vm.runInContext('ENC_REGISTRO_AGENDA_', E.ctx).slice()]);
  const cam = [vm.runInContext('ENC_CAMBIOS_AGENDA_', E.ctx).slice()];
  [['20261009-100000-aaaa', 'c-a1'], ['20261009-100000-aaaa', 'c-b1'], ['20261014-110000-bbbb', 'c-d1'], ['20261014-110000-bbbb', 'c-s1'],
   ['20261014-110000-bbbb', 'c-s2'], ['20261014-110000-bbbb', 'c-s0'], ['20260901-100000-cccc', 'c-old']].forEach(function (x) {
    cam.push([x[0], 'crear_id', '', '', '', '', 'id-' + x[1], '', x[1]]);
  });
  E.poner(INT, cfg('RDV_HOJA_REGISTRO_AGENDA_CAMBIOS'), cam);
  // Gmail: un hilo por asunto (el "Re:" en el hilo del m1)
  const porHilo = {};
  MAILS.forEach(function (m) { (porHilo[m.hilo] = porHilo[m.hilo] || []).push(m); });
  E.hilos = Object.keys(porHilo).map(function (k) { return { id: k, mensajes: porHilo[k] }; });
  // las copias: las arma el código de la agenda (el mismo plan, en memoria) y después se les "rompe" algo a propósito
  E.ctx.__lista = MAILS.filter(function (m) { return m.fecha >= new D(2026, 9, 5, 0, 0); });
  const c = E.run('(function () { const d = leerDestino_(); const P = planAgenda_(d, agendaDesdeListaDeMails_(__lista, {}), indicesAgenda_(d.hdr), alcanceAgenda_(), ' +
    '{ enSeco: true, historial: { creadas: new Map(), olvidadas: new Set(), notadas: new Set(), yaCargadas: new Set(), error: "" }, elecciones: new Map(), ' +
    'conjunto: new Map(), geocodificar: function (q) { return { consulta: q, estado: "ZERO_RESULTS" }; } }); ' +
    'const pz = partirCopiaAgenda_(armarCopiaAgenda_(P, new Date()), hoyMediodia_()); ' +
    'const mail = armarVistaMailAgenda_(pz.abierta, hoyMediodia_(), pz.abierta.items.map(function () { return "k"; }), {}); ' +
    'return { ab: pz.abierta.map(function (r) { return r.slice(); }), call: armarVistaCallAgenda_(pz.abierta, hoyMediodia_()).map(function (r) { return r.slice(); }), ' +
    'mail: mail.map(function (f) { return f.tipo === "dia" ? [f.texto, "", "", "", ""] : [f.celda.texto, "", false, false, f.clave]; }) }; })()');
  E.copias = c;
  E.poner(COPIA, cfg('AGENDA_COPIA_SOLAPA'), c.ab);                                     // exacta
  const iFig = c.call[0].indexOf('Figura');
  const call = c.call.filter(function (r) { return r[iFig] !== 'Carla Muestra'; });      // falta Carla
  const sobra = c.call[1].slice(); sobra[iFig] = 'Ana Prueba'; sobra[c.call[0].indexOf('HORA')] = '10:00'; sobra[c.call[0].indexOf('FECHA')] = F(17, 10);
  call.push(sobra);                                                                       // y sobra una
  E.poner(COPIA, cfg('AGENDA_SOLAPA_CALL'), call);
  const mailV = [['Reunión (como el mail)', 'Responsable', 'Check 1', 'Check 2', 'clave']].concat(c.mail.map(function (r) {
    return /Ana Prueba/.test(r[0]) ? [r[0].replace('Hora: 18:00h', 'Hora: 18:15h'), r[1], r[2], r[3], r[4]] : r;   // otra hora
  }));
  E.poner(COPIA, cfg('AGENDA_SOLAPA_VISTA_MAIL'), mailV);
  const rdv = c.ab.map(function (r) { return r.slice(); });
  const iF2 = rdv[0].indexOf('Figura'), iH2 = rdv[0].indexOf('HORA');
  rdv.forEach(function (r, i) { if (i && r[iF2] === 'Diego Ficticio') r[iH2] = '21:00'; });  // otra hora en la del archivo RDV
  E.poner(DEST, cfg('AGENDA_RDV_SOLAPA'), rdv);
  E.escrituras = [];
  return E;
}

let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }
const reunion = function (r, fig, d) { return r.reuniones.filter(function (x) { return x.figura === fig && x.fecha === pad(d) + '/10/2026'; })[0] || {}; };
const seg = function (r, d) { return r.reuniones.filter(function (x) { return !x.figura && x.fecha === pad(d) + '/10/2026'; })[0] || {}; };

// ============================== escenarios ==============================

console.log('[1] la auditoría completa');
let E = montar();
let r = E.run('auditoriaAgenda()');
const L = E.logs.join('\n');
if (process.env.VER_LOG) console.log(L);
ok(r && r.errores.length === 0, 'ninguna sección falló' + (r && r.errores.length ? ': ' + r.errores.join(' | ') : ''));
ok(E.escrituras.length === 0, 'NO ESCRIBIÓ NADA (ni planillas, ni Gmail, ni Maps, ni propiedades): ' + JSON.stringify(E.escrituras.slice(0, 5)));
ok(E.gmail.etiqueta === 1 && E.gmail.busquedas <= 2, 'Gmail: una sola lectura (la etiqueta una vez y la búsqueda por asunto de la agenda)');

console.log('[2] los mails y las versiones');
ok(/m4|06\/10 10:00 \| CM y Ministros \| 05\/10 al 10\/10/.test(L) && !/30\/09 09:00/.test(L), 'se leen los mails desde el lunes 05/10 (el del 30/09 no)');
ok(/08\/10 10:00 \| CM y Ministros \| 12\/10 al 17\/10 \| no \| sí \| reemplazada por la del 09\/10 10:00/.test(L), 'la versión del 08/10: reemplazada');
ok(/09\/10 10:00 \| CM y Ministros \| 12\/10 al 17\/10 \| no \| sí \| VÁLIDA: la última versión completa \| 3/.test(L), 'la del 09/10: VÁLIDA, 3 reuniones');
ok(/13\/10 09:00 \| CM y Ministros \| 12\/10 al 17\/10 \| sí \| sí \| VALE: respuesta posterior \(sólo agrega o actualiza; no saca reuniones\) \| 1/.test(L),
   'el "Re:" del 13/10: respuesta posterior, sólo agrega o actualiza');
ok(reunion(r, 'Ana Prueba', 13).resultado === 'OK' && reunion(r, 'Carla Muestra', 16).resultado === 'FALTA EN LA BASE',
   'el "Re:" que sólo trae a Bruno NO hizo desaparecer a Ana ni a Carla');
ok(/JM \| SIN MAIL todavía/.test(L) && /CM y Ministros \| SIN MAIL todavía/.test(L), 'avisa los grupos sin mail en cada semana');

console.log('[3] cada reunión contra la base');
ok(reunion(r, 'Ana Prueba', 13).resultado === 'OK' && reunion(r, 'Ana Prueba', 13).fila === 7, 'Ana 13/10: OK (fila 7)');
const bru = reunion(r, 'Bruno Ensayo', 14);
ok(bru.resultado === 'DISTINTO' && bru.difs.join() === 'HORA', 'Bruno 14/10: DISTINTO sólo en HORA (' + JSON.stringify(bru) + ')');
ok(/HORA: mail "19:00" \/ base "20:00" — TOCADA POR EL EQUIPO: la agenda había escrito "19:00" y ya no la toca/.test(L),
   'y dice que la celda la tocó el equipo (agenda_hora_escrita)');
ok(reunion(r, 'Carla Muestra', 16).resultado === 'FALTA EN LA BASE' && /la agenda la crearía en la próxima corrida/.test(L), 'Carla 16/10: FALTA EN LA BASE');
const die = reunion(r, 'Diego Ficticio', 20);
ok(die.resultado === 'DUPLICADA' && die.fila === 9 && die.otras.indexOf(10) >= 0, 'Diego 20/10: DUPLICADA (la 9 de la agenda y la 10 del equipo)');
ok(seg(r, 22).resultado === 'DUPLICADA' && /AMBIGUA para la agenda/.test(L), 'Seguridad 22/10: DUPLICADA (ambigua: dos filas)');
ok(seg(r, 19).resultado === 'OK' && seg(r, 19).fila === 13, 'Seguridad 19/10: OK (la figura la cargó el equipo; no se compara)');
ok(r.cuentas.OK === 2 && r.cuentas.DISTINTO === 1 && r.cuentas['FALTA EN LA BASE'] === 1 && r.cuentas.DUPLICADA === 2,
   'cuentas: ' + JSON.stringify(r.cuentas));

console.log('[4] al revés: filas de la base que no están en el mail');
ok(r.cuentas['FILA SIN MAIL'] === 2, 'dos filas (' + r.cuentas['FILA SIN MAIL'] + ')');
ok(r.noOk.some(function (t) { return /CARGADA A MANO.*fila 14 \| Elena Inventada \| 15\/10\/2026/.test(t); }), 'la 14 (Elena 15/10): cargada a mano');
ok(r.noOk.some(function (t) { return /DUPLICADA de la reunión 20\/10\/2026 18:00 Diego Ficticio \(la fila de la agenda es la 9.*cargada a mano.*fila 10 \| Diego Ficticio/.test(t); }), 'la 10: DUPLICADA de la reunión de la fila 9, cargada a mano');

console.log('[5] las copias');
const cp = r.extra.copias || {};
ok(cp['Agenda'] && cp['Agenda'].reuniones === 6 && cp['Agenda'].faltan === 0 && cp['Agenda'].sobran === 0 && cp['Agenda'].distintas === 0,
   '"Agenda" del archivo Agenda: igual al mail (' + JSON.stringify(cp['Agenda']) + ')');
ok(cp['AgendaCall'] && cp['AgendaCall'].faltan === 1 && cp['AgendaCall'].sobran === 1, '"AgendaCall": falta Carla y sobra una (' + JSON.stringify(cp['AgendaCall']) + ')');
ok(/AgendaCall" \(archivo "Agenda"\): falta 16\/10\/2026 19:00 \| Carla Muestra/.test(r.noOk.join('\n')), 'y lo lista');
ok(cp['Agenda (mail)'] && cp['Agenda (mail)'].distintas === 1 && cp['Agenda (mail)'].faltan === 0, '"Agenda (mail)": la celda de Ana con otra hora (' + JSON.stringify(cp['Agenda (mail)']) + ')');
ok(cp['Agenda (RDV)'] && cp['Agenda (RDV)'].distintas === 1 && /archivo RDV\): fila \d+ \| 20\/10\/2026 18:00 \| Diego Ficticio.*HORA "21:00" \(el mail "18:00"\)/.test(r.noOk.join('\n')),
   '"Agenda" del archivo RDV: Diego con otra HORA (' + JSON.stringify(cp['Agenda (RDV)']) + ')');

console.log('[6] filas creadas por la agenda (14 días) y AGENDA_DUPLICADOS');
ok(/filas que creó la agenda en los últimos 14 días: 6/.test(L), 'seis filas creadas desde el 01/10 (la de septiembre no)');
ok(r.cuentas['CREADAS CON PROBLEMAS'] === 3, 'tres con algo para revisar (' + r.cuentas['CREADAS CON PROBLEMAS'] + ')');
ok(r.noOk.some(function (t) { return /Seguridad SIN FIGURA.*"Origen fila" VACÍO.*fila 12/.test(t); }), 'la 12: Seguridad sin figura y "Origen fila" vacío');
ok(r.noOk.some(function (t) { return /posible DUPLICADA con fila 10.*fila 9 /.test(t); }), 'la 9: posible duplicada con la 10');
ok(r.cuentas['DUPLICADOS PENDIENTES'] === 2 && /PENDIENTE \| línea 2 \| antes de crear/.test(L) && /PENDIENTE \| línea 3 \| cancelación.*ELEGIR: No sé/.test(L),
   'AGENDA_DUPLICADOS: 2 pendientes (sin elegir y "No sé"); la elegida y la informativa no');

console.log('[7] las ambiguas: por qué y qué las distinguiría');
ok(r.cuentas.AMBIGUAS === 1, 'una ambigua');
ok(/AMBIGUA \| 22\/10\/2026 18:00 \| Seguridad en tu Barrio/.test(L) && /fila 11 \|.*entró por: \(b\) sin Figura y misma ubicación/.test(L) &&
   /fila 12 \|.*entró por: \(b\) sin Figura y misma ubicación/.test(L), 'cada fila candidata, lado a lado, con la regla por la que entró');
ok(/regla: regla 4, SIN figura/.test(L) && /la HORA del mail \(18:00\) no desempata: 2 de las 2/.test(L) && /agenda_uid: 2 de las 2/.test(L),
   'el paso que la dejó ambigua: regla 4 sin figura, la HORA y el agenda_uid no desempatan');
ok(/lo que las distingue hoy: .*Barrio \(Almagro \/ Boedo\)/.test(L) && /la desambiguaría: la Dirección del mail \("Av\. La Plata 500, Sociedad de Fomento"\) en UNA sola/.test(L),
   'lo que las distingue y lo que la resolvería (la dirección, la figura, el barrio)');

console.log('[8] AGENDA_FIGURA_A_COMPLETAR');
ok(r.cuentas['FIGURA A COMPLETAR'] === 2, 'dos siguen sin figura (' + r.cuentas['FIGURA A COMPLETAR'] + ')');
ok(/fila 11 \| 22\/10\/2026 \| barrio Almagro \| Comuna 5 \| mail: Comuna 5 \| dirección "Bulnes 1000, Escuela"/.test(L) &&
   /por qué no hay figura: RDV CONJUNTO todavía no tiene la fila/.test(L), 'cada una: fila, fecha, barrio, comuna, dirección y el motivo');
ok(/RDV CONJUNTO ese día: fila 2 Ficticio Diego \(Palermo, Serrano 2000\)/.test(L), 'y lo que tiene RDV CONJUNTO ese día');
ok(/en la base hoy: ya tiene Figura: "Elena Inventada"/.test(L) && /en la base hoy: la Figura SIGUE VACÍA/.test(L), 'y si la base sigue con la Figura vacía');

console.log('[9] el resumen');
ok(/=== RESUMEN de la auditoría de la agenda ===/.test(L) && /TODO LO QUE NO ESTÁ OK: \d+/.test(L) && r.noOk.length > 10, 'el resumen con la lista de lo que no está OK (' + r.noOk.length + ')');

console.log('[10] una sección que falla no frena las otras');
E = montar();
E.romper = 'Agenda (mail)';
r = E.run('auditoriaAgenda()');
const L2 = E.logs.join('\n');
ok(r.errores.length === 1 && /Agenda \(mail\)/.test(r.errores[0]), 'falla sólo esa sección: ' + r.errores.join(' | '));
ok(r.cuentas.OK === 2 && r.cuentas['FIGURA A COMPLETAR'] === 2 && /SECCIONES QUE FALLARON: 1/.test(L2), 'las demás siguen y el resumen lo dice');
ok(E.escrituras.length === 0, 'y tampoco escribió nada');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
