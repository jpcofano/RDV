/**
 * 45_IdsCuentas.js — LOS IDS DE LOS ENCUENTROS (08/10): las columnas "ID cuentas" y "Fecha envío campañas" de la base,
 * desde la lista del equipo de campañas (RDV_SS_IDS, solapas "Agenda JM" y "Agenda funcionarios"). Configuración:
 * 00_Config.js ("Los IDs de los encuentros"). Estado y predicciones: docs/ESTADO.md, 0.z. CLAUDE.md, decisión 14.
 *
 * La lista se LEE, nunca se escribe. En la base, toda escritura pasa por la REGLA GENERAL (`setSiDelSistemaLote_`,
 * 05_Escritura.js): sólo celda vacía, COLOR_SISTEMA. No hace falta ninguna excepción nueva: un ID que ya está en la base
 * no se reescribe ni se corrige (si difiere, se lista). La traza de cada ID escrito va a REGISTRO_IDS (intermedia, se
 * acumula) y lo que no se cruzó, con el motivo, a IDS_SIN_CRUZAR (intermedia, se reescribe en cada corrida).
 *
 * --- La lista ---
 * El encabezado es la primera de las primeras IDS_FILAS_ENCABEZADO filas con ID, Funcionario y Fecha (arriba hay una
 * fila de grupos); cada columna, la MÁS A LA IZQUIERDA con alguno de sus nombres (hay otra "Fecha de envío" en otros
 * bloques). Las fechas se leen en el huso horario de LA LISTA. Un ID es un texto con algún dígito que no empieza con "#":
 * "#N/A", "-", "Pendiente" no son IDs (se cuentan; no se cruzan).
 *
 * --- El cruce (`cruzarIds_`: en memoria, sin tocar Sheets; lo prueban los tests) ---
 *   1. QUIÉN. La figura por los TOKENS de su nombre, sin tildes ("Hernan Lombardi" = "Hernán Lombardi":
 *      `figuraPorTokens_`); si una parte no se reconoce así, las variantes y los apellidos únicos (`figurasEnTexto_`), y
 *      los nombres que la base tiene sólo en "Conjunta con". En "Agenda funcionarios", una parte que no se reconoce frena
 *      el cruce (`funcionario_en_parte`); "Agenda JM" es sólo de Macri.
 *      - una figura va a sus filas: las de esa Figura, o una conjunta donde está (sólo el mismo día, y si no hay una fila
 *        propia);
 *      - una CONJUNTA ("A, B, C") va SÓLO a la fila de la conjunta: el mismo conjunto de figuras (Figura + "Conjunta con",
 *        con o sin los de "No participa", o una Figura que junta varias, "A - B");
 *      - "Seguridad en tu barrio" (sin figura) va a las filas de Seguridad ("Evento (mail)", EVENTO o el formulario que
 *        se le cruzó lo dicen: IDS_RE_SEGURIDAD_FILA) de ESA comuna: el lugar tiene que coincidir.
 *      - una fila "Reprogramada" no es candidata (IDS_STATUS_NO_CANDIDATA): es la fecha vieja de una reunión movida.
 *   2. DÓNDE. La regla de los tres niveles (`compararUbicacion_`: barrio con barrio; si no, comuna con comuna, con la
 *      subzona de la Comuna 1; si no, el eje del mail). Un DESACUERDO descarta la fila; un lugar que no se puede
 *      comparar no descarta (salvo en Seguridad), pero tampoco suma.
 *   3. CUÁNDO. La fecha de la lista es la PLANEADA (dato del usuario). Primero, las filas de ESA fecha. Si no hay
 *      ninguna, a ±IDS_DIAS_FECHA_DISTINTA días, SÓLO si es UNA sola fila posible (las que el lugar no descarta) y en ésa
 *      la figura es exacta y el lugar coincide (traza "fecha distinta"); y sólo cuando la fecha planeada ya pasó (antes,
 *      se espera la fila de ese día). Si las filas de ese día no tienen lugar comparable y a ±N hay una con el lugar
 *      exacto: ambiguo.
 *   4. Varias filas el mismo día: primero la de la figura exacta (no la conjunta donde está), después la del lugar que
 *      coincide, después el Tipo (sólo "Agenda JM") contra el EVENTO. Si siguen varias, o si el Tipo contradice lo que
 *      eligió el lugar: ambiguo.
 *   5. EL INVARIANTE: un ID en UNA fila y una fila con UN ID. Un ID repetido en la lista con datos (o cruces) distintos,
 *      no se escribe. Un ID que ya está en otra fila de la base, no se escribe. Una fila que ya tiene otro ID, no se toca.
 *      Dos IDs para la misma fila: gana el de la misma fecha sobre el de fecha distinta, y la figura exacta sobre la
 *      conjunta; si empatan, ninguno.
 *
 * --- Cuándo corre ---
 *   paso 55  medirIds()          SÓLO LECTURA (diagnostico/26_ids_cuentas.js): todo al log.
 *   paso 56  idsHistorial(true)  el historial EN SECO: no toca la base; escribe IDS_SIN_CRUZAR (intermedia).
 *   paso 57  idsHistorial(false) el historial, UNA vez: agrega las dos columnas si faltan y escribe en TODAS las filas.
 *   después  IDS_EN_LA_HORA = true: dentro de la corrida de la hora (después de la agenda), sólo filas activas.
 */

// ===================== Puntos de entrada =====================

/**
 * **El historial** (pasos 56 y 57): el cruce sobre TODAS las filas de la base (hasta las futuras que se cruzan,
 * `filaQueSeEscribe_`), con su propio bloqueo (una corrida por vez, como el upsert). `enSeco`: calcula, loguea y escribe
 * IDS_SIN_CRUZAR; no toca la base. En serio: agrega las dos columnas si faltan, escribe, registra.
 */
function idsHistorial(enSeco) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(ESPERA_BLOQUEO_MS)) {
    Logger.log('>>> Hay otra corrida (upsert o agenda) en curso: los IDs no hacen nada (LockService).');
    return null;
  }
  try {
    verificarHojaDestino_(ssDestino_());
    return _correrIds_(!!enSeco, true);
  } finally {
    lock.releaseLock();
  }
}

/** Dentro de la corrida de la hora (IDS_EN_LA_HORA), con el bloqueo del upsert: sólo filas activas. */
function idsEnLaHora_(enSeco) {
  return _correrIds_(!!enSeco, false);
}

function _correrIds_(enSeco, historial) {
  const t0 = Date.now();
  const corrida = historial ? 'historial (paso ' + (enSeco ? '56' : '57') + ')' : 'hora';
  Logger.log('=== IDs de los encuentros (%s) — %s ===', corrida, enSeco ? 'EN SECO: no toca la base' : 'ESCRIBE en la base');
  // Primero la base: las figuras que reconoce la lista salen de su columna Figura (leerDestino_ las deja en el cache).
  let dest = leerDestino_();
  const lista = leerListaIds_();
  _logListaIds_(lista);

  const col = agregarColumnasIds_(dest.sh, !enSeco && historial);
  if (col.faltan.length) {
    if (!enSeco && historial) {
      Logger.log('>>> Columnas agregadas al final de la base, a partir de %s: %s (sin formato heredado).', col.desde, col.faltan.join(', '));
      dest = leerDestino_();
    } else {
      Logger.log('>>> En la base faltan %s: %s', col.faltan.join(' y '), enSeco
        ? 'la corrida del historial (paso 57) las agrega al final, a partir de ' + col.desde + '.'
        : 'no se escribe nada hasta que las agregue la corrida del historial (paso 57).');
    }
  }
  const res = cruzarIds_(lista.registros, dest, { historial: historial });
  // Una columna que ya estaba y tiene FÓRMULAS (de quien la creó) no se escribe: pisaría su resultado vacío.
  res.formulas = formulasEnColumnasIds_(dest.sh, res.cols);
  _sacarColumnasConFormulaIds_(res);
  logIds_(res);

  let w = null;
  if (!enSeco && res.cols[COLUMNA_ID_CUENTAS] != null) {
    w = escribirIdsBase_(dest.sh, dest.hdr, res);
    Logger.log('>>> Escritos en "%s": %s IDs y %s fechas de envío (%s celdas pedidas que ya no estaban vacías: no se tocaron).',
               RDV_HOJA_DESTINO, w.ids, w.fechas, w.saltadas);
    try { registrarIds_(res, w.hechas, corrida); }
    catch (err) { Logger.log('>>> No se pudo escribir %s: %s (lo escrito en la base queda igual).', RDV_HOJA_REGISTRO_IDS, err); }
  } else if (enSeco) {
    Logger.log('>>> EN SECO: no se escribió nada en la base. Escribiría %s IDs y %s fechas de envío.', res.conteo.escribeId, res.conteo.escribeFecha);
  }
  try { escribirSinCruzarIds_(res, corrida); }
  catch (err) { Logger.log('>>> No se pudo escribir %s: %s', IDS_SOLAPA_SIN_CRUZAR, err); }

  res.ms = Date.now() - t0;
  res.resumen = (w ? 'escritos ' + w.ids + ' (fechas ' + w.fechas + ')' : 'escribiría ' + res.conteo.escribeId + ' (fechas ' + res.conteo.escribeFecha + ')') +
                ' | ya estaban ' + res.conteo.yaEstaba + ' | sin cruzar ' + res.sinCruzar.length;
  Logger.log('IDs de los encuentros: %s (%s ms)', res.resumen, res.ms);
  return res;
}

