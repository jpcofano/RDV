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
 * **`false` desde el 02/10, por decisión del usuario**, con el backup hecho (docs/ESTADO.md, 1b;
 * docs/backup.md §8) y la línea de base de azules anotada en 00_Config.js.
 *
 * Con `false`, `upsertDestino()` ESCRIBE en el destino (siempre por `setSiDelSistema_`). Los
 * pasos de `99_Correr.js` siguen sin escribir: `paso2_upsertEnSeco()` fuerza la corrida en seco.
 * Para frenar: volver a `true` y `clasp push` (docs/backup.md §8.2).
 */
const DRY_RUN = false;

// ===================== Puntos de entrada =====================

/** Corre el upsert entero. Respeta `DRY_RUN`. */
function upsertDestino() {
  return _correrUpsert_(DRY_RUN);
}

/** Corrida en seco explícita, sin importar cómo esté `DRY_RUN`. Es la que calibra. */
function correrEnSeco() {
  return _correrUpsert_(true);
}

/**
 * **Completar el historial** (paso 22, decisión del usuario del 03/10): el mismo upsert, UNA VEZ al pasar
 * al destino real, sobre TODAS las filas —sin el límite de DIAS_ACTIVOS, sólo para esta corrida: la
 * constante no se toca—. Las mismas reglas: sólo celda vacía, invariante sobre todo el destino, traza y
 * COLOR_SISTEMA, LockService, REGISTRO_UPSERT (alcance "historial"). Asistentes y STATUS también en las
 * filas viejas. Respeta DRY_RUN.
 *
 *   - **reanudable**: si se corta por tiempo, se vuelve a correr y sigue (las filas ya escritas entran por
 *     RDV_UID y sólo se completan sus celdas vacías). El log dice cuántas filas faltan;
 *   - **lo viejo que no se resuelve solo** (REVISAR_MATCH o SIN_MATCH de más de DIAS_ACTIVOS días) NO va a
 *     las fichas: va a HISTORICO_SIN_RESOLVER, sólo informativa. Las fichas siguen con los últimos 30
 *     días. SIN_MATCH y EMPAREJAR_MANUAL no se reescriben en esta corrida (las regenera la próxima normal).
 *
 * Después, el modo normal: una corrida normal no escribe nada en las filas viejas (están completas o
 * cerradas).
 */
function completarHistorial() {
  return _correrUpsert_(DRY_RUN, { historial: true });
}

/** Ídem, en seco: calcula, loguea y escribe sólo las solapas de la intermedia. No toca el destino. */
function completarHistorialEnSeco() {
  return _correrUpsert_(true, { historial: true });
}

/*
 * Un entry point por reporte. Recalculan y escriben **sólo el suyo**.
 *
 * Existen porque una escritura que falla no tiene por qué obligar a rehacer las otras dos. El
 * cálculo tarda 4 segundos y es determinista; lo frágil es el servicio de Sheets.
 */
/**
 * La calibración (03/10): el plan sobre TODO el historial (`{ historial: true }`), sólo al log. El upsert
 * trabaja sobre las filas activas (DIAS_ACTIVOS); los bloques de calibración (el valle, la autopsia, la
 * comuna, los ejes) se leen sobre la ventana de análisis (VENTANA_ANALISIS_DESDE), que no cambió.
 * No escribe nada, ni siquiera los reportes.
 */
function calibrarHistorial() {
  const t0 = new Date();
  Logger.log('=== calibrarHistorial — todo el historial, sólo al log: no escribe nada ===');
  const plan = calcularPlan_(true, null, { historial: true });
  logResumen_(plan);
  Logger.log('tiempo de corrida: %s s', ((new Date() - t0) / 1000).toFixed(1));
  return plan.res;
}

function soloRevisarMatch()    { return _soloUno_(RDV_HOJA_REVISAR); }
function soloEmparejarManual() { return _soloUno_(RDV_HOJA_EMPAREJAR); }
function soloSinMatch()        { return _soloUno_(RDV_HOJA_SIN_MATCH); }

function _soloUno_(cual) {
  const plan = calcularPlan_(true);
  logResumen_(plan);
  guardarElecciones_(plan.elecciones, plan.eleccionesAp, true, false);
  marcarEleccionesEnReportes_(plan);
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
 * **Ya corrió (25/09 20:18) y cerró la pregunta:** `EVITA` 0 | 0, `PIERDE` 18 | 41. La limpieza
 * salió de `figurasEnTexto_`. Queda como registro, y se puede rehacer: sigue midiendo lo mismo
 * porque `compararLimpiezaPrefijo_` no pasa por `figurasEnTexto_`.
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
    if (!g.has(clave)) g.set(clave, { n: contador_(), ejV: [], ejH: [] });
    const x = g.get(clave);
    sumar_(x.n, ev);
    // Los ejemplos de la ventana van primero: es la población que decide. Por orden de fila,
    // los primeros salían todos históricos.
    const ej = ev ? x.ejV : x.ejH;
    if (ej.length < 3) ej.push({ ev: ev, fila: c.fila, nombre: c.nombre });
  });

  Logger.log('=== medirFiguraEnPrefijo — sólo lectura, no escribe nada ===');
  Logger.log('VENTANA: %s en ventana / %s formularios vivos de B | corte: %s (%s)',
             base.v, base.t, fmtFecha_(inicioVentanaAnalisis_()), descVentanaAnalisis_());
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
      e[1].ejV.concat(e[1].ejH).slice(0, 3).forEach(function (x) {
        Logger.log('       [%s] B fila %s | %s', x.ev ? 'ventana' : 'histor.', x.fila, x.nombre);
      });
    });
    if (orden.length > tope) Logger.log('  (%s formas más, no listadas)', orden.length - tope);
  });

  return { base: base, clases: cnt };
}

// ===================== Medición: los formularios que no nombran a nadie =====================

/**
 * **Sólo lectura, sólo log.** Mide el **tamaño** de un cambio posible, sin hacerlo.
 *
 * Desde 09/2026 hay un formato nuevo —`VÍNCULO CIUDADANO - Encuentro con vecinos sobre Seguridad
 * - Comuna X - d/m`— que **no nombra ninguna figura** (CLAUDE.md 3.3). Las filas del destino
 * calzan por comuna + fecha, pero esos formularios pierden porque la figura **siempre** entra al
 * denominador de `puntuar_`: sin figura, el techo es fecha + comuna sobre figura + fecha + comuna.
 *
 * Tres preguntas, sin cambiar pesos ni puertas:
 *
 *   1. ¿Cuántos formularios vivos no nombran a nadie, y de qué forma son?
 *   2. Para cada uno, ¿cuántas filas del destino de la MISMA comuna (barrio → comuna) hay a 0 días
 *      y a ±3? Exactamente 1 es un match limpio; 2+ es ambiguo; 0 es huérfano.
 *   3. La otra cara: si la figura NO contara en el denominador para estos formularios, ¿cuántas
 *      filas que HOY se escriben con otro formulario pasarían a tener un empate o un rival?
 *
 * Recalcula el plan completo (`calcularPlan_`, sin escribir reportes) para tener el veredicto de
 * cada fila. La simulación del punto 3 es `obtenido / (alcanzable − figura)` sobre el mismo
 * `puntuar_`: no se toca la función.
 */
function medirFormulariosSinFigura() {
  Logger.log('=== medirFormulariosSinFigura — sólo lectura, no escribe nada ===');
  const plan = calcularPlan_(true, null, { historial: true });
  const dest = plan.dest, comunas = plan.comunas, porFila = plan.porFila;
  const vivos = plan.cands.vivos;
  const tol = TOLERANCIA_REPROGRAMACION_DIAS;

  const sinFig = vivos.filter(function (c) { return !c.figurasNorm.length; });
  const esSinFig = {};
  sinFig.forEach(function (c) { esSinFig[c.fila] = true; });

  const base = contador_(), total = contador_(), conComuna = contador_();
  vivos.forEach(function (c) { sumar_(base, enVentanaAnalisis_(c.det && c.det.mejor)); });

  // --- 1. por forma ---
  const formas = new Map();
  // --- 2. candidatas de su misma comuna ---
  const k0 = { uno: contador_(), varias: contador_(), ninguna: contador_() };
  const k3 = { uno: contador_(), varias: contador_(), ninguna: contador_() };
  const filasCand = {};                         // fila del destino → true (sin repetir)
  const ejV = [], ejH = [];

  sinFig.forEach(function (c) {
    const ev = enVentanaAnalisis_(c.det && c.det.mejor);
    sumar_(total, ev);

    const forma = _formaFormulario_(c.nombre);
    if (!formas.has(forma)) formas.set(forma, { n: contador_(), ejV: null, ejH: null });
    const g = formas.get(forma);
    sumar_(g.n, ev);
    if (ev && !g.ejV) g.ejV = c.nombre;
    if (!ev && !g.ejH) g.ejH = c.nombre;

    if (c.comuna == null) return;               // sin comuna no hay contra qué calzar
    sumar_(conComuna, ev);

    const a0 = [], a3 = [];
    for (let j = 0; j < dest.filas.length; j++) {
      const f = dest.filas[j];
      const cDest = f.barrio ? comunas.get(normalizeText_(f.barrio)) : null;
      if (cDest == null || cDest !== c.comuna) continue;
      const d = distanciaFecha_(f.fecha, c.det);
      if (d === null || d > tol) continue;
      a3.push({ f: f, d: d });
      if (d === 0) a0.push({ f: f, d: d });
    }
    sumar_(a0.length === 0 ? k0.ninguna : a0.length === 1 ? k0.uno : k0.varias, ev);
    sumar_(a3.length === 0 ? k3.ninguna : a3.length === 1 ? k3.uno : k3.varias, ev);
    a3.forEach(function (x) { filasCand[x.f.fila] = { f: x.f, ev: enVentanaAnalisis_(x.f.fecha) }; });

    const lista = ev ? ejV : ejH;
    if (lista.length < 20) lista.push({ c: c, a3: a3 });
  });

  // Veredicto HOY de las filas que son candidatas de algún formulario sin figura.
  const verCand = {};
  Object.keys(filasCand).forEach(function (k) {
    const v = (porFila[k] && porFila[k].veredicto) || '?';
    if (!verCand[v]) verCand[v] = contador_();
    sumar_(verCand[v], filasCand[k].ev);
  });

  // --- 3. la otra cara: el costo ---
  const simular = function (sc) {
    const alc = sc.alcanzableBase - PESOS_MATCH.figura;   // el de antes de la regla, sin restarla dos veces
    return alc > 0 ? redondear_(sc.absoluto / alc) : 0;
  };
  const costo = { escritas: contador_(), empate: contador_(), rival: contador_(),
                  sinCambio: contador_(), ejemplos: [] };
  const benef = { noEscritas: contador_(), limpio: contador_(), conRival: contador_(),
                  nada: contador_() };

  for (let j = 0; j < dest.filas.length; j++) {
    const f = dest.filas[j];
    const pf = porFila[f.fila];
    if (!pf || pf.veredicto === 'futura' || pf.veredicto === 'rdv_uid') continue;
    const ev = enVentanaAnalisis_(f.fecha);

    // El mejor formulario sin figura para esta fila, con la figura fuera del denominador.
    let mejorSF = null;
    for (let i = 0; i < sinFig.length; i++) {
      const c = sinFig[i];
      const d = distanciaFecha_(f.fecha, c.det);
      if (d === null || d > BANDAS_FECHA[BANDAS_FECHA.length - 1].dias) continue;  // relevancia
      const sc = puntuar_(f, c, comunas);
      if (!sc.relevante || sc.desacuerdo) continue;
      const s = simular(sc);
      if (!mejorSF || s > mejorSF.s) mejorSF = { c: c, s: s, d: d };
    }

    if (pf.veredicto === 'escribiria') {
      sumar_(costo.escritas, ev);
      if (!mejorSF || (pf.cand && esSinFig[pf.cand.fila])) { sumar_(costo.sinCambio, ev); continue; }
      const sHoy = pf.score;
      if (mejorSF.s >= sHoy) {
        sumar_(costo.empate, ev);
      } else if (sHoy - mejorSF.s < MARGEN_MINIMO) {
        sumar_(costo.rival, ev);
      } else {
        sumar_(costo.sinCambio, ev); continue;
      }
      if (costo.ejemplos.length < 15) {
        costo.ejemplos.push({ f: f, ev: ev, hoy: pf.cand, sHoy: sHoy, sf: mejorSF });
      }
    } else {
      sumar_(benef.noEscritas, ev);
      if (!mejorSF || mejorSF.s < UMBRAL_MATCH) { sumar_(benef.nada, ev); continue; }
      // El rival es el mejor de hoy, salvo que el mejor de hoy SEA este formulario sin figura:
      // entonces el rival es el segundo.
      const esElMismo = pf.cand && pf.cand.fila === mejorSF.c.fila;
      const rival = esElMismo ? (pf.segundo || 0) : (pf.score == null ? 0 : pf.score);
      sumar_(mejorSF.s - rival >= MARGEN_MINIMO ? benef.limpio : benef.conRival, ev);
    }
  }

  // ===================== el log =====================
  Logger.log('VENTANA: %s en ventana / %s formularios vivos | corte: %s (%s)', base.v, base.t,
             fmtFecha_(inicioVentanaAnalisis_()), descVentanaAnalisis_());
  Logger.log('  Se lee [ventana | total]. Decide la ventana.');

  Logger.log('--- 1. formularios que no nombran NINGUNA figura ---');
  Logger.log('  sin figura .................. %s', _dcp_(total, base));
  Logger.log('    con comuna en el nombre ... %s', _dcp_(conComuna, total));
  Logger.log('  por forma (comuna → "comuna #", fecha → "d/m"; top 15):');
  Array.from(formas.entries()).sort(function (a, b) { return b[1].n.t - a[1].n.t; })
    .slice(0, 15).forEach(function (e) {
      Logger.log('    %s  %s', _dc_(e[1].n), e[0]);
      Logger.log('         ej.: %s', e[1].ejV || e[1].ejH);
    });
  if (formas.size > 15) Logger.log('    (%s formas más)', formas.size - 15);

  Logger.log('--- 2. filas del destino de la MISMA comuna (vía barrio → comuna) ---');
  Logger.log('  (sobre los %s | %s formularios sin figura CON comuna)', conComuna.v, conComuna.t);
  Logger.log('                       a 0 días          a ±%s días', tol);
  Logger.log('    exactamente 1 ... %s      %s', _dc_(k0.uno), _dc_(k3.uno));
  Logger.log('    2 o más ......... %s      %s', _dc_(k0.varias), _dc_(k3.varias));
  Logger.log('    ninguna ......... %s      %s', _dc_(k0.ninguna), _dc_(k3.ninguna));
  Logger.log('  veredicto HOY de esas filas (misma comuna, ±%s; cada fila una vez):', tol);
  Object.keys(verCand).sort().forEach(function (v) {
    Logger.log('    %s %s', _padD_(v, 14), _dc_(verCand[v]));
  });
  Logger.log('  --- ejemplos (ventana primero, hasta 20 de cada) ---');
  ejV.concat(ejH).forEach(function (x) {
    const ev = enVentanaAnalisis_(x.c.det && x.c.det.mejor);
    Logger.log('    [%s] B fila %s | comuna %s | %s | %s', ev ? 'ventana' : 'histor.', x.c.fila,
               x.c.comuna, fmtFecha_(x.c.det && x.c.det.mejor) || 'sin fecha', x.c.nombre);
    if (!x.a3.length) Logger.log('         (ninguna fila de esa comuna a ±%s)', tol);
    x.a3.forEach(function (y) {
      const pf = porFila[y.f.fila] || {};
      Logger.log('         %s días → fila %s | %s | %s | %s | hoy: %s%s', y.d, y.f.fila,
                 fmtFecha_(y.f.fecha), y.f.figura, y.f.barrio, pf.veredicto || '?',
                 pf.cand ? ' (mejor candidato: ' + (pf.cand.fila === x.c.fila ? 'ESTE formulario)' :
                                      'B fila ' + pf.cand.fila + ')') : '');
    });
  });

  Logger.log('--- 3. la otra cara: si la figura NO contara en el denominador para estos ---');
  Logger.log('  (simulado: obtenido / (alcanzable − %s) sobre el mismo puntuar_)', PESOS_MATCH.figura);
  Logger.log('  filas que HOY se escriben ............. %s', _dc_(costo.escritas));
  Logger.log('    un formulario sin figura las EMPATA o SUPERA ... %s', _dcp_(costo.empate, costo.escritas));
  Logger.log('    uno les deja margen < %s (→ REVISAR_MATCH) ... %s', MARGEN_MINIMO,
             _dcp_(costo.rival, costo.escritas));
  Logger.log('    sin cambio ..................................... %s',
             _dcp_(costo.sinCambio, costo.escritas));
  Logger.log('  filas que HOY NO se escriben .......... %s', _dc_(benef.noEscritas));
  Logger.log('    un formulario sin figura llegaría a %s con margen ... %s', UMBRAL_MATCH,
             _dcp_(benef.limpio, benef.noEscritas));
  Logger.log('    llegaría a %s pero con rival cerca ............. %s', UMBRAL_MATCH,
             _dcp_(benef.conRival, benef.noEscritas));
  Logger.log('    ninguno llega ...................................... %s',
             _dcp_(benef.nada, benef.noEscritas));
  if (costo.ejemplos.length) {
    Logger.log('  --- filas que hoy se escriben y tendrían empate o rival (hasta 15) ---');
    costo.ejemplos.forEach(function (x) {
      Logger.log('    [%s] %s | %s | %s', x.ev ? 'ventana' : 'histor.', fmtFecha_(x.f.fecha),
                 x.f.figura, x.f.barrio || 'sin barrio');
      Logger.log('         hoy (%s): %s', x.sHoy, x.hoy ? x.hoy.nombre : '?');
      Logger.log('         rival sin figura (%s simulado, %s días): %s', x.sf.s, x.sf.d, x.sf.c.nombre);
    });
  }

  Logger.log('  Qué NO dice esto:');
  Logger.log('   - NO es el resultado del cambio: es su TAMAÑO. No se tocó puntuar_, ni los pesos,');
  Logger.log('     ni las puertas. El resultado lo dice correr el paso 2 con el cambio hecho.');
  Logger.log('   - La simulación mueve sólo a los formularios sin figura; los demás puntúan igual.');
  Logger.log('   - "Exactamente 1" a 0 días es el caso limpio; "2 o más" son reuniones de la misma');
  Logger.log('     comuna el mismo día y necesitan otra señal, porque la figura no está.');
  Logger.log('   - Los formularios sin comuna en el nombre no entran en el punto 2: no hay con qué.');

  return { total: total, conComuna: conComuna, k0: k0, k3: k3, costo: costo, benef: benef };
}

/**
 * La forma de un nombre de formulario, para agrupar (CLAUDE.md §6, regla 1): normalizado, con la
 * comuna y la fecha reemplazadas por marcadores. Sólo para contar, no para matchear.
 */
function _formaFormulario_(nombre) {
  return normalizeText_(nombre)
    .replace(/\bcomuna\s*0?\d{1,2}(?:\s*(?:norte|sur|n|s))?\b/g, 'comuna #')
    .replace(/\bc0?\d{1,2}(?:n|s)?\b/g, 'comuna #')
    .replace(/\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?/g, 'd/m')
    .replace(/\s+/g, ' ').trim();
}

// ===================== Medición: variantes del cambio "sin figura" =====================

/**
 * **Sólo lectura, sólo log.** El paso 6 mostró que sacar la figura del denominador para los
 * formularios sin figura recupera la serie "sobre Seguridad - Comuna X", pero con un costo: filas
 * que hoy se escriben quedan empatadas o superadas. Dos causas vistas en el log: un formulario sin
 * figura **y sin ubicación** puntúa 1,0 con la fecha sola contra cualquier fila a ±3; y los rivales
 * entran por la tolerancia de ±3, cuando los objetivos están casi todos a 0 días.
 *
 * Mide variantes, con la **misma simulación** del paso 6 (`obtenido / (alcanzable − figura)`
 * sobre el mismo `puntuar_`, sin tocarlo):
 *
 *   0    el paso 6 tal cual: sin restricción (±7, cualquier ubicación salvo desacuerdo)
 *   A    ubicación COINCIDENTE obligatoria (barrio o comuna) + fecha ±3
 *   B    A + fecha exacta
 *   C    A + fecha ±1
 *   D-B  B + desempate
 *   D-C  C + desempate
 *
 * **Desempate, como se implementa:** un formulario sin figura no desplaza al ganador de hoy de
 * una fila si ese ganador nombra la figura de la fila —ni empate, ni superación, ni rival—. Contra
 * un candidato con figura que NO llega al umbral sí compite: si no, no rescataría nada.
 *
 * Filas objetivo: hoy SIN_MATCH con un formulario sin figura de su comuna a ±3
 * (`cercanosDeFila_`, el mismo criterio que el motivo `sin_formulario_propio`).
 */
function medirVariantesSinFigura() {
  Logger.log('=== medirVariantesSinFigura — sólo lectura, no escribe nada ===');
  const plan = calcularPlan_(true, null, { historial: true });
  const dest = plan.dest, comunas = plan.comunas, porFila = plan.porFila;
  const vivos = plan.cands.vivos;
  const sinFig = vivos.filter(function (c) { return !c.figurasNorm.length; });
  const esSinFig = {};
  sinFig.forEach(function (c) { esSinFig[c.fila] = true; });
  const simular = function (sc) {
    const alc = sc.alcanzableBase - PESOS_MATCH.figura;   // el de antes de la regla, sin restarla dos veces
    return alc > 0 ? redondear_(sc.absoluto / alc) : 0;
  };

  const okA = function (x) { return x.ubic && x.d <= 3; };
  const okB = function (x) { return x.ubic && x.d === 0; };
  const okC = function (x) { return x.ubic && x.d <= 1; };
  const V = [
    { k: '0',   nombre: 'paso 6 tal cual (±7, cualquier ubicación)', ok: function (x) { return x.d <= 7; } },
    { k: 'A',   nombre: 'ubicación coincidente + fecha ±3', ok: okA },
    { k: 'B',   nombre: 'A + fecha exacta', ok: okB },
    { k: 'C',   nombre: 'A + fecha ±1', ok: okC },
    { k: 'D-B', nombre: 'B + desempate', ok: okB, desempate: true },
    { k: 'D-C', nombre: 'C + desempate', ok: okC, desempate: true }
  ];
  V.forEach(function (v) {
    v.obj = { total: contador_(), llega: contador_(), conRival: contador_(),
              revision2: contador_(), noLlega: contador_() };
    v.costo = { escritas: contador_(), empate: contador_(), rival: contador_(),
                sinCambio: contador_() };
    v.ejCostoV = []; v.ejCostoH = []; v.ejRev2 = [];
  });

  for (let j = 0; j < dest.filas.length; j++) {
    const f = dest.filas[j];
    const pf = porFila[f.fila];
    if (!pf || pf.veredicto === 'futura' || pf.veredicto === 'rdv_uid') continue;
    const objetivo = pf.veredicto === 'SIN_MATCH' && !!cercanosDeFila_(f, vivos, comunas).sinFigMisma;
    const escrita = pf.veredicto === 'escribiria';
    if (!objetivo && !escrita) continue;
    const ev = enVentanaAnalisis_(f.fecha);

    // Los formularios sin figura que compiten por esta fila, con su score simulado.
    const lista = [];
    for (let i = 0; i < sinFig.length; i++) {
      const c = sinFig[i];
      const d = distanciaFecha_(f.fecha, c.det);
      if (d === null || d > 7) continue;
      const sc = puntuar_(f, c, comunas);
      if (!sc.relevante || sc.desacuerdo) continue;
      lista.push({ c: c, d: d, s: simular(sc), ubic: sc.evaluables.ubic && sc.perdido.ubic === 0 });
    }
    const figNorm = normalizeText_(f.figura);
    const ganadorNombra = !!(pf.cand && pf.cand.figurasNorm.indexOf(figNorm) !== -1);
    const ganadorEsSinFig = !!(pf.cand && esSinFig[pf.cand.fila]);

    V.forEach(function (v) {
      const el = lista.filter(v.ok).sort(function (a, b) { return b.s - a.s; });
      const s1 = el.length ? el[0].s : null, s2 = el.length > 1 ? el[1].s : null;

      if (objetivo) {
        sumar_(v.obj.total, ev);
        if (s1 === null || s1 < UMBRAL_MATCH) { sumar_(v.obj.noLlega, ev); return; }
        const rival = ganadorEsSinFig ? (pf.segundo || 0) : (pf.score || 0);
        if (s2 !== null && s1 - s2 < MARGEN_MINIMO) {
          sumar_(v.obj.revision2, ev);
          if (v.ejRev2.length < 8) v.ejRev2.push({ f: f, ev: ev, a: el[0], b: el[1] });
        } else if (s1 - rival < MARGEN_MINIMO) sumar_(v.obj.conRival, ev);
        else sumar_(v.obj.llega, ev);
        return;
      }

      // escrita: ¿el cambio le mete un empate o un rival?
      sumar_(v.costo.escritas, ev);
      if (ganadorEsSinFig || s1 === null || (v.desempate && ganadorNombra)) {
        sumar_(v.costo.sinCambio, ev); return;
      }
      let tipo = null;
      if (s1 >= pf.score) tipo = 'empate';
      else if (pf.score - s1 < MARGEN_MINIMO) tipo = 'rival';
      if (!tipo) { sumar_(v.costo.sinCambio, ev); return; }
      sumar_(v.costo[tipo], ev);
      const ej = ev ? v.ejCostoV : v.ejCostoH;
      if (ej.length < 10) ej.push({ f: f, ev: ev, tipo: tipo, hoy: pf.cand, sHoy: pf.score, sf: el[0] });
    });
  }

  // ===================== el log =====================
  Logger.log('VENTANA: corte %s (%s). Se lee [ventana | total].',
             fmtFecha_(inicioVentanaAnalisis_()), descVentanaAnalisis_());
  Logger.log('  formularios sin figura: %s | umbral %s, margen %s', sinFig.length, UMBRAL_MATCH,
             MARGEN_MINIMO);
  Logger.log('  Desempate (D): un sin figura no desplaza al ganador de hoy si ese ganador nombra');
  Logger.log('  la figura de la fila; contra un candidato con figura bajo el umbral, compite.');

  Logger.log('--- resumen por variante ---');
  V.forEach(function (v) {
    Logger.log('  [%s] %s', v.k, v.nombre);
    Logger.log('     objetivo (hoy SIN_MATCH, con sin figura de su comuna a ±3): %s', _dc_(v.obj.total));
    Logger.log('       llega a %s con margen ......... %s', UMBRAL_MATCH, _dcp_(v.obj.llega, v.obj.total));
    Logger.log('       llega, pero con rival ......... %s', _dcp_(v.obj.conRival, v.obj.total));
    Logger.log('       a revisión por 2+ formularios . %s', _dcp_(v.obj.revision2, v.obj.total));
    Logger.log('       no llega ...................... %s', _dcp_(v.obj.noLlega, v.obj.total));
    Logger.log('     COSTO sobre las %s que hoy se escriben:', _dc_(v.costo.escritas));
    Logger.log('       empatadas o superadas ......... %s', _dc_(v.costo.empate));
    Logger.log('       con rival (margen < %s) ...... %s', MARGEN_MINIMO, _dc_(v.costo.rival));
  });

  V.forEach(function (v) {
    const ej = v.ejCostoV.concat(v.ejCostoH);
    if (ej.length) {
      Logger.log('--- [%s] casos de COSTO (ventana primero, hasta 10 de cada) ---', v.k);
      ej.forEach(function (x) {
        Logger.log('    [%s] %s | %s | %s → %s', x.ev ? 'ventana' : 'histor.', fmtFecha_(x.f.fecha),
                   x.f.figura, x.f.barrio || 'sin barrio', x.tipo);
        Logger.log('         hoy (%s): %s', x.sHoy, x.hoy ? x.hoy.nombre : '?');
        Logger.log('         sin figura (%s simulado, %s días, ubicación %s): %s', x.sf.s, x.sf.d,
                   x.sf.ubic ? 'coincide' : 'no evaluable', x.sf.c.nombre);
      });
    }
    if (v.ejRev2.length) {
      Logger.log('--- [%s] a revisión por 2+ formularios (hasta 8) ---', v.k);
      v.ejRev2.forEach(function (x) {
        Logger.log('    [%s] %s | %s | %s', x.ev ? 'ventana' : 'histor.', fmtFecha_(x.f.fecha),
                   x.f.figura, x.f.barrio || 'sin barrio');
        [x.a, x.b].forEach(function (y) {
          Logger.log('         %s (%s días, ins=%s): %s', y.s, y.d, y.c.inscriptos, y.c.nombre);
        });
      });
    }
  });

  Logger.log('  Qué NO dice esto:');
  Logger.log('   - NO es el resultado de ninguna variante: es su TAMAÑO. No se tocó puntuar_, ni');
  Logger.log('     los pesos, ni las puertas. El resultado lo dice el paso 2 con la variante hecha.');
  Logger.log('   - Sólo se mueven los formularios sin figura; los demás puntúan igual que hoy.');
  Logger.log('   - Un formulario que nombra a la figura con otra grafía ("Gustavo Arengo") cuenta');
  Logger.log('     como "sin figura" acá: eso es un problema de reconocimiento, no de esta regla.');

  return V.map(function (v) { return { k: v.k, obj: v.obj, costo: v.costo }; });
}

// ===================== Evidencia: el orden compartido =====================

/**
 * Cuántas señales **evaluadas y coincidentes** tiene un par (figura, fecha, ubicación, hora). La
 * fecha coincide si puntúa pleno (dentro de TOLERANCIA_REPROGRAMACION_DIAS), no a ±7.
 */
