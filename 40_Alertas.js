/**
 * 40_Alertas.js — avisar cuando un número cerrado se movió.
 *
 * `verificarCambiosRecientes_()` corre **al final del pipeline** y compara las filas recientes
 * del destino contra lo que trae B2. Si algo difiere, escribe una línea en `ALERTA_CAMBIOS`
 * (en la planilla intermedia) para que lo mire una persona.
 *
 * --- Por qué avisa en vez de corregir ---
 * Los números del sistema son **cerrados**: el formulario cierra y el total no se actualiza más
 * (CLAUDE.md 0). Entonces, si un número que ya estaba cargado aparece distinto en el origen, lo
 * más probable **no** es que el origen tenga la versión buena: es que el origen se equivocó.
 * Escribirlo encima propagaría el error en vez de detectarlo, y además pisaría carga del equipo,
 * que es lo que el invariante prohíbe.
 *
 * Por eso esta función es **sólo lectura sobre el destino**: no corrige, no escribe, no repinta.
 * Lo único que escribe es su propia solapa de alertas, en la intermedia.
 *
 * Reemplaza al `onEdit` que despintaba el `#4F81BD`, que se descartó (CLAUDE.md 0): aquel sólo
 * servía para propagar correcciones del origen, y el origen no corrige.
 *
 * --- Entry points ---
 *   verificarCambiosRecientes_()   la del pipeline (privada, no aparece en el menú de ejecución)
 *   correrAlertaCambios()          wrapper público, para correrla a mano desde el editor
 *
 * Depende de `00_Config.js`. Los helpers `_alerta` son provisorios: la Fase 2 los reemplaza por
 * los de `01_Utils.js`, que van a ser los mismos para todo el proyecto.
 */

/** Wrapper público: lo mismo, pero visible en el menú de ejecución del editor. */
function correrAlertaCambios() {
  return verificarCambiosRecientes_();
}

/**
 * Compara las filas del destino cuya **fecha de reunión** cae dentro de los últimos
 * VENTANA_ALERTA_DIAS días contra los valores de B2, y registra las diferencias.
 */
function verificarCambiosRecientes_() {
  const t0 = new Date();

  const hasta = inicioDelDia_alerta(new Date());
  const desde = new Date(hasta.getTime() - VENTANA_ALERTA_DIAS * 86400000);

  // ---------- Destino: sólo lectura ----------
  const shDest = SpreadsheetApp.openById(RDV_SS_DESTINO).getSheetByName(RDV_HOJA_DESTINO);
  if (!shDest) throw new Error('No existe la hoja "' + RDV_HOJA_DESTINO + '".');

  const nFilasDest = shDest.getLastRow();
  if (nFilasDest < 2) return { comparadas: 0, alertas: 0 };
  const bloqueDest = shDest.getRange(1, 1, nFilasDest, shDest.getLastColumn()).getValues();
  const hdrDest = bloqueDest[0];

  const columnas = ['Inscriptos', 'Masculinos', 'Femeninos',
                    '18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar',
                    'Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión'];

  const D = {
    Figura: idx_alerta(hdrDest, ['figura', 'persona', 'nombre']),
    Barrio: idx_alerta(hdrDest, ['barrio']),
    Fecha:  idx_alerta(hdrDest, ['fecha']),
    cols:   columnas.map(function (n) { return idx_alerta(hdrDest, alias_alerta(n), true); })
  };

  // ---------- B2 ----------
  const b2 = indexarB2_alerta();

  // ---------- Comparar ----------
  const nuevas = [];
  const detectado = Utilities.formatDate(new Date(), RDV_TZ, 'yyyy-MM-dd HH:mm');
  let enVentana = 0, sinContraparte = 0;

  for (let i = 1; i < bloqueDest.length; i++) {
    const r = bloqueDest[i];
    const fecha = fecha_alerta(r[D.Fecha]);
    if (!fecha || fecha < desde || fecha > hasta) continue;

    const clave = clave_alerta(r[D.Figura], r[D.Barrio], fecha);
    if (!clave) continue;

    enVentana++;
    const reg = b2.get(clave);
    if (!reg) { sinContraparte++; continue; }

    for (let c = 0; c < columnas.length; c++) {
      const nombre = columnas[c];
      if (D.cols[c] == null) continue;

      const crudoDestino = r[D.cols[c]];
      if (vacio_alerta(crudoDestino)) continue;   // el hueco lo llena el upsert, no es un cambio

      const vDestino = numero_alerta(crudoDestino);
      const vOrigen = reg[nombre];

      /*
       * Un 0 en B2 se saltea. Hoy `num()` convierte vacío en cero en todo el legado
       * (CLAUDE.md 0.a), así que "B2 trae 0" y "B2 no trajo nada" son indistinguibles, y
       * alertar sobre eso llenaría la solapa de falsos positivos.
       * Cuando la Fase 2 haga que vacío se propague como vacío, este guard pasa a ser
       * `if (vOrigen === '' || vOrigen == null) continue;` y un 0 real sí va a alertar.
       */
      if (!(vOrigen > 0)) continue;
      if (vDestino === vOrigen) continue;

      nuevas.push([clave, nombre, vDestino, vOrigen, vDestino - vOrigen, detectado]);
    }
  }

  const escritas = registrarAlertas_alerta(nuevas);

  Logger.log('=== verificarCambiosRecientes_ ===');
  Logger.log('Ventana: %s → %s (%s días, sobre la fecha de reunión)',
             Utilities.formatDate(desde, RDV_TZ, 'dd/MM/yyyy'),
             Utilities.formatDate(hasta, RDV_TZ, 'dd/MM/yyyy'), VENTANA_ALERTA_DIAS);
  Logger.log('Filas del destino en la ventana: %s (sin contraparte en B2: %s)',
             enVentana, sinContraparte);
  Logger.log('Diferencias detectadas: %s | nuevas en %s: %s | ya estaban: %s',
             nuevas.length, RDV_HOJA_ALERTAS, escritas, nuevas.length - escritas);
  if (escritas) {
    Logger.log('>>> Hay %s alertas nuevas. Un número cerrado se movió: lo más probable es un ' +
               'error del origen. NO se corrigió nada — lo tiene que mirar una persona.', escritas);
  }
  Logger.log('%s ms', new Date() - t0);

  return { enVentana: enVentana, sinContraparte: sinContraparte,
           diferencias: nuevas.length, alertasNuevas: escritas };
}

