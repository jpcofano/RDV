/**
 * diagnostico/27_guardian.js — SÓLO LECTURA (08/10): lo que se puede medir del GUARDIÁN de las columnas del sistema sin su
 * texto. El usuario pidió "ocultar y proteger las columnas del sistema con el guardián (el texto que te pasé)", pero ese
 * texto NO llegó a la sesión (sólo la mención): sus reglas —qué columnas, cómo se protegen, qué hace la corrida si
 * detecta una desalineación— no están implementadas. Esto es lo que no depende de ellas, y no escribe nada:
 *
 *   1. `inventarioColumnasSistema()` — qué columnas del sistema hay en la base (traza, agenda, IDs, derivadas), si están
 *      ocultas y qué protecciones las cubren HOY; y una PROPUESTA (mía, a confirmar con el texto) de cuáles ocultar y cómo
 *      proteger.
 *   2. `alineacionBase_()` — "las celdas que difieren hoy": las filas cuyas trazas no cuadran con la fila. La traza de un
 *      formulario (form_origen / form_clave) tiene que nombrar a una figura de la fila y caer cerca de su fecha; la de la
 *      agenda (agenda_*_escrita) tiene que coincidir con FECHA, HORA y Barrio (si difiere UNA, la tocó el equipo; si
 *      difieren DOS o más, la fila no es la que escribió el sistema). Una desalineación —alguien ordena sólo las columnas
 *      del equipo y las del sistema quedan quietas— hace que muchas filas dejen de cuadrar a la vez.
 *   3. `pruebaOrdenParcial_()` — la prueba del orden parcial, EN MEMORIA, sobre la base de hoy: ordena sólo las columnas del
 *      equipo (por Figura y FECHA) dejando las del sistema donde están, y mide cuántas filas MÁS dejan de cuadrar (el salto
 *      respecto de hoy); lo mismo con un orden parcial CHICO (sólo las últimas GUARDIAN_FILAS_PRUEBA_CHICA_ filas: el mes
 *      activo), que tiene que ver la racha. El orden de filas enteras se mide también, pero NO prueba nada por sí solo: cada
 *      fila se mira sola, así que da lo mismo que hoy por construcción (segunda revisión, 08/10).
 */

/**
 * Cuándo es "DESALINEADA": cuántas filas que no cuadran (o qué proporción de las que tienen traza) —un orden parcial de toda
 * la base mueve casi todas—, o una RACHA de filas seguidas que no cuadran —un orden parcial de un pedazo; una corrección
 * suelta del equipo da racha 1—.
 */
const GUARDIAN_MIN_FILAS_ = 5;
const GUARDIAN_PROPORCION_ = 0.05;
const GUARDIAN_RACHA_ = 6;
/** La fecha del formulario cruzado puede estar lejos de la fila (fecha_fin, reprogramaciones): más allá de esto, no cuadra. */
const GUARDIAN_DIAS_FORMULARIO_ = 21;
/** El orden parcial CHICO de la prueba: sólo las últimas filas de datos (el mes activo, donde trabaja el equipo). */
const GUARDIAN_FILAS_PRUEBA_CHICA_ = 30;
/** La propuesta de qué columnas del sistema OCULTAR: las internas (la traza y las agenda_*); las del equipo quedan a la vista. */
const GUARDIAN_PROPUESTA_OCULTAR_ = ['RDV_UID', 'form_origen', 'form_score', 'form_nivel', 'form_fecha_match', 'form_clave',
  'agenda_uid', 'agenda_mail', 'agenda_version', 'agenda_hora_escrita', 'agenda_direccion_escrita', 'agenda_barrio_escrito',
  'agenda_fecha_escrita', 'agenda_status_escrito'];

/** Las columnas del sistema de la base, por grupo: `[{ grupo, nombre, col (0-based) }]` (sólo las que están). */
function columnasDelSistema_(hdr) {
  const grupos = [['traza', COLUMNAS_TRAZA], ['agenda', COLUMNAS_AGENDA], ['ids', COLUMNAS_IDS], ['derivadas', columnasDerivadas_()]];
  const out = [];
  grupos.forEach(function (g) {
    g[1].forEach(function (n) {
      const c = g[0] === 'ids' ? findIdxOr_(hdr, IDS_ALIAS_COLUMNAS[n] || [n], true) : findIdxOr_(hdr, [n], true);
      if (c != null && !out.some(function (x) { return x.col === c; })) out.push({ grupo: g[0], nombre: str(hdr[c]), col: c });
    });
  });
  return out.sort(function (a, b) { return a.col - b.col; });
}

