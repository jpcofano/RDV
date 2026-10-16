/**
 * tests/agenda_rojo_cancela.test.js — 15/10 (noche): "EL MAIL MANDA". CANCELADA EN EL MAIL = SUSPENDIDA: la reunión en ROJO
 * ENTERO (Evento, Hora y Lugar) en la última versión válida (AGENDA_COLORES_MAIL, 41_AgendaColores.js), el TIEMPO del mail
 * (anterior a la reunión), sólo "en agenda", la nota "SE CANCELA …", la fila suspendida que recibe asistentes
 * (suspendida_con_datos), los pasos 91 / 92 (52_CancelacionMail.js) y 93 (diagnostico/35), la auditoría (paso 66) con el color,
 * AMARILLO / VERDE en la copia, y todo APAGADO = igual que antes. Destino SIMULADO y mails SINTÉTICOS (el mock es el de
 * tests/agenda_segura_1510.test.js). "Hoy" es el jueves 15/10/2026.
 *
 *     node tests/agenda_rojo_cancela.test.js
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: mails, horarios y direcciones son inventados; los
 * barrios y comunas son los públicos de la Ciudad; las figuras, nombres de la columna Figura.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', '05_Escritura.js', '20_UpsertDestino.js', '49_Corridas.js',
                  '41_AgendaColores.js', '41_AgendaParser.js', '42_BarriosCabaGeo.js', '40_Agenda.js', '47_AgendaVistas.js', '25_Elecciones.js',
                  '52_CancelacionMail.js', 'diagnostico/17_peso_intermedia.js', 'diagnostico/08_verificar_escritura.js',
                  'diagnostico/29_auditoria_agenda.js', 'diagnostico/31_auditoria_cancelaciones.js', 'diagnostico/35_cancelaciones_mail.js'];
const HOY = new Date(2026, 9, 15, 12, 0, 0);
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
        getFormulas: function () { const o = []; for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) r.push(''); o.push(r); } return o; },
        setValues: function (m) { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) {
          let x = m[i][j];
          // como Sheets en español: "3 de 3" se lee como el 3 de marzo (46084), salvo en una celda con formato texto
          const dm = typeof x === 'string' && /^(\d{1,2}) de (\d{1,2})$/.exec(x);
          if (dm && ((h.nf || {})[(f + i) + ',' + (c + j)] !== '@')) x = 46022 + (+dm[2] === 3 ? 59 + (+dm[1]) : 0);
          h.v[f - 1 + i][c - 1 + j] = x;
        } return rango; },
        setValue: function (x) { h._asegurar(f, c); h.v[f - 1][c - 1] = x; return rango; },
        setBackground: function (col) { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.bg[f - 1 + i][c - 1 + j] = col; return rango; },
        clearContent: function () { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.v[f - 1 + i][c - 1 + j] = ''; return rango; },
        setNumberFormat: function (fmt) { h.nf = h.nf || {}; for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.nf[(f + i) + ',' + (c + j)] = fmt; return rango; },
        getNumberFormats: function () { const o = []; for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) r.push((h.nf || {})[(f + i) + ',' + (c + j)] || 'General'); o.push(r); } return o; },
        setNumberFormats: function (m) { h.nf = h.nf || {}; for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) h.nf[(f + i) + ',' + (c + j)] = m[i][j]; return rango; },
        clearFormat: function () { h._asegurar(f + nf - 1, c + nc - 1); for (let i = 0; i < nf; i++) for (let j = 0; j < nc; j++) { h.bg[f - 1 + i][c - 1 + j] = null; if (h.nf) delete h.nf[(f + i) + ',' + (c + j)]; } return rango; },
        setDataValidation: function (v) { h.validaciones = (h.validaciones || 0) + 1; h.opciones = v; return rango; },
        setFontWeight: function () { return rango; },
        getDataValidation: function () { return E.validacion || null; }
      };
      return rango;
    }
    getRangeList(a1s) {
      const h = this;
      return { setNumberFormat: function (fmt) {
        a1s.forEach(function (a1) {
          const m = /^([A-Z]+)(\d+)$/.exec(a1); let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64;
          h.nf = h.nf || {}; h.nf[(+m[2]) + ',' + n] = fmt;
        });
      }, setBackground: function (col) {
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
                   // como Google (07/10): una protección de advertencia no acepta editores
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
    console: console, Date: FakeDate, Math: Math, JSON: JSON, Map: Map, Set: Set, Object: Object, Array: Array, String: String, Number: Number,
    Logger: { log: function () { const a = Array.prototype.slice.call(arguments); let s = String(a.shift()); s = s.replace(/%s/g, function () { return String(a.shift()); }).replace(/%%/g, '%'); E.logs.push(s); } },
    Utilities: {
      formatDate: function (d, tz, f) { return f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate())).replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds())); },
      getUuid: function () { E.uuid++; return 'uuid-' + E.uuid + '-xxxx'; }, sleep: function (ms) { (E.esperas = E.esperas || []).push(ms); },
      // el hash de las huellas del plan (07/10: el paso 51 corre el cruce acá)
      DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: function (alg, t) {
        return Array.from(crypto.createHash('md5').update(String(t), 'utf8').digest()).map(function (b) { return b > 127 ? b - 256 : b; });
      }
    },
    SpreadsheetApp: { openById: function (id) { if (E.fallarAbrir && E.fallarAbrir(id)) throw new Error('Service Spreadsheets timed out'); return E.planilla(id); },
                      flush: function () {}, ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
                      newDataValidation: function () { const b = { lista: null, requireValueInList: function (l) { b.lista = l; return b; },
                        setAllowInvalid: function () { return b; }, build: function () { return b.lista; } }; return b; } },
    Session: { getEffectiveUser: function () { return { getEmail: function () { return 'yo@test'; } }; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    // el sistema de avisos (50_Avisos.js, de otro agente): acá sólo se anotan
    registrarAviso_: function (tema, texto) { (E.avisos = E.avisos || []).push([tema, texto]); },
    PropertiesService: { getScriptProperties: function () { E.props = E.props || {}; return { getProperty: function (k) { return k in E.props ? E.props[k] : null; }, setProperty: function (k, v) { E.props[k] = String(v); }, deleteProperty: function (k) { delete E.props[k]; } }; } }
  };
  vm.createContext(ctx);
  const cfg = Object.assign({ DERIVADAS_POR_SCRIPT: 'false', AGENDA_SOLO_SEMANA: 'null', AGENDA_CANCELACION_AUTOMATICA: 'true', AGENDA_CANCELACION_MODO: "'regla7'",
    // 16/10: la etapa 1 quedó PRENDIDA en 00_Config.js; cada escenario parte de todo APAGADO y prende lo suyo por `config`
    AGENDA_SEGURIDAD_POR_COMUNA: 'false', AGENDA_BARRIO_DEL_MAIL: 'false', CONJUNTO_REPETIDA_POR_UBICACION: 'false',
    AGENDA_CREAR_SOLO_IDENTIFICADAS: 'false', AGENDA_CONCILIACION_SEMANAL: 'false', AGENDA_ELECCIONES_SIEMPRE: 'false',
    AGENDA_INVARIANTE_UNA_FILA: 'false', AGENDA_VALIDAR_MAILS: 'false', AGENDA_COLORES_MAIL: 'false' }, config || {});   // el alcance de cada escenario no depende de cómo quedó 00_Config.js
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
  'agenda_direccion_escrita', 'agenda_barrio_escrito', 'agenda_fecha_escrita', 'agenda_status_escrito',
  'Origen fila', 'Tocado por el equipo', 'Evento (mail)', 'Lugar (mail)', 'Dirección (mail)', 'Marcas (mail)', 'Conjunta con'];
const BARRIOS = [['Recoleta', 2], ['Palermo', 14], ['Almagro', 5], ['Boedo', 5], ['Belgrano', 13], ['Núñez', 13],
  ['Colegiales', 13], ['Flores', 7], ['Parque Chacabuco', 7], ['San Nicolás', 1], ['Monserrat', 1], ['Villa Urquiza', 12],
  ['Villa Santa Rita', 11], ['Villa Devoto', 11]];
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
const dia = function (d) { return new D(2026, 9, d, 12, 0, 0); };
const copia = function (E) {
  const h = E.planilla(E.run('AGENDA_COPIA_SS')).hojas['Agenda'];
  const cols = E.run('AGENDA_COPIA_COLUMNAS');
  return { filas: h ? h.v.slice(1) : [], c: function (n) { return cols.indexOf(n); } };
};
const lineaCopia = function (E, re) {
  const k = copia(E);
  return k.filas.filter(function (r) { return re.test(r.join(' | ')); }).map(function (r) {
    return { estado: r[k.c('Estado en la agenda')], fila: r[k.c('Fila del destino')], cambios: r[k.c('Cambios')], status: r[k.c('STATUS en el destino')] };
  });
};
const pendientes = function (E) { const h = E.ssI.hojas['AGENDA_PENDIENTES']; return h ? h.v.filter(function (r) { return r.some(Boolean); }) : null; };
const dups = function (E) { const h = E.ssD.hojas['AGENDA_DUPLICADOS']; return h ? h.v.slice(1).filter(function (r) { return r.some(Boolean); }) : []; };
const filasCon = function (E, fig, d) {
  const out = [];
  for (let i = 1; i < E.D.v.length; i++) {
    const r = E.D.v[i], f = r[E.C('FECHA')];
    if (r[E.C('Figura')] === fig && f instanceof Date && f.getDate() === d && f.getMonth() === 9) out.push(i);
  }
  return out;
};


// ============================== los mails (inventados), con HTML ==============================

const ASUNTO_12 = 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 12/10 al 18/10';
const NL = String.fromCharCode(10);
let idMail = 0;
const ROJO = 'background-color:#ff0000';
const TODO_ROJO = { dia: ROJO, ev: ROJO, hora: ROJO, lugar: ROJO };
/** Un mail con su texto plano y su HTML (las mismas líneas); `estilos[i]`: el style de cada línea del bloque i (o null). */
function mail(dia, hora, bloques, asunto, estilos, min) {
  const html = '<div dir="ltr">' + bloques.map(function (b, i) {
    const st = (estilos || [])[i] || {};
    return b.map(function (l, k) {
      const s = [st.dia, st.ev, st.hora, st.lugar][k];
      const t = l.replace(/^\*(.*)\*$/, '<b>$1</b>');
      return '<div>' + (s ? '<span style="' + s + '">' + t + '</span>' : t) + '</div>';
    }).join('') + '<br>';
  }).join('') + '</div>';
  return { fecha: new D(2026, 9, dia, hora, min || 0), asunto: asunto, cuerpo: [].concat.apply([], bloques).join(NL), truncado: false,
           html: html, id: 'm' + (++idMail) };
}
const sinHtml = function (ms) { return ms.map(function (m) { const x = Object.assign({}, m); delete x.html; return x; }); };
const MUZZIO = ['*Miércoles 14/10*', 'Evento: Encuentro con Vecinos Clara Muzzio, Recoleta', 'Hora: 18:30h', 'Lugar: Av. Santa Fe 1234, Club Social'];
const SABOR = ['*Jueves 15/10*', 'Evento: Encuentro con Vecinos Ezequiel Sabor, Comuna 5', 'Hora: 09:45h', 'Lugar: Bulnes 1000, Club'];
const TAPIA = function (h) { return ['*Sábado 17/10*', 'Evento: Encuentro con Vecinos Gabino Tapia, Núñez', 'Hora: ' + h, 'Lugar: Cabildo 2000, Club']; };
const NOTA = ['Actualizo: SE CANCELA LA REUNIÓN DE EZEQUIEL SABOR', ''];
// v1 (lunes 12/10): todo normal. v2 (martes 13/10 14:50): la de Sabor del 15/10 en ROJO ENTERO y la nota arriba (el caso 825)
const V1 = mail(12, 9, [MUZZIO, SABOR, TAPIA('10:00h')], ASUNTO_12);
const V2 = mail(13, 14, [NOTA, MUZZIO, SABOR, TAPIA('10:00h')], ASUNTO_12, [null, null, TODO_ROJO, null], 50);

