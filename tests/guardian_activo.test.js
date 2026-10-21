/**
 * tests/guardian_activo.test.js — EL GUARDIÁN de las columnas del sistema (46_Guardian.js; 09/10, REDISEÑADO el 20/10, prompt 10
 * punto 1): las clases A / B / C, el plan (cambio, desalineación, borrada, figura o fecha cambiada), el modo 'avisar' y el
 * 'restaurar', la desalineación que FRENA (no se reubica nada), la copia, los pasos 111 a 115 y las columnas nuevas.
 *
 *     node tests/guardian_activo.test.js
 *
 * [1] planGuardian_ sobre bases inventadas: sin cambios; una edición del equipo en una columna A (un cambio, no desalineación) y en
 *     una B (nada); el ORDEN PARCIAL (sólo las columnas del equipo, toda la base y sólo las últimas filas) → DESALINEACIÓN; el orden
 *     de filas enteras (nada, también una fila sin clave movida y editada: es un cambio, no desalineación); filas borradas e
 *     insertadas; figura o fecha cambiadas; una fila copiada y pegada; algo tipeado en una fila nueva; los pares figura + fecha.
 * [2] escribirGuardianLote_: sólo columnas A guardadas; lectura fresca; colores.
 * [3] guardianAntesDeEscribir_ en la planilla simulada: sin copia; modo AVISAR (avisa, no toca: REGISTRO_PROTECCION,
 *     AGENDA_PENDIENTES, el aviso); una B no se mira; modo RESTAURAR; la copia vieja; la DESALINEACIÓN frena y no escribe nada, avisa
 *     con las filas y columnas, la corrida siguiente vuelve a mirar, y arreglada se van las líneas; la copia no se toma desalineada.
 * [4] los pasos 111 (no escribe nada), 112 (sólo SISTEMA_COPIA, idempotente, sin hora), 113 (en seco, huella), 114 (exige la huella;
 *     oculta, protege con ADVERTENCIA, gris; lo del equipo intacto) y 115 (deshace sólo lo suyo); el sistema sigue escribiendo con
 *     las protecciones puestas.
 * [5] apagado (GUARDIAN_ACTIVO = false): el sello no toca nada; la corrida de la hora: el guardián PRIMERO (antes del orden de la base);
 *     si frena, todo en seco (tampoco el orden); la copia al final.
 * [6] los casos del revisor del punto 3c (09/10), con el diseño nuevo.
 * [7] el orden parcial CHICO en la planilla: frena, lista sólo esas filas, no escribe nada.
 * [8] las columnas A que nacen después del paso 114 (sólo si el 114 corrió).
 * [9] las clases: las cuatro listas cubren el encabezado una vez cada columna; A = traza + agenda + IDs; las ocultas son A.
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
  const reemplazos = o.reemplazos || {};
  if (o.modo === 'restaurar') reemplazos['00_Config.js'] = (reemplazos['00_Config.js'] || []).concat([["const GUARDIAN_MODO = 'avisar';", "const GUARDIAN_MODO = 'restaurar';"]]);
  const E = crearEntornoIds(Object.assign({ bloqueBase: o.bloqueBase || [HDR], maxColsBase: (o.bloqueBase || [HDR])[0].length, extra: ['diagnostico/27_guardian.js', '46_Guardian.js'] },
                                          o, { reemplazos: reemplazos }));
  // propiedades que persisten entre llamadas (el mock da un almacén nuevo por llamada)
  const props = {};
  E.props = props;
  E.ctx.PropertiesService = { getScriptProperties: function () {
    return { getProperty: function (k) { return k in props ? props[k] : null; }, setProperty: function (k, v) { props[k] = String(v); },
             deleteProperty: function (k) { delete props[k]; } };
  } };
  E.ctx.SpreadsheetApp.ProtectionType = { RANGE: 'RANGE' };
  // los avisos por mail (50_Avisos.js no está en este entorno): se juntan
  E.avisos = [];
  E.ctx.registrarAviso_ = function (tema, texto) { E.avisos.push({ tema: tema, texto: texto }); return true; };
  return E;
}
/** Una base de `n` filas: figuras, fechas y barrios distintos; las columnas del sistema con valores (algunas filas sin clave). */
function base(E, n) {
  const F = E.ctx.Date;
  const filas = [];
  for (let i = 0; i < n; i++) {
    const fecha = new F(2026, 5 + Math.floor(i / 28), 1 + (i % 28), 12, 0, 0);
    const o = { Figura: FIG[i % 6], Barrio: BAR[i % 7], EVENTO: 'Encuentro con Vecinos', FECHA: fecha, HORA: new F(1899, 11, 30, 17 + (i % 3), 0, 0), Inscriptos: 100 + i };
    if (i % 3 !== 2) { o.RDV_UID = 'uid-' + i; o.form_origen = 'Formulario ' + i; o.form_score = 0.9; }
    if (i % 2 === 0) { o.agenda_uid = 'c-' + i; o.agenda_fecha_escrita = fecha; o['Origen fila'] = 'agenda'; }
    if (i % 5 === 0) o['ID cuentas'] = (1000 + i) + '-ABC';
    filas.push(filaBase(o, HDR));
  }
  return [HDR].concat(filas);
}
/** Una base para la planilla simulada (las fechas como las guarda el mock). */
function basePlanilla(n) { return base(entorno(), n).map(function (r) { return r.map(function (v) { return v instanceof Date ? new Date(v.getTime()) : v; }); }); }
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
  return E.run('(function () { var c = leerEstadoGuardian_(null, __a); return planGuardian_(entradasDeEstadoGuardian_(c), leerEstadoGuardian_(null, __b)); })()');
}
const desal = function (E, p) { E.ctx.__p = p; return E.run('desalineacionGuardian_(__p)'); };
const ponerEnPlanilla = function (E, bloque) { bloque.forEach(function (fila, i) { E.base().valores[i] = fila.slice(); }); };
const pendientes = function (E) { const h = E.intermedia('AGENDA_PENDIENTES'); return h ? h.valores.slice(1).filter(function (r) { return r.some(function (x) { return x !== ''; }); }) : []; };
const idDe = function (E, r) { const h = E.intermedia('AGENDA_PENDIENTES').valores[0]; return r[h.indexOf('id')]; };

