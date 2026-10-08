/**
 * diagnostico/21_ubicacion.js — pasos 49, 49b y 50 (07/10). SÓLO LECTURA: no escriben en ninguna planilla.
 *
 *   paso 49  — la UBICACIÓN EN TRES NIVELES (UBICACION_TRES_NIVELES, compararUbicacion_), medida ANTES de prenderla:
 *              la regla de antes y la nueva, sobre los mismos datos.
 *     a) los formularios: el plan entero (con el invariante y las elecciones), sobre TODO el historial y con las filas
 *        SIN su RDV_UID (como el paso 16), fila por fila: CAMBIA (escribiría con otro formulario: tiene que dar 0),
 *        PIERDE (hoy escribiría y dejaría de escribir), RESUELVE (hoy no escribe y escribiría), OTRO (cambia el
 *        veredicto o el motivo de una que no se escribe). Y en las filas ESCRITAS (con RDV_UID), cuántas tienen hoy el
 *        formulario que el plan les da y cuántas de ésas la regla nueva cambiaría (tiene que dar 0);
 *     b) asistentes y oradores (RDV CONJUNTO): CAMBIA / PIERDE / RESUELVE por fila de RDV CONJUNTO;
 *     c) la figura de las Seguridad en tu Barrio: las filas de Seguridad de la agenda, también las futuras (RDV
 *        CONJUNTO ya trae las del 08/10), con la regla de antes y la nueva, y contra la Figura cargada.
 *   paso 49b — la agenda: el plan EN SECO con las dos reglas (lee los mails; la geocodificación, de la cache): qué
 *              acciones, casi duplicados, "ya cargadas", ambiguas y figuras a completar cambian.
 *   paso 50  — la columna ID: la fórmula en el backup de la base (RDV_SS_BACKUP_BASE) y hoy, cuántas están rotas
 *              (una fecha de JavaScript: "GMT-0300"), y 3 ejemplos antes / después (el después, con la plantilla que se
 *              deduce de los valores buenos del backup).
 */

// ===================== Paso 49 =====================

function medirUbicacionTresNiveles() {
  Logger.log('=== medirUbicacionTresNiveles (paso 49) — sólo lectura, no escribe nada (UBICACION_TRES_NIVELES = %s) ===',
             UBICACION_TRES_NIVELES);
  const dest = leerDestino_(), cands = leerCandidatos_(), comunas = leerComunasMap_();
  let conMail = 0, sinBarrioConComuna = 0, conEje = 0;
  dest.filas.forEach(function (f) {
    if (!f.lugarMail) return;
    conMail++;
    const u = ubicacionDeFila_(f);
    if (!f.barrio && u.comuna != null) sinBarrioConComuna++;
    if (u.eje) conEje++;
  });
  Logger.log('--- 0) el destino: %s filas | con "Lugar (mail)" %s | sin barrio y con la comuna del mail %s | con el eje del ' +
             'mail %s ---', dest.filas.length, conMail, sinBarrioConComuna, conEje);
  const fo = _medirFormularios_diag21(dest, cands, comunas);
  const as = _medirAsistentes_diag21(dest, comunas);
  const se = _medirSeguridad_diag21(dest);
  Logger.log('=== RESUMEN paso 49 [activas | total] ===');
  Logger.log('  formularios: CAMBIA %s | PIERDE %s | RESUELVE %s | otro veredicto %s | escritas que cambiarían %s',
             _at_diag21(fo.cambia), _at_diag21(fo.pierde), _at_diag21(fo.resuelve), _at_diag21(fo.otro),
             _at_diag21(fo.escritasDistintas));
  Logger.log('  asistentes y oradores: CAMBIA %s | PIERDE %s | RESUELVE %s', as.cambia.length, as.pierde.length, as.resuelve.length);
  Logger.log('  figura de Seguridad: CAMBIA %s | PIERDE %s | RESUELVE %s | contradice la Figura cargada %s',
             se.cambia.length, se.pierde.length, se.resuelve.length, se.contradice.length);
  Logger.log('  >>> para prender UBICACION_TRES_NIVELES: CAMBIA 0 y PIERDE 0 en los cruces que hoy están bien (y "escritas ' +
             'que cambiarían" 0); los RESUELVE, mirados uno por uno. Después, el paso 49b (la agenda).');
  return {
    formularios: { cambia: fo.cambia.length, pierde: fo.pierde.length, resuelve: fo.resuelve.length, otro: fo.otro.length,
                   escritas: fo.escritas, escritasIgualHoy: fo.escritasIgualA, escritasDistintas: fo.escritasDistintas.length },
    asistentes: { cambia: as.cambia.length, pierde: as.pierde.length, resuelve: as.resuelve.length },
    seguridad: { cambia: se.cambia.length, pierde: se.pierde.length, resuelve: se.resuelve.length, contradice: se.contradice.length }
  };
}

