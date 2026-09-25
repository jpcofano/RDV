/**
 * 20_UpsertDestino.js — el upsert nuevo. Fase 5.
 *
 * Reemplaza a `upsertBaseFinal_A2_B2` + `syncBaseFinal_ParaRevisar_y_RVD`: un solo salto, una
 * sola dirección, sin staging.
 *
 * --- Arranca en DRY_RUN y eso no es una precaución: es el modo en el que se calibra ---
 * Con `DRY_RUN = true` calcula todo, llena `SIN_MATCH`, `REVISAR_MATCH` y `EMPAREJAR_MANUAL`,
 * y **no escribe una sola celda del destino**. Los números de esa corrida son los que fijan
 * `UMBRAL_MATCH` y `MARGEN_MINIMO`, que hoy están puestos a ojo.
 *
 * --- El diseño, en una línea ---
 * **No hay clave natural** (CLAUDE.md 3.2): el barrio no viene, las dos fechas no son
 * confiables y la figura sola no identifica. Así que el upsert **no intenta identificar**: le
 * pone un score a cada candidato, escribe lo que está por encima del umbral y **deja registrado
 * todo lo demás** en vez de descartarlo en silencio, que es lo que hacía el legado (3.1.d).
 *
 * No hay bootstrap manual previo. Nadie resuelve 103 filas antes de arrancar: el pipeline hace
 * lo que puede en cada corrida y lo que no, queda anotado.
 *
 * --- Orden de identificación ---
 *   1. `RDV_UID`        si la fila ya está estampada, entra por ahí y no se calcula nada
 *   2. score            figura + fecha + ubicación + hora, normalizado
 *   3. nada             va a SIN_MATCH, y el formulario a EMPAREJAR_MANUAL
 *
 * --- De dónde salen los candidatos ---
 * De **`B`**, el import crudo, y no de B2. B2 es un espejo del import que pierde justamente las
 * filas que no pudo indexar (3.1.f), así que buscar ahí sería heredar el problema que venimos a
 * resolver. En la Fase 4, `10_LeerOrigenes.js` reemplaza la lectura de `B` por `openById` sobre
 * el origen; la lógica de acá no cambia.
 *
 * Depende de `00_Config.js`, `01_Utils.js`, `02_Parsing.js` y `05_Escritura.js`.
 */

/*
 * Handles de planilla, abiertos una sola vez por ejecución.
 *
 * `openById()` es una llamada al servicio, y la corrida del 25/09 se cayó con
 * `Service Spreadsheets timed out` después de abrir la intermedia cinco veces en la misma
 * ejecución. Menos aperturas, menos superficie para que el servicio falle.
 */
var _ssDestino_ = null, _ssIntermedia_ = null;

function ssDestino_() {
  if (!_ssDestino_) _ssDestino_ = SpreadsheetApp.openById(RDV_SS_DESTINO);
  return _ssDestino_;
}

function ssIntermedia_() {
  if (!_ssIntermedia_) _ssIntermedia_ = SpreadsheetApp.openById(RDV_SS_INTERMEDIA);
  return _ssIntermedia_;
}

/**
 * **Poner en `false` recién cuando los números de la corrida en seco estén revisados.**
 * Mientras esté en `true`, no hay forma de que este archivo toque el destino.
 */
const DRY_RUN = true;

// ===================== Puntos de entrada =====================

/** Corre el upsert entero. Respeta `DRY_RUN`. */
function upsertDestino() {
  return _correrUpsert_(DRY_RUN);
}

/** Corrida en seco explícita, sin importar cómo esté `DRY_RUN`. Es la que calibra. */
function correrEnSeco() {
  return _correrUpsert_(true);
}

/*
 * Un entry point por reporte. Recalculan y escriben **sólo el suyo**.
 *
 * Existen porque una escritura que falla no tiene por qué obligar a rehacer las otras dos. El
 * cálculo tarda 4 segundos y es determinista; lo frágil es el servicio de Sheets.
 */
function soloRevisarMatch()    { return _soloUno_(RDV_HOJA_REVISAR); }
function soloEmparejarManual() { return _soloUno_(RDV_HOJA_EMPAREJAR); }
function soloSinMatch()        { return _soloUno_(RDV_HOJA_SIN_MATCH); }

function _soloUno_(cual) {
  const plan = calcularPlan_(true);
  logResumen_(plan);
  const fallaron = [];
  escribirReportes_(plan, fallaron, [cual]);
  if (fallaron.length) throw new Error('No se pudo escribir ' + cual);
  return plan.res;
}

// ===================== El upsert =====================

/**
 * Orquestador. **Calcula primero, loguea después, escribe al final** — en ese orden y no en
 * otro.
 *
 * La corrida del 25/09 murió escribiendo el segundo reporte y se llevó puestos los tres
 * números que hacían falta, que ya estaban calculados. No pasa más: para cuando se toca la
 * primera solapa, el log ya tiene todo.
 */
function _correrUpsert_(enSeco) {
  const t0 = new Date();
  Logger.log('=== upsertDestino (%s) ===', enSeco ? 'DRY_RUN — no escribe nada' : 'ESCRITURA REAL');

  const plan = calcularPlan_(enSeco);
  logResumen_(plan);                 // ← ANTES de escribir nada

  if (!enSeco) {
    const w = aplicarDecisiones_(plan.dest, plan.decisiones);
    plan.res.escritas = w.celdas;
    plan.res.uidsEstampados = w.uids;
    Logger.log('>>> Escritas %s celdas en el destino, %s uuids estampados.', w.celdas, w.uids);
  } else {
    Logger.log('>>> DRY_RUN: no se escribió NADA en el destino. %s decisiones calculadas y no ' +
               'aplicadas.', plan.decisiones.length);
  }

  const fallaron = [];
  escribirReportes_(plan, fallaron, null);
  if (fallaron.length) {
    Logger.log('>>> NO se pudieron escribir: %s. Los demás reportes SÍ quedaron escritos, y los',
               fallaron.join(', '));
    Logger.log('    números de arriba son válidos igual. Para rehacer sólo uno: %s',
               'soloRevisarMatch() / soloEmparejarManual() / soloSinMatch()');
  }

  Logger.log('%s ms', new Date() - t0);
  return plan.res;
}

// ===================== Cálculo =====================

/**
 * Todo el trabajo caro, en memoria. **No escribe una sola celda.**
 *
 * Son 802 × 776 evaluaciones y tarda unos segundos; separarlo de la escritura es lo que permite
 * reintentar una solapa sin volver a calcular, y lo que permite loguear los resultados aunque
 * después falle el servicio de Sheets.
 */
