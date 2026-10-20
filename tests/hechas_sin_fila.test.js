/**
 * tests/hechas_sin_fila.test.js — 19/10: "una reunión que se hizo y no está en la base" (PROMPT-08 punto 4; 53_HechasSinFila.js,
 * AGENDA_AVISO_HECHAS_SIN_FILA, la medición del paso 104 en diagnostico/37_hechas_sin_fila.js). SÓLO AVISO: nunca crea la fila ni
 * escribe la base, y RDV CONJUNTO nunca se escribe. Casos: (a) Macri 15/10 con sólo la fila de Villa Santa Rita Suspendida y RDV
 * CONJUNTO 849 Villa Devoto Realizada 31 → 'solo_suspendida_otro_barrio'; (b) la base con Villa Devoto Realizada + Villa Santa Rita
 * Suspendida → nada; (c) una Realizada sin ninguna fila de la figura ese día → 'sin_fila'; (d) con su fila normal → nada; (e)
 * "Cancelado", sin asistentes, "No aplica", de hoy, sin figura, con una fila sin figura en ese lugar → nada; (f) el interruptor
 * apagado: la agenda hace exactamente lo mismo (mismas acciones, mismas líneas de AGENDA_PENDIENTES) y no lee RDV CONJUNTO para
 * esto. Destino SIMULADO, RDV CONJUNTO y mails SINTÉTICOS (el mock es el de tests/agenda_conjunto_cancela.test.js). "Hoy" es el
 * lunes 19/10/2026.
 *
 *     node tests/hechas_sin_fila.test.js
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: mails, horarios, direcciones y asistentes son inventados;
 * los barrios y comunas son los públicos de la Ciudad; las figuras, nombres de la columna Figura.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', '05_Escritura.js', '20_UpsertDestino.js', '49_Corridas.js',
                  '41_AgendaColores.js', '41_AgendaParser.js', '42_BarriosCabaGeo.js', '40_Agenda.js', '47_AgendaVistas.js', '25_Elecciones.js',
                  '52_CancelacionMail.js', '53_CancelacionConjunto.js', '53_HechasSinFila.js', 'diagnostico/37_hechas_sin_fila.js'];
const HOY = new Date(2026, 9, 19, 12, 0, 0);
/** UNA sola clase de fecha, la misma adentro y afuera del contexto: si no, `instanceof Date` falla adentro. */
class D extends Date {
  constructor(...a) { if (a.length === 0) super(HOY.getTime()); else super(...a); }
  static now() { return HOY.getTime(); }
}
const pad = function (n) { return ('0' + n).slice(-2); };

// ============================== el mock de Apps Script ==============================

