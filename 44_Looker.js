/**
 * 44_Looker.js — el tablero de Looker Studio en el sistema (08/10, FASE 2 del script atado a la base;
 * docs/script-looker.md): la ID de RVD como derivada 12, y las solapas Datos_Unpivot y Aux_Maximos.
 *
 * Hasta el 08/10 las armaba un script atado al archivo de la base (otro proyecto: `unpivotEventos` y `buildAuxMaximos`),
 * que además escribía la ID de RVD con fechas de JavaScript. Acá se rehacen con la MISMA lógica —el mismo nombre de
 * solapa, los mismos encabezados en el mismo orden, las mismas filas en el mismo orden— salvo lo que aprobó el usuario
 * el 08/10 (el modo 'corregido', el de la corrida de la hora):
 *   1. la ID: la derivada 12 (`idsDerivados_`), "Figura - Barrio - dd/MM/yyyy" ("Figura - dd/MM/yyyy" sin barrio; vacía
 *      sin figura; "- HH:mm" a las que repiten), recalculada en cada corrida; las dos solapas la toman de ahí;
 *   2. "Sin identificar" de Género = Inscriptos − Masculinos − Femeninos (la del script atado repetía la de edad); si
 *      falta alguno de los tres o no da positivo, esa fila no se escribe;
 *   3. sin el reemplazo por "P. Varon" / "P. Mujer" (la población de la comuna) si faltaran Masculinos / Femeninos.
 * Queda igual (decisión del usuario): una Suspendida con asistentes cuenta como realizada; Inscriptos, Asistentes e ID de
 * Aux_Maximos siguen vacías; Realizada_Flag "1"; las categorías en 0 no tienen fila.
 *
 * El modo 'compatible' es el script atado tal cual (la ID de la planilla y, si falta, la que él armaba): sólo para las
 * pruebas A y B del paso 54, que tienen que dar idéntico.
 *
 * Diferencias de forma, no de resultado: los encabezados se buscan normalizados y se exigen sólo los que se usan; si
 * falta uno, la solapa no se reescribe (queda la anterior) y el log lo dice. La escritura es en bloque. Escriben sólo
 * sus dos solapas (reportes, como REVISAR_MATCH); la ID de RVD la escribe `recalcDerivadas_` (la derivada 12).
 */

const ENCABEZADO_UNPIVOT_ = ['ID', 'Figura', 'Barrio', 'EVENTO', 'Día de la semana', 'FECHA', 'HORA', 'STATUS REUNIÓN',
                             'CategoriaGrupo', 'Categoria', 'Valor', 'FechaCarga'];
const BASE_UNPIVOT_ = ['Figura', 'Barrio', 'EVENTO', 'Día de la semana', 'FECHA', 'HORA'];
const CANALES_UNPIVOT_ = [
  { label: 'Mail', aliases: ['Mail'] },
  { label: 'Call Center', aliases: ['Call Center'] },
  { label: 'RRSS', aliases: ['RRSS'] },
  { label: 'Difusión', aliases: ['Difusión', 'Difusion'] },
  { label: 'IVR', aliases: ['IVR'] }
];
const EDADES_UNPIVOT_ = [
  { label: '18-24', aliases: ['18-24', '18 a 24', '18 – 24', '18–24'] },
  { label: '25-39', aliases: ['25-39', '25 a 39', '25 – 39', '25–39'] },
  { label: '40-55', aliases: ['40-55', '40 a 55', '40 – 55', '40–55'] },
  { label: '56-65', aliases: ['56-65', '56 a 65', '56 – 65', '56–65'] },
  { label: '66+', aliases: ['66+', '66 +', '66 o más', '66 o mas', '66 y más', '66 y mas'] },
  { label: 'Sin identificar', aliases: ['Sin identificar', 'No informado', 'NS/NC'] }
];
const ENCABEZADO_AUX_MAXIMOS_ = ['Figura', 'Barrio', 'EVENTO', 'Día de la semana', 'FECHA', 'HORA', 'STATUS REUNIÓN',
                                 'Inscriptos', 'Asistentes', 'ID', 'Granularidad', 'Nivel', 'Clave', 'Max_Asistentes',
                                 'Tot_Asistentes', 'Tot_Inscriptos', 'Cant_Reuniones', 'Realizada_Flag'];
