/**
 * diagnostico/36_cancelaciones_conjunto.js — RDV CONJUNTO como TERCERA fuente de cancelación, EN SECO (16/10; paso 95).
 *
 * SÓLO LECTURA: lee la base ("RVD JM-CM - ES"), Comunas y RDV CONJUNTO; no escribe ninguna celda, no crea solapas, no guarda
 * propiedades, no manda mails. Todo va al log (y se devuelve un resumen).
 *
 * Para cada fila de RDV CONJUNTO con Estado "Cancelado" (/cancel/) desde `opciones.desde` (por defecto el 15/07/2026):
 *   - a qué fila de la base va (el MISMO cruce que los Asistentes, `cruzarAsistentes_`), o por qué ninguna;
 *   - el STATUS de esa fila: "Suspendida" = COINCIDE; "Realizada" = NO COINCIDE (con sus asistentes); "en agenda" = la regla la
 *     suspendería (si ninguna salvaguarda la frena); otro = se lista;
 *   - qué haría la regla (`cancelacionesConjunto_`, 53_CancelacionConjunto.js) y si la fila está dentro del alcance de la agenda
 *     (la corrida de la hora sólo mira ésas);
 * y aparte los PARES: la misma figura el mismo día con una fila "Cancelado" y otra no (el caso Macri 15/10: Villa Santa Rita
 * "Cancelado" y Villa Devoto "Realizada"), con lo que hace la regla. Al final, el resumen.
 *
 *     medirCancelacionesConjunto({ desde: '2026-07-15' })
 */
