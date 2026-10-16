/**
 * diagnostico/30_duplicados_agenda.js — 15/10: la Seguridad en la agenda (casos 829/830 y 833/835), el barrio del mail (caso
 * 824) y RDV CONJUNTO repetido (Macri 15/10). SÓLO LECTURA: no escribe NADA (ni la base, ni la intermedia, ni REGISTRO_AGENDA,
 * ni la cache de geocodificación; no llama a Maps). Sólo el log y el objeto que devuelve.
 *
 *   duplicadosAgenda()         las filas que creó la agenda (agenda_uid "c-…" y las líneas "crear_id" de
 *                              REGISTRO_AGENDA_CAMBIOS) con OTRA fila de la agenda de la misma fecha y el mismo "Lugar (mail)"
 *                              (y el mismo tipo): los duplicados como 829/830. Y las que creó y el equipo ya borró.
 *   medirReglasAgenda1510()    EN SECO, el plan de la agenda con las reglas de hoy y con AGENDA_SEGURIDAD_POR_COMUNA y
 *                              AGENDA_BARRIO_DEL_MAIL prendidas: qué cambia en cada reunión ("hoy se crearía una fila nueva →
 *                              con la regla: se actualiza la fila M"), y "CAMBIA en lo demás" (tiene que dar 0).
 *   medirConjuntoRepetido()    EN SECO, el cruce de Asistentes/oradores con RDV CONJUNTO con y sin
 *                              CONJUNTO_REPETIDA_POR_UBICACION: qué fila escribiría otro valor o no escribiría, y "CAMBIA en lo
 *                              demás" (tiene que dar 0).
 *
 * `opciones` (sólo los tests): `mails` (lista en vez de Gmail), `geocodificar`, `historial`, `elecciones`, `conjunto`.
 */

/** Desde cuándo crea filas la agenda (06/10): las creadas antes no existen. */
const DUP_AGENDA_DESDE = '2026-10-06';

/** Las columnas que se muestran de cada acción de la agenda (lo que ve el equipo). */
const DUP_AGENDA_COLUMNAS = ['Figura', 'FECHA', 'HORA', 'Dirección', 'Barrio', 'STATUS REUNIÓN'];

// ===================== A.3: los duplicados que ya creó la agenda =====================

/**
 * **Los duplicados que creó la agenda** (sólo lectura). Agrupa las filas de la agenda (agenda_uid) por fecha + "Lugar (mail)"
 * + tipo de "Evento (mail)"; un grupo con 2+ filas y al menos una creada por la agenda es un duplicado PROBABLE si alguna no
 * tiene dirección real ("A CONFIRMAR") o todas tienen la misma; si no, se lista para revisar (pueden ser dos reuniones). Y las
 * filas que creó la agenda y el equipo borró (crear_id sin su fila), con la que quedó de esa fecha y lugar.
 */