/** "Realizada", como el script atado (decisión del usuario: queda igual). */
const REALIZADAS_REGEX_LOOKER_ = [/realiz/i, /hech/i, /concret/i, /ejecut/i, /\bok\b/i, /cerrad/i];
const MIN_ASIST_REALIZADA_LOOKER_ = 1;

/** Como el `norm` del script atado: minúsculas, sin tildes, espacios simples. */
function _normLooker_(s) {
  return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim();
}

// ===================== La ID (derivada 12) =====================

/**
 * **La ID de cada fila** (la derivada 12): "Figura - Barrio - dd/MM/yyyy" (sin barrio, "Figura - dd/MM/yyyy"; vacía sin
 * figura). A las que repiten se les agrega "- HH:mm"; si todavía repiten (la misma hora, o sin hora), " (2)", " (3)" por
 * orden de fila. `data`: la solapa entera (encabezado en [0]); devuelve un arreglo alineado con `data` ([0] = '').
 */
function idsDerivados_(data) {
  const hdr = data[0];
  const ix = function (n) { return findIdxOr_(hdr, aliasColumna_(n), true); };
  const iFig = ix('Figura'), iBar = ix('Barrio'), iFec = ix('FECHA'), iHora = ix('HORA');
  const v = function (r, k) { return k == null ? '' : r[k]; };
  const ids = [''], horas = [''];
  for (let i = 1; i < data.length; i++) {
    ids.push(idBaseDeFila_(v(data[i], iFig), v(data[i], iBar), v(data[i], iFec)));
    horas.push(horaHHmm_(v(data[i], iHora)));
  }
  return desempatarIds_(ids, horas);
}

/** "Figura - Barrio - dd/MM/yyyy" (como el `buildIdFinal_` del legado); vacía sin figura. */
function idBaseDeFila_(figura, barrio, fecha) {
  const fig = str(figura);
  if (!fig) return '';
  let d = null;
  if (fecha instanceof Date) d = fecha;
  else if (typeof fecha === 'number') d = new Date(Math.round((fecha - 25569) * 86400000) + 12 * 3600000);   // serie de Sheets
  else if (str(fecha)) d = toDate_(fecha);
  const dTxt = d && !isNaN(d.getTime()) ? Utilities.formatDate(d, RDV_TZ, 'dd/MM/yyyy') : str(fecha);
  return [fig, str(barrio), dTxt].filter(Boolean).join(' - ');
}

/** "- HH:mm" a las que repiten; si todavía repiten, " (2)", " (3)" por orden de fila. */
function desempatarIds_(ids, horas) {
  const out = ids.slice(), grupos = new Map();
  ids.forEach(function (id, i) { if (!id) return; if (!grupos.has(id)) grupos.set(id, []); grupos.get(id).push(i); });
  grupos.forEach(function (filas, id) {
    if (filas.length < 2) return;
    filas.forEach(function (i) { out[i] = id + (horas[i] ? ' - ' + horas[i] : ''); });
    const vistos = new Map();
    filas.forEach(function (i) {
      const n = (vistos.get(out[i]) || 0) + 1;
      vistos.set(out[i], n);
      if (n > 1) out[i] = out[i] + ' (' + n + ')';
    });
  });
  return out;
}

/** La hora como "HH:mm" (como el `normHora` del script atado): Date, fracción del día o texto ("19", "19:00", "19:00:00"). */
function horaHHmm_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, RDV_TZ, 'HH:mm');
  if (typeof v === 'number') {
    const mins = Math.round(v * 1440);
    return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
  }
  const s = v == null ? '' : String(v).trim();
  const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?/);
  if (m) return m[1].padStart(2, '0') + ':' + (m[2] == null ? '00' : m[2]).padStart(2, '0');
  return '';
}

// ===================== Datos_Unpivot =====================

/**
 * **Datos_Unpivot**, en memoria: una fila por reunión y categoría con valor (Canal: los cinco; Género: Masculinos,
 * Femeninos, Sin identificar; Rango Etario: las cinco franjas y Sin identificar), en el orden de RVD.
 *
 * `data`: RVD entera (encabezado en [0]), como la lee el script atado. `opciones`: `{ modo: 'compatible' | 'corregido',
 * ids (corregido: los de `idsDerivados_`), fechaCarga }`. Devuelve `{ encabezado, filas, origen (la fila de `data` de cada
 * fila), saltadas, idsGenerados (compatible: los que el script atado armaba), avisos }`, o `{ error }` si falta una
 * columna de las de base.
 */
