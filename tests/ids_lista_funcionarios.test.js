/**
 * tests/ids_lista_funcionarios.test.js — los IDs de los encuentros (45_IdsCuentas.js, 08/10): la solapa "Agenda
 * funcionarios" de la lista del equipo de campañas, cruzada contra la base, en el Apps Script simulado de tests/ids_mock.js.
 *
 *     node tests/ids_lista_funcionarios.test.js
 *
 * Las REGLAS (las del encabezado de 45_IdsCuentas.js, 08/10 noche): un ID es un texto con algún DÍGITO que no empieza con "#" y se
 * escribe como viene (las comparaciones no distinguen mayúsculas); cada campo de la lista, en la columna MÁS A LA IZQUIERDA con
 * alguno de sus nombres; Seguridad exige la misma comuna; en "Agenda funcionarios" una parte del Funcionario que no se reconoce
 * frena el cruce; la fecha distinta (±3) cruza sólo con UNA fila posible, de la figura exacta y el lugar que coincide, y sólo si la
 * fecha planeada ya pasó; una fila Reprogramada no es candidata; una conjunta va a la fila de la conjunta (con o sin los de "No
 * participa"); el mismo ID que cruza a la misma fila vale uno; dos IDs para una fila: gana la misma fecha y, a igual nivel, la
 * figura exacta; la hora no escribe en filas cerradas; una fecha de la lista antes de 2024 o a más de 180 días es un error de
 * tipeo; las fechas de la lista se leen en el huso de la lista; una columna con fórmulas no se escribe.
 *
 * [1]  la solapa: dos filas de encabezado (grupos + nombres), hasta la Y, la PRIMERA "Fecha de envío", qué es un ID, filas sin ID
 * [2]  el Funcionario: separadores (coma, " y ", "/", "-", ";", "+", "&", " e "), tildes, orden, repetidas, no reconocidas
 * [3]  las conjuntas contra la base: Figura + "Conjunta con", "A - B", una fila por figura, 2 contra 3, "Conjunta con" sin fila
 *      propia, "No participa", y una parte del Funcionario que no se reconoce
 * [4]  una figura sola: su fila propia contra la conjunta donde está ('exacta' antes que 'parcial'); quién gana una fila
 * [5]  "Seguridad en tu barrio": cómo se reconoce la fila (Evento (mail), EVENTO, formulario); la misma comuna, siempre
 * [6]  Comuna 1 Norte / Sur contra Retiro, Monserrat y compañía
 * [7]  el lugar de la lista: barrio, comuna, eje, vacío, texto que no se reconoce
 * [8]  la fecha distinta (±3 días): las filas posibles, la fecha planeada que todavía no pasó, el día sin lugar comparable
 * [9]  la Fecha de envío: "#N/A", "-", año que no cierra, serie, texto; formato y color de lo escrito; IDS_SIN_CRUZAR
 * [10] el invariante: un ID en una fila, una fila con un ID; los repetidos; las fechas de envío distintas
 * [11] la corrida de la hora (sólo filas activas) y el historial (todas)
 * [12] las filas Reprogramada (no son candidatas) y las Suspendida (sí)
 * [13] las fechas de la lista imposibles (el año mal escrito)
 * [14] el huso horario de la lista
 * [15] una columna de la base con fórmulas no se escribe
 * [16] propiedades con casos al azar (semilla fija): el orden no importa, nada se escribe dos veces, la segunda corrida no escribe
 *
 * Los chequeos marcados `// BUG:` muestran un error de producción que NO es una regla: FALLAN hasta que se arregle (hoy: tres, en [10] y [15]).
 * Los marcados `DISCUTIBLE:` fijan lo que el código hace hoy y es una decisión que se puede cambiar: pasan, pero hay que invertirlos
 * si se cambia. Todo lo demás es el comportamiento correcto.
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: IDs, fechas y casos inventados; las figuras son
 * las que ya aparecen en los otros tests del proyecto y los barrios, los de la Ciudad.
 */
'use strict';
const { crearEntornoIds, filaBase, hdrBase, D } = require('./ids_mock');

let fallas = 0, chequeos = 0;
function ok(cond, que) { chequeos++; console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }
/** Compara por JSON y, si falla, dice qué dio y qué se esperaba. */
function igual(actual, esperado, que) {
  const a = JSON.stringify(actual), e = JSON.stringify(esperado);
  ok(a === e, que + (a === e ? '' : '  → dio ' + a + ' y se esperaba ' + e));
}

// ---------------------------- las figuras, normalizadas como las ve el cruce ----------------------------
const LOM = 'hernan lombardi', TAP = 'gabino tapia', ARE = 'gustavo arengo piragine', MAC = 'jorge macri';
const FIGURAS_BASE = ['Hernán Lombardi', 'Gabino Tapia', 'Gustavo Arengo Piragine', 'Jorge Macri'];

// ---------------------------- la lista: "Agenda funcionarios" como la real (A..Y, dos filas de encabezado) ----------------------------
// Fila 1: los grupos ("Información del encuentro" en A, "Mail" en E, "Comunicación Directa" en L y en T). Fila 2: los nombres.
// A..E son las del cruce; el resto trae otras columnas, con OTRA "Fecha de envío" (SMS en la L, IVR en la T) como señuelo: si el
// código leyera la columna equivocada, escribiría el señuelo (01/01/2026) y los chequeos lo verían.
const GRUPOS_FUN = ['Información del encuentro', '', '', '', 'Mail', '', '', '', '', '', '', 'Comunicación Directa - SMS', '', '', '', '', '', '',
                    '', 'Comunicación Directa - IVR', '', '', '', '', ''];
const ENC_FUN = ['ID', 'Funcionario', 'Barrio / Comuna', 'Fecha', 'Fecha de envío', 'Enviados', 'Entregados', 'Abiertos', 'Clicks', 'Rebotes',
                 'Bajas', 'Fecha de envío', 'Enviados', 'Entregados', 'Leídos', 'Respuestas', 'Bajas', 'Errores', 'Costo', 'Fecha de envío',
                 'Llamados', 'Atendidos', 'Cortes', 'Duración', 'Errores'];
const SENUELO = D(1, 1);
/** Una fila de la lista: ID | Funcionario | Barrio / Comuna | Fecha | Fecha de envío, y el resto de las 25 columnas. */
function fila(id, funcionario, lugar, fecha, envio) {
  return [id, funcionario, lugar, fecha, envio, 100, 90, 40, 5, 1, 0, SENUELO, 80, 70, 30, 2, 0, 1, 0, SENUELO, 60, 50, 5, 30, 0];
}
const VACIA = ENC_FUN.map(function () { return ''; });
function listaFun(filas) { return [GRUPOS_FUN, ENC_FUN].concat(filas || []); }
// "Agenda JM" (sólo Macri): no se cruza nada acá; está para que el archivo sea como el real.
const JM_VACIA = [['', '', '', '', '', 'Comunicación Directa - Mail'], ['ID', 'Funcionario', 'Barrio / Comuna', 'Tipo', 'Fecha', 'Fecha de envío']];

// ---------------------------- la base ----------------------------
const COLS_IDS = ['ID cuentas', 'Fecha envío campañas'];
const HB = hdrBase(COLS_IDS);
/**
 * Un escenario: la base con las filas de `specs` ({ clave: { columna: valor } }, en ese orden: la clave sirve para decir "la fila
 * de la conjunta"; `n[clave]` es su número de fila en la hoja) y la lista `fun`. Las figuras que el cruce reconoce salen de la
 * columna Figura de la base, así que se agregan filas de relleno (cerradas y lejanas: no se cruzan con nada) para cada una de
 * `o.relleno` (por defecto las cuatro de FIGURAS_BASE). `o.sinColumnas`: la base todavía no tiene "ID cuentas" ni "Fecha envío
 * campañas" (el historial las agrega). `o.hoy`: el reloj (por defecto el 08/10/2026 21:00). `o.jm`: la solapa "Agenda JM" (por
 * defecto, sólo encabezados). `o.tzLista`: el huso horario de la lista ('GMT' para probar que sus fechas se leen en el suyo).
 */
function escenario(specs, fun, o) {
  o = o || {};
  const h = o.sinColumnas ? hdrBase() : HB;
  const filas = [], n = {};
  Object.keys(specs).forEach(function (k, i) {
    filas.push(filaBase(Object.assign({ EVENTO: 'Encuentro con Vecinos' }, specs[k]), h));
    n[k] = i + 2;
  });
  (o.relleno || FIGURAS_BASE).forEach(function (fig) {
    filas.push(filaBase({ Figura: fig, Barrio: 'Palermo', FECHA: D(15, 1), EVENTO: 'Encuentro con Vecinos' }, h));
  });
  const E = crearEntornoIds({
    base: filas, columnasExtra: o.sinColumnas ? [] : COLS_IDS, maxColsBase: o.sinColumnas ? h.length : undefined,
    jm: o.sinJM ? undefined : (o.jm || JM_VACIA), funcionarios: o.sinFuncionarios ? undefined : listaFun(fun), hoy: o.hoy, tzLista: o.tzLista
  });
  return { E: E, n: n, relleno: filas.length - Object.keys(specs).length };
}
/** Corre el cruce: 'historial' (paso 57, escribe), 'seco' (paso 56) o 'hora' (la corrida de la hora, escribe). */
function correr(sc, modo) {
  const e = { historial: 'idsHistorial(false)', seco: 'idsHistorial(true)', hora: 'idsEnLaHora_(false)' }[modo || 'historial'];
  sc.res = sc.E.run(e);
  return sc.res;
}
const pad = function (n) { return ('0' + n).slice(-2); };
/** dd/MM/yyyy de una fecha; '' si la celda no es una fecha. */
function fecha(v) { return v && v.getTime ? pad(v.getDate()) + '/' + pad(v.getMonth() + 1) + '/' + v.getFullYear() : ''; }
function celda(sc, clave, col) {
  const i = sc.E.base().valores[0].indexOf(col);
  return i < 0 ? undefined : sc.E.base().valores[sc.n[clave] - 1][i];
}
const idDe = function (sc, clave) { return celda(sc, clave, 'ID cuentas'); };
const envioDe = function (sc, clave) { return fecha(celda(sc, clave, 'Fecha envío campañas')); };
/** El item de un registro de la lista (`k`: la copia, si el ID está repetido). */
function item(sc, id, k) { return sc.res.items.filter(function (x) { return x.r.id === id; })[k || 0]; }
/** Cómo terminó un registro: 'escribe', 'ya_estaba', 'repetido', 'ya_en_la_base', 'fuera/<motivo>' o 'no/<motivo>'. */
function estado(sc, id, k) {
  const it = item(sc, id, k);
  if (!it) return 'no está';
  const f = it.final;
  return f.estado + (f.estado === 'no' || f.estado === 'fuera' ? '/' + f.motivo : '');
}
/** Con qué fila cruzó (antes del invariante) y con qué identidad: [fila, 'exacta' | 'parcial', 'misma_fecha' | 'fecha_distinta']. */
function cruce(sc, id) {
  const it = item(sc, id);
  return it && it.ev.estado === 'cruza' ? [it.ev.e.x.f.fila, it.ev.e.ident, it.ev.nivel] : null;
}
function lineasSC(sc) { const h = sc.E.intermedia('IDS_SIN_CRUZAR'); return h ? h.valores.slice(1) : []; }
function lineaSC(sc, id, motivo) {
  return lineasSC(sc).filter(function (r) { return r[4] === id && (!motivo || r[0] === motivo); })[0] || null;
}
function lineasRegistro(sc) { const h = sc.E.intermedia('REGISTRO_IDS'); return h ? h.valores.slice(1) : []; }
/** Los IDs escritos en la base, por clave de fila (sólo las que tienen). */
function escritos(sc) {
  const out = {};
  Object.keys(sc.n).forEach(function (k) { const v = idDe(sc, k); if (v !== '' && v != null) out[k] = v; });
  return out;
}
const quien = function (E, texto) {
  const q = E.run('quienDeFuncionarioIds_(' + JSON.stringify(texto) + ')');
  return { norm: Array.from(q.norm), seguridad: q.seguridad, noRec: Array.from(q.noReconocidas) };
};

const f30 = D(30, 9), f1 = D(1, 10), f2 = D(2, 10), f3 = D(3, 10), f5 = D(5, 10), f7 = D(7, 10);
const C3 = 'Hernan Lombardi, Gustavo Arengo Piragine, Gabino Tapia';

