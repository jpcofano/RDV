/**
 * tests/escritura_lote.test.js — la escritura en lote del upsert, en Node, con 800 filas sintéticas.
 *
 *     node tests/escritura_lote.test.js            # los chequeos + el tiempo de la escritura
 *     node tests/escritura_lote.test.js --viejo    # además: el código de HEAD~ (celda por celda) con el
 *                                                 # mismo modelo de costo, para ver la calibración
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: figuras, fechas y
 * formularios son inventados; los barrios y comunas son los de la Ciudad, que son públicos.
 *
 * --- El modelo de tiempo (simulado, no medido) ---
 * Un reloj simulado avanza con cada llamada al servicio de planillas:
 *   - una LECTURA (getValue/getValues/getBackgrounds) cuesta COSTO.lectura y, antes, VACÍA LA COLA
 *     de escrituras pendientes, que cuesta COSTO.op por operación encolada. Es lo que hace Apps
 *     Script: las escrituras se agrupan hasta que algo lee;
 *   - una ESCRITURA (setValue/setValues/setBackground/RangeList) se encola;
 *   - leer `B` cuesta además COSTO.leerB (el 02/10 tardó ~1 minuto) y el cálculo del plan COSTO.calculo;
 *   - pasados 6 minutos de ejecución, cualquier llamada tira "Exceeded maximum execution time".
 * Con `--viejo` se corre además el código celda por celda (commit ea45b2a) con el mismo modelo, y se
 * escala el costo para que escriba a la velocidad medida el 02/10 (123 filas en ~255 s): el bloque
 * [2b] da el tiempo del código nuevo con ese factor. Es una calibración contra UN dato: el número es
 * una estimación, y la medición real la da la corrida sobre la copia (el log dice ms por tanda).
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', '05_Escritura.js', '20_UpsertDestino.js',
                  '25_Elecciones.js', '26_Fichas.js', 'diagnostico/12_por_que_vacia.js', 'diagnostico/13_fichas_prueba.js',
                  'diagnostico/07_formulas_destino.js', 'diagnostico/08_verificar_escritura.js',
                  'diagnostico/09_validar_cuentas.js', 'diagnostico/10_mal_escritas.js',
                  'diagnostico/11_repintar.js', 'diagnostico/14_activadores.js', '99_Pipeline.js', '30_Derivadas.js', 'diagnostico/15_oradores.js',
                  '27_RevisarFormato.js', '41_AgendaParser.js', '42_BarriosCabaGeo.js', '40_Agenda.js', 'diagnostico/20_columnas_b.js'];
const LIMITE_GAS_MS = 6 * 60 * 1000;
const COSTO_BASE = { lectura: 60, op: 40, porCelda: 0.002, openById: 300, leerB: 60000, calculo: 45000 };
/** 02/10 14:50: el cálculo terminó 14:52:41 y el corte fue 14:56:56 → ~255 s para 123 filas. */
const SEG_POR_FILA_REAL = 255 / 123;
const CALIBRACION = { k: null };

// ============================== el mock de Apps Script ==============================

function crearEntorno(opts) {
  opts = opts || {};
  const COSTO = Object.assign({}, COSTO_BASE, opts.costo || {});
  const E = { reloj: new Date(2026, 9, 2, 15, 0, 0).getTime(), inicio: 0, cola: 0, colaCeldas: 0, activadores: [],
              logs: [], props: {}, stats: { lecturas: 0, escrituras: 0 }, leyoB: false, specs: {} };

  class FakeDate extends Date {
    constructor(...a) { if (a.length === 0) super(E.reloj); else super(...a); }
    static now() { return E.reloj; }
  }
  E.Date = FakeDate;

  const vigilar = function () {
    if (E.inicio && E.reloj - E.inicio > LIMITE_GAS_MS) {
      const err = new Error('Exceeded maximum execution time');
      err.limite = true;
      throw err;
    }
  };
  const vaciar = function () {
    E.reloj += E.cola * COSTO.op + E.colaCeldas * COSTO.porCelda;
    E.cola = 0; E.colaCeldas = 0;
  };
  const leer = function (celdas) {
    vigilar(); vaciar();
    E.reloj += COSTO.lectura + celdas * COSTO.porCelda;
    E.stats.lecturas++;
    vigilar();
  };
  const escribir = function (celdas) {
    vigilar();
    E.cola++; E.colaCeldas += celdas;
    E.stats.escrituras++;
  };

  function colNum(letras) { let n = 0; for (const ch of letras) n = n * 26 + ch.charCodeAt(0) - 64; return n; }
  function parseA1(a1) {
    const p = a1.split(':').map(function (x) { const m = /^([A-Z]+)(\d+)$/.exec(x); return [+m[2], colNum(m[1])]; });
    const a = p[0], b = p[1] || p[0];
    return { r: a[0], c: a[1], nr: b[0] - a[0] + 1, nc: b[1] - a[1] + 1 };
  }

  class Hoja {
    constructor(nombre, filas, latencia) {
      this.nombre = nombre; this.v = filas.map(function (r) { return r.slice(); });
      this.bg = this.v.map(function (r) { return r.map(function () { return '#ffffff'; }); });
      this.latencia = latencia || 0;
    }
    getName() { return this.nombre; }
    _ancho() { return this.v.reduce(function (m, r) { return Math.max(m, r.length); }, 0); }
    getLastRow() {
      for (let i = this.v.length - 1; i >= 0; i--) if (this.v[i].some(function (x) { return x !== ''; })) return i + 1;
      return 0;
    }
    getLastColumn() { return this._ancho(); }
    _asegurar(r, c) {
      while (this.v.length < r) { this.v.push([]); this.bg.push([]); }
      for (let i = 0; i < r; i++) {
        while (this.v[i].length < c) { this.v[i].push(''); this.bg[i].push('#ffffff'); }
      }
    }
    get(r, c) { const f = this.v[r - 1]; return f && f[c - 1] !== undefined ? f[c - 1] : ''; }
    getRange(a, b, c, d) {
      if (typeof a === 'string') { const p = parseA1(a); return new Rango(this, p.r, p.c, p.nr, p.nc); }
      return new Rango(this, a, b, c || 1, d || 1);
    }
    getProtections(tipo) {
      return (this.protecciones || []).filter(function (x) { return !tipo || (x.tipo || 'RANGE') === tipo; });
    }
    // Protección de la hoja entera (06/10, fichas): con rangos sin proteger y editores.
    protect() {
      const h = this, pr = { tipo: 'SHEET', desc: '', warning: false, libres: [], editores: ['equipo@x', 'yo@x'], dominio: true,
        setDescription: function (d) { pr.desc = d; return pr; }, getDescription: function () { return pr.desc; },
        setWarningOnly: function (w) { pr.warning = w; return pr; },
        setUnprotectedRanges: function (l) { pr.libres = l.map(function (r) { return [r.r, r.c, r.nr, r.nc]; }); return pr; },
        addEditor: function (u) { const e = u.getEmail ? u.getEmail() : u; if (pr.editores.indexOf(e) < 0) pr.editores.push(e); return pr; },
        removeEditors: function (l) { const q = l.map(function (u) { return u.getEmail(); }); pr.editores = pr.editores.filter(function (e) { return q.indexOf(e) < 0; }); return pr; },
        getEditors: function () { return pr.editores.map(function (e) { return { getEmail: function () { return e; } }; }); },
        canDomainEdit: function () { return pr.dominio; }, setDomainEdit: function (d) { pr.dominio = d; return pr; },
        remove: function () { h.protecciones = h.protecciones.filter(function (x) { return x !== pr; }); } };
      this.protecciones = this.protecciones || [];
      this.protecciones.push(pr);
      return pr;
    }
    setFrozenColumns(n) { this.congeladas = n; }
    setColumnWidth(c, px) { this.anchos = this.anchos || {}; this.anchos[c] = px; }
    getRangeList(lista) {
      const h = this;
      const rangos = lista.map(function (a1) { const p = parseA1(a1); return new Rango(h, p.r, p.c, p.nr, p.nc); });
      return {
        setBackground: function (color) { escribir(rangos.length); rangos.forEach(function (r) { r._pintar(color); }); },
        setBorder: function () { const a = [].slice.call(arguments); escribir(rangos.length);
          rangos.forEach(function (r) { r.h.bordes = r.h.bordes || []; r.h.bordes.push({ r: r.r, c: r.c, nr: r.nr, nc: r.nc, args: a }); }); },
        setValue: function (v) { escribir(rangos.length); rangos.forEach(function (r) { r._poner(v); }); },
        clearContent: function () { escribir(rangos.length); rangos.forEach(function (r) { r._poner(''); }); },
        getRanges: function () { return rangos; }
      };
    }
    // Formato (fichas, 03/10): se guarda para poder mirarlo; no cuesta tiempo en el modelo.
    getMaxRows() { return Math.max(1000, this.v.length); }
    getMaxColumns() { return Math.max(26, this._ancho()); }
    insertRowsAfter() {}
    insertColumnsAfter() {}
    clearFormats() { this.bg = this.bg.map(function (r) { return r.map(function () { return '#ffffff'; }); }); this.fc = []; this.fw = []; }
    showColumns() { this.ocultas = []; }
    hideColumns(c, n) { this.ocultas = this.ocultas || []; for (let k = 0; k < (n || 1); k++) this.ocultas.push(c + k); }
    appendRow(fila) { escribir(fila.length); this.v.push(fila.slice()); this.bg.push(fila.map(function () { return '#ffffff'; })); }
    clearContents() { escribir(1); this.v = this.v.map(function (r) { return r.map(function () { return ''; }); }); }
    setFrozenRows(n) { this.filasCongeladas = n; }
    // Formato del 06/10 (27_RevisarFormato.js): alturas, cuadrícula, color de pestaña.
    setRowHeights(desde, n, alto) { this.altos = this.altos || {}; for (let k = 0; k < n; k++) this.altos[desde + k] = alto; }
    setHiddenGridlines(b) { this.sinCuadricula = b; }
    setTabColor(c) { this.colorPestana = c; }
  }

  class Rango {
    constructor(h, r, c, nr, nc) { this.h = h; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
    _celdas() { return this.nr * this.nc; }
    _leerExtra() {
      if (this.h.latencia && !E.leyoB) { E.leyoB = true; E.reloj += this.h.latencia; }
    }
    getValues() {
      leer(this._celdas()); this._leerExtra();
      const out = [];
      for (let i = 0; i < this.nr; i++) { const f = []; for (let j = 0; j < this.nc; j++) f.push(this.h.get(this.r + i, this.c + j)); out.push(f); }
      return out;
    }
    getValue() { leer(1); return this.h.get(this.r, this.c); }
    getBackgrounds() {
      leer(this._celdas());
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const f = [];
        for (let j = 0; j < this.nc; j++) { const fb = this.h.bg[this.r + i - 1]; f.push(fb && fb[this.c + j - 1] || '#ffffff'); }
        out.push(f);
      }
      return out;
    }
    // Fórmulas (05/10): h.f['fila,col'] = texto. Sin cálculo: los valores que "muestran" los pone el test.
    getFormulas() {
      leer(this._celdas());
      const h = this.h, out = [];
      for (let i = 0; i < this.nr; i++) { const f = []; for (let j = 0; j < this.nc; j++) f.push((h.f || {})[(this.r + i) + ',' + (this.c + j)] || ''); out.push(f); }
      return out;
    }
    getFormula() { return this.getFormulas()[0][0]; }
    getFormulaR1C1() { return this.getFormulas()[0][0]; }
    setFormula(f) { escribir(1); this.h.f = this.h.f || {}; this.h.f[this.r + ',' + this.c] = f; }
    setFormulaR1C1(f) { escribir(this._celdas()); this.h.f = this.h.f || {};
      for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.h.f[(this.r + i) + ',' + (this.c + j)] = f; }
    clearContent() { escribir(this._celdas()); this._poner(''); }
    protect() {
      const pr = { desc: '', warning: false, rango: [this.r, this.c, this.nr, this.nc], h: this.h,
                   setDescription: function (d) { pr.desc = d; return pr; }, setWarningOnly: function (w) { pr.warning = w; return pr; },
                   getDescription: function () { return pr.desc; },
                   remove: function () { pr.h.protecciones = pr.h.protecciones.filter(function (x) { return x !== pr; }); } };
      this.h.protecciones = this.h.protecciones || [];
      this.h.protecciones.push(pr);
      return pr;
    }
    getValuesSinCosto_() { const o = []; for (let i = 0; i < this.nr; i++) { o.push(new Array(this.nc).fill('')); } return o; }
    setValues(m) {
      this._borrarFormulas_();
      if (m.length !== this.nr || m.some((f) => f.length !== this.nc)) throw new Error('setValues: dimensiones');
      escribir(this._celdas());
      this.h._asegurar(this.r + this.nr - 1, this.c + this.nc - 1);
      for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.h.v[this.r + i - 1][this.c + j - 1] = m[i][j];
    }
    setValue(v) { escribir(1); this._poner(v); }
    _matriz(nombre, m) {
      escribir(this._celdas());
      const h = this.h; h[nombre] = h[nombre] || [];
      for (let i = 0; i < this.nr; i++) {
        h[nombre][this.r + i - 1] = h[nombre][this.r + i - 1] || [];
        for (let j = 0; j < this.nc; j++) h[nombre][this.r + i - 1][this.c + j - 1] = m[i][j];
      }
    }
    setBackgrounds(m) {
      escribir(this._celdas());
      this.h._asegurar(this.r + this.nr - 1, this.c + this.nc - 1);
      for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.h.bg[this.r + i - 1][this.c + j - 1] = m[i][j];
    }
    setFontColors(m) { this._matriz('fc', m); }
    setFontWeights(m) { this._matriz('fw', m); }
    setFontStyles(m) { this._matriz('fs', m); }
    setWraps(m) { this._matriz('wr', m); }
    setDataValidations(m) { this._matriz('dv', m); }
    clearDataValidations() { this.h.dv = []; }
    setBackground(c) { escribir(this._celdas()); this._pintar(c); }
    // Formato del 06/10 (27_RevisarFormato.js).
    clear() {
      this._poner(''); this._pintar('#ffffff');
      const h = this.h, r0 = this.r, c0 = this.c, nr = this.nr, nc = this.nc;
      ['fc', 'fw', 'fs', 'fz', 'ha', 'ws', 'wr'].forEach(function (k) {
        (h[k] || []).forEach(function (fila, i) {
          if (fila && i >= r0 - 1 && i < r0 - 1 + nr) for (let j = c0 - 1; j < c0 - 1 + nc; j++) fila[j] = undefined;
        });
      });
    }
    setNumberFormat(f) { this.h.formatoNumero = f; }
    setFontSizes(m) { this._matriz('fz', m); }
    setHorizontalAlignments(m) { this._matriz('ha', m); }
    setWrapStrategies(m) { this._matriz('ws', m); }
    setVerticalAlignment(v) { this.h.alineacionVertical = v; }
    setFontFamily(f) { this.h.fuente = f; }
    setDataValidation(regla) { this._matriz('dv', [[regla]]); }
    setBorder() { const a = [].slice.call(arguments); escribir(1); this.h.bordes = this.h.bordes || [];
      this.h.bordes.push({ r: this.r, c: this.c, nr: this.nr, nc: this.nc, args: a }); }
    _borrarFormulas_() {
      if (!this.h.f) return;
      for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) delete this.h.f[(this.r + i) + ',' + (this.c + j)];
    }
    _poner(v) {
      this._borrarFormulas_();
      this.h._asegurar(this.r + this.nr - 1, this.c + this.nc - 1);
      for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.h.v[this.r + i - 1][this.c + j - 1] = v;
    }
    _pintar(color) {
      this.h._asegurar(this.r + this.nr - 1, this.c + this.nc - 1);
      for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.h.bg[this.r + i - 1][this.c + j - 1] = color;
    }
  }

  const planillas = {};
  E.planilla = function (id) {
    if (!planillas[id]) {
      const hojas = {};
      planillas[id] = {
        hojas: hojas,
        getSheetByName: function (n) { return hojas[n] || null; },
        insertSheet: function (n) { escribir(1); hojas[n] = new Hoja(n, []); return hojas[n]; }
      };
    }
    return planillas[id];
  };
  E.Hoja = Hoja;

  const Utilities = {
    getUuid: function () { return crypto.randomUUID(); },
    sleep: function (ms) { E.reloj += ms; },
    DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
    computeDigest: function (alg, s) {
      return Array.from(crypto.createHash('md5').update(String(s), 'utf8').digest()).map(function (b) { return b > 127 ? b - 256 : b; });
    },
    formatDate: function (d, tz, fmt) {
      if (fmt === 'u') return String(d.getDay() || 7);   // 1 = lunes … 7 = domingo
      const p = function (n) { return ('0' + n).slice(-2); };
      return fmt.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate()))
                .replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds()));
    }
  };
  const ctx = {
    Date: FakeDate, Math: Math, JSON: JSON, console: console,
    Logger: { log: function (fmt) {
      const args = Array.prototype.slice.call(arguments, 1);
      let i = 0;
      E.logs.push(String(fmt).replace(/%s/g, function () { return String(args[i++]); }));
    } },
    Utilities: Utilities,
    Session: { getEffectiveUser: function () { return { getEmail: function () { return 'yo@x'; } }; } },
    SpreadsheetApp: {
      openById: function (id) { vigilar(); E.reloj += COSTO.openById; return E.planilla(id); },
      newDataValidation: function () {
        const r = { lista: null };
        const b = { requireValueInList: function (l) { r.lista = l; return b; }, setAllowInvalid: function () { return b; },
                    setHelpText: function (t) { r.ayuda = t; return b; }, build: function () { return r; } };
        return b;
      },
      flush: function () { vigilar(); vaciar(); },
      ProtectionType: { RANGE: 'RANGE', SHEET: 'SHEET' },
      BorderStyle: { SOLID: 'SOLID', SOLID_MEDIUM: 'SOLID_MEDIUM', SOLID_THICK: 'SOLID_THICK' },
      WrapStrategy: { WRAP: 'WRAP', CLIP: 'CLIP', OVERFLOW: 'OVERFLOW' }
    },
    // Activadores (04/10): E.activadores es la lista de nombres de función con activador.
    ScriptApp: {
      getProjectTriggers: function () {
        return E.activadores.map(function (fn, i) {
          return { getHandlerFunction: function () { return fn; }, getEventType: function () { return 'CLOCK'; },
                   getTriggerSource: function () { return 'CLOCK'; }, getTriggerSourceId: function () { return ''; },
                   getUniqueId: function () { return 't' + i; }, _fn: fn };
        });
      },
      newTrigger: function (fn) {
        const b = { timeBased: function () { return b; }, everyHours: function () { return b; },
                    create: function () { E.activadores.push(fn); return {}; } };
        return b;
      },
      deleteTrigger: function (t) { const i = E.activadores.indexOf(t._fn); if (i >= 0) E.activadores.splice(i, 1); }
    },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    PropertiesService: { getScriptProperties: function () {
      return { getProperty: function (k) { return E.props[k] || null; },
               setProperty: function (k, v) { E.props[k] = String(v); },
               deleteProperty: function (k) { delete E.props[k]; } };
    } }
  };
  vm.createContext(ctx);
  const fuente = opts.fuente || function (f) { return fs.readFileSync(path.join(RAIZ, f), 'utf8'); };
  /*
   * Constantes de 00_Config.js que un escenario cambia (03/10). Por defecto DIAS_ACTIVOS = null (todas las
   * filas): los escenarios de antes del 03/10 usan fechas de 2025 y 2026 contra un "hoy" del 02/10/2026.
   * El escenario [15] pone DIAS_ACTIVOS = 30 y las fichas.
   */
  // 06/10: la copia de prueba ya no existe; los escenarios escriben en la solapa del destino, simulada.
  // DERIVADAS_POR_SCRIPT: los datos sintéticos traen derivadas de mentira ("derivada-i"); sólo [19] lo prende.
  // REVISAR_FORMATO_NUEVO: los escenarios de fichas de antes del 06/10 prueban el formato de una ficha por bloque; [22], el nuevo.
  // AGENDA_ACTIVA: los escenarios del upsert no simulan Gmail; sólo [24] la prende (07/10).
  const config = Object.assign({ DIAS_ACTIVOS: 'null', DERIVADAS_POR_SCRIPT: 'false',
                                 REVISAR_FORMATO_NUEVO: 'false', AGENDA_ACTIVA: 'false' },
                               opts.config || {});
  ARCHIVOS.forEach(function (f) {
    let s;
    try { s = fuente(f); } catch (e) { return; }   // el código viejo no tiene todos los archivos
    if (f === '00_Config.js') {
      Object.keys(config).forEach(function (k) {
        s = s.replace(new RegExp('^const ' + k + '\\s+=.*', 'm'), function () { return 'const ' + k + ' = ' + config[k] + ';'; });
      });
    }
    vm.runInContext(s, ctx, { filename: f });
  });
  // El paso 14 mira fórmulas reales: en el mock no hay. Se lo reemplaza por "todo bien".
  vm.runInContext('var __diagFormulasReal = typeof diagFormulasDestino === "function" ? diagFormulasDestino : null;', ctx);
  vm.runInContext('function diagFormulasDestino() { return { difs: {} }; }', ctx);
  // El cálculo del plan cuesta tiempo en Apps Script; acá se carga en el reloj una vez por ejecución.
  if (vm.runInContext('typeof calcularPlan_', ctx) === 'function') {
    const orig = ctx.calcularPlan_;
    ctx.calcularPlan_ = function () { const p = orig.apply(this, arguments); E.reloj += COSTO.calculo; return p; };
  }
  E.ctx = ctx;
  E.cfg = function (expr) { return vm.runInContext(expr, ctx); };

  /** Una "ejecución" de Apps Script: globales de nuevo en cero y el límite de 6 minutos. */
  E.ejecutar = function (nombre) {
    vm.runInContext('_ssDestino_ = null; _ssIntermedia_ = null; _cacheParsing_ = null;', ctx);
    E.inicio = E.reloj; E.leyoB = false; E.logs = [];
    const lect0 = E.stats.lecturas, esc0 = E.stats.escrituras;
    let resultado = null, error = null;
    try { resultado = ctx[nombre](); } catch (err) { error = err; }
    try { vaciar(); } catch (e) { /* fin */ }
    const r = { ms: E.reloj - E.inicio, resultado: resultado, error: error, logs: E.logs,
                lecturas: E.stats.lecturas - lect0, escrituras: E.stats.escrituras - esc0 };
    E.inicio = 0;
    return r;
  };
  return E;
}

