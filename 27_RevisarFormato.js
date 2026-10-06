/**
 * REVISAR_MATCH — formato de la solapa (diseño aprobado 06/10/2026).
 *
 * Este archivo SÓLO dibuja la solapa (valores visibles + formato). No decide
 * matches: recibe las fichas ya armadas por el sistema y las pinta.
 *
 * Uso:
 *   renderRevisarMatch(pendientes, resueltas)
 *   → devuelve un mapa fila→{tipo, ficha, opcion} para que el sistema escriba
 *     sus columnas auxiliares ocultas (N en adelante) y lea ELEGIR después.
 *
 *   demoRevisarMatch()  → pinta los 3 casos de ejemplo para revisar el formato.
 *
 * Columnas A..M (fijas). Todo lo que el sistema necesite guardar va de N en
 * adelante, con las columnas ocultas.
 *
 * --- En el proyecto (06/10) ---
 * Es `revisar_match_formato.gs` tal como vino con la ficha técnica (docs/revisar-match-ficha-tecnica.md),
 * con un solo cambio: `renderRevisarMatch` y `demoRevisarMatch` reciben la solapa donde dibujar (`sh`,
 * opcional). Las fichas viven en el ARCHIVO del destino (SOLAPA_FICHAS_EN_DESTINO) y el script está atado a
 * la intermedia, así que `getActive()` no es el lugar; sin `sh`, sigue siendo `getActive()` + RM.SHEET.
 * Anchos, colores, fuentes, bordes y orden de columnas: los del diseño aprobado, sin tocar.
 * Quién arma los datos y escribe las auxiliares (N+): `armarFichasFormato_` / `escribirFichasFormato_`
 * (26_Fichas.js).
 */

// ───────────────────────────── Constantes de diseño ─────────────────────────────

var RM = {
  SHEET: 'REVISAR_MATCH',
  NCOLS: 13, // A..M
  FONT: 'Arial',

  HEADERS: ['ELEGIR ▾', 'COMENTARIO', 'resultado', 'tipo de línea', 'fila', 'figura',
            'fecha', 'barrio / comuna', 'formulario / tema', 'inscriptos', 'días',
            'confianza', 'ya usado por'],

  // Anchos en px, A..M (total 1294 px: entra en una notebook de 1366 sin zoom)
  WIDTHS: [100, 140, 90, 76, 40, 140, 92, 104, 240, 56, 40, 64, 112],

  // Alineación horizontal por columna (filas de datos)
  ALIGN: ['left', 'left', 'left', 'left', 'center', 'left', 'left', 'left', 'left',
          'center', 'center', 'center', 'left'],

  // Ajuste de texto por columna: W = WRAP, C = CLIP (O = OVERFLOW se fija por tipo de línea)
  WRAP: ['C', 'W', 'W', 'C', 'C', 'W', 'C', 'W', 'W', 'C', 'C', 'C', 'W'],

  COLOR: {
    WHITE: '#FFFFFF',
    TEXT: '#202124',

    HEAD_BG: '#2E3B4E',      HEAD_TX: '#FFFFFF',   // encabezado C..M
    PICK_HEAD_BG: '#C2410C', PICK_HEAD_TX: '#FFFFFF', // encabezado ELEGIR / COMENTARIO
    PICK_BG: '#FFE8CC',      PICK_TX: '#7C2D12',   // celdas ELEGIR / COMENTARIO en línea REUNIÓN
    PICK_BORDER: '#C2410C',

    BANNER_BG: '#F1F3F5',    BANNER_TX: '#2E3B4E', BANNER_MUTED: '#5F6B7A',

    REUNION_BG: '#DCE6F2',   REUNION_TX: '#14243A', REUNION_MUTED: '#56657A',
    PQ_BG: '#F2F6FA',        PQ_TX: '#26384D',      // ¿por qué?
    LABEL_TX: '#2E3B4E',                            // etiquetas "Opción N", "¿por qué?"
    COINC_TX: '#5F6B7A',     COINC_LABEL_TX: '#9AA3AE',
    CTX_BG: '#FAFBFC',       CTX_TX: '#8A94A2',

    OK_BG: '#CDEBD3', OK_TX: '#14532D',   // verde  = coincide
    NO_BG: '#F6CFCB', NO_TX: '#8B1A1A',   // rojo   = no coincide
    NA_BG: '#ECEEF0', NA_TX: '#5F6B7A',   // gris   = no se puede comparar
    AV_BG: '#FFEFA8', AV_TX: '#5C4300',   // amarillo = aviso (eje, ya usado, varias figuras)

    RESULT_OK_TX: '#1E6B34', RESULT_NO_TX: '#A50E0E',

    RES_HEAD_BG: '#E9ECEF',  RES_HEAD_TX: '#6B7785',
    RES_BG: '#F8F9FA',       RES_TX: '#9AA3AE',
    RES_OK_TX: '#4F7A5A',    RES_NO_TX: '#A0605A',

    GRID: '#E3E6EA',          // bordes finos dentro de cada ficha
    BLOCK_BOTTOM: '#AEB8C4',  // borde inferior de cada ficha y superior de RESUELTAS
    REUNION_TOP: '#2E3B4E'    // borde superior de la línea REUNIÓN
  },

  ROW_H: {
    header: 34, banner: 26, spacerTop: 8, reunion: 30,
    porque1: 22, porque2: 36, opcion: 34, coincide: 22, contexto: 22,
    spacerFicha: 14, spacerRes: 22, resHeader: 26, resuelta: 22
  },

  POR_QUE_MAX: 150, // caracteres por línea del "¿por qué?" antes de cortar con \n

  VALIDATION_HELP: 'Elegí el formulario correcto para esta reunión. «No sé» la deja pendiente.'
};

