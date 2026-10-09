/**
 * 43_Ayuda.js — las solapas de AYUDA (07/10): "GUÍA" en el archivo del destino (la base RDV) y "LEER" en el archivo
 * "Agenda". Texto para el equipo, con formato. **Ninguna la lee ni la toca el upsert ni la agenda**: las escribe sólo el
 * paso 48 (`escribirSolapasAyuda`), que las reescribe enteras si ya existen. Protegidas: sólo el dueño del archivo y
 * quien corre el script editan.
 *
 * Formato (igual en las dos): una sola columna de texto (A), ~900 px, ajuste de texto, Arial 11; la fila 1 es el título
 * (negrita 16, fondo azul oscuro, letra blanca, 36 px de alto) y queda congelada; los títulos de sección en negrita 12
 * sobre gris claro, con una fila en blanco antes; una viñeta por fila (" • "); en "QUÉ SIGNIFICAN LOS COLORES" cada
 * línea con el fondo del color que describe (los mismos de las fichas: RM.COLOR de 27_RevisarFormato.js, y
 * COLOR_SISTEMA); la palabra ELEGIR en negrita; sin cuadrícula; la solapa, primera de la izquierda.
 */

const AYUDA_SOLAPA_GUIA = 'GUÍA';
const AYUDA_SOLAPA_LEER = 'LEER';
const DESC_PROTECCION_AYUDA = 'RDV: solapa de ayuda — la escribe el paso 48; no se edita a mano';

const AYUDA_FORMATO_ = {
  fuente: 'Arial', tamano: 11, ancho: 900,
  tituloTamano: 16, tituloFondo: '#1F3864', tituloLetra: '#FFFFFF', tituloAlto: 36,
  seccionTamano: 12, seccionFondo: '#D9E1F2', vineta: ' • '
};

/** El texto de la solapa "GUÍA" del archivo del destino. [tipo, texto, color] — color: clave de _coloresAyuda_(). */
const AYUDA_GUIA_ = [
  ['titulo', 'GUÍA RÁPIDA — BASE RDV'],
  ['seccion', 'QUÉ HACE EL SISTEMA (solo, cada hora)'],
  ['item', 'Crea las reuniones que llegan en el mail de agenda.'],
  ['item', 'Completa inscriptos, canales, sexo y edades (formularios), asistentes y oradores (RDV CONJUNTO).'],
  ['item', 'Calcula Día, Comuna, Zona, % de asistencia y las demás columnas calculadas.'],
  ['seccion', 'QUÉ SIGNIFICAN LOS COLORES'],
  ['item', 'Azul claro: lo escribió el sistema.', 'sistema'],
  ['item', 'Verde: coincide con la reunión (en las fichas).', 'verde'],
  ['item', 'Rojo: no coincide (en las fichas).', 'rojo'],
  ['item', 'Gris: no se puede comparar (en las fichas).', 'gris'],
  ['item', 'Amarillo: celda para elegir, o el eje no coincide (en las fichas).', 'amarillo'],
  ['seccion', 'QUÉ HACE EL EQUIPO'],
  ['item', 'Si falta un dato, completarlo en la fila que ya existe. No cargar otra fila para una reunión del mail.'],
  ['item', 'Barrio vacío: cargarlo. Lo que corrijan, el sistema no lo vuelve a tocar.'],
  ['item', 'Si una fila sobra, borrarla: el sistema no la vuelve a crear.'],
  ['item', 'No escribir en: columnas calculadas, RDV_UID, form_*, agenda_*, Origen fila, Tocado por el equipo, columnas "(mail)", No participa, Conjunta con.'],
  ['item', 'Las columnas grises las escribe el sistema: si se tocan, el sistema las corrige. Para ordenar, usar Datos → Ordenar hoja o vistas de filtro; nunca ordenar sólo algunas columnas.'],
  ['seccion', 'SOLAPA REVISAR_MATCH (formularios dudosos)'],
  ['item', 'Cada ficha: la reunión arriba y hasta 3 formularios abajo.'],
  ['item', 'Leer "¿por qué?" y elegir en ELEGIR: Opción 1, 2, 3, Ninguno o No sé.'],
  ['item', 'Se aplica en la próxima hora; el resultado aparece en "resultado".'],
  ['seccion', 'SOLAPA AGENDA_DUPLICADOS (dudas de la agenda)'],
  ['item', 'Reunión parecida a una fila existente: "Es la misma: vincular" · "Son distintas: crear" · "Ya está cargada en otra fila: no crear" · "No sé".'],
  ['item', 'Reunión que salió del mail: "Se canceló: suspender/borrar" · "Sigue" · "No sé".'],
  ['item', 'Se aplica en la próxima hora.'],
  ['seccion', 'ARCHIVO "AGENDA"'],
  ['item', '"Agenda": la semana en curso. "Agenda cerrada": las anteriores. Sólo lectura.']
];

