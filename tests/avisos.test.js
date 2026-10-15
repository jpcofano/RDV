/**
 * tests/avisos.test.js — la AUDITORÍA SEMANAL y los AVISOS POR MAIL (50_Avisos.js, 15/10, H5 y H6), en Node, con MailApp,
 * ScriptApp, PropertiesService y SpreadsheetApp SIMULADOS, y la corrida de la hora de 49_Corridas.js (los hooks).
 *
 *     node tests/avisos.test.js
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: las reuniones, figuras y textos son inventados.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '49_Corridas.js', '50_Avisos.js'];
const pad = function (n) { return ('0' + n).slice(-2); };

let fallas = 0, total = 0;
function ok(c, m) { total++; if (c) console.log('  ok  ' + m); else { fallas++; console.log('  FALLA  ' + m); } }

// ============================== el mock ==============================

function crearHoja(E, nombre) {
  const h = { nombre: nombre, v: [], fondos: {}, letra: {} };
  const ultimaFila = function () { for (let i = h.v.length; i >= 1; i--) if ((h.v[i - 1] || []).some(function (x) { return x !== '' && x != null; })) return i; return 0; };
  const ultimaCol = function () { let m = 0; h.v.forEach(function (r) { for (let j = (r || []).length; j >= 1; j--) if (r[j - 1] !== '' && r[j - 1] != null) { m = Math.max(m, j); break; } }); return m; };
  h.api = {
    getName: function () { return nombre; },
    getLastRow: ultimaFila, getLastColumn: ultimaCol,
    clearContents: function () { h.v = []; return h.api; },
    appendRow: function (r) { h.v[ultimaFila()] = r.slice(); return h.api; },
    getDataRange: function () { return h.api.getRange(1, 1, Math.max(ultimaFila(), 1), Math.max(ultimaCol(), 1)); },
    getRange: function (f, c, nf, nc) {
      nf = nf || 1; nc = nc || 1;
      if (E.romperHoja === nombre) throw new Error('Service Spreadsheets timed out (simulado)');
      const rango = {
        getValues: function () {
          const o = [];
          for (let i = 0; i < nf; i++) { const r = []; for (let j = 0; j < nc; j++) { const fila = h.v[f - 1 + i]; r.push(fila && fila[c - 1 + j] !== undefined ? fila[c - 1 + j] : ''); } o.push(r); }
          return o;
        },
        setValues: function (vals) {
          if (vals.length !== nf || vals.some(function (r) { return r.length !== nc; })) throw new Error('setValues: tamaño distinto del rango');
          vals.forEach(function (r, i) { h.v[f - 1 + i] = h.v[f - 1 + i] || []; r.forEach(function (x, j) { h.v[f - 1 + i][c - 1 + j] = x; }); });
          return rango;
        },
        setBackground: function (x) { h.fondos[f] = x; return rango; },
        setFontColor: function (x) { h.letra[f] = x; return rango; },
        setFontWeight: function () { return rango; }
      };
      return rango;
    }
  };
  return h;
}

function crearEntorno(config, ahora) {
  const E = { logs: '', mails: [], props: {}, activadores: [], hojas: {}, ahora: ahora || new Date(2026, 9, 15, 10, 0, 0),
              romperMail: false, romperProps: false, romperHoja: null, sinGetLog: false, formato: [] };
  class D extends Date {
    constructor(...a) { if (a.length === 0) super(E.ahora.getTime()); else super(...a); }
    static now() { return E.ahora.getTime(); }
  }
  E.hoja = function (n) { return E.hojas[n]; };
  E.poner = function (n, v) { const h = crearHoja(E, n); h.v = v.map(function (r) { return r.slice(); }); E.hojas[n] = h; return h; };
  const ss = {
    getSheetByName: function (n) { return E.hojas[n] ? E.hojas[n].api : null; },
    insertSheet: function (n) { E.hojas[n] = crearHoja(E, n); return E.hojas[n].api; }
  };
  const logger = {
    log: function () {
      const a = Array.prototype.slice.call(arguments);
      let s = String(a.shift());
      s = s.replace(/%s/g, function () { return String(a.shift()); });
      E.logs += '[15-10-26 10:00:00:000 ART] ' + s + '\n';
    }
  };
  const ctx = {
    console: console, Date: D, Math: Math, JSON: JSON, Map: Map, Set: Set, Object: Object, Array: Array, String: String, Number: Number,
    Logger: logger,
    Utilities: {
      formatDate: function (d, tz, f) {
        return f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()))
          .replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds()));
      },
      sleep: function () {}
    },
    SpreadsheetApp: { openById: function () { return ss; }, flush: function () {} },
    MailApp: {
      sendEmail: function (o) { if (E.romperMail) throw new Error('Service invoked too many times: email (simulado)'); E.mails.push(o); },
      getRemainingDailyQuota: function () { return 100 - E.mails.length; }
    },
    PropertiesService: { getScriptProperties: function () {
      if (E.romperProps) throw new Error('PropertiesService caído (simulado)');
      return { getProperty: function (k) { return k in E.props ? E.props[k] : null; },
               setProperty: function (k, v) { if (String(v).length > 9216) throw new Error('valor demasiado largo'); E.props[k] = String(v); },
               deleteProperty: function (k) { delete E.props[k]; } };
    } },
    ScriptApp: {
      WeekDay: { MONDAY: 'MONDAY', TUESDAY: 'TUESDAY' },
      getProjectTriggers: function () {
        return E.activadores.map(function (t) { return { getHandlerFunction: function () { return t.fn; }, _t: t }; });
      },
      newTrigger: function (fn) {
        const t = { fn: fn };
        const b = { timeBased: function () { t.tiempo = true; return b; }, onWeekDay: function (d) { t.dia = d; return b; },
                    atHour: function (h) { t.hora = h; return b; }, everyHours: function (h) { t.cada = h; return b; },
                    create: function () { E.activadores.push(t); return t; } };
        return b;
      },
      deleteTrigger: function (x) { const i = E.activadores.indexOf(x._t); if (i >= 0) E.activadores.splice(i, 1); }
    }
  };
  if (!E.sinGetLog) logger.getLog = function () { if (E.sinGetLog) throw new Error('sin getLog'); return E.logs; };
  vm.createContext(ctx);
  config = config || {};
  ARCHIVOS.forEach(function (f) {
    let s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    if (f === '00_Config.js') {
      Object.keys(config).forEach(function (k) {
        const antes = s;
        s = s.replace(new RegExp('^const ' + k + '\\s+=.*', 'm'), function () { return 'const ' + k + ' = ' + config[k] + ';'; });
        if (antes === s) throw new Error('no está la constante ' + k);
      });
    }
    vm.runInContext(s, ctx, { filename: f });
  });
  // lo que en Apps Script viene de 20_UpsertDestino.js
  vm.runInContext('var _ssI_ = null; function ssIntermedia_() { return SpreadsheetApp.openById(RDV_SS_INTERMEDIA); }', ctx);
  E.ctx = ctx;
  E.run = function (expr) { return vm.runInContext(expr, ctx); };
  E.a = function (h, m) { E.ahora = new Date(2026, 9, 15 + (m || 0), h, 0, 0); };   // la hora (y los días después del 15/10)
  return E;
}

const ON = { AVISOS_MAIL_ACTIVO: 'true' };

// ============================== [1] apagado ==============================
console.log('[1] con AVISOS_MAIL_ACTIVO = false (como sube): sólo el log, nada más');
let E = crearEntorno();
ok(E.run('AVISOS_MAIL_ACTIVO') === false && E.run('AUDITORIA_SEMANAL_ACTIVA') === false, 'los dos interruptores, apagados en 00_Config.js');
ok(E.run('AVISOS_MAIL_PARA') === 'jpcofano2@gmail.com', 'el destinatario, en la config');
let r = E.run('registrarAviso_("mail_raro", "un mail sin días")');
ok(r === false && E.mails.length === 0 && /AVISO \[mail_raro\] \(el mail está apagado: sólo el log\): un mail sin días/.test(E.logs), 'registrarAviso_: sólo el log');
E.run('corridaIniciar_(new Date(), false, false); corridaAnotar_("agenda", Date.now(), new Error("x")); corridaCerrar_(new Error("y"))');
E.run('corridaIniciar_(new Date(), false, false); corridaCerrar_(new Error("z"))');
ok(E.mails.length === 0 && !Object.keys(E.props).some(function (k) { return /AVISO/.test(k); }), 'la corrida de la hora: sin mails ni propiedades de avisos (dos corridas con error seguidas)');
ok(E.run('auditoriaSemanalAgenda()') === null && !E.hoja('AUDITORIA_AGENDA'), 'auditoriaSemanalAgenda (el activador): apagada, no hace nada');
let tiro = null;
try { E.run('instalarAuditoriaSemanal_()'); } catch (e) { tiro = e; }
ok(tiro && /AUDITORIA_SEMANAL_ACTIVA = false/.test(tiro.message) && E.activadores.length === 0, 'instalar el activador semanal se niega con la auditoría apagada');
r = E.run('autorizarMailAvisos()');
ok(r === 100 && E.mails.length === 0, 'autorizarMailAvisos: consulta la cuota (pide el permiso) y no manda nada');

// ============================== [2] nunca tira ==============================
console.log('[2] registrarAviso_ nunca tira');
E = crearEntorno(ON);
E.romperMail = true;
r = E.run('registrarAviso_("mail_raro", "x")');
ok(r === true && E.mails.length === 0 && /el mail NO se mandó/.test(E.logs), 'MailApp falla: no tira, lo loguea');
ok(!E.props.AVISO_ULTIMO_mail_raro, 'y no queda como mandado (se reintenta en el próximo aviso)');
E.romperMail = false; E.romperProps = true;
tiro = null;
try { r = E.run('registrarAviso_("mail_raro", "x")'); } catch (e) { tiro = e; }
ok(!tiro && /el tema "mail_raro" no se pudo mandar/.test(E.logs), 'PropertiesService falla: no tira, lo loguea');
E.run('corridaIniciar_(new Date(), false, false)');
tiro = null;
try { r = E.run('registrarAviso_(null, undefined)'); E.run('corridaCerrar_(null)'); } catch (e) { tiro = e; }
ok(!tiro && typeof r === 'boolean', 'tema y texto vacíos, dentro de una corrida sin propiedades: no tira (ni la corrida)');

// ============================== [3] fuera de la corrida: uno por tema por día ==============================
console.log('[3] fuera de la corrida (un paso a mano): manda en el momento, como mucho uno por tema por día');
E = crearEntorno(ON);
E.run('registrarAviso_("mail_raro", "el mail de la semana 19/10 no tiene ningún día")');
E.run('registrarAviso_("mail_raro", "otro raro")');
E.run('registrarAviso_("cancelacion_no_aplicada", "Fulana 22/10: la fila tiene asistentes")');
ok(E.mails.length === 2, 'dos mails: uno por tema (' + E.mails.map(function (m) { return m.subject; }).join(' / ') + ')');
ok(E.mails[0].to === 'jpcofano2@gmail.com' && /^\[RDV\] llegó un mail de agenda raro$/.test(E.mails[0].subject) && /- el mail de la semana 19\/10/.test(E.mails[0].body),
   'el de mail_raro: asunto y texto');
ok(/NO se aplicó/.test(E.mails[1].subject), 'cancelacion_no_aplicada es un aviso inmediato');
ok(/ya se mandó hoy un mail de "mail_raro"/.test(E.logs), 'el segundo mail_raro del día: sólo el log');
E.a(10, 1);
E.run('registrarAviso_("mail_raro", "al día siguiente")');
ok(E.mails.length === 3 && /al día siguiente/.test(E.mails[2].body), 'al día siguiente vuelve a mandar');

// ============================== [4] dentro de la corrida: cola, todo junto al cerrar ==============================
console.log('[4] dentro de la corrida de la hora: a la cola (y a una propiedad); se manda al cerrar, uno por tema');
E = crearEntorno(ON);
E.run('corridaIniciar_(new Date(), false, false)');
E.run('registrarAviso_("invariante_agenda", "la reunión Fulana 20/10 tiene dos filas: 840 y 845")');
E.run('registrarAviso_("invariante_agenda", "la reunión Mengano 21/10 tiene dos filas: 850 y 851")');
E.run('registrarAviso_("mail_raro", "un Re: sin cuerpo")');
ok(E.mails.length === 0, 'en el medio de la corrida no se manda nada');
ok(E.props.AVISOS_COLA && /Mengano/.test(E.props.AVISOS_COLA), 'la cola queda en la propiedad (por si la corrida se corta)');
E.run('corridaCerrar_(null)');
ok(E.mails.length === 2, 'al cerrar: dos mails (' + E.mails.map(function (m) { return m.subject; }).join(' / ') + ')');
const mInv = E.mails.filter(function (m) { return /una reunión, una fila/.test(m.subject); })[0];
ok(mInv && /\(2\)$/.test(mInv.subject) && /Fulana/.test(mInv.body) && /Mengano/.test(mInv.body), 'el del invariante, con los dos textos');
ok(!E.props.AVISOS_COLA, 'la cola se borra');
ok(E.run('_corrida_') === null && E.hoja('REGISTRO_CORRIDAS').v.length === 2, 'la corrida se registró igual (REGISTRO_CORRIDAS)');
console.log('\n--- ejemplo de aviso inmediato ---\nAsunto: ' + mInv.subject + '\n' + mInv.body + '\n---');

// ============================== [5] una corrida cortada: la siguiente manda lo que quedó ==============================
console.log('[5] una corrida que muere por los 6 min: la siguiente manda al EMPEZAR lo que quedó en la cola');
E = crearEntorno(ON);
E.run('corridaIniciar_(new Date(), false, false); corridaEmpieza_("agenda")');
E.run('registrarAviso_("cancelacion_no_aplicada", "Zutana 23/10: ya tiene ID cuentas")');
E.run('_corrida_ = null; _avisosCola_ = null;');   // la ejecución murió: la memoria se pierde, las propiedades no
ok(E.mails.length === 0 && E.props.AVISOS_COLA && E.props.CORRIDA_EN_CURSO, 'murió: la cola y la corrida en curso quedaron en propiedades');
E.a(11);
E.run('corridaIniciar_(new Date(), false, false)');
ok(E.mails.length === 1 && /Zutana/.test(E.mails[0].body), 'la corrida siguiente lo manda al empezar (no espera a cerrar)');
ok(!E.props.AVISOS_COLA, 'y la cola se borra');
ok(JSON.parse(E.props.AVISOS_RACHA_CORRIDAS).malas === 1, 'la cortada cuenta en la racha (1: todavía no avisa)');
E.run('corridaCerrar_(new Error("Exceeded maximum execution time"))');
ok(E.mails.length === 2 && /corridas seguidas cortadas o con error/.test(E.mails[1].subject) && /CORTADA en "agenda"/.test(E.mails[1].body) &&
   /Exceeded maximum execution time/.test(E.mails[1].body), 'cortada + con error = dos seguidas: aviso, con las dos');

// ============================== [6] dos corridas seguidas con error ==============================
console.log('[6] dos corridas seguidas con error (o con error en una parte): un aviso por día; una buena reinicia');
E = crearEntorno(ON);
E.run('corridaIniciar_(new Date(), false, false); corridaAnotar_("ids", Date.now(), new Error("la lista externa no responde")); corridaCerrar_(null)');
ok(E.mails.length === 0, 'una con error en una parte: todavía no');
E.a(11);
E.run('corridaIniciar_(new Date(), false, false); corridaCerrar_(new Error("Service Spreadsheets timed out"))');
ok(E.mails.length === 1 && /Las últimas 2 corridas/.test(E.mails[0].body) && /la lista externa no responde/.test(E.mails[0].body), 'la segunda: aviso');
E.a(12);
E.run('corridaIniciar_(new Date(), false, false); corridaCerrar_(new Error("otra vez"))');
ok(E.mails.length === 1, 'la tercera, el mismo día: no se manda otro');
E.a(13);
E.run('corridaIniciar_(new Date(), false, false); corridaCerrar_(null)');
ok(JSON.parse(E.props.AVISOS_RACHA_CORRIDAS).malas === 0, 'una corrida buena reinicia la racha');
E.run('corridaSinBloqueo_(new Date(), false)');
ok(JSON.parse(E.props.AVISOS_RACHA_CORRIDAS).malas === 0 && E.mails.length === 1, 'una que no arrancó por el bloqueo no cuenta');
E.romperMail = true;
E.a(10, 1);
E.run('corridaIniciar_(new Date(), false, false); corridaCerrar_(new Error("a"))');
E.run('corridaIniciar_(new Date(), false, false); corridaCerrar_(new Error("b"))');
ok(E.hoja('REGISTRO_CORRIDAS').v.length === 8 && E.run('_corrida_') === null, 'MailApp caído: las corridas se registran igual y cierran');

// ============================== [7] una parte salteada tres corridas seguidas ==============================
console.log('[7] una parte salteada por tiempo tres corridas seguidas');
E = crearEntorno(ON);
const salteada = 'corridaIniciar_(new Date(), false, false); corridaAnotar_("agenda", Date.now() - 1000, null); corridaSaltear_("ids"); corridaCerrar_(null)';
E.run(salteada); E.run(salteada);
E.run('corridaIniciar_(new Date(), false, false); corridaAnotar_("ids", Date.now(), null); corridaCerrar_(null)');
E.run(salteada); E.run(salteada);
ok(E.mails.length === 0, 'dos, una que corrió, dos más: no avisa (la que corrió reinicia)');
E.run(salteada);
ok(E.mails.length === 1 && /se saltea por tiempo/.test(E.mails[0].subject) && /ids \(3 seguidas\)/.test(E.mails[0].body), 'la tercera seguida: aviso');
ok(JSON.parse(E.props.AVISOS_RACHA_CORRIDAS).salteadas.agenda === 0, 'la agenda, que corrió, en 0');

// ============================== [8] las suspendidas: un mail por día ==============================
console.log('[8] las suspendidas: se anotan, y salen juntas en UN mail por día desde las 20');
E = crearEntorno(ON);
E.a(10);
E.run('corridaIniciar_(new Date(), false, false)');
E.run('registrarAviso_("suspendidas", "Fulana | 22/10 18:00 | Palermo | fila 840: desapareció del mail")');
E.run('registrarAviso_("suspendidas", "Mengano | 23/10 10:00 | Flores | fila 841: desapareció del mail")');
E.run('corridaCerrar_(null)');
ok(E.mails.length === 0, 'a las 10: no se manda (es un mail por día, desde las 20)');
ok(E.hoja('AVISOS_SUSPENDIDAS') && E.hoja('AVISOS_SUSPENDIDAS').v.length === 3 && E.hoja('AVISOS_SUSPENDIDAS').v[0].join('|') === 'fecha|texto|mandado',
   'anotadas en AVISOS_SUSPENDIDAS (intermedia): encabezado + 2');
E.a(15);
E.run('registrarAviso_("suspendidas", "Zutana | 24/10 11:00 | Caballito | fila 842: desapareció del mail")');   // un paso a mano
ok(E.mails.length === 0 && E.hoja('AVISOS_SUSPENDIDAS').v.length === 4, 'fuera de la corrida también se anota (y tampoco se manda antes de las 20)');
E.a(20);
E.run('corridaIniciar_(new Date(), false, false); corridaCerrar_(null)');
ok(E.mails.length === 1 && /reuniones suspendidas hoy \(3\)$/.test(E.mails[0].subject) && /\[10:00\] Fulana/.test(E.mails[0].body) &&
   /Mengano/.test(E.mails[0].body) && /\[15:00\] Zutana/.test(E.mails[0].body), 'a las 20: UN mail con las tres');
console.log('\n--- ejemplo del mail de las suspendidas ---\nAsunto: ' + E.mails[0].subject + '\n' + E.mails[0].body + '\n---');
ok(E.hoja('AVISOS_SUSPENDIDAS').v.slice(1).every(function (x) { return /15\/10\/2026 20:00/.test(x[2]); }), 'quedan marcadas como mandadas');
E.a(21);
E.run('corridaIniciar_(new Date(), false, false); registrarAviso_("suspendidas", "Perengano | 25/10 | fila 843"); corridaCerrar_(null)');
ok(E.mails.length === 1, 'a las 21, otra: no hay un segundo mail ese día');
E.a(20, 1);
E.run('corridaIniciar_(new Date(), false, false); corridaCerrar_(null)');
ok(E.mails.length === 2 && /\(1\)$/.test(E.mails[1].subject) && /\[15\/10\/2026 21:00\] Perengano/.test(E.mails[1].body) && !/Fulana/.test(E.mails[1].body),
   'al día siguiente a las 20: sólo la que faltaba, con su fecha');
E.a(20, 2);
E.run('corridaIniciar_(new Date(), false, false); corridaCerrar_(null)');
ok(E.mails.length === 2 && E.props.AVISO_ULTIMO_suspendidas === '2026-10-17', 'sin nada nuevo: no hay mail (y el día queda revisado)');
// muchas: el tope del mail y el de la propiedad
E = crearEntorno(ON);
E.a(20);
E.run('corridaIniciar_(new Date(), false, false)');
for (let i = 0; i < 60; i++) E.run('registrarAviso_("suspendidas", "Reunión ' + i + ' | ' + 'x'.repeat(300) + '")');
ok(E.props.AVISOS_COLA.length <= 8000, 'la cola en la propiedad no pasa de AVISOS_COLA_MAX_CHARS (' + E.props.AVISOS_COLA.length + ')');
E.run('_corrida_ = null; _avisosCola_ = null;');    // se corta
E.run('corridaIniciar_(new Date(), false, false)');
const sus = E.hoja('AVISOS_SUSPENDIDAS').v;
ok(sus.length > 2 && sus.length < 61 && /y \d+ avisos más de este tema que no entraron/.test(sus[sus.length - 1][1]), 'cortada: se recupera lo que entró y "y N más" (' + (sus.length - 1) + ' líneas)');
ok(E.mails.length === 1 && /\(y \d+ más: ver la solapa AVISOS_SUSPENDIDAS\)/.test(E.mails[0].body) || (sus.length - 1) <= 40,
   'el mail corta en 40 líneas con "y N más"');

// ============================== [9] la auditoría semanal ==============================
console.log('[9] la auditoría semanal: la solapa AUDITORIA_AGENDA y el resumen del lunes');
const STUBS = [
  'var _audLenta_ = 0, _audRompe_ = false;',
  'function auditoriaAgenda(o) {',
  '  Logger.log("=== auditoriaAgenda (paso 66) — SÓLO LECTURA ===");',
  '  Logger.log("  [OK] Fulana | 20/10 | 18:00 → fila 840");',
  '  Logger.log("  [DISTINTO] Mengano | 21/10 → fila 850");',
  '  Logger.log("-- una línea que empieza con guion");',
  '  if (_audLenta_) _avanzar_(_audLenta_);',
  '  if (_audRompe_) throw new Error("Gmail no responde");',
  '  return o && o.todoOk ? { cuentas: { OK: 5, DISTINTO: 0, "FALTA EN LA BASE": 0, DUPLICADA: 0, AMBIGUAS: 0, "DUPLICADOS PENDIENTES": 0 }, noOk: [], errores: [], extra: { copias: { Agenda: { reuniones: 5, faltan: 0, sobran: 0, distintas: 0 } } } }',
  '    : { cuentas: { OK: 4, DISTINTO: 1, "FALTA EN LA BASE": 0, DUPLICADA: 0, AMBIGUAS: 1, "DUPLICADOS PENDIENTES": 1, "FILA SIN MAIL": 0 },',
  '        noOk: ["[2] DISTINTO | Mengano | 21/10: HORA mail 10:00 / base 11:00", "[6] AMBIGUA | Seguridad 22/10 C12 | filas 833, 835 | por fecha y comuna", "[5] AGENDA_DUPLICADOS pendiente: línea 4 | posible duplicado | Fulana 20/10"],',
  '        errores: ["7. AGENDA_FIGURA_A_COMPLETAR: la solapa no existe"], extra: { copias: { Agenda: { reuniones: 5, faltan: 0, sobran: 0, distintas: 1 } } } };',
  '}',
  'function auditoriaCancelaciones() { Logger.log("=== auditoriaCancelaciones ==="); return { resumen: { noRefleja: ["fila 812 | Fulana 01/10 | fuentes: mail (desapareció)"], contradictorias: [], dudosas: [] } }; }',
  'var _formatoLlamado_ = null; function formatoLectura_(sh, m, o) { _formatoLlamado_ = { filas: m.length, o: o }; }'
].join('\n');
function montarSemanal(config, opciones) {
  const E = crearEntorno(Object.assign({}, config), new Date(2026, 9, 19, 8, 0, 0));
  E.run(STUBS);
  E.ctx._avanzar_ = function (ms) { E.ahora = new Date(E.ahora.getTime() + ms); };
  const CD = E.ctx.Date;   // las fechas, del "realm" del script (instanceof Date)
  E.poner('AGENDA_PENDIENTES', [['reunión', 'fecha', 'qué falta'], ['Seguridad C4', new CD(2026, 9, 23, 12), 'la figura'], ['', '', '']]);
  E.poner('AVISOS_SUSPENDIDAS', [['fecha', 'texto', 'mandado'], [new CD(2026, 9, 16, 11), 'Fulana | 22/10 | fila 840', 'x'],
                                  [new CD(2026, 9, 5, 11), 'una de hace dos semanas', 'x']]);
  const enc = E.run('encabezadoCorridas_()');
  const fila = function (estado, total, agenda, ids) {
    return enc.map(function (k) { return k === 'estado' ? estado : k === 'total_s' ? total : k === 'agenda_s' ? agenda : k === 'ids_s' ? ids : ''; });
  };
  E.poner('REGISTRO_CORRIDAS', [enc, fila('ok', 100, 40, 10), fila('ERROR', 200, 80, 20), fila('CORTADA en "cruce" (límite de 6 min o caída)', '', 167, 'salteada'),
                                fila('terminó, con partes salteadas', 250, 90, 'salteada')]);
  return E;
}
E = montarSemanal({ AUDITORIA_SEMANAL_ACTIVA: 'true' });
r = E.run('auditoriaSemanalAgenda_enSeco()');
ok(!E.hoja('AUDITORIA_AGENDA') && E.mails.length === 0, 'en seco: no escribe la solapa ni manda el mail');
ok(/EN SECO: la solapa AUDITORIA_AGENDA quedaría así/.test(E.logs) && /asunto: \[RDV\] resumen semanal 19\/10/.test(E.logs), 'en seco: lo muestra en el log');
ok(/^NO ESTÁ TODO OK: 3 cosas para revisar y 1 secciones que fallaron/.test(r.matriz[0][0]) && r.matriz[1].join('|') === 'sección|texto', 'fila 1: la línea de alerta; fila 2: el encabezado');
const logs = r.matriz.filter(function (x) { return x[0] === 'log'; }).map(function (x) { return x[1]; });
ok(logs[0] === "'=== auditoriaAgenda (paso 66) — SÓLO LECTURA ===" && logs.indexOf("'-- una línea que empieza con guion") >= 0,
   'el log de la auditoría, sin la marca de hora, y lo que empieza con "=" o "-" como texto (no fórmula)');
ok(logs.some(function (l) { return /\[DISTINTO\] Mengano/.test(l); }) && !logs.some(function (l) { return /auditoriaCancelaciones/.test(l); }),
   'sólo el log de la auditoría de la agenda (no el de cancelaciones)');
ok(r.matriz.some(function (x) { return x[0] === 'no está OK' && /AMBIGUA/.test(x[1]); }) && r.matriz.some(function (x) { return x[0] === 'falló'; }), 'lo que no está OK y lo que falló, por línea');

E = montarSemanal({ AUDITORIA_SEMANAL_ACTIVA: 'true', AVISOS_MAIL_ACTIVO: 'true' });
r = E.run('auditoriaSemanalAgenda()');
const H = E.hoja('AUDITORIA_AGENDA');
ok(H && H.v.length === r.matriz.length && H.fondos[1] === '#CC0000' && H.letra[1] === '#FFFFFF', 'la solapa, escrita en la intermedia, con la línea ROJA arriba');
ok(E.run('_formatoLlamado_') && E.run('_formatoLlamado_.o.filaEncabezado') === 2, 'formatoLectura_ (si existe), con el encabezado en la fila 2');
ok(E.mails.length === 1 && /^\[RDV\] resumen semanal 19\/10: \d+ cosas para revisar$/.test(E.mails[0].subject), 'el resumen del lunes: ' + (E.mails[0] && E.mails[0].subject));
const B = E.mails[0].body;
ok(/1\. AUDITORÍA DE LA AGENDA/.test(B) && /DISTINTO \| Mengano/.test(B) && /sección que falló: 7\./.test(B), '1: la auditoría');
ok(/no reflejadas: 1/.test(B) && /fila 812/.test(B), '2: las cancelaciones no reflejadas');
ok(/3\. REUNIONES POR DEFINIR \(AGENDA_PENDIENTES, intermedia\)\n {3}1\n {3}- Seguridad C4 \| 23\/10\/2026 \| la figura/.test(B), '3: AGENDA_PENDIENTES');
ok(/4\. REUNIONES AMBIGUAS.*: 1\n {3}- \[6\] AMBIGUA/.test(B), '4: las ambiguas');
ok(/5\. AGENDA_DUPLICADOS PENDIENTES.*: 1\n {3}- \[5\] AGENDA_DUPLICADOS pendiente/.test(B), '5: AGENDA_DUPLICADOS');
ok(/6\. REUNIONES QUE LA AGENDA SUSPENDIÓ EN LA SEMANA\n {3}1\n {3}- 16\/10\/2026 11:00 \| Fulana/.test(B) && !/hace dos semanas/.test(B), '6: las suspendidas de la semana (no las viejas)');
ok(/estados: ok 1 \| ERROR 1 \| CORTADA 1 \| terminó, con partes salteadas 1/.test(B) && /agenda: mediana 85\.0 s, máximo 167\.0 s/.test(B) &&
   /ids: mediana 15\.0 s, máximo 20\.0 s, salteada por tiempo 2 veces/.test(B), '7: los tiempos y los estados de REGISTRO_CORRIDAS');
console.log('\n--- ejemplo del resumen semanal ---\nAsunto: ' + E.mails[0].subject + '\n' + B + '\n---');
r = E.run('auditoriaSemanalAgenda()');
ok(E.mails.length === 1, 'corrida dos veces el mismo lunes: un solo mail');

E = montarSemanal({ AUDITORIA_SEMANAL_ACTIVA: 'true', AVISOS_MAIL_ACTIVO: 'true' });
E.poner('AUDITORIA_AGENDA', [['viejo'], ['viejo'], ['viejo'], ['viejo'], ['viejo'], ['viejo'], ['viejo'], ['viejo'], ['viejo'], ['viejo'], ['viejo'], ['viejo'], ['viejo'], ['viejo'], ['viejo'], ['viejo']]);
E.run('_audLenta_ = 200000');
r = E.run('auditoriaSemanal_(false, { auditoria: { todoOk: true } })');
ok(E.hoja('AUDITORIA_AGENDA').fondos[1] === '#D9EAD3' && /^OK: la agenda, la base y las copias coinciden/.test(E.hoja('AUDITORIA_AGENDA').v[0][0]), 'todo OK: la línea verde');
ok(!E.hoja('AUDITORIA_AGENDA').v.some(function (x) { return x && x[0] === 'viejo'; }), 'la solapa se reescribe entera (no queda nada de la semana anterior)');
ok(/no se corrió: la auditoría de la agenda tardó 200 s/.test(E.mails[0].body), 'la de la agenda tardó: las cancelaciones no se corren y el mail lo dice');

E = montarSemanal({ AUDITORIA_SEMANAL_ACTIVA: 'true' });
E.run('_audRompe_ = true');
r = E.run('auditoriaSemanalAgenda()');
ok(/^LA AUDITORÍA FALLÓ: Gmail no responde/.test(E.hoja('AUDITORIA_AGENDA').v[0][0]) && E.hoja('AUDITORIA_AGENDA').fondos[1] === '#CC0000', 'la auditoría tira: la solapa lo dice en rojo');
ok(E.mails.length === 0, 'con el mail apagado: la solapa sí, el mail no');

E = montarSemanal({ AUDITORIA_SEMANAL_ACTIVA: 'true' });
delete E.ctx.Logger.getLog;
r = E.run('auditoriaSemanal_(true)');
ok(r.matriz.some(function (x) { return /no se pudo tomar el log/.test(x[1]); }) && r.matriz.some(function (x) { return x[0] === 'resumen'; }), 'sin Logger.getLog: el resumen igual, y lo dice');

E = montarSemanal({ AUDITORIA_SEMANAL_ACTIVA: 'true' });
E.hojas = {};
r = E.run('auditoriaSemanal_(true)');
ok(/la solapa no existe todavía/.test(r.mail.cuerpo) && /ninguna anotada/.test(r.mail.cuerpo) && /sin datos/.test(r.mail.cuerpo), 'sin AGENDA_PENDIENTES, AVISOS_SUSPENDIDAS ni REGISTRO_CORRIDAS: lo dice');

// ============================== [10] el activador semanal y el permiso ==============================
console.log('[10] el activador semanal (a mano) y autorizarMailAvisos');
E = crearEntorno({ AUDITORIA_SEMANAL_ACTIVA: 'true', AVISOS_MAIL_ACTIVO: 'true' });
E.activadores.push({ fn: 'upsertDiario', cada: 1 });
ok(E.run('instalarAuditoriaSemanal_()') === 1, 'instala uno');
const t = E.activadores.filter(function (x) { return x.fn === 'auditoriaSemanalAgenda'; });
ok(t.length === 1 && t[0].tiempo && t[0].dia === 'MONDAY' && t[0].hora === 8, 'los lunes a las 8 (onWeekDay + atHour)');
ok(E.run('instalarAuditoriaSemanal_()') === 0 && E.activadores.length === 2, 'no duplica');
ok(E.run('borrarAuditoriaSemanal_()') === 1 && E.activadores.length === 1 && E.activadores[0].fn === 'upsertDiario', 'borrarlo no toca el de la hora');
E.run('autorizarMailAvisos()');
ok(E.mails.length === 1 && /prueba de los avisos/.test(E.mails[0].subject), 'autorizarMailAvisos, con el mail prendido: manda la prueba');

// ============================== [11] estático ==============================
console.log('[11] estático: sin choques de nombres, nada contra la base, nada se instala solo');
const fuentes = fs.readdirSync(RAIZ).filter(function (f) { return /\.js$/.test(f); }).map(function (f) { return f; })
  .concat(fs.readdirSync(path.join(RAIZ, 'diagnostico')).filter(function (f) { return /\.js$/.test(f); }).map(function (f) { return 'diagnostico/' + f; }));
const nombres = {};
fuentes.forEach(function (f) {
  const s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
  const re = /^(?:function\s+([A-Za-z0-9_$]+)|(?:const|let|var)\s+([A-Za-z0-9_$]+))/gm;
  let m;
  while ((m = re.exec(s))) { const n = m[1] || m[2]; (nombres[n] = nombres[n] || []).push(f); }
});
const nuevos = Object.keys(nombres).filter(function (n) { return nombres[n].indexOf('50_Avisos.js') >= 0 || /^(AVISOS_|AUDITORIA_SEMANAL|RDV_HOJA_AUDITORIA)/.test(n); });
const choques = nuevos.filter(function (n) { return nombres[n].length > 1; });
ok(nuevos.length > 20 && !choques.length, 'los ' + nuevos.length + ' nombres nuevos no chocan con nada' + (choques.length ? ': ' + choques.join(', ') : ''));
const av = fs.readFileSync(path.join(RAIZ, '50_Avisos.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
ok(!/ssDestino_|RDV_SS_DESTINO|RDV_HOJA_DESTINO/.test(av), '50_Avisos.js no abre la base (sólo la intermedia)');
ok((av.match(/newTrigger/g) || []).length === 1 && /function instalarAuditoriaSemanal_/.test(av), 'el único newTrigger, en instalarAuditoriaSemanal_ (a mano)');
ok((av.match(/MailApp\.sendEmail/g) || []).length === 1, 'un solo lugar manda mails (_enviarMailAviso_)');
const cfg = fs.readFileSync(path.join(RAIZ, '00_Config.js'), 'utf8');
ok((cfg.match(/jpcofano2@gmail\.com/g) || []).length === 1, 'la dirección, una sola vez y sólo en 00_Config.js');

console.log('\n' + (fallas ? fallas + ' FALLAS' : 'TODO OK') + ' (' + total + ' chequeos)');
process.exit(fallas ? 1 : 0);