// ───────────────────────────── API principal ─────────────────────────────

/**
 * @param {Array<Object>} pendientes  fichas pendientes (ver forma en demoRevisarMatch)
 * @param {Array<Object>} resueltas   fichas resueltas
 * @param {Sheet=} sh                 la solapa donde dibujar (sin ella: getActive() + RM.SHEET)
 * @return {Object} mapa { númeroDeFila: {tipo, ficha, opcion} }
 */
function renderRevisarMatch(pendientes, resueltas, sh) {
  if (!sh) {
    var ss = SpreadsheetApp.getActive();
    sh = ss.getSheetByName(RM.SHEET) || ss.insertSheet(RM.SHEET);
  }
  var lines = [];
  var map = {};
  var blocks = [];     // {from, to, reunionRow, porqueRows:[], coincideRows:[]}
  var validations = []; // {row, list}

  var push = function (L, meta) {
    lines.push(L);
    if (meta) map[lines.length] = meta;
    return lines.length; // número de fila (1-based)
  };

  push(headerLine_());
  push(bannerLine_(pendientes.length));
  push(spacerLine_(RM.ROW_H.spacerTop));

  pendientes.forEach(function (f, fi) {
    if (fi > 0) push(spacerLine_(RM.ROW_H.spacerFicha));
    var b = { porqueRows: [], coincideRows: [] };
    b.from = b.reunionRow = push(reunionLine_(f), { tipo: 'reunion', ficha: fi });
    b.porqueRows.push(push(porqueLine_(f.porque), { tipo: 'porque', ficha: fi }));
    (f.opciones || []).forEach(function (o, oi) {
      push(opcionLine_(o, oi), { tipo: 'opcion', ficha: fi, opcion: oi + 1 });
      b.coincideRows.push(push(coincideLine_(o.coincide), { tipo: 'coincide', ficha: fi, opcion: oi + 1 }));
    });
    (f.contexto || []).forEach(function (c) {
      push(contextoLine_(c), { tipo: 'contexto', ficha: fi });
    });
    b.to = lines.length;
    blocks.push(b);
    var list = (f.opciones || []).map(function (_, i) { return 'Opción ' + (i + 1); })
      .concat(['Ninguno', 'No sé']);
    validations.push({ row: b.reunionRow, list: list });
  });

  push(spacerLine_(RM.ROW_H.spacerRes));
  var resHeaderRow = push(resHeaderLine_(resueltas.length));
  var resFrom = lines.length + 1;
  resueltas.forEach(function (r, ri) { push(resueltaLine_(r), { tipo: 'resuelta', ficha: ri }); });
  var resTo = lines.length;

  writeSheet_(sh, lines);
  drawBorders_(sh, blocks, resHeaderRow, resFrom, resTo);
  applyValidations_(sh, validations);

  sh.setFrozenRows(2);
  sh.setFrozenColumns(2);
  sh.setHiddenGridlines(true);
  sh.setTabColor(RM.COLOR.PICK_HEAD_BG);
  RM.WIDTHS.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  return map;
}

