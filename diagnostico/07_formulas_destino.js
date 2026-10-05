/**
 * diagnostico/07_formulas_destino.js — ¿las columnas derivadas del destino siguen siendo
 * fórmulas, y sus valores coinciden con `Comunas` tal como está hoy?
 *
 * SÓLO LECTURA. Abre el destino (1) por openById y lee valores y fórmulas: no escribe una sola
 * celda, ni un fondo, en ninguna planilla. Todo va al log. Corre a mano, sin activador.
 *
 * --- Por qué ---
 * Las siete columnas `Comuna`, `Poblacion`, `p. Mujer`, `P. Varon`, `(km2)`, `(hab/km2)` y
 * `Zona` del destino **no son datos propios**: son VLOOKUP del barrio contra `Comunas`, columnas
 * B a H (CLAUDE.md 3.1.b). La corrección de las columnas E–G de `Comunas` (30/09) cambió esos
 * valores en el destino, a los correctos. Este chequeo lo confirma:
 *
 *   a) cada una de las once COLUMNAS_DERIVADAS conserva su fórmula (en la celda del encabezado,
 *      que es donde vive una fórmula de array), y el ancla no está en error (#REF!: el array no
 *      pudo expandirse porque alguien escribió un valor adentro);
 *   b) las siete de lookup apuntan a la columna de `Comunas` que corresponde (2 a 8);
 *   c) fila por fila, el valor que muestra el destino es el que da `Comunas` hoy para su barrio.
 *
 * Una diferencia en c) no se arregla desde acá: se lista para mirarla.
 *
 * Desde el 05/10 (derivadas por script, 30_Derivadas.js): una columna **sin fórmula con
 * DERIVADAS_POR_SCRIPT = true** no es un error —la calcula el script— y c) se hace igual ("valores =
 * Comunas"). Además, d): las cuatro de la fila (Día de la semana, % de Asistencia, Direccion2, Falta
 * Informacion) contra el cálculo del script. Recibe la solapa (por defecto, RDV_HOJA_DESTINO).
 */

/** Columna de `Comunas` (1 = A) que cada derivada de lookup debería leer. */
const DIAG7_LOOKUP = {
  'Comuna': 2, 'Poblacion': 3, 'p. Mujer': 4, 'P. Varon': 5, '(km2)': 6, '(hab/km2)': 7, 'Zona': 8
};

