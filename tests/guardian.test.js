/**
 * tests/guardian.test.js — el guardián de las columnas del sistema (diagnostico/27_guardian.js, 08/10; ajustado el 09/10) y
 * `manana()` (99_Correr.js, que llama a diagnostico/28_manana.js), en un Apps Script simulado (tests/ids_mock.js).
 *
 *     node tests/guardian.test.js
 *
 * El texto del guardián todavía no llegó: esto prueba lo que se mide SIN él, y que todo es de SÓLO LECTURA.
 *
 * [1] alineacionBase_: las filas cuyas trazas no cuadran con la fila. La agenda (FECHA / HORA / Barrio escritos contra lo
 *     que hay hoy: una diferencia es del equipo, dos o más es otra fila, salvo que "Tocado por el equipo" las anote TODAS: es
 *     una reprogramación; con la fecha como número de serie, texto o Date y la hora como Date, fracción, serial con fecha,
 *     "18 hs"…), el formulario (la figura que nombra: una, ninguna, una conjunta; su fecha a 21 días, la regla del mes, el
 *     cambio de año, sin form_clave), lo que cuenta como "con traza", el umbral (máx(5, 5% de las filas con traza)) en el
 *     borde y la RACHA (6 o más filas SEGUIDAS que no cuadran alcanzan, aunque no lleguen al umbral) con sus falsas alarmas.
 * [2] pruebaOrdenParcial_: ordenar SÓLO las columnas del equipo (las del sistema quedan quietas) contra ordenar filas
 *     enteras. Base ordenada al derecho y al revés, el borde del 20% de filas movidas, base chica, filas sin traza, las
 *     derivadas, órdenes parciales REALISTAS (toda la base y sólo las últimas filas, con y sin la columna Figura), la
 *     autoprueba "no concluyente" y lo que pasa con "Tocado por el equipo" después de una corrida de la agenda.
 * [3] inventarioColumnasSistema: qué cuenta y qué propone, con columnas ocultas y protecciones simuladas (el mock no las
 *     tiene: se las agrega este test a la hoja).
 * [4] manana(): ni una llamada de escritura (ni la base, ni la intermedia, ni el archivo de la lista), el resumen en cada
 *     caso (el 3735 que cruza, que se movió de número, que no cruza, que cruza a OTRA fila), y qué pasa si un paso falla.
 *
 * Los chequeos marcados `// BUG:` (`bug(...)`) muestran un defecto del guardián: FALLAN mientras esté (el test sale con código
 * 1 hasta que se arregle). Los que dicen "DECISIÓN:" documentan lo que el código hace hoy en un caso de diseño; los que dicen
 * "HALLAZGO:", lo que hace hoy en un caso donde la detección parece quedarse corta (se reporta, no se fuerza). Los cinco BUG
 * del 08/10 (sin form_clave, la autoprueba vacía, el alcance de las protecciones, la propuesta por encabezado normalizado, la
 * última línea del resumen) se arreglaron el 09/10 y quedan como chequeos normales ("ex BUG").
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: figuras, barrios y fechas inventados (los nombres
 * son los de los otros tests; los barrios, los de la Ciudad). "Hoy" es el 08/10/2026 21:00.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { crearEntornoIds, filaBase, hdrBase, D, HDR_BASE } = require('./ids_mock');

const RAIZ = path.join(__dirname, '..');
let chequeos = 0, fallas = 0, bugsAbiertos = 0;
function ok(cond, que) { chequeos++; console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }
/** Un BUG del guardián conocido: falla mientras el bug esté (la línea dice "BUG"). */
function bug(cond, que) { chequeos++; console.log((cond ? '  ok   ' : '  BUG   ') + que); if (!cond) { fallas++; bugsAbiertos++; } }

// ---------------------------- helpers ----------------------------
const pad = function (n) { return ('0' + n).slice(-2); };
const ymd8 = function (d) { return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); };
const dmy = function (d) { return d && d.getTime ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : String(d); };
/** El número de serie de Sheets de una fecha (días desde el 30/12/1899). */
const serieDe = function (d) { return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000); };
/** Una hora como la devuelve Sheets (un Date del 30/12/1899). */
const H = function (h, m) { return new Date(1899, 11, 30, h, m || 0, 0); };
const sinTildes = function (s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };

const FIGURAS = ['Jorge Macri', 'Hernán Lombardi', 'Gabino Tapia', 'Gustavo Arengo Piragine', 'Ana Pereyra', 'Ruth Landerreche'];
const BARRIOS = ['Belgrano', 'Retiro', 'Núñez', 'Palermo', 'Flores', 'Caballito'];
const HORAS = ['17:00', '18:00', '18:30', '19:00'];

/**
 * `n` filas sanas, una cada `paso` días desde `ini`. La figura, el barrio y la hora ROTAN de modo que dos filas seguidas
 * SIEMPRE difieren en las tres: una fila que recibe los datos de su vecina no puede cuadrar. Cada una trae las dos trazas
 * (se pueden sacar con `traza(i)` → `{ form, agenda }`, o con `form: false` / `agenda: false`):
 *   - el formulario: form_origen con la figura y la fecha de la fila; form_clave con el cierre 2 días antes;
 *   - la agenda: agenda_uid y lo que escribió (fecha, hora y barrio de la fila).
 * `hdr`: un encabezado propio (la base sin las columnas de la agenda, por ejemplo).
 */
function armarBase(n, o) {
  const op = o || {};
  const ini = op.ini || new Date(2026, 5, 1, 12), paso = op.paso || 1, figs = op.figuras || FIGURAS;
  const filas = [];
  for (let i = 0; i < n; i++) {
    const fecha = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + Math.floor(i * paso), 12);
    const fig = figs[i % figs.length], bar = BARRIOS[(i * 5 + 1) % 6], hora = HORAS[i % 4];
    const fin = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() - 2, 12);
    const nombre = fig + ' - Encuentro con vecinos - ' + fecha.getDate() + '/' + (fecha.getMonth() + 1);
    const t = op.traza ? op.traza(i) : { form: true, agenda: true };
    const r = { Figura: fig, Barrio: bar, EVENTO: 'Encuentro con Vecinos', FECHA: fecha, HORA: hora };
    if (op.form !== false && t.form) { r.form_origen = nombre; r.form_clave = nombre.toLowerCase() + '|' + ymd8(fin); }
    if (op.agenda !== false && t.agenda) {
      r.agenda_uid = 'c-' + i; r.agenda_fecha_escrita = fecha; r.agenda_hora_escrita = hora; r.agenda_barrio_escrito = bar;
    }
    filas.push(filaBase(r, op.hdr));
  }
  return filas;
}
/** La base de la escala real (803 filas en 15 meses; ~1,75 reuniones por día): el umbral por cantidad es 41. */
function armarBaseGrande(o) {
  const n = 803;
  return armarBase(n, Object.assign({ ini: new Date(2025, 6, 5, 12), paso: 460 / n }, o || {}));
}

/**
 * El entorno con el guardián (diagnostico/27_guardian.js), lo que corre manana() (diagnostico/28_manana.js) y manana()
 * (99_Correr.js) cargados; `conAgenda`: también 40_Agenda.js.
 */
function entornoG(o) {
  const op = Object.assign({}, o || {});
  const conAgenda = !!op.conAgenda;
  delete op.conAgenda;
  const E = crearEntornoIds(op);
  ['diagnostico/27_guardian.js', 'diagnostico/28_manana.js', '99_Correr.js'].concat(conAgenda ? ['40_Agenda.js'] : []).forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), E.ctx, { filename: f });
  });
  E.ctx.SpreadsheetApp.ProtectionType = { RANGE: 'RANGE' };   // el mock no lo define; Apps Script sí
  return E;
}
/** Cambia celdas de la base por NOMBRE de columna. Una Date de afuera del vm pasa a ser una Date del contexto. */
function celdas(E, fila, o) {
  const hdr = E.base().valores[0];
  Object.keys(o).forEach(function (k) {
    const i = hdr.indexOf(k);
    if (i < 0) throw new Error('celdas: no existe la columna "' + k + '"');
    const v = o[k];
    E.base().valores[fila - 1][i] = v instanceof Date ? new E.ctx.Date(v.getTime()) : v;
  });
}
const leer = function (E, fila, nombre) { return E.base().valores[fila - 1][E.base().valores[0].indexOf(nombre)]; };
/** "d/m" de la FECHA de una fila (como la escribe el nombre de un formulario). */
const dm = function (E, fila) { const f = leer(E, fila, 'FECHA'); return f.getDate() + '/' + (f.getMonth() + 1); };
const alinear = function (E) { return E.run('alineacionBase_(leerDestino_())'); };
/** Cambia `lista` = `[[fila, cambios], …]`, mide, y lo deja todo como estaba. Devuelve lo que mide `alineacionBase_`. */
function probarVarias(E, lista) {
  const antes = lista.map(function (x) { const o = {}; Object.keys(x[1]).forEach(function (k) { o[k] = leer(E, x[0], k); }); return o; });
  lista.forEach(function (x) { celdas(E, x[0], x[1]); });
  let a;
  try { a = alinear(E); } finally { lista.forEach(function (x, i) { celdas(E, x[0], antes[i]); }); }
  return a;
}
/** Cambia `cambios` en UNA fila, mide, y lo deja como estaba. `flag`: ¿esa fila quedó entre las que no cuadran? */
function probar(E, fila, cambios) {
  const a = probarVarias(E, [[fila, cambios]]);
  const x = a.noCuadran.filter(function (n) { return n.fila === fila; })[0];
  return { flag: !!x, motivos: x ? Array.prototype.slice.call(x.motivos) : [], otras: a.noCuadran.length - (x ? 1 : 0), a: a };
}
/** El bloque de la base (encabezado + filas), copiado: las celdas son las mismas. */
const bloqueDe = function (E) { return E.base().valores.map(function (r) { return r.slice(); }); };
/** `alineacionBase_` sobre un bloque cualquiera (la base "como quedaría"). */
function alinearBloque(E, bloque) {
  E.ctx.__b = bloque;
  return E.run('alineacionBase_(armarDestino_(ssDestino_().getSheetByName(RDV_HOJA_DESTINO), RDV_HOJA_DESTINO, __b))');
}
function pruebaOrden(E, bloque) {
  E.ctx.__b = bloque || bloqueDe(E);
  return E.run('pruebaOrdenParcial_(ssDestino_().getSheetByName(RDV_HOJA_DESTINO), RDV_HOJA_DESTINO, __b)');
}
/** Las columnas del sistema SIN las derivadas (lo que la prueba deja quieto), por posición 0-based. */
function columnasQuietas(E, hdr) {
  E.ctx.__hdr = hdr;
  return Array.prototype.slice.call(E.run('columnasDelSistema_(__hdr).filter(function (x) { return x.grupo !== "derivadas"; }).map(function (x) { return x.col; })'));
}
/**
 * Un orden parcial a mano: `orden[i]` = de qué fila de datos viene el EQUIPO de la fila i; las columnas del sistema quedan
 * quietas. `tambienQuietas`: más columnas que no se mueven (la que el equipo no seleccionó al ordenar, p. ej. "Figura").
 */
function parcialCon(E, bloque, orden, tambienQuietas) {
  const hdr = bloque[0], datos = bloque.slice(1);
  const quietas = columnasQuietas(E, hdr).concat((tambienQuietas || []).map(function (n) { return hdr.indexOf(n); }));
  return [hdr].concat(datos.map(function (r, i) {
    return r.map(function (v, k) { return quietas.indexOf(k) >= 0 ? v : datos[orden[i]][k]; });
  }));
}
/** El orden de las filas de datos por FECHA (descendente o ascendente), restringido a las últimas `k` (todas si no se pasa). */
function ordenPorFecha(bloque, desc, k) {
  const datos = bloque.slice(1), iF = bloque[0].indexOf('FECHA');
  const orden = datos.map(function (r, i) { return i; });
  const ini = k ? datos.length - k : 0;
  const tramo = orden.slice(ini).sort(function (a, b) { return (desc ? datos[b][iF] - datos[a][iF] : datos[a][iF] - datos[b][iF]) || (a - b); });
  tramo.forEach(function (v, j) { orden[ini + j] = v; });
  return orden;
}
/** La racha más larga de filas CONSECUTIVAS (por número de fila) que no cuadran: una cuenta independiente de la del guardián. */
function racha(a) {
  let max = 0, cur = 0, prev = -9;
  a.noCuadran.forEach(function (x) { cur = x.fila === prev + 1 ? cur + 1 : 1; prev = x.fila; if (cur > max) max = cur; });
  return max;
}
/** La racha más larga SALTANDO las filas sin ninguna traza (no se pueden medir: ni cuadran ni dejan de cuadrar). */
function rachaEntreTrazadas(bloque, a) {
  const hdr = bloque[0], iO = hdr.indexOf('form_origen'), iU = hdr.indexOf('agenda_uid');
  const malas = new Set(a.noCuadran.map(function (x) { return x.fila; }));
  let max = 0, cur = 0;
  for (let fila = 2; fila <= bloque.length; fila++) {
    const r = bloque[fila - 1];
    if (String(r[iO]) === '' && String(r[iU]) === '') continue;
    if (malas.has(fila)) { cur++; if (cur > max) max = cur; } else cur = 0;
  }
  return max;
}
/** Los cambios que rompen el formulario de una fila: nombra a OTRA figura que la de la fila (el caso de una desalineación). */
function rotaForm(E, fila) { return { form_origen: FIGURAS[(fila - 2 + 1) % FIGURAS.length] + ' - Encuentro con vecinos - ' + dm(E, fila) }; }
/** Rompe el formulario de las filas, DEJÁNDOLO así. */
function romper(E, filas) { filas.forEach(function (fila) { celdas(E, fila, rotaForm(E, fila)); }); }
/**
 * Lo que hace la corrida de la hora de la agenda con "Tocado por el equipo": para cada fila con agenda_uid, anota las columnas
 * que hoy difieren de lo que escribió, con la función REAL de la agenda (`tocadoPorEquipoAgenda_`, 40_Agenda.js). Cambia el
 * `bloque` (no la base) y devuelve cuántas filas anotó. Necesita `entornoG({ conAgenda: true })`.
 */
function agendaAnotaTocado(E, bloque) {
  E.ctx.__p = bloque;
  return E.run('(function () { var hdr = __p[0], A = indicesAgenda_(hdr), iT = A["Tocado por el equipo"], n = 0; ' +
               'for (var i = 1; i < __p.length; i++) { if (!str(__p[i][A["agenda_uid"]])) continue; var t = tocadoPorEquipoAgenda_(__p[i], A); ' +
               'if (t !== str(__p[i][iT])) { __p[i][iT] = t; n++; } } return n; })()');
}
/** Una foto de TODO lo que hay en los archivos simulados: valores, fondos, formatos, fórmulas, dimensiones y escrituras. */
function foto(E) {
  const out = {};
  Object.keys(E.archivos).forEach(function (id) {
    const a = E.archivos[id];
    out[a.nombre] = {};
    Object.keys(a.hojas).sort().forEach(function (n) {
      const h = a.hojas[n];
      out[a.nombre][n] = JSON.stringify({ v: h.valores, f: h.fondos, n: h.formatos, fm: h.formulasCelda, c: h.congeladas, r: h.maxRows, k: h.maxCols, e: h.escrituras });
    });
  });
  return JSON.stringify(out);
}
/** Anota cada llamada que ESCRIBE (o agrega hojas) en los archivos simulados; devuelve la lista (vacía = sólo se leyó). */
function vigilar(E) {
  const llamadas = [];
  const marcar = function (donde, nombres, obj) {
    nombres.forEach(function (n) {
      const orig = obj[n];
      if (typeof orig !== 'function') return;
      obj[n] = function () { llamadas.push(donde + '.' + n); return orig.apply(obj, arguments); };
    });
  };
  Object.keys(E.archivos).forEach(function (id) {
    const a = E.archivos[id];
    marcar(a.nombre, ['insertSheet'], a.ss);
    Object.keys(a.hojas).forEach(function (n) {
      const s = a.hojas[n].sheet, donde = a.nombre + '/' + n;
      marcar(donde, ['insertColumnsAfter', 'insertRowsAfter', 'appendRow', 'setFrozenRows', 'clearContents'], s);
      const gRango = s.getRange, gDatos = s.getDataRange, gLista = s.getRangeList;
      const envolver = function (r) { marcar(donde + '.rango', ['setValues', 'setValue', 'setBackground', 'setNumberFormat', 'clearFormat', 'clearContent'], r); return r; };
      s.getRange = function () { return envolver(gRango.apply(s, arguments)); };
      s.getDataRange = function () { return envolver(gDatos.apply(s, arguments)); };
      s.getRangeList = function () { const l = gLista.apply(s, arguments); marcar(donde + '.lista', ['setBackground', 'setNumberFormat', 'setValue'], l); return l; };
    });
  });
  return llamadas;
}
/**
 * Le agrega a la hoja de la base lo que el mock no tiene: columnas ocultas (`ocultas`, posiciones 1-based) y protecciones
 * (`protecciones`: `{ desde, hasta, fila, hastaFila, desc, advertencia }` en columnas 1-based). Anota si alguien pide ocultar o
 * proteger algo (`reg.cambios`: tiene que quedar en 0) y qué tipo de protección se pidió (`reg.tipos`).
 */
