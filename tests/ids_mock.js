/**
 * tests/ids_mock.js — el entorno de prueba de los IDs de los encuentros (45_IdsCuentas.js): un Apps Script mínimo en un
 * `vm`, con planillas simuladas (valores, fondos y formatos por celda), y el código del proyecto cargado.
 *
 *   const { crearEntornoIds, hdrBase, filaBase, D } = require('./ids_mock');
 *   const E = crearEntornoIds({ base: [...filas], jm: [[...], ...], funcionarios: [[...], ...] });
 *   E.run('medirIds()');                      // corre una expresión en el contexto del proyecto
 *   E.hoja(E.cfg('RDV_SS_DESTINO'), E.cfg('RDV_HOJA_DESTINO')).valores   // la base después
 *
 * NO sube a Apps Script (.claspignore: tests/**). NO tiene datos reales: figuras, IDs y fechas son inventados (algunos
 * nombres son los de figuras públicas que ya están en los tests del proyecto); los barrios y comunas son los de la Ciudad.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', '05_Escritura.js', '20_UpsertDestino.js', '41_AgendaParser.js',
                  '42_BarriosCabaGeo.js', '45_IdsCuentas.js', 'diagnostico/26_ids_cuentas.js'];

const pad = function (n) { return ('0' + n).slice(-2); };
function formatDate(d, tz, f) {
  // Un huso "GMT"/"UTC" se respeta (para probar la lista en otro huso); cualquier otro, el del proceso (Buenos Aires).
  const u = /^(gmt|utc|etc\/gmt|etc\/utc)$/i.test(String(tz || ''));
  const y = u ? d.getUTCFullYear() : d.getFullYear(), mo = u ? d.getUTCMonth() : d.getMonth(), da = u ? d.getUTCDate() : d.getDate();
  const h = u ? d.getUTCHours() : d.getHours(), mi = u ? d.getUTCMinutes() : d.getMinutes(), se = u ? d.getUTCSeconds() : d.getSeconds();
  return String(f).replace('yyyy', y).replace('MM', pad(mo + 1)).replace('dd', pad(da))
    .replace('HH', pad(h)).replace('mm', pad(mi)).replace('ss', pad(se));
}
/** Una fecha al mediodía. `D(29, 9)` = 29/09/2026. */
function D(d, m, y) { return new Date(y || 2026, m - 1, d, 12, 0, 0); }

// ---------------------------- la base: el encabezado real (sin datos) ----------------------------
const HDR_BASE = ['Figura', 'Barrio', 'EVENTO', 'Día de la semana', 'FECHA', 'HORA', 'Dirección', 'One Page Entregado', 'STATUS REUNIÓN',
  'Observaciones', 'Inscriptos', 'Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión', 'Asistentes', 'Oradores anotados',
  'Oradores que hablaron', 'Temas mas comentados', 'Semaforo politico', 'Síntesis cualitativa:', '% de Asistencia', 'Direccion2',
  'Falta Informacion', 'ID', 'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona', 'Masculinos', 'Femeninos',
  '18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar', 'RDV_UID', 'form_origen', 'form_score', 'form_nivel',
  'form_fecha_match', 'form_clave', 'No participa', 'agenda_uid', 'agenda_mail', 'agenda_version', 'agenda_hora_escrita',
  'agenda_direccion_escrita', 'agenda_barrio_escrito', 'agenda_fecha_escrita', 'agenda_status_escrito', 'Origen fila',
  'Tocado por el equipo', 'Evento (mail)', 'Lugar (mail)', 'Dirección (mail)', 'Marcas (mail)', 'Conjunta con'];
function hdrBase(extra) { return HDR_BASE.concat(extra || []); }
/** Una fila de la base con las columnas que se le pasan (por nombre); el resto vacío. */
function filaBase(o, hdr) {
  const h = hdr || HDR_BASE;
  const r = h.map(function () { return ''; });
  Object.keys(o).forEach(function (k) {
    const i = h.indexOf(k);
    if (i < 0) throw new Error('filaBase: no existe la columna "' + k + '"');
    r[i] = o[k];
  });
  return r;
}

