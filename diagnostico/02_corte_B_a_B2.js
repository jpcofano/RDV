/**
 * Fase 1b — Dónde se corta `B → B2`.
 *
 * SÓLO LECTURA. No escribe ni un valor ni un fondo en el destino. Las dos solapas de salida
 * (DIAG_CORTE_B y DIAG_DUP_B2) van a la planilla intermedia, por escribirHoja_diag().
 *
 * Contexto: el diagnóstico del 2026-09-22 mostró que los pasos 4 y 5 no pierden nada y que el
 * hueco está aguas arriba — 72 de las 79 filas del hueco dan `no_existe_en_B2` (CLAUDE.md 3.2).
 * Este archivo pregunta por qué `syncB_to_B2` no generó fila.
 *
 * Puntos de entrada:
 *   diagFase1b()    corre DIAG_CORTE_B y DIAG_DUP_B2, compartiendo lecturas.
 *   diagCorteB()    → DIAG_CORTE_B
 *   diagDupB2()     → DIAG_DUP_B2
 *   diagScores()    → DIAG_SCORES. Calibra UMBRAL_MATCH y MARGEN_MINIMO (CLAUDE.md decisión 2)
 *                    con la distribución real de scores. Va suelto: es más caro que los otros
 *                    dos (población × todas las filas de B) y no hace falta en cada corrida.
 *   diagAnclaFecha() → DIAG_ANCLA_FECHA. Cuántas fecha_mal_parseada resuelve anclar la fecha a
 *                    fecha_fin, antes de escribir esa regla en 02_Parsing.js (CLAUDE.md 3.3).
 *
 * Depende de `diagnostico/01_hueco_sexo_edades.js`, que está en el mismo proyecto y comparte
 * scope: usa sus lectores (`leerDestino_diag`, `indexarB2_diag`), sus helpers `_diag` y el
 * criterio `esFilaDelHueco_diag`. **No lee las solapas DIAG_***: trabaja sobre los datos, no
 * sobre la salida de otro reporte, así que no depende de que la Fase 1 se haya corrido antes
 * ni de que su salida esté fresca.
 *
 * --- La población ---
 * **Toda fila del destino sin contraparte en B2**, no sólo las del hueco. La definición por
 * DIAG_HUECO era operativa y tenía un sesgo grave: las filas viejas ya tienen sexo y edades
 * cargados a mano, así que nunca entran al hueco, y es justo ahí donde se manifestaría una
 * ventana móvil del import. Medir sólo el hueco habría dado `desaparecida_del_origen = 0` por
 * construcción. La columna `origen_fila` separa `hueco` de `sin_contraparte_B2` para poder
 * mirar las dos juntas y por separado.
 *
 * --- Lo que mide exactamente ---
 * Los tres `detect*` se copian acá con sufijo `_diag2`, **verbatim de Código.js**. El objetivo
 * es medir lo que el código hace hoy, no lo que haría arreglado. Si alguien mejora las listas
 * de nombres o barrios en el legado, estas copias no se tocan hasta que se decida re-medir.
 *
 * --- Un detalle que cambia la lectura de `no_existe_en_B2` ---
 * `syncB_to_B2` **inserta la fila igual** cuando `detectPersona_` o `detectBarrio_` devuelven
 * cadena vacía: lo único que la saltea es que falte `Nombre`
 * ([Sync B to B2.js:132](../Sync%20B%20to%20B2.js#L132)). O sea que una fila con
 * `persona_no_reconocida` **sí está en B2**, pero con `Persona`/`BarrioN` vacíos, y por eso no
 * se puede indexar por clave natural y el upsert nunca la encuentra.
 *
 * Eso separa dos arreglos muy distintos:
 *   - la fila está en B2 sin Persona/Barrio  → ampliar las listas, o derivar de otro lado;
 *   - la fila no está en B                   → B2 tiene que pasar a ser acumulativo.
 * El log cruza `DIAG_CORTE_B` contra las claves incompletas de B2 para decir cuál es cuál.
 */

// ===================== Configuración =====================

const DIAG2_HOJA_B      = 'B';
const DIAG2_SALIDA_CORTE = 'DIAG_CORTE_B';
const DIAG2_SALIDA_DUP   = 'DIAG_DUP_B2';

/** Tolerancia en días para el match débil por `Fecha_Fin`, cuando no hay match exacto. */
const DIAG2_TOLERANCIA_DIAS = 15;

// ===================== Puntos de entrada =====================

/** Corre los dos reportes compartiendo las lecturas. */
function diagFase1b() {
  const cache = nuevoCache2_diag2();
  const res = {}, fallaron = [];
  const pasos = [['DIAG_CORTE_B', generarCorteB_diag2], ['DIAG_DUP_B2', generarDupB2_diag2]];
  for (let i = 0; i < pasos.length; i++) {
    try {
      res[pasos[i][0]] = pasos[i][1](cache);
    } catch (err) {
      fallaron.push(pasos[i][0]);
      res[pasos[i][0]] = { error: String(err) };
      Logger.log('[diag2] %s FALLÓ: %s', pasos[i][0], err);
    }
  }
  if (fallaron.length) Logger.log('[diag2] a rehacer sueltos: %s', fallaron.join(', '));
  return res;
}

function diagCorteB() { return generarCorteB_diag2(nuevoCache2_diag2()); }
function diagDupB2()  { return generarDupB2_diag2(nuevoCache2_diag2()); }

// ===================== Lectura perezosa =====================

function nuevoCache2_diag2() {
  return { b: null, dest: null, b2: null };
}

function cacheB_diag2(cache) {
  if (!cache.b) cache.b = leerB_diag2();
  return cache.b;
}

function cacheDestino_diag2(cache) {
  if (!cache.dest) cache.dest = leerDestino_diag();   // de 01_hueco_sexo_edades.js
  return cache.dest;
}

function cacheB2_diag2(cache) {
  if (!cache.b2) cache.b2 = indexarB2_diag();         // de 01_hueco_sexo_edades.js
  return cache.b2;
}

/**
 * Lee el import crudo `B`. Guarda, por fila: el texto libre del evento, la `Fecha_Fin`, y las
 * derivadas Persona/Barrio/Fecha que alguien escribió a mano en S/T/U (CLAUDE.md 3.3).
 */
function leerB_diag2() {
  const t0 = new Date();
  const sh = SpreadsheetApp.openById(DIAG_ID_INTERMEDIA).getSheetByName(DIAG2_HOJA_B);
  if (!sh) throw new Error('No existe la hoja "' + DIAG2_HOJA_B + '" en la intermedia.');

  const nFilas = sh.getLastRow();
  if (nFilas < 2) throw new Error('La hoja "' + DIAG2_HOJA_B + '" no tiene datos.');
  const bloque = sh.getRange(1, 1, nFilas, sh.getLastColumn()).getValues();
  const hdr = bloque[0];

  const iNombre   = findIdx_diag(hdr, ['nombre']);
  const iFechaFin = findIdx_diag(hdr, ['fecha_fin', 'fecha fin'], true);
  const iPersonaM = findIdx_diag(hdr, ['persona'], true);
  const iBarrioM  = findIdx_diag(hdr, ['barrio'], true);
  const iFechaM   = findIdx_diag(hdr, ['fecha'], true);

  const filas = [];
  let minFecha = null, maxFecha = null;        // fecha efectiva (texto libre, o Fecha_Fin)
  let minFin = null, maxFin = null;            // sólo Fecha_Fin
  let sinFecha = 0, cargando = 0;

  for (let i = 1; i < bloque.length; i++) {
    const r = bloque[i];
    const nombre = str_diag(r[iNombre]);
    if (nombre === '') continue;

    // IMPORTRANGE asincrónico: si la celda dice "Loading..." la fila todavía no llegó.
    if (/^loading/i.test(nombre)) { cargando++; continue; }

    const fechaFin = iFechaFin != null ? toDate_diag(r[iFechaFin]) : null;
    const fechaTexto = detectFecha_diag2(nombre, fechaFin ? fechaFin.getFullYear()
                                                          : new Date().getFullYear());
    // Misma resolución que syncB_to_B2: primero el texto libre, si no la Fecha_Fin.
    const fechaEfectiva = fechaTexto || fechaFin || null;

    if (fechaEfectiva) {
      if (!minFecha || fechaEfectiva < minFecha) minFecha = fechaEfectiva;
      if (!maxFecha || fechaEfectiva > maxFecha) maxFecha = fechaEfectiva;
    } else {
      sinFecha++;
    }
    /*
     * La ventana del import se mide con Fecha_Fin y no con la fecha efectiva: detectFecha_
     * saca la primera d/m del texto libre, así que un "Reunion 10-12 hs" devuelve 10 de
     * diciembre y estira el rango hacia un extremo que no existe (CLAUDE.md 3.3).
     */
    if (fechaFin) {
      if (!minFin || fechaFin < minFin) minFin = fechaFin;
      if (!maxFin || fechaFin > maxFin) maxFin = fechaFin;
    }

    filas.push({
      fila: i + 1,
      nombre: nombre,
      nombreNorm: normalizeText_diag(nombre),
      // Precalculados una sola vez: diagScores los usa ~103 × ~740 veces.
      figuras: figurasMencionadas_diag2(nombre),
      horaMin: horaDesdeTexto_diag2(nombre),
      barrioDet: detectBarrio_diag2(nombre),
      comunaDet: detectComuna_diag2(nombre),
      fechaFin: fechaFin,
      fechaTexto: fechaTexto || null,
      fechaEfectiva: fechaEfectiva,
      personaManual: iPersonaM != null ? str_diag(r[iPersonaM]) : '',
      barrioManual:  iBarrioM  != null ? str_diag(r[iBarrioM])  : '',
      fechaManual:   iFechaM   != null ? toDate_diag(r[iFechaM]) : null
    });
  }

  Logger.log('[diag2] leído B: %s filas con Nombre (%s en Loading..., %s sin fecha resoluble) ' +
             '| Fecha_Fin %s → %s | fecha efectiva %s → %s | %s ms',
             filas.length, cargando, sinFecha,
             minFin ? fmt_diag2(minFin) : '-', maxFin ? fmt_diag2(maxFin) : '-',
             minFecha ? fmt_diag2(minFecha) : '-', maxFecha ? fmt_diag2(maxFecha) : '-',
             new Date() - t0);

  return { filas: filas, minFecha: minFecha, maxFecha: maxFecha,
           minFin: minFin, maxFin: maxFin, cargando: cargando };
}