function _senalesCoincidentes_(sc) {
  let n = 0;
  if (sc.nombraFigura) n++;
  if (sc.evaluables.fecha && sc.perdido.fecha === 0) n++;
  if (sc.evaluables.ubic && sc.perdido.ubic === 0) n++;
  if (sc.evaluables.hora && sc.perdido.hora === 0) n++;
  return n;
}

/**
 * **El orden por evidencia**, el mismo para todo lo que desempata: el paso 9 (entre formularios
 * que compiten por una fila) y la regla simulada de un formulario por fila (entre filas que
 * reclaman un formulario). Recibe pares `sc` y devuelve `{ ganador, porQue }`, o `ganador: null`
 * si ninguno es estrictamente mejor.
 *
 *   1) más señales evaluadas y coincidentes
 *   2) menor distancia en días
 *   3) más inscriptos DEL FORMULARIO (regla de negocio: de dos formularios de una misma reunión,
 *      el que casi no tiene inscriptos no se hizo). Nunca los del destino: ésos, en régimen, los
 *      escribe el propio sistema (CLAUDE.md 1).
 *
 * Gana sólo el estrictamente mejor en el primer criterio que lo distinga del último rival.
 */
function _desempatePorEvidencia_(lista) {
  const criterios = [
    { k: 'senales', val: _senalesCoincidentes_, mayor: true },
    { k: 'distancia', val: function (sc) { return sc.dist === null ? Infinity : sc.dist; },
      mayor: false },
    { k: 'inscriptos', val: function (sc) { return sc.c.inscriptos || 0; }, mayor: true }
  ];
  // 4) el eje, ÚLTIMO y sólo si exactamente uno coincide (con dos o ninguno, no decide nada).
  if (EJE_COMO_DESEMPATE) {
    criterios.push({ k: 'eje', val: function (sc) { return sc.ejeCoincide ? 1 : 0; }, mayor: true });
  }
  let quedan = lista.slice(), porQue = null;
  for (let i = 0; i < criterios.length && quedan.length > 1; i++) {
    const cr = criterios[i];
    const vals = quedan.map(cr.val);
    const mejorVal = cr.mayor ? Math.max.apply(null, vals) : Math.min.apply(null, vals);
    const siguen = quedan.filter(function (sc, j) { return vals[j] === mejorVal; });
    if (siguen.length < quedan.length && siguen.length === 1) porQue = cr.k;
    quedan = siguen;
  }
  return (quedan.length === 1 && porQue) ? { ganador: quedan[0], porQue: porQue }
                                        : { ganador: null, porQue: null };
}

function _nombreCriterio_(k) { return k === 'senales' ? 'señales' : k; }

/** Ventana primero, y adentro por fecha de la fila. */
function _ordenarPorFila_(l) {
  return l.slice().sort(function (a, b) {
    if (a.ev !== b.ev) return a.ev ? -1 : 1;
    return (a.f.fecha ? a.f.fecha.getTime() : 0) - (b.f.fecha ? b.f.fecha.getTime() : 0);
  });
}

function _descPar_(sc) {
  return _senalesCoincidentes_(sc) + ' señales (' + (sc.nivel || '-') + '), ' +
         (sc.dist === null ? '?' : sc.dist) + ' días, ins=' + (sc.c.inscriptos || 0) +
         ', score ' + sc.score + ' | ' + sc.c.nombre;
}

// ===================== Medición: desempate por evidencia =====================

/**
 * Las filas en REVISAR_MATCH por `margen_chico`, resueltas (o no) con el orden por evidencia sobre
 * sus contendientes (los que quedan a menos de MARGEN_MINIMO del mejor, según evaluarCandidatos_).
 * Sólo calcula; lo usan el paso 9 y el paso 10.
 */
function _resolverMargenChico_(plan) {
  const out = { total: contador_(), sigue: contador_(), mismo: contador_(), otro: contador_(),
                porCriterio: { senales: contador_(), distancia: contador_(),
                               inscriptos: contador_(), eje: contador_() },
                resueltos: [], siguen: [] };
  plan.dest.filas.forEach(function (f) {
    const pf = plan.porFila[f.fila];
    if (!pf || pf.motivo !== 'margen_chico' || !pf.contendientes) return;
    const ev = enVentanaAnalisis_(f.fecha);
    sumar_(out.total, ev);
    const d = _desempatePorEvidencia_(pf.contendientes);
    const x = { f: f, ev: ev, conts: pf.contendientes, hoy: pf.cand };
    if (d.ganador) {
      x.ganador = d.ganador; x.porQue = d.porQue;
      x.esElDeHoy = d.ganador.c === pf.cand;
      sumar_(out.porCriterio[d.porQue], ev);
      sumar_(x.esElDeHoy ? out.mismo : out.otro, ev);
      out.resueltos.push(x);
    } else {
      sumar_(out.sigue, ev);
      out.siguen.push(x);
    }
  });
  return out;
}

/**
 * **Sólo lectura, sólo log.** Muchas REVISAR_MATCH por `margen_chico` son de Jorge Macri con dos
 * candidatos a 1,0: el `"1 a 1"` —figura + fecha exacta + comuna— contra un temático
 * (`EJE Oeste/Norte`, `Primera Persona`) con figura + fecha a 1 día y la ubicación no evaluable.
 * **La normalización borra cuánta evidencia hay detrás.** Simula desempatar con
 * `_desempatePorEvidencia_` y lista todo para que una persona confirme el ganador.
 *
 * Corrió el 26/09 17:06: 37 de 38 resueltas (27 por señales, 10 por distancia). Desde entonces el
 * criterio 3 pasó de "inscriptos > 0" a "más inscriptos DEL FORMULARIO" (regla de negocio). **No
 * se implementa hasta ver el paso 10.**
 */
function medirDesempatePorEvidencia() {
  Logger.log('=== medirDesempatePorEvidencia — sólo lectura, no escribe nada ===');
  const plan = calcularPlan_(true, null, { historial: true });
  const r = _resolverMargenChico_(plan);

  Logger.log('VENTANA: corte %s (%s). Se lee [ventana | total].',
             fmtFecha_(inicioVentanaAnalisis_()), descVentanaAnalisis_());
  Logger.log('  orden: 1) señales evaluadas y coincidentes  2) menor distancia  3) MÁS inscriptos');
  Logger.log('  del FORMULARIO (nunca los del destino). Gana sólo el estrictamente mejor.');
  Logger.log('--- filas en REVISAR_MATCH por margen_chico: %s ---', _dc_(r.total));
  Logger.log('  se resolverían ............. %s',
             _dc_({ v: r.total.v - r.sigue.v, t: r.total.t - r.sigue.t }));
  Logger.log('    por señales .............. %s', _dc_(r.porCriterio.senales));
  Logger.log('    por distancia ............ %s', _dc_(r.porCriterio.distancia));
  Logger.log('    por inscriptos ........... %s', _dc_(r.porCriterio.inscriptos));
  Logger.log('    ganador = el mejor de hoy  %s | ganador = OTRO %s', _dc_(r.mismo), _dc_(r.otro));
  Logger.log('  siguen en revisión ......... %s', _dc_(r.sigue));

  Logger.log('--- RESUELTOS: confirmar a mano que el ganador es el correcto (ventana primero) ---');
  _ordenarPorFila_(r.resueltos).forEach(function (x) {
    Logger.log('  [%s] fila %s | %s | %s | %s → por %s | %s', x.ev ? 'ventana' : 'histor.',
               x.f.fila, fmtFecha_(x.f.fecha), x.f.figura, x.f.barrio || 'sin barrio',
               _nombreCriterio_(x.porQue), x.esElDeHoy ? 'el mejor de hoy' : 'OTRO');
    Logger.log('      GANA:  %s', _descPar_(x.ganador));
    x.conts.forEach(function (sc) {
      if (sc !== x.ganador) Logger.log('      rival: %s', _descPar_(sc));
    });
  });
  Logger.log('--- SIGUEN en revisión (empatan en los tres criterios) ---');
  _ordenarPorFila_(r.siguen).forEach(function (x) {
    Logger.log('  [%s] fila %s | %s | %s | %s', x.ev ? 'ventana' : 'histor.', x.f.fila,
               fmtFecha_(x.f.fecha), x.f.figura, x.f.barrio || 'sin barrio');
    x.conts.forEach(function (sc) { Logger.log('      %s', _descPar_(sc)); });
  });

  // Aparte 1: formularios con 0 inscriptos que hoy GANAN una fila.
  const ceroGana = [];
  plan.dest.filas.forEach(function (f) {
    const pf = plan.porFila[f.fila];
    if (pf && pf.veredicto === 'escribiria' && pf.cand && !(pf.cand.inscriptos > 0)) {
      ceroGana.push({ f: f, ev: enVentanaAnalisis_(f.fecha), c: pf.cand, score: pf.score });
    }
  });
  Logger.log('--- aparte: formularios con 0 inscriptos que HOY ganan una fila: %s ---',
             ceroGana.length);
  _ordenarPorFila_(ceroGana).forEach(function (x) {
    Logger.log('  [%s] fila %s | %s | %s | %s ← %s (score %s)', x.ev ? 'ventana' : 'histor.',
               x.f.fila, fmtFecha_(x.f.fecha), x.f.figura, x.f.barrio || 'sin barrio',
               x.c.nombre, x.score);
  });

  // Aparte 2: formularios "Genérico": no está claro que un genérico deba matchear.
  const esGen = function (c) { return /\bgenerico\b/.test(normalizeText_(c.nombre)); };
  const gen = [];
  plan.dest.filas.forEach(function (f) {
    const pf = plan.porFila[f.fila];
    if (!pf) return;
    const ev = enVentanaAnalisis_(f.fecha);
    if (pf.cand && esGen(pf.cand)) {
      gen.push({ f: f, ev: ev, c: pf.cand, como: 'gana (' + pf.veredicto + ')' });
    }
    (pf.contendientes || []).forEach(function (sc) {
      if (esGen(sc.c) && sc.c !== pf.cand) {
        gen.push({ f: f, ev: ev, c: sc.c, como: 'disputa (margen_chico)' });
      }
    });
  });
  Logger.log('--- aparte: formularios "Genérico" y las filas que ganan o disputan: %s ---',
             gen.length);
  _ordenarPorFila_(gen).forEach(function (x) {
    Logger.log('  [%s] fila %s | %s | %s | %s → %s: %s (ins=%s)', x.ev ? 'ventana' : 'histor.',
               x.f.fila, fmtFecha_(x.f.fecha), x.f.figura, x.f.barrio || 'sin barrio', x.como,
               x.c.nombre, x.c.inscriptos || 0);
  });
  Logger.log('  (los dos "aparte" sólo se listan: no se cambió nada)');

  Logger.log('  Qué NO dice esto:');
  Logger.log('   - Que el criterio sea el correcto: eso lo dice una persona mirando RESUELTOS, y');
  Logger.log('     el paso 10 contra los inscriptos que hoy tiene el destino.');
  Logger.log('   - "OTRO" son las filas donde el desempate le da la fila a un formulario que hoy no');
  Logger.log('     es el mejor por score: son las que más hay que mirar.');
  Logger.log('   - No mide los otros motivos de revisión (multi_figura, ubicacion_en_desacuerdo).');

  return { total: r.total, sigue: r.sigue, porCriterio: r.porCriterio, ceroGana: ceroGana.length,
           genericos: gen.length };
}

// ===================== El invariante: un formulario, una fila =====================

/**
 * **Chequeo del invariante, sobre el resultado final del plan** (bloque 0 del log). Tiene que dar 0.
 *
 * Desde el 02/10 cuenta por **grupo de gemelos** (mismo nombre y cierres a GEMELOS_MAX_DIAS o menos, regla 3), no por formulario: dos
 * filas con dos formularios distintos del mismo nombre también son un choque (la 309 y la 315 de la
 * copia). Cuentan las filas que se escribirían y las que ya tienen RDV_UID, aunque su traza sea
 * ambigua (en ese caso se sabe el grupo, no el formulario).
 */
function chequearFormularioUnico_(dest, vivos, comunas, porFila) {
  const porGrupo = new Map();
  dest.filas.forEach(function (f) {
    const pf = porFila[f.fila];
    if (!pf || (pf.veredicto !== 'escribiria' && pf.veredicto !== 'rdv_uid')) return;
    const g = pf.cand ? pf.cand.grupo : pf.grupo;
    if (!g) return;
    if (!porGrupo.has(g)) porGrupo.set(g, { c: pf.cand || null, filas: [] });
    const x = porGrupo.get(g);
    if (!x.c && pf.cand) x.c = pf.cand;
    x.filas.push(f);
  });
  const choques = [], formsV = contador_(), filasAfect = contador_();
  porGrupo.forEach(function (x, g) {
    if (x.filas.length < 2) return;
    const ev = x.filas.some(function (f) { return enVentanaAnalisis_(f.fecha); });
    sumar_(formsV, ev);
    x.filas.forEach(function (f) { sumar_(filasAfect, enVentanaAnalisis_(f.fecha)); });
    choques.push({ c: x.c || { nombre: g, inscriptos: '?' }, grupo: g, ev: ev,
                   pares: x.filas.map(function (f) { return { fila: f }; }) });
  });
  return { choques: choques, formularios: formsV, filas: filasAfect };
}

/**
 * **El invariante "un formulario, una fila", aplicado** (desde el 30/09; **por grupo de gemelos**
 * desde el 02/10). Va entre las dos vueltas de `calcularPlan_`: después del desempate por evidencia,
 * sobre todo el plan.
 *
 * El grupo de un formulario lo arma `marcarGemelos_`: mismo nombre y cierres a GEMELOS_MAX_DIAS o
 * menos son la misma reunión (regla 3), así que **una sola fila puede tener uno de ellos**. Si 2+ filas con
 * veredicto `escribiria` tienen formularios del mismo grupo (el mismo, o gemelos):
 *
 *   - se queda el grupo la fila con mejor evidencia (`_desempatePorEvidencia_`). Los inscriptos del
 *     DESTINO no entran;
 *   - una fila que tenía **un gemelo** del formulario que se quedó la otra → REVISAR_MATCH por
 *     `formulario_gemelo`;
 *   - una fila que tenía **el mismo** formulario se RE-EVALÚA sin él (umbral, margen, sin figura por
 *     ubicación, desempate). Si su nuevo mejor es **un gemelo** de ese formulario → `formulario_gemelo`
 *     (02/10: así la 309 se había quedado con el segundo "Clara Muzzio 07/11 Villa Pueyrredon"); si es
 *     otro formulario, lo toma; si no queda un ganador claro → `formulario_compartido`;
 *   - si ninguna fila es estrictamente mejor: `formulario_compartido` (mismo formulario) o
 *     `formulario_gemelo` (gemelos distintos);
 *   - se repite hasta que no quede ningún choque o se llegue a MAX_VUELTAS_FORMULARIO_UNICO.
 *
 * Un grupo que ya tiene dueño por `RDV_UID` (`tomadosGrupo`) no lo gana ninguna otra fila: si pedía
 * el mismo formulario del dueño, se re-evalúa sin él; si pedía un gemelo, o la traza del dueño es
 * ambigua, `formulario_gemelo`. Modifica `evals[i].r`; devuelve los casos para el log.
 */
function aplicarFormularioUnico_(evals, vivos, comunas, tomadosGrupo) {
  const inicial = new Map();
  evals.forEach(function (x) {
    inicial.set(x, (x.r.veredicto === 'escribiria' && x.r.mejor) ? x.r.mejor.c : null);
  });
  const excluidos = new Map();          // eval → Set de formularios que ya no puede usar
  const involucradas = new Set();
  const casos = [];
  let vueltas = 0, tope = false;

  const aRevisar = function (x, rNuevo, motivo) {
    const base = (rNuevo && rNuevo.mejor) ? rNuevo : x.r;
    x.r = { mejor: base.mejor, segundoScore: base.segundoScore || 0, margen: base.margen || 0,
            veredicto: 'REVISAR_MATCH', motivo: motivo || 'formulario_compartido', contendientes: null };
  };

  for (;;) {
    const porGrupo = new Map();
    evals.forEach(function (x) {
      if (x.r.veredicto !== 'escribiria' || !x.r.mejor) return;
      const g = x.r.mejor.c.grupo;
      if (!porGrupo.has(g)) porGrupo.set(g, []);
      porGrupo.get(g).push(x);
    });
    const choques = [];
    porGrupo.forEach(function (lista, g) {
      if (lista.length >= 2 || tomadosGrupo.has(g)) choques.push({ g: g, lista: lista });
    });
    if (!choques.length) break;

    if (vueltas >= MAX_VUELTAS_FORMULARIO_UNICO) {
      tope = true;
      choques.forEach(function (ch) {
        ch.lista.forEach(function (x) { involucradas.add(x); aRevisar(x, null, 'formulario_compartido'); });
      });
      break;
    }
    vueltas++;

    choques.forEach(function (ch) {
      const lista = ch.lista, duenio = tomadosGrupo.get(ch.g) || null;
      let ganador = null, porQue = null;
      if (!duenio) {
        const pares = lista.map(function (x) { return x.r.mejor; });
        const d = _desempatePorEvidencia_(pares);
        if (d.ganador) { ganador = lista[pares.indexOf(d.ganador)]; porQue = d.porQue; }
      }
      // El formulario que se queda el grupo: el del ganador, o el del dueño por RDV_UID (null si su
      // traza es ambigua: entonces cualquier formulario del grupo es un gemelo de lo que ya tiene).
      const delGrupo = ganador ? ganador.r.mejor.c : (duenio ? duenio.c : null);
      const todosElMismo = lista.every(function (x) { return x.r.mejor.c === lista[0].r.mejor.c; });
      const caso = { c: delGrupo || lista[0].r.mejor.c, grupo: ch.g, vuelta: vueltas, porUid: !!duenio,
                     filaUid: duenio ? duenio.fila : null, porQue: porQue, pares: [], ganador: null,
                     gemelos: !todosElMismo || !!(duenio && lista.some(function (x) { return x.r.mejor.c !== duenio.c; })),
                     ev: lista.some(function (x) { return x.ev; }) };
      lista.forEach(function (x) {
        involucradas.add(x);
        const sc = x.r.mejor;
        sc.fila = x.f;
        caso.pares.push(sc);
        if (x === ganador) { caso.ganador = sc; return; }
        if (!duenio && !ganador) {                    // nadie es estrictamente mejor
          aRevisar(x, null, todosElMismo ? 'formulario_compartido' : 'formulario_gemelo');
          return;
        }
        const c = sc.c;
        if (c !== delGrupo) { aRevisar(x, null, 'formulario_gemelo'); return; }   // tenía un gemelo
        const s = excluidos.get(x) || new Set();
        s.add(c);
        excluidos.set(x, s);
        const r2 = evaluarCandidatos_(x.f, vivos.filter(function (v) { return !s.has(v); }), comunas);
        if (r2.veredicto === 'escribiria' && r2.mejor.c.grupo === ch.g) aRevisar(x, r2, 'formulario_gemelo');
        else if (r2.veredicto === 'escribiria') { r2.porInvariante = true; x.r = r2; }
        else aRevisar(x, r2, 'formulario_compartido');
      });
      casos.push(caso);
    });
  }

  const stats = { seQueda: contador_(), reasignada: contador_(), compartido: contador_(), gemelo: contador_() };
  involucradas.forEach(function (x) {
    const fin = (x.r.veredicto === 'escribiria' && x.r.mejor) ? x.r.mejor.c : null;
    if (x.r.motivo === 'formulario_compartido') sumar_(stats.compartido, x.ev);
    else if (x.r.motivo === 'formulario_gemelo') sumar_(stats.gemelo, x.ev);
    else if (fin && fin === inicial.get(x)) sumar_(stats.seQueda, x.ev);
    else if (fin) sumar_(stats.reasignada, x.ev);
  });
  return { casos: casos, vueltas: vueltas, tope: tope, stats: stats };
}

/**
 * El bloque 0 del log: el invariante, **aplicado y chequeado**. La aplicación dice qué se resolvió;
 * el chequeo, sobre el resultado final, tiene que dar 0 formularios con 2+ filas escritas.
 */
function _logInvariante_(plan) {
  const inv = plan.invariante || {};
  const ap = inv.aplicacion, ch = inv.chequeo;
  Logger.log('--- 0. INVARIANTE: un formulario, una fila (aplicado y chequeado) ---');
  if (ap) {
    Logger.log('  aplicado: %s choques resueltos en %s vueltas%s', ap.casos.length, ap.vueltas,
               ap.tope ? ' — LLEGÓ AL TOPE (MAX_VUELTAS_FORMULARIO_UNICO): lo que quedaba va a REVISAR' : '');
    Logger.log('    filas que se quedan su formulario ....... %s', _dc_(ap.stats.seQueda));
    Logger.log('    filas re-evaluadas que toman otro ....... %s', _dc_(ap.stats.reasignada));
    Logger.log('    filas a REVISAR por formulario_compartido %s', _dc_(ap.stats.compartido));
    Logger.log('    filas a REVISAR por formulario_gemelo ... %s   (un gemelo del formulario de otra fila)',
               _dc_(ap.stats.gemelo));
    ap.casos.slice().sort(function (a, b) { return a.ev === b.ev ? 0 : (a.ev ? -1 : 1); })
      .forEach(function (x) {
        Logger.log('  [%s] vuelta %s | %s (ins=%s)%s%s', x.ev ? 'ventana' : 'histor.', x.vuelta,
                   x.c.nombre, x.c.inscriptos || 0, x.gemelos ? ' — GEMELOS (mismo nombre)' : '',
                   x.porUid ? ' — ya tiene dueño por RDV_UID (fila ' + x.filaUid + ')' : '');
        x.pares.forEach(function (sc) {
          const pf = plan.porFila[sc.fila.fila] || {};
          let fin;
          if (sc === x.ganador) fin = 'SE LO QUEDA (por ' + _nombreCriterio_(x.porQue) + ')';
          else if (pf.motivo === 'formulario_compartido') fin = 'REVISAR: formulario_compartido';
          else if (pf.motivo === 'formulario_gemelo') fin = 'REVISAR: formulario_gemelo';
          else if (pf.veredicto === 'escribiria' && pf.cand) {
            fin = 'toma otro: ' + pf.cand.nombre + ' (' + pf.score + ')';
          } else fin = (pf.veredicto || '?') + (pf.motivo ? ' / ' + pf.motivo : '');
          Logger.log('      fila %s | %s | %s | %s señales, %s días → %s', sc.fila.fila,
                     fmtFecha_(sc.fila.fecha), sc.fila.barrio || 'sin barrio',
                     _senalesCoincidentes_(sc), sc.dist === null ? '?' : sc.dist, fin);
        });
      });
  }
  if (!ch) return;
  if (!ch.choques.length) {
    Logger.log('  CHEQUEO: 0 formularios (ni gemelos) con 2+ filas escritas o con RDV_UID. OK.');
  } else {
    Logger.log('  >>> CHEQUEO FALLIDO: %s FORMULARIOS (O GRUPOS DE GEMELOS) EN 2+ FILAS (%s FILAS). EL',
               _dc_(ch.formularios), _dc_(ch.filas));
    Logger.log('      INVARIANTE NO SE CUMPLE: DRY_RUN = false QUEDA BLOQUEADO.');
    ch.choques.forEach(function (x) {
      Logger.log('      %s → filas %s', x.c.nombre,
                 x.pares.map(function (sc) { return sc.fila.fila; }).join(', '));
    });
  }
}

/**
 * El bloque 0b del log (02/10): **los gemelos** de `B` —mismo nombre y cierres a GEMELOS_MAX_DIAS días
 * o menos (`marcarGemelos_`, la misma definición que usan el invariante y el paso 16)— y a qué fila va
 * cada uno. Aparte, los nombres repetidos con cierres más lejos: reuniones distintas, cada una por su
 * clave (no son un error).
 */
function _logGemelos_(plan) {
  const gem = plan.cands.gemelos || { grupos: [], distintos: [], descartados: 0, repetidas: 0 };
  const destinos = new Map(), duenoGrupo = new Map();
  Object.keys(plan.porFila).forEach(function (k) {
    const pf = plan.porFila[k];
    if (pf.cand) {
      if (!destinos.has(pf.cand)) destinos.set(pf.cand, []);
      destinos.get(pf.cand).push('fila ' + k + ' (' + pf.veredicto + (pf.motivo ? ' / ' + pf.motivo : '') + ')');
    } else if (pf.veredicto === 'rdv_uid' && pf.grupo) {
      duenoGrupo.set(pf.grupo, k);
    }
  });
  const ff = function (c) {
    return c.finRaw instanceof Date ? Utilities.formatDate(c.finRaw, RDV_TZ, 'dd/MM/yyyy HH:mm')
                                    : fmtFecha_(c.det && c.det.fechaFin);
  };
  const va = function (c) {
    return c.descartadoRegla3 ? 'descartado por regla 3 (casi cero)'
                              : (destinos.get(c) || []).join(', ') || 'sin fila';
  };
  Logger.log('--- 0b. GEMELOS: mismo nombre y cierres a %s días o menos (regla 3: la misma reunión) ---',
             GEMELOS_MAX_DIAS);
  Logger.log('  grupos de gemelos: %s | descartados por regla 3 (≤ %s inscriptos, con otro del grupo con más): ' +
             '%s | con dos o más con inscriptos (clave_repetida, no se escriben solos): %s',
             gem.grupos.length, MAX_INSCRIPTOS_CASI_CERO, gem.descartados, gem.repetidas);
  gem.grupos.forEach(function (g) {
    Logger.log('  · "%s" — %s formularios%s', g.forms[0].nombre, g.forms.length,
               duenoGrupo.has(g.grupo) ? ' — el grupo es de la fila ' + duenoGrupo.get(g.grupo) +
                                         ' (RDV_UID, traza ambigua: no se sabe cuál)' : '');
    g.forms.forEach(function (c) {
      Logger.log('      B fila %s | Fecha_Fin %s | ins %s%s → %s', c.fila, ff(c), c.inscriptos || 0,
                 c.claveRepetida ? ' | CLAVE REPETIDA' : '', va(c));
    });
  });
  Logger.log('  mismo nombre, cierres a más de %s días (reuniones DISTINTAS, cada una por su clave): %s',
             GEMELOS_MAX_DIAS, (gem.distintos || []).length);
  (gem.distintos || []).forEach(function (x) {
    Logger.log('  · "%s"', x.nombre);
    x.grupos.forEach(function (g) {
      g.forEach(function (c) {
        Logger.log('      B fila %s | Fecha_Fin %s | ins %s → %s', c.fila, ff(c), c.inscriptos || 0, va(c));
      });
    });
  });
}

// ===================== Validación contra los inscriptos del destino =====================

/**
 * **Sólo lectura, sólo log. Es una CALIBRACIÓN DE UNA SOLA VEZ.**
 *
 * Los inscriptos que hoy tiene cargados el destino **no van a existir en régimen** como dato
 * independiente: los va a escribir el propio sistema (CLAUDE.md 1). Por eso se usan **sólo** acá,
 * para medir qué tan bien acierta el matcher sobre las filas que hoy tienen el dato. **No entran
 * en el score, ni en ningún desempate, ni en la regla de un formulario por fila.**
 *
 * Mide cuatro cosas: la cobertura; la diferencia entre los inscriptos del destino y los del
 * formulario elegido en las que se escribirían; si el ganador del desempate del paso 9 coincide
 * con el destino o un rival coincide mejor; y, en los choques del invariante, qué fila coincide
 * con el formulario y si la regla simulada eligió esa.
 */
