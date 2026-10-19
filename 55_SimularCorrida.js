/**
 * 55_SimularCorrida.js — LA PRÓXIMA CORRIDA DE LA HORA, EN MEMORIA (19/10; prompt 08, regla 3). SÓLO LECTURA: no escribe nada.
 *
 * Prompt: docs/prompts/PROMPT-08-AGENDA-MACRI-Y-ORDEN-BASE.md, regla 3: "Cuando un cambio toque filas de la base, el seco tiene que
 * simular la próxima corrida de la hora completa (agenda, cruce de formularios, asistentes, IDs, derivadas, Looker) y listar todas
 * las celdas que cambiarían en toda la base. Si cambia algo fuera de lo esperado, el paso real no corre." Lo usan el paso 101 (separar
 * la 824, 56_SepararReunion.js) y el paso 107 (ordenar la base, 57_OrdenBase.js).
 *
 * Cómo: las mismas funciones que la corrida de la hora (`_correrUpsertPartes_`, 20_UpsertDestino.js), en el mismo orden, sobre una
 * COPIA de la base en memoria (como el paso 51, diagnostico/22_previsualizar.js):
 *   1. la agenda: `fusionAntesDelPlanAgenda_` en seco (lo que juntaría se lista; el borrado no se simula) y `planAgenda_`, con los
 *      mails de Gmail (la cache de los mails se LEE, no se escribe) y la geocodificación SÓLO de la cache (no llama a Maps); sus
 *      escrituras se aplican a la copia como `escribirAgendaLote_` (sólo si la celda tiene lo esperado; la primera gana);
 *   2. el cruce con los formularios (`calcularPlan_`) y con RDV CONJUNTO (`cruzarAsistentes_`), sobre la copia ya con la agenda:
 *      `celdasDeDecision_` (las mismas celdas que escribe `aplicarDecisiones_`: sólo vacías) y la transición a Realizada;
 *   3. las derivadas (las once y la ID: `derivadasQueCambian_`, el mismo cálculo que `recalcDerivadas_`);
 *   4. los IDs de los encuentros (`cruzarIds_`; primero los IDs, después las fechas de envío, como `escribirIdsBase_`), como si
 *      tocaran en esta corrida (IDS_SOLO_CADA_HORAS los saltea a veces: la simulación mira el peor caso);
 *   5. Looker (`armarDatosUnpivot_`, `armarAuxMaximos_`): no escribe la base; se comparan sus filas.
 * Las vistas del archivo "Agenda", AGENDA_DUPLICADOS, las fichas y los registros no son la base: no se simulan (el plan de la agenda
 * sí dice qué pares "una reunión en dos filas", ambiguas y duplicados tendría).
 *
 * Lo que lee se lee UNA vez (`entradasSimulacion_`) y sirve para simular varias bases (la de hoy y la "como quedaría"):
 * `compararSimulaciones_` dice qué cambia de una a otra, fila por fila por su identidad.
 */

/** Cuánto puede tardar la simulación antes de dejar las partes que faltan (el límite de Apps Script es 6 minutos). */
const SIMULACION_LIMITE_MS = 320000;

/**
 * Lo que la simulación lee UNA vez (sólo lectura): la base, los mails (y su parse), el historial y las elecciones de la agenda, RDV
 * CONJUNTO, los formularios de B, Comunas, la lista de IDs (con IDS_EN_LA_HORA) y las fórmulas de las columnas derivadas y de los
 * IDs. `opciones` (los tests): `mails`, `geocodificar`, `bloque`, `cands`, `listaIds`, `historial`, `elecciones`, `conjunto`,
 * `valoresConjunto`, `limiteMs`.
 */