/**
 * La población: **toda fila del destino sin contraparte en B2**, venga del hueco o no.
 *
 * Antes esto salía de las filas `no_existe_en_B2` de DIAG_HUECO. Era una definición operativa,
 * no conceptual, y tenía un sesgo que apuntaba justo contra lo que queremos medir: las filas
 * más viejas ya tienen sexo y edades cargados a mano, así que **nunca entran al hueco**. Si el
 * import es una ventana móvil, sus casos se concentran en las filas viejas — exactamente las
 * que estábamos excluyendo — y `desaparecida_del_origen` habría dado cero por construcción.
 *
 * Se lee el destino directo, y cada fila de la población queda etiquetada en `origen_fila`:
 *
 *   hueco               la fila cumple el criterio del hueco (esFilaDelHueco_diag): el
 *                       pipeline falló a la vista, nadie lo tapó a mano.
 *   sin_contraparte_B2  el resto. El trabajo manual cubrió el agujero, así que no se nota,
 *                       pero la fila tampoco tiene fila en B2.
 *
 * Las dos etiquetas son disjuntas y cubren la población entera. `hueco` es un subconjunto de
 * "sin contraparte", no una población aparte: por eso se reporta el reparto de causa en cada
 * una y en el total.
 */
function poblacionSinContraparte_diag2(cache) {
  const dest = cacheDestino_diag2(cache);
  const b2 = cacheB2_diag2(cache);
  const D = dest.D;

  const filas = [];
  let conContraparte = 0, enHueco = 0, resto = 0, claveIncompleta = 0;

  for (let i = 0; i < dest.filas.length; i++) {
    const f = dest.filas[i];
    const reg = f.clave ? b2.porClave.get(f.clave) : null;
    if (reg) { conContraparte++; continue; }

    const esHueco = esFilaDelHueco_diag(f.valores, D);
    if (esHueco) enHueco++; else resto++;
    if (!f.clave) claveIncompleta++;

    filas.push({
      clave: f.clave || '(clave incompleta)',
      figura: f.figura,
      barrio: f.barrio,
      fecha: f.fecha,
      hora: D.Hora != null ? f.valores[D.Hora] : '',
      origen: esHueco ? 'hueco' : 'sin_contraparte_B2'
    });
  }

  Logger.log('[diag2] población: %s filas del destino sin contraparte en B2 ' +
             '(%s del hueco + %s tapadas por carga manual) | con contraparte: %s | ' +
             'sin clave natural completa: %s',
             filas.length, enHueco, resto, conContraparte, claveIncompleta);

  return filas;
}

// ===================== DIAG_CORTE_B =====================

/**
 * Cómo se busca en `B`: **no** por la clave del pipeline, que es justo lo que falla.
 * Se busca por el nombre de la figura como substring del texto libre del evento, más la fecha:
 *
 *   TRUE               el nombre aparece y la fecha efectiva de B coincide exacta
 *   TRUE_fecha_aprox   el nombre aparece y la Fecha_Fin cae dentro de ±15 días
 *   TRUE_sin_fecha     el nombre aparece y la fila de B no tiene ninguna fecha resoluble
 *   FALSE              no hay candidato
 *
 * El match aproximado existe porque `Fecha_Fin` es el cierre del formulario, no la fecha de la
 * reunión, y puede estar corrida unos días. Se marca distinto para no mezclarlo con lo seguro.
 *
 * El tercer nivel existe porque si no `fecha_no_parseable` sería inalcanzable: una fila de B sin
 * ninguna fecha no puede matchear por fecha, y se contaría como `no_esta_en_B` — que es un
 * arreglo completamente distinto. Sólo se acepta si hay **un** candidato por nombre, para no
 * inventar un match ambiguo.
 */
