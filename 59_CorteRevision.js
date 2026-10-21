/**
 * 59_CorteRevision.js — "LO VIEJO SE DEJA COMO ESTÁ; TRABAJAMOS HACIA ADELANTE" (20/10, decisión del usuario; prompt 10, punto 2;
 * REVISION_DESDE_FECHA_CORTE, APAGADO; FECHA_CORTE_REVISION = '2026-10-06', el inicio de la agenda).
 *
 * Con el interruptor prendido, las solapas DE REVISIÓN dejan de mostrar lo anterior a la fecha de corte. **Sólo la vista**: el plan
 * (`calcularPlan_`), los cruces, las escrituras de la base, las elecciones (ELECCIONES_MATCH se lee, se aplica y se guarda igual), los
 * conteos del log y REGISTRO_UPSERT no cambian; nada se borra de ningún dato. Lo de antes del corte no se corrige (CLAUDE.md, "Lo
 * viejo se deja como está").
 *
 * La fecha que cuenta es siempre la de la REUNIÓN; en cada solapa:
 *   REVISAR_MATCH (fichas)  pendientes: la FECHA de la fila (`_listaFichas_`, 26_Fichas.js); RESUELTAS: la fecha de la reunión de
 *                           la elección (`_resueltas_`). La vista previa del paso 21 (`opts.filas`) no se filtra: pide filas a mano.
 *   REVISAR_MATCH (líneas)  el formato viejo (REVISAR_COMO_FICHAS = false): la columna "fecha" (la FECHA de la fila).
 *   SIN_MATCH               la columna "fecha" (la FECHA de la fila).
 *   EMPAREJAR_MANUAL        la columna "Fecha": en los pares, en "filas sin ningún candidato" y en "por fila del destino", la FECHA
 *                           de la fila; en "formularios sin ningún candidato", la fecha del FORMULARIO (la de su nombre o, sin
 *                           ella, su cierre: la misma que muestra la línea). Los títulos "(N)" se recuentan.
 *   HISTORICO_SIN_RESOLVER  la FECHA de la fila (`escribirHistoricoSinResolver_`).
 *   IDS_SIN_CRUZAR          la Fecha DE LA LISTA (la planeada, la que muestra "Fecha (lista)"): el ID todavía no tiene fila.
 *   "se hizo y no está en la base" (AGENDA_PENDIENTES y el aviso diario 'agenda_info', `infoAgenda_`): la fecha de RDV CONJUNTO.
 * Sin fecha legible (vacía, o un texto sin año), la línea SE MUESTRA: no se puede afirmar que sea vieja.
 *
 * El seco (`medirCorteRevision()`, diagnostico/40_corte_revision.js) usa estas mismas funciones con el corte forzado
 * (`_forzarCorteRevision_`).
 */

/** null = rige REVISION_DESDE_FECHA_CORTE; true / false = el seco o un test lo fuerzan. */
var _forzarCorteRevision_ = null;

/** ¿Rige el corte? El interruptor, salvo que el seco o un test lo fuercen. */
function corteRevisionActivo_() {
  return _forzarCorteRevision_ === null ? !!REVISION_DESDE_FECHA_CORTE : !!_forzarCorteRevision_;
}

/** FECHA_CORTE_REVISION como 'yyyyMMdd', sin mirar el interruptor; null si no es una fecha "yyyy-MM-dd" válida. */
function ymdFechaCorteRevision_() {
  const m = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(String(FECHA_CORTE_REVISION == null ? '' : FECHA_CORTE_REVISION));
  if (!m || !alMediodia_(+m[1], +m[2], +m[3])) return null;
  return m[1] + m[2] + m[3];
}

/** El corte que rige ahora: 'yyyyMMdd' con el corte prendido; null apagado, o con la fecha mal escrita (entonces no se esconde nada). */
function corteRevisionYmd_() {
  return corteRevisionActivo_() ? ymdFechaCorteRevision_() : null;
}

/**
 * La fecha de una celda o de un valor, para el corte: un Date, o un texto 'dd/MM/yyyy' COMPLETO (con el año: "1/10" no, porque
 * toDate_ le pondría el año de hoy). Cualquier otra cosa: null (se muestra).
 */
function fechaParaCorte_(v) {
  if (v && typeof v.getTime === 'function') return isNaN(v.getTime()) ? null : v;
  const s = typeof v === 'string' ? v.trim() : '';
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s) ? toDate_(s) : null;
}

