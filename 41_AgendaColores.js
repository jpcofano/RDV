/**
 * 41_AgendaColores.js — LOS COLORES DEL MAIL DE AGENDA (15/10, noche; AGENDA_COLORES_MAIL, APAGADO hasta ver los pasos 91 y 93).
 *
 * Quien manda la agenda RESALTA con color de fondo: VERDE = reunión agregada, AMARILLO = cambiada, ROJO = cancelada aunque siga
 * escrita (paso 90: el ROJO coincide con la Suspendida del equipo en 15 de 16 casos; en 10 de 16 la reunión sigue en el mail).
 * El parser (41_AgendaParser.js) lee getPlainBody(): el color no le llega. Acá:
 *   - la LECTURA DEL COLOR, movida de diagnostico/34_colores_mail.js (paso 90) sin cambios: el HTML a líneas con el fondo de
 *     cada letra (background-color, background, bgcolor, mso-highlight, <mark>; reglas de UNA clase en <style>), las familias
 *     por el tono, la k-ésima "Evento:" del HTML = la k-ésima reunión del parser sobre ese mismo texto. El paso 90 llama a
 *     estas mismas funciones: mide con la misma detección que usa la agenda;
 *   - lo propio de una respuesta o un reenvío en el HTML y las entidades (movidas de diagnostico/31; allá delegan acá);
 *   - lo nuevo de la agenda: el color de cada reunión de cada versión (`ev.colorMail`), las NOTAS del mail pegadas a la
 *     reunión que nombran (`ev.notasMail`, `ev.notaCancela`) y la CANCELACIÓN POR COLOR (`ev.canceladaEnMail`,
 *     `ev.canceladaEnMailMotivo`): ROJO ENTERO (Evento, Hora y Lugar) en la última versión válida de su semana + grupo;
 *   - el TIEMPO de una cancelación ("el mail manda": el mail que la cancela tiene que ser anterior a la reunión).
 * Todo puro (no lee ni escribe planillas). Lo usa `agendaDesdeListaDeMails_` sólo con `meta.coloresMail` / AGENDA_COLORES_MAIL.
 *
 * LÍMITES de la lectura del color (los del paso 90): un color puesto por id, por selector compuesto o heredado por CSS de otra
 * forma no se ve; un resaltado con una imagen o un color casi blanco (todos los canales >= 240) no cuenta; el color del TEXTO
 * (letra roja) no cuenta para "rojo entero": sólo el fondo.
 */

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
/** La marca de una línea de cita en el texto que se le pasa a `_propioDeHtmlAgenda_` (la misma que diagnostico/31). */
const COLORES_MAIL_CITA = String.fromCharCode(0xE002);

// ===================== El HTML: entidades y lo propio de una respuesta (movidas de diagnostico/31) =====================

/** Las entidades HTML (&nbsp;, &aacute;, &#225;, &#xE1;…) a texto. */
function _entidadesHtmlAgenda_(t) {
  const nombres = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó',
    uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü',
    iexcl: '¡', iquest: '¿', ordm: 'º', ordf: 'ª', deg: '°', ndash: '–', mdash: '—', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”' };
  return String(t).replace(/&(#x[0-9a-f]+|#\d+|[a-zA-Z]+);/gi, function (x, e) {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isNaN(n) ? x : String.fromCharCode(n); }
    return nombres[e] != null ? nombres[e] : x;
  });
}

/**
 * Lo propio de una respuesta o un reenvío, sobre las líneas del HTML (como `_cuerpoPropioAgenda_` con el texto plano, más
 * las citas de Outlook): en un reenvío ("Forwarded message" / "Mensaje reenviado", o un "RV:"/"Fwd:" de Outlook con su
 * bloque "De: … Enviado: …"), lo reenviado sin su encabezado; y se corta en la primera cita: la marca de cita del HTML
 * (`marca`: gmail_quote, blockquote, divRplyFwdMsg, el borde superior de Outlook, <hr>), "-----Original Message-----" /
 * "-----Mensaje original-----", una línea con ">", "El … escribió:" / "On … wrote:", o un bloque "De:/From: … Enviado:/Sent:".
 */