function generarCorteB_diag2(cache) {
  const b = cacheB_diag2(cache);
  const b2 = cacheB2_diag2(cache);
  const poblacion = poblacionSinContraparte_diag2(cache);

  const salida = [['clave_destino', 'origen_fila', 'figura', 'barrio', 'fecha', 'encontrada_en_B',
                   'nombre_evento_en_B', 'detectPersona_devuelve', 'detectBarrio_devuelve',
                   'detectFecha_devuelve', 'causa']];

  const nuevoConteo = function () {
    return {
      no_esta_en_B: 0, desaparecida_del_origen: 0, persona_no_reconocida: 0,
      barrio_no_reconocido: 0, fecha_no_parseable: 0, fecha_mal_parseada: 0,
      deberia_haber_entrado: 0
    };
  };
  const conteo = nuevoConteo();
  const porOrigen = { hueco: nuevoConteo(), sin_contraparte_B2: nuevoConteo() };
  const totalPorOrigen = { hueco: 0, sin_contraparte_B2: 0 };
  let matchExacto = 0, matchAprox = 0, matchSinFecha = 0, multiples = 0, conVariosProblemas = 0;
  const deberianHaberEntrado = [];

  // Nombres de evento que B2 guardó con clave incompleta: sirve para confirmar que la fila
  // del import sí entró a B2, sólo que sin Persona/BarrioN.
  const nombresIncompletosB2 = {};
  (b2.incompletasDetalle || []).forEach(function (d) {
    if (d.nombre) nombresIncompletosB2[normalizeText_diag(d.nombre)] = d.fila;
  });
  let confirmadasEnB2SinClave = 0;

  for (let i = 0; i < poblacion.length; i++) {
    const h = poblacion[i];
    totalPorOrigen[h.origen]++;
    const figuraNorm = normalizeText_diag(h.figura);

    // --- buscar candidatos en B ---
    let elegido, comoMatcheo, candidatos;

    const cand = buscarCandidato_diag2(h, b);
    elegido = cand.elegido; comoMatcheo = cand.comoMatcheo; candidatos = cand.candidatos;
    if (comoMatcheo === 'TRUE') matchExacto++;
    else if (comoMatcheo === 'TRUE_fecha_aprox') matchAprox++;
    else if (comoMatcheo === 'TRUE_sin_fecha') matchSinFecha++;
    if (candidatos > 1) multiples++;

    // --- clasificar ---
    let causa, nombreEvento = '', devPersona = '', devBarrio = '', devFecha = '';

    if (!elegido) {
      // ¿La fecha del destino cae fuera de la ventana que hoy trae el import?
      // Ventana medida con Fecha_Fin, que es el campo confiable; si no hay, la efectiva.
      const vMin = b.minFin || b.minFecha, vMax = b.maxFin || b.maxFecha;
      const fueraDeVentana = h.fecha && vMin && vMax && (h.fecha < vMin || h.fecha > vMax);
      causa = fueraDeVentana ? 'desaparecida_del_origen' : 'no_esta_en_B';
    } else {
      nombreEvento = elegido.nombre;
      const anioPorDefecto = elegido.fechaFin ? elegido.fechaFin.getFullYear()
                                              : new Date().getFullYear();
      devPersona = detectPersona_diag2(elegido.nombre);
      devBarrio  = detectBarrio_diag2(elegido.nombre);
      const fechaDetectada = detectFecha_diag2(elegido.nombre, anioPorDefecto);
      devFecha = fechaDetectada ? fmt_diag2(fechaDetectada) : '';

      // La regla del legado: el texto libre gana, Fecha_Fin es fallback.
      const fechaEfectiva = resolverFecha_diag2(elegido, false);

      let problemas = 0;
      if (devPersona === '') problemas++;
      if (devBarrio === '') problemas++;
      if (!fechaEfectiva || !mismoDia_diag2(fechaEfectiva, h.fecha)) problemas++;
      if (problemas > 1) conVariosProblemas++;

      if (devPersona === '')                     causa = 'persona_no_reconocida';
      else if (devBarrio === '')                 causa = 'barrio_no_reconocido';
      else if (!fechaEfectiva)                   causa = 'fecha_no_parseable';
      else if (!mismoDia_diag2(fechaEfectiva, h.fecha)) causa = 'fecha_mal_parseada';
      else {
        causa = 'deberia_haber_entrado';
        deberianHaberEntrado.push(h.clave + '  ← B fila ' + elegido.fila + ': ' + elegido.nombre);
      }

      if (nombresIncompletosB2[elegido.nombreNorm] != null) confirmadasEnB2SinClave++;
    }

    conteo[causa]++;
    porOrigen[h.origen][causa]++;

    salida.push([
      h.clave, h.origen, h.figura, h.barrio, h.fecha ? fmt_diag2(h.fecha) : '',
      comoMatcheo, nombreEvento, devPersona, devBarrio, devFecha, causa
    ]);
  }

  escribirHoja_diag(DIAG2_SALIDA_CORTE, salida);

  const total = salida.length - 1;
  Logger.log('=== DIAG_CORTE_B ===');
  Logger.log('Población: %s filas del destino sin contraparte en B2', total);
  Logger.log('  del hueco (el pipeline falló a la vista): %s', totalPorOrigen.hueco);
  Logger.log('  tapadas por carga manual (sin_contraparte_B2): %s', totalPorOrigen.sin_contraparte_B2);
  const encontradas = matchExacto + matchAprox + matchSinFecha;
  Logger.log('Encontradas en B: %s | %s por fecha exacta, %s por fecha aproximada, %s sin fecha ' +
             'en B | no encontradas: %s',
             encontradas, matchExacto, matchAprox, matchSinFecha, total - encontradas);
  if (multiples) Logger.log('  %s filas tenían más de un candidato en B; se tomó el mejor.', multiples);

  Logger.log('--- conteo por causa: TOTAL | hueco | tapadas ---');
  Object.keys(conteo).forEach(function (k) {
    Logger.log('  %s: %s  |  %s  |  %s   (%s%% del total)',
               k, conteo[k], porOrigen.hueco[k], porOrigen.sin_contraparte_B2[k],
               total ? Math.round(conteo[k] * 1000 / total) / 10 : 0);
  });
  if (conVariosProblemas) {
    Logger.log('%s filas tienen más de un problema a la vez; se reporta el primero en el orden ' +
               'persona → barrio → fecha.', conVariosProblemas);
  }

  /*
   * El punto de mirar las dos poblaciones por separado: las filas viejas ya tienen sexo y
   * edades cargados a mano, así que no entran al hueco. Si el import es una ventana móvil,
   * sus casos viven en la columna "tapadas" y no en la del hueco.
   */
  const desapHueco = porOrigen.hueco.desaparecida_del_origen;
  const desapTapadas = porOrigen.sin_contraparte_B2.desaparecida_del_origen;
  Logger.log('--- el sesgo que motivó ampliar la población ---');
  Logger.log('  desaparecida_del_origen: %s en el hueco, %s en las tapadas', desapHueco, desapTapadas);
  if (desapTapadas > desapHueco) {
    Logger.log('  >>> Se concentra en las tapadas, como se esperaba. Mirar sólo el hueco habría ' +
               'subestimado la ventana móvil.');
  }

  Logger.log('--- el arreglo que implica cada grupo ---');
  const listas = conteo.persona_no_reconocida + conteo.barrio_no_reconocido;
  const acumulativo = conteo.no_esta_en_B + conteo.desaparecida_del_origen;
  const fechas = conteo.fecha_no_parseable + conteo.fecha_mal_parseada;
  Logger.log('  ampliar las listas de detectPersona_/detectBarrio_ (barato): %s filas', listas);
  Logger.log('    (están en B2 pero sin Persona/BarrioN, así que no se pueden indexar; ' +
             'confirmadas contra las %s claves incompletas de B2: %s coinciden por nombre)',
             b2.incompletas, confirmadasEnB2SinClave);
  Logger.log('  arreglar el parseo de fechas (barato): %s filas', fechas);
  Logger.log('  >>> B2 acumulativo, rehacer syncB_to_B2 (caro): %s filas', acumulativo);
  Logger.log('  sin explicación: %s filas', conteo.deberia_haber_entrado);
  deberianHaberEntrado.forEach(function (s) { Logger.log('    · %s', s); });

  /*
   * B2 tiene 23 claves incompletas y el hueco solo son 72 filas: la rama "ampliar listas" no
   * puede explicarlo todo. Si el conteo de abajo da bajo, hay dos causas mezcladas y hay que
   * atacar las dos.
   */
  Logger.log('--- ¿alcanza con ampliar las listas? ---');
  Logger.log('  filas que esa rama explica: %s de %s (%s%%)', listas, total,
             total ? Math.round(listas * 1000 / total) / 10 : 0);
  Logger.log('  el resto (%s filas) necesita otra cosa: %s de fechas, %s de acumulado, %s sin explicar',
             total - listas, fechas, acumulativo, conteo.deberia_haber_entrado);
  if (listas < total && acumulativo > 0) {
    Logger.log('  >>> Las dos causas están mezcladas. Ampliar listas es necesario pero no ' +
               'suficiente: sin B2 acumulativo quedan %s filas afuera.', acumulativo);
  }

  Logger.log('--- ventana de fechas ---');
  Logger.log('  B por Fecha_Fin:      %s → %s  (el campo confiable)',
             b.minFin ? fmt_diag2(b.minFin) : '-', b.maxFin ? fmt_diag2(b.maxFin) : '-');
  Logger.log('  B por fecha efectiva: %s → %s  (puede estar estirada por fechas mal parseadas)',
             b.minFecha ? fmt_diag2(b.minFecha) : '-', b.maxFecha ? fmt_diag2(b.maxFecha) : '-');
  Logger.log('  destino:              05/07/2025 → 24/09/2026  (auditoría 2026-09)');
  const minVentana = b.minFin || b.minFecha;
  if (minVentana && minVentana > new Date(2025, 6, 5, 12, 0, 0)) {
    Logger.log('  >>> B ARRANCA DESPUÉS que el destino: el import es una ventana móvil y deja ' +
               'caer eventos viejos. syncB_to_B2 no los repone porque B2 es un espejo del ' +
               'import, no un acumulado. Ampliar las listas de nombres y barrios NO alcanza.');
  } else {
    Logger.log('  B cubre el inicio del destino: la hipótesis de la ventana móvil no se sostiene ' +
               'por el extremo viejo. Mirar igual el conteo de no_esta_en_B.');
  }
  if (b.cargando) {
    Logger.log('  OJO: %s filas de B decían "Loading...". El IMPORTRANGE estaba recalculando y ' +
               'este conteo puede estar corrido. Volver a correr.', b.cargando);
  }

  return { total: total, conteo: conteo, porOrigen: porOrigen, totalPorOrigen: totalPorOrigen,
           rangoB: { min: b.minFin || b.minFecha, max: b.maxFin || b.maxFecha },
           deberianHaberEntrado: deberianHaberEntrado };
}

// ===================== DIAG_DUP_B2 =====================

/**
 * Las claves naturales que aparecen más de una vez en B2. Una fila por cada fila de B2
 * involucrada, para poder ver de un vistazo qué las diferencia — que en general es sólo
 * `Inscriptos`, porque la clave de B2 es `nombre|inscriptos` (decisión 3): cuando el número
 * cambia entre corridas, `syncB_to_B2` inserta en vez de actualizar.
 */
function generarDupB2_diag2(cache) {
  const b2 = cacheB2_diag2(cache);

  const salida = [['clave_natural', 'filas_con_esta_clave', 'fila_B2', 'nombre_evento',
                   'KEY_B2', 'inscriptos', 'masculino', 'femenino', 'suma_edades',
                   'procesado_BF']];

  const claves = [];
  b2.grupos.forEach(function (regs, clave) {
    if (regs.length > 1) claves.push(clave);
  });
  claves.sort();

  let filasListadas = 0, soloDifiereInscriptos = 0;

  for (let i = 0; i < claves.length; i++) {
    const clave = claves[i];
    const regs = b2.grupos.get(clave).slice().sort(function (a, c) { return a.fila - c.fila; });

    // ¿Las filas difieren sólo en Inscriptos? Es la firma del problema de la clave.
    const insDistintos = {}, nombresDistintos = {};
    regs.forEach(function (r) {
      insDistintos[r.inscriptos] = true;
      nombresDistintos[normalizeText_diag(r.nombre)] = true;
    });
    if (Object.keys(insDistintos).length === regs.length &&
        Object.keys(nombresDistintos).length === 1) {
      soloDifiereInscriptos++;
    }

    for (let j = 0; j < regs.length; j++) {
      const r = regs[j];
      salida.push([clave, regs.length, r.fila, r.nombre, r.keyB2, r.inscriptos,
                   r.masc, r.fem, r.sumaEdades, r.procesado ? 'TRUE' : 'FALSE']);
      filasListadas++;
    }
  }

  escribirHoja_diag(DIAG2_SALIDA_DUP, salida);

  Logger.log('=== DIAG_DUP_B2 ===');
  Logger.log('Claves naturales repetidas: %s | filas de B2 involucradas: %s',
             claves.length, filasListadas);
  Logger.log('  de esas claves, %s tienen el mismo nombre de evento y distinto Inscriptos:',
             soloDifiereInscriptos);
  Logger.log('  es exactamente el problema de la clave nombre|inscriptos (decisión 3) — cuando');
  Logger.log('  el total cambia entre corridas, syncB_to_B2 inserta una fila nueva.');
  Logger.log('Aparte: %s filas de B2 con clave natural incompleta (Persona o BarrioN vacío).',
             b2.incompletas);

  return { claves: claves.length, filas: filasListadas,
           soloDifiereInscriptos: soloDifiereInscriptos, incompletas: b2.incompletas };
}

