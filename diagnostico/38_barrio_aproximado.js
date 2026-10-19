/**
 * diagnostico/38_barrio_aproximado.js — EL BARRIO DE LA 834 Y LA GEOCODIFICACIÓN APROXIMADA (19/10; prompt 08, punto 5;
 * pasos 105 y 106). SÓLO LECTURA.
 *
 * Lee la base ("RVD JM-CM - ES", una celda de fondo: la del Barrio de la fila pedida), REGISTRO_AGENDA_CAMBIOS y REGISTRO_AGENDA
 * (`registrosAgenda_()`), y la cache AGENDA_GEOCODE (intermedia). NO llama a Maps ni a Gmail, no escribe ninguna celda, no crea
 * solapas, no agrega nada a la cache, no guarda propiedades. Todo va al log (y se devuelve un resumen).
 *
 *   explicarBarrioFila(834)    (paso 105) de dónde salió el Barrio de una fila de la agenda: la fila (Figura, FECHA, Barrio,
 *                              Dirección, "Lugar (mail)", "Evento (mail)", agenda_uid, agenda_barrio_escrito,
 *                              agenda_direccion_escrita, Origen fila, el fondo del Barrio); TODAS las líneas de
 *                              REGISTRO_AGENDA_CAMBIOS que tocaron su Barrio (o agenda_barrio_escrito), las de las filas que se
 *                              juntaron con ella (paso 97: "fusionada_sistema" / "borrar_fusion", con la fila borrada entera);
 *                              lo que la cache AGENDA_GEOCODE tiene (y tenía, fila por fila, con su fecha) de su dirección, con la
 *                              regla de confianza de cada una; y qué diría hoy el barrio del mail (`barrioDelLugarMailAgenda_`).
 *                              Termina con: "el Barrio salió de …" y "queda registrado como escrito por el sistema: sí / no".
 *   medirBarrioAproximado()    (paso 106) la regla nueva (AGENDA_BARRIO_APROXIMADO, APAGADA: aceptar una geocodificación
 *                              'aproximada' a más de BARRIO_APROXIMADO_MARGEN_M m del borde de otro barrio y en la comuna (o el
 *                              barrio) del mail), con EL MISMO código que usaría la agenda (`_reglaBarrioConMargen_` con la
 *                              opción forzada): (i) qué filas de la agenda ganarían barrio; (ii) LA PRUEBA: en las filas con un
 *                              barrio cargado por el equipo cuya dirección está en la cache como 'aproximada', ¿la regla daría
 *                              OTRO barrio? (tiene que dar 0); (iii) las reuniones del mail sin fila: no se pueden sin Gmail.
 *                              Resumen: "ganarían barrio N | contradicen al equipo M → LISTO / NO LISTO para prender".
 *
 * `opciones` (los tests): `dest`, `cambios` (las filas de REGISTRO_AGENDA_CAMBIOS, con el encabezado), `deshechas` (corrida →
 * true), `cacheFilas` (las filas de AGENDA_GEOCODE como objetos, `_filasCacheGeoBA_`), `fondoBarrio`, `poligonos`, `esperado`
 * ({ figura, fecha: 'yyyy-MM-dd' }: confirma que la fila es la que se cree).
 */

