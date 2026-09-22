/**
 * Fase 1 — Diagnóstico del hueco de sexo/edades.
 *
 * SÓLO LECTURA sobre los datos existentes. Este archivo:
 *   - NO escribe en ninguna columna existente de ninguna planilla;
 *   - NO toca las once columnas con fórmulas de array del destino
 *     (D, W, X, Y, AA–AG). Ver CLAUDE.md 3.1.b: escribir ahí rompe el bloque entero;
 *   - sólo crea/reescribe dos solapas propias, DIAG_HUECO y DIAG_PISADO.
 *
 * Puntos de entrada:
 *   diagFase1()             corre las dos partes leyendo una sola vez.
 *   diagHuecoSexoEdades()   parte 1 → solapa DIAG_HUECO.
 *   diagPisadoCanales()     parte 2 → solapa DIAG_PISADO.
 *
 * Todos los helpers llevan sufijo _diag para no colisionar con las nueve copias de
 * toDate_ / normalizeText_ / etc. que ya viven en el scope global (CLAUDE.md 3.1.c).
 * Este archivo no depende de ninguna función de los otros archivos del proyecto.
 *
 * Criterio de "vacío" (importante para leer el resultado):
 *   - En el DESTINO, vacío es celda en blanco. Un 0 cuenta como dato escrito: el upsert
 *     legado escribe números, así que una celda en blanco significa "nunca se escribió".
 *   - En B2, sexo y edades vienen de num(), que convierte vacío en 0. Por eso acá
 *     "B2 tiene sexo/edades" significa **algún valor distinto de cero**; si viniera 0 el
 *     upsert escribiría 0 en el destino y la celda ya no estaría en blanco.
 */

// ===================== Configuración =====================

const DIAG_ID_DESTINO    = '1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo'; // (1) destino final
const DIAG_ID_INTERMEDIA = '1dNLcBjh1ncEVBeALD-szhIlcRGkfOiMaPJp2tGqrsyM'; // (2) base intermedia

const DIAG_HOJA_DESTINO = 'RVD JM-CM - ES';
const DIAG_HOJA_B2      = 'B2';

const DIAG_SALIDA_HUECO  = 'DIAG_HUECO';
const DIAG_SALIDA_PISADO = 'DIAG_PISADO';

/**
 * Dónde se crean las solapas de salida. Por defecto en la planilla INTERMEDIA, para dejar
 * el destino sin una sola escritura. Cambiar a DIAG_ID_DESTINO si se prefiere tenerlas al
 * lado de los datos que describen.
 */
const DIAG_ID_SALIDA = DIAG_ID_INTERMEDIA;

/** Los seis rangos etarios, tal como se llaman en las dos planillas. */
const DIAG_RANGOS_ETARIOS = ['18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar'];

/**
 * Columnas de canales: las carga el equipo a mano en el destino, pero el upsert legado las
 * escribe sin condición (CLAUDE.md 3.2, "Riesgo adicional").
 * Destino y B2 usan los mismos nombres salvo por el armado de RRSS (ver valorCanalB2_diag).
 */
const DIAG_CANALES = ['Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión'];

const DIAG_TZ = 'America/Argentina/Buenos_Aires';

// ===================== Puntos de entrada =====================

/** Corre las dos partes de la Fase 1 leyendo destino y B2 una sola vez. */
function diagFase1() {
  const ctx = leerContexto_diag();
  const r1 = generarHueco_diag(ctx);
  const r2 = generarPisado_diag(ctx);
  return { hueco: r1, pisado: r2 };
}

/** Parte 1: las filas con Inscriptos pero sin sexo ni edades, cruzadas contra B2. */
function diagHuecoSexoEdades() {
  return generarHueco_diag(leerContexto_diag());
}

/** Parte 2: qué valor de canales pisaría B2 sobre lo que el equipo cargó a mano. */
function diagPisadoCanales() {
  return generarPisado_diag(leerContexto_diag());
}

