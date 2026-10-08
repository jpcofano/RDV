/**
 * tests/ubicacion.test.js — la UBICACIÓN EN TRES NIVELES (07/10, UBICACION_TRES_NIVELES): `compararUbicacion_` y sus
 * ubicaciones (fila, formulario, texto de RDV CONJUNTO / "Lugar (mail)", reunión del mail), y `puntuar_` con la regla
 * de antes y con la nueva.
 *
 *     node tests/ubicacion.test.js
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: figuras de la columna Figura y barrios de la
 * Ciudad (públicos); los formularios, inventados.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', '41_AgendaParser.js', '42_BarriosCabaGeo.js', '20_UpsertDestino.js',
                  '40_Agenda.js'];

const pad = function (n) { return ('0' + n).slice(-2); };
const ctx = {
  console: console, Date: Date, Math: Math, JSON: JSON, Map: Map, Set: Set,
  Logger: { log: function () {} },
  Utilities: {
    formatDate: function (d, tz, f) {
      return f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()))
        .replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes()));
    }
  }
};
vm.createContext(ctx);
ARCHIVOS.forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), ctx, { filename: f }); });

// Figuras (la columna Figura del destino) y barrios (Comunas, con la columna I del eje), sin planillas.
const FIGURAS = ['Clara Muzzio', 'Hernán Lombardi', 'Gabino Tapia', 'Gustavo Arengo Piragine', 'Jorge Macri', 'Ruth Landerreche'];
// [barrio, comuna, eje de la columna I]: Flores tiene eje "Sur" en Comunas; eso NUNCA es el eje de una fila (30/09).
const BARRIOS = [['Recoleta', 2, ''], ['Almagro', 5, ''], ['Núñez', 13, 'Norte'], ['Belgrano', 13, 'Norte'], ['Palermo', 14, 'Norte'],
                 ['San Nicolás', 1, 'Este'], ['Retiro', 1, 'Norte'], ['Monserrat', 1, ''], ['San Telmo', 1, ''], ['Flores', 7, 'Sur'],
                 ['Parque Chacabuco', 7, 'Oeste'], ['Caballito', 6, 'Centro'], ['Villa General Mitre', 11, '']];
ctx.__figs = FIGURAS.map(function (f) { return [f]; });
ctx.__barrios = BARRIOS;
vm.runInContext(`
  usarFigurasDelBloque_(['Figura'], __figs);
  _cacheParsing_.barrios = __barrios.map(function (b) {
    return { canon: b[0], norm: _expandirAbreviaturas_(normalizeText_(b[0])), comuna: b[1], zona: '', ejeRaw: b[2] };
  }).sort(function (a, b) { return b.norm.length - a.norm.length; });
  _cacheParsing_.barrios.ejeValido = true;
  _cacheParsing_.barrios.encabezadoEje = 'Eje geográfico';
`, ctx);
const run = function (expr) { return vm.runInContext(expr, ctx); };
const J = JSON.stringify;

let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }

// Una ubicación, en una línea: "barrio|comuna|subzona|eje|deComuna".
const u = function (expr) {
  const x = run(expr);
  return [x.barrio, x.comuna == null ? '' : x.comuna, x.subzona, x.eje, x.deComuna].join('|');
};

console.log('[1] el texto suelto (RDV CONJUNTO, "Lugar (mail)")');
ok(u('ubicacionDeTexto_("C3")') === '|3|||dicha', '"C3" → comuna 3');
ok(u('ubicacionDeTexto_("Comuna 1 Sur")') === '|1|Sur||dicha', '"Comuna 1 Sur" → comuna 1, subzona Sur');
ok(u('ubicacionDeTexto_("C1N")') === '|1|Norte||dicha', '"C1N" → comuna 1, subzona Norte');
ok(u('ubicacionDeTexto_("Eje Oeste")') === '|||Oeste|', '"Eje Oeste" → eje Oeste, sin comuna');
ok(!run('tieneUbicacion_(ubicacionDeTexto_("Eje Marte"))'), '"Eje Marte" (desconocido) → nada');
ok(u('ubicacionDeTexto_("Palermo")') === 'Palermo|14|||barrio', '"Palermo" → barrio, con su comuna');
ok(u('ubicacionDeTexto_("Montserrat")') === 'Monserrat|1|Sur||barrio', '"Montserrat" → Monserrat (la otra grafía), C1 Sur');
ok(u('ubicacionDeTexto_("Villa Gral. Mitre")') === 'Villa General Mitre|11|||barrio', '"Villa Gral. Mitre" → Villa General Mitre');

console.log('[2] la fila del destino: barrio; comuna del barrio o del mail; el eje SÓLO del mail');
ok(u('ubicacionDeFila_({ barrio: "Flores", lugarMail: "" })') === 'Flores|7|||barrio',
   'Flores sin mail: comuna 7 y SIN eje (el "Sur" de Comunas no es el eje de la fila)');
ok(u('ubicacionDeFila_({ barrio: "", lugarMail: "Comuna 6" })') === '|6|||mail', 'sin barrio, el mail dice Comuna 6 → comuna 6 (del mail)');
ok(u('ubicacionDeFila_({ barrio: "", lugarMail: "Eje Oeste" })') === '|||Oeste|', 'sin barrio, el mail dice Eje Oeste → eje Oeste');
ok(u('ubicacionDeFila_({ barrio: "Flores", lugarMail: "Eje Oeste" })') === 'Flores|7||Oeste|barrio', 'con barrio y el eje del mail: los dos');
ok(u('ubicacionDeFila_({ barrio: "Flores", lugarMail: "Comuna 6" })') === 'Flores|7|||barrio', 'con barrio, la comuna es la del barrio (no la del mail)');
ok(u('ubicacionDeFila_({ barrio: "", lugarMail: "Palermo" })') === '|14|||mail', 'sin barrio, el mail dice un barrio → su comuna (no el barrio)');
ok(!run('tieneUbicacion_(ubicacionDeFila_({ barrio: "", lugarMail: "Comuna 6" }, true))'), 'sin lo del mail (la agenda): nada');

console.log('[3] la comparación: el nivel más preciso que tengan LAS DOS');
const cmp = function (a, b) { const k = run('compararUbicacion_(' + a + ', ' + b + ')'); return k.nivel + ':' + k.coincide + (k.porSubzona ? ':sub' : ''); };
const F = function (barrio, mail) { return 'ubicacionDeFila_({ barrio: ' + J(barrio) + ', lugarMail: ' + J(mail || '') + ' })'; };
const T = function (t) { return 'ubicacionDeTexto_(' + J(t) + ')'; };
ok(cmp(T('Palermo'), F('Palermo')) === 'barrio:true' && cmp(T('Belgrano'), F('Núñez')) === 'barrio:false',
   'barrio con barrio: igual / distinto (aunque sea la misma comuna)');
ok(cmp(T('C7'), F('Flores')) === 'comuna:true' && cmp(T('C6'), F('Flores')) === 'comuna:false', 'comuna con la comuna del barrio');
ok(cmp(T('Belgrano'), F('', 'Comuna 13')) === 'comuna:true' && cmp(T('Palermo'), F('', 'Comuna 13')) === 'comuna:false',
   'un barrio contra una fila sin barrio: comuna con la comuna del mail');
ok(cmp(T('C1N'), F('', 'Comuna 1 Sur')) === 'comuna:false:sub' && cmp(T('C1'), F('', 'Comuna 1 Sur')) === 'comuna:true',
   'la Comuna 1: la subzona cuando las dos la tienen; si una sola, alcanza la comuna');
ok(cmp(T('C1N'), F('San Telmo')) === 'comuna:false:sub' && cmp(T('C1S'), F('San Telmo')) === 'comuna:true:sub',
   'C1N contra San Telmo (C1 Sur): no; C1S: sí');
ok(cmp(T('Eje Oeste'), F('', 'Eje Oeste')) === 'eje:true' && cmp(T('Eje Norte'), F('', 'Eje Oeste')) === 'eje:false',
   'eje con el eje del MAIL');
ok(cmp(T('Eje Sur'), F('Flores')) === ':null', 'eje contra una fila sin eje del mail: no se compara (nunca contra el eje de Comunas)');
ok(cmp(T('Eje Oeste'), F('', 'Comuna 6')) === ':null', 'eje contra comuna: no se compara');
ok(cmp(T('Villa Gral. Mitre'), F('Villa General Mitre')) === 'barrio:true', '"Villa Gral. Mitre" = "Villa General Mitre"');
ok(cmp('ubicacionDeEvento_({ barrio: "", comuna: 13, subzona: null, eje: "" })', F('Belgrano')) === 'comuna:true' &&
   cmp('ubicacionDeEvento_({ barrio: "Belgrano", comuna: null, eje: "" })', F('Núñez')) === 'barrio:false' &&
   cmp('ubicacionDeEvento_({ barrio: "", comuna: null, eje: "eje oeste" })', F('', 'Eje Oeste')) === 'eje:true',
   'la reunión del mail: comuna, barrio (con barrio en la fila, barrio con barrio) y eje');

console.log('[4] el flag y la medición');
const porDefecto = run('UBICACION_TRES_NIVELES');
ok(run('usarUbicacion3_()') === porDefecto, 'sin forzar: UBICACION_TRES_NIVELES (' + porDefecto + '; prendido el 07/10)');
ok(run('conUbicacion3_(!UBICACION_TRES_NIVELES, function () { return usarUbicacion3_(); })') === !porDefecto &&
   run('usarUbicacion3_()') === porDefecto, 'conUbicacion3_ la fuerza y la deja como estaba');
let tiro = false;
try { run('conUbicacion3_(!UBICACION_TRES_NIVELES, function () { throw new Error("x"); })'); } catch (e) { tiro = true; }
ok(tiro && run('usarUbicacion3_()') === porDefecto, 'también si la función tira');

console.log('[5] puntuar_: la regla de antes y la de los tres niveles');
ctx.__fin = new Date(2026, 9, 5, 12);
const form = function (nombre) {
  ctx.__n = nombre;
  return run(`(function () { const limpio = limpiarPrefijos_(__n); return {
    fila: 2, nombre: __n, figurasNorm: figurasEnTexto_(__n).map(normalizeText_), figurasApellidoNorm: figurasPorApellido_(__n).map(normalizeText_),
    figurasVarianteNorm: figurasPorVariante_(__n).map(normalizeText_), barrio: detectBarrio_(limpio), comuna: detectComuna_(limpio),
    subzona: detectSubzonaComuna1_(limpio), eje: detectEje_(limpio), horaMin: _horaEnMinutos_(limpio),
    det: detectFecha_(limpio, __fin), inscriptos: 20 }; })()`);
};
const fila = function (figura, barrio, lugarMail) {
  return { fila: 815, figura: figura, barrio: barrio, fecha: new Date(2026, 9, 7, 12), horaMin: null, evento: '', lugarMail: lugarMail };
};
const comunas = new Map(BARRIOS.map(function (b) { return [run('normalizeText_(' + J(b[0]) + ')'), b[1]]; }));
ctx.__comunas = comunas;
const sc = function (tres, f, c) {
  ctx.__f = f; ctx.__c = c;
  return run('conUbicacion3_(' + tres + ', function () { return puntuar_(__f, __c, __comunas); })');
};
const f815 = fila('Hernán Lombardi', '', 'Eje Oeste');
const conjunta = form('RDV - Eje Oeste, Lombardi-Tapia-Piragine - 7/10');
let a = sc(false, f815, conjunta), b = sc(true, f815, conjunta);
ok(a.score === 1 && !a.evaluables.ubic && b.score === 1 && b.evaluables.ubic && /eje_mail/.test(b.nivel) && !b.desacuerdo,
   '815 (Lombardi 07/10, mail Eje Oeste) ↔ "… Eje Oeste … 7/10": antes no se comparaba; ahora coincide por el eje del mail (' + b.nivel + ')');
const ejeNorte = form('Hernán Lombardi - Eje Norte - 7/10');
a = sc(false, f815, ejeNorte); b = sc(true, f815, ejeNorte);
ok(!a.desacuerdo && b.desacuerdo, 'un formulario del Eje Norte contra la 815: antes no se comparaba; ahora es OTRA ubicación');
ctx.__f = f815; ctx.__c = ejeNorte;
ok(/form dice Eje Norte \/ el mail dice Eje Oeste/.test(run('conUbicacion3_(true, function () { return _detalleDesacuerdo_(__f, __c, __comunas); })')),
   'el desacuerdo en palabras: "form dice Eje Norte / el mail dice Eje Oeste"');
const sinBarrio7 = fila('Clara Muzzio', '', 'Comuna 7');
const c6 = form('CLARA MUZZIO - Encuentro con vecinos - Comuna 6 - 7/10'), c7 = form('CLARA MUZZIO - Encuentro con vecinos - Comuna 7 - 7/10');
a = sc(false, sinBarrio7, c6); b = sc(true, sinBarrio7, c6);
ok(!a.desacuerdo && b.desacuerdo, 'fila sin barrio, el mail dice Comuna 7: un formulario de la Comuna 6 ahora es otra ubicación');
b = sc(true, sinBarrio7, c7);
ok(!b.desacuerdo && b.score === 1 && /comuna_mail/.test(b.nivel), 'y el de la Comuna 7 coincide por la comuna del mail (' + b.nivel + ')');
const sinFigEje = form('VÍNCULO CIUDADANO - Encuentro con vecinos sobre Seguridad - Eje Oeste - 7/10');
b = sc(true, f815, sinFigEje);
ok(!b.porSinFigura && b.score < 0.88, 'un formulario SIN figura con sólo el eje: no le gana la fila (el eje no alcanza; ' + b.score + ')');
const sinFigC7 = form('VÍNCULO CIUDADANO - Encuentro con vecinos sobre Seguridad - Comuna 7 - 7/10');
b = sc(true, sinBarrio7, sinFigC7);
ok(b.porSinFigura && b.score === 1, 'uno sin figura con la comuna del mail: sí (como con el barrio, SIN_FIGURA_POR_UBICACION)');
const flores = fila('Jorge Macri', 'Flores', ''), ejeSur = form('JORGE MACRI - Encuentro Temático "Salud" - Eje Sur - 7/10');
a = sc(false, flores, ejeSur); b = sc(true, flores, ejeSur);
ok(a.ejeCoincide && !b.ejeCoincide && !b.evaluables.ubic,
   'el desempate por eje: antes, el eje de Comunas (Flores = Sur); ahora sólo el del mail (la fila no tiene: neutro)');
const igual = form('JORGE MACRI - Encuentro con vecinos - Comuna 7 - 7/10');
a = sc(false, flores, igual); b = sc(true, flores, igual);
ok(a.score === b.score && a.nivel === b.nivel && a.desacuerdo === b.desacuerdo, 'una fila con barrio y un formulario con comuna: igual que antes (' + b.nivel + ')');

console.log('[6] la tanda del 07/10: el barrio desde la dirección con el eje del mail, y la conjunta');
const regla = function (on, res, ev) { ctx.__res = res; ctx.__ev = ev; return run('conCambios0710_(' + on + ', function () { return _reglaBarrio_(__res, __ev); })'); };
const evEje = { eje: 'Oeste', comuna: null, barrio: '' };
let rb = regla(true, { estado: 'ok', barrio: 'Parque Chacabuco', comuna: 7 }, evEje);
ok(rb.cumple && /eje/.test(rb.por) && !rb.nota, 'el mail trae Eje Oeste y la dirección cae en un barrio del Eje Oeste: cumple, sin nota');
rb = regla(true, { estado: 'ok', barrio: 'Flores', comuna: 7 }, evEje);
ok(rb.cumple && /Flores es del Eje Sur .* el mail dice Eje Oeste/.test(rb.nota || ''),
   'la dirección cae en Flores (Eje Sur en Comunas): cumple igual, y se anota (30/09)');
ok(!regla(true, { estado: 'aproximada', barrio: 'Flores', comuna: 7 }, evEje).cumple, 'sin geocodificación "ok", no');
ok(!regla(false, { estado: 'ok', barrio: 'Flores', comuna: 7 }, evEje).cumple, 'con la tanda apagada, como antes: el eje no alcanza');
ok(run('mismoConjunto_(["a", "b", "c"], ["c", "a", "b", "a"])') && !run('mismoConjunto_(["a", "b"], ["a", "b", "c"])') &&
   !run('mismoConjunto_([], [])'), 'mismoConjunto_: el mismo conjunto sin importar el orden; un subconjunto no');
const conj = Object.assign(fila('Hernán Lombardi', '', 'Eje Oeste'),
  { figurasConjunta: ['hernan lombardi', 'gabino tapia', 'clara muzzio'], conjuntaCon: 'Gabino Tapia / Clara Muzzio' });
const fConj = form('RDV - Eje Oeste, Lombardi-Tapia-Muzzio - 7/10'), fSub = form('RDV - Eje Oeste, Lombardi-Tapia - 7/10');
const scC = function (on, f, c) { ctx.__f = f; ctx.__c = c; return run('conCambios0710_(' + on + ', function () { return puntuar_(__f, __c, __comunas); })'); };
a = scC(true, conj, fConj);
ok(a.conjunta && !a.multiFigura && /conjunta/.test(a.nivel), 'la conjunta: exactamente sus tres figuras → no es multi_figura (' + a.nivel + ')');
ok(scC(true, conj, fSub).multiFigura && !scC(true, conj, fSub).conjunta, 'dos de las tres figuras: multi_figura (revisión), como siempre');
ok(scC(false, conj, fConj).multiFigura, 'con la tanda apagada: multi_figura, como antes');
const conjLejos = Object.assign({}, conj, { fecha: new Date(2026, 9, 9, 12) });
ok(!scC(true, conjLejos, fConj).conjunta, 'a más de ±1 día (DIAS_CONJUNTA): no es la conjunta');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