const SIS_ON = { AGENDA_CANCELACION_AUTOMATICA: 'true', AGENDA_CANCELACION_MODO: "'suspender'" };
const ON = { coloresMail: true };
const filaDe = function (E, fig, d) { return fila(E, fig, d); };

// ============================== 0. apagado: idéntico ==============================

console.log('[0] los interruptores APAGADOS: el parser y el plan, idénticos con o sin HTML');
let E = montar(true, [], {});
E.ctx.__l = [V1, V2]; E.ctx.__l2 = sinHtml([V1, V2]);
const pa = E.run('JSON.stringify(agendaDesdeListaDeMails_(__l, { fuente: "x" }).unicas)');
const pb = E.run('JSON.stringify(agendaDesdeListaDeMails_(__l2, { fuente: "x" }).unicas)');
ok(pa === pb && !/colorMail|canceladaEnMail|notasMail/.test(pa), 'parser: la misma salida con y sin HTML (sin colorMail, canceladaEnMail ni notas)');
const pc = E.run('JSON.stringify(agendaDesdeListaDeMails_(__l, { fuente: "x", coloresMail: false }).unicas)');
ok(pc === pa, 'parser: coloresMail false = como siempre');
const planJ = function (X, mails, extra) {
  X.ctx.__m = mails; X.ctx.__g = geocodificador(X); X.ctx.__x = extra || {};
  return X.run('(function () { var d = leerDestino_(), A = indicesAgenda_(d.hdr); var r = agendaDesdeListaDeMails_(__m, { fuente: "x" }); ' +
               'var P = planAgenda_(d, r, A, alcanceAgenda_(), Object.assign({ enSeco: true, geocodificar: __g, conjunto: new Map(), historial: leerHistorialAgenda_(), elecciones: new Map() }, __x)); ' +
               'return JSON.stringify({ a: P.acciones.map(function (a) { return [a.tipo, a.fila || (a.f && a.f.fila), a.escrituras.map(function (e) { return [e.fila, e.col, String(e.valor), String(e.esperado)]; })]; }), ' +
               'r: P.resumen, d: P.duplicados.length, c: P.copia.map(function (c) { return [c.estado, c.cambios]; }) }).replace(/uuid-\\d+/g, "u"); })()');
};
correr(E, false, [V1]);
const p1 = planJ(E, [V1, V2]), p2 = planJ(E, sinHtml([V1, V2]));
ok(p1 === p2, 'plan: el mismo con y sin HTML (apagado)');
ok(celda(E, filaDe(E, 'Ezequiel Sabor', 15), 'STATUS REUNIÓN') === 'en agenda', 'y la de Sabor sigue "en agenda" (apagado no la cancela)');