/** El texto de la solapa "LEER" del archivo "Agenda". */
const AYUDA_LEER_ = [
  ['titulo', 'AGENDA DE ENCUENTROS CON VECINOS'],
  ['seccion', 'QUÉ ES'],
  ['item', 'Las reuniones de la semana, tomadas del mail "Agenda Encuentros de vecinos con …" (CM y Ministros y JM).'],
  ['item', '"Agenda": la semana en curso. "Agenda cerrada": las semanas anteriores.'],
  ['seccion', 'CÓMO SE ACTUALIZA'],
  ['item', 'Sola, cada hora. Toma siempre la ÚLTIMA versión del mail de cada semana.'],
  ['item', 'Si cambia la hora, la dirección o el lugar, se actualiza y queda anotado en "Cambios".'],
  ['item', 'Si una reunión sale del mail: "Estado en la agenda" = desaparecida (se confirma en la base).'],
  ['item', 'El lunes, la semana que terminó pasa a "Agenda cerrada".'],
  ['seccion', 'QUÉ SIGNIFICAN LAS COLUMNAS (las menos obvias)'],
  ['item', 'Barrio calculado: sale de la dirección. Vacío si no hay dirección o el lugar está en un límite (ver "Sin barrio porque").'],
  ['item', 'No participa / Conjunta con: figuras marcadas "NO PARTICIPA" y las que comparten la reunión.'],
  ['item', 'Fila del destino: la fila de la base RDV donde está esa reunión. STATUS en el destino: su estado allí.'],
  ['item', 'Mail / Versión: de qué mail salió y qué versión es ("3 de 3").'],
  ['seccion', 'IMPORTANTE'],
  ['item', 'No se edita: se reescribe en cada actualización. Las correcciones se hacen en la base RDV.']
];

/** Los colores de la sección de colores: los de las fichas (RM.COLOR) y la marca del sistema. */
function _coloresAyuda_() {
  return { sistema: COLOR_SISTEMA, verde: RM.COLOR.OK_BG, rojo: RM.COLOR.NO_BG, gris: RM.COLOR.NA_BG, amarillo: RM.COLOR.AV_BG };
}

/** Las filas de una solapa de ayuda: el título, una fila en blanco antes de cada sección, una viñeta por fila. */
function filasAyuda_(def) {
  const colores = _coloresAyuda_(), out = [];
  def.forEach(function (l) {
    if (l[0] === 'titulo') out.push({ tipo: 'titulo', texto: l[1] });
    else if (l[0] === 'seccion') { out.push({ tipo: 'blanco', texto: '' }); out.push({ tipo: 'seccion', texto: l[1] }); }
    else out.push({ tipo: 'item', texto: AYUDA_FORMATO_.vineta + l[1], color: l[2] ? colores[l[2]] : null });
  });
  return out;
}

/**
 * **Paso 48**: escribe (o reescribe) las dos solapas de ayuda. En seco sólo dice qué escribiría. No toca ninguna otra
 * solapa: el destino y el archivo "Agenda" se abren por ID y se escribe sólo en "GUÍA" y en "LEER".
 */
function escribirSolapasAyuda(escribe) {
  Logger.log('=== solapas de ayuda (paso 48, %s) ===', escribe ? 'ESCRIBE' : 'EN SECO: no escribe nada');
  const out = {};
  out.guia = _escribirSolapaAyuda_(SpreadsheetApp.openById(RDV_SS_DESTINO), AYUDA_SOLAPA_GUIA, AYUDA_GUIA_, escribe, 'archivo del destino');
  out.leer = _escribirSolapaAyuda_(SpreadsheetApp.openById(AGENDA_COPIA_SS), AYUDA_SOLAPA_LEER, AYUDA_LEER_, escribe, 'archivo "Agenda"');
  return out;
}

