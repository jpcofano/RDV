/**
 * 26_Fichas.js — REVISAR_MATCH como fichas (decisión del usuario, 03/10).
 *
 * Una ficha por reunión pendiente (REVISAR_MATCH o SIN_MATCH), de la más reciente a la más vieja, sólo
 * filas activas (DIAS_ACTIVOS). Cada ficha, en LAS MISMAS COLUMNAS:
 *
 *   REUNIÓN       fila del destino, figura, fecha (con día), barrio (comuna), evento, inscriptos del
 *                 destino, asistentes (RDV CONJUNTO). Inscriptos y asistentes son sólo para la persona:
 *                 no son señal del sistema (regla 5). Acá van "elegido" (desplegable), "comentario" y
 *                 "resultado" (lo escribe el sistema);
 *   ¿por qué?     una frase por motivo, con los datos de la fila;
 *   Opción 1..3   POR PUNTAJE, de mayor a menor (a igual puntaje, por cercanía de fecha): figura(s) del
 *                 formulario, Fecha_Fin, ubicación detectada, nombre, inscriptos DEL FORMULARIO, días de
 *                 diferencia, confianza en palabras (alta / media / baja; el número, en una columna
 *                 oculta) y "ocupado por". Verde si coincide con la reunión, rojo si no, gris si no se
 *                 puede comparar, amarillo para el eje (sólo para la persona: no puntúa);
 *                 debajo, la línea "coincide / no coincide" (✅ ❌ ⚪ ⚠️), traducida del puntaje;
 *   en gris       las otras reuniones de la misma figura a ±DIAS_CONTEXTO_FICHA días, y los formularios
 *                 de la figura descartados por la regla 3 (casi sin inscriptos, gemelo de otro).
 *
 * "¿por qué?" habla de la opción 1, salvo cuando el motivo es de otro formulario (una posible
 * reubicación, un multi_figura): entonces lo nombra con su número y dice por qué la opción 1 no se escribe.
 *
 * Al final, la sección RESUELTAS: las elecciones aplicadas, válidas (se aplican en la próxima corrida
 * real) y "ninguno", con su resultado y su fecha. El lector no la lee.
 *
 * --- Identidad (no cambia: regla 4, 25_Elecciones.js) ---
 * La fila, por figura + fecha + barrio (columnas ocultas id_figura, id_fecha, id_barrio de la línea
 * REUNIÓN); el formulario, por su clave (columna oculta form_clave de cada línea de opción). Nunca por
 * número de fila. Las elecciones se guardan en ELECCIONES_MATCH.
 *
 * Dónde (06/10): con SOLAPA_FICHAS_EN_DESTINO, en la solapa REVISAR_MATCH del ARCHIVO del destino (no en la
 * solapa RVD JM-CM - ES), con ELEGIR y COMENTARIO adelante, marcados y como única zona editable; la de la
 * intermedia queda con un aviso. Si no, en la intermedia.
 *
 * Formato (06/10, prendido): con REVISAR_FORMATO_NUEVO, el diseño aprobado (docs/revisar-match-ficha-tecnica.md): las
 * mismas fichas, armadas por `armarFichasFormato_` y dibujadas por `renderRevisarMatch` (27_RevisarFormato.js)
 * en columnas A..M fijas, con la identidad en auxiliares ocultas desde la N (`escribirFichasFormato_`). Sin
 * él, el formato de una ficha por bloque (`armarFichas_` / `escribirFichas_`). El lector entiende los dos.
 */

/** Las columnas de una ficha. Las cuatro últimas, ocultas: la identidad. */
/*
 * Dos órdenes de columnas: el del ARMADO (cómo se construye cada línea, abajo) y el de la SOLAPA (06/10): lo
 * que escribe una persona va ADELANTE —ELEGIR y COMENTARIO, después "resultado"—, y recién después la ficha.
 * `armarFichas_` arma con el primero y al final reordena al segundo.
 */
const COLS_FICHA_ARMADO_ = ['ficha', 'fila', 'figura', 'fecha', 'ubicación', 'evento / formulario', 'inscriptos',
                            'asistentes', 'días', 'confianza', 'ocupado por', 'elegido', 'comentario', 'resultado',
                            'id_figura', 'id_fecha', 'id_barrio', 'form_clave', 'puntaje'];
const COLS_FICHA_ = ['ELEGIR', 'COMENTARIO', 'resultado'].concat(COLS_FICHA_ARMADO_.filter(function (c) {
  return ['elegido', 'comentario', 'resultado'].indexOf(c) < 0;
}));
/** Las últimas, ocultas: la identidad (id_*, form_clave) y el puntaje en número (la ficha lo dice en palabras). */
const FICHA_COLS_OCULTAS_ = 5;
/** Colores: verde coincide, rojo no, gris no se puede comparar, amarillo sólo para la persona (el eje). */
const FICHA_COLOR_ = { si: '#d9ead3', no: '#f4cccc', gris: '#eeeeee', amarillo: '#fff2cc', reunion: '#f3f3f3',
                       elegir: '#fff9c4', bordeElegir: '#bf9000', separador: '#999999',
                       titulo: '#d9d9d9', textoGris: '#888888', textoNormal: '#000000' };
const FICHA_ETIQUETA_ = { reunion: 'REUNIÓN', porQue: '¿por qué?', opcion: 'Opción ', contexto: 'otra reunión',
                          descartado: 'formulario descartado', resueltas: 'RESUELTAS', resuelta: 'resuelta',
                          pendientes: 'PENDIENTES' };
const DIAS_SEMANA_ = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** ¿Es una hoja de fichas? Por el encabezado: el formato de una ficha por bloque, o el aprobado el 06/10 (aux_linea). */
function esHojaDeFichas_(hdr) {
  const tiene = function (n) { return !!hdr && hdr.some(function (h) { return normalizeHeader_(h) === n; }); };
  return (tiene('ficha') || tiene('aux_linea')) && tiene('id_figura');
}

// ===================== Armado =====================

/**
 * Las fichas, como matriz + formato. `opts.filas`: números de fila del destino a mostrar SIEMPRE (la
 * vista previa del paso 21), estén o no pendientes y activas; sin `opts.filas`, las pendientes activas.
 *
 * Devuelve `{ matriz, formato: [{bg[], fc[], negrita, desplegable}], fichas: [{f, desde, hasta, motivo}],
 * pendientes, resueltas, porMotivo }`.
 */
function armarFichas_(plan, asis, opts) {
  opts = opts || {};
  const dest = plan.dest, comunas = plan.comunas, porFila = plan.porFila;
  const ctx = _contextoFichas_(plan, asis);
  const salida = [], formato = [], fichas = [], porMotivo = {};
  const ancho = COLS_FICHA_ARMADO_.length;
  const linea = function (valores, fmt) {
    const v = valores.slice(); while (v.length < ancho) v.push('');
    salida.push(v);
    formato.push(Object.assign({ bg: v.map(function () { return null; }), fc: v.map(function () { return null; }),
                                 negrita: false, desplegable: null }, fmt || {}));
    return salida.length - 1;
  };
  linea(COLS_FICHA_ARMADO_, { negrita: true, bg: COLS_FICHA_ARMADO_.map(function () { return FICHA_COLOR_.titulo; }) });

  const lista = _listaFichas_(plan, ctx, opts);
  linea([FICHA_ETIQUETA_.pendientes + ' (' + lista.length + ')', 'reuniones de ' + descActivas_() +
         ' que el sistema no pudo emparejar solo. Elegí en "elegido" (la línea REUNIÓN); "No sé" la deja pendiente.'],
        { negrita: true });

  lista.forEach(function (f) {
    const pf = porFila[f.fila] || {};
    const primero = pf.cand || null;
    const op = opcionesDeFicha_(f, ctx, primero), ops = op.ops;
    const elec = _eleccionDeFicha_(ctx, f);
    const motivo = pf.veredicto === 'REVISAR_MATCH' || pf.veredicto === 'SIN_MATCH' ? (pf.motivo || pf.veredicto)
                 : (pf.veredicto || 'sin_veredicto');
    porMotivo[motivo] = (porMotivo[motivo] || 0) + 1;

    const desde = salida.length;
    // --- REUNIÓN ---
    const ins = _insDestino_(dest, f);
    const a = asis && asis.porFila ? asis.porFila.get(f.fila) : null;
    const asD = dest.D['Asistentes'] != null ? f.valores[dest.D['Asistentes']] : '';
    const er = _elegidoYResultado_(elec, ops);
    const nOps = ops.length;
    linea([FICHA_ETIQUETA_.reunion, f.fila, f.figura, _fechaLarga_(f.fecha), _ubicFila_(f, comunas), f.evento,
           ins == null ? '' : ins, a ? a.asis : (esVacio_(asD) ? '' : asD), '', '', '', er.elegido, elec.comentario,
           er.resultado, f.figura, _fechaId_(f.fecha), f.barrio, ''],
          { negrita: true, bg: COLS_FICHA_ARMADO_.map(function () { return FICHA_COLOR_.reunion; }),
            desplegable: _opcionesDesplegable_(nOps) });
    // --- ¿por qué? ---
    linea([FICHA_ETIQUETA_.porQue, _fraseMotivo_(f, pf, ops, ctx, op.excluidas)]);
    // --- las opciones ---
    if (!nOps) linea(['', fichas0810_() ? 'No hay formulario cercano' : '(no hay ningún formulario para proponer)'],
                     { fc: _gris_(ancho) });
    ops.forEach(function (sc, k) {
      const c = sc.c, duenio = _duenio_(ctx, c, f);
      const colF = _colorFecha_(sc), colU = _colorUbic_(sc, f);
      const colFig = sc.nombraFigura ? FICHA_COLOR_.si : (sc.sinFigura ? FICHA_COLOR_.gris : FICHA_COLOR_.no);
      const bg = COLS_FICHA_ARMADO_.map(function () { return null; });
      bg[2] = colFig; bg[3] = colF; bg[4] = colU; bg[8] = colF;
      if (duenio) bg[10] = FICHA_COLOR_.no;
      linea([FICHA_ETIQUETA_.opcion + (k + 1), '', _figurasDe_(c), _cierre_(c), _ubicForm_(c), c.nombre,
             c.inscriptos || 0, '', _diasTxt_(f, c), _confianza_(sc.score), duenio ? _descFila_(duenio) : '', '', '',
             '', '', '', '', c.clave, sc.score], { bg: bg });
      linea(['', _lineaCoincide_(f, sc, ctx)]);
    });
    // --- contexto: las otras reuniones de la figura a ±DIAS_CONTEXTO_FICHA ---
    _otrasReuniones_(ctx, f).forEach(function (o) {
      linea([FICHA_ETIQUETA_.contexto, o.f.fila, o.f.figura, _fechaLarga_(o.f.fecha), _ubicFila_(o.f, comunas),
             o.f.evento, '', '', _signo_(o.d), '', o.estado], { fc: _gris_(ancho) });
    });
    // --- contexto: los formularios de la figura descartados por la regla 3 (casi sin inscriptos) ---
    _descartadosCercanos_(ctx, f).forEach(function (x) {
      const c = x.c;
      linea([FICHA_ETIQUETA_.descartado, '', _figurasDe_(c), _cierre_(c), _ubicForm_(c), c.nombre, c.inscriptos || 0,
             '', _diasTxt_(f, c), '', 'descartado: ' + (c.inscriptos || 0) + ' inscriptos, cierra ' +
             _ddmm_(c.det && c.det.fechaFin) + (x.gemelo ? '; su gemelo tiene ' + (x.gemelo.inscriptos || 0) : '')],
            { fc: _gris_(ancho) });
    });
    linea([]);
    fichas.push({ f: f, desde: desde, hasta: salida.length - 1, motivo: motivo, veredicto: pf.veredicto || '' });
  });

  // --- RESUELTAS ---
  const resueltas = _resueltas_(ctx);
  linea([FICHA_ETIQUETA_.resueltas + ' (' + resueltas.length + ')',
         'lo que ya eligió una persona: aplicado, válido (se escribe en la próxima corrida) o "ninguno". ' +
         'Para anular: borrar su línea en ' + RDV_HOJA_ELECCIONES + '.'],
        { negrita: true, bg: COLS_FICHA_ARMADO_.map(function () { return FICHA_COLOR_.titulo; }) });
  resueltas.forEach(function (e) {
    const f = e.f;
    linea([FICHA_ETIQUETA_.resuelta, f ? f.fila : '', e.figura, _fechaLarga_(e.fecha),
           f ? _ubicFila_(f, comunas) : e.barrio, e.elegido === 'ninguno' ? '(ninguno)' : e.formNombre, '', '', '', '',
           '', e.elegido === 'ninguno' ? 'Ninguno' : (e.elegidoCrudo || 'sí'), e.comentario || '',
           (e.resultado || e.estado || '') + (e.fechaResultado instanceof Date ? ' · ' + fmtFecha_(e.fechaResultado) : '')]);
  });

  _reordenarFichas_(salida, formato);
  return { matriz: salida, formato: formato, fichas: fichas, pendientes: lista.length,
           resueltas: resueltas.length, porMotivo: porMotivo };
}

