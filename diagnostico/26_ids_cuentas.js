/**
 * diagnostico/26_ids_cuentas.js — PASO 55, SÓLO LECTURA (08/10): los IDs de los encuentros (45_IdsCuentas.js) antes de
 * escribir nada. No escribe en ninguna planilla: todo va al log.
 *
 * Lee la lista ("Agenda JM" y "Agenda funcionarios") y la base, y corre EL MISMO cruce que van a correr el paso 57 (todas
 * las filas) y la corrida de la hora (filas activas): `cruzarIds_`. Dice, por solapa: cuántos cruzan por la misma fecha y
 * cuántos por fecha distinta (±IDS_DIAS_FECHA_DISTINTA), los ambiguos, los sin fila y los conflictos del invariante; lista
 * TODOS los de fecha distinta y los de la misma fecha con el lugar NO comparable; el caso de control (IDS_CASO_CONTROL:
 * 3735-SEPJDGAG → fila 805, y que SE ESCRIBA); lo que no se reconoce (Funcionario, Barrio / Comuna, Tipo); las fechas de
 * envío; y las filas de la base que quedarían sin ID, por mes y figura.
 * `opciones.tope` (lo usa manana()): cuántas líneas por motivo de "lo que NO se cruza" y de "misma fecha, lugar no
 * comparable" (el resto, contado; todas van a IDS_SIN_CRUZAR con el paso 56). Sin tope: todas.
 */
function medirIds(opciones) {
  const tope = (opciones && opciones.tope) || null;
  const t0 = Date.now();
  Logger.log('=== paso 55 — los IDs de los encuentros: MEDICIÓN (sólo lectura: no escribe nada) ===');
  Logger.log('  base: %s', descripcionHojaDestino_());
  const dest = leerDestino_();
  const lista = leerListaIds_();
  _logListaIds_(lista);
  const col = agregarColumnasIds_(dest.sh, false);
  Logger.log('  columnas en la base: %s', col.faltan.length
    ? 'FALTAN ' + col.faltan.join(' y ') + ' → el paso 57 las agrega al final, a partir de ' + col.desde
    : 'están las dos ("' + COLUMNA_ID_CUENTAS + '" y "' + COLUMNA_FECHA_ENVIO + '")');
  _logIdsNoValidos_diag26(lista);

  const fantasma = idsEnFilasFantasmaIds_(dest);
  if (fantasma.length) Logger.log('  IDs en filas "fantasma" (sin Figura, FECHA ni Inscriptos: cuentan como ocupados): %s', fantasma.length);
  const res = cruzarIds_(lista.registros, dest, { historial: true, idsFantasma: fantasma });
  const resHora = cruzarIds_(lista.registros, dest, { historial: false, idsFantasma: fantasma });
  const formulas = formulasEnColumnasIds_(dest.sh, res.cols);
  Object.keys(formulas).forEach(function (n) {
    if (formulas[n]) Logger.log('  >>> "%s" ya existe y tiene %s celdas con FÓRMULA: el paso 57 NO escribe esa columna.', n, formulas[n]);
  });
  logIds_(res);

  _logFechaDistinta_diag26(res);
  _logLugarNoComparable_diag26(res, tope);
  const control = _logCasoControl_diag26(res);
  _logNoCruzan_diag26(res, tope);
  _logNoReconocidos_diag26(lista, res);
  _logTipos_diag26(lista, res);
  _logEnvios_diag26(lista, res);
  _logSinId_diag26(lista, res);

  Logger.log('--- qué escribiría ---');
  Logger.log('  el paso 57 (el historial, TODAS las filas que ya pasaron): %s IDs y %s fechas de envío%s; %s cruzan con una reunión ' +
             'que todavía no pasó (las escribe la corrida de la hora, después)', res.conteo.escribeId, res.conteo.escribeFecha,
             col.faltan.length ? ' (después de agregar ' + col.faltan.join(' y ') + ')' : '', res.conteo.reunionFutura);
  Logger.log('  la corrida de la hora (filas activas, %s, que ya pasaron), si se prendiera HOY sin el paso 57: %s IDs y %s fechas ' +
             'de envío; %s cruzan con filas cerradas (las deja para el paso 57); %s con una reunión que todavía no pasó',
             descActivas_(), resHora.conteo.escribeId, resHora.conteo.escribeFecha, resHora.conteo.fuera, resHora.conteo.reunionFutura);
  Logger.log('  IDS_SIN_CRUZAR tendría %s líneas (el paso 56 en seco la escribe en la intermedia).', res.sinCruzar.length);
  Logger.log('  Qué NO dice esto:');
  Logger.log('   - "sin fila" no quiere decir que la reunión no se hizo: la Fecha de la lista es la PLANEADA. Puede ser una');
  Logger.log('     reunión que se movió más de ±%s días, que cambió de lugar o que se canceló; la lista sale con el motivo.', IDS_DIAS_FECHA_DISTINTA);
  Logger.log('   - las futuras sin fila no se cuentan como sin fila: la agenda crea la fila cuando llega el mail de esa semana.');
  Logger.log('   - un ID se escribe recién cuando la reunión de su fila ya pasó (antes de eso puede faltar la fila buena).');
  Logger.log('tiempo: %s s', ((Date.now() - t0) / 1000).toFixed(1));
  return { conteo: res.conteo, porSolapa: res.porSolapa, hora: resHora.conteo, sinCruzar: res.sinCruzar.length, control: control,
           solapasSinLeer: lista.solapas.filter(function (s) { return s.error; }).map(function (s) { return s.solapa + ': ' + s.error; }),
           columnasFaltan: col.faltan, formulas: formulas, tz: lista.tz,
           idNoValido: lista.solapas.reduce(function (a, s) { return a + s.idNoValido.length; }, 0) };
}