// ───────────────────────────── Tipos de línea ─────────────────────────────

function line_(type, height) {
  var n = RM.NCOLS, C = RM.COLOR;
  return {
    type: type, height: height,
    v: fill_(n, ''), bg: fill_(n, C.WHITE), fc: fill_(n, C.TEXT),
    fw: fill_(n, 'normal'), fs: fill_(n, 'normal'), sz: fill_(n, 10),
    wrap: RM.WRAP.slice(), ha: RM.ALIGN.slice()
  };
}

function headerLine_() {
  var C = RM.COLOR, L = line_('header', RM.ROW_H.header);
  L.v = RM.HEADERS.slice();
  paint_(L, 0, 1, { bg: C.PICK_HEAD_BG, fc: C.PICK_HEAD_TX, fw: 'bold', sz: 9, wrap: 'W' });
  paint_(L, 2, 12, { bg: C.HEAD_BG, fc: C.HEAD_TX, fw: 'bold', sz: 9, wrap: 'W' });
  return L;
}

function bannerLine_(nPend) {
  var C = RM.COLOR, L = line_('banner', RM.ROW_H.banner);
  paint_(L, 0, 12, { bg: C.BANNER_BG, wrap: 'C' });
  set_(L, 0, '↓ Elegí en la línea REUNIÓN', { fc: C.PICK_HEAD_BG, fw: 'bold', wrap: 'O', ha: 'left' });
  set_(L, 3, 'PENDIENTES (' + nPend + ')', { fc: C.BANNER_TX, fw: 'bold', wrap: 'O', ha: 'left' });
  set_(L, 5, '✅ coincide', { bg: C.OK_BG, fc: C.OK_TX });
  set_(L, 6, '❌ no coincide', { bg: C.NO_BG, fc: C.NO_TX });
  set_(L, 7, '⚪ no se compara', { bg: C.NA_BG, fc: C.NA_TX });
  set_(L, 8, '⚠️ aviso (eje, ya usado, varias figuras)', { bg: C.AV_BG, fc: C.AV_TX });
  set_(L, 9, '«No sé» la deja pendiente.', { fc: C.BANNER_MUTED, sz: 9, wrap: 'O', ha: 'left' });
  return L;
}

function spacerLine_(h) {
  var L = line_('spacer', h);
  paint_(L, 0, 12, { wrap: 'C' });
  return L;
}

function reunionLine_(f) {
  var C = RM.COLOR, r = f.reunion, L = line_('reunion', RM.ROW_H.reunion);
  paint_(L, 0, 1, { bg: C.PICK_BG, fc: C.PICK_TX, fw: 'bold' });
  paint_(L, 2, 12, { bg: C.REUNION_BG, fc: C.REUNION_TX, fw: 'bold', sz: 11 });
  L.v[0] = f.elegido || '';
  L.v[1] = f.comentario || '';
  setResultado_(L, f.resultado, false);
  L.v[3] = 'REUNIÓN';
  L.v[4] = r.fila;
  L.v[5] = r.figura;
  L.v[6] = r.fecha;              // "mié 09/09/2026"
  if (r.barrio) { L.v[7] = r.barrio; }
  else { set_(L, 7, 'sin barrio', { fw: 'normal', fs: 'italic', fc: C.REUNION_MUTED }); }
  L.v[8] = r.tema;
  L.v[9] = (r.inscriptos == null ? '' : r.inscriptos);
  return L;
}

