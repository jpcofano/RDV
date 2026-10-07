/**
 * diagnostico/18_formato_equipo.js — paso 41 (07/10, prompt 07, B): CÓMO llena hoy el equipo las columnas de la agenda,
 * para que las filas que crea el sistema tengan la misma forma. SÓLO LECTURA (destino y Gmail); no escribe nada.
 *
 * Sobre las filas del equipo (sin agenda_uid) de los últimos MESES_FORMATO_EQUIPO meses, por columna (Figura, Barrio,
 * EVENTO, FECHA, HORA, Dirección, STATUS REUNIÓN): tipo del valor (fecha, número, texto), formato numérico de la celda,
 * mayúsculas, y 5 ejemplos tal cual se ven. Además: Dirección con nombre de lugar (con coma) o sólo calle; EVENTO con
 * eje o con "Seguridad"; el STATUS de las filas futuras; y la HORA del equipo contra la del mail (las mismas reuniones,
 * por figura + fecha). Al final dice qué poner en AGENDA_DIRECCION_FORMA, AGENDA_EVENTO_CON_EJE y AGENDA_HORA_AJUSTE_MIN.
 */

const MESES_FORMATO_EQUIPO = 3;
const COLUMNAS_FORMATO_EQUIPO = ['Figura', 'Barrio', 'EVENTO', 'FECHA', 'HORA', 'Dirección', 'STATUS REUNIÓN'];