// ===================== Lectura (una sola vez, en bloque) =====================

/**
 * Lee el destino y B2 completos con getValues() en bloque (nunca getValue() por celda:
 * son ~800 filas de destino y Apps Script corta a los 6 minutos) y devuelve todo lo que
 * necesitan las dos partes.
 */
function leerContexto_diag() {
  const t0 = new Date();

  // ---------- Destino ----------
  const shDest = SpreadsheetApp.openById(DIAG_ID_DESTINO).getSheetByName(DIAG_HOJA_DESTINO);
  if (!shDest) throw new Error('No existe la hoja "' + DIAG_HOJA_DESTINO + '" en la planilla destino.');

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
    canales: DIAG_CANALES.map(function (n) { return findIdx_diag(hdrDest, alias_diag(n)); })
  };

  /*
   * getLastRow() del destino devuelve ~2374 y no ~802: las fórmulas de array llegan hasta
   * ahí y cuentan como celda ocupada aunque devuelvan "". Nos quedamos sólo con las filas
   * que tienen algo en la clave natural o en Inscriptos.
   */
  const filas = [];
  for (let i = 1; i < bloqueDest.length; i++) {
    const r = bloqueDest[i];
    const figura = str_diag(r[D.Figura]);
    const barrio = str_diag(r[D.Barrio]);
    const fecha  = toDate_diag(r[D.Fecha]);
    const hayAlgo = figura !== '' || barrio !== '' || fecha !== null || !esVacio_diag(r[D.Ins]);
    if (!hayAlgo) continue;
    filas.push({
      fila: i + 1,          // fila real en la planilla (1-based, con encabezado)
      valores: r,
      figura: figura,
      barrio: barrio,
      fecha: fecha,
      clave: claveNatural_diag(figura, barrio, fecha)
    });
  }

  // ---------- B2 ----------
  const shB2 = SpreadsheetApp.openById(DIAG_ID_INTERMEDIA).getSheetByName(DIAG_HOJA_B2);
  if (!shB2) throw new Error('No existe la hoja "' + DIAG_HOJA_B2 + '" en la planilla intermedia.');

  const filasB2 = shB2.getLastRow();
  const colsB2  = shB2.getLastColumn();
  if (filasB2 < 2) throw new Error('La hoja "' + DIAG_HOJA_B2 + '" no tiene datos.');

  const bloqueB2 = shB2.getRange(1, 1, filasB2, colsB2).getValues();
  const hdrB2 = bloqueB2[0];

  const B = {
    Persona: findIdx_diag(hdrB2, ['persona', 'figura', 'nombre']),
    BarrioN: findIdx_diag(hdrB2, ['barrion']),
    Fecha:   findIdx_diag(hdrB2, ['fecha']),
    Masc:    findIdx_diag(hdrB2, ['masculino', 'masculinos'], true),
    Fem:     findIdx_diag(hdrB2, ['femenino', 'femeninos'], true),
    edades:  DIAG_RANGOS_ETARIOS.map(function (n) { return findIdx_diag(hdrB2, [n], true); }),
    Mail:    findIdx_diag(hdrB2, ['mail', 'mailing', 'email'], true),
    Call:    findIdx_diag(hdrB2, ['call center', 'callcenter'], true),
    IVR:     findIdx_diag(hdrB2, ['ivr'], true),
    RRSS:    findIdx_diag(hdrB2, ['rrss'], true),
    FB:      findIdx_diag(hdrB2, ['facebook'], true),
    GG:      findIdx_diag(hdrB2, ['google'], true),
    PR:      findIdx_diag(hdrB2, ['programmatic'], true),
    Dif:     findIdx_diag(hdrB2, ['difusión', 'difusion'], true),
    Proc:    findIdx_diag(hdrB2, ['procesado bf', 'procesado', 'procesado base final'], true)
  };

  // Índice clave natural → registro. Si una clave se repite en B2 nos quedamos con la fila
  // que tiene datos (es la que decidiría el resultado) y contamos el duplicado aparte.
  const porClave = new Map();
  let clavesIncompletasB2 = 0;
  let clavesDuplicadasB2 = 0;

  for (let i = 1; i < bloqueB2.length; i++) {
    const r = bloqueB2[i];
    const persona = str_diag(r[B.Persona]);
    const barrioN = str_diag(r[B.BarrioN]);
    const fecha   = toDate_diag(r[B.Fecha]);
    if (persona === '' && barrioN === '' && fecha === null) continue; // fila vacía

    const clave = claveNatural_diag(persona, barrioN, fecha);
    if (!clave) { clavesIncompletasB2++; continue; }

    const masc = B.Masc != null ? num_diag(r[B.Masc]) : 0;
    const fem  = B.Fem  != null ? num_diag(r[B.Fem])  : 0;
    const edades = B.edades.map(function (idx) { return idx != null ? num_diag(r[idx]) : 0; });
    const sumaEdades = edades.reduce(function (a, b) { return a + b; }, 0);

    const reg = {
      fila: i + 1,
      tieneSexo: (masc > 0 || fem > 0),
      tieneEdades: (sumaEdades > 0),
      procesado: esProcesado_diag(B.Proc != null ? r[B.Proc] : ''),
      canales: DIAG_CANALES.map(function (nombre) { return valorCanalB2_diag(r, B, nombre); })
    };

    const previo = porClave.get(clave);
    if (!previo) {
      porClave.set(clave, reg);
    } else {
      clavesDuplicadasB2++;
      const previoTieneDatos = previo.tieneSexo || previo.tieneEdades;
      const nuevoTieneDatos  = reg.tieneSexo || reg.tieneEdades;
      if (!previoTieneDatos && nuevoTieneDatos) porClave.set(clave, reg);
    }
  }

  Logger.log('[diag] lectura: destino %s filas con datos (getLastRow=%s), B2 %s claves únicas, ' +
             '%s duplicadas, %s con clave incompleta | %s ms',
             filas.length, filasDest, porClave.size, clavesDuplicadasB2, clavesIncompletasB2,
             new Date() - t0);

  return {
    D: D,
    B: B,
    filas: filas,
    porClave: porClave,
    filasDestCrudas: filasDest,
    colsDest: colsDest,
    colsB2: colsB2,
    clavesDuplicadasB2: clavesDuplicadasB2,
    clavesIncompletasB2: clavesIncompletasB2
  };
}

