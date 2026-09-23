/**
 * Fase 1 — Diagnóstico del hueco de sexo/edades y de la procedencia de la carga manual.
 *
 * SÓLO LECTURA. Este archivo:
 *   - NO escribe ni un valor ni un fondo en el destino ni en Para Revisar;
 *   - NO toca las once columnas con fórmulas de array (D, W, X, Y, AA–AG). Ver CLAUDE.md 3.1.b;
 *   - sólo crea/reescribe sus cinco solapas DIAG_* en la planilla intermedia (2).
 *
 * Puntos de entrada:
 *   diagFase1()               corre los cinco reportes leyendo todo una sola vez.
 *   diagHuecoSexoEdades()     → DIAG_HUECO
 *   diagPisadoCanales()       → DIAG_PISADO
 *   diagAtomicidad()          → DIAG_ATOMICIDAD
 *   diagTotalDivergente()     → DIAG_TOTAL_DIVERGENTE
 *   diagProcedencia()         → DIAG_PROCEDENCIA
 *   diagEsquemas()            vuelca los encabezados reales al log (para completar fixtures/)
 *
 * Todos los helpers llevan sufijo _diag para no colisionar con las nueve copias de
 * toDate_ / normalizeText_ / etc. que ya viven en el scope global (CLAUDE.md 3.1.c).
 * Este archivo no depende de ninguna función de los otros archivos del proyecto.
 *
 * --- Los dos saltos ---
 * Entre B2 y el destino hay dos saltos, no uno (CLAUDE.md 2):
 *     B2 --paso 4--> Para Revisar --paso 5--> RVD JM-CM - ES
 * Por eso el diagnóstico mide los tres puntos y el valor de `diagnostico` dice en cuál se
 * cortó la fila. Sin eso, un corte en B2→PR y uno en PR→destino se ven iguales y tienen
 * arreglos distintos.
 *
 * --- Criterio de "vacío" ---
 *   - En el DESTINO, vacío es celda en blanco. Un 0 cuenta como valor escrito (CLAUDE.md 0.a):
 *     una celda en blanco significa "nunca se escribió".
 *   - En B2 y en Para Revisar, sexo y edades pasan por num(), que convierte vacío en 0. Por eso
 *     acá "tiene sexo/edades" significa **algún valor distinto de cero**.
 *   - Las filas del destino con Inscriptos > 0 y las ocho columnas de sexo/edad exactamente en
 *     cero son faltantes disfrazadas de dato: se cuentan aparte en el log de DIAG_HUECO y se
 *     listan en DIAG_ATOMICIDAD.
 */

// ===================== Configuración =====================

const DIAG_ID_DESTINO    = '1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo'; // (1) destino final
const DIAG_ID_INTERMEDIA = '1dNLcBjh1ncEVBeALD-szhIlcRGkfOiMaPJp2tGqrsyM'; // (2) base intermedia

const DIAG_HOJA_DESTINO = 'RVD JM-CM - ES';
const DIAG_HOJA_PR      = 'Para Revisar';
const DIAG_HOJA_B2      = 'B2';

/**
 * Dónde se crean las solapas de salida: en la planilla INTERMEDIA, para dejar el destino sin
 * una sola escritura. Cambiar a DIAG_ID_DESTINO sólo si se acepta esa escritura.
 */
const DIAG_ID_SALIDA = DIAG_ID_INTERMEDIA;

/** Los seis rangos etarios, tal como se llaman en las tres hojas. */
const DIAG_RANGOS_ETARIOS = ['18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar'];

/** Los cinco canales. */
const DIAG_CANALES = ['Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión'];

/**
 * COLUMNAS_MANUALES confirmadas (CLAUDE.md, decisión 8). Las carga el equipo a mano; el
 * pipeline las lee y nunca las escribe, ni aunque estén vacías.
 */
const DIAG_COLUMNAS_MANUALES = ['Inscriptos'].concat(DIAG_CANALES);

/**
 * La marca de procedencia: Sinc Base usuario.js:286 pinta este color cada celda que escribe.
 * getBackgrounds() devuelve minúsculas, así que se compara normalizado.
 */
const DIAG_AZUL_SISTEMA = '#4f81bd';

const DIAG_TZ = 'America/Argentina/Buenos_Aires';

// ===================== Puntos de entrada =====================

/** Corre los cinco reportes leyendo destino, Para Revisar y B2 una sola vez. */
function diagFase1() {
  const ctx = leerContexto_diag();
  return {
    hueco:      generarHueco_diag(ctx),
    pisado:     generarPisado_diag(ctx),
    atomicidad: generarAtomicidad_diag(ctx),
    divergente: generarTotalDivergente_diag(ctx),
    procedencia: generarProcedencia_diag(ctx)
  };
}

function diagHuecoSexoEdades()  { return generarHueco_diag(leerContexto_diag()); }
function diagPisadoCanales()    { return generarPisado_diag(leerContexto_diag()); }
function diagAtomicidad()       { return generarAtomicidad_diag(leerContexto_diag()); }
function diagTotalDivergente()  { return generarTotalDivergente_diag(leerContexto_diag()); }
function diagProcedencia()      { return generarProcedencia_diag(leerContexto_diag()); }

