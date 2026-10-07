/**
 * diagnostico/19_direccion_conjunto.js — paso 45 (07/10): la DIRECCIÓN en el cruce con RDV CONJUNTO, medida ANTES de
 * usarla (CRUCE_CONJUNTO_POR_DIRECCION). SÓLO LECTURA: no escribe en ninguna planilla.
 *
 *   a) cuántas filas de RDV CONJUNTO tienen dirección (y cuántas con calle + número reconocibles);
 *   b) en los cruces de hoy (Asistentes/oradores, figura + fecha): la dirección de RDV CONJUNTO contra la del destino,
 *      exacta / parecida / distinta / no evaluable;
 *   c) qué cruces cambiarían con la dirección: CAMBIA (una fila que hoy cruza iría a otra: tiene que dar 0), RESUELVE
 *      (una ambigua de hoy que la dirección desempata), PIERDE (una que hoy cruza y dejaría de cruzar);
 *   d) la figura de las Seguridad en tu Barrio: las filas sin Figura (con la fecha pasada) y las de Seguridad que
 *      completó la agenda, con y sin la dirección.
 */
function medirDireccionConjunto() {
  Logger.log('=== medirDireccionConjunto (paso 45) — sólo lectura, no escribe nada (CRUCE_CONJUNTO_POR_DIRECCION = %s) ===',
             CRUCE_CONJUNTO_POR_DIRECCION);
  const dest = leerDestino_();
  const comunas = leerComunasMap_();
  const sin = cruzarAsistentes_(dest, comunas, { conDireccion: false });
  const con = cruzarAsistentes_(dest, comunas, { conDireccion: true });
  if (sin.error) { Logger.log('>>> %s', sin.error); return { error: sin.error }; }
  const out = { conjunto: 0, conDireccion: 0, comparable: 0, exacta: 0, parecida: 0, distinta: 0, noEvaluable: 0,
                cambia: [], resuelve: [], pierde: [], seguridad: [] };

  // a) RDV CONJUNTO
  const vals = sin.valores;
  for (let i = 1; i < vals.length; i++) {
    if (vals[i].every(function (v) { return esVacio_(v); })) continue;
    out.conjunto++;
    const d = sin.iDir != null ? str(vals[i][sin.iDir]) : '';
    if (d) out.conDireccion++;
    if (d && direccionComparable_(d)) out.comparable++;
  }
  Logger.log('--- a) RDV CONJUNTO: %s filas | con dirección %s | con calle y número reconocibles %s%s ---', out.conjunto,
             out.conDireccion, out.comparable, sin.iDir == null ? '   <<< NO tiene columna "Dirección"' : '');
  if (sin.iDirD == null) Logger.log('  >>> el destino no tiene columna "Dirección"');

  // b) los cruces de hoy
  const porFila = {};
  dest.filas.forEach(function (f) { porFila[f.fila] = f; });
  sin.parDe.forEach(function (filaD, filaC) {
    const dC = sin.iDir != null ? vals[filaC - 1][sin.iDir] : '', f = porFila[filaD];
    const dD = f && sin.iDirD != null ? f.valores[sin.iDirD] : '';
    const c = compararDirecciones_(dC, dD);
    if (c === 'exacta') out.exacta++; else if (c === 'parecida') out.parecida++; else if (c === 'no') out.distinta++; else out.noEvaluable++;
  });
  const ev = out.exacta + out.parecida + out.distinta;
  const pct = function (n) { return ev ? (100 * n / ev).toFixed(1) + '%' : '—'; };
  Logger.log('--- b) los %s cruces de hoy: dirección exacta %s (%s) | parecida %s (%s) | distinta %s (%s) | no evaluable %s ---',
             sin.parDe.size, out.exacta, pct(out.exacta), out.parecida, pct(out.parecida), out.distinta, pct(out.distinta), out.noEvaluable);

  // c) qué cambiaría
  const claves = new Set(Array.from(sin.parDe.keys()).concat(Array.from(con.parDe.keys())));
  claves.forEach(function (filaC) {
    const a = sin.parDe.get(filaC), b = con.parDe.get(filaC);
    const x = { filaC: filaC, nombre: str(vals[filaC - 1][sin.iFig]), dir: sin.iDir != null ? str(vals[filaC - 1][sin.iDir]) : '', hoy: a, con: b };
    if (a && b && a !== b) out.cambia.push(x);
    else if (!a && b) out.resuelve.push(x);
    else if (a && !b) out.pierde.push(x);
  });
  Logger.log('--- c) con la dirección: CAMBIA %s (tiene que dar 0) | RESUELVE %s (ambiguas de hoy) | PIERDE %s | ambiguas hoy %s ---',
             out.cambia.length, out.resuelve.length, out.pierde.length, sin.ambiguas.length);
  const desc = function (n) { const f = porFila[n]; return n ? 'fila ' + n + ' (' + (f ? (f.barrio || 'sin barrio') + ', ' + str(f.valores[sin.iDirD]) : '') + ')' : '—'; };
  out.cambia.forEach(function (x) { Logger.log('    CAMBIA | RDV CONJUNTO %s | %s | %s | hoy %s → con dirección %s', x.filaC, x.nombre, x.dir, desc(x.hoy), desc(x.con)); });
  out.resuelve.forEach(function (x) { Logger.log('    RESUELVE | RDV CONJUNTO %s | %s | %s → %s', x.filaC, x.nombre, x.dir, desc(x.con)); });
  out.pierde.forEach(function (x) { Logger.log('    PIERDE | RDV CONJUNTO %s | %s | %s | hoy %s', x.filaC, x.nombre, x.dir, desc(x.hoy)); });

  // d) la figura de las Seguridad en tu Barrio
  const conj = leerConjuntoPorFecha_();
  const iDir = findIdxOr_(dest.hdr, ['direccion', 'dirección'], true), iLug = findIdxOr_(dest.hdr, ['lugar (mail)'], true);
  const iEvM = findIdxOr_(dest.hdr, ['evento (mail)'], true), iUid = findIdxOr_(dest.hdr, ['agenda_uid'], true);
  const hoy = hoyMediodia_();
  dest.filas.forEach(function (f) {
    if (!f.fecha || f.fecha > hoy) return;
    const deSeguridad = iEvM != null && /seguridad/i.test(str(f.valores[iEvM])) && iUid != null && !esVacio_(f.valores[iUid]);
    if (f.figura && !deSeguridad) return;
    const dir = iDir != null ? str(f.valores[iDir]) : '';
    const com = f.barrio ? _comunaBarrioAg_(f.barrio) : (iLug != null ? detectComuna_(str(f.valores[iLug])) : null);
    const barrio = f.barrio ? _canonBarrioAg_(f.barrio) || f.barrio : '';
    const a = figuraSeguridad_(f.fecha, barrio, com == null ? null : com, conj, dir, false);
    const b = figuraSeguridad_(f.fecha, barrio, com == null ? null : com, conj, dir, true);
    if (a.figura === b.figura && !(f.figura && b.figura && f.figura !== b.figura)) return;
    out.seguridad.push({ f: f, hoy: a, con: b });
    Logger.log('    SEGURIDAD | fila %s | %s | %s | %s | Figura hoy "%s" | sin dirección: %s | con dirección: %s%s', f.fila,
               fmtFecha_(f.fecha), f.barrio || '(sin barrio' + (com != null ? ', Comuna ' + com : '') + ')', dir || '(sin dirección)',
               f.figura || '', a.figura || a.motivo, b.figura ? b.figura + ' (' + b.por + ', RDV CONJUNTO fila ' + b.filas.join(', ') + ')' : b.motivo,
               b.barrioConjunto ? ' — barrio en RDV CONJUNTO: ' + b.barrioConjunto : '');
  });
  Logger.log('--- d) Seguridad en tu Barrio: %s filas cambian con la dirección (arriba) ---', out.seguridad.length);
  Logger.log('  >>> si CAMBIA da 0 y los RESUELVE y las de Seguridad son correctos: CRUCE_CONJUNTO_POR_DIRECCION = true.');
  return { conjunto: out.conjunto, conDireccion: out.conDireccion, comparable: out.comparable, exacta: out.exacta,
           parecida: out.parecida, distinta: out.distinta, noEvaluable: out.noEvaluable, cambia: out.cambia.length,
           resuelve: out.resuelve.length, pierde: out.pierde.length, seguridad: out.seguridad.length };
}