/**
 * **1. El inventario** (sólo lectura): qué columnas del sistema hay, cuáles están ocultas y qué protecciones las cubren hoy;
 * y la propuesta de qué ocultar y cómo proteger (a confirmar con el texto del guardián).
 */
function inventarioColumnasSistema() {
  const sh = ssDestino_().getSheetByName(RDV_HOJA_DESTINO);
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const cols = columnasDelSistema_(hdr);
  const prot = (sh.getProtections && typeof SpreadsheetApp.ProtectionType !== 'undefined')
    ? sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).map(function (p) {
        const r = p.getRange();
        return { desde: r.getColumn(), hasta: r.getLastColumn(), fila1: r.getRow(), fila2: r.getLastRow(),
                 desc: p.getDescription ? p.getDescription() : '', advertencia: p.isWarningOnly ? p.isWarningOnly() : null };
      })
    : [];
  Logger.log('--- ocultar y proteger: las columnas del sistema de "%s" (HOY) ---', RDV_HOJA_DESTINO);
  const porGrupo = {};
  const filas = cols.map(function (x) {
    const c = x.col + 1;
    const oculta = sh.isColumnHiddenByUser ? sh.isColumnHiddenByUser(c) : null;
    // una protección cuenta si cubre los DATOS de la columna (no sólo el encabezado o unas filas)
    const cubre = prot.filter(function (p) { return p.desde <= c && c <= p.hasta && p.fila1 <= 2 && p.fila2 >= sh.getLastRow(); });
    const linea = { grupo: x.grupo, nombre: x.nombre, letra: _a1_(1, c).replace(/\d+$/, ''), oculta: oculta,
                    proteccion: cubre.map(function (p) { return (p.advertencia ? 'advertencia' : 'real') + (p.desc ? ' ("' + p.desc + '")' : ''); }).join('; '),
                    proponeOcultar: GUARDIAN_PROPUESTA_OCULTAR_.map(normalizeHeader_).indexOf(normalizeHeader_(x.nombre)) >= 0 };
    (porGrupo[x.grupo] = porGrupo[x.grupo] || []).push(linea);
    return linea;
  });
  Object.keys(porGrupo).forEach(function (g) {
    const l = porGrupo[g];
    Logger.log('  %s (%s): %s', g, l.length, l.map(function (x) {
      return x.letra + ' ' + x.nombre + (x.oculta ? ' [OCULTA]' : '') + (x.proteccion ? ' [protegida: ' + x.proteccion + ']' : '');
    }).join(' | '));
  });
  const ocultas = filas.filter(function (x) { return x.oculta; }).length;
  const protegidas = filas.filter(function (x) { return x.proteccion; }).length;
  Logger.log('  hoy: %s columnas del sistema | ocultas %s | con alguna protección %s', filas.length, ocultas, protegidas);
  const prop = filas.filter(function (x) { return x.proponeOcultar; });
  Logger.log('  PROPUESTA (mía: el texto del guardián no llegó; a confirmar): OCULTAR las %s internas (%s); dejar a la vista las del ' +
             'equipo (No participa, Origen fila, Tocado por el equipo, las "(mail)", Conjunta con, ID cuentas, Fecha envío campañas); ' +
             'PROTEGER con advertencia, como las derivadas, todas las del sistema. Nada de esto se hizo.',
             prop.length, prop.map(function (x) { return x.letra; }).join(', ') || '—');
  return { columnas: filas, ocultas: ocultas, protegidas: protegidas, proponeOcultar: prop.length };
}

/**
 * **2. Las filas cuyas trazas no cuadran con la fila** (en memoria, sobre un destino ya armado: `leerDestino_()` o
 * `armarDestino_` de un bloque). Devuelve `{ trazadas, noCuadran: [{ fila, figura, fecha, motivos }], veredicto }`.
 */