function medirValidacionInscriptos() {
  Logger.log('=== medirValidacionInscriptos — sólo lectura, CALIBRACIÓN de una sola vez ===');
  Logger.log('  Los inscriptos del DESTINO son SÓLO validación: no entran en el score, ni en ningún');
  Logger.log('  desempate, ni en la regla de un formulario por fila, ni en ninguna decisión de');
  Logger.log('  escribir. En régimen el sistema no tiene ese dato: lo escribe él mismo.');
  const plan = calcularPlan_(true, null, { historial: true });
  const dest = plan.dest, porFila = plan.porFila;
  const iIns = dest.D['Inscriptos'];
  const insDest = function (f) { return _insDestino_(dest, f); };
  const dif = function (d, form) {
    if (d === null) return null;
    return Math.abs((form || 0) - d) / Math.max(d, 1);
  };

  Logger.log('VENTANA: corte %s (%s). Se lee [ventana | total].',
             fmtFecha_(inicioVentanaAnalisis_()), descVentanaAnalisis_());
  if (iIns == null) {
    Logger.log('  >>> El destino no tiene columna Inscriptos: nada que validar.');
    return {};
  }

  // --- cobertura ---
  // Un destino con 0 inscriptos es una fila SIN CARGAR, no una diferencia: no es dato.
  const evaluables = contador_(), conDato = contador_(), sinCargar = contador_();
  dest.filas.forEach(function (f) {
    const pf = porFila[f.fila];
    if (!pf || pf.veredicto === 'futura') return;
    const ev = enVentanaAnalisis_(f.fecha);
    sumar_(evaluables, ev);
    const d = insDest(f);
    if (d === 0) sumar_(sinCargar, ev);
    else if (d !== null) sumar_(conDato, ev);
  });

  // --- las que se escribirían: destino contra formulario elegido ---
  const bandas = { exacto: contador_(), p5: contador_(), p20: contador_(), mas: contador_() };
  const grandes = [];
  const escritasConDato = contador_(), escritasSinCargar = contador_();
  dest.filas.forEach(function (f) {
    const pf = porFila[f.fila];
    if (!pf || pf.veredicto !== 'escribiria' || !pf.cand) return;
    const d = insDest(f);
    if (d === null) return;
    const ev = enVentanaAnalisis_(f.fecha);
    if (d === 0) { sumar_(escritasSinCargar, ev); return; }   // sin cargar: fuera de las bandas
    sumar_(escritasConDato, ev);
    const x = dif(d, pf.cand.inscriptos);
    const k = x === 0 ? 'exacto' : x <= 0.05 ? 'p5' : x <= 0.20 ? 'p20' : 'mas';
    sumar_(bandas[k], ev);
    if (k === 'mas') grandes.push({ f: f, ev: ev, d: d, c: pf.cand, x: x });
  });

  // --- los desempates por evidencia (implementados): el ganador contra sus rivales ---
  const resueltos = [];
  dest.filas.forEach(function (f) {
    const pf = porFila[f.fila];
    if (!pf || !pf.desempate || !pf.contendientes || !pf.cand) return;
    const ganador = pf.contendientes.filter(function (sc) { return sc.c === pf.cand; })[0];
    if (!ganador) return;             // la fila tomó otro formulario después (invariante)
    resueltos.push({ f: f, ev: enVentanaAnalisis_(f.fecha), conts: pf.contendientes,
                     ganador: ganador, porQue: pf.desempate });
  });
  const v9 = { conDato: contador_(), ganadorMejor: contador_(), rivalMejor: contador_(),
               empate: contador_() };
  const desac9 = [];
  resueltos.forEach(function (x) {
    const d = insDest(x.f);
    if (d === null || d === 0) return;                         // sin dato o sin cargar
    sumar_(v9.conDato, x.ev);
    const dg = dif(d, x.ganador.c.inscriptos);
    let mejorRival = null;
    x.conts.forEach(function (sc) {
      if (sc === x.ganador) return;
      const dr = dif(d, sc.c.inscriptos);
      if (!mejorRival || dr < mejorRival.dr) mejorRival = { sc: sc, dr: dr };
    });
    if (!mejorRival || dg < mejorRival.dr) sumar_(v9.ganadorMejor, x.ev);
    else if (mejorRival.dr < dg) {
      sumar_(v9.rivalMejor, x.ev);
      desac9.push({ f: x.f, ev: x.ev, x: x, d: d, rival: mejorRival.sc });
    } else sumar_(v9.empate, x.ev);
  });

  // --- los choques del invariante, tal como los resolvió aplicarFormularioUnico_ ---
  const casosInv = (plan.invariante && plan.invariante.aplicacion)
    ? plan.invariante.aplicacion.casos : [];
  const vInv = { conDato: 0, reglaAcierta: 0, reglaErra: 0, sinGanador: 0 };
  const detInv = [];
  casosInv.forEach(function (ch) {
    let mejor = null;
    ch.pares.forEach(function (sc) {
      const d = insDest(sc.fila);
      if (d === null || d === 0) return;   // un 0 del destino no "coincide" con un formulario de 0
      const x = dif(d, ch.c.inscriptos);
      if (!mejor || x < mejor.x) mejor = { sc: sc, x: x, d: d };
    });
    if (!mejor) return;
    vInv.conDato++;
    if (!ch.ganador) vInv.sinGanador++;
    else if (ch.ganador === mejor.sc) vInv.reglaAcierta++;
    else vInv.reglaErra++;
    detInv.push({ ch: ch, mejor: mejor });
  });

  // ===================== el log =====================
  Logger.log('--- cobertura: filas evaluables con inscriptos cargados en el destino ---');
  Logger.log('  %s de %s  (más %s con 0 = destino SIN CARGAR, que no es dato)', _dc_(conDato),
             _dc_(evaluables), _dc_(sinCargar));

  Logger.log('--- las que se escribirían (%s con dato; %s con destino sin cargar, aparte) ---',
             _dc_(escritasConDato), _dc_(escritasSinCargar));
  Logger.log('  exacto ..... %s', _dcp_(bandas.exacto, escritasConDato));
  Logger.log('  <= 5%% ...... %s', _dcp_(bandas.p5, escritasConDato));
  Logger.log('  <= 20%% ..... %s', _dcp_(bandas.p20, escritasConDato));
  Logger.log('  más ........ %s   ← candidatas a match equivocado',
             _dcp_(bandas.mas, escritasConDato));
  _ordenarPorFila_(grandes).slice(0, 40).forEach(function (x) {
    Logger.log('    [%s] fila %s | %s | %s | %s | destino %s vs formulario %s (%s%%) ← %s',
               x.ev ? 'ventana' : 'histor.', x.f.fila, fmtFecha_(x.f.fecha), x.f.figura,
               x.f.barrio || 'sin barrio', x.d, x.c.inscriptos || 0, Math.round(x.x * 100),
               x.c.nombre);
  });

  Logger.log('--- los DESEMPATES por evidencia (%s con dato): ¿el ganador coincide con el destino? ---',
             _dc_(v9.conDato));
  Logger.log('  el ganador coincide mejor ... %s', _dc_(v9.ganadorMejor));
  Logger.log('  UN RIVAL coincide mejor ..... %s', _dc_(v9.rivalMejor));
  Logger.log('  empatan ..................... %s', _dc_(v9.empate));
  _ordenarPorFila_(desac9).forEach(function (y) {
    Logger.log('    [%s] fila %s | %s | %s | destino %s', y.ev ? 'ventana' : 'histor.', y.f.fila,
               fmtFecha_(y.f.fecha), y.f.figura, y.d);
    Logger.log('        ganó (por %s): ins=%s | %s', _nombreCriterio_(y.x.porQue),
               y.x.ganador.c.inscriptos || 0, y.x.ganador.c.nombre);
    Logger.log('        rival:        ins=%s | %s', y.rival.c.inscriptos || 0, y.rival.c.nombre);
  });

  Logger.log('--- los choques del invariante (%s con dato): ¿la regla aplicada eligió la fila',
             vInv.conDato);
  Logger.log('    que coincide con los inscriptos del formulario? ---');
  Logger.log('  acierta %s | erra %s | la regla no eligió ninguna %s', vInv.reglaAcierta,
             vInv.reglaErra, vInv.sinGanador);
  detInv.forEach(function (y) {
    Logger.log('    %s (ins=%s): coincide la fila %s (destino %s) | la regla eligió %s',
               y.ch.c.nombre, y.ch.c.inscriptos || 0, y.mejor.sc.fila.fila, y.mejor.d,
               y.ch.ganador ? 'la fila ' + y.ch.ganador.fila.fila : 'ninguna');
  });

  _logBusquedaInversa_(plan, grandes, detInv, desac9, insDest);
  _logFechaFinSinTexto_(plan, insDest);

  Logger.log('  Qué NO dice esto:');
  Logger.log('   - Las filas cargadas por el legado desde el mismo formulario coinciden por');
  Logger.log('     construcción: eso valida al matcher nuevo contra el viejo, no contra la verdad.');
  Logger.log('   - Las filas sin inscriptos cargados no aportan nada acá.');
  Logger.log('   - Los inscriptos pueden haber crecido después de la carga: una diferencia chica no');
  Logger.log('     es un error. Mirar la banda "más", no la de <= 20%.');
  Logger.log('   - Nada de esto entra al score ni a un desempate: es una calibración de una vez.');

  return { conDato: conDato, bandas: bandas, v9: v9, inv: vInv };
}

/**
 * **Búsqueda inversa** (paso 10, calibración): para cada fila dudosa, qué formularios de SU
 * figura a ±`DIAS_BUSQUEDA_INVERSA` tienen EXACTAMENTE los inscriptos que el destino tiene
 * cargados. "El destino tiene N: coincide con este formulario".
 *
 * Sólo log. **No entra al score ni a ningún desempate**: los inscriptos del destino son de
 * validación (CLAUDE.md, paso 10). Un número igual puede ser casualidad —sobre todo con números
 * chicos—, así que esto propone dónde mirar, no dice cuál es.
 *
 * Qué filas: las de la banda "más", las de los choques del invariante que la regla resolvió al
 * revés, los desempates donde un rival coincide mejor, las que no se escriben (a revisar o sin
 * match) con dato en el destino, y las de `FILAS_BUSQUEDA_INVERSA`.
 */
function _logBusquedaInversa_(plan, grandes, detInv, desac9, insDest) {
  const dest = plan.dest, porFila = plan.porFila, vivos = plan.cands.vivos;
  const tol = DIAS_BUSQUEDA_INVERSA;

  // qué formulario ya toma qué fila (para decir "ya lo usa la fila X")
  const tomadoPor = {};
  dest.filas.forEach(function (f) {
    const pf = porFila[f.fila];
    if (pf && pf.veredicto === 'escribiria' && pf.cand) tomadoPor[pf.cand.fila] = f.fila;
  });
  const porNumero = {};
  dest.filas.forEach(function (f) { porNumero[f.fila] = f; });

  const vistas = {}, lista = [];
  const agregar = function (f, porQue) {
    if (!f || vistas[f.fila]) return;
    const d = insDest(f);
    if (d === null || d === 0) return;
    vistas[f.fila] = true;
    lista.push({ f: f, ev: enVentanaAnalisis_(f.fecha), d: d, porQue: porQue });
  };
  grandes.forEach(function (x) { agregar(x.f, 'banda "más"'); });
  detInv.forEach(function (y) {
    if (y.ch.ganador && y.ch.ganador !== y.mejor.sc) {
      agregar(y.mejor.sc.fila, 'choque resuelto al revés');
      agregar(y.ch.ganador.fila, 'choque resuelto al revés');
    }
  });
  desac9.forEach(function (y) { agregar(y.f, 'desempate: un rival coincide mejor'); });
  (FILAS_BUSQUEDA_INVERSA || []).forEach(function (n) { agregar(porNumero[n], 'pedida a mano'); });
  dest.filas.forEach(function (f) {
    const pf = porFila[f.fila];
    if (pf && (pf.veredicto === 'REVISAR_MATCH' || pf.veredicto === 'SIN_MATCH')) {
      agregar(f, 'no se escribe (' + (pf.motivo || pf.veredicto) + ')');
    }
  });

  const res = { con: contador_(), sin: contador_(), esElElegido: contador_() };
  Logger.log('--- BÚSQUEDA INVERSA: formularios de la figura a ±%s días con los MISMOS inscriptos ' +
             'que el destino (%s filas) ---', tol, lista.length);
  Logger.log('  Sólo para mirar: un número igual puede ser casualidad. No entra en nada.');
  _ordenarPorFila_(lista).forEach(function (x) {
    const f = x.f, figNorm = normalizeText_(f.figura), pf = porFila[f.fila] || {};
    const hallados = [];
    for (let j = 0; j < vivos.length; j++) {
      const c = vivos[j];
      if ((c.inscriptos || 0) !== x.d) continue;
      const sinFig = !c.figurasNorm.length;
      if (!sinFig && c.figurasNorm.indexOf(figNorm) === -1) continue;
      const dd = distanciaFecha_(f.fecha, c.det);
      if (dd === null || dd > tol) continue;
      hallados.push({ c: c, dd: dd, sinFig: sinFig });
    }
    hallados.sort(function (a, b) { return a.dd - b.dd; });
    const elegido = pf.cand || null;
    const ok = hallados.some(function (h) { return h.c === elegido; });
    sumar_(hallados.length ? res.con : res.sin, x.ev);
    if (ok) sumar_(res.esElElegido, x.ev);
    Logger.log('  [%s] fila %s | %s | %s | %s | %s → %s',
               x.ev ? 'ventana' : 'histor.', f.fila, fmtFecha_(f.fecha), f.figura,
               f.barrio || 'sin barrio', x.porQue, pf.veredicto + (pf.motivo ? '/' + pf.motivo : ''));
    Logger.log('      %s: %s', pf.veredicto === 'escribiria' ? 'elegido hoy' : 'mejor candidato (no se escribe)',
               elegido ? 'ins=' + (elegido.inscriptos || 0) + ' | ' + elegido.nombre : 'ninguno');
    if (!hallados.length) {
      Logger.log('      el destino tiene %s: NINGÚN formulario de su figura a ±%s días tiene ese número',
                 x.d, tol);
    }
    hallados.forEach(function (h) {
      const quien = h.c === elegido ? '  ← ES EL ELEGIDO'
        : (tomadoPor[h.c.fila] != null ? '  (ya lo toma la fila ' + tomadoPor[h.c.fila] + ')' : '  (libre)');
      Logger.log('      el destino tiene %s: coincide con B fila %s (%s días%s) | %s%s', x.d,
                 h.c.fila, h.dd, h.sinFig ? ', SIN figura' : '', h.c.nombre, quien);
    });
  });
  Logger.log('  resumen: con algún formulario coincidente %s | sin ninguno %s | el coincidente es ' +
             'el elegido %s', _dc_(res.con), _dc_(res.sin), _dc_(res.esElElegido));
  return res;
}

/**
 * **Formularios sin fecha en el texto** (paso 10, sólo medición). Usan `fecha_fin`, que es el
 * CIERRE de la inscripción y cae antes de la reunión. Caso: fila 626 (Flores 04/06) ↔ "1 a 1 -
 * Comuna 7" (105 = 105), a 6 días.
 *
 * Sobre los pares **confirmados por la calibración** —formulario de la figura de la fila, con
 * fuente `fecha_fin`, y los inscriptos del formulario iguales a los del destino (≥
 * MIN_INSCRIPTOS_CALIBRACION_FECHA_FIN, para que la coincidencia no sea casualidad)—, mide
 * (fecha de la fila − fecha_fin). Si es sistemáticamente positiva, PROPONE una ventana asimétrica
 * para ese caso. No cambia nada: los inscriptos del destino son sólo validación.
 */
const MIN_INSCRIPTOS_CALIBRACION_FECHA_FIN = 10;

function _logFechaFinSinTexto_(plan, insDest) {
  const dest = plan.dest, vivos = plan.cands.vivos, porFila = plan.porFila;
  const sinTexto = vivos.filter(function (c) { return c.det && c.det.fuente === 'fecha_fin'; });
  const porDelta = {}, casos = [];
  const cnt = { pares: contador_(), pos: contador_(), cero: contador_(), neg: contador_(),
                chicos: contador_() };
  dest.filas.forEach(function (f) {
    const pf = porFila[f.fila];
    if (!pf || pf.veredicto === 'futura' || !f.fecha) return;
    const d = insDest(f);
    if (d === null || d === 0) return;
    const ev = enVentanaAnalisis_(f.fecha), figNorm = normalizeText_(f.figura);
    sinTexto.forEach(function (c) {
      if (c.figurasNorm.indexOf(figNorm) === -1 || (c.inscriptos || 0) !== d) return;
      const delta = diasEntre_(f.fecha, c.det.fechaFin);
      if (delta === null || Math.abs(delta) > VENTANA_EMPAREJAR_DIAS) return;
      if (d < MIN_INSCRIPTOS_CALIBRACION_FECHA_FIN) { sumar_(cnt.chicos, ev); return; }
      sumar_(cnt.pares, ev);
      sumar_(delta > 0 ? cnt.pos : delta === 0 ? cnt.cero : cnt.neg, ev);
      if (!porDelta[delta]) porDelta[delta] = contador_();
      sumar_(porDelta[delta], ev);
      casos.push({ f: f, ev: ev, c: c, delta: delta, d: d, pf: pf });
    });
  });

  Logger.log('--- FORMULARIOS SIN FECHA EN EL TEXTO (fuente fecha_fin): fecha de la fila − fecha_fin ---');
  Logger.log('  formularios con fuente fecha_fin: %s de %s', sinTexto.length, vivos.length);
  Logger.log('  pares confirmados por la calibración (inscriptos iguales, ≥ %s): %s   (con menos de %s, ' +
             'no se cuentan: %s)', MIN_INSCRIPTOS_CALIBRACION_FECHA_FIN, _dc_(cnt.pares),
             MIN_INSCRIPTOS_CALIBRACION_FECHA_FIN, _dc_(cnt.chicos));
  Logger.log('  positiva (reunión después del cierre) %s | 0 %s | negativa %s', _dc_(cnt.pos),
             _dc_(cnt.cero), _dc_(cnt.neg));
  Object.keys(porDelta).map(Number).sort(function (a, b) { return a - b; }).forEach(function (k) {
    Logger.log('    %s días: %s', (k > 0 ? '+' : '') + k, _dc_(porDelta[k]));
  });
  _ordenarPorFila_(casos).slice(0, 40).forEach(function (x) {
    Logger.log('    [%s] fila %s | %s | %s | %s | ins %s | %s días ← B fila %s | %s | la fila hoy: %s%s',
               x.ev ? 'ventana' : 'histor.', x.f.fila, fmtFecha_(x.f.fecha), x.f.figura,
               x.f.barrio || 'sin barrio', x.d, (x.delta > 0 ? '+' : '') + x.delta, x.c.fila, x.c.nombre,
               x.pf.veredicto + (x.pf.motivo ? '/' + x.pf.motivo : ''),
               x.pf.cand === x.c ? ' (es el elegido)' : '');
  });

  // La propuesta, sólo si la ventana la sostiene: casi todos positivos y con suficientes casos.
  const v = cnt.pares.v;
  const deltasV = casos.filter(function (x) { return x.ev; }).map(function (x) { return x.delta; })
    .sort(function (a, b) { return a - b; });
  if (v >= 5 && cnt.pos.v + cnt.cero.v >= 0.8 * v) {
    const p90 = deltasV[Math.min(deltasV.length - 1, Math.floor(0.9 * deltasV.length))];
    Logger.log('  >>> PROPUESTA (no implementada): para formularios con fuente fecha_fin, tolerancia');
    Logger.log('      ASIMÉTRICA [0, +%s] días (p90 de la ventana) en vez de ±%s. La reunión cae',
               p90, TOLERANCIA_REPROGRAMACION_DIAS);
    Logger.log('      después del cierre: %s%% en la ventana es ≥ 0.', Math.round(100 * (cnt.pos.v + cnt.cero.v) / v));
  } else {
    Logger.log('  >>> La ventana NO sostiene una ventana asimétrica (%s casos; hace falta ≥ 5 con ≥ 80%% ≥ 0).', v);
  }
}

// ===================== Medición: ubicación en desacuerdo con figura y fecha =====================

/**
 * **Reuniones reubicadas: figura + fecha + ubicación en desacuerdo** (paso 11). Sólo lectura y
 * log; **no cambia ningún veredicto**.
 *
 * Regla de negocio 8 (CLAUDE.md 1, confirmada el 01/10): una reunión puede cambiar de lugar
 * después de creado el formulario, y el título del formulario queda con la comuna vieja. El dato
 * vigente es el barrio de RDV. Desde el 01/10 esos pares **no se descartan**
 * (UBICACION_DESACUERDO_A_REVISION): van a REVISAR_MATCH si la fila no tiene un ganador mejor, y a
 * EMPAREJAR_MANUAL siempre. **Nunca se escriben solos.**
 *
 *   a) los pares figura + fecha a 0–DIAS_REUBICACION días + ubicación en desacuerdo,
 *      [ventana | total], con los casos: en qué quedó la fila y si el par está en EMPAREJAR_MANUAL;
 *   b) cuáles son **sin ambigüedad** —la figura tiene UN solo formulario ese día ±1, y la fila UN
 *      solo candidato con figura y fecha— y cuáles ambiguos, con los casos; y de los sin ambigüedad,
 *      cuántos tienen los inscriptos del formulario iguales a los del destino (calibración, sólo
 *      log). Es el insumo para decidir si los sin ambigüedad se escriben solos con traza
 *      "posible_reubicacion". Eso lo decide el usuario.
 */
function medirDesacuerdoUbicacion() {
  Logger.log('=== medirDesacuerdoUbicacion — sólo lectura, no cambia ningún veredicto ===');
  const plan = calcularPlan_(true, null, { historial: true });
  const dest = plan.dest, vivos = plan.cands.vivos, comunas = plan.comunas, porFila = plan.porFila;
  const paresSet = (plan.emp && plan.emp.paresSet) || {};
  const tomadoPor = {};
  plan.decisiones.forEach(function (d) { if (!d.noEscribir && d.cand) tomadoPor[d.cand.fila] = d.fila.fila; });
  const bandaMax = BANDAS_FECHA[BANDAS_FECHA.length - 1].dias;

  const cnt = { pares: contador_(), filas: contador_(), restoAlto: contador_(),
                escritaConOtro: contador_(), revisarDesacuerdo: contador_(), revisarOtro: contador_(),
                sinMatch: contador_(), enEmparejar: contador_(), noEnEmparejar: contador_(),
                sinAmbig: contador_(), ambig: contador_(), sinAmbigConDato: contador_(),
                sinAmbigIguales: contador_(), sinAmbigDistintos: contador_() };
  const casos = [], vistaFila = {};
  dest.filas.forEach(function (f) {
    const pf = porFila[f.fila];
    if (!pf || pf.veredicto === 'futura' || pf.veredicto === 'rdv_uid') return;
    const ev = enVentanaAnalisis_(f.fecha);
    const figNorm = normalizeText_(f.figura);
    // Candidatos de la fila con figura y fecha que puntúa (hasta la banda más ancha, ±7).
    let candFigFecha = 0;
    for (let j = 0; j < vivos.length; j++) {
      const d = distanciaFecha_(f.fecha, vivos[j].det);
      if (d !== null && d <= bandaMax && vivos[j].figurasNorm.indexOf(figNorm) !== -1) candFigFecha++;
    }
    for (let j = 0; j < vivos.length; j++) {
      const c = vivos[j];
      const sc = puntuar_(f, c, comunas);
      if (!_esReubicacion_(sc)) continue;
      sumar_(cnt.pares, ev);
      if (sc.resto >= UMBRAL_MATCH) sumar_(cnt.restoAlto, ev);
      const enEmp = !!paresSet[c.fila + '|' + f.fila];
      sumar_(enEmp ? cnt.enEmparejar : cnt.noEnEmparejar, ev);

      // b) ambigüedad: formularios de la figura ese día (±1 de la fecha del formulario)
      let formsDia = 0;
      for (let k = 0; k < vivos.length; k++) {
        const o = vivos[k];
        if (o.figurasNorm.indexOf(figNorm) === -1 || !o.det || !o.det.mejor || !c.det || !c.det.mejor) continue;
        if (Math.abs(diasEntre_(o.det.mejor, c.det.mejor)) <= DIAS_REUBICACION) formsDia++;
      }
      const sinAmbig = formsDia === 1 && candFigFecha === 1;
      sumar_(sinAmbig ? cnt.sinAmbig : cnt.ambig, ev);
      let calib = '';
      if (sinAmbig) {
        const d = _insDestino_(dest, f);    // sólo validación: no entra en ninguna decisión
        if (d !== null && d !== 0) {
          sumar_(cnt.sinAmbigConDato, ev);
          if (d === (c.inscriptos || 0)) { sumar_(cnt.sinAmbigIguales, ev); calib = 'destino = formulario'; }
          else { sumar_(cnt.sinAmbigDistintos, ev); calib = 'destino ' + d + ' ≠ formulario'; }
        } else calib = 'destino sin cargar';
      }

      const estado = pf.veredicto === 'escribiria' ? 'escrita_con_otro'
        : pf.veredicto === 'REVISAR_MATCH' ? 'revisar_' + pf.motivo : 'sin_match_' + pf.motivo;
      if (!vistaFila[f.fila]) {
        vistaFila[f.fila] = true;
        sumar_(cnt.filas, ev);
        if (estado === 'escrita_con_otro') sumar_(cnt.escritaConOtro, ev);
        else if (pf.motivo === 'ubicacion_en_desacuerdo') sumar_(cnt.revisarDesacuerdo, ev);
        else if (pf.veredicto === 'REVISAR_MATCH') sumar_(cnt.revisarOtro, ev);
        else sumar_(cnt.sinMatch, ev);
      }
      casos.push({ f: f, ev: ev, c: c, sc: sc, estado: estado, enEmp: enEmp, pf: pf,
                   tomado: tomadoPor[c.fila], sinAmbig: sinAmbig, formsDia: formsDia,
                   candFigFecha: candFigFecha, calib: calib });
    }
  });

  Logger.log('VENTANA: corte %s (%s). Se lee [ventana | total].',
             fmtFecha_(inicioVentanaAnalisis_()), descVentanaAnalisis_());
  Logger.log('--- a) pares figura + fecha a 0–%s días + ubicación EN DESACUERDO (posible reubicación) ---',
             DIAS_REUBICACION);
  Logger.log('  UBICACION_DESACUERDO_A_REVISION = %s', UBICACION_DESACUERDO_A_REVISION);
  Logger.log('  pares ....................................... %s', _dc_(cnt.pares));
  Logger.log('    sin la ubicación llegarían al umbral ...... %s', _dc_(cnt.restoAlto));
  Logger.log('    están en EMPAREJAR_MANUAL ................. %s', _dc_(cnt.enEmparejar));
  Logger.log('    NO están (la fila ya se resolvió, o el formulario ya lo toma otra) %s',
             _dc_(cnt.noEnEmparejar));
  Logger.log('  filas del destino con al menos uno .......... %s', _dc_(cnt.filas));
  Logger.log('    se escriben con OTRO formulario ........... %s', _dc_(cnt.escritaConOtro));
  Logger.log('    REVISAR por ubicacion_en_desacuerdo ....... %s   (predicción 01/10: ≈ 9 | 27)',
             _dc_(cnt.revisarDesacuerdo));
  Logger.log('    REVISAR por otro motivo ................... %s', _dc_(cnt.revisarOtro));
  Logger.log('    SIN_MATCH ................................. %s', _dc_(cnt.sinMatch));

  Logger.log('--- b) ¿sin ambigüedad? (la figura tiene UN formulario ese día ±%s, y la fila UN ' +
             'candidato con figura y fecha a ±%s) ---', DIAS_REUBICACION, bandaMax);
  Logger.log('  sin ambigüedad ...... %s', _dc_(cnt.sinAmbig));
  Logger.log('  ambiguos ............ %s', _dc_(cnt.ambig));
  Logger.log('  de los sin ambigüedad, con inscriptos en el destino: %s → iguales al formulario %s | ' +
             'distintos %s', _dc_(cnt.sinAmbigConDato), _dc_(cnt.sinAmbigIguales),
             _dc_(cnt.sinAmbigDistintos));
  Logger.log('  (calibración: los inscriptos del destino no entran en ninguna decisión)');
  _ordenarPorFila_(casos).slice(0, 80).forEach(function (x) {
    Logger.log('  [%s] %s | fila %s | %s | %s | %s días | score %s, sin ubicación %s | %s',
               x.ev ? 'ventana' : 'histor.', x.sinAmbig ? 'SIN AMBIGÜEDAD' : 'ambiguo',
               x.f.fila, fmtFecha_(x.f.fecha), x.f.figura, x.sc.dist, x.sc.score, x.sc.resto,
               _detalleDesacuerdo_(x.f, x.c, comunas));
    Logger.log('      formulario: B fila %s | ins=%s | %s', x.c.fila, x.c.inscriptos || 0, x.c.nombre);
    Logger.log('      formularios de la figura ese día: %s | candidatos de la fila con figura y fecha: %s%s',
               x.formsDia, x.candFigFecha, x.calib ? ' | ' + x.calib : '');
    Logger.log('      la fila hoy: %s%s | en EMPAREJAR_MANUAL: %s%s', x.estado,
               x.estado === 'escrita_con_otro' && x.pf.cand ? ' (B fila ' + x.pf.cand.fila + ': ' + x.pf.cand.nombre + ')' : '',
               x.enEmp ? 'sí' : 'NO',
               x.tomado != null ? ' | el formulario ya lo toma la fila ' + x.tomado : '');
  });
  if (casos.length > 80) Logger.log('  ... y %s pares más', casos.length - 80);
  Logger.log('  Qué NO dice esto: "sin ambigüedad" no es "correcto". Si se decide escribirlos solos');
  Logger.log('  (traza posible_reubicacion), lo decide el usuario con estos números delante.');
  return cnt;
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
function _correrUpsert_(enSeco, opciones) {
  const t0 = new Date();
  const historial = !!(opciones && opciones.historial);
  Logger.log('=== upsertDestino (%s)%s ===', enSeco ? 'DRY_RUN — no escribe nada' : 'ESCRITURA REAL',
             historial ? ' — TODO EL HISTORIAL (paso 22, una vez: sin el límite de DIAS_ACTIVOS)' : '');
  Logger.log('  solapa destino: %s', descripcionHojaDestino_());

  /*
   * Una corrida por vez (02/10): el activador corre cada hora y alguien puede correrlo a mano al
   * mismo tiempo. Si otra corrida tiene el bloqueo, ésta no hace nada y lo dice.
   */
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(ESPERA_BLOQUEO_MS)) {
    Logger.log('>>> Hay otra corrida del upsert en curso: ésta no hace nada (LockService).');
    return null;
  }
  try {
    return _correrUpsertConBloqueo_(enSeco, t0, historial);
  } finally {
    lock.releaseLock();
  }
}

