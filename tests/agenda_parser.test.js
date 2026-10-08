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
const ARCHIVOS = ['00_Config.js', '01_Utils.js', '02_Parsing.js', 'diagnostico/03_muestras_mail.js', '41_AgendaParser.js', '42_BarriosCabaGeo.js',
                  'diagnostico/16_agenda_medicion.js'];

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
  { fecha: new Date(2026, 8, 28, 9, 0), asunto: ASUNTO_A, cuerpo: A2, truncado: false },   // un mail NUEVO completo (un "Re:" sólo agrega: [9])
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

console.log('[6] el método viejo (Barrios Estimados.js), portado');
const vt = function (d) { return vm.runInContext('_viejoPorTexto_(' + JSON.stringify(d) + ')', ctx); };
ok(JSON.stringify(vt('Av. Santa Fe 1234')) === '{"barrio":"Recoleta","via":"calle"}', 'Santa Fe 1234 → Recoleta por "calle emblemática"');
ok(vt('Triunvirato 4444, Centro Cultural Villa Urquiza').via === 'villa', '"Villa Urquiza" en el texto → vía villa');
ok(vt('Av. Belgrano 1200').barrio === 'Belgrano', 'la falla típica: Av. Belgrano 1200 (Monserrat) → "Belgrano"');
ok(vt('Moreno 3281') === null, 'sin nombre ni calle conocida → nada');
const vg = vm.runInContext(`_viejoPorGeo_({ estado: 'OK', formateada: 'x', componentes: JSON.stringify([['1234', ['street_number']],
  ['Palermo', ['neighborhood', 'political']], ['Comuna 14', ['sublocality', 'political']]]) })`, ctx);
ok(vg === 'Palermo', 'Google: el primer componente neighborhood que es barrio → Palermo');

console.log('[7] ajustes del 06/10: fecha fuera de la semana, asuntos con otra forma, tipos, [image:, Montserrat');
vm.runInContext(`_cacheParsing_.barrios.push({ canon: 'Monserrat', norm: 'monserrat', comuna: 1, zona: '', ejeRaw: '' });
  _cacheParsing_.barrios.sort(function (a, b) { return b.norm.length - a.norm.length; });`, ctx);
ctx.__mails2 = [
  { fecha: new Date(2026, 6, 10, 9, 0), asunto: 'Agenda Encuentros de vecinos con JM - Semana del 13/07 al 18/07', truncado: false,
    cuerpo: ['*Lunes 13/06*', 'Evento: Encuentro "1 a 1" Jorge Macri, Flores', 'Hora: 11:00h', 'Lugar: Rivadavia 7000',
             '*Miércoles 15/07*', 'Evento: Encuentro con Vecino Clara Muzzio, Montserrat', '[image: logo.png]', 'Hora: 18:00h',
             'Lugar: Chile 1769, Casa', 'Evento: Café con Vecinos Laura Alonso, Comuna 7', 'Hora: 10:00h', 'Lugar: Plaza Flores'].join('\n') },
  { fecha: new Date(2026, 0, 30, 9, 0), asunto: 'Agenda Encuentros de vecinos con JM - Semana del 02/002 al 07/02', truncado: false,
    cuerpo: ['*Martes 03/02*', 'Evento: Encuentro con Vecinos Jorge Macri, Palermo', 'Hora: 10:00h', 'Lugar: Serrano 1500'].join('\n') },
  { fecha: new Date(2025, 11, 12, 9, 0), asunto: 'Agenda Encuentros de vecinos con CM y Ministros Semana 15.12.2025', truncado: false,
    cuerpo: ['*Martes 16/12*', 'Evento: Encuentro con Vecinos Ezequiel Sabor, Comuna 5', 'Hora: 18:00h', 'Lugar: Bulnes 1000'].join('\n') },
  { fecha: new Date(2026, 3, 18, 9, 0), asunto: 'Fwd: agenda', truncado: false,
    cuerpo: ['---------- Forwarded message ---------', 'Asunto: Agenda Encuentros de vecinos con JM - Semana del 20/04 al 25/04', '',
             '*Martes 21/04*', 'Evento: Encuentro con Vecinos Jorge Macri, Belgrano', 'Hora: 11:00h', 'Lugar: Cabildo 2000'].join('\n') }
];
const r2 = vm.runInContext('agendaDesdeListaDeMails_(__mails2, { fuente: "test" })', ctx);
ok(r2.sinSemana.length === 0 && r2.semanas.length === 4, 'los cuatro mails entran (semanas: ' + r2.semanas.length + ', afuera: ' + r2.sinSemana.length + ')');
const corr = buscar(r2.unicas, function (x) { return x.figuraFila === 'Jorge Macri' && x.barrio === 'Flores'; });
ok(corr && corr.fecha.getDate() === 13 && corr.fecha.getMonth() === 6 && /13\/07\/2026/.test(corr.fechaCorregida),
   '"Lunes 13/06" en la semana del 13/07 → 13/07/2026: ' + (corr && corr.fechaCorregida));
