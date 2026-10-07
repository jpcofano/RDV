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
 * **07/10**: también reconoce `Sin identificar = Inscriptos − Masculinos − Femeninos`, la fórmula equivocada que estuvo
 * arriba unas horas (el resto del sexo en vez del de las edades). Si alguna corrida de la hora la escribió, se lista acá.
 *
 * --- Qué es "mal escrita" ---
 * Una celda de sexo o edades de una fila con RDV_UID que:
 *   1. tiene el fondo del sistema (#4F81BD);
 *   2. tiene exactamente el valor que daba el cálculo roto (Sin identificar = Inscriptos de B);
 *   3. es distinta del valor correcto (el de ahora, con COLUMNAS_B);
 *   4. estaba VACÍA en el backup de la base (RDV_SS_BACKUP_BASE: la versión del 04/10 antes de las 00:20,
 *      antes del paso 22), si la fila está en el backup —se busca por figura + fecha, no por número de fila—.
 *      Así no se toca nada que hubiera escrito el legado: los errores del pasado no se corrigen; éste es nuestro.
 *      (Hasta el 07/10 el backup configurado era una copia de la intermedia: el chequeo nunca se aplicó.)
 *
 * --- Cómo se corre (lo corre el usuario) ---
 *   paso18_malEscritas_listar()        en seco: lista en el real y en la copia, no toca nada
 *   paso18_malEscritas_vaciarReal()    vacía y saca el color en el destino real
 * La próxima corrida del upsert (ya con las columnas bien leídas) completa esas celdas vacías con el
 * valor correcto: entran por RDV_UID.
 */

/**
 * Los valores rotos de Sin identificar para un formulario: Inscriptos (02/10) e Inscriptos − Masculinos − Femeninos
 * (07/10, el resto del SEXO en vez del de las edades: se cambió por error y se volvió atrás el mismo día).
 */
function _rotosSinIdentificar_diag10(c) {
  const out = [];
  if (!(c.inscriptos > 0)) return out;
  out.push(c.inscriptos);
  const M = c.datos['Masculinos'], F = c.datos['Femeninos'];
  if (M !== '' && F !== '') out.push(Math.max(0, c.inscriptos - numOcero_(M) - numOcero_(F)));
  return out;
}

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
  if (!backup) {
    Logger.log('>>> SIN el backup de la base no se vacía nada (chequeo 4: si la celda ya tenía valor en el backup, no la ' +
               'escribió el paso 22 y no se toca). Ver el aviso de arriba.');
    return { listadas: 0, vaciadas: 0, error: 'sin backup' };
  }
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
      // Los valores ROTOS de Sin identificar: Inscriptos (el bug del 02/10) e Inscriptos − Masculinos − Femeninos (la
      // fórmula equivocada que estuvo arriba unas horas el 07/10). Lo correcto es el resto de las EDADES.
      const rotos = campo === 'Sin identificar' ? _rotosSinIdentificar_diag10(c) : [];
      const correcto = c.datos[campo];
      if (rotos.indexOf(v) < 0 || v === correcto) return;
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
    Logger.log('  con el valor roto pero que ya tenían valor en el backup de la base (no las escribió el paso 22; no se tocan): %s',
               r.estabanAntes);
    Logger.log('  con el valor roto en filas con figura + fecha repetida en el backup (no se pueden verificar; no se tocan): %s',
               r.sinVerificar);
    if (!backup) Logger.log('  AVISO: no se pudo leer el backup de la base: el chequeo 4 no se aplicó (el motivo, arriba).');
    Logger.log('  fila | figura | fecha | columna | escrito | correcto | formulario');
    r.lista.slice(0, 300).forEach(function (x) {
      Logger.log('    %s | %s | %s | %s | %s | %s | %s', x.fila, x.figura, fmtFecha_(x.fecha), x.campo,
                 x.escrito, x.correcto === '' ? '(vacío)' : x.correcto, x.form);
    });
    if (r.lista.length > 300) Logger.log('    … y %s más', r.lista.length - 300);
  }
  return r;
}

/**
 * El backup de la base (sólo lectura; RDV_SS_BACKUP_BASE): figura|fecha → valores de la fila, y los índices de sexo y
 * edades. **Confirma lo que leyó** (archivo, solapa, filas) o **dice el error exacto** (07/10: el anterior era una copia de
 * la intermedia, sin la solapa, y devolvía nada sin decirlo). Si no se puede leer, se avisa y se sigue SIN el chequeo 4
 * (en seco); los pasos que vacían no vacían nada sin él.
 */
