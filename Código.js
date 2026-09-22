/**
 * Lee la columna "Nombre" y escribe en L:M:N -> Persona | Barrio | Fecha
 * - Persona: mapeada a nombres canónicos.
 * - Barrio: detecta CABA con variantes/acentos.
 * - Fecha: toma d/m, dd/mm, d/m/yy, dd/mm/yyyy (si no hay año usa DEFAULT_YEAR).
 */
function splitPersonaBarrioFecha() {
  const sh = SpreadsheetApp.getActive().getSheetByName('B') || SpreadsheetApp.getActive().insertSheet('A');
  const DEFAULT_YEAR = 2025; // <-- cambiá esto si corresponde

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const colNombre = headers.indexOf('Nombre') + 1;
  if (!colNombre) throw new Error('No encontré una columna llamada "Nombre" en la fila 1.');

  const startRow = 2;
  const numRows = Math.max(0, sh.getLastRow() - (startRow - 1));
  if (numRows === 0) return;

  const values = sh.getRange(startRow, colNombre, numRows, 1).getDisplayValues();

  // Opcional: limpiar L:M:N antes de escribir
  sh.getRange(startRow, 12, sh.getMaxRows() - (startRow - 1), 3).clearContent();

  const out = values.map(([raw]) => {
    const s = (raw || '').trim();
    const persona = detectPersona_(s);
    const barrio  = detectBarrio_(s);
    const fecha   = detectFecha_(s, DEFAULT_YEAR); // Date o '' si no hay
    return [persona, barrio, fecha];
  });

  const targetCol = 19; // L
  sh.getRange(1, targetCol, 1, 3).setValues([['Persona', 'Barrio', 'Fecha']]);
  if (out.length) {
    sh.getRange(startRow, targetCol, out.length, 3).setValues(out);
    // Formato de fecha (dd/mm/yyyy)
    sh.getRange(startRow, targetCol + 2, out.length, 1).setNumberFormat('dd/mm/yyyy');
  }
}

/* ========================= Persona ========================= */
function detectPersona_(s) {
  const sNorm = normalize_(s);
  const PERSONAS = [
    { canon: 'Diego Kravetz',            re: /\bdiego\s+kravetz\b/ },
    { canon: 'Gabriel Mraida',           re: /\bgabriel\s+mraida\b/ },
    { canon: 'Mercedes Miguel',          re: /\bmercedes\s+miguel\b/ },
    { canon: 'Ezequiel Daglio',          re: /\bezequiel\s+daglio\b/ },
    { canon: 'Maximiliano Gallucci',     re: /\bmaximiliano\s+gallucci\b/ },
    { canon: 'Hernan Lombardi',          re: /\bhernan\s+lombardi\b/ },
    { canon: 'Jorge Macri',              re: /\bjorge\s+macri\b/ },
    { canon: 'Maximiliano Piñeiro',      re: /\bmaximiliano\s+pin(?:eiro|n?eiro)\b/ },
    { canon: 'Ignacio Baistrocchi',      re: /\bignacio\s+b(?:ia|ai)strocchi\b/ },
    { canon: 'Gabino Tapia',             re: /\bgabino\s+tapia\b/ },
    { canon: 'Fernán Quirós',            re: /\bfernan\s+quiro(?:s|z)\b/ },
    { canon: 'Laura Alonso',             re: /\blaura\s+alonso\b/ },
    { canon: 'Gustavo Arengo Piragine',  re: /\bgustavo\s+arengo(?:\s+piragin[ei])?\b/ },
    { canon: 'Horacio Giménez',          re: /\bhoracio\s+gimenez\b/ },
    { canon: 'Ezequiel Sabor',           re: /\bezequiel\s+sabor\b/ },
    { canon: 'Clara Muzzio',             re: /\bclara\s+muzzio\b/ },
    { canon: 'Gabriel Sánchez Zinny',    re: /\bgabriel\s+sanchez\s+zinny\b/ },
    { canon: 'Pablo Bereciartua',        re: /\bpablo\s+bereciartua\b/ },
    { canon: 'Gabriela Ricardes',        re: /\bgabriela\s+ricardes\b/ },
    { canon: 'Ruth Landerreche',         re: /\bruth\s+lander+eche\b/ }, // acepta "landerreche" y "landereche"
  ];
  for (const p of PERSONAS) if (p.re.test(sNorm)) return p.canon;
  if (/^jorge\s+macri\b/.test(sNorm)) return 'Jorge Macri'; // fallback
  return '';
}


/* ========================= Barrio ========================= */
function detectBarrio_(s) {
  const sNorm = normalize_(s);
  const VARIANTS = [
    { canon: 'Núñez',               re: /\bnunez\b/ },
    { canon: 'Vélez Sarsfield',     re: /\bvelez(?:\s+sarsfield)?\b/ },
    { canon: 'San Cristóbal',       re: /\bsan\s+cristobal\b/ },
    { canon: 'San Nicolás',         re: /\bsan\s+nicolas\b/ },
    { canon: 'Villa General Mitre', re: /\bvilla\s+(?:general|gral\.?)\s+mitre\b/ },
    { canon: 'La Paternal',         re: /\b(?:la\s+)?paternal\b/ },
    { canon: 'Nueva Pompeya',       re: /\b(?:nueva\s+)?pompeya\b/ },
    { canon: 'Villa Pueyrredón',    re: /\bvilla\s+pueyrredon\b/ },
    { canon: 'Villa Lugano',        re: /(?:^|\s)(?:villa\s+)?lugano(?:\s|$)/ },

  ];
  for (const v of VARIANTS) if (v.re.test(sNorm)) return v.canon;

  const CANON = [
    'Agronomía','Almagro','Balvanera','Barracas','Belgrano','Boedo','Caballito','Chacarita',
    'Coghlan','Colegiales','Constitución','Flores','Floresta','La Boca','La Paternal','Liniers',
    'Mataderos','Monte Castro','Montserrat','Nueva Pompeya','Núñez','Palermo','Parque Avellaneda',
    'Parque Chacabuco','Parque Chas','Parque Patricios','Puerto Madero','Recoleta','Retiro','Saavedra',
    'San Cristóbal','San Nicolás','San Telmo','Vélez Sarsfield','Versalles','Villa Crespo',
    'Villa del Parque','Villa Devoto','Villa General Mitre','Villa Lugano','Villa Luro',
    'Villa Ortúzar','Villa Pueyrredón','Villa Real','Villa Riachuelo','Villa Santa Rita',
    'Villa Soldati','Villa Urquiza'
  ];
  for (const canon of CANON) {
    const n = normalize_(canon);
    const re = new RegExp('\\b' + escapeRegExp_(n) + '\\b');
    if (re.test(sNorm)) return canon;
  }
  return '';
}

/* ========================= Fecha ========================= */
/**
 * Busca la primera fecha d/m[/y] o dd/mm[/yyyy] en el texto.
 * Devuelve Date (al mediodía para evitar TZ/DST) o '' si no hay.
 */
function detectFecha_(s, defaultYear) {
  if (!s) return '';
  const m = /(^|[^\d])(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?([^\d]|$)/.exec(s);
  if (!m) return '';
  let d = parseInt(m[2], 10);
  let M = parseInt(m[3], 10);
  let y = m[4] ? parseInt(m[4], 10) : defaultYear;
  if (y < 100) y += 2000; // interpreta 2 dígitos como 20xx
  if (!(y >= 1900 && M >= 1 && M <= 12 && d >= 1 && d <= 31)) return '';
  return new Date(y, M - 1, d, 12, 0, 0);
}

/* ========================= Utils ========================= */
function normalize_(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function escapeRegExp_(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
