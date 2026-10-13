/**
 * tests/formularios_sin_fila.test.js — la solapa FORMULARIOS_SIN_FILA (48_FormulariosSinFila.js, 13/10): qué formularios
 * entran (los de los últimos DIAS_ACTIVOS días sin fila), cuáles no (gemelos descartados, 0 inscriptos, futuros, gemelos de
 * uno con fila), el motivo en palabras y la fila más cercana, y la escritura en el archivo de la base.
 *
 *     node tests/formularios_sin_fila.test.js
 *
 * Los formularios se arman con el parser real (detectFecha_, detectComuna_, gemelos…) sobre un plan hecho a mano: la base y
 * las figuras, las de tests/ids_mock.js. NO sube a Apps Script; sin datos reales (figuras y lugares inventados). Hoy: 08/10/2026.
 */
'use strict';
const { crearEntornoIds, filaBase, hdrBase, D } = require('./ids_mock');

let chequeos = 0, fallas = 0;
function ok(cond, que) { chequeos++; console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }

const HDR = hdrBase();
const base = [
  filaBase({ Figura: 'Jorge Macri', Barrio: 'Belgrano', FECHA: D(1, 10) }, HDR),                 // tiene A
  filaBase({ Figura: 'Gabino Tapia', Barrio: 'Retiro', FECHA: D(3, 10) }, HDR),                  // tiene B (Comuna 1 Norte)
  filaBase({ Figura: 'Ana Pereyra', Barrio: 'Palermo', FECHA: D(2, 10) }, HDR),                  // en revisión con J
  filaBase({ Figura: 'Ruth Landerreche', Barrio: 'Flores', FECHA: D(20, 9) }, HDR),
  filaBase({ Figura: 'Hernán Lombardi', Barrio: 'Saavedra', FECHA: D(6, 9) }, HDR),              // cerrada (antes del 08/09)
  filaBase({ Figura: 'Jorge Macri', Barrio: '', FECHA: D(7, 10) }, HDR),                         // pendiente_barrio con L
  filaBase({ Figura: 'Clara Muzzio', Barrio: 'Recoleta', FECHA: D(5, 10) }, HDR),                // libre
  filaBase({ Figura: 'Gustavo Arengo Piragine', Barrio: 'Flores', FECHA: D(3, 3) }, HDR)
];
const E = crearEntornoIds({ bloqueBase: [HDR].concat(base), maxColsBase: HDR.length, extra: ['48_FormulariosSinFila.js'] });
const F = E.ctx.Date;
E.ctx.__forms = [
  ['A', 'Jorge Macri - Belgrano - 1/10', [30, 9], 100],
  ['A2', 'Jorge Macri - Belgrano - 1/10', [1, 10], 80],             // gemelo de A, que tiene fila
  ['B', 'Gabino Tapia - Retiro - 3/10', [2, 10], 60],
  ['C', 'Gabino Tapia - Comuna 1 Sur - 3/10', [2, 10], 50],         // la fila de Tapia es Comuna 1 Norte
  ['D', 'Ruth Landerreche - Flores - 5/10', [4, 10], 40],           // la fila de Landerreche está a 15 días
  ['E', 'Ana Pereyra - Palermo - 6/10', [5, 10], 30],               // la de Pereyra, a 4 días
  ['F', 'Vecinos - Seguridad - Comuna 13 - 4/10', [3, 10], 20],     // sin figura; Belgrano es C13
  ['G', 'Jorge Macri - Belgrano - 12/10', [11, 10], 90],            // futura
  ['H', 'Ana Pereyra - Encuentro - 1/10', [30, 9], 0],              // 0 inscriptos
  ['I1', 'Ruth Landerreche - Caballito - 28/9', [27, 9], 2],        // gemelo descartado (regla 3)
  ['I2', 'Ruth Landerreche - Caballito - 28/9', [28, 9], 60],
  ['J', 'Ana Pereyra - Palermo - 2/10', [1, 10], 45],               // la mejor opción de la fila de Pereyra (revisión)
  ['K', 'RDV - Lombardi-Tapia-Piragine - 30/9', [29, 9], 70],       // varias figuras
  ['L', 'Jorge Macri - 7/10', [6, 10], 90],                         // su fila espera el barrio
  ['M', 'Hernán Lombardi - Saavedra - 9/9', [8, 9], 25],            // la fila es de antes de las activas
  ['N', 'Clara Muzzio - Recoleta - 5/10', [4, 10], 35]              // fila libre al lado: no se cruzó
].map(function (x) { return { id: x[0], nombre: x[1], fin: new F(2026, x[2][1] - 1, x[2][0], 0, 0, 0), ins: x[3] }; });

