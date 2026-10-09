/**
 * tests/guardian_activo.test.js — EL GUARDIÁN de las columnas del sistema (46_Guardian.js, 09/10): el plan (restaurar,
 * reubicar, limpiar, frenar), su escritura (la cuarta excepción, 05_Escritura.js), la copia, el paso 58 en seco y el 59.
 *
 *     node tests/guardian_activo.test.js
 *
 * [1] planGuardian_ sobre bases inventadas: sin cambios; una edición del equipo; el ORDEN PARCIAL (sólo las columnas del
 *     equipo, toda la base y sólo las últimas filas) → se reubica y queda igual que la copia; el orden de filas enteras;
 *     filas borradas e insertadas; figura o fecha cambiadas por el equipo (con y sin clave); una fila copiada y pegada; algo
 *     tipeado en una fila nueva; los pares figura + fecha repetidos (con desempate y sin: AMBIGUA → frena, esas filas no se
 *     tocan).
 * [2] escribirGuardianLote_: sólo columnas guardadas; lectura fresca; colores.
 * [3] guardianAntesDeEscribir_ en la planilla simulada: sin copia, la copia vieja, una edición, el orden parcial, en seco.
 * [4] paso 58 (no escribe nada) y paso 59 (oculta, protege, encabezado gris, primera copia; ningún valor ni fondo de datos).
 * [5] apagado (GUARDIAN_ACTIVO = false): el sello no toca nada y la corrida de la hora no llama al guardián; prendido, las
 *     escrituras del sistema dejan el sello y las del guardián no.
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: figuras, barrios, IDs y fechas inventados.
 */
'use strict';
const fs = require('fs'), path = require('path');
const { crearEntornoIds, filaBase, hdrBase, D } = require('./ids_mock');

let chequeos = 0, fallas = 0;
function ok(cond, que) { chequeos++; console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }
function igual(a, b, que) { const sa = JSON.stringify(a), sb = JSON.stringify(b); ok(sa === sb, que + (sa === sb ? '' : '  → dio ' + sa + ' y se esperaba ' + sb)); }

const EXTRA = ['ID cuentas', 'Fecha envío campañas'];
const HDR = hdrBase(EXTRA);
const col = function (n) { return HDR.indexOf(n); };
const FIG = ['Jorge Macri', 'Hernán Lombardi', 'Gabino Tapia', 'Gustavo Arengo Piragine', 'Ana Pereyra', 'Ruth Landerreche'];
const BAR = ['Belgrano', 'Retiro', 'Núñez', 'Palermo', 'Flores', 'Caballito', 'Recoleta'];