// ===================== Búsqueda de candidato y resolución de fecha =====================

/**
 * Busca el candidato de `B` para una fila del destino. Extraído para que `DIAG_CORTE_B` y
 * `DIAG_ANCLA_FECHA` usen exactamente el mismo criterio: si se escribiera dos veces, la
 * comparación entre la regla vieja y la nueva mediría también la diferencia entre dos búsquedas.
 */
function buscarCandidato_diag2(h, b) {
  const figuraNorm = normalizeText_diag(h.figura);
  const vacio = { elegido: null, comoMatcheo: 'FALSE', candidatos: 0 };
  if (!figuraNorm || !h.fecha) return vacio;

  const porNombre = b.filas.filter(function (fb) {
    return fb.nombreNorm.indexOf(figuraNorm) !== -1;
  });

  const exactos = porNombre.filter(function (fb) {
    return fb.fechaEfectiva && mismoDia_diag2(fb.fechaEfectiva, h.fecha);
  });
  if (exactos.length) {
    return { elegido: exactos[0], comoMatcheo: 'TRUE', candidatos: exactos.length };
  }

  const aprox = porNombre.filter(function (fb) {
    const ref = fb.fechaFin || fb.fechaEfectiva;
    return ref && Math.abs(diasEntre_diag2(ref, h.fecha)) <= DIAG2_TOLERANCIA_DIAS;
  });
  if (aprox.length) {
    aprox.sort(function (x, y) {
      const rx = x.fechaFin || x.fechaEfectiva, ry = y.fechaFin || y.fechaEfectiva;
      return Math.abs(diasEntre_diag2(rx, h.fecha)) - Math.abs(diasEntre_diag2(ry, h.fecha));
    });
    return { elegido: aprox[0], comoMatcheo: 'TRUE_fecha_aprox', candidatos: aprox.length };
  }

  // Último recurso: filas de B sin ninguna fecha resoluble, sólo si el nombre no es ambiguo.
  const sinFecha = porNombre.filter(function (fb) {
    return !fb.fechaEfectiva && !fb.fechaFin;
  });
  if (sinFecha.length === 1) {
    return { elegido: sinFecha[0], comoMatcheo: 'TRUE_sin_fecha', candidatos: 1 };
  }
  return vacio;
}

/**
 * La fecha efectiva de una fila de `B`, bajo una de las dos reglas.
 *
 *   usarAncla = false → **legado**: el texto libre gana, `fecha_fin` es fallback
 *                       (Sync B to B2.js:162-163).
 *   usarAncla = true  → **propuesta**: `fecha_fin` es el ancla. La fecha del texto se acepta
 *                       sólo si cae en [fecha_fin + min, fecha_fin + max]; si no, `fecha_fin`.
 *
 * Con `usarAncla` y sin `fecha_fin` no hay ancla contra la cual validar, así que se acepta el
 * texto: es mejor que nada, y son pocas filas (el 99% de `B` tiene `fecha_fin`).
 */
function resolverFecha_diag2(fb, usarAncla) {
  if (!usarAncla) return fb.fechaTexto || fb.fechaFin || null;
  if (!fb.fechaFin) return fb.fechaTexto || null;
  if (!fb.fechaTexto) return fb.fechaFin;
  const d = diasEntre_diag2(fb.fechaTexto, fb.fechaFin);
  const dentro = (d >= VENTANA_FECHA_TEXTO.min && d <= VENTANA_FECHA_TEXTO.max);
  return dentro ? fb.fechaTexto : fb.fechaFin;
}

// ===================== DIAG_ANCLA_FECHA =====================

/**
 * ¿Cuántas de las `fecha_mal_parseada` de `DIAG_CORTE_B` resuelve anclar la fecha a `fecha_fin`?
 *
 * Sólo lectura, y **no cambia el parser**: compara las dos reglas sobre los mismos datos y el
 * mismo candidato, para poder decidir con un número antes de tocar `02_Parsing.js`.
 *
 * Usa el mismo candidato bajo las dos reglas a propósito. Cambiar la resolución de fecha también
 * podría cambiar qué candidato gana, pero mezclar las dos cosas haría imposible saber cuánto
 * aportó la regla nueva. Acá se aísla el efecto de la fecha.
 */
function diagAnclaFecha() {
  const cache = nuevoCache2_diag2();
  const b = cacheB_diag2(cache);
  const poblacion = poblacionSinContraparte_diag2(cache);

  // ---------- 1. Distribución del desvío texto vs fecha_fin, sobre TODO B ----------
  const desvios = [];
  let conTexto = 0, sinTexto = 0, conFechaFin = 0;
  const moda = {};
  for (let i = 0; i < b.filas.length; i++) {
    const fb = b.filas[i];
    if (fb.fechaFin) conFechaFin++;
    if (!fb.fechaTexto) { sinTexto++; continue; }
    conTexto++;
    if (!fb.fechaFin) continue;
    const d = diasEntre_diag2(fb.fechaTexto, fb.fechaFin);
    desvios.push({ d: d, fila: fb.fila, nombre: fb.nombre });
    moda[d] = (moda[d] || 0) + 1;
  }
  const dentroVentana = desvios.filter(function (x) {
    return x.d >= VENTANA_FECHA_TEXTO.min && x.d <= VENTANA_FECHA_TEXTO.max;
  }).length;
  const dentro3 = desvios.filter(function (x) { return Math.abs(x.d) <= 3; }).length;

  // ---------- 2. Reclasificar la población con las dos reglas ----------
  const salida = [['clave_destino', 'origen_fila', 'fila_B', 'nombre_evento_en_B',
                   'fecha_destino', 'fecha_fin_B', 'fecha_texto_B', 'desvio_dias',
                   'fecha_legado', 'fecha_ancla', 'causa_legado', 'causa_ancla', 'efecto']];

  const efectos = { resuelta: 0, rota: 0, cambia: 0, sin_cambio: 0 };
  let malParseadaLegado = 0, malParseadaResueltas = 0, malParseadaSigueMal = 0;

  for (let i = 0; i < poblacion.length; i++) {
    const h = poblacion[i];
    const elegido = buscarCandidato_diag2(h, b).elegido;
    if (!elegido) continue;

    const causaLegado = causaConFecha_diag2(h, elegido, false);
    const causaAncla  = causaConFecha_diag2(h, elegido, true);

    let efecto;
    if (causaLegado === causaAncla)                  efecto = 'sin_cambio';
    else if (causaAncla === 'deberia_haber_entrado') efecto = 'resuelta';
    else if (causaLegado === 'deberia_haber_entrado') efecto = 'rota';
    else                                              efecto = 'cambia';
    efectos[efecto]++;

    if (causaLegado === 'fecha_mal_parseada') {
      malParseadaLegado++;
      if (efecto === 'resuelta') malParseadaResueltas++;
      else malParseadaSigueMal++;
    }

    // Se listan los casos que cambian y, además, todas las fecha_mal_parseada aunque no cambien:
    // son justamente las que hay que poder mirar de a una.
    if (efecto === 'sin_cambio' && causaLegado !== 'fecha_mal_parseada') continue;

    const fLeg = resolverFecha_diag2(elegido, false);
    const fAnc = resolverFecha_diag2(elegido, true);
    const desvio = (elegido.fechaTexto && elegido.fechaFin)
      ? diasEntre_diag2(elegido.fechaTexto, elegido.fechaFin) : '';

    salida.push([h.clave, h.origen, elegido.fila, elegido.nombre,
                 h.fecha ? fmt_diag2(h.fecha) : '',
                 elegido.fechaFin ? fmt_diag2(elegido.fechaFin) : '',
                 elegido.fechaTexto ? fmt_diag2(elegido.fechaTexto) : '',
                 desvio,
                 fLeg ? fmt_diag2(fLeg) : '', fAnc ? fmt_diag2(fAnc) : '',
                 causaLegado, causaAncla, efecto]);
  }

  escribirHoja_diag('DIAG_ANCLA_FECHA', salida);

  // ---------- 3. Log ----------
  Logger.log('=== DIAG_ANCLA_FECHA ===');
  Logger.log('Ventana propuesta: [fecha_fin %s, fecha_fin +%s]',
             VENTANA_FECHA_TEXTO.min, VENTANA_FECHA_TEXTO.max);

  Logger.log('--- desvío del texto libre contra fecha_fin, sobre todo B ---');
  Logger.log('Filas de B: %s | con fecha en el texto: %s | sin fecha en el texto: %s | ' +
             'con fecha_fin: %s', b.filas.length, conTexto, sinTexto, conFechaFin);
  Logger.log('Comparables (texto y fecha_fin): %s', desvios.length);
  Logger.log('  dentro de ±3 días: %s (%s%%)', dentro3,
             desvios.length ? Math.round(dentro3 * 1000 / desvios.length) / 10 : 0);
  Logger.log('  dentro de la ventana propuesta: %s (%s%%)  ← las que la regla ACEPTA',
             dentroVentana,
             desvios.length ? Math.round(dentroVentana * 1000 / desvios.length) / 10 : 0);
  Logger.log('  fuera de la ventana: %s  ← las que pasan a usar fecha_fin y se marcan',
             desvios.length - dentroVentana);

  Logger.log('--- desvíos más frecuentes ---');
  Object.keys(moda).map(Number).sort(function (x, y) { return moda[y] - moda[x]; })
    .slice(0, 8).forEach(function (d) {
      Logger.log('  %s días: %s %s', d >= 0 ? '+' + d : d, moda[d], barra_diag2(moda[d], desvios.length));
    });

  desvios.sort(function (x, y) { return Math.abs(y.d) - Math.abs(x.d); });
  Logger.log('--- los peores outliers ---');
  desvios.slice(0, 6).forEach(function (x) {
    Logger.log('  %s días | B fila %s | %s', x.d, x.fila, x.nombre);
  });

  Logger.log('--- efecto sobre la población de DIAG_CORTE_B ---');
  Logger.log('  fecha_mal_parseada con la regla del legado: %s', malParseadaLegado);
  Logger.log('  >>> de esas, RESUELTAS anclando a fecha_fin: %s (%s%%)', malParseadaResueltas,
             malParseadaLegado ? Math.round(malParseadaResueltas * 1000 / malParseadaLegado) / 10 : 0);
  Logger.log('  siguen mal: %s', malParseadaSigueMal);
  Logger.log('  casos que la regla nueva ROMPE (andaban y dejan de andar): %s', efectos.rota);
  if (efectos.rota > 0) {
    Logger.log('  >>> Mirar esas filas en la solapa antes de escribir la regla en 02_Parsing.js: ' +
               'puede que la ventana esté mal calibrada.');
  }
  Logger.log('  otros cambios de causa: %s | sin cambio: %s', efectos.cambia, efectos.sin_cambio);

  return { desvios: desvios.length, dentroVentana: dentroVentana,
           malParseadaLegado: malParseadaLegado, malParseadaResueltas: malParseadaResueltas,
           malParseadaSigueMal: malParseadaSigueMal, rota: efectos.rota };
}

