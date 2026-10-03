/**
 * diagnostico/08_verificar_escritura.js — verificación DESPUÉS de una escritura real del upsert.
 *
 * SÓLO LECTURA. Lee el destino (1) —la solapa a la que apunta `RDV_HOJA_DESTINO`—, `B` y
 * `REGISTRO_UPSERT` de la intermedia (2); no escribe una sola celda ni un fondo. Todo va al log.
 * Corre a mano (`paso16_verificarEscritura()`), antes de la primera escritura en una solapa (línea
 * de base) y después de cada escritura.
 *
 * Cinco controles, en este orden:
 *   1) **Invariante en el destino, por grupo de gemelos** (02/10): ningún formulario —ni dos
 *      gemelos: mismo nombre y cierres a GEMELOS_MAX_DIAS o menos (regla 3)— está en 2+ filas con RDV_UID. El formulario de cada
 *      fila se resuelve por su traza (`form_clave`, si no `form_origen`: `formularioDeTraza_`), no por
 *      la fila de B. Así se detectó la 309/315 de la copia, y así se detecta si vuelve a pasar.
 *   2) **Fórmulas** (el paso 14): las once derivadas siguen siendo fórmula y muestran `Comunas`.
 *   3) **El color del sistema** (`COLORES_SISTEMA`: `#CFE2F3` desde el 02/10 y el `#4F81BD` viejo): en
 *      `Barrio`, la única columna manual desde el paso B, NO puede subir contra la línea de base de esa
 *      solapa (`LINEA_BASE_AZULES`); el resto se cuenta **por columna** (actual | viejo), y lo que escribió
 *      la última corrida, por columna, sale de REGISTRO_UPSERT. **Toda celda de traza con valor tiene que
 *      tener el color** (sólo el sistema escribe traza, y pinta todo lo que escribe).
 *   4) **Filas con RDV_UID**: cuántas, sin `form_origen`, **incompletas** (les queda alguna celda que
 *      el plan escribía —traza, datos o STATUS— vacía; lo decide `celdasDeDecision_`, la misma función
 *      que usa la escritura), **sin `form_clave`** (la próxima corrida la completa) y **traza ambigua**
 *      (gemelos sin `form_clave`: se sabe el nombre, no cuál de los dos).
 *   5) **La lista de las filas con RDV_UID** (fila, figura, fecha, formulario) y, para cada una, si HOY
 *      el plan la escribiría igual. Con **el mismo plan que el upsert** (02/10: `calcularPlan_` entero,
 *      con el invariante, sobre el destino sin sus RDV_UID), contra el formulario que resuelve la
 *      traza (`form_clave`, o el nombre y el grupo de gemelos en las filas escritas antes).
 */
/** Hasta cuántas filas con RDV_UID lista el bloque 5 una por una. */
const MAX_FILAS_LISTA_DIAG8 = 300;

