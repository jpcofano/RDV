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
 *   Opción 1..3   figura(s) del formulario, Fecha_Fin, ubicación detectada, nombre, inscriptos DEL
 *                 FORMULARIO, días de diferencia, puntaje y "ocupado por". Verde si coincide con la
 *                 reunión, rojo si no, gris si no se puede comparar;
 *                 debajo, la línea "coincide / no coincide" (✅ ❌ ⚪ ⚠️), traducida del puntaje;
 *   otra reunión  en gris: las otras reuniones de la misma figura a ±DIAS_CONTEXTO_FICHA días.
 *
 * Al final, la sección RESUELTAS: las elecciones aplicadas, válidas (se aplican en la próxima corrida
 * real) y "ninguno", con su resultado y su fecha. El lector no la lee.
 *
 * --- Identidad (no cambia: regla 4, 25_Elecciones.js) ---
 * La fila, por figura + fecha + barrio (columnas ocultas id_figura, id_fecha, id_barrio de la línea
 * REUNIÓN); el formulario, por su clave (columna oculta form_clave de cada línea de opción). Nunca por
 * número de fila. Las elecciones se guardan en ELECCIONES_MATCH.
 *
 * Sólo calcula sobre el plan y escribe en la intermedia. No lee ni escribe el destino.
 */

/** Las columnas de una ficha. Las cuatro últimas, ocultas: la identidad. */
const COLS_FICHA_ = ['ficha', 'fila', 'figura', 'fecha', 'ubicación', 'evento / formulario', 'inscriptos',
                     'asistentes', 'días', 'puntaje', 'ocupado por', 'elegido', 'comentario', 'resultado',
                     'id_figura', 'id_fecha', 'id_barrio', 'form_clave'];
const FICHA_COLS_OCULTAS_ = 4;
const FICHA_COLOR_ = { si: '#d9ead3', no: '#f4cccc', gris: '#eeeeee', reunion: '#fff2cc', titulo: '#d9d9d9',
                       textoGris: '#888888', textoNormal: '#000000' };
const FICHA_ETIQUETA_ = { reunion: 'REUNIÓN', porQue: '¿por qué?', opcion: 'Opción ', contexto: 'otra reunión',
                          resueltas: 'RESUELTAS', resuelta: 'resuelta', pendientes: 'PENDIENTES' };