/**
 * ¿Las columnas de los IDs (si ya estaban en la base) tienen fórmulas? Cuántas celdas con fórmula tiene cada una, DESDE EL
 * ENCABEZADO (una fórmula de array como las once derivadas vive en la fila 1: escribir debajo la rompería). Sólo lee. Una
 * columna con fórmulas no se escribe: pisaría el resultado vacío de una fórmula.
 */
function formulasEnColumnasIds_(sh, cols) {
  const out = {};
  const n = sh.getLastRow();
  COLUMNAS_IDS.forEach(function (nombre) {
    const c = cols[nombre];
    out[nombre] = (c == null || n < 1) ? 0
      : sh.getRange(1, c + 1, n, 1).getFormulas().filter(function (fila) { return !!fila[0]; }).length;
  });
  return out;
}

/** Saca de las escrituras las columnas que tienen fórmulas, y lo dice. */
function _sacarColumnasConFormulaIds_(res) {
  const campos = {};
  campos[COLUMNA_ID_CUENTAS] = 'id';
  campos[COLUMNA_FECHA_ENVIO] = 'envio';
  Object.keys(res.formulas || {}).forEach(function (n) {
    const k = res.formulas[n];
    if (!k) return;
    const antes = res.escrituras.length;
    res.escrituras = res.escrituras.filter(function (e) { return e.campo !== campos[n]; });
    Logger.log('>>> "%s" tiene %s celdas con FÓRMULA: no se escribe esa columna (%s escrituras sacadas). Si las fórmulas no van, ' +
               'que el equipo las borre.', n, k, antes - res.escrituras.length);
  });
}

// ===================== La lista =====================

/**
 * Lee las dos solapas de la lista. Una solapa que no se puede leer (no existe, sin encabezado) no frena a la otra: el log
 * lo dice. Si el archivo no se puede abrir, error (la cuenta que corre el script tiene que poder leerlo). Las fechas se
 * leen en el huso horario de LA LISTA (`getSpreadsheetTimeZone`): si es otro que el del script, un 01/10 a la medianoche
 * en GMT sería el 30/09 acá.
 */
function leerListaIds_() {
  let ss;
  try { ss = SpreadsheetApp.openById(RDV_SS_IDS); }
  catch (err) {
    throw new Error('No se pudo abrir la lista de IDs (' + RDV_SS_IDS + '): ' + (err && err.message || err) +
                    '. La cuenta que corre el script tiene que poder LEERLA (compartírsela como lectora).');
  }
  let tz = RDV_TZ;
  try { if (ss.getSpreadsheetTimeZone) tz = ss.getSpreadsheetTimeZone() || RDV_TZ; } catch (err) { /* el del script */ }
  const out = { archivo: ss.getName ? ss.getName() : RDV_SS_IDS, tz: tz, solapas: [], registros: [] };
  [IDS_SOLAPA_JM, IDS_SOLAPA_FUNCIONARIOS].forEach(function (nombre) {
    const sh = ss.getSheetByName(nombre);
    let s;
    if (!sh) s = _solapaVaciaIds_(nombre, 'no existe la solapa "' + nombre + '"');
    else {
      const n = sh.getLastRow(), m = sh.getLastColumn();
      s = (n && m) ? armarListaIds_(nombre, sh.getRange(1, 1, n, m).getValues(), { tz: tz })
                   : _solapaVaciaIds_(nombre, 'la solapa está vacía');
    }
    out.solapas.push(s);
    s.registros.forEach(function (r) { out.registros.push(r); });
  });
  return out;
}

function _solapaVaciaIds_(nombre, error) {
  return { solapa: nombre, filaEncabezado: null, columnas: {}, repetidas: {}, registros: [], sinId: 0, idNoValido: [], error: error };
}

/**
 * Una solapa de la lista, ya leída (`bloque` = getValues de toda la solapa), en registros. Pura: la prueban los tests.
 * `opciones.tz`: el huso horario de la lista (para leer sus fechas).
 *
 * El encabezado es la primera de las primeras IDS_FILAS_ENCABEZADO filas que tiene ID, Funcionario y Fecha. Cada campo, la
 * columna MÁS A LA IZQUIERDA con alguno de sus nombres (IDS_COLUMNAS_LISTA); si hay más de una, el log lo dice. Una fila
 * sin ID no es un registro (si tiene Funcionario o Fecha, se cuenta: `sinId`); un ID que no es un ID ("#N/A", "-",
 * "Pendiente": `esIdValidoIds_`), tampoco (`idNoValido`, con la fila).
 */
function armarListaIds_(solapa, bloque, opciones) {
  const tz = (opciones && opciones.tz) || RDV_TZ;
  const out = _solapaVaciaIds_(solapa, '');
  const h = _filaEncabezadoIds_(bloque);
  if (h < 0) {
    out.error = 'no se encontró el encabezado (ID, Funcionario y Fecha) en las primeras ' + IDS_FILAS_ENCABEZADO + ' filas';
    return out;
  }
  const hdr = bloque[h];
  out.filaEncabezado = h + 1;
  Object.keys(IDS_COLUMNAS_LISTA).forEach(function (k) {
    const todas = _columnasConNombreIds_(hdr, IDS_COLUMNAS_LISTA[k]);
    out.columnas[k] = todas.length ? todas[0] : null;
    if (todas.length > 1) out.repetidas[k] = todas;
  });
  const deLaSolapaJM = normalizeHeader_(solapa) === normalizeHeader_(IDS_SOLAPA_JM);
  const conTipo = deLaSolapaJM && out.columnas.tipo != null;   // el Tipo, sólo en "Agenda JM" (regla del usuario)
  for (let i = h + 1; i < bloque.length; i++) {
    const fila = bloque[i];
    const val = function (k) { const c = out.columnas[k]; return c == null ? '' : fila[c]; };
    const idTexto = str(val('id')).replace(/\s+/g, ' ');
    if (!idTexto) {
      if (!esVacio_(val('funcionario')) || !esVacio_(val('fecha'))) out.sinId++;
      continue;
    }
    if (!esIdValidoIds_(idTexto)) { out.idNoValido.push({ filaLista: i + 1, texto: idTexto }); continue; }
    const fecha = fechaDeListaIds_(val('fecha'), tz);
    const r = {
      solapa: solapa, filaLista: i + 1, id: normIdIds_(idTexto), idTexto: idTexto,
      funcionario: str(val('funcionario')), lugarTexto: textoCeldaIds_(val('lugar'), tz), tipoTexto: conTipo ? str(val('tipo')) : '',
      fecha: fecha, fechaTexto: textoCeldaIds_(val('fecha'), tz), envioTexto: textoCeldaIds_(val('envio'), tz)
    };
    r.envio = envioDeListaIds_(val('envio'), fecha, tz);
    r.quien = quienDeFuncionarioIds_(r.funcionario);
    // "Agenda JM" es SÓLO de Macri (dato del usuario): si el Funcionario no nombra a nadie reconocible —o dice "Seguridad
    // en tu barrio"— es él; y lo que no se reconoce del Funcionario no frena el cruce.
    if (deLaSolapaJM) {
      if (r.quien.seguridad || !r.quien.norm.length) {
        const jm = quienDeFuncionarioIds_(IDS_FIGURA_SOLAPA_JM);
        if (jm.norm.length) {
          jm.porSolapa = true; jm.texto = r.funcionario; jm.noReconocidas = r.quien.noReconocidas;
          r.quien = jm;
        }
      }
      r.quien.ignorarResto = true;
    }
    r.lugar = lugarDeListaIds_(r.lugarTexto);
    r.tipo = conTipo ? tipoEncuentroIds_(r.tipoTexto) : '';
    out.registros.push(r);
  }
  return out;
}

/** El índice (0-based) de la fila de encabezado, o -1. */
function _filaEncabezadoIds_(bloque) {
  const n = Math.min(bloque.length, IDS_FILAS_ENCABEZADO);
  for (let i = 0; i < n; i++) {
    const h = bloque[i];
    if (_columnasConNombreIds_(h, IDS_COLUMNAS_LISTA.id).length && _columnasConNombreIds_(h, IDS_COLUMNAS_LISTA.funcionario).length &&
        _columnasConNombreIds_(h, IDS_COLUMNAS_LISTA.fecha).length) return i;
  }
  return -1;
}