/** Paso 105 (SÓLO LECTURA): de dónde salió el Barrio de la fila `fila` (por defecto la 834). */
function explicarBarrioFila(fila, opciones) {
  opciones = opciones || {};
  fila = Number(fila || 834);
  const t0 = Date.now();
  const out = { fila: fila, barrio: '', escritoPorSistema: false, origen: '', lineas: [], cache: [], error: '' };
  Logger.log('=== de dónde salió el Barrio de la fila %s — SÓLO LECTURA (no llama a Maps, no escribe nada) — %s ===', fila,
             typeof descripcionHojaDestino_ === 'function' ? descripcionHojaDestino_() : '');
  const dest = opciones.dest || leerDestino_();
  const A = indicesAgenda_(dest.hdr);
  const f = dest.filas.filter(function (x) { return x.fila === fila; })[0];
  if (!f) { out.error = 'la fila ' + fila + ' no tiene datos'; Logger.log('>>> %s.', out.error); return out; }
  const val = function (n) { return A[n] == null ? '' : f.valores[A[n]]; };
  const esp = opciones.esperado;
  if (esp && ((esp.figura && normalizeText_(f.figura).indexOf(normalizeText_(esp.figura)) < 0) ||
              (esp.fecha && (!f.fecha || ymd_(f.fecha) !== String(esp.fecha).replace(/-/g, ''))))) {
    Logger.log('  AVISO: la fila %s es "%s %s", no la esperada (%s %s): el equipo pudo haber insertado o borrado filas arriba. Se explica igual.',
               fila, f.figura, f.fecha ? fmtFecha_(f.fecha) : '?', esp.figura || '', esp.fecha || '');
  }
  const cur = str(val('Barrio'));
  out.barrio = cur;
  const esc = str(val('agenda_barrio_escrito'));
  const uid = str(val('agenda_uid'));
  // 1. la fila
  let fondo = opciones.fondoBarrio;
  if (fondo === undefined && A.Barrio != null) {
    try { fondo = ssDestino_().getSheetByName(RDV_HOJA_DESTINO).getRange(fila, A.Barrio + 1).getBackground(); } catch (e) { fondo = '(no se pudo leer: ' + e + ')'; }
  }
  Logger.log('--- 1. la fila %s ---', fila);
  Logger.log('  Figura "%s" | FECHA %s | HORA %s | STATUS "%s"', f.figura, f.fecha ? fmtFecha_(f.fecha) : '—', valorAgendaComparable_(val('HORA'), 'HORA') || '—',
             str(val('STATUS REUNIÓN')));
  Logger.log('  Barrio "%s" (fondo %s%s) | agenda_barrio_escrito "%s"', cur || '—', fondo || '—',
             fondo && esColorSistema_(fondo) ? ', el color del sistema' : '', esc || '—');
  Logger.log('  Dirección "%s" | agenda_direccion_escrita "%s"', str(val('Dirección')) || '—', str(val('agenda_direccion_escrita')) || '—');
  Logger.log('  "Lugar (mail)" "%s" | "Evento (mail)" "%s" | "Dirección (mail)" "%s"', str(val('Lugar (mail)')) || '—',
             str(val('Evento (mail)')) || '—', str(val('Dirección (mail)')) || '—');
  Logger.log('  agenda_uid "%s" | Origen fila "%s" | agenda_mail "%s"', uid || '—', str(val('Origen fila')) || '—', str(val('agenda_mail')) || '—');
  out.escritoPorSistema = !!cur && !!esc && _kbBA_(cur) === _kbBA_(esc);

  // 2. REGISTRO_AGENDA_CAMBIOS
  const reg = _lineasCambiosBA_(opciones);
  if (reg.error) Logger.log('  AVISO: REGISTRO_AGENDA_CAMBIOS no se pudo leer (%s): sin el historial no se puede decir de dónde salió.', reg.error);
  const lineas = reg.lineas;
  const esFusion = function (l) { return l.tipo === 'fusionada_sistema' || l.tipo === 'fusionada_equipo'; };
  const fusionadas = lineas.filter(function (l) {
    if (!esFusion(l)) return false;
    const m = /^fila\s+(\d+)$/i.exec(l.columna);
    return (m && Number(m[1]) === fila) || (uid && l.antes.indexOf('agenda_uid ' + uid) >= 0);
  });
  const uidsFus = [];
  fusionadas.forEach(function (l) { if (l.uid && uidsFus.indexOf(l.uid) < 0 && l.uid !== uid) uidsFus.push(l.uid); });
  const uids = (uid ? [uid] : []).concat(uidsFus);
  const tocaBarrio = function (l) { const n = normalizeHeader_(l.columna); return n === normalizeHeader_('Barrio') || n === 'agenda_barrio_escrito'; };
  const relevantes = lineas.filter(function (l) {
    if (uids.indexOf(l.uid) >= 0 && (tocaBarrio(l) || l.tipo === 'crear_id' || /^borrar/.test(l.tipo) || esFusion(l) || l.tipo === 'fusionar')) return true;
    if (fusionadas.indexOf(l) >= 0) return true;
    return !l.uid && l.fila === fila && tocaBarrio(l);
  });
  Logger.log('--- 2. REGISTRO_AGENDA_CAMBIOS: %s líneas de la fila (agenda_uid %s)%s ---', relevantes.length, uid || '—',
             uidsFus.length ? ' y de las que se juntaron con ella (' + uidsFus.join(', ') + ')' : '');
  relevantes.forEach(function (l) {
    if (/^borrar/.test(l.tipo)) {
      Logger.log('  %s | %s | fila %s | la fila borrada, entera (abajo) | uid %s%s', l.corrida, l.tipo, l.fila, l.uid, l.deshecha ? ' | CORRIDA DESHECHA' : '');
      return;
    }
    Logger.log('  %s | %s | fila %s | %s | "%s" → "%s" | fondo antes %s | uid %s%s%s', l.corrida, l.tipo, l.fila, l.columna || '—', l.antes, l.despues,
               l.fondo || '—', l.uid || '—', l.deshecha ? ' | CORRIDA DESHECHA' : '', !l.uid ? ' (sin agenda_uid: por número de fila, puede ser otra reunión)' : '');
  });
  out.lineas = relevantes;
  // la fila borrada de cada fusión, entera (el JSON de "borrar_fusion"), con las columnas de HOY (si cambiaron, se avisa)
  const borradas = {};
  lineas.filter(function (l) { return /^borrar_fusion/.test(l.tipo) && uidsFus.indexOf(l.uid) >= 0; }).forEach(function (l) {
    let v = null, bg = null;
    try { v = JSON.parse(l.antes); } catch (e) { v = null; }
    try { bg = JSON.parse(l.fondo); } catch (e) { bg = null; }
    if (!v) { Logger.log('  la fila borrada (%s) no se pudo leer del registro', l.uid); return; }
    const k = function (n) { return A[n]; };
    const g = function (n) { return k(n) == null ? '' : str(v[k(n)]); };
    borradas[l.uid] = { Barrio: g('Barrio'), agenda_barrio_escrito: g('agenda_barrio_escrito'), dir: g('agenda_direccion_escrita') || g('Dirección'),
                        fondo: bg && k('Barrio') != null ? bg[k('Barrio')] : '' };
    Logger.log('  la fila %s que se borró al juntarlas (uid %s, corrida %s)%s: Barrio "%s" (fondo %s) | agenda_barrio_escrito "%s" | Dirección "%s" | ' +
               'agenda_direccion_escrita "%s" | "Lugar (mail)" "%s" | "Evento (mail)" "%s" | Origen fila "%s"', l.fila, l.uid, l.corrida,
               v.length !== dest.hdr.length ? ' (OJO: ' + v.length + ' columnas en el registro y ' + dest.hdr.length + ' hoy: los nombres pueden no corresponder)' : '',
               g('Barrio') || '—', borradas[l.uid].fondo || '—', g('agenda_barrio_escrito') || '—', g('Dirección') || '—', g('agenda_direccion_escrita') || '—',
               g('Lugar (mail)') || '—', g('Evento (mail)') || '—', g('Origen fila') || '—');
  });

  // 3. la cache AGENDA_GEOCODE de su dirección (todas las filas, con su fecha) y la reunión de la fila
  const pol = opciones.poligonos || _poligonosBarrios_();
  const ev = _evDeFilaBA_(f, A);
  const dir = (ev && ev.direccion) || str(val('agenda_direccion_escrita')) || str(val('Dirección'));
  Logger.log('--- 3. la reunión (rearmada de "Evento (mail)" / "Lugar (mail)") y la cache AGENDA_GEOCODE de "%s" ---', dir || '—');
  if (ev) Logger.log('  lugar del mail: tipo "%s" | barrio %s | comuna %s%s | eje %s | dirección leída "%s"', ev.lugarTipo || '—', ev.barrio || '—',
                     ev.comuna == null ? '—' : ev.comuna, ev.subzona ? ' ' + ev.subzona : '', ev.eje || '—', ev.direccion || '—');
  else Logger.log('  la fila no tiene "Evento (mail)" ni "Lugar (mail)": no hay reunión del mail con qué comparar');
  const filasCache = opciones.cacheFilas || _filasCacheGeoBA_();
  const cacheMap = _mapaCacheBA_(filasCache);   // marca `vigente` (la fila que lee hoy la agenda de cada consulta)
  const qO = dir ? _consultaGeocode_(dir) : '', qE = dir ? _consultaGeocodeExpandida_(dir) : '';
  const clave = _claveCalleBA_(dir);
  const deDir = filasCache.filter(function (g) {
    return g.consulta === qO || g.consulta === qE || (clave && _claveCalleBA_(g.consulta) === clave);
  });
  Logger.log('  consultas: "%s"%s | filas de la cache para esta calle y altura: %s', qO || '—', qE && qE !== qO ? ' y "' + qE + '"' : '', deDir.length);
  deDir.forEach(function (g) {
    const res = _barrioDeGeo_(g, pol);
    const d = res.lat != null ? _distanciaAOtroBarrioM_(res.lng, res.lat, pol, res.barrio) : null;
    const rV = ev ? _reglaBarrioConMargen_(res, ev, pol, BARRIO_MARGEN_M, { aproximado: false }) : { cumple: false, motivo: 'sin reunión del mail' };
    const rN = ev ? _reglaBarrioConMargen_(res, ev, pol, BARRIO_MARGEN_M, { aproximado: true }) : rV;
    const x = { fila: g.filaHoja, consulta: g.consulta, fecha: g.fecha, fechaMs: g.fechaMs, estadoMaps: g.estado, tipo: g.tipo, parcial: g.parcial,
                barrio: res.barrio, estado: res.estado, distancia: d, reglaVieja: rV, reglaNueva: rN };
    out.cache.push(x);
    Logger.log('  cache fila %s | %s | "%s" | Maps %s, tipo %s%s | "%s" → %s (%s), a %s m del borde de otro barrio | regla de siempre: %s | ' +
               'regla de la aproximada: %s%s', g.filaHoja, _fechaTxtBA_(g), g.consulta, g.estado, g.tipo || '—', g.parcial ? ', PARCIAL' : '', g.formateada || '',
               res.barrio || 'sin barrio', res.estado, d == null ? '—' : Math.round(d), rV.cumple ? 'CUMPLE (' + rV.por + ')' : 'no (' + rV.motivo + ')',
               rN.cumple ? 'CUMPLE (' + rN.por + ')' : 'no (' + rN.motivo + ')', g.vigente ? ' | ES LA QUE LEE HOY LA AGENDA' : '');
  });
  // qué usaría hoy la agenda (la misma elección que `_barrioAgenda_`) y qué diría el barrio del mail
  const usa = dir ? _geoQueUsariaAgendaBA_(cacheMap, dir, pol) : { g: null };
  const resHoy = usa.g ? _barrioDeGeo_(usa.g, pol) : null;
  const mailHoy = ev ? barrioDelLugarMailAgenda_(ev, resHoy) : null;
  Logger.log('  hoy la agenda usaría: %s | el barrio del mail ("Lugar (mail)" → barrioDelLugarMailAgenda_, AGENDA_BARRIO_DEL_MAIL = %s): %s',
             usa.g ? '"' + usa.g.consulta + '" (' + resHoy.estado + ', ' + (resHoy.barrio || 'sin barrio') + ')' + (usa.reintentaria ? ' — la volvería a pedir a Maps' : '')
                   : 'nada (la pediría a Maps)', AGENDA_BARRIO_DEL_MAIL,
             mailHoy ? mailHoy.barrio : (ev ? 'nada (el lugar del mail es ' + (ev.lugarTipo ? 'una ' + ev.lugarTipo : 'vacío') + ', no un barrio)' : 'nada'));

  // 4. la conclusión
  const o = _origenBarrioBA_(cur, uid, uidsFus, lineas, borradas, out.cache, ev);
  out.origen = o.texto;
  Logger.log('--- 4. conclusión ---');
  o.detalle.forEach(function (t) { Logger.log('  %s', t); });
  Logger.log('  el %s salió de: %s', cur ? '"' + cur + '"' : 'Barrio (vacío)', o.texto);
  Logger.log('  queda registrado como escrito por el sistema: %s (agenda_barrio_escrito = "%s")', out.escritoPorSistema ? 'sí' : 'no', esc || '');
  Logger.log('paso 105: %s ms', Date.now() - t0);
  return out;
}