/** Una línea por registro: "ID | solapa fila N | Funcionario | lugar | dd/MM/yyyy". */
function _descRegistro_diag26(r) {
  return r.id + ' | ' + r.solapa + ' fila ' + r.filaLista + ' | ' + (r.funcionario || '(sin Funcionario)') + ' | ' +
         (r.lugarTexto || '(sin lugar)') + (r.tipoTexto ? ' | ' + r.tipoTexto : '') + ' | ' + (r.fecha ? fmtFecha_(r.fecha) : '"' + r.fechaTexto + '"');
}

function _descFinal_diag26(it) {
  const f = it.final;
  if (f.estado === 'escribe') return 'SE ESCRIBE';
  if (f.estado === 'ya_estaba') return 'ya estaba en esa fila';
  if (f.estado === 'fuera') return f.motivo === 'reunion_futura' ? 'cruza; se escribe cuando la reunión pase' : 'cruza, fuera de esta corrida';
  return 'NO se escribe: ' + f.motivo + (f.detalle ? ' (' + f.detalle + ')' : '');
}

function _logFechaDistinta_diag26(res) {
  const fd = res.items.filter(function (it) { return it.ev.estado === 'cruza' && it.ev.nivel === 'fecha_distinta'; });
  Logger.log('--- los cruces por FECHA DISTINTA (±%s días: la figura y el lugar coinciden y hay UNA sola fila): %s, todos ---',
             IDS_DIAS_FECHA_DISTINTA, fd.length);
  fd.sort(function (a, b) { return a.r.fecha - b.r.fecha; }).forEach(function (it) {
    const e = it.ev.e, f = e.x.f;
    Logger.log('  %s\n     → fila %s (%s, %s, %s) %s%s días | %s | %s', _descRegistro_diag26(it.r), f.fila, f.figura || 'sin figura',
               fmtFecha_(f.fecha), f.barrio || 'sin barrio', e.dias > 0 ? '+' : '−', Math.abs(e.dias), comoCruzoIds_(it), _descFinal_diag26(it));
  });
}

