/**
 * Normaliza la columna "Barrio" y escribe el resultado en una columna "BarrioN".
 * - No modifica "Barrio".
 * - Si "BarrioN" no existe, la crea.
 * - Si no se reconoce el barrio, deja el valor original.
 */
function normalizeBarriosToBarrioN(sheetName) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('No existe la hoja: ' + sheetName);

  const hdr = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const normH = hdr.map(normalizeHeader_);
  const iBarrio = normH.indexOf('barrio');
  if (iBarrio === -1) throw new Error('No se encontró la columna "Barrio" en ' + sheetName);

  // Ubicar o crear "BarrioN"
  let iBarrioN = normH.indexOf('barrion'); // así normaliza "BarrioN"
  if (iBarrioN === -1) {
    iBarrioN = sh.getLastColumn();
    sh.getRange(1, iBarrioN+1, 1, 1).setValues([['BarrioN']]);
  }

  const rows = Math.max(0, sh.getLastRow() - 1);
  if (!rows) return;

  const vBarrio = sh.getRange(2, iBarrio+1, rows, 1).getDisplayValues();
  const out = vBarrio.map(([b]) => [mapBarrioCanon_(b)]);
  sh.getRange(2, iBarrioN+1, rows, 1).setValues(out);

  SpreadsheetApp.getActive().toast(
    `Normalizados ${rows} barrios → "BarrioN" en ${sheetName}`,
    'normalizeBarriosToBarrioN', 5
  );
}

/** Ejecuta normalización en A2 y B2 */
function normalizeBarriosToBarrioN_A2B2() {
  normalizeBarriosToBarrioN('A2');
  normalizeBarriosToBarrioN('B2');
}

/* ===== Helpers de barrios (canon + alias) ===== */

function mapBarrioCanon_(v) {
  const CANON = [
    'Agronomía','Almagro','Balvanera','Barracas','Belgrano','Boedo','Caballito','Chacarita',
    'Coghlan','Colegiales','Constitución','Flores','Floresta','La Boca','La Paternal','Liniers',
    'Mataderos','Monserrat','Monte Castro','Nueva Pompeya','Núñez','Palermo','Parque Avellaneda',
    'Parque Chacabuco','Parque Chas','Parque Patricios','Puerto Madero','Recoleta','Retiro','Saavedra',
    'San Cristóbal','San Nicolás','San Telmo','Vélez Sarsfield','Versalles','Villa Crespo',
    'Villa del Parque','Villa Devoto','Villa Gral. Mitre','Villa Lugano','Villa Luro','Villa Ortúzar',
    'Villa Pueyrredón','Villa Real','Villa Riachuelo','Villa Santa Rita','Villa Soldati','Villa Urquiza'
  ];
  const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
                    .toLowerCase().replace(/\s+/g,' ').trim();
  const CANON_BY_NORM = mapBarrioCanon_._cache || (mapBarrioCanon_._cache = new Map(CANON.map(c => [norm(c), c])));
  const ALIAS = mapBarrioCanon_._alias || (mapBarrioCanon_._alias = new Map([
    [norm('Nunez'), 'Núñez'],
    [norm('San Cristobal'), 'San Cristóbal'],
    [norm('San Nicolas'), 'San Nicolás'],
    [norm('Constitucion'), 'Constitución'],
    [norm('Velez Sarsfield'), 'Vélez Sarsfield'],
    [norm('Velez'), 'Vélez Sarsfield'],
    [norm('Villa Pueyrredon'), 'Villa Pueyrredón'],
    [norm('Villa Ortuzar'), 'Villa Ortúzar'],
    [norm('Montserrat'), 'Monserrat'],
    [norm('Monserratt'), 'Monserrat'],
    [norm('Paternal'), 'La Paternal'],
    [norm('Villa General Mitre'), 'Villa Gral. Mitre'],
    [norm('Villa Gral Mitre'), 'Villa Gral. Mitre'],
    [norm('Villa Gral. Mitre'), 'Villa Gral. Mitre'],
  ]));

  const n = norm(v);
  if (!n) return v;
  const direct = CANON_BY_NORM.get(n);
  if (direct) return direct;
  const alias = ALIAS.get(n);
  if (alias) return alias;
  return v; // si no se reconoce, dejamos el original
}

/* Ya la tenés en tu proyecto; la repito por si acaso */
function normalizeHeader_(s) {
  return String(s || '')
    .replace(/["']/g,'').replace(/\n/g,' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/\s+/g,' ').trim();
}
