/**
 * diagnostico/13_fichas_prueba.js — PASO 21: las fichas de REVISAR_MATCH, de prueba (03/10).
 *
 * NO escribe el destino. Escribe en la intermedia sólo la solapa RDV_HOJA_FICHAS_PRUEBA (el equipo no
 * la mira; REVISAR_MATCH no se toca). Para validar las fichas antes de pasarlas al equipo
 * (REVISAR_COMO_FICHAS, 00_Config.js):
 *
 *   1) al log, las fichas de `filas` (las pide el usuario), estén o no pendientes y activas. Para eso usa
 *      el plan sobre TODO el historial (`{ historial: true }`): una fila cerrada (más de DIAS_ACTIVOS
 *      días) no tiene veredicto en el plan del upsert. El log dice si la fila aparecería en la solapa;
 *   2) a RDV_HOJA_FICHAS_PRUEBA, la solapa entera como la escribiría el upsert: el plan de las filas
 *      activas, con sus colores y desplegables.
 *
 * Lee el destino y B una sola vez: los dos planes usan las mismas entradas.
 */
function fichasDePrueba(filas) {
  const t0 = new Date();
  Logger.log('=== fichasDePrueba (paso 21) — NO escribe el destino; sólo la solapa "%s" de la intermedia ===',
             RDV_HOJA_FICHAS_PRUEBA);
  Logger.log('  solapa destino (sólo lectura): %s', descripcionHojaDestino_());
  Logger.log('  filas activas: %s', descActivas_());
  const entradas = { dest: leerDestino_(), cands: leerCandidatos_(), comunas: leerComunasMap_() };
  const asis = cruzarAsistentes_(entradas.dest, entradas.comunas);

  // 1) las fichas pedidas, sobre todo el historial
  const planH = calcularPlan_(true, entradas, { historial: true });
  const fxH = armarFichas_(planH, asis, { filas: filas });
  Logger.log('--- 1) las fichas de las filas %s ---', filas.join(', '));
  Logger.log('    marcas de color: [v] verde = coincide con la reunión · [x] rojo = no coincide · [·] gris = no se puede comparar' +
             ' · [!] amarillo = el eje no coincide (sólo para la persona)');
  filas.forEach(function (n) {
    const fi = fxH.fichas.filter(function (x) { return x.f.fila === n; })[0];
    if (!fi) { Logger.log('  ===== fila %s: no existe en el destino (o es una fila vacía) =====', n); return; }
    const activa = esFilaActiva_(fi.f.fecha);
    const pendiente = fi.veredicto === 'REVISAR_MATCH' || fi.veredicto === 'SIN_MATCH';
    Logger.log('  ===== FICHA fila %s — %s | %s =====', n, fi.veredicto + (fi.motivo !== fi.veredicto ? ' (' + fi.motivo + ')' : ''),
               !activa ? 'CERRADA (más de ' + DIAS_ACTIVOS + ' días): NO aparece en la solapa'
               : pendiente ? 'aparece en la solapa' : 'no está pendiente: no aparece en la solapa');
    fichaComoTexto_(fxH, fi).forEach(function (l) { Logger.log(l); });
  });

  // 2) la solapa entera, como la escribiría el upsert (filas activas)
  const plan = calcularPlan_(true, entradas);
  const fx = armarFichas_(plan, asis);
  escribirFichas_(RDV_HOJA_FICHAS_PRUEBA, fx);
  Logger.log('--- 2) "%s": %s fichas pendientes (filas activas) | %s resueltas ---', RDV_HOJA_FICHAS_PRUEBA,
             fx.pendientes, fx.resueltas);
  Object.keys(fx.porMotivo).sort(function (a, b) { return fx.porMotivo[b] - fx.porMotivo[a]; }).forEach(function (m) {
    Logger.log('    %s: %s', m, fx.porMotivo[m]);
  });
  Logger.log('  filas activas: %s | cerradas: %s (sin resolver: %s) | futuras: %s', plan.res.activas,
             plan.res.cerradas, plan.res.cerradasSinResolver, plan.res.futuras.t);
  Logger.log('  tiempo de corrida: %s s', ((new Date() - t0) / 1000).toFixed(1));
  return { fichas: fx.pendientes, porMotivo: fx.porMotivo, pedidas: fxH.fichas.length };
}

/**
 * PASO 33 (06/10): la demo del formato aprobado (`demoRevisarMatch`, los 3 casos de la ficha técnica), en la
 * solapa RDV_HOJA_REVISAR_DEMO de la intermedia. No lee el destino ni B; no toca REVISAR_MATCH. Sirve para
 * mirar la sección 9 de docs/revisar-match-ficha-tecnica.md en Sheets antes de pasar a datos reales.
 */
