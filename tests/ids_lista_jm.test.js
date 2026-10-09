/**
 * tests/ids_lista_jm.test.js — los IDs de los encuentros (45_IdsCuentas.js, 08/10): las reglas finas de la solapa
 * "Agenda JM" de la lista del equipo de campañas (sólo Macri), en un Apps Script simulado (tests/ids_mock.js).
 *
 *     node tests/ids_lista_jm.test.js
 *
 * Con las REGLAS NUEVAS del 08/10 (noche): un ID es un texto con algún dígito que no empieza con "#"; el ID se escribe como
 * viene; cada campo de la lista es la columna más a la izquierda con alguno de sus nombres; en "Agenda JM" un Funcionario que
 * no nombra a nadie (o dice "Seguridad en tu barrio") es Macri y lo que no se reconoce no frena; el Tipo contradice al lugar →
 * ambiguo; ±3 sólo con UNA posible exacta y con la fecha planeada ya pasada; el mismo día sin lugar comparable contra una
 * exacta a ±3 → ambiguo; "Reprogramada" no es candidata; los repetidos que van a la misma fila son uno; la hora no escribe en
 * filas cerradas; fecha imposible; las fechas de la lista en el huso de la lista; una columna con fórmulas no se escribe.
 *
 * [1]  el encabezado: la fila de grupos de arriba (la real: encabezado en la fila 2), sin ella, con dos; hasta la fila 5
 *      (IDS_FILAS_ENCABEZADO) y no en la 6 ni la 7 (error claro, y la otra solapa sigue); otras formas del encabezado
 * [2]  una columna con varios nombres o repetida en otros bloques: la MÁS A LA IZQUIERDA, y el log avisa
 * [3]  la Fecha de la lista: Date, texto "01/10/26" y "01/10/2026" (con o sin hora), número de serie; ilegible → sin_fecha
 * [4]  la Fecha de envío: ok / #N/A / "-" / vacía / no es fecha / el año que no cierra con el encuentro
 * [5]  qué es un ID (con dígito, sin "#") y cómo se escribe (como viene, sin pasar a mayúsculas)
 * [6]  Funcionario vacío, "JM", "Seguridad en tu barrio" o sin nadie reconocible → Macri por la solapa; lo no reconocido no
 *      frena (en "Agenda funcionarios" sí); el Tipo es sólo de "Agenda JM"
 * [7]  el Tipo y varias filas de Macri el mismo día: gana el lugar; sin lugar comparable, el Tipo; si el Tipo contradice al
 *      lugar o no desempata → ambiguo; el Tipo NO se usa en ±3
 * [8]  el lugar de la lista contra la fila, en los tres niveles (barrio / comuna / eje); dos barrios en la celda
 * [9]  el caso 3735-SEPJDGAG → fila 805 y sus variantes; ±3 (UNA posible, exacta, fecha planeada ya pasada); el mismo día
 *      sin lugar comparable (regla 7)
 * [10] filas "Reprogramada": no son candidatas
 * [11] el invariante: los repetidos de la lista y dos IDs para una fila
 * [12] la corrida en seco no escribe la base; la real escribe sólo en celdas vacías, con #CFE2F3 y el formato dd/MM/yyyy
 *      sólo en las fechas escritas; una columna con fórmulas no se escribe
 * [13] futuras y pasadas sin fila; la hora no escribe en filas cerradas; REGISTRO_IDS al borde de la grilla
 * [14] una Fecha imposible (antes de 2024 o a más de 180 días de hoy) se lista y no cruza
 * [15] las fechas de la lista se leen en el huso horario de la lista
 * [16] a escala: 150 reuniones de Macri y 150 IDs; el orden de la lista y de la base no cambia el resultado
 * [17] el ID repetido que cruza a la misma fila no depende del orden de la lista (ex BUG 5, arreglado el 08/10 a las 23:04).
 *      BUGS de producción abiertos: ninguno. Si aparece uno, va con su "// BUG:" y un chequeo `bug(...)` que FALLA mientras
 *      esté (el test sale con código 1 hasta que se arregle)
 *
 * Los chequeos que dicen "DECISIÓN:" documentan lo que el código hace hoy en un caso de diseño; los que dicen "HALLAZGO:",
 * lo que hace hoy en un caso donde la regla nueva parece quedarse corta (se reporta, no se fuerza). Ninguno falla.
 *
 * El flujo entero (paso 55/56/57, idempotencia, bloqueo, determinismo) está en tests/ids_cuentas.test.js; la otra solapa, en
 * tests/ids_lista_funcionarios.test.js. NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: figuras, IDs y
 * fechas inventados ("Jorge Macri" y los barrios de la Ciudad sí son los de verdad). "Hoy" es el 08/10/2026 21:00.
 */
'use strict';
const { crearEntornoIds, filaBase, hdrBase, D } = require('./ids_mock');

let chequeos = 0, fallas = 0, bugsAbiertos = 0;
function ok(cond, que) { chequeos++; console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }
/** Un BUG de producción conocido: falla mientras el bug esté (y se sabe cuál es por el "BUG" de la salida). */
function bug(cond, que) { chequeos++; console.log((cond ? '  ok   ' : '  BUG   ') + que); if (!cond) { fallas++; bugsAbiertos++; } }

// ---------------------------- helpers ----------------------------
const pad = function (n) { return ('0' + n).slice(-2); };
/** dd/MM/yyyy de una fecha (o "null"). */
const dmy = function (d) {
  if (d === null || d === undefined || d === '') return 'null';
  return d.getTime ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : String(d);
};
/** Lo que hay en una celda, para los mensajes: una fecha como dd/MM/yyyy y lo vacío como "vacía". */
const ver = function (v) { return v === '' || v === null || v === undefined ? 'vacía' : dmy(v); };
/** El número de serie de Sheets de una fecha (días desde el 30/12/1899). */
const serie = function (y, m, d) { return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000); };
/** Un instante en UTC (la medianoche de una lista en GMT). */
const utc = function (y, m, d, h) { return new Date(Date.UTC(y, m - 1, d, h || 0, 0, 0)); };
/** Hoy (08/10/2026) más `n` días, al mediodía. */
const hoyMas = function (n) { return new Date(2026, 9, 8 + n, 12, 0, 0); };

const EXTRA = ['ID cuentas', 'Fecha envío campañas'];
const HX = hdrBase(EXTRA);
const EV = 'Encuentro con Vecinos';

/** Una fila de Macri en la base. `hdr`: HX si la base ya tiene las dos columnas de los IDs. */
function M(barrio, evento, fecha, extra, hdr) {
  return filaBase(Object.assign({ Figura: 'Jorge Macri', Barrio: barrio, EVENTO: evento, FECHA: fecha }, extra || {}), hdr);
}
/** 803 filas de relleno (2..804, de otra figura, viejas): la primera fila de Macri es la 805, como en el caso real. */
function relleno() {
  const b = [];
  for (let i = 0; i < 803; i++) {
    b.push(filaBase({ Figura: 'Ana Pereyra', Barrio: 'Palermo', EVENTO: EV, FECHA: D(1 + (i % 28), 3 + (i % 4)) }));
  }
  return b;
}
const FILA0 = 805;

// La lista: encabezado real de "Agenda JM" (los primeros seis campos; después van las métricas) y la fila de grupos.
const HDR_LISTA = ['ID', 'Funcionario', 'Barrio / Comuna', 'Tipo', 'Fecha', 'Fecha de envío', 'Enviados', 'Entregados'];
const GRUPOS = ['', '', '', '', '', 'Comunicación Directa - Mail', '', ''];
function reg(id, funcionario, lugar, tipo, fecha, envio) {
  return [id, funcionario, lugar, tipo, fecha, envio === undefined ? '' : envio, 100, 90];
}
/** La solapa entera: `nGrupos` filas de grupos (1 = la real), el encabezado y los registros. */
function lista(registros, nGrupos) {
  const out = [];
  for (let i = 0; i < (nGrupos === undefined ? 1 : nGrupos); i++) out.push(GRUPOS.slice());
  out.push(HDR_LISTA.slice());
  return out.concat(registros);
}
// "Agenda funcionarios": sin la columna Tipo
const FUN_GRUPOS = ['Información del encuentro', '', '', '', 'Mail'];
const FUN_HDR = ['ID', 'Funcionario', 'Barrio / Comuna', 'Fecha', 'Fecha de envío'];
const FUN_VACIA = [FUN_GRUPOS, FUN_HDR];
const fun = function (id, funcionario, lugar, fecha, envio) { return [id, funcionario, lugar, fecha, envio === undefined ? '' : envio]; };

/** El entorno con la base de relleno + las filas de Macri (la primera es la 805). */
function entorno(macri, jm, o) {
  const extra = (o && o.columnasExtra) || [];
  return crearEntornoIds(Object.assign({ base: relleno().concat(macri), jm: jm, funcionarios: FUN_VACIA, maxColsBase: hdrBase(extra).length }, o || {}));
}
const correr = function (E, enSeco) { return E.run('idsHistorial(' + (enSeco ? 'true' : 'false') + ')'); };
const itemDe = function (res, id) {
  const it = res.items.filter(function (x) { return x.r.id === id; })[0];
  if (!it) throw new Error('el ID ' + id + ' no está en la lista leída');
  return it;
};
/** Qué decidió el cruce con un ID. `cruzaCon`: la fila con la que cruzó antes del invariante (o null). */
function decidio(res, id) {
  const it = itemDe(res, id);
  return { estado: it.final.estado, fila: it.final.fila || null, motivo: it.final.motivo || '', detalle: it.final.detalle || '',
           nivel: it.ev.nivel || '', desempate: it.ev.desempate ? it.ev.desempate.join('+') : '',
           cruzaCon: it.ev.estado === 'cruza' ? it.ev.e.x.f.fila : null, evMotivo: it.ev.motivo || '', evDetalle: it.ev.detalle || '' };
}
const escribe = function (res, id) { const d = decidio(res, id); return d.estado === 'escribe' ? d.fila : null; };
/** La fila donde se escribe un ID, mirando TODOS los registros que lo tienen (un ID repetido en la lista); o null. */
const filaEscrita = function (res, id) {
  const it = res.items.filter(function (x) { return x.r.id === id && x.final.estado === 'escribe'; })[0];
  return it ? it.final.fila : null;
};
const colsBase = function (E) { const h = E.base().valores[0]; return { id: h.indexOf('ID cuentas'), env: h.indexOf('Fecha envío campañas') }; };
const celda = function (E, fila, col) { return E.base().valores[fila - 1][col]; };
const sinCruzar = function (E) {
  const sh = E.intermedia('IDS_SIN_CRUZAR');
  return sh ? sh.valores.slice(1).filter(function (r) { return r[0] !== ''; }).map(function (r) {
    return { motivo: r[0], detalle: r[1], solapa: r[2], filaLista: r[3], id: r[4], cands: r[10] };
  }) : [];
};
const registro = function (E) {
  const sh = E.intermedia('REGISTRO_IDS');
  return sh ? sh.valores.slice(1).map(function (r) { return { id: r[4], fila: r[5], como: r[11], envio: r[12] }; }) : [];
};

// Para leer la lista sola (sin cruzar): una base chica con una fila de Macri y una de Tapia.
const BASE_CHICA = [M('Belgrano', EV, D(29, 9)),
                    filaBase({ Figura: 'Gabino Tapia', Barrio: 'Retiro', EVENTO: EV, FECHA: D(5, 10) })];
const FUN_TAPIA = FUN_VACIA.concat([['3702-TAPIAAAA', 'Gabino Tapia', 'Retiro', D(5, 10), '']]);
function leer(jm, funcionarios, o) {
  const E = crearEntornoIds(Object.assign({ base: BASE_CHICA, jm: jm, funcionarios: funcionarios || FUN_TAPIA }, o || {}));
  return { E: E, l: E.run('leerListaIds_()') };
}
const REG_3735 = reg('3735-SEPJDGAG', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(1, 10), D(25, 9));

