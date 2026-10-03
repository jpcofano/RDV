/**
 * 05_Escritura.js — **el único archivo que escribe en el destino.**
 *
 * Está separado a propósito. Que toda escritura viva acá hace que la regla de la sección 0 de
 * `CLAUDE.md` sea verificable de un vistazo:
 *
 *     grep -rn "setValue\|setValues\|setBackground" *.js
 *
 * Si eso devuelve algo fuera de este archivo que apunte al destino, está mal.
 *
 * Dos reglas, y la segunda es una **excepción explícita** a la primera. Cada una tiene su versión
 * en lote (02/10), con el mismo criterio:
 *
 *   setSiDelSistema_(rango, valor)          la regla general: escribe sólo en celda vacía.
 *   setSiDelSistemaLote_(sh, hdr, lista)    ídem, por bloques (la usa el upsert).
 *   marcarRealizada_(...)                   la única excepción: una transición de estado.
 *   marcarRealizadaLote_(...)               ídem, por bloques (la usa el upsert).
 *
 * La excepción está **afuera** de `setSiDelSistema_`, no adentro. Meterla adentro la volvería
 * inauditable: la regla general dejaría de ser cierta y nadie lo vería leyendo el helper.
 *
 * Lo usa el upsert nuevo (`20_UpsertDestino.js`, `aplicarDecisiones_`).
 */

// ===================== La regla general =====================

/**
 * Escribe `valor` en `rango` **sólo si la celda está vacía**, y pinta `COLOR_SISTEMA` (`#CFE2F3`
 * desde el 02/10; antes `#4F81BD`).
 *
 * Celda con cualquier valor → no se toca. No importa quién lo puso ni de qué color está
 * (CLAUDE.md 0). Alcanza con esto porque los números del sistema son cerrados: el formulario
 * cierra y el total no se actualiza, así que nunca hay un valor nuevo que quiera reemplazar al
 * que ya está.
 *
 * Devuelve `true` si escribió.
 */
function setSiDelSistema_(rango, valor) {
  const actual = rango.getValue();
  if (actual !== '' && actual !== null && String(actual).trim() !== '') return false;
  if (valor === '' || valor === null || valor === undefined) return false;

  rango.setValue(valor);
  rango.setBackground(COLOR_SISTEMA);
  return true;
}

/*
 * La marca de procedencia es `COLOR_SISTEMA` (00_Config.js): un solo lugar para el color. Los controles
 * reconocen también el `#4F81BD` viejo (`esColorSistema_`, 01_Utils.js).
 */

/**
 * **La misma regla que `setSiDelSistema_`, en lote** (02/10). Escribe cada `{fila, col, valor}`
 * **sólo si la celda está vacía**, y pinta `COLOR_SISTEMA` lo que escribió. Celda con cualquier valor →
 * no se toca.
 *
 * --- Por qué existe ---
 * La primera escritura real (02/10 14:50) se cortó a los 6 minutos con 123 filas: celda por celda,
 * cada `getValue` obliga a Apps Script a vaciar la cola de escrituras pendientes, así que cada celda
 * costaba un viaje completo al servicio. Acá se lee UNA vez el rectángulo que cubre todas las
 * escrituras, y se escribe por bloques.
 *
 * --- Cómo respeta el invariante ---
 *   1. la lectura es **fresca**, hecha acá adentro e inmediatamente antes de escribir: lo que el
 *      equipo haya cargado desde que se calculó el plan, se ve y no se pisa;
 *   2. los bloques que se escriben (`setValues`) cubren **sólo celdas que se van a escribir**, todas
 *      vacías en esa lectura: nunca se reescribe una celda ajena "con el mismo valor" (eso borraría
 *      una fórmula o pisaría lo que alguien escribió en el medio);
 *   3. los fondos se pintan con un `RangeList` sobre esos mismos bloques, y nada más;
 *   4. una columna manual o derivada no se escribe nunca: si aparece en `escrituras`, tira error
 *      antes de escribir nada (sería un bug del que llama, no un caso a tolerar).
 *
 * @param {Sheet}  sh          la solapa destino
 * @param {Array}  hdr         su fila de encabezados (para el chequeo 4)
 * @param {Array}  escrituras  [{fila, col, valor}], fila y col 1-based
 * @return {Array} las escrituras que efectivamente se hicieron
 */