function calcularPlan_(enSeco) {
  const dest = leerDestino_();
  const cands = leerCandidatos_();
  const comunas = leerComunasMap_();

  Logger.log('Destino: %s filas con datos | candidatos en B: %s (%s anulados por "%s")',
             dest.filas.length, cands.vivos.length, cands.anulados, MARCA_ANULADO);

  const confirmados = leerConfirmaciones_();
  if (confirmados.size) {
    Logger.log('Confirmaciones a mano en %s: %s', RDV_HOJA_EMPAREJAR, confirmados.size);
    if (enSeco) Logger.log('  (DRY_RUN: se cuentan pero no se estampan)');
  }

  /*
   * **Todo se cuenta dos veces: dentro de la ventana de análisis y en el histórico completo.**
   *
   * El upsert **procesa las 802 filas** —el backfill de la Fase 6 llena el histórico entero— pero
   * **calibra y reporta sobre la ventana** (CLAUDE.md 3.5). La ventana filtra lo que se mira, no
   * lo que se hace.
   *
   * No es un refinamiento: las conclusiones de la corrida del 25/09 salieron del histórico sin
   * filtrar, o sea mezclando el período en que el formulario todavía mandaba barrio con el que
   * dejó de mandarlo. Un número así describe un origen que ya no existe.
   */
  const res = { porUid: contador_(), escribiria: contador_(), revisar: contador_(),
                sinMatch: contador_(), futuras: contador_(), enVentana: 0,
                escritas: 0, uidsEstampados: 0 };
  const motivos = {};

  /*
   * Autopsia del grupo de score bajo: **qué le costó score**, no qué le faltó. Bajo
   * normalización una señal ausente es gratis, así que contar ausencias manda el trabajo en la
   * dirección equivocada.
   */
  const bajo = {};
  ['total', 'banda6a7', 'porFecha', 'porUbic', 'porFigura', 'porHora', 'sinDeficitClaro',
   'fechaNoEvaluable', 'fecha0', 'fecha1', 'fecha3', 'fecha7', 'fechaLejos',
   'sinUbicEvaluable', 'sinHoraEvaluable',
   'conComuna', 'comunaCoincide', 'comunaDifiere', 'destinoSinComuna',
   'conEvento', 'eventoSub', 'eventoPalabras', 'eventoCualquiera']
    .forEach(function (k) { bajo[k] = contador_(); });
  const comunaDifieren = [];

  /*
   * Cobertura de `EVENTO`, la señal de las reuniones temáticas (CLAUDE.md 1.c).
   *
   * **Se mide antes de darle peso.** `EVENTO_COMO_UBICACION` arranca apagado justamente para
   * que estos números existan antes de que la señal decida nada.
   */
  const evStats = { filasConEvento: contador_(), coincideSub: contador_(),
                    coincidePalabras: contador_(), coincideAlguna: contador_(),
                    sinCandidato: contador_() };
  const ejemplosEvento = [];

  const filasRevisar = [], filasSinMatch = [], decisiones = [];
  const usados = {};
  const hist = [];
  for (let k = 0; k < 10; k++) hist.push(contador_());
  const scoresVentana = [], scoresTotal = [];

  const cuenta = function (m, ev) {
    if (!motivos[m]) motivos[m] = contador_();
    sumar_(motivos[m], ev);
  };

  for (let i = 0; i < dest.filas.length; i++) {
    const f = dest.filas[i];
    const ev = enVentanaAnalisis_(f.fecha);
    if (ev) res.enVentana++;

    // Reuniones futuras: no son hueco, todavía no corresponde completarlas.
    if (f.fecha && f.fecha > _hoy_()) { sumar_(res.futuras, ev); continue; }

    if (f.uid) {
      const porUid = cands.porUid.get(f.uid);
      sumar_(res.porUid, ev);
      if (porUid) {
        decisiones.push({ fila: f, cand: porUid, score: 1, nivel: 'rdv_uid', dist: null });
        usados[porUid.fila] = true;
      }
      continue;
    }

    const r = evaluarCandidatos_(f, cands.vivos, comunas);

    // --- cobertura de EVENTO contra el mejor candidato ---
    const tieneEvento = !!normalizarEvento_(f.evento);
    if (tieneEvento) {
      sumar_(evStats.filasConEvento, ev);
      if (!r.mejor) sumar_(evStats.sinCandidato, ev);
      else {
        const e = r.mejor.evento;
        if (e && e.sub) sumar_(evStats.coincideSub, ev);
        if (e && e.palabras) sumar_(evStats.coincidePalabras, ev);
        if (e && (e.sub || e.palabras)) sumar_(evStats.coincideAlguna, ev);
        else if (e && ejemplosEvento.length < 12) {
          ejemplosEvento.push({ evento: f.evento, nombre: r.mejor.c.nombre,
                                cubiertas: e.cubiertas, total: e.total, score: r.mejor.score });
        }
      }
    }

    if (r.mejor) {
      sumar_(hist[Math.min(9, Math.floor(r.mejor.score * 10))], ev);
      scoresTotal.push(r.mejor.score);
      if (ev) scoresVentana.push(r.mejor.score);
      if (r.mejor.score < UMBRAL_MATCH) {
        _autopsia_(bajo, comunaDifieren, f, r.mejor, comunas, ev);
      }
    }

    if (!r.mejor) {
      sumar_(res.sinMatch, ev); cuenta('sin_candidatos', ev);
      filasSinMatch.push([f.clave, f.figura, f.barrio, fmtFecha_(f.fecha), 'sin_candidatos',
                          '', '', f.evento, _sn_(ev)]);
      continue;
    }

    if (r.veredicto === 'escribiria') {
      sumar_(res.escribiria, ev);
      decisiones.push({ fila: f, cand: r.mejor.c, score: r.mejor.score,
                        nivel: r.mejor.nivel, dist: r.mejor.dist });
      usados[r.mejor.c.fila] = true;
    } else if (r.veredicto === 'REVISAR_MATCH') {
      sumar_(res.revisar, ev); cuenta(r.motivo, ev);
      filasRevisar.push([f.clave, f.figura, f.barrio, fmtFecha_(f.fecha),
                         r.mejor.c.nombre, r.mejor.score, r.segundoScore, r.margen,
                         r.motivo, r.mejor.nivel, _sn_(ev)]);
      decisiones.push({ fila: f, cand: r.mejor.c, score: r.mejor.score,
                        nivel: 'descartado:' + r.motivo, dist: r.mejor.dist, noEscribir: true });
    } else {
      sumar_(res.sinMatch, ev); cuenta(r.motivo, ev);
      filasSinMatch.push([f.clave, f.figura, f.barrio, fmtFecha_(f.fecha), r.motivo,
                          r.mejor.c.nombre, r.mejor.score, f.evento, _sn_(ev)]);
      decisiones.push({ fila: f, cand: r.mejor.c, score: r.mejor.score,
                        nivel: 'descartado:' + r.motivo, dist: r.mejor.dist, noEscribir: true });
    }
  }

  const resueltas = {};
  decisiones.forEach(function (d) { if (!d.noEscribir) resueltas[d.fila.fila] = true; });
  const emp = calcularEmparejar_(dest, cands, comunas, usados, resueltas);

  // Cobertura general de detectComuna_ sobre TODOS los formularios, no sólo los del grupo bajo.
  let formsConComuna = 0, formsConRechazo = 0, formsSinFechaTexto = 0;
  for (let i = 0; i < cands.vivos.length; i++) {
    const c = cands.vivos[i];
    if (c.comuna != null) formsConComuna++;
    // La regla del mes (CLAUDE.md 1.c): cuántos formularios traían en el texto una ocurrencia
    // con un mes imposible contra su fecha_fin. Es la medida de cuánto ruido filtró.
    if (c.det && c.det.rechazadas && c.det.rechazadas.length) formsConRechazo++;
    if (c.det && !c.det.texto) formsSinFechaTexto++;
  }

  // Cuántas filas del destino traen EVENTO, contadas sobre la base entera y no sólo sobre las
  // que llegaron a evaluarse. Es el denominador honesto de la cobertura.
  const evBase = contador_();
  dest.filas.forEach(function (f) {
    if (normalizarEvento_(f.evento)) sumar_(evBase, enVentanaAnalisis_(f.fecha));
  });

  return { dest: dest, cands: cands, res: res, motivos: motivos, hist: hist,
           bajo: bajo, comunaDifieren: comunaDifieren, formsConComuna: formsConComuna,
           formsConRechazo: formsConRechazo, formsSinFechaTexto: formsSinFechaTexto,
           evStats: evStats, evBase: evBase, ejemplosEvento: ejemplosEvento,
           scoresVentana: scoresVentana, scoresTotal: scoresTotal,
           filasRevisar: filasRevisar, filasSinMatch: filasSinMatch,
           decisiones: decisiones, emp: emp };
}

function _sn_(b) { return b ? 'TRUE' : 'FALSE'; }

/**
 * Qué le costó score a una fila que no llegó al umbral, **por ventana y en total**.
 *
 * No alcanza con saber que 82 filas dieron 0,65: hace falta qué señal las bajó, porque de eso
 * depende si el arreglo es de datos, de parser o de umbral.
 */
function _autopsia_(bajo, difieren, f, mejor, comunas, ev) {
  sumar_(bajo.total, ev);
  if (mejor.score >= 0.6 && mejor.score < 0.7) sumar_(bajo.banda6a7, ev);

  const c = mejor.c;
  const pe = mejor.perdido;

  /*
   * Se clasifica por **qué costó score**, no por qué falta.
   *
   * La primera versión contaba "le faltó el barrio" y concluía que el grupo bajo era la huella
   * del cambio de formulario. Estaba mal: bajo normalización un barrio ausente **no cuesta
   * nada** —sale del denominador— así que una fila a la que sólo le faltara el barrio
   * puntuaría 1,00 y ni siquiera estaría en este grupo.
   *
   * Lo que sí cuesta es una señal evaluable que no coincidió: una fecha que da ±7 en vez de
   * exacta, una hora que no coincide. Eso es lo que se mide acá.
   */
  const mayor = Math.max(pe.figura, pe.fecha, pe.ubic, pe.hora);
  if (mayor <= 0) sumar_(bajo.sinDeficitClaro, ev);
  else if (pe.fecha === mayor)  sumar_(bajo.porFecha, ev);
  else if (pe.ubic === mayor)   sumar_(bajo.porUbic, ev);
  else if (pe.figura === mayor) sumar_(bajo.porFigura, ev);
  else                          sumar_(bajo.porHora, ev);

  // Distribución de la banda de fecha dentro del grupo bajo: es el número accionable.
  if (mejor.dist === null) sumar_(bajo.fechaNoEvaluable, ev);
  else if (mejor.dist === 0) sumar_(bajo.fecha0, ev);
  else if (mejor.dist <= 1) sumar_(bajo.fecha1, ev);
  else if (mejor.dist <= 3) sumar_(bajo.fecha3, ev);
  else if (mejor.dist <= 7) sumar_(bajo.fecha7, ev);
  else sumar_(bajo.fechaLejos, ev);

  // Qué señales había disponibles: dice si el techo de esa fila era alcanzable.
  if (!mejor.evaluables.ubic) sumar_(bajo.sinUbicEvaluable, ev);
  if (!mejor.evaluables.hora) sumar_(bajo.sinHoraEvaluable, ev);

  // EVENTO dentro del grupo bajo: es donde se decide si la señal sirve para algo.
  const e = mejor.evento;
  if (e) {
    sumar_(bajo.conEvento, ev);
    if (e.sub) sumar_(bajo.eventoSub, ev);
    if (e.palabras) sumar_(bajo.eventoPalabras, ev);
    if (e.sub || e.palabras) sumar_(bajo.eventoCualquiera, ev);
  }

  // La comuna, que es la señal que reemplaza al barrio en las reuniones de barrio.
  if (c.comuna == null) return;
  sumar_(bajo.conComuna, ev);
  const bDest = normalizeText_(f.barrio);
  const cDest = bDest ? comunas.get(bDest) : null;
  if (cDest == null) { sumar_(bajo.destinoSinComuna, ev); return; }
  if (cDest === c.comuna) sumar_(bajo.comunaCoincide, ev);
  else {
    sumar_(bajo.comunaDifiere, ev);
    if (difieren.length < 20) {
      difieren.push({ figura: f.figura, barrio: f.barrio, cDest: cDest,
                      cForm: c.comuna, nombre: c.nombre, ev: ev });
    }
  }
}