function entradasSimulacion_(opciones) {
  opciones = opciones || {};
  const E = { t0: Date.now(), limiteMs: opciones.limiteMs || SIMULACION_LIMITE_MS, avisos: [], tiempos: {} };
  const medir = function (k, fn) {
    const t = Date.now();
    try { return fn(); }
    catch (err) { E.avisos.push(k + ': ' + (err && err.message || err)); return null; }
    finally { E.tiempos[k] = Date.now() - t; }
  };
  E.sh = verificarHojaDestino_(ssDestino_());
  E.bloque = opciones.bloque || medir('base', function () { return E.sh.getRange(1, 1, E.sh.getLastRow(), E.sh.getLastColumn()).getValues(); });
  E.alcance = alcanceAgenda_();
  if (AGENDA_ACTIVA) {
    E.mails = medir('mails', function () {
      if (opciones.mails) return { fuente: '(lista de prueba)', lista: opciones.mails };
      const desdeCopia = AGENDA_COPIA_DESDE ? toDate_(AGENDA_COPIA_DESDE) : null;
      const leerDesde = desdeCopia && desdeCopia < E.alcance.desde ? desdeCopia : E.alcance.desde;
      // la cache de los mails, SÓLO para leer (no se cierra: no se escribe nada en CacheService)
      const cache = AGENDA_CACHE_MAILS && typeof cacheAgendaAbrir_ === 'function' ? cacheAgendaAbrir_() : null;
      return leerMailsAgendaGmail_(new Date(leerDesde.getTime() - 7 * 86400000),
                                   AGENDA_COLORES_MAIL || cache ? { html: AGENDA_COLORES_MAIL, cache: cache } : undefined);
    });
    E.r = E.mails && E.mails.lista.length ? medir('parse', function () { return agendaDesdeListaDeMails_(E.mails.lista, E.mails); }) : null;
    if (E.mails && !E.mails.lista.length) E.avisos.push('mails: la búsqueda no trajo ningún mail (la agenda no se simula)');
    E.historial = opciones.historial || medir('historial', leerHistorialAgenda_);
    E.elecciones = opciones.elecciones || medir('elecciones', function () { return leerEleccionesAgenda_(); });
    E.conjuntoPorFecha = opciones.conjunto || medir('conjunto', leerConjuntoPorFecha_);
  }
  E.geocodificar = opciones.geocodificar || _geoSoloCacheSim_();
  E.valoresConjunto = opciones.valoresConjunto || medir('rdv_conjunto', function () {
    const s = ssDestino_().getSheetByName(RDV_HOJA_ASISTENTES_SRC);
    return s ? s.getRange(1, 1, s.getLastRow(), s.getLastColumn()).getValues() : null;
  });
  E.cands = opciones.cands || medir('formularios', leerCandidatos_);
  E.comunas = opciones.comunas || medir('comunas', leerComunasMap_);
  E.tablaComunas = medir('tabla_comunas', function () { return _tablaComunasDerivadas_(ssDestino_()); }) || new Map();
  // las fórmulas (una columna con fórmula no se escribe): la fila 1 y 2 de cada derivada, y la ID y los IDs en cualquier fila
  medir('formulas', function () {
    const nC = E.bloque[0].length, nF = E.bloque.length;
    E.f1 = E.sh.getRange(1, 1, 1, nC).getFormulas()[0];
    E.f2 = nF >= 2 ? E.sh.getRange(2, 1, 1, nC).getFormulas()[0] : E.f1.map(function () { return ''; });
    const kId = findIdxOr_(E.bloque[0], [COLUMNA_ID], true);
    E.idConFormula = kId != null && nF > 1 ? E.sh.getRange(2, kId + 1, nF - 1, 1).getFormulas().filter(function (x) { return x[0]; }).length : 0;
    E.formulasIds = typeof formulasEnColumnasIds_ === 'function' ? formulasEnColumnasIds_(E.sh, columnasIdsEnBase_(E.bloque[0])) : {};
  });
  if (IDS_EN_LA_HORA) E.listaIds = opciones.listaIds || medir('lista_ids', leerListaIds_);
  E.leidoMs = Date.now() - E.t0;
  return E;
}

/** La geocodificación de la simulación: SÓLO la cache AGENDA_GEOCODE (no llama a Maps, no escribe la cache). */
function _geoSoloCacheSim_() {
  let cache = null;
  return function (consulta) {
    if (!cache) { try { cache = _leerCacheGeocode_(); } catch (e) { cache = new Map(); } }
    return cache.get(consulta) || { consulta: consulta, estado: 'ERROR', lat: '', lng: '', detalle: 'no está en la cache (la simulación no geocodifica)' };
  };
}