function alineacionBase_(dest) {
  const hdr = dest.hdr;
  const iClave = dest.T ? dest.T.clave : null, iOrig = dest.T ? dest.T.origen : null;
  const A = {};
  ['agenda_uid', 'agenda_fecha_escrita', 'agenda_hora_escrita', 'agenda_barrio_escrito', 'Tocado por el equipo'].forEach(function (n) { A[n] = findIdxOr_(hdr, [n], true); });
  const iHora = dest.D['HORA'], iBarrio = dest.D['Barrio'];
  const out = { trazadas: 0, noCuadran: [] };
  dest.filas.forEach(function (f) {
    const v = f.valores;
    const motivos = [];
    let trazada = false;
    // la traza del formulario
    const origen = iOrig != null ? str(v[iOrig]) : '';
    if (origen) {
      trazada = true;
      const figsForm = figurasEnTexto_(origen).map(normalizeText_);
      const figsFila = figurasDeFilaIds_(f);
      if (figsForm.length && figsFila.length && !figsForm.some(function (k) { return figsFila.indexOf(k) >= 0; })) {
        motivos.push('el formulario nombra a ' + figurasEnTexto_(origen).join(' / ') + ', no a ' + (f.figura || 'la figura de la fila'));
      }
      const m = /\|(\d{8})/.exec(iClave != null ? str(v[iClave]) : '');
      const ff = m ? alMediodia_(Number(m[1].slice(0, 4)), Number(m[1].slice(4, 6)), Number(m[1].slice(6, 8))) : null;
      // Sin form_clave (las filas escritas antes del 02/10) no hay cierre que ancle el año y el mes: no se compara la fecha
      // (anclarla en la fila daría falsos positivos —"10-12 hs" en noviembre es el 10/12— y es circular). Queda la figura.
      const det = ff ? detectFecha_(origen, ff) : null;
      const d = det && det.mejor && f.fecha ? diasEntre_(f.fecha, det.mejor) : null;
      if (d != null && Math.abs(d) > GUARDIAN_DIAS_FORMULARIO_) motivos.push('el formulario es del ' + fmtFecha_(det.mejor) + ' (a ' + Math.abs(d) + ' días)');
    }
    // la traza de la agenda: FECHA, HORA y Barrio contra lo que escribió (una distinta: la tocó el equipo; dos o más: otra fila)
    if (A.agenda_uid != null && str(v[A.agenda_uid])) {
      trazada = true;
      const dif = [];
      const fe = A.agenda_fecha_escrita != null ? v[A.agenda_fecha_escrita] : '';
      if (!esVacio_(fe) && f.fecha && _ymdCualquiera_(fe) && _ymdCualquiera_(fe) !== ymd_(f.fecha)) dif.push('FECHA');
      const he = A.agenda_hora_escrita != null ? v[A.agenda_hora_escrita] : '';
      const hh = iHora != null ? v[iHora] : '';
      if (!esVacio_(he) && !esVacio_(hh) && _horaCualquiera_(he) != null && _horaCualquiera_(he) !== _horaCualquiera_(hh)) dif.push('HORA');
      const be = A.agenda_barrio_escrito != null ? str(v[A.agenda_barrio_escrito]) : '';
      const bb = iBarrio != null ? str(v[iBarrio]) : '';
      if (be && bb && normalizeText_(be) !== normalizeText_(bb)) dif.push('Barrio');
      // lo que el equipo cambió a propósito ya lo anota la agenda en "Tocado por el equipo" (una reprogramación): no cuenta
      const tocado = A['Tocado por el equipo'] != null ? str(v[A['Tocado por el equipo']]).split(/\s*,\s*/).map(normalizeHeader_) : [];
      const sinExplicar = dif.filter(function (n) { return tocado.indexOf(normalizeHeader_(n)) < 0; });
      if (dif.length >= 2 && sinExplicar.length) motivos.push('la agenda escribió otra ' + dif.join(', ') + ' en esta fila');
    }
    if (trazada) out.trazadas++;
    if (motivos.length) out.noCuadran.push({ fila: f.fila, figura: f.figura, fecha: f.fecha, motivos: motivos });
  });
  const umbral = Math.max(GUARDIAN_MIN_FILAS_, Math.ceil(GUARDIAN_PROPORCION_ * out.trazadas));
  out.umbral = umbral;
  // la racha más larga de filas SEGUIDAS (por número de fila) que no cuadran
  let racha = 0, actual = 0, anterior = null;
  out.noCuadran.map(function (x) { return x.fila; }).sort(function (a, b) { return a - b; }).forEach(function (n) {
    actual = anterior != null && n === anterior + 1 ? actual + 1 : 1;
    racha = Math.max(racha, actual);
    anterior = n;
  });
  out.racha = racha;
  out.veredicto = out.noCuadran.length >= umbral || racha >= GUARDIAN_RACHA_ ? 'DESALINEADA' : 'alineada';
  return out;
}

/** yyyyMMdd de una fecha de la agenda: Date, texto dd/MM/yyyy o número de serie (la fecha escrita quedó como número a veces). */
function _ymdCualquiera_(v) {
  if (typeof v === 'number') return _fechaDeSerial_(v);
  const d = toDate_(v);
  return d ? ymd_(d) : '';
}

