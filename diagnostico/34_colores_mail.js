/**
 * diagnostico/34_colores_mail.js — LAS MARCAS DE COLOR DEL MAIL (HTML) (15/10). SÓLO LECTURA: no escribe NADA.
 *
 * Ni valores, ni formatos, ni propiedades, ni etiquetas o marcas de leído de Gmail, ni caches. Sólo el log (Logger.log) y
 * el objeto que devuelve. Se corre desde 99_Correr.js (paso 90).
 *
 * Por qué: en la muestra del usuario (5 mails, 20/07 a 09/10) no hay tachado: quien manda la agenda RESALTA con color de
 * fondo. VERDE = reunión agregada, AMARILLO = reunión cambiada, ROJO = probablemente suspendida aunque siga en el mail. El
 * parser de la agenda lee getPlainBody() (41_AgendaParser.js, leerMailsAgendaGmail_): el color no le llega. Acá se lee
 * además getBody() (el HTML) para medir qué quiere decir cada color, contra lo que pasó después:
 *   1. LA PALETA: por cada mail de agenda de los últimos COLORES_MAIL_DIAS días, el color de fondo de cada línea de cada
 *      reunión (día, Evento, Hora, Lugar): background-color, background, bgcolor, mso-highlight y <mark>, en cualquier
 *      envoltorio (<span>, <td>, <p>, <font>, <div>…). Blanco / transparente / none / inherit no cuentan. Los colores se
 *      normalizan (#rgb, #rrggbb, rgb(), nombres) y se agrupan en familias: VERDE, AMARILLO, ROJO y OTRO (con los valores
 *      crudos y cuántas veces aparecen). El color del TEXTO (color:, <font color>) va aparte;
 *   2. POR FAMILIA: cada reunión resaltada, contra la versión anterior de su semana + grupo (¿nueva? ¿cambió?), contra las
 *      versiones siguientes (¿siguió? ¿cambió? ¿desapareció? ¿se movió?), contra la base (fila, STATUS, otra fecha) y contra
 *      la lista de IDs (planilla 6). Un resumen por familia ("ROJO: 7 reuniones → 5 Suspendida, 1 Realizada (!)…");
 *   3. EL CASO: Jorge Macri, 11/08, Villa Riachuelo (mail del 07/08, grupo JM, semana del 10/08), todo en rojo;
 *   4. LAS NOTAS "Actualizo: …" de arriba del cuerpo (y las líneas sueltas dentro de la agenda), marcando las que hablan de
 *      suspender, cancelar, cambiar el día, reprogramar, postergar, "a confirmar";
 *   5. OTROS: "Hora: A CONFIRMAR" (qué hace el parser con la hora) y las conjuntas con "(NO PARTICIPA)" (a qué figura le
 *      asigna la marca el parser).
 *   y un RESUMEN. Cada sección en su try/catch: si una falla, las demás siguen y el resumen lo dice.
 *
 * Reusa: la lectura de los mails con HTML, el corte de lo citado y el armado de las versiones de la auditoría de
 * cancelaciones (diagnostico/31: `_leerMailsAudCan_`, `_propioDeHtmlAudCan_`, `_entidadesAudCan_`, `_filasDeEventoAudCan_`),
 * el parser de la agenda (41_AgendaParser.js) y la lectura de la lista de IDs (`leerListaIds_`, 45_IdsCuentas.js: sólo
 * openById + getValues). Una lectura de Gmail por mensaje (la de diagnostico/31).
 *
 * LÍMITES de la lectura del color: las reglas de <style> se resuelven sólo para selectores de UNA clase (".x", "span.x"); un
 * color puesto por id, por selector compuesto o heredado por CSS de otra forma, no se ve. El fondo de un contenedor
 * (<table>/<tr>/<td>/<div>) sí se hereda a lo que tiene adentro (es lo que se ve). Un resaltado hecho con una imagen o con
 * un color "casi blanco" (todos los canales ≥ 240) no cuenta.
 */

/** Cuántos días de mails se leen (los últimos ~3 meses). */
const COLORES_MAIL_DIAS = 92;
/** En la lista de IDs: un registro de la misma figura a lo sumo a estos días de la reunión. */
const COLORES_MAIL_DIAS_ID = 21;
/** En la base: otras filas de la figura a lo sumo a estos días (¿se movió?). */
const COLORES_MAIL_DIAS_BASE = 14;
/** En el mail: otra reunión de la figura a lo sumo a estos días (¿se movió?). */
const COLORES_MAIL_DIAS_MOVIDA = 21;
/** El caso del usuario: el "1 a 1" de Macri del martes 11/08 en Villa Riachuelo (mail del 07/08, grupo JM, semana del 10/08). */
const COLORES_MAIL_CASO = { figura: 'Jorge Macri', fecha: '2026-08-11', barrio: 'Villa Riachuelo', grupo: 'JM', mail: '2026-08-07' };
/** Las palabras que se marcan en las notas (sobre el texto normalizado: sin tildes ni mayúsculas). */
const COLORES_MAIL_PALABRAS = /suspend|cancel|cambi\w*\s+(?:de\s+|el\s+|la\s+)?(?:dia|fecha|horario|hora|lugar)|reprogram|posterg|a confirmar|a definir|no se realiza|se pasa\b|se cae\b|se baja\b/g;
/** Una fracción de las letras de la línea (sin la etiqueta) con un color: "entera" desde acá. */
const COLORES_MAIL_ENTERA = 0.8;
/** Cuántos ejemplos por lista, como mucho (para que el log se pueda leer). */
const COLORES_MAIL_MAX_EJEMPLOS = 40;
/** Los nombres de colores CSS / Outlook (mso-highlight) que se reconocen, a hex. */
const COLORES_MAIL_NOMBRES = {
  white: '#ffffff', window: '#ffffff', black: '#000000', windowtext: '#000000', red: '#ff0000', darkred: '#8b0000', maroon: '#800000',
  green: '#008000', lime: '#00ff00', darkgreen: '#006400', lightgreen: '#90ee90', yellowgreen: '#9acd32', greenyellow: '#adff2f',
  yellow: '#ffff00', lightyellow: '#ffffe0', darkyellow: '#808000', olive: '#808000', gold: '#ffd700', khaki: '#f0e68c',
  orange: '#ffa500', darkorange: '#ff8c00', blue: '#0000ff', darkblue: '#00008b', navy: '#000080', lightblue: '#add8e6',
  cyan: '#00ffff', aqua: '#00ffff', darkcyan: '#008b8b', teal: '#008080', magenta: '#ff00ff', fuchsia: '#ff00ff',
  darkmagenta: '#8b008b', purple: '#800080', pink: '#ffc0cb', gray: '#808080', grey: '#808080', darkgray: '#a9a9a9',
  darkgrey: '#a9a9a9', silver: '#c0c0c0', lightgray: '#d3d3d3', lightgrey: '#d3d3d3', whitesmoke: '#f5f5f5'
};
/** Las familias que se buscan, en el orden en que se listan. */
const COLORES_MAIL_FAMILIAS = ['VERDE', 'AMARILLO', 'ROJO', 'OTRO'];
/** La marca de una línea de cita en el texto que se le pasa a `_propioDeHtmlAudCan_` (la misma que diagnostico/31). */
const COLORES_MAIL_CITA = String.fromCharCode(0xE002);

// ===================== El punto de entrada =====================

/**
 * **La auditoría de los colores.** `opciones` (sólo para los tests): `mails` (lista `{fecha, asunto, cuerpo, html, id}` en
 * vez de Gmail), `hoy` (Date). Devuelve `{ paleta, colorTexto, familias, reuniones, caso, notas, horaAConfirmar,
 * noParticipa, resumen, errores }`.
 */
