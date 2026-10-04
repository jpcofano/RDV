/**
 * diagnostico/12_por_que_vacia.js — PASO 20: "por qué está vacía" (03/10). SÓLO LECTURA.
 *
 * Para un rango de filas del destino (por defecto, las filas ACTIVAS: DIAS_ACTIVOS, 03/10), mira las columnas que escribe
 * el sistema —Inscriptos, los cinco canales, Masculinos, Femeninos, las 5 edades, Sin identificar,
 * Asistentes y STATUS— y, para cada celda vacía (o en 0 en Inscriptos; en STATUS, lo que no sea
 * "Realizada"), da UNA causa:
 *
 *   a) la fila no tiene formulario: REVISAR_MATCH (con su motivo), SIN_MATCH, pendiente de barrio,
 *      "ninguno" de una persona, o RDV_UID con la traza ambigua;
 *   b) B trae 0 o vacío en ese campo;
 *   c) desagregado retenido: Inscriptos del destino ≠ el de B;
 *   d) Asistentes: RDV CONJUNTO no tiene la fila / nombre con varias figuras o ninguna / 2+ filas sin
 *      poder desempatar / dos valores distintos / RDV CONJUNTO la tiene sin asistentes;
 *   e) STATUS: no está "en agenda", o la fila no tiene asistentes;
 *   f) **ninguna de las anteriores → DEBERÍA ESTAR ESCRITA**: el sistema la escribiría ahora mismo
 *      (`celdasDeDecision_`, la misma función que usa la escritura). Después de una corrida real del
 *      upsert, es un bug: se lista aparte. Tiene que dar 0.
 *
 * Usa el mismo plan (`calcularPlan_`) y el mismo cruce de Asistentes (`cruzarAsistentes_`) que el
 * upsert, y la misma decisión por fila (`decisionDeFila_`). No escribe nada.
 */

/** Las columnas que revisa, en el orden del log. */
const COLUMNAS_PASO20_ = ['Inscriptos', 'Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión', 'Masculinos', 'Femeninos',
                          '18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar', 'Asistentes', 'STATUS REUNIÓN'];

function porQueVacia(desde, hasta) {
  Logger.log('=== porQueVacia (paso 20) — sólo lectura, no escribe nada ===');
  Logger.log('  solapa destino: %s', descripcionHojaDestino_());
  // Sin rango: las filas activas, con el plan del upsert. Con rango (p. ej. PASO20_DESDE = 2, todo el
  // destino, después del paso 22): el plan de TODO el historial, para que una fila cerrada tenga su decisión.
  const soloActivas = !desde && !hasta;
  const plan = calcularPlan_(true, null, soloActivas ? null : { historial: true });
  const dest = plan.dest;
  const asis = cruzarAsistentes_(dest, plan.comunas);
  const d1 = desde || 2, d2 = hasta || Infinity;
  if (soloActivas) Logger.log('  filas: las activas (%s)', descActivas_());
  else Logger.log('  filas: de la %s a la %s', d1, d2 === Infinity ? 'última' : d2);

  const porDecision = decisionesPorFila_(plan.decisiones);
  const ambiguaDe = {}, conflictoDe = {};
  asis.ambiguas.forEach(function (x) { (x.nums || []).forEach(function (n) { ambiguaDe[n] = x; }); });
  asis.conflicto.forEach(function (x) { conflictoDe[x.f.fila] = x; });
  const hoy = _hoy_();

  const causas = {}, deberia = [], lineas = [];
  const sumar = function (c) { causas[c] = (causas[c] || 0) + 1; };

  dest.filas.forEach(function (f) {
    if (f.fila < d1 || f.fila > d2) return;
    if (soloActivas && !esFilaActiva_(f.fecha)) return;
    const pf = plan.porFila[f.fila] || {};
    const d = decisionDeFila_(f, porDecision, asis);
    const ahora = celdasDeDecision_(dest, d, f.valores, true);
    const escribiria = {};
    ahora.celdas.forEach(function (x) { escribiria[x.col - 1] = true; });
    const futura = f.fecha && f.fecha > hoy;

    COLUMNAS_PASO20_.forEach(function (col) {
      const k = dest.D[col];
      if (k == null) return;
      const v = f.valores[k];
      let vacia;
      if (col === 'STATUS REUNIÓN') vacia = normStatus_(v) !== normStatus_(TRANSICION_REALIZADA.hacia);
      else vacia = esVacio_(v) || (col === 'Inscriptos' && INSCRIPTOS_CERO_ES_VACIO && num(v) === 0);
      if (!vacia) return;

      let causa;
      if (futura) causa = 'reunión futura';
      else if (col === 'STATUS REUNIÓN') causa = _causaStatus_(f, v, d, ahora, dest);
      else if (col === 'Asistentes') causa = escribiria[k] ? null : _causaAsistentes_(f, asis, ambiguaDe, conflictoDe);
      else causa = escribiria[k] ? null : _causaDato_(f, col, pf, d, dest);
      if (!causa) {
        causa = 'f) DEBERÍA ESTAR ESCRITA';
        deberia.push({ f: f, col: col });
      }
      sumar(causa);
      lineas.push({ f: f, col: col, causa: causa });
    });
  });

  Logger.log('--- celdas vacías, una por línea (fila | figura | fecha | columna → causa) ---');
  lineas.slice(0, 500).forEach(function (x) {
    Logger.log('  %s | %s | %s | %s → %s', x.f.fila, x.f.figura, fmtFecha_(x.f.fecha), x.col, x.causa);
  });
  if (lineas.length > 500) Logger.log('  … y %s más (ver el resumen)', lineas.length - 500);
  Logger.log('--- resumen por causa ---');
  Object.keys(causas).sort(function (a, b) { return causas[b] - causas[a]; })
    .forEach(function (c) { Logger.log('  %s: %s', c, causas[c]); });
  Logger.log('--- f) DEBERÍA ESTAR ESCRITA: %s   (tiene que dar 0 después de una corrida real del upsert) ---', deberia.length);
  deberia.forEach(function (x) { Logger.log('  fila %s | %s | %s | %s', x.f.fila, x.f.figura, fmtFecha_(x.f.fecha), x.col); });
  return { causas: causas, deberia: deberia.length, lineas: lineas.length };
}