/** La causa de una fila, con la resolución de fecha que se le pida. Misma precedencia que DIAG_CORTE_B. */
function causaConFecha_diag2(h, elegido, usarAncla) {
  const devPersona = detectPersona_diag2(elegido.nombre);
  if (devPersona === '') return 'persona_no_reconocida';
  const devBarrio = detectBarrio_diag2(elegido.nombre);
  if (devBarrio === '') return 'barrio_no_reconocido';
  const fecha = resolverFecha_diag2(elegido, usarAncla);
  if (!fecha) return 'fecha_no_parseable';
  if (!mismoDia_diag2(fecha, h.fecha)) return 'fecha_mal_parseada';
  return 'deberia_haber_entrado';
}

// ===================== DIAG_SCORES: calibrar el umbral =====================

/**
 * Calcula el score de cada fila de la población contra **todos** los candidatos de `B`, y vuelca
 * la distribución. Sólo lectura: no escribe en el destino ni estampa ningún `RDV_UID`.
 *
 * Existe porque `UMBRAL_MATCH = 0.75` y `MARGEN_MINIMO = 0.15` están puestos a ojo
 * (CLAUDE.md, decisión 2). Sin ver la distribución real, cualquier umbral es inventado. El log
 * incluye un barrido de umbrales para poder elegir uno mirando qué pasa en cada corte.
 *
 * Los pesos salen de `PESOS_MATCH` en `00_Config.js`: se calibra contra los mismos números que
 * va a usar el matcher, no contra una copia.
 */
