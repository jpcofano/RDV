/**
 * 54_FusionAgenda.js — JUNTAR LOS PARES "una reunión en dos filas" que dejó la agenda (16/10; pasos 96 y 97).
 *
 * El caso (bug 832/838, arreglado para adelante en 40_Agenda.js): la v3 del 16/10 11:41 trajo la dirección de dos Seguridad del
 * 22/10 que estaban "A CONFIRMAR", y la agenda CREÓ filas nuevas (838, 839) en vez de actualizar las viejas (832, 834). El
 * invariante H3 (`reunionesRepetidasAgenda_`) las ve ("una reunión en dos filas", AGENDA_DUPLICADOS) y frena esa semana.
 * Decisión del usuario: por cada par, se queda la fila VIEJA, recibe lo de la nueva y la nueva se borra.
 *
 *   fusionarParesAgenda_enSeco(opciones)  (paso 96, SÓLO LECTURA) los pares del H3 que se pueden juntar: las dos filas lado a
 *                                         lado, cuándo se creó cada una (la corrida de su "crear_id"), por qué la regla de hoy
 *                                         las hubiera unido (o no), y qué celdas se copiarían, cuáles se quedan y por qué se
 *                                         rechaza un par. Al final, la HUELLA del plan.
 *   fusionarParesAgenda(opciones)         (paso 97, ESCRIBE la base) con el bloqueo de la corrida de la hora; sólo los pares de
 *                                         `opciones.filas` (obligatorio); recalcula, relee las filas justo antes de escribir y
 *                                         se niega si algo cambió. Deshacer: paso 38, `deshacerAgenda(false, '<corrida>')`.
 *
 * --- Qué fila se queda ---
 * La VIEJA: la que la agenda creó primero (la corrida de su línea "crear_id" en REGISTRO_AGENDA_CAMBIOS; si falta o es la misma
 * corrida, la de número de fila menor). Por qué la vieja y no la nueva: su agenda_uid es el que tiene la historia (crear_id,
 * suspensiones, elecciones, la copia del guardián), no corre ninguna fila al borrarse la otra (la nueva está más abajo: casi
 * siempre al final), y conserva el formato y lo que el equipo cargó en ella, que una copia no podría reproducir sin pintar.
 *
 * --- Qué se copia de la nueva a la vieja (nunca se pisa lo del equipo) ---
 *   - FECHA, HORA, Dirección, Barrio, STATUS (con su agenda_*_escrita): sólo si la celda de la vieja está vacía o todavía tiene
 *     lo que escribió el sistema (= su agenda_*_escrita); se copia el valor y la traza de la nueva. Una celda de la vieja que
 *     no es lo que escribió el sistema es del equipo: se queda. Si la vieja tiene el mail más nuevo (agenda_mail), se queda;
 *   - las columnas del mail (agenda_mail, agenda_version, Evento / Dirección / Marcas (mail), Conjunta con, No participa): las
 *     del mail más nuevo, también si están vacías (sólo las escribe el sistema); "Lugar (mail)" tiene que ser igual (es la identidad del par); Figura y EVENTO, sólo en una celda
 *     vacía de la vieja (Figura distinta en las dos: el par se rechaza); agenda_uid y "Origen fila", los de la vieja; "Tocado
 *     por el equipo" lo recalcula la próxima corrida. Todo esto por la excepción de la agenda (`escribirAgendaLote_`);
 *   - el resto (ID cuentas, RDV_UID, form_*, Inscriptos, Asistentes, canales, …): por la REGLA GENERAL (`setSiDelSistemaLote_`):
 *     sólo en una celda VACÍA de la vieja. Si las dos tienen valores distintos, el par se RECHAZA (lo decide una persona);
 *   - las derivadas no se copian (se recalculan); una columna manual que no es de la agenda tampoco.
 *
 * --- Cómo se borra la nueva ---
 * Por el camino auditado de la agenda (`borrarFilaAgenda_`, sólo una fila "c-…"): antes de escribir nada, la fila entera
 * (valores y fondos) queda en REGISTRO_AGENDA_CAMBIOS ("borrar_fusion"), con una línea "fusionada_sistema"; se borra de abajo
 * hacia arriba, sólo si la vieja quedó con todo lo copiado y la nueva sigue igual (si no, "borrar_cancelado" y queda). Las dos
 * líneas hacen que `leerHistorialAgenda_` la cuente como borrada POR EL SISTEMA (no "borrada por el equipo": la reunión no
 * queda bloqueada). Las líneas del H3 de AGENDA_DUPLICADOS se van solas: la solapa se reescribe entera en cada corrida.
 *
 * --- Deshacer (paso 38) ---
 * Vuelve las celdas de la agenda de la vieja a lo que tenían (si todavía tienen lo copiado), vacía las de la regla general (si
 * todavía tienen lo copiado y el color del sistema: `vaciarCeldasDelSistema_`) y restaura la nueva AL FINAL, con sus valores
 * y sus fondos.
 *
 * `opciones`: `filas` = [[vieja, nueva], …] o [[vieja, nueva, { figura, fecha: 'yyyy-MM-dd', lugar }], …] o
 * [{ vieja, nueva, figura, fecha, lugar }, …]; `huella` (la del paso 96: si el plan cambió, el 97 no escribe); `historial`
 * (los tests).
 */

/** 16/10 (revisor): la huella del último paso 96 (el 97 la exige) y el id de corrida del último paso 97 (el 98 lo deshace). */
const FUSION_PROP_HUELLA = 'FUSION_AGENDA_HUELLA_96';
const FUSION_PROP_CORRIDA = 'FUSION_AGENDA_CORRIDA_97';

/**
 * Paso 98: deshace la ÚLTIMA fusión (la corrida que guardó el paso 97), aunque después hayan corrido otras de la hora: el paso 38
 * sin id deshace la última corrida que escribió, que una hora después ya no es la fusión.
 */
