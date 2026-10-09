/**
 * tests/ids_mejoras.test.js — las dos mejoras del cruce de los IDs (45_IdsCuentas.js, 09/10), APAGADAS en 00_Config.js:
 * IDS_CONJUNTA_UNA_FIGURA (una conjunta sin "Conjunta con": la fila de UNA de sus figuras) e IDS_SEGURIDAD_POR_COMUNA
 * (Seguridad por fecha + comuna, no por figura). Se prueban forzadas (`conMejorasIds_`), y la medición del paso 60.
 *
 *     node tests/ids_mejoras.test.js
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: figuras, barrios, IDs y fechas inventados.
 */
'use strict';
const { crearEntornoIds, filaBase, hdrBase, D } = require('./ids_mock');

let chequeos = 0, fallas = 0;
function ok(cond, que) { chequeos++; console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }

const HDR = hdrBase(['ID cuentas', 'Fecha envío campañas']);
const col = function (n) { return HDR.indexOf(n); };
const JM0 = [['', '', '', '', '', ''], ['ID', 'Funcionario', 'Barrio / Comuna', 'Tipo', 'Fecha', 'Fecha de envío']];
const FUN0 = [['Información', '', '', '', ''], ['ID', 'Funcionario', 'Barrio / Comuna', 'Fecha', 'Fecha de envío']];
// el relleno: las figuras de los casos existen en la base (en febrero, lejos de las fechas de la lista)
const FIGS = ['Ruth Landerreche', 'Hernán Lombardi', 'Gustavo Arengo Piragine', 'Gabino Tapia', 'Ana Pereyra', 'Jorge Macri'];
const relleno = function () { const b = []; for (let i = 0; i < 20; i++) b.push(filaBase({ Figura: FIGS[i % 6], Barrio: 'Flores', FECHA: D(1 + i, 2) }, HDR)); return b; };
function entorno(filas, fun) {
  return crearEntornoIds({ bloqueBase: [HDR].concat(relleno()).concat(filas), jm: JM0, funcionarios: FUN0.concat(fun), maxColsBase: HDR.length });
}
/** El cruce del historial con las mejoras forzadas: lo que pasó con el ID `id` → { estado, motivo, fila, regla, como }. */
function cruce(E, id, mejoras) {
  E.ctx.__m = mejoras;
  const res = E.run('conMejorasIds_(__m, function () { var d = leerDestino_(); return cruzarIds_(leerListaIds_().registros, d, { historial: true }); })');
  const it = res.items.filter(function (x) { return x.r.id === id; })[0];
  return { estado: it.final.estado, motivo: it.final.motivo || '', fila: it.final.fila || null, regla: it.ev.regla || '',
           como: it.ev.estado === 'cruza' ? E.run('comoCruzoIds_')(it) : '', res: res };
}
const NADA = { conjunta: false, seguridad: false }, CONJ = { conjunta: true, seguridad: false }, SEG = { conjunta: false, seguridad: true };
const F0 = 22;   // la primera fila después del relleno

console.log('[1] prendidas desde el 09/10 (paso 60 de las 15:41)');
{
  const E = entorno([], []);
  ok(E.cfg('IDS_CONJUNTA_UNA_FIGURA') === true && E.cfg('IDS_SEGURIDAD_POR_COMUNA') === true, 'las dos, true en 00_Config.js');
}

