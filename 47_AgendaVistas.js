/**
 * 47_AgendaVistas.js — LAS DOS VISTAS NUEVAS DEL ARCHIVO "AGENDA" (09/10, decisión del usuario). Configuración: 00_Config.js,
 * "El archivo Agenda: las dos vistas nuevas". PRENDIDO el 13/10: AGENDA_VISTAS_NUEVAS = true (paso 64: en seco, cómo
 * quedaría una semana en cada una).
 *
 * El archivo "Agenda" (AGENDA_COPIA_SS) queda con cinco solapas, en este orden: LEER | Agenda | AgendaCall | Agenda (mail) |
 * Agenda cerrada. "Agenda" y "Agenda cerrada" no cambian (las escribe 40_Agenda.js, como siempre). Las dos nuevas salen de
 * las MISMAS reuniones que "Agenda" (la semana en curso y la siguiente, si ya llegó su mail):
 *
 *   AgendaCall      las columnas de "Agenda" en otro orden (AGENDA_CALL_COLUMNAS) y un color por fila: verde los días de la
 *                   semana en curso que ya pasaron, amarillo hoy y lo que queda, rosado la semana siguiente.
 *   Agenda (mail)   como se ve el mail: un renglón por día (lunes a sábado, negro, aunque no haya reuniones) y, debajo, una
 *                   celda de tres líneas por reunión ("Evento: …" / "Hora: HH:mmh" / "Lugar: …"), con el color de su semana;
 *                   lo que cambió entre versiones, en naranja y negrita (sólo esa parte); lo desaparecido, tachado en gris. A
 *                   la derecha, las COLUMNAS DEL EQUIPO (B Responsable, C Check 1, D Check 2: por POSICIÓN, el equipo puede
 *                   cambiar los títulos), sin protección; el resto, protegido con advertencia.
 *
 * **Lo que carga el equipo no se pierde**: antes de reescribir, se lee lo que hay en B, C y D de cada reunión (su clave, en la
 * columna oculta E) y se guarda en AGENDA_EQUIPO (intermedia), por la clave de la reunión —el agenda_uid de su fila en la
 * base, que no cambia aunque cambie la hora, el día o el orden—; al reescribir, cada reunión vuelve a tener lo suyo. Si una
 * reunión desaparece del mail, sigue en la vista (tachada) con sus valores; al cerrar la semana, quedan guardados en
 * AGENDA_EQUIPO para consulta. **Si guardar falla, "Agenda (mail)" no se reescribe** (nunca se pierde lo del equipo).
 */

// ===================== Las piezas (sin Sheets: las prueban los tests) =====================

/** El color de una reunión: su semana (en curso o siguiente) y si su día ya pasó. */
function colorSemanaAgenda_(ev, hoy) {
  const h = ymd_(hoy);
  const desde = ev.desde ? ymd_(ev.desde) : null, hasta = ev.hasta ? ymd_(ev.hasta) : null;
  if (desde && desde > h) return AGENDA_COLOR_SIGUIENTE;
  if (!desde && ev.fecha && ymd_(ev.fecha) > h && !(hasta && hasta >= h)) return AGENDA_COLOR_SIGUIENTE;
  return ev.fecha && ymd_(ev.fecha) < h ? AGENDA_COLOR_PASADO : AGENDA_COLOR_HOY;
}

/** "AgendaCall": las filas de "Agenda" (la matriz de la copia, abierta) con las columnas reordenadas, y su color. */
function armarVistaCallAgenda_(abierta, hoy) {
  const hdr = abierta[0];
  const idx = AGENDA_CALL_COLUMNAS.map(function (n) { return hdr.indexOf(n); });
  const out = [AGENDA_CALL_COLUMNAS.slice()];
  const colores = [];
  for (let i = 1; i < abierta.length; i++) {
    out.push(idx.map(function (k) { return k < 0 ? '' : abierta[i][k]; }));
    const it = (abierta.items || [])[i - 1];
    colores.push(it ? colorSemanaAgenda_(it.ev, hoy) : AGENDA_COLOR_HOY);
  }
  out.ids = abierta.ids;
  out.colores = colores;
  return out;
}