function duplicadosAgenda(opciones) {
  opciones = opciones || {};
  Logger.log('=== duplicadosAgenda — SÓLO LECTURA: las filas creadas por la agenda desde el %s con otra de la misma fecha y el ' +
             'mismo "Lugar (mail)" (no escribe nada) ===', fmtFecha_(toDate_(DUP_AGENDA_DESDE)));
  const dest = leerDestino_(), A = indicesAgenda_(dest.hdr);
  if (A.faltan.length) Logger.log('  AVISO: a la base le faltan columnas de la agenda: %s', A.faltan.join(', '));
  const v = function (f, n) { return A[n] == null ? '' : f.valores[A[n]]; };
  const desde = ymd_(toDate_(DUP_AGENDA_DESDE));
  const creadas = _crearIdsDupAg_();
  Logger.log('  REGISTRO_AGENDA_CAMBIOS: %s líneas "crear_id"%s', creadas.lista.length, creadas.error ? ' (NO SE PUDO LEER: ' + creadas.error + ')' : '');
  const uidsBase = new Set();
  const grupos = new Map();
  dest.filas.forEach(function (f) {
    const uid = str(v(f, 'agenda_uid'));
    if (!uid) return;
    uidsBase.add(uid);
    const lugar = str(v(f, 'Lugar (mail)'));
    if (!f.fecha || !lugar || ymd_(f.fecha) < desde) return;
    const k = ymd_(f.fecha) + '|' + normalizeText_(lugar) + '|' + tipoAgendaDeTexto_(v(f, 'Evento (mail)'));
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(f);
  });
  const out = { probables: [], revisar: [], borradas: [] };
  grupos.forEach(function (filas, k) {
    if (filas.length < 2 || !filas.some(function (f) { return /^c-/.test(str(v(f, 'agenda_uid'))) || creadas.porUid.has(str(v(f, 'agenda_uid'))); })) return;
    const dirs = filas.map(function (f) { return str(v(f, 'Dirección')); });
    const sinDir = dirs.some(function (d) { return !esDireccionReal_(d); });
    const igual = !sinDir && dirs.every(function (d) { return compararDirecciones_(d, dirs[0]) === 'exacta' || compararDirecciones_(d, dirs[0]) === 'parecida'; });
    (sinDir || igual ? out.probables : out.revisar).push({ clave: k, filas: filas, porque: sinDir ? 'una sin dirección real' : (igual ? 'la misma dirección' : 'direcciones distintas') });
  });
  const linea = function (f) {
    const uid = str(v(f, 'agenda_uid')), c = creadas.porUid.get(uid);
    const datos = ['Inscriptos', 'Asistentes', 'RDV_UID', 'ID cuentas'].filter(function (n) {
      const i = findIdxOr_(dest.hdr, aliasColumna_(n), true);
      return i != null && !esVacio_(f.valores[i]);
    });
    return 'fila ' + f.fila + ' | ' + (f.figura || '(sin figura)') + ' | ' + fmtFecha_(f.fecha) + ' ' + (valorAgendaComparable_(v(f, 'HORA'), 'HORA') || '--:--') +
           ' | Lugar (mail) ' + str(v(f, 'Lugar (mail)')) + ' | Dirección ' + (str(v(f, 'Dirección')) || '(vacía)') +
           (esDireccionReal_(v(f, 'Dirección')) ? '' : ' [no es dirección]') + ' | Barrio ' + (f.barrio || '—') + ' | STATUS ' +
           (str(v(f, 'STATUS REUNIÓN')) || '—') + ' | ' + (/^c-/.test(uid) ? 'la creó la agenda' + (c ? ' (corrida ' + c.corrida + ')' : '') : 'vinculada (fila del equipo)') +
           (str(v(f, 'Tocado por el equipo')) ? ' | tocado por el equipo: ' + str(v(f, 'Tocado por el equipo')) : '') +
           (datos.length ? ' | con datos: ' + datos.join(', ') : '');
  };
  Logger.log('--- 1) DUPLICADOS PROBABLES (misma fecha y "Lugar (mail)", y una sin dirección real o la misma dirección): %s ---', out.probables.length);
  out.probables.forEach(function (g) {
    Logger.log('  %s (%s):', g.clave, g.porque);
    g.filas.forEach(function (f) { Logger.log('    %s', linea(f)); });
    Logger.log('    → la que sobra la borra el equipo (la agenda no borra ni fusiona; una creada por la agenda y borrada no se recrea). ' +
               'Con AGENDA_SEGURIDAD_POR_COMUNA no se vuelven a crear.');
  });
  Logger.log('--- 2) misma fecha y "Lugar (mail)" con direcciones reales DISTINTAS (pueden ser dos reuniones; mirar): %s ---', out.revisar.length);
  out.revisar.forEach(function (g) {
    Logger.log('  %s:', g.clave);
    g.filas.forEach(function (f) { Logger.log('    %s', linea(f)); });
  });
  // 3) las que creó la agenda y el equipo ya borró (desde DUP_AGENDA_DESDE), con la que quedó
  creadas.lista.forEach(function (c) {
    if (uidsBase.has(c.uid) || creadas.deshechas[c.corrida] || creadas.borradasSistema.has(c.uid)) return;
    const p = String(c.id).split('|');
    const sinFig = p[0] === 'sin_figura';
    const ymdR = sinFig ? p[2] : p[1];
    if (!ymdR || ymdR < desde) return;
    const quedo = dest.filas.filter(function (f) {
      if (!f.fecha || ymd_(f.fecha) !== ymdR || esVacio_(v(f, 'agenda_uid'))) return false;
      return sinFig ? normalizeText_(v(f, 'Lugar (mail)')) === p[1] : normalizeText_(f.figura) === p[0];
    });
    out.borradas.push({ id: c.id, uid: c.uid, corrida: c.corrida, quedo: quedo.map(function (f) { return f.fila; }) });
  });
  Logger.log('--- 3) creadas por la agenda y BORRADAS por el equipo (no se recrean mientras sigan en el mail): %s ---', out.borradas.length);
  out.borradas.forEach(function (b) {
    Logger.log('    %s | corrida %s | la que quedó de esa fecha y lugar: %s', b.id, b.corrida, b.quedo.length ? 'fila ' + b.quedo.join(', ') : 'ninguna');
  });
  Logger.log('  >>> RESUMEN: duplicados probables %s | para revisar %s | borradas por el equipo %s', out.probables.length, out.revisar.length,
             out.borradas.length);
  return { probables: out.probables.map(function (g) { return { clave: g.clave, filas: g.filas.map(function (f) { return f.fila; }), porque: g.porque }; }),
           revisar: out.revisar.map(function (g) { return { clave: g.clave, filas: g.filas.map(function (f) { return f.fila; }) }; }),
           borradas: out.borradas };
}

