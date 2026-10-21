/**
 * 46_Guardian.js — EL GUARDIÁN DE LAS COLUMNAS DEL SISTEMA (09/10; REDISEÑADO el 20/10, prompt 10, punto 1; CLAUDE.md, sección 0,
 * "La cuarta excepción"). Configuración: 00_Config.js, "El guardián". Estado: docs/ESTADO.md, "20/10 — prompt 10, punto 1: el
 * guardián". APAGADO: GUARDIAN_ACTIVO = false. Cuando se prenda, primero GUARDIAN_MODO = 'avisar' (unos días), después 'restaurar'.
 *
 * LAS TRES CLASES de columnas de la base, por ENCABEZADO (nunca por posición; 00_Config.js):
 *   A  del sistema, puras: GUARDIAN_CLASE_A (traza, agenda, columnas del mail, IDs) y las derivadas (GUARDIAN_CLASE_A_DERIVADAS).
 *      Protegidas con advertencia y con el encabezado gris; las técnicas (GUARDIAN_OCULTAR), ocultas. El guardián compara las de
 *      GUARDIAN_CLASE_A contra su copia; las derivadas no (las recalcula cada corrida: ése es su "restaurar").
 *   B  datos que escribe el sistema y el equipo puede corregir (GUARDIAN_CLASE_B): el guardián no las restaura nunca. La corrección
 *      del equipo vale (la agenda la anota en "Tocado por el equipo", como siempre).
 *   C  del equipo (GUARDIAN_CLASE_C): ni el guardián ni el sistema las tocan.
 *
 * EN LA CORRIDA DE LA HORA, PRIMERO (antes del orden de la base, de la agenda y de todo; 20_UpsertDestino.js):
 *   - DESALINEACIÓN —alguien ordenó o pegó corrido sólo algunas columnas: las columnas A de una reunión quedaron en la fila de otra—:
 *     el guardián NO la arregla moviendo datos (hasta el 20/10 las "reubicaba": ya no). Esa corrida NO ESCRIBE NADA EN LA BASE
 *     (tampoco la ordena: todo sigue en seco) y avisa con las filas y las columnas que no cierran: por mail (registrarAviso_, tema
 *     'guardian_desalineacion'), en AGENDA_PENDIENTES (intermedia) y en REGISTRO_PROTECCION. La corrida siguiente vuelve a mirar.
 *   - un CAMBIO en una columna A (sin desalineación): con GUARDIAN_MODO = 'avisar', se avisa (tema 'guardian_cambios',
 *     AGENDA_PENDIENTES, REGISTRO_PROTECCION) y NO se toca; con 'restaurar', vuelve a lo de la copia (la cuarta excepción,
 *     `escribirGuardianLote_`, 05_Escritura.js: sólo columnas A guardadas, lectura fresca) y también se avisa.
 *   - una fila que el equipo BORRÓ se respeta (la copia la da de baja); una fila a la que el equipo le cambió Figura o FECHA (B)
 *     sigue siendo la misma reunión (la clave manda).
 *
 * LA COPIA (SISTEMA_COPIA, intermedia), DESPUÉS DE TODA ESCRITURA DEL SISTEMA: al final de la corrida de la hora y al final de cada
 * paso a mano que escribe la base (`guardianCopiaTrasEscritura_`: la agenda a mano, deshacer, la fusión, la corrección c02, el orden,
 * los IDs del paso 57…). Por CLAVE (agenda_uid o RDV_UID) y HUELLA (figura + fecha; con barrio | hora | evento para desempatar), nunca
 * por número de fila; y sólo si la base no quedó desalineada (un orden parcial hecho mientras corría no queda grabado). Si un paso a mano
 * escribió y no la tomó, la red: cada escritura del sistema deja su sello (`_selloEscrituraSistema_`, sólo con el guardián prendido) y
 * con la copia VIEJA (o la del paso 112, sin hora, o de más de GUARDIAN_COPIA_MAX_MS) el guardián NO compara celdas —no sabría quién
 * cambió qué— pero SÍ busca la desalineación (y si la hay, frena).
 *
 * Cómo encuentra la fila de cada entrada de la copia (revisado el 09/10 por el revisor del punto 3c; sin cambios el 20/10, salvo que
 * lo que antes "reubicaba" ahora es la desalineación que frena):
 *   A.  la clave está en una fila con la misma huella → en su lugar;
 *   A2. la misma huella y los mismos valores en una sola fila libre → en su lugar;
 *   A3. la clave en una sola fila libre con el mismo desempate y una huella que no reclama ninguna otra entrada → el equipo cambió
 *       figura o fecha (reprogramación, un intercambio de fechas): la clave manda;
 *   B.  sin clave: la misma fila de la copia, con la misma huella → en su lugar;
 *   C.  la huella en UNA sola fila libre, con el mismo desempate (o los mismos valores). Si esa fila tiene las columnas A de OTRA
 *       reunión (su clave, o los valores de otra entrada) → DESALINEADA; si no (la misma fila, movida entera) → en su lugar. Con
 *       otro desempate, en varias filas, o dos entradas para la misma fila → AMBIGUA (también desalineación: frena);
 *   D.  la huella ya no está: la clave en una sola fila libre, los mismos valores, o una sola fila de huella nueva con el mismo
 *       desempate → ahí; si no, borrada (o no localizada).
 * Una fila libre (que no es de ninguna entrada) con algo en las columnas A: una fila copiada y pegada con su RDV_UID, o algo tipeado
 * en una fila nueva. Se avisa; con 'restaurar', se limpia.
 *
 * Los pasos (99_Correr.js): 111 en seco (las clases A/B/C de la base real, y qué avisaría), 112 la copia nueva, 113 / 114 ocultar y
 * proteger (en seco / real, con la huella del 113), 115 deshacerlo.
 */

// ===================== Las columnas y sus clases =====================

/** El modo: 'avisar' (detecta y reporta, no restaura) o 'restaurar'. Cualquier otro valor cuenta como 'avisar'. */
function modoGuardian_() {
  return typeof GUARDIAN_MODO !== 'undefined' && GUARDIAN_MODO === 'restaurar' ? 'restaurar' : 'avisar';
}

/** Los nombres (con sus alias) de una columna A guardada: los IDs se reconocen también por sus alias (IDS_ALIAS_COLUMNAS). */
function _aliasGuardian_(nombre) {
  return (typeof IDS_ALIAS_COLUMNAS !== 'undefined' && IDS_ALIAS_COLUMNAS[nombre]) || [nombre];
}

/**
 * Las columnas del sistema de la base, por encabezado: `guardadas` (GUARDIAN_CLASE_A: se copian y se comparan) y `derivadas`
 * (sólo se protegen: se recalculan cada hora; las de `columnasDerivadas_()`, que con LOOKER_EN_SISTEMA es GUARDIAN_CLASE_A_DERIVADAS).
 * `[{ canon, nombre, col (0-based) }]`.
 */
function columnasGuardian_(hdr) {
  const out = { guardadas: [], derivadas: [] };
  const vistas = {};
  const add = function (lista, canon, c) {
    if (c == null || vistas[c]) return;
    vistas[c] = true;
    lista.push({ canon: canon, nombre: str(hdr[c]), col: c });
  };
  GUARDIAN_CLASE_A.forEach(function (n) { add(out.guardadas, n, findIdxOr_(hdr, _aliasGuardian_(n), true)); });
  columnasDerivadas_().forEach(function (n) { add(out.derivadas, n, findIdxOr_(hdr, [n], true)); });
  return out;
}

/** ¿El encabezado es de una columna guardada (clase A, no derivada)? La escritura del guardián se niega a cualquier otra. */
function esColumnaGuardada_(nombre) {
  const n = normalizeHeader_(nombre);
  if (!n) return false;
  return GUARDIAN_CLASE_A.some(function (c) { return _aliasGuardian_(c).some(function (a) { return normalizeHeader_(a) === n; }); });
}

/**
 * La clase de cada columna de la base (por encabezado): `{ columnas: [{ col (1-based), letra, nombre, clase ('A' | 'A derivada' |
 * 'B' | 'C' | ''), tecnica }], sinClase: [nombres], faltan: { A, B, C } }` (`faltan`: los nombres de la lista que la base no tiene).
 * Sólo lee el encabezado.
 */
function clasesColumnasGuardian_(hdr) {
  const norm = function (s) { return normalizeHeader_(s); };
  const lista = function (nombres, alias) {
    const m = {};
    nombres.forEach(function (n) { (alias ? alias(n) : [n]).forEach(function (a) { m[norm(a)] = n; }); });
    return m;
  };
  const A = lista(GUARDIAN_CLASE_A, _aliasGuardian_), AD = lista(GUARDIAN_CLASE_A_DERIVADAS), B = lista(GUARDIAN_CLASE_B), C = lista(GUARDIAN_CLASE_C);
  const tec = lista(GUARDIAN_OCULTAR);
  const out = { columnas: [], sinClase: [], faltan: { A: [], B: [], C: [] } };
  const vistos = {};
  hdr.forEach(function (h, i) {
    const n = norm(h);
    if (!n) return;
    const clase = A[n] ? 'A' : AD[n] ? 'A derivada' : B[n] ? 'B' : C[n] ? 'C' : '';
    const canon = A[n] || AD[n] || B[n] || C[n] || '';
    if (canon) vistos[canon] = true;
    out.columnas.push({ col: i + 1, letra: _a1_(1, i + 1).replace(/\d+$/, ''), nombre: str(h), clase: clase, tecnica: !!tec[n] });
    if (!clase) out.sinClase.push(str(h));
  });
  GUARDIAN_CLASE_A.concat(GUARDIAN_CLASE_A_DERIVADAS).forEach(function (n) { if (!vistos[n]) out.faltan.A.push(n); });
  GUARDIAN_CLASE_B.forEach(function (n) { if (!vistos[n]) out.faltan.B.push(n); });
  GUARDIAN_CLASE_C.forEach(function (n) { if (!vistos[n]) out.faltan.C.push(n); });
  return out;
}