function porqueLine_(text) {
  var C = RM.COLOR, t = breakLine_(text || '', RM.POR_QUE_MAX);
  var L = line_('porque', t.indexOf('\n') >= 0 ? RM.ROW_H.porque2 : RM.ROW_H.porque1);
  paint_(L, 2, 12, { bg: C.PQ_BG, fc: C.PQ_TX, fs: 'italic', wrap: 'C' });
  set_(L, 3, '¿por qué?', { fw: 'bold', fc: C.LABEL_TX });
  // El texto va en E y desborda sobre F..M (que quedan vacías). Alineado a la izquierda.
  set_(L, 4, t, { wrap: 'O', ha: 'left' });
  return L;
}

function opcionLine_(o, i) {
  var C = RM.COLOR, m = o.match || {}, L = line_('opcion', RM.ROW_H.opcion);
  set_(L, 3, 'Opción ' + (i + 1), { fw: 'bold', fc: C.LABEL_TX });
  L.v[5] = o.figura || '(sin figura)';
  L.v[6] = 'cierra ' + o.cierra;   // "22/09"
  L.v[7] = o.barrio || '';
  L.v[8] = o.formulario;           // texto recortado con "…" al inicio
  L.v[9] = (o.inscriptos == null ? '—' : o.inscriptos);
  L.v[10] = fmtDias_(o.dias);
  L.v[11] = o.confianza || '';
  L.v[12] = o.yaUsadoPor || '';
  matchColor_(L, 5, m.figura);
  matchColor_(L, 6, m.fecha);
  matchColor_(L, 10, m.fecha);     // "días" lleva el mismo color que "fecha"
  matchColor_(L, 7, m.barrio);
  if (o.yaUsadoPor) matchColor_(L, 12, 'av');
  return L;
}

function coincideLine_(text) {
  var C = RM.COLOR, L = line_('coincide', RM.ROW_H.coincide);
  paint_(L, 2, 12, { fc: C.COINC_TX, sz: 9, wrap: 'C' });
  set_(L, 3, 'coincide', { fc: C.COINC_LABEL_TX, sz: 8 });
  set_(L, 4, text || '', { wrap: 'O', ha: 'left' });
  return L;
}

function contextoLine_(c) {
  var C = RM.COLOR, L = line_('contexto', RM.ROW_H.contexto);
  paint_(L, 2, 12, { bg: C.CTX_BG, fc: C.CTX_TX, sz: 9, fs: 'italic' });
  L.v[3] = 'contexto';
  L.v[4] = c.fila;
  L.v[5] = c.figura;
  L.v[6] = c.fecha;
  L.v[7] = c.barrio || '';
  L.v[8] = c.tema || '';
  L.v[10] = fmtDias_(c.dias);
  L.v[12] = c.nota || '';          // ej. "tiene la opción 1"
  return L;
}

function resHeaderLine_(nRes) {
  var C = RM.COLOR, L = line_('resHeader', RM.ROW_H.resHeader);
  paint_(L, 0, 12, { bg: C.RES_HEAD_BG, fc: C.RES_HEAD_TX, wrap: 'C' });
  set_(L, 3, 'RESUELTAS (' + nRes + ')', { fw: 'bold', wrap: 'O', ha: 'left' });
  set_(L, 5, 'lo que ya eligió una persona. Para anular: borrar su línea en ELECCIONES_MATCH.',
       { fs: 'italic', wrap: 'O', ha: 'left' });
  return L;
}

