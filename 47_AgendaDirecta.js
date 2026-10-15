/**
 * 47_AgendaDirecta.js — "AGENDA (MAIL)" CON EL FORMATO DE "AGENDA DIRECTA" (15/10, decisión del usuario). Configuración:
 * 00_Config.js, "Agenda (mail)" con el formato de "Agenda Directa". APAGADO: AGENDA_MAIL_FORMATO_DIRECTA = false.
 *
 * El equipo armó en el archivo "Agenda" su propia solapa, "Agenda Directa": Info | Implementador | CONVOCATORIA (Hecho, Ok Sol,
 * Programado, IVR) | CONFIRMACIÓN (Ok Sol, Programado) | POST (Ok Sol, Programado) | CANCELACIÓN (Ok Sol, Programado), con dos
 * renglones de encabezado combinados, los días combinados a lo ancho, un desplegable en Implementador y casillas en los grupos.
 *
 *   - **"Agenda Directa" es DEL EQUIPO**: el sistema sólo la LEE (para copiar su aspecto y, una vez, lo que ya cargaron). Nunca la
 *     escribe, protege, mueve, oculta ni borra (AGENDA_SOLAPAS_DEL_EQUIPO; ordenarSolapasAgenda_ no la corre de lugar).
 *   - **"Agenda (mail)" (la del sistema) toma ese formato** con el interruptor: en cada reescritura se lee "Agenda Directa" y se
 *     copian el encabezado (valores, combinaciones, colores, bordes: "pegar formato"), los anchos, el desplegable de
 *     Implementador (y las reglas de color que tenga esa columna), el estilo de los días y el tipo de cada columna (casilla /
 *     lista). Si "Agenda Directa" no está o no tiene esos encabezados, el diseño de respaldo (AGENDA_DIRECTA_RESPALDO). Las
 *     columnas se reconocen POR EL TEXTO (grupo + subcolumna), nunca por la letra. "Info" es la celda de la reunión (Evento /
 *     Hora / Lugar, con el naranja, el tachado y el color de su semana de siempre). La clave de cada reunión, en la columna
 *     "clave" (oculta) a la derecha.
 *   - **Lo que carga el equipo** en esas columnas se guarda en AGENDA_EQUIPO por la clave de la reunión (47_AgendaVistas.js,
 *     guardarEquipoAgenda_), como Responsable / Check 1 / Check 2, que se siguen guardando aparte (no se muestran en este formato
 *     y vuelven si se apaga el interruptor).
 *   - **Una sola vez**: copiar a AGENDA_EQUIPO lo que el equipo ya cargó en "Agenda Directa" (cada reunión por su texto de evento
 *     + el día → la clave de la reunión del sistema) y ocultar "Sugerencia - Equipo Directa" (no se borra):
 *     copiarAgendaDirectaEnSeco() / copiarAgendaDirecta().
 */

// ===================== El diseño: el de "Agenda Directa" o el de respaldo =====================

/** Los nombres de las columnas del equipo de 00_Config.js, en su orden. */
function idsDirecta_() { return AGENDA_DIRECTA_COLUMNAS.map(function (c) { return idColumnaEquipo_(c.grupo, c.sub); }); }

/**
 * El diseño que va a tener "Agenda (mail)": LEE "Agenda Directa" (sólo lectura: valores, combinaciones, validaciones, anchos,
 * reglas de formato) y, si no está o no tiene los encabezados esperados, arma el de respaldo.
 * → { fuente: 'directa'|'respaldo', motivo, hoja, filaEnc, nCols, colInfo, encabezado [f1, f2], merges [[r, c, nr, nc]] (en
 *     NUESTRO encabezado, renglones 1-2), columnas [{ col, id, grupo, sub, tipo, validacion }], anchos { col: px }, filaDia,
 *     reglas (las de formato condicional de "Agenda Directa" sobre Implementador) }
 */
function leerDisenoDirecta_(ss) {
  const dir = ss.getSheetByName(AGENDA_SOLAPA_DIRECTA);
  if (!dir) return disenoRespaldoDirecta_('no existe la solapa "' + AGENDA_SOLAPA_DIRECTA + '"');
  const fmt = formatoVistaMail_(dir);
  if (fmt.formato !== 'directa') return disenoRespaldoDirecta_('"' + AGENDA_SOLAPA_DIRECTA + '" no tiene el encabezado "' + AGENDA_DIRECTA_INFO + '"');
  const ids = fmt.columnas.map(function (c) { return c.id; });
  const faltan = idsDirecta_().filter(function (id) { return ids.indexOf(id) < 0; });
  if (faltan.length) return disenoRespaldoDirecta_('a "' + AGENDA_SOLAPA_DIRECTA + '" le faltan columnas: ' + faltan.join(', '));
  const n = fmt.nCols;
  const pad = function (f) { const o = []; for (let i = 0; i < n; i++) o.push(f && f[i] != null ? f[i] : ''); return o; };
  const tipoConfig = {};
  AGENDA_DIRECTA_COLUMNAS.forEach(function (c) { tipoConfig[idColumnaEquipo_(c.grupo, c.sub)] = c.tipo; });
  const D = { fuente: 'directa', motivo: '', hoja: dir, filaEnc: fmt.filaEnc, nCols: n, colInfo: fmt.colInfo,
              encabezado: [pad(fmt.encabezado[0]).map(str), pad(fmt.encabezado[1]).map(str)], merges: [], anchos: {}, filaDia: 0, reglas: [],
              columnas: fmt.columnas.map(function (c) { return { col: c.col, id: c.id, grupo: c.grupo, sub: c.sub, tipo: tipoConfig[c.id] || 'libre', validacion: null }; }) };
  // cada lectura opcional, aislada: si una falla, esa parte queda como el respaldo
  try {
    D.merges = dir.getRange(fmt.filaEnc, 1, 2, n).getMergedRanges().map(function (m) {
      return [m.getRow() - fmt.filaEnc + 1, m.getColumn(), m.getNumRows(), m.getNumColumns()];
    }).filter(function (m) { return m[0] >= 1 && m[0] + m[2] - 1 <= 2 && m[1] >= 1 && m[1] + m[3] - 1 <= n; });
  } catch (e) { D.avisos = (D.avisos || []).concat(['combinaciones: ' + e]); }
  if (!D.merges.length) D.merges = mergesEncabezadoDirecta_(D.colInfo, D.columnas);
  try { for (let c = 1; c <= n; c++) D.anchos[c] = dir.getColumnWidth(c); } catch (e) { D.avisos = (D.avisos || []).concat(['anchos: ' + e]); }
  const ur = dir.getLastRow();
  if (ur >= fmt.filaDatos) {
    let renglones = [];
    try { renglones = leerRenglonesVistaMail_(dir).renglones; } catch (e) { D.avisos = (D.avisos || []).concat(['renglones: ' + e]); }
    const dia = renglones.filter(function (r) { return r.tipo === 'dia'; })[0];
    if (dia) D.filaDia = dia.fila;
    const filasReunion = renglones.filter(function (r) { return r.tipo === 'reunion'; }).map(function (r) { return r.fila; });
    // 15/10 (revisión): el TIPO de cada columna sale de la validación REAL de "Agenda Directa", en los renglones de reunión. Una
    // casilla (con sus valores propios, si los tiene: "Sí" / "No"), un desplegable, o una columna de valor (fecha, texto, otra
    // validación o ninguna: se escribe tal cual, sin validación). Sólo si "Agenda Directa" todavía no tiene reuniones vale lo de
    // 00_Config.js. Implementador sin desplegable en "Agenda Directa" queda con el de las opciones (el usuario lo pidió así).
    if (filasReunion.length) {
      try {
        const dvs = dir.getRange(fmt.filaDatos, 1, ur - fmt.filaDatos + 1, n).getDataValidations();
        const C = SpreadsheetApp.DataValidationCriteria || {};
        D.columnas.forEach(function (col) {
          const dv = filasReunion.map(function (f) { return (dvs[f - fmt.filaDatos] || [])[col.col - 1]; }).filter(Boolean)[0];
          col.tipo = col.id === 'Implementador' ? 'lista' : 'libre';
          col.validacion = null; col.casilla = null;
          if (!dv) return;
          const t = dv.getCriteriaType();
          if (t === C.CHECKBOX) {
            col.tipo = 'casilla';
            let vals = [];
            try { vals = dv.getCriteriaValues() || []; } catch (e) { vals = []; }
            if (vals.length && vals[0] !== true && vals[0] != null && str(vals[0]) !== '') col.casilla = { si: vals[0], no: vals.length > 1 && vals[1] != null ? vals[1] : '' };
          } else if (t === C.VALUE_IN_LIST || t === C.VALUE_IN_RANGE) {
            col.tipo = 'lista'; col.validacion = dv;
          }
        });
      } catch (e) { D.avisos = (D.avisos || []).concat(['validaciones: ' + e]); }
    }
  }
  try {
    const impl = D.columnas.filter(function (c) { return c.id === 'Implementador'; })[0];
    D.reglas = (dir.getConditionalFormatRules() || []).filter(function (r) {
      return r.getRanges().some(function (g) { return g.getColumn() <= impl.col && g.getColumn() + g.getNumColumns() - 1 >= impl.col; });
    });
  } catch (e) { D.reglas = []; }
  return D;
}