/** El log de las clases (paso 111): una línea por clase con sus columnas (letra y nombre), las técnicas y las que no tienen clase. */
function logClasesGuardian_(cl) {
  const de = function (k) { return cl.columnas.filter(function (c) { return c.clase === k; }); };
  const txt = function (l) { return l.map(function (c) { return c.letra + ' ' + c.nombre + (c.tecnica ? ' (oculta)' : ''); }).join(' | ') || '—'; };
  Logger.log('  A. DEL SISTEMA, PURAS (%s): protegidas con advertencia, encabezado gris; el guardián las compara con su copia: %s', de('A').length, txt(de('A')));
  Logger.log('  A. DERIVADAS (%s): protegidas con advertencia, encabezado gris; las recalcula cada corrida (el guardián no las compara): %s',
             de('A derivada').length, txt(de('A derivada')));
  Logger.log('  B. DATOS QUE ESCRIBE EL SISTEMA Y EL EQUIPO PUEDE CORREGIR (%s): el guardián NO las restaura: %s', de('B').length, txt(de('B')));
  Logger.log('  C. DEL EQUIPO (%s): nadie del sistema las toca: %s', de('C').length, txt(de('C')));
  Logger.log('  SIN CLASE (%s)%s', cl.sinClase.length, cl.sinClase.length ? ': ' + cl.sinClase.join(' | ') + '  ← DECIDIR: a qué lista de 00_Config.js va cada una (sin clase, el guardián no las mira)' : '');
  ['A', 'B', 'C'].forEach(function (k) {
    if (cl.faltan[k].length) Logger.log('  de la clase %s, la base no tiene: %s', k, cl.faltan[k].join(' | '));
  });
}

// ===================== Los valores =====================

/** Un valor para comparar: una fecha por su instante; vacío es ''; lo demás, como texto recortado ("3" = 3). */
function _normGuardian_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : 'd' + v.getTime();
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** Para guardar en la copia (JSON): una fecha como `{ d: ms }`; lo demás, tal cual. */
function _serGuardian_(v) { return v instanceof Date ? { d: v.getTime() } : v; }
function _desGuardian_(x) { return x && typeof x === 'object' && 'd' in x ? new Date(x.d) : x; }

/** El valor que se escribe al restaurar: un texto que Sheets leería como número o fecha va con apóstrofo (queda texto). */
function _valorCeldaGuardian_(v) {
  if (typeof v === 'string' && v && /^[\d\s.,:\/+-]+$/.test(v)) return "'" + v;
  return v === undefined || v === null ? '' : v;
}

function _mismosValoresGuardian_(a, b, cols) {
  return cols.every(function (c) { return _normGuardian_(a[c.canon]) === _normGuardian_(b[c.canon]); });
}

/** Una huella corta de un texto (para el seco de ocultar / proteger; sin Utilities: los tests no lo tienen). */
function _huellaGuardian_(s) {
  let h1 = 5381, h2 = 52711;
  const t = String(s);
  for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); h1 = ((h1 << 5) + h1) ^ c; h2 = ((h2 << 5) + h2) ^ c; }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + '-' + t.length;
}

// ===================== Leer la base y la copia =====================

/** La solapa destino (por nombre) y su encabezado, la verificación de siempre. */
function hojaDestinoGuardian_() {
  return verificarHojaDestino_(ssDestino_());
}

/**
 * El estado de la base para el guardián: `{ hdr, cols, filas: [{ fila, clave, huella, valores: { canon: valor } }] }`, una
 * entrada por fila de datos (2..última). `bloque`: la base ya leída (getValues entero), o se lee.
 */
function leerEstadoGuardian_(sh, bloque) {
  const b = bloque || (sh.getLastRow() >= 1 ? sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues() : [[]]);
  const hdr = b[0];
  const cols = columnasGuardian_(hdr);
  const iFig = findIdxOr_(hdr, aliasColumna_('Figura'), true), iFecha = findIdxOr_(hdr, aliasColumna_('FECHA'), true);
  const iUid = findIdxOr_(hdr, ['RDV_UID'], true), iAuid = findIdxOr_(hdr, ['agenda_uid'], true);
  // el desempate, sólo cuando la huella está en más de una fila (los pares figura + fecha repetidos): barrio, hora y evento
  const iBar = findIdxOr_(hdr, aliasColumna_('Barrio'), true), iHora = findIdxOr_(hdr, aliasColumna_('HORA'), true);
  const iEv = findIdxOr_(hdr, ['EVENTO'], true);
  const filas = [];
  for (let i = 1; i < b.length; i++) {
    const v = b[i];
    const auid = iAuid != null ? str(v[iAuid]) : '', uid = iUid != null ? str(v[iUid]) : '';
    const fig = iFig != null ? normalizeText_(v[iFig]) : '';
    const d = iFecha != null ? toDate_(v[iFecha]) : null;
    const valores = {};
    cols.guardadas.forEach(function (c) { if (!esVacio_(v[c.col])) valores[c.canon] = v[c.col]; });
    const hora = iHora != null ? _horaEnMinutos_(v[iHora]) : null;
    filas.push({ fila: i + 1, clave: auid ? 'a:' + auid : (uid ? 'u:' + uid : ''),
                 huella: fig || d ? fig + '|' + (d ? ymd_(d) : '') : '', valores: valores,
                 desempate: [iBar != null ? normalizeText_(v[iBar]) : '', hora == null ? '' : hora, iEv != null ? normalizeText_(v[iEv]) : ''].join('|') });
  }
  return { hdr: hdr, cols: cols, filas: filas };
}

/** Las entradas de una copia tomada EN MEMORIA de un estado (la que tomaría `tomarCopiaSistema_`). */
function entradasDeEstadoGuardian_(estado) {
  return estado.filas.filter(function (f) { return f.huella || f.clave || Object.keys(f.valores).length; }).map(function (f) {
    return { clave: f.clave, huella: f.huella, fila: f.fila, valores: f.valores, desempate: f.desempate };
  });
}

/**
 * ¿La copia sirve para comparar celdas? Tiene hora (la del paso 112 no: la toma fresca la primera corrida prendida), no es más vieja
 * que GUARDIAN_COPIA_MAX_MS (con el guardián apagado un rato, las corridas escribieron sin sello) y el sistema no escribió
 * después. `{ ok, porque }`.
 */
function copiaFrescaGuardian_(copia) {
  const tEsc = Number(PropertiesService.getScriptProperties().getProperty(PROP_GUARDIAN_ESCRITURA) || 0);
  if (!copia.hora) return { ok: false, porque: 'es la del paso 112, o no tiene hora' };
  if (Date.now() - copia.hora > GUARDIAN_COPIA_MAX_MS) return { ok: false, porque: 'tiene más de ' + Math.round(GUARDIAN_COPIA_MAX_MS / 60000) + ' minutos' };
  if (tEsc > copia.hora) return { ok: false, porque: 'el sistema escribió en la base después de tomarla (un paso a mano que no la volvió a tomar)' };
  return { ok: true, porque: '' };
}

/**
 * Toma la copia, SÓLO si la base no está desalineada respecto de la copia anterior (un orden parcial hecho mientras corría no
 * queda grabado: la corrida siguiente lo ve y frena). Devuelve las filas copiadas, o null.
 */
function tomarCopiaSiAlineada_() {
  const sh = hojaDestinoGuardian_(), estado = leerEstadoGuardian_(sh), anterior = leerCopiaSistema_();
  if (anterior) {
    const p = planGuardian_(anterior.entradas, estado);
    if (desalineacionGuardian_(p)) {
      Logger.log('>>> ### EL GUARDIÁN NO TOMA LA COPIA: la base está desalineada respecto de la anterior (%s filas, ambiguas %s). ' +
                 'La corrida siguiente lo ve, no escribe nada y avisa. ###', p.reubicadas.length, p.ambiguas.length);
      return null;
    }
  }
  return tomarCopiaSistema_(estado);
}

/**
 * **La copia después de una escritura del sistema hecha A MANO** (20/10): la llaman los pasos que escriben la base fuera de la
 * corrida de la hora (la agenda a mano, deshacer, la fusión, la corrección c02 y su deshacer, el orden y su deshacer, los IDs, la
 * suspensión del paso 92, las derivadas de los pasos 26 / 27). Con el guardián apagado no hace nada (ni lee). Nunca tira: si no
 * puede, el sello deja la copia vieja y la corrida siguiente no compara celdas (sólo mira la desalineación).
 */
function guardianCopiaTrasEscritura_(quien) {
  if (typeof GUARDIAN_ACTIVO === 'undefined' || !GUARDIAN_ACTIVO) return null;
  try {
    const n = tomarCopiaSiAlineada_();
    Logger.log('[guardián] después de %s: %s', quien || 'una escritura a mano',
               n == null ? 'la copia NO se tomó (la base está desalineada): la corrida siguiente avisa' : 'copia tomada (' + n + ' filas)');
    return n;
  } catch (err) {
    Logger.log('>>> el guardián no pudo tomar la copia después de %s: %s (la corrida siguiente no compara celdas; sólo mira la desalineación).', quien || 'una escritura a mano', err);
    return null;
  }
}

/** La copia (SISTEMA_COPIA) o null si no hay: `{ hora, entradas: [{ clave, huella, fila, valores }] }`. */
function leerCopiaSistema_() {
  const sh = ssIntermedia_().getSheetByName(RDV_HOJA_SISTEMA_COPIA);
  if (!sh || sh.getLastRow() < 1) return null;
  const vals = sh.getRange(1, 1, sh.getLastRow(), Math.max(4, Math.min(5, sh.getLastColumn()))).getValues();
  const entradas = [];
  for (let i = 1; i < vals.length; i++) {
    const r = vals[i];
    let crudo = {};
    try { crudo = JSON.parse(str(r[3]) || '{}'); } catch (err) { crudo = {}; }
    const valores = {};
    Object.keys(crudo).forEach(function (k) { valores[k] = _desGuardian_(crudo[k]); });
    entradas.push({ clave: str(r[0]), huella: str(r[1]), fila: Number(r[2]) || 0, valores: valores, desempate: str(r[4]) });
  }
  const hora = Number(PropertiesService.getScriptProperties().getProperty(PROP_GUARDIAN_COPIA) || 0);
  return { hora: hora, entradas: entradas };
}

