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
 *
 * 15/10:
 *   - **Las solapas del equipo** ("Agenda Directa", "Sugerencia - Equipo Directa", AGENDA_SOLAPAS_DEL_EQUIPO) y cualquier otra
 *     que no sea del sistema **no se mueven ni se tocan**: ordenarSolapasAgenda_ reordena las del sistema entre los lugares que
 *     ya ocupan, y las nuevas se insertan al final (insertarSolapaAgendaAlFinal_).
 *   - **"Agenda (mail)" en dos formatos**: el de siempre y, con AGENDA_MAIL_FORMATO_DIRECTA, el de "Agenda Directa"
 *     (47_AgendaDirecta.js). Un solo lector para los dos (formatoVistaMail_, leerRenglonesVistaMail_; lo usa también la
 *     auditoría, paso 66), que lee el día aunque Sheets haya convertido "martes 13/10" en una fecha.
 *   - **AGENDA_EQUIPO por nombre de columna**: las siete de siempre y, a la derecha, las del formato nuevo (y cualquier otra que
 *     ya tenga). Al guardar manda la vista **campo por campo**: lo que la vista no muestra (Responsable / Check 1 / Check 2 en el
 *     formato nuevo, o al revés) queda como estaba.
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
  // 15/10 (noche, AGENDA_COLORES_AMARILLO_VERDE): las líneas en AMARILLO en el mail, también en naranja
  (item.amarillo || []).forEach(function (k) {
    const r = k === 'Evento' ? valor(evento, 0) : (k === 'Hora' ? valor(hora, iHora) : valor(lugar, iLugar));
    if (!naranja.some(function (x) { return x.desde === r.desde; })) naranja.push(r);
  });
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
          const campos = (g && g.campos) || {};
          // `equipo`: las columnas de siempre (Responsable, Check 1, Check 2); `campos`: todo lo guardado (también las
          // columnas del formato "Agenda Directa", 15/10), por nombre
          filas.push({ tipo: 'reunion', celda: celdaMailAgenda_(x.it), color: colorSemanaAgenda_(x.it.ev, hoy), clave: x.clave,
                       equipo: [str(campos['Responsable']), campos['Check 1'] === true, campos['Check 2'] === true], campos: campos });
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

/**
 * Las columnas del equipo de siempre ("Agenda (mail)" en su formato original, B, C, D por posición). En AGENDA_EQUIPO se guardan
 * con estos nombres; las del formato "Agenda Directa" (15/10), con el suyo ("CONVOCATORIA · Hecho", …), en columnas aparte.
 */
const CAMPOS_EQUIPO_VIEJOS_ = ['Responsable', 'Check 1', 'Check 2'];

/** ¿Hay algo cargado? Un texto o una casilla marcada (una casilla sin marcar, `false`, no cuenta). */
function _hayValorEquipo_(v) { return v === true || (v !== false && v != null && str(v) !== ''); }

/** El nombre comparable de un encabezado: sin tildes, comillas, puntos ni dos puntos, minúsculas, un solo espacio. */
function _encDirecta_(s) { return normalizeHeader_(s).replace(/[.:]/g, ' ').replace(/\s+/g, ' ').trim(); }

/** El nombre con que se guarda una columna del equipo: "GRUPO · Subcolumna", o sólo el grupo. */
function idColumnaEquipo_(grupo, sub) { return str(sub) ? str(grupo) + ' · ' + str(sub) : str(grupo); }

/**
 * Las columnas de un encabezado de DOS renglones (el formato de "Agenda Directa"): `f1` los grupos (en una celda combinada el
 * valor está sólo en la primera), `f2` las subcolumnas. Una columna con subcolumna y sin grupo es del último grupo de la
 * izquierda. Sólo VALORES: no hace falta leer las combinaciones. → [{ col, grupo, sub, id }], con el nombre de 00_Config.js
 * (AGENDA_DIRECTA_COLUMNAS / AGENDA_DIRECTA_INFO) cuando el texto coincide sin importar tildes, mayúsculas ni puntos.
 */