function entorno(o) {
  o = o || {};
  const E = crearEntornoIds(Object.assign({ bloqueBase: o.bloqueBase || [HDR], maxColsBase: HDR.length, extra: ['diagnostico/27_guardian.js', '46_Guardian.js'] }, o));
  // propiedades que persisten entre llamadas (el mock da un almacén nuevo por llamada)
  const props = {};
  E.props = props;
  E.ctx.PropertiesService = { getScriptProperties: function () {
    return { getProperty: function (k) { return k in props ? props[k] : null; }, setProperty: function (k, v) { props[k] = String(v); },
             deleteProperty: function (k) { delete props[k]; } };
  } };
  E.ctx.SpreadsheetApp.ProtectionType = { RANGE: 'RANGE' };
  return E;
}
/** Una base de `n` filas: figuras, fechas y barrios distintos; las columnas del sistema con valores (algunas filas sin clave). */
function base(E, n) {
  const F = E.ctx.Date;
  const filas = [];
  for (let i = 0; i < n; i++) {
    const fecha = new F(2026, 5 + Math.floor(i / 28), 1 + (i % 28), 12, 0, 0);
    const o = { Figura: FIG[i % 6], Barrio: BAR[i % 7], EVENTO: 'Encuentro con Vecinos', FECHA: fecha, HORA: new F(1899, 11, 30, 17 + (i % 3), 0, 0) };
    if (i % 3 !== 2) { o.RDV_UID = 'uid-' + i; o.form_origen = 'Formulario ' + i; o.form_score = 0.9; }
    if (i % 2 === 0) { o.agenda_uid = 'c-' + i; o.agenda_fecha_escrita = fecha; o['Origen fila'] = 'agenda'; }
    if (i % 5 === 0) o['ID cuentas'] = (1000 + i) + '-ABC';
    filas.push(filaBase(o, HDR));
  }
  return [HDR].concat(filas);
}
const SISTEMA = function (E) {
  return E.run('(function (h) { var c = columnasGuardian_(h); return c.guardadas.concat(c.derivadas).map(function (x) { return x.col; }); })')(HDR);
};
/** Ordena SÓLO las columnas del equipo de las filas `desde..hasta` (índices de datos) por figura y fecha; el sistema, quieto. */
function ordenParcial(E, bloque, desde, hasta) {
  const sis = SISTEMA(E), datos = bloque.slice(1);
  const h = hasta == null ? datos.length : hasta;
  const idx = []; for (let i = desde || 0; i < h; i++) idx.push(i);
  const k = function (r) { return String(r[col('Figura')]) + '|' + r[col('FECHA')].getTime(); };
  const ord = idx.slice().sort(function (a, b) { return k(datos[a]) < k(datos[b]) ? -1 : k(datos[a]) > k(datos[b]) ? 1 : a - b; });
  const out = datos.map(function (r) { return r.slice(); });
  idx.forEach(function (i, n) { const fuente = datos[ord[n]]; out[i] = out[i].map(function (v, c) { return sis.indexOf(c) >= 0 ? v : fuente[c]; }); });
  return [bloque[0]].concat(out);
}
function plan(E, copiaDe, ahora) {
  E.ctx.__a = copiaDe; E.ctx.__b = ahora;
  return E.run('(function () { var c = leerEstadoGuardian_(null, __a); var e = c.filas.map(function (f) { return { clave: f.clave, huella: f.huella, fila: f.fila, valores: f.valores, desempate: f.desempate }; });' +
               ' return planGuardian_(e, leerEstadoGuardian_(null, __b)); })()');
}
function aplicar(bloque, p) {
  const out = bloque.map(function (r) { return r.slice(); });
  p.cambios.forEach(function (c) { out[c.fila - 1][c.col] = c.valor; });
  return out;
}
/** ¿Cada huella tiene lo mismo en las columnas guardadas en las dos bases? */
function mismoSistemaPorHuella(E, a, b) {
  E.ctx.__a = a; E.ctx.__b = b;
  return E.run('(function () { var x = leerEstadoGuardian_(null, __a), y = leerEstadoGuardian_(null, __b); var m = {};' +
               ' x.filas.forEach(function (f) { m[f.huella] = f; }); var malas = [];' +
               ' y.filas.forEach(function (f) { var g = m[f.huella]; if (!g || !_mismosValoresGuardian_(f.valores, g.valores, x.cols.guardadas)) malas.push(f.fila); });' +
               ' return malas; })()');
}

