/**
 * tests/agenda_escritura.test.js — Agenda, etapa 2 (crear y actualizar filas del destino), en Node, con un destino
 * SIMULADO y mails SINTÉTICOS. "Hoy" es el martes 06/10/2026.
 *
 *     node tests/agenda_escritura.test.js
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: mails, horarios y direcciones son
 * inventados; los barrios, las comunas y sus límites son los públicos de la Ciudad; las figuras, nombres de la
 * columna Figura. Gmail y Maps no se llaman: los mails se pasan como lista y el geocodificador es una tabla.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', '05_Escritura.js', '20_UpsertDestino.js',
                  '41_AgendaParser.js', '42_BarriosCabaGeo.js', '40_Agenda.js'];
const HOY = new Date(2026, 9, 6, 12, 0, 0);
/** UNA sola clase de fecha, la misma adentro y afuera del contexto: si no, `instanceof Date` falla adentro. */
class D extends Date {
  constructor(...a) { if (a.length === 0) super(HOY.getTime()); else super(...a); }
  static now() { return HOY.getTime(); }
}
const pad = function (n) { return ('0' + n).slice(-2); };

// ============================== el mock de Apps Script ==============================

function crearEntorno(config) {
  const E = { logs: [], uuid: 0, hojas: {} };
  const FakeDate = D;
  class Hoja {
    constructor(nombre, v) { this.nombre = nombre; this.v = (v || []).map(function (r) { return r.slice(); }); this.bg = this.v.map(function (r) { return r.map(function () { return null; }); }); }
    _asegurar(f, c) {
      while (this.v.length < f) { this.v.push([]); this.bg.push([]); }
      for (let i = 0; i < f; i++) { while (this.v[i].length < c) { this.v[i].push(''); this.bg[i].push(null); } }
    }
    getRange(f, c, nf, nc) {
      const h = this; nf = nf || 1; nc = nc || 1;
      const leer = function (m) { const o = []; for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) { const fila = m[f - 1 + i]; r.push(fila && fila[c - 1 + j] !== undefined ? fila[c - 1 + j] : (m === h.v ? '' : null)); } o.push(r); } return o; };
      const rango = {
        getValues: function () { return leer(h.v); },
        getValue: function () { return leer(h.v)[0][0]; },
        getBackgrounds: function () { return leer(h.bg); },
        getFormula: function () { return ''; },
        setValues: function (m) { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.v[f - 1 + i][c - 1 + j] = m[i][j]; return rango; },
        setValue: function (x) { h._asegurar(f, c); h.v[f - 1][c - 1] = x; return rango; },
        setBackground: function (col) { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.bg[f - 1 + i][c - 1 + j] = col; return rango; },
        clearContent: function () { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.v[f - 1 + i][c - 1 + j] = ''; return rango; },
        setNumberFormat: function () { return rango; },
        setFontWeight: function () { return rango; }
      };
      return rango;
    }
    getRangeList(a1s) {
      const h = this;
      return { setBackground: function (col) {
        a1s.forEach(function (a1) {
          const p = a1.split(':').map(function (x) { const m = /^([A-Z]+)(\d+)$/.exec(x); let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return [+m[2], n]; });
          const b = p[1] || p[0];
          h.getRange(p[0][0], p[0][1], b[0] - p[0][0] + 1, b[1] - p[0][1] + 1).setBackground(col);
        });
      } };
    }
    getLastRow() { for (let i = this.v.length; i >= 1; i--) if (this.v[i - 1].some(function (x) { return x !== '' && x !== null && x !== undefined; })) return i; return 0; }
    getLastColumn() { let m = 0; this.v.forEach(function (r) { for (let j = r.length; j >= 1; j--) if (r[j - 1] !== '' && r[j - 1] != null) { m = Math.max(m, j); break; } }); return m; }
    getMaxRows() { return Math.max(this.v.length, 1000); }
    insertRowsAfter() {}
    deleteRows(f, n) { this.v.splice(f - 1, n); this.bg.splice(f - 1, n); }
    appendRow(r) { const f = this.getLastRow() + 1; this.getRange(f, 1, 1, r.length).setValues([r]); }
    setFrozenRows() {}
    clear() { this.v = []; this.bg = []; }
    getProtections() { return []; }
    protect() { const h = this; return { setDescription: function (d) { h.proteccion = d; return { setWarningOnly: function (w) { h.advertencia = w; } }; } }; }
    autoResizeColumns() {}
    clearContents() { this.v = this.v.map(function (r) { return r.map(function () { return ''; }); }); }
  }
  E.Hoja = Hoja;
  const planillas = {};
  E.planilla = function (id) {
    if (!planillas[id]) planillas[id] = { hojas: {}, getSheetByName: function (n) { return this.hojas[n] || null; },
                                           insertSheet: function (n) { this.hojas[n] = new Hoja(n, []); return this.hojas[n]; } };
    return planillas[id];
  };
  const ctx = {
    console: console, Date: FakeDate, Math: Math, JSON: JSON, Map: Map, Set: Set, Object: Object, Array: Array, String: String, Number: Number,
    Logger: { log: function () { const a = Array.prototype.slice.call(arguments); let s = String(a.shift()); s = s.replace(/%s/g, function () { return String(a.shift()); }).replace(/%%/g, '%'); E.logs.push(s); } },
    Utilities: {
      formatDate: function (d, tz, f) { return f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate())).replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds())); },
      getUuid: function () { E.uuid++; return 'uuid-' + E.uuid + '-xxxx'; }, sleep: function () {}
    },
    SpreadsheetApp: { openById: function (id) { return E.planilla(id); }, flush: function () {}, ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function () { return null; }, setProperty: function () {}, deleteProperty: function () {} }; } }
  };
  vm.createContext(ctx);
  const cfg = Object.assign({ DERIVADAS_POR_SCRIPT: 'false' }, config || {});
  ARCHIVOS.forEach(function (f) {
    let s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    if (f === '00_Config.js') Object.keys(cfg).forEach(function (k) { s = s.replace(new RegExp('^const ' + k + '\\s+=.*', 'm'), 'const ' + k + ' = ' + cfg[k] + ';'); });
    vm.runInContext(s, ctx, { filename: f });
  });
  E.ctx = ctx;
  E.run = function (expr) { vm.runInContext('_ssDestino_ = null; _ssIntermedia_ = null; _cacheParsing_ = null;', ctx); E.logs = []; return vm.runInContext(expr, ctx); };
  return E;
}