function simularHoja(E, o) {
  const sh = E.base().sheet, ocultas = o.ocultas || [], reg = { tipos: [], cambios: [] };
  sh.isColumnHiddenByUser = function (c) { return ocultas.indexOf(c) >= 0; };
  sh.getProtections = function (tipo) {
    reg.tipos.push(tipo);
    if (o.error) throw new Error(o.error);
    return (o.protecciones || []).map(function (p) {
      return {
        getRange: function () {
          return { getColumn: function () { return p.desde; }, getLastColumn: function () { return p.hasta; },
                   getRow: function () { return p.fila || 1; }, getLastRow: function () { return p.hastaFila || E.base().maxRows; } };
        },
        getDescription: function () { return p.desc || ''; },
        isWarningOnly: function () { return !!p.advertencia; }
      };
    });
  };
  ['hideColumns', 'hideColumn', 'showColumns', 'showColumn', 'protect'].forEach(function (m) { sh[m] = function () { reg.cambios.push(m); }; });
  return reg;
}

// ===================================================================================================================
console.log('[1] alineacionBase_: las filas cuyas trazas no cuadran con la fila');
// La fila 2 es Macri (01/06/2026), la 3 Lombardi, la 4 Tapia, la 5 Arengo, la 6 Ana Pereyra, la 7 Ruth Landerreche, la 8 Macri otra
// vez…; cada fila es un día más. Las dos trazas, en todas.
const E1 = entornoG({ base: armarBase(60) });
const R_MACRI = 2, R_LOMBARDI = 3, R_TAPIA = 4, R_ARENGO = 5, R_ANA = 6, R_RUTH = 7;
{
  const a = alinear(E1);
  ok(E1.cfg('GUARDIAN_MIN_FILAS_') === 5 && E1.cfg('GUARDIAN_PROPORCION_') === 0.05 && E1.cfg('GUARDIAN_RACHA_') === 6 && E1.cfg('GUARDIAN_DIAS_FORMULARIO_') === 21,
     'los umbrales de hoy: mínimo 5 filas, 5% de las que tienen traza, racha de 6 filas seguidas, el formulario a 21 días');
  ok(a.trazadas === 60 && a.noCuadran.length === 0 && a.umbral === 5 && a.racha === 0 && a.veredicto === 'alineada',
     'base sana (60 filas con las dos trazas): 60 con traza, 0 que no cuadran, umbral 5, racha 0 → "alineada" (dio ' + a.noCuadran.length + ')');
}

console.log('  -- la agenda: una diferencia la hizo el equipo; dos o más, la fila no es la que escribió el sistema');
[['FECHA', { FECHA: D(20, 6) }], ['HORA', { HORA: '10:00' }], ['Barrio', { Barrio: 'Saavedra' }]].forEach(function (c) {
  const r = probar(E1, R_ARENGO, c[1]);
  ok(!r.flag, 'sólo ' + c[0] + ' distinta (la cambió el equipo): no cuenta');
});
[[['FECHA', 'HORA'], { FECHA: D(20, 6), HORA: '10:00' }], [['HORA', 'Barrio'], { HORA: '10:00', Barrio: 'Saavedra' }],
 [['FECHA', 'Barrio'], { FECHA: D(20, 6), Barrio: 'Saavedra' }], [['FECHA', 'HORA', 'Barrio'], { FECHA: D(20, 6), HORA: '10:00', Barrio: 'Saavedra' }]].forEach(function (c) {
  const r = probar(E1, R_ANA, c[1]);
  ok(r.flag && r.motivos.length === 1 && r.motivos[0] === 'la agenda escribió otra ' + c[0].join(', ') + ' en esta fila',
     c[0].join(' + ') + ' distintas: cuenta, con el motivo "' + r.motivos.join('; ') + '"');
});
{
  const r = probar(E1, R_ANA, { agenda_fecha_escrita: '', agenda_hora_escrita: '', agenda_barrio_escrito: '', FECHA: D(20, 6), HORA: '10:00', Barrio: 'Saavedra' });
  ok(!r.flag, 'una fila con agenda_uid pero sin nada escrito (vinculada a una fila del equipo): no hay con qué comparar, no cuenta');
}

console.log('  -- "Tocado por el equipo" (la agenda anota lo que el equipo cambió): si TODAS las diferencias están anotadas, es una reprogramación y no cuenta');
const dmf = function (fila) { return dm(E1, fila); };
{
  const dos = { FECHA: D(20, 6), HORA: '10:00' };                      // la fila 6 es el 05/06: dos diferencias de la agenda
  const tres = Object.assign({ Barrio: 'Saavedra' }, dos);
  const con = function (tocado, cambios) { return probar(E1, R_ANA, Object.assign({ 'Tocado por el equipo': tocado }, cambios || dos)); };
  ok(con('').flag, 'dos diferencias y "Tocado por el equipo" vacío: cuenta (nadie lo anotó)');
  [['FECHA, HORA', 'como lo anota la agenda'], ['HORA, FECHA', 'en otro orden'], ['fecha,hora', 'en minúsculas y sin espacios'], ['  FECHA ,  hora ', 'con espacios de más'],
   ['FECHA, HORA, Dirección', 'con una columna de más'], ['FECHA, HORA, Dirección, Barrio, STATUS REUNIÓN', 'con todas las que sabe anotar la agenda']].forEach(function (c) {
    ok(!con(c[0]).flag, '"' + c[0].trim() + '" (' + c[1] + '): las dos diferencias (FECHA y HORA) están anotadas → no cuenta');
  });
  [['FECHA', 'sólo una de las dos'], ['Barrio', 'otra de las tres'], ['Dirección', 'otra columna'], ['STATUS REUNIÓN', 'el estado']].forEach(function (c) {
    const r = con(c[0]);
    ok(r.flag && r.motivos[0] === 'la agenda escribió otra FECHA, HORA en esta fila',
       '"' + c[0] + '" (' + c[1] + '): queda una diferencia sin anotar → cuenta, con el motivo de siempre (dio "' + r.motivos.join('; ') + '")');
  });
  const t2 = con('FECHA, HORA', tres);
  ok(t2.flag && t2.motivos[0] === 'la agenda escribió otra FECHA, HORA, Barrio en esta fila',
     'DECISIÓN: tres diferencias con sólo dos anotadas ("FECHA, HORA"): cuenta (la del Barrio no está anotada: la exención es de todo o nada)');
  ok(!con('FECHA, HORA, Barrio', tres).flag, 'las tres anotadas: no cuenta');
  const f = con('FECHA, HORA', Object.assign({ form_origen: 'Gabino Tapia - Encuentro con vecinos - ' + dmf(R_ANA) }, dos));
  ok(f.flag && f.motivos.length === 1 && /^el formulario nombra a Gabino Tapia/.test(f.motivos[0]),
     'la exención es sólo de la agenda: con las dos anotadas pero el formulario de otra figura, la fila cuenta por el formulario ("' + f.motivos.join('; ') + '")');
  const hdrSinTocado = HDR_BASE.filter(function (h) { return h !== 'Tocado por el equipo'; });
  const Es = entornoG({ bloqueBase: [hdrSinTocado].concat(armarBase(20, { hdr: hdrSinTocado })) });
  ok(probar(Es, R_ANA, dos).flag, 'una base sin la columna "Tocado por el equipo": todo como antes, dos diferencias cuentan');
  // lo que anota la agenda de verdad (tocadoPorEquipoAgenda_, 40_Agenda.js) alcanza para la exención: se calcula con la función REAL sobre la fila ya cambiada
  const Ea = entornoG({ base: armarBase(30), conAgenda: true });
  const conAnotacionReal = function (fila, cambios) {
    const claves = Object.keys(cambios).concat(['Tocado por el equipo']), antes = {};
    claves.forEach(function (k) { antes[k] = leer(Ea, fila, k); });
    celdas(Ea, fila, cambios);
    Ea.ctx.__v = Ea.base().valores[fila - 1];
    Ea.ctx.__h = Ea.base().valores[0];
    const tocado = Ea.run('tocadoPorEquipoAgenda_(__v, indicesAgenda_(__h))');
    celdas(Ea, fila, { 'Tocado por el equipo': tocado });
    const a = alinear(Ea);
    celdas(Ea, fila, antes);
    return { tocado: tocado, flag: a.noCuadran.some(function (n) { return n.fila === fila; }) };
  };
  const r1 = conAnotacionReal(R_ANA, dos);
  const r2 = conAnotacionReal(R_ANA, tres);
  const r3 = conAnotacionReal(R_ANA, Object.assign({ agenda_direccion_escrita: 'Av. Siempreviva 742', 'Dirección': 'Calle Falsa 123' }, dos));
  ok(r1.tocado === 'FECHA, HORA' && !r1.flag && r2.tocado === 'FECHA, HORA, Barrio' && !r2.flag && r3.tocado === 'FECHA, HORA, Dirección' && !r3.flag,
     'con lo que anota la agenda de verdad ("' + r1.tocado + '" / "' + r2.tocado + '" / "' + r3.tocado + '") la fila no cuenta: el formato de la agenda y el del guardián coinciden');
}

console.log('  -- la fecha escrita por la agenda: Date, número de serie o texto (con un Barrio distinto = 1 diferencia conocida)');
const FILA_F = 8, f8 = leer(E1, FILA_F, 'FECHA'), y8 = f8.getFullYear(), m8 = f8.getMonth(), d8 = f8.getDate();   // 07/06/2026
[['un número de serie', serieDe(f8)], ['un número de serie con fracción (.5)', serieDe(f8) + 0.5],
 ['texto dd/MM/yyyy', pad(d8) + '/' + pad(m8 + 1) + '/' + y8], ['texto d/M/yyyy', d8 + '/' + (m8 + 1) + '/' + y8],
 ['texto yyyy-MM-dd', y8 + '-' + pad(m8 + 1) + '-' + pad(d8)], ['una Date con otra hora del mismo día', new Date(y8, m8, d8, 23, 30)]].forEach(function (c) {
  const r = probar(E1, FILA_F, { Barrio: 'Saavedra', agenda_fecha_escrita: c[1] });
  ok(!r.flag, 'fecha escrita como ' + c[0] + ' (el mismo día): no es una diferencia');
});
[['un número de serie +1', serieDe(f8) + 1], ['texto de otro día', pad(d8 + 1) + '/' + pad(m8 + 1) + '/' + y8], ['una Date de otro día', new Date(y8, m8, d8 + 1, 12)]].forEach(function (c) {
  const r = probar(E1, FILA_F, { Barrio: 'Saavedra', agenda_fecha_escrita: c[1] });
  ok(r.flag && r.motivos[0] === 'la agenda escribió otra FECHA, Barrio en esta fila', 'fecha escrita como ' + c[0] + ': SÍ es una diferencia (dio "' + r.motivos.join('; ') + '")');
});
[['texto ilegible', 'sin fecha'], ['vacía', ''], ['un texto numérico ("' + serieDe(f8) + '")', String(serieDe(f8))]].forEach(function (c) {
  const r = probar(E1, FILA_F, { Barrio: 'Saavedra', agenda_fecha_escrita: c[1] });
  ok(!r.flag, 'fecha escrita ' + c[0] + ': no se puede leer, no cuenta como diferencia');
});

console.log('  -- la hora: Date, fracción del día, número de serie con fecha o texto, en la fila y en lo que escribió la agenda (con un Barrio distinto)');
[['HORA Date 18:00', { HORA: H(18, 0), agenda_hora_escrita: '18:00' }], ['HORA fracción .75', { HORA: 0.75, agenda_hora_escrita: '18:00' }],
 ['HORA "18 hs"', { HORA: '18 hs', agenda_hora_escrita: '18:00' }], ['HORA "18:00 hs"', { HORA: '18:00 hs', agenda_hora_escrita: '18:00' }],
 ['HORA "18.00"', { HORA: '18.00', agenda_hora_escrita: '18:00' }], ['HORA vacía', { HORA: '', agenda_hora_escrita: '18:00' }],
 ['lo escrito como Date 18:00', { HORA: '18:00', agenda_hora_escrita: H(18, 0) }], ['lo escrito como fracción .75', { HORA: '18:00', agenda_hora_escrita: 0.75 }],
 ['lo escrito vacío', { HORA: '18:00', agenda_hora_escrita: '' }], ['lo escrito ilegible ("sin hora")', { HORA: '18:00', agenda_hora_escrita: 'sin hora' }]].forEach(function (c) {
  const r = probar(E1, FILA_F, Object.assign({ Barrio: 'Saavedra' }, c[1]));
  ok(!r.flag, c[0] + ' = 18:00 (o sin con qué comparar): no es una diferencia');
});
[['HORA "19:00" contra 18:00', { HORA: '19:00' }], ['HORA "A confirmar" (el equipo escribió un texto)', { HORA: 'A confirmar' }], ['HORA 0 (medianoche)', { HORA: 0 }]].forEach(function (c) {
  const r = probar(E1, FILA_F, Object.assign({ Barrio: 'Saavedra', agenda_hora_escrita: '18:00' }, c[1]));
  ok(r.flag && r.motivos[0] === 'la agenda escribió otra HORA, Barrio en esta fila', c[0] + ': SÍ es una diferencia (dio "' + r.motivos.join('; ') + '")');
});
{
  // una hora como número de serie CON fecha (07/06/2026 18:00 = 46180,75): se lee por su parte de hora, en los dos lados (ex HALLAZGO del 08/10, igual que valorAgendaComparable_)
  const s = serieDe(f8) + 0.75;
  [['en HORA', { HORA: s, agenda_hora_escrita: '18:00' }], ['en lo escrito por la agenda', { HORA: '18:00', agenda_hora_escrita: s }],
   ['en los dos lados', { HORA: s, agenda_hora_escrita: s }]].forEach(function (c) {
    ok(!probar(E1, FILA_F, Object.assign({ Barrio: 'Saavedra' }, c[1])).flag, 'un número de serie con fecha (' + s + ' = 18:00) ' + c[0] + ': se lee por su hora, no es una diferencia');
  });
  ok(probar(E1, FILA_F, { Barrio: 'Saavedra', HORA: serieDe(f8) + 0.8, agenda_hora_escrita: '18:00' }).flag, 'una hora serial de OTRA hora del día (19:12) contra 18:00: SÍ es una diferencia');
  ok(probar(E1, FILA_F, { Barrio: 'Saavedra', HORA: 18, agenda_hora_escrita: '18:00' }).flag,
     'DECISIÓN: un 18 suelto en HORA (sin parte decimal) se lee como 00:00, igual que valorAgendaComparable_: cuenta como una hora distinta de 18:00');
  const r = probar(E1, FILA_F, { Barrio: 'PALERMO', agenda_barrio_escrito: 'Palermo', HORA: '10:00', agenda_hora_escrita: '18:00' });
  ok(r.flag === false, 'el barrio se compara sin mayúsculas ni tildes ("PALERMO" = "Palermo"): sólo la HORA difiere → 1 diferencia, no cuenta');
  const r2 = probar(E1, FILA_F, { Barrio: 'Núñez', agenda_barrio_escrito: 'Nunez', HORA: '10:00', agenda_hora_escrita: '18:00' });
  ok(r2.flag === false, '"Núñez" = "Nunez": sin tildes');
}