function _leerBackup_diag10() {
  const id = RDV_SS_BACKUP_BASE, solapa = RDV_HOJA_DESTINO_REAL;
  const sinChequeo = function (motivo) {
    Logger.log('AVISO: el backup de la base (%s, %s) no se pudo leer: %s. Sigue sin el chequeo 4 (y sin él no se vacía nada).',
               id, RDV_BACKUP_BASE_VERSION, motivo);
    return null;
  };
  let ss = null;
  try { ss = SpreadsheetApp.openById(id); } catch (err) {
    let quien = '';
    try { quien = Session.getEffectiveUser().getEmail(); } catch (e) { /* sin permiso para saberlo */ }
    Logger.log('  >>> La cuenta que corre el script%s no puede abrirlo. Compartir el backup con esa cuenta como LECTOR (sólo ' +
               'lectura; no se edita nunca) o correr con una cuenta que lo vea. Sin el chequeo 4 no se vacía nada: desde el ' +
               'paso 19 el color no distingue lo que escribió el legado de lo que escribió el sistema.', quien ? ' (' + quien + ')' : '');
    return sinChequeo('no se pudo abrir el archivo — ' + String(err && err.message || err));
  }
  let nombre = '';
  try { nombre = ss.getName(); } catch (e) { nombre = '(sin nombre)'; }
  try {
    const sh = ss.getSheetByName(solapa);
    if (!sh) {
      let hay = '';
      try { hay = ss.getSheets().map(function (h) { return h.getName(); }).join(', '); } catch (e) { /* no importa */ }
      return sinChequeo('el archivo "' + nombre + '" no tiene la solapa "' + solapa + '"' + (hay ? ' (tiene: ' + hay + ')' : '') +
                        ' — ¿es una copia de la base?');
    }
    const vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    const hdr = vals[0];
    const iFig = findIdxOr_(hdr, aliasColumna_('Figura'), true), iFec = findIdxOr_(hdr, aliasColumna_('FECHA'), true);
    if (iFig == null || iFec == null) {
      return sinChequeo('la solapa "' + solapa + '" de "' + nombre + '" no tiene ' + (iFig == null ? 'Figura' : '') +
                        (iFig == null && iFec == null ? ' ni ' : '') + (iFec == null ? 'FECHA' : '') + ' por encabezado');
    }
    const idx = {};
    CAMPOS_DESAGREGADO_.forEach(function (c) { idx[c] = findIdxOr_(hdr, aliasColumna_(c), true); });
    const porClave = new Map(), repetidas = new Set();
    for (let i = 1; i < vals.length; i++) {
      const k = claveNatural_(str(vals[i][iFig]), toDate_(vals[i][iFec]));
      if (!k) continue;
      if (porClave.has(k)) repetidas.add(k); else porClave.set(k, vals[i]);
    }
    repetidas.forEach(function (k) { porClave.delete(k); });   // figura + fecha repetida: no se usa
    Logger.log('Backup de la base: archivo "%s", solapa "%s" encontrada, %s filas (%s); %s claves figura + fecha repetidas, ' +
               'no se usan. El chequeo 4 se aplica.', nombre, solapa, vals.length - 1, RDV_BACKUP_BASE_VERSION, repetidas.size);
    return { porClave: porClave, idx: idx, repetidas: repetidas, nombre: nombre, filas: vals.length - 1 };
  } catch (err) {
    return sinChequeo('error al leer "' + nombre + '" — ' + String(err && err.message || err));
  }
}

// ===================== Paso 47 (07/10): las filas con Sin identificar mal escrito, con sus edades y su sexo =====================

/** Dónde queda la lista de filas (RDV_UID) que vació el paso 47, para que el paso 47b complete sólo ésas. */
const PROP_FILAS_PASO47_ = 'RDV_FILAS_PASO47';

/**
 * **Paso 47** (07/10): las filas con `Sin identificar` mal escrito (las que lista el paso 18), revisadas con sus EDADES y
 * su SEXO contra lo que trae B hoy. Hipótesis del usuario: se escribieron el 04/10 (paso 22) cuando B no traía las edades
 * de esos formularios (Sin identificar = Inscriptos − 0); hoy el origen nuevo sí las trae.
 *
 * Por fila (sólo si la corrida las va a volver a escribir: los datos de B de ese formulario no están frenados y el
 * Inscriptos del destino está vacío o es el de B —la condición del desagregado—):
 *   - edades del destino en 0 o vacías y B hoy trae edades → se vacían JUNTAS las edades en 0 y Sin identificar, para
 *     que se reescriban coherentes (si alguna de esas edades en 0 no la escribió el sistema, no se toca la fila);
 *   - edades del destino iguales a las de B → se vacía sólo Sin identificar;
 *   - si no, no se toca (y se lista por qué);
 *   - además, Masculinos / Femeninos en 0 escritos por el sistema, si B hoy trae sexo.
 * Sólo celdas **del sistema**: con el color del sistema y VACÍAS en el backup de la base (chequeo 4; sin el backup no se
 * vacía nada). `vaciarCeldasDelSistema_` vuelve a verificar valor y color justo antes. Después: paso 47b (completa sólo
 * esas filas) o, si se prefiere, el paso 22 entero.
 */