/** Toma la copia de las columnas guardadas (todas las filas de datos), en SISTEMA_COPIA, y anota la hora. */
function tomarCopiaSistema_(estado) {
  const e = estado || leerEstadoGuardian_(hojaDestinoGuardian_());
  const filas = entradasDeEstadoGuardian_(e).map(function (f) {
    const ser = {};
    Object.keys(f.valores).forEach(function (k) { ser[k] = _serGuardian_(f.valores[k]); });
    return [f.clave, f.huella, f.fila, JSON.stringify(ser), f.desempate];
  });
  escribirReporte_(RDV_HOJA_SISTEMA_COPIA, ['clave (agenda_uid o RDV_UID)', 'huella (figura | fecha)', 'fila',
                                            'valores de las columnas del sistema (JSON)', 'desempate (barrio | hora | evento)'], filas);
  PropertiesService.getScriptProperties().setProperty(PROP_GUARDIAN_COPIA, String(Date.now()));
  Logger.log('[guardián] copia de las columnas del sistema: %s filas, %s columnas (%s).', filas.length, e.cols.guardadas.length,
             RDV_HOJA_SISTEMA_COPIA);
  return filas.length;
}

// ===================== El plan (sin Sheets: lo prueban los tests) =====================

/**
 * Qué cambió en las columnas guardadas respecto de la copia. Puro.
 * Devuelve `{ cambios: [{ fila, canon, col, puesto, valor, tipo, entrada }], reubicadas: [{ fila, desde, clave, huella, celdas,
 * columnas }], huellaCambiada, ambiguas: [{ entrada, filas, motivo }], noLocalizadas, borradas, frenar, filasTocadas }`.
 * tipo: 'restaurada' (la fila de la reunión, con algo distinto de la copia), 'reubicada' (la fila tiene las columnas del sistema de
 * OTRA reunión: desalineación), 'limpiada' (una fila que no es de ninguna entrada, con algo en esas columnas).
 * `reubicadas` y `ambiguas` (y `frenar`) son la DESALINEACIÓN (`desalineacionGuardian_`): el guardián no escribe nada.
 */
function planGuardian_(entradas, estado) {
  const filas = estado.filas, cols = estado.cols.guardadas;
  const porFila = {}, porClave = {}, porHuella = {};
  filas.forEach(function (f) {
    porFila[f.fila] = f;
    if (f.clave) (porClave[f.clave] = porClave[f.clave] || []).push(f);
    if (f.huella) (porHuella[f.huella] = porHuella[f.huella] || []).push(f);
  });
  const asignada = {}, destino = new Map();
  const asignar = function (e, f, como) { asignada[f.fila] = e; destino.set(e, { f: f, como: como }); };
  const conValores = function (e) { return Object.keys(e.valores).length > 0; };
  const libres = function (lista) { return (lista || []).filter(function (f) { return !asignada[f.fila]; }); };
  const huellasCopia = {}; entradas.forEach(function (e) { if (e.huella) huellasCopia[e.huella] = true; });
  // la firma de los valores de una entrada (para saber si los de una fila son los de OTRA reunión)
  const firma = function (valores) {
    return cols.filter(function (c) { return _normGuardian_(valores[c.canon]) !== ''; })
      .map(function (c) { return c.canon + '=' + _normGuardian_(valores[c.canon]); }).join('|');
  };
  const porFirma = {};
  entradas.forEach(function (e) { const s = firma(e.valores); if (s) (porFirma[s] = porFirma[s] || []).push(e); });
  const out = { cambios: [], reubicadas: [], huellaCambiada: [], ambiguas: [], noLocalizadas: [], borradas: [], frenar: false };

  // A: la clave en una fila con la misma huella (con dos —una fila copiada tal cual—, la de la copia o la primera)
  const pendA = [];
  entradas.forEach(function (e) {
    if (e.clave) {
      const k = libres(porClave[e.clave]).filter(function (f) { return f.huella === e.huella; });
      if (k.length === 1) { asignar(e, k[0], 'en_su_lugar'); return; }
      if (k.length > 1) {   // la fila copiada y pegada tal cual: la de la copia, o la del mismo desempate, o la primera
        asignar(e, k.filter(function (f) { return f.fila === e.fila; })[0] || k.filter(function (f) { return f.desempate === e.desempate; })[0] || k[0], 'en_su_lugar');
        return;
      }
    }
    pendA.push(e);
  });
  // A2: con valores, la misma huella y LOS MISMOS VALORES en una sola fila libre → ya está en su lugar
  const pendA2 = [];
  pendA.forEach(function (e) {
    if (conValores(e) && e.huella) {
      const v = libres(porHuella[e.huella]).filter(function (f) { return _mismosValoresGuardian_(f.valores, e.valores, cols); });
      if (v.length === 1) { asignar(e, v[0], 'en_su_lugar'); return; }
    }
    pendA2.push(e);
  });
  // A3: la clave en una sola fila libre con el MISMO desempate y una huella que no reclama ninguna otra entrada pendiente
  // con ese desempate: el equipo cambió figura o fecha (reprogramación, intercambio de fechas) → la clave manda
  const reclamadas = {};
  pendA2.forEach(function (e) { if (e.huella) reclamadas[e.huella + '#' + e.desempate] = true; });
  const pendA3 = [];
  pendA2.forEach(function (e) {
    if (e.clave) {
      const k = libres(porClave[e.clave]);
      if (k.length === 1 && k[0].huella !== e.huella && k[0].desempate === e.desempate && !reclamadas[k[0].huella + '#' + k[0].desempate]) {
        asignar(e, k[0], 'huella_cambiada'); out.huellaCambiada.push({ fila: k[0].fila, antes: e.huella, ahora: k[0].huella }); return;
      }
    }
    pendA3.push(e);
  });
  // B: sin clave, la misma fila con la misma huella
  const pendB = [];
  pendA3.forEach(function (e) {
    const f = porFila[e.fila];
    if (!e.clave && e.huella && f && f.huella === e.huella && !asignada[f.fila]) { asignar(e, f, 'en_su_lugar'); return; }
    pendB.push(e);
  });
  // C: la huella en una sola fila libre (sólo las entradas con valores: una sin valores no tiene nada que ubicar)
  const tentativas = {}, pendC = [];
  pendB.filter(conValores).forEach(function (e) {
    let c = e.huella ? libres(porHuella[e.huella]) : [];
    // la huella en varias filas (un par figura + fecha repetido): desempata el barrio, la hora y el evento
    if (c.length > 1 && e.desempate) { const d = c.filter(function (f) { return f.desempate === e.desempate; }); if (d.length === 1) c = d; }
    if (c.length === 1 && c[0].desempate !== e.desempate && !_mismosValoresGuardian_(c[0].valores, e.valores, cols)) {
      out.ambiguas.push({ entrada: e, filas: [c[0].fila], motivo: 'su huella está en la fila ' + c[0].fila + ' pero con otro barrio/hora/evento' }); return;
    }
    if (c.length === 1) (tentativas[c[0].fila] = tentativas[c[0].fila] || []).push(e);
    else if (c.length > 1) out.ambiguas.push({ entrada: e, filas: c.map(function (f) { return f.fila; }), motivo: 'su huella está en ' + c.length + ' filas' });
    else pendC.push(e);
  });
  Object.keys(tentativas).forEach(function (k) {
    const l = tentativas[k];
    if (l.length === 1) asignar(l[0], porFila[k], 'por_huella');
    else l.forEach(function (e) { out.ambiguas.push({ entrada: e, filas: [Number(k)], motivo: l.length + ' entradas de la copia para la misma fila' }); });
  });
  // D: la huella ya no está: la clave en una sola fila libre, o los mismos valores en una sola fila libre
  pendC.forEach(function (e) {
    let c = e.clave ? libres(porClave[e.clave]) : [];
    if (!c.length) c = filas.filter(function (f) { return !asignada[f.fila] && _mismosValoresGuardian_(f.valores, e.valores, cols); });
    if (!c.length) c = filas.filter(function (f) { return !asignada[f.fila] && f.huella && !huellasCopia[f.huella] && f.desempate === e.desempate; });
    if (c.length === 1) { asignar(e, c[0], 'huella_cambiada'); if (c[0].huella !== e.huella) out.huellaCambiada.push({ fila: c[0].fila, antes: e.huella, ahora: c[0].huella }); }
    else if (c.length > 1) out.noLocalizadas.push({ entrada: e, filas: c.map(function (f) { return f.fila; }), motivo: 'la huella ya no está y hay ' + c.length + ' filas posibles' });
    else out.borradas.push(e);
  });
  out.frenar = out.ambiguas.length > 0 || (out.noLocalizadas.length > 0 && Object.keys(tentativas).length > 0);

  // Las filas que no se tocan: las de una entrada ambigua o no localizada, y la que tiene su clave
  const noTocar = {};
  out.ambiguas.concat(out.noLocalizadas).forEach(function (a) {
    a.filas.forEach(function (n) { noTocar[n] = true; });
    if (a.entrada.clave) (porClave[a.entrada.clave] || []).forEach(function (f) { noTocar[f.fila] = true; });
  });
  // Los cambios: cada fila contra lo de su entrada; una fila libre, contra nada
  const tocadas = {};
  filas.forEach(function (f) {
    if (noTocar[f.fila]) return;
    const e = asignada[f.fila], d = e ? destino.get(e) : null;
    const quiero = e ? e.valores : {};
    const desde = e && e.clave && d.como === 'por_huella' ? (porClave[e.clave] || []).map(function (x) { return x.fila; }).filter(function (n) { return n !== f.fila; }) : [];
    let tipo = 'restaurada', deCopia = 0;
    if (!e) tipo = 'limpiada';
    else if (d.como === 'por_huella') {
      if (e.clave) tipo = desde.length ? 'reubicada' : 'restaurada';
      else {
        // 20/10: sin clave, es una desalineación sólo si la fila tiene las columnas del sistema de OTRA reunión (su clave, o los
        // valores de otra entrada); si no, es la misma fila movida entera (Datos → Ordenar hoja) con algo cambiado
        const s = firma(f.valores);
        const deOtra = !!f.clave || (!!s && (porFirma[s] || []).some(function (x) { return x !== e; }));
        if (deOtra) {
          tipo = 'reubicada';
          const otra = f.clave ? entradas.filter(function (x) { return x.clave === f.clave; })[0] : (porFirma[s] || []).filter(function (x) { return x !== e; })[0];
          if (otra && otra.fila) deCopia = otra.fila;
        }
      }
    }
    let n = 0;
    cols.forEach(function (c) {
      const ahora = f.valores[c.canon], valor = quiero[c.canon];
      if (_normGuardian_(ahora) === _normGuardian_(valor)) return;
      out.cambios.push({ fila: f.fila, canon: c.canon, col: c.col, puesto: ahora === undefined ? '' : ahora,
                         valor: valor === undefined ? '' : valor, tipo: tipo, entrada: e || null });
      n++;
    });
    if (n) tocadas[f.fila] = tipo;
    if (n && tipo === 'reubicada') out.reubicadas.push({ fila: f.fila, desde: desde.join(', '), deCopia: deCopia, clave: e.clave, huella: e.huella, celdas: n });
  });
  out.reubicadas.forEach(function (r) {
    r.columnas = out.cambios.filter(function (c) { return c.fila === r.fila; }).map(function (c) { return c.canon; });
  });
  out.filasTocadas = tocadas;
  return out;
}