/** La hora en minutos de una celda: Date, texto "HH:mm" o fracción del día. */
function _horaCualquiera_(v) {
  if (typeof v === 'number' && v >= 0) return Math.round((v - Math.floor(v)) * 1440) % 1440;   // fracción del día, o serial con fecha
  return _horaEnMinutos_(v);
}

/**
 * **3. La prueba del orden parcial** (en memoria, sobre `bloque` = la base entera con su encabezado): ordena sólo las columnas
 * del EQUIPO por Figura y FECHA, dejando las del sistema (traza, agenda, IDs) donde están, y mide; después ordena FILAS
 * ENTERAS por lo mismo, y mide. Si la base ya estuviera casi en ese orden, usa el orden inverso (si no, no prueba nada).
 */
function pruebaOrdenParcial_(sh, hoja, bloque) {
  const hdr = bloque[0];
  const sistema = columnasDelSistema_(hdr).filter(function (x) { return x.grupo !== 'derivadas'; }).map(function (x) { return x.col; });
  const iFig = findIdxOr_(hdr, aliasColumna_('Figura')), iFecha = findIdxOr_(hdr, aliasColumna_('FECHA'));
  const datos = bloque.slice(1);
  const clave = function (r) { const d = toDate_(r[iFecha]); return normalizeText_(r[iFig]) + '|' + (d ? ymd_(d) : ''); };
  let orden = datos.map(function (r, i) { return i; }).sort(function (a, b) {
    const ka = clave(datos[a]), kb = clave(datos[b]);
    return ka < kb ? -1 : ka > kb ? 1 : a - b;
  });
  let movidas = orden.filter(function (j, i) { return j !== i; }).length;
  let como = 'por Figura y FECHA';
  if (movidas < 0.2 * datos.length) {
    orden = datos.map(function (r, i) { return datos.length - 1 - i; });
    movidas = orden.filter(function (j, i) { return j !== i; }).length;
    como = 'al revés (la base ya está casi por Figura y FECHA)';
  }
  // el equipo se mueve según `ord` (índice nuevo → de dónde viene), el sistema no
  const mover = function (ord) {
    return [hdr].concat(datos.map(function (r, i) {
      const fuente = datos[ord[i]];
      return r.map(function (v, k) { return sistema.indexOf(k) >= 0 ? v : fuente[k]; });
    }));
  };
  const parcial = mover(orden);
  const entera = [hdr].concat(orden.map(function (j) { return datos[j].slice(); }));
  // el orden CHICO: sólo las últimas GUARDIAN_FILAS_PRUEBA_CHICA_ filas con Figura o FECHA (el mes activo), entre ellas
  const reales = datos.map(function (r, i) { return i; }).filter(function (i) { return !esVacio_(datos[i][iFig]) || !esVacio_(datos[i][iFecha]); });
  const bloqueChico = reales.slice(-GUARDIAN_FILAS_PRUEBA_CHICA_);
  let porClave = bloqueChico.slice().sort(function (a, b) {
    const ka = clave(datos[a]), kb = clave(datos[b]);
    return ka < kb ? -1 : ka > kb ? 1 : a - b;
  });
  if (porClave.filter(function (j, n) { return j !== bloqueChico[n]; }).length < 0.2 * bloqueChico.length) porClave = bloqueChico.slice().reverse();
  const ordenChico = datos.map(function (r, i) { return i; });
  bloqueChico.forEach(function (i, n) { ordenChico[i] = porClave[n]; });
  const movidasChico = ordenChico.filter(function (j, i) { return j !== i; }).length;
  const hoy = alineacionBase_(armarDestino_(sh, hoja, bloque));
  const conParcial = alineacionBase_(armarDestino_(sh, hoja, parcial));
  const conEntera = alineacionBase_(armarDestino_(sh, hoja, entera));
  const conChico = alineacionBase_(armarDestino_(sh, hoja, mover(ordenChico)));
  armarDestino_(sh, hoja, bloque);   // el cache de figuras, otra vez el de la base de hoy
  return { como: como, movidas: movidas, filas: datos.length, columnasSistema: sistema.length, hoy: hoy, parcial: conParcial, entera: conEntera,
           chico: conChico, chicoMovidas: movidasChico, chicoFilas: bloqueChico.length };
}

/**
 * **El guardián, sólo lectura** (lo llama `manana()`): el inventario, las filas que no cuadran hoy y la prueba del orden
 * parcial, todo al log. No escribe nada. Si el inventario falla, la medición sigue (`inventario.error`).
 * `opciones.tope`: cuántas filas que no cuadran se listan (40).
 *   detecta       el orden parcial grande suma al menos `umbral` filas que no cuadran (el SALTO respecto de hoy); null si la
 *                 base no tiene filas con traza
 *   detectaChico  el orden parcial chico da DESALINEADA; null si hoy ya está desalineada (no se puede separar) o sin trazas
 */