function crearEntorno(config) {
  const E = { logs: [], uuid: 0, lecturasConjunto: 0 };
  class Hoja {
    constructor(nombre, v) { this.nombre = nombre; this.v = (v || []).map(function (r) { return r.slice(); }); this.bg = this.v.map(function (r) { return r.map(function () { return null; }); }); }
    _asegurar(f, c) {
      while (this.v.length < f) { this.v.push([]); this.bg.push([]); }
      for (let i = 0; i < f; i++) { while (this.v[i].length < c) { this.v[i].push(''); this.bg[i].push(null); } }
    }
    getRange(f, c, nf, nc) {
      const h = this; nf = nf || 1; nc = nc || 1;
      const leer = function (m) {
        if (h.nombre === 'RDV CONJUNTO' && m === h.v) E.lecturasConjunto++;
        const o = []; for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) { const fila = m[f - 1 + i]; r.push(fila && fila[c - 1 + j] !== undefined ? fila[c - 1 + j] : (m === h.v ? '' : null)); } o.push(r); } return o;
      };
      const rango = {
        getValues: function () { return leer(h.v); },
        getValue: function () { return leer(h.v)[0][0]; },
        getBackgrounds: function () { return leer(h.bg); },
        getFormula: function () { return ''; },
        getFormulas: function () { const o = []; for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) r.push(''); o.push(r); } return o; },
        setValues: function (m) { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.v[f - 1 + i][c - 1 + j] = m[i][j]; return rango; },
        setValue: function (x) { h._asegurar(f, c); h.v[f - 1][c - 1] = x; return rango; },
        setBackground: function (col) { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.bg[f - 1 + i][c - 1 + j] = col; return rango; },
        clearContent: function () { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.v[f - 1 + i][c - 1 + j] = ''; return rango; },
        setNumberFormat: function (fmt) { h.nf = h.nf || {}; for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.nf[(f + i) + ',' + (c + j)] = fmt; return rango; },
        getNumberFormats: function () { const o = []; for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) r.push((h.nf || {})[(f + i) + ',' + (c + j)] || 'General'); o.push(r); } return o; },
        setNumberFormats: function (m) { h.nf = h.nf || {}; for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.nf[(f + i) + ',' + (c + j)] = m[i][j]; return rango; },
        clearFormat: function () { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) { h.bg[f - 1 + i][c - 1 + j] = null; if (h.nf) delete h.nf[(f + i) + ',' + (c + j)]; } return rango; },
        setDataValidation: function (v) { h.validaciones = (h.validaciones || 0) + 1; h.opciones = v; return rango; },
        setFontWeight: function () { return rango; },
        getDataValidation: function () { return null; }
      };
      return rango;
    }
    getRangeList(a1s) {
      const h = this;
      const celda = function (x) { const m = /^([A-Z]+)(\d+)$/.exec(x); let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return [+m[2], n]; };
      return { setNumberFormat: function (fmt) {
        a1s.forEach(function (a1) { const p = celda(a1); h.nf = h.nf || {}; h.nf[p[0] + ',' + p[1]] = fmt; });
      }, setBackground: function (col) {
        a1s.forEach(function (a1) {
          const p = a1.split(':').map(celda), b = p[1] || p[0];
          h.getRange(p[0][0], p[0][1], b[0] - p[0][0] + 1, b[1] - p[0][1] + 1).setBackground(col);
        });
      } };
    }
    getLastRow() { for (let i = this.v.length; i >= 1; i--) if (this.v[i - 1].some(function (x) { return x !== '' && x !== null && x !== undefined; })) return i; return 0; }
    getLastColumn() { let m = 0; this.v.forEach(function (r) { for (let j = r.length; j >= 1; j--) if (r[j - 1] !== '' && r[j - 1] != null) { m = Math.max(m, j); break; } }); return m; }
    getMaxRows() { return Math.max(this.v.length, 1000); }
    getMaxColumns() { return Math.max(this.getLastColumn(), 26); }
    getName() { return this.nombre; }
    insertRowsAfter() {}
    deleteRows(f, n) { this.v.splice(f - 1, n); this.bg.splice(f - 1, n); }
    deleteRow(f) { this.deleteRows(f, 1); }
    appendRow(r) { const f = this.getLastRow() + 1; this.getRange(f, 1, 1, r.length).setValues([r]); }
    setFrozenRows() {}
    clear() { this.v = []; this.bg = []; }
    getProtections() { return []; }
    protect() {
      const h = this;
      const pr = { setDescription: function (d) { h.proteccion = d; return pr; }, getDescription: function () { return h.proteccion; },
                   setWarningOnly: function (w) { h.advertencia = w; return pr; }, setUnprotectedRanges: function (r) { h.libres = r.length; return pr; },
                   isWarningOnly: function () { return !!h.advertencia; },
                   addEditor: function () { if (h.advertencia) throw new Error('Exception: isWarningOnly'); return pr; },
                   getEditors: function () { return []; }, removeEditors: function () { return pr; },
                   canDomainEdit: function () { return false; }, setDomainEdit: function () { return pr; } };
      return pr;
    }
    hideColumns() {}
    autoResizeColumns() {}
    clearContents() { this.v = this.v.map(function (r) { return r.map(function () { return ''; }); }); }
  }
  E.Hoja = Hoja;
  const planillas = {};
  E.planilla = function (id) {
    if (!planillas[id]) planillas[id] = { hojas: {}, getSheetByName: function (n) { return this.hojas[n] || null; },
                                           insertSheet: function (n) { this.hojas[n] = new Hoja(n, []); return this.hojas[n]; },
                                           getSheets: function () { return Object.keys(this.hojas).map(function (k) { return this.hojas[k]; }, this); },
                                           deleteSheet: function (sh) { delete this.hojas[sh.nombre]; } };
    return planillas[id];
  };
  const ctx = {
    console: console, Date: D, Math: Math, JSON: JSON, Map: Map, Set: Set, Object: Object, Array: Array, String: String, Number: Number,
    Logger: { log: function () { const a = Array.prototype.slice.call(arguments); let s = String(a.shift()); s = s.replace(/%s/g, function () { return String(a.shift()); }).replace(/%%/g, '%'); E.logs.push(s); } },
    Utilities: {
      formatDate: function (d, tz, f) { return f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate())).replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds())); },
      getUuid: function () { E.uuid++; return 'uuid-' + E.uuid + '-xxxx'; }, sleep: function () {},
      DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: function (alg, t) {
        return Array.from(crypto.createHash('md5').update(String(t), 'utf8').digest()).map(function (b) { return b > 127 ? b - 256 : b; });
      }
    },
    SpreadsheetApp: { openById: function (id) { return E.planilla(id); },
                      flush: function () {}, ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
                      newDataValidation: function () { const b = { lista: null, requireValueInList: function (l) { b.lista = l; return b; },
                        setAllowInvalid: function () { return b; }, build: function () { return b.lista; } }; return b; } },
    Session: { getEffectiveUser: function () { return { getEmail: function () { return 'yo@test'; } }; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    // el sistema de avisos (50_Avisos.js): acá sólo se anotan; true = "quedó para mandar" (así _avisarInfoAgenda_ lo marca como avisado)
    registrarAviso_: function (tema, texto) { (E.avisos = E.avisos || []).push([tema, texto]); return true; },
    PropertiesService: { getScriptProperties: function () { E.props = E.props || {}; return { getProperty: function (k) { return k in E.props ? E.props[k] : null; }, setProperty: function (k, v) { E.props[k] = String(v); }, deleteProperty: function (k) { delete E.props[k]; } }; } }
  };
  vm.createContext(ctx);
  // cada escenario parte de todo lo nuevo APAGADO (no depende de cómo quedó 00_Config.js) y prende lo suyo por `config`
  const cfg = Object.assign({ DERIVADAS_POR_SCRIPT: 'false', AGENDA_SOLO_SEMANA: 'null', AGENDA_CANCELACION_AUTOMATICA: 'false',
    AGENDA_SEGURIDAD_POR_COMUNA: 'false', AGENDA_BARRIO_DEL_MAIL: 'false', CONJUNTO_REPETIDA_POR_UBICACION: 'true',
    AGENDA_CREAR_SOLO_IDENTIFICADAS: 'false', AGENDA_CONCILIACION_SEMANAL: 'false', AGENDA_ELECCIONES_SIEMPRE: 'false',
    AGENDA_INVARIANTE_UNA_FILA: 'false', AGENDA_VALIDAR_MAILS: 'false', AGENDA_COLORES_MAIL: 'false', AGENDA_CANCELACION_CONJUNTO: 'false',
    AGENDA_AVISO_HECHAS_SIN_FILA: 'false' }, config || {});
  ARCHIVOS.forEach(function (f) {
    let s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    if (f === '00_Config.js') Object.keys(cfg).forEach(function (k) { s = s.replace(new RegExp('^const ' + k + '\\s+=.*', 'm'), 'const ' + k + ' = ' + cfg[k] + ';'); });
    vm.runInContext(s, ctx, { filename: f });
  });
  // para comparar las ACCIONES de la agenda: el plan que llega a escribirse
  vm.runInContext('var __plan = null; var __aplicar = aplicarPlanAgenda_; aplicarPlanAgenda_ = function (a, b, p, c) { __plan = p; return __aplicar(a, b, p, c); };', ctx);
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
  'agenda_direccion_escrita', 'agenda_barrio_escrito', 'agenda_fecha_escrita', 'agenda_status_escrito',
  'Origen fila', 'Tocado por el equipo', 'Evento (mail)', 'Lugar (mail)', 'Dirección (mail)', 'Marcas (mail)', 'Conjunta con'];
