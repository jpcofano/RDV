/**
 * 53_HechasSinFila.js — "UNA REUNIÓN QUE SE HIZO Y NO ESTÁ EN LA BASE": SÓLO AVISO (19/10, PROMPT-08 punto 4;
 * AGENDA_AVISO_HECHAS_SIN_FILA, APAGADO hasta ver el paso 104).
 *
 * El caso: Macri 15/10/2026. El 1 a 1 de Villa Santa Rita se suspendió (rojo en el mail) y se hizo otro en Villa Devoto, que
 * nunca estuvo en el mail. RDV CONJUNTO tiene las dos (843 Villa Santa Rita "Cancelado"; 849 Villa Devoto "Realizada", 31
 * asistentes, Bahía Blanca 4025). Si la base tuviera sólo la fila de Villa Santa Rita (Suspendida), la 849 sería una reunión que
 * se hizo y no tiene fila: nadie la ve, los asistentes no se escriben en ningún lado y el tablero no la cuenta.
 *
 * **Nunca crea filas ni escribe la base** (ni RDV CONJUNTO, que sólo se lee: CLAUDE.md sección 1, regla dura). Calcula, en
 * memoria, qué filas de RDV CONJUNTO son una reunión hecha sin fila; la agenda (40_Agenda.js, `planAgenda_`, con el interruptor)
 * las pone en AGENDA_PENDIENTES (intermedia) y en el aviso diario 'agenda_info', una vez cada una, con todos los datos para que
 * la cargue el equipo. La medición en seco: diagnostico/37_hechas_sin_fila.js (paso 104).
 *
 * **El cruce es el de los Asistentes** (`cruzarAsistentes_`, 20_UpsertDestino.js): figura por tokens + fecha; una fila conjunta
 * por su conjunto de figuras; con 2+ filas de la figura ese día, la dirección y después el barrio o la comuna. No se reimplementa:
 * se usa lo que dejó anotado (`noEncuentran`, `parDe`, `ambiguas`). El mismo criterio que los Asistentes, a propósito: si los
 * Asistentes de una fila de RDV CONJUNTO tienen dónde ir, la reunión está en la base.
 *
 * Una fila de RDV CONJUNTO es "hecha sin fila" si (todo junto):
 *   - su Estado es "Realizada" (/^realizad/) o tiene asistentes > 0, y NO es "Cancelado" (`esCanceladoConjunto_`);
 *   - no es "No aplica" (los Asistentes las ignoran) y su fecha está en [desde, hasta) — en la agenda, desde hoy − DIAS_ACTIVOS y
 *     sólo las que YA PASARON (antes de hoy: el día de la reunión el equipo todavía la puede estar cargando);
 *   - y, por el cruce:
 *       'sin_fila' — la base no tiene ninguna fila de esa figura ese día (`noEncuentran`). Salvo que la base tenga ese día una
 *                    fila SIN figura con la misma ubicación o la misma dirección (una Seguridad en tu Barrio a la que todavía no
 *                    se le puso la figura) o una CONJUNTA donde participa esa figura: ahí la reunión probablemente está, y no se
 *                    avisa (se cuenta aparte);
 *       'solo_suspendida_otro_barrio' — TODAS las filas de la base de esa figura ese día (en general, una) están "Suspendida" y
 *                    en OTRA ubicación (`_ubicConjuntoFila_` === false: desacuerdo, no "no se puede comparar"). Es el caso Macri
 *                    15/10: la Suspendida es la reunión cancelada, y la que se hizo no tiene fila.
 *   Una fila de RDV CONJUNTO sin figura reconocible (ninguna o varias por tokens, y no es una conjunta de la base) no se puede
 *   afirmar que falte: no se avisa (se cuenta aparte).
 *
 * Lo que se avisa trae las filas de la base de esa figura a ±TOLERANCIA_REPROGRAMACION_DIAS días (`cercanas`): una fecha corrida de
 * un lado o del otro también hace que la reunión "no esté", y el equipo lo tiene que ver para decidir.
 */

