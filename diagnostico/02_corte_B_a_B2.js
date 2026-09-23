/**
 * Fase 1b — Dónde se corta `B → B2`.
 *
 * SÓLO LECTURA. No escribe ni un valor ni un fondo en el destino. Las dos solapas de salida
 * (DIAG_CORTE_B y DIAG_DUP_B2) van a la planilla intermedia, por escribirHoja_diag().
 *
 * Contexto: el diagnóstico del 2026-09-22 mostró que los pasos 4 y 5 no pierden nada y que el
 * hueco está aguas arriba — 72 de las 79 filas del hueco dan `no_existe_en_B2` (CLAUDE.md 3.2).
 * Este archivo pregunta por qué `syncB_to_B2` no generó fila para ellas.
 *
 * Puntos de entrada:
 *   diagFase1b()    corre los dos, compartiendo lecturas.
 *   diagCorteB()    → DIAG_CORTE_B
 *   diagDupB2()     → DIAG_DUP_B2
 *
 * Depende de `diagnostico/01_hueco_sexo_edades.js`, que está en el mismo proyecto y comparte
 * scope: usa sus helpers `_diag` (str_diag, toDate_diag, normalizeText_diag, findIdx_diag,
 * escribirHoja_diag, indexarB2_diag) y lee la solapa DIAG_HUECO que produce.
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
const DIAG2_HOJA_HUECO  = 'DIAG_HUECO';
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
  return { b: null, hueco: null, b2: null };
}

function cacheB_diag2(cache) {
  if (!cache.b) cache.b = leerB_diag2();
  return cache.b;
}

function cacheHueco_diag2(cache) {
  if (!cache.hueco) cache.hueco = leerHueco_diag2();
  return cache.hueco;
}

function cacheB2_diag2(cache) {
  if (!cache.b2) cache.b2 = indexarB2_diag();   // de 01_hueco_sexo_edades.js
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

/** Lee DIAG_HUECO y devuelve las filas con `no_existe_en_B2`. */
function leerHueco_diag2() {
  const sh = SpreadsheetApp.openById(DIAG_ID_SALIDA).getSheetByName(DIAG2_HOJA_HUECO);
  if (!sh) {
    throw new Error('No existe la solapa "' + DIAG2_HOJA_HUECO + '". Corré diagHuecoSexoEdades() ' +
                    'primero: este reporte trabaja sobre su salida.');
  }
  const nFilas = sh.getLastRow();
  if (nFilas < 2) throw new Error('"' + DIAG2_HOJA_HUECO + '" está vacía.');

  const bloque = sh.getRange(1, 1, nFilas, sh.getLastColumn()).getValues();
  const hdr = bloque[0];
  const iFigura = findIdx_diag(hdr, ['figura']);
  const iBarrio = findIdx_diag(hdr, ['barrio']);
  const iFecha  = findIdx_diag(hdr, ['fecha']);
  const iClave  = findIdx_diag(hdr, ['clave_calculada']);
  const iDiag   = findIdx_diag(hdr, ['diagnostico']);

  const filas = [];
  let total = 0;
  for (let i = 1; i < bloque.length; i++) {
    const r = bloque[i];
    total++;
    if (str_diag(r[iDiag]) !== 'no_existe_en_B2') continue;
    filas.push({
      clave: str_diag(r[iClave]),
      figura: str_diag(r[iFigura]),
      barrio: str_diag(r[iBarrio]),
      fecha: toDate_diag(r[iFecha])
    });
  }

  Logger.log('[diag2] leído DIAG_HUECO: %s filas, %s con no_existe_en_B2', total, filas.length);
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
  const hueco = cacheHueco_diag2(cache);
  const b2 = cacheB2_diag2(cache);

  const salida = [['clave_destino', 'figura', 'barrio', 'fecha', 'encontrada_en_B',
                   'nombre_evento_en_B', 'detectPersona_devuelve', 'detectBarrio_devuelve',
                   'detectFecha_devuelve', 'causa']];

  const conteo = {
    no_esta_en_B: 0, desaparecida_del_origen: 0, persona_no_reconocida: 0,
    barrio_no_reconocido: 0, fecha_no_parseable: 0, fecha_mal_parseada: 0,
    deberia_haber_entrado: 0
  };
  let matchExacto = 0, matchAprox = 0, matchSinFecha = 0, multiples = 0, conVariosProblemas = 0;
  const deberianHaberEntrado = [];

  // Nombres de evento que B2 guardó con clave incompleta: sirve para confirmar que la fila
  // del import sí entró a B2, sólo que sin Persona/BarrioN.
  const nombresIncompletosB2 = {};
  (b2.incompletasDetalle || []).forEach(function (d) {
    if (d.nombre) nombresIncompletosB2[normalizeText_diag(d.nombre)] = d.fila;
  });
  let confirmadasEnB2SinClave = 0;

  for (let i = 0; i < hueco.length; i++) {
    const h = hueco[i];
    const figuraNorm = normalizeText_diag(h.figura);

    // --- buscar candidatos en B ---
    let elegido = null, comoMatcheo = 'FALSE', candidatos = 0;

    if (figuraNorm && h.fecha) {
      const porNombre = b.filas.filter(function (fb) {
        return figuraNorm !== '' && fb.nombreNorm.indexOf(figuraNorm) !== -1;
      });

      const exactos = porNombre.filter(function (fb) {
        return fb.fechaEfectiva && mismoDia_diag2(fb.fechaEfectiva, h.fecha);
      });
      if (exactos.length) {
        elegido = exactos[0];
        comoMatcheo = 'TRUE';
        candidatos = exactos.length;
        matchExacto++;
      } else {
        const aprox = porNombre.filter(function (fb) {
          const ref = fb.fechaFin || fb.fechaEfectiva;
          return ref && Math.abs(diasEntre_diag2(ref, h.fecha)) <= DIAG2_TOLERANCIA_DIAS;
        });
        if (aprox.length) {
          aprox.sort(function (x, y) {
            const rx = x.fechaFin || x.fechaEfectiva, ry = y.fechaFin || y.fechaEfectiva;
            return Math.abs(diasEntre_diag2(rx, h.fecha)) - Math.abs(diasEntre_diag2(ry, h.fecha));
          });
          elegido = aprox[0];
          comoMatcheo = 'TRUE_fecha_aprox';
          candidatos = aprox.length;
          matchAprox++;
        } else {
          // Último recurso: filas de B sin ninguna fecha resoluble. Sólo si el nombre las
          // identifica sin ambigüedad.
          const sinFecha = porNombre.filter(function (fb) {
            return !fb.fechaEfectiva && !fb.fechaFin;
          });
          if (sinFecha.length === 1) {
            elegido = sinFecha[0];
            comoMatcheo = 'TRUE_sin_fecha';
            candidatos = 1;
            matchSinFecha++;
          }
        }
      }
      if (candidatos > 1) multiples++;
    }

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

      // syncB_to_B2 cae a Fecha_Fin si el texto libre no trae fecha.
      const fechaEfectiva = fechaDetectada || elegido.fechaFin || null;

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

    salida.push([
      h.clave, h.figura, h.barrio, h.fecha ? fmt_diag2(h.fecha) : '',
      comoMatcheo, nombreEvento, devPersona, devBarrio, devFecha, causa
    ]);
  }

  escribirHoja_diag(DIAG2_SALIDA_CORTE, salida);

  const total = salida.length - 1;
  Logger.log('=== DIAG_CORTE_B ===');
  Logger.log('Filas analizadas (no_existe_en_B2): %s', total);
  const encontradas = matchExacto + matchAprox + matchSinFecha;
  Logger.log('Encontradas en B: %s | %s por fecha exacta, %s por fecha aproximada, %s sin fecha ' +
             'en B | no encontradas: %s',
             encontradas, matchExacto, matchAprox, matchSinFecha, total - encontradas);
  if (multiples) Logger.log('  %s filas tenían más de un candidato en B; se tomó el mejor.', multiples);
  Logger.log('--- conteo por causa ---');
  Object.keys(conteo).forEach(function (k) {
    const n = conteo[k];
    Logger.log('  %s: %s  (%s%%)', k, n, total ? Math.round(n * 1000 / total) / 10 : 0);
  });
  if (conVariosProblemas) {
    Logger.log('%s filas tienen más de un problema a la vez; se reporta el primero en el orden ' +
               'persona → barrio → fecha.', conVariosProblemas);
  }

  Logger.log('--- el arreglo que implica cada grupo ---');
  const enB2SinClave = conteo.persona_no_reconocida + conteo.barrio_no_reconocido;
  Logger.log('  ampliar las listas de detectPersona_/detectBarrio_: %s filas', enB2SinClave);
  Logger.log('    (están en B2 pero sin Persona/BarrioN, así que no se pueden indexar; ' +
             'confirmadas contra las %s claves incompletas de B2: %s coinciden por nombre)',
             b2.incompletas, confirmadasEnB2SinClave);
  Logger.log('  arreglar el parseo de fechas: %s filas',
             conteo.fecha_no_parseable + conteo.fecha_mal_parseada);
  Logger.log('  >>> B2 acumulativo (la fila ya no está en el import): %s filas',
             conteo.no_esta_en_B + conteo.desaparecida_del_origen);
  Logger.log('  sin explicación: %s filas', conteo.deberia_haber_entrado);
  deberianHaberEntrado.forEach(function (s) { Logger.log('    · %s', s); });

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

  return { total: total, conteo: conteo,
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

// ===================== Copias verbatim de Código.js, sufijo _diag2 =====================
/*
 * Copiadas tal cual del legado. NO corregir: acá se mide lo que el código hace hoy.
 * Si el legado cambia, estas copias se actualizan en un commit aparte y se vuelve a medir.
 */

function detectPersona_diag2(s) {
  const sNorm = normalize_diag2(s);
  const PERSONAS = [
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
  for (const p of PERSONAS) if (p.re.test(sNorm)) return p.canon;
  if (/^jorge\s+macri\b/.test(sNorm)) return 'Jorge Macri';
  return '';
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