// ============================== los datos sintéticos ==============================

const BARRIOS = [['Palermo', 14], ['Recoleta', 2], ['Belgrano', 13], ['Caballito', 6], ['Flores', 7],
  ['Almagro', 5], ['Boedo', 5], ['Balvanera', 3], ['San Cristóbal', 3], ['Monserrat', 1], ['Retiro', 1],
  ['San Telmo', 1], ['La Boca', 4], ['Barracas', 4], ['Parque Patricios', 4], ['Villa Lugano', 8],
  ['Mataderos', 9], ['Liniers', 9], ['Villa Devoto', 11], ['Villa del Parque', 11], ['Agronomía', 15],
  ['Chacarita', 15], ['Villa Urquiza', 12], ['Saavedra', 12], ['Núñez', 13], ['Colegiales', 13],
  ['Villa Crespo', 15], ['Parque Chacabuco', 7], ['Floresta', 10], ['Villa Luro', 10]];
const FIGURAS = ['Ana Pereyra', 'Bruno Salvatierra', 'Carla Montenegro', 'Diego Ferrandi', 'Elena Quintero',
  'Fabián Rossetti', 'Gisela Arambarri', 'Hugo Belmonte', 'Inés Cardozo', 'Julián Etcheverry',
  'Karina Lozada', 'Lucas Mendiburu', 'Marta Ocampo', 'Nicolás Palacios', 'Olga Rinaldi',
  'Pablo Sarmiento', 'Rocío Taboada', 'Sergio Urquiza', 'Tamara Villalba', 'Ulises Zamora'];

/** El destino: 41 columnas con los nombres que lee el upsert (las PENDIENTE_ del fixture, completadas) + 5 de traza. */
const HDR_DESTINO = (function () {
  const fx = fs.readFileSync(path.join(RAIZ, 'fixtures', 'RVD JM-CM - ES.csv'), 'utf8').split(/\r?\n/)[0].split(',');
  // Las columnas como en el destino real (06/10: R y S son los oradores; el sexo y las edades, AH a AO).
  const nombres = { C: 'EVENTO', F: 'HORA', H: 'One Page Entregado', I: 'STATUS REUNIÓN', J: 'Observaciones',
    L: 'Mail', M: 'Call Center', N: 'IVR', O: 'RRSS', P: 'Difusión', R: 'Oradores anotados', S: 'Oradores que hablaron',
    T: 'Temas mas comentados', U: 'Semaforo politico', V: 'Síntesis cualitativa:', AH: 'Masculinos', AI: 'Femeninos',
    AJ: '18-24', AK: '25-39', AL: '40-55', AM: '56-65', AN: '66+', AO: 'Sin identificar' };
  return fx.map(function (h) { const m = /^PENDIENTE_([A-Z]+)$/.exec(h); return m && nombres[m[1]] ? nombres[m[1]] : h; })
           .concat(['RDV_UID', 'form_origen', 'form_score', 'form_nivel', 'form_fecha_match', 'form_clave']);
})();
// Los encabezados de B desde el 02/10 (los de Hoja1 del origen), en el orden en que el generador arma las filas.
const HDR_B = ['nombre', 'fecha_fin', 'inscriptos', 'inscriptos_identificados', 'inscriptos_M', 'inscriptos_F',
  'inscriptos_edades_18_24', 'inscriptos_edades_25_39', 'inscriptos_edades_40_55', 'inscriptos_edades_56_65',
  'inscriptos_edades_66plus', 'inscriptos_canal_Mailing', 'inscriptos_canal_Facebook', 'inscriptos_canal_Google',
  'inscriptos_canal_CallCenter', 'inscriptos_canal_Difusion', 'inscriptos_canal_IVR', 'inscriptos_canal_Programmatic',
  'inscriptos_canal_Otros', 'inscriptos_X'];
// Los de antes (B con encabezados propios): tienen que seguir leyéndose por los alias de COLUMNAS_B.
const HDR_B_VIEJO = ['Nombre', 'Fecha_Fin', 'Inscriptos', 'Inscriptos unicos identificados', 'Inscriptos M', 'Inscriptos F',
  'Inscriptos edades 18-24', 'Inscriptos edades 25-39', 'Inscriptos edades 40-55', 'Inscriptos edades 56-65',
  'Inscriptos edades 66+', 'Inscriptos canal Mailing', 'Inscriptos canal Facebook', 'Inscriptos canal Google',
  'Inscriptos canal Call Center', 'Inscriptos canal Difusion', 'Inscriptos canal IVR', 'Inscriptos canal Programmatic',
  'Inscriptos canal Otros', '(columna vacía; X no existía)'];   // 07/10: una 'Inscriptos…' sin mapear frenaría los datos
const HDR_CONJUNTO = ['Figura', 'Barrio', 'FECHA', 'HORA', 'Dirección', 'Asistentes', 'Oradores anotados',
                      'Oradores que hablaron', 'STATUS REUNIÓN'];
const SEXO_EDADES = ['Masculinos', 'Femeninos', '18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar'];
const DERIVADAS = ['Día de la semana', '% de Asistencia', 'Direccion2', 'Falta Informacion', 'Comuna', 'Poblacion',
  'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona'];

function generarDatos(E, n) {
  const D = E.Date, col = function (nombre) { return HDR_DESTINO.indexOf(nombre); };
  const dest = [HDR_DESTINO.slice()], b = [HDR_B.slice()], conjunto = [HDR_CONJUNTO.slice()];
  for (let i = 0; i < n; i++) {
    const fecha = new D(2025, 6, 5 + Math.floor(i * 440 / n), 12, 0, 0);
    const fig = FIGURAS[i % FIGURAS.length];
    const bar = BARRIOS[(i * 7) % BARRIOS.length];
    const conBarrio = i % 31 !== 5;
    const r = HDR_DESTINO.map(function () { return ''; });
    r[col('Figura')] = fig; r[col('Barrio')] = conBarrio ? bar[0] : ''; r[col('FECHA')] = fecha;
    r[col('HORA')] = '18:00'; r[col('EVENTO')] = 'Encuentro con Vecinos';
    r[col('STATUS REUNIÓN')] = i % 10 === 3 ? 'en agenda' : (i % 47 === 0 ? 'Suspendida' : 'Realizada');
    r[col('Asistentes')] = i % 10 === 3 ? 20 + i % 30 : 30 + i % 50;
    r[col('Inscriptos')] = 80 + (i * 37) % 300;
    ['Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión'].forEach(function (c, k) { r[col(c)] = 5 + (i + k) % 40; });
    DERIVADAS.forEach(function (c) { if (col(c) >= 0) r[col(c)] = 'derivada-' + i; });
    // El 70% ya tiene sexo y edades (cargados por el equipo); el 30% es el hueco que llena el sistema.
    if (i % 10 >= 3) SEXO_EDADES.forEach(function (c, k) { r[col(c)] = 10 + k; });
    // Los oradores: cargados por el equipo, iguales a RDV CONJUNTO, salvo unos pocos vacíos.
    if (i % 50 !== 7) { r[col('Oradores anotados')] = 3 + i % 5; r[col('Oradores que hablaron')] = 2 + i % 3; }
    dest.push(r);

    const fin = new D(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() - 2, 12, 0, 0);
    const ins = r[col('Inscriptos')], uni = Math.round(ins * 0.8);
    b.push([fig.toUpperCase() + ' - Encuentro con vecinos - Comuna ' + bar[1] + ' - ' +
            fecha.getDate() + '/' + (fecha.getMonth() + 1), fin, ins, uni, Math.round(uni * 0.45), Math.round(uni * 0.55),
            Math.round(uni * 0.1), Math.round(uni * 0.3), Math.round(uni * 0.3), Math.round(uni * 0.2), Math.round(uni * 0.1),
            // canales: los mismos del destino (Mailing, Facebook = RRSS, Google, Call Center, Difusion, IVR, Programmatic, Otros)
            r[col('Mail')], r[col('RRSS')], 0, r[col('Call Center')], r[col('Difusión')], r[col('IVR')], 0, 0]);
    // RDV CONJUNTO: el barrio real (aunque el destino no lo tenga) y los asistentes del destino.
    // "Apellido Nombre", como lo escribe RDV CONJUNTO (02/10).
    conjunto.push([fig.split(' ').reverse().join(' '), bar[0], fecha, '18:00', '', r[col('Asistentes')],
                   3 + i % 5, 2 + i % 3, r[col('STATUS REUNIÓN')]]);
  }
  for (let k = 0; k < 25; k++) {   // ruido: formularios que no son de ninguna fila
    b.push(['OTRO EVENTO ' + k + ' - Comuna 3 - 15/3', new D(2024, 2, 13, 12, 0, 0), 10, 8, 4, 4, 1, 2, 2, 2, 1]);
  }
  const comunas = [['Barrio', 'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona', 'Eje geográfico']]
    .concat(BARRIOS.map(function (x) { return [x[0], x[1], 1000, 500, 500, 2, 500, 'Centro', '']; }));
  conjunto.push(['No aplica', 'No aplica', new D(2026, 0, 10, 12, 0, 0), '', '', 'No aplica', '', '', '']);
  conjunto.push(['Pereyra Ana', 'Palermo', new D(2024, 4, 3, 12, 0, 0), '', '', 50, 4, 2, '']);   // antes del destino
  return { dest: dest, b: b, comunas: comunas, conjunto: conjunto };
}

function montar(E, n, conCopia, casos) {
  const datos = generarDatos(E, n);
  if (casos) casos(E, datos);
  const ssD = E.planilla(E.cfg('RDV_SS_DESTINO')), ssI = E.planilla(E.cfg('RDV_SS_INTERMEDIA'));
  ssD.hojas['RVD JM-CM - ES'] = new E.Hoja('RVD JM-CM - ES', datos.dest);
  ssD.hojas['Comunas'] = new E.Hoja('Comunas', datos.comunas);
  ssD.hojas['RDV CONJUNTO'] = new E.Hoja('RDV CONJUNTO', datos.conjunto);
  ssI.hojas['B'] = new E.Hoja('B', datos.b, COSTO_BASE.leerB);
  return { ssD: ssD, ssI: ssI };
}

// ============================== chequeos ==============================

let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }
const colD = function (n) { return HDR_DESTINO.indexOf(n); };
const TRAZA = ['RDV_UID', 'form_origen', 'form_score', 'form_nivel', 'form_fecha_match', 'form_clave'];

/** Compara dos fotos del destino: ninguna celda llena cambió (salvo en agenda → Realizada), azul en lo escrito. */
function auditar(antes, despues) {
  const r = { pisadas: 0, escritas: 0, sinAzul: 0, fondosTocados: 0, manualesODerivadas: 0, realizadas: 0, malStatus: 0 };
  // Desde el paso B (02/10) la única columna manual es Barrio; las derivadas, nunca.
  const prohibidas = ['Barrio'].concat(DERIVADAS).map(colD);
  for (let i = 1; i < antes.v.length; i++) {
    for (let k = 0; k < HDR_DESTINO.length; k++) {
      const a = antes.v[i][k], d = despues.v[i] ? despues.v[i][k] : undefined;
      const azul = esColorSistemaTest(despues.bg[i][k]);
      if (a !== '' && a !== d) {
        if (k === colD('STATUS REUNIÓN') && a === 'en agenda' && d === 'Realizada' && azul) r.realizadas++;
        else if (k === colD('Inscriptos') && a === 0 && azul) r.escritas++;   // un 0 en Inscriptos es vacío
        else r.pisadas++;
      } else if (a === '' && d !== '' && d !== undefined) {
        r.escritas++;
        if (!azul) r.sinAzul++;
        if (prohibidas.indexOf(k) >= 0) r.manualesODerivadas++;
      } else if (antes.bg[i][k] !== despues.bg[i][k]) r.fondosTocados++;
    }
  }
  return r;
}
/** El color del sistema: el nuevo (#CFE2F3) o el viejo (#4F81BD). */
function esColorSistemaTest(bg) { return ['#cfe2f3', '#4f81bd'].indexOf(String(bg).toLowerCase()) >= 0; }
function foto(h) { return { v: h.v.map(function (r) { return r.slice(); }), bg: h.bg.map(function (r) { return r.slice(); }) }; }
function contarUid(h) { let n = 0; for (let i = 1; i < h.v.length; i++) if (h.v[i][colD('RDV_UID')]) n++; return n; }

// ============================== los escenarios ==============================

function escenarioDesdeCero() {
  console.log('\n[1] 800 filas, sin traza: una escritura completa');
  const E = crearEntorno();
  const m = montar(E, 800, true);
  const hoja = m.ssD.hojas['RVD JM-CM - ES'];
  const antes = foto(hoja);
  const r = E.ejecutar('upsertDestino');
  ok(!r.error, 'termina sin error' + (r.error ? ': ' + r.error.message : ''));
  const w = r.resultado && r.resultado.escritura;
  const a = auditar(antes, hoja);
  ok(a.pisadas === 0, 'ninguna celda con valor fue pisada (' + a.pisadas + ')');
  ok(a.sinAzul === 0, 'todo lo escrito está en azul');
  ok(a.fondosTocados === 0, 'ningún otro fondo cambió');
  ok(a.manualesODerivadas === 0, 'ninguna columna manual ni derivada recibió nada');
  ok(w && w.completa, 'completa en una corrida');
  ok(contarUid(hoja) === w.filasHechas, 'filas con RDV_UID = filas escritas (' + contarUid(hoja) + ')');
  ok(a.realizadas === w.realizadas && a.realizadas > 0, 'STATUS en agenda → Realizada: ' + a.realizadas);
  ok(r.ms < LIMITE_GAS_MS, 'la ejecución entera entra en 6 minutos');
  console.log('  >>> tiempo simulado: ejecución %s s, escritura %s s (%s filas, %s tandas, la más lenta %s ms)',
              (r.ms / 1000).toFixed(1), (w.msEscritura / 1000).toFixed(1), w.filasHechas, w.tandas, Math.round(w.tandaMax));
  console.log('      celdas: datos %s, traza %s, uids %s | llamadas al servicio: %s lecturas, %s escrituras',
              w.celdas, w.trazas, w.uids, r.lecturas, r.escrituras);

  // Una segunda corrida no escribe nada: todas entran por RDV_UID y están completas.
  const f2 = foto(hoja);
  const r2 = E.ejecutar('upsertDestino');
  const w2 = r2.resultado.escritura;
  ok(w2.filasPendientes === 0 && JSON.stringify(foto(hoja)) === JSON.stringify(f2),
     'la segunda corrida no tiene nada que escribir y no toca nada (' + w2.filasPendientes + ' filas)');
  const v = E.ejecutar('verificarEscritura').resultado;
  ok(v.incompletas === 0 && v.problemas.length === 0, 'paso 16: 0 incompletas, sin problemas (' + v.problemas.join('; ') + ')');
  return { E: E, ms: r.ms, w: w };
}

function escenarioReanudarCortada(fuenteVieja) {
  console.log('\n[2] reanudación: una corrida cortada a los 6 minutos (como la del 02/10), después la nueva');
  // La cortada se arma escribiendo como el código viejo: celda por celda, en orden, y cortando a mitad de una fila.
  const E = crearEntorno();
  const m = montar(E, 800, true);
  const hoja = m.ssD.hojas['RVD JM-CM - ES'];
  let filasCortadas;
  if (fuenteVieja) {
    const V = crearEntorno({ fuente: fuenteVieja });
    const mv = montar(V, 800, false);
    // Cuándo empieza a escribir el viejo, para medir su velocidad de escritura.
    let tEsc = null;
    const aplicar = V.ctx.aplicarDecisiones_;
    V.ctx.aplicarDecisiones_ = function () { tEsc = V.reloj; return aplicar.apply(this, arguments); };
    const rv = V.ejecutar('upsertDestino');
    ok(rv.error && rv.error.limite, 'el código viejo se corta por el límite de 6 minutos');
    const vieja = mv.ssD.hojas['RVD JM-CM - ES'];
    filasCortadas = contarUid(vieja);
    const sPorFila = (V.reloj - tEsc) / 1000 / filasCortadas;
    CALIBRACION.k = (SEG_POR_FILA_REAL) / sPorFila;
    console.log('  >>> código viejo (celda por celda): %s filas con RDV_UID al cortarse; %s s por fila en el modelo, ' +
                'contra %s s por fila el 02/10 (123 filas en ~255 s) → factor de calibración %s',
                filasCortadas, sPorFila.toFixed(2), SEG_POR_FILA_REAL.toFixed(2), CALIBRACION.k.toFixed(2));
    // Lo que escribió el viejo pasa a la copia, celda por celda (sólo lo escrito: las fechas de
    // otro entorno no son Date de éste). Los uuids son otros: da igual.
    for (let i = 1; i < hoja.v.length; i++) {
      for (let k = 0; k < HDR_DESTINO.length; k++) {
        const a = hoja.v[i][k], b = vieja.v[i][k];
        if (a === '' && b !== '' && b !== undefined || (a === 'en agenda' && b === 'Realizada')) {
          hoja.v[i][k] = b; hoja.bg[i][k] = vieja.bg[i][k];
        }
      }
    }
  } else {
    // Sin el código viejo: 123 filas escritas a mano en el mock, la última a mitad.
    const E2 = crearEntorno(); const m2 = montar(E2, 800, true);
    E2.ejecutar('upsertDestino');
    const llena = m2.ssD.hojas['RVD JM-CM - ES'];
    // Las primeras 123 filas escritas, completas; la 123ª sólo con traza y RDV_UID (el corte cayó
    // antes de sus datos), como dejaba el orden del código viejo: traza, uid, datos, STATUS.
    let n = 0;
    const iSt = colD('STATUS REUNIÓN');
    for (let i = 1; i < llena.v.length && n < 123; i++) {
      if (!llena.v[i][colD('RDV_UID')]) continue;
      n++;
      for (let k = 0; k < HDR_DESTINO.length; k++) {
        const esTraza = TRAZA.indexOf(HDR_DESTINO[k]) >= 0;
        const nueva = hoja.v[i][k] === '' && llena.v[i][k] !== '';
        const status = k === iSt && hoja.v[i][k] === 'en agenda' && llena.v[i][k] === 'Realizada';
        if (!nueva && !status) continue;
        if (n === 123 && !esTraza) continue;
        hoja.v[i][k] = llena.v[i][k]; hoja.bg[i][k] = llena.bg[i][k];
      }
    }
    filasCortadas = 123;
  }
  const v0 = E.ejecutar('verificarEscritura').resultado;
  console.log('  paso 16 antes de seguir: %s con RDV_UID, %s incompletas', v0.conUid, v0.incompletas);
  ok(v0.conUid === filasCortadas, 'el paso 16 cuenta las filas cortadas (' + v0.conUid + ')');
  const uidsAntes = {};
  for (let i = 1; i < hoja.v.length; i++) if (hoja.v[i][colD('RDV_UID')]) uidsAntes[i] = hoja.v[i][colD('RDV_UID')];
  const antes = foto(hoja);
  const r = E.ejecutar('upsertDestino');
  ok(!r.error, 'la corrida nueva termina sin error' + (r.error ? ': ' + r.error.message : ''));
  const a = auditar(antes, hoja);
  ok(a.pisadas === 0 && a.sinAzul === 0 && a.fondosTocados === 0, 'no pisa, todo azul, ningún otro fondo (' + JSON.stringify(a) + ')');
  ok(Object.keys(uidsAntes).every(function (i) { return hoja.v[i][colD('RDV_UID')] === uidsAntes[i]; }),
     'las filas cortadas conservan su RDV_UID (entran por RDV_UID, no se reescriben)');
  const v = E.ejecutar('verificarEscritura').resultado;
  ok(v.incompletas === 0, 'después: 0 incompletas (' + v.incompletas + ')');
  ok(v.problemas.length === 0, 'paso 16 sin problemas (' + v.problemas.join('; ') + ')');
  const w = r.resultado.escritura;
  console.log('  >>> la corrida nueva: %s s de ejecución, %s filas en %s tandas', (r.ms / 1000).toFixed(1), w.filasHechas, w.tandas);
}
function antesVacia(h, i, k) { return h.v[i][k] === ''; }

function escenarioCorteYContinuacion() {
  console.log('\n[3] corte propio: con el servicio 50 veces más lento, se corta sola y sigue en la próxima');
  const E = crearEntorno({ costo: { op: 2000, lectura: 3000 } });
  const m = montar(E, 800, true);
  const hoja = m.ssD.hojas['RVD JM-CM - ES'];
  const antes = foto(hoja);
  let corridas = 0, maxMs = 0, completa = false, cortes = 0;
  while (!completa && corridas < 10) {
    const r = E.ejecutar('upsertDestino');
    corridas++;
    if (r.error) { ok(false, 'corrida ' + corridas + ': ' + r.error.message); break; }
    maxMs = Math.max(maxMs, r.ms);
    completa = r.resultado.escritura.completa;
    if (!completa) {
      cortes++;
      ok(!!E.props[E.cfg('PROP_ESCRITURA_INCOMPLETA')], 'corrida ' + corridas + ': cortada, deja dicho hasta dónde llegó: ' +
         E.props[E.cfg('PROP_ESCRITURA_INCOMPLETA')]);
    }
  }
  ok(completa && cortes > 0, 'terminó en ' + corridas + ' corridas, ' + cortes + ' con corte propio');
  ok(maxMs < LIMITE_GAS_MS, 'ninguna llegó al límite de 6 minutos (la más larga: ' + (maxMs / 1000).toFixed(0) + ' s)');
  ok(!E.props[E.cfg('PROP_ESCRITURA_INCOMPLETA')], 'al completar, la marca de "incompleta" se borra');
  const a = auditar(antes, hoja);
  ok(a.pisadas === 0 && a.sinAzul === 0 && a.fondosTocados === 0, 'no pisa nada a lo largo de las corridas');
  const v = E.ejecutar('verificarEscritura').resultado;
  ok(v.incompletas === 0 && v.problemas.length === 0, 'paso 16: 0 incompletas, invariante 0');
}