/**
 * De dónde salió `cur` (el Barrio de hoy): la última escritura de ese valor en REGISTRO_AGENDA_CAMBIOS (de la fila o de una
 * fusionada con ella) y, si fue una fusión, la escritura en la fila borrada; y por qué regla (la cache de esa fecha, el barrio
 * del mail). `{ texto, detalle: [] }`.
 */
function _origenBarrioBA_(cur, uid, uidsFus, lineas, borradas, cacheDir, ev) {
  const det = [];
  if (!cur) return { texto: 'la fila no tiene Barrio', detalle: det };
  const escribe = function (u) {
    return lineas.filter(function (l) {
      return l.uid === u && normalizeHeader_(l.columna) === normalizeHeader_('Barrio') && !l.deshecha && _kbBA_(l.despues) === _kbBA_(cur);
    }).sort(function (a, b) { return a.corrida < b.corrida ? -1 : a.corrida > b.corrida ? 1 : 0; });
  };
  const propias = uid ? escribe(uid) : [];
  const ultima = propias[propias.length - 1];
  let origen = ultima, via = '';
  if (ultima && /^fusionar/.test(ultima.tipo)) {
    via = 'la fusión (paso 97 o la fusión automática, corrida ' + ultima.corrida + ', tipo "' + ultima.tipo + '") ';
    let deNueva = null;
    uidsFus.forEach(function (u) { const w = escribe(u); if (w.length) deNueva = w[w.length - 1]; });
    if (deNueva) { origen = deNueva; via += 'copió el Barrio de la fila ' + deNueva.fila + ' (uid ' + deNueva.uid + '), que lo recibió en '; }
    else {
      const b = uidsFus.map(function (u) { return borradas[u]; }).filter(Boolean)[0];
      if (b && _kbBA_(b.Barrio) === _kbBA_(cur)) {
        const sis = !!b.agenda_barrio_escrito && _kbBA_(b.agenda_barrio_escrito) === _kbBA_(cur);
        det.push('la fila borrada tenía "' + b.Barrio + '" con agenda_barrio_escrito "' + (b.agenda_barrio_escrito || '') + '" (fondo ' + (b.fondo || '—') + ')');
        return { texto: via + 'copió el Barrio de la fila borrada, ' + (sis ? 'que lo tenía como escrito por el sistema pero SIN una línea que lo escriba (registro incompleto)'
                                                                          : 'que lo había cargado el equipo (sin agenda_barrio_escrito)'), detalle: det };
      }
      return { texto: via + 'copió un Barrio cuyo origen en la fila borrada no está en el registro', detalle: det };
    }
  }
  if (!origen) {
    // ninguna escritura del sistema con ese valor: ¿la escribió alguna fila borrada / fusionada, o no la escribió la agenda?
    const otra = uidsFus.map(escribe).filter(function (w) { return w.length; })[0];
    if (otra) return { texto: 'la fila ' + otra[0].fila + ' (uid ' + otra[0].uid + ', que se juntó con ésta) lo recibió en la corrida ' + otra[0].corrida +
                              ', pero ninguna línea lo pasa a esta fila (revisar a mano)', detalle: det };
    return { texto: 'NINGUNA línea de REGISTRO_AGENDA_CAMBIOS escribió "' + cur + '": no lo puso la agenda (lo cargó una persona, o es de antes de la agenda)', detalle: det };
  }
  // la escritura original: crear / vincular / actualizar / mover… ¿por qué regla?
  const cuando = _fechaCorridaBA_(origen.corrida);
  det.push('la escritura original: corrida ' + origen.corrida + ' (' + (cuando ? Utilities.formatDate(cuando, RDV_TZ, 'dd/MM/yyyy HH:mm') : '?') +
           '), tipo "' + origen.tipo + '", fila ' + origen.fila + ', "' + origen.antes + '" → "' + origen.despues + '"');
  const antes = cacheDir.filter(function (x) { return !cuando || !x.fechaMs || x.fechaMs <= cuando.getTime() + 10 * 60000; });
  const ok = antes.filter(function (x) { return x.reglaVieja.cumple && _kbBA_(x.barrio) === _kbBA_(cur); });
  if (ok.length) {
    const x = ok[ok.length - 1];
    return { texto: via + 'la corrida ' + origen.corrida + ' ("' + origen.tipo + '"), por la REGLA DE CONFIANZA de la dirección: la cache tenía una geocodificación ' +
                    x.estado.toUpperCase() + ' (fila ' + x.fila + ' de AGENDA_GEOCODE, ' + (x.fecha ? _fechaTxtBA_(x) : 'sin fecha') + ', tipo ' + (x.tipo || '—') + ': ' +
                    x.reglaVieja.por + ')', detalle: det };
  }
  const mail = ev ? barrioDelLugarMailAgenda_(ev, null) : null;
  if (mail && _kbBA_(mail.barrio) === _kbBA_(cur)) {
    return { texto: via + 'la corrida ' + origen.corrida + ' ("' + origen.tipo + '"), por EL BARRIO DEL MAIL ("Lugar (mail)" es un barrio; AGENDA_BARRIO_DEL_MAIL)', detalle: det };
  }
  det.push('la cache de esa dirección hasta esa corrida: ' + (antes.length ? antes.map(function (x) {
    return 'fila ' + x.fila + ' ' + _fechaTxtBA_(x) + ' ' + x.estado + ' ' + (x.barrio || '—');
  }).join('; ') : 'NADA (la geocodificación de esa corrida no quedó guardada —antes del 16/10 noche un ERROR no se guardaba— o se pidió con otra consulta)'));
  return { texto: via + 'la corrida ' + origen.corrida + ' ("' + origen.tipo + '"), pero NINGUNA regla la explica con la cache de hoy (ni una geocodificación "ok" ' +
                  'de antes de esa corrida, ni el barrio del mail): revisar la línea de esa corrida y el log de ese día', detalle: det };
}

