/**
 * 01_Utils.js — **una** versión de cada helper. La única.
 *
 * El legado tiene nueve `toDate_`, diez `normalizeHeader_`, siete `normalizeText_` y así
 * (CLAUDE.md 3.1.c). Apps Script comparte un scope global entre todos los archivos: gana el
 * último que carga, y el orden de carga no está en el repo. Este archivo existe para que haya
 * una sola respuesta a cada pregunta.
 *
 * ⚠️ **NO ES CONFIABLE HASTA QUE EL GREP DÉ 1.**
 *
 *     grep -c "function toDate_" *.js
 *
 * Mientras queden copias en el legado, el prefijo `01_` hace que este archivo cargue **primero**
 * y las copias del legado lo **pisen**. O sea: ni cambia el comportamiento del legado, ni estas
 * versiones son las que corren. Es inerte y engañoso a la vez. Ver el estado de la Fase 2 en
 * CLAUDE.md.
 *
 * --- Dos cambios de comportamiento respecto del legado, a propósito ---
 *
 * 1. `toDate_` es **día-primero explícito y nunca usa `new Date(string)`**. La copia de
 *    `Sync B to B2.js` sí lo usaba, y por eso las fechas del 1 al 12 de cada mes podían quedar
 *    corridas de mes según qué copia ganara (CLAUDE.md 3.1.c). Es el origen probable del
 *    "a veces funciona".
 *
 * 2. `num` devuelve **`''` cuando no hay dato**, no `0`. Ver CLAUDE.md 0.a: escribir un cero
 *    sobre una celda vacía la marca como ocupada y borra la diferencia entre "no hay dato" y
 *    "el dato es cero". Las nueve copias del legado devuelven `0` y por eso una fila de B2 que
 *    llegó sin datos se ve igual que una que llegó con ceros legítimos.
 *
 *    **Este cambio rompe la aritmética del legado**: `num(a) + num(b)` con vacíos concatena
 *    strings en vez de sumar. Es una razón más para que el legado no conviva con este archivo.
 *    Para sumar, usar `numOcero_`.
 */

// ===================== Texto =====================

/** Nunca `null`/`undefined`: siempre string, siempre sin espacios en los bordes. */
function str(v) {
  return v == null ? '' : String(v).trim();
}

/** ¿Vacío? Sólo blanco cuenta como vacío. Un `0` es un valor. */
function esVacio_(v) {
  return str(v) === '';
}

/**
 * Normalización para **comparar** texto: sin acentos, sin mayúsculas, sin espacios raros.
 * Se usa para las claves, así que cualquier cambio acá cambia todos los matcheos.
 */