function escenarioEquipoEnElMedio() {
  console.log('\n[4] el equipo carga una celda vacía DESPUÉS de que se calculó el plan: no se pisa');
  const E = crearEntorno();
  const m = montar(E, 800, true);
  const hoja = m.ssD.hojas['RVD JM-CM - ES'];
  const orig = E.ctx.setSiDelSistemaLote_;
  let celda = null;
  E.ctx.setSiDelSistemaLote_ = function (sh, hdr, esc) {
    if (!celda) {
      const e = esc.find(function (x) { return x.tipo === 'dato'; });
      celda = e; sh.v[e.fila - 1][e.col - 1] = 777;   // "una persona" escribe ahí
    }
    return orig(sh, hdr, esc);
  };
  E.ejecutar('upsertDestino');
  ok(celda && hoja.v[celda.fila - 1][celda.col - 1] === 777, 'la celda que cargó el equipo sigue en 777');
  ok(celda && !esColorSistemaTest(hoja.bg[celda.fila - 1][celda.col - 1]), 'y no se pintó con el color del sistema');
}

function escenarioGuarda() {
  console.log('\n[5] la guarda: sin la solapa destino, o una solapa con otros encabezados → error, sin escribir');
  let E = crearEntorno(); let m = montar(E, 50, true);
  const datos = m.ssD.hojas['RVD JM-CM - ES'];
  delete m.ssD.hojas['RVD JM-CM - ES'];
  let r = E.ejecutar('upsertDestino');
  ok(r.error && /No existe la solapa destino/.test(r.error.message), 'sin la solapa destino: ' + (r.error && r.error.message));
  E = crearEntorno({ config: { RDV_HOJA_DESTINO: "'Otra solapa'" } }); m = montar(E, 50, true);
  m.ssD.hojas['Otra solapa'] = new E.Hoja('Otra solapa', datos.v);
  m.ssD.hojas['Otra solapa'].v[0][colD('Masculinos')] = 'Varones';
  const antes = JSON.stringify(foto(m.ssD.hojas['Otra solapa']));
  r = E.ejecutar('upsertDestino');
  ok(r.error && /no son los del destino real/.test(r.error.message), 'otra solapa con un encabezado cambiado: ' + (r.error && r.error.message));
  ok(JSON.stringify(foto(m.ssD.hojas['Otra solapa'])) === antes, 'y no tocó nada');
}

/**
 * Los casos de gemelos del 02/10, con figuras inventadas. Gemelos = mismo nombre y cierres a
 * GEMELOS_MAX_DIAS (7) días o menos:
 *   G  la 309/315: dos gemelos, uno con 0 inscriptos (B 310) y otro con 49 (B 317). El de 0 se
 *      descarta (regla 3): queda uno, se lo queda la fila con barrio y la otra va a revisión;
 *   K  clave repetida: mismo nombre y mismo cierre, los dos con inscriptos → clave_repetida;
 *   K2 gemelos con cierres a 3 días, los dos con inscriptos → clave_repetida, nada solo;
 *   C  la 134: 72 contra 2 con cierres a 3 días → el de 2 se descarta y la fila escribe el de 72;
 *   M  la Macri "Orden Público": mismo nombre, cierres a 12 días → reuniones DISTINTAS, cada fila con
 *      el suyo, y el invariante no lo marca;
 *   I  la 645: dos filas quieren el mismo "1 a 1"; el invariante se lo da a la de 0 días y la otra toma
 *      el temático. El paso 16 tiene que decir "igual" para las dos.
 */
function casosGemelos(E, datos) {
  const D = E.Date, col = function (n) { return HDR_DESTINO.indexOf(n); };
  const fila = function (fig, d, m, barrio) {
    const r = HDR_DESTINO.map(function () { return ''; });
    r[col('Figura')] = fig; r[col('Barrio')] = barrio; r[col('FECHA')] = new D(2026, m - 1, d, 12, 0, 0);
    r[col('HORA')] = '18:00'; r[col('EVENTO')] = 'Encuentro con Vecinos'; r[col('STATUS REUNIÓN')] = 'Realizada';
    r[col('Asistentes')] = 40;   // Inscriptos vacío: lo completa el sistema desde B (paso B)
    ['Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión'].forEach(function (c) { r[col(c)] = 5; });
    datos.dest.push(r);
  };
  const form = function (nombre, d, m, ins) {
    const uni = Math.round(ins * 0.8);
    datos.b.push([nombre, new D(2026, m - 1, d, 12, 0, 0), ins, uni, Math.round(uni * 0.45), Math.round(uni * 0.55),
                  Math.round(uni * 0.1), Math.round(uni * 0.3), Math.round(uni * 0.3), Math.round(uni * 0.2), Math.round(uni * 0.1)]);
  };
  // G
  fila('Clara Mendieta', 7, 8, 'Recoleta');
  fila('Clara Mendieta', 5, 8, '');
  form('VÍNCULO CIUDADANO - Encuentro con vecinos - Clara Mendieta 07/08 Recoleta', 6, 8, 49);
  form('VÍNCULO CIUDADANO - Encuentro con vecinos - Clara Mendieta 07/08 Recoleta', 4, 8, 0);
  // K
  fila('Marcos Iturbe', 10, 8, 'Palermo');
  form('MARCOS ITURBE - Encuentro con vecinos - Comuna 14 - 10/8', 8, 8, 100);
  form('MARCOS ITURBE - Encuentro con vecinos - Comuna 14 - 10/8', 8, 8, 80);
  // K2
  fila('Ramiro Quesada', 14, 8, 'Belgrano');
  form('RAMIRO QUESADA - Encuentro con vecinos - Comuna 13 - 14/8', 13, 8, 60);
  form('RAMIRO QUESADA - Encuentro con vecinos - Comuna 13 - 14/8', 10, 8, 40);
  // C
  fila('Tobías Lezcano', 21, 8, 'Flores');
  form('TOBÍAS LEZCANO - Encuentro con vecinos - Comuna 7 - 21/8', 21, 8, 72);
  form('TOBÍAS LEZCANO - Encuentro con vecinos - Comuna 7 - 21/8', 18, 8, 2);
  // M
  fila('Jorge Benavídez', 16, 7, '');
  fila('Jorge Benavídez', 28, 7, '');
  form('JORGE BENAVÍDEZ - Encuentro Temático "Orden Público"/ Seguridad - Eje Norte', 16, 7, 73);
  form('JORGE BENAVÍDEZ - Encuentro Temático "Orden Público"/ Seguridad - Eje Norte', 28, 7, 753);
  // I
  fila('Jorge Benavídez', 17, 8, 'Boedo');
  fila('Jorge Benavídez', 16, 8, 'Almagro');
  form('JORGE BENAVÍDEZ - Encuentro 1 a 1 - Comuna 5 17/8', 15, 8, 200);
  form('JORGE BENAVÍDEZ - Encuentro Temático Educación - Eje Oeste - 16/8', 14, 8, 498);
}

function escenarioGemelos() {
  console.log('\n[8] gemelos (02/10): la 309/315, clave repetida, la 134, la Macri "Orden Público" y la 645');
  const E = crearEntorno();
  const m = montar(E, 200, true, casosGemelos);
  const hoja = m.ssD.hojas['RVD JM-CM - ES'];
  const filaDe = function (fig, d, mes) {
    return hoja.v.findIndex(function (r, i) {
      const f = r[colD('FECHA')];
      return i > 0 && r[colD('Figura')] === fig && f instanceof Date && f.getDate() === d && f.getMonth() + 1 === mes;
    }) + 1;
  };
  const F = { g315: filaDe('Clara Mendieta', 7, 8), g309: filaDe('Clara Mendieta', 5, 8), k: filaDe('Marcos Iturbe', 10, 8),
              k2: filaDe('Ramiro Quesada', 14, 8), c: filaDe('Tobías Lezcano', 21, 8),
              m697: filaDe('Jorge Benavídez', 16, 7), m709: filaDe('Jorge Benavídez', 28, 7),
              iX: filaDe('Jorge Benavídez', 17, 8), iY: filaDe('Jorge Benavídez', 16, 8) };
  const r = E.ejecutar('upsertDestino');
  ok(!r.error, 'termina sin error' + (r.error ? ': ' + r.error.message : ''));
  const uid = function (h, n) { return h.v[n - 1][colD('RDV_UID')]; };
  const val = function (n, c) { return hoja.v[n - 1][colD(c)]; };
  const log = r.logs.join('\n');
  const enRevisar = function (lg, n) {
    return lg.split('\n').some(function (l) { return l.indexOf('fila ' + n + ' ') >= 0 && /REVISAR/.test(l); });
  };
  ok(uid(hoja, F.g315) && !uid(hoja, F.g309), 'G: la "315" se escribe y la "309" no');
  ok(/Clara Mendieta 07\/08 Recoleta" — 2 formularios/.test(log) && /ins 0 → descartado por regla 3/.test(log),
     'G: el bloque 0b lista el par y descarta el de 0 inscriptos');
  ok(!uid(hoja, F.k) && !uid(hoja, F.k2) && /CLAVE REPETIDA/.test(log),
     'K y K2: dos gemelos con inscriptos (mismo cierre, o a 3 días) → clave_repetida, no se escriben');
  // Masculinos del de 72: uni = 58, M = 26 → round(72 × 26 / 58) = 32 (el de 2 daría 1).
  ok(uid(hoja, F.c) && val(F.c, 'Masculinos') === 32, 'C (la 134): se escribe con el de 72 (Masculinos ' + val(F.c, 'Masculinos') + ')');
  ok(uid(hoja, F.m697) && uid(hoja, F.m709) && val(F.m697, 'form_clave') !== val(F.m709, 'form_clave'),
     'M (Macri "Orden Público"): cierres a 12 días, dos reuniones: cada fila con el suyo');
  ok(/reuniones DISTINTAS, cada una por su clave\): 1/.test(log), 'M: el bloque 0b lo lista como reuniones distintas');
  ok(/1 a 1 - Comuna 5 17\/8/.test(val(F.iX, 'form_origen')) && /Temático Educación/.test(val(F.iY, 'form_origen')),
     'I (la 645): la de 0 días toma el "1 a 1" y la otra el temático (invariante)');
  ok(val(F.g315, 'form_clave') !== '', 'form_clave escrita: ' + val(F.g315, 'form_clave'));
  const v = E.ejecutar('verificarEscritura').resultado;
  ok(v.choques === 0, 'paso 16: invariante 0 (' + v.choques + ')');
  ok(v.distintas === 0, 'paso 16: 0 avisos "<<< HOY" — la "645" incluida, con el mismo plan (' + v.distintas + ')');
  ok(v.trazaSinAzul === 0 && v.incompletas === 0 && v.ambiguas === 0, 'paso 16: traza en azul, 0 incompletas, 0 ambiguas');

  console.log('  — lo que quedó en la copia: filas escritas sólo con el nombre (sin form_clave); la "309" con el gemelo —');
  const E2 = crearEntorno();
  const m2 = montar(E2, 200, true, casosGemelos);
  const h2 = m2.ssD.hojas['RVD JM-CM - ES'];
  E2.ejecutar('upsertDestino');
  // Como antes del 02/10 noche: ninguna fila con form_clave, y la "309" escrita con el mismo nombre.
  const nombreG = 'VÍNCULO CIUDADANO - Encuentro con vecinos - Clara Mendieta 07/08 Recoleta';
  for (let i = 1; i < h2.v.length; i++) h2.v[i][colD('form_clave')] = '';
  const n309 = F.g309;
  h2.v[n309 - 1][colD('RDV_UID')] = 'uid-viejo-309';
  h2.v[n309 - 1][colD('form_origen')] = nombreG;
  h2.v[n309 - 1][colD('form_score')] = 1; h2.v[n309 - 1][colD('form_nivel')] = 'figura+fecha';
  TRAZA.forEach(function (c) { h2.bg[n309 - 1][colD(c)] = '#4f81bd'; });
  const v1 = E2.ejecutar('verificarEscritura').resultado;
  ok(v1.choques === 1, 'paso 16 lo detecta: invariante 1 (sólo la "309/315"; la Macri no) (' + v1.choques + ')');
  ok(v1.ambiguas === 0, 'traza ambigua 0: con el de 0 descartado, cada nombre resuelve a un solo formulario (' + v1.ambiguas + ')');
  // La corrección (docs/ESTADO.md 0.i): borrar en la "309" lo que escribió el sistema y sacarle el azul.
  TRAZA.concat(SEXO_EDADES).forEach(function (c) {
    const k = colD(c);
    if (esColorSistemaTest(h2.bg[n309 - 1][k])) { h2.v[n309 - 1][k] = ''; h2.bg[n309 - 1][k] = '#ffffff'; }
  });
  const r2 = E2.ejecutar('upsertDestino');
  ok(!r2.error && !uid(h2, n309) && enRevisar(r2.logs.join('\n'), n309), 'después de corregir: la "309" va a REVISAR y no se escribe' +
     (r2.error ? ' — error: ' + r2.error.message : '') + ' — ' +
     r2.logs.filter(function (l) { return l.indexOf('fila ' + n309 + ' ') >= 0; }).join(' / '));
  let conClave = 0, conUid = 0;
  for (let i = 1; i < h2.v.length; i++) { if (h2.v[i][colD('RDV_UID')]) { conUid++; if (h2.v[i][colD('form_clave')]) conClave++; } }
  ok(conClave === conUid, 'form_clave completada en todas las filas con RDV_UID (' + conClave + ' de ' + conUid + ')');
  const v2 = E2.ejecutar('verificarEscritura').resultado;
  ok(v2.choques === 0 && v2.ambiguas === 0 && v2.distintas === 0 && v2.incompletas === 0 && v2.sinClave === 0,
     'paso 16: invariante 0, ambigua 0, 0 avisos "<<< HOY", 0 incompletas, 0 sin form_clave (' +
     [v2.choques, v2.ambiguas, v2.distintas, v2.incompletas, v2.sinClave].join('/') + ')');
}

/** B2 como lo armaba el legado (Sync B to B2.js), a partir de las filas de B. */
function armarB2(E, b) {
  const p2 = function (n) { return ('0' + n).slice(-2); };
  const filas = [['ID', 'Nombre', 'Inscriptos', 'Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión', 'Masculino', 'Femenino',
                  '18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar']];
  b.slice(1).forEach(function (r) {
    const ins = r[2], uni = r[3], e = r.slice(6, 11), suma = e.reduce(function (s, v) { return s + v; }, 0);
    const ff = r[1];
    filas.push([r[0] + ' - ' + p2(ff.getDate()) + '/' + p2(ff.getMonth() + 1) + '/' + ff.getFullYear(), r[0], ins,
                r[11], r[14], r[16], r[12] + r[13] + r[17], r[15] + r[18],   // Mail, Call Center, IVR, RRSS, Difusión
                uni > 0 ? Math.round(ins * r[4] / uni) : 0, uni > 0 ? Math.round(ins * r[5] / uni) : 0]
                .concat(e, [Math.max(0, ins - suma)]));
  });
  return filas;
}

function escenarioPasoA() {
  console.log('\n[9] PASO A: validación de cuentas (sólo lectura)');
  const E = crearEntorno();
  const m = montar(E, 300, true);
  m.ssI.hojas['B2'] = new E.Hoja('B2', armarB2(E, m.ssI.hojas['B'].v));
  const hoja = m.ssD.hojas['RVD JM-CM - ES'];
  const iAs = colD('Asistentes'), iBar = colD('Barrio');
  let vaciados = 0, sinBarrio = 0;
  for (let i = 1; i < hoja.v.length; i++) {
    if (hoja.v[i][iBar] === '') { sinBarrio++; continue; }
    if (i % 40 === 7 && vaciados < 7) { hoja.v[i][iAs] = ''; vaciados++; }
  }
  const foto2 = function () {
    return JSON.stringify(Object.keys(m.ssD.hojas).map(function (k) { return [m.ssD.hojas[k].v, m.ssD.hojas[k].bg]; })) +
           JSON.stringify(Object.keys(m.ssI.hojas).map(function (k) { return [m.ssI.hojas[k].v, m.ssI.hojas[k].bg]; }));
  };
  const antes = foto2();
  const r = E.ejecutar('validarCuentas');
  ok(!r.error, 'termina sin error' + (r.error ? ': ' + r.error.message : ''));
  ok(antes === foto2(), 'no escribió nada en ninguna planilla');
  const x = r.resultado;
  ['Inscriptos', 'Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión'].forEach(function (n) {
    const c = x.porCol[n];
    ok(c.comparables > 0 && c.exacto === c.comparables && c.b2IgualB === c.b2Comparables,
       n + ': exacto ' + c.exacto + ' de ' + c.comparables + ' | B = B2 ' + c.b2IgualB + ' de ' + c.b2Comparables);
  });
  // 07/10: 'Sin identificar' cambió de definición (el resto del sexo, decisión del usuario): ya no es la de B2. Y
  // Masculinos / Femeninos difieren de B2 sólo donde el redondeo se pasaba de Inscriptos (se le resta 1 al que más subió).
  const bv = m.ssI.hojas['B'].v, hb = bv[0];
  let sePasan = 0;
  bv.slice(1).forEach(function (r) {
    const ins = Number(r[hb.indexOf('inscriptos')]), id = Number(r[hb.indexOf('inscriptos_identificados')]);
    const M = Number(r[hb.indexOf('inscriptos_M')]), F = Number(r[hb.indexOf('inscriptos_F')]);
    if (id > 0 && M + F <= id && Math.round(ins * M / id) + Math.round(ins * F / id) > ins) sePasan++;
  });
  ['Masculinos', 'Femeninos'].forEach(function (n) {
    const c = x.porCol[n];
    ok(c.b2Comparables > 0 && c.b2Comparables - c.b2IgualB <= sePasan, n + ' con los encabezados nuevos de B: B = B2 ' +
       c.b2IgualB + ' de ' + c.b2Comparables + ' (difieren sólo los que el redondeo pasaba de Inscriptos: ' + sePasan + ')');
  });
  ['18-24', '66+'].forEach(function (n) {
    const c = x.porCol[n];
    ok(c.b2Comparables > 0 && c.b2IgualB === c.b2Comparables, n + ' con los encabezados nuevos de B: B = B2 ' +
       c.b2IgualB + ' de ' + c.b2Comparables);
  });
  const dv = x.divisores;
  ok(dv.identificados.M === dv.comparables.M && dv.comparables.M > 0,
     '1c: con el divisor "identificados", Masculinos = B2 en ' + dv.identificados.M + ' de ' + dv.comparables.M +
     ' (M+F: ' + dv['M+F'].M + ')');
  const a = x.asistentes;
  ok(a.encuentran === 300 && a.noEncuentran.length === 0,
     'Asistentes: "Apellido Nombre" cruza por tokens + fecha: ' + a.encuentran + ' de 300, no encuentran ' + a.noEncuentran.length);
  ok(a.destinoSinBarrio === sinBarrio, 'las ' + sinBarrio + ' sin barrio en el destino cruzan igual (el barrio sólo confirma): ' +
     a.destinoSinBarrio);
  ok(a.noAplica === 1 && a.antes === 1, '"No aplica" y la de 2024 se ignoran aparte (' + a.noAplica + ' / ' + a.antes + ')');
  ok(a.vacioYRdvTiene === vaciados, 'Asistentes vacíos que RDV CONJUNTO tiene: ' + a.vacioYRdvTiene);
  ok(/formularios en B: \d+ \| NO USAR 0 \| gemelos descartados \d+ \| candidatos \d+/.test(r.logs.join('\n')),
     'la línea nueva del log: ' + (r.logs.find(function (l) { return /formularios en B/.test(l); }) || ''));
}

/** Los encabezados de B: los viejos se leen por alias; si falta uno obligatorio, nada se calcula ni se escribe. */
function escenarioEncabezadosB() {
  console.log('\n[10] encabezados de B (02/10): alias viejos, y una columna obligatoria que falta');
  const E = crearEntorno();
  const m = montar(E, 200, true);
  m.ssI.hojas['B'].v[0] = HDR_B_VIEJO.slice();
  const r = E.ejecutar('upsertDestino');
  const hoja = m.ssD.hojas['RVD JM-CM - ES'];
  const filaHueco = hoja.v.findIndex(function (f, i) { return i > 0 && (i - 1) % 10 < 3; });
  ok(!r.error && hoja.v[filaHueco][colD('Masculinos')] !== '' && hoja.v[filaHueco][colD('18-24')] !== '',
     'con los encabezados VIEJOS se lee todo (alias): sexo y edades escritos');
  const ins = hoja.v[filaHueco][colD('Inscriptos')], sinId = hoja.v[filaHueco][colD('Sin identificar')];
  ok(sinId !== ins && sinId !== '', 'y Sin identificar NO es Inscriptos (' + sinId + ' contra ' + ins + ')');

  const E2 = crearEntorno();
  const m2 = montar(E2, 200, true);
  m2.ssI.hojas['B'].v[0][HDR_B.indexOf('inscriptos_edades_40_55')] = 'otra cosa';
  const antes = JSON.stringify(foto(m2.ssD.hojas['RVD JM-CM - ES']));
  const r2 = E2.ejecutar('upsertDestino');
  // 07/10: falta una obligatoria de DATOS → la corrida sigue (traza, uids, Asistentes, STATUS) pero NO escribe datos de B
  const h2 = m2.ssD.hojas['RVD JM-CM - ES'];
  const datosB = ['Inscriptos', 'Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión'].concat(SEXO_EDADES).map(colD);
  const antesV = JSON.parse(antes).v;
  const tocadosB = h2.v.filter(function (f, i) { return i > 0 && datosB.some(function (k) { return f[k] !== antesV[i][k]; }); }).length;
  ok(!r2.error && contarUid(h2) > 0 && tocadosB === 0,
     'falta una obligatoria de datos (edad40_55): sin error, la corrida sigue (uids ' + contarUid(h2) + ') y NO escribe datos de B (' + tocadosB + ')' +
     (r2.error ? ' — ' + r2.error.message : ''));
  ok(r2.logs.some(function (l) { return />>> COLUMNAS DE B: faltan columnas de datos: edad40_55/.test(l); }), 'y el log lo avisa');
  const r3 = E2.ejecutar('validarCuentas');
  ok(r3.error && /Faltan columnas/.test(r3.error.message), 'el paso 17 se frena');
  // una inscriptos_* que no está en el mapeo: lo mismo
  const E3 = crearEntorno();
  const m3 = montar(E3, 100, true);
  m3.ssI.hojas['B'].v[0][HDR_B.indexOf('inscriptos_X')] = 'inscriptos_canal_Telegram';
  const antes3 = JSON.parse(JSON.stringify(foto(m3.ssD.hojas['RVD JM-CM - ES']))).v;
  const r4 = E3.ejecutar('upsertDestino');
  const h3 = m3.ssD.hojas['RVD JM-CM - ES'];
  ok(!r4.error && h3.v.every(function (f, i) { return i === 0 || datosB.every(function (k) { return f[k] === antes3[i][k]; }); }) &&
     r4.logs.some(function (l) { return /sin mapear: inscriptos_canal_Telegram/.test(l); }),
     'una inscriptos_* sin mapear (inscriptos_canal_Telegram): no se escriben datos de B, y el log lo dice');
}