// ============================== el destino simulado ==============================

const HDR = (function () {
  const fx = fs.readFileSync(path.join(RAIZ, 'fixtures', 'RVD JM-CM - ES.csv'), 'utf8').split(/\r?\n/)[0].split(',');
  const nombres = { C: 'EVENTO', F: 'HORA', H: 'One Page Entregado', I: 'STATUS REUNIÓN', J: 'Observaciones',
    L: 'Mail', M: 'Call Center', N: 'IVR', O: 'RRSS', P: 'Difusión', R: 'Oradores anotados', S: 'Oradores que hablaron',
    T: 'Temas mas comentados', U: 'Semaforo politico', V: 'Síntesis cualitativa:', AH: 'Masculinos', AI: 'Femeninos',
    AJ: '18-24', AK: '25-39', AL: '40-55', AM: '56-65', AN: '66+', AO: 'Sin identificar' };
  return fx.map(function (h) { const m = /^PENDIENTE_([A-Z]+)$/.exec(h); return m && nombres[m[1]] ? nombres[m[1]] : h; })
           .concat(['RDV_UID', 'form_origen', 'form_score', 'form_nivel', 'form_fecha_match', 'form_clave']);
})();
const COLUMNAS_AGENDA = ['No participa', 'agenda_uid', 'agenda_mail', 'agenda_version', 'agenda_hora_escrita',
  'agenda_direccion_escrita', 'agenda_barrio_escrito', 'agenda_fecha_escrita', 'agenda_status_escrito'];
const BARRIOS = [['Recoleta', 2], ['Palermo', 14], ['Almagro', 5], ['Boedo', 5], ['Belgrano', 13], ['Núñez', 13],
  ['Colegiales', 13], ['Flores', 7], ['Parque Chacabuco', 7], ['San Nicolás', 1], ['Monserrat', 1], ['Villa Urquiza', 12]];
const FIGURAS = ['Clara Muzzio', 'Jorge Macri', 'Hernán Lombardi', 'Gabino Tapia', 'Laura Alonso', 'Ezequiel Sabor'];