/** El diseño de respaldo (sin "Agenda Directa", o si no coincide): Info | Implementador | los cuatro grupos, como dice 00_Config.js. */
function disenoRespaldoDirecta_(motivo) {
  const R = AGENDA_DIRECTA_RESPALDO;
  const f1 = [AGENDA_DIRECTA_INFO], f2 = [''], columnas = [], anchos = { 1: R.anchoInfo };
  AGENDA_DIRECTA_COLUMNAS.forEach(function (c, i) {
    const col = i + 2;
    f1.push(i > 0 && AGENDA_DIRECTA_COLUMNAS[i - 1].grupo === c.grupo ? '' : c.grupo); f2.push(c.sub || '');
    columnas.push({ col: col, id: idColumnaEquipo_(c.grupo, c.sub), grupo: c.grupo, sub: c.sub, tipo: c.tipo, validacion: null });
    anchos[col] = c.tipo === 'lista' ? R.anchoImplementador : R.anchoCasilla;
  });
  return { fuente: 'respaldo', motivo: motivo, hoja: null, filaEnc: 1, nCols: f1.length, colInfo: 1, encabezado: [f1, f2],
           merges: mergesEncabezadoDirecta_(1, columnas), columnas: columnas, anchos: anchos, filaDia: 0, reglas: [] };
}

/**
 * Las combinaciones de un encabezado de dos renglones (renglones 1-2 de la nuestra): Info y cada columna sin subcolumna, los dos
 * renglones; cada grupo de varias subcolumnas, el renglón 1 a lo ancho del grupo. → [[renglón, col, nRenglones, nCols]].
 */
function mergesEncabezadoDirecta_(colInfo, columnas) {
  const out = [[1, colInfo, 2, 1]];
  let i = 0;
  const cols = columnas.slice().sort(function (a, b) { return a.col - b.col; });
  while (i < cols.length) {
    const c = cols[i];
    if (!c.sub) { out.push([1, c.col, 2, 1]); i++; continue; }
    let j = i;
    while (j + 1 < cols.length && cols[j + 1].sub && cols[j + 1].grupo === c.grupo && cols[j + 1].col === cols[j].col + 1) j++;
    if (j > i) out.push([1, c.col, 1, j - i + 1]);
    i = j + 1;
  }
  return out;
}

// ===================== Escribir "Agenda (mail)" con ese formato (con AGENDA_MAIL_FORMATO_DIRECTA) =====================

/** Saca lo que deja cualquiera de los dos formatos (combinaciones, validaciones, columnas ocultas, reglas). Sólo en la nuestra. */
function limpiarVistaMailDirecta_(sh) {
  if (AGENDA_SOLAPAS_DEL_EQUIPO.indexOf(sh.getName()) >= 0) throw new Error('"' + sh.getName() + '" es una solapa del equipo: el sistema no la toca');
  const R = Math.max(sh.getMaxRows(), 1), C = Math.max(sh.getMaxColumns(), 1);
  sh.getRange(1, 1, R, C).breakApart();
  sh.getRange(1, 1, R, C).clearDataValidations();
  sh.showColumns(1, C);
  sh.setConditionalFormatRules([]);
}

/**
 * "Agenda (mail)" con el formato de "Agenda Directa". Lo del equipo YA está guardado (lo hizo escribirVistaMailAgenda_ antes de
 * llamar acá): `filas` trae, por reunión, sus `campos`. Encabezado en los renglones 1-2, los datos desde el 3, la clave oculta en
 * la columna siguiente a la última del equipo (y, en el respaldo, dos más allá, las opciones del desplegable).
 */
