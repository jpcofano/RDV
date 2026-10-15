/**
 * diagnostico/35_elecciones_agenda.js — 15/10: ¿por qué AGENDA_DUPLICADOS no toma la decisión del equipo? (caso: Jorge Macri
 * 01/10/2026 15:00 Belgrano, "Ya está cargada en otra fila: no crear" sobre la candidata 804, y la línea volvió).
 *
 * SÓLO LECTURA: no escribe NADA (ni la base, ni la intermedia, ni AGENDA_DUPLICADOS, ni ELECCIONES_AGENDA, ni REGISTRO_AGENDA,
 * ni la cache de geocodificación; no llama a Maps; Gmail sólo se lee). Sólo el log y el objeto que devuelve.
 *
 *   diagnosticarEleccionesAgenda()   (paso 94) cada elección de ELECCIONES_AGENDA y de la solapa AGENDA_DUPLICADOS: su
 *                                    id_reunion, id_fila y texto; si el plan de HOY la consume (P.eleccionesAplicadas, o la
 *                                    fila ya en uso) y, si no, POR QUÉ: la reunión fuera del alcance / ya no está en el mail /
 *                                    el id_reunion cambió (con el id de hoy más parecido) / la fila elegida no está entre las
 *                                    candidatas (con las candidatas de hoy y su id_fila) / leída pero no consumida (otra ruta) /
 *                                    otra. Y qué haría el plan con AGENDA_ELECCIONES_SIEMPRE prendido. Primero, el caso Macri
 *                                    01/10: los ids al elegir y hoy, cada reunión del mail y cada línea que lo nombra.
 *
 * `opciones` (sólo los tests): `mails`, `geocodificar`, `historial`, `conjunto`, `hoy`, `alcance`, `caso` ({ figura, fecha
 * 'yyyy-MM-dd' }). Usa `_geoSoloCacheDupAg_` (diagnostico/30_duplicados_agenda.js).
 */

/** El caso que se mira primero (el del usuario, 15/10). */
const ELEC_AG_CASO = { figura: 'Jorge Macri', fecha: '2026-10-01' };

