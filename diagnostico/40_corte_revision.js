/**
 * diagnostico/40_corte_revision.js — "LO VIEJO SE DEJA COMO ESTÁ": qué dejaría de aparecer para revisar, EN SECO (20/10; prompt 10,
 * punto 2; REVISION_DESDE_FECHA_CORTE, APAGADO; 59_CorteRevision.js).
 *
 * SÓLO LECTURA: lee la base, B, Comunas, ELECCIONES_MATCH y las solapas de revisión (para "elegido"), RDV CONJUNTO, HECHAS_NO_VAN,
 * HISTORICO_SIN_RESOLVER e IDS_SIN_CRUZAR; no escribe ninguna celda, no crea solapas, no guarda propiedades, no manda mails. Corre con
 * el interruptor apagado: SIMULA el corte prendido con las MISMAS funciones que la corrida (`_forzarCorteRevision_`, que se devuelve
 * a como estaba al terminar). Por solapa: cuántas líneas hay hoy, cuántas quedan y cuáles dejan de aparecer (las primeras N, con su
 * fecha), y la VERIFICACIÓN de que no desaparece nada del corte en adelante ni nada sin fecha (si pasara, lo dice en MAYÚSCULAS).
 *
 * De dónde sale cada solapa:
 *   REVISAR_MATCH (fichas y RESUELTAS), SIN_MATCH, EMPAREJAR_MANUAL: el plan de la próxima corrida (`calcularPlan_(true)`, como el
 *     paso 2 en seco), filtrado como lo filtraría `escribirReportes_`;
 *   HISTORICO_SIN_RESOLVER: la solapa como está hoy (la escribe sólo el paso 22, completar el historial);
 *   IDS_SIN_CRUZAR: la solapa como está hoy (la escribe la corrida de los IDs, cada 3 h), por su columna "Fecha (lista)";
 *   "se hizo y no está en la base": el aviso de la agenda (`reunionesHechasSinFila_` con el alcance de la agenda y la lista de
 *     AGENDA_PENDIENTES de `infoAgenda_`), y aparte, como el paso 104, desde el 15/07.
 *
 *     medirCorteRevision()            // las primeras 25 de cada solapa
 *     medirCorteRevision({ n: 60 })
 */