function resueltaLine_(r) {
  var C = RM.COLOR, L = line_('resuelta', RM.ROW_H.resuelta);
  paint_(L, 0, 12, { bg: C.RES_BG, fc: C.RES_TX, sz: 9, wrap: 'C' });
  L.v[0] = r.elegido || '';
  L.v[1] = r.comentario || '';
  setResultado_(L, r.resultado, true);
  L.v[3] = 'REUNIÓN';
  L.v[4] = r.fila;
  L.v[5] = r.figura;
  L.v[6] = r.fecha;
  L.v[7] = r.barrio || '';
  L.v[8] = r.formulario || '';
  L.v[9] = (r.inscriptos == null ? '' : r.inscriptos);
  L.v[10] = fmtDias_(r.dias);
  L.v[11] = r.confianza || '';
  return L;
}

// ───────────────────────────── Escritura ─────────────────────────────

function writeSheet_(sh, lines) {
  var n = lines.length, W = SpreadsheetApp.WrapStrategy;
  var wrapMap = { W: W.WRAP, C: W.CLIP, O: W.OVERFLOW };

  if (sh.getMaxRows() < n) sh.insertRowsAfter(sh.getMaxRows(), n - sh.getMaxRows());
  if (sh.getMaxColumns() < RM.NCOLS) sh.insertColumnsAfter(sh.getMaxColumns(), RM.NCOLS - sh.getMaxColumns());

  // Limpiar sólo A..M (las columnas auxiliares N+ son del sistema)
  var all = sh.getRange(1, 1, sh.getMaxRows(), RM.NCOLS);
  all.clear();
  all.clearDataValidations();
  sh.setRowHeights(1, sh.getMaxRows(), 21);

  var rg = sh.getRange(1, 1, n, RM.NCOLS);
  rg.setNumberFormat('@'); // texto plano: "+2", "09/09/2026" no se convierten
  rg.setValues(lines.map(function (L) { return L.v; }));
  rg.setBackgrounds(lines.map(function (L) { return L.bg; }));
  rg.setFontColors(lines.map(function (L) { return L.fc; }));
  rg.setFontWeights(lines.map(function (L) { return L.fw; }));
  rg.setFontStyles(lines.map(function (L) { return L.fs; }));
  rg.setFontSizes(lines.map(function (L) { return L.sz; }));
  rg.setHorizontalAlignments(lines.map(function (L) { return L.ha; }));
  rg.setWrapStrategies(lines.map(function (L) { return L.wrap.map(function (k) { return wrapMap[k]; }); }));
  rg.setVerticalAlignment('middle');
  rg.setFontFamily(RM.FONT);

  // Altos de fila, agrupando consecutivas iguales
  var start = 0;
  for (var i = 1; i <= n; i++) {
    if (i === n || lines[i].height !== lines[start].height) {
      sh.setRowHeights(start + 1, i - start, lines[start].height);
      start = i;
    }
  }
}

function drawBorders_(sh, blocks, resHeaderRow, resFrom, resTo) {
  var C = RM.COLOR, S = SpreadsheetApp.BorderStyle;
  blocks.forEach(function (b) {
    var h = b.to - b.from + 1;
    // 1) Fino en toda la ficha, A..M
    sh.getRange(b.from, 1, h, RM.NCOLS).setBorder(true, true, true, true, true, true, C.GRID, S.SOLID);
    // 2) Sin verticales donde el texto desborda (¿por qué? y coincide), E..M
    b.porqueRows.concat(b.coincideRows).forEach(function (r) {
      sh.getRange(r, 5, 1, 9).setBorder(null, null, null, null, false, null);
    });
    // 3) Borde superior oscuro en la línea REUNIÓN, C..M
    sh.getRange(b.reunionRow, 3, 1, 11).setBorder(true, null, null, null, null, null, C.REUNION_TOP, S.SOLID_MEDIUM);
    // 4) Cierre inferior de la ficha, C..M
    sh.getRange(b.to, 3, 1, 11).setBorder(null, null, true, null, null, null, C.BLOCK_BOTTOM, S.SOLID);
    // 5) Celdas de elección (A..B en REUNIÓN): borde naranja medio en los 4 lados y entre ambas
    sh.getRange(b.reunionRow, 1, 1, 2).setBorder(true, true, true, true, true, null, C.PICK_BORDER, S.SOLID_MEDIUM);
  });
  // RESUELTAS
  sh.getRange(resHeaderRow, 1, 1, RM.NCOLS).setBorder(true, null, null, null, null, null, C.BLOCK_BOTTOM, S.SOLID_MEDIUM);
  if (resTo >= resFrom) {
    sh.getRange(resFrom, 1, resTo - resFrom + 1, RM.NCOLS)
      .setBorder(null, null, true, null, null, true, C.GRID, S.SOLID);
  }
}