/** ¿`v` (Date o 'dd/MM/yyyy') es ANTERIOR a `corte` ('yyyyMMdd')? Sin corte o sin fecha legible: false (se muestra). */
function antesDelCorte_(v, corte) {
  if (!corte) return false;
  const d = fechaParaCorte_(v);
  return !!d && ymd_(d) < corte;
}

/**
 * Las líneas de un reporte (SIN_MATCH, REVISAR_MATCH de una línea) con la fecha en la columna `iFecha`: `{ quedan, salen }`. Sin corte,
 * `quedan` es EL MISMO arreglo (apagado: idéntico). Las líneas se conservan por referencia.
 */
function filtrarLineasPorCorte_(lineas, iFecha, corte) {
  if (!corte || !lineas) return { quedan: lineas, salen: [] };
  const quedan = [], salen = [];
  lineas.forEach(function (l) { (antesDelCorte_(l[iFecha], corte) ? salen : quedan).push(l); });
  return { quedan: quedan, salen: salen };
}

/**
 * EMPAREJAR_MANUAL (la matriz de `calcularEmparejar_`) sin las líneas de antes del corte, por su columna "Fecha" (la misma en todas las
 * secciones: ver arriba). Los títulos "--- … (N) ---" se recuentan con lo que queda; las líneas vacías, los títulos y el encabezado del
 * bloque "por fila del destino" quedan. Devuelve `{ matriz, salen: [{ seccion, linea }] }`; sin corte, la MISMA matriz.
 */
function filtrarEmparejarPorCorte_(matriz, corte) {
  if (!corte || !matriz || !matriz.length) return { matriz: matriz, salen: [] };
  const iF = matriz[0].indexOf('Fecha');
  if (iF < 0) return { matriz: matriz, salen: [] };
  const out = [matriz[0]], salen = [];
  let titulo = -1, n = 0, seccion = 'pares (formulario → fila)';
  const cerrar = function () {
    if (titulo < 0) return;
    const t = out[titulo].slice();
    t[0] = String(t[0]).replace(/\((\d+)/, '(' + n);
    out[titulo] = t;
  };
  for (let k = 1; k < matriz.length; k++) {
    const l = matriz[k], c0 = String(l[0]);
    if (c0 === '---') { out.push(l); continue; }                       // el encabezado del bloque "por fila del destino"
    if (/^---/.test(c0)) { cerrar(); titulo = out.length; n = 0; seccion = c0.replace(/^-+\s*|\s*-+$/g, ''); out.push(l); continue; }
    if (l.every(function (x) { return x === '' || x === null || x === undefined; })) { out.push(l); continue; }
    if (antesDelCorte_(l[iF], corte)) { salen.push({ seccion: seccion, linea: l }); continue; }
    out.push(l);
    n++;
  }
  cerrar();
  return { matriz: out, salen: salen };
}

/** Las líneas de IDS_SIN_CRUZAR (`res.sinCruzar`: { orden: yyyyMMdd de la Fecha de la lista, o 0; linea }) desde el corte. */
function filtrarSinCruzarIdsPorCorte_(lista, corte) {
  if (!corte || !lista) return { quedan: lista, salen: [] };
  const c = Number(corte), quedan = [], salen = [];
  lista.forEach(function (x) { ((x.orden || 0) > 0 && x.orden < c ? salen : quedan).push(x); });
  return { quedan: quedan, salen: salen };
}

/**
 * Lo que `escribirReportes_` escribe en REVISAR_MATCH (formato de una línea), EMPAREJAR_MANUAL y SIN_MATCH, con el corte que rige.
 * Apagado devuelve los mismos arreglos del plan. Las fichas filtran adentro (`_listaFichas_`, `_resueltas_`).
 */
function reportesConCorte_(plan) {
  const corte = corteRevisionYmd_();
  const rev = filtrarLineasPorCorte_(plan.filasRevisar, 3, corte);
  const sin = filtrarLineasPorCorte_(plan.filasSinMatch, 3, corte);
  const emp = filtrarEmparejarPorCorte_(plan.emp ? plan.emp.matriz : null, corte);
  return { corte: corte, revisar: rev.quedan, sinMatch: sin.quedan, emparejar: emp.matriz,
           ocultas: { revisar: rev.salen.length, sinMatch: sin.salen.length, emparejar: emp.salen.length } };
}

/** "dd/MM/yyyy" de un 'yyyyMMdd', para los logs. */
function fmtCorteRevision_(corte) {
  return corte ? corte.slice(6, 8) + '/' + corte.slice(4, 6) + '/' + corte.slice(0, 4) : '';
}