// ===================================================================================================================
console.log('[1] planGuardian_');
{
  const E = entorno();
  const B = base(E, 60);
  let p = plan(E, B, B);
  ok(p.cambios.length === 0 && !desal(E, p), 'sin cambios: nada que hacer');

  const B2 = B.map(function (r) { return r.slice(); });
  B2[10][col('form_origen')] = 'lo tipeó alguien';
  B2[11][col('Conjunta con')] = 'Fulano';
  p = plan(E, B, B2);
  igual(p.cambios.map(function (c) { return [c.fila, c.canon, c.tipo, c.valor]; }),
        [[11, 'form_origen', 'restaurada', 'Formulario 9'], [12, 'Conjunta con', 'restaurada', '']],
        'una edición del equipo en una columna A: es un CAMBIO (lo de la copia, y lo agregado en una celda vacía)');
  ok(!desal(E, p), '   y no es desalineación');
  const B3 = B.map(function (r) { return r.slice(); });
  B3[10][col('Inscriptos')] = 999; B3[12][col('Barrio')] = 'Otro'; B3[13][col('Observaciones')] = 'nota';
  p = plan(E, B, B3);
  ok(p.cambios.length === 0 && !desal(E, p), 'una edición en columnas B (Inscriptos, Barrio) y C (Observaciones): el guardián no las mira');

  const P = ordenParcial(E, B);
  p = plan(E, B, P);
  ok(desal(E, p) && p.reubicadas.length > 40, 'ORDEN PARCIAL de toda la base (sólo las columnas del equipo): DESALINEACIÓN (' + p.reubicadas.length + ' filas)');
  ok(p.cambios.every(function (c) { return SISTEMA(E).indexOf(c.col) >= 0; }), '   y lo que ve está sólo en columnas del sistema');
  E.ctx.__p = p;
  const det = E.run('detalleDesalineacionGuardian_(__p)');
  ok(det.length === p.reubicadas.length + p.ambiguas.length && det.every(function (x) { return /^fila \d+ \(.*\): las columnas del sistema no son las de esta reunión.* — columnas: /.test(x.texto) || /^filas /.test(x.texto); }),
     '   el detalle dice, por fila, que no cierran y en qué columnas: "' + det[0].texto.slice(0, 120) + '…"');
  const P20 = ordenParcial(E, B, 40, 60);
  p = plan(E, B, P20);
  ok(desal(E, p) && p.reubicadas.length > 5 && p.reubicadas.every(function (r) { return r.fila >= 42; }),
     'ORDEN PARCIAL de las últimas 20 filas: desalineación (' + p.reubicadas.length + '), todas en esas filas');

  const ent = [B[0]].concat(B.slice(1).slice().sort(function (a, b) { return String(a[col('Figura')]) < String(b[col('Figura')]) ? -1 : 1; }));
  p = plan(E, B, ent);
  ok(p.cambios.length === 0 && !desal(E, p), 'el orden de FILAS ENTERAS (Datos → Ordenar hoja, o el orden del sistema): nada');
  const ent2 = ent.map(function (r) { return r.slice(); });
  const kSin = ent2.findIndex(function (r) { return r[col('ID cuentas')] === '1005-ABC'; });   // i = 5: SIN clave, con ID
  ent2[kSin][col('ID cuentas')] = '9999-OTRO';
  p = plan(E, B, ent2);
  ok(!desal(E, p) && p.cambios.length === 1 && p.cambios[0].tipo === 'restaurada' && p.cambios[0].valor === '1005-ABC',
     'filas enteras ordenadas + una fila SIN clave editada en una A: es un cambio (no una desalineación)');

  const sin30 = B.filter(function (r, i) { return i !== 31; });   // fila 32 (i = 30: con RDV_UID, agenda e ID)
  p = plan(E, B, sin30);
  ok(p.cambios.length === 0 && p.borradas.length === 1 && !desal(E, p), 'una fila borrada por el equipo: se respeta (borradas 1, nada más)');
  const conVacia = B.slice(0, 20).concat([HDR.map(function () { return ''; })]).concat(B.slice(20));
  p = plan(E, B, conVacia);
  ok(p.cambios.length === 0 && !desal(E, p), 'una fila vacía insertada en el medio (las de abajo se corren): nada');

  const F = E.ctx.Date;
  const rep = B.map(function (r) { return r.slice(); });
  rep[1][col('FECHA')] = new F(2026, 11, 20, 12, 0, 0);     // fila 2 (i = 0, con clave): reprogramada
  rep[6][col('FECHA')] = new F(2026, 11, 21, 12, 0, 0);     // fila 7 (i = 5, SIN clave, con ID): reprogramada
  p = plan(E, B, rep);
  ok(p.cambios.length === 0 && p.huellaCambiada.length === 2 && !desal(E, p),
     'figura o fecha (columnas B) cambiadas por el equipo, con clave y sin clave: se acepta, nada (' + p.huellaCambiada.length + ')');
  p = plan(E, B, rep.filter(function (r, i) { return i !== 3; }));
  ok(p.cambios.length === 0 && !desal(E, p), '   …también si además se borró una fila de más arriba (las filas se corrieron)');

  const dup = B.concat([B[10].slice()]);
  p = plan(E, B, dup);
  ok(p.cambios.length > 0 && p.cambios.every(function (c) { return c.fila === 62 && c.tipo === 'limpiada'; }) && !desal(E, p),
     'una fila copiada y pegada (con su RDV_UID): sus columnas A no son de ninguna reunión (' + p.cambios.length + ' celdas, no desalineación)');
  const nueva = B.concat([filaBase({ Figura: 'Ana Pereyra', FECHA: new F(2026, 11, 1, 12), 'Conjunta con': 'Fulano' }, HDR)]);
  p = plan(E, B, nueva);
  igual(p.cambios.map(function (c) { return [c.fila, c.canon, c.tipo]; }), [[62, 'Conjunta con', 'limpiada']], 'algo tipeado en una columna A de una fila nueva');

  // los pares figura + fecha repetidos: un orden parcial es desalineación, se desempate o no
  const par = B.map(function (r) { return r.slice(); });
  par[51] = par[51].slice(); par[51][col('Figura')] = par[8][col('Figura')]; par[51][col('FECHA')] = par[8][col('FECHA')];
  p = plan(E, par, ordenParcial(E, par));
  ok(desal(E, p) && p.ambiguas.length === 0, 'un par figura + fecha repetido (barrio u hora distintos) y un orden parcial: desalineación (sin ambiguas)');
  const par2 = par.map(function (r) { return r.slice(); });
  ['Barrio', 'HORA', 'EVENTO'].forEach(function (n) { par2[51][col(n)] = par2[8][col(n)]; });
  p = plan(E, par2, ordenParcial(E, par2));
  ok(desal(E, p) && p.ambiguas.length >= 1, 'el mismo par, idéntico en barrio, hora y evento: AMBIGUA → desalineación (' + p.ambiguas.length + ')');
}