function _propioDeHtmlAgenda_(lineas, limpiaDe, asunto, marca) {
  const Q = marca;
  const cab = /^\s*(de|from|enviado|sent|date|fecha|para|to|cc|cco|asunto|subject)\s*:/i;
  const l = function (i) { return limpiaDe(lineas[i]); };
  const cabOutlook = function (i) {
    if (!/^\s*(de|from)\s*:/i.test(l(i))) return false;
    for (let j = i + 1; j <= i + 3 && j < lineas.length; j++) if (/^\s*(enviado|sent|date|fecha)\s*:/i.test(l(j))) return true;
    return false;
  };
  const saltarCab = function (j) {
    while (j < lineas.length && (cab.test(l(j)) || !l(j).trim())) j++;
    return j;
  };
  let ini = 0;
  const iR = lineas.findIndex(function (x, i) { return RE_REENVIO_AGENDA_.test(l(i)); });
  if (iR >= 0) ini = saltarCab(iR + 1);
  else if (/^\s*((fwd?|rv|wg|tr)\s*:)/i.test(asunto || '')) {
    for (let i = 0; i < lineas.length; i++) if (cabOutlook(i)) { ini = saltarCab(i); break; }
  }
  for (let i = ini; i < lineas.length; i++) {
    const t = l(i);
    let cita = lineas[i].indexOf(Q) >= 0 || RE_CITA_AGENDA_.some(function (re) { return re.test(t); }) || /^\s*>/.test(t) || cabOutlook(i);
    if (!cita && /^\s*(el|on)\s/i.test(t)) {
      const junto = [t, l(i + 1), l(i + 2)];
      cita = junto.some(function (x, k) { return RE_ESCRIBIO_AGENDA_.test(junto.slice(0, k + 1).join(' ')); });
    }
    if (cita) return lineas.slice(ini, i);
  }
  return lineas.slice(ini);
}

// ===================== La lectura del color (movida de diagnostico/34, paso 90) =====================

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
  if (st != null) aplicar(_entidadesHtmlAgenda_(st));
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
      const t = _entidadesHtmlAgenda_(m[4].replace(/\s+/g, ' '));
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
 * Los colores de un mail, por reunión: el HTML a líneas (en una respuesta o reenvío, sólo lo propio: `_propioDeHtmlAgenda_`),
 * línea por línea con las MISMAS reglas que `_parsearCuerpoAgenda_` (encabezado del día, "Evento:", "Hora:", "Lugar:",
 * continuación). La k-ésima línea "Evento:" es la k-ésima reunión que devuelve el parser sobre ese mismo texto. Devuelve
 * `{ evs, porReunion: Map(k → { campos: {día, Evento, Hora, Lugar, otra}, total }), fuera: [{ texto, letras }] }`.
 */