function escribirVistaMailDirecta_(ss, sh0, filas) {
  const D = leerDisenoDirecta_(ss);
  const sh = sh0 || insertarSolapaAgendaAlFinal_(ss, AGENDA_SOLAPA_VISTA_MAIL);
  if (AGENDA_SOLAPAS_DEL_EQUIPO.indexOf(sh.getName()) >= 0) throw new Error('"' + sh.getName() + '" es una solapa del equipo');
  const colClave = D.nCols + 1, colOpc = D.nCols + 3, F0 = 3;
  const impl = D.columnas.filter(function (c) { return c.id === 'Implementador'; })[0];
  // sin el desplegable de "Agenda Directa", el de siempre: desde una columna de opciones de la nuestra, que el equipo edita
  const usaOpciones = !!impl && !impl.validacion;
  // las opciones del respaldo: las que ya tenía la nuestra (si el equipo las cambió), si no AGENDA_RESPONSABLES
  let opciones = AGENDA_RESPONSABLES.slice();
  if (sh0 && usaOpciones) {
    const f0 = formatoVistaMail_(sh0);
    let o = [];
    if (f0.formato === 'directa' && f0.colClave && sh0.getLastColumn() >= f0.colClave + 2) {
      o = sh0.getRange(F0, f0.colClave + 2, AGENDA_MAIL_OPCIONES_FILAS, 1).getValues();
    } else if (f0.formato === 'viejo' && sh0.getLastColumn() >= AGENDA_MAIL_COL_OPCIONES) {
      o = sh0.getRange(2, AGENDA_MAIL_COL_OPCIONES, AGENDA_MAIL_OPCIONES_FILAS, 1).getValues();
    }
    o = o.map(function (r) { return str(r[0]); }).filter(Boolean);
    if (o.length) opciones = o;
  }
  // 1. limpiar (sólo la nuestra)
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (pr) {
    if (pr.getDescription() === DESC_PROTECCION_VISTA_MAIL || pr.getDescription() === DESC_PROTECCION_VISTA_MAIL_DIRECTA) pr.remove();
  });
  limpiarVistaMailDirecta_(sh);
  sh.clear();
  if (sh.getMaxColumns() < colOpc) sh.insertColumnsAfter(sh.getMaxColumns(), colOpc - sh.getMaxColumns());
  // 2. el encabezado: el formato de "Agenda Directa" (pegar formato: colores, letra, bordes, alineación), sus textos y sus combinaciones
  let copiado = false;
  if (D.fuente === 'directa') {
    try {
      D.hoja.getRange(D.filaEnc, 1, 2, D.nCols).copyTo(sh.getRange(1, 1, 2, D.nCols), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      sh.getRange(1, 1, 2, D.nCols).breakApart();
      copiado = true;
    } catch (e) { Logger.log('  "%s": el formato del encabezado de "%s" no se pudo copiar (%s): va el de respaldo.', AGENDA_SOLAPA_VISTA_MAIL, AGENDA_SOLAPA_DIRECTA, e); }
  }
  sh.getRange(1, 1, 2, D.nCols).setValues(D.encabezado);
  if (!copiado) _formatoEncabezadoRespaldo_(sh, D);
  D.merges.forEach(function (m) { sh.getRange(m[0], m[1], m[2], m[3]).merge(); });
  sh.getRange(1, colClave).setValue('clave');
  if (usaOpciones) {
    sh.getRange(1, colOpc).setValue('Implementadores (opciones)').setFontWeight('bold').setBackground(AGENDA_DIRECTA_RESPALDO.encabezadoFondo);
    sh.getRange(F0, colOpc, AGENDA_MAIL_OPCIONES_FILAS, 1).setValues(
      Array.apply(null, Array(AGENDA_MAIL_OPCIONES_FILAS)).map(function (_, i) { return [opciones[i] || '']; }));
  }
  sh.setFrozenRows(2);
  // 3. los renglones
  const n = filas.length, filasReunion = [], filasDia = [];
  filas.forEach(function (f, i) { (f.tipo === 'dia' ? filasDia : filasReunion).push(F0 + i); });
  if (n) {
    // "martes 13/10" queda TEXTO (Sheets no lo hace fecha). El texto del día va en la PRIMERA columna del renglón combinado (si
    // "Info" no es la A, en la columna de Info se perdería al combinar: Sheets sólo conserva la de arriba a la izquierda).
    sh.getRange(F0, D.colInfo, n, 1).setNumberFormat('@');
    if (D.colInfo !== 1 && filasDia.length) sh.getRangeList(filasDia.map(function (r) { return _a1_(r, 1); })).setNumberFormat('@');
    const casillasPor = {}, noEntran = [];                          // las casillas, por sus valores ("Sí"/"No" o TRUE/FALSE)
    const valores = filas.map(function (f, i) {
      const r = []; for (let c = 0; c < colClave; c++) r.push('');
      if (f.tipo === 'dia') { r[0] = f.texto; return r; }
      D.columnas.forEach(function (c) {
        const v = (f.campos || {})[c.id];
        const x = valorCeldaDirecta_(c, v);
        r[c.col - 1] = x.valor;
        if (x.casilla) { const k = JSON.stringify(c.casilla ? [c.casilla.si, c.casilla.no] : []); (casillasPor[k] = casillasPor[k] || []).push(_a1_(F0 + i, c.col)); }
        else if (x.noEntra) noEntran.push(_a1_(F0 + i, c.col) + ' (' + c.id + ': "' + str(v) + '")');
      });
      r[colClave - 1] = f.clave;
      return r;
    });
    Object.keys(casillasPor).forEach(function (k) {                   // las casillas antes de los valores
      const sv = JSON.parse(k), rl = sh.getRangeList(casillasPor[k]);
      if (sv.length) rl.insertCheckboxes(sv[0], sv[1]); else rl.insertCheckboxes();
    });
    if (noEntran.length) Logger.log('  AVISO "%s": %s valores guardados no son de casilla y quedaron como TEXTO (sin casilla, no se pierden): %s',
                                    AGENDA_SOLAPA_VISTA_MAIL, noEntran.length, noEntran.join('; '));
    sh.getRange(F0, 1, n, colClave).setValues(valores);
    filas.forEach(function (f, i) {
      if (f.tipo !== 'reunion') return;
      sh.getRange(F0 + i, D.colInfo).setRichTextValue(richTextReunionAgenda_(f.celda)).setBackground(f.color).setWrap(true).setVerticalAlignment('top');
    });
    // los días: el formato del primer día de "Agenda Directa" (o el de respaldo), combinados a lo ancho
    let diaCopiado = false;
    if (D.fuente === 'directa' && D.filaDia && filasDia.length) {
      try {
        filasDia.forEach(function (r) { D.hoja.getRange(D.filaDia, 1, 1, D.nCols).copyTo(sh.getRange(r, 1, 1, D.nCols), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false); });
        diaCopiado = true;
      } catch (e) { Logger.log('  "%s": el formato de los días de "%s" no se pudo copiar (%s): va el de respaldo.', AGENDA_SOLAPA_VISTA_MAIL, AGENDA_SOLAPA_DIRECTA, e); }
    }
    if (filasDia.length) {
      const rangos = filasDia.map(function (r) { return 'A' + r + ':' + _a1_(r, D.nCols); });
      if (!diaCopiado) sh.getRangeList(rangos).setBackground(AGENDA_DIRECTA_RESPALDO.diaFondo).setFontColor(AGENDA_DIRECTA_RESPALDO.diaLetra).setFontWeight('bold');
      filasDia.forEach(function (r) { const g = sh.getRange(r, 1, 1, D.nCols); g.breakApart(); g.merge(); });
    }
    // las validaciones: Implementador (el desplegable de "Agenda Directa", o las opciones), y las de cualquier otra columna
    if (filasReunion.length) {
      D.columnas.forEach(function (c) {
        let regla = null;
        if (c.validacion) regla = c.validacion.copy().build();
        else if (c === impl) regla = SpreadsheetApp.newDataValidation().requireValueInRange(sh.getRange(F0, colOpc, AGENDA_MAIL_OPCIONES_FILAS, 1), true).setAllowInvalid(true).build();
        if (regla) filasReunion.forEach(function (r) { sh.getRange(r, c.col).setDataValidation(regla); });
      });
      if (impl) {
        const rango = sh.getRange(F0, impl.col, n, 1);
        if (D.reglas.length) sh.setConditionalFormatRules(D.reglas.map(function (r) { return r.copy().setRanges([rango]).build(); }));
        else if (usaOpciones) sh.setConditionalFormatRules(opciones.map(function (o, i) {
          return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(o)
            .setBackground(AGENDA_COLORES_RESPONSABLE[i % AGENDA_COLORES_RESPONSABLE.length]).setRanges([rango]).build();
        }));
      }
    }
  }
  Object.keys(D.anchos).forEach(function (c) { if (D.anchos[c]) sh.setColumnWidth(+c, D.anchos[c]); });
  sh.hideColumns(colClave);
  // protegida con advertencia; libres: las columnas del equipo (de los datos) y, si las hay, las opciones
  const libres = D.columnas.map(function (c) { return sh.getRange(F0, c.col, Math.max(n, 1), 1); });
  if (usaOpciones) libres.push(sh.getRange(F0, colOpc, AGENDA_MAIL_OPCIONES_FILAS, 1));
  sh.protect().setDescription(DESC_PROTECCION_VISTA_MAIL_DIRECTA).setWarningOnly(true).setUnprotectedRanges(libres);
  Logger.log('  "%s" (formato "%s"; diseño %s%s): %s renglones (%s reuniones); lo del equipo, guardado en %s.', AGENDA_SOLAPA_VISTA_MAIL,
             AGENDA_SOLAPA_DIRECTA, D.fuente === 'directa' ? 'copiado de "' + AGENDA_SOLAPA_DIRECTA + '"' : 'de respaldo',
             D.motivo ? ' — ' + D.motivo : '', n, filasReunion.length, RDV_HOJA_AGENDA_EQUIPO);
  return filas;
}