function montar(conColumnas, filasExtra) {
  const E = crearEntorno(arguments[2]);
  const hdr = HDR.concat(conColumnas === false ? [] : COLUMNAS_AGENDA);
  const C = function (n) { return hdr.indexOf(n); };
  const filas = [hdr];
  // Historial: una fila por figura, de septiembre (cerradas o activas), todas Realizada
  FIGURAS.forEach(function (fig, i) {
    const r = hdr.map(function () { return ''; });
    r[C('Figura')] = fig; r[C('Barrio')] = BARRIOS[i][0]; r[C('FECHA')] = new D(2026, 8, 10 + i, 12); r[C('HORA')] = '18:00';
    r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = 'Realizada'; r[C('Inscriptos')] = 100 + i;
    filas.push(r);
  });
  // La fila que el equipo ya cargó para Laura Alonso del 07/10 (la agenda la VINCULA, no crea otra)
  const al = hdr.map(function () { return ''; });
  al[C('Figura')] = 'Laura Alonso'; al[C('Barrio')] = 'Flores'; al[C('FECHA')] = new D(2026, 9, 7, 12); al[C('HORA')] = '10:00';
  al[C('EVENTO')] = 'Café con Vecinos'; al[C('STATUS REUNIÓN')] = 'en agenda';
  filas.push(al);
  (filasExtra || []).forEach(function (fn) { const r = hdr.map(function () { return ''; }); fn(r, C); filas.push(r); });
  const ssD = E.planilla(E.run('RDV_SS_DESTINO')), ssI = E.planilla(E.run('RDV_SS_INTERMEDIA'));
  ssD.hojas['RVD JM-CM - ES'] = new E.Hoja('RVD JM-CM - ES', filas);
  ssD.hojas['Comunas'] = new E.Hoja('Comunas', [['Barrio', 'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona', 'Eje geográfico']]
    .concat(BARRIOS.map(function (b) { return [b[0], b[1], 1, 1, 1, 1, 1, 'Centro', '']; })));
  ssD.hojas['RDV CONJUNTO'] = new E.Hoja('RDV CONJUNTO', [['Figura', 'Barrio', 'FECHA', 'Asistentes', 'Oradores anotados', 'Oradores que hablaron']]);
  E.D = ssD.hojas['RVD JM-CM - ES']; E.ssI = ssI; E.ssD = ssD; E.C = C; E.hdr = hdr;
  return E;
}

// Puntos interiores (el promedio de los vértices de cada barrio, verificado adentro) para el geocodificador simulado.
const GEO = {};
function puntoDe(E, barrio) {
  return vm.runInContext(`(function () {
    const p = _poligonosBarrios_().filter(function (b) { return normalizeText_(b.barrio) === normalizeText_(${JSON.stringify(barrio)}); })[0];
    let x = 0, y = 0, n = 0;
    p.anillos[0].forEach(function (v, i) { if (i % 2 === 0) { x += v; n++; } else y += v; });
    return { lng: x / n, lat: y / n };
  })()`, E.ctx);
}
function geocodificador(E) {
  const tabla = { 'Av. Santa Fe 1234': 'Recoleta', 'Serrano 1500': 'Palermo', 'Bulnes 1000': 'Almagro', 'Rivadavia 7000': 'Flores',
                  'Cabildo 2000': 'Belgrano' };
  Object.keys(tabla).forEach(function (k) { GEO[k] = puntoDe(E, tabla[k]); });
  return function (consulta) {
    const k = Object.keys(tabla).filter(function (x) { return consulta.indexOf(x) === 0; })[0];
    return k ? { consulta: consulta, estado: 'OK', lat: GEO[k].lat, lng: GEO[k].lng, tipo: 'ROOFTOP', parcial: false } : { consulta: consulta, estado: 'ZERO_RESULTS' };
  };
}