function _logCasoControl_diag26(res) {
  const k = IDS_CASO_CONTROL;
  // el registro con ese ID que no quedó como copia "repetido" (el mismo ID dos veces en la lista: vale uno)
  const conId = res.items.filter(function (x) { return x.r.id === normIdIds_(k.id); });
  const it = conId.filter(function (x) { return x.final.estado !== 'repetido'; })[0] || conId[0];
  // la reunión de control (por si la fila se movió de número): figura + fecha + barrio
  const reunion = res.filas.filter(function (x) {
    return normalizeText_(x.f.figura) === normalizeText_(k.figura) && x.f.fecha && ymd_(x.f.fecha) === k.fecha.replace(/-/g, '') &&
           normalizeText_(x.f.barrio) === normalizeText_(k.barrio);
  }).map(function (x) { return x.f.fila; });
  Logger.log('--- el caso de control: %s → tiene que ser la fila %s (%s, %s, %s; hoy en la fila %s) ---', k.id, k.fila, k.figura,
             k.fecha, k.barrio, reunion.join(', ') || 'NINGUNA');
  if (!it) { Logger.log('  NO ESTÁ en la lista (¿cambió el ID?).'); return { ok: false, texto: 'no está en la lista' }; }
  Logger.log('  %s', _descRegistro_diag26(it.r));
  if (it.ev.estado !== 'cruza') {
    Logger.log('  >>> NO CRUZA: %s — %s. Candidatas: %s', it.ev.motivo, it.ev.detalle,
               (it.ev.cands || []).map(_descCandidataIds_).join(' · ') || 'ninguna');
    return { ok: false, texto: 'no cruza: ' + it.ev.motivo };
  }
  const f = it.ev.e.x.f;
  Logger.log('  → fila %s (%s, %s, %s) por %s | %s', f.fila, f.figura, fmtFecha_(f.fecha), f.barrio || 'sin barrio', comoCruzoIds_(it),
             _descFinal_diag26(it));
  const okFila = f.fila === k.fila, okReunion = reunion.indexOf(f.fila) >= 0;
  // que cruce no alcanza: tiene que quedar escrito (o ya estar); si otro ID le gana la fila, no se escribe
  const seEscribe = it.final.estado === 'escribe' || it.final.estado === 'ya_estaba';
  const texto = okReunion && !seEscribe ? 'CRUZA con la fila ' + f.fila + ' pero NO se escribe (' + _descFinal_diag26(it) + ').'
    : okFila && okReunion ? 'OK: es la fila ' + k.fila + '.'
    : okReunion ? 'OK por la reunión (fila ' + f.fila + '; la ' + k.fila + ' se movió de número).'
    : 'DISTINTO: da la fila ' + f.fila + ' y se esperaba la ' + k.fila + '.';
  Logger.log('  >>> %s', texto);
  return { ok: okReunion && seEscribe, fila: f.fila, texto: texto + ' (' + comoCruzoIds_(it) + ')' };
}

/** Lo que en la columna ID no es un ID, y los IDs con una forma que no es la de siempre (número-letras). */
function _logIdsNoValidos_diag26(lista) {
  Logger.log('--- la columna ID ---');
  lista.solapas.forEach(function (s) {
    const raros = s.registros.filter(function (r) { return !/^\d+-[A-Z0-9]+$/.test(r.id); });
    Logger.log('  "%s": no son un ID (no se cruzan) %s%s | IDs con otra forma que "número-LETRAS" (se cruzan igual) %s%s', s.solapa,
               s.idNoValido.length, s.idNoValido.length ? ': ' + s.idNoValido.slice(0, 15).map(function (x) {
                 return 'fila ' + x.filaLista + ' "' + x.texto + '"'; }).join(' | ') : '',
               raros.length, raros.length ? ': ' + raros.slice(0, 15).map(function (r) { return '"' + r.idTexto + '"'; }).join(' | ') : '');
  });
}

/**
 * Los cruces de la MISMA fecha con el lugar NO comparable (la lista no dice un lugar que se reconozca, o la fila no tiene
 * barrio ni comuna): se escriben —la figura y la fecha alcanzan—, pero conviene verlos. Con `tope`, los primeros.
 */