function armarDatosUnpivot_(data, opciones) {
  opciones = opciones || {};
  const corregido = opciones.modo !== 'compatible';
  const header = data[0].map(function (h) { return String(h == null ? '' : h).trim(); });
  const hnorm = header.map(_normLooker_);
  const findIdx = function (aliases) {
    for (let a = 0; a < aliases.length; a++) {
      const i = hnorm.indexOf(_normLooker_(aliases[a]));
      if (i !== -1) return i;
    }
    return -1;
  };
  const baseIdx = BASE_UNPIVOT_.map(function (n) { return findIdx([n]); });
  const faltan = BASE_UNPIVOT_.filter(function (n, j) { return baseIdx[j] === -1; });
  if (faltan.length) return { error: 'faltan columnas de base: ' + faltan.join(', ') };
  const iStatus = findIdx(['STATUS REUNIÓN', 'STATUS REUNION']);
  const iId = header.indexOf('ID');
  const conIdx = function (c) { return { label: c.label, idx: findIdx(c.aliases) }; };
  const encontrado = function (c) { return c.idx !== -1; };
  const canales = CANALES_UNPIVOT_.map(conIdx).filter(encontrado);
  // Género: el script atado buscaba también "P. Varon" / "P. Mujer" (corrección 3) y tomaba la columna "Sin
  // identificar", que es la de edad (corrección 2).
  const iM = findIdx(corregido ? ['Masculinos', 'Maculinos', 'Varones'] : ['Masculinos', 'Maculinos', 'Varones', 'P. Varon', 'P Varon']);
  const iF = findIdx(corregido ? ['Femeninos', 'Mujeres'] : ['Femeninos', 'Mujeres', 'P. Mujer', 'P Mujer']);
  const iIns = findIdx(['Inscriptos']);
  const generos = [];
  if (iM !== -1) generos.push({ label: 'Masculinos', idx: iM });
  if (iF !== -1) generos.push({ label: 'Femeninos', idx: iF });
  if (corregido) generos.push({ label: 'Sin identificar', calc: _sinIdentificarGenero_(iIns, iM, iF) });
  else {
    const iSin = findIdx(['Sin identificar', 'No informado', 'NS/NC']);
    if (iSin !== -1) generos.push({ label: 'Sin identificar', idx: iSin });
  }
  const edades = EDADES_UNPIVOT_.map(conIdx).filter(encontrado);

  const fechaCarga = opciones.fechaCarga || new Date();
  const filas = [], origen = [];
  let saltadas = 0, idsGenerados = 0;
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const figura = row[baseIdx[0]];
    let id = corregido ? (opciones.ids ? opciones.ids[r] : '') : (iId === -1 ? '' : row[iId]);
    if ((figura === '' || figura == null) && !id) { saltadas++; continue; }
    if (!id) {
      if (corregido) { saltadas++; continue; }   // no pasa: la derivada 12 tiene valor siempre que hay figura
      id = BASE_UNPIVOT_.map(function (_, j) { return row[baseIdx[j]]; }).join(' | ');   // como el script atado
      idsGenerados++;
    }
    const statusVal = iStatus !== -1 ? row[iStatus] : '';
    const pushOut = function (grupo, etiqueta, v) {
      const num = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (num && Number.isFinite(num)) {
        filas.push([id].concat(baseIdx.map(function (i) { return row[i]; }), [statusVal, grupo, etiqueta, num, fechaCarga]));
        origen.push(r);
      }
    };
    canales.forEach(function (c) { pushOut('Canal', c.label, row[c.idx]); });
    generos.forEach(function (g) { pushOut('Género', g.label, g.calc ? g.calc(row) : row[g.idx]); });
    edades.forEach(function (e) { pushOut('Rango Etario', e.label, row[e.idx]); });
  }
  return { encabezado: ENCABEZADO_UNPIVOT_.slice(), filas: filas, origen: origen, saltadas: saltadas,
           idsGenerados: idsGenerados };
}