/**
 * **Las reuniones que se hicieron y no están en la base** (función pura: no lee ni escribe ninguna planilla).
 *   dest     = `leerDestino_()` (las filas de la base);
 *   conjunto = un `cruzarAsistentes_(dest, comunas)` ya hecho (sus `valores` son RDV CONJUNTO entero, con el encabezado);
 *   comunas  = `leerComunasMap_()`;
 *   opciones = { desde: Date (incluida), hasta: Date (EXCLUIDA; por defecto hoy: sólo las que ya pasaron),
 *                statusDe: function (f) → el STATUS de la fila después de lo que la corrida va a escribir (la agenda; si no, el
 *                de la base), excluir: Set de 'figura normalizada|yyyyMMdd' (lo que la agenda CREA o MUEVE en esta corrida; '*|yyyyMMdd':
 *                crea una fila SIN figura ese día, que puede ser la de cualquiera: un 'sin_fila' de ese día no se avisa) }.
 * Devuelve { error, nombreEst, comoEst, lista: [ { id, conjuntoFila, otrasFilas, nombre, figura, fecha, barrio, direccion, estado,
 *            asistentes, oradores: { col: valor }, motivo, candidatas: [ { fila, figura, barrio, fecha, status, direccion } ],
 *            cercanas: [ … igual … ], texto } ], cuenta: { … } }.
 */