/** Las líneas "crear_id" de REGISTRO_AGENDA_CAMBIOS (sólo lectura), con las corridas deshechas y lo que borró la agenda. */
function _crearIdsDupAg_() {
  const out = { lista: [], porUid: new Map(), deshechas: {}, borradasSistema: new Set(), error: '' };
  try {
    const ss = registrosAgenda_();
    const reg = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA), cam = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA_CAMBIOS);
    if (reg && reg.getLastRow() > 1) {
      reg.getRange(2, 3, reg.getLastRow() - 1, 1).getValues().forEach(function (r) {
        const m = /^DESHACER (.+)$/.exec(str(r[0])); if (m) out.deshechas[m[1]] = true;
      });
    }
    if (!cam || cam.getLastRow() < 2) return out;
    cam.getRange(2, 1, cam.getLastRow() - 1, Math.max(9, cam.getLastColumn())).getValues().forEach(function (r) {
      const tipo = str(r[1]), uid = str(r[8]);
      if (esBorradaPorSistemaAgenda_(tipo) && uid) out.borradasSistema.add(uid);   // 16/10: también la fusión (54_FusionAgenda.js)
      if (tipo !== 'crear_id' || !uid) return;
      const c = { corrida: str(r[0]), fila: r[2], id: str(r[6]), uid: uid };
      out.lista.push(c);
      out.porUid.set(uid, c);
    });
  } catch (err) { out.error = String(err); }
  return out;
}

// ===================== A + B en seco: el plan de la agenda con las reglas nuevas =====================

/**
 * **EN SECO** (sólo lectura): el plan de la agenda cuatro veces —las reglas de hoy, sólo AGENDA_SEGURIDAD_POR_COMUNA, sólo
 * AGENDA_BARRIO_DEL_MAIL y las dos— y qué cambia en cada reunión del mail. Lo de la regla A sólo puede tocar reuniones SIN
 * figura; lo de la regla B, sólo el Barrio de reuniones cuyo lugar en el mail es un barrio. Todo lo demás es "CAMBIA en lo
 * demás" y tiene que dar 0.
 */