/** "Sin identificar" de Género (corrección 2): Inscriptos − Masculinos − Femeninos; '' si falta alguno o no da positivo. */
function _sinIdentificarGenero_(iIns, iM, iF) {
  return function (row) {
    if (iIns === -1 || iM === -1 || iF === -1) return '';
    const v = [row[iIns], row[iM], row[iF]];
    if (v.some(function (x) { return x === '' || x === null || x === undefined; })) return '';
    const n = v.map(function (x) { return typeof x === 'number' ? x : Number(String(x).replace(',', '.')); });
    if (n.some(function (x) { return !Number.isFinite(x); })) return '';
    const d = n[0] - n[1] - n[2];
    return d > 0 ? d : '';
  };
}

// ===================== Aux_Maximos =====================

/**
 * **Aux_Maximos**, en memoria, como `buildAuxMaximos`: sólo reuniones realizadas (el status lo dice, o asistentes ≥ 1),
 * con ID y FECHA; por nivel (Barrio, Día de la semana, HORA) y fecha: la de más asistentes por status
 * (MaxPorFechaStatus) y por figura (MaxPorFiguraFecha), y los totales por figura y status (TotalPorFiguraFecha).
 * `opciones.modo` / `opciones.ids` como en `armarDatosUnpivot_` (en modo corregido, la ID es la derivada 12: una fila sin
 * figura no entra). Devuelve `{ encabezado, filas }` o `{ error }`.
 */