// ===================== Log =====================

/**
 * Los tres números que hacen falta, **antes de tocar ninguna solapa**.
 *
 * Si la escritura se cae —y ya se cayó dos veces— la corrida sirve igual. Es la diferencia
 * entre perder una corrida y perder sólo una solapa que se puede rehacer en cuatro segundos.
 */
function logResumen_(plan) {
  const r = plan.res;
  const base = { v: r.enVentana - r.futuras.v, t: plan.dest.filas.length - r.futuras.t };

  /*
   * La cabecera de ventana, la misma que traen los once reportes de `diagnostico/`.
   *
   * `20_UpsertDestino.js` se escribió después y no la heredó, y eso hizo que las conclusiones de
   * la corrida del 25/09 —"domina la fecha", los huérfanos, las filas sin candidato— salieran
   * del histórico completo, mezclando el período en que el formulario mandaba barrio con el que
   * dejó de mandarlo (CLAUDE.md 3.5).
   */
  Logger.log('VENTANA: %s en ventana / %s totales | corte: %s (últimos %s meses)',
             r.enVentana, plan.dest.filas.length, fmtFecha_(inicioVentanaAnalisis_()),
             VENTANA_ANALISIS_MESES);
  Logger.log('  Todo lo que sigue se lee [ventana | total]. El upsert procesa las %s filas —el',
             plan.dest.filas.length);
  Logger.log('  backfill de la Fase 6 llena el histórico— pero calibra sobre la ventana.');
  Logger.log('  Si las dos columnas difieren mucho, la de la derecha describe un origen que ya');
  Logger.log('  no existe y no sirve para decidir nada.');

  Logger.log('--- 1. VEREDICTOS (base: %s | %s filas, sin las %s futuras) ---',
             base.v, base.t, _dc_(r.futuras));
  Logger.log('  por RDV_UID (ya estampadas): %s', _dc_(r.porUid));
  Logger.log('  escribiría .......... %s', _dcp_(r.escribiria, base));
  Logger.log('  a revisar ........... %s', _dcp_(r.revisar, base));
  Logger.log('  sin match ........... %s', _dcp_(r.sinMatch, base));
  Logger.log('  --- por motivo ---');
  Object.keys(plan.motivos).sort().forEach(function (m) {
    Logger.log('    %s: %s', m, _dc_(plan.motivos[m]));
  });
  /*
   * `sin_candidatos` contra `score_bajo` es la distinción que decide el umbral:
   * el primero es "no hay con qué", el segundo es "hay, pero el corte lo rechaza".
   */
  const sinCand = plan.motivos['sin_candidatos'] || contador_();
  const bajoM = plan.motivos['score_bajo'] || contador_();
  if (bajoM.v > 0 || bajoM.t > 0) {
    Logger.log('  >>> %s filas de la ventana (%s en total) TIENEN candidato y lo rechaza el ' +
               'umbral.', bajoM.v, bajoM.t);
    Logger.log('      Las otras %s | %s no tienen con qué y ningún umbral las salva.',
               sinCand.v, sinCand.t);
  } else if (sinCand.t > 0) {
    Logger.log('  >>> Las %s | %s de sin match NO tienen candidato: el umbral no es el problema.',
               sinCand.v, sinCand.t);
  }

  Logger.log('--- 2. DISTRIBUCIÓN DEL SCORE NORMALIZADO (sólo filas con candidato) ---');
  const conCand = contador_();
  for (let k = 0; k < 10; k++) { conCand.v += plan.hist[k].v; conCand.t += plan.hist[k].t; }
  for (let k = 9; k >= 0; k--) {
    if (!plan.hist[k].t) continue;
    Logger.log('  %s–%s : %s   %s',
               (k / 10).toFixed(1), ((k + 1) / 10).toFixed(1), _dcp_(plan.hist[k], conCand),
               _barra_(plan.hist[k].v, conCand.v));
  }
  Logger.log('  (la barra dibuja la VENTANA, que es la población que calibra)');
  Logger.log('  umbrales en uso: UMBRAL_MATCH=%s  MARGEN_MINIMO=%s (a ojo)',
             UMBRAL_MATCH, MARGEN_MINIMO);

  _logValle_(plan.scoresVentana, plan.scoresTotal);

  const e = plan.emp;
  const b = plan.bajo;
  if (b.total.t) {
    Logger.log('--- 2b. QUÉ LE COSTÓ SCORE AL GRUPO BAJO (%s filas bajo el umbral, %s en ' +
               '0,6-0,7) ---', _dc_(b.total), _dc_(b.banda6a7));
    /*
     * Se mide qué COSTÓ, no qué falta. Bajo normalización una señal ausente sale del
     * denominador y no cuesta nada: una fila a la que sólo le faltara el barrio puntuaría 1,00
     * y no estaría acá. Contar ausencias mandaba el trabajo en la dirección equivocada.
     */
    Logger.log('  el déficit principal fue la FECHA .... %s', _dcp_(b.porFecha, b.total));
    Logger.log('  el déficit principal fue la UBICACIÓN %s', _dcp_(b.porUbic, b.total));
    Logger.log('  el déficit principal fue la FIGURA ... %s', _dcp_(b.porFigura, b.total));
    Logger.log('  el déficit principal fue la HORA ..... %s', _dcp_(b.porHora, b.total));

    Logger.log('  --- banda de fecha dentro del grupo bajo ---');
    Logger.log('    exacta %s', _dc_(b.fecha0));
    Logger.log('    ±1     %s', _dc_(b.fecha1));
    Logger.log('    ±3     %s', _dc_(b.fecha3));
    Logger.log('    ±7     %s', _dc_(b.fecha7));
    Logger.log('    lejos  %s', _dc_(b.fechaLejos));
    Logger.log('    n/e    %s', _dc_(b.fechaNoEvaluable));
    Logger.log('  señales que ni siquiera eran evaluables: ubicación %s | hora %s',
               _dc_(b.sinUbicEvaluable), _dc_(b.sinHoraEvaluable));

    /*
     * La regla del mes (CLAUDE.md 1.c) descarta del texto toda ocurrencia cuyo mes no sea el de
     * `fecha_fin` ni el siguiente. Acá se ve cuánto filtró: un `"Reunion 10-12 hs"` que antes
     * devolvía *10 de diciembre* ahora no devuelve nada, y la fila se apoya sólo en `fecha_fin`.
     * Cuántas de las `fecha_mal_parseada` resuelve lo mide `diagCorteB()`, que tiene la
     * población correcta.
     */
    Logger.log('  --- la regla del mes, sobre los %s formularios ---', plan.cands.vivos.length);
    Logger.log('    con una ocurrencia de mes imposible descartada: %s', plan.formsConRechazo);
    Logger.log('    sin ninguna fecha utilizable en el texto: %s (usan sólo fecha_fin)',
               plan.formsSinFechaTexto);

    /*
     * El veredicto se saca de la VENTANA, no del total. Es la corrección de fondo de este
     * cambio: la conclusión anterior ("domina la fecha, 52 de 112") salió del histórico
     * completo, que incluye 2025, cuando el formulario todavía mandaba barrio.
     */
    if (b.total.v === 0) {
      Logger.log('  >>> En la ventana NO hay filas bajo el umbral. El grupo bajo es histórico:');
      Logger.log('      describe el formulario viejo y no dice nada del problema de hoy.');
    } else if (b.porFecha.v > b.total.v / 2) {
      Logger.log('  >>> En la ventana domina el déficit de FECHA (%s de %s). El grupo bajo NO es',
                 b.porFecha.v, b.total.v);
      Logger.log('      el cambio de formulario: es el parseo de fechas (3.3.c). Y ojo — agregar');
      Logger.log('      la comuna NO los rescata: figura + fecha±7 + comuna da 0,70, debajo de %s.',
                 UMBRAL_MATCH);
    } else if (b.porUbic.v > b.total.v / 2) {
      Logger.log('  >>> En la ventana domina el déficit de UBICACIÓN: el barrio o la comuna');
      Logger.log('      estaban y NO coincidían. Eso es desacuerdo de dato, no ausencia.');
    } else {
      Logger.log('  >>> En la ventana ninguna señal domina. Mirar los casos de a uno antes de');
      Logger.log('      mover un peso: sin causa dominante, cualquier ajuste es a ciegas.');
    }

    Logger.log('--- 2c. ¿CUÁNTO APORTA LA COMUNA? (reemplaza al barrio en las de barrio) ---');
    Logger.log('  cobertura general de detectComuna_: %s de %s formularios (%s%%)',
               plan.formsConComuna, plan.cands.vivos.length,
               _pct_(plan.formsConComuna, plan.cands.vivos.length));
    Logger.log('  en el grupo bajo, con comuna en el nombre: %s', _dcp_(b.conComuna, b.total));
    Logger.log('    coincide con la comuna del barrio del destino: %s',
               _dcp_(b.comunaCoincide, b.conComuna));
    Logger.log('    difiere: %s', _dc_(b.comunaDifiere));
    Logger.log('    el destino no tiene barrio del cual derivarla: %s', _dc_(b.destinoSinComuna));
    Logger.log('  OJO con la aritmética: la comuna sube el numerador Y el denominador. Sólo');
    Logger.log('  rescata a una fila si su déficit NO era la fecha. Ver el bloque 2b.');
    if (plan.comunaDifieren.length) {
      Logger.log('  --- los %s primeros casos donde la comuna DIFIERE ---',
                 plan.comunaDifieren.length);
      plan.comunaDifieren.forEach(function (d) {
        Logger.log('    [%s] destino: %s / %s (comuna %s)  vs  form: comuna %s | %s',
                   d.ev ? 'ventana' : 'histor.', d.figura, d.barrio || 'sin barrio',
                   d.cDest, d.cForm, d.nombre);
      });
    }
  }

  _logEvento_(plan, b, e);

  Logger.log('--- 3. EMPAREJAR_MANUAL ---');
  Logger.log('  pares propuestos ............ %s', _dc_(e.pares));
  /*
   * La densidad es la métrica que faltaba. 1.883 pares sonaba a "mucho trabajo"; 18 por fila
   * dice que la lista es inutilizable. El objetivo es 2 a 4.
   */
  const porFila = e.filasConPropuesta ? Math.round(e.pares.t * 10 / e.filasConPropuesta) / 10 : 0;
  const porForm = e.formulariosConPropuesta
    ? Math.round(e.pares.t * 10 / e.formulariosConPropuesta) / 10 : 0;
  Logger.log('  DENSIDAD: %s pares por fila del destino (%s filas con propuesta)',
             porFila, e.filasConPropuesta);
  Logger.log('            %s pares por formulario (%s formularios con propuesta)',
             porForm, e.formulariosConPropuesta);
  if (porFila > 5) {
    Logger.log('  >>> Más de 5 por fila: la lista no se puede trabajar. La puerta está demasiado');
    Logger.log('      laxa — revisar `proponible` en puntuar_(). El objetivo es 2 a 4.');
  }
  Logger.log('  formularios sin candidato ... %s', _dc_(e.formulariosHuerfanos));
  Logger.log('    de esos, con el tema de alguna fila en el nombre: %s', _dc_(e.huerfConEvento));
  Logger.log('  filas del destino sin ninguno %s', _dc_(e.filasHuerfanas));
  Logger.log('    de esas, con EVENTO cargado: %s', _dc_(e.filasHuerfConEvento));
  Logger.log('  Esos dos son lo que el sistema no puede resolver NI con ayuda humana.');

  // Con pocos casos se puede entender qué les pasa, así que se listan enteros.
  if (e.huerfanos && e.huerfanos.length && e.huerfanos.length <= 40) {
    Logger.log('  --- los %s formularios huérfanos, uno por uno ---', e.huerfanos.length);
    e.huerfanos.forEach(function (c) {
      Logger.log('    [%s] %s | ins=%s | %s',
                 enVentanaAnalisis_(c.det && c.det.mejor) ? 'ventana' : 'histor.',
                 fmtFecha_(c.det.mejor) || 'sin fecha', c.inscriptos, c.nombre);
    });
  } else if (e.huerfanos && e.huerfanos.length) {
    Logger.log('  (%s huérfanos: demasiados para listarlos. Están en la solapa, con en_ventana.)',
               e.huerfanos.length);
  }
}