// ============================== 1. ROJO ENTERO en la última versión → Suspendida ==============================

console.log('[1] ROJO ENTERO en la última versión válida → Suspendida (el caso 825, con la nota)');
E = montar(true, [], SIS_ON);
correr(E, false, [V1]);
const iS = filaDe(E, 'Ezequiel Sabor', 15), iT = filaDe(E, 'Gabino Tapia', 17);
E.ctx.__l = [V1, V2];
const ev = E.run('agendaDesdeListaDeMails_(__l, { fuente: "x", coloresMail: true }).unicas.filter(function (e) { return /Sabor/.test(e.figuraFila); })[0]');
ok(ev && ev.canceladaEnMail === true && ev.canceladaEnMailMotivo === 'rojo en la v2 del 13/10' && ev.colorMail.rojoEntero && ev.colorMail.porCampo.Hora === 'ROJO',
   'el parser: canceladaEnMail, "rojo en la v2 del 13/10" — ' + JSON.stringify(ev && { m: ev.canceladaEnMailMotivo, c: ev.colorMail }));
ok(ev && ev.notaCancela === true && ev.notasMail.length === 1 && /SE CANCELA/.test(ev.notasMail[0].texto) && /Ezequiel Sabor/.test(ev.notasMail[0].por),
   'y la nota "SE CANCELA LA REUNIÓN DE EZEQUIEL SABOR" pegada a esa reunión (nombra a la figura)');
