/**
 * diagnostico/23_fichas_cercanas.js — PASO 52 (08/10). SÓLO LECTURA: no escribe en ninguna planilla.
 *
 * Las fichas del 08/10 (FICHAS_0810_ACTIVAS, 00_Config.js), antes de prenderlas: "esperando formulario" y las opciones
 * cercanas. Con las mismas entradas (el destino y B leídos una vez) arma las fichas de hoy dos veces —con las dos reglas
 * apagadas y prendidas, en memoria— y lista:
 *
 *   1. ESCRITURA: las celdas que escribiría la corrida en cada fila activa (`celdasDeDecision_`, la misma función que
 *      usa la escritura), con y sin las reglas. Tiene que dar 0 diferencias: las reglas cambian sólo las fichas;
 *   2. las fichas que SALEN (esperando formulario): días desde la reunión, el motivo que tenían y, si hay un formulario
 *      de su figura a ±3 días que ya tiene otra fila, cuál (por eso no cuenta);
 *   3. las fichas que ENTRAN (las futuras con un formulario libre cerca que no alcanza: antes del 08/10, toda futura sin
 *      match quedaba afuera);
 *   4. las fichas que siguen con OTRAS OPCIONES: las que salen (y por qué), las que entran, y las que quedan sin ninguna
 *      ("No hay formulario cercano", con su "¿por qué?");
 *   5. el resumen, y de qué son las opciones que quedan (de la figura / sin figura / de otra figura; ya usadas por otra
 *      fila a ±3).
 */
function medirFichasCercanas() {
  const t0 = new Date();
  Logger.log('=== medirFichasCercanas (paso 52) — SÓLO LECTURA: no escribe nada ===');
  Logger.log('  FICHAS_0810_ACTIVAS = %s en 00_Config.js; acá se arman las fichas con las dos reglas APAGADAS y PRENDIDAS, ' +
             'en memoria', FICHAS_0810_ACTIVAS);
  Logger.log('  esperando formulario: hasta %s días después de la reunión (o futura), sin formulario libre a ±%s | opciones: ' +
             '±%s días; ya usadas por otra fila, sólo a ±%s; nunca de una reunión cerrada', DIAS_ESPERANDO_FORMULARIO,
             TOLERANCIA_REPROGRAMACION_DIAS, DIAS_OPCIONES_FICHA, DIAS_OPCION_USADA);
  Logger.log('  solapa destino (sólo lectura): %s | filas activas: %s', descripcionHojaDestino_(), descActivas_());
  const entradas = { dest: leerDestino_(), cands: leerCandidatos_(), comunas: leerComunasMap_() };
  const asis = cruzarAsistentes_(entradas.dest, entradas.comunas);
  const armar = function (prender) {
    return conFichas0810_(prender, function () {
      const plan = calcularPlan_(true, entradas);
      return { plan: plan, fv: armarFichasFormato_(plan, asis) };
    });
  };
  const A = armar(false), B = armar(true);
  const out = _compararFichas_diag23(entradas, asis, A, B);
  _logFichasCercanas_diag23(out);
  Logger.log('  tiempo de corrida: %s s', ((new Date() - t0) / 1000).toFixed(1));
  return out;
}