function medirCorteRevision(opciones) {
  opciones = opciones || {};
  const t0 = Date.now();
  const N = opciones.n || 25;
  const corte = ymdFechaCorteRevision_();
  Logger.log('=== "Lo viejo se deja como está": qué dejaría de aparecer para revisar — EN SECO, SÓLO LECTURA ===');
  Logger.log('  fecha de corte FECHA_CORTE_REVISION = "%s" | interruptor REVISION_DESDE_FECHA_CORTE = %s (este paso SIMULA el corte prendido)',
             FECHA_CORTE_REVISION, REVISION_DESDE_FECHA_CORTE);
  const R = { corte: corte, solapas: [], problemas: [], error: '' };
  if (!corte) {
    R.error = 'FECHA_CORTE_REVISION no es una fecha "yyyy-MM-dd"';
    Logger.log('>>> FECHA_CORTE_REVISION NO ES UNA FECHA "yyyy-MM-dd" VÁLIDA: CON EL INTERRUPTOR PRENDIDO NO SE ESCONDERÍA NADA. Corregirla en 00_Config.js.');
    return R;
  }
  Logger.log('  se dejaría de mostrar lo ANTERIOR al %s (la fecha de la reunión; sin fecha legible, se muestra)', fmtCorteRevision_(corte));
  const antes = _forzarCorteRevision_;
  try {
    // ---- 1) el plan de la próxima corrida (sólo lectura) ----
    const plan = opciones.plan || calcularPlan_(true);
    const ctx = _contextoFichas_(plan, null);
    const con = function (forzado, fn) { _forzarCorteRevision_ = forzado; try { return fn(); } finally { _forzarCorteRevision_ = antes; } };

    const fichasT = con(false, function () { return _listaFichas_(plan, ctx, {}); });
    const fichasQ = con(true, function () { return _listaFichas_(plan, ctx, {}); });
    _informarCorte_(R, 'REVISAR_MATCH — fichas pendientes (archivo de la base)', fichasT, fichasQ, corte, N,
                    function (f) { return f.fecha; },
                    function (f) { const pf = plan.porFila[f.fila] || {}; return 'fila ' + f.fila + ' | ' + f.figura + ' | ' + (f.barrio || 'sin barrio') + ' | ' + (pf.motivo || pf.veredicto || ''); });
    const resT = con(false, function () { return _resueltas_(ctx); });
    const resQ = con(true, function () { return _resueltas_(ctx); });
    _informarCorte_(R, 'REVISAR_MATCH — RESUELTAS (sólo se dejan de mostrar; ELECCIONES_MATCH no cambia)', resT, resQ, corte, N,
                    function (e) { return e.fecha; },
                    function (e) { return (e.f ? 'fila ' + e.f.fila + ' | ' : '') + e.figura + ' | ' + (e.barrio || 'sin barrio') + ' | ' +
                                          (e.elegido === 'ninguno' ? 'Ninguno' : (e.formNombre || '')) + ' | ' + (e.estado || e.resultadoPlan || ''); });

    const rT = con(false, function () { return reportesConCorte_(plan); });
    const rQ = con(true, function () { return reportesConCorte_(plan); });
    if (!REVISAR_COMO_FICHAS) {
      _informarCorte_(R, 'REVISAR_MATCH — una línea por fila', rT.revisar, rQ.revisar, corte, N, function (l) { return l[3]; },
                      function (l) { return l[1] + ' | ' + l[2] + ' | ' + l[8]; });
    }
    _informarCorte_(R, 'SIN_MATCH (intermedia)', rT.sinMatch, rQ.sinMatch, corte, N, function (l) { return l[3]; },
                    function (l) { return l[1] + ' | ' + (l[2] || 'sin barrio') + ' | ' + l[4]; });
    _informarCorte_(R, 'EMPAREJAR_MANUAL (intermedia; en "formularios sin ningún candidato", la fecha del formulario)',
                    _lineasDatosEmparejar_(rT.emparejar), _lineasDatosEmparejar_(rQ.emparejar), corte, N, function (l) { return l[4]; },
                    function (l) {
                      return l[0] ? l[0] + (l[2] ? ' → ' + l[2] + ' | ' + (l[3] || 'sin barrio') : '')
                                  : (l[1] ? 'fila ' + l[1] + ' | ' : '') + l[2] + ' | ' + (l[3] || 'sin barrio');
                    });

    // ---- 2) las dos solapas que no salen del plan: como están hoy ----
    _informarSolapaCorte_(R, ssIntermedia_(), RDV_HOJA_HISTORICO, 'HISTORICO_SIN_RESOLVER (intermedia; la escribe sólo el paso 22)', ['fecha'], corte, N,
                          function (r, h) { return r[h('fila')] + ' | ' + r[h('figura')] + ' | ' + (r[h('barrio')] || 'sin barrio') + ' | ' + r[h('motivo')]; });
    _informarSolapaCorte_(R, ssIntermedia_(), IDS_SOLAPA_SIN_CRUZAR, 'IDS_SIN_CRUZAR (intermedia; por la Fecha de la lista)', ['fecha (lista)'], corte, N,
                          function (r, h) { return r[h('id')] + ' | ' + r[h('funcionario')] + ' | ' + r[h('barrio / comuna')] + ' | ' + r[0]; });

    // ---- 3) "se hizo y no está en la base": el aviso de la agenda (AGENDA_PENDIENTES y 'agenda_info') ----
    const cruce = cruzarAsistentes_(plan.dest, plan.comunas);
    const alcance = alcanceAgenda_();
    const hs = reunionesHechasSinFila_(plan.dest, cruce, plan.comunas, { desde: alcance.desde, hasta: hoyMediodia_() });
    if (hs.error) Logger.log('  >>> "se hizo y no está en la base": %s (no se mide)', hs.error);
    else {
      const items = function (forzado) {
        return con(forzado, function () {
          return infoAgenda_({ enSeco: true, hechasSinFila: hs }).filter(function (it) { return /^hecha_sin_fila\|/.test(it.id); });
        });
      };
      _informarCorte_(R, '"se hizo y no está en la base" (AGENDA_PENDIENTES y el aviso diario; ' + alcance.desc + ')', items(false), items(true),
                      corte, N, function (it) { return it.fecha; }, function (it) { return it.reunion; }, function (it) { return it.id; });
      // como el paso 104: desde el 15/07 (las tres viejas, Muzzio 29/07 y 14/08, Sánchez Zinny 12/08, ya están fuera del alcance de la agenda)
      const hs104 = reunionesHechasSinFila_(plan.dest, cruce, plan.comunas, { desde: toDate_('2026-07-15'), hasta: hoyMediodia_() });
      const viejas = (hs104.lista || []).filter(function (h) { return antesDelCorte_(h.fecha, corte); });
      Logger.log('  (como el paso 104, desde el 15/07: %s "hechas sin fila", %s de antes del corte: %s — las de antes del %s ya no las avisa la ' +
                 'corrida de la hora, con el corte prendido o apagado: están fuera del alcance de la agenda)', (hs104.lista || []).length, viejas.length,
                 viejas.map(function (h) { return fmtFecha_(h.fecha) + ' ' + (h.figura || '(sin figura)') + ' ' + (h.barrio || ''); }).join(' / ') || '—',
                 fmtFecha_(alcance.desde));
    }
  } catch (err) {
    R.error = String(err && err.message || err);
    Logger.log('>>> EL SECO SE CORTÓ: %s', R.error);
  } finally {
    _forzarCorteRevision_ = antes;
  }

  Logger.log('--- RESUMEN (corte %s) ---', fmtCorteRevision_(corte));
  R.solapas.forEach(function (s) {
    Logger.log('  %s: hoy %s | quedarían %s | dejarían de aparecer %s', s.nombre, s.total, s.quedan, s.salen);
  });
  if (R.problemas.length) {
    Logger.log('>>> OJO: DESAPARECERÍA ALGO CON FECHA IGUAL O POSTERIOR AL CORTE, SIN FECHA, O APARECERÍA ALGO QUE NO ESTABA (%s). NO PRENDER EL ' +
               'INTERRUPTOR: avisar.', R.problemas.length);
    R.problemas.slice(0, 40).forEach(function (p) { Logger.log('    >>> %s', p); });
  } else if (!R.error) {
    Logger.log('  VERIFICACIÓN: no desaparece nada del %s en adelante ni nada sin fecha, y no aparece nada nuevo. OK.', fmtCorteRevision_(corte));
  }
  Logger.log('  Nada de esto escribió ni borró nada. Si está bien: REVISION_DESDE_FECHA_CORTE = true + clasp push. (%s ms)', Date.now() - t0);
  return R;
}