/**
 * El paso 18: el sistema escribió Sin identificar = Inscriptos (el bug del 02/10) en filas con RDV_UID.
 * Se listan en seco (con el backup del 02/10 para no tocar lo que ya estaba), se vacían y se les saca el
 * color, y la corrida siguiente las completa con el valor correcto.
 */
function escenarioMalEscritas() {
  console.log('\n[11] paso 18: deshacer lo mal escrito (Sin identificar = Inscriptos)');
  const E = crearEntorno();
  const m = montar(E, 200, true);
  const hoja = m.ssD.hojas['RVD JM-CM - ES'];
  // El backup: el destino antes de escribir.
  const backup = new E.Hoja('RVD JM-CM - ES', hoja.v);
  E.planilla(E.cfg('RDV_SS_BACKUP_0210')).hojas['RVD JM-CM - ES'] = backup;
  E.ejecutar('upsertDestino');
  const iSin = colD('Sin identificar'), iIns = colD('Inscriptos');
  // El bug: en 6 filas del hueco, Sin identificar = Inscriptos (azul, como lo escribió el sistema).
  const tocadas = [];
  for (let i = 1; i < hoja.v.length && tocadas.length < 6; i++) {
    // (07/10: sólo las que el sistema escribió: un formulario que no cierra —M + F > identificados— no se escribe)
    if ((i - 1) % 10 < 3 && hoja.v[i][colD('RDV_UID')] && hoja.v[i][iSin] !== '' && esColorSistemaTest(hoja.bg[i][iSin])) {
      tocadas.push({ i: i, correcto: hoja.v[i][iSin] });
      hoja.v[i][iSin] = hoja.v[i][iIns];
    }
  }
  // Una que ya estaba así en el backup (la dejó el legado): no se toca.
  const legado = tocadas[5];
  backup.v[legado.i][iSin] = hoja.v[legado.i][iIns];
  const antes = JSON.stringify(foto(hoja));
  const l = E.ejecutar('listarMalEscritas');
  ok(!l.error && JSON.stringify(foto(hoja)) === antes, 'listar: en seco, no toca nada' + (l.error ? ' — ' + l.error.message : ''));
  const enReal = l.resultado['RVD JM-CM - ES'];
  ok(enReal.lista.length === 5 && enReal.estabanAntes === 1, '5 mal escritas, 1 ya estaba en el backup (' +
     enReal.lista.length + ' / ' + enReal.estabanAntes + ')');
  E.ctx.vaciarReal_test_ = function () { return E.ctx.vaciarMalEscritas('RVD JM-CM - ES'); };
  const v = E.ejecutar('vaciarReal_test_');
  ok(!v.error && v.resultado.vaciadas === 5, 'vaciar: ' + (v.resultado ? v.resultado.vaciadas : v.error.message));
  ok(tocadas.slice(0, 5).every(function (t) { return hoja.v[t.i][iSin] === '' && hoja.bg[t.i][iSin] === null; }),
     'quedaron vacías y sin color');
  ok(hoja.v[legado.i][iSin] === hoja.v[legado.i][iIns], 'la del legado sigue como estaba');
  E.ejecutar('upsertDestino');
  ok(tocadas.slice(0, 5).every(function (t) { return hoja.v[t.i][iSin] === t.correcto; }),
     'la corrida siguiente las completa con el valor correcto');
}

/**
 * El PASO B (02/10): el sistema escribe Inscriptos (un 0 es vacío), los canales, el desagregado (sólo si
 * Inscriptos está vacío o es el de B), Asistentes de RDV CONJUNTO (con el desempate por barrio o comuna
 * cuando la figura tiene 2+ filas ese día) y STATUS → Realizada; todo sólo en celda vacía y en #CFE2F3.
 * Después, el repintado del azul viejo.
 */
function escenarioPasoB() {
  console.log('\n[12] PASO B: Inscriptos, canales, Asistentes, desagregado condicionado, STATUS, color nuevo');
  const E = crearEntorno();
  const m = montar(E, 300, true);
  const hoja = m.ssD.hojas['RVD JM-CM - ES'], conj = m.ssD.hojas['RDV CONJUNTO'];
  const C = function (n) { return colD(n); };
  const filaB = m.ssI.hojas['B'].v;
  const insB = function (i) { return filaB[i][2]; };          // la fila i del destino es la fila i de B
  // a) las filas 281+ sin Inscriptos (como la copia desde la 800); b) una con 0
  for (let i = 281; i <= 300; i++) hoja.v[i][C('Inscriptos')] = '';
  hoja.v[13][C('Inscriptos')] = 0;
  // b2) 0 en el destino y 0 en B: nada que completar (antes: "incompleta" perpetua en el paso 16)
  hoja.v[14][C('Inscriptos')] = 0; filaB[14][2] = 0;
  // c) una del hueco con Inscriptos distinto del de B: el desagregado NO se escribe
  const iDist = 21;                                            // (21 - 1) % 10 = 0: hueco
  hoja.v[iDist][C('Inscriptos')] = insB(iDist) + 5;
  // d) canales vacíos
  [31, 32, 33].forEach(function (i) { hoja.v[i][C('Mail')] = ''; hoja.v[i][C('RRSS')] = ''; });
  // e) Asistentes vacíos (RDV CONJUNTO los tiene); la 44 además "en agenda" (44 % 10 = 4 → hoy Realizada)
  [41, 42, 43, 44].forEach(function (i) { hoja.v[i][C('Asistentes')] = ''; });
  hoja.v[44][C('STATUS REUNIÓN')] = 'en agenda';
  // f) 2+ filas con la misma figura y fecha: desempata el barrio (la 51) o la comuna (la 52)
  const dup = function (i, barrio) {
    const r = hoja.v[i].slice(); r[C('Barrio')] = barrio; r[C('Asistentes')] = '';
    TRAZA.forEach(function (t) { r[C(t)] = ''; });
    hoja.v.push(r); hoja.bg.push(r.map(function () { return '#ffffff'; }));
    return hoja.v.length;                                      // número de fila de la nueva
  };
  hoja.v[51][C('Asistentes')] = ''; hoja.v[52][C('Asistentes')] = '';
  const otro51 = hoja.v[51][C('Barrio')] === 'Palermo' ? 'Flores' : 'Palermo';
  const otro52 = hoja.v[52][C('Barrio')] === 'Palermo' ? 'Flores' : 'Palermo';
  const nueva51 = dup(51, otro51), nueva52 = dup(52, otro52);
  const comunaDe = function (b) { return BARRIOS.find(function (x) { return x[0] === b; })[1]; };
  conj.v[52][1] = 'C' + comunaDe(hoja.v[52][C('Barrio')]);   // RDV CONJUNTO trae la comuna, no el barrio
  // g) una con color viejo (para el repintado)
  hoja.bg[60][C('Mail')] = '#4F81BD';

  const antes = foto(hoja);
  const r = E.ejecutar('upsertDestino');
  ok(!r.error, 'termina sin error' + (r.error ? ': ' + r.error.message : ''));
  const a = auditar(antes, hoja);
  ok(a.pisadas === 0, 'ninguna celda con valor fue pisada (' + a.pisadas + ')');
  ok(a.manualesODerivadas === 0, 'Barrio y las derivadas: nada');
  ok(a.sinAzul === 0, 'todo lo escrito tiene el color del sistema');
  let nuevas = 0, viejas = 0;
  for (let i = 1; i < hoja.v.length; i++) for (let k = 0; k < HDR_DESTINO.length; k++) {
    if (antes.v[i] && antes.v[i][k] === '' && hoja.v[i][k] !== '') {
      if (String(hoja.bg[i][k]).toUpperCase() === '#CFE2F3') nuevas++; else viejas++;
    }
  }
  ok(nuevas > 0 && viejas === 0, 'lo nuevo, en #CFE2F3 (' + nuevas + ' celdas; en otro color: ' + viejas + ')');
  ok([281, 290, 300].every(function (i) { return hoja.v[i][C('Inscriptos')] === insB(i); }), 'a) Inscriptos completado desde B');
  ok(hoja.v[13][C('Inscriptos')] === insB(13), 'b) un 0 en Inscriptos cuenta como vacío: ' + hoja.v[13][C('Inscriptos')]);
  ok(hoja.v[14][C('Inscriptos')] === 0 && !esColorSistemaTest(hoja.bg[14][C('Inscriptos')]),
     'b2) 0 en el destino y 0 en B: no se escribe ni se pinta');
  ok(hoja.v[iDist][C('Inscriptos')] === insB(iDist) + 5 && hoja.v[iDist][C('Masculinos')] === '' &&
     hoja.v[iDist][C('Sin identificar')] === '', 'c) Inscriptos distinto de B: no se pisa y el desagregado NO se escribe');
  const filaHuecoOk = 1;                                       // (1 - 1) % 10 = 0: hueco, Inscriptos = B
  ok(hoja.v[filaHuecoOk][C('Masculinos')] !== '', 'c) con Inscriptos = B, el desagregado sí');
  ok([31, 32, 33].every(function (i) { return hoja.v[i][C('Mail')] !== '' && hoja.v[i][C('RRSS')] !== ''; }),
     'd) canales completados desde B (MAPEO_CANALES)');
  ok([41, 42, 43, 44].every(function (i) { return hoja.v[i][C('Asistentes')] === conj.v[i][5]; }),
     'e) Asistentes completados desde RDV CONJUNTO');
  ok(hoja.v[44][C('STATUS REUNIÓN')] === 'Realizada', 'e) "en agenda" con asistentes → Realizada');
  ok(hoja.v[51][C('Asistentes')] === conj.v[51][5] && hoja.v[nueva51 - 1][C('Asistentes')] === '',
     'f) 2+ filas: el barrio desempata (la original sí, la duplicada no)');
  ok(hoja.v[52][C('Asistentes')] === conj.v[52][5] && hoja.v[nueva52 - 1][C('Asistentes')] === '',
     'f) 2+ filas: la comuna ("C" + n) desempata');
  const log = r.logs.join('\n');
  ok(/desempatadas por barrio o comuna: 2/.test(log), 'f) el log cuenta las 2 desempatadas');
  ok(/por columna: .*Inscriptos \d+/.test(log), 'el log dice lo escrito por columna');
  const v = E.ejecutar('verificarEscritura').resultado;
  ok(v.problemas.length === 0, 'paso 16 sin problemas (' + v.problemas.join('; ') + ')');

  const seco = E.ctx.repintarAzulViejo(false);
  ok(seco.contadas === 1 && hoja.bg[60][C('Mail')] === '#4F81BD', 'paso 19 en seco: 1 celda en #4F81BD, no toca nada');
  const val60 = hoja.v[60][C('Mail')];
  E.ctx.repintar_test_ = function () { return E.ctx.repintarAzulViejo(true); };
  const rp = E.ejecutar('repintar_test_');
  ok(!rp.error && rp.resultado.repintadas === 1 && hoja.bg[60][C('Mail')] === '#CFE2F3' && hoja.v[60][C('Mail')] === val60,
     'paso 19: repinta a #CFE2F3 sin tocar el valor');
}

/**
 * El PASO 20 ("por qué está vacía"): antes del upsert, lo que el sistema escribiría sale como "DEBERÍA
 * ESTAR ESCRITA"; después, eso da 0 y lo que queda vacío tiene su causa (B trae 0, desagregado retenido,
 * RDV CONJUNTO no tiene la fila, STATUS no está en agenda...).
 */
function escenarioPorQueVacia() {
  console.log('\n[13] PASO 20: por qué está vacía');
  const E = crearEntorno();
  const m = montar(E, 120, true);
  const hoja = m.ssD.hojas['RVD JM-CM - ES'], filaB = m.ssI.hojas['B'].v;
  const C = colD;
  hoja.v[101][C('Mail')] = '';                                   // B la tiene → se escribiría
  hoja.v[102][C('Mail')] = ''; filaB[102][11] = '';               // B no la trae → b)
  hoja.v[103][C('Inscriptos')] = filaB[103][2] + 9;                // 103: (103-1)%10 = 2 → hueco → c)
  hoja.v[104][C('Asistentes')] = '';                               // RDV CONJUNTO la tiene → se escribiría
  hoja.v[105][C('Asistentes')] = ''; m.ssD.hojas['RDV CONJUNTO'].v[105][0] = 'Nadie Conocido';   // d)
  hoja.v[106][C('STATUS REUNIÓN')] = 'Suspendida';                                            // e)
  const antes = E.ctx.porQueVacia(100, 110);
  ok(antes.deberia > 0, 'antes del upsert: hay celdas que el sistema escribiría (' + antes.deberia + ')');
  E.ejecutar('upsertDestino');
  E.ctx.pq_ = function () { return E.ctx.porQueVacia(100, 110); };
  const r = E.ejecutar('pq_');
  const x = r.resultado;
  ok(!r.error && x.deberia === 0, 'después: DEBERÍA ESTAR ESCRITA = 0 (' + (x ? x.deberia : r.error.message) + ')');
  const tiene = function (re) { return Object.keys(x.causas).some(function (k) { return re.test(k); }); };
  ok(tiene(/^b\)/), 'b) B trae 0 o vacío');
  ok(tiene(/^c\)/), 'c) desagregado retenido');
  ok(tiene(/^d\) RDV CONJUNTO no tiene la fila/), 'd) RDV CONJUNTO no tiene la fila');
  ok(tiene(/^e\)/), 'e) STATUS no en agenda');
  ok(hoja.v[101][C('Mail')] !== '' && hoja.v[104][C('Asistentes')] !== '', 'y lo que debía, quedó escrito');
}

/**
 * "elegido" (regla 4): una elección válida (se escribe con "+elegido_por_persona"), una que choca con
 * el invariante (rechazada), un "ninguno" (sale de los reportes; vence si aparece un formulario nuevo), y
 * la solapa regenerada que conserva lo elegido. Sin elecciones, el upsert no cambia nada.
 */
function casosElegido(E, datos) {
  casosGemelos(E, datos);
  const D = E.Date, col = function (n) { return HDR_DESTINO.indexOf(n); };
  const fila = function (fig, d, m) {
    const r = HDR_DESTINO.map(function () { return ''; });
    r[col('Figura')] = fig; r[col('FECHA')] = new D(2026, m - 1, d, 12, 0, 0); r[col('HORA')] = '18:00';
    r[col('EVENTO')] = 'Encuentro con Vecinos'; r[col('STATUS REUNIÓN')] = 'Realizada'; r[col('Asistentes')] = 40;
    ['Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión'].forEach(function (c) { r[col(c)] = 5; });
    datos.dest.push(r);
  };
  const form = function (nombre, d, m, ins) {
    const uni = Math.round(ins * 0.8);
    datos.b.push([nombre, new D(2026, m - 1, d, 12, 0, 0), ins, uni, Math.round(uni * 0.45), Math.round(uni * 0.55),
                  10, 20, 20, 10, 5, 1, 1, 0, 1, 1, 1, 0, 0]);
  };
  // Dos filas con dos formularios empatados en todo: REVISAR por margen_chico.
  fila('Lía Ferrante', 20, 8);
  form('LÍA FERRANTE - Encuentro A - 20/8', 18, 8, 80);
  form('LÍA FERRANTE - Encuentro B - 20/8', 18, 8, 80);
  fila('Iván Robles', 22, 8);
  form('IVÁN ROBLES - Encuentro A - 22/8', 20, 8, 70);
  form('IVÁN ROBLES - Encuentro B - 22/8', 20, 8, 70);
}

function escenarioElegido() {
  console.log('\n[14] "elegido" (regla 4): válida, choque con el invariante, "ninguno", solapa regenerada');
  // REVISAR_MATCH en el formato de una línea por fila (las fichas tienen su escenario, [15] y [16]).
  const E = crearEntorno({ config: { REVISAR_COMO_FICHAS: 'false' } });
  const m = montar(E, 150, true, casosElegido);
  const hoja = m.ssD.hojas['RVD JM-CM - ES'];
  const filaDe = function (fig, d, mes) {
    return hoja.v.findIndex(function (r, i) {
      const f = r[colD('FECHA')];
      return i > 0 && r[colD('Figura')] === fig && f instanceof Date && f.getDate() === d && f.getMonth() + 1 === mes;
    }) + 1;
  };
  const nLia = filaDe('Lía Ferrante', 20, 8), nIvan = filaDe('Iván Robles', 22, 8), n309 = filaDe('Clara Mendieta', 5, 8);
  const r0 = E.ejecutar('upsertDestino');
  ok(!r0.error, 'primera corrida sin error' + (r0.error ? ': ' + r0.error.message : ''));
  const rev = function () { return m.ssI.hojas['REVISAR_MATCH']; };
  const lineaDe = function (fig, fecha) {
    const h = rev().v[0];
    const k = rev().v.findIndex(function (r, i) { return i > 0 && r[h.indexOf('figura')] === fig && String(r[h.indexOf('fecha')]) === fecha; });
    return { h: h, k: k, r: rev().v[k] };
  };
  const L1 = lineaDe('Lía Ferrante', '20/08/2026'), L2 = lineaDe('Iván Robles', '22/08/2026'), L3 = lineaDe('Clara Mendieta', '05/08/2026');
  ok(L1.k > 0 && L2.k > 0 && L3.k > 0, 'las tres filas están en REVISAR_MATCH (' + [L1.k, L2.k, L3.k].join(', ') + ')');
  // Sin elecciones, una segunda corrida no cambia nada.
  const f0 = JSON.stringify(foto(hoja));
  E.ejecutar('upsertDestino');
  ok(JSON.stringify(foto(hoja)) === f0, 'sin elecciones cargadas, el upsert no cambia nada');

  // Una persona elige: la opción 2 para Lía, "ninguno" para Iván, la 1 (tomada por la "315") para la "309".
  const opcion2 = L1.r[L1.h.indexOf('op2_formulario')];
  rev().v[L1.k][L1.h.indexOf('elegido')] = '2';
  rev().v[L2.k][L2.h.indexOf('elegido')] = 'ninguno';
  rev().v[L3.k][L3.h.indexOf('elegido')] = '1';

  // Corrida EN SECO: no escribe en el destino; la solapa regenerada conserva lo elegido.
  const fSeco = JSON.stringify(foto(hoja));
  const s = E.ejecutar('correrEnSeco');
  ok(!s.error && JSON.stringify(foto(hoja)) === fSeco, 'en seco: no escribe nada en el destino');
  const log = s.logs.join('\n');
  ok(/VÁLIDA: .*Lía Ferrante/.test(log) && /RECHAZADA: .*Clara Mendieta.*ya tiene otra fila/.test(log) &&
     /NINGUNO: .*Iván Robles/.test(log), 'el log lista la válida, la rechazada (invariante) y el "ninguno"');
  const L1b = lineaDe('Lía Ferrante', '20/08/2026');
  ok(L1b.k > 0 && L1b.r[L1b.h.indexOf('op1_formulario')] === opcion2 && /válida/.test(L1b.r[L1b.h.indexOf('resultado')]),
     'la solapa regenerada conserva lo elegido (su línea dice "válida") (' + (L1b.r ? L1b.r[L1b.h.indexOf('resultado')] : '-') + ')');
  const L2b = lineaDe('Iván Robles', '22/08/2026');
  ok(L2b.k > 0 && !L2b.r[L2b.h.indexOf('op2_formulario')] && /ninguno/.test(L2b.r[L2b.h.indexOf('resultado')]),
     '"ninguno": la fila ya no se propone (queda sólo la línea de la elección, sin opciones)');
  const el = m.ssI.hojas['ELECCIONES_MATCH'];
  ok(el && el.v.length === 4, 'ELECCIONES_MATCH guarda las 3 elecciones (' + (el ? el.v.length - 1 : 0) + ')');

  // Corrida REAL: se aplica la válida.
  const r = E.ejecutar('upsertDestino');
  ok(!r.error, 'corrida real sin error');
  ok(hoja.v[nLia - 1][colD('form_origen')] === opcion2 && /\+elegido_por_persona/.test(hoja.v[nLia - 1][colD('form_nivel')]),
     'la válida se escribió con el formulario elegido y la traza "+elegido_por_persona"');
  const L1c = lineaDe('Lía Ferrante', '20/08/2026');
  ok(L1c.k > 0 && /^aplicado /.test(L1c.r[L1c.h.indexOf('resultado')]),
     'en REVISAR_MATCH, al lado de lo elegido: "' + (L1c.r ? L1c.r[L1c.h.indexOf('resultado')] : '-') + '"');
  const L3c = lineaDe('Clara Mendieta', '05/08/2026');
  ok(L3c.k > 0 && /^rechazado: el formulario ya tiene otra fila/.test(L3c.r[L3c.h.indexOf('resultado')]),
     'y la rechazada: "' + (L3c.r ? L3c.r[L3c.h.indexOf('resultado')] : '-') + '"');
  ok(!hoja.v[n309 - 1][colD('RDV_UID')], 'la rechazada no escribió nada');
  ok(!hoja.v[nIvan - 1][colD('RDV_UID')], '"ninguno": no se escribe');
  const est = el.v.slice(1).map(function (x) { return x[el.v[0].indexOf('estado')] + ':' + x[el.v[0].indexOf('figura')]; });
  ok(est.indexOf('aplicado:Lía Ferrante') >= 0 && est.indexOf('rechazado:Clara Mendieta') >= 0 &&
     est.indexOf('ninguno:Iván Robles') >= 0, 'ELECCIONES_MATCH: ' + est.join(' | '));

  // Aparece un formulario nuevo de Iván a 3 días: el "ninguno" vence y la fila vuelve a proponerse.
  m.ssI.hojas['B'].v.push(['IVÁN ROBLES - Encuentro C - 24/8', new E.Date(2026, 7, 23, 12, 0, 0), 30, 24, 10, 14,
                           2, 6, 6, 4, 2, 1, 1, 0, 1, 1, 1, 0, 0]);
  const s2 = E.ejecutar('correrEnSeco');
  const L2c = lineaDe('Iván Robles', '22/08/2026');
  ok(/VENCIDO: .*Iván Robles/.test(s2.logs.join('\n')) && L2c.k > 0 && !!L2c.r[L2c.h.indexOf('op2_formulario')],
     '"ninguno" vence con un formulario nuevo a ±7 días, y la fila vuelve a REVISAR_MATCH');
}

