/**
 * tests/ids_cuentas.test.js — los IDs de los encuentros (45_IdsCuentas.js, 08/10): el flujo entero en un Apps Script
 * simulado (tests/ids_mock.js).
 *
 *     node tests/ids_cuentas.test.js
 *
 * [1] el historial (paso 57): columnas al final sin formato heredado, qué se escribe y dónde (3735 → 805 por fecha
 *     distinta, la conjunta, Seguridad, el Tipo), color y formato sólo en lo escrito, REGISTRO_IDS e IDS_SIN_CRUZAR;
 * [2] idempotente: la segunda corrida no escribe nada;
 * [3] en seco (paso 56) y la medición (paso 55) no escriben la base; la medición tampoco la intermedia;
 * [4] las columnas que ya están (con otras mayúsculas o sin tilde) se usan, no se agregan;
 * [5] el bloqueo ocupado y el archivo de la lista sin permiso: no se escribe nada y el error lo dice;
 * [6] determinismo: la lista y la base en otro orden dan los mismos IDs en las mismas filas;
 * [7] la corrida de la hora: sólo filas activas, enganchada después de la agenda y apagada (IDS_EN_LA_HORA = false).
 *
 * Las reglas finas de cada solapa están en tests/ids_lista_jm.test.js y tests/ids_lista_funcionarios.test.js.
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: IDs, fechas y casos inventados.
 */
'use strict';
const fs = require('fs'), path = require('path');
const { crearEntornoIds, filaBase, hdrBase, D } = require('./ids_mock');

let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }

// ---------------------------- el escenario ----------------------------
// 803 filas de relleno (2..804, de otra figura, viejas) y desde la 805 las del caso.
function baseEscenario() {
  const b = [];
  for (let i = 0; i < 803; i++) {
    b.push(filaBase({ Figura: 'Ana Pereyra', Barrio: 'Palermo', EVENTO: 'Encuentro con Vecinos', FECHA: D(1 + (i % 28), 1 + (i % 8)) }));
  }
  b.push(filaBase({ Figura: 'Jorge Macri', Barrio: 'Belgrano', EVENTO: 'Encuentro con Vecinos', FECHA: D(29, 9) }));                                  // 805
  b.push(filaBase({ Figura: 'Jorge Macri', Barrio: 'Flores', EVENTO: 'Uno a uno', FECHA: D(2, 10) }));                                                // 806
  b.push(filaBase({ Figura: 'Jorge Macri', Barrio: 'Caballito', EVENTO: 'Encuentro Temático "Salud"', FECHA: D(2, 10) }));                            // 807
  b.push(filaBase({ Figura: 'Hernán Lombardi', Barrio: 'Núñez', EVENTO: 'Encuentro con Vecinos', FECHA: D(30, 9),
                    'Conjunta con': 'Gustavo Arengo Piragine / Gabino Tapia' }));                                                                     // 808
  b.push(filaBase({ Figura: '', Barrio: '', EVENTO: 'Encuentro con Vecinos', FECHA: D(3, 10), 'Evento (mail)': 'Seguridad en tu Barrio',
                    'Lugar (mail)': 'Comuna 4' }));                                                                                                  // 809
  b.push(filaBase({ Figura: 'Gabino Tapia', Barrio: 'Retiro', EVENTO: 'Encuentro con Vecinos', FECHA: D(5, 10) }));                                   // 810
  b.push(filaBase({ Figura: 'Gabino Tapia', Barrio: 'Recoleta', EVENTO: 'Encuentro con Vecinos', FECHA: D(20, 8) }));                                 // 811 (cerrada)
  b.push(filaBase({ Figura: 'Gustavo Arengo Piragine', Barrio: 'Saavedra', EVENTO: 'Encuentro con Vecinos', FECHA: D(1, 10) }));                    // 812
  return b;
}
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

function entorno(o) {
  return crearEntornoIds(Object.assign({ base: baseEscenario(), jm: JM, funcionarios: FUN, maxColsBase: hdrBase().length }, o || {}));
}
function cols(E) {
  const h = E.base().valores[0];
  return { id: h.indexOf('ID cuentas'), env: h.indexOf('Fecha envío campañas'), n: h.length };
}
const valor = function (E, fila, c) { return E.base().valores[fila - 1][c]; };
const fecha = function (v) { return v && v.getTime ? [v.getDate(), v.getMonth() + 1, v.getFullYear()].join('/') : String(v); };