function _logLugarNoComparable_diag26(res, tope) {
  const l = res.items.filter(function (it) {
    return it.ev.estado === 'cruza' && it.ev.nivel === 'misma_fecha' && !it.r.quien.seguridad && it.ev.e.lug.coincide === null;
  }).sort(function (a, b) { return b.r.fecha - a.r.fecha; });
  Logger.log('--- los cruces de la MISMA fecha con el lugar NO comparable (la figura y la fecha alcanzan): %s ---', l.length);
  (tope ? l.slice(0, tope) : l).forEach(function (it) {
    const f = it.ev.e.x.f;
    Logger.log('  %s → fila %s (%s, %s, %s) | %s', _descRegistro_diag26(it.r), f.fila, f.figura || 'sin figura', fmtFecha_(f.fecha),
               f.barrio || 'sin barrio', _descFinal_diag26(it));
  });
  if (tope && l.length > tope) Logger.log('  (y %s más)', l.length - tope);
}

function _logNoCruzan_diag26(res, tope) {
  const grupos = {};
  res.items.forEach(function (it) {
    const f = it.final;
    if (f.estado !== 'no') return;
    (grupos[f.motivo] = grupos[f.motivo] || []).push(it);
  });
  const orden = ['ambiguo', 'fila_disputada', 'fila_tomada', 'fila_con_otro_id', 'id_en_otra_fila', 'id_repetido', 'lugar_distinto',
                 'seguridad_sin_lugar', 'fecha_distinta_sin_lugar', 'fecha_distinta_conjunta', 'conjunta_sin_fila', 'fila_reprogramada',
                 'sin_fila', 'funcionario_en_parte', 'funcionario_no_reconocido', 'fecha_imposible', 'sin_fecha'];
  Logger.log('--- lo que NO se cruza, por motivo (es lo que va a IDS_SIN_CRUZAR%s) ---',
             tope ? '; acá, los primeros ' + tope + ' de cada motivo, sin las candidatas: todos, con el paso 56' : '');
  Object.keys(grupos).sort(function (a, b) { return orden.indexOf(a) - orden.indexOf(b); }).forEach(function (m) {
    const l = grupos[m].sort(function (a, b) { return (b.r.fecha || 0) - (a.r.fecha || 0); });
    Logger.log('  %s: %s', m, l.length);
    (tope ? l.slice(0, tope) : l).forEach(function (it) {
      if (tope) { Logger.log('    %s — %s', _descRegistro_diag26(it.r), it.final.detalle || ''); return; }
      Logger.log('    %s\n       %s%s', _descRegistro_diag26(it.r), it.final.detalle || '',
                 (it.ev.cands || []).length ? ' | candidatas: ' + it.ev.cands.slice(0, 4).map(_descCandidataIds_).join(' · ') : '');
    });
    if (tope && l.length > tope) Logger.log('    (y %s más)', l.length - tope);
  });
  const fut = res.items.filter(function (it) { return it.final.motivo === 'futura_sin_fila'; });
  Logger.log('  futuras, todavía sin fila (no van a IDS_SIN_CRUZAR): %s%s', fut.length,
             fut.length ? ' — de ' + fmtFecha_(fut.map(function (it) { return it.r.fecha; }).sort(function (a, b) { return a - b; })[0]) + ' en adelante' : '');
  const esp = res.items.filter(function (it) { return it.final.motivo === 'reunion_futura'; });
  Logger.log('  cruzan con una reunión que todavía no pasó (se escriben después; no van a IDS_SIN_CRUZAR): %s%s', esp.length,
             esp.length ? ' — filas ' + esp.map(function (it) { return it.final.fila; }).sort(function (a, b) { return a - b; }).join(', ') : '');
}

function _contar_diag26(m, k) { m[k] = (m[k] || 0) + 1; }
function _top_diag26(m, n) {
  return Object.keys(m).sort(function (a, b) { return m[b] - m[a] || a.localeCompare(b); }).slice(0, n || 40)
    .map(function (k) { return '"' + k + '" ' + m[k]; }).join(' | ');
}

