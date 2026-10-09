/**
 * tests/ids_tres_dias.test.js — los IDs de los encuentros (45_IdsCuentas.js, 08/10): la regla de la FECHA DISTINTA (±3 días)
 * atacada con PROPIEDADES sobre escenarios al azar (semilla fija), contra un oráculo propio e independiente del código.
 *
 *     node tests/ids_tres_dias.test.js
 *     IDS_ESCENARIOS=1500 IDS_SEMILLA=7 node tests/ids_tres_dias.test.js     # más escenarios / otra semilla
 *     IDS_SOLO=137 node tests/ids_tres_dias.test.js                           # un solo escenario, con todo el detalle
 *
 * LA REGLA (la que dice el encabezado de 45_IdsCuentas.js; acá, en limpio):
 *   - la Fecha de la lista es la PLANEADA. Primero se miran las filas de esa fecha (las que el lugar no descarta);
 *   - si no hay ninguna, a ±3 días SÓLO si hay UNA sola fila posible (las que el lugar no descarta: coincide o no se puede
 *     comparar) y en ésa la figura es exacta (no una conjunta donde está) y el lugar coincide; y sólo si la fecha planeada
 *     ya pasó (si es hoy o futura, se espera la fila de ese día);
 *   - si las filas del día no tienen lugar comparable y a ±3 hay una con el lugar exacto: ambiguo;
 *   - Seguridad exige lugar coincidente; una fila "Reprogramada" no es candidata;
 *   - un ID en UNA fila y una fila con UN ID; lo cargado no se toca; un ID se escribe recién cuando la reunión de su fila YA PASÓ
 *     (FECHA anterior a hoy: segunda revisión del 08/10); la hora escribe sólo filas activas (de hoy − 30 a ayer), el historial
 *     todas las que ya pasaron.
 *
 * EL ORÁCULO (`decidir` y `correrOraculo`, abajo) está escrito a partir de esa regla y NO llama a nada del proyecto: tiene su
 * propia tabla de barrios y comunas (se chequea contra la del mock), su propia lectura del lugar, de la identidad de la fila y
 * del invariante. El código se compara contra él en tres niveles: cada registro solo (ORAC), lo que se escribe con el
 * invariante y el alcance (INV) y lo que escribe la corrida de la hora (HORA).
 *
 * LAS PROPIEDADES (se verifican en CADA escenario, sobre cada cruce que el código decide, sin mirar al oráculo para decidir
 * qué esperar: el oráculo sólo clasifica filas —identidad, lugar, días—):
 *   P0  a lo sumo ±3 días de la fecha planeada, y sólo en una fila de ese funcionario (figura, conjunto o Seguridad)
 *   P1  nunca por fecha distinta si hay 2+ filas posibles a ±1..3 días (lugar que coincide o no comparable)
 *   P2  nunca por fecha distinta si la fecha planeada es hoy o futura
 *   P3  nunca por fecha distinta a una fila cuyo lugar no coincide (desacuerdo o no comparable) ni a una conjunta parcial
 *   P4  nunca a una fila cuyo lugar está en DESACUERDO (tampoco el mismo día)
 *   P5  Seguridad nunca cruza con un lugar que no coincide
 *   P6  una fila Reprogramada nunca recibe un ID
 *   P7  si hay una fila posible el mismo día, nunca gana una de otro día; y en el caso "las del día sin lugar comparable +
 *       una exacta a ±3" no se escribe nada (ni la del día ni la de ±3: ambiguo)
 *   P8  un ID en una sola fila; lo que ya estaba cargado no cambia; todo ID escrito es de un registro que cruzó con esa fila
 *   P9  el orden de la lista y de la base no cambia el resultado (se barajan las dos)
 *   P10 la segunda corrida no escribe nada (a); hora y después historial = historial solo (b); la hora no escribe fuera de
 *       las filas activas (c); ninguna corrida escribe una fila cuya reunión todavía no pasó: esperan a una corrida posterior (d)
 *   P11 agregar filas que no pueden ser candidatas (una copia Reprogramada de cada fila, una fila de una figura que nadie nombra,
 *       una fila del funcionario a 4..8 días) no cambia el resultado
 *   P12 el resultado no depende de qué día es hoy: se corre TODO k días (la lista, la base y el reloj)
 *
 * Si falla un escenario, se IMPRIME el escenario mínimo (se achica solo) con la semilla y el índice para reproducirlo.
 * Los chequeos marcados `// BUG:` muestran un error de producción: FALLAN mientras el bug esté. Los marcados `DISCUTIBLE:` fijan lo que
 * el código hace hoy en un punto donde la regla escrita no alcanza para decidir: pasan, pero hay que invertirlos (y el oráculo,
 * `decidir`) si se cambia la decisión.
 *
 * Los puntos de la regla escrita que admiten dos lecturas (el oráculo sigue la del código, que es la de los otros tests):
 *   - "las filas de la fecha de la lista" son las que el lugar NO descarta: una fila del día en otro lugar no bloquea el ±3;
 *   - "una conjunta donde está (sólo el mismo día, y si no hay una fila propia)": "propia" es una fila propia DEL MISMO DÍA; con la
 *     propia a ±3 y la conjunta el día de la lista, cruza con la conjunta (DISCUTIBLE, en [1]);
 *   - una fila que ya tiene OTRO ID sigue siendo "posible" para contar las filas a ±3 (tests/ids_lista_jm.test.js [9], HALLAZGO).
 *
 * Cubre el lugar en los niveles barrio / comuna / eje; NO cubre las subzonas de la Comuna 1 (Retiro, Monserrat…): están en
 * tests/ids_lista_funcionarios.test.js [6]. NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: IDs,
 * fechas y escenarios inventados; las figuras son las de los otros tests y los barrios, los de la Ciudad. "Hoy" es el
 * 08/10/2026 21:00 (el del mock).
 */
'use strict';
const { crearEntornoIds: _crearEntornoIds, filaBase, hdrBase, COMUNAS } = require('./ids_mock');
// Este archivo prueba la regla de SIEMPRE: las dos mejoras del 09/10 (IDS_CONJUNTA_UNA_FIGURA, IDS_SEGURIDAD_POR_COMUNA,
// prendidas en 00_Config.js) se apagan acá; las prueba tests/ids_mejoras.test.js.
const SIN_MEJORAS_ = { '00_Config.js': [['const IDS_CONJUNTA_UNA_FIGURA = true;', 'const IDS_CONJUNTA_UNA_FIGURA = false;'],
                                        ['const IDS_SEGURIDAD_POR_COMUNA = true;', 'const IDS_SEGURIDAD_POR_COMUNA = false;']] };
const crearEntornoIds = function (o) { return _crearEntornoIds(Object.assign({ reemplazos: SIN_MEJORAS_ }, o)); };


let chequeos = 0, fallas = 0, bugsAbiertos = 0;
function ok(cond, que) { chequeos++; console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }
/** Un BUG de producción conocido: falla mientras el bug esté (la salida dice "BUG"). */
function bug(cond, que) { chequeos++; console.log((cond ? '  ok   ' : '  BUG   ') + que); if (!cond) { fallas++; bugsAbiertos++; } }
function igual(actual, esperado, que) {
  const a = JSON.stringify(actual), e = JSON.stringify(esperado);
  ok(a === e, que + (a === e ? '' : '  → dio ' + a + ' y se esperaba ' + e));
}

// ===================================================================================================================
// El azar: mulberry32, con una semilla distinta por escenario (semilla del test + índice)
// ===================================================================================================================
const SEMILLA = Number(process.env.IDS_SEMILLA || 20261008);
const N_ESCENARIOS = Number(process.env.IDS_ESCENARIOS || 450);
const ACHICAR = process.env.IDS_SIN_ACHICAR !== '1';   // IDS_SIN_ACHICAR=1: no achica los escenarios que fallan (más rápido)
const SOLO = process.env.IDS_SOLO != null && process.env.IDS_SOLO !== '' ? Number(process.env.IDS_SOLO) : null;

function crearAzar(semilla) {
  let a = semilla >>> 0;
  const r = function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const az = {
    r: r,
    int: function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); },
    pick: function (arr) { return arr[Math.floor(r() * arr.length)]; },
    chance: function (p) { return r() < p; },
    /** Elige entre `[valor, peso]`. */
    pickW: function (pares) {
      let total = 0; pares.forEach(function (p) { total += p[1]; });
      let x = r() * total;
      for (let i = 0; i < pares.length; i++) { x -= pares[i][1]; if (x < 0) return pares[i][0]; }
      return pares[pares.length - 1][0];
    },
    shuffle: function (arr) {
      const o = arr.slice();
      for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = o[i]; o[i] = o[j]; o[j] = t; }
      return o;
    },
    sample: function (arr, n) { return az.shuffle(arr).slice(0, n); }
  };
  return az;
}
const mezclar = function (semilla, idx) { return (Math.imul(semilla ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul(idx + 1, 0xC2B2AE35)) >>> 0; };
const clon = function (x) { return JSON.parse(JSON.stringify(x)); };
/**
 * Los entornos simulados (vm) no los suelta el recolector a tiempo: sin esto la memoria crece ~0,4 MB por entorno y la corrida se
 * vuelve cada vez más lenta. Si se puede, se fuerza la recolección cada tanto (sin pasar flags por la línea de comandos).
 */
const liberar = (function () {
  try {
    require('v8').setFlagsFromString('--expose-gc');
    const gc = require('vm').runInNewContext('gc');
    return function () { try { gc(); } catch (e) { /* sin gc: no pasa nada */ } };
  } catch (e) { return function () {}; }
})();

// ===================================================================================================================
// El mundo del test (propio: no se importa nada del proyecto para decidir qué esperar)
// ===================================================================================================================
const FIGURAS = ['Gabino Tapia', 'Hernán Lombardi', 'Jorge Macri', 'Gustavo Arengo Piragine'];
/** Barrios (sin la Comuna 1, que tiene subzonas) y su comuna. Se chequea contra la tabla del mock más abajo. */
const COMUNA_DE = {
  'Belgrano': 13, 'Núñez': 13, 'Flores': 7, 'Parque Chacabuco': 7, 'Caballito': 6, 'Palermo': 14, 'Barracas': 4, 'La Boca': 4,
  'Villa Urquiza': 12, 'Saavedra': 12, 'Almagro': 5, 'Boedo': 5, 'Recoleta': 2, 'Balvanera': 3
};
const BARRIOS = Object.keys(COMUNA_DE);
const COMUNAS_USADAS = BARRIOS.map(function (b) { return COMUNA_DE[b]; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
const EJES = ['Norte', 'Sur', 'Centro', 'Oeste'];
const DIAS_MAX = 3;                 // ±3
const ACTIVAS_DESDE = -30, ACTIVAS_HASTA = 7;   // hoy − 30 a hoy + 7
const LISTA_MAX_DIAS = 180;         // una Fecha de la lista a más de 180 días de hoy es un error de tipeo

const pad = function (n) { return ('0' + n).slice(-2); };
/** El día `off` (0 = hoy = 08/10/2026), al mediodía. */
const dia = function (off) { return new Date(2026, 9, 8 + off, 12, 0, 0); };
const fmtDia = function (off) { const d = dia(off); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); };
const signo = function (n) { return (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n); };
const sinTildes = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); };
const U = function (s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toUpperCase(); };
const mismoConj = function (a, b) {
  return a.length > 0 && a.length === b.length && a.every(function (x) { return b.indexOf(x) >= 0; }) && b.every(function (x) { return a.indexOf(x) >= 0; });
};

