/**
 * 46_Guardian.js — EL GUARDIÁN DE LAS COLUMNAS DEL SISTEMA (09/10; decisión del usuario; CLAUDE.md, sección 0, "La cuarta
 * excepción"). Configuración: 00_Config.js, "El guardián". Estado: docs/ESTADO.md, 0.z. APAGADO: GUARDIAN_ACTIVO = false.
 *
 * El equipo ORDENA y BORRA filas de la base, pero las columnas del sistema no pueden quedar modificadas. La protección real
 * no sirve (bloquea ordenar y borrar), así que:
 *   1. las técnicas (sólo de traza: GUARDIAN_OCULTAR) se OCULTAN;
 *   2. TODAS las del sistema (traza, agenda, IDs y las derivadas) llevan PROTECCIÓN CON ADVERTENCIA y el encabezado gris;
 *   3. en la corrida de la hora, ANTES de escribir nada, el guardián compara las columnas del sistema (traza, agenda e IDs:
 *      las "guardadas"; las derivadas no, se recalculan) contra su COPIA (SISTEMA_COPIA, intermedia), que se toma al final
 *      de cada corrida:
 *      - lo que cambió sin que lo cambiara el sistema, se RESTAURA (REGISTRO_PROTECCION);
 *      - si alguien ordenó sólo algunas columnas (DESALINEACIÓN: la huella figura + fecha de la fila ya no es la de su
 *        traza), las del sistema se REUBICAN en la fila que tiene su huella;
 *      - si no se puede reubicar sin ambigüedad, esa corrida NO ESCRIBE NADA EN LA BASE (con filas corridas, cualquier
 *        escritura —que va por número de fila— puede caer en la fila de otra reunión) y lo avisa en grande;
 *      - una fila que el equipo borró se respeta: la copia la da de baja.
 *
 * La copia vale para RESTAURAR sólo si es FRESCA: tomada al final de una corrida prendida hace menos de
 * GUARDIAN_COPIA_MAX_MS, y sin escrituras del sistema después (un paso a mano: el 57, la agenda a mano, un deshacer; las
 * escrituras dejan su sello, `_selloEscrituraSistema_`, sólo con el guardián prendido). Con una copia VIEJA (o la del paso
 * 59, o la de antes de un apagado) no restaura —no sabría quién cambió qué—, pero sí busca la DESALINEACIÓN: si la hay,
 * frena (sin escribir nada) y avisa. Al final de la corrida, la copia nueva se toma sólo si la base no está desalineada
 * respecto de la anterior (un orden parcial hecho MIENTRAS corría no queda grabado).
 *
 * Cómo encuentra la fila de cada entrada de la copia (la clave: agenda_uid o RDV_UID; la huella: figura + fecha; el
 * desempate: barrio | hora | evento) — revisado el 09/10 (el revisor del punto 3c):
 *   A.  la clave está en una fila con la misma huella → en su lugar;
 *   A2. la misma huella y los mismos valores en una sola fila libre → en su lugar;
 *   A3. la clave en una sola fila libre con el mismo desempate y una huella que no reclama ninguna otra entrada → el equipo
 *       cambió figura o fecha (reprogramación, un intercambio de fechas): la clave manda;
 *   B.  sin clave: la misma fila de la copia, con la misma huella → en su lugar;
 *   C.  la huella en UNA sola fila libre, con el mismo desempate (o los mismos valores) → ahí (reubicada). Con otro desempate,
 *       en varias filas, o dos entradas para la misma fila → AMBIGUA (frena la corrida);
 *   D.  la huella ya no está: la clave en una sola fila libre, los mismos valores, o una sola fila de huella nueva con el
 *       mismo desempate → ahí; si no, borrada (o no localizada: esas filas no se tocan; con una desalineación, frena).
 * Una fila libre (que no es de ninguna entrada) no tiene nada del sistema: lo que tenga en esas columnas se limpia (una
 * fila copiada y pegada con su RDV_UID, o algo tipeado en una fila nueva).
 */

// ===================== Las columnas =====================

/**
 * Las columnas del sistema de la base, por encabezado: `guardadas` (traza, agenda e IDs: se copian y se restauran) y
 * `derivadas` (sólo se protegen: se recalculan cada hora). `[{ canon, nombre, col (0-based) }]`.
 */