function casosFichas(E, datos) {
  const D = E.Date, col = function (n) { return HDR_DESTINO.indexOf(n); };
  const fila = function (fig, d, m, barrio) {
    const r = HDR_DESTINO.map(function () { return ''; });
    r[col('Figura')] = fig; r[col('Barrio')] = barrio || ''; r[col('FECHA')] = new D(2026, m - 1, d, 12, 0, 0);
    r[col('HORA')] = '18:00'; r[col('EVENTO')] = 'Encuentro con Vecinos'; r[col('STATUS REUNIÓN')] = 'Realizada';
    r[col('Asistentes')] = 40;
    datos.dest.push(r);
  };
  const form = function (nombre, d, m, ins) {
    const uni = Math.round(ins * 0.8);
    datos.b.push([nombre, new D(2026, m - 1, d, 12, 0, 0), ins, uni, Math.round(uni * 0.45), Math.round(uni * 0.55),
                  10, 20, 20, 10, 5, 1, 1, 0, 1, 1, 1, 0, 0]);
  };
  // Activa, dos formularios empatados: margen_chico.
  fila('Lía Ferrante', 20, 9);
  form('LÍA FERRANTE - Encuentro A - 20/9', 18, 9, 80);
  form('LÍA FERRANTE - Encuentro B - 20/9', 18, 9, 80);
  // Cerrada (más de 30 días), el mismo caso: no aparece en las fichas, "cerrada sin resolver".
  fila('Iván Robles', 22, 8);
  form('IVÁN ROBLES - Encuentro A - 22/8', 20, 8, 70);
  form('IVÁN ROBLES - Encuentro B - 22/8', 20, 8, 70);
  // Activa, el formulario dice otra comuna: posible reubicación (Flores es la Comuna 7).
  fila('Rita Gómez', 25, 9, 'Flores');
  form('RITA GÓMEZ - Encuentro con vecinos - Comuna 6 - 25/9', 24, 9, 150);
}

function escenarioFichas() {
  console.log('\n[15] DIAS_ACTIVOS = 30 y REVISAR_MATCH como fichas (03/10)');
  const E = crearEntorno({ config: { DIAS_ACTIVOS: '30', REVISAR_COMO_FICHAS: 'true' } });
  const m = montar(E, 300, true, casosFichas);
  const hoja = m.ssD.hojas['RVD JM-CM - ES'];
  const ini = new E.Date(2026, 8, 2, 12, 0, 0);   // hoy (02/10) − 30
  const esCerrada = function (r) { const f = r[colD('FECHA')]; return !(f instanceof Date) || f < ini; };
  const antes = foto(hoja);
  const r = E.ejecutar('upsertDestino');
  ok(!r.error, 'el upsert termina sin error' + (r.error ? ': ' + r.error.stack : ''));
  const log = r.logs.join('\n');
  const mAct = /filas activas: (\d+) \(de 02\/09\/2026 a 02\/10\/2026, hoy − 30\) \| cerradas: (\d+) \(sin resolver, sin RDV_UID: (\d+)\) \| futuras: (\d+)/.exec(log);
  ok(!!mAct, 'el log dice filas activas, cerradas (sin resolver) y futuras: ' + (mAct ? mAct[0] : '(no está)'));
  ok(/tiempo de corrida: [\d.]+ s/.test(log), 'el log dice el tiempo de corrida');
  let cerradasTocadas = 0, activasEscritas = 0;
  for (let i = 1; i < hoja.v.length; i++) {
    if (esCerrada(antes.v[i])) { if (JSON.stringify(hoja.v[i]) !== JSON.stringify(antes.v[i])) cerradasTocadas++; }
    else if (hoja.v[i][colD('RDV_UID')] && !antes.v[i][colD('RDV_UID')]) activasEscritas++;
  }
  ok(cerradasTocadas === 0, 'ninguna fila cerrada (más de 30 días) se tocó (' + cerradasTocadas + ')');
  ok(activasEscritas > 0, 'las activas sí se escriben (' + activasEscritas + ')');
  // EMPAREJAR_MANUAL: los formularios de una reunión cerrada (Iván, 22/08) no son "sin candidato".
  const emp = m.ssI.hojas['EMPAREJAR_MANUAL'];
  const mCerr = /formularios de reuniones CERRADAS sin usar, descartados \(no proponen ni son huérfanos\):\s+\d+ \|\s+(\d+)/.exec(log);
  ok(emp && !emp.v.some(function (x) { return /IVÁN ROBLES/.test(String(x[0])); }) && mCerr && +mCerr[1] > 0,
     'EMPAREJAR: los formularios de reuniones cerradas se descartan y se cuentan aparte (' + (mCerr ? mCerr[0] : 'sin línea') + ')');

  const rev = m.ssD.hojas['REVISAR_MATCH'];
  ok(rev && rev.v[0][0] === 'ELEGIR' && rev.v[0].indexOf('ficha') === 3 && rev.v[0].indexOf('id_figura') >= 0, 'REVISAR_MATCH tiene el formato de fichas');
  const h = rev.v[0];
  const reunion = function (hj, fig) {
    return hj.v.findIndex(function (x) { return x[3] === 'REUNIÓN' && x[h.indexOf('figura')] === fig; });
  };
  const kLia = reunion(rev, 'Lía Ferrante'), kRita = reunion(rev, 'Rita Gómez'), kIvan = reunion(rev, 'Iván Robles');
  ok(kLia > 0 && kRita > 0, 'las fichas de Lía (margen chico) y Rita (otra comuna) están');
  ok(kIvan < 0, 'la de Iván (cerrada) no está');
  ok(kRita < kLia, 'de la más reciente a la más vieja (Rita 25/09 antes que Lía 20/09)');
  const dv = rev.dv && rev.dv[kLia] && rev.dv[kLia][h.indexOf('ELEGIR')];
  ok(dv && /^Opción 1|Opción 2|(Opción 3|)?Ninguno|No sé$/.test(dv.lista.join('|')), 'desplegable en "elegido": ' + (dv ? dv.lista.join(' / ') : '-'));
  ok(JSON.stringify(rev.ocultas) === JSON.stringify([15, 16, 17, 18, 19]), 'las 5 columnas ocultas (identidad y puntaje)');
  const porQueRita = rev.v[kRita + 1][4], coincideRita = rev.v[kRita + 3][4];
  console.log('       ¿por qué? (Rita): ' + porQueRita);
  console.log('       coincide (Rita):  ' + coincideRita);
  ok(/cambió de lugar/.test(porQueRita) && /dice C6/.test(porQueRita) && /Flores \(C7\)/.test(porQueRita),
     '¿por qué? de una posible reubicación');
  ok(/✅ figura/.test(coincideRita) && /✅ fecha/.test(coincideRita) && /❌ comuna \(C6, la reunión es Flores \(C7\)\)/.test(coincideRita),
     'coincide / no coincide de una posible reubicación');
  ok(rev.bg[kRita + 2][h.indexOf('ubicación')] === '#f4cccc' && rev.bg[kRita + 2][h.indexOf('figura')] === '#d9ead3',
     'colores por celda: ubicación en rojo, figura en verde');
  console.log('       ¿por qué? (Lía):  ' + rev.v[kLia + 1][4]);
  ok(/coinciden casi igual \(confianza alta y alta\)/.test(rev.v[kLia + 1][4]), '¿por qué? de un margen chico');

  // Una persona elige: la opción 2 para Lía; "No sé" con un comentario para Rita.
  const opcion2 = rev.v.find(function (x, i) { return i > kLia && x[3] === 'Opción 2'; })[h.indexOf('evento / formulario')];
  rev.v[kLia][h.indexOf('ELEGIR')] = 'Opción 2';
  rev.v[kRita][h.indexOf('ELEGIR')] = 'No sé';
  rev.v[kRita][h.indexOf('COMENTARIO')] = 'preguntar al equipo';
  const fSeco = JSON.stringify(foto(hoja));
  const s = E.ejecutar('correrEnSeco');
  ok(!s.error && JSON.stringify(foto(hoja)) === fSeco, 'en seco: no escribe el destino' + (s.error ? ': ' + s.error.stack : ''));
  ok(/VÁLIDA: .*Lía Ferrante/.test(s.logs.join('\n')), 'la elección de Lía es válida');
  const rev2 = m.ssD.hojas['REVISAR_MATCH'];
  const kRita2 = reunion(rev2, 'Rita Gómez');
  ok(kRita2 > 0 && rev2.v[kRita2][h.indexOf('ELEGIR')] === 'No sé' && rev2.v[kRita2][h.indexOf('COMENTARIO')] === 'preguntar al equipo',
     '"No sé" queda pendiente, con su comentario');
  const kRes = rev2.v.findIndex(function (x) { return /^RESUELTAS/.test(x[3]); });
  const liaRes = rev2.v.findIndex(function (x, i) { return i > kRes && x[3] === 'resuelta' && x[5] === 'Lía Ferrante'; });
  ok(kRes > 0 && liaRes > kRes && /válida/.test(rev2.v[liaRes][h.indexOf('resultado')]),
     'Lía pasa a RESUELTAS: ' + (liaRes > 0 ? rev2.v[liaRes][h.indexOf('resultado')] : '-'));
  const el = m.ssI.hojas['ELECCIONES_MATCH'];
  const iE = function (n) { return el.v[0].indexOf(n); };
  ok(el.v.some(function (x) { return x[iE('figura')] === 'Rita Gómez' && x[iE('estado')] === 'no_se' && x[iE('comentario')] === 'preguntar al equipo'; }),
     'ELECCIONES_MATCH guarda la nota ("no sé" + comentario)');

  const r2 = E.ejecutar('upsertDestino');
  ok(!r2.error, 'corrida real sin error');
  const nLia = hoja.v.findIndex(function (x, i) { return i > 0 && x[colD('Figura')] === 'Lía Ferrante'; });
  ok(hoja.v[nLia][colD('form_origen')] === opcion2 && /\+elegido_por_persona/.test(hoja.v[nLia][colD('form_nivel')]),
     'Lía se escribe con la opción 2 (+elegido_por_persona)');
  const rev3 = m.ssD.hojas['REVISAR_MATCH'];
  const liaRes3 = rev3.v.findIndex(function (x) { return x[3] === 'resuelta' && x[5] === 'Lía Ferrante'; });
  ok(liaRes3 > 0 && /^aplicado /.test(rev3.v[liaRes3][h.indexOf('resultado')]), 'RESUELTAS: "aplicado <fecha>"');

  // Rita: de "No sé" a "Ninguno" → la nota queda reemplazada y la ficha pasa a RESUELTAS.
  rev3.v[reunion(rev3, 'Rita Gómez')][h.indexOf('ELEGIR')] = 'Ninguno';
  const s4 = E.ejecutar('correrEnSeco');
  if (process.env.DEBUG_FICHAS) console.log(s4.logs.filter(function (l) { return /Rita|ELEGIDO|leídas/.test(l); }).join('\n'));
  const rev4 = m.ssD.hojas['REVISAR_MATCH'];
  if (process.env.DEBUG_FICHAS) rev4.v.filter(function (x) { return /Rita/.test(x.join('|')); }).forEach(function (x) { console.log(x.join(' | ')); });
  ok(reunion(rev4, 'Rita Gómez') < 0 &&
     rev4.v.some(function (x) { return x[3] === 'resuelta' && x[5] === 'Rita Gómez' && x[h.indexOf('ELEGIR')] === 'Ninguno'; }),
     '"Ninguno": la ficha sale de las pendientes y queda en RESUELTAS');
  const el2 = m.ssI.hojas['ELECCIONES_MATCH'];
  ok(el2.v.some(function (x) { return x[iE('figura')] === 'Rita Gómez' && x[iE('estado')] === 'reemplazada'; }),
     'la nota "no sé" de Rita queda "reemplazada"');

  // Paso 21: fichas de prueba (Iván, cerrada, sale igual en el log), sin tocar el destino.
  const f21 = JSON.stringify(foto(hoja));
  const nIvan = hoja.v.findIndex(function (x, i) { return i > 0 && x[colD('Figura')] === 'Iván Robles'; }) + 1;
  vm.runInContext('function __paso21() { return fichasDePrueba([' + nIvan + ', ' + (nLia + 1) + ']); }', E.ctx);
  const p = E.ejecutar('__paso21');
  const logs21 = p.logs.join('\n');
  ok(!p.error, 'paso 21 sin error' + (p.error ? ': ' + p.error.stack : ''));
  ok(p.resultado && p.resultado.pedidas === 2 && /FICHA fila \d+ — REVISAR_MATCH \(margen_chico\) \| CERRADA/.test(logs21),
     'paso 21: la ficha de una fila cerrada sale en el log, marcada CERRADA');
  ok(/\[v\] Iván Robles/.test(logs21), 'paso 21: las marcas de color en el texto');
  ok(m.ssI.hojas['REVISAR_FICHAS_PRUEBA'] && m.ssI.hojas['REVISAR_FICHAS_PRUEBA'].v[0][0] === 'ELEGIR' &&
     JSON.stringify(foto(hoja)) === f21, 'paso 21: escribe la solapa de prueba y no toca el destino');

  // Paso 16 y paso 20, con DIAS_ACTIVOS.
  const v = E.ejecutar('verificarEscritura').resultado;
  ok(v && v.incompletas === 0 && v.choques === 0, 'paso 16: invariante 0, 0 incompletas (sólo activas)');
  const q = E.ejecutar('porQueVacia');
  ok(!q.error && /filas: las activas/.test(q.logs.join('\n')), 'paso 20: por defecto, las filas activas');
  console.log('       --- texto del paso 21 (fila cerrada) ---');
  p.logs.filter(function (l) { return /^ {2}/.test(l); }).slice(0, 14).forEach(function (l) { console.log('     ' + l); });
}

function casosOrdenFichas(E, datos) {
  casosGemelos(E, datos);
  const D = E.Date, col = function (n) { return HDR_DESTINO.indexOf(n); };
  // La "309": además de su gemelo (que tiene la "315") y el gemelo con 0 inscriptos (regla 3), un formulario
  // de otra reunión de la figura, más flojo. Sin el gemelo, la re-evaluación cae en éste (0,63).
  datos.b.push(['VÍNCULO CIUDADANO - Encuentro con vecinos - Clara Mendieta 12/08 Constitución',
                new D(2026, 7, 11, 12, 0, 0), 30, 24, 10, 14, 2, 6, 6, 4, 2]);
  // El eje, sólo para la persona: Flores es del Eje Oeste (Comunas, columna I); el formulario dice Eje Sur.
  datos.comunas.forEach(function (r) { if (r[0] === 'Flores') r[8] = 'Oeste'; });
  const r = HDR_DESTINO.map(function () { return ''; });
  r[col('Figura')] = 'Sofía Ibarra'; r[col('Barrio')] = 'Flores'; r[col('FECHA')] = new D(2026, 8, 26, 12, 0, 0);
  r[col('HORA')] = '18:00'; r[col('EVENTO')] = 'Encuentro con Vecinos'; r[col('STATUS REUNIÓN')] = 'Realizada';
  r[col('Asistentes')] = 40;
  datos.dest.push(r);
  datos.b.push(['SOFÍA IBARRA - Encuentro Temático Salud - Eje Sur - 26/9', new D(2026, 8, 24, 12, 0, 0), 90, 72, 30, 42,
                7, 20, 20, 15, 10]);
}