function medirFormatoEquipo() {
  const t0 = Date.now();
  Logger.log('=== paso 41: cómo llena el equipo las columnas de la agenda (SÓLO LECTURA) — "%s" ===', RDV_HOJA_DESTINO);
  const sh = verificarHojaDestino_(ssDestino_());
  const n = sh.getLastRow(), nCols = sh.getLastColumn();
  const rango = sh.getRange(1, 1, n, nCols);
  const v = rango.getValues(), disp = rango.getDisplayValues(), fmt = rango.getNumberFormats();
  const hdr = v[0].map(normalizeHeader_);
  const ix = function (nombre) { return hdr.indexOf(normalizeHeader_(nombre)); };
  const iUid = ix('agenda_uid'), iFecha = ix('FECHA'), iFig = ix('Figura');
  const hoy = hoyMediodia_();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - MESES_FORMATO_EQUIPO, hoy.getDate(), 12);
  const filas = [];
  for (let i = 1; i < n; i++) {
    const f = v[i][iFecha];
    if (!(f instanceof Date) || f < desde) continue;
    if (iUid >= 0 && !esVacio_(v[i][iUid])) continue;          // sólo lo que cargó el equipo
    filas.push(i);
  }
  Logger.log('  filas del equipo desde el %s: %s', fmtFecha_(desde), filas.length);

  const res = {};
  COLUMNAS_FORMATO_EQUIPO.forEach(function (nombre) {
    const c = ix(nombre);
    if (c < 0) { Logger.log('  %s: NO está en el destino', nombre); return; }
    const tipos = {}, formatos = {}, caja = {}, ejemplos = [];
    filas.forEach(function (i) {
      const x = v[i][c];
      const t = esVacio_(x) ? 'vacía' : (x instanceof Date ? 'fecha' : (typeof x === 'number' ? 'número' : 'texto'));
      tipos[t] = (tipos[t] || 0) + 1;
      if (t === 'vacía') return;
      formatos[fmt[i][c]] = (formatos[fmt[i][c]] || 0) + 1;
      if (t === 'texto') {
        const s = str(x).replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
        const k = !s ? 'sin letras' : (s === s.toUpperCase() ? 'MAYÚSCULAS' : (s === s.toLowerCase() ? 'minúsculas' : 'Mixta'));
        caja[k] = (caja[k] || 0) + 1;
      }
      if (ejemplos.length < 5 && ejemplos.indexOf(disp[i][c]) < 0) ejemplos.push(disp[i][c]);
    });
    res[nombre] = { tipos: tipos, formatos: formatos };
    const lista = function (o) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).map(function (k) { return '"' + k + '" ' + o[k]; }).join(' · ') || '—'; };
    Logger.log('--- %s ---', nombre);
    Logger.log('  tipo: %s', lista(tipos));
    Logger.log('  formato de la celda: %s', lista(formatos));
    if (Object.keys(caja).length) Logger.log('  mayúsculas: %s', lista(caja));
    Logger.log('  ejemplos (como se ven): %s', ejemplos.map(function (e) { return '"' + e + '"'; }).join(' | '));
  });

  // Dirección: ¿con nombre del lugar (coma) o sólo calle y número?
  const cDir = ix('Dirección');
  if (cDir >= 0) {
    let conComa = 0, soloCalle = 0, aConfirmar = 0, otras = 0;
    filas.forEach(function (i) {
      const d = str(v[i][cDir]);
      if (!d) return;
      if (/a confirmar/i.test(d)) aConfirmar++;
      else if (/,/.test(d)) conComa++;
      else if (/\d/.test(d)) soloCalle++;
      else otras++;
    });
    res.direccion = { conComa: conComa, soloCalle: soloCalle };
    Logger.log('--- Dirección: con nombre del lugar (coma) %s | sólo calle y número %s | "A CONFIRMAR" %s | otras %s',
               conComa, soloCalle, aConfirmar, otras);
  }
  // EVENTO: los valores distintos, con eje y con Seguridad
  const cEv = ix('EVENTO');
  if (cEv >= 0) {
    const cuenta = {};
    let conEje = 0, conSeg = 0;
    filas.forEach(function (i) {
      const e = str(v[i][cEv]);
      if (!e) return;
      cuenta[e] = (cuenta[e] || 0) + 1;
      if (/\beje\b/i.test(e)) conEje++;
      if (/seguridad|setb/i.test(e)) conSeg++;
    });
    res.evento = { conEje: conEje };
    Logger.log('--- EVENTO: %s valores distintos | con "Eje" %s | con "Seguridad"/"SETB" %s', Object.keys(cuenta).length, conEje, conSeg);
    Object.keys(cuenta).sort(function (a, b) { return cuenta[b] - cuenta[a]; }).slice(0, 20)
      .forEach(function (k) { Logger.log('    %s × "%s"', cuenta[k], k); });
  }
  // STATUS de las filas futuras
  const cSt = ix('STATUS REUNIÓN');
  if (cSt >= 0) {
    const st = {};
    filas.forEach(function (i) { if (v[i][iFecha] > hoy) { const s = str(v[i][cSt]) || '(vacío)'; st[s] = (st[s] || 0) + 1; } });
    Logger.log('--- STATUS de las filas FUTURAS del equipo: %s', Object.keys(st).map(function (k) { return k + ' ' + st[k]; }).join(' | ') || '—');
  }
  // HORA del equipo contra la del mail (las mismas reuniones: figura + fecha, una sola en cada lado)
  const cHora = ix('HORA');
  let ajuste = null;
  try {
    const mails = leerMailsAgendaGmail_(new Date(desde.getTime() - 7 * 86400000));
    const r = agendaDesdeListaDeMails_(mails.lista, mails);
    const delMail = new Map();
    r.unicas.forEach(function (ev) {
      if (!ev.figuraFila || !ev.fecha || !ev.hora) return;
      const k = normalizeText_(ev.figuraFila) + '|' + ymd_(ev.fecha);
      delMail.set(k, delMail.has(k) ? null : ev.hora);
    });
    const difs = {};
    let comparadas = 0, iguales = 0;
    filas.forEach(function (i) {
      if (!v[i][iFig]) return;
      const hm = delMail.get(normalizeText_(v[i][iFig]) + '|' + ymd_(v[i][iFecha]));
      const he = valorAgendaComparable_(v[i][cHora], 'HORA');
      if (!hm || !/^\d{2}:\d{2}$/.test(he)) return;
      comparadas++;
      const d = (+he.slice(0, 2) * 60 + +he.slice(3)) - (+hm.slice(0, 2) * 60 + +hm.slice(3));
      if (!d) iguales++;
      difs[d] = (difs[d] || 0) + 1;
    });
    const moda = Object.keys(difs).sort(function (a, b) { return difs[b] - difs[a]; })[0];
    ajuste = comparadas && moda != null && +moda !== 0 && difs[moda] > comparadas / 2 ? +moda : 0;
    Logger.log('--- HORA del equipo contra la del mail (%s mails): comparadas %s | iguales %s | diferencias (minutos): %s',
               mails.lista.length, comparadas, iguales,
               Object.keys(difs).sort(function (a, b) { return difs[b] - difs[a]; }).map(function (k) { return k + ' min ×' + difs[k]; }).join(' · ') || '—');
  } catch (err) {
    Logger.log('--- HORA contra el mail: no se pudo leer Gmail (%s)', err);
  }
  // Qué poner
  Logger.log('=== qué poner en 00_Config.js (hoy: AGENDA_DIRECCION_FORMA "%s", AGENDA_EVENTO_CON_EJE %s, AGENDA_HORA_AJUSTE_MIN %s) ===',
             AGENDA_DIRECCION_FORMA, AGENDA_EVENTO_CON_EJE, AGENDA_HORA_AJUSTE_MIN);
  if (res.direccion) Logger.log('  AGENDA_DIRECCION_FORMA = "%s"', res.direccion.soloCalle > res.direccion.conComa ? 'calle' : 'completa');
  if (res.evento) Logger.log('  AGENDA_EVENTO_CON_EJE = %s', res.evento.conEje > filas.length / 4);
  if (ajuste != null) Logger.log('  AGENDA_HORA_AJUSTE_MIN = %s', ajuste);
  Logger.log('  (FECHA y HORA: las filas nuevas copian el formato de la última fila — AGENDA_COPIAR_FORMATO = %s)', AGENDA_COPIAR_FORMATO);
  Logger.log('paso 41: %s ms. No se escribió nada.', Date.now() - t0);
  return res;
}
