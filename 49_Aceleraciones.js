/**
 * 49_Aceleraciones.js — las ACELERACIONES de la corrida de la hora (16/10, decisión del usuario). Configuración: 00_Config.js,
 * "Las ACELERACIONES de la corrida de la hora".
 *
 *   1. La HUELLA de una solapa que el sistema reescribe entera (las vistas del archivo "Agenda", la "Agenda" del archivo RDV y el
 *      tablero de Looker): el contenido se arma en memoria como siempre; si su huella es la de la última escritura, la solapa no
 *      se reescribe. Nunca se saltea algo que cambiaría un valor: la huella es de TODO lo que se escribiría (valores, links,
 *      colores por fila), salvo la hora de la corrida ("Última actualización", "FechaCarga").
 *   2. Los IDs de los encuentros cada IDS_CADA_HORAS horas (con la excepción de las reuniones que recién pasaron, sin ID).
 *
 * Nada de esto toca la base. Cualquier duda (sin la propiedad, un error al leerla) → se escribe / se corre, como antes.
 * Los que llaman lo hacen con `typeof … === 'function'`: sin este archivo (los tests viejos), todo como antes.
 */

// ===================== La huella =====================

/**
 * La huella de un valor (matriz, objeto): MD5 en base64 del JSON (las fechas, como su ISO). Sin Utilities.computeDigest (los
 * tests en Node), un hash propio de 64 bits: lo que importa es que dos contenidos iguales den lo mismo y dos distintos no.
 */
function huellaContenido_(valor) {
  const t = JSON.stringify(valor === undefined ? null : valor);
  try {
    if (typeof Utilities !== 'undefined' && typeof Utilities.computeDigest === 'function') {
      return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, t, Utilities.Charset.UTF_8));
    }
  } catch (e) { /* el de abajo */ }
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ t.length;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return 'j' + h1.toString(36) + '.' + h2.toString(36) + '.' + t.length.toString(36);
}

/** La matriz sin las columnas cuyo encabezado (fila 0) está en `nombres`. No cambia la original. */
function matrizSinColumnas_(m, nombres) {
  if (!m || !m.length) return m;
  const fuera = {};
  (m[0] || []).forEach(function (h, j) { if (nombres.indexOf(String(h)) >= 0) fuera[j] = true; });
  return m.map(function (r) { return r.filter(function (_, j) { return !fuera[j]; }); });
}

/**
 * ¿Se puede saltear la escritura de la solapa `clave`? true SÓLO si: `activa` (el interruptor), la huella guardada es `huella`
 * con la misma HUELLAS_VERSION, la escritura que la dejó fue hace menos de HUELLAS_REESCRIBIR_CADA_HORAS, y la solapa existe
 * con las filas y columnas que dejó esa escritura. Cualquier otra cosa (o un error) → false: se escribe.
 */
function huellaSinCambios_(clave, huella, sh, activa) {
  if (!activa || !sh || !huella) return false;
  try {
    const p = PropertiesService.getScriptProperties().getProperty(PROP_HUELLA_PREFIJO + clave);
    if (!p) return false;
    const g = JSON.parse(p);
    if (g.h !== huella || g.v !== HUELLAS_VERSION) return false;
    if (!(_ahoraHuella_() - g.t < HUELLAS_REESCRIBIR_CADA_HORAS * 3600000)) return false;
    return sh.getLastRow() === g.filas && sh.getLastColumn() === g.cols;
  } catch (e) { return false; }
}

/** Borra la huella ANTES de escribir: si la escritura se corta a la mitad, la próxima corrida no la saltea. */
function huellaOlvidar_(clave) {
  try { PropertiesService.getScriptProperties().deleteProperty(PROP_HUELLA_PREFIJO + clave); } catch (e) { /* no importa */ }
}

/** Guarda la huella DESPUÉS de una escritura completa, con las filas y columnas que quedaron en la solapa. */
function huellaGuardar_(clave, huella, sh) {
  if (!huella || !sh) return;
  try {
    PropertiesService.getScriptProperties().setProperty(PROP_HUELLA_PREFIJO + clave, JSON.stringify({
      h: huella, v: HUELLAS_VERSION, t: _ahoraHuella_(), filas: sh.getLastRow(), cols: sh.getLastColumn() }));
  } catch (e) { Logger.log('  (la huella de "%s" no se guardó: %s; la próxima corrida la reescribe)', clave, e); }
}

/** A mano: olvida todas las huellas (la próxima corrida reescribe todas las solapas). */
function olvidarHuellasVistas() {
  const props = PropertiesService.getScriptProperties();
  const claves = Object.keys(props.getProperties() || {}).filter(function (k) { return k.indexOf(PROP_HUELLA_PREFIJO) === 0; });
  claves.forEach(function (k) { props.deleteProperty(k); });
  Logger.log('Huellas olvidadas: %s. La próxima corrida reescribe esas solapas.', claves.length || 'ninguna');
  return claves.length;
}

function _ahoraHuella_() { return new Date().getTime(); }

/** Anota en la corrida (REGISTRO_CORRIDAS, columna sin_cambios) y en el log que la solapa no se reescribió. */
function _anotarSinCambios_(nombre) {
  Logger.log('  "%s": sin cambios desde la última escritura: no se reescribe (huella igual; se reescribe igual cada %s h).',
             nombre, HUELLAS_REESCRIBIR_CADA_HORAS);
  if (typeof corridaSinCambios_ === 'function') corridaSinCambios_(nombre);
}