/** ¿El plan es una DESALINEACIÓN? (las columnas del sistema de una reunión en la fila de otra, o una ambigua): no se escribe nada. */
function desalineacionGuardian_(p) {
  return !!(p && (p.reubicadas.length || p.ambiguas.length || p.frenar));
}

/**
 * Las filas y columnas que no cierran, para el aviso: `[{ fila (o filas), huella, columnas, texto }]`. Las reubicadas (una fila con
 * las columnas del sistema de otra reunión) y las ambiguas (una reunión cuya huella está en varias filas, o en una con otro barrio).
 */
function detalleDesalineacionGuardian_(p) {
  const out = [];
  p.reubicadas.forEach(function (r) {
    const de = 'las columnas del sistema no son las de esta reunión' + (r.desde ? ' (las suyas están en la fila ' + r.desde + ')' : '') +
               (r.deCopia ? ' (son de la reunión que en la copia estaba en la fila ' + r.deCopia + ')' : '');
    out.push({ filas: [r.fila], huella: r.huella, columnas: r.columnas || [],
               texto: 'fila ' + r.fila + ' (' + (r.huella || 'sin figura ni fecha') + '): ' + de + ' — columnas: ' + (r.columnas || []).join(', ') });
  });
  p.ambiguas.forEach(function (a) {
    const cols = Object.keys(a.entrada.valores || {});
    out.push({ filas: a.filas, huella: a.entrada.huella, columnas: cols,
               texto: 'filas ' + a.filas.join(', ') + ': la reunión ' + (a.entrada.huella || 'sin figura ni fecha') + ' (' + (a.entrada.clave || 'sin clave') +
                      ') no se puede ubicar — ' + a.motivo + ' — columnas: ' + cols.join(', ') });
  });
  return out;
}

// ===================== En la corrida de la hora =====================

/**
 * **El guardián, ANTES de escribir nada** (lo llama `_correrUpsertPartes_` con GUARDIAN_ACTIVO, lo primero; y el paso 57). Lee la
 * base y la copia y decide:
 *   - DESALINEACIÓN → `frenar`: la corrida no escribe nada en la base; avisa (mail, AGENDA_PENDIENTES, REGISTRO_PROTECCION);
 *   - copia vieja (o sin hora) → no compara celdas (sólo miró la desalineación);
 *   - cambios en columnas A → modo 'avisar': avisa y no toca; 'restaurar': restaura (`escribirGuardianLote_`) y avisa.
 * `enSeco`: sólo lo dice (no escribe la base ni REGISTRO_PROTECCION ni AGENDA_PENDIENTES ni avisa). `opciones.copia`: una copia en
 * memoria (`{ hora, entradas }`; el paso 111), que cuenta como fresca.
 * Devuelve `{ frenar, desalineada, vieja, sinCopia, plan, detalle, escritas, avisadas, modo, resumen }`.
 */
function guardianAntesDeEscribir_(enSeco, opciones) {
  opciones = opciones || {};
  const t0 = Date.now();
  const modo = modoGuardian_();
  Logger.log('=== el guardián de las columnas del sistema (%s; modo %s) ===', enSeco ? 'EN SECO' : 'antes de escribir', modo);
  const sh = hojaDestinoGuardian_();
  const estado = leerEstadoGuardian_(sh);
  const copia = opciones.copia || leerCopiaSistema_();
  if (!copia) {
    Logger.log('  no hay copia (%s): no hay con qué comparar; la toma el final de esta corrida.', RDV_HOJA_SISTEMA_COPIA);
    return { sinCopia: true, frenar: false, desalineada: false, modo: modo, escritas: 0, avisadas: 0, resumen: 'sin copia' };
  }
  const p = planGuardian_(copia.entradas, estado);
  const fresca = opciones.copia ? { ok: true, porque: '' } : copiaFrescaGuardian_(copia);
  const out = { plan: p, frenar: false, desalineada: false, vieja: !fresca.ok, modo: modo, escritas: 0, avisadas: 0, resumen: '' };

  if (desalineacionGuardian_(p)) {
    const det = detalleDesalineacionGuardian_(p);
    out.frenar = true; out.desalineada = true; out.detalle = det;
    logPlanGuardian_(p, estado, 40, true);
    Logger.log('  ################################################################################################');
    Logger.log('  ### LA BASE ESTÁ DESALINEADA: alguien ordenó o pegó corrido sólo algunas columnas (%s filas no cierran).', det.length);
    Logger.log('  ### ESTA CORRIDA NO ESCRIBE NADA EN LA BASE (tampoco la ordena). El guardián no la arregla moviendo datos.');
    Logger.log('  ### Volver la base al orden de antes (Edición → Deshacer, o Archivo → Historial de versiones). La corrida siguiente vuelve a mirar.');
    Logger.log('  ################################################################################################');
    det.slice(0, 40).forEach(function (x) { Logger.log('    %s', x.texto); });
    if (det.length > 40) Logger.log('    (y %s más)', det.length - 40);
    if (!enSeco) {
      _reportarGuardian_(p, null, { desalineada: det, modo: modo, vieja: !fresca.ok });
      out.avisadas = det.length;
    }
    out.resumen = 'DESALINEADA (' + det.length + ' filas que no cierran) → FRENÓ: no se escribió nada en la base' + (fresca.ok ? '' : ' (con la copia vieja)');
    Logger.log('[guardián] %s (%s ms)', out.resumen, Date.now() - t0);
    return out;
  }
  if (!fresca.ok) {
    Logger.log('  la copia es VIEJA (%s): no se comparan celdas esta vez (no se sabría quién cambió qué). Desalineación: no. La corrida ' +
               'vuelve a tomar la copia al final.', fresca.porque);
    if (!enSeco) { try { _pendientesGuardian_([], false); } catch (err) { Logger.log('>>> %s (guardián): %s', AGENDA_SOLAPA_PENDIENTES, err); } }
    out.resumen = 'copia vieja (' + fresca.porque + '): no comparó celdas; desalineada no';
    Logger.log('[guardián] %s (%s ms)', out.resumen, Date.now() - t0);
    return out;
  }
  logPlanGuardian_(p, estado, 40, false);
  let w = null;
  if (p.cambios.length && modo === 'restaurar' && !enSeco) {
    w = escribirGuardianLote_(sh, estado.hdr, p.cambios.map(function (c) {
      return { fila: c.fila, col: c.col + 1, valor: c.valor, puesto: c.puesto };
    }));
    out.escritas = w.hechas.length;
    Logger.log('>>> el guardián restauró %s celdas (%s no: alguien las cambió mientras corría).', w.hechas.length, w.saltadas.length);
  }
  if (!enSeco) {
    _reportarGuardian_(p, w, { modo: modo });
    out.avisadas = p.cambios.length;
  }
  const nRest = p.cambios.filter(function (c) { return c.tipo === 'restaurada'; }).length;
  const nLimp = p.cambios.filter(function (c) { return c.tipo === 'limpiada'; }).length;
  out.resumen = (modo === 'restaurar' ? 'restauradas ' + (w ? w.hechas.length : nRest + nLimp) + ' celdas'
                                      : 'avisadas ' + p.cambios.length + ' celdas (modo avisar: no se restauró nada)') +
                ' | cambiadas ' + nRest + ' | filas sin reunión ' + nLimp + ' | borradas por el equipo ' + p.borradas.length +
                ' | figura o fecha cambiada ' + p.huellaCambiada.length + ' | desalineada no';
  Logger.log('[guardián] %s (%s ms)', out.resumen, Date.now() - t0);
  return out;
}

