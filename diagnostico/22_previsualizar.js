/**
 * diagnostico/22_previsualizar.js — paso 51 (07/10). SÓLO LECTURA: no escribe en ninguna planilla (tampoco la cache de
 * la geocodificación).
 *
 * Qué escribiría la próxima corrida de la hora en un rango de filas del destino, con la TANDA DEL 07/10 PRENDIDA en
 * memoria (CAMBIOS_0710_ACTIVOS: el barrio desde la dirección cuando el mail trae eje, pendiente_barrio sólo sin ninguna
 * ubicación, las filas futuras a DIAS_FUTUROS_CRUCE días y las conjuntas). Hace lo mismo que la corrida, en el mismo
 * orden, pero en memoria:
 *   1. la agenda (con los mails; la geocodificación, de la cache y lo que falte de Maps, sin guardarlo), y sus
 *      escrituras aplicadas a una copia del destino;
 *   2. el cruce con los formularios (calcularPlan_) y con RDV CONJUNTO sobre esa copia;
 *   3. por fila: lo que escribiría la agenda, el formulario (veredicto, score, señales) y las celdas que escribiría el
 *      upsert (celdasDeDecision_: las mismas que usa la escritura), Asistentes y STATUS.
 */
function previsualizarFilas(desde, hasta, opciones) {
  opciones = opciones || {};
  const prender = opciones.cambios === undefined ? true : !!opciones.cambios;
  return conCambios0710_(prender, function () { return _previsualizar_diag22(desde, hasta, opciones); });
}