// ===================================================================================================================
console.log('[1] planGuardian_');
{
  const E = entorno();
  const B = base(E, 60);
  let p = plan(E, B, B);
  ok(p.cambios.length === 0 && !p.frenar, 'sin cambios: nada que hacer');

  const B2 = B.map(function (r) { return r.slice(); });
  B2[10][col('form_origen')] = 'lo tipeó alguien';
  B2[11][col('Conjunta con')] = 'Fulano';
  p = plan(E, B, B2);
  igual(p.cambios.map(function (c) { return [c.fila, c.canon, c.tipo, c.valor]; }),
        [[11, 'form_origen', 'restaurada', 'Formulario 9'], [12, 'Conjunta con', 'restaurada', '']],
        'una edición del equipo en una columna del sistema: se restaura (y lo agregado en una celda vacía, se saca)');

  const P = ordenParcial(E, B);
  p = plan(E, B, P);
  ok(!p.frenar && p.reubicadas.length > 40, 'ORDEN PARCIAL de toda la base (sólo las columnas del equipo): reubica ' + p.reubicadas.length + ' filas, no frena');
  igual(mismoSistemaPorHuella(E, B, aplicar(P, p)), [], '   y aplicado, cada reunión vuelve a tener sus columnas del sistema');
  ok(p.cambios.every(function (c) { return SISTEMA(E).indexOf(c.col) >= 0; }), '   y sólo toca columnas del sistema');
  const P20 = ordenParcial(E, B, 40, 60);
  p = plan(E, B, P20);
  ok(!p.frenar && p.reubicadas.length > 5 && p.reubicadas.every(function (r) { return r.fila >= 42; }),
     'ORDEN PARCIAL de las últimas 20 filas: reubica ' + p.reubicadas.length + ', todas en esas filas');
  igual(mismoSistemaPorHuella(E, B, aplicar(P20, p)), [], '   y aplicado, queda igual');

  const ent = [B[0]].concat(B.slice(1).slice().sort(function (a, b) { return String(a[col('Figura')]) < String(b[col('Figura')]) ? -1 : 1; }));
  p = plan(E, B, ent);
  ok(p.cambios.length === 0 && !p.frenar, 'el orden de FILAS ENTERAS (Datos → Ordenar hoja): nada que hacer');

  const sin30 = B.filter(function (r, i) { return i !== 31; });   // fila 32 (i = 30: con RDV_UID, agenda e ID)
  p = plan(E, B, sin30);
  ok(p.cambios.length === 0 && p.borradas.length === 1 && !p.frenar, 'una fila borrada por el equipo: se respeta (borradas 1, ningún cambio)');
  const conVacia = B.slice(0, 20).concat([HDR.map(function () { return ''; })]).concat(B.slice(20));
  p = plan(E, B, conVacia);
  ok(p.cambios.length === 0 && !p.frenar, 'una fila vacía insertada en el medio (las de abajo se corren): ningún cambio');

  const F = E.ctx.Date;
  const rep = B.map(function (r) { return r.slice(); });
  rep[1][col('FECHA')] = new F(2026, 11, 20, 12, 0, 0);     // fila 2 (i = 0, con clave): reprogramada
  rep[6][col('FECHA')] = new F(2026, 11, 21, 12, 0, 0);     // fila 7 (i = 5, SIN clave, con ID): reprogramada
  p = plan(E, B, rep);
  ok(p.cambios.length === 0 && p.huellaCambiada.length === 2 && !p.frenar,
     'figura o fecha cambiada por el equipo (con clave y sin clave, por sus valores): se acepta, ningún cambio (' + p.huellaCambiada.length + ')');
  const repYBorrada = rep.filter(function (r, i) { return i !== 3; });
  p = plan(E, B, repYBorrada);
  ok(p.cambios.length === 0 && !p.frenar, '   …también si además se borró una fila de más arriba (las filas se corrieron)');

  const dup = B.concat([B[10].slice()]);
  p = plan(E, B, dup);
  ok(p.cambios.length > 0 && p.cambios.every(function (c) { return c.fila === 62 && c.tipo === 'limpiada'; }) && !p.frenar,
     'una fila copiada y pegada (con su RDV_UID): la copia nueva pierde las columnas del sistema (' + p.cambios.length + ' celdas)');
  const nueva = B.concat([filaBase({ Figura: 'Ana Pereyra', FECHA: new F(2026, 11, 1, 12), 'Conjunta con': 'Fulano' }, HDR)]);
  p = plan(E, B, nueva);
  igual(p.cambios.map(function (c) { return [c.fila, c.canon, c.tipo]; }), [[62, 'Conjunta con', 'limpiada']], 'algo tipeado en una columna del sistema de una fila nueva: se limpia');

  // los pares figura + fecha repetidos
  const par = B.map(function (r) { return r.slice(); });
  par[51] = par[51].slice(); par[51][col('Figura')] = par[8][col('Figura')]; par[51][col('FECHA')] = par[8][col('FECHA')];   // fila 52 = huella de la 9 (otro barrio)
  const Ppar = ordenParcial(E, par);
  p = plan(E, par, Ppar);
  ok(!p.frenar && p.ambiguas.length === 0, 'un par figura + fecha repetido, con barrio u hora distintos: el desempate lo resuelve (no frena)');
  E.ctx.__a = par; E.ctx.__b = aplicar(Ppar, p);
  const malasPar = E.run('(function () { var x = leerEstadoGuardian_(null, __a), y = leerEstadoGuardian_(null, __b); var m = {};' +
    ' x.filas.forEach(function (f) { m[f.huella + "#" + f.desempate] = f; });' +
    ' return y.filas.filter(function (f) { var g = m[f.huella + "#" + f.desempate]; return !g || !_mismosValoresGuardian_(f.valores, g.valores, x.cols.guardadas); }).length; })()');
  ok(malasPar === 0, '   y aplicado, cada reunión (también las dos del par) tiene lo suyo (' + malasPar + ' distintas)');
  const par2 = par.map(function (r) { return r.slice(); });
  ['Barrio', 'HORA', 'EVENTO'].forEach(function (n) { par2[51][col(n)] = par2[8][col(n)]; });
  const Ppar2 = ordenParcial(E, par2);
  p = plan(E, par2, Ppar2);
  ok(p.frenar && p.ambiguas.length >= 1, 'el mismo par, idéntico también en barrio, hora y evento, y desalineado: AMBIGUA → frena la corrida (' + p.ambiguas.length + ')');
  const tocadasAmb = {};
  p.ambiguas.forEach(function (a) { a.filas.forEach(function (n) { tocadasAmb[n] = true; }); });
  ok(p.cambios.every(function (c) { return !tocadasAmb[c.fila]; }), '   y esas filas no se tocan; las demás se reubican igual (' + p.reubicadas.length + ')');
}