/** El log del plan: los números, los avisos en grande y hasta `tope` líneas de cada cosa. */
function logPlanGuardian_(p, estado, tope, desal) {
  const n = function (t) { return p.cambios.filter(function (c) { return c.tipo === t; }); };
  const rest = n('restaurada'), limp = n('limpiada');
  Logger.log('  columnas guardadas: %s | filas en la base: %s | cambiadas %s celdas | filas sin reunión %s celdas | desalineadas %s filas | ' +
             'ambiguas %s | no localizadas %s | borradas por el equipo %s | figura o fecha cambiada %s',
             estado.cols.guardadas.length, estado.filas.length, rest.length, limp.length, p.reubicadas.length, p.ambiguas.length,
             p.noLocalizadas.length, p.borradas.length, p.huellaCambiada.length);
  if (desal) return;
  const verbo = modoGuardian_() === 'restaurar' ? 'restaurar' : 'AVISAR (no se restaura)';
  rest.slice(0, tope).forEach(function (c) { Logger.log('    %s fila %s, %s: "%s" (la copia: "%s")', verbo, c.fila, c.canon, _txtGuardian_(c.puesto), _txtGuardian_(c.valor)); });
  if (rest.length > tope) Logger.log('    (y %s más)', rest.length - tope);
  const filasRest = {};
  rest.concat(limp).forEach(function (c) { filasRest[c.fila] = true; });
  if (Object.keys(filasRest).length >= GUARDIAN_MUCHAS_FILAS) {
    Logger.log('  ### MUCHAS FILAS (%s) con columnas del sistema cambiadas a mano: ¿alguien pegó o movió columnas del sistema? ###', Object.keys(filasRest).length);
  }
  limp.slice(0, tope).forEach(function (c) { Logger.log('    %s fila %s, %s: "%s" (la fila no es de ninguna reunión de la copia: una fila pegada, o algo tipeado)', verbo, c.fila, c.canon, _txtGuardian_(c.puesto)); });
  p.noLocalizadas.slice(0, tope).forEach(function (a) { Logger.log('    no localizada: %s (%s): filas %s — %s (no se tocan)', a.entrada.huella, a.entrada.clave || 'sin clave', a.filas.join(', '), a.motivo); });
  p.huellaCambiada.slice(0, tope).forEach(function (h) { Logger.log('    fila %s: figura o fecha cambiada por el equipo (%s → %s): se acepta', h.fila, h.antes, h.ahora); });
}

function _txtGuardian_(v) { return v instanceof Date ? Utilities.formatDate(v, RDV_TZ, 'dd/MM/yyyy HH:mm') : String(v === undefined ? '' : v); }

const GUARDIAN_ENCABEZADO_REGISTRO_ = ['hora', 'qué', 'fila', 'columna', 'valor puesto', 'valor de la copia', 'detalle'];

/**
 * Lo que vio el guardián, a sus tres salidas (sólo en una corrida real): REGISTRO_PROTECCION, el aviso por mail
 * (registrarAviso_, si 50_Avisos.js está) y AGENDA_PENDIENTES. Nunca tira: cada salida, aislada.
 * `w`: lo que escribió (modo restaurar). `o.desalineada`: el detalle de la desalineación (si la hay).
 */
function _reportarGuardian_(p, w, o) {
  o = o || {};
  try { registrarProteccion_(p, w, o); }
  catch (err) { Logger.log('>>> No se pudo escribir %s: %s', RDV_HOJA_REGISTRO_PROTECCION, err); }
  const lineas = _lineasPendientesGuardian_(p, w, o);
  try { _pendientesGuardian_(lineas, !!o.desalineada); }
  catch (err) { Logger.log('>>> %s (guardián) no se pudo escribir: %s', AGENDA_SOLAPA_PENDIENTES, err); }
  if (typeof registrarAviso_ !== 'function') return;
  if (o.desalineada && o.desalineada.length) {
    registrarAviso_('guardian_desalineacion',
      'LA BASE ESTÁ DESALINEADA: alguien ordenó o pegó corrido sólo algunas columnas. Esta corrida NO escribió nada en la base (tampoco la ' +
      'ordenó). Volver la base al orden de antes (Edición → Deshacer, o Archivo → Historial de versiones); la corrida siguiente vuelve a ' +
      'mirar.\nLas filas y columnas que no cierran (' + o.desalineada.length + '):\n' +
      o.desalineada.slice(0, 30).map(function (x) { return '  ' + x.texto; }).join('\n') + (o.desalineada.length > 30 ? '\n  (y ' + (o.desalineada.length - 30) + ' más)' : ''));
  } else if (p.cambios.length) {
    const hechas = w ? new Set(w.hechas.map(function (e) { return e.fila + ':' + e.col; })) : null;
    registrarAviso_('guardian_cambios',
      (o.modo === 'restaurar' ? 'Alguien cambió columnas del sistema de la base; el guardián las RESTAURÓ (lo de la copia):\n'
                              : 'Alguien cambió columnas del sistema de la base. El guardián está en modo AVISAR: no se tocó nada.\n') +
      p.cambios.slice(0, 30).map(function (c) {
        return '  fila ' + c.fila + ' (' + (c.entrada ? c.entrada.huella : 'fila que no es de ninguna reunión') + '), ' + c.canon + ': "' + _txtGuardian_(c.puesto) +
               '" — la copia: "' + _txtGuardian_(c.valor) + '"' + (hechas ? (hechas.has(c.fila + ':' + (c.col + 1)) ? ' → restaurada' : ' → no (cambió mientras corría)') : '');
      }).join('\n') + (p.cambios.length > 30 ? '\n  (y ' + (p.cambios.length - 30) + ' más)' : ''));
  }
}

/** REGISTRO_PROTECCION: una línea por celda cambiada (avisada o restaurada), una por fila desalineada y una por entrada ambigua. */
function registrarProteccion_(p, w, o) {
  o = o || {};
  const hechas = w ? new Set(w.hechas.map(function (e) { return e.fila + ':' + e.col; })) : null;
  const ahora = new Date(), filas = [];
  if (o.desalineada) {
    o.desalineada.slice(0, 60).forEach(function (x) {
      filas.push([ahora, 'DESALINEADA: no se escribió nada en la base', x.filas.join(', '), x.columnas.join(', '), '', '', x.texto]);
    });
  } else {
    p.cambios.forEach(function (c) {
      const que = c.tipo === 'limpiada' ? 'fila sin reunión' : 'columna del sistema cambiada';
      let estado;
      if (o.modo === 'restaurar') {
        if (hechas && !hechas.has(c.fila + ':' + (c.col + 1))) return;
        estado = c.tipo === 'limpiada' ? 'limpiada' : 'restaurada';
      } else estado = 'avisada (modo avisar: no se restauró)';
      filas.push([ahora, que + ': ' + estado, c.fila, c.canon, _txtGuardian_(c.puesto), _txtGuardian_(c.valor), c.entrada ? c.entrada.huella : 'fila que no es de ninguna reunión']);
    });
  }
  if (!filas.length) return 0;
  const ss = ssIntermedia_();
  let sh = ss.getSheetByName(RDV_HOJA_REGISTRO_PROTECCION);
  if (!sh) { sh = ss.insertSheet(RDV_HOJA_REGISTRO_PROTECCION); sh.appendRow(GUARDIAN_ENCABEZADO_REGISTRO_); sh.setFrozenRows(1); }
  const desde = sh.getLastRow() + 1, hasta = desde + filas.length - 1;
  if (hasta > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), hasta - sh.getMaxRows());
  sh.getRange(desde, 1, filas.length, GUARDIAN_ENCABEZADO_REGISTRO_.length).setValues(filas);
  return filas.length;
}

// ===================== AGENDA_PENDIENTES (intermedia): las líneas del guardián =====================

/** El encabezado de AGENDA_PENDIENTES (el de 40_Agenda.js; si no está cargado, el mismo). */
function _encPendientesGuardian_() {
  return typeof ENC_PENDIENTES_AGENDA_ !== 'undefined' ? ENC_PENDIENTES_AGENDA_
    : ['tipo', 'reunión', 'semana', 'grupo', 'fecha', 'hora', 'lugar', 'fila', 'qué pasa', 'qué sigue', 'desde', 'id', 'no va'];
}

/** Las líneas del guardián para AGENDA_PENDIENTES: `[{ id, tipo, reunion, fecha, fila, que, sigue }]` (a lo sumo 60). */
function _lineasPendientesGuardian_(p, w, o) {
  const out = [];
  const fechaDe = function (huella) { const m = /\|(\d{4}-\d{2}-\d{2})$/.exec(huella || ''); return m ? m[1].split('-').reverse().join('/') : ''; };
  if (o.desalineada && o.desalineada.length) {
    o.desalineada.slice(0, 60).forEach(function (x) {
      out.push({ id: 'guardian|desalineada|' + x.filas.join(','), tipo: GUARDIAN_TIPO_PENDIENTE_DESALINEADA, reunion: x.huella || '', fecha: fechaDe(x.huella),
                 fila: x.filas.join(', '), que: x.texto + '. La corrida NO escribió nada en la base (tampoco la ordenó).',
                 sigue: 'volver la base al orden de antes (Edición → Deshacer, o el historial de versiones); la corrida siguiente vuelve a mirar' });
    });
    return out;
  }
  const hechas = w ? new Set(w.hechas.map(function (e) { return e.fila + ':' + e.col; })) : null;
  p.cambios.slice(0, 60).forEach(function (c) {
    const rest = o.modo === 'restaurar';
    if (rest && hechas && !hechas.has(c.fila + ':' + (c.col + 1))) return;
    const clave = c.entrada ? (c.entrada.clave || c.entrada.huella) : 'fila ' + c.fila;
    out.push({ id: 'guardian|cambio|' + clave + '|' + c.canon + '|' + _normGuardian_(c.puesto), tipo: rest ? GUARDIAN_TIPO_PENDIENTE_RESTAURADA : GUARDIAN_TIPO_PENDIENTE_CAMBIO,
               reunion: c.entrada ? c.entrada.huella : '(fila que no es de ninguna reunión)', fecha: c.entrada ? fechaDe(c.entrada.huella) : '', fila: String(c.fila),
               que: c.canon + ': "' + _txtGuardian_(c.puesto) + '" — lo del sistema era "' + _txtGuardian_(c.valor) + '"' + (rest ? ' (restaurado)' : ' (no se tocó: modo avisar)'),
               sigue: rest ? 'nada: si el cambio era a propósito, lo hace quien administra el sistema' : 'mirar si estuvo bien; con el modo "restaurar" el sistema lo vuelve atrás' });
  });
  return out;
}

/**
 * Pone las líneas del guardián en AGENDA_PENDIENTES (intermedia), con id "guardian|…": las de la DESALINEACIÓN valen mientras la base
 * siga desalineada (cada mirada las reemplaza); las de un cambio se quedan AGENDA_PENDIENTES_DIAS_EVENTOS días (o 3). Las demás líneas
 * (las de la agenda) no se tocan; la agenda, al reescribir la solapa, conserva las del guardián (`matrizPendientesAgenda_`, con
 * GUARDIAN_ACTIVO). Escribe sólo si algo cambió.
 */