function normalizeText_(s) {
  return String(s == null ? '' : s)
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')   // espacios invisibles
    .replace(/[\u2012\u2013\u2014\u2212]/g, '-')          // guiones tipográficos
    .normalize('NFD').replace(/[\u0300-\u036F]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Normalización para **encabezados**: además saca comillas y saltos de línea. */
function normalizeHeader_(s) {
  return String(s == null ? '' : s)
    .replace(/["']/g, '').replace(/\n/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036F]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// ===================== Números =====================

/**
 * Número, o `''` si no hay dato. **No devuelve 0 para vacío** (CLAUDE.md 0.a).
 * Un string no numérico también devuelve `''`: es un dato ausente, no un cero.
 */
function num(v) {
  if (esVacio_(v)) return '';
  if (typeof v === 'number') return isNaN(v) ? '' : v;
  const n = Number(String(v).trim().replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? '' : n;
}

/**
 * Para sumar. Lo mismo que `num` pero con `0` en lugar de `''`.
 * Sólo para aritmética interna — **nunca** para decidir qué escribir en una celda.
 */
function numOcero_(v) {
  const n = num(v);
  return n === '' ? 0 : n;
}

// ===================== Fechas =====================

/**
 * Fecha **día-primero y explícita**. Nunca `new Date(string)`: ese es el bug de
 * `Sync B to B2.js` que lee `03/04/2025` como 4 de marzo (CLAUDE.md 3.1.c).
 *
 * Siempre al **mediodía local**, para que ningún cambio de huso horario mueva el día
 * (CLAUDE.md 6).
 *
 * Devuelve `Date` o `null`. Nunca una fecha inventada.
 */
function toDate_(v) {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return alMediodia_(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  if (esVacio_(v)) return null;

  // Un número suelto no es una fecha. getValues() ya devuelve Date para celdas con formato
  // fecha, así que un número acá es un serial que no sabemos interpretar: mejor null.
  if (typeof v === 'number') return null;

  const s = String(v).trim();

  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/.exec(s);
  if (dmy) {
    let y = dmy[3] ? parseInt(dmy[3], 10) : new Date().getFullYear();
    if (y < 100) y += 2000;
    return alMediodia_(y, parseInt(dmy[2], 10), parseInt(dmy[1], 10));
  }

  const ymd = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/.exec(s);
  if (ymd) {
    return alMediodia_(parseInt(ymd[1], 10), parseInt(ymd[2], 10), parseInt(ymd[3], 10));
  }

  return null;
}

/** Construye la fecha validando el rango. Cualquier cosa rara devuelve null. */
function alMediodia_(y, mo, d) {
  if (!(y >= 1900 && y <= 2200 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  const f = new Date(y, mo - 1, d, 12, 0, 0);
  // Rebote: 31/02 se convierte en 03/03. Si el día cambió, la fecha no existía.
  if (f.getDate() !== d || f.getMonth() !== mo - 1) return null;
  return f;
}

/** `yyyyMMdd`, para claves. */
function ymd_(fecha) {
  return fecha ? Utilities.formatDate(fecha, RDV_TZ, 'yyyyMMdd') : '';
}

/** `dd/MM/yyyy`, para mostrar. */
function fmtFecha_(fecha) {
  return fecha ? Utilities.formatDate(fecha, RDV_TZ, 'dd/MM/yyyy') : '';
}

/** Días enteros entre dos fechas, con signo. */
function diasEntre_(a, b) {
  if (!a || !b) return null;
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

// ===================== Ventana de análisis =====================

/**
 * El primer día de la ventana: hoy menos `VENTANA_ANALISIS_MESES`, al mediodía.
 *
 * Vive acá y no en `diagnostico/` porque **el upsert también la necesita**. Los helpers `_diag`
 * delegan en estos: una sola implementación, como todo lo demás de este archivo.
 */
function inicioVentanaAnalisis_() {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth() - VENTANA_ANALISIS_MESES, hoy.getDate(),
                  12, 0, 0);
}

/** ¿La fecha cae dentro de la ventana de análisis? */
function enVentanaAnalisis_(fecha) {
  if (!fecha) return false;
  return fecha >= inicioVentanaAnalisis_();
}

/**
 * Un contador con dos lecturas: **dentro de la ventana** y **total histórico**.
 *
 * Existe porque el upsert **procesa las 802 filas** —el backfill de la Fase 6 llena el
 * histórico completo— pero **calibra y reporta sobre la ventana**. Son dos preguntas distintas
 * sobre la misma corrida, y mezclarlas fue lo que hizo que el 0,88 saliera de una distribución
 * contaminada con el formulario viejo.
 */
function contador_() { return { v: 0, t: 0 }; }

function sumar_(c, enVentana, n) {
  const k = (n === undefined) ? 1 : n;
  c.t += k;
  if (enVentana) c.v += k;
}

// ===================== Columnas =====================

/**
 * Índice 0-based de la primera columna que matchee alguno de los candidatos, por encabezado
 * normalizado. Con `opcional`, devuelve `null` en vez de tirar.
 *
 * El error incluye los encabezados disponibles a propósito: es el mensaje que uno quiere leer
 * a las tres de la tarde cuando alguien renombró una columna.
 */
function findIdxOr_(headers, candidatos, opcional) {
  const norm = headers.map(normalizeHeader_);
  for (let i = 0; i < candidatos.length; i++) {
    const j = norm.indexOf(normalizeHeader_(candidatos[i]));
    if (j !== -1) return j;
  }
  if (opcional) return null;
  throw new Error('No se encontró ninguna de estas columnas: ' + candidatos.join(' | ') +
                  '\nDisponibles: ' + norm.filter(String).join(' | '));
}

/** Nombres alternativos con los que aparece cada columna en las distintas solapas. */
function aliasColumna_(nombre) {
  const A = {
    'Figura':      ['figura', 'persona', 'nombre'],
    'Barrio':      ['barrio'],
    'BarrioN':     ['barrion'],
    'FECHA':       ['fecha'],
    'HORA':        ['hora'],
    'Dirección':   ['dirección', 'direccion'],
    'STATUS REUNIÓN': ['status reunión', 'status reunion', 'estado reunión', 'estado reunion'],
    'Asistentes':  ['asistentes', 'asistente'],
    'Inscriptos':  ['inscriptos', 'inscritos'],
    'Mail':        ['mail', 'mailing', 'email'],
    'Call Center': ['call center', 'callcenter'],
    'Difusión':    ['difusión', 'difusion'],
    'Masculinos':  ['masculinos', 'masculino'],
    'Femeninos':   ['femeninos', 'femenino'],
    'ID':          ['id'],
    'EVENTO':      ['evento', 'eventos', 'nombre del evento', 'tema', 'tematica']
  };
  return A[nombre] || [nombre];
}

/** ¿Es una columna que el equipo carga a mano? El pipeline no la escribe nunca. */
function esColumnaManual_(nombre) {
  const n = normalizeHeader_(nombre);
  return COLUMNAS_MANUALES.some(function (c) { return normalizeHeader_(c) === n; });
}

/** ¿Es una de las once derivadas? Hasta la Fase 3 son fórmulas de array: no se tocan. */
function esColumnaDerivada_(nombre) {
  const n = normalizeHeader_(nombre);
  return COLUMNAS_DERIVADAS.some(function (c) { return normalizeHeader_(c) === n; });
}

// ===================== Clave natural =====================

/**
 * La clave natural del destino: `figura|fecha`.
 *
 * **Sin barrio, a propósito.** Por la regla de negocio de CLAUDE.md 1.a una figura no tiene más
 * de una reunión por día, así que estos dos campos alcanzan. Y el barrio es justamente el campo
 * que el origen dejó de mandar (3.3.b): meterlo en la clave era atarla a un dato que desapareció.
 *
 * Es un puente hasta que `RDV_UID` esté estampado (decisión 2). La identidad final es el uuid.
 */
function claveNatural_(figura, fecha) {
  const f = normalizeText_(figura);
  const d = fecha instanceof Date ? fecha : toDate_(fecha);
  if (!f || !d) return '';
  return f + '|' + ymd_(d);
}