function deshacerUltimaFusionAgenda(enSeco) {
  let id = '';
  try { id = PropertiesService.getScriptProperties().getProperty(FUSION_PROP_CORRIDA) || ''; } catch (e) { id = ''; }
  if (!id) { Logger.log('>>> no hay ninguna fusión guardada (el paso 97 no corrió, o ya se deshizo): no se hace nada.'); return { error: 'sin fusión guardada' }; }
  Logger.log('=== deshacer la fusión de la corrida %s (%s) ===', id, enSeco ? 'EN SECO' : 'REAL');
  const r = deshacerAgenda(!!enSeco, id);
  if (!enSeco) { try { PropertiesService.getScriptProperties().deleteProperty(FUSION_PROP_CORRIDA); } catch (e) { /* el log lo dice */ } }
  return r;
}

/** Paso 96 (SÓLO LECTURA): los pares que se juntarían, y cómo. No escribe nada. */
function fusionarParesAgenda_enSeco(opciones) {
  return _fusionarParesAgenda_(true, opciones || {});
}

/** Paso 97 (REAL): junta los pares de `opciones.filas`, con el bloqueo de la corrida de la hora. */
function fusionarParesAgenda(opciones) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(ESPERA_BLOQUEO_MS)) {
    Logger.log('>>> Hay otra corrida (upsert o agenda) en curso: no se junta nada (LockService).');
    return { error: 'hay otra corrida en curso' };
  }
  try { return _fusionarParesAgenda_(false, opciones || {}); }
  finally { lock.releaseLock(); }
}