const r = E.run(`(function () {
  const dest = leerDestino_();
  const todos = __forms.map(function (x, i) {
    const limpio = limpiarPrefijos_(x.nombre);
    return { id: x.id, fila: i + 2, nombre: x.nombre, figurasNorm: figurasEnTexto_(x.nombre).map(normalizeText_),
             barrio: detectBarrio_(limpio), barrioPorVariante: barrioPorVariante_(limpio), comuna: detectComuna_(limpio),
             subzona: detectSubzonaComuna1_(limpio), eje: detectEje_(limpio), det: detectFecha_(limpio, x.fin), finRaw: x.fin, inscriptos: x.ins };
  });
  ordenarFormularios_(todos);
  const gemelos = marcarGemelos_(todos);
  const vivos = todos.filter(function (c) { return !c.descartadoRegla3; });
  const por = function (id) { return todos.filter(function (c) { return c.id === id; })[0]; };
  const fila = function (fig, d, m) { return dest.filas.filter(function (f) { return f.figura === fig && f.fecha.getDate() === d && f.fecha.getMonth() === m - 1; })[0]; };
  const usados = {}; usados[por('A').fila] = true; usados[por('B').fila] = true;
  const decisiones = [{ fila: fila('Jorge Macri', 1, 10), cand: por('A') }, { fila: fila('Gabino Tapia', 3, 10), cand: por('B') },
                      { fila: fila('Ana Pereyra', 2, 10), cand: por('J'), noEscribir: true, nivel: 'descartado:margen_chico' }];
  const porFila = {}; porFila[fila('Jorge Macri', 7, 10).fila] = { veredicto: 'pendiente_barrio', cand: por('L') };
  const plan = { dest: dest, cands: { vivos: vivos, gemelos: gemelos }, usados: usados, decisiones: decisiones, porFila: porFila };
  const res = formulariosSinFila_(plan);
  res.porId = {};
  res.lista.forEach(function (x) { res.porId[x.c.id] = x; });
  res.plan = plan;
  return res;
})()`);
const P = function (id) { return r.porId[id]; };

console.log('[1] qué entra y qué no');
ok(!P('A') && !P('B'), 'los que tienen fila (A, B) no entran');
ok(!P('A2') && r.excluidos.gemeloAsignado === 1, 'el gemelo de uno con fila (A2) no entra; se cuenta');
ok(!P('G') && r.excluidos.futuros === 1, 'el de una reunión futura (G, 12/10) no entra: espera su fila');
ok(!P('H') && r.excluidos.cero === 1, 'el de 0 inscriptos (H) no entra');
ok(!P('I1') && r.excluidos.regla3 === 1 && !!P('I2'), 'el gemelo descartado por la regla 3 (I1, 2 inscriptos) no entra; su gemelo (I2) sí');
ok(Object.keys(r.porId).sort().join(',') === 'C,D,E,F,I2,J,K,L,M,N', 'entran: C, D, E, F, I2, J, K, L, M, N (' + Object.keys(r.porId).sort().join(',') + ')');
ok(r.lista[0].c.id === 'L' && r.lista[r.lista.length - 1].c.id === 'M', 'de la más reciente (L, 07/10) a la más vieja (M, 09/09)');