function diagScores() {
  const cache = nuevoCache2_diag2();
  const b = cacheB_diag2(cache);
  const poblacion = poblacionSinContraparte_diag2(cache);
  const comunas = leerComunas_diag2();

  const salida = [['clave_destino', 'origen_fila', 'mejor_score', 'techo_alcanzable',
                   'segundo_score', 'margen', 'veredicto', 'motivo', 'multi_figura',
                   'fila_B', 'nombre_evento_en_B', 'ubicacion',
                   's_figura', 's_fecha', 's_ubicacion', 's_hora']];

  const veredictos = { escribiria: 0, REVISAR_MATCH: 0, SIN_MATCH: 0 };
  const motivos = { margen_chico: 0, multi_figura: 0, '': 0 };
  const histograma = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];   // 0.0-0.1 ... 0.9-1.0
  const aportes = { figura: 0, fecha: 0, ubicacion: 0, hora: 0 };
  const ubicaciones = {};
  const techos = {};
  const porOrigen = { hueco: { escribiria: 0, REVISAR_MATCH: 0, SIN_MATCH: 0 },
                      sin_contraparte_B2: { escribiria: 0, REVISAR_MATCH: 0, SIN_MATCH: 0 } };
  let sinNingunCandidato = 0, multiFigura = 0, descartadosPorBarrio = 0;

  for (let i = 0; i < poblacion.length; i++) {
    const h = poblacion[i];
    const horaDestino = horaDesdeCelda_diag2(h.hora);

    let mejor = null, segundo = null;
    for (let j = 0; j < b.filas.length; j++) {
      const sc = scoreCandidato_diag2(h, horaDestino, b.filas[j], comunas);
      // Barrio presente en las dos puntas y distinto: el candidato queda afuera, no compite.
      if (sc.descartado) { descartadosPorBarrio++; continue; }
      if (sc.total <= 0) continue;
      if (!mejor || sc.total > mejor.total) { segundo = mejor; mejor = sc; }
      else if (!segundo || sc.total > segundo.total) { segundo = sc; }
    }

    if (!mejor) {
      sinNingunCandidato++;
      veredictos.SIN_MATCH++;
      porOrigen[h.origen].SIN_MATCH++;
      histograma[0]++;
      salida.push([h.clave, h.origen, 0, 0, 0, 0, 'SIN_MATCH', 'sin_candidatos', 'FALSE',
                   '', '', 'sin_candidato', 0, 0, 0, 0]);
      continue;
    }

    ubicaciones[mejor.ubicacion] = (ubicaciones[mejor.ubicacion] || 0) + 1;
    techos[mejor.techo] = (techos[mejor.techo] || 0) + 1;

    const scoreSegundo = segundo ? segundo.total : 0;
    const margen = redondear_diag2(mejor.total - scoreSegundo);
    const esMulti = mejor.fb.figuras.length >= 2;
    if (esMulti) multiFigura++;

    let veredicto, motivo;
    if (mejor.total < UMBRAL_MATCH) {
      veredicto = 'SIN_MATCH'; motivo = '';
    } else if (esMulti) {
      // No es ambigüedad: es una inscripción compartida por varias reuniones. El reparto de
      // inscriptos es una decisión de negocio abierta (CLAUDE.md, decisión 2).
      veredicto = 'REVISAR_MATCH'; motivo = 'multi_figura';
    } else if (margen < MARGEN_MINIMO) {
      veredicto = 'REVISAR_MATCH'; motivo = 'margen_chico';
    } else {
      veredicto = 'escribiria'; motivo = '';
    }

    veredictos[veredicto]++;
    porOrigen[h.origen][veredicto]++;
    motivos[motivo]++;
    histograma[Math.min(9, Math.floor(mejor.total * 10))]++;
    if (mejor.sFigura > 0) aportes.figura++;
    if (mejor.sFecha > 0) aportes.fecha++;
    if (mejor.sBarrio > 0) aportes.ubicacion++;
    if (mejor.sHora > 0) aportes.hora++;

    salida.push([h.clave, h.origen, redondear_diag2(mejor.total), mejor.techo,
                 redondear_diag2(scoreSegundo), margen, veredicto, motivo,
                 esMulti ? 'TRUE' : 'FALSE', mejor.fb.fila, mejor.fb.nombre, mejor.ubicacion,
                 mejor.sFigura, mejor.sFecha, mejor.sBarrio, mejor.sHora]);
  }

  escribirHoja_diag('DIAG_SCORES', salida);

  const total = salida.length - 1;
  Logger.log('=== DIAG_SCORES ===');
  Logger.log('Población: %s filas | candidatos evaluados por fila: %s', total, b.filas.length);
  Logger.log('Pesos: figura %s | fecha %s/%s/%s | barrio %s, comuna-sin-barrio %s | hora %s',
             PESOS_MATCH.figura, PESOS_MATCH.fechaExacta, PESOS_MATCH.fecha1Dia,
             PESOS_MATCH.fecha3Dias, PESOS_MATCH.barrioIgual, PESOS_MATCH.comunaSinBarrio,
             PESOS_MATCH.hora);
  Logger.log('Umbrales PROVISORIOS en uso: UMBRAL_MATCH=%s MARGEN_MINIMO=%s',
             UMBRAL_MATCH, MARGEN_MINIMO);

  Logger.log('--- distribución del mejor score ---');
  for (let k = 9; k >= 0; k--) {
    const desde = (k / 10).toFixed(1), hasta = ((k + 1) / 10).toFixed(1);
    Logger.log('  %s–%s : %s %s', desde, hasta, histograma[k],
               barra_diag2(histograma[k], total));
  }
  Logger.log('  sin ningún candidato con score > 0: %s', sinNingunCandidato);

  Logger.log('--- veredicto con los umbrales actuales: TOTAL | hueco | tapadas ---');
  ['escribiria', 'REVISAR_MATCH', 'SIN_MATCH'].forEach(function (v) {
    Logger.log('  %s: %s  |  %s  |  %s', v, veredictos[v],
               porOrigen.hueco[v], porOrigen.sin_contraparte_B2[v]);
  });
  Logger.log('  de los REVISAR_MATCH: %s por margen chico, %s por multi_figura',
             motivos.margen_chico, motivos.multi_figura);
  Logger.log('  filas cuyo mejor candidato menciona 2+ figuras: %s', multiFigura);

  Logger.log('--- barrido de umbrales (margen mínimo fijo en %s) ---', MARGEN_MINIMO);
  Logger.log('  umbral | escribiría | a revisar | sin match');
  for (let u = 50; u <= 95; u += 5) {
    const umbral = u / 100;
    let esc = 0, rev = 0, sin = 0;
    for (let i = 1; i < salida.length; i++) {
      const mejorSc = Number(salida[i][2]), marg = Number(salida[i][5]);
      const multi = salida[i][8] === 'TRUE';
      if (mejorSc < umbral) sin++;
      else if (multi || marg < MARGEN_MINIMO) rev++;
      else esc++;
    }
    Logger.log('   %s   |     %s      |    %s     |    %s',
               umbral.toFixed(2), esc, rev, sin);
  }

  Logger.log('--- qué señal aporta en el mejor candidato ---');
  Logger.log('  figura: %s de %s | fecha: %s | ubicación: %s | hora: %s',
             aportes.figura, total - sinNingunCandidato, aportes.fecha, aportes.ubicacion,
             aportes.hora);
  Logger.log('  candidatos descartados por barrio presente y distinto: %s', descartadosPorBarrio);
  Logger.log('--- estado de la ubicación en el mejor candidato ---');
  Object.keys(ubicaciones).sort().forEach(function (k) {
    Logger.log('  %s: %s', k, ubicaciones[k]);
  });
  if (ubicaciones.comuna_distinta) {
    Logger.log('  >>> %s con comuna distinta. Hoy suman 0 pero NO descartan: la regla de ' +
               'descarte es sólo para barrio presente y distinto. Si estos casos resultan ser ' +
               'todos falsos, conviene discutir una segunda regla de descarte por comuna.',
               ubicaciones.comuna_distinta);
  }

  Logger.log('--- techo alcanzable (cuánto podría sumar como máximo cada par) ---');
  Object.keys(techos).map(Number).sort(function (x, y) { return y - x; }).forEach(function (t) {
    Logger.log('  %s : %s %s', t.toFixed(2), techos[t], barra_diag2(techos[t], total));
  });
  const bajoUmbral = Object.keys(techos).map(Number)
    .filter(function (t) { return t < UMBRAL_MATCH; })
    .reduce(function (a, t) { return a + techos[t]; }, 0);
  if (bajoUmbral > 0) {
    Logger.log('  >>> %s filas tienen un TECHO por debajo de UMBRAL_MATCH=%s: por más que todo ' +
               'coincida, no pueden alcanzarlo. No es que el match falle, es que el umbral es ' +
               'inalcanzable para ellas. Bajar el umbral o repesar las señales.',
               bajoUmbral, UMBRAL_MATCH);
  }
  if (aportes.hora === 0) {
    Logger.log('  >>> La hora no aportó en NINGÚN caso: 0.10 de peso muerto.');
  }
  if (!comunas.size) {
    Logger.log('  >>> La tabla Comunas no se pudo leer: el parcial de comuna nunca suma.');
  }

  // ---------- Las tres mediciones que sostienen el diseño ----------
  const colisiones = medirColisionesFiguraFecha_diag2(cache);
  const barrioPorMes = medirBarrioPorMes_diag2(b);
  const comunaEnTexto = medirComunaEnTexto_diag2(poblacion, b, comunas);

  return { total: total, veredictos: veredictos, histograma: histograma,
           multiFigura: multiFigura, sinNingunCandidato: sinNingunCandidato,
           techos: techos, ubicaciones: ubicaciones,
           colisiones: colisiones, barrioPorMes: barrioPorMes, comunaEnTexto: comunaEnTexto };
}

/**
 * **Verifica la regla de negocio antes de apoyarse en ella**: "una figura no tiene más de una
 * reunión por día" (CLAUDE.md 1). Si es cierta, `figura + fecha` es clave única y la ubicación
 * deja de ser identidad. Si no lo es, el matching falla en silencio en las excepciones.
 *
 * Se mide sobre **todas** las filas del destino, no sólo sobre la población.
 */
function medirColisionesFiguraFecha_diag2(cache) {
  const dest = cacheDestino_diag2(cache);
  const D = dest.D;
  const porFiguraFecha = new Map();

  for (let i = 0; i < dest.filas.length; i++) {
    const f = dest.filas[i];
    if (!f.figura || !f.fecha) continue;
    const k = normalizeText_diag(f.figura) + '|' +
              Utilities.formatDate(f.fecha, DIAG_TZ, 'yyyyMMdd');
    if (!porFiguraFecha.has(k)) porFiguraFecha.set(k, []);
    porFiguraFecha.get(k).push(f);
  }

  const choques = [];
  porFiguraFecha.forEach(function (filas, k) {
    if (filas.length > 1) choques.push({ clave: k, filas: filas });
  });

  Logger.log('--- ¿figura + fecha es clave única en el destino? ---');
  Logger.log('  pares figura+fecha distintos: %s | filas con figura y fecha: %s',
             porFiguraFecha.size, dest.filas.filter(function (f) { return f.figura && f.fecha; }).length);
  if (!choques.length) {
    Logger.log('  >>> CERO colisiones. La regla de negocio se sostiene contra los datos: ' +
               'figura + fecha alcanza como clave y la ubicación es sólo confirmación.');
  } else {
    Logger.log('  >>> %s pares figura+fecha con MÁS DE UNA fila. La regla NO se sostiene: ' +
               'estas son las excepciones donde el matching fallaría en silencio.', choques.length);
    choques.slice(0, 50).forEach(function (c) {
      Logger.log('    · %s → %s filas: %s', c.clave, c.filas.length,
                 c.filas.map(function (f) {
                   return 'fila ' + f.fila + ' (' + (f.barrio || 'sin barrio') + ')';
                 }).join(' | '));
    });
    if (choques.length > 50) Logger.log('    ... y %s más', choques.length - 50);
  }
  return choques.length;
}

/**
 * **Desde cuándo el origen dejó de mandar barrio.** Reparte por mes las filas de `B` con barrio
 * detectable y sin él. Si el corte es reciente, explica la degradación mes a mes del pipeline
 * (6 casos en abril → 20 en septiembre, CLAUDE.md 3.2).
 *
 * El mes sale de `Fecha_Fin`, que es el campo confiable (CLAUDE.md 3.3).
 */