ok(r2.fueraDeSemana.length === 0 && r2.fechasCorregidas.length === 1, 'una corregida, ninguna fuera de semana sin corregir');
const feb = buscar(r2.unicas, function (x) { return x.barrio === 'Palermo'; });
ok(feb && feb.desde.getMonth() === 1 && feb.desde.getDate() === 2 && feb.hasta.getDate() === 7, '"02/002 al 07/02" → 02/02 a 07/02');
const dic = buscar(r2.unicas, function (x) { return x.figuraFila === 'Ezequiel Sabor'; });
ok(dic && dic.desde.getFullYear() === 2025 && dic.hasta.getDate() === 21 && dic.grupo === 'CM y Ministros',
   '"Semana 15.12.2025" → 15 al 21/12/2025, grupo CM y Ministros (grupo: ' + (dic && dic.grupo) + ')');
const fwd = buscar(r2.unicas, function (x) { return x.barrio === 'Belgrano'; });
ok(fwd && fwd.grupo === 'JM' && fwd.fecha.getDate() === 21, 'reenvío sin semana en el asunto: la toma del "Asunto:" del cuerpo');
const sing = buscar(r2.unicas, function (x) { return x.figuraFila === 'Clara Muzzio'; });
ok(sing && sing.tipo === 'Encuentro con Vecinos' && sing.barrio === 'Monserrat', '"Encuentro con Vecino" (singular) y "Montserrat" → Monserrat');
ok(sing && sing.hora === '18:00' && !/image/.test(sing.eventoTexto), 'la línea "[image:" no se pega al evento ni corta la reunión');
const cafe = buscar(r2.unicas, function (x) { return x.figuraFila === 'Laura Alonso'; });
ok(cafe && cafe.tipo === 'Café con Vecinos' && cafe.comuna === 7, '"Café con Vecinos", Comuna 7');

console.log('[8] la regla de confianza del barrio y qué no es una dirección');
const regla = function (res, ev) { ctx.__a = res; ctx.__b = ev; return vm.runInContext('_reglaBarrio_(__a, __b)', ctx); };
ok(regla({ estado: 'ok', barrio: 'Almagro', comuna: 5 }, { comuna: 5, barrio: '' }).cumple, 'ok + misma comuna que el mail → cumple');
ok(!regla({ estado: 'ok_parcial', barrio: 'Almagro', comuna: 5 }, { comuna: 5 }).cumple, 'ok_parcial → no cumple (a)');
ok(/otra comuna/.test(regla({ estado: 'ok', barrio: 'Flores', comuna: 7 }, { comuna: 5 }).motivo), 'otra comuna que la del mail → no cumple (b)');
ok(regla({ estado: 'ok', barrio: 'Belgrano', comuna: 13 }, { comuna: null, barrio: 'Belgrano' }).cumple, 'mismo barrio que el mail → cumple');
ok(/eje/.test(regla({ estado: 'ok', barrio: 'Flores', comuna: 7 }, { comuna: null, barrio: '', eje: 'Sur' }).por || ''),
   'el mail sólo trae eje → cumple (la tanda del 07/10, prendida el 08/10; el detalle, en ubicacion [6])');
ctx.__a = { estado: 'ok', barrio: 'Flores', comuna: 7 }; ctx.__b = { comuna: null, barrio: '', eje: 'Sur' };
ok(/no trae/.test(vm.runInContext('conCambios0710_(false, function () { return _reglaBarrio_(__a, __b); })', ctx).motivo),
   'con la tanda apagada, como antes: el mail sólo trae eje → no cumple');
const noDir = function (d) { return vm.runInContext('_noEsDireccion_(' + JSON.stringify(d) + ')', ctx); };
ok(noDir('https://maps.app.goo.gl/abc123') && noDir('Plaza Sin Número') && !noDir('Armenia 1322') && !noDir('Chile 1769, Casa'),
   'links y nombres sin altura no son direcciones; "Armenia 1322" sí');