function armarAuxMaximos_(data, opciones) {
  opciones = opciones || {};
  const corregido = opciones.modo !== 'compatible';
  const STATUS_COL = 'STATUS REUNIÓN';
  const necesarias = ['Figura', 'Barrio', 'EVENTO', 'Día de la semana', 'FECHA', 'HORA', STATUS_COL, 'Inscriptos', 'Asistentes']
    .concat(corregido ? [] : ['ID']);
  const header = data[0].map(_normLooker_);
  const idx = {};
  const faltan = [];
  necesarias.forEach(function (n) { idx[n] = header.indexOf(_normLooker_(n)); if (idx[n] === -1) faltan.push(n); });
  if (faltan.length) return { error: 'faltan columnas: ' + faltan.join(', ') };

  const toStr = function (v) { return v == null ? '' : String(v).trim(); };
  const toNum = function (v) {
    if (typeof v === 'number') return v || 0;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  const parseDateOnly = function (v) {
    try {
      if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
      if (typeof v === 'number') {
        const base = new Date(1899, 11, 30);
        const d = new Date(base.getTime() + v * 86400000);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }
      const s = toStr(v); if (!s) return null;
      let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (m) { const dd = +m[1], mm = +m[2] - 1, yy = +m[3]; const y = yy < 100 ? yy + 2000 : yy; const d = new Date(y, mm, dd); return isNaN(d) ? null : d; }
      m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      if (m) { const y = +m[1], mm = +m[2] - 1, dd = +m[3]; const d = new Date(y, mm, dd); return isNaN(d) ? null : d; }
      const d = new Date(s); return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
    } catch (e) { return null; }
  };
  const isRealizada = function (status, asistentes) {
    const s = toStr(status);
    if (!s && asistentes >= MIN_ASIST_REALIZADA_LOOKER_) return true;
    for (let k = 0; k < REALIZADAS_REGEX_LOOKER_.length; k++) if (REALIZADAS_REGEX_LOOKER_[k].test(s)) return true;
    return asistentes >= MIN_ASIST_REALIZADA_LOOKER_;
  };
  const ensureMap = function (m, k) { if (!m.has(k)) m.set(k, new Map()); return m.get(k); };
  const niveles = ['Barrio', 'Día de la semana', 'HORA'];
  const getClave = function (nivel, row) {
    if (nivel === 'Barrio') return toStr(row[idx['Barrio']]);
    if (nivel === 'Día de la semana') return toStr(row[idx['Día de la semana']]);
    return horaHHmm_(row[idx['HORA']]);
  };
  const maxPorFechaStatus = { 'Barrio': new Map(), 'Día de la semana': new Map(), 'HORA': new Map() };
  const maxPorFiguraFecha = { 'Barrio': new Map(), 'Día de la semana': new Map(), 'HORA': new Map() };
  const totPorFiguraFecha = { 'Barrio': new Map(), 'Día de la semana': new Map(), 'HORA': new Map() };

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const asistentes = toNum(row[idx['Asistentes']]);
    const inscriptos = toNum(row[idx['Inscriptos']]);
    const figura = toStr(row[idx['Figura']]);
    const barrio = toStr(row[idx['Barrio']]);
    const evento = toStr(row[idx['EVENTO']]);
    const diaNom = toStr(row[idx['Día de la semana']]);
    const fechaOnly = parseDateOnly(row[idx['FECHA']]);
    const horaStr = horaHHmm_(row[idx['HORA']]);
    const id = corregido ? toStr(opciones.ids ? opciones.ids[r] : '') : toStr(row[idx['ID']]);
    const statusRaw = toStr(row[idx[STATUS_COL]]) || '(Sin estado)';
    if (!id || !fechaOnly) continue;
    if (!isRealizada(statusRaw, asistentes)) continue;
    const candidate = { Figura: figura, Evento: evento, FECHA: fechaOnly, HORA: horaStr, Barrio: barrio,
                        'Día de la semana': diaNom, ID: id, Status: statusRaw, Asistentes: asistentes, Inscriptos: inscriptos };
    const fKey = fechaOnly.getTime();
    niveles.forEach(function (nivel) {
      const clave = getClave(nivel, row);
      if (!clave) return;
      {
        const fMap = ensureMap(ensureMap(maxPorFechaStatus[nivel], clave), fKey);
        const cur = fMap.get(statusRaw);
        if (!cur || asistentes > cur.Asistentes) fMap.set(statusRaw, candidate);
      }
      {
        const fMap = ensureMap(ensureMap(maxPorFiguraFecha[nivel], clave), fKey);
        const cur = fMap.get(figura);
        if (!cur || asistentes > cur.Asistentes) fMap.set(figura, candidate);
      }
      {
        const sMap = ensureMap(ensureMap(ensureMap(totPorFiguraFecha[nivel], clave), fKey), figura);
        if (!sMap.has(statusRaw)) sMap.set(statusRaw, { TotAs: 0, TotInsc: 0, Count: 0, anyRow: candidate });
        const agg = sMap.get(statusRaw);
        agg.TotAs += asistentes;
        agg.TotInsc += inscriptos;
        agg.Count += 1;
      }
    });
  }

  const filas = [];
  const push = function (o) {
    filas.push([o.Figura || '', o.Barrio || '', o.Evento || '', o.Dia || '', o.Fecha || null, o.Hora || '', o.Status || '',
                o.Inscriptos == null ? null : o.Inscriptos, o.Asistentes == null ? null : o.Asistentes, o.ID || '',
                o.Granularidad, o.Nivel, o.Clave,
                o.Max_Asistentes == null ? null : o.Max_Asistentes, o.Tot_Asistentes == null ? null : o.Tot_Asistentes,
                o.Tot_Inscriptos == null ? null : o.Tot_Inscriptos, o.Cant_Reuniones == null ? null : o.Cant_Reuniones,
                o.Realizada_Flag ? '1' : '0']);
  };
  niveles.forEach(function (nivel) {
    maxPorFechaStatus[nivel].forEach(function (mFecha, clave) {
      mFecha.forEach(function (mStatus, fKey) {
        mStatus.forEach(function (md, st) {
          push({ Figura: md.Figura, Barrio: md.Barrio, Evento: md.Evento, Dia: md['Día de la semana'], Fecha: new Date(+fKey),
                 Hora: md.HORA, Status: st, Granularidad: 'MaxPorFechaStatus', Nivel: nivel, Clave: clave,
                 Max_Asistentes: md.Asistentes, Realizada_Flag: true });
        });
      });
    });
  });
  niveles.forEach(function (nivel) {
    maxPorFiguraFecha[nivel].forEach(function (mFecha, clave) {
      mFecha.forEach(function (mFig, fKey) {
        mFig.forEach(function (md) {
          push({ Figura: md.Figura, Barrio: md.Barrio, Evento: md.Evento, Dia: md['Día de la semana'], Fecha: new Date(+fKey),
                 Hora: md.HORA, Status: md.Status, Granularidad: 'MaxPorFiguraFecha', Nivel: nivel, Clave: clave,
                 Max_Asistentes: md.Asistentes, Realizada_Flag: true });
        });
      });
    });
  });
  niveles.forEach(function (nivel) {
    totPorFiguraFecha[nivel].forEach(function (mFecha, clave) {
      mFecha.forEach(function (mFig, fKey) {
        mFig.forEach(function (mStatus, fig) {
          mStatus.forEach(function (agg, st) {
            const any = agg.anyRow;
            push({ Figura: fig, Barrio: any.Barrio, Evento: '', Dia: any['Día de la semana'], Fecha: new Date(+fKey),
                   Hora: any.HORA, Status: st, Granularidad: 'TotalPorFiguraFecha', Nivel: nivel, Clave: clave,
                   Tot_Asistentes: agg.TotAs, Tot_Inscriptos: agg.TotInsc, Cant_Reuniones: agg.Count, Realizada_Flag: true });
          });
        });
      });
    });
  });
  return { encabezado: ENCABEZADO_AUX_MAXIMOS_.slice(), filas: filas };
}