/**
 * Lo que va en una celda del equipo, según el tipo de su columna. **Un valor guardado nunca se convierte en `false`**:
 *   casilla   true / false ('' o nada) o, con valores propios, "Sí" / "No" → la casilla; cualquier otra cosa (un texto, una fecha)
 *             NO es de casilla: va como TEXTO, sin casilla (`noEntra`, se avisa en el log) y sigue guardado tal cual;
 *   lista / libre  el valor tal cual (fecha, texto); `false` (una casilla sin marcar de antes) es "nada cargado": vacía.
 * → { valor, casilla (poner la casilla), noEntra }
 */
function valorCeldaDirecta_(col, v) {
  if (col.tipo === 'casilla') {
    const si = col.casilla ? col.casilla.si : true, no = col.casilla ? col.casilla.no : false;
    if (v === true || (col.casilla && v === si)) return { valor: si, casilla: true };
    if (v == null || v === false || v === '' || (col.casilla && v === no)) return { valor: no, casilla: true };
    if (col.casilla && str(v) === str(si)) return { valor: si, casilla: true };
    if (col.casilla && str(v) === str(no)) return { valor: no, casilla: true };
    return { valor: v instanceof Date ? v : str(v), casilla: false, noEntra: true };
  }
  if (v == null || v === false) return { valor: '', casilla: false };
  return { valor: v, casilla: false };
}

/** El encabezado del respaldo: gris, negrita, centrado, con bordes; cada grupo con su color. */
function _formatoEncabezadoRespaldo_(sh, D) {
  const R = AGENDA_DIRECTA_RESPALDO;
  sh.getRange(1, 1, 2, D.nCols).setFontWeight('bold').setBackground(R.encabezadoFondo).setFontColor(R.encabezadoLetra)
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setBorder(true, true, true, true, true, true);
  D.columnas.forEach(function (c) {
    const fondo = R.grupoFondo[c.grupo];
    if (fondo) sh.getRange(1, c.col, 2, 1).setBackground(fondo);
  });
}

/** La celda de una reunión como texto enriquecido: lo cambiado en naranja y negrita; lo desaparecido, tachado en gris. */
function richTextReunionAgenda_(celda) {
  let b = SpreadsheetApp.newRichTextValue().setText(celda.texto);
  if (celda.tachada) {
    b = b.setTextStyle(0, celda.texto.length, SpreadsheetApp.newTextStyle().setStrikethrough(true).setForegroundColor(AGENDA_COLOR_DESAPARECIDA).build());
  } else {
    celda.naranja.forEach(function (x) {
      b = b.setTextStyle(x.desde, x.hasta, SpreadsheetApp.newTextStyle().setBold(true).setForegroundColor(AGENDA_COLOR_CAMBIO).build());
    });
  }
  return b.build();
}

/** Lo del equipo de una reunión en una línea, para los logs: "Implementador: Lu | CONVOCATORIA ☑Hecho ☐Ok Sol …". */
function textoEquipoDirecta_(campos) {
  campos = campos || {};
  const partes = [], grupos = {};
  AGENDA_DIRECTA_COLUMNAS.forEach(function (c) {
    const v = campos[idColumnaEquipo_(c.grupo, c.sub)];
    if (!c.sub) { partes.push(c.grupo + ': ' + (_hayValorEquipo_(v) ? str(v) : '—')); return; }
    if (!grupos[c.grupo]) { grupos[c.grupo] = []; partes.push(grupos[c.grupo]); grupos[c.grupo].grupo = c.grupo; }
    grupos[c.grupo].push((v === true ? '☑' : _hayValorEquipo_(v) ? '[' + str(v) + ']' : '☐') + c.sub);
  });
  return partes.map(function (p) { return Array.isArray(p) ? p.grupo + ' ' + p.join(' ') : p; }).join(' | ');
}