function _fusionarParesAgenda_(enSeco, opciones) {
  const t0 = Date.now();
  const paso = enSeco ? 96 : 97;
  Logger.log('=== paso %s: juntar los pares "una reunión en dos filas" de la agenda (%s) — %s ===', paso,
             enSeco ? 'EN SECO, no escribe nada' : 'REAL: escribe la base', descripcionHojaDestino_());
  const fin = function (o) { Logger.log('paso %s: %s ms', paso, Date.now() - t0); return o; };
  const sh = verificarHojaDestino_(ssDestino_());
  const dest = leerDestino_();
  const A = indicesAgenda_(dest.hdr);
  if (A.faltan.length) { Logger.log('>>> faltan columnas de la agenda: %s. No se hace nada.', A.faltan.join(', ')); return fin({ error: 'faltan columnas de la agenda' }); }
  const hist = opciones.historial || _creacionesFusionAgenda_();
  if (hist.error) {
    Logger.log('  AVISO: REGISTRO_AGENDA_CAMBIOS no se pudo leer (%s): la vieja se decide por el número de fila.', hist.error);
    if (!enSeco) { Logger.log('>>> sin el registro no se puede deshacer: NO SE ESCRIBE NADA.'); return fin({ error: 'registro: ' + hist.error }); }
  }
  const plan = planFusionAgenda_(dest, A, hist, opciones);
  _logPlanFusion_(plan, dest, A);
  const out = { huella: plan.huella, pares: plan.pares.map(_resumenParFusion_), rechazados: plan.rechazados.map(_resumenParFusion_),
                faltantes: plan.faltantes.map(function (p) { return [p.vieja, p.nueva]; }) };
  if (enSeco) {
    // 16/10 (revisor): la huella de lo que se mostró, para que el paso 97 se niegue si el plan cambió (una propiedad del script: no
    // es la base)
    try { PropertiesService.getScriptProperties().setProperty(FUSION_PROP_HUELLA, plan.huella); } catch (e) { Logger.log('  (la huella no se pudo guardar: %s)', e); }
    Logger.log('  HUELLA del plan: %s (el paso 97 la exige igual)', plan.huella);
    return fin(out);
  }

  // --- REAL (paso 97) ---
  const no = function (msg) { Logger.log('>>> NO SE ESCRIBE NADA: %s', msg); out.error = msg; return fin(out); };
  if (!plan.pedidos.length) return no('en real hay que decir los pares (opciones.filas = [[vieja, nueva], …]), los que mostró el paso 96');
  if (plan.faltantes.length) return no('estos pares pedidos ya no son "una reunión en dos filas": ' + plan.faltantes.map(function (p) { return p.vieja + '/' + p.nueva; }).join(', '));
  const pedidos = plan.pares.filter(function (p) { return p.pedido; }).concat(plan.rechazados.filter(function (p) { return p.pedido; }));
  const malos = pedidos.filter(function (p) { return p.motivos.length; });
  if (malos.length) return no('un par pedido se rechaza: ' + malos.map(function (p) { return p.vieja.fila + '/' + p.nueva.fila + ' (' + p.motivos.join('; ') + ')'; }).join(' | '));
  // 16/10 (revisor): el plan tiene que ser el mismo que mostró el paso 96 (su huella, guardada en una propiedad del script)
  const huella96 = opciones.huella || (function () { try { return PropertiesService.getScriptProperties().getProperty(FUSION_PROP_HUELLA) || ''; } catch (e) { return ''; } })();
  if (!huella96) return no('primero hay que correr el paso 96 (en seco): el 97 exige que el plan sea el mismo que se vio');
  if (huella96 !== plan.huella) return no('la huella del plan es ' + plan.huella + ' y el paso 96 dio ' + huella96 + ': algo cambió, volver a correr el paso 96');
  const aplicar = plan.pares.filter(function (p) { return p.pedido; });
  if (!aplicar.length) return no('no hay pares para juntar');

  // 1. justo antes de escribir: las filas de nuevo (lectura fresca), iguales a lo que leyó el plan
  const hdr = dest.hdr, nCols = hdr.length;
  const fresca = {};
  let cambio = '';
  aplicar.forEach(function (p) {
    [p.vieja, p.nueva].forEach(function (f) {
      const rg = sh.getRange(f.fila, 1, 1, nCols);
      const v = rg.getValues()[0], bg = rg.getBackgrounds()[0];
      fresca[f.fila] = { v: v, bg: bg };
      const dif = _difFilaFusion_(hdr, f.valores, v);
      if (dif && !cambio) cambio = 'la fila ' + f.fila + ' cambió mientras se calculaba ("' + dif + '")';
    });
  });
  if (cambio) return no(cambio);

  // 2. el registro (obligatorio): las celdas que se copian, la fila que se borra entera y la nota "fusionada_sistema"
  const corrida = _idCorridaAgenda_();
  const cambios = [];
  aplicar.forEach(function (p) {
    const uidV = p.uidVieja, uidN = p.uidNueva;
    p.copiar.forEach(function (c) {
      cambios.push([corrida, c.via === 'agenda' ? 'fusionar' : 'fusionar_general', p.vieja.fila, c.col, hdr[c.col - 1], _celdaRegistro_(c.esperado),
                    _celdaRegistro_(c.valor), fresca[p.vieja.fila].bg[c.col - 1] || '', uidV]);
    });
    cambios.push([corrida, 'borrar_fusion', p.nueva.fila, '', '', JSON.stringify(fresca[p.nueva.fila].v.map(_celdaRegistro_)), '',
                  JSON.stringify(fresca[p.nueva.fila].bg), uidN]);
    cambios.push([corrida, 'fusionada_sistema', p.nueva.fila, '', 'fila ' + p.vieja.fila,
                  'fusionada por el sistema con la fila ' + p.vieja.fila + ' (agenda_uid ' + uidV + ')', p.idReunionNueva || p.clave, '', uidN]);
  });
  const nCeldas = aplicar.reduce(function (a, p) { return a + p.copiar.length; }, 0);
  const Pf = { resumen: {} };
  try { _registrarCorridaAntesDeEscribir_(corrida, Pf, cambios, nCeldas, aplicar.length); }
  catch (err) { return no('no se pudo escribir REGISTRO_AGENDA (' + err + ')'); }

  // 3. las celdas de la vieja: la agenda por su excepción, el resto por la regla general (sólo celda vacía)
  const escA = [], escG = [];
  aplicar.forEach(function (p) {
    p.copiar.forEach(function (c) {
      if (c.via === 'agenda') escA.push({ fila: p.vieja.fila, col: c.col, valor: c.valor, esperado: c.esperado });
      else escG.push({ fila: p.vieja.fila, col: c.col, valor: c.valor, ceroEsVacio: !!c.ceroEsVacio });
    });
  });
  let wA = { hechas: [], saltadas: [] }, wG = [];
  const cancelar = function (p, por) {
    Logger.log('    NO SE BORRA la fila %s (se queda; deshacer con el paso 38 vuelve atrás lo copiado): %s', p.nueva.fila, por);
    try { _anotarCambiosAgenda_([[corrida, 'borrar_cancelado', p.nueva.fila, '', '', por, '', '', p.uidNueva]]); } catch (e) { /* el log lo dice */ }
    p.cancelada = por;
  };
  try {
    if (escA.length) wA = escribirAgendaLote_(sh, hdr, escA);
    if (escG.length) wG = setSiDelSistemaLote_(sh, hdr, escG);
  } catch (err) {
    Logger.log('>>> la copia falló: %s', err && err.message || err);
    aplicar.forEach(function (p) { cancelar(p, 'la copia falló: ' + (err && err.message || err)); });
  }
  SpreadsheetApp.flush();

  // 4. ¿la vieja quedó con TODO lo copiado? si no, la nueva no se borra (no se pierde nada)
  aplicar.forEach(function (p) {
    if (p.cancelada) return;
    const v = sh.getRange(p.vieja.fila, 1, 1, nCols).getValues()[0];
    const falta = p.copiar.filter(function (c) {
      const n = hdr[c.col - 1];
      if (esVacio_(c.valor)) return !esVacio_(v[c.col - 1]);
      return valorAgendaComparable_(v[c.col - 1], n) !== valorAgendaComparable_(c.valor, n);
    });
    if (falta.length) cancelar(p, 'la fila ' + p.vieja.fila + ' no quedó con lo copiado en: ' + falta.map(function (c) { return hdr[c.col - 1]; }).join(', '));
  });

  // 5. los borrados, de abajo hacia arriba, verificando otra vez
  let borradas = 0;
  aplicar.slice().sort(function (x, y) { return y.nueva.fila - x.nueva.fila; }).forEach(function (p) {
    if (p.cancelada) return;
    const v = sh.getRange(p.nueva.fila, 1, 1, nCols).getValues()[0];
    const dif = _difFilaFusion_(hdr, fresca[p.nueva.fila].v, v);
    if (dif || str(v[A.agenda_uid]) !== p.uidNueva) { cancelar(p, 'cambió entre la verificación y el borrado (' + (dif || 'agenda_uid') + ')'); return; }
    borrarFilaAgenda_(sh, hdr, p.nueva.fila, p.uidNueva);
    borradas++;
    p.borrada = true;
  });
  SpreadsheetApp.flush();
  if (DERIVADAS_POR_SCRIPT && (borradas || nCeldas)) {
    try { recalcDerivadas_(RDV_HOJA_DESTINO, true); }
    catch (err) { Logger.log('>>> las derivadas NO se recalcularon: %s (lo demás ya quedó)', err); }
  }
  const porColumna = {};
  wA.hechas.concat(wG).forEach(function (e) { const n = hdr[e.col - 1]; porColumna[n] = (porColumna[n] || 0) + 1; });
  Pf.escrito = { hechas: wA.hechas.concat(wG), porColumna: porColumna, saltadas: wA.saltadas, borradas: borradas };
  _completarRegistroAgenda_(Pf, t0);
  Logger.log('>>> corrida %s: celdas copiadas %s (agenda %s, regla general %s; saltadas porque ya no tenían lo esperado: %s) | filas ' +
             'BORRADAS (fusionadas por el sistema) %s | no borradas %s. Deshacer: paso 38, deshacerAgenda(false, \'%s\')', corrida,
             wA.hechas.length + wG.length, wA.hechas.length, wG.length, wA.saltadas.length, borradas,
             aplicar.filter(function (p) { return p.cancelada; }).length, corrida);
  aplicar.forEach(function (p) {
    Logger.log('    fila %s ← fila %s: %s', p.vieja.fila, p.nueva.fila, p.borrada ? 'JUNTADAS (la ' + p.nueva.fila + ' ya no está; las de abajo subieron una)' : 'NO: ' + p.cancelada);
  });
  Logger.log('    AGENDA_DUPLICADOS: las líneas "una reunión en dos filas" se van solas en la próxima corrida de la agenda (la solapa se ' +
             'reescribe entera y el H3 ya no ve el par).');
  out.corrida = corrida;
  // 16/10 (revisor): el id de esta corrida, para deshacer EXACTAMENTE la fusión (paso 98), aunque después hayan corrido otras
  try { PropertiesService.getScriptProperties().setProperty(FUSION_PROP_CORRIDA, corrida); } catch (e) { Logger.log('  (el id no se pudo guardar: %s)', e); }
  out.celdas = wA.hechas.length + wG.length;
  out.borradas = borradas;
  out.noBorradas = aplicar.filter(function (p) { return p.cancelada; }).map(function (p) { return { fila: p.nueva.fila, motivo: p.cancelada }; });
  return fin(out);
}