// ===================================================================================================================
console.log('[1] el encabezado de "Agenda JM": con la fila de grupos arriba (la real), sin ella, con dos; hasta la fila 5');
[[0, 1, 'sin fila de grupos'], [1, 2, 'con la fila de grupos (como la real)'], [2, 3, 'con dos filas de grupos'],
 [4, 5, 'con cuatro: el encabezado en la fila 5, el tope (IDS_FILAS_ENCABEZADO)']].forEach(function (c) {
  const s = leer(lista([REG_3735], c[0])).l.solapas[0];
  ok(s.filaEncabezado === c[1] && !s.error && s.registros.length === 1,
     'encabezado ' + c[2] + ': en la fila ' + c[1] + ' (dio ' + s.filaEncabezado + '), un registro');
  const r = s.registros[0];
  ok(!!r && r.id === '3735-SEPJDGAG' && r.funcionario === 'Jorge Macri' && dmy(r.fecha) === '01/10/2026' && dmy(r.envio.fecha) === '25/09/2026',
     '   y lee los datos de SU fila, no los de la fila de grupos: ' + (r ? r.id + ' | ' + dmy(r.fecha) + ' | envío ' + dmy(r.envio.fecha) : 'sin registro'));
});
[[5, 6], [6, 7]].forEach(function (c) {
  const x = leer(lista([REG_3735], c[0])), s = x.l.solapas[0], f = x.l.solapas[1];
  ok(s.filaEncabezado === null && s.registros.length === 0 &&
     /no se encontró el encabezado/.test(s.error) && /Funcionario/.test(s.error) && /5 filas/.test(s.error),
     'el encabezado en la fila ' + c[1] + ' NO se encuentra: error claro y ningún registro ("' + s.error + '")');
  ok(!f.error && f.registros.length === 1 && f.registros[0].id === '3702-TAPIAAAA',
     '   y "Agenda funcionarios" se lee igual: el error de una solapa no frena a la otra');
});
{
  // la corrida entera con el encabezado de "Agenda JM" en la fila 7
  const E = crearEntornoIds({ base: BASE_CHICA, jm: lista([REG_3735], 6), funcionarios: FUN_TAPIA, maxColsBase: hdrBase().length });
  const res = correr(E, true);
  ok(/"Agenda JM": NO SE LEYÓ — no se encontró el encabezado/.test(E.log()), 'la corrida lo dice en el log: "Agenda JM": NO SE LEYÓ — no se encontró el encabezado…');
  const E1 = crearEntornoIds({ base: BASE_CHICA, jm: lista([REG_3735]), funcionarios: FUN_TAPIA, maxColsBase: hdrBase().length });
  correr(E1, true);
  ok(/"Agenda JM": encabezado en la fila 2 \(id A, funcionario B, lugar C, tipo D, fecha E, envio F\) \| 1 IDs/.test(E1.log()),
     'y cuando se lee, el log dice dónde está el encabezado y cada columna: "encabezado en la fila 2 (id A, funcionario B, lugar C, tipo D, fecha E, envio F)"');
  ok(res.conteo.registros === 1 && !res.porSolapa['Agenda JM'] && decidio(res, '3702-TAPIAAAA').estado === 'escribe' &&
     decidio(res, '3702-TAPIAAAA').fila === 3, '   y la corrida sigue con la otra solapa: 3702-TAPIAAAA → fila 3 (la base chica: Macri 2, Tapia 3)');
  ok(E.base().escrituras.length === 0, '   (en seco: ni una escritura en la base)');
}
{
  // otras formas del encabezado: columnas en otro orden, con otra grafía, con un espacio de más
  const barajado = [['', '', '', '', '', 'Comunicación Directa - Mail'],
    ['Fecha', 'Tipo', 'ID', 'Barrio/Comuna', 'FUNCIONARIO ', 'Fecha Envío'],
    [D(1, 10), 'Encuentro con vecinos', '3735-SEPJDGAG', 'Belgrano', 'Jorge Macri', D(25, 9)]];
  const s = leer(barajado).l.solapas[0], c = s.columnas, r = s.registros[0];
  ok(!s.error && s.filaEncabezado === 2 && c.fecha === 0 && c.tipo === 1 && c.id === 2 && c.lugar === 3 && c.funcionario === 4 && c.envio === 5,
     'las columnas se buscan por NOMBRE (otro orden, "Barrio/Comuna", "FUNCIONARIO ", "Fecha Envío"): ' + JSON.stringify(c));
  ok(!!r && r.id === '3735-SEPJDGAG' && r.tipoTexto === 'Encuentro con vecinos' && r.lugarTexto === 'Belgrano' && dmy(r.fecha) === '01/10/2026' &&
     dmy(r.envio.fecha) === '25/09/2026', '   y cada dato sale de su columna');
  const sinFun = lista([REG_3735]); sinFun[1] = ['ID', 'Responsable', 'Barrio / Comuna', 'Tipo', 'Fecha', 'Fecha de envío', 'Enviados', 'Entregados'];
  const s2 = leer(sinFun).l.solapas[0];
  ok(!!s2.error && s2.registros.length === 0, 'sin la columna "Funcionario" no hay encabezado: la solapa no se lee a medias (' + s2.error + ')');
  const sinLugar = lista([REG_3735]); sinLugar[1] = ['ID', 'Funcionario', 'Ubicación', 'Tipo', 'Fecha', 'Fecha de envío', 'Enviados', 'Entregados'];
  const s3 = leer(sinLugar).l.solapas[0];
  ok(!s3.error && s3.columnas.lugar === null && s3.registros[0].lugar.vacio, 'sin la columna del lugar sí se lee (el lugar queda vacío: nada se descarta ni se confirma por lugar)');
  // una fila sin ID (con Funcionario o Fecha) se cuenta aparte; una con un "ID" que no es un ID, también, con su fila
  const conVarias = lista([REG_3735, ['', 'Jorge Macri', 'Flores', 'Uno a uno', D(2, 10), '', 1, 1], ['', '', '', '', '', '', '', ''],
                           ['#N/A', 'Jorge Macri', 'Flores', 'Uno a uno', D(3, 10), '', 1, 1]]);
  const s4 = leer(conVarias).l.solapas[0];
  ok(s4.registros.length === 1 && s4.sinId === 1 && s4.idNoValido.length === 1 && s4.idNoValido[0].filaLista === 6 && s4.idNoValido[0].texto === '#N/A',
     'una fila sin ID no es un registro: se cuenta en sinId si tiene Funcionario o Fecha (1; la fila vacía no cuenta); una con "#N/A" va a idNoValido con su fila (6), no a sinId');
  const E5 = crearEntornoIds({ base: BASE_CHICA, funcionarios: FUN_TAPIA });                       // sin la solapa "Agenda JM"
  ok(/no existe la solapa "Agenda JM"/.test(E5.run('leerListaIds_()').solapas[0].error), 'si la solapa no existe: error claro');
  const E6 = crearEntornoIds({ base: BASE_CHICA, jm: [], funcionarios: FUN_TAPIA });
  ok(/la solapa está vacía/.test(E6.run('leerListaIds_()').solapas[0].error), 'si la solapa está vacía: error claro');
  // las dos solapas sin encabezado: no se cae, no escribe nada
  const E7 = crearEntornoIds({ base: BASE_CHICA, jm: lista([REG_3735], 6), funcionarios: lista([REG_3735], 6), maxColsBase: hdrBase().length });
  const r7 = correr(E7, true);
  ok(!!r7 && r7.conteo.registros === 0 && E7.base().escrituras.length === 0, 'las dos solapas sin encabezado: la corrida termina sin registros y sin escribir');
}

// ===================================================================================================================
console.log('[2] cada campo de la lista es la columna MÁS A LA IZQUIERDA con alguno de sus nombres; si hay más de una, el log avisa');
{
  // la misma "Fecha de envío" en dos bloques (Mail e IVR): la primera
  const hdr = ['ID', 'Funcionario', 'Barrio / Comuna', 'Tipo', 'Fecha', 'Fecha de envío', 'Enviados', 'Fecha de envío', 'Llamados', 'Fecha'];
  const fila = ['3735-SEPJDGAG', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(1, 10), D(25, 9), 100, D(20, 9), 5, D(2, 2)];
  const s = leer([GRUPOS.concat(['', '']), hdr, fila]).l.solapas[0], r = s.registros[0];
  ok(s.columnas.envio === 5 && dmy(r.envio.fecha) === '25/09/2026', 'con "Fecha de envío" repetida: la de la columna F (bloque Mail), no la del bloque IVR (' + dmy(r.envio.fecha) + ')');
  ok(s.columnas.fecha === 4 && dmy(r.fecha) === '01/10/2026', '   y con "Fecha" repetida al final: la de la columna E, al lado del Funcionario');
  ok(r.envioTexto === '25/09/2026', '   (envioTexto, el que se muestra, es el de la misma columna)');
  ok(JSON.stringify(s.repetidas.envio) === '[5,7]' && JSON.stringify(s.repetidas.fecha) === '[4,9]' && !s.repetidas.id && !s.repetidas.lugar,
     '   `repetidas` dice cuáles: envio [5,7] y fecha [4,9] (y nada más): ' + JSON.stringify(s.repetidas));

  // con la grafía distinta ("Fecha envío" primero, "Fecha de envío" más a la derecha): sigue siendo la de la izquierda
  const hdr2 = ['ID', 'Funcionario', 'Barrio / Comuna', 'Tipo', 'Fecha', 'Fecha envío', 'Enviados', 'Fecha de envío', 'Llamados'];
  const fila2 = ['3735-SEPJDGAG', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(1, 10), D(25, 9), 100, D(20, 9), 5];
  const s2 = leer([GRUPOS.concat(['']), hdr2, fila2]).l.solapas[0];
  ok(s2.columnas.envio === 5 && dmy(s2.registros[0].envio.fecha) === '25/09/2026' && JSON.stringify(s2.repetidas.envio) === '[5,7]',
     'con "Fecha envío" en la F y "Fecha de envío" más a la derecha: la PRIMERA, la F (25/09/2026), aunque el otro nombre esté antes en la lista de nombres (dio la ' + s2.columnas.envio + ')');

  // los seis campos repetidos con otros nombres: cada uno, el de la izquierda
  const hdr3 = ['ID cuenta', 'Funcionarios', 'Barrio', 'Tipo de encuentro', 'Fecha del encuentro', 'Fecha envío', 'Enviados', 'ID', 'Funcionario', 'Barrio / Comuna', 'Tipo', 'Fecha', 'Fecha de envío'];
  const fila3 = ['3735-SEPJDGAG', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(1, 10), D(25, 9), 1, 'X9', 'Nadie', 'Flores', 'Uno a uno', D(2, 2), D(3, 3)];
  const x3 = leer([GRUPOS.concat(['', '', '', '', '']), hdr3, fila3]);
  const s3 = x3.l.solapas[0], r3 = s3.registros[0];
  ok(JSON.stringify(s3.columnas) === '{"id":0,"funcionario":1,"lugar":2,"tipo":3,"fecha":4,"envio":5}' && Object.keys(s3.repetidas).length === 6,
     'con los seis campos repetidos (otros nombres): cada uno, el de la izquierda; y `repetidas` los tiene a los seis: ' + JSON.stringify(s3.columnas));
  ok(r3.id === '3735-SEPJDGAG' && r3.funcionario === 'Jorge Macri' && r3.lugarTexto === 'Belgrano' && r3.tipoTexto === 'Encuentro con vecinos' && dmy(r3.fecha) === '01/10/2026' && dmy(r3.envio.fecha) === '25/09/2026',
     '   y lee los datos de las columnas de la izquierda');
  const Ej = crearEntornoIds({ base: BASE_CHICA, jm: [GRUPOS.concat(['', '', '', '', '']), hdr3, fila3], funcionarios: FUN_TAPIA, maxColsBase: hdrBase().length });
  correr(Ej, true);
  const ojo = Ej.log().split('\n').filter(function (l) { return /OJO/.test(l); });
  ok(ojo.length === 6 && ojo.some(function (l) { return /"envio" está en más de una columna \(F, M\)/.test(l) && /primera, F/.test(l); }) &&
     ojo.some(function (l) { return /"id" está en más de una columna \(A, H\)/.test(l) && /primera, A/.test(l); }),
     '   el log avisa de cada una: "OJO: "envio" está en más de una columna (F, M): se usa la primera, F."');
  // y si no hay repetidas, no avisa
  const E0 = crearEntornoIds({ base: BASE_CHICA, jm: lista([REG_3735]), funcionarios: FUN_TAPIA, maxColsBase: hdrBase().length });
  correr(E0, true);
  ok(!/OJO/.test(E0.log()) && Object.keys(E0.run('leerListaIds_()').solapas[0].repetidas).length === 0, 'sin columnas repetidas, el log no avisa nada');
}