/** Las columnas (0-based, de izquierda a derecha) cuyo encabezado normalizado es alguno de `nombres`. */
function _columnasConNombreIds_(hdr, nombres) {
  const buscados = nombres.map(normalizeHeader_);
  const out = [];
  for (let j = 0; j < hdr.length; j++) if (buscados.indexOf(normalizeHeader_(hdr[j])) >= 0) out.push(j);
  return out;
}

/** Un ID para comparar: sin espacios en los bordes, en mayúsculas ("3735-sepjdgag" = "3735-SEPJDGAG"). */
function normIdIds_(v) {
  return str(v).replace(/\s+/g, ' ').toUpperCase();
}

/**
 * ¿Es un ID? Un texto con algún dígito que no empieza con "#" y no es sólo ceros: "#N/A", "#REF!", "-", "N/A",
 * "Pendiente" y un 0 (el "sin ID" de una fórmula) no lo son.
 */
function esIdValidoIds_(texto) {
  const t = str(texto);
  return !!t && !/^#/.test(t) && /\d/.test(t) && !/^0+(?:[.,]0+)?$/.test(t);
}

/** La fecha de una celda de la lista, en `tz` (el huso de la lista), como dd/MM/yyyy; lo demás, como texto. */
function textoCeldaIds_(v, tz) {
  if (v instanceof Date) { const d = fechaDeListaIds_(v, tz); return d ? fmtFecha_(d) : String(v); }
  return str(v);
}

/**
 * La fecha de una celda de la lista: una fecha (leída en `tz`, el huso de LA LISTA), un texto dd/MM/aa(aa) —con o sin una
 * hora después— o un número de serie de Sheets.
 */