// ===================================================================================================================
console.log('[2] escribirGuardianLote_');
{
  const E = entorno();
  const B = base(E, 10).map(function (r) { return r.map(function (v) { return v instanceof Date ? new Date(v.getTime()) : v; }); });
  const E2 = entorno({ bloqueBase: B });
  const sh = 'ssDestino_().getSheetByName(RDV_HOJA_DESTINO)';
  let err = '';
  try { E2.run('escribirGuardianLote_(' + sh + ', ' + sh + '.getRange(1,1,1,' + HDR.length + ').getValues()[0], [{ fila: 2, col: ' + (col('Figura') + 1) + ', valor: "X", puesto: "' + FIG[0] + '" }])'); }
  catch (e) { err = String(e.message || e); }
  ok(/no es una columna del sistema/.test(err) && E2.base().valores[1][col('Figura')] === FIG[0], 'una columna del EQUIPO (Figura): error y no escribe nada');
  E2.base().valores[3][col('form_origen')] = 'cambiado en el medio';
  const w = E2.run('escribirGuardianLote_(' + sh + ', ' + sh + '.getRange(1,1,1,' + HDR.length + ').getValues()[0], [' +
    '{ fila: 2, col: ' + (col('form_origen') + 1) + ', valor: "Formulario 0", puesto: "Formulario 0" },' +
    '{ fila: 3, col: ' + (col('form_origen') + 1) + ', valor: "Formulario 1b", puesto: "Formulario 1" },' +
    '{ fila: 4, col: ' + (col('form_origen') + 1) + ', valor: "Formulario 2", puesto: "Formulario 2" },' +
    '{ fila: 5, col: ' + (col('Conjunta con') + 1) + ', valor: "", puesto: "" }])');
  ok(w.hechas.length === 3 && w.saltadas.length === 1 && E2.base().valores[3][col('form_origen')] === 'cambiado en el medio',
     'lectura fresca: la celda que alguien cambió mientras corría no se toca (saltadas 1)');
  ok(E2.base().valores[2][col('form_origen')] === 'Formulario 1b' && E2.base().fondos['3:' + (col('form_origen') + 1)] === E2.cfg('COLOR_SISTEMA'),
     'lo escrito con valor queda con el color del sistema');
  const w2 = E2.run('escribirGuardianLote_(' + sh + ', ' + sh + '.getRange(1,1,1,' + HDR.length + ').getValues()[0], [' +
    '{ fila: 6, col: ' + (col('RDV_UID') + 1) + ', valor: "03735", puesto: "' + E2.base().valores[5][col('RDV_UID')] + '" }])');
  ok(w2.hechas.length === 1 && E2.base().valores[5][col('RDV_UID')] === '03735' && E2.base().escrituras.some(function (e) { return e.valor === "'03735"; }),
     'un texto que Sheets leería como número se escribe con apóstrofo (queda texto)');
  ok(!E2.props[E2.cfg('PROP_GUARDIAN_ESCRITURA')], 'no deja el sello de escritura del sistema');
}