/**
 * Paso 106 (SÓLO LECTURA, SIN Maps ni Gmail): la regla de la geocodificación aproximada (AGENDA_BARRIO_APROXIMADO), medida con
 * la cache AGENDA_GEOCODE. (i) las filas de la agenda que ganarían barrio; (ii) la prueba contra los barrios del equipo;
 * (iii) las reuniones sin fila (no se pueden sin Gmail). Devuelve el resumen.
 */
function medirBarrioAproximado(opciones) {
  opciones = opciones || {};
  const t0 = Date.now();
  Logger.log('=== la geocodificación APROXIMADA como barrio — EN SECO, sólo lectura, sin Maps (AGENDA_BARRIO_APROXIMADO = %s; margen %s m) ===',
             AGENDA_BARRIO_APROXIMADO, BARRIO_APROXIMADO_MARGEN_M);
  const dest = opciones.dest || leerDestino_();
  const A = indicesAgenda_(dest.hdr);
  const pol = opciones.poligonos || _poligonosBarrios_();
  const filasCache = opciones.cacheFilas || _filasCacheGeoBA_();
  const cache = _mapaCacheBA_(filasCache);
  const R = { ganarian: [], confirmaria: [], cambiaria: [], contradicen: [], contradicenGeometria: [], coincidenEquipo: 0, noEvaluables: 0,
              aproximadasAgenda: 0, aproximadasEquipo: 0, sinCache: 0, error: '' };
  if (A.faltan.length) { R.error = 'faltan columnas de la agenda: ' + A.faltan.join(', '); Logger.log('>>> %s.', R.error); return R; }
  const val = function (f, n) { return A[n] == null ? '' : f.valores[A[n]]; };
  const txt = function (f) { return 'fila ' + f.fila + ' | ' + (f.figura || '(sin figura)') + ' | ' + (f.fecha ? fmtFecha_(f.fecha) : '—'); };
  const conAprox = function (f, dir) {
    if (!dir || _noEsDireccion_(dir)) return null;
    const usa = _geoQueUsariaAgendaBA_(cache, dir, pol);
    if (!usa.g) { R.sinCache++; return null; }
    const res = _barrioDeGeo_(usa.g, pol);
    return res.estado === 'aproximada' ? { res: res, g: usa.g } : null;
  };
  dest.filas.forEach(function (f) {
    const cur = str(val(f, 'Barrio')), esc = str(val(f, 'agenda_barrio_escrito'));
    const dirEsc = str(val(f, 'agenda_direccion_escrita'));
    const delSistema = !cur || (!!esc && _kbBA_(cur) === _kbBA_(esc));
    if (dirEsc && delSistema) {
      // (i) una fila de la agenda: Barrio vacío (lo ganaría) o el que escribió el sistema (lo confirmaría o, con una dirección nueva, lo cambiaría)
      const ev = _evDeFilaBA_(f, A);
      const x = conAprox(f, (ev && ev.direccion) || dirEsc);
      if (!x) return;
      R.aproximadasAgenda++;
      const r = _reglaBarrioConMargen_(x.res, ev, pol, BARRIO_MARGEN_M, { aproximado: true });
      if (!r.cumple) return;
      const item = { fila: f.fila, figura: f.figura, fecha: f.fecha ? fmtFecha_(f.fecha) : '', direccion: dirEsc, barrio: x.res.barrio,
                     distancia: Math.round(r.distancia), lugarMail: str(val(f, 'Lugar (mail)')), comunaMail: ev && ev.comuna != null ? ev.comuna : '', actual: cur, por: r.por };
      if (!cur) R.ganarian.push(item);
      else if (_kbBA_(cur) === _kbBA_(x.res.barrio)) R.confirmaria.push(item);
      else R.cambiaria.push(item);
      return;
    }
    if (!cur || delSistema) return;
    // (ii) LA PRUEBA: un barrio cargado por el equipo (distinto del que escribió el sistema, o sin traza)
    const dir = str(val(f, 'Dirección')) || dirEsc;
    const x = conAprox(f, dir);
    if (!x) return;
    R.aproximadasEquipo++;
    const ev = _evDeFilaBA_(f, A);
    const item = { fila: f.fila, figura: f.figura, fecha: f.fecha ? fmtFecha_(f.fecha) : '', direccion: dir, equipo: cur, regla: x.res.barrio, lugarMail: str(val(f, 'Lugar (mail)')) };
    // sólo la geometría (sin la condición de la comuna del mail): ¿el punto, lejos del borde, cae en otro barrio?
    const d = _distanciaAOtroBarrioM_(x.res.lng, x.res.lat, pol, x.res.barrio);
    item.distancia = d == null ? null : Math.round(d);
    const lejos = d != null && d > BARRIO_APROXIMADO_MARGEN_M;
    if (lejos && _kbBA_(x.res.barrio) !== _kbBA_(cur)) R.contradicenGeometria.push(item);
    if (!ev) { R.noEvaluables++; return; }
    const r = _reglaBarrioConMargen_(x.res, ev, pol, BARRIO_MARGEN_M, { aproximado: true });
    if (!r.cumple) { R.noEvaluables++; return; }
    item.por = r.por;
    if (_kbBA_(x.res.barrio) !== _kbBA_(cur)) R.contradicen.push(item); else R.coincidenEquipo++;
  });
  const linea = function (x) {
    return 'fila ' + x.fila + ' | ' + (x.figura || '(sin figura)') + ' | ' + x.fecha + ' | "' + x.direccion + '" | ' +
           (x.equipo != null ? 'equipo "' + x.equipo + '" / la regla "' + x.regla + '"' : (x.actual ? 'hoy "' + x.actual + '" → ' : '') + '"' + x.barrio + '"') +
           ' | a ' + (x.distancia == null ? '—' : x.distancia) + ' m del borde | Lugar (mail) "' + (x.lugarMail || '—') + '"' + (x.comunaMail !== undefined && x.comunaMail !== '' ? ' (C' + x.comunaMail + ')' : '') +
           (x.por ? ' | ' + x.por : '');
  };
  Logger.log('--- (i) filas de la agenda (con agenda_direccion_escrita y el Barrio vacío o del sistema) cuya dirección la cache da APROXIMADA: %s ---', R.aproximadasAgenda);
  Logger.log('  GANARÍAN barrio (Barrio vacío): %s', R.ganarian.length);
  R.ganarian.forEach(function (x) { Logger.log('    %s', linea(x)); });
  Logger.log('  confirmarían el del sistema (ya tienen ese barrio): %s', R.confirmaria.length);
  R.confirmaria.forEach(function (x) { Logger.log('    %s', linea(x)); });
  Logger.log('  darían OTRO que el del sistema (sólo cambiaría con una dirección nueva en el mail): %s', R.cambiaria.length);
  R.cambiaria.forEach(function (x) { Logger.log('    %s', linea(x)); });
  Logger.log('--- (ii) LA PRUEBA: filas con un barrio cargado por el EQUIPO cuya dirección la cache da APROXIMADA: %s ---', R.aproximadasEquipo);
  Logger.log('  con la regla completa (lejos del borde Y en la comuna o el barrio del mail): coinciden %s | CONTRADICEN %s | no evaluables (sin mail, o la regla no se cumple) %s',
             R.coincidenEquipo, R.contradicen.length, R.noEvaluables);
  R.contradicen.forEach(function (x) { Logger.log('    CONTRADICE: %s', linea(x)); });
  Logger.log('  sólo la geometría (a más de %s m del borde, sin mirar la comuna del mail; la regla nunca escribe así): dan otro barrio %s',
             BARRIO_APROXIMADO_MARGEN_M, R.contradicenGeometria.length);
  R.contradicenGeometria.forEach(function (x) { Logger.log('    (geometría) %s', linea(x)); });
  Logger.log('  (direcciones que no están en la cache: %s; no se piden a Maps)', R.sinCache);
  Logger.log('--- (iii) las reuniones del mail que todavía no tienen fila: NO se miden (sin Gmail no se pueden leer los mails; las que ya tienen fila están en (i)) ---');
  const listo = R.contradicen.length === 0;
  R.resumen = 'ganarían barrio ' + R.ganarian.length + ' | contradicen al equipo ' + R.contradicen.length + ' → ' + (listo ? 'LISTO' : 'NO LISTO') + ' para prender' +
              (listo && R.contradicenGeometria.length ? ' (ojo: ' + R.contradicenGeometria.length + ' con sólo la geometría darían otro barrio: mirarlas antes)' : '');
  Logger.log('=== RESUMEN: %s ===', R.resumen);
  Logger.log('paso 106: %s ms', Date.now() - t0);
  return R;
}

