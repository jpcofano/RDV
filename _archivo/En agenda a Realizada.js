/***************** CONFIG *****************/
// Si pegás este código dentro del mismo archivo (container-bound), no cambies nada.
// Si lo corrés desde un proyecto independiente, usá OPEN_BY_ID = true.
const OPEN_BY_ID = true;
const SPREADSHEET_ID = '1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo';

const SHEETS_IN_ORDER = ['RVD JM-CM - ES', 'Para Revisar']; // primero procesa esta, luego la otra
const HDR_STATUS   = 'STATUS REUNIÓN';
const HDR_ASIST    = 'Asistentes';
const HDR_FECHA    = 'FECHA';
const HDR_HORA     = 'HORA';
const HDR_FIGURA   = 'Figura';

const STATUS_FROM  = 'en agenda';
const STATUS_TO    = 'Realizada';
const MIN_ASISTENTES = 1;

// true = lo más nuevo ARRIBA; false = lo más nuevo ABAJO
const NEWEST_ON_TOP = false;

/***************** UTIL *****************/
function _normalize(s) {
  return String(s ?? '')
    .trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function _getHeaderMap(sh) {
  const hdr = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const map = {};
  hdr.forEach((name, i) => map[_normalize(name)] = i+1);
  return map;
}
function _num(x) {
  const n = (typeof x === 'number') ? x : parseFloat(String(x).replace(',','.'));
  return isNaN(n) ? 0 : n;
}
function _sortRange(sh, cFecha, cHora, cFigura) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow <= 2) return;

  // NEWEST_ON_TOP decide asc/desc para fecha/hora
  const byFecha = { column: cFecha, ascending: !NEWEST_ON_TOP };
  const byHora  = { column: cHora,  ascending: !NEWEST_ON_TOP };
  const byFig   = { column: cFigura, ascending: true };

  sh.getRange(2, 1, lastRow - 1, lastCol).sort([byFecha, byHora, byFig]);
}

/***************** CORE *****************/
function marcarRevisadaEnOrden() {
  const ss = OPEN_BY_ID ? SpreadsheetApp.openById(SPREADSHEET_ID)
                        : SpreadsheetApp.getActive();

  SHEETS_IN_ORDER.forEach((sheetName, idx) => {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) throw new Error(`No encontré la solapa: ${sheetName}`);

    const map = _getHeaderMap(sh);
    const cStatus = map[_normalize(HDR_STATUS)];
    const cAsist  = map[_normalize(HDR_ASIST)];
    if (!cStatus || !cAsist) {
      throw new Error(`Faltan columnas en "${sheetName}": "${HDR_STATUS}" y/o "${HDR_ASIST}"`);
    }

    const data = sh.getDataRange().getValues(); // incluye encabezados
    let updates = 0;
    const out = [];

    for (let r = 1; r < data.length; r++) {
      const row = data[r].slice();
      const status = _normalize(row[cStatus-1]);
      const asis   = _num(row[cAsist-1]);

      if (status === _normalize(STATUS_FROM) && asis >= MIN_ASISTENTES) {
        if (row[cStatus-1] !== STATUS_TO) {
          row[cStatus-1] = STATUS_TO;
          updates++;
        }
      }
      out.push(row);
    }

    if (out.length) sh.getRange(2, 1, out.length, data[0].length).setValues(out);
    Logger.log(`(${idx+1}/${SHEETS_IN_ORDER.length}) ${sheetName}: ${updates} filas cambiadas a "${STATUS_TO}" (Asistentes ≥ ${MIN_ASISTENTES}).`);
  });

  // Orden final en ambas solapas
  SHEETS_IN_ORDER.forEach(sheetName => {
    const sh = (OPEN_BY_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActive())
                .getSheetByName(sheetName);
    const map = _getHeaderMap(sh);
    const cFecha  = map[_normalize(HDR_FECHA)];
    const cHora   = map[_normalize(HDR_HORA)];
    const cFigura = map[_normalize(HDR_FIGURA)];
    if (!cFecha || !cHora || !cFigura) {
      Logger.log(`Aviso: no pude ordenar "${sheetName}" (faltan FECHA/HORA/Figura).`);
      return;
    }
    _sortRange(sh, cFecha, cHora, cFigura);
    Logger.log(`Ordenado "${sheetName}" por FECHA, HORA, Figura (${NEWEST_ON_TOP ? 'más nuevo arriba' : 'más nuevo abajo'}).`);
  });

  SpreadsheetApp.flush();
  Logger.log('Listo.');
}