// ============================================================================================================================
console.log('[1] la solapa: dos filas de encabezado, columnas por encabezado, filas sin ID y vacías');
{
  const sc = escenario({ t: { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f3 } }, [
    fila('F-1', 'Gabino Tapia', 'Retiro', f3, D(1, 10)),
    fila('', 'Gabino Tapia', 'Recoleta', D(9, 10), ''),            // sin ID, con Funcionario: se cuenta, no es registro
    fila('', '', '', D(10, 10), ''),                                // sin ID, sólo con Fecha: también se cuenta
    VACIA,                                                          // vacía en el medio
    fila('F-2', 'Hernan Lombardi', 'Núñez', f5, ''),
    VACIA, VACIA                                                    // vacías al final
  ]);
  sc.E.run('leerDestino_()');
  const l = sc.E.run('leerListaIds_()');
  const sf = l.solapas.filter(function (s) { return s.solapa === 'Agenda funcionarios'; })[0];
  const sj = l.solapas.filter(function (s) { return s.solapa === 'Agenda JM'; })[0];
  igual(sf.filaEncabezado, 2, 'el encabezado es la fila 2 (la 1 es la de los grupos: "Información del encuentro", "Mail"…)');
  igual(Array.from(sf.registros).map(function (r) { return r.id + '@' + r.filaLista; }), ['F-1@3', 'F-2@7'],
        'sólo son registros las filas con ID (F-1 en la fila 3 de la hoja y F-2 en la 7), con su fila en la lista');
  igual(sf.sinId, 2, 'las filas sin ID que traen Funcionario o Fecha se cuentan en `sinId` (2); las vacías no');
  igual(Object.assign({}, sf.columnas), { id: 0, funcionario: 1, lugar: 2, tipo: null, fecha: 3, envio: 4 },
        'columnas por encabezado: A ID, B Funcionario, C Barrio / Comuna, D Fecha, E la PRIMERA "Fecha de envío"; sin Tipo');
  igual(Object.assign({}, sf.repetidas), { envio: [4, 11, 19] },
        'la "Fecha de envío" está en tres columnas (E, L y T: mail, SMS, IVR): se anota y se usa la de más a la izquierda');
  igual(sf.idNoValido.length, 0, 'ninguna fila con algo que no sea un ID');
  sc.E.run('_logListaIds_(leerListaIds_())');
  ok(/OJO: "envio" está en más de una columna \(E, L, T\): se usa la primera, E\./.test(sc.E.log()), 'el log lo avisa: OJO "envio" está en E, L, T; se usa la primera, E');
  ok(/"Agenda funcionarios": encabezado en la fila 2 \(id A, funcionario B, lugar C, tipo —, fecha D, envio E\) \| 2 IDs \| 2 filas con Funcionario o Fecha y sin ID \| 0 que no son un ID/.test(sc.E.log()),
     'y el log cuenta los IDs (2), las filas sin ID (2) y los que no son un ID (0)');
  const r1 = sf.registros[0];
  ok(r1.tipoTexto === '' && r1.tipo === '', 'sin columna Tipo: el registro no trae tipo');
  ok(r1.solapa === 'Agenda funcionarios' && r1.funcionario === 'Gabino Tapia' && r1.lugarTexto === 'Retiro', 'el registro trae solapa, Funcionario y lugar');
  igual(fecha(r1.fecha), '03/10/2026', 'la Fecha del encuentro');
  igual(fecha(r1.envio.fecha), '01/10/2026', 'la Fecha de envío es la de la columna E (no el señuelo de la L ni el de la T)');
  ok(!sj.error && sj.registros.length === 0, '"Agenda JM" (sólo encabezados): sin registros y sin error');
  igual(l.registros.length, 2, 'la lista entera: los 2 registros');
}
{
  // otra grafía de los encabezados (mayúsculas, espacios, sin tilde, sin espacios alrededor de la barra)
  const E = crearEntornoIds({ base: [filaBase({ Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f3 }, HB)], columnasExtra: COLS_IDS,
    funcionarios: [['grupo'], ['  id ', 'FUNCIONARIO ', 'Barrio/Comuna', 'fecha ', 'Fecha de envio'], ['A-1', 'Gabino Tapia', 'Retiro', f3, D(1, 10)]] });
  E.run('leerDestino_()');
  const sf = E.run('leerListaIds_()').solapas.filter(function (s) { return s.solapa === 'Agenda funcionarios'; })[0];
  ok(sf.registros.length === 1 && sf.registros[0].id === 'A-1' && fecha(sf.registros[0].envio.fecha) === '01/10/2026',
     'los encabezados se leen normalizados ("  id ", "FUNCIONARIO ", "Barrio/Comuna", "fecha ", "Fecha de envio")');
}
{
  // sin fila de grupos (el encabezado en la fila 1) y sin encabezado
  const E1 = crearEntornoIds({ base: [filaBase({ Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f3 }, HB)], columnasExtra: COLS_IDS,
    funcionarios: [ENC_FUN, fila('A-1', 'Gabino Tapia', 'Retiro', f3, '')] });
  E1.run('leerDestino_()');
  const s1 = E1.run('leerListaIds_()').solapas[1];
  ok(s1.filaEncabezado === 1 && s1.registros.length === 1 && s1.registros[0].filaLista === 2, 'el encabezado también puede estar en la fila 1');
  const E2 = crearEntornoIds({ base: [filaBase({ Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f3 }, HB)], columnasExtra: COLS_IDS,
    jm: JM_VACIA, funcionarios: [['a', 'b'], ['c', 'd'], ['e', 'f']] });
  E2.run('leerDestino_()');
  const s2 = E2.run('leerListaIds_()').solapas[1];
  ok(s2.filaEncabezado === null && /no se encontró el encabezado/.test(s2.error) && s2.registros.length === 0,
     'sin encabezado (ID, Funcionario y Fecha en las primeras 5 filas): error en esa solapa y cero registros');
  const E3 = crearEntornoIds({ base: [filaBase({ Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f3 }, HB)], columnasExtra: COLS_IDS,
    jm: JM_VACIA, funcionarios: [[''], [''], ['']] });
  E3.run('leerDestino_()');
  ok(/vacía/.test(E3.run('leerListaIds_()').solapas[1].error), 'una solapa vacía: lo dice ("la solapa está vacía")');
}
{
  // REGLA: un ID es un texto con algún DÍGITO que no empieza con "#". "#N/A", "#REF!", "-", "Pendiente", "F-OK" (sin dígito: "F-0K"
  // sí) no son IDs: no son registros (no se cruzan ni se escriben), y se cuentan aparte, con su fila, en `idNoValido` (no en `sinId`).
  const malos = ['#N/A', '-', '#REF!', 'Pendiente', 'F-OK', 'N/A', '#3735', 'ID-', '—'];
  const buenos = ['F-0K', '3735-abc', 3736, ' 12 ', '1', '7 x'];
  const todos = malos.concat(buenos), specs = {};
  todos.forEach(function (x, i) { specs['r' + i] = { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: D(1 + i, 9) }; });
  const sc = escenario(specs, todos.map(function (x, i) { return fila(x, 'Gabino Tapia', 'Retiro', D(1 + i, 9), ''); }));
  correr(sc);
  const sf = sc.E.run('leerListaIds_()').solapas.filter(function (s) { return s.solapa === 'Agenda funcionarios'; })[0];
  igual(Array.from(sf.idNoValido).map(function (o) { return o.filaLista + ':' + o.texto; }), malos.map(function (t, i) { return (3 + i) + ':' + t; }),
        'idNoValido: las 9 filas con algo que no es un ID ("#N/A", "-", "#REF!", "Pendiente", "F-OK", "N/A", "#3735", "ID-", "—"), con su fila de la lista');
  ok(sf.registros.length === buenos.length && sf.sinId === 0, 'sólo los que sí lo son (6) son registros, y esas filas no se cuentan como "sin ID" (sinId 0)');
  igual(malos.map(function (t, i) { return idDe(sc, 'r' + i); }), malos.map(function () { return ''; }), 'a las filas de los que no son IDs no se les escribe nada en "ID cuentas"');
  igual(buenos.map(function (t, i) { return String(idDe(sc, 'r' + (malos.length + i))); }), ['F-0K', '3735-abc', '3736', '12', '1', '7 x'],
        'los que sí: "F-0K", "3735-abc", el número 3736, " 12 " recortado, "1" y "7 x" (espacio duro colapsado)');
  ok(lineasSC(sc).length === 0, 'y no ensucian IDS_SIN_CRUZAR (no son registros de la lista)');
  sc.E.run('_logListaIds_(leerListaIds_())');
  ok(/\| 0 filas con Funcionario o Fecha y sin ID \| 9 que no son un ID \|/.test(sc.E.log()), 'el log cuenta 9 que no son un ID');
  // Un 0 (el "sin ID" de una fórmula) no es un ID (regla del 08/10, después del informe de este test): no se escribe.
  const sc0 = escenario({ t: { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f3 } }, [fila(0, 'Gabino Tapia', 'Retiro', f3, '')]);
  correr(sc0);
  igual(String(idDe(sc0, 't')), '', 'un 0 numérico en la columna ID no es un ID: no se escribe');
}
{
  // REGLA: cada campo de la lista, en la columna MÁS A LA IZQUIERDA con alguno de sus nombres (no la del primer nombre que aparezca): con
  // "Fecha envío" en la E (el bloque Mail) y, más a la derecha, "Fecha de envío" (SMS e IVR), vale la E.
  const E = crearEntornoIds({ base: [filaBase({ Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f3 }, HB)], columnasExtra: COLS_IDS, jm: JM_VACIA,
    funcionarios: [GRUPOS_FUN, ENC_FUN.map(function (h, i) { return i === 4 ? 'Fecha envío' : h; }), fila('A-1', 'Gabino Tapia', 'Retiro', f3, D(25, 9))] });
  E.run('leerDestino_()');
  const sf = E.run('leerListaIds_()').solapas.filter(function (s) { return s.solapa === 'Agenda funcionarios'; })[0];
  ok(sf.columnas.envio === 4 && fecha(sf.registros[0].envio.fecha) === '25/09/2026',
     'con "Fecha envío" en la E y "Fecha de envío" más a la derecha se toma la de más a la izquierda (la E, 25/09/2026); dio la columna ' + sf.columnas.envio + ' (' + fecha(sf.registros[0].envio.fecha) + ')');
  igual(Object.assign({}, sf.repetidas), { envio: [4, 11, 19] }, '…y las tres columnas de envío (E, L y T) quedan anotadas');
}
{
  // una solapa que falla no frena a la otra, y el cruce sigue con lo que se pudo leer
  const sc = escenario({ t: { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f3 } }, [fila('F-1', 'Gabino Tapia', 'Retiro', f3, '')], { sinJM: true });
  correr(sc);
  ok(idDe(sc, 't') === 'F-1' && /"Agenda JM": NO SE LEYÓ — no existe la solapa/.test(sc.E.log()),
     '"Agenda JM" no existe: el log lo dice y "Agenda funcionarios" se cruza igual');
  const sc2 = escenario({ t: { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f3 } }, null, { sinFuncionarios: true });
  correr(sc2);
  ok(idDe(sc2, 't') === '' && /"Agenda funcionarios": NO SE LEYÓ/.test(sc2.E.log()), 'y al revés: sin "Agenda funcionarios", no se escribe nada y el log lo dice');
}
{
  // REGLA: el ID se escribe COMO VIENE en la lista (recortado y con los espacios colapsados), no en mayúsculas; las comparaciones
  // (repetidos, "ya estaba", "está en otra fila") siguen sin distinguir mayúsculas.
  const sc = escenario({ a: { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f3 }, b: { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f3 },
                         c: { Figura: 'Jorge Macri', Barrio: 'Belgrano', FECHA: f3 } }, [
    fila('  3735-abc  ', 'Gabino Tapia', 'Retiro', f3, ''), fila(3736, 'Hernán Lombardi', 'Núñez', f3, ''),
    fila('7 x', 'Jorge Macri', 'Belgrano', f3, '')]);
  correr(sc);
  igual([idDe(sc, 'a'), String(idDe(sc, 'b')), idDe(sc, 'c')], ['3735-abc', '3736', '7 x'],
        'el ID se escribe como viene: "  3735-abc  " → "3735-abc" (sin pasarlo a mayúsculas), el número 3736, "7 x" con el espacio duro colapsado');
  ok(lineasRegistro(sc).some(function (r) { return r[4] === '3735-abc'; }), '…y REGISTRO_IDS lo anota como viene');
  // la comparación no distingue mayúsculas: el mismo ID en la base con otras mayúsculas es "el mismo"
  const sc2 = escenario({ otra: { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f5, 'ID cuentas': 'AB-9' }, t: { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f3 } },
                        [fila('ab-9', 'Gabino Tapia', 'Retiro', f3, '')]);
  correr(sc2);
  igual([estado(sc2, 'AB-9'), idDe(sc2, 't')], ['no/id_en_otra_fila', ''], 'la lista dice "ab-9" y la base ya tiene "AB-9" en otra fila: es el mismo ID (id_en_otra_fila), no se escribe');
  ok(lineaSC(sc2, 'ab-9', 'id_en_otra_fila') !== null, '…y IDS_SIN_CRUZAR lo muestra como viene en la lista ("ab-9")');
}

// ============================================================================================================================
console.log('[2] el Funcionario: separadores, tildes, orden, repetidas, las partes que no se reconocen');
{
  // figuras de la base: las cuatro, Ana Pereyra y Luis Pereyra (para el apellido que comparten dos figuras)
  const sc = escenario({}, [], { relleno: FIGURAS_BASE.concat(['Ana Pereyra', 'Luis Pereyra']) });
  sc.E.run('leerDestino_()');
  const q = function (t) { return quien(sc.E, t); };
  igual(q(C3).norm, [LOM, ARE, TAP], 'coma: "Hernan Lombardi, Gustavo Arengo Piragine, Gabino Tapia" → las tres, en ese orden (sin tilde en Hernán)');
  igual(q('Hernán Lombardi y Gabino Tapia').norm, [LOM, TAP], '" y "');
  igual(q('Hernán Lombardi / Gabino Tapia').norm, [LOM, TAP], '"/"');
  igual(q('Hernán Lombardi - Gabino Tapia').norm, [LOM, TAP], '" - " (con espacios)');
  igual(q('Lombardi-Tapia-Piragine').norm, [LOM, TAP, ARE], '"-" sin espacios, sólo apellidos: "Lombardi-Tapia-Piragine" (apellidos únicos)');
  igual(q('Hernán Lombardi; Gabino Tapia').norm, [LOM, TAP], '";"');
  igual(q('Hernán Lombardi + Gabino Tapia').norm, [LOM, TAP], '"+"');
  igual(q('Hernán Lombardi & Gabino Tapia').norm, [LOM, TAP], '"&"');
  igual(q('Gabino Tapia e Hernán Lombardi').norm, [TAP, LOM], '" e "');
  igual(q('Hernan Lombardi, Gustavo Arengo Piragine y Gabino Tapia').norm, [LOM, ARE, TAP], 'coma y " y " juntas');
  igual(q('Gabino Tapia, Hernán Lombardi').norm, [TAP, LOM], 'otro orden: el de la lista (el cruce compara conjuntos)');
  igual(q('HERNAN LOMBARDI').norm, [LOM], 'mayúsculas y sin tilde');
  igual(q('  Gabino   Tapia ').norm, [TAP], 'espacios de más');
  igual(q('Gabino Tapia, Gabino Tapia').norm, [TAP], 'una figura repetida cuenta una vez');
  igual(q('Gabino Tapia\nHernán Lombardi').norm.slice().sort(), [LOM, TAP].sort(), 'con un salto de línea en la celda (Alt+Enter)');
  igual(q('Gustavo Arengo').norm, [ARE], '"Gustavo Arengo" sin Piragine (variante del legado)');
  igual(q('Macri').norm, [MAC], 'un apellido único solo');
  const x = q('Gabino Tapia, Fulano De Tal');
  igual([x.norm, x.noRec], [[TAP], ['Fulano De Tal']], 'una parte que no es de la base queda en `noReconocidas` y las demás se reconocen');
  const p = q('Pereyra');
  igual([p.norm, p.noRec], [[], ['Pereyra']], 'un apellido que comparten dos figuras (Ana y Luis Pereyra) no se reconoce: no se elige');
  igual(q('Ana Pereyra').norm, ['ana pereyra'], 'con el nombre, sí');
  for (const t of ['Seguridad en tu barrio', 'SEGURIDAD EN TU BARRIO', 'Seguridad en tu Barrio', ' seguridad  en tu barrio ']) {
    const s = q(t);
    ok(s.seguridad === true && s.norm.length === 0, '"' + t + '" → Seguridad, sin figura');
  }
  const v = q('');
  ok(!v.seguridad && v.norm.length === 0 && v.noRec.length === 0, 'vacío: nada');
}