function coloresMail(opciones) {
  opciones = opciones || {};
  const t0 = Date.now();
  const hoy = opciones.hoy || hoyMediodia_();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - COLORES_MAIL_DIAS, 0, 0, 0);
  const C = { hoy: hoy, desde: desde, errores: [], ocurrencias: [], paleta: new Map(), colorTexto: new Map(), fuera: [],
              familias: {}, caso: null, notas: [], horaAConfirmar: null, noParticipa: null, porMail: new Map() };
  Logger.log('=== coloresMail (paso 90) — SÓLO LECTURA: no escribe nada (ni la base, ni la lista de IDs, ni Gmail) ===');
  Logger.log('  hoy %s | mails desde el %s (%s días) | el parser de la agenda lee getPlainBody(): el COLOR no le llega; acá se lee getBody()',
             fmtFecha_(hoy), fmtFecha_(desde), COLORES_MAIL_DIAS);

  _seccionColMail_(C, 'lectura de la base', function () {
    C.dest = leerDestino_();
    C.A = indicesAgenda_(C.dest.hdr);
    C.iAsis = C.dest.D['Asistentes'];
    if (C.A['STATUS REUNIÓN'] == null) throw new Error('la base no tiene la columna STATUS REUNIÓN');
    Logger.log('  base "%s": %s filas con datos', RDV_HOJA_DESTINO, C.dest.filas.length);
  });
  _seccionColMail_(C, 'lectura de los mails', function () {
    C.mails = opciones.mails ? { fuente: '(lista de prueba)', lista: opciones.mails, errores: [] } : _leerMailsAudCan_(desde);
    C.r = agendaDesdeListaDeMails_(C.mails.lista, C.mails);
    C.version = new Map();   // id del mail → { g, i }
    C.r.semanas.forEach(function (g) { g.versiones.forEach(function (m, i) { if (m.id) C.version.set(m.id, { g: g, i: i }); }); });
    Logger.log('  mails: %s (%s) | con HTML: %s | semanas + grupo: %s', C.mails.lista.length, C.mails.fuente,
               C.mails.lista.filter(function (m) { return str(m.html); }).length, C.r.semanas.length);
    (C.mails.errores || []).forEach(function (e) { Logger.log('  AVISO de Gmail: %s', e); });
  });
  _seccionColMail_(C, 'lectura de la lista de IDs', function () {
    C.ids = leerListaIds_();
    Logger.log('  lista de IDs "%s": %s registros (%s)', C.ids.archivo, C.ids.registros.length,
               C.ids.solapas.map(function (s) { return s.solapa + ': ' + s.registros.length + (s.error ? ' — ' + s.error : ''); }).join(' | '));
  });

  _seccionColMail_(C, '1. la paleta', function () { _s1PaletaColMail_(C); });
  _seccionColMail_(C, '2. qué pasó con cada color', function () { _s2FamiliasColMail_(C); });
  _seccionColMail_(C, '3. el caso Macri 11/08 Villa Riachuelo', function () { _s3CasoColMail_(C); });
  _seccionColMail_(C, '4. las notas "Actualizo"', function () { _s4NotasColMail_(C); });
  _seccionColMail_(C, '5a. Hora: A CONFIRMAR', function () { _s5aHoraColMail_(C); });
  _seccionColMail_(C, '5b. (NO PARTICIPA)', function () { _s5bNoParticipaColMail_(C); });

  const resumen = _resumenColMail_(C);
  Logger.log('coloresMail: %s ms', Date.now() - t0);
  const plano = function (mapa) {
    return Array.from(mapa.values()).map(function (x) { return { raw: x.raw, hex: x.hex, familia: x.familia, tono: x.tono, letras: x.letras, mails: x.mails.size, reuniones: x.reuniones.size }; });
  };
  return { paleta: plano(C.paleta), colorTexto: plano(C.colorTexto), familias: C.familias,
           reuniones: C.ocurrencias.map(_ocurrenciaPlanaColMail_), fuera: C.fuera, caso: C.caso, notas: C.notas,
           horaAConfirmar: C.horaAConfirmar, noParticipa: C.noParticipa, resumen: resumen, errores: C.errores };
}

/** Una sección aislada: si falla, se dice y la auditoría sigue. */
function _seccionColMail_(C, nombre, fn) {
  try { fn(); } catch (err) {
    const m = String(err && err.message || err);
    Logger.log('>>> la sección "%s" FALLÓ: %s (las demás siguen)', nombre, m);
    C.errores.push(nombre + ': ' + m);
  }
}

// ===================== Los colores =====================

/**
 * Un valor de color CSS → `null` (no hay color: transparent, none, inherit, initial, unset, currentcolor, alfa 0, o no se
 * entiende) o `{ raw, hex, blanco, familia, tono }` (`blanco`: blanco o casi blanco, todos los canales ≥ 240: tapa el
 * fondo de afuera pero no es un resaltado).
 */
function _colorColMail_(valor) {
  const raw = str(valor).toLowerCase().replace(/\s*!important\s*$/, '').replace(/\s+/g, ' ').trim();
  if (!raw || /^(transparent|none|inherit|initial|unset|currentcolor|auto|revert)$/.test(raw)) return null;
  let rgb = null, alfa = 1;
  let m = /^#([0-9a-f]{3,8})$/.exec(raw);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) {
      rgb = [0, 1, 2].map(function (i) { return parseInt(h[i] + h[i], 16); });
      if (h.length === 4) alfa = parseInt(h[3] + h[3], 16) / 255;
    } else if (h.length === 6 || h.length === 8) {
      rgb = [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); });
      if (h.length === 8) alfa = parseInt(h.slice(6, 8), 16) / 255;
    } else return null;
  }
  if (!rgb) {
    m = /^rgba?\(\s*([^)]*)\)$/.exec(raw);
    if (m) {
      const partes = m[1].split(/\s*[,\/]\s*|\s+/).filter(Boolean);
      if (partes.length < 3) return null;
      rgb = partes.slice(0, 3).map(function (p) { return /%$/.test(p) ? Math.round(parseFloat(p) * 2.55) : Math.round(parseFloat(p)); });
      if (partes[3] != null) alfa = /%$/.test(partes[3]) ? parseFloat(partes[3]) / 100 : parseFloat(partes[3]);
      if (rgb.some(function (x) { return isNaN(x); })) return null;
    }
  }
  if (!rgb && COLORES_MAIL_NOMBRES[raw]) { const c = _colorColMail_(COLORES_MAIL_NOMBRES[raw]); if (c) c.raw = raw; return c; }
  if (!rgb) return null;
  if (!(alfa > 0)) return null;
  rgb = rgb.map(function (x) { return Math.max(0, Math.min(255, x)); });
  const hex = '#' + rgb.map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  const c = _familiaColMail_(rgb);
  return { raw: raw, hex: hex, blanco: c.blanco, familia: c.familia, tono: c.tono };
}

/** La familia de un color rgb: por el tono (HSL). Gris/negro y casi blanco aparte. */
function _familiaColMail_(rgb) {
  const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (Math.min(rgb[0], rgb[1], rgb[2]) >= 240) return { blanco: true, familia: 'BLANCO', tono: 'blanco' };
  if (d < 0.1) return { blanco: false, familia: 'OTRO', tono: max < 0.2 ? 'negro' : 'gris' };
  let h;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  if (h < 15 || h >= 340) return { blanco: false, familia: 'ROJO', tono: 'rojo' };
  if (h < 40) return { blanco: false, familia: 'OTRO', tono: 'naranja' };
  if (h < 70) return { blanco: false, familia: 'AMARILLO', tono: 'amarillo' };
  if (h < 170) return { blanco: false, familia: 'VERDE', tono: 'verde' };
  if (h < 200) return { blanco: false, familia: 'OTRO', tono: 'celeste' };
  if (h < 260) return { blanco: false, familia: 'OTRO', tono: 'azul' };
  return { blanco: false, familia: 'OTRO', tono: 'violeta/rosa' };
}

/** El primer color de un valor de "background" (shorthand): rgb()/rgba(), #hex o un nombre. */
function _colorDeFondoCortoColMail_(valor) {
  const toks = String(valor || '').toLowerCase().match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|[a-z]+/g) || [];
  for (let i = 0; i < toks.length; i++) {
    if (/^(transparent|none|inherit|initial|unset)$/.test(toks[i])) return null;
    const c = _colorColMail_(toks[i]);
    if (c) return c;
  }
  return null;
}

/**
 * El fondo y el color de texto que DECLARA un elemento: `{ fondo, color }` (cada uno `undefined` si no declara, o el
 * objeto de `_colorColMail_`). Primero las reglas de clase de <style>, después el atributo style (que manda), y los
 * atributos bgcolor / color (de <font>); <mark> sin fondo declarado es amarillo.
 */
function _declaracionColMail_(nombre, attrs, clases) {
  const out = { fondo: undefined, color: undefined };
  const aplicar = function (decls) {
    String(decls || '').split(';').forEach(function (d) {
      const i = d.indexOf(':');
      if (i < 0) return;
      const p = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim();
      if (p === 'background-color' || p === 'mso-highlight') { const c = _colorColMail_(v); if (c) out.fondo = c; }
      else if (p === 'background') { const c = _colorDeFondoCortoColMail_(v); if (c) out.fondo = c; }
      else if (p === 'color') { const c = _colorColMail_(v); if (c) out.color = c; }
    });
  };
  const attr = function (n) {
    const m = new RegExp('\\b' + n + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(attrs);
    return m ? (m[1] != null ? m[1] : (m[2] != null ? m[2] : m[3])) : null;
  };
  const bg = attr('bgcolor');
  if (bg != null) { const c = _colorColMail_(bg); if (c) out.fondo = c; }
  if (nombre === 'font') { const fc = attr('color'); if (fc != null) { const c = _colorColMail_(fc); if (c) out.color = c; } }
  const cls = attr('class');
  if (cls && clases) cls.split(/\s+/).forEach(function (k) { if (clases[k]) aplicar(clases[k]); });
  const st = attr('style');
  if (st != null) aplicar(_entidadesAudCan_(st));
  if (nombre === 'mark' && out.fondo === undefined) out.fondo = _colorColMail_('yellow');
  return out;
}

/** Las reglas de UNA clase de los bloques <style> (".x { … }", "span.x, p.y { … }") → { clase: declaraciones }. */
function _clasesDeEstiloColMail_(html) {
  const out = {};
  String(html || '').replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, function (x, css) {
    css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/([^{}]+)\{([^}]*)\}/g, function (y, sel, decls) {
      sel.split(',').forEach(function (s) {
        const m = /^\s*(?:[a-z][a-z0-9]*)?\.([\w-]+)\s*$/i.exec(s);
        if (m) out[m[1]] = (out[m[1]] ? out[m[1]] + ';' : '') + decls;
      });
      return y;
    });
    return x;
  });
  return out;
}

