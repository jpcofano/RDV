/**
 * diagnostico/37_hechas_sin_fila.js — "una reunión que se hizo y no está en la base", EN SECO (19/10; paso 104; PROMPT-08 punto 4).
 *
 * SÓLO LECTURA: lee la base ("RVD JM-CM - ES"), Comunas y RDV CONJUNTO; no escribe ninguna celda, no crea solapas, no guarda
 * propiedades, no manda mails. Todo va al log (y se devuelve un resumen).
 *
 * Con la MISMA regla que el aviso de la agenda (`reunionesHechasSinFila_`, 53_HechasSinFila.js; AGENDA_AVISO_HECHAS_SIN_FILA) y el
 * mismo cruce que los Asistentes (`cruzarAsistentes_`), desde `desde` (por defecto el 15/07/2026) hasta ayer: cuántas filas de RDV
 * CONJUNTO "Realizada" o con asistentes no tienen fila en la base (o sólo una Suspendida en otro lugar), y cuáles, una por línea,
 * con fecha, figura, barrio, dirección, asistentes, el motivo y las filas candidatas de la base. Dice también cuáles caen dentro
 * del alcance de la agenda (hoy − DIAS_ACTIVOS): sólo ésas avisaría la corrida de la hora.
 *
 *     medirHechasSinFila('2026-07-15')
 */
function medirHechasSinFila(desde, opciones) {
  opciones = opciones || {};
  const t0 = Date.now();
  const d0 = toDate_(desde || '2026-07-15');
  Logger.log('=== "se hizo y no está en la base" — EN SECO, sólo lectura (desde el %s hasta ayer; interruptor AGENDA_AVISO_HECHAS_SIN_FILA = %s) ===',
             fmtFecha_(d0), AGENDA_AVISO_HECHAS_SIN_FILA);
  const dest = opciones.dest || leerDestino_();
  const comunas = opciones.comunas || leerComunasMap_();
  const cruce = opciones.cruce || cruzarAsistentes_(dest, comunas);
  const hs = reunionesHechasSinFila_(dest, cruce, comunas, { desde: d0, hasta: hoyMediodia_() });
  const R = { error: hs.error || '', total: 0, sinFila: 0, soloSuspendida: 0, enAlcance: 0, conCercana: 0, cuenta: hs.cuenta, lineas: [] };
  if (hs.error) { Logger.log('>>> %s. No se puede medir.', hs.error); return R; }
  Logger.log('  columna de estado de RDV CONJUNTO: "%s" (%s)', hs.nombreEst || '—', hs.comoEst || '—');
  const alcance = alcanceAgenda_();
  const motivoTxt = { sin_fila: 'SIN FILA (la base no tiene ninguna fila de esa figura ese día)',
                      solo_suspendida_otro_barrio: 'SÓLO UNA SUSPENDIDA EN OTRO LUGAR' };
  Logger.log('--- una por línea (fecha | figura | barrio | dirección | estado y asistentes | motivo | filas candidatas de la base) ---');
  hs.lista.forEach(function (h) {
    R.total++;
    if (h.motivo === 'sin_fila') R.sinFila++; else R.soloSuspendida++;
    const dentro = _enAlcance_(alcance, h.fecha);
    if (dentro) R.enAlcance++;
    if (h.cercanas.length) R.conCercana++;
    const linea = fmtFecha_(h.fecha) + ' | ' + (h.figura || '(sin figura)') + ' | ' + (h.barrio || 'sin barrio') + ' | ' + (h.direccion || 'sin dirección') +
                  ' | "' + (h.estado || 'sin estado') + '", asistentes ' + (h.asistentes || 0) + ' | ' + (motivoTxt[h.motivo] || h.motivo) +
                  ' | candidatas: ' + (h.candidatas.length ? h.candidatas.map(_textoFilaBaseHecha_).join(' / ') : '—') +
                  (h.cercanas.length ? ' | cerca (otro día): ' + h.cercanas.map(_textoFilaBaseHecha_).join(' / ') : '') +
                  ' | RDV CONJUNTO fila ' + h.conjuntoFila + (h.otrasFilas.length ? ' (y ' + h.otrasFilas.join(', ') + ')' : '') + ' ("' + h.nombre + '")' +
                  (dentro ? ' | LA AVISARÍA la corrida de la hora' : ' | (fuera del alcance de la agenda: la corrida de la hora no la avisa)');
    R.lineas.push(linea);
    Logger.log('  %s', linea);
  });
  const c = hs.cuenta;
  Logger.log('--- RESUMEN (desde el %s hasta ayer) --- se hicieron y no están en la base: %s (sin fila %s | sólo una Suspendida en otro lugar %s) | ' +
             'dentro del alcance de la agenda (las avisaría hoy) %s | con una fila de la figura a ±%s días (¿fecha corrida?) %s',
             fmtFecha_(d0), R.total, R.sinFila, R.soloSuspendida, R.enAlcance, TOLERANCIA_REPROGRAMACION_DIAS, R.conCercana);
  Logger.log('  filas de RDV CONJUNTO "Realizada" o con asistentes en el período: %s | con su fila en la base %s | sin figura reconocible (no se ' +
             'puede afirmar) %s | la base tiene ese día una fila sin figura en ese lugar %s | o una conjunta donde participa %s | repetidas %s | ' +
             '"No aplica" (ignoradas, como en los Asistentes) %s | %s ms', c.hechas, c.conFila, c.sinFigura, c.filaSinFigura, c.enConjunta, c.repetidas,
             c.noAplica, Date.now() - t0);
  if (!AGENDA_AVISO_HECHAS_SIN_FILA) Logger.log('  (el interruptor está APAGADO: la corrida de la hora no avisa nada de esto)');
  return R;
}