const DIAS_SEMANA_ = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** ¿Es una hoja de fichas? Por el encabezado. */
function esHojaDeFichas_(hdr) {
  return !!hdr && normalizeHeader_(hdr[0]) === 'ficha' && hdr.some(function (h) { return normalizeHeader_(h) === 'id_figura'; });
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
  const dest = plan.dest, comunas = plan.comunas, vivos = plan.cands.vivos, porFila = plan.porFila;
  const ctx = _contextoFichas_(plan, asis);
  const salida = [], formato = [], fichas = [], porMotivo = {};
  const ancho = COLS_FICHA_.length;
  const linea = function (valores, fmt) {
    const v = valores.slice(); while (v.length < ancho) v.push('');
    salida.push(v);
    formato.push(Object.assign({ bg: v.map(function () { return null; }), fc: v.map(function () { return null; }),
                                 negrita: false, desplegable: null }, fmt || {}));
    return salida.length - 1;
  };
  linea(COLS_FICHA_, { negrita: true, bg: COLS_FICHA_.map(function () { return FICHA_COLOR_.titulo; }) });

  let lista;
  if (opts.filas) {
    lista = opts.filas.map(function (n) { return ctx.porNum[n]; }).filter(Boolean);
  } else {
    lista = dest.filas.filter(function (f) {
      const pf = porFila[f.fila];
      return pf && (pf.veredicto === 'REVISAR_MATCH' || pf.veredicto === 'SIN_MATCH') && esFilaActiva_(f.fecha);
    });
    lista.sort(function (a, b) {
      const ta = a.fecha ? a.fecha.getTime() : 0, tb = b.fecha ? b.fecha.getTime() : 0;
      return (tb - ta) || (a.fila - b.fila);
    });
  }
  linea([FICHA_ETIQUETA_.pendientes + ' (' + lista.length + ')', 'reuniones de ' + descActivas_() +
         ' que el sistema no pudo emparejar solo. Elegí en "elegido" (la línea REUNIÓN); "No sé" la deja pendiente.'],
        { negrita: true });

  lista.forEach(function (f) {
    const pf = porFila[f.fila] || {};
    const primero = pf.cand || null;
    const ops = listaOpcionesFila_(f, vivos, comunas, primero).slice(0, OPCIONES_REVISION);
    const elec = _eleccionDeFicha_(ctx, f);
    const motivo = pf.veredicto === 'REVISAR_MATCH' || pf.veredicto === 'SIN_MATCH' ? (pf.motivo || pf.veredicto)
                 : (pf.veredicto || 'sin_veredicto');
    porMotivo[motivo] = (porMotivo[motivo] || 0) + 1;

    const desde = salida.length;
    // --- REUNIÓN ---
    const ins = _insDestino_(dest, f);
    const a = asis && asis.porFila ? asis.porFila.get(f.fila) : null;
    const asD = dest.D['Asistentes'] != null ? f.valores[dest.D['Asistentes']] : '';
    let elegidoTxt = '';
    if (elec.e) {
      if (elec.e.elegido === 'ninguno') elegidoTxt = 'Ninguno';
      else if (elec.e.elegido === 'no_se') elegidoTxt = 'No sé';
      else if (elec.e.elegido === 'formulario') {
        ops.forEach(function (sc, k) { if (sc.c.clave === elec.e.formClave) elegidoTxt = 'Opción ' + (k + 1); });
      }
    }
    let resultado = elec.e && elec.e.estado !== 'nota' && elec.e.estado !== 'no_se' ? (elec.e.resultado || '') : '';
    if (elec.e && elec.e.elegido === 'formulario' && !elegidoTxt) {
      resultado = 'elegido «' + elec.e.formNombre + '» (no está entre las opciones): ' + resultado;
    }
    const nOps = ops.length;
    linea([FICHA_ETIQUETA_.reunion, f.fila, f.figura, _fechaLarga_(f.fecha), _ubicFila_(f, comunas), f.evento,
           ins == null ? '' : ins, a ? a.asis : (esVacio_(asD) ? '' : asD), '', '', '', elegidoTxt, elec.comentario,
           resultado, f.figura, _fechaId_(f.fecha), f.barrio, ''],
          { negrita: true, bg: COLS_FICHA_.map(function () { return FICHA_COLOR_.reunion; }),
            desplegable: _opcionesDesplegable_(nOps) });
    // --- ¿por qué? ---
    linea([FICHA_ETIQUETA_.porQue, _fraseMotivo_(f, pf, ops, ctx)]);
    // --- las opciones ---
    if (!nOps) linea(['', '(no hay ningún formulario para proponer)'], { fc: _gris_(ancho) });
    ops.forEach(function (sc, k) {
      const c = sc.c, duenio = _duenio_(ctx, c, f);
      const colF = _colorFecha_(sc), colU = _colorUbic_(sc);
      const colFig = sc.nombraFigura ? FICHA_COLOR_.si : (sc.sinFigura ? FICHA_COLOR_.gris : FICHA_COLOR_.no);
      const bg = COLS_FICHA_.map(function () { return null; });
      bg[2] = colFig; bg[3] = colF; bg[4] = colU; bg[8] = colF;
      if (duenio) bg[10] = FICHA_COLOR_.no;
      linea([FICHA_ETIQUETA_.opcion + (k + 1), '', _figurasDe_(c), _cierre_(c), _ubicForm_(c), c.nombre,
             c.inscriptos || 0, '', _diasTxt_(f, c), sc.score, duenio ? _descFila_(duenio) : '', '', '', '',
             '', '', '', c.clave], { bg: bg });
      linea(['', _lineaCoincide_(f, sc, ctx)]);
    });
    // --- contexto: las otras reuniones de la figura a ±DIAS_CONTEXTO_FICHA ---
    _otrasReuniones_(ctx, f).forEach(function (o) {
      linea([FICHA_ETIQUETA_.contexto, o.f.fila, o.f.figura, _fechaLarga_(o.f.fecha), _ubicFila_(o.f, comunas),
             o.f.evento, '', '', _signo_(o.d), '', o.estado], { fc: _gris_(ancho) });
    });
    linea([]);
    fichas.push({ f: f, desde: desde, hasta: salida.length - 1, motivo: motivo, veredicto: pf.veredicto || '' });
  });

  // --- RESUELTAS ---
  const resueltas = _resueltas_(ctx);
  linea([FICHA_ETIQUETA_.resueltas + ' (' + resueltas.length + ')',
         'lo que ya eligió una persona: aplicado, válido (se escribe en la próxima corrida) o "ninguno". ' +
         'Para anular: borrar su línea en ' + RDV_HOJA_ELECCIONES + '.'],
        { negrita: true, bg: COLS_FICHA_.map(function () { return FICHA_COLOR_.titulo; }) });
  resueltas.forEach(function (e) {
    const f = e.f;
    linea([FICHA_ETIQUETA_.resuelta, f ? f.fila : '', e.figura, _fechaLarga_(e.fecha),
           f ? _ubicFila_(f, comunas) : e.barrio, e.elegido === 'ninguno' ? '(ninguno)' : e.formNombre, '', '', '', '',
           '', e.elegido === 'ninguno' ? 'Ninguno' : (e.elegidoCrudo || 'sí'), e.comentario || '',
           (e.resultado || e.estado || '') + (e.fechaResultado instanceof Date ? ' · ' + fmtFecha_(e.fechaResultado) : '')]);
  });

  return { matriz: salida, formato: formato, fichas: fichas, pendientes: lista.length,
           resueltas: resueltas.length, porMotivo: porMotivo };
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
  return { plan: plan, porNum: porNum, porFig: porFig, duenioGrupo: duenioGrupo, elecPorFila: elecPorFila, asis: asis };
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
    else if (pf.veredicto === 'ninguno_por_persona') estado = '"ninguno" (lo decidió una persona)';
    else estado = pf.veredicto || '';
    return { f: o, d: diasEntre_(o.fecha, f.fecha), estado: estado };
  });
}

