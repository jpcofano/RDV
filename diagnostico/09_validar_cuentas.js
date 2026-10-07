/**
 * diagnostico/09_validar_cuentas.js — PASO A: validación de cuentas (02/10). SÓLO LECTURA.
 *
 * No escribe una sola celda ni un fondo en ninguna planilla: todo va al log. Lo corre a mano
 * `paso17_validarCuentas()`.
 *
 * --- Para qué ---
 * Antes de que el sistema escriba Inscriptos, canales y Asistentes (paso B), confirmar que **las
 * cuentas del sistema calculadas al vuelo desde `B` dan lo mismo que el legado**. Criterio del
 * usuario (02/10): **los errores del pasado no se corrigen**. Lo que ya está cargado en el destino
 * queda como está aunque difiera; las diferencias **se cuentan, no se arreglan**. Las reglas nuevas
 * rigen de acá en adelante.
 *
 * --- Qué mide ---
 *   1) por cada fila con formulario resuelto (RDV_UID por su traza, o `escribiria` en el plan):
 *      Inscriptos, los 5 canales (MAPEO_CANALES), Masculinos y Femeninos escalados, las 5 bandas y
 *      Sin identificar, calculados desde B, contra el destino donde el destino ya tiene el valor.
 *      Por columna: exacto | difiere ≤ 5% | más, y las 10 peores;
 *   2) si B2 existe, lo mismo contra B2 por la clave del formulario (nombre + Fecha_Fin, sacada del
 *      ID de B2): separa "la fórmula es otra" de "el dato cambió después";
 *   3) filas con Inscriptos del destino distinto del de B y sexo o edades vacíos: las que la regla
 *      nueva ("el desagregado se escribe sólo si Inscriptos está vacío o es igual al de B") dejaría
 *      sin desagregado;
 *   1c) el divisor del escalado de sexo contra B2: identificados (legado), M + F, M + F + X;
 *   4) Asistentes desde RDV CONJUNTO (02/10, cruce nuevo): 4a, cómo están escritos los nombres en
 *      RDV CONJUNTO y en A2, y cuántos Asistentes del destino están cargados y en azul; después, la
 *      figura por tokens del nombre (`figuraPorTokens_`) + fecha, el barrio sólo confirma: cuántas
 *      encuentran fila, cuáles no, cuántos Asistentes del destino están vacíos y RDV CONJUNTO tiene el
 *      dato, y en cuántas difieren. "No aplica" y las de antes del destino, aparte;
 *   5) qué NO dice.
 *
 * Inscriptos: un 0 del destino cuenta como vacío (INSCRIPTOS_CERO_ES_VACIO, 02/10).
 */

/** Las columnas que el paso B escribiría desde B, en el orden del log. */
const CUENTAS_DIAG9 = ['Inscriptos', 'Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión',
                       'Masculinos', 'Femeninos', '18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar'];
/** Diferencia relativa que todavía cuenta como "≤ 5%". */
const TOLERANCIA_DIAG9 = 0.05;