function _correrUpsertConBloqueo_(enSeco, t0, historial) {
  // La guarda (02/10): la solapa destino existe y, si es la copia, tiene los encabezados del real.
  // Si no, error ANTES de calcular: no se escribe nada.
  verificarHojaDestino_(ssDestino_());

  // ¿La corrida anterior se cortó a mitad de la escritura? No hay que hacer nada especial: las filas
  // que ya escribió tienen RDV_UID y entran por ahí; sólo se completan sus celdas vacías.
  const props = PropertiesService.getScriptProperties();
  const anterior = props.getProperty(PROP_ESCRITURA_INCOMPLETA);
  if (anterior) {
    Logger.log('>>> La escritura anterior quedó a mitad: %s. Ésta sigue desde ahí: las filas ya ' +
               'escritas entran por RDV_UID y se completan; las que faltan, se escriben.', anterior);
  }

  const plan = calcularPlan_(enSeco, null, historial ? { historial: true } : null);
  logResumen_(plan);                 // ← ANTES de escribir nada
  // Asistentes desde RDV CONJUNTO (paso B, 02/10): no dependen del formulario; se cruzan aparte.
  plan.asistentes = cruzarAsistentes_(plan.dest, plan.comunas);
  Logger.log('--- Asistentes (RDV CONJUNTO, figura + fecha) ---');
  _logCruceAsistentes_(plan.asistentes, false);

  if (!enSeco) {
    const w = aplicarDecisiones_(plan.dest, plan.decisiones, t0, plan.asistentes, historial);
    plan.res.escritas = w.celdas;
    plan.res.uidsEstampados = w.uids;
    plan.res.escritura = w;
    Logger.log('>>> Escritura en "%s": %s filas tocadas de %s con algo que escribir, en %s tandas (%s ms; ' +
               'la más lenta %s ms).', RDV_HOJA_DESTINO, w.filasHechas, w.filasPendientes, w.tandas,
               w.msEscritura, w.tandaMax);
    Logger.log('    celdas de dato %s | traza %s | uuids estampados %s | STATUS → Realizada %s',
               w.celdas, w.trazas, w.uids, w.realizadas);
    Logger.log('    por columna: %s', Object.keys(w.porColumna).map(function (k) {
      return k + ' ' + w.porColumna[k]; }).join(' | ') || 'nada');
    if (w.completa) {
      props.deleteProperty(PROP_ESCRITURA_INCOMPLETA);
      Logger.log('    COMPLETA: no queda ninguna fila con algo que escribir.');
    } else {
      const estado = Utilities.formatDate(new Date(), RDV_TZ, 'dd/MM HH:mm') + ' en "' + RDV_HOJA_DESTINO +
                     '", ' + w.filasHechas + ' de ' + w.filasPendientes + ' filas' +
                     (historial ? ' (TODO EL HISTORIAL: seguir con paso22_completarHistorial)' : '');
      props.setProperty(PROP_ESCRITURA_INCOMPLETA, estado);
      Logger.log('    CORTE PROPIO a los %s ms (límite %s): quedan %s filas para la próxima corrida. ' +
                 'Nada quedó a medias: se corta entre tandas.', new Date() - t0, UPSERT_CORTE_PROPIO_MS,
                 w.filasPendientes - w.filasHechas);
      if (historial) {
        Logger.log('    >>> FALTAN %s filas del historial: volver a correr paso22_completarHistorial(). Sigue sola: ' +
                   'las ya escritas entran por RDV_UID.', w.filasPendientes - w.filasHechas);
      }
    }
  } else {
    Logger.log('>>> DRY_RUN: no se escribió NADA en el destino. %s decisiones calculadas y no ' +
               'aplicadas.', plan.decisiones.length);
  }

  // Las derivadas por script (05/10): en TODAS las filas, sólo donde cambió, sin color. En seco sólo cuenta.
  if (DERIVADAS_POR_SCRIPT) {
    try {
      const d = recalcDerivadas_(RDV_HOJA_DESTINO, !enSeco);
      plan.res.derivadas = d.total;
    } catch (err) {
      Logger.log('>>> Las derivadas NO se recalcularon: %s (el resto de la corrida sigue).', err);
    }
  }

  // Las elecciones: se guardan con su resultado y se vuelven a mostrar en las solapas regeneradas.
  guardarElecciones_(plan.elecciones, plan.eleccionesAp, enSeco, !enSeco && plan.res.escritura ? plan.res.escritura.completa : false);
  marcarEleccionesEnReportes_(plan);

  const fallaron = [];
  if (historial) {
    // Las fichas, sólo de los últimos DIAS_ACTIVOS días (armarFichas_ filtra con esFilaActiva_); lo viejo
    // sin resolver, a HISTORICO_SIN_RESOLVER. SIN_MATCH y EMPAREJAR los regenera la próxima corrida normal.
    escribirReportes_(plan, fallaron, [RDV_HOJA_REVISAR]);
    _intentar_(fallaron, RDV_HOJA_HISTORICO, function () { escribirHistoricoSinResolver_(plan); });
  } else {
    escribirReportes_(plan, fallaron, null);
  }
  if (fallaron.length) {
    Logger.log('>>> NO se pudieron escribir: %s. Los demás reportes SÍ quedaron escritos, y los',
               fallaron.join(', '));
    Logger.log('    números de arriba son válidos igual. Para rehacer sólo uno: %s',
               'soloRevisarMatch() / soloEmparejarManual() / soloSinMatch()');
  }

  _registrarCorrida_(plan, enSeco, t0, fallaron, historial);
  Logger.log('tiempo de corrida: %s s (%s ms) | filas activas: %s | cerradas: %s (sin resolver: %s)',
             ((new Date() - t0) / 1000).toFixed(1), new Date() - t0, plan.res.activas, plan.res.cerradas,
             plan.res.cerradasSinResolver);
  return plan.res;
}

/**
 * Una línea por corrida en REGISTRO_UPSERT (intermedia): hora, modo, cuántas filas escribió (o
 * escribiría, en seco), celdas y uids escritos, pendientes de barrio, a revisar y sin match
 * [ventana | total]. Se acumula; no se limpia. Si falla, la corrida sigue: sólo lo loguea.
 */
function _registrarCorrida_(plan, enSeco, t0, fallaron, historial) {
  try {
    const r = plan.res;
    const ss = ssIntermedia_();
    let sh = ss.getSheetByName(RDV_HOJA_REGISTRO);
    // Las columnas 16 en adelante se sumaron el 02/10 (escritura en lote): si la solapa ya existía,
    // se completa el encabezado, sin tocar las filas.
    const encabezado = ['hora', 'modo', 'filas_escritas', 'celdas_escritas', 'uids_estampados',
                        'escribiria_ventana', 'escribiria_total', 'pendiente_barrio_ventana',
                        'pendiente_barrio_total', 'revisar_ventana', 'revisar_total',
                        'sin_match_ventana', 'sin_match_total', 'reportes_fallidos', 'ms',
                        'hoja_destino', 'escritura_completa', 'filas_por_escribir', 'tandas',
                        'huella_entradas', 'huella_plan', 'por_columna', 'alcance', 'derivadas'];
    if (!sh) {
      sh = ss.insertSheet(RDV_HOJA_REGISTRO);
      sh.appendRow(encabezado);
    } else if (sh.getLastColumn() < encabezado.length) {
      sh.getRange(1, 1, 1, encabezado.length).setValues([encabezado]);
    }
    const w = r.escritura || null;
    sh.appendRow([new Date(), enSeco ? 'en seco' : 'ESCRITURA', w ? w.filasHechas : 0, r.escritas || 0,
                  r.uidsEstampados || 0, r.escribiria.v, r.escribiria.t, r.pendienteBarrio.v,
                  r.pendienteBarrio.t, r.revisar.v, r.revisar.t, r.sinMatch.v, r.sinMatch.t,
                  (fallaron || []).join(', '), new Date() - t0,
                  RDV_HOJA_DESTINO, w ? _sn_(w.completa) : '', w ? w.filasPendientes : '',
                  w ? w.tandas : '', plan.huellas.entradas, plan.huellas.plan,
                  w ? JSON.stringify(w.porColumna) : '',
                  historial ? 'historial (paso 22)' : 'activas (' + DIAS_ACTIVOS + ' días)',
                  DERIVADAS_POR_SCRIPT ? (r.derivadas || 0) : 'fórmulas']);
  } catch (err) {
    Logger.log('[upsert] no se pudo escribir %s: %s (la corrida igual terminó)', RDV_HOJA_REGISTRO, err);
  }
}

// ===================== Cálculo =====================

/**
 * Todo el trabajo caro, en memoria. **No escribe una sola celda.**
 *
 * Son 802 × 776 evaluaciones y tarda unos segundos; separarlo de la escritura es lo que permite
 * reintentar una solapa sin volver a calcular, y lo que permite loguear los resultados aunque
 * después falle el servicio de Sheets.
 */
function calcularPlan_(enSeco, entradas, opciones) {
  // `entradas` (02/10): {dest, cands, comunas} ya leídos. Lo usa el paso 16 para recalcular con EL
  // MISMO plan que el upsert sobre el destino sin sus RDV_UID. Sin `entradas`, se leen acá.
  // `opciones.historial` (03/10): evaluar TODAS las filas, no sólo las activas (DIAS_ACTIVOS). Lo piden
  // las mediciones de una vez y la calibración; el upsert, el paso 2 en seco y el paso 20, no.
  const historial = !!(opciones && opciones.historial);
  const esActiva = function (f) { return historial || esFilaActiva_(f.fecha); };
  const dest = entradas ? entradas.dest : leerDestino_();
  const cands = entradas ? entradas.cands : leerCandidatos_();
  const comunas = entradas ? entradas.comunas : leerComunasMap_();

  Logger.log('Destino: %s filas con datos | formularios en B: %s | %s %s | gemelos descartados %s | ' +
             'candidatos %s', dest.filas.length, cands.formularios, MARCA_ANULADO, cands.anulados,
             cands.gemelos ? cands.gemelos.descartados : 0, cands.vivos.length);

  // Lo que eligió una persona en "elegido" (regla 4, 03/10): las nuevas de las solapas de revisión y
  // las guardadas en ELECCIONES_MATCH. Se aplican después del invariante (aplicarElecciones_).
  const elec = leerElecciones_(cands);

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
                sinMatch: contador_(), futuras: contador_(), pendienteBarrio: contador_(), ningunoPersona: contador_(),
                enVentana: 0, escritas: 0, uidsEstampados: 0,
                // DIAS_ACTIVOS (03/10): filas activas, cerradas, y cerradas sin RDV_UID ("sin resolver").
                activas: 0, cerradas: 0, cerradasSinResolver: 0, historial: historial };
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
                   nadaCerca: contador_(), nadaConOtraFigura: contador_(), nadaSinNada: contador_(),
                   sinFigSoloOtraComuna: contador_(),
                   listaNada: [], listaNadaHist: [],
                   ejemplosSinFigura: [], ejemplosConFigura: [] };

  // Cuántas escribiría gracias a la tolerancia de ±3 (antes caían debajo del umbral).
  const porTolerancia = contador_();

  /*
   * Las filas con un formulario de **comuna coincidente** que no entran: por qué. Con figura +
   * comuna deberían llegar alto aun con la fecha corrida (punto C).
   */
  const comunaCaso = { total: contador_(), escribiria: contador_(), motivos: {}, cruce: {},
                       noEntraPeroSeEscribe: contador_(), ejemplos: [], ejemplosHist: [],
                       ejemplosSeEscribe: [] };

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
  const revisarRefs = [];   // fila y mejor candidato de cada línea de filasRevisar, para las opciones
  /*
   * El veredicto de cada fila del destino, por número de fila: 'escribiria', 'REVISAR_MATCH',
   * 'SIN_MATCH', 'rdv_uid' o 'futura', con su motivo y su mejor candidato. Sólo registra lo que
   * ya se decidió; lo leen el cruce del 2f y medirFormulariosSinFigura().
   */
  const porFila = {};
  const sinPropio = contador_(), sinPropioReciente = contador_();
  const porSinFigEscribe = contador_(), porSinFigRevisa = contador_();   // SIN_FIGURA_POR_UBICACION
  const usados = {};
  // Grupo de gemelos → {c, fila} de la fila con RDV_UID que lo tiene (02/10).
  const tomadosGrupo = new Map();
  const hist = [];
  for (let k = 0; k < 10; k++) hist.push(contador_());
  const scoresVentana = [], scoresTotal = [];

  const cuenta = function (m, ev) {
    if (!motivos[m]) motivos[m] = contador_();
    sumar_(motivos[m], ev);
  };

  /*
   * --- vuelta 1: evaluar cada fila, con el desempate por evidencia adentro ---
   */
  const evals = [];
  for (let i = 0; i < dest.filas.length; i++) {
    const f = dest.filas[i];
    const ev = enVentanaAnalisis_(f.fecha);
    if (ev) res.enVentana++;

    // Reuniones futuras: no son hueco, todavía no corresponde completarlas.
    if (f.fecha && f.fecha > _hoy_()) {
      sumar_(res.futuras, ev); porFila[f.fila] = { veredicto: 'futura' }; continue;
    }

    // Filas activas (DIAS_ACTIVOS, 03/10): una fila cerrada no se evalúa ni se escribe. Si tiene RDV_UID,
    // su formulario sigue reservado (abajo): el invariante es sobre todo el historial.
    const activa = esActiva(f);
    if (activa) res.activas++;
    else res.cerradas++;

    if (f.uid) {
      // El formulario de una fila ya estampada: por la traza (form_clave, si no form_origen), no por
      // la fila de B. Reserva su GRUPO de gemelos: ninguna otra fila puede tomar un formulario con
      // ese nombre (regla 3). Si la traza es ambigua (gemelos, sin form_clave), se reserva el grupo
      // y no se completa nada: no hay decisión.
      const t = formularioDeTraza_(f, cands.vivos);
      sumar_(res.porUid, ev);
      porFila[f.fila] = { veredicto: 'rdv_uid', cand: t.c, grupo: t.grupo, ambiguo: t.ambiguo };
      if (t.grupo && !tomadosGrupo.has(t.grupo)) tomadosGrupo.set(t.grupo, { c: t.c, fila: f.fila });
      if (!activa) porFila[f.fila].cerrada = true;
      if (t.c) {
        if (activa) decisiones.push({ fila: f, cand: t.c, score: 1, nivel: 'rdv_uid', dist: null });
        usados[t.c.fila] = true;
      } else if (t.ambiguo) {
        (cands.gemelos.grupos || []).forEach(function (g) {
          if (g.grupo === t.grupo) g.forms.forEach(function (c) { usados[c.fila] = true; });
        });
      }
      continue;
    }
    if (!activa) {
      res.cerradasSinResolver++;
      porFila[f.fila] = { veredicto: 'cerrada', motivo: 'cerrada' };
      continue;
    }
    evals.push({ f: f, ev: ev, r: evaluarCandidatos_(f, cands.vivos, comunas) });
  }

  /*
   * --- el invariante "un formulario, una fila", después del desempate y sobre todo el plan ---
   * Cambia `r` de las filas que pierden un formulario compartido (re-evaluadas, o a revisión).
   */
  /*
   * --- pendiente_barrio (PENDIENTE_BARRIO_RECIENTE, 02/10) ---
   * Una fila de HOY o de AYER sin barrio en RDV todavía está incompleta: los barrios se cargan a
   * lo largo del día. Si se escribiría o iría a revisión, **no se escribe**: veredicto propio
   * `pendiente_barrio`, y se reevalúa en la corrida siguiente. Va ANTES del invariante, así no le
   * gana un formulario a otra fila. Una fila sin match sigue como hoy (sin match, se reevalúa sola).
   */
  if (PENDIENTE_BARRIO_RECIENTE) {
    evals.forEach(function (x) {
      const f = x.f;
      if (f.barrio || !f.fecha) return;
      if (x.r.veredicto !== 'escribiria' && x.r.veredicto !== 'REVISAR_MATCH') return;
      const d = diasEntre_(_hoy_(), f.fecha);
      if (d < 0 || d > DIAS_PENDIENTE_BARRIO) return;
      x.r = { mejor: x.r.mejor, segundoScore: x.r.segundoScore, margen: x.r.margen,
              veredicto: 'pendiente_barrio', motivo: 'pendiente_barrio', antes: x.r.veredicto };
    });
  }

  const aplicacion = aplicarFormularioUnico_(evals, cands.vivos, comunas, tomadosGrupo);

  // Las elecciones de una persona (25_Elecciones.js): después del invariante, con sus mismas reglas.
  const eleccionesAp = aplicarElecciones_(elec, dest, evals, cands, comunas, tomadosGrupo, porFila);

  // Cuántas margen_chico resolvió el desempate por evidencia, y cuántas no por el umbral.
  const desempateCnt = { senales: contador_(), distancia: contador_(), inscriptos: contador_(),
                         eje: contador_(), bajoUmbral: contador_() };

  /*
   * --- vuelta 2: con el resultado final de cada fila ---
   */
  for (let i = 0; i < evals.length; i++) {
    const f = evals[i].f, ev = evals[i].ev, r = evals[i].r;
    if (r.veredicto === 'ninguno_por_persona') {
      // "ninguno" (regla 4): no se escribe ni se vuelve a proponer hasta que aparezca un formulario nuevo.
      sumar_(res.ningunoPersona, ev);
      porFila[f.fila] = { veredicto: 'ninguno_por_persona', motivo: 'ninguno_por_persona', cand: null };
      continue;
    }
    if (r.veredicto === 'pendiente_barrio') {
      sumar_(res.pendienteBarrio, ev);
      porFila[f.fila] = { veredicto: 'pendiente_barrio', motivo: 'pendiente_barrio',
                          cand: r.mejor ? r.mejor.c : null, score: r.mejor ? r.mejor.score : null,
                          antes: r.antes };
      continue;   // no se escribe, no entra a los reportes; se reevalúa en la corrida siguiente
    }
    if (r.desempate) sumar_(desempateCnt[r.desempate], ev);
    if (r.desempateBajoUmbral) sumar_(desempateCnt.bajoUmbral, ev);

    /*
     * `sin_formulario_propio`: **toda reunión tiene formulario** (CLAUDE.md 1, confirmado el
     * 26/09). Una fila SIN_MATCH sin ningún formulario que pueda ser el suyo a ±tolerancia no es
     * un score que no alcanzó: es un formulario que falta en `B` o está mal fechado. Cambia sólo
     * el RÓTULO —el veredicto sigue siendo SIN_MATCH— para no presentar "falta el dato" como "el
     * score no alcanzó" (§6). El motivo original queda en `motivoScore`.
     */
    if (r.veredicto === 'SIN_MATCH' && !cercanosDeFila_(f, cands.vivos, comunas).propio) {
      r.motivoScore = r.motivo;
      r.motivo = 'sin_formulario_propio';
      sumar_(sinPropio, ev);
      if (f.fecha && diasEntre_(_hoy_(), f.fecha) < 7) sumar_(sinPropioReciente, ev);  // hoy − reunión
    }
    porFila[f.fila] = { veredicto: r.veredicto, motivo: r.motivo || '',
                        cand: r.mejor ? r.mejor.c : null, score: r.mejor ? r.mejor.score : null,
                        segundo: r.segundoScore == null ? null : r.segundoScore,
                        contendientes: r.contendientes || null, desempate: r.desempate || null,
                        porInvariante: r.porInvariante || null, empateMulti: !!r.empateMulti,
                        motivoScore: r.motivoScore || null };

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
        _desvioBajo_(desvio, f, r.mejor, cands.vivos, ev, comunas);
      }
      if (r.veredicto === 'escribiria' && r.mejor.dist !== null && r.mejor.dist >= 1 &&
          r.mejor.dist <= TOLERANCIA_REPROGRAMACION_DIAS) sumar_(porTolerancia, ev);
    }
    _casoComuna_(comunaCaso, f, r, cands.vivos, comunas, ev);

    if (!r.mejor) {
      sumar_(res.sinMatch, ev); cuenta(r.motivo || 'sin_candidatos', ev);
      filasSinMatch.push([f.clave, f.figura, f.barrio, fmtFecha_(f.fecha),
                          r.motivo || 'sin_candidatos', '', '', f.evento, _sn_(ev)]);
      continue;
    }

    if (r.veredicto === 'escribiria') {
      sumar_(res.escribiria, ev);
      if (r.mejor.porSinFigura) sumar_(porSinFigEscribe, ev);
      // La traza dice por qué ganó: el desempate por evidencia, y si la fila tomó otro formulario
      // porque el suyo lo ganó otra fila (invariante "un formulario, una fila").
      const traza = r.mejor.nivel + (r.desempate ? '+desempate_por_' + _nombreCriterio_(r.desempate) : '') +
                    (r.porInvariante ? '+formulario_unico' : '') + (r.elegido ? '+elegido_por_persona' : '');
      decisiones.push({ fila: f, cand: r.mejor.c, score: r.mejor.score,
                        nivel: traza, dist: r.mejor.dist });
      usados[r.mejor.c.fila] = true;
    } else if (r.veredicto === 'REVISAR_MATCH') {
      if (r.mejor.porSinFigura) sumar_(porSinFigRevisa, ev);
      sumar_(res.revisar, ev); cuenta(r.motivo, ev);
      // Una reubicación posible se dice en palabras: qué dice el formulario y qué dice RDV.
      const nivelRev = r.motivo === 'ubicacion_en_desacuerdo'
        ? r.mejor.nivel + ' | ' + _detalleDesacuerdo_(f, r.mejor.c, comunas) + ' — posible reubicación'
        : r.mejor.nivel;
      filasRevisar.push([f.clave, f.figura, f.barrio, fmtFecha_(f.fecha),
                         r.mejor.c.nombre, r.mejor.score, r.segundoScore, r.margen,
                         r.motivo, nivelRev, _sn_(ev)]);
      revisarRefs.push({ f: f, primero: r.mejor.c });
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

  const resueltas = {}, tomadoPor = {};
  decisiones.forEach(function (d) {
    if (d.noEscribir) return;
    resueltas[d.fila.fila] = true;
    if (d.cand) tomadoPor[d.cand.fila] = d.fila.fila;
  });
  // Las pendientes de barrio tampoco van a EMPAREJAR_MANUAL: se reevalúan solas.
  Object.keys(porFila).forEach(function (k) {
    // Y las cerradas (DIAS_ACTIVOS): no se proponen.
    if (porFila[k].veredicto === 'pendiente_barrio' || porFila[k].veredicto === 'ninguno_por_persona' ||
        porFila[k].veredicto === 'cerrada' || porFila[k].cerrada) resueltas[k] = true;
  });
  // Las opciones de cada fila a revisar: hasta OPCIONES_REVISION formularios, con sus puntajes.
  revisarRefs.forEach(function (x, i) {
    filasRevisar[i] = filasRevisar[i].concat(
      _opcionesDeFila_(x.f, cands.vivos, comunas, tomadoPor, x.primero, OPCIONES_REVISION), ['', '']);
  });
  const emp = calcularEmparejar_(dest, cands, comunas, usados, resueltas, tomadoPor);

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

  const ejes = medirEjes_(dest, cands, comunas, porFila);

  // El invariante "un formulario, una fila": ya se aplicó entre las dos vueltas. Acá se CHEQUEA
  // sobre el resultado final: tiene que dar 0 formularios con 2+ filas escritas.
  const invariante = { aplicacion: aplicacion,
                       chequeo: chequearFormularioUnico_(dest, cands.vivos, comunas, porFila) };

  Logger.log('filas activas: %s (%s) | cerradas: %s (sin resolver, sin RDV_UID: %s) | futuras: %s',
             res.activas, historial ? 'todo el historial' : descActivas_(), res.cerradas,
             res.cerradasSinResolver, res.futuras.t);

  const huellas = huellasDelPlan_(dest, cands, comunas, porFila);
  Logger.log('Huella de entradas: %s  (destino %s | B %s | figuras %s | Comunas %s) — plan: %s',
             huellas.entradas, huellas.destino, huellas.b, huellas.figuras, huellas.comunas, huellas.plan);

  return { dest: dest, cands: cands, res: res, motivos: motivos, hist: hist, ejes: ejes,
           huellas: huellas, elecciones: elec, eleccionesAp: eleccionesAp,
           invariante: invariante, desempateCnt: desempateCnt,
           desvio: desvio, porTolerancia: porTolerancia, comunaCaso: comunaCaso, porFila: porFila,
           sinPropio: sinPropio, sinPropioReciente: sinPropioReciente,
           porSinFigEscribe: porSinFigEscribe, porSinFigRevisa: porSinFigRevisa,
           comunas: comunas,
           bajo: bajo, comunaDifieren: comunaDifieren, formsConComuna: formsConComuna,
           formsConRechazo: formsConRechazo, formsSinFechaTexto: formsSinFechaTexto,
           evStats: evStats, evBase: evBase, ejemplosEvento: ejemplosEvento,
           scoresVentana: scoresVentana, scoresTotal: scoresTotal,
           filasRevisar: filasRevisar, filasSinMatch: filasSinMatch,
           decisiones: decisiones, emp: emp };
}

function _sn_(b) { return b ? 'TRUE' : 'FALSE'; }

/**
 * Las huellas de una corrida (02/10): un hash corto de cada entrada del plan, y uno del plan.
 *
 * Existen por el paso 2 de las 14:35 contra la escritura de las 14:50 del 02/10, que dieron
 * distinto (755 | 42 | 13 contra 758 | 39 | 13). Los dos caminos calculan el plan con el MISMO
 * código —`calcularPlan_`; `enSeco` sólo decide si después se escribe—, y el plan no depende de la
 * hora salvo por el día. Así que si dos corridas dan distinto, cambió una entrada. Con estas huellas
 * en el log y en REGISTRO_UPSERT se ve cuál: misma huella de entradas → mismo plan, siempre.
 *
 *   destino   por fila: figura, barrio, fecha, hora, evento, si tiene RDV_UID, form_origen, form_clave
 *   B         B CRUDO, todas las celdas, antes de cualquier descarte (leerCandidatos_)
 *   figuras   la lista que sale de la columna Figura (decide figuras por apellido y multi_figura)
 *   Comunas   barrio → comuna
 *   plan      por fila: veredicto, motivo y formulario elegido
 */
function huellasDelPlan_(dest, cands, comunas, porFila) {
  const d = dest.filas.map(function (f) {
    return [f.fila, f.figura, f.barrio, f.fecha ? ymd_(f.fecha) : '', f.horaMin, f.evento,
            f.uid ? 'u' : '', f.formOrigen, f.formClave].join('|');
  }).join('\n');
  // B: la huella de B CRUDO, antes de cualquier descarte (leerCandidatos_). Si no está, la de los vivos.
  const b = cands.huellaCruda || cands.vivos.map(function (c) {
    return [c.clave, c.inscriptos, JSON.stringify(c.datos)].join('|');
  }).join('\n');
  const fig = _listas_().figuras.map(function (x) { return x.norm; }).join('|');
  const com = [];
  comunas.forEach(function (v, k) { com.push(k + '=' + v); });
  const p = Object.keys(porFila).map(Number).sort(function (x, y) { return x - y; }).map(function (k) {
    const x = porFila[k];
    return k + ':' + x.veredicto + ':' + (x.motivo || '') + ':' + (x.cand ? x.cand.clave : '');
  }).join('\n');
  const h = { destino: _md5corto_(d), b: _md5corto_(b), figuras: _md5corto_(fig),
              comunas: _md5corto_(com.sort().join('|')), plan: _md5corto_(p) };
  h.entradas = _md5corto_([h.destino, h.b, h.figuras, h.comunas].join('|'));
  return h;
}

function _md5corto_(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8);
  return bytes.slice(0, 4).map(function (x) { return ('0' + ((x + 256) % 256).toString(16)).slice(-2); }).join('');
}

// ===================== Opciones para la revisión manual =====================

/**
 * Los encabezados de las opciones: siete columnas por opción —con `op{n}_clave`, la clave estable del
 * formulario (03/10), que es lo que lee "elegido"—, y al final "elegido" (lo escribe una persona) y
 * "resultado" (lo escribe el sistema: aplicado / rechazado / ninguno). Ver 25_Elecciones.js.
 */
function _encabezadoOpciones_(n) {
  const h = [];
  for (let k = 1; k <= n; k++) {
    h.push('op' + k + '_formulario', 'op' + k + '_clave', 'op' + k + '_fila_B', 'op' + k + '_inscriptos',
           'op' + k + '_score', 'op' + k + '_senales', 'op' + k + '_tomado_por');
  }
  h.push('elegido', 'resultado');
  return h;
}

/**
 * Hasta `n` formularios candidatos de una fila, por puntaje de mayor a menor (`listaOpcionesFila_`), con
 * `primero` (el que el sistema eligió o propone) siempre adentro. Siete celdas por opción; las que faltan, vacías.
 *
 * Del destino no muestra nada más que lo que ya está en la fila (CLAUDE.md 1: los inscriptos del
 * destino son sólo validación). Los inscriptos que se muestran son los del FORMULARIO.
 */
function _opcionesDeFila_(f, vivos, comunas, tomadoPor, primero, n) {
  const lista = listaOpcionesFila_(f, vivos, comunas, primero, n);
  const out = [];
  for (let k = 0; k < n; k++) {
    const sc = lista[k];
    if (!sc) { out.push('', '', '', '', '', '', ''); continue; }
    const t = tomadoPor[sc.c.fila];
    out.push(sc.c.nombre, sc.c.clave, sc.c.fila, sc.c.inscriptos || 0, sc.score, _senalesTexto_(sc, f, comunas),
             t == null ? 'libre' : (t === f.fila ? 'esta fila' : 'fila ' + t));
  }
  return out;
}

/**
 * Los formularios candidatos de una fila, como puntajes (`puntuar_`): **por puntaje, de mayor a menor**, a
 * igual puntaje por cercanía de fecha (03/10). Con `n`, las n primeras, con `primero` (el que el sistema
 * eligió o propone) siempre adentro. La usan REVISAR_MATCH (las dos formas: línea y fichas) y EMPAREJAR_MANUAL.
 */