// ===================== Las frases =====================

/** "¿Por qué está acá?": una frase por motivo, con los datos de la fila. */
function _fraseMotivo_(f, pf, ops, ctx) {
  const op1 = ops[0] || null, c1 = op1 ? op1.c : null;
  const nom = function (c) { return '«' + c.nombre + '»'; };
  const dueno = c1 ? _duenio_(ctx, c1, f) : null;
  const fig = f.figura || 'la figura';
  switch (pf.motivo || pf.veredicto) {
    case 'formulario_compartido': {
      if (!c1) return 'Su formulario lo ganó otra reunión y no le quedó ninguno claro.';
      if (dueno) return 'El formulario que mejor le corresponde, ' + nom(c1) + ', ya lo tiene la fila ' + _descFila_(dueno) +
                        ', que tenía más evidencia. Sin ése, ningún otro alcanza para escribirla sola.';
      const otras = _otrasConMismoFormulario_(ctx, f, c1);
      return 'El formulario ' + nom(c1) + ' lo reclaman esta reunión' +
             (otras.length ? ' y la fila ' + otras.map(_descFila_).join(', la fila ') : ' y otra') +
             ' con la misma evidencia: el sistema no puede elegir de cuál es.';
    }
    case 'formulario_gemelo': {
      if (!c1) return 'Hay dos formularios con el mismo nombre (la misma reunión) y su grupo lo tiene otra fila.';
      return 'Hay ' + (c1.gemelos || 2) + ' formularios con el mismo nombre, ' + nom(c1) + ', que son la misma reunión' +
             (dueno ? ', y uno de ellos ya lo tiene la fila ' + _descFila_(dueno) + '. Una reunión no puede tener dos formularios iguales.'
                    : ': no se puede saber cuál es el de esta reunión.');
    }
    case 'clave_repetida': {
      if (!c1) return 'Hay dos formularios con el mismo nombre y el mismo cierre.';
      const mismos = ctx.plan.cands.vivos.filter(function (c) { return c.clave === c1.clave; });
      return 'Hay ' + mismos.length + ' formularios con el mismo nombre y el mismo cierre (' + nom(c1) + ', cierra ' +
             fmtFecha_(c1.det && c1.det.fechaFin) + '), todos con inscriptos (' +
             mismos.map(function (c) { return c.inscriptos || 0; }).join(' y ') + '): no se sabe cuál es el de esta reunión.';
    }
    case 'ubicacion_en_desacuerdo': {
      if (!c1) return 'El formulario dice otra ubicación.';
      return nom(c1) + ' nombra a ' + fig + ' y ' + _fraseFecha_(f, op1) + ', pero dice ' + _ubicForm_(c1) +
             ' y la reunión está cargada en ' + _ubicFila_(f, ctx.plan.comunas) +
             '. Puede ser una reunión que cambió de lugar (si es ésta, vale el barrio de RDV): el sistema no la escribe solo.';
    }
    case 'multi_figura': {
      if (!c1) return 'El formulario nombra a varias figuras.';
      return 'El mejor formulario, ' + nom(c1) + ', nombra a ' + c1.figurasNorm.length + ' figuras (' + _figurasDe_(c1) +
             '): es una inscripción compartida y no se sabe a qué reunión van sus inscriptos.';
    }
    case 'margen_chico': {
      const s2 = ops[1] ? ops[1].score : pf.segundo;
      return 'Hay formularios casi igual de buenos (puntajes ' + _num_(op1 ? op1.score : pf.score) + ' y ' + _num_(s2) +
             ') y ninguno tiene más evidencia que el otro.';
    }
    case 'score_bajo': {
      if (!c1) return 'Ningún formulario alcanza el mínimo para escribirse solo.';
      return 'El mejor formulario, ' + nom(c1) + ' (puntaje ' + _num_(op1.score) + '), no llega al mínimo para escribirse ' +
             'solo (' + _num_(UMBRAL_MATCH) + '): ' + _queFalla_(f, op1, ctx) + '.';
    }
    case 'sin_formulario_propio':
      return 'No hay ningún formulario de ' + fig + ' a ' + TOLERANCIA_REPROGRAMACION_DIAS + ' días o menos de la reunión ' +
             '(ni uno sin figura de su comuna). Puede faltar en el origen o tener otra fecha.' +
             (ops.length ? ' Las opciones son de otras fechas o de otra figura.' : '');
    case 'desacuerdo_y_resto_bajo':
      return c1 ? 'El único formulario cercano, ' + nom(c1) + ', dice ' + _ubicForm_(c1) + ' (la reunión: ' +
                  _ubicFila_(f, ctx.plan.comunas) + ') y además no coincide en lo demás: ' + _queFalla_(f, op1, ctx) + '.'
                : 'El único formulario cercano dice otra ubicación.';
    case 'sin_candidatos':
      return 'No hay ningún formulario de ' + fig + ', ni ninguno a 7 días o menos de la reunión.';
    case 'escribiria':
      return 'No está pendiente: el sistema la escribe con ' + (c1 ? nom(c1) : 'su formulario') + '.';
    case 'rdv_uid':
      return 'No está pendiente: ya tiene formulario (' + (f.formOrigen || 'RDV_UID') + ').';
    case 'cerrada':
      return 'Cerrada: tiene más de ' + DIAS_ACTIVOS + ' días y no tiene formulario. No aparece en la solapa ni se toca.';
    case 'futura':
      return 'Todavía no pasó: no se empareja.';
    case 'pendiente_barrio':
      return 'Esperando el barrio: es de hoy o de ayer y RDV todavía no tiene el barrio. Se vuelve a mirar en la próxima corrida.';
    case 'ninguno_por_persona':
      return 'Una persona eligió "ninguno": no se propone ni se escribe.';
    default:
      return 'Motivo: ' + (pf.motivo || pf.veredicto || '?') + '.';
  }
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
  else if (sc.nombraFigura) {
    p.push('✅ figura' + (/figura_por_apellido/.test(sc.nivel) ? ' (por el apellido)'
                       : /figura_por_variante/.test(sc.nivel) ? ' (escrita distinto)' : ''));
  } else if (sc.sinFigura) p.push('⚪ no nombra a nadie' + (sc.porSinFigura ? ' (vale por la ubicación y la fecha)' : ''));
  else p.push('❌ figura (es de ' + _figurasDe_(c) + ')');
  // fecha
  if (!sc.evaluables.fecha) p.push('⚪ fecha (no se puede comparar)');
  else p.push((sc.perdido.fecha === 0 ? '✅ fecha (' : '❌ fecha (a ' + sc.dist + ' días: ') + _detalleFecha_(f, c) + ')');
  // ubicación
  const tipo = (c.barrio && f.barrio) ? 'barrio' : 'comuna';
  if (sc.desacuerdo) p.push('❌ ' + tipo + ' (' + _ubicForm_(c) + ', la reunión es ' + _ubicFila_(f, ctx.plan.comunas) + ')');
  else if (sc.evaluables.ubic) p.push((sc.perdido.ubic === 0 ? '✅ ' : '❌ ') + tipo + ' (' + _ubicForm_(c) + ')');
  else {
    const uf = _ubicForm_(c);
    p.push('⚪ ubicación (' + (uf !== '—' ? 'el formulario dice ' + uf + (f.barrio ? '' : ', la reunión no tiene barrio')
                                           : 'el formulario no dice dónde') + ')');
  }
  if (sc.evaluables.hora) p.push(sc.perdido.hora === 0 ? '✅ hora' : '❌ hora');
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

/** "Flores (C7)", "Retiro (C1 Norte)", "(sin barrio)". */
function _ubicFila_(f, comunas) {
  if (!f.barrio) return '(sin barrio)';
  const com = comunas.get(normalizeText_(f.barrio));
  const sz = com === 1 ? subzonaDeBarrio_(f.barrio) : '';
  return f.barrio + (com == null ? '' : ' (C' + com + (sz ? ' ' + sz : '') + ')');
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
  const d = c.det && c.det.mejor && f.fecha ? diasEntre_(c.det.mejor, f.fecha) : null;
  return d === null ? '' : _signo_(d);
}

/** "645 · 16/06 · Almagro". */
function _descFila_(f) {
  return f.fila + ' (' + _ddmm_(f.fecha) + (f.barrio ? ', ' + f.barrio : '') + ')';
}

function _colorFecha_(sc) {
  if (!sc.evaluables.fecha) return FICHA_COLOR_.gris;
  return sc.perdido.fecha === 0 ? FICHA_COLOR_.si : FICHA_COLOR_.no;
}
function _colorUbic_(sc) {
  if (sc.desacuerdo) return FICHA_COLOR_.no;
  if (!sc.evaluables.ubic) return FICHA_COLOR_.gris;
  return sc.perdido.ubic === 0 ? FICHA_COLOR_.si : FICHA_COLOR_.no;
}

/** Los valores del desplegable de "elegido". */
function _opcionesDesplegable_(nOps) {
  const l = [];
  for (let k = 1; k <= nOps; k++) l.push('Opción ' + k);
  return l.concat(['Ninguno', 'No sé']);
}

// ===================== Escritura (intermedia) =====================

/**
 * Escribe las fichas en `nombre` (una solapa de la INTERMEDIA, nunca el destino): valores, colores,
 * negritas, el desplegable de "elegido" y las columnas de identidad ocultas. La solapa se regenera
 * entera: contenido, formato y validaciones (es un reporte; las elecciones ya se leyeron y se guardaron
 * en ELECCIONES_MATCH antes de escribir).
 */
function escribirFichas_(nombre, fx) {
  const m = fx.matriz, n = m.length, w = COLS_FICHA_.length;
  const ss = ssIntermedia_();
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
  const iEl = COLS_FICHA_.indexOf('elegido');
  sh.getRange(1, iEl + 1, n, 1).setDataValidations(fx.formato.map(function (x) {
    return [x.desplegable ? SpreadsheetApp.newDataValidation().requireValueInList(x.desplegable, true)
                                .setAllowInvalid(false).build() : null];
  }));
  sh.setFrozenRows(1);
  sh.hideColumns(w - FICHA_COLS_OCULTAS_ + 1, FICHA_COLS_OCULTAS_);
  SpreadsheetApp.flush();
  return sh;
}

// ===================== Lectura de "elegido" =====================

/**
 * Las elecciones de una hoja de fichas (lo llama `_leerEleccionesDeHoja_`). Por ficha (una línea
 * REUNIÓN y sus opciones): figura + fecha + barrio de las columnas ocultas; "Opción k" → la form_clave de
 * la línea "Opción k" de esa ficha; "Ninguno"; "No sé" y un comentario sin elección son notas (no se
 * aplican ni bloquean nada). Se corta en RESUELTAS: esa sección no se lee.
 */
function leerFichas_(vals, cands, nombreHoja) {
  const hdr = vals[0];
  const i = function (n) { return findIdxOr_(hdr, [n], true); };
  const iT = 0, iEl = i('elegido'), iCo = i('comentario'), iFig = i('id_figura'), iFec = i('id_fecha'),
        iBar = i('id_barrio'), iCla = i('form_clave'), iNom = i('evento / formulario');
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
    const r = vals[k], t = str(r[iT]);
    if (t.indexOf(FICHA_ETIQUETA_.resueltas) === 0) break;
    if (t === FICHA_ETIQUETA_.reunion) { cerrar(); ficha = { r: r, ops: {} }; continue; }
    const m = /^Opción (\d+)$/.exec(t);
    if (m && ficha) ficha.ops[Number(m[1])] = { clave: str(r[iCla]), nombre: iNom != null ? str(r[iNom]) : '' };
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
      celdas.push(v);
    }
    if (fmt.desplegable) celdas.push('elegido ▾ {' + fmt.desplegable.join(' / ') + '}');
    if (!celdas.length) continue;
    const t = String(r[0]);
    out.push((t === '' ? '      ' : '  ') + celdas.join(' | '));
  }
  return out;
}
