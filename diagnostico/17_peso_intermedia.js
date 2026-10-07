/**
 * diagnostico/17_peso_intermedia.js — PASO 39: cuánto pesa la base intermedia (06/10). SÓLO LECTURA.
 *
 * Por qué: el 06/10 abrir la intermedia (1dNLcBjh…) falló tres veces seguidas ("Service Spreadsheets timed out") y la
 * corrida de la agenda terminó en error. Esto mide, por solapa: filas × columnas con datos y totales (las celdas
 * asignadas cuentan contra el límite de la planilla aunque estén vacías), fórmulas, la fórmula de A1 (QUERY /
 * IMPORTRANGE), y cuánto tarda abrirla y leer cada solapa. Al final, la propuesta: qué se puede sacar (las solapas de
 * MEDICIÓN de una vez) y qué queda (lo que lee o escribe el sistema en cada corrida). No borra ni mueve nada.
 */

/** Las solapas de medición de una vez: se pueden mover a un archivo de diagnóstico aparte o borrar. */
const SOLAPAS_MEDICION_INTERMEDIA = [/^DIAG_/, /^AGENDA_MAIL$/, /^AGENDA_MAIL_DESAPARECIDAS$/, /^AGENDA_CRUCE$/,
  /^AGENDA_DESTINO_SIN_MAIL$/, /^AGENDA_BARRIO_DIRECCION$/, /^AGENDA_SEGURIDAD$/, /_PRUEBA$/, /_DEMO$/];

function medirIntermedia() {
  Logger.log('=== medirIntermedia (paso 39) — sólo lectura, no escribe nada ===');
  const t0 = Date.now();
  const ss = SpreadsheetApp.openById(RDV_SS_INTERMEDIA);
  const tAbrir = Date.now() - t0;
  const t1 = Date.now();
  const hojas = ss.getSheets();
  const tListar = Date.now() - t1;
  const filas = [];
  hojas.forEach(function (sh) {
    const x = { nombre: sh.getName(), maxF: sh.getMaxRows(), maxC: sh.getMaxColumns(), f: sh.getLastRow(), c: sh.getLastColumn(),
                formulas: 0, a1: '', ms: 0 };
    x.asignadas = x.maxF * x.maxC;
    x.conDatos = x.f * x.c;
    if (x.f && x.c) {
      const t = Date.now();
      const rg = sh.getRange(1, 1, x.f, x.c);
      rg.getValues();
      x.ms = Date.now() - t;
      try {
        const fx = rg.getFormulas();
        fx.forEach(function (r) { r.forEach(function (v) { if (v) x.formulas++; }); });
        x.a1 = String(fx[0][0] || '').slice(0, 90);
      } catch (e) { x.a1 = '(no se pudieron leer las fórmulas: ' + e + ')'; }
    }
    x.medicion = SOLAPAS_MEDICION_INTERMEDIA.some(function (re) { return re.test(x.nombre); });
    filas.push(x);
  });
  const tot = filas.reduce(function (a, x) { return { asignadas: a.asignadas + x.asignadas, conDatos: a.conDatos + x.conDatos, ms: a.ms + x.ms }; },
                           { asignadas: 0, conDatos: 0, ms: 0 });
  Logger.log('  abrir: %s ms | listar las %s solapas: %s ms | leer todas las solapas: %s ms', tAbrir, hojas.length, tListar, tot.ms);
  Logger.log('  celdas asignadas: %s (límite de una planilla: 10.000.000) | con datos: %s', tot.asignadas, tot.conDatos);
  Logger.log('--- por solapa, de la que más pesa a la que menos (asignadas | con datos | fórmulas | lectura | A1) ---');
  filas.sort(function (a, b) { return b.asignadas - a.asignadas; }).forEach(function (x) {
    Logger.log('  %s%s: %s×%s = %s (%s%%) | datos %s×%s | fórmulas %s | %s ms%s', x.medicion ? '[medición] ' : '', x.nombre,
               x.maxF, x.maxC, x.asignadas, Math.round(1000 * x.asignadas / tot.asignadas) / 10, x.f, x.c, x.formulas, x.ms,
               x.a1 ? ' | A1: ' + x.a1 : '');
  });
  const med = filas.filter(function (x) { return x.medicion; });
  const pesoMed = med.reduce(function (a, x) { return a + x.asignadas; }, 0);
  Logger.log('--- propuesta ---');
  Logger.log('  SACAR (medición de una vez; mover a un archivo de diagnóstico aparte o borrar): %s solapas, %s celdas asignadas (%s%% del total): %s',
             med.length, pesoMed, Math.round(1000 * pesoMed / tot.asignadas) / 10, med.map(function (x) { return x.nombre; }).join(', ') || '—');
  Logger.log('  QUEDAN: B y Asistentes (las fórmulas que traen el origen), la cache AGENDA_GEOCODE, los registros (REGISTRO_*, ' +
             'ELECCIONES_MATCH), los reportes de cada corrida (SIN_MATCH, EMPAREJAR_MANUAL, HISTORICO_SIN_RESOLVER, ' +
             'AGENDA_VIEJAS_SIN_FILA, AGENDA_FIGURA_A_COMPLETAR) y DERIVADAS_RESPALDO.');
  const b = filas.filter(function (x) { return x.nombre === RDV_HOJA_B; })[0];
  if (b) {
    Logger.log('  B: %s fórmula(s) (%s), %s×%s con datos, lectura %s ms. Un QUERY(IMPORTRANGE) se recalcula del lado de Google, ' +
               'no al abrir con openById; lo que sí pesa al abrir son las celdas asignadas (%s).', b.formulas, b.a1 || '—', b.f, b.c,
               b.ms, b.asignadas);
  }
  return { abrirMs: tAbrir, solapas: filas.length, asignadas: tot.asignadas, conDatos: tot.conDatos, medicion: med.length, pesoMedicion: pesoMed };
}