function escenarioOrdenFichas() {
  console.log('\n[16] fichas: opciones por puntaje y "¿por qué?" sobre la opción 1 (la 309); gemelo descartado; eje');
  const E = crearEntorno({ config: { REVISAR_COMO_FICHAS: 'true' } });   // DIAS_ACTIVOS = null: fechas de agosto
  const m = montar(E, 150, true, casosOrdenFichas);
  const s = E.ejecutar('correrEnSeco');
  ok(!s.error, 'en seco sin error' + (s.error ? ': ' + s.error.stack : ''));
  const rev = m.ssD.hojas['REVISAR_MATCH'], h = rev.v[0];
  const k = rev.v.findIndex(function (x) {
    return x[3] === 'REUNIÓN' && x[h.indexOf('figura')] === 'Clara Mendieta' && /05\/08\/2026/.test(x[h.indexOf('fecha')]);
  });
  ok(k > 0, 'la ficha de la "309" (Clara Mendieta 05/08, sin barrio) está');
  const ops = [];
  for (let i = k + 1; i < rev.v.length && rev.v[i][3] !== 'REUNIÓN' && !/^RESUELTAS/.test(rev.v[i][3]); i++) {
    if (/^Opción \d$/.test(rev.v[i][3])) ops.push(rev.v[i]);
  }
  const puntajes = ops.map(function (x) { return x[h.indexOf('puntaje')]; });
  ok(ops.length >= 2 && puntajes.every(function (p, i) { return i === 0 || puntajes[i - 1] >= p; }),
     'opciones por puntaje, de mayor a menor: ' + puntajes.join(' ≥ '));
  ok(ops[0] && /07\/08 Recoleta/.test(ops[0][h.indexOf('evento / formulario')]) && ops[0][h.indexOf('confianza')] === 'alta',
     'la opción 1 es el gemelo 07/08 Recoleta, confianza alta (' + (ops[0] ? ops[0][h.indexOf('evento / formulario')] : '-') + ')');
  ok(ops.some(function (x) { return /12\/08 Constitución/.test(x[h.indexOf('evento / formulario')]) && x[h.indexOf('confianza')] === 'media'; }),
     'el 12/08 Constitución va después, confianza media');
  const porQue = rev.v[k + 1][4];
  console.log('       ¿por qué? (309): ' + porQue);
  ok(/^La opción 1, «[^»]*07\/08 Recoleta»/.test(porQue) && /ya tiene|ya la tiene/.test(porQue) && !/Constitución/.test(porQue),
     '"¿por qué?" habla de la opción 1 (el 07/08 Recoleta, que tiene otra fila), no del 12/08');
  const desc = rev.v.slice(k).find(function (x) { return x[3] === 'formulario descartado'; });
  console.log('       contexto: ' + (desc ? desc[h.indexOf('ocupado por')] : '(no está)'));
  ok(desc && /descartado: 0 inscriptos, cierra 04\/08; su gemelo tiene 49/.test(desc[h.indexOf('ocupado por')]),
     'el contexto muestra el gemelo descartado por la regla 3');
  ok(rev.v.every(function (x) { return x[h.indexOf('confianza')] === '' || ['alta', 'media', 'baja', 'confianza'].indexOf(x[h.indexOf('confianza')]) >= 0; }),
     'la confianza, en palabras');

  // El eje (paso 21 sobre una fila que se escribe): amarillo y "⚠️", sin cambiar el puntaje ni la decisión.
  const hoja = m.ssD.hojas['RVD JM-CM - ES'];
  const nS = hoja.v.findIndex(function (x, i) { return i > 0 && x[colD('Figura')] === 'Sofía Ibarra'; }) + 1;
  vm.runInContext('function __paso21b() { return fichasDePrueba([' + nS + ']); }', E.ctx);
  const p = E.ejecutar('__paso21b');
  const t = p.logs.join('\n');
  ok(!p.error && /FICHA fila \d+ — escribiria/.test(t), 'la fila del eje se escribe igual (EJE_COMO_UBICACION apagado)');
  ok(/\[!\] Eje Sur/.test(t) && /⚠️ Eje Sur, la reunión está en el Eje Oeste/.test(t), 'eje distinto: amarillo y "⚠️ Eje Sur, la reunión está en el Eje Oeste"');
  ok(/\(puntaje 1, oculto\)/.test(t), 'el puntaje no cambia por el eje (1)');
  ok(!/⚪ ubicación \(el formulario dice Eje/.test(t), 'con el eje a la vista, no se repite "⚪ ubicación (el formulario dice Eje …)"');
}

/** La hoja sin los RDV_UID (son uuids al azar): sólo si hay o no. Para comparar dos corridas. */
function sinUuids(h) {
  return JSON.stringify({ v: h.v.map(function (r, i) {
    return r.map(function (x, k) { return i > 0 && k === colD('RDV_UID') ? !!x : (x instanceof Date ? x.getTime() : x); });
  }), bg: h.bg });
}

function escenarioCompletarHistorial() {
  console.log('\n[17] paso 22: completar el historial una vez (sin DIAS_ACTIVOS), después el modo normal');
  // A: lo que escribe hoy el upsert sin límite (DIAS_ACTIVOS = null), como en la copia.
  const EA = crearEntorno();
  const mA = montar(EA, 300, true, casosFichas);
  const rA = EA.ejecutar('upsertDestino');
  ok(!rA.error, 'referencia (DIAS_ACTIVOS = null) sin error');
  // B: DIAS_ACTIVOS = 30 y el paso 22.
  const EB = crearEntorno({ config: { DIAS_ACTIVOS: '30' } });
  const mB = montar(EB, 300, true, casosFichas);
  const hB = mB.ssD.hojas['RVD JM-CM - ES'];
  const ini = new EB.Date(2026, 8, 2, 12, 0, 0);
  const antes = foto(hB);
  const rB = EB.ejecutar('completarHistorial');
  ok(!rB.error, 'paso 22 sin error' + (rB.error ? ': ' + rB.error.stack : ''));
  const logB = rB.logs.join('\n');
  ok(/TODO EL HISTORIAL/.test(logB) && /filas activas: \d+ \(todo el historial\)/.test(logB), 'el log dice que es sobre todo el historial');
  ok(sinUuids(hB) === sinUuids(mA.ssD.hojas['RVD JM-CM - ES']), 'escribe lo mismo que el upsert sin límite (salvo los uuids)');
  let viejasEscritas = 0, viejasRealizadas = 0;
  for (let i = 1; i < hB.v.length; i++) {
    const f = antes.v[i][colD('FECHA')];
    if (!(f instanceof Date) || f >= ini) continue;
    if (hB.v[i][colD('RDV_UID')] && !antes.v[i][colD('RDV_UID')]) viejasEscritas++;
    if (antes.v[i][colD('STATUS REUNIÓN')] === 'en agenda' && hB.v[i][colD('STATUS REUNIÓN')] === 'Realizada') viejasRealizadas++;
  }
  ok(viejasEscritas > 200 && viejasRealizadas > 0, 'completa las filas viejas: ' + viejasEscritas + ' con RDV_UID, ' +
     viejasRealizadas + ' en agenda → Realizada');
  const a = auditar(antes, hB);
  ok(a.pisadas === 0 && a.sinAzul === 0 && a.manualesODerivadas === 0, '0 pisadas, todo en el color del sistema, nada en Barrio ni derivadas');
  const reg = mB.ssI.hojas['REGISTRO_UPSERT'];
  ok(reg && reg.v[reg.v.length - 1][reg.v[0].indexOf('alcance')] === 'historial (paso 22)', 'REGISTRO_UPSERT: alcance "historial (paso 22)"');
  // Lo viejo sin resolver: a HISTORICO_SIN_RESOLVER, no a las fichas.
  const his = mB.ssI.hojas['HISTORICO_SIN_RESOLVER'], rev = mB.ssD.hojas['REVISAR_MATCH'];
  ok(his && his.v.some(function (x) { return x[1] === 'Iván Robles' && x[5] === 'margen_chico' && /IVÁN ROBLES/.test(x[6]); }),
     'HISTORICO_SIN_RESOLVER: la fila vieja en revisión (Iván, margen chico, con su mejor opción)');
  const hr = rev.v[0];
  ok(rev.v.some(function (x) { return x[3] === 'REUNIÓN' && x[hr.indexOf('figura')] === 'Lía Ferrante'; }) &&
     !rev.v.some(function (x) { return x[3] === 'REUNIÓN' && x[hr.indexOf('figura')] === 'Iván Robles'; }),
     'las fichas siguen con los últimos 30 días (Lía sí, Iván no)');
  // Paso 16 y paso 20 sobre todo el destino.
  const v = EB.ejecutar('verificarEscritura').resultado;
  ok(v.incompletas === 0 && v.incompletasCerradas === 0 && v.choques === 0, 'paso 16: 0 incompletas en TODO el destino, invariante 0');
  vm.runInContext('function __paso20todo() { return porQueVacia(2); }', EB.ctx);
  const q = EB.ejecutar('__paso20todo').resultado;
  ok(q && q.deberia === 0, 'paso 20 sobre todo el destino: "DEBERÍA ESTAR ESCRITA" = ' + (q ? q.deberia : '?'));
  // Después, el modo normal: no escribe nada.
  const f0 = JSON.stringify(foto(hB));
  const rN = EB.ejecutar('upsertDestino');
  ok(!rN.error && rN.resultado.escritura.filasPendientes === 0 && JSON.stringify(foto(hB)) === f0,
     'después, un upsert normal no escribe nada (' + (rN.resultado ? rN.resultado.escritura.filasPendientes : '?') + ' filas)');

  // Reanudable: con el servicio 50 veces más lento se corta sola, y el paso 22 otra vez sigue.
  const EC = crearEntorno({ config: { DIAS_ACTIVOS: '30' }, costo: { op: 2000, lectura: 3000 } });
  const mC = montar(EC, 300, true, casosFichas);
  let corridas = 0, completa = false, falta = false;
  while (!completa && corridas < 8) {
    const r = EC.ejecutar('completarHistorial');
    corridas++;
    if (r.error) { ok(false, 'corrida ' + corridas + ': ' + r.error.message); break; }
    completa = r.resultado.escritura.completa;
    if (!completa && /FALTAN \d+ filas del historial: volver a correr paso22_completarHistorial/.test(r.logs.join('\n'))) falta = true;
  }
  ok(completa && corridas > 1 && falta, 'reanudable: ' + corridas + ' corridas, el log dice cuántas filas faltan');
  ok(sinUuids(mC.ssD.hojas['RVD JM-CM - ES']) === sinUuids(mA.ssD.hojas['RVD JM-CM - ES']), 'y termina igual que de una sola vez');
}

function escenarioActivadores() {
  console.log('\n[18] paso 23 (listar activadores) y la guarda del paso 24 (instalar cada hora)');
  const E = crearEntorno({ config: { RDV_HOJA_DESTINO: "'RVD JM-CM - ES'" } });
  montar(E, 50, false);
  E.activadores = ['runFullPipelineWithDelays', 'syncAgendaSheetInBaseFromAgenda_2', 'funcionQueYaNoExiste'];
  const r = E.ejecutar('listarActivadores');
  ok(!r.error, 'paso 23 sin error' + (r.error ? ': ' + r.error.stack : ''));
  const x = r.resultado;
  ok(x.borrar.join('|') === 'runFullPipelineWithDelays|funcionQueYaNoExiste' && !x.nuevoInstalado,
     'marca a BORRAR el legado y la función que no existe; Agenda se mantiene: ' + x.borrar.join(', '));
  ok(/\[MANTENER\] syncAgendaSheetInBaseFromAgenda_2/.test(r.logs.join('\n')), 'el espejo de Agenda: MANTENER');
  const i1 = E.ejecutar('instalarActivadorDiario_');
  ok(i1.error && /activadores del legado/.test(i1.error.message) && E.activadores.indexOf('upsertDiario') < 0,
     'paso 24 se niega con activadores del legado vivos');
  E.activadores = ['syncAgendaSheetInBaseFromAgenda_2'];
  const i2 = E.ejecutar('instalarActivadorDiario_');
  ok(!i2.error && E.activadores.filter(function (f) { return f === 'upsertDiario'; }).length === 1, 'sin legado: instala UNO');
  E.ejecutar('instalarActivadorDiario_');
  ok(E.activadores.filter(function (f) { return f === 'upsertDiario'; }).length === 1, 'otra vez: no crea un segundo');
  ok(E.ejecutar('listarActivadores').resultado.nuevoInstalado, 'paso 23: el del pipeline, INSTALADO');
  E.ejecutar('borrarActivadorDiario_');
  ok(E.activadores.join('|') === 'syncAgendaSheetInBaseFromAgenda_2', 'borrarlo no toca los demás');
  const E2 = crearEntorno({ config: { RDV_HOJA_DESTINO: "'Otra solapa'" } });   // el destino apunta a otra solapa
  montar(E2, 50, true);
  const i3 = E2.ejecutar('instalarActivadorDiario_');
  ok(i3.error && /no al destino real/.test(i3.error.message), 'con el destino en otra solapa, no se instala');
}

/**
 * Lo que mostrarían las once fórmulas, calculado aparte (otra implementación, la de la planilla): para poner
 * en el mock los valores "de la fórmula" y comparar contra el script.
 */
function ponerFormulasDerivadas(h, comunas) {
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const tabla = {};
  comunas.slice(1).forEach(function (r) { if (!tabla[String(r[0]).toLowerCase()]) tabla[String(r[0]).toLowerCase()] = r; });
  const c = function (n) { return colD(n); };
  h.f = h.f || {};
  DERIVADAS.forEach(function (n) { h.f['1,' + (c(n) + 1)] = '={"' + n + '"; ARRAYFORMULA(…)}'; });
  for (let i = 1; i < h.v.length; i++) {
    const r = h.v[i];
    const fecha = r[c('FECHA')], ins = r[c('Inscriptos')], asis = r[c('Asistentes')], dir = r[c('Dirección')];
    r[c('Día de la semana')] = fecha instanceof Date ? DIAS[fecha.getDay()] : '';
    r[c('% de Asistencia')] = ins === '' ? '' : (typeof ins === 'number' && ins !== 0 && (asis === '' || typeof asis === 'number') ? (asis === '' ? 0 : asis) / ins : '');
    r[c('Direccion2')] = dir === '' ? '' : dir + ', Buenos Aires, Argentina';
    r[c('Falta Informacion')] = ins === '' ? '' : 'No';
    const t = r[c('Barrio')] === '' ? null : tabla[String(r[c('Barrio')]).toLowerCase()];
    ['Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona'].forEach(function (n, k) {
      r[c(n)] = t ? t[k + 1] : '';
    });
  }
}

function escenarioDerivadas() {
  console.log('\n[19] derivadas por script: comparar, el upsert con fórmulas, quitarlas, recalcular, restaurar, paso 16');
  // 06/10: la copia de prueba ya no existe; todo sobre la solapa del destino (simulada).
  const E = crearEntorno({ config: { DERIVADAS_POR_SCRIPT: 'true' } });
  let comunasDatos = null;
  const m = montar(E, 120, true, function (E2, datos) {
    const c = function (n) { return colD(n); };
    datos.dest.forEach(function (r, i) {
      if (i === 0) return;
      if (i % 3 === 0) r[c('Dirección')] = 'Av. Siempre Viva ' + (100 + i);
      if (i === 7) r[c('Barrio')] = 'Barrio Que No Está';
      if (i === 8) r[c('Inscriptos')] = 0;                       // división por cero: vacío
      if (i === 9) r[c('Asistentes')] = '';                      // asistentes vacío: 0
      if (i === 10) r[c('Barrio')] = 'PALERMO';                  // VLOOKUP no distingue mayúsculas
    });
    comunasDatos = datos.comunas;
  });
  vm.runInContext('diagFormulasDestino = __diagFormulasReal;', E.ctx);   // el paso 14 de verdad
  const real = m.ssD.hojas['RVD JM-CM - ES'];
  ponerFormulasDerivadas(real, comunasDatos);
  const corre = function (expr) {
    vm.runInContext('function __der() { return ' + expr + '; }', E.ctx);
    return E.ejecutar('__der');
  };

  const c0 = corre("compararDerivadas('RVD JM-CM - ES')");
  ok(!c0.error && c0.resultado.distintas === 0 && c0.resultado.filas === 120, 'paso 25: 0 distintas en las 120 filas' +
     (c0.error ? ': ' + c0.error.stack : ' (' + c0.resultado.distintas + ')'));
  ok(/Día de la semana \| columna D \| array/.test(c0.logs.join('\n')), 'paso 25: loguea el texto de cada fórmula, con su columna');
  const k = colD('% de Asistencia'), guardado = real.v[5][k];
  real.v[5][k] = 0.123456;
  const c1 = corre("compararDerivadas('RVD JM-CM - ES')");
  ok(c1.resultado.distintas === 1 && c1.resultado.porCol['% de Asistencia'].ejemplos[0].fila === 6, 'una distinta: la cuenta y la muestra (fila 6)');
  const q0 = corre("quitarFormulasDerivadas('RVD JM-CM - ES', true)");
  ok(q0.resultado.quitadas === 0 && q0.resultado.distintas === 1, 'con una distinta, el paso 26 no quita nada');
  real.v[5][k] = guardado;

  // El upsert con las fórmulas todavía puestas: no las toca.
  const fr = JSON.stringify(DERIVADAS.map(function (n) { return real.v.map(function (r) { return r[colD(n)]; }); }));
  const u = E.ejecutar('upsertDestino');
  ok(!u.error && /la columna Día de la semana todavía tiene fórmula: no se escribe\. Correr paso26_quitarFormulasDerivadas/.test(u.logs.join('\n')) &&
     JSON.stringify(DERIVADAS.map(function (n) { return real.v.map(function (r) { return r[colD(n)]; }); })) === fr,
     'el upsert no escribe las derivadas de una solapa que todavía tiene fórmulas');
  // (El upsert completó datos; en Sheets las fórmulas se recalculan solas, en el mock no: se vuelven a poner.)
  ponerFormulasDerivadas(real, comunasDatos);

  const f0 = JSON.stringify(foto(real));
  const s0 = corre("quitarFormulasDerivadas('RVD JM-CM - ES', false)");
  ok(!s0.error && s0.resultado.enSeco && JSON.stringify(foto(real)) === f0, 'paso 26 en seco: no cambia nada');
  const antes = foto(real);
  const q = corre("quitarFormulasDerivadas('RVD JM-CM - ES', true)");
  ok(!q.error && q.resultado.quitadas === 11 && q.resultado.distintas === 0, 'paso 26: quita las 11 y vuelve a dar 0 distintas' +
     (q.error ? ': ' + q.error.stack : ''));
  ok(!Object.keys(real.f).some(function (key) { return /^1,/.test(key); }), 'no queda ninguna fórmula en el encabezado');
  ok(DERIVADAS.every(function (n) { return real.v[0][colD(n)] === n; }), 'el encabezado queda como texto');
  // (el mock agrega filas vacías al vaciar hasta el final de la hoja: se comparan las filas que había)
  const n0 = antes.v.length;
  ok(JSON.stringify(foto(real).v.slice(0, n0)) === JSON.stringify(antes.v) && JSON.stringify(real.bg.slice(0, n0)) === JSON.stringify(antes.bg),
     'los valores son los mismos que mostraban las fórmulas, y el color no cambió');
  ok((real.protecciones || []).length === 11 && real.protecciones.every(function (x) { return x.warning; }),
     'las 11 columnas protegidas con advertencia');
  const resp = m.ssI.hojas['DERIVADAS_RESPALDO'];
  ok(resp && resp.v.filter(function (r) { return r[0] === 'RVD JM-CM - ES' && r[3] === 'array'; }).length === 11, 'respaldo: las 11 fórmulas');

  // Cambia lo que las origina: se recalculan sólo esas celdas.
  real.v[3][colD('Inscriptos')] = 999;
  real.v[4][colD('Barrio')] = 'Recoleta';
  const r1 = corre("recalcularDerivadas('RVD JM-CM - ES', true)");
  ok(!r1.error && r1.resultado.total === 2 && r1.resultado.porCol['% de Asistencia'] === 1 && r1.resultado.porCol['Comuna'] === 1,
     'recalcular: sólo las celdas que cambiaron (el %, y la Comuna: en los datos sintéticos el resto de Comunas es igual) → ' + (r1.resultado ? r1.resultado.total : r1.error));
  ok(real.v[3][k] === real.v[3][colD('Asistentes')] / 999 && real.v[4][colD('Comuna')] === 2, 'con los valores nuevos');
  ok(JSON.stringify(real.bg.slice(0, n0)) === JSON.stringify(antes.bg), 'sin color');
  const d14 = corre("diagFormulasDestino('RVD JM-CM - ES')");
  ok(!d14.error && d14.resultado.porScript === 11 && d14.resultado.sinFormula === 0 && d14.resultado.difFila === 0 &&
     /CONFIRMADO: valores = Comunas/.test(d14.logs.join('\n')), 'paso 14 sin fórmulas: "valores = Comunas" (11 por script)' +
     (d14.error ? ': ' + d14.error.stack : ''));

  // Volver atrás.
  const t0 = corre("restaurarFormulasDerivadas('RVD JM-CM - ES', false)");
  ok(!t0.error && t0.resultado.enSeco && !Object.keys(real.f).some(function (key) { return /^1,/.test(key); }), 'paso 27 en seco: nada cambia');
  const t1 = corre("restaurarFormulasDerivadas('RVD JM-CM - ES', true)");
  ok(!t1.error && t1.resultado.restauradas === 11 && DERIVADAS.every(function (n) { return /^=\{/.test(real.f['1,' + (colD(n) + 1)] || ''); }) &&
     DERIVADAS.every(function (n) { return real.v.slice(1).every(function (r) { return r[colD(n)] === '' || r[colD(n)] === undefined; }); }) &&
     !(real.protecciones || []).length, 'paso 27: las 11 fórmulas de vuelta, columnas vacías para el array, sin protección');
  // Paso 16 con DERIVADAS_POR_SCRIPT: "valores = cálculo" (0 distintas), con las fórmulas puestas.
  ponerFormulasDerivadas(real, comunasDatos);
  const v16 = E.ejecutar('verificarEscritura');
  ok(!v16.error && /distintas en las once: 0/.test(v16.logs.join('\n')) &&
     !v16.resultado.problemas.some(function (x) { return /derivadas|fórmulas/.test(x); }),
     'paso 16: el control de las derivadas es "valores = cálculo" (0 distintas)' + (v16.error ? ': ' + v16.error.stack : ''));
  real.v[3][colD('Falta Informacion')] = 'Sí';                 // alguien tipea en una derivada
  const v16b = E.ejecutar('verificarEscritura');
  ok(v16b.resultado.problemas.some(function (x) { return /derivadas: 1 celdas distintas/.test(x); }),
     'paso 16: una celda que no es la del cálculo es un problema');
  // El upsert (cada hora) ya sin fórmulas: recalcula y la corrige; el log dice por columna.
  real.f = {};
  const u2 = E.ejecutar('upsertDestino');
  ok(!u2.error && real.v[3][colD('Falta Informacion')] === 'No' && /celdas que cambió: 1/.test(u2.logs.join('\n')) &&
     /    Falta Informacion: 1/.test(u2.logs.join('\n')), 'el upsert recalcula y lo dice por columna (Falta Informacion: 1)');
}

/**
 * [23] (06/10, Agenda etapa 2) Una fila SIN Figura: la "Seguridad en tu Barrio" que crea la agenda antes de que RDV
 * CONJUNTO tenga la figura. El cruce con los formularios y el paso 16 tienen que andar igual, sin escribirle nada raro.
 */
function escenarioAgendaEnUpsert() {
  console.log('\n[24] AGENDA_ACTIVA: en el upsert de cada hora la agenda corre ANTES del cruce, y si falla el upsert sigue');
  let E = crearEntorno({ config: { AGENDA_ACTIVA: 'true' } });
  let m = montar(E, 40, true);
  const orden = [];
  const planOrig = E.ctx.calcularPlan_;
  E.ctx.calcularPlan_ = function () { orden.push('cruce'); return planOrig.apply(this, arguments); };
  E.ctx.correrAgendaEnBloqueo_ = function (enSeco) { orden.push('agenda' + (enSeco ? ' (seco)' : '')); return { crear: 0 }; };
  let r = E.ejecutar('upsertDiario');
  ok(!r.error && orden.join(' → ') === 'agenda → cruce', 'upsertDiario: ' + orden.join(' → ') + (r.error ? ' — ' + r.error.message : ''));
  E = crearEntorno({ config: { AGENDA_ACTIVA: 'true' } });
  m = montar(E, 40, true);
  E.ctx.correrAgendaEnBloqueo_ = function () { throw new Error('Gmail: Service invoked too many times'); };
  const antes = contarUid(m.ssD.hojas['RVD JM-CM - ES']);
  r = E.ejecutar('upsertDiario');
  const w = r.resultado && r.resultado.escritura;
  ok(!r.error && w && w.completa && contarUid(m.ssD.hojas['RVD JM-CM - ES']) > antes,
     'la agenda tira un error: el upsert sigue y escribe igual (' + (w ? w.filasHechas : '?') + ' filas)');
  const ssI = E.planilla ? E.planilla(E.cfg('RDV_SS_INTERMEDIA')) : m.ssI;
  const reg = ssI && ssI.hojas['REGISTRO_AGENDA'];
  ok(reg && reg.v.some(function (x) { return /la agenda falló dentro del upsert: Gmail/.test(x.join('|')); }),
     'y el error queda en REGISTRO_AGENDA');
  ok(E.logs.some(function (l) { return /La agenda falló: .*Gmail/.test(l); }), 'y en el log');
}

// 07/10: B con los nombres NUEVOS (todas las redes, los "no usamos", conMail/conCelular/conFijo que se ignoran)
const HDR_B_NUEVO = ['nombre', 'fecha_fin', 'inscriptos', 'inscriptos_identificados', 'inscriptos_M', 'inscriptos_F', 'inscriptos_X',
  'inscriptos_conMail', 'inscriptos_conCelular', 'inscriptos_conFijo', 'inscriptos_canal_Mailing', 'inscriptos_canal_Instagram',
  'inscriptos_canal_Facebook', 'inscriptos_canal_WhatsApp', 'inscriptos_canal_Google', 'inscriptos_canal_Web', 'inscriptos_canal_LinkedIn',
  'inscriptos_canal_TikTok', 'inscriptos_canal_Twitter', 'inscriptos_canal_Programmatic', 'inscriptos_canal_SMS', 'inscriptos_canal_Redes',
  'inscriptos_canal_Difusion', 'inscriptos_canal_Territorial', 'inscriptos_canal_AppAsistentes', 'inscriptos_canal_AppFormulariosOffline',
  'inscriptos_canal_QR', 'inscriptos_canal_Prensa', 'inscriptos_canal_Otros', 'inscriptos_canal_CallCenter', 'inscriptos_canal_IVR',
  'inscriptos_edades_18_24', 'inscriptos_edades_25_39', 'inscriptos_edades_40_55', 'inscriptos_edades_56_65', 'inscriptos_edades_66plus'];

function escenarioColumnasNuevasB() {
  console.log('\n[25] B con los nombres NUEVOS (07/10): el mapeo de canales, sexo y Sin identificar, el chequeo y la protección');
  const E = crearEntorno();
  const m = montar(E, 300, true);
  const viejo = m.ssI.hojas['B'].v;
  const get = function (row, n) { const k = HDR_B.indexOf(n); return k >= 0 && row[k] !== undefined ? row[k] : ''; };
  const nueva = [HDR_B_NUEVO.slice()];
  viejo.slice(1).forEach(function (o) {
    const rr = numJs(get(o, 'inscriptos_canal_Facebook')), dif = numJs(get(o, 'inscriptos_canal_Difusion'));
    const v = {};
    HDR_B_NUEVO.forEach(function (h) { v[h] = 0; });
    ['nombre', 'fecha_fin', 'inscriptos', 'inscriptos_identificados', 'inscriptos_M', 'inscriptos_F', 'inscriptos_canal_Mailing',
     'inscriptos_canal_CallCenter', 'inscriptos_canal_IVR', 'inscriptos_edades_18_24', 'inscriptos_edades_25_39', 'inscriptos_edades_40_55',
     'inscriptos_edades_56_65', 'inscriptos_edades_66plus'].forEach(function (h) { v[h] = get(o, h); });
    v['inscriptos_conMail'] = 999; v['inscriptos_conCelular'] = 999; v['inscriptos_conFijo'] = 999;   // se ignoran
    v['inscriptos_canal_Instagram'] = Math.floor(rr / 3); v['inscriptos_canal_WhatsApp'] = Math.floor(rr / 3);
    v['inscriptos_canal_TikTok'] = rr - 2 * Math.floor(rr / 3);
    v['inscriptos_canal_Territorial'] = Math.floor(dif / 2); v['inscriptos_canal_QR'] = dif - Math.floor(dif / 2);
    nueva.push(HDR_B_NUEVO.map(function (h) { return v[h]; }));
  });
  m.ssI.hojas['B'].v = nueva;
  const hoja = m.ssD.hojas['RVD JM-CM - ES'];
  // filas del destino con los canales vacíos (para ver lo que escribe) y una del hueco con un formulario que NO cierra
  const canales = ['Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión'];
  const esperado = {};
  for (let i = 1; i < hoja.v.length; i++) {
    if (i % 10 !== 1) continue;      // (i - 1) % 10 === 0: también es del hueco de sexo y edades
    esperado[i] = {};
    canales.forEach(function (c) { esperado[i][c] = hoja.v[i][colD(c)]; hoja.v[i][colD(c)] = ''; });
  }
  const iMal = 11;                                                  // la fila 12: su formulario tendrá edades > inscriptos
  const bMal = nueva.findIndex(function (r, k) { return k > 0 && numJs(r[2]) === numJs(hoja.v[iMal][colD('Inscriptos')]) &&
    String(r[0]).indexOf(String(hoja.v[iMal][colD('Figura')]).toUpperCase()) === 0; });
  nueva[bMal][HDR_B_NUEVO.indexOf('inscriptos_edades_18_24')] = 5000;
  const r = E.ejecutar('upsertDestino');
  ok(!r.error && r.logs.some(function (l) { return /columnas de B: OK/.test(l); }), 'todas las columnas reconocidas (log: "columnas de B: OK")' +
     (r.error ? ' — ' + r.error.message : ''));
  let canOk = 0, canN = 0, sexOk = 0, sexN = 0;
  Object.keys(esperado).forEach(function (k) {
    const i = +k;
    if (i === iMal) return;
    canales.forEach(function (c) { canN++; if (numJs(hoja.v[i][colD(c)]) === numJs(esperado[i][c])) canOk++; });
    const ins = numJs(hoja.v[i][colD('Inscriptos')]), M = hoja.v[i][colD('Masculinos')], F = hoja.v[i][colD('Femeninos')], S = hoja.v[i][colD('Sin identificar')];
    if (M !== '') { sexN++; if (numJs(M) + numJs(F) + numJs(S) === ins) sexOk++; }
  });
  ok(canN > 0 && canOk === canN, 'canales escritos = la suma de los de B (RRSS = Instagram + WhatsApp + TikTok; Difusión = Territorial + QR): ' + canOk + ' de ' + canN);
  ok(sexN > 0 && sexOk === sexN, 'Masculinos + Femeninos + Sin identificar = Inscriptos: ' + sexOk + ' de ' + sexN);
  ok(canales.concat(SEXO_EDADES).every(function (c) { return hoja.v[iMal][colD(c)] === ''; }),
     'el formulario que no cierra (edades > Inscriptos): sus datos NO se escriben (la fila sigue vacía)');
  const c46 = E.ejecutar('chequearColumnasB');
  const x = c46.resultado;
  ok(x && x.sinMapear === 0 && x.faltan === 0 && x.ejemplos === 5, 'paso 46: columnas reconocidas, 5 ejemplos — ' + JSON.stringify(x));
  ok(c46.logs.some(function (l) { return /NO CIERRA \| B fila \d+ .*edades: suman 5\d\d\d/.test(l); }) || x.noCierran === 0,
     'paso 46 lista el que no cierra (si es de los últimos 30 días)');
  ok(c46.logs.some(function (l) { return /→ destino: Inscriptos \d+, Mail /.test(l); }), 'y muestra B → destino en los ejemplos');
}

function numJs(v) { return v === '' || v === null || v === undefined ? 0 : Number(v); }

function escenarioFilaSinFigura() {
  console.log('\n[23] una fila sin Figura (Seguridad en tu Barrio de la agenda): el upsert y el paso 16 andan igual');
  const E = crearEntorno({ config: { DERIVADAS_POR_SCRIPT: 'true' } });
  let n = 0;
  const m = montar(E, 200, true, function (E2, datos) {
    const D = E2.Date, col = function (x) { return HDR_DESTINO.indexOf(x); };
    [['Almagro', 24], ['Flores', 25]].forEach(function (b) {
      const r = HDR_DESTINO.map(function () { return ''; });
      r[col('Barrio')] = b[0]; r[col('FECHA')] = new D(2026, 8, b[1], 12, 0, 0); r[col('HORA')] = '18:00';
      r[col('EVENTO')] = 'Seguridad en tu Barrio'; r[col('STATUS REUNIÓN')] = 'en agenda';
      datos.dest.push(r);
    });
    n = datos.dest.length;
  });
  const hoja = m.ssD.hojas['RVD JM-CM - ES'];
  const u = E.ejecutar('upsertDestino');
  ok(!u.error, 'el upsert termina sin error' + (u.error ? ': ' + u.error.stack : ''));
  ok(hoja.v[n - 1][colD('Figura')] === '' && hoja.v[n - 2][colD('Figura')] === '', 'y no les escribe Figura (la escribe la agenda)');
  const v = E.ejecutar('verificarEscritura');
  ok(!v.error && !v.resultado.problemas.some(function (x) { return /invariante|duplicad/.test(x); }), 'paso 16 sin problemas por esas filas' +
     (v.error ? ': ' + v.error.stack : ''));
  ok(hoja.v[n - 2][colD('Día de la semana')] === 'jueves' && hoja.v[n - 1][colD('Día de la semana')] === 'viernes' &&
     hoja.v[n - 2][colD('Comuna')] === 5, 'las derivadas se calculan igual (Día de la semana, Comuna)');
  ok(esVacioTest(hoja.v[n - 2][colD('Asistentes')]), 'Asistentes: no cruza nada (RDV CONJUNTO cruza por figura), sin error');
  const p20 = E.ejecutar('porQueVacia');
  const lin = p20.logs.filter(function (l) { return /^  (\d+) \| /.test(l) && (l.indexOf('  ' + (n - 1) + ' |') === 0 || l.indexOf('  ' + n + ' |') === 0); });
  ok(!p20.error && lin.length > 0 && lin.every(function (l) { return /pendiente de figura/.test(l); }),
     'paso 20: sus celdas vacías dicen "pendiente de figura", no "DEBERÍA ESTAR ESCRITA"' + (p20.error ? ': ' + p20.error.stack : ' (' + lin.length + ')'));
}
function esVacioTest(x) { return x === '' || x === null || x === undefined; }

function casosOradores(E, datos) {
  const D = E.Date, col = function (n) { return HDR_DESTINO.indexOf(n); };
  const fila = function (fig, d, m, barrio, orA, orH) {
    const r = HDR_DESTINO.map(function () { return ''; });
    r[col('Figura')] = fig; r[col('Barrio')] = barrio; r[col('FECHA')] = new D(2026, m - 1, d, 12, 0, 0);
    r[col('HORA')] = '18:00'; r[col('EVENTO')] = 'Encuentro con Vecinos'; r[col('STATUS REUNIÓN')] = 'Realizada';
    r[col('Asistentes')] = 40; r[col('Oradores anotados')] = orA; r[col('Oradores que hablaron')] = orH;
    datos.dest.push(r);
  };
  const conj = function (nombre, barrio, d, m, asis, orA, orH) {
    datos.conjunto.push([nombre, barrio, new D(2026, m - 1, d, 12, 0, 0), '18:00', '', asis, orA, orH, 'Realizada']);
  };
  // V: vacío en el destino → se completa (también el texto)
  fila('Vera Ocampo', 10, 9, 'Palermo', '', '');
  conj('Ocampo Vera', 'Palermo', 10, 9, 40, 7, 'cuatro');
  // C: con valor (y un 0) en el destino → no se toca, aunque RDV CONJUNTO diga otra cosa
  fila('Ciro Ledesma', 11, 9, 'Recoleta', 0, 5);
  conj('Ledesma Ciro', 'Recoleta', 11, 9, 40, 9, 9);
  // A: dos filas de la misma figura el mismo día, y RDV CONJUNTO sin barrio → no desempata, no se escribe
  fila('Ana Zubiría', 12, 9, 'Flores', '', '');
  fila('Ana Zubiría', 12, 9, 'Caballito', '', '');
  conj('Zubiría Ana', '', 12, 9, 40, 6, 3);
  // X: dos filas de RDV CONJUNTO para la misma reunión, con oradores distintos → no se escribe
  fila('Xavier Pons', 13, 9, 'Boedo', '', '');
  conj('Pons Xavier', 'Boedo', 13, 9, 40, 5, 2);
  conj('Pons Xavier', 'Boedo', 13, 9, 40, 8, 2);
}

function escenarioOradores() {
  console.log('\n[20] oradores desde RDV CONJUNTO: medir, completar vacías, no pisar, no escribir lo ambiguo');
  const E = crearEntorno();
  const m = montar(E, 200, true, casosOradores);
  const h = m.ssD.hojas['RVD JM-CM - ES'];
  const filaDe = function (fig, d) {
    return h.v.findIndex(function (r, i) { return i > 0 && r[colD('Figura')] === fig && r[colD('FECHA')].getDate() === d; });
  };
  const OA = colD('Oradores anotados'), OH = colD('Oradores que hablaron');
  // Medición (sólo lectura).
  const f0 = JSON.stringify(foto(h));
  const md = E.ejecutar('medirOradores');
  ok(!md.error && JSON.stringify(foto(h)) === f0, 'paso 28 no escribe nada' + (md.error ? ': ' + md.error.stack : ''));
  const pc = md.resultado.porColumna;
  ok(pc['Oradores anotados'].completaria >= 2 && pc['Oradores anotados'].distinto === 1 &&
     pc['Oradores que hablaron'].distinto === 1 && pc['Oradores anotados'].conflictos === 1,
     'paso 28: se completarían, iguales, distintos (la del 0 y la del 5) y el conflicto, por columna: ' +
     JSON.stringify({ completaria: pc['Oradores anotados'].completaria, igual: pc['Oradores anotados'].igual,
                      distinto: pc['Oradores anotados'].distinto, conflictos: pc['Oradores anotados'].conflictos }));
  ok(/número/.test(md.logs.join('\n')) && /"Oradores anotados": destino columna R \| RDV CONJUNTO columna G \(Asistentes en F\)/.test(md.logs.join('\n')),
     'paso 28: las columnas (R y G, después de Asistentes) y los tipos');
  // Escritura.
  const antes = foto(h);
  const r = E.ejecutar('upsertDestino');
  ok(!r.error, 'upsert sin error' + (r.error ? ': ' + r.error.stack : ''));
  const v = filaDe('Vera Ocampo', 10), c = filaDe('Ciro Ledesma', 11), x = filaDe('Xavier Pons', 13);
  ok(h.v[v][OA] === 7 && h.v[v][OH] === 'cuatro' && esColorSistemaTest(h.bg[v][OA]) && esColorSistemaTest(h.bg[v][OH]),
     'celda vacía: se completa (número y texto), en el color del sistema');
  ok(h.v[c][OA] === 0 && h.v[c][OH] === 5, 'celda con valor (un 0 incluido): no se toca');
  const az = h.v.filter(function (rr, i) { return i > 0 && rr[colD('Figura')] === 'Ana Zubiría'; });
  ok(az.length === 2 && az.every(function (rr) { return rr[OA] === '' && rr[OH] === ''; }), 'cruce ambiguo (2 filas sin desempate): no se escribe');
  ok(h.v[x][OA] === '' && h.v[x][OH] === 2, 'dos valores distintos en RDV CONJUNTO: esa columna no se escribe (la otra, igual en las dos, sí)');
  const a = auditar(antes, h);
  ok(a.pisadas === 0 && a.sinAzul === 0, '0 pisadas, todo en el color del sistema');
  const reg = m.ssI.hojas['REGISTRO_UPSERT'], hr = reg.v[0];
  const pcol = JSON.parse(reg.v[reg.v.length - 1][hr.indexOf('por_columna')] || '{}');
  ok(pcol['Oradores anotados'] >= 2 && pcol['Oradores que hablaron'] >= 2, 'REGISTRO_UPSERT: conteo por columna ' +
     JSON.stringify({ A: pcol['Oradores anotados'], H: pcol['Oradores que hablaron'] }));
  // Paso 20: la causa de las vacías de oradores.
  const q = E.ejecutar('porQueVacia');
  const ql = q.logs.join('\n');
  ok(!q.error && /Oradores anotados → d\) oradores: dos valores distintos en RDV CONJUNTO/.test(ql) &&
     /Ana Zubiría .*Oradores anotados → d\) oradores: 2\+ filas con esa figura y fecha, sin desempate/.test(ql) &&
     q.resultado.deberia === 0, 'paso 20: las causas de los oradores vacíos, y "DEBERÍA ESTAR ESCRITA" = 0');
  // Paso 16: 0 incompletas (con Asistentes y oradores en la cuenta).
  const v16 = E.ejecutar('verificarEscritura').resultado;
  ok(v16.incompletas === 0 && v16.problemas.length === 0, 'paso 16: 0 incompletas, sin problemas (' + v16.problemas.join('; ') + ')');
  // Encabezado fuera de lugar: frena con error, no escribe nada.
  const E2 = crearEntorno();
  const m2 = montar(E2, 50, true);
  const h2 = m2.ssD.hojas['RVD JM-CM - ES'];
  h2.v[0][colD('Oradores anotados')] = 'Oradores (anotados)';
  m2.ssD.hojas['RVD JM-CM - ES'].v[0][colD('Oradores anotados')] = 'Oradores (anotados)';   // igual en el real (si no, frena la guarda)
  const f2 = JSON.stringify(foto(h2));
  const r2 = E2.ejecutar('upsertDestino');
  ok(r2.error && /no tiene la columna "Oradores anotados"/.test(r2.error.message) && JSON.stringify(foto(h2)) === f2,
     'sin el encabezado en R: error y nada escrito');
  const E3 = crearEntorno();
  const m3 = montar(E3, 50, true);
  m3.ssD.hojas['RDV CONJUNTO'].v.forEach(function (rr) { const t = rr[6]; rr[6] = rr[7]; rr[7] = t; });   // invertidas
  const r3 = E3.ejecutar('upsertDestino');
  ok(r3.error && /se esperaba en G/.test(r3.error.message), 'en RDV CONJUNTO, fuera de lugar: error');
}