// ===================================================================================================================
console.log('[3] guardianAntesDeEscribir_ en la planilla simulada');
{
  const mk = function () {
    const E0 = entorno();
    const B = base(E0, 40).map(function (r) { return r.map(function (v) { return v instanceof Date ? new Date(v.getTime()) : v; }); });
    return entorno({ bloqueBase: B });
  };
  let E = mk();
  let r = E.run('guardianAntesDeEscribir_(false)');
  ok(r.sinCopia && !r.frenar && E.base().escrituras.length === 0, 'sin copia: no compara, no escribe, no frena');
  E.run('tomarCopiaSistema_()');
  ok(!!E.intermedia('SISTEMA_COPIA') && E.intermedia('SISTEMA_COPIA').valores.length === 41 && !!E.props[E.cfg('PROP_GUARDIAN_COPIA')],
     'la copia: una fila por fila de la base (40) y la hora');
  E.base().valores[3][col('agenda_fecha_escrita')] = 'tipeado';      // fila 4 (i = 2: de la agenda)
  r = E.run('guardianAntesDeEscribir_(true)');
  ok(E.base().valores[3][col('agenda_fecha_escrita')] === 'tipeado' && r.plan.cambios.length === 1 && !E.intermedia('REGISTRO_PROTECCION'),
     'en seco: dice qué restauraría (1) y no escribe nada (ni la base ni REGISTRO_PROTECCION)');
  r = E.run('guardianAntesDeEscribir_(false)');
  ok(E.base().valores[3][col('agenda_fecha_escrita')] instanceof Date && r.escritas === 1, 'en serio: lo restaura (la fecha que había escrito la agenda)');
  const reg = E.intermedia('REGISTRO_PROTECCION');
  ok(!!reg && reg.valores.length === 2 && reg.valores[1][1] === 'restaurada' && reg.valores[1][2] === 4 && reg.valores[1][3] === 'agenda_fecha_escrita',
     'y lo anota en REGISTRO_PROTECCION (fila 4, agenda_fecha_escrita)');
  // la copia vieja: el sistema escribió después de tomarla → no compara
  E.base().valores[6][col('form_origen')] = 'otro';
  E.props[E.cfg('PROP_GUARDIAN_ESCRITURA')] = String(Number(E.props[E.cfg('PROP_GUARDIAN_COPIA')]) + 1000);
  r = E.run('guardianAntesDeEscribir_(false)');
  ok(r.vieja && E.base().valores[6][col('form_origen')] === 'otro', 'la copia VIEJA (el sistema escribió después): no compara ni restaura');
  // el orden parcial en la planilla
  E = mk();
  E.run('tomarCopiaSistema_()');
  const antes = E.base().valores.map(function (x) { return x.slice(); });
  // la planilla guarda fechas del contexto del proyecto (el mock las convierte al crearla): se escriben así
  const P = ordenParcial(E, E.base().valores.slice(0, 41).map(function (x) { return x.slice(); }));
  P.forEach(function (fila, i) { E.base().valores[i] = fila.slice(); });
  r = E.run('guardianAntesDeEscribir_(false)');
  ok(!r.frenar && r.plan.reubicadas.length > 10, 'el ORDEN PARCIAL en la planilla: reubica ' + r.plan.reubicadas.length + ' filas, no frena');
  E.ctx.__a = antes.slice(0, 41);
  E.ctx.__b = E.base().valores.slice(0, 41);
  const malas = E.run('(function () { var x = leerEstadoGuardian_(null, __a), y = leerEstadoGuardian_(null, __b); var m = {}; x.filas.forEach(function (f) { m[f.huella] = f; });' +
                      ' return y.filas.filter(function (f) { return !_mismosValoresGuardian_(f.valores, m[f.huella].valores, x.cols.guardadas); }).length; })()');
  ok(malas === 0, '   y después cada reunión tiene sus columnas del sistema (' + malas + ' filas distintas)');
  ok(/DESALINEACIÓN/.test(E.log()) && E.intermedia('REGISTRO_PROTECCION').valores.some(function (x) { return /REUBICADA/.test(x[1]); }), '   el aviso en grande en el log y REUBICADA en REGISTRO_PROTECCION');
  ok(E.base().escrituras.every(function (e) { return SISTEMA(E).indexOf(e.col - 1) >= 0; }), '   y no escribió ninguna columna del equipo');
}