const evT = E.run('agendaDesdeListaDeMails_(__l, { fuente: "x", coloresMail: true }).unicas.filter(function (e) { return /Tapia/.test(e.figuraFila); })[0]');
ok(evT && !evT.canceladaEnMail && evT.colorMail && evT.colorMail.familia === '' && evT.notasMail.length === 0, 'Tapia, sin color: no está cancelada y la nota no la nombra');
E.avisos = [];
let r = correr(E, false, [V1, V2], ON);
ok(celda(E, iS, 'STATUS REUNIÓN') === 'Suspendida' && celda(E, iS, 'agenda_status_escrito') === 'Suspendida' && r.suspender === 1 && r.borrar === 0,
   'la fila pasa a Suspendida (mail del 13/10 14:50, anterior a la reunión del 15/10 09:45), nunca se borra');
ok(fondo(E, iS, 'STATUS REUNIÓN') === SIS, 'con el color del sistema');
ok(celda(E, iT, 'STATUS REUNIÓN') === 'en agenda', 'la de Tapia no se toca');
ok(E.avisos.some(function (a) { return a[0] === 'suspendidas' && /cancelada en el mail: rojo en la v2 del 13\/10/.test(a[1]) && /SE CANCELA/.test(a[1]); }),
   'aviso "suspendidas" con el rojo y la nota del mail');
ok(lineaCopia(E, /Ezequiel Sabor/).some(function (x) { return x.cambios === 'suspendida: rojo en la v2 del 13/10'; }), 'archivo "Agenda", "Cambios": "suspendida: rojo en la v2 del 13/10"');
const cam = E.ssI.hojas['REGISTRO_AGENDA_CAMBIOS'];
ok(cam && cam.v.some(function (x) { return x[1] === 'suspendida_rojo' && x[2] === iS + 1; }), 'REGISTRO_AGENDA_CAMBIOS: la nota "suspendida_rojo" (para no reactivarla)');
r = correr(E, false, [V1, V2], ON);
ok(r.suspender === 0 && r.reactivar === 0 && celda(E, iS, 'STATUS REUNIÓN') === 'Suspendida', 'la corrida siguiente: sigue en rojo → no se reactiva ni se vuelve a suspender');
r = correr(E, false, [V1, V2]);
ok(r.reactivar === 0 && celda(E, iS, 'STATUS REUNIÓN') === 'Suspendida', 'con los colores APAGADOS: sigue escrita en el mail pero NO se reactiva (la nota del registro)');
const V3 = mail(14, 9, [MUZZIO, SABOR, TAPIA('10:00h')], ASUNTO_12);
r = correr(E, false, [V1, V2, V3], ON);
ok(r.reactivar === 1 && celda(E, iS, 'STATUS REUNIÓN') === 'en agenda', 'v3 completa sin rojo (colores prendidos): dejó de estar en rojo → se REACTIVA');

// ============================== 2. lo que NO cancela ==============================

console.log('[2] rojo parcial, rojo de una versión anterior, sin la cancelación automática');
E = montar(true, [], SIS_ON);
correr(E, false, [V1]);
const PARCIAL = mail(13, 14, [MUZZIO, SABOR, TAPIA('10:00h')], ASUNTO_12, [null, { ev: ROJO }, null]);
r = correr(E, false, [V1, PARCIAL], ON);
ok(r.suspender === 0 && celda(E, filaDe(E, 'Ezequiel Sabor', 15), 'STATUS REUNIÓN') === 'en agenda', 'sólo el Evento en rojo (no Hora ni Lugar): nada');
const ROJA_V1 = mail(12, 10, [MUZZIO, SABOR, TAPIA('10:00h')], ASUNTO_12, [null, TODO_ROJO, null]);
const NORMAL_V2 = mail(13, 9, [MUZZIO, SABOR, TAPIA('10:00h')], ASUNTO_12);
E = montar(true, [], SIS_ON);
correr(E, false, [ROJA_V1]);
r = correr(E, false, [ROJA_V1, NORMAL_V2], ON);
ok(r.suspender === 0 && celda(E, filaDe(E, 'Ezequiel Sabor', 15), 'STATUS REUNIÓN') === 'en agenda', 'rojo en la v1 pero no en la última (v2): nada');
const RE_ROJO = mail(14, 9, [SABOR], 'RE: ' + ASUNTO_12, [TODO_ROJO]);
r = correr(E, true, [ROJA_V1, NORMAL_V2, RE_ROJO], ON);
ok(r.suspender === 1, 'un "RE:" posterior que la vuelve a nombrar en rojo: cuenta (un "Re:" agrega o actualiza, también el color)');
E = montar(true, [], {});
correr(E, false, [V1]);
r = correr(E, false, [V1, V2], ON);
ok(r.suspender === 0 && celda(E, filaDe(E, 'Ezequiel Sabor', 15), 'STATUS REUNIÓN') === 'en agenda', 'colores prendidos pero la cancelación automática apagada: no se suspende');