/**
 * El bloque 2d: **cuánto cubre `EVENTO`**, la señal de las reuniones temáticas.
 *
 * Se mide con la señal apagada (`EVENTO_COMO_UBICACION`), a propósito: es la regla de CLAUDE.md
 * §6 aplicada a nuestro propio diseño. Un conteo alto no es una conclusión, y una señal que
 * puntúa antes de medirse es una falsa alarma esperando su turno.
 */
function _logEvento_(plan, b, e) {
  const ev = plan.evStats;
  Logger.log('--- 2d. ¿CUÁNTO CUBRE EL EVENTO? (las reuniones temáticas, CLAUDE.md 1.c) ---');
  Logger.log('  EVENTO_COMO_UBICACION = %s  (peso si se enciende: %s, el mismo que el barrio)',
             EVENTO_COMO_UBICACION, PESOS_MATCH.eventoIgual);

  if (!plan.evBase.t) {
    Logger.log('  Ninguna fila del destino trae EVENTO. La señal no tiene con qué: no encender.');
    return;
  }
  Logger.log('  filas del destino con EVENTO no vacío: %s   (sobre %s filas)',
             _dc_(plan.evBase), plan.dest.filas.length);
  Logger.log('  de las que llegaron a evaluarse ...... %s', _dc_(ev.filasConEvento));
  Logger.log('    el EVENTO aparece en el nombre del mejor candidato:');
  Logger.log('      por subcadena ..... %s', _dcp_(ev.coincideSub, ev.filasConEvento));
  Logger.log('      por palabras ...... %s', _dcp_(ev.coincidePalabras, ev.filasConEvento));
  Logger.log('      por cualquiera .... %s', _dcp_(ev.coincideAlguna, ev.filasConEvento));
  Logger.log('    sin ningún candidato contra el cual comparar: %s', _dc_(ev.sinCandidato));

  if (b.total.t) {
    Logger.log('  --- dentro del grupo de score bajo (%s | %s) ---', b.total.v, b.total.t);
    Logger.log('    tienen EVENTO ..... %s', _dcp_(b.conEvento, b.total));
    Logger.log('    y coincide ........ %s', _dcp_(b.eventoCualquiera, b.total));
  }

  /*
   * La lectura honesta, antes de que el número invite a una conclusión que no da.
   *
   * Como el EVENTO **entra al denominador sólo cuando coincide**, subir el numerador y el
   * denominador a la vez casi no mueve el veredicto: figura + fecha±7 + evento da 0,73, que
   * sigue debajo de 0,88. Donde sí cambia algo es en el **margen** entre dos candidatos y en la
   * **puerta de EMPAREJAR_MANUAL**, que ya lo usa aunque el flag esté apagado.
   */
  Logger.log('  OJO con la aritmética, igual que con la comuna:');
  Logger.log('    figura + fecha exacta + evento = 1,00   (ya daba 1,00 sin el evento)');
  Logger.log('    figura + fecha ±7 + evento     = 0,73   (sigue debajo de %s)', UMBRAL_MATCH);
  Logger.log('  O sea que encender el flag **no rescata por sí solo** a una fila con la fecha');
  Logger.log('  rota. Lo que sí hace es romper empates y habilitar la propuesta manual — y eso');
  Logger.log('  último ya está activo. Si el déficit dominante es la fecha, el arreglo es 3.3.c.');

  if (plan.ejemplosEvento.length) {
    Logger.log('  --- %s casos con EVENTO que NO coincidió (para ver si falla la comparación) ---',
               plan.ejemplosEvento.length);
    plan.ejemplosEvento.forEach(function (x) {
      Logger.log('    evento: "%s"  (%s/%s palabras)  score=%s', x.evento, x.cubiertas, x.total,
                 x.score);
      Logger.log('      form: %s', x.nombre);
    });
  }
}

/**
 * El valle de la distribución, **medido sobre la ventana**.
 *
 * `UMBRAL_MATCH = 0.88` salió del valle del histórico completo. Un umbral calibrado contra un
 * origen que ya no existe es una suposición con cara de medición, así que la curva se vuelve a
 * calcular acá sobre los últimos meses y se dice si el 0,88 sigue cayendo adentro.
 *
 * La "meseta" es el tramo de cortes consecutivos donde mover el umbral **no cambia a cuántas
 * filas afecta**. Ahí es donde un corte es estable, que es toda la propiedad que se le pide.
 */