function _pendientesGuardian_(lineas, desalineada) {
  const enc = _encPendientesGuardian_();
  const ix = function (n) { return enc.indexOf(n); };
  const ss = ssIntermedia_();
  const sh = ss.getSheetByName(AGENDA_SOLAPA_PENDIENTES);
  const previas = [];
  if (sh && sh.getLastRow() >= 1) {
    const v = sh.getRange(1, 1, sh.getLastRow(), Math.max(1, sh.getLastColumn())).getValues();
    const h = v[0].map(normalizeHeader_);
    const k = function (n) { return h.indexOf(normalizeHeader_(n)); };
    v.slice(1).forEach(function (r) {
      if (!r.some(function (x) { return !esVacio_(x); })) return;
      previas.push(enc.map(function (n) { const j = k(n); return j < 0 ? '' : r[j]; }));
    });
  }
  const dias = typeof AGENDA_PENDIENTES_DIAS_EVENTOS !== 'undefined' ? AGENDA_PENDIENTES_DIAS_EVENTOS : 3;
  const limite = Date.now() - dias * 86400000;
  const ahora = new Date();
  const nuevas = {};
  lineas.forEach(function (l) { nuevas[l.id] = l; });
  const quedan = [], desdeDe = {};
  let cambio = false;
  previas.forEach(function (r) {
    const id = str(r[ix('id')]);
    if (!/^guardian\|/.test(id)) { quedan.push(r); return; }
    if (nuevas[id]) { desdeDe[id] = r[ix('desde')] instanceof Date ? r[ix('desde')] : ahora; cambio = true; return; }   // se reemplaza
    const esCambio = /^guardian\|cambio\|/.test(id);
    const desde = r[ix('desde')];
    if (esCambio && !desalineada && desde instanceof Date && desde.getTime() >= limite) { quedan.push(r); return; }
    cambio = true;   // una desalineación que ya no está, o un cambio viejo: se va
  });
  lineas.forEach(function (l) {
    const r = enc.map(function () { return ''; });
    r[ix('tipo')] = l.tipo; r[ix('reunión')] = l.reunion; r[ix('fecha')] = l.fecha; r[ix('fila')] = l.fila; r[ix('qué pasa')] = l.que;
    r[ix('qué sigue')] = l.sigue; r[ix('desde')] = desdeDe[l.id] || ahora; r[ix('id')] = l.id;
    quedan.push(r);
    cambio = true;
  });
  if (!cambio) return false;
  escribirHoja_(AGENDA_SOLAPA_PENDIENTES, [enc.slice()].concat(quedan));
  return true;
}

// ===================== Ocultar y proteger (pasos 113, 114 y 115) =====================

/**
 * Qué falta para que las columnas A queden ocultas (las técnicas), protegidas con advertencia (todas) y con el encabezado gris. Sólo
 * lee. `{ sh, hdr, ocultar, proteger, gris, todas, delEquipo }`: `delEquipo`, las protecciones de rango que NO son del sistema y caen
 * sobre una columna A (no se tocan nunca).
 */
function faltaOcultarProteger_() {
  const sh = hojaDestinoGuardian_();
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const cols = columnasGuardian_(hdr), todas = cols.guardadas.concat(cols.derivadas);
  const ocultar = GUARDIAN_OCULTAR.map(function (n) { return { n: n, c: findIdxOr_(hdr, [n], true) }; })
    .filter(function (x) { return x.c != null && !(sh.isColumnHiddenByUser && sh.isColumnHiddenByUser(x.c + 1)); });
  // 13/10 (revisor): cuenta sólo la protección DEL SISTEMA (la del guardián o la de las derivadas, por su descripción), no la
  // de otra persona; y la de las derivadas vale aunque sea acotada (se creó hasta el maxRows de ese día: no es "nueva").
  const nuestras = [DESC_PROTECCION_SISTEMA, DESC_PROTECCION_DERIVADAS];
  const prot = sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).map(function (p) {
    const r = p.getRange();
    return { desde: r.getColumn(), hasta: r.getLastColumn(), fila1: r.getRow(), fila2: r.getLastRow(),
             desc: p.getDescription ? p.getDescription() : '', nuestra: nuestras.indexOf(p.getDescription ? p.getDescription() : '') >= 0 };
  });
  const proteger = todas.filter(function (x) {
    const c = x.col + 1;
    return !prot.some(function (p) { return p.nuestra && p.desde <= c && c <= p.hasta && p.fila1 <= 2; });
  });
  const delEquipo = prot.filter(function (p) { return !p.nuestra && todas.some(function (x) { return p.desde <= x.col + 1 && x.col + 1 <= p.hasta; }); });
  const fondos = sh.getRange(1, 1, 1, sh.getLastColumn()).getBackgrounds()[0];
  const gris = todas.filter(function (x) { return String(fondos[x.col] || '').toLowerCase() !== GUARDIAN_GRIS_ENCABEZADO.toLowerCase(); })
    .map(function (x) { return Object.assign({}, x, { antes: fondos[x.col] || '' }); });
  return { sh: sh, hdr: hdr, ocultar: ocultar, proteger: proteger, gris: gris, todas: todas, delEquipo: delEquipo };
}

/** La huella de lo que haría el paso 114 (el encabezado entero y las tres listas), para que el 114 exija lo mismo que vio el 113. */
function _huellaOcultarProteger_(f) {
  return _huellaGuardian_(JSON.stringify({ h: f.hdr.map(str), o: f.ocultar.map(function (x) { return x.n; }),
                                           p: f.proteger.map(function (x) { return x.nombre; }), g: f.gris.map(function (x) { return x.nombre; }) }));
}

/** El registro de lo que hizo el sistema (paso 114 y las columnas nuevas): `{ hora, ocultadas, protegidas, gris: [{ nombre, antes }] }`. */
function _leerRegistroOcultarProteger_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP_GUARDIAN_PREPARADO) || 'null'); } catch (e) { return null; }
}
function _guardarRegistroOcultarProteger_(r) {
  PropertiesService.getScriptProperties().setProperty(PROP_GUARDIAN_PREPARADO, JSON.stringify(r));
}

/**
 * **Paso 113 — EN SECO**: qué columnas se ocultarían (las técnicas), cuáles se protegerían con advertencia y en cuáles se pondría el
 * encabezado gris; las protecciones del equipo sobre columnas A (no se tocan). No escribe la base; guarda la HUELLA (propiedad del
 * script) que exige el paso 114.
 */
function ocultarProteger_enSeco() {
  Logger.log('=== paso 113 — ocultar y proteger las columnas del sistema (EN SECO: no escribe la base) ===');
  const f = faltaOcultarProteger_();
  const letra = function (c) { return _a1_(1, c + 1).replace(/\d+$/, ''); };
  Logger.log('--- OCULTARÍA %s columnas técnicas: %s', f.ocultar.length, f.ocultar.map(function (x) { return letra(x.c) + ' ' + x.n; }).join(' | ') || '— (ya están ocultas)');
  Logger.log('--- PROTEGERÍA con advertencia %s de las %s columnas A: %s', f.proteger.length, f.todas.length,
             f.proteger.map(function (x) { return letra(x.col) + ' ' + x.nombre; }).join(' | ') || '— (ya están protegidas)');
  Logger.log('--- pondría el ENCABEZADO GRIS (sólo la fila 1) en %s: %s', f.gris.length, f.gris.map(function (x) { return letra(x.col) + ' ' + x.nombre; }).join(' | ') || '—');
  Logger.log('--- las protecciones del EQUIPO sobre columnas A (no se tocan): %s', f.delEquipo.length ? f.delEquipo.map(function (p) {
    return 'columnas ' + letra(p.desde - 1) + (p.hasta > p.desde ? ':' + letra(p.hasta - 1) : '') + ' ("' + (p.desc || 'sin descripción') + '")'; }).join(' | ') : 'ninguna');
  Logger.log('    Las columnas B y C no se tocan. Ningún valor ni fondo de datos cambia. Deshacer: paso 115.');
  const h = _huellaOcultarProteger_(f);
  const nada = !f.ocultar.length && !f.proteger.length && !f.gris.length;
  try {
    if (nada) PropertiesService.getScriptProperties().deleteProperty(PROP_GUARDIAN_HUELLA_SECO);
    else PropertiesService.getScriptProperties().setProperty(PROP_GUARDIAN_HUELLA_SECO, JSON.stringify({ h: h, t: Date.now() }));
  } catch (e) { Logger.log('  (la huella no se pudo guardar: %s)', e); }
  Logger.log(nada ? '>>> NADA QUE HACER: ya están ocultas, protegidas y grises.' : '>>> HUELLA %s (el paso 114 la exige; vence a las %s horas).', h, GUARDIAN_HUELLA_SECO_HORAS);
  return { ocultar: f.ocultar.length, proteger: f.proteger.length, gris: f.gris.length, delEquipo: f.delEquipo.length, huella: nada ? '' : h };
}

/** Protege con advertencia (toda la columna) cada columna de `lista` (`[{ col }]`, 0-based). */
function _protegerColumnasGuardian_(sh, lista) {
  lista.forEach(function (x) {
    const l = _a1_(1, x.col + 1).replace(/\d+$/, '');
    sh.getRange(l + ':' + l).protect().setDescription(DESC_PROTECCION_SISTEMA).setWarningOnly(true);
  });
}

/**
 * **Paso 114 — ESCRIBE (formato, no valores)**: oculta las técnicas, protege con ADVERTENCIA las columnas A (el equipo ve el aviso y
 * puede seguir; no bloquea ordenar ni borrar filas) y pone su encabezado gris. Exige la huella del paso 113 (la misma base, de menos de
 * GUARDIAN_HUELLA_SECO_HORAS; sirve una vez). Lo que el equipo tenía protegido no se toca. Anota lo que hizo (para el paso 115).
 */
