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

  const res = { porUid: 0, escribiria: 0, revisar: 0, sinMatch: 0, futuras: 0,
                escritas: 0, uidsEstampados: 0 };
  const motivos = {};

  /*
   * Autopsia del grupo de score bajo. La diferencia entre 0,90 y 0,65 es casi exactamente el
   * peso del barrio (0,25), así que hay una hipótesis concreta a confirmar o tirar: **que el
   * grupo de abajo sea "todo bien salvo el barrio"**, o sea la marca del cambio de formulario
   * (3.3.b) y no un problema de matching.
   *
   * Y como la comuna es la señal que viene a reemplazar al barrio, se mide en el mismo paso:
   * si cubre buena parte de esas filas, el grupo bajo se disuelve solo.
   */
  const bajo = { total: 0, banda6a7: 0,
                 sinBarrio: 0, sinFecha: 0, sinNinguna: 0, conLasDos: 0,
                 conComuna: 0, comunaCoincide: 0, comunaDifiere: 0, destinoSinComuna: 0 };
  const comunaDifieren = [];
  const filasRevisar = [], filasSinMatch = [], decisiones = [];
  const usados = {};
  const hist = [0,0,0,0,0,0,0,0,0,0];

  const cuenta = function (m) { motivos[m] = (motivos[m] || 0) + 1; };

  for (let i = 0; i < dest.filas.length; i++) {
    const f = dest.filas[i];

    // Reuniones futuras: no son hueco, todavía no corresponde completarlas.
    if (f.fecha && f.fecha > _hoy_()) { res.futuras++; continue; }

    if (f.uid) {
      const porUid = cands.porUid.get(f.uid);
      res.porUid++;
      if (porUid) {
        decisiones.push({ fila: f, cand: porUid, score: 1, nivel: 'rdv_uid', dist: null });
        usados[porUid.fila] = true;
      }
      continue;
    }

    const ev = evaluarCandidatos_(f, cands.vivos, comunas);
    if (ev.mejor) {
      hist[Math.min(9, Math.floor(ev.mejor.score * 10))]++;
      if (ev.mejor.score < UMBRAL_MATCH) {
        _autopsia_(bajo, comunaDifieren, f, ev.mejor, comunas);
      }
    }

    if (!ev.mejor) {
      res.sinMatch++; cuenta('sin_candidatos');
      filasSinMatch.push([f.clave, f.figura, f.barrio, fmtFecha_(f.fecha), 'sin_candidatos', '', '']);
      continue;
    }

    if (ev.veredicto === 'escribiria') {
      res.escribiria++;
      decisiones.push({ fila: f, cand: ev.mejor.c, score: ev.mejor.score,
                        nivel: ev.mejor.nivel, dist: ev.mejor.dist });
      usados[ev.mejor.c.fila] = true;
    } else if (ev.veredicto === 'REVISAR_MATCH') {
      res.revisar++; cuenta(ev.motivo);
      filasRevisar.push([f.clave, f.figura, f.barrio, fmtFecha_(f.fecha),
                         ev.mejor.c.nombre, ev.mejor.score, ev.segundoScore, ev.margen,
                         ev.motivo, ev.mejor.nivel]);
      decisiones.push({ fila: f, cand: ev.mejor.c, score: ev.mejor.score,
                        nivel: 'descartado:' + ev.motivo, dist: ev.mejor.dist, noEscribir: true });
    } else {
      res.sinMatch++; cuenta(ev.motivo);
      filasSinMatch.push([f.clave, f.figura, f.barrio, fmtFecha_(f.fecha), ev.motivo,
                          ev.mejor.c.nombre, ev.mejor.score]);
      decisiones.push({ fila: f, cand: ev.mejor.c, score: ev.mejor.score,
                        nivel: 'descartado:' + ev.motivo, dist: ev.mejor.dist, noEscribir: true });
    }
  }

  const resueltas = {};
  decisiones.forEach(function (d) { if (!d.noEscribir) resueltas[d.fila.fila] = true; });
  const emp = calcularEmparejar_(dest, cands, comunas, usados, resueltas);

  // Cobertura general de detectComuna_ sobre TODOS los formularios, no sólo los del grupo bajo.
  let formsConComuna = 0;
  for (let i = 0; i < cands.vivos.length; i++) if (cands.vivos[i].comuna != null) formsConComuna++;

  return { dest: dest, cands: cands, res: res, motivos: motivos, hist: hist,
           bajo: bajo, comunaDifieren: comunaDifieren, formsConComuna: formsConComuna,
           filasRevisar: filasRevisar, filasSinMatch: filasSinMatch,
           decisiones: decisiones, emp: emp };
}