const BARRIOS = [['Recoleta', 2], ['Palermo', 14], ['Almagro', 5], ['Boedo', 5], ['Belgrano', 13], ['Núñez', 13],
  ['Colegiales', 13], ['Flores', 7], ['Parque Chacabuco', 7], ['San Nicolás', 1], ['Monserrat', 1], ['Villa Urquiza', 12],
  ['Villa Santa Rita', 11], ['Villa Devoto', 11]];
const FIGURAS = ['Clara Muzzio', 'Jorge Macri', 'Hernán Lombardi', 'Gabino Tapia', 'Laura Alonso', 'Ezequiel Sabor'];
const dia = function (d) { return new D(2026, 9, d, 12, 0, 0); };

/** La base: el historial de septiembre (una fila Realizada por figura) + `extra`; RDV CONJUNTO = `conjunto`. */
function montar(extra, config, conjunto) {
  const E = crearEntorno(config);
  const hdr = HDR.concat(COLUMNAS_AGENDA);
  const C = function (n) { return hdr.indexOf(n); };
  const filas = [hdr];
  FIGURAS.forEach(function (fig, i) {
    const r = hdr.map(function () { return ''; });
    r[C('Figura')] = fig; r[C('Barrio')] = BARRIOS[i][0]; r[C('FECHA')] = new D(2026, 8, 10 + i, 12); r[C('HORA')] = '18:00';
    r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = 'Realizada'; r[C('Inscriptos')] = 100 + i;
    filas.push(r);
  });
  (extra || []).forEach(function (fn) { const r = hdr.map(function () { return ''; }); fn(r, C); filas.push(r); });
  const ssD = E.planilla(E.run('RDV_SS_DESTINO')), ssI = E.planilla(E.run('RDV_SS_INTERMEDIA'));
  ssD.hojas['RVD JM-CM - ES'] = new E.Hoja('RVD JM-CM - ES', filas);
  ssD.hojas['Comunas'] = new E.Hoja('Comunas', [['Barrio', 'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona', 'Eje geográfico']]
    .concat(BARRIOS.map(function (b) { return [b[0], b[1], 1, 1, 1, 1, 1, 'Centro', '']; })));
  ssD.hojas['RDV CONJUNTO'] = new E.Hoja('RDV CONJUNTO', [['Figura', 'Barrio', 'FECHA', 'Dirección', 'Asistentes', 'Oradores anotados', 'Oradores que hablaron', 'Estado']]
    .concat((conjunto || []).map(function (r) { return r.slice(); })));
  E.D = ssD.hojas['RVD JM-CM - ES']; E.ssI = ssI; E.ssD = ssD; E.C = C; E.hdr = hdr;
  return E;
}