function medirBarrioPorMes_diag2(b) {
  const meses = {};
  for (let i = 0; i < b.filas.length; i++) {
    const fb = b.filas[i];
    const ref = fb.fechaFin || fb.fechaEfectiva;
    if (!ref) continue;
    const m = Utilities.formatDate(ref, DIAG_TZ, 'yyyy-MM');
    if (!meses[m]) meses[m] = { con: 0, sin: 0, conComuna: 0 };
    if (fb.barrioDet) meses[m].con++;
    else {
      meses[m].sin++;
      if (fb.comunaDet != null) meses[m].conComuna++;
    }
  }

  Logger.log('--- ¿desde cuándo B dejó de mandar barrio? ---');
  Logger.log('  mes     | con barrio | sin barrio | de esas, con comuna | %% sin barrio');
  const claves = Object.keys(meses).sort();
  claves.forEach(function (m) {
    const x = meses[m], tot = x.con + x.sin;
    Logger.log('  %s |     %s     |     %s     |        %s         |    %s%%',
               m, x.con, x.sin, x.conComuna, tot ? Math.round(x.sin * 1000 / tot) / 10 : 0);
  });

  // ¿Hay un corte abrupto? Se busca el primer mes donde "sin barrio" pasa a ser mayoría.
  let corte = null;
  for (let i = 0; i < claves.length; i++) {
    const x = meses[claves[i]], tot = x.con + x.sin;
    if (tot >= 5 && x.sin > x.con) { corte = claves[i]; break; }
  }
  if (corte) {
    Logger.log('  >>> Desde %s el barrio falta en la mayoría de las filas. Si eso coincide con ' +
               'el salto de fallas del pipeline, la causa es el cambio del formulario, no el ' +
               'código.', corte);
  }
  return meses;
}

/**
 * De la población, cuántas tienen comuna en el texto del candidato de `B`, y de esas cuántas
 * coinciden con la comuna que **deriva del barrio del destino** por la tabla `Comunas`.
 *
 * Es la medida de si la comuna sirve de reemplazo del barrio como señal de confirmación.
 */
function medirComunaEnTexto_diag2(poblacion, b, comunas) {
  let conCandidato = 0, conComuna = 0, coinciden = 0, difieren = 0, sinComunaDestino = 0;

  for (let i = 0; i < poblacion.length; i++) {
    const h = poblacion[i];
    const elegido = buscarCandidato_diag2(h, b).elegido;
    if (!elegido) continue;
    conCandidato++;
    if (elegido.comunaDet == null) continue;
    conComuna++;
    const bDest = normalizeText_diag(h.barrio);
    const cDest = bDest ? comunaNumero_diag2(comunas.get(bDest)) : null;
    if (cDest == null) { sinComunaDestino++; continue; }
    if (cDest === elegido.comunaDet) coinciden++; else difieren++;
  }

  Logger.log('--- ¿sirve la comuna del texto como reemplazo del barrio? ---');
  Logger.log('  filas de la población con candidato en B: %s', conCandidato);
  Logger.log('  de esas, con comuna en el texto de B: %s (%s%%)', conComuna,
             conCandidato ? Math.round(conComuna * 1000 / conCandidato) / 10 : 0);
  Logger.log('  de esas, coinciden con la comuna que deriva del barrio del destino: %s', coinciden);
  Logger.log('  difieren: %s | el destino no tiene barrio del cual derivar comuna: %s',
             difieren, sinComunaDestino);
  if (conComuna && coinciden / conComuna >= 0.9) {
    Logger.log('  >>> La comuna del texto es confiable: sirve como confirmación en lugar del ' +
               'barrio que el origen dejó de mandar.');
  } else if (conComuna) {
    Logger.log('  >>> Coincide en menos del 90%%: como señal de confirmación es floja. Revisar ' +
               'detectComuna_ antes de darle 0.15 de peso.');
  }
  return { conCandidato: conCandidato, conComuna: conComuna, coinciden: coinciden,
           difieren: difieren };
}

/**
 * Score de un candidato de `B` contra una fila del destino. Máximo 1.0 con los pesos por
 * defecto: 0.35 figura + 0.30 fecha + 0.25 barrio + 0.10 hora.
 */
function scoreCandidato_diag2(h, horaDestino, fb, comunas) {
  let sFigura = 0, sFecha = 0, sBarrio = 0, sHora = 0;

  // --- figura: mencionada en el texto libre del evento ---
  const figuraNorm = normalizeText_diag(h.figura);
  if (figuraNorm && fb.nombreNorm.indexOf(figuraNorm) !== -1) sFigura = PESOS_MATCH.figura;

  // --- fecha: contra la del texto y contra Fecha_Fin, se queda con la más cercana ---
  if (h.fecha) {
    let dias = null;
    [fb.fechaTexto, fb.fechaFin].forEach(function (f) {
      if (!f) return;
      const d = Math.abs(diasEntre_diag2(f, h.fecha));
      if (dias === null || d < dias) dias = d;
    });
    if (dias !== null) {
      if (dias === 0)      sFecha = PESOS_MATCH.fechaExacta;
      else if (dias <= 1)  sFecha = PESOS_MATCH.fecha1Dia;
      else if (dias <= 3)  sFecha = PESOS_MATCH.fecha3Dias;
    }
  }

  /*
   * --- ubicación: tres estados, no dos (CLAUDE.md 3.3.b y decisión 2) ---
   *
   *   barrio del origen == el del destino     → +0.25
   *   el origen no manda barrio, comuna igual → +0.15
   *   barrio del origen presente y DISTINTO   → DESCARTE del candidato
   *   el origen no manda nada                 → 0, sin penalización
   *
   * La ausencia de dato no puede puntuar como contradicción: desde que el origen dejó de
   * mandar barrio, penalizarla hundiría bajo el umbral justo a las filas que hay que arreglar.
   */
  const bDest = normalizeText_diag(h.barrio);
  const bCand = normalizeText_diag(fb.barrioDet);
  let ubicacion = 'sin_dato';

  if (bCand) {
    if (!bDest) {
      ubicacion = 'destino_sin_barrio';           // no se puede comparar, no puntúa
    } else if (bDest === bCand) {
      sBarrio = PESOS_MATCH.barrioIgual;
      ubicacion = 'barrio_igual';
    } else {
      // Barrio presente en las dos puntas y distinto: no es una reunión candidata.
      return { total: 0, descartado: true, fb: fb, ubicacion: 'barrio_distinto',
               sFigura: sFigura, sFecha: sFecha, sBarrio: 0, sHora: 0 };
    }
  } else if (fb.comunaDet != null) {
    // El origen mandó comuna en vez de barrio. Se compara contra la comuna que deriva del
    // barrio del destino, por la tabla Comunas. Comuna contra comuna, nunca contra un barrio.
    const cDest = bDest ? comunaNumero_diag2(comunas.get(bDest)) : null;
    if (cDest != null && cDest === fb.comunaDet) {
      sBarrio = PESOS_MATCH.comunaSinBarrio;
      ubicacion = 'comuna_igual';
    } else if (cDest != null) {
      ubicacion = 'comuna_distinta';              // se cuenta, pero NO descarta: ver el log
    } else {
      ubicacion = 'destino_sin_comuna';
    }
  }

  // --- hora ---
  if (horaDestino !== null && fb.horaMin !== null &&
      Math.abs(horaDestino - fb.horaMin) <= TOLERANCIA_HORA_MIN) {
    sHora = PESOS_MATCH.hora;
  }

  /*
   * Techo alcanzable para ESTE par: cuánto podría sumar como máximo dadas las señales que
   * existen. Si el origen no manda barrio, el techo baja a 0.90; sin hora, a 0.80. Es el
   * número que dice si el umbral es siquiera alcanzable.
   */
  const techo = PESOS_MATCH.figura + PESOS_MATCH.fechaExacta +
                (bCand ? PESOS_MATCH.barrioIgual
                       : (fb.comunaDet != null ? PESOS_MATCH.comunaSinBarrio : 0)) +
                ((fb.horaMin !== null && horaDestino !== null) ? PESOS_MATCH.hora : 0);

  return { total: sFigura + sFecha + sBarrio + sHora, descartado: false, fb: fb,
           ubicacion: ubicacion, techo: redondear_diag2(techo),
           sFigura: sFigura, sFecha: sFecha, sBarrio: sBarrio, sHora: sHora };
}

/** Tabla `Comunas` de la planilla (1): normalizeText(barrio) → comuna. A=barrio, B=comuna. */
function leerComunas_diag2() {
  const mapa = new Map();
  const sh = SpreadsheetApp.openById(DIAG_ID_DESTINO).getSheetByName('Comunas');
  if (!sh) {
    Logger.log('[diag2] no existe la solapa "Comunas": el parcial de misma comuna no va a sumar.');
    return mapa;
  }
  const n = sh.getLastRow();
  if (n < 2) return mapa;
  const vals = sh.getRange(2, 1, n - 1, 2).getValues();
  for (let i = 0; i < vals.length; i++) {
    const barrio = normalizeText_diag(vals[i][0]);
    const comuna = str_diag(vals[i][1]);
    if (barrio && comuna) mapa.set(barrio, comuna);
  }
  Logger.log('[diag2] leída Comunas: %s barrios mapeados', mapa.size);
  return mapa;
}

function redondear_diag2(n) {
  return Math.round(n * 100) / 100;
}

function barra_diag2(n, total) {
  if (!total || !n) return '';
  const largo = Math.max(1, Math.round(n * 40 / total));
  return new Array(largo + 1).join('#');
}

// ===================== Copias verbatim de Código.js, sufijo _diag2 =====================
/*
 * Copiadas tal cual del legado. NO corregir: acá se mide lo que el código hace hoy.
 * Si el legado cambia, estas copias se actualizan en un commit aparte y se vuelve a medir.
 */