function verificarEscritura() {
  Logger.log('=== verificarEscritura — sólo lectura, no escribe nada ===');
  Logger.log('  solapa destino: %s', descripcionHojaDestino_());
  const dest = leerDestino_();
  const cands = leerCandidatos_();
  const comunas = leerComunasMap_();
  const problemas = [];

  // --- 1) invariante en el destino, por grupo ---
  const conUid = dest.filas.filter(function (f) { return f.uid; });
  const traza = new Map(), porGrupo = new Map(), sinForm = [], ambiguas = [];
  conUid.forEach(function (f) {
    const t = formularioDeTraza_(f, cands.vivos);
    traza.set(f, t);
    if (t.ambiguo) ambiguas.push(f);
    if (!t.grupo) { if (!t.ambiguo) sinForm.push(f); return; }
    if (!porGrupo.has(t.grupo)) porGrupo.set(t.grupo, []);
    porGrupo.get(t.grupo).push(f);
  });
  const choques = [];
  porGrupo.forEach(function (filas, g) { if (filas.length > 1) choques.push({ g: g, filas: filas }); });
  Logger.log('--- 1) invariante "un formulario, una fila" en el destino (por grupo de gemelos) ---');
  Logger.log('  formularios (o gemelos con el mismo nombre) en 2+ filas con RDV_UID: %s   (tiene que dar 0)',
             choques.length);
  choques.forEach(function (x) {
    Logger.log('    "%s" → filas %s', x.filas[0].formOrigen, x.filas.map(function (f) {
      return f.fila + (f.formClave ? ' [' + f.formClave + ']' : ' [sin form_clave]');
    }).join(', '));
  });
  if (choques.length) {
    problemas.push('invariante: ' + choques.length + ' formularios o grupos de gemelos en 2+ filas');
    Logger.log('    Para corregir una fila que se quedó con el formulario (o el gemelo) de otra: ver');
    Logger.log('    docs/ESTADO.md, sección 0 ("cómo se deshace una fila escrita").');
  }
  if (sinForm.length) {
    Logger.log('  filas con RDV_UID cuyo formulario ya no está en B (no se pueden chequear): %s', sinForm.length);
    sinForm.slice(0, 20).forEach(function (f) {
      Logger.log('    fila %s | %s | %s', f.fila, fmtFecha_(f.fecha), f.formOrigen || '(sin form_origen)');
    });
  }

  // --- 2) fórmulas ---
  Logger.log('--- 2) fórmulas de las derivadas (paso 14) ---');
  const fx = diagFormulasDestino();
  const formulasOk = fx && !fx.sinFormula && !fx.enError && !fx.malIndice &&
    Object.keys(fx.difs || {}).every(function (k) { return !fx.difs[k]; });
  if (!formulasOk) problemas.push('fórmulas: ver el bloque 2');

  // --- 3) el color del sistema (02/10: #CFE2F3, y el #4F81BD viejo) ---
  Logger.log('--- 3) celdas con el color del sistema (%s) en "%s" ---', COLORES_SISTEMA.join(' o '), RDV_HOJA_DESTINO);
  const az = _azules_diag8(dest);
  const base = lineaBaseAzules_();
  Logger.log('  en Barrio (la única columna manual): %s   (línea de base: %s; NO puede subir)', az.manual,
             base.barrio == null ? 'NO ANOTADA' : base.barrio);
  Logger.log('  en toda la solapa: %s   (línea de base: %s; informativo: sube con lo que se escribe)', az.total,
             base.total == null ? 'NO ANOTADA' : base.total);
  Logger.log('  por columna (actual | viejo):');
  Object.keys(az.porColumna).sort(function (a, b) { return az.porColumna[b].t - az.porColumna[a].t; })
    .forEach(function (n) { const x = az.porColumna[n]; Logger.log('    %s: %s (%s | %s)', n, x.t, x.nuevo, x.viejo); });
  Logger.log('  celdas de traza con valor: %s | de ésas, SIN el color del sistema: %s   (tiene que dar 0: sólo el',
             az.trazaConValor, az.trazaSinAzul);
  Logger.log('    sistema escribe traza, y pinta todo lo que escribe)');
  az.ejemplosSinAzul.forEach(function (x) { Logger.log('    sin color: fila %s, %s', x.fila, x.col); });
  if (base.barrio == null) {
    Logger.log('  >>> Sin línea de base de Barrio para "%s". Si esto corre ANTES de escribir en esta solapa,', RDV_HOJA_DESTINO);
    Logger.log('      anotar en 00_Config.js: LINEA_BASE_AZULES["%s"] = { barrio: %s, total: %s }.', RDV_HOJA_DESTINO,
               az.manual, az.total);
  } else if (az.manual > base.barrio) {
    problemas.push('color del sistema en Barrio: ' + az.manual + ' > ' + base.barrio);
    Logger.log('  >>> SUBIÓ el color del sistema en Barrio: el upsert NO debería escribirlo.');
  }
  if (az.trazaSinAzul) problemas.push('celdas de traza sin azul: ' + az.trazaSinAzul);

  // --- 4) filas con RDV_UID: traza y completitud ---
  Logger.log('--- 4) filas con RDV_UID ---');
  const sinTraza = conUid.filter(function (f) { return !f.formOrigen; });
  const incompletas = [], sinClave = [];
  // Incompletas y sin form_clave: sólo las filas ACTIVAS (DIAS_ACTIVOS, 03/10). Una fila cerrada no se
  // completa más, así que no es un problema que le falte algo. El invariante (bloque 1) es sobre todas.
  let cerradasConUid = 0;
  conUid.forEach(function (f) {
    const c = traza.get(f).c;
    if (!c) return;   // sin formulario, o ambigua: contadas aparte
    if (!esFilaActiva_(f.fecha)) { cerradasConUid++; return; }
    const falta = _faltantesDeFila_diag8(dest, f, c, comunas);
    if (falta.clave) sinClave.push(f);
    if (falta.lista.length) incompletas.push({ f: f, falta: falta.lista });
  });
  Logger.log('  con RDV_UID: %s | sin form_origen: %s   (tiene que dar 0)', conUid.length, sinTraza.length);
  Logger.log('  filas activas: %s — las incompletas y sin form_clave se cuentan sólo ahí (cerradas con RDV_UID, ' +
             'no se miran: %s)', descActivas_(), cerradasConUid);
  Logger.log('  INCOMPLETAS (les falta alguna celda que el plan escribía en esa fila): %s   (tiene que dar 0;',
             incompletas.length);
  Logger.log('    si no da 0, la próxima corrida del upsert las completa: entran por RDV_UID)');
  incompletas.slice(0, 40).forEach(function (x) {
    Logger.log('    fila %s | %s | %s | falta: %s', x.f.fila, x.f.figura, fmtFecha_(x.f.fecha), x.falta.join(', '));
  });
  Logger.log('  sin form_clave, con el formulario resuelto sin ambigüedad: %s   (la próxima corrida la completa)',
             sinClave.length);
  Logger.log('  traza AMBIGUA (gemelos y sin form_clave: se sabe el nombre, no cuál): %s', ambiguas.length);
  ambiguas.forEach(function (f) {
    Logger.log('    fila %s | %s | %s | %s', f.fila, f.figura, fmtFecha_(f.fecha), f.formOrigen);
  });
  if (sinTraza.length) problemas.push('filas con RDV_UID sin form_origen: ' + sinTraza.length);
  if (incompletas.length) problemas.push('filas con RDV_UID incompletas: ' + incompletas.length);
  const ult = _ultimaEscrituraRegistrada_diag8();
  if (ult) {
    Logger.log('  última ESCRITURA en %s: %s | solapa %s | completa %s | filas %s | uids estampados %s',
               RDV_HOJA_REGISTRO, ult.hora, ult.hoja || '(no registrada)', ult.completa || '(no registrado)',
               ult.filas, ult.uids);
    Logger.log('  lo que escribió esa corrida, por columna: %s', ult.porColumna || '(no registrado)');
  } else {
    Logger.log('  %s no tiene ninguna corrida de ESCRITURA en esta solapa todavía.', RDV_HOJA_REGISTRO);
  }

  // --- 5) la lista, y si hoy EL MISMO PLAN las escribiría igual ---
  const hoy = _planSinUid_diag8(dest, cands, comunas);
  const listarTodas = conUid.length <= MAX_FILAS_LISTA_DIAG8;
  Logger.log('--- 5) las %s filas con RDV_UID: fila | figura | fecha | formulario | hoy%s ---', conUid.length,
             listarTodas ? '' : ' (más de ' + MAX_FILAS_LISTA_DIAG8 + ': sólo las que hoy difieren)');
  Logger.log('    "hoy" = el plan del upsert (calcularPlan_, con el invariante) sobre el destino sin RDV_UID');
  let distintas = 0;
  conUid.forEach(function (f) {
    const pf = hoy.porFila[f.fila];
    const igual = !!(pf && pf.veredicto === 'escribiria' && esFormularioDeLaTraza_(traza.get(f), pf.cand));
    if (!igual) distintas++;
    if (!listarTodas && igual) return;
    const texto = igual ? 'igual'
      : '<<< HOY: ' + (pf ? pf.veredicto + (pf.motivo ? ' (' + pf.motivo + ')' : '') +
                            (pf.cand ? (esFormularioDeLaTraza_(traza.get(f), pf.cand) ? ', mismo formulario'
                                                                             : ' con "' + pf.cand.nombre + '"') : '')
                         : 'sin veredicto');
    Logger.log('  fila %s | %s | %s | %s | %s', f.fila, f.figura, fmtFecha_(f.fecha),
               f.formOrigen || '(sin form_origen)', texto);
  });
  Logger.log('  >>> filas con RDV_UID que HOY el plan no escribiría igual: %s (no es un error de la ' +
             'escritura: la fila queda como está; se mira con paso12_explicarFila)', distintas);

  Logger.log(problemas.length ? '>>> HAY PROBLEMAS: ' + problemas.join(' | ') + '. Ver docs/backup.md §8.2.'
                              : '>>> OK: invariante 0, fórmulas bien, Barrio sin subir, traza con el color del sistema, 0 incompletas.');
  return { problemas: problemas, conUid: conUid.length, incompletas: incompletas.length,
           sinClave: sinClave.length, ambiguas: ambiguas.length, choques: choques.length,
           azulManual: az.manual, azulTotal: az.total, trazaSinAzul: az.trazaSinAzul,
           distintas: distintas, hoy: hoy };
}