/**
 * **La próxima corrida de la hora sobre `bloque`** (la base entera, encabezado en [0]; no se modifica: se copia). Devuelve
 * `{ cambios: [{ parte, fila, col, nombre, antes, despues, tipo, detalle }], saltadas, borrar, fusion, P (el plan de la agenda),
 * plan (el del cruce), asis, ids, looker, bloqueFinal, incompleta, ms }`. `opciones.sinAgenda` / `sinIds`: para las pruebas.
 */
function simularCorridaHora_(bloque, E, opciones) {
  opciones = opciones || {};
  const t0 = Date.now();
  const S = { cambios: [], saltadas: [], borrar: [], fusion: [], avisos: [], incompleta: '', partes: [] };
  const sim = bloque.map(function (r) { return r.slice(); });
  const hdr = sim[0], ancho = hdr.length;
  // 19/10 (revisor): las filas vacías al empezar (o fantasma): lo que la corrida escriba ahí es una fila NUEVA, no la de ese número
  S.filasEntrada = bloque.length; S.vaciasEntrada = new Set();
  for (let i = 1; i < bloque.length; i++) if (!bloque[i].some(function (x, k) { return !esColumnaDerivada_(hdr[k]) && !esVacio_(x); })) S.vaciasEntrada.add(i + 1);
  const vistas = {};
  const hayTiempo = function (parte) {
    if (Date.now() - E.t0 < E.limiteMs) return true;
    if (!S.incompleta) S.incompleta = parte;
    return false;
  };
  /** Una celda escrita por una parte (la primera escritura de esa parte en la celda gana, como en la escritura real). */
  const anotar = function (parte, fila, col, valor, tipo, detalle) {
    const k = parte + '|' + fila + '|' + col;
    if (vistas[k]) return;
    vistas[k] = true;
    while (sim.length < fila) sim.push(new Array(ancho).fill(''));
    const antes = sim[fila - 1][col - 1];
    S.cambios.push({ parte: parte, fila: fila, col: col, nombre: str(hdr[col - 1]), antes: antes, despues: valor, tipo: tipo || '', detalle: detalle || '' });
    sim[fila - 1][col - 1] = valor;
  };
  const destDe = function () { return armarDestino_(E.sh, RDV_HOJA_DESTINO, sim); };

  // --- 1. la agenda ---
  if (AGENDA_ACTIVA && E.r && !opciones.sinAgenda && hayTiempo('agenda')) {
    S.partes.push('agenda');
    const dest = destDe();
    const A = indicesAgenda_(hdr);
    if (A.faltan.length) S.avisos.push('faltan columnas de la agenda (' + A.faltan.join(', ') + '): la agenda no se simula');
    else {
      let fp = null;
      try {
        fp = fusionAntesDelPlanAgenda_(E.sh, dest, A, { alcance: E.alcance, elecciones: E.elecciones }, true);
        (fp.planeadas || []).forEach(function (x) { S.fusion.push(x); });
      } catch (err) { S.avisos.push('la fusión antes del plan: ' + (err && err.message || err)); }
      const P = planAgenda_(dest, E.r, A, E.alcance, { enSeco: true, historial: E.historial, elecciones: E.elecciones,
                                                       conjunto: E.conjuntoPorFecha, geocodificar: E.geocodificar, fusionPrevia: fp });
      S.P = P;
      P.acciones.forEach(function (a) {
        if (a.tipo === 'borrar') { S.borrar.push({ parte: 'agenda', fila: a.f.fila, detalle: a.detalle || '' }); return; }
        (a.escrituras || []).forEach(function (e) {
          const nombre = hdr[e.col - 1];
          const cur = e.fila <= sim.length ? sim[e.fila - 1][e.col - 1] : '';
          // como escribirAgendaLote_: sólo si la celda tiene lo que el plan esperaba
          if (valorAgendaComparable_(cur, nombre) !== valorAgendaComparable_(e.esperado, nombre)) { S.saltadas.push({ parte: 'agenda', fila: e.fila, col: e.col, tipo: a.tipo }); return; }
          const vacio = e.valor === '' || e.valor == null;
          if (vacio && esVacio_(cur)) return;
          anotar('agenda', e.fila, e.col, vacio ? '' : e.valor, a.tipo, a.detalle || '');
        });
      });
    }
  }

  // --- 2. el cruce con los formularios y los asistentes ---
  if (E.cands && E.comunas && hayTiempo('cruce')) {
    S.partes.push('cruce');
    const dest = destDe();
    const plan = calcularPlan_(true, { dest: dest, cands: E.cands, comunas: E.comunas }, null);
    const asis = cruzarAsistentes_(dest, E.comunas, E.valoresConjunto ? { valoresConjunto: E.valoresConjunto } : undefined);
    S.plan = plan; S.asis = asis;
    if (asis && asis.error) S.avisos.push('asistentes: ' + asis.error);
    const porDecision = decisionesPorFila_(plan.decisiones);
    const iSt = dest.D['STATUS REUNIÓN'];
    dest.filas.forEach(function (f) {
      if (!filaQueSeEscribe_(f, false)) return;
      const d = decisionDeFila_(f, porDecision, asis);
      const c = celdasDeDecision_(dest, d, f.valores, true);
      c.celdas.forEach(function (x) { anotar('cruce', f.fila, x.col, x.tipo === 'uid' ? '(RDV_UID nuevo)' : x.valor, x.tipo); });
      if (c.status && iSt != null) anotar('cruce', f.fila, iSt + 1, 'Realizada', 'status');
    });
  } else if (!S.incompleta) S.avisos.push('el cruce no se simula (faltan los formularios o Comunas)');

  // --- 3. las derivadas (las once y la ID) ---
  if (DERIVADAS_POR_SCRIPT && hayTiempo('derivadas')) {
    S.partes.push('derivadas');
    const ctx = ctxDerivadasDeBloque_(sim, E.tablaComunas);
    ctx.f1 = E.f1 || hdr.map(function () { return ''; }); ctx.f2 = E.f2 || hdr.map(function () { return ''; });
    const kId = lookerEnSistema_() ? findIdxOr_(hdr, [COLUMNA_ID], true) : null;
    if (kId != null) ctx.cols[COLUMNA_ID] = kId;
    const fx = _formulasDerivadas_(ctx);
    if (kId != null && !fx[COLUMNA_ID].tipo && E.idConFormula) fx[COLUMNA_ID] = { col: kId + 1, tipo: 'por_fila', formula: E.idConFormula + ' celdas con fórmula' };
    const dc = derivadasQueCambian_(ctx, fx, kId);
    Object.keys(dc.tramos).forEach(function (n) {
      dc.tramos[n].forEach(function (t) { t.valores.forEach(function (v, j) { anotar('derivadas', t.desde + j, ctx.cols[n] + 1, v, 'derivada'); }); });
    });
  }

  // --- 4. los IDs de los encuentros ---
  if (IDS_EN_LA_HORA && E.listaIds && !opciones.sinIds && hayTiempo('ids')) {
    S.partes.push('ids');
    const dest = destDe();
    const res = cruzarIds_(E.listaIds.registros, dest, { historial: false, idsFantasma: _idsFantasmaDeBloqueSim_(sim, dest) });
    res.formulas = E.formulasIds || {};
    _sacarColumnasConFormulaIds_(res);
    S.ids = res;
    const vacia = function (e) { return esVacio_(e.fila <= sim.length ? sim[e.fila - 1][e.col - 1] : ''); };
    const conId = new Set();
    res.escrituras.filter(function (e) { return e.campo === 'id'; }).forEach(function (e) {
      if (!vacia(e)) return;
      anotar('ids', e.fila, e.col, e.valor, 'id');
      conId.add(e.it);
    });
    res.escrituras.filter(function (e) { return e.campo === 'envio' && (conId.has(e.it) || e.it.final.estado === 'ya_estaba'); }).forEach(function (e) {
      if (vacia(e)) anotar('ids', e.fila, e.col, e.valor, 'envio');
    });
  }

  // --- 5. Looker (no escribe la base: sus filas, para comparar) ---
  if (lookerEnSistema_() && hayTiempo('looker')) {
    S.partes.push('looker');
    try {
      const ids = idsDerivados_(sim);
      const u = armarDatosUnpivot_(sim, { modo: 'corregido', ids: ids, fechaCarga: new Date(2000, 0, 1, 12) });
      const a = armarAuxMaximos_(sim, { modo: 'corregido', ids: ids });
      S.looker = { unpivot: u.error ? null : u.filas, aux: a.error ? null : a.filas, error: u.error || a.error || '' };
    } catch (err) { S.avisos.push('Looker: ' + (err && err.message || err)); }
  }
  S.bloqueFinal = sim;
  S.ms = Date.now() - t0;
  return S;
}