// ---------------------------- Comunas (públicas): barrio, comuna, …, Zona (H), Eje geográfico (I) ----------------------------
const COMUNAS = [
  ['Retiro', 1, '', 'Norte'], ['San Nicolás', 1, '', 'Este'], ['Puerto Madero', 1, '', ''], ['Monserrat', 1, '', ''],
  ['San Telmo', 1, '', ''], ['Constitución', 1, '', ''], ['Recoleta', 2, '', 'Norte'], ['Balvanera', 3, '', 'Centro'],
  ['San Cristóbal', 3, '', ''], ['La Boca', 4, '', 'Sur'], ['Barracas', 4, '', 'Sur'], ['Parque Patricios', 4, '', 'Sur'],
  ['Nueva Pompeya', 4, '', ''], ['Almagro', 5, '', ''], ['Boedo', 5, '', 'Sur'], ['Caballito', 6, '', 'Centro'],
  ['Flores', 7, '', 'Sur'], ['Parque Chacabuco', 7, '', 'Oeste'], ['Villa Soldati', 8, '', ''], ['Villa Riachuelo', 8, '', ''],
  ['Villa Lugano', 8, '', ''], ['Liniers', 9, '', ''], ['Mataderos', 9, '', ''], ['Parque Avellaneda', 9, '', ''],
  ['Villa Real', 10, '', ''], ['Monte Castro', 10, '', ''], ['Versalles', 10, '', ''], ['Floresta', 10, '', ''],
  ['Vélez Sarsfield', 10, '', ''], ['Villa Luro', 10, '', ''], ['Villa General Mitre', 11, '', ''], ['Villa Devoto', 11, '', 'Oeste'],
  ['Villa del Parque', 11, '', ''], ['Villa Santa Rita', 11, '', ''], ['Coghlan', 12, '', ''], ['Saavedra', 12, '', ''],
  ['Villa Urquiza', 12, '', 'Norte'], ['Villa Pueyrredón', 12, '', ''], ['Núñez', 13, '', 'Norte'], ['Belgrano', 13, '', 'Norte'],
  ['Colegiales', 13, '', ''], ['Palermo', 14, '', 'Norte'], ['Chacarita', 15, '', 'Oeste'], ['Villa Crespo', 15, '', ''],
  ['La Paternal', 15, '', 'Oeste'], ['Villa Ortúzar', 15, '', ''], ['Agronomía', 15, '', ''], ['Parque Chas', 15, '', '']
];
function bloqueComunas() {
  const out = [['Barrio', 'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona', 'Eje geográfico']];
  COMUNAS.forEach(function (c) { out.push([c[0], c[1], 1000, 500, 500, 1, 1000, c[2], c[3]]); });
  return out;
}

// ---------------------------- planillas simuladas ----------------------------
function aA1(s) {
  const m = /^([A-Z]+)(\d+)$/.exec(s);
  let c = 0;
  for (let i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64);
  return { fila: Number(m[2]), col: c };
}

/** Las fechas de afuera del `vm` pasan a ser fechas del contexto (en Apps Script, getValues devuelve Date del mismo reino). */
let _convFecha_ = function (v) { return v; };