/** "activas | total" de una lista de `{ activa }`. */
function _at_diag21(l) {
  return l.filter(function (x) { return x.activa; }).length + ' | ' + l.length;
}

/** a) Los formularios: el plan sin RDV_UID con las dos reglas, fila por fila. */
function _medirFormularios_diag21(dest, cands, comunas) {
  Logger.log('--- a) FORMULARIOS: el plan entero, sobre todo el historial y sin los RDV_UID (como el paso 16), con la regla de ' +
             'antes y con la de los tres niveles ---');
  const A = conUbicacion3_(false, function () { return _planSinUid_diag8(dest, cands, comunas); });
  const B = conUbicacion3_(true, function () { return _planSinUid_diag8(dest, cands, comunas); });
  const r = { igual: contador_(), cambia: [], pierde: [], resuelve: [], otro: [], futuras: 0,
              escritas: 0, escritasIgualA: 0, escritasDistintas: [] };
  const clave = function (p) { return p && p.veredicto === 'escribiria' && p.cand ? p.cand.clave : ''; };
  dest.filas.forEach(function (f) {
    const a = A.porFila[f.fila] || {}, b = B.porFila[f.fila] || {};
    if (a.veredicto === 'futura' && b.veredicto === 'futura') { r.futuras++; return; }
    const act = esFilaActiva_(f.fecha), ka = clave(a), kb = clave(b);
    const x = { f: f, a: a, b: b, activa: act };
    if (ka && kb) { if (ka === kb) sumar_(r.igual, act); else r.cambia.push(x); }
    else if (ka) r.pierde.push(x);
    else if (kb) r.resuelve.push(x);
    else if (a.veredicto !== b.veredicto || (a.motivo || '') !== (b.motivo || '') ||
             (a.cand ? a.cand.clave : '') !== (b.cand ? b.cand.clave : '')) r.otro.push(x);
    else sumar_(r.igual, act);
    // Las filas ESCRITAS: el formulario que tienen (por su traza).
    if (f.uid) {
      const t = formularioDeTraza_(f, cands.vivos);
      if (t.c) {
        r.escritas++;
        if (ka === t.c.clave) {
          r.escritasIgualA++;
          if (kb !== t.c.clave) r.escritasDistintas.push(x);
        }
      }
    }
  });
  Logger.log('  [activas | total]  IGUAL %s | CAMBIA %s (tiene que dar 0) | PIERDE %s | RESUELVE %s | otro veredicto %s | ' +
             'futuras (no se evalúan) %s', r.igual.v + ' | ' + r.igual.t, _at_diag21(r.cambia), _at_diag21(r.pierde),
             _at_diag21(r.resuelve), _at_diag21(r.otro), r.futuras);
  Logger.log('  filas ESCRITAS (con RDV_UID y su formulario): %s | el plan de hoy les da ese mismo formulario: %s | de ésas, ' +
             'la regla nueva les daría otro o ninguno: %s (tiene que dar 0)', r.escritas, r.escritasIgualA,
             _at_diag21(r.escritasDistintas));
  Logger.log('  EMPAREJAR_MANUAL [ventana | total]: pares %s → %s | filas con propuesta %s → %s',
             _dc_(A.emp.pares), _dc_(B.emp.pares), A.emp.filasConPropuesta, B.emp.filasConPropuesta);
  // El veredicto, el formulario, su score y su traza (las señales, con la regla de ese lado).
  const lado = function (p, nueva, f) {
    if (!p || !p.veredicto) return '—';
    let t = p.veredicto + (p.motivo ? ' (' + p.motivo + ')' : '');
    if (p.cand) {
      const sc = conUbicacion3_(nueva, function () { return puntuar_(_sinUid_diag21(f), p.cand, comunas); });
      t += ' "' + p.cand.nombre + '" ' + (p.score == null ? sc.score : p.score) + ' [' + sc.nivel + ']';
    }
    return t;
  };
  const listar = function (titulo, l) {
    const orden = l.slice().sort(function (x, y) { return (y.activa - x.activa) || (y.f.fila - x.f.fila); });
    orden.slice(0, 60).forEach(function (x) {
      Logger.log('    %s%s | fila %s | %s | %s | %s | mail: %s | antes: %s | nueva: %s', titulo, x.activa ? '' : ' (cerrada)', x.f.fila,
                 x.f.figura || '(sin figura)', fmtFecha_(x.f.fecha), x.f.barrio || '(sin barrio)', x.f.lugarMail || '—',
                 lado(x.a, false, x.f), lado(x.b, true, x.f));
    });
    if (orden.length > 60) Logger.log('    … y %s más', orden.length - 60);
  };
  listar('CAMBIA', r.cambia);
  listar('PIERDE', r.pierde);
  listar('ESCRITA, CAMBIARÍA', r.escritasDistintas);
  listar('RESUELVE', r.resuelve);
  listar('OTRO', r.otro);
  return r;
}