function columnasEncabezadoDirecta_(f1, f2) {
  const conocidas = {};
  conocidas[_encDirecta_(AGENDA_DIRECTA_INFO) + '|'] = { grupo: AGENDA_DIRECTA_INFO, sub: '' };
  AGENDA_DIRECTA_COLUMNAS.forEach(function (c) { conocidas[_encDirecta_(c.grupo) + '|' + _encDirecta_(c.sub)] = c; });
  const out = [];
  let grupo = '';
  const n = Math.max((f1 || []).length, (f2 || []).length);
  for (let i = 0; i < n; i++) {
    const a = str((f1 || [])[i]), b = str((f2 || [])[i]);
    if (a) grupo = a;
    else if (!b) { grupo = ''; continue; }                 // una columna sin encabezado corta el grupo
    if (!grupo) continue;
    const k = conocidas[_encDirecta_(grupo) + '|' + _encDirecta_(b)];
    const g = k ? k.grupo : grupo, s = k ? k.sub : b;
    out.push({ col: i + 1, grupo: g, sub: s, id: idColumnaEquipo_(g, s), conocida: !!k });
  }
  return out;
}

/**
 * Cómo está armada una solapa con forma de "Agenda (mail)" (la nuestra en cualquiera de sus dos formatos, o "Agenda Directa"),
 * leyendo SÓLO valores de los primeros renglones:
 *   'viejo'    el de siempre: A la reunión, B:D el equipo (por posición), E la clave, un renglón de encabezado;
 *   'directa'  dos renglones de encabezado (el de los grupos es el primero de los cinco de arriba que tiene "Info"), las
 *              columnas por su texto, la clave (si hay: sólo en la nuestra) en la columna "clave".
 * → { formato, filaEnc, filaDatos, colInfo, colClave, columnas (las del equipo), nCols, encabezado: [f1, f2] }
 */
function formatoVistaMail_(sh) {
  const out = { formato: '', filaEnc: 1, filaDatos: 2, colInfo: 1, colClave: 0, columnas: [], nCols: 0, encabezado: [[], []] };
  const ur = sh ? sh.getLastRow() : 0, uc = sh ? sh.getLastColumn() : 0;
  if (!sh || ur < 1 || uc < 1) return out;
  const arriba = sh.getRange(1, 1, Math.min(ur, 6), uc).getValues();
  const info = _encDirecta_(AGENDA_DIRECTA_INFO);
  for (let r = 0; r < Math.min(arriba.length, 5); r++) {
    if (!arriba[r].some(function (x) { return _encDirecta_(x) === info; })) continue;
    const f1 = arriba[r], f2 = arriba[r + 1] || [];
    const todas = columnasEncabezadoDirecta_(f1, f2);
    const ci = todas.filter(function (c) { return _encDirecta_(c.grupo) === info && !c.sub; })[0];
    if (!ci) continue;
    out.formato = 'directa'; out.filaEnc = r + 1; out.filaDatos = r + 3; out.colInfo = ci.col;
    // en la nuestra, la clave (oculta) y, a su derecha, sólo cosas del sistema (las opciones): no son columnas del equipo
    const cl = todas.filter(function (c) { return _encDirecta_(c.grupo) === 'clave' && !c.sub; })[0];
    const cols = todas.filter(function (c) { return !cl || c.col < cl.col; });
    out.colClave = cl ? cl.col : 0;
    out.columnas = cols.filter(function (c) { return c !== ci; });
    out.nCols = Math.max.apply(null, cols.map(function (c) { return c.col; }));
    out.encabezado = [f1.slice(0, out.nCols), f2.slice(0, out.nCols)];
    return out;
  }
  // el de siempre: TODO POR POSICIÓN (A la reunión, B:D el equipo, E la clave), sin importar los títulos (como antes del 15/10)
  const v = formatoViejoVistaMail_();
  v.encabezado = [arriba[0].slice(0, v.nCols), []];
  return v;
}