// Los mails de la semana del 05/10 al 10/10
const ASUNTO = 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 05/10 al 10/10';
const EV = {
  sabor: ['*Lunes 05/10*', 'Evento: Encuentro con Vecinos Ezequiel Sabor, Comuna 12', 'Hora: 18:00h', 'Lugar: A CONFIRMAR'],
  lombardi: ['*Miércoles 07/10*', 'Evento: Encuentro con Vecinos Hernán Lombardi, Gabino Tapia (NO PARTICIPA), Comuna 13', 'Hora: 19:00 hs',
             'Lugar: A CONFIRMAR (NO SE COMUNICA LA DIRECCIÓN)'],
  alonso: ['*Miércoles 07/10*', 'Evento: Café con Vecinos Laura Alonso, Comuna 7', 'Hora: 10:00h', 'Lugar: Rivadavia 7000, Plaza'],
  muzzio: function (dia, hora) { return ['*' + dia + '*', 'Evento: Encuentro con Vecinos Clara Muzzio, Recoleta', 'Hora: ' + hora + 'h', 'Lugar: Av. Santa Fe 1234, Club Social']; },
  seguridad: ['*Jueves 08/10*', 'Evento: Seguridad en tu Barrio, Comuna 5', 'Hora: 18:00h', 'Lugar: Bulnes 1000, Escuela'],
  macri: function (lugar) { return ['*Viernes 09/10*', 'Evento: Encuentro "1 a 1" Jorge Macri, Comuna 14', 'Hora: 11:00h', 'Lugar: ' + lugar]; }
};
function mail(dia, hora, bloques, asunto) {
  return { fecha: new D(2026, 9, dia, hora, 0), asunto: asunto || ASUNTO, cuerpo: [].concat.apply([], bloques).join('\n'), truncado: false };
}
const V1 = mail(2, 9, [EV.sabor, EV.lombardi, EV.alonso, EV.muzzio('Jueves 08/10', '18:30'), EV.seguridad, EV.macri('Serrano 1500')]);
const V2 = mail(5, 9, [EV.sabor, EV.lombardi.map(function (l) { return l.replace('19:00 hs', '19:30 hs'); }), EV.alonso,
                       EV.muzzio('Jueves 08/10', '19:00'), EV.seguridad, EV.macri('Cabildo 2000')]);
// V3 (martes 06/10 8 h): Muzzio pasa al sábado 10/10; Lombardi desaparece (futura → se suspende); Sabor (lunes 05/10)
// ya no está (ya había pasado → no cuenta como cancelación).
const V3 = mail(6, 8, [EV.alonso, EV.muzzio('Sábado 10/10', '19:00'), EV.seguridad, EV.macri('Cabildo 2000')]);
const V4 = mail(6, 10, [EV.lombardi.map(function (l) { return l.replace('19:00 hs', '19:30 hs'); }), EV.alonso,
                        EV.muzzio('Sábado 10/10', '19:00'), EV.seguridad, EV.macri('Cabildo 2000')]);
const VIEJO = mail(1, 9, [['*Martes 04/08*', 'Evento: Encuentro con Vecinos Ezequiel Sabor, Comuna 12', 'Hora: 18:00h', 'Lugar: A CONFIRMAR']],
                   'Agenda Encuentros de vecinos con CM y Ministros - Semana del 03/08 al 08/08');
VIEJO.fecha = new D(2026, 6, 31, 9, 0);

let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }
function correr(E, enSeco, mails, extra) {
  E.ctx.__mails = mails; E.ctx.__geo = geocodificador(E); E.ctx.__extra = extra || {};
  return E.run('correrAgendaEnBloqueo_(' + enSeco + ', Object.assign({ mails: __mails, geocodificar: __geo }, __extra))');
}
const foto = function (h) { return JSON.stringify({ v: h.v, bg: h.bg }); };
const fila = function (E, fig, d) {
  for (let i = 1; i < E.D.v.length; i++) {
    const r = E.D.v[i], f = r[E.C('FECHA')];
    if (r[E.C('Figura')] === fig && f instanceof Date && f.getDate() === d && f.getMonth() === 9) return i;   // octubre
  }
  return -1;
};
const celda = function (E, i, n) { return E.D.v[i][E.C(n)]; };
const fondo = function (E, i, n) { return E.D.bg[i][E.C(n)]; };
const SIS = '#CFE2F3';

// ============================== escenarios ==============================

console.log('[1] en seco: calcula y no toca el destino');
let E = montar();
let antes = foto(E.D);
let r = correr(E, true, [V1, VIEJO]);
ok(r && !r.error, 'sin error' + (r && r.error ? ': ' + r.error : ''));
ok(foto(E.D) === antes, 'el destino no cambió');
ok(r.crear === 5 && r.vincular === 1, 'crearía 5 y vincularía 1 (crear ' + r.crear + ', vincular ' + r.vincular + ')');
ok(r.viejasSinFila === 1, 'la reunión vieja del mail (04/08) sin fila va a la solapa informativa, no se crea');
const reg = E.ssI.hojas['REGISTRO_AGENDA'];
ok(reg && reg.v.length === 2 && reg.v[1][2] === 'en seco', 'REGISTRO_AGENDA: una línea "en seco"');