/** Del orden del armado al de la solapa (ELEGIR, COMENTARIO, resultado adelante). Modifica en el lugar. */
function _reordenarFichas_(salida, formato) {
  const orden = COLS_FICHA_.map(function (c) {
    return COLS_FICHA_ARMADO_.indexOf(c === 'ELEGIR' ? 'elegido' : (c === 'COMENTARIO' ? 'comentario' : c));
  });
  const mover = function (a) { return orden.map(function (k) { return a[k]; }); };
  salida.forEach(function (r, i) { salida[i] = mover(r); });
  salida[0] = COLS_FICHA_.slice();
  formato.forEach(function (f) { f.bg = mover(f.bg); f.fc = mover(f.fc); });
}

/**
 * Qué reuniones tienen ficha y en qué orden: `opts.filas` (la vista previa del paso 21), o las pendientes
 * (REVISAR_MATCH o SIN_MATCH) activas, de la más reciente a la más vieja. Los dos formatos usan ésta.
 */
function _listaFichas_(plan, ctx, opts) {
  if (opts.filas) return opts.filas.map(function (n) { return ctx.porNum[n]; }).filter(Boolean);
  const lista = plan.dest.filas.filter(function (f) {
    const pf = plan.porFila[f.fila];
    return pf && (pf.veredicto === 'REVISAR_MATCH' || pf.veredicto === 'SIN_MATCH') && esFilaActiva_(f.fecha);
  });
  lista.sort(function (a, b) {
    const ta = a.fecha ? a.fecha.getTime() : 0, tb = b.fecha ? b.fecha.getTime() : 0;
    return (tb - ta) || (a.fila - b.fila);
  });
  return lista;
}

/**
 * **Las opciones de una ficha**: las de `listaOpcionesFila_` (por puntaje, hasta OPCIONES_REVISION; la del plan,
 * `primero`, siempre entre ellas). Con FICHAS_0810_ACTIVAS (08/10), sin las que no pueden ser de esta reunión
 * (`_exclusionOpcion_`): a más de DIAS_OPCIONES_FICHA días, ya usadas por otra fila salvo a ±DIAS_OPCION_USADA, de una
 * reunión cerrada. Devuelve `{ ops, excluidas: [{ sc, motivo }] }`; las excluidas, por puntaje (las nombra "¿por qué?",
 * y las cuenta el paso 52).
 */
function opcionesDeFicha_(f, ctx, primero) {
  const plan = ctx.plan, n = OPCIONES_REVISION;
  if (!fichas0810_()) return { ops: listaOpcionesFila_(f, plan.cands.vivos, plan.comunas, primero, n), excluidas: [] };
  const ok = [], excluidas = [];
  listaOpcionesFila_(f, plan.cands.vivos, plan.comunas, null, 0).forEach(function (sc) {
    const motivo = _exclusionOpcion_(ctx, f, sc);
    if (motivo) excluidas.push({ sc: sc, motivo: motivo });
    else ok.push(sc);
  });
  const ops = ok.slice(0, n);
  if (primero && ops.length === n && !ops.some(function (sc) { return sc.c === primero; })) {
    const sc = ok.find(function (x) { return x.c === primero; });
    if (sc) ops[n - 1] = sc;
  }
  return { ops: ops, excluidas: excluidas };
}

/**
 * Por qué una opción NO se ofrece en la ficha de `f` (08/10), en palabras —"está a 20 días", "es de una reunión
 * cerrada", "es de otra figura (…) y ya lo tiene la fila 790 (…)", "ya lo tiene la fila 812 (03/10, Flores), a 6
 * días"—, o null si se ofrece. Una de otra figura que ya tiene su fila no se ofrece a ninguna distancia; una libre, sí
 * (p. ej. una "Seguridad" sin figura). "A ±DIAS_OPCION_USADA" se mide
 * como en el puntaje (`fechaCercana_`: un formulario sin fecha en el nombre, por su cierre). Lo de las reuniones
 * cerradas vale para las fichas de filas activas (la vista previa del paso 21 puede pedir una cerrada).
 */
function _exclusionOpcion_(ctx, f, sc) {
  const c = sc.c;
  if (sc.dist === null) return 'no tiene fecha';
  if (sc.dist > DIAS_OPCIONES_FICHA) return 'está a ' + sc.dist + ' días';
  const activa = esFilaActiva_(f.fecha);
  if (activa && !formularioDeReunionActiva_(c)) return 'es de una reunión cerrada';
  const d = _duenio_(ctx, c, f);
  if (d) {
    if (activa && !esFilaActiva_(d.fecha)) return 'ya lo tiene la fila ' + _descFila_(d) + ', una reunión cerrada';
    // 08/10 (decisión del usuario, con el paso 52): uno de OTRA figura que ya tiene su fila, a cualquier distancia.
    if (c.figurasNorm.length && c.figurasNorm.indexOf(normalizeText_(f.figura)) < 0) {
      return 'es de otra figura (' + _figurasDe_(c) + ') y ya lo tiene la fila ' + _descFila_(d);
    }
    if (!fechaCercana_(f.fecha, c.det, DIAS_OPCION_USADA)) return 'ya lo tiene la fila ' + _descFila_(d) + ', a ' + sc.dist + ' días';
  }
  return null;
}

/**
 * Lo que muestran "elegido" y "resultado" de una ficha, a partir de su elección (`_eleccionDeFicha_`):
 * "Opción k" por la clave del formulario entre las opciones de hoy (nunca por la posición de antes),
 * "Ninguno", "No sé". Si lo elegido ya no está entre las opciones, lo dice el resultado.
 */
function _elegidoYResultado_(elec, ops) {
  let elegido = '';
  if (elec.e) {
    if (elec.e.elegido === 'ninguno') elegido = 'Ninguno';
    else if (elec.e.elegido === 'no_se') elegido = 'No sé';
    else if (elec.e.elegido === 'formulario') {
      ops.forEach(function (sc, k) { if (sc.c.clave === elec.e.formClave) elegido = 'Opción ' + (k + 1); });
    }
  }
  let resultado = elec.e && elec.e.estado !== 'nota' && elec.e.estado !== 'no_se' ? (elec.e.resultado || '') : '';
  if (elec.e && elec.e.elegido === 'formulario' && !elegido) {
    resultado = 'elegido «' + elec.e.formNombre + '» (no está entre las opciones): ' + resultado;
  }
  return { elegido: elegido, resultado: resultado };
}

/** Lo que las fichas necesitan del plan, armado una vez. */
function _contextoFichas_(plan, asis) {
  const porNum = {}, porFig = {}, duenioGrupo = new Map();
  plan.dest.filas.forEach(function (f) {
    porNum[f.fila] = f;
    const k = normalizeText_(f.figura);
    (porFig[k] = porFig[k] || []).push(f);
  });
  // De quién es cada grupo de gemelos: las filas que se escriben y las que ya tienen RDV_UID (todo el
  // historial: un formulario de una fila vieja sigue ocupado).
  Object.keys(plan.porFila).forEach(function (n) {
    const pf = plan.porFila[n];
    if (pf.veredicto !== 'escribiria' && pf.veredicto !== 'rdv_uid') return;
    const g = pf.cand ? pf.cand.grupo : pf.grupo;
    if (g && !duenioGrupo.has(g)) duenioGrupo.set(g, porNum[n]);
  });
  const elecPorFila = {};
  (plan.elecciones ? plan.elecciones.todas : []).forEach(function (e) {
    (elecPorFila[_filaEleccion_(e)] = elecPorFila[_filaEleccion_(e)] || []).push(e);
  });
  // Los descartados por la regla 3 (no están en los candidatos): por figura, con su gemelo con inscriptos.
  const descartados = [];
  ((plan.cands.gemelos && plan.cands.gemelos.grupos) || []).forEach(function (g) {
    const vivo = g.forms.filter(function (c) { return !c.descartadoRegla3; })
      .sort(function (a, b) { return (b.inscriptos || 0) - (a.inscriptos || 0); })[0] || null;
    g.forms.forEach(function (c) { if (c.descartadoRegla3) descartados.push({ c: c, gemelo: vivo }); });
  });
  return { plan: plan, porNum: porNum, porFig: porFig, duenioGrupo: duenioGrupo, elecPorFila: elecPorFila, asis: asis,
           descartados: descartados };
}