function medirReglasAgenda1510(opciones) {
  opciones = opciones || {};
  Logger.log('=== medirReglasAgenda1510 — EN SECO, sólo lectura: el plan de la agenda con AGENDA_SEGURIDAD_POR_COMUNA (hoy %s) y ' +
             'AGENDA_BARRIO_DEL_MAIL (hoy %s) apagadas y prendidas; no escribe nada ===', AGENDA_SEGURIDAD_POR_COMUNA, AGENDA_BARRIO_DEL_MAIL);
  const dest = leerDestino_(), A = indicesAgenda_(dest.hdr), alcance = alcanceAgenda_();
  let mails;
  try {
    const desdeCopia = AGENDA_COPIA_DESDE ? toDate_(AGENDA_COPIA_DESDE) : null;
    const leerDesde = desdeCopia && desdeCopia < alcance.desde ? desdeCopia : alcance.desde;
    mails = opciones.mails ? { fuente: '(lista de prueba)', lista: opciones.mails }
                           : leerMailsAgendaGmail_(new Date(leerDesde.getTime() - 7 * 86400000));
  } catch (err) { Logger.log('>>> no se pudieron leer los mails: %s', err); return { error: String(err) }; }
  const r = agendaDesdeListaDeMails_(mails.lista, mails);
  const op = { enSeco: true, historial: opciones.historial || leerHistorialAgenda_(), elecciones: opciones.elecciones || leerEleccionesAgenda_(),
               conjunto: opciones.conjunto || leerConjuntoPorFecha_(), geocodificar: opciones.geocodificar || _geoSoloCacheDupAg_() };
  const plan = function (a, b) { return planAgenda_(dest, r, A, alcance, Object.assign({}, op, { seguridadPorComuna: a, barrioDelMail: b })); };
  const pHoy = plan(false, false), pA = plan(true, false), pB = plan(false, true), pAB = plan(true, true);
  Logger.log('  mails: %s | alcance: %s | reuniones en el alcance: %s', mails.lista.length, alcance.desc, pHoy.resumen.reunionesEnAlcance);
  ['crear', 'vincular', 'actualizar', 'mover', 'suspender', 'borrar', 'reactivar', 'figura', 'ambiguas', 'duplicadosAntes',
   'duplicadosDespues', 'borradasEquipo', 'yaCargadas', 'figuraACompletar'].forEach(function (k) {
    if (pHoy.resumen[k] !== pAB.resumen[k]) Logger.log('  %s: hoy %s → con las reglas %s', k, pHoy.resumen[k], pAB.resumen[k]);
  });
  const evs = [];
  r.unicas.forEach(function (ev) { if (_enAlcance_(alcance, ev.fecha)) evs.push({ ev: ev, k: ev.clave }); });
  r.desaparecidas.forEach(function (ev) { if (_enAlcance_(alcance, ev.fecha)) evs.push({ ev: ev, k: ev.clave + '|desaparecida', desaparecida: true }); });
  const out = { cambios: [], otros: [] };
  // Las reuniones: hoy contra las dos reglas (lo que se muestra), y cada regla sola (lo que se controla)
  evs.forEach(function (x) {
    const hoy = _queHaceAgendaDupAg_(pHoy, x.ev, A, dest, true), ab = _queHaceAgendaDupAg_(pAB, x.ev, A, dest, true);
    if (hoy !== ab) out.cambios.push({ x: x, hoy: hoy, con: ab });
    // regla A sola: sólo reuniones SIN figura
    if (_queHaceAgendaDupAg_(pHoy, x.ev, A, dest, true) !== _queHaceAgendaDupAg_(pA, x.ev, A, dest, true) && x.ev.figuraFila) {
      out.otros.push('regla A en una reunión CON figura: ' + _evTextoDupAg_(x.ev));
    }
    // regla B sola: sólo el Barrio, y sólo si el mail da un barrio como lugar
    const b0 = _queHaceAgendaDupAg_(pHoy, x.ev, A, dest, false), b1 = _queHaceAgendaDupAg_(pB, x.ev, A, dest, false);
    if (b0 !== b1) out.otros.push('regla B cambia algo más que el Barrio: ' + _evTextoDupAg_(x.ev) + ' | ' + b0 + ' → ' + b1);
    else if (_queHaceAgendaDupAg_(pHoy, x.ev, A, dest, true) !== _queHaceAgendaDupAg_(pB, x.ev, A, dest, true) && x.ev.lugarTipo !== 'barrio') {
      out.otros.push('regla B en una reunión cuyo lugar del mail no es un barrio: ' + _evTextoDupAg_(x.ev));
    }
  });
  // Lo que no es de ninguna reunión: la figura de Seguridad, "Origen fila", "Tocado", los duplicados "después de crear"
  const sueltas = function (P) {
    const s = [];
    P.acciones.forEach(function (a) {
      if (a.ev) return;
      s.push(a.tipo + '|' + (a.f ? a.f.fila : a.fila) + '|' + (a.escrituras || []).map(function (e) { return e.col + '=' + _fmtDupAg_(e.valor); }).join(';'));
    });
    // 16/10: los duplicados "después de crear" son pares "una reunión en dos filas" (P.dosFilas, origen 'despues')
    (P.dosFilas || []).forEach(function (d) { if (d.origen === 'despues') s.push('despues|' + d.a.fila + '|' + d.b.fila); });
    P.figuraACompletar.forEach(function (x) { s.push('figuraACompletar|' + x.f.fila + '|' + x.motivo); });
    return s.sort().join('\n');
  };
  if (sueltas(pHoy) !== sueltas(pAB)) out.otros.push('cambian acciones que no son de ninguna reunión (figura de Seguridad, Origen, Tocado, duplicados después de crear)');
  Logger.log('--- las reuniones que cambian (hoy → con las reglas): %s ---', out.cambios.length);
  out.cambios.forEach(function (c) {
    Logger.log('  %s%s:', _evTextoDupAg_(c.x.ev), c.x.desaparecida ? ' [desaparecida del mail]' : '');
    Logger.log('      hoy: %s', c.hoy);
    Logger.log('      → con la regla: %s', c.con);
  });
  Logger.log('  >>> CAMBIA en lo demás: %s (tiene que dar 0)', out.otros.length);
  out.otros.forEach(function (t) { Logger.log('    %s', t); });
  return { cambios: out.cambios.map(function (c) { return { reunion: _evTextoDupAg_(c.x.ev), hoy: c.hoy, con: c.con }; }), otros: out.otros };
}