function setSiDelSistemaLote_(sh, hdr, escrituras) {
  const pedidas = escrituras.filter(function (e) {
    return !(e.valor === '' || e.valor === null || e.valor === undefined);
  });
  if (!pedidas.length) return [];
  pedidas.forEach(function (e) {
    const nombre = hdr[e.col - 1];
    if (esColumnaManual_(nombre) || esColumnaDerivada_(nombre)) {
      throw new Error('setSiDelSistemaLote_: la columna "' + nombre + '" es manual o derivada; no se ' +
                      'escribe nunca. No se escribió nada.');
    }
  });

  let f1 = Infinity, f2 = 0, c1 = Infinity, c2 = 0;
  pedidas.forEach(function (e) {
    f1 = Math.min(f1, e.fila); f2 = Math.max(f2, e.fila);
    c1 = Math.min(c1, e.col);  c2 = Math.max(c2, e.col);
  });
  const actual = sh.getRange(f1, c1, f2 - f1 + 1, c2 - c1 + 1).getValues();   // lectura fresca

  // Sólo las celdas vacías AHORA. Una misma celda pedida dos veces: vale la primera.
  const porFila = {}, vistas = {};
  const hechas = [];
  pedidas.forEach(function (e) {
    const k = e.fila + ':' + e.col;
    if (vistas[k]) return;
    vistas[k] = true;
    const v = actual[e.fila - f1][e.col - c1];
    // `ceroEsVacio` (Inscriptos, INSCRIPTOS_CERO_ES_VACIO): un 0 es "sin cargar" y cuenta como vacío.
    const vacia = (v === '' || v === null || String(v).trim() === '') || (e.ceroEsVacio && num(v) === 0);
    if (!vacia) return;
    (porFila[e.fila] = porFila[e.fila] || []).push(e);
    hechas.push(e);
  });

  const bloques = _bloquesDeEscritura_(porFila);
  bloques.forEach(function (b) {
    sh.getRange(b.fila, b.col, b.valores.length, b.valores[0].length).setValues(b.valores);
  });
  _pintarBloques_(sh, bloques);
  return hechas;
}

/**
 * Agrupa las celdas a escribir en rectángulos que contienen SÓLO celdas a escribir: tramos de
 * columnas contiguas en cada fila, y tramos iguales en filas consecutivas se apilan.
 */
function _bloquesDeEscritura_(porFila) {
  const filas = Object.keys(porFila).map(Number).sort(function (a, b) { return a - b; });
  const abiertos = {}, bloques = [];
  filas.forEach(function (fila) {
    const celdas = porFila[fila].slice().sort(function (a, b) { return a.col - b.col; });
    const tramos = [];
    celdas.forEach(function (e) {
      const t = tramos[tramos.length - 1];
      if (t && e.col === t.col + t.valores.length) t.valores.push(e.valor);
      else tramos.push({ col: e.col, valores: [e.valor] });
    });
    tramos.forEach(function (t) {
      const k = t.col + ':' + t.valores.length;
      const b = abiertos[k];
      if (b && b.fila + b.valores.length === fila) { b.valores.push(t.valores); return; }
      const nuevo = { fila: fila, col: t.col, valores: [t.valores] };
      abiertos[k] = nuevo;
      bloques.push(nuevo);
    });
  });
  return bloques;
}

/** Pinta `COLOR_SISTEMA` los bloques escritos, con `RangeList` (de a tandas: una lista enorme falla). */
function _pintarBloques_(sh, bloques) {
  const a1 = bloques.map(function (b) {
    return _a1_(b.fila, b.col) + ':' + _a1_(b.fila + b.valores.length - 1, b.col + b.valores[0].length - 1);
  });
  for (let i = 0; i < a1.length; i += 400) {
    sh.getRangeList(a1.slice(i, i + 400)).setBackground(COLOR_SISTEMA);
  }
}

/** "AP12" a partir de fila y columna 1-based. */
function _a1_(fila, col) {
  let s = '', n = col;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s + fila;
}

// ===================== La única excepción =====================

