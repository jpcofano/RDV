/**
 * 52_RevisarTodo.js — REVISAR TODO (16/10, pedido del usuario): los pasos de revisión de SÓLO LECTURA, uno detrás de otro, en
 * una o varias ejecuciones. Se corre desde 99_Correr.js: `revisarTodo()` (y `reiniciarRevisarTodo()` para empezar de cero).
 *
 * - Los pasos, en orden: 68, 69, 70, 71, 72, 73, 75, 76, 78, 81 (REVISAR_TODO_PASOS). Ninguno escribe la base. NO están: el 74
 *   (escribe AGENDA_EQUIPO y oculta "Sugerencia - Equipo Directa"), el 80 (manda un mail) y el 82 (instala un activador).
 * - Cada paso, aislado: si falla, se anota y se sigue con el próximo.
 * - El progreso vive en la propiedad REVISAR_TODO_PROP: qué pasos se hicieron y el resumen de cada uno. Antes de empezar un paso
 *   se mira el reloj: si quedan menos de REVISAR_TODO_MARGEN_MS (o menos de lo que ese paso necesita, minS), para y dice
 *   "FALTAN: … — volvé a correr revisarTodo()". Al correrla de nuevo, sigue donde quedó.
 * - Un paso que corta la ejecución por el límite de 6 minutos (no se puede atrapar) queda anotado "en curso": la ejecución
 *   siguiente lo cuenta como cortado y lo reintenta; a los REVISAR_TODO_INTENTOS cortes, lo saltea.
 * - Al terminar: "TERMINADO" y un RESUMEN corto por paso, y se borra el progreso.
 *
 * Lo único que escribe es esa propiedad (y el log). Los pasos se llaman por sus wrappers de 99_Correr.js (el mismo anuncio).
 */

/** Los pasos de sólo lectura, en orden. `minS`: segundos que necesita como mínimo para empezar (un replay largo, de cero). */
function revisarTodoPasos_() {
  return [
    { n: 68, que: 'auditoría de cancelaciones', fn: function () { return paso68_auditoriaCancelaciones(); }, minS: 90 },
    { n: 69, que: 'duplicados que creó la agenda', fn: function () { return paso69_duplicadosAgenda(); }, minS: 60 },
    { n: 70, que: 'reglas de Seguridad / barrio del mail (en seco)', fn: function () { return paso70_reglasAgenda_enSeco(); }, minS: 60 },
    { n: 71, que: 'RDV CONJUNTO repetido (en seco)', fn: function () { return paso71_conjuntoRepetido_enSeco(); }, minS: 60 },
    { n: 72, que: '"Agenda (mail)" con el formato de Directa (en seco)', fn: function () { return paso72_agendaDirecta_enSeco(); }, minS: 60 },
    { n: 73, que: 'copia desde "Agenda Directa" (en seco)', fn: function () { return paso73_copiarAgendaDirecta_enSeco(); }, minS: 60 },
    { n: 75, que: 'la agenda segura de hoy (en seco)', fn: function () { return paso75_agendaSegura_enSeco(); }, minS: 90 },
    { n: 76, que: 'la agenda desde el 07/09, simulada', fn: function () { return paso76_replayAgendaSegura(); }, minS: 280 },
    { n: 78, que: 'cancelación que suspende vs regla 7', fn: function () { return paso78_cancelacionAutomatica(); }, minS: 90 },
    { n: 81, que: 'auditoría semanal (en seco)', fn: function () { return paso81_auditoriaSemanal_enSeco(); }, minS: 90 }
  ];
}