/** La comparación, sin loguear (la usan el paso y los tests). */
function _compararFichas_diag23(entradas, asis, A, B) {
  const dest = entradas.dest, vivos = entradas.cands.vivos, comunas = entradas.comunas;
  const out = { escrituraDistinta: [], salen: [], entran: [], cambian: [], sinOpciones: [], fichasA: A.fv.pendientes.length,
                fichasB: B.fv.pendientes.length, quitadas: {}, tipos: { figura: 0, sinFigura: 0, otraFigura: 0 },
                usadasCerca: 0, otraFiguraUsada: 0 };

  // 1. La escritura: las mismas celdas en cada fila activa.
  const decA = decisionesPorFila_(A.plan.decisiones), decB = decisionesPorFila_(B.plan.decisiones);
  const celdas = function (dec, f) {
    const x = celdasDeDecision_(dest, decisionDeFila_(f, dec, asis), f.valores, true);
    return JSON.stringify({ c: x.celdas.map(function (k) { return [k.col, k.valor instanceof Date ? ymd_(k.valor) : k.valor]; }),
                            s: !!x.status });
  };
  dest.filas.forEach(function (f) {
    if (!filaQueSeEscribe_(f, false)) return;
    if (celdas(decA, f) !== celdas(decB, f)) out.escrituraDistinta.push(f.fila);
  });

  // De quién es cada grupo de formularios (plan B): para decir qué formulario cercano ya tiene otra fila.
  const duenio = new Map();
  Object.keys(B.plan.porFila).forEach(function (n) {
    const pf = B.plan.porFila[n];
    if (pf.veredicto !== 'escribiria' && pf.veredicto !== 'rdv_uid') return;
    const g = pf.cand ? pf.cand.grupo : pf.grupo;
    if (g && !duenio.has(g)) duenio.set(g, Number(n));
  });
  const porNum = {};
  dest.filas.forEach(function (f) { porNum[f.fila] = f; });

  const mapa = function (fv) { const m = {}; fv.pendientes.forEach(function (p) { m[p.reunion.fila] = p; }); return m; };
  const mA = mapa(A.fv), mB = mapa(B.fv);
  // 2. Las que salen.
  Object.keys(mA).forEach(function (n) {
    if (mB[n]) return;
    const f = porNum[n], pfA = A.plan.porFila[n] || {}, pfB = B.plan.porFila[n] || {};
    const cer = cercanosDeFila_(f, vivos, comunas);
    const propio = cer.conFig || cer.sinFigMisma;
    out.salen.push({ fila: Number(n), figura: f.figura, fecha: f.fecha, dias: diasEntre_(_hoy_(), f.fecha),
                     antes: pfA.motivo || pfA.veredicto || '', ahora: pfB.veredicto || '',
                     cercano: propio ? { nombre: propio.c.nombre, dias: propio.x, de: duenio.get(propio.c.grupo) || null } : null });
  });
  // 3. Las que entran.
  Object.keys(mB).forEach(function (n) {
    if (mA[n]) return;
    const f = porNum[n], pfA = A.plan.porFila[n] || {}, pfB = B.plan.porFila[n] || {};
    out.entran.push({ fila: Number(n), figura: f.figura, fecha: f.fecha, antes: pfA.motivo || pfA.veredicto || '',
                      ahora: pfB.motivo || pfB.veredicto || '', opciones: mB[n].opciones.length });
  });
  // 4. Las que siguen, con otras opciones; y las que quedan sin ninguna.
  const claves = function (p) { return p.opciones.map(function (o) { return o.aux.form_clave; }); };
  Object.keys(mB).forEach(function (n) {
    const b = mB[n], a = mA[n];
    const kb = claves(b);
    if (!kb.length) out.sinOpciones.push({ fila: Number(n), figura: porNum[n].figura, fecha: porNum[n].fecha, porque: b.porque });
    b.excluidas.forEach(function (e) {
      const k = /^está a /.test(e.motivo) ? 'a más de ' + DIAS_OPCIONES_FICHA + ' días'
              : /reunión cerrada/.test(e.motivo) ? 'de una reunión cerrada'
              : /^ya lo tiene/.test(e.motivo) ? 'ya usada por otra fila, a más de ' + DIAS_OPCION_USADA + ' días'
              : e.motivo;
      out.quitadas[k] = (out.quitadas[k] || 0) + 1;
    });
    b.opciones.forEach(function (o) {
      const fig = normalizeText_(porNum[n].figura);
      const c = vivos.find(function (x) { return x.clave === o.aux.form_clave; });
      const tipo = !c ? 'otraFigura' : c.figurasNorm.indexOf(fig) >= 0 ? 'figura' : !c.figurasNorm.length ? 'sinFigura' : 'otraFigura';
      out.tipos[tipo]++;
      if (o.yaUsadoPor) { out.usadasCerca++; if (tipo === 'otraFigura') out.otraFiguraUsada++; }
    });
    if (!a) return;
    const ka = claves(a);
    if (ka.join('|') === kb.join('|')) return;
    const nombre = function (p, k) { const o = p.opciones.find(function (x) { return x.aux.form_clave === k; }); return o ? o.aux.form_nombre : k; };
    out.cambian.push({
      fila: Number(n), figura: porNum[n].figura, fecha: porNum[n].fecha, antes: ka.length, ahora: kb.length,
      salen: ka.filter(function (k) { return kb.indexOf(k) < 0; }).map(function (k) {
        const e = b.excluidas.find(function (x) { return x.clave === k; });
        return { nombre: nombre(a, k), motivo: e ? e.motivo : 'la desplazó otra (orden)' };
      }),
      entran: kb.filter(function (k) { return ka.indexOf(k) < 0; }).map(function (k) { return { nombre: nombre(b, k) }; })
    });
  });
  return out;
}

