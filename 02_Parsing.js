/**
 * 02_Parsing.js — sacar figura, barrio, comuna y fecha del texto libre del origen.
 *
 * **Ninguna lista está hardcodeada.** Es el cambio de fondo respecto del legado: las listas
 * fijas de `Código.js` (20 nombres) y las tres tablas de barrios de `Barrios.js` /
 * `Solapa agenda base final.js` se reemplazan por listas **derivadas de los datos**.
 *
 *   figuras  ←  la columna `Figura` del destino
 *   barrios  ←  la columna A de la tabla `Comunas`
 *
 * Por qué, en los dos casos:
 *
 * - **Las figuras cambian.** Una lista de 20 nombres en el código queda vieja el día que
 *   asume alguien nuevo, y el síntoma es una fila que entra a B2 sin `Persona` y queda
 *   inindexable (CLAUDE.md 3.1.f). La columna `Figura` del destino, en cambio, se actualiza
 *   sola: si una figura tiene reuniones, está ahí.
 * - **Las listas de barrios se contradecían.** `Solapa agenda base final.js` tiene un mapa de
 *   alias con dos entradas cruzadas —`villa gral mitre` → `Villa General Mitre` y
 *   `villa general mitre` → `Villa Gral. Mitre`— que **alterna y no converge**, y produce un
 *   valor que no está en su propia lista canónica (CLAUDE.md 3.1.h). Es la fábrica identificada
 *   del drift de 3.2. La tabla `Comunas` es la fuente que ya usan las fórmulas `AA`–`AG` del
 *   destino, así que usarla como canon **alinea el parser con lo que la planilla ya considera
 *   verdad**.
 *
 * Las listas se leen una vez por ejecución y quedan en cache. Depende de `00_Config.js` y
 * `01_Utils.js`.
 *
 * ⚠️ Igual que `01_Utils.js`: **no es confiable hasta que el grep de duplicados dé 1.**
 * Mientras `Código.js` o `Barrios.js` sigan en el proyecto, sus `detect*_` y `mapBarrioCanon_`
 * pisan a estos.
 */

// ===================== Cache de listas derivadas =====================

var _cacheParsing_ = null;

function _listas_() {
  if (_cacheParsing_) return _cacheParsing_;
  _cacheParsing_ = { figuras: leerFiguras_(), barrios: leerBarrios_() };
  return _cacheParsing_;
}

/** Para los tests y para forzar una relectura si cambió el destino en la misma corrida. */
function limpiarCacheParsing_() {
  _cacheParsing_ = null;
}

/**
 * Las figuras conocidas, desde la columna `Figura` del destino.
 * Devuelve `[{ canon, norm }]`, ordenadas de más largo a más corto para que
 * "Gabriel Sánchez Zinny" gane sobre "Gabriel" cuando las dos aparecen en el texto.
 */
function leerFiguras_() {
  const sh = SpreadsheetApp.openById(RDV_SS_DESTINO).getSheetByName(RDV_HOJA_DESTINO);
  if (!sh) throw new Error('No existe la hoja "' + RDV_HOJA_DESTINO + '".');

  const nFilas = sh.getLastRow();
  if (nFilas < 2) return [];
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const iFig = findIdxOr_(hdr, aliasColumna_('Figura'));
  const col = sh.getRange(2, iFig + 1, nFilas - 1, 1).getValues();

  const vistas = new Map();
  for (let i = 0; i < col.length; i++) {
    const canon = str(col[i][0]);
    if (!canon) continue;
    const norm = normalizeText_(canon);
    // Se queda con la primera grafía vista. El destino es la referencia, no el texto libre.
    if (norm && !vistas.has(norm)) vistas.set(norm, canon);
  }

  const out = [];
  vistas.forEach(function (canon, norm) { out.push({ canon: canon, norm: norm }); });
  out.sort(function (a, b) { return b.norm.length - a.norm.length; });
  return out;
}