// ---------------------------- [1] el historial ----------------------------
console.log('[1] el historial (paso 57): columnas, qué se escribe y dónde');
const E1 = entorno();
// la última columna (Conjunta con) con color en una fila: la columna nueva NO lo hereda
const ultima = hdrBase().length;
E1.base().fondos['805:' + ultima] = '#CFE2F3';
const r1 = E1.run('idsHistorial(false)');
const c1 = cols(E1);
ok(c1.id === ultima && c1.env === ultima + 1, 'las dos columnas, al final (después de "Conjunta con"), en ese orden');
ok(!E1.base().fondos['805:' + (c1.id + 1)] || valor(E1, 805, c1.id) !== '', 'la columna nueva no heredó el color de la anterior');
const esperado = { 805: '3735-SEPJDGAG', 806: '3800-OCTUNOUN', 807: '3801-OCTTEMAT', 808: '3700-CONJUNTA', 809: '3701-SEGURIDA',
                   810: '3702-TAPIAAAA', 811: '3703-TAPIAVIE', 812: '3704-ARENGOOO' };
Object.keys(esperado).forEach(function (f) {
  ok(valor(E1, Number(f), c1.id) === esperado[f], 'fila ' + f + ': ' + esperado[f] + ' (dio "' + valor(E1, Number(f), c1.id) + '")');
});
ok(fecha(valor(E1, 805, c1.env)) === '25/9/2026', 'la fecha de envío de 3735 (la PRIMERA columna "Fecha de envío", no la del IVR)');
ok(valor(E1, 806, c1.env) === '' && valor(E1, 807, c1.env) === '' && valor(E1, 809, c1.env) === '',
   'sin fecha de envío: #N/A, año 2062 y "-"');
