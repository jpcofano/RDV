/**
 * 53_CancelacionConjunto.js — RDV CONJUNTO como TERCERA fuente de cancelación (16/10, decisión del usuario;
 * AGENDA_CANCELACION_CONJUNTO, APAGADO hasta ver el paso 95).
 *
 * Las otras dos fuentes son del mail (40_Agenda.js, paso 7: la reunión desapareció en una versión completa; paso 7b: está en
 * ROJO ENTERO). Ésta es el Estado "Cancelado" de RDV CONJUNTO (archivo del destino, del equipo).
 *
 * **RDV CONJUNTO se LEE, nunca se escribe** (CLAUDE.md sección 1, regla dura). En este archivo no hay ninguna escritura: se
 * calcula, en memoria, qué fila de la base corresponde a cada fila "Cancelado" y qué haría con ella la regla. La suspensión la
 * arma `planAgenda_` (paso 7d) y la escribe la excepción de la agenda (`escribirAgendaLote_`, 05_Escritura.js), como cualquier
 * otra suspensión del sistema: STATUS + agenda_status_escrito, con lo esperado, en COLOR_SISTEMA, nunca se borra.
 *
 * La fila de la base de cada fila de RDV CONJUNTO sale del MISMO cruce que los Asistentes (`cruzarAsistentes_`,
 * 20_UpsertDestino.js): figura por tokens + fecha; con 2+ filas de la figura ese día, la dirección y después el barrio o la
 * comuna; una fila conjunta por su conjunto de figuras. Un cruce que no es único (ambiguo, sin figura, sin fila) no suspende.
 *
 * Las reglas (`cancelacionesConjunto_`), por fila de la base a la que llega al menos un "Cancelado":
 *   1. si a ESA fila de la base llega también otra fila de RDV CONJUNTO que NO está cancelada (caso Macri 15/10: Villa Santa
 *      Rita "Cancelado" y Villa Devoto "Realizada", la misma dirección, una sola fila en la base), la de la base es la no
 *      cancelada → no se suspende (sin aviso: es lo esperado);
 *   2. si RDV CONJUNTO tiene la misma figura ese día en otra fila no cancelada que NO se pudo cruzar, no se sabe cuál es la de la
 *      base → no se suspende;
 *   3. la fila de la base: "Suspendida" → nada; otro STATUS que "en agenda" (Realizada, Reprogramada…) → no se toca, aviso;
 *      "en agenda" con asistentes cargados (en la base o en la fila "Cancelado") → no se toca, aviso (se contradicen);
 *   4. si no, "en agenda" → Suspendida.
 */

/**
 * La columna de estado de RDV CONJUNTO: por encabezado (CONJUNTO_ENC_ESTADO); si no, por contenido: la columna (que no sea
 * figura, barrio, fecha, dirección ni asistentes) con más valores que son un estado conocido, si son al menos 3 y la mitad de
 * los no vacíos. `{ i, como }` (i null si no hay).
 */
function columnaEstadoConjunto_(hdr, vals, excluir) {
  const i = findIdxOr_(hdr, CONJUNTO_ENC_ESTADO, true);
  if (i != null) return { i: i, como: 'por encabezado' };
  const re = /^(realizad|programad|suspendid|cancelad|reprogramad|postergad|en agenda|no se realiz)/;
  let mejor = null;
  for (let j = 0; j < hdr.length; j++) {
    if (excluir.indexOf(j) >= 0) continue;
    let si = 0, no = 0;
    for (let k = 1; k < vals.length; k++) {
      const t = normalizeText_(vals[k][j]);
      if (!t) continue;
      if (re.test(t)) si++; else no++;
    }
    if (si >= 3 && si >= no && (!mejor || si > mejor.si)) mejor = { j: j, si: si, total: si + no };
  }
  return mejor ? { i: mejor.j, como: 'por contenido: ' + mejor.si + ' de ' + mejor.total + ' valores son un estado' } : { i: null, como: '' };
}