// ===================== Lecturas (sólo lectura) =====================

/** REGISTRO_AGENDA_CAMBIOS como objetos (sin modificar nada), con las corridas deshechas marcadas. `{ lineas, error }`. */
function _lineasCambiosBA_(opciones) {
  const out = { lineas: [], error: '' };
  let filas = opciones && opciones.cambios, deshechas = (opciones && opciones.deshechas) || null;
  try {
    if (!filas) {
      const ss = registrosAgenda_();
      const cam = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA_CAMBIOS);
      filas = cam && cam.getLastRow() >= 1 ? cam.getRange(1, 1, cam.getLastRow(), Math.max(9, cam.getLastColumn())).getValues() : [];
      if (!deshechas) {
        deshechas = {};
        const reg = ss.getSheetByName(RDV_HOJA_REGISTRO_AGENDA);
        if (reg && reg.getLastRow() > 1) {
          reg.getRange(2, 3, reg.getLastRow() - 1, 1).getValues().forEach(function (r) { const m = /^DESHACER (.+)$/.exec(str(r[0])); if (m) deshechas[m[1]] = true; });
        }
      }
    }
  } catch (err) { out.error = String(err && err.message || err); return out; }
  deshechas = deshechas || {};
  (filas || []).forEach(function (r, i) {
    if (i === 0 && str(r[0]) === 'corrida') return;   // el encabezado
    if (!str(r[0]) && !str(r[1])) return;
    out.lineas.push({ filaHoja: i + 1, corrida: str(r[0]), tipo: str(r[1]), fila: Number(r[2]) || r[2], col: r[3], columna: str(r[4]),
                      antes: str(r[5]), despues: str(r[6]), fondo: str(r[7]), uid: str(r[8]), deshecha: !!deshechas[str(r[0])] });
  });
  return out;
}