/** La corrida: sigue donde quedó la anterior. Devuelve { terminado, faltan, resumen }. */
function revisarTodo_(opciones) {
  opciones = opciones || {};
  const t0 = _revisarAhora_();
  const pasos = opciones.pasos || revisarTodoPasos_();
  const props = PropertiesService.getScriptProperties();
  let prog = null;
  try { prog = JSON.parse(props.getProperty(REVISAR_TODO_PROP) || 'null'); } catch (e) { prog = null; }
  const nueva = !prog;
  prog = prog || { inicio: new Date(t0).toISOString(), hechos: {}, resumen: {}, intentos: {}, enCurso: null, ejecuciones: 0 };
  prog.ejecuciones++;
  const guardar = function () { props.setProperty(REVISAR_TODO_PROP, JSON.stringify(prog)); };
  Logger.log('=== revisarTodo — %s (ejecución %s): pasos de SÓLO LECTURA, en orden: %s ===', nueva ? 'DE CERO' : 'SIGUE DONDE QUEDÓ',
             prog.ejecuciones, pasos.map(function (p) { return p.n; }).join(', '));
  // la ejecución anterior murió en el medio de un paso (el límite de 6 min no se puede atrapar)
  if (prog.enCurso != null) {
    const k = String(prog.enCurso);
    prog.intentos[k] = (prog.intentos[k] || 0) + 1;
    if (prog.intentos[k] >= REVISAR_TODO_INTENTOS) {
      prog.hechos[k] = true;
      prog.resumen[k] = 'SALTEADO: cortó la ejecución por el límite de 6 min ' + prog.intentos[k] + ' veces (correrlo solo, desde su paso)';
    } else prog.resumen[k] = 'se cortó por el límite de 6 min: se reintenta';
    Logger.log('  el paso %s cortó la ejecución anterior por el límite de 6 min (%s de %s)', k, prog.intentos[k], REVISAR_TODO_INTENTOS);
    prog.enCurso = null;
    guardar();
  }
  for (let i = 0; i < pasos.length; i++) {
    const p = pasos[i], k = String(p.n);
    if (prog.hechos[k]) continue;
    const quedan = REVISAR_TODO_LIMITE_MS - (_revisarAhora_() - t0);
    const necesita = Math.max(REVISAR_TODO_MARGEN_MS, (p.minS || 0) * 1000);
    // un paso largo espera a una ejecución nueva; pero si ya es una ejecución nueva y no alcanza igual, se intenta
    if (quedan < REVISAR_TODO_MARGEN_MS || (quedan < necesita && _revisarAhora_() - t0 > 5000)) {
      const faltan = pasos.filter(function (x) { return !prog.hechos[String(x.n)]; }).map(function (x) { return x.n; });
      guardar();
      Logger.log('*** FALTAN: %s — volvé a correr revisarTodo() (quedaban %s s; el paso %s necesita %s s) ***',
                 faltan.join(', '), Math.round(quedan / 1000), p.n, Math.round(necesita / 1000));
      return { terminado: false, faltan: faltan, resumen: prog.resumen };
    }
    prog.enCurso = p.n;
    guardar();
    const tp = _revisarAhora_();
    Logger.log('');
    Logger.log('##### revisarTodo: paso %s — %s #####', p.n, p.que);
    let linea;
    try {
      const r = p.fn();
      linea = 'OK (' + Math.round((_revisarAhora_() - tp) / 1000) + ' s)' + _resumenCortoRevisar_(r);
    } catch (err) {
      linea = 'FALLÓ (' + Math.round((_revisarAhora_() - tp) / 1000) + ' s): ' + String(err && err.message || err).split('\n')[0].slice(0, 300);
      Logger.log('>>> el paso %s falló: %s (se sigue con el próximo)', p.n, err && err.stack || err);
    }
    prog.hechos[k] = true;
    prog.resumen[k] = linea;
    prog.enCurso = null;
    guardar();
  }
  Logger.log('');
  Logger.log('*** TERMINADO (%s ejecución/es, desde %s) — RESUMEN ***', prog.ejecuciones, prog.inicio);
  pasos.forEach(function (p) { Logger.log('  paso %s (%s): %s', p.n, p.que, prog.resumen[String(p.n)] || '—'); });
  props.deleteProperty(REVISAR_TODO_PROP);
  return { terminado: true, faltan: [], resumen: prog.resumen };
}

/** Empezar de cero: borra el progreso guardado. */
function reiniciarRevisarTodo_() {
  PropertiesService.getScriptProperties().deleteProperty(REVISAR_TODO_PROP);
  Logger.log('revisarTodo: progreso borrado. La próxima revisarTodo() empieza por el paso %s.', revisarTodoPasos_()[0].n);
}

function _revisarAhora_() { return new Date().getTime(); }

/** Una línea con lo que devolvió el paso: su `resumen` si lo tiene, o los números de arriba del objeto. Nunca tira. */
function _resumenCortoRevisar_(r) {
  try {
    if (r == null) return '';
    if (typeof r !== 'object') return ' | ' + String(r).slice(0, 200);
    if (r.error) return ' | error: ' + String(r.error).slice(0, 200);
    const base = r.resumen != null ? r.resumen : (r.cuenta != null ? r.cuenta : r);
    if (typeof base !== 'object') return ' | ' + String(base).slice(0, 250);
    const partes = [];
    Object.keys(base).forEach(function (k) {
      const v = base[k];
      if (typeof v === 'number' || typeof v === 'boolean') partes.push(k + ' ' + v);
      else if (typeof v === 'string' && v.length <= 60) partes.push(k + ' ' + v);
      else if (Array.isArray(v)) partes.push(k + ' ' + v.length);
    });
    return partes.length ? ' | ' + partes.slice(0, 12).join(' · ').slice(0, 300) : '';
  } catch (e) { return ''; }
}
