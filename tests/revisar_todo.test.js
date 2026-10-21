/**
 * tests/revisar_todo.test.js — revisarTodo() (52_RevisarTodo.js, 16/10): los pasos de revisión de sólo lectura en orden, cada
 * uno aislado; el progreso en una propiedad; para con menos de 60 s y sigue donde quedó; un paso que corta la ejecución se
 * reintenta y después se saltea; TERMINADO + resumen y borra el progreso; reiniciarRevisarTodo().
 *
 *     node tests/revisar_todo.test.js
 *
 * NO sube a Apps Script. Sin datos reales.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');

let chequeos = 0, fallas = 0;
function ok(c, q) { chequeos++; console.log((c ? '  ok   ' : '  FALLA ') + q); if (!c) fallas++; }

function entorno() {
  const logs = [], props = {}, llamados = [];
  const ctx = {
    Logger: { log: function (fmt) { const a = Array.prototype.slice.call(arguments, 1); let k = 0; logs.push(String(fmt).replace(/%s/g, function () { return String(a[k++]); })); } },
    PropertiesService: { getScriptProperties: function () {
      return { getProperty: function (k) { return props[k] == null ? null : props[k]; }, setProperty: function (k, v) { props[k] = String(v); },
               deleteProperty: function (k) { delete props[k]; } };
    } },
    console: console, Math: Math, JSON: JSON, Date: Date, String: String, Object: Object, Array: Array, RegExp: RegExp
  };
  vm.createContext(ctx);
  ['00_Config.js', '01_Utils.js', '52_RevisarTodo.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), ctx, { filename: f });
  });
  const E = { ctx: ctx, logs: logs, props: props, llamados: llamados, t: 1000000, dur: {}, rompe: {} };
  ctx.__E = E;
  vm.runInContext('_revisarAhora_ = function () { return __E.t; };', ctx);
  // los wrappers de 99_Correr.js, de mentira: cada uno anota que corrió, avanza el reloj y devuelve un resumen
  [[68, 'paso68_auditoriaCancelaciones'], [69, 'paso69_duplicadosAgenda'], [70, 'paso70_reglasAgenda_enSeco'], [71, 'paso71_conjuntoRepetido_enSeco'],
   [72, 'paso72_agendaDirecta_enSeco'], [73, 'paso73_copiarAgendaDirecta_enSeco'], [74, 'paso74_copiarAgendaDirecta'], [75, 'paso75_agendaSegura_enSeco'],
   [76, 'paso76_replayAgendaSegura'], [78, 'paso78_cancelacionAutomatica'], [80, 'paso80_probarMailAvisos'], [81, 'paso81_auditoriaSemanal_enSeco'],
   [82, 'paso82_instalarAuditoriaSemanal'], [91, 'paso91_cancelarFila825_enSeco'], [92, 'paso92_cancelarFila825'], [93, 'paso93_cancelacionesMail'],
   [94, 'paso94_eleccionesAgenda'], [95, 'paso95_cancelacionesConjunto']].forEach(function (x) {
    ctx[x[1]] = function () {
      llamados.push(x[0]);
      E.t += (E.dur[x[0]] || 10) * 1000;
      // el límite de 6 min corta la ejecución sin pasar por ningún catch: se guarda la propiedad como estaba en ese momento
      // (con el paso "en curso") y, al volver, se restaura, como si lo de después nunca hubiera corrido
      if (E.rompe[x[0]] === 'muere') { E.alMorir = Object.assign({}, props); throw new Error('muerte simulada'); }
      if (E.rompe[x[0]]) throw new Error('falla simulada ' + x[0]);
      return { resumen: { reuniones: x[0], ok: true } };
    };
  });
  E.run = function (e) { return vm.runInContext(e, ctx); };
  E.correr = function () {
    E.t += 3600 * 1000;   // otra ejecución: el reloj sigue
    E.alMorir = null;
    const r = E.run('revisarTodo_()');
    if (E.alMorir) {
      Object.keys(props).forEach(function (k) { delete props[k]; });
      Object.assign(props, E.alMorir);
      return { murio: true };
    }
    return r;
  };
  return E;
}
const prog = function (E) { return E.props.REVISAR_TODO_PROGRESO ? JSON.parse(E.props.REVISAR_TODO_PROGRESO) : null; };

console.log('[1] todo rápido: en orden, sin 74 / 80 / 82, TERMINADO y borra el progreso');
let E = entorno();
let r = E.correr();
ok(E.llamados.join(',') === '68,69,70,71,72,73,75,76,78,81,91,93,94,95', 'en orden, sólo los de sólo lectura (' + E.llamados.join(',') + ')');
ok(E.llamados.indexOf(74) < 0 && E.llamados.indexOf(80) < 0 && E.llamados.indexOf(82) < 0 && E.llamados.indexOf(92) < 0, 'no corre el 74 (escribe), el 80 (mail), el 82 (activador) ni el 92 (suspende la 825)');
ok(r.terminado === true && !prog(E) && E.logs.some(function (l) { return /TERMINADO/.test(l); }), 'TERMINADO y el progreso se borró');
ok(E.logs.some(function (l) { return /paso 76 \(.*\): OK \(10 s\) \| reuniones 76 · ok true/.test(l); }), 'el RESUMEN corto por paso (OK, segundos y lo que devolvió)');

console.log('[2] un paso que falla no corta los demás');
E = entorno();
E.rompe[70] = true;
r = E.correr();
ok(r.terminado && E.llamados.length === 14 && /^FALLÓ \(10 s\): falla simulada 70/.test(r.resumen['70']), 'el 70 falla, se anota y siguen los demás');

console.log('[3] sin tiempo: para con "FALTAN" y la siguiente sigue donde quedó');
E = entorno();
E.dur = { 68: 120, 69: 120, 70: 100 };        // a los 340 s de la ejecución quedan 20 s
r = E.correr();
ok(!r.terminado && E.llamados.join(',') === '68,69,70' && r.faltan.join(',') === '71,72,73,75,76,78,81,91,93,94,95' &&
   E.logs.some(function (l) { return /FALTAN: 71, 72, 73, 75, 76, 78, 81, 91, 93, 94, 95 — volvé a correr revisarTodo\(\)/.test(l); }),
   'se corta antes del 71 y dice qué falta');
ok(prog(E) && prog(E).hechos['70'] === true && !prog(E).hechos['71'], 'el progreso quedó guardado');
E.llamados.length = 0;
r = E.correr();
ok(r.terminado && E.llamados.join(',') === '71,72,73,75,76,78,81,91,93,94,95' && !prog(E), 'la segunda ejecución sigue en el 71 y termina');
ok(Object.keys(r.resumen).length === 14, 'el resumen final tiene los 14 pasos (de las dos ejecuciones)');

console.log('[4] un paso largo (el replay, 280 s) espera a una ejecución nueva');
E = entorno();
E.dur = { 68: 30, 69: 30, 70: 30, 71: 30, 72: 30, 73: 30, 75: 30 };   // a los 210 s quedan 150: el 76 necesita 280
r = E.correr();
ok(!r.terminado && E.llamados[E.llamados.length - 1] === 75 && r.faltan[0] === 76, 'para antes del 76 (quedaban 150 s)');
E.llamados.length = 0;
r = E.correr();
ok(r.terminado && E.llamados[0] === 76, 'en la ejecución siguiente el 76 va primero');

console.log('[5] un paso que corta la ejecución por el límite: se reintenta una vez y después se saltea');
E = entorno();
E.rompe[75] = 'muere';
r = E.correr();
ok(r.murio && prog(E).enCurso === 75, 'la ejecución muere en el 75: queda "en curso"');
E.llamados.length = 0;
r = E.correr();
ok(r.murio && E.llamados[0] === 75 && prog(E).intentos['75'] === 1, 'la siguiente lo reintenta (1 corte anotado)');
E.llamados.length = 0;
r = E.correr();
ok(r.terminado && E.llamados.indexOf(75) < 0 && /^SALTEADO/.test(r.resumen['75']) && E.llamados.join(',') === '76,78,81,91,93,94,95',
   'al segundo corte se saltea y sigue con los demás');

console.log('[6] reiniciarRevisarTodo() empieza de cero');
E = entorno();
E.dur = { 68: 320 };
E.correr();
ok(prog(E) && prog(E).hechos['68'], 'quedó un progreso a medias');
E.run('reiniciarRevisarTodo_()');
E.llamados.length = 0; E.dur = {};
r = E.correr();
ok(!E.props.REVISAR_TODO_PROGRESO && E.llamados[0] === 68 && r.terminado, 'borrado: la siguiente empieza por el 68');

console.log('[7] el wrapper de 99_Correr.js y el archivo no escribe nada más que su propiedad');
const correr = fs.readFileSync(path.join(RAIZ, '99_Correr.js'), 'utf8'), src = fs.readFileSync(path.join(RAIZ, '52_RevisarTodo.js'), 'utf8');
ok(/function revisarTodo\(\) \{[\s\S]*?return revisarTodo_\(\);/.test(correr) && /function reiniciarRevisarTodo\(\) \{\s*return reiniciarRevisarTodo_\(\);/.test(correr),
   'revisarTodo() y reiniciarRevisarTodo() en 99_Correr.js, sin lógica propia');
ok(!/setValue|setValues|appendRow|insertSheet|deleteRow|\.clear\(|sendEmail|newTrigger|setBackground/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')),
   '52_RevisarTodo.js no escribe planillas, ni manda mails, ni crea activadores');

console.log('[8] 21/10: c19_cierre_soloLectura (00_Correr.js): c13, c20, c30, c40, c44 con la misma mecánica y LISTO / NO LISTO por paso');
{
  const E8 = entorno();
  const orden = [];
  const res = {
    c13: { cuenta: { reprogramada: 2, suspendida: 5, coincide: 6, noCoincide: 1, pasaria: 0, marcariaHoy: 0 } },
    c20: { clases: { sinClase: [] }, copiaNueva: { desalineada: false, cambios: 0, clavesRepetidas: 0 }, prueba: { frena: true }, ocultarProteger: { ocultar: 14, proteger: 35 } },
    c30: { solapas: [{ nombre: 'SIN_MATCH', salen: 4 }], problemas: [] },
    c40: { fuente: 'respaldo', motivo: 'no está la solapa', columnas: ['Info'], renglones: 3 },
    c44: { ok: false, res: { noOk: ['a', 'b'] }, cancelNota: '' }
  };
  [['c13', 'c13_reprogramadas'], ['c20', 'c20_guardian_enSeco'], ['c30', 'c30_corteRevision_enSeco'], ['c40', 'c40_agendaDirecta_enSeco'],
   ['c44', 'c44_auditoriaSemanal_enSeco']].forEach(function (x) {
    E8.ctx[x[1]] = function () { orden.push(x[0]); E8.t += (E8.dur[x[0]] || 10) * 1000; return res[x[0]]; };
  });
  E8.dur = { c30: 300 };   // el c30 tarda: quedan menos de 60 s, c40 y c44 no entran en esta ejecución
  E8.t += 3600 * 1000;
  let r8 = E8.run('cierreSoloLectura_()');
  ok(!r8.terminado && orden.join(',') === 'c13,c20,c30' && r8.faltan.join(',') === 'c40,c44' &&
     E8.logs.some(function (l) { return /FALTAN: c40, c44 — volvé a correr c19_cierre_soloLectura\(\)/.test(l); }) && E8.props.CIERRE_SOLO_LECTURA_PROGRESO && !E8.props.REVISAR_TODO_PROGRESO,
     'sin tiempo: "FALTAN: c40, c44 — volvé a correr c19_cierre_soloLectura()", con su propia propiedad (no la de revisarTodo)');
  orden.length = 0; E8.dur = {}; E8.t += 3600 * 1000;
  r8 = E8.run('cierreSoloLectura_()');
  ok(r8.terminado && orden.join(',') === 'c40,c44' && !E8.props.CIERRE_SOLO_LECTURA_PROGRESO, 'la siguiente sigue donde quedó (c40, c44), TERMINADO y borra el progreso');
  ok(/^LISTO para decidir AGENDA_REPROGRAMADA: Reprogramada 2 \| Suspendida 5 \| coinciden 6 \| NO coinciden 1 \(mirar en el log cuáles\)/.test(r8.resumen.c13),
     'c13: LISTO para decidir, con los números — ' + r8.resumen.c13);
  ok(/^LISTO: ninguna columna sin clase, la copia nueva da 0, la prueba frena/.test(r8.resumen.c20), 'c20: LISTO — ' + r8.resumen.c20);
  ok(/^LISTO \(VERIFICACIÓN OK\) \| dejan de aparecer: SIN_MATCH −4/.test(r8.resumen.c30), 'c30: LISTO — ' + r8.resumen.c30);
  ok(/^NO LISTO: se usaría el respaldo \(no está la solapa\)/.test(r8.resumen.c40), 'c40: NO LISTO con el motivo — ' + r8.resumen.c40);
  ok(/^LISTO: la solapa y el mail se arman \| la auditoría tiene 2 para mirar/.test(r8.resumen.c44), 'c44: lo que hay que mirar — ' + r8.resumen.c44);
  ok(E8.logs.some(function (l) { return /paso c40 \(.*\): NO LISTO: se usaría el respaldo/.test(l); }), 'el RESUMEN del log: una línea por paso');
  // NO LISTO del guardián y del corte
  res.c20 = { clases: { sinClase: ['Columna Nueva'] }, copiaNueva: { desalineada: false, cambios: 3, clavesRepetidas: 0 }, prueba: { frena: false } };
  res.c30 = { solapas: [], problemas: ['x'] };
  orden.length = 0; E8.t += 3600 * 1000;
  r8 = E8.run('cierreSoloLectura_()');
  ok(r8.terminado && orden.join(',') === 'c13,c20,c30,c40,c44', 'al volver a correr después de TERMINADO, empieza de cero (todo se recalcula)');
  ok(/^NO LISTO: 1 columnas SIN CLASE \(Columna Nueva\) \| con una copia nueva da 3 cambios .* \| la prueba del orden parcial NO FRENA/.test(r8.resumen.c20), 'c20: NO LISTO con los motivos — ' + r8.resumen.c20);
  ok(/^NO LISTO: DESAPARECERÍA ALGO/.test(r8.resumen.c30), 'c30: NO LISTO si desaparecería algo — ' + r8.resumen.c30);
  const c00 = fs.readFileSync(path.join(RAIZ, '00_Correr.js'), 'utf8');
  ok(/function c19_cierre_soloLectura\(\) \{[\s\S]*?return cierreSoloLectura_\(\);/.test(c00), 'c19_cierre_soloLectura() en 00_Correr.js, sin lógica propia');
}

console.log('\n' + chequeos + ' chequeos.');
if (fallas) { console.log(fallas + ' FALLA(S)'); process.exit(1); }
console.log('Todo en verde.');
