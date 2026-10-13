/**
 * 48_FormulariosSinFila.js — LOS FORMULARIOS SIN FILA (13/10, decisión del usuario). Configuración: 00_Config.js,
 * "Los formularios sin fila". APAGADO hasta ver el paso 65: FORMULARIOS_SIN_FILA_ACTIVA = false.
 *
 * Hasta el 13/10 los formularios que no quedaban en ninguna fila salían sólo en el log del upsert ("los N formularios
 * huérfanos, uno por uno", y sólo si eran 40 o menos) y al final de EMPAREJAR_MANUAL, en la intermedia: los dos con la
 * definición vieja (formularios SIN NINGÚN par propuesto), no "sin fila". Esta solapa, en el archivo de la base, la mira el
 * equipo: un formulario sin fila suele ser una reunión que falta cargar en la base.
 *
 * QUÉ ENTRA: los formularios de B (los vivos: sin "NO USAR" ni los gemelos descartados por la regla 3) cuya fecha —la del
 * nombre o, si no tiene, el cierre— cae en los últimos DIAS_ACTIVOS días (hasta hoy) y que NO quedaron asignados a ninguna
 * fila: ni escritos en esta corrida, ni reservados por la traza de una fila (RDV_UID), en todo el historial.
 * QUÉ NO ENTRA (se cuenta en el log): los gemelos descartados (regla 3), los de 0 inscriptos, los de reuniones futuras
 * (todavía esperan su fila) y los gemelos de un formulario que ya tiene fila (son la misma reunión).
 *
 * EL MOTIVO, en palabras, para cada uno (`motivoSinFila_`), en este orden:
 *   en revisión          es la mejor opción de una fila que fue a REVISAR_MATCH / SIN_MATCH (está en su ficha);
 *   espera su fila       su fila espera el barrio o es muy reciente: se asigna sola en una corrida próxima;
 *   varias figuras       nombra dos o más figuras: lo decide una persona;
 *   sin figura           no nombra a nadie; se busca una fila de su lugar;
 *   sin fila cerca       ninguna fila de su figura a ±DIAS_CONTEXTO_FICHA días: falta cargar la reunión;
 *   otro lugar           las filas de su figura a ±TOLERANCIA_REPROGRAMACION_DIAS días son en otro lugar (¿reubicada?);
 *   fila con otro        la fila de su figura ese día ya tiene otro formulario (¿otra reunión? ¿un formulario viejo?);
 *   fila cerrada         la fila de su figura es de antes de las filas activas (no se trabaja);
 *   fila lejos           la fila de su figura más cercana está a más de TOLERANCIA_REPROGRAMACION_DIAS días;
 *   no se cruzó          hay una fila libre de su figura cerca y no se cruzó (revisar).
 *
 * No escribe en "RVD JM-CM - ES": es otra solapa del archivo, un reporte que el sistema reescribe entero, protegido con
 * advertencia (como REVISAR_MATCH).
 */

/* La ubicación del formulario: ubicacionDeFormulario_ (02_Parsing.js), la misma que usa el cruce. */

/** "Belgrano", "Comuna 1 Sur", "Comuna 6", "Eje Sur" o "". */
function textoLugarFormulario_(c) {
  const b = c.barrio || c.barrioPorVariante || '';
  if (b) return canonizarBarrio_(b) || b;
  if (c.comuna != null) return 'Comuna ' + c.comuna + (c.comuna === 1 && c.subzona ? ' ' + c.subzona : '');
  if (c.eje && c.eje.tipo === 'eje') return 'Eje ' + c.eje.eje;
  return '';
}

/** Las figuras que nombra el formulario (nombre completo, variante o apellido), sin repetir. */
function figurasDelFormulario_(c) {
  const out = [];
  figurasEnTexto_(c.nombre).forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); });
  return out;
}

/** ¿La fila es de alguna de esas figuras (normalizadas)? También la conjunta donde está. */
function filaEsDeFiguras_(f, norm) {
  if (!norm.length) return false;
  if (f.figura && norm.indexOf(normalizeText_(f.figura)) >= 0) return true;
  return !!(f.figurasConjunta && f.figurasConjunta.some(function (k) { return norm.indexOf(k) >= 0; }));
}