function validarCuentas() {
  Logger.log('=== validarCuentas (PASO A) — sólo lectura, no escribe nada ===');
  Logger.log('  solapa destino: %s', descripcionHojaDestino_());
  const plan = calcularPlan_(true, null, { historial: true });
  // 07/10: con columnas de B que faltan o sin mapear, las cuentas no valen (y el upsert no escribe los datos de B)
  const cb = plan.cands && plan.cands.columnasB;
  if (cb && cb.bloqueoGlobal.length) {
    throw new Error('Faltan columnas o hay columnas sin mapear en "' + RDV_HOJA_B + '": ' + cb.bloqueoGlobal.join(' | ') +
                    '. Corregir COLUMNAS_B / MAPEO_CANALES (paso46_chequearColumnasB).');
  }
  const dest = plan.dest, porFila = plan.porFila;

  // Índices del destino para las 14 columnas.
  const iD = {};
  CUENTAS_DIAG9.forEach(function (n) { iD[n] = findIdxOr_(dest.hdr, aliasColumna_(n), true); });
  const faltan = CUENTAS_DIAG9.filter(function (n) { return iD[n] == null; });
  if (faltan.length) Logger.log('  AVISO: el destino no tiene estas columnas: %s', faltan.join(', '));

  const b2 = _leerB2_diag9();

  // --- 1) y 2) ---
  const porCol = {};
  CUENTAS_DIAG9.forEach(function (n) {
    porCol[n] = { comparables: 0, exacto: 0, p5: 0, mas: 0, destVacio: 0, bVacio: 0, peores: [],
                  b2Comparables: 0, b2IgualB: 0, difB2: { cambio: 0, otraFuente: 0, tres: 0, sinB2: 0 } };
  });
  let filas = 0, filasConB2 = 0;
  const divisores = _nuevosDivisores_diag9();
  const desagregado = { distinto: 0, distintoConHueco: 0, lista: [] };

  dest.filas.forEach(function (f) {
    const pf = porFila[f.fila];
    if (!pf || !pf.cand || (pf.veredicto !== 'escribiria' && pf.veredicto !== 'rdv_uid')) return;
    const c = pf.cand;
    filas++;
    const deB = _cuentasDeB_diag9(c);
    const enB2 = b2 ? b2.porClave.get(_claveB2_diag9(c.nombre, c.det && c.det.fechaFin)) : null;
    if (enB2) {
      filasConB2++;
      _sumarDivisores_diag9(divisores, c, enB2);
    }

    CUENTAS_DIAG9.forEach(function (n) {
      if (iD[n] == null) return;
      const x = porCol[n];
      let d = num(f.valores[iD[n]]);
      if (n === 'Inscriptos' && INSCRIPTOS_CERO_ES_VACIO && d === 0) d = '';   // un 0 es "sin cargar"
      const b = deB[n];
      if (b === '') { x.bVacio++; return; }
      if (d === '') { x.destVacio++; return; }
      x.comparables++;
      const rel = Math.abs(d - b) / Math.max(Math.abs(b), 1);
      if (d === b) x.exacto++;
      else if (rel <= TOLERANCIA_DIAG9) x.p5++;
      else x.mas++;
      // contra B2
      let v2 = '';
      if (enB2) {
        v2 = num(enB2[n]);
        if (v2 !== '') { x.b2Comparables++; if (v2 === b) x.b2IgualB++; }
      }
      if (d !== b) {
        if (!enB2 || v2 === '') x.difB2.sinB2++;
        else if (v2 === d) x.difB2.cambio++;        // el legado calculó lo del destino; B cambió después
        else if (v2 === b) x.difB2.otraFuente++;    // B2 = B: el destino no vino de B2 (mano u otra fuente)
        else x.difB2.tres++;
        x.peores.push({ f: f, d: d, b: b, b2: v2, rel: rel, c: c });
      }
    });

    // --- 3) Inscriptos distinto y desagregado con huecos ---
    let insD = iD['Inscriptos'] != null ? num(f.valores[iD['Inscriptos']]) : '';
    if (INSCRIPTOS_CERO_ES_VACIO && insD === 0) insD = '';
    const insB = deB['Inscriptos'];
    if (insD !== '' && insB !== '' && insD !== insB) {
      desagregado.distinto++;
      const huecos = ['Masculinos', 'Femeninos', '18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar']
        .filter(function (n) { return iD[n] != null && esVacio_(f.valores[iD[n]]); });
      if (huecos.length) {
        desagregado.distintoConHueco++;
        if (desagregado.lista.length < 15) desagregado.lista.push({ f: f, insD: insD, insB: insB, huecos: huecos.length, c: c });
      }
    }
  });

  Logger.log('--- 1) cuentas del sistema (desde B) contra el destino, en %s filas con formulario resuelto ---', filas);
  Logger.log('  (RDV_UID por su traza, o "escribiria" en el plan. Sólo donde el destino YA tiene el valor.)');
  Logger.log('  columna          | comparables | exacto | ≤5%% | más  | destino vacío | B vacío');
  CUENTAS_DIAG9.forEach(function (n) {
    const x = porCol[n];
    Logger.log('  %s | %s | %s | %s | %s | %s | %s', _padD9_(n, 16), _padI9_(x.comparables, 11),
               _padI9_(x.exacto, 6), _padI9_(x.p5, 4), _padI9_(x.mas, 4), _padI9_(x.destVacio, 13), x.bVacio);
  });
  CUENTAS_DIAG9.forEach(function (n) {
    const x = porCol[n];
    if (!x.peores.length) return;
    Logger.log('  las %s peores de %s (fila | figura | fecha | destino | B | B2 | formulario):',
               Math.min(10, x.peores.length), n);
    x.peores.sort(function (a, b) { return b.rel - a.rel || Math.abs(b.d - b.b) - Math.abs(a.d - a.b); })
      .slice(0, 10).forEach(function (p) {
        Logger.log('    fila %s | %s | %s | %s | %s | %s | %s', p.f.fila, p.f.figura, fmtFecha_(p.f.fecha),
                   p.d, p.b, p.b2 === '' ? '-' : p.b2, p.c.nombre);
      });
  });

  Logger.log('--- 2) contra B2 (por nombre + Fecha_Fin) ---');
  if (!b2) {
    Logger.log('  B2 no existe o no tiene ID/Nombre: no se puede separar "fórmula" de "dato que cambió".');
  } else {
    Logger.log('  B2: %s filas, %s con clave (nombre + Fecha_Fin del ID) | filas del destino con B2: %s de %s',
               b2.filas, b2.porClave.size, filasConB2, filas);
    Logger.log('  columna          | B=B2 (la fórmula da lo mismo) | donde destino ≠ B: destino=B2 (B cambió después) | ' +
               'B2=B (el destino no vino de B2) | los tres distintos | sin B2');
    CUENTAS_DIAG9.forEach(function (n) {
      const x = porCol[n];
      Logger.log('  %s | %s de %s | %s | %s | %s | %s', _padD9_(n, 16), x.b2IgualB, x.b2Comparables,
                 x.difB2.cambio, x.difB2.otraFuente, x.difB2.tres, x.difB2.sinB2);
    });
  }

  _logDivisores_diag9(divisores);

  Logger.log('--- 3) Inscriptos del destino distinto del de B ---');
  Logger.log('  filas con Inscriptos distinto (los dos con dato): %s', desagregado.distinto);
  Logger.log('  de ésas, con sexo o edades vacíos: %s  ← las que la regla nueva dejaría SIN desagregado', desagregado.distintoConHueco);
  Logger.log('  (regla de acá en adelante: el desagregado se escribe sólo si Inscriptos está vacío o es igual al');
  Logger.log('   de B, para que la fila no quede con un total que no cierra con su desagregado)');
  desagregado.lista.forEach(function (x) {
    Logger.log('    fila %s | %s | %s | destino %s | B %s | %s celdas vacías | %s', x.f.fila, x.f.figura,
               fmtFecha_(x.f.fecha), x.insD, x.insB, x.huecos, x.c.nombre);
  });

  // --- 4) Asistentes desde RDV CONJUNTO ---
  const asis = _validarAsistentes_diag9(dest, plan.comunas);

  Logger.log('--- 5) qué NO dice ---');
  Logger.log('  - En las filas que cargó el legado, B y el destino coinciden POR CONSTRUCCIÓN: el legado los');
  Logger.log('    calculó con la misma fórmula sobre el mismo B. Eso valida la FÓRMULA, no que el número sea verdad.');
  Logger.log('  - "B vacío" no es un error: el formulario no trae ese canal o esa banda.');
  Logger.log('  - Las diferencias no se corrigen (criterio del 02/10): lo cargado queda como está.');
  Logger.log('  - Inscriptos: un 0 del destino cuenta como vacío (INSCRIPTOS_CERO_ES_VACIO).');
  Logger.log('  - El cruce de Asistentes es por figura (tokens del nombre canónico) + fecha. Un nombre que entra en');
  Logger.log('    dos figuras, o en ninguna, no se usa: se lista. Que una fila cruce no prueba que los asistentes');
  Logger.log('    sean de esa reunión si el destino tuviera dos filas de la figura ese día (también se listan).');
  return { filas: filas, porCol: porCol, desagregado: desagregado, asistentes: asis, b2: !!b2,
           divisores: divisores };
}