function ocultarProteger() {
  Logger.log('=== paso 114 — ocultar y proteger las columnas del sistema (ESCRIBE formato) ===');
  const f = faltaOcultarProteger_(), sh = f.sh;
  let g = null;
  try { g = JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP_GUARDIAN_HUELLA_SECO) || 'null'); } catch (e) { g = null; }
  const h = _huellaOcultarProteger_(f);
  const no = !g || !g.h ? 'primero hay que correr el paso 113 (en seco)'
    : Date.now() - (g.t || 0) > GUARDIAN_HUELLA_SECO_HORAS * 3600000 ? 'la huella del paso 113 tiene más de ' + GUARDIAN_HUELLA_SECO_HORAS + ' horas: volver a correrlo'
    : g.h !== h ? 'la base cambió desde el paso 113 (otras columnas, o ya hechas): volver a correrlo' : '';
  if (no) { Logger.log('>>> NO SE HACE NADA: %s.', no); return { error: no }; }
  try { PropertiesService.getScriptProperties().deleteProperty(PROP_GUARDIAN_HUELLA_SECO); } catch (e) { /* sirve una vez */ }
  const reg = _leerRegistroOcultarProteger_() || { hora: 0, ocultadas: [], protegidas: [], gris: [] };
  // lo que se va a hacer, ANTES (si la ejecución muere en el medio, el paso 115 sabe qué deshacer)
  f.ocultar.forEach(function (x) { if (reg.ocultadas.indexOf(x.n) < 0) reg.ocultadas.push(x.n); });
  f.proteger.forEach(function (x) { if (reg.protegidas.indexOf(x.canon) < 0) reg.protegidas.push(x.canon); });
  f.gris.forEach(function (x) { if (!reg.gris.some(function (y) { return y.nombre === x.canon; })) reg.gris.push({ nombre: x.canon, antes: x.antes }); });
  reg.hora = Date.now();
  _guardarRegistroOcultarProteger_(reg);
  f.ocultar.forEach(function (x) { sh.hideColumns(x.c + 1); });
  if (f.gris.length) sh.getRangeList(f.gris.map(function (x) { return _a1_(1, x.col + 1); })).setBackground(GUARDIAN_GRIS_ENCABEZADO);
  _protegerColumnasGuardian_(sh, f.proteger);
  Logger.log('>>> ocultas %s | protegidas con advertencia %s | encabezado gris %s (de %s columnas A). Las del equipo, intactas. ' +
             'Deshacer: paso 115.', f.ocultar.length, f.proteger.length, f.gris.length, f.todas.length);
  return { ocultas: f.ocultar.length, protegidas: f.proteger.length, gris: f.gris.length };
}

/**
 * **Paso 115 — deshacer el 114** (y lo que agregaron las corridas: las columnas A nuevas). `escribe` false: sólo dice qué haría.
 * Muestra las columnas que ocultó el sistema, saca SÓLO las protecciones del sistema (DESC_PROTECCION_SISTEMA; nunca las del
 * equipo ni la de las derivadas del paso 26) y vuelve el encabezado al color de antes donde todavía está gris. Ningún valor cambia.
 */
function deshacerOcultarProteger(escribe) {
  Logger.log('=== paso 115 — deshacer ocultar y proteger (%s) ===', escribe ? 'ESCRIBE formato' : 'EN SECO');
  const reg = _leerRegistroOcultarProteger_();
  const sh = hojaDestinoGuardian_();
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const prot = sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).filter(function (p) { return (p.getDescription ? p.getDescription() : '') === DESC_PROTECCION_SISTEMA; });
  if (!reg && !prot.length) { Logger.log('>>> nada que deshacer (el paso 114 no corrió, o ya se deshizo).'); return { mostradas: 0, desprotegidas: 0, gris: 0 }; }
  const col = function (n) { return findIdxOr_(hdr, _aliasGuardian_(n), true); };
  const mostrar = ((reg && reg.ocultadas) || []).map(function (n) { return { n: n, c: col(n) }; }).filter(function (x) { return x.c != null; });
  const fondos = sh.getRange(1, 1, 1, sh.getLastColumn()).getBackgrounds()[0];
  const grises = ((reg && reg.gris) || []).map(function (g) { return { n: g.nombre, antes: g.antes, c: col(g.nombre) }; })
    .filter(function (x) { return x.c != null && String(fondos[x.c] || '').toLowerCase() === GUARDIAN_GRIS_ENCABEZADO.toLowerCase(); });
  Logger.log('  mostraría %s columnas: %s', mostrar.length, mostrar.map(function (x) { return x.n; }).join(' | ') || '—');
  Logger.log('  sacaría %s protecciones del sistema (las del equipo y la de las derivadas, no)', prot.length);
  Logger.log('  volvería el encabezado al color de antes en %s columnas', grises.length);
  if (!reg) Logger.log('  (no está el registro del paso 114: sólo se sacan las protecciones del sistema; las columnas ocultas y el gris quedan)');
  if (!escribe) return { mostradas: mostrar.length, desprotegidas: prot.length, gris: grises.length, enSeco: true };
  mostrar.forEach(function (x) { sh.showColumns(x.c + 1); });
  prot.forEach(function (p) { p.remove(); });
  grises.forEach(function (x) { sh.getRange(1, x.c + 1).setBackground(x.antes && String(x.antes).toLowerCase() !== '#ffffff' ? x.antes : null); });
  try { PropertiesService.getScriptProperties().deleteProperty(PROP_GUARDIAN_PREPARADO); } catch (e) { /* el log lo dice */ }
  Logger.log('>>> deshecho: %s columnas mostradas, %s protecciones sacadas, %s encabezados con su color de antes.', mostrar.length, prot.length, grises.length);
  return { mostradas: mostrar.length, desprotegidas: prot.length, gris: grises.length };
}

/**
 * **Las columnas A que NACEN después del paso 114** (13/10): en cada corrida de la hora con el guardián prendido, al final, y SÓLO si el
 * paso 114 corrió (está su registro): una columna A sin la protección del sistema es nueva → se protege con advertencia, se pinta su
 * encabezado de gris y, si es técnica (GUARDIAN_OCULTAR), se oculta; queda en el registro (el paso 115 la deshace). Una técnica ya
 * protegida que alguien del equipo mostró NO se vuelve a ocultar. No toca valores ni fondos de datos. Devuelve `{ nuevas: [nombres] }`.
 */
function asegurarColumnasNuevasGuardian_() {
  const reg = _leerRegistroOcultarProteger_();
  if (!reg) return { nuevas: [], sinPaso114: true };
  const f = faltaOcultarProteger_(), sh = f.sh;
  if (!f.proteger.length) return { nuevas: [] };
  const tecnicas = {};
  GUARDIAN_OCULTAR.forEach(function (n) { const c = findIdxOr_(f.hdr, [n], true); if (c != null) tecnicas[c] = true; });
  const fondos = sh.getRange(1, 1, 1, sh.getLastColumn()).getBackgrounds()[0];
  f.proteger.forEach(function (x) {
    if (tecnicas[x.col] && reg.ocultadas.indexOf(x.canon) < 0) reg.ocultadas.push(x.canon);
    if (reg.protegidas.indexOf(x.canon) < 0) reg.protegidas.push(x.canon);
    if (!reg.gris.some(function (y) { return y.nombre === x.canon; }) && String(fondos[x.col] || '').toLowerCase() !== GUARDIAN_GRIS_ENCABEZADO.toLowerCase()) {
      reg.gris.push({ nombre: x.canon, antes: fondos[x.col] || '' });
    }
  });
  _guardarRegistroOcultarProteger_(reg);
  // 13/10 (revisor): la protección AL FINAL. Es lo que marca "ya no es nueva": si la corrida se corta antes (el límite de 6
  // minutos), la columna sigue sin protección y la corrida siguiente termina el gris y el ocultar.
  sh.getRangeList(f.proteger.map(function (x) { return _a1_(1, x.col + 1); })).setBackground(GUARDIAN_GRIS_ENCABEZADO);
  const ocultas = f.proteger.filter(function (x) { return tecnicas[x.col]; });
  ocultas.forEach(function (x) { sh.hideColumns(x.col + 1); });
  _protegerColumnasGuardian_(sh, f.proteger);
  const nombres = f.proteger.map(function (x) { return x.nombre + (tecnicas[x.col] ? ' (oculta)' : ''); });
  Logger.log('>>> el guardián: %s columna(s) del sistema NUEVA(S), protegidas con advertencia y con el encabezado gris: %s',
             f.proteger.length, nombres.join(', '));
  return { nuevas: nombres };
}

// ===================== La copia nueva y el seco (pasos 111 y 112) =====================

/**
 * **Paso 112 — la COPIA NUEVA** (escribe SÓLO SISTEMA_COPIA, en la intermedia; nunca la base). La base de hoy es la referencia. Es
 * idempotente: la solapa se reescribe entera (correrlo dos veces deja lo mismo). Queda SIN HORA a propósito: hasta prender el guardián
 * las corridas escriben sin sello, así que la primera corrida prendida no compara celdas contra ésta (sólo mira la desalineación) y toma
 * la copia buena al final. `escribe` false: sólo dice cuántas filas copiaría.
 */
function guardianCopiaNueva(escribe) {
  Logger.log('=== paso 112 — la copia nueva de las columnas del sistema (%s) ===', escribe ? 'ESCRIBE sólo ' + RDV_HOJA_SISTEMA_COPIA + ' (intermedia)' : 'EN SECO');
  const estado = leerEstadoGuardian_(hojaDestinoGuardian_());
  const n = entradasDeEstadoGuardian_(estado).length;
  Logger.log('  %s filas de la base, %s columnas guardadas (%s).', n, estado.cols.guardadas.length, estado.cols.guardadas.map(function (c) { return c.nombre; }).join(', '));
  if (!escribe) return { filas: n, enSeco: true };
  const k = tomarCopiaSistema_(estado);
  PropertiesService.getScriptProperties().deleteProperty(PROP_GUARDIAN_COPIA);
  Logger.log('>>> %s reescrita: %s filas (idempotente: la solapa se reescribe entera; sin hora: la primera corrida prendida no compara ' +
             'celdas contra ésta, sólo mira la desalineación, y toma la buena al final).', RDV_HOJA_SISTEMA_COPIA, k);
  return { filas: k };
}