// ============================================================================================================================
console.log('[3] las conjuntas contra la base');
{
  // (a) Figura + "Conjunta con": cruza, sea cual sea la grafía, el orden o el separador de la lista
  const variantes = [
    ['coma, sin tildes', C3],
    ['con tildes', 'Hernán Lombardi, Gustavo Arengo Piragine, Gabino Tapia'],
    ['otro orden', 'Gabino Tapia, Hernán Lombardi, Gustavo Arengo Piragine'],
    ['" / "', 'Gabino Tapia / Gustavo Arengo Piragine / Hernán Lombardi'],
    ['"-" sin espacios, apellidos', 'Lombardi-Tapia-Piragine'],
    ['" y " y mayúsculas', 'GUSTAVO ARENGO PIRAGINE y GABINO TAPIA y HERNAN LOMBARDI'],
    ['"+"', 'Hernán Lombardi + Gabino Tapia + Gustavo Arengo Piragine']
  ];
  variantes.forEach(function (v) {
    const sc = escenario({
      conj: { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f30, 'Conjunta con': 'Gustavo Arengo Piragine / Gabino Tapia' },
      otra: { Figura: 'Jorge Macri', Barrio: 'Belgrano', FECHA: f30 }
    }, [fila('K-1', v[1], 'Núñez', f30, D(26, 9))]);
    correr(sc);
    igual([estado(sc, 'K-1'), cruce(sc, 'K-1'), idDe(sc, 'conj'), idDe(sc, 'otra')], ['escribe', [sc.n.conj, 'exacta', 'misma_fecha'], 'K-1', ''],
          '(a) Figura + "Conjunta con" — ' + v[0] + ': cruza con la conjunta (exacta) y con ninguna otra fila');
    ok(lineasRegistro(sc).some(function (r) { return /conjunta/.test(r[11]) && !/fila conjunta/.test(r[11]); }), '    la traza dice "conjunta"');
  });

  // (b) una Figura que junta varias, "A - B": cruza si es el mismo conjunto
  let sc = escenario({ ab: { Figura: 'Hernán Lombardi - Gabino Tapia', Barrio: 'Núñez', FECHA: f30 } },
                     [fila('K-1', 'Gabino Tapia y Hernán Lombardi', 'Núñez', f30, '')]);
  correr(sc);
  igual([estado(sc, 'K-1'), cruce(sc, 'K-1'), idDe(sc, 'ab')], ['escribe', [sc.n.ab, 'exacta', 'misma_fecha'], 'K-1'],
        '(b) Figura "Hernán Lombardi - Gabino Tapia": la lista "Gabino Tapia y Hernán Lombardi" es el mismo conjunto (otro orden): cruza');
  sc = escenario({ ab: { Figura: 'Hernán Lombardi - Gabino Tapia', Barrio: 'Núñez', FECHA: f30 } }, [fila('K-1', C3, 'Núñez', f30, '')]);
  correr(sc);
  ok(estado(sc, 'K-1') === 'no/conjunta_sin_fila' && idDe(sc, 'ab') === '', '(b) …pero una conjunta de TRES no cruza con la "A - B" de dos: conjunta_sin_fila');
  ok(/fila 2 \(Hernán Lombardi - Gabino Tapia, 30\/09\/2026, Núñez, misma fecha\)/.test(lineaSC(sc, 'K-1', 'conjunta_sin_fila')[10]),
     '    …y la "A - B" aparece como candidata en IDS_SIN_CRUZAR');

  // (c) una fila por figura, sin "Conjunta con": la conjunta NO cruza (conjunta_sin_fila, con las filas de esas figuras como candidatas);
  // cada figura sola, con la suya
  sc = escenario({
    lom: { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f30 },
    tap: { Figura: 'Gabino Tapia', Barrio: 'Núñez', FECHA: f30 },
    are: { Figura: 'Gustavo Arengo Piragine', Barrio: 'Núñez', FECHA: f30 }
  }, [fila('K-1', C3, 'Núñez', f30, ''), fila('L-1', 'Hernán Lombardi', 'Núñez', f30, ''), fila('T-1', 'Gabino Tapia', 'Núñez', f30, ''),
      fila('A-1', 'Gustavo Arengo Piragine', 'Núñez', f30, '')]);
  correr(sc);
  ok(estado(sc, 'K-1') === 'no/conjunta_sin_fila' && cruce(sc, 'K-1') === null, '(c) tres filas, una por figura: la conjunta NO cruza con ninguna (conjunta_sin_fila)');
  const lc = lineaSC(sc, 'K-1', 'conjunta_sin_fila');
  ok(!!lc && /fila 2 \(Hernán Lombardi,/.test(lc[10]) && /fila 3 \(Gabino Tapia,/.test(lc[10]) && /fila 4 \(Gustavo Arengo Piragine,/.test(lc[10]),
     '(c) …y sale en IDS_SIN_CRUZAR con las filas de esas tres figuras como candidatas');
  ok(!!lc && /ninguna fila con esas 3 figuras juntas/.test(lc[1]), '    el detalle dice que ninguna fila junta a las 3 figuras');
  igual(escritos(sc), { lom: 'L-1', tap: 'T-1', are: 'A-1' }, '(c) cada figura sola, con su fila propia');

  // (d) 2 contra 3 y 3 contra 2: no cruzan
  sc = escenario({ conj: { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f30, 'Conjunta con': 'Gustavo Arengo Piragine / Gabino Tapia' } },
                 [fila('K-1', 'Hernán Lombardi, Gabino Tapia', 'Núñez', f30, '')]);
  correr(sc);
  ok(estado(sc, 'K-1') === 'no/conjunta_sin_fila' && idDe(sc, 'conj') === '', '(d) una conjunta de DOS contra una fila de TRES: no cruza (conjunta_sin_fila)');
  ok(lineaSC(sc, 'K-1', 'conjunta_sin_fila') !== null && /fila 2 \(Hernán Lombardi,/.test(lineaSC(sc, 'K-1', 'conjunta_sin_fila')[10]), '(d) …y sale en IDS_SIN_CRUZAR con esa fila como candidata');
  sc = escenario({ conj: { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f30, 'Conjunta con': 'Gabino Tapia' } }, [fila('K-1', C3, 'Núñez', f30, '')]);
  correr(sc);
  ok(estado(sc, 'K-1') === 'no/conjunta_sin_fila' && idDe(sc, 'conj') === '', '(d) y una de TRES contra una fila de DOS: tampoco');

  // (e) una figura que en la base aparece SÓLO en "Conjunta con": `_completarQuienIds_`
  sc = escenario({ conj: { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f30, 'Conjunta con': 'Gustavo Arengo Piragine / Gabino Tapia' } },
                 [fila('K-1', C3, 'Núñez', f30, '')], { relleno: ['Hernán Lombardi'] });
  correr(sc);
  igual(Array.from(item(sc, 'K-1').r.quien.norm), [LOM, ARE, TAP],
        '(e) Tapia y Arengo no tienen fila propia (sólo están en "Conjunta con"): se completan por el nombre entero');
  igual([estado(sc, 'K-1'), cruce(sc, 'K-1'), idDe(sc, 'conj')], ['escribe', [sc.n.conj, 'exacta', 'misma_fecha'], 'K-1'], '(e) …y la conjunta cruza (exacta)');
  // el apellido solo ("Lombardi-Tapia-Piragine") también las resuelve, si es único entre los nombres de la base
  sc = escenario({ conj: { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f30, 'Conjunta con': 'Gustavo Arengo Piragine / Gabino Tapia' } },
                 [fila('K-1', 'Lombardi-Tapia-Piragine', 'Núñez', f30, '')], { relleno: ['Hernán Lombardi'] });
  correr(sc);
  igual(Array.from(item(sc, 'K-1').r.quien.norm), [LOM, TAP, ARE],
        '(e) "Lombardi-Tapia-Piragine" con Tapia y Arengo sólo en "Conjunta con": las tres se reconocen (el apellido solo, si es único)');
  igual([estado(sc, 'K-1'), cruce(sc, 'K-1')], ['escribe', [sc.n.conj, 'exacta', 'misma_fecha']], '(e) …y cruza como conjunta EXACTA (no como "parcial")');
  // un apellido que lleva más de un nombre de la base no se elige
  sc = escenario({ conj: { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f30, 'Conjunta con': 'Gabino Tapia / Laura Tapia' } },
                 [fila('K-1', 'Lombardi-Tapia', 'Núñez', f30, '')], { relleno: ['Hernán Lombardi'] });
  correr(sc);
  ok(estado(sc, 'K-1') === 'no/funcionario_en_parte' && idDe(sc, 'conj') === '',
     '(e) "Tapia" solo, con dos Tapia en "Conjunta con" (Gabino y Laura): no se elige; una parte que no se reconoce frena el cruce');

  // (f) REGLA: en "Agenda funcionarios" una parte del Funcionario que no se reconoce ("Fulano De Tal": nadie de la base) frena el cruce:
  // puede ser una conjunta que no vemos, y el ID se escribe una vez y no se corrige. Se lista (`funcionario_en_parte`) con las filas
  // de esa figura cerca. "Agenda JM" (sólo Macri) no la mira.
  sc = escenario({ tap: { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f5 } }, [fila('K-1', 'Gabino Tapia, Fulano De Tal', 'Retiro', f5, '')]);
  correr(sc);
  igual([Array.from(item(sc, 'K-1').r.quien.noReconocidas), estado(sc, 'K-1'), idDe(sc, 'tap')], [['Fulano De Tal'], 'no/funcionario_en_parte', ''],
        '(f) "Gabino Tapia, Fulano De Tal" (Fulano no es de la base): no va a la fila de Gabino Tapia solo (funcionario_en_parte)');
  const lf = lineaSC(sc, 'K-1', 'funcionario_en_parte');
  ok(!!lf && /no se reconoce "Fulano De Tal" \(sí: Gabino Tapia\)/.test(lf[1]) && /fila 2 \(Gabino Tapia, 05\/10\/2026, Retiro, misma fecha\)/.test(lf[10]),
     '(f) …se lista en IDS_SIN_CRUZAR con lo que no se reconoce, lo que sí, y la fila de Gabino Tapia como candidata');
  igual(sc.res.conteo.noReconocido, 1, '    cuenta en "Funcionario no reconocido (o en parte)"');
  sc = escenario({ tap: { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f5 } }, [fila('K-1', 'Gabino Tapia, equipo', 'Retiro', f5, '')]);
  correr(sc);
  ok(estado(sc, 'K-1') === 'no/funcionario_en_parte', '(f) cualquier texto que no es una figura frena ("Gabino Tapia, equipo"): se lista, lo decide una persona');
  for (const t of ['Tapia, Gabino', 'Gabino Tapia (JM)', 'Dr. Gabino Tapia', 'G. Tapia']) {
    sc = escenario({ tap: { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f5 } }, [fila('K-1', t, 'Retiro', f5, '')]);
    correr(sc);
    igual([estado(sc, 'K-1'), idDe(sc, 'tap')], ['escribe', 'K-1'], '(f) "' + t + '" se reconoce entero (todas las partes explican a Gabino Tapia): cruza');
  }
  // "Agenda JM" no la mira: el mismo "…, Fulano De Tal" cruza con la fila de Macri
  const JM_FULANO = [['', '', '', '', '', 'Comunicación Directa - Mail'], ['ID', 'Funcionario', 'Barrio / Comuna', 'Tipo', 'Fecha', 'Fecha de envío'],
                     ['JM-1', 'Jorge Macri, Fulano De Tal', 'Belgrano', 'Encuentro con vecinos', f5, '']];
  sc = escenario({ tap: { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f5 }, mac: { Figura: 'Jorge Macri', Barrio: 'Belgrano', FECHA: f5 } },
                 [fila('K-1', 'Gabino Tapia, Fulano De Tal', 'Retiro', f5, '')], { jm: JM_FULANO });
  correr(sc);
  igual([estado(sc, 'JM-1'), idDe(sc, 'mac'), estado(sc, 'K-1'), idDe(sc, 'tap')], ['escribe', 'JM-1', 'no/funcionario_en_parte', ''],
        '(f) "Agenda JM" no mira lo que no se reconoce ("Jorge Macri, Fulano De Tal" cruza con Macri); "Agenda funcionarios", sí');

  // (g) REGLA: una conjunta también es 'exacta' contra el conjunto SIN los de "No participa" (la agenda los anota en "Conjunta con" igual)
  const conjNoP = { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f30, 'Conjunta con': 'Gustavo Arengo Piragine / Gabino Tapia', 'No participa': 'Gustavo Arengo Piragine' };
  [['sólo los que participan (Lombardi y Tapia)', 'Hernán Lombardi, Gabino Tapia'], ['los tres, con el que no participa', C3]].forEach(function (c) {
    sc = escenario({ conj: conjNoP }, [fila('K-1', c[1], 'Núñez', f30, '')]);
    correr(sc);
    igual([estado(sc, 'K-1'), cruce(sc, 'K-1'), idDe(sc, 'conj')], ['escribe', [sc.n.conj, 'exacta', 'misma_fecha'], 'K-1'], '(g) la fila tiene "No participa" Arengo; la lista dice ' + c[0] + ': cruza (exacta)');
  });
  sc = escenario({ conj: Object.assign({}, conjNoP, { 'No participa': '' }) }, [fila('K-1', 'Hernán Lombardi, Gabino Tapia', 'Núñez', f30, '')]);
  correr(sc);
  ok(estado(sc, 'K-1') === 'no/conjunta_sin_fila' && idDe(sc, 'conj') === '', '(g) …pero sin "No participa" en la fila, la lista de dos no es la de tres: no cruza');
  sc = escenario({ conj: { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f30, 'Conjunta con': 'Gabino Tapia', 'No participa': 'Gabino Tapia' } },
                 [fila('K-1', 'Hernán Lombardi', 'Núñez', f30, '')]);
  correr(sc);
  igual([estado(sc, 'K-1'), cruce(sc, 'K-1')], ['escribe', [sc.n.conj, 'exacta', 'misma_fecha']], '(g) fila de dos donde el segundo no participa: la lista con sólo el primero es exacta');
  sc = escenario({ conj: conjNoP }, [fila('K-1', 'Hernán Lombardi', 'Núñez', f30, '')]);
  correr(sc);
  igual([estado(sc, 'K-1'), cruce(sc, 'K-1')], ['escribe', [sc.n.conj, 'parcial', 'misma_fecha']], '(g) y con uno solo de los que participan (de tres, sin uno): sigue siendo una figura sola contra una conjunta (parcial)');
}

// ============================================================================================================================
console.log('[4] una figura sola: su fila propia y las conjuntas donde está');
{
  const conjLom = { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f30, 'Conjunta con': 'Gustavo Arengo Piragine / Gabino Tapia' };
  // la propia gana el mismo día ('exacta' antes que 'parcial')
  let sc = escenario({ conj: conjLom, propia: { Figura: 'Gabino Tapia', Barrio: 'Núñez', FECHA: f30 } }, [fila('T-1', 'Gabino Tapia', 'Núñez', f30, '')]);
  correr(sc);
  igual([cruce(sc, 'T-1'), idDe(sc, 'propia'), idDe(sc, 'conj')], [[sc.n.propia, 'exacta', 'misma_fecha'], 'T-1', ''],
        'Gabino Tapia, con su fila propia y una conjunta donde está el mismo día: gana la propia (exacta) y la conjunta queda sin ID');
  // sin fila propia: la conjunta, como "parcial"
  sc = escenario({ conj: conjLom }, [fila('T-1', 'Gabino Tapia', 'Núñez', f30, '')]);
  correr(sc);
  igual([estado(sc, 'T-1'), cruce(sc, 'T-1'), idDe(sc, 'conj')], ['escribe', [sc.n.conj, 'parcial', 'misma_fecha'], 'T-1'],
        'sin fila propia, Tapia cruza con la conjunta donde está (parcial)');
  ok(lineasRegistro(sc).some(function (r) { return /fila conjunta \(una de sus figuras\)/.test(r[11]); }), '    la traza lo dice: "fila conjunta (una de sus figuras)"');
  // REGLA: dos IDs para la misma fila (la base tiene un solo "ID cuentas" por fila): gana la misma fecha y, a igual nivel, la figura
  // exacta sobre la conjunta donde está; si empatan, fila_disputada.
  sc = escenario({ conj: conjLom }, [fila('K-1', C3, 'Núñez', f30, ''), fila('T-1', 'Gabino Tapia', 'Núñez', f30, '')]);
  correr(sc);
  igual([estado(sc, 'K-1'), estado(sc, 'T-1'), idDe(sc, 'conj')], ['escribe', 'no/fila_tomada', 'K-1'],
        'la conjunta (exacta) y Tapia solo (parcial) para la misma fila conjunta, la misma fecha: gana la conjunta; Tapia solo, fila_tomada');
  ok(/la fila 2 es del ID K-1 \(la misma fecha, la figura exacta\)/.test(lineaSC(sc, 'T-1', 'fila_tomada')[1]),
     '    el detalle dice quién se la quedó y por qué: "la misma fecha, la figura exacta"');
  sc = escenario({ conj: conjLom }, [fila('T-1', 'Gabino Tapia', 'Núñez', f30, ''), fila('A-1', 'Gustavo Arengo Piragine', 'Núñez', f30, '')]);
  correr(sc);
  igual([estado(sc, 'T-1'), estado(sc, 'A-1'), idDe(sc, 'conj')], ['no/fila_disputada', 'no/fila_disputada', ''],
        'dos figuras solas (las dos parciales) para la misma fila conjunta: empatan, fila_disputada');
  // DISCUTIBLE: la misma fecha pesa más que la figura exacta (el rango es fecha primero, figura después)
  sc = escenario({ conj: Object.assign({}, conjLom, { FECHA: D(29, 9) }) }, [fila('T-1', 'Gabino Tapia', 'Núñez', D(29, 9), ''), fila('K-1', C3, 'Núñez', f1, '')]);
  correr(sc);
  igual([estado(sc, 'T-1'), estado(sc, 'K-1'), idDe(sc, 'conj')], ['escribe', 'no/fila_tomada', 'T-1'],
        'DISCUTIBLE: Tapia solo de la misma fecha (parcial) le gana a la conjunta (exacta) a −2 días: pesa más la fecha que la figura');
  // con las dos de fecha distinta, la figura solo cruza si es exacta: la conjunta se queda la fila
  sc = escenario({ conj: Object.assign({}, conjLom, { FECHA: D(29, 9) }) }, [fila('T-1', 'Gabino Tapia', 'Núñez', f1, ''), fila('K-1', C3, 'Núñez', f2, '')]);
  correr(sc);
  igual([estado(sc, 'T-1'), estado(sc, 'K-1'), idDe(sc, 'conj')], ['no/fecha_distinta_conjunta', 'escribe', 'K-1'],
        'las dos de fecha distinta (−2 y −3): Tapia solo no cruza con una conjunta (fecha_distinta_conjunta) y la conjunta, sí');
  // otra conjunta donde está Tapia (otro lugar): no es suya
  sc = escenario({ conj: Object.assign({}, conjLom, { Barrio: 'Palermo' }) }, [fila('T-1', 'Gabino Tapia', 'Núñez', f30, '')]);
  correr(sc);
  ok(estado(sc, 'T-1') === 'no/lugar_distinto' && idDe(sc, 'conj') === '', 'la conjunta donde está, pero en otro lugar: lugar_distinto');
  // una figura sola nunca toma la fila de una conjunta en la que no está
  sc = escenario({ conj: { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f30, 'Conjunta con': 'Jorge Macri' } }, [fila('T-1', 'Gabino Tapia', 'Núñez', f30, '')]);
  correr(sc);
  ok(estado(sc, 'T-1') === 'no/sin_fila' && idDe(sc, 'conj') === '', 'una conjunta donde Tapia no está: no es suya');
  // misma fecha antes que fecha distinta: una conjunta el mismo día le gana a la propia a +2
  sc = escenario({ propia: { Figura: 'Gabino Tapia', Barrio: 'Núñez', FECHA: f2 }, conj: conjLom }, [fila('T-1', 'Gabino Tapia', 'Núñez', f30, '')]);
  correr(sc);
  igual(cruce(sc, 'T-1'), [sc.n.conj, 'parcial', 'misma_fecha'], 'la fecha exacta va primero: la conjunta del mismo día (parcial) le gana a la propia a +2 días');
  // en la fecha distinta no hay preferencia por la propia: dos filas a ±3 con el mismo lugar es ambiguo
  sc = escenario({ conj: Object.assign({}, conjLom, { FECHA: D(29, 9) }), propia: { Figura: 'Gabino Tapia', Barrio: 'Núñez', FECHA: f2 } },
                 [fila('T-1', 'Gabino Tapia', 'Núñez', f30, '')]);
  correr(sc);
  ok(estado(sc, 'T-1') === 'no/ambiguo' && Object.keys(escritos(sc)).length === 0,
     'sin fila ese día, su propia a +2 y una conjunta a −1 (las dos con el mismo lugar): ambiguo, no se escribe nada');
}

// ============================================================================================================================
console.log('[5] "Seguridad en tu barrio"');
{
  const otra = { Figura: 'Ana Pereyra', Barrio: 'Palermo', FECHA: f3 };    // otra reunión el mismo día: no es de Seguridad
  const variantes = ['Seguridad en tu barrio', 'SEGURIDAD EN TU BARRIO', 'Seguridad en tu Barrio'];
  const filasSeg = [
    ['"Evento (mail)" + "Lugar (mail)" Comuna 4', { Figura: '', Barrio: '', 'Evento (mail)': 'Seguridad en tu Barrio', 'Lugar (mail)': 'Comuna 4', FECHA: f3 }, 'Comuna 4'],
    ['EVENTO + barrio (Barracas, de la Comuna 4)', { Figura: '', Barrio: 'Barracas', EVENTO: 'Seguridad en tu Barrio', FECHA: f3 }, 'Comuna 4'],
    ['el formulario cruzado dice "sobre Seguridad"', { Figura: '', Barrio: '', 'Lugar (mail)': 'Comuna 4', FECHA: f3,
      form_origen: 'VÍNCULO CIUDADANO - Encuentro con vecinos sobre Seguridad - Comuna 4 - 3/10' }, 'Comuna 4'],
    ['EVENTO + barrio y la lista dice el barrio', { Figura: '', Barrio: 'Barracas', EVENTO: 'Seguridad en tu Barrio', FECHA: f3 }, 'Barracas']
  ];
  filasSeg.forEach(function (fs) {
    variantes.forEach(function (v) {
      const sc = escenario({ seg: fs[1], otra: otra }, [fila('S-1', v, fs[2], f3, '')]);
      correr(sc);
      igual([estado(sc, 'S-1'), cruce(sc, 'S-1'), idDe(sc, 'seg'), idDe(sc, 'otra')], ['escribe', [sc.n.seg, 'exacta', 'misma_fecha'], 'S-1', ''],
            fs[0] + ', lista "' + v + '": cruza con la fila de Seguridad y no con la otra reunión del día');
    });
  });
  // dos filas de Seguridad el mismo día en comunas distintas: gana la de la comuna de la lista (y cada ID, la suya)
  let sc = escenario({
    c4: { Figura: '', Barrio: '', EVENTO: 'Seguridad en tu Barrio', 'Lugar (mail)': 'Comuna 4', FECHA: f3 },
    c9: { Figura: '', Barrio: '', EVENTO: 'Seguridad en tu Barrio', 'Lugar (mail)': 'Comuna 9', FECHA: f3 }
  }, [fila('S-9', 'Seguridad en tu barrio', 'Comuna 9', f3, ''), fila('S-4', 'Seguridad en tu barrio', 'Comuna 4', f3, '')]);
  correr(sc);
  igual(escritos(sc), { c4: 'S-4', c9: 'S-9' }, 'dos filas de Seguridad el mismo día (Comuna 4 y Comuna 9): cada ID, a la de su comuna');
  // con una sola ID, la de la comuna que dice (la otra no se toca)
  sc = escenario({
    c4: { Figura: '', Barrio: '', EVENTO: 'Seguridad en tu Barrio', 'Lugar (mail)': 'Comuna 4', FECHA: f3 },
    c9: { Figura: '', Barrio: '', EVENTO: 'Seguridad en tu Barrio', 'Lugar (mail)': 'Comuna 9', FECHA: f3 }
  }, [fila('S-9', 'Seguridad en tu barrio', 'Comuna 9', f3, '')]);
  correr(sc);
  igual(escritos(sc), { c9: 'S-9' }, 'una sola ID, "Comuna 9": a la fila de la Comuna 9 (la de la Comuna 4 queda sin ID)');
  // dos filas de Seguridad en la misma comuna (una por barrio, otra por el mail): ambiguo
  sc = escenario({
    a: { Figura: '', Barrio: '', EVENTO: 'Seguridad en tu Barrio', 'Lugar (mail)': 'Comuna 4', FECHA: f3 },
    b: { Figura: '', Barrio: 'Barracas', EVENTO: 'Seguridad en tu Barrio', FECHA: f3 }
  }, [fila('S-4', 'Seguridad en tu barrio', 'Comuna 4', f3, '')]);
  correr(sc);
  ok(estado(sc, 'S-4') === 'no/ambiguo' && Object.keys(escritos(sc)).length === 0, 'dos filas de Seguridad en la misma comuna: ambiguo, no se escribe nada');
  // con el barrio en la lista, entre dos barrios de la misma comuna: el barrio decide
  sc = escenario({
    a: { Figura: '', Barrio: 'Barracas', EVENTO: 'Seguridad en tu Barrio', FECHA: f3 },
    b: { Figura: '', Barrio: 'La Boca', EVENTO: 'Seguridad en tu Barrio', FECHA: f3 }
  }, [fila('S-1', 'Seguridad en tu barrio', 'La Boca', f3, '')]);
  correr(sc);
  igual(escritos(sc), { b: 'S-1' }, 'dos de la Comuna 4 (Barracas y La Boca) y la lista dice "La Boca": barrio con barrio');
  // una fila que NO es de Seguridad no la toma
  sc = escenario({ otra: otra, t: { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f3 } }, [fila('S-1', 'Seguridad en tu barrio', 'Comuna 14', f3, '')]);
  correr(sc);
  ok(estado(sc, 'S-1') === 'no/sin_fila' && Object.keys(escritos(sc)).length === 0,
     'Seguridad, Comuna 14, y ninguna fila de Seguridad (sólo otras reuniones de Palermo, Comuna 14, ese día): no toma ninguna');
  // y al revés: una figura sola no toma la fila de Seguridad que no tiene figura
  sc = escenario({ seg: { Figura: '', Barrio: 'Retiro', EVENTO: 'Seguridad en tu Barrio', FECHA: f3 } }, [fila('T-1', 'Gabino Tapia', 'Retiro', f3, '')]);
  correr(sc);
  ok(estado(sc, 'T-1') === 'no/sin_fila' && idDe(sc, 'seg') === '', 'una figura sola (Tapia) no toma una fila de Seguridad sin figura');
  // REGLA: Seguridad exige el lugar. "Las filas de Seguridad de ESA comuna y fecha": el mismo día, el lugar tiene que COINCIDIR; no
  // alcanza con que no se pueda comparar. Sin un lugar que coincida, sin_fila con el motivo `seguridad_sin_lugar` (o lugar_distinto si
  // todas las filas de ese día son de otra comuna).
  const segLugar = function (lugarMail, extra) { return Object.assign({ Figura: '', Barrio: '', EVENTO: 'Seguridad en tu Barrio', 'Lugar (mail)': lugarMail, FECHA: f3 }, extra || {}); };
  // la lista no dice el lugar y hay UNA sola fila de Seguridad ese día
  sc = escenario({ seg: segLugar('Comuna 9') }, [fila('S-1', 'Seguridad en tu barrio', '', f3, '')]);
  correr(sc);
  igual([estado(sc, 'S-1'), idDe(sc, 'seg')], ['no/seguridad_sin_lugar', ''], 'sin lugar en la lista y UNA sola fila de Seguridad ese día: NO cruza (seguridad_sin_lugar)');
  const ls = lineaSC(sc, 'S-1', 'seguridad_sin_lugar');
  ok(!!ls && /Seguridad exige la misma comuna/.test(ls[1]) && /fila 2 \(Seguridad, sin figura, 03\/10\/2026, sin barrio, misma fecha, lugar no comparable\)/.test(ls[10]),
     '    …se lista, el detalle dice que Seguridad exige la misma comuna y la fila de ese día aparece como candidata');
  // un texto que la lista dice y no se reconoce: tampoco se puede comparar
  sc = escenario({ seg: segLugar('Comuna 4') }, [fila('S-1', 'Seguridad en tu barrio', 'Salón Auditorio Central', f3, '')]);
  correr(sc);
  igual([estado(sc, 'S-1'), idDe(sc, 'seg')], ['no/seguridad_sin_lugar', ''], 'un lugar de la lista que no se reconoce ("Salón Auditorio Central"): NO cruza (seguridad_sin_lugar)');
  // la fila no tiene lugar (sin barrio ni "Lugar (mail)") y la lista dice la comuna
  sc = escenario({ seg: { Figura: '', Barrio: '', EVENTO: 'Seguridad en tu Barrio', FECHA: f3 } }, [fila('S-1', 'Seguridad en tu barrio', 'Comuna 4', f3, '')]);
  correr(sc);
  igual([estado(sc, 'S-1'), idDe(sc, 'seg')], ['no/seguridad_sin_lugar', ''], 'la fila de Seguridad no tiene lugar (sin barrio ni "Lugar (mail)") y la lista dice Comuna 4: NO cruza');
  // todas las filas de ese día son de otra comuna: lugar_distinto
  sc = escenario({ seg: segLugar('Comuna 9') }, [fila('S-1', 'Seguridad en tu barrio', 'Comuna 4', f3, '')]);
  correr(sc);
  igual([estado(sc, 'S-1'), idDe(sc, 'seg')], ['no/lugar_distinto', ''], 'la única fila de Seguridad de ese día es de la Comuna 9 y la lista dice la 4: lugar_distinto');
  // una fila sin lugar y otra que coincide: la que coincide
  sc = escenario({ sin: { Figura: '', Barrio: '', EVENTO: 'Seguridad en tu Barrio', FECHA: f3 }, c4: segLugar('Comuna 4') }, [fila('S-1', 'Seguridad en tu barrio', 'Comuna 4', f3, '')]);
  correr(sc);
  igual(escritos(sc), { c4: 'S-1' }, 'dos filas de Seguridad ese día, una sin lugar y otra de la Comuna 4: la de la Comuna 4 (la que no tiene lugar no cuenta)');
  // una fila sin lugar y otra de OTRA comuna: ninguna coincide
  sc = escenario({ sin: { Figura: '', Barrio: '', EVENTO: 'Seguridad en tu Barrio', FECHA: f3 }, c9: segLugar('Comuna 9') }, [fila('S-1', 'Seguridad en tu barrio', 'Comuna 4', f3, '')]);
  correr(sc);
  igual([estado(sc, 'S-1'), Object.keys(escritos(sc)).length], ['no/seguridad_sin_lugar', 0], 'una sin lugar y otra de la Comuna 9, y la lista dice la 4: ninguna coincide (seguridad_sin_lugar)');
  // con el barrio de la fila y el de la lista
  sc = escenario({ seg: { Figura: '', Barrio: 'Barracas', EVENTO: 'Seguridad en tu Barrio', FECHA: f3 } }, [fila('S-1', 'Seguridad en tu barrio', 'Barracas', f3, '')]);
  correr(sc);
  igual(idDe(sc, 'seg'), 'S-1', 'barrio con barrio (Barracas): coincide, cruza');
  // la fecha distinta también vale para Seguridad: ±3 días con la comuna que coincide y UNA sola fila
  sc = escenario({
    c4: { Figura: '', Barrio: '', EVENTO: 'Seguridad en tu Barrio', 'Lugar (mail)': 'Comuna 4', FECHA: f1 },
    c9: { Figura: '', Barrio: '', EVENTO: 'Seguridad en tu Barrio', 'Lugar (mail)': 'Comuna 9', FECHA: f2 }
  }, [fila('S-4', 'Seguridad en tu barrio', 'Comuna 4', f3, '')]);
  correr(sc);
  igual([estado(sc, 'S-4'), cruce(sc, 'S-4')], ['escribe', [sc.n.c4, 'exacta', 'fecha_distinta']], 'Seguridad con la fecha corrida (−2 días) y la misma comuna: cruza (fecha distinta); la de la otra comuna, no');
  sc = escenario({ seg: { Figura: '', Barrio: '', EVENTO: 'Seguridad en tu Barrio', FECHA: f1 } }, [fila('S-4', 'Seguridad en tu barrio', 'Comuna 4', f3, '')]);
  correr(sc);
  igual([estado(sc, 'S-4'), idDe(sc, 'seg')], ['no/fecha_distinta_sin_lugar', ''], 'Seguridad con la fecha corrida (−2 días) y una fila sin lugar: no se puede comparar, no cruza (fecha_distinta_sin_lugar)');
  // una fila de Seguridad que ya tiene Figura (se la completó RDV CONJUNTO): la ID de Seguridad cruza; la de la figura se la disputa
  sc = escenario({ seg: { Figura: 'Gabino Tapia', Barrio: 'Núñez', EVENTO: 'Seguridad en tu Barrio', FECHA: f3 } }, [fila('S-1', 'Seguridad en tu barrio', 'Comuna 13', f3, '')]);
  correr(sc);
  igual(idDe(sc, 'seg'), 'S-1', 'una fila de Seguridad con la figura ya completada sigue siendo de Seguridad: la ID de "Seguridad en tu barrio" cruza');
  sc = escenario({ seg: { Figura: 'Gabino Tapia', Barrio: 'Núñez', EVENTO: 'Seguridad en tu Barrio', FECHA: f3 } },
                 [fila('S-1', 'Seguridad en tu barrio', 'Comuna 13', f3, ''), fila('T-1', 'Gabino Tapia', 'Núñez', f3, '')]);
  correr(sc);
  ok(estado(sc, 'S-1') === 'no/fila_disputada' && estado(sc, 'T-1') === 'no/fila_disputada' && idDe(sc, 'seg') === '',
     '…pero si la lista tiene también un ID de Gabino Tapia para esa fila, se la disputan: ninguno se escribe');
}

// ============================================================================================================================
console.log('[6] Comuna 1 Norte / Sur');
{
  // Norte = Puerto Madero, Retiro, San Nicolás; Sur = Constitución, Monserrat, San Telmo. Dos filas de Seguridad el mismo día.
  const dos = function () {
    return { ret: { Figura: '', Barrio: 'Retiro', EVENTO: 'Seguridad en tu Barrio', FECHA: f3 },
             mon: { Figura: '', Barrio: 'Monserrat', EVENTO: 'Seguridad en tu Barrio', FECHA: f3 } };
  };
  [['Comuna 1 Sur', 'mon'], ['C1S', 'mon'], ['Comuna 1 sur', 'mon'], ['Comuna 01 Sur', 'mon'], ['Comuna 1 Norte', 'ret'], ['C1N', 'ret'], ['Comuna 1 N', 'ret'],
   ['Retiro', 'ret'], ['Monserrat', 'mon'], ['Montserrat', 'mon']].forEach(function (c) {
    const sc = escenario(dos(), [fila('S-1', 'Seguridad en tu barrio', c[0], f3, '')]);
    correr(sc);
    const esperado = {}; esperado[c[1]] = 'S-1';
    igual(escritos(sc), esperado, 'lista "' + c[0] + '" contra Retiro (Norte) y Monserrat (Sur): va a ' + (c[1] === 'mon' ? 'Monserrat' : 'Retiro'));
  });
  let sc = escenario(dos(), [fila('S-1', 'Seguridad en tu barrio', 'Comuna 1', f3, '')]);
  correr(sc);
  ok(estado(sc, 'S-1') === 'no/ambiguo' && Object.keys(escritos(sc)).length === 0, '"Comuna 1" a secas (sin subzona) contra Retiro y Monserrat: ambiguo');
  // una figura con una sola fila en una subzona
  [['Retiro', 'Comuna 1 Sur', false], ['Retiro', 'C1N', true], ['Retiro', 'Comuna 1 Norte', true], ['Puerto Madero', 'Comuna 1 Norte', true],
   ['San Nicolás', 'Comuna 1 Sur', false], ['Monserrat', 'Comuna 1 Sur', true], ['Monserrat', 'C1N', false], ['San Telmo', 'Comuna 1 Sur', true],
   ['Constitución', 'Comuna 1 Norte', false], ['Constitución', 'Comuna 1', true]].forEach(function (c) {
    sc = escenario({ t: { Figura: 'Gabino Tapia', Barrio: c[0], FECHA: f3 } }, [fila('T-1', 'Gabino Tapia', c[1], f3, '')]);
    correr(sc);
    igual([estado(sc, 'T-1'), idDe(sc, 't')], c[2] ? ['escribe', 'T-1'] : ['no/lugar_distinto', ''],
          'Tapia en ' + c[0] + ', la lista dice "' + c[1] + '": ' + (c[2] ? 'cruza' : 'otra subzona: lugar_distinto, no se escribe'));
  });
  // una fila sin barrio: la subzona que dice "Lugar (mail)"
  sc = escenario({ t: { Figura: 'Gabino Tapia', Barrio: '', 'Lugar (mail)': 'Comuna 1 Sur', FECHA: f3 } }, [fila('T-1', 'Gabino Tapia', 'Constitución', f3, '')]);
  correr(sc);
  igual(idDe(sc, 't'), 'T-1', 'fila sin barrio con "Lugar (mail)" Comuna 1 Sur, la lista dice Constitución (Sur): cruza');
  sc = escenario({ t: { Figura: 'Gabino Tapia', Barrio: '', 'Lugar (mail)': 'Comuna 1 Norte', FECHA: f3 } }, [fila('T-1', 'Gabino Tapia', 'San Telmo', f3, '')]);
  correr(sc);
  ok(estado(sc, 'T-1') === 'no/lugar_distinto' && idDe(sc, 't') === '', 'fila sin barrio con "Lugar (mail)" Comuna 1 Norte, la lista dice San Telmo (Sur): lugar_distinto');
}

// ============================================================================================================================
console.log('[7] el lugar de la lista: barrio, comuna, eje, vacío y lo que no se reconoce');
{
  // [lista dice, la fila (Barrio, Lugar (mail)), ¿cruza?]
  const casos = [
    ['Belgrano', ['Belgrano', ''], true, 'barrio con barrio, el mismo'],
    ['Belgrano (Comuna 13)', ['Belgrano', ''], true, '"Barrio (Comuna N)": se reconoce el barrio'],
    ['belgrano', ['Belgrano', ''], true, 'minúsculas'],
    ['Villa Gral. Mitre', ['Villa General Mitre', ''], true, 'otra grafía del barrio (Villa Gral. Mitre)'],
    ['Palermo', ['Villa Crespo', ''], false, 'barrio con barrio, otro: lugar_distinto'],
    ['Comuna 13', ['Belgrano', ''], true, 'comuna con el barrio de esa comuna'],
    ['Comuna 14', ['Belgrano', ''], false, 'comuna con un barrio de otra comuna'],
    ['C13', ['Belgrano', ''], true, '"C13"'],
    ['Comuna 13', ['', 'Comuna 13'], true, 'comuna con comuna (fila sin barrio, "Lugar (mail)")'],
    ['Comuna 13', ['', 'Comuna 12'], false, 'comuna con otra comuna'],
    ['Belgrano', ['', 'Comuna 13'], true, 'la lista dice el barrio y la fila sólo la comuna: se compara la comuna'],
    ['Belgrano', ['', 'Comuna 12'], false, '…y si la comuna de la fila es otra, no'],
    ['Eje Norte', ['', 'Eje Norte'], true, 'eje con el eje del mail'],
    ['Eje Sur', ['', 'Eje Norte'], false, 'eje con otro eje'],
    ['Eje Sur', ['Belgrano', ''], true, 'el eje de la lista contra una fila con barrio y sin eje del mail: no se puede comparar (nunca se deduce del barrio): cruza'],
    ['', ['Belgrano', ''], true, 'sin lugar en la lista (una sola fila): no se puede comparar, cruza'],
    ['-', ['Belgrano', ''], true, '"-" en el lugar: como vacío'],
    ['Salón Auditorio Central', ['Belgrano', ''], true, 'un texto que no se reconoce NO es un barrio: no descarta'],
    ['Belgrano', ['', ''], true, 'la fila sin barrio ni lugar: no se puede comparar'],
    ['Comuna 16', ['Belgrano', ''], true, '"Comuna 16" no existe: no se reconoce, no descarta']
  ];
  casos.forEach(function (c) {
    const sc = escenario({ t: { Figura: 'Gabino Tapia', Barrio: c[1][0], 'Lugar (mail)': c[1][1], FECHA: f3 } }, [fila('T-1', 'Gabino Tapia', c[0], f3, '')]);
    correr(sc);
    igual([estado(sc, 'T-1'), idDe(sc, 't')], c[2] ? ['escribe', 'T-1'] : ['no/lugar_distinto', ''], 'lista "' + c[0] + '" contra ' + JSON.stringify(c[1]) + ': ' + c[3]);
  });
  // con dos filas de la figura el mismo día, el lugar de la lista desempata
  const sc = escenario({ a: { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f3 }, b: { Figura: 'Gabino Tapia', Barrio: 'Flores', FECHA: f3 } },
                       [fila('T-1', 'Gabino Tapia', 'Flores', f3, '')]);
  correr(sc);
  igual(escritos(sc), { b: 'T-1' }, 'dos filas de la figura el mismo día (Retiro y Flores) y la lista dice Flores: la de Flores');
  const sc2 = escenario({ a: { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f3 }, b: { Figura: 'Gabino Tapia', Barrio: 'Flores', FECHA: f3 } },
                        [fila('T-1', 'Gabino Tapia', '', f3, '')]);
  correr(sc2);
  ok(estado(sc2, 'T-1') === 'no/ambiguo' && Object.keys(escritos(sc2)).length === 0, '…y sin lugar en la lista (no hay cómo elegir): ambiguo, no se escribe');
}

// ============================================================================================================================
console.log('[8] la fecha distinta (±3 días): figura y lugar coinciden y UNA sola fila');
{
  const T = function (fecha_, barrio) { return { Figura: 'Gabino Tapia', Barrio: barrio === undefined ? 'Retiro' : barrio, FECHA: fecha_ }; };
  const caso = function (titulo, specs, fun, esperado, extra) {
    const sc = escenario(specs, fun);
    correr(sc);
    igual(estado(sc, fun[0][0]), esperado, titulo);
    if (extra) extra(sc);
    return sc;
  };
  let sc = caso('−3 días (la fila es del 02/10 y la lista dice el 05/10): cruza por fecha distinta', { t: T(f2) }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')], 'escribe');
  igual(cruce(sc, 'X-1'), [sc.n.t, 'exacta', 'fecha_distinta'], '    …con nivel fecha_distinta');
  ok(lineasRegistro(sc).some(function (r) { return /fecha distinta \(−3 días: la lista dice 05\/10\/2026\)/.test(r[11]); }), '    la traza dice "fecha distinta (−3 días: la lista dice 05/10/2026)"');
  caso('+3 días (la fila es del 05/10 y la lista dice el 02/10): cruza', { t: T(f5) }, [fila('X-1', 'Gabino Tapia', 'Retiro', f2, '')], 'escribe');
  // la fila de HOY (08/10) a +3 de la lista: cruza, pero el ID se escribe recién cuando la reunión pasó (segunda revisión)
  caso('+3 días con la fila de HOY (08/10): cruza y espera (reunion_futura, no se lista)', { t: T(D(8, 10)) }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')],
       'fuera/reunion_futura', function (s) {
         igual([cruce(s, 'X-1')[2], lineaSC(s, 'X-1'), idDe(s, 't')], ['fecha_distinta', null, ''], '    …por fecha distinta, sin línea en IDS_SIN_CRUZAR y sin escribir');
       });
  caso('4 días: no cruza (sin_fila)', { t: T(f1) }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')], 'no/sin_fila', function (s) {
    ok(/fila 2 \(Gabino Tapia, 01\/10\/2026, Retiro, −4 días\)/.test(lineaSC(s, 'X-1')[10]), '    y la fila a 4 días aparece como candidata en IDS_SIN_CRUZAR');
  });
  caso('±2 con el lugar vacío en la lista: no se puede comparar → fecha_distinta_sin_lugar', { t: T(f3) }, [fila('X-1', 'Gabino Tapia', '', f5, '')], 'no/fecha_distinta_sin_lugar');
  caso('±2 y la fila en otro lugar: sin_fila', { t: T(f3, 'Flores') }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')], 'no/sin_fila');
  caso('el mismo día pero en otro lugar: lugar_distinto', { t: T(f5, 'Flores') }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')], 'no/lugar_distinto');
  caso('el mismo día en otro lugar y a ±2 en el lugar de la lista: cruza con la de ±2 (la de otro lugar no cuenta)',
       { otro: T(f5, 'Flores'), cerca: T(f3, 'Retiro') }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')], 'escribe', function (s) {
         igual(cruce(s, 'X-1'), [s.n.cerca, 'exacta', 'fecha_distinta'], '    …la de Retiro');
       });
  caso('dos filas a ±2 con el mismo lugar: ambiguo (no se elige)', { a: T(f3), b: T(f7) }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')], 'no/ambiguo', function (s) {
    ok(Object.keys(escritos(s)).length === 0, '    y no se escribe nada');
  });
  caso('la fecha exacta va antes: con una fila el mismo día, la de ±2 no se mira', { a: T(f5), b: T(f3) }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')], 'escribe',
       function (s) { igual(cruce(s, 'X-1'), [s.n.a, 'exacta', 'misma_fecha'], '    …la del mismo día'); });
  caso('futura, sin fila: futura_sin_fila (todavía no hay fila: la agenda la crea cuando llega el mail)', { t: T(f3) }, [fila('X-1', 'Gabino Tapia', 'Retiro', D(20, 10), '')],
       'no/futura_sin_fila', function (s) { ok(lineaSC(s, 'X-1') === null, '    y no va a IDS_SIN_CRUZAR'); });
  caso('pasada, sin fila: sin_fila, y va a IDS_SIN_CRUZAR', { t: T(f3) }, [fila('X-1', 'Gabino Tapia', 'Retiro', D(25, 8), '')], 'no/sin_fila',
       function (s) { ok(lineaSC(s, 'X-1', 'sin_fila') !== null, '    sale en IDS_SIN_CRUZAR (motivo sin_fila)'); });
  caso('un Funcionario que no es de la base: funcionario_no_reconocido', { t: T(f3) }, [fila('X-1', 'Fulano De Tal', 'Retiro', f3, '')], 'no/funcionario_no_reconocido');
  caso('en "Agenda funcionarios" un Funcionario vacío NO es Macri (eso es sólo de "Agenda JM")', { t: T(f3) }, [fila('X-1', '', 'Retiro', f3, '')], 'no/funcionario_no_reconocido');
  caso('sin fecha en la lista: sin_fecha', { t: T(f3) }, [fila('X-1', 'Gabino Tapia', 'Retiro', '', '')], 'no/sin_fecha');
  caso('con la fecha como texto (dd/MM/aaaa) y como número de serie de Sheets', { t: T(f5) }, [fila('X-1', 'Gabino Tapia', 'Retiro', '05/10/2026', '')], 'escribe');
  const serie = Math.round((Date.UTC(2026, 9, 5) - Date.UTC(1899, 11, 30)) / 86400000);
  caso('…número de serie (' + serie + ')', { t: T(f5) }, [fila('X-1', 'Gabino Tapia', 'Retiro', serie, '')], 'escribe');
  caso('…y el texto con hora ("05/10/2026 19:00"): se toma el día', { t: T(f5) }, [fila('X-1', 'Gabino Tapia', 'Retiro', '05/10/2026 19:00', '')], 'escribe');
  // dos registros con la fecha corrida hacia la misma fila: el de la misma fecha gana (ver [10]); acá, que cada uno encuentra la suya
  sc = escenario({ a: T(f2), b: T(f5) }, [fila('X-1', 'Gabino Tapia', 'Retiro', f2, ''), fila('X-2', 'Gabino Tapia', 'Retiro', f5, '')]);
  correr(sc);
  igual(escritos(sc), { a: 'X-1', b: 'X-2' }, 'dos IDs de la misma figura, cada uno en su fecha (02/10 y 05/10): cada uno a la suya (a 3 días entre sí, no se confunden)');

  // REGLA: las filas POSIBLES son las de 1 a 3 días que el lugar NO descarta (coincide o no se puede comparar). La fecha distinta cruza
  // sólo si hay UNA posible y en ésa la figura es exacta y el lugar coincide. Con 2+ posibles y alguna fuerte (exacta y con el lugar que
  // coincide): ambiguo. Si la única fuerte es una conjunta donde está (parcial): fecha_distinta_conjunta.
  const CJ = function (fecha_) { return { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: fecha_, 'Conjunta con': 'Gustavo Arengo Piragine / Gabino Tapia' }; };
  caso('una fuerte (−3, Retiro) y otra a +2 con el lugar que no se puede comparar (sin barrio): dos posibles → ambiguo', { a: T(f2), b: T(f7, '') },
       [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')], 'no/ambiguo', function (s) {
         ok(/2 filas posibles a ±3 días/.test(lineaSC(s, 'X-1', 'ambiguo')[1]) && Object.keys(escritos(s)).length === 0, '    el detalle dice cuántas posibles y no se escribe nada');
       });
  caso('una fuerte (−3, Retiro) y otra a +2 de otro lugar (la descarta el lugar): una sola posible → cruza', { a: T(f2), b: T(f7, 'Flores') },
       [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')], 'escribe', function (s) { igual(cruce(s, 'X-1'), [s.n.a, 'exacta', 'fecha_distinta'], '    …la de Retiro'); });
  caso('sólo una conjunta donde está (parcial) a −2, con el lugar que coincide: no alcanza → fecha_distinta_conjunta', { cj: CJ(f3) },
       [fila('X-1', 'Gabino Tapia', 'Núñez', f5, '')], 'no/fecha_distinta_conjunta', function (s) {
         ok(/fila 2 \(Hernán Lombardi, 03\/10\/2026, Núñez, −2 días, conjunta donde está\)/.test(lineaSC(s, 'X-1', 'fecha_distinta_conjunta')[10]) && idDe(s, 'cj') === '',
            '    se lista con la conjunta como candidata ("conjunta donde está") y no se escribe');
       });
  caso('una fuerte (su propia, −3) y una conjunta donde está (parcial, +2), las dos con el lugar: dos posibles → ambiguo', { a: T(f2, 'Núñez'), cj: CJ(f7) },
       [fila('X-1', 'Gabino Tapia', 'Núñez', f5, '')], 'no/ambiguo');
  // REGLA: la fecha distinta sólo cuando la fecha planeada YA PASÓ. Si es hoy o futura, se espera la fila de ese día (futura_sin_fila).
  // hoy = 08/10/2026: ayer (07/10) sí; hoy (08/10) y mañana (09/10), no.
  caso('la fecha planeada es AYER (07/10) y hay una fila a −2 (05/10): cruza por fecha distinta', { t: T(f5) }, [fila('X-1', 'Gabino Tapia', 'Retiro', f7, '')], 'escribe');
  sc = caso('la fecha planeada es HOY (08/10) y hay una fila a −2 (06/10): NO se usa la fecha distinta, se espera la fila de hoy (futura_sin_fila)', { t: T(D(6, 10)) },
            [fila('X-1', 'Gabino Tapia', 'Retiro', D(8, 10), '')], 'no/futura_sin_fila', function (s) {
              ok(lineaSC(s, 'X-1') === null && s.res.conteo.futuraSinFila === 1 && /se espera la fila de ese día/.test(item(s, 'X-1').final.detalle),
                 '    no va a IDS_SIN_CRUZAR, cuenta en "futuras" y el detalle dice que se espera la fila de ese día');
            });
  caso('la fecha planeada es futura (10/10) y hay una fila a −2 (08/10): futura_sin_fila', { t: T(D(8, 10)) }, [fila('X-1', 'Gabino Tapia', 'Retiro', D(10, 10), '')], 'no/futura_sin_fila');
  caso('mañana (09/10) sin ninguna fila: futura_sin_fila (todavía no hay fila), no se lista', { t: T(f3) }, [fila('X-1', 'Gabino Tapia', 'Retiro', D(9, 10), '')], 'no/futura_sin_fila',
       function (s) { ok(lineaSC(s, 'X-1') === null, '    y no va a IDS_SIN_CRUZAR'); });
  // DISCUTIBLE: la fecha planeada de HOY, sin ninguna fila ni cerca, se lista (sin_fila); con una fila a ±3 días es futura_sin_fila (arriba), y mañana, también
  caso('hoy (08/10) sin ninguna fila: sin_fila (se lista: la fila de hoy ya tendría que estar)', { t: T(f3) }, [fila('X-1', 'Gabino Tapia', 'Retiro', D(8, 10), '')], 'no/sin_fila',
       function (s) { ok(lineaSC(s, 'X-1', 'sin_fila') !== null, '    y va a IDS_SIN_CRUZAR'); });
  // REGLA: el mismo día, si TODAS las filas de ese día tienen el lugar sin comparar y a ±3 hay una de la figura con el lugar exacto: ambiguo
  // (puede ser la del día con el barrio todavía sin cargar, o un duplicado de la fecha vieja).
  caso('el mismo día una fila sin barrio (lugar sin comparar) y a −2 otra de Retiro: ambiguo', { dia: T(f5, ''), cerca: T(f3) }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')], 'no/ambiguo',
       function (s) {
         ok(/1 fila\(s\) el mismo día sin lugar comparable y 1 a ±3 días con el mismo lugar/.test(lineaSC(s, 'X-1', 'ambiguo')[1]) && Object.keys(escritos(s)).length === 0,
            '    el detalle lo explica y no se escribe nada');
       });
  caso('…si la fila del día tiene el lugar que coincide, es ésa (la de −2 no se mira)', { dia: T(f5), cerca: T(f3) }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')], 'escribe',
       function (s) { igual(cruce(s, 'X-1'), [s.n.dia, 'exacta', 'misma_fecha'], '    …la del día'); });
  caso('…si la de −2 es de otro lugar, es la del día (sin barrio: no se puede comparar)', { dia: T(f5, ''), cerca: T(f3, 'Flores') }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')], 'escribe',
       function (s) { igual(cruce(s, 'X-1'), [s.n.dia, 'exacta', 'misma_fecha'], '    …la del día'); });
  caso('…si la de −2 tampoco tiene lugar que comparar, es la del día', { dia: T(f5, ''), cerca: T(f3, '') }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')], 'escribe',
       function (s) { igual(cruce(s, 'X-1'), [s.n.dia, 'exacta', 'misma_fecha'], '    …la del día'); });
  caso('…si la lista no dice el lugar, nada es "exacto": es la del día', { dia: T(f5, ''), cerca: T(f3) }, [fila('X-1', 'Gabino Tapia', '', f5, '')], 'escribe',
       function (s) { igual(cruce(s, 'X-1'), [s.n.dia, 'exacta', 'misma_fecha'], '    …la del día'); });
  caso('…si lo de −2 es una conjunta donde está (parcial), no es "figura exacta": es la del día', { dia: T(f5, ''), cj: CJ(f3) }, [fila('X-1', 'Gabino Tapia', 'Núñez', f5, '')], 'escribe',
       function (s) { igual(cruce(s, 'X-1'), [s.n.dia, 'exacta', 'misma_fecha'], '    …la del día'); });
  caso('…y con dos filas del día (una sin lugar y una que coincide) y otra a −2: la del día que coincide', { sin: T(f5, ''), dia: T(f5), cerca: T(f3) }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')], 'escribe',
       function (s) { igual(cruce(s, 'X-1'), [s.n.dia, 'exacta', 'misma_fecha'], '    …la del día que coincide'); });
}

// ============================================================================================================================
console.log('[9] la Fecha de envío');
{
  const serie = Math.round((Date.UTC(2026, 8, 25) - Date.UTC(1899, 11, 30)) / 86400000);   // 25/09/2026
  // un registro por caso, cada uno con SU fila (una figura distinta y todas el 30/09/2026); [nombre, lo que trae la celda, ¿se escribe?, estado]
  const casos = [
    ['una fecha', D(25, 9), '25/09/2026', 'ok'],
    ['"#N/A"', '#N/A', '', 'error'],
    ['"#REF!"', '#REF!', '', 'error'],
    ['"#VALUE!"', '#VALUE!', '', 'error'],
    ['"-"', '-', '', 'guion'],
    ['"—" (raya larga)', '—', '', 'guion'],
    ['"–" (raya media)', '–', '', 'guion'],
    ['texto "25/9/26"', '25/9/26', '25/09/2026', 'ok'],
    ['texto "25/09/2026"', '25/09/2026', '25/09/2026', 'ok'],
    ['número de serie de Sheets', serie, '25/09/2026', 'ok'],
    ['un Date de 2025 para un encuentro de 2026', D(25, 9, 2025), '', 'anio'],
    ['un Date de 2062', D(25, 9, 2062), '', 'anio'],
    ['texto "25/9/62" (el 62 se lee 2062)', '25/9/62', '', 'anio'],
    ['vacía', '', '', 'vacia'],
    ['sólo espacios', '   ', '', 'vacia'],
    ['un texto que no es fecha', 'a confirmar', '', 'invalida'],
    ['un número que no es una serie', 3735, '', 'invalida'],
    ['texto con hora "25/09/2026 10:30"', '25/09/2026 10:30', '25/09/2026', 'ok'],
    ['texto con hora y hs "25/9/26 19:00 hs"', '25/9/26 19:00 hs', '25/09/2026', 'ok']
  ];
  const specs = {};
  casos.forEach(function (c, i) { specs['c' + i] = { Figura: 'Figura ' + String.fromCharCode(65 + i) + ' Nombre', Barrio: 'Retiro', FECHA: f30 }; });
  const sc = escenario(specs, casos.map(function (c, i) { return fila('E-' + i, 'Figura ' + String.fromCharCode(65 + i) + ' Nombre', 'Retiro', f30, c[1]); }));
  correr(sc);
  const base = sc.E.base(), iEnv = base.valores[0].indexOf('Fecha envío campañas');
  casos.forEach(function (c, i) {
    const it = item(sc, 'E-' + i);
    igual([estado(sc, 'E-' + i), it.r.envio.estado, envioDe(sc, 'c' + i), idDe(sc, 'c' + i)], ['escribe', c[3], c[2], 'E-' + i],
          'Fecha de envío ' + c[0] + ': ' + (c[2] ? 'se escribe ' + c[2] : 'queda vacía (' + c[3] + ')') + ' y el ID se escribe igual');
  });
  let formatoBien = true, colorBien = true;
  casos.forEach(function (c, i) {
    const k = (i + 2) + ':' + (iEnv + 1);
    if (!!c[2] !== (base.formatos[k] === 'dd/MM/yyyy')) formatoBien = false;
    if (!!c[2] !== (base.fondos[k] === '#CFE2F3')) colorBien = false;
  });
  ok(formatoBien, 'el formato dd/MM/yyyy está sólo en las celdas de fecha de envío que se escribieron');
  ok(colorBien, 'el fondo #CFE2F3 está sólo en esas celdas (en las que quedaron vacías, no)');
  ok(casos.every(function (c, i) { return base.fondos[(i + 2) + ':' + (base.valores[0].indexOf('ID cuentas') + 1)] === '#CFE2F3'; }), 'y el ID, siempre con el fondo #CFE2F3');
  igual(casos.map(function (c, i) { return fecha(base.valores[i + 1][iEnv]) || (base.valores[i + 1][iEnv] === '' ? '' : 'otra cosa'); }).filter(function (x) { return x === 'otra cosa'; }), [],
        'ninguna celda de fecha de envío trae otra cosa que una fecha o nada (nunca "#N/A", "-" ni el señuelo de las otras "Fecha de envío")');
  // IDS_SIN_CRUZAR: sólo las de año que no cierra, con el motivo y el detalle
  const desc = lineasSC(sc).filter(function (r) { return r[0] === 'fecha_envio_descartada'; }).map(function (r) { return r[4]; }).sort();
  igual(desc, ['E-10', 'E-11', 'E-12'], 'IDS_SIN_CRUZAR: sólo las tres de año que no cierra (2025, 2062 y "25/9/62"), con motivo fecha_envio_descartada');
  const l10 = lineaSC(sc, 'E-10', 'fecha_envio_descartada');
  ok(/dice 25\/09\/2025/.test(l10[1]) && /el año no cierra con la fecha del encuentro \(30\/09\/2026\)/.test(l10[1]) && /El ID sí se escribe \(fila 12\)/.test(l10[1]),
     'el detalle dice qué fecha traía, contra qué encuentro y que el ID se escribió (fila 12)');
  ok(l10[2] === 'Agenda funcionarios' && l10[3] === 13 && l10[4] === 'E-10' && l10[5] === 'Figura K Nombre' && l10[6] === 'Retiro',
     'y la línea trae solapa, fila de la lista, ID, Funcionario y lugar');
  ok(l10[7] === '' && l10[8] === '30/09/2026' && l10[9] === '25/09/2025', '…sin Tipo (esta solapa no lo tiene), con la Fecha del encuentro y la Fecha de envío tal como estaban');
  const enc = sc.E.intermedia('IDS_SIN_CRUZAR').valores[0];
  igual([/^motivo \(historial \(paso 57\), 08\/10 21:00\)$/.test(enc[0]), enc.slice(1)],
        [true, ['detalle', 'solapa', 'fila lista', 'ID', 'Funcionario', 'Barrio / Comuna', 'Tipo', 'Fecha (lista)', 'Fecha de envío', 'filas candidatas']],
        'IDS_SIN_CRUZAR: el encabezado dice la corrida y la hora, y trae las once columnas');
  ok(!lineaSC(sc, 'E-2') && !lineaSC(sc, 'E-4') && !lineaSC(sc, 'E-13') && !lineaSC(sc, 'E-15'), '"#N/A", "-", vacías y texto que no es fecha NO se listan (quedan vacías sin ruido)');
  igual(sc.res.conteo.envioDescartado, 3, 'el conteo: 3 fechas de envío descartadas');
  igual(sc.res.conteo.escribeFecha, 6, 'y 6 fechas de envío escritas (la fecha, "25/9/26", "25/09/2026", la serie y los dos textos con hora)');
}
{
  // el año cierra: el mismo año, o diciembre del anterior para un encuentro de enero
  const caso = function (titulo, enc, envio, esperado, hoy) {
    const sc = escenario({ t: { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: enc } }, [fila('E-1', 'Gabino Tapia', 'Retiro', enc, envio)], { hoy: hoy });
    correr(sc);
    igual([envioDe(sc, 't'), idDe(sc, 't')], [esperado, 'E-1'], titulo);
  };
  caso('diciembre de 2025 para un encuentro de enero de 2026: el año cierra, se escribe', D(2, 1), D(28, 12, 2025), '28/12/2025');
  caso('noviembre de 2025 para uno de enero de 2026: no cierra', D(2, 1), D(28, 11, 2025), '');
  caso('diciembre de 2025 para uno de febrero de 2026: no cierra', D(2, 2), D(28, 12, 2025), '');
  caso('diciembre de 2025 para uno de diciembre de 2026: no cierra', D(2, 12), D(28, 12, 2025), '', new Date(2026, 11, 10, 21, 0, 0));
  // DISCUTIBLE: del año sólo se mira el año. Un envío DESPUÉS del encuentro (o a meses de distancia) del mismo año se escribe igual.
  caso('un envío del mismo año aunque sea posterior al encuentro (31/12 para el 02/10): se escribe', D(2, 10), D(31, 12, 2026), '31/12/2026');
  // lo que ya está en la base no se pisa
  let sc = escenario({ t: { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f3, 'ID cuentas': 'E-1', 'Fecha envío campañas': D(1, 9) } }, [fila('E-1', 'Gabino Tapia', 'Retiro', f3, D(25, 9))]);
  correr(sc);
  ok(envioDe(sc, 't') === '01/09/2026' && sc.E.base().escrituras.filter(function (e) { return e.fila > 1; }).length === 0, 'una fecha de envío que ya está cargada en la base no se pisa (ni una escritura)');
  // …y una fecha que se pisó con otra cosa (texto) tampoco
  sc = escenario({ t: { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f3, 'Fecha envío campañas': 'a confirmar' } }, [fila('E-1', 'Gabino Tapia', 'Retiro', f3, D(25, 9))]);
  correr(sc);
  ok(celda(sc, 't', 'Fecha envío campañas') === 'a confirmar' && idDe(sc, 't') === 'E-1', 'cualquier valor en esa celda (aunque sea texto) se respeta; el ID se escribe igual');
}

// ============================================================================================================================
console.log('[10] el invariante: un ID en una fila, una fila con un ID');
{
  const T = { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f30 };
  // el mismo ID dos veces en la lista, con los mismos datos: vale uno
  let sc = escenario({ t: T }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, D(25, 9)), fila('X-1', 'Gabino Tapia', 'Retiro', f30, D(25, 9))]);
  correr(sc);
  igual([estado(sc, 'X-1', 0), estado(sc, 'X-1', 1), idDe(sc, 't')], ['escribe', 'repetido', 'X-1'], 'el mismo ID dos veces con los mismos datos: vale uno (el otro es "repetido")');
  ok(lineaSC(sc, 'X-1') === null && sc.res.conteo.repetido === 1, '    el repetido igual no va a IDS_SIN_CRUZAR (se cuenta aparte)');
  sc = escenario({ t: T }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, ''), fila(' x-1 ', 'gabino  tapia', 'RETIRO', f30, '')]);
  correr(sc);
  igual([estado(sc, 'X-1', 0), estado(sc, 'X-1', 1)], ['escribe', 'repetido'], '…aunque difieran en mayúsculas y espacios (el ID y el texto se normalizan)');
  // con datos distintos: ninguno
  sc = escenario({ t: T, l: { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f30 } }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, ''), fila('X-1', 'Hernán Lombardi', 'Núñez', f30, '')]);
  correr(sc);
  igual([estado(sc, 'X-1', 0), estado(sc, 'X-1', 1), Object.keys(escritos(sc)).length], ['no/id_repetido', 'no/id_repetido', 0], 'el mismo ID con datos distintos (dos figuras): ninguno se escribe (id_repetido)');
  ok(lineasSC(sc).filter(function (r) { return r[0] === 'id_repetido'; }).length === 2 && /Agenda funcionarios fila 3, Agenda funcionarios fila 4/.test(lineaSC(sc, 'X-1', 'id_repetido')[1]),
     '    las dos líneas van a IDS_SIN_CRUZAR y el detalle dice dónde está cada una');
  sc = escenario({ t: T }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, ''), fila('X-1', 'Gabino Tapia', 'Retiro', D(1, 10), '')]);
  correr(sc);
  // REGLA: el mismo ID que cruza a la MISMA fila cuenta como uno, aunque los datos estén escritos distinto o las fechas difieran
  igual([estado(sc, 'X-1', 0), estado(sc, 'X-1', 1), idDe(sc, 't')], ['escribe', 'repetido', 'X-1'],
        'el mismo ID con la misma figura y otra fecha (30/09 y 01/10), las dos para la MISMA fila: vale uno (repetido)');
  sc = escenario({ t: T }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, ''), fila('X-1', 'Gabino Tapia', 'Comuna 1 Norte', f30, '')]);
  correr(sc);
  igual([estado(sc, 'X-1', 0), estado(sc, 'X-1', 1), idDe(sc, 't')], ['escribe', 'repetido', 'X-1'],
        'el mismo ID con el lugar escrito distinto ("Retiro" y "Comuna 1 Norte") que cruzan a la misma fila: vale uno');
  // el mismo ID que cruza a UNA fila y otra copia que no cruza (cruces distintos): ninguno
  sc = escenario({ t: T }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, ''), fila('X-1', 'Gabino Tapia', 'Retiro', D(20, 10), '')]);
  correr(sc);
  igual([estado(sc, 'X-1', 0), estado(sc, 'X-1', 1), idDe(sc, 't')], ['no/id_repetido', 'no/id_repetido', ''],
        'el mismo ID con un cruce y una copia que no cruza (una es del 20/10, futura): cruces distintos, ninguno se escribe (id_repetido)');
  // tres copias: dos a una fila y una a otra
  sc = escenario({ t: T, l: { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f30 } },
                 [fila('X-1', 'Gabino Tapia', 'Retiro', f30, ''), fila('X-1', 'Gabino Tapia', 'Retiro', f30, ''), fila('X-1', 'Hernán Lombardi', 'Núñez', f30, '')]);
  correr(sc);
  igual([estado(sc, 'X-1', 0), estado(sc, 'X-1', 1), estado(sc, 'X-1', 2), Object.keys(escritos(sc)).length], ['no/id_repetido', 'no/id_repetido', 'no/id_repetido', 0],
        'tres copias del mismo ID, dos de la misma fila y una de otra: ninguna se escribe');
  // REGLA: con las copias de la misma fila, la fecha de envío es la que tengan; si las fechas VÁLIDAS son distintas, no se escribe
  // ninguna y se lista (fecha_envio_descartada, "fechas de envío distintas"); el ID sí se escribe
  sc = escenario({ t: T }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, D(25, 9)), fila('X-1', 'Gabino Tapia', 'Retiro', f30, D(26, 9))]);
  correr(sc);
  igual([estado(sc, 'X-1', 0), estado(sc, 'X-1', 1), idDe(sc, 't'), envioDe(sc, 't')], ['escribe', 'repetido', 'X-1', ''],
        'el mismo ID dos veces con fechas de envío DISTINTAS (25/09 y 26/09): el ID se escribe y la fecha de envío no');
  const lfe = lineaSC(sc, 'X-1', 'fecha_envio_descartada');
  ok(!!lfe && /el ID está repetido con fechas de envío distintas \(25\/09\/2026 \/ 26\/09\/2026\)\. El ID sí se escribe \(fila 2\)\./.test(lfe[1]),
     '    se lista como fecha_envio_descartada ("fechas de envío distintas (25/09/2026 / 26/09/2026)", el ID sí se escribe en la fila 2)');
  igual(sc.res.conteo.envioDescartado, 1, '    cuenta una fecha de envío descartada');
  sc = escenario({ t: T }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, '#N/A'), fila('X-1', 'Gabino Tapia', 'Retiro', f30, D(26, 9))]);
  correr(sc);
  igual([idDe(sc, 't'), envioDe(sc, 't')], ['X-1', '26/09/2026'], 'con una copia sin fecha de envío ("#N/A") y otra con 26/09: se usa la que sí tiene');
  sc = escenario({ t: T }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, D(26, 9)), fila('X-1', 'Gabino Tapia', 'Retiro', f30, D(26, 9))]);
  correr(sc);
  igual([idDe(sc, 't'), envioDe(sc, 't'), lineaSC(sc, 'X-1')], ['X-1', '26/09/2026', null], 'con las dos copias con la MISMA fecha de envío: esa fecha, sin ruido');
  sc = escenario({ t: Object.assign({}, T, { 'ID cuentas': 'X-1' }) }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, D(25, 9)), fila('X-1', 'Gabino Tapia', 'Retiro', f30, D(26, 9))]);
  correr(sc);
  igual([estado(sc, 'X-1', 0), envioDe(sc, 't')], ['ya_estaba', ''], 'el mismo ID con fechas de envío distintas y que ya estaba en su fila: tampoco se completa la fecha de envío');
  // BUG: `medirIds()` (paso 55) corre `cruzarIds_` DOS veces sobre los mismos registros (el historial y la hora) y `_resolverIds_` (paso 0)
  // le cambia a la primera copia su `envio` ("fechas distintas" → una fecha, si la otra era válida): la segunda cuenta da otra cosa.
  const Em = escenario({ t: T }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, D(25, 9)), fila('X-1', 'Gabino Tapia', 'Retiro', f30, D(26, 9))]).E;
  const med = Em.run('medirIds()');
  igual([med.conteo.escribeFecha, med.hora.escribeFecha, med.conteo.envioDescartado, med.hora.envioDescartado], [0, 0, 1, 1],
        'BUG: medirIds() da lo mismo para el historial y para la hora en un ID repetido con fechas de envío distintas (hoy: la hora dice 1 fecha y 0 descartadas)');
  // BUG: (= BUG 5 de ids_lista_jm.test.js) con el MISMO ID dos veces para la misma fila —una copia de la misma fecha y otra de fecha distinta—, el paso 0
  // de `_resolverIds_` se queda con la PRIMERA copia de la lista, sea cual sea su cruce: si la de fecha distinta va primero, pierde contra un rival de
  // la misma fecha (Y-2) y el resultado cambia con el orden de la lista (con la misma fecha primero, X-1 e Y-2 empatan y no se escribe ninguno).
  const ordenes = function (copias) {
    const sc = escenario({ t: T }, copias.concat([fila('Y-2', 'Gabino Tapia', 'Retiro', f30, '')]));
    correr(sc);
    return [idDe(sc, 't'), estado(sc, 'Y-2')];
  };
  const oA = ordenes([fila('X-1', 'Gabino Tapia', 'Retiro', f30, ''), fila('X-1', 'Gabino Tapia', 'Retiro', f1, '')]);
  const oB = ordenes([fila('X-1', 'Gabino Tapia', 'Retiro', f1, ''), fila('X-1', 'Gabino Tapia', 'Retiro', f30, '')]);
  igual([oA, oB], [['', 'no/fila_disputada'], ['', 'no/fila_disputada']],
        'BUG: el mismo ID dos veces para la misma fila (30/09 y 01/10) y un rival de la misma fecha: el resultado no depende del orden de la lista (hoy: ' + JSON.stringify(oA) + ' y ' + JSON.stringify(oB) + ')');
  // dos IDs que quieren la misma fila
  sc = escenario({ t: Object.assign({}, T, { FECHA: D(29, 9) }) }, [fila('X-1', 'Gabino Tapia', 'Retiro', D(29, 9), ''), fila('X-2', 'Gabino Tapia', 'Retiro', f1, '')]);
  correr(sc);
  igual([estado(sc, 'X-1'), estado(sc, 'X-2'), idDe(sc, 't')], ['escribe', 'no/fila_tomada', 'X-1'], 'dos IDs para la misma fila, uno de la misma fecha y otro de fecha distinta: gana el de la misma fecha (el otro, fila_tomada)');
  ok(/la fila 2 es del ID X-1 \(la misma fecha, la figura exacta\)/.test(lineaSC(sc, 'X-2', 'fila_tomada')[1]), '    el detalle dice quién se la quedó y por qué ("la misma fecha, la figura exacta")');
  sc = escenario({ t: T }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, ''), fila('X-2', 'Gabino Tapia', 'Retiro', f30, '')]);
  correr(sc);
  igual([estado(sc, 'X-1'), estado(sc, 'X-2'), idDe(sc, 't')], ['no/fila_disputada', 'no/fila_disputada', ''], 'dos IDs de la misma fecha para la misma fila: empatan, fila_disputada (ninguno)');
  sc = escenario({ t: Object.assign({}, T, { FECHA: D(29, 9) }) }, [fila('X-1', 'Gabino Tapia', 'Retiro', f1, ''), fila('X-2', 'Gabino Tapia', 'Retiro', f2, '')]);
  correr(sc);
  igual([estado(sc, 'X-1'), estado(sc, 'X-2'), idDe(sc, 't')], ['no/fila_disputada', 'no/fila_disputada', ''], 'dos IDs de fecha distinta (+2 y +3) para la misma fila: empatan, fila_disputada');
  sc = escenario({ t: Object.assign({}, T, { FECHA: D(29, 9) }) }, [fila('X-1', 'Gabino Tapia', 'Retiro', D(29, 9), ''), fila('X-2', 'Gabino Tapia', 'Retiro', f1, ''), fila('X-3', 'Gabino Tapia', 'Retiro', f2, '')]);
  correr(sc);
  igual([estado(sc, 'X-1'), estado(sc, 'X-2'), estado(sc, 'X-3')], ['escribe', 'no/fila_tomada', 'no/fila_tomada'], 'tres IDs para la misma fila, uno de la misma fecha: gana ése, los otros dos fila_tomada');
  // un ID que ya está en otra fila de la base
  sc = escenario({ otra: { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f5, 'ID cuentas': 'X-1' }, t: T }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, D(25, 9))]);
  correr(sc);
  igual([estado(sc, 'X-1'), idDe(sc, 't'), idDe(sc, 'otra'), envioDe(sc, 't')], ['no/id_en_otra_fila', '', 'X-1', ''], 'el ID ya está en OTRA fila de la base: no se escribe (id_en_otra_fila), ni la fecha de envío');
  ok(/el ID ya está en la fila 2 y el cruce da la fila 3/.test(lineaSC(sc, 'X-1', 'id_en_otra_fila')[1]), '    el detalle dice las dos filas');
  sc = escenario({ otra: { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f5, 'ID cuentas': 'X-1' } }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, D(25, 9))]);
  correr(sc);
  igual([estado(sc, 'X-1'), lineaSC(sc, 'X-1')], ['ya_en_la_base', null], 'el ID ya está en la base y el cruce de hoy no da ninguna fila: "ya en la base", sin ruido en IDS_SIN_CRUZAR');
  // el mismo ID ya en su fila: no toca el ID y completa la fecha de envío si está vacía
  sc = escenario({ t: Object.assign({}, T, { 'ID cuentas': 'x-1' }) }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, D(25, 9))]);
  correr(sc);
  igual([estado(sc, 'X-1'), idDe(sc, 't'), envioDe(sc, 't')], ['ya_estaba', 'x-1', '25/09/2026'], 'el ID ya está en SU fila (otras mayúsculas): "ya estaba", no se toca y se completa la fecha de envío vacía');
  igual(sc.E.base().escrituras.filter(function (e) { return e.fila > 1; }).map(function (e) { return e.fila + ':' + sc.E.base().valores[0][e.col - 1]; }), ['2:Fecha envío campañas'],
        '    la única escritura es la fecha de envío');
  const rg = lineasRegistro(sc);
  ok(rg.length === 1 && rg[0][4] === '(ya estaba) X-1' && fecha(rg[0][12]) === '25/09/2026' && rg[0][2] === 'Agenda funcionarios',
     '    REGISTRO_IDS lo anota como "(ya estaba) X-1", con la fecha de envío escrita');
  sc = escenario({ t: Object.assign({}, T, { 'ID cuentas': 'X-1', 'Fecha envío campañas': D(1, 9) }) }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, D(25, 9))]);
  correr(sc);
  ok(estado(sc, 'X-1') === 'ya_estaba' && sc.E.base().escrituras.filter(function (e) { return e.fila > 1; }).length === 0, '"ya estaba" con la fecha de envío ya cargada: no se escribe nada');
  // una fila que ya tiene OTRO ID: no se toca
  sc = escenario({ t: Object.assign({}, T, { 'ID cuentas': 'OTRO-1' }) }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, D(25, 9))]);
  correr(sc);
  igual([estado(sc, 'X-1'), idDe(sc, 't'), envioDe(sc, 't')], ['no/fila_con_otro_id', 'OTRO-1', ''], 'la fila ya tiene OTRO ID: no se toca (fila_con_otro_id), ni su fecha de envío');
  // idempotente: la segunda corrida no escribe nada
  sc = escenario({ t: T, l: { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f30 } }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, D(25, 9)), fila('X-2', 'Hernán Lombardi', 'Núñez', f30, '')]);
  correr(sc);
  const antes = sc.E.base().escrituras.length, regs = lineasRegistro(sc).length;
  correr(sc);
  ok(sc.E.base().escrituras.length === antes && lineasRegistro(sc).length === regs && estado(sc, 'X-1') === 'ya_estaba' && estado(sc, 'X-2') === 'ya_estaba',
     'la segunda corrida no escribe nada en la base ni suma líneas a REGISTRO_IDS (los dos "ya estaban")');
  // en seco: no toca la base (ni agrega las columnas)
  sc = escenario({ t: T }, [fila('X-1', 'Gabino Tapia', 'Retiro', f30, D(25, 9))], { sinColumnas: true });
  correr(sc, 'seco');
  ok(sc.E.base().escrituras.length === 0 && sc.E.base().valores[0].indexOf('ID cuentas') < 0 && sc.res.conteo.escribeId === 1 && sc.res.conteo.escribeFecha === 1,
     'el historial en seco: no toca la base (ni agrega las columnas) y dice lo que escribiría (1 ID y 1 fecha de envío)');
}

