/**
 * 30_Derivadas.js — las once columnas derivadas del destino, por Apps Script (etapa "antes de Agenda", 05/10).
 *
 * Hoy son fórmulas de array en el encabezado (CLAUDE.md 3.1.b): Día de la semana, % de Asistencia,
 * Direccion2, Falta Informacion, y las siete de `Comunas` (Comuna, Poblacion, p. Mujer, P. Varon, (km2),
 * (hab/km2), Zona). Esta etapa las reemplaza por valores que calcula el sistema, **con la misma lógica**:
 *
 *   Día de la semana   TEXT(FECHA; "dddd"), en castellano: "lunes" … "domingo"; vacío si no hay FECHA
 *   % de Asistencia    Asistentes / Inscriptos; vacío si Inscriptos está vacío o la división da error
 *   Direccion2         Dirección & SUFIJO_DIRECCION2; vacío si no hay Dirección
 *   Falta Informacion  "No" si Inscriptos tiene algo; vacío si no
 *   las siete          VLOOKUP(Barrio; Comunas; 2..8; FALSO): exacto, sin distinguir mayúsculas; vacío si no está
 *
 * Ninguna otra fórmula se toca (B, la intermedia, las demás solapas).
 *
 *   paso 25  compararDerivadas(solapa)          SÓLO LECTURA: script contra lo que muestran las fórmulas
 *   paso 26  quitarFormulasDerivadas(solapa)    respaldo + quita las fórmulas y deja los valores (en seco primero)
 *            recalcDerivadas_(solapa, escribe)  lo que hace el upsert en cada corrida (DERIVADAS_POR_SCRIPT)
 *   paso 27  restaurarFormulasDerivadas(solapa) vuelve atrás: las once fórmulas, desde el respaldo
 *
 * Sólo trabaja sobre el destino real o la copia de prueba. Las escrituras, en 05_Escritura.js
 * (`escribirDerivadas_`, la excepción anunciada de las columnas del sistema).
 */

/** Columna de `Comunas` (1 = A) que da cada derivada de lookup (la misma que la fórmula). */
const DERIVADAS_LOOKUP_ = {
  'Comuna': 2, 'Poblacion': 3, 'p. Mujer': 4, 'P. Varon': 5, '(km2)': 6, '(hab/km2)': 7, 'Zona': 8
};
/** TEXT(fecha; "dddd") con la planilla en castellano. Índice = getDay() (0 = domingo). */
const DIAS_SEMANA_TEXTO_ = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// ===================== El cálculo =====================

/**
 * Lo que necesita el cálculo, leído una vez: la hoja, el encabezado, las fórmulas de la fila 1 y 2 de cada
 * derivada, todos los valores, la tabla de Comunas y la última fila con datos.
 */
function _ctxDerivadas_(solapa) {
  if (solapa !== RDV_HOJA_DESTINO_REAL && solapa !== RDV_HOJA_COPIA_PRUEBA) {
    throw new Error('Las derivadas se trabajan sólo en "' + RDV_HOJA_DESTINO_REAL + '" o en la copia "' +
                    RDV_HOJA_COPIA_PRUEBA + '", no en "' + solapa + '".');
  }
  const ss = ssDestino_();
  const sh = ss.getSheetByName(solapa);
  if (!sh) throw new Error('No existe la solapa "' + solapa + '".');
  const nFilas = sh.getLastRow(), nCols = sh.getLastColumn();
  const vals = sh.getRange(1, 1, nFilas, nCols).getValues();
  const hdr = vals[0];
  const f1 = sh.getRange(1, 1, 1, nCols).getFormulas()[0];
  const f2 = nFilas >= 2 ? sh.getRange(2, 1, 1, nCols).getFormulas()[0] : hdr.map(function () { return ''; });
  const ix = function (nombre) { return findIdxOr_(hdr, aliasColumna_(nombre), true); };
  const cols = {};
  COLUMNAS_DERIVADAS.forEach(function (n) { const k = findIdxOr_(hdr, [n], true); if (k != null) cols[n] = k; });
  const fuente = { fecha: ix('FECHA'), ins: ix('Inscriptos'), asis: ix('Asistentes'), dir: ix('Dirección'),
                   barrio: ix('Barrio'), figura: ix('Figura') };
  // La última fila con datos (Figura o FECHA): con la fórmula de array, getLastRow llega hasta su fin.
  let ultima = 1;
  for (let i = vals.length - 1; i >= 1; i--) {
    const r = vals[i];
    if ((fuente.figura != null && r[fuente.figura] !== '') || (fuente.fecha != null && r[fuente.fecha] !== '')) {
      ultima = i + 1; break;
    }
  }
  return { sh: sh, solapa: solapa, vals: vals, hdr: hdr, f1: f1, f2: f2, cols: cols, fuente: fuente,
           tabla: _tablaComunasDerivadas_(ss), ultima: ultima };
}

