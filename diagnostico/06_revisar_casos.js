/**
 * diagnostico/06_revisar_casos.js — revisar casos uno por uno, y la lista de filas que pueden
 * faltar en RDV.
 *
 * SÓLO LECTURA. No escribe en ninguna planilla: todo va al log. Corre a mano, sin activador.
 *
 * --- Qué hay ---
 *   explicarFormulario(caso)  un formulario de B: qué se leyó de él y, para CADA fila de su figura
 *                             a ±VENTANA_EMPAREJAR_DIAS, el score señal por señal, si quedó
 *                             descalificado y por qué, y si pasó la puerta de EMPAREJAR_MANUAL
 *                             (y si no, por qué).
 *   explicarFila(n)           lo mismo desde el lado de una fila del destino, más su veredicto y
 *                             su traza.
 *   listarFilasFaltantes()    formularios SIN NINGÚN candidato con MIN_INSCRIPTOS_FILA_FALTANTE o
 *                             más: "posible fila faltante en RDV", para el equipo. Ventana primero.
 *
 * `caso` es un número de fila de B, o un texto que se busca (normalizado) dentro del nombre del
 * formulario. En 99_Correr.js los wrappers lo leen de la constante CASO_A_EXPLICAR.
 *
 * Usa las funciones del upsert (`calcularPlan_`, `puntuar_`, `distanciaFecha_`): no hay un
 * segundo criterio. Los inscriptos del destino se muestran como dato y nada más (CLAUDE.md 1).
 */

function explicarFormulario(caso) {
  Logger.log('=== explicarFormulario(%s) — sólo lectura, no escribe nada ===', caso);
  const ctx = _contexto_diag6();
  const vivos = ctx.plan.cands.vivos;
  const esNumero = typeof caso === 'number' || /^\s*\d+\s*$/.test(String(caso));
  const buscado = esNumero ? Number(caso) : normalizeText_(caso);
  const hallados = vivos.filter(function (c) {
    return esNumero ? c.fila === buscado : normalizeText_(c.nombre).indexOf(buscado) !== -1;
  });
  if (!hallados.length) {
    Logger.log('  Ningún formulario vivo de B coincide con "%s". (¿Está marcado NO USAR, o el ' +
               'texto no es parte del nombre?)', caso);
    return { hallados: 0 };
  }
  if (hallados.length > 3) {
    Logger.log('  %s formularios coinciden; se explican los 3 primeros. Los demás:', hallados.length);
    hallados.slice(3, 20).forEach(function (c) {
      Logger.log('    B fila %s | %s', c.fila, c.nombre);
    });
  }
  hallados.slice(0, 3).forEach(function (c) { _explicarUnFormulario_diag6(ctx, c); });
  return { hallados: hallados.length };
}

