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

/**
 * **Poner en `false` recién cuando los números de la corrida en seco estén revisados.**
 * Mientras esté en `true`, no hay forma de que este archivo toque el destino.
 */
const DRY_RUN = true;

// ===================== Puntos de entrada =====================

/** Corre el upsert. Respeta `DRY_RUN`. */
function upsertDestino() {
  return _correrUpsert_(DRY_RUN);
}

/** Corrida en seco explícita, sin importar cómo esté `DRY_RUN`. Para calibrar. */
function correrEnSeco() {
  return _correrUpsert_(true);
}

// ===================== El upsert =====================

function _correrUpsert_(enSeco) {
  const t0 = new Date();
  Logger.log('=== upsertDestino (%s) ===', enSeco ? 'DRY_RUN — no escribe nada' : 'ESCRITURA REAL');

  const dest = leerDestino_();
  const cands = leerCandidatos_();
  const comunas = leerComunasMap_();

  Logger.log('Destino: %s filas con datos | candidatos en B: %s (%s anulados por "%s")',
             dest.filas.length, cands.vivos.length, cands.anulados, MARCA_ANULADO);

  // --- confirmaciones pendientes de EMPAREJAR_MANUAL ---
  const confirmados = leerConfirmaciones_();
  if (confirmados.size) {
    Logger.log('Confirmaciones a mano encontradas en %s: %s', RDV_HOJA_EMPAREJAR, confirmados.size);
    if (enSeco) Logger.log('  (DRY_RUN: se cuentan pero no se estampan)');
  }

  const res = {
    porUid: 0, escribiria: 0, revisar: 0, sinMatch: 0, futuras: 0,
    escritas: 0, uidsEstampados: 0
  };
  const filasRevisar = [], filasSinMatch = [], decisiones = [];
  const usados = {};          // fila de B → ya asignada a una fila del destino
  const hist = [0,0,0,0,0,0,0,0,0,0];

  for (let i = 0; i < dest.filas.length; i++) {
    const f = dest.filas[i];

    // Reuniones futuras: no son hueco, todavía no corresponde completarlas.
    if (f.fecha && f.fecha > _hoy_()) { res.futuras++; continue; }

    // --- 1. ya estampada ---
    if (f.uid) {
      const porUid = cands.porUid.get(f.uid);
      res.porUid++;
      if (porUid) {
        decisiones.push({ fila: f, cand: porUid, score: 1, nivel: 'rdv_uid', dist: null });
        usados[porUid.fila] = true;
      }
      continue;
    }

    // --- 2. score ---
    const ev = evaluarCandidatos_(f, cands.vivos, comunas);
    if (ev.mejor) hist[Math.min(9, Math.floor(ev.mejor.score * 10))]++;

    if (!ev.mejor) {
      res.sinMatch++;
      filasSinMatch.push([f.clave, f.figura, f.barrio, fmtFecha_(f.fecha), 'sin_candidatos', '', '']);
      continue;
    }

    if (ev.veredicto === 'escribiria') {
      res.escribiria++;
      decisiones.push({ fila: f, cand: ev.mejor.c, score: ev.mejor.score,
                        nivel: ev.mejor.nivel, dist: ev.mejor.dist });
      usados[ev.mejor.c.fila] = true;
    } else if (ev.veredicto === 'REVISAR_MATCH') {
      res.revisar++;
      filasRevisar.push([f.clave, f.figura, f.barrio, fmtFecha_(f.fecha),
                         ev.mejor.c.nombre, ev.mejor.score, ev.segundoScore, ev.margen,
                         ev.motivo, ev.mejor.nivel]);
      // También se anota la traza del descartado: ver COLUMNAS_TRAZA.
      decisiones.push({ fila: f, cand: ev.mejor.c, score: ev.mejor.score,
                        nivel: 'descartado:' + ev.motivo, dist: ev.mejor.dist, noEscribir: true });
    } else {
      res.sinMatch++;
      filasSinMatch.push([f.clave, f.figura, f.barrio, fmtFecha_(f.fecha), ev.motivo,
                          ev.mejor.c.nombre, ev.mejor.score]);
      decisiones.push({ fila: f, cand: ev.mejor.c, score: ev.mejor.score,
                        nivel: 'descartado:' + ev.motivo, dist: ev.mejor.dist, noEscribir: true });
    }
  }

  // --- escribir, si no es en seco ---
  if (!enSeco) {
    const w = aplicarDecisiones_(dest, decisiones);
    res.escritas = w.celdas;
    res.uidsEstampados = w.uids;
  }

  // --- reportes ---
  escribirReporte_(RDV_HOJA_SIN_MATCH,
    ['clave', 'figura', 'barrio', 'fecha', 'motivo', 'mejor_descartado', 'score'], filasSinMatch);
  escribirReporte_(RDV_HOJA_REVISAR,
    ['clave', 'figura', 'barrio', 'fecha', 'form_origen', 'score', 'segundo', 'margen',
     'motivo', 'senales'], filasRevisar);
  const resueltas = {};
  decisiones.forEach(function (d) { if (!d.noEscribir) resueltas[d.fila.fila] = true; });
  const emp = generarEmparejarManual_(dest, cands, comunas, usados, resueltas);

  // --- log ---
  Logger.log('--- veredictos (base: %s filas del destino, sin las %s futuras) ---',
             dest.filas.length - res.futuras, res.futuras);
  Logger.log('  por RDV_UID (ya estampadas): %s', res.porUid);
  Logger.log('  escribiría: %s | a revisar: %s | sin match: %s',
             res.escribiria, res.revisar, res.sinMatch);
  Logger.log('--- distribución del score normalizado ---');
  for (let k = 9; k >= 0; k--) {
    if (!hist[k]) continue;
    Logger.log('  %s–%s : %s', (k / 10).toFixed(1), ((k + 1) / 10).toFixed(1), hist[k]);
  }
  Logger.log('--- umbrales en uso (PROVISORIOS) ---');
  Logger.log('  UMBRAL_MATCH=%s  MARGEN_MINIMO=%s', UMBRAL_MATCH, MARGEN_MINIMO);
  Logger.log('  Barrido: mover el umbral y volver a correr en seco. Los números de arriba son');
  Logger.log('  los que lo fijan — no hay forma de elegirlo sin esta corrida.');
  Logger.log('--- EMPAREJAR_MANUAL ---');
  Logger.log('  pares propuestos: %s | formularios sin candidato: %s | filas sin candidato: %s',
             emp.pares, emp.formulariosHuerfanos, emp.filasHuerfanas);

  if (enSeco) {
    Logger.log('>>> DRY_RUN: no se escribió NADA en el destino. %s decisiones quedaron ' +
               'calculadas y no aplicadas.', decisiones.length);
  } else {
    Logger.log('>>> Escritas %s celdas, %s uuids estampados.', res.escritas, res.uidsEstampados);
  }
  Logger.log('%s ms', new Date() - t0);
  return res;
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
  const proponible = (sFig > 0) || (dist !== null && dist <= VENTANA_EMPAREJAR_DIAS);

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
function generarEmparejarManual_(dest, cands, comunas, usados, resueltas) {
  const librosDestino = dest.filas.filter(function (f) {
    if (f.uid) return false;                        // ya identificada
    if (resueltas && resueltas[f.fila]) return false; // ya se resolvió en esta corrida
    if (f.fecha && f.fecha > _hoy_()) return false;  // reunión futura: no es hueco
    return true;
  });

  const grupos = [];
  let formulariosHuerfanos = 0;

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

    if (!props.length) { formulariosHuerfanos++; continue; }
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

  /*
   * Los dos bloques del final son la medida de lo que el sistema NO puede resolver ni con
   * ayuda humana. Si son grandes, falta información que no está en ninguno de los dos lados —
   * y eso es una conversación con quien carga los formularios, no un problema de código.
   */
  const salida = [['nombre_formulario', 'inscriptos', 'Figura', 'Barrio', 'Fecha', 'score',
                   'senales', 'confirmar']];
  filas.forEach(function (r) { salida.push(r); });

  salida.push(['', '', '', '', '', '', '', '']);
  salida.push(['--- FORMULARIOS SIN NINGÚN CANDIDATO (' + formulariosHuerfanos + ') ---',
               '', '', '', '', '', '', '']);
  for (let i = 0; i < cands.vivos.length; i++) {
    const c = cands.vivos[i];
    if (usados[c.fila]) continue;
    const tieneGrupo = grupos.some(function (g) { return g.c.fila === c.fila; });
    if (!tieneGrupo) salida.push([c.nombre, c.inscriptos, '', '', '', '', '', '']);
  }

  salida.push(['', '', '', '', '', '', '', '']);
  salida.push(['--- FILAS DEL DESTINO SIN NINGÚN CANDIDATO (' + filasHuerfanas.length + ') ---',
               '', '', '', '', '', '', '']);
  filasHuerfanas.forEach(function (f) {
    salida.push(['', '', f.figura, f.barrio, fmtFecha_(f.fecha), '', '', '']);
  });

  escribirHoja_(RDV_HOJA_EMPAREJAR, salida);
  return { pares: filas.length, formulariosHuerfanos: formulariosHuerfanos,
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
  const sh = SpreadsheetApp.openById(RDV_SS_INTERMEDIA).getSheetByName(RDV_HOJA_EMPAREJAR);
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
  const sh = SpreadsheetApp.openById(RDV_SS_DESTINO).getSheetByName(RDV_HOJA_DESTINO);
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
  if (T.uid == null) {
    Logger.log('AVISO: el destino todavía no tiene las columnas de traza (%s). Se calculan los ' +
               'scores igual, pero no hay dónde estamparlos. Ver Fase 2b.',
               COLUMNAS_TRAZA.join(', '));
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
  const sh = SpreadsheetApp.openById(RDV_SS_INTERMEDIA).getSheetByName(RDV_HOJA_B);
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
  const sh = SpreadsheetApp.openById(RDV_SS_DESTINO).getSheetByName(RDV_HOJA_COMUNAS);
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
  const ss = SpreadsheetApp.openById(RDV_SS_INTERMEDIA);
  let sh = ss.getSheetByName(nombre);
  if (!sh) sh = ss.insertSheet(nombre);
  else sh.clearContents();
  sh.getRange(1, 1, matriz.length, matriz[0].length).setValues(matriz);
  sh.setFrozenRows(1);
  return sh;
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