// ===================== En seco: el diseño que saldría (D2) =====================

/**
 * **EN SECO** (no escribe nada, en ningún archivo): cómo quedaría "Agenda (mail)" con el formato de "Agenda Directa". En el log:
 * si "Agenda Directa" está y coincide (qué columna encontró y en qué letra, el desplegable, el estilo de los días, los anchos) o
 * por qué va el respaldo; el encabezado que saldría (renglones 1 y 2, las combinaciones, la clave); y las reuniones que hoy
 * tiene "Agenda (mail)" en ese formato, con lo guardado del equipo. Y cuántas tienen Responsable / Check 1 / Check 2.
 */
function vistaMailDirectaEnSeco() {
  Logger.log('=== "%s" con el formato de "%s" — EN SECO: no escribe nada (AGENDA_MAIL_FORMATO_DIRECTA = %s) ===',
             AGENDA_SOLAPA_VISTA_MAIL, AGENDA_SOLAPA_DIRECTA, AGENDA_MAIL_FORMATO_DIRECTA);
  const ss = SpreadsheetApp.openById(AGENDA_COPIA_SS);
  const D = leerDisenoDirecta_(ss);
  const letra = function (c) { return _a1_(1, c).replace(/\d+$/, ''); };
  if (D.fuente === 'directa') {
    Logger.log('  "%s": ENCONTRADA y coincide (encabezado en los renglones %s y %s). Se copia su aspecto.', AGENDA_SOLAPA_DIRECTA, D.filaEnc, D.filaEnc + 1);
  } else {
    Logger.log('  DISEÑO DE RESPALDO: %s.', D.motivo);
  }
  Logger.log('  %s → columna %s (ancho %s)', AGENDA_DIRECTA_INFO, letra(D.colInfo), D.anchos[D.colInfo] || '—');
  D.columnas.forEach(function (c) {
    let v = '';
    if (c.validacion) {
      try {
        const vals = c.validacion.getCriteriaValues() || [];
        v = vals[0] && typeof vals[0].getA1Notation === 'function' ? 'desplegable desde ' + vals[0].getA1Notation() : 'desplegable: ' + [].concat(vals[0] || []).join(', ');
      } catch (e) { v = 'con validación'; }
    } else if (c.tipo === 'casilla') v = 'casilla';
    else if (c.tipo === 'lista') v = 'desplegable desde las opciones (columna ' + letra(D.nCols + 3) + '): ' + AGENDA_RESPONSABLES.join(', ');
    else v = 'libre';
    Logger.log('  %s → columna %s | %s | ancho %s', c.id, letra(c.col), v, D.anchos[c.col] || '—');
  });
  (D.avisos || []).forEach(function (a) { Logger.log('  AVISO (se usa el respaldo para eso): %s', a); });
  Logger.log('  los días: %s; combinados de %s a %s', D.filaDia ? 'con el formato del renglón ' + D.filaDia + ' de "' + AGENDA_SOLAPA_DIRECTA + '"'
             : 'fondo ' + AGENDA_DIRECTA_RESPALDO.diaFondo + ', letra ' + AGENDA_DIRECTA_RESPALDO.diaLetra + ', negrita', letra(1), letra(D.nCols));
  const usaOpciones = D.columnas.some(function (c) { return c.id === 'Implementador' && !c.validacion; });
  Logger.log('  reglas de color de Implementador: %s', D.reglas.length ? D.reglas.length + ' copiadas de "' + AGENDA_SOLAPA_DIRECTA + '"' : (usaOpciones ? 'una por opción (como hoy)' : 'ninguna'));
  Logger.log('--- el encabezado que saldría ---');
  Logger.log('  renglón 1: %s', D.encabezado[0].map(function (x) { return x || '·'; }).join(' | '));
  Logger.log('  renglón 2: %s', D.encabezado[1].map(function (x) { return x || '·'; }).join(' | '));
  Logger.log('  combinadas: %s', D.merges.map(function (m) { return _a1_(m[0], m[1]) + ':' + _a1_(m[0] + m[2] - 1, m[1] + m[3] - 1); }).join(', '));
  Logger.log('  la clave: columna %s (oculta)%s; los datos desde el renglón 3; protegida con advertencia, libres las columnas del equipo',
             letra(D.nCols + 1), usaOpciones ? '; las opciones de Implementador: columna ' + letra(D.nCols + 3) : '');
  // las reuniones de hoy, en ese formato
  const sh = ss.getSheetByName(AGENDA_SOLAPA_VISTA_MAIL);
  let guardados = {};
  try { guardados = leerEquipoGuardado_(); } catch (e) { Logger.log('  AVISO: %s no se pudo leer (%s)', RDV_HOJA_AGENDA_EQUIPO, e); }
  const r = sh ? leerRenglonesVistaMail_(sh) : { renglones: [], formato: { formato: '' } };
  Logger.log('--- las reuniones que hoy tiene "%s" (formato %s), como quedarían (las primeras 40 líneas) ---', AGENDA_SOLAPA_VISTA_MAIL,
             r.formato.formato || 'no reconocido');
  r.renglones.slice(0, 40).forEach(function (x) {
    if (x.tipo === 'dia') { Logger.log('  ■■■ %s ■■■', str(x.texto).toUpperCase()); return; }
    const g = (guardados[x.clave] && guardados[x.clave].campos) || {};
    const campos = Object.assign({}, g, x.campos);
    Logger.log('  %s   ‖ %s', str(x.texto).replace(/\n/g, ' / '), textoEquipoDirecta_(campos));
  });
  const viejos = Object.keys(guardados).filter(function (k) {
    const c = guardados[k].campos;
    return CAMPOS_EQUIPO_VIEJOS_.some(function (n) { return _hayValorEquipo_(c[n]); });
  }).length;
  Logger.log('  Responsable / Check 1 / Check 2: %s reuniones con algo cargado en %s. NO se muestran en este formato; se siguen ' +
             'guardando y vuelven si se apaga el interruptor.', viejos, RDV_HOJA_AGENDA_EQUIPO);
  Logger.log('  "%s" y "%s" (del equipo): no se tocan.', AGENDA_SOLAPA_DIRECTA, AGENDA_SOLAPA_SUGERENCIA_DIRECTA);
  return { fuente: D.fuente, motivo: D.motivo, columnas: D.columnas.map(function (c) { return c.id; }), encabezado: D.encabezado,
           renglones: r.renglones.length };
}