/** La fila que ya tiene el formulario (o su gemelo), si no es `f`. */
function _duenio_(ctx, c, f) {
  const d = ctx.duenioGrupo.get(c.grupo);
  return d && d.fila !== f.fila ? d : null;
}

/**
 * La elección que muestra la ficha de `f`: la pendiente, si no "No sé", si no la última rechazada o
 * vencida; el comentario, el de esa elección o el de la nota de la fila.
 */
function _eleccionDeFicha_(ctx, f) {
  const lista = (ctx.elecPorFila[normalizeText_(f.figura) + '|' + (f.fecha ? ymd_(f.fecha) : '') + '|' +
                 normalizeText_(f.barrio)] || []).filter(function (e) { return e.estado !== 'reemplazada'; });
  const de = function (estado) { return lista.filter(function (e) { return e.estado === estado; }).pop() || null; };
  const e = de('pendiente') || de('no_se') || de('rechazado') || de('ninguno_vencido') || de('nota');
  const nota = de('no_se') || de('nota');
  return { e: e, comentario: (e && e.comentario) || (nota && nota.comentario) || '' };
}

/** Las resueltas: aplicadas, válidas y "ninguno" (la última por fila). */
function _resueltas_(ctx) {
  const porFila = {};
  (ctx.plan.elecciones ? ctx.plan.elecciones.todas : []).forEach(function (e) {
    const ok = e.estado === 'aplicado' || e.estado === 'ninguno' || e.resultadoPlan === 'valida';
    if (!ok) return;
    porFila[_filaEleccion_(e)] = e;
  });
  return Object.keys(porFila).map(function (k) {
    const e = porFila[k];
    if (!e.f) {
      e.f = ctx.plan.dest.filas.find(function (f) {
        return normalizeText_(f.figura) === normalizeText_(e.figura) && f.fecha && e.fecha &&
               ymd_(f.fecha) === ymd_(e.fecha) && normalizeText_(f.barrio) === normalizeText_(e.barrio);
      }) || null;
    }
    return e;
  }).sort(function (a, b) { return (b.fecha ? b.fecha.getTime() : 0) - (a.fecha ? a.fecha.getTime() : 0); });
}

/** Los formularios de la figura de `f` descartados por la regla 3, a ±DIAS_CONTEXTO_FICHA días de su fecha. */
function _descartadosCercanos_(ctx, f) {
  const fig = normalizeText_(f.figura);
  return ctx.descartados.filter(function (x) {
    if (x.c.figurasNorm.indexOf(fig) < 0) return false;
    const d = distanciaFecha_(f.fecha, x.c.det);
    return d !== null && d <= DIAS_CONTEXTO_FICHA;
  });
}

/** Las otras reuniones de la figura de `f` a ±DIAS_CONTEXTO_FICHA días, con su estado. */
function _otrasReuniones_(ctx, f) {
  if (!f.fecha) return [];
  return (ctx.porFig[normalizeText_(f.figura)] || []).filter(function (o) {
    return o.fila !== f.fila && o.fecha && Math.abs(diasEntre_(o.fecha, f.fecha)) <= DIAS_CONTEXTO_FICHA;
  }).sort(function (a, b) { return a.fecha - b.fecha || a.fila - b.fila; }).map(function (o) {
    const pf = ctx.plan.porFila[o.fila] || {};
    let estado;
    if (pf.veredicto === 'escribiria' || (pf.veredicto === 'rdv_uid' && pf.cand)) estado = 'con formulario: «' + pf.cand.nombre + '»';
    else if (pf.veredicto === 'rdv_uid') estado = 'con formulario (' + (o.formOrigen || 'traza ambigua') + ')';
    else if (pf.veredicto === 'REVISAR_MATCH' || pf.veredicto === 'SIN_MATCH') estado = 'sin formulario (también en revisión)';
    else if (pf.veredicto === 'futura') estado = 'futura';
    else if (pf.veredicto === 'cerrada') estado = 'cerrada, sin formulario';
    else if (pf.veredicto === 'pendiente_barrio') estado = 'esperando el barrio';
    else if (pf.veredicto === 'esperando_formulario') estado = 'esperando su formulario';
    else if (pf.veredicto === 'ninguno_por_persona') estado = '"ninguno" (lo decidió una persona)';
    else estado = pf.veredicto || '';
    return { f: o, d: diasEntre_(o.fecha, f.fecha), estado: estado };
  });
}

// ===================== Las frases =====================

/**
 * "¿Por qué está acá?": una frase por motivo, con los datos de la fila. **Habla de la opción 1** (la de
 * más puntaje), salvo los motivos que son de un formulario en particular —una posible reubicación, un
 * multi_figura, dos formularios con la misma clave, el único descalificado—: entonces lo nombra por su
 * número y, si no es la 1, agrega por qué la opción 1 no se escribe sola.
 *
 * Con las opciones cercanas (08/10, FICHAS_0810_ACTIVAS) el formulario del que habla el motivo puede no estar entre las
 * opciones (`excluidas`: a más de 14 días, ya usado por otra fila a más de 3, de una reunión cerrada): se lo nombra igual
 * —"El formulario «…» (a N días; no está entre las opciones)"—, y una ficha sin ninguna opción dice "No hay formulario
 * cercano" (`_fraseSinOpciones_`).
 */
function _fraseMotivo_(f, pf, ops, ctx, excluidas) {
  const m = pf.motivo || pf.veredicto;
  const comunas = ctx.plan.comunas;
  const fig = f.figura || 'la figura';
  excluidas = excluidas || [];
  if (!ops.length && fichas0810_() && (pf.veredicto === 'REVISAR_MATCH' || pf.veredicto === 'SIN_MATCH')) {
    return _fraseSinOpciones_(f, pf, excluidas);
  }
  // De qué opción habla el motivo: la 1, o la del formulario del motivo.
  let k = 0;
  if (['ubicacion_en_desacuerdo', 'multi_figura', 'clave_repetida', 'desacuerdo_y_resto_bajo'].indexOf(m) >= 0) {
    const i = ops.findIndex(function (x) { return x.c === pf.cand; });
    if (i >= 0) k = i;
  }
  const fuera = _formularioFueraDelMotivo_(m, pf, ops, excluidas, ctx, f);
  const sc = fuera ? fuera.sc : (ops[k] || null);
  const c = sc ? sc.c : null;
  const dueno = c ? _duenio_(ctx, c, f) : null;
  const Nom = function (k) {
    return fuera ? 'El formulario «' + c.nombre + '» (' + (sc.dist === null ? 'sin fecha' : 'a ' + sc.dist + ' días') +
                   '; no está entre las opciones)'
                 : 'La opción ' + (k + 1) + ', «' + ops[k].c.nombre + '»,';
  };
  const laQue = fuera ? 'el que' : 'la que', laTiene = fuera ? 'lo tiene' : 'la tiene';
  let t;
  switch (m) {
    case 'formulario_compartido':
      if (!c) { t = 'Su formulario lo ganó otra reunión y no le quedó ninguno claro.'; break; }
      if (dueno) {
        t = Nom(k) + ' es ' + laQue + ' más coincide, pero ya ' + laTiene + ' la fila ' + _descFila_(dueno) +
            ', que tenía más evidencia. Sin ' + (fuera ? 'ése' : 'ésa') + ', ninguna otra alcanza para escribirla sola.';
      } else {
        const otras = _otrasConMismoFormulario_(ctx, f, c);
        t = Nom(k) + ' la reclaman esta reunión y ' + (otras.length ? 'la fila ' + otras.map(_descFila_).join(', la fila ') : 'otra') +
            ' con la misma evidencia: el sistema no puede elegir de cuál es.';
      }
      break;
    case 'formulario_gemelo':
      if (!c) { t = 'Hay dos formularios con el mismo nombre (la misma reunión) y otra fila ya tiene uno.'; break; }
      if ((c.gemelos || 1) > 1) {
        t = Nom(k) + ' tiene ' + (c.gemelos - 1) + ' gemelo(s) con el mismo nombre: son la misma reunión' +
            (dueno ? ', y la fila ' + _descFila_(dueno) + ' ya tiene uno. Una reunión no puede tener dos formularios iguales.'
                   : ', y no se puede saber cuál es el de esta reunión.');
      } else {
        t = Nom(k) + ' es ' + laQue + ' más coincide' + (dueno ? ', pero ya ' + laTiene + ' la fila ' + _descFila_(dueno) +
            ' (un formulario con el mismo nombre es la misma reunión).' : ', pero tiene un gemelo con el mismo nombre en otra fila.');
      }
      break;
    case 'clave_repetida': {
      if (!c) { t = 'Hay dos formularios con el mismo nombre y el mismo cierre.'; break; }
      const mismos = ctx.plan.cands.vivos.filter(function (x) { return x.clave === c.clave; });
      t = Nom(k) + ' tiene otro formulario con el mismo nombre y el mismo cierre (' + _ddmm_(c.det && c.det.fechaFin) +
          '), los dos con inscriptos (' + mismos.map(function (x) { return x.inscriptos || 0; }).join(' y ') +
          '): no se sabe cuál es el de esta reunión.';
      break;
    }
    case 'ubicacion_en_desacuerdo':
      if (!c) { t = 'El formulario dice otra ubicación.'; break; }
      t = Nom(k) + ' nombra a ' + fig + ' y ' + _fraseFecha_(f, sc) + ', pero dice ' + _ubicForm_(c) +
          ' y la reunión está cargada en ' + _ubicFila_(f, comunas) +
          '. Puede ser una reunión que cambió de lugar (si es ésta, vale el barrio de RDV): el sistema no la escribe sola.';
      break;
    case 'multi_figura':
      if (!c) { t = 'El formulario nombra a varias figuras.'; break; }
      t = Nom(k) + ' nombra a ' + c.figurasNorm.length + ' figuras (' + _figurasDe_(c) +
          '): es una inscripción compartida y no se sabe a qué reunión van sus inscriptos.';
      break;
    case 'margen_chico':
      t = ops.length >= 2
        ? 'Las opciones 1 y 2 coinciden casi igual (confianza ' + _confianza_(ops[0].score) + ' y ' +
          _confianza_(ops[1].score) + ') y ninguna tiene más evidencia que la otra.'
        : 'Hay formularios casi igual de buenos y ninguno tiene más evidencia que el otro.';
      break;
    case 'score_bajo':
      t = c ? Nom(k) + ' es ' + laQue + ' más coincide, pero con confianza ' + _confianza_(sc.score) + ': ' +
              _queFalla_(f, sc, ctx) + '. No alcanza para escribirla sola.'
            : 'Ningún formulario alcanza para escribirla sola.';
      break;
    case 'sin_formulario_propio':
      t = 'No hay ningún formulario de ' + fig + ' a ' + TOLERANCIA_REPROGRAMACION_DIAS + ' días o menos de la reunión ' +
          '(ni uno sin figura de su comuna). Puede faltar en el origen o tener otra fecha.' +
          (c && !fuera ? ' La opción 1 es la más parecida (confianza ' + _confianza_(sc.score) + ').' : '');
      break;
    case 'desacuerdo_y_resto_bajo':
      t = c ? Nom(k) + ' es ' + (fuera ? 'el único cercano' : 'la única cercana') + ', pero dice ' + _ubicForm_(c) +
              ' (la reunión: ' + _ubicFila_(f, comunas) + ') y además ' + _queFalla_(f, sc, ctx) + '.'
            : 'El único formulario cercano dice otra ubicación.';
      break;
    case 'sin_candidatos':
      t = 'No hay ningún formulario de ' + fig + ', ni ninguno a 7 días o menos de la reunión.'; break;
    case 'escribiria':
      t = 'No está pendiente: el sistema la escribe con «' + (pf.cand ? pf.cand.nombre : '?') + '».'; break;
    case 'rdv_uid':
      t = 'No está pendiente: ya tiene formulario (' + (f.formOrigen || 'RDV_UID') + ').'; break;
    case 'cerrada':
      t = 'Cerrada: tiene más de ' + DIAS_ACTIVOS + ' días y no tiene formulario. No aparece en la solapa ni se toca.'; break;
    case 'futura':
      t = 'Todavía no pasó: no se empareja.'; break;
    case 'pendiente_barrio':
      t = 'Esperando el barrio: es de hoy o de ayer y RDV todavía no tiene el barrio. Se vuelve a mirar en la próxima corrida.'; break;
    case 'esperando_formulario':
      t = 'Esperando su formulario: la reunión es de hasta ' + DIAS_ESPERANDO_FORMULARIO + ' días atrás (o futura) y no hay ' +
          'ninguno libre a ' + TOLERANCIA_REPROGRAMACION_DIAS + ' días o menos. No aparece en la solapa; pasados esos días, sí.'; break;
    case 'ninguno_por_persona':
      t = 'Una persona eligió "ninguno": no se propone ni se escribe.'; break;
    default:
      t = 'Motivo: ' + (m || '?') + '.';
  }
  // Si el motivo es de otra opción, por qué la 1 (la de más puntaje) no se escribe sola.
  if (k > 0 && ops[0] && !fuera) {
    const s1 = ops[0], d1 = _duenio_(ctx, s1.c, f);
    t += ' La opción 1 tiene más puntaje (confianza ' + _confianza_(s1.score) + ')' +
         (d1 ? ', pero ya la tiene la fila ' + _descFila_(d1) + '.'
          : s1.desacuerdo ? ', pero dice otra ubicación (' + _ubicForm_(s1.c) + ').'
          : s1.multiFigura ? ', pero nombra a varias figuras.'
          : !s1.nombraFigura ? ', pero no nombra a ' + fig + '.'
          : ': si es ésta, elegila.');
  } else if (fuera && ops[0]) {
    // 08/10: el del motivo no se ofrece; la opción 1 es la mejor de las que quedan.
    const s1 = ops[0], d1 = _duenio_(ctx, s1.c, f);
    t += ' Entre las opciones, la 1 (confianza ' + _confianza_(s1.score) + ')' +
         (d1 ? ' ya la tiene la fila ' + _descFila_(d1) + '.'
          : s1.desacuerdo ? ' dice otra ubicación (' + _ubicForm_(s1.c) + ').'
          : s1.multiFigura ? ' nombra a varias figuras.'
          : !s1.nombraFigura ? ' no nombra a ' + fig + '.'
          : ': si es ésta, elegila.');
  }
  return t;
}

