/**
 * 52_RevisarTodo.js — REVISAR TODO (16/10, pedido del usuario): los pasos de revisión de SÓLO LECTURA, uno detrás de otro, en
 * una o varias ejecuciones. Se corre desde 99_Correr.js: `revisarTodo()` (y `reiniciarRevisarTodo()` para empezar de cero).
 *
 * - Los pasos, en orden: 68, 69, 70, 71, 72, 73, 75, 76, 78, 81, 91, 93, 94, 95 (revisarTodoPasos_). Ninguno escribe la base. NO
 *   están: el 74 (escribe AGENDA_EQUIPO y oculta "Sugerencia - Equipo Directa"), el 80 (manda un mail), el 82 (instala un
 *   activador) y el 92 (suspende la fila 825).
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
    { n: 81, que: 'auditoría semanal (en seco)', fn: function () { return paso81_auditoriaSemanal_enSeco(); }, minS: 90 },
    // 16/10: los de "el mail manda" y de AGENDA_DUPLICADOS, también de sólo lectura (el 92 NO: escribe la fila 825)
    { n: 91, que: 'la fila 825 cancelada en el mail (en seco)', fn: function () { return paso91_cancelarFila825_enSeco(); }, minS: 90 },
    { n: 93, que: 'cancelaciones por el mail desde el 15/07', fn: function () { return paso93_cancelacionesMail(); }, minS: 120 },
    { n: 94, que: 'las decisiones de AGENDA_DUPLICADOS', fn: function () { return paso94_eleccionesAgenda(); }, minS: 90 },
    { n: 95, que: 'RDV CONJUNTO "Cancelado" desde el 15/07', fn: function () { return paso95_cancelacionesConjunto(); }, minS: 60 }
  ];
}

/** La corrida: sigue donde quedó la anterior. Devuelve { terminado, faltan, resumen }. */
function revisarTodo_(opciones) {
  opciones = opciones || {};
  const t0 = _revisarAhora_();
  const pasos = opciones.pasos || revisarTodoPasos_();
  // 21/10: la misma mecánica para otras listas (c19_cierre_soloLectura): su propiedad, su nombre y su forma de resumir cada paso
  const PROP = opciones.prop || REVISAR_TODO_PROP, NOMBRE = opciones.nombre || 'revisarTodo';
  const props = PropertiesService.getScriptProperties();
  let prog = null;
  try { prog = JSON.parse(props.getProperty(PROP) || 'null'); } catch (e) { prog = null; }
  const nueva = !prog;
  prog = prog || { inicio: new Date(t0).toISOString(), hechos: {}, resumen: {}, intentos: {}, enCurso: null, ejecuciones: 0 };
  prog.ejecuciones++;
  const guardar = function () { props.setProperty(PROP, JSON.stringify(prog)); };
  Logger.log('=== %s — %s (ejecución %s): pasos de SÓLO LECTURA, en orden: %s ===', NOMBRE, nueva ? 'DE CERO' : 'SIGUE DONDE QUEDÓ',
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
      Logger.log('*** FALTAN: %s — volvé a correr %s() (quedaban %s s; el paso %s necesita %s s) ***',
                 faltan.join(', '), NOMBRE, Math.round(quedan / 1000), p.n, Math.round(necesita / 1000));
      return { terminado: false, faltan: faltan, resumen: prog.resumen };
    }
    prog.enCurso = p.n;
    guardar();
    const tp = _revisarAhora_();
    Logger.log('');
    Logger.log('##### %s: paso %s — %s #####', NOMBRE, p.n, p.que);
    let linea;
    try {
      const r = p.fn();
      linea = p.resumir ? p.resumir(r) + ' (' + Math.round((_revisarAhora_() - tp) / 1000) + ' s)'
                        : 'OK (' + Math.round((_revisarAhora_() - tp) / 1000) + ' s)' + _resumenCortoRevisar_(r);
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
  props.deleteProperty(PROP);
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

// ===================== 21/10: c19_cierre_soloLectura() (00_Correr.js) =====================

/**
 * Los pasos de SÓLO LECTURA del cierre, en orden: c13 (paso 110), c20 (paso 111), c30 (paso 116), c40 (paso 72) y c44 (paso 81), con la
 * misma mecánica que revisarTodo (FALTAN / sigue donde quedó / TERMINADO + RESUMEN) y una línea por paso: LISTO o NO LISTO y qué mirar.
 * Ninguno deja una huella que haga falta después (la del c22 va con el c21, aparte): al volver a correr, todo se recalcula de cero.
 */
function cierreSoloLecturaPasos_() {
  const num = function (v) { return typeof v === 'number' ? v : 0; };
  return [
    { n: 'c13', que: 'Reprogramada en vez de Suspendida, desde el 15/07 (paso 110)', fn: function () { return c13_reprogramadas(); }, minS: 120,
      resumir: function (r) {
        const c = r && r.cuenta;
        if (!c) return 'NO LISTO: el paso no devolvió la cuenta' + (r && r.error ? ' (' + r.error + ')' : '');
        return 'LISTO para decidir AGENDA_REPROGRAMADA: Reprogramada ' + num(c.reprogramada) + ' | Suspendida ' + num(c.suspendida) +
               ' | coinciden ' + num(c.coincide) + ' | NO coinciden ' + num(c.noCoincide) + (num(c.noCoincide) ? ' (mirar en el log cuáles)' : '') +
               ' | pasarían de Suspendida a Reprogramada ' + num(c.pasaria) + ' | las marcaría hoy ' + num(c.marcariaHoy);
      } },
    { n: 'c20', que: 'el guardián en seco (paso 111)', fn: function () { return c20_guardian_enSeco(); }, minS: 60,
      resumir: function (r) {
        if (!r || !r.clases) return 'NO LISTO: el paso no devolvió las clases';
        const mal = [];
        if (r.clases.sinClase && r.clases.sinClase.length) mal.push(r.clases.sinClase.length + ' columnas SIN CLASE (' + r.clases.sinClase.slice(0, 5).join(', ') + ')');
        if (r.copiaNueva && r.copiaNueva.desalineada) mal.push('con una copia nueva da DESALINEADA');
        if (r.copiaNueva && r.copiaNueva.cambios) mal.push('con una copia nueva da ' + r.copiaNueva.cambios + ' cambios (mirar el punto 3)');
        if (r.copiaNueva && r.copiaNueva.clavesRepetidas) mal.push(r.copiaNueva.clavesRepetidas + ' claves repetidas (mirar el punto 3)');
        if (!r.prueba) mal.push('la prueba del orden parcial no se pudo hacer');
        else if (!r.prueba.frena) mal.push('la prueba del orden parcial NO FRENA');
        return (mal.length ? 'NO LISTO: ' + mal.join(' | ') : 'LISTO: ninguna columna sin clase, la copia nueva da 0, la prueba frena') +
               (r.ocultarProteger ? ' | ocultaría ' + r.ocultarProteger.ocultar + ', protegería ' + r.ocultarProteger.proteger : '') +
               ' → sigue c21, c22, c23';
      } },
    { n: 'c30', que: 'lo viejo se deja como está (paso 116)', fn: function () { return c30_corteRevision_enSeco(); }, minS: 150,
      resumir: function (r) {
        if (!r) return 'NO LISTO: el paso no devolvió nada';
        if (r.error) return 'NO LISTO: el seco se cortó (' + String(r.error).slice(0, 150) + ')';
        const sol = (r.solapas || []).map(function (s) { return s.nombre + ' −' + s.salen; }).join(', ');
        return (r.problemas && r.problemas.length ? 'NO LISTO: DESAPARECERÍA ALGO del corte en adelante o sin fecha (' + r.problemas.length + '; mirar el log)'
                                                   : 'LISTO (VERIFICACIÓN OK)') + (sol ? ' | dejan de aparecer: ' + sol : '') +
               ' → para prender REVISION_DESDE_FECHA_CORTE';
      } },
    { n: 'c40', que: '"Agenda (mail)" con el formato de "Agenda Directa" (paso 72)', fn: function () { return c40_agendaDirecta_enSeco(); }, minS: 30,
      resumir: function (r) {
        if (!r) return 'NO LISTO: el paso no devolvió nada';
        return (r.fuente === 'directa' ? 'LISTO: "Agenda Directa" encontrada y coincide' : 'NO LISTO: se usaría el respaldo (' + (r.motivo || 'sin motivo') + ')') +
               ' | ' + (r.columnas || []).length + ' columnas, ' + num(r.renglones) + ' renglones → sigue c41, c42';
      } },
    { n: 'c44', que: 'la auditoría de los lunes, en seco (paso 81)', fn: function () { return c44_auditoriaSemanal_enSeco(); }, minS: 200,
      resumir: function (r) {
        if (!r) return 'NO LISTO: el paso no devolvió nada';
        if (r.falla) return 'NO LISTO: la auditoría falló (' + String(r.falla).slice(0, 150) + ')';
        const noOk = r.res && r.res.noOk ? r.res.noOk.length : 0;
        return 'LISTO: la solapa y el mail se arman' + (r.ok ? ' | la auditoría da todo OK' : ' | la auditoría tiene ' + (noOk || 'cosas') + ' para mirar (la línea roja de arriba)') +
               (r.cancelNota ? ' | cancelaciones: ' + r.cancelNota : '') + ' → para prender AUDITORIA_SEMANAL_ACTIVA';
      } }
  ];
}

/** c19: la corrida (sigue donde quedó la anterior). Devuelve lo de revisarTodo_. */
function cierreSoloLectura_(opciones) {
  return revisarTodo_(Object.assign({ pasos: cierreSoloLecturaPasos_(), prop: CIERRE_PROP, nombre: 'c19_cierre_soloLectura' }, opciones || {}));
}