/** Todas las filas de la cache AGENDA_GEOCODE (no sólo la más nueva de cada consulta), con su número de fila. */
function _filasCacheGeoBA_() {
  const out = [];
  let sh;
  try { sh = intermediaAgenda_().getSheetByName(AGENDA_SOLAPA_GEOCODE); } catch (err) { Logger.log('  AVISO: no se pudo leer %s (%s)', AGENDA_SOLAPA_GEOCODE, err); return out; }
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, GEOCODE_ENCABEZADO.length).getValues().forEach(function (v, i) {
    if (!str(v[0])) return;
    out.push({ filaHoja: i + 2, consulta: str(v[0]), estado: str(v[1]), lat: v[2], lng: v[3], tipo: str(v[4]), parcial: String(v[5]).toUpperCase() === 'TRUE',
               barrioGoogle: str(v[6]), formateada: str(v[7]), detalle: str(v[8]), fecha: v[9], fechaMs: _msFechaGeo_(v[9]), componentes: str(v[10]) });
  });
  return out;
}

/**
 * La cache como la arma `_leerCacheGeocode_` (consulta → la entrada que vale): con AGENDA_GEO_AHORRO, la más nueva de cada
 * consulta (también los ERROR); sin él, la última fila y sin los ERROR. Marca `vigente` en las filas que quedan.
 */