console.log('[2] IDS_CONJUNTA_UNA_FIGURA');
{
  const conj = ['3500-CONJ', 'Hernan Lombardi, Gustavo Arengo Piragine, Gabino Tapia', 'Eje Norte', D(15, 4), D(10, 4)];
  let E = entorno([filaBase({ Figura: 'Hernán Lombardi', Barrio: 'Núñez', EVENTO: 'Encuentro con Vecinos', FECHA: D(15, 4) }, HDR)], [conj]);
  let c = cruce(E, '3500-CONJ', NADA);
  ok(c.estado === 'no' && c.motivo === 'conjunta_sin_fila', 'apagada: conjunta_sin_fila (como hoy)');
  c = cruce(E, '3500-CONJ', CONJ);
  ok(c.estado === 'escribe' && c.fila === F0 && c.regla === 'conjunta_una_figura' && /la fila de Hernán Lombardi/.test(c.como),
     'prendida: la fila de Lombardi el mismo día, eje Norte = Núñez (' + c.como + ')');
  E = entorno([filaBase({ Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: D(15, 4) }, HDR), filaBase({ Figura: 'Gabino Tapia', Barrio: 'Palermo', FECHA: D(15, 4) }, HDR)], [conj]);
  c = cruce(E, '3500-CONJ', CONJ);
  ok(c.estado === 'no' && c.motivo === 'ambiguo', 'dos figuras con fila ese día (eje Norte las dos): ambiguo, no se escribe');
  E = entorno([filaBase({ Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: D(15, 4) }, HDR), filaBase({ Figura: 'Gabino Tapia', Barrio: 'Barracas', FECHA: D(15, 4), 'Lugar (mail)': 'Eje Sur' }, HDR)], [conj]);
  c = cruce(E, '3500-CONJ', CONJ);
  ok(c.estado === 'escribe' && c.fila === F0, 'la otra con "Lugar (mail)" Eje Sur (la lista dice Eje Norte): queda una sola, la de Lombardi');
  E = entorno([filaBase({ Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: D(15, 4) }, HDR), filaBase({ Figura: 'Gabino Tapia', Barrio: 'Barracas', FECHA: D(15, 4) }, HDR)], [conj]);
  c = cruce(E, '3500-CONJ', CONJ);
  ok(c.estado === 'no' && c.motivo === 'ambiguo', 'la otra en Barracas SIN eje del mail: no comparable, no se descarta → dos candidatas, ambiguo (el eje de Comunas no se usa)');
  const oeste = ['3504-CONJ', 'Hernan Lombardi, Gabino Tapia', 'Eje Oeste', D(24, 6), ''];
  E = entorno([filaBase({ Figura: 'Hernán Lombardi', Barrio: 'Villa Urquiza', FECHA: D(24, 6) }, HDR)], [oeste]);
  c = cruce(E, '3504-CONJ', CONJ);
  ok(c.estado === 'escribe', '"Eje Oeste" en Villa Urquiza (Norte en Comunas), sin eje del mail: cruza (una sola: alcanzan figura + fecha)');
  E = entorno([filaBase({ Figura: 'Hernán Lombardi', Barrio: 'Villa Urquiza', FECHA: D(24, 6), 'Lugar (mail)': 'Eje Oeste' }, HDR)], [oeste]);
  c = cruce(E, '3504-CONJ', CONJ);
  ok(c.estado === 'escribe' && /lugar: eje/.test(c.como), '…y con "Lugar (mail)" Eje Oeste: cruza por el eje del mail (' + c.como + ')');
  E = entorno([filaBase({ Figura: 'Hernán Lombardi', Barrio: 'Villa Urquiza', FECHA: D(24, 6), 'Lugar (mail)': 'Eje Norte' }, HDR)], [oeste]);
  c = cruce(E, '3504-CONJ', CONJ);
  ok(c.estado === 'no', '…con "Lugar (mail)" Eje Norte: desacuerdo, no cruza');
  E = entorno([filaBase({ Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: D(15, 4) }, HDR)], [['3501-CONJ', 'Hernan Lombardi, Gabino Tapia', 'Comuna 4', D(15, 4), '']]);
  c = cruce(E, '3501-CONJ', CONJ);
  ok(c.estado === 'no', 'la lista dice Comuna 4 y la fila es de Núñez (Comuna 13): no es compatible, no cruza');
  E = entorno([filaBase({ Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: D(13, 4) }, HDR)], [['3502-CONJ', 'Hernan Lombardi, Gabino Tapia', 'Núñez', D(15, 4), '']]);
  c = cruce(E, '3502-CONJ', CONJ);
  ok(c.estado === 'escribe' && /fecha distinta/.test(c.como), 'a −2 días, con el mismo barrio y una sola: cruza por fecha distinta (las reglas de siempre)');
  E = entorno([filaBase({ Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: D(13, 4) }, HDR)], [['3503-CONJ', 'Hernan Lombardi, Gabino Tapia', '', D(15, 4), '']]);
  c = cruce(E, '3503-CONJ', CONJ);
  ok(c.estado === 'no', 'a −2 días sin lugar comparable: no cruza (el ±3 exige el lugar)');
  // la conjunta con su fila de siempre no cambia
  E = entorno([filaBase({ Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: D(15, 4), 'Conjunta con': 'Gustavo Arengo Piragine / Gabino Tapia' }, HDR)], [conj]);
  const a = cruce(E, '3500-CONJ', NADA), b = cruce(E, '3500-CONJ', CONJ);
  ok(a.estado === 'escribe' && b.estado === 'escribe' && a.fila === b.fila && b.regla === '', 'una conjunta CON su fila ("Conjunta con"): igual que hoy, por la regla de siempre');
  // pierde contra el ID propio de la figura en esa fila
  E = entorno([filaBase({ Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: D(15, 4) }, HDR)], [conj, ['3600-LOMB', 'Hernan Lombardi', 'Núñez', D(15, 4), '']]);
  c = cruce(E, '3500-CONJ', CONJ);
  const p = cruce(E, '3600-LOMB', CONJ);
  ok(p.estado === 'escribe' && c.estado === 'no' && c.motivo === 'fila_tomada', 'si Lombardi tiene su ID propio ese día, gana el suyo (la conjunta: fila_tomada)');
}