/** ¿Un Estado de RDV CONJUNTO dice que la reunión no se hizo? ("Cancelado", "Cancelada", "CANCELADA"…). */
function esCanceladoConjunto_(estado) {
  return CONJUNTO_ESTADO_CANCELADO.test(normalizeText_(estado));
}

/** Una fila de RDV CONJUNTO, en una línea: "RDV CONJUNTO fila N (Villa Devoto, "Realizada")". */
function textoFilaConjunto_(c) {
  return 'RDV CONJUNTO fila ' + c.fila + ' (' + [c.bar || 'sin barrio', c.dir || ''].filter(Boolean).join(', ') + ', "' + (c.estado || 'sin estado') + '"' +
         (c.asis > 0 ? ', asistentes ' + c.asis : '') + ')';
}

/**
 * **Qué filas de la base cancela RDV CONJUNTO** (sólo lectura). `dest` = `leerDestino_()`, `comunas` = `leerComunasMap_()`.
 * `opciones.cruce`: un `cruzarAsistentes_(dest, comunas, { incluirNoAplica: true })` ya hecho (tests). Devuelve:
 *   { error, nombreEst, comoEst, estados: { valor: n },
 *     filas: [ { fila, nombre, fecha, bar, dir, estado, cancelado, asis, figura, clave, filaBase, f, motivoSinFila } ],
 *     decisiones: [ { conjunto: [filas "Cancelado"], f (fila de la base o null), vivas: [filas no canceladas de esa reunión],
 *                     decision: 'suspender' | 'ya_suspendida' | 'otro_status' | 'datos' | 'misma_fila_viva' | 'par_ambiguo' |
 *                               'sin_fila', motivo, aviso } ],
 *     pares: [ { clave, canceladas, vivas } ] }   (la misma figura el mismo día, una "Cancelado" y otra no: el caso Macri 15/10)
 * `aviso`: la regla no se aplicó por algo que el equipo tiene que mirar (otro STATUS, datos que se contradicen).
 */