function _logValle_(ventana, total) {
  Logger.log('  --- barrido de umbral (cuántas filas quedarían por encima) ---');
  if (!ventana.length) {
    Logger.log('  No hay filas con candidato dentro de la ventana: el umbral no se puede');
    Logger.log('  calibrar con esta corrida. El %s se queda como está.', UMBRAL_MATCH);
    return;
  }

  const cortes = [];
  for (let u = 50; u <= 99; u++) cortes.push(u / 100);
  const enc = function (lista, u) {
    let n = 0;
    for (let i = 0; i < lista.length; i++) if (lista[i] >= u) n++;
    return n;
  };
  const curva = cortes.map(function (u) { return enc(ventana, u); });

  // Se imprime cada 0,05 para que entre en el log sin volverse ilegible.
  for (let i = 0; i < cortes.length; i++) {
    const u = cortes[i];
    if (Math.round(u * 100) % 5 !== 0) continue;
    Logger.log('    >= %s : %s | %s', u.toFixed(2), curva[i], enc(total, u));
  }

  // La meseta más larga: el tramo donde el corte no cambia a cuántas filas afecta.
  let mejorIni = 0, mejorLargo = 1, ini = 0;
  for (let i = 1; i <= curva.length; i++) {
    if (i < curva.length && curva[i] === curva[ini]) continue;
    if (i - ini > mejorLargo) { mejorLargo = i - ini; mejorIni = ini; }
    ini = i;
  }
  const desde = cortes[mejorIni], hasta = cortes[mejorIni + mejorLargo - 1];
  Logger.log('  VALLE MEDIDO EN LA VENTANA: de %s a %s (%s filas por encima en todo el tramo)',
             desde.toFixed(2), hasta.toFixed(2), curva[mejorIni]);

  /*
   * Una meseta que ocupa casi todo el barrido no es un valle: es una población concentrada en
   * un extremo, donde ningún corte separa nada. Decirlo es la diferencia entre un diagnóstico y
   * una falsa alarma con formato de dato (CLAUDE.md §6).
   */
  if (mejorLargo >= cortes.length * 0.8) {
    Logger.log('  >>> La meseta ocupa casi todo el barrido: los %s scores de la ventana están',
               ventana.length);
    Logger.log('      todos del mismo lado y no hay nada que separar. Este barrido NO calibra');
    Logger.log('      el umbral — hace falta una población con las dos clases adentro.');
  } else if (mejorLargo < 3) {
    Logger.log('  >>> El valle es angosto (%s pasos de 0,01): la distribución de la ventana es',
               mejorLargo);
    Logger.log('      casi continua y CUALQUIER corte es arbitrario. Conviene quedarse alto y');
    Logger.log('      mandar el resto a revisión, no elegir un número que parezca justo.');
  } else if (UMBRAL_MATCH >= desde && UMBRAL_MATCH <= hasta) {
    Logger.log('  >>> UMBRAL_MATCH = %s cae ADENTRO del valle de la ventana. El 0,88 que salió',
               UMBRAL_MATCH);
    Logger.log('      del histórico se confirma: no hay que tocarlo.');
  } else {
    const medio = Math.round((desde + hasta) * 50) / 100;
    Logger.log('  >>> UMBRAL_MATCH = %s cae FUERA del valle de la ventana. El 0,88 salió del',
               UMBRAL_MATCH);
    Logger.log('      histórico completo, que describe el formulario viejo. Sobre los últimos');
    Logger.log('      %s meses el corte estable está en %s (medio del valle): cambiarlo a ese',
               VENTANA_ANALISIS_MESES, medio);
    Logger.log('      valor en 00_Config.js, con este número anotado al lado.');
  }
}

function _pct_(n, d) {
  return d ? Math.round(n * 1000 / d) / 10 : 0;
}

/** Un contador en dos columnas: `ventana | total`. */
function _dc_(c) {
  return _pad_(c.v, 5) + ' | ' + _pad_(c.t, 5);
}

/** Ídem, con el porcentaje de cada columna sobre su propia base. Comparar mezclando no sirve. */
function _dcp_(c, base) {
  return _dc_(c) + '   (' + _pct_(c.v, base.v) + '% | ' + _pct_(c.t, base.t) + '%)';
}

function _pad_(n, ancho) {
  let s = String(n);
  while (s.length < ancho) s = ' ' + s;
  return s;
}

function _barra_(n, total) {
  if (!total || !n) return '';
  return new Array(Math.max(1, Math.round(n * 40 / total)) + 1).join('#');
}

// ===================== Escritura de reportes =====================

/**
 * Escribe los reportes, **cada uno aislado**. Una caída no se lleva a los otros.
 *
 * Orden por volumen ascendente: `SIN_MATCH` es el que más filas escribe, así que va **último**.
 * Si el servicio se va a caer, que se caiga después de haber escrito los dos chicos.
 */
function escribirReportes_(plan, fallaron, soloEstos) {
  const quiere = function (n) { return !soloEstos || soloEstos.indexOf(n) !== -1; };

  if (quiere(RDV_HOJA_REVISAR)) {
    _intentar_(fallaron, RDV_HOJA_REVISAR, function () {
      escribirReporte_(RDV_HOJA_REVISAR,
        ['clave', 'figura', 'barrio', 'fecha', 'form_origen', 'score', 'segundo', 'margen',
         'motivo', 'senales', 'en_ventana'], plan.filasRevisar);
    });
  }
  if (quiere(RDV_HOJA_EMPAREJAR)) {
    _intentar_(fallaron, RDV_HOJA_EMPAREJAR, function () {
      escribirHoja_(RDV_HOJA_EMPAREJAR, plan.emp.matriz);
      Logger.log('[upsert] %s: %s filas', RDV_HOJA_EMPAREJAR, plan.emp.matriz.length - 1);
    });
  }
  if (quiere(RDV_HOJA_SIN_MATCH)) {
    _intentar_(fallaron, RDV_HOJA_SIN_MATCH, function () {
      escribirReporte_(RDV_HOJA_SIN_MATCH,
        ['clave', 'figura', 'barrio', 'fecha', 'motivo', 'mejor_descartado', 'score', 'evento',
         'en_ventana'], plan.filasSinMatch);
    });
  }
}

/** Corre `fn` y, si se cae, lo anota en `fallaron` en vez de tirar la corrida entera. */
function _intentar_(fallaron, nombre, fn) {
  try { fn(); }
  catch (err) { fallaron.push(nombre); Logger.log('[upsert] %s FALLÓ: %s', nombre, err); }
}

// ===================== Evaluación =====================

/**
 * Puntúa todos los candidatos contra una fila del destino y devuelve el veredicto.
 *
 * El score es **normalizado**: `obtenido / alcanzable`, donde `alcanzable` suma los pesos de las
 * señales que se pudieron evaluar. Sin eso, una fila que acertó todo lo que había para acertar
 * puntuaría bajo por campos que el origen ya no manda (CLAUDE.md, decisión 2).
 */
function evaluarCandidatos_(f, candidatos, comunas) {
  let mejor = null, segundo = null, mejorDes = null;

  for (let j = 0; j < candidatos.length; j++) {
    const sc = puntuar_(f, candidatos[j], comunas);

    /*
     * Puerta de relevancia. Un candidato que no comparte ni la figura ni una fecha cercana no
     * es un candidato: es otra reunión. Sin esto, cualquier formulario con una comuna distinta
     * entraba como "mejor descartado" y ensuciaba SIN_MATCH con un nombre que no tiene nada
     * que ver — el tipo de ruido que hace que después nadie mire el reporte.
     */
    if (!sc.relevante) continue;

    if (sc.desacuerdo) {
      if (!mejorDes || sc.score > mejorDes.score) mejorDes = sc;
      continue;
    }
    if (sc.score <= 0) continue;
    if (!mejor || sc.score > mejor.score) { segundo = mejor; mejor = sc; }
    else if (!segundo || sc.score > segundo.score) segundo = sc;
  }

  // Un candidato en desacuerdo de ubicación no compite con uno limpio, pero si es lo único que
  // hay y el resto de las señales da alto, va a revisión y no a la basura: la contradicción
  // puede venir del barrio del destino, que lo carga una persona (CLAUDE.md, decisión 2).
  if (!mejor && mejorDes) {
    return (mejorDes.resto >= UMBRAL_MATCH)
      ? { mejor: mejorDes, segundoScore: 0, margen: mejorDes.score,
          veredicto: 'REVISAR_MATCH', motivo: 'ubicacion_en_desacuerdo' }
      : { mejor: mejorDes, segundoScore: 0, margen: mejorDes.score,
          veredicto: 'SIN_MATCH', motivo: 'desacuerdo_y_resto_bajo' };
  }
  if (!mejor) return { mejor: null, veredicto: 'SIN_MATCH', motivo: 'sin_candidatos' };

  const s2 = segundo ? segundo.score : 0;
  const margen = redondear_(mejor.score - s2);

  let veredicto, motivo = '';
  if (mejor.score < UMBRAL_MATCH)      { veredicto = 'SIN_MATCH';     motivo = 'score_bajo'; }
  else if (mejor.multiFigura)          { veredicto = 'REVISAR_MATCH'; motivo = 'multi_figura'; }
  else if (margen < MARGEN_MINIMO)     { veredicto = 'REVISAR_MATCH'; motivo = 'margen_chico'; }
  else                                   veredicto = 'escribiria';

  return { mejor: mejor, segundoScore: s2, margen: margen, veredicto: veredicto, motivo: motivo };
}