// ===================== Internas =====================

/** Índice clave natural → valores de B2, para las columnas que se comparan. */
function indexarB2_alerta() {
  const sh = SpreadsheetApp.openById(RDV_SS_INTERMEDIA).getSheetByName(RDV_HOJA_B2);
  if (!sh) throw new Error('No existe la hoja "' + RDV_HOJA_B2 + '".');

  const nFilas = sh.getLastRow();
  const porClave = new Map();
  if (nFilas < 2) return porClave;

  const bloque = sh.getRange(1, 1, nFilas, sh.getLastColumn()).getValues();
  const hdr = bloque[0];

  const B = {
    Persona: idx_alerta(hdr, ['persona', 'figura', 'nombre']),
    BarrioN: idx_alerta(hdr, ['barrion']),
    Fecha:   idx_alerta(hdr, ['fecha']),
    Ins:     idx_alerta(hdr, ['inscriptos', 'inscritos'], true),
    Masc:    idx_alerta(hdr, ['masculino', 'masculinos'], true),
    Fem:     idx_alerta(hdr, ['femenino', 'femeninos'], true),
    Mail:    idx_alerta(hdr, ['mail', 'mailing', 'email'], true),
    Call:    idx_alerta(hdr, ['call center', 'callcenter'], true),
    IVR:     idx_alerta(hdr, ['ivr'], true),
    RRSS:    idx_alerta(hdr, ['rrss'], true),
    FB:      idx_alerta(hdr, ['facebook'], true),
    GG:      idx_alerta(hdr, ['google'], true),
    PR:      idx_alerta(hdr, ['programmatic'], true),
    Dif:     idx_alerta(hdr, ['difusión', 'difusion'], true),
    edades:  ['18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar']
               .map(function (n) { return idx_alerta(hdr, [n], true); })
  };

  const leer = function (r, i) { return i != null ? numero_alerta(r[i]) : 0; };

  for (let i = 1; i < bloque.length; i++) {
    const r = bloque[i];
    const clave = clave_alerta(r[B.Persona], r[B.BarrioN], fecha_alerta(r[B.Fecha]));
    if (!clave) continue;

    // RRSS: la columna si tiene valor, si no la suma Facebook + Google + Programmatic,
    // igual que el upsert legado.
    let rrss;
    if (B.RRSS != null && !vacio_alerta(r[B.RRSS])) rrss = numero_alerta(r[B.RRSS]);
    else rrss = leer(r, B.FB) + leer(r, B.GG) + leer(r, B.PR);

    const reg = {
      'Inscriptos': leer(r, B.Ins),
      'Masculinos': leer(r, B.Masc),
      'Femeninos':  leer(r, B.Fem),
      'Mail':        leer(r, B.Mail),
      'Call Center': leer(r, B.Call),
      'IVR':         leer(r, B.IVR),
      'RRSS':        rrss,
      'Difusión':    leer(r, B.Dif)
    };
    ['18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar'].forEach(function (n, k) {
      reg[n] = leer(r, B.edades[k]);
    });

    // Si la clave se repite, gana la fila con datos (B2 tiene 14 claves duplicadas hoy).
    const previo = porClave.get(clave);
    if (!previo || (previo['Inscriptos'] === 0 && reg['Inscriptos'] > 0)) porClave.set(clave, reg);
  }

  return porClave;
}