/**
 * Los formularios sin fila, con su motivo y la fila más cercana. Sólo calcula (sobre un plan de calcularPlan_).
 * Devuelve `{ lista, excluidos: { regla3, cero, futuros, gemeloAsignado, sinFecha }, desde, hasta }`.
 */
function formulariosSinFila_(plan) {
  const hoy = _hoy_();
  const dias = DIAS_ACTIVOS == null ? 30 : DIAS_ACTIVOS;
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dias, 12, 0, 0);
  const enVentana = function (d) { return d && ymd_(d) >= ymd_(desde) && ymd_(d) <= ymd_(hoy); };
  const usados = plan.usados || {};
  const exc = { regla3: 0, cero: 0, futuros: 0, gemeloAsignado: 0, sinFecha: 0 };

  // Los gemelos descartados por la regla 3 no están entre los vivos: se cuentan desde los grupos.
  ((plan.cands.gemelos || {}).grupos || []).forEach(function (g) {
    g.forms.forEach(function (c) { if (c.descartadoRegla3 && enVentana(c.det && c.det.mejor)) exc.regla3++; });
  });
  // Los grupos de gemelos que ya tienen un formulario asignado
  const grupoAsignado = {};
  plan.cands.vivos.forEach(function (c) { if (usados[c.fila] && c.grupo) grupoAsignado[c.grupo] = true; });

  // Qué formulario tiene cada fila (escrita en esta corrida o por su traza), y qué filas lo tienen "en revisión" o esperando
  const formDeFila = {}, enRevision = {}, esperando = {};
  (plan.decisiones || []).forEach(function (d) {
    if (!d.cand) return;
    if (d.noEscribir) { if (!enRevision[d.cand.fila]) enRevision[d.cand.fila] = d; }
    else formDeFila[d.fila.fila] = d.cand;
  });
  Object.keys(plan.porFila || {}).forEach(function (k) {
    const p = plan.porFila[k];
    if (p.veredicto === 'rdv_uid' && p.cand) formDeFila[k] = p.cand;
    if ((p.veredicto === 'pendiente_barrio' || p.veredicto === 'esperando_formulario') && p.cand && !esperando[p.cand.fila]) {
      esperando[p.cand.fila] = { fila: +k, veredicto: p.veredicto };
    }
  });
  const filaPorNumero = {};
  plan.dest.filas.forEach(function (f) { filaPorNumero[f.fila] = f; });

  const lista = [];
  plan.cands.vivos.forEach(function (c) {
    if (usados[c.fila]) return;
    const fecha = c.det && c.det.mejor;
    if (!fecha) { exc.sinFecha++; return; }
    if (ymd_(fecha) > ymd_(hoy)) { exc.futuros++; return; }
    if (!enVentana(fecha)) return;
    if (!(c.inscriptos > 0)) { exc.cero++; return; }
    if (c.grupo && grupoAsignado[c.grupo]) { exc.gemeloAsignado++; return; }
    const m = motivoSinFila_(c, fecha, plan, formDeFila, enRevision, esperando, filaPorNumero);
    lista.push({ c: c, fecha: fecha, deCierre: c.det.fuente === 'fecha_fin', figuras: figurasDelFormulario_(c),
                 lugar: textoLugarFormulario_(c), motivo: m.motivo, clase: m.clase, cercana: m.cercana });
  });
  lista.sort(function (a, b) { return b.fecha.getTime() - a.fecha.getTime() || (a.c.clave < b.c.clave ? -1 : 1); });
  return { lista: lista, excluidos: exc, desde: desde, hasta: hoy };
}