function crearHoja(nombre, valores, opciones) {
  const o = opciones || {};
  const h = { nombre: nombre, valores: (valores || []).map(function (r) { return r.map(_convFecha_); }), fondos: {}, formatos: {},
              formulasCelda: {}, congeladas: 0, maxRows: 0, maxCols: 0, escrituras: [] };
  const lastRow = function () {
    for (let i = h.valores.length - 1; i >= 0; i--) if (h.valores[i].some(function (v) { return v !== '' && v != null; })) return i + 1;
    return 0;
  };
  const lastCol = function () {
    let c = 0;
    h.valores.forEach(function (r) { for (let j = r.length - 1; j >= c; j--) if (r[j] !== '' && r[j] != null) { c = j + 1; break; } });
    return c;
  };
  h.maxRows = Math.max(o.maxRows || 0, h.valores.length, 1);
  h.maxCols = Math.max(o.maxCols || 0, lastCol(), 1);
  const asegurar = function (r, c) {
    if (r > h.maxRows || c > h.maxCols) {
      throw new Error('The coordinates of the range are outside the dimensions of the sheet (' + nombre + ' ' + r + ',' + c + ')');
    }
    while (h.valores.length < r) h.valores.push([]);
    h.valores.forEach(function (fila) { while (fila.length < c) fila.push(''); });
  };
  const leer = function (r, c) { const f = h.valores[r - 1]; return f && f[c - 1] !== undefined ? f[c - 1] : ''; };
  const rango = function (r, c, nr, nc) {
    nr = nr || 1; nc = nc || 1;
    const celdas = function (fn) { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) fn(r + i, c + j, i, j); };
    return {
      getValues: function () { const out = []; for (let i = 0; i < nr; i++) { const f = []; for (let j = 0; j < nc; j++) f.push(leer(r + i, c + j)); out.push(f); } return out; },
      getValue: function () { return leer(r, c); },
      getFormulas: function () { const out = []; for (let i = 0; i < nr; i++) { const f = []; for (let j = 0; j < nc; j++) f.push(h.formulasCelda[(r + i) + ':' + (c + j)] || ''); out.push(f); } return out; },
      setValues: function (m) {
        if (m.length !== nr || m[0].length !== nc) throw new Error('setValues: ' + m.length + 'x' + m[0].length + ' en un rango de ' + nr + 'x' + nc);
        asegurar(r + nr - 1, c + nc - 1);
        // como Sheets: un texto que empieza con apóstrofo queda como TEXTO, sin el apóstrofo ("'03735" → "03735")
        const comoSheets = function (v) { return typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v; };
        celdas(function (fi, co, i, j) { h.valores[fi - 1][co - 1] = comoSheets(m[i][j]); h.escrituras.push({ fila: fi, col: co, valor: m[i][j] }); });
      },
      setValue: function (v) { asegurar(r, c); h.valores[r - 1][c - 1] = v; h.escrituras.push({ fila: r, col: c, valor: v }); },
      getBackgrounds: function () { const out = []; for (let i = 0; i < nr; i++) { const f = []; for (let j = 0; j < nc; j++) f.push(h.fondos[(r + i) + ':' + (c + j)] || '#ffffff'); out.push(f); } return out; },
      setBackground: function (bg) { celdas(function (fi, co) { h.fondos[fi + ':' + co] = bg; }); },
      setNumberFormat: function (f) { celdas(function (fi, co) { h.formatos[fi + ':' + co] = f; }); },
      clearFormat: function () { celdas(function (fi, co) { delete h.fondos[fi + ':' + co]; delete h.formatos[fi + ':' + co]; }); },
      clearContent: function () { celdas(function (fi, co) { if (h.valores[fi - 1]) h.valores[fi - 1][co - 1] = ''; }); }
    };
  };
  const sheet = {
    getName: function () { return nombre; },
    getLastRow: lastRow, getLastColumn: lastCol,
    getMaxRows: function () { return h.maxRows; }, getMaxColumns: function () { return h.maxCols; },
    getRange: function (r, c, nr, nc) { return rango(r, c, nr, nc); },
    getDataRange: function () { return rango(1, 1, Math.max(lastRow(), 1), Math.max(lastCol(), 1)); },
    getRangeList: function (lista) {
      const rs = lista.map(function (a1) {
        const p = a1.split(':'), x = aA1(p[0]), y = p[1] ? aA1(p[1]) : x;
        return rango(x.fila, x.col, y.fila - x.fila + 1, y.col - x.col + 1);
      });
      return {
        setBackground: function (bg) { rs.forEach(function (q) { q.setBackground(bg); }); },
        setNumberFormat: function (f) { rs.forEach(function (q) { q.setNumberFormat(f); }); },
        setValue: function (v) { rs.forEach(function (q) { q.setValue(v); }); },
        clearContent: function () { rs.forEach(function (q) { q.clearContent(); }); }
      };
    },
    insertColumnsAfter: function (despues, n) {
      if (despues !== h.maxCols) throw new Error('insertColumnsAfter: el mock sólo agrega al final');
      h.maxCols += n;
      // como Sheets: la columna nueva HEREDA el formato de la anterior (para probar que se limpia)
      for (let i = 1; i <= h.maxRows; i++) {
        const bg = h.fondos[i + ':' + despues];
        for (let k = 1; k <= n; k++) if (bg) h.fondos[i + ':' + (despues + k)] = bg;
      }
    },
    insertRowsAfter: function (despues, n) {
      if (despues !== h.maxRows) throw new Error('insertRowsAfter: el mock sólo agrega al final');
      h.maxRows += n;
    },
    appendRow: function (arr) {
      const r = lastRow() + 1;
      if (r > h.maxRows) h.maxRows = r;
      if (arr.length > h.maxCols) h.maxCols = arr.length;
      rango(r, 1, 1, arr.length).setValues([arr]);
    },
    setFrozenRows: function (n) { h.congeladas = n; },
    clearContents: function () { h.valores = []; }
  };
  h.sheet = sheet;
  return h;
}