function revisarDesagregadoMalEscrito(escribe) {
  Logger.log('=== revisarDesagregadoMalEscrito (paso 47, %s) ===', escribe ? 'VACÍA celdas del sistema' : 'EN SECO: no escribe nada');
  const hoja = RDV_HOJA_DESTINO_REAL;
  const cands = leerCandidatos_();
  const backup = _leerBackup_diag10();
  if (!backup) {
    Logger.log('  >>> SIN el backup de la base: la lista puede incluir celdas que dejó el legado (el color ya no lo distingue).%s',
               escribe ? ' NO se vacía nada.' : '');
    if (escribe) return { error: 'sin backup', filas: 0, vaciadas: 0 };
  }
  const r18 = _malEscritasEn_diag10(hoja, cands, backup, false);
  const dest = leerDestino_(hoja);
  const sh = dest.sh;
  const fondos = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getBackgrounds();
  const porFila = {};
  dest.filas.forEach(function (f) { porFila[f.fila] = f; });
  const filas = [], vistas = {};
  r18.lista.forEach(function (x) { if (x.campo === 'Sin identificar' && !vistas[x.fila]) { vistas[x.fila] = true; filas.push(x.fila); } });
  const E5 = Object.keys(EDADES_B);
  const out = { filas: filas.length, casos: {}, celdas: [], uids: [], vaciadas: 0 };
  Logger.log('  filas con Sin identificar mal escrito (paso 18): %s', filas.length);
  Logger.log('  fila | figura | fecha | caso | destino: edades / Sin identificar / M F | B hoy: edades / Sin identificar / M F | se vacía');
  filas.forEach(function (n) {
    const f = porFila[n];
    const c = formularioDeTraza_(f, cands.vivos).c;
    const bk = backup ? backup.porClave.get(f.clave) : undefined;
    const v = function (campo) { const k = dest.D[campo]; return k == null ? '' : f.valores[k]; };
    const delSistema = function (campo) {
      const k = dest.D[campo];
      if (k == null || !esColorSistema_(fondos[f.fila - 1][k])) return false;
      if (bk) { const j = backup.idx[campo]; if (j != null && !esVacio_(bk[j])) return false; }   // ya estaba: la dejó el legado
      return true;
    };
    let insD = num(v('Inscriptos'));
    if (INSCRIPTOS_CERO_ES_VACIO && insD === 0) insD = '';
    const insB = c ? c.cuentas['Inscriptos'] : '';
    let caso;
    const campos = [];
    if (!c) caso = 'no se toca: la traza no encuentra el formulario';
    else if (c.bloqueoB) caso = 'no se toca: los datos de B de ese formulario están frenados (' + c.bloqueoB + ')';
    else if (!(insD === '' || insD === insB)) {
      caso = 'no se toca: Inscriptos del destino (' + insD + ') distinto del de B (' + insB + '): la corrida no escribiría el desagregado';
    } else {
      const dEd = E5.map(v), bEd = E5.map(function (e) { return c.datos[e]; });
      const ceroOVacias = dEd.every(function (x) { return esVacio_(x) || num(x) === 0; });
      const bTrae = bEd.reduce(function (a, x) { return a + numOcero_(x); }, 0) > 0;
      const coinciden = E5.every(function (e, k) { return num(dEd[k]) === num(bEd[k]); });
      if (ceroOVacias && bTrae) {
        const ajenas = E5.filter(function (e) { return !esVacio_(v(e)) && !delSistema(e); });
        if (ajenas.length) caso = 'no se toca: hay edades en 0 que no escribió el sistema (' + ajenas.join(', ') + ')';
        else {
          caso = 'edades + Sin identificar';
          E5.forEach(function (e) { if (!esVacio_(v(e))) campos.push(e); });
          campos.push('Sin identificar');
        }
      } else if (coinciden) {
        caso = 'sólo Sin identificar';
        campos.push('Sin identificar');
      } else {
        caso = 'no se toca: las edades del destino no son 0 y no coinciden con las de B';
      }
      // 2. el sexo: si B hoy lo trae y el destino tiene 0 escrito por el sistema, se vacía para que se reescriba
      const bM = c.datos['Masculinos'], bF = c.datos['Femeninos'];
      if (bM !== '' && bF !== '' && numOcero_(bM) + numOcero_(bF) > 0) {
        ['Masculinos', 'Femeninos'].forEach(function (s) {
          if (!esVacio_(v(s)) && num(v(s)) === 0 && delSistema(s)) campos.push(s);
        });
        if (campos.indexOf('Masculinos') >= 0 || campos.indexOf('Femeninos') >= 0) caso += ' + sexo en 0';
      }
    }
    out.casos[caso.split(' (')[0].split(':')[0]] = (out.casos[caso.split(' (')[0].split(':')[0]] || 0) + 1;
    campos.forEach(function (campo) { out.celdas.push({ fila: f.fila, col: dest.D[campo] + 1, escrito: v(campo), campo: campo, uid: f.uid }); });
    const fmt = function (lista) { return lista.map(function (x) { return x === '' ? '—' : x; }).join('/'); };
    Logger.log('    %s | %s | %s | %s | %s / %s / %s %s | %s / %s / %s %s | %s', f.fila, f.figura, fmtFecha_(f.fecha), caso,
               fmt(E5.map(v)), v('Sin identificar'), v('Masculinos'), v('Femeninos'),
               c ? fmt(E5.map(function (e) { return c.datos[e]; })) : '—', c ? c.datos['Sin identificar'] : '—',
               c ? c.datos['Masculinos'] : '—', c ? c.datos['Femeninos'] : '—', campos.join(', ') || '(nada)');
  });
  Logger.log('--- casos: %s | celdas a vaciar: %s ---', Object.keys(out.casos).map(function (k) { return k + ' ' + out.casos[k]; }).join(' · ') || '—',
             out.celdas.length);
  if (!escribe) {
    Logger.log('>>> EN SECO: no se vació nada. Real: paso47_revisarDesagregado(); después, paso47b (sólo estas filas).');
    return { filas: out.filas, casos: out.casos, celdas: out.celdas.length };
  }
  const hechas = vaciarCeldasDelSistema_(sh, out.celdas);
  SpreadsheetApp.flush();
  const uids = [];
  hechas.forEach(function (e) { if (e.uid && uids.indexOf(e.uid) < 0) uids.push(e.uid); });
  PropertiesService.getScriptProperties().setProperty(PROP_FILAS_PASO47_, JSON.stringify(uids));
  Logger.log('>>> Vaciadas %s de %s celdas (las que cambiaron desde la lectura no se tocan), en %s filas. Siguiente: ' +
             'paso47b_completarFilasRevisadas_enSeco() → paso47b_completarFilasRevisadas().', hechas.length, out.celdas.length, uids.length);
  return { filas: out.filas, casos: out.casos, celdas: out.celdas.length, vaciadas: hechas.length, filasVaciadas: uids.length };
}