/** La clave de una reunión para las columnas del equipo: el agenda_uid de su fila; si no tiene fila, su identidad del mail. */
function claveEquipoAgenda_(item, uidPorFila, P) {
  const x = item.x;
  if (x && x.fila) {
    const fila = P && P.ajustarFila ? P.ajustarFila(x.fila) : x.fila;
    const uid = (uidPorFila && uidPorFila[fila]) || '';
    if (uid) return uid;
  }
  // sin la lectura fresca (en seco): el agenda_uid de la fila tal como la leyó la agenda (P.A: los índices de sus columnas)
  if (x && x.f && P && P.A && P.A.agenda_uid != null && !esVacio_(x.f.valores[P.A.agenda_uid])) return str(x.f.valores[P.A.agenda_uid]);
  return 'id:' + idReunionAgenda_(item.ev);
}

/**
 * La celda de una reunión, como el mail: `{ texto, naranja: [{ desde, hasta }], tachada }`. Lo que cambió entre versiones
 * (`ev.cambios`: hora, dirección, lugar) va en naranja: sólo el valor de esa línea; una reunión nueva en la última versión,
 * las tres. Desaparecida (o borrada): tachada.
 */
function celdaMailAgenda_(item) {
  const ev = item.ev;
  const evento = 'Evento: ' + str(ev.eventoTexto).replace(/\s+/g, ' ');
  const hora = 'Hora: ' + (ev.hora ? ev.hora + 'h' : str(ev.horaTexto));
  const lugar = 'Lugar: ' + str(ev.lugarTexto || ev.lugar).replace(/\s+/g, ' ');
  const texto = [evento, hora, lugar].join('\n');
  const c = str(ev.cambios), naranja = [];
  const valor = function (linea, inicio) { return { desde: inicio + linea.indexOf(': ') + 2, hasta: inicio + linea.length }; };
  const iHora = evento.length + 1, iLugar = iHora + hora.length + 1;
  if (/nueva en la última versión/.test(c)) naranja.push(valor(evento, 0), valor(hora, iHora), valor(lugar, iLugar));
  else {
    if (/(^|; )hora /.test(c)) naranja.push(valor(hora, iHora));
    if (/(^|; )(dirección|lugar) /.test(c)) naranja.push(valor(lugar, iLugar));
  }
  const tachada = /^desaparecida|^borrada/.test(str(item.estado));
  return { texto: texto, naranja: naranja.filter(function (r) { return r.hasta > r.desde; }), tachada: tachada };
}

/**
 * "Agenda (mail)": las filas, en orden. Por semana (la de cada reunión) y por día (lunes a sábado, más cualquier otro día
 * con reuniones): `{ tipo: 'dia', texto }` y `{ tipo: 'reunion', celda, color, clave, equipo: [resp, check1, check2] }`.
 * `guardados`: lo del equipo por clave.
 */
function armarVistaMailAgenda_(abierta, hoy, claves, guardados) {
  const items = (abierta.items || []).map(function (it, i) { return { it: it, clave: claves[i] }; });
  const semanas = {};
  items.forEach(function (x) {
    const ev = x.it.ev;
    const lunes = _lunesAgenda_(ev.desde || ev.fecha);
    const k = ymd_(lunes);
    (semanas[k] = semanas[k] || { lunes: lunes, items: [] }).items.push(x);
  });
  const filas = [];
  Object.keys(semanas).sort().forEach(function (k) {
    const s = semanas[k];
    const dias = {};
    for (let d = 0; d < 6; d++) dias[ymd_(_masDias_(s.lunes, d))] = _masDias_(s.lunes, d);
    s.items.forEach(function (x) { if (x.it.ev.fecha) dias[ymd_(x.it.ev.fecha)] = x.it.ev.fecha; });
    Object.keys(dias).sort().forEach(function (dk) {
      const dia = dias[dk];
      filas.push({ tipo: 'dia', texto: _diaSemanaAgenda_(dia) + ' ' + Utilities.formatDate(dia, RDV_TZ, 'dd/MM') });
      s.items.filter(function (x) { return x.it.ev.fecha && ymd_(x.it.ev.fecha) === dk; })
        .sort(function (a, b) { return String(a.it.ev.hora || '').localeCompare(String(b.it.ev.hora || '')); })
        .forEach(function (x) {
          const g = (guardados && guardados[x.clave]) || null;
          filas.push({ tipo: 'reunion', celda: celdaMailAgenda_(x.it), color: colorSemanaAgenda_(x.it.ev, hoy), clave: x.clave,
                       equipo: g ? [g[0], g[1] === true, g[2] === true] : ['', false, false] });
        });
    });
  });
  return filas;
}

