/**
 * 25_Elecciones.js — lo que eligió una persona en "elegido" (regla 4, 03/10).
 *
 * Regla 4: lo que el sistema no resuelve, se lo presenta a una persona con las opciones y sus
 * puntajes, y la persona elige. Dónde se elige (página para el equipo: docs/elegir-match.md):
 *
 *   - `REVISAR_MATCH`: una línea por fila del destino, con hasta 3 opciones. En "elegido": el número
 *     de la opción (1, 2, 3), "sí" (= la opción 1) o "ninguno";
 *   - `EMPAREJAR_MANUAL`, bloque de arriba: una línea por par formulario ↔ fila. "sí" en la línea del
 *     par elegido;
 *   - `EMPAREJAR_MANUAL`, bloque "POR FILA DEL DESTINO": como REVISAR_MATCH.
 *
 * --- Cómo se identifica (nunca por número de fila) ---
 * La fila del destino, por figura + fecha + barrio de la línea. El formulario, por su clave estable
 * (`form_clave` / `op{n}_clave`: nombre + Fecha_Fin, `claveFormulario_`). Una solapa vieja sin la
 * columna de clave: por el nombre, si hay un solo formulario con ese nombre.
 *
 * --- Dónde quedan ---
 * Cada elección leída se guarda en `ELECCIONES_MATCH` (intermedia), que el sistema **no borra nunca**:
 * así sobrevive aunque las solapas de revisión se regeneren en cada corrida, y aunque la fila deje de
 * aparecer (porque se escribió, o por "ninguno"). Al regenerar REVISAR_MATCH y EMPAREJAR_MANUAL, cada
 * línea vuelve a mostrar su "elegido" y el "resultado". Para anular una elección: borrar su fila en
 * `ELECCIONES_MATCH`.
 *
 * --- Qué hace el plan con ellas (`aplicarElecciones_`, en calcularPlan_) ---
 *   - válida → la fila se escribe con ese formulario como cualquier match (sólo celda vacía), con la
 *     traza "+elegido_por_persona"; se aplica en la corrida REAL siguiente (en seco sólo se dice);
 *   - rechazada (nada se escribe): el formulario ya tiene otra fila / ya no existe en B / dos
 *     elecciones para la misma fila (o el mismo formulario en dos filas) / elección ilegible / la fila
 *     no se encuentra o ya está escrita / reunión futura;
 *   - "ninguno" → la fila no se vuelve a proponer ni se escribe, salvo que aparezca un formulario nuevo
 *     de su figura a ±VENTANA_NINGUNO_DIAS (7) días de su fecha; entonces vence y vuelve a proponerse.
 */

/** Las columnas de ELECCIONES_MATCH. */
const COLS_ELECCIONES_ = ['fecha_carga', 'hoja', 'figura', 'barrio', 'fecha', 'elegido', 'form_nombre',
                          'form_clave', 'estado', 'resultado', 'fecha_resultado', 'claves_al_decidir', 'comentario'];

/**
 * Lee las elecciones: las nuevas de las solapas de revisión y las guardadas en ELECCIONES_MATCH.
 * Devuelve `{ guardadas: [...registros], nuevas: [...], activas: [...] }`. Un registro:
 * `{ figura, barrio, fecha (Date), elegido, formNombre, formClave, estado, resultado, ... }`.
 * Activas = pendientes y "ninguno" (las aplicadas y rechazadas ya no se procesan).
 */