function escenarioFichasEnDestino() {
  console.log('\n[21] las fichas en el ARCHIVO del destino: ELEGIR y COMENTARIO adelante, marcados y únicos editables');
  const E = crearEntorno({ config: { DIAS_ACTIVOS: '30', REVISAR_COMO_FICHAS: 'true', SOLAPA_FICHAS_EN_DESTINO: 'true' } });
  const m = montar(E, 300, true, casosFichas);
  // La REVISAR_MATCH de la intermedia, como está hoy (fichas viejas, con su desplegable).
  m.ssI.hojas['REVISAR_MATCH'] = new E.Hoja('REVISAR_MATCH', [['ELEGIR', 'ficha'], ['', 'REUNIÓN']]);
  m.ssI.hojas['REVISAR_MATCH'].dv = [[null], [{ lista: ['Opción 1'] }]];
  const r = E.ejecutar('upsertDestino');
  ok(!r.error, 'upsert sin error' + (r.error ? ': ' + r.error.stack : ''));
  const fx = m.ssD.hojas['REVISAR_MATCH'], h = fx && fx.v[0];
  ok(!!fx && h[0] === 'ELEGIR' && h[1] === 'COMENTARIO' && h[2] === 'resultado' && h[3] === 'ficha',
     'la solapa está en el archivo del destino, con ELEGIR, COMENTARIO y resultado adelante');
  const reuniones = [];
  fx.v.forEach(function (x, i) { if (x[3] === 'REUNIÓN') reuniones.push(i + 1); });
  ok(reuniones.length === 2, 'las fichas pendientes (Rita y Lía): ' + reuniones.length);
  const pr = (fx.protecciones || []).filter(function (x) { return x.tipo === 'SHEET'; })[0];
  ok(pr && !pr.warning && pr.editores.join() === 'yo@x' && !pr.dominio, 'protección REAL de toda la solapa: sólo quien corre el script');
  ok(pr && pr.libres.length === 2 && pr.libres.every(function (l, k) { return l[0] === reuniones[k] && l[1] === 1 && l[2] === 1 && l[3] === 2; }),
     'sin proteger: sólo ELEGIR y COMENTARIO de cada línea REUNIÓN');
  ok(reuniones.every(function (f) { return fx.bg[f - 1][0] === '#fff9c4' && fx.bg[f - 1][1] === '#fff9c4'; }) &&
     (fx.bordes || []).some(function (b) { return b.c === 1 && b.nc === 2 && b.args[7] === 'SOLID_MEDIUM'; }),
     'ELEGIR y COMENTARIO en amarillo claro, con borde');
  ok(fx.congeladas === 2 && fx.dv[reuniones[0] - 1][0] && !fx.dv[reuniones[0]][0], 'ELEGIR y COMENTARIO congeladas; el desplegable sólo en la línea REUNIÓN');
  ok(fx.fs[reuniones[0]][4] === 'italic', '"¿por qué?" en itálica');
  ok(Object.keys(fx.anchos || {}).every(function (c) { return fx.anchos[c] <= 400; }) && fx.anchos[1] >= 120, 'anchos ajustados, máximo 400');
  const avisoInt = m.ssI.hojas['REVISAR_MATCH'];
  ok(avisoInt && /están en el archivo del destino/.test(avisoInt.v[0][0]) && !(avisoInt.dv || []).some(function (x) { return x && x[0]; }),
     'la de la intermedia queda con un aviso, sin desplegables');

  // Una elección en ELEGIR del destino se lee y se aplica; algo escrito fuera de ELEGIR, no.
  const hoja = m.ssD.hojas['RVD JM-CM - ES'];
  const kLia = fx.v.findIndex(function (x) { return x[3] === 'REUNIÓN' && x[5] === 'Lía Ferrante'; });
  const kRita = fx.v.findIndex(function (x) { return x[3] === 'REUNIÓN' && x[5] === 'Rita Gómez'; });
  fx.v[kLia][0] = 'Opción 2';
  fx.v[kRita + 2][0] = 'Opción 1';      // en una línea de opción: no es ELEGIR de la ficha
  fx.v[kRita][h.indexOf('evento / formulario')] = 'Opción 1';   // en otra columna de la línea REUNIÓN
  const opcion2 = fx.v.find(function (x, i) { return i > kLia && x[3] === 'Opción 2'; })[h.indexOf('evento / formulario')];
  const r2 = E.ejecutar('upsertDestino');
  const nLia = hoja.v.findIndex(function (x, i) { return i > 0 && x[colD('Figura')] === 'Lía Ferrante'; });
  const nRita = hoja.v.findIndex(function (x, i) { return i > 0 && x[colD('Figura')] === 'Rita Gómez'; });
  ok(!r2.error && hoja.v[nLia][colD('form_origen')] === opcion2 && /\+elegido_por_persona/.test(hoja.v[nLia][colD('form_nivel')]),
     'la elección de ELEGIR (solapa del destino) se lee y se aplica');
  ok(!hoja.v[nRita][colD('RDV_UID')] && !/Rita Gómez/.test(JSON.stringify(m.ssI.hojas['ELECCIONES_MATCH'].v)),
     'lo escrito fuera de ELEGIR (otra línea u otra columna) no se lee');
  const fx2 = m.ssD.hojas['REVISAR_MATCH'];
  ok(fx2.v.some(function (x) { return x[3] === 'resuelta' && x[5] === 'Lía Ferrante' && /^aplicado /.test(x[2]); }),
     'la ficha pasa a RESUELTAS con "aplicado"');
  // La de la intermedia ya no recibe elecciones.
  m.ssI.hojas['REVISAR_MATCH'].v[0][0] = 'Opción 1';
  const r3 = E.ejecutar('upsertDestino');
  ok(/leídas nuevas: 0/.test(r3.logs.join('\n')), 'la de la intermedia ya no se lee');
  // La solapa de fichas no entra en la lectura del destino (RDV_HOJA_DESTINO): el plan es el mismo.
  ok(/filas activas: /.test(r3.logs.join('\n')) && !r3.error, 'el destino se sigue leyendo sólo por su solapa');
  // Si la protección real falla (permisos), queda como advertencia y avisa.
  vm.runInContext('Session = { getEffectiveUser: function () { throw new Error("sin permiso"); } };', E.ctx);
  const r4 = E.ejecutar('upsertDestino');
  const pr4 = (m.ssD.hojas['REVISAR_MATCH'].protecciones || []).filter(function (x) { return x.tipo === 'SHEET'; })[0];
  ok(!r4.error && pr4.warning && /quedó como ADVERTENCIA/.test(r4.logs.join('\n')), 'sin permisos: advertencia y aviso en el log');
}

