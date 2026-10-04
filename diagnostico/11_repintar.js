/**
 * diagnostico/11_repintar.js — PASO 19: el `#4F81BD` viejo pasa al color nuevo del sistema (02/10).
 *
 * Desde el paso B toda escritura del sistema se pinta `COLOR_SISTEMA` (`#CFE2F3`). Los controles
 * reconocen los dos (`esColorSistema_`), así que repintar no cambia ningún control: es para que la
 * planilla tenga un solo color de "lo escribió el sistema". **No toca valores**: sólo el fondo de las
 * celdas que hoy están en `#4F81BD`, en la solapa a la que apunta `RDV_HOJA_DESTINO`.
 *
 *   paso19_repintarAzulViejo_enSeco()   cuenta por columna, no toca nada
 *   paso19_repintarAzulViejo()          con DRY_RUN = false repinta; con DRY_RUN = true sólo cuenta
 *
 * Lo corre el usuario.
 */
function repintarAzulViejo(aplicar) {
  const escribe = !!aplicar && DRY_RUN === false;
  Logger.log('=== repintarAzulViejo (paso 19, %s) en %s ===', escribe ? 'REPINTA' : 'EN SECO', descripcionHojaDestino_());
  if (aplicar && !escribe) Logger.log('  DRY_RUN = true: sólo se cuenta. Para repintar, DRY_RUN = false.');
  const sh = ssDestino_().getSheetByName(RDV_HOJA_DESTINO);
  if (!sh) throw new Error('No existe la hoja "' + RDV_HOJA_DESTINO + '".');
  const nFilas = sh.getLastRow(), nCols = sh.getLastColumn();
  const hdr = sh.getRange(1, 1, 1, nCols).getValues()[0];
  const fondos = sh.getRange(1, 1, nFilas, nCols).getBackgrounds();
  const viejo = AZUL_VIEJO_.toLowerCase();
  // Las columnas que no se repintan (COLUMNAS_NO_REPINTAR, 03/10): su azul no es la marca del sistema.
  const noRepintar = hdr.map(function (h) {
    return COLUMNAS_NO_REPINTAR.some(function (n) { return normalizeHeader_(n) === normalizeHeader_(h); });
  });
  const celdas = [], porCol = {}, salteadas = {};
  for (let i = 1; i < fondos.length; i++) {
    for (let k = 0; k < fondos[i].length; k++) {
      if (String(fondos[i][k]).toLowerCase() !== viejo) continue;
      if (noRepintar[k]) { salteadas[hdr[k]] = (salteadas[hdr[k]] || 0) + 1; continue; }
      celdas.push({ fila: i + 1, col: k + 1 });
      const n = hdr[k] || ('col ' + (k + 1));
      porCol[n] = (porCol[n] || 0) + 1;
    }
  }
  Logger.log('  celdas en %s: %s (sin contar las columnas que no se repintan)', AZUL_VIEJO_, celdas.length);
  Logger.log('  NO se repintan (COLUMNAS_NO_REPINTAR: %s): %s', COLUMNAS_NO_REPINTAR.join(', '),
             Object.keys(salteadas).map(function (n) { return n + ' ' + salteadas[n]; }).join(' | ') ||
             (noRepintar.some(Boolean) ? 'ninguna en ' + AZUL_VIEJO_ : 'la columna no está en esta solapa'));
  Object.keys(porCol).sort(function (a, b) { return porCol[b] - porCol[a]; })
    .forEach(function (n) { Logger.log('    %s: %s', n, porCol[n]); });
  if (!escribe) return { contadas: celdas.length, porColumna: porCol, repintadas: 0, salteadas: salteadas };
  const n = repintarAzulViejo_(sh, celdas);
  SpreadsheetApp.flush();
  Logger.log('>>> Repintadas %s celdas a %s (los valores no se tocaron).', n, COLOR_SISTEMA);
  return { contadas: celdas.length, porColumna: porCol, repintadas: n };
}