console.log('  -- el formulario: la figura que nombra');
{
  const r = probar(E1, R_MACRI, { form_origen: 'Gabino Tapia - Encuentro con vecinos - ' + dmf(R_MACRI) });
  ok(r.flag && /^el formulario nombra a Gabino Tapia, no a Jorge Macri$/.test(r.motivos[0]), 'un formulario que nombra a OTRA figura: cuenta ("' + r.motivos.join('; ') + '")');
  const sinFigura = ['VÍNCULO CIUDADANO - Encuentro con vecinos sobre Seguridad - Comuna 4 - ', 'Comuna 7 - '];
  sinFigura.forEach(function (t) {
    const s = probar(E1, R_MACRI, { form_origen: t + dmf(R_MACRI) });
    ok(!s.flag, 'un formulario sin figura ("' + t.slice(0, 40) + '…"): no cuenta por la figura (y su fecha coincide)');
  });
  const conj = 'RDV - Eje norte, Lombardi-Tapia-Piragine- ';
  ok(probar(E1, R_MACRI, { form_origen: conj + dmf(R_MACRI) }).flag, 'un formulario de la conjunta Lombardi-Tapia-Piragine contra la fila de MACRI: cuenta');
  ok(probar(E1, R_ANA, { form_origen: conj + dmf(R_ANA) }).flag, '…y contra la de Ana Pereyra: cuenta');
  [[R_LOMBARDI, 'Lombardi'], [R_TAPIA, 'Tapia'], [R_ARENGO, 'Arengo']].forEach(function (c) {
    ok(!probar(E1, c[0], { form_origen: conj + dmf(c[0]) }).flag, '…contra la fila de ' + c[1] + ' (una de las tres): no cuenta (alcanza con UNA figura en común)');
  });
  // la fila de la conjunta ("Conjunta con"): la figura de la fila + las otras
  const filaConj = { 'Conjunta con': 'Gustavo Arengo Piragine / Gabino Tapia' };
  ok(!probar(E1, R_LOMBARDI, Object.assign({ form_origen: conj + dmf(R_LOMBARDI) }, filaConj)).flag,
     'la fila de la conjunta (Lombardi + "Conjunta con" Arengo y Tapia) contra el formulario de los tres: no cuenta');
  ok(!probar(E1, R_LOMBARDI, Object.assign({ form_origen: 'Gabino Tapia - Encuentro con vecinos - ' + dmf(R_LOMBARDI) }, filaConj)).flag,
     '…contra el formulario de UNO solo de los tres (Tapia): no cuenta (las figuras de la fila son las tres)');
  const x = probar(E1, R_LOMBARDI, Object.assign({ form_origen: 'Ana Pereyra - Encuentro con vecinos - ' + dmf(R_LOMBARDI) }, filaConj));
  ok(x.flag && /no a Hernán Lombardi$/.test(x.motivos[0]), '…y contra el de una figura que no es ninguna de las tres: cuenta (' + x.motivos.join('; ') + ')');
  ok(!probar(E1, R_MACRI, { Figura: '', form_origen: 'Gabino Tapia - Encuentro con vecinos - ' + dmf(R_MACRI) }).flag,
     'una fila SIN figura (Seguridad en tu barrio) contra un formulario que nombra a alguien: no hay figura que comparar, no cuenta');
  // una Figura que junta varias ("A - B"): cada una de las partes es una figura de la fila
  const junta = { Figura: 'Hernán Lombardi - Gabino Tapia' };
  ok(!probar(E1, R_MACRI, Object.assign({ form_origen: 'Gabino Tapia - Encuentro con vecinos - ' + dmf(R_MACRI) }, junta)).flag,
     'una Figura que junta dos ("Hernán Lombardi - Gabino Tapia") contra el formulario de UNA de las dos (Tapia): no cuenta');
  const jx = probar(E1, R_MACRI, Object.assign({ form_origen: 'Ana Pereyra - Encuentro con vecinos - ' + dmf(R_MACRI) }, junta));
  ok(jx.flag && /^el formulario nombra a Ana Pereyra, no a Hernán Lombardi - Gabino Tapia$/.test(jx.motivos[0]), '…y contra el de otra figura: cuenta ("' + jx.motivos.join('; ') + '")');
}

console.log('  -- nombres de formulario con el formato real: ninguno tiene que dar una falsa alarma');
[['JORGE MACRI - Encuentro "1 a 1" - Día 17/9 Belgrano', R_MACRI, D(17, 9), 'x|20260915'],
 ['JORGE MACRI - Encuentro Temático "Salud" Jorge Macri Eje Sur - 14/08/2026', R_MACRI, D(14, 8), 'x|20260812'],
 ['RDV - Eje norte, Lombardi-Tapia-Piragine- 30/3', R_TAPIA, D(30, 3), 'x|20260328'],
 ['Hernán Lombardi - Gustavo Arengo Piragine - 20/8', R_LOMBARDI, D(20, 8), 'x|20260818'],
 ['Ruth Landerreche - Comuna 1 Sur - 3/9', R_RUTH, D(3, 9), 'x|20260902'],
 ['VÍNCULO CIUDADANO - Encuentro con vecinos sobre Seguridad - Comuna 4 - 3/10', R_ANA, D(3, 10), 'x|20261001'],
 ['Comuna 7 - 29/7', R_MACRI, D(29, 7), 'x|20260723'],
 ['JORGE MACRI - Encuentro Temático "Orden Público"/ Seguridad - Eje Norte', R_MACRI, D(16, 7), 'x|20260714']].forEach(function (c) {
  const r = probar(E1, c[1], { FECHA: c[2], form_origen: c[0], form_clave: c[3] });
  ok(!r.flag, '"' + c[0] + '" contra su fila: no cuenta' + (r.flag ? ' (dio: ' + r.motivos.join('; ') + ')' : ''));
});

console.log('  -- el formulario: su fecha (a 21 días), la regla del mes y el cambio de año. La fila 2 es el 01/06 y su form_clave dice 30/05');
{
  const F2 = function (txt, clave) { return probar(E1, R_MACRI, { form_origen: txt, form_clave: clave === undefined ? 'x|20260530' : clave }); };
  const f22 = F2('Jorge Macri - Encuentro con vecinos - 22/6');
  const f23 = F2('Jorge Macri - Encuentro con vecinos - 23/6');
  ok(!f22.flag, 'el formulario dice 22/06 y la fila es el 01/06: 21 días → no cuenta (el borde: más de 21 es lo que cuenta)');
  ok(f23.flag && /^el formulario es del 23\/06\/2026 \(a 22 días\)$/.test(f23.motivos[0]), 'el formulario dice 23/06: 22 días → cuenta ("' + f23.motivos.join('; ') + '")');
  ok(F2('Jorge Macri - Encuentro con vecinos - 10/5').flag, 'el formulario dice 10/05 (mes del cierre, 22 días ANTES de la fila): cuenta también hacia atrás');
  ok(!F2('Jorge Macri - Encuentro con vecinos - 12/4').flag,
     'el formulario dice 12/04: el mes de abril es imposible contra un cierre de mayo (regla del mes), se descarta y se usa el cierre (30/05): no cuenta');
  ok(!F2('Jorge Macri - Reunión 10-12 hs 1/6').flag, '"Reunión 10-12 hs 1/6" con su form_clave: el mes 12 se descarta, queda el 1/6: no cuenta');
  ok(!F2('Jorge Macri - Encuentro con vecinos Palermo', 'x|20260511').flag, 'un formulario SIN fecha en el texto usa el cierre (11/05): 21 días antes → no cuenta');
  const sinFecha = F2('Jorge Macri - Encuentro con vecinos Palermo', 'x|20260510');
  ok(sinFecha.flag && /\(a 22 días\)$/.test(sinFecha.motivos[0]), '…y con el cierre a 22 días: cuenta ("' + sinFecha.motivos.join('; ') + '")');
  ok(!F2('Jorge Macri - Encuentro con vecinos Palermo', '').flag, 'sin fecha en el texto y sin form_clave: no hay con qué comparar la fecha, no cuenta');
  ok(!F2('Jorge Macri - Encuentro con vecinos Palermo', 'x|0').flag, 'form_clave sin fecha de cierre ("x|0"): igual, no cuenta');
  // cambio de año: el formulario cierra el 28/12/2025 y la reunión es el 3/1/2026
  const ca = probar(E1, R_MACRI, { FECHA: D(3, 1, 2026), form_origen: 'Jorge Macri - Encuentro con vecinos - 3/1', form_clave: 'x|20251228' });
  ok(!ca.flag, 'cambio de año: cierre 28/12/2025, el nombre dice 3/1 y la fila es el 03/01/2026 → el año sale del cierre (+1): no cuenta');
  const caMal = probar(E1, R_MACRI, { FECHA: D(3, 1, 2026), form_origen: 'Jorge Macri - Encuentro con vecinos - 3/1', form_clave: 'x|20241228' });
  ok(caMal.flag, '…y con el cierre del año ANTERIOR (28/12/2024) el formulario es de enero de 2025, a 365 días de la fila: cuenta');
}

console.log('  -- sin form_clave (las filas escritas antes de la columna, o con traza ambigua): no hay cierre y NO hay chequeo de fecha; la figura se sigue mirando');
{
  const sinClave2026 = probar(E1, R_MACRI, { form_clave: '' });
  ok(!sinClave2026.flag, 'una fila de 2026 sin form_clave y con su formulario del mismo día: no cuenta');
  const sinClave2025 = probar(E1, R_MACRI, { FECHA: D(5, 7, 2025), form_origen: 'Jorge Macri - Encuentro con vecinos - 5/7', form_clave: '' });
  ok(!sinClave2025.flag, '(ex BUG 1, arreglado el 09/10) sin form_clave, una fila del año pasado (05/07/2025) con su formulario del MISMO día no cuenta (dio: "' + sinClave2025.motivos.join('; ') + '")');
  const horario = probar(E1, R_MACRI, { form_origen: 'Jorge Macri - Reunión 10-12 hs 1/6', form_clave: '' });
  ok(!horario.flag, '(ex BUG 1) sin form_clave, "Reunión 10-12 hs 1/6" contra la fila del 01/06 no cuenta (dio: "' + horario.motivos.join('; ') + '")');
  // segunda revisión (09/10): sin form_clave NO se mira la fecha del formulario (antes: la fila de ancla); sólo la figura
  [['28/6', 'a 27 días de la fila (el 01/06)'], ['2/5', 'de un mes anterior al de la fila'], ['25/12', 'de otro mes'], ['10-12 hs 28/6', 'con un horario y a 27 días']].forEach(function (c) {
    const r = probar(E1, R_MACRI, { form_origen: 'Jorge Macri - Encuentro con vecinos - ' + c[0], form_clave: '' });
    ok(!r.flag && r.motivos.length === 0, 'DECISIÓN: sin form_clave, un formulario que dice ' + c[0] + ' (' + c[1] + ') no cuenta: no hay chequeo de fecha sin el cierre');
  });
  const nunca = ['28/6', '2/5', '25/12', '10-12 hs 28/6', '1/1/2020'].every(function (f) {
    return !probar(E1, R_MACRI, { form_origen: 'Jorge Macri - Encuentro con vecinos - ' + f, form_clave: '' }).motivos.some(function (m) { return /^el formulario es del/.test(m); });
  });
  ok(nunca, 'una fila con form_origen y sin form_clave NUNCA da "el formulario es del …"');
  const fig = probar(E1, R_MACRI, { form_origen: 'Gabino Tapia - Encuentro con vecinos - 1/6', form_clave: '' });
  ok(fig.flag && fig.motivos.length === 1 && /^el formulario nombra a Gabino Tapia, no a Jorge Macri$/.test(fig.motivos[0]), 'pero la figura sí se mira: un formulario de otra figura sin form_clave cuenta ("' + fig.motivos.join('; ') + '")');
  const conClave = probar(E1, R_MACRI, { form_origen: 'Jorge Macri - Encuentro con vecinos - 28/6', form_clave: 'x|20260530' });
  ok(conClave.flag && /\(a 27 días\)$/.test(conClave.motivos[0]), 'y con form_clave el mismo formulario (28/6 contra la fila del 01/06) sí cuenta por la fecha ("' + conClave.motivos.join('; ') + '")');
}

console.log('  -- qué cuenta como fila "con traza" (la base del 5%)');
{
  // filas 2-4 sólo formulario, 5-7 sólo agenda, 8-9 las dos, 10-11 ninguna
  const E = entornoG({ base: armarBase(10, { traza: function (i) { return { form: i < 3 || (i >= 6 && i < 8), agenda: i >= 3 && i < 8 }; } }) });
  const a = alinear(E);
  ok(a.trazadas === 8 && a.noCuadran.length === 0, 'formulario solo (3), agenda sola (3) y las dos (2) cuentan UNA vez cada una; sin ninguna (2) no cuenta: ' + a.trazadas + ' con traza');
  celdas(E, 10, { Figura: 'Gabino Tapia', FECHA: D(25, 12), HORA: '03:00', Barrio: 'Flores' });
  celdas(E, 11, { Figura: 'Ruth Landerreche', FECHA: D(1, 1), HORA: '04:00', Barrio: 'Núñez' });
  const b = alinear(E);
  ok(b.trazadas === 8 && b.noCuadran.length === 0, 'una fila SIN traza no se mide, aunque sus datos sean cualquier cosa (no hay contra qué)');
  // una fila con las dos trazas rotas: UNA sola entrada con los dos motivos
  celdas(E, 8, { form_origen: 'Ana Pereyra - Encuentro con vecinos - ' + dm(E, 8), HORA: '03:00', Barrio: 'Flores' });
  const c = alinear(E);
  const x = c.noCuadran.filter(function (n) { return n.fila === 8; })[0];
  ok(c.noCuadran.length === 1 && x && x.motivos.length === 2 && c.trazadas === 8,
     'una fila rota por el formulario Y por la agenda: UNA entrada con los dos motivos, y sigue contando una vez en las con traza');
}

console.log('  -- el umbral por cantidad: máx(5, 5% de las filas con traza), en el borde');
const G = entornoG({ base: armarBaseGrande() });   // 803 filas con las dos trazas: el umbral por cantidad es 41
{
  const rotasEn = function (E, n, k) {
    const lista = [];
    for (let j = 0; j < k; j++) { const fila = 2 + j * Math.floor(n / k); lista.push([fila, rotaForm(E, fila)]); }
    return probarVarias(E, lista);
  };
  [[20, 4, 'alineada'], [20, 5, 'DESALINEADA'], [101, 5, 'alineada'], [101, 6, 'DESALINEADA']].forEach(function (c) {
    const a = rotasEn(entornoG({ base: armarBase(c[0]) }), c[0], c[1]);
    ok(a.noCuadran.length === c[1] && a.racha === 1 && a.veredicto === c[2],
       c[0] + ' filas con traza, ' + c[1] + ' sueltas que no cuadran: umbral ' + a.umbral + ' → "' + a.veredicto + '" (esperado "' + c[2] + '")');
  });
  [[803, 40, 'alineada'], [803, 41, 'DESALINEADA']].forEach(function (c) {
    const a = rotasEn(G, c[0], c[1]);
    ok(a.noCuadran.length === c[1] && a.racha === 1 && a.veredicto === c[2],
       c[0] + ' filas con traza, ' + c[1] + ' sueltas que no cuadran: umbral ' + a.umbral + ' → "' + a.veredicto + '" (esperado "' + c[2] + '")');
  });
  ok(alinear(entornoG({ base: armarBase(60) })).umbral === 5 && alinear(entornoG({ base: armarBase(120) })).umbral === 6 && alinear(G).umbral === 41,
     'los umbrales: 60 filas → 5 (el mínimo), 120 → 6 (5%), 803 → 41 (⌈40,15⌉)');
  ok(alinear(G).racha === 0 && alinear(G).veredicto === 'alineada', 'la base de 803 filas, sana: racha 0, "alineada"');
}

