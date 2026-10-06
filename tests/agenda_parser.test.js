/**
 * tests/agenda_parser.test.js — el parser de la agenda (paso 29), el cruce (paso 30) y el punto en polígono
 * (paso 31), en Node, con mails SINTÉTICOS. Agenda, etapa 1 (06/10).
 *
 *     node tests/agenda_parser.test.js
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: los mails, horarios y direcciones
 * son inventados con la forma descripta en docs/prompts/PROMPT-05-AGENDA-ETAPA1-MEDICION.md. Los barrios y
 * comunas son los de la Ciudad (públicos); las figuras, nombres de la columna Figura.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path');

const RAIZ = path.join(__dirname, '..');
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', 'diagnostico/03_muestras_mail.js',
                  'diagnostico/16_agenda_medicion.js', 'diagnostico/17_barrios_caba_geo.js'];

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

// Figuras (la columna Figura del destino) y barrios (Comunas), sin planillas.
const FIGURAS = ['Clara Muzzio', 'Hernán Lombardi', 'Gabino Tapia', 'Gustavo Arengo Piragine', 'Maximiliano Piñeiro',
                 'Ignacio Baistrocchi', 'Jorge Macri', 'Laura Alonso', 'Ezequiel Sabor'];
const BARRIOS = [['Recoleta', 2], ['Almagro', 5], ['Boedo', 5], ['Núñez', 13], ['Belgrano', 13], ['Colegiales', 13],
                 ['Villa Urquiza', 12], ['Palermo', 14], ['San Nicolás', 1], ['La Boca', 4], ['Flores', 7]];
ctx.__figs = FIGURAS.map(function (f) { return [f]; });
ctx.__barrios = BARRIOS;
vm.runInContext(`
  usarFigurasDelBloque_(['Figura'], __figs);
  _cacheParsing_.barrios = __barrios.map(function (b) {
    return { canon: b[0], norm: _expandirAbreviaturas_(normalizeText_(b[0])), comuna: b[1], zona: '', ejeRaw: '' };
  }).sort(function (a, b) { return b.norm.length - a.norm.length; });
`, ctx);

let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }

// ------------------------------ los mails ------------------------------
const ASUNTO_A = 'Agenda Encuentros de vecinos con CM y Ministros - Semana del 28/09 al 04/10';
const A1 = [
  'Buenas tardes, les paso la agenda:',
  '',
  '*Martes 29/09*',
  'Evento: Encuentro con Vecinos Clara Muzzio, Recoleta',
  'Hora: 18:30h',
  'Lugar: Av. Santa Fe 1234, Club Social',
  '',
  'Evento: Encuentro con Vecinos Hernán Lombardi, Gabino Tapia (NO PARTICIPA) y Gustavo Arengo Piragine, Comuna 13',
  'Hora: 19:00 hs',
  'Lugar: A CONFIRMAR (NO SE COMUNICA LA DIRECCIÓN)',
  '',
  '*Jueves 01/10*',
  'Evento: Seguridad en tu Barrio, Comuna 5 (SOLO SE COMUNICA POR REDES)',
  'Hora: 18hs',
  'Lugar: Bulnes 1000, Escuela',
  '',
  'Evento: Encuentro Temático "Salud" Maxiliano Piñeiro, Eje Sur',
  'Hora: 10:00h',
  'Lugar: Plaza Sin Número'
].join('\n');
const A2 = [
  'Actualizo:',
  '*Martes 29/09*',
  'Evento: Encuentro con Vecinos Clara Muzzio, Recoleta',
  'Hora: 19:00h',
  'Lugar: Av. Santa Fe 1234, Club Social',
  'Evento: Encuentro con Vecinos Hernán Lombardi, Gabino Tapia (NO PARTICIPA) y Gustavo Arengo Piragine, Comuna 13',
  'Hora: 19:00 hs',
  'Lugar: A CONFIRMAR (NO SE COMUNICA LA DIRECCIÓN)',
  '*Miércoles 30/09*',
  'Evento: Encuentro "1 a 1" Jorge Macri, Belgrano',
  'Hora: 11:00h',
  'Lugar: Cabildo 2000',
  'Evento: Encuentro con Vecinos Ignacio Baistocchi,',
  'Villa Urquiza',
  'Hora: 17:45h',
  'Lugar: Triunvirato 4444, Centro Cultural',
  '- Jueves 1/10:',
  'Evento: Seguridad en tu Barrio, Comuna 5 (SOLO SE COMUNICA POR REDES)',
  'Hora: 18hs',
  'Lugar: Bulnes 1000, Escuela'
].join('\n');
const ASUNTO_B = 'Fwd: Agenda Encuentros de vecinos con JM - Semana del 28/12 al 03/01';
const B1 = ['*Sábado 02/01*', 'Evento: Encuentro con Vecinos Jorge Macri, Palermo', 'Hora: 10:00h', 'Lugar: Serrano 1500'].join('\n');
const ASUNTO_C = 'Agenda Encuentros de vecinos con CM, LA y Ministros - Semana del 28/09 al 04/10';
const C1 = ['*Martes 29/09*', 'Evento: Encuentro con Vecinos Clara Muzzio, Recoleta', 'Hora: 19:00h', 'Lugar: Av. Santa Fe 1234'].join('\n');

ctx.__mails = [
  { fecha: new Date(2026, 8, 25, 10, 0), asunto: ASUNTO_A, cuerpo: A1, truncado: false },
  { fecha: new Date(2026, 8, 28, 9, 0), asunto: 'Re: ' + ASUNTO_A, cuerpo: A2, truncado: false },
  { fecha: new Date(2026, 11, 26, 9, 0), asunto: ASUNTO_B, cuerpo: B1, truncado: false },
  { fecha: new Date(2026, 8, 27, 9, 0), asunto: ASUNTO_C, cuerpo: C1, truncado: false }
];
const r = vm.runInContext('agendaDesdeListaDeMails_(__mails, { fuente: "test" })', ctx);
const buscar = function (lista, fn) { return lista.filter(fn)[0] || null; };

console.log('[1] versiones y última versión');
ok(r.semanas.length === 3, 'tres semanas + grupo (A, B y C): ' + r.semanas.length);
ok(r.ultimas.filter(function (x) { return x.grupo === 'CM y Ministros'; }).length === 5, 'la última de A tiene 5 reuniones');
ok(r.ultimas.every(function (x) { return x.grupo !== 'CM y Ministros' || x.version === 2; }), 'todas de la versión 2');
ok(r.unicas.length === r.ultimas.length - 1, 'Muzzio 29/09 en los mails de dos grupos cuenta una vez');

console.log('[2] campos de cada reunión');
const muz = buscar(r.unicas, function (x) { return x.figuraFila === 'Clara Muzzio'; });
ok(muz && muz.hora === '19:00' && muz.barrio === 'Recoleta' && muz.lugarTipo === 'barrio', 'Muzzio: hora 19:00, barrio Recoleta');
ok(muz && muz.direccion === 'Av. Santa Fe 1234' && muz.nombreLugar === 'Club Social', 'Muzzio: dirección y nombre del lugar');
const muzA = buscar(r.ultimas, function (x) { return x.figuraFila === 'Clara Muzzio' && x.grupo === 'CM y Ministros'; });
ok(muzA && /hora 18:30 → 19:00/.test(muzA.cambios), 'cambio de hora contra la versión anterior: ' + (muzA && muzA.cambios));
const lom = buscar(r.unicas, function (x) { return x.figuraFila === 'Hernán Lombardi'; });
ok(lom && lom.conjunta && lom.figuras.length === 3, 'conjunta con 3 figuras, a nombre de la primera (Lombardi)');
ok(lom && lom.noParticipa.length === 1 && lom.noParticipa[0] === 'Gabino Tapia', '"NO PARTICIPA" va a Tapia, no a la conjunta entera');
ok(lom && lom.participan.join('|') === 'Hernán Lombardi|Gustavo Arengo Piragine', 'participan Lombardi y Arengo Piragine');
ok(lom && lom.lugar === 'Comuna 13' && lom.direccionAConfirmar && !lom.direccion, 'Comuna 13, dirección A CONFIRMAR');
ok(lom && lom.marcas.indexOf('NO SE COMUNICA LA DIRECCION (lugar)') >= 0, 'marca del lugar: ' + (lom && lom.marcas.join(', ')));
const seg = buscar(r.unicas, function (x) { return x.tipo === 'Seguridad en tu Barrio'; });
ok(seg && !seg.figuraFila && seg.comuna === 5 && seg.hora === '18:00', 'Seguridad en tu Barrio: sin figura, Comuna 5, 18:00');
ok(seg && seg.marcas.indexOf('SOLO SE COMUNICA POR REDES') >= 0 && seg.direccion === 'Bulnes 1000', 'marca de redes y dirección');
ok(seg && seg.fecha && seg.fecha.getDate() === 1 && seg.fecha.getMonth() === 9, '"- Jueves 1/10:" como encabezado de día');
const macri = buscar(r.unicas, function (x) { return x.figuraFila === 'Jorge Macri' && x.barrio === 'Belgrano'; });
ok(macri && macri.tipo === 'Encuentro "1 a 1"' && macri.cambios === 'nueva en la última versión', 'Macri "1 a 1": tipo y "nueva"');
const bai = buscar(r.unicas, function (x) { return x.figuraFila === 'Ignacio Baistrocchi'; });
ok(bai && bai.barrio === 'Villa Urquiza', '"Baistocchi" por tolerancia, con el barrio en la línea siguiente');
ok(r.fueraDeSemana.length === 0, 'ninguna fuera de la semana del asunto');

console.log('[3] desaparecidas y año');
ok(r.desaparecidas.length === 1, 'una desaparecida: ' + r.desaparecidas.length);
const des = r.desaparecidas[0];
ok(des && des.figuraFila === 'Maximiliano Piñeiro' && des.tipo === 'Encuentro Temático' && des.lugar === 'Eje Sur',
   '"Maxiliano Piñeiro" (tolerancia), temático, Eje Sur');
const ene = buscar(r.unicas, function (x) { return x.grupo === 'JM'; });
ok(ene && ene.fecha.getFullYear() === 2027 && ene.fecha.getMonth() === 0, 'mail del 26/12 que nombra el 02/01 → 2027');

console.log('[4] el cruce contra un destino sintético');
const fila = function (n, figura, barrio, d, m, y, status) {
  return { fila: n, figura: figura, barrio: barrio, fecha: new Date(y || 2026, m - 1, d, 12), horaMin: null, evento: 'Encuentro con Vecinos',
           valores: [status || 'Realizada'] };
};
ctx.__dest = { D: { 'STATUS REUNIÓN': 0 }, hdr: [], filas: [
  fila(10, 'Clara Muzzio', 'Recoleta', 29, 9),
  fila(11, 'Gabino Tapia', 'Núñez', 29, 9),                 // conjunta: la fila a nombre de la 2ª
  fila(12, 'Jorge Macri', 'Belgrano', 2, 10, 2026, 'en agenda'), // a +2 días
  fila(13, 'Ezequiel Sabor', 'Almagro', 1, 10),             // Seguridad en tu Barrio, Comuna 5
  fila(14, 'Ignacio Baistrocchi', 'Villa Urquiza', 30, 9),
  fila(15, 'Laura Alonso', 'Flores', 30, 9),                // sin reunión en el mail
  fila(16, 'Maximiliano Piñeiro', 'Boedo', 1, 10, 2026, 'Suspendida') // la desaparecida
] };
ctx.__r = r;
const c = vm.runInContext('agendaCruce_(__dest, __r)', ctx);
const cat = function (fig) { const x = buscar(c.ev, function (e) { return e.figuraFila === fig; }); return x && x.cruce.cat; };
ok(cat('Clara Muzzio') === 'con_fila', 'Muzzio: con_fila');
ok(cat('Hernán Lombardi') === 'conjunta_fila_de_otra', 'Lombardi conjunta: la fila es de Tapia → conjunta_fila_de_otra');
ok(cat('Jorge Macri') === 'fila_a_otra_fecha', 'Macri: fila a +2 días');
ok(cat('Ignacio Baistrocchi') === 'con_fila', 'Baistrocchi: con_fila');
const s = buscar(c.ev, function (e) { return !e.figuraFila; });
ok(s && s.cruce.cat === 'sin_figura_fila_por_lugar' && s.cruce.fila.fila === 13, 'Seguridad: la fila 13 por fecha + comuna');
ok(c.desap.length === 1 && c.desap[0].fila && c.desap[0].status === 'Suspendida', 'desaparecida con fila Suspendida');
ok(c.sinMail.length === 1 && c.sinMail[0].f.fila === 15, 'la fila de Alonso, sin reunión en el mail');
ok(c.conNoPart.length === 1 && c.noPartConFila.length === 1, '"No participa": 1 reunión, con fila');
ok(c.ev.every(function (e) { return e.fecha.getFullYear() === 2026; }), 'la del 02/01/2027 queda fuera (futura)');

console.log('[5] punto en polígono');
const b = vm.runInContext(`(function () {
  const p = _poligonosBarrios_();
  return [_barrioEnPunto_(-58.38157, -34.60372, p), _barrioEnPunto_(-58.36476, -34.63564, p),
          _barrioEnPunto_(-58.43260, -34.58860, p), _barrioEnPunto_(-58.30, -34.60, p)];
})()`, ctx);
ok(b[0] && b[0].barrio === 'San Nicolás', 'Obelisco → San Nicolás: ' + (b[0] && b[0].barrio));
ok(b[1] && b[1].barrio === 'La Boca', 'La Bombonera → La Boca: ' + (b[1] && b[1].barrio));
ok(b[2] && b[2].barrio === 'Palermo', 'Plaza Serrano → Palermo: ' + (b[2] && b[2].barrio));
ok(!b[3], 'en el río → ningún barrio');
const g = vm.runInContext(`_barrioDeGeo_({ estado: 'OK', lat: -34.60372, lng: -58.38157, tipo: 'ROOFTOP' }, _poligonosBarrios_())`, ctx);
ok(g.estado === 'ok' && g.barrio === 'San Nicolás' && g.comuna === 1, '_barrioDeGeo_: ok, San Nicolás, comuna 1');
ok(vm.runInContext(`_consultaGeocode_('Chile 1769, Asociación Civil')`, ctx) === 'Chile 1769, Ciudad Autónoma de Buenos Aires, Argentina',
   'la consulta usa "calle número" (lo anterior a la coma)');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