function _lunesAgenda_(d) {
  const f = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  const dow = f.getDay();            // 0 domingo
  return _masDias_(f, dow === 0 ? -6 : 1 - dow);
}
function _masDias_(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0); }

// ===================== Lo del equipo: leer, guardar =====================

/** Lo que el equipo cargó HOY en "Agenda (mail)": `{ clave: [Responsable, Check 1, Check 2] }` (por posición). */
function leerEquipoVistaMail_(sh) {
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  const n = sh.getLastRow() - 1;
  const v = sh.getRange(2, 1, n, AGENDA_MAIL_COL_CLAVE).getValues();
  v.forEach(function (r) {
    const clave = str(r[AGENDA_MAIL_COL_CLAVE - 1]);
    if (!clave) return;
    out[clave] = [str(r[AGENDA_MAIL_COL_RESPONSABLE - 1]), r[AGENDA_MAIL_COL_CHECK1 - 1] === true, r[AGENDA_MAIL_COL_CHECK2 - 1] === true];
  });
  return out;
}

const AGENDA_EQUIPO_ENCABEZADO_ = ['clave', 'Responsable', 'Check 1', 'Check 2', 'reunión', 'fecha', 'actualizado'];

/** AGENDA_EQUIPO (intermedia): `{ clave: [resp, c1, c2, reunión, fecha] }`. */
function leerEquipoGuardado_() {
  const sh = ssIntermedia_().getSheetByName(RDV_HOJA_AGENDA_EQUIPO);
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, AGENDA_EQUIPO_ENCABEZADO_.length).getValues().forEach(function (r) {
    if (str(r[0])) out[str(r[0])] = [str(r[1]), r[2] === true, r[3] === true, str(r[4]), r[5]];
  });
  return out;
}

/**
 * Junta lo guardado con lo que hay HOY en la vista (manda la vista: es lo último que cargó el equipo) y lo guarda entero en
 * AGENDA_EQUIPO. `info`: { clave: { reunion, fecha } } para que la línea se entienda sola. Si falla, TIRA (y la vista no se
 * reescribe).
 */
function guardarEquipoAgenda_(guardado, enVista, info) {
  const todo = {};
  Object.keys(guardado).forEach(function (k) { todo[k] = guardado[k].slice(0, 3).concat([guardado[k][3] || '', guardado[k][4] || '']); });
  Object.keys(enVista).forEach(function (k) {
    const i = info[k] || {};
    todo[k] = enVista[k].slice(0, 3).concat([i.reunion || (todo[k] ? todo[k][3] : ''), i.fecha || (todo[k] ? todo[k][4] : '')]);
  });
  const ahora = new Date();
  const filas = Object.keys(todo).filter(function (k) {
    const t = todo[k];
    return t[0] || t[1] || t[2];             // sólo lo que tiene algo cargado
  }).map(function (k) { const t = todo[k]; return [k, t[0], t[1], t[2], t[3], t[4], ahora]; });
  escribirReporte_(RDV_HOJA_AGENDA_EQUIPO, AGENDA_EQUIPO_ENCABEZADO_, filas);
  return todo;
}