function crearArchivo(id, nombre, hojas, tz) {
  const a = { id: id, nombre: nombre, hojas: {}, tz: tz || 'America/Argentina/Buenos_Aires' };
  Object.keys(hojas || {}).forEach(function (n) { a.hojas[n] = crearHoja(n, hojas[n].valores || hojas[n], hojas[n].opciones); });
  a.ss = {
    getName: function () { return nombre; },
    getId: function () { return id; },
    getSpreadsheetTimeZone: function () { return a.tz; },
    getSheetByName: function (n) { return a.hojas[n] ? a.hojas[n].sheet : null; },
    insertSheet: function (n) { a.hojas[n] = crearHoja(n, [], { maxRows: 1000, maxCols: 30 }); return a.hojas[n].sheet; },
    getSheets: function () { return Object.keys(a.hojas).map(function (n) { return a.hojas[n].sheet; }); }
  };
  return a;
}

/**
 * El entorno: `opciones.base` (las filas de la base, sin encabezado; o `opciones.bloqueBase` con encabezado), `jm` y
 * `funcionarios` (las solapas de la lista, ENTERAS: con sus filas de grupos y de encabezado), `hoy` (Date: el "hoy" del
 * reloj), `sinArchivoIds` (el archivo no se puede abrir), `maxColsBase` (para probar que se agregan columnas), `tzLista`
 * (el huso horario de la lista: 'GMT' para probar que las fechas se leen en el de la lista), `bloqueado` (el bloqueo
 * ocupado). Las fórmulas de una celda: `E.base().formulasCelda['fila:col'] = '=…'`.
 */