/** Las líneas de datos de EMPAREJAR_MANUAL: sin el encabezado, los títulos ("--- …"), el encabezado del bloque por fila ni las vacías. */
function _lineasDatosEmparejar_(matriz) {
  if (!matriz || !matriz.length) return [];
  return matriz.slice(1).filter(function (l) {
    return !/^---/.test(String(l[0])) && !l.every(function (x) { return x === '' || x === null || x === undefined; });
  });
}

/**
 * Una solapa del seco: `todas` (con el corte apagado) contra `quedan` (prendido). Lo que sale tiene que ser de ANTES del corte; lo que
 * queda, estar en `todas`. Loguea las primeras `n` que salen (de la más reciente a la más vieja) y cuántas por mes. `clave`: cómo se
 * reconoce la misma línea en las dos listas (por defecto, el mismo objeto).
 */
function _informarCorte_(R, nombre, todas, quedan, corte, n, fechaDe, desc, clave) {
  todas = todas || []; quedan = quedan || [];
  const k = clave || function (x) { return x; };
  const enQ = new Set(quedan.map(k)), enT = new Set(todas.map(k));
  const salen = todas.filter(function (x) { return !enQ.has(k(x)); });
  const nuevas = quedan.filter(function (x) { return !enT.has(k(x)); });
  const fecha = function (x) { return fechaParaCorte_(fechaDe(x)); };
  salen.forEach(function (x) {
    const d = fecha(x);
    if (!d || ymd_(d) >= corte) R.problemas.push(nombre + ': DESAPARECERÍA "' + desc(x) + '" (fecha ' + (d ? fmtFecha_(d) : 'ilegible: ' + fechaDe(x)) + ')');
  });
  nuevas.forEach(function (x) { R.problemas.push(nombre + ': APARECERÍA "' + desc(x) + '", que con el corte apagado no está'); });
  const porMes = {};
  salen.forEach(function (x) { const d = fecha(x); const m = d ? ymd_(d).slice(0, 6) : '?'; porMes[m] = (porMes[m] || 0) + 1; });
  Logger.log('--- %s: hoy %s | con el corte quedan %s | DEJAN DE APARECER %s%s', nombre, todas.length, quedan.length, salen.length,
             salen.length ? ' (por mes: ' + Object.keys(porMes).sort().map(function (m) {
               return (m === '?' ? 'sin fecha' : m.slice(4, 6) + '/' + m.slice(0, 4)) + ' ' + porMes[m]; }).join(', ') + ')' : '');
  salen.slice().sort(function (a, b) {
    const da = fecha(a), db = fecha(b);
    return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
  }).slice(0, n).forEach(function (x) {
    const d = fecha(x);
    Logger.log('    %s | %s', d ? fmtFecha_(d) : '(sin fecha)', desc(x));
  });
  if (salen.length > n) Logger.log('    … y %s más', salen.length - n);
  R.solapas.push({ nombre: nombre, total: todas.length, quedan: quedan.length, salen: salen.length });
}

/** Una solapa tal como está hoy: sus filas, contra las que quedan con el corte por la columna `colsFecha` (por encabezado). */
function _informarSolapaCorte_(R, ss, hoja, nombre, colsFecha, corte, n, desc) {
  const sh = ss.getSheetByName(hoja);
  if (!sh || sh.getLastRow() < 2) { Logger.log('--- %s: la solapa no existe o está vacía (nada que esconder)', nombre); return; }
  const vals = sh.getRange(1, 1, sh.getLastRow(), Math.max(sh.getLastColumn(), 1)).getValues();
  const hdr = vals[0].map(function (x) { return normalizeText_(x); });
  const h = function (nom) { const i = hdr.indexOf(normalizeText_(nom)); return i < 0 ? 0 : i; };
  const iF = colsFecha.map(function (c) { return hdr.indexOf(normalizeText_(c)); }).filter(function (i) { return i >= 0; })[0];
  if (iF == null) { Logger.log('--- %s: NO TIENE LA COLUMNA "%s": no se puede medir', nombre, colsFecha.join('" / "')); return; }
  const filas = vals.slice(1).filter(function (r) { return !r.every(function (x) { return x === '' || x === null; }); });
  const quedan = filas.filter(function (r) { return !antesDelCorte_(r[iF], corte); });
  _informarCorte_(R, nombre, filas, quedan, corte, n, function (r) { return r[iF]; }, function (r) { return desc(r, h); });
}
