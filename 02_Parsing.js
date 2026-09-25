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
  // La columna de zona, si la tabla llega hasta ahí. Si no, `zona` queda vacía y el eje del
  // destino no se puede evaluar — que es ausencia, no desacuerdo.
  const nCols = Math.min(sh.getLastColumn(), COMUNAS_COL_ZONA);
  const vals = sh.getRange(2, 1, nFilas - 1, Math.max(2, nCols)).getValues();
  const conZona = nCols >= COMUNAS_COL_ZONA;

  const out = [];
  const vistos = {};
  for (let i = 0; i < vals.length; i++) {
    const canon = str(vals[i][0]);
    if (!canon) continue;
    const norm = _expandirAbreviaturas_(normalizeText_(canon));
    if (!norm || vistos[norm]) continue;
    vistos[norm] = true;
    out.push({ canon: canon, norm: norm, comuna: numComuna_(vals[i][1]),
               zona: conZona ? str(vals[i][COMUNAS_COL_ZONA - 1]) : '' });
  }
  out.sort(function (a, b) { return b.norm.length - a.norm.length; });
  return out;
}

/**
 * El encabezado de la columna `COMUNAS_COL_ZONA` de `Comunas`, o `''` si la tabla no llega.
 * Sólo para que el bloque 2e pueda decir si esa columna es de verdad `Zona`.
 */
function encabezadoZonaComunas_() {
  const sh = SpreadsheetApp.openById(RDV_SS_DESTINO).getSheetByName(RDV_HOJA_COMUNAS);
  if (!sh || sh.getLastColumn() < COMUNAS_COL_ZONA) return '';
  return str(sh.getRange(1, COMUNAS_COL_ZONA).getValue());
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
 * ⚠️ **HIPÓTESIS SIN MEDIR — no es un caso observado.** La justificación de abajo es un
 * razonamiento que se escribió al diseñar esto, no algo que se haya visto en los datos. El
 * ejemplo `POST - JORGE MACRI - ...` que figuraba acá **no existe** en el origen
 * (docs/HANDOFF-2026-09-25.md, sección 5). El legado no limpiaba nada: `detectPersona_` corría
 * sobre el texto completo.
 *
 * Lo que sí está medido es el costo: en la corrida del 25/09 el bloque 2f atribuye el **37,3%**
 * de las no-entradas con comuna coincidente a `figura_no_reconocida_en_el_formulario`, con casos
 * como `JORGE MACRI - Encuentro con vecinos - Palermo 05/07`, donde la figura aparece **sólo en
 * el prefijo** y al borrarlo deja de puntuar.
 *
 * El razonamiento, para evaluarlo contra el número: *un prefijo con un nombre propio
 * —`JORGE MACRI -`— matchearía como figura y se llevaría puesta a la figura real del evento*
 * (`JORGE MACRI - Clara Muzzio, Palermo`). Eso sólo pasa si hay formularios con **una figura en
 * el prefijo y otra distinta en el cuerpo**. **Ese número no se midió.** Si da cero o casi
 * cero, esta función no compra nada y sale.
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
  return _figurasEnNormalizado_(normalizeText_(limpiarPrefijos_(texto)));
}

/**
 * El matcheo de figuras propiamente dicho, sobre un texto **ya normalizado**. Es el único lugar
 * donde se decide si una figura "aparece": `figurasEnTexto_` y `compararLimpiezaPrefijo_` lo
 * comparten para que la medición y el upsert no puedan divergir en el criterio (3.1.h).
 */
function _figurasEnNormalizado_(t) {
  if (!t) return [];
  const out = [];
  const figuras = _listas_().figuras;
  for (let i = 0; i < figuras.length; i++) {
    if (_contienePalabra_(t, figuras[i].norm)) out.push(figuras[i].canon);
  }
  return out;
}

/**
 * Qué cambia `limpiarPrefijos_` en las figuras de **un** formulario. Sólo lectura; lo usa
 * `medirFiguraEnPrefijo()` para decidir si la limpieza se queda (docs/HANDOFF-2026-09-25.md, §3).
 *
 * Compara lo que ve el upsert hoy (`figurasEnTexto_`, con limpieza) contra lo que veía el legado
 * (el texto completo, sin limpiar). La `clase`:
 *
 *   sin_prefijo       la limpieza no sacó nada
 *   prefijo_neutro    sacó algo, y las figuras son las mismas con y sin limpieza
 *   pierde_figura     sin limpieza había figura; con limpieza, ninguna        ← el COSTO
 *   evita_multi       sin limpieza, 2+ figuras; con limpieza, 1                ← el BENEFICIO
 *   sigue_multi       2+ figuras con y sin limpieza (sacó una, quedan varias)
 *   otro              cualquier otra combinación, o un recorte desalineado. No debería pasar:
 *                     borrar texto sólo puede quitar figuras. Si aparece, hay que mirar el caso.
 */