/**
 * Los barrios canónicos, desde la columna A de la tabla `Comunas` (la misma que alimenta las
 * fórmulas `AA`–`AG`). Devuelve `[{ canon, norm, comuna }]`, de más largo a más corto.
 *
 * **No hay tabla de alias.** Las variantes se resuelven por normalización —sin acentos, sin
 * mayúsculas— y por las abreviaturas que se expanden en `_expandirAbreviaturas_`. Una tabla de
 * alias escrita a mano es exactamente lo que se rompió en 3.1.h.
 */
function leerBarrios_() {
  const sh = SpreadsheetApp.openById(RDV_SS_DESTINO).getSheetByName(RDV_HOJA_COMUNAS);
  if (!sh) throw new Error('No existe la tabla "' + RDV_HOJA_COMUNAS + '".');

  const nFilas = sh.getLastRow();
  if (nFilas < 2) throw new Error('La tabla "' + RDV_HOJA_COMUNAS + '" está vacía.');
  const vals = sh.getRange(2, 1, nFilas - 1, 2).getValues();

  const out = [];
  const vistos = {};
  for (let i = 0; i < vals.length; i++) {
    const canon = str(vals[i][0]);
    if (!canon) continue;
    const norm = _expandirAbreviaturas_(normalizeText_(canon));
    if (!norm || vistos[norm]) continue;
    vistos[norm] = true;
    out.push({ canon: canon, norm: norm, comuna: numComuna_(vals[i][1]) });
  }
  out.sort(function (a, b) { return b.norm.length - a.norm.length; });
  return out;
}

/**
 * Expande las abreviaturas que aparecen escritas de las dos formas. Es lo único parecido a una
 * tabla de alias que queda, y es deliberadamente chico: **expande, no traduce**. No puede
 * producir un valor que no esté en `Comunas`, que es como se rompió la tabla vieja.
 */
function _expandirAbreviaturas_(norm) {
  return String(norm)
    .replace(/\bgral\.?\b/g, 'general')
    .replace(/\bgra\.?\b/g, 'general')
    .replace(/\bsta\.?\b/g, 'santa')
    .replace(/\bsto\.?\b/g, 'santo')
    .replace(/\bpque\.?\b/g, 'parque')
    .replace(/\bvilla\s+gral\b/g, 'villa general')
    .replace(/\s+/g, ' ').trim();
}

/** Número de comuna a partir del valor de la tabla: acepta `6`, `'6'`, `'Comuna 6'`. */
function numComuna_(v) {
  if (esVacio_(v)) return null;
  if (typeof v === 'number') return (v >= 1 && v <= 15) ? v : null;
  const m = /(\d{1,2})/.exec(String(v));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return (n >= 1 && n <= 15) ? n : null;
}

// ===================== Los cuatro detect =====================

/**
 * La figura mencionada en el texto, en la grafía del destino. `''` si no reconoce ninguna.
 * Si el texto menciona varias, devuelve la primera; para tenerlas todas, `figurasEnTexto_`.
 */
function detectPersona_(texto) {
  const todas = figurasEnTexto_(texto);
  return todas.length ? todas[0] : '';
}

/**
 * Saca los prefijos administrativos del nombre del evento (`PREFIJOS_EVENTO`).
 *
 * `VINCULO CIUDADANO - Clara Muzzio, Palermo` → `Clara Muzzio, Palermo`. Hay que hacerlo
 * **antes** de buscar la figura: un prefijo que contiene un nombre propio —`JORGE MACRI -`—
 * matchea como figura y se lleva puesta a la figura real del evento.
 *
 * Saca prefijos repetidos: `POST - JORGE MACRI - ...` queda limpio en una sola pasada.
 */