/** **Paso 94** (sólo lectura). Devuelve `{ elecciones, caso, resumen }`. */
function diagnosticarEleccionesAgenda(opciones) {
  opciones = opciones || {};
  Logger.log('=== diagnosticarEleccionesAgenda — SÓLO LECTURA: cada elección de AGENDA_DUPLICADOS, si el plan la consume y por qué ' +
             'no; y qué cambia con AGENDA_ELECCIONES_SIEMPRE (hoy: %s). No escribe nada ===', AGENDA_ELECCIONES_SIEMPRE);
  const dest = leerDestino_(), A = indicesAgenda_(dest.hdr), alcance = opciones.alcance || alcanceAgenda_();
  if (A.faltan.length) Logger.log('  AVISO: a la base le faltan columnas de la agenda: %s', A.faltan.join(', '));
  const crudo = _crudoEleccionesAg_();
  const elHoy = leerEleccionesAgenda_({ siempre: false });
  const elFix = leerEleccionesAgenda_({ siempre: true });
  let mails;
  try {
    mails = opciones.mails ? { fuente: '(lista de prueba)', lista: opciones.mails }
                           : leerMailsAgendaGmail_(new Date(alcance.desde.getTime() - 7 * 86400000));
  } catch (err) { Logger.log('>>> no se pudieron leer los mails: %s', err); return { error: String(err) }; }
  const op = { enSeco: true, historial: opciones.historial || leerHistorialAgenda_(), conjunto: opciones.conjunto || leerConjuntoPorFecha_(),
               geocodificar: opciones.geocodificar || _geoSoloCacheDupAg_() };
  if (opciones.hoy) op.hoy = opciones.hoy;
  // dos lecturas del mail (el plan anota cosas en las reuniones: cada plan, la suya)
  const rHoy = agendaDesdeListaDeMails_(mails.lista, { fuente: mails.fuente });
  const rFix = agendaDesdeListaDeMails_(mails.lista, { fuente: mails.fuente });
  const pHoy = planAgenda_(dest, rHoy, A, alcance, Object.assign({}, op, { elecciones: elHoy, eleccionesSiempre: false }));
  const pFix = planAgenda_(dest, rFix, A, alcance, Object.assign({}, op, { elecciones: elFix, eleccionesSiempre: true }));
  Logger.log('  mails: %s | alcance: %s | reuniones en el alcance: %s | elecciones guardadas: %s líneas | AGENDA_DUPLICADOS: %s líneas, ' +
             '%s con ELEGIR', mails.lista.length, alcance.desc, pHoy.resumen.reunionesEnAlcance, crudo.guardadas.length, crudo.solapa.length,
             crudo.solapa.filter(function (x) { return x.texto; }).length);

  // --- 1) el caso Macri 01/10, primero ---
  const caso = _casoEleccionesAg_(opciones.caso || ELEC_AG_CASO, crudo, elHoy, elFix, rHoy, pHoy, pFix, dest, A, alcance);

  // --- 2) cada elección vigente (la que vale por reunión), hoy y con el arreglo ---
  const ids = [];
  elHoy.forEach(function (el, id) { ids.push(id); });
  elFix.forEach(function (el, id) { if (ids.indexOf(id) < 0) ids.push(id); });
  const out = [];
  ids.forEach(function (id) {
    const el = elHoy.get(id) || elFix.get(id);
    const hoy = elHoy.get(id) ? _estadoEleccionAg_(pHoy, rHoy, alcance, id, elHoy.get(id), dest) : { consumida: false, texto: '(hoy no se lee: la pisa otra línea)' };
    const fix = elFix.get(id) ? _estadoEleccionAg_(pFix, rFix, alcance, id, elFix.get(id), dest) : { consumida: false, texto: '(con el arreglo no se lee)' };
    out.push({ id: id, idFila: el.idFila, texto: el.texto, eleccion: el.eleccion, origen: el.origen || '', hoy: hoy, conArreglo: fix,
               leidaDistinta: !!(elHoy.get(id) && elFix.get(id) && (elHoy.get(id).idFila !== elFix.get(id).idFila || elHoy.get(id).texto !== elFix.get(id).texto)) });
  });
  const noConsumidas = out.filter(function (x) { return !x.hoy.consumida; });
  Logger.log('--- 2) las elecciones vigentes: %s | el plan de HOY consume %s | NO consume %s ---', out.length, out.length - noConsumidas.length, noConsumidas.length);
  out.forEach(function (x) {
    Logger.log('  %s %s | id_reunion %s | id_fila %s | "%s" (%s)', x.hoy.consumida ? 'ok   ' : 'NO   ', x.eleccion, x.id, x.idFila || '—', x.texto, x.origen);
    Logger.log('        hoy: %s', x.hoy.texto);
    (x.hoy.detalle || []).forEach(function (d) { Logger.log('          %s', d); });
    Logger.log('        con AGENDA_ELECCIONES_SIEMPRE: %s', x.conArreglo.texto);
    if (x.leidaDistinta) Logger.log('        OJO: con el arreglo la elección leída es otra: "%s" (id_fila %s) — la de hoy la pisa una línea pre-cargada',
                                    elFix.get(x.id).texto, elFix.get(x.id).idFila);
  });
  // las líneas de la solapa con ELEGIR que la lectura de hoy NO toma (pisadas por otra línea, o pre-cargadas)
  const pisadas = (elHoy.leidas || []).filter(function (l) { return l.origen.indexOf(AGENDA_SOLAPA_DUPLICADOS) === 0; })
    .filter(function (l) { const v = elHoy.get(l.id); return l.eleccion && (!v || v.idFila !== l.idFila || normalizeText_(v.texto) !== normalizeText_(l.texto)); });
  Logger.log('--- 3) líneas de %s con ELEGIR que la lectura de HOY no toma (las pisa otra línea de la misma reunión): %s ---',
             AGENDA_SOLAPA_DUPLICADOS, pisadas.length);
  pisadas.forEach(function (l) {
    const v = elHoy.get(l.id);
    Logger.log('    %s | %s | id_fila %s | "%s" → vale "%s" (id_fila %s, %s)', l.origen, l.id, l.idFila, l.texto, v ? v.texto : '—', v ? v.idFila : '—', v ? v.origen : '');
  });
  // resumen por motivo
  const porMotivo = {};
  noConsumidas.forEach(function (x) { porMotivo[x.hoy.motivo || 'otra'] = (porMotivo[x.hoy.motivo || 'otra'] || 0) + 1; });
  Logger.log('--- RESUMEN: no consumidas hoy, por motivo: %s ---', Object.keys(porMotivo).map(function (k) { return k + ' ' + porMotivo[k]; }).join(' | ') || 'ninguna');
  Logger.log('  con AGENDA_ELECCIONES_SIEMPRE: aplicadas %s | sin fila %s | cerradas (una línea en REGISTRO_AGENDA_CAMBIOS, una vez) %s | ' +
             'siguen preguntando (No sé) %s', out.filter(function (x) { return x.conArreglo.consumida; }).length, pFix.eleccionesSinFila.length,
             pFix.eleccionesCerradas.length, out.filter(function (x) { return x.eleccion === 'no_se'; }).length);
  Logger.log('  AGENDA_DUPLICADOS para elegir: hoy %s líneas de reuniones | con el arreglo %s', pHoy.duplicados.filter(function (d) { return d.tipo === 'antes' || d.tipo === 'cancelacion'; }).length,
             pFix.duplicados.filter(function (d) { return d.tipo === 'antes' || d.tipo === 'cancelacion' || d.tipo === 'eleccion_sin_fila'; }).length);
  return { elecciones: out, caso: caso, pisadas: pisadas.length,
           resumen: { vigentes: out.length, noConsumidas: noConsumidas.length, porMotivo: porMotivo,
                      conArreglo: { aplicadas: out.filter(function (x) { return x.conArreglo.consumida; }).length,
                                    sinFila: pFix.eleccionesSinFila.length, cerradas: pFix.eleccionesCerradas.length } } };
}