console.log('  -- la racha: 6 o más filas SEGUIDAS (por número de fila) que no cuadran alcanzan, aunque no lleguen al umbral');
let rachaReprog = null;   // la racha más larga de filas seguidas con 41 ediciones sueltas del equipo (se mide abajo)
{
  const seguidas = function (desde, k) { const l = []; for (let j = 0; j < k; j++) l.push([desde + j, rotaForm(G, desde + j)]); return l; };
  [[5, 'alineada'], [6, 'DESALINEADA'], [7, 'DESALINEADA'], [12, 'DESALINEADA']].forEach(function (c) {
    const a = probarVarias(G, seguidas(100, c[0]));
    ok(a.noCuadran.length === c[0] && a.racha === c[0] && a.racha === racha(a) && a.umbral === 41 && a.veredicto === c[1],
       c[0] + ' filas SEGUIDAS que no cuadran (umbral por cantidad 41): racha ' + a.racha + ' → "' + a.veredicto + '" (esperado "' + c[1] + '")');
  });
  const sueltas = probarVarias(G, [100, 102, 104, 106, 108, 110].map(function (f) { return [f, rotaForm(G, f)]; }));
  ok(sueltas.noCuadran.length === 6 && sueltas.racha === 1 && sueltas.veredicto === 'alineada', '6 que no cuadran pero SUELTAS (una cada 2 filas): racha 1 → "alineada"');
  const dosRachas = probarVarias(G, seguidas(100, 5).concat(seguidas(200, 5)));
  ok(dosRachas.noCuadran.length === 10 && dosRachas.racha === 5 && dosRachas.veredicto === 'alineada', 'dos rachas de 5 en lugares distintos: la racha es la más larga (5), no la suma → "alineada"');
  const sinTraza = { form_origen: '', form_clave: '', agenda_uid: '', agenda_fecha_escrita: '', agenda_hora_escrita: '', agenda_barrio_escrito: '' };
  const corte = probarVarias(G, seguidas(100, 5).concat([[105, sinTraza]], seguidas(106, 5)));
  ok(corte.noCuadran.length === 10 && corte.racha === 5 && corte.veredicto === 'alineada' && corte.noCuadran.every(function (x) { return x.fila !== 105; }),
     'HALLAZGO: se cuenta por NÚMERO DE FILA: dos tandas de 5 rotas con UNA fila sin traza en el medio (la 105: no se puede medir) dan racha 5, no 10 → "alineada". Una fila sin traza corta la racha');

  console.log('  -- las falsas alarmas de la racha');
  const sem = 300, nf = function (fila) { const f = leer(G, fila, 'FECHA'); return new Date(f.getFullYear(), f.getMonth(), f.getDate() + 1, 12); };
  // el equipo corrige 6 filas SEGUIDAS de la misma semana, cada una con UNA diferencia
  const unaCadaUna = probarVarias(G, [[sem, { HORA: '10:00' }], [sem + 1, { Barrio: 'Saavedra' }], [sem + 2, { FECHA: nf(sem + 2) }], [sem + 3, { HORA: '09:30' }],
                                      [sem + 4, { Barrio: 'Villa Real' }], [sem + 5, { FECHA: nf(sem + 5) }], [sem + 6, { HORA: '20:00' }], [sem + 7, { Barrio: 'Mataderos' }]]);
  ok(unaCadaUna.noCuadran.length === 0 && unaCadaUna.racha === 0 && unaCadaUna.veredicto === 'alineada',
     '8 filas seguidas corregidas por el equipo, cada una con UNA sola diferencia (hora, barrio o fecha): no cuenta ninguna, racha 0 → "alineada"');
  // 6 seguidas con DOS diferencias (FECHA + HORA): sin "Tocado por el equipo" cuentan; con la anotación de la agenda, no
  const reprogramar = function (desde, k, tocado) {
    const l = [];
    for (let j = 0; j < k; j++) { const c = { FECHA: nf(desde + j), HORA: '10:00' }; if (tocado) c['Tocado por el equipo'] = tocado; l.push([desde + j, c]); }
    return probarVarias(G, l);
  };
  const sinAnotar = reprogramar(sem, 6, ''), anotadas = reprogramar(sem, 6, 'FECHA, HORA'), cinco = reprogramar(sem, 5, '');
  ok(anotadas.noCuadran.length === 0 && anotadas.racha === 0 && anotadas.veredicto === 'alineada',
     'el equipo reprograma 6 reuniones seguidas (FECHA y HORA) y la agenda ya anotó "Tocado por el equipo = FECHA, HORA": no cuentan → "alineada"');
  ok(sinAnotar.noCuadran.length === 6 && sinAnotar.racha === 6 && sinAnotar.veredicto === 'DESALINEADA' && cinco.veredicto === 'alineada',
     'HALLAZGO: las mismas 6 reprogramaciones seguidas SIN anotar todavía (la agenda anota en su corrida de cada hora) dan DESALINEADA por la racha mientras tanto (con 5, "alineada")');
  // una reprogramación LARGA de 6 reuniones seguidas: el formulario conserva la fecha vieja y la fila se corre más de 21 días
  const larga = function (tocado) {
    const l = [];
    for (let j = 0; j < 6; j++) {
      const f = leer(G, sem + j, 'FECHA'), c = { FECHA: new Date(f.getFullYear(), f.getMonth(), f.getDate() + 30, 12) };
      if (tocado) c['Tocado por el equipo'] = tocado;
      l.push([sem + j, c]);
    }
    return probarVarias(G, l);
  };
  const l1 = larga(''), l2 = larga('FECHA');
  ok(l1.noCuadran.length === 6 && l1.racha === 6 && l1.veredicto === 'DESALINEADA' && l2.noCuadran.length === 6 && l2.veredicto === 'DESALINEADA' &&
     /^el formulario es del .* \(a 30 días\)$/.test(l1.noCuadran[0].motivos[0]),
     'HALLAZGO: 6 reuniones seguidas pospuestas 30 días (el formulario conserva la fecha vieja) dan DESALINEADA, con o sin "Tocado por el equipo = FECHA" (la exención es sólo de la agenda): ' +
     'una pospuesta suelta es una falsa alarma más; seis seguidas, una racha');
  // las 41 reprogramaciones SUELTAS (una cada ~19 filas, como en la vida real): sin anotar, el umbral por cantidad; anotadas, nada
  const reprog = function (k, tocado) {
    const l = [];
    for (let j = 0; j < k; j++) {
      const fila = 2 + j * Math.floor(803 / k), c = { FECHA: nf(fila), HORA: '10:00' };
      if (tocado) c['Tocado por el equipo'] = 'FECHA, HORA';
      l.push([fila, c]);
    }
    return probarVarias(G, l);
  };
  const r40 = reprog(40, false), r41 = reprog(41, false), a41 = reprog(41, true);
  rachaReprog = r41.racha;
  ok(r40.noCuadran.length === 40 && r40.veredicto === 'alineada' && r41.noCuadran.length === 41 && r41.veredicto === 'DESALINEADA' && r41.racha === 1,
     'sin "Tocado por el equipo", como antes: 41 reprogramaciones sueltas (FECHA un día corrida y otra HORA) de 803 dan DESALINEADA (con 40, "alineada"), en rachas de 1');
  ok(a41.noCuadran.length === 0 && a41.veredicto === 'alineada',
     'con "Tocado por el equipo = FECHA, HORA" en esas 41 filas (ex HALLAZGO del 08/10): ninguna cuenta → una base sana "alineada"; las reprogramaciones ya no se acumulan');
}

console.log('  -- las entradas, y bases sin las columnas');
{
  const x = probar(E1, R_ANA, { form_origen: 'Gabino Tapia - Encuentro con vecinos - ' + dmf(R_ANA) });
  const e = x.a.noCuadran[0];
  ok(e.fila === R_ANA && e.figura === 'Ana Pereyra' && e.fecha && dmy(e.fecha) === '05/06/2026' && e.motivos.length === 1 && x.a.racha === 1,
     'cada entrada trae la fila (número de la planilla), la figura, la fecha y los motivos (fila ' + e.fila + ', ' + e.figura + ', ' + dmy(e.fecha) + '); el resultado, la racha (1)');
  const sinFecha = probar(E1, R_ANA, { FECHA: '', form_origen: 'Gabino Tapia - Encuentro con vecinos - 5/6' });
  const e2 = sinFecha.a.noCuadran.filter(function (n) { return n.fila === R_ANA; })[0];
  ok(sinFecha.flag && e2.fecha === null, 'una fila sin FECHA se mide igual por la figura (y la entrada trae fecha null)');
  const agenda = E1.cfg('COLUMNAS_AGENDA'), traza = E1.cfg('COLUMNAS_TRAZA');
  const hdrSinAgenda = HDR_BASE.filter(function (h) { return agenda.indexOf(h) < 0; });
  const hdrSinNada = hdrSinAgenda.filter(function (h) { return traza.indexOf(h) < 0; });
  const E = entornoG({ bloqueBase: [hdrSinAgenda].concat(armarBase(20, { hdr: hdrSinAgenda, agenda: false })) });
  const a = alinear(E);
  ok(a.trazadas === 20 && a.noCuadran.length === 0 && a.racha === 0, 'una base sin las columnas de la agenda: sólo mira el formulario (20 con traza, 0 que no cuadran)');
  romper(E, [3]);
  ok(alinear(E).noCuadran.length === 1, '…y lo ve igual si un formulario nombra a otra figura');
  const E0 = entornoG({ bloqueBase: [hdrSinNada].concat(armarBase(20, { hdr: hdrSinNada, form: false, agenda: false })) });
  const a0 = alinear(E0);
  ok(a0.trazadas === 0 && a0.noCuadran.length === 0 && a0.racha === 0 && a0.veredicto === 'alineada', 'una base sin NINGUNA columna de traza (nunca corrió el upsert): 0 con traza, racha 0, "alineada", sin romperse');
}

// ===================================================================================================================
console.log('[2] pruebaOrdenParcial_: ordenar sólo las columnas del equipo contra ordenar filas enteras');
{
  const E = entornoG({ base: armarBase(120) });
  const antes = JSON.stringify(E.base().valores);
  const llamadas = vigilar(E);
  const p = pruebaOrden(E);
  ok(p.filas === 120 && p.columnasSistema === 22, 'una base de 120 filas: la prueba deja quietas 22 columnas (6 de traza + 16 de la agenda) y no cuenta ninguna derivada');
  ok(p.como === 'por Figura y FECHA' && p.movidas >= 0.2 * 120, 'ordena "por Figura y FECHA" (la base está por fecha): ' + p.movidas + ' de 120 filas cambian de lugar');
  ok(p.hoy.noCuadran.length === 0 && p.hoy.racha === 0 && p.hoy.veredicto === 'alineada', 'hoy: 0 que no cuadran, racha 0, "alineada"');
  ok(p.parcial.veredicto === 'DESALINEADA' && p.parcial.noCuadran.length >= 0.9 * 120, 'orden PARCIAL: ' + p.parcial.noCuadran.length + ' de 120 no cuadran (racha ' + p.parcial.racha + ') → DESALINEADA');
  ok(p.entera.noCuadran.length === p.hoy.noCuadran.length && p.entera.veredicto === p.hoy.veredicto, 'orden de FILAS ENTERAS: lo mismo que hoy (' + p.entera.noCuadran.length + ', ' + p.entera.veredicto + ')');
  ok(JSON.stringify(E.base().valores) === antes && E.base().escrituras.length === 0 && llamadas.length === 0, 'la prueba es en memoria: la base no cambió, no se escribió nada ni se llamó a ningún método de escritura');
  // la prueba CHICA (09/10): el mismo orden parcial, sólo sobre las últimas GUARDIAN_FILAS_PRUEBA_CHICA_ filas de datos (el mes activo); la racha es lo que la ve
  ok(E.cfg('GUARDIAN_FILAS_PRUEBA_CHICA_') === 30, 'GUARDIAN_FILAS_PRUEBA_CHICA_ = 30 (el mes activo)');
  ok(p.chicoMovidas >= 20 && p.chicoMovidas <= 30, 'la prueba chica mueve ' + p.chicoMovidas + ' de las últimas 30 filas de datos (las demás quedan quietas)');
  ok(p.chico.veredicto === 'DESALINEADA' && p.chico.racha >= 6 && p.chico.noCuadran.length >= 20 && p.chico.noCuadran.length <= 30 &&
     p.chico.noCuadran.every(function (x) { return x.fila >= 92; }),
     'prueba CHICA: ' + p.chico.noCuadran.length + ' no cuadran, todas entre las filas 92 y 121 (las últimas 30), en una racha de ' + p.chico.racha + ' → DESALINEADA');
  const m = E.run('medirGuardian()');
  ok(m.detecta === true && m.veredictoHoy === 'alineada' && m.hoy === 0 && m.rachaHoy === 0 && m.trazadas === 120 && m.parcial === p.parcial.noCuadran.length && m.entera === 0 && m.veredictoParcial === 'DESALINEADA',
     'medirGuardian() lo resume igual: detecta, hoy 0 de 120 (racha 0), parcial ' + m.parcial + ' (DESALINEADA), entera 0');
  ok(m.chico === p.chico.noCuadran.length && m.detectaChico === true, 'y la prueba chica: chico = ' + m.chico + ' que no cuadran, detectaChico = true');
  const log = E.log();
  ok(/filas con traza 120 \| no cuadran 0 \(umbral de "desalineada": 6, o 6 seguidas; la racha más larga: 0\) → ALINEADA/.test(log) &&
     new RegExp('GRANDE: se ordenan sólo las columnas del equipo por Figura y FECHA \\(' + p.movidas + ' de 120 filas cambian de lugar\\); las 22 del sistema quedan quietas').test(log) &&
     new RegExp('no cuadran ' + m.parcial + ' \\(hoy 0: salto ' + m.parcial + '; umbral 6\\) → DESALINEADA').test(log),
     'el log: la línea de base de hoy (con el umbral, la racha que alcanza y la más larga) y la prueba GRANDE (qué se ordena, el salto respecto de hoy y el umbral)');
  ok(new RegExp('CHICO: lo mismo, sólo entre las últimas 30 filas \\(el mes activo; ' + p.chicoMovidas + ' cambian de lugar\\) → no cuadran ' + p.chico.noCuadran.length +
                ', la racha más larga ' + p.chico.racha + ' \\(con 6 seguidas es DESALINEADA\\) → DESALINEADA').test(log) &&
     /\(control: el orden de FILAS ENTERAS da 0, lo mismo que hoy —0—; no prueba nada: cada fila se mira sola\)/.test(log),
     'la prueba CHICO (cuántas se mueven, cuántas no cuadran, la racha) y el control de las filas enteras, que dice que no prueba nada');
  ok(/>>> GRANDE: se ve \(el orden parcial suma \d+ filas que no cuadran\)\./.test(log) && />>> CHICO: se ve \(la racha\)\./.test(log) && m.veredictoChico === 'DESALINEADA' && llamadas.length === 0,
     'y los dos veredictos: "GRANDE: se ve" y "CHICO: se ve (la racha)" (medirGuardian tampoco escribe nada)');
}