function _logNoReconocidos_diag26(lista, res) {
  const fun = {}, partes = {}, porSolapa = {}, lugar = {};
  let sinLugar = 0, lugarOk = 0;
  lista.registros.forEach(function (r) {
    if (!r.quien.seguridad && !r.quien.norm.length) _contar_diag26(fun, r.funcionario || '(vacío)');
    r.quien.noReconocidas.forEach(function (p) { _contar_diag26(partes, p); });
    if (r.quien.porSolapa) _contar_diag26(porSolapa, r.funcionario || '(vacío)');
    if (r.lugar.vacio) sinLugar++;
    else if (!r.lugar.reconocido) _contar_diag26(lugar, r.lugarTexto);
    else lugarOk++;
  });
  Logger.log('--- lo que la lista dice y no se reconoce ---');
  Logger.log('  Funcionario sin ninguna figura de la base (%s valores): %s', Object.keys(fun).length, _top_diag26(fun) || '—');
  Logger.log('  partes de un Funcionario que no se reconocen (el resto sí): %s', _top_diag26(partes) || '—');
  Logger.log('  "Agenda JM" sin una figura reconocible → Macri por la solapa: %s', _top_diag26(porSolapa) || '—');
  const lugaresFun = {};
  lista.registros.forEach(function (r) { (r.quien.lugares || []).forEach(function (p) { _contar_diag26(lugaresFun, p); }); });
  Logger.log('  un LUGAR pegado al Funcionario ("Gabino Tapia - Retiro": no es una persona, no frena el cruce): %s', _top_diag26(lugaresFun) || '—');
  const seg = lista.registros.filter(function (r) { return r.quien.seguridad; }).length;
  const conj = lista.registros.filter(function (r) { return r.quien.norm.length > 1; }).length;
  Logger.log('  Seguridad en tu barrio: %s | conjuntas (2+ figuras): %s', seg, conj);
  Logger.log('  Barrio / Comuna: reconocido %s | vacío o "-" %s | NO reconocido (no compara: ni coincide ni descarta) %s: %s',
             lugarOk, sinLugar, Object.keys(lugar).reduce(function (a, k) { return a + lugar[k]; }, 0), _top_diag26(lugar) || '—');
}

function _logTipos_diag26(lista, res) {
  const tipos = {};
  lista.registros.forEach(function (r) { if (r.tipoTexto || r.tipo) _contar_diag26(tipos, (r.tipoTexto || '(vacío)') + ' → ' + (r.tipo || 'SIN TIPO')); });
  const evMacri = {};
  const macri = normalizeText_(IDS_FIGURA_SOLAPA_JM);
  res.filas.forEach(function (x) { if (x.fig.indexOf(macri) >= 0) _contar_diag26(evMacri, x.tipo || 'sin tipo'); });
  const porTipo = res.items.filter(function (it) { return it.ev.estado === 'cruza' && (it.ev.desempate || []).indexOf('tipo') >= 0; }).length;
  const porLugar = res.items.filter(function (it) { return it.ev.estado === 'cruza' && (it.ev.desempate || []).indexOf('lugar') >= 0; }).length;
  Logger.log('--- el Tipo ("Agenda JM") ---');
  Logger.log('  Tipo de la lista → categoría: %s', _top_diag26(tipos) || '—');
  Logger.log('  EVENTO de las filas de Macri → categoría: %s', _top_diag26(evMacri) || '—');
  Logger.log('  cruces del mismo día decididos por el lugar: %s | por el Tipo: %s', porLugar, porTipo);
}

function _percentil_diag26(v, p) {
  if (!v.length) return '—';
  const s = v.slice().sort(function (a, b) { return a - b; });
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
}