// ============================== 3. el tiempo ("el mail manda") ==============================

console.log('[3] el tiempo: el mail que la cancela tiene que ser ANTERIOR a la reunión');
const rojoEl = function (h, m) { return mail(15, h, [MUZZIO, SABOR, TAPIA('10:00h')], ASUNTO_12, [null, TODO_ROJO, null], m); };
E = montar(true, [], SIS_ON);
correr(E, false, [V1]);
E.avisos = [];
r = correr(E, false, [V1, rojoEl(8, 0)], ON);
ok(r.suspender === 1 && celda(E, filaDe(E, 'Ezequiel Sabor', 15), 'STATUS REUNIÓN') === 'Suspendida',
   'mail del 15/10 08:00, reunión 15/10 09:45, hoy 15/10 12:00 (la hora ya pasó): se suspende igual');
E = montar(true, [], SIS_ON);
correr(E, false, [V1]);
E.avisos = [];
r = correr(E, false, [V1, rojoEl(10, 30)], ON);
ok(r.suspender === 0 && celda(E, filaDe(E, 'Ezequiel Sabor', 15), 'STATUS REUNIÓN') === 'en agenda' && r.cancelNoAplicada === 1,
   'mail del 15/10 10:30, POSTERIOR a la reunión de las 09:45: no se toca');
ok(E.avisos.some(function (a) { return a[0] === 'cancelacion_no_aplicada' && /cancelada en el mail/.test(a[1]) && /posterior a la reunión/.test(a[1]); }),
   'y se avisa (cancelacion_no_aplicada)');

// ============================== 4. otro STATUS (el caso 824) ==============================

console.log('[4] el equipo ya le puso otro STATUS (Realizada, con asistentes): no se toca y se avisa');
const MACRI = ['*Jueves 15/10*', 'Evento: Encuentro con Vecinos Jorge Macri, Villa Santa Rita', 'Hora: 11:00h', 'Lugar: Rivadavia 7000, Plaza'];
const M1 = mail(12, 9, [MUZZIO, MACRI], ASUNTO_12);
const M3 = mail(15, 8, [MUZZIO, MACRI], ASUNTO_12, [null, TODO_ROJO]);   // de hoy: el aviso es de las últimas 24 h
E = montar(true, [], SIS_ON);
correr(E, false, [M1]);
const iM = filaDe(E, 'Jorge Macri', 15);
E.D.v[iM][E.C('STATUS REUNIÓN')] = 'Realizada'; E.D.v[iM][E.C('Asistentes')] = 31;
E.avisos = [];
r = correr(E, false, [M1, M3], ON);
ok(r.suspender === 0 && celda(E, iM, 'STATUS REUNIÓN') === 'Realizada' && celda(E, iM, 'Asistentes') === 31, 'Realizada con 31 asistentes: no se toca');
ok(E.avisos.some(function (a) { return a[0] === 'cancelacion_no_aplicada' && /Realizada/.test(a[1]) && /asistentes 31/.test(a[1]); }),
   'aviso cancelacion_no_aplicada: "la fila está Realizada (asistentes 31)"');

// ============================== 5. suspendida por el sistema que recibe datos ==============================