/**
 * El plan del upsert, ENTERO (con el invariante), sobre el destino con las filas SIN su RDV_UID ni su
 * traza: lo que decidiría hoy si ninguna fila estuviera escrita. Sólo calcula, no escribe.
 */
function _planSinUid_diag8(dest, cands, comunas) {
  const limpio = Object.assign({}, dest, {
    filas: dest.filas.map(function (f) {
      return Object.assign({}, f, { uid: '', formOrigen: '', formClave: '' });
    })
  });
  return calcularPlan_(true, { dest: limpio, cands: cands, comunas: comunas }, { historial: true });
}

/**
 * Los azules de la solapa: total, en las manuales, por grupo de columnas, y las celdas de traza con
 * valor que NO están en azul (no debería haber ninguna).
 */
function _azules_diag8(dest) {
  const sh = dest.sh, hdr = dest.hdr;
  const nFilas = sh.getLastRow(), nCols = sh.getLastColumn();
  const fondos = sh.getRange(1, 1, nFilas, nCols).getBackgrounds();
  const grupoDe = hdr.map(function (h, k) {
    if (COLUMNAS_TRAZA.some(function (c) { return normalizeHeader_(c) === normalizeHeader_(h); })) return 'traza';
    if (CAMPOS_DATO_.some(function (c) { return normalizeHeader_(c) === normalizeHeader_(h); })) return 'datos';
    if (k === dest.D['STATUS REUNIÓN']) return 'status';
    if (esColumnaManual_(h)) return 'manuales';
    return 'otras';
  });
  const out = { total: 0, manual: 0, grupos: { traza: 0, datos: 0, status: 0, manuales: 0, otras: 0 },
                porColumna: {}, trazaConValor: 0, trazaSinAzul: 0, ejemplosSinAzul: [] };
  const nuevo = COLOR_SISTEMA.toLowerCase();
  const porFila = {};
  dest.filas.forEach(function (f) { porFila[f.fila] = f; });
  for (let i = 1; i < fondos.length; i++) {
    for (let k = 0; k < fondos[i].length; k++) {
      const esAzul = esColorSistema_(fondos[i][k]);
      const g = grupoDe[k] || 'otras';
      if (esAzul) {
        out.total++;
        out.grupos[g]++;
        if (g === 'manuales') out.manual++;
        const n = hdr[k] || ('col ' + (k + 1));
        const x = out.porColumna[n] = out.porColumna[n] || { t: 0, nuevo: 0, viejo: 0 };
        x.t++;
        if (String(fondos[i][k]).toLowerCase() === nuevo) x.nuevo++; else x.viejo++;
      }
      const f = porFila[i + 1];
      if (g === 'traza' && f && !esVacio_(f.valores[k])) {
        out.trazaConValor++;
        if (!esAzul) {
          out.trazaSinAzul++;
          if (out.ejemplosSinAzul.length < 10) out.ejemplosSinAzul.push({ fila: i + 1, col: hdr[k] });
        }
      }
    }
  }
  return out;
}