function listaOpcionesFila_(f, vivos, comunas, primero, n) {
  const lista = [];
  for (let j = 0; j < vivos.length; j++) {
    const sc = puntuar_(f, vivos[j], comunas);
    if (!sc.relevante) continue;
    if (!sc.desacuerdo && sc.score <= 0) continue;
    lista.push(sc);
  }
  // Por puntaje, de mayor a menor; a igual puntaje, la más cercana en fecha; después, la clave del
  // formulario (orden estable, no depende de la fila de B). Corregido el 03/10: antes iba primero el
  // que el sistema eligió o propone, y en la 631 y la 309 la opción 1 tenía menos puntaje que la 2.
  lista.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    const da = a.dist === null ? Infinity : a.dist, db = b.dist === null ? Infinity : b.dist;
    if (da !== db) return da - db;
    return a.c.clave < b.c.clave ? -1 : (a.c.clave > b.c.clave ? 1 : 0);
  });
  if (!n) return lista;
  // El que el sistema eligió o propone (`primero`) está siempre entre las n: si quedó afuera, ocupa la última.
  const top = lista.slice(0, n);
  if (primero && top.length === n && !top.some(function (sc) { return sc.c === primero; })) {
    const sc = lista.find(function (x) { return x.c === primero; });
    if (sc) top[n - 1] = sc;
  }
  return top;
}

/** "figura ✓ · fecha 1 d · ubicación coincide (comuna) · eje -", para una persona. */
function _senalesTexto_(sc, f, comunas) {
  const p = [];
  p.push(sc.nombraFigura ? 'figura ✓'
    : sc.porSinFigura ? 'sin figura (por ubicación)'
    : sc.sinFigura ? 'sin figura' : 'otra figura');
  p.push(sc.dist === null ? 'fecha ?' : 'fecha ' + sc.dist + ' d');
  if (sc.desacuerdo) p.push('ubicación DESACUERDO (' + _detalleDesacuerdo_(f, sc.c, comunas) + ')');
  else if (sc.evaluables.ubic) {
    p.push('ubicación coincide (' + (/barrio/.test(sc.nivel) ? 'barrio' : /comuna/.test(sc.nivel) ? 'comuna' : 'eje') + ')');
  } else p.push('ubicación no evaluable');
  if (sc.c.eje && sc.c.eje.tipo === 'eje') {
    const ejeF = ejeDeBarrio_(f.barrio);
    p.push('eje ' + sc.c.eje.eje + (!ejeF ? ' (RDV sin eje)' : sc.ejeCoincide ? ' = RDV' : ' ≠ RDV ' + ejeF));
  } else p.push('eje -');
  if (sc.multiFigura) p.push('multi_figura (' + sc.c.figurasNorm.length + ' figuras)');
  return p.join(' · ');
}

/**
 * Los inscriptos que el DESTINO tiene cargados en la fila: `null` si no hay columna o la celda
 * está vacía; 0 es "sin cargar" y lo interpreta quien llama.
 *
 * **Sólo validación** (regla de negocio, CLAUDE.md 1): lo leen la calibración del paso 10, las
 * mediciones y las herramientas de revisión, que sólo loguean. **Nunca** el score, un desempate,
 * el invariante ni ninguna decisión de escribir: el sistema no va a tener ese dato.
 */
function _insDestino_(dest, f) {
  const i = dest.D['Inscriptos'];
  if (i == null) return null;
  const v = f.valores[i];
  return esVacio_(v) ? null : numOcero_(v);
}

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
/**
 * Línea fija del paso 2 (regla operativa del 01/10: el match del día corre después de las 17).
 * Los barrios de RDV se cargan a lo largo del día: una fila de hoy o de ayer **sin barrio**
 * todavía está incompleta. Cuántas hay, y la PROPUESTA a medir —sin implementar—: una fila sin
 * barrio con menos de 1 día de antigüedad no se evalúa hasta la próxima corrida. Caso: "Comuna 1
 * Sur - 1/10" (125) calza con dos filas del 1/10 (Retiro y Monserrat) todavía incompletas.
 */
function _logSinBarrioReciente_(plan) {
  const hoy = _hoy_(), lista = [];
  plan.dest.filas.forEach(function (f) {
    if (!f.fecha || f.barrio) return;
    const d = diasEntre_(hoy, f.fecha);
    if (d === 0 || d === 1) lista.push({ f: f, d: d, pf: plan.porFila[f.fila] || {} });
  });
  const deHoy = lista.filter(function (x) { return x.d === 0; });
  const cambiaria = lista.filter(function (x) { return x.pf.veredicto === 'pendiente_barrio'; });
  Logger.log('  filas de HOY o de AYER sin barrio en RDV (todavía incompletas): %s   (hoy %s, ayer %s)',
             lista.length, deHoy.length, lista.length - deHoy.length);
  lista.forEach(function (x) {
    Logger.log('    fila %s | %s | %s | %s%s%s', x.f.fila, fmtFecha_(x.f.fecha), x.f.figura,
               x.pf.veredicto || '?', x.pf.motivo ? '/' + x.pf.motivo : '',
               x.pf.cand ? ' ← ' + x.pf.cand.nombre : '');
  });
  if (lista.length) {
    Logger.log('    PENDIENTE_BARRIO_RECIENTE = %s: las que se escribirían o irían a revisión quedan como ' +
               'pendiente_barrio y se reevalúan en la corrida siguiente: %s de %s.',
               PENDIENTE_BARRIO_RECIENTE, cambiaria.length, lista.length);
  }
}

/**
 * Línea fija del paso 2 (regla 10): cuántos pares decidió la subzona de la Comuna 1 —formulario
 * "Comuna 1 Norte/Sur" contra una fila de un barrio con subzona, a ±TOLERANCIA_REPROGRAMACION_DIAS—,
 * [ventana | total], con los casos y en qué quedó la fila. Se espera que "Comuna 1 Sur - 1/10"
 * quede para Monserrat (808) y que el 3/9 siga igual (Landerreche ← Sur, Tapia ← Norte).
 */
function _logSubzona_(plan) {
  const coincide = contador_(), desac = contador_(), casos = [];
  plan.dest.filas.forEach(function (f) {
    const pf = plan.porFila[f.fila];
    if (!pf || pf.veredicto === 'futura' || !subzonaDeBarrio_(f.barrio)) return;
    const cDest = plan.comunas.get(normalizeText_(f.barrio));
    if (cDest !== 1) return;
    const ev = enVentanaAnalisis_(f.fecha);
    plan.cands.vivos.forEach(function (c) {
      if (c.comuna !== 1 || !c.subzona) return;
      const d = distanciaFecha_(f.fecha, c.det);
      if (d === null || d > TOLERANCIA_REPROGRAMACION_DIAS) return;
      const cmp = comparaComuna_(f.barrio, cDest, c);
      sumar_(cmp.coincide ? coincide : desac, ev);
      casos.push({ f: f, ev: ev, c: c, d: d, cmp: cmp, pf: pf });
    });
  });
  Logger.log('  pares que decidió la SUBZONA de la Comuna 1 (regla 10, a ±%s días): coincide %s | ' +
             'desacuerdo %s', TOLERANCIA_REPROGRAMACION_DIAS, _dc_(coincide), _dc_(desac));
  _ordenarPorFila_(casos).slice(0, 30).forEach(function (x) {
    Logger.log('    [%s] fila %s | %s | %s | %s (Comuna 1 %s) ↔ %s: %s, %s días | la fila: %s%s%s',
               x.ev ? 'ventana' : 'histor.', x.f.fila, fmtFecha_(x.f.fecha), x.f.figura, x.f.barrio,
               x.cmp.subzonaDestino, x.c.nombre, x.cmp.coincide ? 'coincide' : 'DESACUERDO', x.d,
               x.pf.veredicto || '?', x.pf.motivo ? '/' + x.pf.motivo : '',
               x.pf.cand === x.c ? (x.pf.veredicto === 'escribiria' ? ' (es el elegido)' : ' (es su mejor candidato)')
                                 : (x.pf.cand ? ' ← ' + x.pf.cand.nombre : ''));
  });
}

/**
 * Línea fija del paso 2: cuántos formularios suman figuras **por variante de grafía**
 * (FIGURAS_VARIANTES) o **sólo por apellido** (FIGURA_POR_APELLIDO), y cuántos sacan el barrio de
 * una **variante** (BARRIOS_VARIANTES), y cuáles, para ver que no entre basura. [ventana | total]
 * por la fecha del formulario.
 */
function _logFigurasPorApellido_(plan) {
  const cnt = { variante: contador_(), apellido: contador_(), barrio: contador_(), multi: contador_() };
  const casos = [], barrios = [];
  plan.cands.vivos.forEach(function (c) {
    const ev = enVentanaAnalisis_(c.det && c.det.mejor);
    const nv = (c.figurasVarianteNorm || []).length, na = (c.figurasApellidoNorm || []).length;
    if (nv) sumar_(cnt.variante, ev);
    if (na) sumar_(cnt.apellido, ev);
    if ((nv || na) && c.figurasNorm.length >= 2) sumar_(cnt.multi, ev);
    if (nv || na) casos.push({ c: c, ev: ev });
    if (c.barrioPorVariante) { sumar_(cnt.barrio, ev); barrios.push({ c: c, ev: ev }); }
  });
  Logger.log('  formularios con figuras por VARIANTE de grafía: %s | sólo por APELLIDO (FIGURA_POR_APELLIDO = %s): %s',
             _dc_(cnt.variante), FIGURA_POR_APELLIDO, _dc_(cnt.apellido));
  Logger.log('    de ésos, con 2+ figuras (→ multi_figura → revisión): %s', _dc_(cnt.multi));
  const orden = function (a, b) { return a.ev === b.ev ? 0 : (a.ev ? -1 : 1); };
  casos.sort(orden).slice(0, 40).forEach(function (x) {
    const v = figurasPorVariante_(x.c.nombre), a = figurasPorApellido_(x.c.nombre);
    Logger.log('    [%s] B fila %s | %s →%s%s | todas: %s', x.ev ? 'ventana' : 'histor.', x.c.fila, x.c.nombre,
               v.length ? ' por variante: ' + v.join(' + ') : '', a.length ? ' por apellido: ' + a.join(' + ') : '',
               figurasEnTexto_(x.c.nombre).join(' + '));
  });
  if (casos.length > 40) Logger.log('    ... y %s más', casos.length - 40);
  Logger.log('  formularios con el barrio sacado de una VARIANTE del legado (Vélez, Paternal, Pompeya, ' +
             'Lugano…): %s', _dc_(cnt.barrio));
  barrios.sort(orden).slice(0, 30).forEach(function (x) {
    Logger.log('    [%s] B fila %s | %s → %s', x.ev ? 'ventana' : 'histor.', x.c.fila, x.c.nombre, x.c.barrioPorVariante);
  });
}

/**
 * Las filas `sin_formulario_propio`, una por una (01/10: subieron de 2 a 4 en la ventana). Marca
 * las que con la regla simétrica de antes (±TOLERANCIA_REPROGRAMACION_DIAS para todos) tenían un
 * formulario propio y por eso eran `score_bajo`: son las que cambió la ventana asimétrica de
 * `fecha_fin` (un cierre DESPUÉS de la reunión ya no cuenta como cercano).
 */
function _logSinPropio_(plan) {
  const lista = plan.dest.filas.filter(function (f) {
    const pf = plan.porFila[f.fila];
    return pf && pf.motivo === 'sin_formulario_propio';
  });
  if (!lista.length) return;
  Logger.log('    sin_formulario_propio, una por una (%s):', lista.length);
  _ordenarPorFila_(lista.map(function (f) { return { f: f, ev: enVentanaAnalisis_(f.fecha) }; }))
    .forEach(function (x) {
      const f = x.f, figNorm = normalizeText_(f.figura);
      const cDest = f.barrio ? plan.comunas.get(normalizeText_(f.barrio)) : null;
      // ¿Con la regla simétrica de antes había uno propio?
      let antes = null;
      plan.cands.vivos.forEach(function (c) {
        const d = distanciaFecha_(f.fecha, c.det);
        if (d === null || d > TOLERANCIA_REPROGRAMACION_DIAS) return;
        const propio = c.figurasNorm.indexOf(figNorm) !== -1 ||
          (!c.figurasNorm.length && !(function () { const k = comparaComuna_(f.barrio, cDest, c); return k && !k.coincide; })());
        if (propio && (!antes || d < antes.d)) antes = { c: c, d: d };
      });
      Logger.log('      [%s] fila %s | %s | %s | %s%s', x.ev ? 'ventana' : 'histor.', f.fila,
                 fmtFecha_(f.fecha), f.figura, f.barrio || 'sin barrio',
                 antes ? '   ← ANTES score_bajo: con ±' + TOLERANCIA_REPROGRAMACION_DIAS + ' tenía B fila ' +
                         antes.c.fila + ' (' + antes.d + ' días, fuente ' + (antes.c.det.fuente || '-') + '): ' +
                         antes.c.nombre : '');
    });
}

/**
 * Línea de medición del paso 2 (01/10, regresión 801): filas con margen chico donde uno de los
 * empatados es multi_figura. El veto multi_figura se evalúa sobre el ganador del desempate, así
 * que una fila puede escribirse con un formulario simple aunque haya un multi_figura empatado.
 */
function _logEmpatesMulti_(plan) {
  const total = contador_(), resueltas = contador_(), siguen = contador_(), casos = [];
  plan.dest.filas.forEach(function (f) {
    const pf = plan.porFila[f.fila];
    if (!pf || !pf.empateMulti) return;
    const ev = enVentanaAnalisis_(f.fecha);
    sumar_(total, ev);
    sumar_(pf.veredicto === 'escribiria' ? resueltas : siguen, ev);
    casos.push({ f: f, ev: ev, pf: pf });
  });
  Logger.log('  empates con un candidato multi_figura: %s — resueltos a favor de un formulario simple %s, ' +
             'siguen en revisión %s', _dc_(total), _dc_(resueltas), _dc_(siguen));
  _ordenarPorFila_(casos).forEach(function (x) {
    const multis = (x.pf.contendientes || []).filter(function (s) { return s.multiFigura; })
      .map(function (s) { return s.c.nombre; });
    Logger.log('    [%s] fila %s | %s | %s | %s → %s%s ← %s | multi_figura empatado: %s',
               x.ev ? 'ventana' : 'histor.', x.f.fila, fmtFecha_(x.f.fecha), x.f.figura,
               x.f.barrio || 'sin barrio', x.pf.veredicto, x.pf.motivo ? '/' + x.pf.motivo : '',
               x.pf.cand ? x.pf.cand.nombre : '-', multis.join(' ; '));
  });
}

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
  Logger.log('VENTANA: %s en ventana / %s totales | corte: %s (%s)',
             r.enVentana, plan.dest.filas.length, fmtFecha_(inicioVentanaAnalisis_()),
             descVentanaAnalisis_());
  Logger.log('  Todo lo que sigue se lee [ventana | total]. El upsert procesa las %s filas —el',
             plan.dest.filas.length);
  Logger.log('  backfill de la Fase 6 llena el histórico— pero calibra sobre la ventana.');
  Logger.log('  Si las dos columnas difieren mucho, la de la derecha describe un origen que ya');
  Logger.log('  no existe y no sirve para decidir nada.');

  _logInvariante_(plan);
  _logGemelos_(plan);
  _logElecciones_(plan.elecciones, plan.eleccionesAp);

  Logger.log('--- 1. VEREDICTOS (base: %s | %s filas, sin las %s futuras) ---',
             base.v, base.t, _dc_(r.futuras));
  Logger.log('  por RDV_UID (ya estampadas): %s', _dc_(r.porUid));
  Logger.log('  "ninguno" de una persona (no se escriben ni se proponen): %s', _dc_(r.ningunoPersona));
  Logger.log('  escribiría .......... %s', _dcp_(r.escribiria, base));
  Logger.log('  a revisar ........... %s', _dcp_(r.revisar, base));
  Logger.log('  sin match ........... %s', _dcp_(r.sinMatch, base));
  Logger.log('  pendiente de barrio . %s   (hoy/ayer sin barrio en RDV; no se escribe, se reevalúa)',
             _dcp_(r.pendienteBarrio, base));
  Logger.log('  de las que escribiría, a 1-%s días (entran por la tolerancia de reprogramación; ' +
             'con la escala vieja quedaban abajo): %s', TOLERANCIA_REPROGRAMACION_DIAS,
             _dc_(plan.porTolerancia));
  Logger.log('  --- por motivo ---');
  Object.keys(plan.motivos).sort().forEach(function (m) {
    Logger.log('    %s: %s', m, _dc_(plan.motivos[m]));
  });
  _logSinPropio_(plan);
  _logEmpatesMulti_(plan);
  const dc = plan.desempateCnt;
  if (dc) {
    Logger.log('  desempate por evidencia (DESEMPATE_POR_EVIDENCIA = %s): por señales %s | por ' +
               'distancia %s | por inscriptos %s', DESEMPATE_POR_EVIDENCIA, _dc_(dc.senales),
               _dc_(dc.distancia), _dc_(dc.inscriptos));
    Logger.log('    ganador bajo el umbral o multi_figura (sigue en revisión): %s', _dc_(dc.bajoUmbral));
    Logger.log('    decididas por el EJE, último desempate (EJE_COMO_DESEMPATE = %s): %s   (se espera 0)',
               EJE_COMO_DESEMPATE, _dc_(dc.eje));
  }
  _logSinBarrioReciente_(plan);
  _logSubzona_(plan);
  _logFigurasPorApellido_(plan);
  Logger.log('  por la regla sin_figura_por_ubicacion (SIN_FIGURA_POR_UBICACION = %s): escribiría %s' +
             ' | a revisar %s', SIN_FIGURA_POR_UBICACION, _dc_(plan.porSinFigEscribe || contador_()),
             _dc_(plan.porSinFigRevisa || contador_()));
  if (plan.sinPropio && plan.sinPropio.t) {
    Logger.log('  sin_formulario_propio NO es un score que no alcanzó: toda reunión tiene formulario');
    Logger.log('  (CLAUDE.md 1), así que falta en B o está mal fechado. El veredicto sigue siendo');
    Logger.log('  SIN_MATCH; cambia sólo el rótulo. Lista para pasar: diagFormulariosFaltantes().');
    if (plan.sinPropioReciente.t) {
      Logger.log('    de esas, %s con la reunión hace menos de 7 días: POSIBLE que el formulario',
                 _dc_(plan.sinPropioReciente));
      Logger.log('    todavía no se haya importado. No es un hecho: volver a mirarlas en unos días.');
    }
  }
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
  const sinProp = plan.motivos['sin_formulario_propio'] || contador_();
  if (sinProp.t > 0) {
    Logger.log('      Y %s | %s son sin_formulario_propio: tampoco es el umbral, falta el formulario.',
               sinProp.v, sinProp.t);
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

  /*
   * De dónde sale la densidad. Hipótesis a confirmar o descartar (26/09: subió de 4,9 a 7,0):
   * son las filas de Jorge Macri, por los formularios que ahora reconocen la figura del prefijo.
   */
  Logger.log('  --- pares por figura de la fila (top 10, por total) ---');
  Logger.log('      %s  pares         filas  pares/fila  de ellos, sólo por el prefijo',
             _padD_('figura', 26));
  Object.keys(e.porFigura || {}).map(function (k) { return [k, e.porFigura[k]]; })
    .sort(function (a, b) { return b[1].pares.t - a[1].pares.t; })
    .slice(0, 10).forEach(function (x) {
      const nf = Object.keys(x[1].filas).length;
      Logger.log('      %s  %s  %s  %s        %s', _padD_(x[0], 26), _dc_(x[1].pares),
                 _pad_(nf, 5), _pad_(nf ? Math.round(x[1].pares.t * 10 / nf) / 10 : 0, 5),
                 _dc_(x[1].soloPrefijo));
    });
  Logger.log('  pares que existen SÓLO porque la figura sale del prefijo: %s de %s',
             _dc_(e.deSoloPrefijo || contador_()), _dc_(e.pares));
  Logger.log('    Si son la mayor parte de la subida, se confirma la hipótesis. Si no, la subida');
  Logger.log('    viene de otro lado y hay que mirar la tabla de arriba, no suponer.');

  const ts = e.topeSim;
  if (ts) {
    const dens = function (p, f) { return f ? Math.round(p * 10 / f) / 10 : 0; };
    Logger.log('  --- TOPE de %s pares por fila (MAX_PARES_POR_FILA = %s), con garantía ---', ts.n,
               MAX_PARES_POR_FILA === null ? 'null: sólo simulado, no aplicado' : MAX_PARES_POR_FILA);
    Logger.log('    cada fila se queda con sus %s mejores (score, después cercanía de fecha), pero', ts.n);
    Logger.log('    un formulario al que el tope dejaría SIN NINGÚN par conserva su mejor par, aunque');
    Logger.log('    exceda el tope de esa fila. Es la lista de propuestas: no cambia ningún veredicto.');
    Logger.log('    Números sobre la lista SIN tope.');
    Logger.log('    pares: %s  →  %s   (se cortan %s)', _dc_(ts.antes), _dc_(ts.despues),
               _dc_(ts.cortados));
    Logger.log('    densidad (ventana): %s → %s pares por fila (sin la garantía: %s)',
               dens(ts.antes.v, ts.filasAntes.v), dens(ts.despues.v, ts.filasDespues.v),
               dens(ts.despuesSinGarantiaV, ts.filasDespues.v));
    Logger.log('    filas que quedan con 0 pares: %s   (tendría que ser 0)', _dc_(ts.filasEnCero));
    Logger.log('    formularios sin ninguna propuesta: %s   (con la garantía, tendría que ser 0)',
               _dc_(ts.formsSinNada));
    if (ts.rescatados.length) {
      Logger.log('    --- %s formularios que sin la garantía desaparecían, y el par que conservan ---',
                 ts.rescatados.length);
      ts.rescatados.forEach(function (x) {
        Logger.log('      %s  →  %s %s | %s | score %s', x.c.nombre, x.p ? x.p.f.figura : '?',
                   x.p ? fmtFecha_(x.p.f.fecha) : '', x.p ? (x.p.f.barrio || 'sin barrio') : '',
                   x.p ? x.p.sc.score : '-');
      });
    }
    Object.keys(ts.porFig).map(function (k) { return [k, ts.porFig[k]]; })
      .sort(function (a, b) { return b[1].antes.v - a[1].antes.v; }).slice(0, 5)
      .forEach(function (x) {
        Logger.log('      %s  %s  →  %s', _padD_(x[0], 26), _dc_(x[1].antes), _dc_(x[1].despues));
      });
  }
  Logger.log('  formularios sin candidato ... %s   (sólo de reuniones activas: DIAS_ACTIVOS)', _dc_(e.formulariosHuerfanos));
  if (e.cerrados) {
    Logger.log('    formularios de reuniones CERRADAS sin usar, descartados (no proponen ni son huérfanos): %s',
               _dc_(e.cerrados.sinUsar));
    Logger.log('      de ésos, los que antes del 03/10 se contaban como "sin candidato": %s',
               _dc_(e.cerrados.habrianSidoHuerfanos));
  }
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
 * El mapeo barrio → eje vive en la planilla: `Comunas`, columna I (`COMUNAS_COL_EJE`), encabezado
 * `Eje geográfico`. 18 barrios los definió el equipo, 30 se completaron por comuna; los pendientes
 * terminan en `?` y **no se evalúan** (no puntúan ni descalifican). Contesta, sin que
 * `EJE_COMO_UBICACION` cambie nada:
 *
 *   a) la columna I: encabezado, y los barrios de cada eje (con los pendientes aparte);
 *   b) los formularios con eje contra las filas del destino con que se emparejarían (misma
 *      figura, a ±VENTANA_EMPAREJAR_DIAS): cuántos pares coincide / descartaría / no evaluable,
 *      y los PENDIENTES en una línea aparte (qué harían si se confirmaran). Se compara contra el
 *      82,5% de descarte del 25/09 con la Zona, y se listan los "descartaría" a 0-3 días: ésos son
 *      los que más importan, porque descartar ahí es perder un match correcto;
 *   c) los formularios temáticos: ¿hay ALGUNA fila de su figura a ± DIAS_TEMATICA_CERCANA?
 */
function medirEjes_(dest, cands, comunas, porFila) {
  // --- a) la columna del eje ---
  const col = infoColumnaEje_();
  // Ejes PRIORIZADOS (01/10): sólo los barrios que definió el equipo tienen eje. Celda vacía =
  // "no pertenece a ningún eje", no "pendiente". Un valor que no se reconoce se reporta aparte.
  const porEje = {}, pendientes = [], sinEje = [], noPertenece = [], conEjeBarrios = [];
  _listas_().barrios.forEach(function (b) {
    const info = ejeInfoDeBarrio_(b.canon);
    if (!info.eje && !b.ejeRaw) { noPertenece.push(b.canon); return; }
    if (!info.eje) { sinEje.push(b.canon + ' ("' + b.ejeRaw + '")'); return; }
    if (info.pendiente) { pendientes.push(b.canon + ' (' + info.raw + ')'); return; }
    conEjeBarrios.push(b.canon);
    // Un barrio con varios ejes ("Sur | Centro") aparece en cada uno, pero se cuenta una vez.
    info.ejes.forEach(function (k) {
      if (!porEje[k]) porEje[k] = { barrios: [], comunas: {} };
      porEje[k].barrios.push(b.canon + (info.ejes.length > 1 ? ' (' + info.eje + ')' : ''));
      if (b.comuna != null) porEje[k].comunas[b.comuna] = true;
    });
  });

  // --- b) formularios con eje ---
  const porForma = {};
  const cruce = {};              // eje del formulario × eje del barrio del destino → pares
  const pares = { total: contador_(), coincide: contador_(), descarta: contador_(),
                  noEvaluable: contador_(), pendCoincide: contador_(),
                  pendDescarta: contador_() };
  const detalle = [], descartaCerca = [];
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

        const info = ejeInfoDeBarrio_(f.barrio);
        let veredicto;
        const enEje = info.ejes.indexOf(e.eje) !== -1;     // con "Sur | Centro", cualquiera
        if (!info.eje) veredicto = 'no_evaluable';
        else if (info.pendiente) veredicto = enEje ? 'pend_coincide' : 'pend_descarta';
        else veredicto = enEje ? 'coincide' : 'descarta';

        sumar_(pares.total, ev);
        const kv = { coincide: 'coincide', descarta: 'descarta', no_evaluable: 'noEvaluable',
                     pend_coincide: 'pendCoincide', pend_descarta: 'pendDescarta' }[veredicto];
        sumar_(pares[kv], ev);
        const kc = e.eje + ' × ' + (info.eje ? info.eje + (info.pendiente ? '?' : '') : '(sin eje)');
        cruce[kc] = (cruce[kc] || 0) + 1;

        const comunaDest = f.barrio ? comunas.get(normalizeText_(f.barrio)) : null;
        const x = { fila: f.fila, fecha: f.fecha, figura: f.figura, barrio: f.barrio,
                    comuna: comunaDest, ejeDest: info.raw, dist: dist, veredicto: veredicto };
        filas.push(x);
        if ((veredicto === 'descarta' || veredicto === 'pend_descarta') && dist <= 3) {
          descartaCerca.push({ c: c, ev: ev, x: x });
        }
      }
      filas.sort(function (a, b) { return a.dist - b.dist; });
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

  /*
   * --- LA MÉTRICA QUE IMPORTA: ¿cuántas filas perderían a su ganador actual por el eje? ---
   *
   * El % de pares que descartaría cuenta todos los pares figura + fecha ±21, que en su mayoría
   * NO son la reunión correcta: sube o baja sin decir si el eje hace daño. Lo que sí lo dice es
   * cuántas filas que hoy se escriben —con su ganador, o con el del desempate— lo perderían
   * porque el eje del formulario no es el del barrio de la fila. Los pendientes (`?`), aparte.
   */
  const pierde = { total: contador_(), confirmado: contador_(), siSeConfirma: contador_(),
                   casos: [] };
  dest.filas.forEach(function (f) {
    const pf = porFila && porFila[f.fila];
    if (!pf || pf.veredicto !== 'escribiria' || !pf.cand) return;
    const e = pf.cand.eje;
    if (!e || e.tipo !== 'eje') return;
    const ev = enVentanaAnalisis_(f.fecha);
    sumar_(pierde.total, ev);
    const info = ejeInfoDeBarrio_(f.barrio);
    if (!info.eje || info.ejes.indexOf(e.eje) !== -1) return;
    sumar_(info.pendiente ? pierde.siSeConfirma : pierde.confirmado, ev);
    pierde.casos.push({ f: f, ev: ev, c: pf.cand, ejeForm: e.eje, ejeFila: info.raw,
                        pendiente: info.pendiente, desempate: pf.desempate });
  });

  return { pierde: pierde,
           col: col, porEje: porEje, pendientes: pendientes, sinEje: sinEje, noPertenece: noPertenece,
           conEjeBarrios: conEjeBarrios,
           porForma: porForma,
           conEje: conEje, desconocidos: desconocidos, pares: pares, cruce: cruce,
           detalle: detalle, descartaCerca: descartaCerca, tem: tem };
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
  Logger.log('      de esos, sólo de OTRA comuna (no pueden ser el suyo) %s',
             _dc_(d.sinFigSoloOtraComuna));
  Logger.log('    no, ninguno ........................ %s', _dcp_(d.nadaCerca, tot));
  Logger.log('    Si "lejos" es grande y "sin figura" también: el formulario correcto existe, no');
  Logger.log('    se reconoció la figura, y uno lejano que sí la nombra le ganó el lugar. Si');
  Logger.log('    domina "ninguno": el formulario no está en B con esa fecha — otra población.');
  Logger.log('    "ninguno", desglosado (hipótesis a confirmar, no un hecho):');
  Logger.log('      con un formulario a ±%s de OTRA figura .. %s', TOLERANCIA_REPROGRAMACION_DIAS,
             _dc_(d.nadaConOtraFigura));
  Logger.log('      sin ningún formulario a ±%s ............. %s', TOLERANCIA_REPROGRAMACION_DIAS,
             _dc_(d.nadaSinNada));
  Logger.log('      Si el salto de "ninguno" viene de la primera línea, no aparecieron filas sin');
  Logger.log('      formulario: formularios que antes no nombraban figura ahora nombran otra.');
  const nada = d.listaNada.concat(d.listaNadaHist);
  if (nada.length) {
    Logger.log('    --- las filas de "ninguno" (ventana primero; hasta 40 de cada) ---');
    nada.forEach(function (x) {
      Logger.log('      [%s] %s | %s | %s%s', x.ev ? 'ventana' : 'histor.', fmtFecha_(x.f.fecha),
                 x.f.figura, x.f.barrio || 'sin barrio',
                 x.otra ? '  ← a ' + x.x + ' días, de otra figura: ' + x.otra.nombre : '');
    });
  }

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
  Logger.log('    el más cercano en fecha es el que ganó (escribiría con él) %s',
             _dcp_(cc.escribiria, cc.total));
  Logger.log('    el más cercano NO es el que ganó, por motivo:');
  Object.keys(cc.motivos).sort().forEach(function (m) {
    Logger.log('      %s: %s', m, _dcp_(cc.motivos[m], cc.total));
  });
  // Para comparar con las corridas de antes del 26/09, donde las tres iban juntas.
  const viejo = contador_();
  ['otra_figura', 'sin_figura', 'posible_grafia'].forEach(function (m) {
    if (cc.motivos[m]) { viejo.v += cc.motivos[m].v; viejo.t += cc.motivos[m].t; }
  });
  Logger.log('    (otra_figura + sin_figura + posible_grafia = %s: es el ' +
             '"figura_no_reconocida_en_el_formulario" de las corridas anteriores)',
             _dcp_(viejo, cc.total));

  /*
   * Lo que el 2f NO dice, y que se leyó mal: el motivo es del FORMULARIO de comuna más cercano,
   * no de la fila. Una fila con motivo otra_figura (u otro) puede escribirse igual con otro
   * formulario. El cruce de abajo es el que separa las filas que de verdad no entran.
   */
  Logger.log('  --- cruce: motivo × veredicto de la FILA  [ventana | total] ---');
  const vs = ['escribiria', 'REVISAR_MATCH', 'SIN_MATCH'];
  Logger.log('      %s  escribiría    revisar       sin match', _padD_('motivo', 38));
  Object.keys(cc.cruce).sort().forEach(function (m) {
    const x = cc.cruce[m];
    Logger.log('      %s  %s', _padD_(m, 38), vs.map(function (v) {
      return _dc_(x[v] || contador_());
    }).join('   '));
  });
  const noEntran = { v: cc.total.v - cc.escribiria.v, t: cc.total.t - cc.escribiria.t };
  Logger.log('  >>> De las %s | %s donde el más cercano no ganó, %s son filas que IGUAL SE ESCRIBEN',
             noEntran.v, noEntran.t, _dc_(cc.noEntraPeroSeEscribe));
  Logger.log('      (con otro formulario). Esas no son filas que fallan: es otro formulario el que');
  Logger.log('      ganó. Las que fallan de verdad son las columnas revisar y sin match.');

  const lista = cc.ejemplos.concat(cc.ejemplosHist);
  if (lista.length) {
    Logger.log('  --- filas que NO se escriben (ventana primero; hasta 25 de cada) ---');
    lista.forEach(function (x) {
      Logger.log('    [%s] %s ← %s', x.ev ? 'ventana' : 'histor.', x.f.clave, x.sc.c.nombre);
      Logger.log('        %s | %s días | score %s (%s) | fila: %s%s', x.motivo,
                 x.sc.dist === null ? '-' : x.sc.dist, x.sc.score, x.sc.nivel, x.veredicto,
                 x.rmotivo ? ' / ' + x.rmotivo : '');
      if (x.ganador) {
        Logger.log('        mejor candidato de la fila (score %s, %s días): %s', x.ganador.score,
                   x.ganador.dist, x.ganador.c.nombre);
      }
    });
  }
  Logger.log('  (%s filas que se escriben con otro formulario no se listan: no son un problema.)',
             cc.ejemplosSeEscribe.length >= 25 ? '25+' : cc.ejemplosSeEscribe.length);
}