/** La fila sin RDV_UID ni traza (como la ve el plan del paso 16). */
function _sinUid_diag21(f) { return Object.assign({}, f, { uid: '', formOrigen: '', formClave: '' }); }

/** b) Asistentes y oradores: el cruce con RDV CONJUNTO con las dos reglas. */
function _medirAsistentes_diag21(dest, comunas) {
  Logger.log('--- b) ASISTENTES y ORADORES (RDV CONJUNTO): el cruce con la regla de antes y con la de los tres niveles ---');
  const A = conUbicacion3_(false, function () { return cruzarAsistentes_(dest, comunas); });
  const B = conUbicacion3_(true, function () { return cruzarAsistentes_(dest, comunas); });
  const r = { cambia: [], pierde: [], resuelve: [] };
  if (A.error || B.error) { Logger.log('  >>> %s', A.error || B.error); return r; }
  const porFila = {};
  dest.filas.forEach(function (f) { porFila[f.fila] = f; });
  const claves = new Set(Array.from(A.parDe.keys()).concat(Array.from(B.parDe.keys())));
  claves.forEach(function (filaC) {
    const a = A.parDe.get(filaC), b = B.parDe.get(filaC);
    const fila = A.valores[filaC - 1];
    const x = { filaC: filaC, nombre: str(fila[A.iFig]), ubic: _ubicConjunto_diag21(A, fila), a: a, b: b };
    if (a && b && a !== b) r.cambia.push(x);
    else if (!a && b) r.resuelve.push(x);
    else if (a && !b) r.pierde.push(x);
  });
  Logger.log('  cruzan: antes %s → nueva %s | 2+ filas sin desempate: %s → %s | desempatadas por ubicación: %s → %s | ubicación ' +
             'distinta con una sola fila (cruzan igual): %s → %s', A.encuentran, B.encuentran, A.ambiguas.length, B.ambiguas.length,
             A.desempatadas.length, B.desempatadas.length, A.barrioDifiere.length, B.barrioDifiere.length);
  Logger.log('  CAMBIA %s (tiene que dar 0) | PIERDE %s | RESUELVE %s', r.cambia.length, r.pierde.length, r.resuelve.length);
  const desc = function (n) {
    const f = porFila[n];
    return n ? 'fila ' + n + ' (' + (f ? (f.barrio || 'sin barrio') + (f.lugarMail ? '; mail: ' + f.lugarMail : '') : '') + ')' : '—';
  };
  const listar = function (t, l) {
    l.forEach(function (x) {
      Logger.log('    %s | RDV CONJUNTO %s | %s | %s | antes %s → nueva %s', t, x.filaC, x.nombre, x.ubic || '(sin ubicación)', desc(x.a), desc(x.b));
    });
  };
  listar('CAMBIA', r.cambia); listar('PIERDE', r.pierde); listar('RESUELVE', r.resuelve);
  return r;
}

/** La ubicación que trae una fila de RDV CONJUNTO (BarrioN o Barrio), para el log. */
function _ubicConjunto_diag21(cruce, fila) {
  const iBar = findIdxOr_(cruce.valores[0], ['barrion', 'barrio'], true);
  return iBar != null ? str(fila[iBar]) : '';
}