console.log('[2] crear y vincular (V1)');
const nAntes = E.D.v.length;
r = correr(E, false, [V1, VIEJO]);
ok(r && !r.error, 'sin error' + (r && r.error ? ': ' + r.error : ''));
ok(E.D.v.length === nAntes + 5, 'cinco filas nuevas, AL FINAL (' + (E.D.v.length - nAntes) + ')');
const iMu = fila(E, 'Clara Muzzio', 8), iMa = fila(E, 'Jorge Macri', 9), iLo = fila(E, 'Hernán Lombardi', 7), iAl = fila(E, 'Laura Alonso', 7);
const iSe = E.D.v.findIndex(function (x, i) { return i > 0 && x[E.C('EVENTO')] === 'Seguridad en tu Barrio'; });
ok(iMu >= nAntes && iMa >= nAntes && iLo >= nAntes && iSe >= nAntes, 'las nuevas están después de las que había');
ok(iAl === nAntes - 1 && E.D.v.filter(function (x) { return x[E.C('Figura')] === 'Laura Alonso'; }).length === 2,
   'Laura Alonso 07/10 NO se duplicó: se vinculó la fila del equipo');
ok(celda(E, iMu, 'HORA') === '18:30' && celda(E, iMu, 'STATUS REUNIÓN') === 'en agenda' && celda(E, iMu, 'EVENTO') === 'Encuentro con Vecinos',
   'Muzzio: hora, "en agenda", EVENTO');
ok(celda(E, iMu, 'Dirección') === 'Av. Santa Fe 1234, Club Social', 'Dirección: la línea "Lugar:" del mail, tal cual');
ok(celda(E, iMu, 'Barrio') === 'Recoleta' && celda(E, iMu, 'agenda_barrio_escrito') === 'Recoleta', 'Barrio por la regla de confianza: Recoleta');
ok(celda(E, iMa, 'EVENTO') === 'Uno a uno' && celda(E, iMa, 'Barrio') === 'Palermo', 'Macri "1 a 1": EVENTO "Uno a uno", Barrio Palermo (Comuna 14 = la del mail)');
ok(celda(E, iLo, 'No participa') === 'Gabino Tapia' && celda(E, iLo, 'Barrio') === '' &&
   /A CONFIRMAR/.test(celda(E, iLo, 'Dirección')), 'conjunta: a nombre de Lombardi, "No participa" Tapia, sin barrio, Dirección A CONFIRMAR tal cual');
ok(celda(E, iSe, 'Figura') === '' && celda(E, iSe, 'Barrio') === 'Almagro', 'Seguridad en tu Barrio: SIN figura, Barrio Almagro (Comuna 5)');
ok([iMu, iMa, iLo, iSe].every(function (i) { return fondo(E, i, 'FECHA') === SIS && fondo(E, i, 'agenda_uid') === SIS; }), 'todo lo escrito en #CFE2F3');
ok(celda(E, iAl, 'Dirección') === 'Rivadavia 7000, Plaza' && celda(E, iAl, 'agenda_uid') !== '' && celda(E, iAl, 'Barrio') === 'Flores' &&
   celda(E, iAl, 'agenda_hora_escrita') === '10:00', 'vinculada: Dirección vacía completada, agenda_uid, Barrio del equipo intacto, la hora del equipo replica el mail');
ok(fondo(E, iAl, 'HORA') === null && fondo(E, iAl, 'Barrio') === null, 'las celdas del equipo de la vinculada no se pintaron');
ok(fila(E, 'Ezequiel Sabor', 5) > 0, 'Sabor del lunes 05/10 (en el alcance) se crea');
const cam = E.ssI.hojas['REGISTRO_AGENDA_CAMBIOS'];
ok(cam && cam.v.length > 30, 'REGISTRO_AGENDA_CAMBIOS: cada celda con antes y después (' + (cam ? cam.v.length - 1 : 0) + ')');
r = correr(E, false, [V1, VIEJO]);
ok(r.crear === 0 && r.vincular === 0 && E.D.v.length === nAntes + 5, 'correrla otra vez con lo mismo: no crea ni vincula nada (idempotente)');