/** Los IDs de las filas "fantasma" del bloque (las que `armarDestino_` no arma), como `idsEnFilasFantasmaIds_` pero en memoria. */
function _idsFantasmaDeBloqueSim_(bloque, dest) {
  const c = columnasIdsEnBase_(bloque[0])[COLUMNA_ID_CUENTAS];
  if (c == null) return [];
  const armadas = {};
  dest.filas.forEach(function (f) { armadas[f.fila] = true; });
  const out = [];
  for (let i = 1; i < bloque.length; i++) {
    const id = normIdIds_(bloque[i][c]);
    if (id && !armadas[i + 1]) out.push({ fila: i + 1, id: id });
  }
  return out;
}

/**
 * La identidad de una fila de un bloque, para comparar simulaciones de bases con las filas en otro lugar: agenda_uid; si no,
 * RDV_UID; si no, Figura + FECHA + HORA + Barrio. '' si la fila está vacía.
 */
function identidadFilaSim_(bloque, fila, sinUid) {
  const hdr = bloque[0], r = bloque[fila - 1];
  if (!r) return '';
  const k = function (n) { const i = findIdxOr_(hdr, aliasColumna_(n), true); return i == null ? '' : r[i]; };
  const uid = sinUid ? '' : str(k('agenda_uid'));
  if (uid) return 'uid:' + uid;
  const rdv = str(k('RDV_UID'));
  if (rdv) return 'rdv:' + rdv;
  const fecha = toDate_(k('FECHA'));
  const id = [normalizeText_(k('Figura')), fecha ? ymd_(fecha) : '', valorAgendaComparable_(k('HORA'), 'HORA'), normalizeText_(k('Barrio'))].join('|');
  return id === '|||' ? '' : 'fila:' + id;
}

