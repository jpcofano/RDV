/**
 * diagnostico/28_manana.js — SÓLO LECTURA (08/10): lo que corre `manana()` (99_Correr.js), para la mañana del 09/10. Todas
 * las mediciones de la noche del 08/10, en orden, en UNA ejecución, y un RESUMEN de qué está listo para prender. NO ESCRIBE
 * NADA: ni la base, ni la intermedia, ni el archivo de la lista. Si un paso falla, lo dice y sigue con el próximo.
 *   1. los IDs de los encuentros: `medirIds()` (paso 55) — el cruce por solapa (misma fecha / ±3 / ambiguos / sin fila /
 *      conflictos), el caso 3735 → 805, las fechas de envío, las filas sin ID, lo que escribiría el paso 57;
 *   2. el guardián (sólo lo que se mide sin su texto): las filas cuyas trazas no cuadran HOY y la prueba del orden parcial
 *      (grande y chico), en memoria;
 *   3. ocultar y proteger: qué columnas del sistema hay, cuáles están ocultas o protegidas hoy, y la propuesta.
 * Las listas largas van acotadas (MANANA_TOPE_LISTAS_): el log de Apps Script tiene un límite, y lo que se perdería es el
 * resumen, que va al final. Las listas enteras: paso 55 solo, o IDS_SIN_CRUZAR con el paso 56.
 */

/** Cuántas líneas por lista en manana() (las listas enteras: paso 55 solo). */
const MANANA_TOPE_LISTAS_ = 12;

function mananaMediciones_() {
  const t0 = Date.now(), r = {};
  const pasos = [
    ['1. IDs de los encuentros — medirIds() (paso 55)', function () { r.ids = medirIds({ tope: MANANA_TOPE_LISTAS_ }); }],
    ['2 y 3. el guardián y ocultar/proteger — medirGuardian()', function () { r.guardian = medirGuardian({ tope: MANANA_TOPE_LISTAS_ }); }]
  ];
  Logger.log('########## manana() — SÓLO LECTURA: no escribe nada (ni la base, ni la intermedia, ni la lista) ##########');
  pasos.forEach(function (p, i) {
    const t = Date.now();
    Logger.log('');
    Logger.log('########## ' + p[0] + ' ##########');
    try {
      p[1]();
      Logger.log('########## OK (' + Math.round((Date.now() - t) / 1000) + ' s)');
    } catch (e) {
      r['error' + i] = String(e && e.message || e);
      Logger.log('########## ERROR en ' + p[0] + ' (sigue con el próximo): ' + (e && e.stack ? e.stack : e));
    }
  });
  Logger.log('');
  Logger.log('########## manana() — RESUMEN: qué está listo para prender (' + Math.round((Date.now() - t0) / 1000) + ' s) ##########');
  r.resumen = _resumenManana_(r);
  return r;
}

/** El resumen de manana(): por tema, listo o no, con los números que lo deciden y qué prender. Devuelve las líneas. */
function _resumenManana_(r) {
  const out = [];
  const log = function (s) { out.push(s); Logger.log(s); };
  const ids = r.ids, g = r.guardian;
  if (!ids) {
    log('  IDS: NO SE PUDO MEDIR (' + (r.error0 || '¿?') + '). Nada para prender.');
  } else {
    const c = ids.conteo;
    const listo = !!(ids.control && ids.control.ok && !ids.solapasSinLeer.length && !ids.formulas[COLUMNA_ID_CUENTAS]);
    log('  IDS ("ID cuentas" y "Fecha envío campañas"): ' + (listo ? 'LISTO para seguir' : 'NO LISTO: mirar lo de abajo'));
    log('     el caso 3735: ' + (ids.control ? ids.control.texto : '—'));
    log('     cruzan: misma fecha ' + c.mismaFecha + ', fecha distinta (±' + IDS_DIAS_FECHA_DISTINTA + ') ' + c.fechaDistinta +
        ' | ambiguos ' + c.ambiguo + ' | sin fila ' + c.sinFila + ' (+ ' + c.futuraSinFila + ' futuras) | conflictos ' + c.conflicto +
        ' | Funcionario no reconocido ' + c.noReconocido + ' | sin fecha ' + c.sinFecha + ' | no son un ID ' + ids.idNoValido);
    log('     el paso 57 escribiría ' + c.escribeId + ' IDs y ' + c.escribeFecha + ' fechas de envío (' + c.reunionFutura +
        ' esperan que la reunión pase); IDS_SIN_CRUZAR, ' + ids.sinCruzar + ' líneas' +
        (ids.columnasFaltan.length ? '; agregaría ' + ids.columnasFaltan.join(' y ') : '') +
        (ids.formulas[COLUMNA_ID_CUENTAS] || ids.formulas[COLUMNA_FECHA_ENVIO] ? '; OJO: columnas con fórmulas' : ''));
    if (ids.solapasSinLeer.length) log('     solapas que no se leyeron: ' + ids.solapasSinLeer.join(' | '));
    log('     si da bien: paso56_idsHistorial_enSeco() (mirar IDS_SIN_CRUZAR) → paso57_idsHistorial() (escribe UNA vez) → ' +
        'IDS_EN_LA_HORA = true + clasp push.');
  }
  if (!g) {
    log('  GUARDIÁN: NO SE PUDO MEDIR (' + (r.error1 || '¿?') + ').');
    log('  OCULTAR Y PROTEGER: NO SE PUDO MEDIR (el mismo error).');
  } else {
    const grande = g.detecta === null ? 'NO ES CONCLUYENTE (la base no tiene filas con traza)'
      : g.detecta ? 'se ve (' + g.parcial + ' filas que no cuadran, hoy ' + g.hoy + ')' : 'NO se ve: mirar el log';
    const chico = g.detectaChico === null ? 'no es concluyente (' + (g.trazadas ? 'hoy ya está desalineada' : 'sin trazas') + ')'
      : g.detectaChico ? 'también se ve (la racha)' : 'NO se ve (un orden parcial del mes activo pasaría sin que lo note)';
    log('  GUARDIÁN: NO LISTO — su texto no llegó a la sesión; no hay nada que prender. Línea de base de hoy: ' + g.hoy + ' de ' +
        g.trazadas + ' filas con traza no cuadran (' + g.veredictoHoy + ', la racha más larga ' + g.rachaHoy + '); el orden parcial ' +
        'grande ' + grande + '; el chico ' + chico + '.');
    const inv = g.inventario || {};
    if (inv.error) log('  OCULTAR Y PROTEGER: NO SE PUDO MEDIR (' + inv.error + ').');
    else {
      log('  OCULTAR Y PROTEGER: NO LISTO — propuesta (falta el texto del guardián): ocultar ' + inv.proponeOcultar +
          ' columnas internas y proteger con advertencia las ' + inv.columnas.length + ' del sistema; hoy ' + inv.ocultas +
          ' ocultas y ' + inv.protegidas + ' con alguna protección.');
    }
  }
  log('  IDS_EN_LA_HORA = ' + IDS_EN_LA_HORA + (IDS_EN_LA_HORA ? ' (la corrida de la hora ya escribe los IDs de las filas activas).'
                                                            : ' (la corrida de la hora no toca los IDs: todo lo demás, como ayer).'));
  return out;
}