function reunionesHechasSinFila_(dest, conjunto, comunas, opciones) {
  opciones = opciones || {};
  const out = { error: '', nombreEst: '', comoEst: '', lista: [],
                cuenta: { hechas: 0, conFila: 0, sinFila: 0, soloSuspendida: 0, filaSinFigura: 0, enConjunta: 0, sinFigura: 0,
                          fueraDeFecha: 0, noAplica: 0, excluidas: 0, repetidas: 0 } };
  if (!conjunto) { out.error = 'falta el cruce de RDV CONJUNTO'; return out; }
  if (conjunto.error) { out.error = conjunto.error; return out; }
  const vals = conjunto.valores || [];
  if (vals.length < 2) return out;
  const hdr = vals[0];
  const iFig = conjunto.iFig, iAsi = conjunto.iAsi;
  const iBar = findIdxOr_(hdr, ['barrion', 'barrio'], true);
  const iFec = findIdxOr_(hdr, ['fecha', 'fecha (fecha)', 'fecha_evento', 'fecha reunion', 'fecha reunión', 'fecha_reunion', 'fecha_reunión', 'fecha evento'], true);
  const iDir = findIdxOr_(hdr, ['direccion', 'dirección'], true);
  const iOr = conjunto.iOradores || [];
  // el Estado, como lo lee la cancelación por RDV CONJUNTO (53_CancelacionConjunto.js); sin columna de estado, sólo los asistentes
  const est = columnaEstadoConjunto_(hdr, vals, [iFig, iBar, iFec, iDir, iAsi].filter(function (x) { return x != null; }));
  out.nombreEst = est.i != null ? str(hdr[est.i]) : ''; out.comoEst = est.i != null ? est.como : 'sin columna de estado: sólo cuentan los asistentes';
  const desde = opciones.desde ? ymd_(opciones.desde) : '';
  const hasta = ymd_(opciones.hasta || hoyMediodia_());
  const D = dest.D || {};
  const iSt = D['STATUS REUNIÓN'];
  const iDirD = findIdxOr_(dest.hdr || [], ['direccion', 'dirección'], true);
  const statusDe = typeof opciones.statusDe === 'function' ? opciones.statusDe
    : function (f) { return iSt != null ? str(f.valores[iSt]) : ''; };
  const excluir = opciones.excluir || null;
  // los índices de la base: por figura + fecha, por fecha (para las filas sin figura y las conjuntas) y por número de fila
  const porFigFecha = new Map(), porFecha = new Map(), porNumero = new Map();
  dest.filas.forEach(function (f) {
    porNumero.set(f.fila, f);
    if (!f.fecha) return;
    const k = normalizeText_(f.figura) + '|' + ymd_(f.fecha);
    if (!porFigFecha.has(k)) porFigFecha.set(k, []);
    porFigFecha.get(k).push(f);
    const kf = ymd_(f.fecha);
    if (!porFecha.has(kf)) porFecha.set(kf, []);
    porFecha.get(kf).push(f);
  });
  const resumenFila = function (f) {
    return { fila: f.fila, figura: f.figura || '', barrio: f.barrio || '', fecha: f.fecha || null, status: statusDe(f),
             direccion: iDirD != null ? str(f.valores[iDirD]) : '' };
  };
  const noEnc = new Map(), amb = new Map();
  (conjunto.noEncuentran || []).forEach(function (x) { noEnc.set(x.fila, x); });
  (conjunto.ambiguas || []).forEach(function (x) { amb.set(x.filaConjunto, x); });
  const porId = new Map();
  for (let i = 1; i < vals.length; i++) {
    const row = vals[i];
    if (row.every(function (v) { return esVacio_(v); })) continue;
    const estado = est.i != null ? str(row[est.i]) : '';
    if (est.i != null && esCanceladoConjunto_(estado)) continue;
    const asis = iAsi != null ? num(row[iAsi]) : '';
    const realizada = /^realizad/.test(normalizeText_(estado));
    if (!realizada && !(asis > 0)) continue;
    const fec = iFec != null ? toDate_(row[iFec]) : null;
    if (!fec || (desde && ymd_(fec) < desde) || ymd_(fec) >= hasta) { out.cuenta.fueraDeFecha++; continue; }
    // "No aplica": los Asistentes la ignoran; acá también (el mismo criterio)
    if (row.some(function (v) { return normalizeText_(v) === 'no aplica'; })) { out.cuenta.noAplica++; continue; }
    out.cuenta.hechas++;
    const nombre = str(row[iFig]), bar = iBar != null ? str(row[iBar]) : '', dir = iDir != null ? str(row[iDir]) : '';
    const fp = figuraPorTokens_(nombre);
    let motivo = '', figura = fp.figura || '', candidatas = [];
    if (noEnc.has(i + 1)) {
      figura = noEnc.get(i + 1).figura || figura;
      const kf = normalizeText_(figura);
      const delDia = porFecha.get(ymd_(fec)) || [];
      // una fila de ese día SIN figura con la misma ubicación o la misma dirección: probablemente es ésta (le falta la figura)
      const sinFig = delDia.filter(function (f) {
        if (f.figura) return false;
        if (bar && _ubicConjuntoFila_(bar, f, comunas) === true) return true;
        return !!(dir && iDirD != null && compararDirecciones_(dir, f.valores[iDirD]) === 'exacta');
      });
      if (sinFig.length) { out.cuenta.filaSinFigura++; continue; }
      // una CONJUNTA de ese día donde participa la figura: la reunión está (la fila es de otra figura)
      const enConj = delDia.filter(function (f) { return f.figurasConjunta && f.figurasConjunta.indexOf(kf) >= 0; });
      if (enConj.length) { out.cuenta.enConjunta++; continue; }
      motivo = 'sin_fila';
    } else if ((conjunto.parDe && conjunto.parDe.has(i + 1)) || amb.has(i + 1)) {
      const fb = conjunto.parDe && conjunto.parDe.get(i + 1);
      const f0 = fb ? porNumero.get(fb) : null;
      if (fp.figura) candidatas = porFigFecha.get(normalizeText_(fp.figura) + '|' + ymd_(fec)) || [];
      else if (f0) candidatas = [f0];                                     // una fila conjunta (varias figuras)
      else candidatas = (amb.get(i + 1).nums || []).map(function (n) { return porNumero.get(n); }).filter(Boolean);
      if (!figura && f0) figura = f0.figura;
      const todasSuspOtroLugar = candidatas.length > 0 && candidatas.every(function (f) {
        return normStatus_(statusDe(f)) === 'suspendida' && !!bar && _ubicConjuntoFila_(bar, f, comunas) === false;
      });
      if (!todasSuspOtroLugar) { out.cuenta.conFila++; continue; }
      motivo = 'solo_suspendida_otro_barrio';
    } else {
      // sin figura reconocible, o anterior a la primera fila de la base: no se puede decir que falte
      out.cuenta.sinFigura++;
      continue;
    }
    const clave = normalizeText_(figura) + '|' + ymd_(fec);
    if (excluir && (excluir.has(clave) || (motivo === 'sin_fila' && excluir.has('*|' + ymd_(fec))))) { out.cuenta.excluidas++; continue; }
    const id = 'hecha_sin_fila|' + normalizeText_(figura) + '|' + ymd_(fec) + '|' + normalizeText_(bar);
    if (porId.has(id)) { porId.get(id).otrasFilas.push(i + 1); out.cuenta.repetidas++; continue; }
    const oradores = {};
    COLUMNAS_ORADORES.forEach(function (n, j) { if (iOr[j] != null && !esVacio_(row[iOr[j]])) oradores[n] = row[iOr[j]]; });
    // las filas de la figura a ±TOLERANCIA_REPROGRAMACION_DIAS días (otro día): una fecha corrida también hace que "no esté"
    const cercanas = [];
    dest.filas.forEach(function (f) {
      if (!f.fecha || normalizeText_(f.figura) !== normalizeText_(figura) || ymd_(f.fecha) === ymd_(fec)) return;
      if (Math.abs(diasEntre_(f.fecha, fec)) <= TOLERANCIA_REPROGRAMACION_DIAS) cercanas.push(resumenFila(f));
    });
    const h = { id: id, conjuntoFila: i + 1, otrasFilas: [], nombre: nombre, figura: figura, fecha: fec, barrio: bar, direccion: dir,
                estado: estado, asistentes: asis > 0 ? asis : 0, oradores: oradores, motivo: motivo,
                candidatas: candidatas.map(resumenFila), cercanas: cercanas, texto: '' };
    h.texto = textoHechaSinFila_(h);
    porId.set(id, h);
    out.lista.push(h);
    if (motivo === 'sin_fila') out.cuenta.sinFila++; else out.cuenta.soloSuspendida++;
  }
  out.lista.sort(function (a, b) { return (a.fecha - b.fecha) || a.figura.localeCompare(b.figura) || (a.conjuntoFila - b.conjuntoFila); });
  return out;
}