/**
 * El formulario del que habla el motivo cuando NO está entre las opciones (08/10, FICHAS_0810_ACTIVAS), o null:
 *   - los motivos de un formulario en particular (reubicación, multi_figura, clave repetida, el único descalificado): el
 *     del plan (`pf.cand`), si quedó afuera;
 *   - formulario_compartido / formulario_gemelo: el que perdió la fila —el de más puntaje entre los que no se ofrecen,
 *     ya usado por otra fila—, si tiene más puntaje que la opción 1;
 *   - score_bajo: el del plan, si quedó afuera y tiene más puntaje que la opción 1.
 * Cada uno, `{ sc, motivo }` de `excluidas`.
 */
function _formularioFueraDelMotivo_(m, pf, ops, excluidas, ctx, f) {
  if (!excluidas.length) return null;
  const tope = ops[0] ? ops[0].score : -1;
  const delPlan = pf.cand && !ops.some(function (x) { return x.c === pf.cand; })
    ? excluidas.find(function (e) { return e.sc.c === pf.cand; }) || null : null;
  if (['ubicacion_en_desacuerdo', 'multi_figura', 'clave_repetida', 'desacuerdo_y_resto_bajo'].indexOf(m) >= 0) return delPlan;
  if (m === 'formulario_compartido' || m === 'formulario_gemelo') {
    return excluidas.find(function (e) { return e.sc.score > tope && _duenio_(ctx, e.sc.c, f); }) || null;
  }
  if (m === 'score_bajo') return delPlan && delPlan.sc.score > tope ? delPlan : null;
  return null;
}

/**
 * "¿Por qué?" de una ficha sin ninguna opción (08/10, FICHAS_0810_ACTIVAS): no hay formulario cercano. Si el sistema
 * tenía alguno que no se ofrece (el del plan, si no el de más puntaje), cuál y por qué; y qué elegir.
 */
function _fraseSinOpciones_(f, pf, excluidas) {
  let t = 'No hay formulario cercano: ninguno a ' + DIAS_OPCIONES_FICHA + ' días o menos de la reunión que pueda ser el suyo.';
  const x = excluidas.find(function (e) { return e.sc.c === pf.cand; }) || excluidas[0] || null;
  if (x) t += ' El más parecido, «' + x.sc.c.nombre + '», ' + x.motivo + '.';
  return t + ' Si no va a tener formulario, elegí «Ninguno»; si no sabés, «No sé».';
}

/** Las otras filas pendientes cuyo mejor formulario es el mismo (empate en formulario_compartido). */
function _otrasConMismoFormulario_(ctx, f, c) {
  return Object.keys(ctx.plan.porFila).map(Number).filter(function (n) {
    const pf = ctx.plan.porFila[n];
    return n !== f.fila && pf.cand && pf.cand.grupo === c.grupo &&
           (pf.veredicto === 'REVISAR_MATCH' || pf.veredicto === 'SIN_MATCH');
  }).map(function (n) { return ctx.porNum[n]; });
}

/** Qué le costó score a un par, en palabras: "no nombra a X y la fecha está a 9 días". */
function _queFalla_(f, sc, ctx) {
  const p = [];
  if (!sc.nombraFigura) p.push(sc.sinFigura ? 'no nombra a nadie' : 'no nombra a ' + (f.figura || 'la figura') +
                                (sc.c.figurasNorm.length ? ' (es de ' + _figurasDe_(sc.c) + ')' : ''));
  if (sc.evaluables.fecha && sc.perdido.fecha > 0) p.push('la fecha está a ' + sc.dist + ' días');
  if (sc.desacuerdo) p.push('la ubicación no coincide (' + _ubicForm_(sc.c) + ', la reunión es ' + _ubicFila_(f, ctx.plan.comunas) + ')');
  else if (sc.evaluables.ubic && sc.perdido.ubic > 0) p.push('la ubicación no coincide');
  if (sc.evaluables.hora && sc.perdido.hora > 0) p.push('la hora no coincide');
  return p.length ? p.join(' y ') : 'le falta evidencia';
}

/** "la fecha coincide (el nombre dice 17/06)", para las frases. */
function _fraseFecha_(f, sc) {
  if (!sc.evaluables.fecha) return 'no se puede comparar la fecha';
  return (sc.perdido.fecha === 0 ? 'la fecha coincide' : 'la fecha está a ' + sc.dist + ' días') +
         ' (' + _detalleFecha_(f, sc.c) + ')';
}

/**
 * La línea "coincide / no coincide" de una opción: ✅ coincide · ❌ no coincide · ⚪ no se puede comparar
 * · ⚠️ ojo. Traducida de `puntuar_` (las mismas señales que el puntaje, nada nuevo).
 */
function _lineaCoincide_(f, sc, ctx) {
  const c = sc.c, p = [];
  // figura
  if (sc.multiFigura && sc.nombraFigura) p.push('⚠️ nombra a ' + c.figurasNorm.length + ' figuras (' + _figurasDe_(c) + ')');
  else if (sc.conjunta) p.push('✅ figuras: las de la conjunta (' + _figurasDe_(c) + ')');
  else if (sc.nombraFigura) {
    p.push('✅ figura' + (/figura_por_apellido/.test(sc.nivel) ? ' (por el apellido)'
                       : /figura_por_variante/.test(sc.nivel) ? ' (escrita distinto)' : ''));
  } else if (sc.sinFigura) p.push('⚪ no nombra a nadie' + (sc.porSinFigura ? ' (vale por la ubicación y la fecha)' : ''));
  else p.push('❌ figura (es de ' + _figurasDe_(c) + ')');
  // fecha
  if (!sc.evaluables.fecha) p.push('⚪ fecha (no se puede comparar)');
  else p.push((sc.perdido.fecha === 0 ? '✅ fecha (' : '❌ fecha (a ' + sc.dist + ' días: ') + _detalleFecha_(f, c) + ')');
  // ubicación (con UBICACION_TRES_NIVELES, el nivel en que se comparó: barrio, comuna, o el eje del mail)
  const tipo = sc.ubic && sc.ubic.nivel
    ? (sc.ubic.nivel === 'eje' ? 'eje (mail)' : sc.ubic.nivel === 'comuna' && sc.ubic.fila.deComuna === 'mail' ? 'comuna (mail)' : sc.ubic.nivel)
    : (c.barrio && f.barrio) ? 'barrio' : 'comuna';
  const ej = _ejeFicha_(f, c);
  if (sc.desacuerdo) p.push('❌ ' + tipo + ' (' + _ubicForm_(c) + ', la reunión es ' + _ubicFila_(f, ctx.plan.comunas) + ')');
  else if (sc.evaluables.ubic) p.push((sc.perdido.ubic === 0 ? '✅ ' : '❌ ') + tipo + ' (' + _ubicForm_(c) + ')');
  else if (!ej) {   // con el eje a la vista, "⚪ ubicación (el formulario dice Eje …)" sería lo mismo dos veces
    const uf = _ubicForm_(c);
    p.push('⚪ ubicación (' + (uf !== '—' ? 'el formulario dice ' + uf + (f.barrio ? '' : ', la reunión no tiene barrio')
                                           : 'el formulario no dice dónde') + ')');
  }
  if (sc.evaluables.hora) p.push(sc.perdido.hora === 0 ? '✅ hora' : '❌ hora');
  // eje: sólo para la persona (EJE_COMO_UBICACION sigue apagado: no puntúa ni decide)
  if (ej) p.push(ej.coincide ? '✅ Eje ' + ej.form : '⚠️ Eje ' + ej.form + (ej.mail ? ', el mail dice Eje ' : ', la reunión está en el Eje ') + ej.fila);
  // ojo
  const d = _duenio_(ctx, c, f);
  if (d) p.push('⚠️ ya usado por la fila ' + _descFila_(d));
  if (c.claveRepetida) p.push('⚠️ hay otro formulario con el mismo nombre y cierre');
  else if ((c.gemelos || 1) > 1) p.push('⚠️ tiene ' + (c.gemelos - 1) + ' gemelo(s) con el mismo nombre');
  if ((c.inscriptos || 0) <= MAX_INSCRIPTOS_CASI_CERO) p.push('⚠️ casi sin inscriptos (' + (c.inscriptos || 0) + ')');
  return p.join(' · ');
}