function medirCancelacionesConjunto(opciones) {
  opciones = opciones || {};
  const t0 = Date.now();
  const desde = toDate_(opciones.desde || '2026-07-15');
  Logger.log('=== RDV CONJUNTO como fuente de cancelación — EN SECO, sólo lectura (desde el %s; interruptor AGENDA_CANCELACION_CONJUNTO = %s) ===',
             fmtFecha_(desde), AGENDA_CANCELACION_CONJUNTO);
  const dest = opciones.dest || leerDestino_();
  const comunas = opciones.comunas || leerComunasMap_();
  const cc = cancelacionesConjunto_(dest, comunas, opciones.cruce ? { cruce: opciones.cruce } : undefined);
  const R = { error: cc.error || '', columnaEstado: cc.nombreEst, canceladas: 0, coincide: 0, noCoincide: 0, seSuspenderia: 0, otroStatus: 0,
              sinFila: 0, pares: 0, paresQueNoSuspenden: 0, decisiones: {}, lineas: [] };
  if (cc.error) { Logger.log('>>> %s. No se puede medir.', cc.error); return R; }
  Logger.log('  columna de estado de RDV CONJUNTO: "%s" (%s) | valores: %s', cc.nombreEst, cc.comoEst,
             Object.keys(cc.estados).map(function (k) { return k + ' ' + cc.estados[k]; }).join(' · '));
  const alcance = alcanceAgenda_();
  // el historial de la agenda (sólo lectura): una fila que ya suspendió RDV CONJUNTO y el equipo volvió atrás no se re-suspende
  const hist = opciones.historial || leerHistorialAgenda_();
  const iUid = findIdxOr_(dest.hdr, ['agenda_uid'], true);
  const D = dest.D || {};
  const iSt = D['STATUS REUNIÓN'], iAs = D['Asistentes'];
  const enPeriodo = function (c) { return c.fecha && ymd_(c.fecha) >= ymd_(desde); };
  // la decisión de cada fila "Cancelado" (por fila de RDV CONJUNTO)
  const decisionDe = new Map();
  cc.decisiones.forEach(function (d) { d.conjunto.forEach(function (c) { decisionDe.set(c.fila, d); }); });
  const textoDecision = {
    suspender: 'SE SUSPENDERÍA', ya_suspendida: 'nada (ya Suspendida)', otro_status: 'NO se toca (otro STATUS) + aviso',
    datos: 'NO se toca (asistentes cargados) + aviso', misma_fila_viva: 'NO se suspende (la fila de la base es la no cancelada)',
    par_ambiguo: 'NO se suspende (la otra fila de ese día no se cruzó: ambiguo)', sin_fila: 'nada (sin fila en la base)'
  };
  Logger.log('--- las filas "Cancelado" de RDV CONJUNTO desde el %s ---', fmtFecha_(desde));
  cc.filas.filter(function (c) { return c.cancelado && enPeriodo(c); }).sort(function (a, b) { return (a.fecha - b.fecha) || (a.fila - b.fila); }).forEach(function (c) {
    R.canceladas++;
    const d = decisionDe.get(c.fila) || { decision: 'sin_fila', motivo: c.motivoSinFila };
    R.decisiones[d.decision] = (R.decisiones[d.decision] || 0) + 1;
    let veredicto;
    if (!c.f) { veredicto = 'SIN FILA'; R.sinFila++; }
    else {
      const st = normStatus_(iSt != null ? c.f.valores[iSt] : '');
      if (st === 'suspendida') { veredicto = 'COINCIDE (Suspendida)'; R.coincide++; }
      else if (st === 'realizada') {
        veredicto = 'NO COINCIDE (Realizada' + (iAs != null && !esVacio_(c.f.valores[iAs]) ? ', asistentes ' + str(c.f.valores[iAs]) : ', sin asistentes') + ')';
        R.noCoincide++;
      } else if (st === 'en agenda') {
        const vuelta = d.decision === 'suspender' && iUid != null && hist && hist.suspendidasConjunto && hist.suspendidasConjunto.has(str(c.f.valores[iUid]));
        if (vuelta) veredicto = 'en agenda (ya la suspendió RDV CONJUNTO y el equipo la volvió atrás: no se vuelve a suspender)';
        else { veredicto = d.decision === 'suspender' ? 'SE SUSPENDERÍA (en agenda)' : 'en agenda (no se suspende: ver la regla)'; if (d.decision === 'suspender') R.seSuspenderia++; }
      }
      else { veredicto = 'OTRO STATUS ("' + str(c.f.valores[iSt]) + '")'; R.otroStatus++; }
    }
    const fuera = c.f && c.f.fecha && !_enAlcance_(alcance, c.f.fecha) ? ' | (fuera del alcance de la agenda: la corrida de la hora no la mira)' : '';
    const linea = '[' + veredicto + '] ' + textoFilaConjunto_(c) + ' | ' + c.nombre + ' | ' + fmtFecha_(c.fecha) + ' | base: ' +
                  (c.f ? 'fila ' + c.f.fila + ' (' + (c.f.figura || 'sin figura') + ', ' + (c.f.barrio || 'sin barrio') + ', "' + str(iSt != null ? c.f.valores[iSt] : '') + '")'
                       : '— (' + c.motivoSinFila + ')') +
                  ' | la regla: ' + (textoDecision[d.decision] || d.decision) + (d.motivo && d.decision !== 'sin_fila' ? ' — ' + d.motivo : '') + fuera;
    R.lineas.push(linea);
    Logger.log('  %s', linea);
  });
  Logger.log('--- los PARES: la misma figura el mismo día, una fila "Cancelado" y otra no (el caso Macri 15/10) ---');
  cc.pares.filter(function (p) { return p.canceladas.concat(p.vivas).some(enPeriodo); }).forEach(function (p) {
    R.pares++;
    const ds = p.canceladas.map(function (c) { return decisionDe.get(c.fila); }).filter(Boolean);
    const suspende = ds.some(function (d) { return d.decision === 'suspender'; });
    if (!suspende) R.paresQueNoSuspenden++;
    Logger.log('  PAR | %s | canceladas: %s → base %s | no canceladas: %s → base %s | la regla: %s',
               fmtFecha_(p.canceladas[0].fecha), p.canceladas.map(textoFilaConjunto_).join(' / '),
               p.canceladas.map(function (c) { return c.filaBase || '—'; }).join(' / '), p.vivas.map(textoFilaConjunto_).join(' / '),
               p.vivas.map(function (c) { return c.filaBase || '— (' + c.motivoSinFila + ')'; }).join(' / '),
               ds.map(function (d) { return textoDecision[d.decision] || d.decision; }).join(' / ') || 'nada (sin fila en la base)');
  });
  Logger.log('--- RESUMEN (desde el %s) --- filas "Cancelado": %s | COINCIDE (ya Suspendida) %s | NO COINCIDE (Realizada) %s | ' +
             'SE SUSPENDERÍA %s | otro STATUS %s | sin fila en la base %s | pares Cancelado + no cancelado %s (no suspenden %s) | ' +
             'por decisión: %s | %s ms', fmtFecha_(desde), R.canceladas, R.coincide, R.noCoincide, R.seSuspenderia, R.otroStatus, R.sinFila,
             R.pares, R.paresQueNoSuspenden, Object.keys(R.decisiones).map(function (k) { return k + ' ' + R.decisiones[k]; }).join(' · ') || '—',
             Date.now() - t0);
  if (!AGENDA_CANCELACION_CONJUNTO) Logger.log('  (el interruptor está APAGADO: la corrida de la hora no hace nada de esto; además pide la cancelación automática en modo "suspender")');
  return R;
}