let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }
const foto = function (h) { return JSON.stringify({ v: h.v, bg: h.bg }); };
const sinUuid = function (s) { return String(s).replace(/uuid-\d+-xxxx/g, 'u').replace(/[cv]-u/g, 'u'); };
/** Una fila del equipo en la base (sin agenda_uid). */
const filaEquipo = function (fig, barrio, d, extra) {
  return function (r, C) {
    r[C('Figura')] = fig; r[C('Barrio')] = barrio; r[C('FECHA')] = dia(d); r[C('HORA')] = (extra && extra.hora) || '18:00';
    r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = (extra && extra.status) || 'en agenda';
    if (extra && extra.dir) r[C('Dirección')] = extra.dir;
    if (extra && extra.asis != null) r[C('Asistentes')] = extra.asis;
  };
};
/** Una fila de RDV CONJUNTO: Figura | Barrio | FECHA | Dirección | Asistentes | Oradores anotados | Oradores que hablaron | Estado. */
const cj = function (nombre, barrio, d, dir, asis, estado, oradores) {
  return [nombre, barrio, dia(d), dir || '', asis == null ? '' : asis, oradores ? oradores[0] : '', oradores ? oradores[1] : '', estado];
};
const conj = function (E) { return E.ssD.hojas['RDV CONJUNTO']; };
/** La función pura, con el cruce de los Asistentes, desde el 15/07 hasta hoy (excluido). */
const pura = function (E) {
  return E.run('(function () { const d = leerDestino_(), c = leerComunasMap_(); return reunionesHechasSinFila_(d, cruzarAsistentes_(d, c), c, ' +
               '{ desde: toDate_("2026-07-15"), hasta: hoyMediodia_() }); })()');
};
const pendientes = function (E) { const h = E.ssI.hojas['AGENDA_PENDIENTES']; return h ? h.v.slice(1).filter(function (r) { return r.some(Boolean); }) : []; };
const hechasEnPendientes = function (E) { return pendientes(E).filter(function (r) { return r[0] === 'se hizo y no está en la base'; }); };
// un mail (inventado) con dos reuniones de la semana pasada: la agenda tiene algo que hacer en cada corrida
const NL = String.fromCharCode(10);
const M1 = { fecha: new D(2026, 9, 12, 9, 0), asunto: 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 12/10 al 18/10', truncado: false, id: 'm1',
             cuerpo: ['*Miércoles 14/10*', 'Evento: Encuentro con Vecinos Clara Muzzio, Recoleta', 'Hora: 18:30h', 'Lugar: Calle Inventada 1234, Club Social',
                      '*Jueves 15/10*', 'Evento: Encuentro con Vecinos Ezequiel Sabor, Comuna 5', 'Hora: 09:45h', 'Lugar: Calle Inventada 1000, Club'].join(NL) };
function correr(E, extra) {
  E.ctx.__mails = [M1]; E.ctx.__extra = extra || {};
  return E.run('correrAgendaEnBloqueo_(false, Object.assign({ mails: __mails, geocodificar: function (q) { return { consulta: q, estado: "ZERO_RESULTS" }; } }, __extra))');
}
const A_CONFIRMAR = 'A CONFIRMAR (NO SE COMUNICA LA DIRECCIÓN)';
const VSR_SUSP = filaEquipo('Jorge Macri', 'Villa Santa Rita', 15, { status: 'Suspendida', hora: '09:15', dir: A_CONFIRMAR });
const VD_REAL = filaEquipo('Jorge Macri', 'Villa Devoto', 15, { status: 'Realizada', hora: '09:15', dir: A_CONFIRMAR, asis: 31 });
const PAR_MACRI = [cj('Macri Jorge', 'Villa Santa Rita', 15, 'Calle Inventada 4025', '', 'Cancelado'),
                   cj('Macri Jorge', 'Villa Devoto', 15, 'Calle Inventada 4025', 31, 'Realizada', [5, 3])];