console.log('  -- la base ya ordenada por Figura y FECHA: la prueba usa el orden inverso (si no, no probaría nada)');
{
  const iF = HDR_BASE.indexOf('Figura'), iD = HDR_BASE.indexOf('FECHA');
  const porFiguraYFecha = function (filas) {
    return filas.slice().sort(function (a, b) {
      const ka = sinTildes(a[iF]) + '|' + ymd8(a[iD]), kb = sinTildes(b[iF]) + '|' + ymd8(b[iD]);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  };
  const E = entornoG({ base: porFiguraYFecha(armarBase(120)) });
  const p = pruebaOrden(E);
  ok(/^al revés/.test(p.como) && p.movidas === 120, 'ordenada de entrada → "' + p.como + '" (' + p.movidas + ' de 120 se mueven)');
  ok(p.hoy.noCuadran.length === 0 && p.parcial.veredicto === 'DESALINEADA' && p.entera.noCuadran.length === 0, 'y igual se ve: hoy 0, parcial ' + p.parcial.noCuadran.length + ' (DESALINEADA), entera 0');
  ok(p.chicoMovidas > 0 && p.chico.veredicto === 'DESALINEADA',
     'la prueba chica también prueba algo cuando el mes activo ya está ordenado: mueve ' + p.chicoMovidas + ' de las últimas 30 y da ' + p.chico.noCuadran.length + ' que no cuadran, racha ' + p.chico.racha + ' → ' + p.chico.veredicto);
  // el borde del 20%: con 24 filas fuera de lugar (12 pares) de 120 NO es "casi ordenada" (movidas < 0,2·n); con 22 (11 pares), sí
  const intercambiar = function (filas, pares) {
    const r = filas.slice();
    for (let j = 0; j < pares; j++) { const a = 10 * j, b = 10 * j + 5; const t = r[a]; r[a] = r[b]; r[b] = t; }
    return r;
  };
  const sorted = porFiguraYFecha(armarBase(120));
  const p11 = pruebaOrden(entornoG({ base: intercambiar(sorted, 11) }));
  const p12 = pruebaOrden(entornoG({ base: intercambiar(sorted, 12) }));
  ok(p11.movidas === 120 && /^al revés/.test(p11.como), '11 pares fuera de lugar (22 de 120, el 18%): "casi ordenada" → al revés');
  ok(p12.movidas === 24 && p12.como === 'por Figura y FECHA', '12 pares (24 de 120, justo el 20%): ya no es "casi ordenada" → por Figura y FECHA, mueve esas 24 (dio ' + p12.movidas + ')');
  ok(p12.parcial.noCuadran.length >= 24 && p12.parcial.veredicto === 'DESALINEADA' && p12.hoy.noCuadran.length === 0,
     '…y con sólo 24 filas movidas el parcial igual da DESALINEADA (' + p12.parcial.noCuadran.length + ' de 120 no cuadran: pasa el umbral de 6)');
}

console.log('  -- filas sin traza, bases chicas, las derivadas y las columnas de los IDs');
{
  const E = entornoG({ base: armarBase(100, { traza: function (i) { return { form: i % 2 === 0, agenda: i % 2 === 0 }; } }) });
  const p = pruebaOrden(E);
  const soloConTraza = Array.prototype.every.call(p.parcial.noCuadran, function (x) { return (x.fila - 2) % 2 === 0; });
  ok(p.hoy.trazadas === 50 && p.parcial.trazadas === 50 && p.entera.trazadas === 50, 'la mitad de las filas sin traza: sólo 50 cuentan en las tres lecturas');
  ok(soloConTraza && p.parcial.noCuadran.length > 0, 'las que no cuadran son SÓLO filas que tenían traza (' + p.parcial.noCuadran.length + '): una fila sin traza nunca cuenta, ni siquiera si recibe datos ajenos');
  // sin ninguna traza: la autoprueba no concluye (ex HALLAZGO del 08/10: decía "OJO: no separa los órdenes")
  const E0 = entornoG({ base: armarBase(100, { form: false, agenda: false }) });
  const p0 = pruebaOrden(E0), m0 = E0.run('medirGuardian()');
  ok(p0.hoy.trazadas === 0 && p0.parcial.noCuadran.length === 0 && p0.parcial.veredicto === 'alineada', 'una base SIN trazas: nada que ver (0 con traza, parcial "alineada")');
  ok(m0.detecta === null && m0.detectaChico === null && />>> GRANDE: NO CONCLUYENTE: la base no tiene filas con traza\./.test(E0.log()) &&
     />>> CHICO: NO CONCLUYENTE: la base no tiene filas con traza\./.test(E0.log()) && !/NO se ve/.test(E0.log()),
     'sin filas con traza medirGuardian() dice "NO CONCLUYENTE: la base no tiene filas con traza" en GRANDE y en CHICO (detecta y detectaChico = null: el único caso en que detecta es null), no "NO se ve"');
  // base chica
  const chica = function (n) { return pruebaOrden(entornoG({ base: armarBase(n) })); };
  const c4 = chica(4), c5 = chica(5), c8 = chica(8);
  ok(c4.parcial.noCuadran.length === 4 && c4.parcial.racha === 4 && c4.parcial.veredicto === 'alineada',
     'DECISIÓN: con 4 filas con traza no hay orden que dé DESALINEADA (el mínimo es 5 y la racha pide 6): las 4 no cuadran, en racha de 4, y el veredicto es "alineada"');
  ok(c5.parcial.noCuadran.length === 5 && c5.parcial.veredicto === 'DESALINEADA', '5 filas: las 5 no cuadran ≥ 5 → DESALINEADA');
  ok(c4.chico.noCuadran.length === 4 && c4.chico.veredicto === 'alineada' && c5.chico.veredicto === 'DESALINEADA' && c4.chicoMovidas > 0,
     'la prueba chica con menos de 30 filas usa todas las que hay: 4 → ' + c4.chico.noCuadran.length + ' que no cuadran ("alineada"), 5 → "' + c5.chico.veredicto + '"');
  ok(c8.parcial.noCuadran.length >= 5 && c8.parcial.veredicto === 'DESALINEADA', '8 filas: ' + c8.parcial.noCuadran.length + ' no cuadran ≥ 5 → DESALINEADA');
  const m4 = entornoG({ base: armarBase(4) });
  const mm4 = m4.run('medirGuardian()');
  ok(mm4.detecta === false && mm4.detectaChico === false && />>> GRANDE: NO se ve \(suma 4, menos que el umbral\): mirar los números\./.test(m4.log()) &&
     />>> CHICO: NO se ve: un orden parcial del mes activo pasaría sin que lo note esta medición\./.test(m4.log()),
     'con 4 filas con traza (hoy "alineada") el orden parcial suma 4, menos que el umbral de 5: detecta = false, detectaChico = false y el log dice "GRANDE: NO se ve (suma 4…)" y "CHICO: NO se ve"');
  ok(chica(1).movidas === 0 && chica(1).parcial.veredicto === 'alineada', 'una base de 1 fila no se rompe (movidas 0, "alineada")');
  const mv = entornoG({ base: [] }).run('medirGuardian()');
  ok(mv.trazadas === 0 && mv.hoy === 0 && mv.veredictoHoy === 'alineada' && mv.detecta === null && mv.detectaChico === null && mv.inventario.columnas.length === 34,
     'una base vacía (sólo el encabezado) no rompe nada: 0 con traza, "alineada", no concluyente (detecta y detectaChico null) y las 34 columnas del sistema');
  // las derivadas y los IDs
  const hdr = E.base().valores[0];
  E.ctx.__hdr = hdr;
  const cols = E.run('columnasDelSistema_(__hdr)');
  const grupos = {};
  Array.prototype.forEach.call(cols, function (x) { grupos[x.grupo] = (grupos[x.grupo] || 0) + 1; });
  ok(grupos.derivadas === 12 && grupos.traza === 6 && grupos.agenda === 16 && !grupos.ids, 'columnasDelSistema_: 12 derivadas (las once y la ID de Looker), 6 de traza, 16 de agenda y ningún ID (la base no los tiene)');
  const quietas = columnasQuietas(E, hdr);
  ok(quietas.length === 22 && quietas.every(function (k) { return ['Día de la semana', 'ID', 'Comuna', 'Zona', '% de Asistencia'].indexOf(hdr[k]) < 0; }),
     'la prueba deja quietas las 22 del sistema (traza y agenda) y ninguna derivada: ésas viajan con la fila del equipo');
  const Ei = entornoG({ base: armarBase(60), columnasExtra: ['ID cuentas', 'Fecha envío campañas'] });
  ok(pruebaOrden(Ei).columnasSistema === 24, 'con "ID cuentas" y "Fecha envío campañas" en la base: 24 columnas quietas (los IDs también son del sistema)');
}

console.log('  -- órdenes parciales REALISTAS sobre la base de la escala real (803 filas; la agenda sólo en las últimas 150)');
{
  const N = 803;
  const E = entornoG({ base: armarBaseGrande({ traza: function (i) { return { form: true, agenda: i >= N - 150 }; } }) });
  const b0 = bloqueDe(E);
  const hoy = alinearBloque(E, b0);
  ok(hoy.trazadas === N && hoy.noCuadran.length === 0, 'la base de partida: 803 con traza, 0 que no cuadran');
  // toda la base: se ve siempre
  const desc = ordenPorFecha(b0, true);
  const t1 = alinearBloque(E, parcialCon(E, b0, desc));
  const t2 = alinearBloque(E, parcialCon(E, b0, desc, ['Figura']));
  ok(t1.veredicto === 'DESALINEADA' && t1.noCuadran.length > 0.9 * N, 'toda la base por FECHA descendente (con la columna Figura): ' + t1.noCuadran.length + ' de 803 no cuadran → DESALINEADA');
  ok(t2.veredicto === 'DESALINEADA' && t2.noCuadran.length > 0.9 * N, '…sin seleccionar la columna Figura: ' + t2.noCuadran.length + ' → DESALINEADA (se ve por las fechas y la agenda)');
  const porBarrio = b0.slice(1).map(function (r, i) { return i; }).sort(function (a, b) {
    const ka = sinTildes(b0[a + 1][1]), kb = sinTildes(b0[b + 1][1]); return ka < kb ? -1 : ka > kb ? 1 : a - b; });
  const t3 = alinearBloque(E, parcialCon(E, b0, porBarrio));
  ok(t3.veredicto === 'DESALINEADA' && t3.noCuadran.length > 0.9 * N, 'toda la base por Barrio: ' + t3.noCuadran.length + ' de 803 → DESALINEADA');
  const asc = alinearBloque(E, parcialCon(E, b0, ordenPorFecha(b0, false)));
  ok(asc.noCuadran.length === 0 && asc.veredicto === 'alineada', 'ordenar por FECHA ascendente una base que ya está por fecha no mueve nada: 0 que no cuadran (ninguna falsa alarma)');
  // un orden parcial que mueve POCAS filas: dos filas que se intercambian el equipo (alguien arrastró una fila a otro lugar)
  const orden2 = b0.slice(1).map(function (r, i) { return i; });
  orden2[100] = 600; orden2[600] = 100;
  const s2 = alinearBloque(E, parcialCon(E, b0, orden2));
  ok(s2.noCuadran.length === 2 && s2.noCuadran[0].fila === 102 && s2.noCuadran[1].fila === 602 && s2.racha === 1 && s2.veredicto === 'alineada',
     'HALLAZGO: dos filas con el equipo intercambiado: las dos se ven (filas 102 y 602) pero sueltas, sin racha y debajo del umbral (' + s2.umbral + ') → "alineada"');
  // las últimas filas (el equipo ordena "lo de esta semana"): el umbral por cantidad (5% de TODA la base) no las ve, la RACHA sí (ex HALLAZGO del 08/10)
  const local = function (k, sinFigura) {
    const r = alinearBloque(E, parcialCon(E, b0, ordenPorFecha(b0, true, k), sinFigura ? ['Figura'] : []));
    return { n: r.noCuadran.length, racha: r.racha, rachaIndependiente: racha(r), v: r.veredicto, umbral: r.umbral };
  };
  const l30 = local(30), l45 = local(45), l120 = local(120), l30s = local(30, true);
  ok(l45.v === 'DESALINEADA' && l120.v === 'DESALINEADA', 'las últimas 45 y 120 filas por FECHA descendente: ' + l45.n + ' y ' + l120.n + ' no cuadran → DESALINEADA');
  ok(l30.v === 'DESALINEADA' && l30.n >= 20 && l30.n < l30.umbral && l30.racha >= 6 && l30.racha === l30.rachaIndependiente,
     'ordenar sólo las últimas 30 filas (con la agenda) por FECHA descendente: ' + l30.n + ' que no cuadran (debajo del umbral de ' + l30.umbral + ') pero en una racha de ' + l30.racha + ' seguidas → DESALINEADA por la racha');
  ok(l30s.v === 'DESALINEADA' && l30s.n >= 20 && l30s.n < l30s.umbral && l30s.racha >= 6, 'lo mismo sin seleccionar la columna Figura (con la agenda): ' + l30s.n + ' que no cuadran, racha ' + l30s.racha + ' → DESALINEADA');
  // filas con SÓLO la traza del formulario (las viejas, sin agenda) y sin la columna Figura → la figura no se mueve y la fecha se corre menos de 21 días
  const Ef = entornoG({ base: armarBaseGrande({ agenda: false }) });
  const bf = bloqueDe(Ef);
  const f30 = alinearBloque(Ef, parcialCon(Ef, bf, ordenPorFecha(bf, true, 30), ['Figura']));
  const f60 = alinearBloque(Ef, parcialCon(Ef, bf, ordenPorFecha(bf, true, 60), ['Figura']));
  const fTodo = alinearBloque(Ef, parcialCon(Ef, bf, ordenPorFecha(bf, true), ['Figura']));
  ok(f30.noCuadran.length === 0 && f30.racha === 0 && f30.veredicto === 'alineada',
     'HALLAZGO: filas con SÓLO la traza del formulario, ordenando las últimas 30 por FECHA sin la columna Figura: ' + f30.noCuadran.length + ' filas que no cuadran (invisible, ni la racha lo ve). ' +
     'La figura no se movió y la fecha se corre menos de 21 días: el barrio y la hora movidos NO se miran en las filas con formulario');
  ok(f60.noCuadran.length > 0 && f60.noCuadran.length < f60.umbral && f60.racha >= 6 && f60.veredicto === 'DESALINEADA' && fTodo.veredicto === 'DESALINEADA',
     'con las últimas 60 (sólo formulario, sin Figura): ' + f60.noCuadran.length + ' que no cuadran (umbral ' + f60.umbral + ') en una racha de ' + f60.racha + ' → DESALINEADA por la racha; toda la base, ' + fTodo.noCuadran.length + ' → DESALINEADA');
  // la racha separa un desorden local de las ediciones sueltas del equipo (las 41 reprogramaciones sueltas de [1], racha 1)
  ok(l30.racha >= 6 && rachaReprog === 1, 'un desorden local deja una racha de ' + l30.racha + ' filas seguidas; las 41 ediciones sueltas del equipo de [1], una racha de ' + rachaReprog + ': la racha las separa');
  // las filas sin traza CORTAN la racha (se cuenta por número de fila): 1 de cada 5 sin traza y el mismo desorden local de 30 filas
  const Eu = entornoG({ base: armarBaseGrande({ traza: function (i) { const sin = i % 5 === 0; return { form: !sin, agenda: i >= N - 150 && !sin }; } }) });
  const bu = bloqueDe(Eu);
  const u = alinearBloque(Eu, parcialCon(Eu, bu, ordenPorFecha(bu, true, 30)));
  const entre = rachaEntreTrazadas(bu, u);
  ok(u.noCuadran.length >= 15 && u.noCuadran.length < u.umbral && u.racha < 6 && u.veredicto === 'alineada' && entre >= 6,
     'HALLAZGO: con 1 de cada 5 filas SIN traza (no se pueden medir) el mismo desorden local de 30 filas deja ' + u.noCuadran.length + ' que no cuadran en rachas de ' + u.racha +
     ' (las sin traza cortan la racha) → "alineada"; contando la racha SALTANDO las filas sin traza sería de ' + entre + ' → DESALINEADA');
  // la prueba CHICA del guardián (pruebaOrdenParcial_) sobre esas mismas bases: el orden parcial sólo de las últimas 30 filas
  const pE = pruebaOrden(E);
  ok(pE.chico.veredicto === 'DESALINEADA' && pE.chico.noCuadran.length >= 20 && pE.chico.noCuadran.length < pE.hoy.umbral && pE.chico.racha >= 6 && pE.hoy.noCuadran.length === 0,
     'la prueba CHICA sobre la base de 803 filas: ' + pE.chico.noCuadran.length + ' que no cuadran (menos que el umbral de ' + pE.hoy.umbral + ') en una racha de ' + pE.chico.racha + ' → DESALINEADA: la ve la racha, no la cantidad');
  const pU = pruebaOrden(Eu);
  ok(pU.hoy.noCuadran.length === 0 && pU.chico.noCuadran.length >= 15 && pU.chico.racha < 6 && pU.chico.veredicto === 'alineada',
     'HALLAZGO: con 1 de cada 5 filas SIN traza la prueba CHICA da ' + pU.chico.noCuadran.length + ' que no cuadran en rachas de ' + pU.chico.racha + ' → "' + pU.chico.veredicto +
     '": detectaChico sería false en una base así, aunque el desorden se vea claro; las filas sin traza cortan la racha también en la autoprueba');
}

console.log('  -- "Tocado por el equipo" no es evidencia independiente: la agenda lo recalcula con la MISMA comparación en su corrida de la hora');
{
  const N = 803;
  // filas con SÓLO traza de agenda (las nuevas, todavía sin formulario) y la base entera ordenada a medias por FECHA descendente
  const E = entornoG({ base: armarBaseGrande({ form: false }), conAgenda: true });
  const b0 = bloqueDe(E);
  const parcial = parcialCon(E, b0, ordenPorFecha(b0, true));
  const antes = alinearBloque(E, parcial);
  const anotadas = agendaAnotaTocado(E, parcial);
  const despues = alinearBloque(E, parcial);
  ok(antes.veredicto === 'DESALINEADA' && antes.noCuadran.length > 0.9 * N && anotadas > 0.9 * N && despues.noCuadran.length === 0 && despues.veredicto === 'alineada',
     'HALLAZGO IMPORTANTE: con el orden parcial recién hecho y la agenda todavía sin correr, la base de filas con sólo traza de agenda da ' + antes.noCuadran.length + ' que no cuadran → DESALINEADA. ' +
     'La corrida de la hora de la agenda anota "Tocado por el equipo" en ' + anotadas + ' filas (con su tocadoPorEquipoAgenda_) y el guardián pasa a ver ' + despues.noCuadran.length +
     ' → "alineada": la exención las da por reprogramaciones del equipo. El guardián tiene que correr ANTES de la agenda (y frenar), no después');
  // con formulario las filas se siguen viendo: la figura que nombra el formulario no depende de "Tocado por el equipo"
  const Eb = entornoG({ base: armarBaseGrande(), conAgenda: true });
  const bb = bloqueDe(Eb);
  const pb = parcialCon(Eb, bb, ordenPorFecha(bb, true));
  agendaAnotaTocado(Eb, pb);
  const db = alinearBloque(Eb, pb);
  ok(db.veredicto === 'DESALINEADA' && db.noCuadran.length > 0.7 * N,
     'las filas que además tienen formulario se siguen viendo después de la agenda: ' + db.noCuadran.length + ' de 803 (la figura y la fecha del formulario no dependen de la anotación)');
}

console.log('  -- medirGuardian() con la base YA desalineada: `detecta` es el SALTO respecto de hoy, no un "DESALINEADA" que ya estaba (ex BUG 2, arreglado el 09/10)');
{
  // 60 filas iguales en lo del equipo (nada que mover) y TODAS con un formulario que nombra a otra figura: hoy ya están desalineadas
  const filas = [];
  for (let i = 0; i < 60; i++) {
    filas.push(filaBase({ Figura: 'Jorge Macri', Barrio: 'Belgrano', EVENTO: 'Encuentro con Vecinos', FECHA: D(1, 10), HORA: '18:00',
                          form_origen: 'Gabino Tapia - Encuentro con vecinos - 1/10', form_clave: 'x|20260929' }));
  }
  filas.push(filaBase({ Figura: 'Gabino Tapia', Barrio: 'Retiro', EVENTO: 'Encuentro con Vecinos', FECHA: D(2, 10), HORA: '18:00' }));
  const E = entornoG({ base: filas });
  const m = E.run('medirGuardian()');
  const log = E.log();
  ok(m.veredictoHoy === 'DESALINEADA' && m.hoy === 60 && m.rachaHoy === 60 && m.entera === 60, 'la base de partida: hoy ' + m.hoy + ' de ' + m.trazadas + ' no cuadran (racha ' + m.rachaHoy + ') → DESALINEADA, y las filas enteras dan lo mismo (' + m.entera + ')');
  ok(/filas con traza 60 \| no cuadran 60 \(umbral de "desalineada": 5, o 6 seguidas; la racha más larga: 60\) → DESALINEADA/.test(log), 'el log dice el umbral, la racha que alcanza y la más larga (60 seguidas)');
  ok(Array.prototype.filter.call(E.logs, function (l) { return /^    fila \d+ \(/.test(l); }).length === 40 && /\(y 20 más\)/.test(log),
     'el log lista las primeras 40 que no cuadran y dice "(y 20 más)"');
  ok(m.detecta === false && m.detectaChico === null && />>> GRANDE: NO se ve \(suma -1, menos que el umbral\): mirar los números\./.test(log) &&
     />>> CHICO: NO CONCLUYENTE: la base ya está desalineada hoy\./.test(log) && !/GRANDE: se ve/.test(log),
     'con la base ya DESALINEADA y un orden parcial que no suma nada (hoy ' + m.hoy + ', parcial ' + m.parcial + ': el salto es ' + (m.parcial - m.hoy) + ', menos que el umbral de 5), detecta = ' + m.detecta +
     ' (ni true "vacío" ni null) y el log dice "GRANDE: NO se ve"; detectaChico = null porque hoy ya está DESALINEADA ("CHICO: NO CONCLUYENTE")');
  // la opción `tope` acorta (o alarga) la lista de filas que no cuadran
  const listadas = function (E2, n0) { return E2.logs.slice(n0).filter(function (l) { return /^    fila \d+ \(/.test(l); }).length; };
  const E5 = entornoG({ base: filas }), n5 = E5.logs.length;
  E5.run('medirGuardian({ tope: 5 })');
  ok(listadas(E5, n5) === 5 && /\(y 55 más\)/.test(E5.logs.slice(n5).join('\n')), 'medirGuardian({ tope: 5 }) lista sólo 5 filas que no cuadran y dice "(y 55 más)"');
  const E100 = entornoG({ base: filas }), n100 = E100.logs.length;
  E100.run('medirGuardian({ tope: 100 })');
  ok(listadas(E100, n100) === 60 && !/\(y \d+ más\)/.test(E100.logs.slice(n100).join('\n')), 'con { tope: 100 } las lista todas (60) y no dice "(y N más)"');
  // ya DESALINEADA por la CANTIDAD (60 sueltas de 803): el orden parcial SÍ suma mucho → detecta = true (ya no null)
  const G2 = entornoG({ base: armarBaseGrande() });
  romper(G2, Array.from({ length: 60 }, function (x, j) { return 2 + 13 * j; }));
  const m2 = G2.run('medirGuardian()');
  ok(m2.veredictoHoy === 'DESALINEADA' && m2.hoy === 60 && m2.rachaHoy === 1 && m2.parcial - m2.hoy >= 41 && m2.detecta === true && m2.detectaChico === null,
     'con 60 filas sueltas que no cuadran de 803 (hoy DESALINEADA por la cantidad, racha 1) el orden parcial suma ' + (m2.parcial - m2.hoy) + ' → detecta = true (ya no null: el salto sí se ve); detectaChico = null');
  // ya DESALINEADA por la RACHA (6 seguidas): igual
  const G3 = entornoG({ base: armarBaseGrande() });
  romper(G3, [100, 101, 102, 103, 104, 105]);
  const m3 = G3.run('medirGuardian()');
  ok(m3.veredictoHoy === 'DESALINEADA' && m3.hoy === 6 && m3.rachaHoy === 6 && m3.detecta === true && m3.detectaChico === null,
     'con 6 filas SEGUIDAS que no cuadran (hoy DESALINEADA por la racha, hoy 6 < 41) el orden parcial suma ' + (m3.parcial - m3.hoy) + ' → detecta = true; detectaChico = null');
}

console.log('  -- el control de "FILAS ENTERAS" (la racha puede juntar las filas que no cuadran: la línea ya no imprime un veredicto que contradiga a "hoy"; ex BUG 6, arreglado el 09/10)');
{
  // 8 filas de Macri (una cada 6) con el formulario de otra figura: hoy son SUELTAS (racha 1, 8 < 41 → "alineada"). Ordenar filas enteras por Figura y
  // FECHA no cambia CUÁLES no cuadran, pero las junta (son las primeras de Macri): la racha de esa lectura sería 8 y su veredicto, DESALINEADA.
  const E = entornoG({ base: armarBaseGrande() });
  for (let j = 0; j < 8; j++) celdas(E, 2 + 6 * j, { form_origen: 'Ana Pereyra - Encuentro con vecinos - 1/7' });
  E.ctx.__b = bloqueDe(E);
  const p = E.run('pruebaOrdenParcial_(ssDestino_().getSheetByName(RDV_HOJA_DESTINO), RDV_HOJA_DESTINO, __b)');
  const m = E.run('medirGuardian()');
  const log = E.log();
  ok(m.veredictoHoy === 'alineada' && m.hoy === 8 && m.rachaHoy === 1 && m.entera === 8 && m.detecta === true, 'la base de partida: hoy 8 sueltas de 803 (racha 1) → "alineada", las filas enteras dan el mismo conteo (8) y el orden parcial grande se ve');
  ok(p.entera.noCuadran.length === 8 && p.entera.racha === 8 && p.entera.veredicto === 'DESALINEADA',
     'el orden de filas enteras NO cambia cuáles no cuadran (8) pero las junta: su racha es ' + p.entera.racha + ' y su veredicto ' + p.entera.veredicto + ' —por eso la línea del log no tiene que imprimirlo—');
  const linea = (log.split('\n').filter(function (l) { return /FILAS ENTERAS/.test(l); })[0] || '').trim();
  ok(/da 8, lo mismo que hoy —8—; no prueba nada: cada fila se mira sola\)$/.test(linea) && !/alineada/i.test(linea),
     'la línea del log compara CONTEOS y no dice ALINEADA ni DESALINEADA (dice: "' + linea + '")');
}

// ===================================================================================================================
console.log('[3] inventarioColumnasSistema: qué cuenta y qué propone');
const EXTRA_IDS = ['ID cuentas', 'Fecha envío campañas'];
{
  const E = entornoG({ base: armarBase(3), columnasExtra: EXTRA_IDS });
  const r = E.run('inventarioColumnasSistema()');
  const por = function (g) { return Array.prototype.filter.call(r.columnas, function (x) { return x.grupo === g; }).length; };
  const col = function (n) { return Array.prototype.filter.call(r.columnas, function (x) { return x.nombre === n; })[0]; };
  ok(r.columnas.length === 36 && por('derivadas') === 12 && por('traza') === 6 && por('agenda') === 16 && por('ids') === 2,
     'la base de hoy más los IDs: 36 columnas del sistema = 12 derivadas + 6 de traza + 16 de agenda + 2 de IDs');
  ok(r.ocultas === 0 && r.protegidas === 0 && r.columnas.every(function (x) { return x.oculta === null && x.proteccion === ''; }),
     'sin isColumnHiddenByUser ni getProtections (el mock pelado): oculta = null en todas, 0 ocultas, 0 protegidas, sin romperse');
  ok(col('RDV_UID').letra === 'AP' && col('form_clave').letra === 'AU' && col('No participa').letra === 'AV' && col('agenda_status_escrito').letra === 'BD' &&
     col('Conjunta con').letra === 'BK' && col('ID cuentas').letra === 'BL' && col('ID').letra === 'Z' && col('Día de la semana').letra === 'D',
     'las letras (AP … AU, AV, BD, BK, BL, y las derivadas D y Z)');
  const prop = Array.prototype.filter.call(r.columnas, function (x) { return x.proponeOcultar; }).map(function (x) { return x.nombre; }).sort();
  const esperadas = Array.prototype.slice.call(E.cfg('GUARDIAN_PROPUESTA_OCULTAR_')).sort();
  ok(r.proponeOcultar === 14 && JSON.stringify(prop) === JSON.stringify(esperadas), 'propone ocultar las 14 internas: la traza (6) y las agenda_* (8), no las del equipo');
  const internas = Array.prototype.slice.call(E.cfg('COLUMNAS_TRAZA')).concat(Array.prototype.filter.call(E.cfg('COLUMNAS_AGENDA'), function (n) { return /^agenda_/.test(n); })).sort();
  ok(JSON.stringify(esperadas) === JSON.stringify(internas),
     'la lista de la propuesta (GUARDIAN_PROPUESTA_OCULTAR_) es EXACTAMENTE COLUMNAS_TRAZA + las agenda_* de COLUMNAS_AGENDA: si el config suma una columna interna, la propuesta se queda corta y este chequeo avisa');
  ok(['No participa', 'Origen fila', 'Tocado por el equipo', 'Evento (mail)', 'Lugar (mail)', 'Dirección (mail)', 'Marcas (mail)', 'Conjunta con', 'ID cuentas', 'Fecha envío campañas', 'ID', 'Comuna']
       .every(function (n) { return !col(n).proponeOcultar; }), 'las del equipo (No participa, Origen fila, Tocado por el equipo, las "(mail)", Conjunta con, los IDs) y las derivadas quedan a la vista');
  ok(/PROPUESTA \(mía: el texto del guardián no llegó; a confirmar\): OCULTAR las 14 internas \(AP, AQ, AR, AS, AT, AU, AW, AX, AY, AZ, BA, BB, BC, BD\)/.test(E.log()) &&
     /hoy: 36 columnas del sistema \| ocultas 0 \| con alguna protección 0/.test(E.log()) && /Nada de esto se hizo\./.test(E.log()), 'el log: las cuentas de hoy y la propuesta con sus letras ("Nada de esto se hizo")');
  const Ek = entornoG({ base: armarBase(3), columnasExtra: EXTRA_IDS });
  const rk = Ek.run('conLooker_(false, function () { return inventarioColumnasSistema(); })');
  ok(rk.columnas.length === 35 && Array.prototype.filter.call(rk.columnas, function (x) { return x.nombre === 'ID'; }).length === 0,
     'con LOOKER_EN_SISTEMA apagado la ID no es una derivada: 35 columnas (las once, no la doce)');
  const Ea = entornoG({ bloqueBase: [hdrBase(['id CUENTAS', 'Fecha envio campañas'])].concat(armarBase(3, { hdr: hdrBase(['id CUENTAS', 'Fecha envio campañas']) })) });
  const ra = Ea.run('inventarioColumnasSistema()');
  const ids = Array.prototype.filter.call(ra.columnas, function (x) { return x.grupo === 'ids'; }).map(function (x) { return x.nombre; });
  ok(JSON.stringify(ids) === JSON.stringify(['id CUENTAS', 'Fecha envio campañas']), 'los IDs con otra grafía ("id CUENTAS", "Fecha envio campañas") se encuentran por sus alias (con el nombre como está en la base)');
}

console.log('  -- con columnas ocultas y protecciones (simuladas)');
{
  const E = entornoG({ base: armarBase(3), columnasExtra: EXTRA_IDS });
  const DESC = E.cfg('DESC_PROTECCION_DERIVADAS');
  const maxFilas = E.base().maxRows;
  const derivadas = [4, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33];   // D, W, X, Y, Z, AA … AG
  const protecciones = derivadas.map(function (c) { return { desde: c, hasta: c, fila: 1, hastaFila: maxFilas, desc: DESC, advertencia: true }; })   // como las del paso 26
    .concat([{ desde: 42, hasta: 47, fila: 1, hastaFila: maxFilas, advertencia: false },                                                              // la traza: real, sin descripción
             { desde: 48, hasta: 63, fila: 2, hastaFila: maxFilas, desc: 'agenda', advertencia: true },                                               // la agenda, desde la fila 2
             { desde: 48, hasta: 48, fila: 1, hastaFila: maxFilas, desc: 'sólo yo', advertencia: false },                                            // otra encima de AV
             { desde: 1, hasta: 3, fila: 1, hastaFila: maxFilas, desc: 'A:C', advertencia: true }]);                                                 // no es del sistema
  const reg = simularHoja(E, { ocultas: [42, 43, 44, 10, 64], protecciones: protecciones });
  const r = E.run('inventarioColumnasSistema()');
  const col = function (n) { return Array.prototype.filter.call(r.columnas, function (x) { return x.nombre === n; })[0]; };
  ok(r.ocultas === 4 && col('RDV_UID').oculta === true && col('form_origen').oculta === true && col('form_score').oculta === true && col('form_nivel').oculta === false && col('ID cuentas').oculta === true,
     'ocultas: 4 del sistema (AP, AQ, AR y BL); la columna 10 ("Observaciones", del equipo) está oculta pero no es del sistema y no se cuenta');
  ok(r.protegidas === 12 + 6 + 16 && col('ID cuentas').proteccion === '' && col('Fecha envío campañas').proteccion === '',
     'protegidas: 34 de 36 (las 12 derivadas, las 6 de traza y las 16 de agenda); los IDs, ninguna; la protección de A:C no cuenta');
  ok(col('Día de la semana').proteccion === 'advertencia ("' + DESC + '")' && col('ID').proteccion === 'advertencia ("' + DESC + '")', 'una derivada: "advertencia" con su descripción');
  ok(col('RDV_UID').proteccion === 'real', 'la traza: "real" y, sin descripción, sin paréntesis');
  ok(col('agenda_uid').proteccion === 'advertencia ("agenda")' && col('No participa').proteccion === 'advertencia ("agenda"); real ("sólo yo")',
     'la agenda: "advertencia" y, donde hay dos protecciones encima (AV), las dos separadas por "; "');
  ok(JSON.stringify(Array.prototype.slice.call(reg.tipos)) === '["RANGE"]' && reg.cambios.length === 0,
     'pide las protecciones de tipo RANGE (una vez) y no oculta ni protege NADA (' + reg.cambios.length + ' llamadas a hideColumns/protect)');
  ok(r.proponeOcultar === 14, 'la propuesta no mira lo que ya está oculto: sigue proponiendo las 14 (incluidas las 3 que ya lo están)');
  ok(/ocultas 4 \| con alguna protección 34/.test(E.log()) && /\[OCULTA\]/.test(E.log()) && /\[protegida: advertencia \("agenda"\); real \("sólo yo"\)\]/.test(E.log()),
     'el log marca [OCULTA] y [protegida: …] en cada columna, y las cuentas de hoy');
}

console.log('  -- el alcance de una protección (¿cubre los datos o sólo el encabezado?) y las grafías del encabezado (ex BUG 3 y 4, arreglados el 09/10)');
{
  const E = entornoG({ base: armarBase(30), columnasExtra: EXTRA_IDS });
  const ult = E.base().valores.length;   // la última fila con datos
  // una protección de TODA la columna desde la fila 2 hasta la última con datos, y otra que cubre sólo el encabezado de todas
  simularHoja(E, { protecciones: [{ desde: 1, hasta: 65, fila: 2, hastaFila: ult, desc: 'datos', advertencia: true }] });
  ok(E.run('inventarioColumnasSistema()').protegidas === 36, 'una protección de las filas 2 a la última con datos cubre las 36 columnas');
  simularHoja(E, { protecciones: [{ desde: 1, hasta: 65, fila: 1, hastaFila: 1, desc: 'encabezado', advertencia: true }] });
  const enc = E.run('inventarioColumnasSistema()');
  ok(enc.protegidas === 0, 'una protección sólo de la fila 1 (el encabezado) no cubre los datos: protegidas es 0 (dio ' + enc.protegidas + ' de ' + enc.columnas.length + ')');
  simularHoja(E, { protecciones: [{ desde: 42, hasta: 63, fila: 1, hastaFila: 10, desc: 'un pedazo', advertencia: true }] });
  const pedazo = E.run('inventarioColumnasSistema()');
  ok(pedazo.protegidas === 0, 'una protección de las filas 1 a 10 de una base de ' + ult + ' filas no cubre la columna: protegidas es 0 (dio ' + pedazo.protegidas + ')');
  simularHoja(E, { protecciones: [{ desde: 42, hasta: 63, fila: 1, hastaFila: ult + 100, desc: 'de sobra', advertencia: true }] });
  ok(E.run('inventarioColumnasSistema()').protegidas === 22, 'una protección que llega más abajo de la última fila con datos sí cubre (las 22 columnas entre AP y BK)');

  const hdr = hdrBase().map(function (h) { return h === 'RDV_UID' ? 'rdv_uid' : h === 'agenda_uid' ? 'AGENDA_UID' : h; });
  const Eh = entornoG({ bloqueBase: [hdr, filaBase({ Figura: 'Ana Pereyra', FECHA: D(1, 10) }, hdr)] });
  const rh = Eh.run('inventarioColumnasSistema()');
  const enc2 = Array.prototype.filter.call(rh.columnas, function (x) { return /^(rdv_uid|agenda_uid)$/i.test(x.nombre); });
  ok(rh.columnas.length === 34 && enc2.length === 2, 'un encabezado con otra grafía ("rdv_uid", "AGENDA_UID") se encuentra como columna del sistema (todo el proyecto busca por encabezado normalizado)');
  ok(rh.proponeOcultar === 14, 'con "rdv_uid" y "AGENDA_UID" la propuesta sigue siendo de 14 columnas (dio ' + rh.proponeOcultar + ')');
}

console.log('  -- si pedir las protecciones falla, el inventario falla; medirGuardian() sigue sin él (inventario = { error }) y manana() lo cuenta (abajo)');
{
  const E = entornoG({ base: armarBase(120) });
  simularHoja(E, { error: 'Exception: no hay permiso para leer las protecciones' });
  let err = '';
  try { E.run('inventarioColumnasSistema()'); } catch (e) { err = String(e.message || e); }
  ok(/no hay permiso para leer las protecciones/.test(err), 'inventarioColumnasSistema() no se traga el error de getProtections: se lo pasa a quien lo llamó');
  const m = E.run('medirGuardian()');
  ok(/no hay permiso para leer las protecciones/.test(m.inventario.error) && m.inventario.columnas === undefined,
     'medirGuardian(): si el inventario falla, queda inventario = { error: "…" } (sin columnas) y no tira');
  ok(m.hoy === 0 && m.trazadas === 120 && m.veredictoHoy === 'alineada' && m.detecta === true && m.detectaChico === true && m.veredictoParcial === 'DESALINEADA',
     'y la medición sigue sin él: hoy 0 de 120 "alineada", el orden parcial grande y el chico se ven');
  ok(/el inventario de las columnas del sistema FALLÓ \(Exception: no hay permiso para leer las protecciones\): la medición sigue sin él\./.test(E.log()), 'el log lo dice');
}

// ===================================================================================================================
console.log('[4] manana(): sólo lectura, el resumen y qué pasa si un paso falla');
// El escenario de tests/ids_cuentas.test.js: 803 filas de relleno (ahora con sus trazas) y desde la 805 las del caso.
const JM = [
  ['', '', '', '', '', 'Comunicación Directa - Mail', '', '', 'Comunicación Directa - IVR', ''],
  ['ID', 'Funcionario', 'Barrio / Comuna', 'Tipo', 'Fecha', 'Fecha de envío', 'Enviados', 'Entregados', 'Fecha de envío', 'Llamados'],
  ['3735-SEPJDGAG', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(1, 10), D(25, 9), 100, 90, D(20, 9), 5],
  ['3800-OCTUNOUN', 'Jorge Macri', 'Comuna 7', 'Uno a uno', D(2, 10), '#N/A', '', '', '', ''],
  ['3801-OCTTEMAT', 'Jorge Macri', '', 'Reunión temática', D(2, 10), D(28, 9, 2062), '', '', '', '']
];
const FUN = [
  ['Información del encuentro', '', '', '', 'Mail', '', ''],
  ['ID', 'Funcionario', 'Barrio / Comuna', 'Fecha', 'Fecha de envío', 'Enviados', 'Entregados'],
  ['3700-CONJUNTA', 'Hernan Lombardi, Gustavo Arengo Piragine, Gabino Tapia', 'Núñez', D(30, 9), D(26, 9), 1, 1],
  ['3701-SEGURIDA', 'Seguridad en tu barrio', 'Comuna 4', D(3, 10), '-', '', ''],
  ['3702-TAPIAAAA', 'Gabino Tapia', 'Retiro', '07/10/2026', '01/10/26', '', ''],
  ['3703-TAPIAVIE', 'gabino tapia', 'Recoleta', D(20, 8), D(14, 8), '', ''],
  ['3704-ARENGOOO', 'Gustavo Arengo Piragine', 'Saavedra', D(1, 10), '', '', ''],
  ['', 'Gabino Tapia', 'Recoleta', D(9, 10), '', '', '']
];
/**
 * `relleno` filas de Ana Pereyra (con el formulario que cuadra; fechas repartidas en 2026) y las 8 del caso (805..812). Con
 * `barrio805` la primera de Macri (29/09) cambia de barrio; con `extraMacri` se agrega otra de Macri en Belgrano el 01/10.
 */
function baseManana(o) {
  const op = o || {};
  const b = [];
  for (let i = 0; i < (op.relleno === undefined ? 803 : op.relleno); i++) {
    const fecha = D(1 + (i % 28), 1 + (i % 8));
    const fin = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() - 2, 12);
    const nombre = 'Ana Pereyra - Encuentro con vecinos - ' + fecha.getDate() + '/' + (fecha.getMonth() + 1);
    b.push(filaBase({ Figura: 'Ana Pereyra', Barrio: 'Palermo', EVENTO: 'Encuentro con Vecinos', FECHA: fecha, HORA: HORAS[i % 4],
                      form_origen: nombre, form_clave: nombre.toLowerCase() + '|' + ymd8(fin) }));
  }
  b.push(filaBase({ Figura: 'Jorge Macri', Barrio: op.barrio805 || 'Belgrano', EVENTO: 'Encuentro con Vecinos', FECHA: D(29, 9) }));
  if (op.extraMacri) b.push(filaBase({ Figura: 'Jorge Macri', Barrio: 'Belgrano', EVENTO: 'Encuentro con Vecinos', FECHA: D(1, 10) }));
  b.push(filaBase({ Figura: 'Jorge Macri', Barrio: 'Flores', EVENTO: 'Uno a uno', FECHA: D(2, 10) }));
  b.push(filaBase({ Figura: 'Jorge Macri', Barrio: 'Caballito', EVENTO: 'Encuentro Temático "Salud"', FECHA: D(2, 10) }));
  b.push(filaBase({ Figura: 'Hernán Lombardi', Barrio: 'Núñez', EVENTO: 'Encuentro con Vecinos', FECHA: D(30, 9), 'Conjunta con': 'Gustavo Arengo Piragine / Gabino Tapia' }));
  b.push(filaBase({ Figura: '', Barrio: '', EVENTO: 'Encuentro con Vecinos', FECHA: D(3, 10), 'Evento (mail)': 'Seguridad en tu Barrio', 'Lugar (mail)': 'Comuna 4' }));
  b.push(filaBase({ Figura: 'Gabino Tapia', Barrio: 'Retiro', EVENTO: 'Encuentro con Vecinos', FECHA: D(5, 10) }));
  b.push(filaBase({ Figura: 'Gabino Tapia', Barrio: 'Recoleta', EVENTO: 'Encuentro con Vecinos', FECHA: D(20, 8) }));
  b.push(filaBase({ Figura: 'Gustavo Arengo Piragine', Barrio: 'Saavedra', EVENTO: 'Encuentro con Vecinos', FECHA: D(1, 10) }));
  return b;
}
function entornoManana(o) {
  const op = o || {};
  return entornoG(Object.assign({ base: baseManana(op.base), jm: JM, funcionarios: FUN }, op.env || {}));
}
/** Rompe `k` filas del relleno de baseManana() (una cada 10): su formulario nombra a Gabino Tapia, no a Ana Pereyra. */
function romper2(E, k) {
  for (let j = 0; j < k; j++) celdas(E, 2 + j * 10, { form_origen: 'Gabino Tapia - Encuentro con vecinos - ' + dm(E, 2 + j * 10) });
}
/** El log desde el RESUMEN, como texto. */
function resumenDe(E) {
  const l = E.log().split('\n'), i = l.findIndex(function (x) { return /manana\(\) — RESUMEN/.test(x); });
  return i < 0 ? '' : l.slice(i).join('\n');
}
/** Corre manana() con el vigilante y la foto de antes/después. */
function correrManana(E) {
  const llamadas = vigilar(E);
  const props = [];
  E.ctx.PropertiesService = { getScriptProperties: function () { props.push('getScriptProperties'); return { getProperty: function () { return null; }, setProperty: function () {}, deleteProperty: function () {} }; } };
  const antes = foto(E), hojasInter = Object.keys(E.archivos[E.cfg('RDV_SS_INTERMEDIA')].hojas).length;
  const r = E.run('manana()');
  return { r: r, llamadas: llamadas, props: props, intacta: foto(E) === antes, hojasInter: hojasInter, resumen: resumenDe(E) };
}
// La última línea del resumen, con IDS_EN_LA_HORA como está hoy (prendido el 09/10).
const ULTIMA_FALSE = /IDS_EN_LA_HORA = true \(la corrida de la hora ya escribe los IDs de las filas activas\)\./;

console.log('  -- el caso sano: la lista cruza, el 3735 es la fila 805');
{
  const E = entornoManana();
  const x = correrManana(E);
  const r = x.r, rs = x.resumen;
  ok(JSON.stringify(Object.keys(r)) === '["ids","guardian","resumen"]' && Array.isArray(r.resumen) && r.resumen.length >= 6,
     'los dos pasos corrieron y ninguno falló (sin claves error0/error1); r.resumen trae las líneas del resumen');
  ok(x.llamadas.length === 0, 'NINGUNA llamada de escritura (setValues, setBackground, appendRow, insertSheet, columnas nuevas…): ' + x.llamadas.length + (x.llamadas.length ? ' — ' + x.llamadas.slice(0, 3).join(', ') : ''));
  ok(x.intacta && E.base().escrituras.length === 0, 'la foto de TODOS los archivos (valores, fondos, formatos, fórmulas, dimensiones, escrituras) es idéntica antes y después');
  ok(x.hojasInter === 0 && Object.keys(E.archivos[E.cfg('RDV_SS_INTERMEDIA')].hojas).length === 0, 'la intermedia no tiene ni una solapa nueva (ni IDS_SIN_CRUZAR ni REGISTRO_IDS)');
  ok(JSON.stringify(Object.keys(E.archivos[E.cfg('RDV_SS_DESTINO')].hojas).sort()) === '["Comunas","RVD JM-CM - ES"]', 'el archivo del destino sigue con sus dos solapas');
  const lista = E.archivos[E.cfg('RDV_SS_IDS')];
  ok(!!lista && Object.keys(lista.hojas).sort().join('|') === 'Agenda JM|Agenda funcionarios' && lista.hojas['Agenda JM'].escrituras.length === 0 && lista.hojas['Agenda funcionarios'].escrituras.length === 0,
     'el archivo de la lista: las mismas dos solapas y ninguna escritura');
  ok(x.props.length === 0, 'no toca las propiedades del script');
  ok(E.base().valores[0].length === hdrBase().length, 'la base no ganó columnas (el paso 57 las agrega; manana() sólo dice que las agregaría)');
  ok(/manana\(\) — SÓLO LECTURA: no escribe nada \(ni la base, ni la intermedia, ni la lista\)/.test(E.log()), 'el aviso de arriba dice que es sólo lectura');
  ok(/IDS \("ID cuentas" y "Fecha envío campañas"\): LISTO para seguir/.test(rs), 'IDs: LISTO para seguir (el 3735 cruza)');
  ok(/el caso 3735: OK: es la fila 805\./.test(rs), 'el caso 3735: "OK: es la fila 805."');
  ok(/cruzan: misma fecha \d+, fecha distinta \(±3\) 2 \| ambiguos 0 \| sin fila 0/.test(rs) && /el paso 57 escribiría 8 IDs y 4 fechas de envío/.test(rs) && /agregaría ID cuentas y Fecha envío campañas/.test(rs),
     'las cuentas de los IDs: 2 por fecha distinta, 0 ambiguos, "el paso 57 escribiría 8 IDs y 4 fechas de envío" y que agregaría las dos columnas');
  ok(/si da bien: paso56_idsHistorial_enSeco\(\)/.test(rs), 'y qué correr después (paso 56 → 57 → IDS_EN_LA_HORA = true)');
  ok(/GUARDIÁN: NO LISTO — su texto no llegó a la sesión; no hay nada que prender\. Línea de base de hoy: 0 de 803 filas con traza no cuadran \(alineada, la racha más larga 0\); el orden parcial grande se ve \(\d+ filas que no cuadran, hoy 0\); el chico también se ve \(la racha\)\./.test(rs),
     'el guardián: "NO LISTO — su texto no llegó", la línea de base (0 de 803, alineada) y que el orden parcial, grande y chico, se ve');
  ok(r.guardian.detectaChico === true && r.guardian.veredictoChico === 'DESALINEADA' && r.guardian.chico > 0,
     '   el orden parcial CHICO (sólo las últimas 30 filas) da DESALINEADA por la racha (' + r.guardian.chico + ' filas que no cuadran)');
  ok(/OCULTAR Y PROTEGER: NO LISTO — propuesta \(falta el texto del guardián\): ocultar 14 columnas internas y proteger con advertencia las 34 del sistema; hoy 0 ocultas y 0 con alguna protección\./.test(rs),
     'ocultar y proteger: "NO LISTO", la propuesta (14 y 34) y lo de hoy (0 y 0)');
  ok(ULTIMA_FALSE.test(rs) && E.cfg('IDS_EN_LA_HORA') === true && E.logs[E.logs.length - 1].trim().indexOf('IDS_EN_LA_HORA = true') === 0,
     'IDS_EN_LA_HORA = true (09/10): el resumen termina con "IDS_EN_LA_HORA = true (la corrida de la hora ya escribe los IDs de las filas activas)."');
  ok(r.ids.conteo.escribeId === 8 && r.ids.conteo.escribeFecha === 4 && r.guardian.veredictoHoy === 'alineada' && r.guardian.trazadas === 803 && r.guardian.detecta === true && r.guardian.inventario.proponeOcultar === 14,
     'lo que devuelve manana(): los IDs (8 y 4), el guardián (alineada, 803, detecta, propone 14)');
  const log = E.log();
  ok(/1\. IDs de los encuentros — medirIds\(\) \(paso 55\) #+\n/.test(log) && /2 y 3\. el guardián y ocultar\/proteger — medirGuardian\(\) #+\n/.test(log) && (log.match(/########## OK \(/g) || []).length === 2,
     'el log: los dos pasos con su encabezado y los dos "OK"');
}

console.log('  -- el resumen cuando IDS_EN_LA_HORA ya es true (el paso que sigue en el plan; ex BUG 5, arreglado el 09/10)');
{
  const E = entornoManana();
  const r = E.run('manana()');
  // la constante no se puede cambiar desde afuera (es un const del contexto): se corre el _resumenManana_ REAL con un parámetro que la tapa
  const m = /function _resumenManana_\(r\) \{[\s\S]*?\r?\n\}\r?\n/.exec(fs.readFileSync(path.join(RAIZ, 'diagnostico', '28_manana.js'), 'utf8'));
  ok(!!m, 'se pudo sacar _resumenManana_ de diagnostico/28_manana.js para correrla con IDS_EN_LA_HORA = true');
  if (m) {
    const fn = E.run('(function (IDS_EN_LA_HORA) {' + m[0] + ' return _resumenManana_; })(true)');
    const n0 = E.logs.length;
    fn(r);
    const nuevas = E.logs.slice(n0);
    const linea = (nuevas.filter(function (l) { return /^\s*IDS_EN_LA_HORA = /.test(l); }).pop() || '').trim();   // la última línea, no la de "si da bien: … → IDS_EN_LA_HORA = true + clasp push"
    ok(/^IDS_EN_LA_HORA = true \(la corrida de la hora ya escribe los IDs de las filas activas\)\.$/.test(linea) && !/no toca los IDs/.test(linea) && nuevas[nuevas.length - 1].trim() === linea,
       'con IDS_EN_LA_HORA = true la última línea del resumen dice "' + linea + '", no que la corrida de la hora no toca los IDs');
  }
}

console.log('  -- el 3735 de control: se movió de número, no cruza, cruza a OTRA fila, no está en la lista');
{
  const mover = correrManana(entornoManana({ base: { relleno: 804 } }));
  ok(/IDS \("ID cuentas" y "Fecha envío campañas"\): LISTO para seguir/.test(mover.resumen) && /el caso 3735: OK por la reunión \(fila 806; la 805 se movió de número\)\./.test(mover.resumen),
     'con una fila más antes (la reunión de control pasa a la 806): "OK por la reunión (fila 806; la 805 se movió de número)" → LISTO');
  const noCruza = correrManana(entornoManana({ base: { barrio805: 'Palermo' } }));
  ok(/IDS \("ID cuentas" y "Fecha envío campañas"\): NO LISTO: mirar lo de abajo/.test(noCruza.resumen) && /el caso 3735: no cruza: sin_fila/.test(noCruza.resumen),
     'si la reunión de control cambió de barrio (Palermo): "no cruza: sin_fila" → NO LISTO: mirar lo de abajo');
  ok(/el paso 57 escribiría 7 IDs/.test(noCruza.resumen) && noCruza.llamadas.length === 0 && noCruza.intacta, '…y no escribe nada igual (7 de los 8 IDs sí cruzan)');
  const otra = correrManana(entornoManana({ base: { extraMacri: true } }));
  ok(/NO LISTO: mirar lo de abajo/.test(otra.resumen) && /el caso 3735: DISTINTO: da la fila 806 y se esperaba la 805\./.test(otra.resumen),
     'si hay OTRA reunión de Macri en Belgrano el 01/10 (la fecha de la lista): cruza a la 806, "DISTINTO: da la fila 806 y se esperaba la 805" → NO LISTO');
  const sin3735 = correrManana(entornoManana({ env: { jm: [JM[0], JM[1], JM[3], JM[4]] } }));
  ok(/NO LISTO: mirar lo de abajo/.test(sin3735.resumen) && /el caso 3735: no está en la lista/.test(sin3735.resumen), 'si el 3735 no está en la lista: "no está en la lista" → NO LISTO');
  const sinSolapa = correrManana(entornoManana({ env: { funcionarios: undefined } }));
  ok(/NO LISTO: mirar lo de abajo/.test(sinSolapa.resumen) && /solapas que no se leyeron: Agenda funcionarios: no existe la solapa "Agenda funcionarios"/.test(sinSolapa.resumen) && /el caso 3735: OK: es la fila 805\./.test(sinSolapa.resumen),
     'una solapa de la lista que no se pudo leer: NO LISTO aunque el 3735 cruce, y dice cuál');
}

console.log('  -- las columnas de los IDs que ya están en la base');
{
  const hdrX = hdrBase(EXTRA_IDS);
  const E = entornoManana({ env: { columnasExtra: EXTRA_IDS, maxColsBase: hdrX.length } });
  const x = correrManana(E);
  ok(/LISTO para seguir/.test(x.resumen) && !/agregaría/.test(x.resumen) && /las 36 del sistema/.test(x.resumen) && x.llamadas.length === 0 && x.intacta,
     'con las dos columnas ya en la base: LISTO, sin "agregaría …", y el inventario cuenta 36 columnas del sistema');
  const Ef = entornoManana({ env: { columnasExtra: EXTRA_IDS, maxColsBase: hdrX.length } });
  Ef.base().formulasCelda['300:' + (hdrX.indexOf('ID cuentas') + 1)] = '=IFERROR(VLOOKUP(A300;X!A:B;2;0);"")';
  const xf = correrManana(Ef);
  ok(/NO LISTO: mirar lo de abajo/.test(xf.resumen) && /OJO: columnas con fórmulas/.test(xf.resumen) && xf.llamadas.length === 0, '"ID cuentas" con FÓRMULAS: NO LISTO y avisa "OJO: columnas con fórmulas"');
  const Ee = entornoManana({ env: { columnasExtra: EXTRA_IDS, maxColsBase: hdrX.length } });
  Ee.base().formulasCelda['1:' + (hdrX.indexOf('Fecha envío campañas') + 1)] = '={"Fecha envío campañas"; ARRAYFORMULA(…)}';
  const xe = correrManana(Ee);
  ok(/LISTO para seguir/.test(xe.resumen) && /OJO: columnas con fórmulas/.test(xe.resumen),
     'DECISIÓN: con fórmulas sólo en "Fecha envío campañas" sigue LISTO (los IDs se escriben, esa columna no) y el "OJO" lo avisa en la línea del paso 57');
}

console.log('  -- si un paso falla, sigue con el otro y el resumen lo dice');
{
  // sin el archivo de la lista
  const E = entornoManana({ env: { sinArchivoIds: true } });
  const x = correrManana(E), rs = x.resumen, log = E.log();
  ok(/No se pudo abrir la lista de IDs/.test(x.r.error0) && !('error1' in x.r) && !!x.r.guardian && !x.r.ids, 'sin el archivo de la lista: r.error0 trae el mensaje, el guardián corrió igual y no hay r.ids');
  ok(/########## ERROR en 1\. IDs de los encuentros — medirIds\(\) \(paso 55\) \(sigue con el próximo\): Error: No se pudo abrir la lista de IDs/.test(log) &&
     /2 y 3\. el guardián y ocultar\/proteger — medirGuardian\(\) #+\n[\s\S]*\n########## OK \(\d+ s\)/.test(log), 'el log: el ERROR del paso 1 con "(sigue con el próximo)" y el paso 2 que termina OK');
  ok(/IDS: NO SE PUDO MEDIR \(No se pudo abrir la lista de IDs[^\n]*\)\. Nada para prender\./.test(rs) && /GUARDIÁN: NO LISTO — su texto no llegó/.test(rs) && /OCULTAR Y PROTEGER: NO LISTO/.test(rs) &&
     ULTIMA_FALSE.test(rs), 'el resumen: "IDS: NO SE PUDO MEDIR … Nada para prender." y el guardián y ocultar/proteger con sus números');
  ok(x.llamadas.length === 0 && x.intacta, 'y tampoco escribió nada');
  // el INVENTARIO falla (no se pueden leer las protecciones): desde la segunda revisión, la medición del guardián sigue sin él
  const E2 = entornoManana();
  simularHoja(E2, { error: 'sin permiso para leer las protecciones' });
  const x2 = correrManana(E2), rs2 = x2.resumen;
  ok(!('error0' in x2.r) && !('error1' in x2.r) && !!x2.r.ids && !!x2.r.guardian && /sin permiso para leer las protecciones/.test(x2.r.guardian.inventario.error),
     'si falla el inventario: el guardián se mide igual y r.guardian.inventario.error trae el mensaje (antes se perdía toda la medición)');
  ok(/IDS \("ID cuentas" y "Fecha envío campañas"\): LISTO para seguir/.test(rs2) && /GUARDIÁN: NO LISTO — su texto no llegó/.test(rs2) &&
     /OCULTAR Y PROTEGER: NO SE PUDO MEDIR \(sin permiso para leer las protecciones\)\./.test(rs2) && ULTIMA_FALSE.test(rs2) && x2.llamadas.length === 0 && x2.intacta,
     'el resumen: los IDs siguen LISTO, el guardián con sus números y "OCULTAR Y PROTEGER: NO SE PUDO MEDIR (…)"; no escribió nada');
  // el guardián ENTERO falla (simulado): r.error1, y el resumen lo dice para los dos temas
  const E2b = entornoManana();
  E2b.run('pruebaOrdenParcial_ = function () { throw new Error("falla simulada del guardián"); };');
  const x2b = correrManana(E2b), rs2b = x2b.resumen;
  ok(/falla simulada del guardián/.test(x2b.r.error1) && !('error0' in x2b.r) && !!x2b.r.ids && !x2b.r.guardian, 'si falla el guardián: r.error1 trae el mensaje, los IDs se midieron y no hay r.guardian');
  ok(/IDS \("ID cuentas" y "Fecha envío campañas"\): LISTO para seguir/.test(rs2b) && /GUARDIÁN: NO SE PUDO MEDIR \(falla simulada del guardián\)\./.test(rs2b) &&
     ULTIMA_FALSE.test(rs2b), 'el resumen: los IDs siguen LISTO y "GUARDIÁN: NO SE PUDO MEDIR (…)"');
  ok(/OCULTAR Y PROTEGER: NO SE PUDO MEDIR \(el mismo error\)\./.test(rs2b) && x2b.llamadas.length === 0 && x2b.intacta,
     '(ex HALLAZGO del 08/10) cuando falla el guardián el resumen dice también "OCULTAR Y PROTEGER: NO SE PUDO MEDIR (el mismo error)."; no escribió nada');
  // fallan los dos
  const E3 = entornoManana({ env: { sinArchivoIds: true } });
  E3.run('pruebaOrdenParcial_ = function () { throw new Error("falla simulada del guardián"); };');
  const x3 = correrManana(E3);
  ok(!!x3.r.error0 && !!x3.r.error1 && !x3.r.ids && !x3.r.guardian && /IDS: NO SE PUDO MEDIR/.test(x3.resumen) && /GUARDIÁN: NO SE PUDO MEDIR/.test(x3.resumen) &&
     /OCULTAR Y PROTEGER: NO SE PUDO MEDIR/.test(x3.resumen) && ULTIMA_FALSE.test(x3.resumen) && x3.llamadas.length === 0 && x3.intacta,
     'si fallan los dos: el resumen igual sale, con los "NO SE PUDO MEDIR" de los IDs, el guardián y ocultar/proteger, y la última línea; sin escrituras');
}

console.log('  -- el guardián en el resumen, según la base');
{
  // sin filas con traza: la autoprueba no concluye (ex HALLAZGO del 08/10: decía "NO separa los órdenes")
  const E = entornoManana({ base: { relleno: 0 } });
  const x = correrManana(E);
  ok(/Línea de base de hoy: 0 de 0 filas con traza no cuadran \(alineada, la racha más larga 0\); el orden parcial grande NO ES CONCLUYENTE \(la base no tiene filas con traza\); el chico no es concluyente \(sin trazas\)\./.test(x.resumen) && !/NO se ve/.test(x.resumen),
     'una base sin filas con traza dice "NO ES CONCLUYENTE (la base no tiene filas con traza)", no "NO se ve"');
  // ya desalineada: el resumen la marca; el orden parcial grande se juzga por el SALTO (concluye); el chico, no
  const filas = baseManana();
  const E2 = entornoG({ base: filas, jm: JM, funcionarios: FUN });
  romper2(E2, 60);
  const x2 = correrManana(E2);
  ok(/Línea de base de hoy: 60 de 803 filas con traza no cuadran \(DESALINEADA, la racha más larga \d+\); el orden parcial grande se ve \(\d+ filas que no cuadran, hoy 60\); el chico no es concluyente \(hoy ya está desalineada\)/.test(x2.resumen) &&
     x2.r.guardian.detecta === true && x2.r.guardian.detectaChico === null && x2.llamadas.length === 0 && x2.intacta,
     'una base que hoy ya tiene 60 filas que no cuadran: "60 de 803 … (DESALINEADA)" (umbral 41), el grande se ve por el salto, el chico no concluye, y no escribe nada');
  // una racha: 6 filas SEGUIDAS rotas bastan (60 sueltas hacían falta antes)
  const E3 = entornoG({ base: baseManana(), jm: JM, funcionarios: FUN });
  for (let j = 0; j < 6; j++) celdas(E3, 100 + j, { form_origen: 'Gabino Tapia - Encuentro con vecinos - ' + dm(E3, 100 + j) });
  const x3 = correrManana(E3);
  ok(/Línea de base de hoy: 6 de 803 filas con traza no cuadran \(DESALINEADA, la racha más larga 6\)/.test(x3.resumen) && /umbral de "desalineada": 41, o 6 seguidas; la racha más larga: 6\) → DESALINEADA/.test(E3.log()),
     'seis filas SEGUIDAS que no cuadran: el resumen dice "6 de 803 … (DESALINEADA)" y el log, "umbral 41, o 6 seguidas; la racha más larga: 6"');
}

// ===================================================================================================================
console.log('\n' + chequeos + ' chequeos.');
if (fallas) {
  console.log(fallas + ' FALLA(S)' + (bugsAbiertos ? ': ' + bugsAbiertos + ' son BUG del guardián conocidos (las líneas "BUG" de arriba, marcadas "// BUG:" en el código)' +
              (fallas > bugsAbiertos ? ' y ' + (fallas - bugsAbiertos) + ' son FALLAS nuevas' : '') : ''));
  process.exit(1);
}
console.log('Todo en verde.');
process.exit(0);