/** El formato de siempre de "Agenda (mail)", por posición: A la reunión, B:D el equipo, E la clave, datos desde el renglón 2. */
function formatoViejoVistaMail_() {
  return { formato: 'viejo', filaEnc: 1, filaDatos: 2, colInfo: 1, colClave: AGENDA_MAIL_COL_CLAVE, nCols: AGENDA_MAIL_COL_CHECK2,
           columnas: CAMPOS_EQUIPO_VIEJOS_.map(function (n, i) { return { col: AGENDA_MAIL_COL_RESPONSABLE + i, grupo: n, sub: '', id: n, conocida: true }; }),
           encabezado: [[], []] };
}

/**
 * El DÍA de un renglón de día ("martes 13/10", "*Martes 13/10*", "13/10", "martes 13 de octubre"), con el año inferido de `hoy`
 * (el más cercano: la semana de fin de año que nombra el 2 de enero). 15/10: Sheets puede haber convertido "martes 13/10" en una
 * FECHA al escribirlo (getValues devuelve un Date, y el texto queda sólo en getDisplayValues): se toman el día y el mes del Date
 * (el año lo vuelve a inferir, por si Sheets puso el del momento de escribir). `null` si no es un renglón de día.
 */
function diaDeRenglonAgenda_(valor, mostrado, hoy) {
  if (valor instanceof Date && !isNaN(valor.getTime())) return _fechaDiaMes_(valor.getDate() + '/' + (valor.getMonth() + 1), hoy);
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const textos = [str(valor), str(mostrado)];
  for (let i = 0; i < textos.length; i++) {
    const t = normalizeText_(textos[i]).replace(/[*_]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    let m = /^(?:(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)[\s,.]*)?(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?$/.exec(t);
    if (m) {
      if (m[3]) { let y = +m[3]; if (y < 100) y += 2000; return alMediodia_(y, +m[2], +m[1]); }
      return _fechaDiaMes_(m[1] + '/' + m[2], hoy);
    }
    m = /^(?:(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)[\s,.]*)?(\d{1,2}) de ([a-z]+)(?: de (\d{4}))?$/.exec(t);
    if (m && MESES.indexOf(m[2] === 'setiembre' ? 'septiembre' : m[2]) >= 0) {
      const mes = MESES.indexOf(m[2] === 'setiembre' ? 'septiembre' : m[2]) + 1;
      return m[3] ? alMediodia_(+m[3], mes, +m[1]) : _fechaDiaMes_(m[1] + '/' + mes, hoy);
    }
  }
  return null;
}

/**
 * Los renglones de una solapa con forma de "Agenda (mail)" (cualquiera de los dos formatos; también "Agenda Directa"), en
 * orden: `{ fila, tipo: 'dia'|'reunion', fecha (la del último renglón de día de arriba), texto (la celda Info), clave, campos }`.
 * `campos`: lo del equipo, por nombre ('Responsable', 'CONVOCATORIA · Hecho', …). SÓLO LEE (getValues y getDisplayValues).
 */
function leerRenglonesVistaMail_(sh, hoy, formato) {
  const fmt = formato || formatoVistaMail_(sh);
  const out = { formato: fmt, renglones: [] };
  if (!fmt.formato) return out;
  const ur = sh.getLastRow();
  if (ur < fmt.filaDatos) return out;
  const ancho = Math.max(fmt.nCols, fmt.colClave, fmt.colInfo, 1);
  const n = ur - fmt.filaDatos + 1;
  const v = sh.getRange(fmt.filaDatos, 1, n, ancho).getValues();
  const vi = sh.getRange(fmt.filaDatos, fmt.colInfo, n, 1).getDisplayValues();
  // 15/10 (revisión): si "Info" no es la A, el texto del día de un renglón combinado a lo ancho queda en la A (Sheets conserva
  // sólo la celda de arriba a la izquierda): con la celda de Info vacía, el día se busca ahí
  const va = fmt.colInfo !== 1 ? sh.getRange(fmt.filaDatos, 1, n, 1).getDisplayValues() : null;
  let dia = null;
  v.forEach(function (r, i) {
    const info = r[fmt.colInfo - 1];
    let d = diaDeRenglonAgenda_(info, vi[i] && vi[i][0], hoy || hoyMediodia_()), textoDia = str(vi[i] && vi[i][0]) || str(info);
    if (!d && va && esVacio_(info)) { d = diaDeRenglonAgenda_(r[0], va[i] && va[i][0], hoy || hoyMediodia_()); textoDia = str(va[i] && va[i][0]) || str(r[0]); }
    if (d) { dia = d; out.renglones.push({ fila: fmt.filaDatos + i, tipo: 'dia', fecha: d, texto: textoDia }); return; }
    const campos = {};
    fmt.columnas.forEach(function (c) {
      const x = r[c.col - 1];
      campos[c.id] = typeof x === 'boolean' ? x : (x instanceof Date ? x : str(x));
    });
    const clave = fmt.colClave ? str(r[fmt.colClave - 1]) : '';
    const texto = info instanceof Date ? str(vi[i] && vi[i][0]) : str(info);
    if (!texto && !clave && !Object.keys(campos).some(function (k) { return _hayValorEquipo_(campos[k]); })) return;   // vacío
    out.renglones.push({ fila: fmt.filaDatos + i, tipo: 'reunion', fecha: dia, texto: texto, clave: clave, campos: campos });
  });
  return out;
}

/**
 * Lo que el equipo cargó HOY en "Agenda (mail)", para GUARDARLO antes de reescribirla (15/10, revisión). El formato lo dice la
 * protección que dejó el sistema la última vez (la descripción de cada formato es otra); si no hay, lo que se reconozca.
 *   - el de siempre: por POSICIÓN (B:D el equipo, E la clave), sin importar los títulos;
 *   - el de "Agenda Directa": "Info" y cada columna del equipo por su encabezado; la clave por "clave" o, si alguien le
 *     cambió el título, por ser la única columna OCULTA. Si falta algo, TIRA ("Agenda (mail)" no se reescribe y el log lo dice
 *     en grande): reescribirla sin haber podido leer una columna perdería lo cargado en ella.
 */
function leerEquipoVistaMailSeguro_(sh) {
  if (!sh || sh.getLastRow() < 2) return {};
  const descs = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).map(function (p) { return p.getDescription(); });
  const escrita = descs.indexOf(DESC_PROTECCION_VISTA_MAIL_DIRECTA) >= 0 ? 'directa' : descs.indexOf(DESC_PROTECCION_VISTA_MAIL) >= 0 ? 'viejo' : '';
  let fmt = formatoVistaMail_(sh);
  if (escrita === 'directa' || (!escrita && fmt.formato === 'directa')) {
    const problemas = [];
    if (fmt.formato !== 'directa') problemas.push('no se encuentra "' + AGENDA_DIRECTA_INFO + '" en el encabezado');
    else {
      if (!fmt.colClave) {
        const ocultas = [];
        for (let c = 1; c <= sh.getLastColumn(); c++) if (sh.isColumnHiddenByUser(c)) ocultas.push(c);
        if (ocultas.length === 1) {
          fmt.colClave = ocultas[0];
          fmt.columnas = fmt.columnas.filter(function (c) { return c.col < fmt.colClave; });
          Logger.log('>>> AVISO "%s": la columna "clave" cambió de título; se usa la columna oculta (%s).', AGENDA_SOLAPA_VISTA_MAIL, fmt.colClave);
        } else problemas.push('no se encuentra la columna "clave" (ni por el título ni por ser la única oculta)');
      }
      const ids = fmt.columnas.map(function (c) { return c.id; });
      const faltan = AGENDA_DIRECTA_COLUMNAS.map(function (c) { return idColumnaEquipo_(c.grupo, c.sub); }).filter(function (id) { return ids.indexOf(id) < 0; });
      if (faltan.length) problemas.push('no se encuentran las columnas ' + faltan.join(', ') + ' (¿les cambiaron el título?)');
    }
    if (problemas.length) {
      throw new Error('NO SE REESCRIBE "' + AGENDA_SOLAPA_VISTA_MAIL + '" (lo del equipo se perdería): ' + problemas.join('; ') +
                      '. Volver a poner los títulos como en "' + AGENDA_SOLAPA_DIRECTA + '".');
    }
  } else {
    fmt = formatoViejoVistaMail_();
  }
  const out = {};
  leerRenglonesVistaMail_(sh, null, fmt).renglones.forEach(function (r) {
    if (r.tipo === 'reunion' && r.clave) out[r.clave] = { campos: r.campos };
  });
  return out;
}

/** Lo que el equipo cargó HOY en "Agenda (mail)" (en el formato que tenga): `{ clave: { campos: { nombre: valor } } }`. */
function leerEquipoVistaMail_(sh) {
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  leerRenglonesVistaMail_(sh).renglones.forEach(function (r) {
    if (r.tipo === 'reunion' && r.clave) out[r.clave] = { campos: r.campos };
  });
  return out;
}

const AGENDA_EQUIPO_ENCABEZADO_ = ['clave', 'Responsable', 'Check 1', 'Check 2', 'reunión', 'fecha', 'actualizado'];

/**
 * AGENDA_EQUIPO (intermedia): `{ clave: { campos: { nombre: valor }, reunion, fecha } }`, leído POR ENCABEZADO: las siete
 * columnas de siempre y, a la derecha, las de las otras columnas del equipo (15/10: las del formato "Agenda Directa"; cualquier
 * columna de más se conserva). `.columnas` (no enumerable): esas columnas de más, en su orden.
 */
function leerEquipoGuardado_() {
  const sh = ssIntermedia_().getSheetByName(RDV_HOJA_AGENDA_EQUIPO);
  const out = {}, extra = [];
  Object.defineProperty(out, 'columnas', { value: extra, enumerable: false });
  if (!sh || sh.getLastRow() < 2) return out;
  const uc = Math.max(sh.getLastColumn(), AGENDA_EQUIPO_ENCABEZADO_.length);
  const v = sh.getRange(1, 1, sh.getLastRow(), uc).getValues();
  const hdr = v[0].map(str);
  const iCl = hdr.indexOf('clave') >= 0 ? hdr.indexOf('clave') : 0;
  const iReu = hdr.indexOf('reunión') >= 0 ? hdr.indexOf('reunión') : 4, iFe = hdr.indexOf('fecha') >= 0 ? hdr.indexOf('fecha') : 5;
  const iAct = hdr.indexOf('actualizado') >= 0 ? hdr.indexOf('actualizado') : 6;
  const campos = [];
  hdr.forEach(function (h, j) {
    if (j === iCl || j === iReu || j === iFe || j === iAct) return;
    if (!h && j < AGENDA_EQUIPO_ENCABEZADO_.length) h = AGENDA_EQUIPO_ENCABEZADO_[j];   // una hoja sin encabezado: por posición
    if (!h) return;
    campos.push({ j: j, n: h });
    if (CAMPOS_EQUIPO_VIEJOS_.indexOf(h) < 0 && extra.indexOf(h) < 0) extra.push(h);
  });
  for (let i = 1; i < v.length; i++) {
    const k = str(v[i][iCl]);
    if (!k) continue;
    const c = {};
    campos.forEach(function (x) { const y = v[i][x.j]; c[x.n] = typeof y === 'boolean' || y instanceof Date ? y : str(y); });
    CAMPOS_EQUIPO_VIEJOS_.forEach(function (n, j) { if (j > 0) c[n] = c[n] === true; });   // Check 1 / Check 2: siempre booleanos
    out[k] = { campos: c, reunion: str(v[i][iReu]), fecha: v[i][iFe] };
  }
  return out;
}

/**
 * Junta lo guardado con lo que hay HOY en la vista y lo guarda entero en AGENDA_EQUIPO. Manda la vista (es lo último que cargó
 * el equipo), **campo por campo**: una columna que la vista no tiene (las de siempre, si está con el formato "Agenda Directa", o
 * al revés) queda como estaba guardada. `info`: { clave: { reunion, fecha } } para que la línea se entienda sola. Las columnas
 * de AGENDA_EQUIPO: las siete de siempre y, a la derecha, las demás (las que ya tenía, las del formato "Agenda Directa" con
 * AGENDA_MAIL_FORMATO_DIRECTA, y cualquier otra que traiga lo guardado). Si falla, TIRA (y la vista no se reescribe).
 */
/** 16/10: ¿lo que hay en la vista (columnas del equipo) difiere de lo guardado en AGENDA_EQUIPO? */
function _equipoDifiereDeGuardado_(enVista, guardado) {
  return Object.keys(enVista || {}).some(function (k) {
    const c = (enVista[k] && enVista[k].campos) || {}, g = ((guardado || {})[k] && guardado[k].campos) || {};
    return Object.keys(c).some(function (n) {
      const a = c[n], b = g[n];
      if (!_hayValorEquipo_(a) && !_hayValorEquipo_(b)) return false;
      return String(a instanceof Date ? a.getTime() : a) !== String(b instanceof Date ? b.getTime() : b);
    });
  });
}

function guardarEquipoAgenda_(guardado, enVista, info) {
  const todo = {};
  Object.keys(guardado).forEach(function (k) {
    const g = guardado[k];
    todo[k] = { campos: Object.assign({}, g.campos || {}), reunion: g.reunion || '', fecha: g.fecha || '' };
  });
  Object.keys(enVista).forEach(function (k) {
    const i = (info || {})[k] || {};
    const t = todo[k] || (todo[k] = { campos: {}, reunion: '', fecha: '' });
    const c = (enVista[k] && enVista[k].campos) || {};
    Object.keys(c).forEach(function (n) { t.campos[n] = c[n]; });
    if (i.reunion) t.reunion = i.reunion;
    if (i.fecha) t.fecha = i.fecha;
  });
  // las columnas de más: primero las que ya tenía AGENDA_EQUIPO, después las del formato nuevo, después cualquier otra
  const extra = (guardado.columnas || []).slice();
  const sumar = function (n) { if (n && CAMPOS_EQUIPO_VIEJOS_.indexOf(n) < 0 && extra.indexOf(n) < 0) extra.push(n); };
  if (AGENDA_MAIL_FORMATO_DIRECTA) AGENDA_DIRECTA_COLUMNAS.forEach(function (c) { sumar(idColumnaEquipo_(c.grupo, c.sub)); });
  Object.keys(todo).forEach(function (k) { Object.keys(todo[k].campos).forEach(sumar); });
  const ahora = new Date();
  const filas = Object.keys(todo).filter(function (k) {
    const c = todo[k].campos;
    return Object.keys(c).some(function (n) { return _hayValorEquipo_(c[n]); });   // sólo lo que tiene algo cargado
  }).map(function (k) {
    const t = todo[k], c = t.campos;
    return [k, str(c['Responsable']), c['Check 1'] === true, c['Check 2'] === true, t.reunion, t.fecha, ahora]
      .concat(extra.map(function (n) { return c[n] == null ? '' : c[n]; }));
  });
  escribirReporte_(RDV_HOJA_AGENDA_EQUIPO, AGENDA_EQUIPO_ENCABEZADO_.concat(extra), filas);
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
  // 16/10 (VISTAS_AGENDA_SOLO_SI_CAMBIA, 49_Aceleraciones.js): sin cambios (valores, links y colores), sólo "Última actualización"
  const claveH = 'AGENDA|' + AGENDA_SOLAPA_CALL;
  const hz = typeof copiaAgendaSinCambios_ === 'function' ? copiaAgendaSinCambios_(ss.getSheetByName(AGENDA_SOLAPA_CALL), claveH, m) : null;
  if (hz && hz.saltear) return;
  const sh = ss.getSheetByName(AGENDA_SOLAPA_CALL) || insertarSolapaAgendaAlFinal_(ss, AGENDA_SOLAPA_CALL);
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
  if (hz) { SpreadsheetApp.flush(); huellaGuardar_(claveH, hz.huella, sh); }
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
  // 16/10 (VISTAS_AGENDA_SOLO_SI_CAMBIA, 49_Aceleraciones.js): la huella de las reuniones SIN lo del equipo (días, celdas, colores,
  // claves). Si es la de la última escritura, no se reescribe: lo del equipo queda en la solapa tal cual (la reescritura lo
  // pondría igual: la vista manda) y se guarda en AGENDA_EQUIPO en la próxima reescritura, antes de reescribir. Con el formato
  // "Agenda Directa", se reescribe siempre (el diseño sale de otra solapa).
  const claveH = 'AGENDA|' + AGENDA_SOLAPA_VISTA_MAIL;
  let huellaMail = null;
  if (typeof huellaContenido_ === 'function') {
    if (!AGENDA_MAIL_FORMATO_DIRECTA) {
      huellaMail = huellaContenido_({ k: 'vista-mail', filas: armarVistaMailAgenda_(abierta, hoy, claves, null) });
      if (huellaSinCambios_(claveH, huellaMail, sh0, VISTAS_AGENDA_SOLO_SI_CAMBIA)) {
        _anotarSinCambios_(AGENDA_SOLAPA_VISTA_MAIL);
        // 16/10 (revisor): aunque la vista no se reescriba, lo que cargó el equipo se RESPALDA cada hora en AGENDA_EQUIPO (como
        // antes de la aceleración), pero sólo si cambió algo: si alguien borra o daña la solapa, no se pierde más de una hora
        try {
          const enVista0 = leerEquipoVistaMailSeguro_(sh0), guardado0 = leerEquipoGuardado_();
          if (_equipoDifiereDeGuardado_(enVista0, guardado0)) guardarEquipoAgenda_(guardado0, enVista0, info);
        } catch (err) { Logger.log('>>> "%s": lo del equipo no se pudo respaldar en %s (%s); la vista no se tocó', AGENDA_SOLAPA_VISTA_MAIL, RDV_HOJA_AGENDA_EQUIPO, err); }
        return null;
      }
    }
    huellaOlvidar_(claveH);
  }
  // 1. guardar (si falla, tira: la vista no se reescribe)
  const enVista = leerEquipoVistaMailSeguro_(sh0);
  const guardados = guardarEquipoAgenda_(leerEquipoGuardado_(), enVista, info);
  // 15/10: con AGENDA_MAIL_FORMATO_DIRECTA, el formato de "Agenda Directa" (47_AgendaDirecta.js); lo guardado, igual que siempre
  const formato0 = formatoVistaMail_(sh0).formato;
  if (AGENDA_MAIL_FORMATO_DIRECTA) return escribirVistaMailDirecta_(ss, sh0, armarVistaMailAgenda_(abierta, hoy, claves, guardados));
  // 2. lo que el equipo personalizó: los títulos de B, C, D y las opciones (sólo si la solapa está en este formato)
  const titulos = ['Responsable', 'Check 1', 'Check 2'];
  let opciones = AGENDA_RESPONSABLES.slice();
  if (sh0 && sh0.getLastRow() >= 1 && formato0 === 'viejo') {
    const t = sh0.getRange(1, AGENDA_MAIL_COL_RESPONSABLE, 1, 3).getValues()[0];
    t.forEach(function (x, i) { if (str(x)) titulos[i] = str(x); });
    const o = sh0.getRange(2, AGENDA_MAIL_COL_OPCIONES, AGENDA_MAIL_OPCIONES_FILAS, 1).getValues().map(function (r) { return str(r[0]); }).filter(Boolean);
    if (o.length) opciones = o;
  }
  // 3. reescribir
  const filas = armarVistaMailAgenda_(abierta, hoy, claves, guardados);
  const sh = sh0 || insertarSolapaAgendaAlFinal_(ss, AGENDA_SOLAPA_VISTA_MAIL);
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (pr) {
    if (pr.getDescription() === DESC_PROTECCION_VISTA_MAIL || pr.getDescription() === DESC_PROTECCION_VISTA_MAIL_DIRECTA) pr.remove();
  });
  // volver del formato "Agenda Directa" (se apagó el interruptor): sin combinaciones, columnas ocultas ni validaciones de ese formato
  if (formato0 === 'directa') limpiarVistaMailDirecta_(sh);
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
  if (huellaMail) { SpreadsheetApp.flush(); huellaGuardar_(claveH, huellaMail, sh); }
  Logger.log('  "%s": %s renglones (%s reuniones); lo del equipo, guardado en %s.', AGENDA_SOLAPA_VISTA_MAIL, n,
             filas.filter(function (f) { return f.tipo === 'reunion'; }).length, RDV_HOJA_AGENDA_EQUIPO);
  return filas;
}