/**
 * **Qué cambia de una simulación a otra** (la de la base de hoy, `sA`, contra la de la base "como quedaría", `sB`). Cada celda
 * escrita se compara por parte + la fila (por su identidad: `mapaB(filaB)` = la fila equivalente de A, o null si es nueva) + la
 * columna + el valor (un RDV_UID nuevo vale por "uno nuevo"). `excluirA` / `excluirB`: las filas que se esperan distintas (la 824 y
 * la nueva, en el paso 101). Devuelve `{ soloEnB, soloEnA, enExcluidas: [cambios de sB en filas excluidas], looker: { soloA, soloB },
 * borrar, agenda: { pares, ambiguas, duplicados, invariante } (lo nuevo en B que no estaba en A, como texto) }`.
 */
function compararSimulaciones_(sA, sB, opciones) {
  opciones = opciones || {};
  const mapaB = opciones.mapaB || function (f) { return f; };
  const exA = opciones.excluirA || new Set(), exB = opciones.excluirB || new Set();
  const nA = sA.bloqueFinal.length, filasA = opciones.filasOriginalesA || nA;
  const claveFila = function (S, fila, enB) {
    const f = enB ? mapaB(fila) : fila;
    const nueva = f == null || f > filasA || fila > (S.filasEntrada || Infinity) || (S.vaciasEntrada && S.vaciasEntrada.has(fila)) ||
                  (enB && opciones.nuevasB && opciones.nuevasB.has(fila));
    if (!nueva) return 'f' + f;
    // una fila creada por la corrida simulada: por lo que tiene (no por su número ni por su agenda_uid, que es aleatorio)
    return 'nueva:' + identidadFilaSim_(S.bloqueFinal, fila, true);
  };
  // 19/10 (revisor): un RDV_UID o un agenda_uid NUEVO es aleatorio: vale por "uno nuevo"
  const valorClave = function (c) {
    if (c.tipo === 'uid') return 'uid';
    if (normalizeHeader_(c.nombre) === 'agenda_uid' && esVacio_(c.antes)) return 'uid nuevo ' + String(c.despues).slice(0, 2);
    return valorAgendaComparable_(c.despues, c.nombre);
  };
  const clave = function (S, c, enB) {
    return c.parte + '|' + claveFila(S, c.fila, enB) + '|' + normalizeHeader_(c.nombre) + '|' + valorClave(c);
  };
  const setA = new Map(), setB = new Map();
  sA.cambios.forEach(function (c) { if (!exA.has(c.fila)) setA.set(clave(sA, c, false), c); });
  const enExcluidas = [];
  sB.cambios.forEach(function (c) { if (exB.has(c.fila)) enExcluidas.push(c); else setB.set(clave(sB, c, true), c); });
  const out = { soloEnB: [], soloEnA: [], enExcluidas: enExcluidas };
  setB.forEach(function (c, k) { if (!setA.has(k)) out.soloEnB.push(c); });
  setA.forEach(function (c, k) { if (!setB.has(k)) out.soloEnA.push(c); });
  // las filas que la agenda borraría
  const bA = new Set(sA.borrar.filter(function (b) { return !exA.has(b.fila); }).map(function (b) { return claveFila(sA, b.fila, false); }));
  const bB = new Set(sB.borrar.filter(function (b) { return !exB.has(b.fila); }).map(function (b) { return claveFila(sB, b.fila, true); }));
  out.borrar = { soloEnB: Array.from(bB).filter(function (k) { return !bA.has(k); }), soloEnA: Array.from(bA).filter(function (k) { return !bB.has(k); }),
                 enExcluidas: sB.borrar.filter(function (b) { return exB.has(b.fila); }) };
  // 19/10 (revisor): los pares que juntaría la fusión antes del plan (por las dos filas)
  const fus = function (S, enB, ex) {
    return (S.fusion || []).filter(function (x) { return !ex.has(x.vieja.fila) && !ex.has(x.nueva.fila); })
      .map(function (x) { return claveFila(S, x.vieja.fila, enB) + ' + ' + claveFila(S, x.nueva.fila, enB); });
  };
  const fA = fus(sA, false, exA), fB = fus(sB, true, exB);
  out.borrar.soloEnB = out.borrar.soloEnB.concat(fB.filter(function (k) { return fA.indexOf(k) < 0; }).map(function (k) { return 'fusión ' + k; }));
  out.borrar.soloEnA = out.borrar.soloEnA.concat(fA.filter(function (k) { return fB.indexOf(k) < 0; }).map(function (k) { return 'fusión ' + k; }));
  out.borrar.enExcluidas = out.borrar.enExcluidas.concat((sB.fusion || []).filter(function (x) { return exB.has(x.vieja.fila) || exB.has(x.nueva.fila); })
    .map(function (x) { return { fila: x.nueva.fila, detalle: 'la fusión la juntaría con la ' + x.vieja.fila }; }));
  // lo que la agenda tendría para decidir o avisar (por texto, sin números de fila)
  const textos = function (S) {
    const P = S.P || {};
    const sinFilas = function (t) { return String(t || '').replace(/fila[s]?\s[\d, y]+/g, 'filas #'); };
    return {
      pares: (P.dosFilas || []).map(function (p) { return sinFilas(p.texto + ' | ' + p.diferencia); }),
      invariante: (P.invariante || []).map(function (x) { return sinFilas(x.texto); }),
      ambiguas: (P.ambiguas || []).map(function (x) { return (x.ev ? _textoReunionAgenda_(x.ev) : '') + ' | ' + sinFilas(x.motivo); }),
      duplicados: (P.duplicados || []).map(function (x) { return x.tipo + ' | ' + (x.ev ? _textoReunionAgenda_(x.ev) : (x.par ? sinFilas(x.par.texto) : '')); }),
      avisos: (P.cancelNoAplicada || []).map(function (x) { return (x.d ? _textoReunionAgenda_(x.d) : '') + ' | ' + sinFilas(x.motivo); })
    };
  };
  const tA = textos(sA), tB = textos(sB);
  out.agenda = {};
  Object.keys(tB).forEach(function (k) {
    out.agenda[k] = { soloEnB: tB[k].filter(function (t) { return tA[k].indexOf(t) < 0; }), soloEnA: tA[k].filter(function (t) { return tB[k].indexOf(t) < 0; }) };
  });
  // Looker: las filas, como texto
  const lk = function (S) {
    if (!S.looker) return null;
    const s = new Set();
    (S.looker.unpivot || []).forEach(function (r) { s.add('U|' + JSON.stringify(r.map(_txtSim_))); });
    (S.looker.aux || []).forEach(function (r) { s.add('X|' + JSON.stringify(r.map(_txtSim_))); });
    return s;
  };
  const lA = lk(sA), lB = lk(sB);
  out.looker = lA && lB ? { soloEnB: Array.from(lB).filter(function (x) { return !lA.has(x); }), soloEnA: Array.from(lA).filter(function (x) { return !lB.has(x); }) } : null;
  return out;
}