function leerElecciones_(cands) {
  const guardadas = _leerEleccionesGuardadas_();
  const ya = {};
  guardadas.forEach(function (g) { if (!_esNota_(g)) ya[_idEleccion_(g)] = g; });
  const leidas = _leerEleccionesDeHoja_(RDV_HOJA_REVISAR, cands).concat(_leerEleccionesDeHoja_(RDV_HOJA_EMPAREJAR, cands));
  const nuevas = [];
  let cerradas = 0;
  // Las de la misma fila que una elección nueva de una ficha deja sin efecto (03/10): lo que muestra la
  // ficha es lo que vale. Sólo las que todavía no se aplicaron (pendiente) y las notas.
  const reemplazar = function (e, tambienPendientes) {
    const fid = _filaEleccion_(e);
    guardadas.concat(nuevas).forEach(function (g) {
      if (g === e || _filaEleccion_(g) !== fid) return;
      if (_esNota_(g) || (tambienPendientes && g.estado === 'pendiente')) {
        g.estado = 'reemplazada'; g.resultado = 'reemplazada por otra elección'; g.fechaResultado = new Date();
      }
    });
  };
  leidas.forEach(function (e) {
    // Sólo filas activas (DIAS_ACTIVOS, 03/10): lo de una reunión cerrada no se lee.
    if (!esFilaActiva_(e.fecha)) { cerradas++; return; }
    if (_esNota_(e)) {
      // "No sé" o sólo un comentario (fichas): una nota por fila, que se actualiza. "No sé" deja sin
      // efecto una elección pendiente de la fila; un comentario solo, no.
      const fid = _filaEleccion_(e);
      const nota = guardadas.concat(nuevas).find(function (g) {
        return _esNota_(g) && g.estado !== 'reemplazada' && _filaEleccion_(g) === fid;
      });
      if (e.elegido === 'no_se') reemplazar(nota || e, true);
      if (nota) { nota.elegido = e.elegido; nota.estado = e.elegido; nota.comentario = e.comentario; return; }
      e.estado = e.elegido; e.fechaCarga = new Date(); nuevas.push(e);
      return;
    }
    const id = _idEleccion_(e);
    if (ya[id]) {                    // ya guardada (la solapa regenerada la muestra de nuevo)
      if (e.comentario !== undefined) ya[id].comentario = e.comentario;
      return;
    }
    ya[id] = e;
    e.estado = 'pendiente';
    e.fechaCarga = new Date();
    if (e.desdeFicha) reemplazar(e, true);
    nuevas.push(e);
  });
  const todas = guardadas.concat(nuevas);
  return { guardadas: guardadas, nuevas: nuevas, todas: todas, leidasCerradas: cerradas,
           activas: todas.filter(function (e) { return e.estado === 'pendiente' || e.estado === 'ninguno'; }) };
}

/** "No sé" o sólo un comentario: no es una elección, no se aplica ni bloquea nada (fichas, 03/10). */
function _esNota_(e) {
  return e.elegido === 'no_se' || e.elegido === 'nota' || e.estado === 'no_se' || e.estado === 'nota';
}

/** La identidad de una elección: fila (figura | fecha | barrio) + lo elegido (clave del formulario o "ninguno"). */
function _idEleccion_(e) {
  return _filaEleccion_(e) + '#' + (e.elegido === 'ninguno' ? 'ninguno' : (e.formClave || ('?' + e.elegidoCrudo)));
}
function _filaEleccion_(e) {
  return normalizeText_(e.figura) + '|' + (e.fecha ? ymd_(e.fecha) : '') + '|' + normalizeText_(e.barrio);
}

/** "sí" / número / "ninguno" / ilegible. */
function _valorElegido_(v) {
  const t = normalizeText_(v);
  if (!t) return null;
  if (t === 'si' || t === 'x' || t === 'ok') return 'si';
  if (t === 'ninguno' || t === 'ninguna' || t === 'no') return 'ninguno';
  if (t === 'no se' || t === 'nose') return 'no_se';
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const op = /^opcion\s*(\d+)$/.exec(t);            // el desplegable de las fichas: "Opción 2"
  if (op) return parseInt(op[1], 10);
  return 'ilegible';
}

/**
 * Las elecciones escritas en una solapa de revisión, por encabezado. REVISAR_MATCH tiene un solo
 * encabezado (fila 1); EMPAREJAR_MANUAL tiene el de arriba (fila 1) y el del bloque "POR FILA DEL
 * DESTINO" (la fila que empieza "---" | "fila_destino"); las filas de título ("--- …") cortan el bloque.
 */