function compararLimpiezaPrefijo_(texto) {
  const original = str(texto);
  const cuerpo = limpiarPrefijos_(original);
  // `limpiarPrefijos_` corta el original con el largo de la versión normalizada. Si normalizar
  // acortó el prefijo (dos espacios seguidos, una tilde descompuesta), el corte cae **antes** de
  // tiempo y deja restos del prefijo al principio del cuerpo: el separador (`-Palermo`) o una
  // letra (`I-Palermo`). Nunca se come el cuerpo, porque `normalizeText_` no alarga. Ese caso se
  // reporta como `otro` en vez de medirse con un prefijo mal recortado.
  const nO = normalizeText_(original), nC = normalizeText_(cuerpo);
  const k = nO.length - nC.length;
  const alineado = nO.slice(k) === nC && !/^[-:]/.test(nC) &&
                   (k === 0 || !/[a-z0-9]/.test(nO.charAt(k - 1)));
  const prefijo = original.substring(0, original.length - cuerpo.length).trim();

  const sin = _figurasEnNormalizado_(nO);
  const con = _figurasEnNormalizado_(nC);
  const enPrefijo = _figurasEnNormalizado_(normalizeText_(prefijo));

  const mismas = sin.length === con.length &&
                 sin.every(function (x) { return con.indexOf(x) !== -1; });

  let clase;
  if (!alineado)                                 clase = 'otro';
  else if (!prefijo)                             clase = 'sin_prefijo';
  else if (mismas)                               clase = 'prefijo_neutro';
  else if (sin.length && !con.length)            clase = 'pierde_figura';
  else if (sin.length >= 2 && con.length === 1)  clase = 'evita_multi';
  else if (sin.length >= 2 && con.length >= 2)   clase = 'sigue_multi';
  else                                           clase = 'otro';

  return { clase: clase, prefijo: prefijo, enPrefijo: enPrefijo, sin: sin, con: con };
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

/** La zona de un barrio según `Comunas` (columna `COMUNAS_COL_ZONA`). `''` si no se sabe. */
function zonaDeBarrio_(barrio) {
  const canon = canonizarBarrio_(barrio);
  if (!canon) return '';
  const barrios = _listas_().barrios;
  for (let i = 0; i < barrios.length; i++) {
    if (barrios[i].canon === canon) return barrios[i].zona || '';
  }
  return '';
}

/**
 * El eje que nombra un valor de `Zona` —`Norte`, `Zona Norte`, `Eje Norte`— o `''` si no nombra
 * ninguno de `EJES_CONOCIDOS`. **Si la `Zona` de `Comunas` resulta ser otra cosa** (una región
 * sanitaria, un nombre propio), esto devuelve `''` para todo y el eje no se puede evaluar: el
 * bloque 2e lo dice en vez de inventar un mapeo.
 */
function ejeDeZona_(zona) {
  const t = normalizeText_(zona);
  if (!t) return '';
  for (let i = 0; i < EJES_CONOCIDOS.length; i++) {
    if (_contienePalabra_(t, normalizeText_(EJES_CONOCIDOS[i]))) return EJES_CONOCIDOS[i];
  }
  return '';
}

/** El eje de un barrio del destino, subiéndolo por `Comunas`. `''` si no se sabe. */
function ejeDeBarrio_(barrio) {
  return ejeDeZona_(zonaDeBarrio_(barrio));
}

/**
 * El eje geográfico que menciona el texto de un formulario. Devuelve `null` si no hay ninguno, o
 * `{ eje, tipo, forma }`:
 *
 *   tipo 'eje'               `Eje Norte`, `Eje Sur`… → eje = el de `EJES_CONOCIDOS`
 *   tipo 'eje_desconocido'   `Eje <otra cosa>`       → eje = '' (se reporta, no se usa)
 *
 * **`Comuna 1 Norte` / `Comuna 1N` NO son eje** (confirmado con el equipo): son subdivisiones
 * de la Comuna 1, que está en el centro. Tratarlas como Eje Norte descartaría candidatos buenos.
 * Las lee `detectComuna_`, como comuna 1.
 *
 * Sólo detecta. Que puntúe o no lo decide `EJE_COMO_UBICACION`.
 */
function detectEje_(texto) {
  const t = normalizeText_(texto);
  if (!t) return null;
  const m = /\beje\s+([a-z]+)\b/.exec(t);
  if (!m) return null;
  const eje = _canonEje_(m[1]);
  return { eje: eje, tipo: eje ? 'eje' : 'eje_desconocido', forma: m[0] };
}

function _canonEje_(palabra) {
  const p = normalizeText_(palabra);
  for (let i = 0; i < EJES_CONOCIDOS.length; i++) {
    if (normalizeText_(EJES_CONOCIDOS[i]) === p) return EJES_CONOCIDOS[i];
  }
  return '';
}

/** ¿El formulario es de una reunión temática (CLAUDE.md 1.d)? Por el texto o por traer eje. */
function esFormularioTematico_(texto) {
  const t = normalizeText_(texto);
  if (!t) return false;
  if (/\btematic[oa]s?\b/.test(t)) return true;
  return !!detectEje_(texto);
}

/**
 * Número de comuna mencionado en el texto: `Comuna 6`, `COMUNA 06`, `C6` → `6`.
 * El origen dejó de mandar barrio y pasó a mandar comuna (CLAUDE.md 3.3.b).
 *
 * Las subdivisiones de la Comuna 1 —`Comuna 1 Norte`, `Comuna 1N`, `Comuna 1 Sur`, `C1S`— se
 * leen como **comuna 1**, descartando el sufijo. `Comuna 1 Norte` ya se leía así; `Comuna 1N`,
 * con el sufijo pegado, no la tomaba ninguna de las dos regex y la fila quedaba sin ninguna señal
 * de ubicación. Recupera cobertura; no cambia lo que ya se leía.
 */
function detectComuna_(texto) {
  const t = String(texto == null ? '' : texto);
  let m = /\bcomuna\s*0?(\d{1,2})(?:\s*(?:norte|sur|n|s))?\b/i.exec(t);
  if (!m) m = /\bc0?(\d{1,2})(?:n|s)?\b/i.exec(t);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return (n >= 1 && n <= 15) ? n : null;
}

/**
 * La fecha de la reunión: **la del nombre del formulario**, validada por la regla del mes
 * (CLAUDE.md 1.c y 3.3.c).
 *
 * `fecha_fin` no es una segunda estimación de la fecha de la reunión: es **el cierre del
 * formulario**, otra magnitud. Sirve para dos cosas y ninguna es competir con el texto:
 *   - da el año y el mes contra los que se filtran las ocurrencias del texto;
 *   - es **respaldo** cuando el texto no dio ninguna ocurrencia aceptable.
 *
 * Que el legado le diera prioridad al texto no era el bug: el bug era aceptar la primera
 * ocurrencia sin validarla (`"Reunión 10-12 hs"` → 10 de diciembre). La regla del mes descarta
 * lo imposible, y lo que sobrevive es la fuente más cercana a la reunión.
 *
 * Devuelve `{ texto, fechaFin, desvio, rechazadas, mejor, fuente }`:
 *   mejor:  la del texto si hubo una aceptada; si no, `fecha_fin`; si no, `null`
 *   fuente: 'texto' | 'fecha_fin' | ''
 *   desvio: días entre la fecha del texto y `fecha_fin`, o `null`. Es la distancia entre el
 *           cierre del formulario y la reunión, no un error de ninguna de las dos
 */
function detectFecha_(texto, fechaFin) {
  const porFechaFin = toDate_(fechaFin);
  const oc = _ocurrenciasFecha_(texto, porFechaFin);
  const porTexto = oc.aceptada;
  const desvio = (porTexto && porFechaFin) ? diasEntre_(porTexto, porFechaFin) : null;

  return {
    texto: porTexto,
    fechaFin: porFechaFin,
    desvio: desvio,
    // Las ocurrencias que la regla de mes tiró. Sirven para medir cuánto filtró y para
    // entender un caso raro sin volver a parsear a mano.
    rechazadas: oc.rechazadas,
    // Primero el texto, ya filtrado por la regla del mes. `fecha_fin` sólo si no hubo ninguna.
    mejor: porTexto || porFechaFin || null,
    fuente: porTexto ? 'texto' : (porFechaFin ? 'fecha_fin' : '')
  };
}

/**
 * Distancia en días entre la fecha del destino y la fecha de la reunión según el formulario:
 * la del texto, o `fecha_fin` **sólo** si el texto no dio ninguna ocurrencia aceptable.
 *
 * No compara contra las dos quedándose con la más cercana. Eso se justificaba cuando el texto
 * no era confiable; con la regla del mes filtrando los meses imposibles, sí lo es, y medir
 * también contra `fecha_fin` —el cierre del formulario— premiaría coincidencias con un día que
 * no es el de la reunión.
 *
 * Devuelve `null` si no hay con qué comparar.
 */
function distanciaFecha_(fechaDestino, det) {
  if (!fechaDestino || !det || !det.mejor) return null;
  return Math.abs(diasEntre_(det.mejor, fechaDestino));
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
 * La fecha del texto libre, **filtrada por el mes de `fecha_fin`**.
 *
 * Reemplaza a la versión que se quedaba con la primera `d/m` que encontrara. La regla de
 * negocio (CLAUDE.md 1.c) dice que **el año y el mes de `fecha_fin` siempre vienen bien y sólo
 * el día puede estar corrido**, así que el texto aporta el día y nada más:
 *
 *   - el **año** sale de `fecha_fin`, nunca del texto — ni siquiera cuando el texto lo trae;
 *   - el **mes** del texto se acepta sólo si es el de `fecha_fin` o el siguiente;
 *   - si no cumple, **esa ocurrencia se descarta y se busca otra en el texto**;
 *   - el **día** sale del texto.
 *
 * Eso resuelve los dos problemas que veníamos arrastrando **sin ventana ni tolerancia**:
 *
 *   `"Reunión 10-12 hs"` en un formulario de abril leía *10 de diciembre*. Ahora el mes 12 es
 *   imposible contra un `fecha_fin` de abril, se descarta, y **la ambigüedad entre una fecha y
 *   un horario se resuelve sin tener que distinguirlos**: no hace falta saber que "10-12" es
 *   un rango horario, alcanza con que el mes no pueda ser ése.
 *
 *   Los dos outliers de **+303 días** (`fecha_fin` 2026-02-11 → texto mes 12) caen igual.
 *
 * Sin ancla la regla no se puede aplicar y se cae al comportamiento viejo: la primera
 * ocurrencia válida, con el año del texto o el actual.
 */
function _ocurrenciasFecha_(texto, ancla) {
  const s = String(texto == null ? '' : texto);
  // Lookahead al final en vez de grupo: consumir el carácter de cierre se comía la ocurrencia
  // siguiente cuando venían pegadas ("10/12,14/05").
  const re = /(?:^|[^\d])(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?(?![\d])/g;
  const rechazadas = [];
  let aceptada = null, m;

  while ((m = re.exec(s)) !== null) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    let yTexto = null;
    if (m[3]) { yTexto = parseInt(m[3], 10); if (yTexto < 100) yTexto += 2000; }

    if (!ancla) {
      if (!aceptada) aceptada = alMediodia_(yTexto || new Date().getFullYear(), mo, d);
      continue;
    }

    const anio = _anioSiMesAceptable_(mo, ancla);
    if (anio === null) {
      rechazadas.push({ dia: d, mes: mo, motivo: 'mes_imposible' });
      continue;
    }
    const f = alMediodia_(anio, mo, d);
    if (!f) { rechazadas.push({ dia: d, mes: mo, motivo: 'dia_inexistente' }); continue; }
    if (!aceptada) aceptada = f;
  }
  return { aceptada: aceptada, rechazadas: rechazadas };
}

/**
 * El año que le corresponde a un mes del texto, o `null` si ese mes es imposible.
 *
 * El año nunca sale del texto: sale del ancla, corrigiendo el salto de diciembre a enero —
 * un formulario que cierra en diciembre con la reunión en enero es del año siguiente.
 */
function _anioSiMesAceptable_(mes, ancla) {
  const mesAncla = ancla.getMonth() + 1;
  const anioAncla = ancla.getFullYear();
  for (let k = 0; k <= MESES_ADELANTE_TEXTO; k++) {
    const m = ((mesAncla - 1 + k) % 12) + 1;
    if (mes === m) return anioAncla + Math.floor((mesAncla - 1 + k) / 12);
  }
  return null;
}

/** La fecha del texto, sin el detalle de lo que se descartó. */
function _fechaDelTexto_(texto, ancla) {
  return _ocurrenciasFecha_(texto, ancla).aceptada;
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