/** "el nombre dice 17/06; cierra 2 días antes" (o "sin fecha en el nombre; cierra …"). */
function _detalleFecha_(f, c) {
  const det = c.det || {};
  const p = [det.texto ? 'el nombre dice ' + _ddmm_(det.texto) : 'sin fecha en el nombre'];
  if (det.fechaFin && f.fecha) {
    const d = diasEntre_(det.fechaFin, f.fecha);
    p.push(d === 0 ? 'cierra el mismo día' : 'cierra ' + Math.abs(d) + (Math.abs(d) === 1 ? ' día ' : ' días ') +
           (d < 0 ? 'antes' : 'después'));
  }
  return p.join('; ');
}

// ===================== Celdas =====================

/** La fecha de la columna oculta id_fecha: yyyy-MM-dd, que Sheets lee igual en cualquier configuración regional. */
function _fechaId_(d) { return d ? Utilities.formatDate(d, RDV_TZ, 'yyyy-MM-dd') : ''; }
function _fechaLarga_(d) { return d ? DIAS_SEMANA_[d.getDay()] + ' ' + fmtFecha_(d) : ''; }
function _ddmm_(d) { return d ? Utilities.formatDate(d, RDV_TZ, 'dd/MM') : ''; }
function _signo_(n) { return n === null || n === undefined ? '' : (n > 0 ? '+' + n : String(n)); }
function _num_(x) { return x === null || x === undefined || x === '' ? '?' : String(Math.round(Number(x) * 100) / 100).replace('.', ','); }
function _gris_(n) { const a = []; for (let i = 0; i < n; i++) a.push(FICHA_COLOR_.textoGris); return a; }

/**
 * "Flores (C7)", "Retiro (C1 Norte)", "(sin barrio)". Con UBICACION_TRES_NIVELES, además lo del mail que cuenta: la
 * comuna de una fila sin barrio ("(sin barrio; mail: Comuna 6)") y el eje ("Flores (C7) · mail: Eje Oeste").
 */
function _ubicFila_(f, comunas) {
  const u = usarUbicacion3_() ? ubicacionDeFila_(f) : null;
  if (!f.barrio) {
    if (u && (u.comuna != null || u.eje)) return '(sin barrio; mail: ' + f.lugarMail + ')';
    return '(sin barrio)';
  }
  const com = comunas.get(normalizeText_(f.barrio));
  const sz = com === 1 ? subzonaDeBarrio_(f.barrio) : '';
  return f.barrio + (com == null ? '' : ' (C' + com + (sz ? ' ' + sz : '') + ')') + (u && u.eje ? ' · mail: Eje ' + u.eje : '');
}

/** La celda "barrio / comuna" de la ficha: vacía si la fila no tiene barrio (y, con UBICACION_TRES_NIVELES, nada del mail). */
function _ubicFilaCelda_(f, comunas) {
  if (f.barrio) return _ubicFila_(f, comunas);
  return usarUbicacion3_() && tieneUbicacion_(ubicacionDeFila_(f)) ? _ubicFila_(f, comunas) : '';
}

/** Lo que el formulario dice de su ubicación: barrio, "C6", "C1 Sur", "Eje Oeste", o "—". */
function _ubicForm_(c) {
  if (c.barrio) return c.barrio;
  if (c.comuna != null) return 'C' + c.comuna + (c.subzona ? ' ' + c.subzona : '');
  if (c.eje && c.eje.tipo === 'eje') return 'Eje ' + c.eje.eje;
  return '—';
}

/** Las figuras que nombra el formulario, con la grafía del destino; "(ninguna)". */
function _figurasDe_(c) {
  if (!c.figurasNorm.length) return '(ninguna)';
  const canon = {};
  _listas_().figuras.forEach(function (x) { canon[x.norm] = x.canon; });
  return c.figurasNorm.map(function (n) { return canon[n] || n; }).join(' + ');
}

/** "cierra mié 03/06/2026". */
function _cierre_(c) {
  return c.det && c.det.fechaFin ? 'cierra ' + _fechaLarga_(c.det.fechaFin) : '(sin cierre)';
}

/** Días entre la fecha del formulario (la del nombre, o el cierre) y la reunión, con signo. */
function _diasTxt_(f, c) {
  const d = _diasNum_(f, c);
  return d === null ? '' : _signo_(d);
}
function _diasNum_(f, c) {
  return c.det && c.det.mejor && f.fecha ? diasEntre_(c.det.mejor, f.fecha) : null;
}

/** "645 · 16/06 · Almagro". */
function _descFila_(f) {
  return f.fila + ' (' + _ddmm_(f.fecha) + (f.barrio ? ', ' + f.barrio : '') + ')';
}

function _colorFecha_(sc) {
  if (!sc.evaluables.fecha) return FICHA_COLOR_.gris;
  return sc.perdido.fecha === 0 ? FICHA_COLOR_.si : FICHA_COLOR_.no;
}
function _colorUbic_(sc, f) {
  if (sc.desacuerdo) return FICHA_COLOR_.no;
  if (sc.evaluables.ubic) return sc.perdido.ubic === 0 ? FICHA_COLOR_.si : FICHA_COLOR_.no;
  // Sin barrio ni comuna que comparar: el eje, sólo para la persona (verde si coincide, amarillo si no).
  const ej = f ? _ejeFicha_(f, sc.c) : null;
  if (ej) return ej.coincide ? FICHA_COLOR_.si : FICHA_COLOR_.amarillo;
  return FICHA_COLOR_.gris;
}

/**
 * El eje, **sólo para mostrar** (03/10): si el formulario dice un eje y el barrio de la reunión tiene eje
 * (`Comunas`, columna I; uno pendiente con "?" no cuenta), `{ form, fila, coincide }`; si no, null. No
 * cambia el puntaje ni la decisión: EJE_COMO_UBICACION sigue apagado.
 */
function _ejeFicha_(f, c) {
  if (usarUbicacion3_() && c.eje && c.eje.tipo === 'eje') {
    // tres niveles: si la fila tiene el eje del MAIL, contra ése (y si la ubicación ya se comparó por el eje, está en la
    // línea de la ubicación: no se repite). Sin eje del mail, la pista del 03/10 de abajo (el de Comunas, sólo a la vista).
    const uF = ubicacionDeFila_(f);
    if (uF.eje) {
      if (compararUbicacion_(ubicacionDeFormulario_(c), uF).nivel === 'eje') return null;
      return { form: c.eje.eje, fila: uF.eje, coincide: c.eje.eje === uF.eje, mail: true };
    }
  }
  if (!c.eje || c.eje.tipo !== 'eje' || !f.barrio) return null;
  const ejeFila = ejeDeBarrio_(f.barrio);
  if (!ejeFila) return null;
  return { form: c.eje.eje, fila: ejeFila, coincide: barrioEnEje_(f.barrio, c.eje.eje) };
}

/** El puntaje en palabras: alta (≥ UMBRAL_MATCH), media (≥ CONFIANZA_MEDIA), baja. */
function _confianza_(score) {
  if (score === null || score === undefined || score === '') return '';
  return score >= UMBRAL_MATCH ? 'alta' : (score >= CONFIANZA_MEDIA ? 'media' : 'baja');
}

/** Los valores del desplegable de "elegido". */
function _opcionesDesplegable_(nOps) {
  const l = [];
  for (let k = 1; k <= nOps; k++) l.push('Opción ' + k);
  return l.concat(['Ninguno', 'No sé']);
}

// ===================== Formato aprobado el 06/10 (REVISAR_FORMATO_NUEVO) =====================
/*
 * El dibujo es de 27_RevisarFormato.js (`renderRevisarMatch`, el diseño aprobado: columnas A..M fijas). Acá
 * se arman sus datos —con las MISMAS piezas que el formato de arriba: qué fichas, en qué orden, las opciones
 * por puntaje, "¿por qué?", la línea "coincide", los colores, el contexto, RESUELTAS— y se escriben las
 * columnas auxiliares ocultas, desde la N. Ficha técnica: docs/revisar-match-ficha-tecnica.md.
 */

/**
 * Las auxiliares, ocultas, desde la N. Sólo en las líneas que las necesitan: REUNIÓN (la identidad de la
 * reunión: figura + fecha + barrio, como siempre), Opción (la clave del formulario y su nombre entero),
 * resuelta y contexto (sólo el tipo). Las de "¿por qué?" y "coincide" quedan VACÍAS: el texto de E desborda
 * hacia la derecha y cualquier celda con algo lo cortaría (ficha técnica §7).
 */
const AUX_FICHAS_ = ['aux_linea', 'id_figura', 'id_fecha', 'id_barrio', 'aux_opcion', 'form_clave', 'form_nombre',
                     'puntaje'];

/**
 * Los datos de `renderRevisarMatch`: `{ pendientes, resueltas, porMotivo }`, con la forma de
 * `demoRevisarMatch`. Cada ficha y cada opción llevan además `aux` (lo que va a las columnas ocultas), que el
 * dibujo no mira. `opts.filas`, como en `armarFichas_`.
 */