function _leerEleccionesDeHoja_(nombre, cands) {
  const sh = ssIntermedia_().getSheetByName(nombre);
  if (!sh || sh.getLastRow() < 2) return [];
  const vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  // REVISAR_MATCH como fichas (26_Fichas.js): se reconoce por el encabezado.
  if (esHojaDeFichas_(vals[0])) return leerFichas_(vals, cands, nombre);
  const out = [];
  let hdr = vals[0];
  for (let i = 1; i < vals.length; i++) {
    const r = vals[i];
    if (str(r[0]) === '---' && normalizeHeader_(r[1]) === 'fila_destino') { hdr = r; continue; }
    if (/^---/.test(str(r[0]))) { hdr = null; continue; }
    if (!hdr) continue;
    const col = function (n) { return findIdxOr_(hdr, [n], true); };
    const iEl = col('elegido') != null ? col('elegido') : col('confirmar');   // "confirmar" = solapa vieja
    if (iEl == null) continue;
    const valor = _valorElegido_(r[iEl]);
    if (valor === null) continue;
    const iFig = col('figura'), iBar = col('barrio'), iFec = col('fecha');
    const e = { hoja: nombre, figura: iFig != null ? str(r[iFig]) : '', barrio: iBar != null ? str(r[iBar]) : '',
                fecha: iFec != null ? toDate_(r[iFec]) : null, elegidoCrudo: str(r[iEl]), elegido: valor,
                formNombre: '', formClave: '' };
    if (valor === 'ninguno' || valor === 'ilegible' || valor === 'no_se') { out.push(e); continue; }
    if (col('nombre_formulario') != null) {
      // Bloque de pares: la línea ES el formulario. Sólo "sí".
      if (valor !== 'si') { e.elegido = 'ilegible'; out.push(e); continue; }
      e.formNombre = str(r[col('nombre_formulario')]);
      e.formClave = col('form_clave') != null ? str(r[col('form_clave')]) : '';
    } else {
      // Línea por fila: el número de la opción ("sí" = la 1).
      const k = valor === 'si' ? 1 : valor;
      const iNom = col('op' + k + '_formulario'), iCla = col('op' + k + '_clave');
      if (iNom == null || !str(r[iNom])) { e.elegido = 'ilegible'; out.push(e); continue; }
      e.formNombre = str(r[iNom]);
      e.formClave = iCla != null ? str(r[iCla]) : '';
    }
    if (!e.formClave) {                           // solapa vieja sin la clave: por el nombre, si es único
      const mismos = cands.vivos.filter(function (c) { return c.nombre === e.formNombre; });
      if (mismos.length === 1) e.formClave = mismos[0].clave;
    }
    e.elegido = 'formulario';
    out.push(e);
  }
  return out;
}

function _leerEleccionesGuardadas_() {
  const sh = ssIntermedia_().getSheetByName(RDV_HOJA_ELECCIONES);
  if (!sh || sh.getLastRow() < 2) return [];
  const vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const hdr = vals[0];
  const i = function (n) { return findIdxOr_(hdr, [n], true); };
  return vals.slice(1).filter(function (r) { return !r.every(esVacio_); }).map(function (r) {
    const get = function (n) { return i(n) != null ? r[i(n)] : ''; };
    const elegido = str(get('elegido')), estado = str(get('estado'));
    return { fechaCarga: get('fecha_carga'), hoja: str(get('hoja')), figura: str(get('figura')),
             barrio: str(get('barrio')), fecha: toDate_(get('fecha')),
             // Las notas de las fichas (03/10): "No sé" o sólo un comentario. Las dice el estado.
             elegido: (estado === 'no_se' || estado === 'nota') ? estado
               : elegido === 'ninguno' ? 'ninguno' : (elegido === 'ilegible' ? 'ilegible' : 'formulario'),
             comentario: str(get('comentario')),
             elegidoCrudo: elegido, formNombre: str(get('form_nombre')), formClave: str(get('form_clave')),
             estado: str(get('estado')), resultado: str(get('resultado')), fechaResultado: get('fecha_resultado'),
             clavesAlDecidir: str(get('claves_al_decidir')) };
  });
}