console.log('[3] actualizar sólo lo del sistema (V2)');
E.D.v[iLo][E.C('HORA')] = '20:00';            // alguien del equipo cambió la hora de Lombardi
r = correr(E, false, [V1, V2, VIEJO]);
ok(celda(E, iMu, 'HORA') === '19:00' && celda(E, iMu, 'agenda_hora_escrita') === '19:00', 'Muzzio: hora del sistema 18:30 → 19:00');
ok(celda(E, iLo, 'HORA') === '20:00', 'Lombardi: la hora que cambió el equipo NO se toca (el mail dice 19:30)');
ok(r.editadas >= 1, 'y se registra como "editada por el equipo" (' + r.editadas + ')');
ok(celda(E, iMa, 'Dirección') === 'Cabildo 2000' && celda(E, iMa, 'Barrio') === '',
   'Macri: cambió la dirección (Cabildo 2000 = Belgrano, Comuna 13; el mail dice Comuna 14) → la regla no se cumple y el barrio del sistema se vacía');
ok(fondo(E, iMa, 'Barrio') === null, 'y la celda vaciada queda sin color');

console.log('[4] reprogramación dentro de la semana, suspensión y "ya había pasado" (V3, martes 06/10 8 h)');
const filasAntes = E.D.v.length;
r = correr(E, false, [V1, V2, V3, VIEJO]);
ok(r.mover === 1 && fila(E, 'Clara Muzzio', 10) === iMu && fila(E, 'Clara Muzzio', 8) === -1, 'Muzzio: la fila se MUEVE del 08/10 al 10/10');
ok(E.D.v.length === filasAntes, 'no se crea una segunda fila');
ok(celda(E, iLo, 'STATUS REUNIÓN') === 'Suspendida' && fondo(E, iLo, 'STATUS REUNIÓN') === SIS &&
   celda(E, iLo, 'agenda_status_escrito') === 'Suspendida', 'Lombardi desapareció siendo futura: "Suspendida", en #CFE2F3');
const iSa = fila(E, 'Ezequiel Sabor', 5);
ok(celda(E, iSa, 'STATUS REUNIÓN') === 'en agenda' && r.noFuturas >= 1, 'Sabor (lunes 05/10) ya había pasado cuando salió: NO se suspende');

console.log('[5] reactivar (V4) y la protección del 60%');
r = correr(E, false, [V1, V2, V3, V4, VIEJO]);
ok(celda(E, iLo, 'STATUS REUNIÓN') === 'en agenda' && r.reactivar === 1, 'Lombardi volvió a aparecer: vuelve a "en agenda" (lo había suspendido el sistema)');
const V5 = mail(6, 11, [EV.alonso]);            // una versión con 1 reunión de 5: parcial
r = correr(E, false, [V1, V2, V3, V4, V5, VIEJO]);
ok(r.suspender === 0 && r.saltadas60 >= 3, 'versión parcial: no se suspende nada (' + r.saltadas60 + ' saltadas por la protección)');
ok(celda(E, iLo, 'STATUS REUNIÓN') === 'en agenda', 'Lombardi sigue "en agenda"');

console.log('[6] Seguridad en tu Barrio: la Figura desde RDV CONJUNTO');
E = montar(true, [
  function (r, C) { r[C('EVENTO')] = 'Seguridad en tu Barrio'; r[C('FECHA')] = new D(2026, 9, 1, 12); r[C('Barrio')] = 'Almagro';
                    r[C('STATUS REUNIÓN')] = 'en agenda'; r[C('agenda_uid')] = 'uuid-a'; },
  function (r, C) { r[C('EVENTO')] = 'Seguridad en tu Barrio'; r[C('FECHA')] = new D(2026, 9, 2, 12); r[C('Barrio')] = 'Flores';
                    r[C('STATUS REUNIÓN')] = 'en agenda'; r[C('agenda_uid')] = 'uuid-b'; }]);