// ============================== (a) el caso Macri 15/10 ==============================

console.log('[a] Macri 15/10: la base sólo tiene Villa Santa Rita Suspendida; RDV CONJUNTO tiene Villa Devoto Realizada 31');
let E = montar([VSR_SUSP], {}, PAR_MACRI);
let R = pura(E);
ok(!R.error && R.lista.length === 1, 'una reunión hecha sin fila: ' + R.lista.length + (R.error ? ' (' + R.error + ')' : ''));
let h = R.lista[0] || {};
ok(h.motivo === 'solo_suspendida_otro_barrio', 'motivo solo_suspendida_otro_barrio: ' + h.motivo);
ok(h.figura === 'Jorge Macri' && h.barrio === 'Villa Devoto' && h.direccion === 'Calle Inventada 4025' && h.asistentes === 31 && h.estado === 'Realizada' &&
   h.conjuntoFila === 3 && h.fecha instanceof Date && h.fecha.getDate() === 15, 'todos los datos para cargarla (figura, fecha, barrio, dirección, Estado, asistentes, fila de RDV CONJUNTO)');
ok(h.oradores && h.oradores['Oradores anotados'] === 5 && h.oradores['Oradores que hablaron'] === 3, 'y los oradores');
ok(h.candidatas && h.candidatas.length === 1 && h.candidatas[0].barrio === 'Villa Santa Rita' && h.candidatas[0].status === 'Suspendida',
   'la candidata: la fila de Villa Santa Rita, Suspendida — ' + JSON.stringify(h.candidatas));