/**
 * **Aplica las elecciones al plan** (en `calcularPlan_`, después del invariante y antes de la vuelta 2).
 * Modifica `evals[i].r` de las filas elegidas (veredicto `escribiria` con el formulario elegido, o
 * `ninguno_por_persona`) y anota en cada elección su `resultadoPlan` / `motivo`. No escribe nada.
 */
function aplicarElecciones_(elec, dest, evals, cands, comunas, tomadosGrupo, porFilaUid) {
  const r = { validas: [], rechazadas: [], ningunos: [], vencidos: [], aplicadasAntes: [], cerradas: [] };
  if (!elec || !elec.activas.length) return r;
  const porEval = {};
  evals.forEach(function (x) { porEval[x.f.fila] = x; });
  const rechazar = function (e, motivo) { e.resultadoPlan = 'rechazado'; e.motivo = motivo; r.rechazadas.push(e); };

  // La fila de cada elección (figura + fecha + barrio), y las elecciones por fila.
  const porFila = {};
  elec.activas.forEach(function (e) {
    if (e.elegido === 'ilegible') { rechazar(e, 'elección ilegible'); return; }
    const filas = dest.filas.filter(function (f) {
      return normalizeText_(f.figura) === normalizeText_(e.figura) && f.fecha && e.fecha &&
             ymd_(f.fecha) === ymd_(e.fecha) && normalizeText_(f.barrio) === normalizeText_(e.barrio);
    });
    if (filas.length !== 1) { rechazar(e, filas.length ? 'hay 2+ filas con esa figura, fecha y barrio' : 'la fila no se encuentra'); return; }
    e.f = filas[0];
    // Una reunión cerrada (DIAS_ACTIVOS, 03/10) no se toca: la elección queda como estaba.
    if (!esFilaActiva_(e.f.fecha)) { e.resultadoPlan = 'cerrada'; r.cerradas.push(e); return; }
    (porFila[e.f.fila] = porFila[e.f.fila] || []).push(e);
  });

  Object.keys(porFila).forEach(function (fila) {
    const lista = porFila[fila];
    if (lista.length > 1) { lista.forEach(function (e) { rechazar(e, 'dos elecciones para la misma fila'); }); return; }
    const e = lista[0], f = e.f;
    if (f.fecha && f.fecha > _hoy_()) { rechazar(e, 'reunión futura'); return; }
    if (e.elegido === 'ninguno') {
      const ahora = _clavesCercanas_(f, cands);
      // Las claves llevan "|" adentro (nombre|fecha): se guardan como JSON, no unidas.
      let antes = null;
      try { antes = e.clavesAlDecidir ? JSON.parse(e.clavesAlDecidir) : null; } catch (err) { antes = null; }
      const nueva = antes ? ahora.filter(function (k) { return antes.indexOf(k) < 0; }) : [];
      if (nueva.length) {
        e.resultadoPlan = 'vencido'; e.motivo = 'formulario nuevo: ' + nueva.join(', '); r.vencidos.push(e); return;
      }
      if (!antes) e.clavesAlDecidir = JSON.stringify(ahora);
      e.resultadoPlan = 'ninguno';
      r.ningunos.push(e);
      const x = porEval[f.fila];
      if (x) x.r = { mejor: x.r.mejor, segundoScore: x.r.segundoScore, margen: x.r.margen,
                     veredicto: 'ninguno_por_persona', motivo: 'ninguno_por_persona' };
      return;
    }
    // Un formulario.
    if (f.uid) {
      const t = porFilaUid[f.fila];
      if (t && t.cand && t.cand.clave === e.formClave) { e.resultadoPlan = 'aplicado'; r.aplicadasAntes.push(e); return; }
      rechazar(e, 'la fila ya está escrita (RDV_UID)'); return;
    }
    const iguales = cands.vivos.filter(function (c) { return c.clave === e.formClave; });
    if (!e.formClave || !iguales.length) { rechazar(e, 'el formulario ya no existe en B'); return; }
    if (iguales.length > 1 || iguales[0].claveRepetida) { rechazar(e, 'el formulario no se puede identificar (clave repetida)'); return; }
    e.c = iguales[0];
  });

  // El invariante: el formulario (o su grupo de gemelos) no puede tener otra fila.
  const validas = Object.keys(porFila).map(function (k) { return porFila[k]; })
    .filter(function (l) { return l.length === 1 && l[0].c && !l[0].resultadoPlan; }).map(function (l) { return l[0]; });
  const porGrupo = {};
  validas.forEach(function (e) { (porGrupo[e.c.grupo] = porGrupo[e.c.grupo] || []).push(e); });
  validas.forEach(function (e) {
    if (porGrupo[e.c.grupo].length > 1) { rechazar(e, 'dos elecciones para el mismo formulario'); return; }
    const duenio = tomadosGrupo.get(e.c.grupo);
    if (duenio && duenio.fila !== e.f.fila) { rechazar(e, 'el formulario ya tiene otra fila (fila ' + duenio.fila + ')'); return; }
    const otra = evals.find(function (x) {
      return x.f.fila !== e.f.fila && x.r.veredicto === 'escribiria' && x.r.mejor && x.r.mejor.c.grupo === e.c.grupo;
    });
    if (otra) { rechazar(e, 'el formulario ya tiene otra fila (fila ' + otra.f.fila + ')'); return; }
    const x = porEval[e.f.fila];
    if (!x) { rechazar(e, 'la fila no se evalúa (sin fecha o ya resuelta)'); return; }
    const sc = puntuar_(e.f, e.c, comunas);
    x.r = { mejor: sc, segundoScore: 0, margen: sc.score, veredicto: 'escribiria', motivo: '', elegido: true };
    e.resultadoPlan = 'valida';
    r.validas.push(e);
  });
  return r;
}