/**
 * **Paso 47b** (07/10): completa SÓLO las filas que vació el paso 47 (por RDV_UID), con el mismo upsert del historial
 * (`{ historial: true }`, sólo celdas vacías, el color del sistema). En seco, lista qué escribiría en cada una. Es el paso
 * 22 limitado a esas filas: el 22 entero completaría además cualquier otra celda vacía del historial que hoy se pueda
 * calcular.
 */
function completarFilasRevisadas(escribe) {
  const raw = PropertiesService.getScriptProperties().getProperty(PROP_FILAS_PASO47_);
  const uids = raw ? JSON.parse(raw) : [];
  Logger.log('=== completarFilasRevisadas (paso 47b, %s) — %s filas del paso 47 ===', escribe ? 'ESCRIBE' : 'EN SECO', uids.length);
  if (!uids.length) {
    Logger.log('>>> No hay filas del paso 47 para completar: correr antes paso47_revisarDesagregado().');
    return { filas: 0, celdas: 0 };
  }
  if (escribe) return _correrUpsert_(DRY_RUN, { historial: true, soloUids: uids });
  const plan = calcularPlan_(true, null, { historial: true });
  const asis = cruzarAsistentes_(plan.dest, plan.comunas);
  const porDecision = decisionesPorFila_(plan.decisiones);
  const set = new Set(uids);
  let n = 0;
  plan.dest.filas.forEach(function (f) {
    if (!set.has(f.uid)) return;
    const d = decisionDeFila_(f, porDecision, asis);
    const cc = celdasDeDecision_(plan.dest, d, f.valores, true);
    n += cc.celdas.length;
    Logger.log('  fila %s | %s | %s → escribiría: %s', f.fila, f.figura, fmtFecha_(f.fecha),
               cc.celdas.map(function (x) { return plan.dest.hdr[x.col - 1] + ' ' + x.valor; }).join(', ') || '(nada)');
  });
  Logger.log('>>> EN SECO: escribiría %s celdas en %s filas. Real: paso47b_completarFilasRevisadas().', n, uids.length);
  return { filas: uids.length, celdas: n };
}