function _escribirSolapaAyuda_(ss, nombre, def, escribe, dondeTexto) {
  const filas = filasAyuda_(def), n = filas.length;
  const existe = !!ss.getSheetByName(nombre);
  Logger.log('--- "%s" en el %s: %s; %s filas ---', nombre, dondeTexto, existe ? 'existe, se reescribe' : 'no existe, se crea', n);
  filas.forEach(function (f) { if (f.texto) Logger.log('    %s', f.texto); });
  if (!escribe) return { solapa: nombre, existe: existe, filas: n, escrita: false };

  const sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (pr) {
    if (pr.getDescription() === DESC_PROTECCION_AYUDA) pr.remove();
  });
  sh.clear();                                              // es una solapa de ayuda: se reescribe entera
  // una sola columna y las filas justas
  if (sh.getMaxColumns() > 1) sh.deleteColumns(2, sh.getMaxColumns() - 1);
  if (sh.getMaxRows() < n) sh.insertRowsAfter(sh.getMaxRows(), n - sh.getMaxRows());
  else if (sh.getMaxRows() > n) sh.deleteRows(n + 1, sh.getMaxRows() - n);
  const F = AYUDA_FORMATO_;
  const rg = sh.getRange(1, 1, n, 1);
  rg.setValues(filas.map(function (f) { return [f.texto]; }));
  // ELEGIR en negrita (antes del formato general, que no le cambia el peso)
  const negrita = SpreadsheetApp.newTextStyle().setBold(true).build();
  filas.forEach(function (f, i) {
    const k = f.texto.indexOf('ELEGIR');
    if (k < 0) return;
    sh.getRange(i + 1, 1).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(f.texto).setTextStyle(k, k + 'ELEGIR'.length, negrita).build());
  });
  rg.setFontFamily(F.fuente).setFontSize(F.tamano).setWrap(true).setVerticalAlignment('middle');
  sh.setColumnWidth(1, F.ancho);
  filas.forEach(function (f, i) {
    const c = sh.getRange(i + 1, 1);
    if (f.tipo === 'titulo') {
      c.setFontWeight('bold').setFontSize(F.tituloTamano).setBackground(F.tituloFondo).setFontColor(F.tituloLetra);
      sh.setRowHeight(i + 1, F.tituloAlto);
    } else if (f.tipo === 'seccion') {
      c.setFontWeight('bold').setFontSize(F.seccionTamano).setBackground(F.seccionFondo);
    } else if (f.color) {
      c.setBackground(f.color);
    }
  });
  sh.setFrozenRows(1);
  sh.setHiddenGridlines(true);
  ss.setActiveSheet(sh);
  ss.moveActiveSheet(1);                                   // la primera de la izquierda
  const prot = _protegerAyuda_(sh);
  SpreadsheetApp.flush();
  Logger.log('>>> "%s" escrita: %s filas, primera de la izquierda, protegida (%s).', nombre, n, prot);
  return { solapa: nombre, existe: existe, filas: n, escrita: true, proteccion: prot };
}

/** La protección de una solapa de ayuda: sólo el dueño y quien corre el script; si no se puede, advertencia. */
function _protegerAyuda_(sh) {
  const pr = sh.protect().setDescription(DESC_PROTECCION_AYUDA);
  try {
    // 07/10: si la protección es (o quedó) de ADVERTENCIA, addEditor falla ("… isWarningOnly"): primero se le saca.
    if (pr.isWarningOnly()) pr.setWarningOnly(false);
    const yo = Session.getEffectiveUser();
    pr.addEditor(yo);
    const otros = pr.getEditors().filter(function (e) { return e.getEmail() !== yo.getEmail(); });
    if (otros.length) pr.removeEditors(otros);
    if (pr.canDomainEdit()) pr.setDomainEdit(false);
    pr.setWarningOnly(false);
    return 'real';
  } catch (err) {
    pr.setWarningOnly(true);
    Logger.log('  la protección real de "%s" no se pudo poner (%s): quedó como ADVERTENCIA.', sh.getName(), err);
    return 'advertencia';
  }
}