/** Las claves de los formularios de la figura de `f` a ±VENTANA_NINGUNO_DIAS días de su fecha (para "ninguno"). */
function _clavesCercanas_(f, cands) {
  const fig = normalizeText_(f.figura);
  return cands.vivos.filter(function (c) {
    if (c.figurasNorm.indexOf(fig) < 0) return false;
    const d = distanciaFecha_(f.fecha, c.det);
    return d !== null && d <= VENTANA_NINGUNO_DIAS;
  }).map(function (c) { return c.clave; }).sort();
}

/** El log de las elecciones (paso 2 y upsert). */
function _logElecciones_(elec, ap) {
  if (!elec) return;
  Logger.log('--- ELEGIDO (regla 4): lo que eligió una persona en REVISAR_MATCH / EMPAREJAR_MANUAL ---');
  Logger.log('  leídas nuevas: %s | guardadas: %s | activas (pendientes y "ninguno"): %s | leídas de reuniones ' +
             'cerradas (no se toman): %s', elec.nuevas.length, elec.guardadas.length, elec.activas.length,
             elec.leidasCerradas || 0);
  if (!ap) return;
  Logger.log('  válidas (se escriben en la corrida real): %s | rechazadas: %s | "ninguno" vigentes: %s | ' +
             '"ninguno" vencidos: %s | ya aplicadas: %s', ap.validas.length, ap.rechazadas.length,
             ap.ningunos.length, ap.vencidos.length, ap.aplicadasAntes.length);
  if (ap.cerradas.length) Logger.log('  de reuniones cerradas (DIAS_ACTIVOS, no se tocan): %s', ap.cerradas.length);
  const linea = function (e) {
    return (e.f ? 'fila ' + e.f.fila : '¿fila?') + ' | ' + e.figura + ' | ' + fmtFecha_(e.fecha) + ' | ' +
           (e.elegido === 'ninguno' ? 'ninguno' : (e.formNombre || e.elegidoCrudo)) + ' (' + e.hoja + ')';
  };
  ap.validas.forEach(function (e) { Logger.log('    VÁLIDA:    %s', linea(e)); });
  ap.rechazadas.forEach(function (e) { Logger.log('    RECHAZADA: %s → %s', linea(e), e.motivo); });
  ap.ningunos.forEach(function (e) { Logger.log('    NINGUNO:   %s', linea(e)); });
  ap.vencidos.forEach(function (e) { Logger.log('    VENCIDO:   %s → %s', linea(e), e.motivo); });
}