// ===================================================================================================================
console.log('[3] la Fecha de la lista: Date, texto "01/10/26" y "01/10/2026" (con o sin hora), número de serie; una ilegible → sin_fecha');
{
  const formas = [['Date', D(1, 10)], ['Date a las 23:30 (el mismo día)', new Date(2026, 9, 1, 23, 30, 0)], ['texto "01/10/26"', '01/10/26'],
    ['texto "01/10/2026"', '01/10/2026'], ['texto con espacios " 01/10/2026 "', ' 01/10/2026 '], ['texto "1/10/2026"', '1/10/2026'],
    ['texto "2026-10-01"', '2026-10-01'], ['número de serie de Sheets', serie(2026, 10, 1)], ['número de serie con hora (.75)', serie(2026, 10, 1) + 0.75],
    ['texto con hora "01/10/2026 18:00"', '01/10/2026 18:00'], ['texto con segundos "01/10/2026 18:00:30"', '01/10/2026 18:00:30'],
    ['texto con hs "01/10/2026 18:00 hs"', '01/10/2026 18:00 hs'], ['texto "1/10/26 9:05"', '1/10/26 9:05']];
  const ilegibles = [['texto "a confirmar"', 'a confirmar'], ['vacía', ''], ['un error de Sheets "#VALUE!"', '#VALUE!'], ['un número chico (7)', 7], ['texto "jueves"', 'jueves'],
    ['una hora sola "18:00"', '18:00'], ['"01/10/2026 a las 18"', '01/10/2026 a las 18']];
  const regs = formas.concat(ilegibles).map(function (f, i) { return reg('F-' + i, 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', f[1]); });
  const s = leer(lista(regs)).l.solapas[0];
  formas.forEach(function (f, i) {
    ok(dmy(s.registros[i].fecha) === '01/10/2026', 'Fecha como ' + f[0] + ' → 01/10/2026 (dio ' + dmy(s.registros[i].fecha) + ')');
  });
  ilegibles.forEach(function (f, i) {
    ok(s.registros[formas.length + i].fecha === null, 'Fecha ilegible (' + f[0] + ') → sin fecha');
  });

  // los formatos, cruzando cada uno con la fila de SU día (10 al 15 de septiembre, Macri en Belgrano)
  const dias = [10, 11, 12, 13, 14, 15];
  const fmt = [function (d) { return D(d, 9); }, function (d) { return pad(d) + '/09/26'; }, function (d) { return pad(d) + '/09/2026'; },
               function (d) { return serie(2026, 9, d); }, function (d) { return serie(2026, 9, d) + 0.75; }, function (d) { return pad(d) + '/09/2026 18:00'; }];
  const nombres = ['Date', 'texto dd/MM/aa', 'texto dd/MM/aaaa', 'serie', 'serie con hora', 'texto con hora'];
  const macri = dias.map(function (d) { return M('Belgrano', EV, D(d, 9)); });
  const regs2 = dias.map(function (d, i) { return reg('FMT-' + i, 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', fmt[i](d)); });
  // y dos ilegibles, que no cruzan con nada
  regs2.push(reg('FMT-X1', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', 'a confirmar'), reg('FMT-X2', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', ''));
  const E = entorno(macri, lista(regs2));
  const res = correr(E, false), c = colsBase(E);
  dias.forEach(function (d, i) {
    ok(celda(E, FILA0 + i, c.id) === 'FMT-' + i && decidio(res, 'FMT-' + i).nivel === 'misma_fecha',
       'el día ' + d + '/09 (' + nombres[i] + ') cruza con SU fila ' + (FILA0 + i) + ' por la misma fecha');
  });
  const x1 = decidio(res, 'FMT-X1'), x2 = decidio(res, 'FMT-X2');
  ok(x1.estado === 'no' && x1.motivo === 'sin_fecha' && x2.motivo === 'sin_fecha' && res.conteo.sinFecha === 2,
     'una Fecha ilegible o vacía: motivo sin_fecha, no se escribe (conteo.sinFecha ' + res.conteo.sinFecha + ')');
  const sc = sinCruzar(E).filter(function (x) { return x.motivo === 'sin_fecha'; });
  ok(sc.length === 2 && sc.every(function (x) { return x.solapa === 'Agenda JM'; }) && /a confirmar/.test(sc.map(function (x) { return x.detalle; }).join('|')),
     '   y va a IDS_SIN_CRUZAR con el motivo y lo que decía la celda');
}

// ===================================================================================================================
console.log('[4] la Fecha de envío: sólo la que es fecha y cierra con el año del encuentro se escribe');
{
  // Macri en Belgrano, uno por día (01 al 13 de septiembre de 2026) + dos de enero de 2026
  const casos = [
    ['Date', D(25, 8), 'ok', '25/08/2026'], ['texto "25/08/26"', '25/08/26', 'ok', '25/08/2026'], ['número de serie', serie(2026, 8, 25), 'ok', '25/08/2026'],
    ['#N/A', '#N/A', 'error', ''], ['#REF!', '#REF!', 'error', ''], ['"-"', '-', 'guion', ''], ['"—"', '—', 'guion', ''], ['vacía', '', 'vacia', ''],
    ['texto que no es fecha ("Enviado")', 'Enviado', 'invalida', ''], ['un cero', 0, 'invalida', ''],
    ['año 2062 (no cierra)', D(28, 8, 2062), 'anio', ''], ['año anterior (no cierra)', D(25, 8, 2025), 'anio', ''],
    ['texto con hora "25/08/2026 10:30"', '25/08/2026 10:30', 'ok', '25/08/2026']];
  const macri = [], regs = [];
  casos.forEach(function (c, i) {
    macri.push(M('Belgrano', EV, D(1 + i, 9)));
    regs.push(reg('ENV-' + i, 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(1 + i, 9), c[1]));
  });
  // enero: el envío de diciembre del año anterior es válido para un encuentro de enero; uno de enero del año anterior, no
  macri.push(M('Belgrano', EV, D(5, 1)), M('Belgrano', EV, D(6, 1)));
  regs.push(reg('ENV-D1', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(5, 1), D(28, 12, 2025)),
            reg('ENV-E1', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(6, 1), D(2, 1, 2025)));
  const E = entorno(macri, lista(regs));
  const lec = E.run('leerListaIds_()').solapas[0];
  casos.forEach(function (c, i) {
    ok(lec.registros[i].envio.estado === c[2], 'Fecha de envío ' + c[0] + ' → estado "' + c[2] + '" (dio "' + lec.registros[i].envio.estado + '")');
  });
  ok(lec.registros[casos.length].envio.estado === 'ok' && lec.registros[casos.length + 1].envio.estado === 'anio',
     'encuentro del 05/01/2026: envío del 28/12/2025 OK (diciembre del año anterior); encuentro del 06/01/2026: envío del 02/01/2025, el año no cierra');
  const res = correr(E, false), c = colsBase(E);
  casos.forEach(function (x, i) {
    const v = celda(E, FILA0 + i, c.env);
    ok(celda(E, FILA0 + i, c.id) === 'ENV-' + i && (x[3] ? dmy(v) === x[3] : v === ''),
       'en la base, ' + x[0] + ': el ID se escribe y la fecha de envío ' + (x[3] ? 'es ' + x[3] : 'queda vacía') + ' (dio ' + ver(v) + ')');
  });
  ok(dmy(celda(E, FILA0 + casos.length, c.env)) === '28/12/2025' && celda(E, FILA0 + casos.length + 1, c.env) === '', 'en la base: el de diciembre, escrito; el de enero del año anterior, vacío');
  const esperadas = casos.map(function (x, i) { return x[2] === 'anio' ? 'ENV-' + i : null; }).filter(Boolean).concat(['ENV-E1']).sort();
  const desc = sinCruzar(E).filter(function (x) { return x.motivo === 'fecha_envio_descartada'; }).map(function (x) { return x.id; }).sort();
  ok(desc.join(',') === esperadas.join(','), 'IDS_SIN_CRUZAR lista SÓLO las descartadas por el año (y no las #N/A, "-", vacías ni "no es fecha"): ' + desc.join(', '));
  ok(res.conteo.envioDescartado === esperadas.length && res.conteo.escribeId === casos.length + 2,
     'conteo: ' + esperadas.length + ' descartadas por el año; los ' + (casos.length + 2) + ' IDs se escriben igual');
}

// ===================================================================================================================
console.log('[5] qué es un ID (un texto con algún dígito que no empieza con "#") y cómo se escribe (como viene en la lista)');
{
  // [lo que dice la celda, ¿es un ID?, cómo queda escrito]
  const casos = [['3735-SEPJDGAG', true, '3735-SEPJDGAG'], ['abc-12x', true, 'abc-12x'], ['  Xyz-34W  ', true, 'Xyz-34W'], ['A1', true, 'A1'], ['12', true, '12'],
    ['3735   SEP', true, '3735 SEP'], ['10', true, '10'], ['A0', true, 'A0'],
    ['#N/A', false], ['#REF!', false], ['#12', false], ['-', false], ['—', false], ['N/A', false], ['Pendiente', false], ['A confirmar', false], ['ENV-DIC', false],
    ['0', false], ['000', false], ['0,0', false]];
  const macri = [], regs = [];
  casos.forEach(function (c, i) {
    macri.push(M('Belgrano', EV, D(1 + i, 9)));
    regs.push(reg(c[0], 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(1 + i, 9)));
  });
  const validos = casos.filter(function (c) { return c[1]; }), invalidos = casos.filter(function (c) { return !c[1]; });
  const E = entorno(macri, lista(regs));
  const s = E.run('leerListaIds_()').solapas[0];
  ok(s.registros.length === validos.length && s.registros.map(function (r) { return r.idTexto; }).join('|') === validos.map(function (c) { return c[2]; }).join('|'),
     'sólo son registros los que tienen un ID: ' + s.registros.map(function (r) { return '"' + r.idTexto + '"'; }).join(', '));
  ok(s.idNoValido.map(function (x) { return x.texto; }).join('|') === invalidos.map(function (c) { return c[0]; }).join('|') && s.sinId === 0,
     '"#N/A", "#REF!", "#12" (empieza con #), "-", "—", "N/A", "Pendiente", "A confirmar", "ENV-DIC" (sin dígito) y "0", "000", "0,0" (sólo ceros: el "sin ID" de una fórmula) NO son IDs: ' +
     'van a idNoValido y no a sinId (sinId ' + s.sinId + '); "10" y "A0" sí lo son');
  ok(s.idNoValido.every(function (x, k) { return x.filaLista === 3 + validos.length + k; }), '   cada uno con su fila de la lista (las filas ' + (3 + validos.length) + ' a ' + (2 + casos.length) + ')');
  const res = correr(E, false), c = colsBase(E);
  validos.forEach(function (v) {
    const i = casos.indexOf(v);
    ok(celda(E, FILA0 + i, c.id) === v[2], 'en la base, ' + JSON.stringify(v[0]) + ' se escribe como viene (recortado, con los espacios colapsados, sin pasar a mayúsculas): "' + celda(E, FILA0 + i, c.id) + '"');
  });
  ok(invalidos.every(function (v) { return celda(E, FILA0 + casos.indexOf(v), c.id) === ''; }) && res.conteo.registros === validos.length && res.conteo.escribeId === validos.length,
     'y los que no son un ID no escriben nada: sus filas de la base quedan vacías (' + res.conteo.escribeId + ' IDs escritos)');
  ok(new RegExp('\\| 0 filas con Funcionario o Fecha y sin ID \\| ' + invalidos.length + ' que no son un ID \\|').test(E.log()),
     '   el log cuenta los que no son un ID: "' + invalidos.length + ' que no son un ID"');

  // las comparaciones siguen sin distinguir mayúsculas
  const E2 = entorno([M('Belgrano', EV, D(29, 9), { 'ID cuentas': 'ABC-12X' }, HX)], lista([reg('abc-12x', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(29, 9))]), { columnasExtra: EXTRA });
  const r2 = correr(E2, false);
  ok(decidio(r2, 'ABC-12X').estado === 'ya_estaba' && celda(E2, FILA0, colsBase(E2).id) === 'ABC-12X',
     'el ID de la base ("ABC-12X") y el de la lista ("abc-12x") son el mismo: ya_estaba, no se toca');
  // lo que no se cruza se lista con el ID como viene
  const E3 = entorno([M('Flores', EV, D(1, 9))], lista([reg('q-9z', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(20, 9))]));
  correr(E3, true);
  ok(sinCruzar(E3).length === 1 && sinCruzar(E3)[0].id === 'q-9z', 'IDS_SIN_CRUZAR muestra el ID como viene en la lista ("q-9z")');
  const tr = registro(E).filter(function (x) { return x.id === 'abc-12x'; });
  ok(tr.length === 1 && tr[0].fila === FILA0 + 1, 'REGISTRO_IDS también: "abc-12x" en la fila ' + (FILA0 + 1));
}

// ===================================================================================================================
console.log('[6] Funcionario vacío, "JM", "Seguridad en tu barrio" o sin nadie reconocible → Macri por la solapa; lo que no se reconoce no frena');
{
  const textos = ['', '   ', 'JM', 'Jorge Macri', 'Macri Jorge', 'JORGE MACRI', 'jorge macri', 'Funcionario X', 'Seguridad en tu barrio', 'Jorge Macri, Fulano De Tal'];
  const porSolapa = [true, true, true, false, false, false, false, true, true, false];
  // del 21/09 al 30/09: reuniones que ya pasaron (un ID se escribe recién cuando la reunión pasó; hoy = 08/10)
  const macri = textos.map(function (t, i) { return M('Belgrano', EV, D(21 + i, 9)); });
  const regs = textos.map(function (t, i) { return reg('FUN-' + i, t, 'Belgrano', 'Encuentro con vecinos', D(21 + i, 9)); });
  const E = entorno(macri, lista(regs));
  const res = correr(E, false), tr = registro(E);
  textos.forEach(function (t, i) {
    const lin = tr.filter(function (x) { return x.id === 'FUN-' + i; })[0];
    ok(escribe(res, 'FUN-' + i) === FILA0 + i && !!lin && /figura por la solapa/.test(lin.como) === porSolapa[i],
       'Funcionario ' + JSON.stringify(t) + ' → Macri (fila ' + (FILA0 + i) + '), ' + (porSolapa[i] ? 'con' : 'sin') + ' "figura por la solapa" en la traza' + (lin ? ' [' + lin.como + ']' : ''));
  });
  const linSeg = tr.filter(function (x) { return x.id === 'FUN-8'; })[0];
  ok(itemDe(res, 'FUN-8').r.quien.seguridad === false && !/Seguridad/.test(linSeg.como),
     '   "Seguridad en tu barrio" en "Agenda JM" es Macri: no cruza como Seguridad (la traza no dice "Seguridad")');
  ok(itemDe(res, 'FUN-7').r.quien.porSolapa === true && itemDe(res, 'FUN-7').r.quien.noReconocidas.indexOf('Funcionario X') >= 0,
     '   un texto que no nombra a nadie ("Funcionario X") también es Macri por la solapa (queda anotado en noReconocidas)');
  ok(itemDe(res, 'FUN-9').r.quien.noReconocidas.indexOf('Fulano De Tal') >= 0 && itemDe(res, 'FUN-9').r.quien.ignorarResto === true,
     '   "Jorge Macri, Fulano De Tal": la parte que no se reconoce ("Fulano De Tal") no frena el cruce en "Agenda JM"');

  // en "Agenda funcionarios" SÍ frena, y un Funcionario vacío o desconocido no es Macri
  const funs = FUN_VACIA.concat([fun('FUN-A1', 'Jorge Macri, Fulano De Tal', 'Belgrano', D(1, 10)), fun('FUN-A2', '', 'Belgrano', D(2, 10)),
                                 fun('FUN-A3', 'Funcionario X', 'Belgrano', D(3, 10)), fun('FUN-A4', 'Jorge Macri - Belgrano', 'Belgrano', D(4, 10)),
                                 fun('FUN-A5', 'Jorge Macri - Comuna 13', 'Belgrano', D(5, 10))]);
  const E2 = entorno([M('Belgrano', EV, D(1, 10)), M('Belgrano', EV, D(2, 10)), M('Belgrano', EV, D(3, 10)), M('Belgrano', EV, D(4, 10)), M('Belgrano', EV, D(5, 10))],
                     lista([]), { funcionarios: funs });
  const r2 = correr(E2, true);
  ok(decidio(r2, 'FUN-A1').motivo === 'funcionario_en_parte' && /Fulano De Tal/.test(decidio(r2, 'FUN-A1').detalle),
     'en "Agenda funcionarios", "Jorge Macri, Fulano De Tal" SÍ frena el cruce: funcionario_en_parte (' + decidio(r2, 'FUN-A1').detalle + ')');
  ok(decidio(r2, 'FUN-A2').motivo === 'funcionario_no_reconocido' && decidio(r2, 'FUN-A3').motivo === 'funcionario_no_reconocido',
     '   y un Funcionario vacío o desconocido NO es Macri: funcionario_no_reconocido (el fallback es sólo de "Agenda JM")');
  ok(escribe(r2, 'FUN-A4') === FILA0 + 3 && escribe(r2, 'FUN-A5') === FILA0 + 4,
     '   pero un LUGAR pegado al Funcionario ("Jorge Macri - Belgrano", "Jorge Macri - Comuna 13") no es una persona: no frena y cruza (filas ' +
     (escribe(r2, 'FUN-A4') || 'no') + ' y ' + (escribe(r2, 'FUN-A5') || 'no') + ')');

  // el Tipo es sólo de "Agenda JM"
  const A = M('Flores', 'Uno a uno', D(2, 10)), B = M('Caballito', 'Encuentro Temático "Salud"', D(2, 10));
  const E3 = entorno([A, B], lista([reg('TIPO-1', 'Jorge Macri', '', 'Uno a uno', D(2, 10))]));
  const r3 = correr(E3, true);
  ok(escribe(r3, 'TIPO-1') === FILA0 && decidio(r3, 'TIPO-1').desempate === 'tipo', 'en "Agenda JM" el Tipo desempata (sin lugar, "Uno a uno" → la 805)');
  const funT = [['', '', '', '', '', ''], ['ID', 'Funcionario', 'Barrio / Comuna', 'Tipo', 'Fecha', 'Fecha de envío'], ['TIPO-2', 'Jorge Macri', '', 'Uno a uno', D(2, 10), '']];
  const E4 = entorno([A, B], lista([]), { funcionarios: funT });
  const r4 = correr(E4, true), it4 = itemDe(r4, 'TIPO-2');
  ok(it4.r.tipoTexto === '' && it4.r.tipo === '' && decidio(r4, 'TIPO-2').motivo === 'ambiguo',
     'en "Agenda funcionarios", aunque tenga una columna Tipo, se IGNORA: el mismo caso queda ambiguo (tipoTexto "' + it4.r.tipoTexto + '")');
}

// ===================================================================================================================
console.log('[7] el Tipo de "Agenda JM" contra el EVENTO de la fila, y el desempate de varias filas de Macri el mismo día');
{
  // el Tipo de la lista (cuatro categorías) contra cómo escribe el EVENTO el equipo
  const tipos = [['Encuentro con vecinos', 'Encuentro con Vecinos', 'vecinos'], ['Uno a uno', 'Uno a uno', 'uno_a_uno'], ['Uno a uno', 'Encuentro "1 a 1"', 'uno_a_uno'],
    ['Reunión temática', 'Encuentro Temático "Salud"', 'tematica'], ['Primera persona', 'Encuentro "Primera Persona" con Ana', 'primera_persona'],
    ['Primera persona', 'Primera Persona', 'primera_persona']];
  const E0 = crearEntornoIds({ base: BASE_CHICA, jm: lista([]), funcionarios: FUN_VACIA });
  const tipoDe = function (t) { return E0.run('tipoEncuentroIds_(' + JSON.stringify(t) + ')'); };
  tipos.forEach(function (t) {
    ok(tipoDe(t[0]) === t[2] && tipoDe(t[1]) === t[2], 'Tipo "' + t[0] + '" y EVENTO ' + JSON.stringify(t[1]) + ' → la misma categoría: ' + t[2]);
  });
  ok(tipoDe('Café con Vecinos') === 'cafe' && tipoDe('Café con Vecinos') !== tipoDe('Encuentro con vecinos'),
     'DECISIÓN: "Café con Vecinos" es su propia categoría ("cafe"), distinta de "Encuentro con vecinos": un Tipo "Encuentro con vecinos" nunca desempata a favor de un Café');
  ok(tipoDe('') === '' && tipoDe('Reunión de gabinete') === '', 'sin Tipo o con un Tipo desconocido: ninguna categoría (no desempata)');

  // las filas de Macri del mismo día (02/10)
  const dia = D(2, 10);
  const A = M('Flores', 'Uno a uno', dia), B = M('Caballito', 'Encuentro Temático "Salud"', dia), C = M('Palermo', 'Encuentro "Primera Persona" con Ana', dia);
  const V = M('Belgrano', EV, dia), K = M('Retiro', 'Café con Vecinos', dia), A2 = M('Palermo', 'Uno a uno', dia);
  const F1 = M('Flores', EV, dia), X = M('', 'Encuentro Temático "Salud"', dia);
  const caso = function (filas, lugar, tipo) {
    const E = entorno(filas, lista([reg('T-1', 'Jorge Macri', lugar, tipo, dia)]));
    const res = correr(E, true);
    return decidio(res, 'T-1');
  };
  const chequeo = function (titulo, d, fila, desempate, motivo) {
    if (fila) ok(d.estado === 'escribe' && d.fila === fila && d.nivel === 'misma_fecha' && d.desempate === (desempate || ''),
                 titulo + ' → fila ' + fila + (desempate ? ' (desempate: ' + desempate + ')' : '') + ' [dio ' + (d.fila || d.motivo) + (d.desempate ? ', ' + d.desempate : '') + ']');
    else ok(d.estado === 'no' && d.motivo === motivo, titulo + ' → NO se escribe: ' + motivo + ' [dio ' + (d.fila || d.motivo) + ']');
  };
  console.log('  -- el lugar gana (con 2 y con 3 filas de Macri el mismo día, en lugares distintos)');
  chequeo('2 filas (Flores, Caballito); la lista dice "Caballito" (Comuna 6)', caso([A, B], 'Caballito', 'Reunión temática'), 806);
  chequeo('3 filas (Flores, Caballito, Palermo); la lista dice "Caballito"', caso([A, B, C], 'Caballito', 'Primera persona'), 806);
  chequeo('3 filas; la lista dice "Palermo"', caso([A, B, C], 'Palermo', 'Uno a uno'), 807);
  chequeo('3 filas; la lista dice "Comuna 7" (sólo una es de esa comuna)', caso([A, B, C], 'Comuna 7', 'Uno a uno'), 805);
  chequeo('3 filas; la lista dice un barrio donde no hay ninguna (Belgrano)', caso([A, B, C], 'Belgrano', 'Uno a uno'), null, '', 'lugar_distinto');
  console.log('  -- sin lugar comparable, desempata el Tipo');
  chequeo('3 filas, lista SIN lugar, Tipo "Uno a uno"', caso([A, B, C], '', 'Uno a uno'), 805, 'tipo');
  chequeo('3 filas, lista SIN lugar, Tipo "Reunión temática"', caso([A, B, C], '', 'Reunión temática'), 806, 'tipo');
  chequeo('3 filas, lista SIN lugar, Tipo "Primera persona"', caso([A, B, C], '', 'Primera persona'), 807, 'tipo');
  chequeo('4 filas, lista SIN lugar, Tipo "Encuentro con vecinos"', caso([A, B, C, V], '', 'Encuentro con vecinos'), 808, 'tipo');
  chequeo('3 filas, lugar que no se reconoce ("Por definir"), Tipo "Uno a uno"', caso([A, B, C], 'Por definir', 'Uno a uno'), 805, 'tipo');
  chequeo('2 filas en el MISMO barrio (Flores), lugar "Flores": el lugar no distingue, el Tipo sí', caso([A, F1], 'Flores', 'Encuentro con vecinos'), 806, 'tipo');
  console.log('  -- el Tipo contradice al lugar (regla 5): ambiguo');
  chequeo('lugar comparable (Flores) elige la fila de "Encuentro con Vecinos", pero el Tipo de la lista (temática) apunta a otra del día (sin barrio)',
          caso([F1, X], 'Flores', 'Reunión temática'), null, '', 'ambiguo');
  const dc = caso([F1, X], 'Flores', 'Reunión temática');
  ok(/el lugar elige la fila 805/.test(dc.evDetalle) && /Reunión temática/.test(dc.evDetalle),
     '   el detalle dice qué eligió el lugar y qué dice el Tipo: "' + dc.evDetalle + '"');
  chequeo('si el Tipo ACOMPAÑA al lugar ("Encuentro con vecinos"): cruza, por el lugar', caso([F1, X], 'Flores', 'Encuentro con vecinos'), 805, 'lugar');
  chequeo('si la lista no tiene Tipo: cruza, por el lugar', caso([F1, X], 'Flores', ''), 805, 'lugar');
  // HALLAZGO: la contradicción sólo se mira entre las filas que el lugar NO descartó. Si el lugar descarta (desacuerdo) la fila a la que
  // apunta el Tipo, el lugar decide solo, aunque la lista se contradiga a sí misma contra la base (lugar de una, Tipo de otra).
  chequeo('HALLAZGO: lista "Comuna 7" + Tipo "Reunión temática": el lugar descarta la temática (Caballito) y cruza la de Flores ("Uno a uno") sin ambigüedad',
          caso([A, B], 'Comuna 7', 'Reunión temática'), 805);
  chequeo('HALLAZGO: lista "Flores" + Tipo "Reunión temática" contra Flores "Uno a uno" y Caballito temática: igual, cruza la de Flores',
          caso([A, B], 'Flores', 'Reunión temática'), 805);
  // Regla (08/10, después del HALLAZGO 2 de este test): aunque la fila que elige el lugar no tenga un Tipo reconocido, si otra
  // fila de ese día que el lugar NO descartó tiene el Tipo de la lista, el Tipo apunta a otra: ambiguo.
  chequeo('la fila elegida por el lugar tiene un EVENTO sin categoría ("Reunión de gabinete") y otra del día, sin lugar comparable, es de la temática de la lista: ambiguo',
          caso([M('Flores', 'Reunión de gabinete', dia), X], 'Flores', 'Reunión temática'), null, '', 'ambiguo');
  console.log('  -- un Tipo que no desempata → ambiguo, no se escribe');
  chequeo('3 filas, SIN lugar, Tipo "Encuentro con vecinos" y ninguna fila es de ese tipo', caso([A, B, C], '', 'Encuentro con vecinos'), null, '', 'ambiguo');
  chequeo('2 filas del mismo Tipo ("Uno a uno" las dos), sin lugar', caso([A, A2], '', 'Uno a uno'), null, '', 'ambiguo');
  chequeo('la lista sin Tipo y sin lugar, 2 filas', caso([A, B], '', ''), null, '', 'ambiguo');
  chequeo('DECISIÓN: "Café con Vecinos" contra el Tipo "Encuentro con vecinos": no coinciden (Café es otra categoría) → ambiguo', caso([A, K], '', 'Encuentro con vecinos'), null, '', 'ambiguo');
  const amb = caso([A, B, C], '', 'Encuentro con vecinos');
  ok(/3 filas el mismo día/.test(amb.evDetalle), '   el detalle dice cuántas son: "' + amb.evDetalle + '"');

  console.log('  -- el Tipo NO se usa para la fecha distinta (±3 días)');
  const sinTipo = function (filas, lugar, tipo) {
    const E = entorno(filas, lista([reg('T-2', 'Jorge Macri', lugar, tipo, D(2, 10))]));
    return decidio(correr(E, true), 'T-2');
  };
  let d = sinTipo([M('Belgrano', 'Uno a uno', D(30, 9)), M('Belgrano', EV, D(4, 10))], 'Belgrano', 'Uno a uno');
  ok(d.estado === 'no' && d.motivo === 'ambiguo' && /2 filas posibles/.test(d.evDetalle),
     'dos filas en Belgrano a −2 y +2 días, y el Tipo coincide con una: AMBIGUO igual (el Tipo no desempata ±3): ' + d.evDetalle);
  d = sinTipo([M('Belgrano', EV, D(30, 9))], 'Belgrano', 'Reunión temática');
  ok(d.estado === 'escribe' && d.fila === FILA0 && d.nivel === 'fecha_distinta', 'una sola fila a −2 días con el Tipo que NO coincide (temática contra "Encuentro con Vecinos"): cruza igual → fila ' + d.fila);
  d = sinTipo([M('Belgrano', EV, D(30, 9)), M('Flores', 'Uno a uno', D(4, 10))], 'Belgrano', 'Uno a uno');
  ok(d.estado === 'escribe' && d.fila === FILA0, 'dos filas a ±2: Belgrano (EVENTO distinto) y Flores (EVENTO igual al Tipo): manda el lugar, no el Tipo → fila ' + d.fila);

  console.log('  -- dos reuniones el mismo día y DOS IDs en la lista: cada uno a la suya');
  const dosIds = function (filas, regs) {
    const E = entorno(filas, lista(regs));
    return correr(E, true);
  };
  let res = dosIds([A, B], [reg('D-1', 'Jorge Macri', 'Flores', 'Uno a uno', dia), reg('D-2', 'Jorge Macri', 'Caballito', 'Reunión temática', dia)]);
  ok(escribe(res, 'D-1') === 805 && escribe(res, 'D-2') === 806, 'con lugar: D-1 (Flores) → 805 y D-2 (Caballito) → 806');
  res = dosIds([A, B], [reg('D-3', 'Jorge Macri', '', 'Uno a uno', dia), reg('D-4', 'Jorge Macri', '', 'Reunión temática', dia)]);
  ok(escribe(res, 'D-3') === 805 && escribe(res, 'D-4') === 806 && decidio(res, 'D-3').desempate === 'tipo' && decidio(res, 'D-4').desempate === 'tipo',
     'sin lugar, cada uno por su Tipo: D-3 (Uno a uno) → 805 y D-4 (temática) → 806');
  res = dosIds([A, A2], [reg('D-5', 'Jorge Macri', '', 'Uno a uno', dia), reg('D-6', 'Jorge Macri', '', 'Uno a uno', dia)]);
  ok(decidio(res, 'D-5').motivo === 'ambiguo' && decidio(res, 'D-6').motivo === 'ambiguo' && res.conteo.escribeId === 0,
     'sin lugar y con el mismo Tipo: las dos son ambiguas y NINGUNA se escribe (no se reparten al azar)');
}

// ===================================================================================================================
console.log('[8] el lugar de la lista contra el de la fila, en los tres niveles (barrio, comuna, eje) — compararUbicacion_');
{
  const E0 = crearEntornoIds({ base: BASE_CHICA, jm: lista([]), funcionarios: FUN_VACIA });
  const cmp = function (lugar, barrio, mail) {
    return JSON.parse(E0.run('JSON.stringify((function () { var l = lugarDeListaIds_(' + JSON.stringify(lugar) + '); var u = ubicacionDeFila_({ barrio: ' +
      JSON.stringify(barrio) + ', lugarMail: ' + JSON.stringify(mail) + ' }); var c = compararUbicacion_(l.u, u); return { nivel: c.nivel, coincide: c.coincide }; })())'));
  };
  const T = [
    // [texto de la lista, Barrio de la fila, "Lugar (mail)" de la fila, nivel, coincide]
    ['Belgrano', 'Belgrano', '', 'barrio', true], ['BELGRANO', 'Belgrano', '', 'barrio', true], ['Nunez', 'Núñez', '', 'barrio', true],
    ['Villa Gral. Mitre', 'Villa General Mitre', '', 'barrio', true], ['Montserrat', 'Monserrat', '', 'barrio', true],
    ['Belgrano (Comuna 13)', 'Belgrano', '', 'barrio', true],
    ['Belgrano', 'Núñez', '', 'barrio', false],              // misma comuna (13), otro barrio: con barrio de los dos, manda el barrio
    ['Retiro', 'San Nicolás', '', 'barrio', false],          // misma subzona de la Comuna 1, otro barrio
    ['Comuna 13', 'Belgrano', '', 'comuna', true], ['C13', 'Belgrano', '', 'comuna', true], ['Comuna 13', 'Palermo', '', 'comuna', false],
    ['Belgrano', '', 'Comuna 13', 'comuna', true],           // la fila sin barrio: la comuna es la de "Lugar (mail)"
    ['Belgrano', '', 'Comuna 7', 'comuna', false],
    ['Comuna 1', 'Retiro', '', 'comuna', true], ['Comuna 1 Sur', 'Retiro', '', 'comuna', false], ['Comuna 1 Sur', 'Monserrat', '', 'comuna', true],
    ['C1N', 'Retiro', '', 'comuna', true], ['Comuna 1 - Norte', 'Retiro', '', 'comuna', true], ['Comuna 1 - Sur', 'Retiro', '', 'comuna', false],
    ['Comuna 1 Sur', '', 'Comuna 1 Norte', 'comuna', false], ['Comuna 1', '', 'Comuna 1 Sur', 'comuna', true],
    ['Eje Norte', '', 'Eje Norte', 'eje', true], ['Eje Norte', '', 'Eje Sur', 'eje', false],
    // el eje se compara SÓLO con el que dijo el mail: nunca se deduce del barrio (los temáticos de un eje se hacen en barrios de otro)
    ['Eje Norte', 'Belgrano', '', '', null], ['Belgrano', '', 'Eje Norte', '', null], ['Eje Norte', '', 'Comuna 13', '', null],
    // dos barrios en la celda: se compara la comuna (la que dice el texto, o la de los dos barrios si es una sola)
    ['Villa Urquiza / Coghlan', 'Coghlan', '', 'comuna', true], ['Villa Urquiza / Coghlan', 'Villa Urquiza', '', 'comuna', true],
    ['Villa Urquiza / Coghlan', 'Palermo', '', 'comuna', false],
    ['Comuna 4 (Barracas y La Boca)', 'Barracas', '', 'comuna', true], ['Comuna 4 (Barracas y La Boca)', 'Flores', '', 'comuna', false],
    ['Belgrano / Palermo', 'Belgrano', '', '', null],        // dos barrios de comunas distintas: sin ubicación
    // lo que no se puede comparar no coincide ni descarta
    ['Por definir', 'Belgrano', '', '', null], ['', 'Belgrano', '', '', null], ['-', 'Belgrano', '', '', null], ['#N/A', 'Belgrano', '', '', null],
    ['Comuna 16', 'Belgrano', '', '', null], ['Belgrano', '', '', '', null]
  ];
  T.forEach(function (t) {
    const r = cmp(t[0], t[1], t[2]);
    ok(r.nivel === t[3] && r.coincide === t[4],
       'lista ' + JSON.stringify(t[0]) + ' contra fila (' + JSON.stringify(t[1]) + (t[2] ? ', mail ' + JSON.stringify(t[2]) : '') + '): ' +
       (t[4] === null ? 'no se puede comparar' : (t[4] ? 'COINCIDE' : 'DESCARTA') + ' por ' + t[3]) + ' (dio ' + (r.nivel || '-') + ' / ' + r.coincide + ')');
  });
  // DECISIÓN: una grafía que Comunas no tiene se compara como TEXTO distinto y descarta la fila
  let r = cmp('La Paternal', 'Paternal', '');
  ok(r.nivel === 'barrio' && r.coincide === false,
     'DECISIÓN: la fila con el barrio escrito "Paternal" (que Comunas no tiene) contra "La Paternal" de la lista: DESCARTA (otra grafía = otro barrio; el ID queda sin cruzar y se lista)');
  // Regla (08/10, después del HALLAZGO 3 de este test): con dos barrios de la MISMA subzona de la Comuna 1, la comparación sube
  // a la comuna pero conserva la subzona: "Retiro y San Nicolás" (Comuna 1 Norte) NO coincide con Monserrat (Comuna 1 Sur).
  r = cmp('Retiro y San Nicolás', 'Monserrat', '');
  ok(r.nivel === 'comuna' && r.coincide === false,
     '"Retiro y San Nicolás" (los dos de la Comuna 1 Norte) contra una fila de Monserrat (Comuna 1 Sur): NO coincide (la subzona se conserva)');
  r = cmp('Retiro y San Nicolás', 'Puerto Madero', '');
  ok(r.nivel === 'comuna' && r.coincide === true, '…y contra Puerto Madero (también Norte), sí');
}

// ===================================================================================================================
console.log('[9] el caso del usuario: 3735-SEPJDGAG (Macri, Belgrano, 01/10) es la fila 805 (Macri 29/09 Belgrano), y sus variantes');
{
  const B805 = M('Belgrano', EV, D(29, 9), { 'STATUS REUNIÓN': 'Realizada' });
  const dec = function (macri, registros, o) {
    const E = entorno(macri, lista(registros || [REG_3735]), o);
    const res = correr(E, true);
    return { E: E, res: res, d: decidio(res, '3735-SEPJDGAG') };
  };

  // el caso base, con la escritura de verdad
  const E = entorno([B805], lista([REG_3735]));
  const res = correr(E, false), c = colsBase(E), d = decidio(res, '3735-SEPJDGAG');
  ok(d.estado === 'escribe' && d.fila === 805 && d.nivel === 'fecha_distinta' && d.desempate === '', '3735-SEPJDGAG → fila 805 por FECHA DISTINTA (la base llega hasta la fila 805, como la real)');
  ok(celda(E, 805, c.id) === '3735-SEPJDGAG' && dmy(celda(E, 805, c.env)) === '25/09/2026', 'la base: "ID cuentas" de la 805 = 3735-SEPJDGAG y "Fecha envío campañas" = 25/09/2026');
  const tr = registro(E).filter(function (x) { return x.id === '3735-SEPJDGAG'; })[0];
  ok(!!tr && tr.fila === 805 && /fecha distinta \(−2 días/.test(tr.como) && /01\/10\/2026/.test(tr.como) && /lugar: barrio/.test(tr.como),
     'REGISTRO_IDS lo dice: "' + (tr ? tr.como : '') + '"');
  ok(sinCruzar(E).filter(function (x) { return x.id === '3735-SEPJDGAG'; }).length === 0, 'no sale en IDS_SIN_CRUZAR (cruzó)');

  console.log('  -- (a) una fila de Macri el 01/10 en OTRO barrio');
  let x = dec([B805, M('Flores', EV, D(1, 10))]);
  ok(x.d.estado === 'escribe' && x.d.fila === 805 && x.d.nivel === 'fecha_distinta',
     '(a) la del 01/10 es de otro barrio (Flores): se descarta, y el ID sigue yendo a la 805 por ±3 días (dio ' + x.d.fila + ')');
  x = dec([B805, M('', EV, D(1, 10), { 'Lugar (mail)': 'Comuna 7' })]);
  ok(x.d.estado === 'escribe' && x.d.fila === 805, '(a2) la del 01/10 sin barrio pero con el lugar del mail en OTRA comuna (7): se descarta; sigue la 805');

  console.log('  -- (b) una fila de Macri el 01/10 SIN barrio ni lugar del mail (regla 7): ya NO gana la del día');
  x = dec([B805, M('', EV, D(1, 10))]);
  ok(x.d.estado === 'no' && x.d.motivo === 'ambiguo' && /mismo día sin lugar comparable/.test(x.d.detalle) && /±3 días con el mismo lugar/.test(x.d.detalle),
     '(b) AMBIGUO: la del 01/10 no tiene lugar comparable y a −2 días está la 805 con el barrio exacto: ninguna se escribe (' + x.d.detalle + ')');
  const scb = sinCruzar(x.E);
  ok(scb.length === 1 && scb[0].motivo === 'ambiguo' && /fila 806 .*misma fecha, lugar no comparable/.test(scb[0].cands) && /fila 805 .*−2 días/.test(scb[0].cands),
     '    IDS_SIN_CRUZAR lista las dos: la del día (806, lugar no comparable) y la 805 (−2 días): ' + (scb[0] ? scb[0].cands : ''));
  const reb = correr(x.E, false), cb = colsBase(x.E);
  ok(celda(x.E, 805, cb.id) === '' && celda(x.E, 806, cb.id) === '' && reb.conteo.ambiguo === 1, '    y la corrida real no escribe el ID ni en la 805 ni en la 806 (conteo.ambiguo ' + reb.conteo.ambiguo + ')');
  x = dec([B805, M('', EV, D(1, 10)), M('', 'Uno a uno', D(1, 10))]);
  ok(x.d.estado === 'no' && x.d.motivo === 'ambiguo' && /^2 .*mismo día sin lugar comparable/.test(x.d.detalle) && /±3 días con el mismo lugar/.test(x.d.detalle),
     '(b2) con DOS filas del día sin lugar comparable: ambiguo igual (' + x.d.detalle + ')');
  x = dec([B805, M('', EV, D(1, 10), { 'Lugar (mail)': 'Comuna 13' })]);
  ok(x.d.estado === 'escribe' && x.d.fila === 806 && x.d.nivel === 'misma_fecha', '(b3) si la del día tiene el lugar del mail en la MISMA comuna (13, la de Belgrano): el lugar coincide por comuna → fila 806 (no es el caso débil)');
  x = dec([B805, M('', EV, D(1, 10))], [reg('3735-SEPJDGAG', 'Jorge Macri', '', 'Encuentro con vecinos', D(1, 10))]);
  ok(x.d.estado === 'escribe' && x.d.fila === 806, '(b4) la lista sin lugar y la fila sin lugar: no hay ningún lugar contra el cual dudar → misma fecha → fila 806');
  x = dec([M('Flores', EV, D(29, 9)), M('', EV, D(1, 10))]);
  ok(x.d.estado === 'escribe' && x.d.fila === 806, '(b5) la del día sin lugar y la de ±3 en OTRO barrio (Flores): no hay una exacta a ±3 → cruza la del día (806)');

  console.log('  -- (c) dos filas de Macri en Belgrano a −2 y +2 días');
  x = dec([M('Belgrano', EV, D(29, 9)), M('Belgrano', EV, D(3, 10))]);
  ok(x.d.estado === 'no' && x.d.motivo === 'ambiguo' && /2 filas posibles/.test(x.d.detalle), '(c) AMBIGUO: no se escribe en ninguna (' + x.d.detalle + ')');
  const sc = sinCruzar(x.E);
  ok(sc.length === 1 && sc[0].motivo === 'ambiguo' && /fila 805/.test(sc[0].cands) && /fila 806/.test(sc[0].cands) && /−2 días/.test(sc[0].cands) && /\+2 días/.test(sc[0].cands),
     '    IDS_SIN_CRUZAR lo lista con las dos candidatas: ' + (sc[0] ? sc[0].cands : ''));
  correr(x.E, false);
  const cE = colsBase(x.E);
  ok(celda(x.E, 805, cE.id) === '' && celda(x.E, 806, cE.id) === '', '    y la corrida real no escribe el ID en ninguna de las dos');

  console.log('  -- ±3 (regla 6): se cuentan como "posibles" las filas a 1..3 días que el lugar NO descarta; cruza sólo UNA, exacta y con el lugar que coincide');
  x = dec([B805, M('', EV, D(3, 10))]);
  ok(x.d.estado === 'no' && x.d.motivo === 'ambiguo' && /2 filas posibles/.test(x.d.detalle),
     'una exacta con el lugar (805, −2) y otra a +2 días SIN lugar comparable: 2 posibles y una fuerte → AMBIGUO (' + x.d.detalle + ')');
  x = dec([M('', EV, D(29, 9)), M('', EV, D(3, 10))]);
  ok(x.d.estado === 'no' && x.d.motivo === 'fecha_distinta_sin_lugar', 'dos posibles sin lugar comparable, ninguna fuerte: no cruza (fecha_distinta_sin_lugar)');
  x = dec([B805, M('Flores', EV, D(3, 10))]);
  ok(x.d.estado === 'escribe' && x.d.fila === 805 && x.d.nivel === 'fecha_distinta', 'una exacta (805) y otra a +2 días de OTRO barrio (Flores, descartada por el lugar): una sola posible → cruza la 805');
  {
    // HALLAZGO: una fila que YA tiene otro ID sigue siendo "posible": con dos posibles el registro queda ambiguo aunque una esté tomada
    const e = entorno([M('Belgrano', EV, D(29, 9), { 'ID cuentas': 'X-1' }, HX), M('Belgrano', EV, D(3, 10), {}, HX)], lista([REG_3735]), { columnasExtra: EXTRA });
    const dh = decidio(correr(e, true), '3735-SEPJDGAG');
    ok(dh.estado === 'no' && dh.motivo === 'ambiguo' && /2 filas posibles/.test(dh.evDetalle),
       'HALLAZGO: la 805 ya tiene OTRO ID (X-1) y la 806 está libre: el 3735 queda ambiguo igual (la fila tomada sigue contando como posible)');
  }
  x = dec([M('Belgrano', EV, D(29, 9))], [reg('3735-SEPJDGAG', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(1, 10))]);
  ok(x.d.estado === 'escribe' && x.d.fila === 805, 'control: una sola exacta a −2 días con la fecha planeada ya pasada → cruza');

  console.log('  -- la fecha planeada HOY o futura (08/10/2026): no se usa ±3, se espera la fila del día (futura_sin_fila)');
  const fut = function (macri, fecha) {
    const e = entorno(macri, lista([reg('H-1', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', fecha)]));
    const rr = correr(e, true);
    return { d: decidio(rr, 'H-1'), res: rr, E: e };
  };
  let f = fut([M('Belgrano', EV, D(6, 10))], D(8, 10));
  ok(f.d.estado === 'no' && f.d.motivo === 'futura_sin_fila' && /todavía no pasó: se espera la fila de ese día/.test(f.d.detalle),
     'planeada HOY (08/10) y una fila de Belgrano a −2 días (06/10): NO cruza por ±3, futura_sin_fila ("' + f.d.detalle + '")');
  f = fut([M('Belgrano', EV, D(7, 10))], D(9, 10));
  ok(f.d.motivo === 'futura_sin_fila', 'planeada MAÑANA (09/10) y una fila a −2 días (07/10): futura_sin_fila');
  f = fut([M('Belgrano', EV, D(11, 10))], D(9, 10));
  ok(f.d.motivo === 'futura_sin_fila', 'planeada MAÑANA (09/10) y una fila a +2 días (11/10): futura_sin_fila (tampoco hacia adelante)');
  f = fut([M('Belgrano', EV, D(5, 10))], D(7, 10));
  ok(f.d.estado === 'escribe' && f.d.nivel === 'fecha_distinta' && f.d.fila === FILA0, 'planeada AYER (07/10) y una fila a −2 días (05/10): ya pasó → cruza por ±3');
  f = fut([M('Belgrano', EV, D(8, 10))], D(8, 10));
  ok(f.d.cruzaCon === FILA0 && f.d.nivel === 'misma_fecha' && f.d.estado === 'fuera' && f.d.motivo === 'reunion_futura' &&
     !sinCruzar(f.E).some(function (x) { return x.id === 'H-1'; }),
     'planeada HOY y la fila del día (08/10): cruza por la misma fecha, pero se escribe cuando la reunión pasó (reunion_futura, no se lista)');
  const fMan = entorno([M('Belgrano', EV, D(8, 10))], lista([reg('H-1', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(8, 10))]),
                       { hoy: new Date(2026, 9, 9, 9, 0, 0) });
  ok(decidio(correr(fMan, true), 'H-1').estado === 'escribe', '   y al día siguiente (09/10) se escribe');
  f = fut([M('Flores', EV, D(1, 9))], D(12, 10));
  ok(f.d.motivo === 'futura_sin_fila' && /reunión futura: todavía no hay fila/.test(f.d.detalle) && f.res.conteo.futuraSinFila === 1 && sinCruzar(f.E).length === 0,
     'planeada futura sin nada cerca: futura_sin_fila (se cuenta aparte y no va a IDS_SIN_CRUZAR)');

  console.log('  -- el borde de la ventana: ±3 sí, ±4 no');
  [['−3 días (28/09)', D(28, 9), 'escribe'], ['+3 días (04/10)', D(4, 10), 'escribe'], ['−4 días (27/09)', D(27, 9), 'no'], ['+4 días (05/10)', D(5, 10), 'no']].forEach(function (b) {
    const y = dec([M('Belgrano', EV, b[1])]);
    ok(y.d.estado === b[2] && (b[2] === 'escribe' ? y.d.fila === 805 && y.d.nivel === 'fecha_distinta' : y.d.motivo === 'sin_fila'),
       'la fila a ' + b[0] + ': ' + (b[2] === 'escribe' ? 'cruza por fecha distinta' : 'no cruza (sin_fila: "' + y.d.detalle + '")'));
  });

  console.log('  -- el lugar de la fila 805 y de la lista');
  x = dec([M('Palermo', EV, D(29, 9))]);
  ok(x.d.estado === 'no' && x.d.motivo === 'sin_fila' && /sólo en otro lugar/.test(x.d.detalle), 'la 805 en OTRO barrio (Palermo): no cruza ("' + x.d.detalle + '")');
  x = dec([M('', EV, D(29, 9), { 'Lugar (mail)': 'Comuna 13' })]);
  ok(x.d.estado === 'escribe' && x.d.fila === 805, 'la 805 sin barrio y con el lugar del mail en la Comuna 13: cruza por la comuna');
  x = dec([M('', EV, D(29, 9))]);
  ok(x.d.estado === 'no' && x.d.motivo === 'fecha_distinta_sin_lugar' && /la fila no tiene barrio ni comuna/.test(x.d.detalle),
     'la 805 sin barrio ni mail: NO cruza por fecha distinta (el lugar no se puede comparar; con ±3 hace falta que coincida): ' + x.d.detalle);
  x = dec([B805], [reg('3735-SEPJDGAG', 'Jorge Macri', '', 'Encuentro con vecinos', D(1, 10))]);
  ok(x.d.estado === 'no' && x.d.motivo === 'fecha_distinta_sin_lugar' && /la lista no dice un lugar/.test(x.d.detalle), 'la lista sin lugar: tampoco (' + x.d.detalle + ')');
  x = dec([B805], [reg('3735-SEPJDGAG', 'Jorge Macri', 'Comuna 13', 'Encuentro con vecinos', D(1, 10))]);
  ok(x.d.estado === 'escribe' && x.d.fila === 805, 'la lista con "Comuna 13" y la 805 en Belgrano: cruza por la comuna');
  x = dec([B805], [reg('3735-SEPJDGAG', 'Jorge Macri', 'Comuna 14', 'Encuentro con vecinos', D(1, 10))]);
  ok(x.d.estado === 'no' && x.d.motivo === 'sin_fila', 'la lista con "Comuna 14": no');
  x = dec([B805], [reg('3735-SEPJDGAG', 'Jorge Macri', 'Belgrano', 'Reunión temática', D(1, 10))]);
  ok(x.d.estado === 'escribe' && x.d.fila === 805, 'el Tipo de la lista (temática) no coincide con el EVENTO de la 805 (Encuentro con Vecinos): cruza igual, el Tipo no cuenta para ±3');
}

// ===================================================================================================================
console.log('[10] filas "Reprogramada" (regla 8): no son candidatas; si es la única del día → sin_fila "fila_reprogramada"');
{
  const REP = { 'STATUS REUNIÓN': 'Reprogramada' };
  const dec = function (macri, regs, modo) {
    const E = entorno(macri, lista(regs || [REG_3735.slice(0, 4).concat([D(1, 10)])]));
    const res = correr(E, modo === 'real' ? false : true);
    return { E: E, res: res, d: decidio(res, '3735-SEPJDGAG') };
  };
  let x = dec([M('Belgrano', EV, D(1, 10), REP)]);
  ok(x.d.estado === 'no' && x.d.motivo === 'fila_reprogramada' && /la fila de ese día está Reprogramada y no hay otra a ±3 días con el mismo lugar/.test(x.d.detalle),
     'la ÚNICA fila del día está Reprogramada y no hay otra: sin_fila "fila_reprogramada" (' + x.d.detalle + ')');
  const sc = sinCruzar(x.E);
  ok(sc.length === 1 && sc[0].motivo === 'fila_reprogramada' && /fila 805 .*misma fecha, reprogramada/.test(sc[0].cands),
     '   y IDS_SIN_CRUZAR la muestra como contexto, con "reprogramada": ' + (sc[0] ? sc[0].cands : ''));
  x = dec([M('Belgrano', EV, D(1, 10), { 'STATUS REUNIÓN': ' reprogramada ' })]);
  ok(x.d.motivo === 'fila_reprogramada', 'el STATUS se normaliza (mayúsculas y espacios): " reprogramada " también');
  x = dec([M('Belgrano', EV, D(1, 10), REP), M('Belgrano', EV, D(3, 10), { 'STATUS REUNIÓN': 'en agenda' })], null, 'real');
  const c = colsBase(x.E);
  ok(x.d.estado === 'escribe' && x.d.fila === 806 && x.d.nivel === 'fecha_distinta', 'la Reprogramada (01/10) y la nueva (03/10, +2 días, mismo barrio): cruza la NUEVA por ±3 (fila ' + x.d.fila + ')');
  ok(celda(x.E, 806, c.id) === '3735-SEPJDGAG' && celda(x.E, 805, c.id) === '', '   y en la base el ID está en la nueva (806), no en la Reprogramada (805)');
  x = dec([M('Belgrano', EV, D(1, 10), REP), M('Belgrano', 'Uno a uno', D(1, 10))]);
  ok(x.d.estado === 'escribe' && x.d.fila === 806 && x.d.nivel === 'misma_fecha', 'la Reprogramada y otra fila del MISMO día sin ese status: cruza la otra (806), por la misma fecha');
  x = dec([M('Belgrano', EV, D(29, 9), REP)]);
  ok(x.d.estado === 'no' && x.d.motivo === 'sin_fila' && /ninguna fila a ±3 días/.test(x.d.detalle), 'una Reprogramada a −2 días no cuenta para ±3: sin_fila (no es candidata)');
  x = dec([M('Flores', EV, D(1, 10), REP)]);
  ok(x.d.motivo === 'fila_reprogramada', 'una Reprogramada del día en OTRO barrio (Flores): igual se avisa como fila_reprogramada (hay una fila del día que no es candidata)');
  // "Suspendida" sí es candidata (la reunión de la campaña ya se mandó): cruza y la traza lo dice
  x = dec([M('Belgrano', EV, D(1, 10), { 'STATUS REUNIÓN': 'Suspendida' })], null, 'real');
  const tr = registro(x.E).filter(function (t) { return t.id === '3735-SEPJDGAG'; })[0];
  ok(x.d.estado === 'escribe' && x.d.fila === FILA0 && !!tr && /fila Suspendida/.test(tr.como), 'una fila "Suspendida" SÍ es candidata: cruza y la traza dice "fila Suspendida" [' + (tr ? tr.como : '') + ']');
}

// ===================================================================================================================
console.log('[11] el invariante (reglas 9 y 10): un ID en una fila, una fila con un ID; los repetidos de la lista');
{
  const B805 = M('Belgrano', EV, D(29, 9));
  const dos = function (a, b, macri, o) {
    const E = entorno(macri || [B805], lista([a, b]), o);
    return { E: E, res: correr(E, true) };
  };
  const rj = function (id, d, envio, lugar) { return reg(id, 'Jorge Macri', lugar || 'Belgrano', 'Encuentro con vecinos', d, envio); };
  const r3735 = rj('3735-SEPJDGAG', D(1, 10));
  const deId = function (res, id) { return res.items.filter(function (it) { return it.r.id === id; }); };

  console.log('  -- el mismo ID más de una vez en la lista');
  let x = dos(rj('X-1', D(29, 9)), rj('X-1', D(29, 9)));
  ok(decidio(x.res, 'X-1').estado === 'escribe' && x.res.conteo.repetido === 1 && sinCruzar(x.E).length === 0,
     'el mismo ID dos veces con los MISMOS datos (una fila copiada): vale uno, el otro es "repetido" y no hace ruido');
  x = dos(rj('X-1', D(1, 10)), rj('X-1', D(29, 9)));
  let its = deId(x.res, 'X-1');
  ok(its.filter(function (it) { return it.final.estado === 'escribe'; }).length === 1 && its.filter(function (it) { return it.final.estado === 'repetido'; }).length === 1 &&
     x.res.conteo.escribeId === 1 && x.res.conteo.repetido === 1 && sinCruzar(x.E).length === 0,
     'el mismo ID con fechas distintas (01/10 y 29/09) pero que cruzan a la MISMA fila (la 805): cuenta como uno, el otro es "repetido" y no hace ruido');
  x = dos(rj('X-1', D(29, 9)), rj('X-1', D(2, 10), '', 'Flores'), [B805, M('Flores', 'Uno a uno', D(2, 10))]);
  ok(deId(x.res, 'X-1').every(function (it) { return it.final.motivo === 'id_repetido'; }) && sinCruzar(x.E).length === 2 && x.res.conteo.escribeId === 0,
     'el mismo ID que cruza a filas DISTINTAS (805 y 806): NINGUNO se escribe (id_repetido), los dos van a IDS_SIN_CRUZAR');
  x = dos(rj('X-1', D(29, 9)), rj('X-1', D(1, 1, 2025)));
  ok(deId(x.res, 'X-1').every(function (it) { return it.final.motivo === 'id_repetido'; }) && x.res.conteo.escribeId === 0,
     'el mismo ID que cruza en un registro y en el otro no: id_repetido, ninguno se escribe');

  console.log('  -- las fechas de envío de los repetidos que cruzan a la misma fila');
  const envios = function (a, b) {
    const E = entorno([B805], lista([rj('3735-SEPJDGAG', D(1, 10), a), rj('3735-SEPJDGAG', D(29, 9), b)]));
    const res = correr(E, false), c = colsBase(E);
    return { E: E, res: res, id: celda(E, 805, c.id), env: celda(E, 805, c.env) };
  };
  let e = envios(D(25, 9), D(24, 9));
  const dsc = sinCruzar(e.E).filter(function (s) { return s.motivo === 'fecha_envio_descartada'; });
  ok(e.id === '3735-SEPJDGAG' && e.env === '' && dsc.length === 1 && /repetido con fechas de envío distintas/.test(dsc[0].detalle) && /25\/09\/2026/.test(dsc[0].detalle) && /24\/09\/2026/.test(dsc[0].detalle) &&
     /El ID sí se escribe \(fila 805\)/.test(dsc[0].detalle) && e.res.conteo.escribeFecha === 0 && e.res.conteo.envioDescartado === 1,
     'dos fechas de envío válidas y DISTINTAS: se escribe el ID, NO la fecha de envío, y sale como fecha_envio_descartada (' + (dsc[0] ? dsc[0].detalle : '') + ')');
  e = envios(D(25, 9), D(25, 9));
  ok(e.id === '3735-SEPJDGAG' && dmy(e.env) === '25/09/2026' && sinCruzar(e.E).length === 0, 'la MISMA fecha de envío las dos veces: se escribe (25/09/2026)');
  e = envios(D(25, 9), '');
  ok(dmy(e.env) === '25/09/2026' && sinCruzar(e.E).length === 0, 'una fecha de envío válida y la otra vacía: se usa la válida (25/09/2026)');
  e = envios('', D(25, 9));
  ok(dmy(e.env) === '25/09/2026', '   (igual si la vacía va primero)');
  e = envios(D(25, 9), '#N/A');
  ok(dmy(e.env) === '25/09/2026', 'una fecha válida y la otra "#N/A": se usa la válida');
  e = envios(D(25, 9), D(25, 9, 2025));
  ok(dmy(e.env) === '25/09/2026', 'una fecha válida y la otra de un año que no cierra: se usa la válida');

  console.log('  -- dos IDs para la misma fila (regla 10)');
  x = dos(rj('X-1', D(29, 9)), rj('X-2', D(29, 9)));
  ok(decidio(x.res, 'X-1').motivo === 'fila_disputada' && decidio(x.res, 'X-2').motivo === 'fila_disputada' && /2 IDs para la fila 805: X-1, X-2/.test(decidio(x.res, 'X-1').detalle),
     'dos IDs de la misma fecha para la misma fila: fila_disputada, ninguno se escribe');
  x = dos(r3735, rj('3736-SEPJDGAG', D(29, 9)));
  ok(decidio(x.res, '3736-SEPJDGAG').estado === 'escribe' && decidio(x.res, '3736-SEPJDGAG').fila === 805 && decidio(x.res, '3735-SEPJDGAG').motivo === 'fila_tomada',
     'el 3735 (01/10) y otro ID del 29/09 para la 805: gana el de la MISMA fecha, el 3735 queda fila_tomada (' + decidio(x.res, '3735-SEPJDGAG').detalle + ')');
  x = dos(r3735, rj('3737-SEPJDGAG', D(2, 10)));
  ok(decidio(x.res, '3735-SEPJDGAG').motivo === 'fila_disputada' && decidio(x.res, '3737-SEPJDGAG').motivo === 'fila_disputada',
     'dos IDs de fecha distinta para la misma fila (01/10 y 02/10): empatan, ninguno se escribe');
  {
    // a igual nivel de fecha, la figura EXACTA gana a la conjunta donde está (el solo de "Agenda JM" contra la conjunta de "Agenda funcionarios")
    const conj = M('Belgrano', EV, D(29, 9), { 'Conjunta con': 'Hernán Lombardi' });
    const lombardi = filaBase({ Figura: 'Hernán Lombardi', Barrio: 'Núñez', EVENTO: EV, FECHA: D(1, 9) });
    const funs = FUN_VACIA.concat([fun('C-2', 'Jorge Macri, Hernán Lombardi', 'Belgrano', D(29, 9))]);
    const E = entorno([conj, lombardi], lista([rj('C-1', D(29, 9))]), { funcionarios: funs });
    const r = correr(E, true);
    ok(decidio(r, 'C-2').estado === 'escribe' && decidio(r, 'C-2').fila === 805 && decidio(r, 'C-1').motivo === 'fila_tomada' && /la figura exacta/.test(decidio(r, 'C-1').detalle),
       'misma fecha en los dos: la conjunta "Jorge Macri, Hernán Lombardi" (figura exacta) gana la 805; el Macri solo queda fila_tomada (' + decidio(r, 'C-1').detalle + ')');
    const funs2 = FUN_VACIA.concat([fun('C-2', 'Jorge Macri, Hernán Lombardi', 'Belgrano', D(1, 10))]);
    const E2 = entorno([conj, lombardi], lista([rj('C-1', D(1, 10))]), { funcionarios: funs2 });
    const r2 = correr(E2, true);
    ok(decidio(r2, 'C-2').estado === 'escribe' && decidio(r2, 'C-2').nivel === 'fecha_distinta' && decidio(r2, 'C-1').motivo === 'fecha_distinta_conjunta',
       'con fecha distinta en los dos: el Macri solo NO cruza una conjunta por ±3 (fecha_distinta_conjunta); la conjunta, sí');
  }

  console.log('  -- el ID ya está en la base');
  const HXrow = function (barrio, fecha, extra) { return M(barrio, EV, fecha, extra, HX); };
  let E = entorno([HXrow('Belgrano', D(29, 9)), HXrow('Flores', D(20, 9), { 'ID cuentas': '3735-sepjdgag' })], lista([r3735]), { columnasExtra: EXTRA });
  let res = correr(E, true);
  ok(decidio(res, '3735-SEPJDGAG').motivo === 'id_en_otra_fila' && /ya está en la fila 806 y el cruce da la fila 805/.test(decidio(res, '3735-SEPJDGAG').detalle),
     'el ID ya está en OTRA fila de la base (otro orden de mayúsculas): id_en_otra_fila, no se reescribe (' + decidio(res, '3735-SEPJDGAG').detalle + ')');
  E = entorno([HXrow('Belgrano', D(29, 9), { 'ID cuentas': '3735-sepjdgag' })], lista([r3735]), { columnasExtra: EXTRA });
  res = correr(E, false);
  const cc = colsBase(E);
  ok(decidio(res, '3735-SEPJDGAG').estado === 'ya_estaba' && celda(E, 805, cc.id) === '3735-sepjdgag' &&
     E.base().escrituras.filter(function (w) { return w.col === cc.id + 1; }).length === 0,
     'el ID ya está en esa fila, con otras mayúsculas: ya_estaba, no se toca (queda "3735-sepjdgag")');
  E = entorno([HXrow('Belgrano', D(29, 9), { 'ID cuentas': 'OTRO-9' })], lista([r3735]), { columnasExtra: EXTRA });
  res = correr(E, false);
  ok(decidio(res, '3735-SEPJDGAG').motivo === 'fila_con_otro_id' && celda(E, 805, colsBase(E).id) === 'OTRO-9' &&
     sinCruzar(E).some(function (s) { return s.motivo === 'fila_con_otro_id' && s.id === '3735-SEPJDGAG' && /la fila 805 ya tiene el ID OTRO-9/.test(s.detalle); }),
     'la fila ya tiene OTRO ID: fila_con_otro_id, no se toca y se lista con el ID que tiene');
  // "no" a mano (para que no vuelva un ID borrado): la fila no se toca, y el motivo lo explica
  E = entorno([HXrow('Belgrano', D(29, 9), { 'ID cuentas': 'no' })], lista([r3735]), { columnasExtra: EXTRA });
  res = correr(E, false);
  ok(decidio(res, '3735-SEPJDGAG').motivo === 'fila_con_otro_id' && celda(E, 805, colsBase(E).id) === 'no' &&
     /dice "NO" en "ID cuentas" \(no es un ID: lo puso el equipo para que no se escriba\)/.test(decidio(res, '3735-SEPJDGAG').detalle),
     '"no" escrito a mano en la fila: no se toca ("' + decidio(res, '3735-SEPJDGAG').detalle + '")');
}

// ===================================================================================================================
console.log('[12] en seco no escribe la base; en serio escribe sólo en celdas vacías: color #CFE2F3, formato dd/MM/yyyy sólo en las fechas escritas; fórmulas');
{
  // seis reuniones (20 al 25 de septiembre), con las dos columnas ya en la base y distintos estados de las celdas
  const dias = [20, 21, 22, 23, 24, 25];
  const macri = [
    M('Belgrano', EV, D(dias[0], 9), {}, HX),                                                                        // 805: las dos vacías
    M('Belgrano', EV, D(dias[1], 9), { 'ID cuentas': 'OTRO-ID' }, HX),                                               // 806: ya tiene OTRO ID
    M('Belgrano', EV, D(dias[2], 9), { 'ID cuentas': 'L-3' }, HX),                                                   // 807: el ID ya está, envío vacío
    M('Belgrano', EV, D(dias[3], 9), { 'ID cuentas': 'L-4', 'Fecha envío campañas': D(1, 1) }, HX),                  // 808: el ID ya está, envío del equipo
    M('Belgrano', EV, D(dias[4], 9), { 'Fecha envío campañas': D(2, 2) }, HX),                                       // 809: ID vacío, envío del equipo
    M('Belgrano', EV, D(dias[5], 9), {}, HX)];                                                                       // 810: la lista dice #N/A
  const regs = dias.map(function (d, i) { return reg('L-' + (i + 1), 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(d, 9), i === 5 ? '#N/A' : D(10 + i, 9)); });
  const E = entorno(macri, lista(regs), { columnasExtra: EXTRA });
  const c = colsBase(E), I = c.id + 1, V = c.env + 1;
  E.base().fondos['809:' + V] = '#FFFF00';                                                   // el color que le puso el equipo a su fecha de envío

  const seco = correr(E, true);
  ok(E.base().escrituras.length === 0 && Object.keys(E.base().fondos).length === 1 && Object.keys(E.base().formatos).length === 0,
     'EN SECO: ni un valor, ni un fondo, ni un formato en la base (' + E.base().escrituras.length + ' escrituras)');
  ok(seco.conteo.escribeId === 3 && seco.conteo.escribeFecha === 2 && seco.conteo.yaEstaba === 2 && seco.conteo.conflicto === 1,
     'EN SECO: dice lo que escribiría: 3 IDs (805, 809, 810) y 2 fechas de envío (805 y 807); 2 ya estaban; 1 conflicto (806)');
  ok(!!E.intermedia('IDS_SIN_CRUZAR') && !E.intermedia('REGISTRO_IDS'), 'EN SECO: escribe IDS_SIN_CRUZAR (intermedia) y NO el REGISTRO_IDS');

  const real = correr(E, false);
  ok(celda(E, 805, c.id) === 'L-1' && dmy(celda(E, 805, c.env)) === '10/09/2026', '805 (las dos vacías): se escribe el ID y la fecha de envío');
  ok(celda(E, 806, c.id) === 'OTRO-ID' && celda(E, 806, c.env) === '', '806 (tiene OTRO ID): no se toca, y tampoco se le escribe la fecha de envío de la lista');
  ok(celda(E, 807, c.id) === 'L-3' && dmy(celda(E, 807, c.env)) === '12/09/2026', '807 (el ID ya estaba): el ID no se toca; la fecha de envío, que estaba vacía, se completa');
  ok(celda(E, 808, c.id) === 'L-4' && dmy(celda(E, 808, c.env)) === '01/01/2026', '808 (el ID ya estaba y el equipo cargó su fecha): no se toca nada (queda 01/01/2026)');
  ok(celda(E, 809, c.id) === 'L-5' && dmy(celda(E, 809, c.env)) === '02/02/2026', '809 (el equipo cargó la fecha de envío): se escribe el ID y la fecha del equipo queda como estaba (02/02/2026)');
  ok(celda(E, 810, c.id) === 'L-6' && celda(E, 810, c.env) === '', '810 (la lista dice #N/A): se escribe el ID, la fecha de envío queda vacía');
  const fondo = function (f, col) { return E.base().fondos[f + ':' + col]; };
  ok(fondo(805, I) === '#CFE2F3' && fondo(805, V) === '#CFE2F3' && fondo(807, V) === '#CFE2F3' && fondo(809, I) === '#CFE2F3' && fondo(810, I) === '#CFE2F3',
     'las celdas ESCRITAS, en #CFE2F3 (805 ID y envío, 807 envío, 809 ID, 810 ID)');
  ok(!fondo(806, I) && !fondo(806, V) && !fondo(807, I) && !fondo(808, I) && !fondo(808, V) && !fondo(810, V),
     'las que NO se escribieron, sin color (806, 807 ID, 808, 810 envío)');
  ok(fondo(809, V) === '#FFFF00', 'la fecha de envío del equipo en 809 conserva SU color (#FFFF00)');
  const fmts = Object.keys(E.base().formatos).sort();
  ok(fmts.join(',') === ['805:' + V, '807:' + V].join(',') && fmts.every(function (k) { return E.base().formatos[k] === 'dd/MM/yyyy'; }),
     'el formato dd/MM/yyyy SÓLO en las dos fechas escritas (805 y 807): ' + fmts.join(', '));
  const otras = E.base().escrituras.filter(function (e) { return e.col !== I && e.col !== V; });
  ok(otras.length === 0, 'no se escribió ninguna otra columna de la base (' + otras.length + ')');
  const celdas = E.base().escrituras.map(function (e) { return e.fila + ':' + (e.col === I ? 'id' : 'env'); }).sort().join(',');
  ok(celdas === '805:env,805:id,807:env,809:id,810:id', 'las celdas escritas, exactamente: ' + celdas);
  const lin = registro(E);
  ok(lin.length === 4 && lin.filter(function (x) { return x.id === '(ya estaba) L-3'; }).length === 1, 'REGISTRO_IDS: una línea por fila donde se escribió algo (4); la de la 807 dice "(ya estaba)"');
  const sc = sinCruzar(E);
  ok(sc.length === 1 && sc[0].motivo === 'fila_con_otro_id' && sc[0].id === 'L-2' && sc[0].filaLista === 4,
     'IDS_SIN_CRUZAR: sólo L-2, fila_con_otro_id, con la fila de la lista (4)');
  ok(real.conteo.escribeId === 3 && real.conteo.escribeFecha === 2, 'la corrida en serio devuelve lo mismo que el seco: 3 IDs, 2 fechas');

  // idempotente: la segunda corrida no escribe nada
  const antes = E.base().escrituras.length;
  correr(E, false);
  ok(E.base().escrituras.length === antes && Object.keys(E.base().formatos).length === 2, 'la segunda corrida en serio no escribe nada');
}
{
  // el equipo escribe una celda ENTRE el cálculo y la escritura: la lectura fresca de setSiDelSistemaLote_ no la pisa
  const macri = [M('Belgrano', EV, D(20, 9), {}, HX), M('Belgrano', EV, D(21, 9), {}, HX), M('Belgrano', EV, D(22, 9), {}, HX)];
  const regs = [20, 21, 22].map(function (d, i) { return reg('R-' + (i + 1), 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(d, 9), D(10 + i, 9)); });
  const E = entorno(macri, lista(regs), { columnasExtra: EXTRA });
  const c = colsBase(E);
  E.run('var __d = leerDestino_(); var __l = leerListaIds_(); var __r = cruzarIds_(__l.registros, __d, { historial: true });');
  E.base().valores[805 - 1][c.id] = 'TIPEADO-POR-EL-EQUIPO';          // alguien lo cargó mientras tanto
  E.base().valores[806 - 1][c.env] = '03/03/2026';                    // y otro, una fecha de envío
  const w = E.run('escribirIdsBase_(__d.sh, __d.hdr, __r)');
  ok(celda(E, 805, c.id) === 'TIPEADO-POR-EL-EQUIPO' && !E.base().fondos['805:' + (c.id + 1)] && celda(E, 806, c.env) === '03/03/2026' && !E.base().fondos['806:' + (c.env + 1)],
     'si el equipo carga una celda después del cálculo y antes de escribir, no se pisa (ni se le pone color)');
  ok(w.saltadas === 3 && w.ids === 2 && celda(E, 806, c.id) === 'R-2' && celda(E, 807, c.id) === 'R-3' && dmy(celda(E, 807, c.env)) === '12/09/2026',
     '   y lo demás se escribe: 2 IDs (806 y 807), la fecha de la 807, y 3 pedidas que no se escribieron (' + w.saltadas + ')');
  // DECISIÓN (segunda revisión, 08/10): la fecha de envío va sólo al lado de un ID que quedó escrito (o ya estaba)
  ok(!celda(E, 805, c.env),
     '   DECISIÓN: la fecha de envío de la 805 NO se escribe: el ID que quedó es el del equipo, no el R-1 (antes se escribía al lado)');
}
{
  // Una columna que ya tiene FÓRMULAS no se escribe (regla 14)
  const macri = [M('Belgrano', EV, D(20, 9), {}, HX), M('Belgrano', EV, D(21, 9), {}, HX), M('Belgrano', EV, D(22, 9), {}, HX)];
  const regs = [20, 21, 22].map(function (d, i) { return reg('L-' + (i + 1), 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(d, 9), D(10 + i, 9)); });
  const montar = function (formulas) {
    const E = entorno(macri, lista(regs), { columnasExtra: EXTRA });
    const c = colsBase(E);
    formulas.forEach(function (f) { E.base().formulasCelda[f.fila + ':' + (c[f.col] + 1)] = f.f; });
    return { E: E, c: c };
  };
  const ids = function (m) { return [805, 806, 807].map(function (f) { return celda(m.E, f, m.c.id); }).join(','); };
  const envs = function (m) { return [805, 806, 807].map(function (f) { return ver(celda(m.E, f, m.c.env)); }).join(','); };

  let m = montar([{ fila: 806, col: 'id', f: '=SI(A806="";"";"x")' }]);
  let res = correr(m.E, false);
  ok(ids(m) === ',,' && envs(m) === 'vacía,vacía,vacía' && res.formulas['ID cuentas'] === 1 && res.formulas['Fecha envío campañas'] === 0,
     'una celda con FÓRMULA en "ID cuentas": esa columna no se escribe (IDs "' + ids(m) + '"), y la fecha de envío tampoco: no va al lado ' +
     'de un ID que no está (envíos ' + envs(m) + ')');
  ok(/"ID cuentas" tiene 1 celdas con FÓRMULA/.test(m.E.log()) && /no se escribe esa columna/.test(m.E.log()) && /3 escrituras sacadas/.test(m.E.log()),
     '   el log lo dice: "ID cuentas" tiene 1 celdas con FÓRMULA: no se escribe esa columna (3 escrituras sacadas)');
  ok(m.E.base().escrituras.length === 0, '   y no hay ninguna escritura en la base');
  const trz = registro(m.E);
  ok(trz.length === 0, '   y REGISTRO_IDS no anota nada (no se escribió nada) [' + trz.length + ']');

  m = montar([{ fila: 1, col: 'id', f: '={"ID cuentas"; ARRAYFORMULA(SI(A2:A="";"";"x"))}' }]);
  res = correr(m.E, false);
  ok(ids(m) === ',,' && res.formulas['ID cuentas'] === 1, 'una fórmula de array en la celda del ENCABEZADO (fila 1, como las once derivadas): tampoco se escribe esa columna');

  m = montar([{ fila: 807, col: 'env', f: '=hoy()' }]);
  res = correr(m.E, false);
  ok(ids(m) === 'L-1,L-2,L-3' && envs(m) === 'vacía,vacía,vacía' && res.formulas['Fecha envío campañas'] === 1,
     'una fórmula en "Fecha envío campañas": se escriben los IDs (' + ids(m) + ') y no las fechas de envío');

  m = montar([{ fila: 806, col: 'id', f: '=1' }, { fila: 806, col: 'env', f: '=2' }]);
  res = correr(m.E, false);
  ok(m.E.base().escrituras.length === 0 && ids(m) === ',,' && envs(m) === 'vacía,vacía,vacía' && !m.E.intermedia('REGISTRO_IDS'),
     'fórmulas en las dos columnas: no se escribe NADA en la base (ni REGISTRO_IDS)');

  m = montar([{ fila: 806, col: 'id', f: '=1' }]);
  res = correr(m.E, true);
  ok(/"ID cuentas" tiene 1 celdas con FÓRMULA/.test(m.E.log()) && m.E.base().escrituras.length === 0, 'en seco: el log avisa de la fórmula igual, y no se escribe nada');

  m = montar([]);
  res = correr(m.E, false);
  ok(ids(m) === 'L-1,L-2,L-3' && envs(m) === '10/09/2026,11/09/2026,12/09/2026' && res.formulas['ID cuentas'] === 0 && !/FÓRMULA/.test(m.E.log()),
     'control, sin fórmulas: se escriben las dos columnas y el log no avisa nada');
}

// ===================================================================================================================
console.log('[13] futuras y pasadas sin fila; la corrida de la hora no escribe en filas cerradas; REGISTRO_IDS al borde de la grilla');
{
  const vieja = M('Flores', EV, D(15, 8));          // para que la base conozca a Macri
  const reg1 = function (id, d, lugar) { return reg(id, 'Jorge Macri', lugar || 'Belgrano', 'Encuentro con vecinos', d); };
  let E = entorno([vieja], lista([reg1('FUT-1', D(20, 10)), reg1('PAS-1', D(20, 9))]));
  let res = correr(E, true);
  ok(decidio(res, 'FUT-1').motivo === 'futura_sin_fila' && res.conteo.futuraSinFila === 1 && !sinCruzar(E).some(function (x) { return x.id === 'FUT-1'; }),
     'una reunión FUTURA sin fila (20/10): futura_sin_fila, se cuenta aparte y NO va a IDS_SIN_CRUZAR (la agenda crea la fila cuando llega el mail)');
  ok(decidio(res, 'PAS-1').motivo === 'sin_fila' && res.conteo.sinFila === 1 && sinCruzar(E).some(function (x) { return x.id === 'PAS-1' && x.motivo === 'sin_fila' && /ninguna fila a ±3 días/.test(x.detalle); }),
     'una PASADA sin fila (20/09): sin_fila y SÍ va a IDS_SIN_CRUZAR ("ninguna fila a ±3 días")');
  // las filas futuras (segunda revisión, 08/10): cruzan, pero NINGUNA se escribe todavía —ni a +1 ni a +7—: reunion_futura,
  // no va a IDS_SIN_CRUZAR. Antes de que pase la reunión puede faltar la fila buena (la agenda la crea con el mail).
  [['a +1 día (09/10)', D(9, 10)], ['a +7 días (15/10)', D(15, 10)], ['a +8 días (16/10)', D(16, 10)], ['a +12 días (20/10)', D(20, 10)]].forEach(function (f) {
    E = entorno([M('Belgrano', EV, f[1])], lista([reg1('FUT-2', f[1])]));
    res = correr(E, true);
    const d = decidio(res, 'FUT-2');
    ok(d.estado === 'fuera' && d.cruzaCon === FILA0 && d.motivo === 'reunion_futura' && res.conteo.reunionFutura === 1 &&
       !sinCruzar(E).some(function (x) { return x.id === 'FUT-2'; }),
       'la fila de Macri ' + f[0] + ': cruza con la ' + FILA0 + ' y NO se escribe todavía (reunion_futura: "' + d.detalle + '")');
  });
  E = entorno([M('Belgrano', EV, D(15, 10))], lista([reg1('FUT-2', D(15, 10))]), { hoy: new Date(2026, 9, 16, 9, 0, 0) });
  ok(decidio(correr(E, true), 'FUT-2').estado === 'escribe', 'y cuando la reunión pasó (hoy = 16/10), la del 15/10 se escribe');
}
{
  // la corrida de la hora (regla 11): sólo filas activas; una fila CERRADA no recibe nada, ni siquiera la fecha de envío de un "ya_estaba"
  const macri = [M('Belgrano', EV, D(15, 8), { 'ID cuentas': 'OLD-1' }, HX),                                  // 805: CERRADA (15/08), el ID ya está, envío vacío
                 M('Belgrano', EV, D(16, 8), {}, HX),                                                          // 806: cerrada, sin ID
                 M('Belgrano', EV, D(29, 9), {}, HX)];                                                         // 807: activa
  const regs = [reg('OLD-1', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(15, 8), D(10, 8)),
                reg('OLD-2', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(16, 8), D(11, 8)),
                reg('ACT-1', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(29, 9), D(24, 9))];
  const E = entorno(macri, lista(regs), { columnasExtra: EXTRA });
  const res = E.run('idsEnLaHora_(false)'), c = colsBase(E);
  ok(celda(E, 807, c.id) === 'ACT-1' && dmy(celda(E, 807, c.env)) === '24/09/2026', 'la corrida de la hora: la fila activa (29/09) se escribe (ACT-1 con su fecha de envío)');
  ok(celda(E, 806, c.id) === '' && celda(E, 806, c.env) === '' && decidio(res, 'OLD-2').motivo === 'fila_fuera_de_esta_corrida',
     '   la cerrada (16/08) sin ID no se escribe: fila_fuera_de_esta_corrida (la hace el paso 57)');
  ok(decidio(res, 'OLD-1').estado === 'ya_estaba' && celda(E, 805, c.env) === '' && res.conteo.escribeFecha === 1,
     '   la cerrada (15/08) cuyo ID YA ESTABA tampoco recibe la fecha de envío: queda ' + ver(celda(E, 805, c.env)) + ' y cuenta ' + res.conteo.escribeFecha + ' fecha para escribir (la de la activa)');
  const E2 = entorno(macri, lista(regs), { columnasExtra: EXTRA });
  correr(E2, false);
  ok(dmy(celda(E2, 805, colsBase(E2).env)) === '10/08/2026' && celda(E2, 806, colsBase(E2).id) === 'OLD-2',
     '   (el historial, paso 57, sí completa las cerradas: la 805 recibe 10/08/2026 y la 806 su ID)');
}
{
  // REGISTRO_IDS al borde de la grilla (una solapa nueva trae 1000 filas): se le agregan filas y no se pierde la traza
  const macri = [], regs = [];
  for (let k = 0; k < 5; k++) {
    macri.push(M('Belgrano', EV, D(10 + k, 9)));
    regs.push(reg('R-' + k, 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', D(10 + k, 9)));
  }
  const E = entorno(macri, lista(regs));
  const ss = E.ctx.SpreadsheetApp.openById(E.cfg('RDV_SS_INTERMEDIA'));
  const sh = ss.insertSheet('REGISTRO_IDS');
  sh.appendRow(['hora', 'corrida', 'solapa', 'fila lista', 'ID', 'fila', 'Figura', 'FECHA', 'Barrio', 'Fecha (lista)', 'Barrio / Comuna (lista)', 'cómo', 'Fecha envío escrita']);
  for (let k = 0; k < 996; k++) sh.appendRow(['x', 'x', 'x', k, 'viejo-' + k, 1, 'f', '', '', '', '', '', '']);     // 997 filas con el encabezado: quedan 3 hasta las 1000
  const res = correr(E, false), c = colsBase(E);
  ok(celda(E, FILA0, c.id) === 'R-0' && res.conteo.escribeId === 5, 'REGISTRO_IDS casi llena (997 de 1000 filas): los 5 IDs se escriben en la base');
  ok(E.intermedia('REGISTRO_IDS').sheet.getLastRow() === 997 + 5 && E.intermedia('REGISTRO_IDS').sheet.getMaxRows() >= 1002 && !/No se pudo escribir REGISTRO_IDS/.test(E.log()),
     '   y las 5 líneas de la traza se agregan igual (la solapa crece: ' + E.intermedia('REGISTRO_IDS').sheet.getMaxRows() + ' filas)');
}

// ===================================================================================================================
console.log('[14] una Fecha imposible (antes de 2024-01-01 o a más de 180 días de hoy) se lista como fecha_imposible y no cruza');
{
  const vieja = M('Belgrano', EV, D(1, 9));
  const casos = [['IMP-1', D(1, 10, 2062), 'fecha_imposible'], ['IMP-2', D(31, 12, 2023), 'fecha_imposible'], ['IMP-3', D(1, 1, 2024), 'sin_fila'],
                 ['IMP-4', hoyMas(180), 'futura_sin_fila'], ['IMP-5', hoyMas(181), 'fecha_imposible'], ['IMP-6', D(1, 10, 2025), 'sin_fila'],
                 ['IMP-7', '01/10/2062', 'fecha_imposible'], ['IMP-8', D(1, 9), 'misma_fecha']];
  const E = entorno([vieja], lista(casos.map(function (x) { return reg(x[0], 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', x[1]); })));
  const res = correr(E, true);
  casos.forEach(function (x) {
    const d = decidio(res, x[0]);
    const bien = x[2] === 'misma_fecha' ? d.estado === 'escribe' && d.nivel === 'misma_fecha' : d.estado === 'no' && d.motivo === x[2];
    ok(bien, x[0] + ' (' + dmy(itemDe(res, x[0]).r.fecha) + '): ' + x[2] + ' [dio ' + (d.motivo || d.estado) + ']');
  });
  const imp = sinCruzar(E).filter(function (s) { return s.motivo === 'fecha_imposible'; }).map(function (s) { return s.id; }).sort();
  ok(imp.join(',') === 'IMP-1,IMP-2,IMP-5,IMP-7', 'IDS_SIN_CRUZAR lista las imposibles: ' + imp.join(', '));
  const l1 = sinCruzar(E).filter(function (s) { return s.id === 'IMP-1'; })[0], l5 = sinCruzar(E).filter(function (s) { return s.id === 'IMP-5'; })[0];
  ok(!!l1 && /01\/10\/2062/.test(l1.detalle) && !!l5 && /07\/04\/2027/.test(l5.detalle),
     '   con el detalle: "' + (l1 ? l1.detalle : '') + '" y "' + (l5 ? l5.detalle : '') + '"');
  ok(!sinCruzar(E).some(function (s) { return s.id === 'IMP-4'; }), '   la de hoy + 180 días (06/04/2027) es una futura normal: no se lista');
  const real = correr(E, false), c = colsBase(E);
  ok(celda(E, FILA0, c.id) === 'IMP-8' && E.base().valores.slice(1).filter(function (r) { return r[c.id]; }).length === 1, 'y en la base sólo se escribe el ID que cruzó (IMP-8): ' + real.conteo.escribeId + ' ID');
}

// ===================================================================================================================
console.log('[15] las fechas de la lista se leen en el huso horario de LA LISTA (la base y el script, en Buenos Aires)');
{
  const B805 = M('Belgrano', EV, D(29, 9));
  const regGMT = reg('3735-SEPJDGAG', 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', utc(2026, 10, 1), utc(2026, 9, 25));
  // una lista en GMT: la medianoche UTC es el 01/10 (y el 25/09)
  const E = entorno([B805], lista([regGMT]), { tzLista: 'GMT' });
  const lec = E.run('leerListaIds_()'), r = lec.solapas[0].registros[0];
  ok(lec.tz === 'GMT' && dmy(r.fecha) === '01/10/2026' && dmy(r.envio.fecha) === '25/09/2026' && r.fechaTexto === '01/10/2026' && r.envioTexto === '25/09/2026',
     'lista en GMT: un Date de 2026-10-01T00:00Z es el 01/10 y 2026-09-25T00:00Z el 25/09 (fechaTexto "' + r.fechaTexto + '")');
  const res = correr(E, false), c = colsBase(E);
  ok(decidio(res, '3735-SEPJDGAG').estado === 'escribe' && decidio(res, '3735-SEPJDGAG').fila === 805 && decidio(res, '3735-SEPJDGAG').nivel === 'fecha_distinta' &&
     dmy(celda(E, 805, c.env)) === '25/09/2026', '   y el cruce y la escritura usan esas fechas: 3735 → 805 por fecha distinta, envío 25/09/2026');
  ok(/huso horario de la lista: GMT/.test(E.log()) && /distinto del script/.test(E.log()),
     '   el log dice el huso: "huso horario de la lista: GMT (distinto del script, …)"');
  // la misma celda en una lista en Buenos Aires es el día anterior a las 21:00
  const E2 = entorno([B805], lista([regGMT]));
  const lec2 = E2.run('leerListaIds_()'), r2 = lec2.solapas[0].registros[0];
  ok(lec2.tz === 'America/Argentina/Buenos_Aires' && dmy(r2.fecha) === '30/09/2026' && dmy(r2.envio.fecha) === '24/09/2026' && !/huso horario de la lista: America.*distinto/.test(E2.log()),
     'el mismo instante en una lista en Buenos Aires es el 30/09 (y el 24/09): el huso de la lista decide (dio ' + dmy(r2.fecha) + ')');
  // en GMT lo que cuenta es el día UTC; el número de serie y el texto no dependen del huso
  const g = leer(lista([reg('G-1', 'Jorge Macri', 'Belgrano', '', utc(2026, 10, 1, 3)), reg('G-2', 'Jorge Macri', 'Belgrano', '', utc(2026, 10, 1, 23)),
                        reg('G-3', 'Jorge Macri', 'Belgrano', '', utc(2026, 10, 2, 0)), reg('G-4', 'Jorge Macri', 'Belgrano', '', serie(2026, 10, 1)),
                        reg('G-5', 'Jorge Macri', 'Belgrano', '', '01/10/2026')]), FUN_TAPIA, { tzLista: 'GMT' }).l.solapas[0].registros;
  ok(g.map(function (x) { return dmy(x.fecha); }).join(',') === '01/10/2026,01/10/2026,02/10/2026,01/10/2026,01/10/2026',
     'en GMT: 03:00Z y 23:00Z son del 01/10, 00:00Z del 02/10; el número de serie y el texto no dependen del huso: ' + g.map(function (x) { return dmy(x.fecha); }).join(', '));
}

// ===================================================================================================================
console.log('[16] a escala: 150 reuniones de Macri (una por día, el barrio va rotando) y 150 IDs; cada décimo con la fecha planeada +2 días');
{
  // el mismo barrio se repite cada 8 días: en la ventana de ±3 (7 días) nunca hay dos filas del mismo barrio
  const barrios = ['Belgrano', 'Flores', 'Caballito', 'Palermo', 'Recoleta', 'Almagro', 'Boedo', 'Mataderos'];
  const macri = [], regs = [];
  let corridos = 0;
  for (let k = 0; k < 150; k++) {
    const real = new Date(2026, 2, 1 + k, 12, 0, 0);                     // desde el 01/03/2026
    macri.push(M(barrios[k % 8], EV, real));
    const planeada = k % 10 === 9 ? new Date(2026, 2, 1 + k + 2, 12, 0, 0) : real;
    if (k % 10 === 9) corridos++;
    regs.push(reg('ESC-' + k, 'Jorge Macri', barrios[k % 8], 'Encuentro con vecinos', planeada));
  }
  const E = entorno(macri, lista(regs));
  const res = correr(E, false), c = colsBase(E);
  let bien = 0, mal = [];
  for (let k = 0; k < 150; k++) {
    if (celda(E, FILA0 + k, c.id) === 'ESC-' + k) bien++; else mal.push(k);
  }
  ok(bien === 150 && res.conteo.escribeId === 150 && res.conteo.mismaFecha === 150 - corridos && res.conteo.fechaDistinta === corridos,
     '150 IDs, cada uno en SU fila: ' + (150 - corridos) + ' por la misma fecha y ' + corridos + ' por fecha distinta (+2 días)' + (mal.length ? ' — mal: ' + mal.slice(0, 10).join(',') : ''));
  ok(res.sinCruzar.length === 0 && E.base().escrituras.filter(function (e) { return e.col !== c.id + 1 && e.col !== c.env + 1; }).length === 0,
     '   y nada queda sin cruzar ni se escribe otra columna');
  // el orden de la lista y de la base no cambia el resultado (por barrio y fecha de cada fila)
  const mapa = function (Ex) {
    const cx = colsBase(Ex), out = {};
    Ex.base().valores.slice(1).forEach(function (r) { if (r[cx.id]) out[r[cx.id]] = [r[1], dmy(r[4])].join('|'); });
    return out;
  };
  const E2 = entorno(macri.slice().reverse(), lista(regs.slice().reverse()));
  correr(E2, false);
  const a = mapa(E), b = mapa(E2);
  const difs = Object.keys(a).concat(Object.keys(b)).filter(function (k, i, arr) { return arr.indexOf(k) === i && a[k] !== b[k]; });
  ok(Object.keys(a).length === 150 && difs.length === 0, 'con la lista y la base en el orden inverso: los mismos IDs en las mismas reuniones (' + difs.length + ' diferencias)');
}

// ===================================================================================================================
console.log('[17] el ID repetido que cruza a la misma fila no depende del ORDEN de la lista (ex BUG 5, arreglado el 08/10 a las 23:04); BUGS abiertos: ninguno');
{
  // BUG 5 (arreglado) — _resolverIds_, paso 0 ("el mismo ID más de una vez en la lista"): cuando los repetidos cruzan a la MISMA fila, se
  // quedaba el PRIMERO de la lista, no el de mejor evidencia. Con el 3735 repetido (01/10: fecha distinta; 29/09: la misma fecha, las dos a
  // la 805) y otro ID (3737, 02/10, fecha distinta) para esa fila, lo que se escribía dependía del ORDEN de las filas de la lista: con la del
  // 29/09 primero, el 3735 ganaba la 805 por la misma fecha y el 3737 quedaba fila_tomada; con la del 01/10 primero, el que se quedaba era
  // de fecha distinta, empataba con el 3737 y los dos quedaban fila_disputada. El que se queda es el de mayor rango (misma fecha, figura exacta).
  const B805 = M('Belgrano', EV, D(29, 9));
  const rj = function (id, d) { return reg(id, 'Jorge Macri', 'Belgrano', 'Encuentro con vecinos', d); };
  const corrida = function (regs) { return correr(entorno([B805], lista(regs)), true); };
  const filas = [rj('3735-SEPJDGAG', D(29, 9)), rj('3735-SEPJDGAG', D(1, 10)), rj('3737-SEPJDGAG', D(2, 10))];
  const permutaciones = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const resumen = function (r) { return '3735 → ' + (filaEscrita(r, '3735-SEPJDGAG') || 'no') + ', 3737 → ' + (decidio(r, '3737-SEPJDGAG').motivo || filaEscrita(r, '3737-SEPJDGAG')); };
  const res17 = permutaciones.map(function (p) { return resumen(corrida(p.map(function (i) { return filas[i]; }))); });
  ok(res17[0] === '3735 → 805, 3737 → fila_tomada', 'con el repetido de la misma fecha (29/09) primero en la lista: 3735 → 805 y 3737 fila_tomada (' + res17[0] + ')');
  ok(res17.every(function (x) { return x === res17[0]; }),
     'en las 6 permutaciones de las 3 filas de la lista el resultado es el mismo (3735 → 805, 3737 fila_tomada): ' + Array.from(new Set(res17)).join(' | '));
}

// ===================================================================================================================
console.log('\n' + chequeos + ' chequeos.');
if (fallas) {
  console.log(fallas + ' FALLA(S)' + (bugsAbiertos ? ': ' + bugsAbiertos + ' son BUG de producción conocidos (las líneas "BUG" de arriba, marcadas "// BUG:" en el código)' +
              (fallas > bugsAbiertos ? ' y ' + (fallas - bugsAbiertos) + ' son FALLAS nuevas' : '') : ''));
  process.exit(1);
}
console.log('Todo en verde.');
process.exit(0);