function _mapaCacheBA_(filasCache) {
  const ahorro = typeof AGENDA_GEO_AHORRO !== 'undefined' && AGENDA_GEO_AHORRO;
  const m = new Map();
  filasCache.forEach(function (g) {
    if (g.estado === 'ERROR' && !ahorro) return;
    const antes = m.get(g.consulta);
    if (ahorro && antes && antes.fechaMs > g.fechaMs) return;
    m.set(g.consulta, g);
  });
  filasCache.forEach(function (g) { g.vigente = m.get(g.consulta) === g; });
  return m;
}

/**
 * La entrada de la cache que usaría hoy la agenda para `dir` (la misma elección que `deCache` en `_barrioAgenda_`):
 * `{ g, reintentaria }` (`reintentaria`: la agenda la volvería a pedir a Maps; se devuelve igual lo que hay, para medir).
 */
function _geoQueUsariaAgendaBA_(cache, dir, pol) {
  const qO = _consultaGeocode_(dir);
  const ahorro = typeof AGENDA_GEO_AHORRO !== 'undefined' && AGENDA_GEO_AHORRO;
  if (!ahorro) return { g: cache.get(qO) || null };
  const qE = _consultaGeocodeExpandida_(dir);
  const gE = cache.get(qE), eE = gE ? estadoCacheGeo_(gE, pol) : null;
  if (gE && eE !== 'reintentar') return { g: gE };
  const gO = qO !== qE ? cache.get(qO) : null;
  if (gO && _barrioDeGeo_(gO, pol).estado === 'ok') return { g: gO };
  const g = gE || gO || null;
  return { g: g, reintentaria: !!g };
}