/*
 * La lista sale a un const para que `figurasMencionadas_diag2` pueda contar TODAS las menciones
 * y no sólo la primera. Es el único cambio respecto del original: mismo contenido, mismo orden,
 * misma semántica en `detectPersona_diag2`.
 */
const PERSONAS_DIAG2 = [
    { canon: 'Diego Kravetz',            re: /\bdiego\s+kravetz\b/ },
    { canon: 'Gabriel Mraida',           re: /\bgabriel\s+mraida\b/ },
    { canon: 'Mercedes Miguel',          re: /\bmercedes\s+miguel\b/ },
    { canon: 'Ezequiel Daglio',          re: /\bezequiel\s+daglio\b/ },
    { canon: 'Maximiliano Gallucci',     re: /\bmaximiliano\s+gallucci\b/ },
    { canon: 'Hernan Lombardi',          re: /\bhernan\s+lombardi\b/ },
    { canon: 'Jorge Macri',              re: /\bjorge\s+macri\b/ },
    { canon: 'Maximiliano Piñeiro',      re: /\bmaximiliano\s+pin(?:eiro|n?eiro)\b/ },
    { canon: 'Ignacio Baistrocchi',      re: /\bignacio\s+b(?:ia|ai)strocchi\b/ },
    { canon: 'Gabino Tapia',             re: /\bgabino\s+tapia\b/ },
    { canon: 'Fernán Quirós',            re: /\bfernan\s+quiro(?:s|z)\b/ },
    { canon: 'Laura Alonso',             re: /\blaura\s+alonso\b/ },
    { canon: 'Gustavo Arengo Piragine',  re: /\bgustavo\s+arengo(?:\s+piragin[ei])?\b/ },
    { canon: 'Horacio Giménez',          re: /\bhoracio\s+gimenez\b/ },
    { canon: 'Ezequiel Sabor',           re: /\bezequiel\s+sabor\b/ },
    { canon: 'Clara Muzzio',             re: /\bclara\s+muzzio\b/ },
    { canon: 'Gabriel Sánchez Zinny',    re: /\bgabriel\s+sanchez\s+zinny\b/ },
    { canon: 'Pablo Bereciartua',        re: /\bpablo\s+bereciartua\b/ },
    { canon: 'Gabriela Ricardes',        re: /\bgabriela\s+ricardes\b/ },
    { canon: 'Ruth Landerreche',         re: /\bruth\s+lander+eche\b/ },
];

function detectPersona_diag2(s) {
  const sNorm = normalize_diag2(s);
  for (const p of PERSONAS_DIAG2) if (p.re.test(sNorm)) return p.canon;
  if (/^jorge\s+macri\b/.test(sNorm)) return 'Jorge Macri';
  return '';
}

/** Todas las figuras conocidas mencionadas en el texto. Dos o más ⇒ inscripción compartida. */
function figurasMencionadas_diag2(s) {
  const sNorm = normalize_diag2(s);
  const out = [];
  for (const p of PERSONAS_DIAG2) if (p.re.test(sNorm)) out.push(p.canon);
  return out;
}

/**
 * Hora de inicio en minutos desde medianoche, sacada del texto libre. **No existe en el legado**:
 * es nueva, para la señal de 0.10 del match por score. Conservadora a propósito — si no
 * reconoce el patrón devuelve null y la señal simplemente no suma.
 */
function horaDesdeTexto_diag2(s) {
  const t = String(s == null ? '' : s);
  let m = /\b(\d{1,2})[:.](\d{2})\b/.exec(t);
  if (m) return validarHora_diag2(parseInt(m[1], 10), parseInt(m[2], 10));
  m = /\b(\d{1,2})\s*(?:a|-|–)\s*\d{1,2}\s*(?:hs?\b|horas\b)/i.exec(t);
  if (m) return validarHora_diag2(parseInt(m[1], 10), 0);
  m = /\b(\d{1,2})\s*(?:hs\b|horas\b)/i.exec(t);
  if (m) return validarHora_diag2(parseInt(m[1], 10), 0);
  return null;
}

/** Hora de la columna HORA del destino: puede venir como Date, como '18:30' o como '18'. */
function horaDesdeCelda_diag2(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return validarHora_diag2(v.getHours(), v.getMinutes());
  }
  if (v == null || String(v).trim() === '') return null;
  const t = String(v).trim();
  let m = /^(\d{1,2})[:.](\d{2})/.exec(t);
  if (m) return validarHora_diag2(parseInt(m[1], 10), parseInt(m[2], 10));
  m = /^(\d{1,2})$/.exec(t);
  if (m) return validarHora_diag2(parseInt(m[1], 10), 0);
  return horaDesdeTexto_diag2(t);
}

function validarHora_diag2(h, min) {
  if (!(h >= 0 && h <= 23 && min >= 0 && min <= 59)) return null;
  return h * 60 + min;
}

/**
 * Número de comuna desde el texto libre: `Comuna 6`, `COMUNA 06`, `C6` → 6.
 * **No existe en el legado**: es nueva, porque el origen dejó de mandar barrio y pasó a mandar
 * comuna (CLAUDE.md 3.3.b). La versión de producción va en `02_Parsing.js` como `detectComuna_`.
 *
 * CABA tiene 15 comunas; fuera de 1–15 devuelve null.
 */
function detectComuna_diag2(s) {
  const t = String(s == null ? '' : s);
  let m = /\bcomuna\s*0?(\d{1,2})\b/i.exec(t);
  if (!m) m = /\bc0?(\d{1,2})\b/i.exec(t);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return (n >= 1 && n <= 15) ? n : null;
}

/** Normaliza el valor de comuna de la tabla `Comunas` (puede venir '6', 'Comuna 6', 6). */
function comunaNumero_diag2(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return (v >= 1 && v <= 15) ? v : null;
  const m = /(\d{1,2})/.exec(String(v));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return (n >= 1 && n <= 15) ? n : null;
}

function detectBarrio_diag2(s) {
  const sNorm = normalize_diag2(s);
  const VARIANTS = [
    { canon: 'Núñez',               re: /\bnunez\b/ },
    { canon: 'Vélez Sarsfield',     re: /\bvelez(?:\s+sarsfield)?\b/ },
    { canon: 'San Cristóbal',       re: /\bsan\s+cristobal\b/ },
    { canon: 'San Nicolás',         re: /\bsan\s+nicolas\b/ },
    { canon: 'Villa General Mitre', re: /\bvilla\s+(?:general|gral\.?)\s+mitre\b/ },
    { canon: 'La Paternal',         re: /\b(?:la\s+)?paternal\b/ },
    { canon: 'Nueva Pompeya',       re: /\b(?:nueva\s+)?pompeya\b/ },
    { canon: 'Villa Pueyrredón',    re: /\bvilla\s+pueyrredon\b/ },
    { canon: 'Villa Lugano',        re: /(?:^|\s)(?:villa\s+)?lugano(?:\s|$)/ },
  ];
  for (const v of VARIANTS) if (v.re.test(sNorm)) return v.canon;

  const CANON = [
    'Agronomía','Almagro','Balvanera','Barracas','Belgrano','Boedo','Caballito','Chacarita',
    'Coghlan','Colegiales','Constitución','Flores','Floresta','La Boca','La Paternal','Liniers',
    'Mataderos','Monte Castro','Montserrat','Nueva Pompeya','Núñez','Palermo','Parque Avellaneda',
    'Parque Chacabuco','Parque Chas','Parque Patricios','Puerto Madero','Recoleta','Retiro','Saavedra',
    'San Cristóbal','San Nicolás','San Telmo','Vélez Sarsfield','Versalles','Villa Crespo',
    'Villa del Parque','Villa Devoto','Villa General Mitre','Villa Lugano','Villa Luro',
    'Villa Ortúzar','Villa Pueyrredón','Villa Real','Villa Riachuelo','Villa Santa Rita',
    'Villa Soldati','Villa Urquiza'
  ];
  for (const canon of CANON) {
    const n = normalize_diag2(canon);
    const re = new RegExp('\\b' + escapeRegExp_diag2(n) + '\\b');
    if (re.test(sNorm)) return canon;
  }
  return '';
}

function detectFecha_diag2(s, defaultYear) {
  if (!s) return '';
  const m = /(^|[^\d])(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?([^\d]|$)/.exec(s);
  if (!m) return '';
  let d = parseInt(m[2], 10);
  let M = parseInt(m[3], 10);
  let y = m[4] ? parseInt(m[4], 10) : defaultYear;
  if (y < 100) y += 2000;
  if (!(y >= 1900 && M >= 1 && M <= 12 && d >= 1 && d <= 31)) return '';
  return new Date(y, M - 1, d, 12, 0, 0);
}

function normalize_diag2(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function escapeRegExp_diag2(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ===================== Helpers propios =====================

function fmt_diag2(d) {
  return Utilities.formatDate(d, DIAG_TZ, 'dd/MM/yyyy');
}

function mismoDia_diag2(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

function diasEntre_diag2(a, b) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}