function _previsualizar_diag22(desde, hasta, opciones) {
  Logger.log('=== previsualizarFilas (paso 51) — sólo lectura, no escribe nada | filas %s a %s | tanda del 07/10: %s ===',
             desde, hasta, cambios0710_() ? 'PRENDIDA (en memoria; CAMBIOS_0710_ACTIVOS = ' + CAMBIOS_0710_ACTIVOS + ')' : 'como está');
  const sh = ssDestino_().getSheetByName(RDV_HOJA_DESTINO);
  if (!sh) throw new Error('No existe la hoja "' + RDV_HOJA_DESTINO + '".');
  const bloque = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const copia = function () { return bloque.map(function (r) { return r.slice(); }); };

  // 1. La agenda, en seco.
  const dest0 = armarDestino_(sh, RDV_HOJA_DESTINO, copia());
  const A = indicesAgenda_(dest0.hdr), alcance = alcanceAgenda_();
  let P = null;
  if (A.faltan.length) Logger.log('  AVISO: faltan columnas de la agenda (%s): la agenda no se simula.', A.faltan.join(', '));
  else {
    const desdeCopia = AGENDA_COPIA_DESDE ? toDate_(AGENDA_COPIA_DESDE) : null;
    const leerDesde = desdeCopia && desdeCopia < alcance.desde ? desdeCopia : alcance.desde;
    let mails = null;
    try {
      mails = opciones.mails ? { fuente: '(lista de prueba)', lista: opciones.mails }
                             : leerMailsAgendaGmail_(new Date(leerDesde.getTime() - 7 * 86400000));
    } catch (err) { Logger.log('  AVISO: no se pudieron leer los mails (%s): la agenda no se simula.', err); }
    if (mails && mails.lista.length) {
      const r = agendaDesdeListaDeMails_(mails.lista, mails);
      P = planAgenda_(dest0, r, A, alcance, {
        enSeco: true, historial: leerHistorialAgenda_(), elecciones: leerEleccionesAgenda_(), conjunto: leerConjuntoPorFecha_(),
        geocodificar: opciones.geocodificar || _geocodificadorMedicion_diag21()
      });
      Logger.log('  la agenda: %s mails | %s reuniones en el alcance | crearía %s | actualizaría %s | figura de Seguridad %s',
                 mails.lista.length, P.resumen.reunionesEnAlcance, P.resumen.crear, P.resumen.actualizar, P.resumen.figura);
      (P.notasEje || []).forEach(function (x) { Logger.log('    nota del eje | %s', x.nota); });
    }
  }

  // 2. Lo que escribiría la agenda, aplicado a una copia del destino.
  const sim = copia(), ancho = bloque[0].length;
  const deAgenda = {}, borradas = {};
  (P ? P.acciones : []).forEach(function (a) {
    if (a.tipo === 'borrar') { borradas[a.f.fila] = a.detalle || 'la borraría'; return; }
    (a.escrituras || []).forEach(function (e) {
      while (sim.length < e.fila) sim.push(new Array(ancho).fill(''));
      sim[e.fila - 1][e.col - 1] = e.valor;
      (deAgenda[e.fila] = deAgenda[e.fila] || []).push({ tipo: a.tipo, col: e.col, valor: e.valor, detalle: a.detalle || '' });
    });
  });
  const destSim = armarDestino_(sh, RDV_HOJA_DESTINO, sim);

  // 3. El cruce, sobre el destino como quedaría.
  const cands = leerCandidatos_(), comunas = leerComunasMap_();
  const plan = calcularPlan_(true, { dest: destSim, cands: cands, comunas: comunas }, null);
  const asis = cruzarAsistentes_(destSim, comunas);
  const porDecision = decisionesPorFila_(plan.decisiones);
  const sinFigura = {};
  (P ? P.figuraACompletar : []).forEach(function (x) { sinFigura[x.f.fila] = x.motivo; });

  // 4. Fila por fila.
  const hdr = destSim.hdr, out = { filas: {}, conEscrituras: 0, celdas: 0 };
  const nombre = function (col) { return String(hdr[col - 1] || ('col ' + col)); };
  const usuario = ['Figura', 'Barrio', 'FECHA', 'HORA', 'Dirección', 'EVENTO', 'STATUS REUNIÓN'];
  for (let fila = desde; fila <= hasta; fila++) {
    const f = destSim.filas.filter(function (x) { return x.fila === fila; })[0];
    if (!f) { Logger.log('--- fila %s: vacía (no hay reunión) ---', fila); continue; }
    const x = { agenda: [], agendaOtras: 0, veredicto: '', formulario: '', celdas: [], status: false, asis: '' };
    Logger.log('--- fila %s | %s | %s | barrio: %s | mail: %s%s | STATUS %s ---', fila, f.figura || '(sin figura)',
               f.fecha ? _fechaLarga_diag22(f.fecha) : '(sin fecha)', f.barrio || '(vacío)', f.lugarMail || '—',
               f.conjuntaCon ? ' | Conjunta con: ' + f.conjuntaCon : '', str(f.valores[destSim.D['STATUS REUNIÓN']]) || '—');
    if (borradas[fila]) Logger.log('  AGENDA: la BORRARÍA (%s)', borradas[fila]);
    (deAgenda[fila] || []).forEach(function (e) {
      const n = nombre(e.col);
      if (usuario.indexOf(n) >= 0) x.agenda.push(n + ' ← ' + _valor_diag22(e.valor) + (e.tipo === 'figura' && e.detalle ? ' (' + e.detalle + ')' : ''));
      else x.agendaOtras++;
    });
    if (x.agenda.length || x.agendaOtras) {
      Logger.log('  AGENDA: %s%s', x.agenda.join(' | ') || '(sólo sus columnas)',
                 x.agendaOtras ? ' (+ ' + x.agendaOtras + ' columnas propias de la agenda)' : '');
    }
    if (sinFigura[fila]) Logger.log('  AGENDA: figura de Seguridad: no (%s)', sinFigura[fila]);
    const pf = plan.porFila[fila] || {};
    x.veredicto = pf.veredicto || '';
    x.formulario = pf.cand ? pf.cand.nombre : '';
    const sc = pf.cand ? puntuar_(f, pf.cand, comunas) : null;
    Logger.log('  FORMULARIO: %s%s%s', pf.veredicto || '(sin veredicto)', pf.motivo ? ' (' + pf.motivo + ')' : '',
               pf.cand ? ' | "' + pf.cand.nombre + '" (' + pf.cand.inscriptos + ' inscriptos) | score ' +
                 (pf.score == null ? sc.score : pf.score) + ' | ' + sc.nivel : '');
    const d = decisionDeFila_(f, porDecision, asis);
    // las mismas filas que toca la escritura (filaQueSeEscribe_: ni las futuras más allá de la ventana ni las cerradas)
    const k = filaQueSeEscribe_(f, false) ? celdasDeDecision_(destSim, d, f.valores, true) : { celdas: [], status: false };
    x.celdas = k.celdas.map(function (c) { return nombre(c.col) + ' ' + (c.tipo === 'uid' ? '(nuevo)' : _valor_diag22(c.valor)); });
    x.status = k.status;
    x.asis = d.asis;
    if (x.celdas.length) Logger.log('  UPSERT escribiría (%s celdas): %s', x.celdas.length, x.celdas.join(' · '));
    else Logger.log('  UPSERT: nada');
    Logger.log('  ASISTENTES: %s | STATUS: %s', d.asis === '' || d.asis == null ? '— (RDV CONJUNTO no trae asistentes)' : d.asis,
               k.status ? 'en agenda → Realizada' : 'queda como está');
    if (x.agenda.length || x.agendaOtras || x.celdas.length) { out.conEscrituras++; out.celdas += x.celdas.length + x.agenda.length; }
    out.filas[fila] = x;
  }
  // Las filas que crearía la agenda (al final del destino).
  (P ? P.acciones : []).filter(function (a) { return a.tipo === 'crear'; }).forEach(function (a) {
    Logger.log('  la agenda CREARÍA la fila %s | %s %s %s', a.fila, a.ev.figuraFila || a.ev.tipo || '', fmtFecha_(a.ev.fecha), a.ev.hora || '');
  });
  Logger.log('>>> en el rango: %s filas con algo que escribir. Nada se escribió%s', out.conEscrituras,
             CAMBIOS_0710_ACTIVOS ? ': la corrida de la hora lo escribe (CAMBIOS_0710_ACTIVOS = true desde el 08/10).'
                                  : ': para que la corrida de la hora lo haga, CAMBIOS_0710_ACTIVOS = true + clasp push.');
  return out;
}

/** "mar 07/10/2026". */
function _fechaLarga_diag22(d) {
  return ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getDay()] + ' ' + fmtFecha_(d);
}

/** Un valor para leer: fechas dd/MM/yyyy (las horas, HH:mm), textos largos recortados. */
function _valor_diag22(v) {
  if (v instanceof Date) return Utilities.formatDate(v, RDV_TZ, v.getFullYear() < 1900 ? 'HH:mm' : 'dd/MM/yyyy');
  const t = String(v == null ? '' : v);
  return t.length > 70 ? '"' + t.slice(0, 67) + '…"' : (typeof v === 'string' ? '"' + t + '"' : t);
}