/**
 * Avanza `STATUS REUNIÓN` de `en agenda` a `Realizada` cuando la fila ya tiene asistentes.
 *
 * --- Por qué es una excepción, y por qué hace falta ---
 * `STATUS REUNIÓN` **no es un número cerrado: es un estado que cambia.** La regla general le
 * impediría avanzar, porque la celda ya tiene valor (`en agenda`). Sin excepción, una reunión
 * que efectivamente ocurrió se quedaría marcada como agendada para siempre.
 *
 * --- Qué tan angosta es ---
 * Una sola transición, en una sola dirección:
 *
 *   `en agenda` → `Realizada`, y **sólo** si hay asistentes cargados.
 *
 * Nunca al revés. Nunca hacia ningún otro valor. Y **nunca desde ningún otro estado**: la
 * whitelist es de un solo origen a propósito. "Cualquier estado que no sea Realizada" permitiría
 * pisar una reunión que alguien **suspendió o reprogramó a mano**, que es carga humana y está
 * protegida por el invariante. `Suspendida`, `Reprogramada` y `Se modifico el barrio` son
 * decisiones de una persona: el pipeline no las toca.
 *
 * Un estado que no esté en `STATUS_CONOCIDOS` tampoco se toca — si apareció algo nuevo, lo
 * primero es entender qué significa, no pisarlo.
 *
 * Pinta `COLOR_SISTEMA` como cualquier otra escritura del sistema: el equipo tiene que poder ver de
 * un vistazo que ese "Realizada" lo puso el proceso y no una persona.
 *
 * @param {Range}  rangoStatus  la celda de STATUS REUNIÓN de la fila
 * @param {number} asistentes   los asistentes de esa fila (de A2 / RDV CONJUNTO, no de B2)
 * @return {boolean} true si avanzó el estado
 */
function marcarRealizada_(rangoStatus, asistentes) {
  if (!_decideRealizada_(rangoStatus.getValue(), asistentes)) return false;
  rangoStatus.setValue(TRANSICION_REALIZADA.hacia);
  rangoStatus.setBackground(COLOR_SISTEMA);
  return true;
}

/**
 * **La misma excepción, en lote** (02/10): para cada fila de `filas`, `en agenda` → `Realizada` si
 * tiene asistentes. Mismo criterio que `marcarRealizada_` —que es la que decide, celda por celda,
 * sobre los valores leídos acá—, sin pasar por `setSiDelSistemaLote_` (es la excepción, no la regla).
 *
 * Lee fresco el bloque de filas × (STATUS y Asistentes) y escribe con un `RangeList`: el valor es el
 * mismo para todas (`Realizada`) y el fondo también.
 *
 * @param {Array}  filas       números de fila (1-based)
 * @param {number} colStatus   columna de STATUS REUNIÓN (1-based)
 * @param {number} colAsis     columna de Asistentes (1-based)
 * @return {Array} las filas que avanzaron
 */
function marcarRealizadaLote_(sh, filas, colStatus, colAsis) {
  if (!filas.length) return [];
  const f1 = Math.min.apply(null, filas), f2 = Math.max.apply(null, filas);
  const c1 = Math.min(colStatus, colAsis), c2 = Math.max(colStatus, colAsis);
  const vals = sh.getRange(f1, c1, f2 - f1 + 1, c2 - c1 + 1).getValues();   // lectura fresca
  const avanzan = [];
  filas.forEach(function (fila) {
    const r = vals[fila - f1];
    if (_decideRealizada_(r[colStatus - c1], numOcero_(r[colAsis - c1]))) avanzan.push(fila);
  });
  if (!avanzan.length) return [];
  const a1 = avanzan.map(function (f) { return _a1_(f, colStatus); });
  for (let i = 0; i < a1.length; i += 400) {
    const rl = sh.getRangeList(a1.slice(i, i + 400));
    rl.setValue(TRANSICION_REALIZADA.hacia);
    rl.setBackground(COLOR_SISTEMA);
  }
  return avanzan;
}

/**
 * La decisión de `marcarRealizada_`, sobre valores ya leídos: ¿esta celda de STATUS, con estos
 * asistentes, avanza a `Realizada`? Sólo desde `en agenda`; un estado desconocido se loguea (salvo
 * con `callar`) y queda.
 */
function _decideRealizada_(status, asistentes, callar) {
  const n = (typeof asistentes === 'number') ? asistentes : Number(asistentes);
  if (!(n >= MIN_ASISTENTES_REALIZADA)) return false;
  const actual = String(status == null ? '' : status).trim();
  // Ya está donde queremos: no reescribir (evita repintar y ensuciar la métrica de procedencia).
  if (normStatus_(actual) === normStatus_(TRANSICION_REALIZADA.hacia)) return false;
  // La whitelist: un solo estado de origen. Todo lo demás queda como está.
  if (normStatus_(actual) !== normStatus_(TRANSICION_REALIZADA.desde)) {
    // Un estado que no conocemos es una señal, no un caso borde: se avisa, no se toca.
    if (!callar && actual !== '' && !statusConocido_(actual)) {
      Logger.log('[escritura] STATUS desconocido, no se tocó: "%s"', actual);
    }
    return false;
  }
  return true;
}