function explicarFila(n) {
  Logger.log('=== explicarFila(%s) — sólo lectura, no escribe nada ===', n);
  if (!/^\s*\d+\s*$/.test(String(n))) {
    Logger.log('  explicarFila necesita un NÚMERO de fila del destino (CASO_A_EXPLICAR = %s).', n);
    return {};
  }
  const ctx = _contexto_diag6();
  const plan = ctx.plan, comunas = plan.comunas;
  const f = plan.dest.filas.filter(function (x) { return x.fila === Number(n); })[0];
  if (!f) { Logger.log('  La fila %s no es una fila con datos del destino.', n); return {}; }

  const pf = plan.porFila[f.fila] || {};
  const cDest = f.barrio ? comunas.get(normalizeText_(f.barrio)) : null;
  const eje = ejeInfoDeBarrio_(f.barrio);
  const insD = _insDestino_(plan.dest, f);
  Logger.log('FILA %s del destino [%s]', f.fila, enVentanaAnalisis_(f.fecha) ? 'ventana' : 'histórico');
  Logger.log('  figura %s | fecha %s | barrio %s | comuna %s | eje %s', f.figura || '(vacía)',
             fmtFecha_(f.fecha) || '(sin fecha)', f.barrio || '(vacío)',
             cDest == null ? '(no deriva)' : cDest,
             eje.eje ? eje.eje : (eje.pendiente ? '"' + eje.raw + '" (pendiente, no se evalúa)' : '-'));
  Logger.log('  evento: %s | RDV_UID: %s', f.evento || '-', f.uid || '-');
  Logger.log('  inscriptos del destino: %s   (sólo informativo: no entra en nada del matching)',
             insD === null ? '(vacío)' : (insD === 0 ? '0 = sin cargar' : insD));
  Logger.log('  VEREDICTO: %s%s', pf.veredicto || '?', pf.motivo ? ' / ' + pf.motivo : '');
  if (pf.cand) {
    Logger.log('    elegido: B fila %s | score %s | segundo %s | %s', pf.cand.fila, pf.score,
               pf.segundo == null ? '-' : pf.segundo, pf.cand.nombre);
  }
  if (pf.desempate) Logger.log('    ganó por desempate: %s', _nombreCriterio_(pf.desempate));
  if (pf.porInvariante) Logger.log('    tomó este formulario porque el suyo lo ganó otra fila (invariante)');
  if (ctx.traza[f.fila]) Logger.log('    traza (form_nivel): %s', ctx.traza[f.fila]);
  if (pf.contendientes && pf.contendientes.length) {
    Logger.log('    contendientes (a menos de MARGEN_MINIMO del mejor):');
    pf.contendientes.forEach(function (sc) { Logger.log('      %s', _descPar_(sc)); });
  }

  // Los formularios que pueden ser de esta fila: de su figura a ±VENTANA_EMPAREJAR_DIAS, y los
  // sin figura cercanos (a ±tolerancia, o con la ubicación coincidente dentro de la ventana).
  const figNorm = normalizeText_(f.figura);
  const lista = [];
  plan.cands.vivos.forEach(function (c) {
    const d = distanciaFecha_(f.fecha, c.det);
    if (d === null || d > VENTANA_EMPAREJAR_DIAS) return;
    if (c.figurasNorm.indexOf(figNorm) !== -1) { lista.push({ c: c, d: d }); return; }
    if (c.figurasNorm.length) return;
    const ubicOk = (f.barrio && c.barrio && normalizeText_(f.barrio) === normalizeText_(c.barrio)) ||
                   (c.comuna != null && cDest != null && c.comuna === cDest);
    if (ubicOk || d <= TOLERANCIA_REPROGRAMACION_DIAS) lista.push({ c: c, d: d });
  });
  lista.sort(function (a, b) { return a.d - b.d; });
  Logger.log('--- %s formularios de su figura (o sin figura, cerca) a ±%s días ---', lista.length,
             VENTANA_EMPAREJAR_DIAS);
  lista.forEach(function (x) {
    Logger.log('  B fila %s | %s | ins=%s | fecha %s (%s) | %s', x.c.fila, x.d + ' días',
               x.c.inscriptos || 0, fmtFecha_(x.c.det && x.c.det.mejor), (x.c.det && x.c.det.fuente) || '-',
               x.c.nombre);
    _logPar_diag6(ctx, f, x.c, '    ');
  });
  return { formularios: lista.length };
}

function listarFilasFaltantes() {
  Logger.log('=== listarFilasFaltantes — sólo lectura, no escribe nada ===');
  const ctx = _contexto_diag6();
  const huerf = ctx.plan.emp.huerfanos || [];
  const min = MIN_INSCRIPTOS_FILA_FALTANTE;
  const items = huerf.map(function (c) {
    const fecha = c.det && c.det.mejor;
    return { c: c, fecha: fecha, ev: enVentanaAnalisis_(fecha) };
  });
  const listar = items.filter(function (x) { return (x.c.inscriptos || 0) >= min; });
  const chicos = contador_(), cnt = contador_();
  items.forEach(function (x) { if ((x.c.inscriptos || 0) < min) sumar_(chicos, x.ev); });
  listar.forEach(function (x) { sumar_(cnt, x.ev); });
  listar.sort(function (a, b) {
    if (a.ev !== b.ev) return a.ev ? -1 : 1;
    return (a.fecha ? a.fecha.getTime() : 0) - (b.fecha ? b.fecha.getTime() : 0);
  });

  Logger.log('VENTANA: corte %s (%s). Se lee [ventana | total].',
             fmtFecha_(inicioVentanaAnalisis_()), descVentanaAnalisis_());
  Logger.log('Formularios de B SIN NINGÚN candidato en el destino (ni fila escrita, ni par en ' +
             'EMPAREJAR_MANUAL): %s', huerf.length);
  Logger.log('  con %s inscriptos o más → POSIBLE FILA FALTANTE EN RDV: %s', min, _dc_(cnt));
  Logger.log('  con menos de %s: %s (no se listan)', min, _dc_(chicos));
  Logger.log('  "Posible": el formulario existe y nadie en RDV lo reclama. Puede ser una reunión que');
  Logger.log('  no se cargó, o una fila cargada con otra figura/fecha. Lo decide el equipo.');
  listar.forEach(function (x) {
    const c = x.c;
    Logger.log('  [%s] %s | ins=%s | figura %s | barrio %s | comuna %s | B fila %s | %s',
               x.ev ? 'ventana' : 'histor.', fmtFecha_(x.fecha) || '(sin fecha)', c.inscriptos || 0,
               figurasEnTexto_(c.nombre).join(' + ') || '(ninguna)', c.barrio || '-',
               c.comuna == null ? '-' : c.comuna, c.fila, c.nombre);
  });
  return { listados: cnt, chicos: chicos };
}