/** El motivo en palabras y la fila más cercana (ver el encabezado del archivo). */
function motivoSinFila_(c, fecha, plan, formDeFila, enRevision, esperando, filaPorNumero) {
  const figs = figurasDelFormulario_(c), norm = figs.map(normalizeText_);
  const ubic = ubicacionDeFormulario_(c);
  const tol = TOLERANCIA_REPROGRAMACION_DIAS, ctx = DIAS_CONTEXTO_FICHA;
  const conDist = function (f) { return { f: f, d: diasEntre_(f.fecha, fecha), lug: compararUbicacion_(ubic, ubicacionDeFila_(f)) }; };
  const cerca = function (filtro, max) {
    return plan.dest.filas.filter(function (f) { return f.fecha && filtro(f); }).map(conDist)
      .filter(function (x) { return Math.abs(x.d) <= max; })
      .sort(function (a, b) { return Math.abs(a.d) - Math.abs(b.d) || a.d - b.d || a.f.fila - b.f.fila; });
  };
  const descFila = function (x) {
    const f = x.f, otro = formDeFila[f.fila];
    return 'fila ' + f.fila + ' · ' + (f.figura || 'sin figura') + ' · ' + (f.barrio || 'sin barrio') + ' · ' + fmtFecha_(f.fecha) +
           (x.d ? ' (' + (x.d > 0 ? '+' : '−') + Math.abs(x.d) + ' días)' : ' (mismo día)') +
           (otro ? ' · ya tiene: ' + otro.nombre : ' · sin formulario');
  };
  const listaFigs = figs.join(', ');
  const aDias = function (x) { return x.d ? 'a ' + Math.abs(x.d) + ' días' : 'del mismo día'; };

  // 1. en revisión: es la mejor opción de una fila que fue a REVISAR_MATCH / SIN_MATCH
  const rev = enRevision[c.fila];
  if (rev) {
    const x = conDist(rev.fila);
    return { clase: 'en_revision', cercana: descFila(x),
             motivo: 'En revisión: es la mejor opción de la fila ' + rev.fila.fila + ' (' + String(rev.nivel || '').replace(/^descartado:/, '') +
                     '). Se resuelve en REVISAR_MATCH.' };
  }
  // 2. espera su fila
  const esp = esperando[c.fila];
  if (esp && filaPorNumero[esp.fila]) {
    return { clase: 'espera_fila', cercana: descFila(conDist(filaPorNumero[esp.fila])),
             motivo: esp.veredicto === 'pendiente_barrio'
               ? 'Su fila (' + esp.fila + ') espera el barrio: se asigna sola cuando se cargue.'
               : 'Su fila (' + esp.fila + ') es muy reciente: se reevalúa sola.' };
  }
  // 3. sin figura: se busca una fila de su lugar
  if (!figs.length) {
    const delLugar = tieneUbicacion_(ubic) ? cerca(function (f) { return true; }, ctx).filter(function (x) { return x.lug.coincide === true; }) : [];
    if (!delLugar.length) {
      return { clase: 'sin_figura', cercana: '',
               motivo: 'No nombra ninguna figura' + (tieneUbicacion_(ubic) ? ' y no hay ninguna fila de su lugar a ±' + ctx + ' días' : ' ni un lugar') +
                       ': ¿falta cargar la reunión?' };
    }
    return { clase: 'sin_figura', cercana: descFila(delLugar[0]),
             motivo: 'No nombra ninguna figura: la fila de su lugar más cercana ' + (delLugar[0].d ? 'está ' : 'es ') + aDias(delLugar[0]) +
                     (formDeFila[delLugar[0].f.fila] ? ' y ya tiene otro formulario' : '') + '.' };
  }
  const deFigura = cerca(function (f) { return filaEsDeFiguras_(f, norm); }, ctx);
  // 4. varias figuras
  if (figs.length >= 2) {
    return { clase: 'varias_figuras', cercana: deFigura.length ? descFila(deFigura[0]) : '',
             motivo: 'Nombra varias figuras (' + listaFigs + '): lo decide una persona' +
                     (deFigura.length ? '.' : '; ninguna tiene fila a ±' + ctx + ' días: ¿falta cargar la reunión?') };
  }
  // 5. sin ninguna fila de su figura cerca
  if (!deFigura.length) {
    const lejos = cerca(function (f) { return filaEsDeFiguras_(f, norm); }, DIAS_OPCIONES_FICHA);
    return { clase: 'sin_fila_cerca', cercana: lejos.length ? descFila(lejos[0]) : '',
             motivo: 'Sin ninguna fila de ' + listaFigs + ' a ±' + ctx + ' días: falta cargar la reunión en la base.' };
  }
  const aTol = deFigura.filter(function (x) { return Math.abs(x.d) <= tol; });
  // 6. la fila más cercana está a más de la tolerancia
  if (!aTol.length) {
    return { clase: 'fila_lejos', cercana: descFila(deFigura[0]),
             motivo: 'La fila de ' + listaFigs + ' más cercana está a ' + Math.abs(deFigura[0].d) + ' días (más de ' + tol +
                     ': no se cruza sola). ¿Otra reunión que falta cargar, o la fecha está mal?' };
  }
  // 7. todas en otro lugar
  const sinDesacuerdo = aTol.filter(function (x) { return x.lug.coincide !== false; });
  if (!sinDesacuerdo.length) {
    const x = aTol[0], uf = ubicacionDeFila_(x.f);
    return { clase: 'otro_lugar', cercana: descFila(x),
             motivo: 'La fila de ' + listaFigs + ' ' + aDias(x) + ' es en otro lugar (el formulario dice ' +
                     (textoLugarFormulario_(c) || '—') + '; la fila, ' + (x.f.barrio || (uf.comuna != null ? 'Comuna ' + uf.comuna : '—')) +
                     '): ¿reubicada, u otra reunión que falta cargar?' };
  }
  const x = sinDesacuerdo[0], otro = formDeFila[x.f.fila];
  // 8. la fila ya tiene otro formulario
  if (otro) {
    return { clase: 'fila_con_otro', cercana: descFila(x),
             motivo: 'La fila de ' + listaFigs + ' ' + aDias(x) + ' ya tiene otro formulario (' +
                     otro.nombre + '): ¿otra reunión ese día que falta cargar, o un formulario viejo?' };
  }
  // 9. la fila es de antes de las filas activas
  if (!esFilaActiva_(x.f.fecha)) {
    return { clase: 'fila_cerrada', cercana: descFila(x),
             motivo: 'La fila de ' + listaFigs + ' es de antes de las filas activas (más de ' + (DIAS_ACTIVOS == null ? '' : DIAS_ACTIVOS + ' ') +
                     'días): ya no se trabaja.' };
  }
  // 10. libre y cerca, y no se cruzó
  return { clase: 'no_se_cruzo', cercana: descFila(x),
           motivo: 'Hay una fila libre de ' + listaFigs + ' ' + aDias(x) + ' que no se cruzó: revisar.' };
}