// ===================== Escribir (lo llama 40_Agenda.js con AGENDA_VISTAS_NUEVAS) =====================

/**
 * Las dos vistas, en el archivo "Agenda" ya abierto (`ss`), a partir de la copia abierta (`abierta`, la misma matriz de la
 * solapa "Agenda", con sus `items`). Cada una aislada: si una falla, la otra se escribe igual; "Agenda" y "Agenda cerrada"
 * ya quedaron escritas antes.
 */
function escribirVistasAgenda_(ss, abierta, P) {
  const hoy = hoyMediodia_();
  try { escribirVistaCallAgenda_(ss, armarVistaCallAgenda_(abierta, hoy)); }
  catch (err) { Logger.log('>>> "%s" NO se escribió: %s', AGENDA_SOLAPA_CALL, err); }
  try { escribirVistaMailAgenda_(ss, abierta, P, hoy); }
  catch (err) { Logger.log('>>> "%s" NO se escribió: %s (lo del equipo quedó como estaba)', AGENDA_SOLAPA_VISTA_MAIL, err); }
  try { ordenarSolapasAgenda_(ss); }
  catch (err) { Logger.log('>>> el orden de las solapas del archivo "Agenda" no se pudo ajustar: %s', err); }
}

/** "AgendaCall": reescrita entera, con los formatos de "Agenda", un color por fila y protegida con advertencia. */
function escribirVistaCallAgenda_(ss, m) {
  const sh = ss.getSheetByName(AGENDA_SOLAPA_CALL) || ss.insertSheet(AGENDA_SOLAPA_CALL);
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (pr) {
    if (pr.getDescription() === DESC_PROTECCION_COPIA_AGENDA) pr.remove();
  });
  sh.clear();
  const n = m.length, c = m[0].length;
  const col = function (nombre) { return AGENDA_CALL_COLUMNAS.indexOf(nombre) + 1; };
  if (n > 1) sh.getRange(2, col('Versión'), n - 1, 1).setNumberFormat('@');
  sh.getRange(1, 1, n, c).setValues(m);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, c).setFontWeight('bold').setBackground('#D9D9D9');
  if (n > 1) {
    sh.getRange(2, col('FECHA'), n - 1, 1).setNumberFormat('d/MM/yyyy');
    sh.getRange(2, col('Fecha original'), n - 1, 1).setNumberFormat('d/MM/yyyy');
    sh.getRange(2, col('HORA'), n - 1, 1).setNumberFormat('HH:mm');
    sh.getRange(2, col('Última actualización'), n - 1, 1).setNumberFormat('d/MM/yyyy HH:mm');
    if (typeof SpreadsheetApp.newRichTextValue === 'function' && m.ids) {
      sh.getRange(2, col('Mail'), n - 1, 1).setRichTextValues(m.slice(1).map(function (r, i) {
        const id = m.ids[i + 1], v = SpreadsheetApp.newRichTextValue().setText(String(r[col('Mail') - 1] || ''));
        return [(id ? v.setLinkUrl('https://mail.google.com/mail/u/0/#all/' + id) : v).build()];
      }));
    }
    const porColor = {};
    m.colores.forEach(function (co, i) { (porColor[co] = porColor[co] || []).push('A' + (i + 2) + ':' + _a1_(i + 2, c)); });
    Object.keys(porColor).forEach(function (co) { sh.getRangeList(porColor[co]).setBackground(co); });
  }
  try { sh.autoResizeColumns(1, c); } catch (e) { /* no importa */ }
  sh.protect().setDescription(DESC_PROTECCION_COPIA_AGENDA).setWarningOnly(true);
  Logger.log('  "%s": %s filas.', AGENDA_SOLAPA_CALL, n - 1);
}

/** El agenda_uid de cada fila de la base (después de lo que escribió la agenda): `{ fila: uid }`. Sólo lee esa columna. */
function uidsPorFilaAgenda_() {
  const sh = ssDestino_().getSheetByName(RDV_HOJA_DESTINO);
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const i = findIdxOr_(hdr, ['agenda_uid'], true), out = {};
  if (i == null || sh.getLastRow() < 2) return out;
  sh.getRange(2, i + 1, sh.getLastRow() - 1, 1).getValues().forEach(function (v, k) { if (str(v[0])) out[k + 2] = str(v[0]); });
  return out;
}