function cancelacionesConjunto_(dest, comunas, opciones) {
  opciones = opciones || {};
  const out = { error: '', nombreEst: '', comoEst: '', estados: {}, filas: [], decisiones: [], pares: [] };
  const cr = opciones.cruce || cruzarAsistentes_(dest, comunas, { incluirNoAplica: true });
  if (cr.error) { out.error = cr.error; return out; }
  const vals = cr.valores || [];
  if (vals.length < 2) return out;
  const hdr = vals[0];
  const iBar = findIdxOr_(hdr, ['barrion', 'barrio'], true);
  const iFec = findIdxOr_(hdr, ['fecha', 'fecha (fecha)', 'fecha_evento', 'fecha reunion', 'fecha reunión', 'fecha_reunion', 'fecha_reunión', 'fecha evento'], true);
  const iDir = findIdxOr_(hdr, ['direccion', 'dirección'], true);
  const iAsi = cr.iAsi;
  const est = columnaEstadoConjunto_(hdr, vals, [cr.iFig, iBar, iFec, iDir, iAsi].filter(function (x) { return x != null; }));
  if (est.i == null) {
    out.error = 'RDV CONJUNTO no tiene columna de estado (ni por encabezado: ' + CONJUNTO_ENC_ESTADO.join(' / ') + '; ni por contenido)';
    return out;
  }
  out.nombreEst = str(hdr[est.i]); out.comoEst = est.como;
  // por qué una fila de RDV CONJUNTO no llegó a ninguna fila de la base (lo que dejó anotado el cruce)
  const motivoDe = new Map();
  (cr.sinFigura || []).forEach(function (x) { motivoDe.set(x.fila, 'el nombre no es ninguna figura de la base (por tokens)'); });
  (cr.variasFiguras || []).forEach(function (x) { motivoDe.set(x.fila, 'el nombre nombra varias figuras (' + (x.cands || []).join(' / ') + ') y no es una fila conjunta de la base'); });
  (cr.noEncuentran || []).forEach(function (x) { motivoDe.set(x.fila, 'la base no tiene ninguna fila de ' + x.figura + ' ese día'); });
  (cr.ambiguas || []).forEach(function (x) { motivoDe.set(x.filaConjunto, 'ambigua: la base tiene ' + x.filas.join(' / ') + ' y ni la dirección ni el barrio deciden'); });
  const filaPorNumero = new Map();
  dest.filas.forEach(function (f) { filaPorNumero.set(f.fila, f); });
  const porBase = new Map(), porClave = new Map();
  for (let i = 1; i < vals.length; i++) {
    const row = vals[i];
    if (row.every(function (v) { return esVacio_(v); })) continue;
    const estado = str(row[est.i]);
    out.estados[estado || '(vacío)'] = (out.estados[estado || '(vacío)'] || 0) + 1;
    const nombre = str(row[cr.iFig]), fec = iFec != null ? toDate_(row[iFec]) : null;
    const fp = figuraPorTokens_(nombre);
    const asis = iAsi != null ? num(row[iAsi]) : '';
    const fb = cr.parDe ? cr.parDe.get(i + 1) : null;
    const c = { fila: i + 1, nombre: nombre, fecha: fec, bar: iBar != null ? str(row[iBar]) : '', dir: iDir != null ? str(row[iDir]) : '',
                estado: estado, cancelado: esCanceladoConjunto_(estado), asis: asis > 0 ? asis : 0, figura: fp.figura || '',
                filaBase: fb || null, f: fb ? filaPorNumero.get(fb) || null : null, motivoSinFila: '' };
    if (!fb) {
      c.motivoSinFila = motivoDe.get(i + 1) || (!fec ? 'sin fecha' : (cr.minFecha && fec < cr.minFecha ? 'anterior a la primera fila de la base' :
                        (row.some(function (v) { return normalizeText_(v) === 'no aplica'; }) ? 'no se cruzó ("No aplica")' : 'no se cruzó')));
    }
    c.clave = fec ? (fp.figura ? normalizeText_(fp.figura) : 'nombre:' + normalizeText_(nombre)) + '|' + ymd_(fec) : '';
    out.filas.push(c);
    if (fb) { if (!porBase.has(fb)) porBase.set(fb, []); porBase.get(fb).push(c); }
    if (c.clave) { if (!porClave.has(c.clave)) porClave.set(c.clave, []); porClave.get(c.clave).push(c); }
  }
  // los pares: la misma figura el mismo día, una "Cancelado" y otra no (el caso Macri 15/10)
  porClave.forEach(function (lista, clave) {
    const canc = lista.filter(function (c) { return c.cancelado; }), vivas = lista.filter(function (c) { return !c.cancelado; });
    if (canc.length && vivas.length) out.pares.push({ clave: clave, canceladas: canc, vivas: vivas });
  });
  // las "Cancelado" que no llegaron a ninguna fila de la base
  out.filas.forEach(function (c) {
    if (c.cancelado && !c.filaBase) out.decisiones.push({ conjunto: [c], f: null, vivas: [], decision: 'sin_fila', motivo: c.motivoSinFila, aviso: false });
  });
  const D = dest.D || {};
  const iSt = D['STATUS REUNIÓN'], iAsD = D['Asistentes'];
  const lineas = function (xs) { return xs.map(textoFilaConjunto_).join(' / '); };
  Array.from(porBase.keys()).sort(function (a, b) { return a - b; }).forEach(function (fb) {
    const lista = porBase.get(fb);
    const canc = lista.filter(function (c) { return c.cancelado; });
    if (!canc.length) return;
    const f = canc[0].f;
    const d = { conjunto: canc, f: f, vivas: [], decision: '', motivo: '', aviso: false };
    out.decisiones.push(d);
    const enLaFila = lista.filter(function (c) { return !c.cancelado; });
    const vivas = enLaFila.slice();
    canc.forEach(function (c) {
      (porClave.get(c.clave) || []).forEach(function (o) { if (!o.cancelado && vivas.indexOf(o) < 0) vivas.push(o); });
    });
    d.vivas = vivas;
    if (!f) { d.decision = 'sin_fila'; d.motivo = 'la fila ' + fb + ' de la base no se encuentra'; return; }
    // 1. la misma fila de la base recibe también una fila NO cancelada: la de la base es ésa
    if (enLaFila.length) {
      d.decision = 'misma_fila_viva';
      d.motivo = 'RDV CONJUNTO también tiene para esta fila de la base ' + lineas(enLaFila) + ': la de la base es la no cancelada, no se suspende';
      return;
    }
    // 2. la misma figura ese día en otra fila no cancelada que no se pudo cruzar: no se sabe cuál es la de la base
    const sueltas = vivas.filter(function (o) { return !o.filaBase; });
    if (sueltas.length) {
      d.decision = 'par_ambiguo';
      d.motivo = 'RDV CONJUNTO tiene la misma figura ese día en ' + lineas(sueltas) + ' y esa fila no se pudo cruzar (' +
                 sueltas.map(function (o) { return o.motivoSinFila; }).join(' / ') + '): no se sabe cuál es la de la base, no se suspende';
      return;
    }
    // 16/10 (revisor, ALTA): el lugar de la fila "Cancelado" contradice el de la base (con un solo candidato el cruce acepta igual):
    // puede ser OTRA reunión de la figura (la de la base todavía sin su fila en RDV CONJUNTO): no se suspende, se avisa
    const desac = canc.filter(function (c) { return c.bar && _ubicConjuntoFila_(c.bar, f, comunas) === false; });
    if (desac.length) {
      d.decision = 'ubicacion_difiere'; d.aviso = true;
      d.motivo = 'RDV CONJUNTO dice ' + desac.map(function (c) { return c.bar; }).join(' / ') + ' y la fila de la base está en ' +
                 (f.barrio || 'sin barrio') + ': puede ser otra reunión de la figura, no se suspende';
      return;
    }
    // 16/10 (revisor, MEDIA): la fila de la base es una CONJUNTA y en RDV CONJUNTO se bajó UNA sola de sus figuras: no se suspende
    const iConj = D['Conjunta con'];
    if (iConj != null && !esVacio_(f.valores[iConj]) && canc.every(function (c) { return !!c.figura; })) {
      d.decision = 'conjunta_parcial'; d.aviso = true;
      d.motivo = 'la fila de la base es una conjunta (con ' + str(f.valores[iConj]) + ') y RDV CONJUNTO cancela sólo a ' +
                 canc.map(function (c) { return c.figura; }).join(' / ') + ': no se suspende la reunión entera';
      return;
    }
    // 3. la fila de la base
    const stTxt = iSt != null ? str(f.valores[iSt]) : '', st = normStatus_(stTxt);
    const asisBase = iAsD != null ? f.valores[iAsD] : '';
    if (st === 'suspendida') { d.decision = 'ya_suspendida'; d.motivo = 'la fila ya está "' + stTxt + '"'; return; }
    if (st !== 'en agenda') {
      d.decision = 'otro_status'; d.aviso = true;
      d.motivo = 'la fila está "' + (stTxt || 'sin STATUS') + '"' + _datosFilaTextoAgenda_(dest, f) + ': el equipo le puso otro STATUS, no se toca';
      return;
    }
    if (_hayDatoAgenda_(asisBase) || canc.some(function (c) { return c.asis > 0; })) {
      d.decision = 'datos'; d.aviso = true;
      d.motivo = 'la fila está "en agenda" pero tiene asistentes (' + (_hayDatoAgenda_(asisBase) ? 'la base: ' + str(asisBase) : 'RDV CONJUNTO: ' +
                 canc.filter(function (c) { return c.asis > 0; }).map(function (c) { return c.asis; }).join(' / ')) + '): se contradice con "Cancelado", no se toca';
      return;
    }
    d.decision = 'suspender';
    d.motivo = 'Cancelado en ' + lineas(canc);
  });
  return out;
}