/** Las 14 cuentas de un formulario de B, como las calcularía el sistema. '' = B no trae el dato. */
function _cuentasDeB_diag9(c) {
  const out = {};
  CUENTAS_DIAG9.forEach(function (n) {
    out[n] = (c.cuentas && c.cuentas[n] !== undefined) ? c.cuentas[n]
           : (c.datos && c.datos[n] !== undefined ? c.datos[n] : '');
  });
  return out;
}

/** B2 por la clave del formulario: normalizeText_(Nombre) | AAAAMMDD de la fecha del ID ("Nombre - dd/MM/yyyy"). */
function _leerB2_diag9() {
  const sh = ssIntermedia_().getSheetByName(RDV_HOJA_B2);
  if (!sh || sh.getLastRow() < 2) return null;
  const vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const hdr = vals[0];
  const iId = findIdxOr_(hdr, ['ID'], true), iNom = findIdxOr_(hdr, ['Nombre'], true);
  if (iId == null || iNom == null) return null;
  const col = {};
  const alias = { 'Masculinos': ['Masculinos', 'Masculino'], 'Femeninos': ['Femeninos', 'Femenino'] };
  CUENTAS_DIAG9.forEach(function (n) { col[n] = findIdxOr_(hdr, alias[n] || aliasColumna_(n), true); });
  const porClave = new Map();
  for (let i = 1; i < vals.length; i++) {
    const r = vals[i], nombre = str(r[iNom]);
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(str(r[iId]));
    if (!nombre || !m) continue;
    const fecha = new Date(+m[3], +m[2] - 1, +m[1], 12, 0, 0);
    const reg = {};
    CUENTAS_DIAG9.forEach(function (n) { reg[n] = col[n] != null ? r[col[n]] : ''; });
    const k = _claveB2_diag9(nombre, fecha);
    if (!porClave.has(k)) porClave.set(k, reg);
  }
  return { filas: vals.length - 1, porClave: porClave };
}