function limpiarPrefijos_(texto) {
  let t = str(texto);
  let cambió = true;
  while (cambió) {
    cambió = false;
    for (let i = 0; i < PREFIJOS_EVENTO.length; i++) {
      const re = new RegExp('^\\s*' + _escapeRe_(PREFIJOS_EVENTO[i]) + '\\s*[-–:]\\s*', 'i');
      const sinAcentos = normalizeText_(t);
      if (re.test(sinAcentos)) {
        // Se corta sobre el texto original, contando los caracteres que consumió la versión
        // normalizada. Normalizar no cambia el largo en ninguno de estos prefijos.
        const m = re.exec(sinAcentos);
        t = t.substring(m[0].length).trim();
        cambió = true;
      }
    }
  }
  return t;
}

function _escapeRe_(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * ¿El formulario está anulado? `NO USAR` en el nombre del evento.
 *
 * **Un formulario anulado no es candidato de nada**: no se puntúa, no se propone en
 * `EMPAREJAR_MANUAL`, no aparece como "mejor descartado". Es distinto de "no matcheó": es el
 * origen diciendo que esa carga no vale, y reintroducirla a mano sería deshacer una decisión
 * que alguien ya tomó.
 */
function esFormularioAnulado_(texto) {
  return normalizeText_(texto).indexOf(normalizeText_(MARCA_ANULADO)) !== -1;
}

/**
 * **Todas** las figuras mencionadas. Dos o más significa una inscripción compartida por varias
 * reuniones, que es `multi_figura` y va a revisión, no un caso ambiguo (CLAUDE.md, decisión 2).
 *
 * Limpia los prefijos administrativos antes de buscar.
 */
function figurasEnTexto_(texto) {
  const t = normalizeText_(limpiarPrefijos_(texto));
  if (!t) return [];
  const out = [];
  const figuras = _listas_().figuras;
  for (let i = 0; i < figuras.length; i++) {
    if (_contienePalabra_(t, figuras[i].norm)) out.push(figuras[i].canon);
  }
  return out;
}

/** El barrio mencionado, en la grafía de `Comunas`. `''` si no reconoce ninguno. */
function detectBarrio_(texto) {
  const t = _expandirAbreviaturas_(normalizeText_(texto));
  if (!t) return '';
  const barrios = _listas_().barrios;
  for (let i = 0; i < barrios.length; i++) {
    if (_contienePalabra_(t, barrios[i].norm)) return barrios[i].canon;
  }
  return '';
}

/** Canoniza un barrio suelto contra `Comunas`. Reemplaza a los dos `mapBarrioCanon_` (3.1.h). */
function canonizarBarrio_(valor) {
  const t = _expandirAbreviaturas_(normalizeText_(valor));
  if (!t) return '';
  const barrios = _listas_().barrios;
  for (let i = 0; i < barrios.length; i++) {
    if (barrios[i].norm === t) return barrios[i].canon;   // exacto primero
  }
  for (let i = 0; i < barrios.length; i++) {
    if (_contienePalabra_(t, barrios[i].norm)) return barrios[i].canon;
  }
  return '';
}

/** La comuna de un barrio, según `Comunas`. `null` si el barrio no está en la tabla. */
function comunaDeBarrio_(barrio) {
  const canon = canonizarBarrio_(barrio);
  if (!canon) return null;
  const barrios = _listas_().barrios;
  for (let i = 0; i < barrios.length; i++) {
    if (barrios[i].canon === canon) return barrios[i].comuna;
  }
  return null;
}

/**
 * Número de comuna mencionado en el texto: `Comuna 6`, `COMUNA 06`, `C6` → `6`.
 * El origen dejó de mandar barrio y pasó a mandar comuna (CLAUDE.md 3.3.b).
 */
function detectComuna_(texto) {
  const t = String(texto == null ? '' : texto);
  let m = /\bcomuna\s*0?(\d{1,2})\b/i.exec(t);
  if (!m) m = /\bc0?(\d{1,2})\b/i.exec(t);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return (n >= 1 && n <= 15) ? n : null;
}

/**
 * La fecha de la reunión, **anclada a `fecha_fin`** (CLAUDE.md 3.3.c).
 *
 * El legado tiene la prioridad al revés: el texto libre gana y `fecha_fin` queda de fallback,
 * y como el regex casi nunca falla, la columna estructurada —disponible en el 99% de las
 * filas— prácticamente no se usa. Un `"Reunión 10-12 hs"` se lee como 10 de diciembre.
 *
 * Acá `fecha_fin` es el ancla: la fecha del texto se acepta **sólo si** cae dentro de
 * `VENTANA_FECHA_TEXTO` respecto de ella. Si no, gana `fecha_fin`.
 *
 * Devuelve `{ fecha, fuente, desvio }`:
 *   fuente: 'texto' | 'fecha_fin' | 'texto_sin_ancla' | ''
 *   desvio: días entre la fecha del texto y `fecha_fin`, o `null`
 *
 * El campo `fuente` importa: `'fecha_fin'` con un `desvio` grande es la firma de una
 * **reprogramación** —el formulario conserva la fecha vieja en el nombre y `fecha_fin` se
 * movió— y esas filas hay que poder listarlas.
 */
function detectFecha_(texto, fechaFin) {
  const porFechaFin = toDate_(fechaFin);
  const porTexto = _fechaDelTexto_(texto, porFechaFin);
  const desvio = (porTexto && porFechaFin) ? diasEntre_(porTexto, porFechaFin) : null;

  return {
    texto: porTexto,
    fechaFin: porFechaFin,
    desvio: desvio,
    // `mejor` es sólo para mostrar y para las filas que necesitan **una** fecha. No decide
    // ningún match: para eso está `distanciaFecha_`, que compara contra las dos.
    mejor: porFechaFin || porTexto || null,
    fuente: porFechaFin ? 'fecha_fin' : (porTexto ? 'texto' : '')
  };
}

/**
 * Distancia en días entre la fecha del destino y la **más cercana** de las dos candidatas.
 *
 * Ésta es la función que usa el matching, y compara contra las dos a propósito: como ninguna de
 * las dos fuentes es confiable (3.3.c), quedarse con una sola sería elegir cuál equivocarse.
 * Devuelve `null` si no hay con qué comparar.
 */
function distanciaFecha_(fechaDestino, det) {
  if (!fechaDestino || !det) return null;
  let mejor = null;
  [det.texto, det.fechaFin].forEach(function (f) {
    if (!f) return;
    const d = Math.abs(diasEntre_(f, fechaDestino));
    if (mejor === null || d < mejor) mejor = d;
  });
  return mejor;
}

/**
 * El puntaje de la señal de fecha, por bandas decrecientes (`BANDAS_FECHA`).
 *
 * **Ninguna banda descarta.** Un desvío de 30 días puntúa 0 y el candidato sigue compitiendo
 * con las otras señales — porque la fecha dejó de ser parte de la clave y pasó a ser una
 * señal más (CLAUDE.md, decisión 2).
 */
function puntajeFecha_(dias) {
  if (dias === null || dias === undefined) return 0;
  for (let i = 0; i < BANDAS_FECHA.length; i++) {
    if (dias <= BANDAS_FECHA[i].dias) return BANDAS_FECHA[i].peso;
  }
  return 0;
}

/**
 * La primera `d/m[/a]` del texto libre. El año, si no viene, sale del ancla y no del año en
 * curso: una agenda de diciembre que menciona el 3 de enero es de enero del año siguiente.
 */
function _fechaDelTexto_(texto, ancla) {
  const s = String(texto == null ? '' : texto);
  const m = /(^|[^\d])(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?([^\d]|$)/.exec(s);
  if (!m) return null;

  const d = parseInt(m[2], 10);
  const mo = parseInt(m[3], 10);
  let y;
  if (m[4]) {
    y = parseInt(m[4], 10);
    if (y < 100) y += 2000;
  } else {
    y = ancla ? ancla.getFullYear() : new Date().getFullYear();
  }
  return alMediodia_(y, mo, d);
}

// ===================== Interno =====================

/**
 * ¿`aguja` aparece en `pajar` como secuencia de palabras completas?
 *
 * Con `indexOf` pelado, "Flores" matchearía dentro de "Floresta" y "Boedo" dentro de
 * "Boedovia". Se comparan los bordes para que sólo cuente una palabra entera.
 * Las dos cadenas ya vienen normalizadas.
 */
function _contienePalabra_(pajar, aguja) {
  if (!aguja) return false;
  let desde = 0;
  for (;;) {
    const i = pajar.indexOf(aguja, desde);
    if (i === -1) return false;
    const antes = i === 0 ? ' ' : pajar.charAt(i - 1);
    const fin = i + aguja.length;
    const despues = fin >= pajar.length ? ' ' : pajar.charAt(fin);
    if (!/[a-z0-9]/.test(antes) && !/[a-z0-9]/.test(despues)) return true;
    desde = i + 1;
  }
}


// ===================== EVENTO: el texto contra el texto =====================

/**
 * Normalización para comparar `EVENTO` con el nombre del formulario.
 *
 * Las **dos puntas se normalizan igual** — es la mitad del valor de esta señal. Encima de
 * `normalizeText_` (acentos, minúsculas, espacios) saca comillas y puntuación, que es
 * exactamente donde las dos puntas difieren: el destino escribe `"Orden Público"/ Seguridad` y
 * el formulario `Orden Publico - Seguridad`.
 */
function normalizarEvento_(s) {
  return normalizeText_(s)
    .replace(/["'\u00AB\u00BB\u201C\u201D\u2018\u2019]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Las palabras de contenido de un evento: las que distinguen un tema de otro. */
function palabrasEvento_(texto) {
  const n = normalizarEvento_(texto);
  if (!n) return [];
  const vistas = {};
  return n.split(' ').filter(function (w) {
    if (w.length < 4) return false;                              // 'de', 'con', 'eje'
    if (PALABRAS_VACIAS_EVENTO.indexOf(w) !== -1) return false;  // no distinguen nada
    if (vistas[w]) return false;
    vistas[w] = true;
    return true;
  });
}

/**
 * ¿El `EVENTO` de una fila del destino aparece en el nombre de un formulario?
 *
 * Devuelve `null` cuando no hay `EVENTO` — **ausencia, no desacuerdo** (CLAUDE.md, decisión 2).
 * Cuando lo hay, informa las dos formas de coincidir por separado, porque miden cosas
 * distintas y conviene verlas antes de fundirlas en un booleano:
 *
 *   `sub`      el evento entero aparece como subcadena. Es la fuerte y la rara: basta una
 *              coma de más en una punta para perderla.
 *   `palabras` al menos `MIN_PALABRAS_EVENTO` palabras de contenido, **todas** las que hay si
 *              son menos, aparecen en el nombre. Sobrevive al reordenamiento y a la puntuación.
 */
function coincideEvento_(eventoDestino, nombreFormulario) {
  const e = normalizarEvento_(eventoDestino);
  if (!e) return null;
  const n = normalizarEvento_(nombreFormulario);
  if (!n) return { sub: false, palabras: false, cubiertas: 0, total: 0 };

  const sub = _contienePalabra_(n, e);

  const ps = palabrasEvento_(eventoDestino);
  let cubiertas = 0;
  for (let i = 0; i < ps.length; i++) if (_contienePalabra_(n, ps[i])) cubiertas++;

  // Con pocas palabras de contenido se exigen todas; con muchas, el mínimo configurado.
  const necesarias = Math.min(ps.length, MIN_PALABRAS_EVENTO);
  const palabras = ps.length > 0 && cubiertas >= necesarias && cubiertas === ps.length;

  return { sub: sub, palabras: palabras, cubiertas: cubiertas, total: ps.length };
}