/** c) La figura de las Seguridad en tu Barrio (también las futuras), con las dos reglas. */
function _medirSeguridad_diag21(dest) {
  Logger.log('--- c) la FIGURA de las Seguridad en tu Barrio (filas de la agenda; también las futuras) con la regla de antes y ' +
             'con la de los tres niveles ---');
  const conj = leerConjuntoPorFecha_();
  const ix = function (n) { return findIdxOr_(dest.hdr, [n], true); };
  const iDir = ix('dirección'), iDirM = ix('dirección (mail)'), iLug = ix('lugar (mail)'), iEvM = ix('evento (mail)'), iUid = ix('agenda_uid');
  const r = { cambia: [], pierde: [], resuelve: [], contradice: [], todas: 0 };
  const hoy = hoyMediodia_();
  dest.filas.forEach(function (f) {
    if (!f.fecha || iUid == null || esVacio_(f.valores[iUid])) return;
    const deSeguridad = iEvM != null && /seguridad/i.test(str(f.valores[iEvM]));
    if (!deSeguridad && f.figura) return;
    r.todas++;
    const dir = (iDir != null ? str(f.valores[iDir]) : '') || (iDirM != null ? str(f.valores[iDirM]) : '');
    const lugar = iLug != null ? str(f.valores[iLug]) : '';
    const com = f.barrio ? _comunaBarrioAg_(f.barrio) : detectComuna_(lugar);
    const barrio = f.barrio ? _canonBarrioAg_(f.barrio) || f.barrio : '';
    const fl = Object.assign({}, f, { lugarMail: lugar });
    const a = conUbicacion3_(false, function () { return figuraSeguridad_(f.fecha, barrio, com == null ? null : com, conj, dir); });
    const b = conUbicacion3_(true, function () {
      return figuraSeguridad_(f.fecha, barrio, com == null ? null : com, conj, dir, undefined, ubicacionDeFila_(fl));
    });
    const x = { f: f, a: a, b: b, futura: f.fecha > hoy };
    let t = '';
    if (a.figura && b.figura && a.figura !== b.figura) { r.cambia.push(x); t = 'CAMBIA'; }
    else if (a.figura && !b.figura) { r.pierde.push(x); t = 'PIERDE'; }
    else if (!a.figura && b.figura) { r.resuelve.push(x); t = 'RESUELVE'; }
    if (f.figura && b.figura && normalizeText_(f.figura) !== normalizeText_(b.figura)) { r.contradice.push(x); t += (t ? ' + ' : '') + 'CONTRADICE'; }
    if (!t && !x.futura && f.figura) return;    // igual y ya tiene su figura: no se lista
    const res = function (q) { return q.figura ? q.figura + ' (' + q.por + '; RDV CONJUNTO fila ' + q.filas.join(', ') + ')' : q.motivo; };
    Logger.log('    %s | fila %s | %s%s | %s | %s | Figura hoy "%s" | antes: %s | nueva: %s', t || 'igual', f.fila, fmtFecha_(f.fecha),
               x.futura ? ' (futura)' : '', f.barrio || '(sin barrio; mail: ' + (lugar || '—') + ')', dir || '(sin dirección)',
               f.figura || '', res(a), res(b));
  });
  Logger.log('  filas de Seguridad de la agenda: %s | CAMBIA %s | PIERDE %s | RESUELVE %s | contradice la Figura cargada %s',
             r.todas, r.cambia.length, r.pierde.length, r.resuelve.length, r.contradice.length);
  return r;
}

// ===================== Paso 49b =====================

/**
 * La agenda: el plan EN SECO con la regla de antes y con la de los tres niveles. No escribe nada (tampoco la cache).
 * `opciones.mails` y `opciones.geocodificar` reemplazan a Gmail y a la geocodificación (los tests), como en la agenda.
 */