console.log('[3] IDS_SEGURIDAD_POR_COMUNA');
{
  const seg = ['3000-MAYSEGVC', 'Ana Pereyra', 'Comuna 6', D(14, 5), D(10, 5)];
  let E = entorno([filaBase({ Figura: 'Ana Pereyra', Barrio: 'Palermo', FECHA: D(14, 5) }, HDR),
                   filaBase({ Figura: 'Gabino Tapia', Barrio: 'Caballito', FECHA: D(14, 5), 'Evento (mail)': 'Seguridad en tu Barrio' }, HDR)], [seg]);
  let c = cruce(E, '3000-MAYSEGVC', NADA);
  ok(c.estado === 'no' && c.motivo === 'lugar_distinto', 'apagada: lugar_distinto (Pereyra ese día está en Palermo, Comuna 14)');
  c = cruce(E, '3000-MAYSEGVC', SEG);
  ok(c.estado === 'escribe' && c.fila === F0 + 1 && /Seguridad por comuna/.test(c.como) && /figura distinta \(la lista: Ana Pereyra; la fila: Gabino Tapia\)/.test(c.como),
     'prendida: la de la Comuna 6 ese día (Caballito), con "figura distinta" en la traza (' + c.como + ')');
  E = entorno([filaBase({ Figura: 'Jorge Macri', Barrio: 'Caballito', FECHA: D(14, 5) }, HDR),
               filaBase({ Figura: 'Gabino Tapia', Barrio: 'Caballito', FECHA: D(14, 5), 'Evento (mail)': 'Seguridad en tu Barrio' }, HDR)], [seg]);
  c = cruce(E, '3000-MAYSEGVC', SEG);
  ok(c.estado === 'escribe' && c.fila === F0 + 1, 'dos filas de la Comuna 6 ese día: gana la de Seguridad');
  E = entorno([filaBase({ Figura: 'Jorge Macri', Barrio: 'Caballito', FECHA: D(14, 5) }, HDR), filaBase({ Figura: 'Gabino Tapia', Barrio: 'Caballito', FECHA: D(14, 5) }, HDR)], [seg]);
  c = cruce(E, '3000-MAYSEGVC', SEG);
  ok(c.estado === 'no' && c.motivo === 'ambiguo', 'dos filas de la Comuna 6 ese día, ninguna de Seguridad: ambiguo');
  E = entorno([filaBase({ Figura: 'Gabino Tapia', Barrio: 'Caballito', FECHA: D(15, 5) }, HDR)], [seg]);
  c = cruce(E, '3000-MAYSEGVC', SEG);
  ok(c.estado === 'no', 'sólo una al día siguiente: no cruza (por fecha + comuna, sin ±3)');
  E = entorno([filaBase({ Figura: 'Gabino Tapia', Barrio: 'Caballito', FECHA: D(14, 5) }, HDR)], [['3001-XSEGXX', 'Ana Pereyra', '', D(14, 5), '']]);
  c = cruce(E, '3001-XSEGXX', SEG);
  ok(c.estado === 'no', 'la lista no dice una comuna: no se aplica');
  E = entorno([filaBase({ Figura: 'Gabino Tapia', Barrio: 'Caballito', FECHA: D(14, 5) }, HDR)], [['3002-ABCDEF', 'Ana Pereyra', 'Comuna 6', D(14, 5), '']]);
  c = cruce(E, '3002-ABCDEF', SEG);
  ok(c.estado === 'no', 'un ID sin "SEG" y un Funcionario que no es Seguridad: no se aplica');
  E = entorno([filaBase({ Figura: '', Barrio: '', FECHA: D(3, 10), 'Evento (mail)': 'Seguridad en tu Barrio', 'Lugar (mail)': 'Comuna 4' }, HDR)],
              [['3701-SEGURIDA', 'Seguridad en tu barrio', 'Comuna 4', D(3, 10), '']]);
  const a = cruce(E, '3701-SEGURIDA', NADA), b = cruce(E, '3701-SEGURIDA', SEG);
  ok(a.estado === b.estado && a.fila === b.fila && b.regla === '', 'una Seguridad que hoy ya cruza: igual que hoy (' + a.estado + ')');
}