/**
 * "Agenda (mail)": primero GUARDA lo del equipo (lo de la vista de hoy + lo guardado, por clave); si eso falla, no se toca
 * la vista. Después la reescribe: los días en negro, cada reunión en su celda de tres líneas con el color de su semana (lo
 * cambiado en naranja; lo desaparecido, tachado), las columnas del equipo con lo suyo, las validaciones (desplegable desde
 * las opciones, casillas), los "chips" de color (formato condicional) y la protección con advertencia (B:D y las opciones,
 * libres). Los títulos de B, C, D y las opciones, si el equipo los cambió, se conservan.
 */
function escribirVistaMailAgenda_(ss, abierta, P, hoy) {
  const sh0 = ss.getSheetByName(AGENDA_SOLAPA_VISTA_MAIL);
  const uidPorFila = uidsPorFilaAgenda_();
  const claves = (abierta.items || []).map(function (it) { return claveEquipoAgenda_(it, uidPorFila, P); });
  const info = {};
  (abierta.items || []).forEach(function (it, i) {
    info[claves[i]] = { reunion: str(it.ev.eventoTexto).replace(/\s+/g, ' ') + (it.ev.hora ? ' — ' + it.ev.hora : ''), fecha: it.ev.fecha || '' };
  });
  // 1. guardar (si falla, tira: la vista no se reescribe)
  const enVista = leerEquipoVistaMail_(sh0);
  const guardados = guardarEquipoAgenda_(leerEquipoGuardado_(), enVista, info);
  // 2. lo que el equipo personalizó: los títulos de B, C, D y las opciones
  const titulos = ['Responsable', 'Check 1', 'Check 2'];
  let opciones = AGENDA_RESPONSABLES.slice();
  if (sh0 && sh0.getLastRow() >= 1) {
    const t = sh0.getRange(1, AGENDA_MAIL_COL_RESPONSABLE, 1, 3).getValues()[0];
    t.forEach(function (x, i) { if (str(x)) titulos[i] = str(x); });
    const o = sh0.getRange(2, AGENDA_MAIL_COL_OPCIONES, AGENDA_MAIL_OPCIONES_FILAS, 1).getValues().map(function (r) { return str(r[0]); }).filter(Boolean);
    if (o.length) opciones = o;
  }
  // 3. reescribir
  const filas = armarVistaMailAgenda_(abierta, hoy, claves, guardados);
  const sh = sh0 || ss.insertSheet(AGENDA_SOLAPA_VISTA_MAIL);
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (pr) {
    if (pr.getDescription() === DESC_PROTECCION_VISTA_MAIL) pr.remove();
  });
  sh.clear();
  sh.getRange(1, 1, Math.max(sh.getMaxRows(), 1), AGENDA_MAIL_COL_OPCIONES).clearDataValidations();
  sh.setConditionalFormatRules([]);
  const n = filas.length;
  sh.getRange(1, 1, 1, AGENDA_MAIL_COL_CLAVE).setValues([['Reunión (como el mail)'].concat(titulos).concat(['clave'])]);
  sh.getRange(1, 1, 1, AGENDA_MAIL_COL_CLAVE).setFontWeight('bold').setBackground('#D9D9D9');
  sh.getRange(1, AGENDA_MAIL_COL_OPCIONES).setValue('Responsables (opciones)').setFontWeight('bold').setBackground('#D9D9D9');
  sh.getRange(2, AGENDA_MAIL_COL_OPCIONES, AGENDA_MAIL_OPCIONES_FILAS, 1).setValues(
    Array.apply(null, Array(AGENDA_MAIL_OPCIONES_FILAS)).map(function (_, i) { return [opciones[i] || '']; }));
  sh.setFrozenRows(1);
  if (n) {
    const valores = filas.map(function (f) {
      return f.tipo === 'dia' ? [f.texto, '', '', '', ''] : ['', f.equipo[0], f.equipo[1], f.equipo[2], f.clave];
    });
    // las casillas antes de poner los valores (TRUE/FALSE)
    const filasReunion = [], filasDia = [];
    filas.forEach(function (f, i) { (f.tipo === 'dia' ? filasDia : filasReunion).push(i + 2); });
    filasReunion.forEach(function (r) { sh.getRange(r, AGENDA_MAIL_COL_CHECK1, 1, 2).insertCheckboxes(); });
    sh.getRange(2, 1, n, AGENDA_MAIL_COL_CLAVE).setValues(valores);
    // las reuniones: texto enriquecido (naranja lo cambiado; tachado lo desaparecido) y el color de su semana
    filas.forEach(function (f, i) {
      if (f.tipo !== 'reunion') return;
      const r = i + 2;
      let b = SpreadsheetApp.newRichTextValue().setText(f.celda.texto);
      if (f.celda.tachada) {
        b = b.setTextStyle(0, f.celda.texto.length, SpreadsheetApp.newTextStyle().setStrikethrough(true).setForegroundColor(AGENDA_COLOR_DESAPARECIDA).build());
      } else {
        f.celda.naranja.forEach(function (x) {
          b = b.setTextStyle(x.desde, x.hasta, SpreadsheetApp.newTextStyle().setBold(true).setForegroundColor(AGENDA_COLOR_CAMBIO).build());
        });
      }
      sh.getRange(r, 1).setRichTextValue(b.build()).setBackground(f.color).setWrap(true).setVerticalAlignment('top');
    });
    // los días: negro, letra blanca, negrita
    filasDia.forEach(function (r) {
      sh.getRange(r, 1, 1, AGENDA_MAIL_COL_CHECK2).setBackground('#000000').setFontColor('#FFFFFF').setFontWeight('bold');
    });
    // Responsable: el desplegable desde las opciones; los "chips": formato condicional por nombre
    if (filasReunion.length) {
      const regla = SpreadsheetApp.newDataValidation()
        .requireValueInRange(sh.getRange(2, AGENDA_MAIL_COL_OPCIONES, AGENDA_MAIL_OPCIONES_FILAS, 1), true).setAllowInvalid(true).build();
      filasReunion.forEach(function (r) { sh.getRange(r, AGENDA_MAIL_COL_RESPONSABLE).setDataValidation(regla); });
      const rangoResp = sh.getRange(2, AGENDA_MAIL_COL_RESPONSABLE, n, 1);
      sh.setConditionalFormatRules(opciones.map(function (o, i) {
        return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(o)
          .setBackground(AGENDA_COLORES_RESPONSABLE[i % AGENDA_COLORES_RESPONSABLE.length]).setRanges([rangoResp]).build();
      }));
    }
  }
  sh.setColumnWidth(1, 460);
  sh.setColumnWidth(AGENDA_MAIL_COL_RESPONSABLE, 110);
  sh.setColumnWidth(AGENDA_MAIL_COL_CHECK1, 80);
  sh.setColumnWidth(AGENDA_MAIL_COL_CHECK2, 80);
  sh.hideColumns(AGENDA_MAIL_COL_CLAVE);
  // protegida con advertencia; libres: las columnas del equipo y las opciones
  const libres = [sh.getRange(2, AGENDA_MAIL_COL_RESPONSABLE, Math.max(n, 1), 3), sh.getRange(1, AGENDA_MAIL_COL_RESPONSABLE, 1, 3),
                  sh.getRange(2, AGENDA_MAIL_COL_OPCIONES, AGENDA_MAIL_OPCIONES_FILAS, 1)];
  sh.protect().setDescription(DESC_PROTECCION_VISTA_MAIL).setWarningOnly(true).setUnprotectedRanges(libres);
  Logger.log('  "%s": %s renglones (%s reuniones); lo del equipo, guardado en %s.', AGENDA_SOLAPA_VISTA_MAIL, n,
             filas.filter(function (f) { return f.tipo === 'reunion'; }).length, RDV_HOJA_AGENDA_EQUIPO);
  return filas;
}