ok(h.id === 'hecha_sin_fila|jorge macri|20261015|villa devoto', 'id estable: ' + h.id);
ok(/RDV CONJUNTO fila 3/.test(h.texto) && /Villa Devoto/.test(h.texto) && /31 asistentes/.test(h.texto) && /sólo tiene fila \d+ \(Villa Santa Rita, "Suspendida"/.test(h.texto),
   'el texto: ' + h.texto);
// con la regla de RDV CONJUNTO repetido apagada, lo mismo (el criterio no depende de cómo se reparten los asistentes)
E = montar([VSR_SUSP], { CONJUNTO_REPETIDA_POR_UBICACION: 'false' }, PAR_MACRI);
R = pura(E);
ok(R.lista.length === 1 && R.lista[0].motivo === 'solo_suspendida_otro_barrio', 'igual con CONJUNTO_REPETIDA_POR_UBICACION apagado');
// la Suspendida en el MISMO barrio que la Realizada: no es "otro barrio" (puede ser la misma reunión): nada
E = montar([filaEquipo('Jorge Macri', 'Villa Devoto', 15, { status: 'Suspendida' })], {}, [PAR_MACRI[1]]);
ok(pura(E).lista.length === 0, 'una Suspendida en el MISMO barrio que la Realizada: nada (no es otra reunión)');
// la Suspendida sin barrio (no se puede comparar): nada
E = montar([filaEquipo('Jorge Macri', '', 15, { status: 'Suspendida' })], {}, [PAR_MACRI[1]]);
ok(pura(E).lista.length === 0, 'una Suspendida SIN barrio (no se puede comparar): nada');
// la candidata en otro barrio pero "en agenda" (no Suspendida): los asistentes van ahí, es de la base: nada
E = montar([filaEquipo('Jorge Macri', 'Villa Santa Rita', 15)], {}, [PAR_MACRI[1]]);
ok(pura(E).lista.length === 0, 'la única candidata en otro barrio pero "en agenda": nada (es la fila que tiene la base)');

// ============================== (b) lo que va a quedar después del punto 2 ==============================

console.log('[b] la base con Villa Devoto Realizada (31) + Villa Santa Rita Suspendida (la fila nueva): ningún aviso');
E = montar([VD_REAL, VSR_SUSP], {}, PAR_MACRI);
R = pura(E);
ok(R.lista.length === 0, 'ningún aviso: ' + JSON.stringify(R.lista.map(function (x) { return x.texto; })));
ok(R.cuenta.conFila === 1, 'la Realizada tiene su fila (la de Villa Devoto): conFila ' + R.cuenta.conFila);
// y la base de HOY (sólo la 824 con Villa Devoto Realizada): tampoco
E = montar([VD_REAL], {}, PAR_MACRI);
ok(pura(E).lista.length === 0, 'la base de hoy (una sola fila de Macri 15/10, Villa Devoto Realizada): nada');

// ============================== (c) sin ninguna fila de la figura ese día ==============================

console.log('[c] una Realizada de RDV CONJUNTO sin ninguna fila de la figura ese día → sin_fila');
E = montar([filaEquipo('Gabino Tapia', 'Núñez', 14, { status: 'Realizada', asis: 10 })], {},
           [cj('Tapia Gabino', 'Belgrano', 16, 'Calle Inventada 77', 20, 'Realizada'), cj('Sabor Ezequiel', 'Almagro', 13, '', 12, 'Programado')]);
R = pura(E);
const tapia = R.lista.filter(function (x) { return x.figura === 'Gabino Tapia'; })[0] || {};
ok(tapia.motivo === 'sin_fila' && tapia.barrio === 'Belgrano' && tapia.asistentes === 20 && tapia.candidatas.length === 0, 'Tapia 16/10 Belgrano: sin_fila, sin candidatas');
ok(tapia.cercanas && tapia.cercanas.length === 1 && tapia.cercanas[0].barrio === 'Núñez' && /¿la fecha está corrida\?/.test(tapia.texto),
   'y dice que la base tiene la fila de Tapia del 14/10 a pocos días — ' + tapia.texto);
const sabor = R.lista.filter(function (x) { return x.figura === 'Ezequiel Sabor'; })[0] || {};
ok(sabor.motivo === 'sin_fila' && sabor.estado === 'Programado' && sabor.asistentes === 12, 'Sabor 13/10 "Programado" con 12 asistentes: también (Realizada O con asistentes)');
ok(R.lista.length === 2 && R.cuenta.sinFila === 2, 'dos sin_fila');

// ============================== (d) con su fila normal ==============================

console.log('[d] una Realizada con su fila normal → nada');
E = montar([filaEquipo('Ezequiel Sabor', 'Almagro', 14, { status: 'Realizada' }), filaEquipo('Clara Muzzio', 'Recoleta', 13)], {},
           [cj('Sabor Ezequiel', 'Almagro', 14, '', 25, 'Realizada'), cj('Muzzio Clara', 'Palermo', 13, '', 40, 'Realizada')]);
R = pura(E);
ok(R.lista.length === 0 && R.cuenta.conFila === 2, 'nada (las dos tienen fila; la de Muzzio en otro barrio pero "en agenda": la de la base)');

// ============================== (e) lo que no cuenta ==============================

console.log('[e] "Cancelado", sin asistentes, "No aplica", de hoy, sin figura, una fila sin figura en ese lugar, una conjunta → nada');
E = montar([function (r, C) { r[C('Barrio')] = 'Flores'; r[C('FECHA')] = dia(12); r[C('EVENTO')] = 'Encuentro con Vecinos'; r[C('STATUS REUNIÓN')] = 'Realizada'; },
            function (r, C) { r[C('Figura')] = 'Clara Muzzio'; r[C('Conjunta con')] = 'Laura Alonso'; r[C('Barrio')] = 'Boedo'; r[C('FECHA')] = dia(9); r[C('STATUS REUNIÓN')] = 'Realizada'; }], {},
           [cj('Lombardi Hernán', 'Palermo', 13, '', 30, 'Cancelado'),
            cj('Muzzio Clara', 'Recoleta', 13, '', '', 'Programado'),
            cj('Alonso Laura', 'Flores', 7, '', 'No aplica', 'Realizada'),
            cj('Tapia Gabino', 'Núñez', 19, '', 15, 'Realizada'),
            cj('Seguridad en tu barrio', 'Colegiales', 12, '', 20, 'Realizada'),
            cj('Sabor Ezequiel', 'Flores', 12, '', 18, 'Realizada'),
            cj('Alonso Laura', 'Boedo', 9, '', 22, 'Realizada'),
            ['Tapia Gabino', 'Núñez', new D(2026, 5, 1, 12), '', 9, '', '', 'Realizada']]);
R = pura(E);
ok(R.lista.length === 0, 'ningún aviso: ' + JSON.stringify(R.lista.map(function (x) { return x.texto; })));
ok(R.cuenta.noAplica === 1 && R.cuenta.sinFigura === 1 && R.cuenta.filaSinFigura === 1 && R.cuenta.enConjunta === 1 && R.cuenta.fueraDeFecha >= 2,
   'contadas aparte: "No aplica" 1, sin figura 1, fila sin figura en ese lugar 1, en una conjunta 1, fuera de fecha (hoy y junio) ' + JSON.stringify(R.cuenta));

// ============================== la agenda, PRENDIDA ==============================

console.log('[g] la agenda con AGENDA_AVISO_HECHAS_SIN_FILA prendido: una línea en AGENDA_PENDIENTES y el aviso diario UNA vez; nunca escribe la base');
const ON = { AGENDA_AVISO_HECHAS_SIN_FILA: 'true' };
const caso = function (cfg) { return montar([VSR_SUSP, filaEquipo('Ezequiel Sabor', 'Almagro', 15, { hora: '09:45' })], cfg, PAR_MACRI.concat([cj('Tapia Gabino', 'Belgrano', 16, '', 20, 'Realizada')])); };
E = caso(ON);
let fotoCj = foto(conj(E)); E.avisos = [];
let res = correr(E);
let lineas = hechasEnPendientes(E);
ok(res.hechasSinFila === 2 && lineas.length === 2, 'dos líneas "se hizo y no está en la base" (Macri 15/10 y Tapia 16/10): ' + lineas.length);
const lm = lineas.filter(function (l) { return /Jorge Macri/.test(l[1]); })[0] || [];
ok(/Villa Devoto/.test(lm[1]) && /Calle Inventada 4025/.test(lm[1]) && /31 asistentes/.test(lm[8]) && lm[9].indexOf('marcar "no va (fuera de nuestros canales)"') >= 0 &&
   lm[11] === 'hecha_sin_fila|jorge macri|20261015|villa devoto', 'la de Macri: reunión, qué pasa, qué sigue e id — ' + JSON.stringify(lm));
const info = (E.avisos || []).filter(function (a) { return a[0] === 'agenda_info' && /SE HIZO Y NO ESTÁ EN LA BASE/.test(a[1]); });
ok(info.length === 2, 'aviso diario agenda_info: uno por reunión (' + info.length + ')');
E.avisos = [];
res = correr(E);
ok(hechasEnPendientes(E).length === 2 && !(E.avisos || []).some(function (a) { return a[0] === 'agenda_info' && /SE HIZO Y NO ESTÁ/.test(a[1]); }),
   'la corrida siguiente: las líneas siguen (es un estado) y el aviso NO se repite');
ok(foto(conj(E)) === fotoCj, 'RDV CONJUNTO NO se escribió');
// el equipo carga la fila de Villa Devoto: la línea de Macri se va sola
E.D.v.push(E.hdr.map(function () { return ''; })); VD_REAL(E.D.v[E.D.v.length - 1], E.C); E.D.bg.push(E.hdr.map(function () { return null; }));
res = correr(E);
ok(hechasEnPendientes(E).length === 1 && /Gabino Tapia/.test(hechasEnPendientes(E)[0][1]), 'el equipo cargó Villa Devoto: queda sólo la de Tapia');
// 20/10 (prompt 09, punto 4): el administrador marca la de Tapia "no va (fuera de nuestros canales)": se guarda por su id y no vuelve
{
  const hp = E.ssI.hojas['AGENDA_PENDIENTES'];
  const iNo = hp.v[0].indexOf('no va'), iId = hp.v[0].indexOf('id');
  ok(iNo >= 0, 'AGENDA_PENDIENTES tiene la columna "no va"');
  for (let i = 1; i < hp.v.length; i++) if (/^hecha_sin_fila\|gabino tapia/.test(hp.v[i][iId])) hp.v[i][iNo] = 'no va (fuera de nuestros canales)';
  E.avisos = [];
  correr(E);
  const nv = E.ssI.hojas['HECHAS_NO_VAN'];
  ok(nv && nv.v.some(function (r) { return /^hecha_sin_fila\|gabino tapia/.test(r[0]); }), 'HECHAS_NO_VAN guardó la marca (por su id: figura, fecha y lugar)');
  ok(hechasEnPendientes(E).length === 0 && !(E.avisos || []).some(function (a) { return /Gabino Tapia/.test(a[1] || ''); }), 'la línea de Tapia ya no está y no se avisa');
  correr(E);
  ok(hechasEnPendientes(E).length === 0, 'y en la corrida siguiente tampoco vuelve');
}
// una corrida que CREA la fila de esa figura ese día no avisa (la próxima la vuelve a mirar)
{
  const X = montar([], ON, [cj('Muzzio Clara', 'Recoleta', 14, '', 40, 'Realizada')]);
  correr(X);
  const creo = X.ctx.__plan && X.ctx.__plan.acciones.some(function (a) { return a.tipo === 'crear' && (a.ev.figuras || []).indexOf('Clara Muzzio') >= 0; });
  ok(creo ? hechasEnPendientes(X).length === 0 : true, 'la agenda crea la fila de Muzzio 14/10 en esta corrida: no se avisa' + (creo ? '' : ' (esta agenda no la creó: no aplica)'));
}

// ============================== (f) el interruptor apagado ==============================

console.log('[f] AGENDA_AVISO_HECHAS_SIN_FILA apagado: la agenda hace exactamente lo mismo (acciones, base, AGENDA_PENDIENTES) y no lee RDV CONJUNTO');
const acciones = function (X) {
  const p = X.ctx.__plan;
  return sinUuid(JSON.stringify((p ? p.acciones : []).map(function (a) {
    return { t: a.tipo, e: (a.escrituras || []).map(function (e) { return [e.fila, e.col, e.valor instanceof Date ? e.valor.getTime() : e.valor]; }) };
  })));
};
const correrUna = function (cfg, conjunto) {
  const X = montar([VSR_SUSP, filaEquipo('Ezequiel Sabor', 'Almagro', 15, { hora: '09:45' })], cfg, conjunto);
  const rr = correr(X);
  return { X: X, acc: acciones(X), base: sinUuid(foto(X.D)), pend: JSON.stringify(pendientes(X).map(function (r) { return r.slice(0, 10); })),
           r: rr, lect: X.lecturasConjunto };
};
const conDatos = PAR_MACRI.concat([cj('Tapia Gabino', 'Belgrano', 16, '', 20, 'Realizada')]);
const off1 = correrUna({}, conDatos), off0 = correrUna({}, []), on1 = correrUna(ON, conDatos);
ok(off1.acc === off0.acc && off1.base === off0.base && off1.pend === off0.pend, 'apagado: mismas acciones, misma base, mismas líneas de AGENDA_PENDIENTES con o sin las reuniones hechas');
ok(off1.r.hechasSinFila === undefined && !off1.X.logs.some(function (l) { return /SE HIZO Y NO ESTÁ/.test(l); }), 'apagado: ni el resumen ni el log lo nombran');
ok(off1.lect === 0 && on1.lect >= 1, 'apagado: RDV CONJUNTO no se lee (' + off1.lect + ' lecturas); prendido, sí (' + on1.lect + ')');
ok(on1.acc === off1.acc && on1.base === off1.base, 'prendido: las MISMAS acciones y la misma base que apagado (sólo avisa)');
ok(hechasEnPendientes(off1.X).length === 0 && hechasEnPendientes(on1.X).length === 2, 'y sólo prendido aparecen las dos líneas');
ok(/const AGENDA_AVISO_HECHAS_SIN_FILA = true;/.test(fs.readFileSync(path.join(RAIZ, '00_Config.js'), 'utf8')), '00_Config.js: AGENDA_AVISO_HECHAS_SIN_FILA = true (prendido el 20/10)');

// ============================== la medición en seco (paso 104) ==============================

console.log('[h] medirHechasSinFila("2026-07-15"): sólo lectura');
E = montar([VSR_SUSP], {}, PAR_MACRI.concat([cj('Tapia Gabino', 'Belgrano', 16, '', 20, 'Realizada'), ['Tapia Gabino', 'Núñez', new D(2026, 5, 1, 12), '', 9, '', '', 'Realizada']]));
const todas = function (X) {
  const t = {};
  [X.ssD, X.ssI].forEach(function (ss, k) { Object.keys(ss.hojas).forEach(function (n) { t[k + ':' + n] = foto(ss.hojas[n]); }); });
  return JSON.stringify(t) + JSON.stringify(X.props || {});
};
const antes = todas(E);
const M = E.run('medirHechasSinFila("2026-07-15")');
ok(todas(E) === antes, 'no escribió NADA (ninguna solapa de la base ni de la intermedia, ninguna propiedad)');
ok(M.total === 2 && M.sinFila === 1 && M.soloSuspendida === 1 && M.enAlcance === 2, 'dos (Macri sólo Suspendida + Tapia sin fila), las dos en el alcance — ' +
   JSON.stringify({ t: M.total, s: M.sinFila, ss: M.soloSuspendida, a: M.enAlcance }));
ok(M.lineas.some(function (l) { return /^15\/10\/2026 \| Jorge Macri \| Villa Devoto \| Calle Inventada 4025 \| "Realizada", asistentes 31 \| SÓLO UNA SUSPENDIDA/.test(l) && /candidatas: fila \d+ \(Villa Santa Rita, "Suspendida"/.test(l); }),
   'la línea de Macri: fecha, figura, barrio, dirección, asistentes, motivo y candidata');
ok(E.logs.some(function (l) { return /^--- RESUMEN/.test(l); }), 'el log termina con el RESUMEN');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