// ===================================================================================================================
console.log('[2] escribirGuardianLote_ (la cuarta excepción, modo restaurar)');
{
  const E2 = entorno({ bloqueBase: basePlanilla(10) });
  const sh = 'ssDestino_().getSheetByName(RDV_HOJA_DESTINO)';
  let err = '';
  try { E2.run('escribirGuardianLote_(' + sh + ', ' + sh + '.getRange(1,1,1,' + HDR.length + ').getValues()[0], [{ fila: 2, col: ' + (col('Figura') + 1) + ', valor: "X", puesto: "' + FIG[0] + '" }])'); }
  catch (e) { err = String(e.message || e); }
  ok(/no es una columna del sistema/.test(err) && E2.base().valores[1][col('Figura')] === FIG[0], 'una columna B (Figura): error y no escribe nada');
  err = '';
  try { E2.run('escribirGuardianLote_(' + sh + ', ' + sh + '.getRange(1,1,1,' + HDR.length + ').getValues()[0], [{ fila: 2, col: ' + (col('Comuna') + 1) + ', valor: "X", puesto: "" }])'); }
  catch (e) { err = String(e.message || e); }
  ok(/no es una columna del sistema/.test(err), 'una derivada (Comuna): error (las recalcula la corrida, no el guardián)');
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
  ok(!E2.props[E2.cfg('PROP_GUARDIAN_ESCRITURA')], 'no deja el sello de escritura del sistema');
}