/** Un valor como texto estable (las fechas en yyyy-MM-dd HH:mm). */
function _txtSim_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, RDV_TZ, 'yyyy-MM-dd HH:mm');
  return v == null ? '' : String(v);
}

/** Una celda cambiada, en una línea. */
function textoCambioSim_(c, bloque) {
  const r = bloque && bloque[c.fila - 1];
  const fig = r ? str(r[findIdxOr_(bloque[0], ['figura'], true)]) : '';
  const fe = r ? toDate_(r[findIdxOr_(bloque[0], ['fecha'], true)]) : null;
  return '[' + c.parte + (c.tipo ? '/' + c.tipo : '') + '] fila ' + c.fila + ' (' + (fig || 'sin figura') + (fe ? ' ' + fmtFecha_(fe) : '') + ') ' +
         c.nombre + ': "' + _txtSim_(c.antes) + '" → "' + _txtSim_(c.despues) + '"';
}

/** El log de una simulación: cuántas celdas por parte y columna, y todas (hasta `tope`). */
function logSimulacion_(S, titulo, tope) {
  tope = tope || 400;
  Logger.log('--- %s: la próxima corrida de la hora, simulada (%s ms; partes: %s)%s ---', titulo, S.ms, S.partes.join(', '),
             S.incompleta ? ' — INCOMPLETA: no hubo tiempo desde "' + S.incompleta + '"' : '');
  const por = {};
  S.cambios.forEach(function (c) { const k = c.parte + ' / ' + c.nombre; por[k] = (por[k] || 0) + 1; });
  Logger.log('  celdas que cambiarían en toda la base: %s | %s', S.cambios.length,
             Object.keys(por).sort().map(function (k) { return k + ' ' + por[k]; }).join(' | ') || 'ninguna');
  S.cambios.slice(0, tope).forEach(function (c) { Logger.log('    %s', textoCambioSim_(c, S.bloqueFinal)); });
  if (S.cambios.length > tope) Logger.log('    … y %s más', S.cambios.length - tope);
  if (S.borrar.length) S.borrar.forEach(function (b) { Logger.log('  la agenda BORRARÍA la fila %s (%s)', b.fila, b.detalle); });
  if (S.fusion.length) S.fusion.forEach(function (x) { Logger.log('  la fusión antes del plan juntaría la fila %s en la %s (no se simula el borrado)', x.nueva.fila, x.vieja.fila); });
  if (S.saltadas.length) Logger.log('  escrituras de la agenda que no se harían (la celda ya no tiene lo esperado): %s', S.saltadas.length);
  S.avisos.forEach(function (a) { Logger.log('  AVISO: %s', a); });
}