// ===================================================================================================================
console.log('[4] paso 58 (en seco) y paso 59 (ocultar, proteger, la primera copia)');
{
  const E0 = entorno();
  const B = base(E0, 30).map(function (r) { return r.map(function (v) { return v instanceof Date ? new Date(v.getTime()) : v; }); });
  const E = entorno({ bloqueBase: B });
  const sh = E.base().sheet;
  const ocultas = [], protecciones = [];
  sh.isColumnHiddenByUser = function (c) { return ocultas.indexOf(c) >= 0; };
  sh.hideColumns = function (c) { ocultas.push(c); };
  sh.getProtections = function () { return protecciones.map(function (p) { return { getRange: function () { return { getColumn: function () { return p.c; }, getLastColumn: function () { return p.c; }, getRow: function () { return 1; }, getLastRow: function () { return 100000; } }; }, getDescription: function () { return p.desc; }, isWarningOnly: function () { return p.adv; } }; }); };
  const getRangeOrig = sh.getRange;
  sh.getRange = function (r, c, nr, nc) {
    if (typeof r === 'string') {
      const letra = r.split(':')[0];
      let n = 0; for (let i = 0; i < letra.length; i++) n = n * 26 + (letra.charCodeAt(i) - 64);
      return { protect: function () { const p = { c: n, desc: '', adv: false }; protecciones.push(p);
        const o = { setDescription: function (d) { p.desc = d; return o; }, setWarningOnly: function (w) { p.adv = w; return o; } }; return o; } };
    }
    return getRangeOrig(r, c, nr, nc);
  };
  const fotoValores = JSON.stringify(E.base().valores), fotoFondos = JSON.stringify(E.base().fondos);
  const s = E.run('guardianEnSeco()');
  ok(s.ocultar === 14 && s.proteger === 36 && ocultas.length === 0 && protecciones.length === 0 && !E.intermedia('SISTEMA_COPIA') &&
     JSON.stringify(E.base().valores) === fotoValores && JSON.stringify(E.base().fondos) === fotoFondos,
     'paso 58: ocultaría 14, protegería 36 (24 guardadas + 12 derivadas), y no escribió NADA (' + s.ocultar + ', ' + s.proteger + ')');
  ok(!s.prueba.plan.frenar && s.prueba.quedaIgual && s.prueba.plan.reubicadas.length > 5, 'paso 58, la prueba en memoria: reubicaría ' + s.prueba.plan.reubicadas.length + ' filas y la base quedaría igual');
  const p = E.run('guardianPreparar()');
  ok(p.ocultas === 14 && ocultas.length === 14 && p.protegidas === 36 && protecciones.every(function (x) { return x.adv && /guardián/.test(x.desc); }),
     'paso 59: oculta 14 y protege 36, todas con ADVERTENCIA (no bloquea ordenar ni borrar)');
  ok(JSON.stringify(E.base().valores) === fotoValores && Object.keys(E.base().fondos).every(function (k) { return /^1:/.test(k) || E.base().fondos[k] === JSON.parse(fotoFondos)[k]; }),
     '   ningún valor ni fondo de datos cambia (sólo el encabezado de las columnas del sistema, gris)');
  const grises = Object.keys(E.base().fondos).filter(function (k) { return /^1:/.test(k) && E.base().fondos[k] === E.cfg('GUARDIAN_GRIS_ENCABEZADO'); });
  ok(grises.length === 36 && !!E.intermedia('SISTEMA_COPIA'), '   el encabezado gris en las 36 y la primera copia tomada');
  const ocultasNombres = ocultas.map(function (c) { return HDR[c - 1]; });
  igual(ocultasNombres.slice().sort(), E.cfg('GUARDIAN_OCULTAR').slice().sort(), '   las ocultas son exactamente las técnicas (traza y agenda_*)');
  const p2 = E.run('guardianPreparar()');
  ok(p2.ocultas === 0 && p2.protegidas === 0 && p2.gris === 0, 'paso 59 otra vez: no duplica nada (idempotente)');
}