/** Una fila de la base, en pocas palabras: 'fila 824 (Villa Santa Rita, "Suspendida", 15/10/2026)'. */
function _textoFilaBaseHecha_(c) {
  return 'fila ' + c.fila + ' (' + (c.barrio || 'sin barrio') + ', "' + (c.status || 'sin STATUS') + '"' + (c.fecha ? ', ' + fmtFecha_(c.fecha) : '') + ')';
}

/** Lo que hay que decir de una reunión hecha sin fila, con todos los datos para cargarla. */
function textoHechaSinFila_(h) {
  const datos = [h.figura || '(sin figura)', fmtFecha_(h.fecha), h.barrio || 'sin barrio', h.direccion || 'sin dirección',
                 '"' + (h.estado || 'sin estado') + '"' + (h.asistentes > 0 ? ', ' + h.asistentes + ' asistentes' : '')];
  const or = Object.keys(h.oradores || {}).map(function (n) { return n + ' ' + h.oradores[n]; });
  let t = 'RDV CONJUNTO fila ' + h.conjuntoFila + (h.otrasFilas && h.otrasFilas.length ? ' (y ' + h.otrasFilas.join(', ') + ')' : '') + ': ' +
          datos.join(' | ') + (or.length ? ' | ' + or.join(', ') : '');
  if (h.motivo === 'sin_fila') t += ' — la base no tiene ninguna fila de ' + (h.figura || 'esa figura') + ' ese día';
  else t += ' — la base sólo tiene ' + h.candidatas.map(_textoFilaBaseHecha_).join(' / ') + ': es la reunión suspendida, en otro lugar; la que se hizo no tiene fila';
  if (h.cercanas && h.cercanas.length) t += ' (ojo: la base tiene ' + h.cercanas.map(_textoFilaBaseHecha_).join(' / ') + ' a pocos días: ¿la fecha está corrida?)';
  return t;
}