function _coloresDeMailColMail_(m) {
  let lineas = _htmlALineasColMail_(m.html);
  if (RE_RESPUESTA_AGENDA_.test(m.asunto || '')) {
    // _propioDeHtmlAgenda_ trabaja con textos: se le pasan objetos String con el índice de la línea, y devuelve un tramo
    const textos = lineas.map(function (l, i) { const s = new String((l.cita ? COLORES_MAIL_CITA : '') + _textoLineaColMail_(l)); s.i = i; return s; });
    const limpiaDe = function (x) { return String(x || '').split(COLORES_MAIL_CITA).join(''); };
    lineas = _propioDeHtmlAgenda_(textos, limpiaDe, m.asunto, COLORES_MAIL_CITA).map(function (s) { return lineas[s.i]; });
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

// ===================== La agenda: el color, las notas y la cancelación de cada reunión =====================

/** Las letras de un campo de una reunión: la línea y sus continuaciones. */
function _letrasCampoAgenda_(campos, c) {
  const x = _letrasVaciasColMail_();
  if (campos[c]) _sumarLetrasColMail_(x, campos[c]);
  if (campos[c + ' (continuación)']) _sumarLetrasColMail_(x, campos[c + ' (continuación)']);
  return x;
}

/**
 * El color de UNA reunión de un mail (`pr`: lo de `_coloresDeMailColMail_` para esa reunión, o null si no tiene ningún color):
 * `{ familia, porCampo: { día, Evento, Hora, Lugar }, entera, enteraFamilia, rojoEntero, campos }`. `familia`: la de más letras
 * de fondo; `porCampo`: la principal de cada línea (con su continuación); `entera`: Evento, Hora y Lugar con la MISMA familia en
 * al menos COLORES_MAIL_ENTERA de sus letras (sin la etiqueta); `rojoEntero`: entera y ROJO. `campos`: el texto del paso 90.
 */
function colorDeReunionAgenda_(pr) {
  const porCampo = { 'día': '', 'Evento': '', 'Hora': '', 'Lugar': '' };
  if (!pr) return { familia: '', porCampo: porCampo, entera: false, enteraFamilia: '', rojoEntero: false, campos: '' };
  const entera = {};
  ['Evento', 'Hora', 'Lugar'].forEach(function (c) {
    const x = _letrasCampoAgenda_(pr.campos, c);
    const p = _principalColMail_(x);
    porCampo[c] = p.familia;
    entera[c] = p.familia && x.total && x.fondo[p.familia] / x.total >= COLORES_MAIL_ENTERA ? p.familia : '';
  });
  if (pr.campos['día']) porCampo['día'] = _principalColMail_(pr.campos['día']).familia;
  const toda = !!entera.Evento && entera.Evento === entera.Hora && entera.Hora === entera.Lugar;
  return { familia: _principalColMail_(pr.total).familia, porCampo: porCampo, entera: toda, enteraFamilia: toda ? entera.Evento : '',
           rojoEntero: toda && entera.Evento === 'ROJO', campos: _camposTextoColMail_(pr.campos) };
}

/**
 * El color de cada reunión de UNA versión (`evs`: lo que el parser sacó del texto plano de ese mail): `ev.colorMail`. Sin HTML,
 * o si la reunión no aparece en el HTML (por su clave de base y, entre varias, su hora), `ev.colorMail = null` (no se sabe: no
 * cancela ni reactiva nada). Devuelve `{ conHtml, error }`.
 */
function coloresDeVersionAgenda_(m, evs) {
  if (!str(m.html)) { evs.forEach(function (ev) { ev.colorMail = null; }); return { conHtml: false }; }
  const n0 = _agendaTolerancia_.length;   // re-parsear el texto del HTML no suma nombres "por tolerancia" al log de la corrida
  let res;
  try { res = _coloresDeMailColMail_(m); }
  catch (err) {
    evs.forEach(function (ev) { ev.colorMail = null; });
    return { conHtml: true, error: String(err && err.message || err) };
  } finally { _agendaTolerancia_.length = n0; }
  const usados = new Set();
  evs.forEach(function (ev) {
    let k = -1;
    res.evs.forEach(function (h, i) {
      if (usados.has(i) || h.claveBase !== ev.claveBase) return;
      if (k < 0 || (h.hora === ev.hora && res.evs[k].hora !== ev.hora)) k = i;
    });
    if (k < 0) { ev.colorMail = null; return; }
    usados.add(k);
    ev.colorMail = colorDeReunionAgenda_(res.porReunion.get(k) || null);
  });
  return { conHtml: true };
}

/**
 * Las NOTAS de un mail (punto 4): del texto plano PROPIO (sin lo citado), las líneas que no son un día ni "Evento:" / "Hora:"
 * / "Lugar:" —las de arriba de la agenda ("Actualizo: SE CANCELA …") y las sueltas o pegadas a un campo— que hablan de
 * suspender, cancelar, cambiar el día o el lugar, reprogramar… (COLORES_MAIL_PALABRAS). `cancela`: dice que no se hace
 * (AGENDA_NOTA_CANCELA). No actúan solas: confirman el color en el aviso y en la auditoría.
 */
function notasDeMailAgenda_(m) {
  const reDia = /^(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s*,?\s*(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\s*[.:]?$/;
  const out = [];
  let visto = false;
  String(m.cuerpo || '').split(/\r?\n/).map(_limpiarLineaAgenda_).forEach(function (l) {
    if (!l || /^\[image:/i.test(l)) return;
    const n = normalizeText_(l);
    if (reDia.test(n)) { visto = true; return; }
    if (/^\s*(evento|hora|lugar|direcci[oó]n)\s*:/i.test(l)) return;
    const pal = (n.match(COLORES_MAIL_PALABRAS) || []).filter(function (x, i, a) { return a.indexOf(x) === i; });
    if (!pal.length) return;
    out.push({ texto: l.slice(0, 300), palabras: pal, arriba: !visto, cancela: AGENDA_NOTA_CANCELA.test(n), mailFecha: m.fecha, asunto: m.asunto || '' });
  });
  return out;
}

/** ¿La nota nombra la reunión? Por su figura (el nombre, o el apellido de 4+ letras), su comuna o su barrio. '' si no. */
function notaNombraReunionAgenda_(nota, ev) {
  const plano = function (s) { return normalizeText_(s).replace(/[^a-z0-9]+/g, ' ').trim(); };
  const t = ' ' + plano(nota.texto) + ' ';
  const figs = ev.figuras || [];
  for (let i = 0; i < figs.length; i++) {
    const n = plano(figs[i]);
    if (n && t.indexOf(' ' + n + ' ') >= 0) return 'nombra a ' + figs[i];
    const ap = n.split(' ').pop();
    if (ap && ap.length >= 4 && t.indexOf(' ' + ap + ' ') >= 0) return 'nombra a ' + figs[i] + ' (por el apellido)';
  }
  if (ev.comuna != null && detectComuna_(nota.texto) === ev.comuna) return 'nombra la Comuna ' + ev.comuna;
  if (ev.barrio && t.indexOf(' ' + plano(ev.barrio) + ' ') >= 0) return 'nombra ' + ev.barrio;
  return '';
}

/**
 * **Los colores y las notas de una semana + grupo** (lo llama `agendaDesdeListaDeMails_` con los colores prendidos): el color
 * de cada reunión de cada versión (`ev.colorMail`, con `version` y, si el mail tiene formato raro H4 y se usa igual,
 * `mailRaro`) y las notas de cada versión. Devuelve las notas por versión (para `cancelacionPorColorAgenda_`).
 */
function coloresDeSemanaAgenda_(g, parseadas, val, r) {
  const t0 = Date.now();
  r.colores = r.colores || { versionesConHtml: 0, versionesSinHtml: 0, errores: [], rojas: 0, notas: 0, ms: 0 };
  const notas = g.versiones.map(function (m, i) {
    const res = coloresDeVersionAgenda_(m, parseadas[i]);
    if (res.conHtml) r.colores.versionesConHtml++; else r.colores.versionesSinHtml++;
    if (res.error) r.colores.errores.push(str(m.asunto) + ': ' + res.error);
    const raro = val && val[i] && val[i].motivos.length ? val[i].motivos.join('; ') : '';
    parseadas[i].forEach(function (ev) { if (ev.colorMail) { ev.colorMail.version = i + 1; ev.colorMail.mailRaro = raro; } });
    return notasDeMailAgenda_(m).map(function (n) { n.version = i + 1; return n; });
  });
  r.colores.ms += Date.now() - t0;
  return notas;
}

/**
 * **La cancelación por color** de las reuniones del estado de una semana + grupo (`ultima`: de cada una, la versión de la que
 * sale —la última completa, o un "Re:" posterior que la vuelve a nombrar: un "Re:" agrega o actualiza, también el color—).
 * ROJO ENTERO en ESA versión → `ev.canceladaEnMail = true`, `ev.canceladaEnMailMotivo = 'rojo en la vN del dd/MM'`. Un rojo de
 * una versión anterior que la última ya no trae en rojo no cuenta. Las notas de esa versión y de las posteriores que nombran la
 * reunión: `ev.notasMail` (con `por`), `ev.notaCancela`.
 */
function cancelacionPorColorAgenda_(ultima, notasV, r) {
  ultima.forEach(function (ev) {
    const notas = [];
    for (let j = Math.max(0, (ev.version || 1) - 1); j < notasV.length; j++) {
      notasV[j].forEach(function (n) { const por = notaNombraReunionAgenda_(n, ev); if (por) notas.push(Object.assign({}, n, { por: por })); });
    }
    ev.notasMail = notas;
    ev.notaCancela = notas.some(function (n) { return n.cancela; });
    if (notas.length && r && r.colores) r.colores.notas++;
    if (ev.colorMail && ev.colorMail.rojoEntero) {
      ev.canceladaEnMail = true;
      ev.canceladaEnMailMotivo = 'rojo en la v' + ev.version + ' del ' + Utilities.formatDate(ev.mailFecha, RDV_TZ, 'dd/MM');
      if (r && r.colores) r.colores.rojas++;
    }
  });
}

/** Las notas de una reunión, en una línea para un aviso o el log (' | nota del mail …'), o ''. */
function notasTextoAgenda_(ev) {
  const ns = (ev && ev.notasMail) || [];
  if (!ns.length) return '';
  return ' | nota' + (ns.length > 1 ? 's' : '') + ' del mail: ' + ns.map(function (n) {
    return '"' + n.texto + '" (v' + n.version + ' del ' + Utilities.formatDate(n.mailFecha, RDV_TZ, 'dd/MM HH:mm') + ', ' + n.por + ')';
  }).join(' / ');
}

// ===================== El tiempo de una cancelación ("el mail manda") =====================

/**
 * El momento de una reunión: su fecha a la hora del mail (`ev.hora`); si el mail no trae hora, la de la fila (`horaFila`); sin
 * ninguna, el FINAL de ese día (23:59:59: un mail de ese mismo día siempre es anterior). null sin fecha.
 */
function momentoReunionAgenda_(ev, horaFila) {
  if (!ev || !ev.fecha) return null;
  const h = ev.hora || valorAgendaComparable_(horaFila, 'HORA') || '';
  const m = /^(\d{1,2}):(\d{2})$/.exec(h);
  const f = ev.fecha;
  return m ? new Date(f.getFullYear(), f.getMonth(), f.getDate(), +m[1], +m[2], 0) : new Date(f.getFullYear(), f.getMonth(), f.getDate(), 23, 59, 59);
}

/**
 * **¿El mail que la cancela es ANTERIOR a la reunión?** `{ aTiempo, mail, momento, texto }`. Sin la fecha del mail o de la
 * reunión: no (no se puede afirmar que la canceló a tiempo).
 */
function tiempoCancelacionAgenda_(mailFecha, ev, horaFila) {
  const mom = momentoReunionAgenda_(ev, horaFila);
  const fmt = function (d) { return d ? Utilities.formatDate(d, RDV_TZ, 'dd/MM HH:mm') : '—'; };
  const ok = !!(mailFecha && mom && mailFecha.getTime() < mom.getTime());
  return { aTiempo: ok, mail: mailFecha || null, momento: mom,
           texto: 'mail del ' + fmt(mailFecha) + (ok ? ' ANTERIOR a ' : ' POSTERIOR (o igual) a ') + 'la reunión (' + fmt(mom) +
                  (ev && ev.hora ? '' : (valorAgendaComparable_(horaFila, 'HORA') ? ', la hora de la fila' : ', sin hora: el final del día')) + ')' };
}