/**
 * **Paso 111 — EL GUARDIÁN EN SECO** (SÓLO LECTURA: ni la base, ni la intermedia, ni avisos):
 *   1. las CLASES A / B / C de cada columna de la base real, y las que no tienen clase;
 *   2. ocultar / proteger: qué haría el paso 114 (resumen; el detalle, el 113);
 *   3. con una COPIA NUEVA (en memoria, la base de hoy): qué avisaría o restauraría la corrida siguiente — tiene que dar 0; lo que no,
 *      es real (una clave repetida: una fila copiada y pegada, una huella ambigua…);
 *   4. contra la copia guardada (SISTEMA_COPIA), si hay: qué diría hoy la corrida (desalineada / cambios / copia vieja);
 *   5. la prueba en memoria: si alguien ordenara HOY sólo las columnas del equipo, el guardián FRENA (y cuántas filas listaría);
 *   6. las filas cuyas trazas no cuadran hoy (diagnostico/27_guardian.js): el guardián no las toca.
 */
function guardianEnSeco() {
  Logger.log('=== paso 111 — el guardián EN SECO (no escribe nada: ni la base, ni la intermedia; modo %s; GUARDIAN_ACTIVO = %s) ===', modoGuardian_(), GUARDIAN_ACTIVO);
  const sh = hojaDestinoGuardian_();
  const bloque = sh.getRange(1, 1, Math.max(1, sh.getLastRow()), Math.max(1, sh.getLastColumn())).getValues();
  const out = {};
  // 1. las clases
  Logger.log('--- 1. LAS CLASES DE LAS COLUMNAS (00_Config.js: GUARDIAN_CLASE_A / _A_DERIVADAS / _B / _C) ---');
  const cl = clasesColumnasGuardian_(bloque[0]);
  logClasesGuardian_(cl);
  out.clases = cl;
  // 2. ocultar / proteger
  try {
    const f = faltaOcultarProteger_();
    Logger.log('--- 2. OCULTAR / PROTEGER (paso 113 en seco, 114 real): ocultaría %s, protegería %s, gris en %s; protecciones del equipo sobre columnas A: %s (no se tocan)',
               f.ocultar.length, f.proteger.length, f.gris.length, f.delEquipo.length);
    out.ocultarProteger = { ocultar: f.ocultar.length, proteger: f.proteger.length, gris: f.gris.length, delEquipo: f.delEquipo.length };
  } catch (err) { Logger.log('--- 2. no se pudieron leer las protecciones: %s', err); }
  // 3. con una copia nueva en memoria
  const estado = leerEstadoGuardian_(null, bloque);
  const pNueva = planGuardian_(entradasDeEstadoGuardian_(estado), estado);
  Logger.log('--- 3. CON UNA COPIA NUEVA (en memoria, la base de hoy): desalineada %s | cambios %s | filas sin reunión %s (tiene que dar 0: lo que no, es real)',
             desalineacionGuardian_(pNueva) ? 'SÍ' : 'no', pNueva.cambios.filter(function (c) { return c.tipo === 'restaurada'; }).length,
             pNueva.cambios.filter(function (c) { return c.tipo === 'limpiada'; }).length);
  pNueva.cambios.slice(0, 40).forEach(function (c) { Logger.log('    fila %s, %s: "%s" (%s)', c.fila, c.canon, _txtGuardian_(c.puesto), c.tipo === 'limpiada' ? 'la fila repite la clave de otra: ¿copiada y pegada?' : 'la copia diría "' + _txtGuardian_(c.valor) + '"'); });
  detalleDesalineacionGuardian_(pNueva).slice(0, 40).forEach(function (x) { Logger.log('    %s', x.texto); });
  const repetidas = {};
  estado.filas.forEach(function (f) { if (f.clave) (repetidas[f.clave] = repetidas[f.clave] || []).push(f.fila); });
  const rep = Object.keys(repetidas).filter(function (k) { return repetidas[k].length > 1; });
  Logger.log('    claves (agenda_uid / RDV_UID) repetidas en la base: %s%s', rep.length, rep.length ? ' — ' + rep.slice(0, 20).map(function (k) { return k + ' en las filas ' + repetidas[k].join(', '); }).join(' | ') : '');
  out.copiaNueva = { desalineada: desalineacionGuardian_(pNueva), cambios: pNueva.cambios.length, clavesRepetidas: rep.length };
  // 4. contra la copia guardada
  let copia = null;
  try { copia = leerCopiaSistema_(); } catch (err) { Logger.log('--- 4. %s no se pudo leer: %s', RDV_HOJA_SISTEMA_COPIA, err); }
  if (!copia) Logger.log('--- 4. no hay %s guardada: el paso 112 la toma.', RDV_HOJA_SISTEMA_COPIA);
  else {
    const fr = copiaFrescaGuardian_(copia);
    const pG = planGuardian_(copia.entradas, estado);
    const ultima = copia.entradas.reduce(function (m, e) { return Math.max(m, e.fila || 0); }, 0);
    Logger.log('--- 4. CONTRA LA COPIA GUARDADA (%s entradas, hasta la fila %s; %s): la corrida diría → %s', copia.entradas.length, ultima,
               copia.hora ? 'del ' + Utilities.formatDate(new Date(copia.hora), RDV_TZ, 'dd/MM HH:mm') + (fr.ok ? ', fresca' : ', VIEJA: ' + fr.porque) : 'sin hora (la del paso 112)',
               desalineacionGuardian_(pG) ? 'DESALINEADA: frenaría (' + detalleDesalineacionGuardian_(pG).length + ' filas)'
               : !fr.ok ? 'no compara celdas (copia vieja); no está desalineada' : pG.cambios.length + ' celdas cambiadas (las ' + (modoGuardian_() === 'restaurar' ? 'restauraría' : 'avisaría') + ')');
    if (desalineacionGuardian_(pG)) detalleDesalineacionGuardian_(pG).slice(0, 20).forEach(function (x) { Logger.log('    %s', x.texto); });
    else if (fr.ok) logPlanGuardian_(pG, estado, 20, false);
    if (desalineacionGuardian_(pG) || !fr.ok) Logger.log('    (con el paso 112 la copia pasa a ser la base de hoy: esto deja de valer)');
    out.copiaGuardada = { fresca: fr.ok, desalineada: desalineacionGuardian_(pG), cambios: pG.cambios.length, ultimaFila: ultima };
  }
  // 5. la prueba en memoria
  try {
    const prueba = pruebaDesalineacionGuardian_(bloque);
    Logger.log('--- 5. LA PRUEBA (en memoria): si alguien ordenara HOY sólo las columnas del equipo %s (%s filas cambian de lugar), el guardián → %s (%s filas que no cierran)',
               prueba.como, prueba.movidas, prueba.frena ? 'FRENA la corrida (no escribe nada) y avisa' : 'NO LO VE', prueba.filas);
    out.prueba = { frena: prueba.frena, filas: prueba.filas, movidas: prueba.movidas };
  } catch (err) { Logger.log('--- 5. la prueba no se pudo hacer: %s', err); }
  // 6. las filas cuyas trazas no cuadran (diagnostico/27_guardian.js)
  if (typeof alineacionBase_ === 'function') {
    try {
      const alin = alineacionBase_(armarDestino_(sh, RDV_HOJA_DESTINO, bloque));
      Logger.log('--- 6. las filas cuyas trazas no cuadran HOY: %s de %s con traza (el guardián no las toca: la copia las toma como están)',
                 alin.noCuadran.length, alin.trazadas);
      alin.noCuadran.slice(0, 40).forEach(function (x) { Logger.log('    fila %s (%s, %s): %s', x.fila, x.figura || 'sin figura', x.fecha ? fmtFecha_(x.fecha) : 'sin fecha', x.motivos.join('; ')); });
      out.noCuadran = alin.noCuadran.length;
    } catch (err) { Logger.log('--- 6. no se pudo medir la alineación: %s', err); }
  }
  Logger.log('>>> RESUMEN: sin clase %s | copia nueva: %s | la prueba del orden parcial: %s', cl.sinClase.length,
             out.copiaNueva.desalineada || out.copiaNueva.cambios ? 'NO da 0 (mirar el punto 3)' : '0 (bien)', out.prueba ? (out.prueba.frena ? 'frena (bien)' : 'NO FRENA (mal)') : '—');
  return out;
}

/**
 * La prueba de la desalineación EN MEMORIA: una copia de `bloque` (la base) y el mismo bloque con sólo las columnas del equipo
 * ordenadas (las del sistema quietas). Devuelve si el guardián la ve (frena) y cuántas filas listaría.
 */
function pruebaDesalineacionGuardian_(bloque) {
  const hdr = bloque[0], datos = bloque.slice(1);
  const cols = columnasGuardian_(hdr);
  const sistema = cols.guardadas.concat(cols.derivadas).map(function (x) { return x.col; });
  const iFig = findIdxOr_(hdr, aliasColumna_('Figura'), true), iFecha = findIdxOr_(hdr, aliasColumna_('FECHA'), true);
  const clave = function (r) { const d = iFecha != null ? toDate_(r[iFecha]) : null; return (iFig != null ? normalizeText_(r[iFig]) : '') + '|' + (d ? ymd_(d) : ''); };
  let orden = datos.map(function (r, i) { return i; }).sort(function (a, b) {
    const ka = clave(datos[a]), kb = clave(datos[b]);
    return ka < kb ? -1 : ka > kb ? 1 : a - b;
  });
  let como = 'por Figura y FECHA';
  if (orden.filter(function (j, i) { return j !== i; }).length < 0.2 * datos.length) {
    orden = datos.map(function (r, i) { return datos.length - 1 - i; });
    como = 'al revés';
  }
  const movidas = orden.filter(function (j, i) { return j !== i; }).length;
  const desordenado = [hdr].concat(datos.map(function (r, i) {
    const fuente = datos[orden[i]];
    return r.map(function (v, k) { return sistema.indexOf(k) >= 0 ? v : fuente[k]; });
  }));
  const antes = leerEstadoGuardian_(null, bloque);
  const plan = planGuardian_(entradasDeEstadoGuardian_(antes), leerEstadoGuardian_(null, desordenado));
  return { como: como, movidas: movidas, plan: plan, frena: desalineacionGuardian_(plan), filas: detalleDesalineacionGuardian_(plan).length };
}