// ===================================================================================================================
console.log('[3] guardianAntesDeEscribir_ en la planilla simulada');
{
  let E = entorno({ bloqueBase: basePlanilla(40) });
  let r = E.run('guardianAntesDeEscribir_(false)');
  ok(r.sinCopia && !r.frenar && E.base().escrituras.length === 0, 'sin copia: no compara, no escribe, no frena');
  E.run('tomarCopiaSistema_()');
  ok(!!E.intermedia('SISTEMA_COPIA') && E.intermedia('SISTEMA_COPIA').valores.length === 41 && !!E.props[E.cfg('PROP_GUARDIAN_COPIA')],
     'la copia: una fila por fila de la base (40) y la hora');
  ok(E.cfg('GUARDIAN_MODO') === 'avisar', 'GUARDIAN_MODO = "avisar" en 00_Config.js');
  E.base().valores[3][col('agenda_fecha_escrita')] = 'tipeado';      // fila 4 (i = 2: de la agenda)
  E.base().valores[5][col('Inscriptos')] = 555;                       // una B: no se mira
  r = E.run('guardianAntesDeEscribir_(true)');
  ok(r.plan.cambios.length === 1 && !E.intermedia('REGISTRO_PROTECCION') && !E.intermedia('AGENDA_PENDIENTES') && !E.avisos.length,
     'en seco: dice qué avisaría (1: la B no cuenta) y no escribe nada (ni REGISTRO_PROTECCION, ni AGENDA_PENDIENTES, ni avisos)');
  r = E.run('guardianAntesDeEscribir_(false)');
  ok(!r.frenar && r.escritas === 0 && E.base().valores[3][col('agenda_fecha_escrita')] === 'tipeado' && E.base().escrituras.length === 0,
     'modo AVISAR: no lo restaura ni escribe nada en la base, y la corrida sigue (no frena)');
  const reg = E.intermedia('REGISTRO_PROTECCION');
  ok(!!reg && reg.valores.length === 2 && /avisada/.test(reg.valores[1][1]) && reg.valores[1][2] === 4 && reg.valores[1][3] === 'agenda_fecha_escrita',
     '   REGISTRO_PROTECCION: "avisada", fila 4, agenda_fecha_escrita');
  const pen = pendientes(E);
  ok(pen.length === 1 && /^guardian\|cambio\|/.test(idDe(E, pen[0])) && pen[0][0] === E.cfg('GUARDIAN_TIPO_PENDIENTE_CAMBIO'),
     '   AGENDA_PENDIENTES: una línea del guardián ("' + (pen[0] || [])[0] + '")');
  ok(E.avisos.length === 1 && E.avisos[0].tema === 'guardian_cambios' && /fila 4 .*agenda_fecha_escrita: "tipeado"/.test(E.avisos[0].texto) && /AVISAR: no se tocó nada/.test(E.avisos[0].texto),
     '   el aviso por mail (guardian_cambios), con la fila y la columna');
  // la copia vieja: el sistema escribió después de tomarla → no compara
  E.base().valores[6][col('form_origen')] = 'otro';
  E.props[E.cfg('PROP_GUARDIAN_ESCRITURA')] = String(Number(E.props[E.cfg('PROP_GUARDIAN_COPIA')]) + 1000);
  E.avisos = [];
  r = E.run('guardianAntesDeEscribir_(false)');
  ok(r.vieja && !r.frenar && E.base().valores[6][col('form_origen')] === 'otro' && !E.avisos.length, 'la copia VIEJA (el sistema escribió después): no compara celdas ni avisa');

  // modo RESTAURAR
  E = entorno({ bloqueBase: basePlanilla(40), modo: 'restaurar' });
  E.run('tomarCopiaSistema_()');
  E.base().valores[3][col('agenda_fecha_escrita')] = 'tipeado';
  r = E.run('guardianAntesDeEscribir_(false)');
  ok(E.base().valores[3][col('agenda_fecha_escrita')] instanceof Date && r.escritas === 1 && !r.frenar, 'modo RESTAURAR: lo vuelve a lo de la copia (la fecha que había escrito la agenda)');
  ok(/restaurada/.test(E.intermedia('REGISTRO_PROTECCION').valores[1][1]) && E.avisos.length === 1 && /RESTAURÓ/.test(E.avisos[0].texto) &&
     pendientes(E)[0][0] === E.cfg('GUARDIAN_TIPO_PENDIENTE_RESTAURADA'), '   y lo registra y avisa ("restaurada")');

  // LA DESALINEACIÓN: frena, no escribe NADA (en ningún modo), avisa con las filas y las columnas
  ['avisar', 'restaurar'].forEach(function (modo) {
    const X = entorno({ bloqueBase: basePlanilla(40), modo: modo });
    X.run('tomarCopiaSistema_()');
    const copiaAntes = JSON.stringify(X.intermedia('SISTEMA_COPIA').valores);
    const B0 = X.base().valores.map(function (x) { return x.slice(); });
    const P = ordenParcial(X, X.base().valores.slice(0, 41).map(function (x) { return x.slice(); }));
    ponerEnPlanilla(X, P);
    const foto = JSON.stringify({ v: X.base().valores, f: X.base().fondos });
    const rr = X.run('guardianAntesDeEscribir_(false)');
    ok(rr.frenar && rr.desalineada && X.base().escrituras.length === 0 && JSON.stringify({ v: X.base().valores, f: X.base().fondos }) === foto,
       'modo ' + modo + ': un ORDEN PARCIAL → FRENA y no escribe NADA en la base (no "reubica")');
    const pd = pendientes(X);
    ok(pd.length === rr.detalle.length && pd.every(function (l) { return l[0] === X.cfg('GUARDIAN_TIPO_PENDIENTE_DESALINEADA') && /columnas: /.test(l[8]); }) &&
       X.avisos.length === 1 && X.avisos[0].tema === 'guardian_desalineacion' && /fila \d+ /.test(X.avisos[0].texto) && /RDV_UID|form_origen|agenda_uid/.test(X.avisos[0].texto),
       '   avisa: AGENDA_PENDIENTES (' + pd.length + ' líneas, con fila y columnas) y el mail (guardian_desalineacion)');
    ok(X.intermedia('REGISTRO_PROTECCION').valores.slice(1).every(function (x) { return /DESALINEADA/.test(x[1]); }), '   REGISTRO_PROTECCION: "DESALINEADA: no se escribió nada"');
    ok(X.run('tomarCopiaSiAlineada_()') === null && JSON.stringify(X.intermedia('SISTEMA_COPIA').valores) === copiaAntes,
       '   la copia NO se toma con la base desalineada (no se graba el desorden)');
    if (modo === 'avisar') {
      const rr2 = X.run('guardianAntesDeEscribir_(false)');
      ok(rr2.frenar && pendientes(X).length === pd.length, '   la corrida siguiente vuelve a mirar: frena otra vez (y no duplica las líneas)');
      const orig = JSON.parse(copiaAntes);   // se arregla: la base vuelve a como estaba (Edición → Deshacer)
      ponerEnPlanilla(X, B0);
      const rr3 = X.run('guardianAntesDeEscribir_(false)');
      ok(!rr3.frenar && pendientes(X).length === 0 && orig.length === 41, '   arreglada: no frena, y las líneas de la desalineación se van de AGENDA_PENDIENTES' +
         (process.env.VER ? JSON.stringify({ f: rr3.frenar, r: rr3.resumen, p: pendientes(X).length }) : ''));
    }
  });
  // la copia VIEJA y un orden parcial: frena igual
  E = entorno({ bloqueBase: basePlanilla(40) });
  E.run('tomarCopiaSistema_()');
  E.props[E.cfg('PROP_GUARDIAN_ESCRITURA')] = String(Number(E.props[E.cfg('PROP_GUARDIAN_COPIA')]) + 1000);
  ponerEnPlanilla(E, ordenParcial(E, E.base().valores.slice(0, 41).map(function (x) { return x.slice(); })));
  r = E.run('guardianAntesDeEscribir_(false)');
  ok(r.vieja && r.frenar && E.base().escrituras.length === 0, 'la copia VIEJA y un orden parcial: FRENA igual (la desalineación se mira siempre)');
  // AGENDA_PENDIENTES con líneas de la agenda: el guardián no las toca
  E = entorno({ bloqueBase: basePlanilla(20) });
  E.run('escribirHoja_(AGENDA_SOLAPA_PENDIENTES, [_encPendientesGuardian_().slice(), ["pendiente de definir", "una reunión", "", "", "", "", "", "", "falta", "esperar", new Date(), "pend|1", ""]])');
  E.run('tomarCopiaSistema_()');
  E.base().valores[2][col('form_origen')] = 'x';
  E.run('guardianAntesDeEscribir_(false)');
  const pp = pendientes(E);
  ok(pp.length === 2 && idDe(E, pp[0]) === 'pend|1' && /^guardian\|/.test(idDe(E, pp[1])), 'AGENDA_PENDIENTES: la línea de la agenda queda; la del guardián, al final');
}