function medirUbicacionAgenda(opciones) {
  opciones = opciones || {};
  Logger.log('=== medirUbicacionAgenda (paso 49b) — sólo lectura: el plan de la agenda EN SECO con la regla de antes y con la de ' +
             'los tres niveles; no escribe nada ===');
  const dest = leerDestino_(), A = indicesAgenda_(dest.hdr), alcance = alcanceAgenda_();
  const desdeCopia = AGENDA_COPIA_DESDE ? toDate_(AGENDA_COPIA_DESDE) : null;
  const leerDesde = desdeCopia && desdeCopia < alcance.desde ? desdeCopia : alcance.desde;
  let mails;
  try {
    mails = opciones.mails ? { fuente: '(lista de prueba)', lista: opciones.mails }
                           : leerMailsAgendaGmail_(new Date(leerDesde.getTime() - 7 * 86400000));
  } catch (err) { Logger.log('>>> no se pudieron leer los mails: %s', err); return { error: String(err) }; }
  const r = agendaDesdeListaDeMails_(mails.lista, mails);
  const op = { enSeco: true, historial: leerHistorialAgenda_(), elecciones: leerEleccionesAgenda_(),
               conjunto: leerConjuntoPorFecha_(), geocodificar: opciones.geocodificar || _geocodificadorMedicion_diag21() };
  const pA = conUbicacion3_(false, function () { return planAgenda_(dest, r, A, alcance, op); });
  const pB = conUbicacion3_(true, function () { return planAgenda_(dest, r, A, alcance, op); });
  Logger.log('  mails: %s | alcance: %s | reuniones en el alcance: %s', mails.lista.length, alcance.desc, pA.resumen.reunionesEnAlcance);
  ['crear', 'vincular', 'actualizar', 'mover', 'suspender', 'borrar', 'reactivar', 'figura', 'ambiguas', 'duplicadosAntes',
   'duplicadosDespues', 'cancelaciones', 'yaCargadas', 'figuraACompletar'].forEach(function (k) {
    if (pA.resumen[k] !== pB.resumen[k]) Logger.log('  %s: antes %s → nueva %s', k, pA.resumen[k], pB.resumen[k]);
  });
  const colUid = A.agenda_uid == null ? null : A.agenda_uid + 1;
  const acciones = function (P) {
    const m = new Map();
    P.acciones.forEach(function (a) {
      const fila = a.tipo === 'crear' ? 'nueva' : (a.f ? a.f.fila : a.fila);
      const k = a.tipo + '|' + fila + '|' + (a.ev ? a.ev.clave : '');
      const v = (a.escrituras || []).filter(function (e) { return e.col !== colUid; }).map(function (e) {
        return e.col + '=' + (e.valor instanceof Date ? ymd_(e.valor) : String(e.valor));
      }).join(' ; ');
      m.set(k, { a: a, v: v });
    });
    return m;
  };
  const listas = {
    acciones: [acciones(pA), acciones(pB)],
    duplicados: [pA, pB].map(function (P) {
      const m = new Map();
      P.duplicados.forEach(function (x) {
        const k = x.tipo + '|' + (x.id || (x.fAgenda ? 'fila ' + x.fAgenda.fila : ''));
        m.set(k, { v: x.candidatas.map(function (c) { return c.f.fila + ' (' + c.diferencia + ')'; }).sort().join(', '), x: x });
      });
      return m;
    }),
    yaCargadas: [pA, pB].map(function (P) {
      const m = new Map();
      P.yaCargadas.forEach(function (x) { m.set(x.id, { v: 'fila ' + x.f.fila + ' (' + x.como + ')', x: x }); });
      return m;
    }),
    ambiguas: [pA, pB].map(function (P) {
      const m = new Map();
      P.ambiguas.forEach(function (x) {
        m.set((x.ev ? x.ev.clave : '') + '|' + x.motivo, { v: (x.filas || []).map(function (f) { return f.fila; }).join(', '), x: x });
      });
      return m;
    }),
    figuraACompletar: [pA, pB].map(function (P) {
      const m = new Map();
      P.figuraACompletar.forEach(function (x) { m.set('fila ' + x.f.fila, { v: x.motivo, x: x }); });
      return m;
    })
  };
  const out = {};
  Object.keys(listas).forEach(function (nombre) {
    const a = listas[nombre][0], b = listas[nombre][1];
    const soloA = [], soloB = [], distintas = [];
    a.forEach(function (x, k) { if (!b.has(k)) soloA.push(k); else if (b.get(k).v !== x.v) distintas.push(k); });
    b.forEach(function (x, k) { if (!a.has(k)) soloB.push(k); });
    out[nombre] = { soloAntes: soloA.length, soloNueva: soloB.length, distintas: distintas.length };
    Logger.log('--- %s: antes %s | nueva %s | sólo con la de antes %s | sólo con la nueva %s | distintas %s ---', nombre, a.size, b.size,
               soloA.length, soloB.length, distintas.length);
    soloA.forEach(function (k) { Logger.log('    SÓLO ANTES | %s | %s', k, a.get(k).v); });
    soloB.forEach(function (k) { Logger.log('    SÓLO NUEVA | %s | %s', k, b.get(k).v); });
    distintas.forEach(function (k) { Logger.log('    DISTINTA | %s | antes: %s | nueva: %s', k, a.get(k).v, b.get(k).v); });
  });
  const total = Object.keys(out).reduce(function (s, k) { return s + out[k].soloAntes + out[k].soloNueva + out[k].distintas; }, 0);
  Logger.log('  >>> diferencias en la agenda: %s. Cada una, mirada: tiene que ser una mejora (una pregunta que sobraba, una ' +
             'subzona que separa) y ninguna una fila que hoy se actualiza bien y dejaría de hacerlo.', total);
  out.total = total;
  return out;
}

