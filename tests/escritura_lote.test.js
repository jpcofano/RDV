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
                  'diagnostico/07_formulas_destino.js', 'diagnostico/08_verificar_escritura.js'];
const LIMITE_GAS_MS = 6 * 60 * 1000;
const COSTO_BASE = { lectura: 60, op: 40, porCelda: 0.002, openById: 300, leerB: 60000, calculo: 45000 };
/** 02/10 14:50: el cálculo terminó 14:52:41 y el corte fue 14:56:56 → ~255 s para 123 filas. */
const SEG_POR_FILA_REAL = 255 / 123;
const CALIBRACION = { k: null };

// ============================== el mock de Apps Script ==============================

function crearEntorno(opts) {
  opts = opts || {};
  const COSTO = Object.assign({}, COSTO_BASE, opts.costo || {});
  const E = { reloj: new Date(2026, 9, 2, 15, 0, 0).getTime(), inicio: 0, cola: 0, colaCeldas: 0,
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
    getRangeList(lista) {
      const h = this;
      const rangos = lista.map(function (a1) { const p = parseA1(a1); return new Rango(h, p.r, p.c, p.nr, p.nc); });
      return {
        setBackground: function (color) { escribir(rangos.length); rangos.forEach(function (r) { r._pintar(color); }); },
        setValue: function (v) { escribir(rangos.length); rangos.forEach(function (r) { r._poner(v); }); },
        getRanges: function () { return rangos; }
      };
    }
    appendRow(fila) { escribir(fila.length); this.v.push(fila.slice()); this.bg.push(fila.map(function () { return '#ffffff'; })); }
    clearContents() { escribir(1); this.v = this.v.map(function (r) { return r.map(function () { return ''; }); }); }
    setFrozenRows() {}
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
    getFormulas() { leer(this._celdas()); return this.getValuesSinCosto_().map(function (f) { return f.map(function () { return ''; }); }); }
    getValuesSinCosto_() { const o = []; for (let i = 0; i < this.nr; i++) { o.push(new Array(this.nc).fill('')); } return o; }
    setValues(m) {
      if (m.length !== this.nr || m.some((f) => f.length !== this.nc)) throw new Error('setValues: dimensiones');
      escribir(this._celdas());
      this.h._asegurar(this.r + this.nr - 1, this.c + this.nc - 1);
      for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.h.v[this.r + i - 1][this.c + j - 1] = m[i][j];
    }
    setValue(v) { escribir(1); this._poner(v); }
    setBackground(c) { escribir(this._celdas()); this._pintar(c); }
    _poner(v) {
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
    SpreadsheetApp: {
      openById: function (id) { vigilar(); E.reloj += COSTO.openById; return E.planilla(id); },
      flush: function () { vigilar(); vaciar(); }
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
  ARCHIVOS.forEach(function (f) {
    let s;
    try { s = fuente(f); } catch (e) { return; }   // el código viejo no tiene todos los archivos
    vm.runInContext(s, ctx, { filename: f });
  });
  // El paso 14 mira fórmulas reales: en el mock no hay. Se lo reemplaza por "todo bien".
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
  const nombres = { C: 'EVENTO', F: 'HORA', H: 'STATUS REUNIÓN', L: 'Mail', M: 'Call Center', N: 'IVR', O: 'RRSS',
    P: 'Difusión', R: 'Masculinos', S: 'Femeninos', T: '18-24', U: '25-39', V: '40-55', AH: '56-65',
    AI: '66+', AJ: 'Sin identificar' };
  return fx.map(function (h) { const m = /^PENDIENTE_([A-Z]+)$/.exec(h); return m && nombres[m[1]] ? nombres[m[1]] : h; })
           .concat(['RDV_UID', 'form_origen', 'form_score', 'form_nivel', 'form_fecha_match', 'form_clave']);
})();
const HDR_B = ['Nombre', 'Fecha_Fin', 'Inscriptos', 'Inscriptos unicos identificados', 'Inscriptos M', 'Inscriptos F',
  'Inscriptos edades 18-24', 'Inscriptos edades 25-39', 'Inscriptos edades 40-55', 'Inscriptos edades 56-65',
  'Inscriptos edades 66+'];
const SEXO_EDADES = ['Masculinos', 'Femeninos', '18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar'];
const DERIVADAS = ['Día de la semana', '% de Asistencia', 'Direccion2', 'Falta Informacion', 'Comuna', 'Poblacion',
  'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona'];

function generarDatos(E, n) {
  const D = E.Date, col = function (nombre) { return HDR_DESTINO.indexOf(nombre); };
  const dest = [HDR_DESTINO.slice()], b = [HDR_B.slice()];
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
    dest.push(r);

    const fin = new D(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() - 2, 12, 0, 0);
    const ins = r[col('Inscriptos')], uni = Math.round(ins * 0.8);
    b.push([fig.toUpperCase() + ' - Encuentro con vecinos - Comuna ' + bar[1] + ' - ' +
            fecha.getDate() + '/' + (fecha.getMonth() + 1), fin, ins, uni, Math.round(uni * 0.45), Math.round(uni * 0.55),
            Math.round(uni * 0.1), Math.round(uni * 0.3), Math.round(uni * 0.3), Math.round(uni * 0.2), Math.round(uni * 0.1)]);
  }
  for (let k = 0; k < 25; k++) {   // ruido: formularios que no son de ninguna fila
    b.push(['OTRO EVENTO ' + k + ' - Comuna 3 - 15/3', new D(2024, 2, 13, 12, 0, 0), 10, 8, 4, 4, 1, 2, 2, 2, 1]);
  }
  const comunas = [['Barrio', 'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona', 'Eje geográfico']]
    .concat(BARRIOS.map(function (x) { return [x[0], x[1], 1000, 500, 500, 2, 500, 'Centro', '']; }));
  return { dest: dest, b: b, comunas: comunas };
}

function montar(E, n, conCopia, casos) {
  const datos = generarDatos(E, n);
  if (casos) casos(E, datos);
  const ssD = E.planilla(E.cfg('RDV_SS_DESTINO')), ssI = E.planilla(E.cfg('RDV_SS_INTERMEDIA'));
  ssD.hojas['RVD JM-CM - ES'] = new E.Hoja('RVD JM-CM - ES', datos.dest);
  if (conCopia) ssD.hojas['AAA NOBORRAR'] = new E.Hoja('AAA NOBORRAR', datos.dest);
  ssD.hojas['Comunas'] = new E.Hoja('Comunas', datos.comunas);
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
  const prohibidas = ['Barrio', 'Inscriptos', 'Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión'].concat(DERIVADAS).map(colD);
  for (let i = 1; i < antes.v.length; i++) {
    for (let k = 0; k < HDR_DESTINO.length; k++) {
      const a = antes.v[i][k], d = despues.v[i] ? despues.v[i][k] : undefined;
      const azul = String(despues.bg[i][k]).toLowerCase() === '#4f81bd';
      if (a !== '' && a !== d) {
        if (k === colD('STATUS REUNIÓN') && a === 'en agenda' && d === 'Realizada' && azul) r.realizadas++;
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
function foto(h) { return { v: h.v.map(function (r) { return r.slice(); }), bg: h.bg.map(function (r) { return r.slice(); }) }; }
function contarUid(h) { let n = 0; for (let i = 1; i < h.v.length; i++) if (h.v[i][colD('RDV_UID')]) n++; return n; }

// ============================== los escenarios ==============================

function escenarioDesdeCero() {
  console.log('\n[1] 800 filas, la copia vacía de traza: una escritura completa');
  const E = crearEntorno();
  const m = montar(E, 800, true);
  const hoja = m.ssD.hojas['AAA NOBORRAR'], real = m.ssD.hojas['RVD JM-CM - ES'];
  const antes = foto(hoja), antesReal = foto(real);
  const r = E.ejecutar('upsertDestino');
  ok(!r.error, 'termina sin error' + (r.error ? ': ' + r.error.message : ''));
  const w = r.resultado && r.resultado.escritura;
  const a = auditar(antes, hoja);
  ok(a.pisadas === 0, 'ninguna celda con valor fue pisada (' + a.pisadas + ')');
  ok(a.sinAzul === 0, 'todo lo escrito está en azul');
  ok(a.fondosTocados === 0, 'ningún otro fondo cambió');
  ok(a.manualesODerivadas === 0, 'ninguna columna manual ni derivada recibió nada');
  ok(JSON.stringify(foto(real)) === JSON.stringify(antesReal), 'la solapa real no se tocó (el destino apunta a la copia)');
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
  const hoja = m.ssD.hojas['AAA NOBORRAR'];
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
    const llena = m2.ssD.hojas['AAA NOBORRAR'];
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
  const hoja = m.ssD.hojas['AAA NOBORRAR'];
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
  const hoja = m.ssD.hojas['AAA NOBORRAR'];
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
  ok(celda && String(hoja.bg[celda.fila - 1][celda.col - 1]).toLowerCase() !== '#4f81bd', 'y no se pintó de azul');
}

function escenarioGuarda() {
  console.log('\n[5] la guarda: solapa inexistente, o con otros encabezados → error, sin escribir');
  let E = crearEntorno(); let m = montar(E, 50, false);
  let antes = JSON.stringify(foto(m.ssD.hojas['RVD JM-CM - ES']));
  let r = E.ejecutar('upsertDestino');
  ok(r.error && /No existe la solapa destino/.test(r.error.message), 'sin la copia: ' + (r.error && r.error.message));
  ok(JSON.stringify(foto(m.ssD.hojas['RVD JM-CM - ES'])) === antes, 'y no tocó nada');
  E = crearEntorno(); m = montar(E, 50, true);
  m.ssD.hojas['AAA NOBORRAR'].v[0][colD('Masculinos')] = 'Varones';
  antes = JSON.stringify(foto(m.ssD.hojas['AAA NOBORRAR']));
  r = E.ejecutar('upsertDestino');
  ok(r.error && /no son los del destino real/.test(r.error.message), 'encabezado cambiado: ' + (r.error && r.error.message));
  ok(JSON.stringify(foto(m.ssD.hojas['AAA NOBORRAR'])) === antes, 'y no tocó nada');
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
    r[col('Asistentes')] = 40; r[col('Inscriptos')] = 100;
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
  const hoja = m.ssD.hojas['AAA NOBORRAR'];
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
  const h2 = m2.ssD.hojas['AAA NOBORRAR'];
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
    if (String(h2.bg[n309 - 1][k]).toLowerCase() === '#4f81bd') { h2.v[n309 - 1][k] = ''; h2.bg[n309 - 1][k] = '#ffffff'; }
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
  const fila = m2.ssD.hojas['AAA NOBORRAR'].v.findIndex(function (r, i) { return i > 0 && r[colD('Barrio')] === ''; });
  m2.ssD.hojas['AAA NOBORRAR'].v[fila][colD('Barrio')] = 'Palermo';
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
if (process.argv.indexOf('--gemelos') >= 0) {   // sólo el escenario 8, para iterar
  escenarioGemelos();
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

// Sensibilidad del modelo: con el servicio el doble de lento.
const Ed = crearEntorno({ costo: { op: 80, lectura: 120 } }); montar(Ed, 800, true);
const rd = Ed.ejecutar('upsertDestino');
console.log('\n[7] sensibilidad: con lecturas y escrituras el doble de lentas, la escritura de 800 filas tarda %s s ' +
            '(ejecución %s s, completa: %s)', (rd.resultado.escritura.msEscritura / 1000).toFixed(1),
            (rd.ms / 1000).toFixed(1), rd.resultado.escritura.completa);

console.log('\n%s (%s ms reales)', fallas ? fallas + ' FALLAS' : 'TODO OK', Date.now() - t);
process.exit(fallas ? 1 : 0);