// ===================================================================================================================
console.log('[4] los pasos 111 a 115');
/** Protecciones, columnas ocultas y la escritura (que respeta las protecciones REALES, no las de advertencia), en el mock. */
function conProtecciones(E) {
  const sh = E.base().sheet;
  const ocultas = [], protecciones = [];
  sh.isColumnHiddenByUser = function (c) { return ocultas.indexOf(c) >= 0; };
  sh.hideColumns = function (c) { if (ocultas.indexOf(c) < 0) ocultas.push(c); };
  sh.showColumns = function (c) { const k = ocultas.indexOf(c); if (k >= 0) ocultas.splice(k, 1); };
  const mkProt = function (p) {
    return { getRange: function () { return { getColumn: function () { return p.c; }, getLastColumn: function () { return p.c2 || p.c; }, getRow: function () { return 1; }, getLastRow: function () { return 100000; } }; },
             getDescription: function () { return p.desc; }, isWarningOnly: function () { return p.adv; },
             remove: function () { const k = protecciones.indexOf(p); if (k >= 0) protecciones.splice(k, 1); } };
  };
  sh.getProtections = function () { return protecciones.map(mkProt); };
  const getRangeOrig = sh.getRange;
  sh.getRange = function (r, c, nr, nc) {
    if (typeof r === 'string') {
      const letra = r.split(':')[0];
      let n = 0; for (let i = 0; i < letra.length; i++) n = n * 26 + (letra.charCodeAt(i) - 64);
      return { protect: function () { const p = { c: n, desc: '', adv: false }; protecciones.push(p);
        const o = { setDescription: function (d) { p.desc = d; return o; }, setWarningOnly: function (w) { p.adv = w; return o; } }; return o; } };
    }
    const rg = getRangeOrig(r, c, nr, nc);
    // como Sheets para un usuario sin permiso: una protección REAL bloquea la escritura; una de advertencia, no (el script sigue)
    const setV = rg.setValues;
    rg.setValues = function (m) {
      const c2 = c + (nc || 1) - 1;
      if (protecciones.some(function (p) { return !p.adv && p.c <= c2 && (p.c2 || p.c) >= c && p.bloquea; })) throw new Error('protegida');
      return setV.call(rg, m);
    };
    return rg;
  };
  return { ocultas: ocultas, protecciones: protecciones };
}
{
  const B = basePlanilla(30);
  const E = entorno({ bloqueBase: B });
  const pr = conProtecciones(E);
  // una protección del EQUIPO sobre una columna A ("ID cuentas") y la de las derivadas del paso 26 ("Comuna")
  pr.protecciones.push({ c: col('ID cuentas') + 1, desc: 'protegida por alguien del equipo', adv: true });
  pr.protecciones.push({ c: col('Comuna') + 1, desc: E.cfg('DESC_PROTECCION_DERIVADAS'), adv: true });
  E.base().fondos['1:' + (col('Origen fila') + 1)] = '#FF0000';   // un encabezado A que el equipo había pintado
  const foto = function () { return JSON.stringify({ v: E.base().valores, f: E.base().fondos }); };
  const f0 = foto();

  // 111
  const s = E.run('guardianEnSeco()');
  ok(foto() === f0 && !E.intermedia('SISTEMA_COPIA') && !E.intermedia('REGISTRO_PROTECCION') && !E.intermedia('AGENDA_PENDIENTES') && !E.avisos.length &&
     pr.ocultas.length === 0 && pr.protecciones.length === 2 && Object.keys(E.props).length === 0,
     'paso 111: no escribe NADA (ni la base, ni la intermedia, ni propiedades, ni avisos)');
  ok(s.clases.sinClase.length === 0 && s.clases.columnas.filter(function (c) { return c.clase === 'A'; }).length === 24 &&
     s.clases.columnas.filter(function (c) { return c.clase === 'A derivada'; }).length === 12 && s.clases.columnas.filter(function (c) { return c.clase === 'B'; }).length === 24 &&
     s.clases.columnas.filter(function (c) { return c.clase === 'C'; }).length === 5, 'paso 111: las clases de las 65 columnas (A 24, derivadas 12, B 24, C 5, sin clase 0)');
  ok(!s.copiaNueva.desalineada && s.copiaNueva.cambios === 0 && s.copiaNueva.clavesRepetidas === 0, 'paso 111: con una copia nueva, 0 (nada que avisar)');
  ok(s.prueba.frena && s.prueba.filas > 5, 'paso 111: la prueba en memoria del orden parcial FRENA (' + s.prueba.filas + ' filas)');
  ok(/1\. LAS CLASES/.test(E.log()) && /C\. DEL EQUIPO \(5\)/.test(E.log()) && /SIN CLASE \(0\)/.test(E.log()), 'paso 111: el log con la lista');
  const Eraro = entorno({ bloqueBase: [HDR.concat(['Columna rara'])].concat(B.slice(1).map(function (r) { return r.concat(['x']); })) });
  const sr = Eraro.run('guardianEnSeco()');
  ok(sr.clases.sinClase.length === 1 && sr.clases.sinClase[0] === 'Columna rara' && /DECIDIR/.test(Eraro.log()), 'paso 111: una columna que no está en ninguna lista sale "SIN CLASE"');

  // 112
  const c1 = E.run('guardianCopiaNueva(true)');
  const copia1 = JSON.stringify(E.intermedia('SISTEMA_COPIA').valores);
  ok(c1.filas === 30 && foto() === f0 && !E.props[E.cfg('PROP_GUARDIAN_COPIA')], 'paso 112: escribe sólo SISTEMA_COPIA (30 filas), sin hora; la base intacta');
  E.run('guardianCopiaNueva(true)');
  ok(JSON.stringify(E.intermedia('SISTEMA_COPIA').valores) === copia1, 'paso 112 otra vez: lo mismo (idempotente)');

  // 113 / 114
  let r = E.run('ocultarProteger()');
  ok(r.error && /paso 113/.test(r.error) && pr.ocultas.length === 0 && pr.protecciones.length === 2, 'paso 114 sin el 113: no hace nada');
  const s113 = E.run('ocultarProteger_enSeco()');
  ok(s113.ocultar === 14 && s113.proteger === 35 && s113.gris === 36 && s113.delEquipo === 1 && foto() === f0 && pr.protecciones.length === 2,
     'paso 113: ocultaría 14, protegería 35 (la de las derivadas ya está), gris en 36; 1 protección del equipo; no escribe nada');
  r = E.run('ocultarProteger()');
  ok(!r.error && r.ocultas === 14 && r.protegidas === 35, 'paso 114: oculta 14 y protege 35 (con la huella del 113)');
  const nuestras = pr.protecciones.filter(function (p) { return p.desc === E.cfg('DESC_PROTECCION_SISTEMA'); });
  ok(nuestras.length === 35 && nuestras.every(function (p) { return p.adv; }), '   todas con ADVERTENCIA (no bloquean ordenar ni borrar)');
  ok(pr.protecciones.some(function (p) { return p.desc === 'protegida por alguien del equipo'; }) && pr.protecciones.some(function (p) { return p.desc === E.cfg('DESC_PROTECCION_DERIVADAS'); }),
     '   la del equipo y la de las derivadas, intactas');
  igual(pr.ocultas.map(function (c) { return HDR[c - 1]; }).sort(), E.cfg('GUARDIAN_OCULTAR').slice().sort(), '   las ocultas son exactamente las técnicas (traza y agenda_*)');
  const sis = SISTEMA(E);
  ok(nuestras.every(function (p) { return sis.indexOf(p.c - 1) >= 0; }), '   ninguna columna B ni C protegida');
  ok(JSON.stringify(E.base().valores) === JSON.stringify(JSON.parse(f0).v), '   ningún valor cambia');
  const fondosDatos = function (fo) { return JSON.stringify(Object.keys(fo).filter(function (k) { return !/^1:/.test(k); }).sort().map(function (k) { return [k, fo[k]]; })); };
  ok(fondosDatos(E.base().fondos) === fondosDatos(JSON.parse(f0).f), '   ningún fondo de datos cambia (sólo el encabezado)');
  ok(Object.keys(E.base().fondos).filter(function (k) { return /^1:/.test(k) && E.base().fondos[k] === E.cfg('GUARDIAN_GRIS_ENCABEZADO'); }).length === 36, '   el encabezado gris en las 36');
  r = E.run('ocultarProteger()');
  ok(r.error && pr.protecciones.filter(function (p) { return p.desc === E.cfg('DESC_PROTECCION_SISTEMA'); }).length === 35, '   la huella sirve una vez');
  const s2 = E.run('ocultarProteger_enSeco()');
  ok(s2.ocultar === 0 && s2.proteger === 0 && s2.gris === 0 && !s2.huella, '   el 113 otra vez: nada que hacer');

  // el sistema sigue escribiendo con las protecciones puestas (son de advertencia)
  pr.protecciones.push({ c: col('Observaciones') + 1, desc: 'del equipo, real', adv: false, bloquea: true });
  let bloqueada = false;
  try { E.run('ssDestino_().getSheetByName(RDV_HOJA_DESTINO).getRange(2, ' + (col('Observaciones') + 1) + ', 1, 1).setValues([["x"]])'); } catch (e) { bloqueada = /protegida/.test(e.message); }
  E.base().valores[2][col('ID cuentas')] = '';
  E.base().valores[2][col('form_nivel')] = '';
  const hechas = E.run('setSiDelSistemaLote_(ssDestino_().getSheetByName(RDV_HOJA_DESTINO), ssDestino_().getSheetByName(RDV_HOJA_DESTINO).getRange(1,1,1,' + HDR.length + ').getValues()[0], ' +
                       '[{ fila: 3, col: ' + (col('ID cuentas') + 1) + ', valor: "7777-NUEVO" }, { fila: 3, col: ' + (col('form_nivel') + 1) + ', valor: "figura+fecha" }])');
  ok(bloqueada && hechas.length === 2 && E.base().valores[2][col('ID cuentas')] === '7777-NUEVO', 'con las protecciones (de advertencia) puestas, el sistema sigue escribiendo columnas A (una protección REAL sí bloquearía)');
  pr.protecciones.pop();

  // 115
  const d0 = E.run('deshacerOcultarProteger(false)');
  ok(d0.enSeco && d0.mostradas === 14 && d0.desprotegidas === 35 && pr.ocultas.length === 14, 'paso 115 en seco: mostraría 14, sacaría 35; no toca nada');
  const d1 = E.run('deshacerOcultarProteger(true)');
  ok(d1.mostradas === 14 && d1.desprotegidas === 35 && pr.ocultas.length === 0 && pr.protecciones.length === 2 &&
     pr.protecciones.some(function (p) { return p.desc === 'protegida por alguien del equipo'; }), 'paso 115: muestra todo, saca SÓLO las del sistema (quedan la del equipo y la de las derivadas)');
  ok(E.base().fondos['1:' + (col('Origen fila') + 1)] === '#FF0000' && !Object.keys(E.base().fondos).some(function (k) { return /^1:/.test(k) && E.base().fondos[k] === E.cfg('GUARDIAN_GRIS_ENCABEZADO'); }),
     '   el encabezado vuelve a su color de antes (el rojo del equipo, también)');
  ok(!E.props[E.cfg('PROP_GUARDIAN_PREPARADO')] && E.run('deshacerOcultarProteger(true)').desprotegidas === 0, '   y otra vez: nada');
}