/**
 * El HTML de un mail a LÍNEAS con color: `[{ segs: [{ t, fondo, color }], cita }]`. El fondo de cada texto es el del
 * elemento más de adentro que declara uno (blanco tapa: queda sin fondo); el color de texto, igual. Los bloques (div, p,
 * br, li, tr, td de tabla no, h1-h6…) cortan línea; una cita (Gmail, Outlook) deja una línea marcada (`cita`), como en
 * diagnostico/31 (`_htmlATextoMarcadoAudCan_`).
 */
function _htmlALineasColMail_(html) {
  const clases = _clasesDeEstiloColMail_(html);
  const h = String(html || '').replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const vacios = { br: 1, img: 1, hr: 1, meta: 1, input: 1, wbr: 1, link: 1, col: 1, area: 1, base: 1 };
  const bloque = /^(div|p|br|li|tr|h[1-6]|table|ul|ol|blockquote|hr)$/;
  const pila = [], lineas = [];
  let actual = null;
  const nueva = function () { actual = { segs: [], cita: false }; lineas.push(actual); };
  nueva();
  const efectivo = function (k) {
    for (let i = pila.length - 1; i >= 0; i--) {
      const c = pila[i][k];
      if (c !== undefined) return c.blanco ? null : c;
    }
    return null;
  };
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(h)) !== null) {
    if (m[4] != null) {
      const t = _entidadesAudCan_(m[4].replace(/\s+/g, ' '));
      if (t) actual.segs.push({ t: t, fondo: efectivo('fondo'), color: efectivo('color') });
      continue;
    }
    const cierra = !!m[1], nombre = m[2].toLowerCase(), attrs = m[3] || '';
    if (bloque.test(nombre)) nueva();
    if (!cierra && (nombre === 'blockquote' || nombre === 'hr' || /class\s*=\s*["'][^"']*gmail_quote/i.test(attrs) || /divRplyFwdMsg/i.test(attrs) ||
                    /border-top\s*:\s*solid\s*#(e1e1e1|b5c4df)/i.test(attrs))) { actual.cita = true; nueva(); }
    if (vacios[nombre] || /\/\s*$/.test(attrs)) continue;
    if (!cierra) {
      const d = _declaracionColMail_(nombre, attrs, clases);
      pila.push({ nombre: nombre, fondo: d.fondo, color: d.color });
    } else {
      for (let i = pila.length - 1; i >= 0; i--) if (pila[i].nombre === nombre) { pila.length = i; break; }
    }
  }
  return lineas;
}

/** El texto de una línea (como lo vería el texto plano, sin limpiar). */
function _textoLineaColMail_(l) {
  return l.segs.map(function (s) { return s.t; }).join('').replace(/[ \t]+/g, ' ').trim();
}

/**
 * Las letras de una línea con cada color: `{ total, fondo: {FAMILIA: n}, fondoRaw: {raw: n}, texto: {FAMILIA: n},
 * textoRaw: {raw: n} }`. Sin la etiqueta ("Evento:", "Hora:", "Lugar:") ni los espacios. El color de texto gris/negro
 * (el de siempre) no cuenta.
 */
function _letrasColMail_(l) {
  const out = { total: 0, fondo: {}, fondoRaw: {}, texto: {}, textoRaw: {}, c: {} };
  const crudo = l.segs.map(function (s) { return s.t; }).join('');
  const et = /^[\s*_\-•·>]*(evento|hora|lugar|direcci[oó]n)\s*:/i.exec(crudo);
  let saltar = et ? et[0].length : 0;
  l.segs.forEach(function (s) {
    for (let i = 0; i < s.t.length; i++) {
      if (saltar > 0) { saltar--; continue; }
      if (/[\s*_]/.test(s.t[i])) continue;
      out.total++;
      if (s.fondo) {
        out.fondo[s.fondo.familia] = (out.fondo[s.fondo.familia] || 0) + 1;
        out.fondoRaw[s.fondo.raw] = (out.fondoRaw[s.fondo.raw] || 0) + 1;
        out.c[s.fondo.raw] = s.fondo;
      }
      if (s.color && !(s.color.familia === 'OTRO' && /gris|negro/.test(s.color.tono))) {
        out.texto[s.color.familia] = (out.texto[s.color.familia] || 0) + 1;
        out.textoRaw[s.color.raw] = (out.textoRaw[s.color.raw] || 0) + 1;
        out.c['t:' + s.color.raw] = s.color;
      }
    }
  });
  return out;
}

/** Suma `b` en `a` (cuentas de `_letrasColMail_`). */
function _sumarLetrasColMail_(a, b) {
  a.total += b.total;
  ['fondo', 'fondoRaw', 'texto', 'textoRaw'].forEach(function (k) { Object.keys(b[k]).forEach(function (x) { a[k][x] = (a[k][x] || 0) + b[k][x]; }); });
  Object.keys(b.c).forEach(function (x) { a.c[x] = b.c[x]; });
  return a;
}

function _letrasVaciasColMail_() { return { total: 0, fondo: {}, fondoRaw: {}, texto: {}, textoRaw: {}, c: {} }; }

/** "AMARILLO 12/14 (#ffff00)" de una cuenta, o '' si no tiene fondo. */
function _textoLetrasColMail_(x, k) {
  k = k || 'fondo';
  const fams = Object.keys(x[k]);
  if (!fams.length) return '';
  const raw = Object.keys(x[k + 'Raw']).join(', ');
  return fams.map(function (f) { return f + ' ' + x[k][f] + '/' + x.total; }).join(' + ') + ' (' + raw + ')';
}

/**
 * Los colores de un mail, por reunión: el HTML a líneas (en una respuesta o reenvío, sólo lo propio: `_propioDeHtmlAudCan_`),
 * línea por línea con las MISMAS reglas que `_parsearCuerpoAgenda_` (encabezado del día, "Evento:", "Hora:", "Lugar:",
 * continuación). La k-ésima línea "Evento:" es la k-ésima reunión que devuelve el parser sobre ese mismo texto. Devuelve
 * `{ evs, porReunion: Map(k → { campos: {día, Evento, Hora, Lugar, otra}, total }), fuera: [{ texto, letras }] }`.
 */
function _coloresDeMailColMail_(m) {
  let lineas = _htmlALineasColMail_(m.html);
  if (RE_RESPUESTA_AGENDA_.test(m.asunto || '')) {
    // _propioDeHtmlAudCan_ trabaja con textos: se le pasan objetos String con el índice de la línea, y devuelve un tramo
    const textos = lineas.map(function (l, i) { const s = new String((l.cita ? COLORES_MAIL_CITA : '') + _textoLineaColMail_(l)); s.i = i; return s; });
    const limpiaDe = function (x) { return String(x || '').split(COLORES_MAIL_CITA).join(''); };
    lineas = _propioDeHtmlAudCan_(textos, limpiaDe, m.asunto).map(function (s) { return lineas[s.i]; });
  }
  const porReunion = new Map(), fuera = [], textos = [];
  let k = -1, campo = null, dia = null;
  const anotar = function (kk, cmp, letras) {
    if (!porReunion.has(kk)) porReunion.set(kk, { campos: {}, total: _letrasVaciasColMail_() });
    const pr = porReunion.get(kk);
    pr.campos[cmp] = _sumarLetrasColMail_(pr.campos[cmp] || _letrasVaciasColMail_(), letras);
    _sumarLetrasColMail_(pr.total, letras);
  };
  lineas.forEach(function (l) {
    const crudo = _textoLineaColMail_(l);
    textos.push(crudo);
    const limpia = _limpiarLineaAgenda_(crudo);
    if (/^\[image:/i.test(limpia)) return;
    if (!limpia) { campo = null; return; }
    const letras = _letrasColMail_(l);
    const conColor = Object.keys(letras.fondo).length || Object.keys(letras.texto).length;
    if (/^(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s*,?\s*(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\s*[.:]?$/.test(normalizeText_(limpia))) {
      dia = conColor ? letras : null; campo = null;
      return;
    }
    const et = /^\s*(evento|hora|lugar|direcci[oó]n)\s*:\s*(.*)$/i.exec(limpia);
    if (et) {
      const e = normalizeText_(et[1]);
      if (e === 'evento') {
        k++; campo = 'Evento';
        if (dia) anotar(k, 'día', dia);
      } else if (k >= 0) campo = e === 'hora' ? 'Hora' : 'Lugar';
      if (conColor && k >= 0) anotar(k, campo || e, letras);
      else if (conColor) fuera.push({ texto: limpia, letras: letras });
      return;
    }
    if (conColor) {
      if (k >= 0 && campo) anotar(k, campo + ' (continuación)', letras);
      else fuera.push({ texto: limpia, letras: letras });
    }
  });
  const sem = _semanaAgenda_(m.asunto, m.cuerpo, m.fecha);
  const evs = _parsearCuerpoAgenda_(textos.join('\n'), m.fecha, _rVacio_(), { grupo: sem ? sem.grupo : '', semana: sem ? sem.texto : '',
    version: 0, versiones: 0, mailFecha: m.fecha, asunto: m.asunto, mailId: m.id || '', desde: sem ? sem.desde : null, hasta: sem ? sem.hasta : null });
  return { evs: evs, porReunion: porReunion, fuera: fuera, sem: sem };
}

/** La familia principal de una reunión (la de más letras de fondo) y si hay más de una. */
function _principalColMail_(total) {
  const fams = Object.keys(total.fondo).sort(function (a, b) { return total.fondo[b] - total.fondo[a]; });
  return { familia: fams[0] || '', otras: fams.slice(1) };
}

// ===================== 1. La paleta =====================

function _s1PaletaColMail_(C) {
  if (!C.r) throw new Error('no hay mails leídos');
  const lista = C.mails.lista;
  const conHtml = lista.filter(function (m) { return str(m.html); });
  let mailsConColor = 0;
  conHtml.forEach(function (m) {
    let res;
    try { res = _coloresDeMailColMail_(m); } catch (e) { C.errores.push('mail "' + m.asunto + '": ' + e); return; }
    const v = m.id ? C.version.get(m.id) : null;
    C.porMail.set(m.id || m.asunto + m.fecha, { m: m, res: res, v: v });
    if (res.porReunion.size || res.fuera.length) mailsConColor++;
    res.porReunion.forEach(function (pr, k) {
      const ev = res.evs[k];
      if (!ev) return;
      const p = _principalColMail_(pr.total);
      const rojoTexto = (pr.total.texto.ROJO || 0) > 0;
      const oc = { m: m, v: v, ev: ev, campos: pr.campos, total: pr.total, familia: p.familia, otras: p.otras, rojoTexto: rojoTexto };
      C.ocurrencias.push(oc);
      const clave = (ev.grupo || '') + '|' + (ev.semana || '') + '|' + ev.claveBase;
      Object.keys(pr.total.fondoRaw).forEach(function (raw) { _paletaColMail_(C.paleta, pr.total.c[raw], pr.total.fondoRaw[raw], m, clave); });
      Object.keys(pr.total.textoRaw).forEach(function (raw) { _paletaColMail_(C.colorTexto, pr.total.c['t:' + raw], pr.total.textoRaw[raw], m, clave); });
    });
    res.fuera.forEach(function (f) {
      C.fuera.push({ mail: _hhAudCan_(m.fecha), asunto: m.asunto, texto: f.texto.slice(0, 160), fondo: _textoLetrasColMail_(f.letras), texto_color: _textoLetrasColMail_(f.letras, 'texto') });
      Object.keys(f.letras.fondoRaw).forEach(function (raw) { _paletaColMail_(C.paleta, f.letras.c[raw], f.letras.fondoRaw[raw], m, null); });
      Object.keys(f.letras.textoRaw).forEach(function (raw) { _paletaColMail_(C.colorTexto, f.letras.c['t:' + raw], f.letras.textoRaw[raw], m, null); });
    });
  });
  Logger.log('--- 1. LA PALETA (color de FONDO de las líneas de cada reunión: background-color / background / bgcolor / mso-highlight / <mark>) ---');
  Logger.log('  mails: %s | con HTML: %s | con algún color: %s | reuniones resaltadas (mail × reunión): %s | líneas con color fuera de una reunión: %s',
             lista.length, conHtml.length, mailsConColor, C.ocurrencias.length, C.fuera.length);
  const logPaleta = function (mapa, titulo) {
    const xs = Array.from(mapa.values()).sort(function (a, b) { return (b.mails.size - a.mails.size) || (b.letras - a.letras); });
    Logger.log('  %s: %s valores distintos', titulo, xs.length);
    xs.forEach(function (x) {
      Logger.log('    %s → %s | %s (%s) | %s letras | %s mails | %s reuniones', x.raw, x.hex, x.familia, x.tono, x.letras, x.mails.size, x.reuniones.size);
    });
    const porFam = {};
    xs.forEach(function (x) { porFam[x.familia] = (porFam[x.familia] || 0) + x.reuniones.size; });
    Logger.log('    por familia (reuniones): %s', COLORES_MAIL_FAMILIAS.map(function (f) { return f + ' ' + (porFam[f] || 0); }).join(' | '));
  };
  logPaleta(C.paleta, 'FONDO');
  logPaleta(C.colorTexto, 'COLOR DEL TEXTO (aparte; sin gris/negro, que es el de siempre)');
  const rojoTexto = C.ocurrencias.filter(function (o) { return o.rojoTexto; });
  Logger.log('  reuniones con TEXTO ROJO (aparte del fondo): %s%s', rojoTexto.length,
             rojoTexto.length ? ' — de ésas, con fondo: ' + rojoTexto.filter(function (o) { return o.familia; }).length : '');
  rojoTexto.slice(0, COLORES_MAIL_MAX_EJEMPLOS).forEach(function (o) {
    Logger.log('    mail %s | %s | %s | texto rojo: %s', _hhAudCan_(o.m.fecha), o.ev.grupo, _evTextoAudCan_(o.ev), _textoLetrasColMail_(o.total, 'texto'));
  });
  if (C.fuera.length) {
    Logger.log('  líneas con color FUERA de una reunión (notas, encabezados): %s', C.fuera.length);
    C.fuera.slice(0, COLORES_MAIL_MAX_EJEMPLOS).forEach(function (f) {
      Logger.log('    mail %s | "%s" | fondo: %s | texto: %s', f.mail, f.texto, f.fondo || '—', f.texto_color || '—');
    });
  }
  Logger.log('  por reunión resaltada (mail | grupo, semana, versión | reunión | color por línea):');
  C.ocurrencias.slice(0, 3 * COLORES_MAIL_MAX_EJEMPLOS).forEach(function (o) {
    Logger.log('    [%s%s] mail %s | %s, semana %s, %s | %s | %s', o.familia || 'sin fondo', o.otras.length ? ' + ' + o.otras.join(' + ') : '', _hhAudCan_(o.m.fecha),
               o.ev.grupo, o.ev.semana, o.v ? 'v' + (o.v.i + 1) + '/' + o.v.g.versiones.length : 'sin versión', _evTextoAudCan_(o.ev), _camposTextoColMail_(o.campos));
  });
  if (C.ocurrencias.length > 3 * COLORES_MAIL_MAX_EJEMPLOS) Logger.log('    … y %s más', C.ocurrencias.length - 3 * COLORES_MAIL_MAX_EJEMPLOS);
  C.cuentasPaleta = { mails: lista.length, conHtml: conHtml.length, mailsConColor: mailsConColor, reuniones: C.ocurrencias.length, rojoTexto: rojoTexto.length };
}

function _paletaColMail_(mapa, c, letras, m, clave) {
  if (!c) return;
  if (!mapa.has(c.raw)) mapa.set(c.raw, { raw: c.raw, hex: c.hex, familia: c.familia, tono: c.tono, letras: 0, mails: new Set(), reuniones: new Set() });
  const x = mapa.get(c.raw);
  x.letras += letras;
  x.mails.add(m.id || m.asunto + m.fecha);
  if (clave) x.reuniones.add(clave);
}

/** "día AMARILLO 8/8; Evento VERDE 40/42 (entera); Hora —" */
function _camposTextoColMail_(campos) {
  return Object.keys(campos).map(function (k) {
    const x = campos[k];
    const p = _principalColMail_(x);
    const entera = p.familia && x.total && x.fondo[p.familia] / x.total >= COLORES_MAIL_ENTERA;
    return k + ' ' + (_textoLetrasColMail_(x) || 'sin fondo') + (entera ? ' (entera)' : (p.familia ? ' (parcial)' : '')) +
           (Object.keys(x.texto).length ? ' | texto ' + _textoLetrasColMail_(x, 'texto') : '');
  }).join('; ');
}

function _ocurrenciaPlanaColMail_(o) {
  return { mail: _hhAudCan_(o.m.fecha), asunto: o.m.asunto, grupo: o.ev.grupo, semana: o.ev.semana, reunion: _evTextoAudCan_(o.ev),
           claveBase: o.ev.claveBase, familia: o.familia, otras: o.otras, rojoTexto: o.rojoTexto, campos: _camposTextoColMail_(o.campos),
           version: o.v ? o.v.i + 1 : null, versiones: o.v ? o.v.g.versiones.length : null, despues: o.despues || null };
}

// ===================== 2. Qué pasó con cada color =====================

/** Las reuniones de cada versión de una semana + grupo, parseadas una vez (el texto propio, como la agenda). */
function _versionesColMail_(C, g) {
  C._parseadas = C._parseadas || new Map();
  const k = g.grupo + '|' + g.semanaTexto;
  if (!C._parseadas.has(k)) {
    C._parseadas.set(k, g.versiones.map(function (m, i) {
      return _parsearCuerpoAgenda_(m.cuerpo, m.fecha, _rVacio_(), { grupo: g.grupo, semana: g.semanaTexto, version: i + 1, versiones: g.versiones.length,
                                   mailFecha: m.fecha, asunto: m.asunto, mailId: m.id || '', desde: g.desde, hasta: g.hasta });
    }));
  }
  return C._parseadas.get(k);
}

/** La reunión `ev` en una lista (la misma claveBase; con varias, la de la misma hora). */
function _buscarColMail_(lista, ev) {
  const c = lista.filter(function (x) { return x.claveBase === ev.claveBase; });
  if (c.length <= 1) return c[0] || null;
  return c.filter(function (x) { return x.hora === ev.hora; })[0] || c[0];
}

/**
 * Lo que pasó en el MAIL con una reunión resaltada en la versión `i` de su semana + grupo: contra la anterior (`antes`:
 * 'NUEVA' | 'cambió: …' | 'igual' | 'primera versión') y contra las siguientes (`despues`: 'es la última versión' |
 * 'siguió igual' | 'cambió después: …' | 'desapareció (…)' | 'falta en una respuesta, sigue'), y si se movió.
 */
function _mailDespuesColMail_(C, o) {
  if (!o.v) return { antes: '(el mail no es una versión: sin semana o sin agenda propia)', despues: '', etiquetaAntes: 'sin versión', etiquetaDespues: 'sin versión' };
  const g = o.v.g, i = o.v.i, ps = _versionesColMail_(C, g);
  const propia = _buscarColMail_(ps[i], o.ev) || o.ev;
  let prev = null, jPrev = -1;
  for (let j = i - 1; j >= 0 && !prev; j--) { prev = _buscarColMail_(ps[j], o.ev); jPrev = j; }
  let antes, etiquetaAntes;
  if (i === 0) { antes = 'primera versión de su semana (no hay anterior)'; etiquetaAntes = 'primera versión'; }
  else if (!prev) {
    // ¿un cambio de día? la misma figura estaba en la versión anterior en otra fecha y en ésta ya no
    const antes0 = !o.ev.figuraFila ? [] : ps[i - 1].filter(function (x) {
      return x.figuraFila === o.ev.figuraFila && x.claveBase !== o.ev.claveBase && !_buscarColMail_(ps[i], x);
    });
    antes = 'NUEVA: no estaba en las versiones anteriores' + (antes0.length ? ' (¿CAMBIO DE DÍA? en la v' + i + ' la figura estaba el ' +
            antes0.map(function (x) { return fmtFecha_(x.fecha) + ' ' + (x.hora || '--:--'); }).join(' / ') + ' y en ésta ya no)' : '');
    etiquetaAntes = antes0.length ? 'NUEVA (¿cambio de día?)' : 'NUEVA';
  }
  else {
    const c = _cambiosEntre_(prev, propia);
    const evTxt = normalizeText_(prev.eventoTexto) !== normalizeText_(propia.eventoTexto) ? 'evento "' + prev.eventoTexto + '" → "' + propia.eventoTexto + '"' : '';
    const todo = [c, evTxt].filter(Boolean).join('; ');
    antes = todo ? 'CAMBIÓ contra la v' + (jPrev + 1) + ': ' + todo : 'igual que en la versión anterior';
    etiquetaAntes = todo ? 'cambió' : 'igual';
  }
  const n = g.versiones.length;
  const pasos = [];
  let ultimaVista = i, cambio = '';
  for (let j = i + 1; j < n; j++) {
    const x = _buscarColMail_(ps[j], o.ev);
    const resp = RE_RESPUESTA_AGENDA_.test(g.versiones[j].asunto || '');
    if (x) {
      const c = _cambiosEntre_(propia, x);
      if (c && !cambio) cambio = 'v' + (j + 1) + ': ' + c;
      pasos.push('v' + (j + 1) + (resp ? ' (respuesta)' : '') + ': ' + (c ? 'cambió (' + c + ')' : 'igual'));
      ultimaVista = j;
    } else pasos.push('v' + (j + 1) + (resp ? ' (respuesta)' : '') + ': NO ESTÁ');
  }
  const enEstado = C.r.ultimas.some(function (u) { return u.grupo === g.grupo && u.semana === g.semanaTexto && u.claveBase === o.ev.claveBase; });
  const desap = C.r.desaparecidas.filter(function (d) { return d.grupo === g.grupo && d.semana === g.semanaTexto && d.claveBase === o.ev.claveBase; })[0];
  let despues, etiquetaDespues;
  if (i === n - 1) { despues = 'es la última versión'; etiquetaDespues = 'última versión'; }
  else if (enEstado) {
    despues = (cambio ? 'cambió después (' + cambio + ')' : 'siguió igual') + (ultimaVista < n - 1 ? '; falta en alguna respuesta posterior pero SIGUE' : '');
    etiquetaDespues = cambio ? 'cambió después' : 'siguió igual';
  } else {
    despues = 'DESAPARECIÓ' + (desap && desap.versionQueLaSaco ? ' (la sacó la v' + desap.versionQueLaSaco + ' del ' + _hhAudCan_(desap.mailQueLaSaco) +
              (desap.futuraAlDesaparecer ? ', siendo futura' : ', ya había pasado') + ')' : '');
    etiquetaDespues = 'desapareció';
  }
  let movida = '';
  if (!enEstado || i === n - 1) {
    const otras = C.r.unicas.filter(function (u) {
      return o.ev.figuraFila && u.figuraFila === o.ev.figuraFila && u.fecha && o.ev.fecha && ymd_(u.fecha) !== ymd_(o.ev.fecha) &&
             Math.abs(diasEntre_(u.fecha, o.ev.fecha)) <= COLORES_MAIL_DIAS_MOVIDA;
    });
    if (otras.length) movida = 'otras de la figura en el mail a ±' + COLORES_MAIL_DIAS_MOVIDA + ' días: ' +
      otras.map(function (u) { return fmtFecha_(u.fecha) + ' ' + (u.hora || '--:--') + ' ' + (u.lugar || '') + ' (' + u.grupo + ', semana ' + u.semana + ')'; }).join(' / ');
  }
  return { antes: antes, etiquetaAntes: etiquetaAntes, despues: despues + (pasos.length ? ' [' + pasos.join('; ') + ']' : ''), etiquetaDespues: etiquetaDespues, movida: movida };
}

/** La base: las filas de la reunión ese día (como la auditoría de cancelaciones) y otras de la figura a ±COLORES_MAIL_DIAS_BASE. */
function _baseColMail_(C, ev) {
  if (!C.dest) return { etiqueta: 'base no leída', texto: 'la base no se pudo leer', filas: [] };
  const filas = _filasDeEventoAudCan_(C, ev);
  let etiqueta;
  if (!filas.length) etiqueta = 'SIN FILA';
  else if (filas.length > 1) etiqueta = 'AMBIGUA';
  else {
    const st = str(_valAudCan_(C, filas[0], 'STATUS REUNIÓN'));
    etiqueta = st || '(STATUS vacío)';
    if (normStatus_(st) !== 'realizada' && numOcero_(_asisAudCan_(C, filas[0])) > 0) etiqueta += ' + Asistentes';
  }
  const figs = (ev.figuras || []).map(normalizeText_);
  const enLas = filas.map(function (f) { return f.fila; });
  const otras = !figs.length || !ev.fecha ? [] : C.dest.filas.filter(function (f) {
    return f.fecha && enLas.indexOf(f.fila) < 0 && figs.indexOf(normalizeText_(f.figura)) >= 0 && ymd_(f.fecha) !== ymd_(ev.fecha) &&
           Math.abs(diasEntre_(f.fecha, ev.fecha)) <= COLORES_MAIL_DIAS_BASE;
  });
  const texto = (filas.length ? filas.map(function (f) { return _filaTextoAudCan_(C, f); }).join(' // ') : 'SIN FILA ese día') +
    (otras.length ? ' | otras de la figura a ±' + COLORES_MAIL_DIAS_BASE + ' días: ' +
      otras.map(function (f) { return 'fila ' + f.fila + ' ' + fmtFecha_(f.fecha) + ' ' + (f.barrio || 'sin barrio') + ' ' + (str(_valAudCan_(C, f, 'STATUS REUNIÓN')) || '(vacío)'); }).join(', ') : '');
  return { etiqueta: etiqueta, texto: texto, filas: filas, otras: otras };
}

/**
 * La lista de IDs: los registros de alguna de las figuras de la reunión a ±COLORES_MAIL_DIAS_ID días. Si alguno tiene un
 * lugar que coincide (la regla de los tres niveles), sólo ésos. `etiqueta`: 'ID misma fecha' | 'ID otra fecha' | 'sin ID'.
 */
function _idsColMail_(C, ev) {
  if (!C.ids) return { etiqueta: 'lista no leída', texto: 'la lista de IDs no se pudo leer', registros: [] };
  const figs = (ev.figuras || []).map(normalizeText_);
  if (!figs.length || !ev.fecha) return { etiqueta: 'sin figura', texto: 'sin figura o sin fecha: no se busca', registros: [] };
  let rs = C.ids.registros.filter(function (r) {
    return r.fecha && r.quien && (r.quien.norm || []).some(function (n) { return figs.indexOf(n) >= 0; }) &&
           Math.abs(diasEntre_(r.fecha, ev.fecha)) <= COLORES_MAIL_DIAS_ID;
  });
  const uEv = ubicacionDeEvento_(ev);
  const mismoLugar = rs.filter(function (r) { return r.lugar && compararUbicacion_(uEv, r.lugar.u).coincide === true; });
  const conLugar = mismoLugar.length > 0;
  if (conLugar) rs = mismoLugar;
  rs.sort(function (a, b) { return Math.abs(diasEntre_(a.fecha, ev.fecha)) - Math.abs(diasEntre_(b.fecha, ev.fecha)); });
  if (!rs.length) return { etiqueta: 'sin ID', texto: 'sin ID de la figura a ±' + COLORES_MAIL_DIAS_ID + ' días', registros: [] };
  const misma = rs.some(function (r) { return ymd_(r.fecha) === ymd_(ev.fecha); });
  return { etiqueta: misma ? 'ID misma fecha' : 'ID otra fecha', registros: rs,
           texto: (conLugar ? '(mismo lugar) ' : '(lugar no comparable o distinto) ') + rs.slice(0, 4).map(function (r) {
             return r.idTexto + ' ' + fmtFecha_(r.fecha) + ' (' + (diasEntre_(r.fecha, ev.fecha) >= 0 ? '+' : '') + diasEntre_(r.fecha, ev.fecha) + ' d) "' +
                    r.lugarTexto + '" [' + r.solapa + ' fila ' + r.filaLista + ']';
           }).join(' / ') + (rs.length > 4 ? ' … (' + rs.length + ')' : '') };
}

function _s2FamiliasColMail_(C) {
  if (!C.ocurrencias) throw new Error('no se armó la paleta');
  // una reunión por familia + semana + grupo + clave: la primera ocurrencia (para "antes") y la última (para "después")
  const unicas = new Map();
  C.ocurrencias.forEach(function (o) {
    if (!o.familia) return;
    const k = o.familia + '|' + o.ev.grupo + '|' + o.ev.semana + '|' + o.ev.claveBase;
    if (!unicas.has(k)) unicas.set(k, { familia: o.familia, primera: o, ultima: o, veces: 0 });
    const u = unicas.get(k);
    u.veces++;
    if (o.m.fecha < u.primera.m.fecha) u.primera = o;
    if (o.m.fecha >= u.ultima.m.fecha) u.ultima = o;
  });
  Logger.log('--- 2. QUÉ PASÓ CON CADA COLOR (una reunión por familia + semana + grupo: la versión anterior, las siguientes, la base y la lista de IDs) ---');
  COLORES_MAIL_FAMILIAS.forEach(function (fam) {
    const us = Array.from(unicas.values()).filter(function (u) { return u.familia === fam; })
      .sort(function (a, b) { return (a.primera.ev.fecha || 0) - (b.primera.ev.fecha || 0); });
    const F = { reuniones: us.length, antes: {}, despues: {}, base: {}, ids: {}, alertas: [], casos: [] };
    C.familias[fam] = F;
    Logger.log('  == %s: %s reuniones ==', fam, us.length);
    us.forEach(function (u) {
      const o = u.primera, ev = o.ev;
      const a = _mailDespuesColMail_(C, o);
      const d = u.ultima === o ? a : _mailDespuesColMail_(C, u.ultima);
      const b = _baseColMail_(C, ev);
      const id = _idsColMail_(C, ev);
      o.despues = d.etiquetaDespues;
      const sumar = function (obj, k) { obj[k] = (obj[k] || 0) + 1; };
      sumar(F.antes, a.etiquetaAntes); sumar(F.despues, d.etiquetaDespues); sumar(F.base, b.etiqueta); sumar(F.ids, id.etiqueta);
      const st = normStatus_(b.etiqueta.replace(/ \+ Asistentes$/, ''));
      let alerta = '';
      if (fam === 'ROJO' && (st === 'realizada' || /Asistentes/.test(b.etiqueta))) alerta = 'ROJO pero la base dice que se HIZO';
      if (fam === 'VERDE' && a.etiquetaAntes === 'igual') alerta = 'VERDE pero ya estaba igual en la versión anterior';
      if (fam === 'AMARILLO' && a.etiquetaAntes === 'igual') alerta = 'AMARILLO pero no cambió contra la versión anterior';
      if (alerta) F.alertas.push(alerta + ': ' + _evTextoAudCan_(ev));
      Logger.log('  [%s] %s | %s, semana %s | resaltada en %s mail(s), la primera v%s/%s (%s) | %s%s', fam, _evTextoAudCan_(ev), ev.grupo, ev.semana, u.veces,
                 o.v ? o.v.i + 1 : '?', o.v ? o.v.g.versiones.length : '?', _hhAudCan_(o.m.fecha), _camposTextoColMail_(o.campos), alerta ? ' | (!) ' + alerta : '');
      Logger.log('      antes: %s', a.antes);
      Logger.log('      después (mail): %s%s', d.despues, d.movida ? ' | ' + d.movida : '');
      Logger.log('      base: %s', b.texto);
      Logger.log('      lista de IDs: %s', id.texto);
      F.casos.push({ reunion: _evTextoAudCan_(ev), grupo: ev.grupo, semana: ev.semana, antes: a.etiquetaAntes, despues: d.etiquetaDespues,
                     base: b.etiqueta, filas: b.filas.map(function (f) { return f.fila; }), ids: id.etiqueta, alerta: alerta });
    });
    F.linea = fam + ': ' + us.length + ' reuniones → base: ' + _repartoTextoColMail_(F.base, fam === 'ROJO') + ' | mail después: ' + _repartoTextoColMail_(F.despues) +
              ' | contra la versión anterior: ' + _repartoTextoColMail_(F.antes) + ' | IDs: ' + _repartoTextoColMail_(F.ids);
    Logger.log('  => %s', F.linea);
    F.alertas.forEach(function (x) { Logger.log('     (!) %s', x); });
  });
}

/** "5 Suspendida, 1 Realizada (!)": con `marcarHecha` (el ROJO), una reunión que se hizo lleva "(!)". */
function _repartoTextoColMail_(o, marcarHecha) {
  const ks = Object.keys(o).sort(function (a, b) { return o[b] - o[a]; });
  return ks.length ? ks.map(function (k) { return o[k] + ' ' + k + (marcarHecha && (/^realizada/i.test(k) || /Asistentes/.test(k)) ? ' (!)' : ''); }).join(', ') : '—';
}

// ===================== 3. El caso: Macri 11/08 Villa Riachuelo =====================

function _s3CasoColMail_(C) {
  if (!C.r) throw new Error('no hay mails leídos');
  const K = COLORES_MAIL_CASO, fig = normalizeText_(K.figura), fecha = toDate_(K.fecha), barrio = normalizeText_(K.barrio);
  const caso = C.caso = { versiones: [], estadoFinal: '', base: [], baseBarrio: [], ids: [], idsDelDia: [] };
  Logger.log('--- 3. EL CASO: %s, %s, %s (mail del %s, grupo %s) ---', K.figura, fmtFecha_(fecha), K.barrio, fmtFecha_(toDate_(K.mail)), K.grupo);
  // en cada versión de cada semana + grupo
  let unaEv = null;
  C.r.semanas.forEach(function (g) {
    const ps = _versionesColMail_(C, g);
    ps.forEach(function (p, i) {
      p.filter(function (x) { return x.fecha && ymd_(x.fecha) === ymd_(fecha) && (x.figuras || []).map(normalizeText_).indexOf(fig) >= 0; }).forEach(function (x) {
        unaEv = unaEv || x;
        const m = g.versiones[i];
        const oc = C.ocurrencias.filter(function (o) { return o.m === m || (o.m.id && o.m.id === m.id); })
          .filter(function (o) { return o.ev.claveBase === x.claveBase && (!x.hora || o.ev.hora === x.hora); })[0];
        const t = 'v' + (i + 1) + '/' + g.versiones.length + ' "' + m.asunto + '" (' + _hhAudCan_(m.fecha) + ') | ' + _evTextoAudCan_(x) + ' | Evento: ' + x.eventoTexto +
                  ' | color: ' + (oc ? (oc.familia || 'sin fondo') + ' — ' + _camposTextoColMail_(oc.campos) : (str(m.html) ? 'sin color' : 'sin HTML'));
        caso.versiones.push(t);
        Logger.log('  %s', t);
      });
    });
  });
  if (!caso.versiones.length) Logger.log('  ninguna versión de ningún mail trae a %s el %s', K.figura, fmtFecha_(fecha));
  const final = C.r.ultimas.filter(function (u) { return u.fecha && ymd_(u.fecha) === ymd_(fecha) && normalizeText_(u.figuraFila) === fig; });
  const des = C.r.desaparecidas.filter(function (u) { return u.fecha && ymd_(u.fecha) === ymd_(fecha) && normalizeText_(u.figuraFila) === fig; });
  caso.estadoFinal = final.length ? 'SIGUE en el estado final del mail (' + final.map(_evTextoAudCan_).join(' / ') + ')' :
    (des.length ? 'DESAPARECIÓ: ' + des.map(function (d) { return 'la sacó la v' + d.versionQueLaSaco + ' (' + _hhAudCan_(d.mailQueLaSaco) + ', "' + d.asuntoQueLaSaco + '")'; }).join(' / ')
                : 'no está en el estado final ni en las desaparecidas');
  Logger.log('  mail: %s', caso.estadoFinal);
  if (C.dest) {
    const ev = unaEv || { fecha: fecha, figuras: [K.figura], hora: '', lugarTexto: '' };
    const b = _baseColMail_(C, ev);
    caso.base = b.filas.map(function (f) { return f.fila; });
    caso.baseTexto = b.texto;
    Logger.log('  base, ese día: %s', b.texto);
    const delBarrio = C.dest.filas.filter(function (f) { return normalizeText_(f.figura) === fig && normalizeText_(f.barrio) === barrio; });
    caso.baseBarrio = delBarrio.map(function (f) { return f.fila; });
    Logger.log('  base, %s en %s (cualquier fecha): %s', K.figura, K.barrio, delBarrio.length ? delBarrio.map(function (f) { return _filaTextoAudCan_(C, f); }).join(' // ') : 'ninguna');
  } else Logger.log('  base: no se pudo leer');
  if (C.ids) {
    const deFig = C.ids.registros.filter(function (r) { return r.fecha && r.quien && (r.quien.norm || []).indexOf(fig) >= 0; });
    const enBarrio = deFig.filter(function (r) { return normalizeText_(r.lugarTexto).indexOf(barrio) >= 0 || (r.lugar && r.lugar.u && normalizeText_(r.lugar.u.barrio || '') === barrio); });
    const delDia = deFig.filter(function (r) { return ymd_(r.fecha) === ymd_(fecha); });
    const t = function (r) { return r.idTexto + ' ' + fmtFecha_(r.fecha) + ' "' + r.lugarTexto + '"' + (r.tipoTexto ? ' ' + r.tipoTexto : '') + ' [' + r.solapa + ' fila ' + r.filaLista + ']'; };
    caso.ids = enBarrio.map(t); caso.idsDelDia = delDia.map(t);
    Logger.log('  lista de IDs, %s en %s (cualquier fecha): %s', K.figura, K.barrio, enBarrio.length ? enBarrio.map(t).join(' / ') : 'ninguno');
    Logger.log('  lista de IDs, %s el %s (cualquier lugar): %s', K.figura, fmtFecha_(fecha), delDia.length ? delDia.map(t).join(' / ') : 'ninguno');
  } else Logger.log('  lista de IDs: no se pudo leer');
}

// ===================== 4. Las notas "Actualizo" =====================

function _s4NotasColMail_(C) {
  if (!C.mails) throw new Error('no hay mails leídos');
  const reDia = /^(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s*,?\s*(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\s*[.:]?$/;
  let conPalabra = 0;
  Logger.log('--- 4. LAS NOTAS de arriba del cuerpo ("Actualizo: …") y las líneas sueltas dentro de la agenda ---');
  Logger.log('    (el parser ignora lo que está antes del primer día, y una línea suelta después de un campo la PEGA a ese campo: 41_AgendaParser.js:350)');
  C.mails.lista.forEach(function (m) {
    const propio = _cuerpoPropioAgenda_(m.asunto, m.cuerpo).texto;
    const sem = _semanaAgenda_(m.asunto, m.cuerpo, m.fecha);
    const lineas = propio.split(/\r?\n/).map(_limpiarLineaAgenda_);
    const arriba = [], sueltas = [];
    let visto = false, campo = false;
    lineas.forEach(function (l) {
      if (!l) { campo = false; return; }
      if (/^\[image:/i.test(l)) return;
      if (reDia.test(normalizeText_(l))) { visto = true; campo = false; return; }
      if (/^\s*(evento|hora|lugar|direcci[oó]n)\s*:/i.test(l)) { campo = true; return; }
      if (!visto) { arriba.push(l); return; }
      if (normalizeText_(l).match(COLORES_MAIL_PALABRAS)) sueltas.push((campo ? '(pegada al campo de arriba) ' : '') + l);
    });
    const nota = arriba.join(' / ').slice(0, 400);
    if (!nota && !sueltas.length) return;
    const palabras = (normalizeText_(nota + ' ' + sueltas.join(' ')).match(COLORES_MAIL_PALABRAS) || []).filter(function (x, i, a) { return a.indexOf(x) === i; });
    if (palabras.length) conPalabra++;
    const n = { mail: _hhAudCan_(m.fecha), asunto: m.asunto, grupo: sem ? sem.grupo : '(sin semana)', semana: sem ? sem.texto : '', nota: nota, sueltas: sueltas, palabras: palabras };
    C.notas.push(n);
    Logger.log('  %s mail %s | %s, semana %s | nota: %s%s', palabras.length ? '[MARCA: ' + palabras.join(', ') + ']' : '[nota]', n.mail, n.grupo, n.semana || '—',
               nota || '(ninguna arriba)', sueltas.length ? ' | dentro de la agenda: ' + sueltas.join(' // ') : '');
  });
  Logger.log('  mails con nota: %s | que hablan de suspender / cancelar / cambiar el día / reprogramar / postergar / "a confirmar": %s', C.notas.length, conPalabra);
  C.cuentasNotas = { conNota: C.notas.length, conPalabra: conPalabra };
}

// ===================== 5. Otros: "Hora: A CONFIRMAR" y "(NO PARTICIPA)" =====================

/** Las reuniones de TODAS las versiones (texto propio, como la agenda), sin repetir la misma reunión con el mismo texto. */
function _todasColMail_(C) {
  if (C._todas) return C._todas;
  const vistas = {}, out = [];
  C.r.semanas.forEach(function (g) {
    _versionesColMail_(C, g).forEach(function (p) {
      p.forEach(function (ev) {
        const k = g.grupo + '|' + g.semanaTexto + '|' + ev.claveBase + '|' + normalizeText_(ev.eventoTexto) + '|' + normalizeText_(ev.horaTexto);
        if (vistas[k]) return;
        vistas[k] = true;
        out.push(ev);
      });
    });
  });
  C._todas = out;
  return out;
}

function _s5aHoraColMail_(C) {
  if (!C.r) throw new Error('no hay mails leídos');
  const todas = _todasColMail_(C);
  const aConf = todas.filter(function (ev) { return /\ba (confirmar|definir)\b/.test(normalizeText_(ev.horaTexto)); });
  const sinHora = todas.filter(function (ev) { return !ev.hora; });
  // claves repetidas dentro de una versión (dos reuniones de la figura el mismo día sin hora: claveBase + '|' + '')
  let choques = 0;
  C.r.semanas.forEach(function (g) {
    _versionesColMail_(C, g).forEach(function (p) {
      const c = {};
      p.forEach(function (ev) { c[ev.clave] = (c[ev.clave] || 0) + 1; });
      Object.keys(c).forEach(function (k) { if (c[k] > 1) choques += c[k] - 1; });
    });
  });
  const H = C.horaAConfirmar = { reuniones: todas.length, aConfirmar: aConf.length, sinHora: sinHora.length,
    parsean: aConf.filter(function (ev) { return ev.fecha && (ev.figuraFila || ev.tipo); }).length, conMarca: aConf.filter(function (ev) { return (ev.marcas || []).some(function (x) { return /A CONFIRMAR/.test(x); }); }).length,
    horas: aConf.map(function (ev) { return ev.hora; }), choquesDeClave: choques, ejemplos: [] };
  Logger.log('--- 5a. "Hora: A CONFIRMAR" ---');
  Logger.log('  reuniones (todas las versiones, sin repetir): %s | con "A CONFIRMAR" (o "a definir") en la hora: %s | sin hora (por cualquier motivo): %s',
             todas.length, aConf.length, sinHora.length);
  Logger.log('  qué hace el parser: _horaAgenda_ (41_AgendaParser.js:623-630) no encuentra "hh:mm" ni "hh hs" → hora ""; la reunión SE PARSEA IGUAL ' +
             '(la crea la línea "Evento:"; la clave es figura + fecha, 41_AgendaParser.js:487-489) y sólo se cuenta en "sin hora" (línea 315). ' +
             'La marca "A CONFIRMAR" (AGENDA_MARCAS) se busca en el evento y el lugar, NO en la hora (líneas 413-419). La agenda escribe la HORA vacía (horaAgendaEquipo_).');
  Logger.log('  de las %s: con fecha y figura/tipo (se parsean bien): %s | hora que dio el parser: %s | con la marca "A CONFIRMAR" (por el evento o el lugar): %s',
             aConf.length, H.parsean, aConf.length ? Object.keys(H.horas.reduce(function (a, h) { a[h === '' ? '""' : h] = 1; return a; }, {})).join(', ') : '—', H.conMarca);
  Logger.log('  claves repetidas dentro de una versión (la clave suma la hora desde la SEGUNDA reunión de la figura ese día, 41_AgendaParser.js:359-364: ' +
             'con 3+ reuniones y dos de ésas sin hora o con la misma hora, chocan y una pisa a la otra en el estado): %s', choques);
  aConf.slice(0, COLORES_MAIL_MAX_EJEMPLOS).forEach(function (ev) {
    let base = '';
    if (C.dest) {
      const f = _filasDeEventoAudCan_(C, ev);
      base = f.length === 1 ? 'fila ' + f[0].fila + ', HORA "' + (valorAgendaComparable_(_valAudCan_(C, f[0], 'HORA'), 'HORA') || '') + '"' : (f.length ? f.length + ' filas' : 'sin fila');
    }
    const t = _evTextoAudCan_(ev) + ' | ' + ev.grupo + ', semana ' + ev.semana + ' | Hora: "' + ev.horaTexto + '" → hora "' + ev.hora + '" | clave ' + ev.clave + (base ? ' | base: ' + base : '');
    H.ejemplos.push(t);
    Logger.log('    %s', t);
  });
}

function _s5bNoParticipaColMail_(C) {
  if (!C.r) throw new Error('no hay mails leídos');
  const todas = _todasColMail_(C).filter(function (ev) { return /\bno participa\b/.test(normalizeText_(ev.eventoTexto)); });
  const N = C.noParticipa = { reuniones: todas.length, alFinal: 0, filaANombreDeNoParticipa: 0, ejemplos: [] };
  Logger.log('--- 5b. "(NO PARTICIPA)" en el evento ---');
  Logger.log('  cómo la asigna el parser (41_AgendaParser.js:422-433): por cada "no participa", la figura nombrada INMEDIATAMENTE ANTES (la de fin más ' +
             'cercano antes de la marca); si no hay ninguna antes, la primera después. ev.noParticipa = esas; ev.participan = las demás; la fila va a ' +
             'nombre de ev.figuras[0] (línea 434), participe o no. La agenda busca filas parecidas con ev.participan (40_Agenda.js:312).');
  todas.forEach(function (ev) {
    const n = normalizeText_(ev.eventoTexto);
    let sinTipo = n;
    for (let i = 0; i < AGENDA_TIPOS.length; i++) {
      const mt = AGENDA_TIPOS[i].re.exec(n);
      if (mt) { sinTipo = n.slice(0, mt.index) + ' '.repeat(mt[0].length) + n.slice(mt.index + mt[0].length); break; }
    }
    const figs = _figurasConPosicion_(sinTipo);
    const re = /\bno participa\b/g;
    const marcas = [];
    let mm;
    while ((mm = re.exec(n)) !== null) {
      let mejor = null;
      figs.forEach(function (f) { if (f.fin <= mm.index && (!mejor || f.fin > mejor.fin)) mejor = f; });
      let pos;
      if (mejor) {
        const entre = n.slice(mejor.fin, mm.index);
        const alFinal = /[a-z0-9]/.test(entre) && !figs.some(function (f) { return f.pos > mejor.fin && f.pos < mm.index; });
        pos = alFinal ? 'AL FINAL, después de "' + entre.replace(/[()]/g, '').trim() + '": el parser se la asigna a la última figura nombrada (' + mejor.canon + ')'
                      : 'pegada a ' + mejor.canon;
        if (alFinal) N.alFinal++;
      } else {
        const despues = figs.filter(function (f) { return f.pos >= mm.index; })[0];
        pos = 'antes de toda figura: el parser se la asigna a la primera después (' + (despues ? despues.canon : 'ninguna') + ')';
      }
      marcas.push(pos);
    }
    const aNombre = ev.figuraFila && (ev.noParticipa || []).indexOf(ev.figuraFila) >= 0;
    if (aNombre) N.filaANombreDeNoParticipa++;
    const t = fmtFecha_(ev.fecha) + ' ' + (ev.hora || '--:--') + ' | ' + ev.grupo + ', semana ' + ev.semana + ' | Evento: ' + ev.eventoTexto + ' | figuras: ' +
              (ev.figuras || []).join(' + ') + ' | NO participa: ' + ((ev.noParticipa || []).join(' + ') || '—') + ' | participan: ' + ((ev.participan || []).join(' + ') || '—') +
              ' | fila a nombre de: ' + (ev.figuraFila || '—') + (aNombre ? ' (!) que NO participa' : '') + ' | la marca: ' + marcas.join('; ');
    N.ejemplos.push(t);
    if (N.ejemplos.length <= COLORES_MAIL_MAX_EJEMPLOS) Logger.log('    %s', t);
  });
  Logger.log('  reuniones con "no participa": %s | con la marca AL FINAL (después del lugar): %s | con la fila a nombre de una figura que NO participa: %s',
             N.reuniones, N.alFinal, N.filaANombreDeNoParticipa);
}

// ===================== Resumen =====================

function _resumenColMail_(C) {
  const R = { lineas: [], alertas: [], errores: C.errores.slice() };
  Logger.log('=== RESUMEN de los colores del mail (últimos %s días) ===', COLORES_MAIL_DIAS);
  if (C.cuentasPaleta) {
    R.lineas.push('mails ' + C.cuentasPaleta.mails + ' | con HTML ' + C.cuentasPaleta.conHtml + ' | con color ' + C.cuentasPaleta.mailsConColor +
                  ' | reuniones resaltadas (mail × reunión) ' + C.cuentasPaleta.reuniones + ' | con texto rojo ' + C.cuentasPaleta.rojoTexto);
  }
  COLORES_MAIL_FAMILIAS.forEach(function (f) { if (C.familias[f]) { R.lineas.push(C.familias[f].linea); C.familias[f].alertas.forEach(function (a) { R.alertas.push(a); }); } });
  if (C.caso) R.lineas.push('caso ' + COLORES_MAIL_CASO.figura + ' ' + fmtFecha_(toDate_(COLORES_MAIL_CASO.fecha)) + ' ' + COLORES_MAIL_CASO.barrio + ': ' +
                            C.caso.versiones.length + ' versión(es) del mail | ' + C.caso.estadoFinal + ' | base ese día: ' + (C.caso.base.length ? 'fila(s) ' + C.caso.base.join(', ') : 'SIN FILA') +
                            ' | IDs en ' + COLORES_MAIL_CASO.barrio + ': ' + (C.caso.ids.length ? C.caso.ids.join(' / ') : 'ninguno'));
  if (C.cuentasNotas) R.lineas.push('notas: ' + C.cuentasNotas.conNota + ' mails con nota, ' + C.cuentasNotas.conPalabra + ' hablan de suspender / cancelar / cambiar el día / reprogramar / "a confirmar"');
  if (C.horaAConfirmar) R.lineas.push('"Hora: A CONFIRMAR": ' + C.horaAConfirmar.aConfirmar + ' reuniones; se parsean igual (' + C.horaAConfirmar.parsean + '), con hora "" ; claves repetidas en una versión: ' + C.horaAConfirmar.choquesDeClave);
  if (C.noParticipa) R.lineas.push('"(NO PARTICIPA)": ' + C.noParticipa.reuniones + ' reuniones; marca al final ' + C.noParticipa.alFinal + '; fila a nombre de quien no participa ' + C.noParticipa.filaANombreDeNoParticipa);
  R.lineas.forEach(function (l) { Logger.log('  %s', l); });
  if (R.alertas.length) {
    Logger.log('  (!) A MIRAR: %s', R.alertas.length);
    R.alertas.forEach(function (a) { Logger.log('      %s', a); });
  }
  Logger.log('  SECCIONES QUE FALLARON: %s%s', C.errores.length, C.errores.length ? ' — ' + C.errores.join(' | ') : '');
  return R;
}