// ===================== Parte 1: DIAG_HUECO =====================

function generarHueco_diag(ctx) {
  const D = ctx.D;

  const salida = [[
    'Figura', 'Barrio', 'Fecha', 'clave_calculada', 'existe_en_B2',
    'B2_tiene_sexo', 'B2_tiene_edades', 'B2_Procesado_BF', 'diagnostico'
  ]];

  const conteo = {
    no_existe_en_B2: 0,
    B2_vacio_tambien: 0,
    B2_tiene_datos_flag_TRUE: 0,
    B2_tiene_datos_flag_FALSE: 0,
    clave_incompleta: 0
  };

  // Contadores de contexto, para poder reconciliar contra la tabla de CLAUDE.md 3.2.
  let conInscriptos = 0, sinInscriptos = 0;
  let sexoYEdadesVacias = 0, soloSexoVacio = 0, soloEdadesVacias = 0;

  for (let i = 0; i < ctx.filas.length; i++) {
    const f = ctx.filas[i];
    const r = f.valores;

    if (esVacio_diag(r[D.Ins])) { sinInscriptos++; continue; }
    conInscriptos++;

    const sexoVacio = esVacio_diag(r[D.Masc]) && esVacio_diag(r[D.Fem]);
    const edadesVacias = D.edades.every(function (idx) { return esVacio_diag(r[idx]); });

    if (sexoVacio && edadesVacias) sexoYEdadesVacias++;
    else if (sexoVacio) soloSexoVacio++;
    else if (edadesVacias) soloEdadesVacias++;

    if (!(sexoVacio && edadesVacias)) continue; // el hueco es sexo Y edades vacíos a la vez

    const reg = f.clave ? ctx.porClave.get(f.clave) : null;

    let diagnostico;
    if (!f.clave)                                diagnostico = 'clave_incompleta';
    else if (!reg)                               diagnostico = 'no_existe_en_B2';
    else if (!reg.tieneSexo && !reg.tieneEdades) diagnostico = 'B2_vacio_tambien';
    else if (reg.procesado)                      diagnostico = 'B2_tiene_datos_flag_TRUE';
    else                                         diagnostico = 'B2_tiene_datos_flag_FALSE';

    conteo[diagnostico]++;

    salida.push([
      f.figura,
      f.barrio,
      f.fecha ? Utilities.formatDate(f.fecha, DIAG_TZ, 'dd/MM/yyyy') : '',
      f.clave || '',
      reg ? 'TRUE' : 'FALSE',
      reg ? (reg.tieneSexo   ? 'TRUE' : 'FALSE') : '',
      reg ? (reg.tieneEdades ? 'TRUE' : 'FALSE') : '',
      reg ? (reg.procesado   ? 'TRUE' : 'FALSE') : '',
      diagnostico
    ]);
  }

  escribirHoja_diag(DIAG_SALIDA_HUECO, salida);

  const total = salida.length - 1;
  Logger.log('=== DIAG_HUECO ===');
  Logger.log('Filas con datos en el destino: %s', ctx.filas.length);
  Logger.log('  con Inscriptos cargado: %s | sin Inscriptos: %s', conInscriptos, sinInscriptos);
  Logger.log('  sexo Y edades vacíos (el hueco): %s', sexoYEdadesVacias);
  Logger.log('  sólo sexo vacío: %s | sólo edades vacías: %s', soloSexoVacio, soloEdadesVacias);
  Logger.log('Filas analizadas: %s', total);
  Logger.log('--- conteo por diagnostico ---');
  Object.keys(conteo).forEach(function (k) {
    const n = conteo[k];
    const pct = total ? Math.round(n * 1000 / total) / 10 : 0;
    Logger.log('  %s: %s  (%s%%)', k, n, pct);
  });
  if (ctx.clavesDuplicadasB2) {
    Logger.log('Aviso: %s filas de B2 comparten clave natural con otra. Se usó la que tiene datos.',
               ctx.clavesDuplicadasB2);
  }

  return { total: total, conteo: conteo, conInscriptos: conInscriptos, sinInscriptos: sinInscriptos };
}