/** El score de un candidato contra una fila del destino. */
function puntuar_(f, c, comunas) {
  let sFig = 0, sFecha = 0, sUbic = 0, sHora = 0;
  let alcanzable = PESOS_MATCH.figura;      // la figura siempre se puede evaluar
  const senales = [];

  // --- figura ---
  const figNorm = normalizeText_(f.figura);
  if (figNorm && c.figurasNorm.indexOf(figNorm) !== -1) {
    sFig = PESOS_MATCH.figura;
    senales.push('figura');
  }

  // --- fecha: señal con tolerancia, nunca descarta (3.3.c) ---
  const dist = distanciaFecha_(f.fecha, c.det);
  if (dist !== null) {
    alcanzable += PESOS_MATCH.fechaExacta;
    sFecha = puntajeFecha_(dist);
    if (sFecha > 0) senales.push('fecha±' + dist);
  }

  /*
   * --- ubicación: ausencia no puntúa, desacuerdo descalifica ---
   *
   * Tres vías, en orden de especificidad: **barrio, comuna, evento**. Es una sola señal con tres
   * formas de evaluarse, no tres señales: la que aplique ocupa el lugar en el denominador y las
   * otras no existen.
   *
   * El `EVENTO` es la última porque es la de las reuniones temáticas, donde no hay barrio ni
   * comuna **que buscar** — el lugar no es un lugar, es un tema (CLAUDE.md 1.c).
   */
  let desacuerdo = false;
  let pesoUbic = 0;
  const bDest = normalizeText_(f.barrio);
  const bCand = normalizeText_(c.barrio);
  const cDest = bDest ? comunas.get(bDest) : null;

  const evc = coincideEvento_(f.evento, c.nombre);
  const eventoOk = !!(evc && (evc.sub || evc.palabras));

  if (bCand && bDest) {
    pesoUbic = PESOS_MATCH.barrioIgual;
    alcanzable += pesoUbic;
    if (bDest === bCand) { sUbic = pesoUbic; senales.push('barrio'); }
    else desacuerdo = true;
  } else if (c.comuna != null && cDest != null) {
    pesoUbic = PESOS_MATCH.comunaSinBarrio;
    alcanzable += pesoUbic;
    if (cDest === c.comuna) { sUbic = pesoUbic; senales.push('comuna'); }
    else desacuerdo = true;
  } else if (eventoOk && EVENTO_COMO_UBICACION) {
    /*
     * **Positivo únicamente: entra al denominador sólo cuando coincide.**
     *
     * Es asimétrico respecto del barrio y es deliberado. Un barrio distinto es una afirmación
     * sobre el lugar —*esta reunión fue en otro lado*— y por eso descalifica. Un evento que no
     * coincide no afirma nada: el nombre del formulario es texto libre y simplemente puede no
     * repetir el tema. Penalizarlo sería castigar a una fila por cómo la tipeó alguien.
     *
     * El costo de la asimetría es que esta señal sólo puede subir un score, nunca bajarlo. Si
     * el bloque 2d mostrara que `EVENTO` está en casi todas las filas y coincide sólo en las
     * temáticas, valdría la pena volverla simétrica. Hoy no sabemos eso.
     */
    pesoUbic = PESOS_MATCH.eventoIgual;
    alcanzable += pesoUbic;
    sUbic = pesoUbic;
    senales.push('evento');
  }

  // --- hora ---
  if (f.horaMin !== null && c.horaMin !== null) {
    alcanzable += PESOS_MATCH.hora;
    if (Math.abs(f.horaMin - c.horaMin) <= TOLERANCIA_HORA_MIN) {
      sHora = PESOS_MATCH.hora;
      senales.push('hora');
    }
  }

  /*
   * Dos puertas, con anchos distintos a propósito.
   *
   *   relevante  — para el MATCH automático. Comparte figura, o la fecha cae dentro de la
   *                banda más ancha que puntúa (±7). Es lo que el pipeline se anima a decidir
   *                solo.
   *   proponible — para EMPAREJAR_MANUAL, que es una lista que mira una persona. Más laxa:
   *                hasta VENTANA_EMPAREJAR_DIAS. Vale ofrecer un par dudoso para que alguien
   *                lo confirme; no vale escribirlo solo.
   *
   * La ubicación no abre ninguna de las dos: confirma, no identifica (CLAUDE.md 1.b).
   */
  const bandaMax = BANDAS_FECHA[BANDAS_FECHA.length - 1].dias;
  const relevante  = (sFig > 0) || (dist !== null && dist <= bandaMax);

  /*
   * `proponible` usa **Y**, no O. La primera versión proponía un par si compartía figura **o**
   * caía en ±21 días, y con eso entraba cualquier reunión de la misma figura del último año:
   * 1.883 pares para 103 filas, o sea 18 por fila. Una lista así no la mira nadie, y una lista
   * que nadie mira es peor que no tenerla — ocupa el lugar de la que sí serviría.
   *
   * Con **Y** el número baja a un orden trabajable. Y si alguna fila se queda sin par
   * propuesto, aparece en el bloque de huérfanas: **es información honesta**, a diferencia de
   * 18 pares falsos.
   */
  /*
   * Tres vías de relevancia, no una: **figura Y (fecha cercana O comuna O evento)**.
   *
   * La versión anterior pedía figura **y** fecha dentro de ±21. Con eso las reuniones temáticas
   * quedaban fuera de la propuesta manual **por no tener ubicación** — que es justamente lo que
   * hay que resolverles. La comuna y el evento entran como vías alternativas: si la fecha está
   * rota (3.3.c) pero el tema coincide, hay razón de sobra para ofrecer el par.
   *
   * Sigue siendo **Y** en la figura, que es lo que evitó los 1.883 pares: sin figura compartida
   * no se propone nada.
   */
  const distOk   = (dist !== null && dist <= VENTANA_EMPAREJAR_DIAS);
  const comunaOk = (c.comuna != null && cDest != null && cDest === c.comuna);
  const proponible = (sFig > 0) && (distOk || comunaOk || eventoOk);

  const obtenido = sFig + sFecha + sUbic + sHora;
  const alcSinUbic = alcanzable - pesoUbic;

  /*
   * El desglose por señal, para poder saber **qué costó score** y no sólo qué faltó.
   *
   * Bajo normalización una señal ausente es gratis: sale del numerador y del denominador. Lo
   * que cuesta es una señal **evaluable que no coincidió del todo**. Confundir las dos cosas
   * manda el trabajo en la dirección equivocada.
   */
  return {
    c: c,
    score: redondear_(alcanzable > 0 ? obtenido / alcanzable : 0),
    perdido: {
      figura: redondear_(PESOS_MATCH.figura - sFig),
      fecha:  dist === null ? 0 : redondear_(PESOS_MATCH.fechaExacta - sFecha),
      ubic:   redondear_(pesoUbic - sUbic),
      hora:   (f.horaMin !== null && c.horaMin !== null) ? redondear_(PESOS_MATCH.hora - sHora) : 0
    },
    evaluables: {
      fecha: dist !== null,
      ubic: pesoUbic > 0,
      hora: (f.horaMin !== null && c.horaMin !== null)
    },
    resto: redondear_(alcSinUbic > 0 ? (obtenido - sUbic) / alcSinUbic : 0),
    absoluto: redondear_(obtenido),
    alcanzable: redondear_(alcanzable),
    dist: dist,
    relevante: relevante,
    proponible: proponible,
    evento: evc,
    eventoOk: eventoOk,
    desacuerdo: desacuerdo,
    multiFigura: c.figurasNorm.length >= 2,
    nivel: senales.join('+') || 'ninguna'
  };
}

// ===================== EMPAREJAR_MANUAL =====================

/**
 * El lado que falta: **formularios de `B` que no se asociaron a ninguna fila**.
 *
 * Todo lo demás mira desde el destino hacia `B`. Con las dos listas juntas el problema se ve
 * completo, y muchas veces la solución salta a la vista — un formulario huérfano y una fila
 * vacía que evidentemente se corresponden.
 *
 * **Sólo propone pares con alguna razón de serlo.** Una lista de 103 contra 100 sin filtrar es
 * un producto cartesiano de 10.300 filas y nadie la mira. El piso es bajo (`PISO_EMPAREJAR`)
 * pero existe: comparte figura, o cae dentro de `VENTANA_EMPAREJAR_DIAS`.
 *
 * **Orden: por score descendente, no por fecha.** Los pares más plausibles arriba, que es como
 * se trabaja una lista así. Y los candidatos de un mismo formulario van **juntos y seguidos**,
 * para poder elegir entre ellos sin buscarlos.
 */
