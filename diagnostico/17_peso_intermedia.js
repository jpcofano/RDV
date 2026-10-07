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

// ===================== PASO 39 / 39b — limpiar la intermedia; PASO 40 — el archivo de registros =====================

/**
 * **Borra de la intermedia las solapas de una lista** (07/10). Sólo nombres de `lista`; las que no existen se saltean.
 * Nunca borra lo que lee o escribe el sistema: B, Asistentes, AGENDA_GEOCODE, REGISTRO_*, ELECCIONES_MATCH, los
 * reportes (guarda `SOLAPAS_NUNCA_BORRAR_`). En seco, sólo dice qué borraría y cuánto pesa.
 */
const SOLAPAS_NUNCA_BORRAR_ = ['B', 'Asistentes', 'AGENDA_GEOCODE', 'REGISTRO_AGENDA', 'REGISTRO_AGENDA_CAMBIOS', 'REGISTRO_UPSERT',
  'ELECCIONES_MATCH', 'HISTORICO_SIN_RESOLVER', 'EMPAREJAR_MANUAL', 'SIN_MATCH', 'REVISAR_MATCH', 'DERIVADAS_RESPALDO',
  'ALERTA_CAMBIOS', 'AGENDA_VIEJAS_SIN_FILA', 'AGENDA_FIGURA_A_COMPLETAR'];
function limpiarIntermedia(lista, escribe, que) {
  Logger.log('=== limpiar la intermedia: %s (%s) ===', que, escribe ? 'BORRA' : 'EN SECO');
  const ss = intermediaAgenda_();
  let borradas = 0, celdas = 0;
  const faltan = [];
  lista.forEach(function (nombre) {
    if (SOLAPAS_NUNCA_BORRAR_.indexOf(nombre) >= 0) throw new Error('"' + nombre + '" no se borra nunca. No se borró nada.');
  });
  lista.forEach(function (nombre) {
    const sh = ss.getSheetByName(nombre);
    if (!sh) { faltan.push(nombre); return; }
    const n = sh.getMaxRows() * sh.getMaxColumns();
    celdas += n;
    Logger.log('  %s %s (%s×%s con datos, %s celdas asignadas)', escribe ? 'BORRA' : 'borraría', nombre, sh.getLastRow(), sh.getLastColumn(), n);
    if (escribe) { ss.deleteSheet(sh); borradas++; }
  });
  if (faltan.length) Logger.log('  no existen (nada que borrar): %s', faltan.join(', '));
  if (escribe) SpreadsheetApp.flush();
  Logger.log('>>> %s %s solapas, %s celdas asignadas. Quedan %s solapas.', escribe ? 'borradas' : 'se borrarían',
             escribe ? borradas : lista.length - faltan.length, celdas, ss.getSheets().length);
  return { borradas: borradas, celdas: celdas, faltan: faltan };
}

/**
 * **El archivo de registros** (paso 40): crea "RDV registros" (en la carpeta raíz de Drive de quien lo corre), copia
 * ahí REGISTRO_AGENDA y REGISTRO_AGENDA_CAMBIOS de la intermedia, y dice el ID para poner en `RDV_SS_REGISTROS`. Las
 * solapas viejas de la intermedia NO se borran (quedan de respaldo). En seco, sólo dice qué haría.
 */
function crearArchivoRegistros(escribe) {
  Logger.log('=== el archivo de registros (%s) ===', escribe ? 'CREA' : 'EN SECO');
  if (RDV_SS_REGISTROS) { Logger.log('>>> RDV_SS_REGISTROS ya tiene un ID (%s): no se crea otro.', RDV_SS_REGISTROS); return { id: RDV_SS_REGISTROS }; }
  const ss = intermediaAgenda_();
  const solapas = [RDV_HOJA_REGISTRO_AGENDA, RDV_HOJA_REGISTRO_AGENDA_CAMBIOS].map(function (n) { return ss.getSheetByName(n); }).filter(Boolean);
  Logger.log('  copiaría: %s', solapas.map(function (sh) { return sh.getName() + ' (' + sh.getLastRow() + ' filas)'; }).join(', ') || '(no hay registros todavía)');
  if (!escribe) return { solapas: solapas.length };
  const nuevo = SpreadsheetApp.create('RDV registros');
  solapas.forEach(function (sh) { sh.copyTo(nuevo).setName(sh.getName()); });
  const vacia = nuevo.getSheets().filter(function (sh) { return solapas.map(function (x) { return x.getName(); }).indexOf(sh.getName()) < 0; })[0];
  if (vacia && nuevo.getSheets().length > 1) nuevo.deleteSheet(vacia);
  SpreadsheetApp.flush();
  Logger.log('>>> creado "RDV registros": %s', nuevo.getUrl());
  Logger.log('>>> poner en 00_Config.js: const RDV_SS_REGISTROS = \'%s\';  y clasp push. Desde ahí la agenda registra ahí.', nuevo.getId());
  return { id: nuevo.getId(), url: nuevo.getUrl() };
}