/**
 * El orden de las solapas DEL SISTEMA: LEER | Agenda | AgendaCall | Agenda (mail) | Agenda cerrada. 15/10: **las del equipo
 * ("Agenda Directa", "Sugerencia - Equipo Directa") y cualquier otra que no sea del sistema no se mueven**: las del sistema se
 * reordenan ENTRE LOS LUGARES QUE YA OCUPAN, intercambiándose de a dos (cada intercambio son dos movimientos que dejan a las
 * de en medio exactamente donde estaban). Antes cada una iba al lugar 1, 2, 3…, y una solapa del equipo puesta entre medio se
 * corría. Si ya están en orden, no se mueve nada.
 */
function ordenarSolapasAgenda_(ss) {
  const nuestras = AGENDA_ORDEN_SOLAPAS.filter(function (n) { return AGENDA_SOLAPAS_DEL_EQUIPO.indexOf(n) < 0; })
    .map(function (n) { return ss.getSheetByName(n); }).filter(Boolean);
  let movidas = 0;
  for (let k = 0; k < nuestras.length; k++) {
    const lugares = nuestras.map(function (sh) { return sh.getIndex(); }).sort(function (a, b) { return a - b; });
    const destino = lugares[k], sh = nuestras[k], desde = sh.getIndex();
    if (desde === destino) continue;
    const otra = nuestras.filter(function (x) { return x.getIndex() === destino; })[0];
    if (!otra || desde < destino) throw new Error('el orden de las solapas no es el esperado (' + sh.getName() + ')');
    ss.setActiveSheet(sh); ss.moveActiveSheet(destino);     // las de [destino, desde-1] se corren uno a la derecha…
    ss.setActiveSheet(otra); ss.moveActiveSheet(desde);     // …y vuelven a su lugar; `otra` queda donde estaba `sh`
    movidas++;
  }
  if (movidas) Logger.log('  archivo "Agenda": %s intercambios entre solapas del sistema (las demás no se movieron).', movidas);
}