/** La geocodificación de la medición: la cache de AGENDA_GEOCODE y, lo que falte, Maps (con el tope); nada se escribe. */
function _geocodificadorMedicion_diag21() {
  const cache = _leerCacheGeocode_();
  let llamadas = 0;
  return function (consulta) {
    const g = cache.get(consulta);
    if (g) return g;
    if (llamadas >= GEOCODE_MAX_POR_CORRIDA) return { consulta: consulta, estado: 'ERROR', lat: '', lng: '' };
    llamadas++;
    const n = _geocodificar_(consulta, true);
    if (n.estado !== 'ERROR') cache.set(consulta, n);     // sólo en memoria
    return n;
  };
}

// ===================== Paso 50 =====================

/**
 * La columna ID: la fórmula en el backup de la base y hoy, los valores rotos y 3 ejemplos antes / después. El "después"
 * sale de la PLANTILLA que se deduce de los valores buenos del backup (qué columna, tal como se muestra, va en cada parte
 * "a | b | c"): es una vista previa; la derivada se escribe con la fórmula, una vez vista.
 */
function inspeccionarColumnaId() {
  Logger.log('=== inspeccionarColumnaId (paso 50) — sólo lectura: la columna ID en el backup de la base y hoy; no escribe nada ===');
  let backup = null;
  try {
    const ssB = SpreadsheetApp.openById(RDV_SS_BACKUP_BASE);
    const shB = ssB.getSheetByName(RDV_HOJA_DESTINO_REAL);
    if (!shB) Logger.log('>>> el backup de la base ("%s") no tiene la solapa "%s"', ssB.getName(), RDV_HOJA_DESTINO_REAL);
    else backup = _columnaId_diag21(shB, 'BACKUP (' + RDV_BACKUP_BASE_VERSION + ')');
  } catch (err) {
    Logger.log('>>> el backup de la base (%s) no se pudo abrir: %s', RDV_SS_BACKUP_BASE, err);
  }
  const hoy = _columnaId_diag21(ssDestino_().getSheetByName(RDV_HOJA_DESTINO), 'HOY (' + RDV_HOJA_DESTINO + ')');
  if (!hoy) return { error: 'el destino no tiene columna ID' };

  // La plantilla, de los valores buenos del backup (o de hoy, si el backup no se pudo leer).
  const base = backup && backup.buenos.length ? backup : hoy;
  const pl = _plantillaId_diag21(base);
  if (pl) {
    Logger.log('--- la plantilla que se deduce de %s valores buenos de %s: %s partes separadas por " | " ---', pl.n,
               base === backup ? 'el BACKUP' : 'HOY', pl.partes.length);
    pl.partes.forEach(function (p, k) {
      Logger.log('    parte %s: %s', k + 1, p.col == null ? '(no coincide con ninguna columna: ' + p.ejemplo + ')'
                                                            : 'la columna "' + base.hdr[p.col] + '" tal como se muestra (' + p.votos + ' de ' + pl.n + ')');
    });
  }
  Logger.log('--- 3 ejemplos ANTES (hoy) / DESPUÉS (con la plantilla) ---');
  hoy.rotos.slice(0, 3).forEach(function (fila) {
    const antes = hoy.vals[fila - 1][hoy.iId];
    const despues = pl ? pl.partes.map(function (p) { return p.col == null ? '?' : String(hoy.disp[fila - 1][_colEnHoy_diag21(base, hoy, p.col)] || '').trim(); }).join(' | ') : '(sin plantilla)';
    Logger.log('    fila %s\n      antes:   %s\n      después: %s', fila, antes, despues);
  });
  // Los valores del backup que hoy cambiaron (misma figura + fecha), si el backup se leyó. 08/10: contra la MISMA fila del
  // backup si tiene esa figura y fecha; si no, la primera con ellas. Antes, siempre la primera: con dos reuniones de la
  // misma figura el mismo día comparaba reuniones distintas (los "7 que cambiaron" del 07/10; el paso 53 da 0).
  if (backup) {
    const enBackup = new Map();
    backup.vals.slice(1).forEach(function (r, j) {
      const k = claveNatural_(str(r[backup.iFig]), toDate_(r[backup.iFec]));
      if (!k) return;
      if (!enBackup.has(k)) enBackup.set(k, []);
      enBackup.get(k).push(j + 1);
    });
    let iguales = 0, distintas = 0;
    const ej = [];
    hoy.vals.slice(1).forEach(function (r, i) {
      const k = claveNatural_(str(r[hoy.iFig]), toDate_(r[hoy.iFec]));
      if (!k || !enBackup.has(k)) return;
      const filas = enBackup.get(k), j = filas.indexOf(i + 1) >= 0 ? i + 1 : filas[0];
      const antes = backup.vals[j][backup.iId];
      if (String(antes) === String(r[hoy.iId])) iguales++;
      else { distintas++; if (ej.length < 5) ej.push('fila ' + (i + 2) + ': backup "' + antes + '" / hoy "' + r[hoy.iId] + '"'); }
    });
    Logger.log('--- las filas que están en el backup (por figura + fecha): ID igual %s | distinto %s ---', iguales, distintas);
    ej.forEach(function (t) { Logger.log('    %s', t); });
  }
  Logger.log('  >>> Nada de este proyecto escribe la columna ID en "%s" (ningún archivo la tiene entre lo que escribe). Si hay ' +
             'valores rotos nuevos, los escribe otra cosa: un script atado al archivo del destino (otro proyecto) o una fórmula.',
             RDV_HOJA_DESTINO);
  return { backup: backup ? { conFormula: backup.conFormula, rotos: backup.rotos.length, buenos: backup.buenos.length } : null,
           hoy: { conFormula: hoy.conFormula, rotos: hoy.rotos.length, buenos: hoy.buenos.length, vacias: hoy.vacias },
           plantilla: pl ? pl.partes.map(function (p) { return p.col == null ? null : base.hdr[p.col]; }) : null };
}