// ===================== Escribir (lo llama escribirReportes_ con FORMULARIOS_SIN_FILA_ACTIVA) =====================

/** La matriz de la solapa: la línea de arriba, el resumen, el encabezado y un formulario por línea. */
function matrizFormulariosSinFila_(r) {
  const enc = ['Formulario', 'Fecha', 'Inscriptos', 'Figura (del nombre)', 'Lugar (del nombre)', 'Motivo', 'Fila más cercana'];
  const n = enc.length, vacia = function () { const x = []; for (let i = 0; i < n; i++) x.push(''); return x; };
  const e = r.excluidos;
  const l1 = vacia(); l1[0] = FORMULARIOS_SIN_FILA_LINEA;
  const l2 = vacia();
  l2[0] = r.lista.length + ' formulario' + (r.lista.length === 1 ? '' : 's') + ' de B con fecha entre el ' + fmtFecha_(r.desde) + ' y el ' +
          fmtFecha_(r.hasta) + ' sin fila en la base. No se listan: ' + e.regla3 + ' gemelos descartados, ' + e.cero +
          ' con 0 inscriptos, ' + e.gemeloAsignado + ' gemelos de uno que ya tiene fila y ' + e.futuros +
          ' de reuniones futuras (esperan su fila). Se reescribe en cada corrida.';
  const m = [l1, l2, vacia(), enc];
  r.lista.forEach(function (x) {
    m.push([x.c.nombre, fmtFecha_(x.fecha) + (x.deCierre ? ' (cierre)' : ''), x.c.inscriptos, x.figuras.join(', ') || '(ninguna)',
            x.lugar || '(no dice)', x.motivo, x.cercana || '—']);
  });
  if (!r.lista.length) { const z = vacia(); z[0] = '(ninguno)'; m.push(z); }
  return m;
}