// ===================== El plan (en memoria) =====================

/**
 * Los pares a juntar: los grupos del invariante H3 (`reunionesRepetidasAgenda_`, sin el mail: la misma clave y la misma HORA)
 * de exactamente dos filas, las dos de la agenda. Cada par: `{ vieja, nueva, regla, copiar, conservar, saltar, motivos, … }`;
 * con `motivos`, rechazado. `pedidos` / `faltantes`: los de `opciones.filas`.
 */
function planFusionAgenda_(dest, A, hist, opciones) {
  opciones = opciones || {};
  const pedidos = _pedidosFusion_(opciones.filas);
  const grupos = reunionesRepetidasAgenda_(dest.filas, A, null);
  const pares = [], rechazados = [], encontrados = [];
  const crea = function (f) { return hist && hist.porUid ? hist.porUid.get(str(f.valores[A.agenda_uid])) || null : null; };
  grupos.forEach(function (g) {
    if (g.filas.length !== 2) {
      rechazados.push({ clave: g.clave, texto: g.texto, vieja: g.filas[0], nueva: g.filas[1], filas: g.filas, copiar: [], conservar: [], saltar: [],
                        motivos: ['son ' + g.filas.length + ' filas (' + g.filas.map(function (f) { return f.fila; }).join(', ') + '): se juntan de a dos, decidir a mano'],
                        pedido: false });
      return;
    }
    const a = g.filas[0], b = g.filas[1];
    const ca = crea(a), cb = crea(b);
    let vieja, nueva, regla;
    if (ca && cb && ca.corrida !== cb.corrida) {
      vieja = ca.corrida < cb.corrida ? a : b; nueva = vieja === a ? b : a;
      regla = 'la creó primero la agenda (corrida ' + crea(vieja).corrida + ' antes que ' + crea(nueva).corrida + ')';
    } else {
      vieja = a.fila < b.fila ? a : b; nueva = vieja === a ? b : a;
      regla = 'el número de fila menor (' + (ca && cb ? 'las dos se crearon en la misma corrida' :
              'sin la línea "crear_id" de la fila ' + (!ca ? a.fila : b.fila) + ' en REGISTRO_AGENDA_CAMBIOS') + ')';
    }
    const p = _evaluarParFusion_(dest.hdr, A, vieja, nueva);
    p.clave = g.clave; p.texto = g.texto; p.regla = regla; p.creadaVieja = crea(vieja); p.creadaNueva = crea(nueva);
    p.idReunionNueva = p.creadaNueva ? p.creadaNueva.id : '';
    p.porQue = _porQueReglaFusion_(A, vieja, nueva);
    // 16/10 (revisor): si la regla de hoy TAMPOCO une las dos filas, juntarlas no sirve (la corrida siguiente crearía otra vez la nueva)
    if (/TAMPOCO las une/.test(p.porQue)) p.motivos.push('la regla de hoy no las une: después de juntarlas, la agenda volvería a crear la nueva (revisar a mano)');
    // los pedidos (opciones.filas): el mismo par, en el mismo orden, y la identidad esperada
    if (pedidos.length) {
      const ped = pedidos.filter(function (x) {
        return (x.vieja === vieja.fila && x.nueva === nueva.fila) || (x.vieja === nueva.fila && x.nueva === vieja.fila);
      })[0];
      if (!ped) { p.pedido = false; (p.motivos.length ? rechazados : pares).push(p); return; }
      encontrados.push(ped);
      p.pedido = true;
      if (ped.vieja !== vieja.fila) p.motivos.push('se pidió quedarse con la fila ' + ped.vieja + ', pero la regla dice la ' + vieja.fila + ' (' + regla + ')');
      if (ped.esp) {
        [vieja, nueva].forEach(function (f) {
          const e = ped.esp, lug = str(f.valores[A['Lugar (mail)']]);
          if (e.figura && normalizeText_(f.figura).indexOf(normalizeText_(e.figura)) < 0) p.motivos.push('la fila ' + f.fila + ' no es la esperada: Figura "' + (f.figura || '') + '" (se esperaba "' + e.figura + '")');
          if (e.fecha && (!f.fecha || ymd_(f.fecha) !== String(e.fecha).replace(/-/g, ''))) p.motivos.push('la fila ' + f.fila + ' no es la esperada: FECHA ' + (f.fecha ? fmtFecha_(f.fecha) : '—') + ' (se esperaba ' + e.fecha + ')');
          if (e.lugar && normalizeText_(lug) !== normalizeText_(e.lugar)) p.motivos.push('la fila ' + f.fila + ' no es la esperada: "Lugar (mail)" "' + lug + '" (se esperaba "' + e.lugar + '")');
        });
      }
      if (!ped.esp) p.avisos = (p.avisos || []).concat(['sin la identidad esperada (figura / fecha / lugar) en opciones.filas: se confía en los números de fila']);
    } else p.pedido = false;
    (p.motivos.length ? rechazados : pares).push(p);
  });
  const faltantes = pedidos.filter(function (x) { return encontrados.indexOf(x) < 0; });
  const huella = _huellaFusion_(pares.concat(rechazados).filter(function (p) { return !pedidos.length || p.pedido; }).map(function (p) {
    return [p.vieja && p.vieja.fila, p.nueva && p.nueva.fila, p.uidVieja, p.uidNueva, p.motivos.join(';'),
            (p.copiar || []).map(function (c) { return c.col + '=' + valorAgendaComparable_(c.valor, dest.hdr[c.col - 1]); }).join(',')].join('|');
  }).join('#'));
  return { pares: pares, rechazados: rechazados, pedidos: pedidos, faltantes: faltantes, huella: huella, grupos: grupos.length };
}