// Mi tabla de barrios tiene que ser la del mock (si no, el test se contradice solo).
{
  const delMock = {};
  COMUNAS.forEach(function (c) { delMock[c[0]] = c[1]; });
  const mal = BARRIOS.filter(function (b) { return delMock[b] !== COMUNA_DE[b]; });
  if (mal.length) { console.log('FALLA: la tabla de barrios del test no coincide con la del mock: ' + mal.join(', ')); process.exit(1); }
}

// ===================================================================================================================
// El ORÁCULO
// ===================================================================================================================

/** El lugar de la lista (o el "Lugar (mail)" de una fila): un barrio, una comuna ("Comuna 13", "C13") o un eje ("Eje Norte"). */
function ubicLista(texto) {
  const t = sinTildes(texto);
  let m = /^(?:c|comuna)\s*0?(\d{1,2})$/.exec(t);
  if (m) return { barrio: '', comuna: Number(m[1]), eje: '' };
  m = /^eje\s+(norte|sur|centro|oeste|este)$/.exec(t);
  if (m) return { barrio: '', comuna: null, eje: m[1] };
  // los barrios que nombra el texto: UNO → ese barrio; DOS o más → la comuna (la que dice el texto, o la de esos barrios si es una sola;
  // si son de comunas distintas, sin ubicación)
  const nombrados = BARRIOS.filter(function (b) { return new RegExp('(^|[^a-z0-9])' + sinTildes(b) + '([^a-z0-9]|$)').test(t); });
  if (nombrados.length === 1) return { barrio: nombrados[0], comuna: COMUNA_DE[nombrados[0]], eje: '' };
  if (nombrados.length >= 2) {
    const comunas = nombrados.map(function (b) { return COMUNA_DE[b]; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
    const dicha = /comuna\s*0?(\d{1,2})/.exec(t);
    return { barrio: '', comuna: dicha ? Number(dicha[1]) : (comunas.length === 1 ? comunas[0] : null), eje: '' };
  }
  return { barrio: '', comuna: null, eje: '' };
}
/** El lugar de una fila: el barrio; la comuna de ese barrio o, sin barrio, la del "Lugar (mail)"; el eje, sólo el del mail. */
function ubicFila(f) {
  const lm = ubicLista(f.lugarMail || '');
  const barrio = f.barrio || '';
  return { barrio: barrio, comuna: barrio ? COMUNA_DE[barrio] : lm.comuna, eje: lm.eje };
}
/** Los tres niveles: barrio con barrio; si no, comuna con comuna; si no, eje con eje. true / false / null (no se puede comparar). */
function comparar(l, f) {
  if (l.barrio && f.barrio) return l.barrio === f.barrio;
  if (l.comuna != null && f.comuna != null) return l.comuna === f.comuna;
  if (l.eje && f.eje) return l.eje === f.eje;
  return null;
}
const esSeguridad = function (f) { return /seguridad en tu barrio|sobre seguridad/.test(sinTildes([f.evento, f.eventoMail].join(' | '))); };
const esReprogramada = function (f) { return sinTildes(f.status) === 'reprogramada'; };
const figurasFila = function (f) { return f.figura ? [f.figura].concat(f.conjunta || []) : []; };

/**
 * QUIÉN: 'exacta' (la misma figura sola; el mismo conjunto, con o sin los que no participan; Seguridad con Seguridad),
 * 'parcial' (una figura sola contra una conjunta donde participa) o ''.
 */
function identidad(rec, f) {
  if (rec.tipo === 'seg') return esSeguridad(f) ? 'exacta' : '';
  const E = rec.figuras, todas = figurasFila(f);
  if (!E.length || !todas.length) return '';
  const part = todas.filter(function (x) { return (f.noPart || []).indexOf(x) < 0; });
  if (mismoConj(E, todas)) return 'exacta';
  if (part.length && part.length !== todas.length && mismoConj(E, part)) return 'exacta';
  if (E.length === 1 && part.length > 1 && part.indexOf(E[0]) >= 0) return 'parcial';
  return '';
}

/** Las filas candidatas de un registro a ±3 días: no Reprogramadas (salvo `conReprog`), de ese funcionario. */
function candidatos(rec, filas, conReprog) {
  const L = ubicLista(rec.lugar), out = [];
  filas.forEach(function (f, i) {
    if (esReprogramada(f) && !conReprog) return;
    const ident = identidad(rec, f);
    if (!ident) return;
    const dias = f.off - rec.off;
    if (Math.abs(dias) > DIAS_MAX) return;
    out.push({ i: i, ident: ident, dias: dias, lug: comparar(L, ubicFila(f)) });
  });
  return out;
}
/** Si alguna cumple `pred` (y no todas), se queda con ésas. */
const preferir = function (lista, pred) {
  if (lista.length <= 1) return lista;
  const s = lista.filter(pred);
  return s.length && s.length < lista.length ? s : lista;
};

/**
 * Qué debería pasar con UN registro, solo (antes del invariante): `{ estado, fila, nivel, ident, rama, aceptan }`.
 * estado: 'cruza' (fila = índice en `filas`, nivel 'misma' | 'distinta') | 'ambiguo' | 'espera' | 'nada'.
 */
function decidir(rec, filas, conReprog) {
  if (rec.off > LISTA_MAX_DIAS) return { estado: 'nada', rama: 'fecha_imposible' };
  if (rec.parteNoReconocida) return { estado: 'nada', rama: 'funcionario_en_parte' };
  const cands = candidatos(rec, filas, conReprog);
  const dia0 = cands.filter(function (c) { return c.dias === 0 && c.lug !== false; });        // las filas de la fecha que el lugar no descarta
  const cerca = cands.filter(function (c) { return c.dias !== 0; });
  const rivales = cerca.filter(function (c) { return c.lug === true && c.ident === 'exacta'; });
  if (dia0.length) {
    // las del día sin lugar comparable y a ±3 una exacta con el lugar: ambiguo (también para Seguridad)
    if (rivales.length && dia0.every(function (c) { return c.lug === null; })) {
      return { estado: 'ambiguo', rama: 'dia_sin_lugar_y_rival', aceptan: rec.off >= 0 ? ['ambiguo', 'espera'] : ['ambiguo'] };
    }
    let c = dia0;
    if (rec.tipo === 'seg') {                                  // Seguridad exige el lugar
      c = c.filter(function (x) { return x.lug === true; });
      if (!c.length) return { estado: 'nada', rama: 'seguridad_sin_lugar' };
    }
    const n0 = c.length;
    c = preferir(c, function (x) { return x.ident === 'exacta'; });
    c = preferir(c, function (x) { return x.lug === true; });
    if (c.length === 1) return { estado: 'cruza', fila: c[0].i, nivel: 'misma', ident: c[0].ident, rama: n0 > 1 ? 'misma_con_desempate' : 'misma_unica' };
    return { estado: 'ambiguo', rama: 'varias_el_mismo_dia' };
  }
  const posibles = cerca.filter(function (c) { return c.lug !== false; });
  const fuertes = posibles.filter(function (c) { return c.lug === true && c.ident === 'exacta'; });
  if (fuertes.length && rec.off >= 0) return { estado: 'espera', rama: 'espera_la_fila_del_dia' };
  if (fuertes.length === 1 && posibles.length === 1) return { estado: 'cruza', fila: fuertes[0].i, nivel: 'distinta', ident: 'exacta', rama: 'fecha_distinta' };
  if (fuertes.length) return { estado: 'ambiguo', rama: 'varias_posibles_a_3_dias' };
  if (!cands.length) return { estado: 'nada', rama: 'sin_candidatas' };
  if (posibles.some(function (c) { return c.lug === true && c.ident === 'parcial'; })) return { estado: 'nada', rama: 'solo_conjunta_parcial' };
  if (posibles.length) return { estado: 'nada', rama: 'a_3_dias_sin_lugar' };
  return { estado: 'nada', rama: 'a_3_dias_otro_lugar' };
}

/**
 * Dónde escribe una corrida: sólo en filas cuya reunión YA PASÓ (FECHA anterior a hoy: antes puede faltar la fila buena y el ID
 * quedaría para siempre en otra) y, la de la hora, sólo en las activas (de hoy − 30 en adelante); el historial, en todas las que pasaron.
 */
const enAlcance = function (f, alcance) {
  if (f.off >= 0) return false;
  return alcance === 'historial' ? true : f.off >= ACTIVAS_DESDE;
};

/**
 * El invariante y el alcance, sobre las decisiones de cada registro (`solo`): devuelve `{ escribe: { marcador: ID }, estado }`.
 *   0. el mismo ID más de una vez en la lista: con los mismos datos (o la misma fila) vale uno, el de mejor cruce; con datos
 *      distintos, ninguno;
 *   1. el ID ya está en la base: no se escribe;
 *   2. la fila ya tiene otro ID: no se toca;
 *   3. dos IDs para la misma fila: gana la misma fecha sobre la distinta y la figura exacta sobre la conjunta; si empatan, ninguno;
 *   4. lo que queda se escribe si la fila entra en el alcance de la corrida.
 */
function correrOraculo(esc, alcance, solo) {
  const recs = esc.recs, filas = esc.filas;
  const estado = recs.map(function () { return null; });
  const rango = function (k) { return solo[k].estado === 'cruza' ? (solo[k].nivel === 'misma' ? 2 : 0) + (solo[k].ident === 'exacta' ? 1 : 0) : -1; };
  const grupos = {};
  // el orden en que se lee la lista: primero Agenda JM, después Agenda funcionarios (y en cada una, de arriba abajo)
  const ordenLista = function (k) { return (recs[k].hoja === 'jm' ? 0 : 1) * 1000 + k; };
  recs.forEach(function (r, k) { (grupos[U(r.id)] = grupos[U(r.id)] || []).push(k); });
  Object.keys(grupos).forEach(function (id) {
    const g = grupos[id].sort(function (a, b) { return ordenLista(a) - ordenLista(b); });
    if (g.length < 2) return;
    const firma = function (k) {
      if (solo[k].estado === 'cruza') return 'fila ' + solo[k].fila;
      return [recs[k].tipo === 'seg' ? 'seguridad' : recs[k].figuras.map(sinTildes).sort().join('+'), recs[k].off, sinTildes(recs[k].lugar)].join('|');
    };
    const iguales = g.every(function (k) { return firma(k) === firma(g[0]); });
    if (iguales) {
      const queda = g.reduce(function (m, k) { return rango(k) > rango(m) ? k : m; }, g[0]);
      g.forEach(function (k) { if (k !== queda) estado[k] = 'repetido'; });
    } else g.forEach(function (k) { estado[k] = 'id_repetido'; });
  });
  recs.forEach(function (r, k) {
    if (estado[k]) return;
    if (filas.some(function (f) { return f.idPrevio && U(f.idPrevio) === U(r.id); })) estado[k] = 'id_en_la_base';
  });
  recs.forEach(function (r, k) {
    if (estado[k] || solo[k].estado !== 'cruza') return;
    const f = filas[solo[k].fila];
    if (f.idPrevio && U(f.idPrevio) !== U(r.id)) estado[k] = 'fila_con_otro_id';
  });
  const porFila = {};
  recs.forEach(function (r, k) {
    if (estado[k] || solo[k].estado !== 'cruza') return;
    (porFila[solo[k].fila] = porFila[solo[k].fila] || []).push(k);
  });
  Object.keys(porFila).forEach(function (i) {
    const l = porFila[i];
    if (l.length < 2) return;
    const max = Math.max.apply(null, l.map(rango));
    const mejores = l.filter(function (k) { return rango(k) === max; });
    if (mejores.length === 1) l.forEach(function (k) { if (k !== mejores[0]) estado[k] = 'fila_tomada'; });
    else l.forEach(function (k) { estado[k] = 'fila_disputada'; });
  });
  const escribe = {};
  recs.forEach(function (r, k) {
    if (estado[k]) return;
    if (solo[k].estado !== 'cruza') { estado[k] = 'no_cruza'; return; }
    const f = filas[solo[k].fila];
    if (!enAlcance(f, alcance)) { estado[k] = 'fuera_de_alcance'; return; }
    estado[k] = 'escribe';
    escribe[f.m] = U(r.id);
  });
  return { escribe: escribe, estado: estado };
}

/** Las condiciones P0..P7 de un cruce (registro `r` con la fila `f`): `{ viol, tags }`. Sólo clasifica filas; no decide el cruce. */
function condiciones(r, f, filas) {
  const viol = [], tags = [];
  const t = function (tag, malo, msg) { tags.push(tag); if (malo) viol.push({ tag: tag, msg: msg }); };
  const dias = f.off - r.off;
  const lug = comparar(ubicLista(r.lugar), ubicFila(f)), ident = identidad(r, f);
  const cands = candidatos(r, filas);
  const dia0 = cands.filter(function (c) { return c.dias === 0 && c.lug !== false; });
  const cerca = cands.filter(function (c) { return c.dias !== 0; });
  const posibles = cerca.filter(function (c) { return c.lug !== false; });
  const rivales = cerca.filter(function (c) { return c.lug === true && c.ident === 'exacta'; });
  const donde = 'cruzó ' + r.id + ' con la fila ' + f.m + ' (' + (dias === 0 ? 'misma fecha' : 'fecha distinta, ' + signo(dias) + ' días') + ')';
  t('P0', Math.abs(dias) > DIAS_MAX || !ident, donde + (Math.abs(dias) > DIAS_MAX ? ': a más de ±3 días' : !ident ? ': la fila no es de ese funcionario' : ''));
  t('P6', esReprogramada(f), donde + ': la fila está Reprogramada');
  t('P4', lug === false, donde + ': el lugar de la fila está en DESACUERDO con el de la lista');
  if (r.tipo === 'seg') t('P5', lug !== true, donde + ': Seguridad, y el lugar no coincide (' + (lug === null ? 'no comparable' : 'desacuerdo') + ')');
  if (dias !== 0) {
    t('P1', posibles.length !== 1, donde + ': ' + posibles.length + ' filas posibles a ±1..3 días (' + posibles.map(function (c) { return filas[c.i].m; }).join(', ') + ')');
    t('P2', r.off >= 0, donde + ': la fecha planeada (' + fmtDia(r.off) + ') es hoy o futura');
    t('P3', lug !== true || ident !== 'exacta', donde + ': lugar ' + (lug === true ? 'que coincide' : lug === null ? 'no comparable' : 'en desacuerdo') + ', identidad ' + ident);
    t('P7', dia0.length > 0, donde + ': había ' + dia0.length + ' fila(s) posible(s) el mismo día (' + dia0.map(function (c) { return filas[c.i].m; }).join(', ') + ')');
  } else {
    t('P7', dia0.length > 0 && rivales.length > 0 && dia0.every(function (c) { return c.lug === null; }),
      donde + ': las filas del día no tienen lugar comparable y a ±3 hay una exacta con el lugar (' + rivales.map(function (c) { return filas[c.i].m; }).join(', ') + '): era ambiguo');
  }
  return { viol: viol, tags: tags };
}

// ===================================================================================================================
// El generador de escenarios
// ===================================================================================================================

function fechaPlaneada(A, modo) {
  if (modo === 'futura') return A.pickW([[0, 24], [1, 12], [2, 10], [3, 8], [4, 6], [6, 6], [7, 6], [8, 12], [9, 8], [15, 8], [30, 8], [180, 5]]);   // hasta más allá de hoy + 7
  const r = A.r();
  if (r < 0.03) return A.pick([180, 181, 181, 190, 250]);      // 180 días todavía vale; más, es un error de tipeo
  if (r < 0.10) return A.pick([0, 0, 1, 2, 5]);               // hoy / futura
  if (r < 0.25) return -A.int(26, 36);                          // el borde de las activas (hoy − 30)
  return -A.int(1, 40);
}
function lugarDeLista(A, tipo) {
  const r = A.r();
  const comuna = function () { return A.pick(['Comuna ' + A.pick(COMUNAS_USADAS), 'C' + A.pick(COMUNAS_USADAS)]); };
  const barrio = function () {
    const b = A.pick(BARRIOS);
    return A.pickW([[b, 80], [sinTildes(b), 10], [b.toUpperCase(), 10]]);
  };
  const dosBarrios = function () {
    const a = A.pick(BARRIOS), mismos = BARRIOS.filter(function (b) { return b !== a && COMUNA_DE[b] === COMUNA_DE[a]; });
    const b = mismos.length && A.chance(0.7) ? A.pick(mismos) : A.pick(BARRIOS.filter(function (x) { return x !== a; }));
    const par = a + A.pick([' y ', ' / ']) + b;
    return A.chance(0.3) ? 'Comuna ' + COMUNA_DE[a] + ' (' + par + ')' : par;
  };
  if (r < 0.05) return dosBarrios();                           // 'Barracas y La Boca', 'Comuna 4 (Barracas y La Boca)', 'Belgrano / Flores'
  if (tipo === 'seg') return r < 0.62 ? comuna() : r < 0.82 ? barrio() : r < 0.90 ? '' : r < 0.95 ? 'Sin definir' : 'Eje ' + A.pick(EJES);
  if (r < 0.46) return barrio();
  if (r < 0.70) return comuna();
  if (r < 0.85) return '';
  if (r < 0.91) return 'Sin definir';
  if (r < 0.95) return '-';
  return 'Eje ' + A.pick(EJES);
}
function textoFuncionario(A, rec) {
  if (rec.tipo === 'seg') return A.pick(['Seguridad en tu barrio', 'SEGURIDAD EN TU BARRIO', 'Seguridad en tu Barrio']);
  if (rec.hoja === 'jm') return A.pick(['Jorge Macri', '', 'JM', 'Jorge Macri']);
  const orden = A.shuffle(rec.figuras);
  if (orden.length === 1) { const n = orden[0]; return A.pickW([[n, 70], [n.toLowerCase(), 10], [sinTildes(n), 10], [n.toUpperCase(), 10]]); }
  return orden.join(A.pick([', ', ' y ', ' / ', ' - ', '; ', ' + ']));
}
function deltaFila(A, modo) {
  const pesos = modo === 'cerca' ? [[0, 6], [1, 22], [2, 24], [3, 22], [4, 8], [6, 7]]
              : modo === 'dia' ? [[0, 40], [1, 12], [2, 12], [3, 12], [4, 6], [6, 6]]
              : [[0, 24], [1, 14], [2, 14], [3, 14], [4, 6], [6, 8]];
  const d = A.pickW(pesos);
  const mag = d === 6 ? A.int(5, 8) : d;
  return A.chance(0.5) ? mag : -mag;
}
/** El conjunto de figuras de una fila, relativo al del registro (igual, con una de más, con una de menos, otra, una sola). */
function conjuntoFila(A, rec) {
  const E = rec.tipo === 'seg' ? [A.pick(FIGURAS)] : rec.figuras;
  const otros = FIGURAS.filter(function (f) { return E.indexOf(f) < 0; });
  const k = A.pickW([['igual', 48], ['sup', 14], ['sub', 8], ['otra', 14], ['uno', 16]]);
  if (k === 'igual') return A.shuffle(E);
  if (k === 'sup') return E.length < 3 && otros.length ? A.shuffle(E.concat(A.sample(otros, 1))) : A.shuffle(E);
  if (k === 'sub') return E.length > 1 ? A.shuffle(A.sample(E, E.length - 1)) : A.shuffle(E);
  if (k === 'uno') return [A.pick(E)];
  return A.shuffle(A.sample(FIGURAS, A.int(1, 2)));
}
/** El barrio y el "Lugar (mail)" de una fila, relativos al lugar de la lista. */
function lugarFila(A, rec, f) {
  const L = ubicLista(rec.lugar);
  const rel = A.pickW([['igual', 36], ['mismaComuna', 8], ['otra', 20], ['vacio', 36]]);
  const delaComuna = function (c) { return BARRIOS.filter(function (b) { return COMUNA_DE[b] === c; }); };
  let barrio = '';
  if (rel === 'igual') barrio = L.barrio || (L.comuna != null ? A.pick(delaComuna(L.comuna)) : A.pick(BARRIOS));
  else if (rel === 'mismaComuna') {
    const otros = L.comuna != null ? delaComuna(L.comuna).filter(function (b) { return b !== L.barrio; }) : [];
    barrio = otros.length ? A.pick(otros) : A.pick(BARRIOS);
  } else if (rel === 'otra') barrio = A.pick(BARRIOS.filter(function (b) { return L.comuna == null || COMUNA_DE[b] !== L.comuna; }));
  f.barrio = barrio;
  const cap = function (e) { return e.charAt(0).toUpperCase() + e.slice(1); };
  if (!barrio) {
    const c = L.comuna != null ? L.comuna : A.pick(COMUNAS_USADAS);
    f.lugarMail = A.pickW([['', 38], ['Comuna ' + c, 22], ['Comuna ' + A.pick(COMUNAS_USADAS.filter(function (x) { return x !== c; })), 14],
                           [L.barrio || A.pick(BARRIOS), 8], [A.pick(BARRIOS), 6], ['Eje ' + cap(L.eje || A.pick(EJES).toLowerCase()), 12]]);
  } else if (A.chance(0.12)) {
    f.lugarMail = A.pick(['Comuna ' + A.pick(COMUNAS_USADAS), 'Eje ' + A.pick(EJES), A.pick(BARRIOS)]);
  }
}
function generarFila(A, rec, modo, m) {
  const f = { m: m, figura: '', conjunta: [], noPart: [], barrio: '', lugarMail: '', status: '', evento: 'Encuentro con Vecinos', eventoMail: '',
              off: rec.off + deltaFila(A, modo), idPrevio: '' };
  const esSeg = rec.tipo === 'seg' ? A.chance(0.8) : A.chance(0.07);
  if (esSeg) {
    const donde = A.pickW([['evento', 40], ['mail', 40], ['ambos', 20]]);
    f.evento = donde === 'mail' ? 'Encuentro con Vecinos' : 'Seguridad en tu Barrio';
    f.eventoMail = donde === 'evento' ? '' : 'Seguridad en tu Barrio';
    if (A.chance(rec.tipo === 'seg' ? 0.2 : 0.6)) f.figura = (rec.tipo === 'fig' && A.chance(0.6)) ? A.pick(rec.figuras) : A.pick(FIGURAS);
  } else {
    const set = conjuntoFila(A, rec);
    f.figura = set[0]; f.conjunta = set.slice(1);
    if (set.length >= 2 && A.chance(0.18)) f.noPart = [A.pick(set)];
    f.evento = A.pick(['Encuentro con Vecinos', 'Encuentro con Vecinos', 'Uno a uno', 'Primera Persona']);
  }
  lugarFila(A, rec, f);
  f.status = A.pickW([['', 34], ['en agenda', 20], ['Realizada', 16], ['Suspendida', 10], ['Reprogramada', modo === 'reprog' ? 40 : 8]]);
  if (f.status === 'Reprogramada' && A.chance(0.2)) f.status = A.pick([' reprogramada ', 'REPROGRAMADA']);
  return f;
}
/** Una fila del funcionario del registro `rec` (su figura o Seguridad) en el día `off`, con su lugar (barrio o comuna del mail) o sin lugar alguno. */
function filaDelFuncionario(A, rec, m, off, conLugar) {
  const f = generarFila(A, rec, 'azar', m), L = ubicLista(rec.lugar);
  Object.assign(f, { figura: '', conjunta: [], noPart: [], barrio: '', lugarMail: '', evento: 'Encuentro con Vecinos', eventoMail: '', status: A.pick(['', 'en agenda', 'Realizada']), off: off, idPrevio: '' });
  if (rec.tipo === 'seg') f.evento = 'Seguridad en tu Barrio';
  else { f.figura = rec.figuras[0]; f.conjunta = rec.figuras.slice(1); }
  if (conLugar) { if (L.barrio) f.barrio = L.barrio; else if (L.comuna != null) f.lugarMail = 'Comuna ' + L.comuna; }
  return f;
}
/** Un registro más, para el invariante: el mismo ID (igual o con otros datos), la misma figura u otra. */
function recExtra(A, rec0, idx, k) {
  const tipo = A.pickW([['dup_igual', 14], ['dup_distinto', 12], ['misma', 48], ['otra', 26]]);
  let r;
  if (tipo === 'dup_igual') {
    r = Object.assign(clon(rec0), { id: A.chance(0.4) ? rec0.id.toLowerCase() : rec0.id });
    if (r.tipo === 'fig' && r.figuras.length === 1 && r.figuras[0] === 'Jorge Macri' && A.chance(0.4)) {     // el mismo ID en la otra solapa
      r.hoja = r.hoja === 'jm' ? 'fun' : 'jm';
      r.texto = textoFuncionario(A, r);
      delete r.parteNoReconocida;
    }
  }
  else if (tipo === 'dup_distinto') {
    r = Object.assign(clon(rec0), { off: rec0.off + A.pick([-3, -2, -1, 1, 2, 4]) });
    if (A.chance(0.4)) r.lugar = lugarDeLista(A, rec0.tipo);
  } else if (tipo === 'misma') {
    r = Object.assign(clon(rec0), { id: 'Z' + idx + '-' + k, off: rec0.off + A.pick([-3, -2, -1, 0, 0, 1, 2, 3]) });
    delete r.parteNoReconocida;   // el texto se vuelve a armar: ya no trae la parte que no se reconoce
    if (A.chance(0.5)) r.lugar = lugarDeLista(A, rec0.tipo);
    r.texto = textoFuncionario(A, r);
  } else {
    const t2 = A.chance(0.25) ? 'seg' : 'fig';
    r = { id: 'Z' + idx + '-' + k, tipo: t2, figuras: t2 === 'seg' ? [] : A.sample(FIGURAS, A.pickW([[1, 80], [2, 20]])), lugar: lugarDeLista(A, t2),
          off: rec0.off + A.int(-3, 3), hoja: 'fun' };
    r.texto = textoFuncionario(A, r);
  }
  return r;
}
function generarEscenario(semilla, idx) {
  const A = crearAzar(mezclar(semilla, idx));
  const modo = A.pickW([['azar', 14], ['cerca', 20], ['dia', 11], ['seg', 13], ['conj', 10], ['futura', 11], ['reprog', 7], ['tomada', 8], ['rival', 6]]);
  const tipo = modo === 'seg' || (modo === 'rival' && A.chance(0.5)) ? 'seg' : 'fig';
  const nFig = modo === 'conj' ? A.pick([2, 2, 3]) : A.pickW([[1, 85], [2, 10], [3, 5]]);
  const figuras = tipo === 'seg' ? [] : A.sample(FIGURAS, nFig);
  const hoja = (tipo === 'fig' && figuras.length === 1 && figuras[0] === 'Jorge Macri' && A.chance(0.35)) ? 'jm' : 'fun';
  const rec0 = { id: 'Z' + idx + '-0', tipo: tipo, figuras: figuras, lugar: lugarDeLista(A, tipo), off: fechaPlaneada(A, modo), hoja: hoja };
  rec0.texto = textoFuncionario(A, rec0);
  if (tipo === 'fig' && hoja === 'fun' && A.chance(0.04)) { rec0.texto += ', Fulano De Tal'; rec0.parteNoReconocida = true; }
  const recs = [rec0];
  if (modo === 'rival') {
    // la fila del día SIN lugar y una exacta a ±1..3 días CON el lugar (para una figura y para Seguridad): ambiguo
    rec0.lugar = tipo === 'seg' ? 'Comuna ' + A.pick(COMUNAS_USADAS) : A.pick(BARRIOS); rec0.off = -A.int(4, 40); rec0.texto = textoFuncionario(A, rec0);
    delete rec0.parteNoReconocida;
  }
  if (modo === 'tomada') {
    // dos registros de la misma figura, con la fecha planeada a ±1..3 días, y UNA fila el día del primero: para el primero es la misma
    // fecha y para el segundo, fecha distinta (se disputan la fila: gana el primero)
    rec0.lugar = A.pick(BARRIOS); rec0.off = -A.int(4, 40); rec0.texto = textoFuncionario(A, rec0);
    delete rec0.parteNoReconocida;   // el texto se volvió a armar: ya no trae la parte que no se reconoce
    recs.push(Object.assign(clon(rec0), { id: 'Z' + idx + '-1', off: rec0.off + A.pick([-3, -2, -1, 1, 2, 3]) }));
  } else if (A.chance(0.42)) { const n = A.chance(0.7) ? 1 : 2; for (let k = 1; k <= n; k++) recs.push(recExtra(A, rec0, idx, k)); }
  const filas = [];
  const nFilas = A.int(2, 8);
  if (modo === 'rival') {
    filas.push(filaDelFuncionario(A, rec0, 'm0', rec0.off, false));
    filas.push(filaDelFuncionario(A, rec0, 'm1', rec0.off + A.pick([-3, -2, -1, 1, 2, 3]), true));
  }
  if (modo === 'tomada') {
    const a = generarFila(A, rec0, 'azar', 'm0');
    Object.assign(a, { figura: rec0.figuras[0], conjunta: [], noPart: [], barrio: rec0.lugar, lugarMail: '', evento: 'Encuentro con Vecinos', eventoMail: '',
                       status: A.pick(['', 'en agenda', 'Realizada']), off: rec0.off });
    filas.push(a);
  }
  for (let i = filas.length; i < nFilas; i++) filas.push(generarFila(A, A.chance(0.30) && recs.length > 1 ? A.pick(recs.slice(1)) : rec0, modo, 'm' + i));
  const usados = {};
  filas.forEach(function (f, i) {
    if (!A.chance(0.07)) return;
    const id = A.chance(0.5) ? (A.chance(0.3) ? A.pick(recs).id.toLowerCase() : A.pick(recs).id) : 'OTRO-' + i;
    if (usados[U(id)]) return;
    usados[U(id)] = true;
    f.idPrevio = id;
  });
  return { semilla: semilla, idx: idx, modo: modo, recs: recs, filas: filas };
}

// ===================================================================================================================
// El entorno (Apps Script simulado) y lo que se observa
// ===================================================================================================================
const EXTRA = ['ID cuentas', 'Fecha envío campañas'];
const HB = hdrBase(EXTRA);
const GRUPOS_FUN = ['Información del encuentro', '', '', '', 'Mail', '', ''];
const ENC_FUN = ['ID', 'Funcionario', 'Barrio / Comuna', 'Fecha', 'Fecha de envío', 'Enviados', 'Entregados'];
const GRUPOS_JM = ['', '', '', '', '', 'Comunicación Directa - Mail', '', ''];
const ENC_JM = ['ID', 'Funcionario', 'Barrio / Comuna', 'Tipo', 'Fecha', 'Fecha de envío', 'Enviados', 'Entregados'];

function filaArray(f, k) {
  return filaBase({
    Figura: f.figura, Barrio: f.barrio, EVENTO: f.evento, FECHA: dia(f.off + (k || 0)), 'STATUS REUNIÓN': f.status, 'Conjunta con': f.conjunta.join(' / '),
    'No participa': f.noPart.join(' / '), 'Lugar (mail)': f.lugarMail, 'Evento (mail)': f.eventoMail, Observaciones: f.m, 'ID cuentas': f.idPrevio
  }, HB);
}
/**
 * El entorno de un escenario. `o.barajar`: una semilla para barajar el orden de las filas de la base y de los registros de la
 * lista. `o.desplazar`: corre TODO `k` días (las fechas de la base y de la lista y el reloj). Devuelve `{ E, filaLista }`:
 * `filaLista['<solapa>|<fila de la lista>']` = índice del registro. `o.reloj`: adelanta SÓLO el reloj `o.reloj` días (la lista y la base
 * quedan como están): una corrida posterior.
 */
function armarEntorno(esc, o) {
  o = o || {};
  const az = o.barajar != null ? crearAzar(o.barajar) : null;
  // las filas de relleno (lejanas, de enero) para que el cruce conozca las cuatro figuras por la columna Figura de la base
  const rellenos = FIGURAS.map(function (fig, i) {
    return filaBase({ Figura: fig, Barrio: 'Palermo', EVENTO: 'Encuentro con Vecinos', FECHA: new Date(2026, 0, 15, 12, 0, 0), Observaciones: 'fill' + i }, HB);
  });
  const k = o.desplazar || 0;
  let filas = esc.filas.map(function (f) { return filaArray(f, k); }).concat(rellenos);
  let recs = esc.recs.map(function (r, k) { return { r: r, k: k }; });
  if (az) { filas = az.shuffle(filas); recs = az.shuffle(recs); }
  const fun = [GRUPOS_FUN.slice(), ENC_FUN.slice()], jm = [GRUPOS_JM.slice(), ENC_JM.slice()];
  const filaLista = {};
  recs.forEach(function (x) {
    const r = x.r, hoja = r.hoja === 'jm' ? jm : fun;
    hoja.push(r.hoja === 'jm' ? [r.id, r.texto, r.lugar, '', dia(r.off + k), '', 1, 1] : [r.id, r.texto, r.lugar, dia(r.off + k), '', 1, 1]);
    filaLista[(r.hoja === 'jm' ? 'Agenda JM' : 'Agenda funcionarios') + '|' + hoja.length] = x.k;
  });
  const E = crearEntornoIds({ base: filas, columnasExtra: EXTRA, jm: jm, funcionarios: fun, hoy: (k || o.reloj) ? new Date(2026, 9, 8 + k + (o.reloj || 0), 21, 0, 0) : undefined });
  return { E: E, filaLista: filaLista };
}
/** Marcador → ID de todas las filas con un ID en la base. */
function leerMapa(E) {
  const v = E.base().valores, h = v[0], iId = h.indexOf('ID cuentas'), iObs = h.indexOf('Observaciones'), out = {};
  for (let i = 1; i < v.length; i++) if (v[i][iId] !== '' && v[i][iId] != null) out[v[i][iObs]] = String(v[i][iId]);
  return out;
}
const marcadorDeFila = function (E, fila) { return E.base().valores[fila - 1][E.base().valores[0].indexOf('Observaciones')]; };
const mapaMayusculas = function (m) { const o = {}; Object.keys(m).forEach(function (k) { o[k] = U(m[k]); }); return o; };
/** Lo que el oráculo espera en la base: lo que ya estaba más lo que se escribe. */
function esperadoCompleto(esc, exp) {
  const m = {};
  esc.filas.forEach(function (f) { if (f.idPrevio) m[f.m] = U(f.idPrevio); });
  Object.keys(exp.escribe).forEach(function (k) { m[k] = exp.escribe[k]; });
  return m;
}
const difMapas = function (esperado, obs) {
  const out = [];
  Object.keys(esperado).forEach(function (k) { if (obs[k] !== esperado[k]) out.push('fila ' + k + ': se esperaba ' + esperado[k] + ' y hay ' + (obs[k] || 'nada')); });
  Object.keys(obs).forEach(function (k) { if (esperado[k] === undefined) out.push('fila ' + k + ': hay ' + obs[k] + ' y no se esperaba nada'); });
  return out;
};

/**
 * Agrega al escenario filas que NO pueden ser candidatas de ningún registro: una copia Reprogramada de cada fila, una fila de una
 * figura que ningún registro nombra (el día de la planeada y en su lugar) y una fila del funcionario del primer registro a 4..8
 * días de la planeada de TODOS los registros (en su lugar). Devuelve la descripción de lo que agregó.
 */
function agregarNoCandidatas(esc) {
  const desc = [], rec0 = esc.recs[0], L = ubicLista(rec0.lugar);
  let n = 0;
  const nueva = function (o) {
    return Object.assign({ m: 'x' + (n++), figura: '', conjunta: [], noPart: [], barrio: '', lugarMail: '', status: '', evento: 'Encuentro con Vecinos', eventoMail: '', off: rec0.off, idPrevio: '' }, o);
  };
  const lugar = { barrio: L.barrio || '', lugarMail: !L.barrio && L.comuna != null ? 'Comuna ' + L.comuna : '' };
  const copias = esc.filas.map(function (f) { return Object.assign(clon(f), { m: 'x' + (n++), status: 'Reprogramada', idPrevio: '' }); });
  copias.forEach(function (f) { esc.filas.push(f); });
  if (copias.length) desc.push(copias.length + ' copias Reprogramadas');
  const usadas = {};
  esc.recs.forEach(function (r) { r.figuras.forEach(function (f) { usadas[f] = true; }); });
  const libre = FIGURAS.filter(function (f) { return !usadas[f]; })[0];
  if (libre) { esc.filas.push(nueva(Object.assign({ figura: libre }, lugar))); desc.push('una fila de ' + libre); }
  const lejos = [4, 5, 6, 7, 8, -4, -5, -6, -7, -8].map(function (d) { return rec0.off + d; }).filter(function (o) {
    return esc.recs.every(function (r) { return Math.abs(o - r.off) >= 4; }) && o <= ACTIVAS_HASTA;
  })[0];
  if (lejos !== undefined) {
    esc.filas.push(nueva(Object.assign(rec0.tipo === 'seg' ? { evento: 'Seguridad en tu Barrio' } : { figura: rec0.figuras[0], conjunta: rec0.figuras.slice(1) }, lugar, { off: lejos })));
    desc.push('una fila del funcionario a ' + signo(lejos - rec0.off) + ' días');
  }
  return desc;
}

// ===================================================================================================================
// La verificación de un escenario
// ===================================================================================================================

/** `modos`: { orden, hora, extra, hoy } (qué corridas extra se hacen). Devuelve `{ viol, cuenta, cob }`. */
function evaluar(esc, modos) {
  const m = modos || { orden: true, hora: true, extra: true, hoy: true };
  const viol = [], cuenta = {}, cob = {};
  const mal = function (tag, msg) { viol.push({ tag: tag, msg: msg }); };
  const chk = function (tag, cond, msg) { cuenta[tag] = (cuenta[tag] || 0) + 1; if (!cond) mal(tag, typeof msg === 'function' ? msg() : msg); };
  const filas = esc.filas, recs = esc.recs;
  const filaPorM = {}; filas.forEach(function (f, i) { filaPorM[f.m] = i; });
  try {
    const solo = recs.map(function (r) { return decidir(r, filas); });
    const expH = correrOraculo(esc, 'historial', solo);
    solo.forEach(function (s, k) { if (k === 0) cob['rama:' + s.rama] = 1; });
    expH.estado.forEach(function (e, k) { cob['inv:' + e] = 1; if (k === 0) cob['inv0:' + e] = 1; });
    // las Reprogramadas cambian el resultado del primer registro (sin la regla serían candidatas)
    const conRep = decidir(recs[0], filas, true);
    if (JSON.stringify([conRep.estado, conRep.fila, conRep.nivel]) !== JSON.stringify([solo[0].estado, solo[0].fila, solo[0].nivel])) cob['reprogramada_cambia'] = 1;

    // --- 1. el historial
    const A = armarEntorno(esc);
    const res = A.E.run('idsHistorial(false)');
    const obs = leerMapa(A.E);
    const catDe = {};     // k → lo que el código dijo del registro después del invariante
    res.items.forEach(function (it) {
      const k = A.filaLista[it.r.solapa + '|' + it.r.filaLista];
      if (k === undefined) { mal('ORAC', 'no se pudo mapear el registro ' + it.r.id + ' (' + it.r.solapa + ' fila ' + it.r.filaLista + ')'); return; }
      const r = recs[k], esp = solo[k], ev = it.ev;
      // (a) el registro solo contra el oráculo
      const cod = ev.estado === 'cruza' ? { estado: 'cruza', m: marcadorDeFila(A.E, ev.e.x.f.fila), nivel: ev.nivel === 'misma_fecha' ? 'misma' : 'distinta' }
                : { estado: ev.estado === 'ambiguo' ? 'ambiguo' : (ev.motivo === 'futura_sin_fila' ? 'espera' : 'nada') };
      let bien;
      if (esp.estado === 'cruza') bien = cod.estado === 'cruza' && cod.m === filas[esp.fila].m && cod.nivel === esp.nivel;
      else if (esp.aceptan) bien = esp.aceptan.indexOf(cod.estado) >= 0;
      else if (esp.estado === 'nada') bien = cod.estado === 'nada' || cod.estado === 'espera';
      else bien = cod.estado === esp.estado;
      chk('ORAC', bien, function () {
        return r.id + ': el código ' + (cod.estado === 'cruza' ? 'cruza con la fila ' + cod.m + ' (' + (cod.nivel === 'misma' ? 'misma fecha' : 'fecha distinta') + ')'
               : 'dice ' + cod.estado + ' (' + (ev.motivo || ev.estado) + ')') + ' y el oráculo ' +
               (esp.estado === 'cruza' ? 'cruza con la fila ' + filas[esp.fila].m + ' (' + (esp.nivel === 'misma' ? 'misma fecha' : 'fecha distinta') + ')' : 'dice ' + esp.estado + ' (' + esp.rama + ')');
      });
      // (a2) lo que pasó con el registro después del invariante, contra el oráculo
      const f = it.final;
      const cat = f.estado === 'escribe' ? 'escribe' : f.estado === 'fuera' ? 'fuera_de_alcance' : f.estado === 'repetido' ? 'repetido'
                : (f.estado === 'ya_estaba' || f.estado === 'ya_en_la_base' || f.motivo === 'id_en_otra_fila') ? 'id_en_la_base'
                : ['fila_con_otro_id', 'fila_tomada', 'fila_disputada', 'id_repetido'].indexOf(f.motivo) >= 0 ? f.motivo : 'no_cruza';
      catDe[k] = cat;
      // (b) las propiedades P0..P7 de cada cruce que el código decide (antes del invariante)
      if (ev.estado === 'cruza') {
        const c = condiciones(r, filas[filaPorM[cod.m]], filas);
        c.tags.forEach(function (tag) { cuenta[tag] = (cuenta[tag] || 0) + 1; });
        c.viol.forEach(function (v) { mal(v.tag, v.msg); });
        if (cod.nivel === 'distinta') cob['cruce_distinta'] = (cob['cruce_distinta'] || 0) + 1;
        if (r.tipo === 'seg') cob['cruce_seguridad'] = (cob['cruce_seguridad'] || 0) + 1;
        if (r.figuras.length > 1) cob['cruce_conjunta'] = (cob['cruce_conjunta'] || 0) + 1;
        if (cod.nivel === 'misma' && r.off >= 0) cob['cruce_misma_futura'] = (cob['cruce_misma_futura'] || 0) + 1;
      }
    });
    // (a3) después del invariante: lo que dijo el código de cada registro contra el oráculo. Un ID repetido en la lista se compara por
    //      grupo (cuál de los repetidos "queda" es un desempate que no cambia lo que se escribe)
    const grupos = {};
    recs.forEach(function (r, k) { (grupos[U(r.id)] = grupos[U(r.id)] || []).push(k); });
    Object.keys(grupos).forEach(function (id) {
      const g = grupos[id];
      const cod = g.map(function (k) { return catDe[k]; }).sort().join(', '), esp = g.map(function (k) { return expH.estado[k]; }).sort().join(', ');
      chk('INV', cod === esp, function () { return 'el ID ' + id + (g.length > 1 ? ' (' + g.length + ' veces en la lista)' : '') + ': después del invariante el código dice [' + cod + '] y el oráculo [' + esp + ']'; });
    });
    // (c) lo que se escribe, con el invariante y el alcance
    chk('INV', difMapas(esperadoCompleto(esc, expH), mapaMayusculas(obs)).length === 0, function () { return difMapas(esperadoCompleto(esc, expH), mapaMayusculas(obs)).join('; '); });
    // P8: un ID en una sola fila; lo cargado no cambia; todo ID escrito sale de un registro que cruzó con esa fila
    const porId = {};
    Object.keys(obs).forEach(function (k) { (porId[U(obs[k])] = porId[U(obs[k])] || []).push(k); });
    Object.keys(porId).forEach(function (id) { chk('P8', porId[id].length === 1, function () { return 'el ID ' + id + ' quedó en ' + porId[id].length + ' filas: ' + porId[id].join(', '); }); });
    filas.forEach(function (f) {
      if (f.idPrevio) chk('P8', obs[f.m] === f.idPrevio, function () { return 'la fila ' + f.m + ' tenía el ID ' + f.idPrevio + ' y ahora tiene ' + (obs[f.m] || 'nada'); });
      else if (obs[f.m] !== undefined) {
        const it = res.items.filter(function (x) { return x.final.estado === 'escribe' && marcadorDeFila(A.E, x.final.fila) === f.m && U(x.r.id) === U(obs[f.m]); })[0];
        chk('P8', !!it, function () { return 'se escribió ' + obs[f.m] + ' en la fila ' + f.m + ' y ningún registro de la lista que cruzó con esa fila tiene ese ID'; });
      }
    });
    Object.keys(obs).forEach(function (k) { if (/^fill/.test(k)) mal('P8', 'se escribió un ID en una fila de relleno (' + k + ')'); });
    // P10d: ninguna corrida escribe una fila cuya reunión todavía no pasó (hoy o futura): esperan a una corrida posterior
    chk('P10d', A.E.base().escrituras.filter(function (e) { return e.fila > 1; }).every(function (e) {
      const f = filas[filaPorM[marcadorDeFila(A.E, e.fila)]];
      return !f || f.off < 0;
    }), 'el historial escribió una fila cuya reunión todavía no pasó (hoy o futura)');
    // --- 2. la segunda corrida no escribe nada
    const n0 = A.E.base().escrituras.length;
    A.E.run('idsHistorial(false)');
    chk('P10a', A.E.base().escrituras.length === n0 && JSON.stringify(leerMapa(A.E)) === JSON.stringify(obs), 'la segunda corrida escribió algo en la base');
    // --- 3. el orden de la lista y de la base no cambia el resultado
    if (m.orden) {
      const B = armarEntorno(esc, { barajar: mezclar(SEMILLA ^ 0x5BD1E995, esc.idx) });
      B.E.run('idsHistorial(false)');
      const dif = difMapas(obs, leerMapa(B.E));         // el texto tal cual: el ID que se escribe tampoco depende del orden
      chk('P9', dif.length === 0, function () { return 'con la lista y la base en otro orden: ' + dif.join('; '); });
    }
    // --- 4. las filas que no son candidatas no cambian nada
    if (m.extra) {
      const esc2 = clon(esc), agregadas = agregarNoCandidatas(esc2);
      const X = armarEntorno(esc2);
      X.E.run('idsHistorial(false)');
      const dif = difMapas(obs, leerMapa(X.E));
      chk('P11', dif.length === 0, function () { return 'agregando filas que no son candidatas (' + agregadas.join(', ') + ') cambió el resultado: ' + dif.join('; '); });
    }
    // --- 5. el resultado no depende de qué día es hoy: se corre TODO k días (la lista, la base y el reloj)
    if (m.hoy) {
      const k = [-45, 23, 61, 120, 200, 400][mezclar(SEMILLA, esc.idx) % 6];
      const Y = armarEntorno(esc, { desplazar: k });
      Y.E.run('idsHistorial(false)');
      const dif = difMapas(obs, leerMapa(Y.E));
      chk('P12', dif.length === 0, function () { return 'corriendo todo ' + signo(k) + ' días (la lista, la base y el reloj) cambió el resultado: ' + dif.join('; '); });
    }
    // --- 6. la hora, y después el historial
    if (m.hora) {
      const C = armarEntorno(esc);
      C.E.run('idsEnLaHora_(false)');
      const dentro = C.E.base().escrituras.filter(function (e) { return e.fila > 1; }).every(function (e) {
        const f = filas[filaPorM[marcadorDeFila(C.E, e.fila)]];
        return f && f.off >= ACTIVAS_DESDE && f.off < 0;
      });
      chk('P10c', dentro, function () {
        return 'la hora escribió fuera de las filas activas que ya pasaron (hoy − 30 a ayer): ' + C.E.base().escrituras.filter(function (e) { return e.fila > 1; }).map(function (e) {
          const f = filas[filaPorM[marcadorDeFila(C.E, e.fila)]]; return f ? f.m + ' (' + fmtDia(f.off) + ')' : '?'; }).join(', ');
      });
      const expC = correrOraculo(esc, 'hora', solo);
      const difC = difMapas(esperadoCompleto(esc, expC), mapaMayusculas(leerMapa(C.E)));
      chk('HORA', difC.length === 0, function () { return 'la corrida de la hora: ' + difC.join('; '); });
      C.E.run('idsHistorial(false)');
      const difH = difMapas(obs, leerMapa(C.E));
      chk('P10b', difH.length === 0, function () { return 'hora + historial ≠ historial solo: ' + difH.join('; '); });
    }
  } catch (err) {
    mal('EXC', 'el código tiró una excepción: ' + (err && err.stack ? String(err.stack).split('\n').slice(0, 3).join(' | ') : err));
  }
  return { viol: viol, cuenta: cuenta, cob: cob };
}

// ===================================================================================================================
// Mostrar un escenario y achicarlo
// ===================================================================================================================
function describir(esc) {
  const L = [];
  L.push('      hoy = 08/10/2026 (día 0) | semilla ' + esc.semilla + ', índice ' + esc.idx + ' (modo ' + esc.modo + ')   → IDS_SEMILLA=' + esc.semilla + ' IDS_SOLO=' + esc.idx);
  esc.recs.forEach(function (r) {
    L.push('      registro ' + r.id + ' [' + (r.hoja === 'jm' ? 'Agenda JM' : 'Agenda funcionarios') + '] Funcionario "' + r.texto + '" | Barrio / Comuna "' + r.lugar +
           '" | Fecha (planeada) ' + fmtDia(r.off) + ' (hoy ' + signo(r.off) + ')');
  });
  esc.filas.forEach(function (f) {
    const rel = signo(f.off - esc.recs[0].off) + ' días de la planeada de ' + esc.recs[0].id;
    L.push('      fila ' + f.m + ': Figura "' + f.figura + '"' + (f.conjunta.length ? ' + Conjunta con "' + f.conjunta.join(' / ') + '"' : '') +
           (f.noPart.length ? ' (No participa: ' + f.noPart.join(' / ') + ')' : '') + ' | Barrio "' + f.barrio + '"' + (f.lugarMail ? ' | Lugar (mail) "' + f.lugarMail + '"' : '') +
           ' | EVENTO "' + f.evento + '"' + (f.eventoMail ? ' | Evento (mail) "' + f.eventoMail + '"' : '') + ' | FECHA ' + fmtDia(f.off) + ' (' + rel + ')' +
           (f.status ? ' | STATUS "' + f.status + '"' : '') + (f.idPrevio ? ' | ya tiene el ID "' + f.idPrevio + '"' : ''));
  });
  return L.join('\n');
}
/** Achica un escenario que viola `tag`: saca registros y filas, y simplifica campos, mientras siga violando lo mismo. */
function achicar(esc, tag) {
  const modos = { orden: tag === 'P9', hora: tag === 'P10b' || tag === 'P10c' || tag === 'HORA', extra: tag === 'P11', hoy: tag === 'P12' };
  const sigue = function (c) { try { return evaluar(c, modos).viol.some(function (v) { return v.tag === tag; }); } catch (e) { return false; } };
  let actual = clon(esc), cambio = true, pruebas = 0;
  while (cambio && pruebas < 250) {
    cambio = false;
    const cands = [];
    for (let k = actual.recs.length - 1; k >= 1; k--) cands.push(function (e) { e.recs.splice(k, 1); });
    for (let i = actual.filas.length - 1; i >= 0; i--) cands.push(function (e) { e.filas.splice(i, 1); });
    actual.filas.forEach(function (f, i) {
      if (f.idPrevio) cands.push(function (e) { e.filas[i].idPrevio = ''; });
      if (f.status) cands.push(function (e) { e.filas[i].status = ''; });
      if (f.lugarMail) cands.push(function (e) { e.filas[i].lugarMail = ''; });
      if (f.noPart.length) cands.push(function (e) { e.filas[i].noPart = []; });
      if (f.conjunta.length) cands.push(function (e) { e.filas[i].conjunta = []; });
      if (f.evento !== 'Encuentro con Vecinos' && !esSeguridad({ evento: f.evento, eventoMail: '' })) cands.push(function (e) { e.filas[i].evento = 'Encuentro con Vecinos'; });
    });
    actual.recs.forEach(function (r, k) {
      if (r.hoja === 'jm') cands.push(function (e) { e.recs[k].hoja = 'fun'; e.recs[k].texto = e.recs[k].figuras[0]; });
      if (r.tipo === 'fig' && r.texto !== r.figuras.join(', ') && !r.parteNoReconocida) cands.push(function (e) { e.recs[k].texto = e.recs[k].figuras.join(', '); });
    });
    for (let c = 0; c < cands.length; c++) {
      pruebas++;
      if (pruebas % 30 === 0) liberar();
      const e2 = clon(actual);
      cands[c](e2);
      if (sigue(e2)) { actual = e2; cambio = true; break; }
    }
  }
  return actual;
}

// ===================================================================================================================
// [1] los casos fijos: la regla escrita, a mano (valida al oráculo y al código contra la misma lista)
// ===================================================================================================================
console.log('[1] casos fijos de la regla (a mano): el oráculo y el código tienen que dar lo que dice la regla');
{
  // El registro: Gabino Tapia, Belgrano, planeado el 05/10/2026 (hoy − 3: ya pasó); `d` = días de la fila respecto de la planeada.
  const REC = function (o) { return Object.assign({ id: 'C-1', tipo: 'fig', figuras: ['Gabino Tapia'], texto: 'Gabino Tapia', lugar: 'Belgrano', off: -3, hoja: 'fun' }, o || {}); };
  const FIL = function (m, d, o, rec) {
    return Object.assign({ m: m, figura: 'Gabino Tapia', conjunta: [], noPart: [], barrio: 'Belgrano', lugarMail: '', status: '', evento: 'Encuentro con Vecinos', eventoMail: '',
                           off: (rec || REC()).off + d, idPrevio: '' }, o || {});
  };
  const SEG = function (m, d, o) { return FIL(m, d, Object.assign({ figura: '', barrio: '', evento: 'Seguridad en tu Barrio', lugarMail: 'Comuna 4' }, o || {}), SEGR()); };
  const SEGR = function (o) { return REC(Object.assign({ tipo: 'seg', figuras: [], texto: 'Seguridad en tu barrio', lugar: 'Comuna 4' }, o || {})); };
  const CJ = function (m, d, o) { return FIL(m, d, Object.assign({ figura: 'Hernán Lombardi', conjunta: ['Gabino Tapia', 'Gustavo Arengo Piragine'], barrio: 'Núñez' }, o || {})); };
  /** Corre el código y el oráculo; `esperado` = { escribe: { marcador: ID }, clase }. */
  const caso = function (titulo, rec, filas, esperado, esBug) {
    const esc = { semilla: 0, idx: 0, modo: 'fijo', recs: [rec], filas: filas };
    const A = armarEntorno(esc);
    const res = A.E.run('idsHistorial(false)');
    const obs = mapaMayusculas(leerMapa(A.E));
    const solo = decidir(rec, filas), exp = correrOraculo(esc, 'historial', [solo]);
    const it = res.items[0];
    const claseCod = it.ev.estado === 'cruza' ? 'cruza' : it.ev.estado === 'ambiguo' ? 'ambiguo' : it.ev.motivo === 'futura_sin_fila' ? 'espera' : 'nada';
    const esp = {}; Object.keys(esperado.escribe).forEach(function (k) { esp[k] = U(esperado.escribe[k]); });
    const clase = esperado.clase || (Object.keys(esp).length ? 'cruza' : 'nada');
    const aceptaOraculo = solo.estado === clase || (clase === 'nada' && solo.estado === 'ambiguo' && esperado.cualquierNoEscritura) || (solo.aceptan && solo.aceptan.indexOf(clase) >= 0);
    // el oráculo contra la regla escrita
    ok(JSON.stringify(exp.escribe) === JSON.stringify(esp) && (aceptaOraculo || esperado.cualquierNoEscritura),
       '(oráculo) ' + titulo + (JSON.stringify(exp.escribe) === JSON.stringify(esp) ? '' : '  → el oráculo escribe ' + JSON.stringify(exp.escribe)));
    // el código contra la regla escrita
    const iguales = JSON.stringify(obs) === JSON.stringify(esp) && (esperado.cualquierNoEscritura || claseCod === clase || (clase === 'nada' && claseCod === 'espera'));
    (esBug ? bug : ok)(iguales, (esBug ? '// BUG: ' : '(código)  ') + titulo + (iguales ? '' : '  → el código escribe ' + JSON.stringify(obs) + ' y dice "' + (it.ev.motivo || it.ev.estado) + '"'));
    return { esc: esc, A: A, res: res };
  };
  // --- la regla de ±3
  caso('−2 días, UNA fila de la figura con el barrio exacto, planeada ya pasada → cruza por fecha distinta', REC(), [FIL('a', -2)], { escribe: { a: 'C-1' } });
  caso('+3 días: cruza (el borde; la planeada es el 02/10 y la fila el 05/10, que ya pasó)', REC({ off: -6 }), [FIL('a', 3, {}, REC({ off: -6 }))], { escribe: { a: 'C-1' } });
  caso('−3 días: cruza (el borde)', REC(), [FIL('a', -3)], { escribe: { a: 'C-1' } });
  caso('±4 días: no cruza', REC(), [FIL('a', 4), FIL('b', -4)], { escribe: {} });
  caso('dos filas posibles (−2 y +2, las dos de Belgrano) → ambiguo, no se escribe', REC(), [FIL('a', -2), FIL('b', 2)], { escribe: {}, clase: 'ambiguo' });
  caso('una fuerte (−2) y otra posible a +1 sin lugar comparable (sin barrio) → ambiguo', REC(), [FIL('a', -2), FIL('b', 1, { barrio: '' })], { escribe: {}, clase: 'ambiguo' });
  caso('una fuerte (−2) y otra a +1 en OTRO barrio (el lugar la descarta) → cruza la fuerte', REC(), [FIL('a', -2), FIL('b', 1, { barrio: 'Flores' })], { escribe: { a: 'C-1' } });
  caso('una fuerte (−2) y una conjunta donde está (parcial, +1) con el lugar → dos posibles → ambiguo', REC(), [FIL('a', -2), CJ('b', 1, { barrio: 'Belgrano' })], { escribe: {}, clase: 'ambiguo' });
  caso('sólo una conjunta donde está (parcial) a −2 con el lugar que coincide: no alcanza', REC({ lugar: 'Núñez' }), [CJ('a', -2)], { escribe: {} });
  caso('±2 con el lugar que no se puede comparar (la fila sin barrio): no cruza', REC(), [FIL('a', -2, { barrio: '' })], { escribe: {} });
  caso('±2 y la fila en OTRO barrio: no cruza', REC(), [FIL('a', -2, { barrio: 'Flores' })], { escribe: {} });
  caso('la lista sin lugar y una fila a −2: el lugar no se puede comparar, no cruza', REC({ lugar: '' }), [FIL('a', -2)], { escribe: {} });
  caso('el barrio de la lista y de la fila son de la misma comuna pero DISTINTOS (Belgrano / Núñez): barrio con barrio, desacuerdo', REC(), [FIL('a', -2, { barrio: 'Núñez' })], { escribe: {} });
  caso('lista "Comuna 13" y fila de Belgrano a −2: la comuna coincide → cruza', REC({ lugar: 'Comuna 13' }), [FIL('a', -2)], { escribe: { a: 'C-1' } });
  caso('fila sin barrio con "Lugar (mail)" Comuna 13 a −2, lista Belgrano: coincide por comuna → cruza', REC(), [FIL('a', -2, { barrio: '', lugarMail: 'Comuna 13' })], { escribe: { a: 'C-1' } });
  caso('fila sin barrio con "Lugar (mail)" Comuna 7 a −2, lista Belgrano: desacuerdo → no cruza', REC(), [FIL('a', -2, { barrio: '', lugarMail: 'Comuna 7' })], { escribe: {} });
  // --- la fecha planeada
  caso('planeada HOY y una fila a −2: se espera la fila de hoy', REC({ off: 0 }), [FIL('a', -2, {}, REC({ off: 0 }))], { escribe: {}, clase: 'espera' });
  caso('planeada MAÑANA y una fila a +2: se espera', REC({ off: 1 }), [FIL('a', 2, {}, REC({ off: 1 }))], { escribe: {}, clase: 'espera' });
  caso('planeada AYER y una fila a −2: ya pasó → cruza', REC({ off: -1 }), [FIL('a', -2, {}, REC({ off: -1 }))], { escribe: { a: 'C-1' } });
  // (planeada HOY y la fila del día: cruza por la misma fecha —la espera es sólo para ±3—, pero el ID no se escribe hasta que la reunión pase: abajo)
  // --- el mismo día
  caso('la fila del día con el lugar: es ésa (la de −2 no se mira)', REC(), [FIL('a', 0), FIL('b', -2)], { escribe: { a: 'C-1' } });
  caso('la del día en OTRO lugar y la de −2 con el lugar: cruza la de −2 (la del día no cuenta)', REC(), [FIL('a', 0, { barrio: 'Flores' }), FIL('b', -2)], { escribe: { b: 'C-1' } });
  caso('la del día sin lugar comparable y a −2 una exacta con el lugar: ambiguo', REC(), [FIL('a', 0, { barrio: '' }), FIL('b', -2)], { escribe: {}, clase: 'ambiguo' });
  caso('la del día sin lugar comparable y la de −2 en otro lugar: cruza la del día', REC(), [FIL('a', 0, { barrio: '' }), FIL('b', -2, { barrio: 'Flores' })], { escribe: { a: 'C-1' } });
  caso('dos del día, una sin lugar y otra que coincide, y una a −2: la del día que coincide', REC(), [FIL('a', 0, { barrio: '' }), FIL('b', 0), FIL('c', -2)], { escribe: { b: 'C-1' } });
  caso('la propia y una conjunta donde está, las dos del día: la propia (figura exacta)', REC(), [CJ('a', 0, { barrio: 'Belgrano' }), FIL('b', 0)], { escribe: { b: 'C-1' } });
  caso('sólo una conjunta donde está, el mismo día: cruza (parcial, sólo el mismo día)', REC({ lugar: 'Núñez' }), [CJ('a', 0)], { escribe: { a: 'C-1' } });
  // DISCUTIBLE: "una conjunta donde está (sólo el mismo día, y si no hay una fila propia)". El código entiende "propia" como una fila
  // propia del mismo día: con la propia a −2 días y una conjunta donde está el día de la lista, cruza con la CONJUNTA (misma fecha). Si la
  // regla quiere que una propia a ±3 con el lugar le gane a la conjunta del día, hay que invertir este chequeo (y `decidir`).
  caso('DISCUTIBLE: la propia a −2 (con el lugar) y una conjunta donde está el día de la lista (con el lugar): cruza con la conjunta del día',
       REC(), [FIL('a', -2), CJ('b', 0, { barrio: 'Belgrano' })], { escribe: { b: 'C-1' } });
  // --- Reprogramada
  caso('una Reprogramada el día de la lista y la nueva a +2: cruza la nueva (±3)', REC(), [FIL('a', 0, { status: 'Reprogramada' }), FIL('b', 2, { status: 'en agenda' })], { escribe: { b: 'C-1' } });
  caso('una Reprogramada a −2 sola: no es candidata', REC(), [FIL('a', -2, { status: 'Reprogramada' })], { escribe: {} });
  caso('una Reprogramada y otra del mismo día: cruza la otra', REC(), [FIL('a', 0, { status: ' reprogramada ' }), FIL('b', 0)], { escribe: { b: 'C-1' } });
  caso('una Suspendida SÍ es candidata', REC(), [FIL('a', -2, { status: 'Suspendida' })], { escribe: { a: 'C-1' } });
  // --- Seguridad
  caso('Seguridad: una fila de la comuna a −2 (UNA posible) → cruza por fecha distinta', SEGR(), [SEG('a', -2)], { escribe: { a: 'C-1' } });
  caso('Seguridad: el mismo día con la comuna → misma fecha', SEGR(), [SEG('a', 0)], { escribe: { a: 'C-1' } });
  caso('Seguridad: una fila de OTRA comuna a −2 → no cruza', SEGR(), [SEG('a', -2, { lugarMail: 'Comuna 9' })], { escribe: {} });
  caso('Seguridad: una fila a −2 sin lugar → no cruza (exige lugar)', SEGR(), [SEG('a', -2, { lugarMail: '' })], { escribe: {} });
  caso('Seguridad: el mismo día sin lugar → no cruza (exige lugar)', SEGR(), [SEG('a', 0, { lugarMail: '' })], { escribe: {} });
  caso('Seguridad: una de la comuna a −2 y otra a +1 sin lugar → dos posibles → ambiguo', SEGR(), [SEG('a', -2), SEG('b', 1, { lugarMail: '' })], { escribe: {}, clase: 'ambiguo' });
  caso('Seguridad: una fila que NO es de Seguridad no la toma', SEGR(), [FIL('a', 0, { barrio: 'Barracas' })], { escribe: {} });
  // BUG: la regla dice que si las filas del día no tienen lugar comparable y a ±3 hay una exacta con el lugar, es ambiguo (y para
  // una figura lo es); para Seguridad el código se salta la fila del día sin lugar y cruza con la de ±3.
  caso('Seguridad: la del día SIN lugar comparable y a −2 una con la comuna que coincide → ambiguo (no se escribe en ninguna)',
       SEGR(), [SEG('a', 0, { lugarMail: '' }), SEG('b', -2)], { escribe: {}, cualquierNoEscritura: true }, true);   // BUG:
  // --- el alcance de la hora
  {
    const rec = REC({ off: -29 });
    const filas = [FIL('a', -2, {}, rec), FIL('b', 0, { barrio: 'Flores' }, rec)];   // a: 07/09 (cerrada), b: 08/09 (activa) — la planeada es el 09/09
    const esc = { semilla: 0, idx: 0, modo: 'fijo', recs: [rec], filas: filas };
    const H = armarEntorno(esc); H.E.run('idsEnLaHora_(false)');
    ok(JSON.stringify(leerMapa(H.E)) === '{}', 'la hora no escribe en la fila cerrada del 07/09 (hoy − 31) aunque cruce por ±3');
    const I = armarEntorno(esc); I.E.run('idsHistorial(false)');
    ok(JSON.stringify(mapaMayusculas(leerMapa(I.E))) === '{"a":"C-1"}', '…y el historial sí la escribe');
    const rec2 = REC({ off: -29 });
    const esc2 = { semilla: 0, idx: 0, modo: 'fijo', recs: [rec2], filas: [FIL('a', -1, {}, rec2)] };   // 08/09 = hoy − 30: activa
    const H2 = armarEntorno(esc2); H2.E.run('idsEnLaHora_(false)');
    ok(JSON.stringify(mapaMayusculas(leerMapa(H2.E))) === '{"a":"C-1"}', 'la fila del 08/09 (hoy − 30) es activa: la hora la escribe');
  }
  // --- la reunión de la fila tiene que HABER PASADO para que se escriba el ID: la de hoy y las futuras esperan
  {
    const mapa = function (esc, o, como) { const A = armarEntorno(esc, o); const r = A.E.run(como || 'idsHistorial(false)'); return { A: A, r: r, m: mapaMayusculas(leerMapa(A.E)) }; };
    const rec = REC({ off: 0 });
    const hoy = { semilla: 0, idx: 0, modo: 'fijo', recs: [rec], filas: [FIL('a', 0, {}, rec)] };     // la planeada y la fila: hoy
    const x = mapa(hoy);
    ok(x.r.items[0].ev.estado === 'cruza' && x.r.items[0].final.estado === 'fuera' && JSON.stringify(x.m) === '{}',
       'la fila es de HOY: cruza por la misma fecha pero el ID todavía NO se escribe (la reunión no pasó)');
    ok(!x.A.E.intermedia('IDS_SIN_CRUZAR') || x.A.E.intermedia('IDS_SIN_CRUZAR').valores.slice(1).filter(function (l) { return l[0] !== ''; }).length === 0,
       '…y no se lista en IDS_SIN_CRUZAR (se espera, no es un problema)');
    const manana = { semilla: 0, idx: 0, modo: 'fijo', recs: [REC({ off: 1 })], filas: [FIL('a', 0, {}, REC({ off: 1 }))] };
    ok(JSON.stringify(mapa(manana).m) === '{}', 'la fila es de MAÑANA: tampoco');
    ok(JSON.stringify(mapa(hoy, { reloj: 1 }).m) === '{"a":"C-1"}', '…y una corrida de MAÑANA (la reunión ya pasó) la escribe');
    ok(JSON.stringify(mapa(hoy, null, 'idsEnLaHora_(false)').m) === '{}', 'la corrida de la hora tampoco escribe la fila de hoy');
    const ayer = { semilla: 0, idx: 0, modo: 'fijo', recs: [REC({ off: -1 })], filas: [FIL('a', 0, {}, REC({ off: -1 }))] };
    ok(JSON.stringify(mapa(ayer).m) === '{"a":"C-1"}', 'la fila es de AYER: sí se escribe');
    // planeada AYER y la fila a +2 días (mañana): por ±3 cruza, pero la reunión de la fila no pasó: no se escribe
    const rec2 = REC({ off: -1 });
    const fut = { semilla: 0, idx: 0, modo: 'fijo', recs: [rec2], filas: [FIL('a', 2, {}, rec2)] };
    const y = mapa(fut);
    ok(y.r.items[0].ev.estado === 'cruza' && y.r.items[0].ev.nivel === 'fecha_distinta' && JSON.stringify(y.m) === '{}',
       'planeada AYER y la fila a +2 días (MAÑANA): cruza por fecha distinta, pero no se escribe hasta que la reunión de esa fila pase');
    ok(JSON.stringify(mapa(fut, { reloj: 2 }).m) === '{"a":"C-1"}', '…una corrida dos días después sí');
  }
  // --- el invariante
  {
    const R1 = REC({ id: 'C-1', off: -3 }), R2 = REC({ id: 'C-2', off: -1 });
    const filas = [FIL('a', 0, {}, R1)];     // una fila el 05/10: del C-1 es la misma fecha; del C-2 (planeada 07/10) es −2 días
    const esc = { semilla: 0, idx: 0, modo: 'fijo', recs: [R1, R2], filas: filas };
    const A = armarEntorno(esc); A.E.run('idsHistorial(false)');
    igual(mapaMayusculas(leerMapa(A.E)), { a: 'C-1' }, 'dos IDs para la misma fila: gana la misma fecha (C-1) sobre la fecha distinta (C-2)');
    const R3 = REC({ id: 'C-3', off: -1 }), R4 = REC({ id: 'C-4', off: -5 });
    const esc2 = { semilla: 0, idx: 0, modo: 'fijo', recs: [R3, R4], filas: [FIL('a', 0, {}, REC({ off: -3 }))] };   // la fila (05/10) es −2 de C-3 y +2 de C-4: los dos por fecha distinta
    const B = armarEntorno(esc2); B.E.run('idsHistorial(false)');
    igual(leerMapa(B.E), {}, 'dos IDs para la misma fila, los dos por fecha distinta y los dos de figura exacta: empatan, ninguno se escribe');
  }
}

// ===================================================================================================================
// [2] escenarios al azar
// ===================================================================================================================
const TITULOS = {
  P0: 'a lo sumo ±3 días de la planeada y sólo en una fila de ese funcionario',
  P1: 'nunca por fecha distinta con 2+ filas posibles a ±1..3 días',
  P2: 'nunca por fecha distinta si la fecha planeada es hoy o futura',
  P3: 'nunca por fecha distinta a una fila cuyo lugar no coincide (o no es comparable) ni a una conjunta parcial',
  P4: 'nunca a una fila cuyo lugar está en DESACUERDO (tampoco el mismo día)',
  P5: 'Seguridad nunca cruza con un lugar que no coincide',
  P6: 'una fila Reprogramada nunca recibe un ID',
  P7: 'con una fila posible el mismo día nunca gana una de otro día; y "las del día sin lugar + una exacta a ±3" no escribe nada',
  P8: 'un ID en una sola fila; lo cargado no cambia; todo ID escrito sale de un registro que cruzó con esa fila',
  P9: 'el orden de la lista y de la base no cambia el resultado (se barajan las dos)',
  P10a: 'la segunda corrida no escribe nada',
  P11: 'agregar filas que no son candidatas (copias Reprogramadas, otra figura, a ±4..8 días) no cambia el resultado',
  P12: 'el resultado no depende de qué día es hoy (se corre todo k días: la lista, la base y el reloj)',
  P10b: 'la hora y después el historial dan lo mismo que el historial solo',
  P10c: 'la hora no escribe fuera de las filas activas que ya pasaron (hoy − 30 a ayer)',
  P10d: 'ninguna corrida escribe una fila cuya reunión todavía no pasó (hoy o futura): esperan a una corrida posterior',
  ORAC: 'cada registro, solo, cruza (o no) como dice el oráculo',
  INV: 'lo que se escribe (con el invariante y el alcance) es lo que dice el oráculo',
  HORA: 'lo que escribe la corrida de la hora es lo que dice el oráculo (sólo filas activas que ya pasaron)',
  EXC: 'ningún escenario tira una excepción'
};
const ORDEN_TAGS = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10a', 'P10b', 'P10c', 'P10d', 'P11', 'P12', 'ORAC', 'INV', 'HORA', 'EXC'];

if (SOLO !== null) {
  console.log('[2] el escenario ' + SOLO + ' (semilla ' + SEMILLA + ')');
  const esc = generarEscenario(SEMILLA, SOLO);
  console.log(describir(esc));
  const r = evaluar(esc);
  console.log('  verificaciones: ' + JSON.stringify(r.cuenta));
  console.log('  cobertura: ' + Object.keys(r.cob).join(', '));
  if (r.viol.length) r.viol.forEach(function (v) { console.log('  ' + v.tag + ': ' + v.msg); });
  else console.log('  sin violaciones');
  process.exit(r.viol.length ? 1 : 0);
}

console.log('[2] ' + N_ESCENARIOS + ' escenarios al azar (semilla ' + SEMILLA + '; 2 a 8 filas de 1 a 3 figuras, 1 a 3 registros): propiedades P0..P12 y oráculo');
{
  const t0 = Date.now();
  const total = {}, cob = {}, malos = {};
  for (let idx = 0; idx < N_ESCENARIOS; idx++) {
    if (idx % 40 === 0) liberar();
    const esc = generarEscenario(SEMILLA, idx);
    const r = evaluar(esc);
    Object.keys(r.cuenta).forEach(function (t) { total[t] = (total[t] || 0) + r.cuenta[t]; });
    Object.keys(r.cob).forEach(function (t) { cob[t] = (cob[t] || 0) + r.cob[t]; });
    r.viol.forEach(function (v) {
      const lista = malos[v.tag] = malos[v.tag] || { n: 0, escenarios: [], primero: null };
      lista.n++;
      if (lista.escenarios.indexOf(idx) < 0) lista.escenarios.push(idx);
      if (!lista.primero) lista.primero = { esc: esc, msg: v.msg };
    });
  }
  const verificaciones = Object.keys(total).reduce(function (s, t) { return s + total[t]; }, 0);
  console.log('  (' + N_ESCENARIOS + ' escenarios, ' + verificaciones + ' verificaciones en ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
  ORDEN_TAGS.concat(Object.keys(malos).filter(function (t) { return ORDEN_TAGS.indexOf(t) < 0; })).forEach(function (tag) {
    const mal = malos[tag];
    if (!mal && total[tag] === undefined && tag !== 'EXC') { ok(false, tag + ': NO se verificó nunca (el generador no produce casos para esta propiedad)'); return; }
    if (!mal) { ok(true, tag + ' — ' + (TITULOS[tag] || '') + '  [' + (tag === 'EXC' ? N_ESCENARIOS + ' escenarios' : (total[tag] || 0) + ' verificaciones') + ']'); return; }
    ok(false, tag + ' — ' + (TITULOS[tag] || '') + '  [' + mal.n + ' violaciones en ' + mal.escenarios.length + ' escenarios, p. ej. ' + mal.escenarios.slice(0, 8).join(', ') + ']');
    console.log('      ' + mal.primero.msg);
    const min = ACHICAR ? achicar(mal.primero.esc, tag) : mal.primero.esc;
    console.log(ACHICAR
      ? '    escenario mínimo (achicado de ' + mal.primero.esc.filas.length + ' filas y ' + mal.primero.esc.recs.length + ' registros a ' + min.filas.length + ' y ' + min.recs.length + '):'
      : '    escenario (sin achicar):');
    console.log(describir(min));
    const rm = evaluar(min, { orden: tag === 'P9', hora: tag === 'P10b' || tag === 'P10c' || tag === 'HORA', extra: tag === 'P11', hoy: tag === 'P12' });
    rm.viol.filter(function (v) { return v.tag === tag; }).slice(0, 2).forEach(function (v) { console.log('      ' + tag + ': ' + v.msg); });
  });

  // que el generador no se vuelva vacío: cada rama de la regla y cada rama del invariante tienen que aparecer
  console.log('  cobertura del generador (escenarios donde el PRIMER registro cae en cada rama):');
  const ramas = Object.keys(cob).filter(function (k) { return /^rama:/.test(k); }).sort();
  console.log('    ' + ramas.map(function (k) { return k.slice(5) + ' ' + cob[k]; }).join(' | '));
  const invs = Object.keys(cob).filter(function (k) { return /^inv:/.test(k); }).sort();
  console.log('    invariante (todos los registros): ' + invs.map(function (k) { return k.slice(4) + ' ' + cob[k]; }).join(' | '));
  console.log('    cruces que el código decide: por fecha distinta ' + (cob.cruce_distinta || 0) + ' | de Seguridad ' + (cob.cruce_seguridad || 0) + ' | de una conjunta ' +
              (cob.cruce_conjunta || 0) + ' | misma fecha con la planeada hoy o futura ' + (cob.cruce_misma_futura || 0) + ' | escenarios donde la regla de Reprogramada cambia el resultado ' + (cob.reprogramada_cambia || 0));
  // Mínimos holgados (≈ la mitad de lo que da la semilla de siempre): no buscan un número, buscan que el generador no se vuelva vacío.
  const minimo = function (clave, n, que) { ok((cob[clave] || 0) >= n, 'cobertura: ' + que + ' ≥ ' + n + ' (hay ' + (cob[clave] || 0) + ')'); };
  if (N_ESCENARIOS >= 300) {
    const k = N_ESCENARIOS / 450;
    const n = function (x) { return Math.max(1, Math.floor(x * k)); };
    minimo('rama:fecha_distinta', n(15), 'registros que cruzan por fecha distinta');
    minimo('rama:misma_unica', n(50), 'registros que cruzan por la misma fecha');
    minimo('rama:varias_posibles_a_3_dias', n(20), 'ambiguos por 2+ posibles a ±3');
    minimo('rama:dia_sin_lugar_y_rival', n(12), 'ambiguos por "las del día sin lugar + una exacta a ±3"');
    minimo('rama:espera_la_fila_del_dia', n(8), 'planeada hoy o futura con una fila a ±3 (se espera)');
    minimo('rama:seguridad_sin_lugar', n(4), 'Seguridad sin lugar comparable');
    minimo('rama:varias_el_mismo_dia', n(15), 'varias filas el mismo día sin desempate');
    minimo('rama:solo_conjunta_parcial', n(2), 'sólo una conjunta donde está a ±3');
    minimo('cruce_seguridad', n(12), 'cruces de Seguridad');
    minimo('cruce_conjunta', n(20), 'cruces de una conjunta');
    minimo('reprogramada_cambia', n(12), 'escenarios donde una Reprogramada cambiaría el resultado');
    const minInv = { escribe: 50, fila_tomada: 3, fila_disputada: 2, id_en_la_base: 30, fila_con_otro_id: 4, repetido: 10, id_repetido: 10, fuera_de_alcance: 8 };
    Object.keys(minInv).forEach(function (e) { minimo('inv:' + e, n(minInv[e]), 'registros en el estado "' + e + '" del invariante'); });
  }
}

console.log('\n' + chequeos + ' chequeos' + (bugsAbiertos ? ' (' + bugsAbiertos + ' BUG de producción abierto' + (bugsAbiertos > 1 ? 's' : '') + ')' : '') + '.');
console.log(fallas ? fallas + ' FALLAS' : 'Todo en verde.');
process.exit(fallas ? 1 : 0);