function _claveB2_diag9(nombre, fecha) {
  return normalizeText_(nombre) + '|' + (fecha ? ymd_(fecha) : '');
}

/**
 * 1c) **El divisor del escalado de sexo**, contra B2. Para cada fila con B2, Masculinos y Femeninos
 * calculados con tres divisores —identificados (el del legado), M + F, M + F + X— y cuántos coinciden
 * exacto con B2. Dice cuál usar en DIVISOR_SEXO.
 */
function _nuevosDivisores_diag9() {
  const z = function () { return { M: 0, F: 0 }; };
  return { comparables: { M: 0, F: 0 }, identificados: z(), 'M+F': z(), 'M+F+X': z(), conX: 0, ejemplos: [] };
}

function _sumarDivisores_diag9(dv, c, enB2) {
  const s = c.sexo, ins = numOcero_(c.cuentas ? c.cuentas['Inscriptos'] : c.inscriptos);
  if (!s) return;
  if (s.X > 0) dv.conX++;
  const divs = { identificados: s.identificados, 'M+F': s.M + s.F, 'M+F+X': s.M + s.F + s.X };
  ['M', 'F'].forEach(function (sx) {
    const b2 = num(enB2[sx === 'M' ? 'Masculinos' : 'Femeninos']);
    if (b2 === '') return;
    dv.comparables[sx]++;
    Object.keys(divs).forEach(function (k) {
      const v = divs[k] > 0 ? Math.round(ins * s[sx] / divs[k]) : '';
      if (v === b2) dv[k][sx]++;
    });
    if (dv.ejemplos.length < 8 && s.X > 0) {
      dv.ejemplos.push({ nombre: c.nombre, sx: sx, b2: b2, ins: ins, s: s });
    }
  });
}

function _logDivisores_diag9(dv) {
  Logger.log('--- 1c) el divisor del escalado de sexo, contra B2 (DIVISOR_SEXO = "%s") ---', DIVISOR_SEXO);
  Logger.log('  formularios con inscriptos_X > 0: %s', dv.conX);
  ['identificados', 'M+F', 'M+F+X'].forEach(function (k) {
    Logger.log('  divisor %s: Masculinos = B2 en %s de %s | Femeninos = B2 en %s de %s', _padD9_(k, 13),
               dv[k].M, dv.comparables.M, dv[k].F, dv.comparables.F);
  });
  dv.ejemplos.forEach(function (x) {
    Logger.log('    ej. %s: B2 %s | ins %s, M %s, F %s, X %s, identificados %s | %s', x.sx, x.b2, x.ins, x.s.M,
               x.s.F, x.s.X, x.s.identificados, x.nombre);
  });
}

/**
 * 4) **Asistentes desde RDV CONJUNTO** (02/10, cruce nuevo).
 *
 * RDV CONJUNTO escribe a la figura "Apellido Nombre(s)" completo; el legado comparaba el nombre tal
 * cual (figura + barrio + fecha) y por eso no cruzaba. Ahora:
 *   - la figura sale de `figuraPorTokens_` (todos los tokens del nombre canónico, en cualquier orden);
 *     con varias o ninguna, se lista y no se usa;
 *   - la clave es **figura + fecha** (regla a de CLAUDE.md); el barrio sólo confirma: si difiere, se
 *     lista pero cruza igual;
 *   - "No aplica" y las filas de antes de que empiece el destino se ignoran y se cuentan aparte.
 * Antes, la medición 4a: cómo están escritos los nombres en A2 (la última salida del legado) y en RDV
 * CONJUNTO, y cuántos Asistentes del destino están cargados y cuántos en azul (los puso el legado).
 */