// ===================== Una sola vez: lo que el equipo ya cargó en "Agenda Directa" (D3) y ocultar la sugerencia (D4) =====================

/** **EN SECO**: qué copiaría de "Agenda Directa" a AGENDA_EQUIPO (y a qué reunión), lo que no puede cruzar y por qué. No escribe. */
function copiarAgendaDirectaEnSeco() { return _copiarAgendaDirecta_(false); }

/**
 * **ESCRIBE, UNA VEZ** (al pasar al formato nuevo): copia a AGENDA_EQUIPO lo que el equipo cargó en "Agenda Directa" (sólo en
 * reuniones que en AGENDA_EQUIPO no tienen nada en esa columna: lo que ya está no se pisa) y oculta "Sugerencia - Equipo
 * Directa" (no la borra). "Agenda Directa" sólo se lee. Con el bloqueo de la corrida de la hora (no pisa una corrida a la vez).
 */
function copiarAgendaDirecta() { return _copiarAgendaDirecta_(true); }

/** El texto del evento de una celda de reunión (la línea "Evento:", o la primera), comparable. */
function eventoCeldaDirecta_(texto) {
  const lineas = str(texto).split(/\r?\n/).map(str).filter(Boolean);
  let l = lineas.filter(function (x) { return /^[*\s]*evento\s*:/i.test(x); })[0] || lineas[0] || '';
  l = l.replace(/^[*\s]*evento\s*:\s*/i, '');
  return normalizeText_(l).replace(/[*"'“”.,;:()]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** La hora de una celda de reunión (la línea "Hora:"), o ''. */
function horaCeldaDirecta_(texto) {
  const l = str(texto).split(/\r?\n/).filter(function (x) { return /^[*\s]*hora\s*:/i.test(x); })[0];
  return l ? _horaAgenda_(l) : '';
}

/** El lugar de una celda de reunión (la línea "Lugar:"), comparable; '' si no hay. */
function lugarCeldaDirecta_(texto) {
  const l = str(texto).split(/\r?\n/).filter(function (x) { return /^[*\s]*lugar\s*:/i.test(x); })[0];
  return l ? normalizeText_(l.replace(/^[*\s]*lugar\s*:\s*/i, '')).replace(/[*"'“”.,;:()]/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

/**
 * ¿Pueden ser el mismo lugar? Sin lugar de un lado, sí (no se compara). Con comuna de los dos lados, la misma comuna. Si no, el
 * mismo texto, uno dentro del otro, o la mitad de las palabras (de 3 letras o más) en común. '' si coinciden; si no, el motivo.
 */
function _lugarDistintoDirecta_(a, b) {
  if (!a || !b) return '';
  const ca = typeof detectComuna_ === 'function' ? detectComuna_(a) : null, cb = typeof detectComuna_ === 'function' ? detectComuna_(b) : null;
  if (ca != null && cb != null) return ca === cb ? '' : 'lugar distinto (Comuna ' + ca + ' / Comuna ' + cb + ')';
  if (a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return '';
  const pa = a.split(' ').filter(function (w) { return w.length >= 3; }), pb = b.split(' ').filter(function (w) { return w.length >= 3; });
  const comunes = pa.filter(function (w) { return pb.indexOf(w) >= 0; }).length;
  return pa.length && pb.length && comunes / Math.min(pa.length, pb.length) >= 0.5 ? '' : 'lugar distinto ("' + a + '" / "' + b + '")';
}

/**
 * Las reuniones del sistema contra las que se cruza: las de "Agenda (mail)" (con su clave, su día y su celda) y, para las semanas
 * que ya no están en la vista, las de AGENDA_EQUIPO (su "reunión" es "evento — HH:mm" y su fecha; sin lugar).
 */
function candidatosDirecta_(renglonesNuestros, guardados) {
  const out = [], vistas = {};
  renglonesNuestros.forEach(function (r) {
    if (r.tipo !== 'reunion' || !r.clave || !r.fecha) return;
    vistas[r.clave] = true;
    out.push({ clave: r.clave, fecha: r.fecha, evento: eventoCeldaDirecta_(r.texto), hora: horaCeldaDirecta_(r.texto), lugar: lugarCeldaDirecta_(r.texto),
               texto: str(r.texto).split(/\r?\n/)[0], origen: '"' + AGENDA_SOLAPA_VISTA_MAIL + '" renglón ' + r.fila });
  });
  Object.keys(guardados || {}).forEach(function (k) {
    if (vistas[k]) return;
    const g = guardados[k], f = toDate_(g.fecha);
    if (!f || !g.reunion) return;
    const p = str(g.reunion).split(' — ');
    out.push({ clave: k, fecha: f, evento: eventoCeldaDirecta_(p[0]), hora: p[1] ? _horaAgenda_(p[1]) : '', lugar: '', texto: p[0],
               origen: RDV_HOJA_AGENDA_EQUIPO });
  });
  return out;
}

/**
 * El plan de la copia (sin Sheets: lo prueban los tests). Cada reunión de "Agenda Directa" con algo cargado se cruza con UNA
 * reunión del sistema del MISMO DÍA (15/10, revisión: nunca con una de otra hora o de otro lugar):
 *   - descartadas antes de todo: si las dos tienen hora y es distinta ("hora distinta"); si las dos tienen lugar y es otro
 *     ("lugar distinto": otra comuna, u otra dirección);
 *   - de las que quedan, el MISMO texto de evento, y una sola;
 *   - si no hay ninguna con el mismo texto: una que contenga al otro texto (o al revés), sólo si la hora COINCIDE (o ninguna de las
 *     dos la tiene), y una sola. Un "Encuentro con Vecinos" genérico ya no cae en la única reunión que lo contiene.
 * Lo que no cruza, con el motivo. Por campo: se copia si en AGENDA_EQUIPO está vacío; si ya tiene lo mismo, "ya estaba"; si
 * tiene OTRA cosa, no se pisa (conflicto).
 * → { copias: [{ renglon, cand, como, campos, ya, conflictos }], sinCruce: [{ renglon, motivo }], vacias, enVista, info }
 */
function planCopiaDirecta_(renglonesDirecta, candidatos, guardados) {
  const out = { copias: [], sinCruce: [], vacias: 0, enVista: {}, info: {} };
  const usadas = {};
  renglonesDirecta.forEach(function (r) {
    if (r.tipo !== 'reunion') return;
    const cargado = Object.keys(r.campos).filter(function (n) { return _hayValorEquipo_(r.campos[n]); });
    if (!cargado.length) { out.vacias++; return; }
    if (!r.fecha) { out.sinCruce.push({ renglon: r, motivo: 'no tiene un renglón de día arriba (no se sabe la fecha)' }); return; }
    const ev = eventoCeldaDirecta_(r.texto), hora = horaCeldaDirecta_(r.texto), lugar = lugarCeldaDirecta_(r.texto);
    const delDia = candidatos.filter(function (c) { return ymd_(c.fecha) === ymd_(r.fecha); });
    if (!delDia.length) { out.sinCruce.push({ renglon: r, motivo: 'el sistema no tiene ninguna reunión el ' + fmtFecha_(r.fecha) }); return; }
    const descartes = [];
    const posibles = delDia.filter(function (x) {
      if (hora && x.hora && hora !== x.hora) { descartes.push({ x: x, por: 'hora distinta (aquí ' + hora + ', el sistema ' + x.hora + ')' }); return false; }
      const dl = _lugarDistintoDirecta_(lugar, x.lugar);
      if (dl) { descartes.push({ x: x, por: dl }); return false; }
      return true;
    });
    let c = posibles.filter(function (x) { return x.evento && x.evento === ev; }), como = 'mismo evento';
    if (!c.length && ev.length >= 8) {
      c = posibles.filter(function (x) {
        const mismaHora = (hora && x.hora && hora === x.hora) || (!hora && !x.hora);
        return mismaHora && x.evento.length >= 8 && (x.evento.indexOf(ev) >= 0 || ev.indexOf(x.evento) >= 0);
      });
      como = 'evento parecido (uno contiene al otro) y la misma hora';
    }
    const lista = delDia.map(function (x) { return '"' + x.texto + '"' + (x.hora ? ' ' + x.hora : ''); }).join('; ');
    if (!c.length) {
      const mismoEv = descartes.filter(function (d) { return d.x.evento === ev; });
      out.sinCruce.push({ renglon: r, motivo: mismoEv.length ? mismoEv.map(function (d) { return d.por; }).join('; ') + ' (ese día: ' + lista + ')'
                                                             : 'ninguna reunión del sistema con ese evento ese día (ese día: ' + lista + ')' });
      return;
    }
    if (c.length > 1) { out.sinCruce.push({ renglon: r, motivo: 'AMBIGUA: ' + c.length + ' reuniones del sistema con ese evento ese día (' + lista + ')' }); return; }
    const cand = c[0];
    if (usadas[cand.clave]) { out.sinCruce.push({ renglon: r, motivo: 'esa reunión del sistema ya la toma el renglón ' + usadas[cand.clave] + ' de "' + AGENDA_SOLAPA_DIRECTA + '"' }); return; }
    usadas[cand.clave] = r.fila;
    const g = (guardados[cand.clave] && guardados[cand.clave].campos) || {};
    const copia = { renglon: r, cand: cand, como: como, campos: {}, ya: [], conflictos: [] };
    cargado.forEach(function (n) {
      const v = r.campos[n], antes = g[n];
      if (!_hayValorEquipo_(antes)) copia.campos[n] = v;
      else if (antes === v || str(antes) === str(v) || (antes instanceof Date && v instanceof Date && ymd_(antes) === ymd_(v))) copia.ya.push(n);
      else copia.conflictos.push(n + ' (en "' + AGENDA_SOLAPA_VISTA_MAIL + '": ' + str(antes) + '; en "' + AGENDA_SOLAPA_DIRECTA + '": ' + str(v) + ')');
    });
    out.copias.push(copia);
    if (Object.keys(copia.campos).length) {
      out.enVista[cand.clave] = { campos: copia.campos };
      out.info[cand.clave] = { reunion: guardados[cand.clave] && guardados[cand.clave].reunion ? '' : cand.texto, fecha: '' };
    }
  });
  return out;
}

function _copiarAgendaDirecta_(escribe) {
  Logger.log('=== copiar lo que el equipo cargó en "%s" a %s (%s) ===', AGENDA_SOLAPA_DIRECTA, RDV_HOJA_AGENDA_EQUIPO,
             escribe ? 'ESCRIBE: AGENDA_EQUIPO (intermedia) y oculta "' + AGENDA_SOLAPA_SUGERENCIA_DIRECTA + '"' : 'EN SECO: no escribe nada');
  const ss = SpreadsheetApp.openById(AGENDA_COPIA_SS);
  const dir = ss.getSheetByName(AGENDA_SOLAPA_DIRECTA);
  const out = { copiadas: 0, campos: 0, sinCruce: 0, conflictos: 0, sugerencia: '' };
  let lock = null;
  if (escribe) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(ESPERA_BLOQUEO_MS)) { Logger.log('>>> otra corrida tiene el bloqueo: no se hizo nada. Volver a correr en un rato.'); out.error = 'bloqueo'; return out; }
  }
  try {
    if (!dir) { Logger.log('  "%s" NO EXISTE: no hay nada que copiar.', AGENDA_SOLAPA_DIRECTA); }
    else {
      const hoy = hoyMediodia_();
      const rd = leerRenglonesVistaMail_(dir, hoy);
      if (rd.formato.formato !== 'directa') {
        Logger.log('  "%s": no se reconoce el encabezado (falta "%s"): no se copia nada.', AGENDA_SOLAPA_DIRECTA, AGENDA_DIRECTA_INFO);
        out.error = 'encabezado';
      } else {
        const ids = rd.formato.columnas.map(function (c) { return c.id; });
        Logger.log('  "%s": columnas del equipo encontradas: %s', AGENDA_SOLAPA_DIRECTA, ids.join(' | '));
        const faltan = idsDirecta_().filter(function (id) { return ids.indexOf(id) < 0; });
        if (faltan.length) Logger.log('  AVISO: no tiene %s (eso no se copia; lo demás sí).', faltan.join(', '));
        const guardados = leerEquipoGuardado_();
        const nuestra = ss.getSheetByName(AGENDA_SOLAPA_VISTA_MAIL);
        // lo que hoy tiene "Agenda (mail)" cuenta como guardado (como en la corrida de la hora: manda la vista, campo por campo)
        // (el lector seguro: si no se reconocen las columnas de la vista, TIRA y no se copia nada; mejor eso que perder lo cargado)
        const vistaHoy = nuestra ? leerEquipoVistaMailSeguro_(nuestra) : {};
        const efectivos = {};
        Object.keys(guardados).forEach(function (k) { efectivos[k] = { campos: Object.assign({}, guardados[k].campos), reunion: guardados[k].reunion, fecha: guardados[k].fecha }; });
        Object.keys(vistaHoy).forEach(function (k) {
          efectivos[k] = efectivos[k] || { campos: {}, reunion: '', fecha: '' };
          Object.assign(efectivos[k].campos, vistaHoy[k].campos);
        });
        // una casilla con valores propios ("Sí" / "No") sin marcar es "nada cargado", de los dos lados
        const Dd = leerDisenoDirecta_(ss), sinMarcar = {};
        Dd.columnas.forEach(function (c) { if (c.casilla) sinMarcar[c.id] = str(c.casilla.no); });
        const desmarcar = function (campos) {
          Object.keys(sinMarcar).forEach(function (id) { if (campos && campos[id] != null && typeof campos[id] !== 'boolean' && str(campos[id]) === sinMarcar[id]) campos[id] = false; });
        };
        rd.renglones.forEach(function (r) { desmarcar(r.campos); });
        Object.keys(efectivos).forEach(function (k) { desmarcar(efectivos[k].campos); });
        const cands = candidatosDirecta_(nuestra ? leerRenglonesVistaMail_(nuestra, hoy).renglones : [], guardados);
        const P = planCopiaDirecta_(rd.renglones, cands, efectivos);
        Logger.log('  reuniones del sistema para cruzar: %s | renglones de "%s" con algo cargado: %s (sin nada: %s)', cands.length,
                   AGENDA_SOLAPA_DIRECTA, P.copias.length + P.sinCruce.length, P.vacias);
        P.copias.forEach(function (c) {
          const que = Object.keys(c.campos).map(function (n) { return n + ' = ' + (c.campos[n] === true ? '☑' : c.campos[n] instanceof Date ? fmtFecha_(c.campos[n]) : str(c.campos[n])); });
          Logger.log('  %s renglón %s (%s | %s) → %s (%s; %s, %s)%s%s%s', escribe ? 'COPIADO' : 'COPIARÍA', c.renglon.fila, fmtFecha_(c.renglon.fecha),
                     str(c.renglon.texto).split(/\r?\n/)[0], c.cand.clave, c.cand.texto, c.como, c.cand.origen,
                     que.length ? ': ' + que.join('; ') : ': nada nuevo', c.ya.length ? ' | ya estaba: ' + c.ya.join(', ') : '',
                     c.conflictos.length ? ' | NO SE PISA: ' + c.conflictos.join('; ') : '');
          out.campos += que.length; out.conflictos += c.conflictos.length;
          if (que.length) out.copiadas++;
        });
        P.sinCruce.forEach(function (s) {
          Logger.log('  SIN CRUCE renglón %s (%s | %s): %s', s.renglon.fila, s.renglon.fecha ? fmtFecha_(s.renglon.fecha) : 'sin día',
                     str(s.renglon.texto).split(/\r?\n/)[0] || '(Info vacía)', s.motivo);
        });
        out.sinCruce = P.sinCruce.length;
        if (escribe && Object.keys(P.enVista).length) {
          const enVista = {};
          Object.keys(vistaHoy).forEach(function (k) { enVista[k] = { campos: Object.assign({}, vistaHoy[k].campos) }; });
          Object.keys(P.enVista).forEach(function (k) {
            enVista[k] = enVista[k] || { campos: {} };
            Object.assign(enVista[k].campos, P.enVista[k].campos);
          });
          guardarEquipoAgenda_(guardados, enVista, P.info);
          // si "Agenda (mail)" YA tiene el formato nuevo, lo copiado va también a sus celdas (vacías: lo verificó el plan); si no,
          // la próxima reescritura leería esas celdas vacías y, como manda la vista, borraría lo copiado
          const fn = nuestra ? formatoVistaMail_(nuestra) : null;
          if (fn && fn.formato === 'directa') {
            const filaDe = {};
            leerRenglonesVistaMail_(nuestra, hoy).renglones.forEach(function (x) { if (x.tipo === 'reunion' && x.clave) filaDe[x.clave] = x.fila; });
            let celdas = 0;
            Object.keys(P.enVista).forEach(function (k) {
              if (!filaDe[k]) return;
              Object.keys(P.enVista[k].campos).forEach(function (n) {
                const c = fn.columnas.filter(function (x) { return x.id === n; })[0];
                if (c) { nuestra.getRange(filaDe[k], c.col).setValue(P.enVista[k].campos[n]); celdas++; }
              });
            });
            Logger.log('>>> "%s" (ya con el formato nuevo): %s celdas completadas con lo copiado.', AGENDA_SOLAPA_VISTA_MAIL, celdas);
          }
          Logger.log('>>> %s: %s reuniones con %s valores copiados de "%s". Aparecen en "%s" en la próxima reescritura (con el formato nuevo prendido).',
                     RDV_HOJA_AGENDA_EQUIPO, out.copiadas, out.campos, AGENDA_SOLAPA_DIRECTA, AGENDA_SOLAPA_VISTA_MAIL);
        } else {
          Logger.log('  %s: %s reuniones, %s valores para copiar%s.', escribe ? 'nada que escribir en ' + RDV_HOJA_AGENDA_EQUIPO : 'resumen',
                     out.copiadas, out.campos, escribe ? '' : ' (en seco: no se escribe)');
        }
      }
    }
    out.sugerencia = ocultarSugerenciaDirecta_(ss, escribe);
  } finally { if (lock) lock.releaseLock(); }
  return out;
}

/** D4: "Sugerencia - Equipo Directa", OCULTA (no se borra). Una sola vez (con copiarAgendaDirecta), nunca en la corrida de la hora. */
function ocultarSugerenciaDirecta_(ss, escribe) {
  const sh = ss.getSheetByName(AGENDA_SOLAPA_SUGERENCIA_DIRECTA);
  if (!sh) { Logger.log('  "%s": no existe (nada que ocultar).', AGENDA_SOLAPA_SUGERENCIA_DIRECTA); return 'no existe'; }
  if (sh.isSheetHidden()) { Logger.log('  "%s": ya está oculta.', AGENDA_SOLAPA_SUGERENCIA_DIRECTA); return 'ya oculta'; }
  if (!escribe) { Logger.log('  "%s": la OCULTARÍA (no se borra).', AGENDA_SOLAPA_SUGERENCIA_DIRECTA); return 'ocultaría'; }
  try {
    sh.hideSheet();
    Logger.log('>>> "%s": oculta (no se borró; se muestra desde el menú Ver → Hojas ocultas).', AGENDA_SOLAPA_SUGERENCIA_DIRECTA);
    return 'oculta';
  } catch (err) {
    Logger.log('>>> "%s" NO se pudo ocultar: %s', AGENDA_SOLAPA_SUGERENCIA_DIRECTA, err);
    return 'error: ' + err;
  }
}