/**
 * Guarda las elecciones en ELECCIONES_MATCH (intermedia) con su estado y resultado. En la corrida REAL,
 * las válidas pasan a "aplicado" (si la escritura terminó completa; si se cortó, quedan pendientes y la
 * siguiente las encuentra escritas por su RDV_UID). En seco, las válidas siguen pendientes.
 */
function guardarElecciones_(elec, ap, enSeco, completa) {
  if (!elec || !elec.todas.length) return;
  const hoy = Utilities.formatDate(new Date(), RDV_TZ, 'dd/MM/yyyy HH:mm');
  elec.todas.forEach(function (e) {
    switch (e.resultadoPlan) {
      case 'valida':
        if (!enSeco && completa) { e.estado = 'aplicado'; e.resultado = 'aplicado ' + hoy; e.fechaResultado = new Date(); }
        else e.resultado = enSeco ? 'válida (en seco: se aplica en la próxima corrida real)' : 'válida (corrida cortada)';
        break;
      case 'aplicado':
        e.estado = 'aplicado'; e.resultado = e.resultado || ('aplicado ' + hoy); break;
      case 'rechazado':
        e.estado = 'rechazado'; e.resultado = 'rechazado: ' + e.motivo; e.fechaResultado = new Date(); break;
      case 'ninguno':
        e.estado = 'ninguno'; e.resultado = 'ninguno: no se vuelve a proponer'; break;
      case 'vencido':
        e.estado = 'ninguno_vencido'; e.resultado = 'vencido: ' + e.motivo; e.fechaResultado = new Date(); break;
      default: break;
    }
  });
  const filas = [COLS_ELECCIONES_].concat(elec.todas.map(function (e) {
    const elegido = e.elegido === 'formulario' ? (e.elegidoCrudo || 'sí')
      : e.elegido === 'no_se' ? 'no sé' : e.elegido === 'nota' ? '' : e.elegido;
    return [e.fechaCarga || '', e.hoja || '', e.figura, e.barrio, e.fecha || '', elegido, e.formNombre || '',
            e.formClave || '', e.estado || '', e.resultado || '', e.fechaResultado || '', e.clavesAlDecidir || '',
            e.comentario || ''];
  }));
  escribirHoja_(RDV_HOJA_ELECCIONES, filas);
}

/**
 * Vuelve a poner "elegido" y "resultado" en las líneas regeneradas de REVISAR_MATCH y EMPAREJAR_MANUAL,
 * para que una elección no se pierda al reescribir la solapa. Por fila (figura + fecha + barrio) y
 * formulario (clave), nunca por posición.
 */
