/**
 * diagnostico/10_mal_escritas.js — PASO 18: lo que el sistema escribió MAL desde el 02/10, y cómo se
 * deshace.
 *
 * --- Qué pasó ---
 * Desde que `B` es un `QUERY` sobre `Hoja1` (02/10), sus encabezados son los del origen
 * (`inscriptos_M`, `inscriptos_identificados`, `inscriptos_edades_18_24`…). El upsert los buscaba con
 * los nombres viejos, como opcionales, y al no encontrarlos calculó con ceros:
 *   - Masculinos y Femeninos: identificados = 0 → '' → no se escribieron;
 *   - las 5 bandas: columna no encontrada → '' → no se escribieron;
 *   - **Sin identificar = Inscriptos − 0 = Inscriptos → SE ESCRIBIÓ** donde estaba vacío.
 * O sea que, por construcción, la única celda afectada es `Sin identificar`. Igual se revisan las 8
 * columnas de sexo y edades con el mismo criterio.
 *
 * --- Qué es "mal escrita" ---
 * Una celda de sexo o edades de una fila con RDV_UID que:
 *   1. tiene el fondo del sistema (#4F81BD);
 *   2. tiene exactamente el valor que daba el cálculo roto (Sin identificar = Inscriptos de B);
 *   3. es distinta del valor correcto (el de ahora, con COLUMNAS_B);
 *   4. estaba VACÍA en el backup del 02/10 (antes de la primera escritura real), si la fila está en el
 *      backup —se busca por figura + fecha, no por número de fila—. Así no se toca nada que hubiera
 *      escrito el legado: los errores del pasado no se corrigen; éste es nuestro.
 *
 * --- Cómo se corre (lo corre el usuario) ---
 *   paso18_malEscritas_listar()        en seco: lista en el real y en la copia, no toca nada
 *   paso18_malEscritas_vaciarReal()    vacía y saca el color en el destino real
 * La próxima corrida del upsert (ya con las columnas bien leídas) completa esas celdas vacías con el
 * valor correcto: entran por RDV_UID.
 */

/** En seco: lista las mal escritas en el destino real. No escribe nada. (La copia de prueba ya no existe, 06/10.) */
function listarMalEscritas() {
  Logger.log('=== listarMalEscritas (paso 18, EN SECO) — no escribe nada ===');
  const cands = leerCandidatos_();
  const backup = _leerBackup_diag10();
  const out = {};
  [RDV_HOJA_DESTINO_REAL].forEach(function (hoja) {
    if (!ssDestino_().getSheetByName(hoja)) { Logger.log('--- "%s": no existe ---', hoja); return; }
    out[hoja] = _malEscritasEn_diag10(hoja, cands, backup, true);
  });
  return out;
}

/** Vacía y saca el color a las mal escritas de una solapa (el destino real). */
function vaciarMalEscritas(hoja) {
  Logger.log('=== vaciarMalEscritas en "%s" (paso 18) — ESCRIBE: vacía celdas y les saca el color ===', hoja);
  const cands = leerCandidatos_();
  const backup = _leerBackup_diag10();
  const r = _malEscritasEn_diag10(hoja, cands, backup, false);
  const sh = ssDestino_().getSheetByName(hoja);
  const hechas = vaciarCeldasDelSistema_(sh, r.lista.map(function (x) {
    return { fila: x.fila, col: x.col, escrito: x.escrito };
  }));
  SpreadsheetApp.flush();
  Logger.log('>>> Vaciadas %s de %s celdas listadas (las que cambiaron desde que se listaron no se tocan).',
             hechas.length, r.lista.length);
  Logger.log('    La próxima corrida del upsert las completa con el valor correcto (entran por RDV_UID).');
  return { listadas: r.lista.length, vaciadas: hechas.length };
}