// ===================== La escritura (en la corrida de la hora) =====================

/**
 * **Reescribe Datos_Unpivot y Aux_Maximos** desde RVD (modo corregido), con la ID de la derivada 12. Lo llama la corrida
 * de la hora con LOOKER_EN_SISTEMA, después de las derivadas. Si a una solapa le falta una columna de RVD, no se reescribe
 * (queda la de antes) y el log lo dice. En seco sólo cuenta. Devuelve `{ unpivot, aux, reuniones }` (filas escritas o
 * que se escribirían, e ID distintos de Datos_Unpivot).
 */
function escribirSolapasLooker_(enSeco) {
  const ss = ssDestino_();
  const sh = ss.getSheetByName(RDV_HOJA_DESTINO);
  const data = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const ids = idsDerivados_(data);
  const u = armarDatosUnpivot_(data, { modo: 'corregido', ids: ids, fechaCarga: new Date() });
  const a = armarAuxMaximos_(data, { modo: 'corregido', ids: ids });
  const out = { unpivot: null, aux: null, reuniones: null };
  if (u.error) Logger.log('>>> %s NO se reescribe: %s (queda la de antes).', RDV_HOJA_UNPIVOT, u.error);
  else {
    out.reuniones = new Set(u.filas.map(function (f) { return f[0]; })).size;
    out.unpivot = enSeco ? u.filas.length : _escribirSolapaLooker_(ss, RDV_HOJA_UNPIVOT, u.encabezado, u.filas, null);
  }
  if (a.error) Logger.log('>>> %s NO se reescribe: %s (queda la de antes).', RDV_HOJA_AUX_MAXIMOS, a.error);
  else out.aux = enSeco ? a.filas.length : _escribirSolapaLooker_(ss, RDV_HOJA_AUX_MAXIMOS, a.encabezado, a.filas, _formatoAuxMaximos_);
  Logger.log('--- tablero de Looker (%s): %s %s filas (%s reuniones) | %s %s filas ---', enSeco ? 'EN SECO: no se escribió' : 'escrito',
             RDV_HOJA_UNPIVOT, out.unpivot == null ? '—' : out.unpivot, out.reuniones == null ? '—' : out.reuniones,
             RDV_HOJA_AUX_MAXIMOS, out.aux == null ? '—' : out.aux);
  return out;
}

/** Borra el contenido (no el formato) y escribe encabezado + filas en un bloque. Devuelve las filas escritas. */
function _escribirSolapaLooker_(ss, nombre, encabezado, filas, formatear) {
  const sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  sh.clearContents();
  const todo = [encabezado].concat(filas);
  sh.getRange(1, 1, todo.length, encabezado.length).setValues(todo);
  if (formatear && filas.length) formatear(sh, encabezado, todo.length);
  return filas.length;
}

/** Los formatos de Aux_Maximos, como los ponía el script atado. */
function _formatoAuxMaximos_(sh, encabezado, ultima) {
  const col = function (n) { const k = encabezado.indexOf(n); return k < 0 ? null : sh.getRange(2, k + 1, ultima - 1, 1); };
  if (col('FECHA')) col('FECHA').setNumberFormat('yyyy-mm-dd');
  ['Max_Asistentes', 'Tot_Asistentes', 'Tot_Inscriptos', 'Cant_Reuniones'].forEach(function (n) {
    if (col(n)) col(n).setNumberFormat('#,##0');
  });
  ['Figura', 'Barrio', 'EVENTO', 'Día de la semana', 'HORA', 'STATUS REUNIÓN', 'Granularidad', 'Nivel', 'Clave', 'ID',
   'Realizada_Flag'].forEach(function (n) { if (col(n)) col(n).setNumberFormat('@'); });
}