/** Relleno a la derecha, para columnas de texto en el log. */
function _padD_(s, n) {
  s = String(s);
  while (s.length < n) s += ' ';
  return s;
}

/** El bloque 2e del log. Ver `medirEjes_`. */
function _logEjes_(m) {
  Logger.log('--- 2e. EL EJE GEOGRÁFICO (temáticas sin barrio ni comuna) ---');
  Logger.log('  EJE_COMO_UBICACION = %s  (DECISIÓN del 30/09: queda apagado; peso si se encendiera %s,',
             EJE_COMO_UBICACION, PESOS_MATCH.ejeSinComuna);
  Logger.log('  y un eje distinto DESCALIFICARÍA)');

  // La métrica principal: filas que perderían a su ganador actual por el eje.
  const pi = m.pierde;
  if (pi) {
    Logger.log('  >>> FILAS QUE PERDERÍAN A SU GANADOR ACTUAL POR EL EJE (la cifra que dice si hace daño):');
    Logger.log('      de %s filas escritas con un formulario con eje:', _dc_(pi.total));
    Logger.log('        con eje confirmado ....... %s', _dc_(pi.confirmado));
    Logger.log('        si se confirmaran los "?" %s', _dc_(pi.siSeConfirma));
    _ordenarPorFila_(pi.casos).forEach(function (x) {
      Logger.log('      [%s] fila %s %s | %s | %s (eje %s%s) ← gana hoy%s: %s (Eje %s)',
                 x.ev ? 'ventana' : 'histor.', x.f.fila, fmtFecha_(x.f.fecha), x.f.figura,
                 x.f.barrio || 'sin barrio', x.ejeFila, x.pendiente ? ', PENDIENTE' : '',
                 x.desempate ? ' por desempate' : '', x.c.nombre, x.ejeForm);
    });
    if (!pi.casos.length) Logger.log('      ninguna: el eje no le sacaría el ganador a ninguna fila.');
  }

  // a) la columna del eje
  Logger.log('  a) Comunas, columna %s: encabezado "%s" → %s', COMUNAS_COL_EJE,
             m.col.encabezado || '(la tabla no llega a esa columna)',
             m.col.valido ? 'OK' : 'NO es "' + COMUNAS_ENCABEZADO_EJE + '": el eje NO se evalúa');
  if (!m.col.valido) {
    Logger.log('  >>> Sin la columna "%s", ningún barrio tiene eje evaluable. Revisar la columna %s',
               COMUNAS_ENCABEZADO_EJE, COMUNAS_COL_EJE);
    Logger.log('      de Comunas antes de mirar el resto de este bloque.');
  }
  Object.keys(m.porEje).sort().forEach(function (k) {
    const x = m.porEje[k];
    Logger.log('     %s → comunas %s | %s barrios: %s', k,
               Object.keys(x.comunas).sort(function (p, q) { return p - q; }).join(',') || '-',
               x.barrios.length, x.barrios.join(', '));
  });
  const conEjeN = (m.conEjeBarrios || []).length;
  Logger.log('     barrios CON eje (priorizados): %s | SIN eje (celda vacía = no pertenece a ningún ' +
             'eje): %s   (se esperan 18 | 30)', conEjeN, (m.noPertenece || []).length);
  if (conEjeN !== 18) {
    /*
     * Sólo se informa; no se cambia nada (01/10). La lista de los 18 del 30/09 no quedó escrita
     * en el repo, así que no se puede decir con certeza cuál sobra: se listan los barrios con eje
     * (arriba, por eje) y se marca la sospecha del usuario. Lo confirma el usuario con el equipo.
     */
    Logger.log('     >>> %s %s respecto de los 18 de la lista confirmada por el equipo el 01/10 ' +
               '(CLAUDE.md 1.d). Comparar con las listas por eje de arriba; no se cambia nada.',
               Math.abs(conEjeN - 18), conEjeN > 18 ? 'SOBRA(N)' : 'FALTA(N)');
  }
  Logger.log('     pendientes ("?", sólo como posibilidad; no se evalúan): %s%s', m.pendientes.length,
             m.pendientes.length ? ' — ' + m.pendientes.join(', ') : '');
  if (m.sinEje.length) {
    Logger.log('     valor NO reconocido en la columna (revisar la celda): %s — %s', m.sinEje.length,
               m.sinEje.join(', '));
  }

  // b) formularios con eje
  Logger.log('  b) formularios con eje ............ %s', _dc_(m.conEje));
  Object.keys(m.porForma).sort().forEach(function (k) {
    Logger.log('       %s: %s', k, _dc_(m.porForma[k]));
  });
  m.desconocidos.forEach(function (d) {
    Logger.log('     eje no reconocido "%s" | %s', d.forma, d.nombre);
  });
  const p = m.pares;
  Logger.log('     (dato secundario: los pares figura + fecha ±21 no son, en su mayoría, la reunión correcta)');
  Logger.log('     pares figura + fecha ±%s contra filas del destino: %s', VENTANA_EMPAREJAR_DIAS,
             _dc_(p.total));
  Logger.log('       el eje coincide ...... %s', _dcp_(p.coincide, p.total));
  Logger.log('       el eje DESCARTARÍA ... %s   (dato secundario: 25/09 con la Zona 82,5%%; 29/09 con la columna I 66,4%%)',
             _dcp_(p.descarta, p.total));
  Logger.log('       no evaluable ......... %s  (el barrio del destino no tiene eje)',
             _dcp_(p.noEvaluable, p.total));
  Logger.log('       pendientes: coincidiría %s / descartaría %s  (si se confirmaran tal cual)',
             _dc_(p.pendCoincide), _dc_(p.pendDescarta));
  Logger.log('     cruce eje del formulario × eje del barrio del destino ("?" = pendiente):');
  Object.keys(m.cruce).sort().forEach(function (k) {
    Logger.log('       %s: %s', k, m.cruce[k]);
  });

  // Los descartes que más importan: a 0-3 días, donde descartar es perder un match correcto.
  const cerca = m.descartaCerca.slice().sort(function (a, b) {
    if (a.ev !== b.ev) return a.ev ? -1 : 1;
    return a.x.dist - b.x.dist;
  });
  Logger.log('     --- "descartaría" a 0-3 días (ventana primero): %s ---', cerca.length);
  Logger.log('     (son los que más importan: descartar ahí es perder un match correcto)');
  cerca.slice(0, 40).forEach(function (y) {
    Logger.log('       [%s] %s días | fila %s %s | %s | %s (eje %s%s) ← Eje %s: %s',
               y.ev ? 'ventana' : 'histor.', y.x.dist, y.x.fila, fmtFecha_(y.x.fecha), y.x.figura,
               y.x.barrio || 'sin barrio', y.x.ejeDest,
               y.x.veredicto === 'pend_descarta' ? ', PENDIENTE' : '', y.c.eje.eje, y.c.nombre);
  });

  const lim = 30;
  Logger.log('     --- %s formularios con eje, con sus filas candidatas (primeros %s) ---',
             m.detalle.length, lim);
  m.detalle.slice(0, lim).forEach(function (d) {
    Logger.log('     [%s] B fila %s | Eje %s | %s | %s', d.ev ? 'ventana' : 'histor.', d.c.fila,
               d.c.eje.eje, fmtFecha_(d.c.det.mejor) || 'sin fecha', d.c.nombre);
    if (!d.filas.length) Logger.log('         (ninguna fila de la figura a ±%s días)',
                                    VENTANA_EMPAREJAR_DIAS);
    d.filas.forEach(function (x) {
      Logger.log('         fila %s  %s días  %s | comuna %s | eje %s → %s', x.fila, x.dist,
                 x.barrio || 'sin barrio', x.comuna == null ? '-' : x.comuna,
                 x.ejeDest || '-', x.veredicto);
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
    Logger.log('      histórico completo, que describe el formulario viejo. Sobre la ventana');
    Logger.log('      (%s) el corte estable está en %s (medio del valle): cambiarlo a ese',
               descVentanaAnalisis_(), medio);
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

  if (quiere(RDV_HOJA_REVISAR) && REVISAR_COMO_FICHAS) {
    // Las fichas (26_Fichas.js, 03/10): una por reunión pendiente activa, con las elecciones guardadas.
    _intentar_(fallaron, RDV_HOJA_REVISAR, function () {
      const fx = armarFichas_(plan, plan.asistentes || cruzarAsistentes_(plan.dest, plan.comunas));
      if (SOLAPA_FICHAS_EN_DESTINO) {
        // En el archivo del destino, donde trabaja el equipo (06/10), protegida salvo ELEGIR y COMENTARIO.
        escribirFichas_(RDV_HOJA_REVISAR, fx, { ss: ssDestino_(), proteger: true });
        avisoFichasEnDestino_();
      } else {
        escribirFichas_(RDV_HOJA_REVISAR, fx);
      }
      Logger.log('[upsert] %s (%s): %s fichas pendientes | %s resueltas', RDV_HOJA_REVISAR,
                 SOLAPA_FICHAS_EN_DESTINO ? 'archivo del destino' : 'intermedia', fx.pendientes, fx.resueltas);
    });
  } else if (quiere(RDV_HOJA_REVISAR)) {
    _intentar_(fallaron, RDV_HOJA_REVISAR, function () {
      escribirReporte_(RDV_HOJA_REVISAR,
        ['clave', 'figura', 'barrio', 'fecha', 'form_origen', 'score', 'segundo', 'margen',
         'motivo', 'senales', 'en_ventana'].concat(_encabezadoOpciones_(OPCIONES_REVISION)),
        plan.filasRevisar);
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
/**
 * Los formularios de `B` a ±`TOLERANCIA_REPROGRAMACION_DIAS` de una fila del destino, por clase.
 * **El único lugar que decide si una fila tiene "su" formulario cerca**: lo usan el 2b, el motivo
 * `sin_formulario_propio` y `diagFormulariosFaltantes()`, para que no haya dos criterios.
 *
 *   conFig         el más cercano que nombra la figura de la fila
 *   sinFigMisma    el más cercano que no nombra a nadie y NO contradice la comuna de la fila
 *                  (su comuna coincide, o falta la de alguno de los dos)
 *   sinFigOtra     el más cercano que no nombra a nadie y es de OTRA comuna
 *   otraFig        el más cercano que nombra a otra figura
 *   propio         conFig || sinFigMisma: hay un formulario que puede ser el suyo
 *
 * Cada uno es `{ c, x }` (formulario y distancia en días) o `null`.
 */
function cercanosDeFila_(f, vivos, comunas) {
  const tol = TOLERANCIA_REPROGRAMACION_DIAS;
  const figNorm = normalizeText_(f.figura);
  const cDest = f.barrio ? comunas.get(normalizeText_(f.barrio)) : null;
  const r = { conFig: null, sinFigMisma: null, sinFigOtra: null, otraFig: null };
  const tomar = function (k, c, x) { if (!r[k] || x < r[k].x) r[k] = { c: c, x: x }; };
  for (let j = 0; j < vivos.length; j++) {
    const c = vivos[j];
    const x = distanciaFecha_(f.fecha, c.det);
    if (x === null || !fechaCercana_(f.fecha, c.det, tol)) continue;   // asimétrica con fecha_fin
    if (c.figurasNorm.indexOf(figNorm) !== -1) tomar('conFig', c, x);
    else if (!c.figurasNorm.length) {
      const cmp = comparaComuna_(f.barrio, cDest, c);
      const otra = !!(cmp && !cmp.coincide);
      tomar(otra ? 'sinFigOtra' : 'sinFigMisma', c, x);
    } else tomar('otraFig', c, x);
  }
  r.propio = !!(r.conFig || r.sinFigMisma);
  return r;
}

function _desvioBajo_(d, f, mejor, vivos, ev, comunas) {
  const k = mejor.dist === null ? 'sin fecha' : (mejor.dist > 21 ? '>21' : String(mejor.dist));
  if (!d.porDia[k]) d.porDia[k] = contador_();
  sumar_(d.porDia[k], ev);

  /*
   * Las tres poblaciones se cuentan como siempre —"sin figura" es cualquier formulario sin
   * figura a ±tolerancia, sea de la comuna que sea— para que el 2b siga siendo comparable con
   * las corridas anteriores. Aparte se cuenta cuántos de esos son sólo de OTRA comuna: ésos no
   * pueden ser el formulario de la fila.
   */
  const cer = cercanosDeFila_(f, vivos, comunas);
  const conFig = cer.conFig, otraFig = cer.otraFig;
  const sinFig = cer.sinFigMisma || cer.sinFigOtra;
  if (!cer.conFig && !cer.sinFigMisma && cer.sinFigOtra) sumar_(d.sinFigSoloOtraComuna, ev);

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
    /*
     * "ninguno" se conserva igual que antes —sin formulario de su figura ni formulario sin
     * figura a ±tolerancia— para que se pueda comparar contra corridas viejas. Adentro se separa
     * si había uno de OTRA figura: cuando figurasEnTexto_ dejó de limpiar prefijos, un
     * `JORGE MACRI - ...` cercano pasó de "sin figura" a "de otra figura" para una fila de otra
     * persona. Hipótesis a confirmar con este desglose.
     */
    sumar_(d.nadaCerca, ev);
    sumar_(otraFig ? d.nadaConOtraFigura : d.nadaSinNada, ev);
    const lista = ev ? d.listaNada : d.listaNadaHist;
    if (lista.length < 40) {
      lista.push({ f: f, ev: ev, otra: otraFig ? otraFig.c : null, x: otraFig ? otraFig.x : null });
    }
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

  /*
   * "El formulario no nombra la figura de la fila" son tres cosas distintas, y hasta el 26/09
   * iban juntas como `figura_no_reconocida_en_el_formulario` —un rótulo que sugería una falla
   * de reconocimiento—:
   *
   *   posible_grafia   algún apellido de la figura aparece en el nombre: puede ser el suyo,
   *                    escrito distinto (`Arengo Peragine`, sólo el apellido)
   *   otra_figura      el formulario nombra a OTRA figura: es otra reunión de la misma comuna
   *   sin_figura       el formulario no nombra a nadie
   *
   * La suma de las tres es el `figura_no_reconocida` de antes.
   */
  let motivo;
  if (best.perdido.figura > 0) motivo = _motivoSinSuFigura_(f.figura, best.c);
  else if (best.dist === null) motivo = 'formulario_sin_fecha';
  else if (best.dist > TOLERANCIA_REPROGRAMACION_DIAS) {
    motivo = best.dist <= 7 ? 'fecha_a_4_7_dias' : 'fecha_a_mas_de_7_dias';
  } else if (r.mejor && r.mejor.c !== best.c) motivo = 'gano_otro_candidato';
  else motivo = r.motivo || 'otro';

  if (!cc.motivos[motivo]) cc.motivos[motivo] = contador_();
  sumar_(cc.motivos[motivo], ev);

  /*
   * El cruce con el veredicto de la FILA. El motivo habla del formulario de comuna más cercano,
   * no de la fila: una fila puede tener motivo `otra_figura` y escribirse igual con otro
   * formulario. Sin este cruce, "no entran" se lee como "filas que fallan", y no lo es.
   */
  const v = r.veredicto || 'SIN_MATCH';
  if (!cc.cruce[motivo]) cc.cruce[motivo] = {};
  if (!cc.cruce[motivo][v]) cc.cruce[motivo][v] = contador_();
  sumar_(cc.cruce[motivo][v], ev);
  if (v === 'escribiria') sumar_(cc.noEntraPeroSeEscribe, ev);

  // Los ejemplos que interesan son los de filas que NO se escriben, y de la ventana primero.
  const ej = { f: f, sc: best, motivo: motivo, ev: ev,
               ganador: (r.mejor && r.mejor.c !== best.c) ? r.mejor : null,
               veredicto: r.veredicto, rmotivo: r.motivo };
  const lista = (v === 'escribiria') ? cc.ejemplosSeEscribe : (ev ? cc.ejemplos : cc.ejemplosHist);
  if (lista.length < 25) lista.push(ej);
}

/**
 * Por qué un formulario no nombra la figura de la fila: `posible_grafia` (aparece algún
 * apellido), `otra_figura` o `sin_figura`. Apellido = cada palabra de la figura menos la primera,
 * de 4 letras o más (`Gustavo Arengo Piragine` → arengo, piragine). Sólo clasifica: no matchea.
 */
function _motivoSinSuFigura_(figura, c) {
  const palabras = normalizeText_(figura).split(' ').filter(Boolean);
  const apellidos = (palabras.length > 1 ? palabras.slice(1) : palabras)
    .filter(function (p) { return p.length >= 4; });
  const t = normalizeText_(c.nombre);
  if (apellidos.some(function (a) { return _contienePalabra_(t, a); })) return 'posible_grafia';
  return c.figurasNorm.length ? 'otra_figura' : 'sin_figura';
}

function evaluarCandidatos_(f, candidatos, comunas) {
  let mejor = null, segundo = null, mejorDes = null;
  let reubic = null;    // el mejor descalificado por ubicación que es una posible reubicación
  const limpios = [];   // los que compiten (relevantes, sin desacuerdo, score > 0), para contendientes

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
      if (_esReubicacion_(sc) && (!reubic || sc.score > reubic.score)) reubic = sc;
      continue;
    }
    if (sc.score <= 0) continue;
    limpios.push(sc);
  }

  /*
   * Desempate a favor del que nombra la figura (SIN_FIGURA_POR_UBICACION, variante D-C): si hay
   * un candidato que nombra la figura de la fila y llega al umbral, los formularios SIN figura
   * no compiten —ni ganan, ni empatan, ni cuentan como rival para el margen—. Si no lo hay,
   * compiten normal, y dos sin figura empatados van a revisión como cualquier empate.
   *
   * Es la misma selección de siempre (`limpios`), filtrada: no un segundo criterio.
   */
  // Un multi_figura no cuenta como "el que nombra la figura": no se puede escribir solo, así que
  // no puede sacar de la competencia al formulario propio de la fila (regresión 801, 01/10).
  let compiten = limpios;
  if (SIN_FIGURA_POR_UBICACION && limpios.some(function (s) {
    return s.nombraFigura && !s.multiFigura && s.score >= UMBRAL_MATCH;
  })) {
    compiten = limpios.filter(function (s) { return !s.sinFigura; });
  }
  // Mejor y segundo, con el mismo desempate de siempre: a igual score gana el primero visto.
  compiten.forEach(function (sc) {
    if (!mejor || sc.score > mejor.score) { segundo = mejor; mejor = sc; }
    else if (!segundo || sc.score > segundo.score) segundo = sc;
  });

  // Un candidato en desacuerdo de ubicación no compite con uno limpio, pero si es lo único que
  // hay y el resto de las señales da alto, va a revisión y no a la basura: la contradicción
  // puede venir del barrio del destino, que lo carga una persona (CLAUDE.md, decisión 2).
  /*
   * Posible reubicación (UBICACION_DESACUERDO_A_REVISION, regla 8): figura + fecha a
   * ±DIAS_REUBICACION + ubicación en desacuerdo. No compite con un limpio —nunca le gana—, pero si
   * la fila no tiene un ganador mejor va a REVISAR_MATCH, **aunque haya candidatos limpios más
   * flojos**. Antes sólo llegaba a revisión si era lo único que había.
   */
  const aRevisionPorReubicacion = function (limpio) {
    return { mejor: reubic, segundoScore: limpio ? limpio.score : 0,
             margen: redondear_(reubic.score - (limpio ? limpio.score : 0)),
             veredicto: 'REVISAR_MATCH', motivo: 'ubicacion_en_desacuerdo', reubicacion: true };
  };
  if (!mejor && reubic && UBICACION_DESACUERDO_A_REVISION) return aRevisionPorReubicacion(null);

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

  /*
   * El veto multi_figura se evalúa sobre el GANADOR, después del desempate por evidencia, no
   * sobre cualquier candidato empatado (regresión 801, 01/10). Con margen chico se desempata
   * primero: si gana un formulario simple (con su umbral propio), se escribe; si gana el
   * multi_figura o nadie gana, va a revisión por multi_figura como antes. Con margen, el
   * multi_figura ganador va a revisión (caso 716).
   */
  let veredicto, motivo = '';
  if (mejor.score < UMBRAL_MATCH)      { veredicto = 'SIN_MATCH';     motivo = 'score_bajo'; }
  else if (margen < MARGEN_MINIMO)     { veredicto = 'REVISAR_MATCH'; motivo = 'margen_chico'; }
  else if (mejor.multiFigura)          { veredicto = 'REVISAR_MATCH'; motivo = 'multi_figura'; }
  else                                   veredicto = 'escribiria';

  /*
   * Los contendientes: todos los que quedan a menos de MARGEN_MINIMO del mejor, el mejor
   * incluido. Se guardan cuando el margen es chico: los usan el desempate de abajo, el paso 9 y
   * el paso 10.
   */
  const contendientes = (motivo === 'margen_chico')
    ? compiten.filter(function (s) { return mejor.score - s.score < MARGEN_MINIMO; })
    : null;

  /*
   * --- desempate por evidencia (DESEMPATE_POR_EVIDENCIA, 00_Config.js) ---
   *
   * Cuando el margen es chico, la normalización borró cuánta evidencia hay detrás de cada score.
   * Se ordena a los contendientes por `_desempatePorEvidencia_` (señales, distancia, inscriptos
   * DEL FORMULARIO) y gana el estrictamente mejor en el primer criterio que distinga. Si empatan
   * en los tres, sigue en REVISAR_MATCH por margen_chico.
   *
   * Salvaguarda: el ganador tiene que llegar al umbral por sí mismo y no ser multi_figura. Un
   * contendiente a menos de MARGEN_MINIMO del mejor puede estar bajo 0,88; ganarle la fila por
   * señales sería escribir con un score que no alcanza. Ese caso sigue en revisión.
   */
  let desempate = null, desempateBajoUmbral = false;
  // ¿Hay un multi_figura entre los empatados? Se mide en el paso 2 (empates con multi_figura).
  const empateMulti = !!(contendientes && contendientes.length > 1 &&
                         contendientes.some(function (s) { return s.multiFigura; }));
  let ganadorEsMulti = false;
  if (DESEMPATE_POR_EVIDENCIA && motivo === 'margen_chico') {
    const d = _desempatePorEvidencia_(contendientes);
    if (d.ganador && d.ganador.score >= UMBRAL_MATCH && !d.ganador.multiFigura) {
      mejor = d.ganador;
      veredicto = 'escribiria';
      motivo = '';
      desempate = d.porQue;
    } else if (d.ganador) {
      if (d.ganador.multiFigura) { mejor = d.ganador; ganadorEsMulti = true; }
      else desempateBajoUmbral = true;
    }
  }
  // Sin un simple que gane: si el mejor (o el ganador) es multi_figura, revisión por multi_figura.
  if (veredicto === 'REVISAR_MATCH' && motivo === 'margen_chico' && (ganadorEsMulti || mejor.multiFigura)) {
    motivo = 'multi_figura';
  }

  /*
   * Dos formularios vivos con la MISMA clave (mismo nombre y cierre) y los dos con inscriptos
   * (`claveRepetida`, marcarGemelos_): no hay cómo saber cuál es el de la fila ni cómo enlazarlo
   * después por la traza. No se escribe solo (02/10).
   */
  if (veredicto === 'escribiria' && mejor.c.claveRepetida) {
    veredicto = 'REVISAR_MATCH';
    motivo = 'clave_repetida';
  }

  // Sin ganador limpio (score bajo): la posible reubicación va a revisión en su lugar.
  if (veredicto === 'SIN_MATCH' && reubic && UBICACION_DESACUERDO_A_REVISION) {
    return aRevisionPorReubicacion(mejor);
  }

  return { mejor: mejor, segundoScore: s2, margen: margen, veredicto: veredicto, motivo: motivo,
           contendientes: contendientes, desempate: desempate,
           desempateBajoUmbral: desempateBajoUmbral, empateMulti: empateMulti };
}

/**
 * El par tiene la firma de una reunión reubicada (regla 8): nombra la figura de la fila, está a
 * ±DIAS_REUBICACION días y la ubicación (barrio o comuna) está en DESACUERDO.
 */
function _esReubicacion_(sc) {
  return !!(sc.desacuerdo && sc.nombraFigura && sc.dist !== null && sc.dist <= DIAS_REUBICACION);
}

/** "form dice Comuna 6 / RDV dice Flores (Comuna 7)", o barrio contra barrio. */
function _detalleDesacuerdo_(f, c, comunas) {
  const bDest = normalizeText_(f.barrio), bCand = normalizeText_(c.barrio);
  const cDest = bDest ? comunas.get(bDest) : null;
  if (bDest && bCand) return 'form dice ' + c.barrio + ' / RDV dice ' + f.barrio;
  const szDest = cDest === 1 ? subzonaDeBarrio_(f.barrio) : '';
  return 'form dice Comuna ' + (c.comuna == null ? '?' : c.comuna) + (c.subzona ? ' ' + c.subzona : '') +
         ' / RDV dice ' + (f.barrio || '(sin barrio)') + ' (Comuna ' + (cDest == null ? '?' : cDest) +
         (szDest ? ' ' + szDest : '') + ')';
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
    // La figura salió de una variante de grafía o sólo del apellido: la traza lo dice.
    if (c.figurasVarianteNorm && c.figurasVarianteNorm.indexOf(figNorm) !== -1) senales.push('figura_por_variante');
    if (c.figurasApellidoNorm && c.figurasApellidoNorm.indexOf(figNorm) !== -1) senales.push('figura_por_apellido');
  }

  // --- fecha: señal con tolerancia, nunca descarta (3.3.c); asimétrica con fuente fecha_fin ---
  const pf = puntajeFechaCandidato_(f.fecha, c.det);
  const dist = pf.dist;
  if (dist !== null) {
    alcanzable += PESOS_MATCH.fechaExacta;
    sFecha = pf.puntaje;
    if (sFecha > 0) senales.push(pf.asimetrica ? 'fecha_fin' + (pf.delta >= 0 ? '+' : '') + pf.delta : 'fecha±' + dist);
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
  let porSubzona = false;    // la ubicación la decidió la subzona de la Comuna 1
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
    // Comuna contra comuna; en la Comuna 1, también la subzona si el formulario la dice (regla 10).
    const cmp = comparaComuna_(f.barrio, cDest, c);
    porSubzona = cmp.porSubzona;
    pesoUbic = PESOS_MATCH.comunaSinBarrio;
    alcanzable += pesoUbic;
    if (cmp.coincide) {
      sUbic = pesoUbic;
      senales.push(cmp.porSubzona ? 'comuna1_' + c.subzona.toLowerCase() : 'comuna');
    } else desacuerdo = true;
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
    if (barrioEnEje_(f.barrio, c.eje.eje)) { sUbic = pesoUbic; senales.push('eje'); }
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
  const cmpOk = comparaComuna_(f.barrio, cDest, c);
  const comunaOk = !!(cmpOk && cmpOk.coincide);
  const ejeOk    = EJE_COMO_UBICACION && !!(c.eje && c.eje.tipo === 'eje' &&
                   barrioEnEje_(f.barrio, c.eje.eje));
  const proponible = (sFig > 0) && (distOk || comunaOk || ejeOk);

  /*
   * --- formularios sin figura, por ubicación (SIN_FIGURA_POR_UBICACION, 00_Config.js) ---
   *
   * Un formulario que no nombra a NADIE no puede sumar figura, y con la figura en el
   * denominador no pasa de 0,56. La figura sale del denominador **sólo** si la ubicación es
   * evaluable y coincide (barrio o comuna) y la fecha está a ±DIAS_SIN_FIGURA_POR_UBICACION;
   * si no, puntúa como antes. Es la variante D-C del paso 8; el desempate a favor del que
   * nombra la figura vive en evaluarCandidatos_.
   */
  const alcanzableBase = alcanzable;      // antes de la regla: lo usan las mediciones (pasos 6 y 8)
  const sinFigura = !c.figurasNorm.length;
  const porSinFigura = SIN_FIGURA_POR_UBICACION && sinFigura && !desacuerdo &&
                       pesoUbic > 0 && sUbic === pesoUbic &&
                       dist !== null && dist <= DIAS_SIN_FIGURA_POR_UBICACION;
  if (porSinFigura) {
    alcanzable -= PESOS_MATCH.figura;
    senales.push('sin_figura_por_ubicacion');
  }

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
      figura: porSinFigura ? 0 : redondear_(PESOS_MATCH.figura - sFig),   // no evaluada: no cuesta
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
    alcanzableBase: redondear_(alcanzableBase),
    sinFigura: sinFigura,
    porSinFigura: porSinFigura,
    nombraFigura: sFig > 0,
    // Para el ÚLTIMO desempate (EJE_COMO_DESEMPATE): el eje del formulario coincide con el del
    // barrio de la fila. No puntúa ni descalifica: sólo lo lee _desempatePorEvidencia_.
    ejeCoincide: !!(c.eje && c.eje.tipo === 'eje' && barrioEnEje_(f.barrio, c.eje.eje)),
    porSubzona: porSubzona,
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
/**
 * ¿El formulario puede ser de una reunión ACTIVA (DIAS_ACTIVOS)? Su fecha (la del nombre, o el cierre) no
 * es anterior al primer día activo menos la tolerancia de siempre: ±TOLERANCIA_REPROGRAMACION_DIAS con
 * fecha en el nombre, FECHA_FIN_VENTANA.max con el cierre (que cae antes de la reunión). Sin fecha: no.
 * Con DIAS_ACTIVOS = null, todos.
 */
function formularioDeReunionActiva_(c) {
  const ini = inicioActivas_();
  if (!ini) return true;
  const d = c.det && c.det.mejor;
  if (!d) return false;
  const tol = c.det.fuente === 'fecha_fin' ? FECHA_FIN_VENTANA.max : TOLERANCIA_REPROGRAMACION_DIAS;
  return ymd_(d) >= ymd_(new Date(ini.getTime() - tol * 86400000));
}

function calcularEmparejar_(dest, cands, comunas, usados, resueltas, tomadoPor) {
  const librosDestino = dest.filas.filter(function (f) {
    if (f.uid) return false;                        // ya identificada
    if (resueltas && resueltas[f.fila]) return false; // ya se resolvió en esta corrida
    if (f.fecha && f.fecha > _hoy_()) return false;  // reunión futura: no es hueco
    return true;
  });

  const grupos = [];
  /*
   * Filas activas (DIAS_ACTIVOS, 03/10): un formulario de una reunión CERRADA se descarta de EMPAREJAR —ni
   * propone pares ni cuenta como "sin ningún candidato"—. Se cuentan aparte (`cerrados`). Antes del
   * arreglo del 03/10 el bloque de huérfanos los sumaba (29 → 65): recorría todos los formularios sin usar.
   */
  const cerrados = { sinUsar: contador_(), habrianSidoHuerfanos: contador_() };

  for (let i = 0; i < cands.vivos.length; i++) {
    const c = cands.vivos[i];
    if (usados[c.fila]) continue;                  // ya se lo llevó una fila del destino
    if (!formularioDeReunionActiva_(c)) { sumar_(cerrados.sinUsar, enVentanaAnalisis_(c.det && c.det.mejor)); continue; }

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

  /*
   * El tope por fila. Primero se SIMULA en MAX_PARES_POR_FILA_SIMULADO, siempre, sobre la lista
   * sin tope: cuántos pares corta, qué densidad deja, cuántas filas quedarían sin ningún par (no
   * debería ser ninguna) y cuántos formularios se quedarían sin propuesta. Después, si
   * MAX_PARES_POR_FILA está fijado, se aplica de verdad. No toca ningún veredicto.
   */
  const topeSim = _simularTopePorFila_(grupos, MAX_PARES_POR_FILA || MAX_PARES_POR_FILA_SIMULADO);
  if (MAX_PARES_POR_FILA) {
    const quedan = _topePorFila_(grupos, MAX_PARES_POR_FILA, true);
    for (let i = grupos.length - 1; i >= 0; i--) {
      const g = grupos[i];
      g.props = g.props.filter(function (p) { return quedan[g.c.fila + '|' + p.f.fila]; });
      if (!g.props.length) grupos.splice(i, 1);
      else g.mejor = g.props[0].sc.score;
    }
  }

  // Los grupos, por su mejor candidato. Adentro, por score. Así se cumplen las dos cosas:
  // lo más plausible arriba, y los candidatos de un formulario juntos.
  grupos.sort(function (a, b) { return b.mejor - a.mejor; });

  const filas = [];
  const pares = contador_();
  // Qué pares quedaron en la lista, por 'formFila|destFila': lo leen las herramientas de revisión
  // (explicarFormulario / explicarFila) y medirDesacuerdoUbicacion(). Sólo lectura.
  const paresSet = {};
  /*
   * Pares por figura de la fila del destino, y cuántos de ellos existen sólo porque la figura
   * del formulario sale del prefijo (`compararLimpiezaPrefijo_` = pierde_figura: con la limpieza
   * vieja ese formulario no nombraba a nadie). Es la medida de si la densidad subió por el
   * cambio de figurasEnTexto_ del 26/09. Sólo cuenta.
   */
  const porFigura = {};
  const deSoloPrefijo = contador_();
  const clasePref = {};
  grupos.forEach(function (g) {
    if (!(g.c.fila in clasePref)) clasePref[g.c.fila] = compararLimpiezaPrefijo_(g.c.nombre).clase;
    const soloPrefijo = clasePref[g.c.fila] === 'pierde_figura';
    g.props.forEach(function (p) {
      const ev = enVentanaAnalisis_(p.f.fecha);
      sumar_(pares, ev);
      paresSet[g.c.fila + '|' + p.f.fila] = true;
      const k = p.f.figura || '(sin figura)';
      if (!porFigura[k]) porFigura[k] = { pares: contador_(), soloPrefijo: contador_(), filas: {} };
      sumar_(porFigura[k].pares, ev);
      porFigura[k].filas[p.f.fila] = true;
      if (soloPrefijo) { sumar_(porFigura[k].soloPrefijo, ev); sumar_(deSoloPrefijo, ev); }
      const senales = _esReubicacion_(p.sc)
        ? p.sc.nivel + ' | ' + _detalleDesacuerdo_(p.f, g.c, comunas) + ' — posible reubicación'
        : p.sc.nivel;
      filas.push([g.c.nombre, g.c.inscriptos, p.f.figura, p.f.barrio, fmtFecha_(p.f.fecha),
                  p.sc.score, senales, _sn_(ev), '', '', g.c.clave]);
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
    if (grupos.some(function (g) { return g.c.fila === c.fila; })) continue;
    if (!formularioDeReunionActiva_(c)) {          // de una reunión cerrada: descartado, no es huérfano
      sumar_(cerrados.habrianSidoHuerfanos, enVentanaAnalisis_(c.det && c.det.mejor));
      continue;
    }
    huerfanos.push(c);
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
  const vacia = ['', '', '', '', '', '', '', '', '', '', ''];
  // "elegido" (antes "confirmar") lo escribe una persona; "resultado", el sistema (03/10, 25_Elecciones.js).
  const salida = [['nombre_formulario', 'inscriptos', 'Figura', 'Barrio', 'Fecha', 'score',
                   'senales', 'en_ventana', 'elegido', 'resultado', 'form_clave']];
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

  /*
   * Por fila del destino, hasta OPCIONES_REVISION formularios candidatos con sus puntajes, en el
   * orden del sistema (principio del usuario: lo que el sistema no resuelve se le presenta a una
   * persona con las opciones). Tiene su propio encabezado (la fila que empieza con "---" y
   * "fila_destino"): "elegido" se lee por ese encabezado (25_Elecciones.js).
   */
  const conProp = librosDestino.filter(function (f) { return conPropuesta[f.fila]; });
  salida.push(vacia.slice());
  salida.push(['--- POR FILA DEL DESTINO: hasta ' + OPCIONES_REVISION + ' formularios candidatos (' +
               conProp.length + ' filas; "elegido": el número de la opción, o "ninguno") ---'].concat(vacia.slice(1)));
  salida.push(['---', 'fila_destino', 'Figura', 'Barrio', 'Fecha', '', '', 'en_ventana', '', '', '']
    .concat(_encabezadoOpciones_(OPCIONES_REVISION)));
  conProp.forEach(function (f) {
    salida.push(['', f.fila, f.figura, f.barrio, fmtFecha_(f.fecha), '', '',
                 _sn_(enVentanaAnalisis_(f.fecha)), '', '', '']
      .concat(_opcionesDeFila_(f, cands.vivos, comunas, tomadoPor || {}, null, OPCIONES_REVISION), ['', '']));
  });
  // Una matriz rectangular: las secciones de arriba se completan con celdas vacías.
  const ancho = salida.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
  salida.forEach(function (r) { while (r.length < ancho) r.push(''); });

  // Sólo calcula. La escritura la hace escribirReportes_, para poder reintentarla sola.
  return { matriz: salida, pares: pares, huerfanos: huerfanos, paresSet: paresSet, cerrados: cerrados,
           porFigura: porFigura, deSoloPrefijo: deSoloPrefijo, topeSim: topeSim,
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
/**
 * Los pares que se quedan con un tope de `n` por fila del destino: `{ 'formFila|destFila': true }`.
 * Orden para elegir: score, después cercanía de fecha (sin fecha, al final).
 *
 * Con `garantizar`, **un formulario al que el tope dejaría sin ningún par conserva su mejor par**,
 * aunque exceda el tope de esa fila:
 * el tope achica la lista de cada fila, pero no puede hacer desaparecer un formulario de la
 * propuesta —ese formulario no tendría otro lugar donde aparecer—.
 */
function _topePorFila_(grupos, n, garantizar) {
  const orden = function (a, b) {
    if (b.sc.score !== a.sc.score) return b.sc.score - a.sc.score;
    const da = a.sc.dist === null ? Infinity : a.sc.dist;
    const db = b.sc.dist === null ? Infinity : b.sc.dist;
    return da - db;
  };
  const porFilaDest = {};
  grupos.forEach(function (g) {
    g.props.forEach(function (p) {
      (porFilaDest[p.f.fila] = porFilaDest[p.f.fila] || []).push({ g: g, p: p });
    });
  });
  const quedan = {};
  Object.keys(porFilaDest).forEach(function (k) {
    porFilaDest[k].sort(function (a, b) { return orden(a.p, b.p); })
      .slice(0, n).forEach(function (x) { quedan[x.g.c.fila + '|' + x.p.f.fila] = true; });
  });
  // Una posible reubicación (regla 8) aparece siempre: el tope no la corta.
  if (UBICACION_DESACUERDO_A_REVISION) {
    grupos.forEach(function (g) {
      g.props.forEach(function (p) { if (_esReubicacion_(p.sc)) quedan[g.c.fila + '|' + p.f.fila] = true; });
    });
  }
  if (garantizar) {
    // Sólo a los que el tope dejó sin NINGÚN par: no se trata de agregar pares, sino de que
    // ningún formulario desaparezca de la lista.
    grupos.forEach(function (g) {
      const leQueda = g.props.some(function (p) { return quedan[g.c.fila + '|' + p.f.fila]; });
      if (leQueda) return;
      const mejor = g.props.slice().sort(orden)[0];
      if (mejor) quedan[g.c.fila + '|' + mejor.f.fila] = true;
    });
  }
  return quedan;
}

/**
 * Qué hace un tope de `n` por fila, sobre la lista SIN tope. [ventana | total] por la fecha de la
 * fila. Con garantía (el formulario que quedaría sin ningún par conserva su mejor par) es lo que se
 * aplica; sin garantía se mide sólo para listar los formularios que la garantía rescata.
 */
function _simularTopePorFila_(grupos, n) {
  const quedan = _topePorFila_(grupos, n, true);
  const sinGarantia = _topePorFila_(grupos, n, false);
  const antes = contador_(), despues = contador_(), cortados = contador_();
  const filasAntes = {}, filasDespues = {}, formsSinNada = contador_();
  const porFig = {}, rescatados = [];
  let despuesSinG = 0;
  grupos.forEach(function (g) {
    let leQueda = false, leQuedabaSinG = false;
    g.props.forEach(function (p) {
      const ev = enVentanaAnalisis_(p.f.fecha);
      const k = p.f.figura || '(sin figura)';
      const key = g.c.fila + '|' + p.f.fila;
      if (!porFig[k]) porFig[k] = { antes: contador_(), despues: contador_() };
      sumar_(antes, ev); sumar_(porFig[k].antes, ev);
      filasAntes[p.f.fila] = ev;
      if (sinGarantia[key]) { leQuedabaSinG = true; if (ev) despuesSinG++; }
      if (quedan[key]) {
        sumar_(despues, ev); sumar_(porFig[k].despues, ev);
        filasDespues[p.f.fila] = ev;
        leQueda = true;
      } else sumar_(cortados, ev);
    });
    if (!leQueda) sumar_(formsSinNada, enVentanaAnalisis_(g.c.det && g.c.det.mejor));
    if (!leQuedabaSinG) {
      const mejor = g.props.filter(function (p) { return quedan[g.c.fila + '|' + p.f.fila]; })[0];
      rescatados.push({ c: g.c, p: mejor });
    }
  });
  const cuenta = function (m) {
    const c = contador_();
    Object.keys(m).forEach(function (k) { sumar_(c, m[k]); });
    return c;
  };
  const fA = cuenta(filasAntes), fD = cuenta(filasDespues);
  const filasEnCero = { v: fA.v - fD.v, t: fA.t - fD.t };
  return { n: n, antes: antes, despues: despues, cortados: cortados, filasAntes: fA,
           filasDespues: fD, filasEnCero: filasEnCero, formsSinNada: formsSinNada, porFig: porFig,
           rescatados: rescatados, despuesSinGarantiaV: despuesSinG };
}

// ===================== Escritura =====================

/**
 * Aplica el plan. **Todo pasa por `setSiDelSistemaLote_`** (la regla general, sólo celda vacía) y la
 * transición de STATUS por `marcarRealizadaLote_` (la excepción): cero `setValue` sueltos (CLAUDE.md 0).
 *
 * Qué escribe desde el paso B (02/10), en cada fila que no sea de una reunión futura:
 *   - si la fila tiene decisión de escribir (formulario resuelto o RDV_UID): traza, RDV_UID,
 *     Inscriptos, los cinco canales y el desagregado (sólo si Inscriptos está vacío o es el de B);
 *   - en cualquier fila, los **Asistentes** que trae RDV CONJUNTO (`asistentes.porFila`, de
 *     `cruzarAsistentes_`), aunque la fila no tenga formulario;
 *   - y STATUS `en agenda` → `Realizada` si la fila tiene asistentes (los que ya tenía o los que se
 *     escriben ahora).
 * `Barrio` (manual) y las derivadas no se escriben nunca.
 */
function aplicarDecisiones_(dest, decisiones, t0, asistentes, historial) {
  const sh = dest.sh;
  const iSt = dest.D['STATUS REUNIÓN'], iAs = dest.D['Asistentes'];
  const conStatus = iSt != null && iAs != null;
  const inicio = t0 ? t0.getTime() : Date.now();
  const hoy = _hoy_();

  /*
   * Una decisión que NO se escribe (revisar, sin match) no escribe traza ni datos del formulario
   * (01/10: su traza vive en REVISAR_MATCH y SIN_MATCH, que se regeneran en cada corrida). Pero la fila
   * igual puede recibir sus Asistentes y el cambio de STATUS: no dependen del formulario.
   *
   * Y una fila que, en lo leído para el plan, ya tiene llenas todas las celdas que se escribirían
   * tampoco entra: una celda llena no se escribe nunca. En régimen esto deja la escritura en cero.
   */
  const porDecision = decisionesPorFila_(decisiones);
  const pendientes = [];
  dest.filas.forEach(function (f) {
    if (f.fecha && f.fecha > hoy) return;                          // reunión futura: no se toca
    if (!historial && !esFilaActiva_(f.fecha)) return;             // cerrada (DIAS_ACTIVOS): no se toca, salvo el paso 22
    const d = decisionDeFila_(f, porDecision, asistentes);
    const c = celdasDeDecision_(dest, d, f.valores, true);
    if (c.celdas.length || c.status) pendientes.push(d);
  });

  /*
   * Por tandas de filas (02/10). Cada tanda: **una lectura fresca de sus filas** —qué escribir se decide
   * sobre lo que hay AHORA, no sobre lo leído para el plan (p. ej. el desagregado depende de Inscriptos)—,
   * `setValues` por bloque (que vuelve a chequear que cada celda siga vacía), fondos con RangeList,
   * STATUS, flush. Antes de cada tanda, el corte propio (UPSERT_CORTE_PROPIO_MS): se corta entre tandas,
   * nunca a mitad de una fila, y la corrida siguiente sigue.
   */
  const w = { celdas: 0, trazas: 0, uids: 0, realizadas: 0, filasPendientes: pendientes.length, porColumna: {},
              filasHechas: 0, tandas: 0, tandaMax: 0, msEscritura: 0, completa: true };
  const nCols = dest.hdr.length;
  const tEsc = Date.now();
  for (let i = 0; i < pendientes.length; i += UPSERT_FILAS_POR_TANDA) {
    if (Date.now() - inicio + w.tandaMax > UPSERT_CORTE_PROPIO_MS) { w.completa = false; break; }
    const tTanda = Date.now();
    const tanda = pendientes.slice(i, i + UPSERT_FILAS_POR_TANDA);
    const f1 = tanda[0].fila.fila, f2 = tanda[tanda.length - 1].fila.fila;
    const frescas = sh.getRange(f1, 1, f2 - f1 + 1, nCols).getValues();

    const esc = [], filasStatus = [];
    tanda.forEach(function (d) {
      const c = celdasDeDecision_(dest, d, frescas[d.fila.fila - f1], false);
      c.celdas.forEach(function (x) {
        esc.push({ fila: d.fila.fila, col: x.col, valor: x.valor, tipo: x.tipo, ceroEsVacio: x.ceroEsVacio });
      });
      if (c.status) filasStatus.push(d.fila.fila);
    });
    setSiDelSistemaLote_(sh, dest.hdr, esc).forEach(function (e) {
      if (e.tipo === 'dato') w.celdas++;
      else if (e.tipo === 'uid') w.uids++;
      else w.trazas++;
      const n = dest.hdr[e.col - 1];
      w.porColumna[n] = (w.porColumna[n] || 0) + 1;
    });
    // La única excepción a la regla general (CLAUDE.md, sección 0 y decisión 12).
    if (conStatus) {
      const r = marcarRealizadaLote_(sh, filasStatus, iSt + 1, iAs + 1).length;
      w.realizadas += r;
      if (r) w.porColumna[dest.hdr[iSt]] = (w.porColumna[dest.hdr[iSt]] || 0) + r;
    }
    SpreadsheetApp.flush();

    w.tandas++;
    w.filasHechas += tanda.length;
    w.tandaMax = Math.max(w.tandaMax, Date.now() - tTanda);
  }
  w.msEscritura = Date.now() - tEsc;
  return w;
}

/** Las decisiones que se escriben (no las `noEscribir`), por número de fila. */
function decisionesPorFila_(decisiones) {
  const m = new Map();
  decisiones.forEach(function (d) { if (!d.noEscribir) m.set(d.fila.fila, d); });
  return m;
}

/**
 * La decisión de una fila tal como la usa la escritura: la del plan si se escribe, o una "sin_formulario"
 * (sólo Asistentes y STATUS), con los Asistentes del cruce (`d.asis`). La comparten aplicarDecisiones_ y
 * el paso 20 ("por qué está vacía"): no pueden divergir.
 */
function decisionDeFila_(f, porDecision, asistentes) {
  const base = porDecision.get(f.fila) || { fila: f, cand: null, nivel: 'sin_formulario', score: null, dist: null };
  const a = asistentes && asistentes.porFila ? asistentes.porFila.get(f.fila) : null;
  const o = asistentes && asistentes.oradores ? asistentes.oradores.get(f.fila) : null;
  const extra = { asis: a ? a.asis : '', oradores: {} };
  COLUMNAS_ORADORES.forEach(function (n) { extra.oradores[n] = o && o[n] !== undefined ? o[n] : ''; });
  return Object.assign({}, base, extra);
}

/**
 * **Lo que el sistema escribe en una fila**, sobre `valores` (la fila como está): las celdas VACÍAS que
 * escribiría, `[{col (1-based), valor, tipo, ceroEsVacio}]` con tipo `traza` / `uid` / `dato`, y si toca
 * la transición de STATUS. Es el único lugar que lo define: lo usan la escritura y el paso 16 ("fila
 * incompleta" = le queda algo de esto), así que no pueden divergir.
 *
 *   - decisión nueva (formulario resuelto): traza (form_origen, form_score, form_nivel,
 *     form_fecha_match si hay distancia, form_clave) y RDV_UID;
 *   - fila con RDV_UID (`nivel = 'rdv_uid'`): `form_clave` si le falta. El resto de su traza es la de la
 *     decisión original y no se completa con otra cosa;
 *   - con formulario (cualquiera de las dos): **Inscriptos** (un 0 cuenta como vacío,
 *     INSCRIPTOS_CERO_ES_VACIO), **los cinco canales**, y **el desagregado** (sexo, edades, Sin
 *     identificar) **sólo si Inscriptos está vacío o es igual al de B**: la fila no puede quedar con un
 *     total que no cierra con su desagregado;
 *   - `d.asis` (de RDV CONJUNTO, si cruzó): **Asistentes**, con o sin formulario;
 *   - STATUS `en agenda` → `Realizada` si la fila tiene asistentes (los que tenía o `d.asis`).
 *
 * Las COLUMNAS_MANUALES (Barrio) y las derivadas no están nunca.
 *
 * @param {boolean} callar  no loguear STATUS desconocidos (para los pre-chequeos)
 */
function celdasDeDecision_(dest, d, valores, callar) {
  const out = [];
  const agregar = function (idx, valor, tipo, ceroEsVacio) {
    if (idx == null || valor === '' || valor === null || valor === undefined) return;
    // Un 0 de B no "completa" una celda que vale por vacía porque tiene 0 (Inscriptos): escribir 0
    // sobre 0 la dejaba igual, y el paso 16 la daba por incompleta en cada corrida (03/10).
    if (ceroEsVacio && num(valor) === 0) return;
    const v = valores[idx];
    if (esVacio_(v) || (ceroEsVacio && num(v) === 0)) {
      out.push({ col: idx + 1, valor: valor, tipo: tipo, ceroEsVacio: !!ceroEsVacio });
    }
  };
  const c = d.cand || null;
  if (c && d.nivel !== 'rdv_uid') {
    agregar(dest.T.origen, c.nombre, 'traza');
    agregar(dest.T.score, d.score, 'traza');
    agregar(dest.T.nivel, d.nivel, 'traza');
    if (d.dist !== null && d.dist !== undefined) agregar(dest.T.fechaMatch, d.dist, 'traza');
    if (!d.fila.uid && dest.T.uid != null && esVacio_(valores[dest.T.uid])) {
      out.push({ col: dest.T.uid + 1, valor: Utilities.getUuid(), tipo: 'uid' });
    }
  }
  if (c) {
    agregar(dest.T.clave, c.clave, 'traza');
    const cu = c.cuentas || {};
    agregar(dest.D['Inscriptos'], cu['Inscriptos'], 'dato', INSCRIPTOS_CERO_ES_VACIO);
    CAMPOS_CANALES_.forEach(function (n) { agregar(dest.D[n], cu[n], 'dato'); });
    let insD = dest.D['Inscriptos'] != null ? num(valores[dest.D['Inscriptos']]) : '';
    if (INSCRIPTOS_CERO_ES_VACIO && insD === 0) insD = '';
    if (insD === '' || insD === cu['Inscriptos']) {
      CAMPOS_DESAGREGADO_.forEach(function (n) { agregar(dest.D[n], c.datos[n], 'dato'); });
    }
  }
  agregar(dest.D['Asistentes'], d.asis, 'dato');
  // Los oradores (06/10): como Asistentes, sólo celda vacía (un 0 del destino es un valor y no se pisa).
  COLUMNAS_ORADORES.forEach(function (n) { if (d.oradores) agregar(dest.D[n], d.oradores[n], 'dato'); });
  const iSt = dest.D['STATUS REUNIÓN'], iAs = dest.D['Asistentes'];
  let status = false;
  if (iSt != null && iAs != null) {
    const asisFila = esVacio_(valores[iAs]) ? (d.asis === undefined ? '' : d.asis) : valores[iAs];
    status = _decideRealizada_(valores[iSt], numOcero_(asisFila), callar);
  }
  return { celdas: out, status: status };
}

/** El desagregado: sexo, edades y Sin identificar. Se escribe sólo si Inscriptos está vacío o es el de B. */
const CAMPOS_DESAGREGADO_ = ['Masculinos', 'Femeninos',
                             '18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar'];
/** Los cinco canales del destino (MAPEO_CANALES). */
const CAMPOS_CANALES_ = ['Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión'];
/**
 * Las columnas de dato que el upsert escribe (paso B, 02/10), siempre sólo en celda vacía: Inscriptos, los
 * canales, el desagregado y Asistentes. Las manuales (Barrio) y las derivadas no están.
 */
const CAMPOS_DATO_ = ['Inscriptos'].concat(CAMPOS_CANALES_, CAMPOS_DESAGREGADO_, ['Asistentes'], COLUMNAS_ORADORES);

// ===================== Asistentes desde RDV CONJUNTO =====================

/**
 * **El cruce de Asistentes** (02/10): cada fila de RDV CONJUNTO (en el archivo del destino) contra una
 * fila del destino. Lo usan el upsert (paso B) y el paso 17: los dos ven lo mismo.
 *
 *   - **la figura**: RDV CONJUNTO la escribe "Apellido Nombre(s)"; `figuraPorTokens_` la resuelve si
 *     todos los tokens de UN nombre canónico están en el texto. Con varias (Lombardi/Tapia/Piragine) o
 *     ninguna ("Deporte"), se lista y no se usa;
 *   - **la clave es figura + fecha** (regla a de CLAUDE.md). Si el destino tiene 2+ filas de esa figura
 *     ese día (11 casos; la regla no vale para Macri), **desempata el barrio**: el de RDV CONJUNTO contra
 *     el del destino, normalizado ("Villa Gral. Mitre" = "Villa General Mitre"), o, si RDV CONJUNTO trae
 *     una comuna ("C3", "C1N", "C1S"), contra la comuna del barrio del destino (C1N/C1S con la subzona
 *     de la Comuna 1). Si no queda exactamente una, se lista y no se escribe;
 *   - con una sola fila, **el barrio sólo confirma**: si difiere, se lista y cruza igual;
 *   - "No aplica" y las filas de antes del inicio del destino se ignoran y se cuentan aparte;
 *   - dos filas de RDV CONJUNTO con asistentes distintos para la misma fila del destino: no se escribe
 *     ninguno (se lista).
 *
 * Devuelve `{ porFila: Map(fila → {asis, nombre}), ... listas y conteos }`. **No escribe nada**: el
 * upsert escribe después sólo donde Asistentes está vacío; las que difieren se cuentan, nunca se pisan.
 */
function cruzarAsistentes_(dest, comunas) {
  // oradores (06/10): fila del destino → { 'Oradores anotados': v, 'Oradores que hablaron': v }; los que dan dos
  // valores distintos para la misma fila, aparte (por columna).
  const r = { error: null, porFila: new Map(), oradores: new Map(), conflictoOradores: [], iOradores: null,
              filas: 0, noAplica: 0, antes: 0, sinFecha: 0, sinFigura: [],
              variasFiguras: [], encuentran: 0, noEncuentran: [], ambiguas: [], desempatadas: [],
              barrioDifiere: [], destinoSinBarrio: 0, sinAsistentes: 0, filasSinAsis: {}, conflicto: [], minFecha: null };
  const sh = ssDestino_().getSheetByName(RDV_HOJA_ASISTENTES_SRC);
  if (!sh) { r.error = 'No existe "' + RDV_HOJA_ASISTENTES_SRC + '".'; return r; }
  const vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const hdr = vals[0];
  const iFig = findIdxOr_(hdr, ['figura', 'persona', 'nombre'], true);
  const iBar = findIdxOr_(hdr, ['barrion', 'barrio'], true);
  const iFec = findIdxOr_(hdr, ['fecha', 'fecha (fecha)', 'fecha_evento', 'fecha reunion', 'fecha reunión',
                                'fecha_reunion', 'fecha_reunión', 'fecha evento'], true);
  const iAsi = findIdxOr_(hdr, ['asistentes', 'asistente'], true);
  if (iFig == null || iFec == null || iAsi == null) {
    r.error = '"' + RDV_HOJA_ASISTENTES_SRC + '" no tiene Figura, FECHA y Asistentes por encabezado: ' +
              hdr.filter(String).join(' | ');
    return r;
  }
  // Los oradores: las dos siguientes a Asistentes, por encabezado (la posición, sólo como control).
  const iOr = COLUMNAS_ORADORES.map(function (n) { return findIdxOr_(hdr, [n], true); });
  iOr.forEach(function (k, j) {
    if (k == null) {
      throw new Error('"' + RDV_HOJA_ASISTENTES_SRC + '" no tiene la columna "' + COLUMNAS_ORADORES[j] + '". No se escribió nada.');
    }
    if (k !== iAsi + 1 + j) {
      throw new Error('En "' + RDV_HOJA_ASISTENTES_SRC + '", "' + COLUMNAS_ORADORES[j] + '" está en ' + _letraCol_(k + 1) +
                      ' y se esperaba en ' + _letraCol_(iAsi + 2 + j) + ' (la ' + (j + 1) + 'ª después de Asistentes). ' +
                      'No se escribió nada.');
    }
  });
  r.iOradores = iOr; r.iAsi = iAsi;
  r.valores = vals; r.iFig = iFig;
  dest.filas.forEach(function (f) { if (f.fecha && (!r.minFecha || f.fecha < r.minFecha)) r.minFecha = f.fecha; });
  const porFigFecha = new Map();
  dest.filas.forEach(function (f) {
    const k = normalizeText_(f.figura) + '|' + (f.fecha ? ymd_(f.fecha) : '');
    if (!porFigFecha.has(k)) porFigFecha.set(k, []);
    porFigFecha.get(k).push(f);
  });
  const conflictos = new Set(), conflictosOr = new Set();
  for (let i = 1; i < vals.length; i++) {
    const row = vals[i];
    if (row.every(function (v) { return esVacio_(v); })) continue;
    r.filas++;
    if (row.some(function (v) { return normalizeText_(v) === 'no aplica'; })) { r.noAplica++; continue; }
    const nombre = str(row[iFig]), bar = iBar != null ? str(row[iBar]) : '', fec = toDate_(row[iFec]);
    const asis = num(row[iAsi]);
    if (!fec) { r.sinFecha++; continue; }
    if (r.minFecha && fec < r.minFecha) { r.antes++; continue; }
    const fp = figuraPorTokens_(nombre);
    if (!fp.figura) {
      (fp.candidatas.length ? r.variasFiguras : r.sinFigura).push({ nombre: nombre, fec: fec, cands: fp.candidatas });
      continue;
    }
    const lista = porFigFecha.get(normalizeText_(fp.figura) + '|' + ymd_(fec)) || [];
    if (!lista.length) { r.noEncuentran.push({ nombre: nombre, figura: fp.figura, bar: bar, fec: fec, asis: asis }); continue; }
    let f;
    if (lista.length > 1) {
      const coinciden = lista.filter(function (x) { return ubicacionCoincideConjunto_(bar, x, comunas); });
      if (coinciden.length !== 1) {
        r.ambiguas.push({ nombre: nombre, bar: bar, fec: fec, nums: lista.map(function (x) { return x.fila; }),
                          filas: lista.map(function (x) { return x.fila + ' (' + (x.barrio || 'sin barrio') + ')'; }) });
        continue;
      }
      f = coinciden[0];
      r.desempatadas.push({ nombre: nombre, bar: bar, f: f, filas: lista.map(function (x) { return x.fila; }) });
    } else {
      f = lista[0];
      if (!f.barrio) r.destinoSinBarrio++;
      else if (bar && !ubicacionCoincideConjunto_(bar, f, comunas)) r.barrioDifiere.push({ f: f, bar: bar });
    }
    r.encuentran++;
    if (!(asis > 0)) { r.sinAsistentes++; r.filasSinAsis[f.fila] = true; continue; }
    const ya = r.porFila.get(f.fila);
    if (ya && ya.asis !== asis) {
      if (!conflictos.has(f.fila)) r.conflicto.push({ f: f, a: ya.asis, b: asis });
      conflictos.add(f.fila);
      continue;
    }
    r.porFila.set(f.fila, { asis: asis, nombre: nombre });
    // Los oradores, de la misma fila de RDV CONJUNTO (sólo de las que tienen asistentes, como Asistentes).
    COLUMNAS_ORADORES.forEach(function (n, j) {
      const v = row[iOr[j]];
      if (esVacio_(v)) return;
      const o = r.oradores.get(f.fila) || {};
      if (o[n] !== undefined && !_igualOrador_(o[n], v)) {
        const clave = f.fila + '|' + n;
        if (!conflictosOr.has(clave)) r.conflictoOradores.push({ f: f, col: n, a: o[n], b: v });
        conflictosOr.add(clave);
        return;
      }
      o[n] = v;
      r.oradores.set(f.fila, o);
    });
  }
  conflictos.forEach(function (fila) { r.porFila.delete(fila); r.oradores.delete(fila); });
  conflictosOr.forEach(function (clave) {
    const p = clave.split('|'), o = r.oradores.get(Number(p[0]));
    if (o) delete o[p[1]];
  });
  return r;
}

/** Dos valores de oradores iguales: números iguales, o el mismo texto (sin espacios de más). */
function _igualOrador_(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  return String(a).trim() === String(b).trim();
}

/** La letra de una columna (1 = A). */
function _letraCol_(n) {
  let t = '';
  while (n > 0) { const m = (n - 1) % 26; t = String.fromCharCode(65 + m) + t; n = Math.floor((n - 1) / 26); }
  return t;
}

/**
 * ¿La ubicación que trae RDV CONJUNTO coincide con la fila del destino? Si es una comuna ("C3", "C1N",
 * "Comuna 1 Sur"), contra la comuna del barrio del destino (y la subzona en la Comuna 1); si no, barrio
 * contra barrio, canonizados ("Villa Gral. Mitre" = "Villa General Mitre"). Sin barrio en el destino o
 * sin ubicación en RDV CONJUNTO: no coincide.
 */
function ubicacionCoincideConjunto_(texto, f, comunas) {
  const t = str(texto);
  if (!t || !f.barrio) return false;
  if (/^\s*(c|comuna)\s*0?\d{1,2}\s*(n|s|norte|sur)?\s*$/i.test(t)) {
    const n = detectComuna_(t), cDest = comunas.get(normalizeText_(f.barrio));
    if (n == null || cDest == null || n !== cDest) return false;
    const sz = n === 1 ? detectSubzonaComuna1_(t) : null;
    if (!sz) return true;
    const szDest = subzonaDeBarrio_(f.barrio);
    return !szDest || szDest === sz;
  }
  const canon = function (x) { return canonizarBarrio_(x) || _expandirAbreviaturas_(normalizeText_(x)); };
  return canon(t) === canon(f.barrio);
}

/** El resumen del cruce en el log. Con `detalle`, además las listas (paso 17). */
function _logCruceAsistentes_(r, detalle) {
  if (r.error) { Logger.log('  Asistentes: %s', r.error); return; }
  Logger.log('  RDV CONJUNTO: %s filas | ignoradas: "No aplica" %s, antes del destino (< %s) %s, sin fecha %s',
             r.filas, r.noAplica, fmtFecha_(r.minFecha), r.antes, r.sinFecha);
  Logger.log('  figura por tokens: sin ninguna %s | con varias %s (fuera, se listan)', r.sinFigura.length,
             r.variasFiguras.length);
  Logger.log('  figura + fecha: ENCUENTRAN %s (de ésas, 2+ filas desempatadas por barrio o comuna: %s) | no ' +
             'encuentran %s | 2+ filas sin desempate (no se escriben) %s', r.encuentran, r.desempatadas.length,
             r.noEncuentran.length, r.ambiguas.length);
  Logger.log('    barrio distinto con una sola fila (cruzan igual) %s | destino sin barrio %s | sin asistentes %s | ' +
             'dos asistentes distintos para la misma fila (no se escriben) %s', r.barrioDifiere.length,
             r.destinoSinBarrio, r.sinAsistentes, r.conflicto.length);
  Logger.log('  oradores: filas con algún valor %s | dos valores distintos para la misma fila (no se escriben) %s',
             r.oradores.size, r.conflictoOradores.length);
  r.conflictoOradores.slice(0, 20).forEach(function (x) {
    Logger.log('    fila %s | %s | %s: %s / %s', x.f.fila, x.f.figura, x.col, x.a, x.b);
  });
  if (detalle) _logListasAsistentes_(r);
}

/** Las listas del cruce de Asistentes (paso 17): lo que no cruza, lo desempatado, lo que difiere. */
function _logListasAsistentes_(r) {
  const lista = function (titulo, l, fmt) {
    Logger.log('  %s: %s', titulo, l.length);
    l.slice(0, 40).forEach(function (x) { Logger.log('    %s', fmt(x)); });
    if (l.length > 40) Logger.log('    … y %s más', l.length - 40);
  };
  lista('sin figura (ningún nombre canónico entra en el texto)', r.sinFigura,
        function (x) { return x.nombre + ' | ' + fmtFecha_(x.fec); });
  lista('con varias figuras posibles', r.variasFiguras,
        function (x) { return x.nombre + ' | ' + fmtFecha_(x.fec) + ' → ' + x.cands.join(' / '); });
  lista('no encuentran fila (figura + fecha)', r.noEncuentran,
        function (x) { return x.nombre + ' → ' + x.figura + ' | ' + fmtFecha_(x.fec) + ' | ' + x.bar + ' | asistentes ' + x.asis; });
  lista('2+ filas desempatadas por barrio o comuna', r.desempatadas,
        function (x) { return x.nombre + ' | ' + x.bar + ' → fila ' + x.f.fila + ' (de ' + x.filas.join(', ') + ')'; });
  lista('2+ filas SIN desempate (no se escriben)', r.ambiguas,
        function (x) { return x.nombre + ' | ' + fmtFecha_(x.fec) + ' | ' + (x.bar || 'sin ubicación') + ' → filas ' + x.filas.join(', '); });
  lista('barrio distinto (cruzan igual)', r.barrioDifiere,
        function (x) { return 'fila ' + x.f.fila + ' | ' + x.f.figura + ' | ' + fmtFecha_(x.f.fecha) + ' | destino ' +
                              x.f.barrio + ' / RDV CONJUNTO ' + x.bar; });
  lista('dos asistentes distintos para la misma fila', r.conflicto,
        function (x) { return 'fila ' + x.f.fila + ' | ' + x.f.figura + ' | ' + x.a + ' / ' + x.b; });
}

// ===================== Lecturas =====================

/** El destino (RDV_HOJA_DESTINO), o la solapa `nombreHoja` del mismo archivo (paso 18: real y copia). */
function leerDestino_(nombreHoja) {
  const hoja = nombreHoja || RDV_HOJA_DESTINO;
  const sh = ssDestino_().getSheetByName(hoja);
  if (!sh) throw new Error('No existe la hoja "' + hoja + '".');
  const nFilas = sh.getLastRow(), nCols = sh.getLastColumn();
  const bloque = sh.getRange(1, 1, nFilas, nCols).getValues();
  const hdr = bloque[0];
  // Las figuras conocidas salen de este mismo bloque: el destino se lee una sola vez (02/10).
  usarFigurasDelBloque_(hdr, bloque.slice(1));

  const D = {};
  ['Figura', 'Barrio', 'FECHA', 'HORA', 'Inscriptos', 'Asistentes', 'STATUS REUNIÓN', 'EVENTO',
   'Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión', 'Masculinos', 'Femeninos', '18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar']
    .forEach(function (n) { D[n] = findIdxOr_(hdr, aliasColumna_(n), true); });
  // Los oradores (06/10): por encabezado, y la letra como control (R y S). Si no, error: no se escribe nada.
  COLUMNAS_ORADORES.forEach(function (n, k) {
    const i = findIdxOr_(hdr, [n], true);
    const letra = LETRAS_ORADORES_DESTINO[k];
    if (i == null) throw new Error('El destino "' + hoja + '" no tiene la columna "' + n + '" (se esperaba en ' + letra + '). No se escribió nada.');
    if (_letraCol_(i + 1) !== letra) {
      throw new Error('En "' + hoja + '", "' + n + '" está en ' + _letraCol_(i + 1) + ' y se esperaba en ' + letra +
                      '. Revisar las columnas antes de seguir. No se escribió nada.');
    }
    D[n] = i;
  });

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
    fechaMatch: findIdxOr_(hdr, ['form_fecha_match'], true),
    clave:      findIdxOr_(hdr, ['form_clave'], true)
  };
  const faltan = [];
  if (T.uid == null)        faltan.push('RDV_UID');
  if (T.origen == null)     faltan.push('form_origen');
  if (T.score == null)      faltan.push('form_score');
  if (T.nivel == null)      faltan.push('form_nivel');
  if (T.fechaMatch == null) faltan.push('form_fecha_match');
  if (T.clave == null)      faltan.push('form_clave');
  if (faltan.length) {
    Logger.log('AVISO: faltan columnas de traza en el destino: %s. Los scores se calculan igual, ' +
               'pero no hay dónde estampar eso: correr paso1_columnasDeTraza() (Fase 2b).', faltan.join(', '));
  } else {
    Logger.log('Columnas de traza: las %s presentes.', COLUMNAS_TRAZA.length);
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
      // El Nombre literal del formulario que se escribió en esta fila (traza). Es el enlace
      // estable fila → formulario entre corridas: no depende de la posición en B.
      formOrigen: T.origen != null ? str(r[T.origen]) : '',
      // La clave estable del formulario escrito (02/10). Vacía en las filas escritas antes.
      formClave: T.clave != null ? str(r[T.clave]) : '',
      clave: claveNatural_(figura, fecha)
    });
  }
  return { sh: sh, hdr: hdr, D: D, T: T, filas: filas };
}

/**
 * Los índices de las columnas de `B`, por `COLUMNAS_B` (00_Config.js). **Si falta una obligatoria,
 * error**: nada se calcula con un cero que salió de una columna no encontrada (02/10: así se escribió
 * `Sin identificar = Inscriptos`). El mensaje dice cuáles faltan y qué encabezados hay.
 */
function indicesB_(hdr) {
  const out = {}, faltan = [];
  Object.keys(COLUMNAS_B).forEach(function (campo) {
    out[campo] = findIdxOr_(hdr, COLUMNAS_B[campo], true);
    if (out[campo] == null && COLUMNAS_B_OPCIONALES.indexOf(campo) < 0) {
      faltan.push(campo + ' (' + COLUMNAS_B[campo].join(' / ') + ')');
    }
  });
  if (faltan.length) {
    throw new Error('Faltan columnas en "' + RDV_HOJA_B + '": ' + faltan.join('; ') + '. No se calculó ni ' +
                    'se escribió nada. Si el origen cambió los nombres, corregir COLUMNAS_B en 00_Config.js. ' +
                    'Encabezados de B: ' + hdr.filter(String).join(' | '));
  }
  return out;
}

/** Candidatos desde `B`, el import crudo. Los `NO USAR` quedan afuera del todo. */
function leerCandidatos_() {
  const sh = ssIntermedia_().getSheetByName(RDV_HOJA_B);
  if (!sh) throw new Error('No existe la hoja "' + RDV_HOJA_B + '".');
  const nFilas = sh.getLastRow();
  const bloque = sh.getRange(1, 1, nFilas, sh.getLastColumn()).getValues();
  const hdr = bloque[0];

  const iB = indicesB_(hdr);   // por COLUMNAS_B; tira error si falta una obligatoria (02/10)
  const iNombre = iB.nombre, iFin = iB.fechaFin, iIns = iB.inscriptos;
  const val = function (r, campo) { return iB[campo] != null ? r[iB[campo]] : ''; };

  // La huella de B se calcula sobre B CRUDO, antes de cualquier descarte (02/10).
  const huellaCruda = _md5corto_(bloque.map(function (r) {
    return r.map(function (v) { return v instanceof Date ? v.getTime() : String(v); }).join('\u0001');
  }).join('\n'));

  const vivos = [], porUid = new Map();
  let anulados = 0, formularios = 0;

  for (let k = 1; k < bloque.length; k++) {
    const r = bloque[k];
    const nombre = str(r[iNombre]);
    if (!nombre || /^loading/i.test(nombre)) continue;
    formularios++;

    if (esFormularioAnulado_(nombre)) { anulados++; continue; }

    const ins = numOcero_(r[iIns]);
    const sexo = { M: numOcero_(val(r, 'M')), F: numOcero_(val(r, 'F')), X: numOcero_(val(r, 'X')),
                   identificados: numOcero_(val(r, 'identificados')) };
    const div = DIVISOR_SEXO === 'M+F' ? sexo.M + sexo.F
              : DIVISOR_SEXO === 'M+F+X' ? sexo.M + sexo.F + sexo.X : sexo.identificados;

    const datos = {};
    datos['Masculinos'] = div > 0 ? Math.round(ins * (sexo.M / div)) : '';
    datos['Femeninos']  = div > 0 ? Math.round(ins * (sexo.F / div)) : '';
    let sumaEdades = 0;
    Object.keys(EDADES_B).forEach(function (e) {
      const v = num(val(r, EDADES_B[e]));
      datos[e] = v;
      sumaEdades += numOcero_(v);
    });
    datos['Sin identificar'] = ins > 0 ? Math.max(0, ins - sumaEdades) : '';

    // Inscriptos y canales tal como vienen (sin cero por vacío), con MAPEO_CANALES. Hoy sólo los lee
    // el paso 17 (validarCuentas); el upsert todavía no los escribe (paso B).
    const cuentas = { 'Inscriptos': num(r[iIns]) };
    Object.keys(MAPEO_CANALES).forEach(function (dst) {
      const vals = MAPEO_CANALES[dst].map(function (campo) { return num(val(r, campo)); });
      cuentas[dst] = vals.every(function (v) { return v === ''; }) ? ''
        : vals.reduce(function (s, v) { return s + numOcero_(v); }, 0);
    });

    const limpio = limpiarPrefijos_(nombre);
    vivos.push({
      fila: k + 1,
      nombre: nombre,                         // literal, sin normalizar: es la trazabilidad
      figurasNorm: figurasEnTexto_(nombre).map(normalizeText_),
      figurasApellidoNorm: figurasPorApellido_(nombre).map(normalizeText_),   // sólo por apellido
      figurasVarianteNorm: figurasPorVariante_(nombre).map(normalizeText_),   // por variante de grafía
      barrio: detectBarrio_(limpio),
      barrioPorVariante: barrioPorVariante_(limpio),                          // sólo si Comunas no lo vio
      comuna: detectComuna_(limpio),
      subzona: detectSubzonaComuna1_(limpio),     // Comuna 1 Norte / Sur (regla 10)
      eje: detectEje_(limpio),
      tematico: esFormularioTematico_(limpio),
      horaMin: _horaEnMinutos_(limpio),
      det: detectFecha_(limpio, iFin != null ? r[iFin] : null),
      finRaw: iFin != null ? r[iFin] : null,  // Fecha_Fin tal cual: con hora, si la trae (claveFormulario_)
      inscriptos: ins,
      datos: datos,
      cuentas: cuentas,
      sexo: sexo                              // M, F, X e identificados crudos (paso 17: el divisor)
    });
  }
  /*
   * **Orden estable, independiente de la posición en B** (02/10: B pasa a estar ordenado por
   * fecha_fin con SORT sobre el IMPORTRANGE, y los formularios cambian de fila). Lo único que
   * dependía del orden eran los empates exactos ("a igual score gana el primero visto"): la
   * primera opción mostrada, el motivo cuando nadie gana el desempate, y qué pares corta el tope
   * de EMPAREJAR_MANUAL. Con los formularios ordenados por `claveFormulario_` (Nombre + Fecha_Fin,
   * decisión 3 de CLAUDE.md), después por inscriptos y recién al final por fila —sólo para
   * formularios indistinguibles—, el resultado no cambia si B se reordena.
   */
  ordenarFormularios_(vivos);
  // Gemelos (02/10): mismo nombre y cierres a GEMELOS_MAX_DIAS o menos; regla 3 adentro del grupo.
  const gemelos = marcarGemelos_(vivos);
  return { vivos: vivos.filter(function (c) { return !c.descartadoRegla3; }), anulados: anulados,
           formularios: formularios, porUid: porUid, gemelos: gemelos, huellaCruda: huellaCruda };
}

/**
 * **Los gemelos** (regla 3; definición ajustada el 02/10): formularios de `B` con **el mismo nombre
 * (normalizado) y cierres a GEMELOS_MAX_DIAS días o menos** (encadenados). Son la misma reunión, así
 * que una sola fila del destino puede tener uno de ellos (lo hace cumplir `aplicarFormularioUnico_`,
 * por grupo). Mismo nombre con cierres más lejos son **reuniones distintas**: grupos distintos, y cada
 * formulario va por su clave (la Macri "Orden Público" del 16/07 y del 28/07).
 *
 * Dentro de un grupo, además:
 *   - si alguno tiene más de MAX_INSCRIPTOS_CASI_CERO inscriptos, los de casi cero no se hicieron: se
 *     marcan `descartadoRegla3` y salen de los candidatos (aunque los cierres no sean iguales);
 *   - si quedan dos o más con inscriptos, no hay cómo saber cuál es el de la fila: se marcan
 *     `claveRepetida` y ninguno se escribe solo (`clave_repetida`, a revisión).
 *
 * Pone `c.grupo` a cada formulario (nombre normalizado + el primer cierre del grupo) y devuelve, para
 * el log, los grupos de 2+ (con los descartados adentro) y los nombres repetidos que quedaron en
 * grupos distintos.
 */
function marcarGemelos_(vivos) {
  const porNombre = new Map();
  vivos.forEach(function (c) {
    c.nombreNorm = normalizeText_(c.nombre);
    if (!porNombre.has(c.nombreNorm)) porNombre.set(c.nombreNorm, []);
    porNombre.get(c.nombreNorm).push(c);
  });
  const t = function (c) { return c.det && c.det.fechaFin ? c.det.fechaFin.getTime() : null; };
  const grupos = [], distintos = [];
  let descartados = 0, repetidas = 0;
  porNombre.forEach(function (lista, n) {
    // Por cierre; los sin Fecha_Fin, al final y juntos.
    const orden = lista.slice().sort(function (a, b) {
      const ta = t(a), tb = t(b);
      if (ta === null || tb === null) return ta === tb ? 0 : (ta === null ? 1 : -1);
      return ta - tb;
    });
    const tandas = [];
    orden.forEach(function (c) {
      const ult = tandas[tandas.length - 1], prev = ult && ult[ult.length - 1];
      const junto = prev && (t(c) === null ? t(prev) === null
                                           : t(prev) !== null && (t(c) - t(prev)) / 86400000 <= GEMELOS_MAX_DIAS);
      if (junto) ult.push(c); else tandas.push([c]);
    });
    tandas.forEach(function (g) {
      const id = n + '|' + (t(g[0]) === null ? 'sin_cierre' : ymd_(g[0].det.fechaFin));
      g.forEach(function (c) { c.grupo = id; c.gemelos = g.length; });
      if (g.length < 2) return;
      const conIns = g.filter(function (c) { return (c.inscriptos || 0) > MAX_INSCRIPTOS_CASI_CERO; });
      if (conIns.length) {
        g.forEach(function (c) { if (conIns.indexOf(c) < 0) { c.descartadoRegla3 = true; descartados++; } });
      }
      const quedan = conIns.length ? conIns : g;
      if (quedan.length >= 2) quedan.forEach(function (c) { c.claveRepetida = true; repetidas++; });
      grupos.push({ grupo: id, forms: g });
    });
    if (tandas.length >= 2) distintos.push({ nombre: lista[0].nombre, grupos: tandas });
  });
  return { grupos: grupos, distintos: distintos, descartados: descartados, repetidas: repetidas };
}

/**
 * La clave estable de un formulario: `normalizeText_(Nombre) | AAAAMMDD(Fecha_Fin)` (decisión 3 de
 * CLAUDE.md: sin métricas). No depende de la fila de B.
 */
/** Ordena los formularios por su clave estable (ver leerCandidatos_). Modifica y devuelve la lista. */
function ordenarFormularios_(vivos) {
  vivos.forEach(function (c) { c.clave = claveFormulario_(c); });
  vivos.sort(function (a, b) {
    if (a.clave !== b.clave) return a.clave < b.clave ? -1 : 1;
    return ((b.inscriptos || 0) - (a.inscriptos || 0)) || (a.fila - b.fila);
  });
  return vivos;
}

function claveFormulario_(c) {
  const ff = c.det && c.det.fechaFin;
  let d = ff ? String(ff.getFullYear() * 10000 + (ff.getMonth() + 1) * 100 + ff.getDate()) : '0';
  // Si Fecha_Fin trae hora, la hora también: distingue dos formularios con el mismo nombre que
  // cierran el mismo día (02/10). Sin hora (00:00), la clave es la de siempre.
  const raw = c.finRaw;
  if (raw instanceof Date && !isNaN(raw.getTime()) && (raw.getHours() || raw.getMinutes())) {
    d += 'T' + ('0' + raw.getHours()).slice(-2) + ('0' + raw.getMinutes()).slice(-2);
  }
  return normalizeText_(c.nombre) + '|' + d;
}

/**
 * El formulario de una fila que ya tiene RDV_UID, por su traza. Devuelve `{ c, grupo, ambiguo }`:
 *
 *   1. por `form_clave` (02/10): el formulario vivo con esa clave. Si hay dos (`claveRepetida`),
 *      ambiguo. Si ya no está (p. ej. lo descartó la regla 3), se sigue por el nombre;
 *   2. por `form_origen` (literal, si no normalizado). Si ese nombre tiene formularios en VARIOS
 *      grupos (reuniones distintas con el mismo nombre), el grupo más cercano en fecha a la fila; un
 *      empate entre grupos es ambiguo. Dentro del grupo, si queda UN formulario vivo es ése; si
 *      quedan dos o más, ambiguo.
 *
 * Ambiguo = se sabe el GRUPO, no cuál de los gemelos. El grupo igual queda reservado para esa fila,
 * pero sus celdas vacías no se completan con los datos de un gemelo elegido a ciegas. No usa la fila
 * de B. (Antes se elegía el más cercano en fecha entre todos los del nombre, y con dos gemelos en dos
 * filas las dos apuntaban al mismo: la 309 y la 315.)
 */
function formularioDeTraza_(f, vivos) {
  const nada = { c: null, grupo: null, ambiguo: false };
  if (f.formClave) {
    const porClave = vivos.filter(function (c) { return c.clave === f.formClave; });
    if (porClave.length === 1) return { c: porClave[0], grupo: porClave[0].grupo, ambiguo: false };
    if (porClave.length > 1) return { c: null, grupo: porClave[0].grupo, ambiguo: true };
  }
  if (!f.formOrigen) return nada;
  let lista = vivos.filter(function (c) { return c.nombre === f.formOrigen; });
  if (!lista.length) {
    const n = normalizeText_(f.formOrigen);
    lista = vivos.filter(function (c) { return c.nombreNorm === n; });
  }
  if (!lista.length) return nada;
  const porGrupo = new Map();
  lista.forEach(function (c) {
    if (!porGrupo.has(c.grupo)) porGrupo.set(c.grupo, []);
    porGrupo.get(c.grupo).push(c);
  });
  let grupo = null, dMejor = Infinity, empate = false;
  porGrupo.forEach(function (forms, g) {
    const d = Math.min.apply(null, forms.map(function (c) {
      const x = distanciaFecha_(f.fecha, c.det);
      return x === null ? Infinity : x;
    }));
    if (grupo === null || d < dMejor) { grupo = g; dMejor = d; empate = false; }
    else if (d === dMejor) empate = true;
  });
  if (empate) return { c: null, grupo: null, ambiguo: true };
  const forms = porGrupo.get(grupo);
  if (forms.length === 1) return { c: forms[0], grupo: grupo, ambiguo: false };
  return { c: null, grupo: grupo, ambiguo: true };
}

/**
 * ¿El formulario `c` es el de la traza `t` (de `formularioDeTraza_`) de una fila? Si la traza resolvió
 * un formulario, ése; si es ambigua, cualquiera de su grupo.
 */
function esFormularioDeLaTraza_(t, c) {
  if (!c || !t) return false;
  if (t.c) return c === t.c;
  return !!t.grupo && c.grupo === t.grupo;
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