/** `opciones.filas` normalizado: [{ vieja, nueva, esp }]. */
function _pedidosFusion_(filas) {
  return (filas || []).map(function (x) {
    if (Array.isArray(x)) return { vieja: Number(x[0]), nueva: Number(x[1]), esp: x[2] || null };
    return { vieja: Number(x.vieja), nueva: Number(x.nueva),
             esp: x.figura || x.fecha || x.lugar ? { figura: x.figura, fecha: x.fecha, lugar: x.lugar } : null };
  }).filter(function (x) { return x.vieja >= 2 && x.nueva >= 2 && x.vieja !== x.nueva; });
}

/** Las columnas de la agenda con su traza (lo que escribió el sistema). */
function _trazasFusion_() {
  return { 'FECHA': 'agenda_fecha_escrita', 'HORA': 'agenda_hora_escrita', 'Dirección': 'agenda_direccion_escrita',
           'Barrio': 'agenda_barrio_escrito', 'STATUS REUNIÓN': 'agenda_status_escrito' };
}

/** Las columnas del mail (sólo las escribe el sistema): valen las del mail más nuevo. */
function _columnasMailFusion_() {
  return ['agenda_mail', 'agenda_version', 'Evento (mail)', 'Dirección (mail)', 'Marcas (mail)', 'Conjunta con', COLUMNA_NO_PARTICIPA];
}

/** La fecha del mail de un agenda_mail ("asunto | dd/MM/yyyy HH:mm"); null si no se lee. */
function _fechaAgendaMailFusion_(s) {
  const m = /\|\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?\s*$/.exec(str(s));
  return m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), 0) : null;
}

/**
 * Qué se copia de `fn` (la nueva) a `fv` (la vieja), qué se queda y por qué un par se rechaza. Las reglas, en el encabezado del
 * archivo. `copiar`: [{ col (1-based), nombre, valor, esperado, via: 'agenda' | 'general', ceroEsVacio }].
 */