console.log('[5] una fila que suspendió el sistema y después recibe asistentes: no se pisa, se avisa UNA vez');
E = montar(true, [], SIS_ON);
correr(E, false, [V1]);
correr(E, false, [V1, V2], ON);
const iS5 = filaDe(E, 'Ezequiel Sabor', 15);
E.D.v[iS5][E.C('Asistentes')] = 12;
E.avisos = [];
r = correr(E, false, [V1, V2], ON);
correr(E, false, [V1, V2], ON);
const avD = E.avisos.filter(function (a) { return a[0] === 'suspendida_con_datos'; });
ok(avD.length === 1 && /asistentes \(12\)/.test(avD[0][1]), 'un solo aviso "suspendida_con_datos" en dos corridas — ' + avD.length);
ok(celda(E, iS5, 'STATUS REUNIÓN') === 'Suspendida' && celda(E, iS5, 'Asistentes') === 12, 'y no se pisó nada');
ok(/suspendida_con_datos: '/.test(fs.readFileSync(path.join(RAIZ, '50_Avisos.js'), 'utf8')), '50_Avisos.js: el tema suspendida_con_datos con su asunto');

// ============================== 6. pasos 91 y 92 ==============================

console.log('[6] paso 91 (en seco) y paso 92 (real, sólo esa fila)');
E = montar(true, [], {});                       // la configuración APAGADA: los pasos prenden todo por opciones
correr(E, false, [V1]);
const i91 = filaDe(E, 'Ezequiel Sabor', 15), n91 = i91 + 1, nT = filaDe(E, 'Gabino Tapia', 17) + 1;
E.validacion = { getCriteriaType: function () { return 'VALUE_IN_LIST'; }, getCriteriaValues: function () { return [['en agenda', 'Realizada', 'Suspendida', 'Reprogramada', 'Se modifico el barrio'], true]; } };
// la v2 cambia además la hora de Tapia: el plan la actualizaría, el paso 92 no
const V2b = mail(13, 14, [NOTA, MUZZIO, SABOR, TAPIA('11:00h')], ASUNTO_12, [null, null, TODO_ROJO, null], 50);
let antes = foto(E.D);
E.ctx.__m = [V1, V2b]; E.ctx.__g = geocodificador(E);
const s91 = E.run('cancelarFilaAgenda_enSeco(' + n91 + ', { mails: __m, geocodificar: __g, conjunto: new Map(), elecciones: new Map() })');
ok(foto(E.D) === antes, 'paso 91: no escribe nada');
ok(s91.suspenderia === true && s91.statusDelSistema === true && s91.validacionStatus.cancelada === false,
   'paso 91: la suspendería; el "en agenda" lo puso el sistema; la lista de STATUS no tiene "Cancelada"');
const ex = s91.explicacion.join('\n');
ok(/CANCELADA EN EL MAIL: rojo en la v2 del 13\/10/.test(ex) && /Evento ROJO/.test(ex) && /SE CANCELA LA REUNIÓN DE EZEQUIEL SABOR/.test(ex) &&
   /mail del 13\/10 14:50 ANTERIOR a la reunión \(15\/10 09:45\)/.test(ex) && /SE SUSPENDERÍA/.test(ex), 'paso 91 explica: el mail, la versión, las líneas en rojo, la nota y el tiempo');
console.log('     ' + s91.explicacion.join('\n      '));
E.validacion = { getCriteriaType: function () { return 'VALUE_IN_LIST'; }, getCriteriaValues: function () { return [['en agenda', 'Realizada', 'Cancelada'], true]; } };
ok(E.run('cancelarFilaAgenda_enSeco(' + n91 + ', { mails: __m, geocodificar: __g, conjunto: new Map(), elecciones: new Map() })').validacionStatus.cancelada === true,
   'con "Cancelada" en la validación de datos, lo dice');
const nT0 = foto(E.D);
const r92no = E.run('cancelarFilaAgenda(' + nT + ', { mails: __m, geocodificar: __g, conjunto: new Map(), elecciones: new Map() })');
ok(r92no.error && foto(E.D) === nT0, 'paso 92 sobre la fila de Tapia (el plan no la suspende): se NIEGA y no escribe nada');
E.avisos = [];
const filaAntes = E.D.v.map(function (x) { return x.slice(); });
const r92 = E.run('cancelarFilaAgenda(' + n91 + ', { mails: __m, geocodificar: __g, conjunto: new Map(), elecciones: new Map() })');
ok(r92.suspendida === true && celda(E, i91, 'STATUS REUNIÓN') === 'Suspendida', 'paso 92: la fila ' + n91 + ' queda Suspendida');
let otras = 0;
E.D.v.forEach(function (x, k) { x.forEach(function (v, j) { if (k !== i91 && String(v) !== String((filaAntes[k] || [])[j])) otras++; }); });
const cambiadas = filaAntes[i91].map(function (v, j) { return String(v) !== String(E.D.v[i91][j]) ? E.hdr[j] : null; }).filter(Boolean);
ok(otras === 0 && cambiadas.join(',') === 'STATUS REUNIÓN,agenda_status_escrito', 'y SÓLO esa fila, sólo STATUS y agenda_status_escrito (la hora de Tapia no se tocó): ' + cambiadas.join(','));
ok(E.avisos.some(function (a) { return a[0] === 'suspendidas' && /paso 92/.test(a[1]); }), 'y el aviso "suspendidas"');
E.run('deshacerAgenda(false)');
ok(celda(E, i91, 'STATUS REUNIÓN') === 'en agenda', 'deshacer (paso 38) la vuelve a "en agenda"');
// 16/10 (revisor): la identidad esperada (si el equipo insertó o borró filas arriba, el número es de otra reunión)
let f0 = foto(E.D);
let r92e = E.run('cancelarFilaAgenda(' + n91 + ', { mails: __m, geocodificar: __g, conjunto: new Map(), elecciones: new Map(), esperado: { figura: "Mraida", fecha: "2026-10-15" } })');
ok(r92e.error === 'la fila no es la esperada' && foto(E.D) === f0, 'paso 92 con otra figura esperada (Mraida): se NIEGA y no escribe nada');
// (en seco: en este entorno el reloj y el uuid son fijos, y dos corridas reales tendrían el mismo id para deshacer)
r92e = E.run('cancelarFilaAgenda_enSeco(' + n91 + ', { mails: __m, geocodificar: __g, conjunto: new Map(), elecciones: new Map(), esperado: { figura: "Sabor", fecha: "2026-10-15" } })');
ok(!r92e.error && r92e.suspenderia === true && foto(E.D) === f0, 'con la figura y la fecha esperadas: pasa el control (y la suspendería)');
// 16/10 (revisor, ALTA): una fila SIN agenda_uid: el paso 92 le estampa el uid (si no, la corrida de la hora la reactivaría)
E.D.v[i91][E.C('agenda_uid')] = '';
const filaSinUid = E.D.v[i91].slice();
const r92u = E.run('cancelarFilaAgenda(' + n91 + ', { mails: __m, geocodificar: __g, conjunto: new Map(), elecciones: new Map() })');
const camb2 = filaSinUid.map(function (v, j) { return String(v) !== String(E.D.v[i91][j]) ? E.hdr[j] : null; }).filter(Boolean).sort();
ok(r92u.suspendida === true && !!celda(E, i91, 'agenda_uid') && camb2.join(',') === ['STATUS REUNIÓN', 'agenda_status_escrito', 'agenda_uid'].sort().join(','),
   'fila sin agenda_uid: Suspendida y con su uid (sólo STATUS, agenda_status_escrito y agenda_uid): ' + camb2.join(','));
E.run('deshacerAgenda(false)');

// ============================== 7. paso 93 y la auditoría (paso 66) ==============================

console.log('[7] paso 93 (medir desde una fecha) y la auditoría (paso 66): sólo lectura');
E = montar(true, [], {});
correr(E, false, [V1]);
correr(E, false, [M1]);
const iM7 = filaDe(E, 'Jorge Macri', 15);
E.D.v[iM7][E.C('STATUS REUNIÓN')] = 'Realizada'; E.D.v[iM7][E.C('Asistentes')] = 31;
antes = foto(E.D);
const V2M = mail(13, 14, [NOTA, MUZZIO, SABOR, MACRI, TAPIA('10:00h')], ASUNTO_12, [null, null, TODO_ROJO, TODO_ROJO, null], 50);
E.ctx.__m = [V1, V2M]; E.ctx.__g = geocodificador(E);
const m93 = E.run('medirCancelacionesMail({ desde: "2026-10-12", mails: __m, geocodificar: __g, elecciones: new Map(), historial: leerHistorialAgenda_() })');
ok(foto(E.D) === antes, 'paso 93: no escribe nada');
const lS = m93.lineas.filter(function (l) { return /Sabor/.test(l.reunion); })[0], lM = m93.lineas.filter(function (l) { return /Macri/.test(l.reunion); })[0];
ok(lS && lS.tipo === 'suspenderiaHoy' && /ROJO/.test(lS.por) && /SE CANCELA/.test(lS.notas.join(' ')), 'Sabor: la suspendería hoy, por el rojo, con la nota — ' + JSON.stringify(lS));
ok(lM && lM.tipo === 'noCoincide' && /31 asistentes/.test(lM.equipo), 'Macri (como la 824): NO COINCIDE, Realizada con 31 asistentes — ' + JSON.stringify(lM && lM.equipo));
const aud = E.run('auditoriaAgenda({ mails: __m, geocodificar: __g })');
ok(foto(E.D) === antes, 'la auditoría (paso 66): no escribe nada');
ok(aud.noOk.some(function (t) { return /Ezequiel Sabor/.test(t) && /el mail la cancela/.test(t); }), 'la auditoría: Sabor "en agenda" aunque el mail la cancela en rojo → NO está OK');
ok(aud.noOk.some(function (t) { return /Jorge Macri/.test(t) && /la base no/.test(t); }), 'y Macri Realizada con el mail en rojo → a mirar');

// ============================== 8. AMARILLO y VERDE (apagado) y la lectura del HTML ==============================

console.log('[8] AMARILLO / VERDE en la copia, y getBody sólo con los colores');
const AMA = 'background-color:#ffff00', VER = 'background-color:#b6d7a8';
const VA = mail(13, 9, [MUZZIO, SABOR, TAPIA('11:00h')], ASUNTO_12, [{ ev: VER, hora: VER, lugar: VER }, null, { hora: AMA }]);
E = montar(true, [], { AGENDA_COLORES_AMARILLO_VERDE: 'true' });
correr(E, false, [V1]);
correr(E, false, [V1, VA], ON);
ok(lineaCopia(E, /Gabino Tapia/).some(function (x) { return /cambió en el mail \(amarillo\): Hora/.test(x.cambios); }), 'AMARILLO: "Cambios" dice "cambió en el mail (amarillo): Hora"');
ok(lineaCopia(E, /Clara Muzzio/).some(function (x) { return /nueva \(verde en el mail\)/.test(x.cambios); }), 'VERDE: "nueva (verde en el mail)"');
const celdaA = E.run('celdaMailAgenda_({ ev: { eventoTexto: "Encuentro", hora: "11:00", horaTexto: "11:00h", lugarTexto: "Cabildo 2000", cambios: "" }, estado: "vigente", amarillo: ["Hora"] })');
ok(celdaA.naranja.length === 1 && celdaA.texto.slice(celdaA.naranja[0].desde, celdaA.naranja[0].hasta) === '11:00h', '"Agenda (mail)": la hora amarilla, en naranja');
E = montar(true, [], {});
correr(E, false, [V1]);
correr(E, false, [V1, VA], ON);
ok(!lineaCopia(E, /Gabino Tapia/).some(function (x) { return /amarillo/.test(x.cambios || ''); }), 'con AGENDA_COLORES_AMARILLO_VERDE apagado: nada');
// leerMailsAgendaGmail_: getBody sólo con { html: true }
let bodies = 0;
const msg = function (m) { return { getId: function () { return m.id; }, getDate: function () { return m.fecha; }, getSubject: function () { return m.asunto; },
  getPlainBody: function () { return m.cuerpo; }, getBody: function () { bodies++; return m.html; } }; };
E.ctx.GmailApp = { getUserLabelByName: function () { return { getThreads: function (i) { return i ? [] : [{ getId: function () { return 'h1'; },
  getLastMessageDate: function () { return V2.fecha; }, getMessages: function () { return [msg(V1), msg(V2)]; } }]; } }; }, search: function () { return []; } };
const g0 = E.run('leerMailsAgendaGmail_(new Date(2026, 9, 1))');
ok(bodies === 0 && !('html' in g0) && g0.lista.every(function (m) { return !('html' in m); }), 'sin { html: true }: no se llama a getBody (como siempre)');
const g1 = E.run('leerMailsAgendaGmail_(new Date(2026, 9, 1), { html: true })');
ok(bodies === 2 && g1.html.leidos === 2 && /SE CANCELA/.test(g1.lista[1].html), 'con { html: true }: getBody de cada mail, y el tiempo en el log — ' + JSON.stringify(g1.html));
const g2 = E.run('leerMailsAgendaGmail_(new Date(2026, 9, 1), { html: true, topeMs: -1 })');
ok(g2.html.omitidos === 2 && g2.lista.every(function (m) { return m.html === ''; }), 'pasado el tope de tiempo: sin HTML (sin color), sin fallar');
const t0 = Date.now();
E.ctx.__l = [V1, V2, V3, VA];
for (let k = 0; k < 20; k++) E.run('agendaDesdeListaDeMails_(__l, { fuente: "x", coloresMail: true })');
console.log('     (tiempo: 20 parseos de 4 mails con colores: ' + (Date.now() - t0) + ' ms en Node)');

// ============================== 9. GUÍA y LEER ==============================

console.log('[9] GUÍA y LEER: las líneas nuevas sólo con los interruptores');
const ayuda = function (cfg) {
  // 16/10: la etapa 1 quedó prendida en 00_Config.js; el punto de partida de estos chequeos es todo APAGADO
  cfg = Object.assign({ AGENDA_CANCELACION_AUTOMATICA: 'false', AGENDA_CREAR_SOLO_IDENTIFICADAS: 'false', AGENDA_COLORES_MAIL: 'false',
                        AGENDA_ELECCIONES_SIEMPRE: 'false' }, cfg || {});
  const ctx = { console: console, Date: Date, Math: Math, JSON: JSON, Map: Map, Set: Set, Object: Object, Array: Array, String: String, Number: Number };
  vm.createContext(ctx);
  ['00_Config.js', '01_Utils.js', '27_RevisarFormato.js', '43_Ayuda.js'].forEach(function (f) {
    let s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    if (f === '00_Config.js') Object.keys(cfg).forEach(function (k) { s = s.replace(new RegExp('^const ' + k + '\\s+=.*', 'm'), 'const ' + k + ' = ' + cfg[k] + ';'); });
    vm.runInContext(s, ctx, { filename: f });
  });
  return vm.runInContext('filasAyuda_(AYUDA_GUIA_).concat(filasAyuda_(AYUDA_LEER_)).map(function (x) { return x.texto; }).join("\\n")', ctx);
};
const a0 = ayuda({}), a1 = ayuda({ AGENDA_CANCELACION_AUTOMATICA: 'true', AGENDA_COLORES_MAIL: 'true', AGENDA_COLORES_AMARILLO_VERDE: 'true' });
ok(!/ROJO/.test(a0) && !/AMARILLO/.test(a0), 'APAGADO: ni el rojo ni el amarillo');
ok(/una reunión en ROJO en el mail/.test(a1) && /suspendida: rojo en la v/.test(a1) && /AMARILLO aparece en "Cambios"/.test(a1), 'PRENDIDO: el rojo (GUÍA y LEER) y el amarillo / verde');
// 16/10: el ROJO quedó prendido en la etapa 1; el AMARILLO / VERDE sigue apagado
ok(/const AGENDA_COLORES_MAIL = true;/.test(fs.readFileSync(path.join(RAIZ, '00_Config.js'), 'utf8')) &&
   /const AGENDA_COLORES_AMARILLO_VERDE = false;/.test(fs.readFileSync(path.join(RAIZ, '00_Config.js'), 'utf8')), '00_Config.js: los colores PRENDIDOS (etapa 1), el amarillo / verde APAGADO');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