function crearEntornoIds(opciones) {
  const o = opciones || {};
  const logs = [];
  const hoy = o.hoy || new Date(2026, 9, 8, 21, 0, 0);
  class FakeDate extends Date {
    constructor(...a) { if (a.length === 0) super(hoy.getTime()); else super(...a); }
    static now() { return hoy.getTime(); }
  }
  const ctx = {
    console: console, Math: Math, JSON: JSON, Map: Map, Set: Set, Number: Number, String: String, Object: Object, Array: Array,
    RegExp: RegExp, Error: Error, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat, Date: FakeDate,
    Logger: { log: function (fmt) {
      const args = Array.prototype.slice.call(arguments, 1);
      let k = 0;
      logs.push(String(fmt).replace(/%s/g, function () { const v = args[k++]; return v instanceof Date ? formatDate(v, '', 'dd/MM/yyyy') : String(v); }));
    } },
    Utilities: { formatDate: formatDate, sleep: function () {}, getUuid: function () { return 'uuid-' + Math.random().toString(16).slice(2); } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return !o.bloqueado; }, releaseLock: function () {} }; } },
    PropertiesService: { getScriptProperties: function () { const p = {}; return { getProperty: function (k) { return p[k] || null; },
      setProperty: function (k, v) { p[k] = v; }, deleteProperty: function (k) { delete p[k]; } }; } }
  };
  vm.createContext(ctx);
  // `o.extra`: más archivos del proyecto; `o.reemplazos`: { archivo: [[texto, por]] } (prender un interruptor en un test)
  ARCHIVOS.concat(o.extra || []).forEach(function (f) {
    let src = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    ((o.reemplazos || {})[f] || []).forEach(function (r) {
      if (src.indexOf(r[0]) < 0) throw new Error('reemplazo: no está "' + r[0] + '" en ' + f);
      src = src.split(r[0]).join(r[1]);
    });
    vm.runInContext(src, ctx, { filename: f });
  });
  const cfg = function (expr) { return vm.runInContext(expr, ctx); };
  _convFecha_ = function (v) { return (v instanceof Date && !(v instanceof FakeDate)) ? new FakeDate(v.getTime()) : v; };

  const bloqueBase = o.bloqueBase || [hdrBase(o.columnasExtra)].concat(o.base || []);
  const archivos = {};
  const destino = crearArchivo(cfg('RDV_SS_DESTINO'), 'RDV JM-CM - ES / funcionarios', {});
  destino.hojas[cfg('RDV_HOJA_DESTINO')] = crearHoja(cfg('RDV_HOJA_DESTINO'), bloqueBase,
    { maxRows: bloqueBase.length + 50, maxCols: o.maxColsBase || bloqueBase[0].length });
  destino.hojas[cfg('RDV_HOJA_COMUNAS')] = crearHoja(cfg('RDV_HOJA_COMUNAS'), bloqueComunas());
  archivos[destino.id] = destino;
  const intermedia = crearArchivo(cfg('RDV_SS_INTERMEDIA'), 'Base intermedia Reuniones de Vecinos', {});
  archivos[intermedia.id] = intermedia;
  const hojasIds = {};
  if (o.jm) hojasIds[cfg('IDS_SOLAPA_JM')] = o.jm;
  if (o.funcionarios) hojasIds[cfg('IDS_SOLAPA_FUNCIONARIOS')] = o.funcionarios;
  const lista = crearArchivo(cfg('RDV_SS_IDS'), 'Base reuniones - Digital - Call Center', hojasIds, o.tzLista);
  if (!o.sinArchivoIds) archivos[lista.id] = lista;

  ctx.SpreadsheetApp = {
    openById: function (id) {
      if (!archivos[id]) throw new Error('No tenés permiso para acceder al documento solicitado. (' + id + ')');
      return archivos[id].ss;
    },
    flush: function () {}
  };
  cfg('_ssDestino_ = null; _ssIntermedia_ = null; _cacheParsing_ = null;');

  return {
    ctx: ctx, logs: logs, archivos: archivos, cfg: cfg,
    run: function (expr) { return vm.runInContext(expr, ctx); },
    hoja: function (idArchivo, nombre) { return archivos[idArchivo] ? archivos[idArchivo].hojas[nombre] : null; },
    base: function () { return destino.hojas[cfg('RDV_HOJA_DESTINO')]; },
    intermedia: function (nombre) { return intermedia.hojas[nombre] || null; },
    log: function () { return logs.join('\n'); }
  };
}

module.exports = { crearEntornoIds: crearEntornoIds, hdrBase: hdrBase, filaBase: filaBase, D: D, HDR_BASE: HDR_BASE, COMUNAS: COMUNAS, formatDate: formatDate };
