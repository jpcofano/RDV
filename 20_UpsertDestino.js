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
 * **No hay clave natural** (CLAUDE.md 3.2): el barrio no viene, el día del nombre del
 * formulario puede venir corrido y la figura sola no identifica. Así que el upsert **no intenta
 * identificar**: le pone un score a cada candidato, escribe lo que está por encima del umbral y **deja registrado
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

// ===================== Medición: la figura en el prefijo =====================

/**
 * **Sólo lectura.** Mide qué compra y qué cuesta `limpiarPrefijos_` sobre los formularios de `B`
 * (docs/HANDOFF-2026-09-25.md, sección 3). No escribe en ninguna planilla: todo va al log.
 *
 * La pregunta: ¿cuántos formularios tienen **una figura en el prefijo y otra distinta en el
 * cuerpo**? Es el único caso en que limpiar el prefijo cambia algo a favor. Si da cero o casi
 * cero, la limpieza no compra nada y sale.
 *
 * Usa `leerCandidatos_()` —la misma población que puntúa el upsert, sin los anulados— y
 * `compararLimpiezaPrefijo_()`, que comparte el matcheo con `figurasEnTexto_`. Un formulario está
 * en la ventana si su fecha detectada lo está (el mismo criterio que el resto del log).
 */
function medirFiguraEnPrefijo() {
  const cands = leerCandidatos_();
  const clases = ['sin_prefijo', 'prefijo_neutro', 'pierde_figura', 'evita_multi',
                  'sigue_multi', 'otro'];
  const cnt = {}, grupos = {};
  clases.forEach(function (k) { cnt[k] = contador_(); grupos[k] = new Map(); });
  const base = contador_();
  let sinFecha = 0;

  cands.vivos.forEach(function (c) {
    const ev = enVentanaAnalisis_(c.det && c.det.mejor);
    if (!(c.det && c.det.mejor)) sinFecha++;
    sumar_(base, ev);
    const r = compararLimpiezaPrefijo_(c.nombre);
    sumar_(cnt[r.clase], ev);
    if (r.clase === 'sin_prefijo') return;

    /*
     * Agrupar por la forma, no por el valor (CLAUDE.md §6): la clave es qué figura había en el
     * prefijo y cuál queda en el cuerpo, no el nombre crudo del formulario.
     */
    const clave = (r.enPrefijo.join(' + ') || '(prefijo sin figura: ' + normalizeText_(r.prefijo) + ')') +
                  '  →  ' + (r.con.join(' + ') || '(ninguna)');
    const g = grupos[r.clase];
    if (!g.has(clave)) g.set(clave, { n: contador_(), ejemplos: [] });
    const x = g.get(clave);
    sumar_(x.n, ev);
    if (x.ejemplos.length < 3) x.ejemplos.push({ ev: ev, fila: c.fila, nombre: c.nombre });
  });

  Logger.log('=== medirFiguraEnPrefijo — sólo lectura, no escribe nada ===');
  Logger.log('VENTANA: %s en ventana / %s formularios vivos de B | corte: %s (últimos %s meses)',
             base.v, base.t, fmtFecha_(inicioVentanaAnalisis_()), VENTANA_ANALISIS_MESES);
  Logger.log('  %s formularios sin fecha detectable: cuentan sólo en el total.', sinFecha);
  Logger.log('  PREFIJOS_EVENTO = %s', JSON.stringify(PREFIJOS_EVENTO));
  Logger.log('  Se lee [ventana | total]. Decide la ventana.');

  Logger.log('--- qué cambia la limpieza, por formulario ---');
  Logger.log('  sin prefijo (no toca nada) .... %s', _dcp_(cnt.sin_prefijo, base));
  Logger.log('  prefijo, mismas figuras ....... %s', _dcp_(cnt.prefijo_neutro, base));
  Logger.log('  PIERDE la figura (costo) ...... %s', _dcp_(cnt.pierde_figura, base));
  Logger.log('  EVITA multi_figura (benef.) ... %s', _dcp_(cnt.evita_multi, base));
  Logger.log('  sigue multi_figura ............ %s', _dcp_(cnt.sigue_multi, base));
  Logger.log('  otro (recorte desalineado) .... %s', _dcp_(cnt.otro, base));

  /*
   * Decir explícitamente qué NO es señal (CLAUDE.md §6, regla 3). Las líneas de abajo salen del
   * código, no de una suposición: `evaluarCandidatos_` decide primero el umbral (score bajo →
   * SIN_MATCH) y después `multi_figura` (→ REVISAR_MATCH), antes del margen. En ningún caso un
   * formulario con 2+ figuras se escribe solo.
   */
  Logger.log('  Qué NO dice esto:');
  Logger.log('   - Cuenta FORMULARIOS, no filas del destino ni matches. Cuánto se mueve el');
  Logger.log('     resultado del upsert lo dice volver a correr paso2_upsertEnSeco().');
  Logger.log('   - EVITA multi_figura no evita una escritura errónea: sin la limpieza esos casos');
  Logger.log('     irían a REVISAR_MATCH si pasan el umbral, o a SIN_MATCH si no (evaluarCandidatos_).');
  Logger.log('     Nunca al destino. El beneficio es menos revisión a mano. El costo, PIERDE la');
  Logger.log('     figura, es un formulario que deja de puntuar figura y puede perder contra uno lejano.');
  Logger.log('   - Mide sólo la figura. limpiarPrefijos_ también recorta el texto del que salen');
  Logger.log('     barrio, comuna, eje, hora y fecha (leerCandidatos_); ese efecto no se mide acá.');

  if (cnt.evita_multi.v === 0) {
    Logger.log('  >>> En la ventana NINGÚN formulario tiene una figura en el prefijo y otra distinta');
    Logger.log('      en el cuerpo. La limpieza no compra nada en el período que calibra.');
  } else {
    Logger.log('  >>> En la ventana: %s formularios evitan multi_figura y %s pierden la figura.',
               cnt.evita_multi.v, cnt.pierde_figura.v);
    Logger.log('      Mirar los grupos de abajo antes de decidir: el número solo no alcanza.');
  }

  ['evita_multi', 'pierde_figura', 'sigue_multi', 'otro', 'prefijo_neutro'].forEach(function (k) {
    const g = grupos[k];
    if (!g.size) return;
    Logger.log('--- %s: %s formas distintas ---', k, g.size);
    const orden = Array.from(g.entries())
      .sort(function (a, b) { return b[1].n.t - a[1].n.t; });
    const tope = (k === 'prefijo_neutro') ? 5 : 30;
    orden.slice(0, tope).forEach(function (e) {
      Logger.log('  %s  %s', _dc_(e[1].n), e[0]);
      e[1].ejemplos.forEach(function (x) {
        Logger.log('       [%s] B fila %s | %s', x.ev ? 'ventana' : 'histor.', x.fila, x.nombre);
      });
    });
    if (orden.length > tope) Logger.log('  (%s formas más, no listadas)', orden.length - tope);
  });

  return { base: base, clases: cnt };
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
   * El desvío REAL del grupo bajo, día por día — no las bandas agregadas.
   *
   * Si el desfase típico es de 1 a 3 días (reprogramación, CLAUDE.md 3.3.c), las filas del grupo
   * bajo no deberían estar "lejos". Si están, o `distanciaFecha_` no mide contra lo que creemos
   * o hay **dos poblaciones mezcladas**. Por eso, además del desvío del mejor candidato, se
   * mira si había algún formulario a ±`TOLERANCIA_REPROGRAMACION_DIAS`: con la figura
   * reconocida, sin ninguna figura reconocida, o nada.
   */
  const desvio = { porDia: {}, cercaConFigura: contador_(), cercaSinFigura: contador_(),
                   nadaCerca: contador_(), ejemplosSinFigura: [], ejemplosConFigura: [] };

  // Cuántas escribiría gracias a la tolerancia de ±3 (antes caían debajo del umbral).
  const porTolerancia = contador_();

  /*
   * Las filas con un formulario de **comuna coincidente** que no entran: por qué. Con figura +
   * comuna deberían llegar alto aun con la fecha corrida (punto C).
   */
  const comunaCaso = { total: contador_(), escribiria: contador_(), motivos: {}, ejemplos: [] };

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
        _desvioBajo_(desvio, f, r.mejor, cands.vivos, ev);
      }
      if (r.veredicto === 'escribiria' && r.mejor.dist !== null && r.mejor.dist >= 1 &&
          r.mejor.dist <= TOLERANCIA_REPROGRAMACION_DIAS) sumar_(porTolerancia, ev);
    }
    _casoComuna_(comunaCaso, f, r, cands.vivos, comunas, ev);

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

  const ejes = medirEjes_(dest, cands, comunas);

  return { dest: dest, cands: cands, res: res, motivos: motivos, hist: hist, ejes: ejes,
           desvio: desvio, porTolerancia: porTolerancia, comunaCaso: comunaCaso,
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
  Logger.log('  de las que escribiría, a 1-%s días (entran por la tolerancia de reprogramación; ' +
             'con la escala vieja quedaban abajo): %s', TOLERANCIA_REPROGRAMACION_DIAS,
             _dc_(plan.porTolerancia));
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

    Logger.log('  --- banda de fecha dentro del grupo bajo (hasta ±%s puntúa pleno) ---',
               TOLERANCIA_REPROGRAMACION_DIAS);
    Logger.log('    exacta %s', _dc_(b.fecha0));
    Logger.log('    ±1     %s', _dc_(b.fecha1));
    Logger.log('    ±3     %s', _dc_(b.fecha3));
    Logger.log('    ±7     %s', _dc_(b.fecha7));
    Logger.log('    lejos  %s', _dc_(b.fechaLejos));
    Logger.log('    n/e    %s', _dc_(b.fechaNoEvaluable));
    Logger.log('  señales que ni siquiera eran evaluables: ubicación %s | hora %s',
               _dc_(b.sinUbicEvaluable), _dc_(b.sinHoraEvaluable));
    _logDesvioBajo_(plan);

    /*
     * La regla del mes (CLAUDE.md 1.c) descarta del texto toda ocurrencia cuyo mes no sea el de
     * `fecha_fin` ni el siguiente. Acá se ve cuánto filtró: un `"Reunion 10-12 hs"` que antes
     * devolvía *10 de diciembre* ahora no devuelve nada, y la fila se apoya sólo en `fecha_fin`.
     * Ojo: las 20 que `diagCorteB()` llama `desfase_reprogramacion` NO son de esto — ahí no hay
     * ningún mes mal, es el destino corrido 1-3 días (lo cubre `TOLERANCIA_REPROGRAMACION_DIAS`).
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
      Logger.log('  >>> En la ventana domina el déficit de FECHA (%s de %s). Con la tolerancia de',
                 b.porFecha.v, b.total.v);
      Logger.log('      ±%s ya no puede ser reprogramación: el desvío es MAYOR. Mirar el bloque de',
                 TOLERANCIA_REPROGRAMACION_DIAS);
      Logger.log('      poblaciones de arriba antes de tocar un peso.');
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
  _logEjes_(plan.ejes);
  _logComuna_(plan.comunaCaso);

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
 * El bloque 2e, en memoria: **el eje geográfico, medido antes de darle peso**.
 *
 * Contesta tres cosas, sin que el flag `EJE_COMO_UBICACION` cambie nada:
 *
 *   a) ¿La `Zona` de `Comunas` es el eje? Vuelca sus valores con los barrios de cada uno.
 *   b) Los formularios con eje, y con qué filas del destino se estarían emparejando (misma
 *      figura, dentro de `VENTANA_EMPAREJAR_DIAS`) — con la zona de cada barrio, para confirmar
 *      el mapeo a mano y ver qué candidatos el eje descartaría.
 *   c) Los formularios temáticos: ¿hay ALGUNA fila del destino de su figura a ±
 *      `DIAS_TEMATICA_CERCANA`? Si no hay ninguna, es un huérfano real y ningún peso lo salva.
 */
function medirEjes_(dest, cands, comunas) {
  // --- a) la columna Zona de Comunas ---
  const porZona = {};
  _listas_().barrios.forEach(function (b) {
    const z = b.zona || '(vacía)';
    if (!porZona[z]) porZona[z] = { zona: z, eje: ejeDeZona_(b.zona), barrios: [], comunas: {} };
    porZona[z].barrios.push(b.canon);
    if (b.comuna != null) porZona[z].comunas[b.comuna] = true;
  });

  // --- b) formularios con eje ---
  const porForma = {};
  const cruce = {};              // eje del formulario × zona del barrio del destino → pares
  const pares = { total: contador_(), coincide: contador_(), descarta: contador_(),
                  noEvaluable: contador_() };
  const detalle = [];
  const conEje = contador_(), desconocidos = [];

  // --- c) temáticos ---
  const tem = { total: contador_(), conCercana: contador_(), huerfanos: [] };

  for (let i = 0; i < cands.vivos.length; i++) {
    const c = cands.vivos[i];
    const ev = enVentanaAnalisis_(c.det && c.det.mejor);
    const e = c.eje;

    if (e) {
      const k = e.tipo + ':' + (e.eje || e.forma);
      if (!porForma[k]) porForma[k] = contador_();
      sumar_(porForma[k], ev);
      if (e.tipo === 'eje') sumar_(conEje, ev);
      if (e.tipo === 'eje_desconocido' && desconocidos.length < 15) {
        desconocidos.push({ forma: e.forma, nombre: c.nombre });
      }
    }

    if (e && e.tipo === 'eje') {
      const filas = [];
      for (let j = 0; j < dest.filas.length; j++) {
        const f = dest.filas[j];
        if (c.figurasNorm.indexOf(normalizeText_(f.figura)) === -1) continue;
        const dist = distanciaFecha_(f.fecha, c.det);
        if (dist === null || dist > VENTANA_EMPAREJAR_DIAS) continue;

        const zona = zonaDeBarrio_(f.barrio);
        const ejeDest = ejeDeZona_(zona);
        let veredicto = 'no_evaluable';
        if (e.tipo === 'eje' && ejeDest) veredicto = (ejeDest === e.eje) ? 'coincide' : 'descarta';

        if (e.tipo === 'eje') {
          sumar_(pares.total, ev);
          sumar_(pares[veredicto === 'no_evaluable' ? 'noEvaluable' : veredicto], ev);
          const kc = e.eje + ' × ' + (zona || '(sin zona)');
          cruce[kc] = (cruce[kc] || 0) + 1;
        }
        const comunaDest = f.barrio ? comunas.get(normalizeText_(f.barrio)) : null;
        filas.push({ fila: f.fila, barrio: f.barrio, comuna: comunaDest, zona: zona, dist: dist,
                     veredicto: veredicto });
      }
      filas.sort(function (x, y) { return x.dist - y.dist; });
      detalle.push({ c: c, ev: ev, filas: filas });
    }

    if (c.tematico) {
      sumar_(tem.total, ev);
      let cercana = null;
      for (let j = 0; j < dest.filas.length; j++) {
        const f = dest.filas[j];
        if (c.figurasNorm.indexOf(normalizeText_(f.figura)) === -1) continue;
        const dist = distanciaFecha_(f.fecha, c.det);
        if (dist !== null && dist <= DIAS_TEMATICA_CERCANA &&
            (!cercana || dist < cercana.dist)) cercana = { f: f, dist: dist };
      }
      if (cercana) sumar_(tem.conCercana, ev);
      else tem.huerfanos.push({ c: c, ev: ev });
    }
  }

  return { encabezadoZona: encabezadoZonaComunas_(), porZona: porZona, porForma: porForma,
           conEje: conEje, desconocidos: desconocidos,
           pares: pares, cruce: cruce, detalle: detalle, tem: tem };
}

/** Dentro del 2b: el desvío real del grupo bajo, día por día, y las tres poblaciones. */
function _logDesvioBajo_(plan) {
  const d = plan.desvio;
  Logger.log('  --- desvío REAL del mejor candidato, en días (no bandas) ---');
  const claves = Object.keys(d.porDia).sort(function (a, b) {
    const n = function (k) { return k === 'sin fecha' ? 999 : (k === '>21' ? 998 : Number(k)); };
    return n(a) - n(b);
  });
  claves.forEach(function (k) {
    Logger.log('    %s  %s', _pad_(k, 9), _dc_(d.porDia[k]));
  });

  const tot = { v: d.cercaConFigura.v + d.cercaSinFigura.v + d.nadaCerca.v,
                t: d.cercaConFigura.t + d.cercaSinFigura.t + d.nadaCerca.t };
  Logger.log('  --- ¿había algún formulario a ±%s días? (separa las poblaciones) ---',
             TOLERANCIA_REPROGRAMACION_DIAS);
  Logger.log('    sí, con su figura reconocida ....... %s', _dcp_(d.cercaConFigura, tot));
  Logger.log('    sí, pero SIN ninguna figura reconocida %s', _dcp_(d.cercaSinFigura, tot));
  Logger.log('    no, ninguno ........................ %s', _dcp_(d.nadaCerca, tot));
  Logger.log('    Si "lejos" es grande y "sin figura" también: el formulario correcto existe, no');
  Logger.log('    se reconoció la figura, y uno lejano que sí la nombra le ganó el lugar. Si');
  Logger.log('    domina "ninguno": el formulario no está en B con esa fecha — otra población.');

  if (d.ejemplosSinFigura.length) {
    Logger.log('    --- casos "sin figura": el formulario cercano, y el que ganó ---');
    d.ejemplosSinFigura.forEach(function (x) {
      Logger.log('      [%s] %s %s | %s', x.ev ? 'ventana' : 'histor.', x.f.figura,
                 fmtFecha_(x.f.fecha), x.f.barrio || 'sin barrio');
      Logger.log('         cercano (%s días, sin figura): %s', x.x, x.c.nombre);
      Logger.log('         ganó (%s días, score %s): %s', x.mejor.dist, x.mejor.score,
                 x.mejor.c.nombre);
    });
  }
  if (d.ejemplosConFigura.length) {
    Logger.log('    --- casos "con figura" que igual quedaron abajo (no es la fecha) ---');
    d.ejemplosConFigura.forEach(function (x) {
      Logger.log('      [%s] %s %s | %s → form a %s días: %s | mejor: %s (%s)',
                 x.ev ? 'ventana' : 'histor.', x.f.figura, fmtFecha_(x.f.fecha),
                 x.f.barrio || 'sin barrio', x.x, x.c.nombre, x.mejor.score, x.mejor.nivel);
    });
  }
}

/** El bloque 2f: las filas con un formulario de comuna coincidente, y por qué no entran. */
function _logComuna_(cc) {
  Logger.log('--- 2f. FILAS CON UN FORMULARIO DE COMUNA COINCIDENTE ---');
  Logger.log('  filas con algún formulario relevante de su misma comuna: %s', _dc_(cc.total));
  Logger.log('    entran (escribiría, con ese formulario) ............ %s',
             _dcp_(cc.escribiria, cc.total));
  Logger.log('    no entran, por motivo del mejor de esos formularios:');
  Object.keys(cc.motivos).sort().forEach(function (m) {
    Logger.log('      %s: %s', m, _dcp_(cc.motivos[m], cc.total));
  });
  Logger.log('  Con figura + comuna y la fecha a ±%s, el score es 1,00. Si no entran, el motivo',
             TOLERANCIA_REPROGRAMACION_DIAS);
  Logger.log('  de arriba dice cuál de las tres cosas falta: figura, fecha u otro candidato.');
  if (cc.ejemplos.length) {
    Logger.log('  --- los %s primeros ---', cc.ejemplos.length);
    cc.ejemplos.forEach(function (x) {
      Logger.log('    [%s] %s ← %s', x.ev ? 'ventana' : 'histor.', x.f.clave, x.sc.c.nombre);
      Logger.log('        %s | %s días | score %s (%s) | fila: %s%s', x.motivo,
                 x.sc.dist === null ? '-' : x.sc.dist, x.sc.score, x.sc.nivel, x.veredicto,
                 x.rmotivo ? ' / ' + x.rmotivo : '');
      if (x.ganador) {
        Logger.log('        le ganó (score %s, %s días): %s', x.ganador.score, x.ganador.dist,
                   x.ganador.c.nombre);
      }
    });
  }
}

/** El bloque 2e del log. Ver `medirEjes_`. */
function _logEjes_(m) {
  Logger.log('--- 2e. EL EJE GEOGRÁFICO (temáticas sin barrio ni comuna) ---');
  Logger.log('  EJE_COMO_UBICACION = %s  (peso si se enciende: %s; un eje distinto DESCALIFICA)',
             EJE_COMO_UBICACION, PESOS_MATCH.ejeSinComuna);

  // a) ¿Zona == eje?
  Logger.log('  a) Comunas, columna %s: encabezado "%s"', COMUNAS_COL_ZONA,
             m.encabezadoZona || '(la tabla no llega a esa columna)');
  const zonas = Object.keys(m.porZona).sort();
  let zonasConEje = 0;
  zonas.forEach(function (z) {
    const x = m.porZona[z];
    if (x.eje) zonasConEje++;
    Logger.log('     %s  → eje %s | comunas %s | %s barrios: %s', z, x.eje || '(ninguno)',
               Object.keys(x.comunas).sort(function (p, q) { return p - q; }).join(',') || '-',
               x.barrios.length, x.barrios.join(', '));
  });
  if (!zonas.length || zonasConEje === 0) {
    Logger.log('  >>> La Zona de Comunas NO nombra ningún eje. El mapeo eje → comunas no existe en');
    Logger.log('      el proyecto: hay que escribirlo a mano. Mirar el punto b) para armarlo.');
  } else if (zonasConEje < zonas.length) {
    Logger.log('  >>> %s de %s valores de Zona nombran un eje. Los otros quedan sin evaluar.',
               zonasConEje, zonas.length);
  } else {
    Logger.log('  >>> Todos los valores de Zona nombran un eje. Si los barrios de cada uno se ven');
    Logger.log('      bien, el mapeo está y se puede encender el flag. CONFIRMARLO mirando la lista.');
  }

  // b) formularios con eje
  Logger.log('  b) formularios con eje ............ %s', _dc_(m.conEje));
  Object.keys(m.porForma).sort().forEach(function (k) {
    Logger.log('       %s: %s', k, _dc_(m.porForma[k]));
  });
  m.desconocidos.forEach(function (d) {
    Logger.log('     eje no reconocido "%s" | %s', d.forma, d.nombre);
  });
  Logger.log('     pares figura + fecha ±%s contra filas del destino: %s',
             VENTANA_EMPAREJAR_DIAS, _dc_(m.pares.total));
  Logger.log('       el eje coincide ...... %s', _dcp_(m.pares.coincide, m.pares.total));
  Logger.log('       el eje DESCARTARÍA ... %s', _dcp_(m.pares.descarta, m.pares.total));
  Logger.log('       no evaluable ......... %s  (el barrio del destino no tiene zona con eje)',
             _dcp_(m.pares.noEvaluable, m.pares.total));
  Logger.log('     cruce eje del formulario × zona del barrio del destino (para confirmar el mapeo):');
  Object.keys(m.cruce).sort().forEach(function (k) {
    Logger.log('       %s: %s', k, m.cruce[k]);
  });

  const lim = 30;
  Logger.log('     --- %s formularios con eje, con sus filas candidatas (primeros %s) ---',
             m.detalle.length, lim);
  m.detalle.slice(0, lim).forEach(function (d) {
    Logger.log('     [%s] B fila %s | %s | %s | %s', d.ev ? 'ventana' : 'histor.', d.c.fila,
               d.c.eje.tipo === 'eje' ? 'Eje ' + d.c.eje.eje : d.c.eje.forma,
               fmtFecha_(d.c.det.mejor) || 'sin fecha', d.c.nombre);
    if (!d.filas.length) Logger.log('         (ninguna fila de la figura a ±%s días)',
                                    VENTANA_EMPAREJAR_DIAS);
    d.filas.forEach(function (x) {
      Logger.log('         fila %s  %s días  %s | comuna %s | zona %s → %s', x.fila, x.dist,
                 x.barrio || 'sin barrio', x.comuna == null ? '-' : x.comuna,
                 x.zona || '-', x.veredicto);
    });
  });

  // c) temáticos: ¿hay alguna fila cerca?
  const t = m.tem;
  Logger.log('  c) formularios temáticos .......... %s', _dc_(t.total));
  Logger.log('     con alguna fila de su figura a ±%s días: %s', DIAS_TEMATICA_CERCANA,
             _dcp_(t.conCercana, t.total));
  Logger.log('     SIN NINGUNA ....................... %s',
             _dc_({ v: t.total.v - t.conCercana.v, t: t.total.t - t.conCercana.t }));
  if (t.huerfanos.length) {
    Logger.log('  >>> Esos no tienen reunión en el destino a ±%s días: son HUÉRFANOS REALES.',
               DIAS_TEMATICA_CERCANA);
    Logger.log('      Ningún peso de ubicación los rescata. Es una conversación con quien carga');
    Logger.log('      los formularios o el destino, no un problema de puntaje:');
    t.huerfanos.slice(0, 40).forEach(function (h) {
      Logger.log('       [%s] B fila %s | %s | ins=%s | %s', h.ev ? 'ventana' : 'histor.',
                 h.c.fila, fmtFecha_(h.c.det.mejor) || 'sin fecha', h.c.inscriptos, h.c.nombre);
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
/**
 * Una fila del grupo bajo: su desvío real en días, y **qué población es**.
 *
 *   cerca_con_figura   hay un formulario de su figura a ±tolerancia. Si igual quedó abajo, lo
 *                      que falla no es la fecha: mirar ubicación u hora.
 *   cerca_sin_figura   el único formulario cercano es uno **donde no se reconoció ninguna
 *                      figura**. Hipótesis: es el suyo, y `figurasEnTexto_` no encontró el
 *                      nombre (variante de escritura, sólo el apellido). Sin figura, un
 *                      formulario lejano que sí la nombra le gana el lugar de mejor candidato.
 *   nada_cerca         no hay ningún formulario a ±tolerancia. Es la otra población: el
 *                      formulario no está en `B`, o está con una fecha que no es la suya.
 */
function _desvioBajo_(d, f, mejor, vivos, ev) {
  const k = mejor.dist === null ? 'sin fecha' : (mejor.dist > 21 ? '>21' : String(mejor.dist));
  if (!d.porDia[k]) d.porDia[k] = contador_();
  sumar_(d.porDia[k], ev);

  const tol = TOLERANCIA_REPROGRAMACION_DIAS;
  const figNorm = normalizeText_(f.figura);
  let conFig = null, sinFig = null;
  for (let j = 0; j < vivos.length; j++) {
    const c = vivos[j];
    const x = distanciaFecha_(f.fecha, c.det);
    if (x === null || x > tol) continue;
    if (c.figurasNorm.indexOf(figNorm) !== -1) {
      if (!conFig || x < conFig.x) conFig = { c: c, x: x };
    } else if (!c.figurasNorm.length) {
      if (!sinFig || x < sinFig.x) sinFig = { c: c, x: x };
    }
  }

  if (conFig) {
    sumar_(d.cercaConFigura, ev);
    if (d.ejemplosConFigura.length < 10) {
      d.ejemplosConFigura.push({ f: f, c: conFig.c, x: conFig.x, mejor: mejor, ev: ev });
    }
  } else if (sinFig) {
    sumar_(d.cercaSinFigura, ev);
    if (d.ejemplosSinFigura.length < 15) {
      d.ejemplosSinFigura.push({ f: f, c: sinFig.c, x: sinFig.x, mejor: mejor, ev: ev });
    }
  } else {
    sumar_(d.nadaCerca, ev);
  }
}

/**
 * Filas del destino con algún formulario **de comuna coincidente** (comuna del texto == comuna
 * del barrio del destino) que además sea relevante: misma figura o a ±7 días. ¿Entró? Si no,
 * por qué.
 *
 * Se clasifica el de esos formularios **más cercano en fecha**, no el de mejor score: el de
 * mejor score puede ser uno lejano que sí nombra la figura, y entonces el motivo diría "fecha
 * lejos" cuando lo que pasó es que el cercano —probablemente el suyo— no tenía la figura.
 */
function _casoComuna_(cc, f, r, vivos, comunas, ev) {
  const bDest = normalizeText_(f.barrio);
  const cDest = bDest ? comunas.get(bDest) : null;
  if (cDest == null) return;

  let best = null;
  for (let j = 0; j < vivos.length; j++) {
    const c = vivos[j];
    if (c.comuna == null || c.comuna !== cDest) continue;
    const sc = puntuar_(f, c, comunas);
    if (!sc.relevante) continue;
    const d = sc.dist === null ? Infinity : sc.dist;
    const dBest = best ? (best.dist === null ? Infinity : best.dist) : Infinity;
    if (!best || d < dBest || (d === dBest && sc.score > best.score)) best = sc;
  }
  if (!best) return;

  sumar_(cc.total, ev);
  const entro = r.veredicto === 'escribiria' && r.mejor && r.mejor.c === best.c;
  if (entro) { sumar_(cc.escribiria, ev); return; }

  let motivo;
  if (best.perdido.figura > 0) motivo = 'figura_no_reconocida_en_el_formulario';
  else if (best.dist === null) motivo = 'formulario_sin_fecha';
  else if (best.dist > TOLERANCIA_REPROGRAMACION_DIAS) {
    motivo = best.dist <= 7 ? 'fecha_a_4_7_dias' : 'fecha_a_mas_de_7_dias';
  } else if (r.mejor && r.mejor.c !== best.c) motivo = 'gano_otro_candidato';
  else motivo = r.motivo || 'otro';

  if (!cc.motivos[motivo]) cc.motivos[motivo] = contador_();
  sumar_(cc.motivos[motivo], ev);
  if (cc.ejemplos.length < 25) {
    cc.ejemplos.push({ f: f, sc: best, motivo: motivo, ev: ev,
                       ganador: (r.mejor && r.mejor.c !== best.c) ? r.mejor : null,
                       veredicto: r.veredicto, rmotivo: r.motivo });
  }
}

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
   * Cuatro vías, en orden de especificidad: **barrio, comuna, eje, evento**. Es una sola señal
   * con cuatro formas de evaluarse, no cuatro señales: la que aplique ocupa el lugar en el
   * denominador y las otras no existen.
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
  } else if (EJE_COMO_UBICACION && c.eje && c.eje.tipo === 'eje' && ejeDeBarrio_(f.barrio)) {
    /*
     * El eje: un eje contiene varias comunas, así que confirma menos (0,10) — pero un eje
     * distinto **descalifica** igual que una comuna distinta. `Eje Sur` contra un barrio del
     * norte no es evidencia débil: es otra reunión. Ver `EJE_COMO_UBICACION` en 00_Config.js.
     *
     * Sólo `tipo === 'eje'`. Un `Eje <algo>` que no está en `EJES_CONOCIDOS` no entra.
     */
    pesoUbic = PESOS_MATCH.ejeSinComuna;
    alcanzable += pesoUbic;
    if (ejeDeBarrio_(f.barrio) === c.eje.eje) { sUbic = pesoUbic; senales.push('eje'); }
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
   * **figura Y (fecha cercana O comuna [O eje])**.
   *
   * El `EVENTO` estuvo acá como tercera vía y se sacó: coincide por subcadena con 718 de 802
   * filas —es una categoría ("Encuentro con Vecinos"), no un identificador— y subió la densidad
   * de 2,6 a 8,2 pares por fila. Ver `EVENTO_COMO_UBICACION` en 00_Config.js.
   *
   * El eje entra cuando se confirme el mapeo (`EJE_COMO_UBICACION`): mismo eje que el barrio del
   * destino. Sigue siendo **Y** en la figura, que es lo que evitó los 1.883 pares.
   */
  const distOk   = (dist !== null && dist <= VENTANA_EMPAREJAR_DIAS);
  const comunaOk = (c.comuna != null && cDest != null && cDest === c.comuna);
  const ejeOk    = EJE_COMO_UBICACION && !!(c.eje && c.eje.tipo === 'eje' &&
                   ejeDeBarrio_(f.barrio) === c.eje.eje);
  const proponible = (sFig > 0) && (distOk || comunaOk || ejeOk);

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
      eje: detectEje_(limpio),
      tematico: esFormularioTematico_(limpio),
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