function demoFormatoRevisar() {
  const ss = ssIntermedia_();
  const sh = ss.getSheetByName(RDV_HOJA_REVISAR_DEMO) || ss.insertSheet(RDV_HOJA_REVISAR_DEMO);
  const mapa = demoRevisarMatch(sh);
  SpreadsheetApp.flush();
  const tipos = {};
  Object.keys(mapa).forEach(function (r) { const t = mapa[r].tipo; tipos[t] = (tipos[t] || 0) + 1; });
  Logger.log('=== demo del formato de REVISAR_MATCH (paso 33): solapa "%s" de la intermedia ===', RDV_HOJA_REVISAR_DEMO);
  Logger.log('  líneas por tipo: %s', Object.keys(tipos).map(function (t) { return t + ' ' + tipos[t]; }).join(' | '));
  Logger.log('  A MIRAR EN LA SOLAPA (ficha técnica §9):');
  Logger.log('    1. el "¿por qué?" de la fila 778 (Muzzio), que tiene 2 líneas: ¿se ve en DOS renglones y desborda a la derecha?');
  Logger.log('    2. escribir un comentario largo (más de ~40 caracteres) en B de una línea REUNIÓN: se ve recortado');
  Logger.log('    3. el desplegable de ELEGIR (A de cada línea REUNIÓN): ¿chip con flecha?');
  return { mapa: mapa, tipos: tipos };
}

/**
 * PASO 34 (06/10): las fichas de hoy con el formato aprobado, en la solapa RDV_HOJA_REVISAR_FORMATO_PRUEBA de
 * la intermedia (el plan en seco de las filas activas: el mismo que usa el upsert). NO escribe el destino ni
 * REVISAR_MATCH. Para mirar datos reales en el formato nuevo antes de prender REVISAR_FORMATO_NUEVO.
 */
function fichasFormatoDePrueba() {
  const t0 = new Date();
  Logger.log('=== fichasFormatoDePrueba (paso 34) — NO escribe el destino; sólo la solapa "%s" de la intermedia ===',
             RDV_HOJA_REVISAR_FORMATO_PRUEBA);
  const entradas = { dest: leerDestino_(), cands: leerCandidatos_(), comunas: leerComunasMap_() };
  const plan = calcularPlan_(true, entradas);
  const fv = armarFichasFormato_(plan, cruzarAsistentes_(entradas.dest, entradas.comunas));
  const w = escribirFichasFormato_(RDV_HOJA_REVISAR_FORMATO_PRUEBA, fv);
  Logger.log('  %s fichas pendientes | %s resueltas', w.pendientes, w.resueltas);
  Object.keys(fv.porMotivo).sort(function (a, b) { return fv.porMotivo[b] - fv.porMotivo[a]; }).forEach(function (m) {
    Logger.log('    %s: %s', m, fv.porMotivo[m]);
  });
  // Lo que el diseño no cubre: un "¿por qué?" de más de dos renglones, una línea "coincide" de más de ~160.
  const largos = fv.pendientes.filter(function (p) { return p.porque.length > 2 * RM.POR_QUE_MAX; });
  const coincideLargas = [];
  fv.pendientes.forEach(function (p) {
    p.opciones.forEach(function (o, k) { if (o.coincide.length > 160) coincideLargas.push(p.reunion.fila + ' op' + (k + 1)); });
  });
  Logger.log('  "¿por qué?" de más de %s caracteres (el segundo renglón también se pasa): %s%s', 2 * RM.POR_QUE_MAX,
             largos.length, largos.length ? ' — filas ' + largos.map(function (p) { return p.reunion.fila; }).join(', ') : '');
  Logger.log('  líneas "coincide" de más de 160 caracteres: %s%s', coincideLargas.length,
             coincideLargas.length ? ' — ' + coincideLargas.join(', ') : '');
  Logger.log('  tiempo de corrida: %s s', ((new Date() - t0) / 1000).toFixed(1));
  return { pendientes: w.pendientes, resueltas: w.resueltas, porMotivo: fv.porMotivo,
           porqueLargos: largos.length, coincideLargas: coincideLargas.length };
}

/**
 * Borra la solapa de prueba de las fichas (RDV_HOJA_FICHAS_PRUEBA) de la intermedia, una vez aprobadas
 * (03/10). Sólo esa solapa, por nombre: si no existe, no hace nada. No toca el destino ni REVISAR_MATCH.
 */
function borrarSolapaFichasPrueba() {
  const ss = ssIntermedia_();
  const sh = ss.getSheetByName(RDV_HOJA_FICHAS_PRUEBA);
  if (!sh) { Logger.log('No existe la solapa "%s": nada que borrar.', RDV_HOJA_FICHAS_PRUEBA); return false; }
  ss.deleteSheet(sh);
  Logger.log('Borrada la solapa "%s" de la intermedia.', RDV_HOJA_FICHAS_PRUEBA);
  return true;
}
