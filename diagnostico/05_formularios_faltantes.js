/**
 * diagnostico/05_formularios_faltantes.js — las filas sin formulario propio: ¿faltan o están
 * mal fechados?
 *
 * SÓLO LECTURA. No escribe en ninguna planilla: todo va al log. Corre a mano, sin activador.
 *
 * --- La regla que lo motiva ---
 * **Toda reunión tiene formulario** (confirmado por el usuario, 26/09; CLAUDE.md 1). Una fila del
 * destino sin ningún formulario que pueda ser el suyo no es "una reunión sin formulario": es un
 * formulario que falta en la consulta que llena `Hoja1` en (3) —que no es nuestra—, o uno que
 * está en `B` con una fecha que no es la suya.
 *
 * --- Qué hace ---
 * La población es la misma que el upsert rotula `sin_formulario_propio`: filas SIN_MATCH para las
 * que `cercanosDeFila_()` no encuentra, a ±TOLERANCIA_REPROGRAMACION_DIAS, ni un formulario de su
 * figura ni uno sin figura de su comuna. Usa las funciones del upsert (`calcularPlan_`,
 * `cercanosDeFila_`) para que no haya dos criterios. Después, en ese orden:
 *
 *   a) ¿hay en B un formulario de su figura a CUALQUIER distancia? El más cercano, la distancia,
 *      si coincide barrio o comuna, de dónde salió su fecha y si ya es de otra fila. Si coincide
 *      la ubicación y no es de otra fila → CANDIDATO a mal fechado. No se afirma: se lista.
 *   b) B contra Hoja1 del origen (openById, sólo lectura): ¿hay formularios en Hoja1 que no
 *      están en B? Si B = Hoja1, el faltante está en la consulta, no en el IMPORTRANGE.
 *   c) lo que queda: la lista de FORMULARIOS FALTANTES, para quien mantiene la consulta.
 */

/** Días desde la reunión por debajo de los cuales el faltante puede ser "todavía no importado". */
const DIAG5_DIAS_RECIENTE = 7;