/** Qué hace un plan con una reunión, en palabras. `conBarrio` false: sin las celdas de Barrio (para aislar la regla B). */
function _queHaceAgendaDupAg_(P, ev, A, dest, conBarrio) {
  const amb = P.ambiguas.filter(function (x) { return x.ev === ev; })[0];
  if (amb) return 'AMBIGUA (' + amb.motivo + ': filas ' + (amb.filas || []).map(function (f) { return f.fila; }).join(', ') + '): no se hace nada';
  const acc = P.acciones.filter(function (a) { return a.ev === ev && a.tipo !== 'tocado' && a.tipo !== 'origen'; });
  const esc = function (a) {
    return (a.escrituras || []).filter(function (e) {
      const n = dest.hdr[e.col - 1];
      return DUP_AGENDA_COLUMNAS.indexOf(n) >= 0 && (conBarrio || n !== 'Barrio');
    }).map(function (e) {
      const n = dest.hdr[e.col - 1];
      return n + ' ' + (a.tipo === 'crear' ? '' : _fmtDupAg_(e.esperado) + ' → ') + _fmtDupAg_(e.valor);
    }).join('; ');
  };
  // una actualización que sólo toca las columnas del mail y la traza no se muestra (la fila queda "sin cambios")
  const partes = acc.filter(function (a) { return a.tipo !== 'actualizar' || esc(a); }).map(function (a) {
    if (a.tipo === 'crear') return 'se crearía una fila nueva (' + esc(a) + ')';
    const t = esc(a);
    return ({ vincular: 'se vincula', actualizar: 'se actualiza', mover: 'se mueve', suspender: 'se suspende', borrar: 'se borra',
              reactivar: 'se reactiva', mail: 'se actualizan las columnas del mail de' }[a.tipo] || a.tipo) + ' la fila ' + a.f.fila + (t ? ' (' + t + ')' : '');
  });
  if (partes.length) return partes.join(' + ');
  const x = P.filaDe.get(ev.clave);
  if (x && x.borradaEquipo) return 'no se crea: la había creado la agenda y la borró el equipo';
  if (x && x.duplicado) return 'no se crea: se pregunta en AGENDA_DUPLICADOS';
  if (x && x.yaCargada) return 'ya cargada en la fila ' + x.fila + ' (no se toca)';
  if (x && x.fila) return 'la fila ' + x.fila + ' (sin cambios)';
  return 'nada';
}

function _fmtDupAg_(v) {
  if (v instanceof Date) return fmtFecha_(v);
  const s = str(v).replace(/\s+/g, ' ');
  return s === '' ? '(vacío)' : s;
}

function _evTextoDupAg_(ev) {
  return (ev.fecha ? fmtFecha_(ev.fecha) : '(sin fecha)') + ' ' + (ev.hora || '--:--') + ' | ' + (ev.figuras && ev.figuras.length ? ev.figuras.join(' + ') : ev.tipo || '(sin figura)') +
         ' | ' + (ev.lugar || '—') + ' | ' + str(ev.lugarTexto).replace(/\s+/g, ' ');
}

/** La geocodificación de la medición: SÓLO la cache de AGENDA_GEOCODE (no llama a Maps, no escribe la cache). */
function _geoSoloCacheDupAg_() {
  let cache = null;
  return function (consulta) {
    if (!cache) { try { cache = _leerCacheGeocode_(); } catch (e) { cache = new Map(); } }
    return cache.get(consulta) || { consulta: consulta, estado: 'ERROR', lat: '', lng: '', detalle: 'no está en la cache (la medición no geocodifica)' };
  };
}

// ===================== C en seco: RDV CONJUNTO repetido =====================