function armarFichasFormato_(plan, asis, opts) {
  opts = opts || {};
  const comunas = plan.comunas;
  const ctx = _contextoFichas_(plan, asis);
  const porMotivo = {};
  const pendientes = _listaFichas_(plan, ctx, opts).map(function (f) {
    const pf = plan.porFila[f.fila] || {};
    const op = opcionesDeFicha_(f, ctx, pf.cand || null), ops = op.ops;
    const motivo = pf.veredicto === 'REVISAR_MATCH' || pf.veredicto === 'SIN_MATCH' ? (pf.motivo || pf.veredicto)
                 : (pf.veredicto || 'sin_veredicto');
    porMotivo[motivo] = (porMotivo[motivo] || 0) + 1;
    const elec = _eleccionDeFicha_(ctx, f);
    const er = _elegidoYResultado_(elec, ops);
    const ins = _insDestino_(plan.dest, f);
    return {
      reunion: { fila: f.fila, figura: f.figura, fecha: _fechaLarga_(f.fecha),
                 barrio: _ubicFilaCelda_(f, comunas), tema: f.evento, inscriptos: ins == null ? null : ins },
      elegido: er.elegido, comentario: elec.comentario, resultado: er.resultado,
      porque: _fraseMotivo_(f, pf, ops, ctx, op.excluidas),
      opciones: ops.map(function (sc) { return _opcionFormato_(f, sc, ctx); }),
      contexto: _contextoFormato_(ctx, f, ops),
      aux: { id_figura: f.figura, id_fecha: _fechaId_(f.fecha), id_barrio: f.barrio },
      f: f, motivo: motivo, veredicto: pf.veredicto || '',
      // las que no se ofrecen (08/10): no las dibuja nadie; las lista el paso 52
      excluidas: op.excluidas.map(function (e) {
        return { clave: e.sc.c.clave, nombre: e.sc.c.nombre, score: e.sc.score, motivo: e.motivo };
      })
    };
  });
  const resueltas = _resueltas_(ctx).map(function (e) { return _resueltaFormato_(ctx, e); });
  return { pendientes: pendientes, resueltas: resueltas, porMotivo: porMotivo };
}

/** Una opción, como la pide el dibujo. Los colores (`match`) son los mismos que los del formato de arriba. */
function _opcionFormato_(f, sc, ctx) {
  const c = sc.c, duenio = _duenio_(ctx, c, f), ubic = _ubicForm_(c);
  return {
    figura: c.figurasNorm.length ? _figurasDe_(c) : '',
    cierra: c.det && c.det.fechaFin ? _ddmm_(c.det.fechaFin) : '—',
    barrio: ubic === '—' ? '' : ubic,
    formulario: _nombreCorto_(c.nombre),
    inscriptos: esVacio_(c.inscriptos) ? null : c.inscriptos,
    dias: _diasNum_(f, c),
    confianza: _confianza_(sc.score),
    yaUsadoPor: duenio ? 'fila ' + _descFila_(duenio) : '',
    match: { figura: _matchFigura_(sc), fecha: _matchDeColor_(_colorFecha_(sc)), barrio: _matchDeColor_(_colorUbic_(sc, f)) },
    coincide: _lineaCoincide_(f, sc, ctx),
    aux: { form_clave: c.clave, form_nombre: c.nombre, puntaje: sc.score }
  };
}

/** Figura: verde si nombra sólo a la de la reunión, amarillo si a varias entre ellas ésa, gris si a nadie, rojo si a otra. */
function _matchFigura_(sc) {
  if (sc.nombraFigura) return sc.multiFigura ? 'av' : 'ok';
  return sc.sinFigura ? 'na' : 'no';
}

/** El color del formato de arriba (FICHA_COLOR_) en la clave del dibujo: ok / no / av / na. */
function _matchDeColor_(color) {
  return color === FICHA_COLOR_.si ? 'ok' : color === FICHA_COLOR_.no ? 'no' : color === FICHA_COLOR_.amarillo ? 'av' : 'na';
}

/**
 * El contexto: las otras reuniones de la figura a ±DIAS_CONTEXTO_FICHA ("tiene la opción N" si ya se quedó
 * con una de las opciones de esta ficha; si no, su estado en pocas palabras) y los formularios de la figura
 * descartados por la regla 3.
 */
function _contextoFormato_(ctx, f, ops) {
  const comunas = ctx.plan.comunas;
  const otras = _otrasReuniones_(ctx, f).map(function (o) {
    const pf = ctx.plan.porFila[o.f.fila] || {};
    const tiene = (pf.veredicto === 'escribiria' || pf.veredicto === 'rdv_uid') && pf.cand;
    const k = tiene ? ops.findIndex(function (sc) { return sc.c.grupo === pf.cand.grupo; }) : -1;
    return { fila: o.f.fila, figura: o.f.figura, fecha: _fechaLarga_(o.f.fecha),
             barrio: _ubicFilaCelda_(o.f, comunas), tema: o.f.evento, dias: o.d,
             nota: k >= 0 ? 'tiene la opción ' + (k + 1) : _estadoCorto_(pf) };
  });
  const descartados = _descartadosCercanos_(ctx, f).map(function (x) {
    const c = x.c, ubic = _ubicForm_(c);
    return { fila: '', figura: c.figurasNorm.length ? _figurasDe_(c) : '(sin figura)',
             fecha: 'cierra ' + _ddmm_(c.det && c.det.fechaFin), barrio: ubic === '—' ? '' : ubic,
             tema: _nombreCorto_(c.nombre), dias: _diasNum_(f, c), nota: 'descartado (' + (c.inscriptos || 0) + ' inscr.)' };
  });
  return otras.concat(descartados);
}

/** El estado de otra reunión, corto para la columna M (112 px). */
function _estadoCorto_(pf) {
  switch (pf.veredicto) {
    case 'escribiria': case 'rdv_uid': return 'con formulario';
    case 'REVISAR_MATCH': case 'SIN_MATCH': return 'también pendiente';
    case 'futura': return 'futura';
    case 'cerrada': return 'cerrada, sin form.';
    case 'pendiente_barrio': return 'esperando barrio';
    case 'esperando_formulario': return 'esperando form.';
    case 'ninguno_por_persona': return '"ninguno"';
    default: return pf.veredicto || '';
  }
}

/** Una resuelta (de `_resueltas_`), como la pide el dibujo: lo elegido y su resultado, en tono apagado. */
function _resueltaFormato_(ctx, e) {
  const f = e.f || null, comunas = ctx.plan.comunas;
  const c = e.formClave ? ctx.plan.cands.vivos.filter(function (x) { return x.clave === e.formClave; })[0] || null : null;
  const sc = c && f ? puntuar_(f, c, comunas) : null;
  return {
    elegido: e.elegido === 'ninguno' ? 'Ninguno' : (e.elegidoCrudo || 'sí'),
    comentario: e.comentario || '',
    resultado: _resultadoCorto_(e),
    fila: f ? f.fila : '', figura: e.figura, fecha: _fechaLarga_(e.fecha),
    barrio: f ? _ubicFilaCelda_(f, comunas) : (e.barrio || ''),
    formulario: e.elegido === 'ninguno' ? '(ninguno)' : _nombreCorto_(e.formNombre),
    inscriptos: c && !esVacio_(c.inscriptos) ? c.inscriptos : null,
    dias: c && f ? _diasNum_(f, c) : null,
    confianza: sc ? _confianza_(sc.score) : '',
    aux: { id_figura: e.figura, id_fecha: _fechaId_(e.fecha), id_barrio: e.barrio, form_clave: e.formClave || '',
           form_nombre: e.formNombre || '' }
  };
}

/** El resultado de una resuelta, corto para la columna C (90 px): "aplicado 05/10", "por aplicar", "ninguno". */
function _resultadoCorto_(e) {
  if (e.estado === 'aplicado') {
    const m = /(\d{2}\/\d{2})\/\d{4}/.exec(String(e.resultado || ''));
    return 'aplicado' + (e.fechaResultado instanceof Date ? ' ' + _ddmm_(e.fechaResultado) : m ? ' ' + m[1] : '');
  }
  if (e.resultadoPlan === 'valida') return 'por aplicar';
  if (e.estado === 'ninguno') return 'ninguno';
  return e.resultado || e.estado || '';
}

/**
 * El nombre del formulario para "formulario / tema": sin los prefijos genéricos (PREFIJOS_EVENTO, como
 * "VÍNCULO CIUDADANO - ") ni un "Encuentro con <algo> - " suelto, y con «…» al inicio si se recortó
 * (ficha técnica §7). El nombre entero queda en la auxiliar form_nombre y en "¿por qué?".
 */
function _nombreCorto_(nombre) {
  const n = str(nombre);
  let t = limpiarPrefijos_(n);
  const m = /^\s*encuentro con \S+\s*[-–:]\s*/i.exec(t);
  if (m && t.substring(m[0].length).trim()) t = t.substring(m[0].length).trim();
  return t && t !== n ? '…' + t : n;
}

/**
 * **Escribe REVISAR_MATCH con el formato aprobado.** En este orden:
 *   1. lee ELEGIR y COMENTARIO de lo que hay hoy en la solapa (cualquiera de los dos formatos) y los conserva
 *      en las fichas que siguen pendientes: lo que una persona escribió mientras corría el upsert no se pierde.
 *      "Opción k" se traduce por la clave del formulario (la auxiliar), nunca por la posición: si las
 *      opciones cambiaron de orden, la elección sigue al formulario; si ya no está entre las opciones, queda
 *      lo que diga ELECCIONES_MATCH;
 *   2. borra las auxiliares de antes (renderRevisarMatch limpia sólo A..M);
 *   3. dibuja (renderRevisarMatch) y, con el mapa fila → {tipo, ficha, opcion} que devuelve, escribe las
 *      auxiliares y las oculta;
 *   4. con `opts.proteger`, protege la solapa salvo ELEGIR y COMENTARIO de cada línea REUNIÓN.
 * Devuelve `{ sh, mapa, conservadas, pendientes, resueltas, proteccion }`.
 */