/** El orden de las solapas: LEER | Agenda | AgendaCall | Agenda (mail) | Agenda cerrada (sólo mueve las que están corridas). */
function ordenarSolapasAgenda_(ss) {
  let pos = 0;
  AGENDA_ORDEN_SOLAPAS.forEach(function (nombre) {
    const sh = ss.getSheetByName(nombre);
    if (!sh) return;
    pos++;
    if (sh.getIndex() !== pos) { ss.setActiveSheet(sh); ss.moveActiveSheet(pos); }
  });
}

// ===================== En seco (paso 64) =====================

/** Lo prende `vistasAgendaEnSeco` para que la agenda en seco muestre cómo quedarían las dos vistas. */
var _vistaPreviaAgenda_ = false;

/** **Paso 64 — EN SECO**: la agenda en seco (no toca el destino ni el archivo "Agenda") y, en el log, cómo quedarían
 *  "AgendaCall" y "Agenda (mail)" esta semana (con lo del equipo que ya esté guardado). */
function vistasAgendaEnSeco() {
  _vistaPreviaAgenda_ = true;
  try { return correrAgendaEnSeco(); } finally { _vistaPreviaAgenda_ = false; }
}

/** El log de cómo quedaría UNA semana (la en curso) en cada vista nueva. No escribe nada. */
function logVistasAgenda_(abierta, P) {
  const hoy = hoyMediodia_();
  const call = armarVistaCallAgenda_(abierta, hoy);
  const nombreColor = {}; nombreColor[AGENDA_COLOR_PASADO] = 'VERDE'; nombreColor[AGENDA_COLOR_HOY] = 'AMARILLO'; nombreColor[AGENDA_COLOR_SIGUIENTE] = 'ROSADO';
  const fmt = function (v) { return v instanceof Date ? Utilities.formatDate(v, RDV_TZ, v.getFullYear() < 1900 ? 'HH:mm' : 'dd/MM/yyyy') : str(v); };
  Logger.log('=== cómo quedaría "%s" (%s filas; las primeras 12 columnas) ===', AGENDA_SOLAPA_CALL, call.length - 1);
  Logger.log('  %s', call[0].slice(0, 12).join(' | '));
  call.slice(1).forEach(function (r, i) { Logger.log('  [%s] %s', nombreColor[call.colores[i]] || '?', r.slice(0, 12).map(fmt).join(' | ')); });
  let guardados = {};
  try { guardados = leerEquipoGuardado_(); } catch (e) { /* en seco, sin lo guardado */ }
  const claves = (abierta.items || []).map(function (it) { return claveEquipoAgenda_(it, null, P); });
  const filas = armarVistaMailAgenda_(abierta, hoy, claves, guardados);
  Logger.log('=== cómo quedaría "%s" (%s renglones) — «naranja», ~~tachado~~; a la derecha: Responsable | Check 1 | Check 2 ===',
             AGENDA_SOLAPA_VISTA_MAIL, filas.length);
  filas.forEach(function (f) {
    if (f.tipo === 'dia') { Logger.log('  ■■■ %s ■■■', f.texto.toUpperCase()); return; }
    let t = f.celda.texto;
    if (f.celda.tachada) t = '~~' + t + '~~';
    else f.celda.naranja.slice().sort(function (a, b) { return b.desde - a.desde; }).forEach(function (x) {
      t = t.slice(0, x.desde) + '«' + t.slice(x.desde, x.hasta) + '»' + t.slice(x.hasta);
    });
    Logger.log('  [%s] %s   ‖ %s | %s | %s', nombreColor[f.color] || '?', t.replace(/\n/g, ' / '), f.equipo[0] || '—', f.equipo[1] ? '☑' : '☐', f.equipo[2] ? '☑' : '☐');
  });
}