/**
 * Qué le faltó a una fila que no llegó al umbral.
 *
 * No alcanza con saber que 82 filas dieron 0,65: hace falta **qué señal les faltó**, porque de
 * eso depende si el arreglo es de datos, de parser o de umbral.
 */
function _autopsia_(bajo, difieren, f, mejor, comunas) {
  bajo.total++;
  if (mejor.score >= 0.6 && mejor.score < 0.7) bajo.banda6a7++;

  const c = mejor.c;
  const bandaMax = BANDAS_FECHA[BANDAS_FECHA.length - 1].dias;

  // "Sin barrio" es del lado del ORIGEN: el formulario no trae barrio reconocible. Es la
  // hipótesis del cambio de formulario (3.3.b).
  const sinBarrio = !normalizeText_(c.barrio);
  // "Sin fecha útil" = no hay fecha comparable, o la que hay cae fuera de la última banda.
  const sinFecha = (mejor.dist === null) || (mejor.dist > bandaMax);

  if (sinBarrio && sinFecha) bajo.sinNinguna++;
  else if (sinBarrio) bajo.sinBarrio++;
  else if (sinFecha) bajo.sinFecha++;
  else bajo.conLasDos++;

  // La comuna, que es la señal que reemplaza al barrio.
  if (c.comuna == null) return;
  bajo.conComuna++;
  const bDest = normalizeText_(f.barrio);
  const cDest = bDest ? comunas.get(bDest) : null;
  if (cDest == null) { bajo.destinoSinComuna++; return; }
  if (cDest === c.comuna) bajo.comunaCoincide++;
  else {
    bajo.comunaDifiere++;
    if (difieren.length < 20) {
      difieren.push({ figura: f.figura, barrio: f.barrio, cDest: cDest,
                      cForm: c.comuna, nombre: c.nombre });
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
  const base = plan.dest.filas.length - r.futuras;

  Logger.log('--- 1. VEREDICTOS (base: %s filas del destino, sin las %s futuras) ---',
             base, r.futuras);
  Logger.log('  por RDV_UID (ya estampadas): %s', r.porUid);
  Logger.log('  escribiría .......... %s  (%s%% de %s)', r.escribiria, _pct_(r.escribiria, base), base);
  Logger.log('  a revisar ........... %s  (%s%%)', r.revisar, _pct_(r.revisar, base));
  Logger.log('  sin match ........... %s  (%s%%)', r.sinMatch, _pct_(r.sinMatch, base));
  Logger.log('  --- por motivo ---');
  Object.keys(plan.motivos).sort().forEach(function (m) {
    Logger.log('    %s: %s', m, plan.motivos[m]);
  });
  /*
   * `sin_candidatos` contra `score_bajo` es la distinción que decide el umbral:
   * el primero es "no hay con qué", el segundo es "hay, pero 0.75 lo rechaza".
   */
  const sinCand = plan.motivos['sin_candidatos'] || 0;
  const bajo = plan.motivos['score_bajo'] || 0;
  if (bajo > 0) {
    Logger.log('  >>> %s filas TIENEN candidato y lo rechaza el umbral. Bajar UMBRAL_MATCH las ' +
               'recupera. Las otras %s no tienen con qué y ningún umbral las salva.',
               bajo, sinCand);
  } else if (sinCand > 0) {
    Logger.log('  >>> Las %s de sin match NO tienen candidato: el umbral no es el problema. ' +
               'Bajarlo no recupera ninguna.', sinCand);
  }

  Logger.log('--- 2. DISTRIBUCIÓN DEL SCORE NORMALIZADO (sólo filas con candidato) ---');
  let conCand = 0;
  for (let k = 0; k < 10; k++) conCand += plan.hist[k];
  for (let k = 9; k >= 0; k--) {
    if (!plan.hist[k]) continue;
    Logger.log('  %s–%s : %s  (%s%% de %s con candidato) %s',
               (k / 10).toFixed(1), ((k + 1) / 10).toFixed(1), plan.hist[k],
               _pct_(plan.hist[k], conCand), conCand, _barra_(plan.hist[k], conCand));
  }
  Logger.log('  umbrales en uso (PROVISORIOS): UMBRAL_MATCH=%s  MARGEN_MINIMO=%s',
             UMBRAL_MATCH, MARGEN_MINIMO);
  Logger.log('  Buscar un valle en la distribución: ahí va el umbral. Si es continua, cualquier');
  Logger.log('  corte es arbitrario y conviene quedarse alto y mandar el resto a revisión.');

  const e = plan.emp;
  const b = plan.bajo;
  if (b.total) {
    Logger.log('--- 2b. QUÉ LE FALTÓ AL GRUPO DE SCORE BAJO (%s filas bajo el umbral, %s en ' +
               '0,6-0,7) ---', b.total, b.banda6a7);
    Logger.log('  sólo le faltó el BARRIO ....... %s  (%s%% de %s)',
               b.sinBarrio, _pct_(b.sinBarrio, b.total), b.total);
    Logger.log('  sólo le faltó la FECHA ........ %s  (%s%%)', b.sinFecha, _pct_(b.sinFecha, b.total));
    Logger.log('  le faltaron las dos ........... %s  (%s%%)', b.sinNinguna, _pct_(b.sinNinguna, b.total));
    Logger.log('  tenía las dos y aun así no llegó %s  (%s%%)', b.conLasDos, _pct_(b.conLasDos, b.total));
    /*
     * La lectura que decide el trabajo: si domina "sólo le faltó el barrio", el grupo bajo es
     * la marca del cambio de formulario y no un problema de matching. Si domina "tenía las dos",
     * el score está mal calibrado y hay que mirarlo.
     */
    if (b.sinBarrio > b.total / 2) {
      Logger.log('  >>> Domina la falta de BARRIO: el grupo bajo es la huella del cambio de');
      Logger.log('      formulario (3.3.b), no un problema de matching. No se arregla con el');
      Logger.log('      umbral: se arregla con la comuna, o no se arregla.');
    } else if (b.conLasDos > b.total / 3) {
      Logger.log('  >>> %s filas tenían barrio Y fecha y aun así no llegaron. Eso NO se explica');
      Logger.log('      por el cambio de formulario: mirarlas de a una.', b.conLasDos);
    }

    Logger.log('--- 2c. ¿CUÁNTO APORTA LA COMUNA? (la señal que reemplaza al barrio) ---');
    Logger.log('  cobertura general de detectComuna_: %s de %s formularios (%s%%)',
               plan.formsConComuna, plan.cands.vivos.length,
               _pct_(plan.formsConComuna, plan.cands.vivos.length));
    Logger.log('  en el grupo bajo: %s de %s tienen comuna en el nombre (%s%%)',
               b.conComuna, b.total, _pct_(b.conComuna, b.total));
    Logger.log('    de esas, coincide con la comuna del barrio del destino: %s (%s%% de %s)',
               b.comunaCoincide, _pct_(b.comunaCoincide, b.conComuna), b.conComuna);
    Logger.log('    difiere: %s | el destino no tiene barrio del cual derivarla: %s',
               b.comunaDifiere, b.destinoSinComuna);
    if (b.conComuna && b.comunaCoincide / b.conComuna >= 0.9) {
      Logger.log('  >>> La comuna es confiable y cubre %s de las %s: **el grupo bajo se disuelve',
                 b.comunaCoincide, b.total);
      Logger.log('      solo** si se la deja puntuar. Recién ahí tiene sentido discutir el 0,15.');
    } else if (b.conComuna) {
      Logger.log('  >>> Coincide en menos del 90%%. Antes de tocar el peso hay que ver si lo que');
      Logger.log('      falla es detectComuna_ o el dato. Los casos van listados abajo.');
    }
    if (plan.comunaDifieren.length) {
      Logger.log('  --- los %s primeros casos donde la comuna DIFIERE ---',
                 plan.comunaDifieren.length);
      plan.comunaDifieren.forEach(function (d) {
        Logger.log('    destino: %s / %s (comuna %s)  vs  form: comuna %s | %s',
                   d.figura, d.barrio || 'sin barrio', d.cDest, d.cForm, d.nombre);
      });
    }
  }

  Logger.log('--- 3. EMPAREJAR_MANUAL ---');
  Logger.log('  pares propuestos ............ %s', e.pares);
  /*
   * La densidad es la métrica que faltaba. 1.883 pares sonaba a "mucho trabajo"; 18 por fila
   * dice que la lista es inutilizable. El objetivo es 2 a 4.
   */
  const porFila = e.filasConPropuesta ? Math.round(e.pares * 10 / e.filasConPropuesta) / 10 : 0;
  const porForm = e.formulariosConPropuesta
    ? Math.round(e.pares * 10 / e.formulariosConPropuesta) / 10 : 0;
  Logger.log('  DENSIDAD: %s pares por fila del destino (%s filas con propuesta)',
             porFila, e.filasConPropuesta);
  Logger.log('            %s pares por formulario (%s formularios con propuesta)',
             porForm, e.formulariosConPropuesta);
  if (porFila > 5) {
    Logger.log('  >>> Más de 5 por fila: la lista no se puede trabajar. La puerta está demasiado');
    Logger.log('      laxa — revisar `proponible` en puntuar_(). El objetivo es 2 a 4.');
  }
  Logger.log('  formularios sin candidato ... %s', e.formulariosHuerfanos);
  Logger.log('  filas del destino sin ninguno %s', e.filasHuerfanas);
  Logger.log('  Esos dos últimos son lo que el sistema no puede resolver NI con ayuda humana.');

  // Con pocos casos se puede entender qué les pasa, así que se listan enteros.
  if (e.huerfanos && e.huerfanos.length && e.huerfanos.length <= 40) {
    Logger.log('  --- los %s formularios huérfanos, uno por uno ---', e.huerfanos.length);
    e.huerfanos.forEach(function (c) {
      Logger.log('    %s | ins=%s | %s', fmtFecha_(c.det.mejor) || 'sin fecha',
                 c.inscriptos, c.nombre);
    });
  }
}

function _pct_(n, d) {
  return d ? Math.round(n * 1000 / d) / 10 : 0;
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
         'motivo', 'senales'], plan.filasRevisar);
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
        ['clave', 'figura', 'barrio', 'fecha', 'motivo', 'mejor_descartado', 'score'],
        plan.filasSinMatch);
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

  // --- ubicación: ausencia no puntúa, desacuerdo descalifica ---
  let desacuerdo = false;
  const bDest = normalizeText_(f.barrio);
  const bCand = normalizeText_(c.barrio);
  if (bCand && bDest) {
    alcanzable += PESOS_MATCH.barrioIgual;
    if (bDest === bCand) { sUbic = PESOS_MATCH.barrioIgual; senales.push('barrio'); }
    else desacuerdo = true;
  } else if (c.comuna != null && bDest) {
    const cDest = comunas.get(bDest);
    if (cDest != null) {
      alcanzable += PESOS_MATCH.comunaSinBarrio;
      if (cDest === c.comuna) { sUbic = PESOS_MATCH.comunaSinBarrio; senales.push('comuna'); }
      else desacuerdo = true;
    }
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
  const proponible = (sFig > 0) && (dist !== null && dist <= VENTANA_EMPAREJAR_DIAS);

  const obtenido = sFig + sFecha + sUbic + sHora;
  const alcSinUbic = alcanzable - (sUbic > 0 || desacuerdo
    ? (bCand ? PESOS_MATCH.barrioIgual : PESOS_MATCH.comunaSinBarrio) : 0);

  return {
    c: c,
    score: redondear_(alcanzable > 0 ? obtenido / alcanzable : 0),
    resto: redondear_(alcSinUbic > 0 ? (obtenido - sUbic) / alcSinUbic : 0),
    absoluto: redondear_(obtenido),
    alcanzable: redondear_(alcanzable),
    dist: dist,
    relevante: relevante,
    proponible: proponible,
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
  grupos.forEach(function (g) {
    g.props.forEach(function (p) {
      filas.push([g.c.nombre, g.c.inscriptos, p.f.figura, p.f.barrio, fmtFecha_(p.f.fecha),
                  p.sc.score, p.sc.nivel, '']);
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
   * Los dos bloques del final son la medida de lo que el sistema NO puede resolver ni con
   * ayuda humana. Si son grandes, falta información que no está en ninguno de los dos lados —
   * y eso es una conversación con quien carga los formularios, no un problema de código.
   */
  const salida = [['nombre_formulario', 'inscriptos', 'Figura', 'Barrio', 'Fecha', 'score',
                   'senales', 'confirmar']];
  filas.forEach(function (r) { salida.push(r); });

  salida.push(['', '', '', '', '', '', '', '']);
  salida.push(['--- FORMULARIOS SIN NINGÚN CANDIDATO (' + huerfanos.length + ') ---',
               '', '', '', '', '', '', '']);
  huerfanos.forEach(function (c) {
    salida.push([c.nombre, c.inscriptos, '', '', fmtFecha_(c.det.mejor), '', '', '']);
  });

  salida.push(['', '', '', '', '', '', '', '']);
  salida.push(['--- FILAS DEL DESTINO SIN NINGÚN CANDIDATO (' + filasHuerfanas.length + ') ---',
               '', '', '', '', '', '', '']);
  filasHuerfanas.forEach(function (f) {
    salida.push(['', '', f.figura, f.barrio, fmtFecha_(f.fecha), '', '', '']);
  });

  // Sólo calcula. La escritura la hace escribirReportes_, para poder reintentarla sola.
  return { matriz: salida, pares: filas.length, huerfanos: huerfanos,
           formulariosHuerfanos: huerfanos.length,
           filasConPropuesta: Object.keys(conPropuesta).length,
           formulariosConPropuesta: grupos.length,
           filasHuerfanas: filasHuerfanas.length };
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

  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
  for (let i = 0; i < vals.length; i++) {
    const confirmar = str(vals[i][7]);
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
  ['Figura', 'Barrio', 'FECHA', 'HORA', 'Inscriptos', 'Asistentes', 'STATUS REUNIÓN',
   'Masculinos', 'Femeninos', '18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar']
    .forEach(function (n) { D[n] = findIdxOr_(hdr, aliasColumna_(n), true); });

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