function calcularEmparejar_(dest, cands, comunas, usados, resueltas) {
  const librosDestino = dest.filas.filter(function (f) {
    if (f.uid) return false;                        // ya identificada
    if (resueltas && resueltas[f.fila]) return false; // ya se resolvió en esta corrida
    if (f.fecha && f.fecha > _hoy_()) return false;  // reunión futura: no es hueco
    return true;
  });

  const grupos = [];

  for (let i = 0; i < cands.vivos.length; i++) {
    const c = cands.vivos[i];
    if (usados[c.fila]) continue;                  // ya se lo llevó una fila del destino

    const props = [];
    for (let j = 0; j < librosDestino.length; j++) {
      const f = librosDestino[j];
      const sc = puntuar_(f, c, comunas);
      if (!sc.proponible) continue;                // ninguna razón para proponerlo
      if (sc.score < PISO_EMPAREJAR) continue;
      props.push({ f: f, sc: sc });
    }

    if (!props.length) continue;
    props.sort(function (a, b) { return b.sc.score - a.sc.score; });
    grupos.push({ c: c, props: props, mejor: props[0].sc.score });
  }

  // Los grupos, por su mejor candidato. Adentro, por score. Así se cumplen las dos cosas:
  // lo más plausible arriba, y los candidatos de un formulario juntos.
  grupos.sort(function (a, b) { return b.mejor - a.mejor; });

  const filas = [];
  const pares = contador_();
  grupos.forEach(function (g) {
    g.props.forEach(function (p) {
      const ev = enVentanaAnalisis_(p.f.fecha);
      sumar_(pares, ev);
      filas.push([g.c.nombre, g.c.inscriptos, p.f.figura, p.f.barrio, fmtFecha_(p.f.fecha),
                  p.sc.score, p.sc.nivel, _sn_(ev), '']);
    });
  });

  // Filas del destino que no aparecieron en ninguna propuesta.
  const conPropuesta = {};
  grupos.forEach(function (g) { g.props.forEach(function (p) { conPropuesta[p.f.fila] = true; }); });
  const filasHuerfanas = librosDestino.filter(function (f) { return !conPropuesta[f.fila]; });

  // Los formularios que no matchean con nada. Es el único conjunto verdaderamente
  // irresoluble, y por eso se listan enteros: con pocos casos se puede entender qué les pasa.
  const huerfanos = [];
  for (let i = 0; i < cands.vivos.length; i++) {
    const c = cands.vivos[i];
    if (usados[c.fila]) continue;
    if (!grupos.some(function (g) { return g.c.fila === c.fila; })) huerfanos.push(c);
  }

  /*
   * De los formularios huérfanos, **cuántos tienen el tema de alguna fila del destino en el
   * nombre**. Es la medida directa de si `EVENTO` sirve para rescatarlos, y hay que mirarla
   * antes de darle peso a la señal: si da cero, las reuniones temáticas no son la explicación
   * de los huérfanos y hay que buscar en otro lado (CLAUDE.md §6).
   */
  const huerfConEvento = contador_();
  huerfanos.forEach(function (c) {
    const ev = enVentanaAnalisis_(c.det && c.det.mejor);
    for (let j = 0; j < librosDestino.length; j++) {
      const e = coincideEvento_(librosDestino[j].evento, c.nombre);
      if (e && (e.sub || e.palabras)) { sumar_(huerfConEvento, ev); return; }
    }
  });

  const huerfanosVent = contador_();
  huerfanos.forEach(function (c) { sumar_(huerfanosVent, enVentanaAnalisis_(c.det && c.det.mejor)); });
  const filasHuerfVent = contador_();
  filasHuerfanas.forEach(function (f) { sumar_(filasHuerfVent, enVentanaAnalisis_(f.fecha)); });
  const filasHuerfConEvento = contador_();
  filasHuerfanas.forEach(function (f) {
    if (normalizarEvento_(f.evento)) sumar_(filasHuerfConEvento, enVentanaAnalisis_(f.fecha));
  });

  /*
   * Los dos bloques del final son la medida de lo que el sistema NO puede resolver ni con
   * ayuda humana. Si son grandes, falta información que no está en ninguno de los dos lados —
   * y eso es una conversación con quien carga los formularios, no un problema de código.
   */
  const vacia = ['', '', '', '', '', '', '', '', ''];
  const salida = [['nombre_formulario', 'inscriptos', 'Figura', 'Barrio', 'Fecha', 'score',
                   'senales', 'en_ventana', 'confirmar']];
  filas.forEach(function (r) { salida.push(r); });

  salida.push(vacia.slice());
  salida.push(['--- FORMULARIOS SIN NINGÚN CANDIDATO (' + huerfanos.length + ') ---',
               '', '', '', '', '', '', '', '']);
  huerfanos.forEach(function (c) {
    salida.push([c.nombre, c.inscriptos, '', '', fmtFecha_(c.det.mejor), '', '',
                 _sn_(enVentanaAnalisis_(c.det && c.det.mejor)), '']);
  });

  salida.push(vacia.slice());
  salida.push(['--- FILAS DEL DESTINO SIN NINGÚN CANDIDATO (' + filasHuerfanas.length + ') ---',
               '', '', '', '', '', '', '', '']);
  filasHuerfanas.forEach(function (f) {
    salida.push(['', '', f.figura, f.barrio, fmtFecha_(f.fecha), '', f.evento,
                 _sn_(enVentanaAnalisis_(f.fecha)), '']);
  });

  // Sólo calcula. La escritura la hace escribirReportes_, para poder reintentarla sola.
  return { matriz: salida, pares: pares, huerfanos: huerfanos,
           formulariosHuerfanos: huerfanosVent,
           filasConPropuesta: Object.keys(conPropuesta).length,
           formulariosConPropuesta: grupos.length,
           filasHuerfanas: filasHuerfVent,
           huerfConEvento: huerfConEvento,
           filasHuerfConEvento: filasHuerfConEvento };
}

/**
 * Las confirmaciones que una persona dejó en `EMPAREJAR_MANUAL`.
 *
 * La solapa se regenera en cada corrida, así que hay que leer las confirmaciones **antes**.
 * Una vez estampado el `RDV_UID` en las dos puntas, ese par no vuelve a aparecer.
 */
function leerConfirmaciones_() {
  const out = new Map();
  const sh = ssIntermedia_().getSheetByName(RDV_HOJA_EMPAREJAR);
  if (!sh || sh.getLastRow() < 2) return out;

  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues();
  for (let i = 0; i < vals.length; i++) {
    const confirmar = str(vals[i][8]);      // corrida a I: en_ventana entró en H
    if (!confirmar) continue;
    const nombre = str(vals[i][0]);
    if (!nombre || nombre.indexOf('---') === 0) continue;
    out.set(nombre + '||' + str(vals[i][2]) + '||' + str(vals[i][4]), true);
  }
  return out;
}

// ===================== Escritura =====================

/**
 * Aplica las decisiones. **Todo pasa por `setSiDelSistema_`** — cero `setValue` sueltos
 * (CLAUDE.md, sección 0).
 *
 * Las `COLUMNAS_MANUALES` ni se intentan, y las `COLUMNAS_DERIVADAS` tampoco: hasta la Fase 3
 * son fórmulas de array y escribir en una rompe el bloque entero (3.1.b).
 */
function aplicarDecisiones_(dest, decisiones) {
  const sh = dest.sh;
  let celdas = 0, uids = 0;

  for (let i = 0; i < decisiones.length; i++) {
    const d = decisiones[i];
    const fila = d.fila.fila;

    // La traza se escribe SIEMPRE, incluso para los descartados: es lo que hace auditable un
    // caso mal resuelto sin volver a correr nada.
    if (dest.T.origen != null) {
      setSiDelSistema_(sh.getRange(fila, dest.T.origen + 1), d.cand.nombre);
      setSiDelSistema_(sh.getRange(fila, dest.T.score + 1), d.score);
      setSiDelSistema_(sh.getRange(fila, dest.T.nivel + 1), d.nivel);
      if (d.dist !== null && dest.T.fechaMatch != null) {
        setSiDelSistema_(sh.getRange(fila, dest.T.fechaMatch + 1), d.dist);
      }
    }
    if (d.noEscribir) continue;

    if (dest.T.uid != null && !d.fila.uid) {
      const uid = Utilities.getUuid();
      if (setSiDelSistema_(sh.getRange(fila, dest.T.uid + 1), uid)) uids++;
    }

    for (let k = 0; k < CAMPOS_DATO_.length; k++) {
      const campo = CAMPOS_DATO_[k];
      if (esColumnaManual_(campo) || esColumnaDerivada_(campo)) continue;
      const idx = dest.D[campo];
      if (idx == null) continue;
      const v = d.cand.datos[campo];
      if (v === '' || v === null || v === undefined) continue;
      if (setSiDelSistema_(sh.getRange(fila, idx + 1), v)) celdas++;
    }

    // La única excepción a la regla general (CLAUDE.md, sección 0 y decisión 12).
    if (dest.D['Asistentes'] != null && dest.D['STATUS REUNIÓN'] != null) {
      const asis = numOcero_(d.fila.valores[dest.D['Asistentes']]);
      marcarRealizada_(sh.getRange(fila, dest.D['STATUS REUNIÓN'] + 1), asis);
    }
  }
  return { celdas: celdas, uids: uids };
}