function _evaluarParFusion_(hdr, A, fv, fn) {
  const p = { vieja: fv, nueva: fn, copiar: [], conservar: [], saltar: [], motivos: [], avisos: [] };
  const vO = function (k) { return k == null ? '' : fv.valores[k]; }, vN = function (k) { return k == null ? '' : fn.valores[k]; };
  const cmp = valorAgendaComparable_;
  const txt = _txtFusion_;
  p.uidVieja = str(vO(A.agenda_uid)); p.uidNueva = str(vN(A.agenda_uid));
  if (!p.uidVieja || !p.uidNueva) p.motivos.push('las dos filas tienen que ser de la agenda (agenda_uid)');
  else if (!/^c-/.test(p.uidNueva)) p.motivos.push('la nueva (fila ' + fn.fila + ') no la creó la agenda (agenda_uid ' + p.uidNueva + '): no se borra por el camino de la agenda');
  if (!fv.fecha || !fn.fecha || ymd_(fv.fecha) !== ymd_(fn.fecha)) p.motivos.push('FECHA distinta');
  const lO = str(vO(A['Lugar (mail)'])), lN = str(vN(A['Lugar (mail)']));
  if (!lO || normalizeText_(lO) !== normalizeText_(lN)) p.motivos.push('"Lugar (mail)" distinto o vacío ("' + lO + '" / "' + lN + '")');
  const tO = tipoAgendaDeTexto_(vO(A['Evento (mail)'])), tN = tipoAgendaDeTexto_(vN(A['Evento (mail)']));
  if (tO !== tN) p.motivos.push('el tipo de "Evento (mail)" es distinto ("' + tO + '" / "' + tN + '")');
  [fv, fn].forEach(function (f) {
    const st = normStatus_(f.valores[A['STATUS REUNIÓN']]);
    if (st && st !== 'en agenda') p.motivos.push('la fila ' + f.fila + ' tiene STATUS "' + str(f.valores[A['STATUS REUNIÓN']]) + '": ya no está en agenda, decidir a mano');
  });
  const dO = _fechaAgendaMailFusion_(vO(A.agenda_mail)), dN = _fechaAgendaMailFusion_(vN(A.agenda_mail));
  const masReciente = dN ? (!dO || dN.getTime() >= dO.getTime()) : !dO;
  p.masReciente = masReciente;
  if (!masReciente) p.avisos.push('la VIEJA tiene el mail más nuevo (' + txt(vO(A.agenda_mail)) + '): su dirección y lo del mail se quedan');
  const trazas = _trazasFusion_();
  const nombreTraza = {};
  Object.keys(trazas).forEach(function (c) { nombreTraza[normalizeHeader_(trazas[c])] = c; });
  const deAgenda = COLUMNAS_QUE_ESCRIBE_AGENDA.map(normalizeHeader_);
  const mailCols = _columnasMailFusion_().map(normalizeHeader_);
  const copiar = function (k, valor, esperado, via, extra) {
    p.copiar.push(Object.assign({ col: k + 1, nombre: hdr[k], valor: valor, esperado: esperado, via: via }, extra || {}));
  };
  const conservar = function (n, por) { p.conservar.push({ nombre: n, motivo: por }); };
  const nnIns = normalizeHeader_('Inscriptos');
  for (let k = 0; k < hdr.length; k++) {
    const n = str(hdr[k]);
    if (!n) continue;
    const nn = normalizeHeader_(n);
    const a = vO(k), b = vN(k);
    if (nombreTraza[nn]) continue;                               // la traza va con su celda
    if (esColumnaDerivada_(n)) { if (!esVacio_(b) && cmp(a, n) !== cmp(b, n)) p.saltar.push({ nombre: n, motivo: 'derivada: se recalcula' }); continue; }
    if (deAgenda.indexOf(nn) >= 0) {
      if (nn === 'agenda_uid') { conservar(n, 'el de la vieja (' + p.uidVieja + '); el de la nueva (' + p.uidNueva + ') queda en el registro'); continue; }
      if (nn === normalizeHeader_('Tocado por el equipo')) { if (cmp(a, n) !== cmp(b, n)) p.saltar.push({ nombre: n, motivo: 'lo recalcula la próxima corrida' }); continue; }
      if (nn === normalizeHeader_('Lugar (mail)')) continue;     // es la identidad del par (igual en las dos)
      const celdaTraza = Object.keys(trazas).filter(function (c) { return A[c] === k; })[0];
      if (celdaTraza) {
        const kt = A[trazas[celdaTraza]];
        const nt = trazas[celdaTraza];
        const cO = a, cN = b, xO = vO(kt), xN = vN(kt);
        const igualC = cmp(cO, n) === cmp(cN, n), igualT = cmp(xO, nt) === cmp(xN, nt);
        if (igualC && igualT) continue;
        const delSistema = esVacio_(cO) || (!esVacio_(xO) && cmp(cO, n) === cmp(xO, n));
        // 16/10 (revisor): la NUEVA también puede tener un valor del equipo (no es lo que escribió el sistema): si es distinto del de
        // la vieja, se perdería al borrarla → se rechaza el par (decidir a mano)
        const nuevaDelEquipo = !esVacio_(cN) && !(!esVacio_(xN) && cmp(cN, n) === cmp(xN, n));
        if (nuevaDelEquipo && !igualC) { p.motivos.push('"' + n + '": la nueva tiene "' + txt(cN, n) + '" cargado por el equipo (no es lo que escribió el sistema) y la vieja "' + txt(cO, n) + '": decidir a mano'); continue; }
        if (!delSistema) { conservar(n, 'la vieja tiene "' + txt(cO, n) + '", que no es lo que escribió el sistema ("' + txt(xO, n) + '"): es del equipo, no se toca'); continue; }
        if (!esVacio_(cO) && !masReciente) { conservar(n, 'la vieja tiene el mail más nuevo: se queda "' + txt(cO, n) + '"'); continue; }
        if (esVacio_(cN) && !esVacio_(cO)) { conservar(n, 'la nueva no tiene: no se borra "' + txt(cO, n) + '"'); continue; }
        if (!igualC) copiar(k, cN, cO, 'agenda');
        if (kt != null && !igualT) copiar(kt, xN, xO, 'agenda');
        continue;
      }
      if (mailCols.indexOf(nn) >= 0) {
        // sólo las escribe el sistema: valen las del mail más nuevo, también vacías ("Marcas (mail)": "A CONFIRMAR" ya no está)
        if (cmp(a, n) === cmp(b, n)) continue;
        if (masReciente || (esVacio_(a) && !esVacio_(b))) copiar(k, b, a, 'agenda');
        else conservar(n, 'la vieja tiene el mail más nuevo: se queda "' + txt(a, n) + '"');
        continue;
      }
      if (nn === normalizeHeader_('Figura')) {
        if (esVacio_(b) || cmp(a, n) === cmp(b, n)) continue;
        if (esVacio_(a)) copiar(k, b, a, 'agenda');
        else p.motivos.push('Figura distinta ("' + txt(a, n) + '" / "' + txt(b, n) + '"): decidir a mano');
        continue;
      }
      // EVENTO, "Origen fila" y cualquier otra de la agenda: sólo en una celda vacía de la vieja
      if (esVacio_(b) || cmp(a, n) === cmp(b, n)) continue;
      if (esVacio_(a)) copiar(k, b, a, 'agenda');
      else conservar(n, 'se queda el de la vieja ("' + txt(a, n) + '"; la nueva dice "' + txt(b, n) + '")');
      continue;
    }
    // el resto: la regla general (sólo celda vacía de la vieja)
    if (esVacio_(b)) continue;
    if (esColumnaManual_(n)) { p.saltar.push({ nombre: n, motivo: 'columna manual: el sistema no la escribe' }); continue; }
    const ins = nn === nnIns && INSCRIPTOS_CERO_ES_VACIO;
    const vaciaO = esVacio_(a) || (ins && num(a) === 0);
    if (vaciaO) { if (!(ins && num(b) === 0)) copiar(k, b, a, 'general', ins ? { ceroEsVacio: true } : null); continue; }
    if (cmp(a, n) === cmp(b, n)) continue;
    p.motivos.push('"' + n + '": la vieja dice "' + txt(a, n) + '" y la nueva "' + txt(b, n) + '" (un dato distinto en las dos: decidir a mano)');
  }
  return p;
}