console.log('[2] el motivo y la fila más cercana');
const ver = function (id, clase, re, reCerca) {
  const x = P(id);
  ok(x && x.clase === clase && re.test(x.motivo) && (!reCerca || reCerca.test(x.cercana)),
     id + ' → ' + clase + (x ? ': "' + x.motivo + '" | ' + (x.cercana || '—') : ' (no está)'));
};
ver('C', 'otro_lugar', /La fila de Gabino Tapia del mismo día es en otro lugar \(el formulario dice Comuna 1 Sur; la fila, Retiro\)/, /fila \d+ · Gabino Tapia · Retiro · 03\/10\/2026 \(mismo día\) · ya tiene: Gabino Tapia - Retiro - 3\/10/);
ver('D', 'sin_fila_cerca', /Sin ninguna fila de Ruth Landerreche a ±7 días: falta cargar la reunión/, null);
ok(P('D').cercana === '', '   D: la de Landerreche está a 15 días (más de 14): sin fila más cercana');
ver('E', 'fila_lejos', /más cercana está a 4 días \(más de 3/, /Ana Pereyra · Palermo · 02\/10\/2026 \(−4 días\)/);
ver('F', 'sin_figura', /No nombra ninguna figura: la fila de su lugar más cercana está a 3 días y ya tiene otro formulario/, /Jorge Macri · Belgrano/);
ver('I2', 'sin_fila_cerca', /Ruth Landerreche/, /Flores · 20\/09\/2026 \(−8 días\)/);
ver('J', 'en_revision', /En revisión: es la mejor opción de la fila \d+ \(margen_chico\)/, /Ana Pereyra · Palermo · 02\/10\/2026 \(mismo día\) · sin formulario/);
ver('K', 'varias_figuras', /Nombra varias figuras \(.*Lombardi.*Tapia.*Piragine|Nombra varias figuras/, null);
ver('L', 'espera_fila', /Su fila \(\d+\) espera el barrio/, /Jorge Macri · sin barrio · 07\/10\/2026/);
ver('M', 'fila_cerrada', /es de antes de las filas activas/, /Hernán Lombardi · Saavedra · 06\/09\/2026 \(−3 días\)/);
ver('N', 'no_se_cruzo', /fila libre de Clara Muzzio del mismo día que no se cruzó/, /Clara Muzzio · Recoleta · 05\/10\/2026 \(mismo día\) · sin formulario/);
ok(P('C').lugar === 'Comuna 1 Sur' && P('F').lugar === 'Comuna 13' && P('D').lugar === 'Flores' && P('F').figuras.length === 0,
   'el lugar del nombre: "Comuna 1 Sur", "Comuna 13", "Flores"; F sin figuras');

console.log('[3] la solapa: la línea de arriba, el resumen, el encabezado, protegida con advertencia, en el archivo de la base');
{
  const hojas = {};
  const hoja = function (n) {
    const h = { nombre: n, v: [], prot: null, congeladas: 0, fmt: [] };
    const rg = function (f, c, nf, nc) {
      const o = { setValues: function (m) { for (let i = 0; i < m.length; i++) { h.v[f - 1 + i] = h.v[f - 1 + i] || []; for (let j = 0; j < m[i].length; j++) h.v[f - 1 + i][c - 1 + j] = m[i][j]; } return o; } };
      ['setFontWeight', 'setFontSize', 'setFontStyle', 'setFontColor', 'setBackground', 'setVerticalAlignment', 'setWrap'].forEach(function (k) {
        o[k] = function (x) { h.fmt.push([k, f, c, x]); return o; };
      });
      return o;
    };
    Object.assign(h, { getRange: rg, clear: function () { h.v = []; h.fmt = []; }, setFrozenRows: function (k) { h.congeladas = k; },
      setColumnWidth: function () {}, getProtections: function () { return h.prot ? [h.prot] : []; },
      protect: function () { const p = { d: '', adv: false }; p.setDescription = function (x) { p.d = x; return p; };
        p.setWarningOnly = function (x) { p.adv = x; return p; }; p.getDescription = function () { return p.d; };
        p.remove = function () { h.prot = null; }; h.prot = p; return p; } });
    return h;
  };
  E.ctx.__ss = { getSheetByName: function (n) { return hojas[n] || null; }, insertSheet: function (n) { hojas[n] = hoja(n); return hojas[n]; } };
  E.ctx.SpreadsheetApp.ProtectionType = { SHEET: 'SHEET' };
  E.ctx.__r = r;
  E.run('escribirFormulariosSinFila_(__r, __ss); escribirFormulariosSinFila_(__r, __ss)');
  const h = hojas['FORMULARIOS_SIN_FILA'];
  ok(!!h && h.v[0][0] === 'Un formulario sin fila suele ser una reunión que falta cargar en la base.', 'arriba: "Un formulario sin fila suele ser una reunión que falta cargar en la base."');
  ok(/^10 formularios de B con fecha entre el 08\/09\/2026 y el 08\/10\/2026 sin fila en la base\. No se listan: 1 gemelos descartados, 1 con 0 inscriptos, 1 gemelos de uno que ya tiene fila y 1 de reuniones futuras/.test(h.v[1][0]),
     'el resumen: cuántos y los que no se listan');
  ok(h.v[3].join('|') === 'Formulario|Fecha|Inscriptos|Figura (del nombre)|Lugar (del nombre)|Motivo|Fila más cercana' && h.congeladas === 4,
     'el encabezado (fila 4), congelado');
  ok(h.v[4][0] === 'Jorge Macri - 7/10' && h.v.length === 14 && /En revisión/.test(h.v.map(function (x) { return x[5]; }).join(' ')), 'un formulario por línea (10), el más reciente primero');
  ok(h.prot && h.prot.adv && h.prot.d === E.cfg('DESC_PROTECCION_FORMS_SIN_FILA'), 'protegida con advertencia (y una sola: reescrita dos veces)');
  ok(!hojas['RVD JM-CM - ES'], 'no toca la solapa de la base');
}

console.log('[4] apagado, el gancho, el paso 65 y la GUÍA');
{
  const fs = require('fs'), path = require('path');
  const src = function (f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); };
  ok(E.cfg('FORMULARIOS_SIN_FILA_ACTIVA') === false, 'FORMULARIOS_SIN_FILA_ACTIVA = false (apagado hasta el paso 65)');
  ok(/if \(FORMULARIOS_SIN_FILA_ACTIVA && quiere\(RDV_HOJA_FORMS_SIN_FILA\)\) \{\s*_intentar_\(/.test(src('20_UpsertDestino.js')), 'escribirReportes_: sólo con el interruptor, aislado (_intentar_)');
  ok(/decisiones: decisiones, emp: emp, usados: usados \};/.test(src('20_UpsertDestino.js')), 'el plan devuelve `usados`');
  ok(/function paso65_formulariosSinFila_enSeco\(\) \{[\s\S]*?return medirFormulariosSinFila\(\);/.test(src('99_Correr.js')), 'paso 65 → medirFormulariosSinFila()');
  ok(/SOLAPA FORMULARIOS_SIN_FILA/.test(src('43_Ayuda.js')) && /falta cargar en la base/.test(src('43_Ayuda.js')), 'la GUÍA la explica');
  E.ctx.__r2 = r;
  E.run('logFormulariosSinFila_(__r2)');
  ok(/=== FORMULARIOS SIN FILA \(de 08\/09\/2026 a 08\/10\/2026\): 10 ===/.test(E.log()) && /por motivo: /.test(E.log()) && /motivo: Sin ninguna fila de Ruth Landerreche/.test(E.log()),
     'el log del paso 65: cuántos, por motivo y uno por uno');
}

console.log('\n' + chequeos + ' chequeos.');
console.log(fallas ? fallas + ' FALLA(S)' : 'Todo en verde.');
process.exit(fallas ? 1 : 0);