function escribirFichasFormato_(nombre, fv, opts) {
  opts = opts || {};
  const ss = opts.ss || ssIntermedia_();
  const sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  // 1) ELEGIR y COMENTARIO de hoy, antes de redibujar.
  const conservadas = _conservarAB_(fv.pendientes, _abDeLaSolapa_(sh));
  // 2) Las auxiliares de antes, fuera; todas las columnas visibles (el formato de arriba ocultaba otras).
  const nAux = AUX_FICHAS_.length, primeraAux = RM.NCOLS + 1;
  if (sh.getMaxColumns() < RM.NCOLS + nAux) sh.insertColumnsAfter(sh.getMaxColumns(), RM.NCOLS + nAux - sh.getMaxColumns());
  sh.showColumns(1, sh.getMaxColumns());
  const viejas = sh.getRange(1, primeraAux, sh.getMaxRows(), sh.getMaxColumns() - RM.NCOLS);
  viejas.clear();
  viejas.clearDataValidations();
  // 3) El dibujo, y las auxiliares por el mapa que devuelve.
  const mapa = renderRevisarMatch(fv.pendientes, fv.resueltas, sh);
  const filas = Object.keys(mapa).map(Number).sort(function (a, b) { return a - b; });
  const n = filas.length ? filas[filas.length - 1] : 1;
  const aux = [];
  for (let i = 0; i < n; i++) aux.push(AUX_FICHAS_.map(function () { return ''; }));
  aux[0] = AUX_FICHAS_.slice();
  const reuniones = [];
  filas.forEach(function (r) {
    const m = mapa[r], fila = aux[r - 1];
    const pon = function (o) {
      Object.keys(o || {}).forEach(function (k) { const j = AUX_FICHAS_.indexOf(k); if (j >= 0) fila[j] = o[k]; });
    };
    if (m.tipo === 'porque' || m.tipo === 'coincide') return;   // vacías: el texto de E desborda sobre ellas
    fila[AUX_FICHAS_.indexOf('aux_linea')] = m.tipo;
    if (m.tipo === 'reunion') { pon(fv.pendientes[m.ficha].aux); reuniones.push(r); }
    else if (m.tipo === 'opcion') {
      fila[AUX_FICHAS_.indexOf('aux_opcion')] = m.opcion;
      pon(fv.pendientes[m.ficha].opciones[m.opcion - 1].aux);
    } else if (m.tipo === 'resuelta') pon(fv.resueltas[m.ficha].aux);
  });
  sh.getRange(1, primeraAux, n, nAux).setValues(aux);
  sh.hideColumns(primeraAux, nAux);
  // 4) La protección: toda la solapa salvo ELEGIR y COMENTARIO de cada línea REUNIÓN.
  const proteccion = opts.proteger ? _protegerFichas_(sh, reuniones) : null;
  SpreadsheetApp.flush();
  return { sh: sh, mapa: mapa, conservadas: conservadas, pendientes: fv.pendientes.length,
           resueltas: fv.resueltas.length, proteccion: proteccion };
}

/** ELEGIR y COMENTARIO de cada ficha de la solapa de hoy (cualquiera de los dos formatos), por fila (figura | fecha | barrio). */
function _abDeLaSolapa_(sh) {
  if (sh.getLastRow() < 2) return {};
  const vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  if (!esHojaDeFichas_(vals[0])) return {};
  const out = {};
  leerFichas_(vals, null, sh.getName()).forEach(function (e) { out[_filaEleccion_(e)] = e; });
  return out;
}

/**
 * Pone en las fichas pendientes lo que la solapa de hoy tiene en ELEGIR y COMENTARIO (sólo lo que no está
 * vacío: una celda vacía no borra lo que diga ELECCIONES_MATCH, que puede venir de EMPAREJAR_MANUAL).
 * Devuelve cuántas fichas cambiaron.
 */
function _conservarAB_(pendientes, previas) {
  let n = 0;
  pendientes.forEach(function (p) {
    const e = previas[_filaEleccion_({ figura: p.aux.id_figura, fecha: p.f.fecha, barrio: p.aux.id_barrio })];
    if (!e) return;
    let el = null;
    if (e.elegido === 'ninguno') el = 'Ninguno';
    else if (e.elegido === 'no_se') el = 'No sé';
    else if (e.elegido === 'formulario') {
      const k = p.opciones.findIndex(function (o) { return o.aux.form_clave === e.formClave; });
      if (k >= 0) el = 'Opción ' + (k + 1);
    }
    let cambio = false;
    if (el && el !== p.elegido) { p.elegido = el; cambio = true; }
    if (e.comentario && e.comentario !== p.comentario) { p.comentario = e.comentario; cambio = true; }
    if (cambio) n++;
  });
  return n;
}

// ===================== HISTORICO_SIN_RESOLVER (paso 22) =====================

/**
 * Lo viejo que no se resolvió solo en la corrida de completar el historial (paso 22): las filas en
 * REVISAR_MATCH o SIN_MATCH de más de DIAS_ACTIVOS días. **Sólo informativa**: no son fichas, no tiene
 * "elegido", nadie la lee. Una línea por fila: fila, figura, fecha, barrio, motivo y la mejor opción (la
 * de más puntaje, como la opción 1 de una ficha), con su confianza. De la más reciente a la más vieja.
 */
function escribirHistoricoSinResolver_(plan) {
  const enc = ['fila', 'figura', 'fecha', 'barrio', 'veredicto', 'motivo', 'mejor_opcion', 'confianza', 'puntaje',
               'form_clave', 'en_ventana'];
  const porMotivo = {};
  const filas = plan.dest.filas.filter(function (f) {
    const pf = plan.porFila[f.fila];
    return pf && (pf.veredicto === 'REVISAR_MATCH' || pf.veredicto === 'SIN_MATCH') && !esFilaActiva_(f.fecha);
  }).sort(function (a, b) {
    return ((b.fecha ? b.fecha.getTime() : 0) - (a.fecha ? a.fecha.getTime() : 0)) || (a.fila - b.fila);
  }).map(function (f) {
    const pf = plan.porFila[f.fila];
    const m = pf.motivo || pf.veredicto;
    porMotivo[m] = (porMotivo[m] || 0) + 1;
    const op = listaOpcionesFila_(f, plan.cands.vivos, plan.comunas, null, 1)[0] || null;
    return [f.fila, f.figura, fmtFecha_(f.fecha), f.barrio, pf.veredicto, m, op ? op.c.nombre : '',
            op ? _confianza_(op.score) : '', op ? op.score : '', op ? op.c.clave : '', _sn_(enVentanaAnalisis_(f.fecha))];
  });
  escribirHoja_(RDV_HOJA_HISTORICO, [enc].concat(filas));
  Logger.log('[upsert] %s: %s filas de más de %s días sin resolver (sólo informativa: no son fichas) — %s',
             RDV_HOJA_HISTORICO, filas.length, DIAS_ACTIVOS, Object.keys(porMotivo).map(function (k) {
               return k + ' ' + porMotivo[k]; }).join(' | ') || 'ninguna');
  return filas.length;
}

// ===================== Escritura (intermedia) =====================

/**
 * Escribe las fichas en `nombre` (una solapa de la INTERMEDIA, nunca el destino): valores, colores,
 * negritas, el desplegable de "elegido" y las columnas de identidad ocultas. La solapa se regenera
 * entera: contenido, formato y validaciones (es un reporte; las elecciones ya se leyeron y se guardaron
 * en ELECCIONES_MATCH antes de escribir).
 */
function escribirFichas_(nombre, fx, opts) {
  opts = opts || {};
  const m = fx.matriz, n = m.length, w = COLS_FICHA_.length;
  const ss = opts.ss || ssIntermedia_();
  let sh = ss.getSheetByName(nombre);
  if (!sh) sh = ss.insertSheet(nombre);
  else {
    sh.clearContents();
    sh.clearFormats();
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
    sh.showColumns(1, sh.getMaxColumns());
  }
  if (sh.getMaxRows() < n) sh.insertRowsAfter(sh.getMaxRows(), n - sh.getMaxRows());
  if (sh.getMaxColumns() < w) sh.insertColumnsAfter(sh.getMaxColumns(), w - sh.getMaxColumns());
  const rango = sh.getRange(1, 1, n, w);
  rango.setValues(m);
  rango.setBackgrounds(fx.formato.map(function (x) { return x.bg.map(function (c) { return c || '#ffffff'; }); }));
  rango.setFontColors(fx.formato.map(function (x) { return x.fc.map(function (c) { return c || FICHA_COLOR_.textoNormal; }); }));
  rango.setFontWeights(fx.formato.map(function (x) { return m[0].map(function () { return x.negrita ? 'bold' : 'normal'; }); }));
  const iEl = COLS_FICHA_.indexOf('ELEGIR');
  sh.getRange(1, iEl + 1, n, 1).setDataValidations(fx.formato.map(function (x) {
    return [x.desplegable ? SpreadsheetApp.newDataValidation().requireValueInList(x.desplegable, true)
                                .setAllowInvalid(false).build() : null];
  }));
  _formatoFichas_(sh, fx);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);                                       // ELEGIR y COMENTARIO, siempre a la vista
  sh.hideColumns(w - FICHA_COLS_OCULTAS_ + 1, FICHA_COLS_OCULTAS_);
  if (opts.proteger) fx.proteccion = _protegerFichas_(sh, _filasDeTipo_(fx, 'reunion'));
  SpreadsheetApp.flush();
  return sh;
}

/** El tipo de cada línea de la solapa: encabezado, titulo, reunion, porque, opcion, coincide, contexto, resuelta, blanco. */
function _tipoLineaFicha_(r, i) {
  if (i === 0) return 'encabezado';
  const t = str(r[COLS_FICHA_.indexOf('ficha')]);
  if (t === FICHA_ETIQUETA_.reunion) return 'reunion';
  if (t === FICHA_ETIQUETA_.porQue) return 'porque';
  if (/^Opción \d+$/.test(t)) return 'opcion';
  if (t === FICHA_ETIQUETA_.contexto || t === FICHA_ETIQUETA_.descartado) return 'contexto';
  if (t === FICHA_ETIQUETA_.resuelta) return 'resuelta';
  if (t.indexOf(FICHA_ETIQUETA_.pendientes) === 0 || t.indexOf(FICHA_ETIQUETA_.resueltas) === 0) return 'titulo';
  return r.some(function (x) { return x !== '' && x !== null; }) ? 'coincide' : 'blanco';
}

/** Las filas (1-based) de un tipo. */
function _filasDeTipo_(fx, tipo) {
  const out = [];
  fx.matriz.forEach(function (r, i) { if (_tipoLineaFicha_(r, i) === tipo) out.push(i + 1); });
  return out;
}

/**
 * El formato de la solapa, en cada regeneración (06/10): ELEGIR y COMENTARIO de cada línea REUNIÓN en
 * amarillo claro con borde marcado; una línea gruesa arriba de cada ficha; "¿por qué?" en itálica; RESUELTAS
 * en gris; anchos ajustados al texto (de las líneas de datos, no de las frases), con un máximo y ajuste de
 * texto en el nombre del formulario.
 */