/**
 * **EN SECO** (sólo lectura): el cruce de Asistentes y oradores con RDV CONJUNTO sin y con CONJUNTO_REPETIDA_POR_UBICACION.
 * Por cada fila de la base donde cambia el valor: qué escribiría hoy, qué con la regla, y qué tiene hoy la base (la escritura
 * real es sólo en celda vacía y en filas activas). "CAMBIA en lo demás": filas que cambian y no son de RDV CONJUNTO repetido
 * (tiene que dar 0). RDV CONJUNTO se lee, nunca se escribe.
 */
function medirConjuntoRepetido() {
  Logger.log('=== medirConjuntoRepetido — EN SECO, sólo lectura: Asistentes/oradores desde RDV CONJUNTO sin y con ' +
             'CONJUNTO_REPETIDA_POR_UBICACION (hoy %s); no escribe nada ===', CONJUNTO_REPETIDA_POR_UBICACION);
  const dest = leerDestino_(), comunas = leerComunasMap_();
  const hoy = cruzarAsistentes_(dest, comunas, { repetidaPorUbicacion: false });
  const con = cruzarAsistentes_(dest, comunas, { repetidaPorUbicacion: true });
  if (hoy.error) { Logger.log('>>> %s', hoy.error); return { error: hoy.error }; }
  const porFila = {};
  dest.filas.forEach(function (f) { porFila[f.fila] = f; });
  const repetidas = {};
  con.repetidasElegidas.forEach(function (x) { repetidas[x.f.fila] = 'elegida por ' + x.por + ': ' + x.texto + ' (no se usa: ' + x.descartadas + ')'; });
  con.repetidasSinDecidir.forEach(function (x) { repetidas[x.f.fila] = 'SIN DECIDIR: ' + x.texto + ' (asistentes: ' + x.valores.join(' / ') + ')'; });
  Logger.log('--- RDV CONJUNTO repetido (2+ filas para una fila de la base), con la regla: elegida %s | sin decidir (no se escribe) %s ---',
             con.repetidasElegidas.length, con.repetidasSinDecidir.length);
  Object.keys(repetidas).forEach(function (fila) {
    const f = porFila[fila];
    Logger.log('    fila %s | %s %s | barrio %s | %s', fila, f ? f.figura : '', f && f.fecha ? fmtFecha_(f.fecha) : '', f && f.barrio || '—', repetidas[fila]);
  });
  const iAsi = dest.D['Asistentes'];
  const valor = function (cr, fila, n) {
    if (n === 'Asistentes') { const x = cr.porFila.get(fila); return x ? x.asis + ' (RDV CONJUNTO fila ' + x.filaConjunto + ')' : 'nada'; }
    const o = cr.oradores.get(fila);
    return o && o[n] !== undefined ? _fmtDupAg_(o[n]) : 'nada';
  };
  const filas = new Set();
  [hoy, con].forEach(function (cr) { cr.porFila.forEach(function (x, k) { filas.add(k); }); cr.oradores.forEach(function (x, k) { filas.add(k); }); });
  const out = { cambios: [], otros: [] };
  Array.from(filas).sort(function (a, b) { return a - b; }).forEach(function (fila) {
    ['Asistentes'].concat(COLUMNAS_ORADORES).forEach(function (n) {
      const a = valor(hoy, fila, n), b = valor(con, fila, n);
      if (a === b) return;
      const f = porFila[fila];
      const i = n === 'Asistentes' ? iAsi : dest.D[n];
      const enBase = f && i != null ? f.valores[i] : '';
      const t = 'fila ' + fila + ' | ' + (f ? f.figura + ' ' + (f.fecha ? fmtFecha_(f.fecha) : '') + ' | barrio ' + (f.barrio || '—') : '') + ' | ' + n +
                ': hoy escribiría ' + a + ' → con la regla: ' + b + ' | la base hoy: ' +
                (esVacio_(enBase) ? 'vacía (se escribiría)' : _fmtDupAg_(enBase) + ' (no se toca en ningún caso)');
      (repetidas[fila] ? out.cambios : out.otros).push(t);
    });
  });
  Logger.log('--- lo que cambia: %s ---', out.cambios.length);
  out.cambios.forEach(function (t) { Logger.log('    %s', t); });
  Logger.log('  >>> CAMBIA en lo demás: %s (tiene que dar 0)', out.otros.length);
  out.otros.forEach(function (t) { Logger.log('    %s', t); });
  return { elegidas: con.repetidasElegidas.length, sinDecidir: con.repetidasSinDecidir.length, cambios: out.cambios, otros: out.otros };
}