function marcarEleccionesEnReportes_(plan) {
  const elec = plan.elecciones;
  if (!elec || !elec.todas.length) return;
  const porFila = {};
  elec.todas.forEach(function (e) { (porFila[_filaEleccion_(e)] = porFila[_filaEleccion_(e)] || []).push(e); });
  const buscar = function (figura, fecha, barrio) {
    return porFila[normalizeText_(figura) + '|' + (fecha ? ymd_(toDate_(fecha)) : '') + '|' + normalizeText_(barrio)] || [];
  };
  const marcarPorFila = function (hdr, linea) {
    const i = function (n) { return hdr.indexOf(n); };
    const es = buscar(linea[i('figura') >= 0 ? i('figura') : i('Figura')], linea[i('fecha') >= 0 ? i('fecha') : i('Fecha')],
                      linea[i('barrio') >= 0 ? i('barrio') : i('Barrio')]);
    es.forEach(function (e) {
      if (e.estado === 'reemplazada' || _esNota_(e)) return;   // las notas de las fichas no se copian acá (03/10)
      e._mostrada = true;
      let valor = '';
      if (e.elegido === 'ninguno') valor = 'ninguno';
      else {
        for (let k = 1; k <= OPCIONES_REVISION; k++) if (linea[i('op' + k + '_clave')] === e.formClave) valor = k;
        if (valor === '') valor = e.elegidoCrudo || '';
      }
      linea[i('elegido')] = valor;
      linea[i('resultado')] = e.resultado || '';
    });
  };
  const hRev = ['clave', 'figura', 'barrio', 'fecha', 'form_origen', 'score', 'segundo', 'margen', 'motivo', 'senales',
                'en_ventana'].concat(_encabezadoOpciones_(OPCIONES_REVISION));
  // Con REVISAR_MATCH como fichas, las fichas muestran las elecciones solas (armarFichas_).
  if (!REVISAR_COMO_FICHAS) plan.filasRevisar.forEach(function (l) { marcarPorFila(hRev, l); });
  let hdr = plan.emp.matriz[0];
  for (let k = 1; k < plan.emp.matriz.length; k++) {
    const l = plan.emp.matriz[k];
    if (l[0] === '---' && l[1] === 'fila_destino') { hdr = l; continue; }
    if (/^---/.test(String(l[0]))) { hdr = null; continue; }
    if (!hdr) continue;
    if (hdr.indexOf('nombre_formulario') >= 0) {
      const i = function (n) { return hdr.indexOf(n); };
      buscar(l[i('Figura')], l[i('Fecha')], l[i('Barrio')]).forEach(function (e) {
        if (e.elegido === 'formulario' && e.estado !== 'reemplazada' && e.formClave === l[i('form_clave')]) {
          e._mostrada = true;
          l[i('elegido')] = 'sí'; l[i('resultado')] = e.resultado || '';
        }
      });
    } else marcarPorFila(hdr, l);
  }

  /*
   * Las elecciones cuya fila ya no aparece (se aplicó, es válida y se va a aplicar, o "ninguno"): una
   * línea al final de REVISAR_MATCH con lo elegido y el resultado, para que se vea al lado de "elegido".
   * Se re-lee como la misma elección (misma fila y misma clave), así que no se duplica.
   */
  if (REVISAR_COMO_FICHAS) return;   // las resueltas van a la sección RESUELTAS de las fichas
  elec.todas.forEach(function (e) {
    if (e._mostrada || _esNota_(e) || e.estado === 'reemplazada') return;
    const l = hRev.map(function () { return ''; });
    const pon = function (n, v) { l[hRev.indexOf(n)] = v; };
    pon('clave', claveNatural_(e.figura, e.fecha)); pon('figura', e.figura); pon('barrio', e.barrio);
    pon('fecha', fmtFecha_(e.fecha)); pon('form_origen', e.formNombre || '');
    pon('motivo', 'elegido por persona: ' + (e.estado || ''));
    pon('en_ventana', _sn_(enVentanaAnalisis_(e.fecha)));
    if (e.elegido === 'formulario') { pon('op1_formulario', e.formNombre); pon('op1_clave', e.formClave); pon('elegido', 1); }
    else pon('elegido', e.elegido === 'ninguno' ? 'ninguno' : e.elegidoCrudo);
    pon('resultado', e.resultado || '');
    plan.filasRevisar.push(l);
  });
}
