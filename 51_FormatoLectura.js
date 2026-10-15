/**
 * 51_FormatoLectura.js — EL FORMATO PARA LEER de las solapas de reporte y de control (15/10, decisión del usuario).
 * Configuración: 00_Config.js, "El formato para leer".
 *
 * Las solapas que el sistema reescribe para que el equipo las lea o las controle (AGENDA_DUPLICADOS, IDS_SIN_CRUZAR,
 * AGENDA_PENDIENTES, AUDITORIA_AGENDA, EMPAREJAR_MANUAL, SIN_MATCH, HISTORICO_SIN_RESOLVER, AGENDA_FIGURA_A_COMPLETAR…)
 * quedaban con el ancho por defecto y el texto cortado. En CADA reescritura, después de los valores (`formatoLectura_`):
 *   - texto ajustado (wrap) en todas las celdas, alineado arriba a la izquierda;
 *   - la fila del encabezado en negrita, gris claro, congelada;
 *   - los anchos según el contenido: la columna que describe la reunión, bien ancha (FORMATO_ANCHO_DESCRIPCION); fechas y
 *     horas, angostas; figura / lugar / barrio, medianas; los textos largos, anchas; nunca menos de FORMATO_ANCHO_MIN;
 *   - ELEGIR y COMENTARIO (las columnas donde escribe una persona), resaltadas en el encabezado.
 * REVISAR_MATCH tiene su formato de fichas (27_RevisarFormato.js) y no pasa por acá. No toca la base: sólo solapas de
 * reporte. Si el formato falla, la solapa ya quedó escrita: sólo se loguea.
 */

/** ¿Esta solapa lleva el formato para leer? */
function llevaFormatoLectura_(nombre) {
  return FORMATO_LECTURA_ACTIVO && FORMATO_LECTURA_SOLAPAS.indexOf(String(nombre)) >= 0;
}

/**
 * El formato para leer de una solapa recién escrita. `matriz`: lo que se escribió (para medir sin volver a leer; si falta,
 * se lee). `opciones.filaEncabezado` (1 por defecto); `opciones.columnaDescripcion`: el índice (desde 0) de la columna
 * ancha, cuando el encabezado no la dice (15/10: AUDITORIA_AGENDA, "sección | texto").
 */
function formatoLectura_(sh, matriz, opciones) {
  if (!FORMATO_LECTURA_ACTIVO || !sh) return null;
  try {
    const o = opciones || {};
    const m = matriz && matriz.length ? matriz : sh.getDataRange().getValues();
    const nF = m.length, nC = m.reduce(function (x, r) { return Math.max(x, r.length); }, 0);
    if (!nF || !nC) return null;
    const fe = o.filaEncabezado || 1;
    const enc = (m[fe - 1] || []).map(function (v) { return str(v); });
    // todo: ajustado, arriba a la izquierda
    sh.getRange(1, 1, nF, nC).setWrap(true).setVerticalAlignment('top').setHorizontalAlignment('left');
    // el encabezado
    sh.getRange(fe, 1, 1, nC).setFontWeight('bold').setBackground(FORMATO_GRIS_ENCABEZADO);
    sh.setFrozenRows(fe);
    // las columnas donde escribe una persona, resaltadas
    enc.forEach(function (h, k) {
      if (/^(elegir|comentario)$/i.test(h)) sh.getRange(fe, k + 1).setBackground(FORMATO_RESALTE_ELEGIR);
    });
    // los anchos
    const desc = o.columnaDescripcion != null ? o.columnaDescripcion : columnaDescripcionLectura_(enc);
    const anchos = [];
    for (let k = 0; k < nC; k++) {
      const w = anchoColumnaLectura_(enc[k] || '', m.slice(fe).map(function (r) { return r[k]; }), k === desc);
      anchos.push(w);
      sh.setColumnWidth(k + 1, w);
    }
    return { columnas: nC, anchos: anchos, descripcion: desc };
  } catch (err) {
    Logger.log('>>> el formato para leer de "%s" no se aplicó: %s (la solapa quedó escrita)', sh.getName ? sh.getName() : '?', err);
    return null;
  }
}

/** La columna que describe la reunión (la más ancha): por su encabezado; si ninguno lo dice, la primera que no sea ELEGIR / COMENTARIO / resultado. */
function columnaDescripcionLectura_(enc) {
  for (let k = 0; k < enc.length; k++) {
    if (/reuni[oó]n|nombre_formulario|^formulario$|^evento|descripci|^info$/i.test(enc[k]) && !/^id_|fila/i.test(enc[k])) return k;
  }
  for (let k = 0; k < enc.length; k++) if (!/^(elegir|comentario|resultado)$/i.test(enc[k])) return k;
  return 0;
}

/** El ancho de una columna según su encabezado y su contenido (ver el encabezado del archivo). */
function anchoColumnaLectura_(h, vals, esDescripcion) {
  if (esDescripcion) return FORMATO_ANCHO_DESCRIPCION;
  if (/^(elegir)$/i.test(h)) return 170;
  if (/^(comentario)$/i.test(h)) return 220;
  const llenos = vals.filter(function (v) { return v !== '' && v != null; });
  const esFechaHora = function (v) {
    return v instanceof Date || /^\s*\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?(\s+\d{1,2}:\d{2})?\s*$/.test(String(v)) ||
           /^\s*\d{1,2}:\d{2}(:\d{2})?\s*(h|hs)?\s*$/i.test(String(v));
  };
  if (/fecha|^hora|^d[ií]a$|semana/i.test(h) || (llenos.length && llenos.every(esFechaHora))) return /semana/i.test(h) ? 130 : 95;
  if (/figura|lugar|barrio|comuna|direcci|grupo|implementador|origen/i.test(h)) return 160;
  const largo = llenos.slice(0, 200).reduce(function (x, v) { return Math.max(x, String(v).length); }, String(h).length);
  if (largo > 40) return FORMATO_ANCHO_TEXTO_LARGO;
  if (largo > 14) return 160;
  return Math.max(FORMATO_ANCHO_MIN, Math.min(110, 8 * largo + 20));
}