/** Comunas, A:H, por barrio en minúsculas (VLOOKUP exacto no distingue mayúsculas; la primera que aparece). */
function _tablaComunasDerivadas_(ss) {
  const sh = ss.getSheetByName(RDV_HOJA_COMUNAS);
  const mapa = new Map();
  if (!sh || sh.getLastRow() < 2) return mapa;
  sh.getRange(2, 1, sh.getLastRow() - 1, Math.min(8, sh.getLastColumn())).getValues().forEach(function (r) {
    const k = String(r[0]).toLowerCase();
    if (r[0] !== '' && !mapa.has(k)) mapa.set(k, r);
  });
  return mapa;
}

/** Las once derivadas de una fila (`r`, la fila como está), por nombre. */
function calcularDerivadasFila_(r, ctx) {
  const F = ctx.fuente, out = {};
  const v = function (k) { return k == null ? '' : r[k]; };
  // Día de la semana = TEXT(FECHA; "dddd")
  const fecha = v(F.fecha);
  out['Día de la semana'] = fecha === '' ? '' : _diaSemanaTexto_(fecha);
  // % de Asistencia = SI(LARGO(Inscriptos) = 0; ""; SI.ERROR(Asistentes / Inscriptos; ""))
  const ins = v(F.ins), asis = v(F.asis);
  if (ins === '' || ins === null) out['% de Asistencia'] = '';
  else {
    const a = _numeroComoSheets_(asis), b = _numeroComoSheets_(ins);
    out['% de Asistencia'] = (a === null || b === null || b === 0) ? '' : a / b;
  }
  // Direccion2 = SI(Dirección = ""; ""; Dirección & SUFIJO)
  const dir = v(F.dir);
  out['Direccion2'] = dir === '' ? '' : String(dir) + SUFIJO_DIRECCION2;
  // Falta Informacion = SI(Inscriptos = ""; ""; "No")
  out['Falta Informacion'] = (ins === '' || ins === null) ? '' : 'No';
  // Las siete de Comunas = SI.ERROR(BUSCARV(Barrio; Comunas!A:H; n; FALSO); )
  const barrio = v(F.barrio);
  const fila = barrio === '' ? null : ctx.tabla.get(String(barrio).toLowerCase());
  Object.keys(DERIVADAS_LOOKUP_).forEach(function (n) {
    const x = fila ? fila[DERIVADAS_LOOKUP_[n] - 1] : '';
    out[n] = x === undefined || x === null ? '' : x;
  });
  return out;
}

/** El día de la semana de una FECHA como lo da TEXT(…; "dddd"): Date, número de serie o texto con fecha. */
function _diaSemanaTexto_(fecha) {
  let d = null;
  if (fecha instanceof Date) d = fecha;
  else if (typeof fecha === 'number') d = new Date(Math.round((fecha - 25569) * 86400000) + 12 * 3600000);   // serie de Sheets
  else d = toDate_(fecha);
  if (!d || isNaN(d.getTime())) return String(fecha);          // TEXT de un texto que no es fecha: el texto
  const u = Number(Utilities.formatDate(d, RDV_TZ, 'u'));     // 1 = lunes … 7 = domingo, en la zona de la planilla
  return DIAS_SEMANA_TEXTO_[u % 7];
}