/** Lo crudo (sólo lectura): las filas de ELECCIONES_AGENDA y las líneas de AGENDA_DUPLICADOS. */
function _crudoEleccionesAg_() {
  const out = { guardadas: [], solapa: [] };
  try {
    const sh = registrosAgenda_().getSheetByName(RDV_HOJA_ELECCIONES_AGENDA);
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, ENC_ELECCIONES_AGENDA_.length).getValues().forEach(function (r, k) {
        out.guardadas.push({ fila: k + 2, fecha: r[0], id: str(r[1]), idFila: str(r[2]), texto: str(r[3]), comentario: str(r[4]) });
      });
    }
  } catch (err) { Logger.log('  AVISO: %s no se pudo leer: %s', RDV_HOJA_ELECCIONES_AGENDA, err); }
  try {
    const sh = ssDestino_().getSheetByName(AGENDA_SOLAPA_DUPLICADOS);
    if (sh && sh.getLastRow() > 1) {
      const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
      const hdr = v[0].map(normalizeHeader_);
      const i = function (n) { return hdr.indexOf(normalizeHeader_(n)); };
      v.slice(1).forEach(function (r, k) {
        const g = function (n) { return i(n) < 0 ? '' : str(r[i(n)]); };
        out.solapa.push({ fila: k + 2, texto: g('ELEGIR'), comentario: g('COMENTARIO'), resultado: g('resultado'), tipo: g('tipo'),
                          reunion: g('reunión del mail'), candidata: g('fila candidata'), id: g('id_reunion'), idFila: g('id_fila') });
      });
    }
  } catch (err) { Logger.log('  AVISO: %s no se pudo leer: %s', AGENDA_SOLAPA_DUPLICADOS, err); }
  return out;
}