/** Escribe la solapa en el archivo de la base: reescrita entera, con formato, protegida con advertencia. */
function escribirFormulariosSinFila_(r, ss) {
  if (RDV_HOJA_FORMS_SIN_FILA === RDV_HOJA_DESTINO) throw new Error('RDV_HOJA_FORMS_SIN_FILA no puede ser la solapa de la base');
  ss = ss || ssDestino_();
  const m = matrizFormulariosSinFila_(r), nF = m.length, nC = m[0].length;
  const sh = ss.getSheetByName(RDV_HOJA_FORMS_SIN_FILA) || ss.insertSheet(RDV_HOJA_FORMS_SIN_FILA);
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (pr) {
    if (pr.getDescription() === DESC_PROTECCION_FORMS_SIN_FILA) pr.remove();
  });
  sh.clear();
  sh.getRange(1, 1, nF, nC).setValues(m);
  sh.setFrozenRows(4);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(12);
  sh.getRange(2, 1).setFontStyle('italic').setFontColor('#666666');
  sh.getRange(4, 1, 1, nC).setFontWeight('bold').setBackground('#D9D9D9');
  if (nF > 4) {
    sh.getRange(5, 1, nF - 4, nC).setVerticalAlignment('top');
    [1, 6, 7].forEach(function (k) { sh.getRange(5, k, nF - 4, 1).setWrap(true); });
  }
  [[1, 320], [2, 120], [3, 80], [4, 170], [5, 130], [6, 380], [7, 320]].forEach(function (a) { sh.setColumnWidth(a[0], a[1]); });
  sh.protect().setDescription(DESC_PROTECCION_FORMS_SIN_FILA).setWarningOnly(true);
  SpreadsheetApp.flush();
  return { filas: r.lista.length };
}

/** El log: cuántos, cuáles y por qué (el paso 65 y la corrida). */
function logFormulariosSinFila_(r) {
  const e = r.excluidos;
  Logger.log('=== FORMULARIOS SIN FILA (de %s a %s): %s ===', fmtFecha_(r.desde), fmtFecha_(r.hasta), r.lista.length);
  Logger.log('  no se listan: gemelos descartados (regla 3) %s | 0 inscriptos %s | gemelos de uno con fila %s | reuniones futuras %s | sin fecha %s',
             e.regla3, e.cero, e.gemeloAsignado, e.futuros, e.sinFecha);
  const porClase = {};
  r.lista.forEach(function (x) { porClase[x.clase] = (porClase[x.clase] || 0) + 1; });
  Logger.log('  por motivo: %s', Object.keys(porClase).sort().map(function (k) { return k + ' ' + porClase[k]; }).join(' | ') || '—');
  r.lista.forEach(function (x) {
    Logger.log('  %s | ins=%s | %s | %s | %s\n      motivo: %s\n      fila más cercana: %s', fmtFecha_(x.fecha) + (x.deCierre ? ' (cierre)' : ''),
               x.c.inscriptos, x.figuras.join(', ') || '(sin figura)', x.lugar || '(sin lugar)', x.c.nombre, x.motivo, x.cercana || '—');
  });
}

/** PASO 65 (en seco): el plan de esta hora en seco y, en el log, los formularios sin fila. No escribe nada. */
function medirFormulariosSinFila() {
  const plan = calcularPlan_(true);
  const r = formulariosSinFila_(plan);
  logFormulariosSinFila_(r);
  Logger.log('  (en seco: no se escribió nada. Con FORMULARIOS_SIN_FILA_ACTIVA = true, la solapa "%s" del archivo de la base ' +
             'se reescribe en cada corrida.)', RDV_HOJA_FORMS_SIN_FILA);
  return r;
}