ok(fecha(valor(E1, 810, c1.env)) === '1/10/2026', '"01/10/26" como texto → 01/10/2026');
let colorBien = true, formatoBien = true;
for (let f = 2; f <= E1.base().valores.length; f++) {
  const tieneId = valor(E1, f, c1.id) !== '', tieneEnv = valor(E1, f, c1.env) !== '';
  if (tieneId !== (E1.base().fondos[f + ':' + (c1.id + 1)] === '#CFE2F3')) colorBien = false;
  if (tieneEnv !== (E1.base().fondos[f + ':' + (c1.env + 1)] === '#CFE2F3')) colorBien = false;
  if (tieneEnv !== (E1.base().formatos[f + ':' + (c1.env + 1)] === 'dd/MM/yyyy')) formatoBien = false;
  if (E1.base().formatos[f + ':' + (c1.id + 1)]) formatoBien = false;
}
ok(colorBien, 'el color del sistema en TODAS las celdas escritas y en ninguna otra de las dos columnas');
ok(formatoBien, 'el formato dd/MM/yyyy sólo en las fechas escritas');
const otras = E1.base().escrituras.filter(function (e) { return e.fila > 1 && e.col !== c1.id + 1 && e.col !== c1.env + 1; });
ok(otras.length === 0, 'no escribió ninguna otra columna de la base (' + otras.length + ')');
const reg = E1.intermedia('REGISTRO_IDS');
const lin3735 = reg ? reg.valores.filter(function (r) { return r[4] === '3735-SEPJDGAG'; })[0] : null;
ok(!!lin3735 && lin3735[5] === 805 && /fecha distinta \(−2 días/.test(lin3735[11]), 'REGISTRO_IDS: 3735 → 805 "fecha distinta (−2 días…)"');
ok(reg && reg.valores.length === 1 + 8, 'REGISTRO_IDS: una línea por fila escrita (' + (reg ? reg.valores.length - 1 : 0) + ')');
const sc = E1.intermedia('IDS_SIN_CRUZAR');
ok(!!sc && sc.valores.some(function (r) { return r[0] === 'fecha_envio_descartada' && r[4] === '3801-OCTTEMAT'; }),
   'IDS_SIN_CRUZAR: la fecha de envío de 2062, descartada y listada (el ID se escribió)');
ok(r1 && r1.conteo.escribeId === 8 && r1.conteo.fechaDistinta === 2, 'conteo: 8 IDs, 2 por fecha distinta (3735 y 3702)');

// ---------------------------- [2] idempotente ----------------------------
console.log('[2] la segunda corrida no escribe nada');
const antes2 = E1.base().escrituras.length;
const r2 = E1.run('idsHistorial(false)');
ok(E1.base().escrituras.length === antes2, 'ninguna escritura nueva en la base');
ok(r2.conteo.yaEstaba === 8 && r2.conteo.escribeId === 0, 'los 8: "ya estaban en su fila"');
ok(E1.intermedia('REGISTRO_IDS').valores.length === 1 + 8, 'REGISTRO_IDS no suma líneas');

// ---------------------------- [3] en seco y la medición ----------------------------
console.log('[3] en seco (paso 56) y la medición (paso 55) no escriben la base');
const E3 = entorno();
const r3 = E3.run('idsHistorial(true)');
ok(E3.base().escrituras.length === 0, 'paso 56: ni una escritura en la base (ni los encabezados)');
ok(cols(E3).id < 0, 'paso 56: las columnas NO se agregaron');
ok(r3.conteo.escribeId === 8 && r3.conteo.escribeFecha === 4, 'paso 56: dice que escribiría 8 IDs y 4 fechas (3735, 3700, 3702 y 3703)');
ok(!!E3.intermedia('IDS_SIN_CRUZAR') && !E3.intermedia('REGISTRO_IDS'), 'paso 56: escribe IDS_SIN_CRUZAR y no REGISTRO_IDS');
const E3b = entorno();
const m = E3b.run('medirIds()');
ok(E3b.base().escrituras.length === 0 && Object.keys(E3b.archivos[E3b.cfg('RDV_SS_INTERMEDIA')].hojas).length === 0,
   'paso 55: no escribe NADA (ni la base ni la intermedia)');
ok(m.conteo.escribeId === 8 && /OK: es la fila 805/.test(E3b.log()), 'paso 55: 8 IDs y "OK: es la fila 805"');
ok(/FALTAN ID cuentas y Fecha envío campañas → el paso 57 las agrega al final, a partir de BL/.test(E3b.log()),
   'paso 55: dice que faltan las dos columnas y desde dónde se agregarían (BL)');

// ---------------------------- [4] columnas que ya están ----------------------------
console.log('[4] columnas que ya están con otra grafía: se usan');
const E4 = entorno({ columnasExtra: ['id CUENTAS', 'Fecha envio campañas'], maxColsBase: hdrBase().length + 2 });
// una fila con el ID ya cargado a mano (otro): no se toca
const c4 = cols(E4);
const h4 = E4.base().valores[0];
const iId4 = h4.indexOf('id CUENTAS'), iEnv4 = h4.indexOf('Fecha envio campañas');
E4.base().valores[805 - 1][iId4] = 'OTRO-ID';
E4.run('idsHistorial(false)');
ok(E4.base().valores[0].length === hdrBase().length + 2, 'no se agregó ninguna columna');
ok(E4.base().valores[805 - 1][iId4] === 'OTRO-ID', 'la 805 tenía otro ID: no se tocó');
ok(fecha(E4.base().valores[805 - 1][iEnv4]) === '', 'ni su fecha de envío');
ok(E4.base().valores[806 - 1][iId4] === '3800-OCTUNOUN', 'las demás, en las columnas que ya estaban');
ok(E4.intermedia('IDS_SIN_CRUZAR').valores.some(function (r) { return r[0] === 'fila_con_otro_id' && r[4] === '3735-SEPJDGAG'; }),
   'IDS_SIN_CRUZAR: 3735 → fila_con_otro_id');
ok(c4.id < 0, '(control: el test usa los nombres con otra grafía)');

// ---------------------------- [5] bloqueo y permisos ----------------------------
console.log('[5] el bloqueo ocupado y la lista sin permiso');
const E5 = entorno({ bloqueado: true });
ok(E5.run('idsHistorial(false)') === null && E5.base().escrituras.length === 0, 'con otra corrida en curso: no hace nada');
const E5b = entorno({ sinArchivoIds: true });
let err5 = '';
try { E5b.run('idsHistorial(false)'); } catch (e) { err5 = String(e.message || e); }
ok(/No se pudo abrir la lista de IDs/.test(err5) && /compartírsela como lectora/.test(err5), 'sin permiso: el error lo dice');
ok(E5b.base().escrituras.length === 0, 'sin permiso: no escribió nada (ni las columnas)');

// ---------------------------- [6] determinismo ----------------------------
console.log('[6] la lista y la base en otro orden: los mismos IDs en las mismas filas');
const mapa = function (E) {
  const c = cols(E), out = {};
  E.base().valores.slice(1).forEach(function (r) {
    if (r[c.id]) out[r[c.id]] = [r[0], fecha(r[4]), r[1], fecha(r[c.env])].join('|');
  });
  return out;
};
const ref = mapa(E1);
const invertir = function (m) { return [m[0], m[1]].concat(m.slice(2).reverse()); };
const b6 = baseEscenario();
const E6 = crearEntornoIds({ base: b6.slice(0, 803).concat(b6.slice(803).reverse()), jm: invertir(JM), funcionarios: invertir(FUN),
                             maxColsBase: hdrBase().length });
E6.run('idsHistorial(false)');
const m6 = mapa(E6);
const difs6 = Object.keys(ref).concat(Object.keys(m6)).filter(function (k, i, a) { return a.indexOf(k) === i && ref[k] !== m6[k]; });
ok(difs6.length === 0, 'mismo resultado (por figura, fecha y barrio de cada fila)' +
   (difs6.length ? ' — distintos: ' + difs6.map(function (k) { return k + ' ' + ref[k] + ' / ' + m6[k]; }).join('; ') : ''));

// ---------------------------- [7] la corrida de la hora ----------------------------
console.log('[7] la corrida de la hora: sólo filas activas; enganchada después de la agenda; apagada');
const E7 = entorno();
E7.run('agregarColumnasIds_(ssDestino_().getSheetByName(RDV_HOJA_DESTINO), true)');
const r7 = E7.run('idsEnLaHora_(false)');
const c7 = cols(E7);
ok(valor(E7, 811, c7.id) === '', 'la 811 (20/08, cerrada) no se escribe en la hora');
ok(r7.conteo.fuera === 1 && E7.intermedia('IDS_SIN_CRUZAR').valores.some(function (r) {
  return r[0] === 'fila_fuera_de_esta_corrida' && r[4] === '3703-TAPIAVIE'; }), 'y sale como fila_fuera_de_esta_corrida');
ok(valor(E7, 805, c7.id) === '3735-SEPJDGAG' && valor(E7, 810, c7.id) === '3702-TAPIAAAA', 'las activas, sí');
const E7b = entorno();
const r7b = E7b.run('idsEnLaHora_(false)');
ok(E7b.base().escrituras.length === 0 && /no se escribe nada hasta que las agregue la corrida del historial/.test(E7b.log()),
   'en la hora sin las columnas: no las agrega ni escribe (lo hace el paso 57)');
ok(r7b && r7b.conteo.escribeId === 7 && r7b.conteo.fuera === 1, '(y dice lo que escribiría: 7 IDs; la 811, cerrada, fuera)');
const up = fs.readFileSync(path.join(__dirname, '..', '20_UpsertDestino.js'), 'utf8');
const iAg = up.indexOf('correrAgendaEnBloqueo_(enSeco)'), iIds = up.indexOf('resIds = idsEnLaHora_(enSeco)'), iPlan = up.indexOf('const plan = calcularPlan_(enSeco, null');
ok(iAg > 0 && iIds > iAg && iPlan > iIds, 'en _correrUpsertConBloqueo_: después de la agenda y antes del cruce con los formularios');
ok(/if \(IDS_EN_LA_HORA && !historial\) \{\s*try \{ resIds = idsEnLaHora_\(enSeco\); \}\s*catch/.test(up), 'sólo con IDS_EN_LA_HORA, no en el paso 22, y con try/catch');
ok(E7.cfg('IDS_EN_LA_HORA') === false, 'IDS_EN_LA_HORA = false hasta el paso 57');

// ---------------------------- [8] el huso horario de la lista ----------------------------
console.log('[8] la lista en otro huso horario (GMT): sus fechas se leen en el de la lista');
// En GMT, la medianoche del 01/10 es el 30/09 a las 21 en Buenos Aires: leída en el huso del script sería el 30/09.
const enGMT = function (d, m) { return new Date(Date.UTC(2026, m - 1, d, 0, 0, 0)); };
const JM8 = [JM[0], JM[1], ['3735-SEPJDGAG', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', enGMT(1, 10), enGMT(25, 9), '', '', '', '']];
const E8 = crearEntornoIds({ base: baseEscenario(), jm: JM8, funcionarios: FUN.slice(0, 2), tzLista: 'GMT', maxColsBase: hdrBase().length });
const l8 = E8.run('leerListaIds_()');
ok(l8.tz === 'GMT' && fecha(l8.registros[0].fecha) === '1/10/2026', 'la Fecha 01/10 (medianoche GMT) se lee 01/10, no 30/09');
ok(fecha(l8.registros[0].envio.fecha) === '25/9/2026', 'y la de envío, 25/09');
E8.run('idsHistorial(false)');
const c8 = cols(E8);
ok(valor(E8, 805, c8.id) === '3735-SEPJDGAG' && fecha(valor(E8, 805, c8.env)) === '25/9/2026', '3735 → 805 con la fecha de envío 25/09');
ok(/huso horario de la lista: GMT \(distinto del script/.test(E8.log()), 'el log dice el huso de la lista');

// ---------------------------- [9] una columna que ya existe con fórmulas ----------------------------
console.log('[9] "ID cuentas" ya existe y tiene fórmulas: esa columna no se escribe (y la fecha de envío, sólo al lado de un ID que ya está)');
const E9 = entorno({ columnasExtra: ['ID cuentas', 'Fecha envío campañas'], maxColsBase: hdrBase().length + 2 });
const c9 = cols(E9);
E9.base().formulasCelda['300:' + (c9.id + 1)] = '=IFERROR(VLOOKUP(A300;X!A:B;2;0);"")';
E9.run('idsHistorial(false)');
let idsEscritos9 = 0;
E9.base().valores.slice(1).forEach(function (r) { if (r[c9.id]) idsEscritos9++; });
ok(idsEscritos9 === 0, 'una fórmula en una fila: ningún ID escrito (' + idsEscritos9 + ')');
ok(!valor(E9, 805, c9.env), 'y la fecha de envío tampoco: no va al lado de un ID que no quedó escrito (segunda revisión)');
// la fórmula ya da el ID de la 805 ("ya estaba"): la fecha de envío sí
const E9c = entorno({ columnasExtra: ['ID cuentas', 'Fecha envío campañas'], maxColsBase: hdrBase().length + 2 });
const c9c = cols(E9c);
E9c.base().formulasCelda['805:' + (c9c.id + 1)] = '=IFERROR(VLOOKUP(A805;X!A:B;2;0);"")';
E9c.base().valores[804][c9c.id] = '3735-SEPJDGAG';
E9c.run('idsHistorial(false)');
ok(fecha(valor(E9c, 805, c9c.env)) === '25/9/2026', 'si la fórmula ya da el ID de la fila ("ya estaba"), la fecha de envío sí se escribe');
// la carrera: alguien carga OTRO ID en la 805 entre el cálculo y la escritura → ni el ID ni la fecha de envío
const E9d = entorno({ columnasExtra: ['ID cuentas', 'Fecha envío campañas'], maxColsBase: hdrBase().length + 2 });
const c9d = cols(E9d);
E9d.run('var __dest = leerDestino_(); var __res = cruzarIds_(leerListaIds_().registros, __dest, { historial: true });');
E9d.base().valores[804][c9d.id] = '9999-AMANO';
const w9d = E9d.run('escribirIdsBase_(__dest.sh, __dest.hdr, __res)');
ok(valor(E9d, 805, c9d.id) === '9999-AMANO' && !valor(E9d, 805, c9d.env) && w9d.saltadas >= 2,
   'un ID cargado a mano en el medio: no se pisa, y la fecha de envío no se escribe al lado (saltadas ' + w9d.saltadas + ')');
ok(w9d.hechas.every(function (e) { return e.fila !== 805; }), '   (nada escrito en la 805)');
ok(/"ID cuentas" tiene 1 celdas con FÓRMULA: no se escribe esa columna/.test(E9.log()), 'el log lo dice');
const E9b = entorno({ columnasExtra: ['ID cuentas', 'Fecha envío campañas'], maxColsBase: hdrBase().length + 2 });
E9b.base().formulasCelda['1:' + (cols(E9b).env + 1)] = '={"Fecha envío campañas"; ARRAYFORMULA(…)}';
E9b.run('idsHistorial(false)');
let fechas9b = 0;
E9b.base().valores.slice(1).forEach(function (r) { if (r[cols(E9b).env]) fechas9b++; });
ok(fechas9b === 0 && valor(E9b, 805, cols(E9b).id) === '3735-SEPJDGAG',
   'una fórmula de ARRAY en el encabezado de "Fecha envío campañas": esa columna no se escribe; los IDs, sí');

// ---------------------------- [10] REGISTRO_IDS al borde de la grilla ----------------------------
console.log('[10] REGISTRO_IDS lleno hasta el borde: se agregan filas, la traza no se pierde');
const E10 = entorno();
E10.run('(function () { var sh = ssIntermedia_().insertSheet(RDV_HOJA_REGISTRO_IDS); sh.appendRow(IDS_ENCABEZADO_REGISTRO_); })()');
const reg10 = E10.intermedia('REGISTRO_IDS');
for (let i = 2; i <= reg10.maxRows; i++) reg10.valores.push(['x', 'relleno', '', '', 'R-' + i]);
E10.run('idsHistorial(false)');
ok(reg10.valores.length === reg10.maxRows && reg10.valores.filter(function (r) { return /-/.test(r[4]) && r[1] !== 'relleno'; }).length === 8,
   'las 8 líneas nuevas, después de las ' + (reg10.maxRows - 8) + ' que había');

// ---------------------------- [11] lo que no es un ID ----------------------------
console.log('[11] "#N/A", "-", "Pendiente" en la columna ID: no son IDs (no se cruzan ni se escriben)');
const FUN11 = FUN.slice(0, 2).concat([['#N/A', 'Gabino Tapia', 'Retiro', D(5, 10), '', '', ''], ['-', 'Gabino Tapia', 'Retiro', D(5, 10), '', '', ''],
  ['Pendiente', 'Gabino Tapia', 'Retiro', D(5, 10), '', '', ''], ['  3702-tapiaaaa ', 'Gabino Tapia', 'Retiro', D(5, 10), '', '', '']]);
const E11 = crearEntornoIds({ base: baseEscenario(), jm: JM.slice(0, 2), funcionarios: FUN11, maxColsBase: hdrBase().length });
const l11 = E11.run('leerListaIds_()').solapas[1];
ok(l11.idNoValido.length === 3 && l11.registros.length === 1, '3 que no son IDs (con su fila) y 1 registro');
E11.run('idsHistorial(false)');
ok(valor(E11, 810, cols(E11).id) === '3702-tapiaaaa', 'se escribe el ID como viene en la lista (recortado), no en mayúsculas');

// ---------------------------- [12] la tercera vuelta del revisor (09/10) ----------------------------
console.log('[12] la tercera revisión: la subzona de la Comuna 1, "c/ 9", un ID de dígitos, la carrera en "ya estaba", el control repetido');
const E12 = entorno();
const lug = function (t) { return E12.run('(function () { var l = lugarDeListaIds_(' + JSON.stringify(t) + '); return [l.u.comuna, l.u.subzona, l.reconocido]; })()'); };
[['C1 Sur', [1, 'Sur', true]], ['C 1 Sur', [1, 'Sur', true]], ['C1 - Norte', [1, 'Norte', true]], ['C 01 sur', [1, 'Sur', true]], ['C 1 S', [1, 'Sur', true]],
 ['Comuna 1 Sur', [1, 'Sur', true]], ['C 13', [13, '', true]], ['C10 Sur', [10, '', true]]].forEach(function (c) {
  ok(JSON.stringify(lug(c[0])) === JSON.stringify(c[1]), '"' + c[0] + '" → comuna ' + c[1][0] + (c[1][1] ? ', subzona ' + c[1][1] : '') + ' (dio ' + JSON.stringify(lug(c[0])) + ')');
});
ok(lug('Sede c/ 9 de Julio')[0] === null && lug('c/ 3 comunas')[0] === null, '"Sede c/ 9 de Julio" y "c/ 3 comunas" no son una comuna');
// Seguridad "C 1 Sur" con una sola fila de Seguridad ese día, en Retiro (Comuna 1 NORTE): no cruza
const b12 = baseEscenario();
b12.push(filaBase({ Figura: '', Barrio: 'Retiro', EVENTO: 'Encuentro con Vecinos', FECHA: D(3, 9), 'Evento (mail)': 'Seguridad en tu Barrio' }));   // 813
const E12b = crearEntornoIds({ base: b12, jm: JM.slice(0, 2), funcionarios: FUN.slice(0, 2).concat([['3900-SEGC1SUR', 'Seguridad en tu barrio', 'C 1 Sur', D(3, 9), '', '', '']]),
                               maxColsBase: hdrBase().length });
const r12b = E12b.run('idsHistorial(false)');
const it12 = r12b.items.filter(function (x) { return x.r.id === '3900-SEGC1SUR'; })[0];
ok(it12.final.estado === 'no' && it12.final.motivo === 'lugar_distinto' && !valor(E12b, 813, cols(E12b).id),
   'Seguridad "C 1 Sur" contra la única de ese día en Retiro (Comuna 1 Norte): lugar_distinto, no se escribe (dio ' + it12.final.motivo + ')');
// un ID sólo de dígitos se escribe como texto (con el apóstrofo: Sheets no lo convierte en 3735)
const E12c = crearEntornoIds({ base: baseEscenario(), jm: JM.slice(0, 2).concat([['03735', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(29, 9), '', '', '', '', '']]),
                               funcionarios: FUN.slice(0, 2), maxColsBase: hdrBase().length });
E12c.run('idsHistorial(false)');
ok(valor(E12c, 805, cols(E12c).id) === '03735' && E12c.base().escrituras.some(function (e) { return e.valor === "'03735"; }),
   'un ID sólo de dígitos ("03735") se escribe como texto: con el apóstrofo, y la celda dice "03735" (' + valor(E12c, 805, cols(E12c).id) + ')');
const r12c2 = E12c.run('idsHistorial(false)');
ok(r12c2.items[0].final.estado === 'ya_estaba' && r12c2.conteo.escribeId === 0, '   y la corrida siguiente lo reconoce: ya_estaba (no "fila_con_otro_id")');
// la carrera en "ya estaba": alguien cambia el ID de la celda entre el cálculo y la escritura → la fecha de envío no va al lado
const E12d = entorno({ columnasExtra: ['ID cuentas', 'Fecha envío campañas'], maxColsBase: hdrBase().length + 2 });
const c12d = cols(E12d);
E12d.base().valores[804][c12d.id] = '3735-SEPJDGAG';
E12d.run('var __d12 = leerDestino_(); var __r12 = cruzarIds_(leerListaIds_().registros, __d12, { historial: true });');
E12d.base().valores[804][c12d.id] = '9999-AMANO';
E12d.run('escribirIdsBase_(__d12.sh, __d12.hdr, __r12)');
ok(valor(E12d, 805, c12d.id) === '9999-AMANO' && !valor(E12d, 805, c12d.env), '"ya estaba" y el ID cambia en el medio: la fecha de envío no se escribe al lado del ID nuevo');
// el caso de control con el mismo ID dos veces (una copia "repetido"): sigue OK
const E12e = crearEntornoIds({ base: baseEscenario(), jm: JM.slice(0, 2).concat([JM[2]]), funcionarios: FUN.slice(0, 2).concat([['3735-sepjdgag', 'Jorge Macri', 'Belgrano', D(1, 10), D(25, 9), '', '']]),
                               maxColsBase: hdrBase().length });
const m12 = E12e.run('medirIds()');
ok(m12.control.ok === true && /OK: es la fila 805/.test(m12.control.texto), 'el 3735 dos veces (otra grafía, en la otra solapa): el control sigue OK (' + m12.control.texto + ')');

// el paso 43 no le saca el fondo a una celda con FÓRMULA (que da "") de "ID cuentas"; a una vacía de verdad, sí
const E12f = entorno({ columnasExtra: ['ID cuentas', 'Fecha envío campañas'], maxColsBase: hdrBase().length + 2 });
const c12f = cols(E12f);
E12f.base().formulasCelda['300:' + (c12f.id + 1)] = '=IFERROR(VLOOKUP(A300;X!A:B;2;0);"")';
E12f.base().fondos['300:' + (c12f.id + 1)] = '#FFF2CC';
E12f.base().fondos['301:' + (c12f.id + 1)] = '#CFE2F3';
E12f.run('limpiarFondoAgendaVacias(true)');
ok(E12f.base().fondos['300:' + (c12f.id + 1)] === '#FFF2CC' && !E12f.base().fondos['301:' + (c12f.id + 1)],
   'paso 43: la celda con fórmula conserva su fondo; la vacía de "ID cuentas" con el color del sistema lo pierde');

console.log(fallas ? '\n' + fallas + ' FALLAS' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