/** Las columnas de dato que el upsert escribe. Las manuales y las derivadas no están. */
const CAMPOS_DATO_ = ['Masculinos', 'Femeninos',
                      '18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar'];

// ===================== Lecturas =====================

function leerDestino_() {
  const sh = ssDestino_().getSheetByName(RDV_HOJA_DESTINO);
  if (!sh) throw new Error('No existe la hoja "' + RDV_HOJA_DESTINO + '".');
  const nFilas = sh.getLastRow(), nCols = sh.getLastColumn();
  const bloque = sh.getRange(1, 1, nFilas, nCols).getValues();
  const hdr = bloque[0];

  const D = {};
  ['Figura', 'Barrio', 'FECHA', 'HORA', 'Inscriptos', 'Asistentes', 'STATUS REUNIÓN', 'EVENTO',
   'Masculinos', 'Femeninos', '18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar']
    .forEach(function (n) { D[n] = findIdxOr_(hdr, aliasColumna_(n), true); });

  // `EVENTO` es la única vía de ubicación para las reuniones temáticas (CLAUDE.md 1.c). Si no
  // está, el matching sigue andando: esas filas quedan sin señal de ubicación, como hoy.
  if (D['EVENTO'] == null) {
    Logger.log('AVISO: el destino no tiene columna EVENTO. Las reuniones temáticas se quedan ' +
               'sin la única señal de ubicación que tienen (CLAUDE.md 1.c).');
  }

  const T = {
    uid:        findIdxOr_(hdr, ['rdv_uid'], true),
    origen:     findIdxOr_(hdr, ['form_origen'], true),
    score:      findIdxOr_(hdr, ['form_score'], true),
    nivel:      findIdxOr_(hdr, ['form_nivel'], true),
    fechaMatch: findIdxOr_(hdr, ['form_fecha_match'], true)
  };
  const faltan = [];
  if (T.uid == null)        faltan.push('RDV_UID');
  if (T.origen == null)     faltan.push('form_origen');
  if (T.score == null)      faltan.push('form_score');
  if (T.nivel == null)      faltan.push('form_nivel');
  if (T.fechaMatch == null) faltan.push('form_fecha_match');
  if (faltan.length) {
    Logger.log('AVISO: faltan columnas de traza en el destino: %s. Los scores se calculan igual, ' +
               'pero no hay dónde estampar eso. Ver Fase 2b.', faltan.join(', '));
  } else {
    Logger.log('Columnas de traza: las cinco presentes.');
  }

  const filas = [];
  for (let i = 1; i < bloque.length; i++) {
    const r = bloque[i];
    const figura = str(r[D['Figura']]);
    const barrio = D['Barrio'] != null ? str(r[D['Barrio']]) : '';
    const fecha = toDate_(r[D['FECHA']]);
    if (!figura && !fecha && esVacio_(r[D['Inscriptos']])) continue;  // fila fantasma
    filas.push({
      fila: i + 1, valores: r, figura: figura, barrio: barrio, fecha: fecha,
      horaMin: D['HORA'] != null ? _horaEnMinutos_(r[D['HORA']]) : null,
      evento: D['EVENTO'] != null ? str(r[D['EVENTO']]) : '',
      uid: T.uid != null ? str(r[T.uid]) : '',
      clave: claveNatural_(figura, fecha)
    });
  }
  return { sh: sh, D: D, T: T, filas: filas };
}

/** Candidatos desde `B`, el import crudo. Los `NO USAR` quedan afuera del todo. */
function leerCandidatos_() {
  const sh = ssIntermedia_().getSheetByName(RDV_HOJA_B);
  if (!sh) throw new Error('No existe la hoja "' + RDV_HOJA_B + '".');
  const nFilas = sh.getLastRow();
  const bloque = sh.getRange(1, 1, nFilas, sh.getLastColumn()).getValues();
  const hdr = bloque[0];

  const i = function (n, opt) { return findIdxOr_(hdr, [n], opt); };
  const iNombre = i('Nombre');
  const iFin    = i('Fecha_Fin', true);
  const iIns    = i('Inscriptos', true);
  const iM      = i('Inscriptos M', true);
  const iF      = i('Inscriptos F', true);
  const iUni    = i('Inscriptos unicos identificados', true);
  const edades  = ['18-24', '25-39', '40-55', '56-65', '66+']
    .map(function (e) { return i('Inscriptos edades ' + e, true); });

  const vivos = [], porUid = new Map();
  let anulados = 0;

  for (let k = 1; k < bloque.length; k++) {
    const r = bloque[k];
    const nombre = str(r[iNombre]);
    if (!nombre || /^loading/i.test(nombre)) continue;

    if (esFormularioAnulado_(nombre)) { anulados++; continue; }

    const ins = numOcero_(iIns != null ? r[iIns] : '');
    const uni = numOcero_(iUni != null ? r[iUni] : '');
    const nM = numOcero_(iM != null ? r[iM] : '');
    const nF = numOcero_(iF != null ? r[iF] : '');

    const datos = {};
    datos['Masculinos'] = uni > 0 ? Math.round(ins * (nM / uni)) : '';
    datos['Femeninos']  = uni > 0 ? Math.round(ins * (nF / uni)) : '';
    let sumaEdades = 0;
    ['18-24', '25-39', '40-55', '56-65', '66+'].forEach(function (e, n) {
      const v = edades[n] != null ? num(r[edades[n]]) : '';
      datos[e] = v;
      sumaEdades += numOcero_(v);
    });
    datos['Sin identificar'] = ins > 0 ? Math.max(0, ins - sumaEdades) : '';

    const limpio = limpiarPrefijos_(nombre);
    vivos.push({
      fila: k + 1,
      nombre: nombre,                         // literal, sin normalizar: es la trazabilidad
      figurasNorm: figurasEnTexto_(nombre).map(normalizeText_),
      barrio: detectBarrio_(limpio),
      comuna: detectComuna_(limpio),
      horaMin: _horaEnMinutos_(limpio),
      det: detectFecha_(limpio, iFin != null ? r[iFin] : null),
      inscriptos: ins,
      datos: datos
    });
  }
  return { vivos: vivos, anulados: anulados, porUid: porUid };
}

function leerComunasMap_() {
  const mapa = new Map();
  const sh = ssDestino_().getSheetByName(RDV_HOJA_COMUNAS);
  if (!sh || sh.getLastRow() < 2) return mapa;
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  for (let i = 0; i < vals.length; i++) {
    const b = normalizeText_(vals[i][0]);
    const c = numComuna_(vals[i][1]);
    if (b && c != null) mapa.set(b, c);
  }
  return mapa;
}

// ===================== Internas =====================

function escribirReporte_(nombre, encabezado, filas) {
  const salida = [encabezado];
  filas.forEach(function (f) { salida.push(f); });
  escribirHoja_(nombre, salida);
  Logger.log('[upsert] %s: %s filas', nombre, filas.length);
}

/** Escribe una solapa de reporte en la intermedia. `clearContents`, nunca `clear` (sección 6). */
function escribirHoja_(nombre, matriz) {
  /*
   * Un reintento con espera. `Service Spreadsheets timed out` es transitorio y ya tiró dos
   * corridas: `diagFase1()` el 22/09 y `correrEnSeco()` el 25/09. La escritura es idempotente
   * —limpia y reescribe todo— así que repetirla no puede dejar media solapa.
   */
  let ultimoError = null;
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const ss = ssIntermedia_();
      let sh = ss.getSheetByName(nombre);
      if (!sh) sh = ss.insertSheet(nombre);
      else sh.clearContents();
      sh.getRange(1, 1, matriz.length, matriz[0].length).setValues(matriz);
      sh.setFrozenRows(1);
      SpreadsheetApp.flush();
      return sh;
    } catch (err) {
      ultimoError = err;
      Logger.log('[upsert] %s: falló la escritura (intento %s): %s', nombre, intento, err);
      if (intento === 1) { Utilities.sleep(5000); _ssIntermedia_ = null; }
    }
  }
  throw ultimoError;
}

function _hoy_() {
  const h = new Date();
  return new Date(h.getFullYear(), h.getMonth(), h.getDate(), 12, 0, 0);
}

function _horaEnMinutos_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v.getHours() * 60 + v.getMinutes();
  const t = str(v);
  if (!t) return null;
  let m = /(\d{1,2})[:.](\d{2})/.exec(t);
  if (m) return _validaHora_(parseInt(m[1], 10), parseInt(m[2], 10));
  m = /\b(\d{1,2})\s*(?:hs?\b|horas\b)/i.exec(t);
  if (m) return _validaHora_(parseInt(m[1], 10), 0);
  return null;
}

function _validaHora_(h, mi) {
  return (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) ? h * 60 + mi : null;
}

function redondear_(n) {
  return Math.round(n * 100) / 100;
}