/** Qué hizo el plan `P` con la elección `el` (clave `id`): `{ consumida, texto, motivo, detalle }`. */
function _estadoEleccionAg_(P, r, alcance, id, el, dest) {
  const idUsado = (P.eleccionesConsultadas && P.eleccionesConsultadas.get(id)) || id;
  const esCanc = /^cancelacion\|/.test(idUsado);
  const idEv = idUsado.replace(/^cancelacion\|/, '');
  const evs = r.unicas.concat(r.desaparecidas);
  const ev = evs.filter(function (e) { return idReunionAgenda_(e) === idEv; })[0];
  const corrido = idUsado !== id ? ' (encontrada por la base: hoy el id es ' + idUsado + ')' : '';
  const aplic = P.eleccionesAplicadas.filter(function (x) { return x.id === idUsado; })[0] ||
                (P.eleccionesUsadas || []).filter(function (x) { return x.id === idUsado; })[0];
  if (aplic) return { consumida: true, motivo: '', texto: 'APLICADA: ' + aplic.eleccion + (aplic.fila || (aplic.f && aplic.f.fila) ? ' (fila ' + (aplic.fila || aplic.f.fila) + ')' : '') + corrido };
  const sinFila = (P.eleccionesSinFila || []).filter(function (x) { return x.id === idUsado; })[0];
  if (sinFila) return { consumida: sinFila.eleccion === 'ya_cargada', motivo: 'la fila elegida no está en la base',
                        texto: (sinFila.eleccion === 'ya_cargada' ? 'CONSUMIDA sin fila (no se crea ni se pregunta): ' : 'SIN FILA (no se crea; se vuelve a preguntar): ') + sinFila.motivo + corrido };
  const cerrada = (P.eleccionesCerradas || []).filter(function (x) { return x.clave === id; })[0];
  if (cerrada) return { consumida: true, motivo: '', texto: 'CERRADA (una línea en REGISTRO_AGENDA_CAMBIOS): ' + cerrada.motivo };
  if (esCanc) {
    const s = P.cancelacionSigue.filter(function (x) { return 'cancelacion|' + idReunionAgenda_(x.ev) === idUsado; })[0];
    if (s) return { consumida: true, motivo: '', texto: '"Sigue": la fila ' + s.f.fila + ' no se toca' + corrido };
  }
  if (ev && !esCanc) {
    const x = P.filaDe.get(ev.clave);
    if (x && x.f && idFilaAgenda_(x.f) === el.idFila && el.eleccion === 'vincular') return { consumida: true, motivo: '', texto: 'en uso: la reunión ya está en la fila ' + x.f.fila + corrido };
    if (x && x.yaCargada && x.f && idFilaAgenda_(x.f) === el.idFila) return { consumida: true, motivo: '', texto: 'ya cargada en la fila ' + x.f.fila + corrido };
  }
  // NO consumida: por qué
  if (!ev) {
    const base = baseIdReunionAgenda_(idEv);
    const parecidas = evs.filter(function (e) { return baseIdReunionAgenda_(idReunionAgenda_(e)) === base; });
    if (parecidas.length) {
      return { consumida: false, motivo: 'el id_reunion cambió', texto: 'NO: el id_reunion cambió — hoy: ' +
               parecidas.map(function (e) { return idReunionAgenda_(e) + (r.unicas.indexOf(e) >= 0 ? '' : ' (desaparecida)'); }).join(' / ') };
    }
    const mismaFecha = evs.filter(function (e) { return e.fecha && idEv.indexOf('|' + ymd_(e.fecha) + '|') >= 0; });
    return { consumida: false, motivo: 'la reunión ya no está en el mail', texto: 'NO: la reunión ya no está en el mail' +
             (mismaFecha.length ? ' (ese día el mail trae: ' + mismaFecha.slice(0, 6).map(idReunionAgenda_).join(' / ') + ')' : '') };
  }
  if (!_enAlcance_(alcance, ev.fecha)) return { consumida: false, motivo: 'reunión fuera del alcance', texto: 'NO: la reunión está fuera del alcance (' + fmtFecha_(ev.fecha) + ', ' + alcance.desc + ')' };
  const dups = P.duplicados.filter(function (d) { return d.id === idUsado || (!esCanc && d.ev === ev && (d.tipo === 'antes' || d.tipo === 'eleccion_sin_fila')); });
  if (dups.length) {
    const cands = [];
    dups.forEach(function (d) { (d.candidatas || []).forEach(function (c) { cands.push({ fila: c.f.fila, idFila: idFilaAgenda_(c.f), ruta: d.conciliacion ? 'conciliación' : d.tipo }); }); });
    const detalle = cands.map(function (c) { return 'candidata hoy: fila ' + c.fila + ' | id_fila ' + c.idFila + ' | ' + c.ruta; });
    if (el.eleccion === 'no_se') return { consumida: false, motivo: 'pendiente: No sé', texto: 'pendiente ("No sé": sigue preguntando, es lo esperado)', detalle: detalle };
    if (!cands.some(function (c) { return c.idFila === el.idFila; })) {
      const fe = filaDeEleccionAgenda_(dest.filas, el.idFila);
      detalle.push('la fila elegida en la base: ' + (fe.f ? 'fila ' + fe.f.fila + ' (' + fe.como + ', agenda_uid "' + str(P.A.agenda_uid == null ? '' : fe.f.valores[P.A.agenda_uid]) + '")' : fe.motivo));
      return { consumida: false, motivo: 'la fila elegida no está entre las candidatas', texto: 'NO: la fila elegida no está entre las candidatas de hoy' + corrido, detalle: detalle };
    }
    const ruta = dups.map(function (d) { return d.conciliacion ? 'la conciliación de la semana (no mira "ya cargada")' : d.tipo; }).join(', ');
    return { consumida: false, motivo: 'leída pero no consumida (otra ruta)', texto: 'NO: leída, la fila está entre las candidatas, pero se vuelve a preguntar por ' + ruta + corrido, detalle: detalle };
  }
  const x = P.filaDe.get(ev.clave) || {};
  return { consumida: false, motivo: 'otra', texto: 'NO (otra): la reunión ' + (x.fila ? 'quedó en la fila ' + x.fila + (x.nueva ? ' (se crearía)' : '') :
           x.borradaEquipo ? 'la borró el equipo' : x.pendiente ? 'está pendiente de definir' : x.bloqueada ? 'está bloqueada por el invariante' :
           x.canceladaMail ? 'está cancelada en el mail' : 'no tiene fila') + corrido };
}