/** Un valor como lo usa Sheets en una división: vacío = 0, número = número, texto numérico = número, si no null. */
function _numeroComoSheets_(x) {
  if (x === '' || x === null || x === undefined) return 0;
  if (typeof x === 'number') return x;
  if (typeof x === 'boolean') return x ? 1 : 0;
  if (x instanceof Date) return null;
  const t = String(x).trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

/** ¿Dos valores de una derivada son iguales? Números con tolerancia relativa; lo demás, exacto. */
function _igualDerivada_(a, b) {
  if (a === '' || a === null || a === undefined) return b === '' || b === null || b === undefined;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
  if (a instanceof Date || b instanceof Date) return String(a) === String(b);
  return a === b;
}

/** Qué fórmula tiene cada derivada: { nombre: {col (1-based), tipo: 'array'|'por_fila'|'', formula} }. */
function _formulasDerivadas_(ctx) {
  const out = {};
  Object.keys(ctx.cols).forEach(function (n) {
    const k = ctx.cols[n];
    out[n] = ctx.f1[k] ? { col: k + 1, tipo: 'array', formula: ctx.f1[k] }
           : ctx.f2[k] ? { col: k + 1, tipo: 'por_fila', formula: ctx.f2[k] }
           : { col: k + 1, tipo: '', formula: '' };
  });
  return out;
}

// ===================== Paso 25: comparar (sólo lectura) =====================

/**
 * **Paso 25, SÓLO LECTURA**: calcula las once por script y las compara con lo que muestra la planilla,
 * fila por fila (las filas con Figura o FECHA), por columna: iguales / distintas, con las 10 primeras
 * distintas. Tiene que dar **0 distintas** antes de quitar las fórmulas. Loguea además el texto EXACTO de
 * las once fórmulas (para docs/formulas-respaldo.md).
 */
function compararDerivadas(solapa) {
  solapa = solapa || RDV_HOJA_DESTINO;
  Logger.log('=== compararDerivadas (paso 25) en "%s" — sólo lectura, no escribe nada ===', solapa);
  const ctx = _ctxDerivadas_(solapa);
  const fx = _formulasDerivadas_(ctx);
  Logger.log('--- las once fórmulas, texto exacto (para docs/formulas-respaldo.md) ---');
  COLUMNAS_DERIVADAS.forEach(function (n) {
    const x = fx[n];
    if (!x) { Logger.log('  %s: NO ESTÁ la columna', n); return; }
    Logger.log('  %s | columna %s | %s | %s', n, _letraDerivada_(x.col), x.tipo || 'SIN FÓRMULA (valores)', x.formula || '-');
  });
  const r = _compararDerivadas_(ctx, COLUMNAS_DERIVADAS);
  Logger.log('--- script contra lo que muestra la planilla (%s filas con datos, hasta la fila %s) ---', r.filas, ctx.ultima);
  COLUMNAS_DERIVADAS.forEach(function (n) {
    const c = r.porCol[n];
    if (!c) return;
    Logger.log('  %s: iguales %s | distintas %s', n, c.iguales, c.distintas);
    c.ejemplos.forEach(function (e) {
      Logger.log('      fila %s | la planilla muestra %s | el script calcula %s', e.fila, _mostrar_(e.planilla), _mostrar_(e.script));
    });
  });
  Logger.log(r.distintas ? '>>> HAY %s DISTINTAS: no se quitan las fórmulas hasta que dé 0.' : '>>> 0 distintas en las once columnas.',
             r.distintas);
  return { distintas: r.distintas, porCol: r.porCol, filas: r.filas, formulas: fx };
}

function _compararDerivadas_(ctx, nombres) {
  const porCol = {};
  nombres.forEach(function (n) { if (ctx.cols[n] != null) porCol[n] = { iguales: 0, distintas: 0, ejemplos: [] }; });
  let filas = 0, distintas = 0;
  const F = ctx.fuente;
  for (let i = 1; i < ctx.ultima; i++) {
    const r = ctx.vals[i];
    const hay = (F.figura != null && r[F.figura] !== '') || (F.fecha != null && r[F.fecha] !== '');
    if (!hay) continue;
    filas++;
    const calc = calcularDerivadasFila_(r, ctx);
    Object.keys(porCol).forEach(function (n) {
      const actual = r[ctx.cols[n]], c = porCol[n];
      if (_igualDerivada_(calc[n], actual)) c.iguales++;
      else {
        c.distintas++; distintas++;
        if (c.ejemplos.length < 10) c.ejemplos.push({ fila: i + 1, planilla: actual, script: calc[n] });
      }
    });
  }
  return { porCol: porCol, distintas: distintas, filas: filas };
}

function _mostrar_(v) {
  if (v === '' || v === null || v === undefined) return '(vacío)';
  if (v instanceof Date) return 'fecha ' + fmtFecha_(v);
  return (typeof v) + ' ' + JSON.stringify(v);
}

function _letraDerivada_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// ===================== En cada corrida del upsert =====================

/**
 * **Recalcula las once en TODAS las filas** y sobrescribe sólo las celdas cuyo valor cambió, sin color
 * (`escribirDerivadas_`). Una columna que todavía tiene fórmula se saltea. Con `escribe = false` sólo
 * cuenta. Lo llama el upsert con DERIVADAS_POR_SCRIPT; el paso 26 lo expone para la copia.
 *
 * @return {{ total, porCol: {nombre: n}, conFormula: [nombres] }}
 */
function recalcDerivadas_(solapa, escribe) {
  const ctx = _ctxDerivadas_(solapa);
  const fx = _formulasDerivadas_(ctx);
  const out = { total: 0, porCol: {}, conFormula: [] };
  const calc = [];
  for (let i = 1; i < ctx.vals.length; i++) calc.push(i < ctx.ultima ? calcularDerivadasFila_(ctx.vals[i], ctx) : null);
  Object.keys(ctx.cols).forEach(function (n) {
    if (fx[n].tipo) { out.conFormula.push(n); return; }
    const k = ctx.cols[n], tramos = [];
    for (let i = 1; i < ctx.vals.length; i++) {
      const nuevo = calc[i - 1] ? calc[i - 1][n] : '';          // debajo de la última fila con datos: vacío
      if (_igualDerivada_(nuevo, ctx.vals[i][k])) continue;
      const t = tramos[tramos.length - 1];
      if (t && t.desde + t.valores.length === i + 1) t.valores.push(nuevo);
      else tramos.push({ desde: i + 1, valores: [nuevo] });
    }
    const n2 = tramos.reduce(function (s, t) { return s + t.valores.length; }, 0);
    if (!n2) return;
    out.porCol[n] = n2;
    out.total += n2;
    if (escribe) escribirDerivadas_(ctx.sh, ctx.hdr, k + 1, tramos);
  });
  if (escribe && out.total) SpreadsheetApp.flush();
  Logger.log('--- derivadas por script en "%s" (%s) ---', solapa, escribe ? 'ESCRIBE' : 'sólo cuenta');
  Logger.log('  celdas que cambian: %s%s', out.total, out.total ? ' → ' + Object.keys(out.porCol).map(function (n) {
    return n + ' ' + out.porCol[n]; }).join(' | ') : '');
  if (out.conFormula.length) {
    Logger.log('  todavía con fórmula (no se escriben): %s', out.conFormula.join(', '));
  }
  return out;
}

/** El paso 26b: recalcular a mano sobre una solapa (la copia, para probar sin el upsert). Respeta DRY_RUN. */
function recalcularDerivadas(solapa, aplicar) {
  const escribe = !!aplicar && DRY_RUN === false;
  Logger.log('=== recalcularDerivadas en "%s" (%s) ===', solapa, escribe ? 'ESCRIBE' : 'EN SECO');
  return recalcDerivadas_(solapa, escribe);
}

// ===================== Paso 26: quitar las fórmulas =====================

/**
 * **Paso 26**: quita las fórmulas de las once y deja los valores del script, en la misma tanda (la columna
 * no queda vacía ni un momento). Antes: compara (tiene que dar 0 distintas; si no, no hace nada) y guarda el
 * respaldo de las fórmulas en RDV_HOJA_RESPALDO_DERIVADAS. Después: verifica que no quede fórmula y que
 * vuelva a dar 0 distintas. Pone la protección con advertencia. En seco (`aplicar` falso o DRY_RUN = true)
 * sólo dice qué haría.
 */
function quitarFormulasDerivadas(solapa, aplicar) {
  const escribe = !!aplicar && DRY_RUN === false;
  Logger.log('=== quitarFormulasDerivadas (paso 26) en "%s" (%s) ===', solapa, escribe ? 'ESCRIBE' : 'EN SECO');
  const ctx = _ctxDerivadas_(solapa);
  const fx = _formulasDerivadas_(ctx);
  const conFormula = Object.keys(fx).filter(function (n) { return fx[n].tipo; });
  Logger.log('  con fórmula: %s de %s | última fila con datos: %s', conFormula.length, Object.keys(fx).length, ctx.ultima);
  if (!conFormula.length) { Logger.log('>>> Ninguna derivada tiene fórmula: no hay nada que quitar.'); return { quitadas: 0 }; }
  const cmp = _compararDerivadas_(ctx, conFormula);
  if (cmp.distintas) {
    Logger.log('>>> %s DISTINTAS entre el script y la fórmula: NO se quita nada. Correr el paso 25 y mirar.', cmp.distintas);
    return { quitadas: 0, distintas: cmp.distintas };
  }
  Logger.log('  script = fórmula en las %s filas con datos (0 distintas)', cmp.filas);
  const valores = {};
  conFormula.forEach(function (n) {
    const col = fx[n].col, v = [];
    for (let i = 1; i < ctx.ultima; i++) v.push(calcularDerivadasFila_(ctx.vals[i], ctx)[n]);
    valores[col] = v;
  });
  if (!escribe) {
    Logger.log('>>> EN SECO: quitaría la fórmula de %s y escribiría %s celdas (filas 2 a %s). Nada cambió.',
               conFormula.join(', '), conFormula.length * (ctx.ultima - 1), ctx.ultima);
    return { quitadas: 0, enSeco: true, columnas: conFormula };
  }
  const resp = guardarRespaldoDerivadas_(ctx, fx);
  Logger.log('  respaldo guardado en %s: %s fórmulas', RDV_HOJA_RESPALDO_DERIVADAS, resp);
  quitarFormulasDerivadas_(ctx.sh, ctx.hdr, conFormula.map(function (n) { return fx[n].col; }), valores, ctx.ultima);
  SpreadsheetApp.flush();
  // Verificación: sin fórmula y 0 distintas.
  const ctx2 = _ctxDerivadas_(solapa), fx2 = _formulasDerivadas_(ctx2);
  const quedan = conFormula.filter(function (n) { return fx2[n].tipo; });
  const cmp2 = _compararDerivadas_(ctx2, COLUMNAS_DERIVADAS);
  Logger.log('>>> Quitadas: %s. Con fórmula todavía: %s. Script contra planilla: %s distintas (tiene que dar 0).',
             conFormula.length - quedan.length, quedan.length ? quedan.join(', ') : 'ninguna', cmp2.distintas);
  return { quitadas: conFormula.length - quedan.length, quedan: quedan, distintas: cmp2.distintas };
}

/**
 * Guarda el texto de las fórmulas en RDV_HOJA_RESPALDO_DERIVADAS (intermedia): una línea por columna y
 * solapa. Reemplaza las líneas de esa solapa SÓLO para las columnas que hoy tienen fórmula (un respaldo
 * nunca se pisa con un "sin fórmula").
 */
function guardarRespaldoDerivadas_(ctx, fx) {
  const enc = ['solapa', 'encabezado', 'columna', 'tipo', 'formula', 'formula_r1c1', 'filas', 'fecha'];
  const ss = ssIntermedia_();
  const sh = ss.getSheetByName(RDV_HOJA_RESPALDO_DERIVADAS);
  let filas = sh && sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, enc.length).getValues() : [];
  const nuevas = [];
  Object.keys(fx).forEach(function (n) {
    const x = fx[n];
    if (!x.tipo) return;
    let r1c1 = '', cuantas = '';
    if (x.tipo === 'por_fila') {
      r1c1 = ctx.sh.getRange(2, x.col).getFormulaR1C1();
      cuantas = ctx.sh.getRange(2, x.col, ctx.sh.getLastRow() - 1, 1).getFormulas()
        .filter(function (f) { return f[0]; }).length;
    }
    filas = filas.filter(function (r) { return !(r[0] === ctx.solapa && normalizeHeader_(r[1]) === normalizeHeader_(n)); });
    nuevas.push([ctx.solapa, n, _letraDerivada_(x.col), x.tipo, x.formula, r1c1, cuantas, new Date()]);
  });
  escribirHoja_(RDV_HOJA_RESPALDO_DERIVADAS, [enc].concat(filas, nuevas));
  return nuevas.length;
}