function _malEscritasEn_diag10(hoja, cands, backup, loguear) {
  const dest = leerDestino_(hoja);
  const fondos = dest.sh.getRange(1, 1, dest.sh.getLastRow(), dest.sh.getLastColumn()).getBackgrounds();
  const r = { lista: [], conUid: 0, ambiguas: 0, estabanAntes: 0, sinVerificar: 0, porCampo: {} };
  CAMPOS_DESAGREGADO_.forEach(function (c) { r.porCampo[c] = 0; });
  dest.filas.forEach(function (f) {
    if (!f.uid) return;
    r.conUid++;
    const t = formularioDeTraza_(f, cands.vivos);
    if (!t.c) { r.ambiguas++; return; }
    const c = t.c;
    const bk = backup ? backup.porClave.get(f.clave) : undefined;
    CAMPOS_DESAGREGADO_.forEach(function (campo) {
      const idx = dest.D[campo];
      if (idx == null) return;
      const v = num(f.valores[idx]);
      if (v === '') return;
      if (!esColorSistema_(fondos[f.fila - 1][idx])) return;
      const roto = campo === 'Sin identificar' ? (c.inscriptos > 0 ? c.inscriptos : '') : '';
      const correcto = c.datos[campo];
      if (v !== roto || v === correcto) return;
      if (backup && backup.repetidas.has(f.clave)) { r.sinVerificar++; return; }   // no se puede verificar
      if (bk) {                                    // la fila estaba en el backup: ¿la celda estaba vacía?
        const j = backup.idx[campo];
        if (j != null && !esVacio_(bk[j])) { r.estabanAntes++; return; }
      }
      r.porCampo[campo]++;
      r.lista.push({ fila: f.fila, col: idx + 1, campo: campo, figura: f.figura, fecha: f.fecha,
                     escrito: f.valores[idx], correcto: correcto, form: c.nombre });
    });
  });
  if (loguear) {
    Logger.log('--- "%s": %s filas con RDV_UID | traza ambigua (no se revisan): %s ---', hoja, r.conUid, r.ambiguas);
    Logger.log('  celdas MAL ESCRITAS por el sistema desde el 02/10: %s   (%s)', r.lista.length,
               Object.keys(r.porCampo).filter(function (k) { return r.porCampo[k]; })
                 .map(function (k) { return k + ' ' + r.porCampo[k]; }).join(', ') || 'ninguna');
    Logger.log('  con el valor roto pero que ya estaban en el backup del 02/10 (las dejó el legado; no se tocan): %s',
               r.estabanAntes);
    Logger.log('  con el valor roto en filas con figura + fecha repetida en el backup (no se pueden verificar; no se tocan): %s',
               r.sinVerificar);
    if (!backup) Logger.log('  AVISO: no se pudo leer el backup del 02/10: el chequeo 4 no se aplicó.');
    Logger.log('  fila | figura | fecha | columna | escrito | correcto | formulario');
    r.lista.slice(0, 300).forEach(function (x) {
      Logger.log('    %s | %s | %s | %s | %s | %s | %s', x.fila, x.figura, fmtFecha_(x.fecha), x.campo,
                 x.escrito, x.correcto === '' ? '(vacío)' : x.correcto, x.form);
    });
    if (r.lista.length > 300) Logger.log('    … y %s más', r.lista.length - 300);
  }
  return r;
}

/** El backup del 02/10 (sólo lectura): figura|fecha → valores de la fila, y los índices de sexo y edades. */
function _leerBackup_diag10() {
  // Si el backup no se puede abrir (02/10: "no permission"), se avisa y se sigue SIN el chequeo 4:
  // nunca termina en error.
  let ss = null;
  try { ss = SpreadsheetApp.openById(RDV_SS_BACKUP_0210); } catch (err) {
    Logger.log('AVISO: no se pudo abrir el backup del 02/10 (%s): %s. Sigue sin el chequeo 4.', RDV_SS_BACKUP_0210,
               String(err && err.message || err));
    return null;
  }
  try {
    const sh = ss.getSheetByName(RDV_HOJA_DESTINO_REAL);
    if (!sh) return null;
    const vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    const hdr = vals[0];
    const iFig = findIdxOr_(hdr, aliasColumna_('Figura'), true), iFec = findIdxOr_(hdr, aliasColumna_('FECHA'), true);
    if (iFig == null || iFec == null) return null;
    const idx = {};
    CAMPOS_DESAGREGADO_.forEach(function (c) { idx[c] = findIdxOr_(hdr, aliasColumna_(c), true); });
    const porClave = new Map(), repetidas = new Set();
    for (let i = 1; i < vals.length; i++) {
      const k = claveNatural_(str(vals[i][iFig]), toDate_(vals[i][iFec]));
      if (!k) continue;
      if (porClave.has(k)) repetidas.add(k); else porClave.set(k, vals[i]);
    }
    repetidas.forEach(function (k) { porClave.delete(k); });   // figura + fecha repetida: no se usa
    Logger.log('Backup del 02/10: %s filas leídas (%s claves figura + fecha repetidas, no se usan).',
               vals.length - 1, repetidas.size);
    return { porClave: porClave, idx: idx, repetidas: repetidas };
  } catch (err) {
    Logger.log('AVISO: no se pudo leer el backup del 02/10 (%s): %s. Sigue sin el chequeo 4.', RDV_SS_BACKUP_0210,
               String(err && err.message || err));
    return null;
  }
}