const conj = E.ssD.hojas['RDV CONJUNTO'];
conj.v.push(['Sabor Ezequiel', 'Almagro', new D(2026, 9, 1, 12), 30, '', '']);
conj.v.push(['Alonso Laura', 'C7', new D(2026, 9, 2, 12), 20, '', '']);
conj.v.push(['Muzzio Clara', 'Flores', new D(2026, 9, 2, 12), 20, '', '']);
r = correr(E, false, [V1]);
const iS1 = E.D.v.findIndex(function (x) { return x[E.C('agenda_uid')] === 'uuid-a'; });
const iS2 = E.D.v.findIndex(function (x) { return x[E.C('agenda_uid')] === 'uuid-b'; });
ok(celda(E, iS1, 'Figura') === 'Ezequiel Sabor' && fondo(E, iS1, 'Figura') === SIS, 'una sola fila de RDV CONJUNTO ese día en Almagro → Figura "Ezequiel Sabor"');
ok(celda(E, iS2, 'Figura') === '' && r.figuraACompletar === 1, 'dos figuras posibles (Flores y C7) → no se escribe; va a AGENDA_FIGURA_A_COMPLETAR');
ok(E.ssI.hojas['AGENDA_FIGURA_A_COMPLETAR'].v.length === 2, 'la solapa la lista');

console.log('[7] deshacer');
E = montar();
correr(E, false, [V1, VIEJO]);
const despues = E.D.v.length;
const iLaura = fila(E, 'Laura Alonso', 7);
const iMac = fila(E, 'Jorge Macri', 9);
E.D.v[iMac][E.C('Inscriptos')] = 77;           // alguien cargó algo en una fila creada
let d = E.run('deshacerAgenda(true)');
ok(d && d.sacarian === 4 && d.noSeSacan === 1 && E.D.v.length === despues, 'en seco: sacaría 4, la editada no; no toca nada');
d = E.run('deshacerAgenda(false)');
ok(d && d.borradas + d.vaciadas === 4, 'saca las 4 que siguen replicando el mail (borradas ' + d.borradas + ', vaciadas ' + d.vaciadas + ')');
ok(fila(E, 'Jorge Macri', 9) > 0 && E.D.v[fila(E, 'Jorge Macri', 9)][E.C('Inscriptos')] === 77, 'la que tiene Inscriptos cargado queda');
ok(celda(E, iLaura, 'Dirección') === '' && celda(E, iLaura, 'agenda_uid') === '' && fondo(E, iLaura, 'Dirección') === null,
   'la vinculada vuelve a como estaba (Dirección vacía, sin agenda_uid, sin color)');
ok(celda(E, iLaura, 'HORA') === '10:00' && celda(E, iLaura, 'Barrio') === 'Flores', 'y lo del equipo sigue igual');
d = E.run('deshacerAgenda(false)');
ok(d && d.deshecho === 0, 'no se deshace dos veces');

console.log('[8] la guarda de la excepción y la regla con margen');
E = montar();
let error = null;
try { E.run(`escribirAgendaLote_(ssDestino_().getSheetByName('RVD JM-CM - ES'), ${JSON.stringify(E.hdr)}, [{ fila: 2, col: ${E.C('Inscriptos') + 1}, valor: 5, esperado: 100 }])`); }
catch (e) { error = e; }
ok(error && /no la escribe la agenda/.test(error.message) && celda(E, 1, 'Inscriptos') === 100, 'Inscriptos no es columna de la agenda: error, no escribe nada');
error = null;
try { E.run(`escribirAgendaLote_(ssDestino_().getSheetByName('RVD JM-CM - ES'), ${JSON.stringify(E.hdr)}, [{ fila: 2, col: ${E.C('STATUS REUNIÓN') + 1}, valor: 'en agenda', esperado: 'Realizada' }])`); }
catch (e) { error = e; }
ok(error && /no es una transición/.test(error.message) && celda(E, 1, 'STATUS REUNIÓN') === 'Realizada', 'Realizada → en agenda no es una transición de la agenda');
const borde = vm.runInContext(`(function () {
  const p = _poligonosBarrios_(), pa = p.filter(function (b) { return b.barrio === 'Palermo'; })[0];
  for (let i = 0; i < pa.anillos[0].length; i += 2) {
    const x = pa.anillos[0][i] + 0.00012, y = pa.anillos[0][i + 1];
    for (const dx of [0.00012, -0.00012]) for (const dy of [0.00012, -0.00012]) {
      const b = _barrioEnPunto_(pa.anillos[0][i] + dx, pa.anillos[0][i + 1] + dy, p);
      const dist = b && b.barrio === 'Palermo' ? _distanciaAOtroBarrioM_(pa.anillos[0][i] + dx, pa.anillos[0][i + 1] + dy, p, 'Palermo') : null;
      if (dist != null && dist < 50) return _reglaBarrioConMargen_({ estado: 'ok', barrio: 'Palermo', comuna: 14, lat: pa.anillos[0][i + 1] + dy, lng: pa.anillos[0][i] + dx },
                                                                   { comuna: 14, barrio: '' }, p, 100);
    }
  }
  return null;
})()`, E.ctx);
ok(borde && !borde.cumple && /\(c\)/.test(borde.motivo), 'a menos de 100 m de otro barrio: no cumple (c) — ' + (borde && borde.motivo));