// ===================================================================================================================
console.log('[5] apagado y prendido');
{
  const E = entorno();
  let tocadas = 0;
  E.ctx.PropertiesService = { getScriptProperties: function () { tocadas++; return { getProperty: function () { return null; }, setProperty: function () {} }; } };
  E.run('_selloEscrituraSistema_()');
  ok(E.cfg('GUARDIAN_ACTIVO') === false && tocadas === 0, 'GUARDIAN_ACTIVO = false: el sello no toca ni las propiedades');
  const up = fs.readFileSync(path.join(__dirname, '..', '20_UpsertDestino.js'), 'utf8');
  const iG = up.indexOf('resGuardian = guardianAntesDeEscribir_(enSeco)'), iAg = up.indexOf('correrAgendaEnBloqueo_(enSeco)'), iC = up.indexOf('try { tomarCopiaSiAlineada_(); }');
  ok(iG > 0 && iG < iAg && iC > iAg, 'la corrida de la hora: el guardián ANTES de la agenda (y de todo), la copia al final');
  ok(/if \(GUARDIAN_ACTIVO\) \{\s*try \{ resGuardian = guardianAntesDeEscribir_\(enSeco\); \}/.test(up) && /if \(GUARDIAN_ACTIVO && !enSeco\) \{\s*try \{ tomarCopiaSiAlineada_\(\); \}/.test(up),
     '   las dos, sólo con GUARDIAN_ACTIVO');
  ok(/if \(resGuardian\.frenar && !enSeco\) \{[\s\S]{0,400}enSeco = true;/.test(up), '   si frena, el resto de la corrida va en seco (no escribe nada en la base)');
  // prendido: las escrituras del sistema dejan el sello
  const E2 = entorno({ bloqueBase: [HDR, filaBase({ Figura: FIG[0], FECHA: D(1, 6) }, HDR)], reemplazos: { '00_Config.js': [['const GUARDIAN_ACTIVO = false;', 'const GUARDIAN_ACTIVO = true;']] } });
  E2.run('setSiDelSistemaLote_(ssDestino_().getSheetByName(RDV_HOJA_DESTINO), ssDestino_().getSheetByName(RDV_HOJA_DESTINO).getRange(1,1,1,' + HDR.length + ').getValues()[0], [{ fila: 2, col: ' + (col('Inscriptos') + 1) + ', valor: 10 }])');
  ok(!!E2.props[E2.cfg('PROP_GUARDIAN_ESCRITURA')], 'prendido: una escritura del sistema deja el sello');
}

// ===================================================================================================================
console.log('[6] los casos del revisor del punto 3c (09/10)');
{
  const E = entorno();
  const F = E.ctx.Date;
  const B = base(E, 60);
  const quien = function (bloque, n, v) { return bloque.slice(1).map(function (r, i) { return r[col(n)] === v ? i + 2 : null; }).filter(Boolean); };
  // A2: el equipo INTERCAMBIA las fechas de dos reuniones (sin ordenar nada): cada una conserva su traza
  const sw = B.map(function (r) { return r.slice(); });
  const f2 = sw[1][col('FECHA')], f8 = sw[7][col('FECHA')];
  sw[1][col('FECHA')] = f8; sw[7][col('FECHA')] = f2;
  let p = plan(E, B, sw);
  const A = aplicar(sw, p);
  ok(p.reubicadas.length === 0 && quien(A, 'RDV_UID', 'uid-0')[0] === 2 && quien(A, 'RDV_UID', 'uid-6')[0] === 8 && !p.frenar,
     'un INTERCAMBIO de fechas entre dos reuniones: cada fila conserva su traza (no es una desalineación)');
  // A1: una reprogramación de la fila 2 y, en la misma hora, un orden parcial: la traza de esa reunión no se pierde
  const rep = B.map(function (r) { return r.slice(); });
  rep[1][col('FECHA')] = new F(2026, 8, 15, 12, 0, 0);
  const Prep = ordenParcial(E, rep);
  p = plan(E, B, Prep);
  const A1 = aplicar(Prep, p);
  const filaRep = Prep.slice(1).map(function (r, i) { return r[col('FECHA')].getTime() === new F(2026, 8, 15, 12, 0, 0).getTime() ? i + 2 : null; }).filter(Boolean)[0];
  ok(p.frenar || (quien(A1, 'RDV_UID', 'uid-0')[0] === filaRep && quien(A1, 'ID cuentas', '1000-ABC')[0] === filaRep),
     'una reprogramación + un orden parcial: la reunión reprogramada conserva su RDV_UID y su ID (o frena; nunca los borra) ' +
     (p.frenar ? '(frena)' : '(fila ' + filaRep + ')'));
  ok(p.borradas.length === 0, '   y no la da por "borrada por el equipo"');
  // A3: ordenar SÓLO la columna FECHA (sin expandir): frena o deja cada traza en su reunión; nunca reubica mal ni limpia
  const sf = B.map(function (r) { return r.slice(); });
  const fechas = sf.slice(1).map(function (r) { return r[col('FECHA')]; }).sort(function (a, b) { return b - a; });
  sf.slice(1).forEach(function (r, i) { r[col('FECHA')] = fechas[i]; });
  p = plan(E, B, sf);
  ok(p.frenar || p.reubicadas.length === 0, 'ordenar sólo la columna FECHA: frena (ambigua) o no reubica nada ' + (p.frenar ? '(frena: ' + p.ambiguas.length + ' ambiguas)' : ''));
  ok(p.cambios.filter(function (c) { return c.tipo === 'limpiada'; }).length === 0 || p.frenar, '   y no limpia trazas');

  // A5 y M1 en la planilla: la copia del paso 59 (sin hora) no restaura; con un orden parcial, FRENA sin escribir nada
  const mk = function () {
    const B0 = base(entorno(), 40).map(function (r) { return r.map(function (v) { return v instanceof Date ? new Date(v.getTime()) : v; }); });
    return entorno({ bloqueBase: B0 });
  };
  let E2 = mk();
  E2.run('tomarCopiaSistema_()');
  delete E2.props[E2.cfg('PROP_GUARDIAN_COPIA')];            // como la deja el paso 59
  E2.base().valores[3][col('form_origen')] = 'lo escribió una corrida apagada';
  let r = E2.run('guardianAntesDeEscribir_(false)');
  ok(r.vieja && !r.frenar && E2.base().valores[3][col('form_origen')] === 'lo escribió una corrida apagada',
     'la copia del paso 59 (sin hora): la primera corrida prendida NO restaura (puede ser de una corrida apagada)');
  E2 = mk();
  E2.run('tomarCopiaSistema_()');
  E2.props[E2.cfg('PROP_GUARDIAN_ESCRITURA')] = String(Number(E2.props[E2.cfg('PROP_GUARDIAN_COPIA')]) + 1000);   // vieja
  const P = ordenParcial(E2, E2.base().valores.slice(0, 41).map(function (x) { return x.slice(); }));
  P.forEach(function (fila, i) { E2.base().valores[i] = fila.slice(); });
  const nEsc = E2.base().escrituras.length;
  r = E2.run('guardianAntesDeEscribir_(false)');
  ok(r.vieja && r.frenar && E2.base().escrituras.length === nEsc, 'la copia VIEJA y un orden parcial: FRENA y no escribe nada (no puede arreglarlo seguro)');
  ok(/DESALINEADA/.test(E2.log()) && !!E2.intermedia('REGISTRO_PROTECCION'), '   el aviso en grande y la línea en REGISTRO_PROTECCION');
  // M2: al final de la corrida, con la base desalineada, NO se toma la copia
  E2 = mk();
  E2.run('tomarCopiaSistema_()');
  const copiaAntes = JSON.stringify(E2.intermedia('SISTEMA_COPIA').valores);
  const P2 = ordenParcial(E2, E2.base().valores.slice(0, 41).map(function (x) { return x.slice(); }));
  P2.forEach(function (fila, i) { E2.base().valores[i] = fila.slice(); });
  const t = E2.run('tomarCopiaSiAlineada_()');
  ok(t === null && JSON.stringify(E2.intermedia('SISTEMA_COPIA').valores) === copiaAntes, 'al final de la corrida, con la base desalineada: NO toma la copia (no graba el desorden)');
  // si frena con la copia fresca: no escribe NADA (tampoco las filas que podría arreglar)
  E2 = mk();
  E2.base().valores[30] = E2.base().valores[30].slice();
  ['Figura', 'FECHA', 'Barrio', 'HORA', 'EVENTO'].forEach(function (n) { E2.base().valores[30][col(n)] = E2.base().valores[8][col(n)]; });   // un par idéntico
  E2.run('tomarCopiaSistema_()');
  const P3 = ordenParcial(E2, E2.base().valores.slice(0, 41).map(function (x) { return x.slice(); }));
  P3.forEach(function (fila, i) { E2.base().valores[i] = fila.slice(); });
  const nEsc3 = E2.base().escrituras.length;
  r = E2.run('guardianAntesDeEscribir_(false)');
  ok(r.frenar && E2.base().escrituras.length === nEsc3 && E2.intermedia('REGISTRO_PROTECCION').valores.every(function (x, i) { return i === 0 || /AMBIGUA/.test(x[1]); }),
     'con la copia fresca y una AMBIGUA: frena, no escribe NADA, y REGISTRO_PROTECCION sólo anota las ambiguas');
}

console.log('\n' + chequeos + ' chequeos.');
console.log(fallas ? fallas + ' FALLA(S)' : 'Todo en verde.');
process.exit(fallas ? 1 : 0);