function diagFormulariosFaltantes() {
  Logger.log('=== diagFormulariosFaltantes — sólo lectura, no escribe nada ===');
  const plan = calcularPlan_(true);
  const dest = plan.dest, vivos = plan.cands.vivos, comunas = plan.comunas, porFila = plan.porFila;
  const hoy = _hoy_();

  // Qué formulario ya es de otra fila: el que gana una fila que se escribiría.
  const deFila = {};
  Object.keys(porFila).forEach(function (k) {
    const p = porFila[k];
    if (p.veredicto === 'escribiria' && p.cand) deFila[p.cand.fila] = Number(k);
  });

  // --- la población: la misma del motivo sin_formulario_propio ---
  const pobl = dest.filas.filter(function (f) {
    const p = porFila[f.fila];
    return p && p.motivo === 'sin_formulario_propio';
  });
  const base = contador_();
  pobl.forEach(function (f) { sumar_(base, enVentanaAnalisis_(f.fecha)); });

  Logger.log('VENTANA: corte %s (%s)', fmtFecha_(inicioVentanaAnalisis_()), descVentanaAnalisis_());
  Logger.log('Población: filas SIN_MATCH sin formulario propio a ±%s días (el motivo ' +
             'sin_formulario_propio del upsert): %s', TOLERANCIA_REPROGRAMACION_DIAS, _dc_(base));
  if (!base.t) { Logger.log('  Ninguna. Nada que buscar.'); return { base: base }; }

  // --- a) el más cercano de su figura, a cualquier distancia ---
  const malFechado = [], pendientes = [];
  const cntA = { malFechado: contador_(), deOtraFila: contador_(), sinUbic: contador_(),
                 ubicDistinta: contador_(), ninguno: contador_() };

  pobl.forEach(function (f) {
    const ev = enVentanaAnalisis_(f.fecha);
    const figNorm = normalizeText_(f.figura);
    const cDest = f.barrio ? comunas.get(normalizeText_(f.barrio)) : null;
    let m = null;
    for (let i = 0; i < vivos.length; i++) {
      const c = vivos[i];
      if (c.figurasNorm.indexOf(figNorm) === -1) continue;
      const d = distanciaFecha_(f.fecha, c.det);
      const dd = d === null ? Infinity : d;
      if (!m || dd < m.dd) m = { c: c, d: d, dd: dd };
    }

    const x = { f: f, ev: ev, cDest: cDest, m: m, reciente: _esReciente_diag5(f, hoy) };
    const clasificar = function (clase, cnt, lista) {
      x.clase = clase; sumar_(cnt, ev); lista.push(x);
    };
    if (!m) { clasificar('sin_formulario_de_su_figura', cntA.ninguno, pendientes); return; }

    const bF = normalizeText_(m.c.barrio), bD = normalizeText_(f.barrio);
    x.barrioIgual = !!(bF && bD && bF === bD);
    const cmp = comparaComuna_(f.barrio, cDest, m.c);    // con la subzona de la Comuna 1 (regla 10)
    x.comunaIgual = !!(cmp && cmp.coincide);
    x.ubicDistinta = (bF && bD && bF !== bD) || !!(cmp && !cmp.coincide);
    x.deOtra = deFila[m.c.fila] || null;

    if (x.deOtra) {
      clasificar('el_de_su_figura_es_de_otra_fila', cntA.deOtraFila, pendientes);
    } else if (x.barrioIgual || x.comunaIgual) {
      clasificar('candidato_mal_fechado', cntA.malFechado, malFechado);
    } else if (x.ubicDistinta) {
      clasificar('de_su_figura_pero_otra_ubicacion', cntA.ubicDistinta, pendientes);
    } else {
      clasificar('de_su_figura_sin_ubicacion_que_confirme', cntA.sinUbic, pendientes);
    }
  });

  Logger.log('--- a) ¿hay en B un formulario de su figura, a cualquier distancia? ---');
  Logger.log('  CANDIDATO a mal fechado (coincide barrio o comuna, libre) %s',
             _dcp_(cntA.malFechado, base));
  Logger.log('  el más cercano de su figura ya es de otra fila ......... %s',
             _dcp_(cntA.deOtraFila, base));
  Logger.log('  de su figura, pero de OTRA ubicación ................... %s',
             _dcp_(cntA.ubicDistinta, base));
  Logger.log('  de su figura, sin ubicación para confirmar ............. %s',
             _dcp_(cntA.sinUbic, base));
  Logger.log('  NINGÚN formulario de su figura en B .................... %s',
             _dcp_(cntA.ninguno, base));
  if (malFechado.length) {
    Logger.log('  --- candidatos a mal fechado (ventana primero). NO es un hecho: es para mirar ---');
    _ordenar_diag5(malFechado).forEach(function (x) { _logCandidato_diag5(x); });
  }

  // --- b) B contra Hoja1 del origen ---
  const orig = _compararOrigen_diag5();
  Logger.log('--- b) B contra Hoja1 del origen (sólo lectura) ---');
  if (orig.error) {
    Logger.log('  >>> No se pudo comparar: %s', orig.error);
  } else {
    Logger.log('  filas con nombre: Hoja1 %s | B %s', orig.nHoja1, orig.nB);
    Logger.log('  en Hoja1 y NO en B (nombre normalizado + fecha_fin): %s', orig.soloHoja1.length);
    Logger.log('  en B y NO en Hoja1: %s', orig.soloB.length);
    if (!orig.soloHoja1.length) {
      Logger.log('  >>> B tiene todo lo que tiene Hoja1: si falta un formulario, falta en la CONSULTA');
      Logger.log('      que llena Hoja1, no en el IMPORTRANGE.');
    } else {
      Logger.log('  >>> Hay formularios en Hoja1 que B no trae: el IMPORTRANGE está perdiendo filas.');
      orig.soloHoja1.slice(0, 20).forEach(function (h) {
        Logger.log('      Hoja1 fila %s | fecha_fin %s | %s', h.fila, fmtFecha_(h.fechaFin) || '-', h.nombre);
      });
    }
    orig.soloB.slice(0, 10).forEach(function (h) {
      Logger.log('      sólo en B: fila %s | fecha_fin %s | %s', h.fila, fmtFecha_(h.fechaFin) || '-', h.nombre);
    });
  }

  // Los pendientes que se explican por un formulario que está en Hoja1 y no en B.
  const enOrigen = [], faltantes = [];
  pendientes.forEach(function (x) {
    const h = orig.error ? null : _enHoja1_diag5(x.f, orig.soloHoja1);
    if (h) { x.hoja1 = h; enOrigen.push(x); } else faltantes.push(x);
  });
  if (enOrigen.length) {
    Logger.log('  filas cuyo formulario está en Hoja1 pero no en B: %s', enOrigen.length);
    enOrigen.forEach(function (x) {
      Logger.log('      %s | %s | %s ← Hoja1 fila %s: %s', fmtFecha_(x.f.fecha), x.f.figura,
                 x.f.barrio || 'sin barrio', x.hoja1.fila, x.hoja1.nombre);
    });
  }

  // --- c) lo que queda: FORMULARIOS FALTANTES ---
  const cntC = contador_(), cntRec = contador_();
  faltantes.forEach(function (x) { sumar_(cntC, x.ev); if (x.reciente) sumar_(cntRec, x.ev); });
  Logger.log('--- c) FORMULARIOS FALTANTES: %s (para quien mantiene la consulta de Hoja1) ---',
             _dc_(cntC));
  Logger.log('  fecha      | figura | barrio | comuna | nota');
  _ordenar_diag5(faltantes).forEach(function (x) {
    let nota = x.clase;
    if (x.m && x.clase !== 'sin_formulario_de_su_figura') {
      nota += ' (el más cercano de su figura, a ' + (x.m.d === null ? '?' : x.m.d) + ' días' +
              (x.deOtra ? ', ya es de la fila ' + x.deOtra : '') + ')';
    }
    if (x.reciente) nota += ' — POSIBLE: todavía no importado (reunión hace < ' + DIAG5_DIAS_RECIENTE + ' días)';
    Logger.log('  [%s] %s | %s | %s | %s | %s', x.ev ? 'ventana' : 'histor.', fmtFecha_(x.f.fecha),
               x.f.figura, x.f.barrio || 'sin barrio', x.cDest == null ? '-' : x.cDest, nota);
  });

  Logger.log('  Qué NO dice esto:');
  Logger.log('   - "candidato a mal fechado" es una sospecha: el formulario de su figura coincide en');
  Logger.log('     ubicación y nadie lo usa, pero la fecha no calza. Confirmarlo es mirar el formulario.');
  Logger.log('   - Un faltante con la reunión hace menos de %s días (%s) puede ser sólo que la consulta',
             DIAG5_DIAS_RECIENTE, _dc_(cntRec));
  Logger.log('     todavía no lo trajo. No es un hecho: volver a mirarlo en unos días.');
  Logger.log('   - "el más cercano ya es de otra fila" no descarta que el formulario de esta fila sea');
  Logger.log('     ése (una inscripción compartida, o la otra fila mal asignada). Se lista para mirar.');

  return { base: base, a: cntA, malFechado: malFechado.length, enOrigen: enOrigen.length,
           faltantes: cntC };
}