console.log('[9] "Re:" y "Fwd:": se lee sólo lo propio (07/10, el caso de Macri 08/10 Eje Norte)');
const SEM_JM = 'Agenda Encuentros de vecinos con JM - Semana del 05/10 al 10/10';
const macriEN = ['*Jueves 08/10*', 'Evento: Encuentro con Vecinos Jorge Macri, Eje Norte', 'Hora: 17:15h'];
const macri14 = ['*Viernes 09/10*', 'Evento: Encuentro con Vecinos Jorge Macri, Comuna 14', 'Hora: 19:00h', 'Lugar: Serrano 1500'];
const jm1 = macriEN.concat(['Lugar: Av. del Libertador 3500, Club Náutico', '']).concat(macri14).join('\n');
const cita = function (txt) { return txt.split('\n').map(function (l) { return '> ' + l; }).join('\n'); };
// v2: "Re:" con la agenda nueva arriba (sólo el 08/10, con la dirección más corta) y la v1 CITADA abajo (con el 09/10)
const jm2 = macriEN.concat(['Lugar: Av. del Libertador 3500', '', 'El mar, 6 oct 2026 a las 9:00, Agenda <agenda@ejemplo.com>',
            'escribió:', '', cita(jm1)]).join('\n');
// v3: "Re:" que sólo agradece, con la v2 citada
const jm3 = ['Gracias!', '', 'On Wed, Oct 7, 2026 at 10:00 AM Agenda <agenda@ejemplo.com> wrote:', cita(jm2)].join('\n');
const fwd9 = ['Les reenvío la agenda.', '', '---------- Forwarded message ---------', 'De: Agenda <agenda@ejemplo.com>',
             'Date: lun, 5 oct 2026 a las 9:00', 'Subject: Agenda Encuentros de vecinos con CM y Ministros - Semana del 05/10 al 10/10',
             'To: <equipo@ejemplo.com>', '', '*Miércoles 07/10*', 'Evento: Café con Vecinos Laura Alonso, Comuna 7', 'Hora: 10:00h',
             'Lugar: Rivadavia 7000', '', '-----Mensaje original-----', '*Martes 06/10*', 'Evento: Encuentro con Vecinos Ezequiel Sabor, Comuna 12',
             'Hora: 18:00h'].join('\n');
ctx.__mails2 = [
  { fecha: new Date(2026, 9, 6, 9, 0), asunto: SEM_JM, cuerpo: jm1, truncado: false },
  { fecha: new Date(2026, 9, 7, 10, 0), asunto: 'Re: ' + SEM_JM, cuerpo: jm2, truncado: false },
  { fecha: new Date(2026, 9, 7, 11, 0), asunto: 'RE: Re: ' + SEM_JM, cuerpo: jm3, truncado: false },
  { fecha: new Date(2026, 9, 5, 12, 0), asunto: 'Fwd: Agenda Encuentros de vecinos con CM y Ministros', cuerpo: fwd9, truncado: false }
];
const r9 = vm.runInContext('agendaDesdeListaDeMails_(__mails2, { fuente: "test" })', ctx);
const mEN = r9.unicas.filter(function (x) { return x.figuraFila === 'Jorge Macri' && x.fecha.getDate() === 8; });
ok(mEN.length === 1 && mEN[0].lugarTexto === 'Av. del Libertador 3500' && mEN[0].cambios !== 'nueva en la última versión',
   'Macri 08/10 Eje Norte UNA vez, la de la versión nueva (no "nueva en la última versión"): ' + mEN.length + ' / ' + (mEN[0] && mEN[0].cambios));
ok(r9.unicas.filter(function (x) { return x.figuraFila === 'Jorge Macri' && x.fecha.getDate() === 9; }).length === 1 &&
   r9.desaparecidas.length === 0, 'un "Re:" sólo agrega o actualiza: la del 09/10 (no está en lo propio del Re:) SIGUE, no desaparece');