function fechaDeListaIds_(v, tz) {
  if (typeof v === 'number' && v > 30000 && v < 80000) {
    const d = new Date(1899, 11, 30 + Math.floor(v), 12, 0, 0);
    return alMediodia_(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  if (v instanceof Date && tz && tz !== RDV_TZ) {
    if (isNaN(v.getTime())) return null;
    const p = Utilities.formatDate(v, tz, 'yyyy-MM-dd').split('-');
    return alMediodia_(Number(p[0]), Number(p[1]), Number(p[2]));
  }
  if (typeof v === 'string') {
    const m = /^\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:hs?\.?)?\s*$/i.exec(v);
    if (m) return toDate_(m[1]);
  }
  return toDate_(v);
}

/**
 * "Fecha de envío" → `{ fecha, estado, leida }`. Estados: 'ok'; 'vacia'; 'error' ("#N/A" y los demás errores de Sheets);
 * 'guion' ("-"); 'invalida' (no es una fecha); 'anio' (una fecha cuyo AÑO no cierra con la fecha del encuentro: no se
 * escribe y se lista; `leida` es lo que decía). Sólo 'ok' se escribe.
 */
function envioDeListaIds_(v, fechaEncuentro, tz) {
  if (!(v instanceof Date)) {
    const t = str(v);
    if (!t) return { fecha: null, estado: 'vacia' };
    if (/^#/.test(t)) return { fecha: null, estado: 'error' };
    if (/^[-–—\s]+$/.test(t)) return { fecha: null, estado: 'guion' };
  }
  const d = fechaDeListaIds_(v, tz);
  if (!d) return { fecha: null, estado: 'invalida' };
  if (fechaEncuentro && !anioCierraIds_(d, fechaEncuentro)) return { fecha: null, estado: 'anio', leida: d };
  return { fecha: d, estado: 'ok' };
}

/** ¿El año de la fecha de envío cierra con el del encuentro? El mismo año, o diciembre del anterior para uno de enero. */
function anioCierraIds_(envio, encuentro) {
  const ae = envio.getFullYear(), ar = encuentro.getFullYear();
  if (ae === ar) return true;
  return ae === ar - 1 && envio.getMonth() === 11 && encuentro.getMonth() === 0;
}

/** Los separadores de un Funcionario con varias figuras: coma, punto y coma, barra, guion, "+", "&", " y ", " e ". */
const IDS_SEPARADORES_FUNCIONARIO_ = /\s*(?:[,;\/+&]|-|\s+y\s+|\s+e\s+)\s*/i;

/**
 * QUIÉN dice el Funcionario de la lista → `{ figuras, norm, seguridad, noReconocidas, texto }`.
 *   - "Seguridad en tu barrio" → `seguridad`, sin figura;
 *   - si no, las figuras de la base (la columna Figura) que nombra: primero por los TOKENS de su nombre sobre el texto
 *     entero (`figuraPorTokens_`: sin tildes, sin importar el orden); cada parte (separada por coma, " y ", "/", "-"…)
 *     que no explique una de ésas, por sí sola (tokens) o por `figurasEnTexto_` (las variantes del legado y los
 *     apellidos únicos: "Lombardi"). Lo que no se reconoce queda en `noReconocidas` (el cruce lo vuelve a buscar entre
 *     los nombres de "Conjunta con": `_completarQuienIds_`).
 * `norm`: las figuras normalizadas, sin repetir, en el orden en que aparecen.
 */
function quienDeFuncionarioIds_(texto) {
  const t = str(texto), n = normalizeText_(t);
  const out = { figuras: [], norm: [], seguridad: false, noReconocidas: [], texto: t };
  if (!n) return out;
  if (/\bseguridad en tu barrio\b/.test(n)) { out.seguridad = true; return out; }
  const agregar = function (canon) {
    const k = normalizeText_(canon);
    if (k && out.norm.indexOf(k) < 0) { out.norm.push(k); out.figuras.push(canon); }
  };
  const todas = figuraPorTokens_(t).candidatas;
  const tokensDe = {};
  todas.forEach(function (c) { tokensDe[c] = _tokensNombre_(c); });
  t.split(IDS_SEPARADORES_FUNCIONARIO_).map(str).filter(Boolean).forEach(function (p) {
    const tp = _tokensNombre_(p);
    if (!tp.length) return;
    // ¿la explica una de las figuras del texto entero? (sus tokens adentro de los de la parte, o al revés: "Fernán" suelto)
    const porTodo = todas.filter(function (c) {
      const tc = tokensDe[c];
      return tc.every(function (x) { return tp.indexOf(x) >= 0; }) || tp.every(function (x) { return tc.indexOf(x) >= 0; });
    });
    if (porTodo.length === 1) { agregar(porTodo[0]); return; }
    const porParte = figuraPorTokens_(p).figura;
    if (porParte) { agregar(porParte); return; }
    const enTexto = figurasEnTexto_(p);
    if (enTexto.length) { enTexto.forEach(agregar); return; }
    // un lugar pegado al Funcionario ("Gabino Tapia - Retiro", "… - Comuna 1") no es una persona: no frena el cruce
    if (_esLugarSueltoIds_(p)) { (out.lugares = out.lugares || []).push(p); return; }
    out.noReconocidas.push(p);
  });
  return out;
}

/** ¿La parte es un lugar y nada más? Un barrio de Comunas (el nombre entero), una comuna ("Comuna 1", "C1N") o un eje. */
function _esLugarSueltoIds_(p) {
  const n = _expandirAbreviaturas_(normalizeText_(p));
  if (!n) return false;
  if (/^(c|comuna)\s*0?\d{1,2}\s*(n|s|norte|sur)?$/.test(n) || /^eje\s+\S+$/.test(n)) return true;
  return _listas_().barrios.some(function (b) { return b.norm === n; });
}

/**
 * DÓNDE dice el "Barrio / Comuna" de la lista → `{ u, reconocido, vacio, varios }` (`u`: una ubicación de la regla de los
 * tres niveles):
 *   - un texto que ES una comuna ("Comuna 13", "C1N", "Comuna 1 - Norte", "Comuna 1 Sur") o un eje ("Eje Norte");
 *   - si nombra DOS o más barrios ("Comuna 4 (Barracas y La Boca)", "Villa Urquiza / Coghlan"): la comuna (la que dice el
 *     texto, o la de esos barrios si es una sola); si son de comunas distintas, sin ubicación;
 *   - si nombra UN barrio de Comunas (también dentro de un texto: "Belgrano (Comuna 13)"): ese barrio;
 *   - si no, la comuna o el eje que nombre.
 * **Un texto que no se reconoce NO es un barrio**: queda sin ubicación (no evaluable), nunca en desacuerdo con la fila.
 */
function lugarDeListaIds_(texto) {
  const t = str(texto);
  const vacia = _ubicDeBarrio_('');
  if (!t || /^[-–—\s]+$/.test(t) || /^#/.test(t)) return { u: vacia, reconocido: false, vacio: true };
  const tl = t.replace(/[-–—(),.;:\/]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(c|comuna)\s*0?\d{1,2}\s*(n|s|norte|sur)?$/i.test(tl) || /^eje\s+\S+$/i.test(tl)) {
    const u = ubicacionDeTexto_(tl);
    return { u: u, reconocido: tieneUbicacion_(u), vacio: false };
  }
  const barrios = _barriosEnTextoIds_(t);
  const c = detectComuna_(tl);
  if (barrios.length >= 2) {
    const comunas = barrios.map(comunaDeBarrio_).filter(function (x, k, a) { return x != null && a.indexOf(x) === k; });
    const u = _ubicDeBarrio_('');
    u.comuna = c != null ? c : (comunas.length === 1 ? comunas[0] : null);
    u.deComuna = u.comuna == null ? '' : 'dicha';
    if (u.comuna === 1) {
      // la subzona que dice el texto o, si no, la de esos barrios si es una sola ("Retiro y San Nicolás": Norte)
      const zonas = barrios.map(function (b) { return subzonaDeBarrio_(b) || ''; }).filter(function (z, k, a) { return a.indexOf(z) === k; });
      u.subzona = detectSubzonaComuna1_(tl) || (zonas.length === 1 ? zonas[0] : '');
    }
    return { u: u, reconocido: u.comuna != null, vacio: false, varios: barrios };
  }
  if (barrios.length === 1) return { u: _ubicDeBarrio_(barrios[0]), reconocido: true, vacio: false };
  const canon = canonBarrioUbic_(t);   // la otra grafía de Monserrat que acepta la agenda
  if (canon) return { u: _ubicDeBarrio_(canon), reconocido: true, vacio: false };
  if (c != null) {
    const u = _ubicDeBarrio_('');
    u.comuna = c; u.deComuna = 'dicha';
    u.subzona = c === 1 ? (detectSubzonaComuna1_(tl) || '') : '';
    return { u: u, reconocido: true, vacio: false };
  }
  const e = detectEje_(tl);
  if (e && e.tipo === 'eje') {
    const u = _ubicDeBarrio_('');
    u.eje = e.eje;
    return { u: u, reconocido: true, vacio: false };
  }
  return { u: vacia, reconocido: false, vacio: false };
}

/** Los barrios de Comunas que nombra el texto (canónicos, sin repetir; uno contenido en otro nombrado no cuenta). */
function _barriosEnTextoIds_(texto) {
  const t = _expandirAbreviaturas_(normalizeText_(texto));
  if (!t) return [];
  const hallados = _listas_().barrios.filter(function (b) { return _contienePalabra_(t, b.norm); });
  return hallados.filter(function (b) {
    return !hallados.some(function (o) { return o !== b && o.norm.length > b.norm.length && _contienePalabra_(o.norm, b.norm); });
  }).map(function (b) { return b.canon; });
}

/** El tipo de encuentro de un texto (el Tipo de "Agenda JM", el EVENTO o el "Evento (mail)" de una fila): IDS_TIPOS, o ''. */
function tipoEncuentroIds_(texto) {
  const n = normalizeText_(texto);
  if (!n) return '';
  for (let i = 0; i < IDS_TIPOS.length; i++) if (IDS_TIPOS[i].re.test(n)) return IDS_TIPOS[i].tipo;
  return '';
}

// ===================== El cruce (sin Sheets) =====================

/** Las columnas de la base que usa el cruce: las dos de los IDs (por encabezado normalizado), "Evento (mail)" y "No participa". */
function columnasIdsEnBase_(hdr) {
  const out = {};
  COLUMNAS_IDS.forEach(function (n) { out[n] = findIdxOr_(hdr, IDS_ALIAS_COLUMNAS[n] || [n], true); });
  out.eventoMail = findIdxOr_(hdr, ['Evento (mail)'], true);
  out.noParticipa = findIdxOr_(hdr, [COLUMNA_NO_PARTICIPA], true);
  return out;
}

/** Las figuras de una fila, normalizadas: la Figura y "Conjunta con"; o cada una de una Figura que junta varias ("A - B"). */
function figurasDeFilaIds_(f) {
  const out = [];
  const add = function (s) { const k = normalizeText_(s); if (k && out.indexOf(k) < 0) out.push(k); };
  if (f.figurasConjunta && f.figurasConjunta.length) { f.figurasConjunta.forEach(add); return out; }
  const fig = str(f.figura);
  if (!fig) return out;
  if (!/[-,\/+&]| y /.test(normalizeText_(fig))) { add(fig); return out; }
  fig.split(/\s*(?:[-,;\/+&]|\s+y\s+)\s*/).map(str).filter(Boolean).forEach(function (p) { add(figuraPorTokens_(p).figura || p); });
  return out;
}

/** Cada fila de la base, con lo que mira el cruce. */
function filasParaIds_(dest, cols) {
  const iId = cols[COLUMNA_ID_CUENTAS], iEnv = cols[COLUMNA_FECHA_ENVIO], iEvM = cols.eventoMail, iNoP = cols.noParticipa;
  const iEv = dest.D ? dest.D['EVENTO'] : null, iSt = dest.D ? dest.D['STATUS REUNIÓN'] : null, iOrig = dest.T ? dest.T.origen : null;
  const noCandidata = IDS_STATUS_NO_CANDIDATA.map(normStatus_);
  return dest.filas.map(function (f) {
    const v = f.valores || [];
    const evento = iEv != null ? str(v[iEv]) : str(f.evento);
    const eventoMail = iEvM != null ? str(v[iEvM]) : '';
    const formOrigen = iOrig != null ? str(v[iOrig]) : str(f.formOrigen);
    const fig = figurasDeFilaIds_(f);
    // Los que "No participa" (la agenda los anota también en "Conjunta con"): el conjunto de los que sí participan.
    const noP = iNoP != null ? str(v[iNoP]).split(/\s*\/\s*/).map(normalizeText_).filter(Boolean) : [];
    const status = iSt != null ? normStatus_(v[iSt]) : '';
    return {
      f: f,
      fig: fig,
      figPart: noP.length ? fig.filter(function (k) { return noP.indexOf(k) < 0; }) : fig,
      seguridad: IDS_RE_SEGURIDAD_FILA.test(normalizeText_([evento, eventoMail, formOrigen].join(' | '))),
      tipo: tipoEncuentroIds_(evento) || tipoEncuentroIds_(eventoMail),
      status: status,
      noCandidata: noCandidata.indexOf(status) >= 0,
      ubic: ubicacionDeFila_(f),
      idActual: iId != null ? normIdIds_(v[iId]) : '',
      envioActual: iEnv != null ? v[iEnv] : ''
    };
  });
}

/**
 * **El cruce**: cada registro de la lista contra las filas de la base, y el invariante sobre todos. En memoria: no lee ni
 * escribe Sheets. `opciones.historial`: se escribe en todas las filas (paso 57); si no, sólo en las activas
 * (`filaQueSeEscribe_`, la corrida de la hora). El cálculo es el MISMO en los dos casos: cambia sólo dónde se escribe.
 *
 * Devuelve `{ items, cruces, sinCruzar, escrituras, cols, filas, conteo, porSolapa, filasConId }`:
 *   items       uno por registro: `{ r, ev, final }` (ev: lo que dio el registro solo; final: después del invariante)
 *   escrituras  `[{ fila, col, valor, campo: 'id' | 'envio', it }]` para `setSiDelSistemaLote_` (col 1-based)
 *   sinCruzar   las líneas de IDS_SIN_CRUZAR
 */
function cruzarIds_(registros, dest, opciones) {
  const o = opciones || {};
  const historial = !!o.historial;
  const escribeFila = o.escribeFila || function (f) { return filaQueSeEscribe_(f, historial); };
  const cols = o.cols || columnasIdsEnBase_(dest.hdr);
  const filas = filasParaIds_(dest, cols);
  const porFigura = new Map(), seguridad = [], porId = new Map(), porFila = {};
  filas.forEach(function (x) {
    porFila[x.f.fila] = x;
    x.fig.forEach(function (k) { if (!porFigura.has(k)) porFigura.set(k, []); porFigura.get(k).push(x); });
    if (x.seguridad) seguridad.push(x);
    if (x.idActual) { if (!porId.has(x.idActual)) porId.set(x.idActual, []); porId.get(x.idActual).push(x.f.fila); }
  });
  // Una figura que en la base aparece SÓLO en "Conjunta con" (nunca como Figura de una fila) no está en la lista de figuras
  // del parser: las partes del Funcionario que no se reconocieron se buscan también entre esos nombres.
  const nombresBase = Array.from(porFigura.keys());
  registros.forEach(function (r) { _completarQuienIds_(r, nombresBase); });
  const items = registros.map(function (r) { return { r: r, ev: evaluarRegistroIds_(r, { porFigura: porFigura, seguridad: seguridad }) }; });
  return _resolverIds_(items, { porId: porId, porFila: porFila, filas: filas, cols: cols, escribeFila: escribeFila, historial: historial });
}

/**
 * Las partes del Funcionario que no se reconocieron, contra los nombres de las filas de la base (normalizados; también los
 * de "Conjunta con"): una parte que tiene TODOS los tokens de UN solo nombre es ese nombre; un apellido solo ("Tapia",
 * "Piragine"), si es el ÚLTIMO token de UN solo nombre y ningún otro lo lleva (como FIGURA_POR_APELLIDO). Sólo agrega;
 * idempotente.
 */
function _completarQuienIds_(r, nombresBase) {
  const q = r.quien;
  if (q.seguridad || !q.noReconocidas.length) return;
  const quedan = [];
  q.noReconocidas.forEach(function (p) {
    const tp = _tokensNombre_(p);
    let m = nombresBase.filter(function (n) {
      const tn = _tokensNombre_(n);
      return tn.length > 0 && tn.every(function (x) { return tp.indexOf(x) >= 0; });
    });
    if (!m.length && FIGURA_POR_APELLIDO && tp.length === 1 && tp[0].length >= MIN_LARGO_APELLIDO) {
      const con = nombresBase.filter(function (n) { return _tokensNombre_(n).indexOf(tp[0]) >= 0; });
      const tn = con.length === 1 ? _tokensNombre_(con[0]) : [];
      if (tn.length > 1 && tn[tn.length - 1] === tp[0]) m = con;
    }
    if (m.length === 1) {
      if (q.norm.indexOf(m[0]) < 0) { q.norm.push(m[0]); q.figuras.push(p); }
    } else quedan.push(p);
  });
  q.noReconocidas = quedan;
}

/**
 * ¿Es esta fila de este registro, por QUIÉN? 'exacta' (la misma figura sola; el mismo conjunto de una conjunta —con o sin
 * los que no participan—; Seguridad con Seguridad), 'parcial' (una figura sola contra una conjunta donde está) o '' (no).
 */
function identidadIds_(r, x) {
  if (r.quien.seguridad) return x.seguridad ? 'exacta' : '';
  const E = r.quien.norm;
  if (!E.length || !x.fig.length) return '';
  if (mismoConjunto_(E, x.fig)) return 'exacta';
  if (x.figPart.length && x.figPart.length !== x.fig.length && mismoConjunto_(E, x.figPart)) return 'exacta';
  // una figura sola contra una conjunta donde PARTICIPA (los de "No participa" no se llevan la fila)
  if (E.length === 1 && x.figPart.length > 1 && x.figPart.indexOf(E[0]) >= 0) return 'parcial';
  return '';
}

/** Días de contexto para mostrar candidatas en IDS_SIN_CRUZAR (no deciden nada). */
const IDS_DIAS_CONTEXTO_ = 7;

/**
 * Un registro solo, contra las filas (antes del invariante) → `{ estado, nivel, e, desempate, motivo, detalle, cands }`.
 * estado: 'cruza' (nivel 'misma_fecha' | 'fecha_distinta') | 'ambiguo' | 'sin_fila' | 'sin_fecha' | 'no_reconocido'.
 */
function evaluarRegistroIds_(r, idx) {
  if (!r.fecha) return { estado: 'sin_fecha', motivo: 'sin_fecha', detalle: 'la Fecha de la lista no es una fecha ("' + r.fechaTexto + '")', cands: [] };
  const hoy = hoyMediodia_();
  const lejos = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + IDS_DIAS_FECHA_LISTA_MAX, 12, 0, 0);
  if (ymd_(r.fecha) < IDS_FECHA_LISTA_MIN.replace(/-/g, '') || ymd_(r.fecha) > ymd_(lejos)) {
    return { estado: 'sin_fecha', motivo: 'fecha_imposible', detalle: 'la Fecha de la lista dice ' + fmtFecha_(r.fecha) + ': ¿el año está mal escrito?', cands: [] };
  }
  if (!r.quien.seguridad && !r.quien.norm.length) {
    return { estado: 'no_reconocido', motivo: 'funcionario_no_reconocido', detalle: 'ninguna figura de la base en "' + r.funcionario + '"', cands: [] };
  }
  const base = [], reprogramadas = [];
  const vistas = {};
  const agregar = function (x) {
    if (vistas[x.f.fila]) return;
    vistas[x.f.fila] = true;
    (x.noCandidata ? reprogramadas : base).push(x);
  };
  if (r.quien.seguridad) idx.seguridad.forEach(agregar);
  else r.quien.norm.forEach(function (k) { (idx.porFigura.get(k) || []).forEach(agregar); });

  const N = IDS_DIAS_FECHA_DISTINTA;
  const aEval = function (x) {
    if (!x.f.fecha) return null;
    const ident = identidadIds_(r, x);
    if (!ident) return null;
    const dias = diasEntre_(x.f.fecha, r.fecha);
    if (Math.abs(dias) > IDS_DIAS_CONTEXTO_) return null;
    return { x: x, ident: ident, dias: dias, lug: compararUbicacion_(r.lugar.u, x.ubic) };
  };
  const evs = base.map(aEval).filter(Boolean);
  const reprog = reprogramadas.map(aEval).filter(Boolean);

  // Una parte del Funcionario que no se reconoce ("Gabino Tapia, Fulano de Tal") puede ser una conjunta que no vemos:
  // no se cruza ("Agenda JM", sólo Macri, no la mira).
  if (r.quien.noReconocidas.length && !r.quien.ignorarResto) {
    return { estado: 'no_reconocido', motivo: 'funcionario_en_parte',
             detalle: 'no se reconoce "' + r.quien.noReconocidas.join('", "') + '" (sí: ' + r.quien.figuras.join(', ') + ')',
             cands: evs.filter(function (e) { return Math.abs(e.dias) <= N; }) };
  }

  // 1) la fecha de la lista
  const mismas = evs.filter(function (e) { return e.dias === 0; });
  // Seguridad: "las filas de Seguridad de esa comuna y fecha": el lugar tiene que coincidir, no alcanza con no estar en desacuerdo.
  const mismasOk = mismas.filter(function (e) { return r.quien.seguridad ? e.lug.coincide === true : e.lug.coincide !== false; });
  const cerca = evs.filter(function (e) { return e.dias !== 0 && Math.abs(e.dias) <= N; });
  const fuertes = function (l) { return l.filter(function (e) { return e.lug.coincide === true && e.ident === 'exacta'; }); };
  if (mismasOk.length) {
    // Las del día no tienen lugar comparable y a ±N hay una con el lugar exacto: no se sabe cuál es (puede ser la del día
    // con el barrio todavía sin cargar, o un duplicado de la fecha vieja): ambiguo, hasta que el lugar se pueda comparar.
    const rivales = fuertes(cerca);
    if (rivales.length && mismasOk.every(function (e) { return e.lug.coincide === null; })) {
      return { estado: 'ambiguo', motivo: 'ambiguo', cands: mismasOk.concat(rivales),
               detalle: mismasOk.length + ' fila(s) el mismo día sin lugar comparable y ' + rivales.length + ' a ±' + N + ' días con el mismo lugar' };
    }
    const pasos = [];
    let c = mismasOk;
    c = _preferirIds_(c, function (e) { return e.ident === 'exacta'; }, pasos, 'figura');
    c = _preferirIds_(c, function (e) { return e.lug.coincide === true; }, pasos, 'lugar');
    if (r.tipo) c = _preferirIds_(c, function (e) { return e.x.tipo === r.tipo; }, pasos, 'tipo');
    if (c.length === 1) {
      // El Tipo contradice lo que eligió el lugar (y hay otra fila de ese día con el Tipo de la lista): no se decide solo.
      // (entre las filas que el lugar NO descartó: el Tipo desempata, no veta; y aunque la elegida no tenga un tipo reconocido)
      const e = c[0];
      if (r.tipo && e.x.tipo !== r.tipo && pasos.indexOf('tipo') < 0 &&
          mismasOk.some(function (o) { return o !== e && o.x.tipo === r.tipo; })) {
        return { estado: 'ambiguo', motivo: 'ambiguo', cands: mismasOk,
                 detalle: 'el lugar elige la fila ' + e.x.f.fila + ' (' + (e.x.tipo || 'sin tipo') + ') y el Tipo de la lista ("' + r.tipoTexto + '") otra' };
      }
      return { estado: 'cruza', nivel: 'misma_fecha', e: e, desempate: pasos, cands: mismas };
    }
    return { estado: 'ambiguo', motivo: 'ambiguo', detalle: c.length + ' filas el mismo día' + (pasos.length ? ' (después de desempatar por ' + pasos.join(', ') + ')' : ''), cands: c };
  }
  // 2) la fecha distinta: a ±N días, UNA sola fila posible (las que el lugar no descarta), y en ésa la figura es exacta y
  //    el lugar coincide. Sólo cuando la fecha planeada ya pasó: antes, se espera la fila de ese día.
  const posibles = cerca.filter(function (e) { return e.lug.coincide !== false; });
  const fuertesCerca = fuertes(posibles);
  if (fuertesCerca.length && ymd_(r.fecha) >= ymd_(hoy)) {
    return { estado: 'sin_fila', motivo: 'futura_sin_fila', cands: posibles,
             detalle: 'la fecha planeada (' + fmtFecha_(r.fecha) + ') todavía no pasó: se espera la fila de ese día' };
  }
  if (fuertesCerca.length === 1 && posibles.length === 1) {
    return { estado: 'cruza', nivel: 'fecha_distinta', e: fuertesCerca[0], desempate: [], cands: cerca };
  }
  if (fuertesCerca.length) {
    return { estado: 'ambiguo', motivo: 'ambiguo', detalle: posibles.length + ' filas posibles a ±' + N + ' días', cands: posibles };
  }
  // 3) ninguna
  if (mismas.length) {
    if (r.quien.seguridad && mismas.some(function (e) { return e.lug.coincide === null; })) {
      return { estado: 'sin_fila', motivo: 'seguridad_sin_lugar', cands: mismas,
               detalle: 'hay Seguridad ese día, pero el lugar no se puede comparar (Seguridad exige la misma comuna)' };
    }
    return { estado: 'sin_fila', motivo: 'lugar_distinto', cands: mismas,
             detalle: r.quien.seguridad ? 'hay Seguridad ese día, en otro lugar' : 'la misma figura y la misma fecha, en otro lugar' };
  }
  if (ymd_(r.fecha) > ymd_(hoy)) {
    return { estado: 'sin_fila', motivo: 'futura_sin_fila', detalle: 'reunión futura: todavía no hay fila', cands: evs };
  }
  if (posibles.some(function (e) { return e.lug.coincide === true && e.ident === 'parcial'; })) {
    return { estado: 'sin_fila', motivo: 'fecha_distinta_conjunta', cands: posibles,
             detalle: 'a ±' + N + ' días sólo una conjunta donde está: no alcanza para cruzar' };
  }
  if (posibles.some(function (e) { return e.lug.coincide === null; })) {
    return { estado: 'sin_fila', motivo: 'fecha_distinta_sin_lugar', cands: posibles,
             detalle: 'a ±' + N + ' días, pero el lugar no se puede comparar' + (r.lugar.reconocido ? ' (la fila no tiene barrio ni comuna)' : ' (la lista no dice un lugar que se reconozca)') };
  }
  const reprogDia = reprog.filter(function (e) { return e.dias === 0; });
  if (reprogDia.length) {
    const otroLugar = reprogDia.every(function (e) { return e.lug.coincide === false; });
    return { estado: 'sin_fila', motivo: 'fila_reprogramada', cands: reprogDia,
             detalle: 'la fila de ese día está Reprogramada' + (otroLugar ? ' (y en otro lugar)' : '') + ' y no hay otra a ±' + N +
                      ' días con el mismo lugar' };
  }
  if (r.quien.norm.length > 1) {
    // una conjunta sin su fila: las filas de esas figuras cerca, para que una persona vea por qué
    const ctx = [];
    r.quien.norm.forEach(function (k) {
      (idx.porFigura.get(k) || []).forEach(function (x) {
        if (!x.f.fecha || ctx.some(function (e) { return e.x === x; })) return;
        const d = diasEntre_(x.f.fecha, r.fecha);
        if (Math.abs(d) <= N) ctx.push({ x: x, ident: 'otra', dias: d, lug: compararUbicacion_(r.lugar.u, x.ubic) });
      });
    });
    return { estado: 'sin_fila', motivo: 'conjunta_sin_fila', cands: ctx,
             detalle: 'ninguna fila con esas ' + r.quien.norm.length + ' figuras juntas (Figura + "Conjunta con") a ±' + N + ' días' };
  }
  return { estado: 'sin_fila', motivo: 'sin_fila', cands: evs,
           detalle: cerca.length ? 'a ±' + N + ' días sólo en otro lugar' : 'ninguna fila a ±' + N + ' días' };
}

/** Si alguna cumple `pred` (y no todas), se queda con ésas y anota el paso; si no, la lista como estaba. */
function _preferirIds_(lista, pred, pasos, nombre) {
  if (lista.length <= 1) return lista;
  const s = lista.filter(pred);
  if (s.length && s.length < lista.length) { pasos.push(nombre); return s; }
  return lista;
}

/** El invariante sobre todos los registros, la escritura y los reportes. */
function _resolverIds_(items, c) {
  const res = { items: items, cruces: [], sinCruzar: [], escrituras: [], cols: c.cols, filas: c.filas, historial: c.historial,
                conteo: _conteoSolapaIds_(), porSolapa: {}, filasConId: {} };
  const fin = function (it, final) { if (!it.final) it.final = final; };

  // 0) el mismo ID más de una vez en la lista: si van a la MISMA fila (o tienen los mismos datos), vale uno —el de MEJOR
  //    cruce: misma fecha antes que fecha distinta, la figura exacta antes que la conjunta; a igual cruce, el primero—, con la
  //    fecha de envío que tengan (si dicen dos distintas, ninguna); si no, ninguno. No depende del orden de la lista.
  //    La fecha de envío que vale va en el ITEM (`it.envio`), no en el registro: la medición corre el cruce dos veces.
  const rangoCruce = function (it) {
    return it.ev.estado === 'cruza' ? (it.ev.nivel === 'misma_fecha' ? 2 : 0) + (it.ev.e.ident === 'exacta' ? 1 : 0) : -1;
  };
  const porIdLista = new Map();
  items.forEach(function (it) { if (!porIdLista.has(it.r.id)) porIdLista.set(it.r.id, []); porIdLista.get(it.r.id).push(it); });
  porIdLista.forEach(function (lista) {
    if (lista.length < 2) return;
    const firma = function (it) {
      if (it.ev.estado === 'cruza') return 'fila ' + it.ev.e.x.f.fila;
      return [it.r.quien.seguridad ? 'seguridad' : it.r.quien.norm.slice().sort().join('+'), it.r.fecha ? ymd_(it.r.fecha) : '',
              normalizeText_(it.r.lugarTexto)].join('|');
    };
    const iguales = lista.every(function (it) { return firma(it) === firma(lista[0]); });
    const queda = iguales ? lista.reduce(function (m, it) { return rangoCruce(it) > rangoCruce(m) ? it : m; }, lista[0]) : null;
    if (iguales) {
      const fechas = {};
      lista.forEach(function (it) { if (it.r.envio.estado === 'ok') fechas[ymd_(it.r.envio.fecha)] = it.r.envio; });
      const k = Object.keys(fechas);
      if (k.length === 1) queda.envio = fechas[k[0]];
      else if (k.length > 1) queda.envio = { fecha: null, estado: 'distintas', textos: lista.map(function (it) { return it.r.envioTexto; }) };
    }
    lista.forEach(function (it) {
      if (iguales && it === queda) return;
      fin(it, iguales
        ? { estado: 'repetido', motivo: 'repetido', detalle: 'el mismo ID, con los mismos datos, en ' + queda.r.solapa + ' fila ' + queda.r.filaLista }
        : { estado: 'no', motivo: 'id_repetido', detalle: 'el ID está ' + lista.length + ' veces en la lista con datos distintos (' +
            lista.map(function (x) { return x.r.solapa + ' fila ' + x.r.filaLista; }).join(', ') + ')' });
    });
  });
  // 1) el ID ya está en la base
  items.forEach(function (it) {
    if (it.final) return;
    const ya = c.porId.get(it.r.id);
    if (!ya) return;
    const fila = it.ev.estado === 'cruza' ? it.ev.e.x.f.fila : null;
    if (fila != null && ya.indexOf(fila) >= 0) fin(it, { estado: 'ya_estaba', fila: fila });
    else if (fila != null) fin(it, { estado: 'no', motivo: 'id_en_otra_fila', detalle: 'el ID ya está en la fila ' + ya.join(', ') + ' y el cruce da la fila ' + fila });
    else fin(it, { estado: 'ya_en_la_base', fila: ya[0], detalle: 'el ID ya está en la fila ' + ya.join(', ') });
  });
  // 2) la fila ya tiene OTRO ID: no se toca
  items.forEach(function (it) {
    if (it.final || it.ev.estado !== 'cruza') return;
    const x = it.ev.e.x;
    if (x.idActual && x.idActual !== it.r.id) fin(it, { estado: 'no', motivo: 'fila_con_otro_id', detalle: 'la fila ' + x.f.fila + ' ya tiene el ID ' + x.idActual });
  });
  // 3) dos IDs para la misma fila: gana la misma fecha sobre la fecha distinta, y la figura exacta sobre la conjunta donde
  //    está; si empatan, ninguno
  const rango = function (it) { return (it.ev.nivel === 'misma_fecha' ? 2 : 0) + (it.ev.e.ident === 'exacta' ? 1 : 0); };
  const porFila = new Map();
  items.forEach(function (it) {
    if (it.final || it.ev.estado !== 'cruza') return;
    const k = it.ev.e.x.f.fila;
    if (!porFila.has(k)) porFila.set(k, []);
    porFila.get(k).push(it);
  });
  porFila.forEach(function (lista, fila) {
    if (lista.length < 2) return;
    const ids = lista.map(function (it) { return it.r.id; }).join(', ');
    const max = Math.max.apply(null, lista.map(rango));
    const mejores = lista.filter(function (it) { return rango(it) === max; });
    if (mejores.length === 1) {
      lista.forEach(function (it) {
        if (it !== mejores[0]) fin(it, { estado: 'no', motivo: 'fila_tomada', detalle: 'la fila ' + fila + ' es del ID ' + mejores[0].r.id +
          ' (' + (mejores[0].ev.nivel === 'misma_fecha' ? 'la misma fecha' : 'fecha distinta') + (mejores[0].ev.e.ident === 'exacta' ? ', la figura exacta' : '') + ')' });
      });
    } else {
      lista.forEach(function (it) { fin(it, { estado: 'no', motivo: 'fila_disputada', detalle: lista.length + ' IDs para la fila ' + fila + ': ' + ids }); });
    }
  });
  // 4) lo que queda: lo que no cruzó, con su motivo; lo que cruzó, se escribe si la fila entra en esta corrida
  items.forEach(function (it) {
    if (it.final) return;
    if (it.ev.estado !== 'cruza') { fin(it, { estado: 'no', motivo: it.ev.motivo, detalle: it.ev.detalle }); return; }
    const x = it.ev.e.x;
    if (!c.escribeFila(x.f)) {
      fin(it, { estado: 'fuera', motivo: 'fila_fuera_de_esta_corrida', fila: x.f.fila,
                detalle: 'cruza con la fila ' + x.f.fila + (c.historial ? ' (futura: se escribe cuando entre en las activas)'
                                                                     : ' (cerrada: la escribe la corrida del historial, paso 57)') });
      return;
    }
    fin(it, { estado: 'escribe', fila: x.f.fila });
  });

  // las escrituras, los conteos y las líneas de IDS_SIN_CRUZAR (`filasConId`: las que tienen o van a tener un ID)
  const iId = c.cols[COLUMNA_ID_CUENTAS], iEnv = c.cols[COLUMNA_FECHA_ENVIO];
  c.filas.forEach(function (x) { if (x.idActual) res.filasConId[x.f.fila] = x.idActual; });
  items.forEach(function (it) {
    const r = it.r, f = it.final, env = it.envio || r.envio, s = res.porSolapa[r.solapa] = res.porSolapa[r.solapa] || _conteoSolapaIds_();
    s.registros++;
    if (it.ev.estado === 'cruza') s[it.ev.nivel === 'misma_fecha' ? 'mismaFecha' : 'fechaDistinta']++;
    else if (it.ev.estado === 'ambiguo') s.ambiguo++;
    else if (it.ev.estado === 'sin_fila') s[it.ev.motivo === 'futura_sin_fila' ? 'futuraSinFila' : 'sinFila']++;
    else if (it.ev.estado === 'no_reconocido') s.noReconocido++;
    else if (it.ev.estado === 'sin_fecha') s.sinFecha++;
    if (f.estado === 'repetido') s.repetido++;
    if (['id_repetido', 'id_en_otra_fila', 'fila_con_otro_id', 'fila_tomada', 'fila_disputada'].indexOf(f.motivo) >= 0) s.conflicto++;
    if (f.estado === 'ya_estaba') s.yaEstaba++;
    if (f.estado === 'ya_en_la_base') s.yaEnLaBase++;
    if (f.estado === 'fuera') s.fuera++;
    if (f.estado === 'ya_estaba' || f.estado === 'ya_en_la_base') res.filasConId[f.fila] = r.id;

    if (f.estado === 'escribe' || f.estado === 'ya_estaba') {
      // Se cuenta aunque la columna todavía no exista (el paso 55 y el 56 en seco dicen lo que escribiría el 57, que la
      // agrega); la escritura, sólo con la columna. Sólo en una fila que ESTA corrida escribe (la hora: las activas).
      const x = it.ev.e.x;
      res.cruces.push(it);
      if (f.estado === 'escribe') {
        s.escribeId++;
        res.filasConId[x.f.fila] = r.id;
        if (iId != null) res.escrituras.push({ fila: x.f.fila, col: iId + 1, valor: r.idTexto || r.id, campo: 'id', it: it });
      }
      if (env.estado === 'ok' && (iEnv == null || esVacio_(x.envioActual)) && c.escribeFila(x.f)) {
        s.escribeFecha++;
        if (iEnv != null) res.escrituras.push({ fila: x.f.fila, col: iEnv + 1, valor: env.fecha, campo: 'envio', it: it });
      }
    }
    const conFila = f.estado === 'escribe' || f.estado === 'ya_estaba' || f.estado === 'fuera';
    if ((env.estado === 'anio' || env.estado === 'distintas') && conFila) {
      s.envioDescartado++;
      res.sinCruzar.push(_lineaSinCruzarIds_(it, 'fecha_envio_descartada', (env.estado === 'anio'
        ? 'la Fecha de envío dice ' + fmtFecha_(env.leida) + ': el año no cierra con la fecha del encuentro (' + fmtFecha_(r.fecha) + ')'
        : 'el ID está repetido con fechas de envío distintas (' + env.textos.join(' / ') + ')') + '. El ID sí ' +
        (f.estado === 'ya_estaba' ? 'ya estaba' : f.estado === 'fuera' ? 'cruza' : 'se escribe') + ' (fila ' + f.fila + ').'));
    }
    if ((f.estado === 'no' || f.estado === 'fuera') && f.motivo !== 'futura_sin_fila') {
      res.sinCruzar.push(_lineaSinCruzarIds_(it, f.motivo, f.detalle));
    }
  });
  Object.keys(res.porSolapa).forEach(function (k) {
    const s = res.porSolapa[k];
    Object.keys(s).forEach(function (n) { res.conteo[n] += s[n]; });
  });
  res.sinCruzar.sort(function (a, b) {
    return (b.orden || 0) - (a.orden || 0) || String(a.linea[4]).localeCompare(String(b.linea[4]));
  });
  return res;
}

function _conteoSolapaIds_() {
  return { registros: 0, mismaFecha: 0, fechaDistinta: 0, ambiguo: 0, sinFila: 0, futuraSinFila: 0, conflicto: 0, noReconocido: 0,
           sinFecha: 0, repetido: 0, yaEstaba: 0, yaEnLaBase: 0, fuera: 0, escribeId: 0, escribeFecha: 0, envioDescartado: 0 };
}

/** Encabezado de IDS_SIN_CRUZAR. */
const IDS_ENCABEZADO_SIN_CRUZAR_ = ['motivo', 'detalle', 'solapa', 'fila lista', 'ID', 'Funcionario', 'Barrio / Comuna', 'Tipo',
  'Fecha (lista)', 'Fecha de envío', 'filas candidatas'];

function _lineaSinCruzarIds_(it, motivo, detalle) {
  const r = it.r;
  const cands = (it.ev.cands || []).slice(0, 4).map(_descCandidataIds_).join(' · ');
  return { orden: r.fecha ? Number(ymd_(r.fecha)) : 0,
           linea: [motivo, detalle || '', r.solapa, r.filaLista, r.idTexto || r.id, r.funcionario, r.lugarTexto, r.tipoTexto,
                   r.fecha ? fmtFecha_(r.fecha) : r.fechaTexto, r.envioTexto, cands] };
}

/** "fila 805 (Jorge Macri, 29/09/2026, Belgrano, −2 días)", con "otro lugar", "lugar no comparable", "conjunta"… */
function _descCandidataIds_(e) {
  const f = e.x.f;
  const lugar = e.lug.coincide === false ? ', otro lugar' : e.lug.coincide === null ? ', lugar no comparable' : '';
  const d = e.dias === 0 ? 'misma fecha' : (e.dias > 0 ? '+' : '−') + Math.abs(e.dias) + ' días';
  return 'fila ' + f.fila + ' (' + (f.figura || (e.x.seguridad ? 'Seguridad, sin figura' : 'sin figura')) + ', ' + fmtFecha_(f.fecha) + ', ' +
         (f.barrio || 'sin barrio') + ', ' + d + lugar + (e.ident === 'parcial' ? ', conjunta donde está' : '') +
         (e.x.noCandidata ? ', ' + (e.x.status || 'reprogramada') : '') + ')';
}

/** Cómo se cruzó, para la traza (REGISTRO_IDS) y el log: "fecha distinta (−2 días: la lista dice 01/10/2026)". */
function comoCruzoIds_(it) {
  const e = it.ev.e, r = it.r;
  let s = it.ev.nivel === 'misma_fecha' ? 'misma fecha'
        : 'fecha distinta (' + (e.dias > 0 ? '+' : '−') + Math.abs(e.dias) + ' días: la lista dice ' + fmtFecha_(r.fecha) + ')';
  if (r.quien.seguridad) s += ' · Seguridad';
  else if (r.quien.norm.length > 1) s += ' · conjunta';
  if (e.ident === 'parcial') s += ' · fila conjunta (una de sus figuras)';
  if (r.quien.porSolapa) s += ' · figura por la solapa';
  if (e.x.status === 'suspendida') s += ' · fila Suspendida';
  if (e.lug.nivel) s += ' · lugar: ' + e.lug.nivel;
  if (it.ev.desempate && it.ev.desempate.length) s += ' · desempate: ' + it.ev.desempate.join(', ');
  return s;
}

// ===================== Escritura, reportes y log =====================

/**
 * Escribe en la base lo que dio el cruce: la REGLA GENERAL (`setSiDelSistemaLote_`: lectura fresca, sólo celda vacía,
 * COLOR_SISTEMA) y, en las fechas de envío que se escribieron, el formato de fecha (sólo esas celdas).
 */
function escribirIdsBase_(sh, hdr, res) {
  if (!res.escrituras.length) return { hechas: [], ids: 0, fechas: 0, saltadas: 0 };
  const hechas = setSiDelSistemaLote_(sh, hdr, res.escrituras);
  const fechas = hechas.filter(function (e) { return e.campo === 'envio'; });
  if (fechas.length) formatoFechaEnvioIds_(sh, fechas);
  return { hechas: hechas, ids: hechas.filter(function (e) { return e.campo === 'id'; }).length, fechas: fechas.length,
           saltadas: res.escrituras.length - hechas.length };
}

const IDS_ENCABEZADO_REGISTRO_ = ['hora', 'corrida', 'solapa', 'fila lista', 'ID', 'fila', 'Figura', 'FECHA', 'Barrio',
  'Fecha (lista)', 'Barrio / Comuna (lista)', 'cómo', 'Fecha envío escrita'];

/**
 * La traza: una línea por fila donde se escribió algo (el ID, la fecha de envío o los dos). Se acumula en REGISTRO_IDS;
 * si la solapa no tiene filas para todas, se le agregan (no se pierde la traza al llegar al borde de la grilla).
 */
function registrarIds_(res, hechas, corrida) {
  if (!hechas.length) return 0;
  const porIt = new Map();
  hechas.forEach(function (e) {
    if (!porIt.has(e.it)) porIt.set(e.it, { id: false, envio: null });
    const x = porIt.get(e.it);
    if (e.campo === 'id') x.id = true; else x.envio = e.valor;
  });
  const ahora = new Date(), filas = [];
  porIt.forEach(function (x, it) {
    const f = it.ev.e.x.f, r = it.r;
    const id = r.idTexto || r.id;
    filas.push([ahora, corrida, r.solapa, r.filaLista,
                x.id ? id : (it.final.estado === 'ya_estaba' ? '(ya estaba) ' : '(no escrito: la columna tiene fórmulas) ') + id, f.fila, f.figura,
                f.fecha || '', f.barrio, r.fecha || '', r.lugarTexto, comoCruzoIds_(it), x.envio || '']);
  });
  const ss = ssIntermedia_();
  let sh = ss.getSheetByName(RDV_HOJA_REGISTRO_IDS);
  if (!sh) { sh = ss.insertSheet(RDV_HOJA_REGISTRO_IDS); sh.appendRow(IDS_ENCABEZADO_REGISTRO_); sh.setFrozenRows(1); }
  const desde = sh.getLastRow() + 1, hasta = desde + filas.length - 1;
  if (hasta > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), hasta - sh.getMaxRows());
  sh.getRange(desde, 1, filas.length, IDS_ENCABEZADO_REGISTRO_.length).setValues(filas);
  return filas.length;
}

/** IDS_SIN_CRUZAR (intermedia), reescrita entera: lo que no se cruzó, con el motivo, de la reunión más reciente a la más vieja. */
function escribirSinCruzarIds_(res, corrida) {
  const enc = IDS_ENCABEZADO_SIN_CRUZAR_.slice();
  enc[0] = 'motivo (' + corrida + ', ' + Utilities.formatDate(new Date(), RDV_TZ, 'dd/MM HH:mm') + ')';
  escribirReporte_(IDS_SOLAPA_SIN_CRUZAR, enc, res.sinCruzar.map(function (x) { return x.linea; }));
}

/** El log de la lista: dónde está el encabezado, qué columnas, cuántos IDs, el huso horario. */
function _logListaIds_(lista) {
  Logger.log('lista: "%s" (%s) | huso horario de la lista: %s%s', lista.archivo, RDV_SS_IDS, lista.tz,
             lista.tz !== RDV_TZ ? ' (distinto del script, ' + RDV_TZ + ': las fechas se leen en el de la lista)' : '');
  lista.solapas.forEach(function (s) {
    if (s.error) { Logger.log('  "%s": NO SE LEYÓ — %s', s.solapa, s.error); return; }
    const cols = Object.keys(IDS_COLUMNAS_LISTA).map(function (k) {
      return k + ' ' + (s.columnas[k] == null ? '—' : _letraIds_(s.columnas[k] + 1));
    }).join(', ');
    const fechas = s.registros.map(function (r) { return r.fecha; }).filter(Boolean).sort(function (a, b) { return a - b; });
    Logger.log('  "%s": encabezado en la fila %s (%s) | %s IDs | %s filas con Funcionario o Fecha y sin ID | %s que no son un ID | ' +
               'fechas %s', s.solapa, s.filaEncabezado, cols, s.registros.length, s.sinId, s.idNoValido.length,
               fechas.length ? 'de ' + fmtFecha_(fechas[0]) + ' a ' + fmtFecha_(fechas[fechas.length - 1]) : '—');
    Object.keys(s.repetidas || {}).forEach(function (k) {
      Logger.log('     OJO: "%s" está en más de una columna (%s): se usa la primera, %s.', k,
                 s.repetidas[k].map(function (j) { return _letraIds_(j + 1); }).join(', '), _letraIds_(s.repetidas[k][0] + 1));
    });
  });
}

/** La letra de una columna (1-based). */
function _letraIds_(n) { return _a1_(1, n).replace(/\d+$/, ''); }

/** El resumen del cruce: por solapa y en total. */
function logIds_(res) {
  const lin = function (nombre, s) {
    Logger.log('  %s: %s IDs | CRUZAN: misma fecha %s, fecha distinta (±%s) %s | ambiguos %s | sin fila %s (+ %s futuras, todavía ' +
               'sin fila) | conflictos del invariante %s | Funcionario no reconocido (o en parte) %s | sin fecha %s | repetidos iguales %s',
               nombre, s.registros, s.mismaFecha, IDS_DIAS_FECHA_DISTINTA, s.fechaDistinta, s.ambiguo, s.sinFila, s.futuraSinFila,
               s.conflicto, s.noReconocido, s.sinFecha, s.repetido);
    Logger.log('     → se escriben %s IDs y %s fechas de envío | ya estaban en su fila %s | ya en la base (sin cruce) %s | cruzan ' +
               'con una fila fuera de esta corrida %s | fecha de envío descartada %s',
               s.escribeId, s.escribeFecha, s.yaEstaba, s.yaEnLaBase, s.fuera, s.envioDescartado);
  };
  Logger.log('--- el cruce (%s) ---', res.historial ? 'TODAS las filas' : 'filas activas: ' + descActivas_());
  Object.keys(res.porSolapa).forEach(function (k) { lin('"' + k + '"', res.porSolapa[k]); });
  lin('TOTAL', res.conteo);
  const iId = res.cols[COLUMNA_ID_CUENTAS], iEnv = res.cols[COLUMNA_FECHA_ENVIO];
  Logger.log('  columnas en la base: "%s" %s | "%s" %s', COLUMNA_ID_CUENTAS, iId == null ? 'NO ESTÁ' : 'en ' + _letraIds_(iId + 1),
             COLUMNA_FECHA_ENVIO, iEnv == null ? 'NO ESTÁ' : 'en ' + _letraIds_(iEnv + 1));
  Logger.log('  IDS_SIN_CRUZAR: %s líneas', res.sinCruzar.length);
}