function _logFichasCercanas_diag23(out) {
  const fecha = function (d) { return d ? fmtFecha_(d) : '(sin fecha)'; };
  const cuando = function (n) { return n === null ? '?' : n < 0 ? 'en ' + (-n) + ' días' : n === 0 ? 'hoy' : 'hace ' + n + ' días'; };
  Logger.log('--- 1. ESCRITURA: filas activas cuyas celdas a escribir cambian con las reglas: %s   (tiene que dar 0) ---',
             out.escrituraDistinta.length);
  if (out.escrituraDistinta.length) Logger.log('  ¡OJO! filas: %s', out.escrituraDistinta.join(', '));
  Logger.log('--- 2. SALEN de las fichas (esperando formulario): %s ---', out.salen.length);
  out.salen.forEach(function (x) {
    Logger.log('  fila %s | %s | %s (%s) | antes: %s%s', x.fila, x.figura, fecha(x.fecha), cuando(x.dias), x.antes,
               x.cercano ? ' | su formulario más cercano, «' + x.cercano.nombre + '» (a ' + x.cercano.dias + ' días), ya lo tiene ' +
                           (x.cercano.de ? 'la fila ' + x.cercano.de : 'otra fila') : ' | ningún formulario de su figura a ±3');
  });
  Logger.log('--- 3. ENTRAN a las fichas: %s   (futuras con un formulario libre cerca que no alcanza) ---', out.entran.length);
  out.entran.forEach(function (x) {
    Logger.log('  fila %s | %s | %s | antes: %s → ahora: %s | %s opción(es)', x.fila, x.figura, fecha(x.fecha), x.antes,
               x.ahora, x.opciones);
  });
  Logger.log('--- 4. siguen, con OTRAS OPCIONES: %s ---', out.cambian.length);
  out.cambian.forEach(function (x) {
    Logger.log('  fila %s | %s | %s | opciones %s → %s', x.fila, x.figura, fecha(x.fecha), x.antes, x.ahora);
    x.salen.forEach(function (o) { Logger.log('      sale «%s»: %s', o.nombre, o.motivo); });
    x.entran.forEach(function (o) { Logger.log('      entra «%s»', o.nombre); });
  });
  Logger.log('  sin ninguna opción ("No hay formulario cercano"; ELEGIR sólo con Ninguno / No sé): %s', out.sinOpciones.length);
  out.sinOpciones.forEach(function (x) {
    Logger.log('  fila %s | %s | %s | ¿por qué?: %s', x.fila, x.figura, fecha(x.fecha), x.porque);
  });
  Logger.log('--- 5. RESUMEN ---');
  Logger.log('  fichas: %s → %s (salen %s, entran %s) | con otras opciones: %s | sin ninguna opción: %s', out.fichasA,
             out.fichasB, out.salen.length, out.entran.length, out.cambian.length, out.sinOpciones.length);
  Logger.log('  opciones que no se ofrecen, por qué: %s', Object.keys(out.quitadas).map(function (k) {
    return k + ' ' + out.quitadas[k];
  }).join(' | ') || 'ninguna');
  Logger.log('  las opciones que quedan: de la figura %s | sin figura %s | de otra figura %s; ya usadas por otra fila (a ±%s) %s, ' +
             'de ellas de otra figura %s', out.tipos.figura, out.tipos.sinFigura, out.tipos.otraFigura, DIAS_OPCION_USADA,
             out.usadasCerca, out.otraFiguraUsada);
  Logger.log('  >>> Si está bien: FICHAS_0810_ACTIVAS = true + clasp push (la próxima corrida de la hora regenera las fichas).');
}