console.log('[4] el paso 60: lo que resuelve cada una, y que ninguna cambie un ID ya cruzado');
{
  const E = entorno([
    filaBase({ Figura: 'Hernán Lombardi', Barrio: 'Núñez', FECHA: D(15, 4) }, HDR),
    filaBase({ Figura: 'Ana Pereyra', Barrio: 'Palermo', FECHA: D(14, 5) }, HDR),
    filaBase({ Figura: 'Gabino Tapia', Barrio: 'Caballito', FECHA: D(14, 5), 'Evento (mail)': 'Seguridad en tu Barrio' }, HDR),
    filaBase({ Figura: 'Jorge Macri', Barrio: 'Belgrano', FECHA: D(29, 9), 'ID cuentas': '3735-SEPJDGAG' }, HDR),
    filaBase({ Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: D(5, 10) }, HDR)
  ], [['3500-CONJ', 'Hernan Lombardi, Gustavo Arengo Piragine, Gabino Tapia', 'Eje Norte', D(15, 4), ''],
      ['3000-MAYSEGVC', 'Ana Pereyra', 'Comuna 6', D(14, 5), ''], ['3735-SEPJDGAG', 'Jorge Macri', 'Belgrano', D(1, 10), ''],
      ['3702-TAPIAAAA', 'Gabino Tapia', 'Retiro', D(5, 10), '']]);
  const antes = JSON.stringify(E.base().valores);
  const m = E.run('medirIdsMejoras()');
  ok(m.conjunta.resuelve === 1 && m.seguridad.resuelve === 1 && m['las dos'].resuelve === 2, 'resuelve 1 cada una y 2 las dos');
  ok(m.conjunta.rompe === 0 && m.seguridad.rompe === 0 && m['las dos'].rompe === 0, 'CAMBIA UN ID YA CRUZADO: 0 en las tres');
  ok(JSON.stringify(E.base().valores) === antes && E.base().escrituras.length === 0 && !E.intermedia('IDS_SIN_CRUZAR'), 'no escribe nada (ni la base, ni la intermedia)');
  ok(/figura distinta/.test(E.log()) && /la fila de Hernán Lombardi/.test(E.log()), 'el log lista lo que resuelve, con la traza');
}

console.log('[5] el paso 61: los de Seguridad que siguen sin cruzar, con las filas de esa fecha y esa comuna');
{
  const E = entorno([
    // a) Pereyra el 14/05 en Palermo; en la Comuna 6 no hay nada ese día
    filaBase({ Figura: 'Ana Pereyra', Barrio: 'Palermo', FECHA: D(14, 5) }, HDR),
    // b) Pereyra el 21/05 en Palermo; en la Comuna 6, dos filas y ninguna de Seguridad
    filaBase({ Figura: 'Ana Pereyra', Barrio: 'Palermo', FECHA: D(21, 5) }, HDR),
    filaBase({ Figura: 'Jorge Macri', Barrio: 'Caballito', FECHA: D(21, 5) }, HDR),
    filaBase({ Figura: 'Gabino Tapia', Barrio: 'Caballito', FECHA: D(21, 5) }, HDR),
    // c) Pereyra el 28/05 en Palermo; en la Comuna 6, una sola, que ya tiene otro ID
    filaBase({ Figura: 'Ana Pereyra', Barrio: 'Palermo', FECHA: D(28, 5) }, HDR),
    filaBase({ Figura: 'Gabino Tapia', Barrio: 'Caballito', FECHA: D(28, 5), 'Evento (mail)': 'Seguridad en tu Barrio', 'ID cuentas': '9999-OTRO' }, HDR)
  ], [['3010-MAYSEGAA', 'Ana Pereyra', 'Comuna 6', D(14, 5), ''], ['3011-MAYSEGBB', 'Ana Pereyra', 'Comuna 6', D(21, 5), ''],
      ['3012-MAYSEGCC', 'Ana Pereyra', 'Comuna 6', D(28, 5), '']]);
  const antes = JSON.stringify(E.base().valores);
  const r = E.run('medirSeguridadSinCruzar()');
  const por = {}; r.forEach(function (x) { por[x.id] = x; });
  ok(r.length === 3, 'los tres siguen sin cruzar (' + r.length + ')');
  ok(/no hay ninguna fila de la Comuna 6 ese día/.test(por['3010-MAYSEGAA'].porque), 'a) "no hay ninguna fila de la Comuna 6 ese día"');
  ok(/2 filas, ninguna marcada de Seguridad/.test(por['3011-MAYSEGBB'].porque) && por['3011-MAYSEGBB'].filasComuna === 2, 'b) "2 filas, ninguna marcada de Seguridad … no se elige ninguna"');
  ok(/pero no se escribe: fila_con_otro_id/.test(por['3012-MAYSEGCC'].porque), 'c) "cruza con la fila …, pero no se escribe: fila_con_otro_id"');
  ok(/ID: 9999-OTRO \| SEGURIDAD/.test(E.log()) && /las filas de Ana Pereyra a ±3 días/.test(E.log()), 'el log muestra cada fila (ID, SEGURIDAD) y las de la figura de la lista');
  ok(JSON.stringify(E.base().valores) === antes && E.base().escrituras.length === 0 && !E.intermedia('IDS_SIN_CRUZAR'), 'no escribe nada');
}

console.log('\n' + chequeos + ' chequeos.');
console.log(fallas ? fallas + ' FALLA(S)' : 'Todo en verde.');
process.exit(fallas ? 1 : 0);