// ===================== helpers =====================

function _contexto_diag6() {
  const plan = calcularPlan_(true);
  const tomadoPor = {}, resueltas = {}, traza = {};
  plan.decisiones.forEach(function (d) {
    traza[d.fila.fila] = d.nivel;
    if (d.noEscribir) return;
    resueltas[d.fila.fila] = true;
    if (d.cand) tomadoPor[d.cand.fila] = d.fila.fila;
  });
  return { plan: plan, tomadoPor: tomadoPor, resueltas: resueltas, traza: traza };
}

function _explicarUnFormulario_diag6(ctx, c) {
  const plan = ctx.plan, det = c.det || {};
  const figuras = figurasEnTexto_(c.nombre);
  Logger.log('FORMULARIO B fila %s [%s]', c.fila, enVentanaAnalisis_(det.mejor) ? 'ventana' : 'histórico');
  Logger.log('  nombre: %s', c.nombre);
  Logger.log('  inscriptos: %s', c.inscriptos || 0);
  Logger.log('  fecha usada: %s  (fuente: %s) | del texto: %s | fecha_fin: %s', fmtFecha_(det.mejor) || '-',
             det.fuente || '-', fmtFecha_(det.texto) || '-', fmtFecha_(det.fechaFin) || '-');
  if (det.rechazadas && det.rechazadas.length) {
    Logger.log('  ocurrencias de fecha descartadas (regla del mes): %s', det.rechazadas.map(function (r) {
      return r.dia + '/' + r.mes + ' ' + r.motivo; }).join(', '));
  }
  Logger.log('  figuras: %s | barrio: %s | comuna: %s | eje: %s | temático: %s',
             figuras.join(' + ') || '(ninguna)', c.barrio || '-', c.comuna == null ? '-' : c.comuna,
             c.eje ? (c.eje.eje || c.eje.forma + ' (no reconocido)') : '-', c.tematico ? 'sí' : 'no');
  const tomado = ctx.tomadoPor[c.fila];
  Logger.log('  hoy: %s', tomado != null ? 'lo toma la fila ' + tomado + ' del destino'
    : (plan.emp.huerfanos.indexOf(c) !== -1 ? 'HUÉRFANO (sin ningún candidato)' : 'libre, con pares en EMPAREJAR_MANUAL'));

  const comunas = plan.comunas;
  const lista = [];
  plan.dest.filas.forEach(function (f) {
    const d = distanciaFecha_(f.fecha, det);
    if (d === null || d > VENTANA_EMPAREJAR_DIAS) return;
    if (c.figurasNorm.length) {
      if (c.figurasNorm.indexOf(normalizeText_(f.figura)) !== -1) lista.push({ f: f, d: d });
      return;
    }
    // sin figura: las filas cercanas o de su misma ubicación
    const cDest = f.barrio ? comunas.get(normalizeText_(f.barrio)) : null;
    const ubicOk = (f.barrio && c.barrio && normalizeText_(f.barrio) === normalizeText_(c.barrio)) ||
                   (c.comuna != null && cDest != null && c.comuna === cDest);
    if (ubicOk || d <= TOLERANCIA_REPROGRAMACION_DIAS) lista.push({ f: f, d: d });
  });
  lista.sort(function (a, b) { return a.d - b.d; });
  Logger.log('--- %s filas del destino %s a ±%s días ---', lista.length,
             c.figurasNorm.length ? 'de su figura' : '(sin figura: cercanas o de su ubicación)',
             VENTANA_EMPAREJAR_DIAS);
  lista.forEach(function (x) {
    const f = x.f, pf = plan.porFila[f.fila] || {};
    Logger.log('  fila %s | %s | %s | %s | %s días | la fila hoy: %s%s', f.fila, fmtFecha_(f.fecha),
               f.figura, f.barrio || 'sin barrio', x.d, pf.veredicto || '?',
               pf.motivo ? '/' + pf.motivo : '');
    _logPar_diag6(ctx, f, c, '    ');
  });
}