function _esReciente_diag5(f, hoy) {
  return !!(f.fecha && diasEntre_(hoy, f.fecha) < DIAG5_DIAS_RECIENTE);   // hoy − reunión
}

/** Ventana primero, y adentro por fecha. */
function _ordenar_diag5(lista) {
  return lista.slice().sort(function (a, b) {
    if (a.ev !== b.ev) return a.ev ? -1 : 1;
    return (a.f.fecha ? a.f.fecha.getTime() : 0) - (b.f.fecha ? b.f.fecha.getTime() : 0);
  });
}

function _logCandidato_diag5(x) {
  const det = x.m.c.det || {};
  Logger.log('    [%s] %s | %s | %s (comuna %s)', x.ev ? 'ventana' : 'histor.',
             fmtFecha_(x.f.fecha), x.f.figura, x.f.barrio || 'sin barrio',
             x.cDest == null ? '-' : x.cDest);
  Logger.log('        B fila %s, a %s días | coincide: %s | fecha detectada %s (de %s; texto %s, ' +
             'fecha_fin %s)', x.m.c.fila, x.m.d === null ? '?' : x.m.d,
             x.barrioIgual ? 'barrio' : 'comuna', fmtFecha_(det.mejor) || '-', det.fuente || '-',
             fmtFecha_(det.texto) || '-', fmtFecha_(det.fechaFin) || '-');
  Logger.log('        %s', x.m.c.nombre);
}

/**
 * B contra Hoja1, por nombre normalizado + fecha_fin. Sólo lectura, por openById. Lee las dos
 * crudas (con los anulados), porque la pregunta es si el IMPORTRANGE trae todo, no qué se usa.
 */
function _compararOrigen_diag5() {
  const leer = function (ssId, hoja) {
    const sh = SpreadsheetApp.openById(ssId).getSheetByName(hoja);
    if (!sh) throw new Error('no existe la solapa "' + hoja + '"');
    const vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    const hdr = vals[0];
    const iN = findIdxOr_(hdr, ['Nombre'], true), iF = findIdxOr_(hdr, ['Fecha_Fin'], true);
    if (iN == null) throw new Error('la solapa "' + hoja + '" no tiene columna Nombre');
    const out = new Map();
    for (let i = 1; i < vals.length; i++) {
      const nombre = str(vals[i][iN]);
      if (!nombre || /^loading/i.test(nombre)) continue;
      const fechaFin = iF != null ? toDate_(vals[i][iF]) : null;
      const k = normalizeText_(nombre) + '|' + (fechaFin ? fmtFecha_(fechaFin) : '');
      if (!out.has(k)) out.set(k, { fila: i + 1, nombre: nombre, fechaFin: fechaFin });
    }
    return out;
  };
  try {
    const h1 = leer(RDV_SS_ORIGEN, RDV_HOJA_ORIGEN);
    const b = leer(RDV_SS_INTERMEDIA, RDV_HOJA_B);
    const soloHoja1 = [], soloB = [];
    h1.forEach(function (v, k) { if (!b.has(k)) soloHoja1.push(v); });
    b.forEach(function (v, k) { if (!h1.has(k)) soloB.push(v); });
    return { nHoja1: h1.size, nB: b.size, soloHoja1: soloHoja1, soloB: soloB };
  } catch (e) {
    return { error: String(e), soloHoja1: [], soloB: [] };
  }
}

/** ¿Algún formulario que está en Hoja1 y no en B nombra la figura de la fila a ±tolerancia? */
function _enHoja1_diag5(f, soloHoja1) {
  const figNorm = normalizeText_(f.figura);
  for (let i = 0; i < soloHoja1.length; i++) {
    const h = soloHoja1[i];
    if (figurasEnTexto_(h.nombre).map(normalizeText_).indexOf(figNorm) === -1) continue;
    const det = detectFecha_(limpiarPrefijos_(h.nombre), h.fechaFin);
    const d = distanciaFecha_(f.fecha, det);
    if (d !== null && d <= TOLERANCIA_REPROGRAMACION_DIAS) return h;
  }
  return null;
}