/** El caso del usuario, con todo lo que lo nombra: lo guardado, las líneas de la solapa, las reuniones del mail y las filas. */
function _casoEleccionesAg_(caso, crudo, elHoy, elFix, r, pHoy, pFix, dest, A, alcance) {
  const fig = normalizeText_(caso.figura), d = toDate_(caso.fecha);
  if (!d) { Logger.log('  (sin caso)'); return null; }
  const ymd = ymd_(d);
  const nombra = function (id) { return String(id || '').indexOf(fig + '|' + ymd) === 0 || String(id || '').indexOf('cancelacion|' + fig + '|' + ymd) === 0; };
  Logger.log('--- 1) EL CASO: %s %s ---', caso.figura, fmtFecha_(d));
  const g = crudo.guardadas.filter(function (x) { return nombra(x.id); });
  Logger.log('  %s (lo elegido, con los ids de CUANDO se eligió): %s', RDV_HOJA_ELECCIONES_AGENDA, g.length);
  g.forEach(function (x) { Logger.log('    fila %s | %s | id_reunion %s | id_fila %s | "%s"', x.fila, x.fecha instanceof Date ? fmtFecha_(x.fecha) : str(x.fecha), x.id, x.idFila, x.texto); });
  const s = crudo.solapa.filter(function (x) { return nombra(x.id) || (normalizeText_(x.reunion).indexOf(fig) >= 0 && x.reunion.indexOf(fmtFecha_(d)) >= 0); });
  Logger.log('  %s hoy (antes de la próxima corrida): %s líneas', AGENDA_SOLAPA_DUPLICADOS, s.length);
  s.forEach(function (x) {
    Logger.log('    fila %s | ELEGIR "%s" | resultado "%s" | %s | %s | %s | id_reunion %s | id_fila %s', x.fila, x.texto, x.resultado, x.tipo, x.reunion, x.candidata, x.id, x.idFila);
  });
  const evs = (r.ultimas || []).concat(r.unicas, r.desaparecidas).filter(function (ev, k, arr) { return arr.indexOf(ev) === k; })
    .filter(function (ev) { return ev.fecha && ymd_(ev.fecha) === ymd && (normalizeText_(ev.figuraFila).indexOf(fig) >= 0 || (ev.figuras || []).some(function (f) { return normalizeText_(f) === fig; })); });
  Logger.log('  las reuniones del mail de ese día con esa figura (HOY): %s', evs.length);
  evs.forEach(function (ev) {
    const enU = r.unicas.indexOf(ev) >= 0, enD = r.desaparecidas.indexOf(ev) >= 0;
    const xH = pHoy.filaDe.get(ev.clave), lineas = pHoy.duplicados.filter(function (dd) { return dd.ev === ev; });
    Logger.log('    id_reunion %s | %s | hora %s | grupo %s%s | versión %s de %s (mail del %s) | %s | lugar %s | %s%s', idReunionAgenda_(ev),
               enU ? 'única' : (enD ? 'DESAPARECIDA' : 'repetida de ' + (ev.repetidaDe || '?')), ev.hora || '—', ev.grupo || '—',
               ev.otrosGrupos && ev.otrosGrupos.length ? ' (+ ' + ev.otrosGrupos.join(', ') + ')' : '', ev.version, ev.versiones,
               ev.mailFecha ? fmtFecha_(ev.mailFecha) : '—', _enAlcance_(alcance, ev.fecha) ? 'en el alcance' : 'FUERA del alcance', ev.lugar || '—',
               str(ev.lugarTexto), ev.canceladaEnMail ? ' | CANCELADA EN EL MAIL (' + str(ev.canceladaEnMailMotivo) + ')' : '');
    if (enU || enD) {
      Logger.log('      plan HOY: %s%s', xH ? JSON.stringify({ fila: xH.fila || null, duplicado: !!xH.duplicado, yaCargada: !!xH.yaCargada, nueva: !!xH.nueva }) : '(nada)',
                 lineas.length ? ' | líneas en AGENDA_DUPLICADOS: ' + lineas.map(function (dd) { return dd.tipo + (dd.conciliacion ? ' (conciliación)' : '') + ' → filas ' + dd.candidatas.map(function (c) { return c.f.fila + ' [' + idFilaAgenda_(c.f) + ']'; }).join(', '); }).join(' ; ') : '');
      const xF = pFix.filaDe.get(ev.clave);
      Logger.log('      con AGENDA_ELECCIONES_SIEMPRE: %s', xF ? JSON.stringify({ fila: xF.fila || null, duplicado: !!xF.duplicado, yaCargada: !!xF.yaCargada, sinFila: !!xF.yaCargadaSinFila, nueva: !!xF.nueva }) : '(nada)');
      const el = elHoy.get(idReunionAgenda_(ev)), elF = eleccionDeReunionAgenda_(elFix, idReunionAgenda_(ev), function () { return 1; });
      Logger.log('      elección que lee HOY con este id: %s | con el arreglo (también por la base): %s', el ? '"' + el.texto + '" id_fila ' + el.idFila : 'NINGUNA',
                 elF ? '"' + elF.texto + '" id_fila ' + elF.idFila + (elF.porBase ? ' (por la base, de ' + elF.clave + ')' : '') : 'NINGUNA');
    }
  });
  const desde = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 4, 12, 0, 0), hasta = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 2, 12, 0, 0);
  const filas = dest.filas.filter(function (f) { return f.fecha && normalizeText_(f.figura) === fig && ymd_(f.fecha) >= ymd_(desde) && ymd_(f.fecha) <= ymd_(hasta); });
  const val = function (f, n) { return A[n] == null ? '' : f.valores[A[n]]; };
  Logger.log('  las filas de la base de esa figura, %s a %s (con su id_fila de HOY): %s', fmtFecha_(desde), fmtFecha_(hasta), filas.length);
  filas.forEach(function (f) {
    Logger.log('    fila %s | %s | %s | HORA %s | STATUS %s | agenda_uid "%s" | id_fila %s', f.fila, fmtFecha_(f.fecha), f.barrio || '(sin barrio)',
               valorAgendaComparable_(val(f, 'HORA'), 'HORA'), str(val(f, 'STATUS REUNIÓN')), str(val(f, 'agenda_uid')), idFilaAgenda_(f));
  });
  // los ids de cuando se eligió, contra hoy
  g.concat(s.filter(function (x) { return x.texto; })).forEach(function (x) {
    const fe = filaDeEleccionAgenda_(dest.filas, x.idFila);
    const evHoy = r.unicas.concat(r.desaparecidas).filter(function (ev) { return idReunionAgenda_(ev) === x.id.replace(/^cancelacion\|/, ''); })[0];
    Logger.log('  elegido "%s": id_reunion %s → %s | id_fila %s → %s', x.texto, x.id, evHoy ? 'IGUAL hoy' : 'NO EXISTE hoy',
               x.idFila || '—', fe.f ? 'fila ' + fe.f.fila + (fe.como === 'exacta' ? ' (igual)' : ' (' + fe.como + ')') : 'NO: ' + fe.motivo);
  });
  return { guardadas: g, solapa: s, reuniones: evs.map(function (ev) { return { id: idReunionAgenda_(ev), hora: ev.hora, grupo: ev.grupo, clave: ev.clave }; }),
           filas: filas.map(function (f) { return { fila: f.fila, idFila: idFilaAgenda_(f) }; }) };
}