function diagFormulasDestino(solapa) {
  solapa = solapa || RDV_HOJA_DESTINO;
  Logger.log('=== diagFormulasDestino — sólo lectura, no escribe nada ===');
  Logger.log('  solapa: "%s"%s', solapa, solapa === RDV_HOJA_DESTINO ? ' (' + descripcionHojaDestino_() + ')' : '');
  const ss = SpreadsheetApp.openById(RDV_SS_DESTINO);
  const sh = ss.getSheetByName(solapa);
  if (!sh) throw new Error('No existe la hoja "' + solapa + '".');
  const nFilas = sh.getLastRow(), nCols = sh.getLastColumn();
  const hdrV = sh.getRange(1, 1, 1, nCols).getValues()[0];
  const hdrF = sh.getRange(1, 1, 1, nCols).getFormulas()[0];
  const idx = function (nombre) {
    const n = normalizeHeader_(nombre);
    for (let k = 0; k < hdrV.length; k++) if (normalizeHeader_(hdrV[k]) === n) return k;
    return -1;
  };

  // --- a) y b): la fórmula de cada derivada ---
  Logger.log('--- a) fórmulas de las %s COLUMNAS_DERIVADAS ---', COLUMNAS_DERIVADAS.length);
  const col = {};
  let sinFormula = 0, enError = 0, malIndice = 0, porScript = 0;
  COLUMNAS_DERIVADAS.forEach(function (nombre) {
    const k = idx(nombre);
    if (k < 0) { Logger.log('  %s: NO ESTÁ el encabezado', nombre); sinFormula++; return; }
    col[nombre] = k;
    const letra = _letraCol_diag7(k + 1);
    let f = hdrF[k], donde = 'fila 1 (array)';
    if (!f && nFilas >= 2) { f = sh.getRange(2, k + 1).getFormula(); donde = 'fila 2 (por fila)'; }
    const err = /^#/.test(String(hdrV[k]));
    if (err) enError++;
    if (!f && DERIVADAS_POR_SCRIPT) {
      porScript++;
      Logger.log('  %s (%s): sin fórmula — la calcula el script (DERIVADAS_POR_SCRIPT)', nombre, letra);
      return;
    }
    if (!f) { sinFormula++; Logger.log('  %s (%s): SIN FÓRMULA en fila 1 ni 2', nombre, letra); return; }
    let nota = '';
    if (DIAG7_LOOKUP[nombre]) {
      const m = /Comunas!\$?[A-Z]+\$?\d*:\$?[A-Z]+\$?\d*\s*[,;]\s*(\d+)/i.exec(f);
      const i = m ? Number(m[1]) : null;
      if (i !== DIAG7_LOOKUP[nombre]) malIndice++;
      nota = ' | lee Comunas col ' + (i === null ? '?' : i) + ' (debería ' + DIAG7_LOOKUP[nombre] + ')' +
             (i === DIAG7_LOOKUP[nombre] ? ' ✓' : ' ✗');
    }
    Logger.log('  %s (%s): fórmula en %s%s%s', nombre, letra, donde, nota, err ? ' | ANCLA EN ERROR: ' + hdrV[k] : '');
    Logger.log('      %s', String(f).slice(0, 140));
  });
  Logger.log('  sin fórmula: %s | calculadas por script: %s | ancla en error: %s | índice de Comunas distinto: %s',
             sinFormula, porScript, enError, malIndice);

  // --- c): valores contra Comunas de hoy ---
  const kBarrio = idx('Barrio'), kFig = idx('Figura'), kFecha = idx('FECHA');
  if (kBarrio < 0) { Logger.log('  El destino no tiene columna Barrio: no se pueden comparar valores.'); return {}; }
  const shC = ss.getSheetByName(RDV_HOJA_COMUNAS);
  const tabla = shC.getRange(1, 1, shC.getLastRow(), Math.min(shC.getLastColumn(), 8)).getValues().slice(1);
  // VLOOKUP exacto no distingue mayúsculas pero sí espacios: se reproduce igual.
  const mapa = new Map();
  tabla.forEach(function (r) {
    const key = String(r[0]).toLowerCase();
    if (r[0] !== '' && !mapa.has(key)) mapa.set(key, r);
  });

  const vals = sh.getRange(1, 1, nFilas, nCols).getValues();
  const difs = {}, total = {}, ejemplos = {};
  Object.keys(DIAG7_LOOKUP).forEach(function (n) { difs[n] = 0; total[n] = 0; ejemplos[n] = []; });
  let filasConDatos = 0, barrioSinTabla = 0;
  const sinTabla = {};
  for (let i = 1; i < vals.length; i++) {
    const r = vals[i];
    const hayDatos = (kFig >= 0 && r[kFig] !== '') || (kFecha >= 0 && r[kFecha] !== '');
    if (!hayDatos) continue;
    filasConDatos++;
    const barrio = r[kBarrio];
    const fila = barrio === '' ? null : mapa.get(String(barrio).toLowerCase());
    if (barrio !== '' && !fila) { barrioSinTabla++; sinTabla[barrio] = (sinTabla[barrio] || 0) + 1; }
    Object.keys(DIAG7_LOOKUP).forEach(function (n) {
      const k = col[n];
      if (k == null) return;
      total[n]++;
      const esperado = fila ? fila[DIAG7_LOOKUP[n] - 1] : '';
      const actual = r[k];
      if (!_igual_diag7(esperado, actual)) {
        difs[n]++;
        if (ejemplos[n].length < 8) ejemplos[n].push({ fila: i + 1, barrio: barrio, esperado: esperado, actual: actual });
      }
    });
  }

  Logger.log('--- c) valores del destino contra Comunas de hoy (%s filas con datos) ---', filasConDatos);
  Object.keys(DIAG7_LOOKUP).forEach(function (n) {
    if (col[n] == null) { Logger.log('  %s: no hay columna', n); return; }
    Logger.log('  %s: %s de %s coinciden | %s difieren', n, total[n] - difs[n], total[n], difs[n]);
    ejemplos[n].forEach(function (x) {
      Logger.log('      fila %s | barrio %s | Comunas dice %s | el destino muestra %s', x.fila,
                 x.barrio, x.esperado === '' ? '(vacío)' : x.esperado, x.actual === '' ? '(vacío)' : x.actual);
    });
  });
  Logger.log('  filas con un barrio que no está en Comunas (VLOOKUP da vacío): %s', barrioSinTabla);
  Object.keys(sinTabla).slice(0, 15).forEach(function (b) {
    Logger.log('      "%s" × %s', b, sinTabla[b]);
  });
  // --- d): las cuatro de la fila, contra el cálculo del script (30_Derivadas.js) ---
  const deFila = ['Día de la semana', '% de Asistencia', 'Direccion2', 'Falta Informacion'];
  let difFila = 0;
  if (solapa === RDV_HOJA_DESTINO_REAL || solapa === RDV_HOJA_COPIA_PRUEBA) {
    const cmp = _compararDerivadas_(_ctxDerivadas_(solapa), deFila);
    Logger.log('--- d) las cuatro de la fila contra el cálculo del script ---');
    deFila.forEach(function (n) {
      const c = cmp.porCol[n];
      if (!c) { Logger.log('  %s: no hay columna', n); return; }
      Logger.log('  %s: %s iguales | %s distintas', n, c.iguales, c.distintas);
      c.ejemplos.slice(0, 5).forEach(function (e) {
        Logger.log('      fila %s | la planilla muestra %s | el script calcula %s', e.fila, _mostrar_(e.planilla), _mostrar_(e.script));
      });
    });
    difFila = cmp.distintas;
  }
  const valoresOk = Object.keys(difs).every(function (n) { return !difs[n]; });
  const todoOk = !sinFormula && !enError && !malIndice && valoresOk && !difFila;
  Logger.log(todoOk
    ? '>>> CONFIRMADO: valores = Comunas de hoy, y las de la fila = el cálculo del script (' +
      (11 - porScript) + ' con fórmula, ' + porScript + ' calculadas por script).'
    : '>>> HAY DIFERENCIAS: ver arriba. Nada se corrigió desde acá.');
  return { sinFormula: sinFormula, enError: enError, malIndice: malIndice, difs: difs, porScript: porScript, difFila: difFila };
}

function _igual_diag7(a, b) {
  if (a === '' || a === null) return b === '' || b === null;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
  return String(a).trim() === String(b).trim();
}

function _letraCol_diag7(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