function _validarAsistentes_diag9(dest, comunas) {
  Logger.log('--- 4) Asistentes desde RDV CONJUNTO ---');
  // El MISMO cruce que usa el upsert (cruzarAsistentes_, 20_UpsertDestino.js).
  const r = cruzarAsistentes_(dest, comunas);
  if (r.error) { Logger.log('  %s', r.error); return null; }

  // --- 4a) la medición previa ---
  _logNombres_diag9('RDV CONJUNTO', r.valores.slice(1).map(function (row) { return str(row[r.iFig]); }));
  const a2 = ssIntermedia_().getSheetByName(RDV_HOJA_A2);
  if (a2 && a2.getLastRow() > 1) {
    const va = a2.getRange(1, 1, a2.getLastRow(), a2.getLastColumn()).getValues();
    const iF2 = findIdxOr_(va[0], ['figura', 'persona', 'nombre'], true);
    if (iF2 != null) _logNombres_diag9('A2 (la última salida del legado)', va.slice(1).map(function (row) { return str(row[iF2]); }));
  } else {
    Logger.log('  A2: no existe o está vacía.');
  }
  const iAsD = dest.D['Asistentes'], iSt = dest.D['STATUS REUNIÓN'];
  if (iAsD != null) {
    const fondos = dest.sh.getRange(1, iAsD + 1, dest.sh.getLastRow(), 1).getBackgrounds();
    let cargados = 0, azules = 0;
    dest.filas.forEach(function (f) {
      if (esVacio_(f.valores[iAsD])) return;
      cargados++;
      if (esColorSistema_(fondos[f.fila - 1][0])) azules++;
    });
    Logger.log('  destino: Asistentes cargado en %s filas | de ésas, con el color del sistema (las cargó el legado ' +
               'o el sistema): %s', cargados, azules);
  }

  // --- 4b-d) el cruce ---
  _logCruceAsistentes_(r, false);
  r.vacioYRdvTiene = 0; r.agendaARealizada = 0; r.iguales = 0; r.difieren = 0; r.destinoMenor = 0; r.destinoMayor = 0;
  const peores = [];
  const porFilaDest = {};
  dest.filas.forEach(function (f) { porFilaDest[f.fila] = f; });
  r.porFila.forEach(function (x, fila) {
    const f = porFilaDest[fila];
    const d = iAsD != null ? num(f.valores[iAsD]) : '';
    if (d === '') {
      r.vacioYRdvTiene++;
      if (iSt != null && normStatus_(f.valores[iSt]) === normStatus_(TRANSICION_REALIZADA.desde)) r.agendaARealizada++;
    } else if (d === x.asis) r.iguales++;
    else {
      r.difieren++;
      if (d < x.asis) r.destinoMenor++; else r.destinoMayor++;
      peores.push({ f: f, d: d, asis: x.asis });
    }
  });
  Logger.log('  Asistentes del destino VACÍO y RDV CONJUNTO lo tiene: %s  ← se escribirían (con STATUS "en agenda" ' +
             'que pasaría a Realizada: %s)', r.vacioYRdvTiene, r.agendaARealizada);
  Logger.log('    iguales %s | difieren %s (destino menor %s, mayor %s) — sólo se cuentan, nunca se pisan',
             r.iguales, r.difieren, r.destinoMenor, r.destinoMayor);
  peores.sort(function (a, b) { return Math.abs(b.d - b.asis) - Math.abs(a.d - a.asis); }).slice(0, 10)
    .forEach(function (p) {
      Logger.log('      difiere: fila %s | %s | %s | destino %s | RDV CONJUNTO %s', p.f.fila, p.f.figura,
                 fmtFecha_(p.f.fecha), p.d, p.asis);
    });
  _logListasAsistentes_(r);
  return r;
}

/** Cómo están escritos los nombres de una lista: distintos, los 12 más frecuentes y cuántos resuelven por tokens. */
function _logNombres_diag9(titulo, nombres) {
  const cuenta = new Map();
  nombres.filter(String).forEach(function (n) { cuenta.set(n, (cuenta.get(n) || 0) + 1); });
  let resuelven = 0;
  cuenta.forEach(function (k, n) { if (figuraPorTokens_(n).figura) resuelven++; });
  Logger.log('  4a) nombres en %s: %s distintos | resuelven a UNA figura por tokens: %s', titulo, cuenta.size, resuelven);
  Array.from(cuenta.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 12).forEach(function (e) {
    const fp = figuraPorTokens_(e[0]);
    Logger.log('      "%s" × %s → %s', e[0], e[1], fp.figura || (fp.candidatas.length ? 'varias' : 'ninguna'));
  });
}

function _padD9_(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
function _padI9_(v, n) { let s = String(v); while (s.length < n) s = ' ' + s; return s; }