/**
 * Las solapas de la copia de la agenda ("Agenda", "Agenda cerrada", "AgendaCall" y la "Agenda" del archivo RDV): la huella es la
 * de la matriz sin "Última actualización", más los links (ids) y lo que da el color de cada fila (`m.colores` / la semana en
 * curso). Sin cambios → refresca SÓLO "Última actualización" (una escritura de una columna) y devuelve { saltear: true }. Si no,
 * borra la huella vieja y devuelve { saltear: false, huella } para que quien escribe la guarde al terminar.
 */
function copiaAgendaSinCambios_(sh, clave, m) {
  const col = 'Última actualización';
  const huella = huellaContenido_({ k: 'copia-agenda', v: matrizSinColumnas_(m, [col]), ids: m.ids || null,
                                    colores: m.colores || null, enCurso: m.semanaEnCurso || null });
  if (!huellaSinCambios_(clave, huella, sh, VISTAS_AGENDA_SOLO_SI_CAMBIA)) {
    huellaOlvidar_(clave);
    return { saltear: false, huella: huella };
  }
  const j = (m[0] || []).indexOf(col);
  if (j >= 0 && m.length > 1) {
    try { sh.getRange(2, j + 1, m.length - 1, 1).setValues(m.slice(1).map(function (r) { return [r[j]]; })); }
    catch (e) { Logger.log('  "%s": no se pudo refrescar "%s": %s', clave, col, e); }
  }
  _anotarSinCambios_(clave.replace(/^[^|]*\|/, ''));
  return { saltear: true, huella: huella };
}

// ===================== Los IDs cada IDS_CADA_HORAS horas =====================

/**
 * Las reuniones de la base que los IDs ya tendrían que mirar: activas, que ya pasaron (FECHA anterior a hoy) y sin "ID cuentas".
 * Una clave corta por reunión (figura | fecha | barrio). null si no se puede saber (sin la base o sin la columna).
 */
function _pendientesIds_(dest) {
  if (!dest || !dest.filas || !dest.hdr) return null;
  const iId = findIdxOr_(dest.hdr, [COLUMNA_ID_CUENTAS], true);
  if (iId == null) return null;
  const hoy = ymd_(hoyMediodia_());
  const out = [];
  dest.filas.forEach(function (f) {
    if (!f.fecha || !(ymd_(f.fecha) < hoy) || !esFilaActiva_(f.fecha)) return;
    if (!esVacio_(f.valores[iId])) return;
    out.push(huellaContenido_([normalizeText_(f.figura), ymd_(f.fecha), normalizeText_(f.barrio)]).slice(0, 10));
  });
  return out;
}

/**
 * ¿Corren los IDs en esta corrida? `{ toca, porque, pend }`. Corren: sin IDS_SOLO_CADA_HORAS; la primera vez; si la última
 * corrida de los IDs fue hace IDS_CADA_HORAS horas o más (con el margen); o si la base tiene una reunión que ya pasó, sin ID,
 * que no estaba pendiente en la última corrida (la base ya está leída: el plan del cruce; sin él, sólo cuenta el horario).
 */
function idsTocaEnEstaCorrida_(dest, ahoraMs) {
  const ahora = ahoraMs || _ahoraHuella_();
  let pend = null;
  try { pend = _pendientesIds_(dest); } catch (e) { pend = null; }
  if (!IDS_SOLO_CADA_HORAS) return { toca: true, porque: 'cada corrida', pend: pend };
  let u = null;
  try { u = JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP_IDS_ULTIMA) || 'null'); } catch (e) { u = null; }
  if (!u || typeof u.t !== 'number') return { toca: true, porque: 'no hay registro de la última corrida de los IDs', pend: pend };
  const hace = ahora - u.t;
  if (hace >= IDS_CADA_HORAS * 3600000 - IDS_CADA_HORAS_MARGEN_MS) {
    return { toca: true, porque: 'pasaron ' + Math.round(hace / 60000) + ' min desde la última (cada ' + IDS_CADA_HORAS + ' h)', pend: pend };
  }
  if (pend && u.pend) {
    const antes = {};
    u.pend.forEach(function (k) { antes[k] = true; });
    const nuevas = pend.filter(function (k) { return !antes[k]; }).length;
    if (nuevas) return { toca: true, porque: nuevas + ' reunión(es) que ya pasaron, sin ID, nuevas desde la última corrida de los IDs', pend: pend };
  }
  return { toca: false, pend: pend,
           porque: 'cada ' + IDS_CADA_HORAS + ' h: la última fue hace ' + Math.round(hace / 60000) + ' min' +
                   (pend && u.pend ? ', y no hay reuniones nuevas que ya pasaron sin ID' : ' (sin la base leída: sólo el horario)') };
}

/** Después de una corrida de los IDs sin error: la hora y las reuniones pendientes de ese momento. */
function idsAnotarCorrida_(toca, ahoraMs) {
  try {
    PropertiesService.getScriptProperties().setProperty(PROP_IDS_ULTIMA, JSON.stringify({
      t: ahoraMs || _ahoraHuella_(), pend: toca && toca.pend ? toca.pend.slice(0, 600) : null }));
  } catch (e) { Logger.log('  (no se pudo anotar la corrida de los IDs: %s; la próxima los corre)', e); }
}