function medirGuardian(opciones) {
  const tope = (opciones && opciones.tope) || 40;
  Logger.log('=== el guardián de las columnas del sistema — SÓLO LECTURA. El texto del guardián NO llegó: esto es lo que se mide sin él ===');
  let inv;
  try { inv = inventarioColumnasSistema(); }
  catch (err) {
    inv = { error: String(err && err.message || err) };
    Logger.log('  >>> el inventario de las columnas del sistema FALLÓ (%s): la medición sigue sin él.', inv.error);
  }
  const sh = ssDestino_().getSheetByName(RDV_HOJA_DESTINO);
  const bloque = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const p = pruebaOrdenParcial_(sh, RDV_HOJA_DESTINO, bloque);
  Logger.log('--- las celdas que difieren HOY (filas cuyas trazas no cuadran con la fila) ---');
  Logger.log('  filas con traza %s | no cuadran %s (umbral de "desalineada": %s, o %s seguidas; la racha más larga: %s) → %s', p.hoy.trazadas,
             p.hoy.noCuadran.length, p.hoy.umbral, GUARDIAN_RACHA_, p.hoy.racha, p.hoy.veredicto.toUpperCase());
  p.hoy.noCuadran.slice(0, tope).forEach(function (x) {
    Logger.log('    fila %s (%s, %s): %s', x.fila, x.figura || 'sin figura', x.fecha ? fmtFecha_(x.fecha) : 'sin fecha', x.motivos.join('; '));
  });
  if (p.hoy.noCuadran.length > tope) Logger.log('    (y %s más)', p.hoy.noCuadran.length - tope);
  Logger.log('--- la prueba del orden parcial (EN MEMORIA: no se ordenó nada en la base) ---');
  const salto = p.parcial.noCuadran.length - p.hoy.noCuadran.length;
  Logger.log('  GRANDE: se ordenan sólo las columnas del equipo %s (%s de %s filas cambian de lugar); las %s del sistema quedan quietas',
             p.como, p.movidas, p.filas, p.columnasSistema);
  Logger.log('     no cuadran %s (hoy %s: salto %s; umbral %s) → %s', p.parcial.noCuadran.length, p.hoy.noCuadran.length, salto,
             p.hoy.umbral, p.parcial.veredicto.toUpperCase());
  Logger.log('  CHICO: lo mismo, sólo entre las últimas %s filas (el mes activo; %s cambian de lugar) → no cuadran %s, la racha más ' +
             'larga %s (con %s seguidas es DESALINEADA) → %s', p.chicoFilas, p.chicoMovidas, p.chico.noCuadran.length, p.chico.racha,
             GUARDIAN_RACHA_, p.chico.veredicto.toUpperCase());
  Logger.log('  (control: el orden de FILAS ENTERAS da %s, lo mismo que hoy —%s—; no prueba nada: cada fila se mira sola)',
             p.entera.noCuadran.length, p.hoy.noCuadran.length);
  // El salto respecto de hoy decide (aunque hoy ya haya filas que no cuadran); sin trazas, no hay nada que medir.
  const ok = !p.hoy.trazadas ? null : salto >= p.hoy.umbral;
  const okChico = (!p.hoy.trazadas || p.hoy.veredicto === 'DESALINEADA') ? null : p.chico.veredicto === 'DESALINEADA';
  Logger.log('  >>> GRANDE: %s', ok === null ? 'NO CONCLUYENTE: la base no tiene filas con traza.'
    : ok ? 'se ve (el orden parcial suma ' + salto + ' filas que no cuadran).' : 'NO se ve (suma ' + salto + ', menos que el umbral): mirar los números.');
  Logger.log('  >>> CHICO: %s', okChico === null ? 'NO CONCLUYENTE: ' + (p.hoy.trazadas ? 'la base ya está desalineada hoy.' : 'la base no tiene filas con traza.')
    : okChico ? 'se ve (la racha).' : 'NO se ve: un orden parcial del mes activo pasaría sin que lo note esta medición.');
  return { inventario: inv, hoy: p.hoy.noCuadran.length, trazadas: p.hoy.trazadas, veredictoHoy: p.hoy.veredicto, rachaHoy: p.hoy.racha,
           parcial: p.parcial.noCuadran.length, veredictoParcial: p.parcial.veredicto, entera: p.entera.noCuadran.length, detecta: ok,
           chico: p.chico.noCuadran.length, veredictoChico: p.chico.veredicto, detectaChico: okChico };
}