// ===================== Parte 2: DIAG_PISADO =====================

function generarPisado_diag(ctx) {
  const D = ctx.D;

  const salida = [['Figura', 'Barrio', 'Fecha', 'columna', 'valor_destino', 'valor_B2', 'coincide']];

  const res = {
    filasComparadas: 0,
    filasSinMatch: 0,
    celdasComparadas: 0,
    coinciden: 0,
    difieren: 0,
    difierenB2EnCero: 0,      // el destino tiene un valor > 0 y B2 traería 0  ← el caso que importa
    difierenDestinoVacio: 0,  // el destino está en blanco y B2 traería algo
    difierenEnB2Procesado: 0, // diferencias en filas que hoy el upsert saltea por el flag
    filasAfectadas: 0,
    porColumna: {}
  };
  DIAG_CANALES.forEach(function (c) { res.porColumna[c] = { coinciden: 0, difieren: 0, b2EnCero: 0 }; });

  for (let i = 0; i < ctx.filas.length; i++) {
    const f = ctx.filas[i];
    const r = f.valores;
    const reg = f.clave ? ctx.porClave.get(f.clave) : null;

    res.filasComparadas++;
    if (!reg) res.filasSinMatch++;

    const fechaTxt = f.fecha ? Utilities.formatDate(f.fecha, DIAG_TZ, 'dd/MM/yyyy') : '';
    let filaAfectada = false;

    for (let c = 0; c < DIAG_CANALES.length; c++) {
      const nombre = DIAG_CANALES[c];
      const valorDestino = r[D.canales[c]];

      // Sin fila en B2 el upsert no escribe nada: se deja constancia y no se compara.
      if (!reg) {
        salida.push([f.figura, f.barrio, fechaTxt, nombre, valorDestino, '',
                     f.clave ? 'sin_match_en_B2' : 'clave_incompleta']);
        continue;
      }

      const valorB2 = reg.canales[c];
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
        if (reg.procesado) res.difierenEnB2Procesado++;
      }

      salida.push([f.figura, f.barrio, fechaTxt, nombre, valorDestino, valorB2,
                   coincide ? 'TRUE' : 'FALSE']);
    }

    if (filaAfectada) res.filasAfectadas++;
  }

  escribirHoja_diag(DIAG_SALIDA_PISADO, salida);

  Logger.log('=== DIAG_PISADO ===');
  Logger.log('Filas del destino recorridas: %s (sin match en B2: %s)',
             res.filasComparadas, res.filasSinMatch);
  Logger.log('Celdas comparadas: %s | coinciden: %s | difieren: %s',
             res.celdasComparadas, res.coinciden, res.difieren);
  Logger.log('  de las que difieren, B2 pisaría con CERO un valor cargado: %s', res.difierenB2EnCero);
  Logger.log('  de las que difieren, el destino está vacío y B2 traería algo: %s', res.difierenDestinoVacio);
  Logger.log('  de las que difieren, la fila de B2 tiene Procesado BF = TRUE ' +
             '(hoy el upsert la saltea, pero el flag se limpia solo al reprocesar): %s',
             res.difierenEnB2Procesado);
  Logger.log('Filas del destino con al menos un canal que B2 cambiaría: %s', res.filasAfectadas);
  Logger.log('--- por columna ---');
  DIAG_CANALES.forEach(function (c) {
    const p = res.porColumna[c];
    Logger.log('  %s: coinciden %s | difieren %s | de esas, B2 en cero %s',
               c, p.coinciden, p.difieren, p.b2EnCero);
  });

  return res;
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
 * Fecha con día primero y explícito. Nunca new Date(string): ese es justo el bug de
 * Sync B to B2.js que corre de mes las fechas del 1 al 12 (CLAUDE.md 3.1.c).
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

/** Nombres alternativos con los que puede aparecer una columna de canal. */
function alias_diag(nombre) {
  if (nombre === 'Mail')        return ['mail', 'mailing', 'email'];
  if (nombre === 'Call Center') return ['call center', 'callcenter'];
  if (nombre === 'Difusión')    return ['difusión', 'difusion'];
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
 * Crea o reescribe una solapa de diagnóstico. Sólo acepta nombres que empiecen con DIAG_,
 * para que un error de configuración no pueda limpiar una solapa de datos.
 */
function escribirHoja_diag(nombre, matriz) {
  if (nombre.indexOf('DIAG_') !== 0) {
    throw new Error('escribirHoja_diag sólo escribe solapas DIAG_*. Recibió: ' + nombre);
  }
  const ss = SpreadsheetApp.openById(DIAG_ID_SALIDA);
  let sh = ss.getSheetByName(nombre);
  if (!sh) sh = ss.insertSheet(nombre);
  else sh.clear();

  sh.getRange(1, 1, matriz.length, matriz[0].length).setValues(matriz);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, matriz[0].length).setFontWeight('bold');
  Logger.log('[diag] %s: %s filas escritas', nombre, matriz.length - 1);
  return sh;
}