// ===================== Deshacer lo que el sistema escribió mal =====================

/**
 * **Vacía celdas que escribió mal el sistema y les saca el color** (02/10, paso 18). No es la regla
 * general ni la excepción de STATUS: es la corrección de un error NUESTRO (el upsert calculó con
 * ceros cuando `B` cambió los encabezados y escribió `Sin identificar = Inscriptos`). Los errores del
 * pasado no se corrigen; éste sí, porque lo escribió el sistema el 02/10.
 *
 * Cada `{fila, col, escrito}` se vacía **sólo si, en una lectura fresca, la celda sigue teniendo
 * exactamente `escrito` y el fondo del sistema** (`COLORES_SISTEMA`: el actual o el viejo). Si alguien la cambió, no se toca. El
 * fondo vuelve al de por defecto (`setBackground(null)`).
 *
 * @return {Array} las celdas que efectivamente vació
 */
function vaciarCeldasDelSistema_(sh, celdas) {
  if (!celdas.length) return [];
  let f1 = Infinity, f2 = 0, c1 = Infinity, c2 = 0;
  celdas.forEach(function (e) {
    f1 = Math.min(f1, e.fila); f2 = Math.max(f2, e.fila); c1 = Math.min(c1, e.col); c2 = Math.max(c2, e.col);
  });
  const rango = sh.getRange(f1, c1, f2 - f1 + 1, c2 - c1 + 1);
  const vals = rango.getValues(), fondos = rango.getBackgrounds();
  const hechas = celdas.filter(function (e) {
    const v = vals[e.fila - f1][e.col - c1], bg = String(fondos[e.fila - f1][e.col - c1]).toLowerCase();
    return v === e.escrito && esColorSistema_(bg);
  });
  const a1 = hechas.map(function (e) { return _a1_(e.fila, e.col); });
  for (let i = 0; i < a1.length; i += 400) {
    const rl = sh.getRangeList(a1.slice(i, i + 400));
    rl.clearContent();
    rl.setBackground(null);
  }
  return hechas;
}

// ===================== Repintar el azul viejo =====================

/** El color viejo de la marca del sistema (legado y corridas hasta el 02/10). */
const AZUL_VIEJO_ = '#4F81BD';

/**
 * **Cambia el fondo `#4F81BD` viejo por `COLOR_SISTEMA`, sin tocar valores** (paso 19, 02/10). Sólo
 * las celdas de `celdas` ({fila, col}) que en una lectura fresca siguen en `#4F81BD`. Pinta por tramos
 * verticales contiguos de una misma columna, con `RangeList`.
 *
 * @return {number} cuántas celdas repintó
 */
function repintarAzulViejo_(sh, celdas) {
  if (!celdas.length) return 0;
  const fondos = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getBackgrounds();   // lectura fresca
  const viejo = AZUL_VIEJO_.toLowerCase();
  const siguen = celdas.filter(function (e) {
    return fondos[e.fila - 1] && String(fondos[e.fila - 1][e.col - 1]).toLowerCase() === viejo;
  }).sort(function (a, b) { return a.col - b.col || a.fila - b.fila; });
  const tramos = [];
  siguen.forEach(function (e) {
    const t = tramos[tramos.length - 1];
    if (t && t.col === e.col && t.hasta + 1 === e.fila) t.hasta = e.fila;
    else tramos.push({ col: e.col, desde: e.fila, hasta: e.fila });
  });
  const a1 = tramos.map(function (t) { return _a1_(t.desde, t.col) + ':' + _a1_(t.hasta, t.col); });
  for (let i = 0; i < a1.length; i += 400) sh.getRangeList(a1.slice(i, i + 400)).setBackground(COLOR_SISTEMA);
  return siguen.length;
}

// ===================== La guarda de la solapa destino =====================

/**
 * La solapa a la que apunta `RDV_HOJA_DESTINO`, **o error sin escribir nada** (02/10). Si no es el
 * destino real (la copia de prueba), sus encabezados tienen que ser exactamente los del destino
 * real, en el mismo orden: una solapa que no es la esperada no se escribe.
 */
