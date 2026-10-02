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
 *   4) Asistentes desde RDV CONJUNTO con el cruce del legado (figura + barrio + fecha,
 *      `legKeyFBF_` de Upset Base FInal.js): cuántas filas encuentran fila en el destino, cuáles
 *      no, cuántos Asistentes del destino están vacíos y RDV CONJUNTO tiene el dato, y en cuántas
 *      difieren;
 *   5) qué NO dice.
 */

/** Las columnas que el paso B escribiría desde B, en el orden del log. */
const CUENTAS_DIAG9 = ['Inscriptos', 'Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión',
                       'Masculinos', 'Femeninos', '18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar'];
/** Diferencia relativa que todavía cuenta como "≤ 5%". */
const TOLERANCIA_DIAG9 = 0.05;

function validarCuentas() {
  Logger.log('=== validarCuentas (PASO A) — sólo lectura, no escribe nada ===');
  Logger.log('  solapa destino: %s', descripcionHojaDestino_());
  const plan = calcularPlan_(true);
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
  const desagregado = { distinto: 0, distintoConHueco: 0, lista: [] };

  dest.filas.forEach(function (f) {
    const pf = porFila[f.fila];
    if (!pf || !pf.cand || (pf.veredicto !== 'escribiria' && pf.veredicto !== 'rdv_uid')) return;
    const c = pf.cand;
    filas++;
    const deB = _cuentasDeB_diag9(c);
    const enB2 = b2 ? b2.porClave.get(_claveB2_diag9(c.nombre, c.det && c.det.fechaFin)) : null;
    if (enB2) filasConB2++;

    CUENTAS_DIAG9.forEach(function (n) {
      if (iD[n] == null) return;
      const x = porCol[n];
      const d = num(f.valores[iD[n]]), b = deB[n];
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
    const insD = iD['Inscriptos'] != null ? num(f.valores[iD['Inscriptos']]) : '';
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
  const asis = _validarAsistentes_diag9(dest);

  Logger.log('--- 5) qué NO dice ---');
  Logger.log('  - En las filas que cargó el legado, B y el destino coinciden POR CONSTRUCCIÓN: el legado los');
  Logger.log('    calculó con la misma fórmula sobre el mismo B. Eso valida la FÓRMULA, no que el número sea verdad.');
  Logger.log('  - "B vacío" no es un error: el formulario no trae ese canal o esa banda.');
  Logger.log('  - Las diferencias no se corrigen (criterio del 02/10): lo cargado queda como está.');
  Logger.log('  - El cruce de Asistentes es el del legado (figura + barrio + fecha): una fila sin barrio, o con');
  Logger.log('    el barrio escrito distinto, no se encuentra aunque la reunión sea la misma.');
  return { filas: filas, porCol: porCol, desagregado: desagregado, asistentes: asis, b2: !!b2 };
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
 * Asistentes: RDV CONJUNTO (en el archivo del destino) contra el destino, con la clave del legado
 * figura + barrio + fecha. Sólo cuenta y lista.
 */
function _validarAsistentes_diag9(dest) {
  Logger.log('--- 4) Asistentes desde RDV CONJUNTO (cruce del legado: figura + barrio + fecha) ---');
  const sh = ssDestino_().getSheetByName(RDV_HOJA_ASISTENTES_SRC);
  if (!sh) { Logger.log('  No existe "%s".', RDV_HOJA_ASISTENTES_SRC); return null; }
  const vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const hdr = vals[0];
  const iFig = findIdxOr_(hdr, ['figura', 'persona', 'nombre'], true);
  const iBar = findIdxOr_(hdr, ['barrion', 'barrio'], true);
  const iFec = findIdxOr_(hdr, ['fecha', 'fecha (fecha)', 'fecha_evento', 'fecha reunion', 'fecha reunión',
                                'fecha_reunion', 'fecha_reunión', 'fecha evento'], true);
  const iAsi = findIdxOr_(hdr, ['asistentes', 'asistente'], true);
  if (iFig == null || iBar == null || iFec == null || iAsi == null) {
    Logger.log('  "%s" no tiene Figura, Barrio, FECHA y Asistentes por encabezado: %s', RDV_HOJA_ASISTENTES_SRC,
               hdr.filter(String).join(' | '));
    return null;
  }
  const iAsD = dest.D['Asistentes'], iSt = dest.D['STATUS REUNIÓN'];
  const clave = function (fig, bar, fec) {
    const f = normalizeText_(fig), b = normalizeText_(bar), d = toDate_(fec);
    return (f && b && d) ? f + '|' + b + '|' + ymd_(d) : '';
  };
  const porClave = new Map(), porFigFecha = new Map();
  dest.filas.forEach(function (f) {
    const k = clave(f.figura, f.barrio, f.fecha);
    if (k) { if (!porClave.has(k)) porClave.set(k, []); porClave.get(k).push(f); }
    const k2 = normalizeText_(f.figura) + '|' + (f.fecha ? ymd_(f.fecha) : '');
    if (!porFigFecha.has(k2)) porFigFecha.set(k2, []);
    porFigFecha.get(k2).push(f);
  });
  const r = { filas: 0, incompletas: 0, sinAsistentes: 0, encuentran: 0, noEncuentran: [], destinoDuplicado: 0,
              vacioYRdvTiene: 0, iguales: 0, difieren: 0, destinoMenor: 0, destinoMayor: 0, peores: [],
              agendaARealizada: 0 };
  for (let i = 1; i < vals.length; i++) {
    const row = vals[i];
    if (row.every(function (v) { return esVacio_(v); })) continue;
    r.filas++;
    const fig = str(row[iFig]), bar = str(row[iBar]), fec = toDate_(row[iFec]);
    const asis = num(row[iAsi]);
    if (!fig || !bar || !fec) { r.incompletas++; continue; }
    if (!(asis > 0)) { r.sinAsistentes++; continue; }   // el legado tampoco las cruzaba
    const lista = porClave.get(clave(fig, bar, fec));
    if (!lista) {
      const alt = porFigFecha.get(normalizeText_(fig) + '|' + ymd_(fec)) || [];
      r.noEncuentran.push({ fig: fig, bar: bar, fec: fec, asis: asis,
                            alt: alt.map(function (f) { return f.fila + ' (' + (f.barrio || 'sin barrio') + ')'; }) });
      continue;
    }
    r.encuentran++;
    if (lista.length > 1) r.destinoDuplicado++;
    const f = lista[0];
    const d = iAsD != null ? num(f.valores[iAsD]) : '';
    if (d === '') {
      r.vacioYRdvTiene++;
      if (iSt != null && normStatus_(f.valores[iSt]) === normStatus_(TRANSICION_REALIZADA.desde)) r.agendaARealizada++;
    } else if (d === asis) r.iguales++;
    else {
      r.difieren++;
      if (d < asis) r.destinoMenor++; else r.destinoMayor++;
      r.peores.push({ f: f, d: d, asis: asis });
    }
  }
  Logger.log('  filas de RDV CONJUNTO: %s | sin figura, barrio o fecha: %s | sin asistentes (> 0): %s',
             r.filas, r.incompletas, r.sinAsistentes);
  Logger.log('  con asistentes: encuentran fila en el destino %s | NO encuentran %s | encuentran 2+ filas %s',
             r.encuentran, r.noEncuentran.length, r.destinoDuplicado);
  Logger.log('  de las que encuentran: Asistentes del destino VACÍO y RDV CONJUNTO lo tiene: %s  ← las que se ' +
             'escribirían (de ésas, con STATUS "en agenda" que pasaría a Realizada: %s)', r.vacioYRdvTiene, r.agendaARealizada);
  Logger.log('    iguales: %s | difieren: %s (destino menor %s, destino mayor %s) — sólo se cuentan, no se corrigen',
             r.iguales, r.difieren, r.destinoMenor, r.destinoMayor);
  Logger.log('    (el legado pisaba si el número nuevo era mayor o igual; la regla nueva escribe sólo si está vacío)');
  r.peores.sort(function (a, b) { return Math.abs(b.d - b.asis) - Math.abs(a.d - a.asis); }).slice(0, 10)
    .forEach(function (p) {
      Logger.log('      difiere: fila %s | %s | %s | %s | destino %s | RDV CONJUNTO %s', p.f.fila, p.f.figura,
                 fmtFecha_(p.f.fecha), p.f.barrio, p.d, p.asis);
    });
  Logger.log('  las que NO encuentran fila (figura | barrio | fecha | asistentes | por figura + fecha):');
  r.noEncuentran.slice(0, 60).forEach(function (x) {
    Logger.log('    %s | %s | %s | %s | %s', x.fig, x.bar, fmtFecha_(x.fec), x.asis,
               x.alt.length ? 'fila ' + x.alt.join(', ') : 'ninguna');
  });
  if (r.noEncuentran.length > 60) Logger.log('    … y %s más', r.noEncuentran.length - 60);
  return r;
}

function _padD9_(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
function _padI9_(v, n) { let s = String(v); while (s.length < n) s = ' ' + s; return s; }