console.log('[9] AGENDA_SOLO_SEMANA y las columnas');
E = montar(true, [], { AGENDA_SOLO_SEMANA: "'2026-10-12'" });
r = correr(E, false, [V1]);
ok(r.crear === 0 && r.vincular === 0, 'con AGENDA_SOLO_SEMANA = 12/10, nada de la semana del 05/10');
E = montar(false);
r = correr(E, false, [V1]);
ok(r && /faltan las columnas/.test(r.error || ''), 'sin las columnas de la agenda, la escritura real no corre: ' + (r && r.error));
E.ctx.__x = 1;
const col = E.run('agregarColumnasAgenda(true)');
ok(col.agregadas === 9 && E.D.v[0].slice(-9).join('|') === COLUMNAS_AGENDA.join('|'), 'paso 36: las 9 columnas al final, en orden (desde ' + col.desde + ')');
ok(E.run('agregarColumnasAgenda(true)').agregadas === 0, 'y es idempotente');

console.log('[10] la copia en el archivo "Agenda"');
E = montar();
correr(E, true, [V1]);
const idCopia = E.run('AGENDA_COPIA_SS');
ok(!E.planilla(idCopia).hojas['Agenda'], 'en seco no se escribe la copia');
correr(E, false, [V1]);
correr(E, false, [V1, V2, V3]);
const cp = E.planilla(idCopia).hojas['Agenda'];
ok(cp && cp.v[0].length === 23 && cp.v[0][0] === 'Semana' && cp.v[0][22] === 'Última actualización', 'la solapa con las 23 columnas, en orden');
const enc = cp.v[0], K = function (n) { return enc.indexOf(n); };
const filaCopia = function (fig) { return cp.v.filter(function (x, i) { return i > 0 && x[K('Figura')] === fig; })[0]; };
const cmu = filaCopia('Clara Muzzio');
ok(cmu && cmu[K('Estado en la agenda')] === 'reprogramada' && cmu[K('FECHA')].getDate() === 10 && cmu[K('Fecha original')].getDate() === 8,
   'Muzzio: "reprogramada", FECHA 10/10, Fecha original 08/10');
const clo = filaCopia('Hernán Lombardi');
ok(clo && clo[K('Estado en la agenda')] === 'desaparecida' && clo[K('STATUS en el destino')] === 'Suspendida' && clo[K('No participa')] === 'Gabino Tapia' &&
   clo[K('Conjunta con')] === 'Gabino Tapia', 'Lombardi: "desaparecida", STATUS Suspendida, No participa y Conjunta con');
const cse = cp.v.filter(function (x, i) { return i > 0 && x[K('EVENTO')] === 'Seguridad en tu Barrio'; })[0];
ok(cse && cse[K('Figura')] === '' && cse[K('Barrio calculado')] === 'Almagro' && cse[K('Comuna')] === 'Comuna 5' && cse[K('Fila del destino')] !== '',
   'Seguridad: sin figura, Barrio calculado Almagro, Comuna 5, con su fila del destino');
const cma = filaCopia('Jorge Macri');
ok(cma && cma[K('Barrio calculado')] === '' && cma[K('Sin barrio porque')] === 'otra comuna que la del mail' && cma[K('Comuna')] === 'Comuna 14',
   'Macri: sin barrio porque "otra comuna que la del mail"; la Comuna, la del mail');
const fechas = cp.v.slice(1).map(function (x) { return x[K('FECHA')].getTime(); });
ok(fechas.every(function (t, i) { return i === 0 || t >= fechas[i - 1]; }), 'ordenada por fecha');
ok(cp.proteccion && cp.advertencia === true, 'protegida con advertencia');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