/**
 * Qué le falta a una fila con RDV_UID de lo que el plan escribía en ella: form_score, form_nivel,
 * form_fecha_match si el par tiene distancia, y lo que `celdasDeDecision_` diga para datos y STATUS
 * (la misma función que usa la escritura). `form_clave` va aparte (`clave`): la completa la próxima
 * corrida, no es una fila a medio escribir.
 */
function _faltantesDeFila_diag8(dest, f, c, comunas) {
  const v = f.valores, T = dest.T, falta = [];
  [['form_score', T.score], ['form_nivel', T.nivel]].forEach(function (x) {
    if (x[1] != null && esVacio_(v[x[1]])) falta.push(x[0]);
  });
  if (T.fechaMatch != null && esVacio_(v[T.fechaMatch]) && puntuar_(f, c, comunas).dist !== null) {
    falta.push('form_fecha_match');
  }
  const d = { fila: f, cand: c, score: 1, nivel: 'rdv_uid', dist: null };
  const pend = celdasDeDecision_(dest, d, v, true);
  let clave = false;
  pend.celdas.forEach(function (x) {
    if (T.clave != null && x.col === T.clave + 1) { clave = true; return; }
    falta.push(dest.hdr[x.col - 1]);
  });
  if (pend.status) falta.push('STATUS → Realizada');
  return { lista: falta, clave: clave };
}

function _ultimaEscrituraRegistrada_diag8() {
  const sh = ssIntermedia_().getSheetByName(RDV_HOJA_REGISTRO);
  if (!sh || sh.getLastRow() < 2) return null;
  const nCols = Math.max(5, Math.min(sh.getLastColumn(), 22));
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, nCols).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (vals[i][1] !== 'ESCRITURA') continue;
    // La de ESTA solapa. Las líneas de antes del 02/10 no dicen solapa: eran del destino real.
    const hoja = nCols >= 16 ? str(vals[i][15]) : '';
    if ((hoja || RDV_HOJA_DESTINO_REAL) !== RDV_HOJA_DESTINO) continue;
    return { hora: vals[i][0], filas: vals[i][2], uids: vals[i][4],
             hoja: hoja, completa: nCols >= 17 ? vals[i][16] : '', porColumna: nCols >= 22 ? str(vals[i][21]) : '' };
  }
  return null;
}