// ============================================================================================================================
console.log('[11] la corrida de la hora (sólo filas activas) y el historial (todas)');
{
  // hoy = 08/10/2026 → activas del 08/09 al 15/10 (hoy + 7). Cerrada: 07/09. Primer día activo: 08/09. Último que se cruza: 15/10. Futura: 16/10.
  // Se ESCRIBE sólo en las que ya pasaron (segunda revisión, 08/10): la del 15/10 y la del 16/10 cruzan y esperan (reunion_futura).
  const T = function (fecha_) { return { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: fecha_ }; };
  const specs = { cerr: T(D(7, 9)), prim: T(D(8, 9)), ult: T(D(15, 10)), fut: T(D(16, 10)), vieja: T(D(1, 8)) };
  const fun = [fila('T-1', 'Gabino Tapia', 'Retiro', D(7, 9), D(1, 9)), fila('T-2', 'Gabino Tapia', 'Retiro', D(8, 9), D(2, 9)),
               fila('T-3', 'Gabino Tapia', 'Retiro', D(15, 10), D(8, 10)), fila('T-4', 'Gabino Tapia', 'Retiro', D(16, 10), D(8, 10)),
               fila('T-5', 'Gabino Tapia', 'Retiro', D(1, 8), D(25, 7))];
  let sc = escenario(specs, fun);
  correr(sc, 'hora');
  igual(escritos(sc), { prim: 'T-2' }, 'la hora: sólo las activas que ya pasaron (08/09); la del 07/09 (cerrada), la del 01/08, la del 15/10 y la del 16/10 (futuras), no');
  igual([estado(sc, 'T-1'), estado(sc, 'T-3'), estado(sc, 'T-4'), estado(sc, 'T-5')],
        ['fuera/fila_fuera_de_esta_corrida', 'fuera/reunion_futura', 'fuera/reunion_futura', 'fuera/fila_fuera_de_esta_corrida'],
        'las que no escribe: las cerradas, fila_fuera_de_esta_corrida; las futuras, reunion_futura');
  ok(/cerrada: la escribe la corrida del historial, paso 57/.test(lineaSC(sc, 'T-1', 'fila_fuera_de_esta_corrida')[1]) && lineaSC(sc, 'T-5', 'fila_fuera_de_esta_corrida') !== null,
     'y las cerradas se listan en IDS_SIN_CRUZAR, con el motivo (cerrada: la escribe el historial)');
  ok(lineaSC(sc, 'T-3') === null && lineaSC(sc, 'T-4') === null, 'las futuras NO se listan (esperan: se escriben cuando la reunión pase)');
  igual([envioDe(sc, 'prim'), envioDe(sc, 'ult'), envioDe(sc, 'cerr'), envioDe(sc, 'fut')], ['02/09/2026', '', '', ''], 'las fechas de envío, sólo en las activas que ya pasaron');
  igual([sc.res.conteo.fuera, sc.res.conteo.reunionFutura], [2, 2], 'el conteo: 2 fuera de esta corrida (cerradas) y 2 que esperan que la reunión pase');
  // el historial: todas las que ya pasaron; las futuras siguen esperando
  sc = escenario(specs, fun);
  correr(sc, 'historial');
  igual(escritos(sc), { cerr: 'T-1', prim: 'T-2', vieja: 'T-5' }, 'el historial: también las cerradas (07/09 y 01/08); la del 15/10 y la del 16/10 no (futuras)');
  igual([estado(sc, 'T-3'), estado(sc, 'T-4'), lineaSC(sc, 'T-4')], ['fuera/reunion_futura', 'fuera/reunion_futura', null], 'y las futuras esperan, sin listarse');
  // la hora y después el historial: se completan, sin pisarse
  sc = escenario(specs, fun);
  correr(sc, 'hora');
  correr(sc, 'historial');
  igual(escritos(sc), { cerr: 'T-1', prim: 'T-2', vieja: 'T-5' }, 'la hora y después el historial: queda todo lo del historial, y lo de la hora no se vuelve a tocar');
  igual(sc.E.base().escrituras.filter(function (e) { return e.fila === sc.n.prim && sc.E.base().valores[0][e.col - 1] === 'ID cuentas'; }).length, 1, '    (la fila de la hora se escribió una sola vez)');
  // cuando pasan (hoy = 17/10): la hora escribe la del 15/10 y la del 16/10
  sc = escenario(specs, fun, { hoy: new Date(2026, 9, 17, 9, 0, 0) });
  correr(sc, 'hora');
  igual([idDe(sc, 'ult'), idDe(sc, 'fut')], ['T-3', 'T-4'], 'con hoy = 17/10, la hora escribe las del 15/10 y el 16/10 (ya pasaron)');
  // sin las columnas: la hora no las agrega ni escribe; el historial sí las agrega
  sc = escenario({ t: T(f3) }, [fila('T-1', 'Gabino Tapia', 'Retiro', f3, D(1, 10))], { sinColumnas: true });
  correr(sc, 'hora');
  ok(sc.E.base().escrituras.length === 0 && /no se escribe nada hasta que las agregue la corrida del historial/.test(sc.E.log()) && sc.res.conteo.escribeId === 1,
     'la hora sin las columnas: no las agrega ni escribe nada (lo hace el historial) y dice lo que escribiría');
  correr(sc, 'historial');
  igual([idDe(sc, 't'), envioDe(sc, 't')], ['T-1', '01/10/2026'], 'el historial las agrega al final y escribe');
  const h = sc.E.base().valores[0];
  ok(h.slice(-2).join('|') === 'ID cuentas|Fecha envío campañas' && h.indexOf('ID cuentas') === hdrBase().length, 'las dos columnas, al final y en ese orden');
  // REGLA: la hora no escribe NADA en una fila cerrada, tampoco la fecha de envío de un registro que "ya estaba" (antes, un BUG: el estado
  // `ya_estaba` no pasaba por `escribeFila`).
  sc = escenario({ cerr: Object.assign(T(D(1, 8)), { 'ID cuentas': 'T-9' }), act: Object.assign(T(f3), { 'ID cuentas': 'T-8' }) },
                 [fila('T-9', 'Gabino Tapia', 'Retiro', D(1, 8), D(25, 7)), fila('T-8', 'Gabino Tapia', 'Retiro', f3, D(1, 10))]);
  correr(sc, 'hora');
  igual([estado(sc, 'T-8'), envioDe(sc, 'act')], ['ya_estaba', '01/10/2026'], 'la hora: una fila ACTIVA con su ID y sin fecha de envío la completa');
  igual(envioDe(sc, 'cerr'), '', 'la hora NO escribe en una fila CERRADA (01/08) aunque el ID ya esté: ni la fecha de envío vacía');
  igual(sc.res.conteo.escribeFecha, 1, '…y cuenta una sola fecha de envío para escribir (la de la activa)');
  correr(sc, 'historial');
  igual(envioDe(sc, 'cerr'), '25/07/2026', 'el historial sí completa la fecha de envío de la cerrada');
  // el reloj corre: lo que era activo deja de serlo
  sc = escenario({ t: T(D(1, 10)) }, [fila('T-1', 'Gabino Tapia', 'Retiro', D(1, 10), '')], { hoy: new Date(2026, 10, 15, 21, 0, 0) });
  correr(sc, 'hora');
  ok(idDe(sc, 't') === '' && estado(sc, 'T-1') === 'fuera/fila_fuera_de_esta_corrida', 'con hoy = 15/11 la fila del 01/10 ya es cerrada: la hora no la escribe');
}

