/**
 * diagnostico/15_oradores.js — PASO 28: medir los oradores antes de escribirlos (06/10). SÓLO LECTURA.
 *
 * "Oradores anotados" y "Oradores que hablaron": en RDV CONJUNTO, las dos columnas que siguen a Asistentes;
 * en el destino, R y S. El sistema los copia con el mismo cruce y las mismas reglas que Asistentes
 * (`cruzarAsistentes_`, `celdasDeDecision_`). Antes de escribir, esto mide:
 *
 *   a) que las dos columnas estén en los dos lados (por encabezado; la letra, como control: si no, el
 *      cruce frena con error) y qué tipo de dato tienen (número, texto, vacío), con 10 ejemplos de cada una;
 *   b) con el mismo cruce de Asistentes (figura por tokens + fecha; con 2+ filas, desempate por barrio o
 *      comuna), por columna: cuántas filas del destino tienen el orador VACÍO y RDV CONJUNTO lo tiene (las
 *      que el sistema completaría), cuántas tienen el MISMO valor y cuántas uno DISTINTO (sólo se cuentan:
 *      no se corrigen). Las que se completarían, separadas en activas (30 días) y cerradas: las cerradas las
 *      completa el paso 22, las activas cualquier corrida.
 *
 * No escribe nada.
 */
function medirOradores() {
  Logger.log('=== medirOradores (paso 28) — sólo lectura, no escribe nada ===');
  Logger.log('  solapa destino: %s', descripcionHojaDestino_());
  const dest = leerDestino_();                 // frena si R / S no son los oradores
  const comunas = leerComunasMap_();
  const cj = cruzarAsistentes_(dest, comunas); // frena si en RDV CONJUNTO no son las dos siguientes a Asistentes
  if (cj.error) { Logger.log('>>> %s', cj.error); return { error: cj.error }; }

  // --- a) las columnas y el tipo de dato ---
  Logger.log('--- a) las columnas y el tipo de dato ---');
  const tipo = function (v) { return esVacio_(v) ? 'vacío' : (typeof v === 'number' ? 'número' : (v instanceof Date ? 'fecha' : 'texto')); };
  const resumen = function (titulo, lista) {
    const t = { 'número': 0, 'texto': 0, 'vacío': 0, 'fecha': 0 }, ej = [];
    lista.forEach(function (x) {
      t[tipo(x.v)]++;
      if (!esVacio_(x.v) && ej.length < 10) ej.push(x.donde + ' = ' + JSON.stringify(x.v instanceof Date ? fmtFecha_(x.v) : x.v));
    });
    Logger.log('  %s: número %s | texto %s | vacío %s%s', titulo, t['número'], t['texto'], t['vacío'], t.fecha ? ' | fecha ' + t.fecha : '');
    ej.forEach(function (e) { Logger.log('      %s', e); });
    return t;
  };
  const tipos = {};
  COLUMNAS_ORADORES.forEach(function (n, j) {
    const kD = dest.D[n], kC = cj.iOradores[j];
    Logger.log('  "%s": destino columna %s | RDV CONJUNTO columna %s (Asistentes en %s)', n, _letraCol_(kD + 1),
               _letraCol_(kC + 1), _letraCol_(cj.iAsi + 1));
    tipos[n] = {
      destino: resumen('    destino', dest.filas.map(function (f) { return { donde: 'fila ' + f.fila, v: f.valores[kD] }; })),
      conjunto: resumen('    RDV CONJUNTO', cj.valores.slice(1).map(function (r, i) { return { donde: 'fila ' + (i + 2), v: r[kC] }; }))
    };
  });

  // --- b) el cruce ---
  Logger.log('--- b) con el cruce de Asistentes (figura por tokens + fecha; desempate por barrio o comuna) ---');
  Logger.log('  filas del destino con algún orador en RDV CONJUNTO: %s', cj.oradores.size);
  const porFila = {};
  dest.filas.forEach(function (f) { porFila[f.fila] = f; });
  const out = {};
  COLUMNAS_ORADORES.forEach(function (n) {
    const k = dest.D[n];
    const c = { completaria: 0, completariaActivas: 0, completariaCerradas: 0, igual: 0, distinto: 0, ejemplosDistinto: [],
                ejemplosCompletaria: [] };
    cj.oradores.forEach(function (o, fila) {
      if (o[n] === undefined) return;
      const f = porFila[fila], actual = f.valores[k];
      if (esVacio_(actual)) {
        c.completaria++;
        if (esFilaActiva_(f.fecha)) c.completariaActivas++; else c.completariaCerradas++;
        if (c.ejemplosCompletaria.length < 10) c.ejemplosCompletaria.push('fila ' + fila + ' | ' + f.figura + ' | ' + fmtFecha_(f.fecha) + ' → ' + o[n]);
      } else if (_igualOrador_(actual, o[n])) c.igual++;
      else {
        c.distinto++;
        if (c.ejemplosDistinto.length < 10) {
          c.ejemplosDistinto.push('fila ' + fila + ' | ' + f.figura + ' | ' + fmtFecha_(f.fecha) + ' | destino ' +
                                  JSON.stringify(actual) + ' / RDV CONJUNTO ' + JSON.stringify(o[n]));
        }
      }
    });
    const conflictos = cj.conflictoOradores.filter(function (x) { return x.col === n; }).length;
    Logger.log('  "%s": vacío en el destino y RDV CONJUNTO lo tiene (se completaría) %s [activas %s | cerradas %s] | ' +
               'mismo valor %s | distinto (no se toca) %s | dos valores en RDV CONJUNTO (no se escribe) %s', n,
               c.completaria, c.completariaActivas, c.completariaCerradas, c.igual, c.distinto, conflictos);
    c.ejemplosCompletaria.forEach(function (e) { Logger.log('      se completaría: %s', e); });
    c.ejemplosDistinto.forEach(function (e) { Logger.log('      distinto: %s', e); });
    c.conflictos = conflictos;
    out[n] = c;
  });
  Logger.log('  cruce no seguro (no se escribe nada, como Asistentes): varias figuras %s | 2+ filas sin desempate %s | ' +
             'dos asistentes distintos para la misma fila %s', cj.variasFiguras.length, cj.ambiguas.length, cj.conflicto.length);
  Logger.log('>>> Predicción para el paso 22: escribe, por columna, el número "se completaría" (las cerradas y las ' +
             'activas); después, las corridas de cada hora sólo las de los últimos 30 días.');
  return { tipos: tipos, porColumna: out, filasConOradores: cj.oradores.size };
}