function escenarioFormatoRevisar() {
  console.log('\n[22] REVISAR_MATCH con el formato aprobado el 06/10 (27_RevisarFormato.js; docs/revisar-match-ficha-tecnica.md)');
  // --- a) la demo (paso 33), sola: estructura y reglas de la ficha técnica ---
  const E0 = crearEntorno();
  const d = E0.ejecutar('demoFormatoRevisar');
  ok(!d.error, 'paso 33: la demo corre' + (d.error ? ': ' + d.error.stack : ''));
  const sh = E0.planilla(E0.cfg('RDV_SS_INTERMEDIA')).hojas['REVISAR_MATCH_DEMO'];
  const RM = E0.cfg('RM'), mapa = d.resultado.mapa;
  const filasDe = function (t) { return Object.keys(mapa).map(Number).filter(function (r) { return mapa[r].tipo === t; }); };
  ok(JSON.stringify(sh.v[0].slice(0, 13)) === JSON.stringify(RM.HEADERS), 'encabezado A..M del diseño');
  const anchos = RM.WIDTHS.map(function (w, i) { return sh.anchos[i + 1]; });
  ok(JSON.stringify(anchos) === JSON.stringify(RM.WIDTHS) && anchos.reduce(function (a, b) { return a + b; }, 0) === 1294,
     'anchos del diseño, 1294 px');
  ok(filasDe('reunion').length === 3 && filasDe('opcion').length === 4 && filasDe('coincide').length === 4 &&
     filasDe('porque').length === 3 && filasDe('contexto').length === 3, 'mapa: 3 reuniones, 4 opciones, 3 contextos');
  ok(filasDe('porque').every(function (r) {
    const t = sh.v[r - 1][4], dos = t.indexOf('\n') >= 0;
    return sh.altos[r] === (dos ? 36 : 22) && t.split('\n').every(function (l) { return l.length <= RM.POR_QUE_MAX; });
  }), '"¿por qué?": cortado en dos con \\n (máximo 150 por renglón) y alto 36; uno solo, 22');
  console.log('       ¿por qué? (778), 2 renglones:\n         ' + sh.v[filasDe('porque')[0] - 1][4].replace('\n', '\n         '));
  ok(filasDe('porque').concat(filasDe('coincide')).every(function (r) {
    return sh.v[r - 1].slice(5).every(function (x) { return x === ''; }) && sh.ws[r - 1][4] === 'OVERFLOW';
  }), '"¿por qué?" y "coincide": el texto en E, con OVERFLOW, y F en adelante vacías');
  const dvs = filasDe('reunion').map(function (r) { return sh.dv[r - 1] && sh.dv[r - 1][0] ? sh.dv[r - 1][0].lista.join('/') : '-'; });
  ok(dvs[0] === 'Opción 1/Ninguno/No sé' && dvs[1] === 'Opción 1/Opción 2/Ninguno/No sé',
     'desplegable por ficha, sólo con sus opciones: ' + dvs.join(' | '));
  ok(Object.keys(mapa).every(function (r) { return mapa[r].tipo === 'reunion' || !(sh.dv[r - 1] && sh.dv[r - 1][0]); }),
     'el desplegable, sólo en la línea REUNIÓN');
  const op1 = filasDe('opcion')[0] - 1;
  ok(sh.bg[op1][5] === '#CDEBD3' && sh.bg[op1][7] === '#ECEEF0' && sh.bg[op1][12] === '#FFEFA8' && sh.bg[op1][10] === sh.bg[op1][6],
     'colores de la opción: figura verde, ubicación gris, "ya usado por" amarillo, días = fecha');
  ok(sh.filasCongeladas === 2 && sh.congeladas === 2 && sh.sinCuadricula === true, 'congeladas filas 1-2 y A-B; sin cuadrícula');

  // --- b) con el plan: de la solapa de antes a la nueva, ELEGIR/COMENTARIO conservados, auxiliares, lectura ---
  const E = crearEntorno({ config: { DIAS_ACTIVOS: '30', REVISAR_COMO_FICHAS: 'true', SOLAPA_FICHAS_EN_DESTINO: 'true',
                                     REVISAR_FORMATO_NUEVO: 'true' } });
  const m = montar(E, 300, true, casosFichas);
  m.ssI.hojas['REVISAR_MATCH'] = new E.Hoja('REVISAR_MATCH', [['ELEGIR', 'ficha']]);   // la de la intermedia, como hoy
  vm.runInContext(
    'var __e = null, __p = null;' +
    'function __entradas() { return { dest: leerDestino_(), cands: leerCandidatos_(), comunas: leerComunasMap_() }; }' +
    'function __fichasViejas() { __e = __entradas(); const p = calcularPlan_(true, __e);' +
    '  escribirFichas_(RDV_HOJA_REVISAR, armarFichas_(p, cruzarAsistentes_(__e.dest, __e.comunas)), { ss: ssDestino_(), proteger: true }); }' +
    'function __plan() { __e = __entradas(); __p = calcularPlan_(true, __e); }' +
    'function __dibujar() { return escribirFichasFormato_(RDV_HOJA_REVISAR, armarFichasFormato_(__p, cruzarAsistentes_(__e.dest, __e.comunas)),' +
    '  { ss: ssDestino_(), proteger: true }); }', E.ctx);
  ok(!E.ejecutar('__fichasViejas').error, 'la solapa en el formato de antes (una ficha por bloque)');
  const vieja = m.ssD.hojas['REVISAR_MATCH'], hv = vieja.v[0];
  const kv = function (fig) { return vieja.v.findIndex(function (x) { return x[3] === 'REUNIÓN' && x[hv.indexOf('figura')] === fig; }); };
  vieja.v[kv('Lía Ferrante')][0] = 'Opción 2';
  vieja.v[kv('Rita Gómez')][0] = 'No sé';
  vieja.v[kv('Rita Gómez')][1] = 'preguntar al equipo';
  const opcion2Lia = vieja.v.find(function (x, i) { return i > kv('Lía Ferrante') && x[3] === 'Opción 2'; })[hv.indexOf('evento / formulario')];

  const s = E.ejecutar('correrEnSeco');
  ok(!s.error && /formato del 06\/10/.test(s.logs.join('\n')), 'en seco, con REVISAR_FORMATO_NUEVO' + (s.error ? ': ' + s.error.stack : ''));
  const rev = m.ssD.hojas['REVISAR_MATCH'], AUX = E.cfg('AUX_FICHAS_');
  const ia = function (n) { return 13 + AUX.indexOf(n); };
  ok(JSON.stringify(rev.v[0].slice(0, 13)) === JSON.stringify(RM.HEADERS) && JSON.stringify(rev.v[0].slice(13, 13 + AUX.length)) === JSON.stringify(AUX),
     'encabezado: A..M del diseño y las auxiliares desde la N');
  ok(JSON.stringify(rev.ocultas) === JSON.stringify([14, 15, 16, 17, 18, 19, 20, 21]), 'las auxiliares, ocultas (N..U): ' + JSON.stringify(rev.ocultas));
  const linea = function (hj, tipo, fig) { return hj.v.findIndex(function (x) { return x[ia('aux_linea')] === tipo && x[5] === fig; }); };
  const kR = linea(rev, 'reunion', 'Rita Gómez');
  ok(kR > 0 && rev.v[kR][3] === 'REUNIÓN' && rev.v[kR][0] === 'No sé' && rev.v[kR][1] === 'preguntar al equipo',
     'Rita: ELEGIR "No sé" y COMENTARIO, de la solapa de antes');
  ok(rev.v[kR][ia('id_figura')] === 'Rita Gómez' && rev.v[kR][ia('id_barrio')] === 'Flores' && /^\d{4}-\d\d-\d\d$/.test(rev.v[kR][ia('id_fecha')]),
     'REUNIÓN: la identidad en las auxiliares (figura, fecha, barrio)');
  const kO = kR + 2;
  ok(rev.v[kO][3] === 'Opción 1' && rev.v[kO][ia('aux_linea')] === 'opcion' && rev.v[kO][ia('aux_opcion')] === 1 &&
     !!rev.v[kO][ia('form_clave')] && rev.v[kO][ia('form_nombre')] === rev.v[kO][8],
     'Opción 1: form_clave y el nombre entero en las auxiliares (sin prefijo genérico, el visible no se recorta)');
  const corto = function (x) { return E.ctx._nombreCorto_(x); };
  const cortos = ['VINCULO CIUDADANO - Encuentro con Vecinos - Clara Muzzio 11/9 Recoleta - Temática',
                  'VÍNCULO CIUDADANO - Encuentro con vecinos sobre Seguridad - Comuna 10 - 17/9',
                  'VÍNCULO CIUDADANO - Encuentro con comerciantes - Lombardi-Tapia-Piragine - Eje Norte - 22/9'].map(corto);
  ok(JSON.stringify(cortos) === JSON.stringify(['…Clara Muzzio 11/9 Recoleta - Temática',
     '…Encuentro con vecinos sobre Seguridad - Comuna 10 - 17/9', '…Lombardi-Tapia-Piragine - Eje Norte - 22/9']),
     'el nombre recortado, como en los ejemplos de la ficha técnica: ' + cortos.join(' | '));
  ok(rev.bg[kO][5] === '#CDEBD3' && rev.bg[kO][7] === '#F6CFCB', 'Rita, opción 1: figura verde, comuna roja (posible reubicación)');
  const vacias = Object.keys(rev.v).filter(function (i) { const t = rev.v[i][3]; return t === '¿por qué?' || t === 'coincide'; });
  ok(vacias.length >= 2 && vacias.every(function (i) { return rev.v[i].slice(5).every(function (x) { return x === '' || x === undefined; }); }),
     '"¿por qué?" y "coincide": de F en adelante vacías, auxiliares incluidas');
  ok(/cambió de lugar/.test(rev.v[kR + 1][4]), '¿por qué? de Rita, el de siempre');
  const kL = linea(rev, 'resuelta', 'Lía Ferrante');
  ok(kL > 0 && rev.v[kL][2] === 'por aplicar' && rev.v[kL][0] === 'Opción 2', 'Lía (elegida en la solapa de antes) pasa a RESUELTAS: ' + (kL > 0 ? rev.v[kL][2] : '-'));
  const pr = (rev.protecciones || []).filter(function (x) { return x.tipo === 'SHEET'; })[0];
  const reuniones = rev.v.map(function (x, i) { return x[ia('aux_linea')] === 'reunion' ? i + 1 : 0; }).filter(Boolean);
  ok(pr && !pr.warning && JSON.stringify(pr.libres) === JSON.stringify(reuniones.map(function (r) { return [r, 1, 1, 2]; })),
     'protección: sólo ELEGIR y COMENTARIO de cada línea REUNIÓN');
  ok(/están en el archivo del destino/.test(m.ssI.hojas['REVISAR_MATCH'].v[0][0]), 'la de la intermedia, con el aviso');

  // --- c) alguien escribe MIENTRAS corre el upsert (después de la lectura del plan, antes de redibujar) ---
  ok(!E.ejecutar('__plan').error, 'el plan (lee las elecciones)');
  rev.v[kR][0] = 'Opción 1'; rev.v[kR][1] = 'es ésta';
  const w = E.ejecutar('__dibujar');
  const rev2 = m.ssD.hojas['REVISAR_MATCH'], kR2 = linea(rev2, 'reunion', 'Rita Gómez');
  ok(!w.error && w.resultado.conservadas === 1 && rev2.v[kR2][0] === 'Opción 1' && rev2.v[kR2][1] === 'es ésta',
     'lo escrito durante la corrida se relee y se conserva al redibujar' + (w.error ? ': ' + w.error.stack : ''));
  // "Opción 1" sigue al formulario por su clave, no por la posición: con otra clave en la auxiliar, no se toma.
  rev2.v[kR2 + 2][ia('form_clave')] = 'zzz|19000101';
  const w2 = E.ejecutar('__dibujar');
  const rev3 = m.ssD.hojas['REVISAR_MATCH'], kR3 = linea(rev3, 'reunion', 'Rita Gómez');
  ok(!w2.error && rev3.v[kR3][0] === 'No sé' && rev3.v[kR3][1] === 'es ésta' && rev3.v[kR3 + 2][ia('form_clave')] !== 'zzz|19000101',
     '"Opción 1" con una clave que ya no está entre las opciones: no se toma (queda lo de ELECCIONES_MATCH); las auxiliares, rehechas');

  // --- d) la elección se lee del formato nuevo y se aplica en la corrida real ---
  rev3.v[kR3][0] = 'Opción 1';
  const opcion1Rita = rev3.v[kR3 + 2][ia('form_nombre')];
  const r = E.ejecutar('upsertDestino');
  const hoja = m.ssD.hojas['RVD JM-CM - ES'];
  const n = function (fig) { return hoja.v.findIndex(function (x, i) { return i > 0 && x[colD('Figura')] === fig; }); };
  ok(!r.error && hoja.v[n('Rita Gómez')][colD('form_origen')] === opcion1Rita &&
     /\+elegido_por_persona/.test(hoja.v[n('Rita Gómez')][colD('form_nivel')]),
     'Rita se escribe con la opción 1, leída de ELEGIR del formato nuevo (+elegido_por_persona)' + (r.error ? ': ' + r.error.stack : ''));
  ok(hoja.v[n('Lía Ferrante')][colD('form_origen')] === opcion2Lia, 'Lía, con la opción 2 elegida en la solapa de antes');
  const rev4 = m.ssD.hojas['REVISAR_MATCH'], kR4 = linea(rev4, 'resuelta', 'Rita Gómez');
  ok(linea(rev4, 'reunion', 'Rita Gómez') < 0 && kR4 > 0 && /^aplicado \d\d\/\d\d$/.test(rev4.v[kR4][2]) && rev4.v[kR4][1] === 'es ésta',
     'Rita pasa a RESUELTAS: "' + (kR4 > 0 ? rev4.v[kR4][2] : '-') + '", con su comentario');
  ok(/PENDIENTES \(0\)/.test(rev4.v[1][3]) && /RESUELTAS \(2\)/.test(rev4.v.map(function (x) { return x[3]; }).join('|')),
     'aviso y encabezado: PENDIENTES (0), RESUELTAS (2)');
}

function escenarioSecoIgualReal() {
  console.log('\n[6] seco y real, con las mismas entradas, dan el mismo plan (punto 3)');
  const E = crearEntorno();
  montar(E, 800, true);
  const seco = E.ejecutar('correrEnSeco');
  const hSeco = seco.logs.find(function (l) { return /^Huella de entradas/.test(l); });
  const real = E.ejecutar('upsertDestino');
  const hReal = real.logs.find(function (l) { return /^Huella de entradas/.test(l); });
  const n = function (x) { return [x.escribiria.t, x.revisar.t, x.sinMatch.t].join(' | '); };
  ok(n(seco.resultado) === n(real.resultado), 'mismos números: seco ' + n(seco.resultado) + ' / real ' + n(real.resultado));
  ok(hSeco === hReal, 'misma huella de entradas y de plan:\n         ' + hSeco);
  // Una sola entrada que cambia (el equipo carga un barrio) cambia la huella del destino, y se ve cuál.
  const E2 = crearEntorno(); const m2 = montar(E2, 800, true);
  const a = E2.ejecutar('correrEnSeco').logs.find(function (l) { return /^Huella de entradas/.test(l); });
  const fila = m2.ssD.hojas['RVD JM-CM - ES'].v.findIndex(function (r, i) { return i > 0 && r[colD('Barrio')] === ''; });
  m2.ssD.hojas['RVD JM-CM - ES'].v[fila][colD('Barrio')] = 'Palermo';
  const b = E2.ejecutar('correrEnSeco').logs.find(function (l) { return /^Huella de entradas/.test(l); });
  const parte = function (s, k) { return new RegExp(k + ' ([0-9a-f]+)').exec(s)[1]; };
  ok(parte(a, 'destino') !== parte(b, 'destino') && parte(a, 'B') === parte(b, 'B'),
     'un barrio cargado cambia sólo la huella del destino: ' + parte(a, 'destino') + ' → ' + parte(b, 'destino'));
}

// ============================== correr ==============================

const conViejo = process.argv.indexOf('--viejo') >= 0;
const fuenteVieja = conViejo ? function (f) {
  // El código de la escritura celda por celda: el último commit antes de la escritura en lote.
  return execSync('git show ea45b2a:"' + f + '"', { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} : null;

const t = Date.now();
if (process.argv.indexOf('--gemelos') >= 0 || process.argv.indexOf('--pasoA') >= 0 || process.argv.indexOf('--pasoB') >= 0 ||
    process.argv.indexOf('--elegido') >= 0 || process.argv.indexOf('--fichas') >= 0 ||
    process.argv.indexOf('--historial') >= 0 || process.argv.indexOf('--activadores') >= 0 ||
    process.argv.indexOf('--derivadas') >= 0 || process.argv.indexOf('--oradores') >= 0 ||
    process.argv.indexOf('--fichasdestino') >= 0 || process.argv.indexOf('--formato') >= 0 ||
    process.argv.indexOf('--sinfigura') >= 0 || process.argv.indexOf('--agendaupsert') >= 0 ||
    process.argv.indexOf('--columnasb') >= 0) {   // uno solo, para iterar
  if (process.argv.indexOf('--gemelos') >= 0) escenarioGemelos();
  else if (process.argv.indexOf('--pasoB') >= 0) escenarioPasoB();
  else if (process.argv.indexOf('--elegido') >= 0) { escenarioPorQueVacia(); escenarioElegido(); }
  else if (process.argv.indexOf('--fichas') >= 0) { escenarioFichas(); escenarioOrdenFichas(); }
  else if (process.argv.indexOf('--historial') >= 0) escenarioCompletarHistorial();
  else if (process.argv.indexOf('--activadores') >= 0) escenarioActivadores();
  else if (process.argv.indexOf('--derivadas') >= 0) escenarioDerivadas();
  else if (process.argv.indexOf('--oradores') >= 0) escenarioOradores();
  else if (process.argv.indexOf('--fichasdestino') >= 0) escenarioFichasEnDestino();
  else if (process.argv.indexOf('--formato') >= 0) escenarioFormatoRevisar();
  else if (process.argv.indexOf('--sinfigura') >= 0) escenarioFilaSinFigura();
  else if (process.argv.indexOf('--agendaupsert') >= 0) escenarioAgendaEnUpsert();
  else if (process.argv.indexOf('--columnasb') >= 0) escenarioColumnasNuevasB();
  else { escenarioPasoA(); escenarioEncabezadosB(); escenarioMalEscritas(); }
  console.log('\n%s', fallas ? fallas + ' FALLAS' : 'TODO OK');
  process.exit(fallas ? 1 : 0);
}
const r1 = escenarioDesdeCero();
escenarioReanudarCortada(fuenteVieja);
if (CALIBRACION.k) {
  // El mismo escenario [1], con el servicio escalado para que el código viejo escriba a la velocidad
  // medida el 02/10. Es la mejor estimación de lo que va a tardar la copia.
  const k = CALIBRACION.k;
  const Ec = crearEntorno({ costo: { op: COSTO_BASE.op * k, lectura: COSTO_BASE.lectura * k } });
  montar(Ec, 800, true);
  const rc = Ec.ejecutar('upsertDestino');
  const wc = rc.resultado.escritura;
  console.log('\n[2b] calibrado (×%s): la escritura de 800 filas tarda %s s; la ejecución entera %s s ' +
              '(de los cuales leer B 60 s y calcular 45 s, supuestos); completa: %s', k.toFixed(2),
              (wc.msEscritura / 1000).toFixed(1), (rc.ms / 1000).toFixed(1), wc.completa);
}
escenarioCorteYContinuacion();
escenarioEquipoEnElMedio();
escenarioGuarda();
escenarioSecoIgualReal();
escenarioGemelos();
escenarioPasoA();
escenarioEncabezadosB();
escenarioMalEscritas();
escenarioPasoB();
escenarioPorQueVacia();
escenarioElegido();
escenarioFichas();
escenarioOrdenFichas();
escenarioCompletarHistorial();
escenarioActivadores();
escenarioDerivadas();
escenarioOradores();
escenarioFichasEnDestino();
escenarioFormatoRevisar();
escenarioFilaSinFigura();
escenarioAgendaEnUpsert();
escenarioColumnasNuevasB();

// Sensibilidad del modelo: con el servicio el doble de lento.
const Ed = crearEntorno({ costo: { op: 80, lectura: 120 } }); montar(Ed, 800, true);
const rd = Ed.ejecutar('upsertDestino');
console.log('\n[7] sensibilidad: con lecturas y escrituras el doble de lentas, la escritura de 800 filas tarda %s s ' +
            '(ejecución %s s, completa: %s)', (rd.resultado.escritura.msEscritura / 1000).toFixed(1),
            (rd.ms / 1000).toFixed(1), rd.resultado.escritura.completa);

console.log('\n%s (%s ms reales)', fallas ? fallas + ' FALLAS' : 'TODO OK', Date.now() - t);
process.exit(fallas ? 1 : 0);