function _logEnvios_diag26(lista, res) {
  Logger.log('--- la Fecha de envío ---');
  const porSolapa = {};
  const dias = [], anio = [], invalidas = [];
  lista.registros.forEach(function (r) {
    const s = porSolapa[r.solapa] = porSolapa[r.solapa] || {};
    _contar_diag26(s, r.envio.estado);
    if (r.envio.estado === 'ok' && r.fecha) dias.push(diasEntre_(r.fecha, r.envio.fecha));
    if (r.envio.estado === 'anio') anio.push(r);
    if (r.envio.estado === 'invalida' && invalidas.length < 15) invalidas.push(r);
  });
  Object.keys(porSolapa).forEach(function (k) {
    const s = porSolapa[k];
    Logger.log('  "%s": ok %s | vacía %s | #N/A u otro error %s | "-" %s | no es fecha %s | AÑO QUE NO CIERRA %s', k, s.ok || 0, s.vacia || 0,
               s.error || 0, s.guion || 0, s.invalida || 0, s.anio || 0);
  });
  Logger.log('  días del envío a la reunión (las ok; fecha de la lista − envío): mín %s | p10 %s | mediana %s | p90 %s | máx %s | ' +
             'después de la reunión %s | más de 30 días antes %s', _percentil_diag26(dias, 0), _percentil_diag26(dias, 0.1),
             _percentil_diag26(dias, 0.5), _percentil_diag26(dias, 0.9), _percentil_diag26(dias, 1),
             dias.filter(function (d) { return d < 0; }).length, dias.filter(function (d) { return d > 30; }).length);
  Logger.log('  año que no cierra (vacía y se lista en IDS_SIN_CRUZAR), todos: %s', anio.length);
  anio.forEach(function (r) { Logger.log('    %s | la Fecha de envío dice %s', _descRegistro_diag26(r), r.envioTexto || fmtFecha_(r.envio.leida)); });
  if (invalidas.length) {
    Logger.log('  no es fecha (vacía), ejemplos: %s', invalidas.map(function (r) { return r.id + ' "' + r.envioTexto + '"'; }).join(' | '));
  }
}

/** Las filas de la base que quedarían SIN "ID cuentas" después del paso 57, por mes y figura (en los meses de la lista). */
function _logSinId_diag26(lista, res) {
  const fechas = lista.registros.map(function (r) { return r.fecha; }).filter(Boolean).sort(function (a, b) { return a - b; });
  Logger.log('--- filas de la base SIN "%s" después del paso 57, por mes y figura ---', COLUMNA_ID_CUENTAS);
  if (!fechas.length) { Logger.log('  (la lista no tiene fechas)'); return; }
  const desde = Utilities.formatDate(fechas[0], RDV_TZ, 'yyyy-MM'), hasta = Utilities.formatDate(fechas[fechas.length - 1], RDV_TZ, 'yyyy-MM');
  const hoy = ymd_(hoyMediodia_());
  const meses = {};
  let antes = 0, sinFecha = 0;
  res.filas.forEach(function (x) {
    const f = x.f;
    if (!f.fecha) { if (!res.filasConId[f.fila]) sinFecha++; return; }
    if (ymd_(f.fecha) >= hoy) return;   // las de hoy y las futuras todavía no tienen por qué tener ID (se escribe cuando pasó)
    const m = Utilities.formatDate(f.fecha, RDV_TZ, 'yyyy-MM');
    if (m < desde) { antes++; return; }
    const g = meses[m] = meses[m] || { filas: 0, con: 0, sin: 0, figuras: {} };
    g.filas++;
    if (res.filasConId[f.fila]) g.con++;
    else { g.sin++; _contar_diag26(g.figuras, f.figura || (x.seguridad ? 'Seguridad (sin figura)' : 'sin figura')); }
  });
  Logger.log('  la lista va de %s a %s; las filas anteriores (%s) no se cuentan; sin fecha y sin ID: %s', desde, hasta, antes, sinFecha);
  Object.keys(meses).sort().forEach(function (m) {
    const g = meses[m];
    Logger.log('  %s: %s filas | con ID %s | SIN ID %s%s', m, g.filas, g.con, g.sin, g.sin ? ' → ' + _top_diag26(g.figuras, 12) : '');
  });
}