/** El par (fila, formulario), señal por señal, con la puerta de EMPAREJAR_MANUAL. */
function _logPar_diag6(ctx, f, c, sangria) {
  const plan = ctx.plan, comunas = plan.comunas;
  const sc = puntuar_(f, c, comunas);
  const L = function (s) { Logger.log(sangria + s); };
  L('score ' + sc.score + ' (' + sc.absoluto + ' / ' + sc.alcanzable + ') | señales: ' + sc.nivel);

  // figura
  if (sc.nombraFigura) L('  figura ...... coincide (+' + PESOS_MATCH.figura + ')');
  else if (sc.porSinFigura) L('  figura ...... el formulario no nombra a nadie: sale del denominador ' +
                              '(sin_figura_por_ubicacion)');
  else if (!c.figurasNorm.length) L('  figura ...... el formulario no nombra a nadie: cuesta ' + PESOS_MATCH.figura);
  else L('  figura ...... NO: el formulario nombra a ' + figurasEnTexto_(c.nombre).join(' + ') +
         ', no a ' + (f.figura || '(vacía)'));

  // fecha
  if (sc.dist === null) L('  fecha ....... no evaluable (sin fecha de un lado)');
  else L('  fecha ....... ' + sc.dist + ' días → ' + redondear_(PESOS_MATCH.fechaExacta - sc.perdido.fecha) +
         ' de ' + PESOS_MATCH.fechaExacta);

  // ubicación
  const bDest = normalizeText_(f.barrio), bCand = normalizeText_(c.barrio);
  const cDest = bDest ? comunas.get(bDest) : null;
  if (bCand && bDest) {
    L('  ubicación ... barrio: destino ' + f.barrio + ' vs formulario ' + c.barrio +
      (bDest === bCand ? ' → coincide' : ' → DESACUERDO'));
  } else if (c.comuna != null && cDest != null) {
    L('  ubicación ... comuna: destino ' + cDest + ' vs formulario ' + c.comuna +
      (cDest === c.comuna ? ' → coincide' : ' → DESACUERDO'));
  } else {
    L('  ubicación ... no evaluable (barrio del formulario: ' + (c.barrio || '-') + ', comuna: ' +
      (c.comuna == null ? '-' : c.comuna) + ', comuna del destino: ' + (cDest == null ? '-' : cDest) + ')');
  }
  const ejeF = ejeDeBarrio_(f.barrio);
  if (c.eje && c.eje.tipo === 'eje') {
    L('  eje ......... destino ' + (ejeF || '(sin eje o pendiente)') + ' vs formulario ' + c.eje.eje +
      ' → ' + (sc.ejeCoincide ? 'coincide' : 'no coincide') + ' (sólo último desempate; no puntúa)');
  }

  // hora
  if (sc.evaluables.hora) L('  hora ........ ' + (sc.perdido.hora ? 'NO coincide' : 'coincide'));

  if (sc.desacuerdo) {
    L('  >>> DESCALIFICADO para el match automático: ubicación en desacuerdo. Sin la ubicación ' +
      'daría ' + sc.resto + (sc.resto >= UMBRAL_MATCH ? ' (≥ umbral)' : ' (< umbral)') + '.');
  }
  L('  relevante (puerta del match automático): ' + (sc.relevante ? 'sí' : 'no'));
  L('  EMPAREJAR_MANUAL: ' + _puertaEmparejar_diag6(ctx, f, c, sc));
}

function _puertaEmparejar_diag6(ctx, f, c, sc) {
  const plan = ctx.plan;
  if (f.uid) return 'NO — la fila ya tiene RDV_UID';
  if (f.fecha && f.fecha > _hoy_()) return 'NO — la reunión todavía no pasó';
  if (ctx.resueltas[f.fila]) {
    const pf = plan.porFila[f.fila] || {};
    if (pf.cand === c) return 'no hace falta — es el formulario que se escribe en esta fila';
    return 'NO — la fila ya se escribe' + (pf.cand ? ' (con B fila ' + pf.cand.fila + ')' : '');
  }
  if (ctx.tomadoPor[c.fila] != null) return 'NO — el formulario ya lo toma la fila ' + ctx.tomadoPor[c.fila];
  if (!sc.proponible) {
    if (!sc.nombraFigura) return 'NO — no nombra la figura de la fila (la puerta pide figura)';
    return 'NO — fecha a ' + (sc.dist === null ? '?' : sc.dist) + ' días (> ' + VENTANA_EMPAREJAR_DIAS +
           ') y sin comuna coincidente';
  }
  if (sc.score < PISO_EMPAREJAR) return 'NO — score ' + sc.score + ' < PISO_EMPAREJAR ' + PISO_EMPAREJAR;
  if (plan.emp.paresSet && plan.emp.paresSet[c.fila + '|' + f.fila]) return 'SÍ, está en la lista';
  return 'NO — lo cortó el tope de ' + MAX_PARES_POR_FILA + ' pares por fila';
}