function applyValidations_(sh, validations) {
  validations.forEach(function (v) {
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(v.list, true)
      .setAllowInvalid(false)
      .setHelpText(RM.VALIDATION_HELP)
      .build();
    sh.getRange(v.row, 1).setDataValidation(rule);
  });
}

// ───────────────────────────── Utilidades ─────────────────────────────

function fill_(n, x) { var a = []; for (var i = 0; i < n; i++) a.push(x); return a; }

function paint_(L, from, to, p) {
  for (var i = from; i <= to; i++) {
    if (p.bg) L.bg[i] = p.bg;
    if (p.fc) L.fc[i] = p.fc;
    if (p.fw) L.fw[i] = p.fw;
    if (p.fs) L.fs[i] = p.fs;
    if (p.sz) L.sz[i] = p.sz;
    if (p.wrap) L.wrap[i] = p.wrap;
    if (p.ha) L.ha[i] = p.ha;
  }
}

function set_(L, i, value, p) { L.v[i] = value; if (p) paint_(L, i, i, p); }

/** k: 'ok' | 'no' | 'na' | 'av' | undefined (sin color) */
function matchColor_(L, i, k) {
  var C = RM.COLOR;
  var m = { ok: [C.OK_BG, C.OK_TX], no: [C.NO_BG, C.NO_TX], na: [C.NA_BG, C.NA_TX], av: [C.AV_BG, C.AV_TX] }[k];
  if (m) paint_(L, i, i, { bg: m[0], fc: m[1] });
}

function setResultado_(L, txt, muted) {
  var C = RM.COLOR;
  L.v[2] = txt || '';
  if (!txt) return;
  var ok = /^aplicado/i.test(txt), no = /^rechazado/i.test(txt);
  var fc = ok ? (muted ? C.RES_OK_TX : C.RESULT_OK_TX) : no ? (muted ? C.RES_NO_TX : C.RESULT_NO_TX) : null;
  paint_(L, 2, 2, { fw: 'normal', sz: 9, fc: fc || undefined });
}

function fmtDias_(d) {
  if (d === null || d === undefined || d === '') return '';
  if (typeof d === 'string') return d;
  return d > 0 ? '+' + d : String(d); // 0 → "0", -7 → "-7"
}

/** Corta en dos líneas (\n) si supera max: en ", " / ". " / espacio, el último antes de max. */
function breakLine_(t, max) {
  if (t.length <= max) return t;
  var head = t.slice(0, max);
  var cut = Math.max(head.lastIndexOf(', '), head.lastIndexOf('. '));
  if (cut > max * 0.5) cut += 1; else cut = head.lastIndexOf(' ');
  if (cut <= 0) return t;
  return t.slice(0, cut).trim() + '\n' + t.slice(cut).trim();
}

// ───────────────────────────── Demo (los 3 casos reales) ─────────────────────────────