/** Una solapa nueva del sistema en el archivo "Agenda", AL FINAL (sin correr ninguna otra). Nunca una del equipo. */
function insertarSolapaAgendaAlFinal_(ss, nombre) {
  if (AGENDA_SOLAPAS_DEL_EQUIPO.indexOf(nombre) >= 0) throw new Error('"' + nombre + '" es una solapa del equipo: el sistema no la crea ni la escribe');
  return ss.insertSheet(nombre, ss.getSheets().length);
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
  Logger.log('=== cómo quedaría "%s" (%s renglones) — «naranja», ~~tachado~~; a la derecha: %s ===', AGENDA_SOLAPA_VISTA_MAIL, filas.length,
             AGENDA_MAIL_FORMATO_DIRECTA ? 'las columnas del formato "Agenda Directa"' : 'Responsable | Check 1 | Check 2');
  filas.forEach(function (f) {
    if (f.tipo === 'dia') { Logger.log('  ■■■ %s ■■■', f.texto.toUpperCase()); return; }
    let t = f.celda.texto;
    if (f.celda.tachada) t = '~~' + t + '~~';
    else f.celda.naranja.slice().sort(function (a, b) { return b.desde - a.desde; }).forEach(function (x) {
      t = t.slice(0, x.desde) + '«' + t.slice(x.desde, x.hasta) + '»' + t.slice(x.hasta);
    });
    if (AGENDA_MAIL_FORMATO_DIRECTA) { Logger.log('  [%s] %s   ‖ %s', nombreColor[f.color] || '?', t.replace(/\n/g, ' / '), textoEquipoDirecta_(f.campos)); return; }
    Logger.log('  [%s] %s   ‖ %s | %s | %s', nombreColor[f.color] || '?', t.replace(/\n/g, ' / '), f.equipo[0] || '—', f.equipo[1] ? '☑' : '☐', f.equipo[2] ? '☑' : '☐');
  });
}