/**
 * La reunión del mail de una fila de la agenda, rearmada con el MISMO parser (`_completarReunion_`) desde "Evento (mail)" y
 * "Dirección (mail)"; si el lugar que da no es el "Lugar (mail)" anotado, vale el anotado. null si la fila no tiene ninguno.
 */
function _evDeFilaBA_(f, A) {
  const v = function (n) { return A[n] == null ? '' : str(f.valores[A[n]]); };
  const evento = v('Evento (mail)'), lugarMail = v('Lugar (mail)');
  if (!evento && !lugarMail) return null;
  const lugarTexto = v('Dirección (mail)') || v('agenda_direccion_escrita') || v('Dirección');
  const armar = function (e) { return _completarReunion_({ eventoTexto: e, lugarTexto: lugarTexto, horaTexto: '', fecha: f.fecha || null }); };
  const ev = armar(evento || 'Encuentro con Vecinos, ' + lugarMail);
  if (lugarMail && normalizeText_(ev.lugar) !== normalizeText_(lugarMail)) {
    const e2 = armar('Encuentro con Vecinos, ' + lugarMail);
    ['comuna', 'subzona', 'eje', 'barrio', 'lugarTipo', 'lugar'].forEach(function (k) { ev[k] = e2[k]; });
    ev.lugarDe = 'Lugar (mail)';
  }
  return ev;
}

/**
 * "palabras|altura" de una dirección o de una consulta, con las abreviaturas expandidas (la consulta expandida de la agenda:
 * "Av. Int. Bullrich 55" y "Av. Intendente Bullrich 55" dan lo mismo), para juntar las consultas de la misma calle y altura.
 */
function _claveCalleBA_(dir) {
  if (!str(dir)) return '';
  const t = normalizeText_(_calleNumero_(_consultaGeocodeExpandida_(dir))).replace(/[.,]/g, ' ');
  const num = /\b(\d{1,5})\b/.exec(t);
  const palabras = t.replace(/\d+/g, ' ').split(/\s+/).filter(function (w) { return w.length >= 4; }).sort();
  if (!num || !palabras.length) return '';
  return palabras.join(' ') + '|' + num[1];
}

/** El barrio para comparar: el canónico de Comunas, normalizado. */
function _kbBA_(b) { return normalizeText_(_canonBarrioAg_(str(b)) || str(b)); }

/** La fecha de un id de corrida ("yyyyMMdd-HHmmss-xxxx"); null si no se lee. */
function _fechaCorridaBA_(corrida) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(str(corrida));
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}

/** La fecha de una fila de la cache, para el log. */
function _fechaTxtBA_(g) {
  return g.fechaMs ? Utilities.formatDate(new Date(g.fechaMs), RDV_TZ, 'dd/MM/yyyy HH:mm') : (str(g.fecha) || 'sin fecha');
}