function _formatoFichas_(sh, fx) {
  const m = fx.matriz, n = m.length, w = COLS_FICHA_.length, visibles = w - FICHA_COLS_OCULTAS_;
  const tipos = m.map(_tipoLineaFicha_);
  const reuniones = [];
  tipos.forEach(function (t, i) { if (t === 'reunion') reuniones.push(i + 1); });
  const ultima = _letraFicha_(visibles);
  // Una línea gruesa arriba de cada ficha, y ELEGIR / COMENTARIO marcados.
  for (let i = 0; i < reuniones.length; i += 300) {
    const tramo = reuniones.slice(i, i + 300);
    sh.getRangeList(tramo.map(function (f) { return 'A' + f + ':' + ultima + f; }))
      .setBorder(true, null, null, null, null, null, FICHA_COLOR_.separador, SpreadsheetApp.BorderStyle.SOLID_THICK);
    const el = sh.getRangeList(tramo.map(function (f) { return 'A' + f + ':B' + f; }));
    el.setBackground(FICHA_COLOR_.elegir);
    el.setBorder(true, true, true, true, true, null, FICHA_COLOR_.bordeElegir, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  }
  // "¿por qué?" en itálica; el resto, normal.
  sh.getRange(1, 1, n, w).setFontStyles(tipos.map(function (t) {
    return m[0].map(function () { return t === 'porque' ? 'italic' : 'normal'; });
  }));
  // Los anchos: por el texto de las líneas de datos (encabezado, reunión, opciones, contexto, resueltas).
  const cuentan = { encabezado: 1, reunion: 1, opcion: 1, contexto: 1, resuelta: 1 };
  for (let j = 0; j < visibles; j++) {
    let largo = 0;
    for (let i = 0; i < n; i++) {
      if (!cuentan[tipos[i]]) continue;
      const v = m[i][j];
      const t = v instanceof Date ? 'dd/mm/aaaa' : String(v === null || v === undefined ? '' : v);
      largo = Math.max(largo, t.length);
    }
    sh.setColumnWidth(j + 1, Math.min(FICHAS_ANCHO_MAX, Math.max(j < 2 ? 120 : 50, largo * 7 + 20)));
  }
  // Los nombres largos de formularios: ajuste de texto en esa columna (sólo en las líneas de datos).
  const iNom = COLS_FICHA_.indexOf('evento / formulario');
  sh.getRange(1, iNom + 1, n, 1).setWraps(tipos.map(function (t) { return [!!cuentan[t]]; }));
}

function _letraFicha_(n) {
  let t = '';
  while (n > 0) { const k = (n - 1) % 26; t = String.fromCharCode(65 + k) + t; n = Math.floor((n - 1) / 26); }
  return t;
}

/**
 * **La protección de la solapa de fichas del destino** (06/10): toda la solapa, salvo ELEGIR y COMENTARIO de
 * cada línea REUNIÓN. Protección REAL: sólo quien corre el script (y el dueño del archivo, que Google no deja
 * sacar) puede escribir en el resto; el script sigue escribiendo. Si no se puede poner real (permisos), queda
 * como advertencia y se avisa en el log. Se rehace en cada regeneración (las filas cambian).
 */
function _protegerFichas_(sh, filasReunion) {
  let pr = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).filter(function (x) {
    return x.getDescription() === DESC_PROTECCION_FICHAS;
  })[0];
  if (!pr) pr = sh.protect().setDescription(DESC_PROTECCION_FICHAS);
  pr.setUnprotectedRanges(filasReunion.map(function (f) { return sh.getRange(f, 1, 1, 2); }));
  try {
    // 07/10: una protección que quedó de ADVERTENCIA (una corrida en que no se pudo poner la real) no acepta editores:
    // addEditor falla ("… isWarningOnly") y volvía a quedar de advertencia para siempre. Primero se le saca.
    if (pr.isWarningOnly()) pr.setWarningOnly(false);
    const yo = Session.getEffectiveUser();
    pr.addEditor(yo);
    const otros = pr.getEditors().filter(function (e) { return e.getEmail() !== yo.getEmail(); });
    if (otros.length) pr.removeEditors(otros);
    if (pr.canDomainEdit()) pr.setDomainEdit(false);
    pr.setWarningOnly(false);
    Logger.log('[fichas] "%s" protegida: sólo ELEGIR y COMENTARIO (%s fichas) se pueden editar.', sh.getName(), filasReunion.length);
    return { real: true, editables: filasReunion.length };
  } catch (err) {
    pr.setWarningOnly(true);
    Logger.log('>>> [fichas] la protección REAL de "%s" no se pudo poner (%s): quedó como ADVERTENCIA. Avisar.',
               sh.getName(), err);
    return { real: false, error: String(err), editables: filasReunion.length };
  }
}

/** La REVISAR_MATCH de la intermedia cuando las fichas están en el destino: sólo un aviso, sin desplegables. */
function avisoFichasEnDestino_() {
  const ss = ssIntermedia_();
  const sh = ss.getSheetByName(RDV_HOJA_REVISAR);
  if (!sh) return;
  sh.clearContents();
  sh.clearFormats();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  sh.getRange(1, 1).setValue('Las fichas de revisión están en el archivo del destino, solapa "' + RDV_HOJA_REVISAR +
                             '" (desde el 06/10). Esta solapa ya no se lee: elegir allá.');
}

// ===================== Lectura de "elegido" =====================

/**
 * Las elecciones de una hoja de fichas (lo llama `_leerEleccionesDeHoja_`). Por ficha (una línea
 * REUNIÓN y sus opciones): figura + fecha + barrio de las columnas ocultas; "Opción k" → la form_clave de
 * la línea "Opción k" de esa ficha; "Ninguno"; "No sé" y un comentario sin elección son notas (no se
 * aplican ni bloquean nada). Se corta en RESUELTAS: esa sección no se lee.
 *
 * Los dos formatos, por el encabezado: el de una ficha por bloque (la línea, por la etiqueta de "ficha") y
 * el aprobado el 06/10 (la línea, por la auxiliar oculta aux_linea; "Opción k" → la línea con aux_opcion = k
 * de esa ficha; el nombre entero, de form_nombre). En los dos, ELEGIR sólo cuenta en la línea REUNIÓN.
 */
function leerFichas_(vals, cands, nombreHoja) {
  const hdr = vals[0];
  const i = function (n) { return findIdxOr_(hdr, [n], true); };
  // ELEGIR ("ELEGIR ▾" en el formato del 06/10; antes "elegido") y COMENTARIO, por encabezado.
  const nh = hdr.map(normalizeHeader_);
  let iEl = nh.findIndex(function (h) { return h.indexOf('elegir') === 0; });
  if (iEl < 0) iEl = i('elegido');
  const iT = i('ficha'), iCo = i('comentario'), iFig = i('id_figura'), iFec = i('id_fecha'),
        iBar = i('id_barrio'), iCla = i('form_clave'), iLin = i('aux_linea'), iOp = i('aux_opcion');
  const iNom = i('form_nombre') != null ? i('form_nombre') : i('evento / formulario');
  const out = [];
  let ficha = null;
  const cerrar = function () {
    if (!ficha) return;
    const r = ficha.r;
    const valor = _valorElegido_(r[iEl]);
    const comentario = iCo != null ? str(r[iCo]) : '';
    if (valor === null && !comentario) { ficha = null; return; }
    const e = { hoja: nombreHoja, figura: str(r[iFig]), barrio: str(r[iBar]), fecha: toDate_(r[iFec]),
                elegidoCrudo: str(r[iEl]), elegido: valor === null ? 'nota' : valor, formNombre: '', formClave: '',
                comentario: comentario, desdeFicha: true };
    if (typeof valor === 'number' || valor === 'si') {
      const k = valor === 'si' ? 1 : valor;
      const op = ficha.ops[k];
      if (!op) e.elegido = 'ilegible';
      else {
        e.elegido = 'formulario';
        e.formClave = op.clave; e.formNombre = op.nombre;
        e.elegidoCrudo = 'Opción ' + k;
      }
    }
    out.push(e);
    ficha = null;
  };
  for (let k = 1; k < vals.length; k++) {
    const r = vals[k];
    let tipo = '', nOp = null;
    if (iLin != null) {                       // formato del 06/10: por la auxiliar
      tipo = str(r[iLin]);
      if (tipo === 'opcion') nOp = Number(r[iOp]);
    } else {                                  // una ficha por bloque: por la etiqueta
      const t = str(r[iT]), m = /^Opción (\d+)$/.exec(t);
      if (t.indexOf(FICHA_ETIQUETA_.resueltas) === 0) tipo = 'resuelta';
      else if (t === FICHA_ETIQUETA_.reunion) tipo = 'reunion';
      else if (m) { tipo = 'opcion'; nOp = Number(m[1]); }
    }
    if (tipo === 'resuelta') break;
    if (tipo === 'reunion') { cerrar(); ficha = { r: r, ops: {} }; continue; }
    if (tipo === 'opcion' && ficha) ficha.ops[nOp] = { clave: str(r[iCla]), nombre: iNom != null ? str(r[iNom]) : '' };
  }
  cerrar();
  return out;
}

// ===================== Texto (log del paso 21) =====================

/** Una ficha como texto, para el log: las celdas visibles no vacías de cada línea, separadas por " | ". */
function fichaComoTexto_(fx, ficha) {
  const w = COLS_FICHA_.length - FICHA_COLS_OCULTAS_;
  const out = [];
  for (let k = ficha.desde; k <= ficha.hasta; k++) {
    const r = fx.matriz[k], fmt = fx.formato[k];
    const celdas = [];
    for (let j = 0; j < w; j++) {
      if (r[j] === '' || r[j] === null) continue;
      let v = r[j] instanceof Date ? fmtFecha_(r[j]) : String(r[j]);
      // Los colores, como marcas: [v] verde, [x] rojo, [·] gris.
      const bg = fmt.bg[j];
      if (bg === FICHA_COLOR_.si) v = '[v] ' + v;
      else if (bg === FICHA_COLOR_.no) v = '[x] ' + v;
      else if (bg === FICHA_COLOR_.gris) v = '[·] ' + v;
      else if (bg === FICHA_COLOR_.amarillo) v = '[!] ' + v;
      celdas.push(v);
    }
    if (fmt.desplegable) celdas.push('ELEGIR ▾ {' + fmt.desplegable.join(' / ') + '}');
    const iP = COLS_FICHA_.indexOf('puntaje');
    if (r[iP] !== '' && r[iP] !== null && r[iP] !== undefined) celdas.push('(puntaje ' + r[iP] + ', oculto)');
    if (!celdas.length) continue;
    const t = String(r[COLS_FICHA_.indexOf('ficha')]);
    out.push((t === '' ? '      ' : '  ') + celdas.join(' | '));
  }
  return out;
}