function columnasGuardian_(hdr) {
  const out = { guardadas: [], derivadas: [] };
  const vistas = {};
  const add = function (lista, canon, c) {
    if (c == null || vistas[c]) return;
    vistas[c] = true;
    lista.push({ canon: canon, nombre: str(hdr[c]), col: c });
  };
  COLUMNAS_TRAZA.concat(COLUMNAS_AGENDA).forEach(function (n) { add(out.guardadas, n, findIdxOr_(hdr, [n], true)); });
  COLUMNAS_IDS.forEach(function (n) { add(out.guardadas, n, findIdxOr_(hdr, IDS_ALIAS_COLUMNAS[n] || [n], true)); });
  columnasDerivadas_().forEach(function (n) { add(out.derivadas, n, findIdxOr_(hdr, [n], true)); });
  return out;
}

/** ¿El encabezado es de una columna guardada? (lo usa la escritura del guardián para negarse a cualquier otra) */
function esColumnaGuardada_(nombre) {
  const n = normalizeHeader_(nombre);
  if (!n) return false;
  const lista = COLUMNAS_TRAZA.concat(COLUMNAS_AGENDA);
  COLUMNAS_IDS.forEach(function (c) { (IDS_ALIAS_COLUMNAS[c] || [c]).forEach(function (a) { lista.push(a); }); });
  return lista.some(function (c) { return normalizeHeader_(c) === n; });
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

/**
 * ¿La copia sirve para restaurar? Tiene hora (la del paso 59 no: la toma fresca la primera corrida prendida), no es más vieja
 * que GUARDIAN_COPIA_MAX_MS (con el guardián apagado un rato, las corridas escribieron sin sello) y el sistema no escribió
 * después. `{ ok, porque }`.
 */
function copiaFrescaGuardian_(copia) {
  const tEsc = Number(PropertiesService.getScriptProperties().getProperty(PROP_GUARDIAN_ESCRITURA) || 0);
  if (!copia.hora) return { ok: false, porque: 'es la del paso 59, o no tiene hora' };
  if (Date.now() - copia.hora > GUARDIAN_COPIA_MAX_MS) return { ok: false, porque: 'tiene más de ' + Math.round(GUARDIAN_COPIA_MAX_MS / 60000) + ' minutos' };
  if (tEsc > copia.hora) return { ok: false, porque: 'el sistema escribió en la base después de tomarla (un paso a mano)' };
  return { ok: true, porque: '' };
}

/**
 * Toma la copia al final de una corrida, SÓLO si la base no está desalineada respecto de la copia anterior (un orden parcial
 * hecho mientras corría no queda grabado: la corrida siguiente lo ve y frena). Devuelve las filas copiadas, o null.
 */
function tomarCopiaSiAlineada_() {
  const sh = hojaDestinoGuardian_(), estado = leerEstadoGuardian_(sh), anterior = leerCopiaSistema_();
  if (anterior) {
    const p = planGuardian_(anterior.entradas, estado);
    if (p.reubicadas.length || p.ambiguas.length) {
      Logger.log('>>> ### EL GUARDIÁN NO TOMA LA COPIA: la base quedó desalineada mientras corría (reubicaría %s filas, ambiguas %s). ' +
                 'La corrida siguiente lo ve y frena. ###', p.reubicadas.length, p.ambiguas.length);
      return null;
    }
  }
  return tomarCopiaSistema_(estado);
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
  const filas = e.filas.filter(function (f) { return f.huella || f.clave || Object.keys(f.valores).length; }).map(function (f) {
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
 * Qué hay que restaurar, reubicar o limpiar para que las columnas guardadas vuelvan a ser las de la copia. Puro.
 * Devuelve `{ cambios: [{ fila, canon, col, puesto, valor, tipo, entrada }], reubicadas: [{ fila, desde, clave, huella }],
 * huellaCambiada, ambiguas: [{ entrada, filas, motivo }], noLocalizadas, borradas, frenar, filasTocadas }`.
 * tipo: 'restaurada' (en su lugar o con la huella cambiada), 'reubicada' (la fila tiene la huella de la entrada y la clave
 * estaba en otra), 'limpiada' (una fila que no es de ninguna entrada).
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
  // C: la huella en una sola fila libre (sólo las entradas con valores: una sin valores no tiene nada que reubicar)
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
  // Los cambios: cada fila, a lo de su entrada; una fila libre, a nada
  const tocadas = {};
  filas.forEach(function (f) {
    if (noTocar[f.fila]) return;
    const e = asignada[f.fila], d = e ? destino.get(e) : null;
    const quiero = e ? e.valores : {};
    const desde = e && e.clave && d.como === 'por_huella' ? (porClave[e.clave] || []).map(function (x) { return x.fila; }).filter(function (n) { return n !== f.fila; }) : [];
    const tipo = !e ? 'limpiada' : (d.como === 'por_huella' && (desde.length || !e.clave) ? 'reubicada' : 'restaurada');
    let n = 0;
    cols.forEach(function (c) {
      const ahora = f.valores[c.canon], valor = quiero[c.canon];
      if (_normGuardian_(ahora) === _normGuardian_(valor)) return;
      out.cambios.push({ fila: f.fila, canon: c.canon, col: c.col, puesto: ahora === undefined ? '' : ahora,
                         valor: valor === undefined ? '' : valor, tipo: tipo, entrada: e || null });
      n++;
    });
    if (n) tocadas[f.fila] = tipo;
    if (n && tipo === 'reubicada') out.reubicadas.push({ fila: f.fila, desde: desde.join(', ') || '¿?', clave: e.clave, huella: e.huella, celdas: n });
  });
  out.filasTocadas = tocadas;
  return out;
}

// ===================== En la corrida de la hora =====================

/**
 * **El guardián, antes de escribir nada** (lo llama `_correrUpsertConBloqueo_` con GUARDIAN_ACTIVO). Lee la base y la
 * copia; si la copia es fresca, restaura / reubica / limpia (en seco: sólo lo dice) y lo registra. Devuelve `{ frenar }`:
 * con una desalineación ambigua, la corrida no escribe nada más en la base.
 */
function guardianAntesDeEscribir_(enSeco) {
  const t0 = Date.now();
  Logger.log('=== el guardián de las columnas del sistema (%s) ===', enSeco ? 'EN SECO' : 'antes de escribir');
  const sh = hojaDestinoGuardian_();
  const estado = leerEstadoGuardian_(sh);
  const copia = leerCopiaSistema_();
  if (!copia) {
    Logger.log('  no hay copia (%s): no hay con qué comparar; la toma el final de esta corrida.', RDV_HOJA_SISTEMA_COPIA);
    return { sinCopia: true, frenar: false, resumen: 'sin copia' };
  }
  const p = planGuardian_(copia.entradas, estado);
  const fresca = copiaFrescaGuardian_(copia);
  if (!fresca.ok) {
    // VIEJA: no se restaura (no se sabe quién cambió qué), pero una desalineación se ve igual: frena y avisa
    const desal = p.reubicadas.length || p.ambiguas.length || p.noLocalizadas.length;
    Logger.log('  la copia es VIEJA (%s): no se restaura nada esta vez%s', fresca.porque,
               desal ? '.' : '; la corrida vuelve a tomar la copia.');
    if (desal) {
      logPlanGuardian_(p, estado, 40);
      Logger.log('  ### Y LA BASE PARECE DESALINEADA (reubicaría %s filas, ambiguas %s, no localizadas %s): con la copia vieja no ' +
                 'se arregla sola. ESTA CORRIDA NO ESCRIBE NADA EN LA BASE. Mirar las filas y volver la base al orden de antes. ###',
                 p.reubicadas.length, p.ambiguas.length, p.noLocalizadas.length);
      if (!enSeco) { try { registrarProteccion_({ cambios: [], reubicadas: [], ambiguas: p.ambiguas.concat(p.reubicadas.map(function (r) {
        return { entrada: { huella: r.huella, clave: r.clave }, filas: [r.fila], motivo: 'desalineada, con la copia vieja (no se reubicó)' }; })) }, null); }
        catch (err) { Logger.log('>>> No se pudo escribir %s: %s', RDV_HOJA_REGISTRO_PROTECCION, err); } }
    }
    return { vieja: true, frenar: !!desal, plan: p, resumen: 'copia vieja (' + fresca.porque + ')' + (desal ? ': DESALINEADA → no se escribió nada' : ': no comparó') };
  }
  logPlanGuardian_(p, estado, 40);
  let w = null;
  // si frena, no escribe nada: ni siquiera las filas que sí podría arreglar (un arreglo a medias es peor)
  if (!enSeco && p.cambios.length && !p.frenar) {
    w = escribirGuardianLote_(sh, estado.hdr, p.cambios.map(function (c) {
      return { fila: c.fila, col: c.col + 1, valor: c.valor, puesto: c.puesto };
    }));
    Logger.log('>>> el guardián escribió %s celdas (%s no: alguien las cambió mientras corría).', w.hechas.length, w.saltadas.length);
  }
  if (!enSeco) {
    try { registrarProteccion_(p, w || { hechas: [] }); }
    catch (err) { Logger.log('>>> No se pudo escribir %s: %s', RDV_HOJA_REGISTRO_PROTECCION, err); }
  }
  const resumen = 'restauradas ' + p.cambios.filter(function (c) { return c.tipo === 'restaurada'; }).length +
                  ' | reubicadas ' + p.reubicadas.length + ' filas | limpiadas ' + p.cambios.filter(function (c) { return c.tipo === 'limpiada'; }).length +
                  ' | ambiguas ' + p.ambiguas.length + (p.frenar ? ' → FRENÓ: no se escribió nada en la base' : '');
  Logger.log('[guardián] %s (%s ms)', resumen, Date.now() - t0);
  return { frenar: p.frenar, plan: p, escritas: w ? w.hechas.length : 0, resumen: resumen };
}

/** El log del plan: los números, los avisos en grande y hasta `tope` líneas de cada cosa. */
function logPlanGuardian_(p, estado, tope) {
  const n = function (t) { return p.cambios.filter(function (c) { return c.tipo === t; }); };
  const rest = n('restaurada'), limp = n('limpiada');
  Logger.log('  columnas guardadas: %s | filas en la base: %s | restaurar %s celdas | reubicar %s filas | limpiar %s celdas | ' +
             'ambiguas %s | no localizadas %s | borradas por el equipo %s | figura o fecha cambiada %s',
             estado.cols.guardadas.length, estado.filas.length, rest.length, p.reubicadas.length, limp.length, p.ambiguas.length,
             p.noLocalizadas.length, p.borradas.length, p.huellaCambiada.length);
  if (p.reubicadas.length) {
    Logger.log('  ################################################################################################');
    Logger.log('  ### DESALINEACIÓN: alguien ordenó sólo algunas columnas. Se reubican las del sistema en %s filas.', p.reubicadas.length);
    Logger.log('  ### Para ordenar: Datos → Ordenar hoja, o vistas de filtro. Nunca ordenar sólo algunas columnas.');
    Logger.log('  ################################################################################################');
    p.reubicadas.slice(0, tope).forEach(function (r) { Logger.log('    fila %s ← lo de la fila %s (%s, %s celdas)', r.fila, r.desde, r.huella, r.celdas); });
    if (p.reubicadas.length > tope) Logger.log('    (y %s más)', p.reubicadas.length - tope);
  }
  if (p.ambiguas.length) {
    Logger.log('  ################################################################################################');
    Logger.log('  ### DESALINEACIÓN QUE NO SE PUEDE REUBICAR SIN AMBIGÜEDAD (%s entradas): ESTA CORRIDA NO ESCRIBE NADA EN LA BASE.', p.ambiguas.length);
    Logger.log('  ### Volver la base al orden de antes (Edición → Deshacer, o el historial de versiones) o corregir a mano esas filas.');
    Logger.log('  ################################################################################################');
    p.ambiguas.slice(0, tope).forEach(function (a) { Logger.log('    %s (%s): filas %s — %s', a.entrada.huella, a.entrada.clave || 'sin clave', a.filas.join(', '), a.motivo); });
  }
  rest.slice(0, tope).forEach(function (c) { Logger.log('    restaurar fila %s, %s: "%s" → "%s"', c.fila, c.canon, _txtGuardian_(c.puesto), _txtGuardian_(c.valor)); });
  if (rest.length > tope) Logger.log('    (y %s restauraciones más)', rest.length - tope);
  const filasRest = {};
  rest.concat(limp).forEach(function (c) { filasRest[c.fila] = true; });
  if (Object.keys(filasRest).length >= GUARDIAN_MUCHAS_FILAS) {
    Logger.log('  ### MUCHAS FILAS (%s) con columnas del sistema cambiadas a mano: ¿alguien ordenó o movió columnas del sistema? ' +
               'Se restauran. Para ordenar: Datos → Ordenar hoja, o vistas de filtro. ###', Object.keys(filasRest).length);
  }
  limp.slice(0, tope).forEach(function (c) { Logger.log('    limpiar fila %s, %s: "%s" (la fila no tenía nada del sistema)', c.fila, c.canon, _txtGuardian_(c.puesto)); });
  p.noLocalizadas.slice(0, tope).forEach(function (a) { Logger.log('    no localizada: %s (%s): filas %s — %s (no se tocan)', a.entrada.huella, a.entrada.clave || 'sin clave', a.filas.join(', '), a.motivo); });
  p.huellaCambiada.slice(0, tope).forEach(function (h) { Logger.log('    fila %s: figura o fecha cambiada por el equipo (%s → %s): se acepta', h.fila, h.antes, h.ahora); });
}

function _txtGuardian_(v) { return v instanceof Date ? Utilities.formatDate(v, RDV_TZ, 'dd/MM/yyyy HH:mm') : String(v === undefined ? '' : v); }

const GUARDIAN_ENCABEZADO_REGISTRO_ = ['hora', 'qué', 'fila', 'columna', 'valor puesto', 'valor restaurado', 'detalle'];

/** REGISTRO_PROTECCION: una línea por celda restaurada o limpiada, una por fila reubicada y una por entrada ambigua. */
function registrarProteccion_(p, w) {
  const hechas = w ? new Set(w.hechas.map(function (e) { return e.fila + ':' + e.col; })) : null;
  const ahora = new Date(), filas = [];
  p.cambios.forEach(function (c) {
    if (c.tipo === 'reubicada') return;
    if (hechas && !hechas.has(c.fila + ':' + (c.col + 1))) return;
    filas.push([ahora, c.tipo, c.fila, c.canon, _txtGuardian_(c.puesto), _txtGuardian_(c.valor), c.entrada ? c.entrada.huella : 'fila sin nada del sistema']);
  });
  if (!p.frenar) p.reubicadas.forEach(function (r) { filas.push([ahora, 'REUBICADA (desalineación)', r.fila, r.celdas + ' celdas', '', '', 'lo de la fila ' + r.desde + ' (' + r.huella + ')']); });
  p.ambiguas.forEach(function (a) { filas.push([ahora, 'AMBIGUA: no se escribió nada en la base', a.filas.join(', '), '', '', '', a.entrada.huella + ' — ' + a.motivo]); });
  if (!filas.length) return 0;
  const ss = ssIntermedia_();
  let sh = ss.getSheetByName(RDV_HOJA_REGISTRO_PROTECCION);
  if (!sh) { sh = ss.insertSheet(RDV_HOJA_REGISTRO_PROTECCION); sh.appendRow(GUARDIAN_ENCABEZADO_REGISTRO_); sh.setFrozenRows(1); }
  const desde = sh.getLastRow() + 1, hasta = desde + filas.length - 1;
  if (hasta > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), hasta - sh.getMaxRows());
  sh.getRange(desde, 1, filas.length, GUARDIAN_ENCABEZADO_REGISTRO_.length).setValues(filas);
  return filas.length;
}

// ===================== Ocultar, proteger y la primera copia (pasos 58 y 59) =====================

/**
 * Qué falta para que las columnas del sistema queden ocultas (las técnicas), protegidas con advertencia (todas) y con el
 * encabezado gris. Sólo lee. `{ sh, hdr, ocultar: [...], proteger: [...], gris: [...], todas }`.
 */
function faltaOcultarProteger_() {
  const sh = hojaDestinoGuardian_();
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const cols = columnasGuardian_(hdr), todas = cols.guardadas.concat(cols.derivadas);
  const ocultar = GUARDIAN_OCULTAR.map(function (n) { return { n: n, c: findIdxOr_(hdr, [n], true) }; })
    .filter(function (x) { return x.c != null && !(sh.isColumnHiddenByUser && sh.isColumnHiddenByUser(x.c + 1)); });
  const prot = sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).map(function (p) {
    const r = p.getRange();
    return { desde: r.getColumn(), hasta: r.getLastColumn(), fila1: r.getRow(), fila2: r.getLastRow() };
  });
  const ultima = Math.max(2, sh.getLastRow());
  const proteger = todas.filter(function (x) {
    const c = x.col + 1;
    return !prot.some(function (p) { return p.desde <= c && c <= p.hasta && p.fila1 <= 2 && p.fila2 >= ultima; });
  });
  const fondos = sh.getRange(1, 1, 1, sh.getLastColumn()).getBackgrounds()[0];
  const gris = todas.filter(function (x) { return String(fondos[x.col] || '').toLowerCase() !== GUARDIAN_GRIS_ENCABEZADO.toLowerCase(); });
  return { sh: sh, hdr: hdr, ocultar: ocultar, proteger: proteger, gris: gris, todas: todas };
}

/**
 * **Paso 58 — EN SECO**: qué ocultaría, protegería y restauraría, sin tocar nada. Y, en memoria, la prueba de la
 * desalineación: si alguien ordenara HOY sólo las columnas del equipo, qué haría el guardián (reubicar / frenar).
 */
function guardianEnSeco() {
  Logger.log('=== paso 58 — el guardián EN SECO (no escribe nada: ni la base, ni la intermedia) ===');
  const f = faltaOcultarProteger_();
  const letra = function (c) { return _a1_(1, c + 1).replace(/\d+$/, ''); };
  Logger.log('--- 1. OCULTARÍA %s columnas técnicas: %s', f.ocultar.length, f.ocultar.map(function (x) { return letra(x.c) + ' ' + x.n; }).join(' | ') || '— (ya están ocultas)');
  Logger.log('--- 2. PROTEGERÍA con advertencia %s de las %s columnas del sistema: %s', f.proteger.length, f.todas.length,
             f.proteger.map(function (x) { return letra(x.col) + ' ' + x.nombre; }).join(' | ') || '— (ya están protegidas)');
  Logger.log('    y pondría el encabezado gris en %s (sólo la fila 1). Las del equipo no se tocan.', f.gris.length);
  const estado = leerEstadoGuardian_(f.sh);
  const copia = leerCopiaSistema_();
  Logger.log('--- 3. RESTAURARÍA (contra la copia de %s) ---', RDV_HOJA_SISTEMA_COPIA);
  if (!copia) Logger.log('  no hay copia todavía: la toma el paso 59; hasta entonces no hay nada que restaurar (la base de HOY es la referencia).');
  else {
    const tEsc = Number(PropertiesService.getScriptProperties().getProperty(PROP_GUARDIAN_ESCRITURA) || 0);
    Logger.log('  copia del %s%s', Utilities.formatDate(new Date(copia.hora || 0), RDV_TZ, 'dd/MM HH:mm'), tEsc > copia.hora ? ' — VIEJA (el sistema escribió después): la corrida no compararía' : '');
    logPlanGuardian_(planGuardian_(copia.entradas, estado), estado, 40);
  }
  // la prueba de la desalineación, en memoria: la copia de hoy y la base con sólo las columnas del equipo ordenadas
  const bloque = f.sh.getRange(1, 1, f.sh.getLastRow(), f.sh.getLastColumn()).getValues();
  const prueba = pruebaDesalineacionGuardian_(bloque);
  Logger.log('--- 4. LA PRUEBA (en memoria): si alguien ordenara HOY sólo las columnas del equipo %s (%s filas cambian de lugar)', prueba.como, prueba.movidas);
  Logger.log('  el guardián reubicaría %s filas, restauraría %s celdas, limpiaría %s, ambiguas %s → %s; y después la base quedaría %s',
             prueba.plan.reubicadas.length, prueba.restauradas, prueba.limpiadas, prueba.plan.ambiguas.length,
             prueba.plan.frenar ? 'FRENA la corrida' : 'sigue la corrida', prueba.quedaIgual ? 'IGUAL a la de hoy en las columnas del sistema' : 'DISTINTA: mirar el log');
  // 6: las filas que hoy no cuadran (diagnostico/27_guardian.js): el guardián NO las toca, la primera copia las toma como están
  let alin = null;
  try {
    alin = alineacionBase_(armarDestino_(f.sh, RDV_HOJA_DESTINO, bloque));
    Logger.log('--- 5. las filas cuyas trazas no cuadran HOY: %s de %s con traza (el guardián no las toca: la primera copia las toma como están)',
               alin.noCuadran.length, alin.trazadas);
    alin.noCuadran.forEach(function (x) { Logger.log('    fila %s (%s, %s): %s', x.fila, x.figura || 'sin figura', x.fecha ? fmtFecha_(x.fecha) : 'sin fecha', x.motivos.join('; ')); });
  } catch (err) { Logger.log('--- 5. no se pudo medir la alineación: %s', err); }
  return { ocultar: f.ocultar.length, proteger: f.proteger.length, gris: f.gris.length, hayCopia: !!copia, prueba: prueba,
           noCuadran: alin ? alin.noCuadran : null };
}

/**
 * La prueba de la desalineación EN MEMORIA: una copia de `bloque` (la base) y el mismo bloque con sólo las columnas del
 * equipo ordenadas (las del sistema quietas). Devuelve el plan del guardián y si, aplicado, las columnas del sistema
 * vuelven a ser las de la copia (cada huella con lo suyo).
 */
function pruebaDesalineacionGuardian_(bloque) {
  const hdr = bloque[0], datos = bloque.slice(1);
  const cols = columnasGuardian_(hdr);
  const sistema = cols.guardadas.concat(cols.derivadas).map(function (x) { return x.col; });
  const iFig = findIdxOr_(hdr, aliasColumna_('Figura'), true), iFecha = findIdxOr_(hdr, aliasColumna_('FECHA'), true);
  const clave = function (r) { const d = toDate_(r[iFecha]); return normalizeText_(r[iFig]) + '|' + (d ? ymd_(d) : ''); };
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
  const entradas = antes.filas.map(function (f) { return { clave: f.clave, huella: f.huella, fila: f.fila, valores: f.valores, desempate: f.desempate }; });
  const despues = leerEstadoGuardian_(null, desordenado);
  const plan = planGuardian_(entradas, despues);
  // aplicar el plan en memoria y comparar, por huella, contra la copia
  const arreglado = desordenado.map(function (r) { return r.slice(); });
  if (!plan.frenar) plan.cambios.forEach(function (c) { arreglado[c.fila - 1][c.col] = c.valor; });
  const fin = leerEstadoGuardian_(null, arreglado);
  const porHuella = {};
  antes.filas.forEach(function (f) { if (f.huella) porHuella[f.huella] = (porHuella[f.huella] || []).concat([f]); });
  const quedaIgual = !plan.frenar && fin.filas.every(function (f) {
    const l = porHuella[f.huella];
    return !l || l.length !== 1 || _mismosValoresGuardian_(f.valores, l[0].valores, antes.cols.guardadas);
  });
  return { como: como, movidas: movidas, plan: plan, quedaIgual: quedaIgual,
           restauradas: plan.cambios.filter(function (c) { return c.tipo === 'restaurada'; }).length,
           limpiadas: plan.cambios.filter(function (c) { return c.tipo === 'limpiada'; }).length };
}

/**
 * **Paso 59 — ESCRIBE (formato, no valores)**: oculta las técnicas, protege con advertencia todas las del sistema, pone su
 * encabezado gris y toma la primera copia. Ningún valor ni fondo de datos cambia. Después: GUARDIAN_ACTIVO = true.
 */
function guardianPreparar() {
  Logger.log('=== paso 59 — el guardián: ocultar, proteger y la primera copia ===');
  const f = faltaOcultarProteger_(), sh = f.sh;
  f.ocultar.forEach(function (x) { sh.hideColumns(x.c + 1); });
  f.proteger.forEach(function (x) {
    const l = _a1_(1, x.col + 1).replace(/\d+$/, '');
    sh.getRange(l + ':' + l).protect().setDescription(DESC_PROTECCION_SISTEMA).setWarningOnly(true);
  });
  if (f.gris.length) sh.getRangeList(f.gris.map(function (x) { return _a1_(1, x.col + 1); })).setBackground(GUARDIAN_GRIS_ENCABEZADO);
  Logger.log('>>> ocultas %s | protegidas con advertencia %s | encabezado gris %s (de %s columnas del sistema).', f.ocultar.length,
             f.proteger.length, f.gris.length, f.todas.length);
  const n = tomarCopiaSistema_(leerEstadoGuardian_(sh));
  // sin hora: hasta prenderlo corren horas que escriben sin sello; la primera corrida prendida no restaura contra ésta
  // (sólo mira la desalineación) y toma la copia fresca al final
  PropertiesService.getScriptProperties().deleteProperty(PROP_GUARDIAN_COPIA);
  Logger.log('>>> primera copia: %s filas (sirve para ver una desalineación; la que restaura la toma la primera corrida prendida). ' +
             'Ahora: GUARDIAN_ACTIVO = true + clasp push.', n);
  return { ocultas: f.ocultar.length, protegidas: f.proteger.length, gris: f.gris.length, copia: n };
}