/** La columna de `base` (por su encabezado) en la hoja `hoy`. */
function _colEnHoy_diag21(base, hoy, col) {
  if (base === hoy) return col;
  const k = findIdxOr_(hoy.hdr, [base.hdr[col]], true);
  return k == null ? col : k;
}

/** Lee la columna ID de una solapa: fórmulas (y las distintas), valores rotos / buenos / vacíos, con ejemplos. */
function _columnaId_diag21(sh, titulo) {
  const nF = sh.getLastRow(), nC = sh.getLastColumn();
  const rango = sh.getRange(1, 1, nF, nC);
  const vals = rango.getValues(), disp = rango.getDisplayValues(), hdr = vals[0];
  const iId = findIdxOr_(hdr, ['id'], true);
  if (iId == null) { Logger.log('--- %s: no tiene columna "ID" ---', titulo); return null; }
  const letra = _letraCol_(iId + 1);
  const col = sh.getRange(1, iId + 1, nF, 1);
  const a1 = col.getFormulas().map(function (x) { return x[0]; });
  const r1c1 = col.getFormulasR1C1().map(function (x) { return x[0]; });
  const distintas = {};
  r1c1.forEach(function (x, i) {
    if (!x) return;
    if (!distintas[x]) distintas[x] = { n: 0, primera: i + 1, a1: a1[i] };
    distintas[x].n++;
  });
  const conFormula = a1.filter(String).length;
  Logger.log('--- %s: ID es la columna %s | celdas con fórmula: %s (de %s filas, encabezado incluido) ---', titulo, letra, conFormula, nF);
  Object.keys(distintas).slice(0, 8).forEach(function (k) {
    const d = distintas[k];
    Logger.log('    FÓRMULA (en %s celdas; la primera, %s%s): %s', d.n, letra, d.primera, d.a1);
  });
  // ¿alguna fórmula de array del encabezado que nombre la columna ID?
  sh.getRange(1, 1, 1, nC).getFormulas()[0].forEach(function (x, k) {
    if (x && k !== iId && /ARRAYFORMULA|\{/.test(x) && new RegExp('\\b' + letra + '\\d*:', 'i').test(x)) {
      Logger.log('    fila 1, %s (%s): %s', _letraCol_(k + 1), hdr[k], x);
    }
  });
  const ix = function (n) { return findIdxOr_(hdr, aliasColumna_(n), true); };
  const iFig = ix('Figura'), iFec = ix('FECHA'), iHora = ix('HORA'), iBar = ix('Barrio'), iDir = ix('Dirección');
  const iOri = findIdxOr_(hdr, ['origen fila'], true);
  const rotos = [], buenos = [];
  let vacias = 0;
  for (let i = 1; i < nF; i++) {
    const v = vals[i][iId];
    if (esVacio_(v)) { if (!esVacio_(vals[i][iFig]) || !esVacio_(vals[i][iFec])) vacias++; continue; }
    if (/GMT[+-]\d{4}/.test(String(v))) rotos.push(i + 1); else buenos.push(i + 1);
  }
  Logger.log('    valores: ROTOS (con una fecha de JavaScript, "GMT-0300") %s | otros con valor %s | vacíos (en filas con datos) %s',
             rotos.length, buenos.length, vacias);
  const tipo = function (x) { return x instanceof Date ? 'fecha/hora' : (x === '' ? 'vacía' : typeof x); };
  const fila = function (n) {
    const r = vals[n - 1];
    return 'fila ' + n + ' | ' + [iFig, iBar, iFec, iHora, iDir].map(function (k) { return k == null ? '—' : disp[n - 1][k]; }).join(' | ') +
           ' | FECHA ' + tipo(iFec == null ? '' : r[iFec]) + ', HORA ' + tipo(iHora == null ? '' : r[iHora]) +
           (iOri != null ? ' | Origen fila: ' + (str(r[iOri]) || '—') : '') + (a1[n - 1] ? ' | fórmula: ' + a1[n - 1] : '');
  };
  buenos.slice(0, 3).forEach(function (n) { Logger.log('    BUENO | %s\n           ID: %s', fila(n), vals[n - 1][iId]); });
  rotos.slice(0, 10).forEach(function (n) { Logger.log('    ROTO  | %s\n           ID: %s', fila(n), vals[n - 1][iId]); });
  if (rotos.length) Logger.log('    filas rotas: %s', rotos.length > 40 ? rotos.slice(0, 40).join(', ') + ' …' : rotos.join(', '));
  return { sh: sh, hdr: hdr, vals: vals, disp: disp, iId: iId, iFig: iFig, iFec: iFec, conFormula: conFormula,
           rotos: rotos, buenos: buenos, vacias: vacias };
}

/**
 * La plantilla del ID, de los valores buenos: cada parte ("a | b | c") con la columna cuyo valor MOSTRADO coincide en
 * más filas. null si no hay valores buenos.
 */
function _plantillaId_diag21(t) {
  if (!t || !t.buenos.length) return null;
  const muestra = t.buenos.slice(-60);           // las más nuevas
  let n = 0;
  const votos = [], ejemplos = [];
  const largo = {};
  muestra.forEach(function (fila) { const k = String(t.vals[fila - 1][t.iId]).split(' | ').length; largo[k] = (largo[k] || 0) + 1; });
  const nPartes = Number(Object.keys(largo).sort(function (a, b) { return largo[b] - largo[a]; })[0]);
  muestra.forEach(function (fila) {
    const partes = String(t.vals[fila - 1][t.iId]).split(' | ');
    if (partes.length !== nPartes) return;
    n++;
    const d = t.disp[fila - 1];
    partes.forEach(function (p, k) {
      votos[k] = votos[k] || {};
      const x = p.trim();
      if (!ejemplos[k] && x) ejemplos[k] = x;
      if (!x) return;
      d.forEach(function (y, c) { if (c !== t.iId && String(y).trim() === x) votos[k][c] = (votos[k][c] || 0) + 1; });
    });
  });
  const partes = [];
  for (let k = 0; k < nPartes; k++) {
    const v = votos[k] || {};
    const mejor = Object.keys(v).sort(function (a, b) { return v[b] - v[a]; })[0];
    partes.push({ col: mejor == null ? null : Number(mejor), votos: mejor == null ? 0 : v[mejor], ejemplo: ejemplos[k] || '(vacía)' });
  }
  return { n: n, partes: partes };
}