/**
 * Agrega las alertas nuevas a ALERTA_CAMBIOS, en la intermedia. Es un log: no se limpia, se
 * acumula, porque importa cuándo se detectó cada cosa. Se saltean las que ya están con la misma
 * clave, columna y par de valores, para que correr el pipeline todos los días no la llene de
 * repetidos de la misma diferencia.
 */
function registrarAlertas_alerta(nuevas) {
  if (!nuevas.length) return 0;

  const encabezado = ['clave', 'columna', 'valor_destino', 'valor_origen', 'diferencia',
                      'fecha_deteccion'];
  const ss = SpreadsheetApp.openById(RDV_SS_INTERMEDIA);
  let sh = ss.getSheetByName(RDV_HOJA_ALERTAS);

  const yaEstan = {};
  if (!sh) {
    sh = ss.insertSheet(RDV_HOJA_ALERTAS);
    sh.getRange(1, 1, 1, encabezado.length).setValues([encabezado]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, encabezado.length).setFontWeight('bold');
  } else if (sh.getLastRow() > 1) {
    const previas = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
    for (let i = 0; i < previas.length; i++) {
      yaEstan[previas[i].join('\u0001')] = true;
    }
  }

  const aEscribir = nuevas.filter(function (a) {
    return !yaEstan[[a[0], a[1], a[2], a[3]].join('\u0001')];
  });
  if (!aEscribir.length) return 0;

  sh.getRange(sh.getLastRow() + 1, 1, aEscribir.length, encabezado.length).setValues(aEscribir);
  return aEscribir.length;
}

// ===================== Helpers provisorios (Fase 2 → 01_Utils.js) =====================

function vacio_alerta(v) {
  return v == null || String(v).trim() === '';
}

function numero_alerta(v) {
  if (vacio_alerta(v)) return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).trim().replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function normTexto_alerta(s) {
  return String(s == null ? '' : s)
    .replace(/[ ​‌‍﻿]/g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function normHeader_alerta(s) {
  return String(s == null ? '' : s)
    .replace(/["']/g, '').replace(/\n/g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function idx_alerta(headers, candidatos, opcional) {
  const norm = headers.map(normHeader_alerta);
  for (let i = 0; i < candidatos.length; i++) {
    const j = norm.indexOf(normHeader_alerta(candidatos[i]));
    if (j !== -1) return j;
  }
  if (opcional) return null;
  throw new Error('No se encontró ninguna de estas columnas: ' + candidatos.join(' | '));
}

function alias_alerta(nombre) {
  if (nombre === 'Mail')        return ['mail', 'mailing', 'email'];
  if (nombre === 'Call Center') return ['call center', 'callcenter'];
  if (nombre === 'Difusión')    return ['difusión', 'difusion'];
  if (nombre === 'Inscriptos')  return ['inscriptos', 'inscritos'];
  if (nombre === 'Masculinos')  return ['masculinos', 'masculino'];
  if (nombre === 'Femeninos')   return ['femeninos', 'femenino'];
  return [nombre];
}

/** Día primero y explícito, a las 12:00 locales. Nunca `new Date(string)` (CLAUDE.md 3.1.c). */
function fecha_alerta(v) {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12, 0, 0);
  }
  if (vacio_alerta(v) || typeof v === 'number') return null;

  const s = String(v).trim();
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/.exec(s);
  if (dmy) {
    const d = parseInt(dmy[1], 10), mo = parseInt(dmy[2], 10);
    let y = dmy[3] ? parseInt(dmy[3], 10) : new Date().getFullYear();
    if (y < 100) y += 2000;
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return new Date(y, mo - 1, d, 12, 0, 0);
  }
  const ymd = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/.exec(s);
  if (ymd) {
    const y = parseInt(ymd[1], 10), mo = parseInt(ymd[2], 10), d = parseInt(ymd[3], 10);
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return new Date(y, mo - 1, d, 12, 0, 0);
  }
  return null;
}

function inicioDelDia_alerta(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
}

function clave_alerta(figura, barrio, fecha) {
  const f = normTexto_alerta(figura);
  const b = normTexto_alerta(barrio);
  if (!f || !b || !fecha) return '';
  return f + '|' + b + '|' + Utilities.formatDate(fecha, RDV_TZ, 'yyyyMMdd');
}