// ===================== Paso 27: volver atrás =====================

/**
 * **Paso 27**: vuelve a poner las once fórmulas desde RDV_HOJA_RESPALDO_DERIVADAS (las de esa solapa),
 * borrando antes los valores de cada columna para que el array se pueda expandir, y saca la protección. En
 * seco sólo lista lo que haría. Después de restaurar, apagar DERIVADAS_POR_SCRIPT (si no, el upsert las
 * saltea igual: tienen fórmula).
 */
function restaurarFormulasDerivadas(solapa, aplicar) {
  const escribe = !!aplicar && DRY_RUN === false;
  Logger.log('=== restaurarFormulasDerivadas (paso 27) en "%s" (%s) ===', solapa, escribe ? 'ESCRIBE' : 'EN SECO');
  const sh = ssIntermedia_().getSheetByName(RDV_HOJA_RESPALDO_DERIVADAS);
  if (!sh || sh.getLastRow() < 2) { Logger.log('>>> No hay respaldo en %s: no se puede restaurar.', RDV_HOJA_RESPALDO_DERIVADAS); return { restauradas: 0 }; }
  const ctx = _ctxDerivadas_(solapa);
  const lineas = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues().filter(function (r) { return r[0] === solapa; });
  const resp = [];
  lineas.forEach(function (r) {
    const k = findIdxOr_(ctx.hdr, [r[1]], true);
    if (k == null) { Logger.log('  %s: no está la columna en "%s"', r[1], solapa); return; }
    resp.push({ col: k + 1, nombre: r[1], tipo: r[3], formula: r[4], formulaR1C1: r[5], filas: Number(r[6]) || 0 });
    Logger.log('  %s (columna %s): %s | %s', r[1], _letraDerivada_(k + 1), r[3], String(r[4]).slice(0, 160));
  });
  if (!escribe) { Logger.log('>>> EN SECO: restauraría %s fórmulas. Nada cambió.', resp.length); return { restauradas: 0, enSeco: true }; }
  restaurarFormulasDerivadas_(ctx.sh, ctx.hdr, resp);
  SpreadsheetApp.flush();
  Logger.log('>>> Restauradas %s fórmulas. Apagar DERIVADAS_POR_SCRIPT si estaba prendido.', resp.length);
  return { restauradas: resp.length };
}