/** Por qué la regla de HOY (AGENDA_SEGURIDAD_POR_COMUNA, 40_Agenda.js) hubiera unido las dos filas, o no. */
function _porQueReglaFusion_(A, fv, fn) {
  const v = function (f, n) { return A[n] == null ? '' : f.valores[A[n]]; };
  const lO = str(v(fv, 'Lugar (mail)')), lN = str(v(fn, 'Lugar (mail)'));
  const eO = str(v(fv, 'Evento (mail)')), eN = str(v(fn, 'Evento (mail)'));
  const tO = tipoAgendaDeTexto_(eO), tN = tipoAgendaDeTexto_(eN);
  const gO = grupoDeAgendaMail_(v(fv, 'agenda_mail')), gN = grupoDeAgendaMail_(v(fn, 'agenda_mail'));
  const dirO = str(v(fv, 'agenda_direccion_escrita')) || str(v(fv, 'Dirección'));
  const ev = { figuraFila: '', lugar: lN, tipo: tN, grupo: gN || '(sin grupo)', otrosGrupos: [] };
  const une = mismaReunionSinFiguraAgenda_(ev, str(v(fv, 'agenda_uid')), lO, eO, v(fv, 'agenda_mail'), true);
  const sino = function (x) { return x ? 'sí' : 'NO'; };
  const partes = ['mismo grupo: ' + sino(!gO || !gN || normalizeText_(gO) === normalizeText_(gN)) + ' (' + (gO || '—') + ' / ' + (gN || '—') + ')',
                  'mismo "Lugar (mail)": ' + sino(normalizeText_(lO) === normalizeText_(lN)) + ' (' + (lO || '—') + ')',
                  'mismo tipo: ' + sino(tO === tN) + ' (' + (tO || 'sin tipo') + ')',
                  'la dirección de la vieja ("' + (dirO || '—') + '") ' + (esDireccionReal_(dirO) ? 'ES una dirección' : 'no es una dirección (no identifica)')];
  const seg = tN === 'Seguridad en tu Barrio';
  return partes.join(' | ') + ' → ' + (seg
    ? (une ? 'con la regla de hoy (grupo + fecha + "Lugar (mail)"; AGENDA_SEGURIDAD_POR_COMUNA = ' + AGENDA_SEGURIDAD_POR_COMUNA + ') la reunión de la nueva se hubiera ACTUALIZADO en la vieja'
           : 'la regla de hoy TAMPOCO las une (revisar a mano antes de juntarlas)')
    : 'no es una Seguridad: la regla de siempre (figura + fecha) las une; la repetida salió por otro camino');
}

// ===================== Lecturas y textos =====================

/** De REGISTRO_AGENDA_CAMBIOS (sólo lectura): agenda_uid → { corrida, id } de su línea "crear_id" (sin las corridas deshechas). */
function _creacionesFusionAgenda_() {
  const out = { porUid: new Map(), error: '' };
  try {
    const ss = registrosAgenda_();
    const cam = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA_CAMBIOS), reg = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA);
    if (!cam || cam.getLastRow() < 2) return out;
    const deshechas = {};
    if (reg && reg.getLastRow() > 1) {
      reg.getRange(2, 3, reg.getLastRow() - 1, 1).getValues().forEach(function (r) { const m = /^DESHACER (.+)$/.exec(str(r[0])); if (m) deshechas[m[1]] = true; });
    }
    cam.getRange(2, 1, cam.getLastRow() - 1, Math.max(9, cam.getLastColumn())).getValues().forEach(function (r) {
      const corrida = str(r[0]), tipo = str(r[1]), uid = str(r[8]);
      if (!uid || deshechas[corrida] || tipo !== 'crear_id') return;
      const ya = out.porUid.get(uid);
      if (!ya || corrida < ya.corrida) out.porUid.set(uid, { corrida: corrida, id: str(r[6]) });
    });
  } catch (err) { out.error = String(err); }
  return out;
}

/** La primera columna (no derivada) en que dos lecturas de la misma fila difieren; '' si son iguales. */
function _difFilaFusion_(hdr, a, b) {
  for (let k = 0; k < hdr.length; k++) {
    if (!str(hdr[k]) || esColumnaDerivada_(hdr[k])) continue;
    if (valorAgendaComparable_(a[k], hdr[k]) !== valorAgendaComparable_(b[k], hdr[k])) return hdr[k];
  }
  return '';
}

function _txtFusion_(v, n) {
  if (v instanceof Date) {
    const nn = normalizeHeader_(n || '');
    if (nn === 'hora' || nn === 'agenda_hora_escrita') return valorAgendaComparable_(v, n);
    return v.getFullYear() < 1900 ? Utilities.formatDate(v, RDV_TZ, 'HH:mm') : fmtFecha_(v);
  }
  if (n && /hora/.test(normalizeHeader_(n)) && typeof v === 'number') return valorAgendaComparable_(v, n);
  return str(v).replace(/\s+/g, ' ');
}

function _huellaFusion_(s) {
  try {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8)
      .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('').slice(0, 12);
  } catch (err) { return 'len' + s.length; }
}

function _resumenParFusion_(p) {
  return { vieja: p.vieja ? p.vieja.fila : null, nueva: p.nueva ? p.nueva.fila : null, regla: p.regla || '', clave: p.clave,
           creadaVieja: p.creadaVieja ? p.creadaVieja.corrida : '', creadaNueva: p.creadaNueva ? p.creadaNueva.corrida : '',
           copiar: (p.copiar || []).map(function (c) { return { columna: c.nombre, valor: _txtFusion_(c.valor, c.nombre), antes: _txtFusion_(c.esperado, c.nombre), via: c.via }; }),
           conservar: p.conservar || [], saltar: p.saltar || [], motivos: p.motivos || [], avisos: p.avisos || [], porQue: p.porQue || '',
           pedido: !!p.pedido };
}