// ===================================================================================================================
console.log('[5] apagado y prendido');
{
  const E = entorno();
  let tocadas = 0;
  E.ctx.PropertiesService = { getScriptProperties: function () { tocadas++; return { getProperty: function () { return null; }, setProperty: function () {} }; } };
  E.run('_selloEscrituraSistema_()');
  ok(E.cfg('GUARDIAN_ACTIVO') === false && tocadas === 0, 'GUARDIAN_ACTIVO = false: el sello no toca ni las propiedades');
  ok(E.run('guardianCopiaTrasEscritura_("x")') === null && tocadas === 0 && !E.intermedia('SISTEMA_COPIA'), '   y la copia después de un paso a mano no hace nada');
  const up = fs.readFileSync(path.join(__dirname, '..', '20_UpsertDestino.js'), 'utf8');
  const iG = up.indexOf('resGuardian = guardianAntesDeEscribir_(enSeco)'), iO = up.indexOf('const o = ordenarBaseEnLaHora_();'), iAg = up.indexOf('correrAgendaEnBloqueo_(enSeco)'), iC = up.indexOf('try { tomarCopiaSiAlineada_(); }');
  ok(iG > 0 && iG < iO && iO < iAg && iC > iAg, 'la corrida de la hora: el guardián PRIMERO (antes del orden de la base y de la agenda), la copia al final');
  ok(/if \(GUARDIAN_ACTIVO\) \{[\s\S]{0,120}?try \{ resGuardian = guardianAntesDeEscribir_\(enSeco\); \}/.test(up) && /if \(GUARDIAN_ACTIVO && !enSeco\) \{[\s\S]{0,500}?try \{ tomarCopiaSiAlineada_\(\); \}/.test(up),
     '   las dos, sólo con GUARDIAN_ACTIVO');
  ok(/if \(resGuardian\.frenar && !enSeco\) \{[\s\S]{0,500}enSeco = true;/.test(up) && /BASE_ORDEN_POR_FECHA && !enSeco && !historial/.test(up),
     '   si frena, el resto de la corrida va en seco: tampoco el orden de la base');
  // prendido: las escrituras del sistema dejan el sello
  const E2 = entorno({ bloqueBase: [HDR, filaBase({ Figura: FIG[0], FECHA: D(1, 6) }, HDR)], reemplazos: { '00_Config.js': [['const GUARDIAN_ACTIVO = false;', 'const GUARDIAN_ACTIVO = true;']] } });
  E2.run('setSiDelSistemaLote_(ssDestino_().getSheetByName(RDV_HOJA_DESTINO), ssDestino_().getSheetByName(RDV_HOJA_DESTINO).getRange(1,1,1,' + HDR.length + ').getValues()[0], [{ fila: 2, col: ' + (col('Inscriptos') + 1) + ', valor: 10 }])');
  ok(!!E2.props[E2.cfg('PROP_GUARDIAN_ESCRITURA')], 'prendido: una escritura del sistema deja el sello');
  ok(E2.run('guardianCopiaTrasEscritura_("un paso a mano")') === 1 && !!E2.intermedia('SISTEMA_COPIA'), '   y la copia después de un paso a mano se toma');
  // los pasos a mano que escriben la base llaman a la copia
  const llama = function (f, re) { return re.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')); };
  ok(llama('40_Agenda.js', /guardianCopiaTrasEscritura_\('la agenda a mano'\)/) && llama('40_Agenda.js', /guardianCopiaTrasEscritura_\('deshacer la agenda \(paso 38\)'\)/) &&
     llama('54_FusionAgenda.js', /guardianCopiaTrasEscritura_\('la fusión \(paso 97\)'\)/) && llama('58_CorregirReunion.js', /guardianCopiaTrasEscritura_\('la corrección \(c02\)'\)/) &&
     llama('58_CorregirReunion.js', /guardianCopiaTrasEscritura_\('deshacer la corrección \(c08\)'\)/) && llama('57_OrdenBase.js', /guardianCopiaTrasEscritura_\('el orden de la base \(paso 108\)'\)/) &&
     llama('57_OrdenBase.js', /guardianCopiaTrasEscritura_\('deshacer el orden \(paso 109\)'\)/) && llama('45_IdsCuentas.js', /guardianCopiaTrasEscritura_\('los IDs \(paso 57\)'\)/) &&
     llama('52_CancelacionMail.js', /guardianCopiaTrasEscritura_\('la suspensión a mano \(paso 92\)'\)/) && llama('56_SepararReunion.js', /guardianCopiaTrasEscritura_\('separar la reunión/),
     'la copia después de cada paso a mano que escribe: la agenda a mano, deshacer (38), la fusión (97), c02 / c08, el orden (108 / 109), los IDs (57), el 92, separar');
}

// ===================================================================================================================
console.log('[6] los casos del revisor del punto 3c (09/10), con el diseño nuevo');
{
  const E = entorno();
  const F = E.ctx.Date;
  const B = base(E, 60);
  // un INTERCAMBIO de fechas entre dos reuniones (sin ordenar nada): cada una conserva su traza
  const sw = B.map(function (r) { return r.slice(); });
  const f2 = sw[1][col('FECHA')], f8 = sw[7][col('FECHA')];
  sw[1][col('FECHA')] = f8; sw[7][col('FECHA')] = f2;
  let p = plan(E, B, sw);
  ok(!desal(E, p) && p.cambios.length === 0, 'un INTERCAMBIO de fechas entre dos reuniones: no es una desalineación (nada)');
  // una reprogramación + un orden parcial: frena (nunca la da por borrada)
  const rep = B.map(function (r) { return r.slice(); });
  rep[1][col('FECHA')] = new F(2026, 8, 15, 12, 0, 0);
  p = plan(E, B, ordenParcial(E, rep));
  ok(desal(E, p), 'una reprogramación + un orden parcial: DESALINEACIÓN (frena; no se escribe nada)');
  // ordenar SÓLO la columna FECHA: frena o no ve nada; nunca escribe
  const sf = B.map(function (r) { return r.slice(); });
  const fechas = sf.slice(1).map(function (r) { return r[col('FECHA')]; }).sort(function (a, b) { return b - a; });
  sf.slice(1).forEach(function (r, i) { r[col('FECHA')] = fechas[i]; });
  p = plan(E, B, sf);
  ok(desal(E, p) || p.cambios.length === 0, 'ordenar sólo la columna FECHA: ' + (desal(E, p) ? 'frena (' + (p.reubicadas.length + p.ambiguas.length) + ')' : 'nada'));
  // la copia del paso 112 (sin hora): la primera corrida prendida NO compara celdas; con un orden parcial, FRENA
  let E2 = entorno({ bloqueBase: basePlanilla(40) });
  E2.run('guardianCopiaNueva(true)');
  E2.base().valores[3][col('form_origen')] = 'lo escribió una corrida apagada';
  let r = E2.run('guardianAntesDeEscribir_(false)');
  ok(r.vieja && !r.frenar && E2.base().valores[3][col('form_origen')] === 'lo escribió una corrida apagada' && !E2.avisos.length,
     'la copia del paso 112 (sin hora): la primera corrida prendida NO compara celdas (pudo escribirlas una corrida apagada)');
  E2 = entorno({ bloqueBase: basePlanilla(40) });
  E2.run('guardianCopiaNueva(true)');
  ponerEnPlanilla(E2, ordenParcial(E2, E2.base().valores.slice(0, 41).map(function (x) { return x.slice(); })));
  r = E2.run('guardianAntesDeEscribir_(false)');
  ok(r.vieja && r.frenar && E2.base().escrituras.length === 0 && E2.avisos.length === 1, '   y con un orden parcial: FRENA, no escribe nada y avisa');
}

// ===================================================================================================================
console.log('[7] el ORDEN PARCIAL CHICO en la planilla: sólo las últimas filas; el resto, quieto');
{
  const E = entorno({ bloqueBase: basePlanilla(40) });
  E.run('tomarCopiaSistema_()');
  const antes = E.base().valores.map(function (x) { return x.slice(); });
  const P = ordenParcial(E, E.base().valores.slice(0, 41).map(function (x) { return x.slice(); }), 30, 40);
  const movidas = P.filter(function (r, i) { return i > 0 && r[col('Figura')] !== antes[i][col('Figura')]; }).length;
  ponerEnPlanilla(E, P);
  const r = E.run('guardianAntesDeEscribir_(false)');
  ok(movidas >= 5 && r.frenar && r.detalle.length > 0, 'el orden parcial CHICO (' + movidas + ' filas movidas entre las últimas 10): FRENA (' + r.detalle.length + ' filas)');
  ok(r.detalle.every(function (x) { return x.filas.every(function (f) { return f >= 32; }); }), '   y sólo lista esas filas (32 a 41)');
  ok(E.base().escrituras.length === 0, '   sin escribir nada en la base');
}

// ===================================================================================================================
console.log('[8] las columnas A que NACEN después del paso 114: protegidas, grises y, si son técnicas, ocultas');
{
  const E = entorno({ bloqueBase: basePlanilla(10) });
  const pr = conProtecciones(E);
  ok(E.run('asegurarColumnasNuevasGuardian_()').sinPaso114 && pr.protecciones.length === 0, 'sin el paso 114: no hace nada (no protege todo por su cuenta)');
  E.run('ocultarProteger_enSeco()');
  E.run('ocultarProteger()');
  ok(E.run('asegurarColumnasNuevasGuardian_()').nuevas.length === 0, 'después del paso 114: ninguna nueva');
  const cID = col('ID cuentas') + 1, cUid = col('agenda_uid') + 1, cScore = col('form_score') + 1;
  [cID, cUid].forEach(function (c) { for (let i = pr.protecciones.length - 1; i >= 0; i--) if (pr.protecciones[i].c === c) pr.protecciones.splice(i, 1); });
  [cUid, cScore].forEach(function (c) { const k = pr.ocultas.indexOf(c); if (k >= 0) pr.ocultas.splice(k, 1); });
  [cID, cUid].forEach(function (c) { delete E.base().fondos['1:' + c]; });
  const r = E.run('asegurarColumnasNuevasGuardian_()');
  ok(r.nuevas.length === 2 && pr.protecciones.filter(function (p) { return (p.c === cID || p.c === cUid) && p.adv; }).length === 2,
     'las dos nuevas, protegidas con ADVERTENCIA: ' + r.nuevas.join(', '));
  ok(pr.ocultas.indexOf(cUid) >= 0 && pr.ocultas.indexOf(cID) < 0 && pr.ocultas.indexOf(cScore) < 0,
     '   la técnica (agenda_uid) se oculta; ID cuentas a la vista; form_score, que el equipo mostró, NO se vuelve a ocultar');
  ok(E.base().fondos['1:' + cID] === E.cfg('GUARDIAN_GRIS_ENCABEZADO') && E.run('asegurarColumnasNuevasGuardian_()').nuevas.length === 0, '   el encabezado gris; otra vez: nada');
  const d = E.run('deshacerOcultarProteger(true)');
  ok(pr.ocultas.length === 0 && pr.protecciones.length === 0 && d.desprotegidas > 30, '   el paso 115 también deshace lo de las columnas nuevas');
  const up = fs.readFileSync(path.join(__dirname, '..', '20_UpsertDestino.js'), 'utf8');
  ok(/if \(GUARDIAN_ACTIVO && !enSeco\) \{[\s\S]{0,300}try \{ asegurarColumnasNuevasGuardian_\(\); \}[\s\S]{0,200}try \{ tomarCopiaSiAlineada_\(\); \}/.test(up),
     'la corrida de la hora: al final, sólo con GUARDIAN_ACTIVO y no en seco, antes de la copia');
}

// ===================================================================================================================
console.log('[9] las clases de 00_Config.js');
{
  const E = entorno();
  const A = E.cfg('GUARDIAN_CLASE_A'), AD = E.cfg('GUARDIAN_CLASE_A_DERIVADAS'), Bc = E.cfg('GUARDIAN_CLASE_B'), C = E.cfg('GUARDIAN_CLASE_C');
  const ord = function (l) { return Array.prototype.slice.call(l).sort(); };
  igual(ord(A), ord([].concat(E.cfg('COLUMNAS_TRAZA'), E.cfg('COLUMNAS_AGENDA'), E.cfg('COLUMNAS_IDS'))), 'A = COLUMNAS_TRAZA + COLUMNAS_AGENDA + COLUMNAS_IDS');
  igual(ord(AD), ord(E.run('columnasDerivadas_()')), 'A derivadas = las once + la ID (columnasDerivadas_ con LOOKER_EN_SISTEMA)');
  const todas = [].concat(A, AD, Bc, C);
  igual(ord(todas), ord(HDR), 'las cuatro listas cubren el encabezado de la base, cada columna UNA vez (' + todas.length + ')');
  ok(E.cfg('GUARDIAN_OCULTAR').every(function (n) { return A.indexOf(n) >= 0; }), 'las ocultas son todas A');
  ok(['Masculinos', 'Femeninos', '18-24', '66+', 'Sin identificar', 'Asistentes', 'Oradores anotados', 'STATUS REUNIÓN'].every(function (n) { return Bc.indexOf(n) >= 0; }) &&
     E.cfg('COLUMNAS_QUE_ESCRIBE_AGENDA').filter(function (n) { return A.indexOf(n) < 0; }).every(function (n) { return Bc.indexOf(n) >= 0; }),
     'B: sexo, edades, Sin identificar, Asistentes, Oradores, STATUS y lo que escribe la agenda fuera de las A');
  ok(E.run('esColumnaGuardada_("ID de cuentas")') && !E.run('esColumnaGuardada_("Figura")') && !E.run('esColumnaGuardada_("Comuna")'), 'esColumnaGuardada_: las A (con los alias de los IDs); no las B ni las derivadas');
}

console.log('\n' + chequeos + ' chequeos.');
console.log(fallas ? fallas + ' FALLA(S)' : 'Todo en verde.');
process.exit(fallas ? 1 : 0);