// un mail COMPLETO posterior sin la del 09/10: ésa sí la hace desaparecer (y un "Re:" más nuevo no la revive por citarla)
ctx.__mails3 = ctx.__mails2.concat([
  { fecha: new Date(2026, 9, 7, 12, 0), asunto: SEM_JM, cuerpo: macriEN.concat(['Lugar: Av. del Libertador 3500']).join(String.fromCharCode(10)), truncado: false },
  { fecha: new Date(2026, 9, 7, 13, 0), asunto: 'Re: ' + SEM_JM, cuerpo: ['Ok', 'El mié, 7 oct 2026, Agenda <agenda@ejemplo.com> escribió:', cita(jm1)].join(String.fromCharCode(10)), truncado: false }
]);
const r9b = vm.runInContext('agendaDesdeListaDeMails_(__mails3, { fuente: "test" })', ctx);
const des9 = r9b.desaparecidas.filter(function (x) { return x.figuraFila === 'Jorge Macri' && x.fecha.getDate() === 9; });
ok(des9.length === 1 && des9[0].asuntoQueLaSaco === SEM_JM && des9[0].versionQueLaSaco === 3 &&
   r9b.unicas.filter(function (x) { return x.figuraFila === 'Jorge Macri' && x.fecha.getDate() === 9; }).length === 0,
   'la saca el mail COMPLETO (la versión 3: los "Re:" sin agenda propia no son versión), no el "Re:"; y el "Re:" posterior que la cita no la revive');
const r9c = vm.runInContext('agendaDesdeListaDeMails_(__mails2, { fuente: "test", respuestasQuitan: true })', ctx);
ok(r9c.desaparecidas.length === 1, 'con el comportamiento anterior (respuestasQuitan) el "Re:" sí la sacaba: para medir');
ok(r9.respuestasSinAgenda.length === 1 && mEN[0] && mEN[0].versiones === 2,
   'el "Re:" que sólo agradece no es una versión (quedan 2): ' + r9.respuestasSinAgenda.length);
ok(r9.citasCortadas === 2 && r9.reenvios === 1, 'citas cortadas 2, reenvíos 1: ' + r9.citasCortadas + ' / ' + r9.reenvios);
const alo = r9.unicas.filter(function (x) { return x.figuraFila === 'Laura Alonso'; });
ok(alo.length === 1 && r9.unicas.filter(function (x) { return x.figuraFila === 'Ezequiel Sabor'; }).length === 0,
   'el reenvío: la agenda reenviada una vez, sin su propia cita ("Mensaje original")');
ctx.__cuerpoVineta = ['*Jueves 08/10*', '> Evento: viñeta'].join(String.fromCharCode(10));
const corta = vm.runInContext('_cuerpoPropioAgenda_("Agenda", __cuerpoVineta)', ctx);
ok(corta.corte === '' && /viñeta/.test(corta.texto), 'un ">" en un mail que no es respuesta no corta (podría ser una viñeta)');

console.log('[10] comparar direcciones (07/10, el cruce con RDV CONJUNTO)');
const cmpDir = function (a, b) { ctx.__a = a; ctx.__b = b; return vm.runInContext('compararDirecciones_(__a, __b)', ctx); };
const dirC = function (a) { ctx.__a = a; return vm.runInContext('direccionComparable_(__a)', ctx); };
ok(JSON.stringify(dirC('Gral. Manuel A. Rodriguez 1191')) === JSON.stringify({ calle: 'manuel a rodriguez', numero: 1191 }),
   '"Gral. Manuel A. Rodriguez 1191" → calle "manuel a rodriguez", número 1191: ' + JSON.stringify(dirC('Gral. Manuel A. Rodriguez 1191')));
ok(cmpDir('Gral. Manuel A. Rodriguez 1191', 'Manuel A. Rodríguez 1191, Sociedad de Fomento') === 'exacta', 'sin "Gral.", sin acento, cortando en la coma: EXACTA');
ok(cmpDir('Gral. Manuel A. Rodriguez 1191', 'General Manuel A Rodriguez 1250') === 'parecida', 'misma calle, número a 59: PARECIDA');
ok(cmpDir('Gral. Manuel A. Rodriguez 1191', 'Manuel Rodriguez 1191') === 'parecida', 'calle con 2 letras de diferencia y el mismo número: PARECIDA');
ok(cmpDir('Av. Rivadavia 7000', 'Avenida Rivadavia 7000') === 'exacta' && cmpDir('Av. Rivadavia 7000', 'Rivadavia 7200') === 'no',
   '"Av." = "Avenida"; número a 200: NO');
ok(cmpDir('A CONFIRMAR (NO SE COMUNICA LA DIRECCIÓN)', 'Rivadavia 7000') === '' && cmpDir('', 'Rivadavia 7000') === '',
   'sin calle y número: no evaluable');
ok(dirC('25 de Mayo 1234').calle === '25 de mayo' && dirC('Serrano 1500 piso 2').numero === 1500 && dirC('Club Social, Serrano 1500').calle === 'serrano',
   '"25 de Mayo 1234", "Serrano 1500 piso 2", y el nombre del lugar antes de la coma');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