function verificarHojaDestino_(ss) {
  const sh = ss.getSheetByName(RDV_HOJA_DESTINO);
  if (!sh) throw new Error('No existe la solapa destino "' + RDV_HOJA_DESTINO + '". No se escribió nada.');
  if (RDV_HOJA_DESTINO === RDV_HOJA_DESTINO_REAL) return sh;

  const real = ss.getSheetByName(RDV_HOJA_DESTINO_REAL);
  if (!real) throw new Error('No existe "' + RDV_HOJA_DESTINO_REAL + '" para comparar encabezados. No se escribió nada.');
  const h = function (s) {
    const fila = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(normalizeHeader_);
    while (fila.length && !fila[fila.length - 1]) fila.pop();
    return fila;
  };
  const a = h(sh), b = h(real);
  // La copia puede tener columnas de traza que el real todavía no tiene (form_clave, 02/10: se le
  // agrega al real con paso1_columnasDeTraza() al volver). Sólo al final, y sólo de COLUMNAS_TRAZA.
  const traza = COLUMNAS_TRAZA.map(normalizeHeader_);
  while (a.length > b.length && traza.indexOf(a[a.length - 1]) >= 0) a.pop();
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      throw new Error('Los encabezados de "' + RDV_HOJA_DESTINO + '" no son los del destino real: ' +
                      'columna ' + (i + 1) + ' dice "' + (a[i] || '') + '" y en "' + RDV_HOJA_DESTINO_REAL +
                      '" dice "' + (b[i] || '') + '". No se escribió nada.');
    }
  }
  return sh;
}

// ===================== Fase 2b: las columnas de traza =====================

/**
 * Agrega al destino las columnas de `COLUMNAS_TRAZA` que falten (seis desde el 02/10: `form_clave`).
 *
 * Es idempotente: las que ya están no se tocan, y volver a correrlo no hace nada.
 *
 * --- Por qué es seguro, y por qué igual vive acá ---
 * Escribe **sólo el encabezado, en la primera columna libre al final**. Nunca
 * `insertColumnBefore` ni nada que desplace: las once fórmulas de array viven en `D`, `W`, `X`,
 * `Y` y `AA`–`AG`, todas antes, y **desplazar una columna correría los fondos respecto de sus
 * filas** (CLAUDE.md 6). Agregar al final no mueve una sola celda existente.
 *
 * Vive en `05_Escritura.js` aunque no use `setSiDelSistema_` porque **es una escritura al
 * destino**, y la regla es que todas estén en este archivo para poder auditarlas de un grep.
 * No pasa por el helper porque no escribe datos: escribe estructura, una vez.
 *
 * Después de esto, la próxima corrida del upsert ya tiene dónde estampar.
 */
function correrFase2b() {
  const sh = SpreadsheetApp.openById(RDV_SS_DESTINO).getSheetByName(RDV_HOJA_DESTINO);
  if (!sh) throw new Error('No existe la hoja "' + RDV_HOJA_DESTINO + '".');

  const nCols = sh.getLastColumn();
  const hdr = sh.getRange(1, 1, 1, nCols).getValues()[0];
  const presentes = {};
  hdr.forEach(function (h) { presentes[normalizeHeader_(h)] = true; });

  const faltan = COLUMNAS_TRAZA.filter(function (c) { return !presentes[normalizeHeader_(c)]; });

  Logger.log('=== Fase 2b: columnas de traza ===');
  Logger.log('El destino tiene %s columnas. De las %s de traza, faltan %s.',
             nCols, COLUMNAS_TRAZA.length, faltan.length);

  if (!faltan.length) {
    Logger.log('>>> Nada que hacer: las %s ya están.', COLUMNAS_TRAZA.length);
    return { agregadas: 0 };
  }

  sh.getRange(1, nCols + 1, 1, faltan.length).setValues([faltan]);
  SpreadsheetApp.flush();

  Logger.log('>>> Agregadas al final, a partir de la columna %s: %s', nCols + 1, faltan.join(', '));
  Logger.log('No se movió ninguna celda existente: sólo encabezados en columnas libres.');
  Logger.log('El estampado de los uuids NO lo hace esta función — lo hace la primera corrida');
  Logger.log('del upsert con DRY_RUN = false, que es el único lugar que decide qué matchea.');
  return { agregadas: faltan.length, columnas: faltan };
}

/** Comparación de estados sin acentos, sin mayúsculas y sin espacios de más. */
function normStatus_(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036F]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** ¿Es un estado que el pipeline conoce? Lo que no conoce, no lo toca. */
function statusConocido_(s) {
  const n = normStatus_(s);
  for (let i = 0; i < STATUS_CONOCIDOS.length; i++) {
    if (normStatus_(STATUS_CONOCIDOS[i]) === n) return true;
  }
  return false;
}