/** Vuelca los encabezados reales de las cuatro hojas al log, para completar fixtures/. */
function diagEsquemas() {
  const hojas = [
    [DIAG_ID_DESTINO, DIAG_HOJA_DESTINO],
    [DIAG_ID_DESTINO, DIAG_HOJA_PR],
    [DIAG_ID_INTERMEDIA, DIAG_HOJA_B2],
    [DIAG_ID_INTERMEDIA, 'A2']
  ];
  hojas.forEach(function (par) {
    const sh = SpreadsheetApp.openById(par[0]).getSheetByName(par[1]);
    if (!sh) { Logger.log('%s: no existe', par[1]); return; }
    const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    Logger.log('--- %s (%s columnas) ---', par[1], hdr.length);
    Logger.log(hdr.map(function (h) {
      const s = String(h == null ? '' : h);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(','));
  });
}

// ===================== Lectura (una sola vez, en bloque) =====================

/**
 * Lee destino, Para Revisar y B2 con getValues() en bloque (nunca getValue() por celda: son
 * ~800 filas de destino y Apps Script corta a los 6 minutos).
 */
function leerContexto_diag() {
  const t0 = new Date();
  const ssDest = SpreadsheetApp.openById(DIAG_ID_DESTINO);

  // ---------- Destino ----------
  const shDest = ssDest.getSheetByName(DIAG_HOJA_DESTINO);
  if (!shDest) throw new Error('No existe la hoja "' + DIAG_HOJA_DESTINO + '".');

  const filasDest = shDest.getLastRow();
  const colsDest  = shDest.getLastColumn();
  if (filasDest < 2) throw new Error('La hoja "' + DIAG_HOJA_DESTINO + '" no tiene datos.');

  const bloqueDest = shDest.getRange(1, 1, filasDest, colsDest).getValues();
  const hdrDest    = bloqueDest[0];

  const D = {
    Figura: findIdx_diag(hdrDest, ['figura', 'persona', 'nombre']),
    Barrio: findIdx_diag(hdrDest, ['barrio']),
    Fecha:  findIdx_diag(hdrDest, ['fecha']),
    Ins:    findIdx_diag(hdrDest, ['inscriptos', 'inscritos']),
    Masc:   findIdx_diag(hdrDest, ['masculinos', 'masculino']),
    Fem:    findIdx_diag(hdrDest, ['femeninos', 'femenino']),
    edades: DIAG_RANGOS_ETARIOS.map(function (n) { return findIdx_diag(hdrDest, [n]); }),
    canales: DIAG_CANALES.map(function (n) { return findIdx_diag(hdrDest, alias_diag(n)); }),
    manuales: DIAG_COLUMNAS_MANUALES.map(function (n) { return findIdx_diag(hdrDest, alias_diag(n)); })
  };

  /*
   * getLastRow() del destino devuelve ~2374 y no ~802: las fórmulas de array llegan hasta ahí
   * y cuentan como celda ocupada aunque devuelvan "". Nos quedamos sólo con las filas que
   * tienen algo en la clave natural o en Inscriptos.
   */
  const filas = [];
  for (let i = 1; i < bloqueDest.length; i++) {
    const r = bloqueDest[i];
    const figura = str_diag(r[D.Figura]);
    const barrio = str_diag(r[D.Barrio]);
    const fecha  = toDate_diag(r[D.Fecha]);
    if (figura === '' && barrio === '' && fecha === null && esVacio_diag(r[D.Ins])) continue;
    filas.push({
      fila: i + 1,          // fila real en la planilla (1-based, con encabezado)
      valores: r,
      figura: figura,
      barrio: barrio,
      fecha: fecha,
      clave: claveNatural_diag(figura, barrio, fecha)
    });
  }

  // ---------- Para Revisar (staging: el salto intermedio) ----------
  const shPR = ssDest.getSheetByName(DIAG_HOJA_PR);
  if (!shPR) throw new Error('No existe la hoja "' + DIAG_HOJA_PR + '".');
  const porClavePR = indexarStaging_diag(shPR);

  // ---------- B2 ----------
  const shB2 = SpreadsheetApp.openById(DIAG_ID_INTERMEDIA).getSheetByName(DIAG_HOJA_B2);
  if (!shB2) throw new Error('No existe la hoja "' + DIAG_HOJA_B2 + '".');
  const b2 = indexarB2_diag(shB2);

  Logger.log('[diag] lectura: destino %s filas con datos (getLastRow=%s) | B2 %s claves ' +
             '(%s duplicadas, %s incompletas) | Para Revisar %s claves (%s duplicadas) | %s ms',
             filas.length, filasDest, b2.porClave.size, b2.duplicadas, b2.incompletas,
             porClavePR.porClave.size, porClavePR.duplicadas, new Date() - t0);

  return {
    shDest: shDest,
    D: D,
    filas: filas,
    filasDestCrudas: filasDest,
    porClave: b2.porClave,
    clavesDuplicadasB2: b2.duplicadas,
    clavesIncompletasB2: b2.incompletas,
    porClavePR: porClavePR.porClave,
    clavesDuplicadasPR: porClavePR.duplicadas
  };
}

/** Índice clave natural → datos de B2. */
function indexarB2_diag(sh) {
  const filas = sh.getLastRow();
  if (filas < 2) throw new Error('La hoja "' + DIAG_HOJA_B2 + '" no tiene datos.');
  const bloque = sh.getRange(1, 1, filas, sh.getLastColumn()).getValues();
  const hdr = bloque[0];

  const B = {
    Persona: findIdx_diag(hdr, ['persona', 'figura', 'nombre']),
    BarrioN: findIdx_diag(hdr, ['barrion']),
    Fecha:   findIdx_diag(hdr, ['fecha']),
    Ins:     findIdx_diag(hdr, ['inscriptos', 'inscritos'], true),
    Masc:    findIdx_diag(hdr, ['masculino', 'masculinos'], true),
    Fem:     findIdx_diag(hdr, ['femenino', 'femeninos'], true),
    edades:  DIAG_RANGOS_ETARIOS.map(function (n) { return findIdx_diag(hdr, [n], true); }),
    Mail:    findIdx_diag(hdr, ['mail', 'mailing', 'email'], true),
    Call:    findIdx_diag(hdr, ['call center', 'callcenter'], true),
    IVR:     findIdx_diag(hdr, ['ivr'], true),
    RRSS:    findIdx_diag(hdr, ['rrss'], true),
    FB:      findIdx_diag(hdr, ['facebook'], true),
    GG:      findIdx_diag(hdr, ['google'], true),
    PR:      findIdx_diag(hdr, ['programmatic'], true),
    Dif:     findIdx_diag(hdr, ['difusión', 'difusion'], true),
    Proc:    findIdx_diag(hdr, ['procesado bf', 'procesado', 'procesado base final'], true)
  };

  const porClave = new Map();
  let incompletas = 0, duplicadas = 0;

  for (let i = 1; i < bloque.length; i++) {
    const r = bloque[i];
    const persona = str_diag(r[B.Persona]);
    const barrioN = str_diag(r[B.BarrioN]);
    const fecha   = toDate_diag(r[B.Fecha]);
    if (persona === '' && barrioN === '' && fecha === null) continue;

    const clave = claveNatural_diag(persona, barrioN, fecha);
    if (!clave) { incompletas++; continue; }

    const masc = B.Masc != null ? num_diag(r[B.Masc]) : 0;
    const fem  = B.Fem  != null ? num_diag(r[B.Fem])  : 0;
    const sumaEdades = B.edades.reduce(function (acc, idx) {
      return acc + (idx != null ? num_diag(r[idx]) : 0);
    }, 0);

    const reg = {
      fila: i + 1,
      inscriptos: B.Ins != null ? num_diag(r[B.Ins]) : 0,
      tieneSexo: (masc > 0 || fem > 0),
      tieneEdades: (sumaEdades > 0),
      procesado: esProcesado_diag(B.Proc != null ? r[B.Proc] : ''),
      canales: DIAG_CANALES.map(function (nombre) { return valorCanalB2_diag(r, B, nombre); })
    };

    const previo = porClave.get(clave);
    if (!previo) {
      porClave.set(clave, reg);
    } else {
      duplicadas++;
      if (!(previo.tieneSexo || previo.tieneEdades) && (reg.tieneSexo || reg.tieneEdades)) {
        porClave.set(clave, reg);
      }
    }
  }

  return { porClave: porClave, duplicadas: duplicadas, incompletas: incompletas };
}

/** Índice clave natural → datos de Para Revisar (mismos nombres de columna que el destino). */
function indexarStaging_diag(sh) {
  const filas = sh.getLastRow();
  const porClave = new Map();
  if (filas < 2) return { porClave: porClave, duplicadas: 0 };

  const bloque = sh.getRange(1, 1, filas, sh.getLastColumn()).getValues();
  const hdr = bloque[0];

  const P = {
    Figura: findIdx_diag(hdr, ['figura', 'persona', 'nombre']),
    Barrio: findIdx_diag(hdr, ['barrio']),
    Fecha:  findIdx_diag(hdr, ['fecha']),
    Ins:    findIdx_diag(hdr, ['inscriptos', 'inscritos'], true),
    Masc:   findIdx_diag(hdr, ['masculinos', 'masculino'], true),
    Fem:    findIdx_diag(hdr, ['femeninos', 'femenino'], true),
    edades: DIAG_RANGOS_ETARIOS.map(function (n) { return findIdx_diag(hdr, [n], true); })
  };

  let duplicadas = 0;
  for (let i = 1; i < bloque.length; i++) {
    const r = bloque[i];
    const figura = str_diag(r[P.Figura]);
    const barrio = str_diag(r[P.Barrio]);
    const fecha  = toDate_diag(r[P.Fecha]);
    if (figura === '' && barrio === '' && fecha === null) continue;

    const clave = claveNatural_diag(figura, barrio, fecha);
    if (!clave) continue;

    const masc = P.Masc != null ? num_diag(r[P.Masc]) : 0;
    const fem  = P.Fem  != null ? num_diag(r[P.Fem])  : 0;
    const sumaEdades = P.edades.reduce(function (acc, idx) {
      return acc + (idx != null ? num_diag(r[idx]) : 0);
    }, 0);

    const reg = {
      fila: i + 1,
      inscriptos: P.Ins != null ? num_diag(r[P.Ins]) : 0,
      tieneSexo: (masc > 0 || fem > 0),
      tieneEdades: (sumaEdades > 0)
    };

    const previo = porClave.get(clave);
    if (!previo) {
      porClave.set(clave, reg);
    } else {
      duplicadas++;
      if (!(previo.tieneSexo || previo.tieneEdades) && (reg.tieneSexo || reg.tieneEdades)) {
        porClave.set(clave, reg);
      }
    }
  }

  return { porClave: porClave, duplicadas: duplicadas };
}

// ===================== DIAG_HUECO =====================

/**
 * Clasifica cada fila del hueco por el punto más lejano al que llegó el dato:
 *
 *   clave_incompleta         no se puede armar la clave natural en el destino
 *   corte_PR_a_destino       el dato está en Para Revisar y no cruzó → falló el paso 5
 *   corte_B2_a_PR_flag_TRUE  el dato está en B2, no llegó al staging, y Procesado BF = TRUE
 *   corte_B2_a_PR_flag_FALSE ídem pero sin el flag: el salteo no lo explica
 *   no_existe_en_B2          la fila nunca llegó a B2 → el problema es aguas arriba
 *   B2_vacio_tambien         B2 la tiene pero sin sexo ni edades → el origen no los trajo
 *
 * La rama de Para Revisar se decide por sexo O edades (en la práctica faltan siempre juntos,
 * CLAUDE.md 3.2); la columna que se publica es PR_tiene_sexo, como se pidió.
 */
function generarHueco_diag(ctx) {
  const D = ctx.D;

  const salida = [[
    'Figura', 'Barrio', 'Fecha', 'clave_calculada', 'existe_en_B2',
    'B2_tiene_sexo', 'B2_tiene_edades', 'B2_Procesado_BF',
    'existe_en_PR', 'PR_tiene_sexo', 'diagnostico'
  ]];

  const conteo = {
    clave_incompleta: 0,
    no_existe_en_B2: 0,
    B2_vacio_tambien: 0,
    corte_B2_a_PR_flag_TRUE: 0,
    corte_B2_a_PR_flag_FALSE: 0,
    corte_PR_a_destino: 0
  };

  // Contadores de contexto, para reconciliar contra la tabla de CLAUDE.md 3.2.
  let conInscriptos = 0, sinInscriptos = 0;
  let sexoYEdadesVacias = 0, soloSexoVacio = 0, soloEdadesVacias = 0;
  let todoEnCero = 0; // Inscriptos > 0 y las ocho columnas exactamente en cero

  for (let i = 0; i < ctx.filas.length; i++) {
    const f = ctx.filas[i];
    const r = f.valores;

    if (esVacio_diag(r[D.Ins])) { sinInscriptos++; continue; }
    conInscriptos++;

    const sexoVacio = esVacio_diag(r[D.Masc]) && esVacio_diag(r[D.Fem]);
    const edadesVacias = D.edades.every(function (idx) { return esVacio_diag(r[idx]); });

    // Faltantes disfrazadas de dato: hay número, y el número es cero en las ocho columnas.
    const ochoEnCero =
      !esVacio_diag(r[D.Masc]) && !esVacio_diag(r[D.Fem]) &&
      num_diag(r[D.Masc]) === 0 && num_diag(r[D.Fem]) === 0 &&
      D.edades.every(function (idx) { return !esVacio_diag(r[idx]) && num_diag(r[idx]) === 0; });
    if (num_diag(r[D.Ins]) > 0 && ochoEnCero) todoEnCero++;

    if (sexoVacio && edadesVacias) sexoYEdadesVacias++;
    else if (sexoVacio) soloSexoVacio++;
    else if (edadesVacias) soloEdadesVacias++;

    if (!(sexoVacio && edadesVacias)) continue; // el hueco es sexo Y edades vacíos a la vez

    const b2  = f.clave ? ctx.porClave.get(f.clave) : null;
    const pr  = f.clave ? ctx.porClavePR.get(f.clave) : null;
    const b2TieneDatos = !!b2 && (b2.tieneSexo || b2.tieneEdades);
    const prTieneDatos = !!pr && (pr.tieneSexo || pr.tieneEdades);

    let diagnostico;
    if (!f.clave)            diagnostico = 'clave_incompleta';
    else if (prTieneDatos)   diagnostico = 'corte_PR_a_destino';
    else if (b2TieneDatos)   diagnostico = b2.procesado ? 'corte_B2_a_PR_flag_TRUE'
                                                        : 'corte_B2_a_PR_flag_FALSE';
    else if (!b2)            diagnostico = 'no_existe_en_B2';
    else                     diagnostico = 'B2_vacio_tambien';

    conteo[diagnostico]++;

    salida.push([
      f.figura,
      f.barrio,
      f.fecha ? Utilities.formatDate(f.fecha, DIAG_TZ, 'dd/MM/yyyy') : '',
      f.clave || '',
      b2 ? 'TRUE' : 'FALSE',
      b2 ? (b2.tieneSexo   ? 'TRUE' : 'FALSE') : '',
      b2 ? (b2.tieneEdades ? 'TRUE' : 'FALSE') : '',
      b2 ? (b2.procesado   ? 'TRUE' : 'FALSE') : '',
      pr ? 'TRUE' : 'FALSE',
      pr ? (pr.tieneSexo   ? 'TRUE' : 'FALSE') : '',
      diagnostico
    ]);
  }

  escribirHoja_diag('DIAG_HUECO', salida);

  const total = salida.length - 1;
  Logger.log('=== DIAG_HUECO ===');
  Logger.log('Filas con datos en el destino: %s', ctx.filas.length);
  Logger.log('  con Inscriptos cargado: %s | sin Inscriptos: %s', conInscriptos, sinInscriptos);
  Logger.log('  sexo Y edades vacíos (el hueco): %s', sexoYEdadesVacias);
  Logger.log('  sólo sexo vacío: %s | sólo edades vacías: %s', soloSexoVacio, soloEdadesVacias);
  Logger.log('  >>> Inscriptos > 0 y las OCHO columnas exactamente en CERO: %s', todoEnCero);
  Logger.log('      (faltantes disfrazadas de dato: no entran en el hueco porque la celda no ' +
             'está vacía, pero tampoco son datos. Se listan en DIAG_ATOMICIDAD.)');
  Logger.log('Filas analizadas: %s', total);
  Logger.log('--- conteo por diagnostico ---');
  Object.keys(conteo).forEach(function (k) {
    const n = conteo[k];
    const pct = total ? Math.round(n * 1000 / total) / 10 : 0;
    Logger.log('  %s: %s  (%s%%)', k, n, pct);
  });
  Logger.log('--- dónde se corta ---');
  Logger.log('  antes de B2 (origen): %s',
             conteo.no_existe_en_B2 + conteo.B2_vacio_tambien);
  Logger.log('  en B2 -> Para Revisar (paso 4): %s',
             conteo.corte_B2_a_PR_flag_TRUE + conteo.corte_B2_a_PR_flag_FALSE);
  Logger.log('  en Para Revisar -> destino (paso 5): %s', conteo.corte_PR_a_destino);
  if (ctx.clavesDuplicadasB2 || ctx.clavesDuplicadasPR) {
    Logger.log('Aviso: claves repetidas — B2 %s, Para Revisar %s. Se usó la fila con datos.',
               ctx.clavesDuplicadasB2, ctx.clavesDuplicadasPR);
  }

  return { total: total, conteo: conteo, todoEnCero: todoEnCero,
           conInscriptos: conInscriptos, sinInscriptos: sinInscriptos };
}

// ===================== DIAG_PISADO =====================

function generarPisado_diag(ctx) {
  const D = ctx.D;
  const salida = [['Figura', 'Barrio', 'Fecha', 'columna', 'valor_destino', 'valor_B2', 'coincide']];

  const res = {
    filasComparadas: 0, filasSinMatch: 0, celdasComparadas: 0,
    coinciden: 0, difieren: 0,
    difierenB2EnCero: 0,      // el destino tiene un valor > 0 y B2 traería 0 ← el caso que importa
    difierenDestinoVacio: 0,  // el destino está en blanco y B2 traería algo
    difierenEnB2Procesado: 0,
    filasAfectadas: 0,
    porColumna: {}
  };
  DIAG_CANALES.forEach(function (c) { res.porColumna[c] = { coinciden: 0, difieren: 0, b2EnCero: 0 }; });

  for (let i = 0; i < ctx.filas.length; i++) {
    const f = ctx.filas[i];
    const r = f.valores;
    const b2 = f.clave ? ctx.porClave.get(f.clave) : null;

    res.filasComparadas++;
    if (!b2) res.filasSinMatch++;

    const fechaTxt = f.fecha ? Utilities.formatDate(f.fecha, DIAG_TZ, 'dd/MM/yyyy') : '';
    let filaAfectada = false;

    for (let c = 0; c < DIAG_CANALES.length; c++) {
      const nombre = DIAG_CANALES[c];
      const valorDestino = r[D.canales[c]];

      if (!b2) {
        salida.push([f.figura, f.barrio, fechaTxt, nombre, valorDestino, '',
                     f.clave ? 'sin_match_en_B2' : 'clave_incompleta']);
        continue;
      }

      const valorB2 = b2.canales[c];
      const destinoVacio = esVacio_diag(valorDestino);
      const coincide = !destinoVacio && num_diag(valorDestino) === valorB2;

      res.celdasComparadas++;
      if (coincide) {
        res.coinciden++;
        res.porColumna[nombre].coinciden++;
      } else {
        res.difieren++;
        res.porColumna[nombre].difieren++;
        filaAfectada = true;
        if (destinoVacio) {
          res.difierenDestinoVacio++;
        } else if (num_diag(valorDestino) > 0 && valorB2 === 0) {
          res.difierenB2EnCero++;
          res.porColumna[nombre].b2EnCero++;
        }
        if (b2.procesado) res.difierenEnB2Procesado++;
      }

      salida.push([f.figura, f.barrio, fechaTxt, nombre, valorDestino, valorB2,
                   coincide ? 'TRUE' : 'FALSE']);
    }

    if (filaAfectada) res.filasAfectadas++;
  }

  escribirHoja_diag('DIAG_PISADO', salida);

  Logger.log('=== DIAG_PISADO ===');
  Logger.log('Filas del destino recorridas: %s (sin match en B2: %s)',
             res.filasComparadas, res.filasSinMatch);
  Logger.log('Celdas comparadas: %s | coinciden: %s | difieren: %s',
             res.celdasComparadas, res.coinciden, res.difieren);
  Logger.log('  B2 pisaría con CERO un valor cargado: %s', res.difierenB2EnCero);
  Logger.log('  el destino está vacío y B2 traería algo: %s', res.difierenDestinoVacio);
  Logger.log('  la fila de B2 tiene Procesado BF = TRUE: %s', res.difierenEnB2Procesado);
  Logger.log('Filas del destino con al menos un canal que B2 cambiaría: %s', res.filasAfectadas);
  Logger.log('NOTA: hoy ese pisado se detiene en Para Revisar — el paso 5 sólo completa celdas ' +
             'vacías del destino. Esto mide lo que rompería sacar el staging sin setSiDelSistema_.');
  DIAG_CANALES.forEach(function (c) {
    const p = res.porColumna[c];
    Logger.log('  %s: coinciden %s | difieren %s | de esas, B2 en cero %s',
               c, p.coinciden, p.difieren, p.b2EnCero);
  });

  return res;
}

// ===================== DIAG_ATOMICIDAD =====================

/**
 * Inscriptos y los canales los carga el usuario y tienen que entrar todos juntos.
 * Siete estados, que cubren las ocho combinaciones de (hay total, hay canales, hay desagregado):
 *   vacio                      no hay total ni canales ni sexo/edades
 *   solo_total                 hay Inscriptos y nada más
 *   solo_desagregado           hay sexo/edades y nada más: el sistema escribió sobre una fila
 *                              que el usuario todavía no cargó. El espejo de solo_total.
 *   parcial_falta_canales      hay total y desagregado, pero los canales están en cero
 *   parcial_falta_sexo_edades  hay canales pero el desagregado está en cero
 *   completo_y_cuadra          las tres sumas coinciden con el total
 *   completo_no_cuadra         está todo cargado pero alguna suma no da el total
 *
 * Las filas con canales y/o desagregado pero sin total (que no son solo_desagregado) se
 * cuentan aparte en el log: sinTotalConDesagregado.
 */
function generarAtomicidad_diag(ctx) {
  const D = ctx.D;
  const salida = [['Figura', 'Barrio', 'Fecha', 'inscriptos', 'suma_canales',
                   'suma_sexo', 'suma_edades', 'estado']];

  const conteo = {
    completo_y_cuadra: 0, completo_no_cuadra: 0,
    parcial_falta_canales: 0, parcial_falta_sexo_edades: 0,
    solo_total: 0, solo_desagregado: 0, vacio: 0
  };
  let sinTotalConDesagregado = 0;
  let canalesNoCuadran = 0, sexoNoCuadra = 0, edadesNoCuadran = 0;

  for (let i = 0; i < ctx.filas.length; i++) {
    const f = ctx.filas[i];
    const r = f.valores;

    const total = num_diag(r[D.Ins]);
    const sumaCanales = D.canales.reduce(function (a, idx) { return a + num_diag(r[idx]); }, 0);
    const sumaSexo = num_diag(r[D.Masc]) + num_diag(r[D.Fem]);
    const sumaEdades = D.edades.reduce(function (a, idx) { return a + num_diag(r[idx]); }, 0);

    const hayTotal = total > 0;
    const hayCanales = sumaCanales > 0;
    const hayDesagregado = sumaSexo > 0 || sumaEdades > 0;

    let estado;
    if (!hayTotal && !hayCanales && !hayDesagregado) {
      estado = 'vacio';
    } else if (hayTotal && !hayCanales && !hayDesagregado) {
      estado = 'solo_total';
    } else if (!hayTotal && !hayCanales && hayDesagregado) {
      estado = 'solo_desagregado';
    } else if (hayCanales && hayDesagregado) {
      const cuadra = (sumaCanales === total) && (sumaSexo === total) && (sumaEdades === total);
      estado = cuadra ? 'completo_y_cuadra' : 'completo_no_cuadra';
      if (!cuadra) {
        if (sumaCanales !== total) canalesNoCuadran++;
        if (sumaSexo !== total) sexoNoCuadra++;
        if (sumaEdades !== total) edadesNoCuadran++;
      }
      if (!hayTotal) sinTotalConDesagregado++;
    } else if (hayCanales && !hayDesagregado) {
      estado = 'parcial_falta_sexo_edades';
      if (!hayTotal) sinTotalConDesagregado++;
    } else {
      // hayTotal && !hayCanales && hayDesagregado
      estado = 'parcial_falta_canales';
    }

    conteo[estado]++;

    salida.push([
      f.figura, f.barrio,
      f.fecha ? Utilities.formatDate(f.fecha, DIAG_TZ, 'dd/MM/yyyy') : '',
      total, sumaCanales, sumaSexo, sumaEdades, estado
    ]);
  }

  escribirHoja_diag('DIAG_ATOMICIDAD', salida);

  const total = salida.length - 1;
  Logger.log('=== DIAG_ATOMICIDAD ===');
  Logger.log('Filas del destino: %s', total);
  Object.keys(conteo).forEach(function (k) {
    const n = conteo[k];
    const pct = total ? Math.round(n * 1000 / total) / 10 : 0;
    Logger.log('  %s: %s  (%s%%)', k, n, pct);
  });
  Logger.log('De las que no cuadran: canales != total %s | sexo != total %s | edades != total %s',
             canalesNoCuadran, sexoNoCuadra, edadesNoCuadran);
  Logger.log('Filas con desagregado y sin total cargado: %s', sinTotalConDesagregado);

  return { total: total, conteo: conteo, sinTotalConDesagregado: sinTotalConDesagregado };
}

// ===================== DIAG_TOTAL_DIVERGENTE =====================

/**
 * El pipeline calcula sexo y edades como Math.round(inscriptos_de_B x ratio), usando el total
 * del ORIGEN; pero el Inscriptos que se muestra en el destino lo escribe el USUARIO. Si esos
 * dos números no son el mismo, el desagregado que ve la gente no suma el total que ve la gente.
 */
function generarTotalDivergente_diag(ctx) {
  const D = ctx.D;
  const salida = [['clave', 'inscriptos_destino_manual', 'inscriptos_B2_origen', 'diferencia',
                   'suma_sexo', 'suma_edades', 'sin_contraparte_B2']];

  let comparadas = 0, sinMatch = 0, divergen = 0;
  let divergenConDesagregado = 0;
  let sexoNoSumaTotalManual = 0, edadesNoSumanTotalManual = 0;
  let sinMatchConDesagregado = 0;
  let sumaDiferenciaAbs = 0;

  for (let i = 0; i < ctx.filas.length; i++) {
    const f = ctx.filas[i];
    const r = f.valores;
    const b2 = f.clave ? ctx.porClave.get(f.clave) : null;

    const insDestino = num_diag(r[D.Ins]);
    const sumaSexo = num_diag(r[D.Masc]) + num_diag(r[D.Fem]);
    const sumaEdades = D.edades.reduce(function (a, idx) { return a + num_diag(r[idx]); }, 0);

    /*
     * Sin contraparte en B2 no hay contra qué comparar, pero la fila igual se emite: que no
     * haya con qué cotejar el total también es un hallazgo, sobre todo si el desagregado está
     * escrito — quiere decir que salió de algún lado que hoy no se puede reconstruir.
     */
    if (!b2) {
      sinMatch++;
      if (sumaSexo > 0 || sumaEdades > 0) sinMatchConDesagregado++;
      salida.push([f.clave || '(clave incompleta)', insDestino, '', '',
                   sumaSexo, sumaEdades, 'TRUE']);
      continue;
    }

    const insB2 = b2.inscriptos;
    const diferencia = insDestino - insB2;

    comparadas++;
    if (diferencia !== 0) {
      divergen++;
      sumaDiferenciaAbs += Math.abs(diferencia);
      if (sumaSexo > 0 || sumaEdades > 0) divergenConDesagregado++;
    }
    if (sumaSexo > 0 && sumaSexo !== insDestino) sexoNoSumaTotalManual++;
    if (sumaEdades > 0 && sumaEdades !== insDestino) edadesNoSumanTotalManual++;

    salida.push([f.clave, insDestino, insB2, diferencia, sumaSexo, sumaEdades, 'FALSE']);
  }

  escribirHoja_diag('DIAG_TOTAL_DIVERGENTE', salida);

  Logger.log('=== DIAG_TOTAL_DIVERGENTE ===');
  Logger.log('Filas emitidas: %s | comparables: %s | sin contraparte en B2: %s',
             salida.length - 1, comparadas, sinMatch);
  Logger.log('  de las sin contraparte, con desagregado ya escrito: %s', sinMatchConDesagregado);
  Logger.log('Filas donde Inscriptos manual != Inscriptos de B2: %s', divergen);
  Logger.log('  >>> de esas, con desagregado escrito por el sistema: %s', divergenConDesagregado);
  Logger.log('      (son las filas donde el desagregado NO suma el total que ve la gente)');
  Logger.log('Suma de las diferencias absolutas: %s inscriptos', sumaDiferenciaAbs);
  Logger.log('Filas con sexo cargado que no suma el total manual: %s', sexoNoSumaTotalManual);
  Logger.log('Filas con edades cargadas que no suman el total manual: %s', edadesNoSumanTotalManual);

  return { comparadas: comparadas, sinMatch: sinMatch, divergen: divergen,
           divergenConDesagregado: divergenConDesagregado,
           sinMatchConDesagregado: sinMatchConDesagregado };
}

// ===================== DIAG_PROCEDENCIA =====================

/**
 * Para las seis COLUMNAS_MANUALES, cuenta cuántas celdas con valor tienen fondo #4F81BD (las
 * escribió el sistema: no debería) y cuántas no (las cargó una persona).
 *
 * Lee los fondos con getBackgrounds(), una llamada por columna: son seis columnas por ~2374
 * filas, contra las ~97.000 celdas que traería leer la hoja entera.
 *
 * Límite conocido: el azul dice "el sistema escribió acá alguna vez", no "esto es del sistema
 * ahora". Si una persona corrigió a mano sobre una celda azul, sigue contando como del sistema.
 * Ver docs/sync-bidireccional.md.
 */
function generarProcedencia_diag(ctx) {
  const D = ctx.D;
  const sh = ctx.shDest;
  const primeraFila = 2;
  const nFilas = ctx.filasDestCrudas - 1;

  const salida = [['columna', 'celdas_con_valor', 'escritas_por_sistema_azul',
                   'cargadas_a_mano', 'pct_pisado', 'celdas_vacias_con_azul']];

  const totales = { conValor: 0, azul: 0, mano: 0, vaciasAzul: 0 };

  for (let c = 0; c < DIAG_COLUMNAS_MANUALES.length; c++) {
    const nombre = DIAG_COLUMNAS_MANUALES[c];
    const idx = D.manuales[c];
    const fondos = sh.getRange(primeraFila, idx + 1, nFilas, 1).getBackgrounds();

    let conValor = 0, azul = 0, mano = 0, vaciasAzul = 0;

    for (let i = 0; i < ctx.filas.length; i++) {
      const f = ctx.filas[i];
      const valor = f.valores[idx];
      const fondo = String(fondos[f.fila - primeraFila][0] || '').toLowerCase();
      const esAzul = (fondo === DIAG_AZUL_SISTEMA);

      if (esVacio_diag(valor)) {
        if (esAzul) vaciasAzul++;
      } else {
        conValor++;
        if (esAzul) azul++; else mano++;
      }
    }

    totales.conValor += conValor;
    totales.azul += azul;
    totales.mano += mano;
    totales.vaciasAzul += vaciasAzul;

    salida.push([nombre, conValor, azul, mano,
                 conValor ? Math.round(azul * 1000 / conValor) / 10 : 0, vaciasAzul]);
  }

  salida.push(['TOTAL', totales.conValor, totales.azul, totales.mano,
               totales.conValor ? Math.round(totales.azul * 1000 / totales.conValor) / 10 : 0,
               totales.vaciasAzul]);

  escribirHoja_diag('DIAG_PROCEDENCIA', salida);

  Logger.log('=== DIAG_PROCEDENCIA ===');
  Logger.log('Columnas manuales: %s', DIAG_COLUMNAS_MANUALES.join(', '));
  for (let i = 1; i < salida.length; i++) {
    Logger.log('  %s: con valor %s | azul (sistema) %s | a mano %s | pisado %s%% | vacías con azul %s',
               salida[i][0], salida[i][1], salida[i][2], salida[i][3], salida[i][4], salida[i][5]);
  }
  Logger.log('El azul marca lo que escribió el sistema en columnas que son del equipo. ' +
             'Es la medida de cuánto pisó el legado la carga manual.');

  return { porColumna: salida.slice(1, -1), total: totales };
}

// ===================== Helpers (sufijo _diag, sin colisiones) =====================

function str_diag(v) {
  return v == null ? '' : String(v).trim();
}

function esVacio_diag(v) {
  return str_diag(v) === '';
}

function num_diag(v) {
  if (v === '' || v == null) return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).trim().replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function normalizeHeader_diag(s) {
  return String(s == null ? '' : s)
    .replace(/["']/g, '').replace(/\n/g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeText_diag(s) {
  return String(s == null ? '' : s)
    .replace(/[ ​‌‍﻿]/g, ' ')
    .replace(/[‒–—−]/g, '-')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Fecha con día primero y explícito. Nunca new Date(string): ese es el bug de Sync B to B2.js
 * que corre de mes las fechas del 1 al 12 (CLAUDE.md 3.1.c).
 * Siempre a las 12:00 locales para esquivar DST.
 */
function toDate_diag(v) {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12, 0, 0);
  }
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return null; // serial de Sheets: getValues() ya devuelve Date

  const s = String(v).trim();

  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/.exec(s);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const mo = parseInt(dmy[2], 10);
    let y = dmy[3] ? parseInt(dmy[3], 10) : new Date().getFullYear();
    if (y < 100) y += 2000;
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return new Date(y, mo - 1, d, 12, 0, 0);
  }

  const ymd = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/.exec(s);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const mo = parseInt(ymd[2], 10);
    const d = parseInt(ymd[3], 10);
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return new Date(y, mo - 1, d, 12, 0, 0);
  }

  return null;
}

/** Clave natural: normalizeText(Figura)|normalizeText(Barrio)|yyyyMMdd(Fecha). */
function claveNatural_diag(figura, barrio, fecha) {
  const f = normalizeText_diag(figura);
  const b = normalizeText_diag(barrio);
  const d = fecha instanceof Date ? fecha : toDate_diag(fecha);
  if (!f || !b || !d) return '';
  return f + '|' + b + '|' + Utilities.formatDate(d, DIAG_TZ, 'yyyyMMdd');
}

function findIdx_diag(headers, candidatos, opcional) {
  const norm = headers.map(normalizeHeader_diag);
  for (let i = 0; i < candidatos.length; i++) {
    const j = norm.indexOf(normalizeHeader_diag(candidatos[i]));
    if (j !== -1) return j;
  }
  if (opcional) return null;
  throw new Error('No se encontró ninguna de estas columnas: ' + candidatos.join(' | ') +
                  '\nDisponibles: ' + norm.filter(String).join(' | '));
}

/** Nombres alternativos con los que puede aparecer cada columna manual. */
function alias_diag(nombre) {
  if (nombre === 'Mail')        return ['mail', 'mailing', 'email'];
  if (nombre === 'Call Center') return ['call center', 'callcenter'];
  if (nombre === 'Difusión')    return ['difusión', 'difusion'];
  if (nombre === 'Inscriptos')  return ['inscriptos', 'inscritos'];
  return [nombre];
}

/** Mismo criterio de "procesado" que usa el upsert legado. */
function esProcesado_diag(v) {
  return v === true || String(v).toLowerCase() === 'true' || String(v).trim() === '1';
}

/**
 * Valor que B2 traería para una columna de canal, replicando lo que hace hoy
 * upsertBaseFinal_A2_B2: RRSS sale de la columna RRSS si tiene valor, y si no de la suma
 * Facebook + Google + Programmatic.
 */
function valorCanalB2_diag(fila, B, nombre) {
  if (nombre === 'Mail')        return B.Mail != null ? num_diag(fila[B.Mail]) : 0;
  if (nombre === 'Call Center') return B.Call != null ? num_diag(fila[B.Call]) : 0;
  if (nombre === 'IVR')         return B.IVR  != null ? num_diag(fila[B.IVR])  : 0;
  if (nombre === 'Difusión')    return B.Dif  != null ? num_diag(fila[B.Dif])  : 0;
  if (nombre === 'RRSS') {
    if (B.RRSS != null && !esVacio_diag(fila[B.RRSS])) return num_diag(fila[B.RRSS]);
    return num_diag(B.FB != null ? fila[B.FB] : 0) +
           num_diag(B.GG != null ? fila[B.GG] : 0) +
           num_diag(B.PR != null ? fila[B.PR] : 0);
  }
  return 0;
}

/**
 * Crea o reescribe una solapa de diagnóstico en la planilla intermedia. Sólo acepta nombres
 * DIAG_*, para que un error de configuración no pueda limpiar una solapa de datos.
 * Usa clearContents(), nunca clear(): ninguna operación de este archivo altera un fondo
 * (CLAUDE.md, Convenciones — el color es información).
 */
function escribirHoja_diag(nombre, matriz) {
  if (nombre.indexOf('DIAG_') !== 0) {
    throw new Error('escribirHoja_diag sólo escribe solapas DIAG_*. Recibió: ' + nombre);
  }
  const ss = SpreadsheetApp.openById(DIAG_ID_SALIDA);
  let sh = ss.getSheetByName(nombre);
  if (!sh) sh = ss.insertSheet(nombre);
  else sh.clearContents();

  sh.getRange(1, 1, matriz.length, matriz[0].length).setValues(matriz);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, matriz[0].length).setFontWeight('bold');
  Logger.log('[diag] %s: %s filas escritas', nombre, matriz.length - 1);
  return sh;
}