/** El log del paso 96 (y del 97, antes de escribir): las dos filas lado a lado y el plan de cada par. */
function _logPlanFusion_(plan, dest, A) {
  Logger.log('  grupos "una reunión en dos filas" (H3, sin el mail: misma clave y misma HORA): %s | pares para juntar %s | rechazados %s%s',
             plan.grupos, plan.pares.length, plan.rechazados.length,
             plan.pedidos.length ? ' | pedidos ' + plan.pedidos.length + (plan.faltantes.length ? ' (NO ENCONTRADOS: ' + plan.faltantes.map(function (x) { return x.vieja + '/' + x.nueva; }).join(', ') + ')' : '') : '');
  const cols = ['Figura', 'FECHA', 'HORA', 'Dirección', 'Barrio', 'STATUS REUNIÓN', 'agenda_uid', 'agenda_mail', 'Lugar (mail)', 'Evento (mail)',
                'Origen fila', 'Tocado por el equipo', COLUMNA_ID_CUENTAS].concat(COLUMNAS_TRAZA).concat(['Inscriptos', 'Asistentes']);
  const hdr = dest.hdr;
  plan.pares.concat(plan.rechazados).forEach(function (p) {
    if (plan.pedidos.length && !p.pedido) return;
    Logger.log('--- %s | %s ---', p.motivos.length ? 'RECHAZADO' : 'SE JUNTARÍA', p.texto || p.clave);
    if (!p.vieja || !p.nueva || !p.regla) { Logger.log('    %s', p.motivos.join(' | ')); return; }
    Logger.log('    se queda la fila %s (VIEJA) y se borra la %s (NUEVA) — decidió: %s', p.vieja.fila, p.nueva.fila, p.regla);
    Logger.log('    creada: vieja %s | nueva %s   (la corrida = yyyyMMdd-HHmmss: si la nueva es de después de que la etapa 1 llegó a Apps Script, la regla de hoy no la evitó)',
               p.creadaVieja ? p.creadaVieja.corrida : '(sin "crear_id")', p.creadaNueva ? p.creadaNueva.corrida : '(sin "crear_id")');
    cols.forEach(function (n) {
      const k = findIdxOr_(hdr, aliasColumna_(n), true);
      if (k == null) return;
      const a = _txtFusion_(p.vieja.valores[k], n), b = _txtFusion_(p.nueva.valores[k], n);
      Logger.log('    %s | vieja: %s | nueva: %s%s', n, a || '—', b || '—',
                 n === 'agenda_mail' ? ' | grupo: ' + (grupoDeAgendaMail_(p.vieja.valores[k]) || '—') + ' / ' + (grupoDeAgendaMail_(p.nueva.valores[k]) || '—') : '');
    });
    Logger.log('    por qué: %s', p.porQue);
    (p.avisos || []).forEach(function (x) { Logger.log('    AVISO: %s', x); });
    if (p.motivos.length) { Logger.log('    SE RECHAZA: %s', p.motivos.join(' | ')); return; }
    p.copiar.forEach(function (c) {
      Logger.log('    COPIA a la %s | %s | "%s" → "%s" (%s)', p.vieja.fila, c.nombre, _txtFusion_(c.esperado, c.nombre) || '(vacía)',
                 _txtFusion_(c.valor, c.nombre) || '(vacía)', c.via === 'agenda' ? 'excepción de la agenda' : 'regla general, sólo celda vacía');
    });
    p.conservar.forEach(function (c) { Logger.log('    SE QUEDA | %s | %s', c.nombre, c.motivo); });
    p.saltar.forEach(function (c) { Logger.log('    NO SE COPIA | %s | %s', c.nombre, c.motivo); });
    Logger.log('    la fila %s se BORRA (guardada entera en REGISTRO_AGENDA_CAMBIOS, "fusionada_sistema": no cuenta como borrada por el equipo)', p.nueva.fila);
  });
  Logger.log('  HUELLA del plan: %s (pasarla al paso 97 como opciones.huella: si algo cambió, no escribe)', plan.huella);
}

// ===================== Deshacer (paso 38, lo llama _deshacerAgenda_ de 40_Agenda.js) =====================

/** ¿El valor de la celda es todavía el que anotó el registro (`despues`)? */
function _mismoValorRegistroFusion_(v, despues) {
  return str(_celdaRegistro_(v)) === str(_celdaRegistro_(despues));
}

/**
 * Deshacer las celdas de la REGLA GENERAL que copió una fusión ("fusionar_general"): se vacían sólo si todavía tienen lo
 * copiado y el color del sistema (`vaciarCeldasDelSistema_`, 05_Escritura.js). `cambios`: [{ fila (actual), col, despues }].
 */
function deshacerGeneralesFusion_(sh, cambios) {
  const lista = [], saltadas = [];
  cambios.forEach(function (c) {
    const v = sh.getRange(c.fila, c.col).getValue();
    if (_mismoValorRegistroFusion_(v, c.despues)) lista.push({ fila: c.fila, col: c.col, escrito: v, c: c });
    else saltadas.push(c);
  });
  const hechas = vaciarCeldasDelSistema_(sh, lista);
  lista.forEach(function (e) { if (hechas.indexOf(e) < 0) saltadas.push(e.c); });
  return { hechas: hechas, saltadas: saltadas };
}

/**
 * Restaurar AL FINAL una fila que borró una fusión ("borrar_fusion"): sus valores (las columnas de la agenda por su excepción,
 * el resto por la regla general, las derivadas se recalculan) y después sus fondos (`restaurarFondosFilaAgenda_`).
 * `c`: la línea del registro (antes = la fila en JSON, fondoAntes = los fondos en JSON, uid). Devuelve true si escribió.
 */
function restaurarFilaFusion_(sh, hdr, c, fila) {
  let valores = [], fondos = [];
  try { valores = JSON.parse(c.antes || '[]'); } catch (e) { valores = []; }
  try { fondos = JSON.parse(c.fondoAntes || '[]'); } catch (e) { fondos = []; }
  const deAgenda = COLUMNAS_QUE_ESCRIBE_AGENDA.map(normalizeHeader_);
  const escA = [], escG = [];
  valores.forEach(function (v, k) {
    if (k >= hdr.length || !str(hdr[k]) || esVacio_(v) || esColumnaDerivada_(hdr[k])) return;
    const val = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? toDate_(v) : v;
    if (deAgenda.indexOf(normalizeHeader_(hdr[k])) >= 0) {
      if (normalizeHeader_(hdr[k]) === normalizeHeader_('STATUS REUNIÓN') && normStatus_(v) !== 'en agenda') {
        Logger.log('    la fila restaurada tenía STATUS "%s": no se restaura (no es una transición de la agenda)', v);
        return;
      }
      escA.push({ fila: fila, col: k + 1, valor: val, esperado: '' });
    } else if (!esColumnaManual_(hdr[k])) escG.push({ fila: fila, col: k + 1, valor: val });
  });
  if (!escA.length) return false;
  escribirAgendaLote_(sh, hdr, escA);
  if (escG.length) setSiDelSistemaLote_(sh, hdr, escG);
  if (fondos.length) {
    try { restaurarFondosFilaAgenda_(sh, hdr, fila, c.uid, fondos); }
    catch (err) { Logger.log('    los fondos de la fila restaurada no se pusieron: %s (los valores ya están)', err); }
  }
  return true;
}