/** a) / b) / c) para Inscriptos, canales y desagregado. null = el sistema la escribiría (f). */
function _causaDato_(f, col, pf, d, dest) {
  const c = d.cand;
  if (!c) {
    if (pf.veredicto === 'REVISAR_MATCH') return 'a) sin formulario: REVISAR_MATCH (' + (pf.motivo || '?') + ')';
    if (pf.veredicto === 'SIN_MATCH') return 'a) sin formulario: SIN_MATCH (' + (pf.motivo || '?') + ')';
    if (pf.veredicto === 'pendiente_barrio') return 'a) sin formulario: pendiente de barrio';
    if (pf.veredicto === 'ninguno_por_persona') return 'a) sin formulario: "ninguno" de una persona';
    if (pf.veredicto === 'rdv_uid') return 'a) sin formulario: RDV_UID con la traza ambigua';
    return 'a) sin formulario: ' + (pf.veredicto || 'sin veredicto');
  }
  const cu = c.cuentas || {};
  const deB = CAMPOS_DESAGREGADO_.indexOf(col) >= 0 ? c.datos[col] : cu[col];
  if (deB === '' || deB === undefined || deB === null || (col === 'Inscriptos' && num(deB) === 0)) {
    return 'b) B trae 0 o vacío';
  }
  if (CAMPOS_DESAGREGADO_.indexOf(col) >= 0) {
    let insD = dest.D['Inscriptos'] != null ? num(f.valores[dest.D['Inscriptos']]) : '';
    if (INSCRIPTOS_CERO_ES_VACIO && insD === 0) insD = '';
    if (insD !== '' && insD !== cu['Inscriptos']) return 'c) desagregado retenido: Inscriptos del destino ≠ B';
  }
  return null;
}

/** d) para Asistentes. */
function _causaAsistentes_(f, asis, ambiguaDe, conflictoDe) {
  if (asis.error) return 'd) RDV CONJUNTO no se pudo leer';
  if (conflictoDe[f.fila]) return 'd) dos valores distintos en RDV CONJUNTO';
  if (ambiguaDe[f.fila]) return 'd) 2+ filas con esa figura y fecha, sin desempate';
  if (asis.filasSinAsis[f.fila]) return 'd) RDV CONJUNTO tiene la fila, sin asistentes';
  const fig = normalizeText_(f.figura), dia = f.fecha ? ymd_(f.fecha) : '';
  const mismaFecha = function (x) { return x.fec && ymd_(x.fec) === dia; };
  if (asis.variasFiguras.some(function (x) {
    return mismaFecha(x) && x.cands.some(function (c) { return normalizeText_(c) === fig; });
  })) return 'd) el nombre en RDV CONJUNTO tiene varias figuras';
  if (asis.sinFigura.some(mismaFecha)) return 'd) RDV CONJUNTO no tiene la fila (ese día hay nombres sin figura)';
  return 'd) RDV CONJUNTO no tiene la fila';
}

/** e) para STATUS (lo que no es "Realizada"). null = el sistema la pasaría a Realizada (f). */
function _causaStatus_(f, v, d, ahora, dest) {
  if (normStatus_(v) !== normStatus_(TRANSICION_REALIZADA.desde)) return 'e) STATUS no está "en agenda" (' + (str(v) || 'vacío') + ')';
  const iAs = dest.D['Asistentes'];
  const tiene = (iAs != null && !esVacio_(f.valores[iAs])) || (d.asis !== '' && d.asis !== undefined);
  if (!tiene || numOcero_(iAs != null && !esVacio_(f.valores[iAs]) ? f.valores[iAs] : d.asis) < MIN_ASISTENTES_REALIZADA) {
    return 'e) STATUS: la fila no tiene asistentes';
  }
  return ahora.status ? null : 'e) STATUS: no pasa (ver el log del upsert)';
}
