/**
 * diagnostico/20_columnas_b.js — paso 46 (07/10): **el chequeo de las columnas de B** después de que el origen cambió
 * de columnas. SÓLO LECTURA: no escribe nada. Es el mismo chequeo que hace cada corrida del upsert antes de escribir
 * (`indicesB_` y `problemasFormularioB_`, 20_UpsertDestino.js), mirado sobre los formularios de los últimos
 * DIAS_CHEQUEO_B días, con ejemplos:
 *
 *   - todas las columnas de B reconocidas: ninguna obligatoria que falte, ninguna `inscriptos_*` sin mapear;
 *   - por formulario: Mail + RRSS + Difusión + Call Center + IVR = la suma de TODOS los canales de B; Masculinos +
 *     Femeninos + Sin identificar = Inscriptos; la suma de edades ≤ Inscriptos; ninguno con Inscriptos > 0 y todo lo
 *     demás en 0;
 *   - 5 ejemplos: lo que trae B y lo que se escribiría en el destino.
 *
 * Si algo no cierra lo dice, y la corrida de la hora no escribe esos datos (todos, si el problema es de columnas; los de
 * ese formulario, si es de un formulario).
 */
const DIAS_CHEQUEO_B = 30;

function chequearColumnasB() {
  Logger.log('=== chequearColumnasB (paso 46) — sólo lectura, no escribe nada ===');
  const cands = leerCandidatos_();
  const cb = cands.columnasB;
  Logger.log('--- columnas de "%s": %s encabezados | obligatorias de datos que faltan: %s | inscriptos_* sin mapear: %s ---',
             RDV_HOJA_B, cb.encabezados, cb.faltan.join('; ') || 'ninguna', cb.sinMapear.join(', ') || 'ninguna');
  const hoy = hoyMediodia_(), desde = new Date(hoy.getTime() - DIAS_CHEQUEO_B * 86400000);
  const fechaDe = function (c) { return (c.det && c.det.mejor) || toDate_(c.finRaw); };
  const recientes = cands.vivos.filter(function (c) { const f = fechaDe(c); return f && f >= desde && f <= hoy; });
  const conProblema = recientes.filter(function (c) { return c.problemasB.length; });
  const porTipo = {};
  conProblema.forEach(function (c) { c.problemasB.forEach(function (p) { const t = p.split(':')[0]; porTipo[t] = (porTipo[t] || 0) + 1; }); });
  Logger.log('--- formularios de los últimos %s días: %s | que NO cierran: %s (%s) ---', DIAS_CHEQUEO_B, recientes.length,
             conProblema.length, Object.keys(porTipo).map(function (t) { return t + ' ' + porTipo[t]; }).join(' · ') || '—');
  conProblema.slice(0, 30).forEach(function (c) { Logger.log('    NO CIERRA | B fila %s | %s | %s', c.fila, c.nombre, c.problemasB.join(' | ')); });

  // 5 ejemplos (con inscriptos), lo de B y lo que se escribiría
  const ejemplos = recientes.filter(function (c) { return c.inscriptos > 0 && !c.problemasB.length; }).slice(0, 5);
  Logger.log('--- 5 ejemplos: lo que trae B → lo que se escribiría en el destino ---');
  ejemplos.forEach(function (c) {
    const b = Object.keys(c.crudoB).filter(function (k) { return !esVacio_(c.crudoB[k]) && numOcero_(c.crudoB[k]) !== 0; })
      .map(function (k) { return k.replace(/^inscriptos_?/i, '') + ' ' + c.crudoB[k]; }).join(', ');
    const d = ['Inscriptos'].concat(CAMPOS_CANALES_).map(function (k) { return k + ' ' + (c.cuentas[k] === '' ? '—' : c.cuentas[k]); })
      .concat(CAMPOS_DESAGREGADO_.map(function (k) { return k + ' ' + (c.datos[k] === '' ? '—' : c.datos[k]); })).join(', ');
    Logger.log('    B fila %s | %s', c.fila, c.nombre);
    Logger.log('      B: inscriptos %s, %s', c.inscriptos, b || '(nada más)');
    Logger.log('      → destino: %s', d);
  });
  const ok = !cb.bloqueoGlobal.length && !conProblema.length;
  if (cb.bloqueoGlobal.length) {
    Logger.log('>>> NO CIERRA (columnas): %s. La corrida de la hora NO escribe ningún dato de B (sí la traza, Asistentes y STATUS) ' +
               'hasta corregir COLUMNAS_B / MAPEO_CANALES en 00_Config.js.', cb.bloqueoGlobal.join(' | '));
  } else if (conProblema.length) {
    Logger.log('>>> %s formularios no cierran: la corrida de la hora no escribe SUS datos (los demás, sí). Mirarlos arriba.', conProblema.length);
  } else {
    Logger.log('>>> TODO CIERRA: la corrida de la hora escribe los datos de B (sólo en celdas vacías, como siempre).');
  }
  return { ok: ok, encabezados: cb.encabezados, faltan: cb.faltan.length, sinMapear: cb.sinMapear.length, recientes: recientes.length,
           noCierran: conProblema.length, porTipo: porTipo, ejemplos: ejemplos.length };
}