function demoRevisarMatch(sh) {
  var pendientes = [
    {
      reunion: { fila: 778, figura: 'Clara Muzzio', fecha: 'mié 09/09/2026', barrio: '', tema: 'Encuentro con Vecinos' },
      porque: 'La opción 1, «VINCULO CIUDADANO - Encuentro con Vecinos - Clara Muzzio 11/9 Recoleta - Temática», es la que más coincide, pero ya la tiene la fila 785 (11/09, Recoleta). Sin ésa, ninguna otra alcanza para escribirla sola.',
      opciones: [
        { figura: 'Clara Muzzio', cierra: '11/09', barrio: 'Recoleta', formulario: '…Clara Muzzio 11/9 Recoleta - Temática',
          inscriptos: 28, dias: 2, confianza: 'media', yaUsadoPor: 'fila 785 (11/09, Recoleta)',
          match: { figura: 'ok', fecha: 'ok', barrio: 'na' },
          coincide: '✅ figura · ✅ fecha (cierra 2 días después) · ⚪ ubicación (la reunión no tiene barrio) · ⚠️ ya usado por la fila 785' }
      ],
      contexto: [
        { fila: 785, figura: 'Clara Muzzio', fecha: 'vie 11/09/2026', barrio: 'Recoleta (C2)', tema: 'Encuentro con Vecinos', dias: 2, nota: 'tiene la opción 1' }
      ]
    },
    {
      reunion: { fila: 787, figura: 'Ignacio Baistrocchi', fecha: 'mar 15/09/2026', barrio: '', tema: 'Encuentro Temático "Patrimonio"' },
      porque: 'No hay ningún formulario de Ignacio Baistrocchi a 3 días o menos. El más parecido cierra 7 días después; hay uno a 2 días que no nombra a ninguna figura.',
      opciones: [
        { figura: 'Ignacio Baistrocchi', cierra: '22/09', barrio: 'C2', formulario: '…Ignacio Baistrocchi - Comuna 2 - 22/9',
          inscriptos: null, dias: 7, confianza: 'media',
          match: { figura: 'ok', fecha: 'no', barrio: 'na' },
          coincide: '✅ figura · ❌ fecha (cierra 7 días después) · ⚪ ubicación' },
        { figura: '', cierra: '17/09', barrio: 'C10', formulario: '…Encuentro con vecinos sobre Seguridad - Comuna 10 - 17/9',
          inscriptos: null, dias: 2, confianza: 'baja',
          match: { figura: 'na', fecha: 'ok', barrio: 'na' },
          coincide: '⚪ figura (no nombra a nadie) · ✅ fecha (cierra 2 días después) · ⚪ ubicación' }
      ],
      contexto: [
        { fila: 775, figura: 'Ignacio Baistrocchi', fecha: 'mar 08/09/2026', barrio: 'Flores (C7)', tema: 'Encuentro con Vecinos', dias: -7 },
        { fila: 797, figura: 'Ignacio Baistrocchi', fecha: 'mar 22/09/2026', barrio: 'Recoleta (C2)', tema: 'Encuentro con Vecinos', dias: 7 }
      ]
    },
    {
      reunion: { fila: 798, figura: 'Hernan Lombardi', fecha: 'mar 22/09/2026', barrio: 'Monserrat (C1 Sur)', tema: 'Encuentro con Vecinos' },
      porque: 'La opción 1, «VÍNCULO CIUDADANO - Encuentro con comerciantes - Lombardi-Tapia-Piragine - Eje Norte - 22/9», nombra a 3 figuras (Lombardi, Tapia y Piragine): es una inscripción compartida y no se sabe a qué reunión van sus inscriptos.',
      opciones: [
        { figura: 'Lombardi + Tapia + Piragine', cierra: '22/09', barrio: 'Eje Norte', formulario: '…Lombardi-Tapia-Piragine - Eje Norte - 22/9',
          inscriptos: null, dias: 0, confianza: 'alta',
          match: { figura: 'av', fecha: 'ok', barrio: 'av' },
          coincide: '⚠️ nombra a 3 figuras · ✅ fecha (cierra el mismo día) · ⚠️ Eje Norte, la reunión está en Monserrat (sin eje)' }
      ],
      contexto: []
    }
  ];
  var resueltas = []; // sin datos reales todavía
  return renderRevisarMatch(pendientes, resueltas, sh);
}