// ============================================================================================================================
console.log('[12] las filas Reprogramada (no son candidatas) y las Suspendida (sí)');
{
  // REGLA: una fila "Reprogramada" es la fecha vieja de una reunión que se movió: no es candidata. Si es la única del día, sin_fila con el
  // motivo `fila_reprogramada` (y la fila como candidata). Una "Suspendida" sigue siendo candidata (la traza dice "fila Suspendida").
  const T = function (fecha_, barrio, status) { return { Figura: 'Gabino Tapia', Barrio: barrio === undefined ? 'Retiro' : barrio, FECHA: fecha_, 'STATUS REUNIÓN': status || '' }; };
  let sc = escenario({ r: T(f5, 'Retiro', 'Reprogramada') }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')]);
  correr(sc);
  igual([estado(sc, 'X-1'), idDe(sc, 'r')], ['no/fila_reprogramada', ''], 'la única fila del día está Reprogramada: no cruza (fila_reprogramada)');
  const lr = lineaSC(sc, 'X-1', 'fila_reprogramada');
  ok(!!lr && /está Reprogramada y no hay otra a ±3 días con el mismo lugar/.test(lr[1]) && /fila 2 \(Gabino Tapia, 05\/10\/2026, Retiro, misma fecha, reprogramada\)/.test(lr[10]),
     '    se lista con el detalle y la fila Reprogramada como candidata');
  // con la nueva fecha de la reunión (+2 días): cruza con ésa, por fecha distinta
  sc = escenario({ vieja: T(f5, 'Retiro', 'Reprogramada'), nueva: T(f7, 'Retiro', 'en agenda') }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')]);
  correr(sc);
  igual([estado(sc, 'X-1'), cruce(sc, 'X-1'), idDe(sc, 'vieja')], ['escribe', [sc.n.nueva, 'exacta', 'fecha_distinta'], ''],
        'la Reprogramada (la fecha vieja) y la nueva a +2 días: el ID va a la nueva (fecha distinta), nunca a la Reprogramada');
  // otra fila del mismo día que no está Reprogramada: ésa
  sc = escenario({ vieja: T(f5, 'Retiro', 'Reprogramada'), otra: T(f5, 'Retiro', 'en agenda') }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')]);
  correr(sc);
  igual([cruce(sc, 'X-1'), idDe(sc, 'vieja')], [[sc.n.otra, 'exacta', 'misma_fecha'], ''], 'dos filas el mismo día, una Reprogramada y otra no: la que no (la Reprogramada no cuenta ni para el desempate)');
  // una Reprogramada a −2 días y nada más: no es candidata, ni por fecha distinta
  sc = escenario({ vieja: T(f3, 'Retiro', 'Reprogramada') }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')]);
  correr(sc);
  igual([estado(sc, 'X-1'), idDe(sc, 'vieja')], ['no/sin_fila', ''], 'una Reprogramada a −2 días y ninguna otra: tampoco cruza por fecha distinta (sin_fila)');
  // el estado se compara sin mayúsculas ni espacios
  sc = escenario({ r: T(f5, 'Retiro', ' reprogramada ') }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')]);
  correr(sc);
  igual(estado(sc, 'X-1'), 'no/fila_reprogramada', 'el estado se compara sin mayúsculas ni espacios (" reprogramada ")');
  // la Reprogramada del día en otro lugar: igual no es candidata
  sc = escenario({ r: T(f5, 'Flores', 'Reprogramada') }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')]);
  correr(sc);
  igual(estado(sc, 'X-1'), 'no/fila_reprogramada', 'la Reprogramada del día en otro lugar (Flores): igual fila_reprogramada, no lugar_distinto');
  // una conjunta Reprogramada
  sc = escenario({ cj: { Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: f30, 'Conjunta con': 'Gustavo Arengo Piragine / Gabino Tapia', 'STATUS REUNIÓN': 'Reprogramada' } },
                 [fila('K-1', C3, 'Núñez', f30, '')]);
  correr(sc);
  igual([estado(sc, 'K-1'), idDe(sc, 'cj')], ['no/fila_reprogramada', ''], 'una conjunta Reprogramada: tampoco cruza');
  // Suspendida, Realizada, en agenda y sin estado: candidatas
  ['Suspendida', 'Realizada', 'en agenda', ''].forEach(function (st) {
    sc = escenario({ t: T(f5, 'Retiro', st) }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')]);
    correr(sc);
    igual([estado(sc, 'X-1'), idDe(sc, 't')], ['escribe', 'X-1'], 'una fila con estado "' + st + '" sí es candidata: cruza');
  });
  sc = escenario({ t: T(f5, 'Retiro', 'Suspendida') }, [fila('X-1', 'Gabino Tapia', 'Retiro', f5, '')]);
  correr(sc);
  ok(lineasRegistro(sc).some(function (r) { return / · fila Suspendida/.test(r[11]); }), '…y la traza (REGISTRO_IDS) lo dice: "fila Suspendida"');
}

// ============================================================================================================================
console.log('[13] las fechas de la lista imposibles (el año mal escrito)');
{
  // REGLA: una Fecha de la lista antes de IDS_FECHA_LISTA_MIN (2024-01-01) o a más de IDS_DIAS_FECHA_LISTA_MAX (180) días de hoy es un error
  // de tipeo (un año mal escrito): no se cruza, se lista con el motivo `fecha_imposible` y cuenta como "sin fecha". Va antes que el resto.
  const T = { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f3 };
  const sc0 = escenario({ t: T }, [fila('X-1', 'Gabino Tapia', 'Retiro', f3, '')]);
  igual([sc0.E.cfg('IDS_FECHA_LISTA_MIN'), sc0.E.cfg('IDS_DIAS_FECHA_LISTA_MAX')], ['2024-01-01', 180], 'los límites (00_Config.js): desde 2024-01-01 y hasta 180 días después de hoy');
  // hoy = 08/10/2026: el último día válido es el 06/04/2027 (hoy + 180)
  [['01/10/2062 (el año mal escrito)', D(1, 10, 2062), true], ['"01/10/2062" como texto', '01/10/2062', true], ['31/12/2023 (antes de 2024)', D(31, 12, 2023), true],
   ['01/01/2024 (el primer día válido)', D(1, 1, 2024), false], ['06/04/2027 (hoy + 180, el último día válido)', D(6, 4, 2027), false],
   ['07/04/2027 (hoy + 181)', D(7, 4, 2027), true], ['08/10/2027', D(8, 10, 2027), true]].forEach(function (c) {
    const sc = escenario({ t: T }, [fila('X-1', 'Gabino Tapia', 'Retiro', c[1], '')]);
    correr(sc);
    if (c[2]) {
      const l = lineaSC(sc, 'X-1', 'fecha_imposible');
      ok(estado(sc, 'X-1') === 'no/fecha_imposible' && !!l && /la Fecha de la lista dice \d\d\/\d\d\/\d{4}: ¿el año está mal escrito\?/.test(l[1]) && sc.res.conteo.sinFecha === 1 && idDe(sc, 't') === '',
         c[0] + ': fecha_imposible, se lista ("¿el año está mal escrito?") y cuenta como "sin fecha"');
    } else {
      ok(estado(sc, 'X-1') !== 'no/fecha_imposible' && lineaSC(sc, 'X-1', 'fecha_imposible') === null, c[0] + ': no es imposible (' + estado(sc, 'X-1') + ')');
    }
  });
  // va antes que el Funcionario
  const sc = escenario({ t: T }, [fila('X-1', 'Fulano De Tal', 'Retiro', D(1, 10, 2062), '')]);
  correr(sc);
  igual(estado(sc, 'X-1'), 'no/fecha_imposible', 'una fecha imposible y un Funcionario que no se reconoce: primero la fecha (fecha_imposible)');
  // el límite sigue al reloj: con hoy = 15/11/2026 el último día válido pasa al 14/05/2027
  const sc2 = escenario({ t: T }, [fila('X-1', 'Gabino Tapia', 'Retiro', D(7, 4, 2027), '')], { hoy: new Date(2026, 10, 15, 21, 0, 0) });
  correr(sc2);
  ok(estado(sc2, 'X-1') !== 'no/fecha_imposible', 'el límite sigue al reloj: con hoy = 15/11/2026 el 07/04/2027 ya no es imposible (' + estado(sc2, 'X-1') + ')');
  // la Fecha de envío con el año mal escrito es otra cosa: el ID se escribe y se lista aparte (ver [9])
  const sc3 = escenario({ t: T }, [fila('X-1', 'Gabino Tapia', 'Retiro', f3, D(25, 9, 2062))]);
  correr(sc3);
  igual([estado(sc3, 'X-1'), idDe(sc3, 't'), lineaSC(sc3, 'X-1', 'fecha_envio_descartada') !== null], ['escribe', 'X-1', true], 'el año mal escrito en la Fecha de ENVÍO no frena el cruce: el ID se escribe y la fecha de envío se descarta (listada)');
}

// ============================================================================================================================
console.log('[14] el huso horario de la lista');
{
  // REGLA: las fechas de la lista se leen en el huso horario de LA LISTA (getSpreadsheetTimeZone), no en el del script. Con la lista en GMT,
  // 2026-10-03T00:00Z es el 03/10; leído en Buenos Aires (el del script) sería el 02/10 a las 21:00.
  const utc = function (d, m, h) { return new Date(Date.UTC(2026, m - 1, d, h || 0, 0, 0)); };
  const base = { t: { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: f3 } };
  let sc = escenario(base, [fila('X-1', 'Gabino Tapia', 'Retiro', utc(3, 10), utc(25, 9))], { tzLista: 'GMT' });
  correr(sc);
  igual([estado(sc, 'X-1'), cruce(sc, 'X-1'), idDe(sc, 't'), envioDe(sc, 't')], ['escribe', [sc.n.t, 'exacta', 'misma_fecha'], 'X-1', '25/09/2026'],
        'lista en GMT: 2026-10-03T00:00Z es el 03/10 (misma fecha) y 2026-09-25T00:00Z, el 25/09');
  ok(/huso horario de la lista: GMT \(distinto del script, America\/Argentina\/Buenos_Aires: las fechas se leen en el de la lista\)/.test(sc.E.log()),
     '    el log dice el huso de la lista y que es distinto del del script');
  // el mismo instante, con la lista en el huso del script: un día antes
  sc = escenario(base, [fila('X-1', 'Gabino Tapia', 'Retiro', utc(3, 10), utc(25, 9))]);
  correr(sc);
  igual([cruce(sc, 'X-1'), envioDe(sc, 't')], [[sc.n.t, 'exacta', 'fecha_distinta'], '24/09/2026'],
        'con la lista en el huso del script (Buenos Aires), el mismo instante es el 02/10 (a +1 día: fecha distinta) y el 24/09');
  ok(!/distinto del script/.test(sc.E.log()), '    y el log no avisa de ningún huso distinto');
  // otro caso: el 04/10 a la 01:00Z es el 04/10 en la lista (en Buenos Aires, el 03/10 a las 22:00)
  sc = escenario({ t: { Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: D(4, 10) } }, [fila('X-1', 'Gabino Tapia', 'Retiro', utc(4, 10, 1), '')], { tzLista: 'GMT' });
  correr(sc);
  igual(cruce(sc, 'X-1'), [sc.n.t, 'exacta', 'misma_fecha'], 'lista en GMT: el 04/10 a la 01:00Z es el 04/10 (en Buenos Aires sería el 03/10)');
  // un número de serie y un texto no dependen del huso
  const serie = Math.round((Date.UTC(2026, 9, 3) - Date.UTC(1899, 11, 30)) / 86400000);
  [['un número de serie', serie], ['un texto dd/MM/aaaa', '03/10/2026']].forEach(function (c) {
    sc = escenario(base, [fila('X-1', 'Gabino Tapia', 'Retiro', c[1], '')], { tzLista: 'GMT' });
    correr(sc);
    igual(cruce(sc, 'X-1'), [sc.n.t, 'exacta', 'misma_fecha'], c[0] + ' en la Fecha de la lista: no depende del huso (el 03/10)');
  });
  // IDS_SIN_CRUZAR muestra las fechas como se leyeron (en el huso de la lista)
  sc = escenario(base, [fila('X-1', 'Gabino Tapia', 'Retiro', utc(20, 8), utc(25, 9, 1))], { tzLista: 'GMT' });
  correr(sc);
  const ls = lineaSC(sc, 'X-1', 'sin_fila');
  ok(!!ls && ls[8] === '20/08/2026' && ls[9] === '25/09/2026', 'IDS_SIN_CRUZAR muestra las fechas como se leyeron en el huso de la lista (20/08/2026 y 25/09/2026)');
}

// ============================================================================================================================
console.log('[15] una columna de la base con fórmulas no se escribe');
{
  // REGLA: una de las dos columnas que ya estaba en la base y tiene FÓRMULAS (de quien la creó) no se escribe: escribir sobre una celda cuyo
  // resultado es vacío pisaría la fórmula. Se mira la columna entera (getFormulas, de la fila 2 a la última): una sola celda con fórmula
  // alcanza para no escribir NINGUNA celda de esa columna. La otra columna, sí.
  const T = function (fecha_, barrio) { return { Figura: 'Gabino Tapia', Barrio: barrio || 'Retiro', FECHA: fecha_ }; };
  const armar = function (conFormula, modo, cuantas) {
    const sc = escenario({ a: T(f3), b: T(f5, 'Núñez') }, [fila('X-1', 'Gabino Tapia', 'Retiro', f3, D(25, 9)), fila('X-2', 'Gabino Tapia', 'Núñez', f5, D(26, 9))]);
    const h = sc.E.base().valores[0];
    conFormula.forEach(function (c) {
      for (let k = 0; k < (cuantas || 1); k++) sc.E.base().formulasCelda[(3 + k) + ':' + (h.indexOf(c) + 1)] = '=IFERROR(VLOOKUP(A' + (3 + k) + ';Hoja!A:B;2;FALSE);"")';
    });
    correr(sc, modo);
    sc.iId = h.indexOf('ID cuentas') + 1; sc.iEnv = h.indexOf('Fecha envío campañas') + 1;
    return sc;
  };
  const escrituras = function (sc, col) { return sc.E.base().escrituras.filter(function (e) { return e.fila > 1 && e.col === col; }).length; };
  ['historial', 'hora'].forEach(function (modo) {
    let sc = armar(['ID cuentas'], modo);
    igual([idDe(sc, 'a'), idDe(sc, 'b'), envioDe(sc, 'a'), envioDe(sc, 'b')], ['', '', '', ''],
          '(' + modo + ') una celda con fórmula en "ID cuentas": no se escribe NINGÚN ID (ni en las filas sin fórmula), y las fechas de envío ' +
          'tampoco: no van al lado de un ID que no está (segunda revisión)');
    ok(escrituras(sc, sc.iId) === 0 && sc.E.base().formulasCelda['3:' + sc.iId] !== undefined, '    ni se toca la celda con la fórmula');
    ok(/"ID cuentas" tiene 1 celdas con FÓRMULA: no se escribe esa columna \(2 escrituras sacadas\)/.test(sc.E.log()), '    el log lo avisa ("tiene 1 celdas con FÓRMULA: no se escribe esa columna (2 escrituras sacadas)")');
    igual(Object.assign({}, sc.res.formulas), { 'ID cuentas': 1, 'Fecha envío campañas': 0 }, '    y el resultado dice cuántas celdas con fórmula tiene cada columna');
    sc = armar(['Fecha envío campañas'], modo);
    igual([idDe(sc, 'a'), idDe(sc, 'b'), envioDe(sc, 'a'), envioDe(sc, 'b')], ['X-1', 'X-2', '', ''], '(' + modo + ') una celda con fórmula en "Fecha envío campañas": los IDs sí, ninguna fecha de envío');
    ok(escrituras(sc, sc.iEnv) === 0 && /"Fecha envío campañas" tiene 1 celdas con FÓRMULA/.test(sc.E.log()), '    y el log lo avisa');
    sc = armar(['ID cuentas', 'Fecha envío campañas'], modo, 2);
    ok(sc.E.base().escrituras.filter(function (e) { return e.fila > 1; }).length === 0 && sc.E.intermedia('REGISTRO_IDS') === null,
       '(' + modo + ') fórmulas en las dos columnas (2 celdas cada una): no se escribe nada en la base y no hay traza (REGISTRO_IDS)');
    ok(/"ID cuentas" tiene 2 celdas con FÓRMULA/.test(sc.E.log()) && /"Fecha envío campañas" tiene 2 celdas con FÓRMULA/.test(sc.E.log()), '    el log cuenta las 2 celdas con fórmula de cada una');
  });
  // Con fórmulas en "ID cuentas" no se escribe nada (ni los IDs ni las fechas de envío), así que REGISTRO_IDS no anota nada: ningún
  // "(ya estaba) X-1" de un ID que NO está en la fila (era un BUG, arreglado; la segunda revisión lo cerró del todo).
  const sc = armar(['ID cuentas'], 'historial');
  ok(lineasRegistro(sc).length === 0,
     'REGISTRO_IDS no anota un ID que no está en la fila (hoy: ' + JSON.stringify(lineasRegistro(sc).map(function (r) { return r[4]; })) + ')');
  // sin fórmulas, nada de esto (el caso normal está en todo el resto del archivo)
  const sn = armar([], 'historial');
  igual([idDe(sn, 'a'), idDe(sn, 'b'), envioDe(sn, 'a'), envioDe(sn, 'b')], ['X-1', 'X-2', '25/09/2026', '26/09/2026'], 'sin fórmulas: se escribe todo');
}

// ============================================================================================================================
console.log('[16] propiedades con casos al azar (semilla fija): el orden no importa, nada se escribe dos veces, la segunda corrida no escribe');
{
  const prng = function (a) {   // mulberry32: los mismos casos en cada corrida
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };
  const dia = function (off) { return new Date(2026, 9, 8 + off, 12, 0, 0); };   // hoy = 08/10/2026
  const FIG = ['Hernán Lombardi', 'Gabino Tapia', 'Gustavo Arengo Piragine', 'Jorge Macri', 'Ana Pereyra'];
  const BAR = [['Retiro', 'Comuna 1 Norte'], ['Monserrat', 'Comuna 1 Sur'], ['Núñez', 'Comuna 13'], ['Belgrano', 'Comuna 13'], ['Flores', 'Comuna 7'],
               ['Palermo', 'Comuna 14'], ['Barracas', 'Comuna 4']];
  const NO_IDS = ['#N/A', '-', 'Pendiente', 'F-OK'];   // lo que la lista trae en la columna ID y no es un ID
  const FUN = [['Hernán Lombardi'], ['Gabino Tapia'], ['Gustavo Arengo Piragine'], ['Jorge Macri'], ['Ana Pereyra'], ['Hernan Lombardi', 'Gabino Tapia'],
               ['Gabino Tapia', 'Hernán Lombardi'], ['Hernán Lombardi', 'Gustavo Arengo Piragine', 'Gabino Tapia'], ['Hernán Lombardi', 'Fulano De Tal'], ['SEG'], ['SEG']];
  /** Un caso: de 3 a 12 registros y, para casi todos, su fila en la base (misma fecha o corrida, con barrio o sólo comuna, a veces ya con un ID). */
  function generar(seed) {
    const rnd = prng(seed), pick = function (a) { return a[Math.floor(rnd() * a.length)]; };
    const n = 3 + Math.floor(rnd() * 10), lista = [], base = [];
    for (let i = 0; i < n; i++) {
      const fun = pick(FUN), bar = pick(BAR), off = pick([-45, -40, -20, -9, -7, -5, -3, -2, -1, 0, 1, 2, 3, 5, 7, 9, 400, -1010]);
      const id = rnd() < 0.05 ? pick(NO_IDS) : rnd() < 0.04 && lista.length ? lista[Math.floor(rnd() * lista.length)][0] : 'ID-' + seed + '-' + i;
      const texto = fun[0] === 'SEG' ? pick(['Seguridad en tu barrio', 'SEGURIDAD EN TU BARRIO']) : fun.join(pick([', ', ' y ', ' / ', '-']));
      const envio = pick([dia(off - 5), dia(off - 5), '#N/A', '-', '', D(25, 9, 2025), dia(off + 40)]);
      lista.push(fila(id, texto, rnd() < 0.1 ? '' : pick(bar), dia(off), envio));
      if (rnd() < 0.85) {
        const o = { EVENTO: 'Encuentro con Vecinos', FECHA: dia(off + (rnd() < 0.7 ? 0 : pick([-4, -3, -2, -1, 1, 2, 3, 4]))), Barrio: rnd() < 0.75 ? bar[0] : '' };
        if (!o.Barrio && rnd() < 0.7) o['Lugar (mail)'] = bar[1];
        if (rnd() < 0.1) o.Barrio = pick(BAR)[0];
        if (fun[0] === 'SEG') {
          o.Figura = rnd() < 0.8 ? '' : pick(FIG);
          o[rnd() < 0.5 ? 'EVENTO' : 'Evento (mail)'] = 'Seguridad en tu Barrio';
        } else {
          const figs = fun.map(function (x) { return x === 'Hernan Lombardi' ? 'Hernán Lombardi' : x; }).filter(function (x) { return x !== 'Fulano De Tal'; });
          o.Figura = figs[0];
          if (figs.length > 1 && rnd() < 0.8) o['Conjunta con'] = figs.slice(1).join(' / ');
          if (o['Conjunta con'] && rnd() < 0.3) o['No participa'] = o['Conjunta con'].split(' / ')[0];
        }
        if (rnd() < 0.12) o['STATUS REUNIÓN'] = pick(['Reprogramada', 'Suspendida', 'Realizada', 'en agenda']);
        const r = rnd();
        if (r < 0.08) o['ID cuentas'] = id;
        else if (r < 0.12) o['ID cuentas'] = 'OTRO-' + i;
        else if (r < 0.15) o['ID cuentas'] = 'ID-' + seed + '-' + Math.floor(rnd() * n);
        if (rnd() < 0.07) o['Fecha envío campañas'] = D(1, 9);
        base.push(filaBase(o, HB));
      }
    }
    FIG.forEach(function (f) { base.push(filaBase({ Figura: f, Barrio: 'Palermo', FECHA: D(15, 1) }, HB)); });
    return { base: base, lista: lista };
  }
  function armar(c, semillaOrden) {
    let base = c.base.slice(), lista = c.lista.slice();
    if (semillaOrden != null) {
      const rnd = prng(semillaOrden);
      const mezclar = function (a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
      base = mezclar(base); lista = mezclar(lista);
    }
    return crearEntornoIds({ base: base, columnasExtra: COLS_IDS, jm: JM_VACIA, funcionarios: listaFun(lista) });
  }
  /** La base como un conjunto de filas (sin el número de fila: se compara con otro orden). */
  function resultado(E) {
    const h = E.base().valores[0], ix = function (nombre) { return h.indexOf(nombre); };
    return E.base().valores.slice(1).filter(function (r) { return r[0] || r[4]; }).map(function (r) {
      return [r[0], r[1], r[2], fecha(r[4]), r[ix('Conjunta con')], r[ix('Lugar (mail)')], r[ix('Evento (mail)')], r[ix('ID cuentas')], fecha(r[ix('Fecha envío campañas')])].join('|');
    }).sort();
  }

  const N = 50, mal = { dobles: [], cambios: [], huerfanos: [], segunda: [], orden: [], horaHistorial: [], noIds: [], horaCerradas: [] };
  const cuenta = { escribe: 0, ya_estaba: 0, no: 0, fuera: 0 };
  for (let seed = 1; seed <= N; seed++) {
    const c = generar(seed);
    const A = armar(c, null);
    const antes = A.base().valores.map(function (r) { return r.slice(); });
    const res = A.run('idsHistorial(false)');
    const h = A.base().valores[0], iId = h.indexOf('ID cuentas'), iEnv = h.indexOf('Fecha envío campañas');
    res.items.forEach(function (it) { cuenta[it.final.estado] = (cuenta[it.final.estado] || 0) + 1; });
    // 1. un ID en UNA fila (salvo los que ya estaban repetidos en la base antes de correr)
    const previos = {}, ahora = {};
    antes.slice(1).forEach(function (r) { const v = String(r[iId]).toUpperCase(); if (v) previos[v] = (previos[v] || 0) + 1; });
    A.base().valores.slice(1).forEach(function (r) { const v = String(r[iId]).toUpperCase(); if (v) ahora[v] = (ahora[v] || 0) + 1; });
    Object.keys(ahora).forEach(function (v) { if (ahora[v] > (previos[v] || 1)) mal.dobles.push(seed + ':' + v); });
    // 2. lo que ya estaba cargado no cambia
    antes.slice(1).forEach(function (r, k) {
      const d = A.base().valores[k + 1];
      if ((r[iId] !== '' && d[iId] !== r[iId]) || (r[iEnv] !== '' && d[iEnv] !== r[iEnv])) mal.cambios.push(seed + ':fila ' + (k + 2));
    });
    // 3. todo ID escrito es el de UN registro que cruzó con esa fila (y ninguna fila la escriben dos)
    const escribe = {};
    res.items.forEach(function (it) {
      if (it.final.estado !== 'escribe') return;
      const f = it.ev.e.x.f.fila;
      if (escribe[f]) mal.huerfanos.push(seed + ':dos registros para la fila ' + f);
      escribe[f] = it.r.id;
    });
    A.base().valores.slice(1).forEach(function (r, k) {
      if (antes[k + 1][iId] === '' && r[iId] !== '' && escribe[k + 2] !== r[iId]) mal.huerfanos.push(seed + ':fila ' + (k + 2));
    });
    // 3b. lo que la lista trae y no es un ID ("#N/A", "-", "Pendiente", "F-OK") nunca se escribe
    A.base().valores.slice(1).forEach(function (r, k) {
      if (antes[k + 1][iId] === '' && NO_IDS.indexOf(r[iId]) >= 0) mal.noIds.push(seed + ':fila ' + (k + 2));
    });
    // 4. la segunda corrida no escribe nada
    const n0 = A.base().escrituras.length;
    A.run('idsHistorial(false)');
    if (A.base().escrituras.length !== n0) mal.segunda.push(seed);
    // 5. el orden de la lista y de la base no cambia el resultado
    const B = armar(c, seed * 7 + 1);
    B.run('idsHistorial(false)');
    if (JSON.stringify(resultado(A)) !== JSON.stringify(resultado(B))) mal.orden.push(seed);
    // 6. la hora y después el historial dan lo mismo que el historial solo
    const C = armar(c, null);
    C.run('idsEnLaHora_(false)');
    // 6b. la hora no escribió nada fuera de las filas activas (hoy − 30 a hoy + 7: del 08/09 al 15/10/2026)
    C.base().escrituras.forEach(function (e) {
      const d = e.fila > 1 ? C.base().valores[e.fila - 1][4] : null;
      const ymd = d && d.getTime ? d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() : 0;
      if (e.fila > 1 && (ymd < 20260908 || ymd > 20261015)) mal.horaCerradas.push(seed + ':fila ' + e.fila);
    });
    C.run('idsHistorial(false)');
    if (JSON.stringify(resultado(A)) !== JSON.stringify(resultado(C))) mal.horaHistorial.push(seed);
  }
  ok(cuenta.escribe >= 60 && cuenta.ya_estaba >= 3 && cuenta.fuera >= 2 && cuenta.no >= 60,
     'los ' + N + ' casos cruzan de verdad (no son vacíos): ' + JSON.stringify(cuenta));
  igual(mal.dobles, [], 'un ID queda en UNA sola fila (en los ' + N + ' casos)');
  igual(mal.cambios, [], 'un ID o una fecha de envío que ya estaban cargados nunca cambian');
  igual(mal.huerfanos, [], 'todo ID escrito es el de un registro que cruzó con esa fila, y una fila no la escriben dos registros');
  igual(mal.segunda, [], 'la segunda corrida no escribe nada');
  igual(mal.orden, [], 'con la lista y la base en otro orden, el resultado es el mismo');
  igual(mal.horaHistorial, [], 'la hora y después el historial dan lo mismo que el historial solo');
  igual(mal.noIds, [], 'lo que la lista trae en la columna ID y no es un ID ("#N/A", "-", "Pendiente", "F-OK") no se escribe nunca');
  igual(mal.horaCerradas, [], 'la corrida de la hora no escribe nada fuera de las filas activas');
}

console.log('\n' + chequeos + ' chequeos.');
console.log(fallas ? fallas + ' FALLAS' : 'Todo en verde.');
process.exit(fallas ? 1 : 0);
